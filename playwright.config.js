// Playwright 설정 — 게임을 실제 브라우저에서 띄워 눈으로 확인 못 하는 것을 자동 검증한다.
//
// 왜 필요한가: 이 프로젝트는 캔버스(WebGL) 게임이라 "빌드 통과 + 콘솔 에러 0" 만으로는
// 스프라이트가 안 보이거나 화면이 새까만 사고를 못 잡는다. 실제로 캐릭터가 투명해진
// 버그(빈 시트 행 재생)를 배포까지 보낸 적이 있다. 여기서 픽셀을 직접 검사한다.
//
// 실행: npm test          (헤드리스, CI/커밋 전 검증용)
//       npm run test:ui   (브라우저를 띄워서 눈으로)

import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  // 게임이 로드되고 몇 초 플레이되어야 하므로 넉넉히
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // 게임 하나를 순서대로 검사한다
  reporter: [['list']],

  use: {
    baseURL: 'http://localhost:5173',
    // 실패했을 때 원인을 눈으로 보려면 스크린샷이 있어야 한다
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    // 세로 모드(9:16) 게임이라 폰 비율로 본다
    viewport: { width: 540, height: 960 },
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 540, height: 960 },
        launchOptions: {
          // 헤드리스에서 WebGL 을 소프트웨어 렌더링으로 켠다.
          // 이게 없으면 캔버스가 비어 나와 픽셀 검사가 전부 실패한다.
          args: [
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--disable-lcd-text',
          ],
        },
      },
    },
  ],

  // 테스트가 알아서 dev 서버를 띄운다. 이미 떠 있으면 그걸 재사용한다.
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
