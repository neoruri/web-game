"""
Forge API 로 run 사이클 프레임을 생성한다.

docs/SD_Forge_작업지시.md 기준:
  §2  IP-Adapter(누구인지) + ControlNet OpenPose(어떤 자세인지) 를 함께 건다
  §3  프롬프트는 태그 나열. seed 고정
  §5  배경 순수 초록, 우향 측면, 연기/외곽선/그림자는 그리지 않는다
  §7  module/model 이름은 추측하지 말고 /controlnet/model_list 로 확인한 값을 쓴다
  §10 SD1.5 체크포인트를 쓴다 (SDXL 아님)

사용법:
    python gen_run_frames.py            # 프레임 3 한 장 (테스트)
    python gen_run_frames.py 1 2 3 4    # 지정 프레임들
    python gen_run_frames.py all        # 8장 전부
"""
import base64
import json
import os
import sys
import urllib.request

API = "http://127.0.0.1:7860"
HERE = os.path.dirname(os.path.abspath(__file__))
POSE_DIR = os.path.join(HERE, "pose_skeletons")
OUT_DIR = os.path.join(HERE, "player_strips")
REF_IMG = os.path.join(HERE, "_c3_ref_single.png")

CHECKPOINT_HINT = "DreamShaper_8"      # SD1.5. §10
SEED = 20260814                        # ★ 전 프레임 동일. 일관성의 핵심 (§3)

# ★ SD1.5 는 CLIP 75토큰 단위로 처리되고 앞쪽 청크가 강하다 (§3).
# 순서 = 우선순위: 시점/전신 > 성별/종족 > 의상 > 발광 > 화풍
#
# 발광 위치는 요청문(A1_run_8frames__attach_C3.txt) 이 정확히 지정한다:
#   눈 / 한쪽 손·팔뚝 / 활 그립·시위 / ★망토의 찢어진 밑단(REQUIRED, 뚜렷하게)
# 망토 밑단 발광은 '필수' 요구사항이므로 억제하면 안 된다. 다리·부츠로 번지는 것만 막는다.
POSITIVE_BASE = (
    "(side view:1.45), profile, facing right, (full body:1.4), running, "
    "(male:1.4) hooded undead archer, gaunt undead man, (fully clothed:1.2), covered legs, "
    "dark grey tattered cloak swept back behind, quiver on back, "
    "(glowing magenta eyes:1.25), magenta soul flame on one hand, "
    "(glowing magenta ragged cloak hem:1.25), "
    "bow held low angled down and back, "
    "16-bit game sprite art, hand painted, hard edges, flat colors, few tones, "
    "light from upper left, plain green background"
)

# 프레임별 다리 상태. 보폭 0/30/50/20% 를 두 스텝에 걸쳐 반복한다 (요청문 FRAMES 표)
FRAME_POSE = {
    1: "(feet almost together:1.2), right knee lifted driving forward, left leg straight under body",
    2: "right leg swinging forward, left leg pushing back, moderate stride",
    3: "(right foot planted forward:1.2), left leg stretched far behind, (widest stride:1.25)",
    4: "body over planted right foot, left leg folding forward underneath, short stride",
    5: "(feet almost together:1.2), left knee lifted driving forward, right leg straight under body",
    6: "left leg swinging forward, right leg pushing back, moderate stride",
    7: "(left foot planted forward:1.2), right leg stretched far behind, (widest stride:1.25)",
    8: "body over planted left foot, right leg folding forward underneath, short stride",
}

# NEGATIVE 도 앞쪽이 강하다. 실제로 반복해서 나온 실패를 앞에 둔다.
# 주의: 망토 밑단 발광은 요청문의 필수 항목이라 여기서 막지 않는다. 옷·다리로 번지는 것만 막는다
NEGATIVE = (
    "(woman:1.6), (high heels:1.5), (bare legs:1.4), (bare thighs:1.4), female, feminine, dress, skirt, thigh gap, "
    "(cropped:1.4), cut off, feet out of frame, close-up, (exposed bones:1.3), bare ribcage, naked, "
    "(glowing legs:1.3), (glowing boots:1.3), magenta pants, pink skin, pink hood, "
    "(jumping:1.4), floating, mid air, feet off the ground, "
    "front view, three quarter view, facing viewer, back view, "
    # 요청문 DO NOT DRAW
    "outline stroke, rim light, glow ring, ground shadow, (ground line:1.2), "
    "horizon, floor, motion blur, speed lines, dust cloud, "
    "smoke, rising wisps, aura around body, glowing chest sigil, "
    "standing still, idle pose, T-pose, bow raised, aiming, "
    "cloak covering legs, legs hidden, "
    "green clothes, green skin, "
    "multiple characters, sprite sheet, text, watermark, "
    "blurry, gradient, soft shading, photorealistic, 3d render"
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
    """설치된 이름 목록에서 조건에 맞는 것을 고른다 (§7: 추측 금지).
    실제 이름이 'CLIP-ViT-H (IPAdapter)' 처럼 하이픈이 없기도 해서 정규화 후 비교한다."""
    def norm(s):
        return s.lower().replace("-", "").replace("_", "").replace(" ", "")
    for n in names:
        low = norm(n)
        if all(norm(m) in low for m in musts) and not any(norm(a) in low for a in avoid):
            return n
    return None


def ensure_checkpoint():
    models = get("/sdapi/v1/sd-models")
    titles = [m["title"] for m in models]
    want = pick(titles, CHECKPOINT_HINT.lower())
    if not want:
        raise SystemExit(f"SD1.5 체크포인트를 못 찾음. 설치된 것: {titles}")
    cur = get("/sdapi/v1/options").get("sd_model_checkpoint")
    if cur != want:
        print(f"  체크포인트 전환: {cur} -> {want}")
        post("/sdapi/v1/options", {"sd_model_checkpoint": want}, timeout=600)
    return want


def resolve_controlnet():
    cn = get("/controlnet/model_list")
    models = cn.get("model_list", cn) if isinstance(cn, dict) else cn
    mods = get("/controlnet/module_list")
    modules = mods.get("module_list", mods) if isinstance(mods, dict) else mods

    pose_model = pick(models, "openpose")
    # 기본은 plain. plus 는 참고 이미지를 더 강하게 따라가서 포즈까지 끌고 올 수 있다
    ip_model = (pick(models, "ip-adapter", "sd15", avoid=("xl", "plus", "face", "light"))
                or pick(models, "ip-adapter", "sd15", avoid=("xl", "face")))
    # IP-Adapter preprocessor: InsightFace 계열은 쓰지 않는다 (§2 ①)
    ip_module = (pick(modules, "ip-adapter", "clip", avoid=("face", "insight", "xl"))
                 or pick(modules, "ip-adapter", avoid=("face", "insight", "xl")))
    return pose_model, ip_model, ip_module, models, modules


def build_payload(f, seed, ref_b64, pose_path, pose_model, ip_model, ip_module):
    return {
        "prompt": f"{POSITIVE_BASE}, {FRAME_POSE[f]}",
        "negative_prompt": NEGATIVE,
        "steps": 28,
        "sampler_name": "DPM++ 2M",
        "scheduler": "Karras",
        "cfg_scale": 7,
        "width": 512,
        "height": 768,
        "seed": seed,
        "batch_size": 1,
        "alwayson_scripts": {
            "controlnet": {"args": [
                {   # 누구인지 — 외형만. 초반(구도·포즈 결정 구간)에는 개입시키지 않는다.
                    # 0.0 부터 걸면 C3 의 '서 있는 자세'까지 복사된다 (§2 ①)
                    "enabled": True, "module": ip_module, "model": ip_model,
                    "weight": 0.7, "image": ref_b64,
                    "resize_mode": "Crop and Resize",
                    "control_mode": "Balanced",
                    "guidance_start": 0.35, "guidance_end": 0.9,
                },
                {   # 어떤 자세인지 — 이미 스켈레톤이므로 전처리 없음 (§2 ②)
                    # ★ "None" 은 대문자. 소문자로 주면 조용히 무시된다 (§7)
                    "enabled": True, "module": "None", "model": pose_model,
                    "weight": 1.3, "image": b64(pose_path),
                    "resize_mode": "Just Resize",
                    "control_mode": "ControlNet is more important",
                    "guidance_start": 0.0, "guidance_end": 1.0,
                },
            ]}
        },
    }


def scan(frame, n):
    """한 프레임을 여러 seed 로 뽑아 _seed_scan/ 에 저장한다. 눈으로 골라서 SEED 에 박는다."""
    out_dir = os.path.join(HERE, "_seed_scan")
    os.makedirs(out_dir, exist_ok=True)
    ensure_checkpoint()
    pose_model, ip_model, ip_module, _, _ = resolve_controlnet()
    ref_b64 = b64(REF_IMG)
    pose_path = os.path.join(POSE_DIR, f"run_pose_f{frame}.png")
    for i in range(n):
        seed = 1000 + i * 7717        # 서로 충분히 떨어진 값
        p = build_payload(frame, seed, ref_b64, pose_path,
                          pose_model, ip_model, ip_module)
        r = post("/sdapi/v1/txt2img", p)
        out = os.path.join(out_dir, f"f{frame}_seed{seed}.png")
        with open(out, "wb") as fh:
            fh.write(base64.b64decode(r["images"][0]))
        print(f"  seed {seed} -> {os.path.basename(out)}", flush=True)


def main():
    args = sys.argv[1:] or ["3"]

    # seed 탐색 모드: 같은 프레임을 여러 seed 로 뽑아 고른다.
    #   python gen_run_frames.py scan 3 8   -> 프레임3 을 8개 seed 로
    # ★ seed 고정(§3)은 '8프레임 간 일관성'용이다. 쓸 만한 결과를 찾기 전에 고정하면
    #   같은 실패를 반복하게 된다. 좋은 seed 를 먼저 찾고, 그 다음 고정하는 것이 순서다.
    if args[0] == "scan":
        frame = int(args[1]) if len(args) > 1 else 3
        n = int(args[2]) if len(args) > 2 else 8
        return scan(frame, n)

    frames = list(range(1, 9)) if args == ["all"] else [int(a) for a in args]

    os.makedirs(OUT_DIR, exist_ok=True)
    ckpt = ensure_checkpoint()
    pose_model, ip_model, ip_module, all_models, all_modules = resolve_controlnet()

    print(f"  체크포인트 : {ckpt}")
    print(f"  OpenPose   : {pose_model}")
    print(f"  IP-Adapter : {ip_model}  (preprocessor: {ip_module})")
    if not pose_model or not ip_model:
        print("\n  설치된 ControlNet 모델:", all_models)
        raise SystemExit("OpenPose 또는 IP-Adapter 가 없다. 설치가 먼저다 (§10)")

    ref_b64 = b64(REF_IMG)
    for f in frames:
        pose_path = os.path.join(POSE_DIR, f"run_pose_f{f}.png")
        if not os.path.exists(pose_path):
            print(f"  ! 스켈레톤 없음: {pose_path}")
            continue
        payload = build_payload(f, SEED, ref_b64, pose_path,
                                pose_model, ip_model, ip_module)
        print(f"  생성 중 f{f} ...", flush=True)
        r = post("/sdapi/v1/txt2img", payload)
        out = os.path.join(OUT_DIR, f"run_f{f}.png")
        with open(out, "wb") as fh:
            fh.write(base64.b64decode(r["images"][0]))
        print(f"    -> {out}")


if __name__ == "__main__":
    main()
