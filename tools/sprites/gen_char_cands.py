"""캐릭터 재설계 시안을 코드로 직접 그린다 — AI 없이, 수치를 맞춰서.

=== 왜 코드로 그리는가 ===
AI 시안은 "멋있는가"는 좋지만 **합격 조건을 못 맞춘다.** 13번의 애니 실패가
전부 디자인이 조건을 못 지킨 데서 나왔다. 코드로 그리면 명도·대비·다리 노출을
숫자로 정확히 맞출 수 있으므로 최소한 **애니메이션이 가능한 시안**이 보장된다.

=== 합격 조건 (docs/캐릭터_재설계_SD.md §1) ===
  ① 옷자락 끝  < 0.62   ← 허리에서 끝난다. 이게 이번 재설계의 전부
  ② 다리대비   ≥ 12     ← 다리가 옷과 명도로 갈린다
  ③ 몸통명도   50~58    (바닥 실측 42.3)
  ④ 국소대비   ≥ 14
  ⑤ 활을 아래로 내려 든다  ← 앞으로 뻗으면 팔이 스윙 못 한다

=== 3안 ===
  P1  짧은 케이프 + 감은 바지 + 롱부츠   (기존 C3 컨셉 유지, 케이프만 짧게)
  P2  케이프 없음 + 견갑 + 허리 태버드    (실루엣 최적. 애니 난이도 최저)
  P3  넝마 조각 케이프 + 뼈 각반          (언데드 느낌 최대)

실행: python3 tools/sprites/gen_char_cands.py
출력: tools/sprites/cands/mine_P1.png ~ P3.png   (초록 배경 단일 프레임)
      tools/sprites/_cands_mine.png              (확대 + 게임크기 비교 시트)
"""
import pathlib

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / 'cands'
OUT.mkdir(exist_ok=True)

Z = 4                          # 4배로 그린 뒤 축소 = 안티에일리어싱
CW, CH = 96, 116               # main.js 셀 규격
W, H = CW * Z, CH * Z
ANCHOR = 108 * Z               # 접지선 (main.js: CH - 10)
GREEN = (11, 245, 5)           # idle.png 와 같은 초록 — 언매팅 코드가 이걸 전제한다

# ---- 팔레트 -------------------------------------------------------------
# 바닥 실측 (41.5, 47.4, 37.9) 명도 42.3 → **G가 R보다 높은 회녹색**.
# 캐릭터는 같은 계열로 가되 명도를 올려서 바닥에서 떠 보이게 한다.
DARK = (30, 35, 28)            # 케이프 안쪽·그림자
ARMOR_D = (40, 46, 37)         # 갑주 어두운 면
ARMOR_M = (60, 68, 54)         # 갑주 중간
ARMOR_L = (88, 98, 79)       # 갑주 밝은 면
CLOTH_D = (44, 44, 36)         # 천 어두움
CLOTH_M = (56, 56, 45)         # 천 중간
LEATHER = (58, 50, 38)         # 가죽 (약간 갈색 — 갑주와 구분)
# ★ 다리는 몸통보다 **밝게** 잡는다. 이게 조건 ②(다리대비 ≥12) 를 만족시킨다.
LEG_D = (66, 71, 56)
LEG_M = (98, 105, 83)
LEG_L = (132, 140, 113)
BOOT_D = (34, 33, 27)
BOOT_M = (54, 52, 42)
BONE = (128, 130, 112)
GLOW = (224, 92, 255)          # #e05cff — main.js 색조 292° (280~339° 가 비어 있었다)
GLOW_D = (150, 58, 176)


def grad_poly(dr, pts, top, bot, box=None):
    """다각형을 세로 그라디언트로 채운다.

    단색으로 채우면 국소대비가 안 나온다(조건 ④). 그라디언트가 볼륨을 만든다.
    """
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0, x1 = int(min(xs)), int(max(xs)) + 1
    y0, y1 = int(min(ys)), int(max(ys)) + 1
    if x1 <= x0 or y1 <= y0:
        return
    m = Image.new('L', (x1 - x0, y1 - y0), 0)
    ImageDraw.Draw(m).polygon([(x - x0, y - y0) for x, y in pts], fill=255)
    hh = y1 - y0
    t = np.linspace(0, 1, hh)[:, None]
    g = (np.array(top)[None, :] * (1 - t) + np.array(bot)[None, :] * t)
    g = np.repeat(g[:, None, :], x1 - x0, axis=1).astype(np.uint8)
    dr._image.paste(Image.fromarray(g, 'RGB'), (x0, y0), m)
    if box is not None:
        box.append((x0, y0, x1, y1))


class Canvas:
    """RGB 레이어 + 알파 레이어를 따로 들고 다닌다.

    RGBA 로 그리면 반투명 겹침에서 색이 섞여 탁해진다. 알파는 마스크로만 쓴다.
    """

    def __init__(self):
        self.rgb = Image.new('RGB', (W, H), (0, 0, 0))
        self.al = Image.new('L', (W, H), 0)
        self.d = ImageDraw.Draw(self.rgb)
        self.d._image = self.rgb
        self.da = ImageDraw.Draw(self.al)

    def poly(self, pts, top, bot=None, edge=True):
        grad_poly(self.d, pts, top, bot if bot else top)
        self.da.polygon(pts, fill=255)
        # ★ 부위마다 어두운 경계선을 넣는다. 이게 없으면 국소대비가 7 을 못 넘고
        #   64px 에서 팔·다리·몸통이 한 덩어리로 뭉친다.
        if edge:
            e = tuple(max(0, int(v * 0.42)) for v in (bot if bot else top))
            self.d.polygon(pts, outline=e, width=max(1, Z // 2))

    def ell(self, box, top, bot=None):
        self.d.ellipse(box, fill=top)
        if bot:
            x0, y0, x1, y1 = box
            self.d.ellipse((x0, y0, x1, (y0 + y1) // 2), fill=bot)
        self.da.ellipse(box, fill=255)

    def line(self, pts, col, w):
        self.d.line(pts, fill=col, width=w, joint='curve')
        self.da.line(pts, fill=255, width=w, joint='curve')

    def arc(self, box, a0, a1, col, w):
        self.d.arc(box, a0, a1, fill=col, width=w)
        self.da.arc(box, a0, a1, fill=255, width=w)


# ---- 부위별 그리기 ------------------------------------------------------
# 측면 우향. x 가 클수록 앞(캐릭터가 보는 방향).
HX = 52 * Z                    # 몸 중심 x
GY = ANCHOR                    # 발끝 y


def draw_bow(c):
    """활 — **아래로 내려 든다.** 앞으로 뻗으면 팔이 스윙 못 한다(조건 ⑤)."""
    bx, by = HX + 15 * Z, GY - 40 * Z
    c.arc((bx - 7 * Z, by - 20 * Z, bx + 9 * Z, by + 22 * Z), -70, 80, LEATHER, max(2, Z // 2))
    # 활시위
    c.line([(bx + 2 * Z, by - 19 * Z), (bx + 2 * Z, by + 21 * Z)], (86, 84, 70), max(1, Z // 3))


def draw_quiver(c):
    """등의 화살통 — 뒤(-x)쪽. 실루엣에 세로 리듬을 준다."""
    qx, qy = HX - 9 * Z, GY - 78 * Z
    c.poly([(qx - 4 * Z, qy), (qx + 4 * Z, qy - 2 * Z),
            (qx + 5 * Z, qy + 20 * Z), (qx - 3 * Z, qy + 22 * Z)], LEATHER, DARK)
    for k in range(3):                      # 화살대 + 깃
        ax = qx - 3 * Z + k * 3 * Z
        c.line([(ax, qy - 1 * Z), (ax - 1 * Z, qy - 11 * Z)], (96, 90, 74), max(1, Z // 2))
        c.poly([(ax - 1 * Z, qy - 11 * Z), (ax - 4 * Z, qy - 8 * Z),
                (ax - 1 * Z, qy - 6 * Z)], GLOW_D, DARK)


def draw_hood(c):
    """후드 — 뾰족한 측면 실루엣. 안쪽은 어둡고 눈만 발광한다."""
    hy = GY - 108 * Z
    c.poly([(HX - 9 * Z, hy + 20 * Z), (HX - 7 * Z, hy + 6 * Z), (HX, hy),
            (HX + 8 * Z, hy + 5 * Z), (HX + 11 * Z, hy + 15 * Z),
            (HX + 10 * Z, hy + 23 * Z), (HX - 8 * Z, hy + 24 * Z)], ARMOR_M, ARMOR_D)
    # 후드 안쪽 그림자
    c.poly([(HX + 3 * Z, hy + 11 * Z), (HX + 11 * Z, hy + 15 * Z),
            (HX + 10 * Z, hy + 22 * Z), (HX + 3 * Z, hy + 21 * Z)], DARK, (18, 20, 16))
    # 눈 발광 — 64px 에서 눈이 따라갈 유일한 지점 중 하나
    c.ell((HX + 6 * Z, hy + 15 * Z, HX + 9 * Z, hy + 18 * Z), GLOW)
    # 후드 앞테두리 하이라이트
    c.line([(HX, hy + 1 * Z), (HX + 8 * Z, hy + 6 * Z)], ARMOR_L, max(1, Z // 2))


def draw_torso(c):
    """상체 갑주 — 가슴판 + 벨트. 가로 라인이 국소대비를 만든다."""
    ty = GY - 86 * Z
    c.poly([(HX - 8 * Z, ty), (HX + 9 * Z, ty + 1 * Z), (HX + 10 * Z, ty + 22 * Z),
            (HX + 7 * Z, ty + 30 * Z), (HX - 7 * Z, ty + 29 * Z),
            (HX - 9 * Z, ty + 20 * Z)], ARMOR_M, ARMOR_D)
    # 가슴판 하이라이트
    c.poly([(HX - 2 * Z, ty + 3 * Z), (HX + 8 * Z, ty + 4 * Z),
            (HX + 8 * Z, ty + 13 * Z), (HX - 2 * Z, ty + 12 * Z)], ARMOR_L, ARMOR_M)
    # 벨트
    c.poly([(HX - 9 * Z, ty + 27 * Z), (HX + 9 * Z, ty + 26 * Z),
            (HX + 9 * Z, ty + 31 * Z), (HX - 9 * Z, ty + 32 * Z)], LEATHER, DARK)
    c.ell((HX + 1 * Z, ty + 27 * Z, HX + 4 * Z, ty + 30 * Z), GLOW_D)


def draw_arms(c, variant):
    """팔 — 활을 든 앞팔은 아래로, 뒷팔은 굽혀서 뒤로. 손에 영혼불."""
    sy = GY - 84 * Z
    if variant == 'P2':                      # 견갑
        c.poly([(HX - 8 * Z, sy - 1 * Z), (HX + 7 * Z, sy), (HX + 8 * Z, sy + 7 * Z),
                (HX - 9 * Z, sy + 8 * Z)], ARMOR_L, ARMOR_M)
    # 뒷팔 (뒤로 굽힘)
    c.line([(HX - 3 * Z, sy + 4 * Z), (HX - 8 * Z, sy + 15 * Z)], ARMOR_D, 3 * Z // 2)
    c.line([(HX - 8 * Z, sy + 15 * Z), (HX - 4 * Z, sy + 24 * Z)], ARMOR_D, 3 * Z // 2)
    # 앞팔 (활 쪽, 아래로)
    c.line([(HX + 5 * Z, sy + 5 * Z), (HX + 11 * Z, sy + 17 * Z)], ARMOR_M, 3 * Z // 2)
    c.line([(HX + 11 * Z, sy + 17 * Z), (HX + 15 * Z, sy + 27 * Z)], ARMOR_M, 3 * Z // 2)
    # 손 영혼불 — 발광 면적의 대부분
    hx, hy = HX + 15 * Z, sy + 28 * Z
    c.ell((hx - 4 * Z, hy - 4 * Z, hx + 4 * Z, hy + 4 * Z), GLOW_D)
    c.ell((hx - 2 * Z, hy - 3 * Z, hx + 3 * Z, hy + 2 * Z), GLOW)


def draw_cape(c, variant):
    """★ 조건 ① — 옷자락이 **허리에서 끝난다.** 무릎을 덮으면 이 시안은 실패다."""
    ty = GY - 86 * Z
    hip = ty + 32 * Z                        # 허리선
    if variant == 'P1':                      # 짧은 케이프, 밑단 살짝 찢김
        c.poly([(HX - 9 * Z, ty + 1 * Z), (HX + 2 * Z, ty), (HX + 3 * Z, hip),
                (HX - 1 * Z, hip + 4 * Z), (HX - 5 * Z, hip - 1 * Z),
                (HX - 10 * Z, hip + 3 * Z), (HX - 12 * Z, ty + 14 * Z)], CLOTH_M, CLOTH_D)
        c.line([(HX - 12 * Z, ty + 14 * Z), (HX - 9 * Z, ty + 2 * Z)], ARMOR_L, max(1, Z // 2))
        # 밑단 발광 — 실루엣 하단을 읽히게 한다
        c.line([(HX - 10 * Z, hip + 3 * Z), (HX - 1 * Z, hip + 4 * Z)], GLOW_D, max(1, Z // 2))
    elif variant == 'P2':                    # 케이프 없음 + 허리 태버드만
        c.poly([(HX - 7 * Z, hip - 3 * Z), (HX + 7 * Z, hip - 4 * Z),
                (HX + 5 * Z, hip + 6 * Z), (HX + 1 * Z, hip + 2 * Z),
                (HX - 3 * Z, hip + 7 * Z), (HX - 6 * Z, hip + 2 * Z)], CLOTH_M, CLOTH_D)
        c.line([(HX - 6 * Z, hip + 2 * Z), (HX + 5 * Z, hip + 6 * Z)], GLOW_D, max(1, Z // 2))
    else:                                    # P3 — 넝마 조각. 허리 아래로 안 내려간다
        for k, dx in enumerate((-9, -5, -1, 3)):
            x = HX + dx * Z
            c.poly([(x - 2 * Z, ty + 4 * Z), (x + 2 * Z, ty + 3 * Z),
                    (x + 1 * Z, hip + (2 + k % 2 * 3) * Z),
                    (x - 2 * Z, hip - 1 * Z)], CLOTH_M, DARK)
        c.line([(HX - 11 * Z, hip), (HX + 4 * Z, hip + 2 * Z)], GLOW_D, max(1, Z // 2))


def draw_legs(c, variant):
    """★ 조건 ② — 다리는 몸통보다 **밝다.** 그래야 64px 에서 실루엣이 갈린다.

    두 다리를 살짝 벌려 그린다(idle 이지만 보폭이 가능한 자세임을 보이려고).
    """
    ty = GY - 86 * Z
    hip = ty + 30 * Z
    for back, (kx, ax) in enumerate(((-4, -6), (3, 5))):   # 뒷다리, 앞다리
        cd, cm, cl = (LEG_D, LEG_M, LEG_L) if not back else (
            tuple(int(v * 0.78) for v in LEG_D), tuple(int(v * 0.78) for v in LEG_M),
            tuple(int(v * 0.78) for v in LEG_L))
        kneex = HX + kx * Z
        anklex = HX + ax * Z
        kneey = hip + 26 * Z
        ankley = GY - 12 * Z
        # 허벅지
        c.poly([(kneex - 4 * Z, hip), (kneex + 4 * Z, hip),
                (kneex + 3 * Z, kneey), (kneex - 3 * Z, kneey)], cl, cm)
        # 정강이
        c.poly([(kneex - 3 * Z, kneey), (kneex + 3 * Z, kneey),
                (anklex + 3 * Z, ankley), (anklex - 3 * Z, ankley)], cm, cd)
        if variant == 'P1':                  # 감은 천 — 가로 라인이 대비를 만든다
            for t in range(4):
                yy = kneey + t * 6 * Z
                fx = kneex + (anklex - kneex) * (yy - kneey) / max(ankley - kneey, 1)
                c.line([(fx - 3 * Z, yy), (fx + 3 * Z, yy)], cd, max(1, Z // 2))
        elif variant == 'P2':                # 무릎 보호대
            c.ell((kneex - 4 * Z, kneey - 3 * Z, kneex + 4 * Z, kneey + 4 * Z), ARMOR_L, ARMOR_M)
        else:                                # P3 — 뼈 각반
            c.poly([(anklex - 3 * Z, ankley - 14 * Z), (anklex + 3 * Z, ankley - 14 * Z),
                    (anklex + 2 * Z, ankley), (anklex - 2 * Z, ankley)], BONE, ARMOR_M)
        # 부츠
        bh = 12 * Z if variant == 'P1' else 8 * Z
        c.poly([(anklex - 4 * Z, GY - bh), (anklex + 4 * Z, GY - bh),
                (anklex + 7 * Z, GY - 2 * Z), (anklex + 6 * Z, GY),
                (anklex - 5 * Z, GY)], BOOT_M, BOOT_D)


def build(variant):
    c = Canvas()
    draw_quiver(c)                 # 뒤 → 앞 순서로 그린다
    draw_cape(c, variant)
    draw_legs(c, variant)
    draw_torso(c)
    draw_hood(c)
    draw_arms(c, variant)
    draw_bow(c)
    # 축소 = 안티에일리어싱. 알파를 살짝 흐리게 해 외곽을 부드럽게
    al = c.al.filter(ImageFilter.GaussianBlur(Z * 0.35))
    rgb = c.rgb.filter(ImageFilter.GaussianBlur(Z * 0.25))
    rgb = rgb.resize((CW, CH), Image.LANCZOS)
    al = al.resize((CW, CH), Image.LANCZOS)
    return np.asarray(rgb).astype(float), np.asarray(al).astype(float) / 255.0


# ---------------------------------------------------------------- 검증
def legsplit(fg):
    """다리 분리도 — 하반신에서 **몸폭 16% 이상인 덩어리가 2개**인 행의 비율.

    ⚠️ 폭 조건(0.16)이 핵심이다. 두 번 틀렸다:
       · "옷자락 끝 높이" → 부츠가 몸통만큼 넓어서 전부 0.99
       · 폭 조건 없는 덩어리 수 → 넝마가 갈라져 옛 idle.png 가 67.4% 로 통과
       실측으로 0.16 을 찾았다 (옛 idle 0.6% vs 새 시안 46~70%).
    """
    Hh, Ww = fg.shape
    y0, y1 = int(Hh * 0.60), int(Hh * 0.94)
    n = 0
    for y in range(y0, y1):
        lab, k = ndimage.label(fg[y])
        ws = sorted(((lab == j).sum() for j in range(1, k + 1)), reverse=True)
        if len(ws) >= 2 and ws[1] >= 0.16 * Ww:
            n += 1
    return 100 * n / max(y1 - y0, 1)


def measure(rgb, al):
    """docs/캐릭터_재설계_SD.md §8 과 같은 기준으로 판정한다."""
    fg = al > 0.35
    ys, xs = np.nonzero(fg)
    y0, y1 = ys.min(), ys.max()
    Hh = y1 - y0 + 1
    split = legsplit(fg[y0:y1 + 1, xs.min():xs.max() + 1])

    px = rgb[fg]
    mx = px.max(axis=1); mn = px.min(axis=1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    glow = (sat > 0.35) & (mx > 120)
    body = px[~glow]

    def band(lo, hi):
        s = fg.copy(); s[:y0 + int(Hh * lo)] = False; s[y0 + int(Hh * hi):] = False
        q = rgb[s]
        return q.mean() if len(q) > 20 else 0.0
    legc = abs(band(0.70, 0.95) - band(0.20, 0.50))

    # ⚠️ 국소대비는 **게임 크기(64px)에서** 재야 한다.
    #    같은 idle.png 가 96px 원본에서 9.30, 64px 축소에서 14.88 로 나온다.
    #    합격선 14 는 후자 기준이다. 원본에서 재면 통과할 수가 없다.
    gh = 64
    gw = max(1, round(rgb.shape[1] * gh / rgb.shape[0]))
    gr = np.asarray(Image.fromarray(rgb.astype(np.uint8), 'RGB')
                    .resize((gw, gh), Image.LANCZOS), float)
    ga = np.asarray(Image.fromarray((al * 255).astype(np.uint8), 'L')
                    .resize((gw, gh), Image.LANCZOS), float) / 255.0 > 0.35
    L = gr.mean(axis=2)
    d = np.abs(np.diff(L, axis=1)); v = ga[:, :-1] & ga[:, 1:]
    lc = d[v].mean()
    return dict(split=split, legc=legc, body=body.mean(), lc=lc,
                glow=100 * glow.mean(), h=Hh,
                ok=(split >= 35) and (legc >= 12) and (50 <= body.mean() <= 58) and (lc >= 14))


VARIANTS = [('P1', '짧은 케이프 + 감은 바지'), ('P2', '견갑 + 허리 태버드'),
            ('P3', '넝마 조각 + 뼈 각반')]
print(f'{"안":>4} {"설명":<22}{"다리분리":>9}{"다리대비":>9}{"몸통명도":>9}'
      f'{"국소대비":>9}{"발광%":>7}   판정')
print(f'{"":>4} {"합격선":<22}{">=35%":>9}{">=12":>9}{"50~58":>9}{">=14":>9}{"3~9":>7}')
results = []
for key, desc in VARIANTS:
    rgb, al = build(key)
    m = measure(rgb, al)
    print(f'{key:>4} {desc:<22}{m["split"]:>9.1f}{m["legc"]:>9.1f}{m["body"]:>9.1f}'
          f'{m["lc"]:>9.2f}{m["glow"]:>7.1f}   {"통과" if m["ok"] else "탈락"}')
    # 초록 배경 위에 합성해서 저장 (조립 파이프라인이 초록 언매팅을 전제한다)
    a3 = al[..., None]
    comp = (rgb * a3 + np.array(GREEN)[None, None, :] * (1 - a3)).astype(np.uint8)
    pad = 30
    strip = Image.new('RGB', (CW + pad * 2, CH), GREEN)
    strip.paste(Image.fromarray(comp, 'RGB'), (pad, 0))
    strip.save(OUT / f'mine_{key}.png')
    results.append((key, desc, rgb, al, m))

# ---------------------------------------------------------------- 비교 시트
# 확대 6배 + 게임 크기(53×64) 를 나란히. 원본에서 멋있어도 64px 에서 안 읽히면 의미 없다.
ZO, ZG = 5, 5
GW, GHh = 53, 64
cw = CW * ZO + GW * ZG + 30
sheet = Image.new('RGB', (cw * 3 + 12, CH * ZO + 60), (26, 26, 30))
d = ImageDraw.Draw(sheet)
d.text((8, 8), '왼쪽 = 96×116 원본 5배   /   오른쪽 = 게임 표시 53×64 를 5배 확대',
       fill=(200, 210, 205))
for i, (key, desc, rgb, al, m) in enumerate(results):
    a3 = np.clip(al, 0, 1)[..., None]
    bgc = np.array((40, 42, 46))
    comp = Image.fromarray((rgb * a3 + bgc[None, None, :] * (1 - a3)).astype(np.uint8), 'RGB')
    x = 6 + i * cw
    sheet.paste(comp.resize((CW * ZO, CH * ZO), Image.NEAREST), (x, 28))
    g = comp.resize((GW * 2, GHh * 2), Image.LANCZOS).resize((GW, GHh), Image.LANCZOS)
    sheet.paste(g.resize((GW * ZG, GHh * ZG), Image.NEAREST), (x + CW * ZO + 14, 28))
    d.text((x, CH * ZO + 34), f'{key}  {desc}   {"통과" if m["ok"] else "탈락"}',
           fill=(235, 235, 230) if m['ok'] else (210, 150, 150))
sheet.save(HERE / '_cands_mine.png')
print(f'\nsaved cands/mine_P1..P3.png')
print(f'saved _cands_mine.png  {sheet.size}')
