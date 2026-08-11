"""적 스프라이트 3종 — 실루엣으로 즉시 구분되게 설계.
  row0 normal  = 고블린      (직립, 뾰족귀, 몽둥이 / 초록)
  row1 rusher  = 사냥개      (네발, 가로로 낮은 실루엣 / 어두운 갈색+붉은눈)  ← 형태가 완전히 다름
  row2 shooter = 활 든 고블린 (직립+활, 황토 후드 포인트 / 초록)
출력: enemies_sheet.png (3행 × 4프레임, 셀 32×32, 알파)
설계 원칙: 어두운 바닥에서도 읽히도록 **밝은 외곽선** 필수. 안티에일리어싱 없음(픽셀 선명).
"""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

CELL = 32
FRAMES = 4
ROWS = ['goblin', 'hound', 'archer']

# 팔레트 (구분 최우선: 색 + 실루엣 동시 차별화)
GOB_SKIN   = (108, 156, 74);  GOB_SKIN_D = (72, 112, 50)
GOB_CLOTH  = (86, 66, 52);    GOB_CLOTH_D = (58, 44, 34)
HOUND_FUR  = (96, 74, 62);    HOUND_FUR_D = (62, 46, 38)
ARCH_HOOD  = (176, 142, 66);  ARCH_HOOD_D = (128, 100, 44)
WOOD       = (150, 112, 66)
EYE_RED    = (232, 92, 78)
EYE_YEL    = (246, 220, 120)
OUTLINE    = (18, 22, 28)      # 안쪽 어두운 라인
RIM        = (196, 214, 200)   # 바깥 밝은 림(가독성 핵심)


def px(d, x, y, w, h, c):
    d.rectangle([x, y, x + w - 1, y + h - 1], fill=c)


# ---------- 고블린 (직립 · 몽둥이) ----------
def goblin(d, f):
    bob = [0, -1, 0, 1][f]          # 상하 반동
    sw = [0, 1, 0, -1][f]           # 팔/다리 스윙
    y = 6 + bob
    # 귀 (뾰족 — 고블린 식별 포인트)
    px(d, 7, y + 3, 3, 2, GOB_SKIN_D)
    px(d, 22, y + 3, 3, 2, GOB_SKIN_D)
    # 머리
    px(d, 10, y, 12, 8, GOB_SKIN)
    px(d, 10, y + 6, 12, 2, GOB_SKIN_D)
    # 눈
    px(d, 13, y + 3, 2, 2, EYE_YEL)
    px(d, 18, y + 3, 2, 2, EYE_YEL)
    # 몸통
    px(d, 11, y + 9, 10, 8, GOB_CLOTH)
    px(d, 11, y + 14, 10, 3, GOB_CLOTH_D)
    # 팔 + 몽둥이
    px(d, 8, y + 10, 3, 5, GOB_SKIN)
    px(d, 21, y + 10 + sw, 3, 5, GOB_SKIN)
    px(d, 23, y + 6 + sw, 3, 6, WOOD)          # 몽둥이
    px(d, 22, y + 5 + sw, 5, 3, WOOD)
    # 다리
    px(d, 12, y + 17, 3, 5 + (sw > 0), GOB_SKIN_D)
    px(d, 18, y + 17, 3, 5 + (sw < 0), GOB_SKIN_D)


# ---------- 사냥개 (네발 · 가로로 낮게) ----------
def hound(d, f):
    lope = [0, -1, 0, 1][f]
    y = 13 + lope                    # 낮은 실루엣 = 즉시 구분
    # 몸통 (가로로 길게)
    px(d, 8, y, 16, 7, HOUND_FUR)
    px(d, 8, y + 5, 16, 2, HOUND_FUR_D)
    # 머리 (앞쪽으로 낮게 뻗음)
    px(d, 21, y - 2, 8, 6, HOUND_FUR)
    px(d, 27, y + 1, 3, 3, HOUND_FUR_D)        # 주둥이
    px(d, 22, y - 4, 2, 3, HOUND_FUR_D)        # 귀
    px(d, 25, y, 2, 2, EYE_RED)                # 붉은 눈 = 위험 신호
    # 꼬리
    px(d, 4, y - 2, 5, 2, HOUND_FUR_D)
    # 네 다리 (교차 스윙)
    a, b = (0, 2) if f % 2 == 0 else (2, 0)
    px(d, 10, y + 7, 3, 4 + a, HOUND_FUR_D)
    px(d, 14, y + 7, 3, 4 + b, HOUND_FUR_D)
    px(d, 19, y + 7, 3, 4 + a, HOUND_FUR_D)
    px(d, 22, y + 7, 3, 4 + b, HOUND_FUR_D)


# ---------- 활 든 고블린 (직립 + 활) ----------
def archer(d, f):
    bob = [0, -1, 0, 1][f]
    y = 6 + bob
    draw_pull = f in (2, 3)          # 활 당기는 모션
    # 후드 (황토색 = 원거리 식별 포인트)
    px(d, 9, y, 14, 8, ARCH_HOOD)
    px(d, 9, y + 6, 14, 2, ARCH_HOOD_D)
    px(d, 11, y - 2, 10, 3, ARCH_HOOD_D)
    # 얼굴 그림자 + 눈
    px(d, 12, y + 3, 8, 4, (30, 36, 30))
    px(d, 13, y + 4, 2, 2, EYE_YEL)
    px(d, 17, y + 4, 2, 2, EYE_YEL)
    # 몸통 (마른 체형)
    px(d, 12, y + 9, 8, 8, GOB_CLOTH)
    px(d, 12, y + 14, 8, 3, GOB_CLOTH_D)
    # 활 (세로 아치 — 실루엣 핵심)
    bx = 24 if not draw_pull else 25
    px(d, bx, y + 4, 2, 12, WOOD)
    px(d, bx - 1, y + 3, 2, 2, WOOD)
    px(d, bx - 1, y + 16, 2, 2, WOOD)
    px(d, bx + 1, y + 5, 1, 10, (216, 226, 220))     # 활줄
    if draw_pull:                                     # 화살 장전
        px(d, 18, y + 9, 7, 1, (236, 226, 190))
    # 팔
    px(d, 20, y + 9, 4, 3, GOB_SKIN)
    px(d, 9, y + 10, 3, 5, GOB_SKIN)
    # 다리
    px(d, 13, y + 17, 3, 5, GOB_SKIN_D)
    px(d, 17, y + 17, 3, 5, GOB_SKIN_D)


DRAW = {'goblin': goblin, 'hound': hound, 'archer': archer}


def outline(img):
    """안쪽 어두운 라인 + 바깥 밝은 림. 어두운 바닥에서 실루엣이 확실히 읽히게."""
    a = img.split()[3].point(lambda p: 255 if p > 60 else 0)
    grow1 = a.filter(ImageFilter.MaxFilter(3))
    ring_dark = Image.fromarray(np.array(grow1).astype(np.int16) - np.array(a).astype(np.int16))
    grow2 = grow1.filter(ImageFilter.MaxFilter(3))
    ring_rim = Image.fromarray(np.array(grow2).astype(np.int16) - np.array(grow1).astype(np.int16))

    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    rim = Image.new('RGBA', img.size, RIM + (150,))
    dark = Image.new('RGBA', img.size, OUTLINE + (235,))
    out.paste(rim, (0, 0), ring_rim.convert('L'))
    out.paste(dark, (0, 0), ring_dark.convert('L'))
    return Image.alpha_composite(out, img)


sheet = Image.new('RGBA', (CELL * FRAMES, CELL * len(ROWS)), (0, 0, 0, 0))
for r, name in enumerate(ROWS):
    for f in range(FRAMES):
        cell = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
        DRAW[name](ImageDraw.Draw(cell), f)
        cell = outline(cell)
        sheet.paste(cell, (f * CELL, r * CELL), cell)
sheet.save('enemies_sheet.png')

# 개별 스트립도 저장
for r, name in enumerate(ROWS):
    sheet.crop((0, r * CELL, CELL * FRAMES, r * CELL + CELL)).save(f'enemy_{name}.png')

# ---- 미리보기: 실제 바닥 위에 배치해 가독성 확인 ----
try:
    floor = Image.open('tileset_iso_stone.png').convert('RGBA')
    bg = Image.new('RGBA', (CELL * FRAMES * 2 + 40, CELL * len(ROWS) * 2 + 40), (18, 22, 28, 255))
    tile = floor.crop((0, 0, 128, 64))
    for yy in range(0, bg.size[1], 32):
        for xx in range(0, bg.size[0], 64):
            bg.alpha_composite(tile.resize((128, 64)), (xx - 32, yy - 16))
    big = sheet.resize((sheet.size[0] * 2, sheet.size[1] * 2), Image.NEAREST)
    bg.alpha_composite(big, (20, 20))
    bg.convert('RGB').save('_enemies_preview.png')
except Exception as e:
    print('preview skip', e)

print('done', sheet.size, ROWS)
