'use strict';

// ═══ Stato ════════════════════════════════════════════════════════════════════
const LIQ = {
  mercurio: {name:'Mercurio',  rho:13600, col:[180,186,196]},
  acqua:    {name:'Acqua',     rho:1000,  col:[70,140,235]},
  glicerina:{name:'Glicerina', rho:1260,  col:[200,150,90]},
  olio:     {name:'Olio',      rho:920,   col:[210,180,70]},
};
const P = {
  p0:1.00,      // pressione atmosferica (atm)
  liq:'mercurio',
  tubeH:1.40,   // altezza del tubo (m) — al default il mercurio (0,76 m) ≈ 138 px
  paused:false,
};
const ATM=101325, Gacc=9.81;

let tAnim=0, last=0, colPx=0, refillFlag=true;
let gCanvas=[null,null,null], gCtx=[null,null,null];
let readout;
function refill(){ refillFlag=true; }   // riempie il tubo: il liquido riparte dall'alto e scende

// ═══ Palette ══════════════════════════════════════════════════════════════════
function dk(){ return document.documentElement.dataset.theme !== 'light'; }
function pal(){
  const d=dk();
  return {
    bg:    d?'#06090f':'#e7edf4',
    txt:   d?'rgba(225,238,250,0.96)':'rgba(20,40,70,0.95)',
    sub:   d?'rgba(165,195,220,0.82)':'rgba(60,90,125,0.9)',
    accent:d?'#00d4ff':'#0a78b0',
    glass: d?'rgba(200,218,238,0.75)':'rgba(80,110,150,0.7)',
    glassF:d?'rgba(170,195,225,0.06)':'rgba(120,150,195,0.10)',
    vac:   d?'rgba(120,140,170,0.10)':'rgba(120,140,170,0.10)',
    ruler: d?'rgba(120,170,220,0.18)':'rgba(120,170,220,0.30)',
    press: [230,70,60],
    level: d?[255,200,80]:[200,140,20],
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
function p0Pa(){ return P.p0*ATM; }
function rho(){ return LIQ[P.liq].rho; }
function colH(){ return p0Pa()/(rho()*Gacc); }        // altezza della colonna (m)  — h = p0/(ρg)
function hMaxScale(){ return 1.20*ATM/(rho()*Gacc); } // colonna a p=1.2 atm (per la scala)
function mmHg(){ return p0Pa()/133.322; }
function altitudeEq(){ return -8400*Math.log(clamp(P.p0,0.05,3)); }   // quota equivalente (m)
function fmtH(m){ return m<2 ? (m*100).toFixed(1)+' cm' : m.toFixed(2)+' m'; }
function niceStep(x){ const e=Math.pow(10,Math.floor(Math.log10(x))); const f=x/e; return (f<1.5?1:f<3.5?2:f<7.5?5:10)*e; }

// ═══ Geometria ════════════════════════════════════════════════════════════════
let G={};
const REF_H=1.4;   // altezza di riferimento (m): zoom massimo (il mercurio 0,76 m ≈ 138 px)
function geom(W,H){
  const ySurf=H*0.70, topMargin=H*0.08, availMax=ySurf-topMargin;
  // ZOOM DELLA TELECAMERA: oltre REF_H la camera arretra (s<1) → l'INTERO apparato
  // (tubo, spessore tubo, vaschetta) si rimpicciolisce per far stare il tubo più lungo.
  const pxPerM=availMax/Math.max(P.tubeH,REF_H);
  const s=Math.min(1, REF_H/P.tubeH);            // fattore telecamera
  const tubeHpx=P.tubeH*pxPerM, yTubeTop=ySurf-tubeHpx;
  const xTube=W*0.42, wTube=Math.max(4, Math.min(26, W*0.03)*s);
  const dishX0=xTube-0.26*W*s, dishX1=xTube+0.20*W*s, dishBot=ySurf+0.16*H*s;
  const rulerX=xTube+0.30*W*s;
  G={W,H,ySurf,yTubeTop,xTube,wTube,dishX0,dishX1,dishBot,rulerX,tubeHpx,pxPerM,s};
}

// ═══ Step ═════════════════════════════════════════════════════════════════════
function step(dt){
  if(P.paused) return;
  if(G.W) geom(G.W,G.H);
  const pxM=G.tubeHpx/P.tubeH, target=clamp(colH()*pxM,0,G.tubeHpx-2);
  if(refillFlag && G.tubeHpx){ colPx=G.tubeHpx-2; refillFlag=false; }   // riparte dall'alto
  colPx += (target-colPx)*clamp(dt*4,0,1);                              // …e scende verso l'altezza finale
}

// ═══ Rendering ════════════════════════════════════════════════════════════════
function drawGrid(ctx,W,H){ ctx.strokeStyle=T.grid; ctx.lineWidth=1;
  for(let x=0;x<=W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=0;y<=H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();} }
function arrow(ctx,x1,y1,x2,y2,col,lw){
  ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=lw; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  const a=Math.atan2(y2-y1,x2-x1), s=6+lw;
  ctx.beginPath(); ctx.moveTo(x2,y2); ctx.lineTo(x2-s*Math.cos(a-0.45),y2-s*Math.sin(a-0.45)); ctx.lineTo(x2-s*Math.cos(a+0.45),y2-s*Math.sin(a+0.45)); ctx.closePath(); ctx.fill();
}

// disegna il tubo (vetro + vuoto + colonna). yCol = quota cima colonna in px
function drawTube(ctx,yCol,off){
  const xT=G.xTube, w=G.wTube, yTubeBot=G.dishBot-10, col=LIQ[P.liq].col;
  const domeR=w/2, yDomeTop=G.yTubeTop-domeR;
  const full=off || yCol<=G.yTubeTop+2.5;
  if(full) yCol=G.yTubeTop;                       // fuori scala: liquido fino in cima (cupola compresa)
  ctx.fillStyle=T.glassF; ctx.fillRect(xT-w/2, G.yTubeTop, w, yTubeBot-G.yTubeTop);
  const grd=ctx.createLinearGradient(xT-w/2,0,xT+w/2,0);
  grd.addColorStop(0,rgb([col[0]*0.7|0,col[1]*0.7|0,col[2]*0.7|0]));
  grd.addColorStop(0.5,rgb(col));
  grd.addColorStop(1,rgb([Math.min(255,col[0]*1.2)|0,Math.min(255,col[1]*1.2)|0,Math.min(255,col[2]*1.2)|0]));
  // ── cupola (semicerchio in alto): liquido se il tubo è pieno, altrimenti vuoto ──
  ctx.save(); ctx.beginPath(); ctx.arc(xT, G.yTubeTop, domeR, Math.PI, 0, false); ctx.closePath(); ctx.clip();
  ctx.fillStyle = full ? grd : T.vac;
  ctx.fillRect(xT-w/2, yDomeTop-1, w, domeR+2);
  ctx.restore();
  // ── tratto rettilineo: vuoto sopra, colonna di liquido sotto ──
  ctx.save(); ctx.beginPath(); ctx.rect(xT-w/2, G.yTubeTop-1, w, yTubeBot-G.yTubeTop+2); ctx.clip();
  const yTop=Math.max(yCol, G.yTubeTop);
  ctx.fillStyle=T.vac; ctx.fillRect(xT-w/2, G.yTubeTop, w, Math.max(0,yCol-G.yTubeTop));
  ctx.fillStyle=grd;   ctx.fillRect(xT-w/2, yTop, w, yTubeBot-yTop);
  ctx.restore();
  // ── pareti + cupola (contorno) ──
  ctx.strokeStyle=T.glass; ctx.lineWidth=2; ctx.beginPath();
  ctx.moveTo(xT-w/2, yTubeBot); ctx.lineTo(xT-w/2, G.yTubeTop);
  ctx.arc(xT, G.yTubeTop, domeR, Math.PI, 0, false);
  ctx.lineTo(xT+w/2, yTubeBot); ctx.stroke();
}

function draw(canvas){
  const ctx=canvas.getContext('2d');
  const W=canvas.width,H=canvas.height;
  T=pal(); ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  drawGrid(ctx,W,H);
  geom(W,H);
  const liq=LIQ[P.liq], col=liq.col, xT=G.xTube, w=G.wTube;
  const pxM=G.tubeHpx/P.tubeH;
  const colReal=colH()*pxM, off=colReal>G.tubeHpx-2;   // colonna più alta del tubo?

  const s=G.s, depth=G.dishBot-G.ySurf, lip=6*s;

  // ── bacinella con liquido (si rimpicciolisce con il de-zoom) ──
  ctx.fillStyle=rgba(col,0.45); ctx.fillRect(G.dishX0,G.ySurf,G.dishX1-G.dishX0,depth);
  ctx.strokeStyle=T.glass; ctx.lineWidth=2; ctx.beginPath();
  ctx.moveTo(G.dishX0,G.ySurf-lip); ctx.lineTo(G.dishX0,G.dishBot); ctx.lineTo(G.dishX1,G.dishBot); ctx.lineTo(G.dishX1,G.ySurf-lip); ctx.stroke();
  ctx.strokeStyle=rgba(col,0.5); ctx.beginPath(); ctx.moveTo(G.dishX0,G.ySurf); ctx.lineTo(G.dishX1,G.ySurf); ctx.stroke();

  // ── scala graduata ──
  drawRuler(ctx);

  const yCol=G.ySurf-colPx;                       // cima della colonna
  drawTube(ctx,yCol,off);
  // marker rosso + quota h sulla scala
  drawColMarker(ctx,yCol,off);

  // ── etichette vuoto / liquido con leader (stile fluidi) ──
  if(!off){
    const yV=(G.yTubeTop+yCol)/2;
    ctx.strokeStyle=T.sub; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(xT-w/2-2,yV); ctx.lineTo(G.dishX0-6,yV); ctx.stroke();
    ctx.fillStyle=T.sub; ctx.font='11px "Space Mono",monospace'; ctx.textAlign='right'; ctx.fillText('vuoto', G.dishX0-10, yV+4);
  }
  const yMid=(yCol+(G.dishBot-10))/2;
  ctx.strokeStyle=T.sub; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(xT-w/2-2,yMid); ctx.lineTo(G.dishX0-6,yMid); ctx.stroke();
  ctx.fillStyle=T.sub; ctx.font='11px "Space Mono",monospace'; ctx.textAlign='right'; ctx.fillText(liq.name, G.dishX0-10, yMid+4);

  // ── frecce di pressione (posizioni relative alla vaschetta) ──
  const xP=G.dishX0+(G.dishX1-G.dishX0)*0.22, aLen=Math.min(26,depth*0.85);
  arrow(ctx, xP, G.ySurf-30, xP, G.ySurf-4, rgb(T.press), 2.6);                      // p0 sulla superficie
  ctx.fillStyle=rgb(T.press); ctx.font='bold 11px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText('p₀', xP, G.ySurf-34);
  arrow(ctx, xT, G.ySurf+aLen, xT, G.ySurf+5, rgb(T.press), 2.6);                    // p0 verso l'alto in A
  ctx.fillText('p₀', xT-14, G.ySurf+aLen+10);
  if(!off){ arrow(ctx, xT+w/2+16, yCol+18, xT+w/2+16, yCol+44, rgb(T.press), 2.4);   // peso colonna gρh
    ctx.textAlign='left'; ctx.fillText('g·ρ·h', xT+w/2+22, yCol+22); }
  ctx.fillStyle=T.accent; ctx.font='10px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('A', xT+w/2+8, G.ySurf+4);
  ctx.beginPath(); ctx.arc(xT, G.ySurf, 3, 0, Math.PI*2); ctx.fill();

  // ── intestazione ──
  ctx.textAlign='left'; ctx.fillStyle=T.accent; ctx.font='bold 14px "Space Mono",monospace';
  ctx.fillText('Torricelli:  p₀ = ρ·g·h   →   h = p₀/(ρg)', 14, 24);
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace';
  ctx.fillText(`p₀ = ${P.p0.toFixed(2)} atm = ${(p0Pa()/1000).toFixed(1)} kPa = ${mmHg().toFixed(0)} mmHg   ·   ${liq.name}: h = ${fmtH(colH())}`, 14, 40);
}

// scala graduata FISSA, lunga quanto il tubo (0 .. P.tubeH). cm fino a 2 m, poi m
function drawRuler(ctx){
  const x=G.rulerX, y0=G.ySurf, yT=G.yTubeTop, pxM=G.tubeHpx/P.tubeH;
  ctx.fillStyle=T.ruler; ctx.fillRect(x, yT-6, 30, (y0-yT)+12);
  ctx.strokeStyle=T.glass; ctx.lineWidth=1; ctx.strokeRect(x, yT-6, 30, (y0-yT)+12);
  const useCm=P.tubeH<=2, unit=useCm?'cm':'m';
  const maxU=useCm?P.tubeH*100:P.tubeH, step=niceStep(maxU/9), big=step*5, lab=step*(useCm?2:1);
  ctx.font='8px "Space Mono",monospace';
  for(let u=0;u<=maxU+1e-6;u+=step){ const m=useCm?u/100:u, yy=y0-m*pxM; if(yy<yT-6)break;
    ctx.strokeStyle=rgba([120,170,220],0.6); ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x+(Math.abs(u%big)<1e-6?12:7), yy); ctx.stroke();
    if(Math.abs(u%lab)<1e-6){ ctx.fillStyle=T.gText; ctx.textAlign='left'; ctx.fillText(useCm?String(Math.round(u)):(Number.isInteger(u)?String(u):u.toFixed(1)), x+14, yy+3); }
  }
  ctx.fillStyle=T.sub; ctx.textAlign='center'; ctx.fillText(unit, x+15, yT-10);
}

// marker rosso della cima colonna + quota h (stile fluidi)
function drawColMarker(ctx,yCol,off){
  const x=G.rulerX, y0=G.ySurf;
  ctx.strokeStyle=rgba(T.press,0.6); ctx.setLineDash([4,3]); ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(G.xTube, yCol); ctx.lineTo(x+30, yCol); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(G.xTube, y0);  ctx.lineTo(x+30, y0);  ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle=rgb(T.press); ctx.fillRect(x-3, yCol-1.5, 8, 3);
  // quota h
  const xd=x+34; ctx.strokeStyle=rgb(T.level); ctx.fillStyle=rgb(T.level); ctx.lineWidth=1.2;
  ctx.beginPath(); ctx.moveTo(xd,yCol); ctx.lineTo(xd,y0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(xd,yCol); ctx.lineTo(xd-3,yCol+6); ctx.lineTo(xd+3,yCol+6); ctx.fill();
  ctx.beginPath(); ctx.moveTo(xd,y0); ctx.lineTo(xd-3,y0-6); ctx.lineTo(xd+3,y0-6); ctx.fill();
  ctx.save(); ctx.translate(xd+12,(yCol+y0)/2); ctx.rotate(-Math.PI/2); ctx.textAlign='center'; ctx.font='10px "Space Mono",monospace'; ctx.fillText('h = '+fmtH(colH()), 0, 0); ctx.restore();
  if(off){ ctx.fillStyle=rgb(T.press); ctx.font='bold 10px "Space Mono",monospace'; ctx.textAlign='center';
    ctx.fillText('↑ fuori scala', G.xTube, yCol-16); ctx.fillText('('+fmtH(colH())+')', G.xTube, yCol-5); }
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
function gBase(ctx,W,H,PAD){
  ctx.fillStyle=T.gBg; ctx.fillRect(0,0,W,H);
  const gW=W-PAD.l-PAD.r, gH=H-PAD.t-PAD.b;
  ctx.strokeStyle=T.gAxis; ctx.lineWidth=0.6;
  ctx.beginPath(); ctx.moveTo(PAD.l,PAD.t); ctx.lineTo(PAD.l,PAD.t+gH); ctx.lineTo(PAD.l+gW,PAD.t+gH); ctx.stroke();
  return {gW,gH};
}
function drawGraphs(){
  // 1: h vs p0 (lineare)
  if(gCanvas[0]&&gCanvas[0].width){ const cv=gCanvas[0],ctx=gCtx[0],W=cv.width,H=cv.height,PAD={t:14,b:18,l:28,r:8};
    const {gW,gH}=gBase(ctx,W,H,PAD); const pmax=1.3, hmax=pmax*ATM/(rho()*Gacc);
    const xOf=p=>PAD.l+p/pmax*gW, yOf=h=>PAD.t+gH-clamp(h/hmax,0,1)*gH*0.9;
    ctx.strokeStyle=T.accent; ctx.lineWidth=1.6; ctx.beginPath(); ctx.moveTo(xOf(0),yOf(0)); ctx.lineTo(xOf(pmax),yOf(pmax*ATM/(rho()*Gacc))); ctx.stroke();
    ctx.fillStyle=rgb(T.press); ctx.beginPath(); ctx.arc(xOf(P.p0),yOf(colH()),3.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('h',PAD.l+2,PAD.t+7); ctx.textAlign='right'; ctx.fillText('p₀',PAD.l+gW-2,PAD.t+gH-3);
  }
  // 2: h per liquido (a 1 atm) — perché il mercurio
  if(gCanvas[1]&&gCanvas[1].width){ const cv=gCanvas[1],ctx=gCtx[1],W=cv.width,H=cv.height,PAD={t:16,b:22,l:10,r:10};
    const {gW,gH}=gBase(ctx,W,H,PAD); const ks=Object.keys(LIQ); const hs=ks.map(k=>ATM/(LIQ[k].rho*Gacc)); const max=Math.max(...hs);
    const bw=gW/ks.length*0.5; ks.forEach((k,i)=>{ const cx=PAD.l+gW*(i+0.5)/ks.length, bh=hs[i]/max*gH*0.85;
      const hi=k===P.liq; ctx.fillStyle=rgba(LIQ[k].col, hi?0.95:0.45); ctx.fillRect(cx-bw/2,PAD.t+gH-bh,bw,bh);
      ctx.fillStyle=T.gText; ctx.font='6px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText(k.slice(0,4),cx,PAD.t+gH+9);
      ctx.fillStyle=rgb(LIQ[k].col); ctx.fillText(fmtH(hs[i]),cx,PAD.t+gH-bh-3); });
  }
  // 3: pressione vs quota (barometrica)
  if(gCanvas[2]&&gCanvas[2].width){ const cv=gCanvas[2],ctx=gCtx[2],W=cv.width,H=cv.height,PAD={t:14,b:18,l:24,r:8};
    const {gW,gH}=gBase(ctx,W,H,PAD); const altmax=10000;
    const xOf=a=>PAD.l+a/altmax*gW, yOf=p=>PAD.t+gH-clamp(p,0,1.05)*gH*0.9;
    ctx.strokeStyle=T.accent; ctx.lineWidth=1.6; ctx.beginPath(); let f=true;
    for(let a=0;a<=altmax;a+=200){ const p=Math.exp(-a/8400); const x=xOf(a),y=yOf(p); f?(ctx.moveTo(x,y),f=false):ctx.lineTo(x,y);} ctx.stroke();
    const altNow=clamp(altitudeEq(),0,altmax); ctx.fillStyle=rgb(T.press); ctx.beginPath(); ctx.arc(xOf(altNow),yOf(P.p0),3.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('p/p₀',PAD.l+2,PAD.t+7); ctx.textAlign='right'; ctx.fillText('quota',PAD.l+gW-2,PAD.t+gH-3);
  }
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls(){
  const cont=document.getElementById('controls'); cont.innerHTML='';
  const secP=Lab.Section('Atmosfera'); cont.appendChild(secP.el);
  secP.add(Lab.Slider({ label:'Pressione atmosferica', min:0.40, max:1.20, step:0.01, value:P.p0, unit:' atm', onChange(v){P.p0=v;} }));
  const secL=Lab.Section('Liquido barometrico'); cont.appendChild(secL.el);
  secL.add(Lab.RadioGroup({ label:'Tipo', options:Object.keys(LIQ).map(k=>({value:k,label:LIQ[k].name,hint:LIQ[k].rho+' kg/m³'})), value:P.liq, onChange(v){P.liq=v; refill();} }));
  const secT=Lab.Section('Tubo'); cont.appendChild(secT.el);
  secT.add(Lab.Slider({ label:'Altezza del tubo', min:0.5, max:15, step:0.1, value:P.tubeH, unit:' m', onChange(v){P.tubeH=v;} }));
}
function initGraphs(){
  const ga=document.getElementById('graphArea');
  ga.style.cssText='display:flex;flex-direction:row;gap:5px;padding:5px 0 3px;height:150px;box-sizing:border-box;border-top:1px solid rgba(100,150,200,0.14);';
  const TITLES=['Altezza h in funzione di p₀','Altezza per liquido (1 atm)','Pressione vs quota'];
  for(let i=0;i<3;i++){
    const panel=document.createElement('div');
    panel.style.cssText='flex:1;min-width:0;position:relative;background:rgba(2,7,18,0.8);border:1px solid rgba(100,150,200,0.11);border-radius:4px;overflow:hidden;';
    const title=document.createElement('div'); title.textContent=TITLES[i];
    title.style.cssText='position:absolute;top:3px;left:6px;font-size:8px;color:rgba(100,175,200,0.65);font-family:"Space Mono",monospace;text-transform:uppercase;letter-spacing:0.4px;z-index:1;pointer-events:none;';
    const cv=document.createElement('canvas'); cv.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;';
    panel.appendChild(title); panel.appendChild(cv); ga.appendChild(panel);
    gCanvas[i]=cv; gCtx[i]=cv.getContext('2d');
  }
}

// ═══ Init ═════════════════════════════════════════════════════════════════════
function init(){
  Lab.initTheme();
  buildControls(); initGraphs();
  const simCanvas=document.getElementById('simCanvas');
  readout=new Lab.Readout(document.getElementById('readout'),[
    {key:'p',  label:'Pressione p₀'},
    {key:'mm', label:'In mmHg'},
    {key:'liq',label:'Liquido (ρ)'},
    {key:'h',  label:'Altezza colonna h'},
    {key:'alt',label:'Quota equivalente'},
  ]);
  const btnStd=document.getElementById('btnStd');
  btnStd.addEventListener('click',()=>{ P.p0=1.00; buildControls(); refill(); });
  document.getElementById('btnReset').addEventListener('click',()=>{ P.p0=1.00; P.liq='mercurio'; P.tubeH=1.40; P.paused=false; buildControls(); refill(); });

  function resize(){
    const area=document.querySelector('.lab-canvas-area'); if(!area)return;
    const ar=area.getBoundingClientRect();
    const rb=document.getElementById('readout').getBoundingClientRect();
    const ga=document.getElementById('graphArea'); const gaH=ga?ga.offsetHeight:0;
    const h=Math.max(240,Math.floor(ar.height-rb.height-gaH-4));
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
      readout.set('p', P.p0.toFixed(2)+' atm');
      readout.set('mm', mmHg().toFixed(0)+' mmHg');
      readout.set('liq', LIQ[P.liq].name+' ('+rho()+')');
      readout.set('h', fmtH(colH()));
      readout.set('alt', (altitudeEq()>=0?'+':'')+Math.round(altitudeEq())+' m');
    }catch(err){ console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
