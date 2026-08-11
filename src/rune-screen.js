// 룬 획득/장착 — "시안 B: 랜덤 획득 + 스마트 기본값" (HTML 오버레이, 게임 정지)
//
// 흐름: 룬은 이미 랜덤으로 굴려져 있다 → 큰 아이콘으로 보여주고 → **스킬 1탭**으로 장착.
//       룬 선택 단계가 없으므로 최대 1탭. 빈 슬롯이 있는 스킬을 초록으로 추천(스마트 기본값).
//
// ⚠️ 장착은 **선택사항**이다. 예전에는 스킬을 반드시 하나 탭해야 화면이 닫혀서,
//    슬롯이 이미 다 찬 상태에서도 억지로 좋은 룬을 빼고 바꿔야 했다.
//    "가방에 넣기"로 넘기면 판단을 레벨업 화면으로 미룰 수 있다.
//
// 계약:
//   onEquip(skillId, slotIdx)   — slotIdx < 0 이면 빈 슬롯 자동 선택
//                                 skillId 가 null 이면 **장착하지 않고 가방으로**
//   show(rune, skillList)
//     rune      = { id, tier, v, icon, color, tierName, tierColor, label, desc }
//     skillList = [{ id, name, icon, slots:[{icon,tier,tierColor,label,desc}|null,...], freeIdx }]
//   hide()

import './rune-screen.css'

export function createRuneScreen({ onEquip }) {
  let open = false
  let skills = []

  const root = document.createElement('div')
  // scene.restart()로 create()가 다시 돌 때 오버레이가 DOM에 쌓이는 것을 막는다
  document.getElementById('rune-modal')?.remove()
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
      <div class="rn-foot">
        <button class="rn-skip" data-skip="1">가방에 넣기 (나중에 장착)</button>
      </div>
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
              <div class="rn-ds">${full ? '슬롯 꽉 참 — 바꿀 슬롯을 탭 (안 바꿔도 됨)' : '빈 슬롯에 장착'}</div>
            </div>
            <div class="rn-slots">${slotHTML}</div>
          </div>`
      })
      .join('')
  }

  root.addEventListener('click', (e) => {
    // 장착 안 하고 넘기기 — 룬은 가방으로 간다(버리지 않는다)
    if (e.target.closest('[data-skip]')) {
      hide()
      onEquip(null, -1)
      return
    }
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
    // 빈 슬롯이 하나도 없으면 "교체는 선택"임을 먼저 알려준다(억지 교체 방지)
    const anyFree = skillList.some((s) => s.freeIdx >= 0)
    subEl.textContent = anyFree
      ? '어느 스킬에 장착할까요? (초록 = 빈 슬롯)'
      : '슬롯이 모두 찼습니다 — 바꿀 게 없으면 아래로 넘기세요'
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
