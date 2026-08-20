/**
 * 2D 컷아웃 뼈대 애니메이션 런타임 (Phaser 3).
 *
 * 왜 만들었나:
 *   프레임을 한 장씩 AI로 그리면 프레임마다 캐릭터가 미묘하게 달라진다.
 *   LoRA 까지 학습시켜 겨우 잡았지만 여전히 완전하지는 않았다.
 *   그림 한 장을 파츠로 잘라 뼈로 움직이면 이 문제가 **원리적으로** 사라진다.
 *   모든 프레임이 정의상 같은 그림이기 때문이다.
 *
 * ── 설계에서 중요한 선택 하나 ──
 * 뼈를 Container 로 중첩하지 **않는다**.
 * 중첩하면 자식이 항상 부모 위에 그려지는데, 측면 뷰에서는
 * "먼 쪽 팔은 몸통 뒤, 가까운 쪽 팔은 몸통 앞"이라 계층과 원근이 어긋난다.
 * 그래서 변환은 코드로 직접 계산하고(뼈가 10개 안팎이라 부담 없음),
 * 화면에는 전부 형제로 눕혀 drawOrder 순서대로 붙인다.
 * 덤으로 나중에 스프라이트시트로 렌더링하기도 쉬워진다.
 *
 * ── 좌표 규약 (클립 생성 스크립트와 반드시 일치) ──
 *   화면 y 가 아래라 시계방향이 양수. 각도는 도(degree).
 *   클립에 저장된 각도는 **월드 각도**다 (부모 대비 로컬이 아니다).
 *   뼈 def:
 *     rest   : 그림에서 그 뼈가 원래 향하던 각도. 파츠 회전 = 월드각 - rest.
 *              rest 를 두는 이유는 **클립이 비어 있을 때 원본 그림 그대로**가 되게 하려는 것.
 *              막대기 프로토타입은 +x 를 향해 그리므로 rest = 0 이다.
 *     attach : 부모 관절에서 이 관절까지의 오프셋. **부모의 rest 좌표계** 기준.
 *              사슬 뼈(정강이-허벅지)면 그냥 [부모길이, 0] 이고,
 *              크리처처럼 몸통 아무 데나 붙는 경우도 같은 식으로 표현된다.
 *     unit   : def 전체의 길이 단위. 원본 이미지 픽셀을 그대로 쓰면 unit = 캐릭터 높이.
 *              런타임은 scale/unit 배율 하나로 전부 맞춘다.
 */

const DEG = Math.PI / 180

/** 각도를 최단 경로로 보간한다. 179° -> -179° 를 358° 돌지 않게. */
function lerpAngle(a, b, t) {
  let d = (b - a) % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return a + d * t
}

export class Rig {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} def   bones / drawOrder / clips (+ unit, parts)
   * @param {object} opts  { x, y, scale, bob, textures }
   *   scale    : 캐릭터 높이(픽셀). def.unit 에 대한 배율로 환산된다
   *   bob      : 상하 흔들림 **추가분**. 기본 0 을 권장한다.
   *              진짜 흔들림은 클립에 구워져 있다(IK 가 접지발을 지면에 붙인 채 계산).
   *              여기서 더 주면 root 를 통째로 올리는 것이라 **발이 땅에서 뜬다**
   *   textures : {뼈이름: 텍스처키}. 주면 막대기 대신 그림으로 만든다
   */
  constructor(scene, def, opts = {}) {
    this.scene = scene
    this.def = def
    this.scale = opts.scale ?? 100
    this.bob = opts.bob ?? 0
    this.k = this.scale / (def.unit || 1) // def 단위 -> 화면 픽셀

    this.bones = new Map()
    for (const b of def.bones) this.bones.set(b.name, b)

    this.root = scene.add.container(opts.x ?? 0, opts.y ?? 0)
    this.parts = new Map() // 뼈이름 -> 화면 오브젝트

    // drawOrder 는 뒤에서 앞 순서다. Container 는 add 순서대로 그리므로 그대로 넣는다
    for (const name of def.drawOrder) {
      const tex = opts.textures && opts.textures[name]
      const part = tex ? this._image(name, tex) : this._placeholder(name)
      this.parts.set(name, part)
      this.root.add(part)
    }

    this.clip = null
    this.time = 0
    this.playing = false
    this.play(Object.keys(def.clips)[0])
  }

  /** 파츠 그림이 아직 없을 때 쓰는 색 막대기. 움직임부터 검증하려는 것이다. */
  _placeholder(name) {
    const len = (this.bones.get(name).length || 0.2) * this.scale
    const thick = Math.max(3, this.scale * (name === 'torso' ? 0.11 : 0.055))
    const color = {
      torso: 0x8899aa, head: 0xffddaa,
      armF_up: 0x557799, armF_lo: 0x6688aa,
      legF_thigh: 0x557799, legF_shin: 0x6688aa,
      armN_up: 0xdd8855, armN_lo: 0xeeaa66,
      legN_thigh: 0xdd8855, legN_shin: 0xeeaa66,
    }[name] ?? 0xffffff
    const r = this.scene.add.rectangle(0, 0, len, thick, color)
    r.setOrigin(0, 0.5) // 왼쪽 끝이 관절 = 뼈가 +x 로 뻗는다
    return r
  }

  /**
   * 잘라낸 파츠 그림. 회전 중심을 그림 안의 관절 위치에 맞춘다.
   * def.parts 의 pivot(0~1 비율)이 그 관절이다 — cut_parts.py 가 계산해 넣는다.
   */
  _image(name, texKey) {
    const meta = (this.def.parts || []).find((p) => p.name === name) || {}
    const img = this.scene.add.image(0, 0, texKey)
    const [px, py] = meta.pivot ?? [0, 0.5]
    img.setOrigin(px, py)
    img.setScale(this.k)
    return img
  }

  play(clipName) {
    const c = this.def.clips[clipName]
    if (!c) return
    this.clipName = clipName
    this.clip = c
    this.time = 0
    this.playing = true
    this.apply()
  }

  setFacing(dir) {
    // 데이터는 우향 기준. 좌향은 통째로 뒤집는다
    this.root.setScale(dir < 0 ? -1 : 1, 1)
  }

  update(dtMs) {
    if (!this.playing || !this.clip) return
    this.time += (dtMs / 1000) * this.clip.fps
    const n = this.clip.frames.length
    if (this.clip.loop) this.time %= n
    else if (this.time > n - 1) { this.time = n - 1; this.playing = false }
    this.apply()
  }

  /** 현재 시간의 포즈를 화면에 반영한다. */
  apply() {
    const f = this.clip.frames
    const n = f.length
    const i0 = Math.floor(this.time) % n
    const i1 = (i0 + 1) % n
    const t = this.time - Math.floor(this.time)
    const A = f[i0], B = f[i1]

    // 루트 위치. 클립 단위이므로 k 를 곱한다
    let rx = (A.root[0] + (B.root[0] - A.root[0]) * t) * this.k
    let ry = (A.root[1] + (B.root[1] - A.root[1]) * t) * this.k
    if (this.bob) {
      // 한 사이클에 두 번 오르내린다. 접지 순간이 가장 낮다
      ry -= Math.cos((this.time / n) * 4 * Math.PI) * this.bob * this.scale
    }

    // 월드 각도를 먼저 다 구하고, 그 다음 부모를 따라가며 관절 위치를 잡는다
    const ang = {}
    for (const b of this.def.bones) {
      const a = A.angles[b.name] ?? b.rest ?? 0
      const bb = B.angles[b.name] ?? b.rest ?? 0
      ang[b.name] = lerpAngle(a, bb, t)
    }

    const start = {}
    const resolve = (b) => {
      if (start[b.name]) return start[b.name]
      if (!b.parent) { start[b.name] = { x: rx, y: ry } } else {
        const p = this.bones.get(b.parent)
        const ps = resolve(p)
        // attach 는 **부모의 rest 좌표계** 기준이므로 부모의 월드각으로 돌려준다.
        // 사슬 뼈면 attach = [부모길이, 0] 이라 결국 부모 끝점이 된다
        const [ax, ay] = b.attach ?? [(p.length || 0) * (b.at ?? 1), 0]
        const pa = ang[p.name] * DEG
        const c = Math.cos(pa), s = Math.sin(pa)
        start[b.name] = {
          x: ps.x + (ax * c - ay * s) * this.k,
          y: ps.y + (ax * s + ay * c) * this.k,
        }
      }
      return start[b.name]
    }

    for (const b of this.def.bones) {
      const s = resolve(b)
      const part = this.parts.get(b.name)
      if (!part) continue
      part.x = s.x
      part.y = s.y
      // rest 를 빼야 그림이 원래 향하던 방향이 기준이 된다
      part.rotation = (ang[b.name] - (b.rest ?? 0)) * DEG
    }
  }

  destroy() { this.root.destroy() }
}
