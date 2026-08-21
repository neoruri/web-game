/**
 * 뼈 계층을 푸는 **순수 계산** 부분. 그리기와 무관하다.
 *
 * 왜 따로 뺐나:
 *   게임(Phaser)과 리거 도구(2D 캔버스)가 같은 뼈 계산을 써야 한다.
 *   각자 구현을 두면 반드시 어긋나고, 그때 "리거에서는 맞는데 게임에서는 틀린" 버그가 난다.
 *   계산은 여기 하나뿐이고 양쪽은 결과를 그리기만 한다.
 *
 * ── 좌표 규약 ──
 *   화면 y 가 아래라 시계방향이 양수. 각도는 도(degree).
 *   클립에 저장된 각도는 **월드 각도**다 (부모 대비 로컬이 아니다).
 *   rest   : 그림에서 그 뼈가 원래 향하던 각도. 파츠 회전 = 월드각 - rest.
 *            클립이 비어 있으면 원본 그림 그대로가 되게 하려는 장치다.
 *   attach : 부모 관절에서 이 관절까지의 오프셋. **부모의 rest 좌표계** 기준.
 *            사슬 뼈면 [부모길이, 0] 이고, 크리처처럼 몸통 아무 데나 붙는 것도 같은 식이다.
 */

export const DEG = Math.PI / 180

/** 각도를 최단 경로로 보간한다. 179° -> -179° 를 358° 돌지 않게. */
export function lerpAngle(a, b, t) {
  let d = (b - a) % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return a + d * t
}

/**
 * 각 뼈의 관절 위치와 파츠 회전을 구한다.
 *
 * @param {object} def   { bones: [{name, parent, attach, rest, length, at}] }
 * @param {object} ang   { 뼈이름: 월드각(도) }
 * @param {{x:number,y:number}} root  루트 관절 위치 (이미 스케일 적용된 화면 좌표)
 * @param {number} k     def 단위 -> 화면 픽셀 배율
 * @returns {Map<string,{x:number,y:number,rot:number}>} rot 은 **라디안**
 */
export function solvePose(def, ang, root, k) {
  const byName = new Map()
  for (const b of def.bones) byName.set(b.name, b)

  const start = {}
  const resolve = (b) => {
    if (start[b.name]) return start[b.name]
    if (!b.parent) {
      start[b.name] = { x: root.x, y: root.y }
    } else {
      const p = byName.get(b.parent)
      if (!p) { start[b.name] = { x: root.x, y: root.y }; return start[b.name] }
      const ps = resolve(p)
      // attach 는 부모의 rest 좌표계 기준이므로 부모의 월드각으로 돌려준다.
      // 사슬 뼈면 attach = [부모길이, 0] 이라 결국 부모 끝점이 된다
      const [ax, ay] = b.attach ?? [(p.length || 0) * (b.at ?? 1), 0]
      const pa = (ang[p.name] ?? p.rest ?? 0) * DEG
      const c = Math.cos(pa), s = Math.sin(pa)
      start[b.name] = {
        x: ps.x + (ax * c - ay * s) * k,
        y: ps.y + (ax * s + ay * c) * k,
      }
    }
    return start[b.name]
  }

  const out = new Map()
  for (const b of def.bones) {
    const s = resolve(b)
    // rest 를 빼야 그림이 원래 향하던 방향이 기준이 된다
    const rot = ((ang[b.name] ?? b.rest ?? 0) - (b.rest ?? 0)) * DEG
    out.set(b.name, { x: s.x, y: s.y, rot })
  }
  return out
}

/**
 * 클립의 한 시점을 각도 맵으로 편다.
 * @returns {{angles:object, root:[number,number]}}
 */
export function sampleClip(def, clip, time) {
  const f = clip.frames
  const n = f.length
  const i0 = Math.floor(time) % n
  const i1 = (i0 + 1) % n
  const t = time - Math.floor(time)
  const A = f[i0], B = f[i1]

  const angles = {}
  for (const b of def.bones) {
    const a = A.angles[b.name] ?? b.rest ?? 0
    const bb = B.angles[b.name] ?? b.rest ?? 0
    angles[b.name] = lerpAngle(a, bb, t)
  }
  return {
    angles,
    root: [
      A.root[0] + (B.root[0] - A.root[0]) * t,
      A.root[1] + (B.root[1] - A.root[1]) * t,
    ],
  }
}
