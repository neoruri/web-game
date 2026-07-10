import Phaser from 'phaser'
import './style.css'

const W = 800
const H = 600

class GameScene extends Phaser.Scene {
  constructor() {
    super('Game')
  }

  create() {
    this.score = 0
    this.power = 0
    this.charging = false
    this.projectiles = []

    this.scoreText = this.add.text(20, 20, 'Score: 0', {
      fontSize: '28px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
    })

    this.add
      .text(W - 20, 20, 'Hold to draw  ·  Release to fire', {
        fontSize: '16px',
        color: '#a6adc8',
        fontFamily: 'Arial, sans-serif',
      })
      .setOrigin(1, 0)

    this.target = this.add.circle(80, 90, 34, 0xf9e2af)
    this.target.setStrokeStyle(4, 0xf38ba8)
    this.targetInner = this.add.circle(80, 90, 14, 0xf38ba8)

    this.tweens.add({
      targets: [this.target, this.targetInner],
      x: W - 80,
      duration: 2400,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    })

    this.bowX = W / 2
    this.bowY = H - 70
    this.bow = this.add.rectangle(this.bowX, this.bowY, 100, 10, 0xcdd6f4)
    this.arrowRest = this.add.rectangle(
      this.bowX,
      this.bowY - 18,
      6,
      40,
      0xfab387
    )

    this.add.rectangle(W / 2, H - 25, 300, 10, 0x313244)
    this.powerBar = this.add
      .rectangle(W / 2 - 150, H - 25, 300, 10, 0xa6e3a1)
      .setOrigin(0, 0.5)
    this.powerBar.scaleX = 0
    this.add.rectangle(W / 2 - 150 + 75, H - 25, 2, 16, 0xf38ba8)

    this.input.on('pointerdown', () => {
      this.charging = true
    })
    this.input.on('pointerup', () => this.fire())
  }

  fire() {
    if (!this.charging) return
    this.charging = false

    const powerAtRelease = this.power
    const MIN_POWER = 15

    this.power = 0
    this.powerBar.scaleX = 0
    this.arrowRest.y = this.bowY - 18
    this.bow.scaleY = 1

    if (powerAtRelease < MIN_POWER) return
    if (this.projectiles.length > 0) return

    const speed = Phaser.Math.Clamp(300 + powerAtRelease * 12, 300, 1000)
    const arrow = this.add.rectangle(
      this.bowX,
      this.bowY - 18,
      6,
      40,
      0xfab387
    )
    this.projectiles.push({ obj: arrow, speed })
  }

  update(time, delta) {
    if (this.charging) {
      this.power = Math.min(this.power + delta * 0.06, 60)
      this.powerBar.scaleX = this.power / 60
      const pull = (this.power / 60) * 14
      this.arrowRest.y = this.bowY - 18 + pull
      this.bow.scaleY = 1 + (this.power / 60) * 0.5
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]
      p.obj.y -= (p.speed * delta) / 1000

      const dx = p.obj.x - this.target.x
      const dy = p.obj.y - this.target.y
      if (dx * dx + dy * dy < 40 * 40) {
        this.score++
        this.scoreText.setText('Score: ' + this.score)
        this.tweens.add({
          targets: [this.target, this.targetInner],
          scale: 1.4,
          duration: 100,
          yoyo: true,
        })
        p.obj.destroy()
        this.projectiles.splice(i, 1)
        continue
      }

      if (p.obj.y < -30) {
        p.obj.destroy()
        this.projectiles.splice(i, 1)
      }
    }
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

new Phaser.Game(config)
