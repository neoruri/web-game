"""프롭(무덤·기둥·부서진벽·횃불)을 새 바닥 톤에 맞춘 후보 3안 — 검토용, 적용 안 함.

=== 문제 (실측) ===
              명도    R-B
  새 바닥      40.9   +3.5  (초록기)
  props 현재   83.7  -20.9  (파랑기)
→ 바닥보다 **2배 밝고 색조가 반대**. "다른 조명 아래 있는 물체"처럼 뜬다.

=== 설계 원칙 ===
① 프롭은 **바닥과 같아지면 안 된다.** 보여야 하는 물체다.
   바닥(40.9)보다 확실히 밝게 유지하고, **색조만** 맞춘다.
② **횃불의 불꽃은 건드리지 않는다.** 6번 칸에 따뜻한 픽셀 64개가 있다(불꽃).
   여기에 초록 보정을 걸면 불이 죽는다 → R-B > 25 인 픽셀은 보호한다.
③ 바닥과 같은 감마 곡선(1.45/1.15)을 쓰되 강도만 낮춘다 — 같은 "빛" 아래 있어 보이게.

실행: python3 tools/sprites/match_props.py
출력: tools/sprites/_props_match_preview.png       (새 바닥 위에 3안 비교)
      tools/sprites/props_iso_P{1,2,3}.png         (후보, 적용 안 함)
"""
import pathlib

import numpy as np
from PIL import Image, ImageDraw

HERE = pathlib.Path(__file__).resolve().parent
PUB = HERE.parent.parent / 'public' / 'sprites' / 'dungeon'
CW, CH = 96, 112
TW, TH = 128, 64

src = Image.open(PUB / 'props_iso.png').convert('RGBA')
NPROP = src.width // CW

# 새 바닥의 목표 색조 (apply_floor_d15.py 결과 실측)
FLOOR_L, FLOOR_RB = 40.9, 3.5


def match(cellimg, gamma, contrast, hue_pull, warm_guard=25):
    """gamma/contrast: 밝기·대비.  hue_pull: 색조를 바닥 쪽으로 끌어당기는 비율(0~1)."""
    a = np.asarray(cellimg, float).copy()
    rgb, alpha = a[..., :3], a[..., 3]
    m = alpha > 8
    if m.sum() == 0:
        return cellimg

    # 따뜻한 픽셀(불꽃)은 보호 — 초록 보정을 걸면 불이 죽는다
    warm = (rgb[..., 0] - rgb[..., 2]) > warm_guard

    # ① 밝기: 바닥과 같은 감마 곡선. 강도만 낮춰서 프롭이 바닥보다 밝게 남는다.
    #    ⚠️ 횃불 불꽃은 **광원**이므로 어둡게 하면 안 된다.
    #    1차 시도는 색조만 보호하고 감마는 그대로 걸어서 불꽃 픽셀이 64→23개로 줄었다.
    #    → warm 마스크를 감마에서도 제외한다(원본 밝기 유지).
    x = np.clip(rgb, 0, 255) / 255.0
    xd = x ** gamma
    mm = xd[m].mean()
    xd = (xd - mm) * contrast + mm
    out = np.clip(xd * 255, 0, 255)
    orig = np.clip(x * 255, 0, 255)
    out[warm] = orig[warm]                 # 불꽃은 원본 밝기 그대로

    # ② 색조: 현재 R-B 를 바닥 쪽(+3.5)으로 hue_pull 만큼 끌어당긴다.
    #    명도를 유지하려면 R 을 올린 만큼 B 를 내린다(합 보존).
    cur_rb = (out[..., 0] - out[..., 2])[m].mean()
    shift = (FLOOR_RB - cur_rb) * hue_pull
    adj = np.zeros_like(out)
    adj[..., 0] = shift * 0.5
    adj[..., 2] = -shift * 0.5
    adj[warm] = 0                      # 불꽃 제외
    out = np.clip(out + adj, 0, 255)

    return Image.fromarray(
        np.dstack([out, alpha]).astype(np.uint8), 'RGBA')


CANDS = [
    ('P1  약하게', dict(gamma=1.15, contrast=1.05, hue_pull=0.55)),
    ('P2  중간',   dict(gamma=1.28, contrast=1.10, hue_pull=0.80)),
    ('P3  강하게', dict(gamma=1.42, contrast=1.15, hue_pull=1.00)),
]

sets = [('현재 (원본)', [src.crop((i * CW, 0, (i + 1) * CW, CH)) for i in range(NPROP)])]
for name, kw in CANDS:
    sets.append((name, [match(src.crop((i * CW, 0, (i + 1) * CW, CH)), **kw)
                        for i in range(NPROP)]))

for (name, cells), key in zip(sets[1:], ('P1', 'P2', 'P3')):
    sheet = Image.new('RGBA', (CW * NPROP, CH), (0, 0, 0, 0))
    for i, c in enumerate(cells):
        sheet.paste(c, (i * CW, 0), c)
    sheet.save(HERE / f'props_iso_{key}.png')

# ---------- 새 바닥 위에 얹어 비교 ----------
stone = Image.open(PUB / 'tileset_iso_stone.png').convert('RGBA')
stones = [stone.crop((i * TW, 0, (i + 1) * TW, TH)) for i in range(stone.width // TW)]
gob = Image.open(PUB / 'enemies_sheet.png').convert('RGBA').crop((0, 0, 32, 32)) \
    .resize((35, 35), Image.NEAREST)
plsp = Image.open(PUB / 'deliverables' / 'player_spritesheet.png').convert('RGBA')
player = plsp.crop((0, 0, 96, 116)).resize((53, 64), Image.NEAREST)

COLS, ROWS = 7, 8
PW = TW * COLS
PH = int(TH * (ROWS + COLS) / 2) + TH + 40


def build(cells):
    img = Image.new('RGBA', (PW, PH), (10, 11, 13, 255))
    for r in range(ROWS):
        for c in range(COLS):
            hv = ((c * 73856093) ^ (r * 19349663)) & 0xFFFFFFFF
            t = stones[hv % len(stones)]
            if (hv >> 8) & 1:
                t = t.transpose(Image.FLIP_LEFT_RIGHT)
            img.alpha_composite(t, (int((c - r) * TW / 2) + PW // 2 - TW // 2,
                                    int((c + r) * TH / 2)))
    # 프롭 8종을 두 줄로 — 바닥과의 톤 차이를 한눈에
    cxp = PW // 2
    base = PH // 2 - 40
    for i, cl in enumerate(cells):
        row, col = divmod(i, 4)
        x = cxp + (col - 1.5) * 110
        y = base + row * 96
        img.alpha_composite(cl, (int(x - CW / 2), int(y - CH * 0.7)))

    d = ImageDraw.Draw(img)
    for dx, dy in ((-190, -120), (170, -100), (-60, 150), (120, 170)):
        rr = gob.width * 0.42
        d.ellipse([cxp + dx - rr, base + dy - rr * 0.34,
                   cxp + dx + rr, base + dy + rr * 0.34], fill=(0, 0, 0, 110))
        img.alpha_composite(gob, (cxp + dx - gob.width // 2, base + dy - int(gob.height * 0.72)))
    img.alpha_composite(player, (cxp - player.width // 2, base + 250))

    v = Image.new('RGBA', (PW, PH), (0, 0, 0, 0))
    vd = ImageDraw.Draw(v)
    for i in range(70):
        al = int(150 * (1 - i / 70) ** 1.6)
        vd.line([(0, i), (PW, i)], fill=(6, 7, 10, al))
        vd.line([(0, PH - 1 - i), (PW, PH - 1 - i)], fill=(6, 7, 10, al))
    return Image.alpha_composite(img, v)


PAD, LAB = 12, 24
panels = [(n, build(c)) for n, c in sets]
pw, ph = panels[0][1].size
sheet = Image.new('RGB', (PAD + (pw + PAD) * len(panels), PAD + LAB + ph + PAD), (10, 11, 13))
d = ImageDraw.Draw(sheet)
for i, (n, p) in enumerate(panels):
    x = PAD + (pw + PAD) * i
    d.text((x + 4, PAD + 4), n, fill=(180, 195, 185))
    sheet.paste(p.convert('RGB'), (x, PAD + LAB))
sheet.save(HERE / '_props_match_preview.png')
print(f'saved _props_match_preview.png  {sheet.size}')


def stats(cells):
    Ls, rbs, warm = [], [], 0
    for c in cells:
        a = np.asarray(c, float)
        m = a[..., 3] > 128
        if m.sum() == 0:
            continue
        rgb = a[..., :3][m]
        Ls.append(rgb.mean())
        rbs.append((rgb[:, 0] - rgb[:, 2]).mean())
        warm += int(((rgb[:, 0] - rgb[:, 2]) > 25).sum())
    return np.mean(Ls), np.mean(rbs), warm


print()
print(f'{"":14s}{"명도":>8}{"R-B":>8}{"바닥과 명도차":>14}{"불꽃px":>8}')
print(f'{"새 바닥":14s}{FLOOR_L:8.1f}{FLOOR_RB:+8.1f}{0:14.1f}{"-":>8}')
for name, cells in sets:
    L, rb, warm = stats(cells)
    print(f'{name:14s}{L:8.1f}{rb:+8.1f}{L - FLOOR_L:14.1f}{warm:8d}')
print('\n(불꽃px 가 유지돼야 횃불이 살아 있다. 명도차는 20~30 이 적당 —'
      ' 0이면 바닥에 묻히고 40+면 뜬다)')
