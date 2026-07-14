import Phaser from 'phaser'
import './style.css'
import { loadConfig, onConfigChange } from './config.js'
import { UPGRADES, drawCards } from './upgrades.js'
import { Grid } from './grid.js'

const W = 800
const H = 600

const COLOR_BG = 0x1e1e2e
const COLOR_PLAYER = 0x89b4fa
const COLOR_ENEMY = 0xf38ba8
const COLOR_ENEMY_HIT = 0xffffff
const COLOR_ARROW = 0xfab387
const COLOR_GEM = 0x94e2d5

const KNOCKBACK_FRICTION = 8
const FLASH_TIME = 0.06
const MAX_DT = 0.05 // 탭 복귀 시 delta 폭주 방지 (터널링 방지)

// 적/화살/젬은 GameObject 가 아니라 평범한 객체다.
//  - 생성/파괴 비용 없음 (풀에서 재사용)
//  - 렌더는 Graphics 하나에 몰아서 → 수백 개여도 드로우콜 몇 개
class GameScene extends Phaser.Scene {
  constructor() {
    super('Game')
  }

  create() {
    this.cfg = loadConfig()
    this.stats = JSON.parse(JSON.stringify(this.cfg)) // 업그레이드로 변하는 실시간 스탯

    this.elapsed = 0
    this.kills = 0
    this.level = 1
    this.xp = 0
    this.xpNeed = this.xpFor(1)
    this.hp = this.stats.player.maxHp
    this.invulnLeft = 0
    this.spawnAcc = 0
    this.fireAcc = 0
    this.paused = false
    this.gameOver = false
    this.pendingLevels = 0
    this.taken = {} // 업그레이드 id → 획득 횟수

    this.enemies = []
    this.arrows = []
    this.gems = []
    this.enemyPool = []
    this.arrowPool = []
    this.gemPool = []

    this.grid = new Grid(W, H, 48)
    this.queryBuf = [] // query 결과 재사용 (매 프레임 배열 생성 금지)

    this.gfxGems = this.add.graphics().setDepth(1)
    this.gfxEnemies = this.add.graphics().setDepth(2)
    this.gfxArrows = this.add.graphics().setDepth(3)

    this.player = this.add
      .circle(W / 2, H / 2, this.stats.player.radius, COLOR_PLAYER)
      .setStrokeStyle(3, 0xcdd6f4)
      .setDepth(4)

    this.buildHud()
    this.setupInput()
  }

  // --- HUD ---------------------------------------------------------------

  buildHud() {
    const d = 10

    this.add.rectangle(W / 2, 10, W, 8, 0x313244).setDepth(d)
    this.xpBar = this.add
      .rectangle(0, 10, W, 8, 0xf9e2af)
      .setOrigin(0, 0.5)
      .setDepth(d)
    this.xpBar.scaleX = 0

    this.add.rectangle(20, 34, 200, 14, 0x313244).setOrigin(0, 0.5).setDepth(d)
    this.hpBar = this.add
      .rectangle(20, 34, 200, 14, 0xa6e3a1)
      .setOrigin(0, 0.5)
      .setDepth(d)

    const font = { fontFamily: 'Arial, sans-serif', color: '#cdd6f4' }

    this.lvText = this.add
      .text(20, 52, 'Lv 1', { ...font, fontSize: '18px' })
      .setDepth(d)

    this.timeText = this.add
      .text(W / 2, 26, '0:00', { ...font, fontSize: '30px', color: '#ffffff' })
      .setOrigin(0.5, 0)
      .setDepth(d)

    this.killText = this.add
      .text(W - 20, 26, 'Kills: 0', { ...font, fontSize: '20px' })
      .setOrigin(1, 0)
      .setDepth(d)

    this.waveText = this.add
      .text(W - 20, 52, '', { ...font, fontSize: '15px', color: '#a6adc8' })
      .setOrigin(1, 0)
      .setDepth(d)

    this.perfText = this.add
      .text(W - 20, H - 20, '', {
        ...font,
        fontSize: '13px',
        color: '#6c7086',
      })
      .setOrigin(1, 1)
      .setDepth(d)
  }

  // --- 입력 ---------------------------------------------------------------

  setupInput() {
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT')

    this.stick = { active: false, ox: 0, oy: 0, x: 0, y: 0 }
    this.stickBase = this.add
      .circle(0, 0, 60, 0xcdd6f4, 0.12)
      .setVisible(false)
      .setDepth(9)
    this.stickThumb = this.add
      .circle(0, 0, 24, 0xcdd6f4, 0.35)
      .setVisible(false)
      .setDepth(9)

    this.input.on('pointerdown', (p) => {
      if (this.gameOver) return this.scene.restart()
      if (this.paused) return // 레벨업 카드 선택 중엔 조이스틱 안 뜸

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
      if (len > 60) {
        dx = (dx / len) * 60
        dy = (dy / len) * 60
      }
      this.stick.x = dx / 60
      this.stick.y = dy / 60
      this.stickThumb.setPosition(this.stick.ox + dx, this.stick.oy + dy)
    })

    this.input.on('pointerup', () => this.releaseStick())

    this.input.keyboard.on('keydown-SPACE', () => {
      if (this.gameOver) this.scene.restart()
    })

    // 카드 선택 단축키
    for (const n of [1, 2, 3]) {
      this.input.keyboard.on(`keydown-${['ONE', 'TWO', 'THREE'][n - 1]}`, () => {
        if (this.paused && this.cards) this.pickCard(n - 1)
      })
    }
  }

  releaseStick() {
    this.stick.active = false
    this.stick.x = 0
    this.stick.y = 0
    this.stickBase.setVisible(false)
    this.stickThumb.setVisible(false)
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

  // --- 스폰 / 난이도 -------------------------------------------------------

  get minutes() {
    return Math.floor(this.elapsed / 60)
  }

  get spawnMultiplier() {
    const s = this.cfg.spawn
    return Math.min(Math.pow(s.rampPerMin, this.minutes), s.rampCap)
  }

  get enemyHpNow() {
    const e = this.cfg.enemy
    return Math.round(e.hp * Math.pow(e.hpRampPerMin, this.minutes))
  }

  spawnEnemy() {
    if (this.enemies.length >= this.cfg.spawn.maxEnemies) return

    const m = 40
    const edge = (Math.random() * 4) | 0
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

    const hp = this.enemyHpNow
    const e = this.enemyPool.pop() || {}
    e.x = x
    e.y = y
    e.hp = hp
    e.maxHp = hp
    e.kbx = 0
    e.kby = 0
    e.flash = 0
    this.enemies.push(e)
  }

  // 배열에서 O(1) 제거: 마지막 원소로 덮어쓰고 pop
  removeSwap(arr, i, pool) {
    const item = arr[i]
    arr[i] = arr[arr.length - 1]
    arr.pop()
    pool.push(item)
  }

  // --- 전투 ---------------------------------------------------------------

  nearestEnemy() {
    const range = this.stats.weapon.range
    let best = null
    let bestDist = range * range

    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i]
      const dx = e.x - this.player.x
      const dy = e.y - this.player.y
      const d = dx * dx + dy * dy
      if (d < bestDist) {
        bestDist = d
        best = e
      }
    }
    return best
  }

  fireAt(target) {
    const w = this.stats.weapon
    const angle = Math.atan2(target.y - this.player.y, target.x - this.player.x)

    const a = this.arrowPool.pop() || { hit: new Set() }
    a.x = this.player.x
    a.y = this.player.y
    a.vx = Math.cos(angle) * w.speed
    a.vy = Math.sin(angle) * w.speed
    a.angle = angle
    a.pierceLeft = w.pierce
    a.hit.clear() // Set 재사용 — 같은 적을 두 번 때리지 않기 위함
    this.arrows.push(a)
  }

  damageEnemy(e, amount, dirX, dirY) {
    const w = this.stats.weapon
    e.hp -= amount
    e.kbx += dirX * w.knockback
    e.kby += dirY * w.knockback
    e.flash = FLASH_TIME

    if (e.hp <= 0) {
      this.dropGem(e.x, e.y)
      this.removeSwap(this.enemies, this.enemies.indexOf(e), this.enemyPool)
      this.kills++
      this.killText.setText('Kills: ' + this.kills)
    }
  }

  // --- 경험치 -------------------------------------------------------------

  xpFor(level) {
    const x = this.cfg.xp
    return Math.ceil(x.levelBase * Math.pow(x.levelGrowth, level - 1))
  }

  dropGem(x, y) {
    const g = this.gemPool.pop() || {}
    g.x = x
    g.y = y
    this.gems.push(g)
  }

  gainXp(amount) {
    this.xp += amount

    while (this.xp >= this.xpNeed) {
      this.xp -= this.xpNeed
      this.level++
      this.xpNeed = this.xpFor(this.level)
      this.pendingLevels++
    }

    this.xpBar.scaleX = this.xp / this.xpNeed
    this.lvText.setText('Lv ' + this.level)

    if (this.pendingLevels > 0 && !this.paused) this.showLevelUp()
  }

  // --- 레벨업 카드 ---------------------------------------------------------

  showLevelUp() {
    this.paused = true
    this.releaseStick()

    this.cards = drawCards(this.taken, 3)
    this.cardUi = []

    const dim = this.add
      .rectangle(W / 2, H / 2, W, H, 0x11111b, 0.82)
      .setDepth(20)
    this.cardUi.push(dim)

    const title = this.add
      .text(W / 2, 120, `LEVEL ${this.level}`, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '44px',
        color: '#f9e2af',
      })
      .setOrigin(0.5)
      .setDepth(21)
    this.cardUi.push(title)

    const cw = 200
    const ch = 240
    const gap = 24
    const startX = W / 2 - ((cw + gap) * this.cards.length - gap) / 2 + cw / 2

    this.cards.forEach((u, i) => {
      const cx = startX + i * (cw + gap)
      const cy = H / 2 + 30

      const card = this.add
        .rectangle(cx, cy, cw, ch, 0x313244)
        .setStrokeStyle(3, 0x585b70)
        .setDepth(21)
        .setInteractive({ useHandCursor: true })

      card.on('pointerover', () => card.setStrokeStyle(3, 0xf9e2af))
      card.on('pointerout', () => card.setStrokeStyle(3, 0x585b70))
      card.on('pointerdown', () => this.pickCard(i))

      const lv = this.taken[u.id] || 0
      const name = this.add
        .text(cx, cy - 60, u.name, {
          fontFamily: 'Arial, sans-serif',
          fontSize: '24px',
          color: '#ffffff',
        })
        .setOrigin(0.5)
        .setDepth(22)

      const lvl = this.add
        .text(cx, cy - 26, lv > 0 ? `Lv ${lv} → ${lv + 1}` : 'NEW', {
          fontFamily: 'Arial, sans-serif',
          fontSize: '15px',
          color: lv > 0 ? '#a6adc8' : '#a6e3a1',
        })
        .setOrigin(0.5)
        .setDepth(22)

      const desc = this.add
        .text(cx, cy + 30, u.desc(this.cfg), {
          fontFamily: 'Arial, sans-serif',
          fontSize: '16px',
          color: '#cdd6f4',
          align: 'center',
          wordWrap: { width: cw - 30 },
        })
        .setOrigin(0.5)
        .setDepth(22)

      const key = this.add
        .text(cx, cy + ch / 2 - 24, `[${i + 1}]`, {
          fontFamily: 'Arial, sans-serif',
          fontSize: '14px',
          color: '#6c7086',
        })
        .setOrigin(0.5)
        .setDepth(22)

      this.cardUi.push(card, name, lvl, desc, key)
    })
  }

  pickCard(i) {
    const u = this.cards[i]
    if (!u) return

    u.apply(this.stats, this.cfg, this)
    this.taken[u.id] = (this.taken[u.id] || 0) + 1

    for (const o of this.cardUi) o.destroy()
    this.cardUi = null
    this.cards = null

    this.pendingLevels--
    if (this.pendingLevels > 0) {
      this.showLevelUp()
    } else {
      this.paused = false
    }
  }

  // --- 체력 ---------------------------------------------------------------

  heal(amount) {
    this.hp = Math.min(this.stats.player.maxHp, this.hp + amount)
    this.refreshHpBar()
  }

  refreshHpBar() {
    const ratio = this.hp / this.stats.player.maxHp
    this.hpBar.scaleX = ratio
    this.hpBar.fillColor = ratio > 0.3 ? 0xa6e3a1 : 0xf38ba8
  }

  hitPlayer(amount) {
    this.hp = Math.max(0, this.hp - amount)
    this.refreshHpBar()
    this.invulnLeft = this.stats.player.invuln

    this.tweens.add({
      targets: this.player,
      alpha: 0.3,
      duration: 80,
      yoyo: true,
      repeat: 1,
      onComplete: () => this.player.setAlpha(1),
    })

    if (this.hp === 0) this.endGame()
  }

  endGame() {
    this.gameOver = true
    this.player.setVisible(false)
    this.releaseStick()

    const f = { fontFamily: 'Arial, sans-serif' }

    this.add
      .text(W / 2, H / 2 - 50, 'GAME OVER', {
        ...f,
        fontSize: '56px',
        color: '#f38ba8',
      })
      .setOrigin(0.5)
      .setDepth(30)

    this.add
      .text(
        W / 2,
        H / 2 + 16,
        `버틴 시간 ${this.formatTime()}   ·   Lv ${this.level}   ·   처치 ${this.kills}`,
        { ...f, fontSize: '22px', color: '#cdd6f4' }
      )
      .setOrigin(0.5)
      .setDepth(30)

    this.add
      .text(W / 2, H / 2 + 70, '클릭 또는 Space 로 재시작', {
        ...f,
        fontSize: '16px',
        color: '#a6adc8',
      })
      .setOrigin(0.5)
      .setDepth(30)
  }

  formatTime() {
    const t = Math.floor(this.elapsed)
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
  }

  // --- 루프 ---------------------------------------------------------------

  update(time, delta) {
    if (this.gameOver || this.paused) return

    const dt = Math.min(delta / 1000, MAX_DT)

    this.elapsed += dt
    this.invulnLeft = Math.max(0, this.invulnLeft - dt)
    this.timeText.setText(this.formatTime())

    const mult = this.spawnMultiplier
    this.waveText.setText(`x${mult.toFixed(1)}  ·  적HP ${this.enemyHpNow}`)

    this.spawnAcc += dt
    const interval = this.cfg.spawn.baseInterval / mult
    while (this.spawnAcc >= interval) {
      this.spawnAcc -= interval
      this.spawnEnemy()
    }

    const { vx, vy } = this.moveInput()
    const p = this.stats.player
    this.player.x = Phaser.Math.Clamp(
      this.player.x + vx * p.speed * dt,
      p.radius,
      W - p.radius
    )
    this.player.y = Phaser.Math.Clamp(
      this.player.y + vy * p.speed * dt,
      p.radius,
      H - p.radius
    )

    this.fireAcc += dt
    if (this.fireAcc >= this.stats.weapon.cooldown) {
      const target = this.nearestEnemy()
      if (target) {
        this.fireAcc = 0
        this.fireAt(target)
      }
    }

    // 적을 그리드에 넣고 → 화살이 주변 셀만 검사
    this.grid.clear()
    for (let i = 0; i < this.enemies.length; i++) {
      this.grid.insert(this.enemies[i])
    }

    this.updateArrows(dt)
    this.updateEnemies(dt)
    this.updateGems(dt)
    this.render()

    this.perfText.setText(
      `${Math.round(this.game.loop.actualFps)} fps  ·  적 ${this.enemies.length}  ·  젬 ${this.gems.length}`
    )
  }

  updateArrows(dt) {
    const er = this.cfg.enemy.radius
    const hitR = er + 5
    const hitR2 = hitR * hitR

    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i]
      a.x += a.vx * dt
      a.y += a.vy * dt

      if (a.x < -30 || a.x > W + 30 || a.y < -30 || a.y > H + 30) {
        this.removeSwap(this.arrows, i, this.arrowPool)
        continue
      }

      const near = this.grid.query(a.x, a.y, hitR, this.queryBuf)
      let dead = false

      for (let j = 0; j < near.length; j++) {
        const e = near[j]
        if (a.hit.has(e)) continue

        const dx = a.x - e.x
        const dy = a.y - e.y
        if (dx * dx + dy * dy >= hitR2) continue

        a.hit.add(e)
        const len = Math.hypot(a.vx, a.vy) || 1
        this.damageEnemy(e, this.stats.weapon.damage, a.vx / len, a.vy / len)

        if (--a.pierceLeft <= 0) {
          dead = true
          break
        }
      }

      if (dead) this.removeSwap(this.arrows, i, this.arrowPool)
    }
  }

  updateEnemies(dt) {
    const cfg = this.cfg.enemy
    const pr = this.stats.player.radius
    const touch = (pr + cfg.radius) * (pr + cfg.radius)
    const decay = Math.max(0, 1 - KNOCKBACK_FRICTION * dt)

    const px = this.player.x
    const py = this.player.y
    let touching = false

    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i]

      const dx = px - e.x
      const dy = py - e.y
      const len = Math.hypot(dx, dy) || 1

      e.x += (dx / len) * cfg.speed * dt + e.kbx * dt
      e.y += (dy / len) * cfg.speed * dt + e.kby * dt
      e.kbx *= decay
      e.kby *= decay
      if (e.flash > 0) e.flash -= dt

      if (dx * dx + dy * dy < touch) touching = true
    }

    if (touching && this.invulnLeft === 0) {
      this.hitPlayer(cfg.contactDamage)
    }
  }

  updateGems(dt) {
    const p = this.stats.player
    const magnet = p.pickupRadius
    const magnet2 = magnet * magnet
    const pick2 = (p.radius + 6) * (p.radius + 6)
    const px = this.player.x
    const py = this.player.y

    let gained = 0

    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i]
      const dx = px - g.x
      const dy = py - g.y
      const d2 = dx * dx + dy * dy

      if (d2 < pick2) {
        gained += this.cfg.xp.gemValue
        this.removeSwap(this.gems, i, this.gemPool)
        continue
      }

      if (d2 < magnet2) {
        const len = Math.sqrt(d2) || 1
        const speed = this.cfg.xp.magnetSpeed
        g.x += (dx / len) * speed * dt
        g.y += (dy / len) * speed * dt
      }
    }

    if (gained > 0) this.gainXp(gained)
  }

  // --- 렌더 ---------------------------------------------------------------
  // 적 400마리를 GameObject 로 만들면 400개의 객체를 관리해야 하지만,
  // Graphics 에 몰아 그리면 클리어 후 400번의 fillRect 로 끝난다.

  render() {
    const er = this.cfg.enemy.radius
    const size = er * 2

    const ge = this.gfxEnemies
    ge.clear()

    // 색이 같은 것끼리 몰아 그려야 스타일 전환 비용이 준다.
    ge.fillStyle(COLOR_ENEMY, 1)
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i]
      if (e.flash > 0) continue
      // 남은 체력이 적을수록 작게 → 몇 대 맞았는지 눈에 보인다
      const s = size * (0.72 + 0.28 * (e.hp / e.maxHp))
      ge.fillRect(e.x - s / 2, e.y - s / 2, s, s)
    }

    ge.fillStyle(COLOR_ENEMY_HIT, 1)
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i]
      if (e.flash <= 0) continue
      ge.fillRect(e.x - er, e.y - er, size, size)
    }

    const gg = this.gfxGems
    gg.clear()
    gg.fillStyle(COLOR_GEM, 1)
    for (let i = 0; i < this.gems.length; i++) {
      const g = this.gems[i]
      gg.fillRect(g.x - 3, g.y - 3, 6, 6)
    }

    const ga = this.gfxArrows
    ga.clear()
    ga.lineStyle(4, COLOR_ARROW, 1)
    ga.beginPath()
    for (let i = 0; i < this.arrows.length; i++) {
      const a = this.arrows[i]
      const cx = Math.cos(a.angle) * 10
      const cy = Math.sin(a.angle) * 10
      ga.moveTo(a.x - cx, a.y - cy)
      ga.lineTo(a.x + cx, a.y + cy)
    }
    ga.strokePath()
  }
}

const config = {
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: COLOR_BG,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: W,
    height: H,
  },
  scene: GameScene,
}

const game = new Phaser.Game(config)

// 튜너에서 값이 바뀌면 새 설정으로 재시작한다.
// 씬의 create() 안이 아니라 여기서 한 번만 등록해야 한다 —
// create() 는 재시작마다 다시 도는데 window 리스너는 Phaser 가 정리해주지 않아서,
// 안에 두면 재시작할 때마다 리스너가 쌓인다.
onConfigChange(() => game.scene.getScene('Game')?.scene.restart())

if (import.meta.env.DEV) window.__game = game
