"""바닥 질감 샘플 — 레퍼런스(회녹색 파손 판석) 느낌을 코드로 얼마나 낼 수 있는지 확인용.

⚠️ 샘플 전용. **게임에 적용하지 않는다.** 출력도 public/ 밖에 둔다.

레퍼런스를 분해하면 이렇다:
  ① 아주 어두운 얇은 줄눈 + 타일마다 다른 기본 명도
  ② 큰 밝은 덩어리(드러난 석재)와 어두운 자갈 영역이 유기적 경계로 맞물림
  ③ 그 안에 잔 자갈 디테일
  ④ 좁은 회녹색 팔레트, 조명 방향 없음(플랫)
②③이 핵심인데 이건 **보로노이(셀룰러) 노이즈**로 만든다. 퍼린 노이즈로는
"깨진 돌 조각이 맞물린" 느낌이 안 나온다 — 경계가 흐릿해서 구름처럼 보인다.
보로노이는 셀 경계가 직선이라 파편처럼 읽힌다. 이게 이 스타일의 정체다.

실행: python3 tools/sprites/gen_floor_samples.py
출력: tools/sprites/_floor_samples.png (비교 시트)
"""
import pathlib

import numpy as np
from PIL import Image
from scipy.spatial import cKDTree

HERE = pathlib.Path(__file__).resolve().parent
S = 256                              # 타일 텍스처 원본 해상도
rng_global = np.random.default_rng(20260811)

# 레퍼런스에서 뽑은 회녹색 팔레트 (어두운 틈 → 밝은 석재)
PAL = np.array([
    [34, 38, 35],
    [52, 58, 53],
    [78, 85, 78],
    [110, 118, 110],
    [150, 158, 148],
], float)
PAL_L = np.array([0.0, 0.25, 0.5, 0.75, 1.0])
GROUT = np.array([18, 21, 19], float)


def to_rgb(L):
    return np.stack([np.interp(L, PAL_L, PAL[:, c]) for c in range(3)], -1)


def voronoi(size, n_sites, seed, wrap=True):
    """보로노이 — (셀 고유값, 경계 근접도) 를 돌려준다.
    wrap=True 면 사이트를 3×3으로 복제해 **상하좌우가 이어지는** 텍스처가 된다."""
    rg = np.random.default_rng(seed)
    pts = rg.random((n_sites, 2)) * size
    vals = rg.random(n_sites)                       # 셀마다 랜덤 명도
    if wrap:
        offs = np.array([[dx, dy] for dx in (-1, 0, 1) for dy in (-1, 0, 1)]) * size
        tiled = (pts[None, :, :] + offs[:, None, :]).reshape(-1, 2)
        tiled_vals = np.tile(vals, 9)
    else:
        tiled, tiled_vals = pts, vals

    yy, xx = np.mgrid[0:size, 0:size]
    q = np.stack([xx.ravel(), yy.ravel()], -1).astype(float)
    d, idx = cKDTree(tiled).query(q, k=2)            # 1·2순위 거리 → 경계 검출
    cell = tiled_vals[idx[:, 0]].reshape(size, size)
    # (2순위 - 1순위)가 작을수록 셀 경계 → 파편 사이 틈
    edge = (d[:, 1] - d[:, 0]).reshape(size, size)
    return cell, edge


def pillow(edge, k):
    """셀 경계에서 0, 내부로 갈수록 1 인 '높이맵'.
    1차 시도가 스테인드글라스처럼 납작했던 이유가 이게 없어서였다 —
    셀을 단색으로 채우면 유리 조각으로 보이고, **내부에 볼록한 음영**을 넣어야
    돌 조각으로 읽힌다(픽셀아트에서 pillow emboss 라고 부르는 기법)."""
    h = np.clip(edge / k, 0, 1) ** 0.55
    return h


def smooth_noise(size, cell, seed):
    """저주파 값노이즈 — 여러 타일에 걸친 큰 밝기 얼룩(물기·마모)을 만든다.
    레퍼런스에는 이 '넓은 반점'이 있는데 1차 시도엔 없어서 평평해 보였다."""
    n = max(2, size // cell)
    g = np.random.default_rng(seed).random((n + 1, n + 1))
    g[-1] = g[0]                                     # 상하좌우 이어지게
    g[:, -1] = g[:, 0]
    img = Image.fromarray((g * 255).astype(np.uint8)).resize((size, size), Image.BICUBIC)
    return np.asarray(img, float) / 255


def make_texture(rubble=1.0, seed=1, contrast=1.0):
    """rubble: 자갈 디테일 강도 / contrast: 큰 덩어리의 명암 대비"""
    # 3계층 보로노이 — 큰 파편 / 자갈 / 알갱이
    cellA, edgeA = voronoi(S, 22, seed * 7 + 1)
    cellB, edgeB = voronoi(S, 150, seed * 13 + 5)
    cellC, edgeC = voronoi(S, 620, seed * 31 + 9)

    # ① 넓은 밝기 얼룩 (타일 여러 개에 걸침)
    blotch = smooth_noise(S, 96, seed * 5 + 2)
    L = 0.34 + (blotch - 0.5) * 0.26          # 2차보다 어둡게 (던전 톤)

    # ①-b **파손 분포 마스크** — 이게 2차에 없어서 온 바닥이 균일하게 깨져 보였다.
    #   레퍼런스는 '멀쩡한 넓은 면'과 '심하게 부서진 구역'이 섞여 있다.
    #   저주파 노이즈로 그 구역을 만들고, 자갈 레이어에 곱해준다.
    dmg = smooth_noise(S, 58, seed * 11 + 4)
    dmg = np.clip((dmg - 0.34) * 2.3, 0.10, 1.35)

    # ② 파편별 기본 명도 — 대비를 낮게. 형태는 아래 음영이 만든다
    L += (cellA - 0.5) * 0.14 * contrast
    L += (cellB - 0.5) * 0.09 * rubble * dmg

    # ③ **볼록 음영** — 조각이 입체로 읽히게 하는 핵심
    hA, hB, hC = pillow(edgeA, 5.0), pillow(edgeB, 3.2), pillow(edgeC, 2.0)
    L += (hA - 0.5) * 0.15
    L += (hB - 0.5) * 0.16 * rubble * dmg
    L += (hC - 0.5) * 0.08 * rubble * dmg

    # ④ 아주 약한 방향광 — 완전 플랫이면 CG 같고, 강하면 아이소와 안 맞는다
    gy, gx = np.gradient(hB)
    L += (gx + gy) * 0.9 * rubble * dmg

    # ⑤ 조각 사이 틈 — 파손 구역에서만 깊게 파인다
    for edge, w, k in ((edgeA, 0.14, 1.6), (edgeB, 0.15, 1.5), (edgeC, 0.09, 1.3)):
        L -= np.clip(1.0 - edge / k, 0, 1) ** 2.0 * w * rubble * dmg

    # ⑥ 미세 그레인
    L += (np.random.default_rng(seed * 3).random((S, S)) - 0.5) * 0.05
    return np.clip(L, 0, 1)


def posterize_pixelate(L, levels=14, px=2):
    """색 단계를 줄이고 살짝 픽셀화 — 기존 픽셀아트 에셋과 톤을 맞춘다."""
    L = np.round(L * (levels - 1)) / (levels - 1)
    if px > 1:
        small = Image.fromarray((L * 255).astype(np.uint8)).resize(
            (S // px, S // px), Image.BOX)
        L = np.asarray(small.resize((S, S), Image.NEAREST), float) / 255
    return L


def square_tile(L, tiles=4, grout=2):
    """정사각 격자로 타일링 + 줄눈. 레퍼런스와 직접 비교하기 위한 형태."""
    cell = S // tiles
    img = np.zeros((S, S, 3))
    for r in range(tiles):
        for c in range(tiles):
            # 타일마다 기본 명도를 조금 다르게 → 격자가 개별 석재로 읽힌다
            off = (np.random.default_rng(r * 97 + c * 31).random() - 0.5) * 0.16
            sub = L[r * cell:(r + 1) * cell, c * cell:(c + 1) * cell]
            img[r * cell:(r + 1) * cell, c * cell:(c + 1) * cell] = to_rgb(
                np.clip(sub + off, 0, 1))
    # 줄눈 — 어두운 골 + 아래/오른쪽에 밝은 베벨.
    # 1차 시도는 픽셀을 흔들어서 '점선'처럼 보였다 → 선은 곧게, 굵기로 표현한다
    bevel = np.array([64, 70, 64], float)
    for i in range(1, tiles):
        base = i * cell
        for g in range(grout):
            r = np.clip(base + g, 0, S - 1)
            img[r, :] = GROUT
            img[:, r] = GROUT
        rb = np.clip(base + grout, 0, S - 1)
        img[rb, :] = img[rb, :] * 0.68 + bevel * 0.32      # 베벨(아주 엷게)
        img[:, rb] = img[:, rb] * 0.68 + bevel * 0.32
    return img


# --- 아이소 다이아몬드로 매핑 (실제 게임 형태) ---
TW, TH = 128, 64


def iso_tile(L):
    """정사각 텍스처를 2:1 다이아몬드로 잘라낸다. 게임에서 실제로 이렇게 보인다."""
    cx, cy = TW / 2, TH / 2
    yy, xx = np.mgrid[0:TH, 0:TW].astype(float)
    d = 1 - (np.abs((xx - cx) / cx) + np.abs((yy - cy) / cy))
    inside = d > 0.02
    # 텍스처를 다이아몬드 크기로 리샘플
    # 2배 크기로 리샘플 후 축소 — BOX 로 한 번에 줄이면 파편 디테일이 다 뭉개진다
    big = Image.fromarray((L * 255).astype(np.uint8)).resize((TW * 2, TH * 2), Image.LANCZOS)
    tex = np.asarray(big.resize((TW, TH), Image.BOX), float) / 255
    rgb = to_rgb(tex)
    rim = np.clip((0.09 - d) / 0.09, 0, 1) * inside
    rgb -= rim[..., None] * 26                       # 가장자리 살짝 어둡게(접지감)
    a = np.clip((d + 0.02) / 0.04, 0, 1) * 255
    return Image.fromarray(np.dstack([np.clip(rgb, 0, 255),
                                      np.clip(a, 0, 255)]).astype(np.uint8), 'RGBA')


# ============================================================
# 비교 시트 — 3가지 강도 × (정사각 / 아이소)
# ============================================================
VARIANTS = [
    ('A  차분함', dict(rubble=0.55, contrast=0.75, seed=3)),
    ('B  중간 (레퍼런스 근처)', dict(rubble=1.0, contrast=1.0, seed=7)),
    ('C  거칠게', dict(rubble=1.45, contrast=1.25, seed=11)),
]

PAD = 14
COL = S
sheet_w = PAD + (COL + PAD) * 3
sheet_h = PAD + 22 + S + PAD + 22 + TH * 3 + PAD
sheet = Image.new('RGB', (sheet_w, sheet_h), (16, 18, 20))

for i, (name, kw) in enumerate(VARIANTS):
    L = posterize_pixelate(make_texture(**kw))
    x0 = PAD + (COL + PAD) * i

    # 위: 정사각 4×4 타일링
    sq = square_tile(L)
    sheet.paste(Image.fromarray(sq.astype(np.uint8)), (x0, PAD + 22))

    # 아래: 같은 텍스처를 아이소 다이아몬드로 (게임 실제 형태)
    tile = iso_tile(L)
    base_y = PAD + 22 + S + PAD + 22
    for r in range(4):
        for c in range(3):
            sx = x0 + int((c - r) * TW / 2) + TW
            sy = base_y + int((c + r) * TH / 2) - TH
            if sx < x0 - TW or sx > x0 + COL or sy < base_y - TH or sy > base_y + TH * 3:
                continue
            sheet.paste(tile, (sx, sy), tile)

sheet.save(HERE / '_floor_samples.png')
print(f'saved {HERE / "_floor_samples.png"}  {sheet.size}')

# 참고 수치 — 레퍼런스와 팔레트/대비가 비슷한지 확인
for name, kw in VARIANTS:
    L = posterize_pixelate(make_texture(**kw))
    rgb = to_rgb(L)
    g = rgb.mean(-1)
    print(f'{name:24s} 평균명도 {g.mean():5.1f}  표준편차 {g.std():5.1f}  '
          f'범위 {g.min():.0f}~{g.max():.0f}')
