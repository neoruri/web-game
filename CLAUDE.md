# Web Game Project

Phaser 3 기반 웹 게임 사이드 프로젝트. 규모 작게 여러 게임을 만들어 Poki/CrazyGames 포털 또는 자체 사이트 + AdSense H5로 수익화 목표.

**허브 문서**: `E:\claude\rich_pj\CLAUDE.md` (사용자 프로필·전체 사이드 프로젝트 맥락)

## 프로젝트 위치

- **로컬**: `E:\claude\web-game`
- **GitHub**: https://github.com/neoruri/web-game
- **Vercel 배포**: https://web-game-tau-sable.vercel.app (main 브랜치 자동 배포)

## 기술 스택

- **Vite** 8.1.x (개발 서버 + 빌드)
- **Phaser 3** 3.90.x (게임 엔진)
- **JavaScript** (Vanilla, TypeScript 아님)
- **Git + GitHub + Vercel** 자동 배포 파이프라인
- Node.js v24, npm 11

## 현재 상태 (2026-07-08 완료분)

- 개발 환경 세팅 완료
- Vite + Phaser 3 프로젝트 생성
- Git 초기화, GitHub 리포지토리 연결, Vercel 자동 배포 완성
- 모바일 반응형 대응 (Phaser.Scale.FIT)
- **첫 자체 게임(활 게임) 프로토타입 완성**:
  - 상단 좌우 왕복 과녁 (원)
  - 하단 중앙 활, 파워바
  - 홀드로 당김, 릴리즈로 발사
  - 최소 파워 25% 요구 (연타 방지)
  - 화면에 화살 1개 제한
  - 명중 판정 40px 이내
  - 점수 표시

## 코드 구조

- `src/main.js` — Phaser 씬 정의 + 게임 로직 (첫 게임은 단일 파일)
- `src/style.css` — 전체 화면 반응형 캔버스 스타일
- `index.html` — Vite 기본 (viewport meta 있음)
- `.gitignore` — Vite 기본

## 다음 단계 로드맵

1. 현재 활 게임 계속 튜닝 (사용자 피드백 기반)
2. Phaser 3 공식 튜토리얼 완주 ("Making your first Phaser 3 game")
3. 자체 게임 3~5개 축적 (각각 화면 1개, 메커니즘 1개, 30초 라운드)
4. Poki/CrazyGames 심사 제출 검토
5. 완성도 오르면 SDK 통합 (Poki SDK 등)

## 게임 디자인 원칙

- **30초 룰** — 처음 30초에 재미 전달 못하면 이탈
- **모바일 + PC 동시 대응** — 트래픽 60%+ 가 모바일
- **재플레이율이 곧 수익** — 광고 rev share 모델
- **파일 크기 20MB 이하, 로딩 3초 이내**
- **저작권 안전 에셋만** (CC0, Kenney.nl 등)
- **첫 게임은 완성 자체가 목적** (수익 기대 X)

## 개발 방법

```bash
# 개발 서버 실행 (http://localhost:5173/)
npm run dev

# 프로덕션 빌드
npm run build

# 커밋 & 배포 (Vercel 자동 감지)
git add .
git commit -m "..."
git push
```

## 주의사항

- Unity WebGL 유혹 금지 (파일 크고 로딩 느림)
- 첫 게임에서 완벽 노림 금지 (미완성 위험)
- 오리지널 IP 강박 금지 (클론으로 학습, 배포는 오리지널)
- Vercel Pro 유혹 금지 (Hobby 무료로 충분)
