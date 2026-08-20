"""
SAM(Segment Anything) 으로 정밀 마스크를 만든다.

지금까지는 마스크를 색·행간격 휴리스틱으로 손코딩했다. 프레임마다 잘 맞기도 하고
빗나가기도 해서(f1·f4 는 위치박스로 대체해야 했다) 신뢰도가 낮았다.
SAM 은 '이 점이 속한 물체'를 통째로 분할해주므로, 점 하나만 찍으면 경계까지 정확히 나온다.

사용법:
    python sam_mask.py <이미지> --point 0.12 0.30      캐릭터 bbox 기준 상대좌표
    python sam_mask.py <이미지> --point 0.12 0.30 --out mask.png
"""
import argparse
import os

os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS", "1")
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

import numpy as np
import torch
from PIL import Image

_MODEL = None
_PROC = None


def load():
    global _MODEL, _PROC
    if _MODEL is None:
        from transformers import SamModel, SamProcessor
        _PROC = SamProcessor.from_pretrained("facebook/sam-vit-base")
        _MODEL = SamModel.from_pretrained("facebook/sam-vit-base")
        _MODEL.eval()
    return _MODEL, _PROC


def char_bbox(im):
    a = np.asarray(im.convert("RGB")).astype(int)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    m = ~((G > 110) & (G - np.maximum(R, B) > 50))
    ys, xs = np.where(m)
    return xs.min(), ys.min(), xs.max(), ys.max()


def segment_box(im, box):
    """box: (x0,y0,x1,y1) 절대좌표.
    점 프롬프트는 배경을 통째로 집거나 팔다리를 놓치는 일이 잦다.
    피사체를 감싸는 박스를 주면 훨씬 안정적이다."""
    model, proc = load()
    inputs = proc(im, input_boxes=[[list(box)]], return_tensors="pt")
    with torch.no_grad():
        out = model(**inputs)
    masks = proc.image_processor.post_process_masks(
        out.pred_masks.cpu(), inputs["original_sizes"].cpu(),
        inputs["reshaped_input_sizes"].cpu())[0][0]
    scores = out.iou_scores[0][0]
    best = int(torch.argmax(scores))
    return masks[best].numpy(), float(scores[best])


def segment(im, points, labels=None):
    """points: [(x,y), ...] 절대좌표. labels: 1=포함, 0=제외."""
    model, proc = load()
    labels = labels or [1] * len(points)
    inputs = proc(im, input_points=[[list(p) for p in points]],
                  input_labels=[[labels]], return_tensors="pt")
    with torch.no_grad():
        out = model(**inputs)
    masks = proc.image_processor.post_process_masks(
        out.pred_masks.cpu(), inputs["original_sizes"].cpu(),
        inputs["reshaped_input_sizes"].cpu())[0][0]        # (3, H, W) 후보 3개
    scores = out.iou_scores[0][0]
    best = int(torch.argmax(scores))
    return masks[best].numpy(), float(scores[best])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("--point", type=float, nargs=2, required=True,
                    help="캐릭터 bbox 기준 상대좌표 (0~1)")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    im = Image.open(args.image).convert("RGB")
    x0, y0, x1, y1 = char_bbox(im)
    px = int(x0 + (x1 - x0) * args.point[0])
    py = int(y0 + (y1 - y0) * args.point[1])
    mask, score = segment(im, [(px, py)])
    print(f"  점 ({px},{py})  IoU {score:.3f}  마스크 {100*mask.mean():.2f}%")

    out = args.out or os.path.splitext(args.image)[0] + "_sammask.png"
    Image.fromarray((mask * 255).astype("uint8")).save(out)
    print(f"  -> {out}")

    # 겹쳐보기
    ov = im.copy()
    ov.paste(Image.new("RGB", im.size, (255, 0, 0)),
             (0, 0), Image.fromarray((mask * 140).astype("uint8")))
    from PIL import ImageDraw
    dr = ImageDraw.Draw(ov)
    dr.ellipse([px - 6, py - 6, px + 6, py + 6], outline=(255, 255, 0), width=3)
    prev = os.path.splitext(out)[0] + "_preview.png"
    ov.save(prev)
    print(f"  -> {prev}")


if __name__ == "__main__":
    main()
