'use strict';

// ═══ Stato ════════════════════════════════════════════════════════════════════
const SHAPES = {
  rettangolo:  { name:'Rettangolo' },
  trapezio:    { name:'Trapezio' },          // stretto in basso, largo in alto
  trapeziorov: { name:'Trapezio rovesciato' },// largo in basso, stretto in alto
};
const GR=9.81, Hcont=1.0, baseW=0.5;   // gravità, altezza recipiente (m), larghezza max (m)

const P = {
  shape:'rettangolo',
  level:0.85,                       // quantità d'acqua → livello (m)
  refill:false,                     // rifornimento continuo (livello costante); off = si svuota
  compare:false,                    // secondo foro
  holeA:{ y:0.25, a:0.005 },        // y = altezza dal fondo (m), a = apertura (m)
  holeB:{ y:0.60, a:0.005 },
  paused:false,
};

let waterLevel=P.level;             // livello dinamico (cala se rifornimento off)
let tAnim=0, last=0, tHist=0;
let hist=[];                        // storico livello per il grafico di svuotamento
let gTitle=[null,null,null];
let gCanvas=[null,null,null], gCtx=[null,null,null];
let readout;

// ═══ Palette ══════════════════════════════════════════════════════════════════
function dk(){ return document.documentElement.dataset.theme !== 'light'; }
function pal(){
  const d=dk();
  return {
    bg:    d?'#06090f':'#e7edf4',
    txt:   d?'rgba(225,238,250,0.96)':'rgba(20,40,70,0.95)',
    sub:   d?'rgba(165,195,220,0.82)':'rgba(60,90,125,0.9)',
    accent:d?'#00d4ff':'#0a78b0',
    glass: d?'rgba(200,218,238,0.78)':'rgba(80,110,150,0.72)',
    water: [70,140,235],
    jetA:  d?[0,205,255]:[0,150,205],
    jetB:  d?[255,168,66]:[225,135,25],
    ground:d?'rgba(150,175,205,0.5)':'rgba(70,100,135,0.55)',
    grid:  d?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.04)',
    ruler: d?'rgba(120,170,220,0.18)':'rgba(120,170,220,0.30)',
    gBg:   d?'rgb(3,9,22)':'#eef2f7',
    gAxis: d?'rgba(100,155,210,0.3)':'rgba(40,80,130,0.32)',
    gText: d?'rgba(150,205,225,0.88)':'rgba(25,65,105,0.92)',
  };
}
let T=pal();
const rgb=(a)=>`rgb(${a[0]},${a[1]},${a[2]})`;
const rgba=(a,al)=>`rgba(${a[0]},${a[1]},${a[2]},${al})`;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

// ═══ Fisica ═══════════════════════════════════════════════════════════════════
function wfrac(yFrac){
  const f=clamp(yFrac,0,1);
  if(P.shape==='trapezio')    return 0.5+0.5*f;   // largo in alto
  if(P.shape==='trapeziorov') return 1.0-0.5*f;   // largo in basso
  return 1;                                        // rettangolo
}
function widthM(yM){ return baseW*wfrac(yM/Hcont); }       // larghezza (m) a quota yM
function vEff(hole){ const h=waterLevel-hole.y; return h>0 ? Math.sqrt(2*GR*h) : 0; }   // Torricelli
function rangeM(hole){ const h=waterLevel-hole.y; return (h>0 && hole.y>0) ? 2*Math.sqrt(h*hole.y) : 0; }
function activeHoles(){ return P.compare ? [P.holeA,P.holeB] : [P.holeA]; }
function flowQ(){ let Q=0; for(const h of activeHoles()){ if(waterLevel>h.y) Q+=h.a*Math.sqrt(2*GR*(waterLevel-h.y)); } return Q; }   // portata totale (m²/s)
function fmtM(m){ return m<1 ? Lab.fmt((m*100),1)+' cm' : Lab.fmt(m,2)+' m'; }
function niceStep(x){ const e=Math.pow(10,Math.floor(Math.log10(x))); const f=x/e; return (f<1.5?1:f<3.5?2:f<7.5?5:10)*e; }

// ═══ Geometria ════════════════════════════════════════════════════════════════
let G={};
function geom(W,H){
  const mL=64, mR=22, mT=30, mB=46;
  const availW=W-mL-mR, availH=H-mT-mB;
  const worldW=baseW+1.15, worldH=Hcont;          // recipiente + spazio per la gittata
  const pxPerM=Math.max(20, Math.min(availW/worldW, availH/worldH));
  const yGround=H-mB;
  const centerX=mL + (baseW/2)*pxPerM;            // il bordo più largo arriva a mL
  G={W,H,pxPerM,yGround,centerX,mL,mB};
}
const yOf =(m)=> G.yGround - m*G.pxPerM;
const xR  =(yM)=> G.centerX + widthM(yM)/2*G.pxPerM;
const xL  =(yM)=> G.centerX - widthM(yM)/2*G.pxPerM;

// ═══ Step ═════════════════════════════════════════════════════════════════════
function step(dt){
  if(P.paused) return;
  if(G.W) geom(G.W,G.H);
  if(P.refill){
    waterLevel += (P.level-waterLevel)*clamp(dt*3,0,1);   // livello mantenuto costante
  } else {
    // svuotamento:  A(h)·dh/dt = −Q  →  dh/dt = −Σ aᵢ·√(2g(h−yᵢ)) / A(h)
    const A=widthM(clamp(waterLevel,0,Hcont));             // sezione al pelo libero
    if(A>1e-4) waterLevel -= (flowQ()/A)*dt;
    waterLevel=clamp(waterLevel,0,Hcont);
  }
  tHist+=dt; if(tHist>=0.05){ tHist=0; hist.push(waterLevel); if(hist.length>260) hist.shift(); }
}

// ═══ Rendering ════════════════════════════════════════════════════════════════
function drawGrid(ctx,W,H){ ctx.strokeStyle=T.grid; ctx.lineWidth=1;
  for(let x=0;x<=W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=0;y<=H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();} }

function arrow(ctx,x1,y1,x2,y2,col,lw){
  ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=lw; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  const a=Math.atan2(y2-y1,x2-x1), s=5+lw;
  ctx.beginPath(); ctx.moveTo(x2,y2); ctx.lineTo(x2-s*Math.cos(a-0.45),y2-s*Math.sin(a-0.45)); ctx.lineTo(x2-s*Math.cos(a+0.45),y2-s*Math.sin(a+0.45)); ctx.closePath(); ctx.fill();
}

// getto parabolico + marker di gittata; restituisce la gittata (m)
function drawJet(ctx,hole,col){
  const h=waterLevel-hole.y;
  if(h<=0) return 0;
  const vel=Math.sqrt(2*GR*h);
  const x0=xR(hole.y), y0=yOf(hole.y);
  const th=Math.max(2, hole.a*G.pxPerM*0.9);
  // parabola
  ctx.strokeStyle=rgba(col,0.9); ctx.lineWidth=th; ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.beginPath(); ctx.moveTo(x0,y0);
  const dt=0.004; let landed=false;
  for(let t=dt;t<6 && !landed;t+=dt){
    const curY=hole.y-0.5*GR*t*t;
    let xx=x0+vel*t*G.pxPerM, yy=G.yGround-curY*G.pxPerM;
    if(curY<=0){ const tl=Math.sqrt(2*hole.y/GR); xx=x0+vel*tl*G.pxPerM; yy=G.yGround; landed=true; }
    ctx.lineTo(xx,yy);
  }
  ctx.stroke();
  // vettore velocità di efflusso (orizzontale, alla bocca)
  arrow(ctx, x0, y0, x0+Math.min(46, vel*G.pxPerM*0.5+10), y0, rgb(col), 2);
  // marker di gittata a terra
  const R=rangeM(hole), xr=x0+R*G.pxPerM;
  ctx.strokeStyle=rgba(col,0.5); ctx.setLineDash([4,3]); ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(xr,y0); ctx.lineTo(xr,G.yGround); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle=rgb(col); ctx.beginPath(); ctx.moveTo(xr,G.yGround); ctx.lineTo(xr-4,G.yGround-7); ctx.lineTo(xr+4,G.yGround-7); ctx.closePath(); ctx.fill();
  return R;
}

// foro sulla parete destra (apertura di altezza a)
function drawHole(ctx,hole,col){
  const x=xR(hole.y), y=yOf(hole.y), ah=Math.max(4, hole.a*G.pxPerM);
  ctx.fillStyle=T.bg; ctx.fillRect(x-3, y-ah/2, 6, ah);            // taglio nella parete
  ctx.strokeStyle=rgb(col); ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(x-3,y-ah/2); ctx.lineTo(x+3,y-ah/2); ctx.moveTo(x-3,y+ah/2); ctx.lineTo(x+3,y+ah/2); ctx.stroke();
}

function draw(canvas){
  const [ctx, W, H] = Lab.ctx2d(canvas);
  T=pal(); ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  drawGrid(ctx,W,H);
  geom(W,H);

  // ── suolo ──
  ctx.strokeStyle=T.ground; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(0,G.yGround); ctx.lineTo(W,G.yGround); ctx.stroke();
  ctx.fillStyle=rgba([120,140,165],0.08); ctx.fillRect(0,G.yGround,W,H-G.yGround);

  // ── acqua nel recipiente ──
  const lv=clamp(waterLevel,0,Hcont);
  ctx.beginPath();
  ctx.moveTo(xL(0),G.yGround); ctx.lineTo(xR(0),G.yGround);
  ctx.lineTo(xR(lv),yOf(lv)); ctx.lineTo(xL(lv),yOf(lv)); ctx.closePath();
  const grd=ctx.createLinearGradient(0,yOf(lv),0,G.yGround);
  grd.addColorStop(0,rgba(T.water,0.55)); grd.addColorStop(1,rgba([40,95,180],0.7));
  ctx.fillStyle=grd; ctx.fill();
  // pelo libero
  ctx.strokeStyle=rgba(T.water,0.95); ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(xL(lv),yOf(lv)); ctx.lineTo(xR(lv),yOf(lv)); ctx.stroke();

  // ── pareti del recipiente ──
  ctx.strokeStyle=T.glass; ctx.lineWidth=2.5; ctx.lineJoin='round';
  ctx.beginPath();
  ctx.moveTo(xL(Hcont),yOf(Hcont)); ctx.lineTo(xL(0),G.yGround);
  ctx.lineTo(xR(0),G.yGround); ctx.lineTo(xR(Hcont),yOf(Hcont));
  ctx.stroke();

  // ── scala graduata (altezze) ──
  drawRuler(ctx);

  // ── fori + getti ──
  drawHole(ctx,P.holeA,T.jetA);
  if(P.compare) drawHole(ctx,P.holeB,T.jetB);
  const rA=drawJet(ctx,P.holeA,T.jetA);
  let rB=0; if(P.compare) rB=drawJet(ctx,P.holeB,T.jetB);

  // etichette fori
  ctx.font='bold 11px "Space Mono",monospace'; ctx.textAlign='left';
  ctx.fillStyle=rgb(T.jetA); ctx.fillText('A', xR(P.holeA.y)+6, yOf(P.holeA.y)-6);
  if(P.compare){ ctx.fillStyle=rgb(T.jetB); ctx.fillText('B', xR(P.holeB.y)+6, yOf(P.holeB.y)-6); }

  // ── intestazione ──
  ctx.textAlign='left'; ctx.fillStyle=T.accent; ctx.font='bold 13px "Space Mono",monospace';
  ctx.fillText('Teorema di Torricelli:  v = √(2·g·h)', 14, 20);
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace';
  ctx.fillText('svuotamento:  A(h)·dh/dt = −Σ aᵢ·√(2g(h−yᵢ))', 14, 35);
  void rA; void rB;
}

function drawRuler(ctx){
  const x=G.mL-8, y0=G.yGround, pxM=G.pxPerM;
  ctx.strokeStyle=T.ruler; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(x,y0); ctx.lineTo(x,yOf(Hcont)); ctx.stroke();
  ctx.font='8px "Space Mono",monospace';
  for(let u=0;u<=Hcont+1e-6;u+=0.1){ const yy=y0-u*pxM;
    ctx.strokeStyle=rgba([120,170,220],0.6); ctx.lineWidth=1;
    const big=(Math.round(u*10)%2===0);
    ctx.beginPath(); ctx.moveTo(x,yy); ctx.lineTo(x-(big?9:5),yy); ctx.stroke();
    if(big){ ctx.fillStyle=T.gText; ctx.textAlign='right'; ctx.fillText(Math.round(u*100), x-11, yy+3); }
  }
  ctx.fillStyle=T.sub; ctx.textAlign='center'; ctx.fillText('cm', x-14, yOf(Hcont)-8);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
function drawGraphs(){
  const lv=clamp(waterLevel,0.001,Hcont);
  // 1: velocità d'efflusso v = √(2·g·h) in funzione della profondità del foro sotto il pelo libero
  let g=Lab.panel(gCanvas[0],{ title:'Velocità d’efflusso v = √(2gh) (m/s)', xr:[0,Hcont*100], yr:[0,Lab.niceMax(Math.sqrt(2*GR*Hcont))], xLabel:'profondità del foro h (cm)' });
  if(g){ const [ctx,f]=g;
    Lab.plot(ctx,f,h=>Math.sqrt(2*GR*h/100),[0,Hcont*100],T.accent,2);
    Lab.dot(ctx,f,Math.max(0,waterLevel-P.holeA.y)*100,vEff(P.holeA),rgb(T.jetA),4.5);
    if(P.compare) Lab.dot(ctx,f,Math.max(0,waterLevel-P.holeB.y)*100,vEff(P.holeB),rgb(T.jetB),4.5); }
  // 2: gittata 2·√(y·(L−y)) in funzione dell'altezza del foro: massima a metà livello
  g=Lab.panel(gCanvas[1],{ title:'Gittata (cm) in funzione dell’altezza del foro', xr:[0,Hcont*100], yr:[0,Lab.niceMax(Hcont*100)], xLabel:'altezza del foro dal fondo (cm)' });
  if(g){ const [ctx,f]=g;
    ctx.save(); ctx.setLineDash([3,3]); ctx.strokeStyle=f.C.text; ctx.beginPath(); ctx.moveTo(f.X(lv*50),f.T); ctx.lineTo(f.X(lv*50),f.B); ctx.stroke(); ctx.restore();
    Lab.plot(ctx,f,y=>{ const yy=y/100; return yy>lv?NaN:2*Math.sqrt(Math.max(0,yy*(lv-yy)))*100; },[0,Hcont*100],T.accent,2);
    Lab.dot(ctx,f,P.holeA.y*100,rangeM(P.holeA)*100,rgb(T.jetA),4.5);
    if(P.compare) Lab.dot(ctx,f,P.holeB.y*100,rangeM(P.holeB)*100,rgb(T.jetB),4.5);
    Lab.legend(ctx,f.L+8,f.T+8,[[f.C.text,'massimo a metà livello',[3,3]]]); }
  // 3: svuotamento: il livello scende sempre più lentamente (dh/dt ∝ √h)
  g=Lab.panel(gCanvas[2],{ title:'Livello dell’acqua (cm)', xr:[0,Math.max(5,hist.length*0.05)], yr:[0,Hcont*100], xLabel:'t (s)' });
  if(g){ const [ctx,f]=g; Lab.plotPts(ctx,f,hist.map((l,i)=>[i*0.05,l*100]),rgb(T.water),2); }
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
function reControls(){ setTimeout(buildControls,0); }
function buildControls(){
  const cont=document.getElementById('controls'); cont.innerHTML='';

  const secR=Lab.Section('Recipiente'); cont.appendChild(secR.el);
  secR.add(Lab.RadioGroup({ label:'Forma della sezione', value:P.shape,
    options:Object.keys(SHAPES).map(k=>({value:k,label:SHAPES[k].name})), onChange(v){P.shape=v;} }));
  secR.add(Lab.Slider({ label:"Quantità d'acqua", min:0.10, max:0.98, step:0.01, value:P.level, unit:' m',
    onChange(v){ P.level=v; waterLevel=v; } }));
  secR.add(Lab.Toggle({ label:'Rifornimento continuo', value:P.refill, onChange(v){ P.refill=v; if(v) waterLevel=P.level; } }));

  const secA=Lab.Section('Foro A'); cont.appendChild(secA.el);
  secA.add(Lab.Slider({ label:'Posizione (altezza dal fondo)', min:0.02, max:0.95, step:0.01, value:P.holeA.y, unit:' m', onChange(v){P.holeA.y=v;} }));
  secA.add(Lab.Slider({ label:'Apertura', min:0.005, max:0.06, step:0.005, value:P.holeA.a, unit:' m', onChange(v){P.holeA.a=v;} }));

  const secC=Lab.Section('Confronto'); cont.appendChild(secC.el);
  secC.add(Lab.Toggle({ label:'Secondo foro (B)', value:P.compare, onChange(v){ P.compare=v; reControls(); } }));
  if(P.compare){
    const secB=Lab.Section('Foro B'); cont.appendChild(secB.el);
    secB.add(Lab.Slider({ label:'Posizione (altezza dal fondo)', min:0.02, max:0.95, step:0.01, value:P.holeB.y, unit:' m', onChange(v){P.holeB.y=v;} }));
    secB.add(Lab.Slider({ label:'Apertura', min:0.005, max:0.06, step:0.005, value:P.holeB.a, unit:' m', onChange(v){P.holeB.a=v;} }));
  }
}

function initGraphs(){
  // riga di grafici standard (Lab.graphPanels); i titoli sono disegnati dentro i grafici
  gCanvas = Lab.graphPanels(document.getElementById('graphArea'), 3);
  gCtx = gCanvas.map(c => c.getContext('2d'));
  gTitle = gCanvas.map(() => ({ textContent: '' }));
}

// ═══ Init ═════════════════════════════════════════════════════════════════════
function init(){
  Lab.initTheme();
  buildControls(); initGraphs();
  const simCanvas=document.getElementById('simCanvas');
  readout=new Lab.Readout(document.getElementById('readout'),[
    {key:'liv',label:'Livello acqua'},
    {key:'Q',  label:'Portata Q (per prof.)'},
    {key:'vA', label:'Foro A — v efflusso'},
    {key:'rA', label:'Foro A — gittata'},
    {key:'vB', label:'Foro B — v efflusso'},
    {key:'rB', label:'Foro B — gittata'},
  ]);
  const btnPlay=document.getElementById('btnPlay');
  function syncPlay(){ btnPlay.textContent = P.paused ? '▶  AVVIA' : '⏸  PAUSA'; }
  syncPlay();
  btnPlay.addEventListener('click',()=>{ P.paused=!P.paused; syncPlay(); });
  document.getElementById('btnReset').addEventListener('click',()=>{
    P.shape='rettangolo'; P.level=0.85; P.refill=false; P.compare=false; P.paused=false;
    P.holeA={y:0.25,a:0.005}; P.holeB={y:0.60,a:0.005};
    waterLevel=P.level; hist.length=0; buildControls(); syncPlay();
  });

  function resize(){
    const area=document.querySelector('.lab-canvas-area'); if(!area)return;
    const ar=area.getBoundingClientRect();
    const rb=document.getElementById('readout').getBoundingClientRect();
    const ga=document.getElementById('graphArea'); const gaH=ga?ga.offsetHeight:0;
    const h=Math.max(240,Math.floor(ar.height-rb.height-gaH-4));
    Lab.hidpi(simCanvas, Math.floor(ar.width), h);
    geom(simCanvas.width/(simCanvas._dpr||1),simCanvas.height/(simCanvas._dpr||1));
    Lab.fitPanels(gCanvas);
  }
  resize();
  new ResizeObserver(resize).observe(document.querySelector('.lab-canvas-area'));
  window.addEventListener('load', resize);
  if(document.fonts&&document.fonts.ready) document.fonts.ready.then(resize);

  last=performance.now();
  function frame(now){
    let dt=(now-last)/1000; last=now;
    if(!Number.isFinite(dt)||dt<0) dt=0; dt=Math.min(dt,0.05);
    tAnim+=dt;
    try{
      step(dt); draw(simCanvas); drawGraphs();
      readout.set('liv', fmtM(waterLevel));
      readout.set('Q', Lab.fmt((flowQ()*1000),1)+' L/(s·m)');
      readout.set('vA', Lab.fmt(vEff(P.holeA),2)+' m/s');
      readout.set('rA', fmtM(rangeM(P.holeA)));
      readout.set('vB', P.compare? Lab.fmt(vEff(P.holeB),2)+' m/s' : '—');
      readout.set('rB', P.compare? fmtM(rangeM(P.holeB)) : '—');
    }catch(err){ console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
