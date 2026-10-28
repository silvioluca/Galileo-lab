'use strict';

// ═══ Stato ════════════════════════════════════════════════════════════════════
const FLUIDS = {
  acqua:    { name:'Acqua',        rho:1000,  col:[70,140,235] },
  salata:   { name:'Acqua salata', rho:1030,  col:[60,165,205] },
  alcol:    { name:'Alcol',        rho:790,   col:[150,170,230] },
  olio:     { name:'Olio',         rho:920,   col:[210,180,70] },
  glicerina:{ name:'Glicerina',    rho:1260,  col:[200,150,90] },
  mercurio: { name:'Mercurio',     rho:13600, col:[180,186,196] },
};
const SHAPES = { cubo:'Cubo', sfera:'Sfera', iceberg:'Iceberg', pallone:'Pallone elastico' };
const Gacc=9.81, P0=101325, DEXAG=12;        // P0 atmosferica; DEXAG esagera l'effetto pressione

const P = {
  shape:'cubo',
  rhoO:600,            // densità oggetto (kg/m³) — per il pallone è quella in superficie
  size:9,              // dimensione caratteristica (cm)
  fluid:'acqua',
  paused:false,
};

let cubeYc=0, cubeVy=0, dragging=false, started=true;   // simulazione sempre attiva
let tAnim=0, last=0, tHist=0, hist=[], M=null;
let gCanvas=[null,null,null], gCtx=[null,null,null], gTitle=[null,null,null];
let readout;

// ── poligoni normalizzati (centrati, ~[-0.5,0.5], y verso il basso) ──
function circlePts(n){ const a=[]; for(let i=0;i<n;i++){ const t=i/n*Math.PI*2; a.push({x:0.5*Math.cos(t), y:0.5*Math.sin(t)}); } return a; }
function ellipsePts(rx,ry,n){ const a=[]; for(let i=0;i<n;i++){ const t=i/n*Math.PI*2; a.push({x:rx*Math.sin(t), y:-ry*Math.cos(t)}); } return a; }
const ICE=[
  {x: 0.05,y:-0.50},   // vetta
  {x: 0.30,y:-0.16},   // versante destro (lungo, dritto)
  {x: 0.50,y: 0.02},   // spalla destra alla linea d'acqua
  {x: 0.52,y: 0.22},{x: 0.40,y: 0.46},   // corpo sommerso destro (angoloso)
  {x: 0.16,y: 0.58},{x:-0.04,y: 0.74},
  {x:-0.20,y: 0.68},   // fondo leggermente appuntito
  {x:-0.30,y: 0.56},{x:-0.45,y: 0.18},   // max larghezza sinistra
  {x:-0.36,y: 0.00},
  {x:-0.32,y:-0.05},{x:-0.30,y:-0.13},   // spalla sinistra a gradini
  {x:-0.26,y:-0.17},{x:-0.22,y:-0.26},
];
const SHAPE_NORM = {
  cubo:[{x:-0.5,y:-0.5},{x:0.5,y:-0.5},{x:0.5,y:0.5},{x:-0.5,y:0.5}],
  sfera:circlePts(48),
  iceberg:ICE,
  pallone:circlePts(44),
};
function polyArea(pts){ let a=0; for(let i=0;i<pts.length;i++){ const j=(i+1)%pts.length; a+=pts[i].x*pts[j].y-pts[j].x*pts[i].y; } return Math.abs(a)/2; }
const NORMAREA={}; for(const k in SHAPE_NORM) NORMAREA[k]=polyArea(SHAPE_NORM[k]);

// ═══ Palette ══════════════════════════════════════════════════════════════════
function dk(){ return document.documentElement.dataset.theme !== 'light'; }
function pal(){
  const d=dk();
  return {
    bg:    d?'#06090f':'#e7edf4',
    txt:   d?'rgba(225,238,250,0.96)':'rgba(20,40,70,0.95)',
    sub:   d?'rgba(165,195,220,0.82)':'rgba(60,90,125,0.9)',
    accent:d?'#00d4ff':'#0a78b0',
    glass: d?'rgba(200,218,238,0.7)':'rgba(80,110,150,0.66)',
    press: [230,70,60],
    buoy:  d?[0,205,255]:[0,150,205],
    grid:  d?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.04)',
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
function rhoF(){ return FLUIDS[P.fluid].rho; }
function sizeM(){ return P.size/100; }
// Il modello è una sezione piana: le aree vanno moltiplicate per uno spessore per avere volumi veri.
// Cubo: spessore = lato. Sfera e pallone: V = (4/3)πr³ = area·(2/3)·diametro. Iceberg: lastra di 1 m.
function depthM(){ return P.shape==='cubo' ? sizeM() : P.shape==='iceberg' ? 1 : sizeM()*2/3; }
function objCol(){ if(P.shape==='iceberg') return [205,225,238]; if(P.shape==='pallone') return [240,140,40];
  return P.rhoO<1000 ? [165,115,62] : P.rhoO<5000 ? [150,160,175] : P.rhoO<10000 ? [120,135,155] : [205,170,65]; }
function fmtN(n){ return n<10 ? Lab.fmt(n,2)+' N' : Lab.fmt(n,1)+' N'; }
function eqFrac(){ return P.rhoO/rhoF(); }                  // frazione (di volume) immersa all'equilibrio (rigidi)

// fattore di scala lineare del pallone: in profondità la pressione lo comprime (Boyle, area ∝ 1/P)
function balloonScale(){
  if(P.shape!=='pallone') return 1;
  const d=Math.max(0,(cubeYc-G.fluidTopY)/G.pxPerM);        // profondità del centro (m)
  return Math.sqrt(P0/(P0 + DEXAG*rhoF()*Gacc*d));
}
function clipBelow(pts,Yw){ const out=[], n=pts.length;
  for(let i=0;i<n;i++){ const A=pts[i],B=pts[(i+1)%n], inA=A.y>=Yw, inB=B.y>=Yw;
    if(inA) out.push(A);
    if(inA!==inB){ const t=(Yw-A.y)/(B.y-A.y); out.push({x:A.x+(B.x-A.x)*t, y:Yw}); } }
  return out;
}
function shapeMetrics(){
  const S=sizeM()*G.pxPerM, sc=balloonScale();
  const pts=SHAPE_NORM[P.shape].map(p=>({x:G.cubeX+p.x*S*sc, y:cubeYc+p.y*S*sc}));
  let top=1e9,bot=-1e9; for(const p of pts){ if(p.y<top)top=p.y; if(p.y>bot)bot=p.y; }
  const A0=NORMAREA[P.shape]*S*S;             // area di riferimento (non compressa)
  return {pts,top,bot,sc, Acur:A0*sc*sc, Asub:polyArea(clipBelow(pts,G.fluidTopY)), A0};
}

// ═══ Geometria ════════════════════════════════════════════════════════════════
let G={};
function geom(W,H){
  const mL=46, mR=20, mT=66, mB=42;
  const tankW=clamp((W-mL-mR)*0.62, 170, 560);
  const tankX0=(W-tankW)/2;                          // recipiente centrato orizzontalmente
  const tankBottomY=H-mB, tankH=clamp(H-mT-mB, 200, 560), tankTopY=tankBottomY-tankH;
  const fluidTopY=tankTopY + tankH*0.22;
  const pxPerM=tankH/1.0;
  G={W,H,tankX0, tankX1:tankX0+tankW, cubeX:W/2, tankTopY, tankBottomY, fluidTopY, pxPerM};
}

// ═══ Step ═════════════════════════════════════════════════════════════════════
function step(dt){
  if(!G.pxPerM) return;
  if(P.paused || dragging || !started) return;
  const m=shapeMetrics();
  const aDown=Gacc*(1 - (rhoF()*m.Asub)/(P.rhoO*m.A0));     // a = g(1 − ρf·A_imm /(ρo·A0))
  cubeVy += aDown*G.pxPerM*dt;
  const f = m.Asub/Math.max(m.Acur,1e-6);
  cubeVy -= cubeVy*clamp((f>0.001?7.0:0.7)*dt,0,1);
  cubeVy = clamp(cubeVy, -2200, 2200);
  cubeYc += cubeVy*dt;
  const topOff=cubeYc-m.top, botOff=m.bot-cubeYc;
  if(cubeYc < G.tankTopY-topOff+6){ cubeYc=G.tankTopY-topOff+6; cubeVy=0; }
  if(cubeYc > G.tankBottomY-botOff){ cubeYc=G.tankBottomY-botOff; cubeVy=0; }
}

// ═══ Rendering ════════════════════════════════════════════════════════════════
function drawGrid(ctx,W,H){ ctx.strokeStyle=T.grid; ctx.lineWidth=1;
  for(let x=0;x<=W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=0;y<=H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();} }
function arrow(ctx,x1,y1,x2,y2,col,lw,lbl){
  ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=lw||2.5; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  const a=Math.atan2(y2-y1,x2-x1), s=6+(lw||2.5);
  ctx.beginPath(); ctx.moveTo(x2,y2); ctx.lineTo(x2-s*Math.cos(a-0.42),y2-s*Math.sin(a-0.42)); ctx.lineTo(x2-s*Math.cos(a+0.42),y2-s*Math.sin(a+0.42)); ctx.closePath(); ctx.fill();
  if(lbl){ ctx.font='bold 11px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText(lbl,x2,y2+(y2>y1?13:-7)); }
}
function shapePath(ctx,pts){ ctx.beginPath(); pts.forEach((p,i)=> i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)); ctx.closePath(); }
function smoothPath(ctx,pts){     // curva chiusa morbida (per contorni regolari)
  const n=pts.length; ctx.beginPath();
  let mx=(pts[n-1].x+pts[0].x)/2, my=(pts[n-1].y+pts[0].y)/2; ctx.moveTo(mx,my);
  for(let i=0;i<n;i++){ const p=pts[i], q=pts[(i+1)%n]; ctx.quadraticCurveTo(p.x,p.y,(p.x+q.x)/2,(p.y+q.y)/2); }
  ctx.closePath();
}
function drawPath(ctx,pts){ if(P.shape==='cubo') shapePath(ctx,pts); else smoothPath(ctx,pts); }

function drawIceberg(ctx){
  const a=M.pts, n=a.length, Yw=G.fluidTopY;
  // corpo azzurro (parte sommersa)
  shapePath(ctx,a); ctx.fillStyle='rgb(176,214,229)'; ctx.fill();
  ctx.save(); shapePath(ctx,a); ctx.clip();
  // sopra il pelo libero: bianco
  ctx.fillStyle='rgb(246,251,253)';
  ctx.fillRect(G.tankX0-8, M.top-4, (G.tankX1-G.tankX0)+16, Math.max(0,Yw-(M.top-4)));
  // facce azzurre sul picco
  ctx.fillStyle='rgba(150,200,222,0.9)';
  ctx.beginPath(); ctx.moveTo(a[0].x,a[0].y); ctx.lineTo(a[1].x,a[1].y); ctx.lineTo((a[0].x+a[1].x)/2,(a[1].y+Yw)/2); ctx.closePath(); ctx.fill();
  for(const i of [n-2,n-4,n-6]){ const p=a[i],q=a[i-1]; if(p&&q){ ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(q.x,q.y); ctx.lineTo(p.x+9,p.y+15); ctx.closePath(); ctx.fill(); } }
  // creste (ridge) dal picco
  ctx.strokeStyle='rgba(70,110,140,0.55)'; ctx.lineWidth=1.3; ctx.lineCap='round'; ctx.beginPath();
  ctx.moveTo(a[0].x,a[0].y); ctx.lineTo(a[0].x-2,Yw);
  ctx.moveTo(a[0].x,a[0].y); ctx.lineTo((a[0].x+a[1].x)/2,(a[0].y+Yw)/2);
  ctx.moveTo(a[0].x,a[0].y); ctx.lineTo(a[n-3].x, Math.min(Yw,a[n-3].y));
  ctx.stroke();
  // tratteggio sulle facce sommerse
  ctx.strokeStyle='rgba(105,150,175,0.35)'; ctx.lineWidth=1;
  for(let k=0;k<5;k++){ const yy=Yw+(M.bot-Yw)*(0.18+0.16*k); ctx.beginPath(); ctx.moveTo(G.cubeX-34+k*5,yy); ctx.lineTo(G.cubeX+30+k*5,yy-7); ctx.stroke(); }
  ctx.restore();
  // contorno netto
  ctx.lineJoin='round'; ctx.lineWidth=2.2; ctx.strokeStyle='rgba(55,70,80,0.92)';
  shapePath(ctx,a); ctx.stroke();
}

function draw(canvas){
  const [ctx, W, H] = Lab.ctx2d(canvas);
  T=pal(); ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  drawGrid(ctx,W,H);
  geom(W,H);
  if(!M) M=shapeMetrics();
  const fl=FLUIDS[P.fluid];

  // ── recipiente + fluido ──
  ctx.fillStyle=rgba(fl.col,0.42); ctx.fillRect(G.tankX0, G.fluidTopY, G.tankX1-G.tankX0, G.tankBottomY-G.fluidTopY);
  ctx.strokeStyle=T.glass; ctx.lineWidth=2.5; ctx.beginPath();
  ctx.moveTo(G.tankX0,G.tankTopY); ctx.lineTo(G.tankX0,G.tankBottomY); ctx.lineTo(G.tankX1,G.tankBottomY); ctx.lineTo(G.tankX1,G.tankTopY); ctx.stroke();
  ctx.strokeStyle=rgba(fl.col,0.95); ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(G.tankX0,G.fluidTopY); ctx.lineTo(G.tankX1,G.fluidTopY); ctx.stroke();
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace'; ctx.textAlign='left';
  ctx.fillText(fl.name+'  ρ='+fl.rho+' kg/m³', G.tankX0+4, G.fluidTopY-6);

  const oc=objCol(), cx=G.cubeX;

  // ── oggetto ──
  if(P.shape==='iceberg'){
    drawIceberg(ctx);
  } else {
    drawPath(ctx,M.pts); ctx.fillStyle=rgb(oc); ctx.fill();
    ctx.save(); drawPath(ctx,M.pts); ctx.clip();
    ctx.fillStyle=rgba([oc[0]*0.55|0,oc[1]*0.55|0,oc[2]*0.55|0],0.62);
    ctx.fillRect(G.tankX0-4,G.fluidTopY,(G.tankX1-G.tankX0)+8,G.tankBottomY-G.fluidTopY);
    ctx.restore();
    ctx.lineJoin='round'; ctx.lineWidth=1.7;
    if(P.shape==='pallone'){ ctx.setLineDash([6,5]); ctx.strokeStyle=rgb([200,110,30]); }
    else ctx.strokeStyle='rgba(0,0,0,0.35)';
    drawPath(ctx,M.pts); ctx.stroke(); ctx.setLineDash([]);
  }

  // ── frecce di forza (proporzionali) ──
  const realA0=NORMAREA[P.shape]*sizeM()*sizeM(), mass=P.rhoO*realA0, W_=mass*Gacc;
  const Fb=rhoF()*Gacc*M.Asub/(G.pxPerM*G.pxPerM);
  const maxF=Math.max(W_,Fb,1e-6), maxLen=clamp((M.bot-M.top)*1.1,40,120);
  const lW=W_/maxF*maxLen, lB=Fb/maxF*maxLen;
  arrow(ctx, cx-10, cubeYc, cx-10, cubeYc+lW, rgb(T.press), 3, 'P');
  if(Fb>1e-4) arrow(ctx, cx+10, cubeYc, cx+10, cubeYc-lB, rgb(T.buoy), 3, 'S');

  // ── intestazione ──
  ctx.textAlign='left'; ctx.fillStyle=T.accent; ctx.font='bold 14px "Space Mono",monospace';
  ctx.fillText('Principio di Archimede:  S = ρ_fluido · g · V_immerso', 14, 22);
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace';
  let note = P.rhoO<rhoF()-1 ? 'galleggia (immerso il '+Math.min(100,eqFrac()*100).toFixed(0)+'%)' : P.rhoO>rhoF()+1 ? 'affonda (ρ_ogg > ρ_fluido)' : 'equilibrio indifferente';
  if(P.shape==='pallone') note += '  ·  volume = '+(M.sc*M.sc*100).toFixed(0)+'% (compresso dalla pressione)';
  ctx.fillText('ρ_oggetto = '+P.rhoO+' kg/m³  ·  '+note, 14, 40);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
function drawGraphs(){
  const realA0=NORMAREA[P.shape]*sizeM()*sizeM()*depthM(), W_=P.rhoO*realA0*Gacc;   // realA0: volume (m³)
  const fbFull=rhoF()*Gacc*realA0*(M?M.Acur/M.A0:1);     // spinta a piena immersione (volume corrente)
  const fNow=M?M.Asub/Math.max(M.Acur,1e-6):0;
  // 1: la spinta cresce con la parte immersa; si galleggia dove eguaglia il peso
  const ym=Lab.niceMax(Math.max(fbFull,W_)*1.1);
  let g=Lab.panel(gCanvas[0],{ title:'Spinta e peso (N)', xr:[0,100], yr:[0,ym], xLabel:'frazione immersa (%)', yFmt:v=>Lab.sci(v,2) });
  if(g){ const [ctx,f]=g;
    Lab.plot(ctx,f,x=>fbFull*x/100,[0,100],rgb(T.buoy),2);
    Lab.plot(ctx,f,()=>W_,[0,100],rgb(T.press),1.6,[4,3]);
    Lab.dot(ctx,f,fNow*100,fbFull*fNow,T.accent,4.5);
    Lab.legend(ctx,f.L+8,f.T+8,[[rgb(T.buoy),'spinta S = ρ_f·g·V_imm'],[rgb(T.press),'peso P',[4,3]]]); }
  // 2: densità dell'oggetto e del fluido
  const vals=[P.rhoO,rhoF()], dm=Lab.niceMax(Math.max(...vals)*1.15);
  g=Lab.panel(gCanvas[1],{ title:'Densità (kg/m³)', xr:[0,2], xStep:9, xFmt:()=> '', yr:[0,dm] });
  if(g){ const [ctx,f]=g, cols=[rgb(objCol()),rgb(FLUIDS[P.fluid].col)], labs=['oggetto',FLUIDS[P.fluid].name];
    vals.forEach((v,i)=>{ const cx=f.X(i+0.5), bw=(f.R-f.L)*0.25, y=f.Y(v);
      ctx.fillStyle=cols[i]; ctx.fillRect(cx-bw/2,y,bw,f.B-y);
      ctx.font='9.5px "Space Mono",monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillStyle=f.C.title; ctx.fillText(Lab.fmt(v,0),cx,y-8);
      ctx.fillStyle=f.C.text; ctx.font='9.5px "DM Sans",sans-serif'; ctx.fillText(labs[i],cx,f.B+10); }); }
  // 3: frazione immersa nel tempo, con il valore d'equilibrio ρ_oggetto/ρ_fluido
  g=Lab.panel(gCanvas[2],{ title:'Frazione immersa (%)', xr:[0,Math.max(5,hist.length*0.05)], yr:[0,100], yStep:25, xLabel:'t (s)' });
  if(g){ const [ctx,f]=g;
    if(eqFrac()<=1){ const fe=clamp(eqFrac(),0,1)*100; ctx.save(); ctx.setLineDash([3,3]); ctx.strokeStyle=rgb(T.press); ctx.beginPath(); ctx.moveTo(f.L,f.Y(fe)); ctx.lineTo(f.R,f.Y(fe)); ctx.stroke(); ctx.restore(); }
    Lab.plotPts(ctx,f,hist.map((v,i)=>[i*0.05,v*100]),T.accent,2);
    if(eqFrac()<=1) Lab.legend(ctx,f.L+8,f.T+8,[[rgb(T.press),'equilibrio ρ_o/ρ_f',[3,3]]]); }
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
function reControls(){ setTimeout(buildControls,0); }
function buildControls(){
  const cont=document.getElementById('controls'); cont.innerHTML='';
  const secS=Lab.Section('Oggetto'); cont.appendChild(secS.el);
  secS.add(Lab.RadioGroup({ label:'Forma', value:P.shape,
    options:Object.keys(SHAPES).map(k=>({value:k,label:SHAPES[k]})),
    onChange(v){ P.shape=v; if(v==='iceberg'){ P.rhoO=917; P.size=52; } else if(P.size>20){ P.size=9; } reControls(); } }));
  secS.add(Lab.Slider({ label:'Densità'+(P.shape==='pallone'?' (in superficie)':''), min:100, max:14000, step:10, value:P.rhoO, unit:' kg/m³', onChange(v){P.rhoO=v;} }));
  if(P.shape==='iceberg'){
    const na=NORMAREA.iceberg, vL=s=>na*(s/100)*(s/100)*1000, sFromV=V=>Math.sqrt((V/1000)/na)*100;   // volume in litri (spessore 1 m)
    secS.add(Lab.Slider({ label:'Volume', min:Math.round(vL(25)), max:Math.round(vL(72)), step:1, value:Math.round(vL(P.size)), unit:' L', onChange(v){ P.size=sFromV(v); } }));
  } else {
    secS.add(Lab.Slider({ label:'Dimensione', min:4, max:14, step:0.5, value:P.size, unit:' cm', onChange(v){P.size=v;} }));
  }

  const secF=Lab.Section('Fluido'); cont.appendChild(secF.el);
  secF.add(Lab.RadioGroup({ label:'Tipo', value:P.fluid,
    options:Object.keys(FLUIDS).map(k=>({value:k,label:FLUIDS[k].name,hint:FLUIDS[k].rho+' kg/m³'})), onChange(v){P.fluid=v;} }));
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
    {key:'peso', label:'Peso P'},
    {key:'sp',   label:'Spinta S'},
    {key:'frac', label:'Frazione immersa'},
    {key:'vol',  label:'Volume oggetto'},
    {key:'st',   label:'Stato'},
  ]);

  function dropStart(){ geom(simCanvas.width/(simCanvas._dpr||1),simCanvas.height/(simCanvas._dpr||1)); cubeYc=G.tankTopY+8; cubeVy=0; started=true; hist.length=0; }
  document.getElementById('btnDrop').addEventListener('click', dropStart);
  document.getElementById('btnReset').addEventListener('click',()=>{
    P.shape='cubo'; P.rhoO=600; P.size=9; P.fluid='acqua'; P.paused=false;
    started=true; cubeVy=0; hist.length=0; buildControls();
    geom(simCanvas.width/(simCanvas._dpr||1),simCanvas.height/(simCanvas._dpr||1)); cubeYc=G.fluidTopY;
  });

  function evtY(e){ const r=simCanvas.getBoundingClientRect(); return (e.clientY-r.top); }
  function evtX(e){ const r=simCanvas.getBoundingClientRect(); return (e.clientX-r.left); }
  simCanvas.addEventListener('pointerdown',e=>{ const S=sizeM()*G.pxPerM;
    if(Math.abs(evtX(e)-G.cubeX)<S&&Math.abs(evtY(e)-cubeYc)<S){ dragging=true; started=true; try{simCanvas.setPointerCapture(e.pointerId);}catch(_){} } });
  simCanvas.addEventListener('pointermove',e=>{ if(!dragging)return; cubeYc=clamp(evtY(e), G.tankTopY+4, G.tankBottomY-4); cubeVy=0; });
  simCanvas.addEventListener('pointerup',()=>{ dragging=false; });

  function resize(){
    const area=document.querySelector('.lab-canvas-area'); if(!area)return;
    const ar=area.getBoundingClientRect();
    const rb=document.getElementById('readout').getBoundingClientRect();
    const ga=document.getElementById('graphArea'); const gaH=ga?ga.offsetHeight:0;
    const h=Math.max(240,Math.floor(ar.height-rb.height-gaH-4));
    Lab.hidpi(simCanvas, Math.floor(ar.width), h);
    geom(simCanvas.width/(simCanvas._dpr||1),simCanvas.height/(simCanvas._dpr||1));
    if(cubeYc===0) cubeYc=G.fluidTopY;
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
    if(!P.paused) tAnim+=dt;
    try{
      step(dt);
      M=shapeMetrics();
      const f=M.Asub/Math.max(M.Acur,1e-6);
      tHist+=dt; if(started && tHist>=0.05){ tHist=0; hist.push(f); if(hist.length>240)hist.shift(); }
      draw(simCanvas); drawGraphs();
      const realA0=NORMAREA[P.shape]*sizeM()*sizeM(), W_=P.rhoO*realA0*depthM()*Gacc;
      const Fb=rhoF()*Gacc*M.Asub/(G.pxPerM*G.pxPerM)*depthM();
      readout.set('peso', fmtN(W_));
      readout.set('sp', fmtN(Fb));
      readout.set('frac', Lab.fmt((f*100),0)+'%');
      readout.set('vol', Lab.fmt((M.sc*M.sc*100),0)+'%');
      readout.set('st', P.rhoO<rhoF()-1?'galleggia':P.rhoO>rhoF()+1?'affonda':'equilibrio');
    }catch(err){ console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
