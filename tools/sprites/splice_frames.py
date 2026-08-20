"""여러 스트립에서 프레임을 골라 새 스트립으로 이어붙인다.

=== 왜 필요한가 ===
AI 가 4장을 그려줘도 그 중 두 장이 사실상 같은 자세인 경우가 있다. monster2 실측:

    프레임 유사도(IoU)  평균 0.43 인데  f1↔f3 0.61,  f2↔f4 0.77

이러면 순서를 바꿔봐야 소용없다. **문제 프레임만 다른 생성본에서 가져와 갈아끼우는**
편이 전체를 다시 받는 것보다 빠르다.

배경 초록은 **받는 쪽 스트립의 실제 배경색**으로 채운다. 언매팅이 배경색을 추정하는데
색이 섞이면 알파가 어긋난다.

실행:
    python3 tools/sprites/splice_frames.py monster2 monster2:1 monster2:2 monster2:3 most_walk2-1:2

    첫 인자 = 출력 이름(monster_strips/<이름>_walk.png 로 저장, 기존 파일은 백업)
    이후 인자 = <파일이름>:<프레임번호>  (파일이름은 _walk.png 를 뺀 것, 번호는 1부터)
                파일이름이 most_walk2-1 처럼 규칙에서 벗어나면 그대로도 받는다
"""
import pathlib
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = pathlib.Path(__file__).resolve().parent
STRIPS = HERE / 'monster_strips'
GAP = 60          # 프레임 사이 간격. 분리 스크립트가 다시 나눌 수 있을 만큼 넉넉히


def find(path):
    """스트립에서 인물 덩어리를 x 순으로 찾는다."""
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(float)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    fg = ndimage.binary_opening(~((G > 110) & (G - np.maximum(R, B) > 40)),
                                np.ones((3, 3), bool))
    lab, n = ndimage.label(fg)
    sz = ndimage.sum(fg, lab, range(1, n + 1))
    boxes = []
    for k in [i + 1 for i in range(n) if sz[i] > 2000]:
        ys, xs = np.nonzero(lab == k)
        boxes.append((int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())))
    boxes.sort()
    bg = a[(G > 170) & (R < 140) & (B < 140)].mean(axis=0)
    return im, boxes, bg


def resolve(name):
    for cand in (STRIPS / f'{name}_walk.png', STRIPS / f'{name}.png'):
        if cand.exists():
            return cand
    raise SystemExit(f'없는 파일: {name}')


if len(sys.argv) < 3:
    raise SystemExit(__doc__)

out_name = sys.argv[1]
specs = []
for tok in sys.argv[2:]:
    src, _, idx = tok.rpartition(':')
    specs.append((resolve(src), int(idx) - 1))

cache = {}
picked = []
for path, i in specs:
    if path not in cache:
        cache[path] = find(path)
    im, boxes, bg = cache[path]
    if i >= len(boxes):
        raise SystemExit(f'{path.name} 에는 프레임이 {len(boxes)}개뿐이다 (요청 {i + 1})')
    x0, x1, y0, y1 = boxes[i]
    picked.append((path.name, i, im.crop((x0, y0, x1 + 1, y1 + 1))))
    print(f'{path.name}  f{i + 1}  {x1 - x0 + 1}×{y1 - y0 + 1}')

# 배경색은 **첫 소스** 것으로 통일한다. 조각마다 다른 초록을 쓰면 언매팅이 흔들린다.
BG = tuple(int(v) for v in cache[specs[0][0]][2])
print(f'\n배경색 {BG} (첫 소스 기준)')

H = max(c.height for _, _, c in picked) + 80
W = sum(c.width for _, _, c in picked) + GAP * (len(picked) + 1)
sheet = Image.new('RGB', (W, H), BG)
x = GAP
# ⚠️ 발끝(아래끝)을 맞춰 붙인다. 위끝으로 맞추면 뿔·꼬리 높이 차이만큼 캐릭터가 뜬다.
base = H - 40
for _, _, c in picked:
    sheet.paste(c, (x, base - c.height))
    x += c.width + GAP

dst = STRIPS / f'{out_name}_walk.png'
if dst.exists():
    bak = STRIPS / f'{out_name}_walk_orig.png'
    if not bak.exists():
        Image.open(dst).save(bak)
        print(f'원본 백업 → {bak.name}')
sheet.save(dst)
print(f'저장 → {dst.name}  {sheet.size}  프레임 {len(picked)}개')

# ---------------------------------------------------------------- 미리보기
Z = 4
pv = Image.new('RGB', (W // Z, H // Z + 26), (24, 25, 29))
pv.paste(sheet.resize((W // Z, H // Z), Image.LANCZOS), (0, 22))
d = ImageDraw.Draw(pv)
d.text((8, 5), f'{dst.name} — ' + '  /  '.join(f'f{i + 1}←{n} f{j + 1}'
                                               for i, (n, j, _) in enumerate(picked)),
       fill=(203, 212, 208))
pv.save(HERE / f'_splice_{out_name}.png')
print(f'saved _splice_{out_name}.png  {pv.size}')
