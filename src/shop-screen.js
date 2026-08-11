// 상점 — 골드로 시작 스탯을 영구 강화한다. 결과 화면에서 들어온다.
//
// 왜 사망 직후인가: 이미 게임이 멈춰 있고, 방금 번 골드가 눈앞에 있고,
// "다시 하기"를 누르기 직전이다 → 강화를 사고 바로 그 효과를 시험하는 흐름이 된다.
// 별도 메뉴로 빼면 아무도 안 들어간다.
//
// 계약:
//   createShopScreen({ getGold, getMeta, onBuy, onClose })
//     getGold() → number            현재 보유 골드
//     getMeta() → { id: level }     업그레이드 레벨
//     onBuy(id) → { ok, gold, meta, reason }   구매 처리(골드 차감·저장까지 호출측 담당)
//     onClose()                     닫기 → 결과 화면으로 돌아간다
//   show() / hide() / get isOpen

import './shop-screen.css'
import { UPGRADES, UPGRADE_IDS, costOf, valueOf, spentOn } from './meta.js'

export function createShopScreen({ getGold, getMeta, onBuy, onClose }) {
  let open = false

  document.getElementById('shop-modal')?.remove()
  const root = document.createElement('div')
  root.id = 'shop-modal'
  root.className = 'sh-hidden'
  document.body.appendChild(root)

  function fmt(n) {
    return n.toLocaleString('ko-KR')
  }

  // 한 항목의 효과 표기. '%' 는 퍼센트포인트 누적, 그 외는 절대값.
  function effText(id, lv) {
    const u = UPGRADES[id]
    const cur = valueOf(id, lv)
    const next = valueOf(id, lv + 1)
    if (lv >= u.max) return `<b>+${cur}${u.unit}</b> <span class="sh-max">최대</span>`
    return `<b>+${cur}${u.unit}</b> <span class="sh-arrow">→</span> +${next}${u.unit}`
  }

  function render() {
    const gold = getGold()
    const meta = getMeta()

    const rows = UPGRADE_IDS.map((id) => {
      const u = UPGRADES[id]
      const lv = meta[id] || 0
      const maxed = lv >= u.max
      const cost = costOf(id, lv)
      const afford = !maxed && gold >= cost
      // 레벨 표시 — 점으로 그려서 한눈에 진행도가 보이게
      const pips = Array.from({ length: u.max }, (_, i) =>
        `<i class="${i < lv ? 'on' : ''}"></i>`).join('')

      return `<div class="sh-row ${maxed ? 'maxed' : afford ? 'ok' : 'poor'}">
        <div class="sh-ic">${u.icon}</div>
        <div class="sh-body">
          <div class="sh-top">
            <span class="sh-nm">${u.name}</span>
            <span class="sh-lv">Lv ${lv}<span class="sh-lvmax">/${u.max}</span></span>
          </div>
          <div class="sh-eff">${effText(id, lv)}</div>
          <div class="sh-pips">${pips}</div>
          <div class="sh-desc">${u.desc}${u.desc2 ? ` · ${u.desc2}` : ''}</div>
        </div>
        <button class="sh-buy" data-buy="${id}" ${maxed || !afford ? 'disabled' : ''}>
          ${maxed
            ? '완료'
            : `<span class="sh-coin"></span><span class="sh-cost">${fmt(cost)}</span>`}
        </button>
      </div>`
    }).join('')

    // 총 투자액 — "얼마나 키웠나"가 보이면 계속하고 싶어진다
    const invested = UPGRADE_IDS.reduce((a, id) => a + spentOn(id, meta[id] || 0), 0)

    root.innerHTML = `
      <div class="sh-panel">
        <div class="sh-head">
          <div class="sh-title">상점</div>
          <div class="sh-gold"><span class="sh-coin big"></span><b id="shGold">${fmt(gold)}</b></div>
        </div>
        <div class="sh-hint">강화는 <b>영구</b>합니다 — 다음 판부터 계속 적용됩니다</div>
        <div class="sh-scroll">${rows}</div>
        <div class="sh-foot">
          <div class="sh-inv">총 투자 ${fmt(invested)}</div>
          <button class="sh-close" data-act="close">돌아가기</button>
        </div>
      </div>`
  }

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="close"]')) {
      hide()
      onClose && onClose()
      return
    }
    const b = e.target.closest('[data-buy]')
    if (b && !b.disabled) {
      const r = onBuy(b.dataset.buy)
      if (r && r.ok) {
        render() // 골드·레벨이 바뀌었으니 전체 갱신
        flash(b.dataset.buy)
      }
    }
  })

  // 구매한 항목을 잠깐 빛나게 — 눌렸다는 피드백이 없으면 두 번 누른다
  function flash(id) {
    const row = root.querySelector(`[data-buy="${id}"]`)?.closest('.sh-row')
    if (!row) return
    row.classList.add('sh-bought')
    setTimeout(() => row.classList.remove('sh-bought'), 420)
  }

  function show() {
    render()
    root.classList.remove('sh-hidden')
    open = true
  }
  function hide() {
    root.classList.add('sh-hidden')
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
