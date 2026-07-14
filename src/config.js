// 모든 튜닝 수치의 단일 출처.
// 게임과 튜너 페이지가 이 파일을 공유하고, localStorage 를 통해 값을 주고받는다.

const KEY = 'survivor.config.v1'

export const DEFAULTS = {
  player: {
    speed: 110,
    maxHp: 100,
    invuln: 0.6,
    pickupRadius: 50,
    radius: 9,
  },
  weapon: {
    damage: 5,
    cooldown: 1,
    speed: 1200,
    pierce: 1,
    knockback: 50,
    range: 150,
  },
  enemy: {
    hp: 10,
    speed: 50,
    contactDamage: 8,
    radius: 8,
    hpRampPerMin: 1.1,
  },
  spawn: {
    baseInterval: 1.2,
    rampPerMin: 1.3,
    rampCap: 8,
    maxEnemies: 500,
  },
  boss: {
    everySec: 60,
    hp: 400,
    hpRampPerMin: 1.6,
    speed: 42,
    contactDamage: 25,
    radius: 26,
    knockbackResist: 0.15, // 1 = 일반 적과 동일, 0 = 넉백 완전 무시
    gems: 12, // 죽을 때 떨구는 젬 수
  },
  xp: {
    gemValue: 1,
    levelBase: 5,
    levelGrowth: 1.35,
    magnetSpeed: 420,
  },
  // 레벨업 카드가 한 번에 올려주는 양
  upgrade: {
    damageAdd: 5,
    cooldownMul: 0.9,
    pierceAdd: 1,
    speedAdd: 10,
    maxHpAdd: 20,
    pickupAdd: 20,
  },
}

// 튜너 페이지의 슬라이더를 자동 생성하기 위한 메타데이터.
export const SCHEMA = [
  {
    key: 'player',
    label: '플레이어',
    fields: [
      { key: 'speed', label: '이동 속도', min: 60, max: 500, step: 5 },
      { key: 'maxHp', label: '최대 체력', min: 20, max: 500, step: 10 },
      { key: 'invuln', label: '피격 후 무적(초)', min: 0, max: 2, step: 0.05 },
      { key: 'pickupRadius', label: '젬 획득 범위', min: 20, max: 400, step: 5 },
      { key: 'radius', label: '크기(반지름)', min: 6, max: 40, step: 1 },
    ],
  },
  {
    key: 'weapon',
    label: '무기 (활)',
    fields: [
      { key: 'damage', label: '데미지', min: 1, max: 100, step: 1 },
      { key: 'cooldown', label: '발사 간격(초)', min: 0.05, max: 2, step: 0.05 },
      { key: 'speed', label: '화살 속도', min: 100, max: 1200, step: 20 },
      { key: 'pierce', label: '관통 수', min: 1, max: 10, step: 1 },
      { key: 'knockback', label: '넉백', min: 0, max: 500, step: 10 },
      { key: 'range', label: '자동조준 사거리', min: 80, max: 800, step: 10 },
    ],
  },
  {
    key: 'enemy',
    label: '적',
    fields: [
      { key: 'hp', label: '체력', min: 1, max: 200, step: 1 },
      { key: 'speed', label: '이동 속도', min: 10, max: 300, step: 2 },
      { key: 'contactDamage', label: '접촉 데미지', min: 1, max: 50, step: 1 },
      { key: 'radius', label: '크기(반지름)', min: 4, max: 30, step: 1 },
      {
        key: 'hpRampPerMin',
        label: '분당 체력 배율',
        min: 1,
        max: 2,
        step: 0.05,
      },
    ],
  },
  {
    key: 'spawn',
    label: '스폰 / 난이도',
    fields: [
      {
        key: 'baseInterval',
        label: '기본 스폰 간격(초)',
        min: 0.05,
        max: 3,
        step: 0.05,
      },
      { key: 'rampPerMin', label: '분당 스폰 배율', min: 1, max: 3, step: 0.05 },
      { key: 'rampCap', label: '스폰 배율 상한', min: 1, max: 60, step: 1 },
      { key: 'maxEnemies', label: '동시 적 수 상한', min: 20, max: 1500, step: 20 },
    ],
  },
  {
    key: 'boss',
    label: '중간 보스',
    fields: [
      { key: 'everySec', label: '등장 간격(초)', min: 10, max: 300, step: 5 },
      { key: 'hp', label: '체력', min: 50, max: 5000, step: 50 },
      {
        key: 'hpRampPerMin',
        label: '분당 체력 배율',
        min: 1,
        max: 3,
        step: 0.05,
      },
      { key: 'speed', label: '이동 속도', min: 10, max: 200, step: 2 },
      { key: 'contactDamage', label: '접촉 데미지', min: 1, max: 100, step: 1 },
      { key: 'radius', label: '크기(반지름)', min: 12, max: 60, step: 2 },
      {
        key: 'knockbackResist',
        label: '넉백 저항 (0=무시)',
        min: 0,
        max: 1,
        step: 0.05,
      },
      { key: 'gems', label: '드랍 젬 수', min: 1, max: 50, step: 1 },
    ],
  },
  {
    key: 'xp',
    label: '경험치 / 레벨',
    fields: [
      { key: 'gemValue', label: '젬 하나의 경험치', min: 1, max: 20, step: 1 },
      { key: 'levelBase', label: '1레벨 필요 경험치', min: 1, max: 50, step: 1 },
      {
        key: 'levelGrowth',
        label: '레벨당 필요치 배율',
        min: 1,
        max: 2,
        step: 0.05,
      },
      { key: 'magnetSpeed', label: '젬 빨려오는 속도', min: 100, max: 1500, step: 20 },
    ],
  },
  {
    key: 'upgrade',
    label: '레벨업 카드 효과',
    fields: [
      { key: 'damageAdd', label: '데미지 + 량', min: 1, max: 50, step: 1 },
      {
        key: 'cooldownMul',
        label: '쿨다운 × 배율 (낮을수록 강함)',
        min: 0.5,
        max: 0.99,
        step: 0.01,
      },
      { key: 'pierceAdd', label: '관통 + 량', min: 1, max: 5, step: 1 },
      { key: 'speedAdd', label: '이동속도 + 량', min: 5, max: 100, step: 5 },
      { key: 'maxHpAdd', label: '최대체력 + 량', min: 5, max: 100, step: 5 },
      { key: 'pickupAdd', label: '획득범위 + 량', min: 5, max: 150, step: 5 },
    ],
  },
]

function clone(o) {
  return JSON.parse(JSON.stringify(o))
}

// 저장된 값에 없는 항목은 기본값으로 채운다.
// (나중에 설정 항목을 추가해도 기존 저장본이 깨지지 않는다)
function withDefaults(saved) {
  const out = clone(DEFAULTS)
  if (!saved) return out
  for (const group of Object.keys(out)) {
    if (!saved[group]) continue
    for (const field of Object.keys(out[group])) {
      const v = saved[group][field]
      if (typeof v === 'number' && Number.isFinite(v)) out[group][field] = v
    }
  }
  return out
}

export function loadConfig() {
  try {
    return withDefaults(JSON.parse(localStorage.getItem(KEY)))
  } catch {
    return clone(DEFAULTS)
  }
}

export function saveConfig(cfg) {
  localStorage.setItem(KEY, JSON.stringify(cfg))
}

export function resetConfig() {
  localStorage.removeItem(KEY)
  return clone(DEFAULTS)
}

// 다른 탭/프레임에서 설정이 바뀌면 알려준다.
// (storage 이벤트는 값을 바꾼 문서 자신에게는 발생하지 않는다 —
//  그래서 튜너에서 바꾸면 게임 쪽에서만 이 콜백이 돈다)
export function onConfigChange(cb) {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) cb(loadConfig())
  })
}
