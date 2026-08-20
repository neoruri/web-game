"""새 몹 스프라이트를 enemies_sheet.png 에 반영한다 — 셀을 32px 에서 48px 로 올린다.

=== 확정된 것 ===
· 원본 4장 중 **f3·f4 만** 쓴다. 4장을 다 돌리면 보폭이 39·44 로 붙은 구간이
  정지처럼 보인다. f3·f4 는 보폭 44 / 31 로 갈린다.
· **꼬리는 고정**한다. 꼬리를 회전시켜 위상을 만드는 것도 해봤는데(±8°/±14°),
  나란히 놓고 보니 고정 쪽이 자연스러웠다.
· 시트 셀을 **48px** 로 올린다. 32px 로 담으면 원본 400px 를 12배 줄이게 되어
  뿔·발톱이 사라진다. 48px 면 화면 53px 에서 1.1배로 거의 원본 크기다.

=== 사냥개·궁수는 어떻게 되나 ===
셀만 커지고 **그림은 그대로**다. 기존 32px 그림을 48px 셀 안에 (8, 12) 위치로
그대로 붙인다. 그러면 피벗(0.72) 기준 상대 위치가 안 바뀌어서 화면에서 지금과
똑같이 35px 로 보인다. `ENEMY_SPRITE_K` 를 건드릴 필요가 없다.

    32px 셀 피벗 y = 32 × 0.72 = 23.04
    48px 셀 피벗 y = 48 × 0.72 = 34.56
    차이 11.52 → 세로 12px 내려 붙인다. 가로는 (48-32)/2 = 8.

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
SRC = HERE / 'monster_strips' / 'monster_walk.png'
SHEET = PUB / 'enemies_sheet.png'

OLD_CELL = 32
CELL = 48
COLS, ROWS = 4, 3
FOOT = 0.94              # 셀 안에서 발끝이 놓일 높이 비율
ORIGIN_Y = 0.72          # main.js setOrigin(0.5, 0.72)
PLAN = [2, 3, 2, 3]      # 원본 프레임 f3·f4 를 번갈아. 꼬리는 안 돌린다
PAD = 60


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


rgb, al = unmat(SRC)
solid = al > 0.35
lab, n = ndimage.label(solid)
sz = ndimage.sum(solid, lab, range(1, n + 1))
boxes = []
for k in [i + 1 for i in range(n) if sz[i] > 2000]:
    ys, xs = np.nonzero(lab == k)
    boxes.append((int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())))
boxes.sort()
print(f'{SRC.name}  프레임 {len(boxes)}개')
for i, (x0, x1, y0, y1) in enumerate(boxes):
    print(f'  f{i + 1}  {x1 - x0 + 1}×{y1 - y0 + 1}')

hmax = max(y1 - y0 + 1 for _, _, y0, y1 in boxes)


def frame_rgba(i):
    x0, x1, y0, y1 = boxes[i]
    arr = np.dstack([rgb[y0:y1 + 1, x0:x1 + 1],
                     al[y0:y1 + 1, x0:x1 + 1] * 255]).astype(float)
    return np.pad(arr, ((PAD, PAD), (PAD, PAD), (0, 0)))


# ---------------------------------------------------------------- 몹 행 조립
foot_y = round(CELL * FOOT)
prepped, xmin, xmax = [], 10 ** 9, -10 ** 9
for src in PLAN:
    arr = frame_rgba(src)
    xs = np.nonzero(arr[..., 3] > 90)[1]
    xmin, xmax = min(xmin, int(xs.min())), max(xmax, int(xs.max()))
    prepped.append(arr)

# ⚠️ 배율은 **네 장 공통**. 프레임마다 맞추면 재생 중에 커졌다 작아진다.
K = min(foot_y / hmax, CELL * 0.98 / (xmax - xmin + 1))
mid = (xmin + xmax) / 2

row0 = Image.new('RGBA', (CELL * COLS, CELL), (0, 0, 0, 0))
for i, arr in enumerate(prepped):
    im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')
    w, h = max(1, round(im.width * K)), max(1, round(im.height * K))
    # 2단계 축소 — 10배를 한 번에 줄이면 얇은 선이 통째로 사라진다
    im = im.resize((w * 2, h * 2), Image.LANCZOS).resize((w, h), Image.LANCZOS)
    ys = np.nonzero(np.asarray(im)[..., 3] > 90)[0]
    row0.paste(im, (round(i * CELL + CELL / 2 - mid * K), foot_y - int(ys.max()) - 1), im)

print(f'\n몹 행  배율 {K:.4f}  셀 {CELL}px  화면 {CELL * 0.11 * 10:.0f}px (반지름 10 기준)')

# ---------------------------------------------------------------- 시트 합치기
old = Image.open(SHEET).convert('RGBA')
assert old.size == (OLD_CELL * COLS, OLD_CELL * ROWS), f'기존 시트 규격이 다르다: {old.size}'

DX = (CELL - OLD_CELL) // 2                          # 8
DY = round(CELL * ORIGIN_Y) - round(OLD_CELL * ORIGIN_Y)   # 12 — 피벗을 맞춘다
print(f'기존 행 이동  가로 +{DX}px  세로 +{DY}px  (피벗 {ORIGIN_Y} 유지)')

sheet = Image.new('RGBA', (CELL * COLS, CELL * ROWS), (0, 0, 0, 0))
sheet.paste(row0, (0, 0), row0)
for r in (1, 2):                                     # 사냥개, 궁수
    for c in range(COLS):
        cellimg = old.crop((c * OLD_CELL, r * OLD_CELL,
                            (c + 1) * OLD_CELL, (r + 1) * OLD_CELL))
        sheet.paste(cellimg, (c * CELL + DX, r * CELL + DY), cellimg)

if '--write' in sys.argv:
    bak = SHEET.with_name('enemies_sheet_32_old.png')
    if not bak.exists():
        old.save(bak)
        print(f'원본 백업 → {bak.name}')
    sheet.save(SHEET)
    print(f'저장 → {SHEET.name}  {sheet.size}')
else:
    print('\n(--write 없음 — 시트는 안 건드렸다)')

# ---------------------------------------------------------------- 검증
a = np.asarray(sheet)[..., 3] > 90
print(f'\n{"행":>3}{"열":>4}{"키":>6}{"발끝y":>7}{"가장자리":>9}')
names = ['몹(신규)', '사냥개', '궁수']
for r in range(ROWS):
    bots, tops, edge = [], [], 0
    for c in range(COLS):
        s = a[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL]
        ys = np.nonzero(s)[0]
        bots.append(int(ys.max()))
        tops.append(int(ys.min()))
        if s[:, 0].any() or s[:, -1].any() or s[0].any() or s[-1].any():
            edge += 1
    print(f'{r:>3}  {names[r]:<8} 키 {[b - t + 1 for b, t in zip(bots, tops)]}  '
          f'발끝 {bots}  접지편차 {max(bots) - min(bots)}px  가장자리닿음 {edge}')

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
    d.line([(12, y + foot_y * Z), (12 + big.width, y + foot_y * Z)], fill=(180, 90, 112))
    d.line([(12, y + round(CELL * ORIGIN_Y) * Z), (12 + big.width, y + round(CELL * ORIGIN_Y) * Z)],
           fill=(84, 132, 190))
    d.text((14, y + 3), names[r], fill=(150, 160, 170))
for c in range(1, COLS):
    d.line([(12 + c * CELL * Z, 26), (12 + c * CELL * Z, 26 + big.height)], fill=(58, 64, 74))
pv.save(HERE / '_enemies_new.png')
print(f'\nsaved _enemies_new.png  {pv.size}')
