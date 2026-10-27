'use strict';

// ═══ Stato ════════════════════════════════════════════════════════════════════
const LIQ = {
  acqua:    {name:'Acqua',     rho:1000,  col:[70,140,235]},
  olio:     {name:'Olio',      rho:920,   col:[210,180,70]},
  alcol:    {name:'Alcol',     rho:790,   col:[150,205,230]},
  glicerina:{name:'Glicerina', rho:1260,  col:[200,150,90]},
  mercurio: {name:'Mercurio',  rho:13600, col:[180,186,196]},
};
const P = {
  mode:'vessels',   // 'vessels' | 'utube' | 'capillary'
  amount:50,        // quantità di liquido (%)
  liq:'acqua',
  liqA:'acqua', liqB:'olio',
  rho:1000, gamma:0.073, theta:10,   // capillarità: densità, tensione superficiale, angolo di contatto
  paused:false,
};
const TUBES=[1.5,0.9,0.5,0.25];      // raggi dei capillari (mm)
const Gacc=9.81, HMAX_M=0.40;   // altezza massima rappresentata (m)

let tAnim=0, last=0, fillH=0;   // livello corrente (px) per animazione
let gCanvas=[null,null,null], gCtx=[null,null,null], gTitle=[null,null,null];
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
    glass: d?'rgba(190,210,235,0.7)':'rgba(60,90,130,0.7)',
    glassF:d?'rgba(150,180,215,0.06)':'rgba(120,150,195,0.10)',
    level: [255,205,70],
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

// ═══ Geometria ════════════════════════════════════════════════════════════════
let G={};
function geom(W,H){
  const x0=W*0.10, x1=W*0.90, yTop=H*0.16, yBase=H*0.74, chH=H*0.06;
  G={W,H,x0,x1,yTop,yBase,chH, Htot:yBase-yTop, cy:(yTop+yBase)/2};
}
// forme dei vasi: semilarghezza (px) a quota frazionaria t (0 base .. 1 cima)
const VESSELS=[
  {name:'cilindro largo', hw:t=>36},
  {name:'capillare',      hw:t=>13},
  {name:'cono',           hw:t=>12+30*t},
  {name:'imbuto',         hw:t=>38-26*t},
  {name:'colonna',        hw:t=>22},
];
function vesselCx(i){ return G.x0 + (G.x1-G.x0)*(i+0.5)/VESSELS.length; }
function vesselVol(i,hpx){ // "volume" (area) del vaso i fino al livello hpx (px)
  let s=0, N=60; for(let k=0;k<N;k++){ const y=hpx*(k+0.5)/N; s+=2*VESSELS[i].hw(y/G.Htot); } return s*hpx/N;
}
function totalVol(hpx){ let v=0; for(let i=0;i<VESSELS.length;i++) v+=vesselVol(i,hpx); return v; }
function levelFromAmount(){
  const Vmax=totalVol(G.Htot), V=P.amount/100*Vmax;
  let lo=0, hi=G.Htot; for(let it=0;it<26;it++){ const m=(lo+hi)/2; if(totalVol(m)<V) lo=m; else hi=m; }
  return (lo+hi)/2;
}

// ═══ Step ═════════════════════════════════════════════════════════════════════
function step(dt){
  if(P.paused) return;
  if(G.W) geom(G.W,G.H);
  if(P.mode==='vessels'){
    const target=levelFromAmount();
    fillH += (target-fillH)*clamp(dt*4,0,1);   // si equilibra verso il livello comune
  }
}

// ═══ Rendering ════════════════════════════════════════════════════════════════
function drawGrid(ctx,W,H){ ctx.strokeStyle=T.grid; ctx.lineWidth=1;
  for(let x=0;x<=W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=0;y<=H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();} }

function draw(canvas){
  const ctx=canvas.getContext('2d');
  const W=canvas.width,H=canvas.height;
  T=pal(); ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  drawGrid(ctx,W,H);
  geom(W,H);
  if(P.mode==='vessels') drawVessels(ctx); else if(P.mode==='utube') drawUtube(ctx); else drawCapillary(ctx);
}

function vesselPath(ctx,i){
  const cx=vesselCx(i); ctx.beginPath();
  ctx.moveTo(cx-VESSELS[i].hw(0), G.yBase);
  const N=24; for(let k=0;k<=N;k++){ const t=k/N, y=G.yBase-G.Htot*t; ctx.lineTo(cx-VESSELS[i].hw(t), y); }
  for(let k=N;k>=0;k--){ const t=k/N, y=G.yBase-G.Htot*t; ctx.lineTo(cx+VESSELS[i].hw(t), y); }
  ctx.closePath();
}
function vesselSides(ctx,i){   // solo lati + cima (fondo aperto verso il canale → niente linea)
  const cx=vesselCx(i), N=24; ctx.beginPath();
  ctx.moveTo(cx-VESSELS[i].hw(0), G.yBase+1);
  for(let k=0;k<=N;k++){ const t=k/N, y=G.yBase-G.Htot*t; ctx.lineTo(cx-VESSELS[i].hw(t), y); }
  for(let k=N;k>=0;k--){ const t=k/N, y=G.yBase-G.Htot*t; ctx.lineTo(cx+VESSELS[i].hw(t), y); }
  ctx.lineTo(cx+VESSELS[i].hw(0), G.yBase+1);
}
function drawVessels(ctx){
  const liq=LIQ[P.liq], col=liq.col, yL=G.yBase-fillH, x0=G.x0-10, x1=G.x1+10, chB=G.yBase+G.chH;
  // canale di base (riempito, contorno solo su lati e fondo → niente linea sotto i vasi)
  ctx.fillStyle=rgba(col,0.85); ctx.fillRect(x0,G.yBase,x1-x0,G.chH);
  ctx.strokeStyle=T.glass; ctx.lineWidth=2; ctx.beginPath();
  ctx.moveTo(x0,G.yBase); ctx.lineTo(x0,chB); ctx.lineTo(x1,chB); ctx.lineTo(x1,G.yBase); ctx.stroke();
  // ogni vaso
  for(let i=0;i<VESSELS.length;i++){
    const cx=vesselCx(i);
    ctx.save(); vesselPath(ctx,i); ctx.fillStyle=T.glassF; ctx.fill();
    ctx.clip();
    const wob=Math.sin(tAnim*2+i)*1.2;
    ctx.fillStyle=rgba(col,0.8); ctx.fillRect(cx-60, yL+wob, 120, G.yBase-yL+G.chH+6);
    ctx.fillStyle=rgba([255,255,255],0.18); ctx.fillRect(cx-60, yL+wob, 120, 2.5);
    ctx.restore();
    // contorno: solo lati e cima (fondo aperto → continuità col canale)
    vesselSides(ctx,i); ctx.strokeStyle=T.glass; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle=T.sub; ctx.font='8px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText(VESSELS[i].name, cx, chB+14);
  }
  // linea di livello comune
  ctx.strokeStyle=rgba(T.level,0.85); ctx.setLineDash([6,4]); ctx.lineWidth=1.4;
  ctx.beginPath(); ctx.moveTo(G.x0-20,yL); ctx.lineTo(G.x1+20,yL); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle=rgb(T.level); ctx.font='10px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('stesso livello', G.x1-2, yL-5);
  // pressione al fondo
  const realH=fillH/G.Htot*HMAX_M, p=liq.rho*Gacc*realH;
  ctx.fillStyle=T.sub; ctx.textAlign='center'; ctx.fillText('p = ρgh = '+(p/1000).toFixed(2)+' kPa al fondo', (G.x0+G.x1)/2, G.yBase+G.chH+30);
  // intestazione
  ctx.textAlign='left'; ctx.fillStyle=T.accent; ctx.font='bold 14px "Space Mono",monospace';
  ctx.fillText('Vasi comunicanti: stesso liquido → stesso livello', 14, 24);
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace';
  ctx.fillText('Il livello è uguale in tutti i vasi, indipendentemente dalla forma o dalla sezione.', 14, 40);
}

function drawUtube(ctx){
  const A=LIQ[P.liqA], B=LIQ[P.liqB];
  const xL=G.W*0.42, xR=G.W*0.58, cxU=(xL+xR)/2, rMid=(xR-xL)/2;
  const wT=clamp(rMid*0.6,16,40);
  const yTopU=G.yTop+14, bottom=G.yBase+G.chH, yBend=bottom-rMid-wT/2-4;   // centro della curva inferiore
  const armH=yBend-yTopU, yInt=yBend-armH*0.42;
  const hB=armH*0.34, hA=clamp(B.rho*hB/Math.max(1,A.rho),6,armH*0.95);    // ρA·hA = ρB·hB
  const surfB=clamp(yInt-hB,yTopU+4,yBend), surfA=clamp(yInt-hA,yTopU+4,yBend);
  ctx.lineCap='butt'; ctx.lineJoin='round';
  // tubo vuoto (vetro): stroke spesso del centerline a forma di U
  ctx.strokeStyle=rgba([150,180,215],0.10); ctx.lineWidth=wT;
  ctx.beginPath(); ctx.moveTo(xL,yTopU); ctx.lineTo(xL,yBend); ctx.arc(cxU,yBend,rMid,Math.PI,0,true); ctx.lineTo(xR,yTopU); ctx.stroke();
  // liquido A (centerline: dal pelo destro giù, curva, su a sinistra fino all'interfaccia)
  ctx.strokeStyle=rgba(A.col,0.85); ctx.lineWidth=wT-3;
  ctx.beginPath(); ctx.moveTo(xR,surfA); ctx.lineTo(xR,yBend); ctx.arc(cxU,yBend,rMid,0,Math.PI,false); ctx.lineTo(xL,yInt); ctx.stroke();
  // liquido B (braccio sinistro sopra l'interfaccia)
  ctx.strokeStyle=rgba(B.col,0.85); ctx.lineWidth=wT-3;
  ctx.beginPath(); ctx.moveTo(xL,yInt); ctx.lineTo(xL,surfB); ctx.stroke();
  // pareti di vetro: contorno esterno e interno della U
  ctx.strokeStyle=T.glass; ctx.lineWidth=2.2;
  ctx.beginPath(); ctx.moveTo(xL-wT/2,yTopU); ctx.lineTo(xL-wT/2,yBend); ctx.arc(cxU,yBend,rMid+wT/2,Math.PI,0,true); ctx.lineTo(xR+wT/2,yTopU); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(xL+wT/2,yTopU); ctx.lineTo(xL+wT/2,yBend); ctx.arc(cxU,yBend,rMid-wT/2,Math.PI,0,true); ctx.lineTo(xR-wT/2,yTopU); ctx.stroke();
  // interfaccia A/B
  ctx.strokeStyle=rgba([255,255,255],0.6); ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(xL-wT/2,yInt); ctx.lineTo(xL+wT/2,yInt); ctx.stroke();
  // superfici + dislivello Δh
  ctx.strokeStyle=rgba(T.level,0.85); ctx.setLineDash([5,4]); ctx.lineWidth=1.2;
  ctx.beginPath(); ctx.moveTo(xL-wT,surfB); ctx.lineTo(xR+wT+22,surfB); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(xL-wT,surfA); ctx.lineTo(xR+wT+22,surfA); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle=rgb(T.level); ctx.fillStyle=rgb(T.level); ctx.lineWidth=1.4;
  const xd=xR+wT+16; ctx.beginPath(); ctx.moveTo(xd,surfA); ctx.lineTo(xd,surfB); ctx.stroke();
  ctx.font='10px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('Δh', xd+5,(surfA+surfB)/2+3);
  // etichette liquidi
  ctx.fillStyle=rgb(B.col); ctx.font='bold 10px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText(B.name+' (ρ='+B.rho+')', xL, yTopU-4);
  ctx.fillStyle=rgb(A.col); ctx.fillText(A.name+' (ρ='+A.rho+')', xR, yTopU-4);
  // intestazione
  ctx.textAlign='left'; ctx.fillStyle=T.accent; ctx.font='bold 14px "Space Mono",monospace';
  ctx.fillText('Tubo a U: due liquidi → ρ_A·h_A = ρ_B·h_B', 14, 24);
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace';
  ctx.fillText('Il liquido meno denso forma la colonna più alta (principio del manometro).', 14, 40);
}

// ═══ Capillarità ══════════════════════════════════════════════════════════════
function capH(r_mm){ const r=r_mm*1e-3; return 2*P.gamma*Math.cos(P.theta*Math.PI/180)/(P.rho*Gacc*r); }  // legge di Jurin (m)
function drawCapillary(ctx){
  const x0=G.x0,x1=G.x1, yRes=G.yBase, resBot=G.yBase+Math.max(G.chH*2,46)+6, tubeTop=G.yTop+44;
  const tubeBot=resBot-16;   // i capillari pescano nel liquido SENZA toccare il fondo
  const wet=P.theta<90, col=wet?[70,140,235]:[180,186,196];
  // serbatoio
  ctx.fillStyle=rgba(col,0.8); ctx.fillRect(x0,yRes,x1-x0,resBot-yRes);
  ctx.strokeStyle=T.glass; ctx.lineWidth=2; ctx.beginPath();
  ctx.moveTo(x0,yRes-2); ctx.lineTo(x0,resBot); ctx.lineTo(x1,resBot); ctx.lineTo(x1,yRes-2); ctx.stroke();
  ctx.strokeStyle=rgba(col,0.5); ctx.beginPath(); ctx.moveTo(x0,yRes); ctx.lineTo(x1,yRes); ctx.stroke();
  // scala px/m sull'altezza disponibile
  const hs=TUBES.map(capH), hmax=Math.max(0.005,...hs.map(Math.abs));
  const pxM=clamp((yRes-tubeTop)/hmax,0,5000);
  TUBES.forEach((r,i)=>{
    const tx=x0+(x1-x0)*(i+0.7)/(TUBES.length+0.4), w=clamp(r*9,5,22);
    const h=hs[i]*pxM, top=yRes-h;
    // vetro del capillare (pareti che terminano immerse, sopra il fondo)
    ctx.strokeStyle=T.glass; ctx.lineWidth=1.4;
    ctx.beginPath(); ctx.moveTo(tx-w/2,tubeTop); ctx.lineTo(tx-w/2,tubeBot); ctx.moveTo(tx+w/2,tubeTop); ctx.lineTo(tx+w/2,tubeBot); ctx.stroke();
    // liquido nel capillare
    ctx.save(); ctx.beginPath(); ctx.rect(tx-w/2,tubeTop-10,w,tubeBot-tubeTop+10); ctx.clip();
    ctx.fillStyle=rgba(col,0.85);
    const fy=Math.min(top,yRes);
    ctx.fillRect(tx-w/2, fy, w, tubeBot-fy);
    // menisco (concavo se bagna, convesso se no)
    ctx.beginPath(); ctx.ellipse(tx, top, w/2, 4, 0, 0, Math.PI*2);
    if(wet){ ctx.fillStyle=T.bg; ctx.beginPath(); ctx.ellipse(tx,top-1,w/2,3.5,0,Math.PI,0,true); ctx.fill(); }
    else { ctx.fillStyle=rgba(col,0.85); ctx.beginPath(); ctx.ellipse(tx,top,w/2,3.5,0,Math.PI,0,false); ctx.fill(); }
    ctx.restore();
    // etichette
    ctx.fillStyle=T.sub; ctx.font='8px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText('r='+r+'mm', tx, resBot+13);
    ctx.fillStyle=rgb(T.level); ctx.font='8px "Space Mono",monospace'; ctx.fillText((h/pxM*100).toFixed(1)+'cm', tx, top+(h>=0?-6:14));
    // tratteggio livello serbatoio per riferimento
  });
  // intestazione
  ctx.textAlign='left'; ctx.fillStyle=T.accent; ctx.font='bold 14px "Space Mono",monospace';
  ctx.fillText('Capillarità (legge di Jurin):  h = 2γcosθ / (ρgr)', 14, 24);
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace';
  ctx.fillText(P.theta<90?'liquido bagnante: risale tanto più quanto è stretto il capillare (h ∝ 1/r).'
                          :'liquido non bagnante: depressione (livello sotto il serbatoio).', 14, 40);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
function gBase(ctx,W,H,PAD){
  ctx.fillStyle=T.gBg; ctx.fillRect(0,0,W,H);
  const gW=W-PAD.l-PAD.r, gH=H-PAD.t-PAD.b;
  ctx.strokeStyle=T.gAxis; ctx.lineWidth=0.6;
  ctx.beginPath(); ctx.moveTo(PAD.l,PAD.t); ctx.lineTo(PAD.l,PAD.t+gH); ctx.lineTo(PAD.l+gW,PAD.t+gH); ctx.stroke();
  return {gW,gH};
}
function setTitles(){
  const t = P.mode==='vessels' ? ['Pressione vs profondità','Volume per vaso (stesso livello)','Livello per vaso']
    : P.mode==='utube' ? ['Bilancio ρ·h','h_B in funzione di ρ_B','Pressione vs profondità']
    : ['Altezza h vs raggio r','h in funzione di γ','Risalita per capillare'];
  for(let i=0;i<3;i++) if(gTitle[i]) gTitle[i].textContent=t[i];
}
function drawGraphs(){ if(P.mode==='vessels') gVessels(); else if(P.mode==='utube') gUtube(); else gCapillary(); }

function gCapillary(){
  const hs=TUBES.map(capH);
  // 1: h(r) iperbole
  if(gCanvas[0]&&gCanvas[0].width){ const cv=gCanvas[0],ctx=gCtx[0],W=cv.width,H=cv.height,PAD={t:14,b:18,l:26,r:8};
    const {gW,gH}=gBase(ctx,W,H,PAD); const rmax=1.8, hmax=Math.max(0.01,capH(0.2)), pre=2*P.gamma*Math.cos(P.theta*Math.PI/180)/(P.rho*Gacc);
    const xOf=r=>PAD.l+r/rmax*gW, yOf=h=>PAD.t+gH-clamp(h/hmax,-0.2,1)*gH*0.85;
    ctx.strokeStyle=T.accent; ctx.lineWidth=1.6; ctx.beginPath(); let f=true;
    for(let r=0.15;r<=rmax;r+=0.03){ const x=xOf(r),y=yOf(pre/(r*1e-3)); f?(ctx.moveTo(x,y),f=false):ctx.lineTo(x,y);} ctx.stroke();
    TUBES.forEach((r,i)=>{ ctx.fillStyle=rgb(T.level); ctx.beginPath(); ctx.arc(xOf(r),yOf(hs[i]),3,0,Math.PI*2); ctx.fill(); });
    ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('h',PAD.l+2,PAD.t+7); ctx.textAlign='right'; ctx.fillText('r',PAD.l+gW-2,PAD.t+gH-3);
  }
  // 2: h(γ) lineare (per r di riferimento)
  if(gCanvas[1]&&gCanvas[1].width){ const cv=gCanvas[1],ctx=gCtx[1],W=cv.width,H=cv.height,PAD={t:14,b:18,l:26,r:8};
    const {gW,gH}=gBase(ctx,W,H,PAD); const rref=0.5e-3, gmax=0.5, hmax=2*gmax*1/(P.rho*Gacc*rref);
    const xOf=g=>PAD.l+g/gmax*gW, yOf=h=>PAD.t+gH-clamp(h/hmax,0,1)*gH*0.9;
    ctx.strokeStyle=T.accent; ctx.lineWidth=1.6; ctx.beginPath();
    ctx.moveTo(xOf(0),yOf(0)); ctx.lineTo(xOf(gmax),yOf(2*gmax*Math.cos(P.theta*Math.PI/180)/(P.rho*Gacc*rref))); ctx.stroke();
    ctx.fillStyle=rgb(T.level); ctx.beginPath(); ctx.arc(xOf(P.gamma),yOf(2*P.gamma*Math.cos(P.theta*Math.PI/180)/(P.rho*Gacc*rref)),3.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('h',PAD.l+2,PAD.t+7); ctx.textAlign='right'; ctx.fillText('γ',PAD.l+gW-2,PAD.t+gH-3);
  }
  // 3: barre risalita per capillare
  if(gCanvas[2]&&gCanvas[2].width){ const cv=gCanvas[2],ctx=gCtx[2],W=cv.width,H=cv.height,PAD={t:14,b:22,l:10,r:10};
    const {gW,gH}=gBase(ctx,W,H,PAD); const hmax=Math.max(0.01,...hs.map(Math.abs)); const bw=gW/TUBES.length*0.5;
    TUBES.forEach((r,i)=>{ const cx=PAD.l+gW*(i+0.5)/TUBES.length, bh=clamp(hs[i]/hmax,-1,1)*gH*0.45, base=PAD.t+gH*0.5;
      ctx.fillStyle=rgba(P.theta<90?[70,140,235]:[180,186,196],0.85); ctx.fillRect(cx-bw/2, bh>=0?base-bh:base, bw, Math.abs(bh));
      ctx.fillStyle=T.gText; ctx.font='6px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText(r+'mm',cx,PAD.t+gH+9); });
  }
}

function gVessels(){
  const liq=LIQ[P.liq], realH=fillH/G.Htot*HMAX_M;
  // 1: pressione vs profondità (lineare)
  if(gCanvas[0]&&gCanvas[0].width){ const cv=gCanvas[0],ctx=gCtx[0],W=cv.width,H=cv.height,PAD={t:14,b:18,l:30,r:8};
    const {gW,gH}=gBase(ctx,W,H,PAD); const pmax=liq.rho*Gacc*HMAX_M;
    const xOf=d=>PAD.l+d/HMAX_M*gW, yOf=p=>PAD.t+gH-p/Math.max(1,pmax)*gH*0.9;
    ctx.strokeStyle=T.accent; ctx.lineWidth=1.6; ctx.beginPath(); ctx.moveTo(xOf(0),yOf(0)); ctx.lineTo(xOf(realH),yOf(liq.rho*Gacc*realH)); ctx.stroke();
    ctx.fillStyle=rgb(T.level); ctx.beginPath(); ctx.arc(xOf(realH),yOf(liq.rho*Gacc*realH),3.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('p',PAD.l+2,PAD.t+7); ctx.textAlign='right'; ctx.fillText('h',PAD.l+gW-2,PAD.t+gH-3);
  }
  // 2: volume per vaso a parità di livello (barre diverse → stesso livello)
  if(gCanvas[1]&&gCanvas[1].width){ const cv=gCanvas[1],ctx=gCtx[1],W=cv.width,H=cv.height,PAD={t:16,b:22,l:10,r:10};
    const {gW,gH}=gBase(ctx,W,H,PAD); const vols=VESSELS.map((_,i)=>vesselVol(i,fillH)); const max=Math.max(1,...vols);
    const bw=gW/VESSELS.length*0.55; vols.forEach((v,i)=>{ const cx=PAD.l+gW*(i+0.5)/VESSELS.length, bh=v/max*gH;
      ctx.fillStyle=rgba(LIQ[P.liq].col,0.8); ctx.fillRect(cx-bw/2,PAD.t+gH-bh,bw,bh);
      ctx.fillStyle=T.gText; ctx.font='6px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText(['largo','cap.','cono','imb.','col.'][i],cx,PAD.t+gH+9); });
  }
  // 3: livello per vaso (tutti uguali → linea piatta)
  if(gCanvas[2]&&gCanvas[2].width){ const cv=gCanvas[2],ctx=gCtx[2],W=cv.width,H=cv.height,PAD={t:14,b:20,l:14,r:8};
    const {gW,gH}=gBase(ctx,W,H,PAD); const yh=PAD.t+gH-(fillH/G.Htot)*gH*0.85;
    ctx.strokeStyle=rgb(T.level); ctx.lineWidth=1.6; ctx.beginPath(); ctx.moveTo(PAD.l,yh); ctx.lineTo(PAD.l+gW,yh); ctx.stroke();
    for(let i=0;i<VESSELS.length;i++){ const cx=PAD.l+gW*(i+0.5)/VESSELS.length; ctx.fillStyle=T.accent; ctx.beginPath(); ctx.arc(cx,yh,3,0,Math.PI*2); ctx.fill(); }
    ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText('livello identico in tutti i vasi',PAD.l+gW/2,PAD.t+gH+10);
  }
}
function gUtube(){
  const A=LIQ[P.liqA], B=LIQ[P.liqB], hA=0.12, hB=A.rho*hA/B.rho;
  // 1: bilancio ρ·h (due barre uguali)
  if(gCanvas[0]&&gCanvas[0].width){ const cv=gCanvas[0],ctx=gCtx[0],W=cv.width,H=cv.height,PAD={t:16,b:22,l:10,r:10};
    const {gW,gH}=gBase(ctx,W,H,PAD); const val=A.rho*hA, max=val*1.2;
    const bars=[{v:A.rho*hA,c:A.col,l:'ρA·hA'},{v:B.rho*hB,c:B.col,l:'ρB·hB'}]; const bw=gW/2*0.5;
    bars.forEach((b,i)=>{ const cx=PAD.l+gW*(i+0.5)/2, bh=b.v/max*gH; ctx.fillStyle=rgba(b.c,0.85); ctx.fillRect(cx-bw/2,PAD.t+gH-bh,bw,bh);
      ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText(b.l,cx,PAD.t+gH+10); });
    ctx.fillStyle=T.gText; ctx.textAlign='center'; ctx.fillText('uguali (equilibrio)',PAD.l+gW/2,PAD.t+8);
  }
  // 2: hB vs ρB (1/ρB)
  if(gCanvas[1]&&gCanvas[1].width){ const cv=gCanvas[1],ctx=gCtx[1],W=cv.width,H=cv.height,PAD={t:14,b:18,l:24,r:8};
    const {gW,gH}=gBase(ctx,W,H,PAD); const rmin=600,rmax=14000, hmax=A.rho*hA/rmin;
    const xOf=r=>PAD.l+(r-rmin)/(rmax-rmin)*gW, yOf=h=>PAD.t+gH-clamp(h/hmax,0,1)*gH*0.9;
    ctx.strokeStyle=T.accent; ctx.lineWidth=1.6; ctx.beginPath(); let f=true;
    for(let r=rmin;r<=rmax;r+=200){ const x=xOf(r),y=yOf(A.rho*hA/r); f?(ctx.moveTo(x,y),f=false):ctx.lineTo(x,y);} ctx.stroke();
    ctx.fillStyle=rgb(B.col); ctx.beginPath(); ctx.arc(xOf(B.rho),yOf(hB),3.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('h_B',PAD.l+2,PAD.t+7); ctx.textAlign='right'; ctx.fillText('ρ_B',PAD.l+gW-2,PAD.t+gH-3);
  }
  // 3: pressione vs profondità nei due bracci
  if(gCanvas[2]&&gCanvas[2].width){ const cv=gCanvas[2],ctx=gCtx[2],W=cv.width,H=cv.height,PAD={t:14,b:18,l:26,r:8};
    const {gW,gH}=gBase(ctx,W,H,PAD); const hmax=Math.max(hA,hB), pmax=Math.max(A.rho,B.rho)*Gacc*hmax;
    const xOf=d=>PAD.l+d/hmax*gW, yOf=p=>PAD.t+gH-p/Math.max(1,pmax)*gH*0.9;
    ctx.strokeStyle=rgb(A.col); ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(xOf(0),yOf(0)); ctx.lineTo(xOf(hA),yOf(A.rho*Gacc*hA)); ctx.stroke();
    ctx.strokeStyle=rgb(B.col); ctx.beginPath(); ctx.moveTo(xOf(0),yOf(0)); ctx.lineTo(xOf(hB),yOf(B.rho*Gacc*hB)); ctx.stroke();
    ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('p',PAD.l+2,PAD.t+7); ctx.textAlign='right'; ctx.fillText('h',PAD.l+gW-2,PAD.t+gH-3);
  }
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
function reControls(){ setTimeout(buildControls,0); }
function buildControls(){
  const cont=document.getElementById('controls'); cont.innerHTML='';
  const secM=Lab.Section('Modalità'); cont.appendChild(secM.el);
  secM.add(Lab.RadioGroup({ label:'Configurazione', options:[{value:'vessels',label:'Vasi comunicanti'},{value:'utube',label:'Tubo a U (due liquidi)'},{value:'capillary',label:'Capillarità'}],
    value:P.mode, onChange(v){ if(v===P.mode)return; P.mode=v; setTitles(); buildReadout(); reControls(); } }));
  if(P.mode==='vessels'){
    const s=Lab.Section('Liquido'); cont.appendChild(s.el);
    s.add(Lab.RadioGroup({ label:'Tipo', options:Object.keys(LIQ).map(k=>({value:k,label:LIQ[k].name,hint:LIQ[k].rho+' kg/m³'})), value:P.liq, onChange(v){P.liq=v;} }));
    s.add(Lab.Slider({ label:'Quantità di liquido', min:0, max:100, step:1, value:P.amount, unit:' %', onChange(v){P.amount=v;} }));
  } else if(P.mode==='utube'){
    const sa=Lab.Section('Liquido A (sinistra)'); cont.appendChild(sa.el);
    sa.add(Lab.RadioGroup({ label:'Tipo', options:Object.keys(LIQ).map(k=>({value:k,label:LIQ[k].name,hint:LIQ[k].rho})), value:P.liqA, onChange(v){P.liqA=v;} }));
    const sb=Lab.Section('Liquido B (destra)'); cont.appendChild(sb.el);
    sb.add(Lab.RadioGroup({ label:'Tipo', options:Object.keys(LIQ).map(k=>({value:k,label:LIQ[k].name,hint:LIQ[k].rho})), value:P.liqB, onChange(v){P.liqB=v;} }));
  } else {
    const s=Lab.Section('Liquido (capillarità)'); cont.appendChild(s.el);
    s.add(Lab.Slider({ label:'Densità ρ', min:600, max:13600, step:10, value:P.rho, unit:' kg/m³', onChange(v){P.rho=v;} }));
    s.add(Lab.Slider({ label:'Tensione superficiale γ', min:0.02, max:0.5, step:0.005, value:P.gamma, unit:' N/m', onChange(v){P.gamma=v;} }));
    s.add(Lab.Slider({ label:'Angolo di contatto θ', min:0, max:160, step:5, value:P.theta, unit:'°', onChange(v){P.theta=v;} }));
  }
}
function buildReadout(){
  const el=document.getElementById('readout'); el.innerHTML='';
  const f = P.mode==='vessels' ? [{key:'h',label:'Livello'},{key:'p',label:'Pressione al fondo'},{key:'rho',label:'Densità'},{key:'note',label:'Legge'}]
    : P.mode==='utube' ? [{key:'ra',label:'ρ_A'},{key:'rb',label:'ρ_B'},{key:'ha',label:'h_A'},{key:'hb',label:'h_B'},{key:'dh',label:'Δh'},{key:'note',label:'Equilibrio'}]
    : [{key:'g',label:'Tensione γ'},{key:'th',label:'Angolo θ'},{key:'rho',label:'Densità'},{key:'hmin',label:'h (r=0.25mm)'},{key:'hmax',label:'h (r=1.5mm)'},{key:'note',label:'Legge'}];
  readout=new Lab.Readout(el,f);
}
function initGraphs(){
  const ga=document.getElementById('graphArea');
  ga.style.cssText='display:flex;flex-direction:row;gap:5px;padding:5px 0 3px;height:150px;box-sizing:border-box;border-top:1px solid rgba(100,150,200,0.14);';
  for(let i=0;i<3;i++){
    const panel=document.createElement('div');
    panel.style.cssText='flex:1;min-width:0;position:relative;background:rgba(2,7,18,0.8);border:1px solid rgba(100,150,200,0.11);border-radius:4px;overflow:hidden;';
    const title=document.createElement('div');
    title.style.cssText='position:absolute;top:3px;left:6px;font-size:8px;color:rgba(100,175,200,0.65);font-family:"Space Mono",monospace;text-transform:uppercase;letter-spacing:0.4px;z-index:1;pointer-events:none;';
    const cv=document.createElement('canvas'); cv.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;';
    panel.appendChild(title); panel.appendChild(cv); ga.appendChild(panel);
    gCanvas[i]=cv; gCtx[i]=cv.getContext('2d'); gTitle[i]=title;
  }
  setTitles();
}

// ═══ Init ═════════════════════════════════════════════════════════════════════
function init(){
  Lab.initTheme();
  buildControls(); initGraphs(); buildReadout();
  const simCanvas=document.getElementById('simCanvas');
  document.getElementById('btnMode').addEventListener('click',()=>{ P.mode = P.mode==='vessels'?'utube':P.mode==='utube'?'capillary':'vessels'; setTitles(); buildReadout(); buildControls(); });
  document.getElementById('btnReset').addEventListener('click',()=>{ P.mode='vessels'; P.amount=50; P.liq='acqua'; P.liqA='acqua'; P.liqB='olio'; P.paused=false; buildControls(); buildReadout(); setTitles(); });

  function resize(){
    const area=document.querySelector('.lab-canvas-area'); if(!area)return;
    const ar=area.getBoundingClientRect();
    const rb=document.getElementById('readout').getBoundingClientRect();
    const ga=document.getElementById('graphArea'); const gaH=ga?ga.offsetHeight:0;
    const h=Math.max(220,Math.floor(ar.height-rb.height-gaH-4));
    simCanvas.style.width=Math.floor(ar.width)+'px'; simCanvas.style.height=h+'px';
    simCanvas.width=Math.floor(ar.width); simCanvas.height=h;
    geom(simCanvas.width,simCanvas.height);
    for(const cv of gCanvas){ if(!cv)continue; cv.width=Math.floor(cv.parentElement.clientWidth); cv.height=Math.floor(cv.parentElement.clientHeight); }
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
      if(P.mode==='vessels'){
        const liq=LIQ[P.liq], realH=fillH/G.Htot*HMAX_M, p=liq.rho*Gacc*realH;
        readout.set('h',(realH*100).toFixed(1)+' cm'); readout.set('p',(p/1000).toFixed(2)+' kPa');
        readout.set('rho',liq.rho+' kg/m³'); readout.set('note','livello uguale ovunque');
      } else if(P.mode==='utube'){
        const A=LIQ[P.liqA],B=LIQ[P.liqB], hB=12, hA=B.rho*hB/A.rho;
        readout.set('ra',A.rho+''); readout.set('rb',B.rho+''); readout.set('ha',hA.toFixed(1)+' cm');
        readout.set('hb',hB.toFixed(1)+' cm'); readout.set('dh',Math.abs(hB-hA).toFixed(1)+' cm'); readout.set('note','ρA·hA = ρB·hB');
      } else {
        readout.set('g',P.gamma.toFixed(3)+' N/m'); readout.set('th',P.theta+'°'); readout.set('rho',P.rho+' kg/m³');
        readout.set('hmin',(capH(0.25)*100).toFixed(1)+' cm'); readout.set('hmax',(capH(1.5)*100).toFixed(1)+' cm'); readout.set('note','h = 2γcosθ/(ρgr)');
      }
    }catch(err){ console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
