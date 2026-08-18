"""idle 스트립 검수 + 망토 밑단 발광을 후처리로 붙이는 시험.

AI 가 밑단 발광을 3번 연속 빼먹었다(0.0%). 재요청보다 후처리가 안전하다 —
이 스트립의 **발끝 편차가 0px** 로 품질이 좋아서 다시 굴리면 그걸 잃을 위험이 있다.

방법: 실루엣의 **아래쪽 외곽선**에 발광을 얹는다. 높이에 따라 가중치를 램프로 줘서
밑단 톱니 끝이 가장 밝고 위로 갈수록 사라진다. 색은 기존 손 불꽃에서 실측해 가져온다.

실행: python3 tools/sprites/_hem_glow_test.py
출력: tools/sprites/_hem_glow_test.png
"""
import glob
import os
import pathlib

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

HERE = pathlib.Path(__file__).resolve().parent
PUB = HERE.parent.parent / 'public' / 'sprites' / 'dungeon'
TW, TH, CW, CH = 128, 64, 96, 112
SRC = max(glob.glob('/sessions/kind-laughing-dirac/mnt/uploads/*'), key=os.path.getmtime)

# ---- 초록 크로마키: **언매팅** ----
# ⚠️ 1차 시도는 단순 임계값((G>150)&...)이었고 실패했다.
#    얇은 활의 안티에일리어싱 픽셀(G≈110)이 전경으로 분류돼 **활이 초록으로 남았다.**
# → 프롭에서 마젠타에 썼던 방식과 동일하게, 초록다움으로 알파를 추정하고
#   배경 성분을 빼낸다(unmatting).
im = Image.open(SRC).convert('RGB')
src = np.asarray(im).astype(np.float64)


def greenness(x):
    return x[..., 1] - (x[..., 0] + x[..., 2]) / 2


core = (src[..., 1] > 170) & (src[..., 0] < 120) & (src[..., 2] < 120)
BG = src[core].mean(axis=0)
gv = greenness(src)
g_bg = greenness(BG[None, None, :])[0, 0]
g_fg = np.percentile(gv[~core], 92)          # 물체의 초록다움 상한
alpha = np.clip((g_bg - gv) / (g_bg - g_fg), 0, 1)
alpha[core] = 0.0
a3 = alpha[..., None]
with np.errstate(invalid='ignore', divide='ignore'):
    un = np.where(a3 > 0.02, (src - (1 - a3) * BG[None, None, :]) / np.maximum(a3, 1e-6), 0)
a = np.clip(un, 0, 255).astype(int)
fg = alpha > 0.35
print(f'배경 대표색 {BG.round(1)}  코어 {100 * core.mean():.1f}%')
frin = int((greenness(a[fg]) > 18).sum())
print(f'초록 프린지 잔여 {frin}px  (불투명 {int(fg.sum())}px 중)')

# ---- 프레임 분리 ----
cols = fg.any(axis=0)
runs, s = [], None
for i, v in enumerate(list(cols) + [False]):
    if v and s is None:
        s = i
    elif not v and s is not None:
        if i - s > 30:
            runs.append((s, i - 1))
        s = None

# ---- 기존 발광색 실측 (손 불꽃) ----
mx = a.max(axis=2).astype(float)
mn = a.min(axis=2).astype(float)
sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
gm = (sat > 0.35) & (mx > 130) & fg & (a[..., 2] > 110) & (a[..., 0] > 100)
GLOW_RGB = a[gm].mean(axis=0)
print(f'실측 발광색 {GLOW_RGB.round(0)}  (프롬프트 지정 #e05cff = [224 92 255])')


def cut(x0, x1):
    sub = fg[:, x0:x1 + 1]
    ys, xs = np.nonzero(sub)
    box = (x0 + xs.min(), ys.min(), x0 + xs.max() + 1, ys.max() + 1)
    rgba = np.dstack([a, alpha * 255]).astype(np.uint8)   # 부드러운 알파 유지
    return Image.fromarray(rgba, 'RGBA').crop(box)


def add_hem_glow(cell, strength=1.0, start=0.62, width=5):
    """실루엣 하단 외곽선에 발광을 얹는다.

    start: 이 높이 비율부터 발광 시작 (0.62 = 아래 38%)
    width: 발광 번짐 폭(px, 원본 해상도 기준)
    """
    arr = np.asarray(cell).astype(float)
    al = arr[..., 3] > 90
    H, W = al.shape
    # 외곽선 = 실루엣에서 침식한 것을 뺀 테두리
    edge = al & ~ndimage.binary_erosion(al, np.ones((3, 3)))
    # 높이 가중치 — 아래로 갈수록 1
    yy = np.arange(H)[:, None] / max(H - 1, 1)
    w = np.clip((yy - start) / (1 - start), 0, 1) ** 1.4
    band = edge * w
    # 번짐
    soft = ndimage.gaussian_filter(band.astype(float), width * 0.5)
    soft = soft / max(soft.max(), 1e-6)
    # 아래쪽만 남기고, 실루엣 밖으로도 살짝 새게 (발광은 번진다)
    soft *= np.clip((yy - start + 0.05) / (1 - start), 0, 1)
    m = (soft * strength)[..., None]
    out = arr.copy()
    out[..., :3] = np.clip(arr[..., :3] * (1 - m * 0.35) + GLOW_RGB[None, None, :] * m * 1.15,
                           0, 255)
    # 실루엣 밖으로 새는 부분은 알파를 만들어준다
    outside = (~al) & (soft > 0.18)
    out[..., 3] = np.maximum(arr[..., 3], np.where(outside, np.clip(soft * 210, 0, 200), 0))
    return Image.fromarray(out.astype(np.uint8), 'RGBA')


def to_game(cell):
    w = max(1, round(cell.width * 64 / cell.height))
    return cell.resize((w * 2, 128), Image.LANCZOS).resize((w, 64), Image.LANCZOS)


f0 = cut(*runs[0])
VARIANTS = [('원본 (밑단 발광 없음)', None), ('약하게', 0.55), ('중간 (권장)', 0.85), ('강하게', 1.2)]

# ---- 바닥 장면 ----
stone = Image.open(PUB / 'tileset_iso_stone.png').convert('RGBA')
stones = [stone.crop((i * TW, 0, (i + 1) * TW, TH)) for i in range(stone.width // TW)]
props = Image.open(PUB / 'props_iso.png').convert('RGBA')
pc = [props.crop((i * CW, 0, (i + 1) * CW, CH)) for i in range(8)]
gob = Image.open(PUB / 'enemies_sheet.png').convert('RGBA').crop((0, 0, 32, 32)) \
    .resize((35, 35), Image.NEAREST)
SW, SH = 210, 220


def scene(fig):
    img = Image.new('RGBA', (SW, SH), (10, 11, 13, 255))
    for r in range(-2, SH // TH + 4):
        for c in range(-2, SW // TW + 6):
            hv = ((c * 73856093) ^ (r * 19349663)) & 0xFFFFFFFF
            t = stones[hv % len(stones)]
            if (hv >> 8) & 1:
                t = t.transpose(Image.FLIP_LEFT_RIGHT)
            img.alpha_composite(t, (int((c - r) * TW / 2), int((c + r) * TH / 2)))
    for f, x, y in ((0, 34, 84), (3, 182, 92)):
        img.alpha_composite(pc[f], (x - CW // 2, y - (CH - 1)))
    d = ImageDraw.Draw(img)

    def put(sp, x, y):
        rr = sp.width * .42
        d.ellipse([x - rr, y - rr * .32, x + rr, y + rr * .32], fill=(0, 0, 0, 105))
        img.alpha_composite(sp, (int(x - sp.width / 2), int(y - sp.height)))

    put(gob, 44, 168)
    put(gob, 176, 156)
    put(fig, SW // 2, 176)
    v = Image.new('RGBA', img.size, (0, 0, 0, 0))
    vd = ImageDraw.Draw(v)
    for i in range(50):
        al = int(150 * (1 - i / 50) ** 1.6)
        vd.line([(0, i), (SW, i)], fill=(6, 7, 10, al))
        vd.line([(0, SH - 1 - i), (SW, SH - 1 - i)], fill=(6, 7, 10, al))
    return Image.alpha_composite(img, v)


Z, PAD, LAB = 3, 10, 22
rows = []
for name, st in VARIANTS:
    cell = f0 if st is None else add_hem_glow(f0, st)
    g = to_game(cell)
    zoom = cell.resize((int(cell.width * 260 / cell.height), 260), Image.LANCZOS)
    rows.append((name, zoom, scene(g)))

zw = max(r[1].width for r in rows)
sheet = Image.new('RGB', (PAD + (max(zw, SW * Z) + PAD) * 4, PAD + LAB + 260 + PAD + SH * Z + PAD),
                  (16, 17, 19))
d = ImageDraw.Draw(sheet)
colw = max(zw, SW * Z) + PAD
for i, (n, zoom, sc) in enumerate(rows):
    x = PAD + colw * i
    d.text((x + 2, PAD + 2), n, fill=(205, 218, 210))
    bgp = Image.new('RGB', (zw, 260), (34, 34, 34))
    bgp.paste(zoom.convert('RGB'), ((zw - zoom.width) // 2, 0), zoom)
    sheet.paste(bgp, (x, PAD + LAB))
    sheet.paste(sc.convert('RGB').resize((SW * Z, SH * Z), Image.NEAREST), (x, PAD + LAB + 260 + PAD))
sheet.save(HERE / '_hem_glow_test.png')
print('saved _hem_glow_test.png', sheet.size)

# ---- 발광 세로 분포 재측정 ----
print()
print(f'{"":18}{"머리":>7}{"어깨":>7}{"허리·손":>8}{"허벅지":>7}{"밑단":>7}')
for name, st in VARIANTS:
    cell = f0 if st is None else add_hem_glow(f0, st)
    ar = np.asarray(cell).astype(int)
    m = ar[..., 3] > 90
    mx2 = ar[..., :3].max(axis=2).astype(float)
    mn2 = ar[..., :3].min(axis=2).astype(float)
    s2 = np.where(mx2 > 0, (mx2 - mn2) / np.maximum(mx2, 1), 0)
    gl = (s2 > 0.30) & (mx2 > 110) & m & (ar[..., 2] > 100)
    H = m.shape[0]
    vals = []
    for i in range(5):
        s3, e3 = H * i // 5, H * (i + 1) // 5
        vals.append(100 * gl[s3:e3].sum() / max(m[s3:e3].sum(), 1))
    print(f'{name:18}' + ''.join(f'{v:6.1f}%' for v in vals))
