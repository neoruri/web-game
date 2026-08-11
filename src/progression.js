// 성장 시스템의 계산 모듈. UI 와 완전히 분리된 순수 함수만 둔다.
//
// deriveStats() 가 유일한 재계산 지점이다 — 능력치·스킬 레벨을 받아 실제 전투에
// 쓰는 stats 객체를 만든다. 게임/시뮬 어느 쪽도 전투 수치를 직접 수정하지 않고,
// 무엇이든 바뀌면 이 함수로 통째로 다시 계산한다.

import { ACTIVE_SKILLS, PASSIVE_SKILLS, SPECIALIZATIONS } from './skilltree.js'

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
    dodgePct: 0,
  }
  for (const id of Object.keys(PASSIVE_SKILLS)) {
    const lv = skills[id] || 0
    if (!lv) continue
    const per = PASSIVE_SKILLS[id].per
    for (const k in per) if (k in t) t[k] += per[k] * lv
  }
  return t
}

// 능력치 구간 보너스 (10/20/30/40 통과 시 발동). 3단계 심화 효과.
function tierBonuses(attr, pass) {
  const has = (v, n) => v >= n
  const S = attr.str
  const D = attr.dex
  const I = attr.int
  const V = attr.vit

  return {
    allDmgPct: has(S, 20) ? 0.1 : 0, // 힘20: 모든 피해 +10%
    pierceAdd: has(S, 30) ? 1 : 0, // 힘30: 관통 +1
    killExplodeChance: has(S, 40) ? 0.08 : 0, // 힘40: 처치 시 8% 폭발
    critChance: (has(D, 10) ? 0.03 : 0) + pass.critPct, // 민첩10 + 치명타 훈련
    critDmg: 1.5 + (has(S, 10) ? 0.1 : 0), // 기본 150%, 힘10 +10%
    movePct: has(D, 20) ? 0.05 : 0, // 민첩20: 이동 +5%
    extraArrows: has(D, 30) ? 1 : 0, // 민첩30: 기본 활 추가 화살 +1
    dodge: (has(D, 40) ? 0.08 : 0) + pass.dodgePct, // 민첩40 + 회피 훈련
    skillDmgPct: has(I, 10) ? 0.08 : 0, // 지능10: 스킬 피해 +8%
    skillAreaPct: has(I, 20) ? 0.1 : 0, // 지능20: 스킬 범위 +10%
    skillDurPct: has(I, 30) ? 0.15 : 0, // 지능30: 지속 +15%
    cdRefundChance: has(I, 40) ? 0.1 : 0, // 지능40: 10% 쿨타임 반환
    regen: (has(V, 10) ? 0.5 : 0) + (has(V, 30) ? 0.5 : 0), // 활력10+30
    dmgTakenMul: has(V, 20) ? 0.95 : 1, // 활력20: 받는 피해 -5%
    revive: has(V, 40), // 활력40: 부활
  }
}

// 능력치·스킬·특화(+카드 패시브 + 룬) → 최종 전투 stats.
// cardBonus: { dmg, move, hp, atkSpeed } — 레벨업 카드 패시브 누적 비율.
// --- 룬 합산 ----------------------------------------------------------------
// 슬롯 배열 → 종류별 합계. 룬 인스턴스는 { id, tier, v }.
// 스택 규칙:
//   damage / cooldown / pierce / projectile → 합산 (cooldown은 캡 적용)
//   burn(도트 %/초)                          → 최댓값만 (도트 중첩은 과해짐)
// 하위 호환: 문자열('damage')이나 단일 객체가 와도 동작한다.
export const RUNE_CDR_CAP = 45 // 룬만으로 줄일 수 있는 쿨타임 상한(%)
export const RUNE_CHILL_CAP = 55 // 이속 감소 상한(%) — 넘으면 적이 사실상 정지한다
const LEGACY_V = {
  damage: 20, cooldown: 15, pierce: 1, projectile: 1,
  burn: 30, poison: 12, chill: 20, vuln: 15,
}

// 중첩 규칙 — 룬을 추가할 때 **어느 쪽인지 반드시 정해야** 한다.
//   MAX  : 같은 종류를 여러 개 껴도 가장 큰 값만 (상태이상 — 대상에 1개만 붙으므로)
//   합산 : 값이 더해진다 (수치 강화)
// ⚠️ "명중 시 새 히트를 만드는" 효과(연쇄·폭발)는 **룬으로 넣지 않는다.**
//    발사체 수와 곱해져서 다발 사격(최대 18발)에 붙으면 히트가 폭증한다.
//    그런 원소는 특화(SPECIALIZATIONS)에서 배타적 선택으로 주는 게 맞다.
const RUNE_MAX_ONLY = { burn: 1, chill: 1, vuln: 1 }

export function aggregateRunes(slots) {
  const out = {
    damage: 0, cooldown: 0, pierce: 0, projectile: 0,
    burn: 0, poison: 0, chill: 0, vuln: 0,
  }
  if (!slots) return out
  const arr = Array.isArray(slots) ? slots : [slots]
  for (let i = 0; i < arr.length; i++) {
    const r = arr[i]
    if (!r) continue
    const id = typeof r === 'string' ? r : r.id
    if (!id || out[id] === undefined) continue
    const v = typeof r === 'string' ? LEGACY_V[id] : (r.v ?? LEGACY_V[id])
    if (RUNE_MAX_ONLY[id]) out[id] = Math.max(out[id], v)
    else out[id] += v
  }
  if (out.cooldown > RUNE_CDR_CAP) out.cooldown = RUNE_CDR_CAP
  if (out.chill > RUNE_CHILL_CAP) out.chill = RUNE_CHILL_CAP
  return out
}

// 발사체가 들고 다닐 상태이상 묶음.
// 화살마다 객체를 새로 만들면 GC 부담이 크므로, deriveStats 시점에 **한 번만** 만들고
// 발사체는 이 참조만 들고 다닌다(재계산 전까지 불변).
function makeSfx(agg) {
  if (!agg.burn && !agg.poison && !agg.chill && !agg.vuln) return null
  return { burn: agg.burn, poison: agg.poison, chill: agg.chill, vuln: agg.vuln }
}

// runeSlots: { basic|multishot|... : [ {id,tier,v} | null, ... ] }  (스킬당 N슬롯)
export function deriveStats(cfg, attr, skills, specs = {}, cardBonus = {}, runeSlots = {}) {
  const A = cfg.attr

  // 카드 패시브 배율 (뱀서 표준 진행)
  const cDmg = 1 + (cardBonus.dmg || 0)
  const cMove = 1 + (cardBonus.move || 0)
  const cHp = 1 + (cardBonus.hp || 0)
  const cAtk = 1 + (cardBonus.atkSpeed || 0)

  // 능력치
  const dmgMul = 1 + attr.str * A.strDamagePerPoint
  const atkSpd = Math.min(attr.dex * A.dexAtkSpeedPerPoint, A.atkSpeedCap)
  const moveAttr = Math.min(attr.dex * A.dexMovePerPoint, A.moveCap)
  const cdr = Math.min(attr.int * A.intCdrPerPoint, A.cdrCap)
  const hpAdd = attr.vit * A.vitHpPerPoint

  // 패시브 + 능력치 구간 보너스
  const p = passiveTotals(skills)
  const tb = tierBonuses(attr, p)

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

  // 기본 활 — 힘(전체 피해) + 궁술숙련 + 힘20 모든피해 + 카드 데미지
  s.weapon.damage =
    cfg.weapon.damage * dmgMul * (1 + p.basicDmgPct) * (1 + tb.allDmgPct) * cDmg
  s.weapon.cooldown = cfg.weapon.cooldown / (1 + atkSpd) / cAtk
  s.weapon.speed = cfg.weapon.speed * (1 + p.projSpeedPct)
  s.weapon.pierce = cfg.weapon.pierce + p.pierce + tb.pierceAdd
  s.weapon.extraArrows = tb.extraArrows // 민첩30: 기본 활 추가 화살
  s.weapon.burn = false

  // 기본 활 룬 (슬롯 여러 개 = 배열)
  const bagg = aggregateRunes(runeSlots.basic)
  if (bagg.damage) s.weapon.damage *= 1 + bagg.damage / 100
  if (bagg.cooldown)
    s.weapon.cooldown = Math.max(0.1, s.weapon.cooldown * (1 - bagg.cooldown / 100))
  if (bagg.pierce) s.weapon.pierce += bagg.pierce
  if (bagg.projectile) s.weapon.extraArrows += bagg.projectile
  if (bagg.burn) s.weapon.burn = bagg.burn // 도트 %/초 (0이면 없음)
  s.weapon.sfx = makeSfx(bagg) // 화상·독·냉기·취약 묶음 (없으면 null)

  // 이동/체력 — 능력치 + 카드 패시브
  s.player.speed = cfg.player.speed * (1 + moveAttr + p.movePct + tb.movePct) * cMove
  s.player.maxHp = (cfg.player.maxHp + hpAdd) * cHp

  // 확률/런타임 전투 수치 (game/sim 이 매 판정마다 참조)
  s.combat = {
    critChance: Math.min(tb.critChance, 1),
    critDmg: tb.critDmg,
    dodge: Math.min(tb.dodge, 0.75),
    dmgTakenMul: tb.dmgTakenMul,
    regen: tb.regen,
    killExplodeChance: tb.killExplodeChance,
    cdRefundChance: tb.cdRefundChance,
    revive: tb.revive,
  }

  // 액티브 스킬별 최종 수치. 힘·모든피해·지능10 스킬피해 적용.
  const skillBaseDmg =
    cfg.weapon.damage * dmgMul * cfg.skill.damageMul *
    (1 + tb.allDmgPct) * (1 + tb.skillDmgPct) * cDmg
  const skillCd = (base) => Math.max(A.minSkillCooldown, (base * (1 - cdr)) / cAtk)

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
    st.spreadMul = 1 // 다발사격 각도 배율 (특화가 조정)
    if (id === 'multishot') st.shots = e.shots
    if (id === 'rapidfire') {
      st.shots = e.shots
      st.interval = cfg.skill.shotInterval * (e.intervalMul || 1)
    }
    if (id === 'barrage') st.duration = e.duration * (1 + tb.skillDurPct)
    if (id === 'grenade') {
      st.count = e.count
      st.radius =
        cfg.skill.grenadeRadius *
        (e.radiusMul || 1) *
        (1 + p.grenadeRadiusPct) *
        (1 + tb.skillAreaPct)
      st.dmg *= 1 + p.grenadeDmgPct
    }

    // 5레벨 특화 보정
    const choice = specs[id]
    if (choice && SPECIALIZATIONS[id] && SPECIALIZATIONS[id][choice]) {
      const m = SPECIALIZATIONS[id][choice].mods
      if (m.dmgMul) st.dmg *= m.dmgMul
      if (m.shotsAdd && st.shots != null) st.shots += m.shotsAdd
      if (m.spreadMul) st.spreadMul *= m.spreadMul
      if (m.intervalMul && st.interval != null) st.interval *= m.intervalMul
      if (m.durationMul && st.duration != null) st.duration *= m.durationMul
      if (m.radiusMul && st.radius != null) st.radius *= m.radiusMul
      if (m.countAdd && st.count != null) st.count += m.countAdd
    }

    // 룬 (스킬당 슬롯 여러 개 = 배열). 등급·랜덤롤 수치를 합산해 적용.
    st.burn = false
    const agg = aggregateRunes(runeSlots[id])
    if (agg.damage) st.dmg *= 1 + agg.damage / 100
    if (agg.cooldown)
      st.cooldown = Math.max(A.minSkillCooldown, st.cooldown * (1 - agg.cooldown / 100))
    if (agg.pierce) st.pierce += agg.pierce
    if (agg.projectile) {
      if (st.shots != null) st.shots += agg.projectile
      else if (st.count != null) st.count += agg.projectile
      else if (st.duration != null) st.duration += 0.4 * agg.projectile
    }
    if (agg.burn) st.burn = agg.burn // 도트 %/초
    st.sfx = makeSfx(agg) // 화상·독·냉기·취약 묶음 (없으면 null)

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
