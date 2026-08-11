"""엘리트 몹 스프라이트 4종 — 공격 패턴별로 실루엣이 다르게 설계.
  row0 charger     = 돌격자   (뿔투구 + 방패, 앞으로 숙임 / 붉은 눈·붉은 림)
  row1 bombardier  = 포격수   (어깨 위 사선 박격포 + 폭탄 주머니 / 주황)
  row2 scattershot = 산탄사수 (가로로 넓은 다연발 쇠뇌 / 청록)
  row3 warden      = 수호자   (지팡이 + 떠 있는 오브 + 등 깃발 / 보라)

출력: elites_sheet.png (4행 × 4프레임, 셀 48×48, 알파)

일반 몹(32×32)과 구분되는 공통 표식 — 어떤 패턴이든 "엘리트"임이 먼저 읽혀야 한다:
  ① 갑옷 몸통 + 어깨 보호구(pauldron)   ② 금색 트림
  ③ 더 큰 셀(48) → 화면에서 확실히 크다  ④ 패턴별 accent 색으로 외곽 림
림을 패턴 색으로 칠하는 게 핵심이다. 작게 보여도 색만으로 어떤 패턴인지 구분된다.
"""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

CELL = 48
FRAMES = 4

# 공통 팔레트 — 일반 고블린보다 어둡고 금속질
SKIN = (98, 140, 70);   SKIN_D = (66, 100, 48)
ARMOR = (74, 82, 96);   ARMOR_D = (48, 54, 66);  ARMOR_L = (106, 116, 132)
GOLD = (214, 176, 74);  GOLD_D = (152, 122, 48)
WOOD = (150, 112, 66);  WOOD_D = (104, 76, 44)
LEATHER = (92, 70, 52)
STRING = (216, 226, 220)
OUTLINE = (14, 18, 24)

# 패턴별 accent (눈 + 외곽 림) — 색 하나로 위협 종류를 읽게 한다
ACCENT = {
    'charger':    (236, 96, 80),
    'bombardier': (242, 152, 64),
    'scattershot': (110, 214, 206),
    'warden':     (192, 142, 244),
}


def px(d, x, y, w, h, c):
    d.rectangle([x, y, x + w - 1, y + h - 1], fill=c)


def base_body(d, f, accent, lean=0):
    """갑옷 입은 엘리트 고블린 공통 몸통.
    몸통은 **좁게**(14px) 유지한다 — 패턴별 장비가 실루엣을 지배해야 구분이 된다.
    금색은 작은 포인트로만 쓴다(넓은 밴드로 쓰면 4종이 다 같아 보인다)."""
    bob = [0, -1, 0, 1][f]
    sw = [0, 1, 0, -1][f]
    y = 10 + bob + lean

    # 뾰족 귀 (고블린 계열임을 유지)
    px(d, 12, y + 5, 4, 3, SKIN_D)
    px(d, 32, y + 5, 4, 3, SKIN_D)

    # 투구 (좁게)
    px(d, 16, y, 16, 5, ARMOR)
    px(d, 16, y + 4, 16, 2, ARMOR_D)

    # 얼굴 — 깊은 그늘 + accent 눈 (가장 강한 식별 지점이라 크게)
    px(d, 17, y + 5, 14, 8, (30, 40, 30))
    px(d, 18, y + 10, 12, 3, SKIN)                 # 턱만 살짝 보이게
    px(d, 19, y + 6, 4, 4, accent)
    px(d, 25, y + 6, 4, 4, accent)

    # 몸통 갑옷 (좁게)
    px(d, 17, y + 13, 14, 12, ARMOR)
    px(d, 17, y + 21, 14, 4, ARMOR_D)
    px(d, 22, y + 15, 4, 4, GOLD_D)                # 가슴 문장(작게)

    # 어깨 보호구 — 엘리트 공통 표식. 금색은 스터드 두 점만.
    px(d, 12, y + 12, 6, 5, ARMOR_L)
    px(d, 30, y + 12, 6, 5, ARMOR_L)
    px(d, 14, y + 13, 2, 2, GOLD)
    px(d, 32, y + 13, 2, 2, GOLD)

    # 다리 (교차 스윙)
    px(d, 18, y + 25, 5, 7 + (1 if sw > 0 else 0), ARMOR_D)
    px(d, 25, y + 25, 5, 7 + (1 if sw < 0 else 0), ARMOR_D)
    px(d, 17, y + 31, 7, 3, (38, 42, 52))          # 발
    px(d, 24, y + 31, 7, 3, (38, 42, 52))
    return y, sw, 24


# ---------- 돌격자 — 뿔 + 방패 (예고 후 직선 돌진) ----------
# 실루엣 목표: "뿔 달린 벽". 좌우로 가장 넓고, 위로는 낮다.
def charger(d, f):
    a = ACCENT['charger']
    # 돌진 준비 프레임(2,3)에서 숙인다 → 돌진 예고가 스프라이트로도 읽힌다
    lean = 2 if f in (2, 3) else 0
    y, sw, _ = base_body(d, f, a, lean)
    # 뿔 — 투구 밖으로 크게 뻗는다(실루엣 핵심)
    px(d, 13, y - 1, 4, 3, (226, 220, 200))
    px(d, 9, y - 4, 4, 4, (226, 220, 200))
    px(d, 7, y - 7, 3, 4, (196, 190, 172))
    px(d, 31, y - 1, 4, 3, (226, 220, 200))
    px(d, 35, y - 4, 4, 4, (226, 220, 200))
    px(d, 38, y - 7, 3, 4, (196, 190, 172))
    # 대형 방패 (왼쪽) — 몸통보다 두껍게
    sx = 2 + (1 if lean else 0)
    px(d, sx, y + 9, 10, 20, ARMOR_L)
    px(d, sx, y + 9, 10, 2, ARMOR)
    px(d, sx, y + 27, 10, 2, ARMOR_D)
    px(d, sx + 3, y + 16, 4, 6, a)                 # 방패 문양 = accent
    # 오른팔 주먹 (반대편으로 뻗어 비대칭 유지)
    px(d, 36, y + 18 + sw, 6, 6, SKIN)
    px(d, 40, y + 19 + sw, 3, 4, ARMOR_L)


# ---------- 포격수 — 위로 솟은 박격포 (지면 예고 폭발) ----------
# 실루엣 목표: "굴뚝 달린 놈". 오른쪽 위로 길게 솟아 4종 중 가장 높다.
def bombardier(d, f):
    a = ACCENT['bombardier']
    y, sw, _ = base_body(d, f, a)
    # 세로로 솟은 포신 — 셀 위쪽까지 올라간다
    px(d, 32, y - 9, 8, 22, ARMOR)
    px(d, 32, y - 9, 3, 22, ARMOR_L)               # 왼쪽 하이라이트
    px(d, 31, y - 11, 10, 3, ARMOR_D)              # 포구 테
    px(d, 33, y + 8, 6, 4, GOLD_D)                 # 받침 링
    # 장전 프레임(2,3): 포구에서 불씨 + 예고 연기
    if f in (2, 3):
        px(d, 34, y - 14, 4, 3, a)
        px(d, 35, y - 17, 2, 3, (255, 240, 200))
    # 폭탄 주머니 (왼쪽 허리) — 반대쪽 무게
    px(d, 8, y + 18, 9, 9, LEATHER)
    px(d, 8, y + 18, 9, 2, WOOD_D)
    px(d, 10, y + 21, 4, 4, a)                     # 삐져나온 폭탄
    px(d, 14, y + 23, 3, 3, a)
    # 왼팔
    px(d, 13, y + 15 + sw, 4, 5, SKIN)


# ---------- 산탄사수 — 부채꼴로 벌어진 볼트 (다중 발사체) ----------
# 실루엣 목표: "부채". 몸은 좁게 두고 볼트가 위로 퍼지게 → 다중 발사가 바로 읽힌다.
def scattershot(d, f):
    a = ACCENT['scattershot']
    y, sw, _ = base_body(d, f, a)
    # 고글 (원거리 식별) — 얼굴 위에 덧그림
    px(d, 17, y + 5, 14, 4, (52, 60, 72))
    px(d, 19, y + 6, 4, 3, a)
    px(d, 25, y + 6, 4, 3, a)
    # 쇠뇌 본체 — 몸 앞으로 짧게(가로로 몸을 덮지 않게)
    by = y + 17 + (1 if f in (2, 3) else 0)
    px(d, 14, by, 20, 4, WOOD)
    px(d, 14, by + 3, 20, 2, WOOD_D)
    px(d, 12, by - 2, 3, 8, WOOD_D)
    px(d, 33, by - 2, 3, 8, WOOD_D)
    px(d, 14, by + 5, 20, 1, STRING)
    # 볼트 5발이 **부채꼴로** 뻗음 — 발사 프레임에서 더 벌어진다
    spread = 1 if f in (2, 3) else 0
    for k, bx in enumerate((15, 19, 23, 27, 31)):
        off = (k - 2)                              # -2..2
        tipx = bx + off * spread
        px(d, tipx, by - 6, 2, 5, ARMOR_L)
        px(d, tipx, by - 8 - abs(off), 2, 3, a)
    # 양손
    px(d, 16, by - 1, 5, 4, SKIN)
    px(d, 28, by - 1, 5, 4, SKIN)


# ---------- 수호자 — 깃발 + 떠 있는 오브 (주변 강화 오라) ----------
# 실루엣 목표: "기수". 머리 위로 깃발이 솟아 4종 중 가장 눈에 먼저 띈다.
def warden(d, f):
    a = ACCENT['warden']
    bob = [0, -1, 0, 1][f]
    fy = 10 + bob
    # 깃발을 먼저(몸 뒤에) — 머리보다 위로 솟는다
    px(d, 9, fy - 9, 3, 34, WOOD_D)                # 긴 깃대
    px(d, 11, fy - 8, 11, 13, (104, 66, 132))      # 깃면
    px(d, 11, fy - 8, 11, 2, GOLD_D)
    px(d, 11, fy + 3, 11, 2, (72, 46, 94))
    px(d, 14, fy - 4, 5, 5, a)                     # 문장
    px(d, 8, fy - 12, 5, 3, GOLD)                  # 깃대 끝 장식

    y, sw, _ = base_body(d, f, a)
    # 지팡이 (오른쪽, 짧게 — 오브가 주인공)
    px(d, 34, y + 6, 3, 22, WOOD)
    # 떠 있는 오브 — 프레임마다 상하로 흔들려 "발동 중"이 읽힌다
    oy = y - 2 + [0, -3, 0, 3][f]
    px(d, 31, oy, 10, 8, a)
    px(d, 33, oy + 2, 6, 4, (244, 232, 255))
    px(d, 29, oy + 3, 2, 3, a)                     # 좌우 잔광
    px(d, 41, oy + 3, 2, 3, a)
    px(d, 35, oy - 2, 2, 2, a)
    # 오라 시전 손
    px(d, 31, y + 17 + sw, 5, 5, SKIN)


DRAW = {'charger': charger, 'bombardier': bombardier,
        'scattershot': scattershot, 'warden': warden}
ROWS = ['charger', 'bombardier', 'scattershot', 'warden']


def outline(img, rim_color):
    """안쪽 어두운 라인 + 바깥 **패턴 색** 림.
    림을 accent 색으로 칠하는 게 엘리트 식별의 핵심 — 작아도 색으로 읽힌다."""
    a = img.split()[3].point(lambda p: 255 if p > 60 else 0)
    grow1 = a.filter(ImageFilter.MaxFilter(3))
    ring_dark = Image.fromarray(
        np.array(grow1).astype(np.int16) - np.array(a).astype(np.int16))
    grow2 = grow1.filter(ImageFilter.MaxFilter(3))
    ring_rim = Image.fromarray(
        np.array(grow2).astype(np.int16) - np.array(grow1).astype(np.int16))
    grow3 = grow2.filter(ImageFilter.MaxFilter(3))
    ring_glow = Image.fromarray(
        np.array(grow3).astype(np.int16) - np.array(grow2).astype(np.int16))

    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    glow = Image.new('RGBA', img.size, rim_color + (70,))     # 옅은 외곽 발광
    rim = Image.new('RGBA', img.size, rim_color + (200,))     # 진한 색 림
    dark = Image.new('RGBA', img.size, OUTLINE + (235,))
    out.paste(glow, (0, 0), ring_glow.convert('L'))
    out.paste(rim, (0, 0), ring_rim.convert('L'))
    out.paste(dark, (0, 0), ring_dark.convert('L'))
    return Image.alpha_composite(out, img)


sheet = Image.new('RGBA', (CELL * FRAMES, CELL * len(ROWS)), (0, 0, 0, 0))
for r, name in enumerate(ROWS):
    for f in range(FRAMES):
        cell = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
        DRAW[name](ImageDraw.Draw(cell), f)
        cell = outline(cell, ACCENT[name])
        sheet.paste(cell, (f * CELL, r * CELL), cell)
sheet.save('elites_sheet.png')

for r, name in enumerate(ROWS):
    sheet.crop((0, r * CELL, CELL * FRAMES, r * CELL + CELL)).save(f'elite_{name}.png')

# ---- 미리보기: 실제 바닥 + 일반 몹과 나란히 놓아 크기·구분 확인 ----
try:
    floor = Image.open('tileset_iso_stone.png').convert('RGBA')
    normals = Image.open('enemies_sheet.png').convert('RGBA')
    PW = CELL * FRAMES * 2 + 220
    PH = CELL * len(ROWS) * 2 + 40
    bg = Image.new('RGBA', (PW, PH), (18, 22, 28, 255))
    tile = floor.crop((0, 0, 128, 64))
    for yy in range(0, PH + 64, 32):
        for xx in range(0, PW + 128, 64):
            bg.alpha_composite(tile, (xx - 32, yy - 16))
    big = sheet.resize((sheet.size[0] * 2, sheet.size[1] * 2), Image.NEAREST)
    bg.alpha_composite(big, (20, 20))
    # 오른쪽에 일반 몹 3종을 같은 배율로 — 크기 차이를 눈으로 비교
    nb = normals.resize((normals.size[0] * 2, normals.size[1] * 2), Image.NEAREST)
    bg.alpha_composite(nb, (big.size[0] + 40, 30))
    d = ImageDraw.Draw(bg)
    d.text((big.size[0] + 40, 8), 'normal (32px)', fill=(150, 170, 190))
    d.text((20, 4), 'elite (48px)  charger / bombardier / scattershot / warden',
           fill=(150, 170, 190))
    bg.convert('RGB').save('_elites_preview.png')
except Exception as e:
    print('preview skip', e)

print('done', sheet.size, ROWS)
