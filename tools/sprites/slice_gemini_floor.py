"""제미나이가 만든 바닥 텍스처 → 아이소 다이아몬드 타일셋으로 변환.

=== 왜 "심리스"를 안 만드는가 ===
처음엔 심리스 처리를 하려 했는데, 이 게임 구조에서는 **불필요하다.**
아이소 바닥은 각 다이아몬드가 **독립 스프라이트**로 그려진다(기존 tileset_iso_stone.png
도 그렇다). 타일끼리 픽셀이 이어질 필요가 없고, 연속감은 "톤이 비슷한 것"에서 온다.
→ 큰 원본에서 **서로 다른 패치 16장을 뽑아** 각각 다이아몬드로 만들면
   반복 패턴 없이 변형이 확보된다. 심리스 문제 자체가 사라진다.

=== 원본에서 걷어내야 하는 것 (실측으로 확인) ===
  · 테두리 비네트 약 60px — 프롬프트에서 금지했는데도 모델이 넣었다
  · 우하단 (965, 970) 부근 워터마크
  · 격자 간격이 83~107px 로 불규칙 → 격자 기준 크롭은 불가
→ 중앙 832×832 만 사용한다(위 셋 모두 회피).

실행: python3 tools/sprites/slice_gemini_floor.py
출력: tools/sprites/_gemini_iso_preview.png   (검토용)
      tools/sprites/tileset_iso_gemini.png    (16칸 스트립, 적용은 아직 안 함)
"""
import pathlib

import numpy as np
from PIL import Image, ImageFilter

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE / 'Gemini_Generated_Image_4dqzn84dqzn84dqz.png'
TW, TH = 128, 64          # 기존 타일 규격과 동일
NVAR = 16                 # 기존 tileset_iso_stone.png 과 같은 변형 수

# 원본에서 안전 영역만 — 비네트 60px + 워터마크(965,970) 회피
CROP = (96, 96, 928, 928)

src = Image.open(SRC).convert('RGB').crop(CROP)
SW, SH = src.size
arr = np.asarray(src, float)
GLOBAL_MEAN = arr.mean()
print(f'안전 영역 {SW}x{SH}  평균명도 {GLOBAL_MEAN:.1f}')

rng = np.random.default_rng(4242)

# 다이아몬드 마스크 (2:1)
cx, cy = TW / 2, TH / 2
yy, xx = np.mgrid[0:TH, 0:TW].astype(float)
DIAG = 1 - (np.abs((xx - cx) / cx) + np.abs((yy - cy) / cy))


def make_tile(patch, rotate45, calm=0.0, darken=1.0):
    """정사각 패치 → 2:1 다이아몬드 타일.

    rotate45=True 면 45° 회전 후 눌러서 돌 결이 아이소 축과 맞게 한다
    (원본의 직교 줄눈이 다이아몬드 변과 평행해진다). 대신 보간 때문에 살짝 흐려진다.
    """
    p = patch
    if rotate45:
        # 회전은 **고해상도에서** 한다. 원본 크기에서 돌리면 보간 때문에 흐려져
        # 1차 시도가 뿌옇게 나왔다 → 3배로 키워 회전하고 중앙을 잘라낸다.
        UP = 3
        big = p.resize((p.width * UP, p.height * UP), Image.LANCZOS)
        big = big.rotate(45, resample=Image.BICUBIC, expand=False)
        m = int(min(big.size) / 2 / 1.42)          # 회전으로 빈 코너를 피해 안쪽만
        c = (big.width // 2, big.height // 2)
        p = big.crop((c[0] - m, c[1] - m, c[0] + m, c[1] + m))

    # 2배 해상도로 눌러서 만든 뒤 축소 — 한 번에 줄이면 디테일이 뭉개진다
    big = p.resize((TW * 2, TH * 2), Image.LANCZOS)
    big = big.resize((TW, TH), Image.BOX)
    # 회전·리샘플로 잃은 선명도를 되돌린다(과하면 노이즈가 튀므로 약하게)
    big = big.filter(ImageFilter.UnsharpMask(radius=1.2, percent=95, threshold=2))

    # calm: 잔 디테일만 눌러 '국소 대비'를 낮춘다. 큰 명암은 유지.
    #   바닥의 국소 대비가 높으면 32px 적 스프라이트가 묻힌다 —
    #   이전 타일셋에서 "그물망 같다"는 지적을 받은 게 정확히 이 문제였다.
    if calm > 0:
        soft = big.filter(ImageFilter.GaussianBlur(1.1))
        big = Image.blend(big, soft, calm)
    tex = np.asarray(big, float)
    tex = (tex - tex.mean()) * 1.12 + tex.mean()
    tex *= 0.90 * darken

    # 타일마다 밝기를 전역 평균으로 절반쯤 끌어당긴다.
    # 완전히 맞추면 변형이 사라지고, 안 하면 유난히 밝은 타일이 조명처럼 튄다.
    tex += (GLOBAL_MEAN - tex.mean()) * 0.55

    # 가장자리 어둡게 — 다이아몬드 변이 곧 '줄눈'이 된다(기존 타일셋과 같은 방식)
    rim = np.clip((0.10 - DIAG) / 0.10, 0, 1) * (DIAG > 0.02)
    tex -= rim[..., None] * 44   # 림을 강하게 — 다이아몬드 격자가 또렷이 읽히게

    a = np.clip((DIAG + 0.02) / 0.035, 0, 1) * 255
    return Image.fromarray(
        np.dstack([np.clip(tex, 0, 255), np.clip(a, 0, 255)]).astype(np.uint8), 'RGBA')


def sample_patches(size, n, seed):
    rg = np.random.default_rng(seed)
    out = []
    for _ in range(n):
        x = int(rg.integers(0, SW - size))
        y = int(rg.integers(0, SH - size))
        out.append(src.crop((x, y, x + size, y + size)))
    return out


# --- A안(그냥 누름) vs B안(45° 회전 후 누름) 비교 시트 ---
PATCH = 150               # 다이아몬드 하나가 덮는 원본 영역. 원본 줄눈 간격(83~107)보다 크게
patches = sample_patches(PATCH, NVAR, 7)

# A안(그냥 누름)은 탈락 — 원본의 직교 줄눈이 다이아몬드를 가로질러 검은 선으로 남았다.
# 45° 회전하면 줄눈이 다이아몬드 변과 정렬돼 아이소 석재로 제대로 읽힌다.
sets = {
    '1_full': [make_tile(p, True) for p in patches],
    '2_toned': [make_tile(p, True, calm=0.55, darken=0.88) for p in patches],
    '3_calm': [make_tile(p, True, calm=0.85, darken=0.80) for p in patches],
}


def lay_floor(tiles, cols=7, rows=9):
    """아이소 바닥으로 깔아본다 — 반복이 보이는지 확인하는 게 목적."""
    Wp = TW * cols
    Hp = int(TH * (rows + cols) / 2) + TH
    img = Image.new('RGBA', (Wp, Hp), (14, 16, 18, 255))
    for r in range(rows):
        for c in range(cols):
            # 좌표 해시로 변형 선택 — 게임 코드와 같은 방식(스크롤해도 안 바뀜)
            hv = ((c * 73856093) ^ (r * 19349663)) & 0xFFFFFFFF
            t = tiles[hv % len(tiles)]
            sx = int((c - r) * TW / 2) + Wp // 2 - TW // 2
            sy = int((c + r) * TH / 2)
            img.alpha_composite(t, (sx, sy))
    return img


from PIL import ImageDraw
PAD, LAB = 14, 24
cur_im = Image.open(HERE.parent.parent / 'public/sprites/dungeon/tileset_iso_stone.png').convert('RGBA')
cur = [cur_im.crop((i * TW, 0, (i + 1) * TW, TH)) for i in range(16)]
panels = [('CURRENT', cur)] + [(k, v) for k, v in sets.items()]
floors = [(n, lay_floor(t, cols=6, rows=8)) for n, t in panels]
fw, fh = floors[0][1].size
sheet = Image.new('RGB', (PAD + (fw + PAD) * len(floors), PAD + LAB + fh + PAD), (14, 16, 18))
d = ImageDraw.Draw(sheet)
for i, (n, f) in enumerate(floors):
    x = PAD + (fw + PAD) * i
    d.text((x + 4, PAD), n, fill=(170, 185, 175))
    sheet.paste(f.convert('RGB'), (x, PAD + LAB))
sheet.save(HERE / '_gemini_iso_preview.png')

# --- 스트립 시트도 저장 (적용은 아직 안 함) ---
for k, tiles in sets.items():
    strip = Image.new('RGBA', (TW * NVAR, TH), (0, 0, 0, 0))
    for i, t in enumerate(tiles):
        strip.paste(t, (i * TW, 0), t)
    strip.save(HERE / f'tileset_iso_gemini_{k}.png')

print(f'saved _gemini_iso_preview.png  {sheet.size}')
def stats(tiles):
    a = [np.asarray(t.convert('RGB'), float) for t in tiles]
    m = np.mean([x[np.asarray(t)[:, :, 3] > 128].mean() for x, t in zip(a, tiles)])
    noise = np.mean([np.abs(np.diff(np.asarray(t.convert('L'), float), axis=1)).mean()
                     for t in tiles])
    return m, noise


print()
print(f'{"":10s}{"평균명도":>9}{"국소대비":>9}   (국소대비 높으면 적이 묻힌다)')
cm, cn = stats(cur)
print(f'{"현재":10s}{cm:9.1f}{cn:9.2f}')
for k, tiles in sets.items():
    m, n = stats(tiles)
    kb = (HERE / f'tileset_iso_gemini_{k}.png').stat().st_size / 1024
    print(f'{k:10s}{m:9.1f}{n:9.2f}   {kb:.0f}KB')
