// 룬 획득/장착 — "시안 B: 랜덤 획득 + 스마트 기본값" (HTML 오버레이, 게임 정지)
//
// 흐름: 룬은 이미 랜덤으로 굴려져 있다 → 큰 아이콘으로 보여주고 → **스킬 1탭**으로 장착.
//       룬 선택 단계가 없으므로 최대 1탭. 빈 슬롯이 있는 스킬을 초록으로 추천(스마트 기본값).
//
// 계약:
//   onEquip(skillId, slotIdx)   — slotIdx < 0 이면 빈 슬롯 자동 선택
//   show(rune, skillList)
//     rune      = { id, tier, v, icon, color, tierName, tierColor, label, desc }
//     skillList = [{ id, name, icon, slots:[{icon,tier,tierColor,label,desc}|null,...], freeIdx }]
//   hide()

import './rune-screen.css'

export function createRuneScreen({ onEquip }) {
  let open = false
  let skills = []

  const root = document.createElement('div')
  root.id = 'rune-modal'
  root.className = 'rn-hidden'
  root.innerHTML = `
    <div class="rn-panel">
      <div class="rn-top">
        <div class="rn-kicker">룬 획득</div>
        <div class="rn-got" id="rnGot"></div>
        <div class="rn-sub" id="rnSub">어느 스킬에 장착할까요?</div>
      </div>
      <div class="rn-body" id="rnBody"></div>
    </div>`
  document.body.appendChild(root)

  const bodyEl = root.querySelector('#rnBody')
  const subEl = root.querySelector('#rnSub')
  const gotEl = root.querySelector('#rnGot')

  // 획득 연출 — 큰 아이콘 + 등급 + 굴려진 수치
  function renderGot(r) {
    gotEl.innerHTML = `
      <div class="rn-bigic" style="border-color:${r.tierColor};box-shadow:0 0 18px ${r.tierColor}55">
        ${r.icon}
      </div>
      <div class="rn-gotname" style="color:${r.tierColor}">${r.label}</div>
      <div class="rn-gotdesc">${r.desc}</div>`
  }

  // 스킬 목록 — 각 행에 슬롯 N칸. 빈 슬롯 있으면 추천(hint).
  function renderSkills() {
    bodyEl.innerHTML = skills
      .map((s) => {
        const full = s.freeIdx < 0
        const slotHTML = s.slots
          .map((sl, i) =>
            sl
              ? `<span class="rn-slot filled" data-skill="${s.id}" data-slot="${i}"
                   style="border-color:${sl.tierColor}" title="${sl.label} · ${sl.desc}">${sl.icon}</span>`
              : `<span class="rn-slot" data-skill="${s.id}" data-slot="${i}">+</span>`
          )
          .join('')
        return `<div class="rn-skill ${full ? 'rn-full' : 'rn-hint'}" data-skill="${s.id}" data-slot="-1">
            <div class="rn-ic">${s.icon}</div>
            <div class="rn-info">
              <div class="rn-nm">${s.name}</div>
              <div class="rn-ds">${full ? '슬롯 꽉 참 — 탭한 슬롯을 교체' : '빈 슬롯에 장착'}</div>
            </div>
            <div class="rn-slots">${slotHTML}</div>
          </div>`
      })
      .join('')
  }

  root.addEventListener('click', (e) => {
    // 슬롯을 직접 탭하면 그 자리에 장착(교체), 행을 탭하면 빈 슬롯 자동
    const el = e.target.closest('[data-skill]')
    if (!el) return
    const sid = el.dataset.skill
    const idx = parseInt(el.dataset.slot, 10)
    hide()
    onEquip(sid, isNaN(idx) ? -1 : idx)
  })

  function show(rune, skillList) {
    skills = skillList
    renderGot(rune)
    subEl.textContent = '어느 스킬에 장착할까요? (초록 = 빈 슬롯)'
    renderSkills()
    root.classList.remove('rn-hidden')
    open = true
  }
  function hide() {
    root.classList.add('rn-hidden')
    open = false
  }

  return {
    show,
    hide,
    get isOpen() {
      return open
    },
  }
}
