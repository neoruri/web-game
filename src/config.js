// 모든 튜닝 수치의 단일 출처.
// 게임·튜너·랩·시뮬레이터가 이 파일을 공유하고, localStorage 로 값을 주고받는다.

// 저장 키에 버전을 붙인다. 밸런스 기본값을 크게 바꿀 때 버전을 올리면
// 브라우저에 남은 옛 저장값을 무시하고 새 기본값으로 시작한다.
//
// v4 → v5 (2026-08-11): 일반몹 룬 드랍을 폐기(normalDropChance 0.01 → 0)하고
//   엘리트 드랍으로 옮겼다. 그런데 withDefaults() 는 **저장된 숫자를 기본값 위에
//   덮어쓴다** — v4 키에 남아 있던 0.01 이 계속 살아나서 일반몹이 여전히 룬을
//   드랍했다. 기본값만 바꾸는 것으로는 부족하고 키 버전을 올려야 한다.
//   ⚠️ 앞으로도 기본값을 "0으로 끄는" 변경을 할 때는 반드시 이 키를 올릴 것.
const KEY = 'survivor.config.v5'

export const DEFAULTS = {
  player: {
    speed: 100,
    maxHp: 100,
    invuln: 0.8,
    pickupRadius: 50,
    radius: 10, // 히트박스 + 외형(스프라이트) + 그림자를 함께 결정
  },
  weapon: {
    damage: 20,
    cooldown: 1.2,
    speed: 1200,
    // 관통 1(원복). 이전에 2로 올렸던 건 화살 터널링 버그를 보정하려던 것 —
    // 스윕 판정으로 버그를 고치니 불필요해져 되돌림(중복 완화 방지).
    pierce: 1,
    knockback: 70,
    // 자동조준 사거리. 이 안에 든 적만 쏜다. (튜너 조정값)
    range: 300,
  },
  enemy: {
    hp: 30,
    speed: 50,
    contactDamage: 8,
    radius: 10,
    hpRampPerMin: 1.1,
    sepStrength: 45, // 겹침 방지: 서로 밀어내는 힘 (0=겹침 허용)
    sepRadius: 20, // 이 거리 안의 적끼리만 밀어냄
    // 돌진형: 조금 빠르지만 약함 (플레이어 이속보다는 느리게 — 회피 가능)
    rusherChance: 0.22,
    rusherSpeedMul: 1.4,
    rusherHpMul: 0.55,
    rusherStartSec: 30, // 이 시간(초) 후부터 등장
    // 원거리형: 카이팅하며 탄 발사. 무기 사거리보다 안쪽에서 멈춰야 반격 가능
    shooterChance: 0.06,
    shooterSpeedMul: 0.85,
    shooterHpMul: 0.9,
    shooterStartSec: 90, // 이 시간(초) 후부터 등장
    shooterRange: 120, // 이 거리에서 멈춰 쏨
    shooterRetreat: 200, // 이보다 가까우면 후퇴
    shooterInterval: 8, // 발사 주기(초) — 클수록 뜸하게
    shooterBoltSpeed: 190,
    shooterBoltDamage: 7,
    wobble: 0.3, // 유기적 움직임: 추격 방향에 주는 좌우 흔들림(0=직선)
    hitStunSec: 0.3, // 피격 시 경직(정지) 시간(초). 0=경직 없음
  },
  spawn: {
    baseInterval: 0.7, // 원복(스윕 판정 수정으로 화살 명중률 정상화 → 완화 불필요)
    rampPerMin: 1.5,
    rampCap: 17,
    maxEnemies: 300,
  },
  // 룬 드랍 — **엘리트/보스 전용**. 일반몹 %드랍은 폐기했다.
  // 이유: 일반몹 드랍은 킬 수에 선형 비례하는데 킬 수가 후반에 폭증해서
  //       10분에 룬이 50~100개까지 쌓였다(가방 UI가 사용 불가). 킬 비례를 버리고
  //       **시간 기반**(엘리트 등장 주기)으로 바꾸면 판당 개수가 예측 가능해진다.
  // ⚠️ normalDropChance 를 다시 0보다 크게 올리면 그 폭주가 그대로 재현된다.
  rune: {
    normalDropChance: 0,
  },
  // 골드 — 판이 끝나도 **남는** 유일한 재화. 다음 판 시작 스탯 업그레이드에 쓴다.
  // ⚠️ 룬과 달리 골드는 킬 수 비례여도 괜찮다. 룬은 슬롯이 3칸뿐이라 개수가
  //    폭주하면 UI가 무너지지만, 골드는 그냥 숫자라 많아도 문제가 없다.
  //    (다만 업그레이드 가격은 후반 킬 수를 기준으로 정해야 한다)
  gold: {
    dropChance: 0.12, // 일반몹 드랍 확률
    min: 1, // 드랍 시 최소 개수
    max: 2, // 최대 개수
    eliteAmount: 10, // 엘리트 확정 드랍
    bossAmount: 25, // 보스 확정 드랍
    magnetSpeed: 460, // 획득 범위 안에서 빨려오는 속도(px/s)
    life: 14, // 이 시간(초) 뒤 사라진다 — 화면에 무한히 쌓이지 않게
  },
  // 엘리트 몹 — 예고가 있는 공격 패턴 4종. 시간 기반 등장 + 룬 확정 드랍.
  // 능력치만 바꾸는 접두어(이속/체력)가 아니라 **플레이어가 할 행동을 바꾸는** 설계:
  //   돌격자=측면 회피 / 포격수=자리 비우기 / 산탄사수=각도 이탈 / 수호자=우선순위 처치
  elite: {
    firstSec: 30, // 첫 엘리트 등장(초)
    everySec: 24, // 이후 등장 간격(초)
    maxAlive: 3, // 동시 생존 상한 (넘으면 등장을 미룬다)
    hpMul: 4, // 일반 적 대비 체력 — 패턴을 최소 한 번은 보여줘야 하므로 필요
    speedMul: 0.9,
    radius: 16,
    contactDamage: 14,
    gems: 5,
    knockbackResist: 0.4,
    attackInterval: 4.5, // 패턴 발동 주기(초)
    telegraphTime: 0.7, // 예고 시간 — 짧으면 불공평, 길면 시시하다
    // 돌격자
    chargeSpeedMul: 4.2,
    chargeDur: 0.5,
    chargeDamage: 22,
    // 포격수
    shellRadius: 46,
    shellDamage: 18,
    // 산탄사수
    scatterCount: 5,
    scatterSpread: 0.3, // 발사체 사이 각도(라디안)
    scatterBoltSpeed: 200,
    scatterBoltDamage: 8,
    // 수호자 — 주변 일반 적을 강화(오라). 처치 우선순위를 만드는 장치.
    wardenRadius: 150,
    wardenSpeedMul: 1.35,
    wardenDamageMul: 1.4,
  },
  boss: {
    everySec: 60,
    firstBossSec: 55, // 첫 보스만 앞당겨 룬을 일찍 경험하게. 이후는 everySec 간격.
    hp: 300,
    hpRampPerMin: 1.1,
    speed: 42,
    contactDamage: 25,
    radius: 26,
    knockbackResist: 0.15,
    gems: 12,
    // 라인 부채꼴 탄막 (예고 → 실탄)
    attackInterval: 6, // 공격 주기(초)
    lineCount: 3, // 부채꼴 라인 수
    lineSpread: 0.3, // 라인 사이 각도(라디안)
    boltSpeed: 130, // 탄속(px/s)
    boltDamage: 12, // 탄 하나의 피해
    telegraphTime: 0.4, // 예고 표시 시간(초)
  },
  xp: {
    gemValue: 1,
    levelBase: 5,
    levelGrowth: 1.1,
    magnetSpeed: 500,
  },
  // 능력치 시스템 (룬 피벗으로 보류 — attr 값은 항상 0). deriveStats 가 계수를
  // 참조하므로 값 자체는 남겨두되, 튜너에는 노출하지 않는다(조정해도 효과 없음).
  attr: {
    pointsPerLevel: 3,
    skillPointsPerLevel: 1,
    strDamagePerPoint: 0.015,
    dexAtkSpeedPerPoint: 0.007,
    dexMovePerPoint: 0.0025,
    intCdrPerPoint: 0.005,
    vitHpPerPoint: 2,
    atkSpeedCap: 0.75,
    moveCap: 0.35,
    cdrCap: 0.4,
    minSkillCooldown: 1,
  },

  // 개발/테스트 편의. 시작 상태를 조정한다.
  debug: {
    startLevel: 1,
    startAttrPoints: 0,
    startSkillPoints: 0,
    freeRespec: false,
  },

  // 액티브 스킬 — 획득하면 쿨다운마다 자동 발동.
  // (발수/쿨타임은 skilltree.js 가 레벨별로 직접 정하므로 여기 값은 튜너에서 뺐다)
  skill: {
    damageMul: 0.7, // 무기 데미지의 몇 배로 나가는지
    shotInterval: 0.08, // 연사 간격(초) — 다-다-다-다 느낌
    multishotSpread: 30, // 다발사격 확산 각도(도)
    grenadeRadius: 30, // 폭발수류탄 폭발 반경(px)
  },
}

// 튜너 슬라이더 메타데이터. 목적별로 잘게 나눠 찾기 쉽게 했다.
// effect: 값을 올릴 때(↑) / 내릴 때(↓) 게임에서 실제로 뭐가 바뀌는지.
export const SCHEMA = [
  {
    key: 'player',
    label: '플레이어 · 능력',
    fields: [
      { key: 'speed', label: '이동 속도', min: 40, max: 500, step: 5, effect: '↑ 빨리 움직여 도망·젬줍기 쉬움  ·  ↓ 느려서 포위당하기 쉬움' },
      { key: 'maxHp', label: '최대 체력', min: 20, max: 500, step: 10, effect: '↑ 더 오래 버팀  ·  ↓ 몇 대에 사망' },
      { key: 'invuln', label: '피격 후 무적(초)', min: 0, max: 2, step: 0.05, effect: '↑ 맞은 뒤 잠깐 무적이라 연속피해 덜함  ·  ↓ 떼에 갇히면 순삭' },
      { key: 'pickupRadius', label: '골드 획득 범위', min: 20, max: 400, step: 5, effect: '↑ 멀리서도 동전이 빨려옴  ·  ↓ 직접 주우러 가야 함' },
    ],
  },
  {
    key: 'player',
    label: '플레이어 · 크기',
    fields: [
      { key: 'radius', label: '크기 (외형+히트박스)', min: 6, max: 40, step: 1, effect: '↑ 캐릭터 스프라이트·히트박스·그림자 모두 커짐(잘 맞음, 불리)  ·  ↓ 모두 작아짐(회피 쉬움)' },
    ],
  },
  {
    key: 'weapon',
    label: '무기 · 화력',
    fields: [
      { key: 'damage', label: '데미지', min: 1, max: 100, step: 1, effect: '↑ 한 발이 세져 빨리 처치  ·  ↓ 약해서 오래 걸림' },
      { key: 'cooldown', label: '발사 간격(초)', min: 0.05, max: 2, step: 0.05, effect: '↑ 뜸하게 쏴 DPS 감소  ·  ↓ 자주 쏴 DPS 증가 (핵심 딜 수치)' },
      { key: 'pierce', label: '관통 수', min: 1, max: 10, step: 1, effect: '↑ 한 발이 여러 적을 뚫음(떼몰이 대응)  ·  ↓ 한 명만 맞음' },
    ],
  },
  {
    key: 'weapon',
    label: '무기 · 발사',
    fields: [
      { key: 'speed', label: '화살 속도', min: 100, max: 1500, step: 20, effect: '↑ 빨라서 먼 적도 명중  ·  ↓ 느려서 늦게 도달 (너무 빠르면 작은 적을 스쳐 지날 수 있음)' },
      { key: 'knockback', label: '넉백', min: 0, max: 500, step: 10, effect: '↑ 맞은 적이 크게 밀려 거리 벌림  ·  ↓ 안 밀려 계속 붙음' },
      { key: 'range', label: '자동조준 사거리', min: 80, max: 800, step: 10, effect: '↑ 먼 적까지 조준  ·  ↓ 가까이 와야 쏨. 너무 짧으면 이동 중 발사가 끊긴다(권장 300+)' },
    ],
  },
  {
    key: 'enemy',
    label: '적 · 능력치',
    fields: [
      { key: 'hp', label: '체력', min: 1, max: 200, step: 1, effect: '↑ 단단해서 처치 느림  ·  ↓ 물러서 금방 죽음' },
      { key: 'speed', label: '이동 속도', min: 10, max: 300, step: 2, effect: '↑ 빨라서 도망치기 어려움  ·  ↓ 느려서 쉽게 뿌리침' },
      { key: 'contactDamage', label: '접촉 데미지', min: 1, max: 50, step: 1, effect: '↑ 닿으면 크게 아픔  ·  ↓ 스쳐도 조금만 아픔' },
      { key: 'radius', label: '크기 (외형+히트박스)', min: 4, max: 30, step: 1, effect: '↑ 스프라이트·히트박스 커져 화살 잘 맞지만 몸집 큼  ·  ↓ 작아서 명중 어려움' },
      { key: 'hpRampPerMin', label: '분당 체력 배율', min: 1, max: 2, step: 0.05, effect: '↑ 1분마다 적 체력 급증(후반 급격)  ·  ↓ 완만하게 상승' },
    ],
  },
  {
    key: 'enemy',
    label: '적 · 군집·움직임',
    fields: [
      { key: 'sepStrength', label: '겹침 방지 힘', min: 0, max: 150, step: 5, effect: '↑ 적들이 서로 강하게 밀어내 안 겹침  ·  0=완전히 겹침' },
      { key: 'sepRadius', label: '겹침 방지 범위', min: 8, max: 60, step: 2, effect: '↑ 넓은 간격 유지(퍼짐)  ·  ↓ 가까이 붙어야 밀어냄' },
      { key: 'wobble', label: '유기적 흔들림', min: 0, max: 1.5, step: 0.05, effect: '↑ 좌우로 크게 흔들며 접근  ·  0=직선으로만' },
      { key: 'hitStunSec', label: '피격 경직 시간', min: 0, max: 0.6, step: 0.05, effect: '↑ 맞은 적이 더 오래 멈춤(경직)  ·  0=경직 없음' },
    ],
  },
  {
    key: 'enemy',
    label: '적 종류 · 돌진형',
    fields: [
      { key: 'rusherStartSec', label: '돌진형 등장 시간(초)', min: 0, max: 300, step: 5, effect: '↑ 늦게 등장(초반 쉬움)  ·  ↓ 일찍 등장' },
      { key: 'rusherChance', label: '돌진형 비율', min: 0, max: 0.6, step: 0.02, effect: '↑ 빠른 돌진형이 많아짐  ·  ↓ 적어짐' },
      { key: 'rusherSpeedMul', label: '돌진형 속도 배율', min: 1, max: 2.5, step: 0.1, effect: '↑ 더 빠름(1.6 넘으면 플레이어보다 빨라 회피 불가)  ·  ↓ 느림' },
    ],
  },
  {
    key: 'enemy',
    label: '적 종류 · 원거리형',
    fields: [
      { key: 'shooterStartSec', label: '원거리형 등장 시간(초)', min: 0, max: 300, step: 5, effect: '↑ 늦게 등장  ·  ↓ 일찍 등장' },
      { key: 'shooterChance', label: '원거리형 비율', min: 0, max: 0.5, step: 0.02, effect: '↑ 탄 쏘는 원거리형 많아짐  ·  ↓ 적어짐' },
      { key: 'shooterRange', label: '원거리형 사거리', min: 60, max: 400, step: 10, effect: '이 거리에서 멈춰 쏨. 무기 사거리보다 짧아야 반격 가능' },
      { key: 'shooterInterval', label: '원거리형 발사 주기(초)', min: 1, max: 8, step: 0.5, effect: '↑ 뜸하게 쏨(쉬움)  ·  ↓ 자주 쏨(위협↑)' },
      { key: 'shooterBoltDamage', label: '원거리형 탄 피해', min: 1, max: 40, step: 1, effect: '↑ 탄 하나가 아픔  ·  ↓ 덜 아픔' },
    ],
  },
  {
    key: 'spawn',
    label: '스폰 · 난이도',
    fields: [
      { key: 'baseInterval', label: '기본 스폰 간격(초)', min: 0.05, max: 3, step: 0.05, effect: '↑ 뜸하게 등장(쉬움)  ·  ↓ 촘촘히 쏟아짐(물량 폭증)' },
      { key: 'rampPerMin', label: '분당 스폰 배율', min: 1, max: 3, step: 0.05, effect: '↑ 1분마다 스폰량 급증(난이도 급상승)  ·  ↓ 완만' },
      { key: 'rampCap', label: '스폰 배율 상한', min: 1, max: 60, step: 1, effect: '↑ 후반 물량 상한이 높아 극한까지  ·  ↓ 상한이 낮아 관리 가능' },
      { key: 'maxEnemies', label: '동시 적 수 상한', min: 20, max: 1500, step: 20, effect: '↑ 화면에 적 많음(성능 부담↑)  ·  ↓ 덜 붐빔' },
    ],
  },
  {
    key: 'gold',
    label: '골드 (영구 재화)',
    fields: [
      { key: 'dropChance', label: '일반몹 드랍 확률', min: 0, max: 1, step: 0.01, effect: '↑ 동전이 자주 떨어짐(업그레이드 빠름)  ·  ↓ 드물게' },
      { key: 'max', label: '드랍 시 최대 개수', min: 1, max: 10, step: 1, effect: '↑ 한 번에 여러 개  ·  ↓ 한 개씩' },
      { key: 'eliteAmount', label: '엘리트 드랍량', min: 0, max: 100, step: 1, effect: '↑ 엘리트를 잡을 이유가 커짐' },
      { key: 'bossAmount', label: '보스 드랍량', min: 0, max: 200, step: 5, effect: '↑ 보스 보상 상향' },
      { key: 'life', label: '동전 유지 시간(초)', min: 3, max: 60, step: 1, effect: '↑ 오래 남아 나중에 주울 수 있음(화면 복잡)  ·  ↓ 빨리 사라짐' },
    ],
  },
  {
    key: 'elite',
    label: '엘리트 · 등장·체력',
    fields: [
      { key: 'firstSec', label: '첫 엘리트 등장(초)', min: 10, max: 180, step: 5, effect: '↑ 늦게 첫 등장(룬을 늦게 얻음)  ·  ↓ 일찍' },
      { key: 'everySec', label: '등장 간격(초)', min: 8, max: 120, step: 2, effect: '↑ 드물게 등장(룬 적음)  ·  ↓ 자주(룬 많음). 판당 룬 개수를 직접 정하는 값' },
      { key: 'maxAlive', label: '동시 생존 상한', min: 1, max: 8, step: 1, effect: '↑ 여러 마리가 겹쳐 패턴이 동시에 터짐  ·  ↓ 한 번에 하나씩' },
      { key: 'hpMul', label: '체력 배수 (일반 대비)', min: 1, max: 12, step: 0.5, effect: '↑ 오래 살아 패턴을 여러 번 보여줌  ·  ↓ 너무 낮으면 패턴 보기 전에 죽어 접두어가 무의미' },
      { key: 'radius', label: '크기(반지름)', min: 10, max: 34, step: 1, effect: '↑ 커서 일반 몹과 확실히 구분  ·  ↓ 작아서 묻힘' },
      { key: 'contactDamage', label: '접촉 데미지', min: 1, max: 60, step: 1, effect: '↑ 닿으면 아픔  ·  ↓ 덜 아픔' },
      { key: 'gems', label: '드랍 젬 수', min: 1, max: 30, step: 1, effect: '↑ 처치 보상 큼(레벨업 가속)  ·  ↓ 적음' },
    ],
  },
  {
    key: 'elite',
    label: '엘리트 · 패턴',
    fields: [
      { key: 'attackInterval', label: '패턴 발동 주기(초)', min: 1, max: 12, step: 0.5, effect: '↑ 뜸하게 패턴  ·  ↓ 자주(압박↑)' },
      { key: 'telegraphTime', label: '예고 시간(초)', min: 0.2, max: 2.5, step: 0.1, effect: '↑ 예고가 길어 피하기 쉬움  ·  ↓ 짧아서 불공평해짐(0.5 이하 비권장)' },
      { key: 'chargeSpeedMul', label: '돌격자 돌진 속도 배수', min: 1.5, max: 8, step: 0.2, effect: '↑ 빠르게 꽂힘(측면 회피 필수)  ·  ↓ 느려서 쉽게 피함' },
      { key: 'chargeDamage', label: '돌격자 돌진 피해', min: 1, max: 80, step: 1, effect: '↑ 맞으면 치명적  ·  ↓ 덜 아픔' },
      { key: 'shellRadius', label: '포격수 폭발 반경(px)', min: 15, max: 140, step: 5, effect: '↑ 넓어 자리를 크게 비워야 함  ·  ↓ 좁아 조금만 움직이면 됨' },
      { key: 'shellDamage', label: '포격수 폭발 피해', min: 1, max: 70, step: 1, effect: '↑ 착탄이 치명적  ·  ↓ 덜 아픔' },
      { key: 'scatterCount', label: '산탄사수 발사체 수', min: 2, max: 12, step: 1, effect: '↑ 탄이 촘촘해 틈이 좁음  ·  ↓ 사이로 빠지기 쉬움' },
      { key: 'scatterBoltDamage', label: '산탄사수 탄 피해', min: 1, max: 40, step: 1, effect: '↑ 한 발이 아픔  ·  ↓ 덜 아픔' },
      { key: 'wardenRadius', label: '수호자 오라 반경(px)', min: 50, max: 400, step: 10, effect: '↑ 넓은 범위의 적이 강화됨(먼저 죽여야 함)  ·  ↓ 좁아 무시 가능' },
      { key: 'wardenSpeedMul', label: '수호자 오라 이속 배수', min: 1, max: 2.2, step: 0.05, effect: '↑ 강화된 적이 빠름(1.6 넘으면 회피 불가)  ·  ↓ 체감 약함' },
    ],
  },
  {
    key: 'boss',
    label: '보스 · 등장·체력',
    fields: [
      { key: 'firstBossSec', label: '첫 보스 등장(초)', min: 10, max: 200, step: 5, effect: '첫 보스만 이 시간에 등장(룬 조기 경험)  ·  이후는 아래 등장 간격 적용' },
      { key: 'everySec', label: '등장 간격(초)', min: 10, max: 300, step: 5, effect: '↑ 보스가 드물게 등장  ·  ↓ 자주 등장(압박↑)' },
      { key: 'hp', label: '체력', min: 50, max: 5000, step: 50, effect: '↑ 오래 살아 위협 지속  ·  ↓ 금방 처치' },
      { key: 'hpRampPerMin', label: '분당 체력 배율', min: 1, max: 3, step: 0.05, effect: '↑ 뒤에 나오는 보스일수록 급격히 강해짐  ·  ↓ 완만' },
      { key: 'speed', label: '이동 속도', min: 10, max: 200, step: 2, effect: '↑ 빨라서 따돌리기 힘듦  ·  ↓ 느려서 피하기 쉬움 (화면 밖이면 자동으로 빨라져 반드시 등장)' },
      { key: 'radius', label: '크기(반지름)', min: 12, max: 60, step: 2, effect: '↑ 커서 화살 잘 맞지만 존재감·압박↑  ·  ↓ 작음' },
      { key: 'knockbackResist', label: '넉백 저항 (0=꿈쩍않음)', min: 0, max: 1, step: 0.05, effect: '0에 가까울수록 안 밀려 버팀  ·  1이면 잡몹처럼 밀려남' },
      { key: 'gems', label: '드랍 젬 수', min: 1, max: 50, step: 1, effect: '↑ 처치 시 성장 보상 큼  ·  ↓ 보상 적음' },
      { key: 'contactDamage', label: '접촉 데미지', min: 1, max: 100, step: 1, effect: '↑ 닿으면 치명적  ·  ↓ 덜 아픔' },
    ],
  },
  {
    key: 'boss',
    label: '보스 · 탄막',
    fields: [
      { key: 'attackInterval', label: '탄막 주기(초)', min: 1, max: 10, step: 0.5, effect: '↑ 뜸하게 탄막  ·  ↓ 자주 쏨(위협↑)' },
      { key: 'lineCount', label: '탄막 라인 수', min: 1, max: 15, step: 1, effect: '↑ 부채꼴 라인 많아 피하기 어려움  ·  ↓ 적음' },
      { key: 'boltDamage', label: '탄 피해', min: 1, max: 60, step: 1, effect: '↑ 탄 하나가 치명적  ·  ↓ 덜 아픔' },
      { key: 'boltSpeed', label: '탄 속도', min: 80, max: 500, step: 10, effect: '↑ 빨라서 피하기 어려움  ·  ↓ 느려서 피하기 쉬움' },
      { key: 'telegraphTime', label: '예고 시간(초)', min: 0.2, max: 2, step: 0.1, effect: '↑ 예고 길어 피하기 쉬움  ·  ↓ 짧아서 급박' },
    ],
  },
  {
    key: 'xp',
    label: '경험치 · 레벨',
    fields: [
      { key: 'gemValue', label: '젬 하나의 경험치', min: 1, max: 20, step: 1, effect: '↑ 젬 하나가 경험치 많이 줘 레벨 빠름  ·  ↓ 성장 느림' },
      { key: 'levelBase', label: '1레벨 필요 경험치', min: 1, max: 50, step: 1, effect: '↑ 첫 레벨업까지 오래  ·  ↓ 초반부터 빠른 성장' },
      { key: 'levelGrowth', label: '레벨당 필요치 배율', min: 1, max: 2, step: 0.05, effect: '↑ 레벨마다 필요치 급증(후반 성장 정체)  ·  ↓ 계속 쭉 성장' },
      { key: 'magnetSpeed', label: '젬 빨려오는 속도', min: 100, max: 1500, step: 20, effect: '↑ 젬이 빠르게 붙음  ·  ↓ 천천히 다가옴' },
    ],
  },
  {
    key: 'skill',
    label: '액티브 스킬 (난사·다발사격·수류탄)',
    fields: [
      { key: 'damageMul', label: '스킬 데미지 배율', min: 0.1, max: 3, step: 0.05, effect: '무기 데미지 대비 배율. 0.5 = 절반  ·  ↑ 스킬이 세짐  ·  ↓ 약해짐' },
      { key: 'shotInterval', label: '연사 간격(초)', min: 0.02, max: 0.5, step: 0.01, effect: '↑ 다… 다… 다 느리게  ·  ↓ 다다다다 빠르게 (난사·다발사격)' },
      { key: 'multishotSpread', label: '다발사격 퍼짐 각도(도)', min: 0, max: 180, step: 5, effect: '↑ 넓게 퍼져 여러 적에 분산  ·  ↓ 좁게 모여 집중' },
      { key: 'grenadeRadius', label: '수류탄 폭발 반경(px)', min: 5, max: 200, step: 5, effect: '↑ 폭발이 넓어 여러 적을 한 번에  ·  ↓ 좁아서 거의 단일 타겟' },
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
  // 프리셋도 KEY 와 같은 버전을 따라간다. 버전 없이 두면 옛 프리셋을 불러올 때
  // 폐기한 값(예: normalDropChance 0.01)이 되살아난다 — v4→v5 에서 실제로 겪은 문제.
  return `survivor.preset.${KEY}.${slot}`
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
