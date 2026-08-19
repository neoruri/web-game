"""
몹(크리처) 컨셉 시안 생성.

세계관 연결:
  플레이어가 후드 언데드 아처 + 자마젠타 소울파이어(#e05cff) 이므로,
  적도 같은 계열로 묶는다 — 크림슨/마젠타 살, 뼈 노출, 마젠타 발광 눈.
  레퍼런스(핑크 계열 바디호러)와 색조가 맞아떨어진다.

포즈 제어가 필요 없는 단발 이미지라 ControlNet 을 쓰지 않는다.
그래서 SD1.5 대신 화질이 더 좋은 SDXL(Juggernaut) 을 쓴다.

사용법:
    python gen_creatures.py            # 전체
    python gen_creatures.py 1 3        # 지정 번호만
"""
import base64
import json
import os
import sys
import urllib.request

API = "http://127.0.0.1:7860"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "creatures")
CHECKPOINT_HINT = "Juggernaut"

# 게임 역할까지 염두에 둔 실루엣 분화. 64px 로 줄여도 서로 구분돼야 한다
CREATURES = [
    ("crawler",  "low crawling quadruped creature, many small eyes on its back, "
                 "long thin clawed legs, wide toothy mouth, hunched",
                 "잡몹 · 빠른 근접"),
    ("spitter",  "upright thin creature, bulbous head with a single huge eye, "
                 "long dripping tendrils, narrow torso, small legs",
                 "원거리 · 투사체"),
    ("brute",    "massive bloated hulking creature, thick armored back plates, "
                 "small head sunk into shoulders, huge fists, short legs",
                 "탱커 · 느림"),
    ("skullbeast", "skeletal quadruped beast, exposed skull head, ribcage showing, "
                 "bone spikes along the spine, gaunt body, long tail",
                 "언데드 · 돌진"),
    ("tentacle", "floating orb creature, cluster of eyes, many long writhing tentacles "
                 "hanging below, no legs",
                 "공중 · 부유"),
    ("swarm",    "small insectoid creature, chitinous shell, four thin legs, "
                 "mandibles, compact body",
                 "다수 출현 · 약체"),
]

STYLE = (
    "dark fantasy creature concept art, character design, painterly digital painting, "
    "crimson magenta flesh, pale bone, (glowing magenta eyes:1.2), "
    "eldritch undead horror, detailed rendering, dramatic rim lighting, "
    "(full body:1.3), single creature centered, side three quarter view, "
    "(solid black background:1.4), concept sheet"
)

NEGATIVE = (
    "(multiple creatures:1.4), group, crowd, "
    "human, humanoid face, armor, weapon, sword, "
    "cropped, cut off, close-up portrait, "
    "text, watermark, signature, logo, ui, frame, border, "
    "bright colors, blue, green, cartoon, cute, chibi, "
    "photo, 3d render, blurry, low contrast"
)


def get(p):
    with urllib.request.urlopen(API + p, timeout=60) as r:
        return json.loads(r.read())


def post(p, d, t=1200):
    r = urllib.request.Request(API + p, data=json.dumps(d).encode(),
                               headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(r, timeout=t).read())


def pick(names, *musts):
    def norm(s):
        return s.lower().replace("-", "").replace("_", "").replace(" ", "")
    for n in names:
        if all(norm(m) in norm(n) for m in musts):
            return n
    return None


def main():
    args = sys.argv[1:]
    idxs = [int(a) - 1 for a in args] if args else list(range(len(CREATURES)))
    os.makedirs(OUT, exist_ok=True)

    titles = [m["title"] for m in get("/sdapi/v1/sd-models")]
    want = pick(titles, CHECKPOINT_HINT)
    if not want:
        raise SystemExit(f"{CHECKPOINT_HINT} 체크포인트를 못 찾음: {titles}")
    if get("/sdapi/v1/options").get("sd_model_checkpoint") != want:
        print(f"  체크포인트 전환 -> {want}", flush=True)
        post("/sdapi/v1/options", {"sd_model_checkpoint": want}, 900)

    for i in idxs:
        name, desc, role = CREATURES[i]
        payload = {
            "prompt": f"{desc}, {STYLE}",
            "negative_prompt": NEGATIVE,
            "steps": 30, "sampler_name": "DPM++ 2M", "scheduler": "Karras",
            "cfg_scale": 6, "width": 1024, "height": 1024,
            "seed": 4000 + i * 137, "batch_size": 1,
        }
        print(f"  생성 중 {i+1}. {name} ({role}) ...", flush=True)
        r = post("/sdapi/v1/txt2img", payload)
        p = os.path.join(OUT, f"{i+1}_{name}.png")
        with open(p, "wb") as fh:
            fh.write(base64.b64decode(r["images"][0]))
        print(f"    -> {p}")


if __name__ == "__main__":
    main()
