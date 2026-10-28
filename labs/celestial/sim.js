'use strict';

/* ── Unità astronomiche: masse in masse solari, distanze in AU, tempi in anni ──
   In queste unità G = 4π² AU³/(M☉·anno²): la Terra (1 AU dal Sole) ha periodo 1 anno e
   velocità 2π AU/anno ≈ 29,8 km/s. */

const params = {
  G:         4 * Math.PI * Math.PI,
  m1:        1.0,
  m2:        0.30,
  d0:        4.0,
  preset:    'elliptic',
  speed1:    0,
  angle1:    90,
  speed2:    0,
  angle2:    90,
  timeScale: 1.0,
  showCM:    false,
  showConic: true,
  fixedStar: true,     // default: stella fissa + pianeta
};

/* ── Stato ─────────────────────────────────────────── */
let state      = null;   // [x1,y1,vx1,vy1, x2,y2,vx2,vy2]
let trail1     = [];
let trail2     = [];
let histT=[], histE=[], histK=[], histU=[], histR=[];
let running    = false;
let simT       = 0;
let collision  = false;
let _rafId     = null;
let _histCount = 0;
const MAX_TRAIL = 2500;
const HIST_MAX  = 1500;   // circa 25 s di storia
const DT        = 0.004 / (2 * Math.PI);   // anni per sotto-passo (≈ 0,6 anni al secondo)
const SUBSTEPS  = 16;

/* ── Camera ────────────────────────────────────────── */
let zoom  = 50;
let panX  = 0;
let panY  = 0;
let _dragging      = false;
let _dragStart     = { x:0, y:0, px:0, py:0 };
let _placingBody   = 0;      // 0=none, 1=M1, 2=M2
let _stateIsManual = false;  // true dopo drag-to-place

/* ── Canvas ────────────────────────────────────────── */
const canvas      = document.getElementById('simCanvas');
const ctx         = canvas.getContext('2d');
const graphCanvas = document.getElementById('graphCanvas');
const gctx        = graphCanvas.getContext('2d');
const graphArea   = document.getElementById('graphArea');
const readoutEl   = document.getElementById('readout');
let cw=0, ch=0, gw=0, gh=0;

function resizeCanvases() {
  const dpr=window.devicePixelRatio||1;
  const parent=canvas.parentElement;
  const graphH=graphArea.offsetHeight;
  const hH=document.getElementById('resizeHandle').offsetHeight;
  const rH=readoutEl.offsetHeight;
  cw=parent.clientWidth;
  ch=Math.max(100,parent.clientHeight-graphH-rH-hH);
  canvas.width=cw*dpr; canvas.height=ch*dpr;
  canvas.style.width=cw+'px'; canvas.style.height=ch+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  gw=graphArea.clientWidth; gh=graphArea.clientHeight;
  graphCanvas.width=gw*dpr; graphCanvas.height=gh*dpr;
  graphCanvas.style.width=gw+'px'; graphCanvas.style.height=gh+'px';
  gctx.setTransform(dpr,0,0,dpr,0,0);
}

/* ── Fisica ────────────────────────────────────────── */
function deriv(s) {
  const [x1,y1,vx1,vy1, x2,y2,vx2,vy2]=s;
  const dx=x2-x1, dy=y2-y1;
  const r2=dx*dx+dy*dy, r=Math.sqrt(r2), r3=r2*r;
  if (r<1e-5) return [0,0,0,0,0,0,0,0];
  const F=params.G/r3;
  if (params.fixedStar) {
    /* M₁ fissa: solo M₂ si muove */
    return [0,0,0,0, vx2,vy2, -F*params.m1*dx, -F*params.m1*dy];
  }
  return [
    vx1,vy1,  F*params.m2*dx,  F*params.m2*dy,
    vx2,vy2, -F*params.m1*dx, -F*params.m1*dy,
  ];
}

function rk4(s,dt) {
  const k1=deriv(s);
  const k2=deriv(s.map((v,i)=>v+dt/2*k1[i]));
  const k3=deriv(s.map((v,i)=>v+dt/2*k2[i]));
  const k4=deriv(s.map((v,i)=>v+   dt*k3[i]));
  return s.map((v,i)=>v+dt/6*(k1[i]+2*k2[i]+2*k3[i]+k4[i]));
}

function getCM() {
  if (!state) return {x:0,y:0};
  const [x1,y1,,,x2,y2]=state;
  const M=params.m1+params.m2;
  return {x:(params.m1*x1+params.m2*x2)/M, y:(params.m1*y1+params.m2*y2)/M};
}

function getOrbitParams() {
  if (!state) return null;
  const [x1,y1,vx1,vy1, x2,y2,vx2,vy2]=state;
  const G=params.G, m1=params.m1, m2=params.m2;
  const dx=x2-x1, dy=y2-y1;
  const r=Math.hypot(dx,dy);

  let E,Ekin,Epot,L,e,v1m,v2m;
  v1m=Math.hypot(vx1,vy1);
  v2m=Math.hypot(vx2,vy2);

  if (params.fixedStar) {
    /* Problema a un corpo: energia e momento specifici */
    const v2sq=vx2*vx2+vy2*vy2;
    const eps=v2sq/2 - G*m1/r;       // energia specifica
    const h=dx*vy2 - dy*vx2;         // momento angolare specifico
    Ekin=0.5*m2*v2sq;
    Epot=-G*m1*m2/r;
    E=Ekin+Epot;
    L=m2*h;
    e=Math.sqrt(Math.max(0, 1+2*eps*h*h/(G*G*m1*m1)));
  } else {
    /* Problema a due corpi: massa ridotta */
    const M=m1+m2, mu=m1*m2/M;
    const dvx=vx2-vx1, dvy=vy2-vy1;
    const v2=dvx*dvx+dvy*dvy;
    Ekin=0.5*mu*v2;
    Epot=-G*m1*m2/r;
    E=Ekin+Epot;
    L=mu*(dx*dvy-dy*dvx);
    const disc=1+2*E*L*L/(G*G*m1*m1*m2*m2*mu);
    e=Math.sqrt(Math.max(0,disc));
  }

  let type;
  if      (e<0.025) type='Circolare';
  else if (e<0.990) type='Ellittica';
  else if (e<1.010) type='Parabolica';
  else              type='Iperbolica';

  return {E,Ekin,Epot,L,e,r,v1:v1m,v2:v2m,type};
}

/* ── Preset: calcola velocità iniziali ─────────────── */
function applyPreset(preset) {
  if (preset==='custom') return;
  const {G,m1,m2,d0,fixedStar}=params;
  const fac={circular:1.0, elliptic:0.72, parabolic:Math.SQRT2, hyperbolic:1.6};
  const f=fac[preset]??1.0;

  if (fixedStar) {
    /* pianeta orbita intorno a stella fissa: v_circ = sqrt(G*m1/d0) */
    const vcirc=Math.sqrt(G*m1/d0);
    params.speed1=0;    params.angle1=90;
    params.speed2=f*vcirc; params.angle2=90;
  } else {
    /* due corpi in frame CM */
    const M=m1+m2, vcirc=Math.sqrt(G*M/d0);
    params.speed1=(m2/M)*f*vcirc; params.angle1=90;
    params.speed2=(m1/M)*f*vcirc; params.angle2=270;
  }
}

/* ── Stato iniziale ────────────────────────────────── */
function buildInitialState() {
  const {m1,m2,d0,fixedStar}=params;
  const a2=params.angle2*Math.PI/180;
  const a1=params.angle1*Math.PI/180;

  if (fixedStar) {
    /* M₁ all'origine, M₂ a (d0, 0) */
    return [0,0,0,0, d0,0, params.speed2*Math.cos(a2),params.speed2*Math.sin(a2)];
  }
  const M=m1+m2, r1=(m2/M)*d0, r2=(m1/M)*d0;
  return [
    -r1,0, params.speed1*Math.cos(a1),params.speed1*Math.sin(a1),
     r2,0, params.speed2*Math.cos(a2),params.speed2*Math.sin(a2),
  ];
}

/* ── Zoom automatico ───────────────────────────────── */
function autoZoom() {
  const d=params.d0;
  const fac=params.preset==='hyperbolic'?2.2 : params.fixedStar?1.5 : 0.9;
  zoom=Math.min(cw||600,ch||400)*0.36/(d*fac);
  /* centra la vista sul punto medio tra i due corpi */
  panX=params.fixedStar ? -d/2 : 0;
  panY=0;
}

/* ── SoftReset: ricostruisce lo stato dai params attuali ─ */
function softReset() {
  const wasRunning=running;
  setRunning(false);
  if (_stateIsManual&&state) {
    /* Mantieni posizione trascinata, aggiorna solo velocità */
    const a2=params.angle2*Math.PI/180;
    state[6]=params.speed2*Math.cos(a2); state[7]=params.speed2*Math.sin(a2);
    if (!params.fixedStar) {
      const a1=params.angle1*Math.PI/180;
      state[2]=params.speed1*Math.cos(a1); state[3]=params.speed1*Math.sin(a1);
    }
    const midX=(state[0]+state[4])/2, midY=(state[1]+state[5])/2;
    const fac=params.preset==='hyperbolic'?2.2:params.fixedStar?1.5:0.9;
    zoom=Math.min(cw||600,ch||400)*0.36/(params.d0*fac);
    panX=-midX; panY=-midY;
  } else {
    state=buildInitialState();
    autoZoom();
  }
  _stateIsManual=false;
  trail1=[[state[0],state[1]]]; trail2=[[state[4],state[5]]];
  histT=[]; histE=[]; histK=[]; histU=[]; histR=[];
  simT=0; collision=false; _histCount=0;
  requestRedraw();
  if (wasRunning) setRunning(true);
}

function previewState() {
  if (running) return;
  if (_stateIsManual&&state) {
    const a2=params.angle2*Math.PI/180;
    state[6]=params.speed2*Math.cos(a2); state[7]=params.speed2*Math.sin(a2);
    if (!params.fixedStar){const a1=params.angle1*Math.PI/180;state[2]=params.speed1*Math.cos(a1);state[3]=params.speed1*Math.sin(a1);}
  } else {
    state=buildInitialState();
  }
  requestRedraw();
}

function nearBody(mx,my,bi) {
  if (!state) return false;
  const bx=bi===1?state[0]:state[4], by=bi===1?state[1]:state[5];
  const bm=bi===1?params.m1:params.m2;
  const p=w2c(bx,by);
  return Math.hypot(mx-p.x,my-p.y)<Math.max(bodyR(bm)+10,16);
}

/* ── Animazione ────────────────────────────────────── */
function simStep() {
  if (!running||!state) return;
  const dt=DT*params.timeScale;
  for (let i=0;i<SUBSTEPS;i++) {
    const ns=rk4(state,dt);
    const r=Math.hypot(ns[4]-ns[0],ns[5]-ns[1]);
    if (r<0.04) { collision=true; setRunning(false); break; }
    state=ns; simT+=dt;
    trail1.push([state[0],state[1]]);
    trail2.push([state[4],state[5]]);
    if (trail1.length>MAX_TRAIL) { trail1.shift(); trail2.shift(); }
    if (++_histCount%16===0) {   // un campione per fotogramma
      const op=getOrbitParams();
      if (op) {
        histT.push(simT); histE.push(op.E); histK.push(op.Ekin);
        histU.push(op.Epot); histR.push(op.r);
        if (histT.length>HIST_MAX) {
          histT.shift(); histE.shift(); histK.shift(); histU.shift(); histR.shift();
        }
      }
    }
  }
  drawScene(); drawGraphs();
  if (running) _rafId=requestAnimationFrame(simStep);
}

function setRunning(v) {
  running=v;
  if (running&&!_rafId) _rafId=requestAnimationFrame(simStep);
  else if (!running&&_rafId) { cancelAnimationFrame(_rafId); _rafId=null; }
  const btn=document.getElementById('btnPlay');
  if (btn) { btn.textContent=running?'⏸  PAUSA':'▶  AVVIA'; btn.classList.toggle('running',running); }
}

function requestRedraw() {
  requestAnimationFrame(()=>{ drawScene(); drawGraphs(); });
}

/* ── Coordinate ────────────────────────────────────── */
function w2c(wx,wy){return{x:cw/2+(wx+panX)*zoom,y:ch/2-(wy+panY)*zoom};}
function c2w(cx,cy){return{x:(cx-cw/2)/zoom-panX,y:-((cy-ch/2)/zoom)-panY};}

/* ── Scena ─────────────────────────────────────────── */
function drawScene() {
  ctx.clearRect(0,0,cw,ch);
  if (!state) return;
  const dark=document.documentElement.dataset.theme!=='light';
  drawGrid(dark);
  drawConic(dark);
  drawTrails();
  drawBodies(dark);
  if (params.showCM&&!params.fixedStar) drawCM(dark);
  drawScaleBar(dark);
  drawOrbitLabel(dark);
  updateReadout();
}

function gridStep() {
  const raw=(cw/zoom)/7;
  const exp=Math.floor(Math.log10(Math.max(raw,1e-9)));
  const m=raw/Math.pow(10,exp);
  return (m<1.5?1:m<3.5?2:m<7.5?5:10)*Math.pow(10,exp);
}

function drawGrid(dark) {
  const step=gridStep();
  const w0=c2w(0,ch), w1=c2w(cw,0);
  ctx.lineWidth=1;
  ctx.strokeStyle=dark?'rgba(255,255,255,0.035)':'rgba(0,0,0,0.05)';
  for (let x=Math.floor(w0.x/step)*step;x<=w1.x+step;x+=step){
    const cx=w2c(x,0).x;ctx.beginPath();ctx.moveTo(cx,0);ctx.lineTo(cx,ch);ctx.stroke();
  }
  for (let y=Math.floor(w1.y/step)*step;y<=w0.y+step;y+=step){
    const cy=w2c(0,y).y;ctx.beginPath();ctx.moveTo(0,cy);ctx.lineTo(cw,cy);ctx.stroke();
  }
  ctx.strokeStyle=dark?'rgba(255,255,255,0.12)':'rgba(0,0,0,0.14)';
  const o=w2c(0,0);
  ctx.beginPath();ctx.moveTo(o.x,0);ctx.lineTo(o.x,ch);ctx.stroke();
  ctx.beginPath();ctx.moveTo(0,o.y);ctx.lineTo(cw,o.y);ctx.stroke();
}

function drawTrail(trail,r,g,b) {
  if (trail.length<2) return;
  const segs=10,segLen=Math.ceil(trail.length/segs);
  for (let seg=0;seg<segs;seg++) {
    const alpha=((seg+1)/segs)*0.78;
    const s0=seg*segLen,s1=Math.min((seg+1)*segLen+1,trail.length);
    if (s1<=s0) continue;
    ctx.strokeStyle=`rgba(${r},${g},${b},${alpha.toFixed(2)})`;
    ctx.lineWidth=1.5;
    ctx.beginPath();
    const p0=w2c(trail[s0][0],trail[s0][1]);
    ctx.moveTo(p0.x,p0.y);
    for (let i=s0+1;i<s1;i++){const p=w2c(trail[i][0],trail[i][1]);ctx.lineTo(p.x,p.y);}
    ctx.stroke();
  }
}

function drawTrails() {
  if (params.fixedStar) {
    drawTrail(trail2,0,180,255);
  } else {
    drawTrail(trail1,0,212,255);
    drawTrail(trail2,255,180,0);
  }
}

function bodyR(m){return Math.max(5,Math.min(18,6*Math.cbrt(m)));}

function drawArrow(x0,y0,dx,dy,col) {
  if (Math.hypot(dx,dy)<2) return;
  ctx.strokeStyle=col;ctx.lineWidth=1.6;
  ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x0+dx,y0+dy);ctx.stroke();
  const ang=Math.atan2(dy,dx);
  ctx.fillStyle=col;
  ctx.beginPath();
  ctx.moveTo(x0+dx,y0+dy);
  ctx.lineTo(x0+dx-9*Math.cos(ang-0.38),y0+dy-9*Math.sin(ang-0.38));
  ctx.lineTo(x0+dx-9*Math.cos(ang+0.38),y0+dy-9*Math.sin(ang+0.38));
  ctx.closePath();ctx.fill();
}

function drawBodies(dark) {
  const [x1,y1,vx1,vy1, x2,y2,vx2,vy2]=state;

  if (params.fixedStar) {
    /* ── Stella fissa ── */
    const ps=w2c(x1,y1), rs=bodyR(params.m1)*1.5;
    const gs=ctx.createRadialGradient(ps.x,ps.y,0,ps.x,ps.y,rs*3.5);
    gs.addColorStop(0,'rgba(255,230,80,0.45)');
    gs.addColorStop(1,'rgba(255,160,0,0)');
    ctx.beginPath();ctx.arc(ps.x,ps.y,rs*3.5,0,Math.PI*2);ctx.fillStyle=gs;ctx.fill();
    ctx.beginPath();ctx.arc(ps.x,ps.y,rs,0,Math.PI*2);
    ctx.fillStyle='rgba(255,220,50,0.35)';ctx.fill();
    ctx.strokeStyle='rgba(255,210,50,0.95)';ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle=dark?'rgba(255,235,150,0.92)':'rgba(140,90,0,0.90)';
    ctx.font=`bold 11px 'DM Sans',sans-serif`;
    ctx.textAlign='center';ctx.textBaseline='bottom';
    ctx.fillText('★ Stella',ps.x,ps.y-rs-3);ctx.textBaseline='alphabetic';

    /* ── Pianeta ── */
    const pp=w2c(x2,y2), rp=bodyR(params.m2);
    const gp=ctx.createRadialGradient(pp.x,pp.y,0,pp.x,pp.y,rp*2.5);
    gp.addColorStop(0,'rgba(0,200,255,0.25)');gp.addColorStop(1,'rgba(0,200,255,0)');
    ctx.beginPath();ctx.arc(pp.x,pp.y,rp*2.5,0,Math.PI*2);ctx.fillStyle=gp;ctx.fill();
    ctx.beginPath();ctx.arc(pp.x,pp.y,rp,0,Math.PI*2);
    ctx.fillStyle='rgba(0,180,255,0.28)';ctx.fill();
    ctx.strokeStyle='rgba(0,212,255,0.90)';ctx.lineWidth=2;ctx.stroke();
    const spd=Math.hypot(vx2,vy2);
    if (spd>1e-6) drawArrow(pp.x,pp.y,(vx2/spd)*Math.min(60,spd*zoom*2.5),-(vy2/spd)*Math.min(60,spd*zoom*2.5),'rgba(0,212,255,0.72)');
    ctx.fillStyle=dark?'rgba(150,230,255,0.92)':'rgba(0,80,140,0.90)';
    ctx.font=`bold 11px 'DM Sans',sans-serif`;
    ctx.textAlign='center';ctx.textBaseline='bottom';
    ctx.fillText('● Pianeta',pp.x,pp.y-rp-3);ctx.textBaseline='alphabetic';

  } else {
    /* ── Due corpi liberi ── */
    const drawBody=(wx,wy,vx,vy,m,cr,cg,cb,lbl)=>{
      const p=w2c(wx,wy),r=bodyR(m);
      const grad=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r*2.2);
      grad.addColorStop(0,`rgba(${cr},${cg},${cb},0.22)`);
      grad.addColorStop(1,`rgba(${cr},${cg},${cb},0)`);
      ctx.beginPath();ctx.arc(p.x,p.y,r*2.2,0,Math.PI*2);ctx.fillStyle=grad;ctx.fill();
      ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);
      ctx.fillStyle=`rgba(${cr},${cg},${cb},0.25)`;ctx.fill();
      ctx.strokeStyle=`rgba(${cr},${cg},${cb},0.90)`;ctx.lineWidth=2;ctx.stroke();
      const spd=Math.hypot(vx,vy);
      if (spd>1e-6) drawArrow(p.x,p.y,(vx/spd)*Math.min(60,spd*zoom*2.5),-(vy/spd)*Math.min(60,spd*zoom*2.5),`rgba(${cr},${cg},${cb},0.72)`);
      ctx.fillStyle=dark?'rgba(220,235,255,0.92)':'rgba(10,25,50,0.90)';
      ctx.font=`bold 11px 'DM Sans',sans-serif`;
      ctx.textAlign='center';ctx.textBaseline='bottom';
      ctx.fillText(lbl,p.x,p.y-r-3);ctx.textBaseline='alphabetic';
    };
    drawBody(x1,y1,vx1,vy1,params.m1,  0,212,255,'M₁');
    drawBody(x2,y2,vx2,vy2,params.m2,255,180,  0,'M₂');
  }

  if (collision) {
    ctx.fillStyle='rgba(255,71,87,0.92)';
    ctx.font=`bold 13px 'Space Mono',monospace`;
    ctx.textAlign='center';
    ctx.fillText('⚠ COLLISIONE',cw/2,ch/2-20);
  }
}

function drawCM(dark) {
  const cm=getCM(), p=w2c(cm.x,cm.y);
  const c=dark?'rgba(100,255,150,0.70)':'rgba(0,140,60,0.70)';
  ctx.strokeStyle=c;ctx.lineWidth=1.5;
  const s=7;
  ctx.beginPath();ctx.moveTo(p.x-s,p.y);ctx.lineTo(p.x+s,p.y);ctx.stroke();
  ctx.beginPath();ctx.moveTo(p.x,p.y-s);ctx.lineTo(p.x,p.y+s);ctx.stroke();
  ctx.fillStyle=c;ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fill();
  ctx.font=`9px 'Space Mono',monospace`;ctx.textAlign='left';
  ctx.fillText('CM',p.x+9,p.y+3);
}

function drawScaleBar(dark) {
  const step=gridStep(),barPx=step*zoom;
  const bx=20,by=ch-18;
  ctx.strokeStyle=dark?'rgba(255,255,255,0.50)':'rgba(0,0,0,0.45)';
  ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(bx,by);ctx.lineTo(bx+barPx,by);ctx.stroke();
  [bx,bx+barPx].forEach(x=>{ctx.beginPath();ctx.moveTo(x,by-4);ctx.lineTo(x,by+4);ctx.stroke();});
  ctx.fillStyle=dark?'rgba(180,210,255,0.75)':'rgba(30,60,130,0.70)';
  ctx.font=`9px 'Space Mono',monospace`;ctx.textAlign='center';
  const lbl=step<1?step.toFixed(2):step>=10?step.toFixed(0):step.toFixed(1);
  ctx.fillText(`${lbl} AU`,bx+barPx/2,by-7);
}

/* ── Conica teorica ────────────────────────────────── */
function drawConicArc(fx,fy,p,e,omega) {
  const N=360;
  const viewR=Math.max(cw,ch)*3/zoom;
  let t0,t1;
  if (e>1.005) {
    const lim=Math.acos(Math.max(-1+1e-6,-1/e));
    t0=omega-lim+0.01; t1=omega+lim-0.01;
  } else if (e>0.995) {
    t0=omega-Math.PI+0.03; t1=omega+Math.PI-0.03;
  } else {
    t0=0; t1=2*Math.PI;
  }
  ctx.beginPath();
  let first=true;
  for (let i=0;i<=N;i++) {
    const theta=t0+(t1-t0)*i/N;
    const denom=1+e*Math.cos(theta-omega);
    if (denom<1e-6){first=true;continue;}
    const rr=p/denom;
    if (rr>viewR){first=true;continue;}
    const c=w2c(fx+rr*Math.cos(theta),fy+rr*Math.sin(theta));
    if (first){ctx.moveTo(c.x,c.y);first=false;}else ctx.lineTo(c.x,c.y);
  }
  ctx.stroke();
}

function drawConic(dark) {
  if (!state||!params.showConic) return;
  const [x1,y1,vx1,vy1,x2,y2,vx2,vy2]=state;
  const G=params.G,m1=params.m1,m2=params.m2;
  const dx=x2-x1,dy=y2-y1,r=Math.hypot(dx,dy);
  if (r<1e-6) return;
  ctx.save();
  ctx.setLineDash([6,5]);
  ctx.lineWidth=1.3;

  if (params.fixedStar) {
    const h=dx*vy2-dy*vx2;
    const p=h*h/(G*m1);
    if (p<1e-9){ctx.restore();return;}
    const ex=(vy2*h)/(G*m1)-dx/r;
    const ey=(-vx2*h)/(G*m1)-dy/r;
    const e=Math.hypot(ex,ey);
    const omega=e>1e-9?Math.atan2(ey,ex):0;
    ctx.strokeStyle=dark?'rgba(0,212,255,0.38)':'rgba(0,100,180,0.42)';
    drawConicArc(x1,y1,p,e,omega);
  } else {
    const M=m1+m2;
    const dvx=vx2-vx1,dvy=vy2-vy1;
    const h=dx*dvy-dy*dvx;
    const prel=h*h/(G*M);
    if (prel<1e-9){ctx.restore();return;}
    const ex=(dvy*h)/(G*M)-dx/r;
    const ey=(-dvx*h)/(G*M)-dy/r;
    const e=Math.hypot(ex,ey);
    const omega=e>1e-9?Math.atan2(ey,ex):0;
    const cm=getCM();
    ctx.strokeStyle=dark?'rgba(255,180,0,0.38)':'rgba(180,100,0,0.42)';
    drawConicArc(cm.x,cm.y,(m2/M)*prel,e,omega+Math.PI);  // M₁
    ctx.strokeStyle=dark?'rgba(0,212,255,0.38)':'rgba(0,100,180,0.42)';
    drawConicArc(cm.x,cm.y,(m1/M)*prel,e,omega);           // M₂
  }
  ctx.restore();
}

function drawOrbitLabel(dark) {
  const op=getOrbitParams();if (!op) return;
  ctx.fillStyle=dark?'rgba(0,212,255,0.70)':'rgba(0,100,180,0.75)';
  ctx.font=`11px 'Space Mono',monospace`;ctx.textAlign='right';
  ctx.fillText(`${op.type}   e = ${Lab.fmt(op.e,3)}`,cw-12,22);
}

/* ── Readout ────────────────────────────────────────── */
function updateReadout() {
  if (!state){readoutEl.innerHTML='';return;}
  const op=getOrbitParams();
  const items=params.fixedStar?[
    {label:'orbita',        value:op?.type??'—'},
    {label:'eccentricità e', value:op?Lab.fmt(op.e,3):'—'},
    {label:'energia E',     value:op?Lab.sci(op.E,3):'—'},
    {label:'distanza r',    value:op?`${Lab.fmt(op.r,2)} AU`:'—'},
    {label:'velocità |v₂|', value:op?`${Lab.fmt(op.v2,2)} AU/anno`:'—'},
    {label:'in km/s',       value:op?`${Lab.fmt(op.v2*4.74,1)} km/s`:'—'},
    {label:'tempo',         value:`${Lab.fmt(simT,2)} anni`},
  ]:[
    {label:'orbita',        value:op?.type??'—'},
    {label:'eccentricità e', value:op?Lab.fmt(op.e,3):'—'},
    {label:'energia E',     value:op?Lab.sci(op.E,3):'—'},
    {label:'distanza r',    value:op?`${Lab.fmt(op.r,2)} AU`:'—'},
    {label:'velocità |v₁|', value:op?`${Lab.fmt(op.v1,2)} AU/anno`:'—'},
    {label:'velocità |v₂|', value:op?`${Lab.fmt(op.v2,2)} AU/anno`:'—'},
    {label:'tempo',         value:`${Lab.fmt(simT,2)} anni`},
  ];
  readoutEl.innerHTML=items.map(it=>
    `<span class="readout-item"><span class="readout-label">${Lab.keepCaseHTML(it.label)}</span><span class="readout-value">${it.value}</span></span>`
  ).join('');
}

/* ── Grafici ────────────────────────────────────────── */
const GP={l:44,r:8,t:18,b:26};

function panelBase(gc,ox,oy,pw,ph,dark) {
  gc.fillStyle=dark?'#0b1018':'#f0f2f5';gc.fillRect(ox,oy,pw,ph);
  const l=ox+GP.l,t_=oy+GP.t,iW=pw-GP.l-GP.r,iH=ph-GP.t-GP.b;
  gc.strokeStyle=dark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.06)';gc.lineWidth=1;
  for (let i=0;i<=4;i++){
    const x=l+(i/4)*iW;gc.beginPath();gc.moveTo(x,t_);gc.lineTo(x,t_+iH);gc.stroke();
    const y=t_+(i/4)*iH;gc.beginPath();gc.moveTo(l,y);gc.lineTo(l+iW,y);gc.stroke();
  }
  if (ox>0){gc.strokeStyle=dark?'rgba(0,212,255,0.07)':'rgba(0,100,160,0.07)';gc.beginPath();gc.moveTo(ox,oy);gc.lineTo(ox,oy+ph);gc.stroke();}
  return{l,t:t_,iW,iH};
}
function panelTitle(gc,ox,oy,pw,title,dark){
  gc.fillStyle=dark?'rgba(200,220,255,0.50)':'rgba(40,60,100,0.50)';
  gc.font=`10px 'Space Mono',monospace`;gc.textAlign='center';
  gc.fillText(title,ox+pw/2,oy+12);
}

function drawGraphs(){
  if (!gw||!gh) return;
  const C=Lab.graphColors();
  gctx.fillStyle=C.bg; gctx.fillRect(0,0,gw,gh);
  const pw=Math.floor(gw/2);
  drawEnergyPanel(0, 0,pw,   gh);
  drawRPanel     (pw,0,gw-pw,gh);
}

// energia cinetica K, potenziale U e totale E = K + U (M☉·AU²/anno²): E resta costante
function drawEnergyPanel(ox,oy,pw,ph){
  const t1=histT.length?histT[histT.length-1]:1, t0=histT.length?histT[0]:0;
  const vals=[...histE,...histK,...histU];
  const m=Lab.niceMax(Math.max(...vals.map(Math.abs),1e-6)*1.05);
  const f=Lab.axes(gctx,{ x:ox+4, y:oy+4, w:pw-8, h:ph-8, title:'Energia (M☉·AU²/anno²)', xr:[t0,Math.max(t1,t0+1e-6)], yr:[-m,m], xLabel:'t (anni)', yFmt:v=>Lab.sci(v,2) });
  if (histT.length<2) return;
  const C=f.C;
  Lab.plotPts(gctx,f,histT.map((t,i)=>[t,histK[i]]),C.accent,1.6);
  Lab.plotPts(gctx,f,histT.map((t,i)=>[t,histU[i]]),C.red,1.6);
  Lab.plotPts(gctx,f,histT.map((t,i)=>[t,histE[i]]),C.green,2.2);
  Lab.legend(gctx,f.L+8,f.T+8,[[C.accent,'cinetica K'],[C.red,'potenziale U'],[C.green,'totale E']]);
}

// distanza fra i due corpi: oscilla fra perielio e afelio (orbita chiusa) o cresce (orbita aperta)
function drawRPanel(ox,oy,pw,ph){
  const t1=histT.length?histT[histT.length-1]:1, t0=histT.length?histT[0]:0;
  const rM=Lab.niceMax(Math.max(params.d0,...histR)*1.05);
  const f=Lab.axes(gctx,{ x:ox+4, y:oy+4, w:pw-8, h:ph-8, title:'Distanza fra i corpi r (AU)', xr:[t0,Math.max(t1,t0+1e-6)], yr:[0,rM], xLabel:'t (anni)' });
  if (histT.length<2) return;
  Lab.plotPts(gctx,f,histT.map((t,i)=>[t,histR[i]]),f.C.violet,2);
}

/* ── Controlli ──────────────────────────────────────── */
function buildControls() {
  const el=document.getElementById('controls');
  el.innerHTML='';

  /* Modalità */
  const secM=Lab.Section('Modalità');
  secM.add(Lab.Toggle({label:'Stella fissa + pianeta', value:params.fixedStar,
    onChange(v){
      params.fixedStar=v;
      params.showCM=!v;
      _stateIsManual=false;
      applyPreset(params.preset);
      buildControls();
      softReset();
    },
  }));
  el.appendChild(secM.el);

  /* Corpi */
  const starLbl=params.fixedStar?'Massa stella':'Massa M₁';
  const planLbl=params.fixedStar?'Massa pianeta':'Massa M₂';
  const secC=Lab.Section('Corpi');
  secC.add(Lab.SliderInput({label:starLbl,min:0.1,max:20,step:0.1,
    value:params.m1,unit:'M☉',onChange(v){params.m1=v;},
  }));
  secC.add(Lab.SliderInput({label:planLbl,min:0.01,max:10,step:0.05,
    value:params.m2,unit:'M☉',onChange(v){params.m2=v;},
  }));
  el.appendChild(secC.el);

  /* Orbita: preset radio + d0 */
  const secO=Lab.Section('Tipo di orbita');
  secO.add(Lab.RadioGroup({label:'preset',options:[
    {label:'Circolare',     value:'circular'},
    {label:'Ellittica',     value:'elliptic'},
    {label:'Parabolica',    value:'parabolic'},
    {label:'Iperbolica',    value:'hyperbolic'},
    {label:'Personalizzata',value:'custom'},
  ],value:params.preset,
    onChange(v){
      params.preset=v;
      if (v!=='custom') {
        _stateIsManual=false;
        applyPreset(v);
        buildControls();
        softReset();
      }
    },
  }));
  secO.add(Lab.SliderInput({label:'Distanza iniziale d₀',min:1,max:20,step:0.5,
    value:params.d0,unit:' AU',onChange(v){params.d0=v;},
  }));
  el.appendChild(secO.el);

  /* Velocità */
  const vLabel=params.fixedStar?'Velocità pianeta':'Velocità iniziali';
  const secV=Lab.Section(vLabel);

  if (!params.fixedStar) {
    secV.add(Lab.SliderInput({label:'|v₁|',min:0,max:40,step:0.01,
      value:+Lab.fmt(params.speed1,2),unit:'AU/anno',
      onChange(v){params.speed1=v;params.preset='custom';buildControls();previewState();},
    }));
    secV.add(Lab.SliderInput({label:'θ₁',min:-180,max:180,step:1,
      value:params.angle1,unit:'°',
      onChange(v){params.angle1=v;params.preset='custom';buildControls();previewState();},
    }));
  }
  secV.add(Lab.SliderInput({label:'|v₂|',min:0,max:40,step:0.01,
    value:+Lab.fmt(params.speed2,2),unit:'AU/anno',
    onChange(v){params.speed2=v;params.preset='custom';buildControls();previewState();},
  }));
  secV.add(Lab.SliderInput({label:'θ₂',min:-180,max:180,step:1,
    value:params.angle2,unit:'°',
    onChange(v){params.angle2=v;params.preset='custom';buildControls();previewState();},
  }));
  el.appendChild(secV.el);

  /* Simulazione */
  const secS=Lab.Section('Simulazione');
  secS.add(Lab.SliderInput({label:'Velocità sim.',min:0.1,max:8,step:0.1,
    value:params.timeScale,unit:'×',onChange(v){params.timeScale=v;},
  }));
  secS.add(Lab.Toggle({label:'Conica teorica',value:params.showConic,
    onChange(v){params.showConic=v;requestRedraw();},
  }));
  if (!params.fixedStar) {
    secS.add(Lab.Toggle({label:'Mostra centro di massa',value:params.showCM,
      onChange(v){params.showCM=v;requestRedraw();},
    }));
  }
  el.appendChild(secS.el);
}

/* ── Interazione canvas ─────────────────────────────── */
function initCanvasInteraction() {
  canvas.addEventListener('wheel',(e)=>{
    e.preventDefault();
    const rect=canvas.getBoundingClientRect();
    const mx=e.clientX-rect.left,my=e.clientY-rect.top;
    const wB=c2w(mx,my);
    zoom=Math.max(2,Math.min(2000,zoom*(e.deltaY<0?1.15:1/1.15)));
    const wA=c2w(mx,my);
    panX+=wA.x-wB.x;panY+=wA.y-wB.y;
    if (!running) requestRedraw();
  },{passive:false});

  canvas.addEventListener('mousedown',(e)=>{
    const rect=canvas.getBoundingClientRect();
    const mx=e.clientX-rect.left,my=e.clientY-rect.top;
    if (!running&&state) {
      if (!params.fixedStar&&nearBody(mx,my,1)){_placingBody=1;canvas.style.cursor='crosshair';return;}
      if (nearBody(mx,my,2)){_placingBody=2;canvas.style.cursor='crosshair';return;}
    }
    _dragging=true;
    _dragStart={x:e.clientX,y:e.clientY,px:panX,py:panY};
    canvas.style.cursor='grabbing';
  });

  document.addEventListener('mousemove',(e)=>{
    if (_placingBody&&!running) {
      const rect=canvas.getBoundingClientRect();
      const w=c2w(e.clientX-rect.left,e.clientY-rect.top);
      if (_placingBody===1){state[0]=w.x;state[1]=w.y;}
      else                 {state[4]=w.x;state[5]=w.y;}
      params.d0=Math.max(0.2,Math.hypot(state[4]-state[0],state[5]-state[1]));
      if (params.preset!=='custom') {
        applyPreset(params.preset);
        const a2=params.angle2*Math.PI/180;
        state[6]=params.speed2*Math.cos(a2); state[7]=params.speed2*Math.sin(a2);
        if (!params.fixedStar){const a1=params.angle1*Math.PI/180;state[2]=params.speed1*Math.cos(a1);state[3]=params.speed1*Math.sin(a1);}
      }
      trail1=[[state[0],state[1]]]; trail2=[[state[4],state[5]]];
      requestRedraw(); return;
    }
    if (!_dragging) {
      /* Aggiorna cursore hover */
      const rect=canvas.getBoundingClientRect();
      const mx=e.clientX-rect.left,my=e.clientY-rect.top;
      if (mx>=0&&mx<=cw&&my>=0&&my<=ch&&!running&&state)
        canvas.style.cursor=((!params.fixedStar&&nearBody(mx,my,1))||nearBody(mx,my,2))?'move':'grab';
      return;
    }
    panX=_dragStart.px+(e.clientX-_dragStart.x)/zoom;
    panY=_dragStart.py-(e.clientY-_dragStart.y)/zoom;
    if (!running) requestRedraw();
  });

  document.addEventListener('mouseup',()=>{
    if (_placingBody) {
      _placingBody=0; _stateIsManual=true;
      canvas.style.cursor='grab';
      buildControls(); return;
    }
    _dragging=false; canvas.style.cursor='grab';
  });
  canvas.style.cursor='grab';
}

function initResizeHandle(){
  const handle=document.getElementById('resizeHandle');
  let drag=false,sY=0,sH=0;
  handle.addEventListener('mousedown',e=>{drag=true;sY=e.clientY;sH=graphArea.offsetHeight;document.body.style.userSelect='none';});
  document.addEventListener('mousemove',e=>{if(!drag)return;graphArea.style.height=Math.max(80,Math.min(400,sH+(sY-e.clientY)))+'px';resizeCanvases();requestRedraw();});
  document.addEventListener('mouseup',()=>{if(drag){drag=false;document.body.style.userSelect='';}});
}

function initFullscreen(){
  document.getElementById('btnFullscreen').addEventListener('click',()=>{
    !document.fullscreenElement?(graphArea.requestFullscreen?.()??graphArea.webkitRequestFullscreen?.()):(document.exitFullscreen?.()??document.webkitExitFullscreen?.());
  });
  document.addEventListener('fullscreenchange',()=>{resizeCanvases();requestRedraw();});
}

new MutationObserver(()=>requestRedraw())
  .observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});

/* ── Init ───────────────────────────────────────────── */
function init() {
  Lab.initTheme();
  applyPreset(params.preset);
  buildControls();
  graphArea.style.height=(window.innerWidth<800?130:220)+'px';
  resizeCanvases();
  softReset();

  new ResizeObserver(()=>{resizeCanvases();if(!running) requestRedraw();})
    .observe(canvas.parentElement);
  initCanvasInteraction();
  initResizeHandle();
  initFullscreen();

  /* AVVIA: se in pausa ricostruisce lo stato dai params attuali poi parte */
  document.getElementById('btnPlay').addEventListener('click',()=>{
    if (running) {
      setRunning(false);
    } else {
      if (simT === 0 || collision) { applyPreset(params.preset); softReset(); collision = false; }
      setRunning(true);
    }
  });

  document.getElementById('btnReset').addEventListener('click',()=>{
    setRunning(false); _stateIsManual=false;
    params.m1=1;params.m2=0.30;params.d0=4;params.preset='elliptic';
    params.timeScale=1;params.showCM=false;params.showConic=true;params.fixedStar=true;
    applyPreset('elliptic');
    buildControls();
    softReset();
  });
}

init();
