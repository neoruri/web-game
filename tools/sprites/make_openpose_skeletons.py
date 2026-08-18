"""
run 사이클 8프레임용 OpenPose 스켈레톤 생성기.

docs/SD_Forge_작업지시.md §6 의 실측 스펙을 좌표로 옮긴 것:
  - 보폭: 0 / 30% / 50% / 20% (몸높이 대비), 1~4 = 오른발 스텝, 5~8 = 왼발 스텝
  - 발끝 y 고정. 공중에 뜨는 프레임 없음
  - 머리 y ±3% 이내
  - 상체는 항상 앞으로 기울어짐 (머리가 엉덩이보다 몸높이의 10% 앞)
  - 팔은 다리와 반대로 90도 굽혀 펌프

COCO-18 포맷 + OpenPose 표준 색상으로 그린다. ControlNet openpose 모델은
이 색 규약을 학습했기 때문에 색을 바꾸면 인식률이 떨어진다.

사용법:
    python make_openpose_skeletons.py
    -> pose_skeletons/run_pose_f1.png ... run_pose_f8.png
"""
import math
import os

import cv2
import numpy as np

# ── 캔버스 / 인체 비율 ────────────────────────────────────────────────
W, H_IMG = 512, 768
# 인물을 캔버스에 꽉 채우면 SD 가 다리를 잘라먹는다. 위아래로 여백을 넉넉히 둔다
GROUND_Y = 624          # 발끝. 전 프레임 고정 (§6: 절대 안 움직인다)
HEAD_TOP_Y = 144
BODY_H = GROUND_Y - HEAD_TOP_Y   # 480

NOSE_Y, NECK_Y, SHO_Y = 186, 232, 248
HIP_Y = 426             # 러닝 자세라 약간 낮다. 이 값이라야 50% 보폭에서 다리가 닿는다
KNEE_LEN = 125          # 대퇴 = 정강이. 여유를 줘야 CONTACT 에서 무릎 굽힘이 보인다
SHIN_LEN = 125
HIP_X = 244             # 골반 x 기준

LEAN = int(BODY_H * 0.10)   # 48px. 머리가 엉덩이보다 이만큼 앞

UPPER_ARM, FOREARM = 77, 73

# 보폭 테이블 (몸높이 대비). 1·5 = PASSING, 3·7 = CONTACT
STRIDE_PCT = [0.0, 0.30, 0.50, 0.20, 0.0, 0.30, 0.50, 0.20]

# ── OpenPose COCO-18 규약 ────────────────────────────────────────────
# 0 nose 1 neck 2 Rsho 3 Relb 4 Rwri 5 Lsho 6 Lelb 7 Lwri
# 8 Rhip 9 Rkne 10 Rank 11 Lhip 12 Lkne 13 Lank 14 Reye 15 Leye 16 Rear 17 Lear
LIMB_SEQ = [[1, 2], [1, 5], [2, 3], [3, 4], [5, 6], [6, 7], [1, 8], [8, 9],
            [9, 10], [1, 11], [11, 12], [12, 13], [1, 0], [0, 14], [14, 16],
            [0, 15], [15, 17]]
COLORS = [[255, 0, 0], [255, 85, 0], [255, 170, 0], [255, 255, 0], [170, 255, 0],
          [85, 255, 0], [0, 255, 0], [0, 255, 85], [0, 255, 170], [0, 255, 255],
          [0, 170, 255], [0, 85, 255], [0, 0, 255], [85, 0, 255], [170, 0, 255],
          [255, 0, 255], [255, 0, 170], [255, 0, 85]]
STICK_W = 4


def solve_knee(hip, ankle, l1=KNEE_LEN, l2=SHIN_LEN, forward=+1):
    """2링크 IK. 무릎은 진행방향(+x)으로 굽는다."""
    hx, hy = hip
    ax, ay = ankle
    dx, dy = ax - hx, ay - hy
    d = math.hypot(dx, dy)
    d = min(d, l1 + l2 - 1e-3)          # 닿지 않으면 최대로 편다
    a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    h = math.sqrt(max(l1 * l1 - a * a, 0.0))
    mx, my = hx + a * dx / d, hy + a * dy / d
    # 수직 방향 (진행방향 쪽으로)
    px, py = -dy / d, dx / d
    if px * forward < 0:
        px, py = -px, -py
    return (mx + h * px, my + h * py)


def arm(shoulder, swing, amt=1.0):
    """측면 러닝의 팔. swing: +1 앞으로, -1 뒤로. 팔꿈치는 항상 90도 근처.
    amt 는 스윙 강도(0=중립). 팔이 옆으로 벌어지면 T 포즈로 읽히므로
    전완만 앞뒤로 움직이고 상완은 몸통을 따라 내린다."""
    sx, sy = shoulder
    if swing > 0:                       # 앞으로 스윙: 손이 가슴 앞 높이까지 올라온다
        elb = (sx - 20 * amt, sy + UPPER_ARM * 0.90)
        wri = (elb[0] + FOREARM * (0.62 * amt + 0.10),
               elb[1] - FOREARM * (0.60 * amt + 0.05))
    else:                               # 뒤로 스윙: 팔꿈치가 뒤로, 손은 엉덩이 옆
        elb = (sx - UPPER_ARM * (0.34 * amt + 0.04), sy + UPPER_ARM * 0.86)
        wri = (elb[0] - FOREARM * (0.40 * amt + 0.06),
               elb[1] + FOREARM * (0.52 * amt + 0.10))
    return elb, wri


def build_frame(idx):
    """idx: 0-based. 0~3 = 오른발 스텝, 4~7 = 왼발 스텝."""
    stride = BODY_H * STRIDE_PCT[idx]
    half = stride / 2.0
    passing = STRIDE_PCT[idx] == 0.0
    right_leads = idx < 4               # 1~4 는 오른발이 앞

    hip = (HIP_X, HIP_Y)
    neck = (HIP_X + LEAN * 0.62, NECK_Y)
    nose = (HIP_X + LEAN, NOSE_Y)

    if passing:
        # 발 모음. 지지발은 곧게, 스윙발은 무릎을 들어 접는다 (발끝 y 는 유지)
        planted_ank = (HIP_X - 6, GROUND_Y)
        swing_ank = (HIP_X + 26, GROUND_Y)
        planted_knee = solve_knee(hip, planted_ank)
        swing_knee = (HIP_X + 58, HIP_Y + 74)     # 무릎 들림
    else:
        front_ank = (HIP_X + half, GROUND_Y)
        back_ank = (HIP_X - half, GROUND_Y)
        planted_ank, swing_ank = front_ank, back_ank
        planted_knee = solve_knee(hip, front_ank)
        swing_knee = solve_knee(hip, back_ank)

    if right_leads:
        r_ank, r_knee = planted_ank, planted_knee
        l_ank, l_knee = swing_ank, swing_knee
        r_swing, l_swing = -1, +1       # 팔은 다리와 반대
    else:
        l_ank, l_knee = planted_ank, planted_knee
        r_ank, r_knee = swing_ank, swing_knee
        l_swing, r_swing = -1, +1

    # 팔 스윙 강도는 보폭에 비례. PASSING 은 팔이 교차하는 중간이라 작게
    amt = 0.28 if passing else min(STRIDE_PCT[idx] / 0.5, 1.0)
    # 측면 뷰라 좌우 어깨/골반은 거의 겹친다. 벌리면 3/4 뷰로 읽힌다
    r_sho = (neck[0] + 1, SHO_Y)
    l_sho = (neck[0] - 1, SHO_Y)
    r_elb, r_wri = arm(r_sho, r_swing, amt)
    l_elb, l_wri = arm(l_sho, l_swing, amt)

    pts = [None] * 18
    pts[0] = nose
    pts[1] = neck
    pts[2], pts[3], pts[4] = r_sho, r_elb, r_wri
    pts[5], pts[6], pts[7] = l_sho, l_elb, l_wri
    pts[8], pts[9], pts[10] = (HIP_X + 1, HIP_Y), r_knee, r_ank
    pts[11], pts[12], pts[13] = (HIP_X - 1, HIP_Y), l_knee, l_ank
    # 우향 측면에서는 반대쪽 눈·귀가 보이지 않는다. 실제 OpenPose 출력도 그것을 비운다.
    # 여기에 좌우를 다 찍으면 정면/3-4 뷰로 읽힌다
    pts[14] = (nose[0] + 4, nose[1] - 11)     # 오른쪽 눈
    pts[16] = (nose[0] - 22, nose[1] - 7)     # 오른쪽 귀
    pts[15] = None
    pts[17] = None
    return pts


def draw(pts):
    canvas = np.zeros((H_IMG, W, 3), dtype=np.uint8)
    for i, (a, b) in enumerate(LIMB_SEQ):
        pa, pb = pts[a], pts[b]
        if pa is None or pb is None:
            continue
        mx, my = (pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2
        length = math.hypot(pa[0] - pb[0], pa[1] - pb[1])
        angle = math.degrees(math.atan2(pa[1] - pb[1], pa[0] - pb[0]))
        poly = cv2.ellipse2Poly((int(mx), int(my)),
                                (int(length / 2), STICK_W), int(angle), 0, 360, 1)
        layer = canvas.copy()
        cv2.fillConvexPoly(layer, poly, COLORS[i][::-1])   # BGR
        canvas = cv2.addWeighted(canvas, 0.4, layer, 0.6, 0)
    for i, p in enumerate(pts):
        if p is None:
            continue
        cv2.circle(canvas, (int(p[0]), int(p[1])), 4, COLORS[i][::-1], thickness=-1)
    return canvas


def main():
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pose_skeletons")
    os.makedirs(out_dir, exist_ok=True)
    for i in range(8):
        img = draw(build_frame(i))
        path = os.path.join(out_dir, f"run_pose_f{i + 1}.png")
        cv2.imwrite(path, img)
        print(f"  f{i + 1}  stride={STRIDE_PCT[i]:.0%}  -> {path}")


if __name__ == "__main__":
    main()
