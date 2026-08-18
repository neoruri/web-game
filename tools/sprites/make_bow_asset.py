"""활을 **별도 스프라이트**로 뽑는다 — 플레이어 시트와 같은 배율로.

=== 왜 활만 따로인가 ===
확정 시안 `gem_N2_c` 는 활을 캐릭터 옆에 별도 오브젝트로 그려왔고, 손은 비어 있다.
그대로 간다. 이유가 셋이다.

  1. 활을 손에 들면 **팔이 스윙을 못 한다.** 이전 시안들이 활을 앞으로 뻗고 있어서
     달리기 자세 자체가 불가능했다
  2. run 6프레임마다 활을 다시 그릴 필요가 없다 → 활 형태가 프레임마다 안 흔들린다
  3. 코드에서 각도를 줄 수 있다. 발사할 때 살짝 들거나 반동을 주는 게 한 줄이다

=== 배율을 맞춰야 한다 ===
`build_player_sheet.py` 는 캐릭터를 셀에 맞춰 축소한다. 실측:

    캐릭터 원본 191×711  →  셀 안에서 높이 106px      배율 0.1491
    활 원본     80×545   →  같은 배율로 11.9 × 81.3px

이 배율을 안 맞추면 활만 크거나 작게 보인다.

실행: python3 tools/sprites/make_bow_asset.py
출력: public/sprites/player/bow.png      게임용 (알파 PNG)
      tools/sprites/_bow_asset.png       확인용 (플레이어 옆에 붙여봄)
"""
import pathlib

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = pathlib.Path(__file__).resolve().parent
CANDS = HERE / 'cands'
OUT = HERE.parent.parent / 'public' / 'sprites' / 'player'
OUT.mkdir(parents=True, exist_ok=True)

SHEET = HERE / '_player_sheet_new.png'
CW, CH, ANCHOR = 96, 116, 108

# ---- 손잡이 위치 (활 높이 대비) ------------------------------------------
# 활을 어디서 잡느냐. 0.5 면 정중앙. 실제 활은 중앙보다 살짝 아래를 잡는다.
GRIP_Y = 0.52
# --------------------------------------------------------------------------


def cutout(p):
    a = np.asarray(Image.open(p).convert('RGBA')).astype(float)
    R, G, B, A = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    fg = A > 90 if A.min() < 250 else ~((G > 130) & (R < 160) & (B < 160)
                                        & (G - np.maximum(R, B) > 45))
    fg = ndimage.binary_opening(fg, np.ones((3, 3), bool))
    lab, n = ndimage.label(fg)
    if n > 1:
        sz = ndimage.sum(fg, lab, range(1, n + 1))
        fg = lab == (1 + int(np.argmax(sz)))
    ys, xs = np.nonzero(fg)
    box = (slice(ys.min(), ys.max() + 1), slice(xs.min(), xs.max() + 1))
    return a[..., :3][box], fg[box]


# 시트 안 캐릭터 높이로 배율을 역산한다 — 조립 스크립트가 쓴 값과 같아진다
sh = np.asarray(Image.open(SHEET).convert('RGBA'))
m = sh[0:CH, 0:CW, 3] > 90
cy = np.nonzero(m)[0]
cell_h = cy.max() - cy.min() + 1

_, cfg = cutout(CANDS / '_split_char.png')
K = cell_h / cfg.shape[0]
print(f'캐릭터 원본 {cfg.shape[1]}×{cfg.shape[0]}  →  셀 안 {cell_h}px   배율 {K:.4f}')

brgb, bfg = cutout(CANDS / '_split_bow.png')
bw, bh = round(bfg.shape[1] * K), round(bfg.shape[0] * K)
print(f'활 원본     {bfg.shape[1]}×{bfg.shape[0]}  →  {bw}×{bh}px')

bow = Image.fromarray(np.dstack([brgb, bfg * 255.0]).astype(np.uint8), 'RGBA')
bow = bow.resize((bw, bh), Image.LANCZOS)
bow.save(OUT / 'bow.png')
print(f'\nsaved {OUT.relative_to(HERE.parent.parent)}/bow.png  {bow.size}')

grip_x, grip_y = bw // 2, round(bh * GRIP_Y)
print(f'손잡이(원점) 권장  x={grip_x}  y={grip_y}   → setOrigin({grip_x / bw:.2f}, {GRIP_Y:.2f})')

# ---------------------------------------------------------------- 확인용
# 시트 첫 칸(idle) 옆에 활을 붙여 크기가 맞는지 본다.
Z = 5
cell = Image.fromarray(sh[0:CH, 0:CW], 'RGBA')
canvas = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
canvas.alpha_composite(cell)
# 손 높이 = 셀 안 허리쯤(접지선에서 위로 46px). 코드에서 조정할 값이라 대략치다
hand_x, hand_y = 62, ANCHOR - 46
canvas.alpha_composite(bow, (hand_x - grip_x, hand_y - grip_y))

sheet = Image.new('RGB', (CW * Z * 2 + 60, CH * Z + 54), (26, 26, 30))
d = ImageDraw.Draw(sheet)
d.text((8, 6), '왼쪽 = 플레이어만  /  오른쪽 = 활을 코드로 겹친 것 (크기 비교용)',
       fill=(200, 210, 205))
bg = Image.new('RGBA', (CW, CH), (40, 42, 46, 255))
for i, im in enumerate((cell, canvas)):
    c = Image.alpha_composite(bg, im).convert('RGB')
    sheet.paste(c.resize((CW * Z, CH * Z), Image.NEAREST), (20 + i * (CW * Z + 20), 28))
sheet.save(HERE / '_bow_asset.png')
print(f'saved _bow_asset.png  {sheet.size}')

print(f"""
── main.js 붙이는 법 (참고) ─────────────────────────────
  this.load.image('bow', 'sprites/player/bow.png')

  // 플레이어 뒤에 깔면 몸에 가려지고, 앞에 두면 항상 보인다.
  // 활은 앞손에 있으므로 **플레이어보다 앞**이 자연스럽다.
  this.bowSprite = this.add.image(0, 0, 'bow')
    .setOrigin({grip_x / bw:.2f}, {GRIP_Y:.2f})
    .setScale(scale)              // 플레이어와 같은 scale 을 쓴다
  worldLayer.add(this.bowSprite)  // playerSprite 다음에 add

  // 매 프레임: 손 위치에 맞춘다. flipX 는 부호로 처리
  const s = this.playerSprite.scaleX
  this.bowSprite.setPosition(px + {hand_x - CW / 2:.0f} * s, py + {hand_y - ANCHOR:.0f} * scale)
  this.bowSprite.setScale(scale * Math.sign(s), scale)
─────────────────────────────────────────────────────────
⚠️ hand_x / hand_y 는 **대략치**다. 애니 테스트에서 눈으로 맞춰야 한다.
   run 프레임마다 손 위치가 달라서, 필요하면 프레임별 오프셋 배열을 둔다.""")
