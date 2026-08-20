"""
이미지에 좌표 격자를 씌운다.

파츠를 자르려면 "팔꿈치가 몇 픽셀인가"를 정확히 알아야 한다.
눈대중으로 폴리곤을 찍으면 반드시 어긋나므로, 격자를 씌워 좌표를 읽고 시작한다.

    python grid_overlay.py <이미지> [--step 100]
"""
import argparse
import os

from PIL import Image, ImageDraw


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("--step", type=int, default=100)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    im = Image.open(args.image).convert("RGB")
    w, h = im.size
    dr = ImageDraw.Draw(im)

    for x in range(0, w, args.step):
        major = (x // args.step) % 5 == 0
        dr.line([(x, 0), (x, h)], fill=(0, 255, 90) if major else (0, 140, 60),
                width=2 if major else 1)
    for y in range(0, h, args.step):
        major = (y // args.step) % 5 == 0
        dr.line([(0, y), (w, y)], fill=(0, 255, 90) if major else (0, 140, 60),
                width=2 if major else 1)
    # 라벨은 선 위에 겹치면 안 읽히므로 살짝 띄운다
    for x in range(0, w, args.step):
        dr.text((x + 3, 3), str(x), fill=(255, 255, 0))
    for y in range(args.step, h, args.step):
        dr.text((3, y + 3), str(y), fill=(255, 255, 0))

    out = args.out or os.path.splitext(args.image)[0] + "_grid.png"
    im.save(out)
    print(f"  {w}x{h}, {args.step}px 격자 -> {out}")


if __name__ == "__main__":
    main()
