"""디자인 시안(제미나이 / GPT) 8종을 **실제 게임 크기(53×64)로 축소해 새 바닥에 얹는** 시험.

크게 볼 때 멋있는 것과 53px 에서 읽히는 것은 다르다. 이게 유일한 판단 기준이다.

각 시안 이미지는 2×2 로 4가지 색 변형이 들어있다. 사분면마다 **가장 키가 큰 덩어리**를
주 인물로 보고 잘라낸다(주변 디테일 스터디는 키가 작아서 자동으로 걸러진다).

실행: python3 tools/sprites/test_design_at_gamesize.py
출력: tools/sprites/_design_gamesize.png
"""
import glob
import os
import pathlib

import numpy as np
from PIL import Image, ImageDraw

HERE = pathlib.Path(__file__).resolve().parent
PUB = HERE.parent.parent / 'public' / 'sprites' / 'dungeon'
UP = pathlib.Path('/sessions/kind-laughing-dirac/mnt/uploads')
TW, TH = 128, 64
PLAYER_H = 64            # 게임에서의 실제 표시 높이 (96×116 × 0.55)

srcs = sorted(glob.glob(str(UP / '*')), key=os.path.getmtime)
GEM = [p for p in srcs if 'Gemini' in p][-1]
GPT = [p for p in srcs if 'Codex' in p][-1]


def is_bg(a):
    """균일한 짙은 회색 배경 판정.

    ⚠️ 1차 시도는 하한을 38 로 잡아 실패했다. 실측하니 배경이
    제미나이 35~37 / GPT 32~35 로 **하한 바로 아래**였다.
    → 배경이 전경으로 분류돼 인물 크롭이 사분면째로 잡히고,
      '몸통 명도'가 배경(약 36) 쪽으로 끌려가 오염됐다."""
    g = a.mean(axis=2)
    return ((abs(a[..., 0] - a[..., 1]) < 10) & (abs(a[..., 1] - a[..., 2]) < 10)
            & (g >= 24) & (g <= 46))


def tallest_figure(img):
    """사분면에서 **가장 키가 큰 연결 요소** = 주 인물. (열 점유 방식은 실패했다 —
    활이 화면을 가로지르고 디테일 스터디가 세로로 쌓여 있어서 거의 모든 열이 기준을
    넘었고, 결과적으로 사분면 전체가 잡혔다.)"""
    from scipy import ndimage
    a = np.asarray(img.convert('RGB')).astype(int)
    fg = ~is_bg(a)
    # 잔 노이즈 제거 후 라벨링 — 활은 손에 붙어 있으니 인물과 같은 요소가 된다
    fg = ndimage.binary_opening(fg, np.ones((3, 3)))
    lab, n = ndimage.label(fg)
    if n == 0:
        return img
    best, bh = None, -1
    for sl in ndimage.find_objects(lab):
        h = sl[0].stop - sl[0].start
        w = sl[1].stop - sl[1].start
        if h * w < 400:
            continue
        if h > bh:
            bh, best = h, sl
    if best is None:
        return img
    return img.crop((best[1].start, best[0].start, best[1].stop, best[0].stop))


def quads(path):
    im = Image.open(path).convert('RGB')
    W, H = im.size
    out = []
    for r in range(2):
        for c in range(2):
            q = im.crop((c * W // 2, r * H // 2, (c + 1) * W // 2, (r + 1) * H // 2))
            out.append(tallest_figure(q))
    return out


def to_game(fig):
    """게임 표시 크기로 축소. 배경을 알파로 바꾼다."""
    a = np.asarray(fig.convert('RGB')).astype(int)
    al = np.where(is_bg(a), 0, 255)
    rgba = Image.fromarray(np.dstack([a, al]).astype(np.uint8), 'RGBA')
    w = max(1, round(fig.width * PLAYER_H / fig.height))
    return rgba.resize((w * 2, PLAYER_H * 2), Image.LANCZOS).resize((w, PLAYER_H), Image.LANCZOS)


# ---------- 바닥 ----------
stone = Image.open(PUB / 'tileset_iso_stone.png').convert('RGBA')
stones = [stone.crop((i * TW, 0, (i + 1) * TW, TH)) for i in range(stone.width // TW)]
gob = Image.open(PUB / 'enemies_sheet.png').convert('RGBA').crop((0, 0, 32, 32)) \
    .resize((35, 35), Image.NEAREST)
# 냉기 걸린 적 — 플레이어 발광색과 겹치는지 보는 게 목적
chill = np.asarray(gob, float).copy()
chill[..., 0] *= 0x8a / 255 * 1.6
chill[..., 1] *= 0xd4 / 255 * 1.6
chill[..., 2] *= 0xf5 / 255 * 1.6
chill = Image.fromarray(np.clip(chill, 0, 255).astype(np.uint8), 'RGBA')


def floor(w, h):
    img = Image.new('RGBA', (w, h), (10, 11, 13, 255))
    for r in range(-2, h // TH + 4):
        for c in range(-2, w // TW + 6):
            hv = ((c * 73856093) ^ (r * 19349663)) & 0xFFFFFFFF
            t = stones[hv % len(stones)]
            if (hv >> 8) & 1:
                t = t.transpose(Image.FLIP_LEFT_RIGHT)
            img.alpha_composite(t, (int((c - r) * TW / 2), int((c + r) * TH / 2)))
    return img


LABELS = ['A 청람', 'B 자마젠타', 'C 에메랄드', 'D 시안']
sets = [('제미나이', quads(GEM)), ('GPT', quads(GPT))]

CELLW, CELLH = 150, 150
Z = 3
rows = []
for name, figs in sets:
    panel = floor(CELLW * 4, CELLH)
    d = ImageDraw.Draw(panel)
    for i, f in enumerate(figs):
        g = to_game(f)
        cx = CELLW * i + CELLW // 2
        cy = CELLH // 2 + 26
        # 발밑 그림자 (게임과 동일)
        d.ellipse([cx - 11, cy - 5, cx + 11, cy + 5], fill=(0, 0, 0, 100))
        panel.alpha_composite(g, (cx - g.width // 2, cy - PLAYER_H))
        # 옆에 일반 고블린 + 냉기 걸린 고블린을 세워 색 충돌을 본다
        panel.alpha_composite(gob, (cx + 34, cy - 30))
        panel.alpha_composite(chill, (cx - 60, cy - 30))
    rows.append((name, panel))

PAD, LAB = 10, 30
W = PAD + CELLW * 4 * Z + PAD
sheet = Image.new('RGB', (W, (LAB + CELLH * Z + PAD) * len(rows) + PAD), (12, 13, 15))
d = ImageDraw.Draw(sheet)
for i, (name, p) in enumerate(rows):
    oy = i * (LAB + CELLH * Z + PAD) + PAD
    d.text((PAD, oy + 4), f'{name}   —   좌측=냉기 걸린 적(#8ad4f5), 우측=일반 고블린',
           fill=(205, 218, 210))
    for j, l in enumerate(LABELS):
        d.text((PAD + (CELLW * j + 8) * Z, oy + 16), l, fill=(150, 165, 158))
    sheet.paste(p.convert('RGB').resize((CELLW * 4 * Z, CELLH * Z), Image.NEAREST), (PAD, oy + LAB))
sheet.save(HERE / '_design_gamesize.png')
print('saved _design_gamesize.png', sheet.size)

# ---------- 수치 ----------
print()
print(f'{"":10}{"몸통명도":>9}{"바닥차":>8}{"발광%":>7}{"국소대비":>9}')
for name, path in (('제미나이', GEM), ('GPT', GPT)):
    a = np.asarray(Image.open(path).convert('RGB')).astype(int)
    px = a[~is_bg(a)]
    mx = px.max(axis=1).astype(float)
    mn = px.min(axis=1).astype(float)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    gl = (sat > 0.35) & (mx > 120)
    L = np.asarray(Image.open(path).convert('L'), float)
    print(f'{name:10}{px[~gl].mean():9.1f}{px[~gl].mean() - 40.9:+8.1f}'
          f'{100 * gl.mean():7.1f}{np.abs(np.diff(L, axis=1)).mean():9.2f}')
print('\n(몸통명도는 바닥 40.9 보다 +10~17 이 목표. 음수면 바닥에 잠긴다)')
