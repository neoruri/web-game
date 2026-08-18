"""SD(Forge) img2img 용 재료 생성 — 초기 이미지 1장 + OpenPose 스켈레톤 8장.

=== 왜 img2img 인가 ===
txt2img + IP-Adapter 로는 캐릭터가 안 잡혔다(해골 여성이 나옴).
`idle.png` 는 **캐릭터·화풍·초록배경을 이미 다 갖고 있다.**
그것을 초기 이미지로 넣고 ControlNet OpenPose 로 포즈만 바꾸면
모델이 화풍을 "발명"할 필요가 없어진다.

=== idle.png 실측 (목표값) ===
  유니크 색 36,294  ← 하드에지 픽셀아트가 아니다. 부드러운 페인팅
  몸통 명도 48.6 / R-B +0.3 / 국소대비 9.30
  발광 면적 4.9%, 색조 288도 (자마젠타)
  초록 배경 69.8%, 대표색 (12, 245, 5)

실행: python3 tools/sprites/make_sd_assets.py
출력: tools/sprites/sd/init_idle.png        img2img 초기 이미지 (1프레임)
      tools/sprites/sd/pose_run_f1..f8.png  OpenPose 스켈레톤 8장
      tools/sprites/sd/_pose_preview.png    스켈레톤 8장 미리보기
"""
import pathlib

import numpy as np
from PIL import Image, ImageDraw

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / 'sd'
OUT.mkdir(exist_ok=True)
IDLE = HERE / 'player_strips' / 'idle.png'

W, H = 512, 768          # SD1.5 native. 세로로 긴 인물

# ---------------------------------------------------------------- 초기 이미지
# idle 스트립의 1번 프레임만 잘라 512×768 캔버스 중앙 하단에 배치.
# 배경은 idle.png 의 초록을 그대로 채운다 → 생성물도 초록 배경으로 나온다.
src = Image.open(IDLE).convert('RGB')
a = np.asarray(src).astype(int)
R, G, B = a[..., 0], a[..., 1], a[..., 2]
bg = (G > 150) & (R < 140) & (B < 140) & (G - np.maximum(R, B) > 60)
GREEN = tuple(int(v) for v in a[bg].mean(axis=0).round())
fg = ~bg
cols = fg.any(axis=0)
runs, s = [], None
for i, v in enumerate(list(cols) + [False]):
    if v and s is None:
        s = i
    elif not v and s is not None:
        if i - s > 30:
            runs.append((s, i - 1))
        s = None
x0, x1 = runs[0]
sub = fg[:, x0:x1 + 1]
ys, xs = np.nonzero(sub)
frame = src.crop((x0 + xs.min(), ys.min(), x0 + xs.max() + 1, ys.max() + 1))

MARGIN = 40              # 위아래 여유. 달리면 팔다리가 더 벌어진다
k = (H - MARGIN * 2) / frame.height
fw, fh = round(frame.width * k), round(frame.height * k)
init = Image.new('RGB', (W, H), GREEN)
init.paste(frame.resize((fw, fh), Image.LANCZOS), ((W - fw) // 2, H - MARGIN - fh))
init.save(OUT / 'init_idle.png')
GROUND_Y = H - MARGIN    # 발끝이 놓이는 y. 스켈레톤도 같은 값을 쓴다
print(f'init_idle.png  {init.size}  배경 {GREEN}  인물 {fw}×{fh}  접지 y={GROUND_Y}')

# ---------------------------------------------------------------- OpenPose
# COCO-18 규격. ControlNet 은 이 색 배치를 전제로 학습돼 있으므로 색을 바꾸면 안 된다.
#  0 nose 1 neck 2 Rsho 3 Relb 4 Rwri 5 Lsho 6 Lelb 7 Lwri
#  8 Rhip 9 Rkne 10 Rank 11 Lhip 12 Lkne 13 Lank 14 Reye 15 Leye 16 Rear 17 Lear
LIMBS = [(1, 2), (1, 5), (2, 3), (3, 4), (5, 6), (6, 7), (1, 8), (8, 9), (9, 10),
         (1, 11), (11, 12), (12, 13), (1, 0), (0, 14), (14, 16), (0, 15), (15, 17)]
LIMB_COLOR = [(153, 0, 0), (153, 51, 0), (153, 102, 0), (153, 153, 0), (102, 153, 0),
              (51, 153, 0), (0, 153, 0), (0, 153, 51), (0, 153, 102), (0, 153, 153),
              (0, 102, 153), (0, 51, 153), (0, 0, 153), (51, 0, 153), (102, 0, 153),
              (153, 0, 153), (153, 0, 102)]
PT_COLOR = [(255, 0, 0), (255, 85, 0), (255, 170, 0), (255, 255, 0), (170, 255, 0),
            (85, 255, 0), (0, 255, 0), (0, 255, 85), (0, 255, 170), (0, 255, 255),
            (0, 170, 255), (0, 85, 255), (0, 0, 255), (85, 0, 255), (170, 0, 255),
            (255, 0, 255), (255, 0, 170), (255, 0, 85)]

# 몸 높이(머리끝~발끝)를 1.0 으로 본 정규 좌표. x 는 진행방향(+ = 앞/오른쪽).
# 측면 우향. 발끝은 항상 y=0.94 (= 접지선). 스윙하는 발만 위로 뜬다.
#
# ⚠️ 세로 반동을 넣지 않는다. 레퍼런스 실측에서 발끝 y 변동이 0 이었다.
#    달리기는 **보폭**으로 표현된다 (0 → 몸높이의 50%).
BODY = dict(nose=0.075, neck=0.150, sho=0.170, hip=0.480, gy=0.940)
LEAN = 0.10              # 상체 전방 기울기 — 머리가 엉덩이보다 몸높이의 10% 앞

# 프레임별 (앞다리 무릎, 앞다리 발목, 뒷다리 무릎, 뒷다리 발목, 앞팔꿈치, 앞손목)
# '앞다리' = 그 프레임에서 앞으로 나간 다리. 5~8 은 좌우를 바꿔 쓴다.
STEP = [
    # F1 PASSING  보폭 ~0.13
    dict(fk=(0.10, 0.660), fa=(0.13, 0.800), bk=(-0.02, 0.700), ba=(0.00, 0.940),
         ae=(0.10, 0.285), aw=(0.20, 0.245)),
    # F2 REACHING 보폭 ~0.30
    dict(fk=(0.17, 0.655), fa=(0.26, 0.855), bk=(-0.07, 0.710), ba=(-0.05, 0.940),
         ae=(0.12, 0.290), aw=(0.23, 0.260)),
    # F3 CONTACT  보폭 ~0.50  ← 가장 넓다
    dict(fk=(0.20, 0.700), fa=(0.28, 0.940), bk=(-0.12, 0.720), ba=(-0.22, 0.905),
         ae=(0.13, 0.295), aw=(0.25, 0.275)),
    # F4 PUSH     보폭 ~0.18
    dict(fk=(0.06, 0.710), fa=(0.10, 0.940), bk=(0.00, 0.660), ba=(-0.08, 0.840),
         ae=(0.06, 0.285), aw=(0.15, 0.240)),
]


def keypoints(i):
    """i = 0..7 → COCO-18 정규 좌표. 5~8 은 다리·팔 좌우를 교대한다."""
    st = STEP[i % 4]
    swap = i >= 4                     # 후반 4프레임은 반대 발
    b = BODY
    hipx = 0.0
    nx = hipx + LEAN                  # 목·머리는 앞으로
    p = {}
    p[0] = (nx + 0.03, b['nose'])
    p[1] = (nx, b['neck'])
    # 어깨 — 측면이라 두 어깨가 거의 겹친다. 앞쪽 어깨를 살짝 앞에
    p[2] = (nx + 0.03, b['sho'])      # R
    p[5] = (nx - 0.03, b['sho'])      # L
    p[8] = (hipx + 0.02, b['hip'])    # R hip
    p[11] = (hipx - 0.02, b['hip'])   # L hip
    fk, fa, bk, ba = st['fk'], st['fa'], st['bk'], st['ba']
    if swap:                          # 앞다리를 왼쪽으로
        p[12], p[13] = fk, fa
        p[9], p[10] = bk, ba
    else:
        p[9], p[10] = fk, fa
        p[12], p[13] = bk, ba
    # 팔은 다리와 **반대로**. 앞다리가 오른쪽이면 왼팔이 앞.
    ae, aw = st['ae'], st['aw']
    be = (-ae[0] * 0.9, ae[1] + 0.01)
    bw = (-aw[0] * 0.85, aw[1] + 0.075)
    if swap:                          # 앞다리 왼쪽 → 오른팔이 앞
        p[3], p[4] = ae, aw
        p[6], p[7] = be, bw
    else:
        p[6], p[7] = ae, aw
        p[3], p[4] = be, bw
    # 눈·귀 — 후드로 가려지지만 OpenPose 규격상 넣어준다
    p[14] = (nx + 0.05, b['nose'] - 0.012)
    p[15] = (nx + 0.01, b['nose'] - 0.012)
    p[16] = (nx + 0.01, b['nose'] - 0.005)
    p[17] = (nx - 0.03, b['nose'] - 0.005)
    return p


def draw_pose(p, body_h_px, cx, gy):
    """정규 좌표 → 512×768 검정 배경 스켈레톤."""
    im = Image.new('RGB', (W, H), (0, 0, 0))
    d = ImageDraw.Draw(im)

    def X(t):
        return cx + t[0] * body_h_px

    def Y(t):
        return gy - (0.94 - t[1]) * body_h_px

    for (a_, b_), col in zip(LIMBS, LIMB_COLOR):
        if a_ in p and b_ in p:
            d.line([X(p[a_]), Y(p[a_]), X(p[b_]), Y(p[b_])], fill=col, width=9)
    for idx, t in p.items():
        r = 5
        d.ellipse([X(t) - r, Y(t) - r, X(t) + r, Y(t) + r], fill=PT_COLOR[idx])
    return im


BODY_H = H - MARGIN * 2               # 스켈레톤 몸 높이(px)
poses = []
for i in range(8):
    p = keypoints(i)
    im = draw_pose(p, BODY_H, W // 2, GROUND_Y)
    im.save(OUT / f'pose_run_f{i + 1}.png')
    poses.append(im)
    # 보폭 검증
    ax = [p[10][0], p[13][0]]
    print(f'  pose_run_f{i + 1}.png  보폭 {abs(ax[0] - ax[1]) * 100:5.1f}%  '
          f'발끝y {min(p[10][1], p[13][1]):.3f}/{max(p[10][1], p[13][1]):.3f}')

# 미리보기 — 초기 이미지 위에 스켈레톤을 반투명으로 겹쳐 정렬 확인
Z = 0.42
tw, th = int(W * Z), int(H * Z)
sheet = Image.new('RGB', (tw * 8 + 9, th + 26), (24, 24, 28))
d = ImageDraw.Draw(sheet)
for i, ps in enumerate(poses):
    mix = Image.blend(init.convert('RGB'), ps, 0.55)
    sheet.paste(mix.resize((tw, th), Image.LANCZOS), (1 + i * (tw + 1), 24))
    d.text((5 + i * (tw + 1), 6), f'f{i + 1}', fill=(230, 230, 230))
sheet.save(OUT / '_pose_preview.png')
print(f'\n_pose_preview.png  {sheet.size}  (초기 이미지 위에 스켈레톤 겹침)')
