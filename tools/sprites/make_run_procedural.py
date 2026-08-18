"""idle 프레임을 변형해 run 애니메이션을 만든다 — AI 없이, 실제 픽셀로.

=== 왜 이 방식인가 ===
이 캐릭터는 **망토가 몸 높이의 85%까지 덮는다.** 드러난 건 부츠 두 개뿐이다.
실측:
    0~85%   망토 한 덩어리 (다리 안 보임)
    85%     덩어리 8개 — 넝마 자락이지 다리가 아니다
    90~95%  덩어리 2~3개 — 부츠

보폭으로 달리기를 표현할 수 없다. **움직일 다리가 화면에 없다.**
Gemini 4회, SD 9회가 전부 이 벽에 부딪혔다. 체크포인트를 바꿔도 같다.

→ 긴 로브 캐릭터의 달리기는 **망토 흐름 + 상체 기울기 + 부츠 교대**로 표현한다.
  그리고 그건 idle 픽셀을 변형하면 된다. 캐릭터 동일성이 픽셀 단위로 보장된다.

=== 네 가지 성분 ===
  1. 망토 뒤로 흐름   하단을 뒤로 점진 shear. 허리(50%)부터 시작해 밑단(86%)에서 최대,
                     부츠(96%)에서 다시 0 으로 — 부츠는 땅에 붙어 있어야 한다
  2. 상체 앞으로 기울기 위로 갈수록 +x. 달리는 자세의 핵심 신호
  3. 부츠 교대        부츠 영역의 덩어리를 좌우로 따로 민다 = 걸음
  4. 상하 반동        1~2px. 레퍼런스 실측이 몸높이의 3% 였다

실행: python3 tools/sprites/make_run_procedural.py
출력: tools/sprites/player_strips/run.png   (8프레임 가로 스트립, 초록 배경)
      tools/sprites/_run_proc_preview.png   (확대 미리보기)
"""
import pathlib

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = pathlib.Path(__file__).resolve().parent
STRIPS = HERE / 'player_strips'
SRC = STRIPS / 'idle.png'

N = 8                    # 프레임 수. 시트가 8열이라 딱 맞는다
GAP = 60                 # 프레임 간 간격 — 조립 스크립트의 런렝스 분리를 위해

# ---- 튜닝 값 (여기만 바꾸면 된다) ----------------------------------------
# ⚠️ 값은 **원본 해상도(525px 높이) 기준**이다.
#    화면에는 64px 로 나오므로 8.2배 축소된다 → 원본 8px 이 화면 1px.
#    1차 시도에서 부츠 7px 로 잡았더니 화면에서 0.8px 라 안 보였다.
SCALE_HINT = 525 / 64    # ≈ 8.2. 화면 1px 을 원본 몇 px 로 잡아야 하는가
CLOAK_SHEAR = 46.0       # 망토가 뒤로 흐르는 최대 px  (화면 ~5.6px)
CLOAK_BASE = 16.0        # 항상 깔려 있는 뒤쪽 흐름 (달리는 중이므로 0 이 아니다)
LEAN = 14.0              # 상체 전방 기울기 **변동폭**  (화면 ~1.7px)
LEAN_BASE = 26.0         # 항상 기울어 있는 양 — 달리는 자세의 핵심이라 크게 (화면 ~3.2px)
BOOT_SWING = 26.0        # 부츠 앞뒤 스윙 최대 px      (화면 ~3.2px)

# ★ 세로 채널 — 이게 없으면 "앞으로 미끄러지는" 느낌이 된다.
#   레퍼런스 실측(발끝y 변동 0)을 근거로 반동을 눌렀던 것은 **잘못된 적용**이었다.
#   그 레퍼런스는 다리가 보여서 보폭이 이동감을 전달한다. 이 캐릭터는 보폭이 안 보이므로
#   세로 반동이 **유일하게 남은 이동감 채널**이다.
BOB = 16.0               # 몸 전체 상하 반동 px        사이클당 2회
SQUASH = 0.015           # 접지 순간 수직 압축 — 머리 반동을 증폭하므로 작게
BOOT_LIFT = 34.0         # 스윙하는 발이 뜨는 높이 px  (화면 ~4.1px)

# 세로 구간 (몸높이 대비 비율)
CLOAK_FROM = 0.50        # 이 위로는 망토 shear 없음 (허리)
CLOAK_PEAK = 0.86        # 넝마 밑단 — 가장 크게 흐른다
BOOT_FROM = 0.88         # 이 아래가 부츠 — 따로 민다
# --------------------------------------------------------------------------


def load_idle_frame():
    """idle 스트립의 1번 프레임을 알파 포함으로 잘라낸다."""
    im = Image.open(SRC).convert('RGB')
    a = np.asarray(im).astype(np.float64)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    core = (G > 170) & (R < 120) & (B < 120)
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
    rgb = np.clip(un, 0, 255)

    solid = al > 0.35
    cols = solid.any(axis=0)
    runs, s = [], None
    for i, v in enumerate(list(cols) + [False]):
        if v and s is None:
            s = i
        elif not v and s is not None:
            if i - s > 30:
                runs.append((s, i - 1))
            s = None
    x0, x1 = runs[0]
    sub = solid[:, x0:x1 + 1]
    ys, xs = np.nonzero(sub)
    box = (slice(ys.min(), ys.max() + 1), slice(x0 + xs.min(), x0 + xs.max() + 1))
    return rgb[box], al[box], tuple(int(v) for v in BG.round())


def cloak_ramp(yn):
    """세로 위치 → 망토 shear 가중치.

    허리에서 0, 밑단에서 1, 부츠에서 다시 0.15 로 내려온다.
    부츠까지 밀면 발이 땅에서 미끄러진다.
    """
    r = np.zeros_like(yn)
    up = (yn >= CLOAK_FROM) & (yn <= CLOAK_PEAK)
    r[up] = ((yn[up] - CLOAK_FROM) / (CLOAK_PEAK - CLOAK_FROM)) ** 1.4
    dn = yn > CLOAK_PEAK
    t = (yn[dn] - CLOAK_PEAK) / max(1 - CLOAK_PEAK, 1e-6)
    r[dn] = 1.0 - 0.85 * t
    return r


def warp(rgb, al, shear, lean, bob, squash, gy):
    """행 단위 수평 변위 + 상하 반동 + 접지선 기준 수직 스케일을 한 번에 리샘플한다.

    ⚠️ bob 부호: `sy = yy + bob` 는 **아래쪽 행을 가져오는** 것이므로
       bob > 0 이면 내용이 **위로** 올라간다. 1차 구현에서 음수를 넣어
       반동이 아래로 갔고 하단에서 잘려 실제 반동이 0 이 됐다.
    """
    H, W = al.shape
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float64)
    # yn 은 원래 몸 높이 기준이어야 하므로 스케일 전 좌표로 계산한다
    yn = np.clip(gy - (gy - yy) / max(squash, 1e-6) + bob, 0, H - 1) / max(H - 1, 1)
    # 망토: 아래를 뒤(-x)로.  상체: 위를 앞(+x)로.
    dx = -shear * cloak_ramp(yn) + lean * np.clip(1.0 - yn / CLOAK_FROM, 0, 1) ** 1.2
    # 접지선(gy) 을 고정점으로 수직 스케일 → 스쿼시가 발을 들지 않는다
    sy = gy - (gy - yy) / max(squash, 1e-6) + bob
    sx = xx - dx
    out_rgb = np.stack([ndimage.map_coordinates(rgb[..., c], [sy, sx], order=1, mode='constant')
                        for c in range(3)], axis=-1)
    out_al = ndimage.map_coordinates(al, [sy, sx], order=1, mode='constant')
    return out_rgb, out_al


def swing_boots(rgb, al, front_dx, back_dx, front_dy=0.0, back_dy=0.0):
    """부츠 영역의 덩어리를 앞/뒤로 따로 민다 = 걸음.

    부츠가 2개로 안 갈라지면(겹쳐 있으면) 통째로 평균만큼 민다.
    """
    H, W = al.shape
    y0 = int(H * BOOT_FROM)
    band = al[y0:] > 0.35
    lab, n = ndimage.label(band)
    parts = []
    for k in range(1, n + 1):
        ys, xs = np.nonzero(lab == k)
        if len(xs) < 30:
            continue
        parts.append((xs.mean(), k))
    parts.sort()
    out_rgb, out_al = rgb.copy(), al.copy()
    if len(parts) < 2:                     # 갈라지지 않으면 통째로
        shifts = [(None, (front_dx + back_dx) / 2, (front_dy + back_dy) / 2)]
    else:
        # x 가 작은 쪽 = 뒷발, 큰 쪽 = 앞발 (우향 캐릭터)
        shifts = [(parts[0][1], back_dx, back_dy), (parts[-1][1], front_dx, front_dy)]
    for key, dx, dy in shifts:
        m = band if key is None else (lab == key)
        full = np.zeros_like(al, bool)
        full[y0:] = m
        # 원본에서 지우고
        out_al[full] = 0.0
        out_rgb[full] = 0.0
        # 민 자리에 다시 붙인다
        sh_al = ndimage.shift(np.where(full, al, 0.0), (dy, dx), order=1, mode='constant')
        sh_rgb = np.stack([ndimage.shift(np.where(full, rgb[..., c], 0.0), (dy, dx),
                                         order=1, mode='constant') for c in range(3)], axis=-1)
        put = sh_al > 0.02
        out_al[put] = np.maximum(out_al[put], sh_al[put])
        out_rgb[put] = sh_rgb[put]
    return out_rgb, out_al


# ---------------------------------------------------------------- 생성
rgb0, al0, GREEN = load_idle_frame()
H, W = al0.shape
print(f'idle 프레임  {W}×{H}   배경 {GREEN}')
print(f'망토 구간 {int(H*CLOAK_FROM)}~{int(H*CLOAK_PEAK)}px   부츠 {int(H*BOOT_FROM)}px 아래')
print()

PAD = 30                                  # shear 로 밀려나갈 여유
VPAD = int(BOB + BOOT_LIFT + 20)          # 반동으로 위로 올라갈 여유 — 없으면 머리가 잘린다
frames = []
print(f'{"프레임":>6}{"망토":>7}{"기울기":>7}{"앞발x":>7}{"뒷발x":>7}'
      f'{"앞발↑":>7}{"뒷발↑":>7}{"반동↑":>7}{"스쿼시":>8}')
for i in range(N):
    ph = 2 * np.pi * i / N                # 망토·기울기는 사이클당 1회
    st = 2 * np.pi * i / (N / 2)          # 걸음은 사이클당 2회 = 두 걸음
    shear = CLOAK_BASE + CLOAK_SHEAR * (0.5 + 0.5 * np.sin(ph))
    lean = LEAN_BASE + LEAN * (0.5 + 0.5 * np.sin(ph + 0.6))
    fdx = BOOT_SWING * np.sin(st)
    bdx = -BOOT_SWING * np.sin(st)

    # 몸 전체 반동 — |sin| 이라 사이클당 2회. 걸음 중간(passing)에 가장 높다.
    bob = BOB * abs(np.sin(st))
    # 접지 순간(sin≈0)에 수직 압축, 뜬 순간에 살짝 늘림 = 스쿼시·스트레치
    squash = 1.0 + SQUASH * (2 * abs(np.sin(st)) - 1)

    # 앞으로 나가는 발이 뜬다. sin>0 이면 앞발이 스윙 중.
    sw = np.sin(st)
    fdy = -BOOT_LIFT * max(sw, 0.0)       # 음수 = 위
    bdy = -BOOT_LIFT * max(-sw, 0.0)
    print(f'{i + 1:>6}{shear:>7.0f}{lean:>7.0f}{fdx:>+7.0f}{bdx:>+7.0f}'
          f'{-fdy:>7.0f}{-bdy:>7.0f}{bob:>7.0f}{squash:>8.3f}')

    canvas_rgb = np.zeros((H + VPAD, W + PAD * 2, 3))
    canvas_al = np.zeros((H + VPAD, W + PAD * 2))
    canvas_rgb[VPAD:, PAD:PAD + W] = rgb0
    canvas_al[VPAD:, PAD:PAD + W] = al0
    GY = H + VPAD - 1                     # 접지선 = 캔버스 최하단
    r, a_ = warp(canvas_rgb, canvas_al, shear, lean, bob, squash, GY)
    r, a_ = swing_boots(r, a_, fdx, bdx, fdy, bdy)
    frames.append((r, a_))

# 세로 채널이 실제로 들어갔는지 확인한다. 1차 구현은 여기서 편차 0 이 나왔고
# 그게 "미끄러지는" 원인이었다 — 편차 0 은 합격이 아니라 **실패 신호**다.
tops, bots = [], []
for r, a_ in frames:
    ys, _ = np.nonzero(a_ > 0.35)
    tops.append(ys.min())
    bots.append(ys.max())
print(f'\n머리 y  {min(tops)}~{max(tops)}  변동 {max(tops) - min(tops)}px'
      f'  (화면 {(max(tops) - min(tops)) / SCALE_HINT:.1f}px)')
print(f'발끝 y  {min(bots)}~{max(bots)}  변동 {max(bots) - min(bots)}px'
      f'  (화면 {(max(bots) - min(bots)) / SCALE_HINT:.1f}px)')
if max(tops) - min(tops) < 10:
    print('  ⚠️ 세로 변동이 없다 — 미끄러지는 느낌이 된다')

# ---------------------------------------------------------------- 스트립 저장
FW = W + PAD * 2
FH = frames[0][1].shape[0]
SW = GAP + (FW + GAP) * N
strip = Image.new('RGB', (SW, FH), GREEN)
for i, (r, a_) in enumerate(frames):
    a3 = np.clip(a_, 0, 1)[..., None]
    comp = (np.clip(r, 0, 255) * a3 + np.array(GREEN)[None, None, :] * (1 - a3))
    strip.paste(Image.fromarray(comp.astype(np.uint8), 'RGB'), (GAP + i * (FW + GAP), 0))
strip.save(STRIPS / 'run.png')
print(f'saved player_strips/run.png  {strip.size}  '
      f'{(STRIPS / "run.png").stat().st_size / 1024:.0f}KB')

# ---------------------------------------------------------------- 미리보기
from PIL import ImageDraw
Z = 260
th = Z
tw = int(FW * Z / H)
prev = Image.new('RGB', (8 + (tw + 8) * N, th + 26), (26, 26, 30))
d = ImageDraw.Draw(prev)
for i, (r, a_) in enumerate(frames):
    a3 = np.clip(a_, 0, 1)[..., None]
    comp = (np.clip(r, 0, 255) * a3 + np.array((40, 42, 46))[None, None, :] * (1 - a3))
    im = Image.fromarray(comp.astype(np.uint8), 'RGB').resize((tw, th), Image.LANCZOS)
    x = 8 + i * (tw + 8)
    prev.paste(im, (x, 24))
    d.text((x + 3, 6), f'f{i + 1}', fill=(225, 225, 225))
prev.save(HERE / '_run_proc_preview.png')
print(f'saved _run_proc_preview.png  {prev.size}')

# ---------------------------------------------------------------- 게임 크기 검증
# ★ 판단은 이 이미지로 한다. 원본에서 멋있어도 64px 에서 안 보이면 의미 없다.
GH = 64
gw = int(FW * GH / FH)
Z2 = 5
gs = Image.new('RGB', (6 + (gw * Z2 + 6) * N, GH * Z2 + 46), (26, 26, 30))
d2 = ImageDraw.Draw(gs)
d2.text((6, 4), f'게임 표시 크기 {gw}×{GH}px 를 {Z2}배 확대 — 실제로는 이만큼 작다',
        fill=(200, 210, 205))
for i, (r, a_) in enumerate(frames):
    a3 = np.clip(a_, 0, 1)[..., None]
    comp = (np.clip(r, 0, 255) * a3 + np.array((40, 42, 46))[None, None, :] * (1 - a3))
    im = Image.fromarray(comp.astype(np.uint8), 'RGB')
    im = im.resize((gw * 2, GH * 2), Image.LANCZOS).resize((gw, GH), Image.LANCZOS)
    x = 6 + i * (gw * Z2 + 6)
    gs.paste(im.resize((gw * Z2, GH * Z2), Image.NEAREST), (x, 26))
    d2.text((x + 2, GH * Z2 + 30), f'f{i + 1}', fill=(180, 190, 185))
gs.save(HERE / '_run_proc_gamesize.png')
print(f'saved _run_proc_gamesize.png  {gs.size}')
