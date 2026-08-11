// 성장 화면 — HTML 오버레이(게임 캔버스 위 전체 페이지).
//
// 게임 로직과의 계약(변경 없음):
//   getState() → { level, attrPoints, attributes, skillPoints, skillLevels, specs, cfg }
//   onApply(finalAttributes, spentPoints)   (능력치 적용 — pending 모델)
//   onSkillInvest(id) → bool                 (스킬 1레벨 즉시 투자)
//   onSpecChoose(id, choice) → bool          (5레벨 특화 즉시 선택)
//   onClose()                                (닫힘 — 게임 재개)
//
// 게임 UI 방식: 슬라이드업 시트/백드롭 없음. 3단 고정 레이아웃 —
//   [헤더(고정)] / [스크롤: 능력치 + 스킬트리] / [정보 독(하단 고정)]
// 능력치든 스킬이든 "선택된 것"의 상세·투자버튼이 항상 하단 독에 표시된다.
// 겹치는 레이어가 없어 이전 화면 잔상 버그가 구조적으로 발생하지 않는다.

import './growth.css'
import { ATTR_KEYS, ATTR_LABELS, attrEffectText, nextTierText } from './progression.js'
import {
  ACTIVE_SKILLS,
  PASSIVE_SKILLS,
  TREES,
  investBlockReason,
  SPECIALIZATIONS,
  SPEC_LEVEL,
} from './skilltree.js'

const ATTR_ICON = { str: '💪', dex: '🏃', int: '🧠', vit: '❤️' }
const SKILL_ICON = {
  multishot: '🔱', rapidfire: '💥', barrage: '🌪️', grenade: '💣',
  archeryMastery: '🏹', piercingArrow: '➹', critTraining: '⚡',
  moveMastery: '👟', dodgeTraining: '🌀', explosiveMastery: '🧨',
}
const TREE_DESC = {
  archery: '단일 폭딜·정밀 사격. 힘과 궁합.',
  mobility: '연사·이동·회피. 민첩과 궁합.',
  explosive: '폭발 광역. 지능과 궁합.',
}
const PER_LABEL = {
  basicDmgPct: ['기본 활 피해', '%'], projSpeedPct: ['투사체 속도', '%'],
  pierce: ['관통', ''], movePct: ['이동속도', '%'],
  grenadeDmgPct: ['수류탄 피해', '%'], grenadeRadiusPct: ['폭발 범위', '%'],
  critPct: ['치명타 확률', '%'], dodgePct: ['회피 확률', '%'],
}

function passiveText(sk, lv) {
  const parts = []
  for (const k in sk.per) {
    const [label, unit] = PER_LABEL[k] || [k, '']
    let v = sk.per[k] * lv
    if (unit === '%') v = Math.round(v * 1000) / 10
    parts.push(`${label} +${v}${unit}`)
  }
  return parts.join(' · ')
}
function activeText(sk, lv) {
  const e = sk.eff(lv)
  const p = []
  if (e.shots != null) p.push(`${e.shots}발`)
  if (e.count != null) p.push(`${e.count}개`)
  if (e.duration != null) p.push(`지속 ${e.duration}초`)
  if (e.dmgMul && e.dmgMul !== 1) p.push(`피해 +${Math.round((e.dmgMul - 1) * 100)}%`)
  if (e.pierceBonus) p.push(`관통 +${e.pierceBonus}`)
  if (e.intervalMul && e.intervalMul < 1)
    p.push(`연사속도 +${Math.round((1 / e.intervalMul - 1) * 100)}%`)
  if (e.radiusMul && e.radiusMul !== 1)
    p.push(`범위 +${Math.round((e.radiusMul - 1) * 100)}%`)
  return p.join(' · ') || '기본'
}
function skillEffText(sk, lv) {
  if (lv <= 0) return '미습득'
  return ACTIVE_SKILLS[sk.id] ? activeText(sk, lv) : passiveText(sk, lv)
}

export function createGrowthScreen({
  getState,
  onApply,
  onSkillInvest,
  onSpecChoose,
  onClose,
}) {
  let open = false
  let cfg = null
  let base = null
  let pending = null
  let poolStart = 0
  let curTree = TREES[0].id
  let sel = { type: 'attr', id: 'str' } // 하단 독에 표시할 대상

  const root = document.createElement('div')
  // scene.restart()로 create()가 다시 돌 때 오버레이가 DOM에 쌓이는 것을 막는다
  document.getElementById('growth-modal')?.remove()
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

      <div class="growth-scroll" id="gvScroll">
        <section class="gv-sect gv-sect-stat">
          <div class="gv-hd"><span>⚔️ 능력치</span><span class="gv-badge" id="gvAp"></span></div>
          <div class="gv-stat-row" id="gvStatRow"></div>
        </section>

        <div class="gv-gap"></div>

        <section class="gv-sect gv-sect-skill">
          <div class="gv-skillbar">
            <div class="gv-hd"><span>🌳 스킬 트리</span><span class="gv-badge" id="gvSp"></span></div>
            <nav class="gv-tabs" id="gvTreeTabs"></nav>
          </div>
          <div class="gv-tree" id="gvTree"></div>
        </section>
      </div>

      <div class="gv-dock" id="gvDock"></div>
    </div>`
  document.body.appendChild(root)

  const $ = (s) => root.querySelector(s)
  const scrollEl = $('#gvScroll')
  const levelEl = $('.g-level')
  const pointsEl = $('.g-points')

  const remaining = () =>
    poolStart - ATTR_KEYS.reduce((s, k) => s + (pending[k] - base[k]), 0)

  const featuredOf = (treeId) =>
    Object.values(ACTIVE_SKILLS)
      .filter((s) => s.tree === treeId)
      .sort((a, b) => a.unlockLevel - b.unlockLevel)[0] || null

  // ─── 능력치 카드 ───
  function renderStatRow() {
    $('#gvStatRow').innerHTML = ATTR_KEYS.map((k) => {
      const added = pending[k] - base[k]
      const on = sel.type === 'attr' && sel.id === k
      return `<div class="gv-stat ${on ? 'sel' : ''}" data-attr="${k}">
        <div class="gv-si">${ATTR_ICON[k]}</div>
        <div class="gv-snm">${ATTR_LABELS[k]}</div>
        <div class="gv-sv">${pending[k]}${added > 0 ? `<b>+${added}</b>` : ''}</div>
      </div>`
    }).join('')
  }

  // ─── 스킬 트리 ───
  function renderTreeTabs() {
    $('#gvTreeTabs').innerHTML = TREES.map(
      (t) => `<button class="gv-tab ${t.id === curTree ? 'on' : ''}" data-tree="${t.id}"
        style="--tc:${t.color}">${t.name}</button>`
    ).join('')
  }

  function statusClass(sk, st) {
    const cur = st.skillLevels[sk.id] || 0
    if (cur >= sk.maxLevel) return 'maxed'
    const reason = investBlockReason(sk.id, st.skillLevels, st.level)
    if (cur > 0) return 'owned'
    if (!reason && st.skillPoints > 0) return 'avail'
    return 'locked'
  }

  function nodeCard(sk, st, featured) {
    const cur = st.skillLevels[sk.id] || 0
    const isActive = !!ACTIVE_SKILLS[sk.id]
    const on = sel.type === 'skill' && sel.id === sk.id
    const cls = ['gv-node', statusClass(sk, st), isActive ? 'act' : '',
      featured ? 'feat' : '', on ? 'sel' : ''].filter(Boolean).join(' ')
    const pct = Math.round((cur / sk.maxLevel) * 100)
    const icon = SKILL_ICON[sk.id] || '•'
    if (featured) {
      return `<div class="${cls}" data-node="${sk.id}">
        <div class="gv-icon">${icon}</div>
        <div class="gv-feat-body">
          <div class="gv-feat-tag">주력 액티브 · Lv${sk.unlockLevel} 해금</div>
          <div class="gv-nm">${sk.name}</div>
          <div class="gv-feat-sub">${sk.desc}</div>
          <div class="gv-barwrap"><div class="gv-bar" style="width:${pct}%"></div></div>
        </div>
        <span class="gv-lv">${cur}/${sk.maxLevel}</span>
      </div>`
    }
    return `<div class="${cls}" data-node="${sk.id}">
      <span class="gv-lv">${cur}/${sk.maxLevel}</span>
      <div class="gv-icon">${icon}</div>
      <div class="gv-nm">${sk.name}</div>
      <div class="gv-barwrap"><div class="gv-bar" style="width:${pct}%"></div></div>
    </div>`
  }

  function renderTree(st) {
    const tree = TREES.find((t) => t.id === curTree)
    const treeEl = $('#gvTree')
    treeEl.style.setProperty('--tc', tree.color)
    const all = { ...ACTIVE_SKILLS, ...PASSIVE_SKILLS }
    const nodes = Object.values(all).filter((s) => s.tree === curTree)
    const primary = featuredOf(curTree)

    let html = `<div class="gv-tree-head" style="border-color:${tree.color}">${TREE_DESC[curTree] || ''}</div>`
    if (primary) html += nodeCard(primary, st, true)

    const rest = nodes.filter((n) => n !== primary)
    const tiers = [...new Set(rest.map((n) => n.unlockLevel))].sort((a, b) => a - b)
    for (const tr of tiers) {
      const list = rest.filter((n) => n.unlockLevel === tr)
      html += `<div class="gv-tier"><div class="gv-tier-lb">Lv${tr} 해금</div>
        <div class="gv-nodes">${list.map((n) => nodeCard(n, st, false)).join('')}</div></div>`
    }
    treeEl.innerHTML = html
  }

  // ─── 하단 정보 독 (선택된 능력치/스킬) ───
  function renderDock(st) {
    const dock = $('#gvDock')
    if (sel.type === 'attr') {
      const k = sel.id
      const rem = remaining()
      const added = pending[k] - base[k]
      dock.innerHTML = `
        <div class="gv-dock-main">
          <div class="gv-dock-info">
            <div class="gv-dock-title">${ATTR_ICON[k]} ${ATTR_LABELS[k]}
              <span class="gv-dock-lv">Lv ${pending[k]}${added > 0 ? ` (+${added})` : ''}</span></div>
            <div class="gv-dock-eff">${attrEffectText(cfg, k, pending[k])}</div>
            <div class="gv-dock-next">다음 구간 → ${nextTierText(k, pending[k])}</div>
          </div>
          <button class="gv-dock-btn" data-act="invest" ${rem > 0 ? '' : 'disabled'}>
            올리기<small>능력치 ${rem}pt</small></button>
        </div>`
      return
    }

    // skill
    const id = sel.id
    const sk = ACTIVE_SKILLS[id] || PASSIVE_SKILLS[id]
    const cur = st.skillLevels[id] || 0
    const isActive = !!ACTIVE_SKILLS[id]
    const isMax = cur >= sk.maxLevel
    const reason = investBlockReason(id, st.skillLevels, st.level)
    const canInvest = !reason && st.skillPoints > 0

    let btn
    if (isMax) btn = `<button class="gv-dock-btn" disabled>최대 레벨</button>`
    else if (canInvest)
      btn = `<button class="gv-dock-btn" data-act="invest">${cur > 0 ? '업그레이드' : '배우기'}<small>스킬 ${st.skillPoints}pt</small></button>`
    else btn = `<button class="gv-dock-btn" disabled>${reason || '스킬 포인트 없음'}</button>`

    const nextLine = isMax
      ? '최대 레벨 도달'
      : `현재 ${cur > 0 ? skillEffText(sk, cur) : '미습득'} → 다음 ${skillEffText(sk, cur + 1)}`

    // 5레벨 특화
    let spec = ''
    const specDef = SPECIALIZATIONS[id]
    if (specDef && cur >= SPEC_LEVEL) {
      const chosen = st.specs?.[id]
      if (chosen) spec = `<div class="gv-dock-spec chosen">✔ 특화: ${specDef[chosen].name} — ${specDef[chosen].desc}</div>`
      else spec = `<div class="gv-dock-spec">
        <button class="gv-spec" data-spec="${id}" data-choice="A"><b>${specDef.A.name}</b><em>${specDef.A.desc}</em></button>
        <button class="gv-spec" data-spec="${id}" data-choice="B"><b>${specDef.B.name}</b><em>${specDef.B.desc}</em></button>
      </div>`
    }

    dock.innerHTML = `
      <div class="gv-dock-main">
        <div class="gv-dock-info">
          <div class="gv-dock-title">${SKILL_ICON[id] || '•'} ${sk.name}
            <span class="gv-dock-tag">${isActive ? '🎯' : '⬆'}</span>
            <span class="gv-dock-lv">${cur}/${sk.maxLevel}</span></div>
          <div class="gv-dock-eff">${sk.desc}</div>
          <div class="gv-dock-next">${nextLine}</div>
        </div>
        ${btn}
      </div>
      ${spec}`
  }

  // ─── 전체 렌더 ───
  function render() {
    const st = getState()
    levelEl.textContent = `레벨 ${st.level}`
    const rem = remaining()
    $('#gvAp').textContent = `${rem} pt`
    $('#gvAp').classList.toggle('has', rem > 0)
    $('#gvSp').textContent = `${st.skillPoints} pt`
    $('#gvSp').classList.toggle('has', st.skillPoints > 0)
    pointsEl.textContent = rem > 0 || st.skillPoints > 0 ? '미사용 포인트 배분 가능' : ''
    pointsEl.classList.toggle('has', rem > 0 || st.skillPoints > 0)
    renderStatRow()
    renderTreeTabs()
    renderTree(st)
    renderDock(st)
  }

  // ─── 이벤트 (위임) ───
  root.addEventListener('click', (e) => {
    const t = e.target

    const act = t.dataset.act || (t.closest('[data-act]') && t.closest('[data-act]').dataset.act)
    if (act === 'apply') {
      const spent = ATTR_KEYS.reduce((s, k) => s + (pending[k] - base[k]), 0)
      onApply({ ...pending }, spent)
      close()
      return
    }
    if (act === 'cancel') {
      pending = { ...base }
      render()
      return
    }
    if (act === 'close') {
      close()
      return
    }
    if (act === 'invest') {
      if (sel.type === 'attr') {
        if (remaining() > 0) { pending[sel.id]++; render() }
      } else {
        if (onSkillInvest(sel.id)) render()
      }
      return
    }

    // 능력치 카드 선택
    const statEl = t.closest('[data-attr]')
    if (statEl) {
      sel = { type: 'attr', id: statEl.dataset.attr }
      render()
      return
    }

    // 트리 탭
    const tabEl = t.closest('[data-tree]')
    if (tabEl) {
      curTree = tabEl.dataset.tree
      const f = featuredOf(curTree)
      sel = f ? { type: 'skill', id: f.id } : { type: 'attr', id: 'str' }
      render()
      $('#gvTree').scrollIntoView?.({ block: 'nearest' })
      return
    }

    // 스킬 노드 선택
    const nodeEl = t.closest('[data-node]')
    if (nodeEl) {
      sel = { type: 'skill', id: nodeEl.dataset.node }
      render()
      return
    }

    // 특화 선택
    const specBtn = t.closest('[data-spec]')
    if (specBtn) {
      if (onSpecChoose(specBtn.dataset.spec, specBtn.dataset.choice)) render()
      return
    }
  })

  // ─── 공개 API ───
  function openScreen() {
    const st = getState()
    cfg = st.cfg
    base = { ...st.attributes }
    pending = { ...st.attributes }
    poolStart = st.attrPoints
    curTree = TREES[0].id
    sel = { type: 'attr', id: 'str' }
    render()
    scrollEl.scrollTop = 0
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
