"""애니메이션 확인용 단독 HTML (서버 불필요). 있는 애니만 자동으로 담는다.

게임과 동일 조건
  · 96×116 셀 × 0.55 = 53×64px, LINEAR 필터
  · fps: idle 6 / run·back_run 12 / attack·multishot 14 / hit·death 10  (main.js defs)
  · 연기 오라 파티클 (방출 10 / 수명 0.80 / 상승 20 / 불투명 0.40 / 크기 1.4)
  · **달릴 때 바닥이 흐른다** — 게임은 월드를 반대로 옮겨 플레이어를 중앙에 고정한다.
    이게 없으면 제자리 뛰기로 보여서 달리기 판단이 안 된다. 속도 100px/s (config.player.speed)

실행: python3 tools/sprites/make_anim_test.py
출력: tools/sprites/_anim_test.html
"""
import base64
import io
import json
import pathlib

import numpy as np
from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent
PUB = HERE.parent.parent / 'public' / 'sprites' / 'dungeon'
CW, CH = 96, 116
# 실제 배포 시트를 본다. 예전엔 _player_sheet_new.png 를 봤는데, 조립 스크립트가
# deliverables 쪽에 바로 쓰기 시작하면서 테스트가 옛 시트를 보는 사고가 났다.
SHEET = PUB / 'deliverables' / 'player_spritesheet.png'

# (라벨, 행, 프레임수, fps, 이동속도px/s)  ← 프레임수는 실제 시트를 보고 자동 축소
ANIMS = [
    ('idle', 0, 4, 6, 0),
    # 내용은 walk 다. 4프레임(열 0,1,3,5)에 fps 12 면 걸음당 16.7px / 보폭 17.9px
    # → 발 미끄러짐 0.93. 14 로 올리면 0.80 이라 발이 끌린다.
    ('run', 1, 8, 12, 100),
    ('back_run', 2, 8, 12, 100),
    ('attack', 3, 6, 14, 0),
    ('multishot', 4, 6, 14, 0),
    ('hit', 5, 3, 10, 0),
    ('death', 6, 8, 10, 0),
]


def b64(im):
    b = io.BytesIO()
    im.save(b, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()


sheet = Image.open(SHEET).convert('RGBA')
a = np.asarray(sheet)

# 실제로 그려진 칸만 남긴다
avail = []
for name, row, n, fps, spd in ANIMS:
    cnt = 0
    for c in range(8):
        cell = a[row * CH:(row + 1) * CH, c * CW:(c + 1) * CW, 3]
        if (cell > 40).sum() > 200:
            cnt = c + 1
    if cnt:
        # 프레임별 '떠 있는 양' 실측 — 시트에는 이미 반영돼 있지만, 테스트에서
        # 슬라이더로 되돌려 낮출 수 있게 값을 넘긴다.
        nn = min(cnt, n)
        bots = []
        for c in range(nn):
            col = a[row * CH:(row + 1) * CH, c * CW:(c + 1) * CW, 3]
            ys = np.nonzero((col > 40).any(axis=1))[0]
            bots.append(int(ys.max()) if len(ys) else CH - 1)
        base = max(bots)
        lifts = [base - b for b in bots]
        avail.append({'name': name, 'row': row, 'n': nn, 'fps': fps, 'spd': spd,
                      'lifts': lifts})
        print(f'  {name:10} 행{row}  {nn}프레임  {fps}fps  이동 {spd}  떠있음 {lifts}')
if not avail:
    raise SystemExit('시트가 비어 있다')

HTML = """<!doctype html>
<meta charset="utf-8">
<title>애니메이션 테스트</title>
<style>
 body{margin:0;background:#0b0c0e;color:#cdd6f4;font:14px/1.55 -apple-system,'Segoe UI',sans-serif;padding:18px 22px}
 h1{font-size:16px;margin:0 0 4px;font-weight:600}
 .sub{color:#7f849c;font-size:12px;margin-bottom:14px}
 .ctl{display:flex;gap:18px;align-items:center;flex-wrap:wrap;background:#181926;
      padding:11px 15px;border-radius:6px;margin-bottom:14px}
 .ctl label{display:flex;gap:6px;align-items:center;font-size:12px;color:#a6adc8}
 input[type=range]{width:120px}
 .val{color:#f9e2af;font-variant-numeric:tabular-nums;min-width:32px}
 button{background:#313244;color:#cdd6f4;border:0;padding:6px 11px;border-radius:4px;
        cursor:pointer;font-size:12px}
 button:hover{background:#45475a}
 button.on{background:#7d5bbe;color:#fff}
 canvas{image-rendering:pixelated;border-radius:4px;display:block}
 .row{display:flex;gap:20px;flex-wrap:wrap}
 .pane h2{font-size:12px;margin:0 0 5px;color:#a6adc8;font-weight:600}
 .note{color:#7f849c;font-size:12px;max-width:780px;margin-top:14px}
 .note b{color:#cdd6f4;font-weight:600}
 code{background:#181926;padding:1px 5px;border-radius:3px;color:#f9e2af}
</style>
<h1>플레이어 애니메이션 — 게임 동일 조건</h1>
<div class="sub">96×116 셀 × 0.55 = 53×64px · LINEAR 필터 · 연기 오라 켜짐 · 달릴 때 바닥이 흐릅니다</div>

<div class="ctl" id="tabs"></div>

<div class="ctl">
  <label>확대 <input type="range" id="zoom" min="1" max="8" value="4">
    <span class="val" id="zoomv">4×</span></label>
  <label>fps <input type="range" id="fps" min="1" max="30" value="12">
    <span class="val" id="fpsv">12</span></label>
  <label>재생 순서 <input type="text" id="ord" size="16" value="">
    <span class="val" id="ordv"></span></label>
  <button id="ordreset">전체</button>
  <label><input type="checkbox" id="bow" checked> 활(뒤)</label>
  <label>활x <input type="range" id="bx" min="-40" max="40" value="15">
    <span class="val" id="bxv">15</span></label>
  <label>활y(발끝기준) <input type="range" id="by" min="-110" max="10" value="-38">
    <span class="val" id="byv">-38</span></label>
  <label>활각도 <input type="range" id="br" min="-90" max="90" value="45">
    <span class="val" id="brv">45</span></label>
  <button id="bowsave">이 프레임 저장</button>
  <button id="bowclear">프레임별 해제</button>
  <textarea id="bowout" rows="2" style="width:100%;font:11px monospace;
    background:#14151a;color:#cfe;border:1px solid #333;margin-top:6px"></textarea>
  <button class="preset" data-o="1,2,4,6">1,2,4,6 ★확정</button>
  <button class="preset" data-o="1,3,4,6">1,3,4,6</button>
  <button class="preset" data-o="2,3,5,6">2,3,5,6</button>
  <button class="preset" data-o="1,2,3,4,5,6">전체 6장</button>
  <label><input type="checkbox" id="smooth" checked> LINEAR</label>
  <label><input type="checkbox" id="smoke" checked> 연기</label>
  <label><input type="checkbox" id="scroll" checked> 바닥 흐름</label>
  <label>점프 높이 <input type="range" id="damp" min="0" max="100" value="100">
    <span class="val" id="dampv">100%</span></label>
  <button id="pause">일시정지</button>
  <button id="step">한 프레임</button>
  <span class="val" id="fi">-</span>
</div>

<div class="row">
  <div class="pane"><h2 id="t1">현재 선택</h2><canvas id="c1"></canvas></div>
  <div class="pane"><h2>프레임 나열 (정지)</h2><canvas id="c2"></canvas></div>
</div>

<div class="note">
  <b>달리기 판단은 '바닥 흐름'을 켠 상태로</b> 해주세요. 게임은 월드를 반대로 옮겨
  플레이어를 화면 중앙에 고정하므로, 바닥이 흐르지 않으면 제자리 뛰기로 보여
  발이 미끄러지는지(foot sliding) 알 수 없습니다. 속도는 <code>config.player.speed = 100</code> 입니다.
  <br><br>
  <b>점프 높이</b>를 낮춰보세요. 지금 4프레임은 사실 <b>한 걸음</b>이라
  공중 구간이 한 번뿐이고, 그래서 100%에서는 같은 발로 깡충 뛰는 것처럼 보입니다.
  30~50% 로 내리면 "살짝 흔들리며 달리는" 느낌에 가까워집니다.
  <br><br>
  <b>활</b>은 플레이어 <b>뒤</b>에 그려집니다(등에 멘 배치).
  슬라이더로 위치를 맞춘 뒤, 프레임마다 다르게 하려면 <b>일시정지 → 프레임 이동 →
  슬라이더 조정 → '이 프레임 저장'</b> 을 반복하세요.
  아래 칸에 <code>BOW_OFF</code> 배열이 나오면 그대로 main.js 에 넣으면 됩니다.
  <b>활y 는 발끝(접지선) 기준</b>이고 음수가 위입니다 — 파이프라인의 ANCHOR 와 같은 기준입니다.
  캐릭터 키가 화면에서 64px 이므로 <code>-38</code> 이면 허리~등 높이입니다.<br>
  <b>재생 순서</b>에 <code>1,3,4,6</code> 처럼 넣으면 그 프레임만 그 순서로 돕니다.
  시트를 다시 만들 필요가 없습니다 — Phaser 도 프레임 번호 배열을 그대로 받습니다.
  <code>1,2,3,3,4,5,6,6</code> 처럼 같은 번호를 두 번 넣으면 그 프레임이 두 배로 머뭅니다.<br>
  <b>fps 슬라이더</b>는 애니를 고르면 게임 기본값으로 돌아갑니다.
  run 기본값은 12fps 이고, 4프레임이라 한 사이클 0.33초입니다.
</div>

<script>
const SHEET = "__SHEET__", FLOOR = "__FLOOR__", PROPS = "__PROPS__", GOB = "__GOB__";
const BOW = "__BOW__";
const ANIMS = __ANIMS__;
const CW=96, CH=116, SCALE=0.55, TW=128, TH=64, PW=96, PH=112;
const img={}; let ready=0;
const SRC={sheet:SHEET,floor:FLOOR,props:PROPS,gob:GOB, bow:BOW};
Object.keys(SRC).forEach(k=>{const i=new Image();i.onload=()=>{if(++ready===Object.keys(SRC).length)start()};i.src=SRC[k];img[k]=i});

const S={anim:ANIMS.find(a=>a.name==='run')||ANIMS[0], zoom:4, fps:12, smooth:true, order:null,
  bow:true, bx:15, by:-38, br:45, bowOff:null,
         smoke:true, scroll:true, paused:false, frame:0, camX:0, damp:1};
const el=i=>document.getElementById(i);

// ---- 연기 오라: main.js updateSmokeAura 와 동일 ----
const SMOKE_MAX=18, SC='224,92,255', RATE=10, LIFE=0.80, RISE=20, ALPHA=0.40, SIZE=1.4;
const CELLS=[[-6,6],[-8,32],[6,34]];
let parts=[], acc=0;
function smokeStep(dt,cx,gy,s){
  if(S.smoke && S.anim.name!=='death'){
    acc+=dt*RATE;
    while(acc>=1 && parts.length<SMOKE_MAX){
      acc-=1; const c=CELLS[Math.random()*3|0];
      parts.push({x:cx+c[0]*s+(Math.random()-.5)*5, y:gy+(c[1]-CH*0.8)*s+(Math.random()-.5)*4,
                  vx:(Math.random()-.5)*9, life:LIFE*(.75+Math.random()*.5), max:0,
                  r0:2.2+Math.random()*1.6, ph:Math.random()*6.28});
      const p=parts[parts.length-1]; p.max=p.life;
    }
    if(acc>2)acc=2;
  }
  for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.life-=dt;
    if(p.life<=0){parts.splice(i,1);continue}
    const k=1-p.life/p.max; p.y-=RISE*dt*(1-k*.45); p.x+=(p.vx+Math.sin(p.ph+k*5)*7)*dt;}
}
function smokeDraw(ctx){
  ctx.save(); ctx.globalCompositeOperation='lighter';
  for(const p of parts){const k=1-p.life/p.max;
    const al=(k<.18?k/.18:1-(k-.18)/.82)*ALPHA; if(al<=0)continue;
    const r=(p.r0+k*3.4)*SIZE;
    const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r);
    g.addColorStop(0,`rgba(${SC},${(al*.85).toFixed(3)})`);
    g.addColorStop(.45,`rgba(${SC},${(al*.32).toFixed(3)})`);
    g.addColorStop(1,`rgba(${SC},0)`);
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(p.x,p.y,r,0,7); ctx.fill();}
  ctx.restore();
}

const W0=300,H0=230;
function drawScene(ctx){
  ctx.imageSmoothingEnabled=false;
  ctx.fillStyle='#0b0c0e'; ctx.fillRect(0,0,W0,H0);
  const n=Math.floor(img.floor.width/TW);
  // 바닥 — 카메라 오프셋만큼 밀어서 그린다(게임의 worldLayer 이동과 같다)
  const ox=-((S.camX%TW)+TW)%TW;
  for(let r=-3;r<H0/TH+5;r++)for(let c=-3;c<W0/TW+7;c++){
    const cc=c+Math.floor(S.camX/TW);
    const hv=((cc*73856093)^(r*19349663))>>>0, t=hv%n;
    const sx=((c-r)*TW/2|0)+ox, sy=((c+r)*TH/2|0);
    if((hv>>8)&1){ctx.save();ctx.translate(sx+TW,sy);ctx.scale(-1,1);
      ctx.drawImage(img.floor,t*TW,0,TW,TH,0,0,TW,TH);ctx.restore();}
    else ctx.drawImage(img.floor,t*TW,0,TW,TH,sx,sy,TW,TH);
  }
  const cx=W0/2, gy=H0-52;
  // 프롭·적도 카메라를 따라 흐른다 → 발 미끄러짐을 눈으로 잡을 수 있다
  const p1=40-S.camX, p2=250-S.camX;
  for(const [f,px2,py2] of [[0,p1,72],[3,p2,80]]){
    const x=((px2%900)+900)%900-100;
    ctx.drawImage(img.props,f*PW,0,PW,PH,x-PW/2,py2-(PH-1),PW,PH);
  }
  ctx.fillStyle='rgba(0,0,0,.42)';
  for(const [gx,gyy] of [[60-S.camX,150],[240-S.camX,140]]){
    const x=((gx%900)+900)%900-100;
    ctx.beginPath();ctx.ellipse(x,gyy,8,3,0,0,7);ctx.fill();
    ctx.drawImage(img.gob,0,0,32,32,x-17,gyy-25,35,35);
  }
  ctx.fillStyle='rgba(0,0,0,.42)';
  ctx.beginPath();ctx.ellipse(cx,gy,12,5,0,0,7);ctx.fill();
  const dw=CW*SCALE, dh=CH*SCALE;
  ctx.imageSmoothingEnabled=S.smooth; ctx.imageSmoothingQuality='high';
  // 점프 높이 감쇠 — 시트에는 100% 로 구워져 있으므로, 낮추려면 그만큼 내려 그린다
  const col=S.order?S.order[S.frame%S.order.length]:S.frame;
  S.col=col;                       // renderMain 에서 쓴다. 함수가 달라 지역변수로는 안 넘어간다
  const lf=(S.anim.lifts&&S.anim.lifts[col])||0;
  const drop=lf*(1-S.damp)*SCALE;
  // ★ 활은 플레이어 **앞에 그리지 않는다** — 먼저 그려서 몸 뒤로 깔린다.
  //   등에 멘 활처럼 보이게 하는 배치다.
  if(S.bow && img.bow){
    const off=(S.bowOff&&S.bowOff[col])||{x:S.bx,y:S.by,r:S.br};
    ctx.save();
    // y 는 **발끝(gy) 기준**. 음수가 위. 예전엔 스프라이트 상단 기준이라
    // 아래로 내리려면 큰 양수가 필요했고, 슬라이더 상한에 막혔다.
    ctx.translate(Math.round(cx+off.x*SCALE), Math.round(gy+drop+off.y*SCALE));
    ctx.rotate(off.r*Math.PI/180);
    ctx.imageSmoothingEnabled=S.smooth;
    const bw=img.bow.width*SCALE, bh=img.bow.height*SCALE;
    ctx.drawImage(img.bow, -bw*0.5, -bh*0.52, bw, bh);
    ctx.restore();
  }
  ctx.drawImage(img.sheet, col*CW, S.anim.row*CH, CW, CH,
                Math.round(cx-dw/2), Math.round(gy-dh*0.8+drop), dw, dh);
  ctx.imageSmoothingEnabled=false;
  smokeDraw(ctx);
}

function renderMain(){
  const off=document.createElement('canvas'); off.width=W0; off.height=H0;
  drawScene(off.getContext('2d'));
  const cv=el('c1'); cv.width=W0*S.zoom; cv.height=H0*S.zoom;
  const c=cv.getContext('2d'); c.imageSmoothingEnabled=false;
  c.drawImage(off,0,0,cv.width,cv.height);
  el('fi').textContent=S.order
    ? `${S.frame+1}/${S.order.length}  (시트 f${(S.col|0)+1})`
    : `프레임 ${S.frame+1}/${S.anim.n}`;
}
function renderStrip(){
  const Z=Math.max(2,Math.min(4,S.zoom));
  const cv=el('c2'); const w=(CW*SCALE+6)*S.anim.n, h=CH*SCALE+8;
  cv.width=w*Z; cv.height=h*Z;
  const off=document.createElement('canvas'); off.width=w; off.height=h;
  const c=off.getContext('2d'); c.fillStyle='#1b1c22'; c.fillRect(0,0,w,h);
  c.imageSmoothingEnabled=S.smooth;
  for(let i=0;i<S.anim.n;i++)
    c.drawImage(img.sheet,i*CW,S.anim.row*CH,CW,CH,i*(CW*SCALE+6)+3,4,CW*SCALE,CH*SCALE);
  const cc=cv.getContext('2d'); cc.imageSmoothingEnabled=false;
  cc.drawImage(off,0,0,cv.width,cv.height);
}
function render(){renderMain();renderStrip()}

let last=0, animAcc=0;
function loop(t){
  const dt=Math.min((t-last)/1000||0,.05); last=t;
  if(!S.paused){
    animAcc+=dt;
    if(animAcc>1/S.fps){const L=S.order?S.order.length:S.anim.n; S.frame=(S.frame+1)%L; animAcc=0}
    if(S.scroll) S.camX+=S.anim.spd*dt;
    smokeStep(dt,W0/2,H0-52,SCALE);
    render();
  }
  requestAnimationFrame(loop);
}
function pick(a){
  S.anim=a; S.frame=0; S.order=null; el('ord').value=''; el('ordv').textContent='전체'; S.fps=a.fps; el('fps').value=a.fps; el('fpsv').textContent=a.fps;
  el('t1').textContent=`${a.name}  (${a.n}프레임 · ${a.fps}fps${a.spd?' · 이동 '+a.spd+'px/s':''}`
    + (a.lifts&&Math.max(...a.lifts)?` · 최대 ${Math.max(...a.lifts)}px 뜸)`:')');
  [...el('tabs').children].forEach(b=>b.classList.toggle('on',b.dataset.n===a.name));
  parts=[]; render();
}
function start(){
  ANIMS.forEach(a=>{const b=document.createElement('button');
    b.textContent=a.name; b.dataset.n=a.name; b.onclick=()=>pick(a); el('tabs').appendChild(b)});
  el('zoom').oninput=e=>{S.zoom=+e.target.value;el('zoomv').textContent=S.zoom+'×';render()};
  el('fps').oninput=e=>{S.fps=+e.target.value;el('fpsv').textContent=S.fps};
  // 재생 순서 — "1,3,4,6" 처럼 **1부터 센 프레임 번호**를 쉼표로. 비우면 전체 순서.
  // 시트를 다시 만들 필요가 없다. Phaser 도 generateFrameNumbers 에 배열을 받는다.
  function applyOrder(){
    const t=el('ord').value.trim();
    if(!t){S.order=null; el('ordv').textContent='전체'; S.frame=0; return}
    const v=t.split(/[^0-9]+/).filter(Boolean).map(x=>+x-1)
             .filter(i=>i>=0&&i<S.anim.n);
    S.order=v.length?v:null;
    el('ordv').textContent=v.length?v.map(i=>i+1).join('-'):'전체';
    S.frame=0;
  }
  el('ord').oninput=applyOrder;
  el('ordreset').onclick=()=>{el('ord').value='';applyOrder()};
  el('bow').onchange=e=>{S.bow=e.target.checked;render()};
  ['bx','by','br'].forEach(k=>{el(k).oninput=e=>{
    S[k]=+e.target.value; el(k+'v').textContent=S[k];
    if(S.bowOff&&S.bowOff[S.col]) S.bowOff[S.col]={x:S.bx,y:S.by,r:S.br};
    render();
  }});
  // 프레임별 오프셋 — run 은 프레임마다 손 위치가 다르다.
  // 프레임을 멈춘 뒤 슬라이더로 맞추고 '이 프레임 저장'.
  el('bowsave').onclick=()=>{
    if(!S.bowOff) S.bowOff=new Array(S.anim.n).fill(null)
                    .map(()=>({x:S.bx,y:S.by,r:S.br}));
    S.bowOff[S.col]={x:S.bx,y:S.by,r:S.br};
    el('bowout').value='const BOW_OFF = '+JSON.stringify(
      S.bowOff.map(o=>[o.x,o.y,o.r]))+'  // [x, y, 각도] × 프레임';
  };
  el('bowclear').onclick=()=>{S.bowOff=null; el('bowout').value=''; render()};
  document.querySelectorAll('.preset').forEach(b=>{
    b.onclick=()=>{el('ord').value=b.dataset.o; applyOrder()};
  });
  el('smooth').onchange=e=>{S.smooth=e.target.checked;render()};
  el('smoke').onchange=e=>{S.smoke=e.target.checked;if(!S.smoke)parts=[]};
  el('scroll').onchange=e=>{S.scroll=e.target.checked};
  el('damp').oninput=e=>{S.damp=+e.target.value/100;
    el('dampv').textContent=e.target.value+'%';render()};
  el('pause').onclick=()=>{S.paused=!S.paused;el('pause').textContent=S.paused?'재생':'일시정지'};
  el('step').onclick=()=>{const L=S.order?S.order.length:S.anim.n; S.frame=(S.frame+1)%L; render()};
  pick(S.anim);
  requestAnimationFrame(loop);
}
</script>
"""

html = (HTML.replace('__SHEET__', b64(sheet))
        .replace('__FLOOR__', b64(Image.open(PUB / 'tileset_iso_stone.png').convert('RGBA')))
        .replace('__PROPS__', b64(Image.open(PUB / 'props_iso.png').convert('RGBA')))
        .replace('__GOB__', b64(Image.open(PUB / 'enemies_sheet.png').convert('RGBA')
                                .crop((0, 0, 32, 32))))
        .replace('__BOW__', b64(Image.open(HERE.parent.parent / 'public' / 'sprites' / 'dungeon'
                                   / 'deliverables' / 'player_bow.png').convert('RGBA')))
        .replace('__ANIMS__', json.dumps(avail)))
out = HERE / '_anim_test.html'
out.write_text(html, encoding='utf-8')
print(f'\nsaved {out.name}  {out.stat().st_size / 1024:.0f}KB')
