/**
 * 크리처 랩(/creature.html)을 캡처한다.
 *
 * 세 가지를 본다:
 *   1) rest 자세가 **원본과 같은가** — 피벗이나 attach 가 틀리면 여기서 바로 어긋난다
 *   2) idle 프레임들 — 관절에서 구멍이 드러나지 않는가
 *   3) cast 프레임들 — 크게 움직였을 때도 버티는가
 *
 *   node tools/sprites/rig/shoot_creature.mjs
 *   (dev 서버가 5173 에서 떠 있어야 한다)
 */
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const browser = await chromium.launch()
const page = await browser.newPage({ viewportSize: { width: 1120, height: 820 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

await page.goto('http://localhost:5173/creature.html', { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__clab, null, { timeout: 10000 })

const shots = await page.evaluate(async () => {
  const lab = window.__clab
  const src = document.querySelector('#game canvas')
  const wait = () => new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(r)))

  // 크리처 주변만. 접지선 y=500 기준으로 위로 크게 잡는다
  const CX = 520, CW = 330, CY = 110, CH = 400

  const grab = () => {
    const c = document.createElement('canvas')
    c.width = CW; c.height = CH
    c.getContext('2d').drawImage(src, CX - CW / 2, CY, CW, CH, 0, 0, CW, CH)
    return c
  }

  const strip = (title, cells) => {
    const out = document.createElement('canvas')
    out.width = CW * cells.length
    out.height = CH + 22
    const g = out.getContext('2d')
    g.fillStyle = '#1a1e24'; g.fillRect(0, 0, out.width, out.height)
    cells.forEach((c, i) => {
      g.drawImage(c.canvas, i * CW, 22)
      g.fillStyle = '#7fd6a5'; g.font = '13px sans-serif'
      g.fillText(c.label, i * CW + 8, 16)
      g.strokeStyle = '#2b313a'; g.strokeRect(i * CW, 0, CW, out.height)
    })
    return out.toDataURL('image/png')
  }

  // ── 1) rest vs 원본 ──
  lab._mode = 'rest'
  lab.rig.playing = false
  lab._applyRest()
  lab.ghost.setAlpha(0)
  await wait()
  const restOnly = grab()
  lab.ghost.setAlpha(0.5)
  await wait()
  const restGhost = grab()
  // 원본만
  for (const [, p] of lab.rig.parts) p.setAlpha(0)
  lab.ghost.setAlpha(1).clearTint()
  await wait()
  const origOnly = grab()
  for (const [, p] of lab.rig.parts) p.setAlpha(1)
  lab.ghost.setAlpha(0).setTint(0x66ccff)

  const verify = strip('rest', [
    { canvas: origOnly, label: '원본' },
    { canvas: restOnly, label: 'rest (파츠 조립)' },
    { canvas: restGhost, label: '겹쳐보기 — 어긋나면 파랑이 삐져나온다' },
  ])

  // ── 2) idle ──
  lab._mode = 'idle'
  lab.rig.play('idle')
  const idleCells = []
  const n = lab.rig.clip.frames.length
  for (let i = 0; i < 6; i++) {
    lab.rig.time = (i / 6) * n
    lab.rig.apply()
    await wait()
    idleCells.push({ canvas: grab(), label: `idle ${i + 1}/6` })
  }
  const idle = strip('idle', idleCells)

  // ── 3) cast ──
  lab._mode = 'cast'
  lab.rig.play('cast')
  const castCells = []
  const m = lab.rig.clip.frames.length
  for (let i = 0; i < 6; i++) {
    lab.rig.time = Math.min(m - 1, (i / 5) * (m - 1))
    lab.rig.apply()
    await wait()
    castCells.push({ canvas: grab(), label: `cast ${i + 1}/6` })
  }
  const cast = strip('cast', castCells)

  return { verify, idle, cast }
})

for (const [name, data] of Object.entries(shots)) {
  const p = path.join(HERE, `_m3_${name}.png`)
  writeFileSync(p, Buffer.from(data.split(',')[1], 'base64'))
  console.log(`  -> ${p}`)
}
console.log(errors.length ? `  ⚠ 에러:\n   ${errors.join('\n   ')}` : '  에러 없음')
await browser.close()
