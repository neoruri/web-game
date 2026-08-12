"""Codex(AI) 생성 프롭 8종 → props_iso.png 규격(96×112 × 8칸)으로 변환. 후보 3안, 적용 안 함.

=== 원본 실측 ===
  1774×887, 마젠타 배경 85.8%, 8덩어리 검출 (순서·역할 모두 요구사항과 일치)
  전체 명도 72.4   R−B **+22.5**   G−R −6.2
  새 바닥     40.9   R−B  +3.5     G−R +5.9

⚠️ 기존 프롭(R−B −20.9, 파랑기)과 **반대 방향**으로 틀어졌다. 이번 건 따뜻한 카키다.
   → 명도를 조금 내리고(72.4 → 62~65) 색조를 초록 쪽으로 19 정도 되돌린다.

⚠️ match_props.py 의 "따뜻한 픽셀 보호(R−B>25)" 트릭은 **이 소스에 쓸 수 없다.**
   전체의 45.8% 가 R−B>25 라서 절반을 보호해버린다.
   애초에 보호가 불필요하다 — 횃불 불꽃은 코드(gfxFlames)가 그리고,
   스프라이트의 장작은 그냥 어두운 나무다.

=== 규격 (main.js drawProps / gen_props.py 확인) ===
  셀 96×112, 확대 없이 1:1 로 그려짐
  ANCHOR = CH-10 = 102  ← 접지선. 그림자가 아래 9px 을 채운다
  기존 시트는 8칸 모두 불투명 최하단이 y=111 → **bbox 하단을 111 에 맞추면 동일 거동**
  6번 횃불: 화로가 접지선 기준 76px 위 (fctx 광원 + torchLights 좌표)

실행: python3 tools/sprites/slice_codex_props.py
출력: tools/sprites/_codex_props_preview.png      (새 바닥 위에 3안 비교)
      tools/sprites/props_iso_N{1,2,3}.png        (후보, 적용 안 함)
"""
import pathlib

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = pathlib.Path(__file__).resolve().parent
PUB = HERE.parent.parent / 'public' / 'sprites' / 'dungeon'
SRC = HERE / 'Codex 이미지 2026년 8월 12일 오후 04_12_48.png'

CW, CH = 96, 112
ANCHOR = CH - 10          # 102 — 코드와 동일
BOTTOM = CH - 1           # 111 — bbox 하단을 여기 맞춘다(기존 시트와 동일)
TW, TH = 128, 64
FLOOR_L, FLOOR_RB, FLOOR_GR = 40.9, 3.5, 5.9

# ---------------------------------------------------------------- 크로마키
# 단순 임계값으로 자르면 경계에 마젠타 프린지가 남는다.
# 배경색이 8842종(노이즈/압축)이라 언매팅으로 알파를 추정하고 배경 성분을 뺀다.
src = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float64)
R, G, B = src[..., 0], src[..., 1], src[..., 2]

core = (R > 180) & (B > 180) & (G < 110)
BG = src[core].mean(axis=0)                       # 배경 대표색 (≈243,11,240)
print(f'배경 대표색 {BG.round(1)}   코어 비율 {100 * core.mean():.1f}%')


def magentaness(arr):
    """마젠타다움 = (R+B)/2 - G.  배경에서 최대, 회녹색 돌에서 최소."""
    return (arr[..., 0] + arr[..., 2]) / 2 - arr[..., 1]


m = magentaness(src)
m_bg = magentaness(BG[None, None, :])[0, 0]
# alpha=0 이 배경, alpha=1 이 물체. 돌의 magentaness 상한을 물체 기준선으로 삼는다.
m_fg = np.percentile(m[~core], 92)
alpha = np.clip((m_bg - m) / (m_bg - m_fg), 0, 1)
alpha[core] = 0.0

# 배경 성분 제거 — out = (px - (1-a)*BG) / a
a3 = alpha[..., None]
with np.errstate(invalid='ignore', divide='ignore'):
    un = np.where(a3 > 0.02, (src - (1 - a3) * BG[None, None, :]) / np.maximum(a3, 1e-6), 0)
rgba = np.dstack([np.clip(un, 0, 255), alpha * 255]).astype(np.uint8)
full = Image.fromarray(rgba, 'RGBA')

# ---------------------------------------------------------------- 8칸 분리
opaque = alpha > 0.35
cols = opaque.any(axis=0)
runs, s = [], None
for i, v in enumerate(cols):
    if v and s is None:
        s = i
    elif not v and s is not None:
        if i - s > 15:
            runs.append((s, i - 1))
        s = None
if s is not None:
    runs.append((s, len(cols) - 1))
assert len(runs) == 8, f'덩어리 {len(runs)}개 — 8개가 아니면 수동 분리 필요'

cells_raw = []
for x0, x1 in runs:
    sub = opaque[:, x0:x1 + 1]
    yy, xx = np.nonzero(sub)
    cells_raw.append(full.crop((x0 + xx.min(), yy.min(), x0 + xx.max() + 1, yy.max() + 1)))

print(f'\n{"#":>2} {"원본 w×h":>12} → {"셀 w×h":>10}')

# ---------------------------------------------------------------- 스케일
# ⚠️ 1차 시도: "기둥을 셀 높이에 맞추는 공통 배율"(K=0.251) → 실패.
#    이 AI 기둥은 434/173 = 2.51 로 매우 슬림한데 기존 기둥은 112/75 = 1.49 였다.
#    기둥 기준으로 맞추면 나머지 7종이 전부 작아진다(무덤 45×71 vs 기존 75×81).
# → 공통 배율은 **나머지 7종이 기존 크기와 비슷해지도록** 잡고(K=0.30),
#   높이가 셀을 넘는 프롭만 개별로 줄인다. 실제로 기둥 하나만 걸린다.
K = 0.30
MAXH = 109                                        # 셀 높이 - 여유


def to_cell(im):
    """공통 배율로 축소 → 96×112 셀 중앙 하단 정렬. 축소로 잃은 선명도를 약하게 되돌린다."""
    k = K
    if im.height * k > MAXH:                      # 기둥만 해당
        k = MAXH / im.height
    if im.width * k > CW - 4:                     # 폭이 셀을 넘으면 폭 기준으로
        k = (CW - 4) / im.width
    w = max(1, round(im.width * k))
    h = max(1, round(im.height * k))
    r = im.resize((w * 2, h * 2), Image.LANCZOS).resize((w, h), Image.BOX)
    r = r.filter(ImageFilter.UnsharpMask(radius=1.0, percent=80, threshold=3))
    cell = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    cell.alpha_composite(r, ((CW - w) // 2, BOTTOM - h + 1))
    return cell


OLD_SIZE = [(75, 81), (75, 81), (75, 61), (53, 112), (76, 67), (83, 77), (41, 98), (75, 24)]
base_cells = []
for i, im in enumerate(cells_raw):
    c = to_cell(im)
    base_cells.append(c)
    a = np.asarray(c)
    yy, xx = np.nonzero(a[..., 3] > 40)
    print(f'{i:>2} {im.width:>5}×{im.height:<5} → {xx.max() - xx.min() + 1:>3}×'
          f'{yy.max() - yy.min() + 1:<4}   (기존 {OLD_SIZE[i][0]}×{OLD_SIZE[i][1]})')

# 횃불 화로 검증 — 코드는 접지선 76px 위(it.sy - 76)에 불꽃/광원을 그린다.
# "최상단"이 아니라 **화로 그릇의 테두리**가 그 높이에 와야 불꽃이 그릇에서 피어난다.
# 그릇은 폭이 급격히 넓어지는 지점이다 → 행별 폭을 훑어 상단 최대폭 행을 찾는다.
t = np.asarray(base_cells[6])[..., 3] > 40
ys, xs = np.nonzero(t)
roww = t.sum(axis=1)
top = ys.min()
bowl = top + int(np.argmax(roww[top:top + 22]))   # 상단 22px 안에서 가장 넓은 행 = 그릇 테두리
print(f'\n6번 횃불: 높이 {ys.max() - top + 1}px  최상단 y={top}  '
      f'그릇테두리 y={bowl} → 접지선({ANCHOR}) 기준 {ANCHOR - bowl}px 위   [코드 기대값 76px]')
if abs((ANCHOR - bowl) - 76) > 6:
    print('   ⚠️ 76px 에서 6px 이상 벗어남 — 불꽃이 그릇과 어긋난다')
else:
    print('   ✅ 허용 범위 (불꽃이 그릇에서 피어난다)')


# ---------------------------------------------------------------- 톤 보정
def tone(cell, gamma, contrast, hue_pull):
    """gamma/contrast 로 명도, hue_pull 로 색조를 바닥 쪽(R−B +3.5 / G−R +5.9)으로."""
    a = np.asarray(cell, float).copy()
    rgb, al = a[..., :3], a[..., 3]
    msk = al > 8
    if msk.sum() == 0:
        return cell
    x = np.clip(rgb, 0, 255) / 255.0
    xd = x ** gamma
    mm = xd[msk].mean()
    out = np.clip(((xd - mm) * contrast + mm) * 255, 0, 255)

    # 색조: R−B 와 G−R 을 각각 목표로 당긴다. 명도 보존을 위해 합을 유지한다.
    d_rb = (FLOOR_RB - (out[..., 0] - out[..., 2])[msk].mean()) * hue_pull
    out[..., 0] += d_rb * 0.5
    out[..., 2] -= d_rb * 0.5
    d_gr = (FLOOR_GR - (out[..., 1] - out[..., 0])[msk].mean()) * hue_pull
    out[..., 1] += d_gr * 0.66
    out[..., 0] -= d_gr * 0.17
    out[..., 2] -= d_gr * 0.17
    return Image.fromarray(
        np.dstack([np.clip(out, 0, 255), al]).astype(np.uint8), 'RGBA')


# ⚠️ 1차 후보(hue_pull 0.55/0.80/1.00 을 gamma 와 같이 움직임)는 설계가 틀렸다.
#    밝기와 색조가 뒤섞여서 "N1은 밝지만 색조가 안 맞고, N3은 색조는 맞지만 어둡다"가 됐다.
#    → **색조는 항상 완전히 맞추고(hue_pull=1.0), 밝기만 3단계로 나눈다.**
#      그래야 사용자가 판단할 변수가 "밝기" 하나로 줄어든다.
def solve_gamma(target_L):
    """목표 평균 명도가 나오는 gamma 를 이분법으로 찾는다."""
    lo, hi = 0.6, 3.0
    for _ in range(28):
        g = (lo + hi) / 2
        L = stats_L([tone(c, g, 1.06, 1.0) for c in base_cells])
        if L > target_L:
            lo = g
        else:
            hi = g
    return (lo + hi) / 2


def stats_L(cells):
    vs = []
    for c in cells:
        a = np.asarray(c, float)
        msk = a[..., 3] > 128
        if msk.sum():
            vs.append(a[..., :3][msk].mean())
    return float(np.mean(vs))


sets = [('원본 (보정 없음)', base_cells)]
for label, tL in (('N1  밝게', 69), ('N2  권장', 63), ('N3  어둡게', 57)):
    g = solve_gamma(tL)
    print(f'{label}: 목표 명도 {tL} → gamma {g:.3f}')
    sets.append((label, [tone(c, g, 1.06, 1.0) for c in base_cells]))

for (name, cells), key in zip(sets[1:], ('N1', 'N2', 'N3')):
    sheet = Image.new('RGBA', (CW * 8, CH), (0, 0, 0, 0))
    for i, c in enumerate(cells):
        sheet.paste(c, (i * CW, 0), c)
    sheet.save(HERE / f'props_iso_{key}.png')

# ---------------------------------------------------------------- 새 바닥 위 비교
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
    cxp = PW // 2
    base = PH // 2 - 40
    d = ImageDraw.Draw(img)
    for i, cl in enumerate(cells):
        row, col = divmod(i, 4)
        x = cxp + (col - 1.5) * 110
        y = base + row * 96
        # 횃불(6번)은 코드가 바닥 광원을 깐다 — 게임과 같은 조건으로 재현
        if i == 6:
            gl = Image.new('RGBA', (PW, PH), (0, 0, 0, 0))
            gd = ImageDraw.Draw(gl)
            for rr in range(118, 0, -3):
                al = int(46 * (1 - rr / 118) ** 1.5)
                gd.ellipse([x - rr, y - 10 - rr * 0.42, x + rr, y - 10 + rr * 0.42],
                           fill=(255, 176, 92, al))
            img = Image.alpha_composite(img, gl)
            d = ImageDraw.Draw(img)
        img.alpha_composite(cl, (int(x - CW / 2), int(y - BOTTOM)))

    for dx, dy in ((-190, -120), (170, -100), (-60, 150), (120, 170)):
        rr = gob.width * 0.42
        d.ellipse([cxp + dx - rr, base + dy - rr * 0.34,
                   cxp + dx + rr, base + dy + rr * 0.34], fill=(0, 0, 0, 110))
        img.alpha_composite(gob, (cxp + dx - gob.width // 2,
                                  base + dy - int(gob.height * 0.72)))
    img.alpha_composite(player, (cxp - player.width // 2, base + 250))

    v = Image.new('RGBA', (PW, PH), (0, 0, 0, 0))
    vd = ImageDraw.Draw(v)
    for i in range(70):
        al = int(150 * (1 - i / 70) ** 1.6)
        vd.line([(0, i), (PW, i)], fill=(6, 7, 10, al))
        vd.line([(0, PH - 1 - i), (PW, PH - 1 - i)], fill=(6, 7, 10, al))
    return Image.alpha_composite(img, v)


# 기존 프롭도 같은 조건으로 나란히 — "정말 나아졌는지" 판단 기준
old = Image.open(PUB / 'props_iso.png').convert('RGBA')
sets.insert(0, ('기존 프롭', [old.crop((i * CW, 0, (i + 1) * CW, CH)) for i in range(8)]))

PAD, LAB = 12, 24
panels = [(n, build(c)) for n, c in sets]
pw, ph = panels[0][1].size
sheet = Image.new('RGB', (PAD + (pw + PAD) * len(panels), PAD + LAB + ph + PAD), (10, 11, 13))
d = ImageDraw.Draw(sheet)
for i, (n, p) in enumerate(panels):
    x = PAD + (pw + PAD) * i
    d.text((x + 4, PAD + 4), n, fill=(180, 195, 185))
    sheet.paste(p.convert('RGB'), (x, PAD + LAB))
sheet.save(HERE / '_codex_props_preview.png')
print(f'\nsaved _codex_props_preview.png  {sheet.size}')


def stats(cells):
    Ls, rbs, grs = [], [], []
    for c in cells:
        a = np.asarray(c, float)
        msk = a[..., 3] > 128
        if msk.sum() == 0:
            continue
        rgb = a[..., :3][msk]
        Ls.append(rgb.mean())
        rbs.append((rgb[:, 0] - rgb[:, 2]).mean())
        grs.append((rgb[:, 1] - rgb[:, 0]).mean())
    return np.mean(Ls), np.mean(rbs), np.mean(grs)


print()
print(f'{"":18s}{"명도":>8}{"R-B":>8}{"G-R":>8}{"바닥과 명도차":>14}')
print(f'{"새 바닥 (목표)":18s}{FLOOR_L:8.1f}{FLOOR_RB:+8.1f}{FLOOR_GR:+8.1f}{0:14.1f}')
for name, cells in sets:
    L, rb, gr = stats(cells)
    print(f'{name:18s}{L:8.1f}{rb:+8.1f}{gr:+8.1f}{L - FLOOR_L:14.1f}')
print('\n(명도차 20~30 이 적당 — 0이면 바닥에 묻히고 40+면 뜬다.'
      ' R−B/G−R 은 바닥 값에 가까울수록 같은 조명 아래 있어 보인다)')
