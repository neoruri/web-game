"""
교정된 스켈레톤(sd_v2/)으로 run 6프레임을 생성한다.

조합은 오늘 실측으로 확정한 것을 쓴다:
    txt2img            출발점을 백지로 두어야 포즈가 자유롭다
                       (img2img 로 기준 그림을 넣으면 포즈까지 붙잡혀 전 프레임이 같은 자세가 된다)
  + ControlNet OpenPose  자세 지정. Preprocessor 는 반드시 대문자 "None"
  + IP-Adapter           기존 캐릭터의 '외형만' 주입. 초반 구도 결정 구간은 비켜서 건다

사용법:
    python gen_run_v2.py            # f1 테스트
    python gen_run_v2.py all
"""
import base64
import json
import os
import sys
import urllib.request

import numpy as np
from PIL import Image

API = "http://127.0.0.1:7860"
HERE = os.path.dirname(os.path.abspath(__file__))
POSE_DIR = os.path.join(HERE, "sd_v2")
OUT_DIR = os.path.join(HERE, "run_v2")
PARTS = os.path.join(HERE, "player_strips", "parts")
REF_SRC = os.path.join(PARTS, "run_f3.png")     # 중간 보폭 = 참조로 무난
REF_CROP = os.path.join(HERE, "sd_v2", "_ref_char.png")

CHECKPOINT_HINT = "DreamShaper_8"
SEED = 20260818

POSITIVE = (
    "(side view:1.4), profile, facing right, (full body:1.35), running, "
    "hooded undead archer, (face hidden in hood:1.2), glowing magenta eye, "
    "grey green tattered cloak, ragged hem, quiver of arrows on back, "
    "dark leather armor, magenta glowing runes on arms and legs, "
    "(both legs fully visible:1.2), tall boots, "
    "game character art, painterly, "
    "(solid flat green screen background:1.35), chroma key green"
)

NEGATIVE = (
    "(cropped:1.4), cut off, feet out of frame, close-up, "
    "(female:1.3), skirt, dress, high heels, bare legs, "
    "skeleton, bones, skull face, "
    "front view, three quarter view, facing viewer, back view, "
    "(jumping:1.3), floating, mid air, feet off the ground, "
    "ground shadow, floor, horizon line, "
    "standing still, idle pose, T-pose, bow raised, aiming, "
    "cloak covering legs, legs hidden, "
    "smoke, aura, glow ring, rim light, outline, "
    "text, watermark, multiple characters, extra limbs, blurry"
)


def get(p):
    with urllib.request.urlopen(API + p, timeout=60) as r:
        return json.loads(r.read())


def post(p, d, t=900):
    req = urllib.request.Request(API + p, data=json.dumps(d).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=t) as r:
        return json.loads(r.read())


def b64(p):
    with open(p, "rb") as f:
        return base64.b64encode(f.read()).decode()


def pick(names, *musts, avoid=()):
    def norm(s):
        return s.lower().replace("-", "").replace("_", "").replace(" ", "")
    for n in names:
        low = norm(n)
        if all(norm(m) in low for m in musts) and not any(norm(a) in low for a in avoid):
            return n
    return None


def make_ref():
    """기존 프레임에서 캐릭터만 잘라 IP-Adapter 참조로 쓴다.
    1408×768 원본을 그대로 넣으면 초록 여백이 대부분이라 외형 신호가 희석된다."""
    im = Image.open(REF_SRC).convert("RGB")
    a = np.asarray(im).astype(int)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    m = ~((G > 110) & (G - np.maximum(R, B) > 50))
    ys, xs = np.where(m)
    im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)).save(REF_CROP)
    return REF_CROP


def main():
    args = sys.argv[1:] or ["1"]
    frames = list(range(1, 7)) if args == ["all"] else [int(a) for a in args]
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
    ip_model = pick(models, "ip-adapter", "sd15", avoid=("xl", "plus", "face"))
    ip_mod = pick(modules, "ipadapter", "clip", avoid=("face", "insight", "bigg"))

    ref = b64(make_ref())
    print(f"  {want} / {pose_model} / module={none_mod}")
    print(f"  IP-Adapter: {ip_model} ({ip_mod})  참조: parts/run_f3.png 크롭")

    for f in frames:
        pose = os.path.join(POSE_DIR, f"pose_run_f{f}.png")
        units = [{
            "enabled": True, "module": none_mod, "model": pose_model,
            "weight": 1.25, "image": b64(pose),
            "resize_mode": "Just Resize",
            "control_mode": "ControlNet is more important",
            "guidance_start": 0.0, "guidance_end": 0.9,
        }]
        if ip_model and ip_mod:
            units.append({
                "enabled": True, "module": ip_mod, "model": ip_model,
                "weight": 0.8, "image": ref,
                "resize_mode": "Crop and Resize", "control_mode": "Balanced",
                "guidance_start": 0.2, "guidance_end": 1.0,
            })
        payload = {
            "prompt": POSITIVE, "negative_prompt": NEGATIVE,
            "steps": 28, "sampler_name": "DPM++ 2M", "scheduler": "Karras",
            "cfg_scale": 7, "width": 512, "height": 768,
            "seed": SEED, "batch_size": 1,
            "alwayson_scripts": {"controlnet": {"args": units}},
        }
        print(f"  생성 중 f{f} ...", flush=True)
        r = post("/sdapi/v1/txt2img", payload)
        out = os.path.join(OUT_DIR, f"run_f{f}.png")
        with open(out, "wb") as fh:
            fh.write(base64.b64decode(r["images"][0]))
        print(f"    -> {out}")


if __name__ == "__main__":
    main()
