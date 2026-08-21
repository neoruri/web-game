"""
잘라낸 파츠(parts_m3/)로부터 크리처 뼈대 정의 + 애니메이션 클립을 만든다.

── 핵심 아이디어: 쉬는 자세(rest)를 그림에서 뽑는다 ──
사람 캐릭터는 포즈를 0부터 만들어냈다. 크리처는 반대다.
**그림이 이미 하나의 완성된 포즈**이므로, 그 포즈를 rest 로 삼고
애니메이션은 rest 에서 몇 도 벗어나는지(offset)만 준다.
그러면 오프셋이 전부 0일 때 원본 그림과 픽셀 단위로 같아진다 — 절대 망가지지 않는 바닥이 생긴다.

── 왜 idle 과 cast 인가 ──
이 몹은 3/4 뷰에 불꽃을 든 캐스터다. 달리기가 아니라 제자리 호흡과 시전이 필요하다.
그리고 idle 은 각도 변화가 작아서 파츠 경계의 구멍이 드러나지 않는다 — 위험이 가장 낮다.

사용법:
    <forge venv>\\python.exe make_creature_rig.py   -> src/rig-creature.js
"""
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
PARTS = os.path.join(HERE, "parts_m3")
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "..", "src", "rig-creature.js"))

# 발이 닿는 지점. 여기가 rig 의 원점이 되어야 게임에 놓기 편하다
GROUND = (570, 1175)
UNIT = 1090             # 캐릭터 높이(뿔끝~발끝). 런타임 scale 이 이 값에 대한 배율이 된다

# (뼈, 부모, 시작관절, 방향을 정하는 끝점)
# 끝점은 rest 각도를 재기 위한 것. 자식이 있으면 자식 관절, 없으면 대표점을 쓴다
BONES = [
    ("body",    None,      "pelvis", "neck"),
    ("head",    "body",    "neck",   "headTop"),
    ("armR_up", "body",    "shoR",   "elbR"),
    ("armR_lo", "armR_up", "elbR",   "handR"),
    ("armL_up", "body",    "shoL",   "elbL"),
    ("armL_lo", "armL_up", "elbL",   "handL"),
    ("tail",    "body",    "tail0",  "tailTip"),

    # 역관절 다리 3마디. legL_thigh 는 **그림이 없는 변환 전용 뼈**다 —
    # 왼쪽 허벅지는 치마에 완전히 가려서 자를 그림 자체가 없다(cut_parts.py 참고).
    # 뼈만 두면 정강이가 허벅지 회전을 물려받아 제대로 흔들리고, 화면에는 치마 밑만 보인다.
    ("legR_thigh", "body",       "hipR",  "kneeR"),
    ("legR_shin",  "legR_thigh", "kneeR", "hockR"),
    ("legR_foot",  "legR_shin",  "hockR", "toeR"),
    ("legL_thigh", "body",       "hipL",  "kneeL"),
    ("legL_shin",  "legL_thigh", "kneeL", "hockL"),
    ("legL_foot",  "legL_shin",  "hockL", "toeL"),
]


def ang(a, b):
    return math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))


def rot(v, deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return (v[0] * c - v[1] * s, v[0] * s + v[1] * c)


# ── idle: 숨쉬기 ──────────────────────────────────────────────────────
# (진폭 도, 위상 라디안, 주파수 배수)
# 위상을 조금씩 어긋나게 주는 게 핵심이다. 다 같이 움직이면 기계처럼 보인다.
# 꼬리는 진폭이 크고 두 배 빠르다 — 꼬리는 원래 몸통보다 늦게, 크게 흔들린다
IDLE = {
    "body":    (0.8, 0.0, 1),
    "head":    (2.4, 0.55, 1),
    "armR_up": (1.8, 0.85, 1),
    "armR_lo": (3.2, 1.15, 1),
    "armL_up": (2.4, 0.65, 1),
    "armL_lo": (4.0, 0.95, 1),
    "tail":    (9.0, 0.30, 2),
}
IDLE_FRAMES, IDLE_FPS = 24, 12      # 24프레임 / 12fps = 한 호흡 2초
IDLE_RISE = 5.0                     # 몸통 상하 (원본 픽셀). 숨쉴 때 살짝 올라온다

# ── cast: 불꽃을 들어올려 시전 ────────────────────────────────────────
# (뼈, 최대 오프셋 도). 0 -> 최대 -> 0 을 이징으로 오간다
CAST = {
    "armR_up": -26, "armR_lo": -20, "head": -7,
    "body": 2.5, "armL_up": 8, "armL_lo": 10, "tail": -14,
}
CAST_FRAMES, CAST_FPS = 16, 20      # 0.8초

# ── walk: 걷기 ────────────────────────────────────────────────────────
# 다리는 **IK 로 푼다**. 회전 오프셋을 먼저 시도했다가 버렸다:
#   각 뼈를 사인파로 흔들면 발이 접지선 위로 35px(키의 9%) 떠올라
#   공중을 걷는 꼴이 됐다. 허벅지를 24° 돌리면 발끝은 480px×sin24° = 196px 움직이는데,
#   그게 전부 '위로' 갈 수도 있기 때문이다. 회전만으로는 발을 땅에 붙일 방법이 없다.
#
# 3/4 뷰라 IK 가 안 된다고 판단했었는데 그건 과한 결론이었다.
# 지면을 **화면상의 (거의) 수평선**으로 근사하면 그만이고, 2D 컷아웃 리그는 다 그렇게 한다.
# 다리마다 자기 발의 쉬는 위치에서 출발하므로 원근으로 높이가 달라도 상관없다.
STRIDE = 230.0       # 보폭(원본 px). 키 1090 의 21%
SWING_H = 75.0       # 스윙발 최고 높이
DUTY = 0.6           # 접지 비율. 걷기는 달리기보다 길다(양발 접지 구간이 있다)
STEP_DIR = (1.0, 0.10)   # 진행 방향. 3/4 뷰라 화면 아래로 살짝 기운다
FOOT_LIFT = -14.0    # 스윙 중 발끝 들기(도)

WALK_UPPER = {                    # 상체는 다리와 반대로, 작게
    "head":    (2.2, 0.4),
    "armL_up": (6.0, math.pi), "armL_lo": (8.0, math.pi + 0.5),
    "armR_up": (3.0, math.pi), "armR_lo": (3.0, math.pi + 0.4),   # 불꽃은 덜 흔든다
    "tail":    (7.0, 0.8),
    "body":    (1.2, 1.6),
}
WALK_BOB = 5.0                    # 골반 상하(원본 px). 한 사이클에 두 번
WALK_FRAMES, WALK_FPS = 16, 14    # 16f / 14fps = 한 사이클 1.14초


def ease(v):
    """0 -> 1 -> 0. 앞은 빠르게 들고 뒤는 천천히 내린다 (시전 동작의 리듬)."""
    return math.sin(math.pi * (v ** 0.7))


def ik2(hip, target, l1, l2):
    """2링크 IK. 무릎은 +x 쪽으로 굽는다 (이 크리처는 양쪽 다 그 방향이다).
    닿지 않는 목표는 뻗은 자세로 클램프한다 — 안 하면 sqrt 가 터진다."""
    hx, hy = hip
    dx, dy = target[0] - hx, target[1] - hy
    d = math.hypot(dx, dy)
    if d < 1e-6:
        return (hx + l1, hy)
    if d > l1 + l2 - 1e-4:
        d = l1 + l2 - 1e-4
    a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    h = math.sqrt(max(l1 * l1 - a * a, 0.0))
    ux, uy = dx / math.hypot(dx, dy), dy / math.hypot(dx, dy)
    mx, my = hx + a * ux, hy + a * uy
    px, py = -uy, ux
    if px < 0:
        px, py = -px, -py
    return (mx + h * px, my + h * py)


def toe_at(u, t0):
    """발끝의 목표 위치. u 는 그 다리 고유 위상(0~1).

    u < DUTY : 접지. 발은 땅에 붙은 채 **뒤로만** 흐른다 (미끄러지면 안 된다)
    u >= DUTY: 스윙. 뒤에서 앞으로 호를 그리며 돌아온다
    """
    n = math.hypot(*STEP_DIR)
    dx, dy = STEP_DIR[0] / n, STEP_DIR[1] / n
    if u < DUTY:
        s = STRIDE / 2 - STRIDE * (u / DUTY)
        return (t0[0] + s * dx, t0[1] + s * dy), 0.0
    v = (u - DUTY) / (1 - DUTY)
    s = -STRIDE / 2 + STRIDE * (1 - math.cos(math.pi * v)) / 2
    h = SWING_H * math.sin(math.pi * v)
    return (t0[0] + s * dx, t0[1] + s * dy - h), FOOT_LIFT * math.sin(math.pi * v)


def main():
    meta = json.load(open(os.path.join(PARTS, "parts.json"), encoding="utf-8"))
    J = {k: tuple(v) for k, v in meta["joints"].items()}

    rest, bones = {}, []
    for name, parent, j0, j1 in BONES:
        rest[name] = round(ang(J[j0], J[j1]), 2)
    for name, parent, j0, j1 in BONES:
        if parent is None:
            attach = [0, 0]
        else:
            pj = BONES[[b[0] for b in BONES].index(parent)][2]
            d = (J[j0][0] - J[pj][0], J[j0][1] - J[pj][1])
            # 부모의 rest 좌표계로 되돌린다. 런타임이 부모 월드각으로 다시 돌린다
            attach = [round(v, 2) for v in rot(d, -rest[parent])]
        bones.append({"name": name, "parent": parent,
                      "rest": rest[name], "attach": attach})

    root0 = [J["pelvis"][0] - GROUND[0], J["pelvis"][1] - GROUND[1]]

    # idle
    idle = []
    for i in range(IDLE_FRAMES):
        u = i / IDLE_FRAMES
        angles = {}
        for name, (amp, ph, fq) in IDLE.items():
            angles[name] = round(rest[name] + amp * math.sin(2 * math.pi * fq * u + ph), 2)
        idle.append({
            "root": [root0[0], round(root0[1] - IDLE_RISE * math.sin(2 * math.pi * u), 2)],
            "angles": angles,
        })

    # cast
    cast = []
    for i in range(CAST_FRAMES):
        e = ease(i / (CAST_FRAMES - 1))
        angles = {n: round(rest[n] + CAST.get(n, 0) * e, 2) for n in rest}
        cast.append({"root": [root0[0], round(root0[1] - 8 * e, 2)], "angles": angles})

    # walk — 다리는 IK, 상체는 회전 오프셋
    seg_len = {}
    for name, parent, j0, j1 in BONES:
        seg_len[name] = math.dist(J[j0], J[j1])

    walk = []
    for i in range(WALK_FRAMES):
        u = i / WALK_FRAMES
        angles = {n: rest[n] for n in rest}
        for n, (amp, ph) in WALK_UPPER.items():
            angles[n] = rest[n] + amp * math.cos(2 * math.pi * u + ph)

        # 몸통은 걸음마다 한 번씩 내려앉는다 -> 한 사이클에 두 번
        dy = -WALK_BOB * math.cos(4 * math.pi * u)
        pelvis = (J["pelvis"][0], J["pelvis"][1] + dy)
        body_off = angles["body"] - rest["body"]

        for side, hip_j, toe_j, ph in (("legR", "hipR", "toeR", 0.0),
                                       ("legL", "hipL", "toeL", 0.5)):
            # 엉덩이는 몸통에 붙어 있으므로 몸통의 회전·상하를 그대로 따라간다
            d = (J[hip_j][0] - J["pelvis"][0], J[hip_j][1] - J["pelvis"][1])
            d = rot(d, body_off)
            hip = (pelvis[0] + d[0], pelvis[1] + d[1])

            toe, lift = toe_at((u + ph) % 1.0, J[toe_j])
            fa = rest[side + "_foot"] + lift
            fl = seg_len[side + "_foot"]
            hock = (toe[0] - math.cos(math.radians(fa)) * fl,
                    toe[1] - math.sin(math.radians(fa)) * fl)
            knee = ik2(hip, hock, seg_len[side + "_thigh"], seg_len[side + "_shin"])

            angles[side + "_thigh"] = ang(hip, knee)
            angles[side + "_shin"] = ang(knee, hock)
            angles[side + "_foot"] = fa

        walk.append({
            "root": [round(pelvis[0] - GROUND[0], 2), round(pelvis[1] - GROUND[1], 2)],
            "angles": {n: round(v, 2) for n, v in angles.items()},
            "_dbg": {"toeR_y": round(toe_at(u, J["toeR"])[0][1], 1)},
        })

    data = {
        "unit": UNIT,
        "bones": bones,
        "drawOrder": meta["drawOrder"],
        "parts": [{"name": p["name"], "pivot": p["pivot"], "file": p["file"]}
                  for p in meta["parts"]],
        "clips": {
            "idle": {"fps": IDLE_FPS, "loop": True, "frames": idle},
            "walk": {"fps": WALK_FPS, "loop": True, "frames": walk},
            "cast": {"fps": CAST_FPS, "loop": False, "frames": cast},
        },
    }
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("// 자동 생성 파일 — 직접 고치지 말 것.\n")
        fh.write("// tools/sprites/rig/make_creature_rig.py 를 고치고 다시 실행한다.\n")
        fh.write("export const CREATURE = " + json.dumps(data, indent=2, ensure_ascii=False) + "\n")

    print(f"  뼈 {len(bones)}개 -> {OUT}")
    print("  뼈        부모       rest각    attach(부모 rest 기준)")
    for b in bones:
        print(f"    {b['name']:9s} {str(b['parent']):9s} {b['rest']:8.2f}°  {b['attach']}")
    print(f"  클립: idle {IDLE_FRAMES}f@{IDLE_FPS}fps(loop) / "
          f"walk {WALK_FRAMES}f@{WALK_FPS}fps(loop) / cast {CAST_FRAMES}f@{CAST_FPS}fps")
    noart = [b["name"] for b in bones
             if not any(p["name"] == b["name"] for p in meta["parts"])]
    if noart:
        print(f"  그림 없는 변환 전용 뼈: {', '.join(noart)}")
    print("  * 모든 오프셋이 0이면 원본 그림과 픽셀 단위로 같아진다")


if __name__ == "__main__":
    main()
