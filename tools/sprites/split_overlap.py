"""겹쳐서 그려진 스트립을 세로 최소 지점에서 잘라 프레임으로 분리한다.

=== 왜 필요한가 ===
Gemini 가 프레임 간격 지시를 못 지킨다. `run.png` 실측:
    빈 열 19 / 1408 (1.3%)  → 런렝스 분리로는 1덩어리로 잡힌다
두 번 요청했는데 두 번 다 같았다. 프롬프트로는 못 고친다.

대신 **겹침이 얕다**. 인물 경계에서 세로 채움이 중앙값의 21~53% 로 떨어진다.
그 최소 지점에서 자르면 프레임이 나뉜다. 팔·다리 끝이 조금 잘릴 수 있으므로
결과를 반드시 눈으로 볼 것.

실행: python3 tools/sprites/split_overlap.py run 6
      python3 tools/sprites/split_overlap.py run 6 --write   ← 간격 넣어 다시 저장
출력: tools/sprites/_split_<name>.png       (분리 결과 미리보기)
      tools/sprites/player_strips/<name>.png (--write 일 때만, 간격 60px 로 재조립)
"""
import sys
import pathlib

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = pathlib.Path(__file__).resolve().parent
STRIPS = HERE / 'player_strips'

GAP_OUT = 60          # 재조립할 때 넣을 간격. 조립 스크립트의 런렝스 분리용
SEARCH = 0.32         # 경계 탐색 폭 (1인분 폭 대비)
SMOOTH = 21           # 프로파일 평활 창. 잔털 하나에 경계가 끌려가지 않게


def foreground(path):
    a = np.asarray(Image.open(path).convert('RGBA')).astype(float)
    R, G, B, A = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    if A.min() < 250:
        fg = A > 90
    else:
        fg = ~((G > 130) & (R < 160) & (B < 160) & (G - np.maximum(R, B) > 45))
    fg = ndimage.binary_opening(fg, np.ones((3, 3), bool))
    lab, n = ndimage.label(fg)
    sz = ndimage.sum(fg, lab, range(1, n + 1))
    fg = np.isin(lab, [i + 1 for i in range(n) if sz[i] > 2000])   # 반짝이·잡티 제거
    return a, fg


def find_cuts(fg, n):
    """세로 채움 프로파일의 국소 최소에서 경계를 찾는다."""
    col = fg.sum(axis=0).astype(float)
    xs = np.nonzero(col)[0]
    x0, x1 = int(xs.min()), int(xs.max())
    prof = col[x0:x1 + 1]
    sm = ndimage.uniform_filter1d(prof, SMOOTH)
    W = len(prof)
    cuts, quality = [], []
    med = np.median(prof[prof > 0])
    for k in range(1, n):
        c = k * W / n
        lo = max(0, int(c - W / n * SEARCH))
        hi = min(W, int(c + W / n * SEARCH))
        j = lo + int(np.argmin(sm[lo:hi]))
        cuts.append(x0 + j)
        quality.append(prof[j] / max(med, 1))
    return x0, x1, cuts, quality


name = sys.argv[1] if len(sys.argv) > 1 else 'run'
n = int(sys.argv[2]) if len(sys.argv) > 2 else 8
write = '--write' in sys.argv
even = '--even' in sys.argv     # 균등 셀 분할 — "6등분 셀에 한 명씩" 으로 받았을 때

src = STRIPS / f'{name}.png'
a, fg = foreground(src)
if even:
    # 프롬프트에서 '균등한 셀 6개' 로 요청했고 실제로 그렇게 왔을 때.
    # 인물 탐색 없이 이미지 폭을 그냥 n 등분한다. 겹침 판정이 필요 없다.
    W = a.shape[1]
    x0, x1 = 0, W - 1
    cuts = [round(W * k / n) for k in range(1, n)]
    qual = [0.0] * (n - 1)
    print('균등 분할 모드 — 이미지 폭을 그대로 n 등분한다')
else:
    x0, x1, cuts, qual = find_cuts(fg, n)
print(f'{src.name}  {a.shape[1]}×{a.shape[0]}   인물 {x0}~{x1}   프레임 {n}개로 분리')
for i, (c, q) in enumerate(zip(cuts, qual)):
    flag = '  ⚠️ 겹침 깊음' if q > 0.45 else ''
    print(f'  경계{i + 1}  x={c:4d}   채움 {100 * q:4.0f}% of 중앙값{flag}')

bounds = [x0] + cuts + [x1 + 1]
frames = []
for i in range(n):
    s, e = bounds[i], bounds[i + 1]
    sub = fg[:, s:e].copy()
    if not sub.any():
        print(f'  ✗ 프레임 {i + 1} 이 비었다'); continue
    # 자른 자리에 이웃 인물의 발광 조각이 딸려온다 → 가장 큰 덩어리만 남긴다
    lb, k = ndimage.label(sub)
    if k > 1:
        szs = ndimage.sum(sub, lb, range(1, k + 1))
        sub = lb == (1 + int(np.argmax(szs)))
    ys, xs = np.nonzero(sub)
    box = (slice(ys.min(), ys.max() + 1), slice(s + xs.min(), s + xs.max() + 1))
    rgb = a[..., :3][box]
    al = sub[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    frames.append((rgb, al))
print(f'\n분리된 프레임 {len(frames)}개')
print(f'{"":>4}{"크기":>12}{"발끝y":>8}{"픽셀":>9}')
for i, (rgb, al) in enumerate(frames):
    print(f'{i + 1:>4}{f"{al.shape[1]}x{al.shape[0]}":>12}{al.shape[0]:>8}{int(al.sum()):>9}')

# ------------------------------------------------------------ 미리보기
Z = 300
cells = []
for rgb, al in frames:
    im = Image.fromarray(np.dstack([rgb, al * 255.0]).astype(np.uint8), 'RGBA')
    w = max(1, round(im.width * Z / im.height))
    cells.append(im.resize((w, Z), Image.LANCZOS))
gap = 14
sheet = Image.new('RGB', (sum(c.width for c in cells) + gap * (len(cells) + 1), Z + 46),
                  (26, 26, 30))
d = ImageDraw.Draw(sheet)
d.text((8, 6), f'{name}.png 를 {len(frames)}프레임으로 분리 — 팔·다리가 잘렸는지 볼 것',
       fill=(200, 210, 205))
x = gap
for i, c in enumerate(cells):
    sheet.paste(c, (x, 26), c)
    d.text((x, Z + 30), f'f{i + 1}', fill=(180, 190, 185))
    x += c.width + gap
sheet.save(HERE / f'_split_{name}.png')
print(f'\nsaved _split_{name}.png  {sheet.size}')

# ------------------------------------------------------------ 재조립
if write:
    # 조립 스크립트가 런렝스로 다시 나눌 수 있게 간격을 넣어 저장한다.
    GREEN = (11, 245, 5)
    H = max(al.shape[0] for _, al in frames)
    W = sum(al.shape[1] for _, al in frames) + GAP_OUT * (len(frames) + 1)
    out = Image.new('RGB', (W, H), GREEN)
    x = GAP_OUT
    for rgb, al in frames:
        a3 = al[..., None].astype(float)
        comp = (rgb * a3 + np.array(GREEN)[None, None, :] * (1 - a3)).astype(np.uint8)
        out.paste(Image.fromarray(comp, 'RGB'), (x, H - al.shape[0]))
        x += al.shape[1] + GAP_OUT
    bak = STRIPS / f'{name}_overlap_orig.png'
    if not bak.exists():
        Image.open(src).save(bak)
        print(f'원본 백업 → {bak.name}')
    out.save(src)
    print(f'재조립 저장 → {src.name}  {out.size}  (간격 {GAP_OUT}px)')
