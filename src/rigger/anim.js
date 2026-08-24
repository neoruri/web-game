/**
 * 동작 모드 — 포즈를 잡고 키프레임을 찍고 재생한다. + 실시간 동작 진단.
 *
 * 진단을 편집기 안에 넣은 이유:
 *   걷기를 만들 때 "발이 35px 떠 있다", "무릎 굽힘이 82° 를 오간다", "다리가 97%
 *   뻗어서 IK 가 한계에 걸린다" 를 전부 **눈으로는 놓쳤다.** 수치를 뽑아보고서야
 *   알았고, 그때마다 Python 수정 → 재생성 → 캡처 → 확인을 왕복했다.
 *   만들면서 옆에 계속 떠 있으면 애초에 그 상태가 안 만들어진다.
 */
import { analyse, drawTrails } from './animdiag.js'
import {
  bake, guessPairs, mirrorAngles, newClip, removeKey, rotateBone, samplePose, setKey,
} from './timeline.js'
import { restAngles } from './rigdef.js'

const $ = (id) => document.getElementById(id)

export class Anim {
  constructor(app, poser) {
    this.app = app
    this.poser = poser        // 큰 무대용 Poser
    this.clips = { idle: newClip('idle', { fps: 12, length: 12 }) }
    this.clipName = 'idle'
    this.t = 0
    this.playing = false
    this.pose = null          // { angles, root } — 지금 편집 중인 포즈
    this.selected = null
    this.groundBones = []
    this.drag = null
    this._bindStage()
    this._bindUI()
  }

  get clip() { return this.clips[this.clipName] }

  /**
   * 리그가 새로 만들어졌을 때(파츠를 고쳤을 때) 상태를 맞춘다.
   *
   * ⚠️ 여기가 까다롭다. 폴리곤을 고치면 관절 위치가 달라져 **rest 각도가 바뀐다.**
   * 그런데 포즈와 키프레임은 rig.js 형식에 맞춰 **월드 각도**로 저장돼 있다.
   * 그대로 두면 rest 만 움직여서 캐릭터가 통째로 기울어버린다 — 실제로 그랬다.
   * 사용자가 만든 건 "rest 에서 몇 도"이므로, rest 가 Δ 만큼 변하면 저장값도 Δ 를 더한다.
   */
  sync() {
    const rig = this.app.rig
    if (!rig) return
    if (!this.pose) { this.reset(); this._fillClipSel(); this._fillGroundSel(); return }

    const shift = {}
    for (const b of rig.bones) {
      const old = this.rest?.[b.name]
      if (old != null && Math.abs(old - b.rest) > 1e-6) shift[b.name] = b.rest - old
      if (!(b.name in this.pose.angles)) this.pose.angles[b.name] = b.rest
    }
    const dRoot = this.rootRef
      ? [rig.rootOffset[0] - this.rootRef[0], rig.rootOffset[1] - this.rootRef[1]]
      : [0, 0]

    const apply = (angles, root) => {
      for (const n in shift) if (n in angles) angles[n] += shift[n]
      root[0] += dRoot[0]
      root[1] += dRoot[1]
    }
    apply(this.pose.angles, this.pose.root)
    for (const c of Object.values(this.clips)) {
      for (const k of c.keys) apply(k.angles, k.root)
    }

    this._snapshot()
    this._fillClipSel()
    this._fillGroundSel()
  }

  /** 지금 리그의 rest 를 기억해 둔다. 다음 sync 에서 변화량을 재려면 필요하다. */
  _snapshot() {
    const rig = this.app.rig
    this.rest = Object.fromEntries(rig.bones.map((b) => [b.name, b.rest]))
    this.rootRef = [...rig.rootOffset]
  }

  reset() {
    const rig = this.app.rig
    if (!rig) return
    this.pose = { angles: restAngles(rig), root: [...rig.rootOffset] }
    this._snapshot()
    this.render()
  }

  // ── 무대: 뼈를 잡아 돌린다 ────────────────────────────────────────
  _bindStage() {
    const c = $('stage')
    const at = (e) => {
      const r = c.getBoundingClientRect()
      return this.poser.toRig((e.clientX - r.left) * (c.width / r.width),
                              (e.clientY - r.top) * (c.height / r.height))
    }
    c.addEventListener('pointerdown', (e) => {
      const rig = this.app.rig
      if (!rig || !this.pose) return
      c.setPointerCapture(e.pointerId)
      const p = at(e)
      const pose = this.poser.pose
      // 뿌리 관절을 잡으면 위치를 옮긴다 (상하 흔들림 만들 때 쓴다)
      const rootBone = rig.bones.find((b) => !b.parent)
      const rp = pose?.get(rootBone?.name)
      if (rp && Math.hypot(rp.x - p.x, rp.y - p.y) < 11) {
        this.drag = { type: 'root', px: p.x, py: p.y, r0: [...this.pose.root] }
        c.classList.add('grabbing')
        return
      }
      // 손잡이(자식 관절) 중 가장 가까운 것
      let best = null
      for (const h of this.poser.handles(rig, pose, this.pose.angles)) {
        const d = Math.hypot(h.x - p.x, h.y - p.y)
        if (d < 16 && (!best || d < best.d)) best = { ...h, d }
      }
      if (!best) return
      const jp = pose.get(best.name)
      this.selected = best.name
      this.drag = {
        type: 'bone', name: best.name, jx: jp.x, jy: jp.y,
        a0: Math.atan2(p.y - jp.y, p.x - jp.x) * 180 / Math.PI,
        base: { ...this.pose.angles },
      }
      c.classList.add('grabbing')
      this.render()
    })
    c.addEventListener('pointermove', (e) => {
      if (!this.drag) return
      const p = at(e)
      if (this.drag.type === 'root') {
        const k = this.poser.frame.k
        this.pose.root = [this.drag.r0[0] + (p.x - this.drag.px) / k,
                          this.drag.r0[1] + (p.y - this.drag.py) / k]
      } else {
        const a = Math.atan2(p.y - this.drag.jy, p.x - this.drag.jx) * 180 / Math.PI
        this.pose.angles = { ...this.drag.base }
        rotateBone(this.app.rig, this.pose.angles, this.drag.name, a - this.drag.a0)
      }
      this.playing = false
      this.render()
    })
    const end = () => { this.drag = null; c.classList.remove('grabbing'); this.diagnose() }
    c.addEventListener('pointerup', end)
    c.addEventListener('pointercancel', end)

    $('track').addEventListener('pointerdown', (e) => {
      const r = e.target.getBoundingClientRect()
      const u = (e.clientX - r.left) / r.width
      this.seek(Math.round(u * this.clip.length))
    })
  }

  // ── UI ────────────────────────────────────────────────────────────
  _bindUI() {
    $('playBtn').onclick = () => {
      this.playing = !this.playing
      $('playBtn').textContent = this.playing ? '⏸ 정지' : '▶ 재생'
    }
    $('keyBtn').onclick = () => {
      setKey(this.clip, this.t, this.pose.angles, this.pose.root)
      this.diagnose()
      this.render()
    }
    $('keyDel').onclick = () => { removeKey(this.clip, this.t); this.diagnose(); this.render() }
    $('resetBtn').onclick = () => this.reset()
    $('mirrorBtn').onclick = () => {
      const pairs = guessPairs(this.app.rig)
      if (!pairs.length) { alert('좌우 짝을 못 찾았습니다. 이름을 xxxL / xxxR 로 맞춰주세요.'); return }
      this.pose.angles = mirrorAngles(this.app.rig, this.pose.angles, pairs)
      this.render()
    }
    $('clipNew').onclick = () => {
      const n = prompt('클립 이름', 'walk')
      if (!n) return
      this.clips[n] = newClip(n, { fps: 12, length: 12 })
      this.clipName = n
      this._fillClipSel()
      this.render()
    }
    $('clipDel').onclick = () => {
      if (Object.keys(this.clips).length <= 1) return
      delete this.clips[this.clipName]
      this.clipName = Object.keys(this.clips)[0]
      this._fillClipSel()
      this.render()
    }
    $('clipSel').onchange = (e) => { this.clipName = e.target.value; this.seek(0); this._syncClipInputs() }
    $('clipLen').onchange = (e) => { this.clip.length = Math.max(2, +e.target.value); this.diagnose(); this.render() }
    $('clipFps').onchange = (e) => { this.clip.fps = Math.max(1, +e.target.value) }
    $('clipLoop').onchange = (e) => { this.clip.loop = e.target.checked; this.diagnose() }
    $('onion').onchange = () => this.render()
    $('animBones').onchange = () => this.render()
    $('groundSel').onchange = (e) => {
      this.groundBones = [...e.target.selectedOptions].map((o) => o.value)
      this.diagnose()
    }
  }

  _fillClipSel() {
    $('clipSel').innerHTML = Object.keys(this.clips)
      .map((n) => `<option value="${n}" ${n === this.clipName ? 'selected' : ''}>${n}</option>`).join('')
    this._syncClipInputs()
  }

  _syncClipInputs() {
    $('clipLen').value = this.clip.length
    $('clipFps').value = this.clip.fps
    $('clipLoop').checked = this.clip.loop
  }

  _fillGroundSel() {
    const rig = this.app.rig
    if (!rig) return
    const sel = $('groundSel')
    sel.innerHTML = rig.bones.map((b) =>
      `<option value="${b.name}" ${this.groundBones.includes(b.name) ? 'selected' : ''}>${b.name}</option>`).join('')
  }

  seek(t) {
    this.t = ((Math.round(t) % this.clip.length) + this.clip.length) % this.clip.length
    const p = samplePose(this.clip, this.t, this.pose)
    if (p) this.pose = { angles: { ...p.angles }, root: [...p.root] }
    this.render()
  }

  tick(dt) {
    if (!this.playing || !this.clip.keys.length) return
    this.t = (this.t + (dt / 1000) * this.clip.fps) % this.clip.length
    const p = samplePose(this.clip, this.t, this.pose)
    if (p) this.pose = { angles: { ...p.angles }, root: [...p.root] }
    this.render()
  }

  // ── 그리기 ────────────────────────────────────────────────────────
  render() {
    const { rig, cuts, parts } = this.app
    if (!rig || !this.pose) return
    this.poser.showBones = $('animBones').checked
    const order = parts.map((p) => p.name)

    // 어니언 스킨 — 앞뒤 키를 반투명으로 깔아 변화량을 본다
    const onion = []
    if ($('onion').checked && this.clip.keys.length) {
      for (const d of [-1, 1]) {
        const p = samplePose(this.clip, this.t + d * 2, null)
        if (p) onion.push({ angles: p.angles, root: p.root, alpha: 0.18 })
      }
    }
    this.poser.draw(rig, cuts, order, this.pose.angles, this.pose.root, {
      height: 430, groundY: 500, onion, selected: this.selected,
    })
    this._drawTrack()
    $('tPos').textContent = `${this.t.toFixed(1)} / ${this.clip.length}`
  }

  _drawTrack() {
    const c = $('track')
    const g = c.getContext('2d')
    const { width: W, height: H } = c
    g.fillStyle = '#12161c'
    g.fillRect(0, 0, W, H)
    const L = this.clip.length
    const step = W / L
    for (let i = 0; i <= L; i++) {
      g.fillStyle = i % 5 === 0 ? '#39434f' : '#232b34'
      g.fillRect(i * step, H * 0.35, 1, H * 0.3)
      if (i % 5 === 0 && i < L) {
        g.fillStyle = '#5a6472'
        g.font = '10px system-ui'
        g.fillText(String(i), i * step + 3, 12)
      }
    }
    for (const k of this.clip.keys) {
      const x = k.t * step + step / 2
      g.fillStyle = '#7fd6a5'
      g.beginPath()
      g.moveTo(x, H * 0.3); g.lineTo(x + 6, H * 0.5)
      g.lineTo(x, H * 0.7); g.lineTo(x - 6, H * 0.5)
      g.closePath(); g.fill()
    }
    const px = this.t * step + step / 2
    g.strokeStyle = '#ffd24d'
    g.lineWidth = 2
    g.beginPath(); g.moveTo(px, 0); g.lineTo(px, H); g.stroke()
  }

  // ── 진단 ──────────────────────────────────────────────────────────
  /** 무릎처럼 굽는 3마디 사슬을 자동으로 찾는다 (허벅지-정강이-발). */
  _chains() {
    const rig = this.app.rig
    const out = []
    for (const up of rig.bones) {
      const lo = rig.bones.find((b) => b.parent === up.name)
      if (!lo) continue
      const end = rig.bones.find((b) => b.parent === lo.name)
      if (!end) continue
      if (!this.groundBones.includes(end.name)) continue // 접지 사슬만 본다
      out.push({ name: up.name, upper: up.name, lower: lo.name, end: end.name })
    }
    return out
  }

  diagnose() {
    const rig = this.app.rig
    if (!rig || !this.clip.keys.length) {
      $('motion').innerHTML = '<div class="row">키프레임을 2개 이상 찍으면 검사합니다</div>'
      drawTrails($('trail').getContext('2d'), new Map(), 330, 190)
      return
    }
    const { trails, report } = analyse(
      rig, (t) => samplePose(this.clip, t, this.pose), this.clip,
      this.groundBones, this._chains())

    const rows = report.map((r) => {
      if (r.kind === 'ground') {
        return `<div class="row"><span class="tag">${r.name} 접지</span>` +
          `<span class="${r.ok ? 'ok' : 'no'}">${r.ok ? '미끄러짐 없음'
            : r.contactFrames < 2 ? '땅에 안 닿음' : `되돌아감 ${r.slide}회`}</span></div>`
      }
      if (r.kind === 'flex') {
        return `<div class="row"><span class="tag">${r.name} 굽힘</span>` +
          `<span class="${r.ok ? 'ok' : 'no'}">${r.min.toFixed(0)}~${r.max.toFixed(0)}° ` +
          `(${r.range.toFixed(0)}°)${r.ok ? '' : ' 고무처럼 보임'}</span></div>`
      }
      return `<div class="row"><span class="tag">${r.name} 뻗음</span>` +
        `<span class="${r.ok ? 'ok' : 'no'}">${r.max.toFixed(2)}${r.ok ? '' : ' 한계 — 막대기가 됨'}</span></div>`
    })
    $('motion').innerHTML = rows.join('') || '<div class="row">접지 뼈를 골라주세요</div>'
    $('motionSum').textContent = `${report.filter((r) => !r.ok).length}건 주의`
    drawTrails($('trail').getContext('2d'), trails, 330, 190)
  }

  /** 내보내기용 — 매 프레임으로 구운 클립들 */
  baked() {
    const out = {}
    for (const [n, c] of Object.entries(this.clips)) {
      if (!c.keys.length) continue
      out[n] = bake(c, this.pose)
    }
    return out
  }
}
