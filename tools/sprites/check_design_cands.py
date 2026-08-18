"""캐릭터 시안을 합격 조건으로 판정하고, 게임 크기로 나란히 놓는다.

=== 합격 조건 (docs/캐릭터_재설계_SD.md §1) ===
  ① 하반신폭비 ≤ 0.75 ← 다리가 드러나야 달리기가 성립한다. 이번 재설계의 전부
  ② 다리대비 ≥ 12    ← 다리가 옷과 명도로 갈린다
  ③ 몸통명도 50~58   (바닥 실측 42.3)
  ④ 국소대비 ≥ 14    ← **게임 크기 64px 에서** 잰다. 96px 원본에서 재면 안 된다
  ⑤ 활을 아래로       ← 수치로 못 잰다. 눈으로 본다

실행: python3 tools/sprites/check_design_cands.py
출력: tools/sprites/_cands_compare.png
"""
import pathlib

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = pathlib.Path(__file__).resolve().parent
CANDS = HERE / 'cands'


def cutout(path):
    """배경을 걷어내고 **인물만** 잘라낸다.

    ⚠️ 두 가지를 따로 처리해야 한다:
      · 알파가 이미 있는 파일(합성본)은 초록 판정을 쓰면 안 된다. 투명 영역의
        검정 픽셀이 몸통 명도를 32.5 까지 끌어내렸다.
      · 활을 따로 그려온 시안은 덩어리가 2개다. **가장 큰 덩어리(=인물)만** 쓴다.
        활까지 포함해서 재면 하반신 폭이 부풀어 1.00 이 나온다.
    """
    im = Image.open(path).convert('RGBA')
    a = np.asarray(im).astype(float)
    if a[..., 3].min() < 250:                   # 알파가 실제로 쓰이고 있다
        fg = a[..., 3] > 90
    else:
        R, G, B = a[..., 0], a[..., 1], a[..., 2]
        fg = ~((G > 130) & (R < 160) & (B < 160) & (G - np.maximum(R, B) > 45))
    a = a[..., :3]
    # 작은 잡티 제거 — AI 가 배경에 점을 흩뿌리는 경우가 있다
    fg = ndimage.binary_opening(fg, np.ones((3, 3)))
    lab, n = ndimage.label(fg)
    if n > 1:                                   # 가장 큰 덩어리만 인물로 본다
        sizes = ndimage.sum(fg, lab, range(1, n + 1))
        fg = lab == (1 + int(np.argmax(sizes)))
    ys, xs = np.nonzero(fg)
    sl = (slice(ys.min(), ys.max() + 1), slice(xs.min(), xs.max() + 1))
    return a[sl], fg[sl]


def hipratio(fg):
    """하반신 폭 / 몸통 폭. 낮을수록 다리가 드러난 것이다.

    ⚠️ 이 지표를 **세 번** 고쳤다. 앞의 둘은 실제 시안에서 틀린 답을 냈다.
      1) "옷자락 끝 높이"        → 부츠가 몸통만큼 넓어 전부 0.99. 무의미
      2) "덩어리 2개인 행의 비율" → 넝마가 갈라져 옛 idle.png 가 67.4% 로 통과
      3) 폭 0.16 조건을 붙인 2)  → 옛 idle 은 걸러냈지만, **측면 정지 자세에서는
         두 다리가 겹치므로 정상 시안까지 0.0% 가 나왔다.** 서 있는 그림엔 못 쓴다

    폭 비율은 셋 다 피해간다. 긴 로브는 아래까지 넓고(1.2), 다리가 드러나면
    좁아진다(0.46~0.50). 실측:
        옛 idle.png   1.21  1.22  1.17  1.20   ← 로브가 몸통보다도 넓다
        gem_N2 / N3   0.50  0.48  0.46  0.46
    합격선 0.75 는 두 무리 사이의 빈 구간이다.
    """
    H = fg.shape[0]
    w = fg.sum(axis=1).astype(float)
    torso = np.median(w[int(H * 0.30):int(H * 0.50)])
    lower = np.median(w[int(H * 0.72):int(H * 0.90)])
    return lower / max(torso, 1)


def measure(rgb, fg):
    Hh = fg.shape[0]
    hip = hipratio(fg)

    px = rgb[fg]
    mx = px.max(axis=1)
    mn = px.min(axis=1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    glow = (sat > 0.35) & (mx > 120)
    body = px[~glow]

    def band(lo, hi):
        s = fg.copy()
        s[:int(Hh * lo)] = False
        s[int(Hh * hi):] = False
        q = rgb[s]
        return q.mean() if len(q) > 50 else 0.0
    legc = abs(band(0.70, 0.95) - band(0.20, 0.50))

    # ⚠️ 국소대비는 게임 크기에서. 같은 idle.png 가 96px 9.30 / 64px 14.88 로 나온다.
    gh = 64
    gw = max(1, round(rgb.shape[1] * gh / rgb.shape[0]))
    gr = np.asarray(Image.fromarray(rgb.astype(np.uint8), 'RGB')
                    .resize((gw, gh), Image.LANCZOS), float)
    ga = np.asarray(Image.fromarray((fg * 255).astype(np.uint8), 'L')
                    .resize((gw, gh), Image.LANCZOS), float) > 90
    L = gr.mean(axis=2)
    d = np.abs(np.diff(L, axis=1))
    v = ga[:, :-1] & ga[:, 1:]
    lc = d[v].mean() if v.any() else 0.0

    hits = [hip <= 0.75, legc >= 12, 50 <= body.mean() <= 58, lc >= 14]
    return dict(hip=hip, legc=legc, body=body.mean(), lc=lc,
                glow=100 * glow.mean(), hits=hits, ok=all(hits))


files = sorted(CANDS.glob('gem_*.png')) + sorted(CANDS.glob('design_*.png'))
if not files:
    raise SystemExit('cands/ 에 gem_*.png 가 없다')

print(f'{"파일":<16}{"하반신폭비":>11}{"다리대비":>9}{"몸통명도":>9}{"국소대비":>9}{"발광%":>7}   통과')
print(f'{"합격선":<16}{"<=0.75":>11}{">=12":>9}{"50~58":>9}{">=14":>9}{"3~9":>7}')
res = []
for p in files:
    rgb, fg = cutout(p)
    m = measure(rgb, fg)
    mark = ''.join('O' if h else 'X' for h in m['hits'])
    print(f'{p.stem:<16}{m["hip"]:>11.2f}{m["legc"]:>9.1f}{m["body"]:>9.1f}'
          f'{m["lc"]:>9.2f}{m["glow"]:>7.1f}   {mark}')
    res.append((p.stem, rgb, fg, m))

# ---------------------------------------------------------------- 비교 시트
# 왼쪽 원본(높이 맞춤) / 오른쪽 게임 크기 53×64 를 6배. 판단은 오른쪽으로 한다.
OH, ZG, GH = 300, 6, 64
cells = []
for stem, rgb, fg, m in res:
    a4 = np.dstack([rgb, fg * 255.0]).astype(np.uint8)
    im = Image.fromarray(a4, 'RGBA')
    ow = max(1, round(im.width * OH / im.height))
    big = im.resize((ow, OH), Image.LANCZOS)
    gw = max(1, round(im.width * GH / im.height))
    small = im.resize((gw * 2, GH * 2), Image.LANCZOS).resize((gw, GH), Image.LANCZOS)
    cells.append((stem, m, big, small.resize((gw * ZG, GH * ZG), Image.NEAREST)))

pad, gap = 10, 18
cw = max(b.width + s.width + gap for _, _, b, s in cells) + pad * 2
sheet = Image.new('RGB', (cw * len(cells), OH + 76), (26, 26, 30))
d = ImageDraw.Draw(sheet)
d.text((8, 6), '왼쪽 = 원본  /  오른쪽 = 게임 표시 크기 53×64 를 6배 확대 '
               '(판단은 오른쪽으로)', fill=(200, 210, 205))
for i, (stem, m, big, small) in enumerate(cells):
    x = i * cw + pad
    sheet.paste(big, (x, 26), big)
    sheet.paste(small, (x + big.width + gap, 26 + (OH - small.height) // 2), small)
    col = (150, 230, 160) if m['ok'] else (225, 165, 150)
    d.text((x, OH + 34), f'{stem}   {"통과" if m["ok"] else "탈락"}', fill=col)
    d.text((x, OH + 50), f'하반신폭 {m["hip"]:.2f}  다리대비 {m["legc"]:.0f}  '
                         f'명도 {m["body"]:.0f}  대비 {m["lc"]:.1f}', fill=(170, 178, 174))
sheet.save(HERE / '_cands_compare.png')
print(f'\nsaved _cands_compare.png  {sheet.size}')
