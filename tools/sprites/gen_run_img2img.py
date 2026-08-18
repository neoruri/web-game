"""
run 8프레임 생성 — img2img 방식.

docs/SD_run_생성절차.md 를 그대로 구현한 것이다.
핵심(§1): idle.png 가 캐릭터·화풍·초록배경을 이미 갖고 있으므로 그것을 초기 이미지로 넣고
ControlNet OpenPose 로 **포즈만** 바꾼다. 모델이 화풍을 발명하지 않게 한다.

    init image = sd/init_idle.png
    ControlNet = sd/pose_run_f{N}.png   (Preprocessor 반드시 none)
    denoising  = 0.52  (0.45~0.60 밖으로 나가면 깨진다)

사용법:
    python gen_run_img2img.py            # 프레임 3 한 장 (테스트)
    python gen_run_img2img.py all        # 8장 전부
    python gen_run_img2img.py all --ref  # reference_only Unit 켜기 (캐릭터가 흔들릴 때)
    python gen_run_img2img.py 3 --dn 0.6 # denoising 조정
"""
import base64
import json
import os
import sys
import urllib.request

API = "http://127.0.0.1:7860"
HERE = os.path.dirname(os.path.abspath(__file__))
SD_DIR = os.path.join(HERE, "sd")
OUT_DIR = os.path.join(HERE, "player_strips")
INIT_IMG = os.path.join(SD_DIR, "init_idle.png")

CHECKPOINT_HINT = "DreamShaper_8"
SEED = 20260814          # ★ 8프레임 전부 동일. 랜덤이면 프레임마다 다른 사람이 나온다
DENOISE = 0.52           # §1: 0.45~0.60 사이

POSITIVE = (
    "hooded undead archer, side view facing right, running, "
    "long tattered dark grey-green cloak, quiver of arrows on back, "
    "bow held lowered in one hand, "
    "glowing violet magenta soul fire on hand and eyes, glowing magenta cloak hem, "
    "dark grey-green armor, painterly game art, flat green background"
)

# ❗ skeleton/bones/skull/female/skirt/scythe 는 실제로 나왔던 것들이다. 반드시 유지 (§3)
NEGATIVE = (
    # denoising 을 올리면 초록 배경이 피부로 번져 '초록 엘프 여성'이 나온다. 실측된 실패다
    "(green skin:1.6), (green face:1.5), (green legs:1.5), elf, orc, "
    "(female:1.4), (bare legs:1.4), (bare thighs:1.4), thigh high socks, "
    "skeleton, bones, skull, breasts, skirt, dress, high heels, "
    "scythe, staff, sword, spear, wings, bat wings, "
    "purple cloak, purple robe, bright purple, saturated purple, "
    "standing still, idle, T-pose, front view, back view, "
    "ground shadow, floor, horizon line, ground line, "
    "smoke, mist, aura, glow ring, rim light, outline, "
    "text, watermark, signature, multiple characters, extra limbs"
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
    """설치된 실제 이름을 쓴다. 추측한 이름은 조용히 무시된다."""
    def norm(s):
        return s.lower().replace("-", "").replace("_", "").replace(" ", "")
    for n in names:
        low = norm(n)
        if all(norm(m) in low for m in musts) and not any(norm(a) in low for a in avoid):
            return n
    return None


def ensure_checkpoint():
    titles = [m["title"] for m in get("/sdapi/v1/sd-models")]
    want = pick(titles, CHECKPOINT_HINT)
    if not want:
        raise SystemExit(f"체크포인트를 못 찾음: {titles}")
    if get("/sdapi/v1/options").get("sd_model_checkpoint") != want:
        print(f"  체크포인트 전환 -> {want}")
        post("/sdapi/v1/options", {"sd_model_checkpoint": want}, timeout=600)
    return want


def resolve():
    cn = get("/controlnet/model_list")
    models = cn.get("model_list", cn) if isinstance(cn, dict) else cn
    md = get("/controlnet/module_list")
    modules = md.get("module_list", md) if isinstance(md, dict) else md
    pose_model = pick(models, "openpose")
    none_mod = pick(modules, "none") or "None"
    ref_mod = pick(modules, "reference", "only")
    return pose_model, none_mod, ref_mod


def main():
    args = [a for a in sys.argv[1:]]
    use_ref = "--ref" in args
    if "--ref" in args:
        args.remove("--ref")
    dn = DENOISE
    if "--dn" in args:
        i = args.index("--dn")
        dn = float(args[i + 1])
        del args[i:i + 2]
    cw = 1.0                      # ControlNet Weight. 포즈가 안 바뀌면 1.2 까지 (§6)
    if "--cw" in args:
        i = args.index("--cw")
        cw = float(args[i + 1])
        del args[i:i + 2]
    args = args or ["3"]
    frames = list(range(1, 9)) if args == ["all"] else [int(a) for a in args]

    os.makedirs(OUT_DIR, exist_ok=True)
    ensure_checkpoint()
    pose_model, none_mod, ref_mod = resolve()
    print(f"  OpenPose model : {pose_model}")
    print(f"  전처리 module  : {none_mod}   (★ 스켈레톤 재추출 방지)")
    print(f"  denoising      : {dn}   seed: {SEED}   reference_only: {use_ref}")
    if not pose_model:
        raise SystemExit("OpenPose 모델이 없다")

    init_b64 = b64(INIT_IMG)
    for f in frames:
        pose_path = os.path.join(SD_DIR, f"pose_run_f{f}.png")
        if not os.path.exists(pose_path):
            print(f"  ! 스켈레톤 없음: {pose_path}")
            continue

        units = [{
            "enabled": True,
            "module": none_mod,          # ★ none. openpose 로 두면 스켈레톤에서 또 추출한다
            "model": pose_model,
            "weight": cw,
            "image": b64(pose_path),
            "resize_mode": "Just Resize",
            "control_mode": "ControlNet is more important",
            "guidance_start": 0.0,
            "guidance_end": 0.85,
        }]
        if use_ref and ref_mod:
            units.append({
                "enabled": True,
                "module": ref_mod,       # reference_only 는 별도 모델이 필요 없다
                "model": "None",
                "weight": 0.55,
                "image": init_b64,
                "threshold_a": 0.6,      # Style Fidelity
                "resize_mode": "Just Resize",
                "control_mode": "Balanced",
                "guidance_start": 0.0,
                "guidance_end": 1.0,
            })

        payload = {
            "init_images": [init_b64],
            "denoising_strength": dn,
            "resize_mode": 0,            # Just resize
            "prompt": POSITIVE,
            "negative_prompt": NEGATIVE,
            "steps": 28,
            "sampler_name": "DPM++ 2M",
            "scheduler": "Karras",
            "cfg_scale": 6.5,
            "width": 512,
            "height": 768,
            "seed": SEED,
            "batch_size": 1,
            "alwayson_scripts": {"controlnet": {"args": units}},
        }
        print(f"  생성 중 f{f} ...", flush=True)
        r = post("/sdapi/v1/img2img", payload)
        out = os.path.join(OUT_DIR, f"run_f{f}.png")
        with open(out, "wb") as fh:
            fh.write(base64.b64decode(r["images"][0]))
        print(f"    -> {out}")


if __name__ == "__main__":
    main()
