/**
 * 잘라낸 파츠를 2D 캔버스에 뼈대로 그린다.
 *
 * 게임(Phaser)이 아니라 편집기 안에서 바로 확인하려는 것이다.
 * 계산은 rig-core.js 를 쓴다 — 게임과 **같은 코드**여야 "도구에서는 맞는데
 * 게임에서는 틀린" 상황이 안 생긴다. 여기는 그리기만 한다.
 */
import { sampleClip, solvePose } from '../rig-core.js'

export class Poser {
  constructor(canvas) {
    this.c = canvas
    this.g = canvas.getContext('2d')
    this.showBones = false
    this.scale = 1
  }

  /**
   * @param {object} rig    { unit, bones, rootOffset }
   * @param {Array} cuts    cutter.cut() 결과 (canvas, pivot, size 포함)
   * @param {Array} order   뒤 -> 앞 이름 순서
   * @param {object} angles { 뼈이름: 월드각(도) }
   * @param {[number,number]} rootXY  루트 오프셋 (def 단위)
   */
  draw(rig, cuts, order, angles, rootXY, opts = {}) {
    const g = this.g
    const { width: W, height: H } = this.c
    g.clearRect(0, 0, W, H)
    g.fillStyle = opts.bg ?? '#181c22'
    g.fillRect(0, 0, W, H)
    if (!rig || !cuts.length) return

    const k = (opts.height ?? H * 0.8) / rig.unit
    const ox = W / 2
    const oy = opts.groundY ?? H * 0.9

    // 접지선 — 발이 이 선에 닿는지가 판정 기준이다
    g.fillStyle = 'rgba(255,80,80,0.55)'
    g.fillRect(0, oy, W, 1)

    const pose = solvePose(rig, angles,
      { x: rootXY[0] * k, y: rootXY[1] * k }, k)
    const byName = new Map(cuts.map((c) => [c.name, c]))

    g.save()
    g.translate(ox, oy)
    for (const name of order) {
      const cut = byName.get(name)
      const p = pose.get(name)
      if (!cut || !p || cut.empty) continue
      g.save()
      g.translate(p.x, p.y)
      g.rotate(p.rot)
      g.scale(k, k)
      g.drawImage(cut.canvas,
        -cut.pivot[0] * cut.size[0], -cut.pivot[1] * cut.size[1])
      g.restore()
    }

    if (this.showBones) {
      // 그림 없는 뼈(변환만 담당)도 여기엔 있으므로 파츠가 아니라 pose 를 본다
      g.lineWidth = 2
      for (const b of rig.bones) {
        const p = pose.get(b.name)
        const pp = b.parent && pose.get(b.parent)
        if (pp) {
          g.strokeStyle = 'rgba(90,210,255,0.85)'
          g.beginPath()
          g.moveTo(pp.x, pp.y)
          g.lineTo(p.x, p.y)
          g.stroke()
        }
      }
      for (const b of rig.bones) {
        const p = pose.get(b.name)
        g.fillStyle = byName.has(b.name) ? '#ffee55' : '#ff77dd' // 분홍 = 그림 없는 뼈
        g.beginPath()
        g.arc(p.x, p.y, 5, 0, 7)
        g.fill()
        g.strokeStyle = '#000'
        g.lineWidth = 1.5
        g.stroke()
      }
    }
    g.restore()
  }

  /** 클립 재생용 — 시간 t(프레임 단위)의 포즈를 그린다. */
  drawClip(rig, cuts, order, clip, t, opts) {
    const { angles, root } = sampleClip(rig, clip, t)
    this.draw(rig, cuts, order, angles, root, opts)
  }
}
