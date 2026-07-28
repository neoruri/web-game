// 성장 시스템의 계산 모듈. UI 와 완전히 분리된 순수 함수만 둔다.
//
// 스펙 요구: "모든 최종 수치는 한 곳에서 재계산하는 함수로 관리".
// deriveStats() 가 그 단일 지점이다 — 능력치·스킬 레벨을 받아 실제 전투에 쓰는
// stats 객체를 만든다. 게임/시뮬 어느 쪽도 전투 수치를 직접 수정하지 않고,
// 능력치가 바뀔 때마다 이 함수로 통째로 다시 계산한다.

export const ATTR_KEYS = ['str', 'dex', 'int', 'vit']

export const ATTR_LABELS = {
  str: '힘',
  dex: '민첩',
  int: '지능',
  vit: '활력',
}

export function emptyAttributes() {
  return { str: 0, dex: 0, int: 0, vit: 0 }
}

function clone(o) {
  return JSON.parse(JSON.stringify(o))
}

// 능력치·스킬 → 최종 전투 stats.
// 원본 cfg 는 건드리지 않는다(기본값 유지). 항상 기본값에서 새로 계산한다.
export function deriveStats(cfg, attr, skills) {
  const A = cfg.attr

  const dmgMul = 1 + attr.str * A.strDamagePerPoint
  const atkSpd = Math.min(attr.dex * A.dexAtkSpeedPerPoint, A.atkSpeedCap)
  const moveBonus = Math.min(attr.dex * A.dexMovePerPoint, A.moveCap)
  const cdr = Math.min(attr.int * A.intCdrPerPoint, A.cdrCap)
  const hpAdd = attr.vit * A.vitHpPerPoint

  // 전투에서 참조하는 그룹만 복제해 최종값을 덮어쓴다
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

  // 힘 → 기본활·스킬 피해 (스킬 데미지는 weapon.damage 기반이라 자동 반영)
  s.weapon.damage = cfg.weapon.damage * dmgMul
  // 민첩 → 기본활 공격속도(쿨다운 단축). 스킬 쿨에는 적용하지 않는다(스펙).
  s.weapon.cooldown = cfg.weapon.cooldown / (1 + atkSpd)
  // 민첩 → 이동속도
  s.player.speed = cfg.player.speed * (1 + moveBonus)
  // 활력 → 최대 HP
  s.player.maxHp = cfg.player.maxHp + hpAdd
  // 지능 → 스킬 쿨다운 감소 (하한 적용)
  s.skill.cooldown = Math.max(A.minSkillCooldown, cfg.skill.cooldown * (1 - cdr))

  // 성장 화면 표시용 파생값 (백분율로 미리 계산)
  s.derived = {
    dmgPct: round1((dmgMul - 1) * 100),
    atkSpdPct: round1(atkSpd * 100),
    movePct: round1(moveBonus * 100),
    cdrPct: round1(cdr * 100),
    hpAdd,
  }
  return s
}

// 능력치 하나의 "현재 효과" 문구 (성장 화면용)
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

// 다음 구간 보너스 안내 (10/20/30/40). 효과는 3단계에서 구현, 지금은 예고만.
const TIER_HINTS = {
  str: { 10: '치명타 피해 +10%', 20: '모든 피해 +10%', 30: '관통 +1', 40: '처치 시 폭발' },
  dex: { 10: '치명타 확률 +3%', 20: '이동 +5%', 30: '추가 화살 +1', 40: '회피 +8%' },
  int: { 10: '스킬 피해 +8%', 20: '스킬 범위 +10%', 30: '지속 +15%', 40: '쿨타임 반환' },
  vit: { 10: 'HP 회복 +0.5', 20: '받는 피해 -5%', 30: 'HP 회복 +0.5', 40: '치명타 방어' },
}

export function nextTierText(key, value) {
  const tiers = [10, 20, 30, 40]
  for (const t of tiers) {
    if (value < t) return `${t}: ${TIER_HINTS[key][t]}`
  }
  return '최대 구간 도달'
}

function round1(x) {
  return Math.round(x * 10) / 10
}
