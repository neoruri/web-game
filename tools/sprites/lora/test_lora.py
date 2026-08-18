"""
학습한 캐릭터 LoRA 검증.

핵심 확인 사항 두 가지:
  ① 캐릭터 재현 — 원본 parts/ 와 같은 인물·의상·발광으로 나오는가
  ② 포즈 반영 — 교정 스켈레톤(sd_v2)의 보폭 차이가 f1(CONTACT) / f2(PASSING) 로 드러나는가

LoRA 가 캐릭터를 모델에 직접 가르치므로 IP-Adapter 를 쓰지 않는다.
그동안 IP-Adapter 가 참조 이미지의 포즈까지 끌고 와서 포즈 제어를 방해했는데,
그 유닛이 빠지면 ControlNet 이 포즈를 온전히 통제하게 된다 — 이번 검증의 요점이다.

사용법:
    python test_lora.py                 # 가중치 0.8
    python test_lora.py --w 1.0 --frames 1 2 3
"""
import argparse
import base64
import json
import os
import urllib.request

API = "http://127.0.0.1:7860"
HERE = os.path.dirname(os.path.abspath(__file__))
SPR = os.path.dirname(HERE)
POSE_DIR = os.path.join(SPR, "sd_v2")
PARTS = os.path.join(SPR, "player_strips", "parts")
OUT = os.path.join(SPR, "lora_test")

TRIGGER = "hdarcher"
POSITIVE = (
    "{trig}, a hooded undead archer running, (side view:1.35), profile facing right, "
    "(full body:1.3), tattered grey green cloak, glowing magenta runes, "
    "quiver of arrows on back, tall boots, (both legs visible:1.2), "
    "green screen background <lora:{name}:{w}>"
)
NEGATIVE = (
    "(cropped:1.4), cut off, feet out of frame, close-up, "
    "(female:1.2), skirt, bare legs, high heels, "
    "front view, three quarter view, facing viewer, back view, "
    "jumping, floating, mid air, ground shadow, horizon, "
    "standing still, idle pose, text, watermark, extra limbs, blurry"
)


def post(p, d, t=900):
    r = urllib.request.Request(API + p, data=json.dumps(d).encode(),
                               headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(r, timeout=t).read())


def get(p):
    with urllib.request.urlopen(API + p, timeout=60) as r:
        return json.loads(r.read())


def b64(p):
    with open(p, "rb") as f:
        return base64.b64encode(f.read()).decode()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--w", type=float, default=0.8)
    ap.add_argument("--name", default="hdarcher")
    ap.add_argument("--frames", type=int, nargs="*", default=[1, 2])
    ap.add_argument("--seed", type=int, default=31337)
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)

    post("/sdapi/v1/refresh-loras", {})
    loras = [x["name"] for x in get("/sdapi/v1/loras")]
    print(f"  인식된 LoRA: {loras}")
    if args.name not in loras:
        raise SystemExit(f"'{args.name}' 을 Forge 가 못 찾는다")

    for f in args.frames:
        payload = {
            "prompt": POSITIVE.format(trig=TRIGGER, name=args.name, w=args.w),
            "negative_prompt": NEGATIVE,
            "steps": 28, "sampler_name": "DPM++ 2M", "scheduler": "Karras",
            "cfg_scale": 7, "width": 512, "height": 768,
            "seed": args.seed, "batch_size": 1,
            "alwayson_scripts": {"controlnet": {"args": [{
                "enabled": True, "module": "None",
                "model": "control_v11p_sd15_openpose_fp16",
                "weight": 1.25,
                "image": b64(os.path.join(POSE_DIR, f"pose_run_f{f}.png")),
                "resize_mode": "Just Resize",
                "control_mode": "ControlNet is more important",
                "guidance_start": 0.0, "guidance_end": 0.9,
            }]}},
        }
        print(f"  생성 중 f{f} (lora {args.w}) ...", flush=True)
        r = post("/sdapi/v1/txt2img", payload)
        p = os.path.join(OUT, f"lora_f{f}.png")
        with open(p, "wb") as fh:
            fh.write(base64.b64decode(r["images"][0]))
        print(f"    -> {p}")

    build_compare(args.frames)


def build_compare(frames):
    from PIL import Image, ImageDraw
    import numpy as np

    def crop_char(p):
        im = Image.open(p).convert("RGB")
        a = np.asarray(im).astype(int)
        R, G, B = a[..., 0], a[..., 1], a[..., 2]
        m = ~((G > 110) & (G - np.maximum(R, B) > 50))
        ys, xs = np.where(m)
        if len(xs) == 0:
            return im
        return im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))

    cells = []
    for f in frames:
        gen = os.path.join(OUT, f"lora_f{f}.png")
        org = os.path.join(PARTS, f"run_f{f}.png")
        if os.path.exists(org):
            cells.append((f"원본 f{f}", crop_char(org)))
        if os.path.exists(gen):
            cells.append((f"LoRA f{f}", crop_char(gen)))
    if not cells:
        return
    H = 380
    imgs = [(t, im.resize((max(int(im.width * H / im.height), 1), H))) for t, im in cells]
    W = sum(im.width for _, im in imgs) + 10 * len(imgs)
    canvas = Image.new("RGB", (W, H + 20), (25, 25, 25))
    dr = ImageDraw.Draw(canvas)
    x = 0
    for t, im in imgs:
        canvas.paste(im, (x, 20))
        dr.text((x + 4, 4), t, fill=(255, 255, 0))
        x += im.width + 10
    out = os.path.join(OUT, "_compare.png")
    canvas.save(out)
    print(f"  비교: {out}")


if __name__ == "__main__":
    main()
