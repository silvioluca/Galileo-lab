'use strict';

// ═══ Stato ════════════════════════════════════════════════════════════════════
const MODES = { piana:'Piana', circolare:'Circolare', cilindrica:'Cilindrica', sferica:'Sferica', corda:'Onda su corda' };
const TWO=Math.PI*2;

const P = {
  mode:'piana',
  pol:'trasversale',   // trasversale | longitudinale
  v:0.5,               // velocità (m/s)
  lambda:1.2,          // lunghezza d'onda (m)
  A:0.18,              // ampiezza (m)
  // corda
  T:60,                // tensione (N)
  mu:0.05,             // densità lineare (kg/m)
  damp:0.06,           // smorzamento della corda
  paused:false,
};

let tAnim=0, last=0;
// ── simulazione della corda (equazione delle onde 1D) ──
let strN=0, syA=null, syB=null;      // syA = attuale, syB = precedente (px di spostamento)
let grabIdx=-1, grabY=0, cyStr=0;
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
    crest: [255,170,75],          // cresta (positivo)
    trough:[70,150,235],          // ventre (negativo)
    frontLine: d?'rgba(255,255,255,0.42)':'rgba(20,55,95,0.6)',   // fronti visibili su entrambi i temi
    string:d?'#ffe24a':'#0a78b0',                                  // corda ben visibile (giallo / blu)
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
const lerp=(a,b,t)=>a+(b-a)*t;
function colU(u){ // u in [-1,1] → blu(ventre) ... arancio(cresta)
  const c=T.crest, w=T.trough, t=(u+1)/2;
  return `rgb(${lerp(w[0],c[0],t)|0},${lerp(w[1],c[1],t)|0},${lerp(w[2],c[2],t)|0})`;
}

// ═══ Fisica ═══════════════════════════════════════════════════════════════════
function freq(){ return P.v/P.lambda; }                 // f = v/λ
function omega(){ return TWO*freq(); }
function vString(){ return Math.sqrt(P.T/P.mu); }        // v = √(T/μ)
function fmt(x,u){ return (Math.abs(x)<10?x.toFixed(2):x.toFixed(1))+(u||''); }

// ═══ Geometria ════════════════════════════════════════════════════════════════
let G={};
function geom(W,H){
  const SCALE=clamp(W/7, 70, 130);                       // px per metro
  G={W,H,SCALE, cx:W*0.5, cy:H*0.52};
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
  if(lbl){ ctx.font='bold 11px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText(lbl,(x1+x2)/2,Math.min(y1,y2)-6); }
}

function draw(canvas){
  const ctx=canvas.getContext('2d');
  const W=canvas.width,H=canvas.height;
  T=pal(); ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  drawGrid(ctx,W,H);
  geom(W,H);
  if(P.mode==='corda') drawString(ctx,W,H);
  else if(P.mode==='cilindrica'||P.mode==='sferica') drawWaveVolume(ctx,W,H);
  else drawWave(ctx,W,H);

  // intestazione
  ctx.textAlign='left'; ctx.fillStyle=T.accent; ctx.font='bold 14px "Space Mono",monospace';
  ctx.fillText('Onde — '+MODES[P.mode], 14, 22);
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace';
  if(P.mode==='corda') ctx.fillText('estremi fissi · l\'impulso si propaga e si riflette · v = √(T/μ) = '+fmt(vString(),' m/s'), 14, 39);
  else ctx.fillText('v = '+fmt(P.v,' m/s')+'   ·   λ = '+fmt(P.lambda,' m')+'   ·   f = v/λ = '+fmt(freq(),' Hz')+'   ·   '+P.pol+' · vista isometrica 3D', 14, 39);
}

// ── onde propaganti: griglia di particelle del mezzo in vista isometrica 3D ──
const ICOS=0.866, ISIN=0.5;
function drawWave(ctx,W,H){
  const spanX=6, spanY=4, dm=0.2, r0=0.45;          // metri
  const S=clamp(Math.min(0.88*W/((spanX+spanY)*ICOS), 0.78*H/((spanX+spanY)*ISIN)), 22, 120);
  const cx=W*0.5, cy=H*0.40, k=TWO/P.lambda, w=omega(), Aamp=P.A;
  const radial=(P.mode!=='piana'), cols=Math.round(spanX/dm), rows=Math.round(spanY/dm);
  const proj=(wx,wy,wz)=>({sx:cx+(wx-wy)*ICOS*S, sy:cy+(wx+wy)*ISIN*S - wz*S});
  const dots=[];
  for(let i=0;i<=cols;i++) for(let j=0;j<=rows;j++){
    let wx=i*dm-spanX/2, wy=j*dm-spanY/2, wz=0, amp=1, c=0,sn=0, rr;
    if(radial){ rr=Math.hypot(wx,wy)||1e-3; amp=(P.mode==='sferica')? r0/Math.max(rr,r0) : Math.sqrt(r0/Math.max(rr,r0)); c=wx/rr; sn=wy/rr; }
    else rr=wx+spanX/2;
    const u=Math.sin(k*rr - w*tAnim);
    if(P.pol==='longitudinale'){ if(radial){ wx+=c*Aamp*amp*u; wy+=sn*Aamp*amp*u; } else wx+=Aamp*u; }
    else wz=Aamp*amp*u;                              // trasversale → fuori dal piano (z)
    const p=proj(wx,wy,wz);
    dots.push({sx:p.sx, sy:p.sy, o:i+j, u:clamp(u*amp,-1,1)});
  }
  dots.sort((a,b)=>a.o-b.o);                          // back-to-front
  for(const d of dots){ ctx.fillStyle=colU(d.u); ctx.globalAlpha=clamp(0.42+0.58*Math.abs(d.u),0.28,1);
    ctx.beginPath(); ctx.arc(d.sx,d.sy,2.7,0,TWO); ctx.fill(); }
  ctx.globalAlpha=1;
  // ── fronti d'onda bianchi che si espandono (spessore uniforme, semitrasparenti) ──
  ctx.strokeStyle=T.frontLine; ctx.lineWidth=1.5; ctx.lineJoin='round';
  const off=((P.v*tAnim)%P.lambda+P.lambda)%P.lambda;
  if(!radial){                                        // piana → piani perpendicolari alla propagazione
    ctx.globalAlpha=1;
    for(let m=0;;m++){ const wx=-spanX/2+off+m*P.lambda; if(wx>spanX/2) break;
      const a=proj(wx,-spanY/2,0.5), b=proj(wx,spanY/2,0.5), c=proj(wx,spanY/2,-0.5), d2=proj(wx,-spanY/2,-0.5);
      ctx.beginPath(); ctx.moveTo(a.sx,a.sy); ctx.lineTo(b.sx,b.sy); ctx.lineTo(c.sx,c.sy); ctx.lineTo(d2.sx,d2.sy); ctx.closePath(); ctx.stroke(); }
  } else {                                            // circolare → cerchi sul piano
    const maxR=Math.hypot(spanX,spanY);
    for(let m=0;;m++){ const R=off+m*P.lambda; if(R>maxR) break; if(R<0.05) continue;
      ctx.globalAlpha=clamp(0.6/Math.sqrt(Math.max(R,0.45)),0.35,1);
      ctx.beginPath(); for(let q=0;q<=60;q++){ const th=q/60*TWO, p=proj(R*Math.cos(th),R*Math.sin(th),0); q?ctx.lineTo(p.sx,p.sy):ctx.moveTo(p.sx,p.sy);} ctx.stroke(); }
    ctx.globalAlpha=1;
  }
  // ── sorgente + direzione di propagazione ──
  if(radial){ const p=proj(0,0,0); ctx.fillStyle=rgb(T.crest); ctx.beginPath(); ctx.arc(p.sx,p.sy,5,0,TWO); ctx.fill();
    if(P.mode==='cilindrica'){ const a=proj(0,0,0.6), b=proj(0,0,-0.6); ctx.strokeStyle=rgba(T.crest,0.6); ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(a.sx,a.sy); ctx.lineTo(b.sx,b.sy); ctx.stroke(); } }
  else { const a=proj(-spanX/2,-spanY/2,0), b=proj(-spanX/2+1.2,-spanY/2,0); arrow(ctx,a.sx,a.sy,b.sx,b.sy,T.accent,2.6,'v'); }
}

// ── onde con fronti curvi: nuvola di punti 3D (gusci sferici / cilindrici) in vista isometrica ──
function drawWaveVolume(ctx,W,H){
  const sph=(P.mode==='sferica');
  const spanXY=2.2, spanZ=sph?2.2:1.6, dm=0.2, r0=0.5;    // alta densità di punti
  const S=clamp(Math.min(0.80*W/((2*spanXY)*ICOS), 0.80*H/(2*spanXY*ISIN+2*spanZ)), 18, 110);
  const cx=W*0.5, cy=H*0.40, k=TWO/P.lambda, w=omega(), Aamp=P.A;
  const proj=(wx,wy,wz)=>({sx:cx+(wx-wy)*ICOS*S, sy:cy+(wx+wy)*ISIN*S - wz*S});
  const dots=[];
  for(let x=-spanXY;x<=spanXY+1e-6;x+=dm) for(let y=-spanXY;y<=spanXY+1e-6;y+=dm) for(let z=-spanZ;z<=spanZ+1e-6;z+=dm){
    const r = sph? Math.hypot(x,y,z) : Math.hypot(x,y);    // sferica: raggio 3D · cilindrica: distanza dall'asse z
    if(r<1e-3) continue;
    const u=Math.sin(k*r - w*tAnim);
    if(Math.abs(u)<0.6) continue;                          // solo i punti coerenti col fronte
    const amp = sph? r0/Math.max(r,r0) : Math.sqrt(r0/Math.max(r,r0));
    let wx=x, wy=y, wz=z;
    if(P.pol==='longitudinale'){ const d=Aamp*amp*u; wx+=x/r*d; wy+=y/r*d; if(sph) wz+=z/r*d; }
    const depthN=clamp(((wx+wy)/(2*spanXY)+1)/2,0,1);      // profondità isometrica → ombreggiatura 3D
    const a=Math.pow((Math.abs(u)-0.6)/0.4,1.1)*amp*(0.35+0.65*depthN);
    if(a<0.05) continue;
    const p=proj(wx,wy,wz);
    dots.push({sx:p.sx, sy:p.sy, o:wx+wy, u:clamp(u,-1,1), a:clamp(a,0,1), sz:1.7+1.7*depthN});
  }
  dots.sort((p,q)=>p.o-q.o);                               // back-to-front (i vicini coprono i lontani)
  for(const d of dots){ ctx.fillStyle=colU(d.u); ctx.globalAlpha=Math.max(0.05,d.a); ctx.beginPath(); ctx.arc(d.sx,d.sy,d.sz,0,TWO); ctx.fill(); }
  ctx.globalAlpha=1;
  // ── fronti: sfere (silhouette + equatore + 2 meridiani) · cilindri (ellissi + generatrici) ──
  const ps=proj(0,0,0);
  ctx.strokeStyle=T.frontLine; ctx.lineWidth=1.5; ctx.lineJoin='round';
  const off=((P.v*tAnim)%P.lambda+P.lambda)%P.lambda, maxR=sph?Math.hypot(spanXY,spanXY,spanZ):Math.hypot(spanXY,spanXY);
  const ell=(R,pl)=>{ ctx.beginPath(); for(let q=0;q<=56;q++){ const th=q/56*TWO; const pt= pl==='xy'?proj(R*Math.cos(th),R*Math.sin(th),0): pl==='xz'?proj(R*Math.cos(th),0,R*Math.sin(th)):proj(0,R*Math.cos(th),R*Math.sin(th)); q?ctx.lineTo(pt.sx,pt.sy):ctx.moveTo(pt.sx,pt.sy);} ctx.stroke(); };
  for(let m=0;;m++){ const R=off+m*P.lambda; if(R>maxR) break; if(R<0.1) continue;
    if(sph){ const al=clamp(0.6/Math.max(R,0.5),0.3,1);
      ctx.globalAlpha=al; ctx.beginPath(); ctx.arc(ps.sx,ps.sy,R*S,0,TWO); ctx.stroke();   // silhouette
      ctx.globalAlpha=al*0.55; ell(R,'xy'); ell(R,'xz'); ell(R,'yz');                       // equatore + 2 meridiani
    } else {
      ctx.globalAlpha=clamp(0.7/Math.sqrt(Math.max(R,0.5)),0.35,1);
      const top=[],bot=[]; for(let q=0;q<=56;q++){ const th=q/56*TWO; top.push(proj(R*Math.cos(th),R*Math.sin(th),spanZ)); bot.push(proj(R*Math.cos(th),R*Math.sin(th),-spanZ)); }
      ctx.beginPath(); top.forEach((p,i)=>i?ctx.lineTo(p.sx,p.sy):ctx.moveTo(p.sx,p.sy)); ctx.stroke();
      ctx.beginPath(); bot.forEach((p,i)=>i?ctx.lineTo(p.sx,p.sy):ctx.moveTo(p.sx,p.sy)); ctx.stroke();
      let iMin=0,iMax=0; for(let i=1;i<top.length;i++){ if(top[i].sx<top[iMin].sx)iMin=i; if(top[i].sx>top[iMax].sx)iMax=i; }
      ctx.beginPath(); ctx.moveTo(top[iMin].sx,top[iMin].sy); ctx.lineTo(bot[iMin].sx,bot[iMin].sy); ctx.moveTo(top[iMax].sx,top[iMax].sy); ctx.lineTo(bot[iMax].sx,bot[iMax].sy); ctx.stroke();
    }
  }
  ctx.globalAlpha=1;
  ctx.fillStyle=rgb(T.crest); ctx.beginPath(); ctx.arc(ps.sx,ps.sy,5,0,TWO); ctx.fill();
  if(!sph){ const a=proj(0,0,spanZ), b=proj(0,0,-spanZ); ctx.strokeStyle=rgba(T.crest,0.5); ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(a.sx,a.sy); ctx.lineTo(b.sx,b.sy); ctx.stroke(); }
}

// ── corda elastica: equazione delle onde 1D con estremi assorbenti (niente onde stazionarie) ──
function ensureString(W){
  const N=clamp(Math.floor(W/4),120,360);
  if(strN!==N){ strN=N; syA=new Array(N).fill(0); syB=new Array(N).fill(0); }
}
function stepString(dt,W,H){
  ensureString(W); cyStr=H*0.5; const N=strN; if(N<3) return;
  const C=clamp(vString()/90*0.96, 0.28, 0.96);      // Courant ∝ velocità: corda più rigida e reattiva
  const nSub=clamp(Math.round(dt*180),1,6), dv=1-clamp(P.damp,0,1)*0.05;
  for(let s=0;s<nSub;s++){
    const cur=syA, prev=syB, nxt=new Array(N);
    for(let i=1;i<N-1;i++){ nxt[i]=2*cur[i]-prev[i]+C*C*(cur[i+1]-2*cur[i]+cur[i-1]); nxt[i]=cur[i]+(nxt[i]-cur[i])*dv; }
    nxt[0]=0; nxt[N-1]=0;                             // estremi FISSI (l'impulso si riflette)
    if(grabIdx>0 && grabIdx<N-1){ for(let d=-2;d<=2;d++){ const i=grabIdx+d; if(i>0&&i<N-1) nxt[i]=grabY; } }   // mano che trattiene
    syB=cur; syA=nxt;
  }
}
function drawString(ctx,W,H){
  ensureString(W); const N=strN, cy=H*0.5, dx=W/(N-1);
  // linea di equilibrio
  ctx.strokeStyle=rgba([150,170,200],0.28); ctx.lineWidth=1; ctx.setLineDash([5,5]); ctx.beginPath(); ctx.moveTo(0,cy); ctx.lineTo(W,cy); ctx.stroke(); ctx.setLineDash([]);
  // ombra + corda (con leggero spessore variabile per realismo)
  ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=6; ctx.beginPath();
  for(let i=0;i<N;i++){ const x=i*dx, y=cy+syA[i]+2.5; i?ctx.lineTo(x,y):ctx.moveTo(x,y); } ctx.stroke();
  ctx.save(); ctx.shadowColor=T.string; ctx.shadowBlur=6;
  ctx.strokeStyle=T.string; ctx.lineWidth=4; ctx.beginPath();
  for(let i=0;i<N;i++){ const x=i*dx, y=cy+syA[i]; i?ctx.lineTo(x,y):ctx.moveTo(x,y); } ctx.stroke(); ctx.restore();
  // morsetti agli estremi FISSI
  ctx.fillStyle=rgb([150,170,200]); ctx.fillRect(-2,cy-22,10,44); ctx.fillRect(W-8,cy-22,10,44);
  ctx.strokeStyle=rgba([0,0,0],0.4); ctx.lineWidth=1.5; ctx.strokeRect(-2,cy-22,10,44); ctx.strokeRect(W-8,cy-22,10,44);
  // punto afferrato
  if(grabIdx>=0){ ctx.fillStyle=rgb(T.crest); ctx.beginPath(); ctx.arc(grabIdx*dx, cy+grabY, 6, 0, TWO); ctx.fill(); }
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillText('clicca e trascina la corda per generare un impulso · estremi fissi (l\'onda si riflette)', W/2, cy+H*0.32);
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
  const titles = P.mode==='corda'
    ? ['Profilo y(x) — impulso','v = √(T/μ)','v in funzione di μ']
    : ['Profilo onda','f = v/λ','Ampiezza vs distanza'];
  for(let i=0;i<3;i++) if(gTitle[i]) gTitle[i].textContent=titles[i];

  // 1: profilo
  if(gCanvas[0].width){ const cv=gCanvas[0],ctx=gCtx[0],W=cv.width,H=cv.height,PAD={t:14,b:14,l:18,r:8};
    const {gW,gH}=gBase(ctx,W,H,PAD); ctx.strokeStyle=rgb(T.crest); ctx.lineWidth=1.6; ctx.beginPath();
    for(let i=0;i<=120;i++){ const f=i/120, x=PAD.l+f*gW;
      let u=0;
      if(P.mode==='corda'){ if(syA&&strN>1){ const idx=clamp(Math.round(f*(strN-1)),0,strN-1); u=clamp(-syA[idx]/55,-1,1); } }
      else { const rm=f*6, decay=(P.mode==='piana')?1:(P.mode==='sferica')?0.45/Math.max(rm,0.45):Math.sqrt(0.45/Math.max(rm,0.45)); u=Math.sin(TWO/P.lambda*rm - omega()*tAnim)*decay; }
      const y=PAD.t+gH/2 - u*gH*0.42; i?ctx.lineTo(x,y):ctx.moveTo(x,y); }
    ctx.stroke();
    ctx.strokeStyle=T.gAxis; ctx.lineWidth=0.4; ctx.beginPath(); ctx.moveTo(PAD.l,PAD.t+gH/2); ctx.lineTo(PAD.l+gW,PAD.t+gH/2); ctx.stroke(); }
  // 2: relazione
  if(gCanvas[1].width){ const cv=gCanvas[1],ctx=gCtx[1],W=cv.width,H=cv.height,PAD={t:14,b:16,l:26,r:8};
    const {gW,gH}=gBase(ctx,W,H,PAD);
    if(P.mode==='corda'){ const Tmax=200, vmax=Math.sqrt(Tmax/P.mu);
      const xOf=tt=>PAD.l+tt/Tmax*gW, yOf=vv=>PAD.t+gH-clamp(vv/vmax,0,1)*gH*0.9;
      ctx.strokeStyle=T.accent; ctx.lineWidth=1.6; ctx.beginPath();
      for(let tt=0;tt<=Tmax;tt+=Tmax/60){ const x=xOf(tt),y=yOf(Math.sqrt(tt/P.mu)); tt===0?ctx.moveTo(x,y):ctx.lineTo(x,y);} ctx.stroke();
      ctx.fillStyle=rgb(T.crest); ctx.beginPath(); ctx.arc(xOf(P.T),yOf(vString()),3.4,0,TWO); ctx.fill();
      ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('v',PAD.l+2,PAD.t+7); ctx.textAlign='right'; ctx.fillText('T',PAD.l+gW-2,PAD.t+gH-3);
    } else { const lmax=3.2, fmax=P.v/0.4;
      const xOf=l=>PAD.l+l/lmax*gW, yOf=ff=>PAD.t+gH-clamp(ff/fmax,0,1)*gH*0.9;
      ctx.strokeStyle=T.accent; ctx.lineWidth=1.6; ctx.beginPath();
      for(let l=0.4;l<=lmax;l+=0.05){ const x=xOf(l),y=yOf(P.v/l); l<=0.4?ctx.moveTo(x,y):ctx.lineTo(x,y);} ctx.stroke();
      ctx.fillStyle=rgb(T.crest); ctx.beginPath(); ctx.arc(xOf(P.lambda),yOf(freq()),3.4,0,TWO); ctx.fill();
      ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('f',PAD.l+2,PAD.t+7); ctx.textAlign='right'; ctx.fillText('λ',PAD.l+gW-2,PAD.t+gH-3);
    } }
  // 3: armoniche / decadimento
  if(gCanvas[2].width){ const cv=gCanvas[2],ctx=gCtx[2],W=cv.width,H=cv.height,PAD={t:16,b:18,l:14,r:8};
    const {gW,gH}=gBase(ctx,W,H,PAD);
    if(P.mode==='corda'){ const mumax=0.20, vmax=Math.sqrt(P.T/0.01);
      const xOf=mm=>PAD.l+mm/mumax*gW, yOf=vv=>PAD.t+gH-clamp(vv/vmax,0,1)*gH*0.9;
      ctx.strokeStyle=T.accent; ctx.lineWidth=1.6; ctx.beginPath();
      for(let mm=0.01;mm<=mumax;mm+=mumax/60){ const x=xOf(mm),y=yOf(Math.sqrt(P.T/mm)); mm<=0.01?ctx.moveTo(x,y):ctx.lineTo(x,y);} ctx.stroke();
      ctx.fillStyle=rgb(T.crest); ctx.beginPath(); ctx.arc(xOf(P.mu),yOf(vString()),3.4,0,TWO); ctx.fill();
      ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('v',PAD.l+2,PAD.t+7); ctx.textAlign='right'; ctx.fillText('μ',PAD.l+gW-2,PAD.t+gH-3);
    } else { // ampiezza vs r
      const xOf=r=>PAD.l+r/3*gW, yOf=a=>PAD.t+gH-clamp(a,0,1)*gH*0.86;
      ctx.strokeStyle=T.accent; ctx.lineWidth=1.6; ctx.beginPath();
      for(let r=0.1;r<=3;r+=0.04){ const a=(P.mode==='piana')?1:(P.mode==='sferica')?0.45/Math.max(r,0.45):Math.sqrt(0.45/Math.max(r,0.45)); const x=xOf(r),y=yOf(a); r<=0.1?ctx.moveTo(x,y):ctx.lineTo(x,y);} ctx.stroke();
      ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('A',PAD.l+2,PAD.t+7); ctx.textAlign='right'; ctx.fillText('r',PAD.l+gW-2,PAD.t+gH-3);
    } }
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
function reControls(){ setTimeout(()=>{ buildControls(); buildReadout(); },0); }
function buildControls(){
  const cont=document.getElementById('controls'); cont.innerHTML='';
  const secM=Lab.Section('Modalità'); cont.appendChild(secM.el);
  secM.add(Lab.RadioGroup({ label:'Geometria / tipo', value:P.mode,
    options:Object.keys(MODES).map(k=>({value:k,label:MODES[k]})), onChange(v){ P.mode=v; reControls(); } }));

  if(P.mode==='corda'){
    const s=Lab.Section('Corda'); cont.appendChild(s.el);
    s.add(Lab.Slider({ label:'Tensione T', min:5, max:200, step:1, value:P.T, unit:' N', onChange(v){P.T=v;} }));
    s.add(Lab.Slider({ label:'Densità lineare μ', min:0.01, max:0.20, step:0.01, value:P.mu, unit:' kg/m', onChange(v){P.mu=v;} }));
    s.add(Lab.Slider({ label:'Smorzamento', min:0, max:1, step:0.02, value:P.damp, unit:'', onChange(v){P.damp=v;} }));
  } else {
    const sp=Lab.Section('Polarizzazione'); cont.appendChild(sp.el);
    sp.add(Lab.RadioGroup({ label:'Direzione di oscillazione', value:P.pol,
      options:[{value:'trasversale',label:'Trasversale'},{value:'longitudinale',label:'Longitudinale'}], onChange(v){P.pol=v;} }));
    const s=Lab.Section('Onda'); cont.appendChild(s.el);
    s.add(Lab.Slider({ label:'Velocità v', min:0.5, max:8, step:0.1, value:P.v, unit:' m/s', onChange(v){P.v=v;} }));
    s.add(Lab.Slider({ label:"Lunghezza d'onda λ", min:0.4, max:3, step:0.05, value:P.lambda, unit:' m', onChange(v){P.lambda=v;} }));
    s.add(Lab.Slider({ label:'Ampiezza', min:0.04, max:0.45, step:0.01, value:P.A, unit:' m', onChange(v){P.A=v;} }));
  }
}

function buildReadout(){
  const cont=document.getElementById('readout'); cont.innerHTML='';
  let fields;
  if(P.mode==='corda') fields=[{key:'T',label:'Tensione'},{key:'mu',label:'Densità μ'},{key:'v',label:'Velocità v'},{key:'damp',label:'Smorzamento'},{key:'act',label:'Azione'}];
  else fields=[{key:'v',label:'Velocità v'},{key:'lam',label:'Lunghezza λ'},{key:'f',label:'Frequenza f'},{key:'per',label:'Periodo T'},{key:'tipo',label:'Tipo'}];
  readout=new Lab.Readout(cont,fields);
}

function initGraphs(){
  const ga=document.getElementById('graphArea');
  ga.style.cssText='display:flex;flex-direction:row;gap:5px;padding:5px 0 3px;height:150px;box-sizing:border-box;border-top:1px solid rgba(100,150,200,0.14);';
  for(let i=0;i<3;i++){
    const panel=document.createElement('div');
    panel.style.cssText='flex:1;min-width:0;position:relative;background:rgba(2,7,18,0.8);border:1px solid rgba(100,150,200,0.11);border-radius:4px;overflow:hidden;';
    const title=document.createElement('div'); title.textContent='';
    title.style.cssText='position:absolute;top:3px;left:6px;font-size:8px;color:rgba(100,175,200,0.65);font-family:"Space Mono",monospace;text-transform:uppercase;letter-spacing:0.4px;z-index:1;pointer-events:none;';
    const cv=document.createElement('canvas'); cv.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;';
    panel.appendChild(title); panel.appendChild(cv); ga.appendChild(panel);
    gCanvas[i]=cv; gCtx[i]=cv.getContext('2d'); gTitle[i]=title;
  }
}

// ═══ Init ═════════════════════════════════════════════════════════════════════
function init(){
  Lab.initTheme();
  buildControls(); initGraphs(); buildReadout();
  const simCanvas=document.getElementById('simCanvas');
  const btnPlay=document.getElementById('btnPlay');
  function syncPlay(){ btnPlay.textContent=P.paused?'▶  AVVIA':'⏸  PAUSA'; }
  syncPlay();
  btnPlay.addEventListener('click',()=>{ P.paused=!P.paused; syncPlay(); });
  document.getElementById('btnReset').addEventListener('click',()=>{
    P.mode='piana'; P.pol='trasversale'; P.v=3.0; P.lambda=1.2; P.A=0.18;
    P.T=60; P.mu=0.05; P.damp=0.06; P.paused=false;
    if(syA){ syA.fill(0); syB.fill(0); } grabIdx=-1;
    buildControls(); buildReadout(); syncPlay();
  });
  // interazione corda: clicca e trascina per generare l'impulso
  function evt(e){ const r=simCanvas.getBoundingClientRect(); return {x:(e.clientX-r.left)*(simCanvas.width/r.width), y:(e.clientY-r.top)*(simCanvas.height/r.height)}; }
  simCanvas.addEventListener('pointerdown',e=>{ if(P.mode!=='corda'||strN<2)return; const p=evt(e), dx=simCanvas.width/(strN-1);
    grabIdx=clamp(Math.round(p.x/dx),0,strN-1); grabY=p.y-simCanvas.height*0.5; try{simCanvas.setPointerCapture(e.pointerId);}catch(_){} });
  simCanvas.addEventListener('pointermove',e=>{ if(grabIdx<0)return; const p=evt(e), dx=simCanvas.width/(strN-1);
    grabIdx=clamp(Math.round(p.x/dx),0,strN-1); grabY=p.y-simCanvas.height*0.5; });
  simCanvas.addEventListener('pointerup',()=>{ grabIdx=-1; });
  simCanvas.style.cursor='crosshair';

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
    if(!P.paused){ tAnim+=dt; if(P.mode==='corda') stepString(dt, simCanvas.width, simCanvas.height); }
    try{
      draw(simCanvas); drawGraphs();
      if(P.mode==='corda'){
        readout.set('T', P.T.toFixed(0)+' N'); readout.set('mu', P.mu.toFixed(2)+' kg/m');
        readout.set('v', fmt(vString(),' m/s')); readout.set('damp', P.damp.toFixed(2));
        readout.set('act', grabIdx>=0?'tieni e rilascia':'clicca la corda');
      } else {
        readout.set('v', fmt(P.v,' m/s')); readout.set('lam', fmt(P.lambda,' m')); readout.set('f', fmt(freq(),' Hz'));
        readout.set('per', fmt(1/freq(),' s')); readout.set('tipo', P.pol);
      }
    }catch(err){ console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
