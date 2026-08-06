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
import { createLevelupScreen } from './levelup-cards.js'
import { createRuneScreen } from './rune-screen.js'
import { Grid } from './grid.js'

// --- 룬 (보스 처치 드랍, 스킬당 1슬롯) ---
const RUNES = {
  damage: { icon: '⚔️', name: '데미지', desc: '그 스킬 피해 +20%', color: '#e87850' },
  pierce: { icon: '➹', name: '관통', desc: '그 스킬 관통 +1', color: '#5ab4eb' },
  projectile: { icon: '🎯', name: '발사체', desc: '그 스킬 발사체 +1', color: '#5adccd' },
  cooldown: { icon: '⏱️', name: '쿨감', desc: '그 스킬 쿨타임 -15%', color: '#78d2be' },
  burn: { icon: '🔥', name: '화상', desc: '명중 시 3초간 도트 피해', color: '#f0963c' },
}
const RUNE_POOL = ['damage', 'pierce', 'projectile', 'cooldown', 'burn']

// --- 레벨업 카드(뱀서 표준 진행) ---
// 스킬 카드(기존 액티브 재활용) + 패시브 4종. 성장 화면(스킬트리)은 보류.
const CARD_SKILLS = {
  multishot: { icon: '🏹', name: '다발 사격', desc: '가까운 적 방향으로 부채꼴 연사' },
  rapidfire: { icon: '💥', name: '연발 사격', desc: '가까운 적을 단일 집중 연사' },
  barrage: { icon: '🌪️', name: '난사', desc: '이동하며 주변 360° 난사' },
  grenade: { icon: '💣', name: '수류탄', desc: '밀집 지점에 던져 범위 폭발' },
}
const CARD_PASSIVES = {
  dmg: { icon: '⚔️', name: '데미지 +10%', desc: '모든 피해 증가', step: 0.1 },
  move: { icon: '👟', name: '이동속도 +8%', desc: '캐릭터 이동속도 증가', step: 0.08 },
  hp: { icon: '❤️', name: '최대체력 +15%', desc: '생존력 증가', step: 0.15 },
  atkSpeed: { icon: '⏱️', name: '공격속도 +8%', desc: '기본·스킬 쿨타임 감소', step: 0.08 },
}
const MAX_ACTIVE = 5 // 동시 활성 스킬 수 (기본 사격 + 액티브 4종 전부)
const GRENADE_MAX = 240 // 수류탄 최대 투척 거리(적정 사거리)
const GRENADE_DUR = 0.45 // 수류탄 포물선 비행 시간(초)
const GRENADE_ARC = 62 // 포물선 최대 높이(px)
const BURN_PCT = 0.3 // 화상 도트 = 명중 피해의 이 비율/초
const BURN_DUR = 3 // 화상 지속(초)

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
const COLOR_ARROW = 0xfab387 // 기본 활 (주황)
const COLOR_SKILL_ARROW = 0x89dceb // 스킬 발사체 (하늘색 — 기본과 구분)
const COLOR_GEM = 0x94e2d5

const KNOCKBACK_FRICTION = 8
const FLASH_TIME = 0.06
const MAX_DT = 0.05 // 탭 복귀 시 delta 폭주 방지 (터널링 방지)

// 타격감(게임필) — 시각 전용. 전투 수치엔 영향 없음(sim 동기화 무관).
const COLOR_CRIT = '#f9e2af'
const MAX_POPUPS = 24 // 데미지 숫자 상한 (스웜에서 폭주 방지)
const MAX_PARTICLES = 200 // 파편 상한 (fillRect라 저렴)
const PLAYER_SPRITE_SCALE = 0.55 // 폴백 기본값 (실제 배율은 cfg.player.spriteScale)
const SPRITE_H = 116 // 스프라이트 셀 높이. 화살 발사(활) 높이 = 배율×높이×0.4

// 배경 시차(parallax) 계수. 카메라가 플레이어를 따라가는 무한 월드에서
// 배경만 살짝 다른 속도로 흘러 깊이감을 준다.
const PARALLAX_GRID = 1.0
const PARALLAX_DOTS = 1.15

// 무한 월드 — 적은 플레이어 기준 화면 밖 둘레(원)에서 스폰하고,
// 너무 멀어지면(반대편으로 밀려나거나) 제거한다.
const SPAWN_DIST = Math.hypot(W, H) / 2 + 40
const DESPAWN_DIST = SPAWN_DIST + 280
// 보스가 이 거리보다 멀면(사실상 화면 밖) 플레이어보다 빠르게 접근시켜
// 반드시 화면에 들어오게 한다. 화면 안에서는 원래 느린 속도로 복귀.
const BOSS_LEASH = Math.hypot(W, H) / 2 // 화면 반대각선 ≈ 화면 경계
const BOSS_CATCHUP = 1.25 // 화면 밖일 때 플레이어 속도의 이 배율로 추격

// 개발용 HUD(fps·속도·능력치 수치)는 기본 숨김. URL 에 ?dev 를 붙이면 표시.
// (플레이어에겐 안 보이고, 개발 중엔 ...?dev 로 켜서 확인)
const DEV_HUD =
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).has('dev')

// 적/화살/젬은 GameObject 가 아니라 평범한 객체다.
//  - 생성/파괴 비용 없음 (풀에서 재사용)
//  - 렌더는 Graphics 하나에 몰아서 → 수백 개여도 드로우콜 몇 개
class GameScene extends Phaser.Scene {
  constructor() {
    super('Game')
  }

  preload() {
    // 캐릭터 동작 스프라이트시트 (96×116 셀, 8열×7행)
    this.load.spritesheet(
      'archer',
      '/sprites/dungeon/deliverables/player_spritesheet.png',
      { frameWidth: 96, frameHeight: 116 }
    )
    // 바닥 타일/데칼 — 로딩 화면에서 미리 디코딩해 둔다. new Image() 로 플레이
    // 시작 후 디코딩하면 첫 몇 초 캔버스 그리기에서 메인스레드가 튄다(초기 버벅).
    this.load.image('isotileset', '/sprites/dungeon/tileset_iso_stone.png')
    this.load.image('isodecals', '/sprites/dungeon/decals_iso.png')
    // 적 스프라이트 (32×32, 3행[고블린/사냥개/궁수]×4프레임)
    this.load.spritesheet('enemies', '/sprites/dungeon/enemies_sheet.png', {
      frameWidth: 32,
      frameHeight: 32,
    })
  }

  create() {
    this.cfg = loadConfig()

    // --- 성장 상태 (디아블로식 포인트 투자) ---
    const dbg = this.cfg.debug
    this.attributes = emptyAttributes() // 확정 능력치
    this.skillLevels = emptySkillTree() // 스킬 트리 보유 레벨
    this.specs = emptySpecs() // 5레벨 특화 선택 (id → 'A'|'B'|null)
    this.unlockedSkills = {} // 해금 알림을 이미 띄운 스킬
    this.attrPoints = dbg.startAttrPoints // 미사용 능력치 포인트(보류)
    this.skillPoints = dbg.startSkillPoints // 미사용 스킬 포인트(보류)
    // 레벨업 카드 패시브 스택 {dmg,move,hp,atkSpeed}
    this.cardPassives = { dmg: 0, move: 0, hp: 0, atkSpeed: 0 }
    this.levelupOpen = false
    this._pendingLevels = 0
    // 룬 슬롯 (스킬 id → 룬 id). 보스 처치 시 장착.
    this.runeSlots = { basic: null, multishot: null, rapidfire: null, barrage: null, grenade: null }
    this.runeOpen = false
    this._pendingRune = false

    // 능력치·스킬·카드·룬 → 최종 전투 stats (단일 재계산 지점)
    this.stats = deriveStats(
      this.cfg, this.attributes, this.skillLevels, this.specs,
      this.cardBonusObj(), this.runeSlots
    )

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
    this.grenades = [] // 날아가는 수류탄(포물선)
    this.grenadePool = []
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
    this._visBuf = [] // 렌더용 화면 내 적 목록(매 프레임 재사용, GC 회피)

    // 그리드 셀은 가장 큰 적(보스)이 들어갈 만큼은 되어야 한다
    this.grid = new Grid(W, H, 56)
    this.queryBuf = []

    this.buildBackground()

    // 월드 레이어 — 모든 월드 오브젝트를 담아 매 프레임 플레이어 반대로 옮긴다.
    // 이러면 플레이어는 항상 화면 중앙에 보이고, HUD/조이스틱은 화면 좌표
    // 그대로 두면 된다(카메라 무관). 게임 로직 좌표는 전부 월드 좌표.
    this.worldLayer = this.add.container(0, 0).setDepth(1)

    this.gfxEnemies = this.add.graphics() // 바닥 그림자 + 보스 돔 + 체력바
    // 일반 적은 Blitter(스프라이트 배치 렌더) 로 한 번에 그린다 — 300마리도
    // GameObject 하나(Blitter)만 관리, 개별 Bob 은 화면 내 적 수만큼만 재사용.
    this.enemyBlitter = this.add.blitter(0, 0, 'enemies')
    this.enemyBobs = [] // Bob 풀(재사용, GC 회피)
    if (this.textures.exists('enemies') && this.textures.get('enemies').setFilter) {
      this.textures.get('enemies').setFilter(Phaser.Textures.FilterMode.NEAREST)
    }
    this.gfxEnemyTop = this.add.graphics() // 스프라이트 위 오버레이(피격 플래시·화상)
    this.gfxArrows = this.add.graphics()
    this.gfxFx = this.add.graphics()
    this.gfxChar = this.add.graphics() // 플레이어 음영 오브(iso 스타일)

    // 플레이어 좌표 앵커 — 원은 숨기고 gfxChar 로 음영 오브를 그린다
    this.player = this.add
      .circle(W / 2, H / 2, this.stats.player.radius, COLOR_PLAYER)
      .setVisible(false)

    // 렌더 순서: 그림자/보스 → 적 스프라이트 → 플래시·화상 → 화살/이펙트 → 플레이어
    this.worldLayer.add([
      this.gfxEnemies,
      this.enemyBlitter,
      this.gfxEnemyTop,
      this.gfxArrows,
      this.gfxFx,
      this.gfxChar,
      this.player,
    ])

    this.setupPlayerSprite()

    this.buildHud()
    this.setupInput()
    this.setupGrowth()

    // 레벨업 3택 카드 (뱀서 표준). 성장 화면은 보류.
    this.levelup = createLevelupScreen({ onPick: (c) => this.onCardPick(c) })
    // 룬 획득/장착 (보스 처치)
    this.runeScreen = createRuneScreen({ onEquip: (r, s) => this.onRuneEquip(r, s) })
    // 성장(스킬트리) 버튼 숨김 — 진행은 카드로.
    if (this.growthBtn) this.growthBtn.setVisible(false)
    if (this.growthBtnText) this.growthBtnText.setVisible(false)
  }

  // 카드 패시브 스택 → 배율 보너스 객체 (deriveStats에 전달)
  cardBonusObj() {
    const cp = this.cardPassives || {}
    return {
      dmg: (cp.dmg || 0) * CARD_PASSIVES.dmg.step,
      move: (cp.move || 0) * CARD_PASSIVES.move.step,
      hp: (cp.hp || 0) * CARD_PASSIVES.hp.step,
      atkSpeed: (cp.atkSpeed || 0) * CARD_PASSIVES.atkSpeed.step,
    }
  }

  // 레벨업 카드 3장 생성 (스킬 신규/레벨업 + 패시브)
  buildCards() {
    const ids = Object.keys(CARD_SKILLS)
    const ownedCount = ids.filter((id) => (this.skillLevels[id] || 0) > 0).length
    const opts = []
    for (const id of ids) {
      const lv = this.skillLevels[id] || 0
      const max = ACTIVE_SKILLS[id] ? ACTIVE_SKILLS[id].maxLevel : 10
      const m = CARD_SKILLS[id]
      if (lv > 0) {
        if (lv < max)
          opts.push({ kind: 'up', id, icon: m.icon, name: m.name, desc: m.desc, tag: `Lv ${lv}→${lv + 1}` })
      } else if (ownedCount < MAX_ACTIVE - 1) {
        opts.push({ kind: 'new', id, icon: m.icon, name: m.name, desc: m.desc })
      }
    }
    for (const id in CARD_PASSIVES) {
      const m = CARD_PASSIVES[id]
      const st = this.cardPassives[id] || 0
      const cur = st ? ` (현재 +${Math.round(st * m.step * 100)}%)` : ''
      opts.push({ kind: 'pas', id, icon: m.icon, name: m.name, desc: m.desc + cur })
    }
    // 섞어서 3장
    for (let i = opts.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0
      ;[opts[i], opts[j]] = [opts[j], opts[i]]
    }
    return opts.slice(0, 3)
  }

  applyCard(card) {
    if (card.kind === 'pas') {
      this.cardPassives[card.id] = (this.cardPassives[card.id] || 0) + 1
    } else {
      this.skillLevels[card.id] = (this.skillLevels[card.id] || 0) + 1
    }
    this.recompute()
  }

  // 대기 중인 모달을 순서대로 연다 (레벨업 카드 → 룬). 하나 닫힐 때마다 호출.
  maybeOpenModal() {
    if (this.gameOver || this.levelupOpen || this.runeOpen) return
    if (this._pendingLevels > 0) {
      this.levelupOpen = true
      this.releaseStick()
      this.levelup.show(this.level, this.buildCards())
      return
    }
    if (this._pendingRune) {
      this._pendingRune = false
      this.openRuneDrop()
    }
  }

  onCardPick(card) {
    this.applyCard(card)
    this._pendingLevels--
    this.levelupOpen = false
    this.maybeOpenModal() // 남은 레벨 or 대기 룬
  }

  // --- 룬 (보스 처치) ---
  openRuneDrop() {
    this.runeOpen = true
    this.releaseStick()
    const runes = this.buildRuneChoices().map((id) => ({ id, ...RUNES[id] }))
    this.runeScreen.show(runes, this.buildRuneSkillList())
  }

  buildRuneChoices() {
    const pool = [...RUNE_POOL]
    for (let i = pool.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    return pool.slice(0, Math.min(3, pool.length))
  }

  buildRuneSkillList() {
    const list = [{ id: 'basic', name: '기본 사격', icon: '🎯' }]
    for (const id in CARD_SKILLS) {
      if ((this.skillLevels[id] || 0) > 0)
        list.push({ id, name: CARD_SKILLS[id].name, icon: CARD_SKILLS[id].icon })
    }
    return list.map((s) => ({
      ...s,
      curRune: this.runeSlots[s.id] ? RUNES[this.runeSlots[s.id]].name : '',
    }))
  }

  onRuneEquip(runeId, skillId) {
    this.runeSlots[skillId] = runeId
    this.recompute()
    this.runeOpen = false
    this.maybeOpenModal()
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
    // 성장(스킬트리) 화면 보류 — 진행은 레벨업 카드로. (코드는 남겨둠)
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
    this.stats = deriveStats(
      this.cfg, this.attributes, this.skillLevels, this.specs,
      this.cardBonusObj(), this.runeSlots
    )
    const gained = this.stats.player.maxHp - prevMax
    if (gained > 0) this.hp += gained
    this.hp = Math.min(this.hp, this.stats.player.maxHp)
    this.refreshHpBar()
  }

  // --- 배경: 아이소 던전 바닥 (iso_topdown 스타일) --------------------------
  // 스크린 캔버스 텍스처에 매 프레임 아이소 타일을 다시 그린다(플레이어 이동 시만).
  // 게임 로직은 그대로 탑다운 월드 좌표 — 바닥만 아이소 스킨.

  buildBackground() {
    this._isoR = Math.ceil((W / 64 + H / 32) / 2) + 2
    this._lastCamX = null
    this._lastCamY = null

    // 타일/데칼 이미지 — preload 에서 이미 디코딩됨. 텍스처 매니저의
    // HTMLImageElement 를 꺼내 ctx.drawImage 에 쓴다(플레이 중 디코딩 튐 없음).
    this.floorSheet = this.textures.exists('isotileset')
      ? this.textures.get('isotileset').getSourceImage()
      : new Image()
    this.floorDec = this.textures.exists('isodecals')
      ? this.textures.get('isodecals').getSourceImage()
      : new Image()

    const tex = this.textures.exists('isofloor')
      ? this.textures.get('isofloor')
      : this.textures.createCanvas('isofloor', W, H)
    this.floorCanvas = tex
    this.floorCtx = tex.context
    this.add.image(0, 0, 'isofloor').setOrigin(0).setDepth(-5)

    // 던전 비네트(정적, 1회 굽기)
    if (!this.textures.exists('isovig')) {
      const vt = this.textures.createCanvas('isovig', W, H)
      const vc = vt.context
      const rg = vc.createRadialGradient(
        W / 2, H / 2, Math.min(W, H) * 0.32,
        W / 2, H / 2, Math.max(W, H) * 0.62
      )
      rg.addColorStop(0, 'rgba(0,0,0,0)')
      rg.addColorStop(1, 'rgba(5,7,11,0.5)')
      vc.fillStyle = rg
      vc.fillRect(0, 0, W, H)
      vt.refresh()
    }
    this.add.image(0, 0, 'isovig').setOrigin(0).setDepth(5)
  }

  updateBackground() {
    const px = this.player.x
    const py = this.player.y
    // 플레이어가 안 움직였으면 바닥 재그리기/업로드 생략 (최적화)
    if (px === this._lastCamX && py === this._lastCamY) return
    this._lastCamX = px
    this._lastCamY = py

    const ctx = this.floorCtx
    ctx.fillStyle = '#0b0e13' // 그루트(틈) 색
    ctx.fillRect(0, 0, W, H)

    const sheet = this.floorSheet
    if (sheet.complete && sheet.naturalWidth) {
      const dec = this.floorDec
      const decOk = dec.complete && dec.naturalWidth
      const TW = 128, TH = 64, N = 16, DS = 64, DN = 8
      const ox = W / 2 - px
      const oy = H / 2 - py
      const cc = (px / (TW / 2) + py / (TH / 2)) / 2
      const rr = (py / (TH / 2) - px / (TW / 2)) / 2
      const R = this._isoR
      for (let r = Math.floor(rr - R); r <= rr + R; r++) {
        for (let c = Math.floor(cc - R); c <= cc + R; c++) {
          const sx = ox + (c - r) * (TW / 2) - TW / 2
          const sy = oy + (c + r) * (TH / 2) - TH / 2
          if (sx < -TW || sx > W || sy < -TH || sy > H) continue
          const hv = ((c * 73856093) ^ (r * 19349663)) >>> 0
          const k = hv % N
          if ((hv >> 8) & 1) {
            ctx.save()
            ctx.translate(sx + TW, sy)
            ctx.scale(-1, 1)
            ctx.drawImage(sheet, k * TW, 0, TW, TH, 0, 0, TW, TH)
            ctx.restore()
          } else {
            ctx.drawImage(sheet, k * TW, 0, TW, TH, sx, sy, TW, TH)
          }
          if (decOk) {
            // 데칼 뭉치기 — 구역마다 밀도 차이(어수선/보통/깨끗)
            const rh = (((c >> 2) * 92837111) ^ ((r >> 2) * 689287499)) >>> 0
            const gate = rh % 4 === 0 ? 3 : rh % 4 === 1 ? 7 : 13
            if (hv % gate === 0) {
              const dk = (hv >> 12) % DN
              ctx.drawImage(dec, dk * DS, 0, DS, DS, sx + 32, sy, DS, DS)
            }
          }
        }
      }

      // 넓은 구역 명암 (단조로움 완화) — 좌표 해시 기반, 스크롤해도 일관
      const REG = 360
      const gx0 = Math.floor((px - W) / REG)
      const gx1 = Math.floor((px + W) / REG)
      const gy0 = Math.floor((py - H) / REG)
      const gy1 = Math.floor((py + H) / REG)
      for (let gy = gy0; gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          const h = ((gx * 374761393) ^ (gy * 668265263)) >>> 0
          if (h % 3 === 0) continue // 일부 구역은 변화 없음
          const cxw = gx * REG + ((h >> 3) % REG)
          const cyw = gy * REG + ((h >> 13) % REG)
          const bx = cxw - px + W / 2
          const by = cyw - py + H / 2
          const rad = REG * (0.55 + ((h >> 5) % 35) / 100)
          if (bx + rad < 0 || bx - rad > W || by + rad < 0 || by - rad > H) continue
          const rg = ctx.createRadialGradient(bx, by, 0, bx, by, rad)
          if (h & 1) {
            rg.addColorStop(0, `rgba(4,6,10,${0.1 + ((h >> 7) % 13) / 100})`) // 그늘
          } else {
            rg.addColorStop(0, `rgba(150,162,205,${0.05 + ((h >> 7) % 8) / 100})`) // 은은한 빛
          }
          rg.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.fillStyle = rg
          ctx.fillRect(bx - rad, by - rad, rad * 2, rad * 2)
        }
      }
      // 위/아래 깊이 어두움
      const gt = ctx.createLinearGradient(0, 0, 0, 150)
      gt.addColorStop(0, 'rgba(6,8,12,0.55)')
      gt.addColorStop(1, 'rgba(6,8,12,0)')
      ctx.fillStyle = gt
      ctx.fillRect(0, 0, W, 150)
      const gb = ctx.createLinearGradient(0, H, 0, H - 150)
      gb.addColorStop(0, 'rgba(6,8,12,0.55)')
      gb.addColorStop(1, 'rgba(6,8,12,0)')
      ctx.fillStyle = gb
      ctx.fillRect(0, H - 150, W, 150)
    }
    this.floorCanvas.refresh()
  }

  // --- 캐릭터 스프라이트 (동작 애니) --------------------------------------

  setupPlayerSprite() {
    this.playerSprite = null
    // 시트가 정상 로드되지 않았으면 폴백(음영 오브)으로 둔다
    if (!this.textures.exists('archer')) return
    const tex = this.textures.get('archer')
    if (tex.frameTotal < 50) return // 로드 실패(플레이스홀더) 방어 — 정상은 56+
    if (tex.setFilter) tex.setFilter(Phaser.Textures.FilterMode.NEAREST) // 픽셀 또렷하게

    // skip: 루프 첫 프레임 제외. run·back_run은 0번이 "정지 포즈"라 빼야
    // 루프가 매번 서는 것처럼 안 보인다.
    const defs = {
      idle: { row: 0, frames: 4, fps: 6, loop: true },
      run: { row: 1, frames: 6, fps: 12, loop: true, skip: 1 },
      back_run: { row: 2, frames: 8, fps: 12, loop: true, skip: 1 },
      attack: { row: 3, frames: 4, fps: 14, loop: false },
      multishot: { row: 4, frames: 5, fps: 14, loop: false },
      hit: { row: 5, frames: 2, fps: 10, loop: false },
      death: { row: 6, frames: 5, fps: 10, loop: false },
    }
    for (const key in defs) {
      if (this.anims.exists(key)) continue
      const d = defs[key]
      const rowStart = d.row * 8 // 프레임 = 행*8 + 열
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers('archer', {
          start: rowStart + (d.skip || 0),
          end: rowStart + d.frames - 1,
        }),
        frameRate: d.fps,
        repeat: d.loop ? -1 : 0,
      })
    }

    const scale = this.cfg.player.spriteScale || PLAYER_SPRITE_SCALE
    this._bowOffsetY = SPRITE_H * scale * 0.4 // 화살 발사(활) 높이
    this.playerSprite = this.add
      .sprite(this.player.x, this.player.y, 'archer', 0)
      .setOrigin(0.5, 0.8) // 발끝 하단 정렬
      .setScale(scale)
    // 림라이트(외곽 발광) — 어두운 바닥에 캐릭터가 묻히지 않게 실루엣을 띄운다.
    // Phaser 내장 GPU FX 라 실루엣을 정확히 따라가고 값이 싸다. (WebGL 전용, 폴백 가드)
    if (this.playerSprite.postFX) {
      this.playerSprite.postFX.addGlow(0xbfe4ff, 4, 0, false, 0.1, 10)
    }
    this.worldLayer.add(this.playerSprite)
    this.animKey = 'idle'
    this.playerSprite.play('idle')
  }

  updatePlayerAnim(vx, vy) {
    const sp = this.playerSprite
    if (!sp || this.animKey === 'death') return
    const moving = Math.abs(vx) + Math.abs(vy) > 0.05
    const key = !moving ? 'idle' : vy < -0.35 ? 'back_run' : 'run'
    if (Math.abs(vx) > 0.05) sp.setFlipX(vx < 0) // 왼쪽 이동 시 미러
    if (this.animKey !== key) {
      this.animKey = key
      sp.play(key, true)
    }
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

    // 개발용 수치 3종(fps·속도/DMG·능력치)은 ?dev 일 때만 만든다.
    // 플레이어 화면에선 숨기고(혼동 방지), 개발 중엔 URL 로 켠다.
    if (DEV_HUD) {
      this.perfText = this.add
        .text(W - 20, H - 20, '', { ...font, fontSize: '13px', color: '#6c7086' })
        .setOrigin(1, 1)
        .setDepth(d)

      // 두 기기가 같은 값을 쓰는지 눈으로 비교하기 위한 표시.
      this.statText = this.add
        .text(20, H - 20, '', { ...font, fontSize: '13px', color: '#6c7086' })
        .setOrigin(0, 1)
        .setDepth(d)

      // 능력치 요약 (좌상단, 레벨 아래) — 룬 피벗으로 보류(전부 0)라 기본 숨김
      this.attrHudText = this.add
        .text(20, 74, '', { ...font, fontSize: '13px', color: '#94e2d5' })
        .setDepth(d)
    } else {
      this.perfText = this.statText = this.attrHudText = null
    }

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
    if (this.attrHudText) {
      const a = this.attributes
      this.attrHudText.setText(
        `힘 ${a.str}  민 ${a.dex}  지 ${a.int}  활 ${a.vit}`
      )
    }

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
      if (this.userPaused || this.growthOpen || this.levelupOpen || this.runeOpen) return

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
    e.stun = 0 // 피격 경직 남은 시간(초)
    e.burn = null // 화상 도트 {dps,time}
    e.flash = 0
    e.wob = Math.random() * Math.PI * 2 // 유기적 흔들림 위상
    e.animOff = (Math.random() * 4) | 0 // 걷기 프레임 위상(개체별 어긋나게)
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
  // 화살 발사·조준 기준 y (팔/활 높이). 스프라이트일 때만 위로 올림.
  get bowY() {
    return this.player.y - (this.playerSprite ? this._bowOffsetY : 0)
  }

  fireAngle(angle, dmg, pierce, skill, burn) {
    const w = this.stats.weapon
    const a = this.arrowPool.pop() || { hit: new Set() }
    a.x = this.player.x
    a.y = this.bowY // 팔/활 높이에서 발사
    a.vx = Math.cos(angle) * w.speed
    a.vy = Math.sin(angle) * w.speed
    a.angle = angle
    a.pierceLeft = pierce ?? w.pierce
    a.dmg = dmg
    a.skill = !!skill // 렌더 색 구분 (시각 전용)
    a.burn = !!burn // 화상 룬
    a.hit.clear()
    this.arrows.push(a)
  }

  fireAt(target) {
    const angle = Math.atan2(target.y - this.bowY, target.x - this.player.x)
    const w = this.stats.weapon
    const dmg = w.damage
    this.fireAngle(angle, dmg, undefined, false, w.burn)
    // 민첩30 추가 화살 — 살짝 벌려서 발사
    const extra = w.extraArrows || 0
    for (let i = 1; i <= extra; i++) {
      const off = 0.12 * Math.ceil(i / 2) * (i % 2 ? 1 : -1)
      this.fireAngle(angle + off, dmg, undefined, false, w.burn)
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
    // 부채꼴 \||/ — 균등 각도로 한 번에 쫙 발사
    const base = Math.atan2(target.y - this.bowY, target.x - this.player.x)
    const spread = Phaser.Math.DegToRad(this.cfg.skill.multishotSpread) * st.spreadMul
    const n = st.shots
    for (let i = 0; i < n; i++) {
      const frac = n <= 1 ? 0.5 : i / (n - 1) // 0..1
      this.fireAngle(base + (frac - 0.5) * spread, st.dmg, st.pierce, true, st.burn)
    }
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
    const target = this.nearestEnemy()
    if (!target) return false
    const bx = this.player.x
    const by = this.bowY
    for (let i = 0; i < st.count; i++) {
      // 대상 방향으로, 최대 사거리 안쪽(적정 거리)에 착탄. 여러 개면 살짝 흩뿌림.
      const dx = target.x - bx
      const dy = target.y - by
      const d = Math.hypot(dx, dy) || 1
      const reach = Math.min(d, GRENADE_MAX)
      const jx = (Math.random() - 0.5) * st.radius * 1.1
      const jy = (Math.random() - 0.5) * st.radius * 1.1
      this.spawnGrenade(bx, by, bx + (dx / d) * reach + jx, by + (dy / d) * reach + jy, st.radius, st.dmg, st.burn)
    }
    this.flashSkill(0xf9e2af)
    return true
  }

  spawnGrenade(x, y, tx, ty, radius, dmg, burn) {
    const g = this.grenadePool.pop() || {}
    g.sx = x; g.sy = y; g.x = x; g.y = y
    g.tx = tx; g.ty = ty
    g.t = 0; g.radius = radius; g.dmg = dmg; g.burn = !!burn
    this.grenades.push(g)
  }

  updateGrenades(dt) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i]
      g.t += dt
      const k = Math.min(1, g.t / GRENADE_DUR)
      g.x = g.sx + (g.tx - g.sx) * k
      g.y = g.sy + (g.ty - g.sy) * k
      if (g.t >= GRENADE_DUR) {
        this.explodeAt(g.tx, g.ty, g.radius, g.dmg, g.burn) // 착탄 시 폭발
        this.removeSwap(this.grenades, i, this.grenadePool)
      }
    }
  }

  // 연사/지속 진행 — 매 프레임 간격만큼 차면 발사한다
  updateBursts(dt) {
    // 간격이 0 이하면 난사 while 루프가 무한 반복 → 최소값으로 클램프(프리즈 방지)
    const iv = Math.max(0.02, this.cfg.skill.shotInterval)
    // (다발사격은 triggerMultishot에서 한 번에 부채꼴 발사)

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
          Math.atan2(t.y - this.bowY, t.x - this.player.x),
          st.dmg,
          st.pierce,
          true,
          st.burn
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
        this.fireAngle(Math.random() * Math.PI * 2, st.dmg, st.pierce, true, st.burn)
      }
    }
  }

  explodeAt(x, y, r, dmg, burn) {
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
      this.damageEnemy(e, dmg, dx / d, dy / d, burn)
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

  damageEnemy(e, amount, dirX, dirY, burn) {
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
    // 피격 경직 — 잠깐 정지(보스 제외). config로 조절. SET이라 누적 없음.
    if (!e.boss) e.stun = this.cfg.enemy.hitStunSec

    // 화상 룬 — 명중 시 도트 부여(더 센 도트면 갱신, 아니면 지속만 새로고침)
    if (burn) {
      const dps = amount * BURN_PCT
      if (!e.burn || dps > e.burn.dps) e.burn = { dps, time: BURN_DUR }
      else e.burn.time = BURN_DUR
    }

    // 데미지 숫자 (머리 위). 크리는 크고 금색.
    this.spawnPopup(e.x, e.y - e.r - 6, Math.max(1, Math.round(amount)), crit)
    // 크리 시 살짝 흔들림 — 스웜에서 과하지 않게 쿨다운
    if (crit && this.elapsed - this._lastCritShake > 0.15) {
      this._lastCritShake = this.elapsed
      this.cameras.main.shake(60, 0.0035)
    }

    if (e.hp <= 0) this.killEnemy(e)
  }

  // 적 처치 처리 (직격/폭발/화상 도트 공용)
  killEnemy(e) {
    // 같은 프레임에 두 번 처치되는 경우 방어(화살 2발·관통·폭발·화상 겹침).
    // indexOf 가 -1 이면 removeSwap 이 살아있는 마지막 적을 잘못 빼내 배열이
    // 깨지고 킬/룬이 중복된다 — 이미 제거됐으면 바로 반환.
    const idx = this.enemies.indexOf(e)
    if (idx < 0) return
    const c = this.stats.combat
    const ex = e.x
    const ey = e.y
    const wasBoss = e.boss

    // 사망 파편 — 적 색으로 튀어나가며 사라짐
    const col = e.boss
      ? COLOR_BOSS
      : e.type === 'rusher'
        ? COLOR_RUSHER
        : e.type === 'shooter'
          ? COLOR_SHOOTER
          : COLOR_ENEMY
    this.spawnParticles(ex, ey, e.boss ? 20 : 9, col, e.boss ? 240 : 170, e.boss ? 4 : 3, 0.45)
    if (wasBoss) this.cameras.main.shake(160, 0.006)
    this.removeSwap(this.enemies, idx, this.enemyPool)
    this.kills++
    this.killText.setText('Kills: ' + this.kills)
    this.gainXp(e.gems * this.cfg.xp.gemValue)

    // 보스 처치 → 룬 드랍 (레벨업 카드가 있으면 그 다음에 순서대로)
    if (wasBoss) {
      this._pendingRune = true
      this.maybeOpenModal()
    }

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
    // 뱀서 표준: 레벨업 → 정지 후 3택 카드. (능력치/스킬포인트 지급 보류)
    this.lvText.setText('Lv ' + this.level)
    this._pendingLevels = (this._pendingLevels || 0) + levels
    this.maybeOpenModal()
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
    const blinkTarget = this.playerSprite || this.player
    this.tweens.add({
      targets: blinkTarget,
      alpha: 0.3,
      duration: 80,
      yoyo: true,
      repeat: 1,
      onComplete: () => blinkTarget.setAlpha(1),
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
    // 사망 애니 재생 (스프라이트)
    if (this.playerSprite) {
      this.animKey = 'death'
      this.playerSprite.play('death')
    }
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
    if (this.gameOver || this.userPaused || this.growthOpen || this.levelupOpen || this.runeOpen) return
    // 한 프레임에서 오류가 나도 게임 루프 전체가 멈추지 않게(프리즈 방지) +
    // 원인을 콘솔에 한 번 남긴다(진단).
    try {
      this.step(delta)
    } catch (err) {
      if (!this._loggedErr) {
        this._loggedErr = true
        // eslint-disable-next-line no-console
        console.error('[update 오류 — 이 메시지를 개발자에게 전달]', err)
      }
    }
  }

  step(delta) {
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
    // 간격이 0 이하/비정상이면 while 무한루프 → 최소값으로 클램프(프리즈 방지)
    const interval = Math.max(0.02, this.cfg.spawn.baseInterval / mult)
    while (this.spawnAcc >= interval) {
      this.spawnAcc -= interval
      this.spawnEnemy()
    }

    this.bossAcc += dt
    // 첫 보스만 firstBossSec 로 앞당김(룬 조기 경험). 이후는 everySec 간격.
    const bossEvery =
      this.bossCount === 0 ? this.cfg.boss.firstBossSec : this.cfg.boss.everySec
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

    if (this.playerSprite) {
      this.playerSprite.setPosition(this.player.x, this.player.y)
      this.updatePlayerAnim(vx, vy)
    }

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
    this.updateGrenades(dt)
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

    if (this.perfText) {
      this.perfText.setText(
        `${Math.round(this.game.loop.actualFps)} fps  ·  적 ${this.enemies.length}`
      )
      this.statText.setText(
        `내속도 ${Math.round(this.stats.player.speed)}  ·  적속도 ${this.cfg.enemy.speed}  ·  DMG ${this.stats.weapon.damage}`
      )
    }
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
        // 화살 타격 스파크 — 짧은 직선이 희미하게 퍼짐
        this.spawnSpark(a.x, a.y)
        this.damageEnemy(e, a.dmg, a.vx / len, a.vy / len, a.burn)

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

      // 너무 멀어진 적은 제거 (보스는 예외 — 접근 전에 사라지지 않게)
      if (!e.boss && dx * dx + dy * dy > despawn2) {
        this.removeSwap(this.enemies, i, this.enemyPool)
        i--
        continue
      }

      // 화상 도트 — 지속 동안 초당 피해, 도트로 죽으면 처치 처리
      if (e.burn && e.burn.time > 0) {
        e.burn.time -= dt
        e.hp -= e.burn.dps * dt
        if (e.hp <= 0) {
          this.killEnemy(e)
          i--
          continue
        }
      }

      // 피격 경직 — 이동/추격/분리/공격 전부 정지 (플래시·넉백만 감쇠)
      if (e.stun > 0) {
        e.stun -= dt
        if (e.flash > 0) e.flash -= dt
        e.kbx *= decay
        e.kby *= decay
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

      // 보스 러버밴딩 — 화면 밖으로 벗어나면 플레이어보다 빠르게 좁혀 접근시킨다
      // (보스는 despawn 예외라, 느리면 영영 못 따라와 "메세지만 뜨고 안 보임"이 됨)
      let espeed = e.speed
      if (e.boss && dx * dx + dy * dy > BOSS_LEASH * BOSS_LEASH) {
        espeed = Math.max(e.speed, this.stats.player.speed * BOSS_CATCHUP)
      }

      e.x += mvx * espeed * dt + sx * sepStr * dt + e.kbx * dt
      e.y += mvy * espeed * dt + sy * sepStr * dt + e.kby * dt
      e.kbx *= decay
      e.kby *= decay
      if (e.flash > 0) e.flash -= dt

      // 플레이어 겹침 방지 — 접촉 반경 안으로 파고들면 가장자리로 밀어냄
      const minD = pr + e.r
      const odx = e.x - px
      const ody = e.y - py
      const od2 = odx * odx + ody * ody
      if (od2 < minD * minD) {
        const od = Math.sqrt(od2)
        const ux = od > 0.001 ? odx / od : 1
        const uy = od > 0.001 ? ody / od : 0
        e.x = px + ux * minD
        e.y = py + uy * minD
      }

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

      // 가장자리에 닿아 있으면(겹침 방지로 딱 붙은 상태 포함) 접촉 피해
      const touch = pr + e.r
      if (dx * dx + dy * dy <= touch * touch && e.dmg > incoming) {
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

  // 사각형 파편 (사망 등). gfxFx 에 fillRect.
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
      p.kind = 'rect'
      this.particles.push(p)
    }
  }

  // 타격 스파크 — 타격 지점에서 짧은 직선이 희미하게 퍼짐(사망 원퍼짐과 구분).
  spawnSpark(x, y) {
    const n = 5
    for (let k = 0; k < n; k++) {
      if (this.particles.length >= MAX_PARTICLES) return
      const a = Math.random() * Math.PI * 2
      const s = 130 + Math.random() * 150
      const p = this.partPool.pop() || {}
      p.x = x
      p.y = y
      p.vx = Math.cos(a) * s
      p.vy = Math.sin(a) * s
      p.nx = Math.cos(a) // 선 방향(꼬리는 반대쪽으로)
      p.ny = Math.sin(a)
      p.life = 0.1 + Math.random() * 0.08
      p.max = p.life
      p.color = 0xffffff
      p.size = 7 + Math.random() * 5 // 선 길이
      p.kind = 'line'
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

    // 화면 밖 적은 그리지 않는다(컬링) — 최대 300마리를 8패스로 다 그리면
    // 수가 늘 때 급격히 무거워진다. 화면 안 + 여유(보스 반경)만 남긴다.
    const px = this.player.x
    const py = this.player.y
    const cullX = W / 2 + 40
    const cullY = H / 2 + 40
    const es = this._visBuf
    es.length = 0
    const all = this.enemies
    for (let i = 0; i < all.length; i++) {
      const e = all[i]
      if (Math.abs(e.x - px) <= cullX && Math.abs(e.y - py) <= cullY) es.push(e)
    }

    // 1) 바닥 그림자 (전체·보스 포함) — 접지감
    ge.fillStyle(0x000000, 0.38)
    for (let i = 0; i < es.length; i++) {
      const e = es[i]
      ge.fillEllipse(e.x, e.y + e.r * 0.9, e.r * 1.9, e.r * 0.9)
    }

    // 2) 일반 적 — Blitter 스프라이트(타입=행[고블린/사냥개/궁수], 걷기=열).
    //    Bob 은 화면 내 적 수만큼만 재사용하고 나머지는 숨긴다(GC·드로우콜 최소).
    const bobs = this.enemyBobs
    const walk = Math.floor(this.elapsed * 8)
    let bi = 0
    for (let i = 0; i < es.length; i++) {
      const e = es[i]
      if (e.boss) continue
      let bob = bobs[bi]
      if (!bob) {
        bob = this.enemyBlitter.create(0, 0, 0)
        bobs[bi] = bob
      }
      const row = e.type === 'rusher' ? 1 : e.type === 'shooter' ? 2 : 0
      bob.setFrame(row * 4 + ((walk + e.animOff) & 3))
      bob.x = e.x - 16
      bob.y = e.y - 24
      bob.setFlipX(px < e.x) // 플레이어를 바라보게
      bob.visible = true
      bi++
    }
    for (let k = bi; k < bobs.length; k++) bobs[k].visible = false

    // 3) 스프라이트 위 오버레이 — 일반 적 피격 플래시(흰) + 화상(주황), 그리고 보스(돔)
    const gt = this.gfxEnemyTop
    gt.clear()
    gt.fillStyle(COLOR_ENEMY_HIT, 0.55)
    for (let i = 0; i < es.length; i++) {
      const e = es[i]
      if (e.boss || e.flash <= 0) continue
      gt.fillCircle(e.x, e.y - e.r * 0.4, e.r * 1.15)
    }
    gt.fillStyle(0xf0963c, 0.35)
    for (let i = 0; i < es.length; i++) {
      const e = es[i]
      if (e.boss || !e.burn || e.burn.time <= 0) continue
      const flick = 0.7 + 0.3 * Math.sin(this.elapsed * 22 + e.x)
      gt.fillCircle(e.x, e.y - e.r * 0.3, e.r * (1.0 + 0.15 * flick))
    }

    // 4) 보스 — 스프라이트와 구분되게 보라 돔(입체+눈)으로 따로, 스프라이트 위에 그려
    //    존재감을 준다. 체력바도 여기(위층)라 다른 적에 가리지 않는다.
    for (let i = 0; i < es.length; i++) {
      const e = es[i]
      if (!e.boss) continue
      gt.fillStyle(0x0c0c12, 1)
      gt.fillCircle(e.x, e.y, e.r)
      gt.fillStyle(e.flash > 0 ? COLOR_ENEMY_HIT : COLOR_BOSS, 1)
      gt.fillCircle(e.x - e.r * 0.12, e.y - e.r * 0.14, e.r * (e.flash > 0 ? 1.05 : 0.9))
      if (e.flash <= 0) {
        gt.fillStyle(0xffffff, 0.18)
        gt.fillCircle(e.x - e.r * 0.34, e.y - e.r * 0.4, e.r * 0.32)
        gt.fillStyle(0x101018, 0.92)
        const eyY = e.y - e.r * 0.2
        const eyX = e.r * 0.34
        const eyR = Math.max(1.2, e.r * 0.17)
        gt.fillCircle(e.x - eyX, eyY, eyR)
        gt.fillCircle(e.x + eyX, eyY, eyR)
      }
      if (e.burn && e.burn.time > 0) {
        const flick = 0.7 + 0.3 * Math.sin(this.elapsed * 22 + e.x)
        gt.fillStyle(0xf0963c, 0.35)
        gt.fillCircle(e.x, e.y - e.r * 0.15, e.r * (0.95 + 0.15 * flick))
      }
      const bw = e.r * 2.4
      const bx = e.x - bw / 2
      const by = e.y - e.r - 12
      gt.fillStyle(0x313244, 1)
      gt.fillRect(bx, by, bw, 5)
      gt.fillStyle(0xf38ba8, 1)
      gt.fillRect(bx, by, bw * Math.max(0, e.hp / e.maxHp), 5)
    }

    const ga = this.gfxArrows
    ga.clear()
    // 기본 활(주황)과 스킬 발사체(하늘색)를 색으로 구분 — 각각 한 번에 스트로크
    for (let pass = 0; pass < 2; pass++) {
      const skillPass = pass === 1
      ga.lineStyle(skillPass ? 2.5 : 2, skillPass ? COLOR_SKILL_ARROW : COLOR_ARROW, 1)
      ga.beginPath()
      for (let i = 0; i < this.arrows.length; i++) {
        const a = this.arrows[i]
        if (!!a.skill !== skillPass) continue
        const cx = Math.cos(a.angle) * 10
        const cy = Math.sin(a.angle) * 10
        ga.moveTo(a.x - cx, a.y - cy)
        ga.lineTo(a.x + cx, a.y + cy)
      }
      ga.strokePath()
    }

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

    // 날아가는 수류탄 (포물선) — 바닥 그림자 + 솟았다 떨어지는 본체
    gf.fillStyle(0x000000, 0.3)
    for (let i = 0; i < this.grenades.length; i++) {
      const g = this.grenades[i]
      gf.fillEllipse(g.x, g.y, 9, 4.5) // 착탄 지점 따라오는 그림자
    }
    gf.fillStyle(0xf9e2af, 1)
    for (let i = 0; i < this.grenades.length; i++) {
      const g = this.grenades[i]
      const k = g.t / GRENADE_DUR
      const h = Math.sin(Math.PI * Math.min(1, k)) * GRENADE_ARC // 포물선 높이
      gf.fillCircle(g.x, g.y - h, 5)
    }

    // 사망 파편 — 사각형, 남은 수명만큼 옅어짐
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]
      if (p.kind === 'line') continue
      const k = p.life / p.max
      gf.fillStyle(p.color, k)
      gf.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2)
    }
    // 타격 스파크 — 짧은 직선(꼬리는 진행 반대쪽), 희미하게
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]
      if (p.kind !== 'line') continue
      const k = p.life / p.max
      gf.lineStyle(2, p.color, k * 0.55)
      gf.beginPath()
      gf.moveTo(p.x, p.y)
      gf.lineTo(p.x - p.nx * p.size, p.y - p.ny * p.size)
      gf.strokePath()
    }

    // 플레이어 — 스프라이트면 발밑 그림자만, 아니면 폴백 음영 오브
    const gp = this.gfxChar
    gp.clear()
    const pr = this.stats.player.radius
    if (this.playerSprite) {
      gp.fillStyle(0x000000, 0.4)
      gp.fillEllipse(px, py + pr * 0.5, pr * 2.2, pr * 1.0) // 발밑 그림자
    } else {
      gp.fillStyle(COLOR_PLAYER, 0.16)
      gp.fillCircle(px, py, pr * 1.9)
      gp.fillStyle(0x000000, 0.4)
      gp.fillEllipse(px, py + pr * 0.95, pr * 2.1, pr * 1.0)
      gp.fillStyle(0x8fd0ff, 1)
      gp.fillCircle(px, py, pr)
      gp.lineStyle(2, 0xcdd6f4, 0.9)
      gp.strokeCircle(px, py, pr)
      gp.fillStyle(0xeaf6ff, 1)
      gp.fillCircle(px - pr * 0.32, py - pr * 0.32, pr * 0.34)
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
