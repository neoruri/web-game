"""새 캐릭터 시안 3종 검수 — 잘라내 64px 로 줄인 뒤 게임 장면에 세운다.

⚠️ 측정은 **반드시 64px 로 줄인 스프라이트에서** 한다.
   원본 시트 전체에서 국소 대비를 재면 평평한 배경이 평균을 끌어내려
   레퍼런스 비교값(10.01 / 14.60 / 16.30)과 비교가 안 된다. 1차 시도에서 이 실수를 했다.

실행: python3 tools/sprites/_check_cands.py
출력: tools/sprites/_cands_scene.png
"""
import collections
import pathlib

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = pathlib.Path(__file__).resolve().parent
PUB = HERE.parent.parent / 'public' / 'sprites' / 'dungeon'
UP = pathlib.Path('/sessions/kind-laughing-dirac/mnt/uploads')
TW, TH, CW, CH = 128, 64, 96, 112
TARGET_H = 64
FLOOR_L = 40.9

CANDS = [
    ('C1 GPT', 'Codex 이미지 2026년 8월 13일 오후 12_15_00.png'),
    ('C2 제미나이', 'Gemini_Generated_Image_xur73mxur73mxur7.png'),
    ('C3 제미나이', 'Gemini_Generated_Image_xur73mxur73mxur7 (1).png'),
]


def cutout(path):
    """배경 제거 → 주 인물.

    ⚠️ 1차 시도 실패: 연결 요소를 그냥 라벨링하면 **몸통과 불꽃·활이 끊겨서**
       C1 이 26×64(세로로 긴 조각 하나)로 잡혔다.
    → 라벨링 전에 팽창(dilate)해 조각들을 붙이고, '키 큰 것' 대신
      **면적이 가장 큰 요소**를 고른다. 인물이 항상 최대 면적이다.
    """
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(int)
    modal = np.array(collections.Counter(
        map(tuple, a.reshape(-1, 3)[::13])).most_common(1)[0][0])
    # ⚠️ 2차 시도 실패: 색거리 60 으로 잡으니 GPT 시안의 **회녹색 망토가 배경으로 먹혔다**
    #    (망토 60,66,55 vs 배경 42,42,42 → 거리 55 < 60). 인물이 31px 조각으로 남았다.
    # → 배경은 **완전 중성색**이라는 점을 이용한다. 채널 차이가 거의 없고 명도가 모달에 근접.
    neutral = (np.abs(a[..., 0] - a[..., 1]) < 9) & (np.abs(a[..., 1] - a[..., 2]) < 9)
    near = neutral & (np.abs(a.mean(axis=2) - modal.mean()) < 16)
    lab, _ = ndimage.label(near)
    bset = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
    bset.discard(0)
    fg = ndimage.binary_opening(~np.isin(lab, list(bset)), np.ones((3, 3)))
    glue = ndimage.binary_dilation(fg, np.ones((13, 13)))   # 조각 붙이기
    lab2, _ = ndimage.label(glue)
    if lab2.max() == 0:
        return Image.open(path).convert('RGBA')
    sizes = ndimage.sum(fg, lab2, range(1, lab2.max() + 1))
    k = int(np.argmax(sizes)) + 1
    sl = ndimage.find_objects(lab2 == k)[0]
    al = np.where(fg, 255, 0)
    rgba = Image.fromarray(np.dstack([a, al]).astype(np.uint8), 'RGBA')
    return rgba.crop((sl[1].start, sl[0].start, sl[1].stop, sl[0].stop))


def glow_hue(img):
    """발광부 색조를 실측해 이름을 붙인다 — 파일명으로 추정하지 않는다."""
    import colorsys
    a = np.asarray(img).astype(int)
    m = a[..., 3] > 128
    px = a[..., :3][m]
    mx = px.max(axis=1).astype(float)
    mn = px.min(axis=1).astype(float)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    g = (sat > 0.35) & (mx > 110)
    if g.sum() < 10:
        return None, 0
    h = colorsys.rgb_to_hsv(*(px[g].mean(axis=0) / 255))[0] * 360
    return h, 100 * g.mean()


def to_game(img):
    w = max(1, round(img.width * TARGET_H / img.height))
    return img.resize((w * 2, TARGET_H * 2), Image.LANCZOS).resize((w, TARGET_H), Image.LANCZOS)


figs = []
for n, f in CANDS:
    g = to_game(cutout(UP / f))
    h, _ = glow_hue(g)
    tag = '자마젠타' if h is None or h > 260 else ('청람' if h > 200 else f'{h:.0f}도')
    figs.append((f'{n} {tag}', g))
pl = Image.open(PUB / 'deliverables' / 'player_spritesheet.png').convert('RGBA')
figs.insert(0, ('현재 (기준)', pl.crop((0, 0, 96, 116)).resize((53, 64), Image.NEAREST)))

# ---------- 장면 ----------
stone = Image.open(PUB / 'tileset_iso_stone.png').convert('RGBA')
stones = [stone.crop((i * TW, 0, (i + 1) * TW, TH)) for i in range(stone.width // TW)]
props = Image.open(PUB / 'props_iso.png').convert('RGBA')
pc = [props.crop((i * CW, 0, (i + 1) * CW, CH)) for i in range(8)]
gob = Image.open(PUB / 'enemies_sheet.png').convert('RGBA').crop((0, 0, 32, 32)) \
    .resize((35, 35), Image.NEAREST)
eli = Image.open(PUB / 'elites_sheet.png').convert('RGBA').crop((0, 0, 48, 48)) \
    .resize((58, 58), Image.NEAREST)
SW, SH = 300, 260


def scene(fig):
    img = Image.new('RGBA', (SW, SH), (10, 11, 13, 255))
    for r in range(-2, SH // TH + 4):
        for c in range(-2, SW // TW + 6):
            hv = ((c * 73856093) ^ (r * 19349663)) & 0xFFFFFFFF
            t = stones[hv % len(stones)]
            if (hv >> 8) & 1:
                t = t.transpose(Image.FLIP_LEFT_RIGHT)
            img.alpha_composite(t, (int((c - r) * TW / 2), int((c + r) * TH / 2)))
    for f, x, y in ((0, 42, 96), (3, 250, 104), (6, 152, 74)):
        if f == 6:
            gl = Image.new('RGBA', img.size, (0, 0, 0, 0))
            gd = ImageDraw.Draw(gl)
            for rr in range(110, 4, -2):
                gd.ellipse([x - rr, y - 10 - rr * .45, x + rr, y - 10 + rr * .45],
                           fill=(255, 176, 92, int(26 * (1 - rr / 110) ** 1.4)))
            img = Image.alpha_composite(img, gl)
        img.alpha_composite(pc[f], (x - CW // 2, y - (CH - 1)))
    d = ImageDraw.Draw(img)

    def put(sp, x, y):
        rr = sp.width * .42
        d.ellipse([x - rr, y - rr * .32, x + rr, y + rr * .32], fill=(0, 0, 0, 105))
        img.alpha_composite(sp, (int(x - sp.width / 2), int(y - sp.height)))

    put(gob, 60, 180)
    put(gob, 240, 168)
    put(eli, 214, 226)
    put(gob, 92, 238)
    put(fig, SW // 2, 202)
    img.alpha_composite(pc[7], (150 - CW // 2, 248 - (CH - 1)))
    v = Image.new('RGBA', img.size, (0, 0, 0, 0))
    vd = ImageDraw.Draw(v)
    for i in range(58):
        al = int(150 * (1 - i / 58) ** 1.6)
        vd.line([(0, i), (SW, i)], fill=(6, 7, 10, al))
        vd.line([(0, SH - 1 - i), (SW, SH - 1 - i)], fill=(6, 7, 10, al))
    return Image.alpha_composite(img, v)


Z, PAD, LAB = 3, 10, 24
panels = [(n, scene(f)) for n, f in figs]
sheet = Image.new('RGB', (PAD + (SW * Z + PAD) * len(panels), PAD + LAB + SH * Z + PAD),
                  (16, 17, 19))
d = ImageDraw.Draw(sheet)
for i, (n, p) in enumerate(panels):
    x = PAD + (SW * Z + PAD) * i
    d.text((x + 4, PAD + 4), n, fill=(205, 218, 210))
    sheet.paste(p.convert('RGB').resize((SW * Z, SH * Z), Image.NEAREST), (x, PAD + LAB))
sheet.save(HERE / '_cands_scene.png')
print('saved _cands_scene.png', sheet.size)

# ---------- 64px 스프라이트에서 측정 (레퍼런스와 동일 조건) ----------
import colorsys
print()
print(f'{"":22}{"크기":>9}{"몸통명도":>9}{"바닥차":>8}{"국소대비":>9}{"발광%":>7}{"색조":>7}')
for n, f in figs:
    a = np.asarray(f).astype(int)
    m = a[..., 3] > 128
    px = a[..., :3][m]
    mx = px.max(axis=1).astype(float)
    mn = px.min(axis=1).astype(float)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    gmask = (sat > 0.35) & (mx > 110)
    body = px[~gmask]
    # 국소 대비는 불투명 영역만 — 배경이 평균을 끌어내리지 않게
    L = np.asarray(f.convert('L'), float)
    aa = a[..., 3] > 128
    dx = np.abs(np.diff(L, axis=1))
    valid = aa[:, :-1] & aa[:, 1:]
    lc = dx[valid].mean() if valid.any() else 0
    hue = '-'
    if gmask.sum() > 10:
        g = px[gmask].mean(axis=0) / 255
        hue = f'{colorsys.rgb_to_hsv(*g)[0] * 360:.0f}도'
    print(f'{n:22}{f"{f.width}x{f.height}":>9}{body.mean():9.1f}'
          f'{body.mean() - FLOOR_L:+8.1f}{lc:9.2f}{100 * gmask.mean():7.1f}{hue:>7}')
print()
print('합격선: 몸통명도 50~58 (바닥차 +10~25) · 국소대비 14 이상')
print('레퍼런스 실측: REF1 14.60 / REF2 16.30 / 현재 시트 10.01')
