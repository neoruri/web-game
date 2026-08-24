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
    // 밖에서 화면좌표 <-> 리그좌표를 오갈 수 있게 남긴다 (뼈를 마우스로 잡을 때 필요)
    this.frame = { k, ox, oy }

    // 어니언 스킨 — 앞뒤 포즈를 반투명으로 깔아 변화량을 본다
    if (opts.onion?.length) {
      for (const o of opts.onion) {
        g.globalAlpha = o.alpha ?? 0.22
        this._paint(rig, cuts, order, o.angles, o.root, k, ox, oy, o.tint)
      }
      g.globalAlpha = 1
    }

    // 접지선 — 발이 이 선에 닿는지가 판정 기준이다
    g.fillStyle = 'rgba(255,80,80,0.55)'
    g.fillRect(0, oy, W, 1)

    const pose = this._paint(rig, cuts, order, angles, rootXY, k, ox, oy)
    this.pose = pose
    const byName = new Map(cuts.map((c) => [c.name, c]))

    g.save()
    g.translate(ox, oy)
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
        const sel = b.name === opts.selected
        g.fillStyle = sel ? '#ff5' : byName.has(b.name) ? '#ffee55' : '#ff77dd'
        g.beginPath()
        g.arc(p.x, p.y, sel ? 7.5 : 5, 0, 7)
        g.fill()
        g.strokeStyle = sel ? '#fff' : '#000'
        g.lineWidth = sel ? 2.5 : 1.5
        g.stroke()
      }
      // 잡아 돌리는 손잡이 — 자식 관절(끝 뼈는 뼈 끝)
      for (const h of this.handles(rig, pose, angles)) {
        g.beginPath()
        g.arc(h.x, h.y, 4, 0, 7)
        g.strokeStyle = h.name === opts.selected
          ? 'rgba(255,235,80,0.95)' : 'rgba(255,180,90,0.55)'
        g.lineWidth = 2
        g.stroke()
      }
    }
    g.restore()
  }

  /** 파츠만 그린다. 어니언 스킨과 본 그림이 같은 코드를 쓰게 하려는 것. */
  _paint(rig, cuts, order, angles, rootXY, k, ox, oy, tint) {
    const g = this.g
    const pose = solvePose(rig, angles, { x: rootXY[0] * k, y: rootXY[1] * k }, k)
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
    g.restore()
    return pose
  }

  /**
   * 뼈를 잡아 돌릴 손잡이 위치. 자식이 있으면 자식 관절, 없으면 뼈 끝.
   * 관절 자체를 잡게 하면 부모 관절과 겹쳐서 어느 뼈를 잡았는지 애매해진다.
   */
  handles(rig, pose, angles) {
    const out = []
    for (const b of rig.bones) {
      const p = pose.get(b.name)
      if (!p) continue
      const kid = rig.bones.find((x) => x.parent === b.name)
      if (kid) {
        const kp = pose.get(kid.name)
        if (kp) out.push({ name: b.name, x: kp.x, y: kp.y })
      } else {
        const len = 30 // 끝 뼈는 관절에서 조금 떨어진 곳을 손잡이로 삼는다
        const a = ((angles?.[b.name] ?? b.rest) * Math.PI) / 180
        out.push({ name: b.name, x: p.x + Math.cos(a) * len, y: p.y + Math.sin(a) * len })
      }
    }
    return out
  }

  /** 화면 좌표 -> 이 캔버스의 리그 좌표 */
  toRig(sx, sy) {
    const f = this.frame
    return f ? { x: sx - f.ox, y: sy - f.oy } : { x: sx, y: sy }
  }

  /** 클립 재생용 — 시간 t(프레임 단위)의 포즈를 그린다. */
  drawClip(rig, cuts, order, clip, t, opts) {
    const { angles, root } = sampleClip(rig, clip, t)
    this.draw(rig, cuts, order, angles, root, opts)
  }
}
