import Phaser from 'phaser'
import './style.css'

const W = 800
const H = 600

const PLAYER_R = 14
const PLAYER_SPEED = 220
const MAX_HP = 100

const ENEMY_R = 11
const ENEMY_SPEED = 62
const CONTACT_DPS = 30

const ARROW_SPEED = 520
const ARROW_R = 5
const FIRE_COOLDOWN = 0.45
const RANGE = 340

const BASE_SPAWN_INTERVAL = 1.1
const RAMP_PER_MINUTE = 1.5
const STICK_RADIUS = 60

class GameScene extends Phaser.Scene {
  constructor() {
    super('Game')
  }

  create() {
    this.elapsed = 0
    this.kills = 0
    this.hp = MAX_HP
    this.gameOver = false
    this.spawnAcc = 0
    this.fireAcc = 0
    this.enemies = []
    this.arrows = []

    this.player = this.add.circle(W / 2, H / 2, PLAYER_R, 0x89b4fa)
    this.player.setStrokeStyle(3, 0xcdd6f4)

    this.hpBarBg = this.add.rectangle(20, 24, 220, 14, 0x313244).setOrigin(0, 0.5)
    this.hpBar = this.add
      .rectangle(20, 24, 220, 14, 0xa6e3a1)
      .setOrigin(0, 0.5)

    this.timeText = this.add
      .text(W / 2, 16, '0:00', {
        fontSize: '30px',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
      })
      .setOrigin(0.5, 0)

    this.killText = this.add
      .text(W - 20, 16, 'Kills: 0', {
        fontSize: '20px',
        color: '#cdd6f4',
        fontFamily: 'Arial, sans-serif',
      })
      .setOrigin(1, 0)

    this.waveText = this.add
      .text(W - 20, 44, 'Spawn x1.0', {
        fontSize: '16px',
        color: '#a6adc8',
        fontFamily: 'Arial, sans-serif',
      })
      .setOrigin(1, 0)

    this.setupInput()
  }

  setupInput() {
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT')

    this.stick = { active: false, ox: 0, oy: 0, x: 0, y: 0 }
    this.stickBase = this.add
      .circle(0, 0, STICK_RADIUS, 0xcdd6f4, 0.12)
      .setVisible(false)
      .setDepth(10)
    this.stickThumb = this.add
      .circle(0, 0, 24, 0xcdd6f4, 0.35)
      .setVisible(false)
      .setDepth(10)

    this.input.on('pointerdown', (p) => {
      if (this.gameOver) {
        this.scene.restart()
        return
      }
      this.stick.active = true
      this.stick.ox = p.x
      this.stick.oy = p.y
      this.stick.x = 0
      this.stick.y = 0
      this.stickBase.setPosition(p.x, p.y).setVisible(true)
      this.stickThumb.setPosition(p.x, p.y).setVisible(true)
    })

    this.input.on('pointermove', (p) => {
      if (!this.stick.active) return
      let dx = p.x - this.stick.ox
      let dy = p.y - this.stick.oy
      const len = Math.hypot(dx, dy)
      if (len > STICK_RADIUS) {
        dx = (dx / len) * STICK_RADIUS
        dy = (dy / len) * STICK_RADIUS
      }
      this.stick.x = dx / STICK_RADIUS
      this.stick.y = dy / STICK_RADIUS
      this.stickThumb.setPosition(this.stick.ox + dx, this.stick.oy + dy)
    })

    this.input.on('pointerup', () => {
      this.stick.active = false
      this.stick.x = 0
      this.stick.y = 0
      this.stickBase.setVisible(false)
      this.stickThumb.setVisible(false)
    })

    this.input.keyboard.on('keydown-SPACE', () => {
      if (this.gameOver) this.scene.restart()
    })
  }

  get spawnMultiplier() {
    return Math.pow(RAMP_PER_MINUTE, Math.floor(this.elapsed / 60))
  }

  spawnEnemy() {
    const edge = Phaser.Math.Between(0, 3)
    const m = 40
    let x, y
    if (edge === 0) {
      x = Phaser.Math.Between(-m, W + m)
      y = -m
    } else if (edge === 1) {
      x = W + m
      y = Phaser.Math.Between(-m, H + m)
    } else if (edge === 2) {
      x = Phaser.Math.Between(-m, W + m)
      y = H + m
    } else {
      x = -m
      y = Phaser.Math.Between(-m, H + m)
    }

    const box = this.add.rectangle(x, y, ENEMY_R * 2, ENEMY_R * 2, 0xf38ba8)
    this.enemies.push({ obj: box })
  }

  nearestEnemy() {
    let best = null
    let bestDist = RANGE * RANGE
    for (const e of this.enemies) {
      const dx = e.obj.x - this.player.x
      const dy = e.obj.y - this.player.y
      const d = dx * dx + dy * dy
      if (d < bestDist) {
        bestDist = d
        best = e
      }
    }
    return best
  }

  fireAt(enemy) {
    const angle = Math.atan2(
      enemy.obj.y - this.player.y,
      enemy.obj.x - this.player.x
    )
    const shaft = this.add.rectangle(
      this.player.x,
      this.player.y,
      4,
      20,
      0xfab387
    )
    shaft.rotation = angle + Math.PI / 2
    this.arrows.push({
      obj: shaft,
      vx: Math.cos(angle) * ARROW_SPEED,
      vy: Math.sin(angle) * ARROW_SPEED,
    })
  }

  moveInput() {
    let vx = 0
    let vy = 0
    const k = this.keys
    if (k.A.isDown || k.LEFT.isDown) vx -= 1
    if (k.D.isDown || k.RIGHT.isDown) vx += 1
    if (k.W.isDown || k.UP.isDown) vy -= 1
    if (k.S.isDown || k.DOWN.isDown) vy += 1

    if (vx === 0 && vy === 0 && this.stick.active) {
      vx = this.stick.x
      vy = this.stick.y
    }

    const len = Math.hypot(vx, vy)
    if (len > 1) {
      vx /= len
      vy /= len
    }
    return { vx, vy }
  }

  hitPlayer(amount) {
    this.hp = Math.max(0, this.hp - amount)
    this.hpBar.scaleX = this.hp / MAX_HP
    this.hpBar.fillColor = this.hp > 30 ? 0xa6e3a1 : 0xf38ba8
    if (this.hp === 0) this.endGame()
  }

  endGame() {
    this.gameOver = true
    this.player.setVisible(false)
    this.stickBase.setVisible(false)
    this.stickThumb.setVisible(false)

    this.add
      .text(W / 2, H / 2 - 30, 'GAME OVER', {
        fontSize: '56px',
        color: '#f38ba8',
        fontFamily: 'Arial, sans-serif',
      })
      .setOrigin(0.5)
      .setDepth(20)

    this.add
      .text(
        W / 2,
        H / 2 + 30,
        `버틴 시간 ${this.formatTime()}  ·  처치 ${this.kills}`,
        {
          fontSize: '22px',
          color: '#cdd6f4',
          fontFamily: 'Arial, sans-serif',
        }
      )
      .setOrigin(0.5)
      .setDepth(20)

    this.add
      .text(W / 2, H / 2 + 80, '클릭 또는 Space 로 재시작', {
        fontSize: '16px',
        color: '#a6adc8',
        fontFamily: 'Arial, sans-serif',
      })
      .setOrigin(0.5)
      .setDepth(20)
  }

  formatTime() {
    const total = Math.floor(this.elapsed)
    const m = Math.floor(total / 60)
    const s = total % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  update(time, delta) {
    if (this.gameOver) return
    const dt = delta / 1000

    this.elapsed += dt
    this.timeText.setText(this.formatTime())

    const mult = this.spawnMultiplier
    this.waveText.setText(`Spawn x${mult.toFixed(1)}`)

    const interval = BASE_SPAWN_INTERVAL / mult
    this.spawnAcc += dt
    while (this.spawnAcc >= interval) {
      this.spawnAcc -= interval
      this.spawnEnemy()
    }

    const { vx, vy } = this.moveInput()
    this.player.x = Phaser.Math.Clamp(
      this.player.x + vx * PLAYER_SPEED * dt,
      PLAYER_R,
      W - PLAYER_R
    )
    this.player.y = Phaser.Math.Clamp(
      this.player.y + vy * PLAYER_SPEED * dt,
      PLAYER_R,
      H - PLAYER_R
    )

    this.fireAcc += dt
    if (this.fireAcc >= FIRE_COOLDOWN) {
      const target = this.nearestEnemy()
      if (target) {
        this.fireAcc = 0
        this.fireAt(target)
      }
    }

    this.updateArrows(dt)
    this.updateEnemies(dt)
  }

  updateArrows(dt) {
    const hitDist = (ENEMY_R + ARROW_R) * (ENEMY_R + ARROW_R)

    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i]
      a.obj.x += a.vx * dt
      a.obj.y += a.vy * dt

      if (
        a.obj.x < -30 ||
        a.obj.x > W + 30 ||
        a.obj.y < -30 ||
        a.obj.y > H + 30
      ) {
        a.obj.destroy()
        this.arrows.splice(i, 1)
        continue
      }

      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const e = this.enemies[j]
        const dx = a.obj.x - e.obj.x
        const dy = a.obj.y - e.obj.y
        if (dx * dx + dy * dy < hitDist) {
          e.obj.destroy()
          this.enemies.splice(j, 1)
          a.obj.destroy()
          this.arrows.splice(i, 1)
          this.kills++
          this.killText.setText('Kills: ' + this.kills)
          break
        }
      }
    }
  }

  updateEnemies(dt) {
    const touchDist = (PLAYER_R + ENEMY_R) * (PLAYER_R + ENEMY_R)
    let touching = false

    for (const e of this.enemies) {
      const dx = this.player.x - e.obj.x
      const dy = this.player.y - e.obj.y
      const len = Math.hypot(dx, dy) || 1
      e.obj.x += (dx / len) * ENEMY_SPEED * dt
      e.obj.y += (dy / len) * ENEMY_SPEED * dt

      if (dx * dx + dy * dy < touchDist) touching = true
    }

    if (touching) this.hitPlayer(CONTACT_DPS * dt)
  }
}

const config = {
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#1e1e2e',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: W,
    height: H,
  },
  scene: GameScene,
}

const game = new Phaser.Game(config)

if (import.meta.env.DEV) window.__game = game
