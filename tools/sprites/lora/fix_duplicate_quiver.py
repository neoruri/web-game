"""
중복 생성된 화살통을 인페인팅으로 제거한다.

원본 parts/ 에는 화살통이 하나인데 생성물에는 주 화살통 왼쪽 아래로 하나가 더 붙는다.
64px 로 줄여도 실루엣 덩어리로 남기 때문에 반드시 지워야 한다.
(업스케일은 64px 출력에 의미가 없지만, 이런 실루엣 오류는 크기와 무관하게 남는다)

마스크 검출 두 가지를 합친다:
  ① 행-간격 방식 — 중복이 본체와 떨어져 있을 때 (f2 처럼)
  ② 위치 박스 ∩ 캐릭터 픽셀 — 중복이 본체에 붙어 있을 때 (f1·f4 처럼)
①의 검출량이 적으면 ②로 넘어간다.

사용법:
    python fix_duplicate_quiver.py            # 전 프레임
    python fix_duplicate_quiver.py 1 4
    python fix_duplicate_quiver.py --preview  # 마스크만 확인
"""
import base64
import io
import json
import os
import sys
import urllib.request

import numpy as np
from PIL import Image, ImageFilter

API = "http://127.0.0.1:7860"
HERE = os.path.dirname(os.path.abspath(__file__))
SPR = os.path.dirname(HERE)
SRC = os.path.join(SPR, "lora_fixed")
OUT = os.path.join(SPR, "lora_final")

PROMPT = ("hdarcher, hooded undead archer, tattered grey green cloak, "
          "plain green screen background <lora:hdarcher:0.9>")
NEGATIVE = ("(quiver:1.5), (arrows:1.4), tube, cylinder, backpack, "
            "bag, container, extra object, text, watermark")


def charmask(im):
    a = np.asarray(im.convert("RGB")).astype(int)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    return ~((G > 110) & (G - np.maximum(R, B) > 50))


def dup_mask(im):
    m = charmask(im)
    ys, xs = np.where(m)
    y0, y1 = ys.min(), ys.max()
    x0, x1 = xs.min(), xs.max()
    h, w = y1 - y0, x1 - x0

    # ① 행마다 왼쪽으로 떨어져 나간 덩어리
    out = np.zeros_like(m)
    for y in range(y0 + int(h * 0.14), y0 + int(h * 0.62)):
        idx = np.where(m[y])[0]
        if len(idx) < 2:
            continue
        brk = np.where(np.diff(idx) > 12)[0]
        if not len(brk):
            continue
        left = idx[:brk[0] + 1]
        if len(left) < 60:                 # 팔뚝처럼 넓은 것은 제외
            out[y, left] = True

    # ② 검출이 미미하면 위치 박스로 대체 (본체에 붙어 있는 경우)
    if out.mean() < 0.008:
        out = np.zeros_like(m)
        bx1 = x0 + int(w * 0.34)
        by0, by1 = y0 + int(h * 0.16), y0 + int(h * 0.58)
        box = np.zeros_like(m)
        box[by0:by1, x0:bx1] = True
        out = box & m                      # 박스 안의 '캐릭터 픽셀'만

    return Image.fromarray((out * 255).astype("uint8")).filter(ImageFilter.MaxFilter(7))


def post(p, d, t=900):
    r = urllib.request.Request(API + p, data=json.dumps(d).encode(),
                               headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(r, timeout=t).read())


def b64_file(p):
    with open(p, "rb") as f:
        return base64.b64encode(f.read()).decode()


def b64_img(im):
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def main():
    args = [a for a in sys.argv[1:]]
    preview = "--preview" in args
    if preview:
        args.remove("--preview")
    frames = [int(a) for a in args] if args else [1, 2, 3, 4, 5, 6]
    os.makedirs(OUT, exist_ok=True)

    for f in frames:
        src = os.path.join(SRC, f"run_f{f}.png")
        if not os.path.exists(src):
            continue
        im = Image.open(src).convert("RGB")
        mk = dup_mask(im)
        cov = np.asarray(mk).mean() / 255
        mk.save(os.path.join(OUT, f"_mask_f{f}.png"))
        if preview:
            ov = im.copy()
            ov.paste(Image.new("RGB", im.size, (255, 0, 0)), (0, 0),
                     mk.point(lambda v: int(v * 0.55)))
            ov.save(os.path.join(OUT, f"_preview_f{f}.png"))
            print(f"  f{f} 마스크 {cov*100:.1f}% (미리보기만)")
            continue

        payload = {
            "init_images": [b64_file(src)],
            "mask": b64_img(mk),
            "denoising_strength": 0.85,     # 물체를 지워야 하므로 높게
            "mask_blur": 8,
            "inpainting_fill": 2,           # latent noise = 기존 물체를 지우기 좋다
            "inpaint_full_res": False,
            "resize_mode": 0,
            "prompt": PROMPT, "negative_prompt": NEGATIVE,
            "steps": 28, "sampler_name": "DPM++ 2M", "scheduler": "Karras",
            "cfg_scale": 7, "width": im.width, "height": im.height,
            "seed": 9090, "batch_size": 1,
        }
        print(f"  f{f} 중복 제거 (마스크 {cov*100:.1f}%) ...", flush=True)
        r = post("/sdapi/v1/img2img", payload)
        dst = os.path.join(OUT, f"run_f{f}.png")
        with open(dst, "wb") as fh:
            fh.write(base64.b64decode(r["images"][0]))
        print(f"    -> {dst}")


if __name__ == "__main__":
    main()
