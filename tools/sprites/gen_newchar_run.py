"""
새 캐릭터로 run 사이클을 만드는 실험.

기존 캐릭터(idle.png) 재현이라는 제약을 빼면 난이도가 크게 내려간다:
  - img2img 로 init 에 묶일 필요가 없다 -> txt2img + OpenPose (포즈 제어는 검증됨)
  - 일관성은 seed 고정으로 확보한다
  - 다리를 덮는 발목길이 망토를 처음부터 피한다 (SD_run_생성절차 §7② 가 지적한 구조적 원인)

스켈레톤은 tools/sprites/sd/pose_run_f{N}.png 를 그대로 쓴다.

사용법:
    python gen_newchar_run.py 1 3 5      지정 프레임
    python gen_newchar_run.py all        8장
"""
import base64
import json
import os
import sys
import urllib.request

API = "http://127.0.0.1:7860"
HERE = os.path.dirname(os.path.abspath(__file__))
SD_DIR = os.path.join(HERE, "sd")
OUT_DIR = os.path.join(HERE, "newchar")

CHECKPOINT_HINT = "DreamShaper_8"
SEED = 77042                  # ★ 8프레임 전부 동일 = 일관성의 유일한 장치

# 설계 원칙 — 53×64 로 표시된다는 것에서 역산한다 (실측 비교로 확인한 것)
#   ① 얼굴은 후드 그림자에 감춘다. 성별을 그리지 않으므로 체크포인트의 인물 편향을 우회한다
#   ② 어두운 덩어리 하나 + 밝은 액센트 하나. idle.png 가 64px 에서 읽히는 이유가 이 구조다
#   ③ 다리를 덮는 발목길이 망토를 쓰지 않는다 (보폭이 안 보이는 구조적 원인)
#   ④ 배경은 캐릭터와 명도 차가 크게. 중간 명도끼리 겹치면 64px 에서 뭉갠다
# refs/ref_runcycle.gif 실측에서 역산한 색 구조.
# 13색으로 양자화해도 형태가 남으려면 명도 층이 최소 3단으로 벌어져 있어야 한다:
#   배경(밝음) > 망토(중간) > 팔다리(어두운 회색) > 부츠(가장 어두움) + 눈(밝은 액센트)
# 이전 시도는 캐릭터가 전부 검정이라 축소하면 덩어리 하나로 뭉갰다.
POSITIVE = (
    "(side view:1.45), profile, facing right, (full body:1.4), running, "
    "hooded figure, (face hidden in hood:1.3), only two glowing eyes visible, "
    "(medium brown tan hooded cloak:1.35), large simple cloak shape, "
    "(grey blue arms and legs:1.3), (legs clearly visible below the cloak:1.3), "
    "dark brown boots, (bright orange glowing eyes:1.3), "
    "(flat color blocks:1.35), (three value levels:1.2), no gradient, "
    "bold simple shapes, limited palette, chunky pixel art style, "
    "2d game sprite, readable silhouette, "
    "(plain flat solid light beige background:1.45), empty background, nothing behind"
)

NEGATIVE = (
    # 3D 처럼 보이게 만드는 것들. 이게 지난 시도의 직접 원인이었다
    "(shiny metal:1.4), (specular highlight:1.4), volumetric lighting, "
    "(detailed rendering:1.3), 3d render, photorealistic, glossy, reflective armor, "
    "soft gradient, airbrush, "
    # 실루엣을 무너뜨리는 것들
    "(visible face:1.4), skin, portrait, long flowing hair, cyan, teal, "
    "low contrast, washed out, (all black silhouette:1.3), (monochrome:1.2), "
    "(long cloak:1.4), floor length cape, robe covering legs, "
    "(cropped:1.4), cut off, feet out of frame, close-up, "
    "front view, three quarter view, facing viewer, back view, "
    "(jumping:1.3), floating, mid air, "
    "ground shadow, floor, horizon line, vignette, background circle, "
    # 발광이 배경으로 번져 얼룩이 됐다. 크로마키가 안 되므로 반드시 막는다
    "(glow on background:1.45), (background splash:1.4), paint splatter, "
    "cyan background, teal background, textured background, scenery, smoke behind, "
    "standing still, idle pose, T-pose, "
    "text, watermark, multiple characters, extra limbs, blurry"
)


def get(path):
    with urllib.request.urlopen(API + path, timeout=60) as r:
        return json.loads(r.read())


def post(path, payload, timeout=900):
    req = urllib.request.Request(
        API + path, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def b64(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()


def pick(names, *musts, avoid=()):
    def norm(s):
        return s.lower().replace("-", "").replace("_", "").replace(" ", "")
    for n in names:
        low = norm(n)
        if all(norm(m) in low for m in musts) and not any(norm(a) in low for a in avoid):
            return n
    return None


def main():
    args = sys.argv[1:] or ["3"]

    # --anchor N : 프레임 N 을 기준 이미지로 삼아 나머지를 img2img 로 뽑는다.
    # txt2img 만 쓰면 스켈레톤이 바뀔 때 의상·머리·소품이 같이 흔들린다(실측).
    # 기준이 '서 있는' 그림이면 포즈 격차가 커서 denoising 을 올려야 하고 그러면 캐릭터가 깨지는데,
    # 기준이 이미 '달리는' 그림이면 격차가 작아 낮은 denoising 으로 충분하다.
    anchor = None
    if "--anchor" in args:
        i = args.index("--anchor")
        anchor = int(args[i + 1])
        del args[i:i + 2]
    dn = 0.45
    if "--dn" in args:
        i = args.index("--dn")
        dn = float(args[i + 1])
        del args[i:i + 2]
    use_ipa = "--ipa" in args      # 기준 프레임을 init 이 아니라 IP-Adapter 로 쓴다
    if use_ipa:
        args.remove("--ipa")
    # anchor 모드에서는 init 이 포즈까지 붙잡는다. 포즈만 떼어내려면 ControlNet 을 더 세게 건다
    cw = 1.15
    if "--cw" in args:
        i = args.index("--cw")
        cw = float(args[i + 1])
        del args[i:i + 2]

    # --lora W : 픽셀아트 LoRA 를 건다. Forge 에서는 프롬프트에 <lora:이름:가중치> 로 넣는다.
    # 트리거 워드 "pixel art, PixArFK" 를 함께 넣어야 발동한다
    lora_w = 0.0
    if "--lora" in args:
        i = args.index("--lora")
        lora_w = float(args[i + 1]) if i + 1 < len(args) and not args[i + 1].isalpha() else 0.9
        del args[i:i + 2]

    frames = list(range(1, 9)) if args == ["all"] else [int(a) for a in args]
    os.makedirs(OUT_DIR, exist_ok=True)

    titles = [m["title"] for m in get("/sdapi/v1/sd-models")]
    want = pick(titles, CHECKPOINT_HINT)
    if get("/sdapi/v1/options").get("sd_model_checkpoint") != want:
        post("/sdapi/v1/options", {"sd_model_checkpoint": want}, timeout=600)

    cn = get("/controlnet/model_list")
    models = cn.get("model_list", cn) if isinstance(cn, dict) else cn
    md = get("/controlnet/module_list")
    modules = md.get("module_list", md) if isinstance(md, dict) else md
    pose_model = pick(models, "openpose")
    none_mod = pick(modules, "none") or "None"
    print(f"  {want} / {pose_model} / module={none_mod} / seed={SEED}")

    for f in frames:
        pose_path = os.path.join(SD_DIR, f"pose_run_f{f}.png")
        prompt = POSITIVE
        if lora_w > 0:
            prompt = (f"pixel art, PixArFK, {POSITIVE}, "
                      f"<lora:PixelArtRedmond15V:{lora_w}>")
        payload = {
            "prompt": prompt,
            "negative_prompt": NEGATIVE,
            "steps": 28,
            "sampler_name": "DPM++ 2M",
            "scheduler": "Karras",
            "cfg_scale": 7,
            "width": 512, "height": 768,
            "seed": SEED, "batch_size": 1,
            "alwayson_scripts": {"controlnet": {"args": [{
                "enabled": True,
                "module": none_mod,        # ★ 대문자 None. 소문자면 조용히 무시된다
                "model": pose_model,
                "weight": cw,
                "image": b64(pose_path),
                "resize_mode": "Just Resize",
                "control_mode": "ControlNet is more important",
                "guidance_start": 0.0, "guidance_end": 0.9,
            }]}},
        }
        endpoint = "/sdapi/v1/txt2img"
        if anchor and f != anchor:
            anchor_path = os.path.join(OUT_DIR, f"run_f{anchor}.png")
            if os.path.exists(anchor_path):
                if use_ipa:
                    # txt2img 를 유지한 채 기준 프레임의 '외형만' 주입한다.
                    # img2img 로 넣으면 init 이 포즈까지 붙잡아 전 프레임이 같은 자세가 된다(실측).
                    ipa_model = pick(models, "ip-adapter", "sd15", avoid=("xl", "plus", "face"))
                    ipa_mod = pick(modules, "ipadapter", "clip", avoid=("face", "insight", "bigg"))
                    if ipa_model and ipa_mod:
                        payload["alwayson_scripts"]["controlnet"]["args"].append({
                            "enabled": True, "module": ipa_mod, "model": ipa_model,
                            "weight": 0.75, "image": b64(anchor_path),
                            "resize_mode": "Just Resize", "control_mode": "Balanced",
                            "guidance_start": 0.25, "guidance_end": 1.0,
                        })
                else:
                    payload["init_images"] = [b64(anchor_path)]
                    payload["denoising_strength"] = dn
                    payload["resize_mode"] = 0
                    endpoint = "/sdapi/v1/img2img"
        print(f"  생성 중 f{f} ... ({endpoint.split('/')[-1]})", flush=True)
        r = post(endpoint, payload)
        out = os.path.join(OUT_DIR, f"run_f{f}.png")
        with open(out, "wb") as fh:
            fh.write(base64.b64decode(r["images"][0]))
        print(f"    -> {out}")

    # ★ 게임 표시 크기(53×64) 축소본을 항상 같이 만든다.
    # 512×768 로만 보면 '확대하면 예쁜 일러스트'를 만들게 된다. 진짜 검수는 이쪽이다
    make_gamesize_check(frames)


def make_gamesize_check(frames):
    try:
        from PIL import Image
    except ImportError:
        return
    cells = []
    for f in frames:
        p = os.path.join(OUT_DIR, f"run_f{f}.png")
        if os.path.exists(p):
            im = Image.open(p).convert("RGB")
            small = im.resize((53, 64), Image.LANCZOS)      # 실제 표시 크기
            cells.append((f, im.resize((205, 308)), small.resize((205, 248), Image.NEAREST)))
    if not cells:
        return
    W = 205 * len(cells)
    canvas = Image.new("RGB", (W, 308 + 248 + 4), (20, 20, 20))
    for i, (f, big, small) in enumerate(cells):
        canvas.paste(big, (i * 205, 0))
        canvas.paste(small, (i * 205, 312))
    out = os.path.join(OUT_DIR, "_check.png")
    canvas.save(out)
    print(f"  검수용(위=원본 / 아래=게임크기 53x64): {out}")


if __name__ == "__main__":
    main()
