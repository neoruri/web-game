/**
 * 클립 = 듬성듬성한 **키프레임** 목록. 편집은 키로 하고, 내보낼 때 매 프레임으로 굽는다.
 *
 * 왜 나눠 두나:
 *   손으로 찍는 동작은 키가 4~8개면 충분한데, 게임 런타임(rig.js)은 매 프레임 배열을
 *   기대한다. 편집기에서까지 매 프레임을 들고 있으면 하나 고칠 때마다 전부 손봐야 한다.
 *
 * ── FK 규칙 ──
 * 각도는 **월드 각도**로 저장한다(런타임과 같은 형식). 그래서 부모를 돌려도 자식의
 * 저장값은 안 변하는데, 편집할 때는 부모를 돌리면 자식이 **따라 돌아야** 자연스럽다.
 * 그래서 뼈를 돌릴 때 자손 전부에 같은 변화량을 더한다 (rotateBone 참고).
 */
import { lerpAngle } from '../rig-core.js'

export function newClip(name, { fps = 12, loop = true, length = 12 } = {}) {
  return { name, fps, loop, length, keys: [] }
}

/** 키를 t(프레임) 위치에 넣는다. 같은 자리면 덮어쓴다. */
export function setKey(clip, t, angles, root) {
  const k = { t: Math.round(t), angles: { ...angles }, root: [...root] }
  const i = clip.keys.findIndex((q) => q.t === k.t)
  if (i >= 0) clip.keys[i] = k
  else clip.keys.push(k)
  clip.keys.sort((a, b) => a.t - b.t)
  return k
}

export function removeKey(clip, t) {
  const i = clip.keys.findIndex((q) => q.t === Math.round(t))
  if (i >= 0) clip.keys.splice(i, 1)
}

export function keyAt(clip, t) {
  return clip.keys.find((q) => q.t === Math.round(t)) || null
}

/**
 * t 시점의 포즈. 키 사이는 선형 보간, 각도는 최단 경로.
 * loop 이면 마지막 키에서 첫 키로 감아 돈다 — 안 그러면 사이클 끝에서 툭 끊긴다.
 */
export function samplePose(clip, t, fallback) {
  const ks = clip.keys
  if (!ks.length) return fallback
  if (ks.length === 1) return { angles: { ...ks[0].angles }, root: [...ks[0].root] }

  const L = clip.length
  const tt = ((t % L) + L) % L
  let a = null, b = null, span = 0, u = 0

  for (let i = 0; i < ks.length; i++) {
    const cur = ks[i], nxt = ks[i + 1]
    if (nxt && tt >= cur.t && tt <= nxt.t) {
      a = cur; b = nxt; span = nxt.t - cur.t
      u = span ? (tt - cur.t) / span : 0
      break
    }
  }
  if (!a) {
    // 마지막 키 뒤 (또는 첫 키 앞) — 감아 돌린다
    const last = ks[ks.length - 1], first = ks[0]
    if (!clip.loop) return tt < first.t
      ? { angles: { ...first.angles }, root: [...first.root] }
      : { angles: { ...last.angles }, root: [...last.root] }
    a = last; b = first
    span = (L - last.t) + first.t
    const d = tt >= last.t ? tt - last.t : (L - last.t) + tt
    u = span ? d / span : 0
  }

  const angles = {}
  for (const n in a.angles) {
    angles[n] = lerpAngle(a.angles[n], b.angles[n] ?? a.angles[n], u)
  }
  for (const n in b.angles) if (!(n in angles)) angles[n] = b.angles[n]
  return {
    angles,
    root: [a.root[0] + (b.root[0] - a.root[0]) * u,
           a.root[1] + (b.root[1] - a.root[1]) * u],
  }
}

/** 런타임(rig.js)이 먹는 매 프레임 형식으로 굽는다. */
export function bake(clip, fallback) {
  const frames = []
  for (let i = 0; i < clip.length; i++) {
    const p = samplePose(clip, i, fallback)
    const angles = {}
    for (const n in p.angles) angles[n] = +p.angles[n].toFixed(2)
    frames.push({ root: p.root.map((v) => +v.toFixed(2)), angles })
  }
  return { fps: clip.fps, loop: clip.loop, frames }
}

/** 이 뼈의 자손 전부 (자기 자신 포함). FK 로 같이 돌리려고 쓴다. */
export function descendants(rig, name) {
  const out = [name]
  for (let i = 0; i < out.length; i++) {
    for (const b of rig.bones) {
      if (b.parent === out[i] && !out.includes(b.name)) out.push(b.name)
    }
  }
  return out
}

/**
 * 뼈를 delta 만큼 돌린다. 자손도 같이 돈다 (FK).
 * 자식 각도를 그대로 두면 부모를 돌릴 때 자식이 반대로 꺾인 것처럼 보인다.
 */
export function rotateBone(rig, angles, name, delta) {
  for (const n of descendants(rig, name)) {
    angles[n] = (angles[n] ?? 0) + delta
  }
}

/** 좌우 대칭 붙여넣기. 걷기는 반 사이클이 대칭이라 절반만 만들면 된다. */
export function mirrorAngles(rig, angles, pairs) {
  const out = { ...angles }
  for (const [a, b] of pairs) {
    if (a in angles) out[b] = angles[a]
    if (b in angles) out[a] = angles[b]
  }
  return out
}

/**
 * 이름에서 좌우 짝을 찾는다. legL_shin <-> legR_shin, armL_up <-> armR_up 같은 것.
 * 규칙이 안 맞는 이름은 그냥 안 잡힌다 — 사용자가 손으로 맞추면 된다.
 */
export function guessPairs(rig) {
  const names = rig.bones.map((b) => b.name)
  const pairs = []
  for (const n of names) {
    const m = n.match(/^(.*?)L(_.*)?$/)
    if (!m) continue
    const twin = `${m[1]}R${m[2] || ''}`
    if (names.includes(twin)) pairs.push([n, twin])
  }
  return pairs
}
