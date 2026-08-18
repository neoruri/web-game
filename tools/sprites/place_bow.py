"""활을 따로 그려온 시안에서 활을 떼어내 손 옆에 내려 든 자세로 붙인다.

=== 왜 필요한가 ===
`gem_N2_c` 는 "활을 아래로 내려 들라"는 요청에 대해 **활을 캐릭터 옆에 별도 오브젝트로**
그려 왔다. 손은 비어 있다. 프롬프트 위반이지만 결과적으로 유리하다:

  · 캐릭터 실루엣이 활에 가리지 않는다 (앞으로 뻗은 활은 53×64 에서 폭의 절반을 먹었다)
  · 활을 **별도 레이어**로 둘 수 있다 → 몸통 애니와 독립적으로 각도를 줄 수 있고,
    run 8프레임마다 활을 다시 그릴 필요가 없다

이 스크립트는 두 가지를 만든다:
  1. 캐릭터만 (활 제거)          → cands/_split_char.png
  2. 활만                        → cands/_split_bow.png
  3. 활을 손 옆에 내려 든 합성    → cands/gem_N2_c_bowdown.png

실행: python3 tools/sprites/place_bow.py
"""
import pathlib

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = pathlib.Path(__file__).resolve().parent
CANDS = HERE / 'cands'
SRC = CANDS / 'gem_N2_c.png'

# ---- 튜닝 값 -------------------------------------------------------------
BOW_SCALE = 0.92        # 활 크기. 1.0 이면 원본 그대로
BOW_Y = 0.60            # 활 세로 중심을 몸 높이의 몇 % 에 둘지 (0.60 = 허리 조금 아래)
BOW_X_IN = 0.30         # 캐릭터 앞 가장자리에서 안쪽으로 활 폭의 몇 배만큼 들일지
BOW_TILT = -6.0         # 활 기울기(도). 음수 = 위쪽이 뒤로. 손목 각도를 흉내낸다
# --------------------------------------------------------------------------


def components(path):
    """알파 또는 초록 배경 기준으로 덩어리를 분리해 큰 것부터 돌려준다."""
    im = Image.open(path).convert('RGBA')
    a = np.asarray(im).astype(float)
    if a[..., 3].min() < 250:                      # 알파가 이미 있다
        fg = a[..., 3] > 90
    else:
        R, G, B = a[..., 0], a[..., 1], a[..., 2]
        fg = ~((G > 130) & (R < 160) & (B < 160) & (G - np.maximum(R, B) > 45))
    fg = ndimage.binary_opening(fg, np.ones((3, 3)))
    lab, n = ndimage.label(fg)
    sizes = ndimage.sum(fg, lab, range(1, n + 1))
    order = np.argsort(sizes)[::-1]
    out = []
    for k in order:
        if sizes[k] < 400:                         # 잡티
            continue
        m = lab == (k + 1)
        ys, xs = np.nonzero(m)
        sl = (slice(ys.min(), ys.max() + 1), slice(xs.min(), xs.max() + 1))
        rgba = a[sl].copy()
        rgba[..., 3] = m[sl] * 255.0
        out.append(Image.fromarray(rgba.astype(np.uint8), 'RGBA'))
    return out


parts = components(SRC)
print(f'덩어리 {len(parts)}개')
for i, p in enumerate(parts):
    print(f'  [{i}] {p.width}×{p.height}  종횡비 {p.width / p.height:.2f}')

# 캐릭터 = 가장 큰 것. 활 = 그다음 중 **세로로 긴 것**(종횡비 0.5 미만).
char = parts[0]
bow = next((p for p in parts[1:] if p.width / p.height < 0.5), None)
if bow is None:
    raise SystemExit('세로로 긴 활 덩어리를 못 찾았다 — BOW 판별 조건을 확인할 것')
char.save(CANDS / '_split_char.png')
bow.save(CANDS / '_split_bow.png')
print(f'\n캐릭터 {char.width}×{char.height}   활 {bow.width}×{bow.height}')

# ---------------------------------------------------------------- 합성
bw = max(1, round(bow.width * BOW_SCALE))
bh = max(1, round(bow.height * BOW_SCALE))
b = bow.resize((bw, bh), Image.LANCZOS).rotate(BOW_TILT, Image.BICUBIC, expand=True)

pad = b.width
canvas = Image.new('RGBA', (char.width + pad * 2, char.height), (0, 0, 0, 0))
canvas.paste(char, (pad, 0), char)

# 캐릭터의 앞(오른쪽) 가장자리를 활 높이 구간에서만 잰다 —
# 후드나 화살통 같은 위쪽 돌출부에 끌려가지 않게.
ca = np.asarray(char)[..., 3] > 90
cy = int(char.height * BOW_Y)
band = ca[max(0, cy - b.height // 2):min(char.height, cy + b.height // 2)]
front = pad + int(np.nonzero(band.any(axis=0))[0].max())

bx = front - int(b.width * BOW_X_IN)
by = cy - b.height // 2
canvas.alpha_composite(b, (bx, by))
ys, xs = np.nonzero(np.asarray(canvas)[..., 3] > 8)
out = canvas.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
out.save(CANDS / 'gem_N2_c_bowdown.png')
print(f'saved gem_N2_c_bowdown.png  {out.size}')

# ---------------------------------------------------------------- 미리보기
# 왼쪽 = 원본(활 따로) / 가운데 = 합성 / 오른쪽 = 합성을 게임 크기 53×64 로
GH, ZG, OH = 64, 6, 320
orig = Image.open(SRC).convert('RGBA')
oy, ox = np.nonzero(np.asarray(orig)[..., 3] > 8)
orig = orig.crop((ox.min(), oy.min(), ox.max() + 1, oy.max() + 1))


def fit(im, h):
    return im.resize((max(1, round(im.width * h / im.height)), h), Image.LANCZOS)


a_ = fit(orig, OH)
b_ = fit(out, OH)
gw = max(1, round(out.width * GH / out.height))
c_ = out.resize((gw * 2, GH * 2), Image.LANCZOS).resize((gw, GH), Image.LANCZOS)
c_ = c_.resize((gw * ZG, GH * ZG), Image.NEAREST)
gap = 24
sheet = Image.new('RGB', (a_.width + b_.width + c_.width + gap * 4, OH + 40), (26, 26, 30))
from PIL import ImageDraw                                                # noqa: E402
d = ImageDraw.Draw(sheet)
x = gap
for im, label in ((a_, '원본 (활 따로)'), (b_, '합성 (활 내려 듦)'),
                  (c_, f'게임 크기 {gw}×{GH} 를 {ZG}배')):
    sheet.paste(im, (x, 26 + (OH - im.height) // 2), im)
    d.text((x, 6), label, fill=(200, 210, 205))
    x += im.width + gap
sheet.save(HERE / '_bow_placement.png')
print(f'saved _bow_placement.png  {sheet.size}')
