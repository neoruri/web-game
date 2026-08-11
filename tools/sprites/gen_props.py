"""맵 오브젝트(프롭) 스프라이트 — 아이소 바닥 위에 세워 공간감을 준다.
출력: props_iso.png  (셀 96×112, 가로 스트립 8칸, 알파)
  0 무덤(비석)      1 기울어진 비석      2 석관/관대
  3 기둥(온전)      4 기둥(부러짐)       5 부서진 벽 조각
  6 횃불대(불 없음) 7 잔해 더미
설계: 바닥이 2:1 아이소이므로 밑면을 마름모로 깔고 위로 세운다.
      **접지점 = 셀 하단 중앙**(y정렬 기준). 어두운 바닥에서 읽히도록 외곽 림 처리.
"""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

CW, CH = 96, 112          # 셀 크기(높이 여유 = 세로로 솟는 프롭)
BASE_Y = CH - 10          # 접지선(밑면 마름모 중심 y)
N = 8

# 팔레트 — 바닥(청회색 석재)과 같은 계열, 살짝 밝게 해서 바닥과 분리
ST_LIT = (108, 120, 134)
ST_MID = (84, 95, 108)
ST_DRK = (58, 67, 78)
ST_DEEP = (38, 45, 54)
MOSS = (74, 96, 74)
WOOD = (92, 70, 50)
WOOD_D = (62, 46, 33)
IRON = (96, 104, 116)
RIM = (168, 186, 198)
SHADOW = (10, 13, 18)


def diamond(d, cx, cy, w, h, col):
    d.polygon([(cx, cy - h / 2), (cx + w / 2, cy), (cx, cy + h / 2), (cx - w / 2, cy)], fill=col)


def box(d, cx, top, w, h, dw, lit=ST_LIT, mid=ST_MID, drk=ST_DRK):
    """아이소 박스 — 윗면 마름모 + 좌/우 측면."""
    ty = top
    by = top + h
    # 윗면
    diamond(d, cx, ty, w, dw, lit)
    # 좌측면
    d.polygon([(cx - w / 2, ty), (cx, ty + dw / 2), (cx, by + dw / 2), (cx - w / 2, by)], fill=mid)
    # 우측면
    d.polygon([(cx + w / 2, ty), (cx, ty + dw / 2), (cx, by + dw / 2), (cx + w / 2, by)], fill=drk)


def ground_shadow(im, cx, cy, w, h, a=120):
    sh = Image.new('RGBA', im.size, (0, 0, 0, 0))
    ds = ImageDraw.Draw(sh)
    ds.ellipse([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], fill=SHADOW + (a,))
    sh = sh.filter(ImageFilter.GaussianBlur(4))
    return Image.alpha_composite(sh, im)


# ---------- 개별 프롭 ----------
def grave(d, tilt=0):
    cx = CW / 2
    # 흙더미 밑면
    diamond(d, cx, BASE_Y, 58, 24, ST_DEEP)
    diamond(d, cx, BASE_Y - 2, 48, 19, ST_DRK)
    # 비석 (기울기 옵션)
    off = tilt * 7
    top = BASE_Y - 62
    d.polygon([(cx - 15 + off, top + 6), (cx + 15 + off * 0.6, top + 2),
               (cx + 17, BASE_Y - 6), (cx - 17, BASE_Y - 4)], fill=ST_MID)
    d.polygon([(cx - 15 + off, top + 6), (cx - 3 + off, top), (cx + 15 + off * 0.6, top + 2)],
              fill=ST_LIT)
    # 아치형 머리
    d.ellipse([cx - 15 + off, top - 8, cx + 15 + off, top + 14], fill=ST_MID)
    d.ellipse([cx - 12 + off, top - 6, cx + 10 + off, top + 8], fill=ST_LIT)
    # 십자 새김
    d.rectangle([cx - 2 + off, top + 10, cx + 2 + off, top + 34], fill=ST_DRK)
    d.rectangle([cx - 10 + off, top + 16, cx + 10 + off, top + 20], fill=ST_DRK)
    # 이끼
    d.ellipse([cx - 16, BASE_Y - 22, cx - 4, BASE_Y - 10], fill=MOSS)


def sarcophagus(d):
    cx = CW / 2
    diamond(d, cx, BASE_Y, 72, 30, ST_DEEP)
    box(d, cx, BASE_Y - 34, 62, 26, 26)
    # 뚜껑 살짝 밀린 표현
    diamond(d, cx + 5, BASE_Y - 38, 56, 23, ST_LIT)
    diamond(d, cx + 5, BASE_Y - 36, 44, 17, ST_MID)
    d.ellipse([cx + 12, BASE_Y - 30, cx + 26, BASE_Y - 20], fill=MOSS)


def pillar(d, broken=False):
    cx = CW / 2
    diamond(d, cx, BASE_Y, 52, 22, ST_DEEP)
    # 받침
    box(d, cx, BASE_Y - 16, 44, 12, 18)
    h = 34 if broken else 74
    # 기둥 몸통
    box(d, cx, BASE_Y - 16 - h, 26, h, 12)
    if broken:
        # 깨진 단면 — 들쭉날쭉
        ty = BASE_Y - 16 - h
        d.polygon([(cx - 13, ty + 4), (cx - 6, ty - 3), (cx + 2, ty + 3),
                   (cx + 8, ty - 2), (cx + 13, ty + 5), (cx + 13, ty + 9), (cx - 13, ty + 9)],
                  fill=ST_LIT)
        # 옆에 떨어진 조각
        diamond(d, cx + 26, BASE_Y - 4, 22, 11, ST_MID)
        diamond(d, cx + 26, BASE_Y - 6, 16, 8, ST_LIT)
    else:
        # 주두(기둥머리)
        box(d, cx, BASE_Y - 16 - h - 10, 38, 10, 16)
    d.ellipse([cx - 12, BASE_Y - 20, cx - 2, BASE_Y - 12], fill=MOSS)


def broken_wall(d):
    cx = CW / 2
    diamond(d, cx, BASE_Y, 80, 32, ST_DEEP)
    # 계단식으로 무너진 벽 — 높이 다른 블록 3개
    for i, (dx, h, w) in enumerate([(-24, 44, 26), (0, 30, 26), (22, 52, 24)]):
        box(d, cx + dx, BASE_Y - 8 - h, w, h, 12,
            lit=ST_LIT if i != 1 else ST_MID,
            mid=ST_MID, drk=ST_DRK)
    # 벽돌 줄눈
    for yy in range(0, 40, 9):
        d.line([(cx - 36, BASE_Y - 16 - yy), (cx + 34, BASE_Y - 22 - yy)], fill=ST_DRK, width=1)
    d.ellipse([cx - 30, BASE_Y - 18, cx - 18, BASE_Y - 8], fill=MOSS)


def torch_stand(d):
    cx = CW / 2
    diamond(d, cx, BASE_Y, 40, 18, ST_DEEP)
    box(d, cx, BASE_Y - 12, 26, 10, 14)
    # 기둥(철제)
    d.rectangle([cx - 3, BASE_Y - 74, cx + 3, BASE_Y - 12], fill=IRON)
    d.rectangle([cx - 3, BASE_Y - 74, cx, BASE_Y - 12], fill=ST_LIT)
    # 화로(바구니)
    d.polygon([(cx - 12, BASE_Y - 86), (cx + 12, BASE_Y - 86),
               (cx + 8, BASE_Y - 72), (cx - 8, BASE_Y - 72)], fill=IRON)
    d.polygon([(cx - 12, BASE_Y - 86), (cx + 12, BASE_Y - 86), (cx, BASE_Y - 80)], fill=ST_LIT)
    # 장작
    d.line([(cx - 5, BASE_Y - 80), (cx + 6, BASE_Y - 86)], fill=WOOD, width=3)
    d.line([(cx + 4, BASE_Y - 80), (cx - 6, BASE_Y - 86)], fill=WOOD_D, width=3)


def rubble(d):
    cx = CW / 2
    diamond(d, cx, BASE_Y, 64, 26, ST_DEEP)
    rng = np.random.default_rng(4)
    for _ in range(9):
        px = cx + rng.uniform(-24, 24)
        py = BASE_Y + rng.uniform(-10, 4)
        w = rng.uniform(8, 18)
        h = w * 0.5
        diamond(d, px, py, w, h, ST_MID)
        diamond(d, px, py - 2, w * 0.7, h * 0.7, ST_LIT)
    d.ellipse([cx + 6, BASE_Y - 10, cx + 18, BASE_Y - 2], fill=MOSS)


PROPS = [
    ('grave', lambda d: grave(d, 0)),
    ('grave_tilt', lambda d: grave(d, 1)),
    ('sarcophagus', sarcophagus),
    ('pillar', lambda d: pillar(d, False)),
    ('pillar_broken', lambda d: pillar(d, True)),
    ('broken_wall', broken_wall),
    ('torch', torch_stand),
    ('rubble', rubble),
]


def rim_light(img):
    """바깥 밝은 1px 림 — 어두운 바닥에서 실루엣이 묻히지 않게."""
    a = img.split()[3].point(lambda p: 255 if p > 60 else 0)
    grow = a.filter(ImageFilter.MaxFilter(3))
    ring = Image.fromarray(np.array(grow).astype(np.int16) - np.array(a).astype(np.int16))
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    rim = Image.new('RGBA', img.size, RIM + (105,))
    out.paste(rim, (0, 0), ring.convert('L'))
    return Image.alpha_composite(out, img)


sheet = Image.new('RGBA', (CW * N, CH), (0, 0, 0, 0))
for i, (name, fn) in enumerate(PROPS):
    cell = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    fn(ImageDraw.Draw(cell))
    cell = rim_light(cell)
    cell = ground_shadow(cell, CW / 2, BASE_Y + 4, 74, 26)
    sheet.paste(cell, (i * CW, 0), cell)
sheet.save('props_iso.png')

# ---- 미리보기: 바닥 위에 배치 + 접지선 표시 ----
try:
    floor = Image.open('tileset_iso_stone.png').convert('RGBA')
    TW, TH = 128, 64
    PW, PH = 860, 420
    prev = Image.new('RGBA', (PW, PH), (11, 14, 19, 255))
    for r in range(-2, 16):
        for c in range(-2, 14):
            sx = int((c - r) * (TW / 2) + PW / 2 - TW / 2)
            sy = int((c + r) * (TH / 2) - 40)
            if sx < -TW or sx > PW or sy < -TH or sy > PH:
                continue
            hv = ((c * 73856093) ^ (r * 19349663)) & 0xFFFFFFFF
            prev.alpha_composite(floor.crop(((hv % 16) * TW, 0, (hv % 16) * TW + TW, TH)), (sx, sy))
    # 프롭 8종을 y순으로 정렬해 배치(깊이 정렬 시연)
    spots = [(90, 150), (250, 200), (410, 260), (570, 320),
             (170, 300), (330, 355), (500, 200), (680, 260)]
    order = sorted(range(N), key=lambda i: spots[i][1])
    for i in order:
        px, py = spots[i]
        cell = sheet.crop((i * CW, 0, i * CW + CW, CH))
        prev.alpha_composite(cell, (px - CW // 2, py - BASE_Y))
    d = ImageDraw.Draw(prev)
    for i, (name, _) in enumerate(PROPS):
        px, py = spots[i]
        d.text((px - 24, py + 6), name, fill=(150, 170, 185))
    prev.convert('RGB').save('_props_preview.png')
except Exception as e:
    print('preview skip', e)

print('done props', sheet.size, [p[0] for p in PROPS])
