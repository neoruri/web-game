# 프롭 스프라이트 AI 생성 — 프롬프트 키트

> 목적: 무덤·기둥·부서진벽·횃불 8종을 다른 AI(제미나이/ChatGPT)로 다시 만들어
> 새 바닥(제미나이 텍스처 D1.5)과 톤을 맞춘다.
> 바닥 때와 같은 분업 — **AI가 질감을 만들고, 코드가 규격·톤·정렬을 잡는다.**

---

## 1. 8칸의 역할 — 코드가 요구하는 것 (main.js 확인)

`propAt()` 이 **인덱스로** 종류를 고르고 출현 빈도를 준다.
디자인은 새로 만들어도 되지만 **칸 수(8)와 각 칸의 성격**은 맞춰야 코드 변경이 0이다.

| # | 코드상 종류 | 출현 빈도 | 현재 실측 h | 자유도 |
|---|---|---|---|---|
| 0 | 무덤 | 15% | 81 | 자유 (세로로 솟는 물체) |
| 1 | 해골더미 | 10% | 81 | 자유 (해골과 뼈 여러개가 겹친 형태) |
| 2 | 석관 | **2%** | 61 | 자유 (가장 드물다 — 공들일 필요 적음) |
| 3 | 기둥 | 10% | 112 (꽉 참) | 자유 (가장 높은 물체) |
| 4 | **부러진 기둥** | 8% | 67 | 자유 (3번의 부러진 형제) |
| 5 | 부서진 벽 | 10% | 77 | 자유 (가장 넓다, 83px) |
| 6 | **횃불 — 고정** | **32%** | 98 | ⚠️ 아래 참고 |
| 7 | 바닥 잔해 | 8% | 24 | 자유 (가장 낮고 납작) |

> ⚠️ **6번만 코드에 하드코딩돼 있다.** `drawProps()` 의 `if (it.f === 6)` 이
> ① 바닥에 따뜻한 원형 광원을 가산 합성하고 ② `torchLights` 에 좌표를 넣어
> `gfxFlames` 가 불꽃 애니메이션을 그린다. 화로 높이는 **접지선에서 76px 위**로 고정.
> → 6번은 **불을 담는 물체**여야 하고, **스프라이트에 불꽃을 그리면 안 된다**(이중 겹침).
> 다른 걸 넣고 싶으면 코드를 고쳐야 한다.

> 💡 **횃불이 32%로 압도적으로 흔하다**(조명이 화면에 항상 보이게 한 설계).
> 8종 중 하나에만 공을 들일 수 있다면 6번이다. 반대로 2번 석관은 2%다.

---

## 2. 절대 지켜야 하는 규격

| 항목 | 값 | 왜 |
|---|---|---|
| 투영 | **아이소메트릭 2:1** | 바닥 다이아몬드가 128×64 다. 원근(perspective)이면 안 맞는다 |
| 셀 | 96×112 (내가 맞춘다) | 원본은 크게 받아서 내가 축소 |
| **접지선** | **셀 높이의 91% 지점 (y=102)** | `ANCHOR = CH-10`. **맨 아래가 아니다.** 그림자만 아래 9px 을 채운다 |
| 확대 | **없음 — 96×112 원본 크기로 그려진다** | 잔 디테일은 다 사라진다. 형태를 굵게 |
| 광원 | **좌상단, 전부 동일** | 프롭마다 다르면 붙여넣은 것처럼 보인다 |
| 바닥 그림자 | **스프라이트에 포함** | 게임이 프롭 그림자를 안 그린다(적·플레이어만 그림) |
| 배경 | **순수 마젠타 #FF00FF** | 알파를 직접 못 만드니 크로마키로 뺀다 |
| 목표 명도 | 평균 60~65 | 바닥이 40.9. 20~25 밝아야 뜨지도 묻히지도 않는다 |

> 접지선 보정은 **내가 자동으로 한다.** AI 에게는 "물체가 바닥에 닿고, 그림자가
> 그 발밑에 고인다"만 요구하면 되고, y=102 정렬은 코드가 맞춘다.

> 높은 프롭이 플레이어를 가리면 게임이 **자동으로 40% 반투명 처리**한다
> (`isFront` + 겹침 판정). 3번 기둥처럼 셀을 꽉 채워도 괜찮다.

### 팔레트 (바닥에서 실측해 계산 — 그대로 프롬프트에 넣으면 된다)

```
가장 어두운 그늘  #212920
중간 그늘        #404a3b
기본 면          #58614f
밝은 면          #707964
하이라이트        #97a487
```

색조는 바닥과 동일한 **차가운 회녹색**이다(R−B +3.5, G−R +6).
지금 프롭이 R−B **−20.9**(파랑기)여서 톤이 튀는 게 문제였다.

---

## 3. 프롬프트 — 개별 생성 (권장)

**8번을 따로 요청하는 게 시트로 한 번에 받는 것보다 훨씬 낫다.**
바닥 때 격자 간격이 83~107px로 불규칙하게 나온 것과 같은 이유 — 모델은
"한 이미지 안에 여러 칸을 균일하게" 만드는 걸 잘 못한다.

아래에서 `{{OBJECT}}` 만 바꿔 8번 돌린다.

```
A single isometric game prop sprite for a 2D dungeon game.

OBJECT: {{OBJECT}}

PROJECTION: strict isometric, 2:1 ratio (a floor tile in this game is a
128x64 diamond). Viewed from above at an isometric angle. NO perspective,
NO vanishing point, NO camera tilt. Top faces must read as 2:1 diamonds.

LIGHTING: single light source from the UPPER LEFT. Top and upper-left faces
lighter, lower-right faces darker. Flat, even, no bloom, no glow.
Include a soft dark shadow pooled on the ground at the base of the object.

PALETTE: cool desaturated grey-green stone ONLY, exactly these five values:
  #212920 (deepest shadow)
  #404a3b (mid shadow)
  #58614f (base surface)
  #707964 (lit surface)
  #97a487 (highlight edge)
Damp, grimy, weathered dungeon stone. Small patches of dark moss are fine.
NO warm tones, NO brown, NO blue cast, NO saturated color.

STYLE: 16-bit pixel art. Hard pixel edges, no anti-aliasing, no soft blur,
no gradients. CHUNKY, BOLD, SIMPLE shapes — this sprite will be displayed
at only 96x112 pixels, so fine detail is useless. Big readable silhouette,
few large flat facets, strong light/dark separation between faces.

COMPOSITION: the object stands on the ground at the BOTTOM CENTER of the
image, touching the bottom edge area. Centered horizontally. Fill most of
the frame height.

BACKGROUND: solid pure magenta #FF00FF, completely flat, nothing else.
NO border, NO frame, NO vignette, NO gradient, NO text, NO watermark,
NO ground plane, NO other objects.

Output a single square image, 512x512.
```

### `{{OBJECT}}` 8개

```
0  an upright weathered stone gravestone with a rounded top and a carved cross
1  a weathered stone gravestone with a rounded top and carved cross, leaning
   noticeably to one side, half sunken
2  a low stone sarcophagus with its heavy lid slid partly off to one side,
   dark opening visible
3  a tall broken stone pillar with a square base and a cracked square capital,
   very tall and narrow
4  a broken stone pillar, snapped off low with a jagged rough break at the
   top, the fallen upper section lying on the ground beside its base
5  a collapsed brick wall segment, two or three courses of stone blocks
   remaining, rubble at the base, wider than tall
6  a tall thin iron torch stand with a small empty brazier bowl at the top
   holding crossed wooden logs — IMPORTANT: no fire, no flame, no glow,
   no light. Unlit. The logs are dark brown wood.
7  a scattered pile of broken flagstone shards lying flat on the ground,
   very low and flat, wider than tall
```

> 위 8개는 **현재 코드의 역할에 맞춘 예시**다. 디자인을 새로 가고 싶으면
> 0·1·2·3·4·5·7 은 자유롭게 바꿔도 된다(뼈·제단·해골더미·쇠창살·깨진 항아리 등).
> 지켜야 하는 건 **6번이 불을 담는 물체**라는 것, **3번이 가장 높고 7번이 가장 납작**하다는
> 것뿐이다. 0↔1 과 3↔4 는 "온전한 것 / 망가진 것" 쌍이라 같은 물체로 두면 자연스럽다.

> **이 프롬프트는 텍스트만으로 완결돼 있다 — 기존 프롭 이미지를 첨부하지 말 것.**
> 첨부하면 새 디자인이 아니라 기존 것을 모사하게 되고, 현재 프롭의 파란 색조
> (R−B −20.9)까지 따라와 톤 문제가 재발한다.

---

## 4. 프롬프트 — 시트로 한 번에 (빠르지만 품질 낮음)

급하면 이쪽. 개별 생성분과 섞어 쓰면 광원이 어긋나므로 **한쪽만** 쓸 것.

```
A sprite sheet of 8 isometric dungeon props in ONE horizontal row,
evenly spaced, on a solid pure magenta #FF00FF background.

From left to right:
1) upright cross gravestone
2) leaning cross gravestone
3) stone sarcophagus with lid slid open
4) tall broken pillar
5) small stone altar with a slab beside it
6) collapsed brick wall segment
7) tall thin unlit torch stand with crossed wooden logs (NO fire, NO flame)
8) flat pile of broken flagstone shards

ALL eight must share:
 - strict isometric 2:1 projection, no perspective
 - the SAME light direction (upper left)
 - the SAME palette: #212920 #404a3b #58614f #707964 #97a487
   (cool grey-green stone only, no warm or blue tones)
 - each object STANDING ON THE SAME GROUND LINE, bottoms aligned
 - a soft dark ground shadow at each base
 - 16-bit pixel art, hard edges, no anti-aliasing, no gradients

Background must be flat pure magenta with nothing else — no border, no
frame, no vignette, no grid lines, no labels, no text, no watermark.

Output 2048x512.
```

---

## 5. 예상되는 실패 — 바닥 작업에서 겪은 것들

| 증상 | 대응 |
|---|---|
| **원근으로 그려온다** (가장 흔함) | 가장 큰 실패다. "strict isometric, top face is a 2:1 diamond, NO perspective" 를 다시 강조해서 재생성 |
| 테두리·비네트를 넣는다 | 바닥에서 60px 비네트가 들어왔다. **내가 크롭으로 걷어낼 수 있다** |
| 우하단 워터마크 | 바닥에서도 있었다(965,970). 내가 회피 크롭 |
| 배경이 순수 마젠타가 아님 | 그라데이션이 섞이면 키잉이 지저분해진다 → 재생성 요청 |
| 프롭마다 광원이 다름 | 개별 생성의 최대 약점. 심하면 내가 코드로 보정 |
| 6번에 불꽃을 그림 | 코드가 불꽃을 따로 그리므로 겹친다 → 재생성 또는 내가 지움 |
| 안티에일리어싱이 들어감 | 축소하면서 어차피 다시 생기므로 **크게 문제 안 됨** |

---

## 6. 받은 뒤 내가 자동으로 하는 일

이미지를 `tools/sprites/` 에 넣어주시면 됩니다. 파일명은 아무래도 괜찮습니다.

1. **마젠타 크로마키** → 알파 생성 (경계 프린지 제거 포함)
2. **바닥선 정렬** — 불투명 픽셀의 최하단을 찾아 셀 y=111 에 맞춤.
   이게 안 맞으면 프롭이 공중에 뜨거나 바닥에 파묻힌다
3. **96×112 셀로 축소 + 8칸 스트립 조립** (기존 파일 규격과 동일 → 코드 변경 0)
4. **톤 검증** — 평균 명도와 R−B 를 재서 바닥(40.9 / +3.5)과의 관계 확인.
   목표를 벗어나면 감마·색조 보정으로 맞춤
5. **새 바닥 위에 얹은 비교 이미지** 생성 → 적용 전에 보여드림

---

## 7. ⚠️ 저작권 확인 (바닥에서도 언급한 것)

제미나이/ChatGPT 생성물은 **모델·플랜별로 상업적 이용 조건이 다릅니다.**
포털 제출이나 AdSense 수익화를 염두에 두신다면 사용 중인 서비스의
생성물 이용 약관을 한 번 확인하시는 게 좋습니다.
바닥 텍스처도 같은 조건이라 함께 확인 대상입니다.
