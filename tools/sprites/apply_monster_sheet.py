"""잡몹 시트(enemies_sheet.png)를 통째로 다시 만든다 — 48px 셀.

=== 이 스크립트가 유일한 진실이다 ===
시트를 손으로 고치지 말 것. 항상 여기서 원본 스트립부터 다시 굽는다.
그래서 몇 번을 돌려도 같은 결과가 나온다(멱등).

=== 행 구성 ===
    행 0  몹(붉은 짐승)   monster_walk.png   f3·f4 두 장을 번갈아
    행 1  사냥개 자리     monster2_walk.png  f1~f4 그대로
    행 2  궁수            옛 32px 그림 그대로

=== 셀을 48px 로 올린 이유 ===
새 그림 원본이 400px 다. 32px 셀에 담으면 12배 축소라 뿔·발톱이 사라진다.
48px 이면 화면 53px 에서 1.1배, 거의 원본 크기다.

=== 옛 그림(궁수)은 어떻게 되나 ===
셀만 커지고 **그림은 그대로**다. 32px 그림을 48px 셀 안에 (8, 12) 위치로 붙인다.
피벗(0.72) 기준 상대 위치가 안 바뀌므로 화면에서 지금과 똑같이 35px 로 보인다.
덕분에 `ENEMY_SPRITE_K` 를 건드릴 필요가 없다.

    32px 셀 피벗 y = 32 × 0.72 = 23.04
    48px 셀 피벗 y = 48 × 0.72 = 34.56
    차이 11.52  →  세로 12px 내려 붙인다. 가로는 (48-32)/2 = 8

실행: python3 tools/sprites/apply_monster_sheet.py
      python3 tools/sprites/apply_monster_sheet.py --write
출력: tools/sprites/_enemies_new.png            (조립 미리보기)
      public/sprites/dungeon/enemies_sheet.png  (--write 일 때만)
"""
import pathlib
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = pathlib.Path(__file__).resolve().parent
PUB = HERE.parent.parent / 'public' / 'sprites' / 'dungeon'
STRIPS = HERE / 'monster_strips'
SHEET = PUB / 'enemies_sheet.png'
OLD32 = PUB / 'enemies_sheet_32_old.png'      # 옛 32px 시트. 궁수 행을 여기서 가져온다

OLD_CELL = 32
CELL = 48
COLS, ROWS = 4, 3
FOOT = 0.94              # 셀 안에서 발끝이 놓일 높이 비율
ORIGIN_Y = 0.72          # main.js setOrigin(0.5, 0.72)
PAD = 60

# (행, 이름, 스트립, 원본프레임 순서 0부터).  스트립이 None 이면 옛 32px 그림을 옮겨 담는다.
#   행 0 — 4장을 다 돌리면 보폭 39·44 구간이 정지처럼 보여 f3·f4 만 번갈아 쓴다
#   행 1 — 4장 다 쓴다. f4 는 most_walk2-1.png f2 로 갈아끼운 뒤 중복이 풀렸다
PLAN = [
    (0, '몹(짐승)', 'monster_walk.png', [2, 3, 2, 3]),
    (1, '몹(랩터)', 'monster2_walk.png', [0, 1, 2, 3]),
    (2, '궁수', None, None),
]


def unmat(path):
    """초록 언매팅. 얇은 부분(꼬리 끝·뿔)을 살리려고 greenness 로 알파를 추정한다."""
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float64)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    core = (G > 170) & (R < 140) & (B < 140)
    BG = a[core].mean(axis=0)

    def greenness(x):
        return x[..., 1] - (x[..., 0] + x[..., 2]) / 2

    gv = greenness(a)
    g_bg = greenness(BG[None, None, :])[0, 0]
    g_fg = np.percentile(gv[~core], 92)
    al = np.clip((g_bg - gv) / (g_bg - g_fg), 0, 1)
    al[core] = 0.0
    a3 = al[..., None]
    with np.errstate(invalid='ignore', divide='ignore'):
        un = np.where(a3 > 0.02, (a - (1 - a3) * BG[None, None, :]) / np.maximum(a3, 1e-6), 0)
    return np.clip(un, 0, 255), al


def load_frames(fname):
    """스트립을 프레임별 RGBA 배열(여백 포함)로."""
    rgb, al = unmat(STRIPS / fname)
    solid = al > 0.35
    lab, n = ndimage.label(solid)
    sz = ndimage.sum(solid, lab, range(1, n + 1))
    boxes = []
    for k in [i + 1 for i in range(n) if sz[i] > 2000]:
        ys, xs = np.nonzero(lab == k)
        boxes.append((int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())))
    boxes.sort()
    out = []
    for x0, x1, y0, y1 in boxes:
        arr = np.dstack([rgb[y0:y1 + 1, x0:x1 + 1],
                         al[y0:y1 + 1, x0:x1 + 1] * 255]).astype(float)
        out.append(np.pad(arr, ((PAD, PAD), (PAD, PAD), (0, 0))))
    return out


def build_row(fname, order):
    """한 행(4칸)을 만든다."""
    frames = load_frames(fname)
    print(f'  {fname}  프레임 {len(frames)}개 → 순서 {[i + 1 for i in order]}')
    picked = [frames[i] for i in order]

    foot_y = round(CELL * FOOT)
    # ⚠️ 배율·중심은 **네 칸 공통**. 칸마다 맞추면 재생 중에 커졌다 작아졌다 한다.
    #    그리고 bbox 가 아니라 이 공통 기준을 써야 몸이 좌우로 안 튄다.
    hmax = 0
    xmin, xmax = 10 ** 9, -10 ** 9
    for arr in picked:
        ys, xs = np.nonzero(arr[..., 3] > 90)
        hmax = max(hmax, int(ys.max() - ys.min() + 1))
        xmin, xmax = min(xmin, int(xs.min())), max(xmax, int(xs.max()))
    # ⚠️ 0.98 로 두면 반올림 때문에 꼬리·주둥이가 **옆 칸을 1~2px 침범한다.**
    #    침범하면 그 칸의 실측 접지가 흔들려서(옆 칸 픽셀이 섞임) 검증도 못 믿게 된다.
    k = min(foot_y / hmax, CELL * 0.92 / (xmax - xmin + 1))
    mid = (xmin + xmax) / 2

    row = Image.new('RGBA', (CELL * COLS, CELL), (0, 0, 0, 0))
    for i, arr in enumerate(picked):
        im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')
        w, h = max(1, round(im.width * k)), max(1, round(im.height * k))
        # 2단계 축소 — 10배를 한 번에 줄이면 얇은 선이 통째로 사라진다
        im = im.resize((w * 2, h * 2), Image.LANCZOS).resize((w, h), Image.LANCZOS)
        ys = np.nonzero(np.asarray(im)[..., 3] > 90)[0]
        row.paste(im, (round(i * CELL + CELL / 2 - mid * k), foot_y - int(ys.max()) - 1), im)
    print(f'    배율 {k:.4f}  셀 안 최대 키 {round(hmax * k)}px  화면 {CELL * 0.11 * 10:.0f}px')
    return row


# ---------------------------------------------------------------- 조립
old = Image.open(OLD32 if OLD32.exists() else SHEET).convert('RGBA')
assert old.size == (OLD_CELL * COLS, OLD_CELL * ROWS), f'옛 시트 규격이 다르다: {old.size}'
DX = (CELL - OLD_CELL) // 2                                 # 8
DY = round(CELL * ORIGIN_Y) - round(OLD_CELL * ORIGIN_Y)    # 12

sheet = Image.new('RGBA', (CELL * COLS, CELL * ROWS), (0, 0, 0, 0))
names = []
for r, label, fname, order in PLAN:
    names.append(label)
    print(f'행 {r}  {label}')
    if fname is None:
        print(f'  옛 32px 그림을 그대로 (+{DX}, +{DY}) 옮겨 담는다')
        for c in range(COLS):
            cellimg = old.crop((c * OLD_CELL, r * OLD_CELL,
                                (c + 1) * OLD_CELL, (r + 1) * OLD_CELL))
            sheet.paste(cellimg, (c * CELL + DX, r * CELL + DY), cellimg)
    else:
        row = build_row(fname, order)
        sheet.paste(row, (0, r * CELL), row)

if '--write' in sys.argv:
    if not OLD32.exists():
        old.save(OLD32)
        print(f'\n원본 백업 → {OLD32.name}')
    sheet.save(SHEET)
    print(f'저장 → {SHEET.name}  {sheet.size}')
else:
    print('\n(--write 없음 — 시트는 안 건드렸다)')

# ---------------------------------------------------------------- 검증
a = np.asarray(sheet)[..., 3] > 90
print(f'\n{"행":>3} {"이름":<10}{"키":<22}{"접지편차":>9}{"가장자리":>9}')
for r in range(ROWS):
    tops, bots, edge = [], [], 0
    for c in range(COLS):
        s = a[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL]
        ys = np.nonzero(s)[0]
        tops.append(int(ys.min()))
        bots.append(int(ys.max()))
        if s[:, 0].any() or s[:, -1].any() or s[0].any() or s[-1].any():
            edge += 1
    hs = [b - t + 1 for t, b in zip(tops, bots)]
    print(f'{r:>3} {names[r]:<10}{str(hs):<22}{max(bots) - min(bots):>7}px{edge:>8}개')

# ---------------------------------------------------------------- 미리보기
Z = 6
pv = Image.new('RGB', (sheet.width * Z + 24, sheet.height * Z + 46), (24, 25, 29))
d = ImageDraw.Draw(pv)
d.text((10, 6), f'enemies_sheet.png  {CELL}px 셀 × {COLS}열 × {ROWS}행 — '
                f'분홍선 = 접지, 파란선 = 피벗({ORIGIN_Y})', fill=(203, 212, 208))
big = sheet.resize((sheet.width * Z, sheet.height * Z), Image.NEAREST)
pv.paste(big, (12, 26), big)
for r in range(ROWS):
    y = 26 + r * CELL * Z
    d.line([(12, y + round(CELL * FOOT) * Z), (12 + big.width, y + round(CELL * FOOT) * Z)],
           fill=(180, 90, 112))
    d.line([(12, y + round(CELL * ORIGIN_Y) * Z),
            (12 + big.width, y + round(CELL * ORIGIN_Y) * Z)], fill=(84, 132, 190))
    d.text((14, y + 3), f'행{r} {names[r]}', fill=(150, 160, 170))
for c in range(1, COLS):
    d.line([(12 + c * CELL * Z, 26), (12 + c * CELL * Z, 26 + big.height)], fill=(58, 64, 74))
pv.save(HERE / '_enemies_new.png')
print(f'\nsaved _enemies_new.png  {pv.size}')
