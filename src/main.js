import Phaser from 'phaser'
import './style.css'
import { loadConfig, onConfigChange } from './config.js'
import { deriveStats, emptyAttributes } from './progression.js'
import {
  ACTIVE_IDS,
  ACTIVE_SKILLS,
  emptySkillTree,
  investBlockReason,
  emptySpecs,
  SPEC_LEVEL,
} from './skilltree.js'
import { createGrowthScreen } from './growth-ui.js'
import { Grid } from './grid.js'

// 세로 모드 (모바일 우선). 9:16 비율.
const W = 540
const H = 960

const COLOR_BG = 0x1e1e2e
const COLOR_PLAYER = 0x89b4fa
const COLOR_ENEMY = 0xf38ba8
const COLOR_RUSHER = 0xf9a860 // 돌진형(빠름)
const COLOR_SHOOTER = 0x94e2d5 // 원거리형(카이팅)
const COLOR_ENEMY_HIT = 0xffffff
const COLOR_BOSS = 0xcba6f7
const COLOR_ARROW = 0xfab387
const COLOR_GEM = 0x94e2d5

const KNOCKBACK_FRICTION = 8
const FLASH_TIME = 0.06
const MAX_DT = 0.05 // 탭 복귀 시 delta 폭주 방지 (터널링 방지)

// 타격감(게임필) — 시각 전용. 전투 수치엔 영향 없음(sim 동기화 무관).
const COLOR_CRIT = '#f9e2af'
const MAX_POPUPS = 24 // 데미지 숫자 상한 (스웜에서 폭주 방지)
const MAX_PARTICLES = 140 // 파편 상한

// 배경 시차(parallax) 계수. 카메라가 플레이어를 따라가는 무한 월드에서
// 배경만 살짝 다른 속도로 흘러 깊이감을 준다.
const PARALLAX_GRID = 1.0
const PARALLAX_DOTS = 1.15

// 무한 월드 — 적은 플레이어 기준 화면 밖 둘레(원)에서 스폰하고,
// 너무 멀어지면(반대편으로 밀려나거나) 제거한다.
const SPAWN_DIST = Math.hypot(W, H) / 2 + 40
const DESPAWN_DIST = SPAWN_DIST + 280

// 적/화살/젬은 GameObject 가 아니라 평범한 객체다.
//  - 생성/파괴 비용 없음 (풀에서 재사용)
//  - 렌더는 Graphics 하나에 몰아서 → 수백 개여도 드로우콜 몇 개
class GameScene extends Phaser.Scene {
  constructor() {
    super('Game')
  }

  create() {
    this.cfg = loadConfig()

    // --- 성장 상태 (디아블로식 포인트 투자) ---
    const dbg = this.cfg.debug
    this.attributes = emptyAttributes() // 확정 능력치
    this.skillLevels = emptySkillTree() // 스킬 트리 보유 레벨
    this.specs = emptySpecs() // 5레벨 특화 선택 (id → 'A'|'B'|null)
    this.unlockedSkills = {} // 해금 알림을 이미 띄운 스킬
    this.attrPoints = dbg.startAttrPoints // 미사용 능력치 포인트
    this.skillPoints = dbg.startSkillPoints // 미사용 스킬 포인트

    // 능력치·스킬 → 최종 전투 stats (단일 재계산 지점)
    this.stats = deriveStats(this.cfg, this.attributes, this.skillLevels, this.specs)

    this.elapsed = 0
    this.kills = 0
    this.level = Math.max(1, dbg.startLevel)
    this.xp = 0
    this.xpNeed = this.xpFor(this.level)
    this.hp = this.stats.player.maxHp
    this.invulnLeft = 0
    this.spawnAcc = 0
    this.bossAcc = 0
    this.bossCount = 0
    this.fireAcc = 0
    this.userPaused = false // 멈춤 버튼으로 정지
    this.growthOpen = false // 성장 화면 열림
    this.gameOver = false
    this.revived = false // 활력40 부활 사용 여부
    this.lastKillExplode = 0 // 힘40 처치폭발 내부 쿨
    this._chainGuard = false // 처치폭발 연쇄 방지

    this.skillAcc = {} // 스킬별 쿨다운 누적
    for (const id of ACTIVE_IDS) this.skillAcc[id] = 0

    // 연사/지속 상태
    this.burst = {
      multishot: { left: 0, acc: 0, base: 0 }, // 부채꼴 연사
      rapidfire: { left: 0, acc: 0 }, // 단일 대상 연사
      barrage: { timeLeft: 0, acc: 0 }, // 360° 지속
    }

    this.enemies = []
    this.arrows = []
    this.explosions = [] // 수류탄 폭발 이펙트
    this.particles = [] // 타격/사망 파편
    this.partPool = []
    this.popups = [] // 데미지 숫자
    this.popupPool = []
    this._lastCritShake = 0
    this.eProjectiles = [] // 적 투사체 (보스 탄막)
    this.telegraphs = [] // 탄막 예고 표시
    this.enemyPool = []
    this.arrowPool = []
    this.eProjPool = []
    this.telePool = []
    this.explodeBuf = [] // 폭발 범위 조회용 (queryBuf 와 겹치면 안 됨)

    // 그리드 셀은 가장 큰 적(보스)이 들어갈 만큼은 되어야 한다
    this.grid = new Grid(W, H, 56)
    this.queryBuf = []

    this.buildBackground()

    // 월드 레이어 — 모든 월드 오브젝트를 담아 매 프레임 플레이어 반대로 옮긴다.
    // 이러면 플레이어는 항상 화면 중앙에 보이고, HUD/조이스틱은 화면 좌표
    // 그대로 두면 된다(카메라 무관). 게임 로직 좌표는 전부 월드 좌표.
    this.worldLayer = this.add.container(0, 0).setDepth(1)

    this.gfxEnemies = this.add.graphics()
    this.gfxArrows = this.add.graphics()
    this.gfxFx = this.add.graphics()

    this.player = this.add
      .circle(W / 2, H / 2, this.stats.player.radius, COLOR_PLAYER)
      .setStrokeStyle(3, 0xcdd6f4)

    // 렌더 순서: 적 → 화살/이펙트 → 플레이어
    this.worldLayer.add([
      this.gfxEnemies,
      this.gfxArrows,
      this.gfxFx,
      this.player,
    ])

    this.buildHud()
    this.setupInput()
    this.setupGrowth()
  }

  // --- 성장 시스템 -------------------------------------------------------

  setupGrowth() {
    this.growth = createGrowthScreen({
      getState: () => ({
        level: this.level,
        attrPoints: this.attrPoints,
        attributes: this.attributes,
        skillPoints: this.skillPoints,
        skillLevels: this.skillLevels,
        specs: this.specs,
        cfg: this.cfg,
      }),
      onApply: (finalAttr, spent) => {
        this.attributes = finalAttr
        this.attrPoints -= spent
        this.recompute()
        this.refreshGrowthHud()
      },
      onSkillInvest: (id) => this.investSkill(id),
      onSpecChoose: (id, choice) => this.chooseSpec(id, choice),
      onClose: () => {
        this.growthOpen = false
      },
    })
    this.refreshGrowthHud()
  }

  openGrowth() {
    if (this.gameOver) return
    this.growthOpen = true
    this.releaseStick()
    this.growth.open()
  }

  // 스킬 포인트로 스킬 1레벨 투자 (즉시 확정). 성공하면 true.
  investSkill(id) {
    if (this.skillPoints <= 0) return false
    if (investBlockReason(id, this.skillLevels, this.level)) return false
    this.skillLevels[id] = (this.skillLevels[id] || 0) + 1
    this.skillPoints--
    this.recompute()
    this.refreshGrowthHud()
    return true
  }

  // 5레벨 특화 선택 (한 번만). 성공하면 true.
  chooseSpec(id, choice) {
    if (this.specs[id]) return false // 이미 선택함
    if ((this.skillLevels[id] || 0) < SPEC_LEVEL) return false
    this.specs[id] = choice
    this.recompute()
    return true
  }

  // 능력치가 바뀔 때마다 최종 전투 stats 를 통째로 다시 계산한다.
  // 최대 HP 증가분만큼 현재 HP 도 함께 올린다 (활력 스펙).
  recompute() {
    const prevMax = this.stats.player.maxHp
    this.stats = deriveStats(this.cfg, this.attributes, this.skillLevels, this.specs)
    const gained = this.stats.player.maxHp - prevMax
    if (gained > 0) this.hp += gained
    this.hp = Math.min(this.hp, this.stats.player.maxHp)
    this.refreshHpBar()
  }

  // --- 배경 -------------------------------------------------------------
  // TileSprite 2장이면 끝이다. 각각 드로우콜 1개라 성능에 영향이 거의 없다.

  buildBackground() {
    if (!this.textures.exists('bg-grid')) {
      const g = this.make.graphics({ add: false })
      g.fillStyle(0x181825, 1)
      g.fillRect(0, 0, 80, 80)
      g.lineStyle(1, 0x272739, 1)
      g.strokeRect(0.5, 0.5, 79, 79)
      g.generateTexture('bg-grid', 80, 80)
      g.destroy()
    }

    if (!this.textures.exists('bg-dots')) {
      const d = this.make.graphics({ add: false })
      // 고정된 좌표 — 매번 다르면 재시작할 때 배경이 튄다
      const dots = [
        [30, 40],
        [180, 90],
        [90, 200],
        [220, 30],
        [140, 160],
        [40, 230],
        [200, 220],
        [110, 110],
      ]
      for (const [x, y] of dots) {
        d.fillStyle(0x313244, 1)
        d.fillCircle(x, y, 2)
      }
      d.generateTexture('bg-dots', 256, 256)
      d.destroy()
    }

    this.bgGrid = this.add
      .tileSprite(0, 0, W, H, 'bg-grid')
      .setOrigin(0)
      .setDepth(-2)

    this.bgDots = this.add
      .tileSprite(0, 0, W, H, 'bg-dots')
      .setOrigin(0)
      .setDepth(-1)
      .setAlpha(0.5)
  }

  updateBackground() {
    // 플레이어가 오른쪽으로 가면 배경은 왼쪽으로 흘러야 한다
    this.bgGrid.tilePositionX = this.player.x * PARALLAX_GRID
    this.bgGrid.tilePositionY = this.player.y * PARALLAX_GRID
    this.bgDots.tilePositionX = this.player.x * PARALLAX_DOTS
    this.bgDots.tilePositionY = this.player.y * PARALLAX_DOTS
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

    this.bossTimerText = this.add
      .text(W / 2, 62, '', {
        ...font,
        fontSize: '14px',
        color: '#cba6f7',
      })
      .setOrigin(0.5, 0)
      .setDepth(d)

    // 멈춤 버튼 자리를 비우려고 우측 정보는 한 칸씩 내렸다
    this.killText = this.add
      .text(W - 20, 68, 'Kills: 0', { ...font, fontSize: '20px' })
      .setOrigin(1, 0)
      .setDepth(d)

    this.waveText = this.add
      .text(W - 20, 94, '', { ...font, fontSize: '15px', color: '#a6adc8' })
      .setOrigin(1, 0)
      .setDepth(d)

    this.buildPauseButton()

    this.perfText = this.add
      .text(W - 20, H - 20, '', { ...font, fontSize: '13px', color: '#6c7086' })
      .setOrigin(1, 1)
      .setDepth(d)

    // 두 기기가 같은 값을 쓰는지 눈으로 비교하기 위한 표시.
    // (PC/모바일에서 이 숫자가 같으면 스탯은 동일한 것)
    this.statText = this.add
      .text(20, H - 20, '', { ...font, fontSize: '13px', color: '#6c7086' })
      .setOrigin(0, 1)
      .setDepth(d)

    // 능력치 요약 (좌상단, 레벨 아래)
    this.attrHudText = this.add
      .text(20, 74, '', { ...font, fontSize: '13px', color: '#94e2d5' })
      .setDepth(d)

    // 성장 버튼 (하단 중앙). 미사용 포인트가 있으면 금색으로 강조된다.
    this.growthBtn = this.add
      .rectangle(W / 2, H - 70, 240, 46, 0x313244, 0.92)
      .setStrokeStyle(2, 0x585b70)
      .setDepth(15)
      .setInteractive({ useHandCursor: true })
    this.growthBtn.on('pointerdown', () => this.openGrowth())

    this.growthBtnText = this.add
      .text(W / 2, H - 70, 'C  성장', { ...font, fontSize: '15px' })
      .setOrigin(0.5)
      .setDepth(16)
  }

  refreshGrowthHud() {
    const a = this.attributes
    this.attrHudText.setText(
      `힘 ${a.str}  민 ${a.dex}  지 ${a.int}  활 ${a.vit}`
    )

    const has = this.attrPoints > 0 || this.skillPoints > 0
    this.growthBtnText.setText(
      `C  성장   ·   능력치 ${this.attrPoints}  스킬 ${this.skillPoints}`
    )
    this.growthBtnText.setColor(has ? '#f9e2af' : '#cdd6f4')
    this.growthBtn.setStrokeStyle(2, has ? 0xf9e2af : 0x585b70)
  }

  // 우측 상단 멈춤 버튼 + 일시정지 오버레이
  buildPauseButton() {
    const bx = W - 36
    const by = 38
    const r = 24

    this.pauseBtn = this.add
      .rectangle(bx, by, r * 2, r * 2, 0x313244, 0.9)
      .setStrokeStyle(2, 0x585b70)
      .setDepth(15)
      .setInteractive({ useHandCursor: true })

    // ❚❚ (멈춤) 아이콘 — 세로 막대 2개
    this.iconPause = this.add.container(bx, by, [
      this.add.rectangle(-6, 0, 5, 20, 0xcdd6f4),
      this.add.rectangle(6, 0, 5, 20, 0xcdd6f4),
    ]).setDepth(16)

    // ▶ (재개) 아이콘 — 삼각형. 멈춘 동안에만 보인다
    this.iconPlay = this.add
      .triangle(bx + 2, by, 0, -11, 0, 11, 15, 0, 0xa6e3a1)
      .setDepth(16)
      .setVisible(false)

    this.pauseBtn.on('pointerdown', () => this.togglePause())

    // 일시정지 오버레이 (버튼보다 아래 depth 라 버튼은 계속 보인다)
    this.pauseOverlay = this.add
      .rectangle(W / 2, H / 2, W, H, 0x11111b, 0.72)
      .setDepth(14)
      .setVisible(false)

    this.pauseLabel = this.add
      .text(W / 2, H / 2, '일시정지\n\n▶ 버튼으로 재개', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '30px',
        color: '#cdd6f4',
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(14)
      .setVisible(false)
  }

  togglePause() {
    // 게임오버·성장화면 중에는 멈춤 토글을 무시한다
    if (this.gameOver || this.growthOpen) return

    this.userPaused = !this.userPaused
    this.releaseStick()

    this.pauseOverlay.setVisible(this.userPaused)
    this.pauseLabel.setVisible(this.userPaused)
    this.iconPause.setVisible(!this.userPaused)
    this.iconPlay.setVisible(this.userPaused)
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
      // 버튼을 누른 것이면 조이스틱을 켜지 않는다 (버튼이 자체 처리)
      if (this.pauseBtn.getBounds().contains(p.x, p.y)) return
      if (this.growthBtn.getBounds().contains(p.x, p.y)) return
      if (this.userPaused || this.growthOpen) return

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

    // PC: ESC 또는 P 로 멈춤 토글
    this.input.keyboard.on('keydown-ESC', () => this.togglePause())
    this.input.keyboard.on('keydown-P', () => this.togglePause())

    // C: 성장 화면 토글
    this.input.keyboard.on('keydown-C', () => {
      if (this.growthOpen) this.growth.close()
      else this.openGrowth()
    })
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

  // --- 스폰 ---------------------------------------------------------------

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

  get bossHpNow() {
    const b = this.cfg.boss
    return Math.round(b.hp * Math.pow(b.hpRampPerMin, this.minutes))
  }

  // 플레이어 기준 화면 밖 원둘레에서 스폰 (무한 월드)
  edgePosition(extra) {
    const ang = Math.random() * Math.PI * 2
    const dist = SPAWN_DIST + extra
    return {
      x: this.player.x + Math.cos(ang) * dist,
      y: this.player.y + Math.sin(ang) * dist,
    }
  }

  // 적 하나를 풀에서 꺼내 초기화. 보스도 같은 구조를 쓴다 —
  // 크기/속도/데미지를 개체마다 들고 있으므로 특수 처리가 필요 없다.
  makeEnemy(x, y, spec) {
    const e = this.enemyPool.pop() || {}
    e.x = x
    e.y = y
    e.hp = spec.hp
    e.maxHp = spec.hp
    e.r = spec.r
    e.speed = spec.speed
    e.dmg = spec.dmg
    e.kbResist = spec.kbResist
    e.gems = spec.gems
    e.boss = spec.boss
    e.type = spec.type || 'basic'
    e.ranged = spec.ranged || false
    e.kbx = 0
    e.kby = 0
    e.flash = 0
    e.wob = Math.random() * Math.PI * 2 // 유기적 흔들림 위상
    e.atk = spec.boss
      ? this.cfg.boss.attackInterval
      : spec.ranged
        ? this.cfg.enemy.shooterInterval
        : 0
    this.enemies.push(e)
    return e
  }

  spawnEnemy() {
    if (this.enemies.length >= this.cfg.spawn.maxEnemies) return
    const c = this.cfg.enemy
    const p = this.edgePosition(40)

    // 타입 선택: 시간이 지나야 돌진/원거리가 해금된다 (단계별 난이도)
    const roll = Math.random()
    const canRush = this.elapsed >= c.rusherStartSec
    const canShoot = this.elapsed >= c.shooterStartSec
    let type = 'basic'
    let speed = c.speed
    let hp = this.enemyHpNow
    let ranged = false
    if (canRush && roll < c.rusherChance) {
      type = 'rusher'
      speed = c.speed * c.rusherSpeedMul
      hp = this.enemyHpNow * c.rusherHpMul
    } else if (
      canShoot &&
      roll >= c.rusherChance &&
      roll < c.rusherChance + c.shooterChance
    ) {
      type = 'shooter'
      speed = c.speed * c.shooterSpeedMul
      hp = this.enemyHpNow * c.shooterHpMul
      ranged = true
    }

    this.makeEnemy(p.x, p.y, {
      hp,
      r: c.radius,
      speed,
      dmg: c.contactDamage,
      kbResist: 1,
      gems: 1,
      boss: false,
      type,
      ranged,
    })
  }

  spawnBoss() {
    const b = this.cfg.boss
    const p = this.edgePosition(60)
    this.makeEnemy(p.x, p.y, {
      hp: this.bossHpNow,
      r: b.radius,
      speed: b.speed,
      dmg: b.contactDamage,
      kbResist: b.knockbackResist,
      gems: b.gems,
      boss: true,
      type: 'boss',
    })

    this.bossCount++
    this.announceBoss()
  }

  announceBoss() {
    const t = this.add
      .text(W / 2, H / 2 - 140, '! BOSS !', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '46px',
        color: '#cba6f7',
      })
      .setOrigin(0.5)
      .setDepth(25)

    this.tweens.add({
      targets: t,
      alpha: { from: 1, to: 0 },
      scale: { from: 1, to: 1.35 },
      duration: 1100,
      ease: 'Quad.easeOut',
      onComplete: () => t.destroy(),
    })
  }

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

  // 화살 하나를 지정한 각도로 발사. 스킬 화살은 데미지·관통이 달라서 화살마다 들고 있는다.
  fireAngle(angle, dmg, pierce) {
    const w = this.stats.weapon
    const a = this.arrowPool.pop() || { hit: new Set() }
    a.x = this.player.x
    a.y = this.player.y
    a.vx = Math.cos(angle) * w.speed
    a.vy = Math.sin(angle) * w.speed
    a.angle = angle
    a.pierceLeft = pierce ?? w.pierce
    a.dmg = dmg
    a.hit.clear()
    this.arrows.push(a)
  }

  fireAt(target) {
    const angle = Math.atan2(target.y - this.player.y, target.x - this.player.x)
    const dmg = this.stats.weapon.damage
    this.fireAngle(angle, dmg)
    // 민첩30 추가 화살 — 살짝 벌려서 발사
    const extra = this.stats.weapon.extraArrows || 0
    for (let i = 1; i <= extra; i++) {
      const off = 0.12 * Math.ceil(i / 2) * (i % 2 ? 1 : -1)
      this.fireAngle(angle + off, dmg)
    }
  }

  // --- 액티브 스킬 (스킬 트리 레벨 기반) -----------------------------------
  // 각 스킬의 최종 수치는 deriveStats 가 stats.skillStats[id] 에 넣어둔다.
  //  - 다발사격: 타겟 방향 부채꼴 연사
  //  - 연발사격: 가장 가까운 적 단일 연사 (발마다 재조준)
  //  - 난사: 지속시간 동안 360° 난사
  //  - 수류탄: 무작위 적 위치에 count 개 폭발

  updateSkills(dt) {
    for (const id of ACTIVE_IDS) {
      const st = this.stats.skillStats[id]
      if (!st.active) continue

      this.skillAcc[id] += dt
      if (this.skillAcc[id] < st.cooldown) continue

      let fired = false
      if (id === 'multishot') fired = this.triggerMultishot(st)
      else if (id === 'rapidfire') fired = this.triggerRapidfire(st)
      else if (id === 'barrage') fired = this.triggerBarrage(st)
      else if (id === 'grenade') fired = this.triggerGrenade(st)

      // 발동 실패(쏠 적 없음) 시 쿨다운을 소모하지 않는다
      this.skillAcc[id] = fired ? 0 : st.cooldown

      // 지능40 쿨타임 반환 — 발동 시 확률로 쿨 절반 미리 채움
      const c = this.stats.combat
      if (fired && c.cdRefundChance > 0 && Math.random() < c.cdRefundChance) {
        this.skillAcc[id] = st.cooldown * 0.5
      }
    }
  }

  triggerMultishot(st) {
    const target = this.nearestEnemy()
    if (!target) return false
    const m = this.burst.multishot
    m.base = Math.atan2(target.y - this.player.y, target.x - this.player.x)
    m.left = st.shots
    m.acc = this.cfg.skill.shotInterval
    this.flashSkill(0x89dceb)
    return true
  }

  triggerRapidfire(st) {
    if (!this.nearestEnemy()) return false
    const r = this.burst.rapidfire
    r.left = st.shots
    r.acc = st.interval
    this.flashSkill(0xf38ba8)
    return true
  }

  triggerBarrage(st) {
    const b = this.burst.barrage
    b.timeLeft = st.duration
    b.acc = this.cfg.skill.shotInterval
    this.flashSkill(0xf9e2af)
    return true // 360° 는 타겟 없어도 발동
  }

  triggerGrenade(st) {
    if (this.enemies.length === 0) return false
    for (let i = 0; i < st.count; i++) {
      // 앞선 폭발이 적을 다 죽였을 수 있으니 매번 재확인
      if (this.enemies.length === 0) break
      const t = this.enemies[(Math.random() * this.enemies.length) | 0]
      this.explodeAt(t.x, t.y, st.radius, st.dmg)
    }
    return true
  }

  // 연사/지속 진행 — 매 프레임 간격만큼 차면 발사한다
  updateBursts(dt) {
    const iv = this.cfg.skill.shotInterval

    // 다발사격 — 부채꼴
    const m = this.burst.multishot
    if (m.left > 0) {
      const st = this.stats.skillStats.multishot
      const spread = Phaser.Math.DegToRad(this.cfg.skill.multishotSpread) * st.spreadMul
      m.acc += dt
      while (m.acc >= iv && m.left > 0) {
        m.acc -= iv
        this.fireAngle(m.base + (Math.random() - 0.5) * spread, st.dmg, st.pierce)
        m.left--
      }
    }

    // 연발사격 — 가장 가까운 적 단일 연사
    const r = this.burst.rapidfire
    if (r.left > 0) {
      const st = this.stats.skillStats.rapidfire
      r.acc += dt
      while (r.acc >= st.interval && r.left > 0) {
        r.acc -= st.interval
        const t = this.nearestEnemy()
        if (!t) {
          r.left = 0
          break
        }
        this.fireAngle(
          Math.atan2(t.y - this.player.y, t.x - this.player.x),
          st.dmg,
          st.pierce
        )
        r.left--
      }
    }

    // 난사 — 지속시간 동안 360° 무작위
    const b = this.burst.barrage
    if (b.timeLeft > 0) {
      const st = this.stats.skillStats.barrage
      b.timeLeft -= dt
      b.acc += dt
      while (b.acc >= iv) {
        b.acc -= iv
        this.fireAngle(Math.random() * Math.PI * 2, st.dmg, st.pierce)
      }
    }
  }

  explodeAt(x, y, r, dmg) {
    const maxEnemyR = Math.max(this.cfg.enemy.radius, this.cfg.boss.radius)
    // updateArrows 가 queryBuf 를 쓰므로 폭발은 별도 버퍼로 조회한다
    const near = this.grid.query(x, y, r + maxEnemyR, this.explodeBuf)

    // damageEnemy 가 enemies 를 수정하지만 near 는 별도 배열이라 안전하다
    for (let i = near.length - 1; i >= 0; i--) {
      const e = near[i]
      const dx = e.x - x
      const dy = e.y - y
      const reach = r + e.r
      const d2 = dx * dx + dy * dy
      if (d2 > reach * reach) continue
      const d = Math.sqrt(d2) || 1
      this.damageEnemy(e, dmg, dx / d, dy / d)
    }

    this.explosions.push({ x, y, r, life: 0.3, max: 0.3 })
    this.cameras.main.shake(80, 0.003)
  }

  // --- 보스 탄막 (예고 → 실탄) ---------------------------------------------

  fireBossLine(boss) {
    const b = this.cfg.boss
    const base = Math.atan2(this.player.y - boss.y, this.player.x - boss.x)
    const mid = (b.lineCount - 1) / 2
    for (let i = 0; i < b.lineCount; i++) {
      const ang = base + (i - mid) * b.lineSpread
      const t = this.telePool.pop() || {}
      t.x = boss.x
      t.y = boss.y
      t.ang = ang
      t.life = b.telegraphTime
      t.max = b.telegraphTime
      this.telegraphs.push(t)
    }
  }

  // 원거리형 적의 단발 탄 (예고 없이 즉시)
  fireEnemyShot(e) {
    const c = this.cfg.enemy
    const ang = Math.atan2(this.player.y - e.y, this.player.x - e.x)
    const p = this.eProjPool.pop() || {}
    p.x = e.x
    p.y = e.y
    p.vx = Math.cos(ang) * c.shooterBoltSpeed
    p.vy = Math.sin(ang) * c.shooterBoltSpeed
    p.dmg = c.shooterBoltDamage
    p.life = 4
    this.eProjectiles.push(p)
  }

  updateTelegraphs(dt) {
    const b = this.cfg.boss
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const t = this.telegraphs[i]
      t.life -= dt
      if (t.life > 0) continue
      // 예고 끝 → 실탄 발사
      const p = this.eProjPool.pop() || {}
      p.x = t.x
      p.y = t.y
      p.vx = Math.cos(t.ang) * b.boltSpeed
      p.vy = Math.sin(t.ang) * b.boltSpeed
      p.dmg = b.boltDamage
      p.life = 4
      this.eProjectiles.push(p)
      this.removeSwap(this.telegraphs, i, this.telePool)
    }
  }

  updateEnemyProjectiles(dt) {
    const pr = this.stats.player.radius
    const px = this.player.x
    const py = this.player.y
    let incoming = 0

    for (let i = this.eProjectiles.length - 1; i >= 0; i--) {
      const p = this.eProjectiles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.life -= dt

      const dx = px - p.x
      const dy = py - p.y
      const hit = pr + 5
      if (dx * dx + dy * dy < hit * hit) {
        if (p.dmg > incoming) incoming = p.dmg
        this.removeSwap(this.eProjectiles, i, this.eProjPool)
        continue
      }
      // 화면(플레이어 주변)에서 너무 멀어지거나 수명 끝
      if (p.life <= 0 || dx * dx + dy * dy > DESPAWN_DIST * DESPAWN_DIST) {
        this.removeSwap(this.eProjectiles, i, this.eProjPool)
      }
    }

    if (incoming > 0 && this.invulnLeft === 0) this.hitPlayer(incoming)
  }

  // 스킬 발동 순간 플레이어를 잠깐 빛나게 (뭔가 터졌다는 신호)
  flashSkill(color) {
    const ring = this.add
      .circle(this.player.x, this.player.y, this.stats.player.radius + 6)
      .setStrokeStyle(3, color)
    this.worldLayer.add(ring) // 월드 좌표에 표시 (카메라 따라감)

    this.tweens.add({
      targets: ring,
      scale: 2.2,
      alpha: 0,
      duration: 280,
      onComplete: () => ring.destroy(),
    })
  }

  damageEnemy(e, amount, dirX, dirY) {
    const w = this.stats.weapon
    const c = this.stats.combat

    // 치명타 판정
    let crit = false
    if (c.critChance > 0 && Math.random() < c.critChance) {
      amount *= c.critDmg
      crit = true
    }

    e.hp -= amount
    e.kbx += dirX * w.knockback * e.kbResist
    e.kby += dirY * w.knockback * e.kbResist
    e.flash = FLASH_TIME

    // 데미지 숫자 (머리 위). 크리는 크고 금색.
    this.spawnPopup(e.x, e.y - e.r - 6, Math.max(1, Math.round(amount)), crit)
    // 크리 시 살짝 흔들림 — 스웜에서 과하지 않게 쿨다운
    if (crit && this.elapsed - this._lastCritShake > 0.15) {
      this._lastCritShake = this.elapsed
      this.cameras.main.shake(60, 0.0035)
    }

    if (e.hp > 0) return

    const ex = e.x
    const ey = e.y

    // 사망 파편 — 적 색으로 튀어나가며 사라짐
    const col = e.boss
      ? COLOR_BOSS
      : e.type === 'rusher'
        ? COLOR_RUSHER
        : e.type === 'shooter'
          ? COLOR_SHOOTER
          : COLOR_ENEMY
    this.spawnParticles(ex, ey, e.boss ? 20 : 9, col, e.boss ? 240 : 170, e.boss ? 4 : 3, 0.45)
    if (e.boss) this.cameras.main.shake(160, 0.006)
    // 처치 즉시 경험치 (젬을 줍지 않는다). 보스는 e.gems 배수만큼.
    this.removeSwap(this.enemies, this.enemies.indexOf(e), this.enemyPool)
    this.kills++
    this.killText.setText('Kills: ' + this.kills)
    this.gainXp(e.gems * this.cfg.xp.gemValue)

    // 힘40 처치 폭발 (연쇄 없음, 내부 쿨 0.2초)
    if (
      !this._chainGuard &&
      c.killExplodeChance > 0 &&
      this.elapsed - this.lastKillExplode > 0.2 &&
      Math.random() < c.killExplodeChance
    ) {
      this.lastKillExplode = this.elapsed
      this._chainGuard = true
      this.explodeAt(ex, ey, 40, this.stats.weapon.damage)
      this._chainGuard = false
    }
  }

  // --- 경험치 -------------------------------------------------------------

  xpFor(level) {
    const x = this.cfg.xp
    return Math.ceil(x.levelBase * Math.pow(x.levelGrowth, level - 1))
  }

  gainXp(amount) {
    this.xp += amount

    let levelsGained = 0
    while (this.xp >= this.xpNeed) {
      this.xp -= this.xpNeed
      this.level++
      this.xpNeed = this.xpFor(this.level)
      levelsGained++
    }

    this.xpBar.scaleX = this.xp / this.xpNeed

    if (levelsGained > 0) this.onLevelUp(levelsGained)
  }

  // 레벨업 — 게임을 멈추지 않고 포인트만 지급하고 알림을 띄운다 (스펙).
  // 여러 레벨이 한 번에 올라도 알림은 한 번으로 합친다.
  onLevelUp(levels) {
    const ap = levels * this.cfg.attr.pointsPerLevel
    const sp = levels * this.cfg.attr.skillPointsPerLevel
    this.attrPoints += ap
    this.skillPoints += sp

    this.lvText.setText('Lv ' + this.level)
    this.refreshGrowthHud()
    this.showLevelToast(levels, ap, sp)
    this.checkUnlocks()
  }

  // 레벨이 스킬 해금 레벨을 통과하면 알림 (레벨을 건너뛰어도 처리)
  checkUnlocks() {
    for (const id of ACTIVE_IDS) {
      const def = ACTIVE_SKILLS[id]
      if (this.level >= def.unlockLevel && !this.unlockedSkills[id]) {
        this.unlockedSkills[id] = true
        if (def.unlockLevel > 1) {
          // 레벨업 토스트와 겹치지 않게 살짝 아래에 표시
          this.showUnlockToast(def.name)
        }
      }
    }
  }

  showUnlockToast(name) {
    const msg = `NEW SKILL\n${name}\n성장 화면에서 습득`
    const t = this.add
      .text(W / 2, H * 0.42, msg, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '24px',
        color: '#cba6f7',
        align: 'center',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(23)

    this.tweens.add({
      targets: t,
      alpha: { from: 1, to: 0 },
      duration: 2000,
      ease: 'Quad.easeIn',
      onComplete: () => t.destroy(),
    })

    // 성장 버튼을 잠깐 강조
    this.tweens.add({
      targets: this.growthBtn,
      scaleX: 1.08,
      scaleY: 1.15,
      duration: 220,
      yoyo: true,
      repeat: 3,
    })
  }

  showLevelToast(levels, ap, sp) {
    const msg =
      (levels > 1 ? `LEVEL UP +${levels}` : 'LEVEL UP') +
      `\n능력치 +${ap}   스킬 +${sp}`

    const toast = this.add
      .text(W / 2, H * 0.3, msg, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '26px',
        color: '#f9e2af',
        align: 'center',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(23)

    this.tweens.add({
      targets: toast,
      y: H * 0.24,
      alpha: { from: 1, to: 0 },
      duration: 1400,
      ease: 'Quad.easeOut',
      onComplete: () => toast.destroy(),
    })
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
    const c = this.stats.combat

    // 회피 판정 (민첩40 + 회피 훈련)
    if (c.dodge > 0 && Math.random() < c.dodge) {
      this.showDodge()
      return
    }

    amount *= c.dmgTakenMul // 활력20 받는 피해 감소
    this.hp = Math.max(0, this.hp - amount)
    this.refreshHpBar()
    this.invulnLeft = this.stats.player.invuln

    this.cameras.main.shake(120, 0.006)
    this.tweens.add({
      targets: this.player,
      alpha: 0.3,
      duration: 80,
      yoyo: true,
      repeat: 1,
      onComplete: () => this.player.setAlpha(1),
    })

    if (this.hp === 0) {
      // 활력40 부활 (한 판 1회)
      if (c.revive && !this.revived) {
        this.doRevive()
        return
      }
      this.endGame()
    }
  }

  doRevive() {
    this.revived = true
    this.hp = this.stats.player.maxHp * 0.3
    this.refreshHpBar()
    this.invulnLeft = 2 // 2초 무적

    const t = this.add
      .text(W / 2, H / 2, 'REVIVE', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '48px',
        color: '#a6e3a1',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(24)
    this.tweens.add({
      targets: t,
      alpha: 0,
      scale: 1.5,
      duration: 900,
      onComplete: () => t.destroy(),
    })
  }

  showDodge() {
    const t = this.add
      .text(this.player.x, this.player.y - 24, 'DODGE', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '18px',
        color: '#89dceb',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
    this.worldLayer.add(t) // 월드 좌표
    this.tweens.add({
      targets: t,
      y: t.y - 20,
      alpha: 0,
      duration: 500,
      onComplete: () => t.destroy(),
    })
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
        `버틴 시간 ${this.formatTime()}   ·   Lv ${this.level}   ·   처치 ${this.kills}   ·   보스 ${this.bossCount}`,
        { ...f, fontSize: '20px', color: '#cdd6f4' }
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
    if (this.gameOver || this.userPaused || this.growthOpen) return

    const dt = Math.min(delta / 1000, MAX_DT)

    this.elapsed += dt
    this.invulnLeft = Math.max(0, this.invulnLeft - dt)
    this.timeText.setText(this.formatTime())

    // 활력 구간 HP 회복
    const regen = this.stats.combat.regen
    if (regen > 0 && this.hp > 0 && this.hp < this.stats.player.maxHp) {
      this.hp = Math.min(this.stats.player.maxHp, this.hp + regen * dt)
      this.refreshHpBar()
    }

    const mult = this.spawnMultiplier
    this.waveText.setText(`x${mult.toFixed(1)}  ·  적HP ${this.enemyHpNow}`)

    this.spawnAcc += dt
    const interval = this.cfg.spawn.baseInterval / mult
    while (this.spawnAcc >= interval) {
      this.spawnAcc -= interval
      this.spawnEnemy()
    }

    this.bossAcc += dt
    const bossEvery = this.cfg.boss.everySec
    if (this.bossAcc >= bossEvery) {
      this.bossAcc -= bossEvery
      this.spawnBoss()
    }
    this.bossTimerText.setText(
      `다음 보스 ${Math.ceil(bossEvery - this.bossAcc)}초`
    )

    const { vx, vy } = this.moveInput()
    const p = this.stats.player
    // 무한 월드 — 벽 clamp 없이 자유 이동
    this.player.x += vx * p.speed * dt
    this.player.y += vy * p.speed * dt

    // 월드 레이어를 플레이어 반대로 옮겨 플레이어를 화면 중앙에 고정
    this.worldLayer.setPosition(W / 2 - this.player.x, H / 2 - this.player.y)
    this.updateBackground()

    this.fireAcc += dt
    if (this.fireAcc >= this.stats.weapon.cooldown) {
      const target = this.nearestEnemy()
      if (target) {
        this.fireAcc = 0
        this.fireAt(target)
      }
    }

    this.updateSkills(dt)
    this.updateBursts(dt)
    this.updateExplosions(dt)
    this.updatePopups(dt)
    this.updateParticles(dt)

    // 그리드를 플레이어 주변 화면 영역으로 옮긴다 (무한 월드 대응)
    this.grid.setOrigin(this.player.x - W / 2, this.player.y - H / 2)
    this.grid.clear()
    for (let i = 0; i < this.enemies.length; i++) {
      this.grid.insert(this.enemies[i])
    }

    this.updateArrows(dt)
    this.updateEnemies(dt)
    this.updateTelegraphs(dt)
    this.updateEnemyProjectiles(dt)
    this.render()

    this.perfText.setText(
      `${Math.round(this.game.loop.actualFps)} fps  ·  적 ${this.enemies.length}`
    )
    this.statText.setText(
      `내속도 ${Math.round(this.stats.player.speed)}  ·  적속도 ${this.cfg.enemy.speed}  ·  DMG ${this.stats.weapon.damage}`
    )
  }

  updateArrows(dt) {
    // 그리드에 물어볼 반경은 "가장 큰 적"까지 잡아야 보스를 놓치지 않는다
    const maxR = Math.max(this.cfg.enemy.radius, this.cfg.boss.radius) + 5

    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i]
      a.x += a.vx * dt
      a.y += a.vy * dt

      // 플레이어에서 너무 멀어진 화살 제거 (월드 좌표 기준!).
      // 화면 좌표(0~W)로 판정하면 무한 월드에서 플레이어가 이동했을 때
      // 화살이 생성 즉시 제거되어 발사가 안 되는 것처럼 보인다.
      const adx = a.x - this.player.x
      const ady = a.y - this.player.y
      if (adx * adx + ady * ady > DESPAWN_DIST * DESPAWN_DIST) {
        this.removeSwap(this.arrows, i, this.arrowPool)
        continue
      }

      const near = this.grid.query(a.x, a.y, maxR, this.queryBuf)
      let spent = false

      for (let j = 0; j < near.length; j++) {
        const e = near[j]
        if (a.hit.has(e)) continue

        const hitR = e.r + 5 // 정확한 판정은 개체별 반지름으로
        const dx = a.x - e.x
        const dy = a.y - e.y
        if (dx * dx + dy * dy >= hitR * hitR) continue

        a.hit.add(e)
        const len = Math.hypot(a.vx, a.vy) || 1
        // 화살 타격 스파크 (충돌 지점)
        this.spawnParticles(a.x, a.y, 3, COLOR_ARROW, 130, 2, 0.22)
        this.damageEnemy(e, a.dmg, a.vx / len, a.vy / len)

        if (--a.pierceLeft <= 0) {
          spent = true
          break
        }
      }

      if (spent) this.removeSwap(this.arrows, i, this.arrowPool)
    }
  }

  updateEnemies(dt) {
    const pr = this.stats.player.radius
    const decay = Math.max(0, 1 - KNOCKBACK_FRICTION * dt)
    const sepR = this.cfg.enemy.sepRadius
    const sepStr = this.cfg.enemy.sepStrength
    const px = this.player.x
    const py = this.player.y

    let incoming = 0 // 이번 프레임에 닿은 적 중 가장 아픈 것
    const despawn2 = DESPAWN_DIST * DESPAWN_DIST

    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i]

      const dx = px - e.x
      const dy = py - e.y

      // 너무 멀어진 적은 제거 (화면 밖 거리 임계 — sort 없이)
      if (dx * dx + dy * dy > despawn2) {
        this.removeSwap(this.enemies, i, this.enemyPool)
        i--
        continue
      }

      const len = Math.hypot(dx, dy) || 1

      // 겹침 방지: 그리드로 근처 적만 조회해 밀어냄 (최대 6마리)
      let sx = 0
      let sy = 0
      if (sepStr > 0) {
        const near = this.grid.query(e.x, e.y, sepR, this.queryBuf)
        let cnt = 0
        for (let j = 0; j < near.length; j++) {
          const n = near[j]
          if (n === e) continue
          const ndx = e.x - n.x
          const ndy = e.y - n.y
          const nd2 = ndx * ndx + ndy * ndy
          if (nd2 > 0 && nd2 < sepR * sepR) {
            const nd = Math.sqrt(nd2)
            sx += ndx / nd
            sy += ndy / nd
            if (++cnt >= 6) break
          }
        }
      }

      // 타입별 이동 방향
      let mvx, mvy
      if (e.ranged) {
        // 원거리형 카이팅 — 거리 유지 (너무 가까우면 후퇴, 멀면 접근)
        const c = this.cfg.enemy
        let dir = 0
        if (len < c.shooterRetreat) dir = -1
        else if (len > c.shooterRange) dir = 1
        mvx = (dx / len) * dir
        mvy = (dy / len) * dir
      } else {
        // 추격 + 좌우 흔들림 (유기적)
        e.wob += dt * 3
        const wob = Math.sin(e.wob) * this.cfg.enemy.wobble
        mvx = dx / len + (-dy / len) * wob
        mvy = dy / len + (dx / len) * wob
      }

      e.x += mvx * e.speed * dt + sx * sepStr * dt + e.kbx * dt
      e.y += mvy * e.speed * dt + sy * sepStr * dt + e.kby * dt
      e.kbx *= decay
      e.kby *= decay
      if (e.flash > 0) e.flash -= dt

      // 보스 라인 탄막 / 원거리형 단발
      if (e.boss) {
        e.atk -= dt
        if (e.atk <= 0) {
          e.atk += this.cfg.boss.attackInterval
          this.fireBossLine(e)
        }
      } else if (e.ranged) {
        e.atk -= dt
        if (e.atk <= 0) {
          e.atk += this.cfg.enemy.shooterInterval
          this.fireEnemyShot(e)
        }
      }

      const touch = pr + e.r
      if (dx * dx + dy * dy < touch * touch && e.dmg > incoming) {
        incoming = e.dmg
      }
    }

    if (incoming > 0 && this.invulnLeft === 0) this.hitPlayer(incoming)
  }

  updateExplosions(dt) {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const ex = this.explosions[i]
      ex.life -= dt
      if (ex.life <= 0) this.explosions.splice(i, 1)
    }
  }

  // --- 타격감 이펙트 (시각 전용) -----------------------------------------

  // 데미지 숫자 (풀 재사용, 월드 좌표). 크리는 크고 금색.
  spawnPopup(x, y, amount, crit) {
    if (this.popups.length >= MAX_POPUPS) {
      const old = this.popups.shift() // 가장 오래된 것 재활용
      old.t.setVisible(false)
      this.popupPool.push(old.t)
    }
    let t = this.popupPool.pop()
    if (!t) {
      t = this.add
        .text(0, 0, '', {
          fontFamily: '-apple-system, "Segoe UI", Roboto, sans-serif',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
      this.worldLayer.add(t)
    }
    t.setText('' + amount)
    t.setFontSize(crit ? 28 : 18)
    t.setColor(crit ? COLOR_CRIT : '#ffffff')
    t.setPosition(x + (Math.random() * 16 - 8), y)
    t.setAlpha(1)
    t.setVisible(true)
    const life = crit ? 0.75 : 0.55
    this.popups.push({ t, vy: -46, life, max: life })
  }

  updatePopups(dt) {
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i]
      p.life -= dt
      if (p.life <= 0) {
        p.t.setVisible(false)
        this.popupPool.push(p.t)
        this.popups.splice(i, 1)
        continue
      }
      p.t.y += p.vy * dt
      p.vy += 60 * dt // 솟았다가 서서히 감속
      const k = p.life / p.max
      p.t.setAlpha(k < 0.5 ? k * 2 : 1) // 후반부에 페이드아웃
    }
  }

  // 파편 (평범한 객체 → gfxFx 에 사각형으로 그림). 타격/사망에 사용.
  spawnParticles(x, y, count, color, spd, size, life) {
    for (let n = 0; n < count; n++) {
      if (this.particles.length >= MAX_PARTICLES) return
      const a = Math.random() * Math.PI * 2
      const s = spd * (0.4 + Math.random() * 0.6)
      const p = this.partPool.pop() || {}
      p.x = x
      p.y = y
      p.vx = Math.cos(a) * s
      p.vy = Math.sin(a) * s
      p.life = life * (0.7 + Math.random() * 0.3)
      p.max = p.life
      p.color = color
      p.size = size
      this.particles.push(p)
    }
  }

  updateParticles(dt) {
    const fr = Math.max(0, 1 - 6 * dt) // 감속
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vx *= fr
      p.vy *= fr
      p.life -= dt
      if (p.life <= 0) this.removeSwap(this.particles, i, this.partPool)
    }
  }

  // --- 렌더 ---------------------------------------------------------------
  // 적 400마리를 GameObject 로 만들면 400개 객체를 관리해야 하지만,
  // Graphics 에 몰아 그리면 clear 후 400번의 fillRect 로 끝난다.

  render() {
    const ge = this.gfxEnemies
    ge.clear()

    // 타입별로 색을 몰아 그려야 스타일 전환 비용이 줄어든다
    const typePasses = [
      ['basic', COLOR_ENEMY],
      ['rusher', COLOR_RUSHER],
      ['shooter', COLOR_SHOOTER],
    ]
    for (let t = 0; t < typePasses.length; t++) {
      ge.fillStyle(typePasses[t][1], 1)
      for (let i = 0; i < this.enemies.length; i++) {
        const e = this.enemies[i]
        if (e.type !== typePasses[t][0] || e.flash > 0) continue
        // 크기 고정 — 피격은 흰 플래시 + 데미지 숫자로 표현(크기 안 줄임)
        const s = e.r * 2
        ge.fillRect(e.x - s / 2, e.y - s / 2, s, s)
      }
    }

    ge.fillStyle(COLOR_BOSS, 1)
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i]
      if (!e.boss || e.flash > 0) continue
      ge.fillRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2)
    }

    ge.fillStyle(COLOR_ENEMY_HIT, 1)
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i]
      if (e.flash <= 0) continue
      // 피격 순간 살짝 커짐 → 펀치감
      const hs = e.r * 2 * 1.18
      ge.fillRect(e.x - hs / 2, e.y - hs / 2, hs, hs)
    }

    // 보스는 머리 위에 체력바 — 몇 대 더 때려야 하는지 보여야 긴장감이 산다
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i]
      if (!e.boss) continue
      const bw = e.r * 2.4
      const bx = e.x - bw / 2
      const by = e.y - e.r - 12
      ge.fillStyle(0x313244, 1)
      ge.fillRect(bx, by, bw, 5)
      ge.fillStyle(0xf38ba8, 1)
      ge.fillRect(bx, by, bw * Math.max(0, e.hp / e.maxHp), 5)
    }

    const ga = this.gfxArrows
    ga.clear()
    ga.lineStyle(2, COLOR_ARROW, 1)
    ga.beginPath()
    for (let i = 0; i < this.arrows.length; i++) {
      const a = this.arrows[i]
      const cx = Math.cos(a.angle) * 10
      const cy = Math.sin(a.angle) * 10
      ga.moveTo(a.x - cx, a.y - cy)
      ga.lineTo(a.x + cx, a.y + cy)
    }
    ga.strokePath()

    // 수류탄 폭발 — 커지면서 사라지는 링
    const gf = this.gfxFx
    gf.clear()
    for (let i = 0; i < this.explosions.length; i++) {
      const ex = this.explosions[i]
      const k = ex.life / ex.max // 1 → 0
      gf.lineStyle(3, COLOR_ARROW, k)
      gf.strokeCircle(ex.x, ex.y, ex.r * (1.3 - 0.3 * k))
      gf.fillStyle(COLOR_ARROW, k * 0.18)
      gf.fillCircle(ex.x, ex.y, ex.r)
    }

    // 보스 탄막 예고 — 발사 직전일수록 진해지는 라인
    const TELE_LEN = 900
    for (let i = 0; i < this.telegraphs.length; i++) {
      const t = this.telegraphs[i]
      const k = 1 - t.life / t.max // 0 → 1 (발사 임박)
      gf.lineStyle(2 + k * 2, 0xf38ba8, 0.25 + k * 0.5)
      gf.beginPath()
      gf.moveTo(t.x, t.y)
      gf.lineTo(t.x + Math.cos(t.ang) * TELE_LEN, t.y + Math.sin(t.ang) * TELE_LEN)
      gf.strokePath()
    }

    // 적 투사체 (보스 탄)
    gf.fillStyle(0xf38ba8, 1)
    for (let i = 0; i < this.eProjectiles.length; i++) {
      const p = this.eProjectiles[i]
      gf.fillCircle(p.x, p.y, 6)
    }

    // 타격/사망 파편 — 남은 수명만큼 옅어짐
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]
      const k = p.life / p.max
      gf.fillStyle(p.color, k)
      gf.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2)
    }
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
