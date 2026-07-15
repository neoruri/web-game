// 밸런스 튜너 — 게임을 iframe 으로 띄워놓고 옆에서 수치를 만진다.
//
// 값을 바꾸면 localStorage 에 저장한다. storage 이벤트는 값을 바꾼 문서 자신에는
// 발생하지 않고 같은 오리진의 다른 문서(iframe 안 게임)에만 발생한다 → 게임 재시작.

import './tuner.css'
import {
  SCHEMA,
  DEFAULTS,
  loadConfig,
  saveConfig,
  resetConfig,
  PRESET_SLOTS,
  savePreset,
  loadPreset,
  hasPreset,
} from './config.js'

let cfg = loadConfig()

const groupsEl = document.getElementById('groups')
const statusEl = document.getElementById('status')
const presetsEl = document.getElementById('presets')
const frame = document.getElementById('game')

const inputs = new Map() // "group.field" → { range, number, wrap, def }

function decimals(step) {
  const s = String(step)
  return s.includes('.') ? s.split('.')[1].length : 0
}

function buildField(group, field) {
  const value = cfg[group.key][field.key]
  const def = DEFAULTS[group.key][field.key]
  const dp = decimals(field.step)

  const wrap = document.createElement('div')
  wrap.className = 'field'

  const label = document.createElement('label')
  label.innerHTML = `<span>${field.label}</span><em data-def>기본 ${def}</em>`

  const row = document.createElement('div')
  row.className = 'control'

  const range = document.createElement('input')
  range.type = 'range'
  range.min = field.min
  range.max = field.max
  range.step = field.step
  range.value = value

  const number = document.createElement('input')
  number.type = 'number'
  number.min = field.min
  number.max = field.max
  number.step = field.step
  number.value = value

  const commit = (raw) => {
    let v = parseFloat(raw)
    if (!Number.isFinite(v)) return
    v = Math.min(field.max, Math.max(field.min, v))
    v = parseFloat(v.toFixed(dp))

    cfg[group.key][field.key] = v
    range.value = v
    number.value = v
    wrap.classList.toggle('changed', v !== def)

    saveConfig(cfg)
    flash(`${field.label} = ${v}`)
  }

  range.addEventListener('input', () => commit(range.value))
  number.addEventListener('change', () => commit(number.value))

  wrap.classList.toggle('changed', value !== def)
  row.append(range, number)
  wrap.append(label, row)

  // 올릴 때/내릴 때 뭐가 바뀌는지 설명
  if (field.effect) {
    const fx = document.createElement('p')
    fx.className = 'effect'
    fx.textContent = field.effect
    wrap.append(fx)
  }

  inputs.set(`${group.key}.${field.key}`, { range, number, wrap, def })
  return wrap
}

function build() {
  groupsEl.innerHTML = ''
  inputs.clear()

  for (const group of SCHEMA) {
    const sec = document.createElement('section')
    sec.className = 'group'

    const h = document.createElement('h2')
    h.textContent = group.label
    sec.append(h)

    for (const field of group.fields) sec.append(buildField(group, field))
    groupsEl.append(sec)
  }
}

function syncInputs() {
  for (const group of SCHEMA) {
    for (const field of group.fields) {
      const el = inputs.get(`${group.key}.${field.key}`)
      const v = cfg[group.key][field.key]
      el.range.value = v
      el.number.value = v
      el.wrap.classList.toggle('changed', v !== el.def)
    }
  }
}

// --- 프리셋 A/B/C ----------------------------------------------------------

function buildPresets() {
  presetsEl.innerHTML = ''
  for (const slot of PRESET_SLOTS) {
    const box = document.createElement('div')
    box.className = 'preset-slot'

    const name = document.createElement('span')
    name.className = 'slot-name'
    name.textContent = slot

    const save = document.createElement('button')
    save.textContent = '저장'
    save.title = `현재 값을 ${slot}에 저장`
    save.addEventListener('click', () => {
      savePreset(slot, cfg)
      buildPresets()
      flash(`프리셋 ${slot}에 저장했습니다`)
    })

    const load = document.createElement('button')
    load.textContent = '불러오기'
    load.disabled = !hasPreset(slot)
    load.addEventListener('click', () => {
      const p = loadPreset(slot)
      if (!p) return
      cfg = p
      saveConfig(cfg)
      syncInputs()
      flash(`프리셋 ${slot}을 불러왔습니다`)
    })

    box.append(name, save, load)
    if (hasPreset(slot)) box.classList.add('has')
    presetsEl.append(box)
  }
}

// --- 상태 표시 -------------------------------------------------------------

let flashTimer
function flash(msg) {
  statusEl.textContent = msg
  statusEl.classList.add('on')
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => statusEl.classList.remove('on'), 1400)
}

function restartGame() {
  frame.contentWindow.location.reload()
}

// --- 버튼 ------------------------------------------------------------------

document.getElementById('reset').addEventListener('click', () => {
  if (!confirm('모든 수치를 기본값으로 되돌립니다.')) return
  cfg = resetConfig()
  saveConfig(cfg)
  syncInputs()
  flash('기본값으로 복원했습니다')
})

document.getElementById('restart').addEventListener('click', () => {
  restartGame()
  flash('게임을 재시작했습니다')
})

document.getElementById('copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText(JSON.stringify(cfg, null, 2))
  flash('현재 설정을 클립보드에 복사했습니다')
})

build()
buildPresets()
