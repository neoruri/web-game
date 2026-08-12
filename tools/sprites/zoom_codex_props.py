"""Codex 프롭 후보를 2배 확대해 비교 — 판단은 이 이미지로 한다.

_codex_props_preview.png 는 전체 바닥을 담아서 프롭이 너무 작았다.
여기서는 ① 시트 8칸을 나란히 확대 ② 바닥에 얹은 상태를 확대 — 두 가지를 낸다.

실행: python3 tools/sprites/zoom_codex_props.py
출력: tools/sprites/_codex_props_zoom.png
"""
import pathlib

import numpy as np
from PIL import Image, ImageDraw

HERE = pathlib.Path(__file__).resolve().parent
PUB = HERE.parent.parent / 'public' / 'sprites' / 'dungeon'
CW, CH = 96, 112
TW, TH = 128, 64
BOTTOM = CH - 1
Z = 2

SETS = [
    ('기존 프롭', PUB / 'props_iso.png'),
    ('N1  밝게', HERE / 'props_iso_N1.png'),
    ('N2  권장', HERE / 'props_iso_N2.png'),
    ('N3  어둡게', HERE / 'props_iso_N3.png'),
]

stone = Image.open(PUB / 'tileset_iso_stone.png').convert('RGBA')
stones = [stone.crop((i * TW, 0, (i + 1) * TW, TH)) for i in range(stone.width // TW)]
gob = Image.open(PUB / 'enemies_sheet.png').convert('RGBA').crop((0, 0, 32, 32)) \
    .resize((35, 35), Image.NEAREST)
plsp = Image.open(PUB / 'deliverables' / 'player_spritesheet.png').convert('RGBA')
player = plsp.crop((0, 0, 96, 116)).resize((53, 64), Image.NEAREST)


def cells(path):
    im = Image.open(path).convert('RGBA')
    return [im.crop((i * CW, 0, (i + 1) * CW, CH)) for i in range(8)]


def floor_bg(w, h):
    """바닥을 타일로 채운다 — main.js 와 같은 좌표 해시."""
    img = Image.new('RGBA', (w, h), (10, 11, 13, 255))
    for r in range(-2, h // TH + 4):
        for c in range(-2, w // TW + 6):
            hv = ((c * 73856093) ^ (r * 19349663)) & 0xFFFFFFFF
            t = stones[hv % len(stones)]
            if (hv >> 8) & 1:
                t = t.transpose(Image.FLIP_LEFT_RIGHT)
            img.alpha_composite(t, (int((c - r) * TW / 2), int((c + r) * TH / 2)))
    return img


def torch_glow(img, x, y):
    """횃불 바닥 광원 — main.js drawProps 와 같은 반경/색."""
    gl = Image.new('RGBA', img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(gl)
    for rr in range(118, 4, -2):
        al = int(30 * (1 - rr / 118) ** 1.4)
        gd.ellipse([x - rr, y - 10 - rr * 0.45, x + rr, y - 10 + rr * 0.45],
                   fill=(255, 176, 92, al))
    return Image.alpha_composite(img, gl)


# ---------- 패널 A: 시트 8칸을 바닥 위에 일렬로 ----------
GAP = 8
AW = (CW + GAP) * 8 + GAP
AH = CH + 44


def strip_panel(cl):
    img = floor_bg(AW, AH)
    for i, c in enumerate(cl):
        x = GAP + i * (CW + GAP)
        y = AH - 22
        if i == 6:
            img = torch_glow(img, x + CW // 2, y)
        img.alpha_composite(c, (x, y - BOTTOM))
    return img


# ---------- 패널 B: 실제 배치 — 적·플레이어와 함께 ----------
BW, BH = 760, 300


def scene_panel(cl):
    img = floor_bg(BW, BH)
    d = ImageDraw.Draw(img)
    # (프롭인덱스, x, y) — 종류가 섞이도록, 빈도 높은 6번 횃불을 여러 개
    spots = [(0, 90, 150), (6, 210, 122), (3, 300, 190), (5, 430, 145),
             (6, 560, 175), (1, 660, 130), (7, 380, 250), (2, 130, 255)]
    spots.sort(key=lambda s: s[2])
    for f, x, y in spots:
        if f == 6:
            img = torch_glow(img, x, y)
    d = ImageDraw.Draw(img)
    for f, x, y in spots:
        img.alpha_composite(cl[f], (x - CW // 2, y - BOTTOM))
    # 적 + 플레이어 — 프롭에 묻히는지 본다
    for dx, dy in ((160, 200), (350, 120), (500, 240), (620, 210)):
        rr = gob.width * 0.42
        d.ellipse([dx - rr, dy - rr * 0.34, dx + rr, dy + rr * 0.34], fill=(0, 0, 0, 110))
        img.alpha_composite(gob, (dx - gob.width // 2, dy - int(gob.height * 0.72)))
    img.alpha_composite(player, (250 - player.width // 2, 270 - player.height))
    return img


PAD, LAB = 10, 26
rows = []
for name, path in SETS:
    cl = cells(path)
    a = strip_panel(cl).convert('RGB')
    b = scene_panel(cl).convert('RGB')
    rows.append((name, a, b))

aw, ah = rows[0][1].size
bw, bh = rows[0][2].size
RW = PAD + max(aw, bw) * Z + PAD
RH = LAB + ah * Z + PAD + bh * Z + PAD * 2
sheet = Image.new('RGB', (RW, RH * len(rows)), (12, 13, 15))
d = ImageDraw.Draw(sheet)
for i, (name, a, b) in enumerate(rows):
    oy = i * RH
    d.text((PAD, oy + 6), name, fill=(200, 215, 205))
    sheet.paste(a.resize((aw * Z, ah * Z), Image.NEAREST), (PAD, oy + LAB))
    sheet.paste(b.resize((bw * Z, bh * Z), Image.NEAREST), (PAD, oy + LAB + ah * Z + PAD))
sheet.save(HERE / '_codex_props_zoom.png')
print(f'saved _codex_props_zoom.png  {sheet.size}')

# ---------- 크로마키 잔여 검사 ----------
print()
print('마젠타 잔여 픽셀 검사 (크로마키가 깔끔한지):')
for name, path in SETS[1:]:
    a = np.asarray(Image.open(path).convert('RGBA')).astype(int)
    msk = a[..., 3] > 20
    px = a[..., :3][msk]
    # 마젠타 잔여 = R,B 가 G 보다 뚜렷하게 높은 픽셀
    frin = ((px[:, 0] + px[:, 2]) / 2 - px[:, 1]) > 25
    print(f'  {name:12s} 불투명 {msk.sum():6d}px 중 프린지 의심 {frin.sum():4d}px '
          f'({100 * frin.mean():.2f}%)')
