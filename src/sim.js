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
import { UPGRADES, drawCards } from './upgrades.js'

const W = 540
const H = 960
const KNOCKBACK_FRICTION = 8

function clone(o) {
  return JSON.parse(JSON.stringify(o))
}

// 한 판 시뮬레이션. 반환: 생존시간·클리어여부·레벨·킬 등.
export function simulate(cfg, opts = {}) {
  const maxTime = opts.maxTime ?? 480 // 이 시간까지 살면 클리어로 본다
  const dt = opts.dt ?? 1 / 30

  const stats = clone(cfg) // 업그레이드로 변하는 실시간 스탯

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
    fireAcc: 0,
    taken: {},
    enemies: [],
    arrows: [],
    gems: [],
  }

  const grid = new Grid(W, H, 56)
  const buf = []
  const enemyPool = []
  const arrowPool = []
  const gemPool = []

  const minute = () => Math.floor(state.t / 60)
  const spawnMult = () =>
    Math.min(Math.pow(cfg.spawn.rampPerMin, minute()), cfg.spawn.rampCap)
  const enemyHpNow = () =>
    Math.round(cfg.enemy.hp * Math.pow(cfg.enemy.hpRampPerMin, minute()))
  const bossHpNow = () =>
    Math.round(cfg.boss.hp * Math.pow(cfg.boss.hpRampPerMin, minute()))

  function edge(margin) {
    const e = (Math.random() * 4) | 0
    if (e === 0) return { x: rand(-margin, W + margin), y: -margin }
    if (e === 1) return { x: W + margin, y: rand(-margin, H + margin) }
    if (e === 2) return { x: rand(-margin, W + margin), y: H + margin }
    return { x: -margin, y: rand(-margin, H + margin) }
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
    en.kbx = 0
    en.kby = 0
    state.enemies.push(en)
  }

  function spawnEnemy() {
    if (state.enemies.length >= cfg.spawn.maxEnemies) return
    const p = edge(40)
    makeEnemy(p.x, p.y, {
      hp: enemyHpNow(),
      r: cfg.enemy.radius,
      speed: cfg.enemy.speed,
      dmg: cfg.enemy.contactDamage,
      kbResist: 1,
      gems: 1,
      boss: false,
    })
  }

  function spawnBoss() {
    const p = edge(60)
    makeEnemy(p.x, p.y, {
      hp: bossHpNow(),
      r: cfg.boss.radius,
      speed: cfg.boss.speed,
      dmg: cfg.boss.contactDamage,
      kbResist: cfg.boss.knockbackResist,
      gems: cfg.boss.gems,
      boss: true,
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

  function fireAt(target) {
    const w = stats.weapon
    const ang = Math.atan2(target.y - state.py, target.x - state.px)
    const a = arrowPool.pop() || { hit: new Set() }
    a.x = state.px
    a.y = state.py
    a.vx = Math.cos(ang) * w.speed
    a.vy = Math.sin(ang) * w.speed
    a.pierceLeft = w.pierce
    a.hit.clear()
    state.arrows.push(a)
  }

  function damageEnemy(e, amount, dirX, dirY) {
    const w = stats.weapon
    e.hp -= amount
    e.kbx += dirX * w.knockback * e.kbResist
    e.kby += dirY * w.knockback * e.kbResist
    if (e.hp > 0) return

    for (let i = 0; i < e.gems; i++) dropGem(e.x, e.y)
    const idx = state.enemies.indexOf(e)
    removeSwap(state.enemies, idx, enemyPool)
    state.kills++
    if (e.boss) state.bossKills++
  }

  function dropGem(x, y) {
    const g = gemPool.pop() || {}
    g.x = x
    g.y = y
    state.gems.push(g)
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

  // 봇의 레벨업 카드 선택 — 무작위(평균적 플레이어 근사)
  const heal = (a) => {
    state.hp = Math.min(stats.player.maxHp, state.hp + a)
  }
  function autoLevelUp() {
    const cards = drawCards(state.taken, 3)
    if (!cards.length) return
    const pick = cards[(Math.random() * cards.length) | 0]
    pick.apply(stats, cfg, { heal })
    state.taken[pick.id] = (state.taken[pick.id] || 0) + 1
  }

  function hitPlayer(amount) {
    state.hp = Math.max(0, state.hp - amount)
    state.invulnLeft = stats.player.invuln
    if (state.firstCrisis == null && state.hp <= stats.player.maxHp * 0.5) {
      state.firstCrisis = state.t
    }
  }

  // 봇 이동: 근처 적에게서 멀어지고 + 화면 중앙으로 약하게 당김
  function botDir() {
    let ax = 0
    let ay = 0
    const near = grid.query(state.px, state.py, 200, buf)
    for (let i = 0; i < near.length; i++) {
      const e = near[i]
      const dx = state.px - e.x
      const dy = state.py - e.y
      const d2 = dx * dx + dy * dy
      if (d2 < 1) continue
      const w = 1 / d2 // 가까운 적일수록 강하게 회피
      const d = Math.sqrt(d2)
      ax += (dx / d) * w
      ay += (dy / d) * w
    }
    const tl = Math.hypot(ax, ay)
    if (tl > 0) {
      ax /= tl
      ay /= tl
    }

    // 가장 가까운 젬 쪽으로 약하게 당김 (성장을 위해 젬을 주우러 감).
    // 위협 회피(크기 1)보다 약하게 둬서, 적이 붙으면 회피가 우선한다.
    let bestD = Infinity
    let gx = 0
    let gy = 0
    for (let i = 0; i < state.gems.length; i++) {
      const g = state.gems[i]
      const dx = g.x - state.px
      const dy = g.y - state.py
      const d2 = dx * dx + dy * dy
      if (d2 < bestD) {
        bestD = d2
        gx = dx
        gy = dy
      }
    }
    if (bestD < Infinity) {
      const d = Math.sqrt(bestD) || 1
      ax += (gx / d) * 0.55
      ay += (gy / d) * 0.55
    }

    // 벽에 몰리지 않게 중앙으로 약하게
    ax += ((W / 2 - state.px) / W) * 0.4
    ay += ((H / 2 - state.py) / H) * 0.4

    const len = Math.hypot(ax, ay)
    if (len > 1) {
      ax /= len
      ay /= len
    }
    return { ax, ay }
  }

  // --- 메인 루프 ---
  while (state.t < maxTime && state.hp > 0) {
    state.t += dt
    state.invulnLeft = Math.max(0, state.invulnLeft - dt)

    // 스폰
    state.spawnAcc += dt
    const interval = cfg.spawn.baseInterval / spawnMult()
    while (state.spawnAcc >= interval) {
      state.spawnAcc -= interval
      spawnEnemy()
    }

    // 보스
    state.bossAcc += dt
    if (state.bossAcc >= cfg.boss.everySec) {
      state.bossAcc -= cfg.boss.everySec
      spawnBoss()
    }

    // 봇 이동
    const { ax, ay } = botDir()
    const p = stats.player
    state.px = clamp(state.px + ax * p.speed * dt, p.radius, W - p.radius)
    state.py = clamp(state.py + ay * p.speed * dt, p.radius, H - p.radius)

    // 발사
    state.fireAcc += dt
    if (state.fireAcc >= stats.weapon.cooldown) {
      const target = nearestEnemy()
      if (target) {
        state.fireAcc = 0
        fireAt(target)
      }
    }

    // 그리드 채우기 (봇 회피 + 화살 충돌 공용)
    grid.clear()
    for (let i = 0; i < state.enemies.length; i++) grid.insert(state.enemies[i])

    updateArrows()
    updateEnemies()
    updateGems()
  }

  function updateArrows() {
    const maxR = Math.max(cfg.enemy.radius, cfg.boss.radius) + 5
    for (let i = state.arrows.length - 1; i >= 0; i--) {
      const a = state.arrows[i]
      a.x += a.vx * dt
      a.y += a.vy * dt
      if (a.x < -30 || a.x > W + 30 || a.y < -30 || a.y > H + 30) {
        removeSwap(state.arrows, i, arrowPool)
        continue
      }
      const near = grid.query(a.x, a.y, maxR, buf)
      let spent = false
      for (let j = 0; j < near.length; j++) {
        const e = near[j]
        if (a.hit.has(e)) continue
        const hitR = e.r + 5
        const dx = a.x - e.x
        const dy = a.y - e.y
        if (dx * dx + dy * dy >= hitR * hitR) continue
        a.hit.add(e)
        const len = Math.hypot(a.vx, a.vy) || 1
        damageEnemy(e, stats.weapon.damage, a.vx / len, a.vy / len)
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
    let incoming = 0
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i]
      const dx = state.px - e.x
      const dy = state.py - e.y
      const len = Math.hypot(dx, dy) || 1
      e.x += (dx / len) * e.speed * dt + e.kbx * dt
      e.y += (dy / len) * e.speed * dt + e.kby * dt
      e.kbx *= decay
      e.kby *= decay
      const touch = pr + e.r
      if (dx * dx + dy * dy < touch * touch && e.dmg > incoming) incoming = e.dmg
    }
    if (incoming > 0 && state.invulnLeft === 0) hitPlayer(incoming)
  }

  function updateGems() {
    const p = stats.player
    const magnet2 = p.pickupRadius * p.pickupRadius
    const pick2 = (p.radius + 6) * (p.radius + 6)
    const speed = cfg.xp.magnetSpeed
    let gained = 0
    for (let i = state.gems.length - 1; i >= 0; i--) {
      const g = state.gems[i]
      const dx = state.px - g.x
      const dy = state.py - g.y
      const d2 = dx * dx + dy * dy
      if (d2 < pick2) {
        gained += cfg.xp.gemValue
        removeSwap(state.gems, i, gemPool)
        continue
      }
      if (d2 < magnet2) {
        const len = Math.sqrt(d2) || 1
        g.x += (dx / len) * speed * dt
        g.y += (dy / len) * speed * dt
      }
    }
    if (gained > 0) gainXp(gained)
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
