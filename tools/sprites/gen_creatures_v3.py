"""
몹 컨셉 시안 3차. 레퍼런스 교체에 맞춘 재설계.

2차와의 차이 — 레퍼런스가 완전히 달라졌다:
  2차 레퍼런스: 분홍/크림슨 바디호러, 눈 뭉치, 노출된 뼈
  3차 레퍼런스: 따뜻한 주황·적갈색 판타지 몬스터, 뿔·엄니, 갑옷·무기 착용

그래서 뒤집는다:
  - 'exposed bone' 제거 -> skeleton/bone 을 네거티브로 강하게 밀어낸다
    (2차에서 이 단어 하나 때문에 6종 중 4종이 그냥 해골로 나왔다)
  - 팔레트를 분홍/마젠타 -> 주황·적갈·황갈로
  - 갑옷·무기·천 조각을 '허용'한다 (2차에서는 네거티브로 막고 있었다)

세계관 이점: 플레이어가 자마젠타 발광이라 적을 따뜻한 주황 계열로 두면
전투 중 아군/적 색이 명확히 갈린다.

사용법:
    python gen_creatures_v3.py          # 전체
    python gen_creatures_v3.py 2 5      # 지정 번호
"""
import base64
import json
import os
import sys
import urllib.request

API = "http://127.0.0.1:7860"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "creatures_v3")
CHECKPOINT_HINT = "Juggernaut"

CREATURES = [
    ("imp",
     "small horned imp demon standing upright, big grinning fanged mouth, "
     "pointed ears, thin tail, leather loincloth, clawed hands",
     "잡몹 · 빠른 근접"),
    ("ogre",
     "huge fat ogre brute, thick curved tusks, small angry eyes, "
     "wooden club over the shoulder, leather armor straps, heavy belly",
     "탱커 · 강타"),
    ("hound",
     "four legged demon hound beast, two curved horns, long snout with fangs, "
     "spiked collar, muscular shoulders, whipping tail",
     "돌진 · 추격"),
    ("shaman",
     "hunched goblin shaman in a hooded robe, holding a gnarled staff, "
     "one hand raised with a small flame, bone charms, long crooked nose",
     "원거리 · 화염 투사"),
    ("winged",
     "winged demon with large bat wings spread, curved horns, "
     "holding a spiked mace, armored shoulder plate, muscular torso",
     "공중 · 급강하"),
    ("grub",
     "large armored grub larva creature crawling low, segmented chitin plates, "
     "round toothed mouth at the front, many tiny legs underneath",
     "다수 출현 · 느림"),
]

# 레퍼런스 화풍: 두툼한 붓질의 게임 몬스터 일러스트, 강한 림라이트, 검정 배경
STYLE = (
    "(stylized fantasy game monster concept art:1.3), painterly digital illustration, "
    "hand painted, thick bold shapes, strong rim lighting, "
    "(warm orange red brown palette:1.3), tan leather, aged metal, "
    "glowing yellow eyes, "
    "(pure solid black background:1.5), isolated on black, centered, "
    "game asset character design"
)

NEGATIVE = (
    # 2차의 실패 원인. 이걸 막지 않으면 전부 해골이 된다
    "(skeleton:1.6), (bones:1.5), (skull head:1.5), exposed ribcage, bare bone, "
    "(pink:1.4), (magenta:1.4), crimson flesh, body horror, "
    "(photorealistic:1.4), photo, 3d render, hyperrealistic, "
    "(grey background:1.4), gradient background, scenery, floor, ground shadow, "
    "(cropped:1.4), cut off, close-up portrait, bust, headshot, "
    "(multiple characters:1.4), group, crowd, "
    "text, watermark, signature, logo, frame, border, blurry"
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
            "prompt": f"(full body:1.35), single creature, {desc}, {STYLE}",
            "negative_prompt": NEGATIVE,
            "steps": 32, "sampler_name": "DPM++ 2M", "scheduler": "Karras",
            "cfg_scale": 6.5, "width": 1024, "height": 1024,
            "seed": 15000 + i * 313, "batch_size": 1,
        }
        print(f"  생성 중 {i+1}. {name} ({role}) ...", flush=True)
        r = post("/sdapi/v1/txt2img", payload)
        p = os.path.join(OUT, f"{i+1}_{name}.png")
        with open(p, "wb") as fh:
            fh.write(base64.b64decode(r["images"][0]))
        print(f"    -> {p}")


if __name__ == "__main__":
    main()
