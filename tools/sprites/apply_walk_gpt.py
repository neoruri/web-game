"""GPT walk 6프레임을 player_spritesheet.png 의 row 1 (run) 에 써넣는다.

=== 왜 GPT 를 골랐나 ===
나란히 재생해보고 사용자가 GPT 를 골랐고, 실측이 그 판단을 뒷받침한다.
보폭(앞발-뒷발 거리 / 키 %) 실측:

    Gemini   21  16   0  20  24  22    ← 0 하나 빼면 전부 ~20. 변화가 없다
    GPT       0  33  29  15  23  31    ← 0~33 을 오르내린다

Gemini 는 여섯 프레임 중 다섯이 같은 보폭이라 **다리만 좌우로 바뀐다.**
이전에 내가 'Gemini 가 인접변화 7 로 부드럽다' 고 보고했는데, 그 수치는
장점이 아니라 **보폭이 안 변한다는 결함 자체**를 재고 있었다. 순서를 어떻게
바꿔도 값이 다섯 개나 같아서 못 고친다 (전수탐색 484 → 246 이 한계).

발 각도(발 덩어리의 가로/세로비, 클수록 발바닥이 눕는다):
    Gemini   1.6 ~ 4.1   변화폭 2.6
    GPT      1.2 ~ 5.0   변화폭 3.8    ← 뒤꿈치 착지·발끝 밀기가 구분된다

프레임 순서는 **원래대로 0~5** 를 쓴다. 전수탐색으로 재배열해도 363 → 262
로 조금 나아질 뿐인데, 재배열하면 팔 스윙 연속성이 깨진다. 값어치가 없다.

실행: python3 tools/sprites/apply_walk_gpt.py
      python3 tools/sprites/apply_walk_gpt.py --write   ← 시트에 실제로 반영
출력: tools/sprites/_walk_applied.png  (조립 미리보기)
"""
import pathlib
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = pathlib.Path(__file__).resolve().parent
STRIPS = HERE / 'player_strips'
SHEET = HERE.parent.parent / 'public' / 'sprites' / 'dungeon' / 'deliverables' / 'player_spritesheet.png'

CW, CH, ANCHOR = 96, 116, 108
ROW = 1                                     # run 행
CUTS = [0, 298, 570, 830, 1108, 1380, 1774]
GLOW = np.array([224.0, 92.0, 255.0])       # #e05cff

# 발광 목표는 **idle 행(row 0)에서 직접 잰다.** 고정값을 쓰면 idle↔walk 전환에서
# 캐릭터가 번쩍인다. 현재 시트 row 0 실측은 6.10~6.91% 다.


def unmat(path):
    """초록 언매팅. 단순 임계값은 얇은 부분을 놓치므로 greenness 로 알파를 추정한다."""
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float64)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    core = (G > 170) & (R < 140) & (B < 140)
    BG = a[core].mean(axis=0)

    def greenness(x):
        return x[..., 1] - (x[..., 0] + x[..., 2]) / 2

    gv = greenness(a)
    g_bg = greenness(BG[None, None, :])[0, 0]
    g_fg = np.percentile(gv[~core], 92)
    al = np.clip((g_bg - gv) / (g_bg - g_fg), 0, 1)
    al[core] = 0.0
    a3 = al[..., None]
    with np.errstate(invalid='ignore', divide='ignore'):
        un = np.where(a3 > 0.02, (a - (1 - a3) * BG[None, None, :]) / np.maximum(a3, 1e-6), 0)
    return np.clip(un, 0, 255), al


def glow_area(rgb, mask):
    px = rgb[mask]
    mx, mn = px.max(axis=1), px.min(axis=1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    return ((sat > 0.30) & (mx > 100)).mean() * 100


def boost_glow(rgb, al, target):
    """자마젠타 발광을 목표 면적까지 끌어올린다. 마젠타다움에 비례해 당기므로 갑주는 안 건드린다.

    ⚠️ 세기 k 를 공식으로 한 번에 정하면 안 된다. 앞서 그렇게 했더니 clip 에 걸려
    k=1.0 이 되고 룬이 통째로 단색 마젠타로 덮였다. **이분탐색으로 목표에 맞춘다.**
    """
    m = al > 0.35
    cur = glow_area(rgb, m)
    if cur >= target:
        return rgb, cur, cur
    mag = (rgb[..., 0] + rgb[..., 2]) / 2 - rgb[..., 1]
    w = (np.clip((mag - 4) / 26, 0, 1) * m)[..., None]

    def apply(k):
        return np.clip(rgb * (1 - w * k) + GLOW[None, None, :] * (w * k), 0, 255)

    lo, hi = 0.0, 1.0
    if glow_area(apply(1.0), m) < target:
        out = apply(1.0)
        return out, cur, glow_area(out, m)
    for _ in range(18):
        mid = (lo + hi) / 2
        if glow_area(apply(mid), m) < target:
            lo = mid
        else:
            hi = mid
    out = apply(hi)
    return out, cur, glow_area(out, m)


def idle_glow():
    """row 0 (idle) 의 발광 면적 평균. walk 를 여기에 맞춘다."""
    a = np.asarray(Image.open(SHEET).convert('RGBA')).astype(float)
    vals = []
    for c in range(4):
        cell = a[0:CH, c * CW:(c + 1) * CW]
        m = cell[..., 3] > 90
        if m.sum() > 50:
            vals.append(glow_area(cell[..., :3], m))
    return float(np.mean(vals))


def tone_match(rgb, al, ref):
    """갑주(비발광) 평균색을 기준 시안에 맞춘다.

    GPT 는 같은 캐릭터를 **갈색 쪽으로** 그렸다. 실측 갑주 평균:
        gem_N2_c(기준)  [64.2 66.5 56.1]
        idle 행         [67.7 69.4 57.8]   기준과 3.5 이내 — 맞다
        GPT walk        [63.1 56.8 52.5]   G 가 9.7 낮다 — 갈색이다
    idle 과 walk 이 번갈아 재생되므로 이 차이는 **캐릭터가 바뀐 것처럼 보인다.**
    채널별 게인으로 맞춘다. 발광 픽셀은 건드리지 않는다(자색이 흐려진다).
    """
    m = al > 0.35
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    body = m & ~((sat > 0.30) & (mx > 100))
    cur = rgb[body].mean(axis=0)
    gain = np.clip(ref / np.maximum(cur, 1), 0.75, 1.35)
    out = rgb.copy()
    out[body] = np.clip(rgb[body] * gain[None, :], 0, 255)
    return out, cur, out[body].mean(axis=0), gain


REF_TONE = np.array([64.2, 66.5, 56.1])     # gem_N2_c 갑주 평균. 디자인 기준값이다

GLOW_TARGET = idle_glow()
rgb, al = unmat(STRIPS / 'gptwalk.png')
rgb, t0, t1, gain = tone_match(rgb, al, REF_TONE)
rgb, g0, g1 = boost_glow(rgb, al, GLOW_TARGET)
print(f'색 보정  갑주 {t0.round(1)} → {t1.round(1)}  (기준 {REF_TONE})  게인 {gain.round(3)}')
print(f'발광 목표 = idle 행 실측 평균 {GLOW_TARGET:.2f}%')

solid = al > 0.35
lab, n = ndimage.label(solid)
sz = ndimage.sum(solid, lab, range(1, n + 1))
keep = np.isin(lab, [i + 1 for i in range(n) if sz[i] > 2000])   # 반짝이·잡티 제거

boxes = []
for i in range(6):
    s = keep[:, CUTS[i]:CUTS[i + 1]]
    ys, xs = np.nonzero(s)
    boxes.append((ys.min(), ys.max(), CUTS[i] + xs.min(), CUTS[i] + xs.max()))

# ⚠️ 애니 단위 **공통 배율**. 프레임마다 따로 맞추면 재생 중에 캐릭터가 커졌다 작아진다.
hmax = max(b[1] - b[0] + 1 for b in boxes)
wmax = max(b[3] - b[2] + 1 for b in boxes)
k = min((ANCHOR - 4) / hmax, CW * 0.92 / wmax)

cells = []
for y0, y1, x0, x1 in boxes:
    sub = np.dstack([rgb[y0:y1 + 1, x0:x1 + 1], al[y0:y1 + 1, x0:x1 + 1] * 255]).astype(np.uint8)
    im = Image.fromarray(sub, 'RGBA')
    cells.append(im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))),
                           Image.LANCZOS))

print(f'gptwalk.png  배율 {k:.3f}  셀 안 최대 키 {round(hmax * k)}px  발광 {g0:.2f}% → {g1:.2f}%')

# ---------------------------------------------------------------- 가로 위치 = 몸통 기준
#
# ⚠️ bbox 중심으로 놓으면 안 된다. 상체가 앞뒤로 출렁거린다.
#
# bbox 는 **뻗은 다리까지 포함**한다. 다리는 몸통과 반대로 흔들리므로 bbox 중심은
# 거의 안 움직이는데(47.0~48.0), 그러면 몸통 쪽이 그만큼 밀려난다. 실측:
#
#     열        0     1     2     3     4     5     진폭
#     bbox중심  47.5  47.0  47.0  48.0  47.5  47.5   1.0   ← 고정돼 보이지만
#     엉덩이x   49.5  45.5  53.9  48.0  52.4  52.2   8.5   ← 몸통이 8.5px 출렁인다
#     머리x     49.1  46.1  53.3  47.1  51.8  52.0   7.2
#
# 게다가 이 출렁임은 매끄럽지도 않다. 열1→열2 에서 한 번에 8.4px 이 튄다.
# 걷기에서 몸통은 등속으로 나아가야 하므로 **가로 흔들림은 원래 거의 0** 이다.
# 리듬은 세로 흔들림이 담당한다(이미 맞다 — passing 이 가장 크고 contact 가 작다).
#
# 그래서 몸통(어깨~엉덩이) 중심으로 정렬하고, 리듬용으로 원래 흔들림의 SWAY 만 남긴다.
SWAY = 0.20            # 0 이면 완전 고정. 0.20 이면 8.5px → 1.7px (화면 0.9px)
if '--sway' in sys.argv:
    SWAY = float(sys.argv[sys.argv.index('--sway') + 1])


def torso_x(cell):
    """어깨~엉덩이 구간의 가로 중심. 다리 스윙에 안 끌린다."""
    m = np.asarray(cell)[..., 3] > 90
    ys = np.nonzero(m)[0]
    y0, y1 = ys.min(), ys.max()
    H = y1 - y0 + 1
    band = m[int(y0 + H * 0.16):int(y0 + H * 0.58), :]
    return float(np.nonzero(band)[1].mean())


tx = np.array([torso_x(c) for c in cells])
half = np.array([c.width / 2 for c in cells])
# 셀 안에서 몸통이 놓일 자리 = 중앙 + 남겨둘 흔들림
want = CW / 2 + (tx - tx.mean()) * SWAY
lefts = [int(round(want[i] - tx[i])) for i in range(6)]

print(f'\n가로 정렬  SWAY={SWAY}   몸통x 원본 {tx.round(1)}  진폭 {tx.max() - tx.min():.1f}px')
print(f'{"":>4}{"셀 안 크기":>12}{"왼쪽x":>8}{"정렬후 몸통x":>14}{"잘림":>8}')
for i, c in enumerate(cells):
    over = max(0, -lefts[i]) + max(0, lefts[i] + c.width - CW)
    print(f'{i:>4}{f"{c.width}x{c.height}":>12}{lefts[i]:>8}{lefts[i] + tx[i]:>14.1f}'
          f'{(str(over) + "px ⚠️") if over else "-":>8}')

# ---------------------------------------------------------------- 시트 반영
sheet = Image.open(SHEET).convert('RGBA')
assert sheet.size == (CW * 8, CH * 7), f'시트 규격이 다르다: {sheet.size}'

# 기존 row 1 을 지우고 새로 채운다. 열 6·7 은 비워둔다.
for i in range(8):
    sheet.paste(Image.new('RGBA', (CW, CH), (0, 0, 0, 0)), (i * CW, ROW * CH))
for i, c in enumerate(cells):
    sheet.paste(c, (i * CW + lefts[i], ROW * CH + ANCHOR - c.height), c)

if '--write' in sys.argv:
    bak = SHEET.with_name('player_spritesheet_prewalk.png')
    if not bak.exists():
        Image.open(SHEET).save(bak)
        print(f'\n원본 백업 → {bak.name}')
    sheet.save(SHEET)
    print(f'시트 반영 → {SHEET.name}  row {ROW} 에 6프레임')
else:
    print('\n(--write 없음 — 시트는 안 건드렸다)')

# ---------------------------------------------------------------- 미리보기
Z = 4
strip = sheet.crop((0, ROW * CH, CW * 6, ROW * CH + CH))
big = strip.resize((CW * 6 * Z, CH * Z), Image.NEAREST)
GH = 64
small = strip.resize((round(CW * 6 * GH / CH), GH), Image.LANCZOS).resize(
    (round(CW * 6 * GH / CH) * 6, GH * 6), Image.NEAREST)

pv = Image.new('RGB', (max(big.width, small.width) + 24, big.height + small.height + 78),
               (24, 25, 29))
d = ImageDraw.Draw(pv)
d.text((10, 6), 'row 1 (run) ← GPT walk.  위 = 시트 원본 4배 / 아래 = 게임 크기 64px 를 6배',
       fill=(200, 210, 205))
pv.paste(big, (12, 26), big)
pv.paste(small, (12, 26 + big.height + 20), small)
for i in range(6):
    d.line([(12 + i * CW * Z, 26), (12 + i * CW * Z, 26 + big.height)], fill=(70, 76, 84))
    d.text((16 + i * CW * Z, 26 + big.height + 2), f'열{i}', fill=(150, 160, 170))
# 접지선 — 여기서 발끝이 흔들리면 캐릭터가 떠 보인다
d.line([(12, 26 + ANCHOR * Z), (12 + big.width, 26 + ANCHOR * Z)], fill=(190, 90, 110))
pv.save(HERE / '_walk_applied.png')
print(f'saved _walk_applied.png  {pv.size}')

# ---------------------------------------------------------------- 검증
a = np.asarray(sheet)[ROW * CH:(ROW + 1) * CH, :CW * 6, 3] > 90
print(f'\n{"열":>3}{"키":>6}{"발끝y":>7}{"머리y":>7}{"중심x":>7}{"보폭%":>7}')
hs, fy, cx, st = [], [], [], []
for i in range(6):
    s = a[:, i * CW:(i + 1) * CW]
    ys, xs = np.nonzero(s)
    y0, y1 = ys.min(), ys.max()
    H = y1 - y0 + 1
    leg = np.zeros_like(s)
    leg[int(y1 - H * 0.22):y1 + 1, :] = s[int(y1 - H * 0.22):y1 + 1, :]
    lb, kk = ndimage.label(leg)
    fx = [np.nonzero(lb == (j + 1))[1].mean() for j in range(kk)
          if (lb == (j + 1)).sum() > H * 0.5]
    stride = 100 * (max(fx) - min(fx)) / H if len(fx) > 1 else 0.0
    hs.append(H); fy.append(y1); cx.append(xs.mean()); st.append(stride)
    print(f'{i:>3}{H:>6}{y1:>7}{y0:>7}{xs.mean():>7.1f}{stride:>7.1f}')
print(f'\n접지 편차 {max(fy) - min(fy)}px   키 편차 {max(hs) - min(hs)}px '
      f'({100 * (max(hs) - min(hs)) / max(hs):.1f}%)   중심 편차 {max(cx) - min(cx):.1f}px')
print(f'보폭 흐름 {[round(x) for x in st]}   인접 최대변화 '
      f'{max(abs(st[(i + 1) % 6] - st[i]) for i in range(6)):.0f}')
