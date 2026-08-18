# Stable Diffusion (Forge) 로 캐릭터 스프라이트 생성 — Claude Code 작업 지시

> 대상: Windows 에서 Claude Code CLI 로 작업하는 쪽.
> Forge 는 사용자 PC `127.0.0.1:7860` 에서 돌고, Cowork(클라우드) 세션은 거기에 닿지 못한다.
> 그래서 **생성은 CLI 가, 검증은 Cowork 가** 한다. 같은 폴더(`E:\claude\web-game`)를 본다.

---

## 0. 먼저 이해할 것 — Gemini 와 SD 는 다른 도구다

지금까지 이 프로젝트는 **Gemini(nano-banana)** 로 스프라이트를 만들었다.
`docs/요청문/*.txt` 는 **Gemini 용**으로 쓰인 문서다. 그걸 SD 에 그대로 넣으면 실패한다.

| | Gemini | Stable Diffusion (Forge) |
|---|---|---|
| 프롬프트 형식 | 긴 산문, 조건·금지사항을 문장으로 이해 | **태그 나열**. 긴 산문은 앞부분만 반영됨 |
| "Frame 1 은 …, Frame 3 은 …" | 이해함 | **이해 못 함.** 순차 지시 개념이 없다 |
| 참고 이미지로 캐릭터 유지 | 이미지 첨부 → "같은 캐릭터로" 가 통함 | **통하지 않음.** 별도 장치 필요 (§2) |
| `NO smoke`, `no ground line` 같은 금지 | 대체로 지킴 | Negative prompt 로 옮겨야 함 |
| 토큰 한도 | 넉넉함 | CLIP **75토큰 단위**로 잘림. 앞쪽이 강하다 |

**따라서 `A1_run_8frames__attach_C3.txt` (5,282자) 를 SD 에 그대로 주면 안 된다.**
그 문서는 참고 자료로 읽고, 아래 §3 형식으로 **다시 작성**해야 한다.

---

## 1. ⛔ SD 는 "8프레임 스프라이트 시트"를 한 장으로 못 만든다

SD 는 이미지 전체를 한 번에 디노이징한다. "왼쪽부터 순서대로 8개의 다른 포즈"라는
**시간 순서 개념이 없다.** 요청하면 비슷한 캐릭터 8명이 무작위 포즈로 서 있는 그림이 나온다.

→ **프레임을 한 장씩 생성하고, 나중에 이어 붙인다.** 이게 유일하게 작동하는 방식이다.
   붙이는 건 Cowork 쪽 파이프라인(`build_player_sheet.py`)이 이미 한다 —
   다만 지금은 "가로로 붙은 스트립 한 장"을 입력으로 받으니, 낱장 입력을 받도록
   고치는 건 Cowork 쪽에 요청하면 된다.

---

## 2. ⭐ 캐릭터 일관성 — 이게 SD 의 핵심 문제다

Gemini 는 참고 이미지를 첨부하고 "같은 캐릭터"라고 하면 됐다.
**SD 는 안 된다.** 텍스트 프롬프트만 주면 매번 다른 사람이 나온다.
같은 캐릭터를 8프레임에 걸쳐 유지하려면 아래 셋 중 하나(또는 조합)를 써야 한다.

### ① IP-Adapter — 캐릭터 외형 유지용. **가장 중요하다**
참고 이미지의 **인물 특징(의상·색·실루엣)** 을 추출해 생성에 주입한다.
- Forge 에서는 **ControlNet 탭 안에** `ip-adapter` 로 들어 있다
  (별도 확장이 아니다. Forge 는 ControlNet 통합판을 내장한다)
- 필요 모델: `ip-adapter_sd15.pth` 또는 `ip-adapter-plus_sd15.pth`
  (SDXL 이면 `ip-adapter_sdxl_vit-h.pth`)
- Preprocessor: `InsightFace` 는 **쓰지 말 것** — 얼굴 인식용이고 이 캐릭터는 후드로
  얼굴이 가려져 있다. `CLIP-ViT-H (IPAdapter)` 계열을 쓴다
- Control Weight **0.6~0.8** 권장. 1.0 은 참고 이미지 포즈까지 복사해버려
  "서 있는 자세"가 유지된다 (Gemini 에서 겪은 실패와 같은 현상)
- 참고 이미지: `tools/sprites/Gemini_Generated_Image_q68ywsq68ywsq68y.png` (= C3)

### ② ControlNet OpenPose — **포즈를 프레임마다 정확히 지정**
`docs/요청문/A1_run_8frames__attach_C3.txt` 에 프레임별 보폭·팔 각도가 적혀 있는데,
SD 에 글로 설명해도 안 통한다. **포즈는 그림(스켈레톤)으로 줘야 한다.**
- 필요 모델: `control_v11p_sd15_openpose.pth` (SDXL 이면 그에 맞는 것)
- 8프레임이면 **OpenPose 스켈레톤 이미지 8장**을 만들어 프레임마다 하나씩 넣는다
- 스켈레톤은 셋 중 하나로 얻는다:
  - 실제 런사이클 레퍼런스 이미지에 `openpose` preprocessor 를 돌려 추출
  - 온라인 포즈 에디터에서 직접 그림
  - **또는 파이썬으로 직접 그린다** — 관절 좌표만 알면 되고, 이게 가장 통제하기 쉽다
- Control Weight **0.9~1.1** (포즈는 강하게 잡아야 한다)

### ③ img2img — 이미 있는 프레임을 변형
idle 프레임을 넣고 denoising strength **0.5~0.65** 로 "달리는 자세"를 요청하는 방식.
- 장점: 캐릭터가 거의 그대로 유지된다
- 단점: **포즈가 크게 안 바뀐다.** 0.7 이상 올리면 캐릭터가 무너진다
- → 보조 수단이다. 이것만으로는 달리기가 안 나온다

### 권장 조합
```
IP-Adapter (0.7, C3 이미지)  +  ControlNet OpenPose (1.0, 프레임별 스켈레톤)
```
IP-Adapter 가 "누구인지"를, OpenPose 가 "어떤 자세인지"를 담당한다.
**둘 다 없으면 이 작업은 안 된다.** 하나만 쓰면 캐릭터가 흔들리거나 포즈가 안 잡힌다.

---

## 3. Forge 프롬프트 형식 — 낱장 1프레임 기준

산문이 아니라 **태그 나열**이다. 중요한 것을 앞에 둔다.

### Positive (예: run 사이클의 3번 프레임 = CONTACT, 가장 넓은 보폭)
```
pixel art, 16-bit game sprite, side view, facing right, full body,
hooded undead archer, long tattered cloak swept back, quiver of arrows on back,
holding a bow lowered in one hand, dark grey-green armor,
glowing violet magenta soul fire on one hand, glowing magenta eyes,
glowing magenta ragged cloak hem,
running, sprinting, wide stride, right foot planted forward, left leg stretched far behind,
torso leaning forward, arms bent ninety degrees pumping,
both legs fully visible, cloak lifted away from legs,
flat shading, hard edges, high contrast, few colors,
solid pure green background, chroma key green screen
```

### Negative — Gemini 프롬프트의 금지사항이 전부 여기로 온다
```
smoke, mist, aura, glow ring, rim light, outline, black outline,
ground line, horizon, floor, shadow, ground shadow,
standing still, idle pose, T-pose, front view, back view, isometric,
multiple characters, sprite sheet, grid, panels, text, watermark, signature,
blurry, soft, gradient, anti-aliased, photorealistic, 3d render,
bow raised, aiming, drawing bow,
cloak covering legs, legs hidden
```

### 권장 설정 (출발점 — 모델에 따라 조정)
```
Steps        24~30
Sampler      DPM++ 2M Karras   (또는 Euler a)
CFG Scale    6~8               (높으면 태그를 과하게 따라 형태가 굳는다)
Size         512×768           (세로로 긴 인물)
Seed         고정할 것 ★       (프레임 간 일관성의 핵심. 같은 seed 로 8프레임 전부)
Batch        1
```

**★ Seed 고정이 중요하다.** 8프레임을 같은 seed 로 뽑고 포즈만 OpenPose 로 바꾸면
캐릭터 일관성이 크게 올라간다. seed 를 랜덤으로 두면 프레임마다 다른 사람이 나온다.

---

## 4. 픽셀아트 품질 — 체크포인트와 LoRA

기본 SD1.5/SDXL 모델은 픽셀아트를 잘 못 만든다. 프롬프트에 `pixel art` 만 넣으면
"픽셀아트 느낌의 일러스트"가 나온다. 셋 중 하나가 필요하다.

- **픽셀아트 LoRA** (예: `pixel-art-xl`, `Pixel Art Style`) — 가장 간단하다. 가중치 0.7~1.0
- **픽셀아트 전용 체크포인트**
- **후처리로 픽셀화** — 생성은 일반 일러스트로 하고, 축소 + 팔레트 양자화로 픽셀화.
  ⚠️ 이 프로젝트는 **후처리 픽셀화가 필요 없다.** 최종 셀이 96×116 이고
  Cowork 파이프라인이 축소를 담당한다. 원본은 오히려 **선명한 일러스트**가 낫다

> 참고: 이 게임의 다른 에셋(바닥·프롭·플레이어)은 전부 **AI 페인팅**이고
> 진짜 픽셀아트가 아니다(유니크 색 5,600~13,600개). 픽셀아트로 통일하려는 게
> 아니라면 `pixel art` 태그를 강하게 넣을 필요는 없다.
> 자세한 근거는 `docs/인수인계_캐릭터스프라이트.md` §2 참고.

---

## 5. 지켜야 하는 산출물 규격

| 항목 | 값 | 이유 |
|---|---|---|
| 배경 | **순수 초록 `#00FF00`** | 캐릭터 발광이 자마젠타(`#e05cff`)라 마젠타 배경은 못 쓴다 |
| 시점 | 측면, **우향** | 게임이 `setFlipX` 로 좌향을 만든다 |
| 연기 | **그리지 말 것** | 게임이 코드로 그린다 (`updateSmokeAura`) |
| 외곽선·림라이트 | **그리지 말 것** | 게임이 `postFX.addGlow` 로 붙인다 |
| 바닥 그림자·바닥선 | **그리지 말 것** | 게임이 따로 그린다 |
| 활 | 달릴 때는 **아래로 내려** 들기 | 활을 뻗으면 팔이 스윙할 수 없다 |
| 발광색 | `#e05cff` (자마젠타) | 눈·한쪽 손·활 그립·**망토 밑단** |
| 저장 위치 | `tools/sprites/player_strips/` | Cowork 파이프라인 입력 |

낱장으로 뽑을 경우 파일명은 `run_f1.png` ~ `run_f8.png` 처럼 프레임 번호를 붙이고,
**Cowork 쪽에 "낱장 8장이 있다"고 알려주면** 조립 스크립트를 그에 맞게 고쳐준다.

---

## 6. 프레임별 포즈 — OpenPose 스켈레톤을 만들 기준

레퍼런스 8프레임 런사이클을 실측한 값이다. **세로 움직임이 거의 없다**는 게 핵심이다.

```
프레임      1     2     3     4     5     6     7     8
보폭       0   30%   50%   20%    0   30%   50%   20%   ← 몸높이 대비. 이게 달리기를 만든다
발끝 y   동일  동일  동일  동일  동일  동일  동일  동일   ← 절대 안 움직인다. 공중 프레임 없음
머리 y   ±3% 이내                                      ← 반동 거의 없음
상체     항상 앞으로 기울어짐 (머리가 엉덩이보다 몸높이의 10% 앞)
```

- 1~4 = 오른발 스텝, 5~8 = 왼발 스텝 (다리를 바꾼 같은 동작)
- 프레임 1·5 = PASSING(발 모음, 무릎 들림) / 3·7 = CONTACT(가장 넓은 보폭)
- 팔은 **다리와 반대로** 90도 굽혀 펌프
- ❌ **공중에 뜨는 프레임을 만들지 말 것.** 그렇게 했더니 "깡충 뛰는" 결과가 나왔다

자세한 실패 이력은 `docs/인수인계_캐릭터스프라이트.md` §4 에 있다.

---

## 7. Forge API 로 자동화하기

Forge 를 `--api` 옵션으로 띄우면 REST 로 호출할 수 있다.

```
webui-user.bat 의 COMMANDLINE_ARGS 에 --api 추가
→ http://127.0.0.1:7860/docs 에서 스펙 확인
```

주요 엔드포인트:
```
GET  /sdapi/v1/sd-models          설치된 체크포인트 목록
GET  /sdapi/v1/loras              설치된 LoRA 목록
GET  /controlnet/model_list       ControlNet·IP-Adapter 모델 목록  ★먼저 확인
POST /sdapi/v1/txt2img            생성 (ControlNet 은 alwayson_scripts 로 전달)
POST /sdapi/v1/img2img            변형
```

`txt2img` 에 ControlNet 을 얹는 형태:
```json
{
  "prompt": "...", "negative_prompt": "...",
  "steps": 28, "cfg_scale": 7, "width": 512, "height": 768, "seed": 12345,
  "alwayson_scripts": {
    "controlnet": { "args": [
      { "module": "ip-adapter_clip_sd15", "model": "ip-adapter_sd15",
        "weight": 0.7, "image": "<C3 base64>" },
      { "module": "none", "model": "control_v11p_sd15_openpose",
        "weight": 1.0, "image": "<프레임별 스켈레톤 base64>" }
    ]}
  }
}
```
> `module`/`model` 이름은 설치된 것에 따라 다르다. **`/controlnet/model_list` 로
> 실제 이름을 먼저 확인하고 그 값을 쓸 것.** 추측한 이름을 넣으면 조용히 무시된다.

---

## 8. 먼저 보고해줘야 할 것 (Cowork 쪽이 판단하려면 필요하다)

아래를 확인해서 알려주면, 그에 맞춰 프롬프트와 스켈레톤을 만들어 보낸다.

1. **체크포인트** — 무엇을 설치했나. SD1.5 계열인가 SDXL 계열인가
2. **`/controlnet/model_list` 결과** — OpenPose 와 IP-Adapter 모델이 실제로 있나
3. **LoRA 목록** — 픽셀아트 LoRA 가 있나
4. **`--api` 활성 여부** — `http://127.0.0.1:7860/docs` 가 열리나
5. **VRAM** — 512×768 8장 배치가 가능한 수준인가

②에서 **IP-Adapter 나 OpenPose 가 없으면 그것부터 설치해야 한다.**
그게 없는 상태로 생성하면 프레임마다 다른 캐릭터가 나와서 쓸 수 없다.

---

## 9. 역할 분담 — **CLI 혼자 끝까지 해도 된다**

앞선 판(2026-08-13)에 "품질 판단은 Cowork 가"라고 적었는데 **그건 틀렸다.**
Claude Code 도 이미지를 볼 수 있다. 진짜 교훈은 누가 하느냐가 아니라 **어떻게 보느냐**다.

### ⚠️ 진짜 규칙: 수치로 애니를 판정하지 말 것

넝마 망토가 모든 영역 지표를 지배한다. 실제로 겪은 일:
- 실루엣 차이 22~54%, 머리 높이 상승 전환 2회 → 전부 "정상"으로 나왔다
- 그런데 확대해서 보니 **팔이 안 움직이는 서 있는 사람**이었다
- 발 자동 검출도 실패했다 — 망토 자락이 발 높이까지 내려와 "발 5개"로 잡혔다

→ **반드시 프레임을 크게 펼쳐 눈으로 볼 것.** 확인할 것은 셋이다:
  ① 팔이 프레임마다 다른 각도로 흔들리는가
  ② 상체가 앞으로 기울어 있는가
  ③ 두 다리가 망토에 안 가리고 보폭이 벌어지는가

### 도구는 전부 CLI 에서 돈다
```
python tools/sprites/build_player_sheet.py   슬라이스·정렬·톤보정·시트 조립 + 검증 리포트
python tools/sprites/make_anim_test.py       게임 크기 애니 테스트 HTML (서버 불필요)
```
둘 다 그냥 파이썬 스크립트다. numpy / Pillow / scipy 만 있으면 어디서든 돈다.
`make_anim_test.py` 가 만든 `tools/sprites/_anim_test.html` 은 브라우저로 열면
게임과 동일한 조건(53×64, LINEAR, 연기 오라, 바닥 스크롤)으로 재생된다.

### 단, 동시에 같은 파일을 건드리지 말 것
Cowork 와 CLI 가 **동시에** 작업하면 서로의 편집을 덮어쓴다.
특히 지금 `src/main.js` 에 **미커밋 변경**이 있다(LINEAR 필터 + 연기 오라).
한쪽이 작업하는 동안 다른 쪽은 읽기만 하거나, 아예 한쪽에서만 진행할 것.

---

## 10. ⚠️ SDXL 이 아니라 SD1.5 를 쓸 것

§2~7 의 모델명·해상도는 **SD1.5 기준**이다. Juggernaut XL(SDXL)로는 그대로 안 된다.
이 작업에 SD1.5 가 맞는 이유:

| | 이유 |
|---|---|
| **최종 출력이 96×116** | SDXL 의 1024 고해상도 이점이 통째로 버려진다 |
| **ControlNet + IP-Adapter 동시 사용** | 8GB VRAM 에서 SDXL 로 둘을 겹치면 빠듯하다. SD1.5 는 여유 |
| **생태계 성숙도** | SD1.5 용 OpenPose·IP-Adapter 가 훨씬 안정적이고 자료도 많다 |
| **반복 속도** | 프레임 8장 × 여러 번 재시도. SD1.5 가 몇 배 빠르다 |

→ **Juggernaut XL 은 일반 에셋용으로 남기고, 스프라이트용 SD1.5 체크포인트를 따로 추가한다.**

필요한 것 4가지:
1. **SD1.5 체크포인트** — 일러스트/게임아트 계열
2. **ControlNet OpenPose (SD1.5)** — `control_v11p_sd15_openpose.pth`
3. **IP-Adapter (SD1.5)** — `ip-adapter_sd15.pth` 또는 `ip-adapter-plus_sd15.pth`
4. (선택) 픽셀아트 LoRA — **이 프로젝트엔 불필요.** §4 참고

> ①②③ 이 없으면 §2~3 작업 자체가 불가능하다. 없는 상태로 생성하면
> 프레임마다 다른 캐릭터가 나와서 쓸 수 없다. **설치가 첫 단계다.**
