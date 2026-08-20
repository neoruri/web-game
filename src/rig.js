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
 * 그래서 변환은 코드로 직접 계산하고(뼈 10개뿐이라 부담 없음),
 * 화면에는 전부 형제로 눕혀 drawOrder 순서대로 붙인다.
 * 덤으로 나중에 스프라이트시트로 렌더링하기도 쉬워진다.
 *
 * ── 좌표 규약 (make_run_clip.py 와 반드시 일치) ──
 *   뼈는 +x 를 향한다 (회전 0 = 오른쪽). 화면 y 가 아래라 시계방향이 양수.
 *   클립에 저장된 각도는 **월드 각도**다. 부모 대비 로컬이 아니다.
 *   길이·좌표는 몸높이 비율이라 scale 만 바꾸면 어떤 크기로도 쓴다.
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
   * @param {object} def   rig-clips.js 의 RIG (bones / drawOrder / clips)
   * @param {object} opts  { x, y, scale, bob }
   *   scale : 몸높이(픽셀). 비율 데이터에 곱해진다
   *   bob   : 골반 상하 흔들림 **추가분**. 기본 0 을 권장한다.
   *           진짜 흔들림은 이미 클립에 구워져 있다(IK 가 접지발을 지면에 붙인 채 계산).
   *           여기서 더 흔들면 root 를 통째로 올리는 것이라 **발이 땅에서 뜬다.**
   *           과장된 만화적 연출이 필요할 때만 쓴다
   */
  constructor(scene, def, opts = {}) {
    this.scene = scene
    this.def = def
    this.scale = opts.scale ?? 100
    this.bob = opts.bob ?? 0

    this.bones = new Map()
    for (const b of def.bones) this.bones.set(b.name, b)

    this.root = scene.add.container(opts.x ?? 0, opts.y ?? 0)
    this.parts = new Map() // 뼈이름 -> 화면 오브젝트

    // drawOrder 는 뒤에서 앞 순서다. Container 는 add 순서대로 그리므로 그대로 넣는다
    for (const name of def.drawOrder) {
      const part = this._placeholder(name)
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
    const len = this.bones.get(name).length * this.scale
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
   * 막대기를 진짜 그림으로 교체한다. 3단계에서 쓴다.
   * @param {string} name    뼈 이름
   * @param {string} texture 텍스처 키
   * @param {object} o  { pivot:[px,py], lengthPx, angle }
   *   pivot    : 그림 안에서 관절이 있는 위치 (0~1 비율). 여기가 회전 중심이 된다
   *   lengthPx : 그림 원본에서 이 뼈의 길이(px). 뼈 길이에 맞춰 자동 축소된다
   *   angle    : 그림이 그려진 방향(도). 아래를 향해 그렸으면 90
   */
  setPart(name, texture, o = {}) {
    const old = this.parts.get(name)
    if (old) { this.root.remove(old); old.destroy() }

    const img = this.scene.add.image(0, 0, texture)
    const [px, py] = o.pivot ?? [0, 0.5]
    img.setOrigin(px, py)
    const boneLen = this.bones.get(name).length * this.scale
    const artLen = o.lengthPx ?? img.width
    img.setScale(boneLen / artLen)
    img.__artAngle = o.angle ?? 0 // 회전할 때 이만큼 빼줘야 그림 방향이 맞는다

    this.parts.set(name, img)
    // drawOrder 위치를 지켜서 다시 넣는다. 안 지키면 앞뒤가 뒤집힌다
    this.root.add(img)
    for (const n of this.def.drawOrder) {
      const p = this.parts.get(n)
      if (p) this.root.bringToTop(p)
    }
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

    // 골반 위치. 접지선이 root 원점이라 root[1] 은 음수(위쪽)다
    let rx = (A.root[0] + (B.root[0] - A.root[0]) * t) * this.scale
    let ry = (A.root[1] + (B.root[1] - A.root[1]) * t) * this.scale
    if (this.bob) {
      // 한 사이클에 두 번 오르내린다. 접지 순간이 가장 낮다
      ry -= Math.cos((this.time / n) * 4 * Math.PI) * this.bob * this.scale
    }

    // 월드 각도를 먼저 다 구하고, 그 다음 부모를 따라가며 관절 위치를 잡는다
    const ang = {}
    for (const b of this.def.bones) {
      ang[b.name] = lerpAngle(A.angles[b.name], B.angles[b.name], t)
    }

    const start = {}
    const resolve = (b) => {
      if (start[b.name]) return start[b.name]
      if (!b.parent) { start[b.name] = { x: rx, y: ry } } else {
        const p = this.bones.get(b.parent)
        const ps = resolve(p)
        // at = 부모 뼈의 몇 % 지점에 붙는가. 팔은 목이 아니라 어깨(몸통 94%)에 달린다
        const pl = p.length * this.scale * (b.at ?? 1)
        const pa = ang[p.name] * DEG
        start[b.name] = { x: ps.x + Math.cos(pa) * pl, y: ps.y + Math.sin(pa) * pl }
      }
      return start[b.name]
    }

    for (const b of this.def.bones) {
      const s = resolve(b)
      const part = this.parts.get(b.name)
      if (!part) continue
      part.x = s.x
      part.y = s.y
      part.rotation = (ang[b.name] - (part.__artAngle ?? 0)) * DEG
    }
  }

  destroy() { this.root.destroy() }
}
