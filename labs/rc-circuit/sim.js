'use strict';

// ═══ Stato ════════════════════════════════════════════════════════════════════
const P = {
  R:   10,     // resistenza (kΩ)
  C:   100,    // capacità (µF)
  V0:  9,      // f.e.m. batteria (V)
  mode:'open', // 'charge' | 'discharge' | 'open'
};
// τ = R[kΩ]·C[µF]·1e-3 s
function tau(){ return P.R*P.C*1e-3; }

let Vc=0;          // tensione condensatore (V)
let I=0;           // corrente (mA)
let simT=0;        // tempo simulato (s)
let flow=0;        // fase animazione corrente
let hist=[];       // {t,Vc,I}
let gTitle=[null,null,null];
let gCanvas=[null,null,null], gCtx=[null,null,null];
let readout, t=0;

// ═══ Palette ══════════════════════════════════════════════════════════════════
function dk(){ return document.documentElement.dataset.theme !== 'light'; }
function pal(){
  const d=dk();
  return {
    bg:    d?'#06090f':'#e7edf4',
    txt:   d?'rgba(215,235,250,0.95)':'rgba(20,45,75,0.95)',
    sub:   d?'rgba(165,195,220,0.8)':'rgba(60,95,130,0.88)',
    accent:d?'#00d4ff':'#0a78b0',
    wire:  d?'rgba(180,205,230,0.85)':'rgba(50,80,115,0.9)',
    cur:   d?'#ffd24d':'#e09000',
    plus:  d?'#ff6b6b':'#d61f2a',
    minus: d?'#4fa3ff':'#0a5fd6',
    grid:  d?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.04)',
    gBg:   d?'rgb(3,9,22)':'#eef2f7',
    gAxis: d?'rgba(100,155,210,0.26)':'rgba(40,80,130,0.30)',
    gText: d?'rgba(150,205,225,0.88)':'rgba(25,65,105,0.92)',
  };
}
let T=pal();

// ═══ Fisica ═══════════════════════════════════════════════════════════════════
function step(dt){
  const Rohm=P.R*1e3, Cf=P.C*1e-6;
  let src;
  if(P.mode==='charge') src=P.V0;
  else if(P.mode==='discharge') src=0;
  else { I=0; return; }   // aperto: nessuna corrente
  // dVc/dt = (src - Vc)/(R C)
  const Ia=(src-Vc)/Rohm;        // A
  Vc += Ia/Cf*dt;
  Vc = Math.max(0, Math.min(P.V0, Vc));
  I = Ia*1000;                   // mA
  simT += dt;
  hist.push({t:simT, Vc, I});
  const win=Math.max(6*tau(), 0.5);
  while(hist.length && hist[0].t < simT-win) hist.shift();
}

// ═══ Rendering circuito ═══════════════════════════════════════════════════════
function draw(canvas){
  const [ctx, W, H] = Lab.ctx2d(canvas);
  ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  drawGrid(ctx,W,H);
  drawCircuit(ctx,W,H);
}
function drawGrid(ctx,W,H){
  ctx.strokeStyle=T.grid; ctx.lineWidth=1;
  for(let x=0;x<=W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=0;y<=H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
}

// rettangolo del circuito: batteria a sinistra, resistore in alto, condensatore a destra
function geom(W,H){
  const m=Math.min(W,H);
  const x0=W*0.5-m*0.34, x1=W*0.5+m*0.34;
  const y0=H*0.30, y1=H*0.74;
  return {x0,x1,y0,y1};
}

function drawCircuit(ctx,W,H){
  const {x0,x1,y0,y1}=geom(W,H);
  const capGap=18;       // apertura condensatore (lato destro)
  const capY=(y0+y1)/2;

  // ── fili ──
  ctx.strokeStyle=T.wire; ctx.lineWidth=2.5; ctx.lineCap='round';
  ctx.beginPath();
  // top: da sinistra a resistore e oltre a destra-alto
  ctx.moveTo(x0,y0); ctx.lineTo(x1,y0);
  // destra: da alto fino alla piastra sup del condensatore
  ctx.moveTo(x1,y0); ctx.lineTo(x1,capY-capGap/2);
  // destra: da piastra inf fino al basso
  ctx.moveTo(x1,capY+capGap/2); ctx.lineTo(x1,y1);
  // bottom
  ctx.moveTo(x1,y1); ctx.lineTo(x0,y1);
  // sinistra: basso → batteria → alto (con interruzione per batteria/switch)
  ctx.moveTo(x0,y1); ctx.lineTo(x0,capY+26);
  ctx.moveTo(x0,capY-26); ctx.lineTo(x0,y0);
  ctx.stroke();

  // ── corrente animata (dots lungo il perimetro) ──
  drawCurrentFlow(ctx,x0,x1,y0,y1,capY,capGap);

  // ── resistore (zigzag) sul lato alto ──
  drawResistor(ctx,(x0+x1)/2,y0);

  // ── condensatore (lato destro) ──
  drawCapacitor(ctx,x1,capY,capGap);

  // ── batteria + interruttore (lato sinistro) ──
  drawBattery(ctx,x0,capY);

  // etichette valori
  ctx.fillStyle=T.txt; ctx.font='12px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillText(`R = ${P.R} kΩ`, (x0+x1)/2, y0-26);
  ctx.fillStyle=T.accent;
  ctx.textAlign='left';     // a destra delle armature, senza sovrapporsi
  ctx.fillText(`C = ${P.C} µF`, x1+30, capY-4);
  ctx.fillText(`V_C = ${Lab.fmt(Vc,2)} V`, x1+30, capY+14);
  ctx.textAlign='center';
  ctx.fillStyle=T.sub;
  ctx.fillText(`${P.V0} V`, x0-40, capY+4);

  // stato + τ
  ctx.textAlign='left'; ctx.fillStyle=T.sub; ctx.font='11px "Space Mono",monospace';
  const modeLbl={charge:'CARICA',discharge:'SCARICA',open:'CIRCUITO APERTO'}[P.mode];
  ctx.fillText(`${modeLbl} · τ = RC = ${Lab.sci(tau(),3)} s · I = ${Lab.fmt(I,2)} mA`, 14, H-16);
}

function drawCurrentFlow(ctx,x0,x1,y0,y1,capY,capGap){
  if(Math.abs(I)<1e-3) return;
  // perimetro (saltando il gap del condensatore) come lista di segmenti
  const segs=[
    [x0,y0,x1,y0],                       // top →
    [x1,y0,x1,capY-capGap/2],            // right top ↓
    [x1,capY+capGap/2,x1,y1],            // right bottom ↓
    [x1,y1,x0,y1],                       // bottom ←
    [x0,y1,x0,y0],                       // left ↑
  ];
  let total=0; const len=segs.map(s=>{const l=Math.hypot(s[2]-s[0],s[3]-s[1]); total+=l; return l;});
  const dir=Math.sign(I)||1;
  flow=(flow+dir*Math.min(0.5,Math.abs(I)*0.02))% total; if(flow<0)flow+=total;
  const N=26;
  ctx.fillStyle=T.cur;
  for(let k=0;k<N;k++){
    let s=(flow+k*total/N)%total;
    for(let i=0;i<segs.length;i++){
      if(s<=len[i]){ const f=s/len[i]; const sg=segs[i];
        const x=sg[0]+(sg[2]-sg[0])*f, y=sg[1]+(sg[3]-sg[1])*f;
        ctx.beginPath(); ctx.arc(x,y,2.6,0,Math.PI*2); ctx.fill(); break; }
      s-=len[i];
    }
  }
}

function drawResistor(ctx,cx,y){
  const w=64, h=12, x=cx-w/2;
  ctx.strokeStyle=T.wire; ctx.lineWidth=2.5; ctx.beginPath();
  ctx.moveTo(x,y);
  const n=6;
  for(let i=0;i<=n;i++){ const px=x+w*i/n; const py=y+(i%2===0?0:(i%4===1?-h:h)); ctx.lineTo(px,py); }
  ctx.lineTo(x+w,y); ctx.stroke();
}

function drawCapacitor(ctx,x,cy,gap){
  const plw=34;
  ctx.strokeStyle=T.wire; ctx.lineWidth=3;
  // piastra superiore (+ in carica)
  ctx.beginPath(); ctx.moveTo(x-plw/2,cy-gap/2); ctx.lineTo(x+plw/2,cy-gap/2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x-plw/2,cy+gap/2); ctx.lineTo(x+plw/2,cy+gap/2); ctx.stroke();
  // cariche ∝ Vc/V0
  const frac=P.V0>0?Vc/P.V0:0;
  const nq=Math.round(frac*5);
  ctx.font='11px "Space Mono",monospace'; ctx.textAlign='center';
  for(let i=0;i<nq;i++){
    const px=x-plw/2+6+i*(plw-12)/Math.max(1,nq-1);
    ctx.fillStyle=T.plus;  ctx.fillText('+', px, cy-gap/2-4);
    ctx.fillStyle=T.minus; ctx.fillText('−', px, cy+gap/2+12);
  }
}

function drawBattery(ctx,x,cy){
  // interruttore in alto, batteria al centro
  const open=P.mode==='open';
  // batteria (linea lunga + / corta −)
  ctx.strokeStyle=T.wire; ctx.lineWidth=2.5;
  ctx.beginPath(); ctx.moveTo(x-9,cy-6); ctx.lineTo(x+9,cy-6); ctx.stroke();   // lunga +
  ctx.beginPath(); ctx.moveTo(x-5,cy+6); ctx.lineTo(x+5,cy+6); ctx.stroke();   // corta −
  ctx.fillStyle=T.plus; ctx.font='10px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillText('+', x-16, cy-4);
  // morsetti verso i fili (interruzione gestita dai fili in drawCircuit)
  ctx.strokeStyle=T.wire; ctx.lineWidth=2.5;
  ctx.beginPath(); ctx.moveTo(x,cy+26); ctx.lineTo(x,cy+6); ctx.stroke();
  // interruttore (leva)
  const sw=cy-26;
  ctx.strokeStyle=open?T.sub:T.cur; ctx.lineWidth=2.5;
  ctx.beginPath(); ctx.moveTo(x,cy-6); ctx.lineTo(x,sw); ctx.stroke();
  ctx.fillStyle=T.wire; ctx.beginPath(); ctx.arc(x,sw,3,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=open?'rgba(255,120,100,0.9)':T.cur; ctx.lineWidth=2.5;
  ctx.beginPath(); ctx.moveTo(x,sw);
  if(open) ctx.lineTo(x+14,sw-12); else ctx.lineTo(x,sw-12);
  ctx.stroke();
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
// Asse dei tempi: finestra di 6τ che scorre. Tensione ed energia hanno fondo scala fisso
// (V₀ massima 12 V, energia ½·C·V₀²); la corrente ha fondo scala V₀/R a gradini "tondi".
function tWindow(){ return Math.max(6*tau(),0.5); }
const V_MAX=12;

function drawVc(){
  const win=tWindow(), t1=Math.max(simT,win), t0=t1-win;
  const g=Lab.panel(gCanvas[0],{ title:'Tensione sul condensatore V_C (V)', xr:[t0,t1], yr:[0,V_MAX], yStep:3, xLabel:'t (s)' });
  if(!g) return; const [ctx,f]=g;
  // V₀ e il 63% di V₀ (t = τ in carica)
  ctx.save(); ctx.setLineDash([3,3]); ctx.strokeStyle=f.C.amber; ctx.lineWidth=1;
  for(const v of [P.V0, 0.632*P.V0]){ ctx.beginPath(); ctx.moveTo(f.L,f.Y(v)); ctx.lineTo(f.R,f.Y(v)); ctx.stroke(); }
  ctx.restore();
  Lab.plotPts(ctx,f,hist.map(h=>[h.t,h.Vc]),f.C.accent,2);
  Lab.legend(ctx,f.L+8,f.T+8,[[f.C.accent,'V_C'],[f.C.amber,'V₀ e 63% V₀',[3,3]]]);
}

function drawI(){
  const win=tWindow(), t1=Math.max(simT,win), t0=t1-win;
  const Im=Lab.niceMax(P.V0/P.R);            // mA (R in kΩ)
  const g=Lab.panel(gCanvas[1],{ title:'Corrente I (mA)', xr:[t0,t1], yr:[-Im,Im], xLabel:'t (s)' });
  if(!g) return; const [ctx,f]=g;
  Lab.plotPts(ctx,f,hist.map(h=>[h.t,h.I]),f.C.amber,2);
  Lab.legend(ctx,f.L+8,f.T+8,[[f.C.amber,'+ in carica, − in scarica']]);
}

function drawEnergy(){
  const win=tWindow(), t1=Math.max(simT,win), t0=t1-win;
  const Emax=0.5*P.C*1e-6*P.V0*P.V0*1e3;    // mJ
  const Em=Lab.niceMax(Emax);
  const g=Lab.panel(gCanvas[2],{ title:'Energia nel condensatore ½CV² (mJ)', xr:[t0,t1], yr:[0,Em], xLabel:'t (s)' });
  if(!g) return; const [ctx,f]=g;
  ctx.save(); ctx.setLineDash([3,3]); ctx.strokeStyle=f.C.muted||f.C.text; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(f.L,f.Y(Emax)); ctx.lineTo(f.R,f.Y(Emax)); ctx.stroke(); ctx.restore();
  Lab.plotPts(ctx,f,hist.map(h=>[h.t,0.5*P.C*1e-6*h.Vc*h.Vc*1e3]),f.C.green,2);
  Lab.legend(ctx,f.L+8,f.T+8,[[f.C.green,'E(t)'],[f.C.text,'½CV₀²',[3,3]]]);
}

function drawGraphs(){ drawVc(); drawI(); drawEnergy(); }

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls(){
  const cont=document.getElementById('controls');
  cont.innerHTML='';

  const secC=Lab.Section('Componenti');
  cont.appendChild(secC.el);
  secC.add(Lab.Slider({ label:'Resistenza R', min:1, max:100, step:1, value:P.R, unit:' kΩ', onChange(v){P.R=v;} }));
  secC.add(Lab.Slider({ label:'Capacità C', min:10, max:1000, step:10, value:P.C, unit:' µF', onChange(v){P.C=v;} }));
  secC.add(Lab.Slider({ label:'Tensione V₀', min:1, max:12, step:0.5, value:P.V0, unit:' V', onChange(v){P.V0=v; Vc=Math.min(Vc,v);} }));

  const secM=Lab.Section('Interruttore');
  cont.appendChild(secM.el);
  secM.add(Lab.RadioGroup({
    label:'Modalità',
    options:[
      {value:'charge',   label:'Carica (→ batteria)'},
      {value:'discharge',label:'Scarica (→ R)'},
      {value:'open',     label:'Aperto'},
    ],
    value:P.mode, onChange(v){ P.mode=v; },
  }));
}

// ═══ Graph panel ══════════════════════════════════════════════════════════════
function initGraphs(){
  // riga di grafici standard (Lab.graphPanels); i titoli sono disegnati dentro i grafici
  gCanvas = Lab.graphPanels(document.getElementById('graphArea'), 3);
  gCtx = gCanvas.map(c => c.getContext('2d'));
  gTitle = gCanvas.map(() => ({ textContent: '' }));
}

// ═══ Init ═════════════════════════════════════════════════════════════════════
function init(){
  Lab.initTheme();
  buildControls();
  initGraphs();

  const simCanvas=document.getElementById('simCanvas');
  readout=new Lab.Readout(document.getElementById('readout'),[
    {key:'vc',   label:'V condensatore'},
    {key:'i',    label:'Corrente'},
    {key:'tau',  label:'Costante τ'},
    {key:'pct',  label:'Carica'},
  ]);

  const btn=document.getElementById('btnCharge');
  function syncBtn(){ btn.textContent = P.mode==='charge'?'⚡  CARICA':(P.mode==='discharge'?'⚡  SCARICA':'⚡  CARICA'); }
  btn.addEventListener('click',()=>{
    P.mode = P.mode==='charge' ? 'discharge' : 'charge';
    buildControls(); syncBtn();
  });
  document.getElementById('btnReset').addEventListener('click',()=>{
    P.R=10; P.C=100; P.V0=9; P.mode='open'; Vc=0; I=0; simT=0; hist=[]; buildControls(); syncBtn();
  });

  function resize(){
    const area=document.querySelector('.lab-canvas-area');
    if(!area)return;
    const ar=area.getBoundingClientRect();
    const rb=document.getElementById('readout').getBoundingClientRect();
    const ga=document.getElementById('graphArea');
    const gaH=ga?ga.offsetHeight:0;
    Lab.hidpi(simCanvas, Math.floor(ar.width), Math.max(160,Math.floor(ar.height-rb.height-gaH-4)));
    Lab.fitPanels(gCanvas);
  }
  resize();
  new ResizeObserver(resize).observe(document.querySelector('.lab-canvas-area'));

  let last=performance.now();
  function frame(now){
    const dt=Math.min((now-last)/1000,0.04); last=now;
    T=pal();
    step(dt);
    draw(simCanvas);
    drawGraphs();
    readout.set('vc', Lab.fmt(Vc,2)+' V');
    readout.set('i', Lab.fmt(I,3)+' mA');
    readout.set('tau', Lab.sci(tau(),3)+' s');
    readout.set('pct', Lab.fmt(P.V0>0?(Vc/P.V0*100):0,0)+' %');
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

window.addEventListener('DOMContentLoaded', init);
