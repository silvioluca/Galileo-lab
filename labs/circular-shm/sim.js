'use strict';

// ═══ Stato ════════════════════════════════════════════════════════════════════
const P = {
  A1:1.0,  w1:1.2,  ph1:0,           // oscillatore 1 (ampiezza m, ω rad/s, fase °)
  compare:false,
  A2:0.7,  w2:1.8,  ph2:90,          // oscillatore 2
  showV:true, showA:true,            // vettori velocità / accelerazione
  series:{x:true, v:false, a:false}, // curve mostrate nel grafico 1
  speed:1.0,
};
const AMAX=1.5;
const COL=['#ffb84d','#9b8cff'];

let tSim=0, running=true;
let oscs=[];   // [{A,w,ph,col, hist:[]}]
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
    ring:  d?'rgba(150,175,205,0.4)':'rgba(60,95,130,0.45)',
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
function theta(o){ return o.w*tSim + o.ph*Math.PI/180; }
function state(o){
  const th=theta(o);
  return { th, x:o.A*Math.cos(th), y:o.A*Math.sin(th),
           vx:-o.A*o.w*Math.sin(th), vSHM:-o.A*o.w*Math.sin(th),
           aSHM:-o.A*o.w*o.w*Math.cos(th) };
}
function reset(){
  tSim=0;
  const defs=P.compare?[0,1]:[0];
  oscs=defs.map(i=>({A:i?P.A2:P.A1, w:i?P.w2:P.w1, ph:i?P.ph2:P.ph1, col:COL[i], hist:[]}));
}
function step(dt){
  if(!running) return;
  tSim+=dt;
  for(const o of oscs){ const s=state(o);
    o.hist.push({t:tSim, x:s.x, v:s.vSHM, a:s.aSHM});
    if(o.hist.length>2400) o.hist.shift(); }
}

// ═══ Rendering ════════════════════════════════════════════════════════════════
function vec(ctx,x1,y1,x2,y2,col,lbl){
  if(Math.hypot(x2-x1,y2-y1)<3) return;
  ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=2.4;
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  const a=Math.atan2(y2-y1,x2-x1);
  ctx.beginPath(); ctx.moveTo(x2,y2);
  ctx.lineTo(x2-8*Math.cos(a-0.4),y2-8*Math.sin(a-0.4));
  ctx.lineTo(x2-8*Math.cos(a+0.4),y2-8*Math.sin(a+0.4));
  ctx.closePath(); ctx.fill();
  if(lbl){ ctx.font='bold 10px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText(lbl,x2+ (x2>x1?8:-8),y2-6); }
}

function draw(canvas){
  const [ctx, W, H] = Lab.ctx2d(canvas);
  ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  drawGrid(ctx,W,H);

  const cxC=W*0.30, cyC=H*0.42;
  const Rref=Math.min(W*0.20,H*0.34);
  const sc=Rref/AMAX;                         // unità → px
  const yProj=cyC+Rref+46;                    // asse del moto armonico (orizzontale)

  // cerchio di riferimento + assi
  ctx.strokeStyle=T.ring; ctx.lineWidth=1;
  oscs.forEach(o=>{ ctx.beginPath(); ctx.arc(cxC,cyC,o.A*sc,0,Math.PI*2); ctx.stroke(); });
  ctx.setLineDash([3,4]); ctx.strokeStyle=T.ring; ctx.lineWidth=0.6;
  ctx.beginPath(); ctx.moveTo(cxC-Rref-10,cyC); ctx.lineTo(cxC+Rref+10,cyC); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cxC,cyC-Rref-10); ctx.lineTo(cxC,cyC+Rref+10); ctx.stroke();
  ctx.setLineDash([]);

  // asse del moto armonico
  ctx.strokeStyle=T.ring; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(cxC-Rref-10,yProj); ctx.lineTo(cxC+Rref+10,yProj); ctx.stroke();
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillText('moto armonico  x = A·cos(ωt+φ)', cxC, yProj+24);

  oscs.forEach((o,oi)=>{
    const s=state(o);
    const px=cxC+s.x*sc, py=cyC-s.y*sc;       // particella sul cerchio (y schermo invertita)
    // raggio (fasore)
    ctx.strokeStyle=o.col; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(cxC,cyC); ctx.lineTo(px,py); ctx.stroke();
    // proiezione verticale sull'asse armonico
    ctx.strokeStyle='rgba(150,175,205,0.45)'; ctx.lineWidth=0.8; ctx.setLineDash([2,3]);
    ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(px,yProj); ctx.stroke(); ctx.setLineDash([]);

    // vettori sulla particella (circolare)
    if(P.showV){ // velocità tangente: (-sinθ, cosθ) → schermo y invertita
      const k=18; vec(ctx,px,py, px - Math.sin(s.th)*o.w*k, py - Math.cos(s.th)*o.w*k, T.vcol, oi===0?'v':null);
    }
    if(P.showA){ // accelerazione centripeta: verso il centro
      const k=10; const aMag=o.w*o.w*o.A;
      vec(ctx,px,py, px+(cxC-px)/Math.max(1,Math.hypot(cxC-px,cyC-py))*aMag*k, py+(cyC-py)/Math.max(1,Math.hypot(cxC-px,cyC-py))*aMag*k, T.acol, oi===0?'a':null);
    }

    // particella
    ctx.fillStyle=o.col; ctx.beginPath(); ctx.arc(px,py,7,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=1; ctx.stroke();

    // punto del moto armonico sull'asse + vettori v,a (orizzontali)
    const hx=px, hy=yProj;
    ctx.fillStyle=o.col; ctx.beginPath(); ctx.arc(hx,hy,6,0,Math.PI*2); ctx.fill();
    if(P.showV) vec(ctx,hx,hy, hx+s.vSHM*sc*0.5, hy, T.vcol, null);
    if(P.showA) vec(ctx,hx,hy-12, hx+s.aSHM*sc*0.5, hy-12, T.acol, null);
  });

  // a destra: una massa su una molla con lo stesso moto x(t) (oscillatore armonico reale)
  if(W>700){
    const cxS=W*0.76, wall=cxS-AMAX*sc-70;
    oscs.forEach((o,oi)=>{
      const yS=cyC-40+oi*90, s=state(o), bx=cxS+s.x*sc, bw=34;
      ctx.fillStyle=T.ring; ctx.fillRect(wall-8,yS-28,8,56);             // parete
      // molla a zig-zag dalla parete al blocco
      const n=14, x0=wall, x1=bx-bw/2, amp=9;
      ctx.strokeStyle=T.sub; ctx.lineWidth=1.4; ctx.beginPath(); ctx.moveTo(x0,yS);
      for(let k=1;k<n;k++) ctx.lineTo(x0+(x1-x0)*k/n, yS+(k%2?-amp:amp));
      ctx.lineTo(x1,yS); ctx.stroke();
      ctx.fillStyle=o.col; ctx.fillRect(bx-bw/2,yS-bw/2,bw,bw);
      ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.strokeRect(bx-bw/2,yS-bw/2,bw,bw);
      // posizione di equilibrio
      ctx.setLineDash([3,4]); ctx.strokeStyle=T.ring; ctx.lineWidth=0.8;
      ctx.beginPath(); ctx.moveTo(cxS,yS-30); ctx.lineTo(cxS,yS+30); ctx.stroke(); ctx.setLineDash([]);
      if(P.showV) vec(ctx,bx,yS-bw/2-8, bx+s.vSHM*sc*0.5, yS-bw/2-8, T.vcol, null);
      if(P.showA) vec(ctx,bx,yS+bw/2+8, bx+s.aSHM*sc*0.5, yS+bw/2+8, T.acol, null);
    });
    ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace'; ctx.textAlign='center';
    ctx.fillText(`massa su una molla: stesso moto, ω = √(k/m)`, cxS, cyC-40+oscs.length*90-20);
  }

  // intestazione
  ctx.textAlign='left';
  ctx.fillStyle=T.accent; ctx.font='bold 14px "Space Mono",monospace';
  ctx.fillText('La proiezione del moto circolare uniforme è un moto armonico', 14, 24);
  ctx.fillStyle=T.sub; ctx.font='11px "Space Mono",monospace';
  ctx.fillText('v = −Aω·sin(ωt+φ)     a = −Aω²·cos(ωt+φ) = −ω²·x', 14, 42);

  // legenda oscillatori (T, f, ω, fase)
  oscs.forEach((o,oi)=>{
    const ly=60+oi*16; const Tp=2*Math.PI/o.w;
    ctx.fillStyle=o.col; ctx.beginPath(); ctx.arc(20,ly-3,5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=T.txt; ctx.font='10px "Space Mono",monospace';
    ctx.fillText(`A = ${Lab.fmt(o.A,2)} m   ω = ${Lab.fmt(o.w,2)} rad/s   T = ${Lab.fmt(Tp,2)} s   φ = ${o.ph}°`, 30, ly);
  });
}

function drawGrid(ctx,W,H){
  ctx.strokeStyle=T.grid; ctx.lineWidth=1;
  for(let gx=0;gx<=W;gx+=40){ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,H);ctx.stroke();}
  for(let gy=0;gy<=H;gy+=40){ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(W,gy);ctx.stroke();}
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
function tWin(){ return Math.max(8, tSim+0.5); }
// riquadro quadrato centrato (per spazio delle fasi e Lissajous, dove serve il rapporto 1:1)
function squarePanel(cv, o){
  if(!cv || !cv._dpr) return null;
  const [ctx,W,H]=Lab.ctx2d(cv), C=Lab.graphColors();
  ctx.fillStyle=C.bg; ctx.fillRect(0,0,W,H);
  const side=Math.min(W-20, H-10);              // con questi margini l'area del grafico è quadrata
  return [ctx, Lab.axes(ctx,{ x:(W-side)/2, y:0, w:side, h:H, bg:false, ...o })];
}

// 1: x(t), v(t)/ω e a(t)/ω²: tutte in metri e con la stessa ampiezza A, così si vedono gli
//    sfasamenti (v anticipa x di 90°, a è opposta a x)
function drawXt(){
  const g=Lab.panel(gCanvas[0],{ title:'x, v/ω e a/ω² (m)', xr:[0,tWin()], yr:[-AMAX,AMAX], yStep:0.5, xLabel:'t (s)' });
  if(!g) return; const [ctx,f]=g;
  const SER=[['x','#ffd24d',1],['v',T.vcol,0],['a',T.acol,0]];
  for(const [key,col] of SER){
    if(!P.series[key]) continue;
    oscs.forEach((o,oi)=>{
      if(!o.hist.length) return;
      const k = key==='x' ? 1 : key==='v' ? 1/o.w : 1/(o.w*o.w);
      ctx.save(); ctx.setLineDash(oi?[4,3]:[]);
      Lab.plotPts(ctx,f,o.hist.map(h=>[h.t,h[key]*k]),col,2);
      ctx.restore();
    });
  }
}

// 2: spazio delle fasi (x, v/ω): x² + (v/ω)² = A², una circonferenza percorsa in senso orario
function drawPhase(){
  const g=squarePanel(gCanvas[1],{ title:'Spazio delle fasi', xr:[-AMAX,AMAX], yr:[-AMAX,AMAX], xStep:0.5, yStep:0.5, xLabel:'x (m)', padL:34 });
  if(!g) return; const [ctx,f]=g;
  for(const o of oscs){
    Lab.plotPts(ctx,f,Array.from({length:97},(_,i)=>{ const a=i/96*2*Math.PI; return [o.A*Math.cos(a),o.A*Math.sin(a)]; }),o.col,1.6);
    const s=state(o);
    Lab.dot(ctx,f,s.x,s.vSHM/o.w,o.col,4);
  }
  ctx.fillStyle=f.C.text; ctx.font='9.5px "DM Sans",sans-serif'; ctx.textAlign='left'; ctx.textBaseline='middle';
  ctx.fillText('v/ω (m)', f.L+4, f.T+8);
}

// 3: figura di Lissajous x₁–x₂ (confronto) oppure a(t)
function drawThird(){
  if(oscs.length>1){
    const g=squarePanel(gCanvas[2],{ title:'Lissajous: x₂ in funzione di x₁', xr:[-AMAX,AMAX], yr:[-AMAX,AMAX], xStep:0.5, yStep:0.5, xLabel:'x₁ (m)', padL:34 });
    if(!g) return; const [ctx,f]=g;
    const o1=oscs[0], o2=oscs[1];
    const Tc=2*Math.PI/Math.min(o1.w,o2.w)*8;
    const pts=[]; for(let i=0;i<=600;i++){ const tt=i/600*Tc;
      pts.push([o1.A*Math.cos(o1.w*tt+o1.ph*Math.PI/180), o2.A*Math.cos(o2.w*tt+o2.ph*Math.PI/180)]); }
    Lab.plotPts(ctx,f,pts,f.C.accent,1.4);
    const s1=state(o1), s2=state(o2);
    Lab.dot(ctx,f,s1.x,s2.x,f.C.accent,4);
    return;
  }
  const o=oscs[0], am=Lab.niceMax(AMAX*o.w*o.w*1.05);
  const g=Lab.panel(gCanvas[2],{ title:'Accelerazione a(t) = −ω²·x (m/s²)', xr:[0,tWin()], yr:[-am,am], xLabel:'t (s)' });
  if(!g) return; const [ctx,f]=g;
  if(o.hist.length) Lab.plotPts(ctx,f,o.hist.map(h=>[h.t,h.a]),T.acol,2);
}
function drawGraphs(){ drawXt(); drawPhase(); drawThird(); }

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls(){
  const cont=document.getElementById('controls');
  cont.innerHTML='';

  const s1=Lab.Section('Oscillatore 1');
  cont.appendChild(s1.el);
  s1.add(Lab.Slider({ label:'Ampiezza A', min:0.3, max:1.5, step:0.05, value:P.A1, unit:' m', onChange(v){P.A1=v; reset();} }));
  s1.add(Lab.Slider({ label:'Pulsazione ω', min:0.3, max:3, step:0.1, value:P.w1, unit:' rad/s', onChange(v){P.w1=v; reset();} }));
  s1.add(Lab.Slider({ label:'Fase φ', min:0, max:360, step:15, value:P.ph1, unit:'°', onChange(v){P.ph1=v; reset();} }));

  const sc=Lab.Section('Confronto');
  cont.appendChild(sc.el);
  sc.add(Lab.Toggle({ label:'Aggiungi secondo oscillatore', value:P.compare, onChange(v){P.compare=v; buildControls(); reset();} }));
  if(P.compare){
    sc.add(Lab.Slider({ label:'Ampiezza A (2)', min:0.3, max:1.5, step:0.05, value:P.A2, unit:' m', onChange(v){P.A2=v; reset();} }));
    sc.add(Lab.Slider({ label:'Pulsazione ω (2)', min:0.3, max:3, step:0.1, value:P.w2, unit:' rad/s', onChange(v){P.w2=v; reset();} }));
    sc.add(Lab.Slider({ label:'Fase φ (2)', min:0, max:360, step:15, value:P.ph2, unit:'°', onChange(v){P.ph2=v; reset();} }));
  }

  const sv=Lab.Section('Visualizzazione');
  cont.appendChild(sv.el);
  sv.add(Lab.Toggle({ label:'Vettore velocità', value:P.showV, onChange(v){P.showV=v;} }));
  sv.add(Lab.Toggle({ label:'Vettore accelerazione', value:P.showA, onChange(v){P.showA=v;} }));
  sv.add(Lab.Slider({ label:'Velocità simulazione', min:0.2, max:2.5, step:0.1, value:P.speed, unit:'×', onChange(v){P.speed=v;} }));
}

// ═══ Graph panel ══════════════════════════════════════════════════════════════
function initGraphs(){
  // riga di grafici standard (Lab.graphPanels); i titoli sono disegnati dentro i grafici
  gCanvas = Lab.graphPanels(document.getElementById('graphArea'), 3);
  gCtx = gCanvas.map(c => c.getContext('2d'));
  gTitle = gCanvas.map(() => ({ textContent: '' }));
  // pulsanti x / v / a sul primo grafico
  const bar=document.createElement('div');
  bar.style.cssText='position:absolute;top:5px;right:8px;z-index:2;display:flex;gap:4px;';
  for(const [key,col] of [['x','#ffd24d'],['v','#4fd0ff'],['a','#ff5d73']]){
    const b=document.createElement('button');
    b.textContent=key; b.title='mostra/nascondi '+key;
    const sty=act=>`font-family:"Space Mono",monospace;font-size:10px;width:20px;height:17px;line-height:14px;padding:0;border-radius:4px;cursor:pointer;border:1px solid ${col};background:${act?col:'transparent'};color:${act?'#06090f':col};`;
    b.style.cssText=sty(P.series[key]);
    b.addEventListener('click',()=>{ P.series[key]=!P.series[key]; b.style.cssText=sty(P.series[key]); });
    bar.appendChild(b);
  }
  gCanvas[0].parentElement.appendChild(bar);
}

// ═══ Init ═════════════════════════════════════════════════════════════════════
function init(){
  Lab.initTheme();
  buildControls();
  initGraphs();
  reset();

  const simCanvas=document.getElementById('simCanvas');
  readout=new Lab.Readout(document.getElementById('readout'),[
    {key:'t', label:'Tempo'},
    {key:'x', label:'x (armonico)'},
    {key:'T', label:'Periodo'},
    {key:'f', label:'Frequenza'},
  ]);

  const btn=document.getElementById('btnPlay');
  btn.addEventListener('click',()=>{ running=!running; btn.textContent=running?'⏸  PAUSA':'▶  PLAY'; });
  document.getElementById('btnReset').addEventListener('click',()=>{ reset(); });

  function resize(){
    const parent=simCanvas.parentElement; if(!parent)return;
    const ga=document.getElementById('graphArea'); const rb=document.getElementById('readout');
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
    const o=oscs[0]; const s=state(o); const Tp=2*Math.PI/o.w;
    readout.set('t', Lab.fmt(tSim,2)+' s');
    readout.set('x', Lab.fmt(s.x,2)+' m');
    readout.set('T', Lab.fmt(Tp,2)+' s');
    readout.set('f', Lab.fmt(1/Tp,3)+' Hz');
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
