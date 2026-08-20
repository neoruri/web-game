// 테스트 공용 헬퍼 — 게임을 "실제로 플레이 중인 상태"까지 데려간다.

import { expect } from '@playwright/test'
import zlib from 'node:zlib'

/** 콘솔 에러/페이지 예외를 모아준다. 반환한 배열은 실시간으로 채워진다. */
export function collectErrors(page) {
  const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  // 에셋 404 는 스프라이트가 통째로 안 보이는 원인이라 반드시 잡는다
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`)
  })
  return errors
}

/**
 * 타이틀 화면을 넘겨 게임을 시작시킨다.
 * 브라우저 오디오 정책 때문에 시작 버튼 탭이 필수라 자동으로 넘어가지 않는다.
 */
export async function startGame(page, { playSeconds = 3 } = {}) {
  await page.goto('/')
  // 로딩이 끝나면 시작 버튼이 hidden 해제된다
  const start = page.locator('#tiStart')
  await expect(start).toBeVisible({ timeout: 30_000 })
  await start.click()
  // 타이틀이 사라지고 게임이 돌기 시작할 때까지
  await expect(start).toBeHidden({ timeout: 10_000 })
  await page.waitForTimeout(playSeconds * 1000)
}

// --- PNG 디코딩 (의존성 없이) ---------------------------------------------
// Playwright 스크린샷은 PNG 버퍼로 온다. sharp 같은 라이브러리를 더 붙이지 않고
// zlib 만으로 푼다(8bit RGBA 만 다루면 되므로 짧다).
function decodePng(buf) {
  const W = buf.readUInt32BE(16)
  const H = buf.readUInt32BE(20)
  const bitDepth = buf[24]
  const colorType = buf[25]
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`지원 안 하는 PNG 포맷 (bitDepth ${bitDepth}, colorType ${colorType})`)
  }
  const ch = colorType === 6 ? 4 : 3
  const idat = []
  let p = 8
  while (p < buf.length) {
    const len = buf.readUInt32BE(p)
    const type = buf.toString('ascii', p + 4, p + 8)
    if (type === 'IDAT') idat.push(buf.slice(p + 8, p + 8 + len))
    p += 12 + len
  }
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = W * ch
  const out = Buffer.alloc(H * stride)
  let rp = 0
  for (let y = 0; y < H; y++) {
    const ft = raw[rp++]
    const line = raw.slice(rp, rp + stride)
    rp += stride
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[y * stride + x - ch] : 0
      const b = y > 0 ? out[(y - 1) * stride + x] : 0
      const c = x >= ch && y > 0 ? out[(y - 1) * stride + x - ch] : 0
      let v = line[x]
      if (ft === 1) v += a
      else if (ft === 2) v += b
      else if (ft === 3) v += (a + b) >> 1
      else if (ft === 4) {
        const pa = Math.abs(b - c)
        const pb = Math.abs(a - c)
        const pc = Math.abs(a + b - 2 * c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      out[y * stride + x] = v & 255
    }
  }
  return { width: W, height: H, channels: ch, data: out }
}

/**
 * 실제로 그려진 화면을 픽셀 단위로 검사한다.
 * 빌드 통과·콘솔 에러 0 이어도 캔버스가 새까맣거나 텅 빌 수 있어서 이걸 본다.
 *
 * ⚠️ 페이지 안에서 canvas.drawImage 로 읽으면 안 된다. Phaser 의 WebGL 컨텍스트는
 *    preserveDrawingBuffer:false 라 합성 후 버퍼가 비어 **전부 검게** 나온다(실측).
 *    Playwright 스크린샷은 브라우저 합성기를 거치므로 실제 화면이 잡힌다.
 *
 * 반환: { distinctColors, nonBgRatio, brightest, width, height }
 */
export async function sampleCanvas(page) {
  const png = await page.locator('canvas').screenshot()
  const { width, height, channels, data } = decodePng(png)
  const stride = width * channels
  const seen = new Set()
  let nonBg = 0
  let brightest = 0
  let total = 0
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = y * stride + x * channels
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      total++
      seen.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)) // 15bit 로 뭉쳐 센다
      const lum = (r * 299 + g * 587 + b * 114) / 1000
      if (lum > brightest) brightest = lum
      if (lum > 40) nonBg++ // 어두운 던전 바닥보다 밝은 픽셀
    }
  }
  return { distinctColors: seen.size, nonBgRatio: nonBg / total, brightest, width, height }
}
