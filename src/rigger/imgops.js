/**
 * 마스크 연산. Python 쪽 cut_parts.py 가 cv2 로 하던 것을 브라우저용으로 옮긴 것이다.
 *
 * 마스크는 전부 Uint8Array (0 또는 1), 크기 w*h, 행 우선.
 * 알파는 Float32Array (0~1).
 */

/** 밝기(=RGB 최대값) 맵을 만든다. 배경이 순수 검정이라 이것만으로 피사체가 갈린다. */
export function luminance(imageData) {
  const { data, width, height } = imageData
  const out = new Float32Array(width * height)
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = Math.max(data[p], data[p + 1], data[p + 2])
  }
  return out
}

/** 경계를 딱 자르면 계단이 생기므로 lo~hi 사이를 부드럽게 넘긴다. */
export function alphaFromBlack(lum, lo = 10, hi = 32) {
  const out = new Float32Array(lum.length)
  const d = hi - lo
  for (let i = 0; i < lum.length; i++) {
    out[i] = Math.min(1, Math.max(0, (lum[i] - lo) / d))
  }
  return out
}

/**
 * 불꽃처럼 **스스로 빛나는** 부위용 알파.
 * 기본 규칙은 불꽃 바깥의 어두운 후광까지 불투명으로 만들어서, 잘라내면
 * 불꽃 주위에 검은 덩어리가 따라붙는다. 밝기로 서서히 투명해지게 해야 사라진다.
 * 어두운 살색 부위까지 지워지지 않게 y < yMax 구간에만 적용한다.
 */
export function alphaGlow(lum, w, h, yMax) {
  const base = alphaFromBlack(lum)
  const lim = yMax ?? h
  for (let y = 0; y < lim; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const soft = Math.min(1, Math.max(0, (lum[i] - 38) / 70))
      base[i] = Math.min(base[i], soft)
    }
  }
  return base
}

/** 폴리곤을 채운 마스크. 캔버스로 채우는 게 스캔라인 직접 구현보다 빠르고 정확하다. */
export function polyMask(pts, w, h, smooth = false) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d', { willReadFrequently: true })
  g.fillStyle = '#fff'
  g.beginPath()
  tracePath(g, pts, smooth)
  g.fill()
  const d = g.getImageData(0, 0, w, h).data
  const out = new Uint8Array(w * h)
  for (let i = 0, p = 3; i < out.length; i++, p += 4) out[i] = d[p] > 127 ? 1 : 0
  return out
}

/**
 * 폴리곤 경로를 그린다. smooth 면 Catmull-Rom 을 베지어로 바꿔 **곡선**으로 잇는다.
 * 무릎 혹처럼 둥근 관절은 직선으로 자르면 각진 조각이 남는다.
 */
export function tracePath(g, pts, smooth) {
  const n = pts.length
  if (n < 2) return
  if (!smooth || n < 4) {
    g.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < n; i++) g.lineTo(pts[i][0], pts[i][1])
    g.closePath()
    return
  }
  const at = (i) => pts[(i + n) % n]
  g.moveTo(at(0)[0], at(0)[1])
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2)
    g.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6,
      p2[0], p2[1]
    )
  }
  g.closePath()
}

/**
 * 박스 팽창(cv2.dilate 의 사각 커널). 적분영상으로 O(n) 에 끝낸다.
 * 순진하게 커널을 돌면 1254² × 61² 라 브라우저가 멈춘다.
 */
export function dilate(mask, w, h, r) {
  if (r <= 0) return mask.slice()
  // 적분영상: sum[y][x] = (0,0)~(x-1,y-1) 합
  const sum = new Int32Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) {
    let row = 0
    for (let x = 0; x < w; x++) {
      row += mask[y * w + x]
      sum[(y + 1) * (w + 1) + (x + 1)] = sum[y * (w + 1) + (x + 1)] + row
    }
  }
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r)
      const s = sum[(y1 + 1) * (w + 1) + (x1 + 1)] - sum[y0 * (w + 1) + (x1 + 1)]
              - sum[(y1 + 1) * (w + 1) + x0] + sum[y0 * (w + 1) + x0]
      out[y * w + x] = s > 0 ? 1 : 0
    }
  }
  return out
}

/**
 * 8이웃 연결요소. cv2.connectedComponentsWithStats 대체.
 * @returns {{labels:Int32Array, stats:Array<{area,x0,y0,x1,y1}>}} 라벨은 1부터
 */
export function connectedComponents(mask, w, h) {
  const labels = new Int32Array(w * h)
  const stats = []
  const stack = new Int32Array(w * h)
  let cur = 0
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || labels[i]) continue
    cur++
    let top = 0
    stack[top++] = i
    labels[i] = cur
    let area = 0, x0 = w, y0 = h, x1 = -1, y1 = -1
    while (top > 0) {
      const p = stack[--top]
      const px = p % w, py = (p / w) | 0
      area++
      if (px < x0) x0 = px
      if (py < y0) y0 = py
      if (px > x1) x1 = px
      if (py > y1) y1 = py
      for (let dy = -1; dy <= 1; dy++) {
        const ny = py + dy
        if (ny < 0 || ny >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx
          if (nx < 0 || nx >= w) continue
          const q = ny * w + nx
          if (mask[q] && !labels[q]) { labels[q] = cur; stack[top++] = q }
        }
      }
    }
    stats.push({ label: cur, area, x0, y0, x1, y1 })
  }
  return { labels, stats }
}

/** 원 채우기 — 관절 둘레 겹침 허용 범위를 만들 때 쓴다. */
export function addDisc(mask, w, h, cx, cy, r) {
  const r2 = r * r
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(h - 1, Math.ceil(cy + r))
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w - 1, Math.ceil(cx + r))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy
      if (dx * dx + dy * dy <= r2) mask[y * w + x] = 1
    }
  }
}
