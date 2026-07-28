// 성장 화면 — HTML 오버레이 모달. Phaser 캔버스 위에 뜬다.
//
// 게임 로직과의 계약:
//   getState() → { level, attrPoints, attributes, cfg }  (현재 확정 상태)
//   onApply(finalAttributes, spentPoints)                (적용 버튼)
//   onClose()                                            (닫힘 — 게임 재개)
//
// 임시 투자(pending)는 이 모듈 안에서만 관리한다. 적용 전까지 게임의 확정
// 능력치는 절대 바뀌지 않는다 (스펙: 임시/확정 분리).

import './growth.css'
import { ATTR_KEYS, ATTR_LABELS, attrEffectText, nextTierText } from './progression.js'
import {
  ACTIVE_SKILLS,
  PASSIVE_SKILLS,
  TREES,
  investBlockReason,
} from './skilltree.js'

export function createGrowthScreen({ getState, onApply, onSkillInvest, onClose }) {
  let open = false
  let cfg = null
  let level = 1
  let base = null // 확정 능력치 (열 때 스냅샷)
  let pending = null // 임시 능력치
  let poolStart = 0 // 열 때 미사용 포인트
  let activeTab = 'attr'

  // --- DOM 뼈대 ---
  const root = document.createElement('div')
  root.id = 'growth-modal'
  root.className = 'growth-hidden'
  root.innerHTML = `
    <div class="growth-panel">
      <header class="growth-head">
        <div class="growth-title">
          <span class="g-level"></span>
          <span class="g-points"></span>
        </div>
        <div class="growth-actions">
          <button data-act="apply" class="g-apply">적용</button>
          <button data-act="cancel" class="g-cancel">취소</button>
          <button data-act="close" class="g-close">✕</button>
        </div>
      </header>
      <nav class="growth-tabs">
        <button data-tab="attr" class="on">능력치</button>
        <button data-tab="skill">스킬 트리</button>
      </nav>
      <div class="growth-body"></div>
      <footer class="growth-foot"></footer>
    </div>`
  document.body.appendChild(root)

  const bodyEl = root.querySelector('.growth-body')
  const footEl = root.querySelector('.growth-foot')
  const levelEl = root.querySelector('.g-level')
  const pointsEl = root.querySelector('.g-points')

  const remaining = () =>
    poolStart - ATTR_KEYS.reduce((s, k) => s + (pending[k] - base[k]), 0)

  // --- 렌더 ---
  function render() {
    const st = getState()
    levelEl.textContent = `레벨 ${st.level}`
    const rem = remaining()
    pointsEl.textContent = `능력치 ${rem}  ·  스킬 ${st.skillPoints}`
    pointsEl.classList.toggle('has', rem > 0 || st.skillPoints > 0)

    if (activeTab === 'attr') renderAttr(rem)
    else renderSkill(st)
  }

  function renderAttr(rem) {
    bodyEl.innerHTML = ATTR_KEYS.map((k) => {
      const cur = base[k]
      const plan = pending[k]
      const added = plan - cur
      const canAdd = rem > 0
      return `
        <div class="attr-row">
          <div class="attr-main">
            <span class="attr-name">${ATTR_LABELS[k]}</span>
            <span class="attr-val">${cur}${added > 0 ? ` <b>+${added}</b> → ${plan}` : ''}</span>
            <button class="attr-plus" data-plus="${k}" ${canAdd ? '' : 'disabled'}>+</button>
          </div>
          <div class="attr-eff">${attrEffectText(cfg, k, plan)}</div>
          <div class="attr-next">다음 → ${nextTierText(k, plan)}</div>
        </div>`
    }).join('')

    // 하단: 이번 투자분 요약
    const changes = ATTR_KEYS.filter((k) => pending[k] > base[k]).map(
      (k) => `${ATTR_LABELS[k]} +${pending[k] - base[k]}`
    )
    footEl.innerHTML = `
      <div class="foot-summary">${
        changes.length ? '이번 투자: ' + changes.join('  ·  ') : '투자 예정 없음'
      }</div>
      <div class="foot-tools">
        <button data-act="reset">이번 배분 초기화</button>
      </div>`
  }

  function renderSkill(st) {
    const all = { ...ACTIVE_SKILLS, ...PASSIVE_SKILLS }
    const byTree = (treeId) =>
      Object.values(all).filter((s) => s.tree === treeId)

    bodyEl.innerHTML =
      `<div class="skill-cols">` +
      TREES.map((tree) => {
        const nodes = byTree(tree.id)
          .map((sk) => skillNode(sk, st))
          .join('')
        return `<div class="skill-col">
          <h3 style="color:${tree.color}">${tree.name}</h3>${nodes}
        </div>`
      }).join('') +
      `</div>`
    footEl.innerHTML = `<div class="foot-summary">스킬 포인트로 배우고 강화합니다</div>`
  }

  function skillNode(sk, st) {
    const cur = st.skillLevels[sk.id] || 0
    const reason = investBlockReason(sk.id, st.skillLevels, st.level)
    const maxed = cur >= sk.maxLevel
    const canInvest = !reason && st.skillPoints > 0
    const isActive = !!ACTIVE_SKILLS[sk.id]

    let statusCls = 'locked'
    if (maxed) statusCls = 'maxed'
    else if (canInvest) statusCls = 'ready'
    else if (!reason) statusCls = 'nopoint'

    const badge = cur === 0 && !reason ? '<span class="node-new">NEW</span>' : ''
    const sub = maxed
      ? 'MAX'
      : reason
        ? reason
        : `${cur}/${sk.maxLevel}`

    return `
      <div class="skill-node ${statusCls}">
        <div class="node-top">
          <span class="node-name">${isActive ? '◆' : '○'} ${sk.name}${badge}</span>
          <button class="node-btn" data-invest="${sk.id}" ${canInvest ? '' : 'disabled'}>+</button>
        </div>
        <div class="node-sub">${sub}</div>
        <div class="node-desc">${sk.desc}</div>
      </div>`
  }

  // --- 이벤트 (위임) ---
  root.addEventListener('click', (e) => {
    const t = e.target
    if (t.dataset.tab) {
      activeTab = t.dataset.tab
      root.querySelectorAll('.growth-tabs button').forEach((b) =>
        b.classList.toggle('on', b.dataset.tab === activeTab)
      )
      render()
      return
    }
    if (t.dataset.plus) {
      if (remaining() > 0) {
        pending[t.dataset.plus]++
        render()
      }
      return
    }
    if (t.dataset.invest) {
      if (onSkillInvest(t.dataset.invest)) render() // 성공하면 갱신
      return
    }
    if (t.dataset.act === 'reset') {
      pending = { ...base }
      render()
      return
    }
    if (t.dataset.act === 'apply') {
      const spent = ATTR_KEYS.reduce((s, k) => s + (pending[k] - base[k]), 0)
      onApply({ ...pending }, spent)
      close()
      return
    }
    if (t.dataset.act === 'cancel') {
      pending = { ...base }
      render()
      return
    }
    if (t.dataset.act === 'close') {
      close() // 적용 안 한 임시 투자는 버려진다
      return
    }
  })

  // --- 공개 API ---
  function openScreen() {
    const st = getState()
    cfg = st.cfg
    level = st.level
    base = { ...st.attributes }
    pending = { ...st.attributes }
    poolStart = st.attrPoints
    activeTab = 'attr'
    root.querySelectorAll('.growth-tabs button').forEach((b) =>
      b.classList.toggle('on', b.dataset.tab === 'attr')
    )
    render()
    root.classList.remove('growth-hidden')
    open = true
  }

  function close() {
    root.classList.add('growth-hidden')
    open = false
    onClose()
  }

  return {
    open: openScreen,
    close,
    get isOpen() {
      return open
    },
  }
}
