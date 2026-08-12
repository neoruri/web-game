"""Codex(AI) 생성 프롭 → public/sprites/dungeon/props_iso.png 로 **적용** (N3 = 어둡게).

slice_codex_props.py 의 파이프라인을 N3 파라미터로 고정해 재현한다.
후보 생성/비교 코드는 빼고 적용 경로만 남겼다 — 언제든 다시 돌려 같은 결과를 얻는다.

=== 확정값 ===
  공통 배율 K = 0.30 (셀 높이를 넘는 프롭만 개별 축소 → 실제로 기둥 하나)
  톤: 명도 57 목표, 색조는 바닥과 완전 일치(R−B +3.5 / G−R +5.9)
  bbox 하단을 y=111 에 정렬 (기존 시트와 동일 → main.js 수정 0)

=== 백업을 만들지 않는 이유 ===
  public/ 아래 파일은 Vite 가 dist 로 통째로 복사한다. props_iso_OLD.png 을 두면
  그대로 배포된다(tileset_iso_stone_OLD.png 로 이미 겪은 문제).
  이전 버전은 git 히스토리에 있으므로 파일 백업은 불필요하다.

실행: python3 tools/sprites/apply_props_n3.py
"""
import pathlib

import numpy as np
from PIL import Image, ImageFilter

HERE = pathlib.Path(__file__).resolve().parent
PUB = HERE.parent.parent / 'public' / 'sprites' / 'dungeon'
SRC = HERE / 'Codex 이미지 2026년 8월 12일 오후 04_12_48.png'
OUT = PUB / 'props_iso.png'

CW, CH = 96, 112
ANCHOR = CH - 10          # 102 — main.js drawProps 와 동일
BOTTOM = CH - 1           # 111
K = 0.30
MAXH = 109
FLOOR_RB, FLOOR_GR = 3.5, 5.9
TARGET_L = 57.0           # N3

# ---------------------------------------------------------------- 크로마키(언매팅)
src = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float64)
R, G, B = src[..., 0], src[..., 1], src[..., 2]
core = (R > 180) & (B > 180) & (G < 110)
BG = src[core].mean(axis=0)


def magentaness(a):
    return (a[..., 0] + a[..., 2]) / 2 - a[..., 1]


m = magentaness(src)
m_bg = magentaness(BG[None, None, :])[0, 0]
m_fg = np.percentile(m[~core], 92)
alpha = np.clip((m_bg - m) / (m_bg - m_fg), 0, 1)
alpha[core] = 0.0
a3 = alpha[..., None]
with np.errstate(invalid='ignore', divide='ignore'):
    un = np.where(a3 > 0.02, (src - (1 - a3) * BG[None, None, :]) / np.maximum(a3, 1e-6), 0)
full = Image.fromarray(np.dstack([np.clip(un, 0, 255), alpha * 255]).astype(np.uint8), 'RGBA')

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
assert len(runs) == 8, f'덩어리 {len(runs)}개 — 8개여야 한다'

cells_raw = []
for x0, x1 in runs:
    sub = opaque[:, x0:x1 + 1]
    yy, xx = np.nonzero(sub)
    cells_raw.append(full.crop((x0 + xx.min(), yy.min(), x0 + xx.max() + 1, yy.max() + 1)))


def to_cell(im):
    k = K
    if im.height * k > MAXH:
        k = MAXH / im.height
    if im.width * k > CW - 4:
        k = (CW - 4) / im.width
    w, h = max(1, round(im.width * k)), max(1, round(im.height * k))
    r = im.resize((w * 2, h * 2), Image.LANCZOS).resize((w, h), Image.BOX)
    r = r.filter(ImageFilter.UnsharpMask(radius=1.0, percent=80, threshold=3))
    cell = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    cell.alpha_composite(r, ((CW - w) // 2, BOTTOM - h + 1))
    return cell


base = [to_cell(im) for im in cells_raw]


# ---------------------------------------------------------------- 톤
def tone(cell, gamma, contrast=1.06):
    a = np.asarray(cell, float).copy()
    rgb, al = a[..., :3], a[..., 3]
    msk = al > 8
    if msk.sum() == 0:
        return cell
    x = np.clip(rgb, 0, 255) / 255.0
    xd = x ** gamma
    mm = xd[msk].mean()
    out = np.clip(((xd - mm) * contrast + mm) * 255, 0, 255)
    d_rb = FLOOR_RB - (out[..., 0] - out[..., 2])[msk].mean()
    out[..., 0] += d_rb * 0.5
    out[..., 2] -= d_rb * 0.5
    d_gr = FLOOR_GR - (out[..., 1] - out[..., 0])[msk].mean()
    out[..., 1] += d_gr * 0.66
    out[..., 0] -= d_gr * 0.17
    out[..., 2] -= d_gr * 0.17
    return Image.fromarray(np.dstack([np.clip(out, 0, 255), al]).astype(np.uint8), 'RGBA')


def mean_L(cells):
    v = []
    for c in cells:
        a = np.asarray(c, float)
        msk = a[..., 3] > 128
        if msk.sum():
            v.append(a[..., :3][msk].mean())
    return float(np.mean(v))


lo, hi = 0.6, 3.0
for _ in range(30):
    g = (lo + hi) / 2
    if mean_L([tone(c, g) for c in base]) > TARGET_L:
        lo = g
    else:
        hi = g
GAMMA = (lo + hi) / 2
cells = [tone(c, GAMMA) for c in base]
print(f'gamma {GAMMA:.4f} → 평균 명도 {mean_L(cells):.1f} (목표 {TARGET_L})')

# ---------------------------------------------------------------- 저장
sheet = Image.new('RGBA', (CW * 8, CH), (0, 0, 0, 0))
for i, c in enumerate(cells):
    sheet.paste(c, (i * CW, 0), c)
sheet.save(OUT)
print(f'적용: {OUT}  {sheet.size}  {OUT.stat().st_size / 1024:.0f}KB')

# ---------------------------------------------------------------- 검증
print('\n--- 계약 검증 ---')
chk = Image.open(OUT).convert('RGBA')
a = np.asarray(chk)
ok = True


def assert_(cond, msg):
    global ok
    print(('  ✅ ' if cond else '  ❌ ') + msg)
    ok = ok and cond


assert_(chk.size == (768, 112), f'시트 크기 768×112 (실제 {chk.size[0]}×{chk.size[1]})')
bots, tops = [], []
for i in range(8):
    c = a[:, i * CW:(i + 1) * CW, 3]
    yy, xx = np.nonzero(c > 8)
    bots.append(int(yy.max()))
    tops.append(int(yy.min()))
    assert_(xx.max() < CW and xx.min() >= 0, f'{i}번 폭이 셀 안에 있다 (w={xx.max() - xx.min() + 1})')
assert_(all(b == BOTTOM for b in bots), f'8칸 모두 하단 y={BOTTOM} (실제 {sorted(set(bots))})')
assert_(max(a[..., 3].max(axis=0)) > 0, '알파 채널 존재')

# 6번 횃불 화로 = 코드의 it.sy - 76
t6 = a[:, 6 * CW:7 * CW, 3] > 40
ys, _ = np.nonzero(t6)
roww = t6.sum(axis=1)
top6 = ys.min()
bowl = top6 + int(np.argmax(roww[top6:top6 + 22]))
assert_(abs((ANCHOR - bowl) - 76) <= 6,
        f'횃불 화로 접지선 기준 {ANCHOR - bowl}px 위 (코드 기대 76px, 허용 ±6)')

# 마젠타 프린지
px = a[..., :3][a[..., 3] > 20].astype(int)
frin = int((((px[:, 0] + px[:, 2]) / 2 - px[:, 1]) > 25).sum())
assert_(frin == 0, f'마젠타 프린지 {frin}px')

L = px.mean()
rb = (px[:, 0] - px[:, 2]).mean()
gr = (px[:, 1] - px[:, 0]).mean()
print(f'\n  톤: 명도 {L:.1f}  R−B {rb:+.1f}  G−R {gr:+.1f}   '
      f'(바닥 40.9 / {FLOOR_RB:+.1f} / {FLOOR_GR:+.1f} → 명도차 {L - 40.9:.1f})')
assert_(15 <= L - 40.9 <= 32, '바닥과 명도차가 15~32 범위')
assert_(abs(rb - FLOOR_RB) < 6 and abs(gr - FLOOR_GR) < 6, '색조가 바닥과 6 이내')

print('\n' + ('전부 통과 — main.js 수정 불필요' if ok else '⚠️ 실패 항목 있음'))
