"""바닥 타일셋 3종을 제미나이 텍스처 기반 D1.5 톤으로 **교체 생성**.

=== 결정 경과 ===
제미나이 텍스처 → 45° 회전 슬라이스 → 국소대비 완화(calm 0.85) → 감마 어둡게(D1.5)
  · 45° 회전: 원본의 직교 줄눈을 다이아몬드 변과 정렬시킨다. 안 하면 검은 십자선이 남음
  · calm: 국소대비 7.07 → 3.22. 바닥이 시끄러우면 32px 적이 묻힌다
  · D1.5(감마 1.45 / 대비 1.15): 평균명도 73.4 → 43.2.
    고블린 대비 2.3 → 32.5 로 개선(스프라이트를 얹어 눈으로도 확인함)

=== 3종을 **같은 소스**에서 만드는 이유 ===
stone 만 바꾸면 special(깨진·구멍)·moss 가 기존 청회색으로 남아 톤이 어긋난다.
(측정: 기존 stone R-B −18.7 / 신규는 초록 계열) → 세 장을 한 번에 생성한다.

=== 코드가 기대하는 규약 (main.js updateBackground) ===
  stone   : 16칸,  `hv % 16`
  special : 10칸,  0~5 = 깨진 타일, 6~9 = 구멍(void)   ← 순서 고정
  moss    : 16칸,  `hv % 16`
  셀 규격 : 128×64 (2:1 다이아몬드), 알파 포함

실행: python3 tools/sprites/apply_floor_d15.py
출력: public/sprites/dungeon/tileset_iso_{stone,special,moss}.png  (덮어씀)
      tools/sprites/_applied_preview.png                           (검토용)
⚠️ 기존 파일을 덮어쓴다. 되돌리려면 git 으로 복원하면 된다.
"""
import pathlib

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = pathlib.Path(__file__).resolve().parent
PUB = HERE.parent.parent / 'public' / 'sprites' / 'dungeon'
SRC = HERE / 'Gemini_Generated_Image_4dqzn84dqzn84dqz.png'
TW, TH = 128, 64
CROP = (96, 96, 928, 928)          # 비네트 60px + 워터마크(965,970) 회피
PATCH = 150                        # 다이아몬드 하나가 덮는 원본 영역
CALM, DARK = 0.85, 0.80            # 3_calm 설정
GAMMA, CONTRAST = 1.45, 1.15       # D1.5

src = Image.open(SRC).convert('RGB').crop(CROP)
SW, SH = src.size
GLOBAL_MEAN = np.asarray(src, float).mean()

cx, cy = TW / 2, TH / 2
yy, xx = np.mgrid[0:TH, 0:TW].astype(float)
DIAG = 1 - (np.abs((xx - cx) / cx) + np.abs((yy - cy) / cy))
INSIDE = DIAG > 0.02
ALPHA = np.clip((DIAG + 0.02) / 0.035, 0, 1) * 255


def to_rgba(tex):
    return Image.fromarray(
        np.dstack([np.clip(tex, 0, 255), np.clip(ALPHA, 0, 255)]).astype(np.uint8), 'RGBA')


def base_tex(patch, calm=CALM, dark=DARK):
    """패치 → 다이아몬드용 텍스처 배열(림·알파 적용 전)."""
    UP = 3
    big = patch.resize((patch.width * UP, patch.height * UP), Image.LANCZOS)
    big = big.rotate(45, resample=Image.BICUBIC, expand=False)
    m = int(min(big.size) / 2 / 1.42)
    c = (big.width // 2, big.height // 2)
    big = big.crop((c[0] - m, c[1] - m, c[0] + m, c[1] + m))

    big = big.resize((TW * 2, TH * 2), Image.LANCZOS).resize((TW, TH), Image.BOX)
    big = big.filter(ImageFilter.UnsharpMask(radius=1.2, percent=95, threshold=2))
    if calm > 0:
        big = Image.blend(big, big.filter(ImageFilter.GaussianBlur(1.1)), calm)
    tex = np.asarray(big, float)
    tex = (tex - tex.mean()) * 1.12 + tex.mean()
    tex *= 0.90 * dark
    tex += (GLOBAL_MEAN - tex.mean()) * 0.55
    return tex


def apply_d15(tex, gamma=GAMMA, contrast=CONTRAST):
    """감마로 어둡게 + 대비 보정. 단순 곱셈은 대비까지 줄여 탁해지므로 쓰지 않는다."""
    x = np.clip(tex, 0, 255) / 255.0
    x = x ** gamma
    m = x[INSIDE].mean()
    x = (x - m) * contrast + m
    return np.clip(x * 255, 0, 255)


def add_rim(tex, strength=44):
    rim = np.clip((0.10 - DIAG) / 0.10, 0, 1) * INSIDE
    return tex - rim[..., None] * strength


def patches(n, seed, score=None, pool=None):
    """랜덤 패치 n장. score 가 주어지면 pool 장을 뽑아 점수 상위 n장만 남긴다."""
    rg = np.random.default_rng(seed)
    cand = []
    for _ in range(pool or n):
        x = int(rg.integers(0, SW - PATCH))
        y = int(rg.integers(0, SH - PATCH))
        cand.append(src.crop((x, y, x + PATCH, y + PATCH)))
    if score is None:
        return cand[:n]
    cand.sort(key=score, reverse=True)
    return cand[:n]


def save_strip(tiles, path):
    strip = Image.new('RGBA', (TW * len(tiles), TH), (0, 0, 0, 0))
    for i, t in enumerate(tiles):
        strip.paste(t, (i * TW, 0), t)
    strip.save(path)
    return path


# ============================================================
# 1) stone — 16칸
# ============================================================
stone = [to_rgba(add_rim(apply_d15(base_tex(p)))) for p in patches(16, 7)]
save_strip(stone, PUB / 'tileset_iso_stone.png')

# ============================================================
# 2) special — 0~5 깨진 타일 / 6~9 구멍
#    깨진 타일: **원본에서 가장 거친 구역**을 골라 쓴다. 무작위로 뽑으면
#    멀쩡한 면이 섞여서 "깨졌다"가 안 읽힌다 → 국소대비 점수 상위만 채택.
# ============================================================
def roughness(p):
    L = np.asarray(p.convert('L'), float)
    return np.abs(np.diff(L, axis=1)).mean()


cracked = []
for p in patches(6, 21, score=roughness, pool=40):
    tex = apply_d15(base_tex(p, calm=0.6, dark=0.74))   # 덜 뭉개고 조금 더 어둡게
    # 갈라진 이음선 — 다이아몬드를 가로지르는 어두운 균열 2~3줄
    rg = np.random.default_rng(int(roughness(p) * 1000) % 9973)
    for _ in range(rg.integers(2, 4)):
        m = rg.uniform(-1.6, 1.6)
        off = rg.uniform(-0.3, 0.3)
        u = (xx - cx) / cx
        v = (yy - cy) / cy
        seam = np.abs(v - m * u - off) < rg.uniform(0.035, 0.075)
        tex[seam & INSIDE] *= 0.55
    cracked.append(to_rgba(add_rim(tex, 50)))

holes = []
for i in range(4):
    # 구멍 = 바닥이 없는 곳. 새 바닥과 같은 색조(초록기)로 아주 어둡게.
    rg = np.random.default_rng(500 + i)
    L = np.full((TH, TW), 0.035)
    band = np.clip((0.17 - DIAG) / 0.17, 0, 1) * INSIDE
    # 위/왼쪽 안쪽 벽에만 빛 → 파인 깊이감
    lip = band * (np.clip(-(yy - cy) / cy, 0, 1) * 0.95 +
                  np.clip(-(xx - cx) / cx, 0, 1) * 0.45)
    L += lip * 0.30
    nz = rg.normal(0, 1, (TH, TW))
    nz = np.asarray(Image.fromarray(((nz - nz.min()) / np.ptp(nz) * 255).astype(np.uint8))
                    .filter(ImageFilter.GaussianBlur(5)), float) / 255
    L += (nz - 0.5) * 0.025
    L = np.clip(L, 0, 1)
    # 새 바닥 색조에 맞춘 어두운 회녹색
    tex = np.dstack([L * 92 + 5, L * 100 + 6, L * 90 + 5])
    holes.append(to_rgba(tex))

save_strip(cracked + holes, PUB / 'tileset_iso_special.png')

# ============================================================
# 3) moss — 16칸.
#    ⚠️ 명도를 stone 과 비슷하게 유지한다. 예전 이끼 타일이 "너무 초록 잔디 같다"는
#    지적을 받은 이유가 명도까지 올렸기 때문이다. **색조만** 초록으로 기울인다.
# ============================================================
moss = []
for i, p in enumerate(patches(16, 33)):
    tex = apply_d15(base_tex(p))
    rg = np.random.default_rng(700 + i)
    blob = rg.normal(0, 1, (TH, TW))
    blob = np.asarray(Image.fromarray(((blob - blob.min()) / np.ptp(blob) * 255).astype(np.uint8))
                      .filter(ImageFilter.GaussianBlur(4)), float) / 255
    m = np.clip((blob - 0.45) * 2.4, 0, 1) * rg.uniform(0.55, 0.95)
    tex[..., 0] -= 7 * m      # R 낮추고
    tex[..., 1] += 11 * m     # G 올리고
    tex[..., 2] -= 6 * m      # B 낮춘다 → 명도는 거의 유지, 색조만 초록
    moss.append(to_rgba(add_rim(tex)))
save_strip(moss, PUB / 'tileset_iso_moss.png')


# ============================================================
# 검토용 미리보기 — 일반/깨짐/구멍/이끼 + 프롭 + 배우
# ============================================================
def cell_img(path, i, cw, ch, row=0):
    im = Image.open(path).convert('RGBA')
    return im.crop((i * cw, row * ch, (i + 1) * cw, (row + 1) * ch))


K = 0.11
gob = cell_img(PUB / 'enemies_sheet.png', 0, 32, 32).resize((35, 35), Image.NEAREST)
hound = cell_img(PUB / 'enemies_sheet.png', 0, 32, 32, row=1).resize((35, 35), Image.NEAREST)
eli = cell_img(PUB / 'elites_sheet.png', 0, 48, 48).resize((58, 58), Image.NEAREST)
plsp = Image.open(PUB / 'deliverables' / 'player_spritesheet.png').convert('RGBA')
player = plsp.crop((0, 0, 96, 116)).resize((53, 64), Image.NEAREST)
props = [cell_img(PUB / 'props_iso.png', i, 96, 112) for i in range(8)]

COLS, ROWS = 9, 12
PW = TW * COLS
PH = int(TH * (ROWS + COLS) / 2) + TH
img = Image.new('RGBA', (PW, PH), (10, 11, 13, 255))
for r in range(ROWS):
    for c in range(COLS):
        hv = ((c * 73856093) ^ (r * 19349663)) & 0xFFFFFFFF
        roll = hv % 100
        if roll >= 97:
            t = (cracked + holes)[6 + hv % 4]
        elif roll >= 85:
            t = (cracked + holes)[hv % 6]
        elif ((hv >> 12) % 100) < 30:
            t = moss[hv % 16]
        else:
            t = stone[hv % 16]
        if (hv >> 8) & 1:
            t = t.transpose(Image.FLIP_LEFT_RIGHT)
        img.alpha_composite(t, (int((c - r) * TW / 2) + PW // 2 - TW // 2,
                                int((c + r) * TH / 2)))

d = ImageDraw.Draw(img)
cxp, cyp = PW // 2, PH // 2
# 프롭 2개 (톤 충돌 확인용)
img.alpha_composite(props[0], (cxp - 250, cyp - 150))
img.alpha_composite(props[3], (cxp + 150, cyp - 60))


def put(sp, x, y):
    rr = sp.width * 0.42
    d.ellipse([x - rr, y - rr * 0.34, x + rr, y + rr * 0.34], fill=(0, 0, 0, 110))
    img.alpha_composite(sp, (int(x - sp.width / 2), int(y - sp.height * 0.72)))


for dx, dy in ((-170, -110), (-40, -160), (90, -120), (190, -40), (-100, 60), (60, 30)):
    put(gob if (dx + dy) % 2 else hound, cxp + dx, cyp + dy)
put(eli, cxp - 140, cyp - 30)
put(eli, cxp + 120, cyp + 60)
put(player, cxp, cyp)

v = Image.new('RGBA', (PW, PH), (0, 0, 0, 0))
vd = ImageDraw.Draw(v)
for i in range(90):
    al = int(150 * (1 - i / 90) ** 1.6)
    vd.line([(0, i), (PW, i)], fill=(6, 7, 10, al))
    vd.line([(0, PH - 1 - i), (PW, PH - 1 - i)], fill=(6, 7, 10, al))
Image.alpha_composite(img, v).convert('RGB').save(HERE / '_applied_preview.png')


# ---------- 수치 ----------
def stats(path, cw=TW):
    im = Image.open(path).convert('RGBA')
    a = np.asarray(im, float)
    m = a[..., 3] > 128
    rgb = a[..., :3][m]
    L = rgb.mean(1)
    Lg = np.asarray(im.convert('L'), float)
    return (im.width // cw, L.mean(), np.abs(np.diff(Lg, axis=1)).mean(),
            (rgb[:, 0] - rgb[:, 2]).mean(), (rgb[:, 1] - rgb[:, 0]).mean(),
            pathlib.Path(path).stat().st_size / 1024)


print(f'{"파일":26s}{"칸":>4}{"명도":>8}{"국소대비":>9}{"R-B":>7}{"G-R":>7}{"KB":>8}')
tot = 0
for f in ('tileset_iso_stone.png', 'tileset_iso_special.png', 'tileset_iso_moss.png',
          'decals_iso.png', 'props_iso.png'):
    cw = 96 if f == 'props_iso.png' else TW
    n, L, lc, rb, gr, kb = stats(PUB / f, cw)
    tot += kb
    print(f'{f:26s}{n:>4}{L:8.1f}{lc:9.2f}{rb:+7.1f}{gr:+7.1f}{kb:8.0f}')
print(f'{"합계":26s}{"":>4}{"":>8}{"":>9}{"":>7}{"":>7}{tot:8.0f}')
print(f'\n저장: {HERE / "_applied_preview.png"}')
