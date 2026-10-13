'use strict';

/* ── Constants ───────────────────────────────────────────── */
const G_CONST      = 1.0;
const TWO_PI       = Math.PI * 2;
const DT           = 0.002;
const SUBSTEPS     = 8;
const HIST_MAX     = 600;
const SHADOW_EPS   = 1e-6;   // initial perturbation for Lyapunov
const LYAP_INTERVAL = 0.4;   // renormalize every 0.4 sim-time units

/* ── Parameters ──────────────────────────────────────────── */
let P = {
  preset:    'figure8',
  m1: 1.0, m2: 1.0, m3: 1.0,
  timeScale: 1.0,
  trailLen:  500,
  showCM:    false,
};

/* ── Simulation state ────────────────────────────────────── */
let bodies        = [];
let shadowBodies  = null;
let trails        = [[], [], []];
let simT          = 0;
let running       = true;
let lyapSum       = 0, lyapCount = 0, lyapNextT = 0;
let histT=[], histK=[], histU=[], histE=[];
let histLyapT=[], histLyap=[];
let _rafId        = null;
let _lastTs       = null;

/* ── Camera ──────────────────────────────────────────────── */
let zoom  = 120, panX = 0, panY = 0;
let _drag = false, _ds  = null;

/* ── Canvas ──────────────────────────────────────────────── */
const simCanvas   = document.getElementById('simCanvas');
const ctx         = simCanvas.getContext('2d');
const graphCanvas = document.getElementById('graphCanvas');
const gctx        = graphCanvas.getContext('2d');
const graphArea   = document.getElementById('graphArea');
const readoutEl   = document.getElementById('readout');
let SW=0, SH=0, GW=0, GH=0, DPR=1, dark=true;

const COLORS = ['#e05252', '#52aae0', '#7ae052'];
const MLBL   = ['M₁', 'M₂', 'M₃'];

/* ── Physics ─────────────────────────────────────────────── */
function accel(s) {
  const a = [{ax:0,ay:0},{ax:0,ay:0},{ax:0,ay:0}];
  for (let i=0; i<3; i++) {
    for (let j=i+1; j<3; j++) {
      const dx = s[j].x - s[i].x, dy = s[j].y - s[i].y;
      const r2 = dx*dx + dy*dy;
      if (r2 < 1e-10) continue;
      const r = Math.sqrt(r2), f = G_CONST / (r2 * r);
      a[i].ax += f * s[j].m * dx;  a[i].ay += f * s[j].m * dy;
      a[j].ax -= f * s[i].m * dx;  a[j].ay -= f * s[i].m * dy;
    }
  }
  return a;
}

function rk4(s, dt) {
  const d    = ss => { const ac=accel(ss); return ss.map((b,i)=>({dx:b.vx,dy:b.vy,dvx:ac[i].ax,dvy:ac[i].ay})); };
  const add  = (ss,ds,h) => ss.map((b,i)=>({...b, x:b.x+ds[i].dx*h, y:b.y+ds[i].dy*h, vx:b.vx+ds[i].dvx*h, vy:b.vy+ds[i].dvy*h}));
  const k1=d(s), k2=d(add(s,k1,dt/2)), k3=d(add(s,k2,dt/2)), k4=d(add(s,k3,dt));
  return s.map((b,i)=>({...b,
    x:  b.x  + (k1[i].dx  + 2*k2[i].dx  + 2*k3[i].dx  + k4[i].dx)  * dt/6,
    y:  b.y  + (k1[i].dy  + 2*k2[i].dy  + 2*k3[i].dy  + k4[i].dy)  * dt/6,
    vx: b.vx + (k1[i].dvx + 2*k2[i].dvx + 2*k3[i].dvx + k4[i].dvx) * dt/6,
    vy: b.vy + (k1[i].dvy + 2*k2[i].dvy + 2*k3[i].dvy + k4[i].dvy) * dt/6,
  }));
}

function computeEnergy(s) {
  let K=0, U=0;
  for (const b of s) K += 0.5*b.m*(b.vx*b.vx+b.vy*b.vy);
  for (let i=0; i<3; i++) for (let j=i+1; j<3; j++) {
    const dx=s[j].x-s[i].x, dy=s[j].y-s[i].y;
    const r=Math.sqrt(dx*dx+dy*dy);
    if (r>1e-12) U -= G_CONST*s[i].m*s[j].m/r;
  }
  return {K, U, E:K+U};
}

function computeL(s) {
  return s.reduce((L,b) => L + b.m*(b.x*b.vy - b.y*b.vx), 0);
}

function toCM(s) {
  const M   = s.reduce((a,b)=>a+b.m, 0);
  const cx  = s.reduce((a,b)=>a+b.m*b.x,  0)/M,  cy  = s.reduce((a,b)=>a+b.m*b.y,  0)/M;
  const cvx = s.reduce((a,b)=>a+b.m*b.vx, 0)/M,  cvy = s.reduce((a,b)=>a+b.m*b.vy, 0)/M;
  return s.map(b=>({...b, x:b.x-cx, y:b.y-cy, vx:b.vx-cvx, vy:b.vy-cvy}));
}

/* ── Shadow trajectory (Lyapunov exponent) ───────────────── */
function initShadow() {
  shadowBodies = bodies.map((b, i) => ({
    ...b,
    x: b.x + (i===0 ? SHADOW_EPS : 0),
  }));
  lyapSum=0; lyapCount=0; lyapNextT=simT+LYAP_INTERVAL;
  histLyapT=[]; histLyap=[];
}

function renormalizeShadow() {
  let d2=0;
  for (let i=0; i<3; i++) {
    const b=bodies[i], s=shadowBodies[i];
    d2 += (b.x-s.x)**2 + (b.y-s.y)**2 + (b.vx-s.vx)**2 + (b.vy-s.vy)**2;
  }
  const d = Math.sqrt(d2);
  if (d > 1e-20) {
    lyapSum += Math.log(d / SHADOW_EPS);
    lyapCount++;
    histLyap.push(lyapSum / (lyapCount * LYAP_INTERVAL));
    histLyapT.push(simT);
    if (histLyap.length > HIST_MAX) { histLyap.shift(); histLyapT.shift(); }
    const sc = SHADOW_EPS / d;
    shadowBodies = bodies.map((b,i) => {
      const s=shadowBodies[i];
      return {...b, x:b.x+(s.x-b.x)*sc, y:b.y+(s.y-b.y)*sc,
                    vx:b.vx+(s.vx-b.vx)*sc, vy:b.vy+(s.vy-b.vy)*sc};
    });
  }
}

/* ── Presets ─────────────────────────────────────────────── */
const PRESETS = {
  figure8:  { label:'Figura-8',    zoom:160 },
  triangle: { label:'Triangolo',   zoom:140 },
  hierarchy:{ label:'Gerarchia',   zoom:75  },
  chaos:    { label:'Caotico',     zoom:120 },
};

function mkBodies(preset, m) {
  switch (preset) {
    case 'figure8':
      // Chenciner-Montgomery periodic figure-8 (equal masses)
      return toCM([
        {m:m[0], x: 0.97000436, y:-0.24308753, vx: 0.46620369, vy: 0.43236573},
        {m:m[1], x:-0.97000436, y: 0.24308753, vx: 0.46620369, vy: 0.43236573},
        {m:m[2], x: 0,          y: 0,          vx:-0.93240737, vy:-0.86473146},
      ]);
    case 'triangle': {
      // Lagrange equilateral triangle, circular orbit
      const a=2.0, R=a/Math.sqrt(3), v=Math.sqrt(G_CONST*m[0]/a), s=Math.sqrt(3)/2;
      return toCM([
        {m:m[0], x: R,   y:  0,    vx:  0,    vy:  v   },
        {m:m[1], x:-R/2, y:  R*s,  vx: -v*s,  vy: -v/2 },
        {m:m[2], x:-R/2, y: -R*s,  vx:  v*s,  vy: -v/2 },
      ]);
    }
    case 'hierarchy': {
      // Star + planet (circular) + moon (circular around planet)
      const d1=1.5, v1=Math.sqrt(G_CONST*m[0]/d1);
      const d2=0.15, v2r=Math.sqrt(G_CONST*m[1]/d2);
      return toCM([
        {m:m[0], x:0,     y:0, vx:0, vy:0      },
        {m:m[1], x:d1,    y:0, vx:0, vy:v1      },
        {m:m[2], x:d1+d2, y:0, vx:0, vy:v1+v2r  },
      ]);
    }
    case 'chaos':
      return toCM([
        {m:m[0], x:-1.0, y: 0.2, vx: 0.2, vy: 0.5},
        {m:m[1], x: 0.9, y:-0.4, vx:-0.3, vy: 0.3},
        {m:m[2], x: 0.2, y: 0.9, vx: 0.1, vy:-0.8},
      ]);
    default: return mkBodies('chaos', m);
  }
}

function resetSim() {
  const m = [P.m1, P.m2, P.m3];
  bodies = mkBodies(P.preset, m);
  trails = [[], [], []];
  simT   = 0;
  histT=[]; histK=[]; histU=[]; histE=[];
  const pr = PRESETS[P.preset];
  zoom=pr.zoom; panX=0; panY=0;
  initShadow();
}

/* ── Running state ───────────────────────────────────────── */
function setRunning(v) {
  running = v;
  const btn = document.getElementById('btnPlay');
  if (btn) btn.textContent = running ? '⏸  PAUSA' : '▶  AVVIA';
}

/* ── World ↔ Screen ──────────────────────────────────────── */
function wx(x) { return SW/2 + (x + panX) * zoom; }
function wy(y) { return SH/2 - (y + panY) * zoom; }

/* ── Draw sim ────────────────────────────────────────────── */
function drawBackground() {
  ctx.fillStyle = dark ? '#0d1117' : '#f0f2f5';
  ctx.fillRect(0, 0, SW, SH);

  const gc = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';
  ctx.strokeStyle = gc; ctx.lineWidth = 0.5;
  const ox = ((SW/2 + panX*zoom) % zoom + zoom) % zoom;
  const oy = ((SH/2 - panY*zoom) % zoom + zoom) % zoom;
  for (let x=ox; x<SW; x+=zoom) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,SH); ctx.stroke(); }
  for (let y=oy; y<SH; y+=zoom) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(SW,y); ctx.stroke(); }

  const cc = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
  ctx.strokeStyle=cc; ctx.lineWidth=1;
  const cx=wx(0), cy=wy(0);
  ctx.beginPath(); ctx.moveTo(cx-8,cy); ctx.lineTo(cx+8,cy);
  ctx.moveTo(cx,cy-8); ctx.lineTo(cx,cy+8); ctx.stroke();
}

function drawTrails() {
  for (let i=0; i<3; i++) {
    const tr=trails[i];
    if (tr.length < 2) continue;
    const len=tr.length;
    ctx.lineWidth = 1.5;
    for (let k=1; k<len; k++) {
      const alpha = Math.round((k/len)*220).toString(16).padStart(2,'0');
      ctx.strokeStyle = COLORS[i] + alpha;
      ctx.beginPath();
      ctx.moveTo(wx(tr[k-1].x), wy(tr[k-1].y));
      ctx.lineTo(wx(tr[k].x),   wy(tr[k].y));
      ctx.stroke();
    }
  }
}

function drawBodies() {
  for (let i=0; i<3; i++) {
    const b=bodies[i], px=wx(b.x), py=wy(b.y);
    const r=Math.max(5, 9*Math.cbrt(b.m));
    const grd=ctx.createRadialGradient(px,py,0,px,py,r*3);
    grd.addColorStop(0, COLORS[i]+'55');
    grd.addColorStop(1, COLORS[i]+'00');
    ctx.beginPath(); ctx.arc(px,py,r*3,0,TWO_PI); ctx.fillStyle=grd; ctx.fill();
    ctx.beginPath(); ctx.arc(px,py,r,0,TWO_PI); ctx.fillStyle=COLORS[i]; ctx.fill();
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.75)';
    ctx.font = '11px "Space Mono",monospace';
    ctx.fillText(MLBL[i], px+r+4, py-r+4);
  }
}

function drawCM() {
  const M=bodies.reduce((a,b)=>a+b.m,0);
  const cx=bodies.reduce((a,b)=>a+b.m*b.x,0)/M;
  const cy=bodies.reduce((a,b)=>a+b.m*b.y,0)/M;
  const px=wx(cx), py=wy(cy);
  const c=dark?'rgba(255,255,255,0.45)':'rgba(0,0,0,0.40)';
  ctx.strokeStyle=c; ctx.lineWidth=1.5;
  ctx.beginPath();
  ctx.moveTo(px-7,py); ctx.lineTo(px+7,py);
  ctx.moveTo(px,py-7); ctx.lineTo(px,py+7);
  ctx.stroke();
  ctx.fillStyle=c; ctx.font='9px "Space Mono",monospace';
  ctx.fillText('CM', px+5, py-5);
}

function drawSim() {
  drawBackground();
  drawTrails();
  drawBodies();
  if (P.showCM) drawCM();
}

/* ── Draw graph ──────────────────────────────────────────── */
function drawGraph() {
  gctx.fillStyle = dark ? '#161b22' : '#f8f9fc';
  gctx.fillRect(0, 0, GW, GH);

  const half = Math.floor(GW / 2) - 4;
  drawEnergyPanel(0, half);
  drawLyapPanel(half + 8, GW - half - 8);
}

function drawEnergyPanel(offX, pw) {
  const pad={l:48, r:8, t:20, b:26};
  const iw=pw-pad.l-pad.r, ih=GH-pad.t-pad.b;
  if (iw<10||ih<10) return;
  const tc=dark?'rgba(255,255,255,0.35)':'rgba(0,0,0,0.35)';
  const gc=dark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)';
  const n=histT.length;

  gctx.fillStyle=dark?'rgba(255,255,255,0.55)':'rgba(0,0,0,0.50)';
  gctx.font='10px "Space Mono",monospace'; gctx.textAlign='left';
  gctx.fillText('Energia', offX+pad.l, 13);

  const lines=[
    {data:histK,color:'#e07070',label:'K'},
    {data:histU,color:'#6090e0',label:'U'},
    {data:histE,color:dark?'#dddddd':'#444444',label:'E'},
  ];
  let lx=offX+pad.l+52;
  for (const ln of lines) {
    gctx.fillStyle=ln.color; gctx.fillText('■',lx,13);
    gctx.fillStyle=tc; gctx.fillText(ln.label,lx+12,13);
    lx+=28;
  }

  if (n<2) return;
  const tMin=histT[0], tMax=histT[n-1];
  if (tMax<=tMin) return;
  const allV=[...histK,...histU,...histE];
  const eMin=Math.min(...allV), eMax=Math.max(...allV);
  const rng=(eMax-eMin)||1;
  const yMin=eMin-rng*0.08, yMax=eMax+rng*0.08;
  const tx=t=>offX+pad.l+(t-tMin)/(tMax-tMin)*iw;
  const ty=e=>pad.t+ih-(e-yMin)/(yMax-yMin)*ih;

  for (let i=0;i<=4;i++) {
    const y=pad.t+i*ih/4;
    gctx.strokeStyle=gc; gctx.lineWidth=0.5;
    gctx.beginPath(); gctx.moveTo(offX+pad.l,y); gctx.lineTo(offX+pad.l+iw,y); gctx.stroke();
    gctx.fillStyle=tc; gctx.font='9px "Space Mono",monospace'; gctx.textAlign='right';
    gctx.fillText((yMax-(yMax-yMin)*i/4).toFixed(2), offX+pad.l-4, y+3);
  }
  for (const ln of lines) {
    if (ln.data.length<2) continue;
    gctx.strokeStyle=ln.color; gctx.lineWidth=1.5; gctx.beginPath();
    for (let k=0;k<n;k++) {
      const x=tx(histT[k]), y=ty(ln.data[k]);
      k===0?gctx.moveTo(x,y):gctx.lineTo(x,y);
    }
    gctx.stroke();
  }
  gctx.strokeStyle=tc; gctx.lineWidth=1;
  gctx.beginPath();
  gctx.moveTo(offX+pad.l,pad.t); gctx.lineTo(offX+pad.l,pad.t+ih); gctx.lineTo(offX+pad.l+iw,pad.t+ih);
  gctx.stroke();
  gctx.fillStyle=tc; gctx.font='9px "Space Mono",monospace'; gctx.textAlign='right';
  gctx.fillText('t='+tMax.toFixed(1), offX+pad.l+iw, pad.t+ih+14);
}

function drawLyapPanel(offX, pw) {
  const pad={l:46, r:8, t:20, b:26};
  const iw=pw-pad.l-pad.r, ih=GH-pad.t-pad.b;
  if (iw<10||ih<10) return;
  const tc=dark?'rgba(255,255,255,0.35)':'rgba(0,0,0,0.35)';
  const gc=dark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.06)';
  const n=histLyap.length;

  gctx.fillStyle=dark?'rgba(255,255,255,0.55)':'rgba(0,0,0,0.50)';
  gctx.font='10px "Space Mono",monospace'; gctx.textAlign='left';
  gctx.fillText('Esponente di Lyapunov  λ(t)', offX+pad.l, 13);

  // Current value badge
  if (n>0) {
    const lam=histLyap[n-1];
    const chaos=lam>0.05;
    gctx.fillStyle=chaos?'#e07070':'#7ae052';
    gctx.textAlign='right';
    gctx.fillText(chaos?'CAOTICO':'STABILE', offX+pad.l+iw-4, 13);
    gctx.textAlign='left';
  }

  if (n<2) {
    gctx.fillStyle=tc; gctx.font='9px "Space Mono",monospace'; gctx.textAlign='center';
    gctx.fillText('In calcolo...', offX+pad.l+iw/2, pad.t+ih/2);
    return;
  }

  const tMin=histLyapT[0], tMax=histLyapT[n-1];
  if (tMax<=tMin) return;
  const lMin=Math.min(0,...histLyap), lMax=Math.max(0,...histLyap);
  const rng=(lMax-lMin)||0.5;
  const yMin=lMin-rng*0.12, yMax=lMax+rng*0.12;
  const tx=t=>offX+pad.l+(t-tMin)/(tMax-tMin)*iw;
  const ty=v=>pad.t+ih-(v-yMin)/(yMax-yMin)*ih;

  // Grid + y=0 reference
  for (let i=0;i<=4;i++) {
    const y=pad.t+i*ih/4;
    gctx.strokeStyle=gc; gctx.lineWidth=0.5;
    gctx.beginPath(); gctx.moveTo(offX+pad.l,y); gctx.lineTo(offX+pad.l+iw,y); gctx.stroke();
    gctx.fillStyle=tc; gctx.font='9px "Space Mono",monospace'; gctx.textAlign='right';
    gctx.fillText((yMax-(yMax-yMin)*i/4).toFixed(3), offX+pad.l-4, y+3);
  }

  // λ=0 line (border between stable and chaotic)
  if (yMin<0 && yMax>0) {
    const y0=ty(0);
    gctx.strokeStyle=dark?'rgba(255,255,255,0.25)':'rgba(0,0,0,0.25)';
    gctx.lineWidth=1; gctx.setLineDash([4,4]);
    gctx.beginPath(); gctx.moveTo(offX+pad.l,y0); gctx.lineTo(offX+pad.l+iw,y0); gctx.stroke();
    gctx.setLineDash([]);
  }

  // Filled area under curve (positive=red, negative=green)
  for (let k=1; k<n; k++) {
    const x0=tx(histLyapT[k-1]), x1=tx(histLyapT[k]);
    const y0=ty(histLyap[k-1]),  y1=ty(histLyap[k]);
    const yBase=ty(Math.max(yMin,0));
    const lam=histLyap[k];
    gctx.fillStyle=lam>0?'rgba(220,90,90,0.15)':'rgba(100,200,100,0.15)';
    gctx.beginPath();
    gctx.moveTo(x0,yBase); gctx.lineTo(x0,y0); gctx.lineTo(x1,y1); gctx.lineTo(x1,yBase);
    gctx.closePath(); gctx.fill();
  }

  // Lyapunov curve
  gctx.strokeStyle='#e8a040'; gctx.lineWidth=2; gctx.beginPath();
  for (let k=0;k<n;k++) {
    const x=tx(histLyapT[k]), y=ty(histLyap[k]);
    k===0?gctx.moveTo(x,y):gctx.lineTo(x,y);
  }
  gctx.stroke();

  // Axes
  gctx.strokeStyle=tc; gctx.lineWidth=1;
  gctx.beginPath();
  gctx.moveTo(offX+pad.l,pad.t); gctx.lineTo(offX+pad.l,pad.t+ih); gctx.lineTo(offX+pad.l+iw,pad.t+ih);
  gctx.stroke();
  gctx.fillStyle=tc; gctx.font='9px "Space Mono",monospace'; gctx.textAlign='right';
  gctx.fillText('t='+tMax.toFixed(1), offX+pad.l+iw, pad.t+ih+14);
  gctx.textAlign='start';
}

/* ── Readout ─────────────────────────────────────────────── */
function updateReadout() {
  const en=computeEnergy(bodies), Lz=computeL(bodies);
  const lam=histLyap.length>0 ? histLyap[histLyap.length-1].toFixed(4) : '—';
  const items=[
    {label:'t',   value:simT.toFixed(2)},
    {label:'E',   value:en.E.toFixed(3)},
    {label:'K',   value:en.K.toFixed(3)},
    {label:'U',   value:en.U.toFixed(3)},
    {label:'L_z', value:Lz.toFixed(3)},
    {label:'λ',   value:lam},
  ];
  readoutEl.innerHTML=items.map(r=>
    `<span class="readout-item"><span class="readout-label">${r.label}</span><span class="readout-value">${r.value}</span></span>`
  ).join('');
}

/* ── Resize ──────────────────────────────────────────────── */
function resize() {
  DPR  = window.devicePixelRatio||1;
  dark = document.documentElement.getAttribute('data-theme') !== 'light';
  const area=simCanvas.parentElement;
  const rd=area.querySelector('.readout-bar');
  const gaH=graphArea.clientHeight||190;
  const rdH=rd?rd.clientHeight||48:48;
  SW=area.clientWidth;
  SH=Math.max(80, area.clientHeight - gaH - rdH);
  simCanvas.width=SW*DPR; simCanvas.height=SH*DPR;
  simCanvas.style.width=SW+'px'; simCanvas.style.height=SH+'px';
  ctx.setTransform(DPR,0,0,DPR,0,0);
  GW=area.clientWidth; GH=gaH;
  graphCanvas.width=GW*DPR; graphCanvas.height=GH*DPR;
  graphCanvas.style.width=GW+'px'; graphCanvas.style.height=GH+'px';
  gctx.setTransform(DPR,0,0,DPR,0,0);
}

/* ── Interaction ─────────────────────────────────────────── */
function initInteraction() {
  simCanvas.addEventListener('mousedown', e=>{
    _drag=true; _ds={x:e.clientX,y:e.clientY,px:panX,py:panY};
  });
  simCanvas.addEventListener('mousemove', e=>{
    if (!_drag) return;
    panX=_ds.px+(e.clientX-_ds.x)/zoom;
    panY=_ds.py-(e.clientY-_ds.y)/zoom;
  });
  simCanvas.addEventListener('mouseup',    ()=>{_drag=false;});
  simCanvas.addEventListener('mouseleave', ()=>{_drag=false;});
  simCanvas.addEventListener('wheel', e=>{
    e.preventDefault();
    zoom=Math.max(10,Math.min(1200,zoom*(e.deltaY<0?1.12:0.89)));
  },{passive:false});
  simCanvas.addEventListener('touchstart', e=>{
    if(e.touches.length===1){_drag=true;_ds={x:e.touches[0].clientX,y:e.touches[0].clientY,px:panX,py:panY};}
  },{passive:true});
  simCanvas.addEventListener('touchmove', e=>{
    if(!_drag||e.touches.length!==1)return;
    panX=_ds.px+(e.touches[0].clientX-_ds.x)/zoom;
    panY=_ds.py-(e.touches[0].clientY-_ds.y)/zoom;
  },{passive:true});
  simCanvas.addEventListener('touchend', ()=>{_drag=false;});
}

/* ── Main loop ───────────────────────────────────────────── */
function loop(ts) {
  _rafId=requestAnimationFrame(loop);
  if (_lastTs===null){_lastTs=ts;return;}
  _lastTs=ts;

  if (running) {
    const dt=DT*P.timeScale;
    for (let s=0; s<SUBSTEPS; s++) {
      bodies=rk4(bodies,dt);
      simT+=dt;
      if (shadowBodies) {
        shadowBodies=rk4(shadowBodies,dt);
        if (simT>=lyapNextT) {
          renormalizeShadow();
          lyapNextT+=LYAP_INTERVAL;
        }
      }
    }
    for (let i=0;i<3;i++) {
      trails[i].push({x:bodies[i].x, y:bodies[i].y});
      if (trails[i].length>P.trailLen) trails[i].shift();
    }
    const en=computeEnergy(bodies);
    histT.push(simT); histK.push(en.K); histU.push(en.U); histE.push(en.E);
    if (histT.length>HIST_MAX){histT.shift();histK.shift();histU.shift();histE.shift();}
  }

  drawSim();
  drawGraph();
  updateReadout();
}

/* ── Controls ────────────────────────────────────────────── */
function buildControls() {
  const ctrl=document.getElementById('controls');
  ctrl.innerHTML='';

  // Preset buttons
  const secPr=Lab.Section('Configurazione');
  const grid=document.createElement('div');
  grid.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:4px;';
  for (const [key,pr] of Object.entries(PRESETS)) {
    const btn=document.createElement('button');
    btn.textContent=pr.label;
    btn.style.cssText='padding:6px 4px;border-radius:6px;border:1px solid var(--border-hover);background:var(--bg3);color:var(--text-primary);cursor:pointer;font-family:"Space Mono",monospace;font-size:11px;transition:border-color 0.15s;';
    if (P.preset===key) btn.style.borderColor='var(--accent)';
    btn.addEventListener('click',()=>{
      P.preset=key; resetSim(); buildControls();
    });
    grid.appendChild(btn);
  }
  secPr.add(grid);
  ctrl.appendChild(secPr.el);

  // Masse — update bodies in real-time, no reset needed
  const secM=Lab.Section('Masse');
  for (let i=0;i<3;i++) {
    const key=['m1','m2','m3'][i];
    secM.add(Lab.Slider({
      label:MLBL[i], min:0.1, max:3.0, step:0.1, value:P[key],
      onChange(v) {
        P[key]=v;
        if (bodies.length>i) bodies[i].m=v;
        if (shadowBodies&&shadowBodies.length>i) shadowBodies[i].m=v;
      }
    }).el);
  }
  ctrl.appendChild(secM.el);

  // Simulazione
  const secS=Lab.Section('Simulazione');
  secS.add(Lab.Slider({label:'Velocità',unit:'×',min:0.1,max:5.0,step:0.1,value:P.timeScale,
    onChange(v){P.timeScale=v;}}).el);
  secS.add(Lab.Slider({label:'Scia',unit:'',min:50,max:2000,step:50,value:P.trailLen,
    onChange(v){P.trailLen=v;}}).el);
  secS.add(Lab.Toggle({label:'Centro di massa',value:P.showCM,
    onChange(v){P.showCM=v;}}).el);
  ctrl.appendChild(secS.el);
}

/* ── Init ────────────────────────────────────────────────── */
Lab.initTheme('themeToggle');
window.addEventListener('resize', resize);
document.addEventListener('themechange', ()=>{
  dark=document.documentElement.getAttribute('data-theme')!=='light';
});

resetSim();
resize();
buildControls();
initInteraction();
requestAnimationFrame(loop);

document.getElementById('btnPlay').addEventListener('click', ()=>{ setRunning(!running); });
document.getElementById('btnReset').addEventListener('click', ()=>{ resetSim(); buildControls(); });
