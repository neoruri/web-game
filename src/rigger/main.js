/**
 * 스프라이트 리거 (/rigger.html) — 그림 한 장을 파츠로 자르고 뼈를 붙인다.
 *
 * 왜 만들었나:
 *   이전에는 격자를 씌운 이미지를 눈으로 읽어 폴리곤 좌표를 손으로 옮겨 적었다.
 *   크리처 한 마리 작업하며 나온 버그가 대부분 그 과정에서 나왔다 —
 *   꼬리를 50px 어긋나게 읽어 조각만 잘리고, 치마 자락을 허벅지로 오인하고,
 *   무릎 위를 정강이가 삼켜서 "허벅지는 안 움직이고 무릎만 꺾이는" 결과가 나왔다.
 *   마우스로 찍고 그 자리에서 결과를 보면 그 종류의 실수가 통째로 사라진다.
 *
 * 자르기·진단 로직은 cut_parts.py 와 같은 규칙이고, 뼈 계산은 게임과 같은
 * rig-core.js 를 쓴다. 도구와 게임이 갈라지지 않게 하려는 것이다.
 */
import { Anim } from './anim.js'
import { ALPHA_RULES, cut, diagnose } from './cutter.js'
import { Editor } from './editor.js'
import { Poser } from './poser.js'
import { buildRig, makeIdle, restAngles } from './rigdef.js'

const $ = (id) => document.getElementById(id)

const app = {
  image: null,       // ImageData
  bitmap: null,      // 화면에 그릴 원본
  srcName: '',
  parts: [],
  activeIdx: 0,
  cuts: [],
  rig: null,
  space: false,
  poseAngles: {},
  activePart() { return this.parts[this.activeIdx] || null },
}

const editor = new Editor($('edit'), app)
const poser = new Poser($('preview'))
const stage = new Poser($('stage'))
const anim = new Anim(app, stage)
let recutTimer = null
let idleClip = null
let animT = 0
let tab = 'cut'

function setTab(t) {
  tab = t
  $('tabCut').classList.toggle('on', t === 'cut')
  $('tabAnim').classList.toggle('on', t === 'anim')
  $('center').hidden = t !== 'cut'
  $('animPane').hidden = t !== 'anim'
  $('pvPanel').hidden = t !== 'cut'
  $('cutDiagPanel').hidden = t !== 'cut'
  $('motionPanel').hidden = t !== 'anim'
  if (t === 'anim') { anim.sync(); anim.render(); anim.diagnose() }
}

// ── 파츠 ──────────────────────────────────────────────────────────────
function newPart(name, isBody = false) {
  return {
    name, poly: [], joint: null, parent: null,
    alphaRule: 'normal', jointR: 110, smooth: false, isBody,
  }
}

function ensureBody() {
  // catch-all 은 항상 하나 있어야 한다. 폴리곤이 없는 나머지를 전부 받는다
  if (!app.parts.some((p) => p.isBody)) app.parts.push(newPart('body', true))
}

function addPart() {
  let i = 1
  while (app.parts.some((p) => p.name === `part${i}`)) i++
  const p = newPart(`part${i}`)
  const bodyAt = app.parts.findIndex((q) => q.isBody)
  app.parts.splice(bodyAt < 0 ? app.parts.length : bodyAt, 0, p)
  app.activeIdx = app.parts.indexOf(p)
  setMode('draw')
  touch()
}

// ── 이미지 ────────────────────────────────────────────────────────────
async function loadImage(file) {
  const bmp = await createImageBitmap(file)
  const c = document.createElement('canvas')
  c.width = bmp.width
  c.height = bmp.height
  const g = c.getContext('2d', { willReadFrequently: true })
  g.drawImage(bmp, 0, 0)
  app.image = g.getImageData(0, 0, bmp.width, bmp.height)
  app.bitmap = bmp
  app.srcName = file.name
  $('srcName').textContent = `${file.name}  ${bmp.width}×${bmp.height}`
  ensureBody()
  editor.fit()
  recut()
}

// ── 자르기 · 진단 ─────────────────────────────────────────────────────
function recut() {
  if (!app.image) return
  const usable = app.parts.filter((p) => p.isBody || p.poly.length >= 3)
  if (!usable.length) return
  const t0 = performance.now()
  const res = cut(app.image, usable, { keepIslands: new Set(keepIslandNames()) })
  app.cuts = res.parts

  // body 는 뿌리 뼈라 관절이 있어야 다른 파츠가 매달린다.
  // 없으면 미리보기에 아무것도 안 나오는데 이유를 알기 어려우므로 일단 가운데에 놓아둔다.
  // 골반 같은 제대로 된 위치는 사용자가 [관절 놓기] 로 옮기면 된다
  const bp = app.parts.find((p) => p.isBody)
  const bc = res.parts.find((c) => c.name === bp?.name && !c.empty)
  if (bp && !bp.joint && bc) {
    bp.joint = [Math.round(bc.offset[0] + bc.size[0] / 2),
                Math.round(bc.offset[1] + bc.size[1] / 2)]
  }
  const diag = diagnose(res.masks, app.image.width, app.image.height)
  renderDiag(diag, res.dropped, performance.now() - t0)
  buildRigFromParts()
  renderPreview()
  renderList()
  editor.render() // 밖에서 parts 를 직접 바꿔 넣는 경우(불러오기 등)에도 화면이 맞게
}

function keepIslandNames() {
  // 원본부터 떨어져 있는 그림이 있는 파츠. 발광체는 대개 그렇다(불티)
  return app.parts.filter((p) => p.alphaRule === 'glow').map((p) => p.name)
}

function buildRigFromParts() {
  const withJoint = app.parts.filter((p) => p.joint)
  if (!withJoint.length) { app.rig = null; return }
  // 접지점 = 발이 닿는 곳. 여기를 원점으로 삼아야 게임에 놓기 편하다.
  // x 는 전체 폭의 가운데가 아니라 **아래쪽 10% 구간(=발)의 가운데**를 쓴다 —
  // 이 크리처처럼 한쪽에 불꽃을 들고 있으면 전체 중심이 그쪽으로 끌려간다
  const { width: w, height: h } = app.image
  const real = app.cuts.filter((c) => !c.empty)
  if (!real.length) { app.rig = null; return }
  const top = Math.min(...real.map((c) => c.offset[1]))
  const bottom = Math.max(...real.map((c) => c.offset[1] + c.size[1]))
  const footY = bottom - (bottom - top) * 0.1
  let fx0 = w, fx1 = 0
  for (const c of real) {
    if (c.offset[1] + c.size[1] < footY) continue
    fx0 = Math.min(fx0, c.offset[0])
    fx1 = Math.max(fx1, c.offset[0] + c.size[0])
  }
  const cx = fx1 > fx0 ? (fx0 + fx1) / 2 : w / 2
  app.rig = buildRig(withJoint, { unit: Math.max(1, bottom - top), ground: [cx, bottom] })
  idleClip = makeIdle(app.rig)
  if ($('poseMode').value === 'rest') app.poseAngles = restAngles(app.rig)
  renderBoneSliders()
  anim.sync()
}

function renderDiag(diag, dropped, ms) {
  const el = $('diag')
  const parts = []
  if (dropped.length) {
    const tot = dropped.reduce((s, d) => s + d.area, 0)
    parts.push(`<h4>걷어낸 부스러기 ${dropped.length}개 / ${tot}px</h4>`)
    parts.push(dropped.slice(0, 6).map((d) =>
      `<div class="row"><span class="tag">${d.name}</span><span class="num">${d.area}px</span></div>`).join(''))
  }
  parts.push(`<h4>떨어진 조각 ${diag.islands.length}개</h4>`)
  parts.push(diag.islands.length
    ? diag.islands.slice(0, 10).map((s) =>
        `<div class="row" data-box="${s.box.join(',')}"><span class="tag">${s.name}</span>` +
        `<span class="num">${s.area}px</span><span class="num">(${s.box[0]},${s.box[1]})</span></div>`).join('')
    : '<div class="row good">없음</div>')

  parts.push('<h4>중복 소유</h4>')
  parts.push(diag.dupes.length
    ? diag.dupes.slice(0, 12).map((d) =>
        `<div class="row${d.hot ? ' hot' : ''}"><span class="tag">${d.a} ∩ ${d.b}</span>` +
        `<span class="num">${(d.ra * 100).toFixed(0)}% / ${(d.rb * 100).toFixed(0)}%</span></div>`).join('')
    : '<div class="row good">없음</div>')
  el.innerHTML = parts.join('')
  $('diagSum').textContent = `${ms.toFixed(0)}ms`

  el.querySelectorAll('[data-box]').forEach((row) => {
    row.onclick = () => {
      const [x0, y0, x1, y1] = row.dataset.box.split(',').map(Number)
      const c = $('edit')
      editor.view.z = Math.min(12, c.width / Math.max(40, (x1 - x0) * 4))
      editor.view.x = c.width / 2 - ((x0 + x1) / 2) * editor.view.z
      editor.view.y = c.height / 2 - ((y0 + y1) / 2) * editor.view.z
      editor.render()
    }
  })
}

// ── 미리보기 ──────────────────────────────────────────────────────────
function renderPreview() {
  if (!app.rig) { poser.g.clearRect(0, 0, 330, 330); return }
  poser.showBones = $('pvBones').checked
  const order = app.parts.map((p) => p.name)
  const mode = $('poseMode').value
  if (mode === 'idle' && idleClip) {
    poser.drawClip(app.rig, app.cuts, order, idleClip, animT,
      { height: 260, groundY: 300 })
  } else {
    poser.draw(app.rig, app.cuts, order, app.poseAngles, app.rig.rootOffset,
      { height: 260, groundY: 300 })
  }
}

function renderBoneSliders() {
  const box = $('boneSliders')
  if ($('poseMode').value !== 'manual' || !app.rig) { box.innerHTML = ''; return }
  box.innerHTML = app.rig.bones.map((b) => `
    <label><span>${b.name}</span>
      <input type="range" data-b="${b.name}" min="-90" max="90" step="1" value="0" />
      <span class="v" id="v_${b.name}">0°</span></label>`).join('')
  box.querySelectorAll('input').forEach((el) => {
    el.oninput = () => {
      const name = el.dataset.b
      const rest = app.rig.bones.find((b) => b.name === name).rest
      app.poseAngles[name] = rest + Number(el.value)
      $(`v_${name}`).textContent = `${el.value}°`
      renderPreview()
    }
  })
}

// ── 목록 · 속성 ───────────────────────────────────────────────────────
function renderList() {
  const ul = $('partList')
  const byName = new Map(app.cuts.map((c) => [c.name, c]))
  ul.innerHTML = app.parts.map((p, i) => {
    const c = byName.get(p.name)
    // 뭐가 빠졌는지 목록에서 바로 보이게 한다. 크기만 보여주면 관절을 빼먹은 걸 못 챈다
    const info = p.isBody ? '나머지 전부'
      : p.poly.length < 3 ? `점 ${p.poly.length}개`
      : !p.joint ? '관절 없음'
      : !p.parent ? '부모 없음'
      : c && !c.empty ? `${c.size[0]}×${c.size[1]}`
      : '빈 영역'
    const bad = !p.isBody && (!p.joint || !p.parent || p.poly.length < 3 || (c && c.empty))
    return `<li data-i="${i}" class="${i === app.activeIdx ? 'on' : ''} ${p.isBody ? 'body' : ''}">
      <span class="nm">${p.name}</span>
      <span class="cnt ${bad ? 'bad' : ''}">${info}</span>
      <button class="mini" data-up="${i}">↑</button>
      <button class="mini" data-dn="${i}">↓</button>
    </li>`
  }).join('')
  ul.querySelectorAll('li').forEach((li) => {
    li.onclick = (e) => {
      if (e.target.dataset.up !== undefined) { move(+e.target.dataset.up, -1); return }
      if (e.target.dataset.dn !== undefined) { move(+e.target.dataset.dn, +1); return }
      app.activeIdx = +li.dataset.i
      touch()
    }
  })
  renderProps()
  renderGuide()
}

function move(i, d) {
  const j = i + d
  if (j < 0 || j >= app.parts.length) return
  const [p] = app.parts.splice(i, 1)
  app.parts.splice(j, 0, p)
  app.activeIdx = j
  touch()
  renderPreview()
}

/**
 * "지금 뭘 해야 하는가"를 한 줄로 띄우고, 눌러야 할 버튼을 깜빡인다.
 * 버튼만 늘어놓으니 관절을 안 놓고 넘어가는 일이 생겼다 — 순서를 화면이 알려줘야 한다.
 */
function renderGuide() {
  const g = $('guide'), t = $('guideText')
  for (const id of ['btnAdd', 'mDraw', 'mJoint']) $(id).classList.remove('need')
  g.classList.remove('done')

  const say = (step, html, needId) => {
    g.querySelector('b').textContent = step
    t.innerHTML = html
    if (needId) $(needId).classList.add('need')
  }

  if (!app.image) return say('①', '이미지를 아래 영역에 <b>끌어다 놓으세요</b>')

  const real = app.parts.filter((p) => !p.isBody)
  if (!real.length) return say('②', '<kbd>+ 추가</kbd> 를 눌러 첫 파츠를 만드세요 (머리·팔 등)', 'btnAdd')

  const p = app.activePart()
  if (!p) return say('②', '왼쪽에서 파츠를 고르세요')
  if (p.isBody) {
    return say('·', '<b>body</b> 는 폴리곤에 안 들어간 나머지를 전부 받습니다. 외곽을 그릴 필요는 없지만, '
      + '<b>뿌리 관절</b>은 있어야 합니다 — 지금은 자동으로 가운데에 놓여 있고, '
      + '<kbd>관절 놓기</kbd> 로 골반 위치로 옮기면 됩니다.')
  }
  if (p.poly.length < 3) {
    return say('③', `<kbd>점 찍기</kbd> 로 <b>${p.name}</b> 의 외곽을 클릭하세요 `
      + `(지금 ${p.poly.length}점 — 3점 이상 필요). 대충 넉넉하게 감싸도 됩니다.`, 'mDraw')
  }
  if (!p.joint) {
    return say('④', `<kbd>관절 놓기</kbd> 를 누르고 <b>${p.name}</b> 이 <b>회전할 중심</b>을 클릭하세요. `
      + '팔이면 어깨, 정강이면 무릎입니다.', 'mJoint')
  }
  if (!p.parent) {
    return say('⑤', `왼쪽 아래 <b>부모</b> 에서 <b>${p.name}</b> 이 매달릴 뼈를 고르세요 `
      + '(팔·다리·머리는 보통 body).')
  }
  const left = real.filter((q) => q.poly.length < 3 || !q.joint || !q.parent)
  if (left.length) {
    return say('✔', `<b>${p.name}</b> 준비됨. 남은 파츠: ${left.map((q) => q.name).join(', ')}`)
  }
  g.classList.add('done')
  say('✔', `파츠 ${real.length}개 모두 준비됐습니다. 오른쪽 <b>미리보기</b>가 원본과 같으면 `
    + '<kbd>내보내기</kbd> 하세요.')
}

function renderProps() {
  const p = app.activePart()
  const box = $('props')
  if (!p) { box.innerHTML = '<p class="hint">파츠를 선택하세요</p>'; return }
  const others = app.parts.filter((q) => q !== p)
  box.innerHTML = `
    <label>이름 <input type="text" id="pName" value="${p.name}" /></label>
    <label>부모
      <select id="pParent">
        <option value="">(없음 — 루트)</option>
        ${others.map((q) => `<option value="${q.name}" ${p.parent === q.name ? 'selected' : ''}>${q.name}</option>`).join('')}
      </select></label>
    ${p.isBody ? '' : `
    <label>알파 규칙
      <select id="pAlpha">
        ${Object.entries(ALPHA_RULES).map(([k, v]) =>
          `<option value="${k}" ${p.alphaRule === k ? 'selected' : ''}>${v}</option>`).join('')}
      </select></label>
    <label>관절 겹침 반경
      <input type="number" id="pJR" value="${p.jointR}" min="0" max="400" step="5" /></label>
    <label><span>곡선으로 잇기</span>
      <input type="checkbox" id="pSmooth" ${p.smooth ? 'checked' : ''} /></label>
    <label><span>관절</span>
      <span class="num">${p.joint ? p.joint.join(', ') : '없음 — 놓아야 함'}</span></label>
    <label><span>방향점</span>
      <span class="num">${p.tip ? p.tip.join(', ')
        : (app.parts.some((q) => q.parent === p.name) ? '자식에서 자동' : '없음 (rest 0°)')}</span></label>
    <button id="pDel" class="mini">이 파츠 삭제</button>`}
    ${p.isBody ? '<p class="hint">폴리곤에 안 들어간 나머지를 전부 받습니다. 순서만 바꿀 수 있습니다.</p>' : ''}`

  const bind = (id, fn) => { const el = $(id); if (el) el.onchange = fn }
  bind('pName', (e) => { p.name = e.target.value.trim() || p.name; recut() })
  bind('pParent', (e) => { p.parent = e.target.value || null; recut() })
  bind('pAlpha', (e) => { p.alphaRule = e.target.value; recut() })
  bind('pJR', (e) => { p.jointR = Number(e.target.value); recut() })
  bind('pSmooth', (e) => { p.smooth = e.target.checked; touch(); recut() })
  const del = $('pDel')
  if (del) del.onclick = () => {
    app.parts.splice(app.activeIdx, 1)
    app.activeIdx = Math.max(0, app.activeIdx - 1)
    touch(); recut()
  }
}

// ── 모드 · 상태 ───────────────────────────────────────────────────────
function setMode(m) {
  editor.mode = m
  for (const [id, k] of [['mEdit', 'edit'], ['mDraw', 'draw'],
                         ['mJoint', 'joint'], ['mTip', 'tip']]) {
    $(id).classList.toggle('on', m === k)
  }
}

function touch() {
  editor.render()
  renderList()
  clearTimeout(recutTimer)
  recutTimer = setTimeout(recut, 260) // 점을 끌 때마다 자르면 무거우니 잠깐 모은다
}

app.touch = touch
app.recut = recut
app.setMode = setMode
app.showCoord = (p) => {
  $('coord').textContent = `${Math.round(p[0])}, ${Math.round(p[1])}`
}

// ── 내보내기 ──────────────────────────────────────────────────────────
async function exportAll() {
  if (!app.rig || !app.cuts.length) { alert('먼저 파츠를 자르고 관절을 놓으세요'); return }
  const base = (app.srcName.replace(/\.[^.]+$/, '') || 'creature')
    .replace(/[^a-zA-Z0-9_-]/g, '_')

  const meta = {
    source: app.srcName,
    imageSize: [app.image.width, app.image.height],
    unit: app.rig.unit,
    rootOffset: app.rig.rootOffset,
    drawOrder: app.parts.map((p) => p.name),
    bones: app.rig.bones,
    parts: app.cuts.filter((c) => !c.empty).map((c) => ({
      name: c.name, file: `${c.name}.png`,
      size: c.size, offset: c.offset,
      pivot: c.pivot.map((v) => +v.toFixed(4)),
    })),
    // 손으로 만든 클립이 있으면 그걸 쓰고, 없으면 확인용 자동 idle 만 넣는다
    clips: Object.keys(anim.baked()).length ? anim.baked() : { idle: idleClip },
  }

  // 폴더에 바로 쓰기(크롬). 안 되면 낱개 다운로드로 떨어진다
  let dir = null
  if (window.showDirectoryPicker) {
    try { dir = await window.showDirectoryPicker({ mode: 'readwrite' }) } catch { /* 취소 */ }
  }
  const put = async (name, blob) => {
    if (dir) {
      const fh = await dir.getFileHandle(name, { create: true })
      const ws = await fh.createWritable()
      await ws.write(blob)
      await ws.close()
    } else {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = name
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 4000)
    }
  }

  for (const c of app.cuts) {
    if (c.empty) continue
    const blob = await new Promise((r) => c.canvas.toBlob(r, 'image/png'))
    await put(`${c.name}.png`, blob)
  }
  await put(`${base}.rig.json`,
    new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' }))
  alert(dir ? '선택한 폴더에 저장했습니다.' : '다운로드 폴더에 저장했습니다.')
}

function saveProject() {
  const proj = {
    v: 2, srcName: app.srcName,
    parts: app.parts.map((p) => ({ ...p })),
    clips: anim.clips, groundBones: anim.groundBones,
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([JSON.stringify(proj, null, 2)],
    { type: 'application/json' }))
  a.download = `${(app.srcName.replace(/\.[^.]+$/, '') || 'rig')}.rigproj.json`
  a.click()
}

// ── 배선 ──────────────────────────────────────────────────────────────
$('tabCut').onclick = () => setTab('cut')
$('tabAnim').onclick = () => setTab('anim')
$('btnAdd').onclick = addPart
$('mEdit').onclick = () => setMode('edit')
$('mDraw').onclick = () => setMode('draw')
$('mJoint').onclick = () => setMode('joint')
$('mTip').onclick = () => setMode('tip')
$('btnFit').onclick = () => editor.fit()
$('btnExport').onclick = exportAll
$('btnSaveProj').onclick = saveProject
$('btnNew').onclick = () => $('filePick').click()
$('btnLoad').onclick = () => $('projPick').click()
$('pvBones').onchange = renderPreview
$('poseMode').onchange = () => {
  if ($('poseMode').value === 'rest' && app.rig) app.poseAngles = restAngles(app.rig)
  renderBoneSliders()
  renderPreview()
}

$('filePick').onchange = (e) => e.target.files[0] && loadImage(e.target.files[0])
$('projPick').onchange = async (e) => {
  const f = e.target.files[0]
  if (!f) return
  const proj = JSON.parse(await f.text())
  app.parts = proj.parts.map((p) => ({ ...newPart(p.name, p.isBody), ...p }))
  app.activeIdx = 0
  if (proj.clips && Object.keys(proj.clips).length) {
    anim.clips = proj.clips
    anim.clipName = Object.keys(proj.clips)[0]
    anim.groundBones = proj.groundBones || []
  }
  ensureBody()
  touch(); recut()
}

// 드래그&드롭
const drop = $('edit')
;['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => {
  e.preventDefault(); drop.classList.add('drop')
}))
;['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => {
  e.preventDefault(); drop.classList.remove('drop')
}))
drop.addEventListener('drop', (e) => {
  const f = e.dataTransfer.files[0]
  if (f) loadImage(f)
})

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { app.space = true; e.preventDefault() }
  if (e.key === '1') setMode('edit')
  if (e.key === '2') setMode('draw')
  if (e.key === '3') setMode('joint')
  if (e.key === '4') setMode('tip')
})
window.addEventListener('keyup', (e) => { if (e.code === 'Space') app.space = false })

let last = performance.now()
function tick(now) {
  const dt = Math.min(64, now - last)
  last = now
  if (tab === 'anim') {
    anim.tick(dt)
  } else if ($('poseMode').value === 'idle' && idleClip) {
    animT = (animT + idleClip.fps / 60) % idleClip.frames.length
    renderPreview()
  }
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)

ensureBody()
renderList()
renderGuide()
editor.render()
// 자동 검증·디버그용 훅
window.__rigger = Object.assign(app, { exportAll, buildRigFromParts, setMode, setTab, anim })
