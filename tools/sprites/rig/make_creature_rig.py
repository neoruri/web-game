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


def ease(v):
    """0 -> 1 -> 0. 앞은 빠르게 들고 뒤는 천천히 내린다 (시전 동작의 리듬)."""
    return math.sin(math.pi * (v ** 0.7))


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

    data = {
        "unit": UNIT,
        "bones": bones,
        "drawOrder": meta["drawOrder"],
        "parts": [{"name": p["name"], "pivot": p["pivot"], "file": p["file"]}
                  for p in meta["parts"]],
        "clips": {
            "idle": {"fps": IDLE_FPS, "loop": True, "frames": idle},
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
    print(f"  클립: idle {IDLE_FRAMES}f@{IDLE_FPS}fps(loop) / cast {CAST_FRAMES}f@{CAST_FPS}fps")
    print("  * 모든 오프셋이 0이면 원본 그림과 픽셀 단위로 같아진다")


if __name__ == "__main__":
    main()
