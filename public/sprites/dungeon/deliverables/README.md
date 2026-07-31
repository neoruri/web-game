# 아처 캐릭터 동작 스프라이트 — Claude Code 전달용

플레이어 캐릭터(Underworld Demon Hunter, 후드 궁수)의 **동작 스프라이트**만 정리한 폴더.
바닥/게임 코드와 무관하게, 이 파일들만 넘기면 된다.

## 전달할 파일 (이 폴더 전체)

```
deliverables/
├─ player_spritesheet.png      ← 패킹된 스프라이트 시트 (권장, 이것만으로 충분)
├─ player_frames.json          ← 애니메이션 메타(행/프레임수/fps/loop)
└─ strips/                     ← 동작별 개별 가로 스트립 (엔진에 따라 편한 쪽 선택)
   ├─ idle.png       (4 frames)
   ├─ run.png        (6 frames)
   ├─ back_run.png   (8 frames)
   ├─ attack.png     (4 frames)
   ├─ multishot.png  (5 frames)
   ├─ hit.png        (2 frames)
   └─ death.png      (5 frames)
```

- **최소 전달:** `player_spritesheet.png` + `player_frames.json` 두 개면 끝.
- 개별 파일 워크플로우를 쓰면 `strips/` 안의 7개를 쓰면 된다. (내용은 시트와 동일)

## 규격

- 셀(프레임) 크기: **96 × 116 px**, 투명 배경(PNG 알파).
- 시트 레이아웃: **행 = 동작, 열 = 프레임**. 프레임은 `col*96, row*116`로 인덱싱.
- 앵커: 각 프레임은 **가로 중앙 + 발끝 하단 정렬**(top-down 이동에 바로 사용).
- 스케일: 원본이 작으니 게임에서 **nearest-neighbor로 확대**(예: 1.5~2x). 안티에일리어싱 끄기.

## player_frames.json 구조

```json
{
  "character": "Underworld Demon Hunter",
  "cell": [96, 116],
  "sheet": "player_spritesheet.png",
  "anims": {
    "idle":      { "row": 0, "frames": 4, "fps": 6,  "loop": 1 },
    "run":       { "row": 1, "frames": 6, "fps": 12, "loop": 1 },
    "back_run":  { "row": 2, "frames": 8, "fps": 12, "loop": 1 },
    "attack":    { "row": 3, "frames": 4, "fps": 14, "loop": 0 },
    "multishot": { "row": 4, "frames": 5, "fps": 14, "loop": 0 },
    "hit":       { "row": 5, "frames": 2, "fps": 10, "loop": 0 },
    "death":     { "row": 6, "frames": 5, "fps": 10, "loop": 0 }
  }
}
```

## 사용 규칙(권장)

- **몸 애니는 이동으로 구동:** 이동 중 = `run`(위로 이동 시 `back_run`), 정지 = `idle`. 좌우 이동은 좌우반전.
- **공격은 몸 애니를 막지 말 것(뱀서류 방식):** `attack`/`multishot`은 필수가 아니며,
  넣더라도 정지 상태에서만 짧게(비블로킹) 재생하거나 발사체+플래시로 대체.
- `run`/`back_run` 프레임은 오른쪽 진행 기준 → 왼쪽 이동 시 `scale(-1,1)`로 미러.

## 방향 관련

- 현재 세트는 **front(정면) / back(back_run)** + **side는 좌우반전**으로 커버.
- 8방향 완전 분리가 필요하면 side 전용 열이 추가로 필요(현재는 미포함).

---
_참고 스크립트: 상위 폴더 `pack_sprites.py`(원본 시트 재슬라이스), 통합 데모 `archer_game.html`._
