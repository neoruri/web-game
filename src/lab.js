// 밸런스 랩 — 튜너에 저장된 값으로 밸런스 곡선을 계산해 그린다.
// 순수 수식이라 플레이 없이 즉시 정확하다 (성장/봇 요소는 다음 단계 시뮬레이터에서).

import './lab.css'
import { loadConfig } from './config.js'

const DUR = 8 * 60 // 8분까지 본다
const SAMPLES = DUR // 1초 간격

function compute(cfg) {
  const minute = (t) => Math.floor(t / 60)

  const spawnMult = (t) =>
    Math.min(Math.pow(cfg.spawn.rampPerMin, minute(t)), cfg.spawn.rampCap)
  const enemyHP = (t) => cfg.enemy.hp * Math.pow(cfg.enemy.hpRampPerMin, minute(t))
  const bossHP = (t) => cfg.boss.hp * Math.pow(cfg.boss.hpRampPerMin, minute(t))

  // 초당 밀려오는 총 체력 = 잡몹 유입 + 보스 평균 기여
  const influx = (t) => {
    const rate = spawnMult(t) / cfg.spawn.baseInterval // 마리/초
    // 보스는 첫 등장(everySec) 이후부터 평균 기여로 반영. 그 전엔 0.
    const boss = t >= cfg.boss.everySec ? bossHP(t) / cfg.boss.everySec : 0
    return rate * enemyHP(t) + boss
  }

  // 성장 없는 기본 처치력(초당 딜). 관통은 단일 대상엔 1이므로 제외한 하한.
  const baseDPS = cfg.weapon.damage / cfg.weapon.cooldown

  const series = []
  for (let i = 0; i <= SAMPLES; i++) {
    const t = (i / SAMPLES) * DUR
    series.push({ t, influx: influx(t) })
  }

  // 유입이 기본 처치력을 처음 넘는 시점
  let crossT = null
  for (const p of series) {
    if (p.influx > baseDPS) {
      crossT = p.t
      break
    }
  }

  return { series, baseDPS, crossT, spawnMult, enemyHP, bossHP, minute }
}

function fmtTime(sec) {
  const s = Math.round(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// --- 차트 ------------------------------------------------------------------

function drawChart(canvas, data) {
  const ctx = canvas.getContext('2d')
  const W = canvas.width
  const H = canvas.height
  const pad = { l: 64, r: 20, t: 20, b: 40 }
  const plotW = W - pad.l - pad.r
  const plotH = H - pad.t - pad.b

  ctx.clearRect(0, 0, W, H)

  const maxInflux = Math.max(...data.series.map((p) => p.influx), data.baseDPS)
  const yMax = maxInflux * 1.1

  const xOf = (t) => pad.l + (t / DUR) * plotW
  const yOf = (v) => pad.t + plotH - (v / yMax) * plotH

  // 격자 + 축 라벨
  ctx.strokeStyle = '#313244'
  ctx.fillStyle = '#6c7086'
  ctx.font = '12px Arial'
  ctx.lineWidth = 1

  for (let m = 0; m <= 8; m++) {
    const x = xOf(m * 60)
    ctx.beginPath()
    ctx.moveTo(x, pad.t)
    ctx.lineTo(x, pad.t + plotH)
    ctx.stroke()
    ctx.textAlign = 'center'
    ctx.fillText(`${m}분`, x, H - pad.b + 18)
  }

  for (let g = 0; g <= 4; g++) {
    const v = (yMax / 4) * g
    const y = yOf(v)
    ctx.strokeStyle = '#26263a'
    ctx.beginPath()
    ctx.moveTo(pad.l, y)
    ctx.lineTo(pad.l + plotW, y)
    ctx.stroke()
    ctx.fillStyle = '#6c7086'
    ctx.textAlign = 'right'
    ctx.fillText(Math.round(v), pad.l - 8, y + 4)
  }

  // 기본 처치력(수평 파란선)
  const yBase = yOf(data.baseDPS)
  ctx.strokeStyle = '#89b4fa'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(pad.l, yBase)
  ctx.lineTo(pad.l + plotW, yBase)
  ctx.stroke()

  // 유입 곡선(빨강)
  ctx.strokeStyle = '#f38ba8'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  data.series.forEach((p, i) => {
    const x = xOf(p.t)
    const y = yOf(p.influx)
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.stroke()

  // 교차점 표시
  if (data.crossT != null) {
    const x = xOf(data.crossT)
    ctx.strokeStyle = '#f9e2af'
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    ctx.moveTo(x, pad.t)
    ctx.lineTo(x, pad.t + plotH)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#f9e2af'
    ctx.textAlign = 'center'
    ctx.fillText(`한계 ${fmtTime(data.crossT)}`, x, pad.t + 12)
  }
}

// --- 지표 표 ---------------------------------------------------------------

function fillMetrics(cfg, data) {
  const tbody = document.getElementById('metrics')
  const dps = data.baseDPS
  const startInflux = data.series[0].influx
  const min2 = data.series.find((p) => p.t >= 120)?.influx ?? 0

  const rows = [
    [
      '기본 처치력 (DPS)',
      '성장 없는 초당 딜 = 데미지 ÷ 쿨다운',
      `${dps.toFixed(1)} /초`,
    ],
    [
      '시작 압력',
      '0분 시점 초당 유입 체력',
      `${startInflux.toFixed(1)} /초  (여유 ${(dps - startInflux).toFixed(1)})`,
    ],
    [
      '2분 압력',
      '2분 시점 초당 유입 체력',
      `${min2.toFixed(1)} /초  ${min2 > dps ? '⚠ 처치력 초과' : '여유 있음'}`,
    ],
    [
      '맨몸 한계',
      '성장 없이 버티는 시점 (빠르면 가혹)',
      data.crossT != null ? fmtTime(data.crossT) : '8분+ (매우 여유)',
    ],
    ['목표 (예시)', 'PM이 정할 기준선', '2분 위기 · 5~8분 클리어'],
  ]

  tbody.innerHTML = rows
    .map(
      ([a, b, c]) =>
        `<tr><td>${a}</td><td class="muted">${b}</td><td class="val">${c}</td></tr>`
    )
    .join('')
}

function fillLegend() {
  document.getElementById('legend').innerHTML = `
    <span><i style="background:#f38ba8"></i>유입 (초당 밀려오는 적 체력)</span>
    <span><i style="background:#89b4fa"></i>기본 처치력 (성장 없는 하한)</span>
    <span><i style="background:#f9e2af"></i>맨몸 한계 (교차점)</span>`
}

// --- 실행 ------------------------------------------------------------------

function render() {
  const cfg = loadConfig()
  const data = compute(cfg)
  drawChart(document.getElementById('chart'), data)
  fillMetrics(cfg, data)
  fillLegend()

  const note = document.getElementById('crossNote')
  if (data.crossT == null) {
    note.textContent =
      '8분 내내 유입이 기본 처치력을 넘지 않습니다. 성장 없이도 버티는 쉬운 세팅입니다.'
  } else {
    note.textContent = `맨몸 한계: ${fmtTime(
      data.crossT
    )} — 이 시점부터는 레벨업으로 딜을 올려야 밀리지 않습니다.`
  }
}

document.getElementById('reload').addEventListener('click', render)
render()
