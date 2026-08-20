"""
몹 컨셉 시안 4차. 체크포인트를 회화풍 모델로 교체.

3차까지의 결론:
  화풍은 프롬프트가 아니라 체크포인트가 결정한다. 실측으로 확인했다.
    Juggernaut XL  -> 아무리 밀어도 3D 렌더풍. 사실적 사진 모델이라 한계
    DreamShaper 8  -> 애니풍 여성 캐릭터로 이탈 (인물 사전분포)
  그래서 DreamShaperXL Lightning 으로 바꾼다. 판타지 일러스트 계열이다.

⚠️ Lightning 계열은 일반 모델과 파라미터가 다르다:
    steps 6~10 (28 넣으면 타버린다)
    CFG 1.5~2.5 (7 넣으면 색이 튀고 형태가 깨진다)
    sampler DPM++ SDE Karras 권장

배경은 프롬프트로 잡지 않는다. 3차에서 확인했듯 SAM 후처리가 확실하다.
(sam_black.py 로 별도 처리)

사용법:
    python gen_creatures_v4.py          # 전체
    python gen_creatures_v4.py 2 5      # 지정 번호
"""
import base64
import json
import os
import sys
import urllib.request

API = "http://127.0.0.1:7860"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "creatures_v4")
CHECKPOINT_HINT = "DreamShaperXL"

CREATURES = [
    ("imp",
     "small horned imp demon, dynamic pose leaning forward, big fanged grin, "
     "pointed ears, thin tail, torn leather loincloth, clawed hands",
     "잡몹 · 빠른 근접"),
    ("ogre",
     "huge heavy ogre brute, thick curved tusks, small eyes, "
     "wooden club resting on the shoulder, leather straps and belt, sagging belly",
     "탱커 · 강타"),
    ("hound",
     "four legged demon hound, two curved horns, long fanged snout, "
     "spiked collar, lean muscular body, low stalking pose",
     "돌진 · 추격"),
    ("shaman",
     "hunched goblin shaman in a ragged hooded robe, gnarled wooden staff, "
     "small flame in the raised hand, bone charms hanging, long crooked nose",
     "원거리 · 화염"),
    ("winged",
     "winged demon warrior, large bat wings spread wide, curved horns, "
     "spiked mace in hand, pauldron on one shoulder, standing on the ground",
     "공중 · 급강하"),
    ("grub",
     "large armored grub creature crawling low to the ground, "
     "segmented chitin plates, round toothed maw at the front, stubby legs",
     "다수 출현 · 느림"),
]

# 레퍼런스 화풍: 손으로 칠한 게임 몬스터 일러스트, 차분한 벽돌·녹슨 색, 강한 림라이트
STYLE = (
    "hand painted fantasy game monster concept art, painterly illustration, "
    "visible brush strokes, bold shapes, "
    "muted brick red rust burnt sienna palette, tan leather, aged metal, "
    "warm rim lighting, "
    # 'dark background' 라고만 하면 모델이 성벽·바닥을 그려버린다.
    # 배경을 '없는 것'으로 명시해야 SAM 분할도 쉬워진다
    "(plain solid black background:1.4), isolated on black, no scenery, "
    "full body, single creature, centered, game asset design"
)

NEGATIVE = (
    # 2차에서 6종 중 4종이 해골로 나왔다. 반드시 막는다
    "skeleton, bones, skull head, exposed ribcage, "
    "pink, magenta, neon, oversaturated, "
    "3d render, glossy, plastic, figurine, toy, photorealistic, photo, "
    "anime, manga, cute girl, female, "
    "cropped, cut off, close-up portrait, bust, "
    # 배경을 그리게 만드는 것들
    "(background scenery:1.4), wall, bricks, castle, ruins, architecture, "
    "cobblestone, floor, ground, environment, landscape, "
    "multiple characters, group, text, watermark, signature, blurry"
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
        raise SystemExit(f"{CHECKPOINT_HINT} 를 못 찾음. 설치된 것: {titles}")
    if get("/sdapi/v1/options").get("sd_model_checkpoint") != want:
        print(f"  체크포인트 전환 -> {want}", flush=True)
        post("/sdapi/v1/options", {"sd_model_checkpoint": want}, 900)

    for i in idxs:
        name, desc, role = CREATURES[i]
        payload = {
            "prompt": f"{desc}, {STYLE}",
            "negative_prompt": NEGATIVE,
            # ★ Lightning 전용값. 일반 모델 설정(steps 28 / CFG 7)을 쓰면 결과가 망가진다
            "steps": 8,
            "sampler_name": "DPM++ SDE",
            "scheduler": "Karras",
            "cfg_scale": 2.0,
            "width": 1024, "height": 1024,
            "seed": 22000 + i * 419, "batch_size": 1,
        }
        print(f"  생성 중 {i+1}. {name} ({role}) ...", flush=True)
        r = post("/sdapi/v1/txt2img", payload)
        p = os.path.join(OUT, f"{i+1}_{name}.png")
        with open(p, "wb") as fh:
            fh.write(base64.b64decode(r["images"][0]))
        print(f"    -> {p}")


if __name__ == "__main__":
    main()
