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
  const [ctx, W, H] = Lab.ctx2d(canvas);
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
function setTitles(){}   // i titoli sono disegnati dentro i grafici
function drawGraphs(){ if(P.mode==='vessels') gVessels(); else if(P.mode==='utube') gUtube(); else gCapillary(); }
// istogramma semplice con asse numerato
function bars(i,title,vals,labels,cols,yr,fmtV){
  const g=Lab.panel(gCanvas[i],{ title, xr:[0,vals.length], xStep:1e9, xFmt:()=> '', yr });
  if(!g) return; const [ctx,f]=g, gap=(f.R-f.L)/vals.length, bw=gap*0.55;
  vals.forEach((v,k)=>{ const x=f.L+gap*k+(gap-bw)/2, y0=f.Y(Math.max(yr[0],0)), y=f.Y(v);
    ctx.fillStyle=cols[k]; ctx.fillRect(x,Math.min(y,y0),bw,Math.abs(y0-y));
    ctx.font='9.5px "Space Mono",monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
    if(fmtV){ ctx.fillStyle=f.C.title; ctx.fillText(fmtV(v),x+bw/2,v>=0?y-8:y+8); }
    ctx.fillStyle=f.C.text; ctx.font='9.5px "DM Sans",sans-serif'; ctx.fillText(labels[k],x+bw/2,f.B+10); });
}

function gCapillary(){
  const hs=TUBES.map(capH), c=Math.cos(P.theta*Math.PI/180), pre=2*P.gamma*c/(P.rho*Gacc);
  // 1: legge di Jurin h = 2γ·cosθ/(ρ·g·r): iperbole in r
  const hm=Lab.niceMax(Math.max(Math.abs(capH(0.2)),0.001)*100*1.05);
  let g=Lab.panel(gCanvas[0],{ title:'Risalita h (cm) in funzione del raggio', xr:[0,1.8], yr:[c<0?-hm:0,hm], xLabel:'r (mm)' });
  if(g){ const [ctx,f]=g;
    Lab.plot(ctx,f,r=>r<0.12?NaN:pre/(r*1e-3)*100,[0,1.8],T.accent,2);
    TUBES.forEach((r,i)=>Lab.dot(ctx,f,r,hs[i]*100,rgb(T.level),4)); }
  // 2: h in funzione della tensione superficiale γ, per un capillare di 0,5 mm
  const rref=0.5e-3, hm2=Lab.niceMax(2*0.5/(P.rho*Gacc*rref)*100);
  g=Lab.panel(gCanvas[1],{ title:'h (cm) in funzione di γ, capillare da 0,5 mm', xr:[0,0.5], yr:[c<0?-hm2:0,hm2], xLabel:'γ (N/m)' });
  if(g){ const [ctx,f]=g;
    Lab.plot(ctx,f,gm=>2*gm*c/(P.rho*Gacc*rref)*100,[0,0.5],T.accent,2);
    Lab.dot(ctx,f,P.gamma,2*P.gamma*c/(P.rho*Gacc*rref)*100,rgb(T.level),4.5); }
  // 3: risalita (o discesa, se θ > 90°) in ogni capillare
  const m=Lab.niceMax(Math.max(...hs.map(Math.abs),0.001)*100*1.15);
  bars(2,'Risalita in ogni capillare (cm)',hs.map(h=>h*100),TUBES.map(r=>Lab.fmt(r,2)+' mm'),
    TUBES.map(()=>rgba(P.theta<90?[70,140,235]:[180,186,196],0.85)),[-m,m],v=>Lab.fmt(v,1));
}

function gVessels(){
  const liq=LIQ[P.liq], realH=fillH/G.Htot*HMAX_M;
  // 1: legge di Stevino p = ρ·g·h (pressione idrostatica, sopra quella atmosferica)
  const pm=Lab.niceMax(13600*Gacc*HMAX_M/1000);
  let g=Lab.panel(gCanvas[0],{ title:'Pressione p = ρ·g·h (kPa)', xr:[0,HMAX_M*100], yr:[0,Lab.niceMax(liq.rho*Gacc*HMAX_M/1000)], xLabel:'profondità h (cm)' });
  if(g){ const [ctx,f]=g;
    Lab.plot(ctx,f,h=>liq.rho*Gacc*h/100/1000,[0,HMAX_M*100],T.accent,2);
    Lab.dot(ctx,f,realH*100,liq.rho*Gacc*realH/1000,rgb(T.level),4.5); }
  // 2: quantità di liquido in ogni vaso: diversa, eppure il livello è lo stesso
  const vols=VESSELS.map((_,i)=>vesselVol(i,fillH)), vmax=Math.max(1e-9,...vols);
  bars(1,'Liquido contenuto (% del vaso più capiente)',vols.map(v=>v/vmax*100),['largo','capillare','cono','imbuto','colonna'],
    vols.map(()=>rgba(LIQ[P.liq].col,0.8)),[0,100],v=>Lab.fmt(v,0));
  // 3: livello raggiunto in ogni vaso
  bars(2,'Livello in ogni vaso (cm): identico',VESSELS.map(()=>realH*100),['largo','capillare','cono','imbuto','colonna'],
    VESSELS.map(()=>rgba(T.level,0.8)),[0,Lab.niceMax(HMAX_M*100)],v=>Lab.fmt(v,1));
}
function gUtube(){
  const A=LIQ[P.liqA], B=LIQ[P.liqB], hA=0.12, hB=A.rho*hA/B.rho;
  // 1: all'equilibrio ρ_A·h_A = ρ_B·h_B (stessa pressione alla quota di separazione)
  const pa=A.rho*Gacc*hA/1000, pm=Lab.niceMax(pa*1.2);
  bars(0,'Pressione delle due colonne ρ·g·h (kPa)',[pa,B.rho*Gacc*hB/1000],['braccio A','braccio B'],[rgba(A.col,0.85),rgba(B.col,0.85)],[0,pm],v=>Lab.fmt(v,2));
  // 2: altezza della colonna B al variare della densità di B (iperbole h_B = ρ_A·h_A/ρ_B)
  const hm=Lab.niceMax(A.rho*hA/600*100);
  let g=Lab.panel(gCanvas[1],{ title:'Altezza della colonna B (cm)', xr:[0,14000], yr:[0,hm], xLabel:'ρ_B (kg/m³)', xFmt:v=>v>=1000?Lab.fmt(v/1000,0)+'k':String(v) });
  if(g){ const [ctx,f]=g;
    Lab.plot(ctx,f,r=>r<500?NaN:A.rho*hA/r*100,[0,14000],T.accent,2);
    Lab.dot(ctx,f,B.rho,hB*100,rgb(B.col),4.5); }
  // 3: pressione in funzione della profondità nei due bracci: si incontrano alla stessa quota
  const hmax=Math.max(hA,hB)*100, pmax=Lab.niceMax(Math.max(A.rho,B.rho)*Gacc*Math.max(hA,hB)/1000);
  g=Lab.panel(gCanvas[2],{ title:'Pressione nei due bracci (kPa)', xr:[0,Lab.niceMax(hmax)], yr:[0,pmax], xLabel:'profondità (cm)' });
  if(g){ const [ctx,f]=g;
    Lab.plot(ctx,f,h=>h>hA*100?NaN:A.rho*Gacc*h/100/1000,[0,Lab.niceMax(hmax)],rgb(A.col),2);
    Lab.plot(ctx,f,h=>h>hB*100?NaN:B.rho*Gacc*h/100/1000,[0,Lab.niceMax(hmax)],rgb(B.col),2);
    Lab.legend(ctx,f.L+8,f.T+8,[[rgb(A.col),A.name||'A'],[rgb(B.col),B.name||'B']]); }
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
  // riga di grafici standard (Lab.graphPanels); i titoli sono disegnati dentro i grafici
  gCanvas = Lab.graphPanels(document.getElementById('graphArea'), 3);
  gCtx = gCanvas.map(c => c.getContext('2d'));
  gTitle = gCanvas.map(() => ({ textContent: '' }));
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
      if(P.mode==='vessels'){
        const liq=LIQ[P.liq], realH=fillH/G.Htot*HMAX_M, p=liq.rho*Gacc*realH;
        readout.set('h',Lab.fmt((realH*100),1)+' cm'); readout.set('p',Lab.fmt((p/1000),2)+' kPa');
        readout.set('rho',liq.rho+' kg/m³'); readout.set('note','livello uguale ovunque');
      } else if(P.mode==='utube'){
        const A=LIQ[P.liqA],B=LIQ[P.liqB], hB=12, hA=B.rho*hB/A.rho;
        readout.set('ra',A.rho+''); readout.set('rb',B.rho+''); readout.set('ha',Lab.fmt(hA,1)+' cm');
        readout.set('hb',Lab.fmt(hB,1)+' cm'); readout.set('dh',Lab.fmt(Math.abs(hB-hA),1)+' cm'); readout.set('note','ρA·hA = ρB·hB');
      } else {
        readout.set('g',Lab.fmt(P.gamma,3)+' N/m'); readout.set('th',P.theta+'°'); readout.set('rho',P.rho+' kg/m³');
        readout.set('hmin',Lab.fmt((capH(0.25)*100),1)+' cm'); readout.set('hmax',Lab.fmt((capH(1.5)*100),1)+' cm'); readout.set('note','h = 2γcosθ/(ρgr)');
      }
    }catch(err){ console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
