"""
몹 컨셉 시안 2차. 1차(gen_creatures.py)와 다른 디자인 + 화풍 교정.

1차 문제:
  - 결과가 사진/3D 렌더에 가까웠다. 레퍼런스는 납작하게 칠한 일러스트다
  - 배경이 회색 그라데이션으로 나온 것들이 있었다 (레퍼런스는 순수 검정)
  - 흉상으로 잘린 것이 있었다

교정:
  - photorealistic 계열을 네거티브로 강하게 밀어내고 'painted illustration' 을 앞에 둔다
  - 검정 배경 가중치를 올린다
  - full body 를 프롬프트 앞쪽에 배치

디자인은 레퍼런스의 바디호러 어휘(눈 뭉치, 노출된 뇌·뼈, 촉수, 이빨)를 쓰되
게임에서 실루엣이 겹치지 않도록 형태를 분화했다.

사용법:
    python gen_creatures_v2.py          # 전체
    python gen_creatures_v2.py 2 5      # 지정 번호
"""
import base64
import json
import os
import sys
import urllib.request

API = "http://127.0.0.1:7860"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "creatures_v2")
CHECKPOINT_HINT = "Juggernaut"

CREATURES = [
    ("eyecluster",
     "squat round creature made of a cluster of many bulging pale eyes, "
     "no visible head, two short stubby legs, wide lipless grin underneath",
     "잡몹 · 느린 접근"),
    ("maw",
     "creature whose entire body is a huge vertical mouth full of long teeth, "
     "thin ribbed body, two small arms at the sides, no eyes",
     "함정 · 근접 폭발"),
    ("brainhost",
     "gaunt hunched creature with an exposed swollen brain instead of a skull, "
     "thin long arms reaching the ground, narrow ribcage, spindly legs",
     "주술사 · 버프/소환"),
    ("handspider",
     "creature standing on many long finger like legs, small round body in the center, "
     "ring of small eyes around the body, no head",
     "빠른 · 측면 기습"),
    ("wormcoil",
     "thick coiled worm creature, circular mouth ringed with teeth, "
     "segmented body, no limbs, raised front section",
     "지중 · 돌출 공격"),
    ("twinhead",
     "bulky two headed creature, one head a bare skull the other a fleshy jaw, "
     "asymmetric shoulders, one huge arm one small arm",
     "정예 · 2페이즈"),
]

# 레퍼런스 화풍: 납작하게 칠한 일러스트, 크림색 눈알, 순수 검정 배경
STYLE = (
    "(painted creature illustration:1.3), stylized concept art, "
    "bold simple shapes, flat dramatic lighting, limited palette, "
    "crimson pink flesh, (pale cream bulging eyes:1.2), exposed bone, "
    "dark fantasy body horror, "
    "(pure solid black background:1.5), isolated on black, centered"
)

NEGATIVE = (
    "(photorealistic:1.5), (photo:1.4), (3d render:1.4), hyperrealistic, "
    "realistic skin texture, subsurface scattering, studio photography, "
    "(grey background:1.4), gradient background, floor, shadow on ground, scenery, "
    "(cropped:1.4), cut off, close-up portrait, bust, headshot, "
    "(multiple creatures:1.4), group, crowd, "
    "human, armor, weapon, clothing, "
    "text, watermark, signature, logo, frame, border, "
    "blue, green, cute, chibi, cartoon mascot, blurry"
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
        raise SystemExit(f"{CHECKPOINT_HINT} 를 못 찾음: {titles}")
    if get("/sdapi/v1/options").get("sd_model_checkpoint") != want:
        print(f"  체크포인트 전환 -> {want}", flush=True)
        post("/sdapi/v1/options", {"sd_model_checkpoint": want}, 900)

    for i in idxs:
        name, desc, role = CREATURES[i]
        payload = {
            # full body 를 맨 앞에 둔다. 뒤로 밀면 흉상으로 잘린다
            "prompt": f"(full body creature:1.35), {desc}, {STYLE}",
            "negative_prompt": NEGATIVE,
            "steps": 32, "sampler_name": "DPM++ 2M", "scheduler": "Karras",
            "cfg_scale": 6.5, "width": 1024, "height": 1024,
            "seed": 8800 + i * 211, "batch_size": 1,
        }
        print(f"  생성 중 {i+1}. {name} ({role}) ...", flush=True)
        r = post("/sdapi/v1/txt2img", payload)
        p = os.path.join(OUT, f"{i+1}_{name}.png")
        with open(p, "wb") as fh:
            fh.write(base64.b64decode(r["images"][0]))
        print(f"    -> {p}")


if __name__ == "__main__":
    main()
