"""
컷아웃 리깅용 달리기 클립을 만든다. 단위는 전부 **몸높이 비율**.

── 왜 make_run_skeletons_v2 를 그대로 못 쓰는가 ──
그 스크립트는 ControlNet 에 먹일 '그림'을 만드는 게 목적이라 리깅 전제를 두 군데 어긴다.

  1) 뼈 길이가 프레임마다 다르다
     passing 국면의 무릎을 IK 없이 좌표로 박아버려서 허벅지가 0.28 -> 0.16 으로 줄어든다.
     그림으로는 티가 안 났지만(AI 가 알아서 그려줌) 뼈대는 뼈가 늘었다 줄었다 하면 끝이다.
  2) 팔이 스윙하지 않는다
     한 스텝(f1~f3) 내내 방향이 -1 고정이고 세기(amt)만 바뀐다.
     f3(push)에서 다리가 뒤로 갔으면 팔은 앞으로 와야 하는데 계속 뒤에 있다.

그래서 **검증된 값만 물려받고**(보폭 비율, 인체 비례, 전경사, 접지 규칙)
포즈는 여기서 고정 길이 IK 로 다시 푼다. 그러면 두 문제가 동시에 사라진다.

── 좌표 규약 (src/rig.js 와 반드시 일치) ──
  원점 = 발이 닿는 지면. +x 가 진행방향(우향), +y 가 아래.
  뼈는 자기 로컬에서 +x 를 향한다. 회전 0 = 오른쪽, 시계방향이 양수.
  저장 각도는 부모 대비 로컬이 아니라 **월드 각도**다 (계층을 바꿔도 안 깨진다).

사용법:
  <forge venv>\\python.exe make_run_clip.py     -> src/rig-clips.js 덮어씀
"""
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "..", "src", "rig-clips.js"))

# ── 인체 비례 (make_run_skeletons_v2 와 동일) ────────────────────────────
HIP_H = 0.48        # 지면에서 골반까지
TORSO = 0.36        # 골반 -> 목
HEAD = 0.16         # 목 -> 머리끝. 후드를 쓸 거라 원본(0.08)보다 길게 잡는다
THIGH = 0.28
SHIN = 0.28         # 합 0.56 > 골반높이 0.48 -> 다리는 항상 굽어 있다 (정상)
UPPER_ARM = 0.17
FOREARM = 0.16
SHOULDER_AT = 0.94  # 어깨는 목이 아니라 몸통 94% 지점에 붙는다

# ── 달리기 사이클 ────────────────────────────────────────────────────
# 원본은 국면 3개를 **이산 좌표**로 찍었다. 그 방식의 부작용을 실측으로 확인했다:
#   · 키프레임 사이에서 접지발이 지면 아래로 4px 파고든다
#     (각도를 선형 보간하는데 발 위치는 각도의 비선형 함수라 생기는 오차)
#   · 스윙 다리가 앞으로 확 나간 뒤 2프레임을 제자리에서 기다린다 (x 18→20→22→24)
# 그래서 발 궤적을 **연속 함수**로 정의하고 프레임을 촘촘히 뽑는다. 둘 다 사라진다.

STRIDE = 0.45       # 보폭(몸높이 비율). 원본 CONTACT 값 — 인체 범위 0.45~0.50
SWING_H = 0.17      # 스윙발 최고 높이. 원본 passing 의 발 들림과 같은 값
DUTY = 0.5          # 한 다리가 땅에 붙어 있는 시간 비율.
                    # 0.5 면 항상 한 발은 땅에 있다 — 원본 문서의 "뜨는 프레임 금지" 규칙
HIP_BOB = 0.022     # 골반은 중간지지에서 가장 낮다. 고정하면 로봇처럼 보인다
FRAMES = 12         # 6 프레임은 보간 오차가 컸다. 촘촘하게 뽑아 오차를 줄인다
FPS = 20            # 12프레임 / 20fps = 한 사이클 0.6초. 실제 달리기 케이던스에 가깝다

LEAN = 0.10         # 상체 전경사(머리가 골반보다 이만큼 앞)


def ankle_at(u):
    """다리 하나의 발목 위치. u 는 0~1 사이의 그 다리 고유 위상.

    u < DUTY   : 접지. 발은 지면에 붙은 채 **뒤로만** 흐른다 (미끄러지면 안 된다)
    u >= DUTY  : 스윙. 뒤에서 앞으로 호를 그리며 돌아온다
    """
    S = STRIDE / 2.0
    if u < DUTY:
        return (S - 2 * S * (u / DUTY), 0.0)
    v = (u - DUTY) / (1.0 - DUTY)
    # 코사인 이징 — 양 끝(발을 떼는 순간, 딛는 순간)이 부드럽다
    x = -S + S * (1.0 - math.cos(math.pi * v))
    y = -SWING_H * math.sin(math.pi * v)
    return (x, y)


def hip_dy_at(u):
    """골반 높이 보정. 한 스텝에 한 번, 즉 한 사이클에 두 번 내려간다."""
    return -HIP_BOB * (1.0 - math.cos(4 * math.pi * u)) / 2.0


def phase_name(u):
    if u < DUTY * 0.2:
        return "contact"
    if u < DUTY * 0.7:
        return "midstance"
    if u < DUTY:
        return "push"
    return "swing"


def ik(hip, ankle, l1=THIGH, l2=SHIN):
    """2링크 IK. 무릎은 진행방향(+x)으로 굽는다. 반환: 무릎 좌표."""
    hx, hy = hip
    ax, ay = ankle
    dx, dy = ax - hx, ay - hy
    d = math.hypot(dx, dy)
    if d > l1 + l2 - 1e-4:                      # 닿지 않으면 뻗은 자세로 클램프
        d = l1 + l2 - 1e-4
        ax, ay = hx + dx / math.hypot(dx, dy) * d, hy + dy / math.hypot(dx, dy) * d
        dx, dy = ax - hx, ay - hy
    a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    h = math.sqrt(max(l1 * l1 - a * a, 0.0))
    mx, my = hx + a * dx / d, hy + a * dy / d
    px, py = -dy / d, dx / d
    if px < 0:                                  # 무릎이 앞으로 나오도록 분기 선택
        px, py = -px, -py
    return (mx + h * px, my + h * py)


def ang(a, b):
    return math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))


def arm_angles(s):
    """팔 스윙. s=+1 완전히 앞, -1 완전히 뒤.

    측면 달리기의 팔은 팔꿈치를 굽힌 채 앞뒤로 흔든다. 상완/전완의 월드 각도를
    직접 주는 편이 IK 보다 통제가 쉽고 결과가 예측 가능하다.
      앞 : 상완 60도(앞아래)  전완 -45도(가슴쪽으로 감아올림)
      뒤 : 상완 120도(뒤아래) 전완 85도(엉덩이 옆으로 내려뜨림)

    두 번 고쳤다:
      · 전완 진폭 105 -> 스윙 중간에 팔뚝이 수평으로 쭉 뻗어 앞을 가리키는 꼴이 됐다
      · 팔꿈치 굽힘을 s 에 선형으로 주니 뒤로 갔을 때 굽힘이 0 이 돼 팔이 일자 막대가 됐다
    그래서 굽힘을 **항상 유지**한다 (앞 105도, 뒤 35도). 실제 러너도 팔을 펴지 않는다.
    """
    upper = 90.0 - 30.0 * s
    flex = -70.0 - 35.0 * s      # 음수 = 전완이 몸 앞쪽으로 감긴다
    return upper, upper + flex


def build(i):
    u_far = (i / FRAMES) % 1.0
    u_near = (u_far + 0.5) % 1.0                # 두 다리는 정확히 반 사이클 차이

    far_ank = ankle_at(u_far)
    near_ank = ankle_at(u_near)
    # 골반은 접지한 다리 기준으로 내려간다. 두 다리 몫을 합치면 스텝당 한 번이 된다
    hip_y = -(HIP_H + hip_dy_at(u_far) + hip_dy_at(u_near))
    hip = (0.0, hip_y)

    far_knee = ik(hip, far_ank)
    near_knee = ik(hip, near_ank)

    # 목은 앞으로 기울되 몸통 길이는 지켜야 한다. x 를 정하고 y 를 길이로 역산한다
    nx = LEAN * 0.62
    neck = (nx, hip_y - math.sqrt(max(TORSO ** 2 - nx ** 2, 0.01)))
    head_tip = (neck[0] + HEAD * 0.34, neck[1] - HEAD * 0.94)

    # 팔은 같은 쪽 다리와 정반대. far 다리가 앞(u=0, 착지)일 때 far 팔이 뒤(-1)
    s_far = -math.cos(2 * math.pi * u_far)
    fu, fl = arm_angles(s_far)
    nu, nl = arm_angles(-s_far)

    return {
        "root": [round(hip[0], 4), round(hip[1], 4)],
        "angles": {
            "torso": round(ang(hip, neck), 2),
            "head": round(ang(neck, head_tip), 2),
            "armF_up": round(fu, 2), "armF_lo": round(fl, 2),
            "armN_up": round(nu, 2), "armN_lo": round(nl, 2),
            "legF_thigh": round(ang(hip, far_knee), 2),
            "legF_shin": round(ang(far_knee, far_ank), 2),
            "legN_thigh": round(ang(hip, near_knee), 2),
            "legN_shin": round(ang(near_knee, near_ank), 2),
        },
        "phase": phase_name(u_far),
        # y 는 위가 음수라 '가장 낮은 발' = max. min 을 쓰면 스윙발을 보게 된다
        "_dbg": {"plantY": round(max(far_ank[1], near_ank[1]), 4),
                 "farX": round(far_ank[0], 3), "nearX": round(near_ank[0], 3)},
    }


# (이름, 부모, 길이, 부모의 몇 % 지점에 붙는가)
BONES = [
    ("torso", None, TORSO, 0),
    ("head", "torso", HEAD, 1.0),
    ("armF_up", "torso", UPPER_ARM, SHOULDER_AT),
    ("armF_lo", "armF_up", FOREARM, 1.0),
    ("legF_thigh", None, THIGH, 0),
    ("legF_shin", "legF_thigh", SHIN, 1.0),
    ("legN_thigh", None, THIGH, 0),
    ("legN_shin", "legN_thigh", SHIN, 1.0),
    ("armN_up", "torso", UPPER_ARM, SHOULDER_AT),
    ("armN_lo", "armN_up", FOREARM, 1.0),
]

# 뒤 -> 앞. 측면 뷰는 그리는 순서가 곧 원근이다
DRAW_ORDER = ["armF_up", "armF_lo", "legF_thigh", "legF_shin",
              "torso", "head",
              "legN_thigh", "legN_shin", "armN_up", "armN_lo"]


def main():
    frames = [build(i) for i in range(FRAMES)]
    L = {n: l for n, _p, l, _a in BONES}
    bones = []
    for n, p, l, a in BONES:
        # attach = 부모 관절에서 이 관절까지, **부모의 rest 좌표계** 기준.
        # 막대기는 +x 를 향해 그리므로 rest=0 이고, 사슬 뼈는 [부모길이*비율, 0] 이 된다
        bones.append({
            "name": n, "parent": p, "length": round(l, 4), "rest": 0,
            "attach": [round(L[p] * a, 4), 0] if p else [0, 0],
        })
    data = {
        "unit": 1,                       # 길이가 이미 몸높이 비율이라 배율 1
        "bones": bones,
        "drawOrder": DRAW_ORDER,
        "clips": {"run": {"fps": FPS, "loop": True, "frames": frames}},
    }
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("// 자동 생성 파일 — 직접 고치지 말 것.\n")
        fh.write("// tools/sprites/rig/make_run_clip.py 를 고치고 다시 실행한다.\n")
        fh.write("export const RIG = " + json.dumps(data, indent=2, ensure_ascii=False) + "\n")

    print(f"  뼈 {len(BONES)}개 / 프레임 {len(frames)}개 -> {OUT}")
    print("  프레임  국면      접지발y   지지발x   스윙발x   far팔   상체")
    for i, f in enumerate(frames):
        d = f["_dbg"]
        print(f"    f{i+1}   {f['phase']:8s} {d['plantY']:+.3f}   "
              f"{d['farX']:+.3f}   {d['nearX']:+.3f}   "
              f"{f['angles']['armF_up']:6.1f}°  {f['angles']['torso']:6.1f}°")
    print("  * 접지발y 는 0.000 이어야 한다 (0 이 아니면 발이 뜨거나 파묻힌다)")


if __name__ == "__main__":
    main()
