"""낱장으로 받은 프레임들을 간격 있는 가로 스트립 한 장으로 이어 붙인다.

=== 왜 낱장으로 받는가 ===
한 장에 여러 프레임을 요청하면 **캔버스에 안 들어간다.** 실측:

    Gemini 출력 캔버스   1408px
    캐릭터 1명 폭        평균 232px (최대 265px)

    프레임수   붙여서   간격20   간격60
       4        926     1026     1226   ← 간격 60px 가능
       6       1389     1529     1809   ← 붙여야 겨우 (실제 결과가 1389px 였다)
       8       1852     2032     2392   ← 불가능

8프레임 요청에 6개가 온 것도, 6개가 전부 겹친 것도 지시를 무시해서가 아니라
**공간이 없어서**다. 프롬프트를 몇 번 고쳐도 같다.
→ 한 장에 한 프레임씩 받고, 이 스크립트로 이어 붙인다.

=== 입력 파일명 ===
tools/sprites/player_strips/parts/<anim>_f1.png ~ f<N>.png
    예) run_f1.png ... run_f6.png   /   idle_f1.png ... idle_f4.png

실행: python3 tools/sprites/stitch_frames.py run
      python3 tools/sprites/stitch_frames.py idle
출력: tools/sprites/player_strips/<anim>.png   (간격 60px, 초록 배경)
      tools/sprites/_stitch_<anim>.png         (확인용 미리보기)
"""
import sys
import pathlib

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = pathlib.Path(__file__).resolve().parent
STRIPS = HERE / 'player_strips'
PARTS = STRIPS / 'parts'
GAP = 60
GREEN = (11, 245, 5)


def cutout(path):
    """배경을 걷어내고 인물만 잘라낸다. 가장 큰 덩어리만 남긴다."""
    a = np.asarray(Image.open(path).convert('RGBA')).astype(float)
    R, G, B, A = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    if A.min() < 250:
        fg = A > 90
    else:
        fg = ~((G > 130) & (R < 160) & (B < 160) & (G - np.maximum(R, B) > 45))
    fg = ndimage.binary_opening(fg, np.ones((3, 3), bool))
    lab, n = ndimage.label(fg)
    if n > 1:
        sz = ndimage.sum(fg, lab, range(1, n + 1))
        fg = lab == (1 + int(np.argmax(sz)))       # 반짝이·잡티 제거
    ys, xs = np.nonzero(fg)
    box = (slice(ys.min(), ys.max() + 1), slice(xs.min(), xs.max() + 1))
    return a[..., :3][box], fg[box]


anim = sys.argv[1] if len(sys.argv) > 1 else 'run'
files = sorted(PARTS.glob(f'{anim}_f*.png'),
               key=lambda p: int(''.join(c for c in p.stem.split('_f')[-1] if c.isdigit())))
if not files:
    raise SystemExit(f'{PARTS}/{anim}_f1.png ~ 가 없다')

frames = [cutout(p) for p in files]
print(f'{anim}  낱장 {len(frames)}개')
print(f'{"":>4}{"파일":<30}{"크기":>12}{"픽셀":>9}')
for p, (rgb, fg) in zip(files, frames):
    print(f'{"":>4}{p.name:<30}{f"{fg.shape[1]}x{fg.shape[0]}":>12}{int(fg.sum()):>9}')

# 높이가 제각각이면 애니가 커졌다 작아진다. 여기서 경고만 하고,
# 실제 정규화는 build_player_sheet.py 의 '애니별 공통 배율'이 맡는다.
hs = [fg.shape[0] for _, fg in frames]
print(f'\n높이 {min(hs)}~{max(hs)}  편차 {max(hs) - min(hs)}px '
      f'({100 * (max(hs) - min(hs)) / max(hs):.1f}%)')
if (max(hs) - min(hs)) / max(hs) > 0.08:
    print('  ⚠️ 프레임마다 인물 크기가 8% 넘게 다르다 — 조립 후 커졌다 작아지는지 확인할 것')

H = max(hs)
W = sum(fg.shape[1] for _, fg in frames) + GAP * (len(frames) + 1)
out = Image.new('RGB', (W, H), GREEN)
x = GAP
for rgb, fg in frames:
    a3 = fg[..., None].astype(float)
    comp = (rgb * a3 + np.array(GREEN)[None, None, :] * (1 - a3)).astype(np.uint8)
    out.paste(Image.fromarray(comp, 'RGB'), (x, H - fg.shape[0]))   # 발끝을 아래로 정렬
    x += fg.shape[1] + GAP
dst = STRIPS / f'{anim}.png'
out.save(dst)
print(f'\nsaved {dst.relative_to(HERE)}  {out.size}  (간격 {GAP}px)')

# 미리보기
Z = 260
cells = []
for rgb, fg in frames:
    im = Image.fromarray(np.dstack([rgb, fg * 255.0]).astype(np.uint8), 'RGBA')
    cells.append(im.resize((max(1, round(im.width * Z / im.height)), Z), Image.LANCZOS))
g = 12
sheet = Image.new('RGB', (sum(c.width for c in cells) + g * (len(cells) + 1), Z + 42),
                  (26, 26, 30))
d = ImageDraw.Draw(sheet)
d.text((8, 6), f'{anim} — 낱장 {len(frames)}개를 이어 붙임. 다리가 잘린 곳이 없어야 한다',
       fill=(200, 210, 205))
x = g
for i, c in enumerate(cells):
    sheet.paste(c, (x, 26), c)
    d.text((x, Z + 28), f'f{i + 1}', fill=(180, 190, 185))
    x += c.width + g
sheet.save(HERE / f'_stitch_{anim}.png')
print(f'saved _stitch_{anim}.png  {sheet.size}')
