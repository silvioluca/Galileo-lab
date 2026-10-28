'use strict';

// ═══ Stato ════════════════════════════════════════════════════════════════════
const MAT = {
  cesio:  {name:'Cesio',  phi:2.10},
  sodio:  {name:'Sodio',  phi:2.28},
  calcio: {name:'Calcio', phi:2.87},
  zinco:  {name:'Zinco',  phi:4.30},
  rame:   {name:'Rame',   phi:4.70},
};
const P = {
  view:'tube',     // 'tube' (tubo a vuoto) | 'plate' (lastra)
  nu: 8.0,         // frequenza radiazione (×10¹⁴ Hz)
  intensity: 60,   // intensità (%)
  mat: 'sodio',    // materiale del catodo
  V: 0.5,          // tensione anodo-catodo (V)
  paused:false,
};

const h_eV = 4.135667e-15;
const cLight = 2.998e8;

let tAnim=0, last=0;
let electrons=[], spawnAcc=0;
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
    tube:  d?'rgba(150,180,215,0.10)':'rgba(120,150,195,0.12)',
    tubeEdge:d?'rgba(170,200,230,0.5)':'rgba(70,110,160,0.55)',
    metal: d?'#9fb0c4':'#8d9cb0',
    metalD:d?'#5d6b7e':'#6c7a8c',
    wire:  d?'rgba(185,205,230,0.8)':'rgba(60,90,125,0.85)',
    elec:  [80,120,235],
    cur:   [255,205,70],
    phi:   [120,140,170],
    kcol:  [95,225,140],
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
function photonE(){ return h_eV*(P.nu*1e14); }
function phi(){ return MAT[P.mat].phi; }
function nu0(){ return phi()/h_eV/1e14; }
function Kmax(){ return Math.max(0, photonE()-phi()); }
function emits(){ return photonE() > phi(); }
function V0(){ return Kmax(); }
function lambdaNm(){ return 2998/P.nu; }
function current(){
  if(!emits()) return 0;
  const Isat=P.intensity/100;
  if(P.V>=0) return Isat;
  const v0=V0(); if(v0<=1e-6) return 0;
  return Isat*clamp(1-(-P.V)/v0, 0, 1);
}
function wlRGB(wl){
  if(wl<380) return [150,110,255];
  if(wl>780) return [120,32,32];
  let r=0,g=0,b=0;
  if(wl<440){ r=-(wl-440)/60; b=1; }
  else if(wl<490){ g=(wl-440)/50; b=1; }
  else if(wl<510){ g=1; b=-(wl-510)/20; }
  else if(wl<580){ r=(wl-510)/70; g=1; }
  else if(wl<645){ r=1; g=-(wl-645)/65; }
  else { r=1; }
  let f=1;
  if(wl<420) f=0.3+0.7*(wl-380)/40;
  else if(wl>700) f=0.3+0.7*(780-wl)/80;
  return [Math.round(r*255*f),Math.round(g*255*f),Math.round(b*255*f)];
}

// ═══ Geometria ════════════════════════════════════════════════════════════════
let G={};
function geom(W,H){
  // tubo: più stretto (basso) e allungato (orizzontale)
  const tubeX0=W*0.18, tubeX1=W*0.80, tubeY0=H*0.30, tubeY1=H*0.46, cy=(tubeY0+tubeY1)/2;
  const catX=tubeX0+(tubeX1-tubeX0)*0.13, anoX=tubeX0+(tubeX1-tubeX0)*0.88;
  // lastra (box isometrico) + punto d'impatto del fascio
  const ox=W*0.22, oy=H*0.68, Rx=W*0.44, Ry=H*0.07, Dx=W*0.15, Dy=-H*0.12, Th=H*0.06;
  const impactX=ox+Rx*0.34+Dx*0.5, impactY=oy+Ry*0.34+Dy*0.5;
  G={W,H,tubeX0,tubeX1,tubeY0,tubeY1,cy,catX,anoX, slab:{ox,oy,Rx,Ry,Dx,Dy,Th}, impactX,impactY};
}

// ═══ Animazione ═══════════════════════════════════════════════════════════════
function spawnElectron(){
  const k=Kmax();
  if(P.view==='tube'){
    const cyA=G.tubeY0+10, cyB=G.tubeY1-10;
    electrons.push({mode:'tube', frac:0, dir:1, y:cyA+Math.random()*(cyB-cyA), k0:k, speed:0.012+0.05*Math.sqrt(k)});
  } else {
    const sp=1.6+2.4*Math.sqrt(k);
    const ang=-Math.PI*0.36 + (Math.random()-0.5)*1.25;
    electrons.push({mode:'plate', x:G.impactX, y:G.impactY, vx:Math.cos(ang)*sp, vy:Math.sin(ang)*sp, life:1});
  }
}
function step(dt){
  if(P.paused) return;
  const dtf=Math.min(dt,0.05)*60;
  spawnAcc += P.intensity/100 * dtf * 0.4;
  while(spawnAcc>=1){ spawnAcc-=1; if(emits() && P.intensity>0) spawnElectron(); }
  if(P.view==='tube'){
    const v0=V0();
    for(const e of electrons){
      const turn=(P.V<0 && v0>1e-6)?clamp(e.k0/(-P.V),0,1):2;
      const sp=e.speed*dtf*(0.6+0.8*Math.sqrt(Math.max(0.02, e.k0+P.V*e.frac)));
      if(e.dir>0 && P.V<0 && e.frac>=turn) e.dir=-1;
      e.frac+=e.dir*sp*0.5;
      if(e.frac>=1) e.dead=true; if(e.frac<0) e.dead=true;
    }
  } else {
    for(const e of electrons){ e.x+=e.vx*dtf; e.y+=e.vy*dtf; e.life-=0.004*dtf;
      if(e.x>G.W+20||e.y<-20||e.life<=0) e.dead=true; }
  }
  electrons=electrons.filter(e=>!e.dead);
  if(electrons.length>170) electrons.splice(0,electrons.length-170);
}

// ═══ Helper di disegno ════════════════════════════════════════════════════════
function roundRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function poly(ctx,pts,fill,stroke,lw){ ctx.beginPath(); pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1])); ctx.closePath();
  if(fill){ctx.fillStyle=fill;ctx.fill();} if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw||1.5;ctx.lineJoin='round';ctx.stroke();} }
function vgrad(ctx,y0,y1,c0,c1){ const g=ctx.createLinearGradient(0,y0,0,y1); g.addColorStop(0,c0); g.addColorStop(1,c1); return g; }

// fascio: freccia ondulata lunga (onda sinusoidale + punta), niente sorgente
function drawWavyBeam(ctx,x0,y0,x1,y1,col){
  const al=P.intensity/100; if(al<=0) return;
  const dx=x1-x0,dy=y1-y0, L=Math.hypot(dx,dy)||1, ux=dx/L,uy=dy/L, pxv=-uy,pyv=ux;
  const w=clamp(L*0.06,22,46);
  const gr=ctx.createLinearGradient(x0,y0,x1,y1);
  gr.addColorStop(0,rgba(col,0.08+0.16*al)); gr.addColorStop(1,rgba(col,0.16+0.42*al));
  poly(ctx,[[x0+pxv*w/2,y0+pyv*w/2],[x1+pxv*w/2,y1+pyv*w/2],[x1-pxv*w/2,y1-pyv*w/2],[x0-pxv*w/2,y0-pyv*w/2]],gr);
  // onda (numero di cicli ∝ frequenza → λ corta a ν alta)
  const cycles=clamp(Math.round(P.nu*0.7),3,18), A=w*0.30, k=2*Math.PI*cycles/L, seg=Math.max(60,cycles*12);
  ctx.strokeStyle=rgb(col); ctx.lineWidth=3.2; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.beginPath();
  for(let i=0;i<=seg;i++){ const s=L*i/seg, off=A*Math.sin(k*s - tAnim*7);
    const X=x0+ux*s+pxv*off, Y=y0+uy*s+pyv*off; i?ctx.lineTo(X,Y):ctx.moveTo(X,Y); }
  ctx.stroke();
}

// ═══ Rendering ════════════════════════════════════════════════════════════════
function draw(canvas){
  const [ctx, W, H] = Lab.ctx2d(canvas);
  T=pal();
  ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  geom(W,H);
  const lc=wlRGB(lambdaNm());
  if(P.view==='tube') drawTubeMode(ctx,lc); else drawPlateMode(ctx,lc);
  drawEnergyDiagram(ctx);
  drawHeader(ctx,W,H);
}

function drawTubeMode(ctx,lc){
  const cyA=G.tubeY0+9, cyB=G.tubeY1-9;
  // ampolla
  ctx.fillStyle=T.tube; roundRect(ctx,G.tubeX0,G.tubeY0,G.tubeX1-G.tubeX0,G.tubeY1-G.tubeY0,14); ctx.fill();
  ctx.strokeStyle=T.tubeEdge; ctx.lineWidth=2; ctx.stroke();
  ctx.fillStyle=T.sub; ctx.font='9px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillText('tubo a vuoto', (G.tubeX0+G.tubeX1)/2, G.tubeY0-7);
  // fascio dal margine sinistro al catodo
  drawWavyBeam(ctx, 0, G.cy, G.catX-3, G.cy, lc);
  // catodo
  ctx.fillStyle=T.metal; ctx.fillRect(G.catX-5,cyA,7,cyB-cyA);
  ctx.fillStyle=rgba(lc,0.55); ctx.fillRect(G.catX-5,cyA,3,cyB-cyA);
  ctx.fillStyle=T.sub; ctx.font='9px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText('CATODO', G.catX, cyB+13);
  ctx.fillStyle=T.accent; ctx.font='bold 9px "Space Mono",monospace'; ctx.fillText(MAT[P.mat].name, G.catX, cyB+24);
  // anodo
  ctx.fillStyle=T.metalD; ctx.fillRect(G.anoX-2,cyA,7,cyB-cyA);
  ctx.fillStyle=T.sub; ctx.font='9px "Space Mono",monospace'; ctx.fillText('ANODO', G.anoX, cyB+13);
  // elettroni
  for(const e of electrons){ const x=G.catX+(G.anoX-G.catX)*e.frac;
    ctx.fillStyle=rgba(T.elec,0.95); ctx.beginPath(); ctx.arc(x,e.y,3,0,Math.PI*2); ctx.fill(); }
  if(!emits()){ ctx.fillStyle=rgba([255,110,90],0.9); ctx.font='bold 11px "Space Mono",monospace'; ctx.textAlign='center';
    ctx.fillText('ν < ν₀ : nessuna emissione (qualunque intensità)', (G.tubeX0+G.tubeX1)/2, G.cy-2); }
  drawCircuit(ctx);
}

function drawPlateMode(ctx,lc){
  const s=G.slab, o=[s.ox,s.oy];
  const P0=o, P1=[o[0]+s.Rx,o[1]+s.Ry], P2=[o[0]+s.Rx+s.Dx,o[1]+s.Ry+s.Dy], P3=[o[0]+s.Dx,o[1]+s.Dy];
  const dn=s.Th;
  // facce metalliche (front, right, top)
  poly(ctx,[P0,P1,[P1[0],P1[1]+dn],[P0[0],P0[1]+dn]], vgrad(ctx,P0[1],P0[1]+dn, dk()?'#aab4c0':'#c9d0d8', dk()?'#5f6873':'#8b95a1'), T.tubeEdge,1.2);
  poly(ctx,[P1,P2,[P2[0],P2[1]+dn],[P1[0],P1[1]+dn]], vgrad(ctx,P1[1],P1[1]+dn, dk()?'#7e8894':'#9aa4b0', dk()?'#474f59':'#6c7682'), T.tubeEdge,1.2);
  const topG=ctx.createLinearGradient(P0[0],P0[1],P2[0],P2[1]);
  topG.addColorStop(0, dk()?'#c4ccd6':'#e6eaef'); topG.addColorStop(0.5, dk()?'#9aa4b0':'#cfd5dc'); topG.addColorStop(1, dk()?'#aeb7c2':'#dde1e7');
  poly(ctx,[P0,P1,P2,P3], topG, T.tubeEdge,1.2);
  // striature di riflesso sul top
  ctx.save(); poly(ctx,[P0,P1,P2,P3]); ctx.clip();
  ctx.strokeStyle='rgba(255,255,255,0.25)'; ctx.lineWidth=6;
  for(let i=-2;i<6;i++){ const t=i*0.18; ctx.beginPath();
    ctx.moveTo(P0[0]+s.Rx*t,P0[1]+s.Ry*t); ctx.lineTo(P0[0]+s.Rx*t+s.Dx,P0[1]+s.Ry*t+s.Dy); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle=T.sub; ctx.font='9px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillText('LASTRA · '+MAT[P.mat].name, (P0[0]+P2[0])/2, P0[1]+dn+16);

  // fascio ondulato dal margine SINISTRO, fermandosi appena sopra la superficie
  const al=P.intensity/100;
  const bdx=G.impactX-0, bdy=G.impactY-G.H*0.07, bl=Math.hypot(bdx,bdy)||1;
  drawWavyBeam(ctx, 0, G.H*0.07, G.impactX-bdx/bl*10, G.impactY-bdy/bl*10, lc);
  // zona d'impatto: macchia luminosa ellittica orientata col piano della lastra
  if(P.intensity>0){
    const ang=Math.atan2(s.Ry,s.Rx);
    ctx.save(); ctx.translate(G.impactX,G.impactY); ctx.rotate(ang);
    let gl=ctx.createRadialGradient(0,0,1,0,0,40);
    gl.addColorStop(0,rgba(lc,0.55*al+0.15)); gl.addColorStop(0.45,rgba(lc,0.22*al)); gl.addColorStop(1,rgba(lc,0));
    ctx.fillStyle=gl; ctx.beginPath(); ctx.ellipse(0,0,40,15,0,0,Math.PI*2); ctx.fill();
    // nucleo brillante
    gl=ctx.createRadialGradient(0,0,0,0,0,12);
    gl.addColorStop(0,rgba([255,255,255],0.7*al)); gl.addColorStop(1,rgba(lc,0));
    ctx.fillStyle=gl; ctx.beginPath(); ctx.ellipse(0,0,12,6,0,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // elettroni espulsi
  for(const e of electrons){ ctx.fillStyle=rgba(T.elec, Math.max(0.2,e.life));
    ctx.beginPath(); ctx.arc(e.x,e.y,3.4,0,Math.PI*2); ctx.fill(); }
  if(!emits()){ ctx.fillStyle=rgba([255,110,90],0.9); ctx.font='bold 11px "Space Mono",monospace'; ctx.textAlign='center';
    ctx.fillText('ν < ν₀ : nessuna emissione', G.impactX+90, G.impactY-40); }
}

function drawCircuit(ctx){
  const yB=G.tubeY1+50, cyA=G.tubeY1-9;
  ctx.strokeStyle=T.wire; ctx.lineWidth=2; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(G.anoX,cyA); ctx.lineTo(G.anoX,yB); ctx.moveTo(G.catX,cyA); ctx.lineTo(G.catX,yB); ctx.stroke();
  const aX=G.anoX-(G.anoX-G.catX)*0.30, gX=G.catX+(G.anoX-G.catX)*0.30;
  ctx.beginPath(); ctx.moveTo(G.anoX,yB); ctx.lineTo(aX+16,yB); ctx.moveTo(aX-16,yB); ctx.lineTo(gX+18,yB); ctx.moveTo(gX-18,yB); ctx.lineTo(G.catX,yB); ctx.stroke();
  // amperometro
  ctx.fillStyle=T.gBg; ctx.beginPath(); ctx.arc(aX,yB,16,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=rgb(T.cur); ctx.lineWidth=1.8; ctx.stroke();
  const I=current(); const ang=-Math.PI/2+(I-0.5)*1.6;
  ctx.strokeStyle=rgb(T.cur); ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(aX,yB); ctx.lineTo(aX+12*Math.cos(ang),yB+12*Math.sin(ang)); ctx.stroke();
  ctx.fillStyle=rgb(T.cur); ctx.font='bold 11px "Space Mono",monospace'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('A',aX,yB+0.5); ctx.textBaseline='alphabetic';
  // generatore variabile
  ctx.strokeStyle=T.wire; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(gX-7,yB-10); ctx.lineTo(gX-7,yB+10); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(gX+7,yB-6); ctx.lineTo(gX+7,yB+6); ctx.stroke();
  ctx.strokeStyle=rgb(T.cur); ctx.lineWidth=1; ctx.beginPath(); ctx.arc(gX,yB,18,0,Math.PI*2); ctx.stroke();
  ctx.fillStyle=T.txt; ctx.font='10px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText(`${P.V>=0?'+':''}${Lab.fmt(P.V,2)} V`, gX, yB+34);
  if(I>0.01) drawFlow(ctx,yB,I,aX,gX);
  ctx.fillStyle=T.sub; ctx.font='9px "Space Mono",monospace'; ctx.fillText('amperometro',aX,yB-24); ctx.fillText('generatore variabile',gX,yB-24);
}
function drawFlow(ctx,yB,I,aX,gX){
  const segs=[[G.anoX,G.tubeY1-9,G.anoX,yB],[G.anoX,yB,G.catX,yB],[G.catX,yB,G.catX,G.tubeY1-9]];
  let total=0; const len=segs.map(s=>{const l=Math.hypot(s[2]-s[0],s[3]-s[1]); total+=l; return l;});
  const ph=(tAnim*60*I)%total; ctx.fillStyle=rgb(T.cur); const N=Math.round(total/26);
  for(let k=0;k<N;k++){ let s=(ph+k*total/N)%total;
    for(let i=0;i<segs.length;i++){ if(s<=len[i]){ const f=s/len[i],sg=segs[i];
      const x=sg[0]+(sg[2]-sg[0])*f, y=sg[1]+(sg[3]-sg[1])*f;
      // i pallini non vengono disegnati sopra i componenti (amperometro / generatore)
      if(Math.hypot(x-aX,y-yB)>20 && Math.hypot(x-gX,y-yB)>22){
        ctx.beginPath(); ctx.arc(x,y,2,0,Math.PI*2); ctx.fill(); }
      break; } s-=len[i]; } }
}

function drawEnergyDiagram(ctx){
  const x=G.W*0.83, y0=G.H*0.10, y1=G.H*0.45, h=y1-y0, w=G.W*0.12;
  const Emax=Math.max(photonE(),phi(),1)*1.15, sc=h/Emax;
  ctx.strokeStyle=T.gAxis; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(x,y0); ctx.lineTo(x,y1); ctx.lineTo(x+w,y1); ctx.stroke();
  ctx.fillStyle=T.sub; ctx.font='9px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('energia (eV)', x-2, y0-6);
  const bw=w*0.46, bx=x+w*0.26, ph=phi()*sc, k=Kmax()*sc;
  ctx.fillStyle=rgba(T.phi,0.85); ctx.fillRect(bx,y1-ph,bw,ph);
  if(k>0){ ctx.fillStyle=rgba(T.kcol,0.9); ctx.fillRect(bx,y1-ph-k,bw,k); }
  const ey=y1-photonE()*sc, lc=wlRGB(lambdaNm());
  ctx.strokeStyle=rgb(lc); ctx.lineWidth=2.5; ctx.setLineDash([4,3]); ctx.beginPath(); ctx.moveTo(bx-8,ey); ctx.lineTo(bx+bw+8,ey); ctx.stroke(); ctx.setLineDash([]);
  ctx.font='8px "Space Mono",monospace'; ctx.textAlign='left';
  ctx.fillStyle=rgb(lc); ctx.fillText(`hν=${Lab.fmt(photonE(),2)}`, bx+bw+10, ey+3);
  ctx.fillStyle=rgb(T.phi); ctx.fillText(`φ=${Lab.fmt(phi(),2)}`, bx+bw+10, y1-ph+3);
  if(k>0){ ctx.fillStyle=rgb(T.kcol); ctx.fillText(`K=${Lab.fmt(Kmax(),2)}`, bx+bw+10, y1-ph-k+3); }
  ctx.fillStyle=T.sub; ctx.textAlign='center'; ctx.fillText('hν = φ + K_max', x+w/2, y1+13);
}

function drawHeader(ctx,W,H){
  ctx.textAlign='left'; ctx.fillStyle=T.accent; ctx.font='bold 14px "Space Mono",monospace';
  ctx.fillText('Effetto fotoelettrico:  K_max = hν − φ', 14, 24);
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace';
  ctx.fillText(`ν = ${Lab.fmt(P.nu,2)}·10¹⁴ Hz   λ = ${Lab.fmt(lambdaNm(),0)} nm   intensità ${P.intensity}%`, 14, 40);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
// 1: caratteristica corrente–tensione: satura per V > 0, si annulla alla tensione d'arresto −V₀
function drawIV(){
  const v0=V0(), Isat=P.intensity;
  const Iat=v=>{ if(!emits())return 0; if(v>=0)return Isat; if(v0<=1e-6)return 0; return Isat*clamp(1-(-v)/v0,0,1); };
  const g=Lab.panel(gCanvas[0],{ title:'Corrente (% del massimo) in funzione della tensione', xr:[-3,3], xStep:1, yr:[0,100], yStep:25, xLabel:'tensione V (volt)' });
  if(!g) return; const [ctx,f]=g;
  if(emits()){ ctx.save(); ctx.setLineDash([3,3]); ctx.strokeStyle='rgba(255,110,90,0.8)'; ctx.beginPath(); ctx.moveTo(f.X(-v0),f.T); ctx.lineTo(f.X(-v0),f.B); ctx.stroke(); ctx.restore();
    ctx.fillStyle='rgba(255,130,110,0.95)'; ctx.font='9.5px "DM Sans",sans-serif'; ctx.textAlign='right'; ctx.textBaseline='middle'; ctx.fillText(`−V₀ = −${Lab.fmt(v0,2)} V`,f.X(-v0)-4,f.T+8); }
  Lab.plot(ctx,f,Iat,[-3,3],rgb(T.cur),2,[],300);
  Lab.dot(ctx,f,P.V,Iat(P.V),T.accent,4.5);
}
// 2: energia cinetica massima K = hν − φ: retta di pendenza h (uguale per ogni metallo), parte dalla soglia ν₀
function drawKnu(){
  const numax=16, n0=nu0();
  const g=Lab.panel(gCanvas[1],{ title:'Energia cinetica massima K (eV)', xr:[0,numax], xStep:2, yr:[0,Lab.niceMax(Math.max(0.5,h_eV*numax*1e14-phi()))], xLabel:'frequenza ν (10¹⁴ Hz)' });
  if(!g) return; const [ctx,f]=g;
  Lab.plot(ctx,f,n=>n<n0?0:h_eV*n*1e14-phi(),[0,numax],rgb(T.kcol),2,[],300);
  ctx.save(); ctx.setLineDash([3,3]); ctx.strokeStyle=f.C.text; ctx.beginPath(); ctx.moveTo(f.X(n0),f.T); ctx.lineTo(f.X(n0),f.B); ctx.stroke(); ctx.restore();
  ctx.fillStyle=f.C.text; ctx.font='9.5px "DM Sans",sans-serif'; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText(`soglia ν₀ = ${Lab.fmt(n0,2)}·10¹⁴ Hz`,f.X(n0)+4,f.T+8);
  Lab.dot(ctx,f,P.nu,Kmax(),T.accent,4.5);
}
// 3: la corrente di saturazione è proporzionale all'intensità (numero di fotoni), ma solo sopra soglia
function drawIint(){
  const g=Lab.panel(gCanvas[2],{ title:'Corrente di saturazione (% del massimo)', xr:[0,100], xStep:25, yr:[0,100], yStep:25, xLabel:'intensità della luce (%)' });
  if(!g) return; const [ctx,f]=g;
  Lab.plot(ctx,f,i=>emits()?i:0,[0,100],emits()?rgb(T.cur):f.C.text,2);
  Lab.dot(ctx,f,P.intensity,emits()?P.intensity:0,T.accent,4.5);
  if(!emits()){ ctx.fillStyle=f.C.text; ctx.font='9.5px "DM Sans",sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('sotto soglia: nessun elettrone, a qualunque intensità',(f.L+f.R)/2,f.T+14); }
}
function drawGraphs(){ drawIV(); drawKnu(); drawIint(); }

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls(){
  const cont=document.getElementById('controls'); cont.innerHTML='';
  const secA=Lab.Section('Apparato');
  cont.appendChild(secA.el);
  secA.add(Lab.RadioGroup({ label:'Vista', options:[{value:'tube',label:'Tubo a vuoto'},{value:'plate',label:'Lastra'}],
    value:P.view, onChange(v){ P.view=v; electrons=[]; spawnAcc=0; } }));
  const secR=Lab.Section('Radiazione');
  cont.appendChild(secR.el);
  secR.add(Lab.Slider({ label:'Frequenza ν', min:1, max:16, step:0.1, value:P.nu, unit:'·10¹⁴ Hz', onChange(v){P.nu=v;} }));
  secR.add(Lab.Slider({ label:'Intensità', min:0, max:100, step:5, value:P.intensity, unit:' %', onChange(v){P.intensity=v;} }));
  const secM=Lab.Section('Catodo');
  cont.appendChild(secM.el);
  secM.add(Lab.RadioGroup({ label:'Materiale (lavoro di estrazione φ)',
    options:Object.keys(MAT).map(k=>({value:k, label:MAT[k].name, hint:Lab.fmt(MAT[k].phi,2)+' eV'})),
    value:P.mat, onChange(v){ P.mat=v; } }));
  const secV=Lab.Section('Tensione (tubo)');
  cont.appendChild(secV.el);
  secV.add(Lab.Slider({ label:'Tensione anodo V', min:-3, max:3, step:0.05, value:P.V, unit:' V', onChange(v){P.V=v;} }));
}

function initGraphs() {
  // riga di grafici standard; i titoli sono disegnati dentro i grafici
  gCanvas = Lab.graphPanels(document.getElementById('graphArea'), 3);
  gCtx = gCanvas.map(c => c.getContext('2d'));
}

// ═══ Init ═════════════════════════════════════════════════════════════════════
function init(){
  Lab.initTheme();
  buildControls();
  initGraphs();
  const simCanvas=document.getElementById('simCanvas');
  readout=new Lab.Readout(document.getElementById('readout'),[
    {key:'E',  label:'energia del fotone hν'},
    {key:'phi',label:'lavoro di estrazione φ'},
    {key:'k',  label:'energia cinetica massima'},
    {key:'nu0',label:'frequenza di soglia ν₀'},
    {key:'v0', label:'tensione d’arresto V₀'},
    {key:'I',  label:'corrente'},
  ]);
  const btnStop=document.getElementById('btnStop');
  btnStop.addEventListener('click',()=>{ P.V = emits()? -V0() : 0; buildControls(); });
  document.getElementById('btnReset').addEventListener('click',()=>{
    P.nu=8; P.intensity=60; P.mat='sodio'; P.V=0.5; P.paused=false; electrons=[]; spawnAcc=0; buildControls();
  });

  function resize(){
    const area=document.querySelector('.lab-canvas-area'); if(!area)return;
    const ar=area.getBoundingClientRect();
    const rb=document.getElementById('readout').getBoundingClientRect();
    const ga=document.getElementById('graphArea'); const gaH=ga?ga.offsetHeight:0;
    const h=Math.max(240,Math.floor(ar.height-rb.height-gaH-4));
    Lab.hidpi(simCanvas, Math.floor(ar.width), h);
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
    step(dt);
    draw(simCanvas);
    drawGraphs();
    readout.set('E', Lab.fmt(photonE(),2)+' eV');
    readout.set('phi', Lab.fmt(phi(),2)+' eV');
    readout.set('k', emits()? Lab.fmt(Kmax(),2)+' eV' : '0 (no emiss.)');
    readout.set('nu0', Lab.fmt(nu0(),2)+'·10¹⁴ Hz');
    readout.set('v0', emits()? Lab.fmt(V0(),2)+' V' : '—');
    readout.set('I', emits()? Lab.fmt((current()*100),0)+' % I_sat' : '0');
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
