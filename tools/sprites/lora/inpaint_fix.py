"""
생성된 프레임의 문제 부위만 인페인팅으로 고친다.

전체를 다시 뽑으면 잘 나온 부분까지 새로 추첨하게 되어 "이번엔 다른 게 망가졌다"를 반복한다.
인페인팅은 나머지 픽셀을 그대로 두고 지정한 영역만 다시 그린다.

현재 대상: 화살통의 마젠타 발광이 원본보다 과하게 번진 것.
  원본 parts/ 는 화살촉에만 살짝 있는데, 생성물은 깃털처럼 크게 퍼진다.

마스크는 색으로 자동 검출한다 — 채도 높은 마젠타 계열 픽셀 중 상체 위쪽 것만.

사용법:
    python inpaint_fix.py                 # 전 프레임
    python inpaint_fix.py 1 3             # 지정 프레임
    python inpaint_fix.py 1 --dn 0.75
"""
import base64
import json
import os
import sys
import urllib.request

import numpy as np
from PIL import Image, ImageFilter

API = "http://127.0.0.1:7860"
HERE = os.path.dirname(os.path.abspath(__file__))
SPR = os.path.dirname(HERE)
SRC = os.path.join(SPR, "lora_test")
OUT = os.path.join(SPR, "lora_fixed")

PROMPT = ("hdarcher, hooded undead archer, quiver of arrows on back, "
          "plain metal arrow tips, dull grey fletching, green screen background "
          "<lora:hdarcher:0.9>")
NEGATIVE = ("(glowing arrows:1.5), (magenta plume:1.5), bright pink glow, "
            "large glow, light beam, fire, smoke, feathers, text, watermark")


def post(p, d, t=900):
    r = urllib.request.Request(API + p, data=json.dumps(d).encode(),
                               headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(r, timeout=t).read())


def b64(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()


def b64_img(im):
    import io
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def glow_mask(im, top_ratio=0.55, grow=9):
    """채도 높은 마젠타 계열 = 발광. 상체 위쪽 것만 남긴다(허리 룬은 원본에도 있으므로 보존)."""
    a = np.asarray(im.convert("RGB")).astype(int)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    mx = a.max(axis=-1)
    mn = a.min(axis=-1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    magenta = (R > 120) & (B > 120) & (R > G + 40) & (B > G + 30) & (sat > 0.30)

    m = np.zeros_like(magenta)
    cut = int(im.height * top_ratio)
    m[:cut] = magenta[:cut]                      # 위쪽만
    mask = Image.fromarray((m * 255).astype("uint8"))
    mask = mask.filter(ImageFilter.MaxFilter(grow))   # 번짐 여유까지 덮도록 확장
    return mask


def main():
    args = [a for a in sys.argv[1:]]
    dn = 0.75
    if "--dn" in args:
        i = args.index("--dn")
        dn = float(args[i + 1])
        del args[i:i + 2]
    frames = [int(a) for a in args] if args else [1, 2, 3, 4, 5, 6]
    os.makedirs(OUT, exist_ok=True)

    for f in frames:
        src = os.path.join(SRC, f"lora_f{f}.png")
        if not os.path.exists(src):
            print(f"  ! 없음: {src}")
            continue
        im = Image.open(src).convert("RGB")
        mask = glow_mask(im)
        cover = np.asarray(mask).mean() / 255
        mask.save(os.path.join(OUT, f"_mask_f{f}.png"))

        payload = {
            "init_images": [b64(src)],
            "mask": b64_img(mask),
            "denoising_strength": dn,
            "mask_blur": 6,
            "inpainting_fill": 1,          # 원본 유지 후 재생성
            "inpaint_full_res": False,     # 전체 캔버스 기준. 작은 영역이라 확대 불필요
            "resize_mode": 0,
            "prompt": PROMPT, "negative_prompt": NEGATIVE,
            "steps": 26, "sampler_name": "DPM++ 2M", "scheduler": "Karras",
            "cfg_scale": 7, "width": im.width, "height": im.height,
            "seed": 5150, "batch_size": 1,
        }
        print(f"  f{f} 인페인팅 (마스크 {cover*100:.1f}%) ...", flush=True)
        r = post("/sdapi/v1/img2img", payload)
        dst = os.path.join(OUT, f"run_f{f}.png")
        with open(dst, "wb") as fh:
            fh.write(base64.b64decode(r["images"][0]))
        print(f"    -> {dst}")


if __name__ == "__main__":
    main()
