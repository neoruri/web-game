// 성장 시스템의 계산 모듈. UI 와 완전히 분리된 순수 함수만 둔다.
//
// deriveStats() 가 유일한 재계산 지점이다 — 능력치·스킬 레벨을 받아 실제 전투에
// 쓰는 stats 객체를 만든다. 게임/시뮬 어느 쪽도 전투 수치를 직접 수정하지 않고,
// 무엇이든 바뀌면 이 함수로 통째로 다시 계산한다.

import { ACTIVE_SKILLS, PASSIVE_SKILLS } from './skilltree.js'

export const ATTR_KEYS = ['str', 'dex', 'int', 'vit']

export const ATTR_LABELS = { str: '힘', dex: '민첩', int: '지능', vit: '활력' }

export function emptyAttributes() {
  return { str: 0, dex: 0, int: 0, vit: 0 }
}

function clone(o) {
  return JSON.parse(JSON.stringify(o))
}

// 패시브 스킬 레벨 → 합산 보너스
function passiveTotals(skills) {
  const t = {
    basicDmgPct: 0,
    projSpeedPct: 0,
    pierce: 0,
    movePct: 0,
    grenadeDmgPct: 0,
    grenadeRadiusPct: 0,
    critPct: 0,
  }
  for (const id of Object.keys(PASSIVE_SKILLS)) {
    const lv = skills[id] || 0
    if (!lv) continue
    const per = PASSIVE_SKILLS[id].per
    for (const k in per) if (k in t) t[k] += per[k] * lv
  }
  return t
}

// 능력치·스킬 → 최종 전투 stats.
export function deriveStats(cfg, attr, skills) {
  const A = cfg.attr

  // 능력치
  const dmgMul = 1 + attr.str * A.strDamagePerPoint
  const atkSpd = Math.min(attr.dex * A.dexAtkSpeedPerPoint, A.atkSpeedCap)
  const moveAttr = Math.min(attr.dex * A.dexMovePerPoint, A.moveCap)
  const cdr = Math.min(attr.int * A.intCdrPerPoint, A.cdrCap)
  const hpAdd = attr.vit * A.vitHpPerPoint

  // 패시브
  const p = passiveTotals(skills)

  const s = clone({
    player: cfg.player,
    weapon: cfg.weapon,
    enemy: cfg.enemy,
    spawn: cfg.spawn,
    boss: cfg.boss,
    xp: cfg.xp,
    skill: cfg.skill,
  })
  s.skills = skills

  // 기본 활 — 힘(전체 피해) + 궁술숙련(기본활 전용)
  s.weapon.damage = cfg.weapon.damage * dmgMul * (1 + p.basicDmgPct)
  s.weapon.cooldown = cfg.weapon.cooldown / (1 + atkSpd)
  s.weapon.speed = cfg.weapon.speed * (1 + p.projSpeedPct)
  s.weapon.pierce = cfg.weapon.pierce + p.pierce

  // 이동 — 민첩 + 이동강화 패시브
  s.player.speed = cfg.player.speed * (1 + moveAttr + p.movePct)
  s.player.maxHp = cfg.player.maxHp + hpAdd

  // 액티브 스킬별 최종 수치 (레벨 반영). 힘은 스킬 피해에도 적용, 궁술숙련은 미적용.
  const skillBaseDmg = cfg.weapon.damage * dmgMul * cfg.skill.damageMul
  const skillCd = (base) => Math.max(A.minSkillCooldown, base * (1 - cdr))

  s.skillStats = {}
  for (const id of Object.keys(ACTIVE_SKILLS)) {
    const def = ACTIVE_SKILLS[id]
    const lv = skills[id] || 0
    if (lv <= 0) {
      s.skillStats[id] = { level: 0, active: false }
      continue
    }
    const e = def.eff(lv)
    const st = {
      level: lv,
      active: true,
      dmg: skillBaseDmg * (e.dmgMul || 1),
      pierce: s.weapon.pierce + (e.pierceBonus || 0),
      cooldown: skillCd(def.baseCooldown),
    }
    if (id === 'multishot') st.shots = e.shots
    if (id === 'rapidfire') {
      st.shots = e.shots
      st.interval = cfg.skill.shotInterval * (e.intervalMul || 1)
    }
    if (id === 'barrage') st.duration = e.duration
    if (id === 'grenade') {
      st.count = e.count
      st.radius = cfg.skill.grenadeRadius * (e.radiusMul || 1) * (1 + p.grenadeRadiusPct)
      st.dmg *= 1 + p.grenadeDmgPct
    }
    s.skillStats[id] = st
  }

  s.derived = {
    dmgPct: round1((dmgMul * (1 + p.basicDmgPct) - 1) * 100),
    atkSpdPct: round1(atkSpd * 100),
    movePct: round1((moveAttr + p.movePct) * 100),
    cdrPct: round1(cdr * 100),
    hpAdd,
  }
  return s
}

// --- 능력치 표시 문구 (성장 화면) ---

export function attrEffectText(cfg, key, value) {
  const A = cfg.attr
  if (key === 'str') return `모든 피해 +${round1(value * A.strDamagePerPoint * 100)}%`
  if (key === 'dex') {
    const as = Math.min(value * A.dexAtkSpeedPerPoint, A.atkSpeedCap)
    const mv = Math.min(value * A.dexMovePerPoint, A.moveCap)
    return `공격속도 +${round1(as * 100)}%  ·  이동 +${round1(mv * 100)}%`
  }
  if (key === 'int') {
    const cdr = Math.min(value * A.intCdrPerPoint, A.cdrCap)
    return `스킬 쿨감 +${round1(cdr * 100)}%`
  }
  if (key === 'vit') return `최대 HP +${value * A.vitHpPerPoint}`
  return ''
}

const TIER_HINTS = {
  str: { 10: '치명타 피해 +10%', 20: '모든 피해 +10%', 30: '관통 +1', 40: '처치 시 폭발' },
  dex: { 10: '치명타 확률 +3%', 20: '이동 +5%', 30: '추가 화살 +1', 40: '회피 +8%' },
  int: { 10: '스킬 피해 +8%', 20: '스킬 범위 +10%', 30: '지속 +15%', 40: '쿨타임 반환' },
  vit: { 10: 'HP 회복 +0.5', 20: '받는 피해 -5%', 30: 'HP 회복 +0.5', 40: '치명타 방어' },
}

export function nextTierText(key, value) {
  for (const t of [10, 20, 30, 40]) if (value < t) return `${t}: ${TIER_HINTS[key][t]}`
  return '최대 구간 도달'
}

function round1(x) {
  return Math.round(x * 10) / 10
}
