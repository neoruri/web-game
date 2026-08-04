// 레벨업 3택 카드 — 뱀서류 표준. HTML 오버레이(게임 위 정지 화면).
//
// 계약:
//   onPick(card)  — 카드 하나 선택 (card = {kind,id,name,icon,desc,tag})
//   show(level, cards)  — 카드 3장 표시 (게임은 main이 정지시킴)
//   hide()
//
// 카드 kind: 'new'(신규 해금) | 'up'(레벨업) | 'pas'(패시브)

import './levelup-cards.css'

export function createLevelupScreen({ onPick }) {
  let open = false

  const root = document.createElement('div')
  root.id = 'levelup-modal'
  root.className = 'lv-hidden'
  root.innerHTML = `
    <div class="lv-panel">
      <div class="lv-top">
        <div class="lv-kicker">LEVEL UP</div>
        <div class="lv-no" id="lvNo">Lv 2</div>
        <div class="lv-sub">카드를 하나 선택하세요</div>
      </div>
      <div class="lv-cards" id="lvCards"></div>
    </div>`
  document.body.appendChild(root)

  const cardsEl = root.querySelector('#lvCards')
  const noEl = root.querySelector('#lvNo')

  const RAR = { new: '#5bd08a', up: '#e7c15a', pas: '#b58cf0' }
  const TAG = { new: 'NEW 해금', up: '레벨 ↑', pas: '패시브' }
  const TAGCLS = { new: 't-new', up: 't-up', pas: 't-pas' }

  function cardHTML(c) {
    return `<div class="lv-card" data-idx="${c._idx}">
      <div class="lv-rar" style="background:${RAR[c.kind]}"></div>
      <div class="lv-ic">${c.icon}</div>
      <div class="lv-body">
        <div class="lv-nm">${c.name}<span class="lv-tag ${TAGCLS[c.kind]}">${c.tag || TAG[c.kind]}</span></div>
        <div class="lv-ds">${c.desc}</div>
      </div>
    </div>`
  }

  let currentCards = []
  root.addEventListener('click', (e) => {
    const el = e.target.closest('.lv-card')
    if (!el) return
    const c = currentCards[+el.dataset.idx]
    if (!c) return
    hide()
    onPick(c)
  })

  function show(level, cards) {
    currentCards = cards
    cards.forEach((c, i) => (c._idx = i))
    noEl.textContent = 'Lv ' + level
    cardsEl.innerHTML = cards.map(cardHTML).join('')
    root.classList.remove('lv-hidden')
    open = true
  }

  function hide() {
    root.classList.add('lv-hidden')
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
