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

function clone(o) {
  return JSON.parse(JSON.stringify(o))
}

// 한 판 시뮬레이션. 반환: 생존시간·클리어여부·레벨·킬 등.
export function simulate(cfg, opts = {}) {
  const maxTime = opts.maxTime ?? 480 // 이 시간까지 살면 클리어로 본다
  const dt = opts.dt ?? 1 / 30

  // 능력치·스킬·특화 → 최종 stats (게임과 동일한 재계산 함수)
  const attr = emptyAttributes()
  const skills = emptySkillTree()
  const specs = emptySpecs()
  let stats = deriveStats(cfg, attr, skills, specs)
  let attrCursor = 0 // 봇 능력치 배분 순환 위치
  let skillPoints = 0 // 봇 미사용 스킬 포인트

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
    enemies: [],
    arrows: [],
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

  function fireAngle(ang, dmg, pierce) {
    const w = stats.weapon
    const a = arrowPool.pop() || { hit: new Set() }
    a.x = state.px
    a.y = state.py
    a.vx = Math.cos(ang) * w.speed
    a.vy = Math.sin(ang) * w.speed
    a.pierceLeft = pierce ?? w.pierce
    a.dmg = dmg
    a.hit.clear()
    state.arrows.push(a)
  }

  function fireAt(target) {
    const ang = Math.atan2(target.y - state.py, target.x - state.px)
    fireAngle(ang, stats.weapon.damage, stats.weapon.pierce)
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
          burst.multishot.base = Math.atan2(t.y - state.py, t.x - state.px)
          burst.multishot.left = st.shots
          burst.multishot.acc = cfg.skill.shotInterval
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
        if (state.enemies.length) {
          for (let i = 0; i < st.count; i++) {
            const t = state.enemies[(Math.random() * state.enemies.length) | 0]
            explodeAt(t.x, t.y, st.radius, st.dmg)
          }
          fired = true
        }
      }

      skillAcc[id] = fired ? 0 : st.cooldown
    }
  }

  function updateBursts() {
    const iv = cfg.skill.shotInterval

    const m = burst.multishot
    if (m.left > 0) {
      const st = stats.skillStats.multishot
      const spread = ((cfg.skill.multishotSpread * Math.PI) / 180) * st.spreadMul
      m.acc += dt
      while (m.acc >= iv && m.left > 0) {
        m.acc -= iv
        fireAngle(m.base + (Math.random() - 0.5) * spread, st.dmg, st.pierce)
        m.left--
      }
    }

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
        fireAngle(Math.atan2(t.y - state.py, t.x - state.px), st.dmg, st.pierce)
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
        fireAngle(Math.random() * Math.PI * 2, st.dmg, st.pierce)
      }
    }
  }

  function explodeAt(x, y, r, dmg) {
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
      damageEnemy(e, dmg, dx / d, dy / d)
    }
  }

  function damageEnemy(e, amount, dirX, dirY) {
    const w = stats.weapon
    e.hp -= amount
    e.kbx += dirX * w.knockback * e.kbResist
    e.kby += dirY * w.knockback * e.kbResist
    if (e.hp > 0) return

    const idx = state.enemies.indexOf(e)
    removeSwap(state.enemies, idx, enemyPool)
    state.kills++
    if (e.boss) state.bossKills++
    gainXp(e.gems * cfg.xp.gemValue) // 처치 즉시 경험치
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

  // 봇의 자동 성장 — 능력치는 딜/생존/스킬쿨 순환, 스킬 포인트는 액티브 우선 투자.
  // "평균적 플레이어" 근사다. 절대 수치보다 세팅 간 상대 비교에 쓴다.
  const BOT_ATTR_ORDER = ['str', 'dex', 'int', 'vit']
  function autoLevelUp() {
    const prevMax = stats.player.maxHp
    for (let i = 0; i < cfg.attr.pointsPerLevel; i++) {
      attr[BOT_ATTR_ORDER[attrCursor % BOT_ATTR_ORDER.length]]++
      attrCursor++
    }
    skillPoints += cfg.attr.skillPointsPerLevel
    botSpendSkillPoints()
    stats = deriveStats(cfg, attr, skills, specs)
    state.hp += stats.player.maxHp - prevMax // 활력 증가분만큼 현재 HP도
  }

  // 봇 스킬 투자: 배울 수 있는 스킬 중 액티브 먼저, 그중 레벨 낮은 것.
  function botSpendSkillPoints() {
    while (skillPoints > 0) {
      const options = [...ACTIVE_IDS, ...PASSIVE_IDS].filter(
        (id) => !investBlockReason(id, skills, state.level)
      )
      if (!options.length) break
      options.sort((a, b) => {
        const act = (ACTIVE_IDS.includes(b) ? 1 : 0) - (ACTIVE_IDS.includes(a) ? 1 : 0)
        return act || (skills[a] || 0) - (skills[b] || 0)
      })
      skills[options[0]] = (skills[options[0]] || 0) + 1
      skillPoints--
    }
    // 특화 도달 시 A 자동 선택 (봇은 첫 특화 고정)
    for (const id of Object.keys(SPECIALIZATIONS)) {
      if (!specs[id] && (skills[id] || 0) >= SPEC_LEVEL) specs[id] = 'A'
    }
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
    // 젬을 줍지 않으므로(즉시 경험치) 봇은 위협 회피 + 중앙 유지만 한다

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

    // 그리드 채우기 (봇 회피 + 화살 충돌 + 폭발 공용)
    grid.clear()
    for (let i = 0; i < state.enemies.length; i++) grid.insert(state.enemies[i])

    updateSkills()
    updateBursts()
    updateArrows()
    updateEnemies()
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
        damageEnemy(e, a.dmg, a.vx / len, a.vy / len)
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

    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i]
      const dx = state.px - e.x
      const dy = state.py - e.y
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

      e.x += (dx / len) * e.speed * dt + sx * sepStr * dt + e.kbx * dt
      e.y += (dy / len) * e.speed * dt + sy * sepStr * dt + e.kby * dt
      e.kbx *= decay
      e.kby *= decay

      const touch = pr + e.r
      if (dx * dx + dy * dy < touch * touch && e.dmg > incoming) incoming = e.dmg
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
