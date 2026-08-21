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

  // 크리처 주변만. 접지선 y=500 아래까지 여유를 둔다 —
  // 걷기는 다리가 rest 보다 아래로 뻗을 수 있어서, 발이 잘리면 판정이 안 된다
  const CX = 520, CW = 340, CY = 90, CH = 470
  const GROUND = 500

  const grab = () => {
    const c = document.createElement('canvas')
    c.width = CW; c.height = CH
    const g = c.getContext('2d')
    g.drawImage(src, CX - CW / 2, CY, CW, CH, 0, 0, CW, CH)
    // 접지선. 발이 이 선을 뚫거나 뜨면 걷기가 아니라 미끄러지는 것이다
    g.fillStyle = 'rgba(255,68,68,0.75)'
    g.fillRect(0, GROUND - CY, CW, 1)
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

  // ── 2.5) walk ──
  lab._mode = 'walk'
  lab.rig.play('walk')
  const walkCells = []
  const wn = lab.rig.clip.frames.length
  for (let i = 0; i < 8; i++) {
    lab.rig.time = (i / 8) * wn
    lab.rig.apply()
    await wait()
    walkCells.push({ canvas: grab(), label: `walk ${i + 1}/8` })
  }
  const walk = strip('walk', walkCells)

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

  // ── 3.5) 다리 확대 ──
  // 다리는 치마 밑으로만 보여서 전신 컷으로는 걷는지 아닌지 판정이 안 된다.
  lab._mode = 'walk'
  lab.rig.play('walk')
  const LW = 300, LH = 190, LX = 400, LY = 350
  const legCells = []
  const ln = lab.rig.clip.frames.length
  for (let i = 0; i < 6; i++) {
    lab.rig.time = (i / 6) * ln
    lab.rig.apply()
    await wait()
    const c = document.createElement('canvas')
    c.width = LW * 2; c.height = LH * 2
    const g = c.getContext('2d')
    g.imageSmoothingEnabled = false
    g.drawImage(src, LX, LY, LW, LH, 0, 0, LW * 2, LH * 2)
    g.fillStyle = 'rgba(255,68,68,0.8)'
    g.fillRect(0, (GROUND - LY) * 2, LW * 2, 2)
    legCells.push({ canvas: c, label: `walk ${i + 1}/6` })
  }
  const outL = document.createElement('canvas')
  outL.width = LW * 2 * legCells.length
  outL.height = LH * 2 + 22
  const gl = outL.getContext('2d')
  gl.fillStyle = '#1a1e24'; gl.fillRect(0, 0, outL.width, outL.height)
  legCells.forEach((c, i) => {
    gl.drawImage(c.canvas, i * LW * 2, 22)
    gl.fillStyle = '#7fd6a5'; gl.font = '14px sans-serif'
    gl.fillText(c.label, i * LW * 2 + 8, 16)
    gl.strokeStyle = '#2b313a'; gl.strokeRect(i * LW * 2, 0, LW * 2, outL.height)
  })
  const legs = outL.toDataURL('image/png')

  // ── 4) 꼬리 확대 ──
  // 꼬리가 흔들릴 때 body 에 남은 복사본이 드러나 '꼬리가 두 개'로 보인 적이 있다.
  // 흔들림의 양 끝을 확대해서 나란히 놓으면 유령이 있는지 바로 보인다.
  lab._mode = 'idle'
  lab.rig.play('idle')
  const TW = 300, TH = 210, TX = 380, TY = 330
  const tailCells = []
  const tn = lab.rig.clip.frames.length
  for (const [t, name] of [[0, '꼬리 위'], [tn / 4, '중간'],
                           [tn / 2, '꼬리 아래'], [(3 * tn) / 4, '중간']]) {
    lab.rig.time = t
    lab.rig.apply()
    await wait()
    const c = document.createElement('canvas')
    c.width = TW * 2; c.height = TH * 2
    const g = c.getContext('2d')
    g.imageSmoothingEnabled = false
    g.drawImage(src, TX, TY, TW, TH, 0, 0, TW * 2, TH * 2)
    tailCells.push({ canvas: c, label: name })
  }
  const outT = document.createElement('canvas')
  outT.width = TW * 2 * tailCells.length
  outT.height = TH * 2 + 22
  const gt = outT.getContext('2d')
  gt.fillStyle = '#1a1e24'; gt.fillRect(0, 0, outT.width, outT.height)
  tailCells.forEach((c, i) => {
    gt.drawImage(c.canvas, i * TW * 2, 22)
    gt.fillStyle = '#7fd6a5'; gt.font = '14px sans-serif'
    gt.fillText(c.label, i * TW * 2 + 8, 16)
    gt.strokeStyle = '#2b313a'; gt.strokeRect(i * TW * 2, 0, TW * 2, outT.height)
  })

  return { verify, idle, walk, legs, cast, tail: outT.toDataURL('image/png') }
})

for (const [name, data] of Object.entries(shots)) {
  const p = path.join(HERE, `_m3_${name}.png`)
  writeFileSync(p, Buffer.from(data.split(',')[1], 'base64'))
  console.log(`  -> ${p}`)
}
console.log(errors.length ? `  ⚠ 에러:\n   ${errors.join('\n   ')}` : '  에러 없음')
await browser.close()
