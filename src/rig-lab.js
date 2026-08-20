/**
 * 뼈대 애니메이션 랩 (/rig.html).
 *
 * 목적은 하나다 — **그림을 만들기 전에 움직임을 확정한다.**
 * 이 프로젝트는 계속 그림부터 만들고 나중에 움직임이 틀린 걸 발견했다
 * (보폭 0.83 문제, f5 불일치). 순서를 뒤집는 것이 이 페이지의 존재 이유다.
 *
 * 비교용으로 기존 스프라이트시트 달리기를 나란히 재생한다.
 * "새 방식이 나은가"는 눈으로 나란히 놓고 봐야 판정된다.
 */
import Phaser from 'phaser'
import { RIG } from './rig-clips.js'
import { Rig } from './rig.js'

const W = 1040
const H = 420
const GROUND_Y = 300

class RigLab extends Phaser.Scene {
  preload() {
    this.load.spritesheet(
      'archer',
      '/sprites/dungeon/deliverables/player_spritesheet.png',
      { frameWidth: 96, frameHeight: 116 }
    )
  }

  create() {
    this.add.rectangle(0, 0, W, H, 0x1a1e24).setOrigin(0)
    // 접지선. 발이 이 선을 뚫거나 뜨는지가 판정 기준이다
    this.add.rectangle(0, GROUND_Y, W, 1, 0x3d4753).setOrigin(0)
    this.add.text(12, GROUND_Y + 6, '접지선', { fontSize: '11px', color: '#55606d' })

    // bob 은 0 이 기본이다. 골반 흔들림은 클립에 구워져 있고(IK 가 접지 유지),
    // 여기서 더 주면 root 가 통째로 올라가 발이 뜬다
    this.rig = new Rig(this, RIG, { x: 330, y: GROUND_Y, scale: 180, bob: 0 })
    this.jointGfx = this.add.graphics()
    this.trailGfx = this.add.graphics()
    this.trail = []
    this.showJoints = true
    this.showTrail = false

    this.add.text(330 - 60, 40, '뼈대 (새 방식)', { fontSize: '12px', color: '#7fd6a5' })

    // ── 비교군: 기존 스프라이트시트 ──
    // main.js 의 run 정의와 같은 값 (row 1, 6프레임 중 0/1/3/5, 6fps)
    this.anims.create({
      key: 'oldrun',
      frames: this.anims.generateFrameNumbers('archer', { frames: [8, 9, 11, 13] }),
      frameRate: 6,
      repeat: -1,
    })
    this.old = this.add.sprite(760, GROUND_Y, 'archer', 8)
    this.old.setOrigin(0.5, 0.8).setScale(1.8)
    this.old.play('oldrun')
    this.add.text(700, 40, '스프라이트시트 (기존)', { fontSize: '12px', color: '#93a0b0' })

    this.frameLabel = this.add.text(12, 12, '', { fontSize: '12px', color: '#93a0b0' })
    this._wireUI()
    window.__lab = this // 콘솔·자동 캡처에서 포즈를 직접 잡기 위한 훅
  }

  update(_t, dt) {
    if (this._playing) this.rig.update(dt)
    this._draw()
  }

  _draw() {
    const f = this.rig.clip.frames
    const i = Math.floor(this.rig.time) % f.length
    this.frameLabel.setText(
      `프레임 ${i + 1}/${f.length}  ·  ${f[i].phase.toUpperCase()}`
    )

    this.jointGfx.clear()
    if (this.showJoints) {
      this.jointGfx.fillStyle(0xffee66, 1)
      for (const [, p] of this.rig.parts) {
        this.jointGfx.fillCircle(this.rig.root.x + p.x, this.rig.root.y + p.y, 3)
      }
    }

    // 발끝 궤적 — 접지 구간이 직선으로 뒤로 흐르면 안 미끄러지는 것이다
    this.trailGfx.clear()
    if (this.showTrail) {
      const shin = this.rig.parts.get('legN_shin')
      const b = this.rig.bones.get('legN_shin')
      const tip = {
        x: this.rig.root.x + shin.x + Math.cos(shin.rotation) * b.length * this.rig.scale,
        y: this.rig.root.y + shin.y + Math.sin(shin.rotation) * b.length * this.rig.scale,
      }
      this.trail.push(tip)
      if (this.trail.length > 90) this.trail.shift()
      this.trailGfx.fillStyle(0xee8844, 0.8)
      for (const p of this.trail) this.trailGfx.fillCircle(p.x, p.y, 1.5)
    } else if (this.trail.length) {
      this.trail.length = 0
    }
  }

  _wireUI() {
    this._playing = true
    const $ = (id) => document.getElementById(id)

    $('playBtn').onclick = (e) => {
      this._playing = !this._playing
      e.target.textContent = this._playing ? '⏸ 정지' : '▶ 재생'
    }
    const step = (d) => {
      this._playing = false
      $('playBtn').textContent = '▶ 재생'
      const n = this.rig.clip.frames.length
      this.rig.time = (Math.round(this.rig.time) + d + n) % n
      this.rig.apply()
    }
    $('prevBtn').onclick = () => step(-1)
    $('nextBtn').onclick = () => step(1)
    $('joints').onchange = (e) => { this.showJoints = e.target.checked }
    $('trail').onchange = (e) => { this.showTrail = e.target.checked }

    const bind = (id, fn) => {
      const el = $(id)
      const out = $(id + 'V')
      el.oninput = () => { out.textContent = el.value; fn(parseFloat(el.value)) }
    }
    bind('fps', (v) => { this.rig.clip.fps = v })
    bind('bob', (v) => { this.rig.bob = v })
    bind('scale', (v) => {
      // 막대기 길이가 scale 에 묶여 있어 통째로 다시 만드는 게 확실하다
      const t = this.rig.time
      this.rig.destroy()
      this.rig = new Rig(this, RIG, {
        x: 330, y: GROUND_Y, scale: v, bob: parseFloat($('bob').value),
      })
      this.rig.clip.fps = parseFloat($('fps').value)
      this.rig.time = t
      this.trail.length = 0
    })
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: W,
  height: H,
  parent: 'game',
  backgroundColor: '#1a1e24',
  pixelArt: true,
  scene: RigLab,
})
