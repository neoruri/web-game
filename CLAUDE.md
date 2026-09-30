# Web Game Project — GRIMHOLD (어둠의 사수)

Phaser 3 기반 **뱀서류(Vampire Survivors-like)** 웹 게임. Poki/CrazyGames 포털 또는
자체 사이트 + AdSense H5 로 수익화 목표.

> **새 환경/새 AI 세션이면 이 순서로 읽는다**
> 1. 이 파일 (전체 지도)
> 2. `docs/PROGRESS.md` — **진실의 원천.** 구현된 것·결정 이유·주의점
> 3. `docs/작업_분리_규칙.md` — 기획/에셋 채팅과 코드 채팅의 역할 분담
> 4. 진행 중인 갈래별 인수인계 — `docs/인수인계_*.md`
>    (최신: `인수인계_컷아웃_리깅.md` — 뼈대 애니메이션, 게임 미적용)
> 5. 최근 작업 문서 — `docs/` 의 `변경내역_*` · `커밋요청_*` (파일 수정일 최신순)
>
> 허브 문서(사용자 프로필·다른 사이드 프로젝트): `E:\claude\rich_pj\CLAUDE.md`
> (rich_pj 는 GitHub 원격이 없는 로컬 저장소다 — 다른 PC 에선 못 받는다)

최종 갱신: 2026-09-30 (게임 본편 작업은 08-24 까지, 이후는 뼈대 애니메이션 실험)

---

## 프로젝트 위치

- **로컬**: `E:\claude\web-game`
- **GitHub**: https://github.com/neoruri/web-game (브랜치 `main`)
- **Vercel 배포**: https://web-game-tau-sable.vercel.app — **main 푸시 = 즉시 배포**
  - 게임 `/` · 밸런스 튜너 `/tuner.html` · 시뮬 랩 `/lab.html`
  - 실험 도구: `/rig.html` `/rigger.html` `/creature.html` (뼈대 애니메이션, 게임 미연결)

## 기술 스택

- Vite 8 · Phaser 3.90 · **Vanilla JS** (TypeScript 아님)
- Playwright (`npm test`) — 실제 브라우저로 게임 화면 검증
- Node.js v24 · Vercel 자동 배포
- 에셋 생성 파이프라인: `tools/sprites/*.py` (Python + numpy/Pillow/opencv)
  ⚠️ 맨 `python` 은 Windows 스토어 스텁이라 **무반응**. Forge 의 venv 를 쓴다:
  `E:\claude\_tools\StabilityMatrix\Data\Packages\forge-neo\venv\Scripts\python.exe`

---

## 현재 게임 상태 (한눈에)

**장르**: 탑다운 뱀서류. 무한 월드, 플레이어 화면 중앙 고정, 자동 조준 활 사격.

| 영역 | 상태 |
|---|---|
| 전투 | 기본 활 + 액티브 4종(다발·연발·난사·수류탄), 스윕 판정(터널링 방지), 스킬별 발사 이펙트 |
| 적 | 일반 3종(몹/rusher/shooter, 48px 시트) · **엘리트 4종**(돌격자/포격수/산탄사수/수호자, 예고 후 패턴) · 보스 |
| 성장(판 안) | 레벨업 3택 카드(스킬 + 패시브 4종) · **룬 8종 × 스킬당 3슬롯**, 등급 1~3, 가방 |
| 성장(판 밖) | **골드** 드랍 → **상점**에서 시작 스탯 5종 영구 강화 |
| 화면 | 타이틀/로딩 → 게임 → 결과(최고기록) → 상점 · BGM(합성, 32초 루프) · 음소거 |
| 비주얼 | 아이소 던전 바닥(D1.5) · 프롭 · 새 플레이어(걷기 + 활 별도 레이어) |

**룬 공급원 = 엘리트 확정 드랍**(일반몹 %드랍은 폐기). 판당 룬 평균 3개 전후.
보스는 컨셉 재설계 예정이라 손대지 않은 상태다.

## 코드 구조

| 파일 | 역할 |
|---|---|
| `src/main.js` | 게임 씬 전체 (~4,100줄) — 전투·스폰·렌더·HUD·애니 |
| `src/sim.js` | **헤드리스 밸런스 시뮬**. main.js 전투 로직의 복제본 ⚠️ 동기화 필수 |
| `src/config.js` | 모든 튜닝 수치 + 튜너 SCHEMA. localStorage 키 `survivor.config.v5` |
| `src/progression.js` | `deriveStats()` — 최종 전투 수치의 **유일한 재계산 지점** |
| `src/meta.js` | 상점 영구 강화 로직 |
| `src/*-screen.js` | 타이틀·레벨업 카드·룬·결과·상점 UI (전부 DOM 오버레이) |
| `src/rig*.js`, `src/rigger/` | 뼈대 애니메이션 + 리거 도구 (게임 본체와 무관) → **`docs/인수인계_컷아웃_리깅.md`** |
| `tests/` | Playwright 스모크 + 스프라이트 계약 테스트 |
| `tools/sprites/` | 에셋 생성·조립 스크립트. 산출물 폴더는 대부분 gitignore |

localStorage: `survivor.config.v5`(튜너) · `wg_best_v1`(최고기록) · `wg_gold_v1`(골드) ·
`wg_meta_v1`(상점) · `wg_mute_v1`(음소거)

---

## 작업 방식 (여러 AI 채팅 분업)

1. **기획/에셋 채팅**(Cowork·Codex 등)이 에셋을 만들고 코드를 고친 뒤
   `docs/변경내역_*.md` 또는 `docs/커밋요청_*.md` 를 남긴다
2. **코드 채팅**(Claude Code)이 그 문서를 읽고 → 반영/검증 → 커밋·푸시
3. 커밋 메시지 접두어: 기획 채팅발 작업은 **`[plan]`**, 정리는 `chore:`, 테스트는 `test:`
4. `WIP auto-save` 커밋은 자동저장 훅이 만든다. 푸시 전에 내용 확인할 것

## 커밋 전 검증 (항상)

```bash
npm run build      # 빌드
npm test           # Playwright: 화면 렌더·프리즈·404·빈 스프라이트 칸 재생 검사
```
- 전투/스폰/성장 수식을 바꿨으면 **sim.js 도 같이** 고치고 헤드리스 sim 을 돌린다
- 기본값을 "끄는" 변경(0 으로 등)은 `config.js` 의 **KEY 버전을 올려야** 적용된다
  (튜너 저장값이 새 기본값을 덮어쓴다 — 실제 사고 있었음)
- **"보기 좋은가"는 사람 판단**이다. 테스트는 "깨졌는가"만 잡는다

## 개발 명령

```bash
npm run dev        # http://localhost:5173/   (?dev 붙이면 fps·수치 HUD 표시)
npm run build
npm test           # 헤드리스
npm run test:ui    # 브라우저 띄워서
```

## 환경 함정 (Windows 이 PC 에서 실제로 겪은 것)

- PowerShell 실행 정책 → `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` 로 해결됨
- `.git/index.lock` 이 가끔 남는다 → git 프로세스 없음 확인 후 삭제
- `.mcp.json`(nano-banana, Gemini API 키 포함)은 **gitignore — 절대 커밋 금지**.
  Gemini 이미지 생성은 API **결제(billing) 미설정이라 429** 로 현재 사용 불가
- 새 환경에서는 `npm install` 후 `npx playwright install chromium` 필요

---

## 게임 디자인 원칙

- **30초 룰** — 처음 30초에 재미 전달 못하면 이탈
- **모바일 + PC 동시 대응** — 트래픽 60%+ 가 모바일 (세로 9:16, 540×960)
- **재플레이율이 곧 수익** — 광고 rev share 모델
- **파일 크기 20MB 이하, 로딩 3초 이내**
- **저작권 안전 에셋만** — AI 생성 에셋은 프롬프트·툴 기록 보관(Poki 제출 요구)
- **최적화·성능이 항상 1순위** — 적 수백 마리 전제, 풀링·컬링·GC 회피

## 주의사항

- Unity WebGL 유혹 금지 (파일 크고 로딩 느림)
- 완벽 노림 금지 (미완성 위험)
- 오리지널 IP 강박 금지 (클론으로 학습, 배포는 오리지널)
- Vercel Pro 유혹 금지 (Hobby 무료로 충분)
