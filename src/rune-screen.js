// 룬 획득/장착 — 보스 처치 후 2단계. HTML 오버레이(게임 정지).
//
// 계약:
//   onEquip(runeId, skillId)  — 룬을 스킬에 장착
//   show(runeChoices, skillList)
//     runeChoices = [{id,name,icon,desc,color}]  (3개 중 1택)
//     skillList   = [{id,name,icon,curRune}]     (curRune: 현재 장착 룬 이름 or '')
//   hide()

import './rune-screen.css'

export function createRuneScreen({ onEquip }) {
  let open = false
  let chosen = null
  let skills = []

  const root = document.createElement('div')
  root.id = 'rune-modal'
  root.className = 'rn-hidden'
  root.innerHTML = `
    <div class="rn-panel">
      <div class="rn-top">
        <div class="rn-kicker">BOSS 처치 · 룬 획득</div>
        <div class="rn-sub" id="rnSub">룬 하나를 선택하세요</div>
      </div>
      <div class="rn-body" id="rnBody"></div>
    </div>`
  document.body.appendChild(root)

  const bodyEl = root.querySelector('#rnBody')
  const subEl = root.querySelector('#rnSub')

  function renderRunes(runes) {
    subEl.textContent = '룬 하나를 선택하세요'
    bodyEl.innerHTML = runes
      .map(
        (r) => `<div class="rn-card" data-rune="${r.id}">
          <div class="rn-bar" style="background:${r.color}"></div>
          <div class="rn-ic">${r.icon}</div>
          <div class="rn-info"><div class="rn-nm">${r.name}</div><div class="rn-ds">${r.desc}</div></div>
        </div>`
      )
      .join('')
  }

  function renderSkills() {
    const r = chosen
    subEl.innerHTML = `<b style="color:${r.color}">${r.icon} ${r.name}</b> — 어느 스킬에 장착할까요?`
    bodyEl.innerHTML = skills
      .map(
        (s) => `<div class="rn-skill" data-skill="${s.id}">
          <div class="rn-ic">${s.icon}</div>
          <div class="rn-info"><div class="rn-nm">${s.name}</div>
            <div class="rn-ds">${s.curRune ? '현재: ' + s.curRune + ' → 교체' : '빈 슬롯'}</div></div>
        </div>`
      )
      .join('')
  }

  root.addEventListener('click', (e) => {
    const rc = e.target.closest('[data-rune]')
    if (rc) {
      chosen = skills._runes.find((r) => r.id === rc.dataset.rune)
      renderSkills()
      return
    }
    const sc = e.target.closest('[data-skill]')
    if (sc && chosen) {
      const rid = chosen.id
      const sid = sc.dataset.skill
      hide()
      onEquip(rid, sid)
    }
  })

  function show(runeChoices, skillList) {
    chosen = null
    skills = skillList
    skills._runes = runeChoices // 룬 선택 후 참조용
    renderRunes(runeChoices)
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
