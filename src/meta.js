// 영구 성장(메타) — 골드로 사는 시작 스탯 강화.
//
// 판마다 리셋되는 게임에서 **유일하게 누적되는 것**이라, "다음 판을 켤 이유"를
// 만드는 장치다. 로그라이크의 표준 구조(런 내 성장 = 룬/카드, 런 밖 성장 = 여기).
//
// 저장은 골드와 **분리**한다(`wg_gold_v1` / `wg_meta_v1`) —
// 나중에 "업그레이드만 초기화" 같은 조작이 필요할 수 있다.
//
// ⚠️ 가격이 레벨마다 2배라 자연스럽게 상한이 생긴다(별도 캡 불필요):
//    Lv1=10 … Lv10=5,120,  누적 10,230골드. 판당 약 60골드면 약 170판.
//    반대로 초반 3레벨은 70골드(한 판)라 첫 보상이 즉시 온다.

const META_KEY = 'wg_meta_v1'

// ⚠️⚠️ 밸런스 경고 — `per` 값을 반드시 다시 검토할 것 ⚠️⚠️
//
// 현재 설정(가격 2배 / 레벨당 +1%)의 실제 진행을 계산해보면:
//
//   Lv1  +1%   10골드    누적     10  (0판)
//   Lv5  +5%  160골드    누적    310  (5판)
//   Lv8  +8% 1280골드    누적  2,550  (43판)
//   Lv10 +10% 5120골드   누적 10,230  (171판)   ← 판당 60골드 기준
//
// **171판을 해서 공격력 +10%** 다. 기본 피해 20 → 22.
// 5판을 해도 +5%(20 → 21)라 플레이어가 차이를 느끼지 못한다.
// 참고로 뱀서의 Might 파워업은 레벨당 +5%, 5레벨에 +25% 다.
//
// 가격 2배 곡선 자체는 좋다(초반 3레벨이 70골드=한 판이라 첫 보상이 즉시 오고,
// 후반은 자연히 상한이 생긴다). 문제는 **효과 크기**뿐이다.
//   → `per: 1` → `per: 3~5` 로 올리면 Lv5 에 +15~25% 가 되어 체감이 생긴다.
//   → 골드 획득(`gold`)은 특히 약하다. +1% 는 판당 60골드에서 0.6골드다.
// 이 파일의 `per` 한 곳만 바꾸면 UI·가격·저장이 전부 따라온다.
//
// per   : 레벨당 증가량 (unit 이 '%' 면 퍼센트포인트, 아니면 절대값)
// base  : 1레벨 가격
// growth: 레벨마다 가격 배수
// max   : 최대 레벨 (2배 곡선이라 10 이상은 사실상 도달 불가 → UI 상한)
//
// ⚠️ regen 만 **절대값**이다. 기본 회복량이 0이라(능력치 시스템 보류) 퍼센트로는
//    0 × 1.05 = 0 이 되어 아무 효과가 없다. 이런 스탯은 반드시 flat 으로 줘야 한다.
export const UPGRADES = {
  damage: {
    name: '공격력', icon: '⚔️', unit: '%', per: 5, base: 10, growth: 2, max: 10,
    desc: '기본 활과 모든 스킬의 피해',
  },
  maxHp: {
    name: '최대 체력', icon: '❤️', unit: '%', per: 5, base: 10, growth: 2, max: 10,
    desc: '시작 체력',
  },
  regen: {
    name: '체력 회복', icon: '✚', unit: '/초', per: 0.2, base: 10, growth: 2, max: 10,
    desc: '초당 자동 회복량', flat: true,
  },
  speed: {
    name: '이동 속도', icon: '👟', unit: '%', per: 5, base: 10, growth: 2, max: 10,
    desc: '걷는 속도 — 회피가 쉬워진다',
  },
  gold: {
    name: '골드 획득', icon: '🪙', unit: '%', per: 5, base: 10, growth: 2, max: 10,
    desc: '획득하는 골드량', desc2: '다음 업그레이드가 빨라진다',
  },
}

export const UPGRADE_IDS = Object.keys(UPGRADES)

export function emptyMeta() {
  const m = {}
  for (const id of UPGRADE_IDS) m[id] = 0
  return m
}

export function loadMeta() {
  const m = emptyMeta()
  try {
    const raw = JSON.parse(localStorage.getItem(META_KEY) || '{}')
    for (const id of UPGRADE_IDS) {
      const v = raw[id]
      // 저장값이 손상돼도 게임이 깨지지 않게 범위를 clamp 한다
      if (typeof v === 'number' && Number.isFinite(v)) {
        m[id] = Math.max(0, Math.min(UPGRADES[id].max, Math.floor(v)))
      }
    }
  } catch {
    /* 파싱 실패 시 전부 0 */
  }
  return m
}

export function saveMeta(m) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m))
  } catch {
    /* 사파리 프라이빗 모드 등 — 저장 실패해도 이번 세션은 정상 동작 */
  }
}

// 다음 레벨 가격. level 은 **현재 레벨**(0이면 1레벨 가격을 돌려준다).
export function costOf(id, level) {
  const u = UPGRADES[id]
  if (!u || level >= u.max) return Infinity // 최대치면 구매 불가
  return Math.round(u.base * Math.pow(u.growth, level))
}

// 현재 레벨까지 쓴 총 골드 (UI 표시용)
export function spentOn(id, level) {
  let s = 0
  for (let i = 0; i < level; i++) s += costOf(id, i)
  return s
}

// 레벨 → 실제 효과값. unit 이 '%' 면 퍼센트포인트 합.
export function valueOf(id, level) {
  const u = UPGRADES[id]
  return Math.round(u.per * level * 100) / 100 // 부동소수 오차 정리(0.1 × 3 = 0.30000004)
}

// 전투 계산에 넘길 보너스 묶음. deriveStats 가 이걸 받는다.
export function metaBonuses(meta) {
  const m = meta || emptyMeta()
  return {
    damagePct: valueOf('damage', m.damage),
    maxHpPct: valueOf('maxHp', m.maxHp),
    regenFlat: valueOf('regen', m.regen),
    speedPct: valueOf('speed', m.speed),
    goldPct: valueOf('gold', m.gold),
  }
}

// 구매 시도. 성공하면 { ok:true, gold, meta } 를 돌려준다.
// 골드 차감까지 여기서 처리해야 UI 와 저장이 어긋나지 않는다.
export function buyUpgrade(id, gold, meta, spendGold) {
  const u = UPGRADES[id]
  if (!u) return { ok: false, reason: 'unknown' }
  const lv = meta[id] || 0
  if (lv >= u.max) return { ok: false, reason: 'max' }
  const cost = costOf(id, lv)
  if (gold < cost) return { ok: false, reason: 'poor' }

  meta[id] = lv + 1
  saveMeta(meta)
  const left = spendGold(cost)
  return { ok: true, gold: left, meta, cost }
}
