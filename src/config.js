// 모든 튜닝 수치의 단일 출처.
// 게임·튜너·랩·시뮬레이터가 이 파일을 공유하고, localStorage 로 값을 주고받는다.

const KEY = 'survivor.config.v1'

export const DEFAULTS = {
  player: {
    speed: 80,
    maxHp: 100,
    invuln: 0.6,
    pickupRadius: 50,
    radius: 9,
  },
  weapon: {
    damage: 5,
    cooldown: 1.2,
    speed: 1200,
    pierce: 1,
    knockback: 70,
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
    baseInterval: 1,
    rampPerMin: 1.35,
    rampCap: 12,
    maxEnemies: 500,
  },
  boss: {
    everySec: 60,
    hp: 100,
    hpRampPerMin: 1.2,
    speed: 42,
    contactDamage: 25,
    radius: 26,
    knockbackResist: 0.15,
    gems: 12,
  },
  xp: {
    gemValue: 1,
    levelBase: 5,
    levelGrowth: 1.1,
    magnetSpeed: 500,
  },
  upgrade: {
    damageAdd: 5,
    cooldownMul: 0.9,
    pierceAdd: 1,
    speedAdd: 10,
    maxHpAdd: 20,
    pickupAdd: 10,
  },
  // 액티브 스킬 — 획득하면 쿨다운마다 자동 발동
  skill: {
    cooldown: 10,
    damageMul: 0.5, // 무기 데미지의 몇 배로 나가는지
    barrageShots: 5, // 난사: 360° 무작위
    multishotShots: 5, // 다발사격: 타겟 방향
    multishotSpread: 30, // 다발사격 확산 각도(도)
    grenadeRadius: 10, // 폭발수류탄 폭발 반경(px)
    shotsPerLevel: 1, // 레벨당 발수 증가 (난사·다발사격)
    grenadeRadiusPerLevel: 4, // 레벨당 폭발 반경 증가
  },
}

// 튜너 슬라이더 메타데이터.
// effect: 값을 올릴 때(↑) / 내릴 때(↓) 게임에서 실제로 뭐가 바뀌는지.
export const SCHEMA = [
  {
    key: 'player',
    label: '플레이어',
    fields: [
      {
        key: 'speed',
        label: '이동 속도',
        min: 40,
        max: 500,
        step: 5,
        effect: '↑ 빨리 움직여 도망·젬줍기 쉬움  ·  ↓ 느려서 포위당하기 쉬움',
      },
      {
        key: 'maxHp',
        label: '최대 체력',
        min: 20,
        max: 500,
        step: 10,
        effect: '↑ 더 오래 버팀  ·  ↓ 몇 대에 사망',
      },
      {
        key: 'invuln',
        label: '피격 후 무적(초)',
        min: 0,
        max: 2,
        step: 0.05,
        effect: '↑ 맞은 뒤 잠깐 무적이라 연속피해 덜함  ·  ↓ 떼에 갇히면 순삭',
      },
      {
        key: 'pickupRadius',
        label: '젬 획득 범위',
        min: 20,
        max: 400,
        step: 5,
        effect: '↑ 멀리서도 젬이 빨려와 성장 빠름  ·  ↓ 직접 주우러 가야 함',
      },
      {
        key: 'radius',
        label: '크기(반지름)',
        min: 6,
        max: 40,
        step: 1,
        effect: '↑ 몸집이 커서 적에게 잘 닿음(불리)  ·  ↓ 작아서 회피 쉬움',
      },
    ],
  },
  {
    key: 'weapon',
    label: '무기 (활)',
    fields: [
      {
        key: 'damage',
        label: '데미지',
        min: 1,
        max: 100,
        step: 1,
        effect: '↑ 한 발이 세져 빨리 처치  ·  ↓ 약해서 오래 걸림',
      },
      {
        key: 'cooldown',
        label: '발사 간격(초)',
        min: 0.05,
        max: 2,
        step: 0.05,
        effect: '↑ 뜸하게 쏴 DPS 감소  ·  ↓ 자주 쏴 DPS 증가 (핵심 딜 수치)',
      },
      {
        key: 'speed',
        label: '화살 속도',
        min: 100,
        max: 1500,
        step: 20,
        effect: '↑ 빨라서 먼 적도 명중  ·  ↓ 느려서 빗나가거나 늦게 도달',
      },
      {
        key: 'pierce',
        label: '관통 수',
        min: 1,
        max: 10,
        step: 1,
        effect: '↑ 한 발이 여러 적을 뚫음(떼몰이 대응)  ·  ↓ 한 명만 맞음',
      },
      {
        key: 'knockback',
        label: '넉백',
        min: 0,
        max: 500,
        step: 10,
        effect: '↑ 맞은 적이 크게 밀려 거리 벌림  ·  ↓ 안 밀려 계속 붙음',
      },
      {
        key: 'range',
        label: '자동조준 사거리',
        min: 80,
        max: 800,
        step: 10,
        effect: '↑ 먼 적까지 자동 조준·발사  ·  ↓ 가까이 와야 쏨',
      },
    ],
  },
  {
    key: 'enemy',
    label: '적',
    fields: [
      {
        key: 'hp',
        label: '체력',
        min: 1,
        max: 200,
        step: 1,
        effect: '↑ 단단해서 처치 느림  ·  ↓ 물러서 금방 죽음',
      },
      {
        key: 'speed',
        label: '이동 속도',
        min: 10,
        max: 300,
        step: 2,
        effect: '↑ 빨라서 도망치기 어려움  ·  ↓ 느려서 쉽게 뿌리침',
      },
      {
        key: 'contactDamage',
        label: '접촉 데미지',
        min: 1,
        max: 50,
        step: 1,
        effect: '↑ 닿으면 크게 아픔  ·  ↓ 스쳐도 조금만 아픔',
      },
      {
        key: 'radius',
        label: '크기(반지름)',
        min: 4,
        max: 30,
        step: 1,
        effect: '↑ 커서 화살은 잘 맞지만 몸도 큼  ·  ↓ 작아서 명중 어려움',
      },
      {
        key: 'hpRampPerMin',
        label: '분당 체력 배율',
        min: 1,
        max: 2,
        step: 0.05,
        effect: '↑ 1분마다 적 체력 급증(후반 급격)  ·  ↓ 완만하게 상승',
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
        effect: '↑ 뜸하게 등장(쉬움)  ·  ↓ 촘촘히 쏟아짐(물량 폭증)',
      },
      {
        key: 'rampPerMin',
        label: '분당 스폰 배율',
        min: 1,
        max: 3,
        step: 0.05,
        effect: '↑ 1분마다 스폰량 급증(난이도 급상승)  ·  ↓ 완만',
      },
      {
        key: 'rampCap',
        label: '스폰 배율 상한',
        min: 1,
        max: 60,
        step: 1,
        effect: '↑ 후반 물량 상한이 높아 극한까지  ·  ↓ 상한이 낮아 관리 가능',
      },
      {
        key: 'maxEnemies',
        label: '동시 적 수 상한',
        min: 20,
        max: 1500,
        step: 20,
        effect: '↑ 화면에 적 많음(성능 부담↑)  ·  ↓ 덜 붐빔',
      },
    ],
  },
  {
    key: 'boss',
    label: '중간 보스',
    fields: [
      {
        key: 'everySec',
        label: '등장 간격(초)',
        min: 10,
        max: 300,
        step: 5,
        effect: '↑ 보스가 드물게 등장  ·  ↓ 자주 등장(압박↑)',
      },
      {
        key: 'hp',
        label: '체력',
        min: 50,
        max: 5000,
        step: 50,
        effect: '↑ 오래 살아 위협 지속  ·  ↓ 금방 처치',
      },
      {
        key: 'hpRampPerMin',
        label: '분당 체력 배율',
        min: 1,
        max: 3,
        step: 0.05,
        effect: '↑ 뒤에 나오는 보스일수록 급격히 강해짐  ·  ↓ 완만',
      },
      {
        key: 'speed',
        label: '이동 속도',
        min: 10,
        max: 200,
        step: 2,
        effect: '↑ 빨라서 따돌리기 힘듦  ·  ↓ 느려서 피하기 쉬움',
      },
      {
        key: 'contactDamage',
        label: '접촉 데미지',
        min: 1,
        max: 100,
        step: 1,
        effect: '↑ 닿으면 치명적  ·  ↓ 덜 아픔',
      },
      {
        key: 'radius',
        label: '크기(반지름)',
        min: 12,
        max: 60,
        step: 2,
        effect: '↑ 커서 화살 잘 맞지만 존재감·압박↑  ·  ↓ 작음',
      },
      {
        key: 'knockbackResist',
        label: '넉백 저항 (0=꿈쩍않음)',
        min: 0,
        max: 1,
        step: 0.05,
        effect: '0에 가까울수록 안 밀려 버팀  ·  1이면 잡몹처럼 밀려남',
      },
      {
        key: 'gems',
        label: '드랍 젬 수',
        min: 1,
        max: 50,
        step: 1,
        effect: '↑ 처치 시 성장 보상 큼  ·  ↓ 보상 적음',
      },
    ],
  },
  {
    key: 'xp',
    label: '경험치 / 레벨',
    fields: [
      {
        key: 'gemValue',
        label: '젬 하나의 경험치',
        min: 1,
        max: 20,
        step: 1,
        effect: '↑ 젬 하나가 경험치 많이 줘 레벨 빠름  ·  ↓ 성장 느림',
      },
      {
        key: 'levelBase',
        label: '1레벨 필요 경험치',
        min: 1,
        max: 50,
        step: 1,
        effect: '↑ 첫 레벨업까지 오래  ·  ↓ 초반부터 빠른 성장',
      },
      {
        key: 'levelGrowth',
        label: '레벨당 필요치 배율',
        min: 1,
        max: 2,
        step: 0.05,
        effect: '↑ 레벨마다 필요치 급증(후반 성장 정체)  ·  ↓ 계속 쭉 성장',
      },
      {
        key: 'magnetSpeed',
        label: '젬 빨려오는 속도',
        min: 100,
        max: 1500,
        step: 20,
        effect: '↑ 젬이 빠르게 붙음  ·  ↓ 천천히 다가옴',
      },
    ],
  },
  {
    key: 'upgrade',
    label: '레벨업 카드 효과',
    fields: [
      {
        key: 'damageAdd',
        label: '데미지 + 량',
        min: 1,
        max: 50,
        step: 1,
        effect: "↑ '날카로운 촉' 카드의 데미지 상승폭이 커짐  ·  ↓ 작아짐",
      },
      {
        key: 'cooldownMul',
        label: '쿨다운 × 배율 (낮을수록 강함)',
        min: 0.5,
        max: 0.99,
        step: 0.01,
        effect: "낮을수록 '속사' 카드가 강력(쿨다운 크게 감소)  ·  1에 가까우면 미미",
      },
      {
        key: 'pierceAdd',
        label: '관통 + 량',
        min: 1,
        max: 5,
        step: 1,
        effect: "↑ '관통' 카드가 더 많은 적을 뚫게 됨  ·  ↓ 조금만",
      },
      {
        key: 'speedAdd',
        label: '이동속도 + 량',
        min: 5,
        max: 100,
        step: 5,
        effect: "↑ '날렵함' 카드의 이속 상승폭↑  ·  ↓ 조금만",
      },
      {
        key: 'maxHpAdd',
        label: '최대체력 + 량',
        min: 5,
        max: 100,
        step: 5,
        effect: "↑ '강인함' 카드의 체력 상승폭↑  ·  ↓ 조금만",
      },
      {
        key: 'pickupAdd',
        label: '획득범위 + 량',
        min: 5,
        max: 150,
        step: 5,
        effect: "↑ '자석' 카드의 획득범위 상승폭↑  ·  ↓ 조금만",
      },
    ],
  },
  {
    key: 'skill',
    label: '액티브 스킬 (난사·다발사격·수류탄)',
    fields: [
      {
        key: 'cooldown',
        label: '스킬 쿨타임(초)',
        min: 1,
        max: 30,
        step: 0.5,
        effect: '↑ 스킬이 뜸하게 터짐  ·  ↓ 자주 터져 강력해짐 (3종 공통)',
      },
      {
        key: 'damageMul',
        label: '스킬 데미지 배율',
        min: 0.1,
        max: 3,
        step: 0.05,
        effect:
          '무기 데미지 대비 배율. 0.5 = 절반  ·  ↑ 스킬이 세짐  ·  ↓ 약해짐',
      },
      {
        key: 'barrageShots',
        label: '난사: 발수',
        min: 1,
        max: 30,
        step: 1,
        effect: '↑ 360° 사방으로 더 많이 쏨(포위 대응↑)  ·  ↓ 적게',
      },
      {
        key: 'multishotShots',
        label: '다발사격: 발수',
        min: 1,
        max: 30,
        step: 1,
        effect: '↑ 타겟 방향으로 더 많이 쏨(집중 화력↑)  ·  ↓ 적게',
      },
      {
        key: 'multishotSpread',
        label: '다발사격: 퍼짐 각도(도)',
        min: 0,
        max: 180,
        step: 5,
        effect: '↑ 넓게 퍼져 여러 적에 분산  ·  ↓ 좁게 모여 한 곳에 집중',
      },
      {
        key: 'grenadeRadius',
        label: '수류탄: 폭발 반경(px)',
        min: 5,
        max: 200,
        step: 5,
        effect: '↑ 폭발이 넓어 여러 적을 한 번에  ·  ↓ 좁아서 거의 단일 타겟',
      },
      {
        key: 'shotsPerLevel',
        label: '레벨당 발수 증가',
        min: 0,
        max: 5,
        step: 1,
        effect: '난사·다발사격 카드를 또 뽑을 때마다 늘어나는 발수',
      },
      {
        key: 'grenadeRadiusPerLevel',
        label: '레벨당 폭발 반경 증가',
        min: 0,
        max: 40,
        step: 1,
        effect: '수류탄 카드를 또 뽑을 때마다 넓어지는 폭발 반경',
      },
    ],
  },
]

function clone(o) {
  return JSON.parse(JSON.stringify(o))
}

// 저장된 값에 없는 항목은 기본값으로 채운다.
// (설정 항목을 나중에 추가해도 기존 저장본이 깨지지 않는다)
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

// --- 프리셋 A/B/C ----------------------------------------------------------
// 현재 튜닝값을 슬롯에 저장해두고 나중에 불러와 비교한다.

export const PRESET_SLOTS = ['A', 'B', 'C']

function presetKey(slot) {
  return `survivor.preset.${slot}`
}

export function savePreset(slot, cfg) {
  localStorage.setItem(presetKey(slot), JSON.stringify(cfg))
}

export function loadPreset(slot) {
  try {
    const raw = JSON.parse(localStorage.getItem(presetKey(slot)))
    return raw ? withDefaults(raw) : null
  } catch {
    return null
  }
}

export function hasPreset(slot) {
  return localStorage.getItem(presetKey(slot)) != null
}

export function deletePreset(slot) {
  localStorage.removeItem(presetKey(slot))
}

// 다른 탭/프레임에서 설정이 바뀌면 알려준다.
// (storage 이벤트는 값을 바꾼 문서 자신에게는 발생하지 않는다)
export function onConfigChange(cb) {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) cb(loadConfig())
  })
}
