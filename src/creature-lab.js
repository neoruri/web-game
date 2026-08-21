/**
 * 크리처 뼈대 랩 (/creature.html).
 *
 * 사람 랩(/rig.html)이 "포즈를 0부터 만드는" 쪽이라면 여기는 반대다.
 * 그림이 이미 완성된 포즈이므로 그걸 rest 로 삼고, 애니메이션은 rest 에서의 오프셋만 준다.
 * 그래서 'rest' 버튼을 누르면 원본 그림과 픽셀 단위로 같아진다 — 이게 검증 기준이다.
 */
import Phaser from 'phaser'
import { CREATURE } from './rig-creature.js'
import { Rig } from './rig.js'

const W = 1040
const H = 560
const GROUND_Y = 500
const BASE = '/sprites/creatures/m3/'

class CreatureLab extends Phaser.Scene {
  preload() {
    for (const p of CREATURE.parts) this.load.image('m3_' + p.name, BASE + p.file)
    this.load.image('m3_orig', '/sprites/creatures/m3/_original.png')
  }

  create() {
    this.add.rectangle(0, 0, W, H, 0x1a1e24).setOrigin(0)
    this.add.rectangle(0, GROUND_Y, W, 1, 0x3d4753).setOrigin(0)

    this.scaleVal = 380
    this._build()

    this.gfx = this.add.graphics()
    this.showBones = false
    this.speed = 1
    this.label = this.add.text(12, 12, '', { fontSize: '12px', color: '#93a0b0' })
    this._wireUI()
    window.__clab = this // 자동 캡처용 훅
  }

  _build() {
    if (this.rig) this.rig.destroy()
    if (this.ghost) this.ghost.destroy()

    // 원본을 반투명으로 겹쳐 놓고 rest 가 정확한지 눈으로 대조한다.
    // 원점을 접지점(570,1175)에 맞춰야 rig 와 같은 자리에 놓인다
    const k = this.scaleVal / CREATURE.unit
    this.ghost = this.add.image(W / 2, GROUND_Y, 'm3_orig')
      .setOrigin(570 / 1254, 1175 / 1254)
      .setScale(k)
      .setAlpha(0)
      .setTint(0x66ccff)

    const textures = {}
    for (const p of CREATURE.parts) textures[p.name] = 'm3_' + p.name
    this.rig = new Rig(this, CREATURE, {
      x: W / 2, y: GROUND_Y, scale: this.scaleVal, textures,
    })
  }

  update(_t, dt) {
    if (this._mode !== 'rest') this.rig.update(dt * this.speed)
    const c = this.rig.clip
    const i = Math.floor(this.rig.time) % c.frames.length
    this.label.setText(`${this.rig.clipName}  ${i + 1}/${c.frames.length}`)

    this.gfx.clear()
    if (!this.showBones) return
    const R = this.rig
    for (const b of CREATURE.bones) {
      const p = R.parts.get(b.name)
      if (!p) continue
      this.gfx.fillStyle(0xffee66, 1)
      this.gfx.fillCircle(R.root.x + p.x, R.root.y + p.y, 5)
      const parent = CREATURE.bones.find((q) => q.name === b.parent)
      if (parent) {
        const pp = R.parts.get(parent.name)
        this.gfx.lineStyle(2, 0x66ddff, 0.8)
        this.gfx.lineBetween(R.root.x + pp.x, R.root.y + pp.y,
                             R.root.x + p.x, R.root.y + p.y)
      }
    }
  }

  _wireUI() {
    const $ = (id) => document.getElementById(id)
    const btns = {
      idle: $('idleBtn'), walk: $('walkBtn'),
      cast: $('castBtn'), rest: $('restBtn'),
    }
    const setMode = (m) => {
      this._mode = m
      for (const k in btns) btns[k].classList.toggle('on', k === m)
      if (m === 'rest') {
        // rest = 오프셋 0. 클립을 멈추고 뼈의 rest 각도를 그대로 넣는다
        this.rig.playing = false
        for (const b of CREATURE.bones) {
          const part = this.rig.parts.get(b.name)
          if (part) part.rotation = 0
        }
        this._applyRest()
      } else {
        this.rig.play(m)
      }
    }
    btns.idle.onclick = () => setMode('idle')
    btns.walk.onclick = () => setMode('walk')
    btns.cast.onclick = () => setMode('cast')
    btns.rest.onclick = () => setMode('rest')
    setMode('idle')

    $('bones').onchange = (e) => { this.showBones = e.target.checked }
    $('ghost').onchange = (e) => { this.ghost.setAlpha(e.target.checked ? 0.45 : 0) }

    const bind = (id, fn) => {
      const el = $(id), out = $(id + 'V')
      el.oninput = () => { out.textContent = el.value; fn(parseFloat(el.value)) }
    }
    bind('speed', (v) => { this.speed = v })
    bind('scale', (v) => {
      this.scaleVal = v
      const mode = this._mode
      const ghostOn = $('ghost').checked
      this._build()
      this.ghost.setAlpha(ghostOn ? 0.45 : 0)
      setMode(mode)
    })
  }

  /** 클립 없이 rest 포즈 그대로 배치한다. 원본과 같아야 한다. */
  _applyRest() {
    const R = this.rig
    const frame = { root: R.clip.frames[0].root, angles: {} }
    for (const b of CREATURE.bones) frame.angles[b.name] = b.rest
    const saved = R.clip
    R.clip = { fps: 1, loop: false, frames: [frame] }
    R.time = 0
    R.apply()
    R.clip = saved
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: W,
  height: H,
  parent: 'game',
  backgroundColor: '#1a1e24',
  scene: CreatureLab,
})
