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
function fmt(x,u){ return Lab.fmt(x, Math.abs(x)<10?2:1)+(u||''); }

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
  const [ctx, W, H] = Lab.ctx2d(canvas);
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
// attenuazione geometrica dell'ampiezza: costante (piana), 1/√r (circolare, cilindrica), 1/r (sferica)
function decayAt(r){ const r0=0.45; return P.mode==='piana'?1:P.mode==='sferica'?r0/Math.max(r,r0):Math.sqrt(r0/Math.max(r,r0)); }
function drawGraphs(){
  const cr=rgb(T.crest);
  if(P.mode==='corda'){
    // 1: profilo dell'impulso sulla corda
    let g=Lab.panel(gCanvas[0],{ title:'Profilo della corda y(x)', xr:[0,1], xStep:0.25, xFmt:v=>Lab.fmt(v*100,0)+'%', yr:[-1,1], yStep:0.5, xLabel:'posizione lungo la corda' });
    if(g){ const [ctx,f]=g; if(syA&&strN>1) Lab.plot(ctx,f,u=>clamp(-syA[clamp(Math.round(u*(strN-1)),0,strN-1)]/55,-1,1),[0,1],cr,1.8,[],240); }
    // 2: v = √(T/μ) al variare della tensione
    g=Lab.panel(gCanvas[1],{ title:`Velocità v = √(T/μ) (m/s), μ = ${Lab.fmt(P.mu,2)} kg/m`, xr:[0,200], xStep:50, yr:[0,Lab.niceMax(Math.sqrt(200/P.mu)*1.05)], xLabel:'tensione T (N)' });
    if(g){ const [ctx,f]=g; Lab.plot(ctx,f,tt=>Math.sqrt(tt/P.mu),[0,200],T.accent,2); Lab.dot(ctx,f,P.T,vString(),cr,4.5); }
    // 3: v al variare della densità lineare
    g=Lab.panel(gCanvas[2],{ title:`Velocità v (m/s) con T = ${Lab.fmt(P.T,0)} N`, xr:[0,0.2], xStep:0.05, yr:[0,Lab.niceMax(Math.sqrt(P.T/0.01)*1.05)], xLabel:'densità lineare μ (kg/m)' });
    if(g){ const [ctx,f]=g; Lab.plot(ctx,f,mm=>Math.sqrt(P.T/mm),[0.01,0.2],T.accent,2); Lab.dot(ctx,f,P.mu,vString(),cr,4.5); }
    return;
  }
  // 1: profilo dell'onda lungo la direzione di propagazione, con l'attenuazione geometrica
  let g=Lab.panel(gCanvas[0],{ title:'Profilo dell’onda lungo il raggio', xr:[0,6], xStep:1, yr:[-1,1], yStep:0.5, xLabel:'distanza (m)' });
  if(g){ const [ctx,f]=g;
    if(P.mode!=='piana'){ Lab.plot(ctx,f,decayAt,[0,6],f.C.text,1,[3,3]); Lab.plot(ctx,f,r=>-decayAt(r),[0,6],f.C.text,1,[3,3]); }
    Lab.plot(ctx,f,r=>Math.sin(TWO/P.lambda*r-omega()*tAnim)*decayAt(r),[0,6],cr,1.8,[],400); }
  // 2: f = v/λ a velocità fissa
  g=Lab.panel(gCanvas[1],{ title:`Frequenza f = v/λ (Hz), v = ${Lab.fmt(P.v,1)} m/s`, xr:[0,3], xStep:0.5, yr:[0,Lab.niceMax(P.v/0.4*1.05)], xLabel:'λ (m)' });
  if(g){ const [ctx,f]=g; Lab.plot(ctx,f,l=>P.v/l,[0.4,3],T.accent,2); Lab.dot(ctx,f,P.lambda,freq(),cr,4.5); }
  // 3: ampiezza relativa in funzione della distanza per i quattro tipi di fronte d'onda
  g=Lab.panel(gCanvas[2],{ title:'Ampiezza relativa in funzione della distanza', xr:[0,3], xStep:0.5, yr:[0,1.1], yStep:0.25, xLabel:'distanza (m)' });
  if(g){ const [ctx,f]=g, r0=0.45;
    const curves=[['piana',()=>1,'piana: costante'],['circolare',r=>Math.sqrt(r0/Math.max(r,r0)),'circolare e cilindrica: 1/√r'],['sferica',r=>r0/Math.max(r,r0),'sferica: 1/r']];
    for(const [k,fn] of curves){ const on=P.mode===k||(k==='circolare'&&P.mode==='cilindrica'); Lab.plot(ctx,f,fn,[0,3],on?T.accent:f.C.text,on?2.2:1,on?[]:[3,3]); }
    const lab=curves.find(([k])=>P.mode===k||(k==='circolare'&&P.mode==='cilindrica'));
    Lab.legend(ctx,f.L+8,f.B-10,[[T.accent,lab?lab[2]:'']]); }
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
function reControls(){ setTimeout(()=>{ buildControls(); buildReadout(); },0); }
function buildControls(){
  const cont=document.getElementById('controls'); cont.innerHTML='';
  const secM=Lab.Section('Modalità'); cont.appendChild(secM.el);
  secM.add(Lab.RadioGroup({ label:'Forma del fronte d’onda', value:P.mode,
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
  if(P.mode==='corda') fields=[{key:'T',label:'tensione T'},{key:'mu',label:'densità lineare μ'},{key:'v',label:'velocità v = √(T/μ)'},{key:'damp',label:'smorzamento'},{key:'act',label:'come si usa'}];
  else fields=[{key:'v',label:'velocità v'},{key:'lam',label:'lunghezza d’onda λ'},{key:'f',label:'frequenza f = v/λ'},{key:'per',label:'periodo T = 1/f'},{key:'tipo',label:'oscillazione'}];
  readout=new Lab.Readout(cont,fields);
}

function initGraphs() {
  // riga di grafici standard; i titoli sono disegnati dentro i grafici
  gCanvas = Lab.graphPanels(document.getElementById('graphArea'), 3);
  gCtx = gCanvas.map(c => c.getContext('2d'));
  gTitle = gCanvas.map(() => ({ textContent: '' }));
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
  function evt(e){ const r=simCanvas.getBoundingClientRect(); return {x:e.clientX-r.left, y:e.clientY-r.top}; }
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
    if(!P.paused){ tAnim+=dt; if(P.mode==='corda') stepString(dt, simCanvas.width, simCanvas.height); }
    try{
      draw(simCanvas); drawGraphs();
      if(P.mode==='corda'){
        readout.set('T', Lab.fmt(P.T,0)+' N'); readout.set('mu', Lab.fmt(P.mu,2)+' kg/m');
        readout.set('v', fmt(vString(),' m/s')); readout.set('damp', Lab.fmt(P.damp,2));
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
