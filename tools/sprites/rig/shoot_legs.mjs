/**
 * 다리만 확대해서 **뼈를 겹쳐** 캡처한다.
 *
 * "허벅지는 안 움직이고 무릎만 움직인다 / 어긋나 보인다" 는 증상은 원인이 둘로 갈린다.
 *   (a) 뼈대 자체가 틀렸다 — 각도가 실제로 안 변한다
 *   (b) 뼈대는 맞는데 그림이 안 따라온다 — 피벗/attach 가 어긋났다
 * 뼈를 겹쳐 보면 한 번에 구분된다. 그림 위에서 뼈만 움직이면 (b) 다.
 *
 *   node tools/sprites/rig/shoot_legs.mjs [clip]
 */
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CLIP = process.argv[2] || 'walk'

const browser = await chromium.launch()
const page = await browser.newPage({ viewportSize: { width: 1120, height: 820 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://localhost:5173/creature.html', { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__clab, null, { timeout: 10000 })

const shot = await page.evaluate(async ([clip, withBones]) => {
  const lab = window.__clab
  const r = lab.rig
  lab._mode = clip
  lab._playing = false
  r.play(clip)
  lab.showBones = withBones
  const src = document.querySelector('#game canvas')
  const wait = () => new Promise((res) =>
    requestAnimationFrame(() => requestAnimationFrame(res)))

  const N = 8
  const W = 300, H = 210, X = 400, Y = 350, Z = 2
  const GROUND = 500
  const out = document.createElement('canvas')
  out.width = W * Z * 4
  out.height = (H * Z + 22) * 2
  const g = out.getContext('2d')
  g.imageSmoothingEnabled = false
  g.fillStyle = '#1a1e24'
  g.fillRect(0, 0, out.width, out.height)

  const n = r.clip.frames.length
  const rows = []
  for (let i = 0; i < N; i++) {
    r.time = (i / N) * n
    r.apply()
    lab._draw ? lab._draw() : null
    await wait()
    const ox = (i % 4) * W * Z
    const oy = Math.floor(i / 4) * (H * Z + 22)
    g.drawImage(src, X, Y, W, H, ox, oy + 22, W * Z, H * Z)
    g.fillStyle = 'rgba(255,68,68,0.8)'
    g.fillRect(ox, oy + 22 + (GROUND - Y) * Z, W * Z, 2)

    const A = r.clip.frames[Math.round((i / N) * n) % n].angles
    const lbl = `${i + 1}/${N}  허벅지 ${A.legR_thigh.toFixed(0)}°`
      + `  정강이 ${A.legR_shin.toFixed(0)}°  발 ${A.legR_foot.toFixed(0)}°`
    g.fillStyle = '#7fd6a5'
    g.font = '14px sans-serif'
    g.fillText(lbl, ox + 8, oy + 16)
    g.strokeStyle = '#2b313a'
    g.strokeRect(ox, oy, W * Z, H * Z + 22)
    rows.push(lbl)
  }
  return { png: out.toDataURL('image/png'), rows }
}, [CLIP, true])

const plain = await page.evaluate(async ([clip]) => {
  const lab = window.__clab
  const r = lab.rig
  lab.showBones = false
  lab._playing = false
  r.play(clip)
  const src = document.querySelector('#game canvas')
  const wait = () => new Promise((res) =>
    requestAnimationFrame(() => requestAnimationFrame(res)))
  const N = 8, W = 230, H = 200, X = 460, Y = 350, Z = 3, GROUND = 500
  const out = document.createElement('canvas')
  out.width = W * Z * 4
  out.height = (H * Z + 20) * 2
  const g = out.getContext('2d')
  g.imageSmoothingEnabled = false
  g.fillStyle = '#1a1e24'
  g.fillRect(0, 0, out.width, out.height)
  const n = r.clip.frames.length
  for (let i = 0; i < N; i++) {
    r.time = (i / N) * n
    r.apply()
    await wait()
    const ox = (i % 4) * W * Z
    const oy = Math.floor(i / 4) * (H * Z + 20)
    g.drawImage(src, X, Y, W, H, ox, oy + 20, W * Z, H * Z)
    g.fillStyle = 'rgba(255,68,68,0.8)'
    g.fillRect(ox, oy + 20 + (GROUND - Y) * Z, W * Z, 2)
    g.fillStyle = '#7fd6a5'
    g.font = '15px sans-serif'
    g.fillText(`${i + 1}/${N}`, ox + 8, oy + 15)
    g.strokeStyle = '#2b313a'
    g.strokeRect(ox, oy, W * Z, H * Z + 20)
  }
  return out.toDataURL('image/png')
}, [CLIP])

const p = path.join(HERE, `_m3_bones_${CLIP}.png`)
writeFileSync(p, Buffer.from(shot.png.split(',')[1], 'base64'))
const p2 = path.join(HERE, `_m3_legzoom_${CLIP}.png`)
writeFileSync(p2, Buffer.from(plain.split(',')[1], 'base64'))
console.log(shot.rows.join('\n'))
console.log(errors.length ? `  ⚠ ${errors.join('\n   ')}` : '  에러 없음')
console.log(`  -> ${p}\n  -> ${p2}`)
await browser.close()
