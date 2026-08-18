"""레퍼런스 3종 + 우리 현재 플레이어를 **같은 게임 장면**에 세워 비교 (검토 전용).

목적: "레퍼런스가 깔끔해 보인다"가 게임 크기(64px)·게임 바닥에서도 유지되는지 확인.
비교 조건을 완전히 동일하게 맞춘다 — 같은 바닥, 같은 프롭, 같은 고블린, 같은 그림자.

⚠️ 검토 전용이다. 출력은 tools/sprites/_*.png 로 gitignore 대상이고,
   레퍼런스는 타인의 저작물이므로 에셋으로 쓰거나 AI 프롬프트에 넣지 않는다.

실행: python3 tools/sprites/_ref_on_scene.py
출력: tools/sprites/_ref_on_scene.png
"""
import collections
import glob
import os
import pathlib

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = pathlib.Path(__file__).resolve().parent
PUB = HERE.parent.parent / 'public' / 'sprites' / 'dungeon'
UP = pathlib.Path('/sessions/kind-laughing-dirac/mnt/uploads')
TW, TH = 128, 64
CW, CH = 96, 112
TARGET_H = 64            # 게임에서의 플레이어 표시 높이


def cutout(path):
    """배경 제거 → 가장 큰(키 큰) 연결 요소 = 인물.

    배경색은 최빈색으로 잡고, **테두리에서 연결된 것만** 배경으로 본다
    (인물 안에 배경과 비슷한 색이 있어도 안 뚫린다).
    UI 버튼·서명·텍스트는 별개 요소로 남으므로 키 기준으로 걸러진다.
    """
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(int)
    modal = np.array(collections.Counter(
        map(tuple, a.reshape(-1, 3)[::13])).most_common(1)[0][0])
    near = (np.abs(a - modal).sum(axis=2) < 60)
    lab, n = ndimage.label(near)
    border = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
    border.discard(0)
    bg = np.isin(lab, list(border))
    fg = ndimage.binary_opening(~bg, np.ones((3, 3)))
    lab2, n2 = ndimage.label(fg)
    best, bh = None, -1
    for sl in ndimage.find_objects(lab2):
        h = sl[0].stop - sl[0].start
        w = sl[1].stop - sl[1].start
        if h * w < 2000:
            continue
        if h > bh:
            bh, best = h, sl
    if best is None:
        best = (slice(0, im.height), slice(0, im.width))
    al = np.where(fg, 255, 0)
    rgba = Image.fromarray(np.dstack([a, al]).astype(np.uint8), 'RGBA')
    return rgba.crop((best[1].start, best[0].start, best[1].stop, best[0].stop))


def to_game(img, h=TARGET_H, nearest=False):
    w = max(1, round(img.width * h / img.height))
    f = Image.NEAREST if nearest else Image.LANCZOS
    return img.resize((w, h), f)


# ---------- 우리 현재 플레이어: 게임과 완전히 동일한 조건 ----------
pl = Image.open(PUB / 'deliverables' / 'player_spritesheet.png').convert('RGBA')
ours = pl.crop((0, 0, 96, 116)).resize((53, 64), Image.NEAREST)   # NEAREST 0.55배 = 게임 그대로

refs = sorted(glob.glob(str(UP / '*')), key=os.path.getmtime)[-3:]
NAMES = ['우리 (현재·0.55배 NEAREST)', 'REF1 SIGNUS', 'REF2 자마젠타', 'REF3 청보라']
figs = [ours] + [to_game(cutout(p)) for p in refs]

# ---------- 장면 ----------
stone = Image.open(PUB / 'tileset_iso_stone.png').convert('RGBA')
stones = [stone.crop((i * TW, 0, (i + 1) * TW, TH)) for i in range(stone.width // TW)]
props = Image.open(PUB / 'props_iso.png').convert('RGBA')
pcell = [props.crop((i * CW, 0, (i + 1) * CW, CH)) for i in range(8)]
gob = Image.open(PUB / 'enemies_sheet.png').convert('RGBA').crop((0, 0, 32, 32)) \
    .resize((35, 35), Image.NEAREST)
eli = Image.open(PUB / 'elites_sheet.png').convert('RGBA').crop((0, 0, 48, 48)) \
    .resize((58, 58), Image.NEAREST)

SW, SH = 300, 260


def scene(fig, label):
    img = Image.new('RGBA', (SW, SH), (10, 11, 13, 255))
    for r in range(-2, SH // TH + 4):
        for c in range(-2, SW // TW + 6):
            hv = ((c * 73856093) ^ (r * 19349663)) & 0xFFFFFFFF
            t = stones[hv % len(stones)]
            if (hv >> 8) & 1:
                t = t.transpose(Image.FLIP_LEFT_RIGHT)
            img.alpha_composite(t, (int((c - r) * TW / 2), int((c + r) * TH / 2)))
    d = ImageDraw.Draw(img)
    # 뒤쪽 프롭 — 묘비 / 기둥 / 횃불(광원 포함)
    for f, x, y in ((0, 42, 96), (3, 246, 104), (6, 150, 74)):
        if f == 6:
            gl = Image.new('RGBA', img.size, (0, 0, 0, 0))
            gd = ImageDraw.Draw(gl)
            for rr in range(110, 4, -2):
                gd.ellipse([x - rr, y - 10 - rr * 0.45, x + rr, y - 10 + rr * 0.45],
                           fill=(255, 176, 92, int(26 * (1 - rr / 110) ** 1.4)))
            img = Image.alpha_composite(img, gl)
        img.alpha_composite(pcell[f], (x - CW // 2, y - (CH - 1)))
    d = ImageDraw.Draw(img)

    def put(sp, x, y):
        rr = sp.width * 0.42
        d.ellipse([x - rr, y - rr * 0.32, x + rr, y + rr * 0.32], fill=(0, 0, 0, 105))
        img.alpha_composite(sp, (int(x - sp.width / 2), int(y - sp.height)))

    put(gob, 62, 178)
    put(gob, 238, 166)
    put(eli, 210, 224)
    put(gob, 96, 236)
    # 주인공 — 화면 중앙
    put(fig, SW // 2, 200)
    # 앞쪽 프롭 (잔해)
    img.alpha_composite(pcell[7], (150 - CW // 2, 246 - (CH - 1)))

    v = Image.new('RGBA', img.size, (0, 0, 0, 0))
    vd = ImageDraw.Draw(v)
    for i in range(58):
        al = int(150 * (1 - i / 58) ** 1.6)
        vd.line([(0, i), (SW, i)], fill=(6, 7, 10, al))
        vd.line([(0, SH - 1 - i), (SW, SH - 1 - i)], fill=(6, 7, 10, al))
    return Image.alpha_composite(img, v)


Z = 3
PAD, LAB = 10, 24
panels = [(NAMES[i], scene(f, NAMES[i])) for i, f in enumerate(figs)]
sheet = Image.new('RGB', (PAD + (SW * Z + PAD) * 4, PAD + LAB + SH * Z + PAD), (16, 17, 19))
d = ImageDraw.Draw(sheet)
for i, (n, p) in enumerate(panels):
    x = PAD + (SW * Z + PAD) * i
    d.text((x + 4, PAD + 4), n, fill=(205, 218, 210))
    sheet.paste(p.convert('RGB').resize((SW * Z, SH * Z), Image.NEAREST), (x, PAD + LAB))
sheet.save(HERE / '_ref_on_scene.png')
print('saved _ref_on_scene.png', sheet.size)

# ---------- 수치 ----------
FLOOR = 40.9
print()
print(f'{"":26}{"표시크기":>10}{"몸통명도":>9}{"바닥차":>8}{"국소대비":>9}')
for n, f in zip(NAMES, figs):
    a = np.asarray(f).astype(int)
    m = a[..., 3] > 128
    if m.sum() == 0:
        continue
    px = a[..., :3][m]
    mx = px.max(axis=1).astype(float)
    mn = px.min(axis=1).astype(float)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    body = px[~((sat > 0.35) & (mx > 120))]
    L = np.asarray(f.convert('L'), float)
    print(f'{n:26}{f"{f.width}x{f.height}":>10}{body.mean():9.1f}'
          f'{body.mean() - FLOOR:+8.1f}{np.abs(np.diff(L, axis=1)).mean():9.2f}')
print(f'\n(바닥 명도 {FLOOR} / 프롭 56.4 — 몸통이 바닥보다 +15~25 여야 실루엣이 읽힌다)')
