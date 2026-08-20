"""새 몹 스프라이트(monster_walk.png)를 게임 크기로 확인하는 테스트 페이지.

=== 왜 필요한가 ===
지금 잡몹은 **32px 셀에 손으로 찍은 픽셀아트**다. 화면상 35px 밖에 안 된다.
새로 받은 그림은 원본 키가 400px 라 **11배 축소**된다. 그 크기에서
· 형태가 읽히는가
· 지금 플레이어(회화풍 측면)와 같은 게임의 몹으로 보이는가
· 여럿 몰려왔을 때 서로 구분되는가
이 셋은 확대해서 보면 절대 판단이 안 된다. 그래서 실제 크기로 띄운다.

셀 크기를 32 / 40 / 48 세 가지로 만들어 같이 보여준다. 32 는 지금 규격이고,
48 은 엘리트 규격이다. 잡몹을 키우면 코드 상수(ENEMY_SPRITE_K)도 같이 바뀐다.

실행: python3 tools/sprites/make_monster_test.py            ← monster_walk.png
      python3 tools/sprites/make_monster_test.py monster2   ← monster2_walk.png
출력: tools/sprites/_<이름>_test.html   (단독 실행, 서버 불필요)
      tools/sprites/_<이름>_sheets.png  (정적 미리보기)
      tools/sprites/_<이름>_tailmask.png (꼬리 검출 결과 — 틀리면 여기서 보인다)
"""
import base64
import io
import pathlib
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = pathlib.Path(__file__).resolve().parent
PUB = HERE.parent.parent / 'public' / 'sprites' / 'dungeon'
NAME = next((a for a in sys.argv[1:] if not a.startswith('-')), 'monster')
SRC = HERE / 'monster_strips' / f'{NAME}_walk.png'
TAG = '_monster_' if NAME == 'monster' else f'_{NAME}_'

CELLS = [32, 40, 48]          # 만들어볼 셀 크기. 32=현행 잡몹, 48=엘리트
FOOT = 0.94                   # 셀 안에서 발끝이 놓일 높이 비율
ORIGIN_Y = 0.72               # main.js: setOrigin(0.5, 0.72). 피벗이 셀의 72% 지점
SPRITE_K = 0.11               # main.js ENEMY_SPRITE_K. 배율 = enemy.radius × 이것


def unmat(path):
    """초록 언매팅. 얇은 부분(꼬리 끝·뿔)을 살리려고 greenness 로 알파를 추정한다."""
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


rgb, al = unmat(SRC)
solid = al > 0.35
lab, n = ndimage.label(solid)
sz = ndimage.sum(solid, lab, range(1, n + 1))
keep = [i + 1 for i in range(n) if sz[i] > 2000]
print(f'{SRC.name}  {rgb.shape[1]}×{rgb.shape[0]}   인물 덩어리 {len(keep)}개')

# 덩어리를 x 순으로 정렬해 프레임 순서를 잡는다. 빈 열이 확실히 있어서 분리가 깨끗하다.
boxes = []
for k in keep:
    ys, xs = np.nonzero(lab == k)
    boxes.append((xs.min(), xs.max(), ys.min(), ys.max()))
boxes.sort()

print(f'{"":>4}{"x 범위":>14}{"y 범위":>14}{"폭":>6}{"키":>6}')
for i, (x0, x1, y0, y1) in enumerate(boxes):
    print(f'{i:>4}{f"{x0}~{x1}":>14}{f"{y0}~{y1}":>14}{x1 - x0 + 1:>6}{y1 - y0 + 1:>6}')

# ⚠️ 발끝(=덩어리 아래끝) 기준으로 맞춘다. bbox 위끝으로 맞추면 뿔 높이 차이만큼
#    캐릭터가 위아래로 튄다. 실측 키가 365~409 로 12% 차이나므로 특히 중요하다.
hmax = max(y1 - y0 + 1 for _, _, y0, y1 in boxes)
wmax = max(x1 - x0 + 1 for x0, x1, _, _ in boxes)
print(f'\n키 {min(y1 - y0 + 1 for _, _, y0, y1 in boxes)}~{hmax}  '
      f'(편차 {100 * (hmax - min(y1 - y0 + 1 for _, _, y0, y1 in boxes)) / hmax:.1f}%)')


# ------------------------------------------------------------------ 꼬리 흔들기
#
# 프레임 2장(f3·f4)만 쓰기로 하면서 문제가 생겼다. 몸통은 크게 움직이는데
# **꼬리가 거의 그대로**다. 원본 꼬리 길이가 약 110px 인데 48px 셀로 줄이면 12px,
# 두 프레임 사이 꼬리 끝 차이가 1px 미만이라 화면에서 정지해 보인다.
#
# 그래서 꼬리만 따로 떼어 부착점 기준으로 회전시켜 위상을 만든다.
# 몸통은 f3/f4 로 2박자, 꼬리는 4박자 — 꼬리가 몸보다 느리게 흔들리는 게 자연스럽다.
CORE_R = 26            # 이 반지름 원이 안 들어가는 부분 = 얇은 부속(꼬리·발톱·뿔)
GLUE_R = 10            # 몸통을 이만큼 불려서 꼬리 부착부를 몸통 쪽에 남긴다


def _disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r


def tail_mask(sub):
    """굵은 몸통을 열림 연산으로 지우고 남은 얇은 구조 중 **가장 왼쪽 것** = 꼬리.

    ⚠️ 처음엔 '왼쪽 26% 띠에서 가장 큰 덩어리' 로 잡았다. 첫 번째 몹(뭉툭한 짐승)은
    맞았지만 두 번째 몹(길쭉한 랩터)은 꼬리가 띠 밖까지 뻗어서 **중간에서 잘렸다.**
    두 번째로 '띠에서 가장 위' 를 썼더니 이번엔 f4 에서 앞발톱을 물어왔다.

    지금 방식은 실루엣 전체를 보고, 굵은 몸통에 안 들어가는 얇은 구조만 후보로
    삼은 뒤 **실루엣 최좌단 픽셀이 속한 덩어리**를 고른다. 꼬리는 어느 프레임에서든
    가장 왼쪽까지 뻗는다는 성질을 쓴다.

    결과는 _<이름>_tailmask.png 에 찍어두니 **반드시 눈으로 확인할 것.**
    """
    core = ndimage.binary_dilation(
        ndimage.binary_opening(sub, _disk(CORE_R)), _disk(GLUE_R))
    thin = sub & ~core
    lab, n = ndimage.label(thin)
    if n == 0:
        return None, None
    ys_all, xs_all = np.nonzero(sub)
    left = int(np.argmin(xs_all))
    k = lab[ys_all[left], xs_all[left]]
    if k == 0:                       # 최좌단이 몸통에 붙어 있으면 가장 큰 얇은 구조로
        sizes = ndimage.sum(thin, lab, range(1, n + 1))
        k = 1 + int(np.argmax(sizes))
    tail = lab == k
    if tail.sum() < 400:
        return None, None
    # 부착점 = 꼬리 중 **몸통에 맞닿은 부분**. 꼬리 끝을 축으로 잡으면 뿌리가 휘둘린다.
    touch = tail & ndimage.binary_dilation(core, _disk(3))
    ys, xs = np.nonzero(touch if touch.sum() > 20 else tail)
    return tail, (float(xs.mean()), float(ys.mean()))


def swing_tail(rgba, tail, pivot, deg):
    """꼬리 픽셀만 pivot 기준으로 deg 만큼 돌린 RGBA 를 돌려준다."""
    if tail is None or abs(deg) < 0.01:
        return rgba
    H, W = tail.shape
    body = rgba.copy()
    body[..., 3] = np.where(tail, 0, body[..., 3])          # 원래 꼬리 자리를 비운다
    lay = rgba.copy()
    lay[..., 3] = np.where(tail, lay[..., 3], 0)            # 꼬리만 남긴 레이어

    im = Image.fromarray(lay.astype(np.uint8), 'RGBA')
    # PIL 의 rotate 는 이미지 중심 기준이라 center 를 넘겨 부착점을 축으로 삼는다
    im = im.rotate(deg, resample=Image.BICUBIC, center=pivot)
    rot = np.asarray(im).astype(float)

    a = rot[..., 3:4] / 255.0
    out = body.astype(float)
    ob = out[..., 3:4] / 255.0
    # 꼬리를 몸통 **뒤**에 깐다 — 엉덩이에 붙은 것이므로 몸통이 가려야 자연스럽다
    na = a + ob * (1 - a)
    rgbv = np.where(na > 0,
                    (rot[..., :3] * a + out[..., :3] * ob * (1 - a)) / np.maximum(na, 1e-6), 0)
    return np.dstack([rgbv, na * 255])


PAD = 60               # 꼬리를 돌릴 여유. 회전 결과가 잘리면 꼬리 끝이 뭉텅 날아간다


def frame_rgba(i):
    """원본 프레임 i 를 여백 붙인 RGBA 배열로. 꼬리 마스크·부착점도 같이 돌려준다."""
    x0, x1, y0, y1 = boxes[i]
    arr = np.dstack([rgb[y0:y1 + 1, x0:x1 + 1],
                     al[y0:y1 + 1, x0:x1 + 1] * 255]).astype(float)
    arr = np.pad(arr, ((PAD, PAD), (PAD, PAD), (0, 0)))
    tail, pivot = tail_mask(arr[..., 3] > 90)
    return arr, tail, pivot


def build(cell, plan):
    """cell×cell 셀 4개짜리 시트. plan = [(원본프레임, 꼬리각도), ...] 4개.

    ⚠️ 배율은 **원본 전체 프레임 기준(hmax/wmax)** 으로 고정한다. plan 마다 다시
    재면 f3·f4 만 쓸 때 캐릭터가 갑자기 커진다. 셀 크기별 비교가 깨진다.

    ⚠️ 가로 위치는 **몸통 기준**이다. bbox 중심으로 놓으면 꼬리를 돌릴 때마다
    bbox 가 바뀌어서 몸이 좌우로 튄다. 플레이어 걷기에서 똑같이 당했다.
    """
    foot_y = round(cell * FOOT)

    # 1) 프레임을 다 만들어놓고 **네 장을 합친 폭**을 잰다.
    #    꼬리를 돌리면 좌우로 더 뻗으므로 시안마다 필요한 폭이 다르다.
    prepped, xmin, xmax = [], 1e9, -1e9
    for src, deg in plan:
        arr, tail, pivot = frame_rgba(src)
        body_x = float(np.nonzero((arr[..., 3] > 90) & ~tail)[1].mean())
        arr = swing_tail(arr, tail, pivot, deg)
        xs = np.nonzero(arr[..., 3] > 90)[1]
        xmin, xmax = min(xmin, xs.min()), max(xmax, xs.max())
        prepped.append((arr, body_x))

    k = min(foot_y / hmax, cell * 0.98 / (xmax - xmin + 1))
    mid = (xmin + xmax) / 2
    mean_bx = float(np.mean([b for _, b in prepped]))
    sheet = Image.new('RGBA', (cell * 4, cell), (0, 0, 0, 0))
    for i, (arr, body_x) in enumerate(prepped):
        im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')
        w, h = max(1, round(im.width * k)), max(1, round(im.height * k))
        # 2단계 축소 — 11배를 한 번에 줄이면 얇은 선이 통째로 사라진다
        im = im.resize((w * 2, h * 2), Image.LANCZOS).resize((w, h), Image.LANCZOS)

        ys = np.nonzero(np.asarray(im)[..., 3] > 90)[0]
        # 네 장 공통 중심에 놓되, 몸통이 움직인 만큼만 보정한다.
        # bbox 중심으로 놓으면 꼬리를 돌릴 때마다 몸이 좌우로 튄다 —
        # 플레이어 걷기에서 똑같이 당했다.
        dx = round(i * cell + cell / 2 - (mid + (body_x - mean_bx)) * k)
        dy = foot_y - int(ys.max()) - 1                   # 발끝을 접지선에
        sheet.paste(im, (dx, dy), im)
    return sheet, k


# 시안 — 페이지에서 버튼으로 갈아끼운다
PLANS = {
    'raw': ('받은 4장 그대로 (f1·f2·f3·f4)', [(0, 0), (1, 0), (2, 0), (3, 0)]),
    'wag0': ('f3·f4 두 장만 — 꼬리 고정', [(2, 0), (3, 0), (2, 0), (3, 0)]),
    'wag8': ('f3·f4 두 장 + 꼬리 ±8°', [(2, 8), (3, 0), (2, -8), (3, 0)]),
    'wag14': ('f3·f4 두 장 + 꼬리 ±14°', [(2, 14), (3, 0), (2, -14), (3, 0)]),
}
# ⚠️ 기본은 **받은 그대로**여야 한다. 한동안 wag8 을 기본으로 뒀다가,
#    새 몹을 열었을 때 "1·2 랑 3·4 가 같아 보인다" 는 소리를 들었다. 당연하다 —
#    wag 시안은 f3·f4 두 장만 번갈아 담으므로 0·2 열과 1·3 열이 같은 원본이다.
#    그건 첫 번째 몹에서 눈으로 골라 내린 결론이지 새 몹의 출발점이 아니다.
PLAN_ORDER = ['raw', 'wag0', 'wag8', 'wag14']       # 페이지 버튼 순서. 첫 개가 기본

sheets = {}
for c in CELLS:
    for name, (_, plan) in PLANS.items():
        s, k = build(c, plan)
        sheets[(c, name)] = s
    on = c * SPRITE_K * 10        # enemy.radius 기본 10
    print(f'셀 {c}px  배율 {k:.4f}  화면 {on:.0f}px  (지금 잡몹 35px)')


def measure(sheet, cell):
    """프레임별 키·머리y·보폭. 순서를 고를 때 근거가 된다.

    보폭 = 앞발↔뒷발 가로 거리 ÷ 키. 아래 20% 구간에서 덩어리를 세어 발을 찾는다.
    네발짐승이라 덩어리가 2개 넘게 나올 수 있어 가장 바깥 두 개만 쓴다.
    """
    a = np.asarray(sheet)[..., 3] > 90
    out = []
    for i in range(4):
        sub = a[:, i * cell:(i + 1) * cell]
        ys, xs = np.nonzero(sub)
        y0, y1 = int(ys.min()), int(ys.max())
        H = y1 - y0 + 1
        leg = np.zeros_like(sub)
        leg[int(y1 - H * 0.20):y1 + 1, :] = sub[int(y1 - H * 0.20):y1 + 1, :]
        lb, k = ndimage.label(leg)
        fx = [float(np.nonzero(lb == (j + 1))[1].mean())
              for j in range(k) if (lb == (j + 1)).sum() > 4]
        stride = (max(fx) - min(fx)) / H * 100 if len(fx) > 1 else 0.0
        out.append({'h': H, 'headY': y0, 'stride': round(stride, 1)})
    return out


def similarity(sheet, cell):
    """프레임끼리 얼마나 겹치는가(IoU). 1.00 이면 같은 그림이다.

    AI 가 4장을 그려줬다고 실제로 4가지 자세인 건 아니다. 두 장씩 거의 같은
    경우가 있는데, 그걸 모르고 순서만 바꿔봐야 소용이 없다. 먼저 이걸 본다.
    """
    a = np.asarray(sheet)[..., 3] > 90
    F = [a[:, i * cell:(i + 1) * cell] for i in range(4)]
    return [[round(float(np.logical_and(F[i], F[j]).sum()) /
                   max(int(np.logical_or(F[i], F[j]).sum()), 1), 2)
             for j in range(4)] for i in range(4)]


SIM = similarity(sheets[(48, 'raw')], 48)
# ⚠️ 절대 임계값(예: 0.6 초과면 중복)은 쓰면 안 된다. 뚱뚱한 몹은 실루엣이 크게
#    겹쳐서 전부 0.7 이 나오고, 마른 몹은 자세가 같아도 0.6 이 안 나온다.
#    **그 몹 안에서 유독 높은 쌍**을 찾아야 한다. 평균 대비로 본다.
off = [SIM[i][j] for i in range(4) for j in range(4) if i != j]
base = float(np.mean(off))
DUP = [(i, j) for i in range(4) for j in range(i + 1, 4) if SIM[i][j] > base + 0.10]
print('\n프레임 유사도 (IoU, 1.00 = 같은 그림)   평균 %.2f' % base)
print('      f1    f2    f3    f4')
for i, r in enumerate(SIM):
    print(f'  f{i + 1}  ' + '  '.join(f'{v:.2f}' for v in r))
for i, j in DUP:
    print(f'  ⚠️ f{i + 1} 와 f{j + 1} 가 {SIM[i][j]:.2f} — 평균({base:.2f})보다 유독 높다. '
          f'사실상 같은 자세다')
if not DUP:
    lo, hi = min(off), max(off)
    print(f'  중복 쌍 없음 (편차 {lo:.2f}~{hi:.2f})')
    if lo > 0.6:
        print('  ⚠️ 다만 네 장이 **전부** 비슷하다. 동작 자체가 작아서 '
              '화면에서 거의 안 움직여 보일 수 있다')

MEAS = {name: measure(sheets[(48, name)], 48) for name in PLANS}
print(f'\n원본 4장 실측 (48px 셀)\n{"":>4}{"키":>6}{"머리y":>8}{"보폭%":>8}')
for i, m in enumerate(MEAS['raw']):
    print(f'  f{i + 1}{m["h"]:>6}{m["headY"]:>8}{m["stride"]:>8.0f}')

# 순서는 이제 **시안(PLAN)이 정한다.** wag 시안은 이미 f3·f4 를 번갈아 담아뒀으므로
# 시트를 그냥 1,2,3,4 로 돌리면 된다. 아래 입력란은 더 만져보고 싶을 때를 위해 남긴다.
PRESETS = [['1,2,3,4', '1,2,3,4', '시트 그대로 (권장)'],
           ['1,2', '1,2', '앞 2장만'],
           ['3,4', '3,4', '뒤 2장만'],
           ['1,2,3,4,3,2', '1,2,3,4,3,2', '되감기']]


def b64(im):
    b = io.BytesIO()
    im.save(b, 'PNG')
    return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()


IMG = {f'm{c}_{n}': b64(sheets[(c, n)]) for c in CELLS for n in PLANS}
# 비교 레인 두 개 — 교체 전 고블린(32px) 과 **현재 시트에 들어간 몹**(48px).
# 두 번째 몹을 볼 땐 첫 번째 몹과 나란히 놓고 보는 게 판단이 빠르다.
CUR = Image.open(PUB / 'enemies_sheet.png').convert('RGBA')
CUR_CELL = CUR.height // 3
OLDP = PUB / 'enemies_sheet_32_old.png'
IMG['cur'] = b64(CUR)
IMG['now'] = b64(Image.open(OLDP if OLDP.exists() else PUB / 'enemies_sheet.png')
                 .convert('RGBA'))
IMG['floor'] = b64(Image.open(PUB / 'tileset_iso_stone.png').convert('RGBA'))
IMG['player'] = b64(Image.open(PUB / 'deliverables' / 'player_spritesheet.png').convert('RGBA'))

HTML = """<!doctype html><meta charset="utf-8">
<title>__NAME___walk — 게임 크기 확인</title>
<style>
 body{margin:0;background:#0e0f12;color:#dfe3e6;font:13px/1.65 system-ui,sans-serif}
 .wrap{padding:16px 20px;max-width:1200px}
 h1{font-size:17px;margin:0 0 4px} h2{font-size:14px;margin:22px 0 8px;color:#b9c2cc}
 .bar{background:#15171c;border:1px solid #262a31;border-radius:8px;padding:11px 14px;
      margin:12px 0}
 label{margin-right:18px;white-space:nowrap}
 .val{display:inline-block;min-width:2.6em;color:#8fd0a8}
 canvas{display:block;border-radius:6px;background:#0a0b0d}
 .note{color:#98a2ad;max-width:78ch}
 table{border-collapse:collapse;margin-top:8px}
 td,th{padding:3px 12px 3px 0;text-align:left;font-weight:400}
 th{color:#8b95a1}
 code{background:#181926;padding:1px 5px;border-radius:3px;color:#f9e2af}
</style>
<div class="wrap">
<h1>__NAME___walk.png — 실제 게임 크기</h1>
<p class="note">확대해서 보면 판단이 안 됩니다. 아래 캔버스는
<b>게임에서 보이는 그대로의 픽셀 크기</b>입니다. 화면 배율만 바꿔서 크게 볼 수 있습니다.</p>

<div class="bar">
 <label>화면 배율 <input type="range" id="zoom" min="1" max="6" value="3">
   <span class="val" id="zv">3×</span></label>
 <label>fps <input type="range" id="fps" min="2" max="16" value="8">
   <span class="val" id="fv">8</span></label>
 <label>몹 반지름 <input type="range" id="rad" min="6" max="20" value="10">
   <span class="val" id="rv">10</span></label>
 <label><input type="checkbox" id="move" checked> 이동</label>
 <label><input type="checkbox" id="nearest" checked> NEAREST 필터</label>
</div>

<div class="bar">
 <b>시안</b> — 어떤 원본 장을 어떤 꼬리 각도로 담을지
 <div id="plans" style="margin-top:8px"></div>
 <div class="note" style="margin-top:2px">
  f3·f4 만 쓰면 몸통은 잘 움직이는데 <b>꼬리가 멈춰 보입니다.</b>
  꼬리 길이가 48px 셀에서 12px 밖에 안 돼 두 장 사이 차이가 1px 미만이기 때문입니다.
  그래서 꼬리만 떼어 부착점 기준으로 회전시켜 <b>±각도 위상</b>을 만들었습니다.
  몸통은 2박자, 꼬리는 4박자로 돕니다.
 </div>
</div>

<div class="bar">
 <b>재생 순서</b> — <code>1,3,2,4</code> 처럼 1부터 센 프레임 번호를 쉼표로.
 비우면 <code>1,2,3,4</code>. 되감기(<code>1,2,3,4,3,2</code>)나 2장만(<code>2,4</code>)도 됩니다.
 <input type="text" id="ord" placeholder="1,2,3,4" style="width:100%;font:12px monospace;
   background:#14151a;color:#cfe;border:1px solid #333;border-radius:4px;
   padding:6px 8px;margin:7px 0 6px">
 <div id="presets"></div>
 <div style="margin-top:8px">
   현재 순서 <span class="val" id="ordv">1,2,3,4</span>
   &nbsp;|&nbsp; 보폭 흐름 <span class="val" id="stv"></span>
 </div>
</div>

<h2>0. 프레임별 실측</h2>
<div style="display:flex;gap:40px;flex-wrap:wrap">
 <div>
  <div style="color:#8b95a1;margin-bottom:2px">치수</div>
  <table id="meas"></table>
 </div>
 <div>
  <div style="color:#8b95a1;margin-bottom:2px">
   프레임 유사도 (받은 원본끼리, 1.00 = 같은 그림)</div>
  <table id="sim"></table>
 </div>
</div>
<p class="note">보폭 = 앞발↔뒷발 거리 ÷ 키. 키는 발끝을 맞춘 뒤의 셀 안 높이입니다.
걸음이 어색하면 대개 <b>보폭이 큰 프레임이 연달아</b> 있거나,
<b>키가 오르내리는 리듬이 보폭과 안 맞아서</b>입니다.<br>
오른쪽 표에서 <b style="color:#e0a06a">주황색 숫자(0.6 초과)</b>가 보이면
그 두 장은 사실상 같은 그림입니다 — 4컷을 받았어도 실제로는 2컷이라는 뜻이라,
순서를 아무리 바꿔도 안 고쳐집니다. 그림을 다시 받아야 합니다.</p>

<h2>1. 지금 vs 새 그림 — 나란히</h2>
<canvas id="cmp"></canvas>
<p class="note">왼쪽부터 <b>교체 전 고블린</b>, <b>지금 시트에 들어가 있는 몹</b>,
새 그림을 40 / 48px 셀로 담은 것, 그리고 플레이어입니다.
<b>몹끼리 크기·화풍이 맞는지</b>와 <b>플레이어와 같은 게임처럼 보이는지</b>가 핵심입니다.</p>

<h2>2. 몰려왔을 때</h2>
<canvas id="swarm"></canvas>
<p class="note">10마리가 겹쳐 다가옵니다. 실루엣이 뭉개지면 셀을 키우거나
그림을 단순화해야 합니다.</p>

<h2>3. 프레임 낱장 (8배 확대)</h2>
<canvas id="strip"></canvas>
</div>
<script>
const IMG = __IMG__, CELLS = __CELLS__;
const K = __K__;                 // ENEMY_SPRITE_K
const MEAS = __MEAS__;           // 시안별 프레임 실측 {plan: [{h, stride, headY}]}
const PRESETS = __PRESETS__;     // [[라벨, 순서문자열, 설명]]
const PLANS = __PLANS__;         // {key: 라벨}
const PLAN_ORDER = __PLAN_ORDER__;
const SIM = __SIM__;             // 원본 프레임끼리 IoU
const DUP = __DUP__;             // 그 중 '유독 비슷한' 쌍
const img = {};
let ready = 0, total = Object.keys(IMG).length;
for (const k in IMG) {
  const i = new Image(); i.onload = () => { if (++ready === total) start(); };
  i.src = IMG[k]; img[k] = i;
}
const S = { zoom: 3, fps: 8, rad: 10, move: true, nearest: true, t: 0,
            order: [0, 1, 2, 3], plan: PLAN_ORDER[0] };
const el = id => document.getElementById(id);

// ---- 시안 버튼
function setPlan(k) {
  S.plan = k;
  document.querySelectorAll('#plans button').forEach(b => {
    b.style.background = b.dataset.k === k ? '#3d5a7a' : '#313244';
  });
  drawMeas();
  setOrder(el('ord').value || '1,2,3,4');
}
PLAN_ORDER.forEach(k => {
  const b = document.createElement('button');
  b.textContent = PLANS[k]; b.dataset.k = k;
  b.style.cssText = 'color:#cdd6f4;border:0;padding:6px 12px;border-radius:4px;' +
                    'margin:0 7px 6px 0;cursor:pointer;font:12px system-ui';
  b.onclick = () => setPlan(k);
  el('plans').appendChild(b);
});

// ---- 실측 표
function drawMeas() {
  let h = '<tr><th>프레임</th><th>키</th><th>머리y</th><th>보폭%</th></tr>';
  MEAS[S.plan].forEach((m, i) => {
    h += `<tr><td>f${i + 1}</td><td>${m.h}</td><td>${m.headY}</td>` +
         `<td>${m.stride.toFixed(0)}</td></tr>`;
  });
  el('meas').innerHTML = h;
}

(function drawSim() {
  let h = '<tr><th></th><th>f1</th><th>f2</th><th>f3</th><th>f4</th></tr>';
  SIM.forEach((row, i) => {
    h += `<tr><th>f${i + 1}</th>`;
    row.forEach((v, j) => {
      const dup = DUP.some(p => (p[0] === i && p[1] === j) || (p[0] === j && p[1] === i));
      h += `<td style="color:${dup ? '#e0a06a' : i === j ? '#5b656f' : '#aeb8c2'}">` +
           v.toFixed(2) + '</td>';
    });
    h += '</tr>';
  });
  el('sim').innerHTML = h;
})();

// ---- 순서 입력
function setOrder(txt) {
  const v = String(txt).split(/[^0-9]+/).filter(Boolean)
                       .map(n => +n - 1).filter(n => n >= 0 && n < 4);
  S.order = v.length ? v : [0, 1, 2, 3];
  el('ordv').textContent = S.order.map(n => n + 1).join(',');
  el('stv').textContent = S.order.map(n => Math.round(MEAS[S.plan][n].stride)).join(' → ');
}
el('ord').oninput = e => setOrder(e.target.value);
PRESETS.forEach(([label, ord, why]) => {
  const b = document.createElement('button');
  b.textContent = label; b.title = why;
  b.style.cssText = 'background:#313244;color:#cdd6f4;border:0;padding:5px 10px;' +
                    'border-radius:4px;margin:0 6px 6px 0;cursor:pointer;font:12px monospace';
  b.onclick = () => { el('ord').value = ord; setOrder(ord); };
  el('presets').appendChild(b);
});
setPlan(PLAN_ORDER[0]);

function bindRange(id, vid, fmt, on) {
  el(id).oninput = e => { on(+e.target.value); el(vid).textContent = fmt(+e.target.value); };
}
bindRange('zoom', 'zv', v => v + '×', v => S.zoom = v);
bindRange('fps', 'fv', v => v, v => S.fps = v);
bindRange('rad', 'rv', v => v, v => S.rad = v);
el('move').onchange = e => S.move = e.target.checked;
el('nearest').onchange = e => S.nearest = e.target.checked;

// 바닥 — 게임의 아이소 타일에서 한 조각을 떼어 반복해 깐다
let floorPat = null;
function makeFloor() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 32;
  const x = c.getContext('2d');
  x.drawImage(img.floor, 0, 0, 64, 32, 0, 0, 64, 32);
  return x.createPattern(c, 'repeat');
}

function drawFloor(ctx, w, h, off) {
  ctx.save();
  ctx.fillStyle = floorPat;
  ctx.translate(-off % 64, 0);
  ctx.fillRect(0, 0, w + 64, h);
  ctx.restore();
  // 게임처럼 위아래를 어둡게
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(.5, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,.55)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

// 한 마리 그리기. cell 은 시트의 셀 크기, scale 은 game 의 setScale 과 같은 의미
function drawMob(ctx, sheetKey, cell, frame, cx, cy, scale, flip) {
  const w = cell * scale;
  ctx.save();
  ctx.translate(cx, cy);
  if (flip) ctx.scale(-1, 1);
  // main.js: setOrigin(0.5, 0.72) — 피벗이 셀의 72% 지점
  ctx.drawImage(img[sheetKey], frame * cell, 0, cell, cell,
                -w / 2, -w * 0.72, w, w);
  ctx.restore();
}

const LANES = [
  { label: '옛 고블린 32px', key: 'now', cell: 32, row: 0 },
  { label: '현재 시트 몹', key: 'cur', cell: __CUR_CELL__, row: 0 },
  { label: '새 40px', cell: 40 },
  { label: '새 48px', cell: 48 },
  { label: '플레이어', key: 'player', cell: 96 },
];
const mkey = cell => 'm' + cell + '_' + S.plan;

function renderCmp() {
  const c = el('cmp'), z = S.zoom;
  const CW = 150, CH = 110;
  c.width = CW * LANES.length * z; c.height = CH * z;
  c.style.width = c.width + 'px';
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = !S.nearest;
  ctx.save(); ctx.scale(z, z);
  drawFloor(ctx, CW * LANES.length, CH, S.move ? S.t * 40 : 0);
  const f = Math.floor(S.t * S.fps);
  const mf = S.order[f % S.order.length];      // 새 몹은 지정 순서를 따른다
  LANES.forEach((L, i) => {
    const cx = CW * i + CW / 2, cy = CH * 0.60;
    if (L.key === 'player') {
      // 플레이어는 셀 96×116, 배율 0.55 고정
      const ORDER = [0, 1, 3, 5], col = ORDER[f % 4];
      const w = 96 * 0.55, h = 116 * 0.55;
      ctx.drawImage(img.player, col * 96, 116, 96, 116, cx - w / 2, cy - h * 0.93, w, h);
    } else if (L.row !== undefined) {
      // 지금 고블린은 원래 순서 그대로 — 비교 기준이라 건드리지 않는다
      drawMob(ctx, L.key, L.cell, L.row * 4 + (f % 4), cx, cy, S.rad * K, false);
    } else {
      drawMob(ctx, mkey(L.cell), L.cell, mf, cx, cy, S.rad * K, false);
    }
    ctx.fillStyle = '#aeb8c2'; ctx.font = '9px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(L.label, cx, CH - 16);
    const px = L.key === 'player' ? 64 : Math.round(L.cell * S.rad * K);
    ctx.fillStyle = '#79838e';
    ctx.fillText(px + 'px', cx, CH - 5);
  });
  ctx.restore();
}

const SWARM = [];
for (let i = 0; i < 10; i++) {
  SWARM.push({ x: Math.random(), y: 0.25 + Math.random() * 0.6,
               sp: 0.6 + Math.random() * 0.7, off: (Math.random() * 4) | 0 });
}
const swarmCell = 48;
function renderSwarm() {
  const c = el('swarm'), z = S.zoom;
  const W = 300, H = 110;
  c.width = W * z; c.height = H * z; c.style.width = c.width + 'px';
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = !S.nearest;
  ctx.save(); ctx.scale(z, z);
  drawFloor(ctx, W, H, S.move ? S.t * 40 : 0);
  const f = Math.floor(S.t * S.fps);
  // y 가 큰 것부터 그려야 앞뒤가 맞는다
  [...SWARM].sort((a, b) => a.y - b.y).forEach(m => {
    const x = S.move ? ((m.x + S.t * 0.05 * m.sp) % 1.2 - 0.1) * W : m.x * W;
    const fr = S.order[(f + m.off) % S.order.length];
    drawMob(ctx, mkey(swarmCell), swarmCell, fr, x, m.y * H, S.rad * K, x > W / 2);
  });
  ctx.restore();
}

function renderStrip() {
  const c = el('strip'), Z = 6, cell = 48;
  c.width = cell * 4 * Z; c.height = cell * Z + 18;
  c.style.width = c.width + 'px';
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#15171c'; ctx.fillRect(0, 0, c.width, c.height);
  // 지금 재생 중인 프레임을 밝게 — 어느 장에서 튀는지 짚기 쉽다
  const cur = S.order[Math.floor(S.t * S.fps) % S.order.length];
  ctx.fillStyle = '#243047'; ctx.fillRect(cur * cell * Z, 0, cell * Z, cell * Z);
  ctx.drawImage(img[mkey(cell)], 0, 0, cell * 4, cell, 0, 0, cell * 4 * Z, cell * Z);
  ctx.font = '11px system-ui';
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i === cur ? '#8fd0a8' : '#8b95a1';
    ctx.fillText('f' + (i + 1) + '  보폭 ' + Math.round(MEAS[S.plan][i].stride) +
                 '  키 ' + MEAS[S.plan][i].h, i * cell * Z + 6, cell * Z + 13);
    ctx.strokeStyle = '#31363f'; ctx.beginPath();
    ctx.moveTo(i * cell * Z, 0); ctx.lineTo(i * cell * Z, cell * Z); ctx.stroke();
  }
  // 접지선
  ctx.strokeStyle = '#b45a70'; ctx.beginPath();
  ctx.moveTo(0, cell * 0.94 * Z); ctx.lineTo(c.width, cell * 0.94 * Z); ctx.stroke();
}

let last = 0;
function loop(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
  S.t += dt;
  renderCmp(); renderSwarm(); renderStrip();
  requestAnimationFrame(loop);
}
function start() { floorPat = makeFloor(); renderStrip(); requestAnimationFrame(loop); }
</script>
"""

import json                                                          # noqa: E402

out = (HTML.replace('__IMG__', json.dumps(IMG))
           .replace('__CELLS__', str(CELLS))
           .replace('__K__', str(SPRITE_K))
           .replace('__MEAS__', json.dumps(MEAS))
           .replace('__PRESETS__', json.dumps(PRESETS, ensure_ascii=False))
           .replace('__PLANS__', json.dumps({k: v[0] for k, v in PLANS.items()},
                                            ensure_ascii=False))
           .replace('__PLAN_ORDER__', json.dumps(PLAN_ORDER))
           .replace('__CUR_CELL__', str(CUR_CELL))
           .replace('__SIM__', json.dumps(SIM))
           .replace('__DUP__', json.dumps(DUP))
           .replace('__NAME__', NAME))
p = HERE / f'{TAG}test.html'
p.write_text(out, encoding='utf-8')
print(f'\nsaved {p.name}  {len(out) // 1024}KB')

# ------------------------------------------------------------ 정적 미리보기
# HTML 이 안 열리는 상황에서도 조립 결과를 확인할 수 있게 PNG 로도 남긴다.
from PIL import ImageDraw                                            # noqa: E402

# 비교 기준은 **교체 전** 32px 시트다. 이미 48px 로 갈아끼웠으면 백업본을 쓴다.
oldp = PUB / 'enemies_sheet_32_old.png'
if not oldp.exists():
    oldp = PUB / 'enemies_sheet.png'
now = Image.open(oldp).convert('RGBA').crop((0, 0, 128, 32))
Z = 6
rows = ([('지금 고블린 32px', now, 32)] +
        [(f'{PLANS[n][0]} — 48px', sheets[(48, n)], 48) for n in PLAN_ORDER])
gap = 16
Wp = max(r[1].width for r in rows) * Z + 24
pv = Image.new('RGB', (Wp, sum(r[1].height * Z + 24 for r in rows) + 14), (24, 25, 29))
d = ImageDraw.Draw(pv)
y = 8
for lbl, im, c in rows:
    on = c * SPRITE_K * 10
    d.text((12, y), f'{lbl}   화면 {on:.0f}px', fill=(205, 213, 208))
    y += 16
    big = im.resize((im.width * Z, im.height * Z), Image.NEAREST)
    pv.paste(big, (12, y), big)
    for i in range(1, 4):
        d.line([(12 + c * i * Z, y), (12 + c * i * Z, y + im.height * Z)], fill=(62, 68, 78))
    d.line([(12, y + round(c * FOOT) * Z), (12 + big.width, y + round(c * FOOT) * Z)],
           fill=(180, 90, 112))
    y += im.height * Z + 8
pv.save(HERE / f'{TAG}sheets.png')
print(f'saved {TAG}sheets.png  {pv.size}')

# ------------------------------------------------------------ 꼬리 검출 확인
# 꼬리를 잘못 잡으면(다리를 꼬리로 착각) 회전 결과가 기괴해진다. 눈으로 볼 수 있게 찍는다.
tm = []
for i in range(4):
    arr, tail, pivot = frame_rgba(i)
    a = arr[..., 3] > 90
    vis = np.zeros(a.shape + (3,), np.uint8)
    vis[a] = (70, 74, 82)
    if tail is not None:
        vis[tail] = (236, 120, 90)
    im = Image.fromarray(vis, 'RGB')
    if pivot:
        dd = ImageDraw.Draw(im)
        dd.ellipse([pivot[0] - 9, pivot[1] - 9, pivot[0] + 9, pivot[1] + 9],
                   outline=(120, 220, 150), width=4)
    tm.append(im.resize((im.width // 3, im.height // 3), Image.NEAREST))
Wt = sum(t.width for t in tm) + 30
tv = Image.new('RGB', (Wt, max(t.height for t in tm) + 30), (22, 23, 27))
dt = ImageDraw.Draw(tv)
dt.text((10, 5), '주황 = 꼬리로 잡은 영역 / 초록 원 = 회전 축(부착점). 틀리면 CORE_R 을 조정',
        fill=(205, 213, 208))
x = 10
for t in tm:
    tv.paste(t, (x, 22))
    x += t.width + 6
tv.save(HERE / f'{TAG}tailmask.png')
print(f'saved {TAG}tailmask.png  {tv.size}')
