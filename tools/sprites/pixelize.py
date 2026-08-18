"""
생성된 그림을 레퍼런스(refs/ref_runcycle.gif) 규격의 픽셀아트로 변환한다.

레퍼런스 실측값:
    픽셀 격자   4×4
    네이티브    캐릭터 약 46×55 px
    팔레트      13색
    배경        (218,190,150) 단색

즉 레퍼런스는 '큰 그림을 줄인 것'이 아니라 최종 해상도로 직접 찍은 그림이다.
그래서 축소만으로는 그 결이 안 나온다. 축소 + 색 강제 양자화 + 안티에일리어싱 제거가 필요하다.

사용법:
    python pixelize.py newchar 8          newchar/run_f1~8 을 변환
    python pixelize.py newchar 8 --colors 13
"""
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET_W, TARGET_H = 53, 64          # 게임 표시 크기
DEFAULT_COLORS = 13                  # 레퍼런스와 동일
REF_PALETTE = None                   # --refpal 로 켜면 레퍼런스 13색을 강제한다


def load_ref_palette(path=None, n=DEFAULT_COLORS):
    """refs/ref_runcycle.gif 의 실제 사용색을 빈도순으로 뽑는다."""
    path = path or os.path.join(HERE, "refs", "frames", "f00.png")
    a = np.asarray(Image.open(path).convert("RGB")).reshape(-1, 3)
    vals, cnt = np.unique(a, axis=0, return_counts=True)
    return [tuple(int(v) for v in vals[i]) for i in np.argsort(-cnt)[:n]]


def find_bg(a, tol=26):
    """가장자리에서 배경색을 추정한다."""
    edge = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    vals, cnt = np.unique(edge.reshape(-1, 3), axis=0, return_counts=True)
    return vals[np.argmax(cnt)]


def pixelize(path, colors=DEFAULT_COLORS, pad=2):
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(int)
    bg = find_bg(a)

    # 인물만 잘라낸다. 배경 여백이 크면 축소 후 캐릭터가 너무 작아진다
    mask = np.abs(a - bg).sum(axis=-1) > 60
    if mask.any():
        ys, xs = np.where(mask)
        im = im.crop((max(xs.min() - pad, 0), max(ys.min() - pad, 0),
                      min(xs.max() + pad, im.width), min(ys.max() + pad, im.height)))

    # 비율을 유지한 채 목표 크기 안에 맞춘다 (BOX = 면적 평균, 픽셀아트 축소에 적합)
    im.thumbnail((TARGET_W, TARGET_H), Image.BOX)
    canvas = Image.new("RGB", (TARGET_W, TARGET_H), tuple(int(v) for v in bg))
    canvas.paste(im, ((TARGET_W - im.width) // 2, TARGET_H - im.height))   # 발을 바닥에 정렬

    if REF_PALETTE:
        # 적응형 양자화는 '비슷한 색끼리' 고르는 성질이 있어서, 캐릭터가 한 색 계열이면
        # 명도 층이 무너진다(실측: 전부 베이지가 되어 다리·부츠가 사라짐).
        # 레퍼런스 팔레트를 명도 순으로 강제 매핑하면 층이 보장된다.
        return cleanup(map_to_palette(canvas, REF_PALETTE))

    # 색 강제 양자화. 여기서 안티에일리어싱으로 생긴 중간색들이 제거된다
    q = canvas.quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.NONE)
    return cleanup(q.convert("RGB"))


def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def map_to_palette(im, palette):
    """원본의 명도 순위를 팔레트의 명도 순위에 대응시킨다.
    색상(hue)이 아니라 명도로 매핑하므로, 원본이 무슨 색이든 레퍼런스의 층 구조를 얻는다."""
    a = np.asarray(im).astype(float)
    L = 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
    pal = np.array(sorted(palette, key=lum), dtype=float)
    palL = 0.299 * pal[:, 0] + 0.587 * pal[:, 1] + 0.114 * pal[:, 2]

    # 원본 명도 범위를 팔레트 명도 범위로 선형 확장한 뒤 '가장 가까운 색'을 고른다.
    # 백분위 방식은 평평한 배경까지 여러 색으로 흩뿌린다(실측) — 반드시 최근접이어야 한다.
    lo, hi = np.percentile(L, 2), np.percentile(L, 98)
    Ln = np.clip((L - lo) / max(hi - lo, 1e-6), 0, 1) * (palL.max() - palL.min()) + palL.min()
    idx = np.abs(Ln[..., None] - palL[None, None, :]).argmin(axis=-1)
    return Image.fromarray(pal[idx].astype("uint8"))


def cleanup(im, passes=2):
    """축소 과정에서 생긴 1픽셀 얼룩을 제거한다.
    3×3 이웃의 최빈색으로 바꾸되, 자기 색이 이웃에 2개 이상 있으면 유지한다.
    (레퍼런스처럼 색 덩어리가 또렷해지도록. 안 하면 가장자리가 지저분하다)"""
    a = np.asarray(im).astype(int)
    h, w, _ = a.shape
    for _ in range(passes):
        out = a.copy()
        for y in range(1, h - 1):
            for x in range(1, w - 1):
                blk = a[y - 1:y + 2, x - 1:x + 2].reshape(-1, 3)
                vals, cnt = np.unique(blk, axis=0, return_counts=True)
                me = a[y, x]
                mine = cnt[np.all(vals == me, axis=1)]
                if mine.size and mine[0] >= 3:
                    continue                       # 덩어리의 일부면 유지
                out[y, x] = vals[np.argmax(cnt)]   # 고립된 점이면 이웃 최빈색으로
        a = out
    return Image.fromarray(a.astype("uint8"))


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else "newchar"
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 8
    colors = DEFAULT_COLORS
    if "--colors" in sys.argv:
        colors = int(sys.argv[sys.argv.index("--colors") + 1])
    if "--refpal" in sys.argv:
        global REF_PALETTE
        REF_PALETTE = load_ref_palette(n=colors)
        print(f"  레퍼런스 팔레트 {len(REF_PALETTE)}색 강제: {REF_PALETTE[:4]} ...")

    src_dir = os.path.join(HERE, src)
    out_dir = os.path.join(src_dir, "pixel")
    os.makedirs(out_dir, exist_ok=True)

    outs = []
    for i in range(1, n + 1):
        p = os.path.join(src_dir, f"run_f{i}.png")
        if not os.path.exists(p):
            continue
        r = pixelize(p, colors)
        r.save(os.path.join(out_dir, f"run_f{i}.png"))
        outs.append(r)
        uniq = len(np.unique(np.asarray(r).reshape(-1, 3), axis=0))
        print(f"  f{i}: {r.size}  유니크색 {uniq}")

    if not outs:
        return
    # 확대 비교 시트 + 애니메이션
    S = 6
    sheet = Image.new("RGB", (TARGET_W * S * len(outs), TARGET_H * S), (30, 30, 30))
    for i, o in enumerate(outs):
        sheet.paste(o.resize((TARGET_W * S, TARGET_H * S), Image.NEAREST), (i * TARGET_W * S, 0))
    sheet.save(os.path.join(out_dir, "_sheet.png"))
    big = [o.resize((TARGET_W * 4, TARGET_H * 4), Image.NEAREST) for o in outs]
    big[0].save(os.path.join(out_dir, "_run.gif"), save_all=True,
                append_images=big[1:], duration=100, loop=0)
    print(f"  -> {out_dir}/_sheet.png , _run.gif")


if __name__ == "__main__":
    main()
