// 자동 시뮬레이터 코어 — 렌더 없이 게임 한 판을 봇이 자동 플레이한다.
//
// main.js 의 게임 로직을 그대로 옮긴 순수 계산본이다. Phaser·캔버스에 의존하지
// 않아 브라우저에서 초당 수십 판을 돌릴 수 있다.
//
// ⚠ main.js 의 전투/스폰/성장 수식을 바꾸면 이 파일도 같이 고쳐야 결과가
//   실제 게임과 일치한다. (지금은 두 곳이 동일)
//
// 봇은 "완벽한 플레이어"가 아니라 평균적 회피 플레이의 근사다. 절대 수치보다
// 세팅 A vs B 의 상대 비교에 쓴다.

import { Grid } from './grid.js'
import { deriveStats, emptyAttributes } from './progression.js'
import {
  ACTIVE_IDS,
  PASSIVE_IDS,
  emptySkillTree,
  investBlockReason,
  emptySpecs,
  SPECIALIZATIONS,
  SPEC_LEVEL,
} from './skilltree.js'

const W = 540
const H = 960
const KNOCKBACK_FRICTION = 8
const SPAWN_DIST = Math.hypot(W, H) / 2 + 40
const DESPAWN_DIST = SPAWN_DIST + 280
// 보스 러버밴딩 (main.js 동기화) — 화면 밖이면 플레이어보다 빠르게 접근
const BOSS_LEASH = Math.hypot(W, H) / 2
const BOSS_CATCHUP = 1.25

function clone(o) {
  return JSON.parse(JSON.stringify(o))
}

// 한 판 시뮬레이션. 반환: 생존시간·클리어여부·레벨·킬 등.
export function simulate(cfg, opts = {}) {
  const maxTime = opts.maxTime ?? 480 // 이 시간까지 살면 클리어로 본다
  const dt = opts.dt ?? 1 / 30

  // 능력치·스킬·특화 → 최종 stats (게임과 동일한 재계산 함수)
  // 카드+룬 피벗: 능력치/스킬트리 보류. 진행은 레벨업 카드로.
  const attr = emptyAttributes() // 보류(전부 0)
  const skills = emptySkillTree()
  const specs = emptySpecs() // 특화 보류
  const CARD_STEP = { dmg: 0.1, move: 0.08, hp: 0.15, atkSpeed: 0.08 }
  const CARD_ACTIVES = ['multishot', 'rapidfire', 'barrage', 'grenade']
  const MAX_ACTIVE = 5
  const GRENADE_MAX = 240 // 수류탄 최대 투척 거리
  const GRENADE_DUR = 0.45 // 포물선 비행 시간
  const grenades = [] // 날아가는 수류탄 {tx,ty,t,radius,dmg,burn}
  const BURN_PCT = 0.3 // 화상 도트 비율/초
  const BURN_DUR = 3 // 화상 지속(초)
  const cardPassives = { dmg: 0, move: 0, hp: 0, atkSpeed: 0 }
  let cardCursor = 0
  const cardBonusObj = () => ({
    dmg: cardPassives.dmg * CARD_STEP.dmg,
    move: cardPassives.move * CARD_STEP.move,
    hp: cardPassives.hp * CARD_STEP.hp,
    atkSpeed: cardPassives.atkSpeed * CARD_STEP.atkSpeed,
  })
  // 룬 (보스 처치 시 봇 자동 장착)
  const RUNE_POOL = ['damage', 'pierce', 'projectile', 'cooldown', 'burn']
  const runeSlots = { basic: null, multishot: null, rapidfire: null, barrage: null, grenade: null }
  let stats = deriveStats(cfg, attr, skills, specs, cardBonusObj(), runeSlots)
  let attrCursor = 0 // (미사용)
  let skillPoints = 0 // (미사용)
  let revived = false // 활력40 부활 사용
  let lastKillExplode = 0 // 힘40 처치폭발 내부 쿨
  let chainGuard = false // 처치폭발 연쇄 방지

  const state = {
    t: 0,
    hp: stats.player.maxHp,
    invulnLeft: 0,
    px: W / 2,
    py: H / 2,
    xp: 0,
    level: 1,
    xpNeed: xpFor(cfg, 1),
    kills: 0,
    bossKills: 0,
    firstCrisis: null,
    spawnAcc: 0,
    bossAcc: 0,
    bossSpawns: 0,
    fireAcc: 0,
    enemies: [],
    arrows: [],
    eProjectiles: [],
    telegraphs: [],
  }

  const skillAcc = {}
  for (const id of ACTIVE_IDS) skillAcc[id] = 0

  // 연사/지속 상태 (main.js 와 동일)
  const burst = {
    multishot: { left: 0, acc: 0, base: 0 },
    rapidfire: { left: 0, acc: 0 },
    barrage: { timeLeft: 0, acc: 0 },
  }

  const grid = new Grid(W, H, 56)
  const buf = []
  const explodeBuf = [] // 폭발 조회용 (buf 와 겹치면 안 됨)
  const enemyPool = []
  const arrowPool = []
  const eProjPool = []
  const telePool = []

  const minute = () => Math.floor(state.t / 60)
  const spawnMult = () =>
    Math.min(Math.pow(cfg.spawn.rampPerMin, minute()), cfg.spawn.rampCap)
  const enemyHpNow = () =>
    Math.round(cfg.enemy.hp * Math.pow(cfg.enemy.hpRampPerMin, minute()))
  const bossHpNow = () =>
    Math.round(cfg.boss.hp * Math.pow(cfg.boss.hpRampPerMin, minute()))

  // 플레이어 기준 화면 밖 원둘레 스폰 (무한 월드)
  function edge(margin) {
    const ang = Math.random() * Math.PI * 2
    const dist = SPAWN_DIST + margin
    return {
      x: state.px + Math.cos(ang) * dist,
      y: state.py + Math.sin(ang) * dist,
    }
  }

  function makeEnemy(x, y, spec) {
    const en = enemyPool.pop() || {}
    en.x = x
    en.y = y
    en.hp = spec.hp
    en.r = spec.r
    en.speed = spec.speed
    en.dmg = spec.dmg
    en.kbResist = spec.kbResist
    en.gems = spec.gems
    en.boss = spec.boss
    en.type = spec.type || 'basic'
    en.ranged = spec.ranged || false
    en.kbx = 0
    en.kby = 0
    en.stun = 0 // 피격 경직 남은 시간(초)
    en.burn = null // 화상 도트
    en.wob = Math.random() * Math.PI * 2
    en.atk = spec.boss
      ? cfg.boss.attackInterval
      : spec.ranged
        ? cfg.enemy.shooterInterval
        : 0
    state.enemies.push(en)
  }

  function spawnEnemy() {
    if (state.enemies.length >= cfg.spawn.maxEnemies) return
    const c = cfg.enemy
    const p = edge(40)

    const roll = Math.random()
    const canRush = state.t >= c.rusherStartSec
    const canShoot = state.t >= c.shooterStartSec
    let type = 'basic'
    let speed = c.speed
    let hp = enemyHpNow()
    let ranged = false
    if (canRush && roll < c.rusherChance) {
      type = 'rusher'
      speed = c.speed * c.rusherSpeedMul
      hp = enemyHpNow() * c.rusherHpMul
    } else if (
      canShoot &&
      roll >= c.rusherChance &&
      roll < c.rusherChance + c.shooterChance
    ) {
      type = 'shooter'
      speed = c.speed * c.shooterSpeedMul
      hp = enemyHpNow() * c.shooterHpMul
      ranged = true
    }

    makeEnemy(p.x, p.y, {
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

  function spawnBoss() {
    state.bossSpawns++
    const p = edge(60)
    makeEnemy(p.x, p.y, {
      hp: bossHpNow(),
      r: cfg.boss.radius,
      speed: cfg.boss.speed,
      dmg: cfg.boss.contactDamage,
      kbResist: cfg.boss.knockbackResist,
      gems: cfg.boss.gems,
      boss: true,
      type: 'boss',
    })
  }

  function removeSwap(arr, i, pool) {
    const item = arr[i]
    arr[i] = arr[arr.length - 1]
    arr.pop()
    pool.push(item)
  }

  function nearestEnemy() {
    const range = stats.weapon.range
    let best = null
    let bestD = range * range
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i]
      const dx = e.x - state.px
      const dy = e.y - state.py
      const d = dx * dx + dy * dy
      if (d < bestD) {
        bestD = d
        best = e
      }
    }
    return best
  }

  function fireAngle(ang, dmg, pierce, burn) {
    const w = stats.weapon
    const a = arrowPool.pop() || { hit: new Set() }
    a.x = state.px
    a.y = state.py
    a.vx = Math.cos(ang) * w.speed
    a.vy = Math.sin(ang) * w.speed
    a.pierceLeft = pierce ?? w.pierce
    a.dmg = dmg
    a.burn = !!burn
    a.hit.clear()
    state.arrows.push(a)
  }

  function fireAt(target) {
    const ang = Math.atan2(target.y - state.py, target.x - state.px)
    const w = stats.weapon
    const dmg = w.damage
    fireAngle(ang, dmg, w.pierce, w.burn)
    const extra = w.extraArrows || 0
    for (let i = 1; i <= extra; i++) {
      const off = 0.12 * Math.ceil(i / 2) * (i % 2 ? 1 : -1)
      fireAngle(ang + off, dmg, w.pierce, w.burn)
    }
  }

  // --- 액티브 스킬 (main.js 와 동일 규칙, skillStats 기반) ---

  function updateSkills() {
    for (const id of ACTIVE_IDS) {
      const st = stats.skillStats[id]
      if (!st.active) continue
      skillAcc[id] += dt
      if (skillAcc[id] < st.cooldown) continue

      let fired = false
      if (id === 'multishot') {
        const t = nearestEnemy()
        if (t) {
          // 부채꼴 균등 팬 — 한 번에 발사 (game과 동일)
          const base = Math.atan2(t.y - state.py, t.x - state.px)
          const spread = ((cfg.skill.multishotSpread * Math.PI) / 180) * st.spreadMul
          for (let s = 0; s < st.shots; s++) {
            const frac = st.shots <= 1 ? 0.5 : s / (st.shots - 1)
            fireAngle(base + (frac - 0.5) * spread, st.dmg, st.pierce, st.burn)
          }
          fired = true
        }
      } else if (id === 'rapidfire') {
        if (nearestEnemy()) {
          burst.rapidfire.left = st.shots
          burst.rapidfire.acc = st.interval
          fired = true
        }
      } else if (id === 'barrage') {
        burst.barrage.timeLeft = st.duration
        burst.barrage.acc = cfg.skill.shotInterval
        fired = true
      } else if (id === 'grenade') {
        const t = nearestEnemy()
        if (t) {
          for (let i = 0; i < st.count; i++) {
            const dx = t.x - state.px
            const dy = t.y - state.py
            const d = Math.hypot(dx, dy) || 1
            const reach = Math.min(d, GRENADE_MAX)
            const jx = (Math.random() - 0.5) * st.radius * 1.1
            const jy = (Math.random() - 0.5) * st.radius * 1.1
            grenades.push({
              tx: state.px + (dx / d) * reach + jx,
              ty: state.py + (dy / d) * reach + jy,
              t: 0, radius: st.radius, dmg: st.dmg, burn: st.burn,
            })
          }
          fired = true
        }
      }

      skillAcc[id] = fired ? 0 : st.cooldown
      const c = stats.combat
      if (fired && c.cdRefundChance > 0 && Math.random() < c.cdRefundChance) {
        skillAcc[id] = st.cooldown * 0.5
      }
    }
  }

  function updateGrenades() {
    for (let i = grenades.length - 1; i >= 0; i--) {
      const g = grenades[i]
      g.t += dt
      if (g.t >= GRENADE_DUR) {
        explodeAt(g.tx, g.ty, g.radius, g.dmg, g.burn) // 착탄 시 폭발
        grenades[i] = grenades[grenades.length - 1]
        grenades.pop()
      }
    }
  }

  function updateBursts() {
    const iv = Math.max(0.02, cfg.skill.shotInterval) // 0 이하면 무한루프 → 클램프
    // (다발사격은 위 트리거에서 한 번에 부채꼴 발사)

    const r = burst.rapidfire
    if (r.left > 0) {
      const st = stats.skillStats.rapidfire
      r.acc += dt
      while (r.acc >= st.interval && r.left > 0) {
        r.acc -= st.interval
        const t = nearestEnemy()
        if (!t) {
          r.left = 0
          break
        }
        fireAngle(Math.atan2(t.y - state.py, t.x - state.px), st.dmg, st.pierce, st.burn)
        r.left--
      }
    }

    const b = burst.barrage
    if (b.timeLeft > 0) {
      const st = stats.skillStats.barrage
      b.timeLeft -= dt
      b.acc += dt
      while (b.acc >= iv) {
        b.acc -= iv
        fireAngle(Math.random() * Math.PI * 2, st.dmg, st.pierce, st.burn)
      }
    }
  }

  function fireEnemyShot(e) {
    const c = cfg.enemy
    const ang = Math.atan2(state.py - e.y, state.px - e.x)
    const p = eProjPool.pop() || {}
    p.x = e.x
    p.y = e.y
    p.vx = Math.cos(ang) * c.shooterBoltSpeed
    p.vy = Math.sin(ang) * c.shooterBoltSpeed
    p.dmg = c.shooterBoltDamage
    p.life = 4
    state.eProjectiles.push(p)
  }

  // 보스 탄막 (main.js 와 동일)
  function fireBossLine(boss) {
    const b = cfg.boss
    const base = Math.atan2(state.py - boss.y, state.px - boss.x)
    const mid = (b.lineCount - 1) / 2
    for (let i = 0; i < b.lineCount; i++) {
      const t = telePool.pop() || {}
      t.x = boss.x
      t.y = boss.y
      t.ang = base + (i - mid) * b.lineSpread
      t.life = b.telegraphTime
      state.telegraphs.push(t)
    }
  }

  function updateTelegraphs() {
    const b = cfg.boss
    for (let i = state.telegraphs.length - 1; i >= 0; i--) {
      const t = state.telegraphs[i]
      t.life -= dt
      if (t.life > 0) continue
      const p = eProjPool.pop() || {}
      p.x = t.x
      p.y = t.y
      p.vx = Math.cos(t.ang) * b.boltSpeed
      p.vy = Math.sin(t.ang) * b.boltSpeed
      p.dmg = b.boltDamage
      p.life = 4
      state.eProjectiles.push(p)
      removeSwap(state.telegraphs, i, telePool)
    }
  }

  function updateEnemyProjectiles() {
    const pr = stats.player.radius
    let incoming = 0
    for (let i = state.eProjectiles.length - 1; i >= 0; i--) {
      const p = state.eProjectiles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.life -= dt
      const dx = state.px - p.x
      const dy = state.py - p.y
      const hit = pr + 5
      if (dx * dx + dy * dy < hit * hit) {
        if (p.dmg > incoming) incoming = p.dmg
        removeSwap(state.eProjectiles, i, eProjPool)
        continue
      }
      if (p.life <= 0 || dx * dx + dy * dy > DESPAWN_DIST * DESPAWN_DIST) {
        removeSwap(state.eProjectiles, i, eProjPool)
      }
    }
    if (incoming > 0 && state.invulnLeft === 0) hitPlayer(incoming)
  }

  function explodeAt(x, y, r, dmg, burn) {
    const maxEnemyR = Math.max(cfg.enemy.radius, cfg.boss.radius)
    const near = grid.query(x, y, r + maxEnemyR, explodeBuf)
    for (let i = near.length - 1; i >= 0; i--) {
      const e = near[i]
      const dx = e.x - x
      const dy = e.y - y
      const reach = r + e.r
      const d2 = dx * dx + dy * dy
      if (d2 > reach * reach) continue
      const d = Math.sqrt(d2) || 1
      damageEnemy(e, dmg, dx / d, dy / d, burn)
    }
  }

  function damageEnemy(e, amount, dirX, dirY, burn) {
    const w = stats.weapon
    const c = stats.combat
    if (c.critChance > 0 && Math.random() < c.critChance) amount *= c.critDmg

    e.hp -= amount
    e.kbx += dirX * w.knockback * e.kbResist
    e.kby += dirY * w.knockback * e.kbResist
    if (!e.boss) e.stun = cfg.enemy.hitStunSec // 피격 경직 (main.js 동기화)
    if (burn) {
      const dps = amount * BURN_PCT
      if (!e.burn || dps > e.burn.dps) e.burn = { dps, time: BURN_DUR }
      else e.burn.time = BURN_DUR
    }
    if (e.hp <= 0) killEnemy(e)
  }

  function killEnemy(e) {
    // 같은 프레임 중복 처치 방어 (main.js 동기화). indexOf -1 이면 살아있는
    // 마지막 적을 잘못 빼내 배열이 깨지고 킬/룬이 중복된다.
    const idx = state.enemies.indexOf(e)
    if (idx < 0) return
    const c = stats.combat
    const ex = e.x
    const ey = e.y
    removeSwap(state.enemies, idx, enemyPool)
    state.kills++
    if (e.boss) {
      state.bossKills++
      botEquipRune()
    }
    gainXp(e.gems * cfg.xp.gemValue)
    if (
      !chainGuard &&
      c.killExplodeChance > 0 &&
      state.t - lastKillExplode > 0.2 &&
      Math.random() < c.killExplodeChance
    ) {
      lastKillExplode = state.t
      chainGuard = true
      explodeAt(ex, ey, 40, stats.weapon.damage)
      chainGuard = false
    }
  }

  function gainXp(amount) {
    state.xp += amount
    while (state.xp >= state.xpNeed) {
      state.xp -= state.xpNeed
      state.level++
      state.xpNeed = xpFor(cfg, state.level)
      autoLevelUp()
    }
  }

  // 봇 레벨업 — 게임과 동일한 카드 선택 미러링(액티브 해금·레벨업 + 패시브).
  // "평균적 플레이어" 근사. 절대 수치보다 세팅 간 상대 비교에 쓴다.
  function autoLevelUp() {
    const prevMax = stats.player.maxHp
    botPickCard()
    stats = deriveStats(cfg, attr, skills, specs, cardBonusObj(), runeSlots)
    state.hp += stats.player.maxHp - prevMax
  }

  // 봇 룬 장착 — 무작위 룬을 가장 높은 레벨 액티브(없으면 기본)에
  function botEquipRune() {
    const rune = RUNE_POOL[(Math.random() * RUNE_POOL.length) | 0]
    const owned = CARD_ACTIVES.filter((id) => (skills[id] || 0) > 0)
    owned.sort((a, b) => (skills[b] || 0) - (skills[a] || 0))
    runeSlots[owned[0] || 'basic'] = rune
    stats = deriveStats(cfg, attr, skills, specs, cardBonusObj(), runeSlots)
  }

  function botPickCard() {
    const owned = CARD_ACTIVES.filter((id) => (skills[id] || 0) > 0)
    // 1) 슬롯 남으면 새 액티브 해금
    if (owned.length < MAX_ACTIVE - 1) {
      const un = CARD_ACTIVES.find((id) => !(skills[id] > 0))
      if (un) { skills[un] = 1; return }
    }
    cardCursor++
    // 2) 3번에 1번은 패시브 (데미지/공속/체력/이동 순환)
    if (cardCursor % 3 === 0) {
      const pas = ['dmg', 'atkSpeed', 'hp', 'move'][((cardCursor / 3) | 0) % 4]
      cardPassives[pas]++
      return
    }
    // 3) 보유 액티브 중 레벨 낮은 것 레벨업 (max 10)
    if (owned.length) {
      owned.sort((a, b) => (skills[a] || 0) - (skills[b] || 0))
      const id = owned[0]
      if ((skills[id] || 0) < 10) { skills[id]++; return }
    }
    cardPassives.dmg++ // 폴백
  }

  function hitPlayer(amount) {
    const c = stats.combat
    if (c.dodge > 0 && Math.random() < c.dodge) return // 회피
    amount *= c.dmgTakenMul // 활력20 받는 피해 감소
    state.hp = Math.max(0, state.hp - amount)
    state.invulnLeft = stats.player.invuln
    if (state.firstCrisis == null && state.hp <= stats.player.maxHp * 0.5) {
      state.firstCrisis = state.t
    }
    // 활력40 부활
    if (state.hp <= 0 && c.revive && !revived) {
      revived = true
      state.hp = stats.player.maxHp * 0.3
      state.invulnLeft = 2
    }
  }

  // 봇 이동: 접촉/탄이 임박할 때만 피하고 평소엔 제자리에서 자동발사로 딜한다.
  // 무한 월드 + 원거리 적 조합에서 봇의 최적 플레이(원운동 등)는 어려워
  // 절대 킬 수는 낮게 나온다 — 시뮬은 세팅 간 "상대 비교"로 쓴다.
  function botDir() {
    let ax = 0
    let ay = 0
    let threat = false

    for (let i = 0; i < state.eProjectiles.length; i++) {
      const p = state.eProjectiles[i]
      const dx = state.px - p.x
      const dy = state.py - p.y
      const d2 = dx * dx + dy * dy
      if (d2 > 0 && d2 < 85 * 85) {
        const d = Math.sqrt(d2)
        ax += (dx / d) * 2.5
        ay += (dy / d) * 2.5
        threat = true
      }
    }

    const ideal = stats.player.radius + 72
    const near = grid.query(state.px, state.py, ideal + 40, buf)
    let bestD2 = Infinity
    let bx = 0
    let by = 0
    for (let i = 0; i < near.length; i++) {
      const e = near[i]
      const dx = state.px - e.x
      const dy = state.py - e.y
      const d2 = dx * dx + dy * dy
      if (d2 < bestD2) {
        bestD2 = d2
        bx = dx
        by = dy
      }
    }
    if (bestD2 < ideal * ideal && bestD2 > 0) {
      const d = Math.sqrt(bestD2)
      ax += (bx / d) * 1.5
      ay += (by / d) * 1.5
      threat = true
    }

    if (!threat) return { ax: 0, ay: 0 }
    const tl = Math.hypot(ax, ay)
    if (tl > 0) {
      ax /= tl
      ay /= tl
    }
    return { ax, ay }
  }

  // --- 메인 루프 ---
  while (state.t < maxTime && state.hp > 0) {
    state.t += dt
    state.invulnLeft = Math.max(0, state.invulnLeft - dt)

    const regen = stats.combat.regen
    if (regen > 0 && state.hp > 0 && state.hp < stats.player.maxHp) {
      state.hp = Math.min(stats.player.maxHp, state.hp + regen * dt)
    }

    // 스폰
    state.spawnAcc += dt
    const interval = cfg.spawn.baseInterval / spawnMult()
    while (state.spawnAcc >= interval) {
      state.spawnAcc -= interval
      spawnEnemy()
    }

    // 보스
    state.bossAcc += dt
    // 첫 보스만 firstBossSec (main.js 동기화)
    const bossEvery =
      state.bossSpawns === 0 ? cfg.boss.firstBossSec : cfg.boss.everySec
    if (state.bossAcc >= bossEvery) {
      state.bossAcc -= bossEvery
      spawnBoss()
    }

    // 봇 이동
    const { ax, ay } = botDir()
    const p = stats.player
    state.px += ax * p.speed * dt // 무한 월드 — 벽 clamp 없음
    state.py += ay * p.speed * dt

    // 발사
    state.fireAcc += dt
    if (state.fireAcc >= stats.weapon.cooldown) {
      const target = nearestEnemy()
      if (target) {
        state.fireAcc = 0
        fireAt(target)
      }
    }

    // 그리드를 플레이어 주변으로 옮기고 채운다 (무한 월드)
    grid.setOrigin(state.px - W / 2, state.py - H / 2)
    grid.clear()
    for (let i = 0; i < state.enemies.length; i++) grid.insert(state.enemies[i])

    updateSkills()
    updateBursts()
    updateGrenades()
    updateArrows()
    updateEnemies()
    updateTelegraphs()
    updateEnemyProjectiles()
  }

  function updateArrows() {
    const maxR = Math.max(cfg.enemy.radius, cfg.boss.radius) + 5
    for (let i = state.arrows.length - 1; i >= 0; i--) {
      const a = state.arrows[i]
      const sx = a.x // 이동 전 위치(스윕 판정 선분 시작)
      const sy = a.y
      a.x += a.vx * dt
      a.y += a.vy * dt
      // 플레이어 기준 거리로 제거 (월드 좌표 — main.js 와 동일 수정)
      const adx = a.x - state.px
      const ady = a.y - state.py
      if (adx * adx + ady * ady > DESPAWN_DIST * DESPAWN_DIST) {
        removeSwap(state.arrows, i, arrowPool)
        continue
      }
      // 스윕 판정 (main.js 동기화) — 이동 선분까지 최단거리로 터널링 방지
      const segx = a.x - sx
      const segy = a.y - sy
      const seg2 = segx * segx + segy * segy || 1
      const segLen = Math.sqrt(seg2)
      const mx = (sx + a.x) / 2
      const my = (sy + a.y) / 2
      const near = grid.query(mx, my, maxR + segLen / 2, buf)
      let spent = false
      for (let j = 0; j < near.length; j++) {
        const e = near[j]
        if (a.hit.has(e)) continue
        const hitR = e.r + 5
        let t = ((e.x - sx) * segx + (e.y - sy) * segy) / seg2
        t = t < 0 ? 0 : t > 1 ? 1 : t
        const ddx = e.x - (sx + t * segx)
        const ddy = e.y - (sy + t * segy)
        if (ddx * ddx + ddy * ddy >= hitR * hitR) continue
        a.hit.add(e)
        const len = Math.hypot(a.vx, a.vy) || 1
        damageEnemy(e, a.dmg, a.vx / len, a.vy / len, a.burn)
        if (--a.pierceLeft <= 0) {
          spent = true
          break
        }
      }
      if (spent) removeSwap(state.arrows, i, arrowPool)
    }
  }

  function updateEnemies() {
    const pr = stats.player.radius
    const decay = Math.max(0, 1 - KNOCKBACK_FRICTION * dt)
    const sepR = cfg.enemy.sepRadius
    const sepStr = cfg.enemy.sepStrength
    let incoming = 0
    const despawn2 = DESPAWN_DIST * DESPAWN_DIST

    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i]
      const dx = state.px - e.x
      const dy = state.py - e.y

      // 너무 멀어진 적 제거 (보스는 예외)
      if (!e.boss && dx * dx + dy * dy > despawn2) {
        removeSwap(state.enemies, i, enemyPool)
        i--
        continue
      }

      // 화상 도트 (main.js 동기화)
      if (e.burn && e.burn.time > 0) {
        e.burn.time -= dt
        e.hp -= e.burn.dps * dt
        if (e.hp <= 0) {
          killEnemy(e)
          i--
          continue
        }
      }

      // 피격 경직 — 이동/추격/분리/공격 정지 (main.js 동기화)
      if (e.stun > 0) {
        e.stun -= dt
        e.kbx *= decay
        e.kby *= decay
        continue
      }

      const len = Math.hypot(dx, dy) || 1

      // 겹침 방지: 근처 적들로부터 밀려나는 힘 (그리드로 이웃만, 최대 6마리)
      let sx = 0
      let sy = 0
      if (sepStr > 0) {
        const near = grid.query(e.x, e.y, sepR, buf)
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

      let mvx, mvy
      if (e.ranged) {
        const c = cfg.enemy
        let dir = 0
        if (len < c.shooterRetreat) dir = -1
        else if (len > c.shooterRange) dir = 1
        mvx = (dx / len) * dir
        mvy = (dy / len) * dir
      } else {
        e.wob += dt * 3
        const wob = Math.sin(e.wob) * cfg.enemy.wobble
        mvx = dx / len + (-dy / len) * wob
        mvy = dy / len + (dx / len) * wob
      }

      // 보스 러버밴딩 (main.js 동기화) — 화면 밖이면 플레이어보다 빠르게 접근
      let espeed = e.speed
      if (e.boss && dx * dx + dy * dy > BOSS_LEASH * BOSS_LEASH) {
        espeed = Math.max(e.speed, stats.player.speed * BOSS_CATCHUP)
      }

      e.x += mvx * espeed * dt + sx * sepStr * dt + e.kbx * dt
      e.y += mvy * espeed * dt + sy * sepStr * dt + e.kby * dt
      e.kbx *= decay
      e.kby *= decay

      // 플레이어 겹침 방지 (main.js 동기화)
      const minD = pr + e.r
      const odx = e.x - state.px
      const ody = e.y - state.py
      const od2 = odx * odx + ody * ody
      if (od2 < minD * minD) {
        const od = Math.sqrt(od2)
        const ux = od > 0.001 ? odx / od : 1
        const uy = od > 0.001 ? ody / od : 0
        e.x = state.px + ux * minD
        e.y = state.py + uy * minD
      }

      if (e.boss) {
        e.atk -= dt
        if (e.atk <= 0) {
          e.atk += cfg.boss.attackInterval
          fireBossLine(e)
        }
      } else if (e.ranged) {
        e.atk -= dt
        if (e.atk <= 0) {
          e.atk += cfg.enemy.shooterInterval
          fireEnemyShot(e)
        }
      }

      const touch = pr + e.r
      if (dx * dx + dy * dy <= touch * touch && e.dmg > incoming) incoming = e.dmg
    }
    if (incoming > 0 && state.invulnLeft === 0) hitPlayer(incoming)
  }

  return {
    survived: state.t,
    cleared: state.hp > 0, // maxTime 까지 살아남음
    level: state.level,
    kills: state.kills,
    bossKills: state.bossKills,
    firstCrisis: state.firstCrisis,
  }
}

// 여러 판 돌려 통계를 낸다.
export function runBatch(cfg, runs = 10, opts = {}) {
  const results = []
  for (let i = 0; i < runs; i++) results.push(simulate(cfg, opts))
  return summarize(results, opts.maxTime ?? 480)
}

export function summarize(results, maxTime) {
  const n = results.length
  const survived = results.map((r) => r.survived).sort((a, b) => a - b)
  const clears = results.filter((r) => r.cleared).length
  const crises = results.map((r) => r.firstCrisis).filter((v) => v != null)

  return {
    runs: n,
    avgSurvived: avg(results.map((r) => r.survived)),
    medSurvived: median(survived),
    minSurvived: survived[0],
    maxSurvived: survived[n - 1],
    clearRate: clears / n,
    avgLevel: avg(results.map((r) => r.level)),
    avgKills: avg(results.map((r) => r.kills)),
    avgBossKills: avg(results.map((r) => r.bossKills)),
    avgFirstCrisis: crises.length ? avg(crises) : null,
    maxTime,
  }
}

// --- 유틸 ---
function xpFor(cfg, level) {
  return Math.ceil(cfg.xp.levelBase * Math.pow(cfg.xp.levelGrowth, level - 1))
}
function rand(a, b) {
  return a + Math.random() * (b - a)
}
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v
}
function avg(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length
}
function median(sorted) {
  const m = sorted.length >> 1
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2
}
