# 캐릭터 재설계 — SD 시안 생성 지시서

> 대상: Windows Claude Code CLI + Stability Matrix / Forge (`127.0.0.1:7860`)
> 이 문서는 `docs/SD_run_생성절차.md` 를 **대체하지 않는다.** 그건 애니메이션용이고
> 이건 **캐릭터 디자인 재설계용**이다. 애니는 디자인이 확정된 뒤에 다시 시작한다.

---

## 0. 왜 캐릭터를 다시 만드는가 — 원인은 프롬프트가 아니었다

run 애니메이션을 **13번** 실패했다. Gemini 4회, SD 9회, 그리고 코드로 idle 픽셀을
변형하는 프로그래매틱 방식까지.

원인은 도구도 프롬프트도 아니고 **캐릭터 디자인 하나**였다. `idle.png` 실측:

```
몸 높이 대비 세로 위치     드러난 덩어리 수
  0 ~ 85%                 1개  ← 망토가 통째로 덮는다. 다리가 없다
     85%                  8개  ← 넝마 자락. 다리가 아니다
 90 ~ 95%                 2~3개 ← 부츠만
```

**망토가 몸 높이의 85%를 덮는다. 움직일 다리가 화면에 없다.**
달리기는 보폭으로 표현되는데(0 → 몸높이의 50%), 보폭을 보여줄 다리가 없으면
어떤 도구로도 못 만든다. 체크포인트를 바꿔도, 프롬프트를 고쳐도 같다.

게임 크기(53×64)에서 두 번째 문제도 실측됐다:

```
불투명 픽셀        1,234개
고대비(발광) 픽셀     53개 = 4.3%   ← 마젠타 손·눈뿐
```

**나머지 95.7% 가 어두운 한 덩어리다.** 실루엣이 움직여도 눈이 따라갈 지점이 없다.

> 참고로 상용 무료 에셋도 이 문제를 못 푼다. 긴 로브 캐릭터의 run 레퍼런스를
> 찾아봤더니(CreativeKind Necromancer 등) 전부 "떠다니는" 움직임이었다.
> 우리만의 실패가 아니라 **구조적 한계**다.

---

## 1. ⭐ 새 시안이 반드시 만족해야 하는 5가지

이건 취향이 아니라 **합격 조건**이다. 하나라도 못 넘기면 그 시안은 버린다.

| # | 조건 | 왜 | 검증 |
|---|---|---|---|
| ① | **다리 분리도 ≥ 35%** | 보폭이 보여야 달리기가 성립한다. **가장 중요** | 아래 스크립트 |
| ② | **다리·부츠가 옷보다 밝거나 어둡다** | 같은 어두운 색이면 실루엣이 안 갈린다 | `다리대비` ≥ 12 |
| ③ | 몸통 평균 명도 **50~58** | 바닥이 42.3 이다. 이보다 어두우면 묻힌다 | `몸통명도` |
| ④ | 국소 대비 **14 이상** | 64px 에서 형태가 읽히는 기준 | `국소대비` |
| ⑤ | **활을 아래로 내려 든다** | 앞으로 뻗으면 팔이 스윙 못 한다 | 눈으로 |

### ⚠️ ①의 지표를 두 번 고쳤다 — 그대로 쓸 것

처음엔 "옷자락이 끝나는 높이"로 재려 했다. **부츠가 몸통만큼 넓어서 전부 0.99 가 나왔다.**

그다음 "하반신에서 덩어리가 2개인 행의 비율"로 바꿨다. 이것도 실패했다 —
**넝마 자락이 얇게 갈라져서 옛 `idle.png` 가 67.4% 로 통과해버렸다.**
(예전에 발 자동 검출이 "발 5개"를 반환한 것과 같은 함정이다.)

정답은 **두 덩어리가 모두 몸폭의 16% 이상일 때만 다리로 세는 것**이다. 실측:

```
                폭>=0.08  폭>=0.12  폭>=0.16  폭>=0.20
옛 idle.png        59.6     14.0      0.6      0.0   ← 긴 로브. 떨어뜨려야 한다
새 시안 P1         70.3     70.3     70.3     13.5
새 시안 P2         45.9     45.9     45.9      2.7
새 시안 P3         59.5     59.5     59.5      8.1
```
`0.16` 에서만 깨끗하게 갈린다. 이 값을 바꾸지 말 것.

①이 이번 재설계의 **핵심**이다. 사용자가 고른 방향은
**"어깨~허리 길이의 짧은 케이프 + 완전히 드러난 다리"** 이고,
컨셉은 **살아있는 마법 궁수(주문궁수)** 다 — 언데드가 아니다(§2 참조).

---

## 2. 바꾸지 말 것 — 이미 검증된 값

### 발광색 `#e05cff` (자마젠타, 색조 292°)
`main.js` 의 채도 있는 색을 색조 20° 단위로 전수 조사해서 **280~339°가 통째로
비어 있는 것**을 확인하고 고른 값이다. 회녹색 바닥(G−R +5.9)의 보색이라 대비도 최대다.

❌ 시안 계열은 쓸 수 없다 — 냉기 199° / 스킬발사체 189° / 산탄사수 175° / 궁수적 170°

### 배경은 초록 `#00FF00`
마젠타 크로마키는 **쓸 수 없다.** 캐릭터 발광이 자마젠타라 배경까지 마젠타면
언매팅 과정에서 발광이 지워진다. (실제로 겪었다)

### 시트 규격 (`main.js` 와 일치)
```
셀 96×116 · 8열 × 7행 = 768×812 · 접지 ANCHOR = 108
화면 표시 53×64px (셀 96 × scale 0.55)
```

### 컨셉 — 살아있는 마법 궁수(주문궁수)

**언데드가 아니다.** 기존 C3 가 언데드 궁수였을 뿐이고 이번엔 그 설정을 버린다.

```
유지   후드(얼굴은 그림자) · 등의 화살통 · 큰 활 · 어두운 회녹색 갑주 · 자마젠타 발광
변경   언데드/영혼불  →  살아있는 인간 + **마력이 깃든 활**
추가   옷자락이 허리에서 끝나고 다리가 완전히 드러난다
```

발광의 근거가 바뀌었다. 영혼불이 아니라 **활에 새겨진 룬과 빛나는 활시위**다.
발광이 나오는 곳은 세 군데로 못박는다 — **후드 안쪽 · 장비의 얇은 룬 선 ·
활을 든 손**. 넓게 퍼지면 발광 면적이 15% 를 넘어 실루엣을 먹는다(목표 3~9%).

---

## 3. Forge 설정 — txt2img

디자인 시안은 캐릭터 동일성을 지킬 필요가 없으므로 img2img 가 아니라 txt2img 다.

```
Model          SD1.5 계열 (DreamShaper 8 등). idle.png 는 유니크 색 36,294 개의
               부드러운 페인팅이므로 화풍이 오히려 가깝다
Sampler        DPM++ 2M Karras
Steps          30
CFG Scale      7.0
Size           512 × 768
Seed           -1 (랜덤). 시안이므로 다양성이 필요하다
Batch count    4          ← 한 안마다 4장 뽑아서 고른다
```

ControlNet 은 **쓰지 않는다.** 포즈를 지정할 단계가 아니다.

---

## 4. 공통 프롬프트 — 4안 전부에 들어간다

```
side view full body, facing right, standing,
living human arcane archer, deep pointed hood, face in shadow,
faint violet magenta arcane glow inside the hood,
enchanted bow with glowing violet magenta runes, held LOWERED pointing down,
quiver of arrows on the back, dark grey-green armor and cloth,
thin violet magenta rune lines on the gear,
LEGS FULLY VISIBLE from the hip down, trousers and tall boots,
painterly game art, flat pure green background, no ground, no shadow
```

> ❗ `LEGS FULLY VISIBLE from the hip down` 과 `bow held LOWERED` 는 **빼면 안 된다.**
> 이 두 문구가 이번 재설계의 전부다.

---

## 5. 4안 — 이 부분만 바꿔서 각각 4장씩

### A안 — 짧은 마법 케이프 (가장 안전)
```
short shoulder cape ending at the waist, frayed lower edge with
glowing violet magenta rune stitching, fitted dark armor on torso,
grey-green wrapped trousers, tall dark boots
```
> 실루엣 변화가 가장 작아 톤 매칭이 쉽다.

### B안 — 경장 주문척후병
```
no cape, layered leather pauldrons and a short torn tabard at the hip,
lean armored legs with knee guards, light boots, leather straps,
small rune-etched buckles
```
> 실루엣이 가장 날렵하고 다리가 가장 잘 보인다. 애니메이션 난이도 최저.

### C안 — 룬각인 주문궁수
```
rune-covered robe top with long wide sleeves ending at the hip like a tunic,
glowing violet magenta rune script on sleeves and chest,
fitted dark trousers, mid-height boots
```
> 마법 느낌이 가장 강하다. 로브 상의가 다시 다리를 덮지 않도록
> `ending at the hip like a tunic` 를 반드시 유지할 것.

### D안 — 룬각인 중갑 사수
```
short segmented plate skirt at the hip only,
heavy shoulder guards with violet magenta runes engraved in the metal,
armored thighs and greaves, thick boots
```
> 실루엣이 가장 묵직하다. 다리 갑주가 두꺼워 다리 분리도가 가장 잘 나온다.

---

> ⚠️ **적·엘리트와의 컨셉 겹침은 이 단계에서 따지지 않는다.**
> 플레이어를 먼저 확정하고, 몹 디자인은 그 뒤에 다시 만든다.
> 순서를 거꾸로 잡으면 플레이어 선택지가 쓸데없이 좁아진다.

---

## 6. Negative — 이건 반드시 그대로

```
long cloak, long robe, floor-length cape, ankle-length cloak, full-length coat,
robe covering legs, dress, skirt, gown, hidden legs, legs covered,
undead, skeleton, bones, skull face, zombie, rotting flesh, ghost, wraith,
transparent body, floating, female, breasts, high heels,
scythe, staff, wand, sword, spear, wings, bat wings,
bow raised, bow drawn, aiming, arrow nocked,
purple cloak, purple robe, bright purple, saturated purple, purple everywhere,
front view, back view, three quarter view, T-pose,
ground shadow, floor, horizon line, ground line,
smoke, mist, aura, glow ring, rim light, thick outline,
text, watermark, signature, multiple characters, extra limbs, cropped
```

각 줄이 실제로 겪은 실패에 대응한다:

- 1~2줄 — **이번 재설계의 전부다.** `long cloak` 계열을 빼면 모델이
  기본값으로 긴 로브를 그린다 (지금까지 전부 그랬다)
- 3~5줄 — SD 에서 **해골 여성 + 치마 + 낫**이 나왔다. 그리고 이번 캐릭터는 **살아있는 사람**이라 언데드 계열을 전부 막아야 한다
- 6줄 — 활을 들면 팔 스윙이 불가능해진다
- 7줄 — 발광이 망토 전체를 뒤덮은 적이 있다
- `smoke, mist, aura` — **연기 오라는 코드가 그린다**(`updateSmokeAura`).
  스프라이트에 굽으면 얼어붙고 64px 에서 실루엣을 먹는다

---

## 7. 저장

```
tools/sprites/cands/design_A1.png ~ A4.png
tools/sprites/cands/design_B1.png ~ B4.png
tools/sprites/cands/design_C1.png ~ C4.png
tools/sprites/cands/design_D1.png ~ D4.png
```

16장 전부 남긴다. 골라내는 건 그다음이다.

---

## 8. 자동 판정 — 뽑은 직후 돌릴 것

```python
# tools/sprites/check_design_cands.py 로 저장해서 실행
import pathlib
import numpy as np
from PIL import Image
from scipy import ndimage

def legsplit(fg):
    """다리 분리도 — 하반신에서 **몸폭 16% 이상인 덩어리가 2개**인 행의 비율.

    폭 조건이 핵심이다. 이게 없으면 넝마 자락이 얇게 갈라진 것을 다리로 오인해서
    긴 로브 캐릭터가 67% 로 통과한다. 실측으로 0.16 을 찾았다.
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

for p in sorted(pathlib.Path('tools/sprites/cands').glob('design_*.png')):
    a = np.asarray(Image.open(p).convert('RGB')).astype(float)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    bg = (G > 150) & (R < 140) & (B < 140) & (G - np.maximum(R, B) > 60)
    fg = ~bg
    ys, xs = np.nonzero(fg)
    if len(ys) < 500:
        print(f'{p.name:16s} 인물 검출 실패'); continue
    y0, y1 = ys.min(), ys.max()
    Hh = y1 - y0 + 1
    fgc = fg[y0:y1 + 1, xs.min():xs.max() + 1]      # 인물만 잘라서 재야 한다
    split = legsplit(fgc)

    px = a[fg]
    mx = px.max(axis=1); mn = px.min(axis=1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    glow = (sat > 0.35) & (mx > 120)
    body = px[~glow]

    # ② 다리 구간(0.70~0.95)이 몸통과 명도가 갈리는가
    def band(lo, hi):
        s = fg.copy(); s[:y0 + int(Hh * lo)] = False; s[y0 + int(Hh * hi):] = False
        q = a[s]
        return q.mean() if len(q) > 50 else 0.0
    leg_contrast = abs(band(0.70, 0.95) - band(0.20, 0.50))

    L = np.asarray(Image.open(p).convert('L'), float)
    d = np.abs(np.diff(L, axis=1)); v = fg[:, :-1] & fg[:, 1:]

    ok = (split >= 35) and (leg_contrast >= 12) and (50 <= body.mean() <= 58) \
         and (d[v].mean() >= 14)
    print(f'{p.name:16s} 다리분리 {split:5.1f}%  다리대비 {leg_contrast:5.1f}  '
          f'몸통명도 {body.mean():5.1f}  국소대비 {d[v].mean():5.2f}  '
          f'발광 {100 * glow.mean():4.1f}%   {"통과" if ok else "탈락"}')
```

합격선:
```
다리분리    ≥ 35%       ← ★ 이게 이번 재설계의 판정 기준. 옛 idle.png 는 0.6% 였다
다리대비    ≥ 12
몸통명도    50 ~ 58
국소대비    ≥ 14
발광 면적   3 ~ 9%      (15% 넘으면 보라가 번진 것)
```

---

## 9. ⚠️ 수치를 통과했어도 눈으로 볼 것

**넝마 옷자락이 모든 영역 지표를 지배한다.** 실루엣 차이·머리 높이 같은 수치가
전부 "정상"으로 나왔는데 실제로는 서 있는 사람이었던 전례가 있다.

Claude Code 는 이미지를 볼 수 있다. **크게 확대해서** 확인할 것:

1. **엉덩이 아래로 두 다리가 명확히 갈라지는가** — 이 하나만 봐도 된다
2. 활이 아래를 향하는가
3. 후드 안 눈 발광이 보이는가
4. 옷자락이 무릎을 덮지 않는가

그리고 **게임 크기로 축소해서** 한 번 더 본다. 원본에서 멋있어도 53×64 에서
어두운 덩어리면 의미가 없다.

```python
im = Image.open('tools/sprites/cands/design_A1.png')
w = round(im.width * 64 / im.height)
im.resize((w, 64), Image.LANCZOS).resize((w * 6, 384), Image.NEAREST).save('_chk.png')
```

---

## 10. 통과한 시안이 나온 뒤

사용자가 최종 1안을 고른다. 그다음 순서:

```
1. 확정 시안으로 idle 8프레임 → build_player_sheet.py 조립 → 애니 테스트
2. idle 통과 후 run 8프레임
3. backrun / hit / death
```

**attack·multishot 은 보류다.** 현재 `main.js` 는 `idle`/`run`/`back_run`/`death`
만 재생하고 나머지는 `defs` 에 등록만 되어 있다. 재생 여부가 미결정이다.

run 은 이번엔 다리가 보이므로 **보폭 수치를 프레임별로 지정**하면 된다:
```
프레임    f1   f2   f3   f4   f5   f6   f7   f8
보폭     13%  31%  50%  18%  13%  31%  50%  18%   (몸높이 대비)
```
f5~f8 은 f1~f4 의 좌우 교대. 팔은 다리와 반대로 90° 굽혀 스윙.
상체는 항상 앞으로 기울어 있다(머리가 엉덩이보다 몸높이의 10% 앞).
