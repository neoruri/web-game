// 타이틀 + 로딩 화면 (DOM 오버레이)
//
// 왜 DOM 인가: 다른 화면(레벨업·룬·결과)이 모두 DOM 오버레이라 방식을 통일했다.
// 또 Phaser 로더가 끝나기 **전에** 보여야 하는데, Phaser 씬은 로드가 끝난 뒤
// create() 가 돌기 때문에 캔버스 안에서 로딩 화면을 그리려면 별도 씬이 필요하다.
// DOM 이면 게임보다 먼저 떠 있을 수 있다.
//
// 왜 "탭하여 시작"이 필요한가: 브라우저는 **사용자 제스처 없이 오디오를 재생하지
// 못한다.** 로드되자마자 게임이 시작되면 배경음악을 영원히 틀 수 없다.
// 시작 버튼은 UX뿐 아니라 사운드의 기술적 전제 조건이다.
//
// 계약:
//   createTitleScreen({ onStart, getMuted, onToggleMute })
//     → { setProgress(0~1), ready(), hide(), get isOpen }
//   onStart()        — 탭했을 때. 여기서 BGM 재생 + 게임 시작
//   getMuted()       — 초기 음소거 상태(localStorage 값)
//   onToggleMute(m)  — 스피커 아이콘을 눌렀을 때

import './title-screen.css'

// 게임 이름 — **여기만 바꾸면 타이틀 전체가 바뀐다.**
// 포털(Poki/CrazyGames)은 영문 우선이라 영문 워드마크 + 한글 부제로 뒀다.
export const GAME_TITLE = 'GRIMHOLD'
export const GAME_SUBTITLE = '어둠의 사수'

export function createTitleScreen({ onStart, getMuted, onToggleMute }) {
  let open = true
  let loaded = false
  let muted = !!(getMuted && getMuted())

  // scene.restart() 로 다시 만들어져도 DOM 이 쌓이지 않게
  document.getElementById('title-modal')?.remove()
  const root = document.createElement('div')
  root.id = 'title-modal'
  root.innerHTML = `
    <div class="ti-vignette"></div>
    <div class="ti-panel">
      <div class="ti-mark">
        <div class="ti-title">${GAME_TITLE}</div>
        <div class="ti-sub">${GAME_SUBTITLE}</div>
      </div>

      <div class="ti-mid">
        <div class="ti-loadwrap" id="tiLoadWrap">
          <div class="ti-loadbar"><div class="ti-loadfill" id="tiFill"></div></div>
          <div class="ti-loadtx" id="tiLoadTx">불러오는 중… 0%</div>
        </div>
        <button class="ti-start" id="tiStart" hidden>탭하여 시작</button>
      </div>

      <div class="ti-foot">
        <div class="ti-help">
          <span><b>이동</b> 화면 드래그 · WASD</span>
          <span><b>공격</b> 자동</span>
        </div>
        <button class="ti-snd" id="tiSnd" aria-label="소리"></button>
      </div>
    </div>`
  document.body.appendChild(root)

  const fill = root.querySelector('#tiFill')
  const loadTx = root.querySelector('#tiLoadTx')
  const loadWrap = root.querySelector('#tiLoadWrap')
  const startBtn = root.querySelector('#tiStart')
  const sndBtn = root.querySelector('#tiSnd')

  function paintSnd() {
    sndBtn.textContent = muted ? '🔇' : '🔊'
    sndBtn.classList.toggle('off', muted)
  }
  paintSnd()

  sndBtn.addEventListener('click', (e) => {
    e.stopPropagation() // 시작 탭으로 번지지 않게
    muted = !muted
    paintSnd()
    onToggleMute && onToggleMute(muted)
  })

  function start() {
    if (!loaded || !open) return
    hide()
    onStart && onStart()
  }

  startBtn.addEventListener('click', start)
  // 패널 아무 곳이나 탭해도 시작 (모바일에서 버튼을 정확히 누르기 어렵다)
  root.addEventListener('click', (e) => {
    if (e.target.closest('#tiSnd')) return
    start()
  })
  // 키보드로도 시작 — PC 유저 배려
  const onKey = (e) => {
    if (!open) return
    if (e.code === 'Space' || e.code === 'Enter') start()
  }
  window.addEventListener('keydown', onKey)

  function setProgress(p) {
    const v = Math.max(0, Math.min(1, p))
    fill.style.width = (v * 100).toFixed(0) + '%'
    loadTx.textContent = `불러오는 중… ${(v * 100) | 0}%`
  }

  function ready() {
    loaded = true
    loadWrap.hidden = true
    startBtn.hidden = false
  }

  function hide() {
    open = false
    root.classList.add('ti-out')
    window.removeEventListener('keydown', onKey)
    // 페이드아웃이 끝난 뒤 제거 (transition 시간과 맞춤)
    setTimeout(() => root.remove(), 420)
  }

  return {
    setProgress,
    ready,
    hide,
    get isOpen() {
      return open
    },
  }
}
