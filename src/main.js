import Phaser from 'phaser'
import './style.css'

const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: '#1e1e2e',
  parent: 'app',
  scene: {
    create: function () {
      this.add
        .text(400, 240, 'Hello Phaser Game', {
          fontSize: '48px',
          color: '#ffffff',
          fontFamily: 'Arial, sans-serif',
        })
        .setOrigin(0.5)

      this.add
        .text(400, 300, 'Environment ready', {
          fontSize: '24px',
          color: '#a6e3a1',
          fontFamily: 'Arial, sans-serif',
        })
        .setOrigin(0.5)

      const ball = this.add.circle(400, 420, 28, 0xf38ba8)
      this.tweens.add({
        targets: ball,
        y: 480,
        duration: 500,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      })
    },
  },
}

new Phaser.Game(config)
