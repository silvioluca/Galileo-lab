'use strict';

// ═══ Stato ════════════════════════════════════════════════════════════════════
const P = {
  V0: 10,    // ampiezza f.e.m. (V)
  R:  40,    // Ω
  L:  50,    // mH
  C:  20,    // µF
  f:  160,   // Hz
  config: 'series',   // 'series' | 'parallel'
  speed: 1.0,
};
let th=0;             // fase animata
const flows={};       // accumulatori di scorrimento per elemento
let gTitle=[null,null,null];
let gCanvas=[null,null,null], gCtx=[null,null,null];
let readout;

// ═══ Palette ══════════════════════════════════════════════════════════════════
function dk(){ return document.documentElement.dataset.theme !== 'light'; }
function pal(){
  const d=dk();
  return {
    bg:    d?'#06090f':'#e7edf4',
    txt:   d?'rgba(215,235,250,0.95)':'rgba(20,45,75,0.95)',
    sub:   d?'rgba(165,195,220,0.8)':'rgba(60,95,130,0.88)',
    accent:d?'#00d4ff':'#0a78b0',
    wire:  d?'rgba(180,205,230,0.85)':'rgba(50,80,115,0.9)',
    cur:   d?'#ffd24d':'#e09000',
    vS:    d?'#cdd6e2':'#39424e',   // sorgente
    vR:    d?'#ffb84d':'#d2860a',   // R
    vL:    d?'#4fd0ff':'#0a78b0',   // L
    vC:    d?'#ff5d73':'#d61f4a',   // C
    grid:  d?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.04)',
    gBg:   d?'rgb(3,9,22)':'#eef2f7',
    gAxis: d?'rgba(100,155,210,0.26)':'rgba(40,80,130,0.30)',
    gText: d?'rgba(150,205,225,0.88)':'rgba(25,65,105,0.92)',
  };
}
let T=pal();

// ═══ Fisica (RLC serie, regime sinusoidale) ═══════════════════════════════════
function derive(f){
  const w=2*Math.PI*f, R=P.R, L=P.L*1e-3, C=P.C*1e-6;
  const XL=w*L, XC=1/(w*C);
  if(P.config==='parallel'){
    // tensione comune V0, le correnti di ramo si sommano vettorialmente
    const IR=P.V0/R, IL=P.V0/XL, IC=P.V0/XC;
    const I0=Math.sqrt(IR*IR+(IC-IL)*(IC-IL));
    const phi=Math.atan2(IC-IL, IR);   // corrente in anticipo su V se >0 (capacitivo)
    const Z=P.V0/I0;
    return {w,XL,XC,Z,phi,I0,R,IR,IL,IC, parallel:true};
  }
  // serie: corrente comune, le tensioni si sommano
  const X=XL-XC, Z=Math.sqrt(R*R+X*X), phi=Math.atan2(X,R), I0=P.V0/Z;
  return {w,XL,XC,X,Z,phi,I0,R,VR:I0*R,VL:I0*XL,VC:I0*XC, parallel:false};
}
function f0(){ return 1/(2*Math.PI*Math.sqrt(P.L*1e-3*P.C*1e-6)); }

// ═══ Rendering ════════════════════════════════════════════════════════════════
function vec(ctx,x1,y1,x2,y2,col,lbl){
  if(Math.hypot(x2-x1,y2-y1)<2) return;
  ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=2.4;
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  const a=Math.atan2(y2-y1,x2-x1);
  ctx.beginPath(); ctx.moveTo(x2,y2);
  ctx.lineTo(x2-9*Math.cos(a-0.4),y2-9*Math.sin(a-0.4));
  ctx.lineTo(x2-9*Math.cos(a+0.4),y2-9*Math.sin(a+0.4));
  ctx.closePath(); ctx.fill();
  if(lbl){
    // etichetta oltre la punta; se cade su un'altra (fasori quasi allineati) si sposta di lato
    ctx.font='bold 11px "Space Mono",monospace'; ctx.textAlign='center';
    let lx=x2+12*Math.cos(a), ly=y2+12*Math.sin(a)+4;
    for(let k=1;k<6&&labelSpots.some(([px,py])=>Math.abs(px-lx)<30&&Math.abs(py-ly)<13);k++){
      const side=k%2?1:-1, m=Math.ceil(k/2)*14;
      lx=x2+12*Math.cos(a)-side*m*Math.sin(a); ly=y2+12*Math.sin(a)+4+side*m*Math.cos(a);
    }
    labelSpots.push([lx,ly]);
    ctx.fillText(lbl,lx,ly);
  }
}
let labelSpots=[];

function draw(canvas){
  const [ctx, W, H] = Lab.ctx2d(canvas);
  labelSpots=[];
  ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  drawGrid(ctx,W,H);
  const D=derive(P.f);

  (D.parallel?drawCircuitParallel:drawCircuit)(ctx, 0, 0, W*0.52, H, D);
  drawPhasors(ctx, W*0.52, 0, W*0.48, H, D);

  // intestazione
  ctx.textAlign='left';
  ctx.fillStyle=T.accent; ctx.font='bold 14px "Space Mono",monospace';
  ctx.fillText(D.parallel
    ? 'RLC parallelo in AC · 1/Z = √((1/R)² + (1/X_C − 1/X_L)²)'
    : 'RLC serie in AC · Z = √(R² + (X_L − X_C)²)', 14, 22);
  ctx.fillStyle=T.sub; ctx.font='11px "Space Mono",monospace';
  ctx.fillText(`X_L=ωL=${Lab.fmt(D.XL,1)} Ω   X_C=1/ωC=${Lab.fmt(D.XC,1)} Ω   φ=${Lab.fmt((D.phi*180/Math.PI),1)}°`, 14, 40);
}

function drawGrid(ctx,W,H){
  ctx.strokeStyle=T.grid; ctx.lineWidth=1;
  for(let gx=0;gx<=W;gx+=40){ctx.beginPath();ctx.moveTo(gx,0);ctx.lineTo(gx,H);ctx.stroke();}
  for(let gy=0;gy<=H;gy+=40){ctx.beginPath();ctx.moveTo(0,gy);ctx.lineTo(W,gy);ctx.stroke();}
}

// ── circuito (sorgente sx, R+L in alto, C a destra) ──
function drawCircuit(ctx,x,y,W,H,D){
  const x0=x+W*0.16, x1=x+W*0.86, y0=H*0.34, y1=H*0.72;
  ctx.strokeStyle=T.wire; ctx.lineWidth=2.5; ctx.lineCap='round';
  // top
  ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y0); ctx.stroke();
  // right (con condensatore al centro)
  const capY=(y0+y1)/2;
  ctx.beginPath(); ctx.moveTo(x1,y0); ctx.lineTo(x1,capY-9); ctx.moveTo(x1,capY+9); ctx.lineTo(x1,y1); ctx.stroke();
  // bottom
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x0,y1); ctx.stroke();
  // left (sorgente)
  ctx.beginPath(); ctx.moveTo(x0,y1); ctx.lineTo(x0,capY+16); ctx.moveTo(x0,capY-16); ctx.lineTo(x0,y0); ctx.stroke();

  // corrente animata (dots, verso/velocità ∝ i(t))
  const inst=D.I0*Math.cos(th-D.phi);
  drawFlow(ctx, x0,x1,y0,y1,capY, inst, D.I0);

  // sorgente AC
  ctx.strokeStyle=T.vS; ctx.fillStyle=T.vS; ctx.lineWidth=2;
  ctx.beginPath(); ctx.arc(x0,capY,15,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); for(let i=-8;i<=8;i++){ const xx=x0+i, yy=capY-Math.sin(i/8*Math.PI)*7; i===-8?ctx.moveTo(xx,yy):ctx.lineTo(xx,yy);} ctx.stroke();
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace'; ctx.textAlign='right';
  ctx.fillText(`${P.V0} V`, x0-20, capY+4);

  // R (zigzag) e L (spire) sul lato alto
  drawResistor(ctx, x0+(x1-x0)*0.32, y0);
  drawInductor(ctx, x0+(x1-x0)*0.68, y0);
  // C (lato destro)
  drawCap(ctx, x1, capY);

  // etichette componenti con tensioni di picco
  ctx.font='10px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillStyle=T.vR; ctx.fillText(`R=${P.R}Ω  V_R=${Lab.fmt(D.VR,1)}V`, x0+(x1-x0)*0.32, y0-16);
  ctx.fillStyle=T.vL; ctx.fillText(`L=${P.L}mH  V_L=${Lab.fmt(D.VL,1)}V`, x0+(x1-x0)*0.68, y0-16);
  ctx.fillStyle=T.vC; ctx.textAlign='left'; ctx.fillText(`C=${P.C}µF`, x1+26, capY-4); ctx.fillText(`V_C=${Lab.fmt(D.VC,1)}V`, x1+26, capY+12);
}

// ── circuito parallelo: sorgente a sinistra, R∥L∥C come rami VERTICALI tra due rail ──
function drawCircuitParallel(ctx,x,y,W,H,D){
  const xS=x+W*0.16;                       // sorgente
  const xR=x+W*0.46, xL=x+W*0.64, xC=x+W*0.84;   // rami verticali
  const y0=H*0.30, y1=H*0.74, mid=(y0+y1)/2;
  ctx.strokeStyle=T.wire; ctx.lineWidth=2.5; ctx.lineCap='round';
  // rail superiore e inferiore (da sorgente a ultimo ramo)
  ctx.beginPath(); ctx.moveTo(xS,y0); ctx.lineTo(xC,y0); ctx.moveTo(xS,y1); ctx.lineTo(xC,y1); ctx.stroke();
  // sorgente verticale a sinistra
  ctx.beginPath(); ctx.moveTo(xS,y0); ctx.lineTo(xS,mid-16); ctx.moveTo(xS,mid+16); ctx.lineTo(xS,y1); ctx.stroke();

  // rami verticali con componenti
  vbranch(ctx,xR,y0,y1, m=>{ ctx.save(); ctx.translate(xR,m); ctx.rotate(Math.PI/2); drawResistor(ctx,0,0); ctx.restore(); }, 54);
  vbranch(ctx,xL,y0,y1, m=>{ ctx.save(); ctx.translate(xL,m); ctx.rotate(Math.PI/2); drawInductor(ctx,0,0); ctx.restore(); }, 54);
  vbranch(ctx,xC,y0,y1, m=>{ drawCap(ctx,xC,m,false); }, 18);

  // loop esterno fino al generatore, con INTERRUZIONE al condensatore (i pallini non
  // attraversano il gap delle piastre né il simbolo della sorgente)
  const iTot=D.I0*Math.cos(th+D.phi);
  flowDots(ctx,[
    [xS,y0, xC,y0],          // rail superiore →
    [xC,y0, xC,mid-9],       // lato dx fino alla piastra alta
    [xC,mid+9, xC,y1],       // dalla piastra bassa → in basso
    [xC,y1, xS,y1],          // rail inferiore ←
    [xS,y1, xS,mid+16],      // su verso il morsetto basso della sorgente
    [xS,mid-16, xS,y0],      // dal morsetto alto della sorgente → in alto
  ], iTot, D.I0, 'main');

  // corrente propria in R e L (conduttori): i_R in fase con V, i_L in ritardo 90°
  flowDots(ctx,[[xR,y0,xR,y1]], D.IR*Math.cos(th),           D.IR, 'R');
  flowDots(ctx,[[xL,y0,xL,y1]], D.IL*Math.cos(th-Math.PI/2), D.IL, 'L');

  // freccia ed etichetta 'i' sul rail superiore
  vecArrow(ctx, xS+(xR-xS)*0.4, y0, xS+(xR-xS)*0.4+20, y0, T.cur);
  ctx.fillStyle=T.cur; ctx.font='bold 12px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillText('i', xS+(xR-xS)*0.4+10, y0-8);

  // sorgente AC
  ctx.strokeStyle=T.vS; ctx.fillStyle=T.vS; ctx.lineWidth=2;
  ctx.beginPath(); ctx.arc(xS,mid,15,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); for(let i=-8;i<=8;i++){ const xx=xS+i, yy=mid-Math.sin(i/8*Math.PI)*7; i===-8?ctx.moveTo(xx,yy):ctx.lineTo(xx,yy);} ctx.stroke();
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace'; ctx.textAlign='right'; ctx.fillText(`vᵢ=${P.V0}V`, xS-20, mid+4);

  // etichette rami con correnti di picco (sotto il rail inferiore)
  ctx.font='10px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillStyle=T.vR; ctx.fillText('R', xR-14, mid+4); ctx.fillText(`I_R=${Lab.fmt(D.IR,2)}A`, xR, y1+18);
  ctx.fillStyle=T.vL; ctx.fillText('L', xL-14, mid+4); ctx.fillText(`I_L=${Lab.fmt(D.IL,2)}A`, xL, y1+18);
  ctx.fillStyle=T.vC; ctx.fillText('C', xC+14, mid+4); ctx.fillText(`I_C=${Lab.fmt(D.IC,2)}A`, xC, y1+18);
  ctx.fillStyle=T.sub; ctx.fillText(`R=${P.R}Ω · L=${P.L}mH · C=${P.C}µF`, (xR+xC)/2, y1+32);
}
// ramo verticale: due monconi di filo + componente al centro (gap = Lc)
function vbranch(ctx,x,y0,y1,comp,Lc){
  const m=(y0+y1)/2;
  ctx.strokeStyle=T.wire; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(x,y0); ctx.lineTo(x,m-Lc/2); ctx.moveTo(x,m+Lc/2); ctx.lineTo(x,y1); ctx.stroke();
  comp(m);
}
// freccia semplice
function vecArrow(ctx,x1,y1,x2,y2,col){
  ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  const a=Math.atan2(y2-y1,x2-x1);
  ctx.beginPath(); ctx.moveTo(x2,y2); ctx.lineTo(x2-7*Math.cos(a-0.4),y2-7*Math.sin(a-0.4)); ctx.lineTo(x2-7*Math.cos(a+0.4),y2-7*Math.sin(a+0.4)); ctx.closePath(); ctx.fill();
}
// pallini di corrente su un percorso; accumulatore proprio per chiave (verso/velocità ∝ inst)
function flowDots(ctx,segs,inst,Iref,key){
  if(Iref<1e-9) return;
  let total=0; const len=segs.map(s=>{const l=Math.hypot(s[2]-s[0],s[3]-s[1]); total+=l; return l;});
  if(total<1) return;
  let fl=(flows[key]||0)+inst/Iref*4; fl%=total; if(fl<0) fl+=total; flows[key]=fl;
  const N=Math.max(6,Math.round(total/22)); ctx.fillStyle=T.cur;
  for(let k=0;k<N;k++){ let s=(fl+k*total/N)%total;
    for(let i=0;i<segs.length;i++){ if(s<=len[i]){ const f=s/len[i],sg=segs[i];
      ctx.beginPath(); ctx.arc(sg[0]+(sg[2]-sg[0])*f,sg[1]+(sg[3]-sg[1])*f,2.4,0,Math.PI*2); ctx.fill(); break;} s-=len[i]; } }
}
// flusso del loop serie
function drawFlow(ctx,x0,x1,y0,y1,capY,inst,I0){
  const segs=[[x0,y0,x1,y0],[x1,y0,x1,capY-9],[x1,capY+9,x1,y1],[x1,y1,x0,y1],[x0,y1,x0,y0]];
  flowDots(ctx,segs,inst,I0,'main');
}
function drawResistor(ctx,cx,y){ const w=54,h=10,x=cx-w/2,n=6;
  ctx.strokeStyle=T.vR; ctx.lineWidth=2.5; ctx.beginPath(); ctx.moveTo(x,y);
  for(let i=0;i<=n;i++){ ctx.lineTo(x+w*i/n, y+(i%2?(i%4===1?-h:h):0)); } ctx.lineTo(x+w,y); ctx.stroke(); }
function drawInductor(ctx,cx,y){ const w=54,x=cx-w/2,n=4,r=w/(2*n);
  ctx.strokeStyle=T.vL; ctx.lineWidth=2.5; ctx.beginPath(); ctx.moveTo(x,y);
  for(let i=0;i<n;i++) ctx.arc(x+r+i*2*r, y, r, Math.PI, 0, false); ctx.stroke(); }
function drawCap(ctx,x,cy,horiz){ ctx.strokeStyle=T.vC; ctx.lineWidth=3;
  if(horiz){ // ramo orizzontale → due piastre verticali, gap orizzontale
    ctx.beginPath(); ctx.moveTo(x-6,cy-12); ctx.lineTo(x-6,cy+12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+6,cy-12); ctx.lineTo(x+6,cy+12); ctx.stroke();
  } else { // filo verticale → due piastre orizzontali, gap verticale
    ctx.beginPath(); ctx.moveTo(x-16,cy-9); ctx.lineTo(x+16,cy-9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x-16,cy+9); ctx.lineTo(x+16,cy+9); ctx.stroke();
  } }

// ── diagramma dei fasori (rotanti) ──
function drawPhasors(ctx,x,y,W,H,D){
  const cx=x+W*0.5, cy=H*0.46, R=Math.min(W,H)*0.30;
  const maxV=D.parallel ? Math.max(D.IR,D.IL,D.IC,D.I0,1e-6)
                        : Math.max(P.V0,D.VR,D.VL,D.VC,1e-6);
  const sc=R/maxV;

  // assi
  ctx.strokeStyle=T.gAxis||'rgba(120,150,190,0.3)'; ctx.lineWidth=0.6; ctx.setLineDash([3,4]);
  ctx.beginPath(); ctx.moveTo(cx-R-12,cy); ctx.lineTo(cx+R+12,cy); ctx.moveTo(cx,cy-R-12); ctx.lineTo(cx,cy+R+12); ctx.stroke(); ctx.setLineDash([]);

  const P2=(ang,mag)=>[cx+Math.cos(ang)*mag*sc, cy-Math.sin(ang)*mag*sc];

  if(D.parallel){
    // riferimento = tensione comune V; correnti di ramo
    const aV=th, aR=th, aC=th+Math.PI/2, aL=th-Math.PI/2;
    const [vx,vy]=P2(aV,maxV*0.55);   // V = riferimento a lunghezza fissa
    const [rx,ry]=P2(aR,D.IR), [cx2,cy2]=P2(aC,D.IC), [lx,ly]=P2(aL,D.IL);
    const aI=th+D.phi; const [ix,iy]=P2(aI,D.I0);   // I = anticipo φ su V
    vec(ctx,cx,cy,rx,ry,T.vR,'I_R');
    vec(ctx,cx,cy,cx2,cy2,T.vC,'I_C');
    vec(ctx,cx,cy,lx,ly,T.vL,'I_L');
    vec(ctx,cx,cy,ix,iy,T.cur,'I');
    ctx.save(); ctx.setLineDash([4,3]); vec(ctx,cx,cy,vx,vy,T.vS,'V'); ctx.restore();
  } else {
    // riferimento = corrente comune I; tensioni di ramo
    const aI=th-D.phi, aS=th;
    const [rx,ry]=P2(aI,D.VR), [lx,ly]=P2(aI+Math.PI/2,D.VL), [cx2,cy2]=P2(aI-Math.PI/2,D.VC), [sx,sy]=P2(aS,P.V0);
    vec(ctx,cx,cy,rx,ry,T.vR,'V_R');
    vec(ctx,cx,cy,lx,ly,T.vL,'V_L');
    vec(ctx,cx,cy,cx2,cy2,T.vC,'V_C');
    vec(ctx,cx,cy,sx,sy,T.vS,'V');
    const [ix,iy]=P2(aI,maxV*0.5);
    ctx.save(); ctx.setLineDash([4,3]); vec(ctx,cx,cy,ix,iy,T.cur,'I'); ctx.restore();
  }

  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillText('fasori rotanti (proiezione = valore istantaneo)', cx, cy+R+34);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
// Frequenze su scala logaritmica fissa 10 Hz – 10 kHz: cambiando L o C si vede il picco spostarsi,
// e le reattanze X_L ∝ f e X_C ∝ 1/f diventano rette.
const F_AX=[10,10000];
function fSweep(n=240){ const out=[]; for(let i=0;i<=n;i++) out.push(F_AX[0]*Math.pow(F_AX[1]/F_AX[0],i/n)); return out; }
// fattore di merito e larghezza di banda (−3 dB)
function Qfactor(){ const L=P.L*1e-3, C=P.C*1e-6; return P.config==='parallel' ? P.R*Math.sqrt(C/L) : Math.sqrt(L/C)/P.R; }

// 1: forme d'onda su tre periodi; ampiezze relative a V₀ e alla corrente di risonanza
function drawWaves(){
  const D=derive(P.f), Tms=1000/P.f;
  const Iref=P.config==='parallel' ? Math.max(...fSweep(120).map(f=>derive(f).I0)) : P.V0/P.R;
  const g=Lab.panel(gCanvas[0],{ title:'v(t)/V₀ e i(t)/I_max', xr:[0,3*Tms], yr:[-1.2,1.2], yStep:0.5, xLabel:'t (ms)', yFmt:v=>Lab.fmt(v,1) });
  if(!g) return; const [ctx,f]=g;
  const iAmp=Math.min(1.2, D.I0/Iref);
  Lab.plot(ctx,f,t=>Math.cos(2*Math.PI*t/Tms),[0,3*Tms],T.vS,1.8);
  Lab.plot(ctx,f,t=>iAmp*Math.cos(2*Math.PI*t/Tms-D.phi),[0,3*Tms],T.cur,1.8);
  // cursore alla fase animata
  const tc=((th%(6*Math.PI))/(2*Math.PI))*Tms;
  ctx.save(); ctx.strokeStyle=f.C.text; ctx.setLineDash([2,3]); ctx.beginPath(); ctx.moveTo(f.X(tc),f.T); ctx.lineTo(f.X(tc),f.B); ctx.stroke(); ctx.restore();
  Lab.legend(ctx,f.L+8,f.T+8,[[T.vS,'v(t)'],[T.cur,'i(t)']]);
}

// 2: curva di risonanza I₀(f)
function drawResonance(){
  const fs=fSweep(), Is=fs.map(f=>derive(f).I0);
  const Im=Lab.niceMax(Math.max(...Is, derive(P.f).I0));
  const g=Lab.panel(gCanvas[1],{ title:`Ampiezza della corrente I₀ (A) · ${P.config==='parallel'?'minimo':'massimo'} a f₀`, xr:F_AX, xLog:true, yr:[0,Im], xLabel:'f (Hz)', xFmt:v=>v>=1000?(v/1000)+'k':String(v) });
  if(!g) return; const [ctx,f]=g;
  const fr=f0();
  if(fr>=F_AX[0]&&fr<=F_AX[1]){
    ctx.save(); ctx.strokeStyle=f.C.green; ctx.setLineDash([3,3]); ctx.beginPath(); ctx.moveTo(f.X(fr),f.T); ctx.lineTo(f.X(fr),f.B); ctx.stroke(); ctx.restore();
    ctx.fillStyle=f.C.green; ctx.font='9.5px "DM Sans",sans-serif'; ctx.textAlign='left'; ctx.fillText('f₀',f.X(fr)+3,f.T+20);
  }
  Lab.plotPts(ctx,f,fs.map((fv,i)=>[fv,Is[i]]),T.accent,2);
  Lab.dot(ctx,f,P.f,derive(P.f).I0,T.cur,4);
}

// 3: reattanze e impedenza (scala log-log)
function drawImpedance(){
  const g=Lab.panel(gCanvas[2],{ title:'Reattanze e impedenza (Ω)', xr:F_AX, xLog:true, yr:[1,1e4], yLog:true, xLabel:'f (Hz)', xFmt:v=>v>=1000?(v/1000)+'k':String(v), yFmt:v=>v>=1000?(v/1000)+'k':String(v) });
  if(!g) return; const [ctx,f]=g;
  const fs=fSweep();
  Lab.plotPts(ctx,f,fs.map(fv=>[fv,derive(fv).XL]),T.vL,1.8);
  Lab.plotPts(ctx,f,fs.map(fv=>[fv,derive(fv).XC]),T.vC,1.8);
  Lab.plotPts(ctx,f,fs.map(fv=>[fv,derive(fv).Z]),T.accent,2.2);
  Lab.dot(ctx,f,P.f,derive(P.f).Z,T.cur,4);
  Lab.legend(ctx,f.L+8,f.T+8,[[T.vL,'X_L = ωL'],[T.vC,'X_C = 1/ωC'],[T.accent,'Z']]);
}

function drawGraphs(){ drawWaves(); drawResonance(); drawImpedance(); }

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls(){
  const cont=document.getElementById('controls');
  cont.innerHTML='';
  const s=Lab.Section('Sorgente');
  cont.appendChild(s.el);
  s.add(Lab.Slider({ label:'Tensione V₀', min:1, max:20, step:0.5, value:P.V0, unit:' V', onChange(v){P.V0=v;} }));
  s.add(Lab.Slider({ label:'Frequenza f', min:10, max:1000, step:5, value:P.f, unit:' Hz', onChange(v){P.f=v;} }));

  const c=Lab.Section('Componenti');
  cont.appendChild(c.el);
  c.add(Lab.RadioGroup({
    label:'Configurazione',
    options:[{value:'series',label:'Serie'},{value:'parallel',label:'Parallelo'}],
    value:P.config, onChange(v){ P.config=v; },
  }));
  c.add(Lab.Slider({ label:'Resistenza R', min:5, max:200, step:5, value:P.R, unit:' Ω', onChange(v){P.R=v;} }));
  c.add(Lab.Slider({ label:'Induttanza L', min:1, max:200, step:1, value:P.L, unit:' mH', onChange(v){P.L=v;} }));
  c.add(Lab.Slider({ label:'Capacità C', min:1, max:200, step:1, value:P.C, unit:' µF', onChange(v){P.C=v;} }));

  const v=Lab.Section('Animazione');
  cont.appendChild(v.el);
  v.add(Lab.Slider({ label:'Velocità', min:0.2, max:2.5, step:0.1, value:P.speed, unit:'×', onChange(v){P.speed=v;} }));
}

// ═══ Graph panel ══════════════════════════════════════════════════════════════
function initGraphs(){
  // riga di grafici standard (Lab.graphPanels); i titoli sono disegnati dentro i grafici
  gCanvas = Lab.graphPanels(document.getElementById('graphArea'), 3);
  gCtx = gCanvas.map(c => c.getContext('2d'));
  gTitle = gCanvas.map(() => ({ textContent: '' }));
}

// ═══ Init ═════════════════════════════════════════════════════════════════════
function init(){
  Lab.initTheme();
  buildControls();
  initGraphs();

  const simCanvas=document.getElementById('simCanvas');
  readout=new Lab.Readout(document.getElementById('readout'),[
    {key:'Z',   label:'Impedenza Z'},
    {key:'I',   label:'Corrente I₀'},
    {key:'phi', label:'Sfasamento φ'},
    {key:'f0',  label:'Risonanza f₀'},
    {key:'Q',   label:'Fattore di merito Q'},
    {key:'bw',  label:'Banda Δf = f₀/Q'},
  ]);

  document.getElementById('btnRes').addEventListener('click',()=>{ P.f=Math.round(f0()); buildControls(); });
  document.getElementById('btnReset').addEventListener('click',()=>{ P.V0=10;P.R=40;P.L=50;P.C=20;P.f=160;P.config='series';P.speed=1; th=0; buildControls(); });

  function resize(){
    const parent=simCanvas.parentElement; if(!parent)return;
    const ga=document.getElementById('graphArea'); const rb=document.getElementById('readout');
    const gaH=ga?ga.offsetHeight:0, rbH=rb?rb.offsetHeight:0;
    const w=parent.clientWidth, h=Math.max(140,(parent.clientHeight||0)-gaH-rbH);
    if(w>0) Lab.hidpi(simCanvas, w, h);
    Lab.fitPanels(gCanvas);
    draw(simCanvas); drawGraphs();
  }
  resize();
  new ResizeObserver(resize).observe(simCanvas.parentElement);
  window.addEventListener('load', resize);
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(resize);

  let last=performance.now();
  function frame(now){
    let dt=(now-last)/1000; if(!Number.isFinite(dt)||dt<0) dt=0; dt=Math.min(dt,0.05);
    last=now;
    th += 2.2*P.speed*dt;          // rotazione visibile dei fasori
    if(th>1e6) th=th%(6*Math.PI);
    T=pal();
    draw(simCanvas);
    drawGraphs();
    const D=derive(P.f);
    readout.set('Z', Lab.fmt(D.Z,1)+' Ω');
    readout.set('I', Lab.fmt(D.I0,3)+' A');
    readout.set('phi', Lab.fmt(D.phi*180/Math.PI,1)+'°');
    readout.set('f0', Lab.fmt(f0(),1)+' Hz');
    readout.set('Q', Lab.fmt(Qfactor(),2));
    readout.set('bw', Lab.fmt(f0()/Qfactor(),1)+' Hz');
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
