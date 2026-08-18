# 적·엘리트 스프라이트 AI 생성 — 프롬프트 키트

> 목적: 일반몹 3종 + 엘리트 4종을 프롭·바닥과 같은 방식(AI 질감 + 스크립트 보정)으로 재생성.
> 이유는 **아트 일관성**이다 — 새 프롭이 32px 적보다 훨씬 정밀해서 적이 납작해 보인다.

---

## 1. 요청할 이미지는 28장이 아니라 **11장**이다

시트는 프레임이 많지만, **애니메이션은 내가 합성한다.** 이유는 실측이다.

`gen_enemies.py` 의 4프레임은 이게 전부다:

```python
bob = [0, -1, 0, 1][f]      # 상하 ±1px
sw  = [0, 1, 0, -1][f]      # 팔·다리 ±1px
```

**±1px 흔들림이다.** 35px 스프라이트에서 이걸 AI에 4장 따로 그리게 하면
프레임마다 실루엣이 미묘하게 달라져서 오히려 떨린다. 한 자세를 받아 내가 흔드는 게 안정적이다.

| 대상 | AI 에 요청할 자세 | 내가 만들 프레임 |
|---|---|---|
| 일반몹 3종 | **1자세** (기본) | 4프레임 (bob + 다리 스윙) |
| 엘리트 4종 | **2자세** (기본 + 행동) | 4프레임 (0~1 기본, 2~3 행동) |

→ **합계 3 + 8 = 11장**

> ⚠️ 엘리트는 프레임 2~3 이 **행동 자세**로 하드코딩돼 있다.
> `main.js`: `const fr = acting ? 2 + (...&1) : (walk + e.animOff) & 3`
> 예고(`windup`)·돌진(`charging`) 중에 이 프레임을 쓴다. 그래서 2자세가 필요하다.

---

## 2. 절대 지켜야 하는 규격

| 항목 | 값 | 왜 |
|---|---|---|
| 시점 | **측면 반측면** (side / 3-4 view) | 게임이 `setFlipX` 로 좌우를 뒤집는다 → **정면·후면 금지** |
| 화면상 크기 | 일반몹 **35px**, 엘리트 **58px** | 셀 32/48 × 배율. 잔 디테일은 남지 않는다 |
| 배경 | **순수 마젠타 `#FF00FF`** | 알파를 못 만드니 크로마키로 뺀다 |
| **바닥 그림자** | **넣지 말 것** | 프롭과 반대다. 그림자는 게임이 별도로 그린다 |
| 외곽선 | **AI 는 그리지 말 것** | 밝은 림라이트를 내가 후처리로 붙인다 (아래 §3) |
| 실루엣 | 팔·다리·무기가 몸통에서 **떨어져 보이게** | 붙으면 35px 에서 덩어리가 된다 |

> 프롭과 다른 점 두 개를 헷갈리지 말 것: **그림자 없음**, **외곽선 없음.**

---

## 3. ⚠️ 밝은 림라이트는 타협 불가 — 내가 후처리로 붙인다

`gen_enemies.py` 에 이렇게 박혀 있다:

```python
RIM = (196, 214, 200)   # 바깥 밝은 림(가독성 핵심)
```

이건 장식이 아니다. **어두운 바닥에서 적이 사라지는 문제를 해결한 장치**이고,
바닥이 D1.5(감마 1.45)로 더 어두워져서 지금은 더 중요하다.
플레이어 캐릭터도 같은 이유로 림라이트를 넣은 이력이 있다(커밋 `36c811e`).

→ AI 에게 외곽선을 요청하지 않는다. 받은 뒤 내가 `outline()` 으로 **일정한 밝은 림**을 붙인다.
   AI 가 제멋대로 검은 테두리를 그려오면 림과 겹쳐 두꺼워지므로 프롬프트에서 금지한다.

---

## 4. 일반몹 3종 — 프롬프트

`{{CREATURE}}` 만 바꿔 3번 돌린다.

```
A single side-view character sprite for a 2D top-down dungeon game.

CHARACTER: {{CREATURE}}

VIEW: side view, facing RIGHT. Slight 3/4 angle is fine. The whole body
must be visible from the side. NO front view, NO back view, NO isometric.
Standing in a neutral idle/walking pose.

SILHOUETTE (most important): the character will be displayed at only about
35 pixels tall. Arms, legs and weapon must clearly separate from the torso
with visible gaps, so the shape reads at tiny size. Bold chunky forms.
No thin details, no small props, no clutter.

STYLE: 16-bit pixel art. Hard pixel edges, no anti-aliasing, no gradients,
no soft blur. Flat shading with a small number of distinct tones.
Single light source from the UPPER LEFT.

DO NOT DRAW: no outline, no border stroke, no rim light, no glow,
no ground shadow, no floor, no pedestal. The character only.

BACKGROUND: solid pure magenta #FF00FF, completely flat, nothing else.
No frame, no vignette, no gradient, no text, no watermark.

Output a single square image, 512x512, character centered and filling
most of the frame.
```

### `{{CREATURE}}` 3개 — 기존 팔레트 유지 (색으로 종류를 구분하는 설계)

```
1  a small hunched goblin warrior with pointed ears and yellow eyes, holding
   a short wooden club in one hand. Skin is muted olive green (#6c9c4a),
   wearing dark ragged brown cloth (#564234).

2  a lean four-legged hunting hound, LOW and HORIZONTAL body, head thrust
   forward low, long tail. Dark grey-brown fur (#604a3e), glowing red eyes.
   IMPORTANT: the body must be clearly wider than tall — the low silhouette
   is how players tell it apart from the others.

3  an upright goblin archer holding a wooden shortbow, wearing a dull
   mustard-yellow hood (#b08e42). Skin muted olive green (#6c9c4a),
   yellow eyes. The bow must be clearly separated from the body.
```

> 색은 종류 식별 장치다. 고블린 초록 / 사냥개 갈색 / 궁수 머스터드 — **바꾸지 말 것.**
> 사냥개는 **가로로 낮은 실루엣**이 유일한 즉시 식별 수단이다.

---

## 5. 엘리트 4종 — 프롬프트 (각 2자세)

### ⚠️ 1차 엘리트 작업에서 실패한 것

4종을 만들었는데 **실루엣이 전부 똑같아 보였다.** 원인은 넓은 금색 띠가 형태를 덮은 것.
몸통을 14px 로 좁히고 금색을 작은 스터드로 줄이고 **패턴마다 지배적인 장비 형태 하나**를
준 뒤에야 구분됐다. 이번에도 같은 규칙을 강제한다.

> **엘리트는 "무엇을 들고 있는가"로 구분된다.** 색은 보조 수단이다.
> 플레이어가 예고를 보고 회피 방향을 정해야 하므로 실루엣이 곧 게임플레이다.

| # | 종류 | 지배적 장비 (실루엣) | 색 | 회피법 |
|---|---|---|---|---|
| 0 | 돌격자 | **큰 뿔 + 방패** | 붉은 `#ec6050` | 측면 회피 |
| 1 | 포격수 | **등에 짧고 굵은 박격포** | 주황 `#f29840` | 자리 비우기 |
| 2 | 산탄사수 | **부채꼴로 펼친 여러 발사관** | 청록 `#6ed6ce` | 각도 이탈 |
| 3 | 수호자 | **긴 깃대 + 떠 있는 구슬** | 보라 `#c08ef4` | 우선 처치 |

```
A single side-view elite enemy sprite for a 2D top-down dungeon game.

CHARACTER: an armored elite {{KIND}}

POSE: {{POSE}}

VIEW: side view, facing RIGHT. Slight 3/4 angle is fine. NO front view,
NO back view.

SILHOUETTE (most important): displayed at only ~58 pixels tall. This unit
must be identifiable BY SHAPE ALONE at that size. Give it ONE dominant
oversized piece of equipment: {{GEAR}}. Keep the torso NARROW so that
equipment dominates the outline. Do not add extra straps, belts, banners,
capes or trim — they fill in the silhouette and destroy readability.

COLOR: dark iron armor as the base, with {{ACCENT}} as the single accent
color on the equipment and a few small trim points. No gold banding,
no large bright plates.

STYLE: 16-bit pixel art. Hard pixel edges, no anti-aliasing, no gradients.
Flat shading, few distinct tones. Light from the UPPER LEFT.

DO NOT DRAW: no outline, no border stroke, no rim light, no glow,
no ground shadow, no floor, no pedestal, no background objects.

BACKGROUND: solid pure magenta #FF00FF, flat, nothing else. No frame,
no vignette, no text, no watermark.

Output a single square image, 512x512, character centered.
```

### 치환값 — 4종 × 2자세 = 8장

| {{KIND}} | {{GEAR}} | {{ACCENT}} |
|---|---|---|
| `charging brute` | `two huge curved horns on the helmet and a heavy round shield held forward` | `deep red #ec6050` |
| `mortar bombardier` | `a short thick mortar tube mounted on its back, pointing up` | `orange #f29840` |
| `scattershot gunner` | `a fan of five short barrels spread out like a hand of cards` | `teal #6ed6ce` |
| `standard-bearer warden` | `a tall banner pole with a glowing orb floating beside it` | `violet #c08ef4` |

**{{POSE}} — 각 종류마다 이 두 개를 따로 요청**

```
자세 A (기본)  standing in a neutral walking pose, weapon lowered / at rest

자세 B (행동)  자세 A 와 같은 캐릭터·같은 색·같은 장비.
  · charging brute      → braced low and leaning forward, shield raised, about to charge
  · mortar bombardier   → mortar tube tilted up, body crouched, about to fire
  · scattershot gunner  → all five barrels raised and aimed forward
  · standard-bearer      → banner raised high overhead, orb glowing brighter
```

> 자세 B 프롬프트에는 **"자세 A 와 동일한 캐릭터"** 를 반드시 명시할 것.
> 안 그러면 다른 유닛이 나와서 예고 프레임에서 몹이 바뀌는 것처럼 보인다.
> 가능하면 같은 대화에서 이어 요청하는 게 일관성이 높다.

---

## 6. 예상되는 실패

| 증상 | 대응 |
|---|---|
| **정면·아이소로 그려온다** | 가장 흔하다. `setFlipX` 가 깨지므로 재생성 필수 |
| 팔·다리가 몸통에 붙어 덩어리가 됨 | 35px 에서 치명적. "visible gaps" 강조해 재생성 |
| 검은 외곽선을 그려옴 | 내 림라이트와 겹쳐 두꺼워진다 → 재생성 또는 내가 제거 |
| 자세 B 가 다른 캐릭터로 나옴 | 같은 대화에서 "자세 A 와 동일" 명시해 재요청 |
| 4종 실루엣이 비슷함 | 1차 실패 원인. 장비를 더 과장하고 몸통을 더 좁혀 재생성 |
| 배경이 순수 마젠타가 아님 | 그라데이션이면 키잉이 지저분해진다 → 재생성 |
| 안티에일리어싱이 들어감 | 축소하면서 어차피 재생성되므로 **문제 안 됨** |

---

## 7. 받은 뒤 내가 하는 일

파일명 아무래도 괜찮고 `tools/sprites/` 에 넣어주시면 됩니다.
**어느 게 어느 종류인지만 알려주세요**(파일명에 goblin / hound / charger_A 처럼 들어가면 최고).

1. **마젠타 크로마키** — 언매팅으로 알파 추정 + 배경 성분 제거 (프롭에서 프린지 0px 달성한 방식)
2. **셀 규격 축소** — 일반몹 32×32, 엘리트 48×48. 발끝을 원점 기준(`setOrigin(0.5, 0.72)`)에 맞춤
3. **프레임 합성** — bob ±1px + 다리 스윙 ±1px 로 4프레임. 엘리트는 0~1 기본 / 2~3 행동
4. **밝은 림라이트 부착** — `RIM (196,214,200)`. 이게 가독성의 핵심
5. **시트 조립** — `enemies_sheet.png` (128×96, 3행×4열), `elites_sheet.png` (192×192, 4행×4열)
   → 기존 규격과 동일하면 **코드 변경 0**
6. **가독성 검증** — 새 바닥(명도 40.9) 위에 얹어 명도차를 재고, 실제 배치 이미지로 확인
7. **적용 전에 비교 이미지로 보여드림**

---

## 8. 같이 진행되는 별건 (AI 불필요, 내가 처리)

- **그림자 → 공용 스프라이트** — 지금은 적 1명당 매 프레임 `fillEllipse`(Vector2 32개 할당).
  타원 PNG 1장 + 풀링 스프라이트로 교체. **스프라이트에 굽지 않는 이유**는
  ① `setTintFill` 이 그림자까지 흰색으로 칠한다 ② 몹이 겹칠 때 앞 몹 그림자가 뒤 몹을 덮는다.
- **동전 → 픽셀아트 스프라이트** — 지금은 동전 1개당 `fillEllipse` 5회.
  부드러운 안티에일리어싱 타원이 픽셀아트 사이에서 튀는 문제도 같이 해결된다.

이 둘은 AI 이미지를 기다리지 않으므로 먼저 진행합니다.
