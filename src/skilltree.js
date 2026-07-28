// 스킬 트리 데이터 — 3계열, 각 노드의 해금 조건·레벨별 효과.
//
// 설계 원칙(스펙):
//  - 기본 해금 조건은 캐릭터 레벨. 선행 스킬 조건은 최소한만.
//  - 액티브 스킬(다발/연발/난사/수류탄)은 레벨별 효과 테이블을 가진다.
//  - 패시브는 레벨당 선형 효과.
//  - 5레벨 특화는 3단계에서 구현 — 지금은 데이터에 표시만.
//
// 전투 반영은 progression.deriveStats() 가 이 데이터를 읽어 계산한다.

// 액티브 스킬. eff(level) → 그 레벨에서의 누적 효과 객체.
export const ACTIVE_SKILLS = {
  multishot: {
    id: 'multishot',
    name: '다발 사격',
    tree: 'archery',
    unlockLevel: 1,
    maxLevel: 10,
    baseCooldown: 3,
    desc: '가장 가까운 적 방향으로 부채꼴 연사',
    // 레벨별 화살 수·피해배율·관통 (누적)
    eff: (lv) => ({
      shots: [0, 5, 6, 6, 7, 7, 7, 9, 9, 9, 9][lv] ?? 5,
      dmgMul: 1 + (lv >= 8 ? 0.35 : lv >= 3 ? 0.15 : 0),
      pierceBonus: lv >= 6 ? 1 : 0,
    }),
  },
  rapidfire: {
    id: 'rapidfire',
    name: '연발 사격',
    tree: 'archery',
    unlockLevel: 5,
    maxLevel: 10,
    baseCooldown: 4,
    desc: '가장 가까운 적을 단일 집중 연사',
    eff: (lv) => ({
      shots: [0, 5, 6, 6, 7, 7, 7, 9, 9, 9, 9][lv] ?? 5,
      dmgMul: 1 + (lv >= 8 ? 0.2 : 0),
      pierceBonus: lv >= 6 ? 1 : 0,
      // 3레벨↑ 연사 속도 증가 → 연사 간격 배율
      intervalMul: lv >= 3 ? 0.7 : 1,
    }),
  },
  barrage: {
    id: 'barrage',
    name: '난사',
    tree: 'mobility',
    unlockLevel: 10,
    maxLevel: 10,
    baseCooldown: 7,
    desc: '이동하며 주변 360° 로 화살 난사',
    eff: (lv) => ({
      // 지속시간(초) — 발사 횟수를 좌우
      duration: [0, 1.5, 1.5, 1.5, 1.8, 1.8, 1.8, 1.8, 2.2, 2.2, 2.2][lv] ?? 1.5,
      dmgMul: 1 + (lv >= 3 ? 0.15 : 0),
      pierceBonus: lv >= 6 ? 1 : 0,
    }),
  },
  grenade: {
    id: 'grenade',
    name: '수류탄',
    tree: 'explosive',
    unlockLevel: 15,
    maxLevel: 10,
    baseCooldown: 5,
    desc: '적이 밀집한 곳에 던져 범위 폭발',
    eff: (lv) => ({
      count: [0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3][lv] ?? 1,
      dmgMul: 1 + (lv >= 3 ? 0.15 : 0),
      radiusMul: 1 + (lv >= 6 ? 0.2 : lv >= 2 ? 0.1 : 0),
    }),
  },
}

// 패시브 스킬. 레벨당 선형 효과 (per) — deriveStats 가 합산해 곱/가산.
export const PASSIVE_SKILLS = {
  archeryMastery: {
    id: 'archeryMastery',
    name: '궁술 숙련',
    tree: 'archery',
    unlockLevel: 1,
    maxLevel: 5,
    per: { basicDmgPct: 0.05, projSpeedPct: 0.03 },
    desc: '레벨당 기본 활 피해 +5%, 투사체 속도 +3%',
  },
  piercingArrow: {
    id: 'piercingArrow',
    name: '관통 화살',
    tree: 'archery',
    unlockLevel: 1,
    maxLevel: 3,
    requires: { multishot: 3 },
    per: { pierce: 1 },
    desc: '레벨당 기본활·사격 계열 관통 +1 (다발사격 3레벨 필요)',
  },
  critTraining: {
    id: 'critTraining',
    name: '치명타 훈련',
    tree: 'archery',
    unlockLevel: 1,
    maxLevel: 5,
    per: { critPct: 0.02 },
    desc: '레벨당 치명타 확률 +2% (치명타는 3단계에서 전투 반영)',
  },
  moveMastery: {
    id: 'moveMastery',
    name: '이동 속도 강화',
    tree: 'mobility',
    unlockLevel: 1,
    maxLevel: 5,
    per: { movePct: 0.02 },
    desc: '레벨당 이동 속도 +2%',
  },
  dodgeTraining: {
    id: 'dodgeTraining',
    name: '회피 훈련',
    tree: 'mobility',
    unlockLevel: 1,
    maxLevel: 5,
    per: { dodgePct: 0.01 },
    desc: '레벨당 회피 확률 +1%',
  },
  explosiveMastery: {
    id: 'explosiveMastery',
    name: '폭발물 숙련',
    tree: 'explosive',
    unlockLevel: 1,
    maxLevel: 5,
    per: { grenadeDmgPct: 0.05, grenadeRadiusPct: 0.02 },
    desc: '레벨당 수류탄 피해 +5%, 폭발 범위 +2%',
  },
}

// 5레벨 특화 — 스킬이 5레벨에 도달하면 A/B 중 하나 선택(이후 변경 불가).
// mods: deriveStats 가 해당 스킬 최종 수치에 곱/가하는 보정.
export const SPECIALIZATIONS = {
  multishot: {
    A: { name: '집중 사격', desc: '각도 좁고 피해 +50%', mods: { dmgMul: 1.5, spreadMul: 0.4 } },
    B: { name: '확산 사격', desc: '각도 넓고 화살 +3, 피해 -10%', mods: { dmgMul: 0.9, spreadMul: 1.6, shotsAdd: 3 } },
  },
  rapidfire: {
    A: { name: '추적 연사', desc: '피해 +20%', mods: { dmgMul: 1.2 } },
    B: { name: '집중 연사', desc: '연사 속도 +30%', mods: { intervalMul: 0.7 } },
  },
  barrage: {
    A: { name: '그림자 난사', desc: '지속시간 +40%', mods: { durationMul: 1.4 } },
    B: { name: '방어 난사', desc: '피해 +25%', mods: { dmgMul: 1.25 } },
  },
  grenade: {
    A: { name: '집속 폭탄', desc: '범위 좁고 피해 +60%', mods: { dmgMul: 1.6, radiusMul: 0.6 } },
    B: { name: '확산 폭탄', desc: '범위 +40%, 개수 +1', mods: { radiusMul: 1.4, countAdd: 1 } },
  },
}

export const SPEC_LEVEL = 5 // 이 레벨에 도달하면 특화 선택 가능

export function emptySpecs() {
  const o = {}
  for (const id of Object.keys(SPECIALIZATIONS)) o[id] = null
  return o
}

// 계열 정의 (UI 열 구성)
export const TREES = [
  { id: 'archery', name: '사격', color: '#89dceb' },
  { id: 'mobility', name: '기동', color: '#a6e3a1' },
  { id: 'explosive', name: '폭발물', color: '#fab387' },
]

export const ACTIVE_IDS = Object.keys(ACTIVE_SKILLS)
export const PASSIVE_IDS = Object.keys(PASSIVE_SKILLS)

// 빈 스킬 레벨 상태 (모든 스킬 0)
export function emptySkillTree() {
  const o = {}
  for (const id of ACTIVE_IDS) o[id] = 0
  for (const id of PASSIVE_IDS) o[id] = 0
  return o
}

// 특정 스킬에 1포인트 더 투자 가능한가? (사유 문자열 반환, null = 가능)
export function investBlockReason(skillId, levels, charLevel) {
  const def = ACTIVE_SKILLS[skillId] || PASSIVE_SKILLS[skillId]
  if (!def) return '없는 스킬'

  const cur = levels[skillId] || 0
  if (cur >= def.maxLevel) return '최대 레벨'
  if (charLevel < def.unlockLevel) return `레벨 ${def.unlockLevel} 필요`

  if (def.requires) {
    for (const [reqId, reqLv] of Object.entries(def.requires)) {
      if ((levels[reqId] || 0) < reqLv) {
        const reqName = (ACTIVE_SKILLS[reqId] || PASSIVE_SKILLS[reqId]).name
        return `${reqName} ${reqLv}레벨 필요`
      }
    }
  }
  return null
}
