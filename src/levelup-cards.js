// 레벨업 통합 화면 — 성장 카드 + 룬 가방 + 스킬 슬롯을 **한 화면**에 (탭 없음).
//
// 흐름:
//   ① 성장 카드 3장 중 1장 선택 (필수)
//   ② 룬 가방에서 룬을 골라 스킬 슬롯에 장착 (선택사항, 여러 개 가능)
//   ③ "계속" 버튼으로 닫기 → 그때 카드가 적용된다
// 카드를 골라도 화면이 닫히지 않으므로 카드와 룬을 한 번에 처리할 수 있다.
//
// 계약:
//   onPick(card)                   — "계속" 시 선택한 카드 적용
//   onEquipFromBag(bagIdx, skillId, slotIdx) — 가방 룬을 슬롯에 장착(교체 시 기존 룬은 가방으로)
//   getRuneState()                 — { bag:[{...}], skills:[{id,name,icon,slots:[...]}] }
//   show(level, cards)  /  hide()

import './levelup-cards.css'

export function createLevelupScreen({ onPick, onEquipFromBag, getRuneState }) {
  let open = false
  let cards = []
  let picked = -1 // 선택한 카드 index
  let sel = -1 // 선택한 가방 룬 index

  const root = document.createElement('div')
  root.id = 'levelup-modal'
  root.className = 'lv-hidden'
  root.innerHTML = `
    <div class="lv-panel">
      <div class="lv-top">
        <div class="lv-kicker">LEVEL UP</div>
        <div class="lv-no" id="lvNo">Lv 2</div>
      </div>
      <div class="lv-scroll" id="lvScroll"></div>
      <div class="lv-foot" id="lvFoot"></div>
    </div>`
  document.body.appendChild(root)

  const scrollEl = root.querySelector('#lvScroll')
  const footEl = root.querySelector('#lvFoot')
  const noEl = root.querySelector('#lvNo')

  const RAR = { new: '#5bd08a', up: '#e7c15a', pas: '#b58cf0' }
  const TAG = { new: 'NEW', up: 'Lv↑', pas: '패시브' }

  // 가방 룬이 "장착중인 같은 종류 룬"보다 좋은지 (1 좋음 / -1 나쁨 / 0 비교대상 없음)
  function compare(r, skills) {
    let best = null
    for (const s of skills) {
      for (const sl of s.slots) {
        if (sl && sl.id === r.id) best = best === null ? sl.v : Math.max(best, sl.v)
      }
    }
    if (best === null) return 0
    return r.v > best ? 1 : r.v < best ? -1 : 0
  }

  function render() {
    const st = (getRuneState && getRuneState()) || { bag: [], skills: [] }
    const bag = st.bag
    const skills = st.skills
    const nNew = bag.filter((r) => r.isNew).length

    scrollEl.innerHTML = `
      <div class="lv-sechd"><span>성장 카드 — <b>1장 선택</b></span><span class="lv-ln"></span></div>
      <div class="lv-cards">${cards
        .map(
          (c, i) => `<div class="lv-card ${picked === i ? 'sel' : ''}" data-card="${i}">
            <span class="lv-tag" style="color:${RAR[c.kind]}">${c.tag || TAG[c.kind]}</span>
            <div class="lv-ic">${c.icon}</div>
            <div class="lv-nm">${c.name}</div>
            <div class="lv-ds">${c.desc}</div>
          </div>`
        )
        .join('')}</div>

      ${
        bag.length || nNew
          ? `<div class="lv-sechd"><span>룬 가방 <b>${bag.length}</b></span>
              ${nNew ? `<span class="lv-nb">NEW ${nNew}</span>` : ''}
              <span class="lv-ln"></span><span class="lv-hint">▲ 장착중보다 좋음</span></div>
             <div class="lv-bag">${bag
               .map((r, i) => {
                 const c = compare(r, skills)
                 return `<div class="lv-item ${sel === i ? 'sel' : ''}" data-bag="${i}"
                     style="border-color:${r.tierColor}">
                   ${r.isNew ? '<span class="lv-new">NEW</span>' : ''}
                   <div class="lv-iic">${r.icon}</div>
                   <span class="lv-v">${r.short}</span>
                   <span class="lv-tn" style="color:${r.tierColor}">${r.tierName}</span>
                   ${c ? `<span class="lv-cmp ${c > 0 ? 'up' : 'dn'}">${c > 0 ? '▲' : '▼'}</span>` : ''}
                 </div>`
               })
               .join('')}</div>`
          : ''
      }

      <div class="lv-sechd"><span>스킬 슬롯</span><span class="lv-ln"></span>
        <span class="lv-hint">${sel >= 0 ? '넣을 슬롯을 탭' : bag.length ? '룬을 먼저 선택' : ''}</span></div>
      ${skills
        .map((s) => {
          const filled = s.slots.filter(Boolean).length
          return `<div class="lv-srow">
            <div class="lv-sic">${s.icon}</div>
            <div class="lv-sbody"><div class="lv-snm">${s.name}</div>
              <div class="lv-sds">${filled}/${s.slots.length} 칸</div></div>
            <div class="lv-slots">${s.slots
              .map((sl, i) => {
                const t = sel >= 0 ? ' target' : ''
                return sl
                  ? `<div class="lv-slot filled${t}" data-sk="${s.id}" data-si="${i}"
                       style="border-color:${sl.tierColor}" title="${sl.label} · ${sl.desc}">${sl.icon}</div>`
                  : `<div class="lv-slot${t}" data-sk="${s.id}" data-si="${i}"><span class="lv-plus">＋</span></div>`
              })
              .join('')}</div>
          </div>`
        })
        .join('')}`

    // 하단 — 카드 선택 필수, 룬은 선택사항
    if (sel >= 0) {
      const r = bag[sel]
      footEl.innerHTML = `<div class="lv-info"><b>${r.label}</b> ${r.desc} — 넣을 슬롯을 탭하세요</div>
        <button class="lv-btn" data-act="cancel">취소</button>`
    } else {
      footEl.innerHTML = `<div class="lv-info">${
        picked < 0
          ? '성장 카드를 <b>1장</b> 고르세요. 룬 장착은 선택사항입니다.'
          : `<b>${cards[picked].name}</b> 선택됨${nNew ? ` · 아직 <b class="lv-newtx">NEW ${nNew}개</b>` : ''}`
      }</div>
      <button class="lv-btn p" data-act="go" ${picked < 0 ? 'disabled' : ''}>계속</button>`
    }
  }

  root.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')
    if (act) {
      if (act.dataset.act === 'cancel') {
        sel = -1
        render()
      } else if (act.dataset.act === 'go' && picked >= 0) {
        const c = cards[picked]
        hide()
        onPick(c)
      }
      return
    }
    const cd = e.target.closest('[data-card]')
    if (cd) {
      picked = +cd.dataset.card
      render()
      return
    }
    const bi = e.target.closest('[data-bag]')
    if (bi) {
      const i = +bi.dataset.bag
      sel = sel === i ? -1 : i
      render()
      return
    }
    const sl = e.target.closest('[data-sk]')
    if (sl && sel >= 0) {
      const bagIdx = sel
      sel = -1
      onEquipFromBag(bagIdx, sl.dataset.sk, +sl.dataset.si)
      render() // 장착 후 상태 반영
    }
  })

  function show(level, cardList) {
    cards = cardList
    picked = -1
    sel = -1
    noEl.textContent = 'Lv ' + level
    render()
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
    refresh: render,
    get isOpen() {
      return open
    },
  }
}
