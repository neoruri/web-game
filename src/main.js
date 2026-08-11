import Phaser from 'phaser'
import './style.css'
import { loadConfig, onConfigChange } from './config.js'
import { deriveStats, emptyAttributes } from './progression.js'
import {
  ACTIVE_IDS,
  ACTIVE_SKILLS,
  emptySkillTree,
  investBlockReason,
  emptySpecs,
  SPEC_LEVEL,
} from './skilltree.js'
import { createGrowthScreen } from './growth-ui.js'
import { createLevelupScreen } from './levelup-cards.js'
import { createRuneScreen } from './rune-screen.js'
import { createResultScreen } from './result-screen.js'
import { Grid } from './grid.js'

// --- 룬 (드랍 → 스킬 슬롯에 장착) -------------------------------------------
// 디아블로식 파밍감을 위해 ① 등급(일반/레어/에픽) ② 수치 랜덤 롤을 가진다.
// 장착 단위는 "룬 인스턴스": { id, tier, v }  (v = 굴려서 정해진 실제 수치)
//   range[tier] = [최소, 최대] — v는 이 구간에서 랜덤. 정수형(관통/발사체)은 정수로.
const RUNE_TIERS = {
  1: { name: '일반', color: '#9aa8b4', border: '#6b7783', chance: 0.62 },
  2: { name: '레어', color: '#5ab4eb', border: '#3d86b8', chance: 0.29 },
  3: { name: '에픽', color: '#c58af0', border: '#8d55b8', chance: 0.09 },
}
const RUNES = {
  damage: {
    icon: '⚔️', name: '데미지', color: '#e87850', unit: '%', int: false,
    range: { 1: [10, 18], 2: [20, 30], 3: [32, 45] },
    fmt: (v) => `피해 +${v}%`,
    shortFmt: (v) => `+${v}%`,
  },
  pierce: {
    icon: '➹', name: '관통', color: '#5ab4eb', unit: '', int: true,
    range: { 1: [1, 1], 2: [1, 2], 3: [2, 3] },
    fmt: (v) => `관통 +${v}`,
    shortFmt: (v) => `+${v}`,
  },
  projectile: {
    icon: '🎯', name: '발사체', color: '#5adccd', unit: '', int: true,
    range: { 1: [1, 1], 2: [1, 2], 3: [2, 2] },
    fmt: (v) => `발사체 +${v}`,
    shortFmt: (v) => `+${v}`,
  },
  cooldown: {
    icon: '⏱️', name: '쿨감', color: '#78d2be', unit: '%', int: false,
    range: { 1: [8, 14], 2: [16, 22], 3: [24, 30] },
    fmt: (v) => `쿨타임 -${v}%`,
    shortFmt: (v) => `-${v}%`,
  },
  burn: {
    icon: '🔥', name: '화상', color: '#f0963c', unit: '%', int: false,
    range: { 1: [18, 28], 2: [30, 42], 3: [45, 60] },
    fmt: (v) => `화상 ${v}%/초 (3초) · 중첩 안 됨`,
    shortFmt: (v) => `${v}%/s`,
  },
  // --- 아래 3종은 상태이상. 발사체 수와 곱해지지 않게 규칙을 설계했다 ---
  // 독 — 화상과 달리 **중첩된다**(최대 5스택). 그래서 다발·연발처럼 히트가 많은
  //      스킬에서 강하다. 단 스택 상한이 있어 18발이 18스택이 되지는 않는다.
  poison: {
    icon: '🧪', name: '독', color: '#a6e3a1', unit: '%', int: false,
    range: { 1: [8, 12], 2: [13, 18], 3: [20, 26] },
    fmt: (v) => `독 ${v}%/초 · 최대 ${POISON_MAX_STACKS}중첩 (${POISON_DUR}초)`,
    shortFmt: (v) => `${v}%/s×`,
  },
  // 냉기 — 이속 감소. 중첩 안 됨(최대값) + 캡이 있어 정지 고정이 안 된다.
  //      난사처럼 넓게 뿌리는 스킬과 궁합이 좋다(여러 적을 동시에 느리게).
  chill: {
    icon: '❄️', name: '냉기', color: '#89dceb', unit: '%', int: false,
    range: { 1: [12, 18], 2: [20, 28], 3: [30, 40] },
    fmt: (v) => `적 이속 -${v}% (${CHILL_DUR}초)`,
    shortFmt: (v) => `-${v}%`,
  },
  // 취약 — 받는 피해 증폭. **다른 스킬의 피해까지 올려준다**는 게 핵심.
  //      피해가 낮은 연발 사격이 "디버프를 거는 역할"로 가치를 갖는다.
  vuln: {
    icon: '💢', name: '취약', color: '#f38ba8', unit: '%', int: false,
    range: { 1: [10, 15], 2: [16, 22], 3: [24, 32] },
    fmt: (v) => `받는 피해 +${v}% (${VULN_DUR}초)`,
    shortFmt: (v) => `+${v}%`,
  },
}
const RUNE_POOL = [
  'damage', 'pierce', 'projectile', 'cooldown',
  'burn', 'poison', 'chill', 'vuln',
]

// 스킬당 룬 슬롯 수. 늘리면 파워가 곱해지니 밸런스 확인 후 조정할 것.
const RUNE_SLOTS = 3

// 등급 추첨 — elapsed(초)가 길어지면 상위 등급 확률이 완만히 오른다(후반 보상감).
function rollRuneTier(elapsed = 0) {
  const boost = Math.min(0.18, elapsed / 600) // 최대 +18%p 만큼 상위로 이동
  const r = Math.random()
  const pEpic = RUNE_TIERS[3].chance + boost * 0.5
  const pRare = RUNE_TIERS[2].chance + boost * 0.5
  if (r < pEpic) return 3
  if (r < pEpic + pRare) return 2
  return 1
}

// 룬 인스턴스 생성 (수치 랜덤 롤)
function rollRune(id, elapsed = 0, tier = null) {
  const def = RUNES[id]
  const t = tier || rollRuneTier(elapsed)
  const [lo, hi] = def.range[t]
  let v = lo + Math.random() * (hi - lo)
  v = def.int ? Math.round(v) : Math.round(v * 10) / 10
  return { id, tier: t, v }
}

// 표시용 헬퍼
function runeLabel(r) {
  return `${RUNES[r.id].name}${r.tier > 1 ? ' · ' + RUNE_TIERS[r.tier].name : ''}`
}
function runeDesc(r) {
  return RUNES[r.id].fmt(r.v)
}

// --- 레벨업 카드(뱀서 표준 진행) ---
// 스킬 카드(기존 액티브 재활용) + 패시브 4종. 성장 화면(스킬트리)은 보류.
const CARD_SKILLS = {
  multishot: { icon: '🏹', name: '다발 사격', desc: '가까운 적 방향으로 부채꼴 연사' },
  rapidfire: { icon: '💥', name: '연발 사격', desc: '가까운 적을 단일 집중 연사' },
  barrage: { icon: '🌪️', name: '난사', desc: '이동하며 주변 360° 난사' },
  grenade: { icon: '💣', name: '수류탄', desc: '밀집 지점에 던져 범위 폭발' },
}
const CARD_PASSIVES = {
  dmg: { icon: '⚔️', name: '데미지 +10%', desc: '모든 피해 증가', step: 0.1 },
  move: { icon: '👟', name: '이동속도 +8%', desc: '캐릭터 이동속도 증가', step: 0.08 },
  hp: { icon: '❤️', name: '최대체력 +15%', desc: '생존력 증가', step: 0.15 },
  atkSpeed: { icon: '⏱️', name: '공격속도 +8%', desc: '기본·스킬 쿨타임 감소', step: 0.08 },
}
const MAX_ACTIVE = 5 // 동시 활성 스킬 수 (기본 사격 + 액티브 4종 전부)
const GRENADE_MAX = 240 // 수류탄 최대 투척 거리(적정 사거리)
const GRENADE_DUR = 0.45 // 수류탄 포물선 비행 시간(초)
const GRENADE_ARC = 62 // 포물선 최대 높이(px)
const BURN_PCT = 0.3 // 화상 도트 = 명중 피해의 이 비율/초
const BURN_DUR = 3 // 화상 지속(초)
// 상태이상 3종 (독·냉기·취약). sim.js 와 **같은 값을 유지할 것**.
const POISON_DUR = 4 // 독 지속(초) — 명중마다 갱신
const POISON_MAX_STACKS = 5 // 독 중첩 상한. 이게 없으면 다발 18발 = 18중첩이 된다
const CHILL_DUR = 2.5 // 냉기 지속(초)
const VULN_DUR = 3 // 취약 지속(초)

// 세로 모드 (모바일 우선). 9:16 비율.
const W = 540
const H = 960

const COLOR_BG = 0x1e1e2e
const COLOR_PLAYER = 0x89b4fa
const COLOR_ENEMY = 0xf38ba8
const COLOR_RUSHER = 0xf9a860 // 돌진형(빠름)
const COLOR_SHOOTER = 0x94e2d5 // 원거리형(카이팅)
const COLOR_ENEMY_HIT = 0xffffff
const COLOR_BOSS = 0xcba6f7
const COLOR_ARROW = 0xfab387 // 기본 활 (주황)
const COLOR_SKILL_ARROW = 0x89dceb // 스킬 발사체 (하늘색 — 기본과 구분) *구버전 폴백용

// 스킬별 발사체 이펙트 — 색/굵기/길이로 구분한다. (룬 오버레이는 아직 미적용)
//  tint: 색 · w: 선 굵기 · len: 화살 길이(반길이 px)
//  키는 fireAngle(..., skill) 에 넘기는 스킬 id. 'basic' = 기본 활.
// 화살 속도가 1200px/s(60fps에서 프레임당 20px)라 고정 길이로는 잔상이 끊겨 보인다.
// → 길이를 "속도 × streak(초)"로 계산해 모션블러 스트릭처럼 그린다.
//   streak 0.05s = 60px, 0.03s = 36px. 값이 클수록 길고 부드럽게 이어진다.
//  trail: 'none' | 'thin' 얇은 선 | 'dots' 점선 | 'fade' 페이드 잔상(스트릭 뒤로 더 길게)
//  impact: 'spark' 스파크 | 'flash' 섬광 | 'boom' 폭발(수류탄은 기존 링 사용)
//  muzzle: 발사 지점 플래시 크기(px). 빠른 투사체는 "발사 순간"이 가장 잘 읽힌다.
//  spawn: 발사 지점을 몸 중심에서 발사 방향으로 밀어내는 거리(px) = 활/팔 위치.
//         0이면 한 점에서 다 나와 뭉쳐 보인다. 난사(360°)는 크게 줘서 링처럼 퍼지게.
const SKILL_FX = {
  // 주황 · 기준
  basic: {
    tint: 0xfab387, w: 2.5, streak: 0.032, trail: 'none', impact: 'spark', muzzle: 7, spawn: 15,
  },
  // 하늘 · 가벼운 다발(짧고 얇게, 여러 발이 겹쳐 부채꼴이 보이도록)
  multishot: {
    tint: 0x89dceb, w: 2, streak: 0.026, trail: 'thin', impact: 'spark', muzzle: 10, spawn: 17,
  },
  // 노랑 · 따다닥(짧은 탄환 + 점선)
  rapidfire: {
    tint: 0xf9e2af, w: 3, streak: 0.022, trail: 'dots', impact: 'flash', muzzle: 8, spawn: 16,
  },
  // 민트 · 길게 뻗는 궤적. 360° 난사라 발사점을 가장 크게 밀어 링처럼 보이게 한다.
  barrage: {
    tint: 0xa6e3a1, w: 2.5, streak: 0.055, trail: 'fade', impact: 'spark', muzzle: 6, spawn: 26,
  },
  // 주황 · 투척체(별도 렌더)
  grenade: {
    tint: 0xfab387, w: 3, streak: 0.03, trail: 'none', impact: 'boom', muzzle: 12, spawn: 14,
  },
}
const SKILL_FX_KEYS = Object.keys(SKILL_FX)

// --- 엘리트 몹 4종 --------------------------------------------------------
// 능력치 접두어(이속·체력 배수)가 아니라 **공격 패턴**으로 구분한다.
// 이유: 능력치만 바꾸면 플레이어의 대응이 "계속 쏘기"로 똑같다. 패턴은 행동을 바꾼다.
//   row  = elites_sheet.png 의 행 (스프라이트 색 = 아래 color 와 동일하게 그려짐)
//   verb = 플레이어가 강제로 하게 되는 행동 (설계 의도를 코드에 남긴다)
const ELITE_KINDS = [
  { id: 'charger', row: 0, name: '돌격자', tint: 0xec6050, verb: '측면 회피' },
  { id: 'bombardier', row: 1, name: '포격수', tint: 0xf29840, verb: '자리 비우기' },
  { id: 'scattershot', row: 2, name: '산탄사수', tint: 0x6ed6ce, verb: '각도 이탈' },
  { id: 'warden', row: 3, name: '수호자', tint: 0xc08ef4, verb: '우선순위 처치' },
]
const ELITE_BY_ID = {}
for (const k of ELITE_KINDS) ELITE_BY_ID[k.id] = k

// 프롭(오브젝트) 배치 격자 — 이 타일 수마다 한 칸. 크면 오브젝트가 드물어진다.
const PROP_CELL = 3

// 난사 각도 흩뿌림(라디안). 크면 사방으로 퍼지고(명중↓), 작으면 조준에 가깝다(명중↑).
// 0.45rad ≈ ±26° — "난사" 느낌은 남기면서 대부분 적에게 향한다.
const BARRAGE_JITTER = 0.45
const COLOR_GEM = 0x94e2d5

const KNOCKBACK_FRICTION = 8
const FLASH_TIME = 0.06
const MAX_DT = 0.05 // 탭 복귀 시 delta 폭주 방지 (터널링 방지)

// 타격감(게임필) — 시각 전용. 전투 수치엔 영향 없음(sim 동기화 무관).
const COLOR_CRIT = '#f9e2af'
const MAX_POPUPS = 24 // 데미지 숫자 상한 (스웜에서 폭주 방지)
const MAX_PARTICLES = 200 // 파편 상한 (fillRect라 저렴)
// 외형 크기는 반지름(히트박스)에 비례시킨다 — 튜너의 '크기' 슬라이더 하나로
// 캐릭터/몬스터 스프라이트·히트박스·그림자가 함께 바뀐다.
const PLAYER_SPRITE_K = 0.055 // 배율 = player.radius × 이것 (기본 r10 → 0.55)
const ENEMY_SPRITE_K = 0.11 // 배율 = enemy.radius × 이것 (기본 r10 → 1.1, 셀 32px)
// 엘리트는 셀이 48px(일반 32px)이라 배율 계수가 다르다.
// r16 × 0.075 = 1.2 → 화면상 약 58px (일반 몹 35px 대비 확실히 크다)
const ELITE_SPRITE_K = 0.075
const SPRITE_H = 116 // 스프라이트 셀 높이. 화살 발사(활) 높이 = 배율×높이×0.4

// 배경 시차(parallax) 계수. 카메라가 플레이어를 따라가는 무한 월드에서
// 배경만 살짝 다른 속도로 흘러 깊이감을 준다.
const PARALLAX_GRID = 1.0
const PARALLAX_DOTS = 1.15

// 무한 월드 — 적은 플레이어 기준 화면 밖 둘레(원)에서 스폰하고,
// 너무 멀어지면(반대편으로 밀려나거나) 제거한다.
const SPAWN_DIST = Math.hypot(W, H) / 2 + 40
const DESPAWN_DIST = SPAWN_DIST + 280
// 보스가 이 거리보다 멀면(사실상 화면 밖) 플레이어보다 빠르게 접근시켜
// 반드시 화면에 들어오게 한다. 화면 안에서는 원래 느린 속도로 복귀.
const BOSS_LEASH = Math.hypot(W, H) / 2 // 화면 반대각선 ≈ 화면 경계
const BOSS_CATCHUP = 1.25 // 화면 밖일 때 플레이어 속도의 이 배율로 추격

// 개발용 HUD(fps·속도·능력치 수치)는 기본 숨김. URL 에 ?dev 를 붙이면 표시.
// (플레이어에겐 안 보이고, 개발 중엔 ...?dev 로 켜서 확인)
const DEV_HUD =
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).has('dev')

// 적/화살/젬은 GameObject 가 아니라 평범한 객체다.
//  - 생성/파괴 비용 없음 (풀에서 재사용)
//  - 렌더는 Graphics 하나에 몰아서 → 수백 개여도 드로우콜 몇 개
class GameScene extends Phaser.Scene {
  constructor() {
    super('Game')
  }

  preload() {
    // 캐릭터 동작 스프라이트시트 (96×116 셀, 8열×7행)
    this.load.spritesheet(
      'archer',
      '/sprites/dungeon/deliverables/player_spritesheet.png',
      { frameWidth: 96, frameHeight: 116 }
    )
    // 바닥 타일/데칼 — 로딩 화면에서 미리 디코딩해 둔다. new Image() 로 플레이
    // 시작 후 디코딩하면 첫 몇 초 캔버스 그리기에서 메인스레드가 튄다(초기 버벅).
    this.load.image('isotileset', '/sprites/dungeon/tileset_iso_stone.png')
    this.load.image('isodecals', '/sprites/dungeon/decals_iso.png')
    // 맵 다양화(테스트) — 깨진타일 6 + 구멍 4 / 이끼 대역 16
    this.load.image('isospecial', '/sprites/dungeon/tileset_iso_special.png')
    this.load.image('isomoss', '/sprites/dungeon/tileset_iso_moss.png')
    // 오브젝트 레이어 — 무덤/기둥/부서진벽/횃불 등 8종 (셀 96×112)
    this.load.spritesheet('isoprops', '/sprites/dungeon/props_iso.png', {
      frameWidth: 96,
      frameHeight: 112,
    })
    // 적 스프라이트 (32×32, 3행[고블린/사냥개/궁수]×4프레임)
    this.load.spritesheet('enemies', '/sprites/dungeon/enemies_sheet.png', {
      frameWidth: 32,
      frameHeight: 32,
    })
    // 엘리트 스프라이트 (48×48, 4행[돌격자/포격수/산탄사수/수호자]×4프레임)
    // 셀이 일반 몹보다 크다 — 갑옷·장비를 그려 실루엣으로 구분하기 위함.
    this.load.spritesheet('elites', '/sprites/dungeon/elites_sheet.png', {
      frameWidth: 48,
      frameHeight: 48,
    })
  }

  create() {
    this.cfg = loadConfig()

    // --- 성장 상태 (디아블로식 포인트 투자) ---
    const dbg = this.cfg.debug
    this.attributes = emptyAttributes() // 확정 능력치
    this.skillLevels = emptySkillTree() // 스킬 트리 보유 레벨
    this.specs = emptySpecs() // 5레벨 특화 선택 (id → 'A'|'B'|null)
    this.unlockedSkills = {} // 해금 알림을 이미 띄운 스킬
    this.attrPoints = dbg.startAttrPoints // 미사용 능력치 포인트(보류)
    this.skillPoints = dbg.startSkillPoints // 미사용 스킬 포인트(보류)
    // 레벨업 카드 패시브 스택 {dmg,move,hp,atkSpeed}
    this.cardPassives = { dmg: 0, move: 0, hp: 0, atkSpeed: 0 }
    this.levelupOpen = false
    this._pendingLevels = 0
    // 룬 슬롯 (스킬 id → 룬 id). 보스 처치 시 장착.
    // 스킬당 룬 슬롯 N개(배열). 각 원소는 룬 인스턴스 {id,tier,v} 또는 null.
    this.runeSlots = {}
    for (const k of ['basic', 'multishot', 'rapidfire', 'barrage', 'grenade'])
      this.runeSlots[k] = new Array(RUNE_SLOTS).fill(null)
    this._pendingRunes = [] // 보스 룬: 즉시 모달로 처리할 큐
    this.runeBag = [] // 일반몹 룬: 가방에 모아 레벨업 화면에서 장착
    this.runeOpen = false

    // 능력치·스킬·카드·룬 → 최종 전투 stats (단일 재계산 지점)
    this.stats = deriveStats(
      this.cfg, this.attributes, this.skillLevels, this.specs,
      this.cardBonusObj(), this.runeSlots
    )

    this.elapsed = 0
    this.kills = 0
    this.level = Math.max(1, dbg.startLevel)
    this.xp = 0
    this.xpNeed = this.xpFor(this.level)
    this.hp = this.stats.player.maxHp
    this.invulnLeft = 0
    this.spawnAcc = 0
    this.bossAcc = 0
    this.bossCount = 0
    this.fireAcc = 0
    this.userPaused = false // 멈춤 버튼으로 정지
    this.growthOpen = false // 성장 화면 열림
    this.gameOver = false
    this.revived = false // 활력40 부활 사용 여부
    this.lastKillExplode = 0 // 힘40 처치폭발 내부 쿨
    this._chainGuard = false // 처치폭발 연쇄 방지

    this.skillAcc = {} // 스킬별 쿨다운 누적
    for (const id of ACTIVE_IDS) this.skillAcc[id] = 0

    // 연사/지속 상태
    this.burst = {
      multishot: { left: 0, acc: 0, base: 0 }, // 부채꼴 연사
      rapidfire: { left: 0, acc: 0 }, // 단일 대상 연사
      barrage: { timeLeft: 0, acc: 0 }, // 360° 지속
    }

    this.enemies = []
    this.arrows = []
    this.explosions = [] // 수류탄 폭발 이펙트
    this.muzzles = [] // 발사 지점 머즐 플래시 (스킬별 색)
    this.grenades = [] // 날아가는 수류탄(포물선)
    this.grenadePool = []
    this.particles = [] // 타격/사망 파편
    this.partPool = []
    this.popups = [] // 데미지 숫자
    this.popupPool = []
    this._lastCritShake = 0
    this.eProjectiles = [] // 적 투사체 (보스 탄막)
    this.telegraphs = [] // 탄막 예고 표시
    this.enemyPool = []
    this.arrowPool = []
    this.eProjPool = []
    this.telePool = []
    this.explodeBuf = [] // 폭발 범위 조회용 (queryBuf 와 겹치면 안 됨)
    this._visBuf = [] // 렌더용 화면 내 적 목록(매 프레임 재사용, GC 회피)
    this._wardenBuf = [] // 수호자 목록(매 프레임 재수집 — 죽으면 오라도 즉시 사라져야 함)
    this.eliteAcc = 0 // 엘리트 등장 누적 시간
    this.eliteCount = 0 // 이번 판에 등장시킨 엘리트 수
    this.eliteKills = 0 // 처치한 엘리트 수(결과 화면용)
    this.bossKills = 0 // 처치한 보스 수 (bossCount = 등장 수라 따로 센다)
    this._firstRuneGiven = false // Lv3 첫 룬 보장을 이미 지급했는지

    // 그리드 셀은 가장 큰 적(보스)이 들어갈 만큼은 되어야 한다
    this.grid = new Grid(W, H, 56)
    this.queryBuf = []

    this.buildBackground()

    // 월드 레이어 — 모든 월드 오브젝트를 담아 매 프레임 플레이어 반대로 옮긴다.
    // 이러면 플레이어는 항상 화면 중앙에 보이고, HUD/조이스틱은 화면 좌표
    // 그대로 두면 된다(카메라 무관). 게임 로직 좌표는 전부 월드 좌표.
    this.worldLayer = this.add.container(0, 0).setDepth(1)

    this.gfxEnemies = this.add.graphics() // 바닥 그림자 + 보스 돔 + 체력바
    // 일반 적은 풀링한 스프라이트로 그린다. 화면 밖은 컬링되므로 실제 활성 수는
    // 화면 내 적 수뿐. 크기(반지름)에 맞춰 setScale, 피격·화상은 tint 로 표현.
    this.enemyLayer = this.add.container(0, 0)
    this.enemySprites = [] // 스프라이트 풀(재사용, 화면 내 적 수만큼만 보임)
    if (this.textures.exists('enemies') && this.textures.get('enemies').setFilter) {
      this.textures.get('enemies').setFilter(Phaser.Textures.FilterMode.NEAREST)
    }
    // 엘리트는 텍스처가 다르므로(48px 셀) 별도 풀·별도 레이어로 그린다.
    // 일반 몹 위에 오도록 enemyLayer 다음에 넣는다(엘리트가 잡몹에 가려지면 안 됨).
    this.eliteLayer = this.add.container(0, 0)
    this.eliteSprites = []
    this.eliteLabels = [] // 이름표 텍스트 풀 (동시 엘리트 수만큼, 보통 3개 이하)
    if (this.textures.exists('elites') && this.textures.get('elites').setFilter) {
      this.textures.get('elites').setFilter(Phaser.Textures.FilterMode.NEAREST)
    }
    this.gfxEnemyTop = this.add.graphics() // 스프라이트 위 오버레이(보스 돔·체력바)
    this.gfxArrows = this.add.graphics()
    this.gfxFx = this.add.graphics()
    this.gfxChar = this.add.graphics() // 플레이어 음영 오브(iso 스타일)

    // 플레이어 좌표 앵커 — 원은 숨기고 gfxChar 로 음영 오브를 그린다
    this.player = this.add
      .circle(W / 2, H / 2, this.stats.player.radius, COLOR_PLAYER)
      .setVisible(false)

    // 렌더 순서: 그림자 → 적 스프라이트 → 보스 돔/체력바 → 화살/이펙트 → 플레이어
    this.worldLayer.add([
      this.gfxEnemies,
      this.enemyLayer,
      this.eliteLayer,
      this.gfxEnemyTop,
      this.gfxArrows,
      this.gfxFx,
      this.gfxChar,
      this.player,
    ])

    this.setupPlayerSprite()

    this.buildHud()
    this.setupInput()
    this.setupGrowth()

    // 레벨업 3택 카드 (뱀서 표준). 성장 화면은 보류.
    // 레벨업 화면 = 성장 카드 + 룬 가방 + 스킬 슬롯 통합(탭 없음)
    this.levelup = createLevelupScreen({
      onPick: (c) => this.onCardPick(c),
      getRuneState: () => this.getRuneState(),
      onEquipFromBag: (bagIdx, skillId, slotIdx) =>
        this.equipFromBag(bagIdx, skillId, slotIdx),
    })
    // 룬 획득/장착 (보스 처치)
    // onEquip(skillId, slotIdx) — 랜덤 획득 방식이라 룬은 이미 큐에 있다
    this.runeScreen = createRuneScreen({ onEquip: (sid, idx) => this.onRuneEquip(sid, idx) })
    // 결과 화면 — 다시 하기를 누르면 씬을 재시작한다
    this.result = createResultScreen({ onRetry: () => this.scene.restart() })
    // 성장(스킬트리) 버튼 숨김 — 진행은 카드로.
    if (this.growthBtn) this.growthBtn.setVisible(false)
    if (this.growthBtnText) this.growthBtnText.setVisible(false)
  }

  // 카드 패시브 스택 → 배율 보너스 객체 (deriveStats에 전달)
  cardBonusObj() {
    const cp = this.cardPassives || {}
    return {
      dmg: (cp.dmg || 0) * CARD_PASSIVES.dmg.step,
      move: (cp.move || 0) * CARD_PASSIVES.move.step,
      hp: (cp.hp || 0) * CARD_PASSIVES.hp.step,
      atkSpeed: (cp.atkSpeed || 0) * CARD_PASSIVES.atkSpeed.step,
    }
  }

  // 레벨업 카드 3장 생성 (스킬 신규/레벨업 + 패시브)
  buildCards() {
    const ids = Object.keys(CARD_SKILLS)
    const ownedCount = ids.filter((id) => (this.skillLevels[id] || 0) > 0).length
    const opts = []
    for (const id of ids) {
      const lv = this.skillLevels[id] || 0
      const max = ACTIVE_SKILLS[id] ? ACTIVE_SKILLS[id].maxLevel : 10
      const m = CARD_SKILLS[id]
      if (lv > 0) {
        if (lv < max)
          opts.push({ kind: 'up', id, icon: m.icon, name: m.name, desc: m.desc, tag: `Lv ${lv}→${lv + 1}` })
      } else if (ownedCount < MAX_ACTIVE - 1) {
        opts.push({ kind: 'new', id, icon: m.icon, name: m.name, desc: m.desc })
      }
    }
    for (const id in CARD_PASSIVES) {
      const m = CARD_PASSIVES[id]
      const st = this.cardPassives[id] || 0
      const cur = st ? ` (현재 +${Math.round(st * m.step * 100)}%)` : ''
      opts.push({ kind: 'pas', id, icon: m.icon, name: m.name, desc: m.desc + cur })
    }
    // 섞어서 3장
    for (let i = opts.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0
      ;[opts[i], opts[j]] = [opts[j], opts[i]]
    }
    return opts.slice(0, 3)
  }

  applyCard(card) {
    if (card.kind === 'pas') {
      this.cardPassives[card.id] = (this.cardPassives[card.id] || 0) + 1
    } else {
      this.skillLevels[card.id] = (this.skillLevels[card.id] || 0) + 1
    }
    this.recompute()
  }

  // 대기 중인 모달을 순서대로 연다 (레벨업 카드 → 룬). 하나 닫힐 때마다 호출.
  maybeOpenModal() {
    if (this.gameOver || this.levelupOpen || this.runeOpen) return
    if (this._pendingLevels > 0) {
      this.levelupOpen = true
      this.releaseStick()
      this.levelup.show(this.level, this.buildCards())
      return
    }
    if (this._pendingRunes.length > 0) {
      this.openRuneDrop()
    }
  }

  onCardPick(card) {
    this.applyCard(card)
    this._pendingLevels--
    this.levelupOpen = false
    this.maybeOpenModal() // 남은 레벨 or 대기 룬
  }

  // --- 룬 획득 (시안 B: 랜덤 1개 → 스킬 1탭, 스마트 기본값) ---
  // 랜덤으로 굴린 룬 인스턴스를 큐에 넣는다. boss=true면 등급 보정을 살짝 준다.
  grantRune(boss = false) {
    const id = RUNE_POOL[(Math.random() * RUNE_POOL.length) | 0]
    this._pendingRunes.push(rollRune(id, this.elapsed + (boss ? 120 : 0)))
  }

  openRuneDrop() {
    const rune = this._pendingRunes[0]
    if (!rune) return
    this.runeOpen = true
    this.releaseStick()
    this.runeScreen.show(
      {
        ...rune,
        icon: RUNES[rune.id].icon,
        color: RUNES[rune.id].color,
        tierName: RUNE_TIERS[rune.tier].name,
        tierColor: RUNE_TIERS[rune.tier].color,
        label: runeLabel(rune),
        desc: runeDesc(rune),
      },
      this.buildRuneSkillList()
    )
  }

  buildRuneSkillList() {
    const list = [{ id: 'basic', name: '기본 사격', icon: '🎯' }]
    for (const id in CARD_SKILLS) {
      if ((this.skillLevels[id] || 0) > 0)
        list.push({ id, name: CARD_SKILLS[id].name, icon: CARD_SKILLS[id].icon })
    }
    return list.map((s) => {
      const slots = this.runeSlots[s.id]
      return {
        ...s,
        // 슬롯 상태 배열 — UI가 RUNE_SLOTS 칸을 그린다
        slots: slots.map((r) =>
          r
            ? {
                // id/v는 레벨업 화면의 비교 화살표(▲▼)가 쓴다. 빼면 비교가 안 된다.
                id: r.id,
                v: r.v,
                icon: RUNES[r.id].icon,
                tier: r.tier,
                tierColor: RUNE_TIERS[r.tier].color,
                label: runeLabel(r),
                desc: runeDesc(r),
              }
            : null
        ),
        freeIdx: slots.findIndex((r) => !r), // -1이면 꽉 참(교체 필요)
      }
    })
  }

  // 일반몹 드랍 — 자동 장착하지 않고 **가방으로** 보낸다(NEW 표시).
  // 장착은 다음 레벨업 화면에서 플레이어가 직접 한다 → 선택의 재미 유지 + 전투 안 끊김.
  bagGrantRune() {
    const id = RUNE_POOL[(Math.random() * RUNE_POOL.length) | 0]
    const rune = rollRune(id, this.elapsed)
    rune.isNew = true
    this.runeBag.push(rune)
    this.spawnRuneToast(rune)
    return true
  }

  // 레벨업 화면에 넘길 룬 상태 (가방 + 스킬 슬롯)
  getRuneState() {
    const bag = this.runeBag.map((r) => ({
      id: r.id,
      v: r.v,
      tier: r.tier,
      isNew: !!r.isNew,
      icon: RUNES[r.id].icon,
      tierName: RUNE_TIERS[r.tier].name,
      tierColor: RUNE_TIERS[r.tier].color,
      label: runeLabel(r),
      desc: runeDesc(r),
      short: RUNES[r.id].shortFmt(r.v),
    }))
    return { bag, skills: this.buildRuneSkillList() }
  }

  // 가방 룬 → 스킬 슬롯. 기존 룬이 있으면 교체하고 그 룬은 가방으로 돌아온다.
  equipFromBag(bagIdx, skillId, slotIdx) {
    const rune = this.runeBag[bagIdx]
    if (!rune || !this.runeSlots[skillId]) return
    const slots = this.runeSlots[skillId]
    let i = slotIdx
    if (i < 0 || i >= slots.length) {
      i = slots.findIndex((r) => !r)
      if (i < 0) i = 0
    }
    const old = slots[i]
    slots[i] = rune
    delete rune.isNew
    this.runeBag.splice(bagIdx, 1)
    if (old) this.runeBag.push(old) // 빠진 룬은 가방으로
    this.recompute()
  }

  // 획득 알림 — 데미지 숫자 팝업을 재사용해 플레이어 위에 표시
  spawnRuneToast(rune) {
    const txt = `${RUNES[rune.id].icon} ${runeLabel(rune)}`
    this.spawnPopup(this.player.x, this.player.y - 46, txt, false, RUNE_TIERS[rune.tier].color)
  }

  // 스킬에 장착. slotIdx가 없으면 빈 슬롯 우선, 없으면 첫 슬롯 교체.
  // skillId 가 null/미지정이면 **장착하지 않고 가방으로** 보낸다.
  //   장착을 강제하면 슬롯이 꽉 찬 상태에서 더 좋은 룬을 억지로 빼야 했다.
  //   버리는 게 아니라 가방에 남으므로 다음 레벨업 화면에서 다시 판단할 수 있다.
  onRuneEquip(skillId, slotIdx = -1) {
    const rune = this._pendingRunes.shift()
    if (rune) {
      const slots = skillId ? this.runeSlots[skillId] : null
      if (slots) {
        let i = slotIdx
        if (i < 0 || i >= slots.length) {
          i = slots.findIndex((r) => !r)
          if (i < 0) i = 0
        }
        const old = slots[i]
        slots[i] = rune
        if (old) this.runeBag.push(old) // 교체로 빠진 룬은 버리지 않고 가방으로
        this.recompute()
      } else {
        rune.isNew = true
        this.runeBag.push(rune)
      }
    }
    this.runeOpen = false
    this.maybeOpenModal()
  }

  // --- 성장 시스템 -------------------------------------------------------

  setupGrowth() {
    this.growth = createGrowthScreen({
      getState: () => ({
        level: this.level,
        attrPoints: this.attrPoints,
        attributes: this.attributes,
        skillPoints: this.skillPoints,
        skillLevels: this.skillLevels,
        specs: this.specs,
        cfg: this.cfg,
      }),
      onApply: (finalAttr, spent) => {
        this.attributes = finalAttr
        this.attrPoints -= spent
        this.recompute()
        this.refreshGrowthHud()
      },
      onSkillInvest: (id) => this.investSkill(id),
      onSpecChoose: (id, choice) => this.chooseSpec(id, choice),
      onClose: () => {
        this.growthOpen = false
      },
    })
    this.refreshGrowthHud()
  }

  openGrowth() {
    // 성장(스킬트리) 화면 보류 — 진행은 레벨업 카드로. (코드는 남겨둠)
  }

  // 스킬 포인트로 스킬 1레벨 투자 (즉시 확정). 성공하면 true.
  investSkill(id) {
    if (this.skillPoints <= 0) return false
    if (investBlockReason(id, this.skillLevels, this.level)) return false
    this.skillLevels[id] = (this.skillLevels[id] || 0) + 1
    this.skillPoints--
    this.recompute()
    this.refreshGrowthHud()
    return true
  }

  // 5레벨 특화 선택 (한 번만). 성공하면 true.
  chooseSpec(id, choice) {
    if (this.specs[id]) return false // 이미 선택함
    if ((this.skillLevels[id] || 0) < SPEC_LEVEL) return false
    this.specs[id] = choice
    this.recompute()
    return true
  }

  // 능력치가 바뀔 때마다 최종 전투 stats 를 통째로 다시 계산한다.
  // 최대 HP 증가분만큼 현재 HP 도 함께 올린다 (활력 스펙).
  recompute() {
    const prevMax = this.stats.player.maxHp
    this.stats = deriveStats(
      this.cfg, this.attributes, this.skillLevels, this.specs,
      this.cardBonusObj(), this.runeSlots
    )
    const gained = this.stats.player.maxHp - prevMax
    if (gained > 0) this.hp += gained
    this.hp = Math.min(this.hp, this.stats.player.maxHp)
    this.refreshHpBar()
  }

  // --- 배경: 아이소 던전 바닥 (iso_topdown 스타일) --------------------------
  // 스크린 캔버스 텍스처에 매 프레임 아이소 타일을 다시 그린다(플레이어 이동 시만).
  // 게임 로직은 그대로 탑다운 월드 좌표 — 바닥만 아이소 스킨.

  buildBackground() {
    this._isoR = Math.ceil((W / 64 + H / 32) / 2) + 2
    this._lastCamX = null
    this._lastCamY = null

    // 타일/데칼 이미지 — preload 에서 이미 디코딩됨. 텍스처 매니저의
    // HTMLImageElement 를 꺼내 ctx.drawImage 에 쓴다(플레이 중 디코딩 튐 없음).
    this.floorSheet = this.textures.exists('isotileset')
      ? this.textures.get('isotileset').getSourceImage()
      : new Image()
    this.floorDec = this.textures.exists('isodecals')
      ? this.textures.get('isodecals').getSourceImage()
      : new Image()
    // 맵 다양화용 추가 시트 (없으면 자동으로 기본 타일만 사용)
    this.floorSpecial = this.textures.exists('isospecial')
      ? this.textures.get('isospecial').getSourceImage()
      : new Image()
    this.floorMoss = this.textures.exists('isomoss')
      ? this.textures.get('isomoss').getSourceImage()
      : new Image()

    const tex = this.textures.exists('isofloor')
      ? this.textures.get('isofloor')
      : this.textures.createCanvas('isofloor', W, H)
    this.floorCanvas = tex
    this.floorCtx = tex.context
    this.add.image(0, 0, 'isofloor').setOrigin(0).setDepth(-5)

    // 프롭 전경 레이어 — 플레이어보다 "앞"(아래쪽)에 있는 오브젝트를 엔티티 위에 덮는다.
    // worldLayer=depth 1, 비네트=depth 5 사이에 둔다.
    const pf = this.textures.exists('isopropfront')
      ? this.textures.get('isopropfront')
      : this.textures.createCanvas('isopropfront', W, H)
    this.propFrontCanvas = pf
    this.propFrontCtx = pf.context
    this.add.image(0, 0, 'isopropfront').setOrigin(0).setDepth(3)

    // 횃불 불꽃 전용 레이어 — 전경 프롭(depth 3)보다 위, 비네트(depth 5)보다 아래.
    // worldLayer 밖이므로 여기서는 **화면 좌표**로 그린다(월드좌표는 매 프레임 변환).
    this.gfxFlames = this.add.graphics().setDepth(4)

    // 프롭 소스 이미지(캔버스 drawImage용) + 화면 내 횃불 위치(불꽃 애니메이션용)
    this.propSheet = this.textures.exists('isoprops')
      ? this.textures.get('isoprops').getSourceImage()
      : new Image()
    this.torchLights = []

    // 던전 비네트(정적, 1회 굽기)
    if (!this.textures.exists('isovig')) {
      const vt = this.textures.createCanvas('isovig', W, H)
      const vc = vt.context
      const rg = vc.createRadialGradient(
        W / 2, H / 2, Math.min(W, H) * 0.32,
        W / 2, H / 2, Math.max(W, H) * 0.62
      )
      rg.addColorStop(0, 'rgba(0,0,0,0)')
      rg.addColorStop(1, 'rgba(5,7,11,0.5)')
      vc.fillStyle = rg
      vc.fillRect(0, 0, W, H)
      vt.refresh()
    }
    this.add.image(0, 0, 'isovig').setOrigin(0).setDepth(5)
  }

  updateBackground() {
    const px = this.player.x
    const py = this.player.y
    // 플레이어가 안 움직였으면 바닥 재그리기/업로드 생략 (최적화)
    if (px === this._lastCamX && py === this._lastCamY) return
    this._lastCamX = px
    this._lastCamY = py

    const ctx = this.floorCtx
    ctx.fillStyle = '#0b0e13' // 그루트(틈) 색
    ctx.fillRect(0, 0, W, H)

    const sheet = this.floorSheet
    if (sheet.complete && sheet.naturalWidth) {
      const dec = this.floorDec
      const decOk = dec.complete && dec.naturalWidth
      const sp = this.floorSpecial
      const spOk = sp && sp.complete && sp.naturalWidth
      const moss = this.floorMoss
      const mossOk = moss && moss.complete && moss.naturalWidth
      const TW = 128, TH = 64, N = 16, DS = 64, DN = 8
      const ox = W / 2 - px
      const oy = H / 2 - py
      const cc = (px / (TW / 2) + py / (TH / 2)) / 2
      const rr = (py / (TH / 2) - px / (TW / 2)) / 2
      const R = this._isoR
      for (let r = Math.floor(rr - R); r <= rr + R; r++) {
        for (let c = Math.floor(cc - R); c <= cc + R; c++) {
          const sx = ox + (c - r) * (TW / 2) - TW / 2
          const sy = oy + (c + r) * (TH / 2) - TH / 2
          if (sx < -TW || sx > W || sy < -TH || sy > H) continue
          const hv = ((c * 73856093) ^ (r * 19349663)) >>> 0

          // --- 타일 선택: 가중치(일반 85% / 깨짐 12% / 구멍 3%) + 이끼 대역 ---
          let src = sheet
          let k = hv % N
          const roll = hv % 100
          if (roll >= 97 && spOk) {
            src = sp
            k = 6 + (hv % 4) // 구멍(void) 4종
          } else if (roll >= 85 && spOk) {
            src = sp
            k = hv % 6 // 깨진 타일 6종
          } else if (mossOk && this.isMossBiome(c, r, hv)) {
            src = moss // 이끼 대역 — 저주파 노이즈로 큰 덩어리
          }

          if ((hv >> 8) & 1) {
            ctx.save()
            ctx.translate(sx + TW, sy)
            ctx.scale(-1, 1)
            ctx.drawImage(src, k * TW, 0, TW, TH, 0, 0, TW, TH)
            ctx.restore()
          } else {
            ctx.drawImage(src, k * TW, 0, TW, TH, sx, sy, TW, TH)
          }
          if (decOk) {
            // 데칼 뭉치기 — 구역마다 밀도 차이(어수선/보통/깨끗)
            const rh = (((c >> 2) * 92837111) ^ ((r >> 2) * 689287499)) >>> 0
            const gate = rh % 4 === 0 ? 3 : rh % 4 === 1 ? 7 : 13
            if (hv % gate === 0) {
              const dk = (hv >> 12) % DN
              ctx.drawImage(dec, dk * DS, 0, DS, DS, sx + 32, sy, DS, DS)
            }
          }
        }
      }

      // 오브젝트(프롭) 레이어 + 횃불 조명 — 타일 위, 구역명암 아래에 그린다.
      // 플레이어보다 아래쪽(앞) 프롭은 전경 캔버스로 분리되어 엔티티를 덮는다.
      this.drawProps(ctx, px, py, ox, oy, cc, rr, R)

      // 넓은 구역 명암 (단조로움 완화) — 좌표 해시 기반, 스크롤해도 일관
      const REG = 360
      const gx0 = Math.floor((px - W) / REG)
      const gx1 = Math.floor((px + W) / REG)
      const gy0 = Math.floor((py - H) / REG)
      const gy1 = Math.floor((py + H) / REG)
      for (let gy = gy0; gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          const h = ((gx * 374761393) ^ (gy * 668265263)) >>> 0
          if (h % 3 === 0) continue // 일부 구역은 변화 없음
          const cxw = gx * REG + ((h >> 3) % REG)
          const cyw = gy * REG + ((h >> 13) % REG)
          const bx = cxw - px + W / 2
          const by = cyw - py + H / 2
          const rad = REG * (0.55 + ((h >> 5) % 35) / 100)
          if (bx + rad < 0 || bx - rad > W || by + rad < 0 || by - rad > H) continue
          const rg = ctx.createRadialGradient(bx, by, 0, bx, by, rad)
          if (h & 1) {
            rg.addColorStop(0, `rgba(4,6,10,${0.1 + ((h >> 7) % 13) / 100})`) // 그늘
          } else {
            rg.addColorStop(0, `rgba(150,162,205,${0.05 + ((h >> 7) % 8) / 100})`) // 은은한 빛
          }
          rg.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.fillStyle = rg
          ctx.fillRect(bx - rad, by - rad, rad * 2, rad * 2)
        }
      }
      // 위/아래 깊이 어두움
      const gt = ctx.createLinearGradient(0, 0, 0, 150)
      gt.addColorStop(0, 'rgba(6,8,12,0.55)')
      gt.addColorStop(1, 'rgba(6,8,12,0)')
      ctx.fillStyle = gt
      ctx.fillRect(0, 0, W, 150)
      const gb = ctx.createLinearGradient(0, H, 0, H - 150)
      gb.addColorStop(0, 'rgba(6,8,12,0.55)')
      gb.addColorStop(1, 'rgba(6,8,12,0)')
      ctx.fillStyle = gb
      ctx.fillRect(0, H - 150, W, 150)
    }
    this.floorCanvas.refresh()
  }

  // --- 캐릭터 스프라이트 (동작 애니) --------------------------------------

  setupPlayerSprite() {
    this.playerSprite = null
    // 시트가 정상 로드되지 않았으면 폴백(음영 오브)으로 둔다
    if (!this.textures.exists('archer')) return
    const tex = this.textures.get('archer')
    if (tex.frameTotal < 50) return // 로드 실패(플레이스홀더) 방어 — 정상은 56+
    if (tex.setFilter) tex.setFilter(Phaser.Textures.FilterMode.NEAREST) // 픽셀 또렷하게

    // skip: 루프 첫 프레임 제외. run·back_run은 0번이 "정지 포즈"라 빼야
    // 루프가 매번 서는 것처럼 안 보인다.
    const defs = {
      idle: { row: 0, frames: 4, fps: 6, loop: true },
      run: { row: 1, frames: 6, fps: 12, loop: true, skip: 1 },
      back_run: { row: 2, frames: 8, fps: 12, loop: true, skip: 1 },
      attack: { row: 3, frames: 4, fps: 14, loop: false },
      multishot: { row: 4, frames: 5, fps: 14, loop: false },
      hit: { row: 5, frames: 2, fps: 10, loop: false },
      death: { row: 6, frames: 5, fps: 10, loop: false },
    }
    for (const key in defs) {
      if (this.anims.exists(key)) continue
      const d = defs[key]
      const rowStart = d.row * 8 // 프레임 = 행*8 + 열
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers('archer', {
          start: rowStart + (d.skip || 0),
          end: rowStart + d.frames - 1,
        }),
        frameRate: d.fps,
        repeat: d.loop ? -1 : 0,
      })
    }

    // 외형 배율은 반지름(히트박스)에 비례 — 튜너 '크기' 슬라이더 하나로 함께 조정됨
    const scale = (this.cfg.player.radius || 10) * PLAYER_SPRITE_K
    this._bowOffsetY = SPRITE_H * scale * 0.4 // 화살 발사(활) 높이
    this.playerSprite = this.add
      .sprite(this.player.x, this.player.y, 'archer', 0)
      .setOrigin(0.5, 0.8) // 발끝 하단 정렬
      .setScale(scale)
    // 림라이트(외곽선) — 어두운 바닥에 캐릭터가 묻히지 않게 실루엣만 살짝 띄운다.
    // 얇고 옅은 회색(흰색·큰 발광은 과함). Phaser 내장 GPU FX, WebGL 전용 가드.
    if (this.playerSprite.postFX) {
      this.playerSprite.postFX.addGlow(0xaab2bd, 2, 0, false, 0.05, 4)
    }
    this.worldLayer.add(this.playerSprite)
    this.animKey = 'idle'
    this.playerSprite.play('idle')
  }

  updatePlayerAnim(vx, vy) {
    const sp = this.playerSprite
    if (!sp || this.animKey === 'death') return
    const moving = Math.abs(vx) + Math.abs(vy) > 0.05
    const key = !moving ? 'idle' : vy < -0.35 ? 'back_run' : 'run'
    if (Math.abs(vx) > 0.05) sp.setFlipX(vx < 0) // 왼쪽 이동 시 미러
    if (this.animKey !== key) {
      this.animKey = key
      sp.play(key, true)
    }
  }

  // --- HUD ---------------------------------------------------------------

  buildHud() {
    const d = 10

    this.add.rectangle(W / 2, 10, W, 8, 0x313244).setDepth(d)
    this.xpBar = this.add
      .rectangle(0, 10, W, 8, 0xf9e2af)
      .setOrigin(0, 0.5)
      .setDepth(d)
    this.xpBar.scaleX = 0

    this.add.rectangle(20, 34, 200, 14, 0x313244).setOrigin(0, 0.5).setDepth(d)
    this.hpBar = this.add
      .rectangle(20, 34, 200, 14, 0xa6e3a1)
      .setOrigin(0, 0.5)
      .setDepth(d)

    const font = { fontFamily: 'Arial, sans-serif', color: '#cdd6f4' }

    this.lvText = this.add
      .text(20, 52, 'Lv 1', { ...font, fontSize: '18px' })
      .setDepth(d)

    this.timeText = this.add
      .text(W / 2, 26, '0:00', { ...font, fontSize: '30px', color: '#ffffff' })
      .setOrigin(0.5, 0)
      .setDepth(d)

    this.bossTimerText = this.add
      .text(W / 2, 62, '', {
        ...font,
        fontSize: '14px',
        color: '#cba6f7',
      })
      .setOrigin(0.5, 0)
      .setDepth(d)

    // 멈춤 버튼 자리를 비우려고 우측 정보는 한 칸씩 내렸다
    this.killText = this.add
      .text(W - 20, 68, 'Kills: 0', { ...font, fontSize: '20px' })
      .setOrigin(1, 0)
      .setDepth(d)

    this.waveText = this.add
      .text(W - 20, 94, '', { ...font, fontSize: '15px', color: '#a6adc8' })
      .setOrigin(1, 0)
      .setDepth(d)

    this.buildPauseButton()

    // 개발용 수치 3종(fps·속도/DMG·능력치)은 ?dev 일 때만 만든다.
    // 플레이어 화면에선 숨기고(혼동 방지), 개발 중엔 URL 로 켠다.
    if (DEV_HUD) {
      this.perfText = this.add
        .text(W - 20, H - 20, '', { ...font, fontSize: '13px', color: '#6c7086' })
        .setOrigin(1, 1)
        .setDepth(d)

      // 두 기기가 같은 값을 쓰는지 눈으로 비교하기 위한 표시.
      this.statText = this.add
        .text(20, H - 20, '', { ...font, fontSize: '13px', color: '#6c7086' })
        .setOrigin(0, 1)
        .setDepth(d)

      // 능력치 요약 (좌상단, 레벨 아래) — 룬 피벗으로 보류(전부 0)라 기본 숨김
      this.attrHudText = this.add
        .text(20, 74, '', { ...font, fontSize: '13px', color: '#94e2d5' })
        .setDepth(d)
    } else {
      this.perfText = this.statText = this.attrHudText = null
    }

    // 성장 버튼 (하단 중앙). 미사용 포인트가 있으면 금색으로 강조된다.
    this.growthBtn = this.add
      .rectangle(W / 2, H - 70, 240, 46, 0x313244, 0.92)
      .setStrokeStyle(2, 0x585b70)
      .setDepth(15)
      .setInteractive({ useHandCursor: true })
    this.growthBtn.on('pointerdown', () => this.openGrowth())

    this.growthBtnText = this.add
      .text(W / 2, H - 70, 'C  성장', { ...font, fontSize: '15px' })
      .setOrigin(0.5)
      .setDepth(16)
  }

  refreshGrowthHud() {
    if (this.attrHudText) {
      const a = this.attributes
      this.attrHudText.setText(
        `힘 ${a.str}  민 ${a.dex}  지 ${a.int}  활 ${a.vit}`
      )
    }

    const has = this.attrPoints > 0 || this.skillPoints > 0
    this.growthBtnText.setText(
      `C  성장   ·   능력치 ${this.attrPoints}  스킬 ${this.skillPoints}`
    )
    this.growthBtnText.setColor(has ? '#f9e2af' : '#cdd6f4')
    this.growthBtn.setStrokeStyle(2, has ? 0xf9e2af : 0x585b70)
  }

  // 우측 상단 멈춤 버튼 + 일시정지 오버레이
  buildPauseButton() {
    const bx = W - 36
    const by = 38
    const r = 24

    this.pauseBtn = this.add
      .rectangle(bx, by, r * 2, r * 2, 0x313244, 0.9)
      .setStrokeStyle(2, 0x585b70)
      .setDepth(15)
      .setInteractive({ useHandCursor: true })

    // ❚❚ (멈춤) 아이콘 — 세로 막대 2개
    this.iconPause = this.add.container(bx, by, [
      this.add.rectangle(-6, 0, 5, 20, 0xcdd6f4),
      this.add.rectangle(6, 0, 5, 20, 0xcdd6f4),
    ]).setDepth(16)

    // ▶ (재개) 아이콘 — 삼각형. 멈춘 동안에만 보인다
    this.iconPlay = this.add
      .triangle(bx + 2, by, 0, -11, 0, 11, 15, 0, 0xa6e3a1)
      .setDepth(16)
      .setVisible(false)

    this.pauseBtn.on('pointerdown', () => this.togglePause())

    // 일시정지 오버레이 (버튼보다 아래 depth 라 버튼은 계속 보인다)
    this.pauseOverlay = this.add
      .rectangle(W / 2, H / 2, W, H, 0x11111b, 0.72)
      .setDepth(14)
      .setVisible(false)

    this.pauseLabel = this.add
      .text(W / 2, H / 2, '일시정지\n\n▶ 버튼으로 재개', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '30px',
        color: '#cdd6f4',
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(14)
      .setVisible(false)
  }

  togglePause() {
    // 게임오버·성장화면 중에는 멈춤 토글을 무시한다
    if (this.gameOver || this.growthOpen) return

    this.userPaused = !this.userPaused
    this.releaseStick()

    this.pauseOverlay.setVisible(this.userPaused)
    this.pauseLabel.setVisible(this.userPaused)
    this.iconPause.setVisible(!this.userPaused)
    this.iconPlay.setVisible(this.userPaused)
  }

  // --- 입력 ---------------------------------------------------------------

  setupInput() {
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT')

    this.stick = { active: false, ox: 0, oy: 0, x: 0, y: 0 }
    this.stickBase = this.add
      .circle(0, 0, 60, 0xcdd6f4, 0.12)
      .setVisible(false)
      .setDepth(9)
    this.stickThumb = this.add
      .circle(0, 0, 24, 0xcdd6f4, 0.35)
      .setVisible(false)
      .setDepth(9)

    this.input.on('pointerdown', (p) => {
      // 사망 후: 결과 화면이 뜨기 전(사망 애니 재생 중) 클릭은 무시한다.
      // 그러지 않으면 결과 화면을 건너뛰고 **최고 기록이 저장되지 않는다.**
      if (this.gameOver) {
        if (this.result && this.result.isOpen) this.scene.restart()
        return
      }
      // 버튼을 누른 것이면 조이스틱을 켜지 않는다 (버튼이 자체 처리)
      if (this.pauseBtn.getBounds().contains(p.x, p.y)) return
      if (this.growthBtn.getBounds().contains(p.x, p.y)) return
      if (this.userPaused || this.growthOpen || this.levelupOpen || this.runeOpen) return

      this.stick.active = true
      this.stick.ox = p.x
      this.stick.oy = p.y
      this.stick.x = 0
      this.stick.y = 0
      this.stickBase.setPosition(p.x, p.y).setVisible(true)
      this.stickThumb.setPosition(p.x, p.y).setVisible(true)
    })

    this.input.on('pointermove', (p) => {
      if (!this.stick.active) return
      let dx = p.x - this.stick.ox
      let dy = p.y - this.stick.oy
      const len = Math.hypot(dx, dy)
      if (len > 60) {
        dx = (dx / len) * 60
        dy = (dy / len) * 60
      }
      this.stick.x = dx / 60
      this.stick.y = dy / 60
      this.stickThumb.setPosition(this.stick.ox + dx, this.stick.oy + dy)
    })

    this.input.on('pointerup', () => this.releaseStick())

    this.input.keyboard.on('keydown-SPACE', () => {
      // 결과 화면이 뜬 뒤에만 재시작 (기록 저장 보장)
      if (this.gameOver && this.result && this.result.isOpen) this.scene.restart()
    })

    // PC: ESC 또는 P 로 멈춤 토글
    this.input.keyboard.on('keydown-ESC', () => this.togglePause())
    this.input.keyboard.on('keydown-P', () => this.togglePause())

    // C: 성장 화면 토글
    this.input.keyboard.on('keydown-C', () => {
      if (this.growthOpen) this.growth.close()
      else this.openGrowth()
    })
  }

  releaseStick() {
    this.stick.active = false
    this.stick.x = 0
    this.stick.y = 0
    this.stickBase.setVisible(false)
    this.stickThumb.setVisible(false)
  }

  moveInput() {
    let vx = 0
    let vy = 0
    const k = this.keys
    if (k.A.isDown || k.LEFT.isDown) vx -= 1
    if (k.D.isDown || k.RIGHT.isDown) vx += 1
    if (k.W.isDown || k.UP.isDown) vy -= 1
    if (k.S.isDown || k.DOWN.isDown) vy += 1

    if (vx === 0 && vy === 0 && this.stick.active) {
      vx = this.stick.x
      vy = this.stick.y
    }

    const len = Math.hypot(vx, vy)
    if (len > 1) {
      vx /= len
      vy /= len
    }
    return { vx, vy }
  }

  // --- 스폰 ---------------------------------------------------------------

  get minutes() {
    return Math.floor(this.elapsed / 60)
  }

  get spawnMultiplier() {
    const s = this.cfg.spawn
    return Math.min(Math.pow(s.rampPerMin, this.minutes), s.rampCap)
  }

  get enemyHpNow() {
    const e = this.cfg.enemy
    return Math.round(e.hp * Math.pow(e.hpRampPerMin, this.minutes))
  }

  get bossHpNow() {
    const b = this.cfg.boss
    return Math.round(b.hp * Math.pow(b.hpRampPerMin, this.minutes))
  }

  // 플레이어 기준 화면 밖 원둘레에서 스폰 (무한 월드)
  edgePosition(extra) {
    const ang = Math.random() * Math.PI * 2
    const dist = SPAWN_DIST + extra
    return {
      x: this.player.x + Math.cos(ang) * dist,
      y: this.player.y + Math.sin(ang) * dist,
    }
  }

  // 적 하나를 풀에서 꺼내 초기화. 보스도 같은 구조를 쓴다 —
  // 크기/속도/데미지를 개체마다 들고 있으므로 특수 처리가 필요 없다.
  makeEnemy(x, y, spec) {
    const e = this.enemyPool.pop() || {}
    e.x = x
    e.y = y
    e.hp = spec.hp
    e.maxHp = spec.hp
    e.r = spec.r
    e.speed = spec.speed
    e.dmg = spec.dmg
    e.kbResist = spec.kbResist
    e.gems = spec.gems
    e.boss = spec.boss
    e.type = spec.type || 'basic'
    e.ranged = spec.ranged || false
    // 엘리트 — kind id('charger'|...) 또는 null. 아래 3개는 패턴 상태.
    e.elite = spec.elite || null
    e.eliteRow = spec.eliteRow || 0
    e.charging = 0 // >0 이면 돌진 중(이 시간 동안 저장된 방향으로 직진)
    e.chvx = 0
    e.chvy = 0
    e.windup = 0 // >0 이면 예고 중(제자리에 멈춘다 — 회피할 틈을 준다)
    e.buffed = false // 수호자 오라 적용 여부(매 프레임 재계산)
    e.auraPulse = 0 // 수호자 오라 펄스 연출 잔여 시간 (풀 재사용 시 잔류 방지)
    e.kbx = 0
    e.kby = 0
    e.stun = 0 // 피격 경직 남은 시간(초)
    e.burn = null // 화상 도트 {dps,time} — 중첩 안 됨
    e.poison = null // 독 도트 {dps,stacks,time} — 최대 POISON_MAX_STACKS 중첩
    e.chill = null // 냉기 {mul,time} — 이속 감소
    e.vuln = null // 취약 {mul,time} — 받는 피해 증폭
    e.flash = 0
    e.wob = Math.random() * Math.PI * 2 // 유기적 흔들림 위상
    e.animOff = (Math.random() * 4) | 0 // 걷기 프레임 위상(개체별 어긋나게)
    e.atk = spec.boss
      ? this.cfg.boss.attackInterval
      : spec.elite
        ? this.cfg.elite.attackInterval * 0.5 // 등장 후 첫 패턴은 조금 빨리(존재감)
        : spec.ranged
          ? this.cfg.enemy.shooterInterval
          : 0
    this.enemies.push(e)
    return e
  }

  spawnEnemy() {
    if (this.enemies.length >= this.cfg.spawn.maxEnemies) return
    const c = this.cfg.enemy
    const p = this.edgePosition(40)

    // 타입 선택: 시간이 지나야 돌진/원거리가 해금된다 (단계별 난이도)
    const roll = Math.random()
    const canRush = this.elapsed >= c.rusherStartSec
    const canShoot = this.elapsed >= c.shooterStartSec
    let type = 'basic'
    let speed = c.speed
    let hp = this.enemyHpNow
    let ranged = false
    if (canRush && roll < c.rusherChance) {
      type = 'rusher'
      speed = c.speed * c.rusherSpeedMul
      hp = this.enemyHpNow * c.rusherHpMul
    } else if (
      canShoot &&
      roll >= c.rusherChance &&
      roll < c.rusherChance + c.shooterChance
    ) {
      type = 'shooter'
      speed = c.speed * c.shooterSpeedMul
      hp = this.enemyHpNow * c.shooterHpMul
      ranged = true
    }

    this.makeEnemy(p.x, p.y, {
      hp,
      r: c.radius,
      speed,
      dmg: c.contactDamage,
      kbResist: 1,
      gems: 1,
      boss: false,
      type,
      ranged,
    })
  }

  // 엘리트 등장 — 시간 기반. 룬 드랍이 여기에 묶여 있으므로
  // 이 주기가 곧 "판당 룬 개수"다(킬 수와 무관 → 실력 편차에 덜 흔들린다).
  spawnElite() {
    const el = this.cfg.elite
    // 동시 생존 상한 — 넘으면 이번 차례는 건너뛴다(누적은 유지하지 않음)
    let alive = 0
    for (let i = 0; i < this.enemies.length; i++) if (this.enemies[i].elite) alive++
    if (alive >= el.maxAlive) return false

    const kind = ELITE_KINDS[(Math.random() * ELITE_KINDS.length) | 0]
    const p = this.edgePosition(60)
    this.makeEnemy(p.x, p.y, {
      hp: this.enemyHpNow * el.hpMul,
      r: el.radius,
      speed: this.cfg.enemy.speed * el.speedMul,
      dmg: el.contactDamage,
      kbResist: el.knockbackResist,
      gems: el.gems,
      boss: false,
      type: 'elite',
      elite: kind.id,
      eliteRow: kind.row,
    })
    this.eliteCount++
    this.announceElite(kind)
    return true
  }

  // 보스처럼 화면을 덮지 않고, 짧게 스쳐가는 알림. 색 = 그 엘리트의 패턴 색.
  announceElite(kind) {
    const t = this.add
      .text(W / 2, 96, `엘리트 · ${kind.name}`, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '22px',
        color: '#' + kind.tint.toString(16).padStart(6, '0'),
      })
      .setOrigin(0.5)
      .setDepth(25)

    this.tweens.add({
      targets: t,
      alpha: { from: 1, to: 0 },
      y: 78,
      duration: 1200,
      ease: 'Quad.easeOut',
      onComplete: () => t.destroy(),
    })
  }

  spawnBoss() {
    const b = this.cfg.boss
    const p = this.edgePosition(60)
    this.makeEnemy(p.x, p.y, {
      hp: this.bossHpNow,
      r: b.radius,
      speed: b.speed,
      dmg: b.contactDamage,
      kbResist: b.knockbackResist,
      gems: b.gems,
      boss: true,
      type: 'boss',
    })

    this.bossCount++
    this.announceBoss()
  }

  announceBoss() {
    const t = this.add
      .text(W / 2, H / 2 - 140, '! BOSS !', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '46px',
        color: '#cba6f7',
      })
      .setOrigin(0.5)
      .setDepth(25)

    this.tweens.add({
      targets: t,
      alpha: { from: 1, to: 0 },
      scale: { from: 1, to: 1.35 },
      duration: 1100,
      ease: 'Quad.easeOut',
      onComplete: () => t.destroy(),
    })
  }

  removeSwap(arr, i, pool) {
    const item = arr[i]
    arr[i] = arr[arr.length - 1]
    arr.pop()
    pool.push(item)
  }

  // --- 전투 ---------------------------------------------------------------

  nearestEnemy() {
    const range = this.stats.weapon.range
    let best = null
    let bestDist = range * range

    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i]
      const dx = e.x - this.player.x
      const dy = e.y - this.player.y
      const d = dx * dx + dy * dy
      if (d < bestDist) {
        bestDist = d
        best = e
      }
    }
    return best
  }

  // 화살 하나를 지정한 각도로 발사. 스킬 화살은 데미지·관통이 달라서 화살마다 들고 있는다.
  // 화살 발사·조준 기준 y (팔/활 높이). 스프라이트일 때만 위로 올림.
  get bowY() {
    return this.player.y - (this.playerSprite ? this._bowOffsetY : 0)
  }

  fireAngle(angle, dmg, pierce, skill, sfx) {
    const w = this.stats.weapon
    const a = this.arrowPool.pop() || { hit: new Set() }
    const ux = Math.cos(angle)
    const uy = Math.sin(angle)
    // 발사 지점을 몸 중심이 아니라 "활/팔 위치"로 밀어낸다.
    // 한 점에서 다 나오면(특히 난사 360°) 중앙에 뭉쳐 번쩍이기만 하고 날아가는 게 안 보인다.
    const spawnKey =
      typeof skill === 'string' && SKILL_FX[skill] ? skill : skill ? 'multishot' : 'basic'
    const off = SKILL_FX[spawnKey].spawn || 0
    a.x = this.player.x + ux * off
    a.y = this.bowY + uy * off * 0.55 // 아이소 뷰라 세로는 눌러서(2:1) 적용
    a.vx = ux * w.speed
    a.vy = uy * w.speed
    a.angle = angle
    a.pierceLeft = pierce ?? w.pierce
    a.dmg = dmg
    // 스킬 id 기록 → 스킬별 이펙트(SKILL_FX)에 사용.
    // skill 인자는 스킬 id 문자열('multishot' 등) 또는 기본 활이면 'basic'/false.
    a.fx = typeof skill === 'string' && SKILL_FX[skill] ? skill : skill ? 'multishot' : 'basic'
    a.skill = a.fx !== 'basic' // 스킬 화살 여부 (시각 전용)
    // 발사 후 경과 시간(초). 스트릭/꼬리를 "실제로 이동한 만큼"으로 제한해
    // 꼬리가 발사점 뒤(=캐릭터 반대편)로 뻗는 것을 막는다.
    a.age = 0
    // 직전 위치 기록 — 스윕 충돌 판정(updateArrows)에서 사용.
    // 화살 풀 재사용이므로 반드시 초기화해야 첫 프레임에 엉뚱한 선분이 생기지 않는다.
    a.px1 = a.x
    a.py1 = a.y
    // 상태이상 묶음 {burn,poison,chill,vuln}. deriveStats 가 만든 **불변 참조**를
    // 그대로 들고 다닌다(화살마다 객체를 만들면 GC 부담이 크다). 없으면 null.
    a.sfx = sfx || null
    a.hit.clear()
    this.arrows.push(a)

    // 머즐 플래시 — 화살이 너무 빨라 잔상이 잘 안 보이므로, 발사 지점에 짧게 표시한다.
    // 플레이어 옆에 머물러 시선 안에 들어오므로 스킬 구분 체감이 가장 크다.
    const mfx = SKILL_FX[a.fx]
    if (mfx && mfx.muzzle) {
      this.muzzles.push({
        // 화살이 이미 활 위치(spawn 오프셋)에서 시작하므로 그 지점을 그대로 쓴다
        x: a.x,
        y: a.y,
        angle,
        r: mfx.muzzle,
        tint: mfx.tint,
        life: 0.09,
        max: 0.09,
      })
    }
  }

  // 난사 발사 각도 — "적 방향 가중"
  // 완전 무작위 360°는 대부분 허공으로 날아가 화려하지만 안 맞는다.
  // 근처 적 하나를 무작위로 골라 그 방향 ±BARRAGE_JITTER 로 흩뿌린다.
  // → "사방으로 난사"하는 느낌은 유지하되 명중률이 크게 오른다.
  // 적이 없을 때만 완전 무작위(빈 화면에서도 발사 연출은 유지).
  barrageAngle() {
    const list = this.enemies
    const n = list.length
    if (!n) return Math.random() * Math.PI * 2

    // 사거리 안(넉넉히 1.5배) 후보 중 무작위 1체 — 가까운 적만 노리면 한 방향에 뭉친다
    const maxD = this.stats.weapon.range * 1.5
    const maxD2 = maxD * maxD
    let pick = null
    let seen = 0
    for (let i = 0; i < n; i++) {
      const e = list[i]
      const dx = e.x - this.player.x
      const dy = e.y - this.bowY
      if (dx * dx + dy * dy > maxD2) continue
      seen++
      // 리저버 샘플링 — 배열을 따로 만들지 않고 균등 무작위 1개 선택
      if (Math.random() < 1 / seen) pick = e
    }
    if (!pick) return Math.random() * Math.PI * 2

    const base = Math.atan2(pick.y - this.bowY, pick.x - this.player.x)
    return base + (Math.random() * 2 - 1) * BARRAGE_JITTER
  }

  fireAt(target) {
    const angle = Math.atan2(target.y - this.bowY, target.x - this.player.x)
    const w = this.stats.weapon
    const dmg = w.damage
    this.fireAngle(angle, dmg, undefined, 'basic', w.sfx)
    // 민첩30 추가 화살 — 살짝 벌려서 발사
    const extra = w.extraArrows || 0
    for (let i = 1; i <= extra; i++) {
      const off = 0.12 * Math.ceil(i / 2) * (i % 2 ? 1 : -1)
      this.fireAngle(angle + off, dmg, undefined, 'basic', w.sfx)
    }
  }

  // --- 액티브 스킬 (스킬 트리 레벨 기반) -----------------------------------
  // 각 스킬의 최종 수치는 deriveStats 가 stats.skillStats[id] 에 넣어둔다.
  //  - 다발사격: 타겟 방향 부채꼴 연사
  //  - 연발사격: 가장 가까운 적 단일 연사 (발마다 재조준)
  //  - 난사: 지속시간 동안 360° 난사
  //  - 수류탄: 무작위 적 위치에 count 개 폭발

  updateSkills(dt) {
    for (const id of ACTIVE_IDS) {
      const st = this.stats.skillStats[id]
      if (!st.active) continue

      this.skillAcc[id] += dt
      if (this.skillAcc[id] < st.cooldown) continue

      let fired = false
      if (id === 'multishot') fired = this.triggerMultishot(st)
      else if (id === 'rapidfire') fired = this.triggerRapidfire(st)
      else if (id === 'barrage') fired = this.triggerBarrage(st)
      else if (id === 'grenade') fired = this.triggerGrenade(st)

      // 발동 실패(쏠 적 없음) 시 쿨다운을 소모하지 않는다
      this.skillAcc[id] = fired ? 0 : st.cooldown

      // 지능40 쿨타임 반환 — 발동 시 확률로 쿨 절반 미리 채움
      const c = this.stats.combat
      if (fired && c.cdRefundChance > 0 && Math.random() < c.cdRefundChance) {
        this.skillAcc[id] = st.cooldown * 0.5
      }
    }
  }

  triggerMultishot(st) {
    const target = this.nearestEnemy()
    if (!target) return false
    // 부채꼴 \||/ — 균등 각도로 한 번에 쫙 발사
    const base = Math.atan2(target.y - this.bowY, target.x - this.player.x)
    const spread = Phaser.Math.DegToRad(this.cfg.skill.multishotSpread) * st.spreadMul
    const n = st.shots
    for (let i = 0; i < n; i++) {
      const frac = n <= 1 ? 0.5 : i / (n - 1) // 0..1
      this.fireAngle(base + (frac - 0.5) * spread, st.dmg, st.pierce, 'multishot', st.sfx)
    }
    this.flashSkill(0x89dceb)
    return true
  }

  triggerRapidfire(st) {
    if (!this.nearestEnemy()) return false
    const r = this.burst.rapidfire
    r.left = st.shots
    r.acc = st.interval
    this.flashSkill(0xf38ba8)
    return true
  }

  triggerBarrage(st) {
    const b = this.burst.barrage
    b.timeLeft = st.duration
    b.acc = this.cfg.skill.shotInterval
    this.flashSkill(0xf9e2af)
    return true // 360° 는 타겟 없어도 발동
  }

  // 수류탄 조준 — **가장 가까운 적이 아니라 가장 밀집한 곳**을 노린다.
  //
  // 왜: 기본 활도 nearestEnemy() 를 쏘기 때문에 둘이 같은 표적으로 몰렸다.
  //     화살(1200px/s)이 먼저 도착해 그 적을 죽여버리고, 0.45초 뒤 도착한 수류탄은
  //     빈 자리에서 터졌다. 광역 무기가 단일 표적을 따라가면 존재 의미가 없다.
  // 추가로 비행시간만큼 **예측 사격**한다 — 적은 플레이어를 향해 오므로 예측이 쉽다.
  bestGrenadeTarget(radius) {
    const list = this.enemies
    const n = list.length
    if (!n) return null
    const range = this.stats.weapon.range * 1.2
    const range2 = range * range
    const px = this.player.x
    const py = this.bowY

    // 후보는 최대 SAMPLE 개만 본다 — 전수 조사하면 밀집도 계산이 O(n²)로 튄다
    const SAMPLE = 14
    let best = null
    let bestScore = -1
    let seen = 0
    for (let i = 0; i < n && seen < SAMPLE; i++) {
      // 배열 앞쪽만 보지 않도록 소수 스트라이드로 골고루 훑는다
      const e = list[(i * 7919) % n]
      const dx = e.x - px
      const dy = e.y - py
      if (dx * dx + dy * dy > range2) continue
      seen++
      // 이 적 주변 폭발 반경 안의 적 수 = 점수
      const near = this.grid.query(e.x, e.y, radius, this.explodeBuf)
      let cnt = 0
      for (let j = 0; j < near.length; j++) {
        const o = near[j]
        const ox = o.x - e.x
        const oy = o.y - e.y
        if (ox * ox + oy * oy <= radius * radius) cnt++
      }
      if (cnt > bestScore) {
        bestScore = cnt
        best = e
      }
    }
    if (!best) return null
    // 비행시간 예측 — 적은 플레이어 방향으로 이동하므로 그만큼 앞을 노린다
    const tdx = px - best.x
    const tdy = py - best.y
    const td = Math.hypot(tdx, tdy) || 1
    const lead = best.speed * GRENADE_DUR
    return { x: best.x + (tdx / td) * lead, y: best.y + (tdy / td) * lead }
  }

  triggerGrenade(st) {
    const aim = this.bestGrenadeTarget(st.radius)
    if (!aim) return false
    const bx = this.player.x
    const by = this.bowY
    const dx = aim.x - bx
    const dy = aim.y - by
    const d = Math.hypot(dx, dy) || 1
    const reach = Math.min(d, GRENADE_MAX)
    const cx = bx + (dx / d) * reach
    const cy = by + (dy / d) * reach

    // 여러 발이면 **링 배치**로 흩뿌린다.
    // 기존엔 ±(radius × 0.55) 무작위 지터라 반경 30px 기준 중심이 16px밖에 안 벌어져서
    // 폭발이 거의 완전히 겹쳤다(= 한 점에 뭉쳐 나가는 것처럼 보임).
    // 링 반지름을 radius × 1.15 로 두면 인접 폭발 중심이 약 2×radius 벌어진다.
    const count = Math.max(1, Math.round(st.count))
    const ringR = st.radius * 1.15
    const rot = Math.random() * Math.PI * 2 // 매번 조금 다르게(패턴 고정 방지)
    for (let i = 0; i < count; i++) {
      let ox = 0
      let oy = 0
      if (count > 1) {
        const a = rot + (i / count) * Math.PI * 2
        ox = Math.cos(a) * ringR
        oy = Math.sin(a) * ringR * 0.62 // 아이소 뷰(2:1)라 세로를 눌러 원이 타원으로 보이게
      }
      this.spawnGrenade(bx, by, cx + ox, cy + oy, st.radius, st.dmg, st.sfx)
    }
    this.flashSkill(0xf9e2af)
    return true
  }

  spawnGrenade(x, y, tx, ty, radius, dmg, sfx) {
    const g = this.grenadePool.pop() || {}
    g.sx = x; g.sy = y; g.x = x; g.y = y
    g.tx = tx; g.ty = ty
    g.t = 0; g.radius = radius; g.dmg = dmg; g.sfx = sfx || null
    this.grenades.push(g)
  }

  updateGrenades(dt) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i]
      g.t += dt
      const k = Math.min(1, g.t / GRENADE_DUR)
      g.x = g.sx + (g.tx - g.sx) * k
      g.y = g.sy + (g.ty - g.sy) * k
      if (g.t >= GRENADE_DUR) {
        // 착탄 지점이 비었으면 근처 적으로 살짝 보정한다(예측이 빗나간 경우).
        // 유도 거리를 radius×2 로 제한 — 화면 반대편까지 끌려가면 광역기가 아니라 유도탄이 된다.
        let tx = g.tx
        let ty = g.ty
        if (!this.anyEnemyWithin(tx, ty, g.radius)) {
          const alt = this.nearestEnemyTo(tx, ty, g.radius * 2)
          if (alt) {
            tx = alt.x
            ty = alt.y
          }
        }
        this.explodeAt(tx, ty, g.radius, g.dmg, g.sfx)
        this.removeSwap(this.grenades, i, this.grenadePool)
      }
    }
  }

  anyEnemyWithin(x, y, r) {
    const near = this.grid.query(x, y, r, this.explodeBuf)
    for (let i = 0; i < near.length; i++) {
      const e = near[i]
      const dx = e.x - x
      const dy = e.y - y
      const rr = r + e.r
      if (dx * dx + dy * dy <= rr * rr) return true
    }
    return false
  }

  nearestEnemyTo(x, y, maxD) {
    const near = this.grid.query(x, y, maxD, this.explodeBuf)
    let best = null
    let bestD = maxD * maxD
    for (let i = 0; i < near.length; i++) {
      const e = near[i]
      const dx = e.x - x
      const dy = e.y - y
      const d = dx * dx + dy * dy
      if (d < bestD) {
        bestD = d
        best = e
      }
    }
    return best
  }

  // 연사/지속 진행 — 매 프레임 간격만큼 차면 발사한다
  updateBursts(dt) {
    // 간격이 0 이하면 난사 while 루프가 무한 반복 → 최소값으로 클램프(프리즈 방지)
    const iv = Math.max(0.02, this.cfg.skill.shotInterval)
    // (다발사격은 triggerMultishot에서 한 번에 부채꼴 발사)

    // 연발사격 — 가장 가까운 적 단일 연사
    const r = this.burst.rapidfire
    if (r.left > 0) {
      const st = this.stats.skillStats.rapidfire
      r.acc += dt
      while (r.acc >= st.interval && r.left > 0) {
        r.acc -= st.interval
        const t = this.nearestEnemy()
        if (!t) {
          r.left = 0
          break
        }
        this.fireAngle(
          Math.atan2(t.y - this.bowY, t.x - this.player.x),
          st.dmg,
          st.pierce,
          'rapidfire',
          st.sfx
        )
        r.left--
      }
    }

    // 난사 — 지속시간 동안 360° 무작위
    const b = this.burst.barrage
    if (b.timeLeft > 0) {
      const st = this.stats.skillStats.barrage
      b.timeLeft -= dt
      b.acc += dt
      while (b.acc >= iv) {
        b.acc -= iv
        this.fireAngle(this.barrageAngle(), st.dmg, st.pierce, 'barrage', st.sfx)
      }
    }
  }

  explodeAt(x, y, r, dmg, sfx) {
    const maxEnemyR = Math.max(this.cfg.enemy.radius, this.cfg.boss.radius)
    // updateArrows 가 queryBuf 를 쓰므로 폭발은 별도 버퍼로 조회한다
    const near = this.grid.query(x, y, r + maxEnemyR, this.explodeBuf)

    // damageEnemy 가 enemies 를 수정하지만 near 는 별도 배열이라 안전하다
    for (let i = near.length - 1; i >= 0; i--) {
      const e = near[i]
      const dx = e.x - x
      const dy = e.y - y
      const reach = r + e.r
      const d2 = dx * dx + dy * dy
      if (d2 > reach * reach) continue
      const d = Math.sqrt(d2) || 1
      this.damageEnemy(e, dmg, dx / d, dy / d, sfx)
    }

    this.explosions.push({ x, y, r, life: 0.3, max: 0.3 })
    this.cameras.main.shake(80, 0.003)
  }

  // --- 보스 탄막 (예고 → 실탄) ---------------------------------------------

  fireBossLine(boss) {
    const b = this.cfg.boss
    const base = Math.atan2(this.player.y - boss.y, this.player.x - boss.x)
    const mid = (b.lineCount - 1) / 2
    for (let i = 0; i < b.lineCount; i++) {
      const ang = base + (i - mid) * b.lineSpread
      const t = this.telePool.pop() || {}
      t.x = boss.x
      t.y = boss.y
      t.ang = ang
      t.life = b.telegraphTime
      t.max = b.telegraphTime
      this.telegraphs.push(t)
    }
  }

  // --- 엘리트 패턴 ---------------------------------------------------------
  // 공통 규칙: **반드시 예고(telegraph) 후 발동**. 예고 없는 큰 피해는 불공평하게 느껴진다.
  // 예고 중에는 엘리트가 멈춘다(e.windup) → 플레이어가 읽고 대응할 틈이 생긴다.
  eliteAttack(e) {
    const el = this.cfg.elite
    const ang = Math.atan2(this.player.y - e.y, this.player.x - e.x)
    e.windup = el.telegraphTime

    if (e.elite === 'charger') {
      // 돌격자 — 조준 방향으로 직선 돌진. 정면이 아니라 **측면**으로 피해야 한다.
      const t = this.pushTele(e.x, e.y, el.telegraphTime, 'charge', e)
      t.ang = ang
      t.len = e.speed * el.chargeSpeedMul * el.chargeDur
    } else if (e.elite === 'bombardier') {
      // 포격수 — 플레이어의 **현재 위치**에 착탄 예고 원. 그 자리를 비우면 피한다.
      const t = this.pushTele(this.player.x, this.player.y, el.telegraphTime, 'shell', e)
      t.r = el.shellRadius
    } else if (e.elite === 'scattershot') {
      // 산탄사수 — 부채꼴 다중 탄. 라인에서 벗어나거나 사이로 빠져야 한다.
      const t = this.pushTele(e.x, e.y, el.telegraphTime, 'fan', e)
      t.ang = ang
    } else if (e.elite === 'warden') {
      // 수호자는 능동 공격이 없다 — 오라가 상시 발동(updateEnemies에서 처리).
      // 대신 주기마다 오라를 시각적으로 크게 펄스해 "저것부터 죽여야 한다"를 알린다.
      e.windup = 0
      e.auraPulse = 0.6
    }
  }

  pushTele(x, y, life, kind, owner) {
    const t = this.telePool.pop() || {}
    t.x = x
    t.y = y
    t.life = life
    t.max = life
    t.kind = kind
    t.owner = owner || null
    t.ang = 0
    t.len = 0
    t.r = 0
    this.telegraphs.push(t)
    return t
  }

  // 포격 착탄 — 폭발 링(시각) + 반경 안이면 플레이어 피해.
  // explodeAt 은 "적"에게 피해를 주는 함수라 여기서는 쓰지 않는다(적끼리 자해 방지).
  landShell(t) {
    const el = this.cfg.elite
    this.explosions.push({ x: t.x, y: t.y, r: t.r, life: 0.32, max: 0.32 })
    this.cameras.main.shake(90, 0.004)
    const dx = this.player.x - t.x
    const dy = this.player.y - t.y
    const hit = t.r + this.stats.player.radius
    if (dx * dx + dy * dy <= hit * hit && this.invulnLeft === 0) {
      this.hitPlayer(el.shellDamage)
    }
  }

  // 산탄 — 부채꼴로 여러 발. 발사 시점의 엘리트 위치에서 나간다.
  fireScatter(t) {
    const el = this.cfg.elite
    const src = t.owner
    const ox = src ? src.x : t.x
    const oy = src ? src.y : t.y
    const n = Math.max(1, Math.round(el.scatterCount))
    const mid = (n - 1) / 2
    for (let i = 0; i < n; i++) {
      const a = t.ang + (i - mid) * el.scatterSpread
      const p = this.eProjPool.pop() || {}
      p.x = ox
      p.y = oy
      p.vx = Math.cos(a) * el.scatterBoltSpeed
      p.vy = Math.sin(a) * el.scatterBoltSpeed
      p.dmg = el.scatterBoltDamage
      p.life = 4
      p.tint = 0x6ed6ce
      p.rad = 5
      this.eProjectiles.push(p)
    }
  }

  // 원거리형 적의 단발 탄 (예고 없이 즉시)
  fireEnemyShot(e) {
    const c = this.cfg.enemy
    const ang = Math.atan2(this.player.y - e.y, this.player.x - e.x)
    const p = this.eProjPool.pop() || {}
    p.x = e.x
    p.y = e.y
    p.vx = Math.cos(ang) * c.shooterBoltSpeed
    p.vy = Math.sin(ang) * c.shooterBoltSpeed
    p.dmg = c.shooterBoltDamage
    p.life = 4
    p.tint = 0x94e2d5 // 원거리형 색(COLOR_SHOOTER)
    p.rad = 5
    this.eProjectiles.push(p)
  }

  updateTelegraphs(dt) {
    const b = this.cfg.boss
    const el = this.cfg.elite
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const t = this.telegraphs[i]
      // 돌격자 예고선은 엘리트가 움직이지 않아도 몸에 붙어 있어야 자연스럽다
      if (t.kind === 'charge' && t.owner) {
        t.x = t.owner.x
        t.y = t.owner.y
      }
      t.life -= dt
      if (t.life > 0) continue

      // 예고 끝 → 종류별 발동. kind 가 없으면 기존 보스 라인탄(하위 호환).
      if (t.kind === 'charge') {
        const o = t.owner
        // 예고 도중 죽었으면 발동하지 않는다 (indexOf로 생존 확인)
        if (o && this.enemies.indexOf(o) >= 0) {
          o.charging = el.chargeDur
          o.chvx = Math.cos(t.ang) * o.speed * el.chargeSpeedMul
          o.chvy = Math.sin(t.ang) * o.speed * el.chargeSpeedMul
        }
      } else if (t.kind === 'shell') {
        this.landShell(t) // 착탄은 시전자 생존과 무관(이미 날아간 포탄)
      } else if (t.kind === 'fan') {
        if (t.owner && this.enemies.indexOf(t.owner) >= 0) this.fireScatter(t)
      } else {
        const p = this.eProjPool.pop() || {}
        p.x = t.x
        p.y = t.y
        p.vx = Math.cos(t.ang) * b.boltSpeed
        p.vy = Math.sin(t.ang) * b.boltSpeed
        p.dmg = b.boltDamage
        p.life = 4
        p.tint = 0xf38ba8 // 보스 탄 색
        p.rad = 6
        this.eProjectiles.push(p)
      }
      t.owner = null // 풀에 죽은 적 참조를 남기지 않는다(GC/버그 방지)
      this.removeSwap(this.telegraphs, i, this.telePool)
    }
  }

  updateEnemyProjectiles(dt) {
    const pr = this.stats.player.radius
    const px = this.player.x
    const py = this.player.y
    let incoming = 0

    for (let i = this.eProjectiles.length - 1; i >= 0; i--) {
      const p = this.eProjectiles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.life -= dt

      const dx = px - p.x
      const dy = py - p.y
      const hit = pr + 5
      if (dx * dx + dy * dy < hit * hit) {
        if (p.dmg > incoming) incoming = p.dmg
        this.removeSwap(this.eProjectiles, i, this.eProjPool)
        continue
      }
      // 화면(플레이어 주변)에서 너무 멀어지거나 수명 끝
      if (p.life <= 0 || dx * dx + dy * dy > DESPAWN_DIST * DESPAWN_DIST) {
        this.removeSwap(this.eProjectiles, i, this.eProjPool)
      }
    }

    if (incoming > 0 && this.invulnLeft === 0) this.hitPlayer(incoming)
  }

  // 스킬 발동 순간 플레이어를 잠깐 빛나게 (뭔가 터졌다는 신호)
  flashSkill(color) {
    const ring = this.add
      .circle(this.player.x, this.player.y, this.stats.player.radius + 6)
      .setStrokeStyle(3, color)
    this.worldLayer.add(ring) // 월드 좌표에 표시 (카메라 따라감)

    this.tweens.add({
      targets: ring,
      scale: 2.2,
      alpha: 0,
      duration: 280,
      onComplete: () => ring.destroy(),
    })
  }

  damageEnemy(e, amount, dirX, dirY, sfx) {
    const w = this.stats.weapon
    const c = this.stats.combat

    // 치명타 판정
    let crit = false
    if (c.critChance > 0 && Math.random() < c.critChance) {
      amount *= c.critDmg
      crit = true
    }

    // 취약 — 이미 걸려 있는 디버프가 이번 피해를 증폭한다.
    // (이번 히트로 새로 걸리는 취약은 아래에서 적용 → 자기 자신을 증폭하지 않는다)
    if (e.vuln && e.vuln.time > 0) amount *= 1 + e.vuln.mul

    e.hp -= amount
    e.kbx += dirX * w.knockback * e.kbResist
    e.kby += dirY * w.knockback * e.kbResist
    e.flash = FLASH_TIME
    // 피격 경직 — 잠깐 정지(보스 제외). config로 조절. SET이라 누적 없음.
    if (!e.boss) e.stun = this.cfg.enemy.hitStunSec

    // --- 상태이상 부여 (sfx = {burn,poison,chill,vuln}, 없으면 null) ---
    // 하위 호환: 옛 호출이 숫자/true(화상)를 넘겨도 동작한다.
    if (sfx) {
      const S = typeof sfx === 'object' ? sfx : { burn: sfx === true ? BURN_PCT * 100 : sfx }

      // 화상 — 중첩 안 됨. 더 센 도트면 갱신, 아니면 지속만 새로고침.
      if (S.burn) {
        const dps = amount * (S.burn / 100)
        if (!e.burn || dps > e.burn.dps) e.burn = { dps, time: BURN_DUR }
        else e.burn.time = BURN_DUR
      }

      // 독 — **중첩된다**(상한 POISON_MAX_STACKS). 히트가 많은 스킬일수록 빨리 쌓인다.
      // 스택당 dps 는 "가장 센 히트" 기준으로 유지한다(약한 히트가 스택을 희석하지 않게).
      if (S.poison) {
        const dps = amount * (S.poison / 100)
        if (!e.poison) e.poison = { dps, stacks: 1, time: POISON_DUR }
        else {
          if (e.poison.stacks < POISON_MAX_STACKS) e.poison.stacks++
          if (dps > e.poison.dps) e.poison.dps = dps
          e.poison.time = POISON_DUR
        }
      }

      // 냉기 — 이속 감소. 중첩 안 됨(최대값만).
      if (S.chill) {
        const mul = S.chill / 100
        if (!e.chill || mul > e.chill.mul) e.chill = { mul, time: CHILL_DUR }
        else e.chill.time = CHILL_DUR
      }

      // 취약 — 받는 피해 증폭. 중첩 안 됨(최대값만).
      // 이번 히트에는 적용되지 않는다(위에서 이미 계산 완료) → 다음 히트부터 효과.
      if (S.vuln) {
        const mul = S.vuln / 100
        if (!e.vuln || mul > e.vuln.mul) e.vuln = { mul, time: VULN_DUR }
        else e.vuln.time = VULN_DUR
      }
    }

    // 데미지 숫자 (머리 위). 크리는 크고 금색.
    this.spawnPopup(e.x, e.y - e.r - 6, Math.max(1, Math.round(amount)), crit)
    // 크리 시 살짝 흔들림 — 스웜에서 과하지 않게 쿨다운
    if (crit && this.elapsed - this._lastCritShake > 0.15) {
      this._lastCritShake = this.elapsed
      this.cameras.main.shake(60, 0.0035)
    }

    if (e.hp <= 0) this.killEnemy(e)
  }

  // 적 처치 처리 (직격/폭발/화상 도트 공용)
  killEnemy(e) {
    // 같은 프레임에 두 번 처치되는 경우 방어(화살 2발·관통·폭발·화상 겹침).
    // indexOf 가 -1 이면 removeSwap 이 살아있는 마지막 적을 잘못 빼내 배열이
    // 깨지고 킬/룬이 중복된다 — 이미 제거됐으면 바로 반환.
    const idx = this.enemies.indexOf(e)
    if (idx < 0) return
    const c = this.stats.combat
    const ex = e.x
    const ey = e.y
    const wasBoss = e.boss
    const wasElite = !!e.elite

    // 사망 파편 — 적 색으로 튀어나가며 사라짐. 엘리트는 패턴 색 + 파편을 크게.
    const col = e.boss
      ? COLOR_BOSS
      : wasElite
        ? ELITE_BY_ID[e.elite].tint
        : e.type === 'rusher'
          ? COLOR_RUSHER
          : e.type === 'shooter'
            ? COLOR_SHOOTER
            : COLOR_ENEMY
    const nPart = e.boss ? 20 : wasElite ? 16 : 9
    this.spawnParticles(ex, ey, nPart, col, e.boss ? 240 : 200, e.boss ? 4 : 3, 0.45)
    if (wasBoss) this.cameras.main.shake(160, 0.006)
    else if (wasElite) this.cameras.main.shake(110, 0.004)
    this.removeSwap(this.enemies, idx, this.enemyPool)
    this.kills++
    this.killText.setText('Kills: ' + this.kills)
    this.gainXp(e.gems * this.cfg.xp.gemValue)

    // 룬 드랍 — 보스와 **엘리트**만. 일반몹 %드랍은 폐기(킬 비례 폭주 때문).
    // normalDropChance 는 기본 0이지만 되돌리고 싶을 때를 위해 경로는 남겨둔다.
    if (wasBoss) {
      this.bossKills++
      this.grantRune(true)
      this.maybeOpenModal()
    } else if (wasElite) {
      this.eliteKills++
      this.grantRune(false)
      this.maybeOpenModal()
    } else if (Math.random() < (this.cfg.rune?.normalDropChance ?? 0)) {
      this.bagGrantRune()
    }

    // 힘40 처치 폭발 (연쇄 없음, 내부 쿨 0.2초)
    if (
      !this._chainGuard &&
      c.killExplodeChance > 0 &&
      this.elapsed - this.lastKillExplode > 0.2 &&
      Math.random() < c.killExplodeChance
    ) {
      this.lastKillExplode = this.elapsed
      this._chainGuard = true
      this.explodeAt(ex, ey, 40, this.stats.weapon.damage)
      this._chainGuard = false
    }
  }

  // --- 경험치 -------------------------------------------------------------

  xpFor(level) {
    const x = this.cfg.xp
    return Math.ceil(x.levelBase * Math.pow(x.levelGrowth, level - 1))
  }

  gainXp(amount) {
    this.xp += amount

    let levelsGained = 0
    while (this.xp >= this.xpNeed) {
      this.xp -= this.xpNeed
      this.level++
      this.xpNeed = this.xpFor(this.level)
      levelsGained++
    }

    this.xpBar.scaleX = this.xp / this.xpNeed

    if (levelsGained > 0) this.onLevelUp(levelsGained)
  }

  // 레벨업 — 게임을 멈추지 않고 포인트만 지급하고 알림을 띄운다 (스펙).
  // 여러 레벨이 한 번에 올라도 알림은 한 번으로 합친다.
  onLevelUp(levels) {
    // 뱀서 표준: 레벨업 → 정지 후 3택 카드. (능력치/스킬포인트 지급 보류)
    this.lvText.setText('Lv ' + this.level)
    this._pendingLevels = (this._pendingLevels || 0) + levels

    // 첫 룬 보장 — Lv3 도달 시 아직 룬이 하나도 없으면 1개 지급한다.
    //
    // 왜 필요한가: 룬 드랍을 엘리트 전용(시간 기반)으로 바꾸니 후반 폭주는 잡혔지만,
    // **초반에 급사한 판이 완전히 무보상**이 됐다. 시뮬로 재보니 판의 35~55%가
    // 룬 0개로 끝난다(회피 실력 가정을 바꿔도 이 비율은 그대로 높다).
    // 엘리트 등장을 앞당기는 방법은 효과가 없었다 — 엘리트가 일찍 오면
    // 그만큼 일찍 죽어서 총 룬 수가 오히려 줄었다(생존 중앙 81s → 55s).
    // 그래서 전투 결과에 의존하지 않는 **진행 기반 보장**으로 해결한다.
    if (this.level >= 3 && !this._firstRuneGiven) {
      this._firstRuneGiven = true
      this.grantRune(false)
    }

    this.maybeOpenModal()
  }

  // 레벨이 스킬 해금 레벨을 통과하면 알림 (레벨을 건너뛰어도 처리)
  checkUnlocks() {
    for (const id of ACTIVE_IDS) {
      const def = ACTIVE_SKILLS[id]
      if (this.level >= def.unlockLevel && !this.unlockedSkills[id]) {
        this.unlockedSkills[id] = true
        if (def.unlockLevel > 1) {
          // 레벨업 토스트와 겹치지 않게 살짝 아래에 표시
          this.showUnlockToast(def.name)
        }
      }
    }
  }

  showUnlockToast(name) {
    const msg = `NEW SKILL\n${name}\n성장 화면에서 습득`
    const t = this.add
      .text(W / 2, H * 0.42, msg, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '24px',
        color: '#cba6f7',
        align: 'center',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(23)

    this.tweens.add({
      targets: t,
      alpha: { from: 1, to: 0 },
      duration: 2000,
      ease: 'Quad.easeIn',
      onComplete: () => t.destroy(),
    })

    // 성장 버튼을 잠깐 강조
    this.tweens.add({
      targets: this.growthBtn,
      scaleX: 1.08,
      scaleY: 1.15,
      duration: 220,
      yoyo: true,
      repeat: 3,
    })
  }

  showLevelToast(levels, ap, sp) {
    const msg =
      (levels > 1 ? `LEVEL UP +${levels}` : 'LEVEL UP') +
      `\n능력치 +${ap}   스킬 +${sp}`

    const toast = this.add
      .text(W / 2, H * 0.3, msg, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '26px',
        color: '#f9e2af',
        align: 'center',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(23)

    this.tweens.add({
      targets: toast,
      y: H * 0.24,
      alpha: { from: 1, to: 0 },
      duration: 1400,
      ease: 'Quad.easeOut',
      onComplete: () => toast.destroy(),
    })
  }

  // --- 체력 ---------------------------------------------------------------

  heal(amount) {
    this.hp = Math.min(this.stats.player.maxHp, this.hp + amount)
    this.refreshHpBar()
  }

  refreshHpBar() {
    const ratio = this.hp / this.stats.player.maxHp
    this.hpBar.scaleX = ratio
    this.hpBar.fillColor = ratio > 0.3 ? 0xa6e3a1 : 0xf38ba8
  }

  hitPlayer(amount) {
    const c = this.stats.combat

    // 회피 판정 (민첩40 + 회피 훈련)
    if (c.dodge > 0 && Math.random() < c.dodge) {
      this.showDodge()
      return
    }

    amount *= c.dmgTakenMul // 활력20 받는 피해 감소
    this.hp = Math.max(0, this.hp - amount)
    this.refreshHpBar()
    this.invulnLeft = this.stats.player.invuln

    this.cameras.main.shake(120, 0.006)
    const blinkTarget = this.playerSprite || this.player
    this.tweens.add({
      targets: blinkTarget,
      alpha: 0.3,
      duration: 80,
      yoyo: true,
      repeat: 1,
      onComplete: () => blinkTarget.setAlpha(1),
    })

    if (this.hp === 0) {
      // 활력40 부활 (한 판 1회)
      if (c.revive && !this.revived) {
        this.doRevive()
        return
      }
      this.endGame()
    }
  }

  doRevive() {
    this.revived = true
    this.hp = this.stats.player.maxHp * 0.3
    this.refreshHpBar()
    this.invulnLeft = 2 // 2초 무적

    const t = this.add
      .text(W / 2, H / 2, 'REVIVE', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '48px',
        color: '#a6e3a1',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(24)
    this.tweens.add({
      targets: t,
      alpha: 0,
      scale: 1.5,
      duration: 900,
      onComplete: () => t.destroy(),
    })
  }

  showDodge() {
    const t = this.add
      .text(this.player.x, this.player.y - 24, 'DODGE', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '18px',
        color: '#89dceb',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
    this.worldLayer.add(t) // 월드 좌표
    this.tweens.add({
      targets: t,
      y: t.y - 20,
      alpha: 0,
      duration: 500,
      onComplete: () => t.destroy(),
    })
  }

  endGame() {
    this.gameOver = true
    this.player.setVisible(false)
    // 사망 애니 재생 (스프라이트)
    if (this.playerSprite) {
      this.animKey = 'death'
      this.playerSprite.play('death')
    }
    this.releaseStick()

    // 결과 화면 — 성과 요약 + 최고 기록 비교. 사망 애니를 잠깐 보여준 뒤 띄운다.
    this.time.delayedCall(650, () => {
      if (!this.gameOver) return // 그 사이 재시작됐으면 무시
      this.result.show(this.buildResult())
    })
  }

  // 결과 화면에 넘길 데이터 — 이번 판에 장착한 룬 전체 + 최종 빌드
  buildResult() {
    const runes = []
    for (const sid in this.runeSlots) {
      for (const r of this.runeSlots[sid]) {
        if (!r) continue
        runes.push({
          icon: RUNES[r.id].icon,
          label: runeLabel(r),
          desc: runeDesc(r),
          tier: r.tier,
          tierColor: RUNE_TIERS[r.tier].color,
        })
      }
    }
    // 등급 높은 순 → 좋은 걸 위에 보여준다
    runes.sort((a, b) => b.tier - a.tier)

    const skills = []
    for (const id in CARD_SKILLS) {
      const lv = this.skillLevels[id] || 0
      if (lv > 0) skills.push({ icon: CARD_SKILLS[id].icon, name: CARD_SKILLS[id].name, level: lv })
    }

    return {
      survived: this.elapsed,
      timeText: this.formatTime(),
      level: this.level,
      kills: this.kills,
      // ⚠️ bossCount 는 "등장 수"다. 처치 수는 bossKills 를 따로 센다
      //    (예전엔 등장 수를 '보스 처치'로 표시해 실제보다 부풀려 나왔다).
      bossKills: this.bossKills,
      eliteKills: this.eliteKills,
      runes,
      skills,
    }
  }

  formatTime() {
    const t = Math.floor(this.elapsed)
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
  }

  // --- 루프 ---------------------------------------------------------------

  update(time, delta) {
    if (this.gameOver || this.userPaused || this.growthOpen || this.levelupOpen || this.runeOpen) return
    // 한 프레임에서 오류가 나도 게임 루프 전체가 멈추지 않게(프리즈 방지) +
    // 원인을 콘솔에 한 번 남긴다(진단).
    try {
      this.step(delta)
    } catch (err) {
      if (!this._loggedErr) {
        this._loggedErr = true
        // eslint-disable-next-line no-console
        console.error('[update 오류 — 이 메시지를 개발자에게 전달]', err)
      }
    }
  }

  step(delta) {
    const dt = Math.min(delta / 1000, MAX_DT)

    this.elapsed += dt
    this.invulnLeft = Math.max(0, this.invulnLeft - dt)
    this.timeText.setText(this.formatTime())

    // 활력 구간 HP 회복
    const regen = this.stats.combat.regen
    if (regen > 0 && this.hp > 0 && this.hp < this.stats.player.maxHp) {
      this.hp = Math.min(this.stats.player.maxHp, this.hp + regen * dt)
      this.refreshHpBar()
    }

    const mult = this.spawnMultiplier
    this.waveText.setText(`x${mult.toFixed(1)}  ·  적HP ${this.enemyHpNow}`)

    this.spawnAcc += dt
    // 간격이 0 이하/비정상이면 while 무한루프 → 최소값으로 클램프(프리즈 방지)
    const interval = Math.max(0.02, this.cfg.spawn.baseInterval / mult)
    while (this.spawnAcc >= interval) {
      this.spawnAcc -= interval
      this.spawnEnemy()
    }

    // 엘리트 — 시간 기반 등장. 룬 드랍이 여기에만 걸려 있으므로 이 주기가
    // 판당 룬 개수를 결정한다(킬 비례가 아니라서 후반에 폭주하지 않는다).
    this.eliteAcc += dt
    const eliteEvery =
      this.eliteCount === 0 ? this.cfg.elite.firstSec : this.cfg.elite.everySec
    if (this.eliteAcc >= eliteEvery) {
      // 상한에 걸려 실패하면 누적을 조금만 되돌려 잠시 후 다시 시도한다
      if (this.spawnElite()) this.eliteAcc -= eliteEvery
      else this.eliteAcc = eliteEvery - 3
    }

    this.bossAcc += dt
    // 첫 보스만 firstBossSec 로 앞당김(룬 조기 경험). 이후는 everySec 간격.
    const bossEvery =
      this.bossCount === 0 ? this.cfg.boss.firstBossSec : this.cfg.boss.everySec
    if (this.bossAcc >= bossEvery) {
      this.bossAcc -= bossEvery
      this.spawnBoss()
    }
    // 엘리트가 룬 공급원이므로 "언제 오나"를 보여주는 게 보스보다 중요하다
    this.bossTimerText.setText(
      `엘리트 ${Math.max(0, Math.ceil(eliteEvery - this.eliteAcc))}초  ·  보스 ${Math.ceil(bossEvery - this.bossAcc)}초`
    )

    const { vx, vy } = this.moveInput()
    const p = this.stats.player
    // 무한 월드 — 벽 clamp 없이 자유 이동
    this.player.x += vx * p.speed * dt
    this.player.y += vy * p.speed * dt

    // 월드 레이어를 플레이어 반대로 옮겨 플레이어를 화면 중앙에 고정
    this.worldLayer.setPosition(W / 2 - this.player.x, H / 2 - this.player.y)
    this.updateBackground()

    if (this.playerSprite) {
      this.playerSprite.setPosition(this.player.x, this.player.y)
      this.updatePlayerAnim(vx, vy)
    }

    this.fireAcc += dt
    if (this.fireAcc >= this.stats.weapon.cooldown) {
      const target = this.nearestEnemy()
      if (target) {
        this.fireAcc = 0
        this.fireAt(target)
      }
    }

    this.updateSkills(dt)
    this.updateBursts(dt)
    this.updateExplosions(dt)
    this.updateGrenades(dt)
    this.updatePopups(dt)
    this.updateParticles(dt)
    this.updateMuzzles(dt)

    // 그리드를 플레이어 주변 화면 영역으로 옮긴다 (무한 월드 대응)
    this.grid.setOrigin(this.player.x - W / 2, this.player.y - H / 2)
    this.grid.clear()
    for (let i = 0; i < this.enemies.length; i++) {
      this.grid.insert(this.enemies[i])
    }

    this.updateArrows(dt)
    this.updateEnemies(dt)
    this.updateTelegraphs(dt)
    this.updateEnemyProjectiles(dt)
    this.render()

    if (this.perfText) {
      this.perfText.setText(
        `${Math.round(this.game.loop.actualFps)} fps  ·  적 ${this.enemies.length}`
      )
      this.statText.setText(
        `내속도 ${Math.round(this.stats.player.speed)}  ·  적속도 ${this.cfg.enemy.speed}  ·  DMG ${this.stats.weapon.damage}`
      )
    }
  }

  updateArrows(dt) {
    // 그리드에 물어볼 반경은 "가장 큰 적"까지 잡아야 보스를 놓치지 않는다
    const maxR = Math.max(this.cfg.enemy.radius, this.cfg.boss.radius) + 5

    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i]
      a.age += dt // 스트릭/꼬리 길이 제한용
      // 이동 전 위치 기록 → 아래 스윕 충돌 판정에서 "직전→현재" 선분으로 사용
      a.px1 = a.x
      a.py1 = a.y
      a.x += a.vx * dt
      a.y += a.vy * dt

      // 플레이어에서 너무 멀어진 화살 제거 (월드 좌표 기준!).
      // 화면 좌표(0~W)로 판정하면 무한 월드에서 플레이어가 이동했을 때
      // 화살이 생성 즉시 제거되어 발사가 안 되는 것처럼 보인다.
      const adx = a.x - this.player.x
      const ady = a.y - this.player.y
      if (adx * adx + ady * ady > DESPAWN_DIST * DESPAWN_DIST) {
        this.removeSwap(this.arrows, i, this.arrowPool)
        continue
      }

      // 스윕 판정 — 화살이 빠르거나 적이 작으면 프레임 사이에 스쳐 지날 수 있다(터널링).
      // 현재 위치의 점 판정 대신 "직전→현재 이동 선분"까지의 최단거리로 판정한다.
      const sx = a.px1
      const sy = a.py1
      const segx = a.x - sx
      const segy = a.y - sy
      const seg2 = segx * segx + segy * segy || 1
      const segLen = Math.sqrt(seg2)
      const mx = (sx + a.x) / 2
      const my = (sy + a.y) / 2
      // 선분 전체를 덮도록 조회 반경을 이동거리만큼 넓힌다
      const near = this.grid.query(mx, my, maxR + segLen / 2, this.queryBuf)
      let spent = false

      for (let j = 0; j < near.length; j++) {
        const e = near[j]
        if (a.hit.has(e)) continue

        const hitR = e.r + 5 // 개체별 반지름
        // 적 중심에서 이동 선분 위 가장 가까운 점까지의 거리로 판정
        let t = ((e.x - sx) * segx + (e.y - sy) * segy) / seg2
        t = t < 0 ? 0 : t > 1 ? 1 : t
        const ddx = e.x - (sx + t * segx)
        const ddy = e.y - (sy + t * segy)
        if (ddx * ddx + ddy * ddy >= hitR * hitR) continue

        a.hit.add(e)
        const len = Math.hypot(a.vx, a.vy) || 1
        // 스킬별 명중 이펙트 — 색은 그 스킬 색, 연발은 흰 섬광으로 구분
        const hfx = SKILL_FX[a.fx] || SKILL_FX.basic
        if (hfx.impact === 'flash') this.spawnSpark(a.x, a.y, 0xffffff, 'flash')
        else this.spawnSpark(a.x, a.y, hfx.tint, 'spark')
        this.damageEnemy(e, a.dmg, a.vx / len, a.vy / len, a.sfx)

        if (--a.pierceLeft <= 0) {
          spent = true
          break
        }
      }

      if (spent) this.removeSwap(this.arrows, i, this.arrowPool)
    }
  }

  updateEnemies(dt) {
    const pr = this.stats.player.radius
    const decay = Math.max(0, 1 - KNOCKBACK_FRICTION * dt)
    const sepR = this.cfg.enemy.sepRadius
    const sepStr = this.cfg.enemy.sepStrength
    const px = this.player.x
    const py = this.player.y

    let incoming = 0 // 이번 프레임에 닿은 적 중 가장 아픈 것
    const despawn2 = DESPAWN_DIST * DESPAWN_DIST
    const el = this.cfg.elite

    // 수호자 오라 — 매 프레임 다시 수집한다. 수호자가 죽으면 강화가 즉시 풀려야
    // "저것부터 죽이면 편해진다"는 인과가 플레이어에게 읽힌다(캐시하면 안 됨).
    const wardens = this._wardenBuf
    wardens.length = 0
    for (let i = 0; i < this.enemies.length; i++) {
      if (this.enemies[i].elite === 'warden') wardens.push(this.enemies[i])
    }
    const wr2 = el.wardenRadius * el.wardenRadius

    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i]

      const dx = px - e.x
      const dy = py - e.y

      // 너무 멀어진 적은 제거 (보스는 예외 — 접근 전에 사라지지 않게)
      if (!e.boss && dx * dx + dy * dy > despawn2) {
        this.removeSwap(this.enemies, i, this.enemyPool)
        i--
        continue
      }

      // 도트 — 화상(중첩X) + 독(중첩O). 도트로 죽으면 처치 처리.
      let dot = 0
      if (e.burn && e.burn.time > 0) {
        e.burn.time -= dt
        dot += e.burn.dps
      }
      if (e.poison && e.poison.time > 0) {
        e.poison.time -= dt
        dot += e.poison.dps * e.poison.stacks
        if (e.poison.time <= 0) e.poison = null // 만료 시 스택 초기화
      }
      if (dot > 0) {
        e.hp -= dot * dt
        if (e.hp <= 0) {
          this.killEnemy(e)
          i--
          continue
        }
      }
      // 디버프 타이머 (피해 없음)
      if (e.chill && e.chill.time > 0) e.chill.time -= dt
      if (e.vuln && e.vuln.time > 0) e.vuln.time -= dt

      if (e.auraPulse > 0) e.auraPulse -= dt

      // 돌격 중 — 저장된 방향으로 직진. 경직·분리·플레이어 밀어내기 모두 무시하고
      // **뚫고 지나간다**. 예고를 봤다면 측면으로 피할 수 있으므로 공평하다.
      if (e.charging > 0) {
        e.charging -= dt
        e.x += e.chvx * dt
        e.y += e.chvy * dt
        if (e.flash > 0) e.flash -= dt
        const cdx = px - e.x
        const cdy = py - e.y
        const ct = pr + e.r
        if (cdx * cdx + cdy * cdy <= ct * ct && el.chargeDamage > incoming) {
          incoming = el.chargeDamage
        }
        continue
      }

      // 예고 중 — 제자리에 멈춘다. 이 정지가 곧 "지금 뭔가 온다"는 신호다.
      if (e.windup > 0) {
        e.windup -= dt
        if (e.flash > 0) e.flash -= dt
        e.kbx *= decay
        e.kby *= decay
        const wdx = px - e.x
        const wdy = py - e.y
        const wt = pr + e.r
        if (wdx * wdx + wdy * wdy <= wt * wt && e.dmg > incoming) incoming = e.dmg
        continue
      }

      // 피격 경직 — 이동/추격/분리/공격 전부 정지 (플래시·넉백만 감쇠)
      if (e.stun > 0) {
        e.stun -= dt
        if (e.flash > 0) e.flash -= dt
        e.kbx *= decay
        e.kby *= decay
        continue
      }

      const len = Math.hypot(dx, dy) || 1

      // 수호자 오라 판정 — 엘리트/보스는 강화 대상이 아니다(엘리트가 서로 버프하면 폭주)
      e.buffed = false
      if (wardens.length && !e.elite && !e.boss) {
        for (let w = 0; w < wardens.length; w++) {
          const wd = wardens[w]
          const wdx = e.x - wd.x
          const wdy = e.y - wd.y
          if (wdx * wdx + wdy * wdy <= wr2) {
            e.buffed = true
            break
          }
        }
      }

      // 겹침 방지: 그리드로 근처 적만 조회해 밀어냄 (최대 6마리)
      let sx = 0
      let sy = 0
      if (sepStr > 0) {
        const near = this.grid.query(e.x, e.y, sepR, this.queryBuf)
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

      // 타입별 이동 방향
      let mvx, mvy
      if (e.ranged) {
        // 원거리형 카이팅 — 거리 유지 (너무 가까우면 후퇴, 멀면 접근)
        const c = this.cfg.enemy
        let dir = 0
        if (len < c.shooterRetreat) dir = -1
        else if (len > c.shooterRange) dir = 1
        mvx = (dx / len) * dir
        mvy = (dy / len) * dir
      } else {
        // 추격 + 좌우 흔들림 (유기적)
        e.wob += dt * 3
        const wob = Math.sin(e.wob) * this.cfg.enemy.wobble
        mvx = dx / len + (-dy / len) * wob
        mvy = dy / len + (dx / len) * wob
      }

      // 보스 러버밴딩 — 화면 밖으로 벗어나면 플레이어보다 빠르게 좁혀 접근시킨다
      // (보스는 despawn 예외라, 느리면 영영 못 따라와 "메세지만 뜨고 안 보임"이 됨)
      let espeed = e.speed
      if (e.boss && dx * dx + dy * dy > BOSS_LEASH * BOSS_LEASH) {
        espeed = Math.max(e.speed, this.stats.player.speed * BOSS_CATCHUP)
      }
      // 수호자 오라 — 이속 강화. ⚠️ 플레이어 이속을 넘으면 회피 자체가 불가능해지므로
      // 강화 후 속도를 플레이어의 90%로 clamp 한다(돌진형에 겹쳐 붙는 경우 대비).
      if (e.buffed) {
        espeed = Math.min(espeed * el.wardenSpeedMul, this.stats.player.speed * 0.9)
      }
      // 냉기 룬 — 이속 감소. 오라 강화 **뒤에** 적용해 강화된 적도 늦출 수 있게 한다.
      if (e.chill && e.chill.time > 0) espeed *= 1 - e.chill.mul

      e.x += mvx * espeed * dt + sx * sepStr * dt + e.kbx * dt
      e.y += mvy * espeed * dt + sy * sepStr * dt + e.kby * dt
      e.kbx *= decay
      e.kby *= decay
      if (e.flash > 0) e.flash -= dt

      // 플레이어 겹침 방지 — 접촉 반경 안으로 파고들면 가장자리로 밀어냄
      const minD = pr + e.r
      const odx = e.x - px
      const ody = e.y - py
      const od2 = odx * odx + ody * ody
      if (od2 < minD * minD) {
        const od = Math.sqrt(od2)
        const ux = od > 0.001 ? odx / od : 1
        const uy = od > 0.001 ? ody / od : 0
        e.x = px + ux * minD
        e.y = py + uy * minD
      }

      // 보스 라인 탄막 / 엘리트 패턴 / 원거리형 단발
      if (e.boss) {
        e.atk -= dt
        if (e.atk <= 0) {
          e.atk += this.cfg.boss.attackInterval
          this.fireBossLine(e)
        }
      } else if (e.elite) {
        e.atk -= dt
        if (e.atk <= 0) {
          e.atk += el.attackInterval
          this.eliteAttack(e)
        }
      } else if (e.ranged) {
        e.atk -= dt
        if (e.atk <= 0) {
          e.atk += this.cfg.enemy.shooterInterval
          this.fireEnemyShot(e)
        }
      }

      // 가장자리에 닿아 있으면(겹침 방지로 딱 붙은 상태 포함) 접촉 피해
      const touch = pr + e.r
      const cdmg = e.buffed ? e.dmg * el.wardenDamageMul : e.dmg
      if (dx * dx + dy * dy <= touch * touch && cdmg > incoming) {
        incoming = cdmg
      }
    }

    if (incoming > 0 && this.invulnLeft === 0) this.hitPlayer(incoming)
  }

  updateExplosions(dt) {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const ex = this.explosions[i]
      ex.life -= dt
      if (ex.life <= 0) this.explosions.splice(i, 1)
    }
  }

  // --- 타격감 이펙트 (시각 전용) -----------------------------------------

  // 데미지 숫자 (풀 재사용, 월드 좌표). 크리는 크고 금색.
  // amount는 숫자 또는 문자열. color를 주면 그 색으로 표시(룬 획득 알림 등).
  spawnPopup(x, y, amount, crit, color) {
    if (this.popups.length >= MAX_POPUPS) {
      const old = this.popups.shift() // 가장 오래된 것 재활용
      old.t.setVisible(false)
      this.popupPool.push(old.t)
    }
    let t = this.popupPool.pop()
    if (!t) {
      t = this.add
        .text(0, 0, '', {
          fontFamily: '-apple-system, "Segoe UI", Roboto, sans-serif',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
      this.worldLayer.add(t)
    }
    t.setText('' + amount)
    t.setFontSize(color ? 15 : crit ? 28 : 18)
    t.setColor(color || (crit ? COLOR_CRIT : '#ffffff'))
    t.setPosition(x + (Math.random() * 16 - 8), y)
    t.setAlpha(1)
    t.setVisible(true)
    const life = crit ? 0.75 : 0.55
    this.popups.push({ t, vy: -46, life, max: life })
  }

  updatePopups(dt) {
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i]
      p.life -= dt
      if (p.life <= 0) {
        p.t.setVisible(false)
        this.popupPool.push(p.t)
        this.popups.splice(i, 1)
        continue
      }
      p.t.y += p.vy * dt
      p.vy += 60 * dt // 솟았다가 서서히 감속
      const k = p.life / p.max
      p.t.setAlpha(k < 0.5 ? k * 2 : 1) // 후반부에 페이드아웃
    }
  }

  // 사각형 파편 (사망 등). gfxFx 에 fillRect.
  spawnParticles(x, y, count, color, spd, size, life) {
    for (let n = 0; n < count; n++) {
      if (this.particles.length >= MAX_PARTICLES) return
      const a = Math.random() * Math.PI * 2
      const s = spd * (0.4 + Math.random() * 0.6)
      const p = this.partPool.pop() || {}
      p.x = x
      p.y = y
      p.vx = Math.cos(a) * s
      p.vy = Math.sin(a) * s
      p.life = life * (0.7 + Math.random() * 0.3)
      p.max = p.life
      p.color = color
      p.size = size
      p.kind = 'rect'
      this.particles.push(p)
    }
  }

  // 타격 스파크 — 타격 지점에서 짧은 직선이 희미하게 퍼짐(사망 원퍼짐과 구분).
  // color/kind를 지정하면 스킬별 명중 이펙트로 쓸 수 있다.
  //  'spark' = 짧은 직선이 퍼짐(기본) · 'flash' = 짧고 굵은 흰 섬광(연발)
  spawnSpark(x, y, color = 0xffffff, style = 'spark') {
    const flash = style === 'flash'
    const n = flash ? 3 : 5
    for (let k = 0; k < n; k++) {
      if (this.particles.length >= MAX_PARTICLES) return
      const a = Math.random() * Math.PI * 2
      const s = flash ? 60 + Math.random() * 70 : 130 + Math.random() * 150
      const p = this.partPool.pop() || {}
      p.x = x
      p.y = y
      p.vx = Math.cos(a) * s
      p.vy = Math.sin(a) * s
      p.nx = Math.cos(a) // 선 방향(꼬리는 반대쪽으로)
      p.ny = Math.sin(a)
      p.life = flash ? 0.06 + Math.random() * 0.05 : 0.1 + Math.random() * 0.08
      p.max = p.life
      p.color = color
      p.size = flash ? 11 + Math.random() * 5 : 7 + Math.random() * 5 // 선 길이
      p.kind = 'line'
      this.particles.push(p)
    }
  }

  // --- 오브젝트(프롭) 레이어 --------------------------------------------
  // 좌표 해시로 "굵은 격자(PROP_CELL 타일마다)"에 드물게 배치한다.
  // 결정론적이라 스크롤해도 같은 자리에 그대로 있고, 저장할 데이터가 없다.
  //  프레임: 0 무덤 1 기울어진무덤 2 석관 3 기둥 4 부러진기둥 5 부서진벽 6 횃불 7 잔해
  propAt(bc, br) {
    const h = ((bc * 374761393 + br * 668265263) ^ 0x5bf03635) >>> 0
    if (h % 100 >= 30) return null // 30% 칸에만 배치 (화면당 약 4개)
    // 종류 가중치 — 무덤/잔해가 흔하고, 석관·부서진벽은 드물다
    const r = (h >> 7) % 100
    let frame
    if (r < 15) frame = 0 // 무덤
    else if (r < 25) frame = 1 // 기울어진 무덤
    else if (r < 33) frame = 7 // 잔해
    else if (r < 43) frame = 3 // 기둥
    else if (r < 51) frame = 4 // 부러진 기둥
    else if (r < 83) frame = 6 // 횃불 32% — 조명이 화면에 거의 항상 보이도록
    else if (r < 93) frame = 5 // 부서진 벽
    else frame = 2 // 석관 (가장 드물게)
    // 칸 안에서 위치를 흩뿌린다(격자 티 방지)
    const jc = bc * PROP_CELL + (((h >> 14) % 1000) / 1000) * (PROP_CELL - 1)
    const jr = br * PROP_CELL + (((h >> 24) % 1000) / 1000) * (PROP_CELL - 1)
    return { frame, c: jc, r: jr }
  }

  // 프롭 + 횃불 조명을 바닥/전경 캔버스에 그린다. (updateBackground에서 호출)
  drawProps(fctx, px, py, ox, oy, cc, rr, R) {
    const img = this.propSheet
    if (!img || !img.complete || !img.naturalWidth) return
    const fr = this.propFrontCtx
    fr.clearRect(0, 0, W, H)
    this.torchLights.length = 0

    const CW2 = 96
    const CH2 = 112
    const ANCHOR = CH2 - 10 // 스프라이트 내 접지선(gen_props.py의 BASE_Y와 일치)
    const TW = 128
    const TH = 64

    // 화면에 걸리는 굵은 격자 범위
    const b0c = Math.floor((cc - R) / PROP_CELL) - 1
    const b1c = Math.floor((cc + R) / PROP_CELL) + 1
    const b0r = Math.floor((rr - R) / PROP_CELL) - 1
    const b1r = Math.floor((rr + R) / PROP_CELL) + 1

    const list = []
    for (let br = b0r; br <= b1r; br++) {
      for (let bc = b0c; bc <= b1c; bc++) {
        const p = this.propAt(bc, br)
        if (!p) continue
        // 아이소 좌표 → 화면 좌표(접지점)
        const sx = ox + (p.c - p.r) * (TW / 2)
        const sy = oy + (p.c + p.r) * (TH / 2)
        if (sx < -CW2 || sx > W + CW2 || sy < -CH2 || sy > H + CH2) continue
        list.push({ f: p.frame, sx, sy })
      }
    }
    // 같은 레이어 안에서도 위쪽이 먼저(뒤) 그려지도록 접지 y 정렬
    list.sort((a, b) => a.sy - b.sy)

    // 플레이어 화면 y — 항상 중앙. 이보다 위(작은 y)면 뒤, 아래면 앞.
    const playerScreenY = H / 2

    for (let i = 0; i < list.length; i++) {
      const it = list[i]
      const dx = it.sx - CW2 / 2
      const dy = it.sy - ANCHOR

      // 횃불: 바닥에 따뜻한 빛 고임(가산 합성) + 불꽃 애니메이션용 좌표 기록
      if (it.f === 6) {
        const lx = it.sx
        const ly = it.sy - 76 // 화로 높이
        fctx.save()
        fctx.globalCompositeOperation = 'lighter'
        const g = fctx.createRadialGradient(lx, it.sy - 10, 6, lx, it.sy - 10, 118)
        g.addColorStop(0, 'rgba(255,176,92,0.30)')
        g.addColorStop(0.45, 'rgba(226,140,70,0.13)')
        g.addColorStop(1, 'rgba(180,110,60,0)')
        fctx.fillStyle = g
        fctx.fillRect(lx - 130, it.sy - 140, 260, 260)
        fctx.restore()
        // ⚠️ 불꽃은 worldLayer(월드 좌표계) 안의 gfxArrows에 그려진다.
        // 화면 좌표를 저장하면 카메라 오프셋이 이중 적용되어 불빛이 플레이어를 따라다닌다.
        // screen = world - player + center  →  world = screen - center + player
        this.torchLights.push({ x: lx - W / 2 + px, y: ly - H / 2 + py })
      }

      // 깊이 정렬 — 플레이어보다 위쪽이면 바닥(뒤), 아래쪽이면 전경(앞)
      const isFront = it.sy > playerScreenY
      const target = isFront ? fr : fctx

      // 전경 프롭이 플레이어를 가리면 반투명 처리(디아블로/하데스 방식).
      // 안 하면 큰 오브젝트 뒤에서 캐릭터를 놓친다.
      let faded = false
      if (isFront) {
        const pxs = W / 2
        const pys = H / 2
        if (pxs > dx && pxs < dx + CW2 && pys > dy && pys < dy + CH2) {
          target.save()
          target.globalAlpha = 0.4
          faded = true
        }
      }
      target.drawImage(img, it.f * CW2, 0, CW2, CH2, dx, dy, CW2, CH2)
      if (faded) target.restore()
    }
    this.propFrontCanvas.refresh()
  }

  // --- 대역(biome) 판정 -------------------------------------------------
  // 저주파 value noise(바이리니어 보간)로 화면을 큰 덩어리로 나눈다.
  // 좌표 해시 기반이라 스크롤해도 같은 자리는 항상 같은 대역 → 깜빡임 없음.
  // 경계에서는 디더링(확률 혼합)으로 직선 경계를 없앤다.
  _bhash(a, b) {
    return (((a * 73856093) ^ (b * 19349663)) >>> 0) % 1000
  }

  isMossBiome(c, r, hv) {
    const CELL = 7 // 대역 크기(타일 수). 크면 덩어리가 커진다
    const gx = c / CELL
    const gy = r / CELL
    const x0 = Math.floor(gx)
    const y0 = Math.floor(gy)
    let tx = gx - x0
    let ty = gy - y0
    tx = tx * tx * (3 - 2 * tx) // smoothstep
    ty = ty * ty * (3 - 2 * ty)
    const v00 = this._bhash(x0 + 7919, y0 + 104729) / 1000
    const v10 = this._bhash(x0 + 7920, y0 + 104729) / 1000
    const v01 = this._bhash(x0 + 7919, y0 + 104730) / 1000
    const v11 = this._bhash(x0 + 7920, y0 + 104730) / 1000
    const nv =
      (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty
    const band = (nv - 0.55) / 0.1 // 경계까지의 거리(-1..1 부근)
    if (band > 1) return true
    if (band < -1) return false
    return ((hv >> 20) % 100) / 100 < (band + 1) / 2 // 경계 디더링
  }

  // 머즐 플래시 수명 감소
  updateMuzzles(dt) {
    for (let i = this.muzzles.length - 1; i >= 0; i--) {
      const m = this.muzzles[i]
      m.life -= dt
      if (m.life <= 0) this.muzzles.splice(i, 1)
    }
  }

  updateParticles(dt) {
    const fr = Math.max(0, 1 - 6 * dt) // 감속
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vx *= fr
      p.vy *= fr
      p.life -= dt
      if (p.life <= 0) this.removeSwap(this.particles, i, this.partPool)
    }
  }

  // --- 렌더 ---------------------------------------------------------------
  // 적 400마리를 GameObject 로 만들면 400개 객체를 관리해야 하지만,
  // Graphics 에 몰아 그리면 clear 후 400번의 fillRect 로 끝난다.

  render() {
    const ge = this.gfxEnemies
    ge.clear()

    // 화면 밖 적은 그리지 않는다(컬링) — 최대 300마리를 8패스로 다 그리면
    // 수가 늘 때 급격히 무거워진다. 화면 안 + 여유(보스 반경)만 남긴다.
    const px = this.player.x
    const py = this.player.y
    const cullX = W / 2 + 40
    const cullY = H / 2 + 40
    const es = this._visBuf
    es.length = 0
    const all = this.enemies
    for (let i = 0; i < all.length; i++) {
      const e = all[i]
      if (Math.abs(e.x - px) <= cullX && Math.abs(e.y - py) <= cullY) es.push(e)
    }

    // 1) 바닥 그림자 (전체·보스 포함) — 접지감
    ge.fillStyle(0x000000, 0.38)
    for (let i = 0; i < es.length; i++) {
      const e = es[i]
      ge.fillEllipse(e.x, e.y + e.r * 0.9, e.r * 1.9, e.r * 0.9)
    }

    // 1-b) 수호자 오라 — 바닥에 그린다(스프라이트 아래). 이 원 안의 적이 강해지므로
    //      "원을 지우려면 중심을 죽여야 한다"가 그림만으로 읽혀야 한다.
    const auraR = this.cfg.elite.wardenRadius
    for (let i = 0; i < es.length; i++) {
      const e = es[i]
      if (e.elite !== 'warden') continue
      const pulse = e.auraPulse > 0 ? 1 + (e.auraPulse / 0.6) * 0.12 : 1
      const breathe = 0.9 + 0.1 * Math.sin(this.elapsed * 3)
      ge.fillStyle(0xc08ef4, 0.07 * breathe)
      ge.fillCircle(e.x, e.y, auraR * pulse)
      ge.lineStyle(2, 0xc08ef4, 0.32 * breathe)
      ge.strokeCircle(e.x, e.y, auraR * pulse)
    }

    // 2) 일반 적 — 풀링 스프라이트(타입=행[고블린/사냥개/궁수], 걷기=열).
    //    크기는 반지름 비례(setScale) → 튜너 '크기'로 조정됨. 피격/화상은 tint.
    //    화면 밖은 이미 컬링됐으므로 활성 스프라이트 = 화면 내 적 수뿐.
    const sprites = this.enemySprites
    const walk = Math.floor(this.elapsed * 8)
    let bi = 0
    for (let i = 0; i < es.length; i++) {
      const e = es[i]
      if (e.boss || e.elite) continue // 보스=돔, 엘리트=별도 시트(48px)
      let spr = sprites[bi]
      if (!spr) {
        spr = this.add.sprite(0, 0, 'enemies', 0).setOrigin(0.5, 0.72)
        this.enemyLayer.add(spr)
        sprites[bi] = spr
      }
      const row = e.type === 'rusher' ? 1 : e.type === 'shooter' ? 2 : 0
      spr.setFrame(row * 4 + ((walk + e.animOff) & 3))
      spr.setPosition(e.x, e.y)
      spr.setScale(e.r * ENEMY_SPRITE_K)
      spr.setFlipX(px < e.x) // 플레이어를 바라보게
      // tint 우선순위 — 위가 먼저. 상태이상은 색으로만 구분되니 순서가 중요하다.
      //   피격 > 화상 > 독 > 냉기 > 취약 > 수호자 강화
      if (e.flash > 0) spr.setTintFill(0xffffff) // 피격 흰 섬광
      else if (e.burn && e.burn.time > 0) spr.setTint(0xff9a4a) // 화상 주황
      else if (e.poison && e.poison.time > 0) spr.setTint(0x9ae86a) // 독 연두
      else if (e.chill && e.chill.time > 0) spr.setTint(0x8ad4f5) // 냉기 하늘
      else if (e.vuln && e.vuln.time > 0) spr.setTint(0xf58aa0) // 취약 분홍
      else if (e.buffed) spr.setTint(0xc08ef4) // 수호자 오라 — 강화된 적은 보라
      else spr.clearTint()
      spr.visible = true
      bi++
    }
    for (let k = bi; k < sprites.length; k++) sprites[k].visible = false

    // 2-b) 엘리트 — 48px 시트(행=패턴). 일반 몹 위 레이어라 잡몹에 가리지 않는다.
    //      예고 중에는 걷기 프레임을 멈추고(정지 자세) 흰색으로 깜빡여 "온다"를 알린다.
    const esp = this.eliteSprites
    let ei = 0
    for (let i = 0; i < es.length; i++) {
      const e = es[i]
      if (!e.elite) continue
      let spr = esp[ei]
      if (!spr) {
        spr = this.add.sprite(0, 0, 'elites', 0).setOrigin(0.5, 0.72)
        this.eliteLayer.add(spr)
        esp[ei] = spr
      }
      // 예고/돌진 중이면 프레임 2~3(장전·돌진 자세)을 쓴다
      const acting = e.windup > 0 || e.charging > 0
      const fr = acting ? 2 + (Math.floor(this.elapsed * 12) & 1) : (walk + e.animOff) & 3
      spr.setFrame(e.eliteRow * 4 + fr)
      spr.setPosition(e.x, e.y)
      spr.setScale(e.r * ELITE_SPRITE_K)
      spr.setFlipX(px < e.x)
      if (e.flash > 0) spr.setTintFill(0xffffff)
      else if (e.windup > 0 && Math.floor(this.elapsed * 14) % 2 === 0) spr.setTintFill(0xffffff)
      else if (e.burn && e.burn.time > 0) spr.setTint(0xff9a4a)
      else if (e.poison && e.poison.time > 0) spr.setTint(0x9ae86a)
      else if (e.chill && e.chill.time > 0) spr.setTint(0x8ad4f5)
      else spr.clearTint()
      spr.visible = true
      ei++
    }
    for (let k = ei; k < esp.length; k++) esp[k].visible = false

    // 3) 보스 오버레이 준비 — 스프라이트 위층에 돔/체력바를 그린다
    const gt = this.gfxEnemyTop
    gt.clear()

    // 4) 보스 — 스프라이트와 구분되게 보라 돔(입체+눈)으로 따로, 스프라이트 위에 그려
    //    존재감을 준다. 체력바도 여기(위층)라 다른 적에 가리지 않는다.
    for (let i = 0; i < es.length; i++) {
      const e = es[i]
      if (!e.boss) continue
      gt.fillStyle(0x0c0c12, 1)
      gt.fillCircle(e.x, e.y, e.r)
      gt.fillStyle(e.flash > 0 ? COLOR_ENEMY_HIT : COLOR_BOSS, 1)
      gt.fillCircle(e.x - e.r * 0.12, e.y - e.r * 0.14, e.r * (e.flash > 0 ? 1.05 : 0.9))
      if (e.flash <= 0) {
        gt.fillStyle(0xffffff, 0.18)
        gt.fillCircle(e.x - e.r * 0.34, e.y - e.r * 0.4, e.r * 0.32)
        gt.fillStyle(0x101018, 0.92)
        const eyY = e.y - e.r * 0.2
        const eyX = e.r * 0.34
        const eyR = Math.max(1.2, e.r * 0.17)
        gt.fillCircle(e.x - eyX, eyY, eyR)
        gt.fillCircle(e.x + eyX, eyY, eyR)
      }
      if (e.burn && e.burn.time > 0) {
        const flick = 0.7 + 0.3 * Math.sin(this.elapsed * 22 + e.x)
        gt.fillStyle(0xf0963c, 0.35)
        gt.fillCircle(e.x, e.y - e.r * 0.15, e.r * (0.95 + 0.15 * flick))
      }
      const bw = e.r * 2.4
      const bx = e.x - bw / 2
      const by = e.y - e.r - 12
      gt.fillStyle(0x313244, 1)
      gt.fillRect(bx, by, bw, 5)
      gt.fillStyle(0xf38ba8, 1)
      gt.fillRect(bx, by, bw * Math.max(0, e.hp / e.maxHp), 5)
    }

    // 4-b) 엘리트 체력바 + 이름표.
    //   체력바가 없으면 "체력 4배"가 플레이어에게 전혀 안 보여서 위협이 아니라
    //   답답함으로만 남는다 — 엘리트에게 체력바는 선택이 아니라 필수다.
    const labels = this.eliteLabels
    let li = 0
    for (let i = 0; i < es.length; i++) {
      const e = es[i]
      if (!e.elite) continue
      const kind = ELITE_BY_ID[e.elite]
      const bw = e.r * 2.8
      const bx = e.x - bw / 2
      const by = e.y - e.r - 16
      gt.fillStyle(0x1b1b28, 0.9)
      gt.fillRect(bx - 1, by - 1, bw + 2, 6)
      gt.fillStyle(kind.tint, 1)
      gt.fillRect(bx, by, bw * Math.max(0, e.hp / e.maxHp), 4)

      let lb = labels[li]
      if (!lb) {
        lb = this.add
          .text(0, 0, '', { fontFamily: 'Arial, sans-serif', fontSize: '11px' })
          .setOrigin(0.5, 1)
        this.eliteLayer.add(lb)
        labels[li] = lb
      }
      lb.setText(kind.name)
      lb.setColor('#' + kind.tint.toString(16).padStart(6, '0'))
      lb.setPosition(e.x, by - 3)
      lb.visible = true
      li++
    }
    for (let k = li; k < labels.length; k++) labels[k].visible = false

    const ga = this.gfxArrows
    ga.clear()
    // 스킬별 이펙트 — 속도 비례 스트릭(모션블러)으로 그려 빠른 화살도 선으로 이어져 보인다.
    // 스트릭 길이 = 속도 × fx.streak(초). 화살 뒤쪽으로 뻗는다(머리는 현재 위치).
    for (let k = 0; k < SKILL_FX_KEYS.length; k++) {
      const key = SKILL_FX_KEYS[k]
      const fx = SKILL_FX[key]

      // (1) 넓고 흐린 글로우 — 어두운 바닥 위에서 존재감을 준다
      let started = false
      for (let i = 0; i < this.arrows.length; i++) {
        const a = this.arrows[i]
        if ((a.fx || 'basic') !== key) continue
        if (!started) {
          ga.lineStyle(fx.w * 2.6, fx.tint, 0.16)
          ga.beginPath()
          started = true
        }
        // 이동한 만큼만 뻗게 제한 → 발사 직후 꼬리가 캐릭터 반대편으로 튀지 않는다
        const s1 = a.age < fx.streak ? a.age : fx.streak
        ga.moveTo(a.x, a.y)
        ga.lineTo(a.x - a.vx * s1, a.y - a.vy * s1)
      }
      if (started) ga.strokePath()

      // (2) 트레일 — fade는 스트릭 뒤로 더 길게 이어붙인 반투명 꼬리
      if (fx.trail === 'fade' || fx.trail === 'thin') {
        const tailMul = fx.trail === 'fade' ? 2.2 : 1.5 // 스트릭 대비 꼬리 배수
        started = false
        for (let i = 0; i < this.arrows.length; i++) {
          const a = this.arrows[i]
          if ((a.fx || 'basic') !== key) continue
          if (!started) {
            ga.lineStyle(fx.w * 0.8, fx.tint, fx.trail === 'fade' ? 0.34 : 0.26)
            ga.beginPath()
            started = true
          }
          const sA = a.age < fx.streak ? a.age : fx.streak
          const tEnd = fx.streak * tailMul
          const sB = a.age < tEnd ? a.age : tEnd
          if (sB > sA) {
            ga.moveTo(a.x - a.vx * sA, a.y - a.vy * sA)
            ga.lineTo(a.x - a.vx * sB, a.y - a.vy * sB)
          }
        }
        if (started) ga.strokePath()
      } else if (fx.trail === 'dots') {
        // 점선: 스트릭 뒤로 점 3개 (속도에 비례해 간격 벌어짐)
        ga.fillStyle(fx.tint, 0.5)
        for (let i = 0; i < this.arrows.length; i++) {
          const a = this.arrows[i]
          if ((a.fx || 'basic') !== key) continue
          for (let d = 1; d <= 3; d++) {
            const s = fx.streak * (1 + d * 0.55)
            if (s > a.age) break // 아직 그만큼 못 갔으면 그리지 않는다
            ga.fillCircle(a.x - a.vx * s, a.y - a.vy * s, 2.2)
          }
        }
      }

      // (3) 스트릭 본체 — 진하고 선명하게
      started = false
      for (let i = 0; i < this.arrows.length; i++) {
        const a = this.arrows[i]
        if ((a.fx || 'basic') !== key) continue
        if (!started) {
          ga.lineStyle(fx.w, fx.tint, 1)
          ga.beginPath()
          started = true
        }
        const s2 = a.age < fx.streak ? a.age : fx.streak
        ga.moveTo(a.x, a.y)
        ga.lineTo(a.x - a.vx * s2, a.y - a.vy * s2)
      }
      if (started) ga.strokePath()
    }

    // 횃불 불꽃 — 전경 프롭(depth 3)에 가리지 않도록 전용 레이어(depth 4)에 그린다.
    // torchLights는 월드 좌표이므로 화면 좌표로 변환: screen = world - player + center
    const gfl = this.gfxFlames
    gfl.clear()
    if (this.torchLights.length) {
      const tt = this.elapsed
      const offX = W / 2 - this.player.x
      const offY = H / 2 - this.player.y
      for (let i = 0; i < this.torchLights.length; i++) {
        const L = this.torchLights[i]
        const sx = L.x + offX
        const sy = L.y + offY
        if (sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40) continue
        // 위치마다 다른 위상 → 다 같이 깜빡이지 않는다
        const ph = (L.x * 0.017 + L.y * 0.013) % 6.283
        const fl = 0.78 + 0.22 * Math.sin(tt * 9 + ph) + 0.08 * Math.sin(tt * 23 + ph * 2)
        gfl.fillStyle(0xffb45c, 0.22 * fl)
        gfl.fillCircle(sx, sy, 16 * fl)
        gfl.fillStyle(0xffd9a0, 0.55 * fl)
        gfl.fillCircle(sx, sy - 2, 8 * fl)
        gfl.fillStyle(0xfff3d6, 0.9 * fl)
        gfl.fillCircle(sx, sy - 4, 3.6 * fl)
      }
    }

    // 머즐 플래시 — 발사 지점에서 짧게 터지는 빛. 스킬 색으로 구분되며,
    // 화살보다 오래(0.09s) 한 자리에 머물러 체감이 크다.
    for (let i = 0; i < this.muzzles.length; i++) {
      const m = this.muzzles[i]
      const k = m.life / m.max // 1 → 0
      ga.fillStyle(m.tint, 0.5 * k)
      ga.fillCircle(m.x, m.y, m.r * (0.5 + 0.5 * k))
      ga.fillStyle(0xffffff, 0.55 * k)
      ga.fillCircle(m.x, m.y, m.r * 0.4 * k)
      // 발사 방향으로 짧은 쐐기
      ga.lineStyle(2, m.tint, 0.6 * k)
      ga.beginPath()
      ga.moveTo(m.x, m.y)
      ga.lineTo(m.x + Math.cos(m.angle) * m.r * 1.6 * k, m.y + Math.sin(m.angle) * m.r * 1.6 * k)
      ga.strokePath()
    }

    // 수류탄 폭발 — 커지면서 사라지는 링
    const gf = this.gfxFx
    gf.clear()
    for (let i = 0; i < this.explosions.length; i++) {
      const ex = this.explosions[i]
      const k = ex.life / ex.max // 1 → 0
      gf.lineStyle(3, COLOR_ARROW, k)
      gf.strokeCircle(ex.x, ex.y, ex.r * (1.3 - 0.3 * k))
      gf.fillStyle(COLOR_ARROW, k * 0.18)
      gf.fillCircle(ex.x, ex.y, ex.r)
    }

    // 예고 표시 — 종류마다 모양이 달라야 "무엇이 오는지"가 읽힌다.
    //   charge = 돌진 경로(길이 제한된 두꺼운 띠)  → 측면으로 비켜라
    //   shell  = 지면 착탄 원(안쪽이 차오름)        → 그 자리를 떠나라
    //   fan    = 부채꼴 라인 여러 개                → 각도에서 빠져라
    //   (kind 없음) = 기존 보스 라인탄
    const TELE_LEN = 900
    const elc = this.cfg.elite
    for (let i = 0; i < this.telegraphs.length; i++) {
      const t = this.telegraphs[i]
      const k = 1 - t.life / t.max // 0 → 1 (발동 임박)

      if (t.kind === 'charge') {
        const ex2 = t.x + Math.cos(t.ang) * t.len
        const ey2 = t.y + Math.sin(t.ang) * t.len
        // 굵은 경로 띠 + 임박할수록 진해짐
        gf.lineStyle(14, 0xec6050, 0.1 + k * 0.22)
        gf.beginPath()
        gf.moveTo(t.x, t.y)
        gf.lineTo(ex2, ey2)
        gf.strokePath()
        gf.lineStyle(2, 0xec6050, 0.4 + k * 0.5)
        gf.beginPath()
        gf.moveTo(t.x, t.y)
        gf.lineTo(ex2, ey2)
        gf.strokePath()
        continue
      }

      if (t.kind === 'shell') {
        // 바깥 테두리는 고정 크기(착탄 범위), 안쪽이 차오르며 타이밍을 알려준다
        gf.lineStyle(2, 0xf29840, 0.5 + k * 0.4)
        gf.strokeCircle(t.x, t.y, t.r)
        gf.fillStyle(0xf29840, 0.1 + k * 0.16)
        gf.fillCircle(t.x, t.y, t.r * k)
        // 십자 조준 — 지면 표시라는 걸 분명히
        gf.lineStyle(1, 0xf29840, 0.45)
        gf.beginPath()
        gf.moveTo(t.x - t.r, t.y)
        gf.lineTo(t.x + t.r, t.y)
        gf.moveTo(t.x, t.y - t.r)
        gf.lineTo(t.x, t.y + t.r)
        gf.strokePath()
        continue
      }

      if (t.kind === 'fan') {
        const ox = t.owner ? t.owner.x : t.x
        const oy = t.owner ? t.owner.y : t.y
        const n = Math.max(1, Math.round(elc.scatterCount))
        const mid = (n - 1) / 2
        gf.lineStyle(2, 0x6ed6ce, 0.2 + k * 0.45)
        gf.beginPath()
        for (let j = 0; j < n; j++) {
          const a = t.ang + (j - mid) * elc.scatterSpread
          gf.moveTo(ox, oy)
          gf.lineTo(ox + Math.cos(a) * 340, oy + Math.sin(a) * 340)
        }
        gf.strokePath()
        continue
      }

      gf.lineStyle(2 + k * 2, 0xf38ba8, 0.25 + k * 0.5)
      gf.beginPath()
      gf.moveTo(t.x, t.y)
      gf.lineTo(t.x + Math.cos(t.ang) * TELE_LEN, t.y + Math.sin(t.ang) * TELE_LEN)
      gf.strokePath()
    }

    // 적 투사체 — 발사한 쪽의 색으로 그린다(보스 분홍 / 산탄사수 청록 등).
    // 풀에서 재사용되므로 tint 는 스폰 시점에 항상 지정해야 한다(안 하면 이전 색이 남는다).
    for (let i = 0; i < this.eProjectiles.length; i++) {
      const p = this.eProjectiles[i]
      gf.fillStyle(p.tint || 0xf38ba8, 1)
      gf.fillCircle(p.x, p.y, p.rad || 6)
      gf.fillStyle(0xffffff, 0.5)
      gf.fillCircle(p.x - 1.5, p.y - 1.5, (p.rad || 6) * 0.35)
    }

    // 날아가는 수류탄 (포물선) — 바닥 그림자 + 솟았다 떨어지는 본체
    gf.fillStyle(0x000000, 0.3)
    for (let i = 0; i < this.grenades.length; i++) {
      const g = this.grenades[i]
      gf.fillEllipse(g.x, g.y, 9, 4.5) // 착탄 지점 따라오는 그림자
    }
    gf.fillStyle(0xf9e2af, 1)
    for (let i = 0; i < this.grenades.length; i++) {
      const g = this.grenades[i]
      const k = g.t / GRENADE_DUR
      const h = Math.sin(Math.PI * Math.min(1, k)) * GRENADE_ARC // 포물선 높이
      gf.fillCircle(g.x, g.y - h, 5)
    }

    // 사망 파편 — 사각형, 남은 수명만큼 옅어짐
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]
      if (p.kind === 'line') continue
      const k = p.life / p.max
      gf.fillStyle(p.color, k)
      gf.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2)
    }
    // 타격 스파크 — 짧은 직선(꼬리는 진행 반대쪽), 희미하게
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]
      if (p.kind !== 'line') continue
      const k = p.life / p.max
      gf.lineStyle(2, p.color, k * 0.55)
      gf.beginPath()
      gf.moveTo(p.x, p.y)
      gf.lineTo(p.x - p.nx * p.size, p.y - p.ny * p.size)
      gf.strokePath()
    }

    // 플레이어 — 스프라이트면 발밑 그림자만, 아니면 폴백 음영 오브
    const gp = this.gfxChar
    gp.clear()
    const pr = this.stats.player.radius
    if (this.playerSprite) {
      gp.fillStyle(0x000000, 0.4)
      gp.fillEllipse(px, py + pr * 0.5, pr * 2.2, pr * 1.0) // 발밑 그림자
    } else {
      gp.fillStyle(COLOR_PLAYER, 0.16)
      gp.fillCircle(px, py, pr * 1.9)
      gp.fillStyle(0x000000, 0.4)
      gp.fillEllipse(px, py + pr * 0.95, pr * 2.1, pr * 1.0)
      gp.fillStyle(0x8fd0ff, 1)
      gp.fillCircle(px, py, pr)
      gp.lineStyle(2, 0xcdd6f4, 0.9)
      gp.strokeCircle(px, py, pr)
      gp.fillStyle(0xeaf6ff, 1)
      gp.fillCircle(px - pr * 0.32, py - pr * 0.32, pr * 0.34)
    }
  }
}

const config = {
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: COLOR_BG,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: W,
    height: H,
  },
  scene: GameScene,
}

const game = new Phaser.Game(config)

// 튜너에서 값이 바뀌면 새 설정으로 재시작한다.
// 씬의 create() 안이 아니라 여기서 한 번만 등록해야 한다 —
// create() 는 재시작마다 다시 도는데 window 리스너는 Phaser 가 정리해주지 않아서,
// 안에 두면 재시작할 때마다 리스너가 쌓인다.
onConfigChange(() => game.scene.getScene('Game')?.scene.restart())

if (import.meta.env.DEV) window.__game = game
