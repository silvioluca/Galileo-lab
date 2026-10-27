'use strict';

// ═══ Stato ════════════════════════════════════════════════════════════════════
const P = {
  carrier:'neg',   // 'pos' (lacune) | 'neg' (elettroni)
  I: 80,           // corrente (mA)
  B: 0.5,          // campo magnetico (T)
  n: 5,            // densità portatori (×1e24 m⁻³)
  t: 1.0,          // spessore lamina (mm)
  showVec:true,
  mode2D:false,
  compare:false,
  yaw:-0.65, pitch:0.5, zoom:1,   // camera orbitale 3D
};
const W_MM = 5;
const e0 = 1.602e-19;

let tAnim=0, last=0;
let carriers={pos:[],neg:[]};
let acc={pos:0,neg:0};       // frazione di campo di Hall accumulato (transitorio) per tipo
let gTitle=[null,null,null];
let gCanvas=[null,null,null], gCtx=[null,null,null];
let readout, carrierRadio=null;
let lastB=0.5, lastI=80;     // per rilevare variazioni che rilanciano il transitorio

// ═══ Palette ══════════════════════════════════════════════════════════════════
function dk(){ return document.documentElement.dataset.theme !== 'light'; }
const PINK=[225,150,140];
function pal(){
  const d=dk();
  return {
    bg:    d?'#06090f':'#e7edf4',
    txt:   d?'rgba(225,238,250,0.96)':'rgba(20,40,70,0.95)',
    sub:   d?'rgba(165,195,220,0.82)':'rgba(60,90,125,0.9)',
    accent:d?'#00d4ff':'#0a78b0',
    edge:  d?'rgba(225,160,150,0.7)':'rgba(180,110,100,0.75)',
    bar2d: d?'rgba(225,150,140,0.14)':'rgba(235,170,160,0.34)',
    pos:   [232,84,72],
    neg:   [78,150,255],
    cur:   [80,150,250],
    vcol:  [60,190,110],
    bfield:[30,140,120],
    fB:    [228,60,60],
    eField:[245,160,40],
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

// ═══ Fisica (effetto Hall) ════════════════════════════════════════════════════
function dims(){ return {I:P.I*1e-3, B:P.B, n:P.n*1e24, t:P.t*1e-3, w:W_MM*1e-3}; }
function qSignOf(c){ return c==='pos'? +1 : -1; }
function driftDirOf(c){ return c==='pos'? +1 : -1; }
function vDrift(){ const {I,n,t,w}=dims(); return I/(n*e0*(w*t)); }
function vHallMag(){ const {I,B,n,t}=dims(); return I*B/(n*e0*t); }
function vHallOf(c){ return qSignOf(c)*vHallMag(); }
function rHallOf(c){ const {n}=dims(); return qSignOf(c)/(n*e0); }
function eHall(){ const {B}=dims(); return vDrift()*B; }   // campo di Hall a equilibrio
function vHall(){ return vHallOf(P.carrier); }
// fattore visivo (1 ai valori di default): per far "respirare" il disegno con gli slider
function hallFactor(){ return (P.I/80)*(P.B/0.5)*(5/P.n)*(1.0/P.t); }
function bNorm(){ return clamp(P.B/1.0,0,1); }

// ═══ Portatori (coordinate normalizzate) ══════════════════════════════════════
// x: 0..1 lungo la lamina · y: 0..1 = frazione verso il bordo di ACCUMULO · sf: fattore di velocità
function initCarriers(){
  carriers={pos:[],neg:[]};
  for(const k of ['pos','neg']) for(let i=0;i<48;i++)
    carriers[k].push({x:Math.random(), y:0.05+Math.random()*0.9, sf:0.55+Math.random()*0.9});
}
function respawn(c,dir){ c.x=dir>0?0:1; c.y=0.05+Math.random()*0.9; c.sf=0.55+Math.random()*0.9; }
function stepCarriers(dtf){
  const dt=dtf/60;
  // un cambio di campo B (o di I) rimette in moto il transitorio: le traiettorie tornano a curvare
  const dchg=Math.abs(P.B-lastB)*1.0 + Math.abs(P.I-lastI)/200;
  if(dchg>0.0008){ acc.pos=Math.max(0,acc.pos-dchg*3.2); acc.neg=Math.max(0,acc.neg-dchg*3.2); }
  lastB=P.B; lastI=P.I;
  const vd=vDrift();
  const baseSx=clamp(vd/0.02,0.05,4)*0.011;        // velocità ∝ v_d (∝ I, ∝ 1/n)
  for(const k of ['pos','neg']){
    const eq=(P.B>0.001 && P.I>0)?1:0;
    acc[k]+=(eq-acc[k])*clamp(dt*0.28,0,1);         // V_H cresce LENTAMENTE fino al massimo (carica lenta)
    const dir=driftDirOf(k);
    // deflessione ∝ B·(1−acc): marcata all'inizio, si annulla all'equilibrio F_Lorentz = F_Coulomb
    const defl=bNorm()*(1-acc[k])*0.034*dtf;
    for(const c of carriers[k]){
      c.x += dir*baseSx*c.sf*dtf;                   // velocità diverse per particella
      c.y += defl;
      if(c.y>1) c.y=1;
      if(c.x>1 || c.x<0) respawn(c,dir);            // rientra da tutta la larghezza laterale
    }
  }
}

// ═══ Proiezione assonometrica 3D (z = verticale) ══════════════════════════════
let V={};
const LX=2.35, WY=0.78;     // lamina stretta (WY ridotto)
let TZ=0.18;                // spessore visivo (dipende dallo slider t, vedi tz())
function tz(){ return 0.05 + 0.12*P.t; }   // spessore ∝ t · meno alta
// rotazione orbitale (yaw attorno alla verticale + pitch) → proiezione ortografica
function rotXZ(x,y,z){
  const px=x-LX/2, py=y-WY/2, pz=z-TZ/2;
  const cy=Math.cos(P.yaw), sy=Math.sin(P.yaw);
  const X1=px*cy-py*sy, Y1=px*sy+py*cy;
  const cp=Math.cos(P.pitch), sp=Math.sin(P.pitch);
  return [X1, Y1*sp+pz*cp];           // [orizzontale, verticale]
}
function setupView(W,H,x0,x1,hFrac){
  x0=x0||0; x1=x1||1; hFrac=hFrac||0.42;
  let minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9;
  for(const X of [0,LX]) for(const Y of [0,WY]) for(const Z of [0,TZ]){
    const r=rotXZ(X,Y,Z);
    if(r[0]<minx)minx=r[0]; if(r[0]>maxx)maxx=r[0]; if(r[1]<miny)miny=r[1]; if(r[1]>maxy)maxy=r[1];
  }
  const w=Math.max(1e-3,maxx-minx), h=Math.max(1e-3,maxy-miny);
  const bandW=(x1-x0)*W, availW=bandW*0.80, availH=H*hFrac;
  const s=Math.min(availW/w, availH/h)*0.9*P.zoom;
  const cxB=x0*W+bandW/2, cyB=H*0.44;
  V={s, ox:cxB-((minx+maxx)/2)*s, oy:cyB+((miny+maxy)/2)*s};
}
function prj(x,y,z){ const r=rotXZ(x,y,z); return [V.ox+r[0]*V.s, V.oy-r[1]*V.s]; }

// ═══ Helper ═══════════════════════════════════════════════════════════════════
function vec(ctx,p1,p2,col,lw){
  ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=lw; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(p1[0],p1[1]); ctx.lineTo(p2[0],p2[1]); ctx.stroke();
  const a=Math.atan2(p2[1]-p1[1],p2[0]-p1[0]), s=5+lw;
  ctx.beginPath(); ctx.moveTo(p2[0],p2[1]);
  ctx.lineTo(p2[0]-s*Math.cos(a-0.45),p2[1]-s*Math.sin(a-0.45));
  ctx.lineTo(p2[0]-s*Math.cos(a+0.45),p2[1]-s*Math.sin(a+0.45));
  ctx.closePath(); ctx.fill();
}
function quad(ctx,a,b,c,d,fill,stroke){
  ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.lineTo(c[0],c[1]); ctx.lineTo(d[0],d[1]); ctx.closePath();
  if(fill){ ctx.fillStyle=fill; ctx.fill(); }
  if(stroke){ ctx.strokeStyle=stroke; ctx.lineWidth=1.8; ctx.lineJoin='round'; ctx.stroke(); }
}
// poligono con angoli arrotondati (per la lamina 3D, stile 2D)
function roundPoly(ctx,pts,r,fill,stroke){
  const n=pts.length; ctx.beginPath();
  for(let i=0;i<n;i++){
    const p0=pts[(i-1+n)%n], p1=pts[i], p2=pts[(i+1)%n];
    let v1x=p0[0]-p1[0], v1y=p0[1]-p1[1], v2x=p2[0]-p1[0], v2y=p2[1]-p1[1];
    const l1=Math.hypot(v1x,v1y)||1, l2=Math.hypot(v2x,v2y)||1;
    const rr=Math.min(r,l1/2,l2/2);
    const a1=[p1[0]+v1x/l1*rr, p1[1]+v1y/l1*rr];
    const a2=[p1[0]+v2x/l2*rr, p1[1]+v2y/l2*rr];
    if(i===0) ctx.moveTo(a1[0],a1[1]); else ctx.lineTo(a1[0],a1[1]);
    ctx.quadraticCurveTo(p1[0],p1[1],a2[0],a2[1]);
  }
  ctx.closePath();
  if(fill){ ctx.fillStyle=fill; ctx.fill(); }
  if(stroke){ ctx.strokeStyle=stroke; ctx.lineWidth=1.8; ctx.lineJoin='round'; ctx.stroke(); }
}
function rotDepth(x,y,z){
  const px=x-LX/2, py=y-WY/2, pz=z-TZ/2;
  const Y1=px*Math.sin(P.yaw)+py*Math.cos(P.yaw);
  return Y1*Math.cos(P.pitch)-pz*Math.sin(P.pitch);
}
// disegna la lamina (6 facce arrotondate, ordinate per profondità)
function drawSlab(ctx){
  const F=[
    {p:[[0,0,0],[LX,0,0],[LX,WY,0],[0,WY,0]], top:false},
    {p:[[0,0,TZ],[LX,0,TZ],[LX,WY,TZ],[0,WY,TZ]], top:true},
    {p:[[0,0,0],[LX,0,0],[LX,0,TZ],[0,0,TZ]], top:false},
    {p:[[0,WY,0],[LX,WY,0],[LX,WY,TZ],[0,WY,TZ]], top:false},
    {p:[[0,0,0],[0,WY,0],[0,WY,TZ],[0,0,TZ]], top:false},
    {p:[[LX,0,0],[LX,WY,0],[LX,WY,TZ],[LX,0,TZ]], top:false},
  ];
  for(const f of F){ let cx=0,cy=0,cz=0; for(const v of f.p){cx+=v[0];cy+=v[1];cz+=v[2];} f.d=rotDepth(cx/4,cy/4,cz/4); }
  F.sort((a,b)=> b.d-a.d);
  const r=clamp(V.s*0.05, 4, 14);
  for(const f of F){
    const pts=f.p.map(v=>prj(v[0],v[1],v[2]));
    roundPoly(ctx, pts, r, f.top? T.bar2d : rgba(PINK,0.22), T.edge);
  }
}
function bSymbol(ctx,cx,cy,r,col){
  ctx.strokeStyle=col; ctx.lineWidth=1.4;
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
  const d=r*0.7;
  ctx.beginPath(); ctx.moveTo(cx-d,cy-d); ctx.lineTo(cx+d,cy+d); ctx.moveTo(cx+d,cy-d); ctx.lineTo(cx-d,cy+d); ctx.stroke();
}

// ═══ VISTA 3D ═════════════════════════════════════════════════════════════════
function draw3DBar(ctx,c){
  const col = c==='pos'? T.pos : T.neg;
  // lamina arrotondata, colore come nel 2D (rosato)
  drawSlab(ctx);
  draw3DCurrent(ctx);
  draw3DField(ctx);
  draw3DCarriers(ctx,c,col);
  draw3DAccumulation(ctx,c,col);
  if(P.showVec) draw3DVectors(ctx,c);
}
function draw3DCurrent(ctx){
  const yc=WY/2, zc=TZ/2;
  vec(ctx, prj(-0.5,yc,zc), prj(-0.08,yc,zc), rgb(T.cur), 4);
  vec(ctx, prj(LX+0.08,yc,zc), prj(LX+0.5,yc,zc), rgb(T.cur), 4);
  const lp=prj(-0.5,yc,zc); ctx.fillStyle=rgb(T.cur); ctx.font='bold 13px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillText('I', lp[0]-9, lp[1]+5);
}
function draw3DField(ctx){
  const al=bNorm(); if(al<0.02) return;            // a B=0 niente campo
  const len=0.35+0.4*al;
  const xs=[0.45,1.15,1.85], ys=[0.25,0.6];
  for(const x of xs) for(const y of ys) vec(ctx, prj(x,y,TZ+0.04), prj(x,y,TZ+0.04+len), rgba(T.bfield,0.35+0.6*al), 2.2);
  const lab=prj(2.05,0.6,TZ+0.04+len); ctx.fillStyle=rgba(T.bfield,0.4+0.6*al); ctx.font='bold 13px "Space Mono",monospace'; ctx.textAlign='left';
  ctx.fillText('B', lab[0]+6, lab[1]+2);
}
function draw3DCarriers(ctx,c,col){
  const sign=c==='pos'?'+':'−';
  for(const k of carriers[c]){
    const p=prj(LX*k.x, WY*(1-k.y), TZ+0.012);
    ctx.fillStyle=rgba(col,0.95); ctx.beginPath(); ctx.arc(p[0],p[1],2.2,0,Math.PI*2); ctx.fill();
  }
}
function draw3DAccumulation(ctx,c,col){
  const nm=Math.round(acc[c]*clamp(1+6*bNorm(),0,7)); if(nm<1) return;
  const front=c==='pos'?'+':'−', back=c==='pos'?'−':'+';
  const colBack=c==='pos'?T.neg:T.pos;
  ctx.font='bold 12px "Space Mono",monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
  for(let i=0;i<nm;i++){ const x=0.25+(LX-0.5)*i/Math.max(1,nm-1);
    const pf=prj(x,0,TZ+0.04); ctx.fillStyle=rgb(col); ctx.fillText(front,pf[0],pf[1]);
    const pb=prj(x,WY,TZ+0.04); ctx.fillStyle=rgb(colBack); ctx.fillText(back,pb[0],pb[1]);
  }
  ctx.textBaseline='alphabetic';
}
function draw3DVectors(ctx,c){
  const cx=LX*0.5, cy=WY*0.6, cz=TZ+0.012, o=prj(cx,cy,cz);
  vec(ctx,o,prj(cx+0.4*driftDirOf(c),cy,cz),rgb(T.vcol),3);   // v_d
  if(bNorm()>0.02){
    const Lf=0.4;                                   // F_B (costante, ∝ qvB)
    const fE=Lf*acc[c];                             // F_E cresce con l'accumulo
    vec(ctx,o,prj(cx,cy-Lf,cz),rgb(T.fB),3);        // verso il bordo (−y)
    if(fE>0.03) vec(ctx,o,prj(cx,cy+fE,cz),rgb(T.eField),3);
  }
}
// ═══ VISTA 2D (stile figura) ══════════════════════════════════════════════════
function draw2DBar(ctx,R,c){
  const col = c==='pos'? T.pos : T.neg;
  // campo B entrante (⊗): opacità ∝ B, a B=0 scompare
  const al=bNorm();
  if(al>0.02){
    const step=Math.max(30, R.w/9);
    for(let yy=R.y-step*0.7; yy<R.y+R.h+step*0.7; yy+=step)
      for(let xx=R.x+step*0.5; xx<R.x+R.w; xx+=step)
        bSymbol(ctx,xx,yy,5.5,rgba(T.bfield,0.12+0.78*al));
    ctx.fillStyle=rgba(T.bfield,0.3+0.7*al); ctx.font='bold 13px "Space Mono",monospace'; ctx.textAlign='left';
    ctx.fillText('B', R.x+R.w*0.5-6, R.y-step*0.7-4);
  }

  // lamina
  ctx.fillStyle=T.bar2d; ctx.beginPath(); ctx.roundRect(R.x,R.y,R.w,R.h,8); ctx.fill();
  ctx.strokeStyle=T.edge; ctx.lineWidth=2; ctx.stroke();

  // cariche accumulate sui bordi (numero ∝ accumulo·B)
  const nm=Math.round(acc[c]*clamp(1+6*al,0,7));
  if(nm>0){
    const top=c==='pos'?'+':'−', bot=c==='pos'?'−':'+';
    const colBot=c==='pos'?T.neg:T.pos;
    ctx.font='bold 14px "Space Mono",monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
    for(let i=0;i<nm;i++){ const x=R.x+R.w*(0.12+0.76*i/Math.max(1,nm-1));
      ctx.fillStyle=rgb(col);    ctx.fillText(top,x,R.y+10);
      ctx.fillStyle=rgb(colBot); ctx.fillText(bot,x,R.y+R.h-10);
    }
    ctx.textBaseline='alphabetic';
  }

  // traiettoria deflessa: curvatura ∝ B (più campo → più deflessione)
  if(al>0.02){
    const cyMid=R.y+R.h*0.58;
    const endY=cyMid - R.h*(0.08+0.44*al);     // quanto sale dipende da B
    ctx.strokeStyle=rgba(col,0.5); ctx.lineWidth=1.3; ctx.setLineDash([5,4]); ctx.beginPath();
    if(driftDirOf(c)>0){ ctx.moveTo(R.x+R.w*0.08,cyMid); ctx.quadraticCurveTo(R.x+R.w*0.62,cyMid,R.x+R.w*0.95,endY); }
    else { ctx.moveTo(R.x+R.w*0.92,cyMid); ctx.quadraticCurveTo(R.x+R.w*0.38,cyMid,R.x+R.w*0.05,endY); }
    ctx.stroke(); ctx.setLineDash([]);
  }

  // corrente i (frecce blu ai lati)
  const yc=R.y+R.h*0.58;
  vec(ctx,[R.x-44,yc],[R.x-6,yc],rgb(T.cur),3.5);
  vec(ctx,[R.x+R.w+6,yc],[R.x+R.w+44,yc],rgb(T.cur),3.5);
  ctx.fillStyle=rgb(T.cur); ctx.font='bold 13px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillText('i',R.x-25,yc-8); ctx.fillText('i',R.x+R.w+25,yc-8);

  // portatori (piccoli, arrivano sul bordo: nessun margine interno)
  const sign=c==='pos'?'+':'−';
  for(const k of carriers[c]){
    const x=R.x+R.w*(0.04+0.92*k.x), y=R.y+R.h*(0.03+(1-k.y)*0.94);
    ctx.fillStyle=rgba(col,0.92); ctx.beginPath(); ctx.arc(x,y,2.2,0,Math.PI*2); ctx.fill();
  }

  // portatore di riferimento + vettori
  if(P.showVec){
    const ox=R.x+R.w*0.46, oy=R.y+R.h*0.58;
    const Lf=R.h*0.36;
    if(al>0.02){
      vec(ctx,[ox,oy],[ox,oy-Lf],rgb(T.fB),3.5);                 // F_q verso l'alto (costante)
      const fE=Lf*acc[c];                                        // F_E cresce con le cariche
      const eUp = c==='neg';
      const ex=ox+R.w*0.24;
      // campo E (a destra), lunghezza ∝ accumulo
      const eLen=(R.h*0.10 + R.h*0.30*clamp(hallFactor()/2,0,1))*acc[c];
      if(eLen>4){ vec(ctx,[ex, eUp?oy+eLen:oy-eLen],[ex, eUp?oy-eLen:oy+eLen],rgb(T.eField),3.5);
        ctx.fillStyle=rgb(T.eField); ctx.font='bold 13px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('E',ex+7,oy-eLen-2); }
      if(fE>3) vec(ctx,[ox,oy],[ox,oy+fE],rgb(T.eField),2.6);    // F_E sul portatore
    }
    vec(ctx,[ox,oy],[ox+driftDirOf(c)*R.w*0.16,oy],rgb(T.vcol),3.5); // v_d
    ctx.fillStyle=rgb(col); ctx.beginPath(); ctx.arc(ox,oy,5.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#fff'; ctx.font='bold 10px "Space Mono",monospace'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(sign,ox,oy+0.5); ctx.textBaseline='alphabetic';
    ctx.fillStyle=rgb(T.vcol); ctx.font='bold 11px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText('v_d', ox+driftDirOf(c)*R.w*0.16, oy+15);
    if(al>0.02){ ctx.fillStyle=rgb(T.fB); ctx.fillText('F_q', ox, oy-Lf-6); }
    // equilibrio → selettore di velocità
    if(al>0.02 && acc[c]>0.85){
      ctx.fillStyle=T.accent; ctx.font='10px "Space Mono",monospace'; ctx.textAlign='center';
      ctx.fillText('F_E = F_B  →  v = E/B', ox, R.y+R.h+30);
    }
  }
}

// ═══ Dispatcher ═══════════════════════════════════════════════════════════════
function draw(canvas){
  const [ctx, W, H] = Lab.ctx2d(canvas);
  T=pal();
  TZ=tz();                       // spessore geometrico legato allo slider t
  ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  ctx.textAlign='left'; ctx.fillStyle=T.accent; ctx.font='bold 14px "Space Mono",monospace';
  ctx.fillText('Effetto Hall:  V_H = I·B / (n·e·t)', 14, 24);

  if(P.compare){
    if(P.mode2D){
      const m=Math.max(46,W*0.06), bw=(W-2.4*m)/2, bh=H*0.42, by=H*0.28;
      draw2DBar(ctx,{x:m*0.9,y:by,w:bw,h:bh},'neg');
      draw2DBar(ctx,{x:m*0.9+bw+m,y:by,w:bw,h:bh},'pos');
      tag(ctx,m*0.9+bw/2,by+bh+54,T.neg,'negativi → V_H < 0');
      tag(ctx,m*0.9+bw+m+bw/2,by+bh+54,T.pos,'positivi → V_H > 0');
    } else {
      setupView(W,H,0,0.5,0.42); draw3DBar(ctx,'neg');
      setupView(W,H,0.5,1,0.42); draw3DBar(ctx,'pos');
      tag(ctx,W*0.25,H*0.9,T.neg,'negativi → V_H < 0');
      tag(ctx,W*0.75,H*0.9,T.pos,'positivi → V_H > 0');
    }
  } else {
    if(P.mode2D) draw2DBar(ctx,{x:W*0.18,y:H*0.27,w:W*0.64,h:H*0.40},P.carrier);
    else { setupView(W,H,0.18,0.82,0.34); draw3DBar(ctx,P.carrier); }   // 3D singola: centrata e rimpicciolita
  }
  // segnalazione "selettore di velocità" quando si raggiunge l'equilibrio F_E = F_B
  const eqOn=(P.B>0.001 && P.I>0) && (P.compare ? (acc.pos>0.96 && acc.neg>0.96) : acc[P.carrier]>0.96);
  if(eqOn){
    ctx.textAlign='left'; ctx.font='bold 11px "Space Mono",monospace'; ctx.fillStyle=T.accent;
    ctx.fillText('● SELETTORE DI VELOCITÀ  ·  F_E = F_B  →  v = E/B', 14, H-28);
  }
  if(!P.mode2D){
    ctx.fillStyle=T.sub; ctx.font='9px "Space Mono",monospace'; ctx.textAlign='left';
    ctx.fillText('trascina: ruota · rotella: zoom', 14, H-10);
  }
}
function tag(ctx,cx,cy,col,txt){ ctx.textAlign='center'; ctx.font='bold 11px "Space Mono",monospace'; ctx.fillStyle=rgb(col); ctx.fillText(txt,cx,cy); }
function fmtV(v){ const a=Math.abs(v),s=v<0?'−':''; if(a<1e-3) return `${s}${Lab.fmt((a*1e6),1)} µV`; return `${s}${Lab.fmt((a*1e3),3)} mV`; }

// ═══ Grafici ══════════════════════════════════════════════════════════════════
// V_H = I·B/(n·e·t) con il segno del portatore: rosso per le lacune (+), blu per gli elettroni (−).
// Le tensioni sono in µV; il fondo scala segue il valore massimo raggiungibile su quell'asse.
function drawDual(cv,title,xr,xLabel,fmag,xcur,opt={}){
  const vmax=Lab.niceMax(Math.max(1e-9,...Array.from({length:41},(_,i)=>fmag(xr[0]+(xr[1]-xr[0])*i/40)))*1e6);
  const g=Lab.panel(cv,{ title, xr, yr:[-vmax,vmax], xLabel, yFmt:v=>Lab.sci(v,2), ...opt });
  if(!g) return; const [ctx,f]=g;
  Lab.plot(ctx,f,x=>fmag(x)*1e6,xr,rgb(T.pos),1.8,[],200);
  Lab.plot(ctx,f,x=>-fmag(x)*1e6,xr,rgb(T.neg),1.8,[],200);
  Lab.dot(ctx,f,xcur,qSignOf(P.carrier)*fmag(xcur)*1e6,f.C.accent,4);
  Lab.legend(ctx,f.L+8,f.T+8,[[rgb(T.pos),'lacune (+)'],[rgb(T.neg),'elettroni (−)']]);
}
function drawGraphs(){
  const {I,B,n,t}=dims();
  drawDual(gCanvas[0],'Tensione di Hall V_H (µV) in funzione di B',[0,1],'B (T)',b=>I*b/(n*e0*t),B);
  drawDual(gCanvas[1],'V_H (µV) in funzione della corrente',[0,200],'I (mA)',i=>i*1e-3*B/(n*e0*t),I*1e3);
  drawDual(gCanvas[2],'V_H (µV) in funzione della densità n',[0.5,50],'n (10²⁴ m⁻³)',nn=>I*B/(nn*1e24*e0*t),n/1e24,{xLog:true,xFmt:v=>String(v)});
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls(){
  const cont=document.getElementById('controls'); cont.innerHTML='';
  const secP=Lab.Section('Ipotesi sui portatori');
  cont.appendChild(secP.el);
  carrierRadio=Lab.RadioGroup({
    label:'Tipo di portatore',
    options:[
      {value:'neg', label:'Negativi (elettroni)', hint:'v ∥ −I'},
      {value:'pos', label:'Positivi (lacune)',    hint:'v ∥ I'},
    ],
    value:P.carrier, onChange(v){ P.carrier=v; },   // cambia portatore senza resettare il transitorio
  });
  secP.add(carrierRadio);
  const secV=Lab.Section('Vista');
  cont.appendChild(secV.el);
  secV.add(Lab.Toggle({ label:'Modalità 2D', value:P.mode2D, onChange(v){P.mode2D=v;} }));
  secV.add(Lab.Toggle({ label:'Confronto due sbarre', value:P.compare, onChange(v){P.compare=v;} }));
  secV.add(Lab.Toggle({ label:'Vettori v, F, E', value:P.showVec, onChange(v){P.showVec=v;} }));
  const secG=Lab.Section('Parametri');
  cont.appendChild(secG.el);
  secG.add(Lab.Slider({ label:'Corrente I', min:0, max:200, step:5, value:P.I, unit:' mA', onChange(v){P.I=v;} }));
  secG.add(Lab.Slider({ label:'Campo B', min:0, max:1, step:0.05, value:P.B, unit:' T', onChange(v){P.B=v;} }));
  secG.add(Lab.Slider({ label:'Densità n', min:0.5, max:50, step:0.5, value:P.n, unit:'·10²⁴ m⁻³', onChange(v){P.n=v;} }));
  secG.add(Lab.Slider({ label:'Spessore t', min:0.1, max:2, step:0.1, value:P.t, unit:' mm', onChange(v){P.t=v;} }));
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
  buildControls();
  initGraphs();
  initCarriers();
  const simCanvas=document.getElementById('simCanvas');
  readout=new Lab.Readout(document.getElementById('readout'),[
    {key:'car', label:'Portatori'},
    {key:'vd',  label:'v deriva'},
    {key:'vh',  label:'V Hall'},
    {key:'eh',  label:'Campo E_H'},
    {key:'sel', label:'Selettore v=E/B'},
    {key:'side',label:'Accumulo bordo sup.'},
  ]);
  const btnFlip=document.getElementById('btnFlip');
  // inverte i portatori senza ricostruire il pannello né resettare la simulazione
  btnFlip.addEventListener('click',()=>{ P.carrier=P.carrier==='pos'?'neg':'pos'; if(carrierRadio) carrierRadio.setValue(P.carrier); });
  document.getElementById('btnReset').addEventListener('click',()=>{
    // ricarica SOLO il transitorio: mantiene parametri, vista e camera
    initCarriers(); acc={pos:0,neg:0};
  });

  // ── rotazione e zoom (solo 3D) ──
  let drag=false,lx=0,ly=0;
  simCanvas.style.cursor='grab';
  simCanvas.addEventListener('mousedown',e=>{ if(P.mode2D)return; drag=true; lx=e.clientX; ly=e.clientY; simCanvas.style.cursor='grabbing'; });
  window.addEventListener('mousemove',e=>{ if(!drag)return; const dx=e.clientX-lx, dy=e.clientY-ly; lx=e.clientX; ly=e.clientY;
    P.yaw+=dx*0.008; P.pitch=clamp(P.pitch-dy*0.006, 0.08, 1.35); });
  window.addEventListener('mouseup',()=>{ drag=false; simCanvas.style.cursor='grab'; });
  simCanvas.addEventListener('wheel',e=>{ if(P.mode2D)return; e.preventDefault(); P.zoom=clamp(P.zoom*(1-e.deltaY*0.0012), 0.45, 3.2); },{passive:false});

  function resize(){
    const area=document.querySelector('.lab-canvas-area'); if(!area)return;
    const ar=area.getBoundingClientRect();
    const rb=document.getElementById('readout').getBoundingClientRect();
    const ga=document.getElementById('graphArea'); const gaH=ga?ga.offsetHeight:0;
    const h=Math.max(220,Math.floor(ar.height-rb.height-gaH-4));
    simCanvas.style.width=Math.floor(ar.width)+'px'; simCanvas.style.height=h+'px';
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
    stepCarriers(dt*60);
    draw(simCanvas);
    drawGraphs();
    const eq = (P.B>0.001 && P.I>0);
    readout.set('car', P.carrier==='pos'?'+ (lacune)':'− (elettroni)');
    readout.set('vd', Lab.sci(vDrift(),3)+' m/s');
    readout.set('vh', fmtV(vHall()*acc[P.carrier])+(acc[P.carrier]<0.97&&eq?' ↑':''));
    readout.set('eh', Lab.fmt((eHall()*acc[P.carrier]),3)+' V/m');
    readout.set('sel', eq?('v = '+Lab.sci((eHall()/P.B),3)+' m/s'):'—');
    readout.set('side', !eq?'— (B=0)':(P.carrier==='pos'?'positivo +':'negativo −'));
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
