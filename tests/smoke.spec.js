// 스모크 테스트 — 커밋 전에 "게임이 실제로 돌아가는가"를 확인한다.
//
// 이 프로젝트에서 실제로 배포까지 나갔던 사고들을 기준으로 항목을 골랐다:
//   · 캐릭터가 투명해짐 (빈 시트 행을 재생)      → 캔버스 픽셀 검사
//   · 스프라이트 404 (deliverables 미커밋)      → 응답 코드 감시
//   · 무한루프로 게임 정지                       → 시간이 흐르는지 확인
// 빌드 통과와 콘솔 에러 0 만으로는 위 셋 중 어느 것도 안 잡힌다.

import { test, expect } from '@playwright/test'
import { collectErrors, startGame, sampleCanvas } from './helpers.js'

test('게임이 에러 없이 시작되고 화면이 그려진다', async ({ page }) => {
  const errors = collectErrors(page)

  await startGame(page, { playSeconds: 4 })

  // 1) 캔버스가 존재하고 세로 비율이다
  const canvas = page.locator('canvas')
  await expect(canvas).toBeVisible()

  // 2) 화면이 실제로 그려졌는가 — 새까맣거나 단색이면 실패
  const s = await sampleCanvas(page)
  expect(s, '캔버스를 읽지 못했다').not.toBeNull()
  console.log(
    `   캔버스 ${s.width}×${s.height} · 색 ${s.distinctColors}종 · ` +
      `밝은픽셀 ${(s.nonBgRatio * 100).toFixed(1)}% · 최대밝기 ${s.brightest.toFixed(0)}`
  )
  expect(s.distinctColors, '색이 거의 없다 = 화면이 비었다').toBeGreaterThan(50)
  expect(s.nonBgRatio, '배경만 있고 캐릭터·적이 없다').toBeGreaterThan(0.01)

  // 3) 에러 없음 (404 포함)
  expect(errors, `에러 발생:\n${errors.join('\n')}`).toEqual([])
})

test('시간이 흐르고 게임이 멈추지 않는다', async ({ page }) => {
  const errors = collectErrors(page)
  await startGame(page, { playSeconds: 2 })

  // 화면이 실제로 변하는지 본다. Phaser 텍스트(시간 표시)는 캔버스라 DOM 으로
  // 못 읽으므로 스크린샷을 두 번 떠서 비교한다.
  // (페이지 안 drawImage 는 WebGL 버퍼가 비어 항상 검게 나오므로 쓰면 안 된다)
  const shot = async () => (await page.locator('canvas').screenshot()).toString('base64')

  const a = await shot()
  await page.waitForTimeout(1500)
  const b = await shot()

  // 적이 움직이고 화살이 날아가므로 두 프레임이 같을 수 없다.
  // 같으면 update 가 멈춘 것(무한루프·예외로 인한 정지).
  expect(b, '화면이 전혀 변하지 않는다 = 게임이 멈췄다').not.toBe(a)
  expect(errors, `에러 발생:\n${errors.join('\n')}`).toEqual([])
})

test('플레이 화면 스크린샷을 남긴다', async ({ page }, testInfo) => {
  await startGame(page, { playSeconds: 6 })
  const shot = await page.locator('canvas').screenshot()
  // 리포트에 첨부 + 파일로도 저장해서 사람이 눈으로 확인할 수 있게 한다
  await testInfo.attach('gameplay', { body: shot, contentType: 'image/png' })
  await page.locator('canvas').screenshot({ path: 'tests/__screenshots__/gameplay.png' })
})
