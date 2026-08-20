/**
 * 뼈대 랩(/rig.html)의 6프레임을 한 장으로 캡처한다.
 *
 * 왜 필요한가: 움직임 판정은 눈으로 해야 한다(SD 작업지시 §9).
 * 실제로 여기서도 "수치는 맞는데 눈으로 보니 망가진" 사례가 반복됐다.
 * 브라우저를 띄우지 않고도 프레임을 나란히 놓고 보기 위한 스크립트다.
 *
 *   node tools/sprites/rig/shoot_lab.mjs [출력경로]
 *   (dev 서버가 5173 에서 떠 있어야 한다)
 */
import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.argv[2] || path.join(HERE, '_frames.png')
const URL = 'http://localhost:5173/rig.html'

const browser = await chromium.launch()
const page = await browser.newPage({ viewportSize: { width: 1120, height: 560 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__lab, null, { timeout: 10000 })

// 6프레임을 정확히 하나씩 잡아 가로로 이어붙인다.
const strip = await page.evaluate(async () => {
  const lab = window.__lab
  lab._playing = false
  const src = document.querySelector('#game canvas')
  const n = lab.rig.clip.frames.length

  // 캐릭터 주변만 바짝 잘라 2배로 키운다. 작게 보면 발이 뜬 걸 못 잡는다
  const CX = 330, CW = 210, CY = 130, CH = 210
  const Z = 2
  const GROUND = 300 // 랩의 접지선 y (rig-lab.js 와 같은 값)
  const COLS = Math.min(n, 6) // 프레임이 12개로 늘어 한 줄에 다 못 넣는다
  const ROWS = Math.ceil(n / COLS)
  const CELL_H = CH * Z + 20
  const out = document.createElement('canvas')
  out.width = CW * Z * COLS
  out.height = CELL_H * ROWS
  const g = out.getContext('2d')
  g.imageSmoothingEnabled = false
  g.fillStyle = '#1a1e24'
  g.fillRect(0, 0, out.width, out.height)

  for (let i = 0; i < n; i++) {
    lab.rig.time = i
    lab.rig.apply()
    lab._draw()
    // Phaser 는 다음 렌더 틱에 캔버스에 그린다. 두 프레임 기다린다
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const ox = (i % COLS) * CW * Z
    const oy = Math.floor(i / COLS) * CELL_H
    g.drawImage(src, CX - CW / 2, CY, CW, CH, ox, oy + 20, CW * Z, CH * Z)
    // 접지선을 빨갛게 덧그린다. 발이 이 선에 닿는지가 유일한 판정 기준이다
    g.fillStyle = '#ff4444'
    g.fillRect(ox, oy + 20 + (GROUND - CY) * Z, CW * Z, 1)
    g.fillStyle = '#7fd6a5'
    g.font = '14px sans-serif'
    g.fillText(`f${i + 1} ${lab.rig.clip.frames[i].phase}`, ox + 10, oy + 15)
    g.strokeStyle = '#2b313a'
    g.strokeRect(ox, oy, CW * Z, CELL_H)
  }
  return out.toDataURL('image/png')
})

/**
 * 진단 2 — 발끝 궤적.
 * 정지 프레임으로는 "발이 미끄러지는지"를 절대 못 본다. 궤적을 그려야 보인다.
 * 접지 구간이 **직선으로 뒤로** 흐르면 안 미끄러지는 것이고,
 * 앞으로 되돌아가거나 지면 아래로 파고들면 미끄러진다.
 */
const trails = await page.evaluate(async () => {
  const r = window.__lab.rig
  const n = r.clip.frames.length
  const STEPS = 120
  const tip = (name) => {
    const p = r.parts.get(name)
    const b = r.bones.get(name)
    return {
      x: p.x + Math.cos(p.rotation) * b.length * r.scale,
      y: p.y + Math.sin(p.rotation) * b.length * r.scale,
    }
  }
  const far = [], near = [], hip = []
  for (let s = 0; s < STEPS; s++) {
    r.time = (s / STEPS) * n
    r.apply()
    far.push(tip('legF_shin'))
    near.push(tip('legN_shin'))
    const t = r.parts.get('torso')
    hip.push({ x: t.x, y: t.y })
  }

  const W = 760, H = 320, PADX = 60, PADY = 40
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')
  g.fillStyle = '#1a1e24'; g.fillRect(0, 0, W, H)

  const all = [...far, ...near, ...hip]
  const minX = Math.min(...all.map((p) => p.x)), maxX = Math.max(...all.map((p) => p.x))
  const minY = Math.min(...all.map((p) => p.y))
  const sx = (W - PADX * 2) / (maxX - minX)
  const sy = (H - PADY * 2) / (0 - minY)
  const S = Math.min(sx, sy)
  const X = (v) => PADX + (v - minX) * S
  const Y = (v) => H - PADY + v * S

  g.strokeStyle = '#ff4444'; g.lineWidth = 1
  g.beginPath(); g.moveTo(0, Y(0)); g.lineTo(W, Y(0)); g.stroke()
  g.fillStyle = '#ff6666'; g.font = '11px sans-serif'
  g.fillText('지면 (y=0)', 6, Y(0) - 5)

  const plot = (pts, color, label, ly) => {
    g.fillStyle = color
    pts.forEach((p, i) => {
      g.globalAlpha = 0.35 + 0.65 * (i / pts.length)
      g.beginPath(); g.arc(X(p.x), Y(p.y), 2.2, 0, 7); g.fill()
    })
    g.globalAlpha = 1
    g.fillText(label, W - 190, ly)
  }
  plot(hip, '#8899aa', '● 골반 — 위아래로만 흔들려야 함', 20)
  plot(far, '#6688aa', '● 먼 쪽 발', 36)
  plot(near, '#ee9955', '● 가까운 쪽 발', 52)

  g.fillStyle = '#7d8794'; g.font = '11px sans-serif'
  g.fillText('진하기 = 시간 순서 (연함 → 진함)', 6, 16)
  g.fillText('접지 구간이 지면 위를 직선으로 흐르면 정상. 되돌아가면 미끄러진다.', 6, H - 10)
  return c.toDataURL('image/png')
})

const { writeFileSync } = await import('node:fs')
writeFileSync(OUT, Buffer.from(strip.split(',')[1], 'base64'))
const trailPath = OUT.replace(/\.png$/, '_trails.png')
writeFileSync(trailPath, Buffer.from(trails.split(',')[1], 'base64'))
console.log(`  -> ${trailPath}`)
console.log(errors.length ? `  ⚠ 에러 ${errors.length}건:\n   ` + errors.join('\n   ') : '  에러 없음')
console.log(`  -> ${OUT}`)
await browser.close()
