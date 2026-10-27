'use strict';

// ═══ Stato ════════════════════════════════════════════════════════════════════
const MODES = { uno:'Un peso', due:'Due pesi', piano:'Peso + piano', multi:'Carrucole multiple' };
const G=9.81;

const P = {
  mode:'due',
  Mp:1.0,        // massa della carrucola (kg)
  r:0.15,        // raggio della carrucola (m)
  m1:5.0,        // massa 1 (kg)
  m2:6.0,        // massa 2 (kg)
  mu:0.2,        // attrito dinamico sul piano
  theta:0,       // inclinazione del piano (gradi)
  n:2,           // numero di funi portanti (carrucole multiple)
  Feff:30,       // forza di sforzo applicata (N) — carrucole multiple
  showForces:false,
  paused:true,
};
const SMAX=0.55;               // corsa massima (m)

let s=0, v=0, tSim=0, last=0, tHist=0, zoom=1, panX=0, panY=0;
let sLo=-SMAX, sHi=SMAX;        // limiti di corsa (impostati dal disegno per modalità)
let hsS=[], hsV=[];
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
    metal: d?[150,165,185]:[110,130,155],
    rope:  d?'rgba(210,200,170,0.9)':'rgba(120,95,55,0.85)',
    m1c:   [230,120,60],
    m2c:   [90,160,225],
    plane: d?'rgba(150,175,205,0.5)':'rgba(70,100,135,0.55)',
    press: [230,70,60],
    grid:  d?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.04)',
    gBg:   d?'rgb(3,9,22)':'#eef2f7',
    gAxis: d?'rgba(100,155,210,0.3)':'rgba(40,80,130,0.32)',
    gText: d?'rgba(150,205,225,0.88)':'rgba(25,65,105,0.92)',
  };
}
let T=pal();
const FCOL={ peso:[235,70,60], tens:[255,205,45], norm:[120,205,255], attr:[245,150,40] };   // colori forze (ben visibili)
const rgb=(a)=>`rgb(${a[0]},${a[1]},${a[2]})`;
const rgba=(a,al)=>`rgba(${a[0]},${a[1]},${a[2]},${al})`;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

// ═══ Fisica ═══════════════════════════════════════════════════════════════════
function Ir(){ return 0.5*P.Mp; }            // I/r² per disco uniforme = ½·Mp  (indipendente da r)
function accel(){
  const I=Ir();
  if(P.mode==='uno')  return G*P.m1/(P.m1+I);
  if(P.mode==='due')  return G*(P.m1-P.m2)/(P.m1+P.m2+I);
  if(P.mode==='piano'){
    const th=P.theta*Math.PI/180, c=Math.cos(th), sn=Math.sin(th);
    const drive=P.m1 - P.m2*sn;                  // m1 (appeso) scende, m2 sale lungo il piano
    const maxS=P.mu*P.m2*c;                       // attrito statico massimo
    if(Math.abs(v)<1e-4 && Math.abs(drive)<=maxS) return 0;
    const dir=(Math.abs(v)>1e-4)?(v>0?1:-1):(drive>0?1:-1);
    return G*(drive - dir*maxS)/(P.m1+P.m2+I);    // l'attrito dinamico si oppone al moto
  }
  // carrucole multiple: carico M=m2 sollevato dalla forza di sforzo F (vantaggio n)
  return (P.n*P.Feff - P.m2*G)/(P.m2 + I);          // accelerazione del carico (su = +)
}
function tensions(){
  const a=accel();
  if(P.mode==='uno')  return { T:P.m1*(G-a) };
  if(P.mode==='due')  return { T1:P.m1*(G-a), T2:P.m2*(G+a) };
  if(P.mode==='piano'){
    const th=P.theta*Math.PI/180, c=Math.cos(th), sn=Math.sin(th);
    const N=P.m2*G*c, moving=Math.abs(v)>1e-4, drive=P.m1-P.m2*sn;
    let Ff,fdir;
    if(moving){ Ff=P.mu*N; fdir=(v>0?-1:1); } else { Ff=Math.min(P.mu*N,Math.abs(drive)*G); fdir=(drive>0?-1:1); }
    const Tt=P.m1*(G-a), T2=P.m2*a + P.m2*G*sn - fdir*Ff;
    return { T:Tt, T1:Tt, T2, N, fr:Ff, fdir, sn, c };
  }
  return { T:P.Feff, F:P.Feff, Feq:P.m2*G/P.n, F1:P.m2*G+P.Feff, MA:P.n };
}
function fmt(x,u){ return (Math.abs(x)<10?x.toFixed(2):x.toFixed(1))+(u||''); }

// ═══ Step ═════════════════════════════════════════════════════════════════════
function step(dt){
  if(P.paused) return;
  const a=accel();
  v += a*dt;
  s += v*dt;
  if(s> sHi){ s=sHi; v=0; }
  if(s< sLo){ s=sLo; v=0; }
  tHist+=dt; if(tHist>=0.04){ tHist=0; hsS.push(s); hsV.push(v); if(hsS.length>260){hsS.shift();hsV.shift();} }
}

// ═══ Rendering ════════════════════════════════════════════════════════════════
function drawGridInf(ctx,tx,ty,zm,W,H){     // griglia infinita: copre l'area visibile a qualsiasi zoom/pan
  const x0=(0-tx)/zm, x1=(W-tx)/zm, y0=(0-ty)/zm, y1=(H-ty)/zm;
  ctx.strokeStyle=T.grid; ctx.lineWidth=1/zm;
  for(let x=Math.floor(x0/40)*40; x<=x1; x+=40){ ctx.beginPath(); ctx.moveTo(x,y0); ctx.lineTo(x,y1); ctx.stroke(); }
  for(let y=Math.floor(y0/40)*40; y<=y1; y+=40){ ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke(); }
}
function arrow(ctx,x1,y1,x2,y2,col,lw,lbl){
  ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=lw||2.5; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  const a=Math.atan2(y2-y1,x2-x1), sz=6+(lw||2.5);
  ctx.beginPath(); ctx.moveTo(x2,y2); ctx.lineTo(x2-sz*Math.cos(a-0.42),y2-sz*Math.sin(a-0.42)); ctx.lineTo(x2-sz*Math.cos(a+0.42),y2-sz*Math.sin(a+0.42)); ctx.closePath(); ctx.fill();
  if(lbl){ ctx.font='bold 10px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText(lbl,x2,y2+(y2>y1?12:-6)); }
}
function pulley(ctx,cx,cy,rpx,ang,col){
  ctx.fillStyle = col?rgb(col):rgba(T.metal,0.35); ctx.beginPath(); ctx.arc(cx,cy,rpx,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle = col?'rgba(0,0,0,0.55)':rgb(T.metal); ctx.lineWidth= col?2:3; ctx.beginPath(); ctx.arc(cx,cy,rpx,0,Math.PI*2); ctx.stroke();
  ctx.fillStyle = col?'rgba(0,0,0,0.4)':rgb(T.metal); ctx.beginPath(); ctx.arc(cx,cy,3,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle = col?'rgba(255,255,255,0.55)':rgba(T.metal,0.9); ctx.lineWidth=2; ctx.beginPath();   // raggio (rotazione)
  ctx.moveTo(cx,cy); ctx.lineTo(cx+rpx*Math.cos(ang),cy+rpx*Math.sin(ang)); ctx.stroke();
}
function massBox(ctx,cx,topY,m,col,label){
  const w=clamp(42+m*2.4,48,76), h=clamp(w*0.62,34,50);
  ctx.fillStyle=rgba(col,0.85); ctx.fillRect(cx-w/2,topY,w,h);
  ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=1.5; ctx.strokeRect(cx-w/2,topY,w,h);
  ctx.fillStyle='#fff'; ctx.font='bold 10px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillText(label, cx, topY+h/2+4);
  return h;
}

function rope(ctx,x1,y1,x2,y2){ ctx.strokeStyle=T.rope; ctx.lineWidth=2.5; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); }
// disegna un insieme di forze (componenti in N) con scala comune
function drawForces(ctx, items){
  let mx=1e-6; for(const it of items) mx=Math.max(mx,Math.hypot(it.fx,it.fy));
  const sc=54/mx;
  for(const it of items){ const L=Math.hypot(it.fx,it.fy); if(L<0.02) continue;
    const x=it.x+(it.ox||0), y=it.y+(it.oy||0);
    arrow(ctx,x,y,x+it.fx*sc,y+it.fy*sc,it.col,2.4,it.lbl); }
}
function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
  ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r); ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
  ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r); ctx.closePath();
}

function draw(canvas){
  const ctx=canvas.getContext('2d');
  const W=canvas.width,H=canvas.height;
  T=pal(); ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  const PXM=Math.min(H,520)*0.42;                 // px per metro (corsa + raggio)
  const rpx=clamp(P.r*PXM,16,60), ang=s/P.r;

  const tx=panX + W/2*(1-zoom), ty=panY + H/2*(1-zoom);   // zoom + pan
  ctx.save(); ctx.setTransform(zoom,0,0,zoom,tx,ty);
  drawGridInf(ctx,tx,ty,zoom,W,H);
  if(P.mode==='multi') drawMulti(ctx,W,H,PXM,rpx,ang);
  else if(P.mode==='piano') drawPiano(ctx,W,H,PXM,rpx,ang);
  else drawAtwood(ctx,W,H,PXM,rpx,ang);
  ctx.restore();

  // intestazione
  const a=accel();
  ctx.textAlign='left'; ctx.fillStyle=T.accent; ctx.font='bold 14px "Space Mono",monospace';
  ctx.fillText('Macchina di Atwood — '+MODES[P.mode], 14, 22);
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace';
  let f='a = '+fmt(a,' m/s²')+'   ·   I_carrucola = ½·M·r²';
  if(P.mode==='multi') f='vantaggio '+P.n+'×   ·   F_eq = M·g/n = '+fmt(P.m2*G/P.n,' N')+'   ·   a_carico = '+fmt(a,' m/s²');
  if(P.mode==='piano'){
    const th=P.theta*Math.PI/180, drive=P.m1-P.m2*Math.sin(th), maxS=P.mu*P.m2*Math.cos(th);
    f = (Math.abs(v)<1e-4 && Math.abs(drive)<=maxS)
      ? 'fermo: attrito statico trattiene  (|m₁ − m₂·sinθ| ≤ μ·m₂·cosθ)'
      : 'a = '+fmt(a,' m/s²')+'   ·   θ='+P.theta+'°   ·   a = g(m₁ − m₂·sinθ − μ·m₂·cosθ)/(m₁+m₂+½M)';
  }
  ctx.fillText(f, 14, 39);
}

// ── modalità un peso / due pesi ──
function drawAtwood(ctx,W,H,PXM,rpx,ang){
  sLo=-SMAX; sHi=SMAX;
  const cx=W/2, cyP=H*0.26;
  const xL=cx-rpx, xR=cx+rpx;
  const restY=cyP+rpx+70;                       // posizione di riposo delle masse
  ctx.fillStyle=rgb(T.metal); ctx.fillRect(cx-30,cyP-rpx-26,60,12);   // staffa al soffitto
  rope(ctx,cx,cyP-rpx-14,cx,cyP-rpx);
  pulley(ctx,cx,cyP,rpx,ang);
  if(P.mode==='uno'){
    const y1=restY + s*PXM;
    rope(ctx,xR,cyP,xR,cyP+rpx*1.2); ctx.fillStyle=rgb(T.metal); ctx.fillRect(xR-7,cyP+rpx*1.2,14,8); // ancoraggio
    rope(ctx,xL,cyP,xL,y1);
    const h=massBox(ctx,xL,y1,P.m1,T.m1c,'m='+P.m1);
    if(P.showForces){ const t=tensions(); drawForces(ctx,[
      {x:xL,y:y1+h/2,fx:0,fy:P.m1*G,lbl:'P',col:rgb(FCOL.peso)},
      {x:xL,y:y1,ox:-12,fx:0,fy:-t.T,lbl:'T',col:rgb(FCOL.tens)},          // su m (dall'oggetto)
      {x:xL,y:cyP,ox:-12,fx:0,fy:t.T,lbl:'T',col:rgb(FCOL.tens)} ]); }     // dal punto di tangenza verso m
  } else {
    const y1=restY + s*PXM, y2=restY - s*PXM;
    rope(ctx,xL,cyP,xL,y1); rope(ctx,xR,cyP,xR,y2);
    const h1=massBox(ctx,xL,y1,P.m1,T.m1c,'m₁='+P.m1), h2=massBox(ctx,xR,y2,P.m2,T.m2c,'m₂='+P.m2);
    if(P.showForces){ const t=tensions(); drawForces(ctx,[
      {x:xL,y:y1+h1/2,fx:0,fy:P.m1*G,lbl:'P₁',col:rgb(FCOL.peso)},
      {x:xL,y:y1,ox:-12,fx:0,fy:-t.T1,lbl:'T₁',col:rgb(FCOL.tens)},
      {x:xL,y:cyP,ox:-12,fx:0,fy:t.T1,lbl:'T₁',col:rgb(FCOL.tens)},        // dalla tangenza sx verso m₁
      {x:xR,y:y2+h2/2,fx:0,fy:P.m2*G,lbl:'P₂',col:rgb(FCOL.peso)},
      {x:xR,y:y2,ox:12,fx:0,fy:-t.T2,lbl:'T₂',col:rgb(FCOL.tens)},
      {x:xR,y:cyP,ox:12,fx:0,fy:t.T2,lbl:'T₂',col:rgb(FCOL.tens)} ]); }    // dalla tangenza dx verso m₂
  }
}

// ── peso su piano inclinato, carrucola all'angolo, peso appeso ──
function drawPiano(ctx,W,H,PXM,rpx,ang){
  const th=P.theta*Math.PI/180, c=Math.cos(th), sn=Math.sin(th);
  const Ax=W*0.10, Ay=H*0.50;                       // orizzonte a metà canvas
  const Lpx=clamp(Math.min(W*0.46,(H*0.40)/Math.max(sn,0.16)),180,520);
  const Cx=Ax+Lpx*c, Cy=Ay-Lpx*sn;                 // vertice del piano
  // ── cuneo del piano ──
  ctx.fillStyle=rgba([120,140,165],0.12);
  ctx.beginPath(); ctx.moveTo(Ax,Ay); ctx.lineTo(Cx,Cy); ctx.lineTo(Cx,Ay); ctx.closePath(); ctx.fill();
  ctx.strokeStyle=T.plane; ctx.lineWidth=3; ctx.lineJoin='round';
  ctx.beginPath(); ctx.moveTo(Ax,Ay); ctx.lineTo(Cx,Cy); ctx.lineTo(Cx,Ay); ctx.closePath(); ctx.stroke();
  ctx.strokeStyle=T.plane; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(0,Ay); ctx.lineTo(W,Ay); ctx.stroke();   // orizzonte
  // angolo θ
  ctx.strokeStyle=T.accent; ctx.lineWidth=1.2; ctx.beginPath(); ctx.arc(Ax,Ay,30,-th,0); ctx.stroke();
  ctx.fillStyle=T.accent; ctx.font='10px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('θ='+P.theta+'°', Ax+36, Ay-8);
  // versori
  const ux=c, uy=-sn, nx=-sn, ny=-c;               // su lungo il piano / normale uscente
  // ── m2 sul piano (sale di s) ──
  const bw=clamp(42+P.m2*2.4,48,72), bh=clamp(bw*0.62,34,48);
  const d=clamp(Lpx*0.40 + s*PXM, bw*0.7, Lpx-bw*0.6);
  const px=Ax+d*c, py=Ay-d*sn, mcx=px+nx*bh/2, mcy=py+ny*bh/2;
  ctx.save(); ctx.translate(mcx,mcy); ctx.rotate(-th);
  ctx.fillStyle=rgba(T.m2c,0.85); ctx.fillRect(-bw/2,-bh/2,bw,bh);
  ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=1.5; ctx.strokeRect(-bw/2,-bh/2,bw,bh);
  ctx.fillStyle='#fff'; ctx.font='bold 10px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText('m₂='+P.m2,0,3); ctx.restore();
  // ── carrucola: centro SULLA retta del piano (oltre il vertice), fune tangente in alto ──
  const rpxP=bh/2;                                   // raggio = mezza altezza blocco → fune all'altezza del baricentro
  const pcx=Cx+ux*rpxP, pcy=Cy+uy*rpxP;              // centro lungo la direzione del piano
  const tix=pcx+nx*rpxP, tiy=pcy+ny*rpxP;            // punto di tangenza SUPERIORE (lato piano)
  const tvx=pcx+rpxP, tvy=pcy;                        // punto di tangenza lato verticale (destra)
  const A2x=mcx+ux*bw/2, A2y=mcy+uy*bw/2;            // estremità destra del blocco (sulla fune)
  ctx.strokeStyle=rgb(T.metal); ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(Cx,Cy); ctx.lineTo(pcx,pcy); ctx.stroke();  // asse/staffa
  rope(ctx, A2x, A2y, tix, tiy);                      // fune parallela al piano, tangente in alto
  pulley(ctx,pcx,pcy,rpxP,ang);
  // m1 appeso al bordo destro — non sale oltre la carrucola
  const restHang=clamp(0.42*(H-30-tvy),50,0.5*PXM);
  let y1=clamp(tvy+restHang + s*PXM, tvy+rpxP+10, H-30);
  rope(ctx, tvx, tvy, tvx, y1);
  const h1=massBox(ctx, tvx, y1, P.m1, T.m1c, 'm₁='+P.m1);
  // limiti di corsa (m1 non oltre la carrucola; m2 entro il piano)
  sHi=Math.min(SMAX, ((Lpx-bw*0.6)-Lpx*0.40)/PXM, ((H-30)-(tvy+restHang))/PXM);
  sLo=Math.max(-SMAX, ((tvy+rpxP+10)-(tvy+restHang))/PXM, ((bw*0.7)-Lpx*0.40)/PXM);
  // ── forze ──
  if(P.showForces){
    const t=tensions();
    drawForces(ctx,[
      {x:mcx,y:mcy,fx:0,fy:P.m2*G,lbl:'P₂',col:rgb(FCOL.peso)},
      {x:mcx,y:mcy,fx:nx*t.N,fy:ny*t.N,lbl:'N',col:rgb(FCOL.norm)},
      {x:mcx,y:mcy,fx:t.fdir*ux*t.fr,fy:t.fdir*uy*t.fr,lbl:'fₐ',col:rgb(FCOL.attr)},
      // T₂ sul lato del piano: dall'estremità del blocco e dal punto di tangenza → verso la massa
      {x:A2x,y:A2y,ox:nx*9,oy:ny*9,fx:ux*t.T2,fy:uy*t.T2,lbl:'T₂',col:rgb(FCOL.tens)},
      {x:tix,y:tiy,ox:nx*9,oy:ny*9,fx:-ux*t.T2,fy:-uy*t.T2,lbl:'T₂',col:rgb(FCOL.tens)},
      // T₁ sul lato verticale: da m₁ e dal punto di tangenza
      {x:tvx,y:y1+h1/2,fx:0,fy:P.m1*G,lbl:'P₁',col:rgb(FCOL.peso)},
      {x:tvx,y:y1,ox:11,fx:0,fy:-t.T,lbl:'T₁',col:rgb(FCOL.tens)},
      {x:tvx,y:tvy,ox:11,fx:0,fy:t.T,lbl:'T₁',col:rgb(FCOL.tens)},
    ]);
  }
}

// ── carrucole multiple: fune TANGENTE alle pulegge, trefoli verticali; metà fisse, metà mobili ──
function drawMulti(ctx,W,H,PXM,rpx,ang){
  const n=(P.n%2)?P.n+1:P.n, cx=W*0.5, beamY=H*0.10;     // n pari; vantaggio = n
  const pr=clamp(P.r*PXM*0.6, 10, (W*0.84)/(2*n));        // raggio reale → dimensione di TUTTE le pulegge
  const rise=s*PXM, fixY=beamY+30+pr;
  const baseMov=Math.max(fixY+3*pr+70, H*0.52);
  const movY=clamp(baseMov-rise, fixY+2*pr+34, H-120);
  sHi=(baseMov-(fixY+2*pr+34))/PXM; sLo=-((H-120-baseMov)/PXM);
  const leftX=cx-n*pr;
  const px=j=>leftX+(2*j+1)*pr, py=j=>(j%2===0)?movY:fixY, vx=j=>leftX+2*j*pr;  // pari=mobile(basso), dispari=fissa(alto)
  const freeY=clamp(fixY+60 + n*rise, fixY+18, H-30);
  // soffitto
  ctx.fillStyle=rgb(T.metal); ctx.fillRect(cx-n*pr-16,beamY-11,2*n*pr+32,11);
  for(let i=0;i<16;i++){ const xx=cx-n*pr-12+i*(2*n*pr+24)/16; ctx.strokeStyle=rgba(T.metal,0.7); ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(xx,beamY); ctx.lineTo(xx-6,beamY-8); ctx.stroke(); }
  ctx.fillStyle=T.sub; ctx.font='11px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('A', vx(0)-4, beamY-3);
  // ── fune: verticale dal soffitto, tangente alle pulegge (semicerchi), verticale all'estremo ──
  ctx.strokeStyle=T.rope; ctx.lineWidth=2.6; ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.beginPath(); ctx.moveTo(vx(0),beamY); ctx.lineTo(vx(0),movY);
  for(let j=0;j<n;j++){
    if(j%2===0) ctx.arc(px(j),movY,pr,Math.PI,0,true);     // mobile: avvolge sotto
    else        ctx.arc(px(j),fixY,pr,Math.PI,0,false);    // fissa: avvolge sopra
    if(j<n-1) ctx.lineTo(vx(j+1), py(j+1)); else ctx.lineTo(vx(n), freeY);
  }
  ctx.stroke();
  // ── staffe pulegge fisse + pulegge (tutte uguali) ──
  for(let j=1;j<n;j+=2){ ctx.strokeStyle=rgb(T.metal); ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(px(j),beamY); ctx.lineTo(px(j),fixY-pr); ctx.stroke(); }
  for(let j=0;j<n;j++) pulley(ctx,px(j),py(j),pr, j%2?ang:-ang);
  // ── blocco mobile (telaio sulle pulegge basse) + carico ──
  const bC=leftX+(n-1)*pr, bx0=px(0)-pr-5, bx1=px(n-2)+pr+5;
  ctx.strokeStyle=rgb(T.metal); ctx.lineWidth=2; roundRect(ctx,bx0,movY-pr-5,bx1-bx0,2*pr+10,7); ctx.stroke();
  const ly=movY+pr+14, hL=massBox(ctx,bC,ly,P.m2,T.m2c,'M='+P.m2);
  ctx.strokeStyle=rgb(T.metal); ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(bC,movY+pr+5); ctx.lineTo(bC,ly); ctx.stroke();
  arrow(ctx, bC, ly+hL, bC, ly+hL+clamp(P.m2*G*0.5,26,72), rgb(FCOL.peso), 3.5, 'P');
  // ── sforzo Fm all'estremo libero (verticale, scende) ──
  arrow(ctx, vx(n), freeY, vx(n), freeY+clamp(P.Feff*0.6,22,64), rgb(T.m2c), 3.2);
  ctx.fillStyle=rgb(T.m2c); ctx.font='bold 11px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillText('Fm = '+P.Feff.toFixed(0)+' N', vx(n), freeY-6);
  // etichette
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace'; ctx.textAlign='left';
  ctx.fillText('T = P/'+n+' = '+(P.m2*G/n).toFixed(1)+' N', bx1+10, movY);
  ctx.fillText('vantaggio '+n+'×   ·   F_eq = M·g/n   ·   sforzo = n·h', cx-110, ly+hL+24);
  // ── forze (toggle) ──
  if(P.showForces){
    drawForces(ctx,[
      {x:bC,y:ly+hL/2,ox:20,fx:0,fy:P.m2*G,lbl:'P',col:rgb(FCOL.peso)},
      {x:bC,y:movY,ox:-(bx1-bx0)/2-14,fx:0,fy:-n*P.Feff,lbl:'n·T',col:rgb(FCOL.tens)},
    ]);
  }
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
const TITLES=['Posizione  s(t)','Velocità  v(t)','Forze / Tensioni (N)'];
function gBase(ctx,W,H,PAD){
  ctx.fillStyle=T.gBg; ctx.fillRect(0,0,W,H);
  const gW=W-PAD.l-PAD.r, gH=H-PAD.t-PAD.b;
  ctx.strokeStyle=T.gAxis; ctx.lineWidth=0.6;
  ctx.beginPath(); ctx.moveTo(PAD.l,PAD.t); ctx.lineTo(PAD.l,PAD.t+gH); ctx.lineTo(PAD.l+gW,PAD.t+gH); ctx.stroke();
  return {gW,gH};
}
function lineG(ctx,Wd,Hd,arr,mx,col){
  const PAD={t:14,b:16,l:24,r:8}; const {gW,gH}=gBase(ctx,Wd,Hd,PAD); const n=arr.length;
  const yOf=val=>PAD.t+gH/2 - clamp(val/mx,-1,1)*gH*0.44;
  ctx.strokeStyle=T.gAxis; ctx.lineWidth=0.4; ctx.beginPath(); ctx.moveTo(PAD.l,PAD.t+gH/2); ctx.lineTo(PAD.l+gW,PAD.t+gH/2); ctx.stroke();
  if(n>1){ ctx.strokeStyle=col; ctx.lineWidth=1.6; ctx.beginPath();
    for(let i=0;i<n;i++){ const x=PAD.l+i/(n-1)*gW, y=yOf(arr[i]); i?ctx.lineTo(x,y):ctx.moveTo(x,y);} ctx.stroke(); }
  return {PAD,gW,gH};
}
function drawGraphs(){
  for(let i=0;i<3;i++) if(gTitle[i]) gTitle[i].textContent=TITLES[i];
  if(gCanvas[0].width){ const g=lineG(gCtx[0],gCanvas[0].width,gCanvas[0].height,hsS,SMAX,rgb(T.m1c));
    gCtx[0].fillStyle=T.gText; gCtx[0].font='7px "Space Mono",monospace'; gCtx[0].textAlign='left'; gCtx[0].fillText('s',g.PAD.l+2,g.PAD.t+7); gCtx[0].textAlign='right'; gCtx[0].fillText('t',g.PAD.l+g.gW-2,g.PAD.t+g.gH-3); }
  if(gCanvas[1].width){ const mxv=Math.max(0.5,...hsV.map(Math.abs)); const g=lineG(gCtx[1],gCanvas[1].width,gCanvas[1].height,hsV,mxv,rgb(T.m2c));
    gCtx[1].fillStyle=T.gText; gCtx[1].font='7px "Space Mono",monospace'; gCtx[1].textAlign='left'; gCtx[1].fillText('v',g.PAD.l+2,g.PAD.t+7); gCtx[1].textAlign='right'; gCtx[1].fillText('t',g.PAD.l+g.gW-2,g.PAD.t+g.gH-3); }
  if(gCanvas[2].width){ const ctx=gCtx[2],Wd=gCanvas[2].width,Hd=gCanvas[2].height,PAD={t:16,b:18,l:10,r:8};
    const {gW,gH}=gBase(ctx,Wd,Hd,PAD); const t=tensions();
    let vals=[],labs=[],cols=[];
    if(P.mode==='uno'){ vals=[P.m1*G,t.T]; labs=['P','T']; cols=[rgb(T.m1c),T.accent]; }
    else if(P.mode==='due'){ vals=[P.m1*G,P.m2*G,t.T1,t.T2]; labs=['P₁','P₂','T₁','T₂']; cols=[rgb(T.m1c),rgb(T.m2c),T.accent,T.accent]; }
    else if(P.mode==='piano'){ vals=[P.m1*G,t.fr,t.T1,t.T2]; labs=['P₁','attr','T₁','T₂']; cols=[rgb(T.m1c),rgb(FCOL.attr),rgb(FCOL.tens),rgb(FCOL.tens)]; }
    else { vals=[P.Feff,P.m2*G/P.n,P.m2*G,t.F1]; labs=['F','F_eq','M·g','F₁']; cols=[rgb(FCOL.peso),rgb([150,180,210]),rgb(T.m2c),rgb(FCOL.norm)]; }
    const mx=Math.max(...vals,1e-6), n=vals.length;
    vals.forEach((vv,i)=>{ const cxb=PAD.l+gW*(i+0.5)/n, bw=gW/n*0.5, bh=clamp(vv/mx,0,1)*gH*0.8;
      ctx.fillStyle=cols[i]; ctx.fillRect(cxb-bw/2,PAD.t+gH-bh,bw,bh);
      ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText(labs[i],cxb,PAD.t+gH+9); ctx.fillText(Math.round(vv)+'',cxb,PAD.t+gH-bh-3); });
  }
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
function reControls(){ setTimeout(buildControls,0); }
function buildControls(){
  const cont=document.getElementById('controls'); cont.innerHTML='';
  const secM=Lab.Section('Modalità'); cont.appendChild(secM.el);
  secM.add(Lab.RadioGroup({ label:'Configurazione', value:P.mode,
    options:Object.keys(MODES).map(k=>({value:k,label:MODES[k]})), onChange(v){ P.mode=v; if(v==='multi'){ P.n=4; P.m2=6; P.Feff=Math.round(P.m2*G/P.n); } resetMotion(); reControls(); } }));

  const secC=Lab.Section('Carrucola'); cont.appendChild(secC.el);
  secC.add(Lab.Slider({ label:'Massa carrucola', min:0, max:6, step:0.1, value:P.Mp, unit:' kg', onChange(v){P.Mp=v; resetMotion();} }));
  secC.add(Lab.Slider({ label:'Raggio', min:0.15, max:0.40, step:0.01, value:P.r, unit:' m', onChange(v){P.r=v; resetMotion();} }));
  if(P.mode==='multi') secC.add(Lab.Slider({ label:'Numero di carrucole (pari)', min:2, max:6, step:2, value:P.n, unit:'', onChange(v){P.n=v; resetMotion();} }));

  const secP=Lab.Section('Masse e forze'); cont.appendChild(secP.el);
  if(P.mode==='multi'){
    secP.add(Lab.Slider({ label:'Carico M', min:0.5, max:12, step:0.1, value:P.m2, unit:' kg', onChange(v){P.m2=v; resetMotion();} }));
    secP.add(Lab.Slider({ label:'Forza di sforzo F', min:0, max:160, step:1, value:P.Feff, unit:' N', onChange(v){P.Feff=v; resetMotion();} }));
  } else {
    secP.add(Lab.Slider({ label: P.mode==='uno'?'Massa m':'Massa m₁', min:0.5, max:10, step:0.1, value:P.m1, unit:' kg', onChange(v){P.m1=v; resetMotion();} }));
    if(P.mode!=='uno') secP.add(Lab.Slider({ label: P.mode==='piano'?'Massa sul piano m₂':'Massa m₂', min:0.5, max:10, step:0.1, value:P.m2, unit:' kg', onChange(v){P.m2=v; resetMotion();} }));
    if(P.mode==='piano'){
      secP.add(Lab.Slider({ label:'Attrito dinamico μ', min:0, max:1, step:0.02, value:P.mu, unit:'', onChange(v){P.mu=v; resetMotion();} }));
      secP.add(Lab.Slider({ label:'Inclinazione θ', min:0, max:55, step:1, value:P.theta, unit:'°', onChange(v){P.theta=v; resetMotion();} }));
    }
  }

  const secV=Lab.Section('Visualizzazione'); cont.appendChild(secV.el);
  secV.add(Lab.Toggle({ label:'Mostra le forze', value:P.showForces, onChange(v){P.showForces=v;} }));
}

function initGraphs(){
  const ga=document.getElementById('graphArea');
  ga.style.cssText='display:flex;flex-direction:row;gap:5px;padding:5px 0 3px;height:150px;box-sizing:border-box;border-top:1px solid rgba(100,150,200,0.14);';
  for(let i=0;i<3;i++){
    const panel=document.createElement('div');
    panel.style.cssText='flex:1;min-width:0;position:relative;background:rgba(2,7,18,0.8);border:1px solid rgba(100,150,200,0.11);border-radius:4px;overflow:hidden;';
    const title=document.createElement('div'); title.textContent=TITLES[i];
    title.style.cssText='position:absolute;top:3px;left:6px;font-size:8px;color:rgba(100,175,200,0.65);font-family:"Space Mono",monospace;text-transform:uppercase;letter-spacing:0.4px;z-index:1;pointer-events:none;';
    const cv=document.createElement('canvas'); cv.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;';
    panel.appendChild(title); panel.appendChild(cv); ga.appendChild(panel);
    gCanvas[i]=cv; gCtx[i]=cv.getContext('2d'); gTitle[i]=title;
  }
}

// ═══ Init ═════════════════════════════════════════════════════════════════════
function resetMotion(){ s=0; v=0; tSim=0; hsS.length=0; hsV.length=0; }
function init(){
  Lab.initTheme();
  buildControls(); initGraphs();
  const simCanvas=document.getElementById('simCanvas');
  readout=new Lab.Readout(document.getElementById('readout'),[
    {key:'a',  label:'Accelerazione'},
    {key:'v',  label:'Velocità'},
    {key:'T',  label:'Tensione fune'},
    {key:'info',label:'Note'},
  ]);
  const btnPlay=document.getElementById('btnPlay');
  function syncPlay(){ btnPlay.textContent=P.paused?'▶  AVVIA':'⏸  PAUSA'; }
  syncPlay();
  btnPlay.addEventListener('click',()=>{ P.paused=!P.paused; syncPlay(); });
  document.getElementById('btnReset').addEventListener('click',()=>{
    P.mode='due'; P.Mp=1.0; P.r=0.15; P.m1=3.0; P.m2=1.5; P.mu=0.2; P.theta=0; P.n=2; P.Feff=30; P.showForces=false; P.paused=true;
    zoom=1; panX=0; panY=0; resetMotion(); buildControls(); syncPlay();
  });
  // zoom con la rotellina, trascina per spostare la vista
  simCanvas.addEventListener('wheel',e=>{ e.preventDefault(); zoom=clamp(zoom*(e.deltaY<0?1.12:0.89),0.4,3.5); },{passive:false});
  let panning=false, plx=0, ply=0;
  simCanvas.addEventListener('pointerdown',e=>{ panning=true; plx=e.clientX; ply=e.clientY; try{simCanvas.setPointerCapture(e.pointerId);}catch(_){} });
  simCanvas.addEventListener('pointermove',e=>{ if(!panning)return; panX+=(e.clientX-plx); panY+=(e.clientY-ply); plx=e.clientX; ply=e.clientY; });
  simCanvas.addEventListener('pointerup',()=>{ panning=false; });
  simCanvas.style.cursor='grab';

  function resize(){
    const area=document.querySelector('.lab-canvas-area'); if(!area)return;
    const ar=area.getBoundingClientRect();
    const rb=document.getElementById('readout').getBoundingClientRect();
    const ga=document.getElementById('graphArea'); const gaH=ga?ga.offsetHeight:0;
    const h=Math.max(240,Math.floor(ar.height-rb.height-gaH-4));
    simCanvas.style.width=Math.floor(ar.width)+'px'; simCanvas.style.height=h+'px';
    simCanvas.width=Math.floor(ar.width); simCanvas.height=h;
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
    if(!P.paused) tSim+=dt;
    try{
      step(dt); draw(simCanvas); drawGraphs();
      const a=accel(), t=tensions();
      readout.set('a', fmt(a,' m/s²'));
      readout.set('v', fmt(v,' m/s'));
      readout.set('T', P.mode==='due' ? 'T₁='+fmt(t.T1)+'  T₂='+fmt(t.T2)+' N' : fmt(t.T||0,' N'));
      readout.set('info', P.mode==='multi' ? ('vantaggio '+P.n+'×') : P.mode==='piano' ? ('μ='+P.mu.toFixed(2)) : 'I=½M r²');
    }catch(err){ console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
