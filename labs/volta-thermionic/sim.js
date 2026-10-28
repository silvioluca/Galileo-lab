'use strict';

// ═══ Stato ════════════════════════════════════════════════════════════════════
const MAT = {
  Cs:{name:'Cesio',     phi:2.10, col:[200,205,210]},
  Na:{name:'Sodio',     phi:2.28, col:[190,195,205]},
  Ca:{name:'Calcio',    phi:2.87, col:[170,178,188]},
  W :{name:'Tungsteno', phi:4.55, col:[150,158,168]},
  Cu:{name:'Rame',      phi:4.70, col:[184,115,51]},
  Pt:{name:'Platino',   phi:6.35, col:[212,216,222]},
};
const P = {
  mode:'volta',
  matA:'Na', matB:'Cu', matC:'Ca', three:false,
  T: 2000, V: 1.0,
  paused:false,
};
const e0=1.602e-19, kB=1.381e-23, A_R=1.2e6;

let tAnim=0, last=0;
let voltDots=[], cross=[], emit=[], spawnAcc=0, eFlow=0;
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
    edge:  d?'rgba(225,235,248,0.55)':'rgba(40,60,90,0.6)',
    tube:  d?'rgba(150,180,215,0.08)':'rgba(120,150,195,0.12)',
    elec:  [90,170,255],
    plus:  [255,110,90],
    minus: [90,170,255],
    cur:   [255,205,70],
    vac:   d?'rgba(190,210,235,0.7)':'rgba(50,80,120,0.7)',
    fermi: [95,225,140],
    wire:  d?'rgba(185,205,230,0.8)':'rgba(60,90,125,0.85)',
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
function shade(c,f){ return [clamp(Math.round(c[0]*f),0,255),clamp(Math.round(c[1]*f),0,255),clamp(Math.round(c[2]*f),0,255)]; }

// ═══ Fisica ═══════════════════════════════════════════════════════════════════
function metals(){ return P.three? [P.matA,P.matB,P.matC] : [P.matA,P.matB]; }
function phiOf(k){ return MAT[k].phi; }
function Vtotal(){ const l=metals(); return phiOf(l[l.length-1])-phiOf(l[0]); }   // d.d.p. estremi (V)
function richardson(Tk,phi){ return A_R*Tk*Tk*Math.exp(-phi*e0/(kB*Tk)); }
function Jemit(){ return richardson(P.T, phiOf(P.matA)); }
function diodeI(V){
  const Is=Jemit();
  if(V>=0) return Is*Math.min(1, Math.pow(Math.max(0,V)/0.8,1.5));   // spazio di carica → saturazione
  const Vth=Math.max(0.05, kB*P.T/e0);                               // frenante (esponenziale)
  return Is*Math.exp(V/Vth);
}
function hotColor(Tk){
  const t=clamp((Tk-700)/2300,0,1);
  return [clamp(Math.round(120+135*t),0,255), clamp(Math.round(20+205*t),0,255), clamp(Math.round(-40+280*t*t),0,255)];
}

// ═══ Geometria ════════════════════════════════════════════════════════════════
let G={};
function geomVolta(W,H){
  const list=metals(), N=list.length;
  const y0=H*0.30, y1=H*0.64, total=W*0.56, x0=W*0.05, bw=total/N;
  const blocks=[]; for(let i=0;i<N;i++) blocks.push({x0:x0+i*bw, x1:x0+(i+1)*bw, k:list[i]});
  G={mode:'volta', y0,y1, blocks, W,H};
}
function geomTherm(W,H){
  const x0=W*0.15, x1=W*0.83, y0=H*0.16, y1=H*0.50, cy=(y0+y1)/2;
  const filX=x0+(x1-x0)*0.15, anoX=x0+(x1-x0)*0.86;
  G={mode:'thermionic', tx0:x0,tx1:x1,ty0:y0,ty1:y1, cy, filX, anoX, W,H};
}
function initSim(){
  voltDots=[]; cross=[]; emit=[]; spawnAcc=0;
  if(!G.W) return;
  if(P.mode==='volta'){
    geomVolta(G.W,G.H);                       // assicura la geometria corretta prima di usarla
    for(const b of G.blocks){ const arr=[]; for(let i=0;i<26;i++) arr.push(rnd(b)); voltDots.push(arr); }
  } else { geomTherm(G.W,G.H); }
}
function rnd(b){ return {x:b.x0+6+Math.random()*(b.x1-b.x0-12), y:G.y0+6+Math.random()*(G.y1-G.y0-12), vx:(Math.random()-0.5)*2.4, vy:(Math.random()-0.5)*2.4}; }
// mantiene gli array di elettroni allineati al numero di blocchi (evita crash al cambio catena)
function ensureDots(){
  if(!G.blocks) return;
  if(voltDots.length!==G.blocks.length){
    voltDots=[]; for(const b of G.blocks){ const a=[]; for(let i=0;i<26;i++) a.push(rnd(b)); voltDots.push(a); }
  }
}

function step(dt){
  if(P.paused) return;
  if(G.W){ if(P.mode==='volta') geomVolta(G.W,G.H); else geomTherm(G.W,G.H); }  // geometria sempre coerente con la modalità
  const dtf=Math.min(dt,0.05)*60;
  if(P.mode==='volta'){ ensureDots(); stepVolta(dtf); } else stepTherm(dtf);
}
function bounce(d,b,dtf){ d.x+=d.vx*dtf; d.y+=d.vy*dtf;
  if(d.x<b.x0+5){d.x=b.x0+5;d.vx=Math.abs(d.vx);} if(d.x>b.x1-5){d.x=b.x1-5;d.vx=-Math.abs(d.vx);}
  if(d.y<G.y0+5){d.y=G.y0+5;d.vy=Math.abs(d.vy);} if(d.y>G.y1-5){d.y=G.y1-5;d.vy=-Math.abs(d.vy);}
}
function stepVolta(dtf){
  for(let i=0;i<G.blocks.length;i++) for(const d of (voltDots[i]||[])) bounce(d,G.blocks[i],dtf);
  // trasferimento a ogni giunzione: verso il metallo a φ maggiore
  for(let j=0;j<G.blocks.length-1;j++){
    const dphi=phiOf(G.blocks[j+1].k)-phiOf(G.blocks[j].k);
    if(Math.abs(dphi)<0.02) continue;
    spawnAcc += Math.min(0.4, Math.abs(dphi)*0.05)*dtf;
  }
  while(spawnAcc>=1){ spawnAcc-=1;
    const j=Math.floor(Math.random()*(G.blocks.length-1));
    const dphi=phiOf(G.blocks[j+1].k)-phiOf(G.blocks[j].k);
    if(Math.abs(dphi)>0.02){ const jx=G.blocks[j].x1;
      cross.push({x:jx, y:G.y0+10+Math.random()*(G.y1-G.y0-20), dir:dphi>0?1:-1, t:0}); }
  }
  for(const c of cross){ c.x+=c.dir*2.0*dtf; c.t+=dtf; }
  const xL=G.blocks[0].x0+2, xR=G.blocks[G.blocks.length-1].x1-2;
  cross=cross.filter(c=> c.t<55 && c.x>xL && c.x<xR);   // resta dentro i metalli
}
function stepTherm(dtf){
  eFlow += dtf;
  const I=diodeI(P.V), rate=clamp(I/4000,0,1.5);
  spawnAcc += rate*1.6*dtf;
  while(spawnAcc>=1){ spawnAcc-=1; if(rate>0.001){
    const ang=(Math.random()-0.5)*1.1;
    emit.push({x:G.filX+4, y:G.cy+(Math.random()-0.5)*(G.ty1-G.ty0)*0.5, vx:1.2+Math.random()*1.6, vy:Math.sin(ang)*1.0, life:1});
  }}
  const acc = P.V>=0 ? 1+P.V*0.25 : Math.max(0.2,1+P.V*0.5);   // accelerazione/frenata
  for(const e of emit){ e.x+=e.vx*acc*dtf; e.y+=e.vy*dtf;
    if(P.V<-0.3 && e.x>G.filX+(G.anoX-G.filX)*0.55) e.vx-=0.05*dtf*(-P.V);   // frenata: rallenta/torna
    if(e.x>=G.anoX-3){ e.dead=true; } if(e.x<G.filX || e.x>G.W||e.life<=0){ e.dead=true; } e.life-=0.004*dtf; }
  emit=emit.filter(e=>!e.dead);
  if(emit.length>200) emit.splice(0,emit.length-200);
}

// ═══ Rendering ════════════════════════════════════════════════════════════════
function roundRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }

function draw(canvas){
  const [ctx, W, H] = Lab.ctx2d(canvas);
  T=pal();
  ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  if(P.mode==='volta'){ geomVolta(W,H); ensureDots(); drawVolta(ctx); } else { geomTherm(W,H); drawTherm(ctx); }
}

function drawVolta(ctx){
  // blocchi
  for(const b of G.blocks){ const c=MAT[b.k].col;
    const g=ctx.createLinearGradient(0,G.y0,0,G.y1);
    g.addColorStop(0,rgb(shade(c,0.7))); g.addColorStop(0.4,rgb(shade(c,1.1))); g.addColorStop(1,rgb(shade(c,0.6)));
    ctx.fillStyle=g; ctx.fillRect(b.x0,G.y0,b.x1-b.x0,G.y1-G.y0);
    ctx.strokeStyle=T.edge; ctx.lineWidth=1.4; ctx.strokeRect(b.x0,G.y0,b.x1-b.x0,G.y1-G.y0);
    ctx.fillStyle=T.txt; ctx.font='bold 10px "Space Mono",monospace'; ctx.textAlign='center';
    ctx.fillText(MAT[b.k].name, (b.x0+b.x1)/2, G.y1+15);
    ctx.fillStyle=T.sub; ctx.font='9px "Space Mono",monospace'; ctx.fillText('φ='+Lab.fmt(phiOf(b.k),2), (b.x0+b.x1)/2, G.y1+27);
  }
  // elettroni
  for(let i=0;i<G.blocks.length;i++) for(const d of (voltDots[i]||[])){ ctx.fillStyle=rgba(T.elec,0.9); ctx.beginPath(); ctx.arc(d.x,d.y,2.5,0,Math.PI*2); ctx.fill(); }
  for(const c of cross){ ctx.fillStyle=rgb(T.elec); ctx.beginPath(); ctx.arc(c.x,c.y,3,0,Math.PI*2); ctx.fill(); }
  // giunzioni: segni + frecce
  for(let j=0;j<G.blocks.length-1;j++){
    const jx=G.blocks[j].x1, dphi=phiOf(G.blocks[j+1].k)-phiOf(G.blocks[j].k);
    ctx.strokeStyle=rgba([255,255,255],0.4); ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(jx,G.y0); ctx.lineTo(jx,G.y1); ctx.stroke();
    if(Math.abs(dphi)<0.02) continue;
    const leftPlus = dphi>0;   // φ destra > φ sinistra → sinistra +, destra −
    const nm=Math.round(clamp(Math.abs(dphi)*2,1,5));
    ctx.font='bold 13px "Space Mono",monospace'; ctx.textBaseline='middle';
    for(let i=0;i<nm;i++){ const y=G.y0+16+(G.y1-G.y0-32)*i/Math.max(1,nm-1);
      ctx.fillStyle=rgb(leftPlus?T.plus:T.minus); ctx.textAlign='right'; ctx.fillText(leftPlus?'+':'−', jx-5, y);
      ctx.fillStyle=rgb(leftPlus?T.minus:T.plus); ctx.textAlign='left';  ctx.fillText(leftPlus?'−':'+', jx+5, y);
    }
    ctx.textBaseline='alphabetic';
  }
  // diagramma a bande
  drawBands(ctx);
  // intestazione
  ctx.textAlign='left'; ctx.fillStyle=T.accent; ctx.font='bold 14px "Space Mono",monospace';
  ctx.fillText('Effetto Volta:  V(estremi) = (φ_ultimo − φ_primo)/e', 14, 24);
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace';
  ctx.fillText('Legge di Volta: la d.d.p. tra gli estremi dipende solo dai metalli alle estremità, non da quelli intermedi.', 14, 40);
}

function drawBands(ctx){
  const list=G.blocks.map(b=>b.k), N=list.length;
  const x=G.W*0.66, w=G.W*0.30, y0=G.y0, y1=G.y1, h=y1-y0;
  const maxPhi=Math.max.apply(null,list.map(phiOf))*1.25, sc=h/maxPhi;
  ctx.strokeStyle=T.vac; ctx.lineWidth=1.5; ctx.setLineDash([4,3]);
  ctx.beginPath(); ctx.moveTo(x,y0); ctx.lineTo(x+w,y0); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle=T.sub; ctx.font='8px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('vuoto', x+2, y0-4);
  const colW=w/N*0.6;
  list.forEach((k,i)=>{ const px=x+w*(i+0.5)/N-colW/2, phi=phiOf(k), fy=y0+phi*sc, c=MAT[k].col;
    ctx.fillStyle=rgba(c,0.5); ctx.fillRect(px,fy,colW,y1-fy);
    ctx.strokeStyle=rgb(T.fermi); ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(px,fy); ctx.lineTo(px+colW,fy); ctx.stroke();
    ctx.fillStyle=T.txt; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText(Lab.fmt(phi,2), px+colW/2, fy-3);
  });
  ctx.fillStyle=rgb(T.fermi); ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('E_F', x+w-22, y0+6);
}

function drawTherm(ctx){
  const hc=hotColor(P.T);
  // ampolla
  ctx.fillStyle=T.tube; roundRect(ctx,G.tx0,G.ty0,G.tx1-G.tx0,G.ty1-G.ty0,14); ctx.fill();
  ctx.strokeStyle=T.edge; ctx.lineWidth=2; ctx.stroke();
  ctx.fillStyle=T.sub; ctx.font='9px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText('tubo a vuoto', (G.tx0+G.tx1)/2, G.ty0-7);
  // alone di calore
  const gl=ctx.createRadialGradient(G.filX,G.cy,3,G.filX,G.cy,(G.ty1-G.ty0)*0.8);
  gl.addColorStop(0,rgba(hc,0.45)); gl.addColorStop(1,rgba(hc,0));
  ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(G.filX,G.cy,(G.ty1-G.ty0)*0.8,0,Math.PI*2); ctx.fill();
  // FILAMENTO a spirale (come una lampadina)
  drawFilament(ctx,G.filX,G.ty0+14,G.ty1-14,hc);
  ctx.fillStyle=T.sub; ctx.font='9px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillText('FILAMENTO ('+MAT[P.matA].name+')', G.filX, G.ty1+13);
  // anodo
  ctx.fillStyle=dk()?'#5d6b7e':'#7c889a'; ctx.fillRect(G.anoX-2,G.ty0+10,7,(G.ty1-G.ty0)-20);
  ctx.fillStyle=T.sub; ctx.fillText('ANODO', G.anoX+2, G.ty1+13);
  // elettroni
  for(const e of emit){ ctx.fillStyle=rgba(T.elec,Math.max(0.3,e.life)); ctx.beginPath(); ctx.arc(e.x,e.y,2.8,0,Math.PI*2); ctx.fill(); }
  // circuito con tensione variabile + amperometro
  drawCircuit(ctx);
  // intestazione
  ctx.textAlign='left'; ctx.fillStyle=T.accent; ctx.font='bold 14px "Space Mono",monospace';
  ctx.fillText('Effetto termoionico:  J = A·T²·e^(−φ/kT)', 14, 24);
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace';
  ctx.fillText(`T = ${P.T} K   φ = ${Lab.fmt(phiOf(P.matA),2)} eV   J_sat = ${fmtJ(Jemit())}`, 14, 40);
}
function drawFilament(ctx,x,y0,y1,hc){
  const n=8, amp=8, seg=n*10;
  ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.strokeStyle=rgb(shade(hc,0.9)); ctx.lineWidth=4; ctx.beginPath();
  for(let i=0;i<=seg;i++){ const t=i/seg, yy=y0+(y1-y0)*t, xx=x+Math.sin(t*n*Math.PI*2)*amp; i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy); }
  ctx.stroke();
  ctx.strokeStyle=rgb(shade(hc,1.4)); ctx.lineWidth=1.6; ctx.beginPath();
  for(let i=0;i<=seg;i++){ const t=i/seg, yy=y0+(y1-y0)*t, xx=x+Math.sin(t*n*Math.PI*2)*amp; i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy); }
  ctx.stroke();
  // morsetti del filamento
  ctx.strokeStyle=T.wire; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(x,y0); ctx.lineTo(x,y0-8); ctx.moveTo(x,y1); ctx.lineTo(x,y1+8); ctx.stroke();
}
function drawCircuit(ctx){
  const yB=G.ty1+50, cyA=G.ty1-10;
  ctx.strokeStyle=T.wire; ctx.lineWidth=2; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(G.anoX,cyA); ctx.lineTo(G.anoX,yB); ctx.moveTo(G.filX,G.ty1+8); ctx.lineTo(G.filX,yB); ctx.stroke();
  const aX=G.anoX-(G.anoX-G.filX)*0.30, gX=G.filX+(G.anoX-G.filX)*0.30;
  ctx.beginPath(); ctx.moveTo(G.anoX,yB); ctx.lineTo(aX+15,yB); ctx.moveTo(aX-15,yB); ctx.lineTo(gX+18,yB); ctx.moveTo(gX-18,yB); ctx.lineTo(G.filX,yB); ctx.stroke();
  // amperometro
  ctx.fillStyle=T.gBg; ctx.beginPath(); ctx.arc(aX,yB,15,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=rgb(T.cur); ctx.lineWidth=1.6; ctx.stroke();
  const I=clamp(diodeI(P.V)/Math.max(1,Jemit()),0,1), ang=-Math.PI/2+(I-0.5)*1.5;
  ctx.strokeStyle=rgb(T.cur); ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(aX,yB); ctx.lineTo(aX+11*Math.cos(ang),yB+11*Math.sin(ang)); ctx.stroke();
  ctx.fillStyle=rgb(T.cur); ctx.font='bold 10px "Space Mono",monospace'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('A',aX,yB+0.5); ctx.textBaseline='alphabetic';
  // generatore variabile
  ctx.strokeStyle=T.wire; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(gX-7,yB-9); ctx.lineTo(gX-7,yB+9); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(gX+7,yB-6); ctx.lineTo(gX+7,yB+6); ctx.stroke();
  ctx.strokeStyle=rgb(T.cur); ctx.lineWidth=1; ctx.beginPath(); ctx.arc(gX,yB,17,0,Math.PI*2); ctx.stroke();
  ctx.fillStyle=T.txt; ctx.font='10px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText(`${P.V>=0?'+':''}${Lab.fmt(P.V,2)} V`, gX, yB+32);
  ctx.fillStyle=T.sub; ctx.font='9px "Space Mono",monospace'; ctx.fillText('amperometro',aX,yB-22); ctx.fillText('tensione anodica',gX,yB-22);
  // flusso
  if(diodeI(P.V)>1){ const segs=[[G.anoX,cyA,G.anoX,yB],[G.anoX,yB,G.filX,yB],[G.filX,yB,G.filX,G.ty1+8]];
    let total=0; const len=segs.map(s=>{const l=Math.hypot(s[2]-s[0],s[3]-s[1]); total+=l; return l;});
    const ph=(tAnim*60*I)%total; ctx.fillStyle=rgb(T.cur); const N=Math.round(total/26);
    for(let k=0;k<N;k++){ let s=(ph+k*total/N)%total; for(let i=0;i<segs.length;i++){ if(s<=len[i]){ const f=s/len[i],sg=segs[i];
      const x=sg[0]+(sg[2]-sg[0])*f,y=sg[1]+(sg[3]-sg[1])*f; if(Math.hypot(x-aX,y-yB)>19&&Math.hypot(x-gX,y-yB)>21){ ctx.beginPath(); ctx.arc(x,y,2,0,Math.PI*2); ctx.fill(); } break; } s-=len[i]; } } }
}
function fmtJ(j){ if(j<1) return Lab.sci(j,3)+' A/m²'; if(j<1e4) return Lab.fmt(j,0)+' A/m²'; return Lab.fmt((j/1e4),1)+' A/cm²'; }

// ═══ Grafici ══════════════════════════════════════════════════════════════════
function setTitles(){}   // i titoli sono disegnati dentro i grafici
function drawGraphs(){ if(P.mode==='volta') graphsVolta(); else graphsTherm(); }

function graphsVolta(){
  const list=metals(), phi0=phiOf(list[0]), C=Lab.graphColors();
  // 1: d.d.p. fra gli estremi in funzione del lavoro di estrazione dell'ultimo metallo
  let g=Lab.panel(gCanvas[0],{ title:`V(estremi) = φ_ultimo − φ_primo (V), primo: ${list[0]}`, xr:[1.5,7], yr:[-5,5], yStep:2.5, xLabel:'φ dell\'ultimo metallo (eV)' });
  if(g){ const [ctx,f]=g;
    Lab.plot(ctx,f,p=>p-phi0,[1.5,7],C.accent,2);
    for(const k of Object.keys(MAT)) Lab.dot(ctx,f,phiOf(k),phiOf(k)-phi0,C.grid.replace(/[\d.]+\)$/,'0.5)'),2.5);
    Lab.dot(ctx,f,phiOf(list[list.length-1]),Vtotal(),rgb(T.plus),4.5);
  }
  // 2: livelli di Fermi sotto il livello del vuoto (energia = −φ), come nello schema della scena
  g=Lab.panel(gCanvas[1],{ title:'Livello di Fermi rispetto al vuoto (eV)', xr:[0,list.length], xStep:1e9, xFmt:()=> '', yr:[-7,0], yStep:1 });
  if(g){ const [ctx,f]=g;
    const gap=(f.R-f.L)/list.length, bw=gap*0.5;
    list.forEach((k,i)=>{ const cx=f.L+gap*(i+0.5), y=f.Y(-phiOf(k));
      ctx.fillStyle=rgba(MAT[k].col,0.85); ctx.fillRect(cx-bw/2,f.Y(0),bw,y-f.Y(0));
      ctx.strokeStyle=C.green; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(cx-bw/2,y); ctx.lineTo(cx+bw/2,y); ctx.stroke();
      ctx.font='9.5px "Space Mono",monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillStyle=C.title; ctx.fillText('−'+Lab.fmt(phiOf(k),2),cx,y+9);
      ctx.fillStyle=C.text; ctx.fillText(k,cx,f.B+10); });
  }
  // 3: potenziale lungo la catena di metalli (V_i = φ_primo − φ_i), a gradini alle giunzioni
  g=Lab.panel(gCanvas[2],{ title:'Potenziale lungo la catena (V)', xr:[0,list.length], xStep:1e9, xFmt:()=> '', yr:[-5,5], yStep:2.5 });
  if(g){ const [ctx,f]=g;
    const Vs=list.map(k=>phi0-phiOf(k)), N=list.length;
    const pts=[]; for(let i=0;i<N;i++){ pts.push([i,Vs[i]]); pts.push([i+1,Vs[i]]); }
    Lab.plotPts(ctx,f,pts,C.accent,2.2);
    ctx.font='9.5px "Space Mono",monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
    for(let i=0;i<N;i++){ ctx.fillStyle=rgb(MAT[list[i]].col); ctx.fillText(list[i],f.X(i+0.5),f.B+10);
      ctx.fillStyle=C.title; ctx.fillText(Lab.fmt(Vs[i],2),f.X(i+0.5),f.Y(Vs[i])+(Vs[i]>=0?-8:9)); }
  }
}

function graphsTherm(){
  const phi=phiOf(P.matA), C=Lab.graphColors();
  // 1: densità di corrente emessa J(T) (legge di Richardson–Dushman), scala log
  let g=Lab.panel(gCanvas[0],{ title:'Corrente emessa J (A/m²), scala log', xr:[300,3000], yr:[1e-4,1e10], yLog:true, xLabel:'T (K)', yFmt:v=>Lab.sci(v,1) });
  if(g){ const [ctx,f]=g;
    for(const k of Object.keys(MAT)) if(k!==P.matA) Lab.plot(ctx,f,t=>richardson(t,phiOf(k)),[300,3000],C.grid.replace(/[\d.]+\)$/,'0.35)'),1.2);
    Lab.plot(ctx,f,t=>richardson(t,phi),[300,3000],rgb(T.plus),2.2);
    Lab.dot(ctx,f,P.T,Jemit(),C.accent,4);
    Lab.legend(ctx,f.L+8,f.T+8,[[rgb(T.plus),`${MAT[P.matA].name}: J = A·T²·e^(−φ/kT)`]]);
  }
  // 2: caratteristica del diodo: tensione frenante (esponenziale), carica spaziale, saturazione
  const Js=Lab.niceMax(Math.max(1e-9,Jemit())*1.1);
  g=Lab.panel(gCanvas[1],{ title:'Caratteristica del diodo J(V) (A/m²)', xr:[-2,3], yr:[0,Js], xStep:1, xLabel:'V anodo (V)', yFmt:v=>Lab.sci(v,2) });
  if(g){ const [ctx,f]=g;
    ctx.save(); ctx.setLineDash([3,3]); ctx.strokeStyle=C.text; ctx.beginPath(); ctx.moveTo(f.L,f.Y(Jemit())); ctx.lineTo(f.R,f.Y(Jemit())); ctx.stroke(); ctx.restore();
    Lab.plot(ctx,f,diodeI,[-2,3],rgb(T.cur),2.2);
    Lab.dot(ctx,f,P.V,diodeI(P.V),C.accent,4);
    Lab.legend(ctx,f.L+8,f.T+8,[[rgb(T.cur),'J(V)'],[C.text,'saturazione',[3,3]]]);
  }
  // 3: grafico di Richardson: ln(J/T²) contro 1/T è una retta di pendenza −φ/k
  const lnJ=t=>Math.log(A_R)-phi*e0/(kB*t);
  g=Lab.panel(gCanvas[2],{ title:'Richardson: ln(J/T²) contro 1000/T', xr:[1000/3000,1000/600], yr:[-120,20], yStep:20, xLabel:'1000/T (K⁻¹)', xFmt:v=>Lab.fmt(v,2) });
  if(g){ const [ctx,f]=g;
    Lab.plot(ctx,f,x=>lnJ(1000/x),[1000/3000,1000/600],rgb(T.plus),2.2);
    Lab.dot(ctx,f,1000/P.T,lnJ(P.T),C.accent,4);
    Lab.legend(ctx,f.L+8,f.T+8,[[rgb(T.plus),`pendenza −φ/k → φ = ${Lab.fmt(phi,2)} eV`]]);
  }
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
function matRadio(label,val,cb){ return Lab.RadioGroup({ label,
  options:Object.keys(MAT).map(k=>({value:k,label:MAT[k].name,hint:Lab.fmt(MAT[k].phi,2)+' eV'})), value:val, onChange:cb }); }
function reControls(){ setTimeout(buildControls,0); }   // rebuild differito → il menù si aggiorna sul click
function buildControls(){
  const cont=document.getElementById('controls'); cont.innerHTML='';
  const secM=Lab.Section('Effetto'); cont.appendChild(secM.el);
  secM.add(Lab.RadioGroup({ label:'Fenomeno', options:[{value:'volta',label:'Effetto Volta'},{value:'thermionic',label:'Effetto termoionico'}],
    value:P.mode, onChange(v){ if(v===P.mode)return; P.mode=v; setTitles(); initSim(); buildReadout(); reControls(); } }));
  if(P.mode==='volta'){
    const sa=Lab.Section('Metallo A'); cont.appendChild(sa.el); sa.add(matRadio('φ',P.matA,v=>{P.matA=v;}));
    const sb=Lab.Section('Metallo B'); cont.appendChild(sb.el); sb.add(matRadio('φ',P.matB,v=>{P.matB=v;}));
    const sc=Lab.Section('Catena'); cont.appendChild(sc.el);
    sc.add(Lab.Toggle({ label:'Terzo metallo (catena)', value:P.three, onChange(v){ P.three=v; initSim(); reControls(); } }));
    if(P.three) sc.add(matRadio('Metallo C — φ',P.matC,v=>{P.matC=v;}));
  } else {
    const sa=Lab.Section('Catodo (filamento)'); cont.appendChild(sa.el); sa.add(matRadio('φ',P.matA,v=>{P.matA=v;}));
    const st=Lab.Section('Parametri'); cont.appendChild(st.el);
    st.add(Lab.Slider({ label:'Temperatura T', min:300, max:3000, step:50, value:P.T, unit:' K', onChange(v){P.T=v;} }));
    st.add(Lab.Slider({ label:'Tensione anodo V', min:-2, max:3, step:0.05, value:P.V, unit:' V', onChange(v){P.V=v;} }));
  }
}

function buildReadout(){
  const el=document.getElementById('readout'); el.innerHTML='';
  const fields = P.mode==='volta'
    ? [{key:'pa',label:'lavoro d’estrazione A'},{key:'pb',label:'lavoro d’estrazione B'},{key:'pc',label:'lavoro d’estrazione C'},{key:'v',label:'V estremi'},{key:'lo',label:'estremo +'},{key:'hi',label:'estremo −'}]
    : [{key:'phi',label:'φ catodo'},{key:'T',label:'Temperatura'},{key:'V',label:'Tensione'},{key:'J',label:'J saturazione'},{key:'I',label:'Corrente diodo'},{key:'note',label:'Stato'}];
  readout=new Lab.Readout(el, fields);
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
  document.getElementById('btnMode').addEventListener('click',()=>{ P.mode=P.mode==='volta'?'thermionic':'volta'; setTitles(); initSim(); buildReadout(); buildControls(); });
  document.getElementById('btnReset').addEventListener('click',()=>{
    P.mode='volta'; P.matA='Na'; P.matB='Cu'; P.matC='Ca'; P.three=false; P.T=2000; P.V=1.0; P.paused=false;
    buildControls(); buildReadout(); setTitles(); initSim();
  });

  function resize(){
    const area=document.querySelector('.lab-canvas-area'); if(!area)return;
    const ar=area.getBoundingClientRect();
    const rb=document.getElementById('readout').getBoundingClientRect();
    const ga=document.getElementById('graphArea'); const gaH=ga?ga.offsetHeight:0;
    const h=Math.max(220,Math.floor(ar.height-rb.height-gaH-4));
    simCanvas.style.width=Math.floor(ar.width)+'px'; simCanvas.style.height=h+'px';
    Lab.hidpi(simCanvas, Math.floor(ar.width), h);
    if(P.mode==='volta') geomVolta(Math.floor(ar.width), h); else geomTherm(Math.floor(ar.width), h);
    if(P.mode==='volta' && !voltDots.length) initSim();
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
    if(P.mode==='volta'){
      const l=metals();
      readout.set('pa', Lab.fmt(phiOf(P.matA),2)+' eV'); readout.set('pb', Lab.fmt(phiOf(P.matB),2)+' eV');
      readout.set('pc', P.three? Lab.fmt(phiOf(P.matC),2)+' eV' : '—');
      readout.set('v', (Vtotal()>=0?'+':'')+Lab.fmt(Vtotal(),2)+' V');
      const lo = phiOf(l[0])<phiOf(l[l.length-1])? MAT[l[0]].name : MAT[l[l.length-1]].name;
      const hi = phiOf(l[0])<phiOf(l[l.length-1])? MAT[l[l.length-1]].name : MAT[l[0]].name;
      readout.set('lo', lo); readout.set('hi', hi);
    } else {
      readout.set('phi', Lab.fmt(phiOf(P.matA),2)+' eV'); readout.set('T', P.T+' K'); readout.set('V', (P.V>=0?'+':'')+Lab.fmt(P.V,2)+' V');
      readout.set('J', fmtJ(Jemit())); readout.set('I', fmtJ(diodeI(P.V)));
      readout.set('note', Jemit()<1e-3?'emissione trascurabile':(P.V<0?'frenante':'conduzione'));
    }
    }catch(err){ console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
