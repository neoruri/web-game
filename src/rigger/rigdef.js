/**
 * 관절 + 계층 -> 뼈 정의(rest, attach). make_creature_rig.py 의 그 부분이다.
 *
 * 핵심 아이디어: **쉬는 자세를 그림에서 뽑는다.**
 * 그림이 이미 하나의 완성된 포즈이므로 그걸 rest 로 삼고, 애니메이션은 rest 에서
 * 몇 도 벗어나는지만 준다. 오프셋이 전부 0이면 원본 그림과 같아진다 —
 * 절대 망가지지 않는 바닥이 생긴다.
 */

const D = Math.PI / 180

export function ang(a, b) {
  return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
}

function rot(v, deg) {
  const c = Math.cos(deg * D), s = Math.sin(deg * D)
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]
}

/**
 * @param {Array} parts  [{name, parent, joint:[x,y], tip:[x,y]|null}]
 *   tip 은 rest 각도를 재기 위한 방향점. 자식이 하나면 그 자식의 관절을 자동으로 쓴다.
 * @param {{unit:number, ground:[number,number]}} opts
 */
export function buildRig(parts, opts) {
  const byName = new Map(parts.map((p) => [p.name, p]))
  const root = parts.find((p) => !p.parent) || parts[0]

  // 방향점이 없으면 자식 관절을 쓴다.
  // 자식이 여럿이면 **이름순 첫 자식**을 쓴다 — 배열 순서(=그리는 순서)에 기대면
  // 앞뒤를 바꿀 때마다 rest 가 조용히 달라져서 헷갈린다.
  // (rest 를 뭘로 잡든 쉬는 자세는 원본 그대로다. attach 를 같은 좌표계로 재기 때문.
  //  그래도 값이 왔다갔다 하면 디버깅이 어려워지므로 고정한다)
  const tipOf = (p) => {
    if (p.tip) return p.tip
    const kids = parts.filter((q) => q.parent === p.name && q.joint)
      .sort((a, b) => a.name.localeCompare(b.name))
    if (kids.length) return kids[0].joint
    return [p.joint[0] + 1, p.joint[1]] // 방향을 못 정하면 0도
  }

  const rest = {}
  for (const p of parts) rest[p.name] = +ang(p.joint, tipOf(p)).toFixed(2)

  const bones = parts.map((p) => {
    let attach = [0, 0]
    if (p.parent && byName.has(p.parent)) {
      const pp = byName.get(p.parent)
      const d = [p.joint[0] - pp.joint[0], p.joint[1] - pp.joint[1]]
      // 부모의 rest 좌표계로 되돌린다. 런타임이 부모 월드각으로 다시 돌린다
      attach = rot(d, -rest[p.parent]).map((v) => +v.toFixed(2))
    }
    return { name: p.name, parent: p.parent || null, rest: rest[p.name], attach }
  })

  const g = opts.ground
  return {
    unit: opts.unit,
    bones,
    rootOffset: [+(root.joint[0] - g[0]).toFixed(2), +(root.joint[1] - g[1]).toFixed(2)],
  }
}

/** rest 각도만 넣은 정지 포즈. 원본 그림과 같아야 한다. */
export function restAngles(rig) {
  const a = {}
  for (const b of rig.bones) a[b.name] = b.rest
  return a
}

/**
 * 확인용 숨쉬기 클립. 위상을 어긋나게 줘야 기계처럼 안 보인다.
 * 실제 게임 클립은 따로 만들지만, 리거에서 관절이 제대로 물렸는지 보려면
 * 뭐라도 움직여봐야 한다.
 */
export function makeIdle(rig, { frames = 24, fps = 12, amp = 3, rise = 5 } = {}) {
  const out = []
  const seed = rig.bones.map((_b, i) => (i * 0.618) % 1) // 위상을 골고루 흩는다
  for (let i = 0; i < frames; i++) {
    const u = i / frames
    const angles = {}
    rig.bones.forEach((b, k) => {
      const depth = b.parent ? 1 : 0.35 // 뿌리는 덜, 끝은 더 흔든다
      angles[b.name] = +(b.rest + amp * depth
        * Math.sin(2 * Math.PI * u + seed[k] * Math.PI * 2)).toFixed(2)
    })
    out.push({
      root: [rig.rootOffset[0],
             +(rig.rootOffset[1] - rise * Math.sin(2 * Math.PI * u)).toFixed(2)],
      angles,
    })
  }
  return { fps, loop: true, frames: out }
}
