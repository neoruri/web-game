// 레벨업 때 뽑히는 카드들.
// 효과의 크기(+5, ×0.85 ...)는 하드코딩하지 않고 config 의 upgrade 그룹에서 읽는다.
// → 튜너에서 바로 조절할 수 있다.

export const UPGRADES = [
  {
    id: 'damage',
    name: '날카로운 촉',
    max: 99,
    desc: (cfg) => `화살 데미지 +${cfg.upgrade.damageAdd}`,
    apply: (s, cfg) => {
      s.weapon.damage += cfg.upgrade.damageAdd
    },
  },
  {
    id: 'cooldown',
    name: '속사',
    max: 8,
    desc: (cfg) =>
      `발사 간격 -${Math.round((1 - cfg.upgrade.cooldownMul) * 100)}%`,
    apply: (s, cfg) => {
      s.weapon.cooldown *= cfg.upgrade.cooldownMul
    },
  },
  {
    id: 'pierce',
    name: '관통',
    max: 5,
    desc: (cfg) => `화살이 적 ${cfg.upgrade.pierceAdd}명 더 관통`,
    apply: (s, cfg) => {
      s.weapon.pierce += cfg.upgrade.pierceAdd
    },
  },
  {
    id: 'speed',
    name: '날렵함',
    max: 8,
    desc: (cfg) => `이동 속도 +${cfg.upgrade.speedAdd}`,
    apply: (s, cfg) => {
      s.player.speed += cfg.upgrade.speedAdd
    },
  },
  {
    id: 'maxHp',
    name: '강인함',
    max: 99,
    desc: (cfg) => `최대 체력 +${cfg.upgrade.maxHpAdd} (즉시 회복)`,
    apply: (s, cfg, scene) => {
      s.player.maxHp += cfg.upgrade.maxHpAdd
      scene.heal(cfg.upgrade.maxHpAdd)
    },
  },
  {
    id: 'magnet',
    name: '자석',
    max: 6,
    desc: (cfg) => `젬 획득 범위 +${cfg.upgrade.pickupAdd}`,
    apply: (s, cfg) => {
      s.player.pickupRadius += cfg.upgrade.pickupAdd
    },
  },
]

// 아직 최대 레벨이 아닌 카드 중 n 장을 뽑는다.
export function drawCards(taken, n = 3) {
  const pool = UPGRADES.filter((u) => (taken[u.id] || 0) < u.max)
  const picked = []

  while (picked.length < n && pool.length > 0) {
    const i = Math.floor(Math.random() * pool.length)
    picked.push(pool[i])
    pool.splice(i, 1)
  }
  return picked
}
