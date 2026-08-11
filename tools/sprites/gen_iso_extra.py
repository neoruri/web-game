"""맵 다양화용 추가 타일 — 3종 시트 생성.
  tileset_iso_special.png : 10칸 = 깨진타일 6 + 구멍(void) 4      ← 드물게 섞어 특별하게
  tileset_iso_moss.png    : 16칸 = 이끼 대역(biome) 용 변형        ← 저주파 노이즈로 구역 전환
규격은 기존과 동일: 셀 128×64, 가로 스트립, 알파 포함.
"""
import numpy as np
from PIL import Image, ImageFilter

TW, TH = 128, 64
rng = np.random.default_rng(31)

cx, cy = TW / 2, TH / 2
yy, xx = np.mgrid[0:TH, 0:TW].astype(float)
xd = (xx - cx) / (TW / 2)
yd = (yy - cy) / (TH / 2)
d = 1 - (np.abs(xd) + np.abs(yd))
ang = np.arctan2(yd, xd)

# 기존 석재 팔레트(gen_iso_tiles.py와 동일 계열)
PAL_STONE = np.array([
    [30, 35, 42], [40, 47, 56], [50, 58, 68], [62, 71, 82], [76, 87, 99]], float)
# 이끼 대역 — 같은 명도, 초록으로 기울임(대역이 바뀐 게 보이되 튀지 않게)
PAL_MOSS = np.array([
    [29, 35, 39], [38, 47, 49], [47, 57, 58], [58, 70, 68], [71, 85, 82]], float)
CTRL_L = np.array([0.00, 0.18, 0.42, 0.70, 1.00])


def to_rgb(L, pal):
    return np.stack([np.interp(L, CTRL_L, pal[:, c]) for c in range(3)], -1)


def base_tile(pal, damage=0.0, moss=0.0):
    """damage 0=온전 … 1=심하게 깨짐. moss>0 이면 초록 얼룩 추가."""
    ph = rng.uniform(0, 6.28, 4)
    wob = (0.018 * np.sin(2 * ang + ph[0]) + 0.014 * np.sin(3 * ang + ph[1])
           + 0.010 * np.sin(5 * ang + ph[2]) + 0.008 * np.sin(7 * ang + ph[3]))
    # 깨진 타일은 윤곽을 더 들쭉날쭉하게 + 안쪽으로 더 파먹음
    inset = 0.028 + wob + damage * (0.05 + 0.05 * np.sin(6 * ang + ph[0]))
    if damage > 0.4:  # 큰 결손 한 군데
        ca = rng.uniform(-3.14, 3.14)
        bite = np.exp(-((((ang - ca + 3.14) % 6.28) - 3.14) ** 2) / 0.25) * 0.22 * damage
        inset = inset + bite
    stone = d > inset
    hgt = np.clip((d - inset) / 0.55, 0, 1) ** 0.6
    dome = np.array(Image.fromarray((hgt * 255).astype(np.uint8))
                    .filter(ImageFilter.GaussianBlur(1.1))) / 255.0
    L = 0.44 + 0.22 * dome
    gy, gx = np.gradient(dome)
    L += (gx + gy) * 1.4
    rim = np.clip((0.08 - (d - inset)) / 0.08, 0, 1) * stone
    L -= rim * 0.22
    L += rng.uniform(-0.07, 0.07) - damage * 0.10          # 깨진 건 조금 어둡게

    # 마모 얼룩
    wr = rng.normal(0, 1, (TH, TW))
    wr = np.array(Image.fromarray(((wr - wr.min()) / np.ptp(wr) * 255).astype(np.uint8))
                  .filter(ImageFilter.GaussianBlur(6))) / 255.0
    L += (wr - 0.5) * 0.12

    # 크랙 — damage에 비례해 많고 진하게
    for _ in range(int(1 + damage * 6)):
        x0 = rng.uniform(cx - 34, cx + 34); y0 = rng.uniform(cy - 16, cy + 16)
        a0 = rng.uniform(0, 6.28)
        for _ in range(rng.integers(10, 24)):
            x0 += np.cos(a0); y0 += np.sin(a0)
            ix, iy = int(x0), int(y0)
            if 0 <= ix < TW and 0 <= iy < TH and stone[iy, ix]:
                L[iy, ix] -= 0.10 + 0.18 * damage
            a0 += rng.uniform(-0.5, 0.5)
    # 깨진 타일: 쪼개진 이음선
    if damage > 0.3:
        for _ in range(rng.integers(1, 3)):
            m = rng.uniform(-1.4, 1.4)
            off = rng.uniform(-0.25, 0.25)
            seam = np.abs(yd - m * xd - off) < 0.045
            L[seam & stone] -= 0.20

    L = np.clip(L, 0, 1)
    rgb = to_rgb(L, pal)

    # 이끼 얼룩 (biome 타일)
    if moss > 0:
        mz = rng.normal(0, 1, (TH, TW))
        mz = np.array(Image.fromarray(((mz - mz.min()) / np.ptp(mz) * 255).astype(np.uint8))
                      .filter(ImageFilter.GaussianBlur(4))) / 255.0
        m = np.clip((mz - 0.5) * 2.2, 0, 1) * moss
        for ch, tint in enumerate([-5, 9, -4]):
            rgb[..., ch] += tint * m

    a = np.clip((d - inset + 0.04) / 0.04, 0, 1) * 255
    return Image.fromarray(
        np.dstack([np.clip(rgb, 0, 255), np.clip(a, 0, 255)]).astype(np.uint8), 'RGBA'
    ).filter(ImageFilter.SMOOTH)


def hole_tile():
    """바닥이 없는 구멍 — 어두운 공백 + 위쪽 안쪽 테두리에 빛(깊이감)."""
    inset = 0.02
    inside = d > inset
    L = np.full((TH, TW), 0.02)
    # 안쪽 벽: 위/좌 테두리에 살짝 밝은 띠 → 파인 느낌
    band = np.clip((0.16 - (d - inset)) / 0.16, 0, 1) * inside
    lip = band * (np.clip(-yd, 0, 1) * 0.9 + np.clip(-xd, 0, 1) * 0.4)
    L += lip * 0.32
    # 바닥 깊은 곳 약한 노이즈
    nz = rng.normal(0, 1, (TH, TW))
    nz = np.array(Image.fromarray(((nz - nz.min()) / np.ptp(nz) * 255).astype(np.uint8))
                  .filter(ImageFilter.GaussianBlur(5))) / 255.0
    L += (nz - 0.5) * 0.03
    L = np.clip(L, 0, 1)
    rgb = to_rgb(L, PAL_STONE) * 0.62 + np.array([3, 4, 7])                      # 전체적으로 더 어둡게
    a = np.clip((d - inset + 0.04) / 0.04, 0, 1) * 255
    return Image.fromarray(
        np.dstack([np.clip(rgb, 0, 255), np.clip(a, 0, 255)]).astype(np.uint8), 'RGBA'
    ).filter(ImageFilter.SMOOTH)


def build(path, tiles):
    sheet = Image.new('RGBA', (TW * len(tiles), TH), (0, 0, 0, 0))
    for i, t in enumerate(tiles):
        sheet.paste(t, (i * TW, 0), t)
    sheet.save(path)
    return sheet


# --- special: 깨진 6 + 구멍 4 (index 0~5 = 깨짐, 6~9 = 구멍) ---
special = [base_tile(PAL_STONE, damage=rng.uniform(0.45, 0.95)) for _ in range(6)]
special += [hole_tile() for _ in range(4)]
build('tileset_iso_special.png', special)

# --- moss biome: 16 ---
moss = [base_tile(PAL_MOSS, damage=rng.uniform(0, 0.25), moss=rng.uniform(0.45, 0.9))
        for _ in range(16)]
build('tileset_iso_moss.png', moss)

# --- 미리보기: 대역 + 변형 섞인 바닥 ---
stone = Image.open('tileset_iso_stone.png').convert('RGBA')
S = [stone.crop((i * TW, 0, i * TW + TW, TH)) for i in range(16)]
M = [Image.open('tileset_iso_moss.png').convert('RGBA').crop((i * TW, 0, i * TW + TW, TH))
     for i in range(16)]
SP = [Image.open('tileset_iso_special.png').convert('RGBA').crop((i * TW, 0, i * TW + TW, TH))
      for i in range(10)]

PW, PH = 760, 460
prev = Image.new('RGBA', (PW, PH), (11, 14, 19, 255))


def h32(a, b):
    return ((a * 73856093) ^ (b * 19349663)) & 0xFFFFFFFF


def vnoise(c, r, cell=7):
    """저주파 value noise(바이리니어) — 대역 경계를 부드럽게."""
    gx, gy = c / cell, r / cell
    x0, y0 = int(np.floor(gx)), int(np.floor(gy))
    tx, ty = gx - x0, gy - y0
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty)
    def v(a, b): return (h32(a + 7919, b + 104729) % 1000) / 1000.0
    v00, v10 = v(x0, y0), v(x0 + 1, y0)
    v01, v11 = v(x0, y0 + 1), v(x0 + 1, y0 + 1)
    return (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty


for r in range(-2, 22):
    for c in range(-2, 16):
        sx = int((c - r) * (TW / 2) + PW / 2 - TW / 2)
        sy = int((c + r) * (TH / 2) - 60)
        if sx < -TW or sx > PW or sy < -TH or sy > PH:
            continue
        hv = h32(c, r)
        roll = hv % 100
        # 대역 경계를 디더링 — 임계값 근처에서는 확률적으로 섞어 직선 경계를 없앤다
        nv = vnoise(c, r)
        band = (nv - 0.55) / 0.10                          # -1..1 정도의 경계 거리
        moss_here = band > 0 if abs(band) > 1 else ((hv >> 20) % 100) / 100.0 < (band + 1) / 2
        if roll < 85:
            t = (M if moss_here else S)[hv % 16]
        elif roll < 97:
            t = SP[hv % 6]                                 # 깨진 타일 12%
        else:
            t = SP[6 + (hv % 4)]                           # 구멍 3%
        if (hv >> 8) & 1:
            t = t.transpose(Image.FLIP_LEFT_RIGHT)
        prev.alpha_composite(t, (sx, sy))
prev.convert('RGB').save('_iso_extra_preview.png')
print('done: special(10) + moss(16) + preview')
