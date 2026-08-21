/**
 * 편집 캔버스. 원본 위에 폴리곤을 찍고, 관절을 놓고, 확대/이동한다.
 *
 * 이 도구를 만든 이유가 여기 있다. 이전에는 격자 이미지를 눈으로 읽어 좌표를
 * 손으로 옮겨 적었는데, 나온 버그가 대부분 그 과정의 오독이었다
 * (꼬리를 50px 어긋나게 읽어 조각만 잘림, 치마 자락을 허벅지로 오인 등).
 * 마우스로 찍으면 그 종류가 통째로 사라진다.
 */
import { tracePath } from './imgops.js'

const HIT = 9 // 점을 집는 반경(화면 px)

export class Editor {
  constructor(canvas, app) {
    this.c = canvas
    this.g = canvas.getContext('2d')
    this.app = app
    this.view = { x: 0, y: 0, z: 1 }
    this.mode = 'edit' // 'edit' | 'draw' | 'joint'
    this.drag = null
    this.hover = null
    this._bind()
  }

  /** 화면 좌표 -> 원본 픽셀 좌표 */
  toImage(ev) {
    const r = this.c.getBoundingClientRect()
    const sx = (ev.clientX - r.left) * (this.c.width / r.width)
    const sy = (ev.clientY - r.top) * (this.c.height / r.height)
    return [(sx - this.view.x) / this.view.z, (sy - this.view.y) / this.view.z]
  }

  fit() {
    const img = this.app.image
    if (!img) return
    const z = Math.min(this.c.width / img.width, this.c.height / img.height) * 0.92
    this.view.z = z
    this.view.x = (this.c.width - img.width * z) / 2
    this.view.y = (this.c.height - img.height * z) / 2
    this.render()
  }

  _bind() {
    const c = this.c
    c.addEventListener('contextmenu', (e) => e.preventDefault())

    c.addEventListener('wheel', (e) => {
      e.preventDefault()
      const [ix, iy] = this.toImage(e)
      const f = e.deltaY < 0 ? 1.15 : 1 / 1.15
      this.view.z = Math.min(20, Math.max(0.05, this.view.z * f))
      const r = c.getBoundingClientRect()
      const sx = (e.clientX - r.left) * (c.width / r.width)
      const sy = (e.clientY - r.top) * (c.height / r.height)
      this.view.x = sx - ix * this.view.z
      this.view.y = sy - iy * this.view.z
      this.render()
    }, { passive: false })

    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId)
      const p = this.toImage(e)
      // 가운데 버튼 또는 스페이스 = 화면 이동
      if (e.button === 1 || this.app.space) {
        this.drag = { type: 'pan', sx: e.clientX, sy: e.clientY,
                      vx: this.view.x, vy: this.view.y }
        return
      }
      const part = this.app.activePart()
      if (!part) return

      if (this.mode === 'joint') {
        part.joint = [Math.round(p[0]), Math.round(p[1])]
        this.app.touch()
        return
      }

      if (this.mode === 'tip') {
        // 방향점 — 이 뼈가 어느 쪽을 향하는지(rest 각도)를 정한다.
        // 자식이 있으면 자동으로 그 관절을 쓰지만, 머리·손·꼬리처럼 **끝 뼈**는
        // 자식이 없어서 직접 찍어줘야 한다. 안 찍으면 rest 가 0도로 남는다
        part.tip = [Math.round(p[0]), Math.round(p[1])]
        this.app.touch()
        return
      }

      if (e.button === 2) { // 우클릭 = 점 삭제
        const i = this._pickPoint(part, p)
        if (i >= 0 && part.poly.length > 3) {
          part.poly.splice(i, 1)
          this.app.touch()
        }
        return
      }

      if (this.mode === 'draw') {
        part.poly.push([Math.round(p[0]), Math.round(p[1])])
        this.app.touch()
        return
      }

      // edit: 점을 잡거나, 변 위를 누르면 점을 끼워 넣는다
      const i = this._pickPoint(part, p)
      if (i >= 0) {
        this.drag = { type: 'pt', i }
        return
      }
      const e2 = this._pickEdge(part, p)
      if (e2 >= 0) {
        part.poly.splice(e2 + 1, 0, [Math.round(p[0]), Math.round(p[1])])
        this.drag = { type: 'pt', i: e2 + 1 }
        this.app.touch()
      }
    })

    c.addEventListener('pointermove', (e) => {
      const p = this.toImage(e)
      this.app.showCoord(p)
      if (this.drag?.type === 'pan') {
        const r = c.getBoundingClientRect()
        const s = c.width / r.width
        this.view.x = this.drag.vx + (e.clientX - this.drag.sx) * s
        this.view.y = this.drag.vy + (e.clientY - this.drag.sy) * s
        this.render()
        return
      }
      if (this.drag?.type === 'pt') {
        const part = this.app.activePart()
        part.poly[this.drag.i] = [Math.round(p[0]), Math.round(p[1])]
        this.app.touch()
        return
      }
      const part = this.app.activePart()
      const h = part ? this._pickPoint(part, p) : -1
      if (h !== this.hover) { this.hover = h; this.render() }
    })

    const end = () => { if (this.drag?.type === 'pt') this.app.recut(); this.drag = null }
    c.addEventListener('pointerup', end)
    c.addEventListener('pointercancel', end)
  }

  _pickPoint(part, p) {
    const r = HIT / this.view.z
    for (let i = 0; i < part.poly.length; i++) {
      const q = part.poly[i]
      if (Math.hypot(q[0] - p[0], q[1] - p[1]) <= r) return i
    }
    return -1
  }

  _pickEdge(part, p) {
    const r = HIT / this.view.z
    const n = part.poly.length
    for (let i = 0; i < n; i++) {
      const a = part.poly[i], b = part.poly[(i + 1) % n]
      const dx = b[0] - a[0], dy = b[1] - a[1]
      const L2 = dx * dx + dy * dy
      if (!L2) continue
      let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2
      t = Math.max(0, Math.min(1, t))
      const d = Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1])
      if (d <= r) return i
    }
    return -1
  }

  render() {
    const g = this.g
    const { width: W, height: H } = this.c
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.fillStyle = '#0e1116'
    g.fillRect(0, 0, W, H)
    const img = this.app.image
    if (!img) {
      g.fillStyle = '#5a6472'
      g.font = '15px system-ui'
      g.textAlign = 'center'
      g.fillText('이미지를 이 영역에 끌어다 놓으세요', W / 2, H / 2)
      g.textAlign = 'left'
      return
    }
    const { x, y, z } = this.view
    g.imageSmoothingEnabled = z < 3
    g.drawImage(this.app.bitmap, x, y, img.width * z, img.height * z)

    const active = this.app.activePart()
    for (const p of this.app.parts) {
      if (p.isBody || !p.poly.length) continue
      const on = p === active
      g.save()
      g.setTransform(z, 0, 0, z, x, y)
      g.beginPath()
      tracePath(g, p.poly, p.smooth)
      g.fillStyle = on ? 'rgba(90,200,255,0.22)' : 'rgba(150,160,175,0.10)'
      g.fill()
      g.restore()
      g.lineWidth = on ? 2 : 1
      g.strokeStyle = on ? '#5ac8ff' : 'rgba(170,180,195,0.5)'
      g.beginPath()
      const scr = p.poly.map((q) => [q[0] * z + x, q[1] * z + y])
      tracePath(g, scr, p.smooth)
      g.stroke()

      if (on) {
        p.poly.forEach((q, i) => {
          const px = q[0] * z + x, py = q[1] * z + y
          g.beginPath()
          g.arc(px, py, i === this.hover ? 7 : 4.5, 0, 7)
          g.fillStyle = i === this.hover ? '#ffe14d' : '#5ac8ff'
          g.fill()
          g.strokeStyle = '#0e1116'
          g.lineWidth = 1.5
          g.stroke()
        })
      }
    }

    // 관절 — 부모까지 선으로 잇는다
    const byName = new Map(this.app.parts.map((p) => [p.name, p]))
    g.lineWidth = 1.5
    for (const p of this.app.parts) {
      if (!p.joint) continue
      const pp = p.parent && byName.get(p.parent)
      if (pp?.joint) {
        g.strokeStyle = 'rgba(120,255,190,0.55)'
        g.beginPath()
        g.moveTo(pp.joint[0] * z + x, pp.joint[1] * z + y)
        g.lineTo(p.joint[0] * z + x, p.joint[1] * z + y)
        g.stroke()
      }
    }
    // 방향점 — 끝 뼈가 어느 쪽을 향하는지
    for (const p of this.app.parts) {
      if (!p.tip || !p.joint) continue
      const tx = p.tip[0] * z + x, ty = p.tip[1] * z + y
      g.strokeStyle = p === active ? 'rgba(255,180,90,0.9)' : 'rgba(255,180,90,0.35)'
      g.lineWidth = 1.5
      g.setLineDash([5, 4])
      g.beginPath()
      g.moveTo(p.joint[0] * z + x, p.joint[1] * z + y)
      g.lineTo(tx, ty)
      g.stroke()
      g.setLineDash([])
      g.beginPath()
      g.arc(tx, ty, 5, 0, 7)
      g.stroke()
    }

    for (const p of this.app.parts) {
      if (!p.joint) continue
      const px = p.joint[0] * z + x, py = p.joint[1] * z + y
      g.beginPath()
      g.arc(px, py, p === active ? 7 : 5, 0, 7)
      g.fillStyle = p === active ? '#ffe14d' : '#7dffc0'
      g.fill()
      g.strokeStyle = '#0e1116'
      g.lineWidth = 2
      g.stroke()
      if (p === active) {
        g.fillStyle = '#ffe14d'
        g.font = '12px system-ui'
        g.fillText(p.name, px + 10, py - 8)
      }
    }
  }
}
