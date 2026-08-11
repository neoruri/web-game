// 결과 화면 — 한 판이 끝났을 때 성과를 보여주고 "한 판 더"를 유도한다.
//
// 왜 필요한가: 지금까지는 죽으면 화면이 그냥 리셋되어 **한 판의 성과가 어디에도 남지 않았다.**
// "내가 뭘 했고 무엇이 남았나"를 보여주는 것만으로 재플레이 동기가 크게 올라간다.
//
// 계약:
//   show(result)  result = {
//     survived, timeText, level, kills, bossKills,
//     runes: [{icon,label,desc,tierColor,tier}],   // 이번 판에 장착한 룬들
//     skills: [{icon,name,level}]                  // 최종 빌드
//   }
//   onRetry() — "다시 하기"
//   hide()
//
// 최고 기록은 localStorage에 저장한다(판마다 리셋되는 게임에서 유일하게 남는 것).

import './result-screen.css'

const LS_KEY = 'wg_best_v1'

function loadBest() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return { survived: 0, level: 0, kills: 0, bossKills: 0, eliteKills: 0, plays: 0 }
    const b = JSON.parse(raw)
    return {
      survived: b.survived || 0,
      level: b.level || 0,
      kills: b.kills || 0,
      bossKills: b.bossKills || 0,
      eliteKills: b.eliteKills || 0,
      plays: b.plays || 0,
    }
  } catch {
    return { survived: 0, level: 0, kills: 0, bossKills: 0, eliteKills: 0, plays: 0 }
  }
}
function saveBest(b) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(b))
  } catch {
    /* 사파리 프라이빗 모드 등에서 실패해도 게임은 계속돼야 한다 */
  }
}

function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function createResultScreen({ onRetry }) {
  let open = false

  // scene.restart()로 create()가 다시 돌 때 오버레이가 DOM에 쌓이는 것을 막는다
  document.getElementById('result-modal')?.remove()
  const root = document.createElement('div')
  root.id = 'result-modal'
  root.className = 'rz-hidden'
  document.body.appendChild(root)

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="retry"]')) {
      hide()
      onRetry()
    }
  })

  function show(r) {
    const best = loadBest()
    best.plays = (best.plays || 0) + 1

    // 갱신 판정 — 지표별로 따로 본다(무엇을 잘했는지 보여주기 위해)
    const isNewTime = r.survived > best.survived
    const isNewKills = r.kills > best.kills
    const isNewLevel = r.level > best.level
    const isNewBoss = r.bossKills > best.bossKills
    // 엘리트가 룬의 유일한 공급원이므로 "몇 마리 잡았나"가 이번 판의 성과를 가장 잘 나타낸다
    const elite = r.eliteKills || 0
    const isNewElite = elite > best.eliteKills
    const anyNew = isNewTime || isNewKills || isNewLevel || isNewBoss || isNewElite

    const prevTime = best.survived
    if (isNewTime) best.survived = r.survived
    if (isNewKills) best.kills = r.kills
    if (isNewLevel) best.level = r.level
    if (isNewBoss) best.bossKills = r.bossKills
    if (isNewElite) best.eliteKills = elite
    saveBest(best)

    const stat = (label, value, sub, isNew) => `
      <div class="rz-stat ${isNew ? 'new' : ''}">
        <div class="rz-sl">${label}</div>
        <div class="rz-sv">${value}</div>
        <div class="rz-ss">${isNew ? '<b>최고 기록!</b>' : sub}</div>
      </div>`

    const runeHTML = r.runes.length
      ? r.runes
          .map(
            (x) => `<div class="rz-rune" style="border-color:${x.tierColor}" title="${x.desc}">
              <span class="rz-ric">${x.icon}</span>
              <span class="rz-rnm" style="color:${x.tierColor}">${x.label}</span>
              <span class="rz-rds">${x.desc}</span>
            </div>`
          )
          .join('')
      : '<div class="rz-none">이번 판엔 룬을 장착하지 못했습니다</div>'

    const skillHTML = r.skills.length
      ? r.skills
          .map((s) => `<span class="rz-skill">${s.icon} ${s.name} <b>Lv${s.level}</b></span>`)
          .join('')
      : '<span class="rz-none">기본 사격만 사용</span>'

    root.innerHTML = `
      <div class="rz-panel">
        <div class="rz-top">
          <div class="rz-kick">RUN COMPLETE</div>
          <div class="rz-ttl">${anyNew ? '신기록!' : '게임 오버'}</div>
          <div class="rz-sub">${r.plays ? '' : ''}${best.plays}번째 도전</div>
        </div>

        <div class="rz-scroll">
          <div class="rz-stats">
            ${stat('버틴 시간', r.timeText, prevTime ? `최고 ${fmtTime(prevTime)}` : '첫 기록', isNewTime)}
            ${stat('처치', r.kills, `최고 ${best.kills}`, isNewKills)}
            ${stat('레벨', r.level, `최고 ${best.level}`, isNewLevel)}
            ${stat('엘리트', elite, `최고 ${best.eliteKills}`, isNewElite)}
          </div>

          <div class="rz-sechd"><span>최종 빌드</span><span class="rz-ln"></span></div>
          <div class="rz-skills">${skillHTML}</div>

          <div class="rz-sechd"><span>장착한 룬 <b>${r.runes.length}</b></span><span class="rz-ln"></span></div>
          <div class="rz-runes">${runeHTML}</div>
        </div>

        <div class="rz-foot">
          <button class="rz-btn p" data-act="retry">다시 하기</button>
        </div>
      </div>`

    root.classList.remove('rz-hidden')
    open = true
  }

  function hide() {
    root.classList.add('rz-hidden')
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
