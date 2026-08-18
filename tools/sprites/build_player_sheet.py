"""플레이어 애니메이션 스트립 10장 → player_spritesheet.png (96×116 × 8열 × 7행) 조립.

확정 파라미터
  · 크로마키: 초록 #00FF00 **언매팅** (임계값 방식은 활이 초록으로 남아 실패했다)
  · 망토 밑단 발광: 후처리로 부착, 강도 **강하게(1.2)** — AI 가 3번 연속 빼먹었다
  · 발광색 보정: 실측 [181,102,196] → 지정 #e05cff [224,92,255] 로 끌어올림
  · 접지선: 모든 프레임 발끝을 **y=108** 로 통일 (main.js ANCHOR = CH-10)
  · 프레임 수: idle 4 / run 8 / back_run 8 / attack 6 / multishot 6 / hit 3 / death 8 = 43장

입력: tools/sprites/player_strips/ 안에 아무 파일명이나 두고, 파일명에 아래 키워드를 넣는다
      idle / run / backrun / attack / multishot / hit / death_a / death_b  (정확 일치)

실행: python3 tools/sprites/build_player_sheet.py
출력: tools/sprites/_player_sheet_new.png   (검토용 — 통과하면 public/ 로 복사)
      tools/sprites/_player_sheet_report.png (프레임 정렬 리포트)
"""
import glob
import pathlib
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

HERE = pathlib.Path(__file__).resolve().parent
STRIPS = HERE / 'player_strips'
PUB = HERE.parent.parent / 'public' / 'sprites' / 'dungeon'
CW, CH = 96, 116
ANCHOR = 108              # 발끝 y — 기존 시트와 동일
COLS = 8
# 밑단 발광 목표 비율(%). "강하게"로 정했지만 고정 강도 1.2 는 과했다 —
# 96×116 셀로 축소하면서 발광이 집중되고 색 보정까지 겹쳐 밑단 26.9% > 손 17.2% 가 됐다.
# 강도-밑단% 는 비선형: 0.70→5.9 / 0.80→11.8 / 0.85→14.4 / 0.90→16.1 / 1.20→26.9
#
# ⚠️ 고정 강도를 쓰지 않는 이유: AI 가 스트립마다 밑단 발광을 **넣기도 하고 안 넣기도**
#    한다(idle 은 0.0% 였지만 다른 스트립은 다를 수 있다). 고정 강도면 이미 있는 것에
#    또 얹혀 스트립 간 밝기가 어긋난다.
# → 프레임마다 현재 밑단 비율을 재고, 목표치가 나오는 강도를 이분법으로 찾는다.
HEM_TARGET = 14.4         # 손 불꽃(약 17%)보다 낮게
HEM_MAX_STRENGTH = 1.4
GLOW_TARGET = np.array([224.0, 92.0, 255.0])   # #e05cff

# (행, 키워드, 기대 프레임수, 시트에서의 시작 열)
# ⚠️ run·back_run 을 4+4 로 쪼갠 것이 실패의 원인이었다.
#    "후반부"를 따로 요청하면 모델이 다르게 그릴 이유를 못 찾고 전반부를 그대로
#    재현했다(실측: 프레임별 실루엣 차이 0.1~1.5%, 정상 변화량은 33~46%).
#    → 한 장에 **6프레임 전체 사이클**을 요청한다. 한 이미지 안에서는 프레임끼리
#      달라야 한다는 걸 모델이 인식한다.
ROWS = [
    (0, [('idle', 4, 0)]),
    (1, [('run', 6, 0)]),
    (2, [('backrun', 8, 0)]),
    (3, [('attack', 6, 0)]),
    (4, [('multishot', 6, 0)]),
    (5, [('hit', 3, 0)]),
    (6, [('death_a', 4, 0), ('death_b', 4, 4)]),
]


def _norm(s):
    return s.lower().replace('_', '').replace('-', '').replace(' ', '')


def find(key):
    """파일명 **정확 일치**로 찾는다.

    ⚠️ 부분 일치는 쓸 수 없다 — 'run' 이 'backrun' 과 'run_a' 까지 잡아버린다(실제로 겪음).
    파일명은 아래 중 하나여야 한다:
      idle / run / backrun / attack / multishot / hit / death_a / death_b
    """
    k = _norm(key)
    for p in glob.glob(str(STRIPS / '*')):
        if _norm(pathlib.Path(p).stem) == k:
            return p
    return None


# 폐기된 파일명이 남아 있으면 경고 — run 을 4+4 로 쪼갠 구버전
_stale = [pathlib.Path(p).name for p in glob.glob(str(STRIPS / '*'))
          if _norm(pathlib.Path(p).stem) in ('runa', 'runb', 'backruna', 'backrunb')]
if _stale:
    print(f'⚠️ 구버전 파일 무시됨: {", ".join(_stale)}')
    print('   run·backrun 은 이제 6프레임 한 장이다 → run.png / backrun.png 로 넣을 것\n')


# ---------------------------------------------------------------- 초록 언매팅
def unmat_green(path):
    src = np.asarray(Image.open(path).convert('RGB')).astype(np.float64)

    def greenness(x):
        return x[..., 1] - (x[..., 0] + x[..., 2]) / 2

    core = (src[..., 1] > 170) & (src[..., 0] < 120) & (src[..., 2] < 120)
    if core.sum() < 100:
        raise SystemExit(f'{path}: 초록 배경을 찾지 못했다')
    BG = src[core].mean(axis=0)
    gv = greenness(src)
    g_bg = greenness(BG[None, None, :])[0, 0]
    g_fg = np.percentile(gv[~core], 92)
    al = np.clip((g_bg - gv) / (g_bg - g_fg), 0, 1)
    al[core] = 0.0
    a3 = al[..., None]
    with np.errstate(invalid='ignore', divide='ignore'):
        un = np.where(a3 > 0.02, (src - (1 - a3) * BG[None, None, :]) / np.maximum(a3, 1e-6), 0)
    return np.clip(un, 0, 255), al


def strip_ground_line(al):
    """AI 가 그려버린 **가로 바닥선**을 지운다.

    `no floor` 를 명시했는데도 run_a 에 바닥선이 들어왔다. 이게 남아 있으면
    프레임이 전부 이어져 런렝스 분리가 1개로 실패한다(실제로 겪음).
    판정: 폭의 60% 이상을 덮는 얇은(≤4px) 행 = 바닥선.
    """
    W = al.shape[1]
    rows = np.nonzero((al > 0.35).sum(axis=1) > W * 0.6)[0]
    if len(rows) == 0:
        return al, None
    # 연속 구간으로 묶어 얇은 것만 제거
    out = al.copy()
    removed = []
    start = rows[0]
    prev = rows[0]
    for r in list(rows[1:]) + [10 ** 9]:
        if r != prev + 1:
            if prev - start + 1 <= 4:
                out[start:prev + 1] = 0.0
                removed.append((int(start), int(prev)))
            start = r
        prev = r
    return out, removed


def split_frames(rgb, al, n):
    """균등 분할이 아니라 **불투명 영역 런렝스**로 자른다 — AI 는 균등 간격을 못 맞춘다."""
    solid = al > 0.35
    cols = solid.any(axis=0)
    runs, s = [], None
    for i, v in enumerate(list(cols) + [False]):
        if v and s is None:
            s = i
        elif not v and s is not None:
            if i - s > 20:
                runs.append((s, i - 1))
            s = None
    if len(runs) != n:
        print(f'   ⚠️ 프레임 {len(runs)}개 검출 (기대 {n}) — 간격이 붙었거나 떨어졌다')
    out = []
    for x0, x1 in runs:
        sub = solid[:, x0:x1 + 1]
        ys, xs = np.nonzero(sub)
        box = (x0 + xs.min(), ys.min(), x0 + xs.max() + 1, ys.max() + 1)
        rgba = np.dstack([rgb, al * 255]).astype(np.uint8)
        # 잘라낸 이미지와 함께 **원본 좌표계의 발끝 y** 를 돌려준다.
        # crop 하면 세로 위치가 사라지는데, 공중 프레임을 살리려면 그 관계가 필요하다.
        out.append((Image.fromarray(rgba, 'RGBA').crop(box), int(ys.max())))
    return out


# ---------------------------------------------------------------- 보정
def glow_mask(arr):
    rgb = arr[..., :3]
    mx = rgb.max(axis=2).astype(float)
    mn = rgb.min(axis=2).astype(float)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    return (sat > 0.30) & (mx > 110) & (rgb[..., 2] > 95) & (arr[..., 3] > 60)


def boost_glow(cell):
    """발광색을 지정값(#e05cff)으로 끌어올린다. 실측이 탁하게 나왔다."""
    arr = np.asarray(cell).astype(float)
    m = glow_mask(arr)
    if m.sum() < 5:
        return cell
    cur = arr[..., :3][m].mean(axis=0)
    gain = np.clip(GLOW_TARGET / np.maximum(cur, 1), 0.7, 1.6)
    out = arr.copy()
    # 발광 강도에 비례해 서서히 적용 — 경계가 튀지 않게
    w = ndimage.gaussian_filter(m.astype(float), 1.2)[..., None]
    out[..., :3] = np.clip(arr[..., :3] * (1 - w) + arr[..., :3] * gain[None, None, :] * w, 0, 255)
    return Image.fromarray(out.astype(np.uint8), 'RGBA')


def hem_pct(cell_96):
    """96×116 셀에서 밑단(아래 1/5) 발광 비율(%)."""
    ar = np.asarray(cell_96).astype(int)
    m = ar[..., 3] > 90
    g = glow_mask(ar)
    s, e = CH * 4 // 5, CH
    return 100 * g[s:e].sum() / max(m[s:e].sum(), 1)


def fit_hem_glow(cell, scale_ref, lift=0):
    """목표 밑단 비율이 나오는 강도를 찾아 적용한다.

    측정은 **최종 셀(96×116)** 에서 해야 한다 — 원본 해상도에서 재면 축소 과정의
    발광 집중이 반영되지 않아 과하게 얹힌다(1차 시도에서 밑단 26.9% 가 된 원인).
    """
    base = hem_pct(to_cell(cell, scale_ref, lift))
    if base >= HEM_TARGET * 0.85:
        return cell, 0.0, base      # 이미 충분하다 → 손대지 않는다
    lo, hi = 0.0, HEM_MAX_STRENGTH
    for _ in range(11):
        mid = (lo + hi) / 2
        v = hem_pct(to_cell(add_hem_glow(cell, mid), scale_ref, lift))
        if v < HEM_TARGET:
            lo = mid
        else:
            hi = mid
    st = (lo + hi) / 2
    out = add_hem_glow(cell, st)
    return out, st, hem_pct(to_cell(out, scale_ref, lift))


def add_hem_glow(cell, strength, start=0.62, width=5):
    """실루엣 하단 외곽선에 발광을 얹는다 (AI 가 안 그려준 망토 밑단)."""
    arr = np.asarray(cell).astype(float)
    al = arr[..., 3] > 90
    H, W = al.shape
    edge = al & ~ndimage.binary_erosion(al, np.ones((3, 3)))
    yy = np.arange(H)[:, None] / max(H - 1, 1)
    w = np.clip((yy - start) / (1 - start), 0, 1) ** 1.4
    soft = ndimage.gaussian_filter((edge * w).astype(float), width * 0.5)
    soft = soft / max(soft.max(), 1e-6)
    soft *= np.clip((yy - start + 0.05) / (1 - start), 0, 1)
    m = (soft * strength)[..., None]
    out = arr.copy()
    out[..., :3] = np.clip(arr[..., :3] * (1 - m * 0.35) + GLOW_TARGET[None, None, :] * m * 1.05,
                           0, 255)
    outside = (~al) & (soft > 0.18)
    out[..., 3] = np.maximum(arr[..., 3], np.where(outside, np.clip(soft * 210, 0, 200), 0))
    return Image.fromarray(out.astype(np.uint8), 'RGBA')


def to_cell(cell, scale_ref, lift=0):
    """96×116 셀에 배치. 가로는 중심 정렬, 세로는 발끝을 y=ANCHOR 에.

    scale_ref: 이 애니 전체에서 **공통으로 쓸 배율**. 프레임마다 따로 맞추면
               캐릭터가 커졌다 작아졌다 한다.
    lift:      이 프레임이 **접지 프레임보다 얼마나 떠 있는지**(셀 픽셀).
               달리기의 공중 프레임을 살리기 위한 값이다 — 0 이면 접지.
    """
    w = max(1, round(cell.width * scale_ref))
    h = max(1, round(cell.height * scale_ref))
    r = cell.resize((w * 2, h * 2), Image.LANCZOS).resize((w, h), Image.LANCZOS)
    r = r.filter(ImageFilter.UnsharpMask(radius=1.0, percent=70, threshold=3))
    out = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    a = np.asarray(r)
    ys, xs = np.nonzero(a[..., 3] > 40)
    if len(ys) == 0:
        return out
    cx = (xs.min() + xs.max()) / 2
    out.alpha_composite(r, (int(round(CW / 2 - cx)),
                            int(round(ANCHOR - ys.max() - lift))))
    return out




# ---------------------------------------------------------------- 조립
sheet = Image.new('RGBA', (CW * COLS, CH * 7), (0, 0, 0, 0))
report = []
missing = []
for row, parts in ROWS:
    for key, n, col0 in parts:
        p = find(key)
        if not p:
            missing.append(key)
            continue
        print(f'[{key}] {pathlib.Path(p).name}')
        rgb, al = unmat_green(p)
        al, gl = strip_ground_line(al)
        if gl:
            print(f'   AI 가 그린 바닥선 제거: y={gl}')
        pairs = split_frames(rgb, al, n)
        if not pairs:
            continue
        frames = [f for f, _ in pairs]
        bots = [b for _, b in pairs]
        # 공통 배율 — 이 애니에서 가장 큰 프레임이 셀에 들어가도록
        tall = max(f.height for f in frames)
        wide = max(f.width for f in frames)
        # 공중 프레임이 있으면 그만큼 여유를 둬야 셀 위로 잘리지 않는다
        s = min((ANCHOR - 2) / (tall + (max(bots) - min(bots))), (CW - 4) / wide)
        ground = max(bots)  # 가장 낮게 접지한 프레임 = 기준
        for i, (f, b) in enumerate(pairs[:n]):
            lift = (ground - b) * s  # 이 프레임이 떠 있는 양 (셀 픽셀)
            f, st, got = fit_hem_glow(boost_glow(f), s, lift)
            if i == 0:
                print(f'   밑단 발광 강도 {st:.2f} → {got:.1f}% (목표 {HEM_TARGET})')
            c = to_cell(f, s, lift)
            sheet.alpha_composite(c, ((col0 + i) * CW, row * CH))
            a = np.asarray(c)
            ys, xs = np.nonzero(a[..., 3] > 40)
            report.append((f'{key}[{i}]', row, col0 + i,
                           int(ys.min()), int(ys.max()), float(xs.mean()),
                           int((a[..., 3] > 40).sum()), round(lift, 1)))

if missing:
    print(f'\n없는 스트립: {", ".join(missing)}')
    print('(있는 것만으로 부분 조립했다 — 나머지가 오면 다시 돌리면 된다)')

sheet.save(HERE / '_player_sheet_new.png')
print(f'\nsaved _player_sheet_new.png  {sheet.size}  '
      f'{(HERE / "_player_sheet_new.png").stat().st_size / 1024:.0f}KB')

# ---------------------------------------------------------------- 정렬 검증
print()
print(f'{"프레임":14}{"행":>3}{"열":>3}{"머리y":>7}{"발끝y":>7}{"중심x":>8}{"픽셀":>8}{"떠있음":>8}')
for n, r, c, t, b, cx, px, lf in report:
    print(f'{n:14}{r:>3}{c:>3}{t:>7}{b:>7}{cx:>8.1f}{px:>8}{lf:>8.1f}')
if report:
    cxs = [r[5] for r in report]
    print(f'\n가로중심 편차 {max(cxs) - min(cxs):.1f}px  (목표 ±3 이내)')
    # 접지 프레임(lift 0)들만 발끝이 ANCHOR 에 일치해야 한다.
    planted = [r[4] for r in report if r[7] < 0.5]
    if planted:
        d = max(planted) - min(planted)
        print(f'접지 프레임 발끝 편차 {d}px  ' +
              ('✅ 일치' if d == 0 else '❌ 불일치'))
    air = [r for r in report if r[7] >= 0.5]
    if air:
        print(f'공중 프레임 {len(air)}개 — 최대 {max(r[7] for r in air):.1f}px 떠 있음 '
              '(달리기는 이게 0 이면 뛰는 느낌이 사라진다)')

# 발광 세로 분포
a = np.asarray(sheet).astype(int)
m = a[..., 3] > 90
if m.sum():
    gm = glow_mask(a)
    print()
    print('발광 세로 분포 (셀 내 5구간, 첫 칸 기준):')
    c0 = a[0:CH, 0:CW]
    m0 = c0[..., 3] > 90
    g0 = glow_mask(c0)
    for i, z in enumerate(['머리·후드', '어깨·가슴', '허리·손', '허벅지', '밑단·부츠']):
        s2, e2 = CH * i // 5, CH * (i + 1) // 5
        print(f'  {z:12} {100 * g0[s2:e2].sum() / max(m0[s2:e2].sum(), 1):5.1f}%')
