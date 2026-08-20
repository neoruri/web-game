"""
크리처 이미지의 배경을 SAM 으로 잘라내고 순수 검정에 올린다.

배경을 프롬프트로 잡으려는 시도는 반복해서 실패했다(회색 그라데이션, 주황 배경, 바닥 등).
분할 후 합성이 결정적이고 확실하다.

3차에서 날개·지팡이처럼 몸통에서 뻗은 부위가 잘렸다.
그래서 중심 한 점이 아니라 여러 점을 찍고 마스크를 합친다.

사용법:
    python sam_black.py creatures_v4
    python sam_black.py creatures_v4 --alpha    # 검정 대신 투명 배경으로
"""
import glob
import os
import sys

os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS", "1")
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lora"))
from sam_mask import segment_box  # noqa: E402


def multi_mask(im):
    """피사체를 감싸는 박스로 분할한다.

    점 프롬프트를 먼저 썼는데 6장 중 3장이 실패했다 —
    배경을 통째로 집거나(imp) 다리·날개를 놓쳤다(ogre, winged).
    크리처는 화면 중앙에 꽉 차게 생성되므로, 여백만 뺀 박스를 주는 편이 훨씬 안정적이다.
    """
    w, h = im.size
    boxes = [
        (int(w * 0.06), int(h * 0.04), int(w * 0.94), int(h * 0.97)),
        (int(w * 0.12), int(h * 0.08), int(w * 0.88), int(h * 0.95)),
    ]
    best = None
    for b in boxes:
        m, score = segment_box(im, b)
        cover = m.mean()
        # 화면을 거의 다 덮으면 배경까지 집은 것, 너무 적으면 일부만 집은 것
        if not (0.08 <= cover <= 0.70):
            continue
        if best is None or score > best[1]:
            best = (m, score)
    return best[0] if best else None


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else "creatures_v4"
    alpha = "--alpha" in sys.argv
    here = os.path.dirname(os.path.abspath(__file__))
    src_dir = os.path.join(here, src)
    out_dir = os.path.join(src_dir, "black")
    os.makedirs(out_dir, exist_ok=True)

    for f in sorted(glob.glob(os.path.join(src_dir, "[0-9]_*.png"))):
        im = Image.open(f).convert("RGB")
        m = multi_mask(im)
        if m is None:
            print(f"  ! 분할 실패: {os.path.basename(f)}")
            continue
        mask = Image.fromarray((m * 255).astype("uint8"))
        if alpha:
            out = Image.new("RGBA", im.size, (0, 0, 0, 0))
            out.paste(im, (0, 0), mask)
        else:
            out = Image.new("RGB", im.size, (0, 0, 0))
            out.paste(im, (0, 0), mask)
        name = os.path.basename(f)
        out.save(os.path.join(out_dir, name))
        print(f"  {name:22s} 피사체 {100*m.mean():4.1f}%")


if __name__ == "__main__":
    main()
