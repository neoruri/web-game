"""3_calm 바닥 타일을 단계별로 어둡게 — 실제 스프라이트를 얹어 비교.

요청: "다른 건 바꾸지 말고 전체적으로 좀 더 어둡게".
그래서 3_calm 스트립만 읽어 명도만 내린다. 질감·형태·변형 수는 그대로.

⚠️ 단순 곱셈(×0.7)으로 어둡게 하면 **대비가 같이 줄어** 탁해진다.
   (밝기 차이도 0.7배가 되므로 디테일이 평평해짐)
   → 감마로 중간톤을 눌러 어둡게 하고, 대비를 조금 되올려 형태를 유지한다.

실행: python3 tools/sprites/darken_floor.py
출력: tools/sprites/_floor_dark_compare.png       (스프라이트 얹은 비교)
      tools/sprites/tileset_iso_dark_D{1,2,3}.png (적용은 아직 안 함)
"""
import pathlib

import numpy as np
from PIL import Image, ImageDraw

HERE = pathlib.Path(__file__).resolve().parent
PUB = HERE.parent.parent / 'public' / 'sprites' / 'dungeon'
TW, TH = 128, 64
BASE = HERE / 'tileset_iso_gemini_3_calm.png'


def load_strip(path):
    im = Image.open(path).convert('RGBA')
    return [im.crop((i * TW, 0, (i + 1) * TW, TH)) for i in range(im.width // TW)]


def darken(tile, gamma, contrast):
    """감마로 어둡게 + 대비 보정. 알파는 그대로 둔다(다이아몬드 모양 유지)."""
    a = np.asarray(tile, float)
    rgb, alpha = a[..., :3], a[..., 3:]
    x = rgb / 255.0
    x = x ** gamma                                  # 감마 > 1 → 중간톤이 크게 어두워짐
    m = x[alpha[..., 0] > 128].mean() if (alpha > 128).any() else x.mean()
    x = (x - m) * contrast + m                      # 줄어든 대비를 되올린다
    return Image.fromarray(
        np.dstack([np.clip(x * 255, 0, 255), alpha]).astype(np.uint8), 'RGBA')


base = load_strip(BASE)
# gamma / contrast — 3단계. 대비는 어두워진 만큼 조금씩 더 올린다.
# D1 과 D2 사이 중간값(D1.5)을 추가 — 감마·대비 모두 중앙값으로.
# D3(많이)는 이미 탈락했으므로 목록에서 뺐다(국소대비 1.60까지 떨어져 기존 타일셋 수준).
LEVELS = [
    ('D1   살짝', 1.28, 1.10),
    ('D1.5 중간값', 1.45, 1.15),
    ('D2   중간', 1.62, 1.20),
]
sets = [('3_calm  (기준)', base)]
for name, gm, ct in LEVELS:
    sets.append((name, [darken(t, gm, ct) for t in base]))

for (name, tiles), key in zip(sets[1:], ('D1', 'D15', 'D2')):
    strip = Image.new('RGBA', (TW * len(tiles), TH), (0, 0, 0, 0))
    for i, t in enumerate(tiles):
        strip.paste(t, (i * TW, 0), t)
    strip.save(HERE / f'tileset_iso_dark_{key}.png')

# ---------- 실제 스프라이트 얹기 (compare_floor_with_actors.py 와 같은 조건) ----------
ENEMY_K, ELITE_K, PLAYER_K = 0.11, 0.075, 0.055
ENEMY_R, ELITE_R, PLAYER_R = 10, 16, 10


def cell(path, i, cw, row=0):
    im = Image.open(path).convert('RGBA')
    return im.crop((i * cw, row * cw, (i + 1) * cw, (row + 1) * cw))


def scaled(im, k, r):
    s = k * r
    return im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.NEAREST)


kinds = [scaled(cell(PUB / 'enemies_sheet.png', 0, 32, row=r), ENEMY_K, ENEMY_R)
         for r in range(3)]
elites = [scaled(cell(PUB / 'elites_sheet.png', 0, 48, row=r), ELITE_K, ELITE_R)
          for r in range(4)]
pl = Image.open(PUB / 'deliverables' / 'player_spritesheet.png').convert('RGBA')
player = scaled(pl.crop((0, 0, 96, 116)), PLAYER_K, PLAYER_R)

COLS, ROWS = 7, 9
PW = TW * COLS
PH = int(TH * (ROWS + COLS) / 2) + TH


def build(tiles):
    img = Image.new('RGBA', (PW, PH), (10, 11, 13, 255))
    for r in range(ROWS):
        for c in range(COLS):
            hv = ((c * 73856093) ^ (r * 19349663)) & 0xFFFFFFFF
            t = tiles[hv % len(tiles)]
            if (hv >> 8) & 1:
                t = t.transpose(Image.FLIP_LEFT_RIGHT)
            img.alpha_composite(t, (int((c - r) * TW / 2) + PW // 2 - TW // 2,
                                    int((c + r) * TH / 2)))
    d = ImageDraw.Draw(img)
    cxp, cyp = PW // 2, PH // 2

    def put(sp, x, y):
        rr = sp.width * 0.42
        d.ellipse([x - rr, y - rr * 0.34, x + rr, y + rr * 0.34], fill=(0, 0, 0, 110))
        img.alpha_composite(sp, (int(x - sp.width / 2), int(y - sp.height * 0.72)))

    for i, (dx, dy) in enumerate([(-150, -95), (-55, -145), (75, -110), (160, -45),
                                  (-95, 55), (50, 30), (145, 90), (-45, 130)]):
        put(kinds[i % 3], cxp + dx, cyp + dy)
    for i, (dx, dy) in enumerate([(-130, -35), (120, -5), (-25, -70), (25, 100)]):
        put(elites[i], cxp + dx, cyp + dy)
    put(player, cxp, cyp)

    # 상하 비네트 (게임과 동일 조건)
    v = Image.new('RGBA', (PW, PH), (0, 0, 0, 0))
    vd = ImageDraw.Draw(v)
    for i in range(80):
        al = int(150 * (1 - i / 80) ** 1.6)
        vd.line([(0, i), (PW, i)], fill=(6, 7, 10, al))
        vd.line([(0, PH - 1 - i), (PW, PH - 1 - i)], fill=(6, 7, 10, al))
    return Image.alpha_composite(img, v)


PAD, LAB = 12, 24
panels = [(n, build(t)) for n, t in sets]
pw, ph = panels[0][1].size
sheet = Image.new('RGB', (PAD + (pw + PAD) * len(panels), PAD + LAB + ph + PAD), (10, 11, 13))
d = ImageDraw.Draw(sheet)
for i, (n, p) in enumerate(panels):
    x = PAD + (pw + PAD) * i
    d.text((x + 4, PAD + 4), n, fill=(180, 195, 185))
    sheet.paste(p.convert('RGB'), (x, PAD + LAB))
sheet.save(HERE / '_floor_dark_compare.png')
print(f'saved _floor_dark_compare.png  {sheet.size}')

# ---------- 수치 ----------
cur = load_strip(PUB / 'tileset_iso_stone.png')


def stats(tiles):
    ms, ns = [], []
    for t in tiles:
        a = np.asarray(t)
        L = np.asarray(t.convert('L'), float)
        ms.append(L[a[:, :, 3] > 128].mean())
        ns.append(np.abs(np.diff(L, axis=1)).mean())
    return np.mean(ms), np.mean(ns)


gob = np.asarray(kinds[0].convert('L'), float)[np.asarray(kinds[0])[:, :, 3] > 128].mean()
eli = np.asarray(elites[0].convert('L'), float)[np.asarray(elites[0])[:, :, 3] > 128].mean()
print()
print(f'{"":16s}{"평균명도":>9}{"국소대비":>9}{"고블린차":>9}{"엘리트차":>9}')
m, n = stats(cur)
print(f'{"기존 타일셋":16s}{m:9.1f}{n:9.2f}{abs(gob - m):9.1f}{abs(eli - m):9.1f}')
for name, tiles in sets:
    m, n = stats(tiles)
    print(f'{name:16s}{m:9.1f}{n:9.2f}{abs(gob - m):9.1f}{abs(eli - m):9.1f}')
print(f'\n(고블린 {gob:.1f} / 엘리트 {eli:.1f} — 차이가 클수록 스프라이트가 도드라진다)')
