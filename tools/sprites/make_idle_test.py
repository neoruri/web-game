"""idle 애니메이션 확인용 단독 HTML 생성 (서버 불필요 — 파일을 브라우저로 열면 된다).

이미지를 base64 로 박아 자체 완결이다. `public/` 을 건드리지 않으므로 배포에 영향 없다.

담은 것
  · 새 시트 idle 4프레임 vs 현재 시트 idle 4프레임 나란히
  · 게임과 동일 조건: 96×116 셀을 0.55배로 축소, 6fps, 새 바닥 위, 발밑 그림자
  · **NEAREST / LINEAR 필터 토글** — 외곽 반짝임 문제를 눈으로 A/B 하려고
  · fps·확대배율 슬라이더, 프레임 단위 이동

실행: python3 tools/sprites/make_idle_test.py
출력: tools/sprites/_idle_test.html
"""
import base64
import io
import pathlib

from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent
PUB = HERE.parent.parent / 'public' / 'sprites' / 'dungeon'
CW, CH = 96, 116


def b64(im):
    b = io.BytesIO()
    im.save(b, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()


new = Image.open(HERE / '_player_sheet_new.png').convert('RGBA').crop((0, 0, CW * 4, CH))
old = Image.open(PUB / 'deliverables' / 'player_spritesheet.png').convert('RGBA') \
    .crop((0, 0, CW * 4, CH))
floor = Image.open(PUB / 'tileset_iso_stone.png').convert('RGBA')
props = Image.open(PUB / 'props_iso.png').convert('RGBA')
gob = Image.open(PUB / 'enemies_sheet.png').convert('RGBA').crop((0, 0, 32, 32))

HTML = """<!doctype html>
<meta charset="utf-8">
<title>idle 애니메이션 테스트</title>
<style>
  body { margin:0; background:#0b0c0e; color:#cdd6f4;
         font:14px/1.5 -apple-system,'Segoe UI',sans-serif; padding:18px 22px; }
  h1 { font-size:16px; margin:0 0 4px; font-weight:600; }
  .sub { color:#7f849c; font-size:12px; margin-bottom:16px; }
  .row { display:flex; gap:22px; flex-wrap:wrap; margin-bottom:18px; }
  .pane { }
  .pane h2 { font-size:12px; margin:0 0 6px; color:#a6adc8; font-weight:600; }
  canvas { image-rendering:pixelated; background:#0b0c0e; border-radius:4px;
           display:block; }
  .ctl { display:flex; gap:20px; align-items:center; flex-wrap:wrap;
         background:#181926; padding:12px 16px; border-radius:6px; margin-bottom:18px; }
  .ctl label { display:flex; gap:7px; align-items:center; font-size:12px; color:#a6adc8; }
  input[type=range] { width:130px; }
  .val { color:#f9e2af; font-variant-numeric:tabular-nums; min-width:34px; }
  button { background:#313244; color:#cdd6f4; border:0; padding:6px 12px;
           border-radius:4px; cursor:pointer; font-size:12px; }
  button:hover { background:#45475a; }
  .note { color:#7f849c; font-size:12px; max-width:760px; }
  .note b { color:#cdd6f4; font-weight:600; }
  code { background:#181926; padding:1px 5px; border-radius:3px; color:#f9e2af; }
</style>
<h1>idle 애니메이션 — 게임 동일 조건</h1>
<div class="sub">96×116 셀을 0.55배로 축소 → 53×64px. 새 바닥·프롭 위. 기본 6fps.</div>

<div class="ctl">
  <label>fps <input type="range" id="fps" min="1" max="24" value="6">
    <span class="val" id="fpsv">6</span></label>
  <label>확대 <input type="range" id="zoom" min="1" max="8" value="4">
    <span class="val" id="zoomv">4×</span></label>
  <label><input type="checkbox" id="smooth" checked> LINEAR 필터 (적용됨)</label>
  <label><input type="checkbox" id="showprop" checked> 프롭·적 표시</label>
  <button id="pause">일시정지</button>
</div>

<div class="ctl">
  <label><input type="checkbox" id="smoke" checked> <b>연기 오라</b></label>
  <label>방출/초 <input type="range" id="rate" min="0" max="40" value="10">
    <span class="val" id="ratev">10</span></label>
  <label>수명 <input type="range" id="life" min="20" max="200" value="80">
    <span class="val" id="lifev">0.80s</span></label>
  <label>상승 <input type="range" id="rise" min="5" max="90" value="20">
    <span class="val" id="risev">20</span></label>
  <label>불투명 <input type="range" id="alpha" min="5" max="100" value="40">
    <span class="val" id="alphav">0.40</span></label>
  <label>크기 <input type="range" id="size" min="5" max="30" value="14">
    <span class="val" id="sizev">1.4×</span></label>
</div>

<div class="row">
  <div class="pane"><h2>새 시트 (자마젠타 · 밑단 발광 0.85)</h2>
    <canvas id="cNew"></canvas></div>
  <div class="pane"><h2>현재 시트 (비교용)</h2>
    <canvas id="cOld"></canvas></div>
</div>

<div class="note">
  <b>연기 오라</b>는 <code>main.js</code> 의 <code>updateSmokeAura()</code> 와 같은 로직입니다.
  방출 지점 3곳(후드 위 · 왼어깨 · 오른어깨), 상승하면서 커지고 좌우로 흔들리며 사그라듭니다.
  슬라이더로 맞춘 값을 알려주시면 코드 상수에 반영합니다. 현재 코드 값은
  <code>방출 10 / 수명 0.80 / 상승 20 / 불투명 0.40 / 크기 1.4</code> (확정 반영됨) 입니다.
  <br><br>
  <b>LINEAR 필터는 이미 적용했습니다</b>(체크된 상태 = 지금 게임). 꺼보면 이전 상태입니다.
  <br><br>
  <b>확대 슬라이더는 관찰용</b>입니다. 실제 게임에서는 1× (53×64) 로 보입니다 —
  연기가 과한지 판단할 때는 <b>꼭 1× 로</b> 확인해 주세요.
</div>

<script>
const IMG = { newSheet: "__NEW__", oldSheet: "__OLD__",
              floor: "__FLOOR__", props: "__PROPS__", gob: "__GOB__" };
const CW = 96, CH = 116, SCALE = 0.55, TW = 128, TH = 64, PW = 96, PH = 112;
const loaded = {};
let ready = 0;
const keys = Object.keys(IMG);
keys.forEach(k => {
  const im = new Image();
  im.onload = () => { if (++ready === keys.length) start(); };
  im.src = IMG[k];
  loaded[k] = im;
});

const S = { fps: 6, zoom: 4, smooth: true, prop: true, paused: false, frame: 0,
            smoke: true, rate: 10, life: 0.80, rise: 20, alpha: 0.40, size: 1.4 };
const el = id => document.getElementById(id);

// ---- 연기 오라: main.js 의 updateSmokeAura 와 같은 로직 ----
const SMOKE_MAX = 18, SMOKE_COLOR = '224,92,255';
const CELLS = [[-6, 6], [-8, 32], [6, 34]];   // 후드 위 / 왼어깨 / 오른어깨
let parts = [];
let acc = 0;

function anchor(i, s) {
  const c = CELLS[i];
  return [c[0] * s, (c[1] - 116 * 0.8) * s];
}
function smokeStep(dt, cx, gy, s) {
  if (S.smoke) {
    acc += dt * S.rate;
    while (acc >= 1 && parts.length < SMOKE_MAX) {
      acc -= 1;
      const [ox, oy] = anchor(Math.random() * 3 | 0, s);
      parts.push({ x: cx + ox + (Math.random() - .5) * 5, y: gy + oy + (Math.random() - .5) * 4,
                   vx: (Math.random() - .5) * 9, life: S.life * (.75 + Math.random() * .5),
                   max: 0, r0: 2.2 + Math.random() * 1.6, ph: Math.random() * 6.28 });
      parts[parts.length - 1].max = parts[parts.length - 1].life;
    }
    if (acc > 2) acc = 2;
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    const k = 1 - p.life / p.max;
    p.y -= S.rise * dt * (1 - k * .45);
    p.x += (p.vx + Math.sin(p.ph + k * 5) * 7) * dt;
  }
}
function smokeDraw(ctx) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of parts) {
    const k = 1 - p.life / p.max;
    const a = (k < .18 ? k / .18 : 1 - (k - .18) / .82) * S.alpha;
    if (a <= 0) continue;
    const r = (p.r0 + k * 3.4) * S.size;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    g.addColorStop(0, `rgba(${SMOKE_COLOR},${(a * .85).toFixed(3)})`);
    g.addColorStop(.45, `rgba(${SMOKE_COLOR},${(a * .32).toFixed(3)})`);
    g.addColorStop(1, `rgba(${SMOKE_COLOR},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
  }
  ctx.restore();
}

function drawScene(ctx, sheet, w, h) {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#0b0c0e';
  ctx.fillRect(0, 0, w, h);
  // 바닥 — main.js 와 같은 좌표 해시
  const n = Math.floor(loaded.floor.width / TW);
  for (let r = -2; r < h / TH + 4; r++) {
    for (let c = -2; c < w / TW + 6; c++) {
      const hv = ((c * 73856093) ^ (r * 19349663)) >>> 0;
      const t = hv % n;
      const sx = ((c - r) * TW / 2) | 0, sy = ((c + r) * TH / 2) | 0;
      if ((hv >> 8) & 1) {
        ctx.save(); ctx.translate(sx + TW, sy); ctx.scale(-1, 1);
        ctx.drawImage(loaded.floor, t * TW, 0, TW, TH, 0, 0, TW, TH); ctx.restore();
      } else {
        ctx.drawImage(loaded.floor, t * TW, 0, TW, TH, sx, sy, TW, TH);
      }
    }
  }
  const cx = w / 2, gy = h - 46;
  if (S.prop) {
    ctx.drawImage(loaded.props, 0, 0, PW, PH, 18 - PW / 2, 74 - (PH - 1), PW, PH);
    ctx.drawImage(loaded.props, 6 * PW, 0, PW, PH, w - 40 - PW / 2, 66 - (PH - 1), PW, PH);
  }
  // 발밑 그림자
  ctx.fillStyle = 'rgba(0,0,0,.42)';
  ctx.beginPath(); ctx.ellipse(cx, gy, 12, 5, 0, 0, 7); ctx.fill();
  if (S.prop) {
    ctx.beginPath(); ctx.ellipse(cx - 62, gy - 12, 8, 3, 0, 0, 7); ctx.fill();
    ctx.drawImage(loaded.gob, 0, 0, 32, 32, cx - 62 - 17, gy - 12 - 25, 35, 35);
    ctx.beginPath(); ctx.ellipse(cx + 66, gy - 22, 8, 3, 0, 0, 7); ctx.fill();
    ctx.drawImage(loaded.gob, 0, 0, 32, 32, cx + 66 - 17, gy - 22 - 25, 35, 35);
  }
  // 플레이어 — 0.55배 축소, 원점 (0.5, 0.8)
  const dw = CW * SCALE, dh = CH * SCALE;
  ctx.imageSmoothingEnabled = S.smooth;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sheet, S.frame * CW, 0, CW, CH,
                Math.round(cx - dw / 2), Math.round(gy - dh * 0.8), dw, dh);
  ctx.imageSmoothingEnabled = false;
  smokeDraw(ctx);   // 캐릭터 **위**에 그린다 (게임에서도 smokeLayer 가 위)
}

const W0 = 260, H0 = 200;
function render() {
  for (const [id, sheet] of [['cNew', loaded.newSheet], ['cOld', loaded.oldSheet]]) {
    const cv = el(id);
    const off = document.createElement('canvas');
    off.width = W0; off.height = H0;
    drawScene(off.getContext('2d'), sheet, W0, H0);
    cv.width = W0 * S.zoom; cv.height = H0 * S.zoom;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, cv.width, cv.height);
  }
}

// 연기는 매 프레임 움직여야 하므로 애니 프레임과 별도로 계속 돈다
let last = 0, animAcc = 0;
function loop(t) {
  const dt = Math.min((t - last) / 1000 || 0, 0.05);
  last = t;
  if (!S.paused) {
    animAcc += dt;
    if (animAcc > 1 / S.fps) { S.frame = (S.frame + 1) % 4; animAcc = 0; }
    smokeStep(dt, W0 / 2, H0 - 46, 0.55);
    render();
  }
  requestAnimationFrame(loop);
}

function start() {
  const bind = (id, key, fmt, mul) => {
    el(id).oninput = e => {
      S[key] = +e.target.value * (mul || 1);
      el(id + 'v').textContent = fmt(S[key]);
    };
  };
  el('fps').oninput = e => { S.fps = +e.target.value; el('fpsv').textContent = S.fps; };
  el('zoom').oninput = e => {
    S.zoom = +e.target.value; el('zoomv').textContent = S.zoom + '×'; render(); };
  el('smooth').onchange = e => { S.smooth = e.target.checked; render(); };
  el('showprop').onchange = e => { S.prop = e.target.checked; render(); };
  el('smoke').onchange = e => { S.smoke = e.target.checked; if (!S.smoke) parts = []; };
  el('pause').onclick = () => {
    S.paused = !S.paused; el('pause').textContent = S.paused ? '재생' : '일시정지'; };
  bind('rate', 'rate', v => v.toFixed(0));
  bind('life', 'life', v => v.toFixed(2) + 's', 0.01);
  bind('rise', 'rise', v => v.toFixed(0));
  bind('alpha', 'alpha', v => v.toFixed(2), 0.01);
  bind('size', 'size', v => v.toFixed(1) + '×', 0.1);
  render();
  requestAnimationFrame(loop);
}
</script>
"""

html = (HTML.replace('__NEW__', b64(new)).replace('__OLD__', b64(old))
        .replace('__FLOOR__', b64(floor)).replace('__PROPS__', b64(props))
        .replace('__GOB__', b64(gob)))
out = HERE / '_idle_test.html'
out.write_text(html, encoding='utf-8')
print(f'saved {out.name}  {out.stat().st_size / 1024:.0f}KB')
