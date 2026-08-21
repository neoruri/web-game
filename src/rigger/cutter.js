/**
 * 자르기 파이프라인. tools/sprites/rig/cut_parts.py 를 브라우저로 옮긴 것이다.
 *
 * 그 스크립트로 크리처 한 마리를 작업하며 밟은 함정들이 전부 여기 규칙으로 남아 있다:
 *   · 관절은 **겹치게** 자른다. 한쪽만 가져가면 반대쪽에 홈이 남고 돌리면 드러난다
 *   · 다만 겹침은 **관절 둘레에서만**. 사방으로 넓히면 옆을 지나는 다른 부위까지
 *     길게 덮어서, 그 부위가 움직일 때 복사본이 제자리에 남아 둘로 보인다
 *   · **body 보다 뒤에 그려지는 파츠는 body 겹침이 아예 필요 없다** (0 을 준다)
 *   · 폴리곤이 스치면서 떨어져 나온 부스러기는 걷어낸다. 단 원본부터 떨어져 있는
 *     그림(불티 등)은 예외로 둬야 한다
 */
import {
  addDisc, alphaFromBlack, alphaGlow, connectedComponents, dilate, luminance, polyMask,
} from './imgops.js'

export const ALPHA_RULES = {
  normal: '기본 (배경 검정 기준)',
  glow: '발광체 (불꽃 — 어두운 후광을 투명하게)',
}

/**
 * @param {ImageData} img   원본
 * @param {Array} parts     [{name, poly, joint:[x,y], parent, alphaRule, jointR, smooth, isBody}]
 * @param {object} opts     { overlap, minIsland, keepIslands:Set }
 */
export function cut(img, parts, opts = {}) {
  const w = img.width, h = img.height
  const overlap = opts.overlap ?? 30
  const minIsland = opts.minIsland ?? 600
  const keep = opts.keepIslands ?? new Set()

  const lum = luminance(img)
  const baseAlpha = alphaFromBlack(lum)
  const solid = new Uint8Array(w * h)
  for (let i = 0; i < solid.length; i++) solid[i] = baseAlpha[i] > 0.02 ? 1 : 0

  // 파츠별 알파 (발광체는 규칙이 다르다)
  const alphaOf = new Map()
  for (const p of parts) {
    alphaOf.set(p.name, p.alphaRule === 'glow'
      ? alphaGlow(lum, w, h, p.glowY ?? Math.round(h * 0.45))
      : baseAlpha)
  }

  // 폴리곤이 있는 파츠들의 합집합. body(catch-all)는 여기서 빠진다
  const shaped = parts.filter((p) => !p.isBody && p.poly && p.poly.length >= 3)
  const maskOf = new Map()
  const union = new Uint8Array(w * h)
  for (const p of shaped) {
    const m = polyMask(p.poly, w, h, p.smooth)
    const a = alphaOf.get(p.name)
    const take = new Uint8Array(w * h)
    for (let i = 0; i < take.length; i++) take[i] = m[i] && a[i] > 0.02 ? 1 : 0
    maskOf.set(p.name, take)
    for (let i = 0; i < union.length; i++) if (m[i]) union[i] = 1
  }

  // body = 나머지 + **관절 둘레에서만** 넓힌 겹침
  const bodyPart = parts.find((p) => p.isBody)
  if (bodyPart) {
    const core = new Uint8Array(w * h)
    for (let i = 0; i < core.length; i++) core[i] = solid[i] && !union[i] ? 1 : 0
    const near = new Uint8Array(w * h)
    for (const p of shaped) {
      const r = p.jointR ?? 110
      if (r > 0 && p.joint) addDisc(near, w, h, p.joint[0], p.joint[1], r)
    }
    const grown = dilate(core, w, h, overlap)
    const body = new Uint8Array(w * h)
    for (let i = 0; i < body.length; i++) {
      body[i] = core[i] || (grown[i] && solid[i] && (near[i] || !union[i])) ? 1 : 0
    }
    maskOf.set(bodyPart.name, body)
  }

  // 부스러기 제거
  const dropped = []
  for (const p of parts) {
    const m = maskOf.get(p.name)
    if (!m || keep.has(p.name)) continue
    const { labels, stats } = connectedComponents(m, w, h)
    if (stats.length <= 1) continue
    let biggest = stats[0]
    for (const s of stats) if (s.area > biggest.area) biggest = s
    for (const s of stats) {
      if (s.label === biggest.label || s.area >= minIsland) continue
      dropped.push({ name: p.name, area: s.area })
      for (let i = 0; i < m.length; i++) if (labels[i] === s.label) m[i] = 0
    }
  }

  // 잘라내기 — bbox 로 크롭하고 알파를 입힌다
  const out = []
  for (const p of parts) {
    const m = maskOf.get(p.name)
    if (!m) continue
    let x0 = w, y0 = h, x1 = -1, y1 = -1
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!m[y * w + x]) continue
        if (x < x0) x0 = x
        if (y < y0) y0 = y
        if (x > x1) x1 = x
        if (y > y1) y1 = y
      }
    }
    if (x1 < 0) { out.push({ name: p.name, empty: true }); continue }
    const pw = x1 - x0 + 1, ph = y1 - y0 + 1
    const a = alphaOf.get(p.name) ?? baseAlpha
    const c = document.createElement('canvas')
    c.width = pw
    c.height = ph
    const g = c.getContext('2d')
    const id = g.createImageData(pw, ph)
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        const si = (y + y0) * w + (x + x0)
        const di = (y * pw + x) * 4
        const sp = si * 4
        id.data[di] = img.data[sp]
        id.data[di + 1] = img.data[sp + 1]
        id.data[di + 2] = img.data[sp + 2]
        id.data[di + 3] = m[si] ? Math.round(a[si] * 255) : 0
      }
    }
    g.putImageData(id, 0, 0)
    out.push({
      name: p.name,
      canvas: c,
      offset: [x0, y0],
      size: [pw, ph],
      // 회전 중심을 그림 안의 비율로. 관절이 그림 밖이면 음수/1 초과가 나오는데 정상이다
      pivot: p.joint
        ? [ (p.joint[0] - x0) / pw, (p.joint[1] - y0) / ph ]
        : [0.5, 0.5],
      pixels: m.reduce((s, v) => s + v, 0),
    })
  }

  return { parts: out, masks: maskOf, dropped, solidCount: solid.reduce((s, v) => s + v, 0) }
}

/**
 * 진단. 두 가지를 본다:
 *   1) 파츠에서 떨어져 나온 조각 — 폴리곤이 놓쳤거나 남의 것을 물어온 흔적
 *   2) 중복 소유 — 두 파츠가 같은 픽셀을 갖고 다르게 움직이면 둘로 보인다
 * ⚠️ 원본부터 떨어져 있는 그림(불티 등)은 1번의 오탐이다. 좌표를 보고 사람이 판단해야 한다.
 */
export function diagnose(masks, w, h, minIsland = 40) {
  const islands = []
  for (const [name, m] of masks) {
    const { stats } = connectedComponents(m, w, h)
    if (stats.length <= 1) continue
    let biggest = stats[0]
    for (const s of stats) if (s.area > biggest.area) biggest = s
    for (const s of stats) {
      if (s.label === biggest.label || s.area < minIsland) continue
      islands.push({ name, area: s.area, box: [s.x0, s.y0, s.x1, s.y1] })
    }
  }
  islands.sort((a, b) => b.area - a.area)

  const names = [...masks.keys()]
  const size = new Map(names.map((n) => [n, masks.get(n).reduce((s, v) => s + v, 0)]))
  const dupes = []
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const A = masks.get(names[i]), B = masks.get(names[j])
      let n = 0
      for (let k = 0; k < A.length; k++) if (A[k] && B[k]) n++
      if (n < 200) continue
      const ra = n / Math.max(1, size.get(names[i]))
      const rb = n / Math.max(1, size.get(names[j]))
      dupes.push({ a: names[i], b: names[j], px: n, ra, rb, hot: Math.max(ra, rb) > 0.25 })
    }
  }
  dupes.sort((x, y) => y.px - x.px)
  return { islands, dupes }
}
