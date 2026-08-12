"""바닥 4종 × 실제 스프라이트 얹어 비교 — "적이 묻히는지"를 눈으로 판단하기 위한 유일한 기준.

수치(국소 대비)만으로는 판단이 안 된다. 32px 고블린이 바닥 무늬에 섞이는지는
실제로 얹어봐야 보인다. 기존 타일셋에서 "그물망 같다"고 지적받은 게
바로 이 검증을 안 하고 넘어갔기 때문이다.

게임과 동일한 조건을 재현한다:
  · 좌표 해시로 타일 변형 선택 + 좌우 반전 (main.js updateBackground 와 같은 방식)
  · 스프라이트 배율: 적 r10 × 0.11 = 1.1 / 엘리트 r16 × 0.075 = 1.2 / 플레이어 r10 × 0.055
  · 발밑 그림자, 상하 비네트

실행: python3 tools/sprites/compare_floor_with_actors.py
출력: tools/sprites/_floor_actors_compare.png
"""
import pathlib

import numpy as np
from PIL import Image, ImageDraw

HERE = pathlib.Path(__file__).resolve().parent
PUB = HERE.parent.parent / 'public' / 'sprites' / 'dungeon'
TW, TH = 128, 64

# main.js 와 동일한 배율 상수
ENEMY_K, ELITE_K, PLAYER_K = 0.11, 0.075, 0.055
ENEMY_R, ELITE_R, PLAYER_R = 10, 16, 10


def strip(path, n, cw, ch=None, row=0):
    im = Image.open(path).convert('RGBA')
    ch = ch or cw
    return [im.crop((i * cw, row * ch, (i + 1) * cw, (row + 1) * ch)) for i in range(n)]


def scaled(im, k, r):
    """게임과 같은 배율로 확대. NEAREST 로 픽셀을 살린다."""
    s = k * r
    return im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.NEAREST)


# --- 배우들 ---
goblin = scaled(strip(PUB / 'enemies_sheet.png', 4, 32)[0], ENEMY_K, ENEMY_R)
hound = scaled(strip(PUB / 'enemies_sheet.png', 4, 32, row=1)[0], ENEMY_K, ENEMY_R)
archer = scaled(strip(PUB / 'enemies_sheet.png', 4, 32, row=2)[0], ENEMY_K, ENEMY_R)
elites = [scaled(strip(PUB / 'elites_sheet.png', 4, 48, row=r)[0], ELITE_K, ELITE_R)
          for r in range(4)]
# 플레이어 시트: 96×116 셀, 8열 — 첫 행 첫 칸(정면 대기)
pl = Image.open(PUB / 'deliverables' / 'player_spritesheet.png').convert('RGBA')
player = scaled(pl.crop((0, 0, 96, 116)), PLAYER_K, PLAYER_R)

# --- 바닥 세트 ---
def load_tiles(path):
    im = Image.open(path).convert('RGBA')
    n = im.width // TW
    return [im.crop((i * TW, 0, (i + 1) * TW, TH)) for i in range(n)]


FLOORS = [
    ('CURRENT', load_tiles(PUB / 'tileset_iso_stone.png')),
    ('1_full', load_tiles(HERE / 'tileset_iso_gemini_1_full.png')),
    ('2_toned', load_tiles(HERE / 'tileset_iso_gemini_2_toned.png')),
    ('3_calm', load_tiles(HERE / 'tileset_iso_gemini_3_calm.png')),
]

COLS, ROWS = 9, 12
PW = TW * COLS
PH = int(TH * (ROWS + COLS) / 2) + TH


def build(tiles):
    img = Image.new('RGBA', (PW, PH), (14, 16, 18, 255))
    # 바닥 — main.js 와 같은 좌표 해시
    for r in range(ROWS):
        for c in range(COLS):
            hv = ((c * 73856093) ^ (r * 19349663)) & 0xFFFFFFFF
            t = tiles[hv % len(tiles)]
            if (hv >> 8) & 1:
                t = t.transpose(Image.FLIP_LEFT_RIGHT)
            img.alpha_composite(t, (int((c - r) * TW / 2) + PW // 2 - TW // 2,
                                    int((c + r) * TH / 2)))

    # 배우 배치 — 화면 중앙에 플레이어, 주변에 적을 흩뿌린다
    d = ImageDraw.Draw(img)
    cxp, cyp = PW // 2, PH // 2

    def put(sp, x, y, shadow=True):
        if shadow:
            rr = sp.width * 0.42
            d.ellipse([x - rr, y - rr * 0.34, x + rr, y + rr * 0.34], fill=(0, 0, 0, 110))
        img.alpha_composite(sp, (int(x - sp.width / 2), int(y - sp.height * 0.72)))

    # 일반 몹 — 여러 위치에 흩뿌려 "묻히는 자리"가 있는지 본다
    spots = [(-190, -120), (-70, -180), (95, -140), (200, -60), (-230, 10),
             (-120, 70), (60, 40), (185, 110), (-60, 165), (110, 190), (-200, 130)]
    kinds = [goblin, hound, archer]
    for i, (dx, dy) in enumerate(spots):
        put(kinds[i % 3], cxp + dx, cyp + dy)

    # 엘리트 4종
    for i, (dx, dy) in enumerate([(-160, -50), (150, -10), (-30, -80), (30, 120)]):
        put(elites[i], cxp + dx, cyp + dy)

    # 플레이어 (중앙)
    put(player, cxp, cyp)

    # 상하 비네트 — 게임 화면과 같은 조건
    v = Image.new('RGBA', (PW, PH), (0, 0, 0, 0))
    vd = ImageDraw.Draw(v)
    for i in range(90):
        a = int(150 * (1 - i / 90) ** 1.6)
        vd.line([(0, i), (PW, i)], fill=(6, 7, 10, a))
        vd.line([(0, PH - 1 - i), (PW, PH - 1 - i)], fill=(6, 7, 10, a))
    return Image.alpha_composite(img, v)


PAD, LAB = 14, 26
panels = [(n, build(t)) for n, t in FLOORS]
pw, ph = panels[0][1].size
sheet = Image.new('RGB', (PAD + (pw + PAD) * len(panels), PAD + LAB + ph + PAD), (12, 13, 15))
d = ImageDraw.Draw(sheet)
for i, (n, p) in enumerate(panels):
    x = PAD + (pw + PAD) * i
    d.text((x + 4, PAD + 4), n, fill=(180, 195, 185))
    sheet.paste(p.convert('RGB'), (x, PAD + LAB))
sheet.save(HERE / '_floor_actors_compare.png')
print(f'saved _floor_actors_compare.png  {sheet.size}')

# --- 가독성 수치: 스프라이트와 바로 뒤 바닥의 밝기 차이 ---
# 차이가 작으면 눈으로도 묻힌다. 이게 "국소 대비"보다 직접적인 지표다.
print()
print(f'{"":10s}{"바닥평균":>9}{"고블린 대비":>12}{"엘리트 대비":>12}')
gob_l = np.asarray(goblin.convert('L'), float)[np.asarray(goblin)[:, :, 3] > 128].mean()
eli_l = np.asarray(elites[0].convert('L'), float)[np.asarray(elites[0])[:, :, 3] > 128].mean()
for n, tiles in FLOORS:
    fl = np.mean([np.asarray(t.convert('L'), float)[np.asarray(t)[:, :, 3] > 128].mean()
                  for t in tiles])
    print(f'{n:10s}{fl:9.1f}{abs(gob_l - fl):12.1f}{abs(eli_l - fl):12.1f}')
print(f'\n(고블린 평균밝기 {gob_l:.1f} / 엘리트 {eli_l:.1f} — 바닥과 차이가 클수록 잘 보인다)')
