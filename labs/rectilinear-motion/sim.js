'use strict';

// ═══ Stato ════════════════════════════════════════════════════════════════════
const P = {
  x0: 0,  v0: 8,  F: 0,  m: 2,  mu: 0,    // corpo 1: forza (N), massa (kg), attrito dinamico
  compare:false,                           // secondo corpo attivo
  x02:0, v02:4, F2:0, m2:2, mu2:0,         // corpo 2
  strobo: true,
  speed: 1.0,
};
const SPAN = 100;                   // metri visibili (l'asse scorre)
const BODY_COL = ['#ffb84d','#9b8cff'];
const Gacc = 9.81;                  // accelerazione di gravità (per l'attrito)

let tSim=0, running=false, camLeft=0;
let bodies=[];   // [{x0,v0,F,m,mu,col, x,v,a, ghosts:[], hist:[], ghostAcc}]
let meetingsList=[], prevD=null;
let gTitle=[null,null,null];
let gCanvas=[null,null,null], gCtx=[null,null,null];
let readout;

// ═══ Palette ══════════════════════════════════════════════════════════════════
function dk(){ return document.documentElement.dataset.theme !== 'light'; }
function pal(){
  const d=dk();
  return {
    bg:    d?'#06090f':'#e7edf4',
    txt:   d?'rgba(215,235,250,0.95)':'rgba(20,45,75,0.95)',
    sub:   d?'rgba(165,195,220,0.8)':'rgba(60,95,130,0.88)',
    accent:d?'#00d4ff':'#0a78b0',
    track: d?'rgba(150,175,205,0.5)':'rgba(60,95,130,0.55)',
    body:  d?'#ffb84d':'#d2860a',
    vcol:  d?'#4fd0ff':'#0a78b0',
    acol:  d?'#ff5d73':'#d61f4a',
    grid:  d?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.04)',
    gBg:   d?'rgb(3,9,22)':'#eef2f7',
    gAxis: d?'rgba(100,155,210,0.26)':'rgba(40,80,130,0.30)',
    gText: d?'rgba(150,205,225,0.88)':'rgba(25,65,105,0.92)',
  };
}
let T=pal();

// ═══ Fisica ═══════════════════════════════════════════════════════════════════
function typeLabel(b){
  if(b.mu>0) return 'con attrito dinamico';
  return Math.abs(b.F)<1e-9 ? 'uniforme (MRU)' : 'unif. accelerato (MRUA)';
}

// accelerazione netta:  a = (F − F_attrito)/m ,  con l'attrito che si oppone al moto
function accel(b){
  const fmax=b.mu*b.m*Gacc;                       // attrito massimo
  if(Math.abs(b.v)<1e-4){                          // da fermo: l'attrito statico tiene se |F|≤fmax
    if(Math.abs(b.F)<=fmax) return 0;
    return (b.F - Math.sign(b.F)*fmax)/b.m;
  }
  return b.F/b.m - b.mu*Gacc*Math.sign(b.v);        // in moto: attrito dinamico opposto a v
}

// punti d'incontro: rilevati numericamente (cambio di segno di x1−x2)
function meetings(){ return meetingsList; }

function reset(){
  tSim=0; running=false; meetingsList=[]; prevD=null;
  const defs = P.compare ? [0,1] : [0];
  bodies = defs.map(i=>{
    const x0=i?P.x02:P.x0, v0=i?P.v02:P.v0, F=i?P.F2:P.F, m=i?P.m2:P.m, mu=i?P.mu2:P.mu;
    return { x0, v0, F, m, mu, col:BODY_COL[i], x:x0, v:v0, a:0, ghosts:[], hist:[], ghostAcc:0 };
  });
  camLeft = bodies[0].x0 - SPAN*0.45;
  const btn=document.getElementById('btnPlay'); if(btn) btn.textContent='▶  AVVIA';
}

function step(dt){
  if(!running) return;
  tSim+=dt;
  for(const b of bodies){
    const a=accel(b);
    let vNew=b.v + a*dt;
    // arresto per attrito: se v attraversa lo zero e la forza non basta a ripartire → fermo
    if(b.v!==0 && Math.sign(vNew)!==Math.sign(b.v)){
      if(Math.abs(b.F)<=b.mu*b.m*Gacc+1e-9) vNew=0;
    }
    b.x += (b.v+vNew)*0.5*dt;        // integrazione trapezoidale
    b.v = vNew;
    b.a = (Math.abs(b.v)<1e-4 && accel(b)===0) ? 0 : a;
    b.hist.push({t:tSim, x:b.x, v:b.v, a:b.a});
    if(b.hist.length>2000) b.hist.shift();
    b.ghostAcc+=dt;
    while(b.ghostAcc>=0.5){ b.ghostAcc-=0.5; b.ghosts.push(b.x); if(b.ghosts.length>80) b.ghosts.shift(); }
  }
  // rilevazione incontri (cambio di segno di x1−x2)
  if(bodies.length>1){
    const d=bodies[0].x-bodies[1].x;
    if(prevD!==null && prevD!==0 && Math.sign(d)!==Math.sign(prevD)){
      meetingsList.push({t:tSim, x:(bodies[0].x+bodies[1].x)/2});
      if(meetingsList.length>6) meetingsList.shift();
    }
    prevD=d;
  }
  if(bodies.some(b=>Math.abs(b.x)>1e5)) running=false;
}

// ═══ Rendering ════════════════════════════════════════════════════════════════
function draw(canvas){
  const [ctx, W, H] = Lab.ctx2d(canvas);
  ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  drawGrid(ctx,W,H);

  const m=40, x0=m, w=W-2*m;
  const cy=H*0.52;
  const pxPerM=w/SPAN;

  // telecamera: segue il punto focale (corpo 1, o media se confronto)
  const focus = bodies.length>1 ? (bodies[0].x+bodies[1].x)/2 : bodies[0].x;
  const lo=camLeft+SPAN*0.20, hi=camLeft+SPAN*0.80;
  if(focus<lo) camLeft=focus-SPAN*0.20;
  if(focus>hi) camLeft=focus-SPAN*0.80;
  const X=xm=> x0 + (xm-camLeft)*pxPerM;

  // pista
  ctx.strokeStyle=T.track; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(x0,cy+24); ctx.lineTo(x0+w,cy+24); ctx.stroke();
  // tacche dinamiche ogni 10 m (anche negative); zero evidenziato
  ctx.font='9px "Space Mono",monospace'; ctx.textAlign='center';
  const first=Math.ceil(camLeft/10)*10, lastM=camLeft+SPAN;
  for(let xm=first; xm<=lastM; xm+=10){ const px=X(xm); const isZero=(xm===0);
    ctx.strokeStyle=isZero?T.accent:T.track; ctx.lineWidth=isZero?2:1;
    ctx.beginPath(); ctx.moveTo(px,cy+24); ctx.lineTo(px,cy+(isZero?34:30)); ctx.stroke();
    ctx.fillStyle=isZero?T.accent:T.sub; ctx.fillText(xm+'', px, cy+44); }

  // corpi (con ghost e vettori); il corpo 2 leggermente più in alto per leggibilità
  bodies.forEach((b,bi)=>{
    const by=cy + (bodies.length>1 ? (bi===0?-0:0) : 0);
    // ghost stroboscopici
    if(P.strobo){
      b.ghosts.forEach((gx,i)=>{ const px=X(gx); if(px<x0-20||px>x0+w+20)return;
        ctx.globalAlpha=0.14+0.5*(i/Math.max(1,b.ghosts.length));
        ctx.fillStyle=b.col; ctx.beginPath(); ctx.arc(px,by,5,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1; });
    }
    const bx=X(b.x);
    ctx.fillStyle=b.col; ctx.beginPath(); ctx.arc(bx,by,9,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=1; ctx.stroke();
    ctx.fillStyle=dk()?'#0a0e16':'#fff'; ctx.font='bold 9px "Space Mono",monospace'; ctx.textAlign='center';
    ctx.fillText(String(bi+1), bx, by+3);
    // vettori v e a
    if(Math.abs(b.v)>0.05) arrow(ctx, bx, by-18, bx+b.v*4, by-18, T.vcol, 'v');
    if(Math.abs(b.a)>0.01) arrow(ctx, bx, by-34, bx+b.a*8, by-34, T.acol, 'a');
  });

  // intestazione: tipo di moto (dedotto da a) sempre in cima
  ctx.textAlign='left';
  ctx.fillStyle=T.accent; ctx.font='bold 14px "Space Mono",monospace';
  const title = bodies.length>1
    ? `Confronto · ① ${typeLabel(bodies[0])} · ② ${typeLabel(bodies[1])}`
    : `Moto ${typeLabel(bodies[0])}`;
  ctx.fillText(title, 14, 24);
  ctx.fillStyle=T.sub; ctx.font='11px "Space Mono",monospace';
  const anyFric=bodies.some(b=>b.mu>0);
  ctx.fillText(anyFric ? 'a = (F − μ·m·g·sgn v)/m     F_attr = μ·m·g'
                       : 'a = F/m     x = x₀ + v₀·t + ½·a·t²', 14, 42);

  // ── punti d'incontro: solo DOPO che sono avvenuti; etichette SOTTO l'asse ──
  const mtsAll=meetings();
  const mts=mtsAll.filter(mt=>mt.t<=tSim+1e-6);
  for(const mt of mts){
    const px=X(mt.x); if(px<x0-10||px>x0+w+10) continue;
    // rombo sull'asse
    ctx.save(); ctx.translate(px,cy+24);
    ctx.fillStyle=T.accent;
    ctx.beginPath(); ctx.moveTo(0,-9); ctx.lineTo(7,0); ctx.lineTo(0,9); ctx.lineTo(-7,0); ctx.closePath(); ctx.fill();
    ctx.restore();
    // etichette sotto i numeri delle tacche (le palline non le coprono)
    ctx.fillStyle=T.accent; ctx.font='9px "Space Mono",monospace'; ctx.textAlign='center';
    ctx.fillText('incontro', px, cy+58);
    ctx.fillText(`t=${Lab.fmt(mt.t,1)}s · x=${Lab.fmt(mt.x,1)}m`, px, cy+69);
  }

  // legenda con valori live
  ctx.textAlign='left';
  bodies.forEach((b,bi)=>{
    const ly=64+bi*16;
    ctx.fillStyle=b.col; ctx.beginPath(); ctx.arc(20,ly-3,5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=T.txt; ctx.font='10px "Space Mono",monospace';
    let s=`x=${Lab.fmt(b.x,1)} m   v=${Lab.fmt(b.v,1)} m/s   a=${Lab.fmt(b.a,2)} m/s²   m=${b.m} kg`;
    if(b.mu>0) s+=`   F_a=${Lab.fmt((b.mu*b.m*Gacc),1)} N`;
    ctx.fillText(s, 30, ly);
  });
  // riepilogo incontri (rilevati durante la simulazione)
  if(bodies.length>1 && mts.length){
    const ly=64+bodies.length*16;
    ctx.fillStyle=T.accent; ctx.font='10px "Space Mono",monospace';
    ctx.fillText('Incontri: '+mts.map(mt=>`t=${Lab.fmt(mt.t,1)}s (x=${Lab.fmt(mt.x,1)}m)`).join('  ·  '), 20, ly);
  }
}

function drawGrid(ctx,W,H){
  ctx.strokeStyle=T.grid; ctx.lineWidth=1;
  for(let gx=0;gx<=W;gx+=40){ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,H);ctx.stroke();}
  for(let gy=0;gy<=H;gy+=40){ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(W,gy);ctx.stroke();}
}

function arrow(ctx,x1,y1,x2,y2,col,lbl){
  ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=2.5;
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  const ang=Math.atan2(y2-y1,x2-x1);
  ctx.beginPath(); ctx.moveTo(x2,y2);
  ctx.lineTo(x2-8*Math.cos(ang-0.4),y2-8*Math.sin(ang-0.4));
  ctx.lineTo(x2-8*Math.cos(ang+0.4),y2-8*Math.sin(ang+0.4));
  ctx.closePath(); ctx.fill();
  ctx.font='bold 10px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillText(lbl, (x1+x2)/2, y1-6);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
// Tempo da 0 a 8 s (poi la finestra si allarga); fondo scala "tondo" che non scende mai sotto
// un minimo fisso, così un corpo lento non riempie artificiosamente il grafico.
function tWin(){ return Math.max(8, tSim+0.5); }
const G_MIN = { x: 50, v: 10, a: 2 };

function lineGraph(idx,key,title,unit){
  let m=G_MIN[key];
  for(const b of bodies){ m=Math.max(m, Math.abs(key==='x'?b.x0:key==='v'?b.v0:accel0(b))); for(const h of b.hist) m=Math.max(m, Math.abs(h[key])); }
  m=Lab.niceMax(m*1.05);
  const g=Lab.panel(gCanvas[idx],{ title:`${title} (${unit})`, xr:[0,tWin()], yr:[-m,m], xLabel:'t (s)' });
  if(!g) return; const [ctx,f]=g;
  for(const b of bodies){
    if(!b.hist.length) continue;
    Lab.plotPts(ctx,f,b.hist.map(h=>[h.t,h[key]]),b.col,2);
    const last=b.hist[b.hist.length-1];
    Lab.dot(ctx,f,last.t,last[key],b.col,3.5);
  }
  // punti d'incontro sul grafico x(t): intersezione delle due curve
  if(key==='x' && bodies.length>1){
    for(const mt of meetings()){
      if(mt.t>tSim+1e-6) continue;
      ctx.save(); ctx.strokeStyle=f.C.accent; ctx.setLineDash([2,3]);
      ctx.beginPath(); ctx.moveTo(f.X(mt.t),f.T); ctx.lineTo(f.X(mt.t),f.B); ctx.stroke(); ctx.restore();
      Lab.dot(ctx,f,mt.t,mt.x,f.C.accent,4);
    }
  }
}
// accelerazione iniziale (per scegliere il fondo scala prima della partenza)
function accel0(b){ return accel({ ...b, v:b.v0 }); }

function drawGraphs(){
  lineGraph(0,'x','Posizione x','m');
  lineGraph(1,'v','Velocità v','m/s');
  lineGraph(2,'a','Accelerazione a','m/s²');
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls(){
  const cont=document.getElementById('controls');
  cont.innerHTML='';

  const secP=Lab.Section('Corpo 1');
  cont.appendChild(secP.el);
  secP.add(Lab.Slider({ label:'Posizione x₀', min:-50, max:90, step:1, value:P.x0, unit:' m', onChange(v){P.x0=v; reset();} }));
  secP.add(Lab.Slider({ label:'Velocità v₀', min:-20, max:20, step:0.5, value:P.v0, unit:' m/s', onChange(v){P.v0=v; reset();} }));
  secP.add(Lab.Slider({ label:'Forza applicata F', min:-30, max:30, step:1, value:P.F, unit:' N', onChange(v){P.F=v; reset();} }));
  secP.add(Lab.Slider({ label:'Massa m', min:0.5, max:10, step:0.5, value:P.m, unit:' kg', onChange(v){P.m=v; reset();} }));
  secP.add(Lab.Slider({ label:'Attrito dinamico μ', min:0, max:1, step:0.05, value:P.mu, unit:'', onChange(v){P.mu=v; reset();} }));

  const secC=Lab.Section('Confronto');
  cont.appendChild(secC.el);
  secC.add(Lab.Toggle({ label:'Aggiungi secondo corpo', value:P.compare, onChange(v){ P.compare=v; buildControls(); reset(); } }));
  if(P.compare){
    secC.add(Lab.Slider({ label:'Posizione x₀ (2)', min:-50, max:90, step:1, value:P.x02, unit:' m', onChange(v){P.x02=v; reset();} }));
    secC.add(Lab.Slider({ label:'Velocità v₀ (2)', min:-20, max:20, step:0.5, value:P.v02, unit:' m/s', onChange(v){P.v02=v; reset();} }));
    secC.add(Lab.Slider({ label:'Forza applicata F (2)', min:-30, max:30, step:1, value:P.F2, unit:' N', onChange(v){P.F2=v; reset();} }));
    secC.add(Lab.Slider({ label:'Massa m (2)', min:0.5, max:10, step:0.5, value:P.m2, unit:' kg', onChange(v){P.m2=v; reset();} }));
    secC.add(Lab.Slider({ label:'Attrito dinamico μ (2)', min:0, max:1, step:0.05, value:P.mu2, unit:'', onChange(v){P.mu2=v; reset();} }));
  }

  const secV=Lab.Section('Visualizzazione');
  cont.appendChild(secV.el);
  secV.add(Lab.Toggle({ label:'Scia stroboscopica', value:P.strobo, onChange(v){P.strobo=v;} }));
  secV.add(Lab.Slider({ label:'Velocità simulazione', min:0.2, max:3, step:0.1, value:P.speed, unit:'×', onChange(v){P.speed=v;} }));
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
    {key:'t', label:'Tempo'},
    {key:'x', label:'Posizione'},
    {key:'v', label:'Velocità'},
    {key:'a', label:'Accelerazione'},
  ]);

  reset();   // costruisce i corpi iniziali

  const btn=document.getElementById('btnPlay');
  btn.addEventListener('click',()=>{
    running=!running; btn.textContent=running?'⏸  PAUSA':'▶  AVVIA';
  });
  document.getElementById('btnReset').addEventListener('click',()=>{ reset(); });

  function resize(){
    const parent=simCanvas.parentElement; if(!parent)return;
    const ga=document.getElementById('graphArea');
    const rb=document.getElementById('readout');
    const gaH=ga?ga.offsetHeight:0, rbH=rb?rb.offsetHeight:0;
    const w=parent.clientWidth, h=Math.max(140,(parent.clientHeight||0)-gaH-rbH);
    if(w>0) Lab.hidpi(simCanvas, w, h);
    Lab.fitPanels(gCanvas);
    draw(simCanvas); drawGraphs();
  }
  resize();
  new ResizeObserver(resize).observe(simCanvas.parentElement);
  window.addEventListener('load', resize);
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(resize);

  let last=performance.now();
  function frame(now){
    let dt=(now-last)/1000; if(!Number.isFinite(dt)||dt<0) dt=0; dt=Math.min(dt,0.05);
    last=now;
    step(dt*P.speed);
    T=pal();
    draw(simCanvas);
    drawGraphs();
    const b=bodies[0]||{x:0,v:0,a:0};
    readout.set('t', Lab.fmt(tSim,2)+' s');
    readout.set('x', Lab.fmt(b.x,2)+' m');
    readout.set('v', Lab.fmt(b.v,2)+' m/s');
    readout.set('a', Lab.fmt(b.a,2)+' m/s²');
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// avvia init anche se il DOM è già pronto
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
