// 밸런스 튜너 — 게임을 iframe 으로 띄워놓고 옆에서 수치를 만진다.
//
// 동작 원리: 값을 바꾸면 localStorage 에 저장한다.
// storage 이벤트는 "값을 바꾼 문서 자신"에는 발생하지 않고 같은 오리진의
// 다른 문서(= iframe 안의 게임)에만 발생한다. 게임은 그 이벤트를 받고 재시작한다.

import './tuner.css'
import { SCHEMA, DEFAULTS, loadConfig, saveConfig, resetConfig } from './config.js'

let cfg = loadConfig()

const groupsEl = document.getElementById('groups')
const statusEl = document.getElementById('status')
const frame = document.getElementById('game')

const inputs = new Map() // "group.field" → { range, number }

function decimals(step) {
  const s = String(step)
  return s.includes('.') ? s.split('.')[1].length : 0
}

function buildField(group, field) {
  const path = `${group.key}.${field.key}`
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

  // 슬라이더는 드래그 중 계속 발생 → 저장이 잦지만 localStorage 쓰기는 싸다.
  range.addEventListener('input', () => commit(range.value))
  number.addEventListener('change', () => commit(number.value))

  wrap.classList.toggle('changed', value !== def)

  row.append(range, number)
  wrap.append(label, row)
  inputs.set(path, { range, number, wrap, def })
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

let flashTimer
function flash(msg) {
  statusEl.textContent = msg
  statusEl.classList.add('on')
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => statusEl.classList.remove('on'), 1200)
}

function restartGame() {
  // iframe 을 다시 로드하면 게임이 새 설정으로 시작한다.
  frame.contentWindow.location.reload()
}

document.getElementById('reset').addEventListener('click', () => {
  if (!confirm('모든 수치를 기본값으로 되돌립니다.')) return
  cfg = resetConfig()
  saveConfig(cfg) // 게임 쪽에 storage 이벤트를 보내기 위해 다시 쓴다
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
