// 성장 화면 — HTML 오버레이 모달. Phaser 캔버스 위에 뜬다.
//
// 게임 로직과의 계약(변경 없음):
//   getState() → { level, attrPoints, attributes, skillPoints, skillLevels, specs, cfg }
//   onApply(finalAttributes, spentPoints)   (능력치 적용 — pending 모델)
//   onSkillInvest(id) → bool                 (스킬 1레벨 즉시 투자)
//   onSpecChoose(id, choice) → bool          (5레벨 특화 즉시 선택)
//   onClose()                                (닫힘 — 게임 재개)
//
// 능력치는 임시 투자(pending) 후 [적용]에서만 확정된다. 스킬/특화는 즉시 확정.
// 레이아웃은 skilltree.html 시안을 이식: 능력치 섹션 + 스킬 섹션(3계열 탭·티어·
// 주력 액티브 상단 카드·액티브 배경색 구분·노드 탭→상세 시트→배우기).

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

// 표시용 상수 (게임 데이터엔 없는 아이콘·설명만 UI 쪽에서 보강)
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
// 패시브 per 키 → 표시 라벨/단위
const PER_LABEL = {
  basicDmgPct: ['기본 활 피해', '%'], projSpeedPct: ['투사체 속도', '%'],
  pierce: ['관통', ''], movePct: ['이동속도', '%'],
  grenadeDmgPct: ['수류탄 피해', '%'], grenadeRadiusPct: ['폭발 범위', '%'],
  critPct: ['치명타 확률', '%'], dodgePct: ['회피 확률', '%'],
}

// 스킬 레벨별 효과 문구
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
  let base = null // 확정 능력치 (열 때 스냅샷)
  let pending = null // 임시 능력치
  let poolStart = 0 // 열 때 미사용 능력치 포인트
  let curTree = TREES[0].id
  let selAttr = 'str'
  let openSkillId = null

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

      <div class="growth-body" id="gvBody">
        <!-- ⚔️ 능력치 -->
        <section class="gv-sect gv-sect-stat">
          <div class="gv-hd"><span>⚔️ 능력치</span><span class="gv-badge" id="gvAp"></span></div>
          <div class="gv-stat-row" id="gvStatRow"></div>
          <div class="gv-stat-detail" id="gvStatDetail"></div>
        </section>

        <div class="gv-gap"></div>

        <!-- 🌳 스킬 트리 -->
        <section class="gv-sect gv-sect-skill">
          <div class="gv-skillbar">
            <div class="gv-hd"><span>🌳 스킬 트리</span><span class="gv-badge" id="gvSp"></span></div>
            <nav class="gv-tabs" id="gvTreeTabs"></nav>
          </div>
          <div class="gv-tree" id="gvTree"></div>
        </section>

        <div class="gv-hint" id="gvHint"><span class="arw">▼</span> 아래로 스크롤</div>
      </div>

      <div class="gv-backdrop" id="gvBackdrop"></div>
      <div class="gv-sheet" id="gvSheet"></div>
    </div>`
  document.body.appendChild(root)

  const $ = (s) => root.querySelector(s)
  const bodyEl = $('#gvBody')
  const levelEl = $('.g-level')
  const pointsEl = $('.g-points')

  const remaining = () =>
    poolStart - ATTR_KEYS.reduce((s, k) => s + (pending[k] - base[k]), 0)

  // ─── 능력치 ───
  function renderStats() {
    const rem = remaining()
    $('#gvAp').textContent = `${rem} pt`
    $('#gvAp').classList.toggle('has', rem > 0)

    $('#gvStatRow').innerHTML = ATTR_KEYS.map((k) => {
      const added = pending[k] - base[k]
      return `<div class="gv-stat ${k === selAttr ? 'sel' : ''}" data-attr="${k}">
        <div class="gv-si">${ATTR_ICON[k]}</div>
        <div class="gv-snm">${ATTR_LABELS[k]}</div>
        <div class="gv-sv">${pending[k]}${added > 0 ? `<b>+${added}</b>` : ''}</div>
      </div>`
    }).join('')

    const k = selAttr
    const canAdd = rem > 0
    $('#gvStatDetail').innerHTML = `
      <div class="gv-sd-body">
        <div class="gv-sd-eff">${ATTR_ICON[k]} ${ATTR_LABELS[k]} · ${attrEffectText(cfg, k, pending[k])}</div>
        <div class="gv-sd-next">다음 구간 → ${nextTierText(k, pending[k])}</div>
      </div>
      <button class="gv-up" data-attrplus="${k}" ${canAdd ? '' : 'disabled'}>+</button>`
  }

  // ─── 스킬 ───
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
    const cls = ['gv-node', statusClass(sk, st), isActive ? 'act' : '', featured ? 'feat' : '']
      .filter(Boolean).join(' ')
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
    $('#gvTree').style.setProperty('--tc', tree.color) // 액티브 노드 테두리색
    const all = { ...ACTIVE_SKILLS, ...PASSIVE_SKILLS }
    const nodes = Object.values(all).filter((s) => s.tree === curTree)
    const actives = nodes
      .filter((n) => ACTIVE_SKILLS[n.id])
      .sort((a, b) => a.unlockLevel - b.unlockLevel)
    const primary = actives[0] || null

    let html = `<div class="gv-tree-head" style="border-color:${tree.color}">${TREE_DESC[curTree] || ''}</div>`
    if (primary) html += nodeCard(primary, st, true)

    const rest = nodes.filter((n) => n !== primary)
    const tiers = [...new Set(rest.map((n) => n.unlockLevel))].sort((a, b) => a - b)
    for (const tr of tiers) {
      const list = rest.filter((n) => n.unlockLevel === tr)
      html += `<div class="gv-tier"><div class="gv-tier-lb">Lv${tr} 해금</div>
        <div class="gv-nodes">${list.map((n) => nodeCard(n, st, false)).join('')}</div></div>`
    }
    $('#gvTree').innerHTML = html
  }

  // ─── 상세 시트 ───
  function openSheet(id) {
    openSkillId = id
    const st = getState()
    const sk = ACTIVE_SKILLS[id] || PASSIVE_SKILLS[id]
    const cur = st.skillLevels[id] || 0
    const isActive = !!ACTIVE_SKILLS[id]
    const isMax = cur >= sk.maxLevel
    const reason = investBlockReason(id, st.skillLevels, st.level)
    const canInvest = !reason && st.skillPoints > 0

    let eff = `<div class="gv-eff-row ${cur > 0 ? 'now' : ''}"><span class="k">현재 (Lv${cur})</span><span>${skillEffText(sk, cur)}</span></div>`
    if (!isMax) eff += `<div class="gv-eff-row"><span class="k">다음 (Lv${cur + 1})</span><span>${skillEffText(sk, cur + 1)}</span></div>`

    let pre = ''
    if (reason && !isMax) pre = `<div class="gv-pre no">✖ ${reason}</div>`

    let btn
    if (isMax) btn = `<button class="gv-learn" disabled>최대 레벨</button>`
    else if (canInvest)
      btn = `<button class="gv-learn" data-learn="${id}">${cur > 0 ? '업그레이드' : '배우기'} (스킬 1 pt)</button>`
    else btn = `<button class="gv-learn" disabled>${reason ? reason : '스킬 포인트 없음'}</button>`

    // 5레벨 특화
    let specHtml = ''
    const specDef = SPECIALIZATIONS[id]
    if (specDef && cur >= SPEC_LEVEL) {
      const chosen = st.specs?.[id]
      if (chosen) {
        specHtml = `<div class="gv-spec-chosen">특화 선택됨: ${specDef[chosen].name}</div>`
      } else {
        specHtml = `<div class="gv-spec-lb">특화 선택 (한 번만)</div><div class="gv-specs">
          <button class="gv-spec" data-spec="${id}" data-choice="A"><b>${specDef.A.name}</b><em>${specDef.A.desc}</em></button>
          <button class="gv-spec" data-spec="${id}" data-choice="B"><b>${specDef.B.name}</b><em>${specDef.B.desc}</em></button>
        </div>`
      }
    }

    const kindTxt = isActive ? '🎯 액티브' : '⬆ 패시브'
    $('#gvSheet').innerHTML = `
      <div class="gv-grab"></div>
      <div class="gv-sh-top">
        <div class="gv-sh-icon">${SKILL_ICON[id] || '•'}</div>
        <div><div class="gv-sh-title">${sk.name}</div>
          <div class="gv-sh-sub">${kindTxt} · 최대 ${sk.maxLevel}레벨 · 해금 Lv${sk.unlockLevel}</div></div>
      </div>
      <div class="gv-sh-desc">${sk.desc}</div>
      <div class="gv-eff">${eff}</div>
      ${pre}
      ${btn}
      ${specHtml}`
    $('#gvBackdrop').classList.add('on')
    $('#gvSheet').classList.add('on')
  }
  function closeSheet() {
    openSkillId = null
    $('#gvBackdrop').classList.remove('on')
    $('#gvSheet').classList.remove('on')
  }

  // ─── 전체 렌더 ───
  function render() {
    const st = getState()
    levelEl.textContent = `레벨 ${st.level}`
    const rem = remaining()
    pointsEl.textContent =
      rem > 0 || st.skillPoints > 0 ? '미사용 포인트를 배분하세요' : ''
    pointsEl.classList.toggle('has', rem > 0 || st.skillPoints > 0)
    $('#gvSp').textContent = `${st.skillPoints} pt`
    $('#gvSp').classList.toggle('has', st.skillPoints > 0)

    renderStats()
    renderTree(st)
    updateHint()
  }

  function updateHint() {
    const more = bodyEl.scrollHeight - bodyEl.clientHeight - bodyEl.scrollTop
    const show = bodyEl.scrollHeight - bodyEl.clientHeight > 30 && more > 24
    $('#gvHint').classList.toggle('on', show)
  }
  bodyEl.addEventListener('scroll', updateHint, { passive: true })

  // ─── 이벤트 (위임) ───
  root.addEventListener('click', (e) => {
    const t = e.target

    // 헤더 액션
    const act = t.dataset.act
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

    // 능력치
    if (t.dataset.attr) {
      selAttr = t.dataset.attr
      renderStats()
      return
    }
    if (t.dataset.attrplus) {
      if (remaining() > 0) {
        pending[t.dataset.attrplus]++
        render()
      }
      return
    }

    // 트리 탭
    if (t.dataset.tree) {
      curTree = t.dataset.tree
      closeSheet()
      renderTreeTabs()
      renderTree(getState())
      $('.gv-sect-skill').scrollIntoView?.({ block: 'start' })
      updateHint()
      return
    }

    // 노드 → 상세
    const nodeEl = t.closest('[data-node]')
    if (nodeEl) {
      openSheet(nodeEl.dataset.node)
      return
    }

    // 상세: 배우기
    if (t.dataset.learn) {
      if (onSkillInvest(t.dataset.learn)) {
        render()
        openSheet(t.dataset.learn) // 시트 갱신
      }
      return
    }
    // 상세: 특화
    const specBtn = t.closest('[data-spec]')
    if (specBtn) {
      if (onSpecChoose(specBtn.dataset.spec, specBtn.dataset.choice)) {
        render()
        openSheet(specBtn.dataset.spec)
      }
      return
    }
  })

  $('#gvBackdrop').addEventListener('click', closeSheet)

  // ─── 공개 API ───
  function openScreen() {
    const st = getState()
    cfg = st.cfg
    base = { ...st.attributes }
    pending = { ...st.attributes }
    poolStart = st.attrPoints
    curTree = TREES[0].id
    selAttr = 'str'
    closeSheet()
    renderTreeTabs()
    render()
    bodyEl.scrollTop = 0
    root.classList.remove('growth-hidden')
    open = true
    // 열린 뒤 레이아웃 확정된 상태에서 힌트 재계산
    requestAnimationFrame(updateHint)
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
