"""적 3종 + 엘리트 4종(각 2자세) = 붙여넣기 전용 요청문 11개 생성.

=== 왜 배경색이 유닛마다 다른가 (실측) ===
크로마키는 배경 색조와 캐릭터 강조색이 가까우면 강조색을 먹는다.
플레이어에서 겪었다 — 발광이 자마젠타인데 배경도 마젠타로 지정해 놨었다.

유닛별 최적 배경을 계산했다(색조 거리 최대화):
  일반몹 3종  (살95도 / 털21도 / 후드41도)  →  파랑 #0000FF   최소 141도
  돌격자      빨강 #ec6050  (6도)          →  시안 #00FFFF        174도
  포격수      주황 #f29840  (30도)         →  시안 #00FFFF        150도
  산탄사수     청록 #6ed6ce  (175도)        →  빨강 #FF0000        175도
  수호자      보라 #c08ef4  (269도)        →  노랑 #FFFF00        151도
한 색으로 통일하면 최소 거리가 55도(엘리트 초록)까지 떨어진다 → 유닛별로 나눈다.
내 언매팅은 배경 최빈색을 자동 검출하므로 색이 달라도 처리 코드는 동일하다.

=== 프레임 ===
일반몹: 1자세만 받아 4프레임을 내가 합성 (bob ±1px + 팔다리 ±1px 이 원본의 전부다)
엘리트: 2자세(기본/행동). 코드가 프레임 0~1=기본, 2~3=행동으로 쓴다.

실행: python3 tools/make_enemy_requests.py
출력: docs/요청문_적/ 안에 11개 txt
"""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs' / '요청문_적'
OUT.mkdir(exist_ok=True)

COMMON = """
VIEW: side view, facing RIGHT. A slight 3/4 angle is fine. The whole body
must be visible from the side. NO front view, NO back view, NO isometric.

SILHOUETTE (most important): this sprite will be displayed at only about
{px} pixels tall. Arms, legs and equipment must clearly SEPARATE from the
torso with visible gaps so the shape reads at that size. Bold chunky forms.
No thin details, no small trinkets, no clutter.

HIGH LOCAL CONTRAST (critical): because it is shown so small, soft mid-tones
disappear. Use a SMALL number of brightness steps (5 or 6) and push them FAR
APART, so neighbouring surfaces differ sharply. Every plate, strap and limb
should be a distinct flat step against the one next to it. Avoid smooth
blending and avoid crowding many similar mid-tones together.

STYLE: hand-painted 16-bit game art. Hard edges, no anti-aliasing, no
gradients, no soft blur. Single light source from the UPPER LEFT.
Grim, damp, underworld dungeon.

DO NOT DRAW: no outline stroke, no rim light, no glow, no ground shadow, no
floor, no pedestal, no background objects, no text, no watermark.
(The game adds its own bright rim light and draws shadows separately.)

BACKGROUND: solid pure {bgname} {bg}, completely flat, nothing else.
No frame, no vignette, no gradient.

Output a single image, {out}.
"""

ENEMIES = [
    ('E1_goblin__bg_BLUE.txt', 'goblin.png', '#0000FF', 'BLUE', 35, '512x512', """\
A single side-view enemy character sprite for a 2D top-down dungeon game.

CHARACTER: a small hunched goblin warrior with pointed ears and glowing
yellow eyes, holding a short wooden club in one hand. Skin is muted olive
green #6c9c4a. He wears dark ragged brown cloth #564234.
Standing in a neutral walking pose, one foot slightly forward.
"""),
    ('E2_hound__bg_BLUE.txt', 'hound.png', '#0000FF', 'BLUE', 35, '512x512', """\
A single side-view enemy creature sprite for a 2D top-down dungeon game.

CHARACTER: a lean four-legged hunting hound. Dark grey-brown fur #604a3e,
glowing red eyes, a long tail, head thrust forward and low.
Standing in a mid-stride prowling pose.

IMPORTANT — the body must be clearly WIDER THAN TALL, low and horizontal.
This low silhouette is the only way a player tells it apart from the other
enemies at small size. Do not draw it upright or dog-show-like; it is a
crouched, stretched-out predator.
"""),
    ('E3_archer__bg_BLUE.txt', 'archer.png', '#0000FF', 'BLUE', 35, '512x512', """\
A single side-view enemy character sprite for a 2D top-down dungeon game.

CHARACTER: an upright goblin archer holding a wooden shortbow. He wears a
dull mustard-yellow hood #b08e42. Skin is muted olive green #6c9c4a with
glowing yellow eyes.
Standing in a neutral walking pose, bow held at his side.

IMPORTANT — the bow must be clearly SEPARATED from the body with a visible
gap, so its curve reads as a distinct shape at small size.
"""),
]

# (파일명, 저장명, 배경, 배경이름, 종류, 지배적 장비, 강조색, 기본자세, 행동자세)
ELITES = [
    ('charger', 'charger', '#00FFFF', 'CYAN', 'charging brute',
     'two huge curved horns on the helmet and a heavy round shield held forward',
     'deep red #ec6050',
     'standing in a neutral walking pose, shield lowered at his side',
     'braced low and leaning forward, shield raised in front, weight on the back leg, '
     'about to charge'),
    ('bombardier', 'bombardier', '#00FFFF', 'CYAN', 'mortar bombardier',
     'a short thick mortar tube mounted on its back, pointing up and back',
     'orange #f29840',
     'standing in a neutral walking pose, mortar tube resting',
     'crouched down with the mortar tube tilted up high, one hand steadying it, '
     'about to fire'),
    ('scatter', 'scatter', '#FF0000', 'RED', 'scattershot gunner',
     'a fan of five short thick barrels spread apart like a hand of cards',
     'teal #6ed6ce',
     'standing in a neutral walking pose, the fan of barrels held down at his side',
     'all five barrels raised and levelled forward, spread wide, body squared up, '
     'about to fire'),
    ('warden', 'warden', '#FFFF00', 'YELLOW', 'standard-bearer warden',
     'a tall banner pole held upright and a glowing orb floating beside his shoulder',
     'violet #c08ef4',
     'standing in a neutral walking pose, banner pole held at his side, orb dim',
     'banner raised high overhead with both hands, the orb flaring bright beside him'),
]

ELITE_HEAD = """\
A single side-view elite enemy sprite for a 2D top-down dungeon game.

CHARACTER: an armored elite {kind}.

POSE: {pose}

SILHOUETTE RULE — this unit must be identifiable BY SHAPE ALONE at small
size, because the player has to recognise it and pick an escape direction.
Give it ONE dominant oversized piece of equipment: {gear}.
Keep the TORSO NARROW so that equipment dominates the outline. Do NOT add
extra straps, belts, banners, capes or trim beyond what is listed — they
fill in the silhouette and destroy readability. No gold banding, no large
bright plates.

COLOR: dark iron armor as the base, with {accent} as the SINGLE accent color
on that equipment plus a few small trim points. Nothing else is saturated.
"""

ELITE_CONT = """\
Using the EXACT SAME character as the attached image — same armor, same
equipment, same accent color, same proportions, same palette — draw the same
unit in a different pose.

POSE: {pose}

Keep the character IDENTICAL in every other way. Same height, same distance
from camera, same silhouette rules (narrow torso, one dominant piece of
equipment: {gear}). Same single accent color {accent} on dark iron armor.
"""

n = 0
for fname, save, bg, bgname, px, out, head in ENEMIES:
    body = head + COMMON.format(px=px, bg=bg, bgname=bgname, out=out)
    (OUT / fname).write_text(body.strip() + '\n', encoding='utf-8')
    n += 1

for i, (key, save, bg, bgname, kind, gear, accent, pose_a, pose_b) in enumerate(ELITES):
    a = ELITE_HEAD.format(kind=kind, pose=pose_a, gear=gear, accent=accent)
    a += COMMON.format(px=58, bg=bg, bgname=bgname, out='512x512')
    fa = f'F{i * 2 + 1}_{key}_idle__bg_{bgname}.txt'
    (OUT / fa).write_text(a.strip() + '\n', encoding='utf-8')

    b = ELITE_CONT.format(pose=pose_b, gear=gear, accent=accent)
    b += COMMON.format(px=58, bg=bg, bgname=bgname, out='512x512')
    fb = f'F{i * 2 + 2}_{key}_action__bg_{bgname}__attach_F{i * 2 + 1}.txt'
    (OUT / fb).write_text(b.strip() + '\n', encoding='utf-8')
    n += 2

print(f'{OUT} 에 {n}개 생성\n')
import re
for f in sorted(OUT.glob('*.txt')):
    s = f.read_text(encoding='utf-8')
    bgm = re.search(r'solid pure (\w+) (#\w+)', s)
    print(f'  {f.name:52} 배경 {bgm.group(1) if bgm else "?":7} {len(s)}자')

print()
bad = 0
for f in sorted(OUT.glob('*.txt')):
    s = f.read_text(encoding='utf-8')
    for ok, msg in [
        (not re.search(r'[가-힣]', s), '한국어 섞임'),
        ('{' not in s, '치환 슬롯 잔여'),
        ('HIGH LOCAL CONTRAST' in s, '국소 대비 조건 없음'),
        ('no ground shadow' in s, '그림자 금지 없음'),
        ('no outline stroke' in s, '외곽선 금지 없음'),
        ('facing RIGHT' in s, '측면 우향 없음'),
        (re.search(r'solid pure \w+ #\w{6}', s) is not None, '배경색 지정 없음'),
    ]:
        if not ok:
            print(f'  ❌ {f.name}: {msg}')
            bad += 1
print('검증 전부 통과' if not bad else f'⚠️ {bad}건 실패')
