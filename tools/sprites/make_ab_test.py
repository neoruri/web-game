"""두 소스(Gemini / GPT)의 walk 를 나란히 재생해서 눈으로 비교한다.

수치로는 Gemini 가 부드럽고(인접변화 7) GPT 가 발광이 강하다(1.03% vs 0.58%).
둘 다 장단이 있어서 **움직이는 걸 나란히 봐야** 판단이 된다.

각 소스를 6프레임으로 자르고 → 초록 언매팅 → 발끝 정렬 → 96×116 셀에 담아
같은 fps·같은 바닥 흐름으로 동시에 돌린다.

실행: python3 tools/sprites/make_ab_test.py
출력: tools/sprites/_ab_test.html   (단독 실행, 서버 불필요)
"""
import base64
import io
import json
import pathlib

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = pathlib.Path(__file__).resolve().parent
STRIPS = HERE / 'player_strips'
PUB = HERE.parent.parent / 'public' / 'sprites' / 'dungeon'

CW, CH, ANCHOR = 96, 116, 108
GLOW = np.array([224.0, 92.0, 255.0])       # #e05cff

SOURCES = [
    ('Gemini', STRIPS / 'walk.png', [0, 259, 567, 851, 1155, 1474, 1792]),
    ('GPT', STRIPS / 'gptwalk.png', [0, 298, 570, 830, 1108, 1380, 1774]),
]


def unmat(path):
    """초록 언매팅. 단순 임계값은 얇은 부분을 놓치므로 greenness 로 알파를 추정한다."""
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float64)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    core = (G > 170) & (R < 140) & (B < 140)
    BG = a[core].mean(axis=0)

    def greenness(x):
        return x[..., 1] - (x[..., 0] + x[..., 2]) / 2

    gv = greenness(a)
    g_bg = greenness(BG[None, None, :])[0, 0]
    g_fg = np.percentile(gv[~core], 92)
    al = np.clip((g_bg - gv) / (g_bg - g_fg), 0, 1)
    al[core] = 0.0
    a3 = al[..., None]
    with np.errstate(invalid='ignore', divide='ignore'):
        un = np.where(a3 > 0.02, (a - (1 - a3) * BG[None, None, :]) / np.maximum(a3, 1e-6), 0)
    return np.clip(un, 0, 255), al


def boost_glow(rgb, al, target):
    """자마젠타 발광을 목표 면적까지 끌어올린다.

    Gemini 결과는 발광이 0.58% 까지 떨어져 색조 검출이 초록(119°)으로 나왔다.
    64px 에서 눈이 따라갈 지점이 사라지므로 조립 단계에서 복구한다.
    """
    m = al > 0.35
    px = rgb[m]
    mx = px.max(axis=1)
    mn = px.min(axis=1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    cur = ((sat > 0.30) & (mx > 100)).mean() * 100
    if cur >= target:
        return rgb, cur, cur
    # 마젠타다움 = R+B 가 G 보다 얼마나 큰가. 그 정도에 비례해 GLOW 쪽으로 당긴다.
    mag = (rgb[..., 0] + rgb[..., 2]) / 2 - rgb[..., 1]
    w = np.clip((mag - 4) / 26, 0, 1) * (al > 0.35)
    k = min(1.0, (target - cur) / max(cur, 0.1) * 0.55)
    out = rgb * (1 - (w * k)[..., None]) + GLOW[None, None, :] * (w * k)[..., None]
    px = out[m]
    mx = px.max(axis=1); mn = px.min(axis=1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    return np.clip(out, 0, 255), cur, ((sat > 0.30) & (mx > 100)).mean() * 100


def build(path, cuts, label):
    rgb, al = unmat(path)
    rgb, before, after = boost_glow(rgb, al, target=2.4)
    solid = al > 0.35
    lab, n = ndimage.label(solid)
    sz = ndimage.sum(solid, lab, range(1, n + 1))
    keep = np.isin(lab, [i + 1 for i in range(n) if sz[i] > 2000])

    boxes = []
    for i in range(6):
        s = keep[:, cuts[i]:cuts[i + 1]]
        ys, xs = np.nonzero(s)
        boxes.append((ys.min(), ys.max(), cuts[i] + xs.min(), cuts[i] + xs.max()))
    # 애니 단위 공통 배율 — 프레임마다 따로 맞추면 커졌다 작아진다
    hmax = max(b[1] - b[0] + 1 for b in boxes)
    k = min((ANCHOR - 4) / hmax, CW * 0.92 / max(b[3] - b[2] + 1 for b in boxes))

    sheet = Image.new('RGBA', (CW * 6, CH), (0, 0, 0, 0))
    for i, (y0, y1, x0, x1) in enumerate(boxes):
        sub = np.dstack([rgb[y0:y1 + 1, x0:x1 + 1],
                         al[y0:y1 + 1, x0:x1 + 1] * 255]).astype(np.uint8)
        im = Image.fromarray(sub, 'RGBA')
        w, h = max(1, round(im.width * k)), max(1, round(im.height * k))
        im = im.resize((w, h), Image.LANCZOS)
        sheet.paste(im, (i * CW + (CW - w) // 2, ANCHOR - h), im)
    print(f'{label:<8} 배율 {k:.3f}  셀 안 키 {round(hmax*k)}px  '
          f'발광 {before:.2f}% → {after:.2f}%')
    return sheet


def b64(im):
    b = io.BytesIO()
    im.save(b, 'PNG')
    return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()


sheets = [(name, build(p, c, name)) for name, p, c in SOURCES]

HTML = """<!doctype html><meta charset="utf-8">
<title>walk A/B — Gemini vs GPT</title>
<style>
 body{margin:0;background:#0e0f12;color:#dfe3e6;font:13px/1.6 system-ui,sans-serif}
 .wrap{padding:14px 18px}
 .row{display:flex;gap:26px;flex-wrap:wrap;margin-top:12px}
 .card{background:#15171c;border:1px solid #262a31;border-radius:8px;padding:12px}
 h2{font-size:14px;margin:0 0 8px}
 canvas{display:block;image-rendering:pixelated;border-radius:4px}
 label{margin-right:14px}
 .val{display:inline-block;min-width:2.4em;color:#8fd0a8}
 .note{color:#98a2ad;max-width:70ch;margin-top:14px}
 .strip{margin-top:10px}
</style>
<div class="wrap">
<h1 style="font-size:16px;margin:0">walk 비교 — 같은 fps, 같은 바닥 흐름</h1>
<div>
 <label>fps <input type="range" id="fps" min="2" max="24" value="14">
   <span class="val" id="fpsv">14</span></label>
 <label>확대 <input type="range" id="zoom" min="2" max="10" value="5">
   <span class="val" id="zv">5</span></label>
 <label><input type="checkbox" id="scroll" checked> 바닥 흐름</label>
 <label><input type="checkbox" id="pause"> 일시정지</label>
 <button id="step">한 컷</button>
 <span class="val" id="fi"></span>
</div>
<div class="row" id="cards"></div>
<p class="note">
 왼쪽이 Gemini, 오른쪽이 GPT 입니다. 둘 다 발광을 <b>#e05cff</b> 로 복구했습니다.<br>
 <b>fps 14</b> 가 이동속도 100px/s 에서 발이 안 미끄러지는 값입니다.
 <b>바닥 흐름</b>을 켜야 실제 게임 조건입니다 — 바닥이 안 움직이면 제자리걸음으로 보입니다.
</p>
</div>
<script>
const SHEETS = __SHEETS__;
const CW=96, CH=116, TW=64, TH=64, SCALE=0.55;
const S={fps:14, zoom:5, scroll:true, paused:false, frame:0, camX:0};
const el=id=>document.getElementById(id);
const img={}; let ready=0;
const floorSrc="__FLOOR__";
const fimg=new Image(); fimg.onload=()=>{if(++ready===SHEETS.length+1)start()}; fimg.src=floorSrc;
SHEETS.forEach((s,i)=>{const im=new Image();
  im.onload=()=>{if(++ready===SHEETS.length+1)start()}; im.src=s.data; img[i]=im});

function start(){
  el('cards').innerHTML = SHEETS.map((s,i)=>
    `<div class="card"><h2>${s.name}</h2><canvas id="c${i}"></canvas>
     <canvas id="s${i}" class="strip"></canvas></div>`).join('');
  el('fps').oninput=e=>{S.fps=+e.target.value; el('fpsv').textContent=S.fps};
  el('zoom').oninput=e=>{S.zoom=+e.target.value; el('zv').textContent=S.zoom; draw()};
  el('scroll').onchange=e=>S.scroll=e.target.checked;
  el('pause').onchange=e=>S.paused=e.target.checked;
  el('step').onclick=()=>{S.frame=(S.frame+1)%6; draw()};
  requestAnimationFrame(loop);
}

function drawOne(i){
  const W0=180, H0=150;
  const off=document.createElement('canvas'); off.width=W0; off.height=H0;
  const c=off.getContext('2d'); c.imageSmoothingEnabled=false;
  c.fillStyle='#0b0c0e'; c.fillRect(0,0,W0,H0);
  // 바닥 — 카메라 오프셋만큼 밀어 그린다(게임의 worldLayer 이동과 같다)
  const n=Math.floor(fimg.width/TW), ox=-((S.camX%TW)+TW)%TW;
  for(let r=-1;r<H0/TH+1;r++) for(let q=-1;q<W0/TW+1;q++){
    const t=((q+r*3)%n+n)%n;
    c.drawImage(fimg,t*TW,0,TW,TH,ox+q*TW,r*TH,TW,TH);
  }
  const gy=H0-30, cx=W0/2;
  c.fillStyle='rgba(0,0,0,.35)';
  c.beginPath(); c.ellipse(cx,gy,12,5,0,0,7); c.fill();
  const dw=CW*SCALE, dh=CH*SCALE;
  c.imageSmoothingEnabled=true; c.imageSmoothingQuality='high';
  c.drawImage(img[i], S.frame*CW, 0, CW, CH,
              Math.round(cx-dw/2), Math.round(gy-dh*0.8), dw, dh);
  const cv=el('c'+i); cv.width=W0*S.zoom; cv.height=H0*S.zoom;
  const cc=cv.getContext('2d'); cc.imageSmoothingEnabled=false;
  cc.drawImage(off,0,0,cv.width,cv.height);

  // 아래 스트립 — 6프레임 나란히
  const Z=2, sw=(CW*SCALE+4)*6, sh=CH*SCALE+6;
  const so=document.createElement('canvas'); so.width=sw; so.height=sh;
  const sc=so.getContext('2d'); sc.fillStyle='#1b1c22'; sc.fillRect(0,0,sw,sh);
  for(let k=0;k<6;k++){
    sc.globalAlpha = k===S.frame?1:0.45;
    sc.drawImage(img[i],k*CW,0,CW,CH,k*(CW*SCALE+4)+2,3,CW*SCALE,CH*SCALE);
  }
  sc.globalAlpha=1;
  const s2=el('s'+i); s2.width=sw*Z; s2.height=sh*Z;
  const s2c=s2.getContext('2d'); s2c.imageSmoothingEnabled=false;
  s2c.drawImage(so,0,0,s2.width,s2.height);
}
function draw(){ SHEETS.forEach((_,i)=>drawOne(i)); el('fi').textContent=`프레임 ${S.frame+1}/6` }

let last=0, acc=0;
function loop(t){
  const dt=Math.min((t-last)/1000||0,.05); last=t;
  if(!S.paused){
    acc+=dt;
    if(acc>1/S.fps){ S.frame=(S.frame+1)%6; acc=0 }
    if(S.scroll) S.camX+=100*dt;
    draw();
  }
  requestAnimationFrame(loop);
}
</script>
"""

html = (HTML
        .replace('__SHEETS__', json.dumps([{'name': n, 'data': b64(s)} for n, s in sheets]))
        .replace('__FLOOR__', b64(Image.open(PUB / 'tileset_iso_stone.png').convert('RGBA'))))
out = HERE / '_ab_test.html'
out.write_text(html, encoding='utf-8')
print(f'\nsaved {out.name}  {out.stat().st_size / 1024:.0f}KB')
