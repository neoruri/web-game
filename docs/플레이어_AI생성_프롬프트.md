# 플레이어 스프라이트 AI 재생성 — 프롬프트 키트

> 목적: **현재 컨셉(후드 궁수)을 유지**하면서 ① 움직임의 어색함 ② 지저분한 외곽
> ③ 배경·프롭과의 톤 이질감을 고친다.
> 프롭·바닥과 같은 분업: **AI 가 그림을 만들고, 스크립트가 규격·정렬·톤을 잡는다.**

---

## 1. 먼저 — 실측 진단 (무엇이 문제였나)

시트 자체는 깨끗하다. 불투명 97.7%, 반투명 프린지 0.8%, 고립 픽셀 0.11%.
**"지저분함"은 시트의 오염이 아니다.** 원인은 아래 6개다.

| # | 문제 | 실측 | 프롬프트로 해결? |
|---|---|---|---|
| 1 | **축소 리샘플링** — 96×116 을 화면에 53×64(55%)로 축소하는데 필터가 NEAREST | scale 0.55 | ❌ **코드** |
| 2 | 밝은 외곽점이 얼룩덜룩 + postFX glow 가 이중으로 덧씌워짐 | 밝은 고립점 814개 | ✅ |
| 3 | **run 5프레임 / back_run 7프레임** (skip:1 적용 후) → 좌우 걸음 비대칭 = 절뚝임 | 홀수 | ✅ |
| 4 | back_run 마지막 프레임에서 머리가 튄다 | 머리 y 18~20 → **24** | ✅ |
| 5 | **death 에 쓰러지는 구간이 없다** — 서 있다가 바로 엎어짐 | 높이 91 → **43** 급변 | ✅ |
| 6 | 톤이 배경·프롭보다 **차갑다(파랑기)** | R−B **−7.2** (바닥 +3.5 / 프롭 +5.5) | ✅ |
| — | hit 이 2프레임뿐 | | ✅ |

> ⚠️ **1번은 재생성으로 안 고쳐진다.** NEAREST 는 픽셀아트를 **정수배 확대**할 때 쓰는 필터다.
> 일반몹(1.1배 확대)·엘리트(1.2배 확대)에는 맞지만, 플레이어는 유일하게 **0.55배 축소**다.
> 축소에 NEAREST 를 쓰면 픽셀이 불규칙하게 버려지고, 버려지는 픽셀이 캐릭터 위치에 따라
> 달라지므로 **움직일 때 외곽이 반짝인다.** 이게 "지저분함"의 가장 큰 몫이다.
> → 별건으로 처리한다(§6). 그림을 다시 받아도 이건 남는다.

> 좋은 소식: **접지선은 완벽하다.** 7행 전체에서 발끝 y=108 로 일치한다.
> 세로 흔들림은 없다 — 이건 유지하면 된다.

---

## 2. 유지할 컨셉 (바꾸지 말 것)

현재 캐릭터를 확대해 확인한 내용. `player_frames.json` 의 이름은 "Underworld Demon Hunter".

- **긴 후드 + 바닥까지 오는 망토.** 짙은 차콜색. 달릴 때 뒤로 크게 펄럭인다
- **등에 화살통** — 화살 깃이 어깨 위로 삐져나옴 (실루엣 식별 포인트)
- **어두운 가죽 갑옷** + 가슴·허리 스트랩에 녹빛/적갈색 포인트
- 후드 안으로 **창백한 얼굴**과 **적갈색 머리카락** 몇 갈래
- **긴 부츠** + 각반
- **큰 리커브 활** (공격 프레임에서만 크게 보인다)

---

## 3. 절대 지켜야 하는 규격

| 항목 | 값 | 왜 |
|---|---|---|
| 시점 | **측면(우향)**. `run`·`idle`·`attack` 전부 | `setFlipX` 로 좌향을 만든다 → 정면 금지 |
| **`back_run` 만 예외** | **뒤에서 본 3/4 뷰** | 위로 이동할 때 쓰는 애니다(`vy < -0.35`). 등이 보여야 한다 |
| 접지선 | **모든 프레임에서 발끝을 같은 높이에** | 현재 y=108 로 완벽. 어긋나면 걸을 때 위아래로 튄다 |
| 가로 중심 | 프레임 간 **±3px 이내** | 지금 run 이 7.4px 흔들려 좌우로 떨린다 |
| 바닥 그림자 | **넣지 말 것** | 게임이 별도로 그린다 (`fillEllipse`) |
| 외곽선·림·발광 | **넣지 말 것** | `postFX.addGlow(0xaab2bd, 2, …)` 가 코드에서 붙인다. 그려오면 이중이 된다 |
| 배경 | **순수 마젠타 `#FF00FF`** | 크로마키로 뺀다 |

### 톤 목표 (실측 기반)

```
현재 플레이어   명도 55.9   R−B −7.2   G−R −1.9   ← 파랑기. 이게 이질감의 원인
새 프롭        명도 58.4   R−B +5.5   G−R +6.0
바닥           명도 40.9   R−B +3.5   G−R +5.9
목표           명도 56~60  R−B  +4~6  G−R  +5~7
```

**명도는 그대로 두고 색조만 바꾼다.** 차가운 청회색 → **차가운 회녹색**.
망토·후드 색을 이 값으로 지정하면 된다:

```
가장 어두운 그늘  #1e2420
중간 그늘        #333b34
망토·후드 기본    #474f45
밝은 면          #5f665a
하이라이트        #7d8574
포인트(스트랩)     #7a4a38   ← 적갈색. 유일한 따뜻한 색
피부            #c9b09a
머리카락         #8a5236
```

> 배경과 **같아지면 안 된다.** 바닥이 40.9 이므로 캐릭터는 56~60 을 유지해 15~20 밝게 남긴다.

---

## 4. 프레임 구성 — 이렇게 요청한다

**셀 96×116, 8열 × 7행 유지** (로더 규격 그대로 → 로딩 코드 변경 없음).

| 행 | 애니 | 프레임 | 내용 | 현재와 차이 |
|---|---|---|---|---|
| 0 | idle | **4** | 호흡 — 어깨·망토가 천천히 오르내림 | 유지 (현재 완벽) |
| 1 | run | **6** | 달리기 1사이클. **6프레임 전부 달리는 자세** | 정지 자세 프레임 제거 |
| 2 | back_run | **6** | 뒤에서 본 달리기 1사이클 | 8 → 6, 정지 자세 제거 |
| 3 | attack | **4** | 당김 → 발사 → 반동 → 복귀 | 유지 |
| 4 | multishot | **5** | 활을 넓게 당겨 여러 발 | 유지 |
| 5 | hit | **3** | 움찔 → 뒤로 밀림 → 복귀 | 2 → 3 |
| 6 | death | **6** | **비틀 → 무릎 꺾임 → 쓰러지는 중 → 착지 → 엎어짐 → 정지** | 5 → 6, 낙하 구간 추가 |

### 왜 run 을 6으로 맞추는가

달리기는 **왼발·오른발 두 걸음이 한 사이클**이다. 프레임 수가 홀수면
루프가 한 바퀴 돌 때 좌우가 안 맞아 절뚝이는 것처럼 보인다.
지금 `skip:1` 로 5프레임이 돌고 있어서 정확히 그 증상이 난다.
**6 = 한 걸음당 3프레임 × 2** 로 대칭이 맞는다.

```
프레임 0  오른발 접지 (체중 실림)
프레임 1  오른발로 밀어냄 · 몸이 가장 높음
프레임 2  공중 · 왼발이 앞으로
프레임 3  왼발 접지 (0의 좌우 반전 자세)
프레임 4  왼발로 밀어냄 · 몸이 가장 높음
프레임 5  공중 · 오른발이 앞으로
```

이 6줄을 프롬프트에 그대로 넣는다. **"프레임 3은 프레임 0의 반대 발"** 이라고
명시하는 게 핵심이다.

---

## 5. 요청 방법 — 8번에 나눠서

> ⚠️ **프롭 때와 반대다.** 프롭은 "기존 이미지를 첨부하지 말라"고 했지만,
> 여기서는 **30프레임이 같은 캐릭터여야 하는 것**이 전부다.
> → 먼저 기준 이미지 1장을 받고, **그 이미지를 첨부해서** 나머지를 요청한다.

### STEP 1 — 캐릭터 기준 이미지 (1장)

```
A single character design sprite for a 2D top-down dungeon game.

CHARACTER: a hooded demon hunter archer. Long hood and a full-length cloak
that reaches the ankles. A quiver of arrows on the back with the fletching
sticking up above the shoulder. Dark leather armor with straps across the
chest and waist. Pale face barely visible inside the hood, a few strands of
reddish-brown hair. Tall dark boots with leg wraps. Carries a large recurve
bow, held lowered at rest.

VIEW: side view, facing RIGHT, standing in a neutral idle pose, feet flat
on the ground. Full body visible. NO front view, NO isometric.

PALETTE: cool desaturated GREY-GREEN, exactly these values:
  #1e2420 deepest shadow   #333b34 mid shadow   #474f45 cloak/hood base
  #5f665a lit surface      #7d8574 highlight
  #7a4a38 rust accent (straps only — the ONLY warm color)
  #c9b09a skin   #8a5236 hair
Grim, damp, underworld. NO blue cast, NO teal, NO saturated color.

STYLE: detailed 16-bit style hand-painted pixel art. Hard edges, no
anti-aliasing, no gradients, no soft blur. Readable at small size:
bold silhouette, arms and cloak clearly separated from the torso.

DO NOT DRAW: no outline, no border stroke, no rim light, no glow,
no ground shadow, no floor, no pedestal, no background objects.

BACKGROUND: solid pure magenta #FF00FF, flat, nothing else. No frame,
no vignette, no text, no watermark.

Output a single image, 512x768 (tall), character centered and filling
most of the frame height.
```

이 결과가 마음에 들 때까지 반복한다. **여기서 확정된 캐릭터가 나머지 7장의 기준이 된다.**

### STEP 2 — 애니메이션 7장 (기준 이미지를 첨부해서 요청)

```
[기준 이미지 첨부]

Using the EXACT SAME character as the attached image — same hood, same
cloak, same quiver, same armor, same palette, same proportions — draw an
animation strip.

ANIMATION: {{ANIM}}
FRAMES: {{N}} frames in ONE horizontal row, evenly spaced, left to right.

{{DESCRIPTION}}

CRITICAL — the frames must line up:
 - Every frame the SAME height. The character's FEET must be on the exact
   same ground line in all frames (except where noted).
 - The character's body must stay HORIZONTALLY CENTERED in its frame.
   Do not let it drift left or right across the strip.
 - Same distance from camera in every frame. Do not zoom.

VIEW: side view, facing RIGHT.

Same style rules as before: hand-painted 16-bit pixel art, hard edges,
no anti-aliasing, no gradients, light from the UPPER LEFT.
NO outline, NO rim light, NO glow, NO ground shadow, NO floor.
BACKGROUND: solid pure magenta #FF00FF, flat, nothing else.

Output {{W}}x768.
```

### 치환값 7개

**① idle — 4프레임 · `Output 2048x768`**
```
A slow breathing idle. Frame 1 neutral. Frame 2 chest and shoulders rise
slightly, cloak drifts. Frame 3 highest point. Frame 4 settling back down.
The movement is SUBTLE — only a few pixels. Feet do not move at all.
```

**② run — 6프레임 · `Output 3072x768`**
```
One full running cycle, TWO steps. Cloak billows backward.
 Frame 1  right foot planted, weight on it, body lowest
 Frame 2  pushing off the right foot, body rising, left knee coming forward
 Frame 3  airborne, left leg extended forward, body highest
 Frame 4  left foot planted — the MIRROR of frame 1 (opposite leg)
 Frame 5  pushing off the left foot, body rising, right knee forward
 Frame 6  airborne, right leg extended forward, body highest
IMPORTANT: frames 4-6 must be the same motion as 1-3 but with the legs
swapped, so the cycle loops seamlessly and both legs step equally.
```

**③ back_run — 6프레임 · `Output 3072x768`**
```
⚠️ REAR VIEW — the character seen FROM BEHIND, running away from the
viewer (up the screen). We see the back of the hood, the back of the cloak,
and the quiver. The face is not visible.
Same 6-frame two-step cycle as the running animation: frames 4-6 mirror
frames 1-3 with the legs swapped.
```

**④ attack — 4프레임 · `Output 2048x768`**
```
Firing the bow, side view.
 Frame 1  bow raised, string being drawn back, arrow nocked
 Frame 2  full draw, string at maximum tension, body braced
 Frame 3  release — string snapped forward, cloak and hair kick back
 Frame 4  recovering, bow lowering, arm relaxing
Feet stay planted on the same ground line throughout.
```

**⑤ multishot — 5프레임 · `Output 2560x768`**
```
Firing MULTIPLE arrows at once, side view. More dramatic than a normal shot.
 Frame 1  bow raised, several arrows being nocked together
 Frame 2  drawing back, arrows visibly fanned apart
 Frame 3  full draw, body leaning into it, arrows spread wide
 Frame 4  release — all arrows leaving, strong recoil, cloak flung back
 Frame 5  recovering
```

**⑥ hit — 3프레임 · `Output 1536x768`**
```
Taking damage, side view.
 Frame 1  sharp flinch, head snapping back, shoulders hunching
 Frame 2  pushed backward, body bent, one foot sliding back
 Frame 3  recovering toward the neutral standing pose
```

**⑦ death — 6프레임 · `Output 3072x768`**
```
Collapsing and dying, side view. The fall must be SHOWN, not skipped.
 Frame 1  staggering, still upright, head dropping
 Frame 2  knees buckling, body sinking, bow slipping from the hand
 Frame 3  MID-FALL — body tilted about 45 degrees, off balance, arms loose
 Frame 4  hitting the ground, impact, cloak spreading out
 Frame 5  lying face down on the ground, still settling
 Frame 6  completely still, lying flat, cloak draped
NOTE: frames 1-2 stand on the ground line; frames 3-6 progressively lie
down. The character must remain inside its frame.
```

> 프레임 3(중간 낙하)이 이번 재생성의 핵심이다. 지금은 서 있다가 **바로 엎어진다**
> (높이 91 → 43 급변). 이 한 프레임이 죽음 연출을 완전히 바꾼다.

---

## 6. 프롬프트로 안 되는 것 — 내가 코드로 처리한다

### ① 축소 리샘플링 (가장 큰 원인)

플레이어만 **0.55배 축소**로 그려진다. NEAREST 는 확대용 필터라 축소에서 픽셀을
불규칙하게 버리고, 캐릭터가 움직이면 버려지는 픽셀이 바뀌어 외곽이 반짝인다.

두 가지 해법을 A/B 로 비교해 보여드린다:

- **A. 이 텍스처만 LINEAR 필터로** — 한 줄 수정. 부드럽게 축소된다.
  그림 자체가 12,898색 페인팅이라 부드러운 게 오히려 프롭과 어울린다.
- **B. 시트를 화면 크기(53×64)로 저장하고 `PLAYER_SPRITE_K` 를 0.1 로** — 기본 배율이
  1.0 이 되어 **리샘플링이 아예 없어진다.** 가장 또렷하지만 크기 슬라이더를
  올리면 확대가 된다(일반몹과 같은 조건).

### ② 이중 림라이트

AI 가 그린 얼룩진 밝은 외곽점(814개)과 `postFX.addGlow` 가 겹쳐 있다.
새 시트는 외곽선 없이 받아서 glow 하나만 남긴다.

### ③ 프레임 정의 수정 (`main.js` 의 `defs`)

```js
run:      { row: 1, frames: 6, fps: 12, loop: true }              // skip 제거
back_run: { row: 2, frames: 6, fps: 12, loop: true }              // 8→6, skip 제거
hit:      { row: 5, frames: 3, fps: 10, loop: false }              // 2→3
death:    { row: 6, frames: 6, fps: 10, loop: false }              // 5→6
```

---

## 7. 받은 뒤 내가 하는 일

파일을 `tools/sprites/` 에 넣고 **어느 게 어느 애니인지** 알려주시면 됩니다
(파일명에 `idle`, `run`, `back_run`, `attack`, `multishot`, `hit`, `death` 가 들어가면 최고).

1. **마젠타 크로마키** — 언매팅으로 알파 추정 (프롭에서 프린지 0px 달성한 방식)
2. **프레임 분할** — 스트립을 균등 분할이 아니라 **불투명 영역 런렝스**로 자른다
   (AI 는 균등 간격을 잘 못 맞춘다 — 바닥 격자가 83~107px 로 나온 것과 같은 이유)
3. **접지선 정렬** — 프레임별 발끝을 찾아 **y=108 로 통일**. 지금 시트의 최대 강점이라 유지
4. **가로 중심 정렬** — 프레임 간 중심 편차를 ±3px 이내로 보정 (지금 run 이 7.4px)
5. **96×116 셀로 축소 + 8열×7행 시트 조립** → 로더 규격 동일
6. **톤 검증** — 명도·R−B·G−R 을 재서 목표(56~60 / +4~6 / +5~7) 확인, 벗어나면 보정
7. **프레임 정렬 리포트** — §1 과 같은 표를 다시 뽑아 편차가 줄었는지 수치로 확인
8. **애니메이션 GIF + 새 바닥 위 비교 이미지** 생성 → 적용 전에 보여드림

---

## 8. 저작권

프롭·바닥과 동일하다. AI 생성물의 픽셀을 가공해 쓴다.
Poki 는 "AI 에셋을 충분히 편집·다듬어 어우러지게 하라"고 요구하며,
**요청 시 툴·프롬프트·반복 과정을 제출할 수 있어야 한다.** 이 문서가 그 기록이다.
