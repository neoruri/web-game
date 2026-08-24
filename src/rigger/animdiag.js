/**
 * 동작 진단. 편집하는 동안 계속 돌려서 **만들면서 바로 잡히게** 하려는 것이다.
 *
 * 여기 있는 검사는 전부 실제로 버그를 잡아낸 것들이다. 전부 눈으로는 놓쳤다:
 *   · 발이 접지선 위 35px(키의 9%)에 떠서 공중을 걷고 있었다
 *   · 접지 중에 발이 앞으로 되돌아가 미끄러졌다
 *   · 무릎 굽힘이 14°~96° 를 오가서 다리가 고무처럼 보였다
 *   · 왼쪽 다리가 97% 뻗어 있어 IK 가 한계에 걸려 막대기가 됐다
 *
 * 접지 판정을 하려면 **어느 뼈 끝이 땅에 닿는가**를 알아야 한다.
 * 파츠에 ground 플래그를 켠 뼈(보통 발)를 추적한다. 2족·4족 상관없이 동작한다.
 */
import { solvePose } from '../rig-core.js'

const D = Math.PI / 180

/** 뼈 끝점(관절 + 방향으로 길이만큼). 발 끝 위치를 알려면 필요하다. */
function tipOf(rig, pose, name, angles) {
  const b = rig.bones.find((x) => x.name === name)
  const p = pose.get(name)
  if (!b || !p) return null
  // 이 뼈의 길이 = 자식 attach 의 x 성분(자식이 없으면 attach 를 못 쓰므로 rest 길이 추정)
  const kid = rig.bones.find((x) => x.parent === name)
  const len = kid ? Math.hypot(kid.attach[0], kid.attach[1]) : (b.tipLen || 0)
  const a = (angles[name] ?? b.rest) * D
  return { x: p.x + Math.cos(a) * len, y: p.y + Math.sin(a) * len }
}

/**
 * 클립 전체를 훑으며 접지 뼈의 궤적과 무릎 굽힘을 잰다.
 * @param sample (t) => {angles, root}
 */
export function analyse(rig, sample, clip, groundBones, chains) {
  const N = Math.max(8, clip.length * 2)
  const trails = new Map(groundBones.map((n) => [n, []]))
  const flex = new Map((chains || []).map((c) => [c.name, []]))
  const reach = new Map((chains || []).map((c) => [c.name, []]))

  for (let i = 0; i < N; i++) {
    const t = (i / N) * clip.length
    const { angles, root } = sample(t)
    const pose = solvePose(rig, angles, { x: root[0], y: root[1] }, 1)
    for (const n of groundBones) {
      const tp = tipOf(rig, pose, n, angles)
      if (tp) trails.get(n).push({ t, ...tp })
    }
    for (const c of chains || []) {
      // 무릎 굽힘 = 아래 뼈 각도 - 위 뼈 각도, -180~180 로 정규화.
      // 정규화를 빼먹으면 ±180 을 넘는 프레임에서 -257° 같은 값이 나와 잘못 읽는다
      const up = angles[c.upper], lo = angles[c.lower]
      if (up != null && lo != null) {
        flex.get(c.name).push(((lo - up + 180) % 360 + 360) % 360 - 180)
      }
      const a = pose.get(c.upper), b = pose.get(c.lower), e = pose.get(c.end)
      if (a && e) {
        const l1 = Math.hypot(...(rig.bones.find((x) => x.name === c.lower).attach))
        const l2 = Math.hypot(...(rig.bones.find((x) => x.name === c.end).attach))
        reach.get(c.name).push(Math.hypot(e.x - a.x, e.y - a.y) / Math.max(1, l1 + l2))
      }
    }
  }

  const report = []
  for (const [n, pts] of trails) {
    if (pts.length < 4) continue
    // 접지 = 가장 낮은 y 근처(화면 y 는 아래가 +). 5% 이내를 접지로 본다
    const ys = pts.map((p) => p.y)
    const low = Math.max(...ys)
    const span = low - Math.min(...ys)
    const onGround = pts.map((p, i) => ({ ...p, i, on: low - p.y <= span * 0.12 }))
    const contact = onGround.filter((p) => p.on)
    // 접지 중에 x 가 되돌아가면 미끄러진 것이다
    let back = 0
    for (let i = 1; i < contact.length; i++) {
      if (contact[i].i !== contact[i - 1].i + 1) continue // 접지 구간이 끊긴 곳은 건너뜀
      if (contact[i].x > contact[i - 1].x + 0.002) back++
    }
    const yWobble = contact.length
      ? Math.max(...contact.map((p) => p.y)) - Math.min(...contact.map((p) => p.y))
      : 0
    report.push({
      kind: 'ground', name: n,
      contactFrames: contact.length, total: pts.length,
      slide: back, yWobble, span,
      ok: back === 0 && contact.length >= 2,
    })
  }
  for (const [n, v] of flex) {
    if (!v.length) continue
    const lo = Math.min(...v), hi = Math.max(...v)
    report.push({ kind: 'flex', name: n, min: lo, max: hi, range: hi - lo, ok: hi - lo <= 60 })
  }
  for (const [n, v] of reach) {
    if (!v.length) continue
    const hi = Math.max(...v)
    report.push({ kind: 'reach', name: n, max: hi, ok: hi <= 0.94 })
  }
  return { trails, report }
}

/** 발끝 궤적 그림. 접지 구간이 지면 위 직선이면 정상, 되돌아가면 미끄러진다. */
export function drawTrails(ctx, trails, w, h) {
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#12161c'
  ctx.fillRect(0, 0, w, h)
  const all = [...trails.values()].flat()
  if (all.length < 2) {
    ctx.fillStyle = '#5a6472'
    ctx.font = '12px system-ui'
    ctx.fillText('접지 뼈를 지정하면 궤적이 나옵니다', 10, h / 2)
    return
  }
  const xs = all.map((p) => p.x), ys = all.map((p) => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const pad = 16
  const s = Math.min((w - pad * 2) / Math.max(1e-3, maxX - minX),
                     (h - pad * 2) / Math.max(1e-3, maxY - minY))
  const X = (v) => pad + (v - minX) * s
  const Y = (v) => pad + (v - minY) * s

  ctx.strokeStyle = 'rgba(255,80,80,0.65)'
  ctx.beginPath()
  ctx.moveTo(0, Y(maxY))
  ctx.lineTo(w, Y(maxY))
  ctx.stroke()

  const colors = ['#ee9955', '#6688dd', '#66cc99', '#cc77cc']
  let ci = 0
  for (const [, pts] of trails) {
    const col = colors[ci++ % colors.length]
    pts.forEach((p, i) => {
      ctx.globalAlpha = 0.3 + 0.7 * (i / pts.length) // 진하기 = 시간 순서
      ctx.fillStyle = col
      ctx.beginPath()
      ctx.arc(X(p.x), Y(p.y), 2.2, 0, 7)
      ctx.fill()
    })
  }
  ctx.globalAlpha = 1
  ctx.fillStyle = '#6f7a88'
  ctx.font = '11px system-ui'
  ctx.fillText('진하기 = 시간 순서 · 아랫변이 직선이면 안 미끄러진다', 8, h - 6)
}
