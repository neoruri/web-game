"""
캐릭터 LoRA 학습용 데이터셋 준비.

재료:
    player_strips/parts/run_f1~f6.png   달리는 포즈 6장 (1408×768, 초록 배경)
    player_strips/idle.png              대기 4프레임 스트립 (1792×592) -> 4장

처리:
    캐릭터만 크롭 -> 정사각 캔버스에 초록 배경으로 패딩 -> 512×512
    초록 배경을 그대로 두는 이유: 최종 산출물도 그린스크린이라 함께 학습되는 편이 낫다.
    (오늘 내내 배경을 프롬프트로 못 잡았는데, LoRA 가 배경까지 외워주면 그 문제가 사라진다)

캡션은 트리거 토큰 'hdarcher' 로 시작한다. 흔한 단어를 쓰면 기존 개념과 섞인다.
"""
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SPR = os.path.dirname(HERE)
PARTS = os.path.join(SPR, "player_strips", "parts")
IDLE = os.path.join(SPR, "player_strips", "idle.png")
OUT = os.path.join(HERE, "dataset")

SIZE = 512
TRIGGER = "hdarcher"
GREEN = (34, 177, 76)          # 패딩용. 아래에서 실제 배경색으로 덮어쓴다


def char_bbox(im, tol_g=110, tol_d=50):
    a = np.asarray(im.convert("RGB")).astype(int)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    bg = (G > tol_g) & (G - np.maximum(R, B) > tol_d)
    ys, xs = np.where(~bg)
    if len(xs) == 0:
        return None, None
    # 배경 대표색 (패딩에 같은 색을 쓰려고)
    px = a[bg]
    dom = tuple(int(v) for v in np.median(px, axis=0)) if len(px) else GREEN
    return (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1), dom


def square(im, box, bg, pad=0.10):
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    m = int(max(w, h) * pad)
    side = max(w, h) + m * 2
    canvas = Image.new("RGB", (side, side), bg)
    crop = im.crop(box)
    canvas.paste(crop, ((side - w) // 2, (side - h) // 2))
    return canvas.resize((SIZE, SIZE), Image.LANCZOS)


def save(im, name, caption):
    im.save(os.path.join(OUT, f"{name}.png"))
    with open(os.path.join(OUT, f"{name}.txt"), "w", encoding="utf-8") as f:
        f.write(caption)


def main():
    os.makedirs(OUT, exist_ok=True)
    n = 0

    for i in range(1, 7):
        p = os.path.join(PARTS, f"run_f{i}.png")
        if not os.path.exists(p):
            continue
        im = Image.open(p).convert("RGB")
        box, bg = char_bbox(im)
        if box is None:
            continue
        save(square(im, box, bg), f"run_{i}",
             f"{TRIGGER}, a hooded undead archer running, side view facing right, "
             f"tattered grey green cloak, glowing magenta runes, green screen background")
        n += 1

    if os.path.exists(IDLE):
        strip = Image.open(IDLE).convert("RGB")
        w = strip.width // 4
        for i in range(4):
            frame = strip.crop((i * w, 0, (i + 1) * w, strip.height))
            box, bg = char_bbox(frame)
            if box is None:
                continue
            save(square(frame, box, bg), f"idle_{i + 1}",
                 f"{TRIGGER}, a hooded undead archer standing, side view facing right, "
                 f"tattered grey green cloak, glowing magenta runes, holding a bow, "
                 f"green screen background")
            n += 1

    print(f"  데이터셋 {n}장 -> {OUT}")
    for f in sorted(os.listdir(OUT)):
        if f.endswith(".png"):
            print(f"   {f}")


if __name__ == "__main__":
    main()
