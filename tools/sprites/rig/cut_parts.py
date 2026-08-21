"""
크리처 한 장을 뼈대용 파츠로 자른다.

── 왜 폴리곤인가 (SAM 을 안 쓰는 이유) ──
SAM 은 '하나의 물체'를 통째로 집는 도구다. 크리처 전체는 잘 따내지만
"팔뚝만" 같은 부분 분할은 못 한다 — 실제로 배경 분리에는 잘 썼지만 여기선 맞지 않는다.
대신 배경이 이미 검정이라는 점을 이용한다.
**폴리곤은 파츠끼리 나누는 역할만 하면 되고, 실루엣을 따라갈 필요가 없다.**
크리처 바깥은 어차피 투명이므로 폴리곤을 넉넉하게 그려도 안전하다.

우선순위대로 픽셀을 배정한다. 먼저 나온 파츠가 먼저 가져간다.
마지막 torso 는 남은 걸 전부 받는 catch-all 이다.

사용법:
    python cut_parts.py --preview     # 자르기 전에 폴리곤 확인 (필수)
    python cut_parts.py               # 실제로 자름
"""
import argparse
import json
import math
import os

import cv2
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.normpath(os.path.join(HERE, "..", "monster_strips", "moster3.png"))
OUT = os.path.join(HERE, "parts_m3")

# ── 관절 좌표 (원본 픽셀). 격자 오버레이로 읽었다 ──────────────────────
J = {
    "pelvis": (560, 690),
    "neck": (655, 480),
    "headTop": (610, 120),

    "shoR": (715, 490), "elbR": (788, 650), "wriR": (868, 545), "handR": (985, 400),
    "shoL": (450, 420), "elbL": (355, 560), "wriL": (285, 675), "handL": (205, 860),

    # 역관절(디지티그레이드) 다리 — 무릎 아래에 발목(hock)이 하나 더 있다.
    # 50px 격자로 다시 읽은 값 (100px 격자 값은 30~50px 씩 어긋나 있었다)
    "hipR": (655, 710), "kneeR": (768, 828), "hockR": (700, 995), "toeR": (805, 1085),
    "hipL": (495, 705), "kneeL": (440, 900), "hockL": (375, 1012), "toeL": (390, 1115),

    # 꼬리 뿌리는 다리와 겹치는 구간을 피해 아래쪽으로 내렸다 (cut_parts 주석 참고).
    # 100px 격자로는 위치를 4~50px 씩 잘못 읽어 첫 시도에서 꼬리가 조각만 잡혔다.
    # 가늘고 휘어진 부위는 50px 격자로 다시 읽어야 한다
    "tail0": (398, 903), "tailTip": (172, 992),
}

# ── 파츠 (이름, 폴리곤, 관절=회전중심) ─────────────────────────────────
# 폴리곤은 넉넉하게. 관절 부근은 서로 겹쳐도 된다 — 오히려 회전할 때 틈이 덜 보인다.
PARTS = [
    # 오른쪽 경계를 x=838 까지 뒀더니 **불꽃의 어두운 후광**이 머리에 1038px 짜리
    # 조각으로 딸려왔다. 머리를 돌리면 그 조각만 같이 돌아 불꽃 옆에서 어른거린다.
    # 머리 그림 자체는 x=760(뿔 끝)에서 끝나므로 790 까지만 잡으면 충분하다
    ("head", [(425, 30), (720, 20), (785, 190), (792, 420), (780, 505),
              (718, 534), (645, 516), (596, 470), (518, 398), (466, 348),
              (386, 292), (396, 246), (416, 110)], J["neck"]),

    # 전완 + 손 + 불꽃을 한 덩어리로. 손이 불꽃을 감싸고 있어 분리하면 경계가 지저분하다.
    # 왼쪽 경계를 (900,30)->(818,210) 으로 뒀더니 불꽃에서 **떨어져 나온 작은 불티**들이
    # 폴리곤 밖으로 새어 body 에 남았다. 팔이 움직여도 그 불티만 제자리에 붙어 있어 눈에 띈다.
    # x=838 까지 넓혀서 불티를 전부 담는다 (머리 뿔 끝이 x=760 이라 안 겹친다)
    ("armR_lo", [(752, 632), (800, 706), (884, 700), (1010, 566), (1075, 400),
                 (1075, 20), (838, 20), (815, 200), (800, 430), (766, 528)],
     J["elbR"], "glow"),
    ("armR_up", [(676, 442), (736, 452), (800, 596), (824, 678), (782, 706),
                 (734, 648), (686, 546), (662, 486)], J["shoR"]),

    # 아래쪽 발톱 끝이 폴리곤 밖으로 삐져나가 body 에 1351px 짜리 조각으로 남았다.
    # (--check 가 잡아준 것) 팔이 움직여도 그 발톱만 제자리에 남아 겹쳐 보인다.
    # 왼쪽·아래를 넓혀 발톱을 전부 담되, 꼬리 폴리곤(위쪽 경계 y≈930)과는 안 닿게 한다
    ("armL_lo", [(392, 528), (398, 622), (372, 700), (400, 798), (342, 900),
                 (258, 928), (168, 900), (134, 856), (158, 778), (214, 700),
                 (250, 620), (268, 540)], J["elbL"]),
    ("armL_up", [(500, 380), (516, 448), (420, 522), (392, 604), (312, 596),
                 (300, 520), (386, 434), (444, 386)], J["shoL"]),

    # 꼬리는 **깨끗한 아랫부분만** 가져간다.
    # 뿌리 쪽(x 370~500)은 왼쪽 다리와 겹쳐 있어 나누면 둘 다 망가진다.
    # 위쪽 가장자리를 오른쪽->왼쪽으로 훑고, 꼬리 끝을 돌아, 아래쪽을 왼쪽->오른쪽으로 되돌아온다.
    # 오른쪽 끝은 x≈400 에서 끊는다 — 그 너머는 왼쪽 다리와 겹쳐서 가져가면 다리가 찢어진다.
    #
    # 2차 수정: 왼쪽 끝(갈고리)이 폴리곤 위로 삐져나가 body 에 조각으로 남았다.
    # 갈고리는 위로 휘어 올라가므로 그 부분만 띠를 크게 부풀린다.
    ("tail", [(405, 852), (350, 895), (300, 938), (250, 940), (200, 928),
              (158, 922), (126, 946), (122, 1002), (158, 1058), (226, 1088),
              (292, 1052), (344, 992), (392, 940), (408, 900)], J["tail0"]),

    # ── 다리 (걷기용) ────────────────────────────────────────────────
    # 치마가 허벅지 위쪽을 덮고 있다. 그래서 다리를 **body 보다 뒤에** 그린다 —
    # 그러면 엉덩이 근처의 자른 자국은 치마가 가려주고, 치마 밑으로 나온 부분만 움직인다.
    # 옷 입은 캐릭터가 걷는 것과 같은 원리다. 치마 밑에서 잘라내려 하면 그림 자체가 없다.
    # 좌측 상단을 (608,640)-(706,632) 로 뒀더니 **치마의 금색 자락**을 통째로 물었다.
    # 허벅지가 돌면 그 자락만 치마에서 떨어져 나와 허공에 떠다녔다.
    # 자락의 아래 경계(605,672)-(720,732) 밑으로 내리고, 왼쪽은 세로 금색 띠(x≈615~635)를 피한다.
    # 엉덩이 관절(655,710)이 그림 바깥에 놓이지만 상관없다 — 그 부근은 치마가 가린다
    ("legR_thigh", [(642, 714), (714, 724), (794, 726), (826, 812), (804, 874),
                    (738, 878), (690, 806), (648, 750)], J["hipR"]),
    # 윗변을 (706,782)-(838,830) 에 뒀더니 **무릎 위 허벅지를 59% 삼켰다**.
    # 정강이는 무릎을 중심으로 도니까, 삼켜진 허벅지 덩어리가 무릎을 축으로 돌아
    # "허벅지는 안 움직이고 무릎만 꺾인다"로 보였다. 정강이가 앞에 그려져서 진짜 허벅지를 덮는다.
    # 무릎(768,828) 살짝 **아래**에서 자른다. 관절 위쪽은 허벅지가 온전히 갖는다
    ("legR_shin", [(685, 805), (843, 869), (776, 1034), (640, 1002)], J["kneeR"]),
    ("legR_foot", [(642, 962), (746, 986), (876, 1054), (882, 1136),
                   (758, 1146), (656, 1062)], J["hockR"]),

    # legL_thigh 는 **일부러 없다**. 왼쪽 허벅지는 치마에 완전히 가려서 그림이 아예 없다.
    # 그 영역을 폴리곤으로 잡으면 잘리는 건 허벅지가 아니라 치마다.
    # 대신 make_creature_rig.py 에서 **그림 없는 변환 전용 뼈**로 만든다 —
    # 정강이는 그 뼈에 매달려 제대로 흔들리고, 화면에는 치마 밑만 보인다.
    # 같은 이유로 무릎(440,900) 근처에서 자른다. 왼쪽은 허벅지 파츠가 없어서
    # 무릎 위 그림이 없어지지만, 그 구간은 어차피 치마가 가린다
    ("legL_shin", [(396, 884), (490, 902), (432, 1048), (338, 1024)], J["kneeL"]),
    ("legL_foot", [(324, 992), (428, 1010), (446, 1096), (420, 1166),
                   (308, 1160), (296, 1064)], J["hockL"]),

    # 남은 전부 — 몸통, 골반, 치마, 목걸이
    ("body", None, J["pelvis"]),
]

# 관절 둘레 몇 px 까지 body 가 겹쳐 가져갈지. 그 뼈가 **얼마나 도는지**로 정한다.
# 뼈가 θ 만큼 돌면 관절에서 d 떨어진 점은 d·sin θ 만큼 어긋난다.
# 어긋난 만큼 뒤에 깔린 body 복사본이 드러나므로, 그게 눈에 안 띌 크기여야 한다.
#   팔(시전 26°)  : 110px -> 최대 48px 어긋남. 팔 폭 안이라 가려진다
#   꼬리(9°)      :  45px -> 최대  7px. 110 을 줬더니 꼬리 밑동을 따라 복사본이
#                   길게 드러나 **꼬리가 두 개**로 보였다
#
# ── 0 을 주는 경우 ──
# **body 보다 뒤에 그려지는 파츠는 body 가 겹쳐줄 필요가 없다.**
# 겹침은 파츠가 움직여 생긴 틈을 뒤에서 메우려는 것인데, 뒤에 그려지는 파츠는
# 애초에 body 가 앞에서 다 덮고 있어 틈이 안 보인다. 오히려 body 에 남은 복사본이
# 파츠가 스윙할 때 **제자리에 남아 조각처럼 떠 보인다** — 실제로 그렇게 보였다.
# 다리는 치마가, 오른팔은 가슴이 뿌리를 가려준다.
JOINT_R_DEFAULT = 110
JOINT_R = {
    "tail": 45,          # 꼬리는 예외. 몸통이 쥔 꼬리 밑동이 회전 틈을 메워야 한다
    "legR_thigh": 0, "legR_shin": 0, "legR_foot": 0,
    "legL_shin": 0, "legL_foot": 0,
    "armR_up": 0, "armR_lo": 0,
}

# 뒤 -> 앞. 이 순서로 화면에 쌓는다.
# 다리는 body 보다 **뒤**다. 앞에 두면 치마를 덮어버린다
DRAW_ORDER = ["tail",
              "legL_shin", "legL_foot",
              "legR_thigh", "legR_shin", "legR_foot",
              "armR_up", "armR_lo", "body", "head", "armL_up", "armL_lo"]

# 뼈 계층 (자식, 부모)
HIER = {
    "body": None,
    "head": "body",
    "armR_up": "body", "armR_lo": "armR_up",
    "armL_up": "body", "armL_lo": "armL_up",
    "tail": "body",
    "legR_thigh": "body", "legR_shin": "legR_thigh", "legR_foot": "legR_shin",
    "legL_thigh": "body", "legL_shin": "legL_thigh", "legL_foot": "legL_shin",
}

COLORS = [(255, 90, 90), (90, 200, 255), (255, 200, 80), (150, 255, 120),
          (200, 130, 255), (255, 140, 200), (120, 255, 220), (255, 170, 90),
          (170, 170, 255), (90, 255, 160), (255, 110, 160), (180, 220, 120),
          (140, 190, 255)]


def luminance(im):
    return np.asarray(im.convert("RGB")).astype(np.float32).max(axis=2)


def alpha_from_black(lum, lo=10, hi=32):
    """배경이 순수 검정이라 밝기로 알파를 만든다.
    경계를 딱 자르면 계단이 생기므로 lo~hi 사이를 부드럽게 넘긴다."""
    return np.clip((lum - lo) / (hi - lo), 0, 1)


def alpha_glow(lum, y0=560):
    """불꽃처럼 **스스로 빛나는** 부위의 알파.

    불꽃은 바깥으로 갈수록 어두운 주황 -> 검정으로 페이드된다.
    기본 규칙(10~32)은 그 어두운 후광까지 전부 불투명으로 만들어버려서,
    잘라내면 불꽃 주위에 **검은 덩어리**가 따라붙는다. 실제로 그렇게 보였다.
    밝기에 따라 서서히 투명해지게 하면 후광이 자연스럽게 사라진다.

    단, 팔뚝은 원래 어두운 살색이라 같은 규칙을 쓰면 같이 지워진다.
    그래서 손목 위(y < y0)에만 적용한다.
    """
    a = alpha_from_black(lum)
    soft = np.clip((lum - 38) / 70.0, 0, 1)
    out = a.copy()
    out[:y0, :] = np.minimum(a[:y0, :], soft[:y0, :])
    return out


ALPHA_RULES = {"glow": alpha_glow}


# ── 부스러기 정리 ──────────────────────────────────────────────────────
# 폴리곤 경계가 그림을 스치면 몇백 px 짜리 조각이 떨어져 나온다.
# 그 조각은 파츠와 함께 움직이므로 **허공에 뜬 점**처럼 보인다. 실제로 그렇게 보였다.
# 폴리곤을 하나하나 손보는 것보다 잘라낸 뒤 걷어내는 게 일반적이고 확실하다.
#
# ⚠️ 원본부터 떨어져 있는 그림은 예외로 둬야 한다. 이 크리처의 불꽃은
#    튀어나온 불티가 4개(48~486px) 있고 그건 지워지면 안 된다.
MIN_ISLAND = 600
KEEP_ISLANDS = {"armR_lo"}      # 불티가 있는 파츠
_dropped = []


def drop_crumbs(name, mask):
    if name in KEEP_ISLANDS:
        return mask
    n, lab, st, _c = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    if n <= 2:
        return mask
    keep = max(range(1, n), key=lambda i: st[i, cv2.CC_STAT_AREA])
    out = mask.copy()
    for i in range(1, n):
        if i == keep or st[i, cv2.CC_STAT_AREA] >= MIN_ISLAND:
            continue
        out[lab == i] = False
        _dropped.append((name, int(st[i, cv2.CC_STAT_AREA])))
    return out


def poly_mask(size, poly):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).polygon(poly, fill=255)
    return np.asarray(m).astype(np.float32) / 255.0


def preview(im):
    ov = im.convert("RGB").copy()
    lay = Image.new("RGB", im.size, (0, 0, 0))
    dr = ImageDraw.Draw(lay)
    for i, p in enumerate(PARTS):
        if p[1]:
            dr.polygon(p[1], fill=COLORS[i % len(COLORS)])
    ov = Image.blend(ov, lay, 0.42)
    dr = ImageDraw.Draw(ov)
    for i, p in enumerate(PARTS):
        name, poly, j = p[0], p[1], p[2]
        if poly:
            dr.line(poly + [poly[0]], fill=(255, 255, 255), width=2)
        dr.ellipse([j[0] - 9, j[1] - 9, j[0] + 9, j[1] + 9],
                   fill=(255, 255, 0), outline=(0, 0, 0), width=2)
        dr.text((j[0] + 12, j[1] - 6), name, fill=(255, 255, 0))
    out = os.path.join(HERE, "_m3_cuts.png")
    ov.save(out)
    print(f"  -> {out}")


def check(im, masks, min_island=40):
    """각 파츠에서 **떨어져 나온 섬 조각**을 찾는다.

    이 진단이 필요했던 이유:
      · 폴리곤이 팔다리를 다 못 담으면 남은 부스러기가 body 로 흘러들고,
        그 부스러기는 팔이 움직여도 제자리에 남아 '뒤에 이미지가 겹치는' 것처럼 보인다
      · 반대로 폴리곤을 너무 넓게 그리면 **남의 것을 물어온다**.
        실제로 머리 폴리곤이 불꽃의 어두운 후광을 1038px 물고 왔었다
    둘 다 육안으로는 놓치기 쉬운데, 이 검사로는 한 번에 걸린다.

    파츠는 원래 하나로 이어진 덩어리다. 가장 큰 덩어리 말고는 전부 의심 대상이다.
    경계선 노이즈를 세지 않아서 판정이 깔끔하다.

    ⚠️ 다만 **원본부터 떨어져 있는 그림**은 오탐이다. 이 크리처의 불꽃은
    튀어나온 불티가 4개 있어서 armR_lo 에서 항상 걸린다 — 그건 정상이다.
    '의심 목록'이지 '오류 목록'이 아니니 좌표를 보고 사람이 판단해야 한다.
    """
    a = np.asarray(im.convert("RGB")).copy()
    a = (a * 0.3).astype(np.uint8)
    total, report = 0, []
    for name, m in masks.items():
        n, lab, st, _c = cv2.connectedComponentsWithStats(m.astype(np.uint8), 8)
        if n <= 1:
            continue
        order = sorted(range(1, n), key=lambda i: -st[i, cv2.CC_STAT_AREA])
        a[lab == order[0]] = np.asarray(im.convert("RGB"))[lab == order[0]]
        for i in order[1:]:
            if st[i, cv2.CC_STAT_AREA] < min_island:
                continue
            total += 1
            x, y, w, h = st[i, :4]
            report.append((name, int(st[i, cv2.CC_STAT_AREA]), x, y, w, h))
            a[lab == i] = [255, 0, 220]               # 부스러기 = 자홍색

    ov = Image.fromarray(a)
    dr = ImageDraw.Draw(ov)
    for name, area, x, y, w, h in report:
        dr.rectangle([x - 8, y - 8, x + w + 8, y + h + 8], outline=(255, 80, 220), width=3)
        dr.text((x - 6, y - 24), f"{name} {area}px", fill=(255, 120, 230))
    for p in PARTS:
        if p[1]:
            dr.line(p[1] + [p[1][0]], fill=(0, 255, 120), width=2)
    out = os.path.join(HERE, "_m3_leak.png")
    ov.save(out)

    if report:
        print(f"  ! 떨어져 나온 조각 {total}개 — 폴리곤을 고쳐야 한다")
        for name, area, x, y, w, h in report:
            print(f"      {name:9s} {area:6d}px  bbox({x},{y})-({x+w},{y+h})")
    else:
        print("  모든 파츠가 하나로 이어져 있다 — 새어나가거나 물어온 조각 없음")
    print(f"  -> {out}")

    # ── 중복 소유 검사 ──
    # 두 파츠가 같은 픽셀을 갖고 있으면, 서로 다르게 움직일 때 그 부분이 둘로 보인다.
    # 관절 근처의 약간은 의도한 것(틈 메우기)이지만 비율이 크면 버그다.
    # 실제로 body 가 꼬리의 52% 를 갖고 있어서 '꼬리가 두 개'로 보였다.
    print("  중복 소유 (파츠 자기 크기 대비):")
    names = list(masks)
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            dup = int((masks[a] & masks[b]).sum())
            if dup < 200:
                continue
            ra = 100.0 * dup / max(int(masks[a].sum()), 1)
            rb = 100.0 * dup / max(int(masks[b].sum()), 1)
            flag = "  <-- 과다" if max(ra, rb) > 25 else ""
            print(f"      {a:9s} ∩ {b:9s} {dup:6d}px  ({ra:4.1f}% / {rb:4.1f}%){flag}")
    return total


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", action="store_true")
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    im = Image.open(SRC).convert("RGB")
    lum = luminance(im)
    alpha = alpha_from_black(lum)
    print(f"  {SRC}  {im.size[0]}x{im.size[1]}  피사체 {100*(alpha>0.5).mean():.1f}%")

    if args.preview:
        preview(im)
        return

    os.makedirs(OUT, exist_ok=True)
    rgb = np.asarray(im).astype(np.uint8)
    meta = []

    # ── 관절은 **겹치게** 자른다 ──
    # 한쪽만 가져가면 반대쪽에 홈이 남고, 팔을 조금만 돌려도 그 홈이 드러난다.
    # 컷아웃의 정석은 겹침을 양쪽에 복제하는 것이다. 앞에 그려지는 파츠가 뒤를 덮으니
    # 쉬는 자세에서는 티가 안 나고, 돌리면 뒤쪽 여분이 틈을 메운다.
    union = np.zeros(alpha.shape, dtype=bool)
    for p in PARTS:
        if p[1] is not None:
            union |= poly_mask(im.size, p[1]) > 0.5

    # 몸통도 팔·머리 밑으로 OVERLAP 만큼 더 가져간다. 같은 이유다.
    #
    # ⚠️ 단, **관절 둘레에서만** 넓힌다. 처음엔 사방으로 넓혔는데 그게 문제였다:
    # 꼬리가 왼쪽 다리와 나란히 붙어 지나가는 바람에, 다리 주변에서 넓힌 30px 띠가
    # 꼬리를 **150px 넘게 따라 덮어버렸다**. body 와 tail 이 5502px(꼬리의 절반)을
    # 동시에 갖게 됐고, 꼬리가 흔들리면 body 쪽 복사본은 제자리에 남아
    # **꼬리가 두 개로 보였다.**
    #
    # 틈이 벌어지는 곳은 관절뿐이다. 뼈가 θ 만큼 돌면 관절에서 d 떨어진 점은 d·θ 만큼
    # 움직이므로, 관절에서 먼 곳은 애초에 파츠가 제 몸으로 덮는다. 넓힐 이유가 없다.
    OVERLAP = 30
    solid = alpha > 0.02
    body_core = solid & (~union)

    near = Image.new("L", im.size, 0)
    dr = ImageDraw.Draw(near)
    for p in PARTS:
        if p[1] is None:
            continue
        jx, jy = p[2]
        r = JOINT_R.get(p[0], JOINT_R_DEFAULT)
        dr.ellipse([jx - r, jy - r, jx + r, jy + r], fill=255)
    near = np.asarray(near) > 0

    k = np.ones((OVERLAP * 2 + 1, OVERLAP * 2 + 1), np.uint8)
    grown = (cv2.dilate(body_core.astype(np.uint8), k) > 0) & solid
    body = body_core | (grown & (near | ~union))

    masks = {}
    for p in PARTS:
        name, poly = p[0], p[1]
        rule = p[3] if len(p) > 3 else None
        pa = ALPHA_RULES[rule](lum) if rule else alpha
        masks[name] = body if poly is None else \
            ((poly_mask(im.size, poly) > 0.5) & (pa > 0.4))

    if args.check:
        check(im, masks)
        return

    for p in PARTS:
        name, poly, joint = p[0], p[1], p[2]
        rule = p[3] if len(p) > 3 else None
        pa = ALPHA_RULES[rule](lum) if rule else alpha
        if poly is None:
            take = body
        else:
            take = (poly_mask(im.size, poly) > 0.5) & (pa > 0.02)
        take = drop_crumbs(name, take)
        if not take.any():
            print(f"  ! {name}: 빈 영역 — 폴리곤을 다시 봐야 한다")
            continue

        ys, xs = np.where(take)
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        a = (pa * take)[y0:y1, x0:x1]
        out = np.dstack([rgb[y0:y1, x0:x1], (a * 255).astype(np.uint8)])
        Image.fromarray(out, "RGBA").save(os.path.join(OUT, f"{name}.png"))

        meta.append({
            "name": name,
            "file": f"{name}.png",
            "size": [int(x1 - x0), int(y1 - y0)],
            # 회전 중심을 파츠 이미지 안의 비율로. Phaser setOrigin 에 그대로 넣는다
            "pivot": [round((joint[0] - x0) / (x1 - x0), 4),
                      round((joint[1] - y0) / (y1 - y0), 4)],
            "jointWorld": list(joint),
            "offset": [int(x0), int(y0)],
        })
        print(f"  {name:12s} {int(x1-x0):4d}x{int(y1-y0):4d}  "
              f"pivot({meta[-1]['pivot'][0]:.2f},{meta[-1]['pivot'][1]:.2f})  "
              f"픽셀 {int(take.sum()):7d}")

    with open(os.path.join(OUT, "parts.json"), "w", encoding="utf-8") as fh:
        json.dump({"source": os.path.basename(SRC), "imageSize": list(im.size),
                   "joints": {k: list(v) for k, v in J.items()},
                   "drawOrder": DRAW_ORDER, "hierarchy": HIER,
                   "parts": meta}, fh, indent=2, ensure_ascii=False)
    # 게임이 쓰려면 public/ 아래에 있어야 한다 (Vite 는 public 만 정적 서빙한다)
    pub = os.path.normpath(os.path.join(HERE, "..", "..", "..",
                                        "public", "sprites", "creatures", "m3"))
    os.makedirs(pub, exist_ok=True)
    for m in meta:
        Image.open(os.path.join(OUT, m["file"])).save(os.path.join(pub, m["file"]))
    # 원본도 같이 둔다 — 랩에서 rest 자세를 원본과 겹쳐 대조하는 데 쓴다
    im.save(os.path.join(pub, "_original.png"))
    print(f"  -> {OUT}\n  -> {pub} (게임용 사본)")

    if _dropped:
        tot = sum(a for _n, a in _dropped)
        # 조용히 지우면 안 된다. 뭘 버렸는지 항상 보여준다
        print(f"  걷어낸 부스러기 {len(_dropped)}개 / {tot}px "
              f"(전체 불투명의 {100*tot/(alpha > 0.02).sum():.2f}%)")
        for n, a in sorted(_dropped, key=lambda x: -x[1]):
            print(f"      {n:11s} {a:5d}px")

    left = (alpha > 0.5) & (~union) & (~body)
    if left.any():
        print(f"  ! 어디에도 안 들어간 픽셀 {int(left.sum())}개 — 폴리곤을 다시 봐야 한다")


if __name__ == "__main__":
    main()
