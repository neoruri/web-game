"""
실제 러닝 생체역학에 맞춘 run 6프레임 OpenPose 스켈레톤.

기존 parts/run_f1~6.png 실측 결과 (보폭/키):
    f1 0.83  f2 0.37  f3 0.41  f4 0.84  f5 0.36  f6 0.44
  -> 정점이 인간 범위(0.45~0.50)를 1.9배 초과하고, 나머지 4장은 서로 8%p 차이뿐이라
     "크게 벌림 -> 거의 정지 -> 거의 정지 -> 크게 벌림"으로 끊긴다. PASSING 국면이 없다.

목표 곡선 (스텝당 3프레임 × 2스텝):
    f1 CONTACT 0.45   f2 PASSING 0.08   f3 PUSH 0.28
    f4 CONTACT 0.45   f5 PASSING 0.08   f6 PUSH 0.28   (다리·팔 좌우 교대)

원칙:
  - 접지발 y 고정. 공중에 뜨는 프레임을 만들지 않는다 (뜨면 '깡충 뛰는' 결과가 된다)
  - 스윙발만 들린다
  - 머리 y 변동 ±3% 이내
  - 상체는 항상 앞으로 기울어짐 (머리가 엉덩이보다 몸높이의 10% 앞)
  - 팔은 다리와 반대로 약 90도 굽혀 스윙
"""
import math
import os

import cv2
import numpy as np

W, H_IMG = 512, 768
HEAD_TOP = 130
GROUND_Y = 640
BODY_H = GROUND_Y - HEAD_TOP          # 510
HIP_X = 250

NOSE_Y = HEAD_TOP + int(0.09 * BODY_H)
NECK_Y = HEAD_TOP + int(0.16 * BODY_H)
SHO_Y = HEAD_TOP + int(0.18 * BODY_H)
HIP_Y = HEAD_TOP + int(0.52 * BODY_H)
LEAN = int(0.10 * BODY_H)

THIGH = int(0.28 * BODY_H)            # 대퇴 = 정강이. 합 0.56H > 필요한 0.53H (굽힘 여유)
SHIN = int(0.28 * BODY_H)
UPPER_ARM = int(0.17 * BODY_H)
FOREARM = int(0.16 * BODY_H)

# (보폭비, 국면). 스텝당 3프레임, 6프레임은 두 스텝
CYCLE = [(0.45, "contact"), (0.08, "passing"), (0.28, "push")] * 2

LIMB_SEQ = [[1, 2], [1, 5], [2, 3], [3, 4], [5, 6], [6, 7], [1, 8], [8, 9],
            [9, 10], [1, 11], [11, 12], [12, 13], [1, 0], [0, 14], [14, 16],
            [0, 15], [15, 17]]
COLORS = [[255, 0, 0], [255, 85, 0], [255, 170, 0], [255, 255, 0], [170, 255, 0],
          [85, 255, 0], [0, 255, 0], [0, 255, 85], [0, 255, 170], [0, 255, 255],
          [0, 170, 255], [0, 85, 255], [0, 0, 255], [85, 0, 255], [170, 0, 255],
          [255, 0, 255], [255, 0, 170], [255, 0, 85]]
STICK_W = 6                            # 얇으면 ControlNet 이 약하게 따른다


def ik(hip, ankle, l1=THIGH, l2=SHIN, forward=+1):
    """2링크 IK. 무릎은 진행방향으로 굽는다."""
    hx, hy = hip
    ax, ay = ankle
    dx, dy = ax - hx, ay - hy
    d = min(math.hypot(dx, dy), l1 + l2 - 1e-3)
    a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    h = math.sqrt(max(l1 * l1 - a * a, 0.0))
    mx, my = hx + a * dx / d, hy + a * dy / d
    px, py = -dy / d, dx / d
    if px * forward < 0:
        px, py = -px, -py
    return (mx + h * px, my + h * py)


def arm(sho, swing, amt):
    """측면 러닝의 팔. 상완은 몸통을 따라 내리고 전완만 앞뒤로. swing +1 앞 / -1 뒤."""
    sx, sy = sho
    if swing > 0:
        elb = (sx - 18 * amt, sy + UPPER_ARM * 0.92)
        wri = (elb[0] + FOREARM * (0.66 * amt + 0.10),
               elb[1] - FOREARM * (0.62 * amt + 0.05))
    else:
        elb = (sx - UPPER_ARM * (0.38 * amt + 0.05), sy + UPPER_ARM * 0.88)
        wri = (elb[0] - FOREARM * (0.44 * amt + 0.06),
               elb[1] + FOREARM * (0.50 * amt + 0.10))
    return elb, wri


def build(idx):
    ratio, phase = CYCLE[idx]
    stride = BODY_H * ratio
    half = stride / 2.0
    right_leads = idx < 3                      # 1~3 오른발 스텝, 4~6 왼발 스텝

    hip = (HIP_X, HIP_Y)
    neck = (HIP_X + LEAN * 0.62, NECK_Y)
    nose = (HIP_X + LEAN, NOSE_Y)

    if phase == "contact":
        # 앞발 착지(접지), 뒷발은 뒤로 뻗고 뒤꿈치 들림 -> 발끝만 접지
        plant = (HIP_X + half, GROUND_Y)
        swing = (HIP_X - half, GROUND_Y - int(0.02 * BODY_H))
    elif phase == "passing":
        # 지지발이 몸 아래. 스윙발은 무릎을 들어 앞으로 지나간다 (발이 들린다)
        plant = (HIP_X - int(0.03 * BODY_H), GROUND_Y)
        swing = (HIP_X + half + int(0.06 * BODY_H), GROUND_Y - int(0.17 * BODY_H))
    else:  # push
        # 지지발로 밀어내며 뒤에 남고, 스윙발이 앞으로 뻗어나간다
        plant = (HIP_X - half, GROUND_Y)
        swing = (HIP_X + half, GROUND_Y - int(0.09 * BODY_H))

    plant_knee = ik(hip, plant)
    if phase == "passing":
        swing_knee = (HIP_X + int(0.13 * BODY_H), HIP_Y + int(0.10 * BODY_H))  # 무릎 들림
    else:
        swing_knee = ik(hip, swing)

    if right_leads:
        r_ank, r_knee, l_ank, l_knee = plant, plant_knee, swing, swing_knee
        r_swing, l_swing = -1, +1              # 팔은 다리와 반대
    else:
        l_ank, l_knee, r_ank, r_knee = plant, plant_knee, swing, swing_knee
        l_swing, r_swing = -1, +1

    amt = {"contact": 1.0, "passing": 0.35, "push": 0.7}[phase]
    r_sho = (neck[0] + 1, SHO_Y)
    l_sho = (neck[0] - 1, SHO_Y)
    r_elb, r_wri = arm(r_sho, r_swing, amt)
    l_elb, l_wri = arm(l_sho, l_swing, amt)

    p = [None] * 18
    p[0], p[1] = nose, neck
    p[2], p[3], p[4] = r_sho, r_elb, r_wri
    p[5], p[6], p[7] = l_sho, l_elb, l_wri
    p[8], p[9], p[10] = (HIP_X + 1, HIP_Y), r_knee, r_ank
    p[11], p[12], p[13] = (HIP_X - 1, HIP_Y), l_knee, l_ank
    # 우향 측면 — 반대쪽 눈·귀는 보이지 않는다 (넣으면 3/4 뷰로 읽힌다)
    p[14] = (nose[0] + 5, nose[1] - 12)
    p[16] = (nose[0] - 24, nose[1] - 8)
    return p


def draw(pts):
    canvas = np.zeros((H_IMG, W, 3), dtype=np.uint8)
    for i, (a, b) in enumerate(LIMB_SEQ):
        pa, pb = pts[a], pts[b]
        if pa is None or pb is None:
            continue
        mx, my = (pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2
        ln = math.hypot(pa[0] - pb[0], pa[1] - pb[1])
        ang = math.degrees(math.atan2(pa[1] - pb[1], pa[0] - pb[0]))
        poly = cv2.ellipse2Poly((int(mx), int(my)), (int(ln / 2), STICK_W), int(ang), 0, 360, 1)
        layer = canvas.copy()
        cv2.fillConvexPoly(layer, poly, COLORS[i][::-1])
        canvas = cv2.addWeighted(canvas, 0.4, layer, 0.6, 0)
    for i, pt in enumerate(pts):
        if pt is not None:
            cv2.circle(canvas, (int(pt[0]), int(pt[1])), 5, COLORS[i][::-1], -1)
    return canvas


def main():
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sd_v2")
    os.makedirs(out, exist_ok=True)
    print(f"  몸높이 {BODY_H}px / 접지 y={GROUND_Y} 고정 / 전경사 {LEAN}px")
    for i in range(6):
        ratio, phase = CYCLE[i]
        pts = build(i)
        cv2.imwrite(os.path.join(out, f"pose_run_f{i + 1}.png"), draw(pts))
        feet = [pts[10][1], pts[13][1]]
        print(f"  f{i+1}  {phase:8s} 보폭 {ratio:.2f}({int(BODY_H*ratio)}px)  "
              f"접지발y {int(min(feet))}  머리y {int(pts[0][1])}")


if __name__ == "__main__":
    main()
