# SD(Forge) 로 run 8프레임 만들기 — 실행 절차

> 대상: Windows Claude Code CLI. Forge 는 `127.0.0.1:7860`.
> 이 문서는 `docs/SD_Forge_작업지시.md` 를 **대체한다.** 그 문서의 txt2img 방식은 실패했다.

---

## 0. 먼저 — 앞선 진단 두 개를 정정한다

### ❌ "idle.png 는 명도 단계를 뚝뚝 끊은 16비트 게임아트다"
**틀렸다.** 실측하면 이렇다:

```
유니크 색        36,294 개
몸통 명도 분포    16~95 구간에 고르게 퍼짐 (5개 구간이 각 20% 내외)
국소 대비        9.30
몸통 명도 48.6  /  R−B +0.3
발광 면적 4.9%  /  색조 288도 (자마젠타)
초록 배경 69.8% /  대표색 (12, 245, 5)
```

**부드러운 페인팅이다.** 하드에지 픽셀아트가 아니다.
그래서 `hard edges, flat colors` 를 프롬프트에 넣는 것은 **잘못된 방향**이고,
"DreamShaper 8 은 부드러운 일러스트라서 안 맞는다"는 결론도 틀렸다 —
오히려 화풍은 가깝다. 문제는 화풍이 아니라 **캐릭터 동일성**이다.

### ❌ txt2img + IP-Adapter 로 캐릭터를 잡으려 한 것
`run_f3.png` 결과물은 **해골 여성 + 치마 + 낫 + 보라 망토**였다. C3 와 무관하다.
IP-Adapter 는 "분위기 힌트"에 가깝고, 이렇게 구체적인 의상·실루엣을
텍스트에서 재현하게 만드는 용도가 아니다.

---

## 1. ⭐ 해법 — img2img. 모델이 화풍을 발명하지 않게 한다

`idle.png` 는 **캐릭터·화풍·초록배경을 이미 전부 갖고 있다.**
그것을 **초기 이미지**로 넣고 **포즈만** 바꾸면 된다.

```
init image  = idle 1번 프레임          → 캐릭터·화풍·배경을 그대로 물려받는다
ControlNet  = OpenPose 스켈레톤        → 포즈만 지정한다
denoising   = 0.45~0.60               → 이 범위에서만 둘 다 성립한다
```

denoising 이 핵심이다:
- **0.35 이하** — 포즈가 안 바뀐다. 서 있는 자세가 남는다
- **0.45~0.60** — 포즈는 바뀌고 캐릭터·화풍은 유지된다 ← **여기**
- **0.70 이상** — 캐릭터가 무너진다. 해골 여성이 나온 게 이 영역이다

---

## 2. 재료는 이미 만들어져 있다

```
python tools/sprites/make_sd_assets.py
```
를 돌리면 (이미 돌려둠) 아래가 생성된다:

```
tools/sprites/sd/init_idle.png        512×768, 초록 배경, 인물 495×688, 접지 y=728
tools/sprites/sd/pose_run_f1.png ~ f8.png   OpenPose 스켈레톤 8장 (512×768, COCO-18)
tools/sprites/sd/_pose_preview.png    초기 이미지 위에 스켈레톤 겹친 미리보기
```

스켈레톤은 레퍼런스 런사이클 실측값을 그대로 옮겼다:

```
프레임      f1    f2    f3    f4    f5    f6    f7    f8
보폭      13%   31%   50%   18%   13%   31%   50%   18%
접지발 y  0.940 (전부 동일)   ← 세로 반동 없음. 스윙발만 뜬다
```
f5~f8 은 f1~f4 의 **다리·팔을 좌우 교대**한 것이다. 팔은 다리와 반대로 90도 굽혀 스윙한다.
상체는 항상 앞으로 기울어 있다(머리가 엉덩이보다 몸높이의 10% 앞).

> ⚠️ **공중에 뜨는 프레임을 만들지 말 것.** 그렇게 했더니 "깡충 뛰는" 결과가 나왔다.

---

## 3. Forge 설정 — 8프레임 전부 동일, 스켈레톤만 교체

### img2img 탭
```
초기 이미지     tools/sprites/sd/init_idle.png
Resize mode    Just resize
Denoising      0.52          ← 0.45~0.60 사이에서 조정
Sampler        DPM++ 2M Karras
Steps          28
CFG Scale      6.5
Size           512 × 768
Seed           고정 ★ (예: 20260814) — 8프레임 전부 같은 seed
Batch          1
```

### ControlNet Unit 0 — OpenPose
```
Enable         ✔
Image          tools/sprites/sd/pose_run_f{N}.png     ← 프레임마다 이것만 교체
Preprocessor   none          ★ 이미 스켈레톤이므로 전처리 금지
Model          control_v11p_sd15_openpose
Control Weight 1.0
Starting/Ending Control Step   0.0 / 0.85
Control Mode   ControlNet is more important
```
> `Preprocessor` 를 `openpose` 로 두면 **스켈레톤 그림에서 또 포즈를 추출**하려 해서
> 망가진다. 반드시 `none`.

### ControlNet Unit 1 — reference_only (선택, 권장)
IP-Adapter 보다 이쪽이 캐릭터 유지에 강하다. Forge 내장이고 별도 모델이 필요 없다.
```
Enable         ✔
Image          tools/sprites/sd/init_idle.png
Preprocessor   reference_only
Control Weight 0.55
Style Fidelity 0.6
```
> img2img 만으로 충분하면 생략해도 된다. 캐릭터가 흔들릴 때만 켠다.

### Positive
```
hooded undead archer, side view facing right, running,
long tattered dark grey-green cloak, quiver of arrows on back,
bow held lowered in one hand,
glowing violet magenta soul fire on hand and eyes, glowing magenta cloak hem,
dark grey-green armor, painterly game art, flat green background
```

### Negative
```
skeleton, bones, skull, female, breasts, skirt, dress, high heels,
scythe, staff, sword, spear, wings, bat wings,
purple cloak, purple robe, bright purple, saturated purple,
standing still, idle, T-pose, front view, back view,
ground shadow, floor, horizon line, ground line,
smoke, mist, aura, glow ring, rim light, outline,
text, watermark, signature, multiple characters, extra limbs
```
> ❗ **`skeleton, bones, skull, female, skirt, scythe` 를 반드시 넣을 것.**
> 실제로 그게 나왔다. `purple cloak` 계열도 필수다 — 발광이 망토 전체를 뒤덮었다.

---

## 4. 저장과 검증

프레임 8장을 아래 이름으로 저장:
```
tools/sprites/player_strips/run_f1.png ~ run_f8.png
```

### 기계적 확인 (CLI 가 해도 되는 것)
```python
from PIL import Image
import numpy as np
for i in range(1, 9):
    a = np.asarray(Image.open(f'tools/sprites/player_strips/run_f{i}.png').convert('RGB')).astype(int)
    R, G, B = a[...,0], a[...,1], a[...,2]
    bg = (G>150)&(R<140)&(B<140)&(G-np.maximum(R,B)>60)
    px = a[~bg]
    mx = px.max(axis=1).astype(float); mn = px.min(axis=1).astype(float)
    sat = np.where(mx>0,(mx-mn)/np.maximum(mx,1),0)
    glow = (sat>0.35)&(mx>120)
    body = px[~glow]
    print(f'f{i}  초록{100*bg.mean():5.1f}%  몸통명도{body.mean():5.1f}  발광{100*glow.mean():4.1f}%')
```
합격선 (idle.png 실측값 기준):
```
초록 배경      50% 이상
몸통 명도      42 ~ 56   (idle 48.6)
발광 면적      3 ~ 9%    (idle 4.9%)  ← 15% 넘으면 보라가 번진 것
```

### ⚠️ 눈으로 볼 것 — 이게 진짜 검증이다
프레임 8장을 **크게 펼쳐 놓고** 확인한다. 수치로는 알 수 없다.
1. **같은 캐릭터인가** — 후드·망토·화살통·활이 8장 모두 같은가
2. **팔이 프레임마다 다른 각도로 흔들리는가**
3. **상체가 앞으로 기울어 있는가**
4. **두 다리가 망토에 안 가리고 보폭이 벌어지는가**

넝마 망토가 모든 영역 지표를 지배해서, 실루엣 차이·머리 높이 같은 수치가 전부
"정상"으로 나왔는데 실제로는 서 있는 사람이었던 전례가 있다.

---

## 5. 낱장 8장 → 시트 조립

기존 `build_player_sheet.py` 는 **가로로 붙은 스트립 한 장**을 입력으로 받는다.
낱장 8장을 쓰려면 먼저 한 장으로 이어 붙인다:

```python
from PIL import Image
ims = [Image.open(f'tools/sprites/player_strips/run_f{i}.png').convert('RGB') for i in range(1,9)]
GAP = 60                      # 프레임 간 간격. 분리 실패를 막는다
W = sum(i.width for i in ims) + GAP*9
H = max(i.height for i in ims)
out = Image.new('RGB', (W,H), (12,245,5))     # idle.png 의 초록
x = GAP
for i in ims:
    out.paste(i, (x, H - i.height)); x += i.width + GAP
out.save('tools/sprites/player_strips/run.png')
```
그다음:
```
python tools/sprites/build_player_sheet.py     시트 조립 + 정렬 리포트
python tools/sprites/make_anim_test.py         브라우저로 열어 재생 확인
```

---

## 6. 안 될 때 순서대로 시도

| 증상 | 조치 |
|---|---|
| 포즈가 안 바뀐다 (서 있음) | denoising 0.52 → 0.60. ControlNet Weight 1.0 → 1.2 |
| 캐릭터가 딴 사람이 된다 | denoising 0.52 → 0.45. reference_only Unit 켜기 |
| 해골·여성·치마가 나온다 | Negative 에 해당 단어 강화 `(skeleton:1.4), (female:1.3)` |
| 보라가 망토 전체를 덮는다 | Negative `(purple cloak:1.5)`. Positive 에서 발광 언급을 손·눈·밑단으로 한정 |
| 바닥 그림자가 생긴다 | Negative `(ground shadow:1.4)`. 조립 스크립트가 바닥선은 자동 제거한다 |
| 배경이 초록이 아니다 | 초기 이미지 배경이 초록이므로 denoising 을 낮추면 살아난다 |
| 8장이 서로 안 어울린다 | **seed 가 고정됐는지 확인.** 랜덤이면 프레임마다 다른 사람이 나온다 |

---

## 7. 이래도 안 되면 — 물러설 지점

SD 로 특정 캐릭터의 애니메이션을 만드는 건 원래 어려운 작업이다.
2~3회 시도해도 §4 의 눈 검증을 못 넘기면, 아래를 고려한다.

**① Gemini(nano-banana) 로 돌아간다** — idle·attack 은 그쪽에서 통과했다.
   `docs/요청문/A1_run_8frames__attach_C3.txt` 가 준비돼 있고, 4차 시도는 아직 안 했다.

**② 망토를 짧게 재디자인한다** — 발목까지 오는 넝마 망토가 다리를 덮어서
   보폭이 안 보이는 게 구조적 원인이다. 무릎까지 오는 망토면 훨씬 쉽다.

**③ run 을 4프레임으로 줄인다** — 짝수라 루프는 깨끗하다. 8프레임의 교차 보행을
   포기하는 대신 실패 위험이 절반이다.
