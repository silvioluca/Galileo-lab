'use strict';

// ═══ Stato ════════════════════════════════════════════════════════════════════
const P = {
  mode:'junction',     // 'doping' | 'junction' | 'transistor'
  dope:'n',            // drogaggio: 'n' | 'p'
  dopElem:'P',         // elemento drogante
  V:0.0,               // tensione di polarizzazione giunzione (V)
  Ib:20,               // corrente di base transistor (µA)
  btype:'npn',         // 'npn' | 'pnp'
  paused:false,
};
const VT=0.02585, VBI=0.7, BETA=120;   // tensione termica, potenziale di built-in, guadagno β
// droganti: pentavalenti (n, +5) e trivalenti (p, +3)
const DOP = {
  n:{ P:'Fosforo (P)', As:'Arsenico (As)', Sb:'Antimonio (Sb)' },
  p:{ B:'Boro (B)', Al:'Alluminio (Al)', Ga:'Gallio (Ga)', In:'Indio (In)' },
};

let tAnim=0, last=0, spawnAcc=0, eFlow=0;
let parts=[];   // portatori mobili {x,y,vx,vy,kind:'e'|'h', t}
let freeC=null, inited=false;   // portatore del dopante (elettrone libero / lacuna) nel reticolo
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
    edge:  d?'rgba(225,235,248,0.5)':'rgba(40,60,90,0.55)',
    nreg:  d?'rgba(80,140,235,0.13)':'rgba(80,140,235,0.18)',
    preg:  d?'rgba(232,110,90,0.13)':'rgba(232,110,90,0.18)',
    depl:  d?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.05)',
    elec:  [80,140,250],          // elettroni
    hole:  [232,110,90],          // lacune
    donor: [120,170,255],         // ioni donatori +
    accept:[255,140,120],         // ioni accettori −
    field: [255,205,70],
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

// ═══ Fisica ═══════════════════════════════════════════════════════════════════
function diodeI(V){ return (Math.exp(clamp(V,-1,0.85)/VT)-1)*1e-12; }          // A (Is~1e-12)
function diodeRel(V){ return clamp(diodeI(V)/diodeI(0.7), -0.02, 1.3); }       // relativo (0..~1)
function deplW(V){ return clamp(Math.sqrt(clamp(1-V/VBI,0.04,4)), 0.2, 2); }   // larghezza relativa svuotamento
function icTransistor(){ return BETA*P.Ib; }                                    // µA

// ═══ Geometria ════════════════════════════════════════════════════════════════
let G={};
function geom(W,H){
  const x0=W*0.08, x1=W*0.92, y0=H*0.26, y1=H*0.64;
  G={W,H,x0,x1,y0,y1, cy:(y0+y1)/2, jx:(x0+x1)/2};
}

// ═══ Portatori ════════════════════════════════════════════════════════════════
function spawnIn(x0,x1,kind){ return {x:x0+Math.random()*(x1-x0), y:G.y0+8+Math.random()*(G.y1-G.y0-16), vx:(Math.random()-0.5)*1.6, vy:(Math.random()-0.5)*1.6, kind, t:0}; }
function initSim(){
  parts=[]; spawnAcc=0; freeC=null; inited=true;
  if(!G.W) return;
  if(P.mode==='doping'){
    freeC={x:(G.x0+G.x1)/2+30, y:(G.y0+G.y1)/2, vx:(Math.random()-0.5)*2, vy:(Math.random()-0.5)*2};
  } else if(P.mode==='junction'){
    for(let i=0;i<26;i++) parts.push(spawnIn(G.x0,G.jx,'h'));     // lacune in p (sinistra)
    for(let i=0;i<26;i++) parts.push(spawnIn(G.jx,G.x1,'e'));     // elettroni in n (destra)
  } else {
    // transistor: elettroni emessi dall'emettitore
    for(let i=0;i<30;i++){ const e=spawnIn(G.x0,G.x0+(G.x1-G.x0)*0.3,'e'); parts.push(e); }
  }
}

function step(dt){
  if(P.paused) return;
  if(G.W) geom(G.W,G.H);
  if(!inited) initSim();
  const dtf=Math.min(dt,0.05)*60;
  if(P.mode==='doping') stepDoping(dtf);
  else if(P.mode==='junction') stepJunction(dtf);
  else stepTransistor(dtf);
}
function jitter(p,dtf,x0,x1){
  if(Math.random()<0.06*dtf){ p.vx=(Math.random()-0.5)*1.6; p.vy=(Math.random()-0.5)*1.6; }
  p.x+=p.vx*dtf; p.y+=p.vy*dtf;
  if(p.x<x0+4){p.x=x0+4;p.vx=Math.abs(p.vx);} if(p.x>x1-4){p.x=x1-4;p.vx=-Math.abs(p.vx);}
  if(p.y<G.y0+5){p.y=G.y0+5;p.vy=Math.abs(p.vy);} if(p.y>G.y1-5){p.y=G.y1-5;p.vy=-Math.abs(p.vy);}
}
function stepDoping(dtf){
  if(!freeC){ freeC={x:(G.x0+G.x1)/2+30,y:(G.y0+G.y1)/2,vx:1,vy:0.6}; return; }
  const m=(P.dope==='n'?1.0:0.6);   // elettrone libero più mobile della lacuna
  if(Math.random()<0.05*dtf){ freeC.vx=(Math.random()-0.5)*2.4; freeC.vy=(Math.random()-0.5)*2.4; }
  freeC.x+=freeC.vx*m*dtf; freeC.y+=freeC.vy*m*dtf;
  const x0=G.x0+34,x1=G.x1-34,y0=G.y0+16,y1=G.y1-12;
  if(freeC.x<x0){freeC.x=x0;freeC.vx=Math.abs(freeC.vx);} if(freeC.x>x1){freeC.x=x1;freeC.vx=-Math.abs(freeC.vx);}
  if(freeC.y<y0){freeC.y=y0;freeC.vy=Math.abs(freeC.vy);} if(freeC.y>y1){freeC.y=y1;freeC.vy=-Math.abs(freeC.vy);}
}

function stepJunction(dtf){
  const W=deplW(P.V), half=(G.x1-G.x0)*0.10*W;   // mezza larghezza svuotamento (px)
  const dL=G.jx-half, dR=G.jx+half;
  const I=diodeRel(P.V);
  for(const p of parts){
    jitter(p,dtf, G.x0, G.x1);
    // svuotamento: i maggioritari vengono respinti dalla zona di carica spaziale (campo built-in)
    if(p.kind==='h' && p.x>dL && p.x<G.jx+ (I>0?half*0.5:0)){ if(I<=0.02){ p.x=dL-2; p.vx=-Math.abs(p.vx); } }
    if(p.kind==='e' && p.x<dR && p.x>G.jx- (I>0?half*0.5:0)){ if(I<=0.02){ p.x=dR+2; p.vx=Math.abs(p.vx); } }
  }
  // polarizzazione diretta: iniezione attraverso la giunzione + ricombinazione
  if(I>0.03){
    spawnAcc += I*1.6*dtf;
    while(spawnAcc>=1){ spawnAcc-=1;
      // una lacuna attraversa in n e un elettrone in p (poi ricombinano → fade)
      const h=parts.find(q=>q.kind==='h' && q.x>dL-30 && !q.cross); if(h){ h.cross=1; h.vx=2.2; }
      const e=parts.find(q=>q.kind==='e' && q.x<dR+30 && !q.cross); if(e){ e.cross=1; e.vx=-2.2; }
    }
  }
  for(const p of parts){ if(p.cross){ p.x+=p.vx*dtf; p.t+=dtf;
    if(p.t>40 || p.x<G.x0+6 || p.x>G.x1-6){ // ricombinato → rigenera al contatto
      p.cross=0; p.t=0; if(p.kind==='h'){ p.x=G.x0+6+Math.random()*20; } else { p.x=G.x1-6-Math.random()*20; } p.vx=(Math.random()-0.5)*1.6; }
  }}
}

function stepTransistor(dtf){
  const xe=G.x0+(G.x1-G.x0)*0.30, xb=G.x0+(G.x1-G.x0)*0.46;  // emettitore|base|collettore
  const drive=clamp(P.Ib/60,0.05,1.5);
  for(const p of parts){
    p.x += (1.4+drive*1.2)*dtf;        // deriva verso il collettore (campo)
    p.y += p.vy*dtf*0.5; if(Math.random()<0.05*dtf) p.vy=(Math.random()-0.5)*1.4;
    if(p.y<G.y0+6){p.y=G.y0+6;p.vy=Math.abs(p.vy);} if(p.y>G.y1-6){p.y=G.y1-6;p.vy=-Math.abs(p.vy);}
    // piccola frazione ricombina nella base (corrente di base)
    if(!p.rec && p.x>xe && p.x<xb && Math.random()<0.02){ p.rec=1; }
    if(p.rec){ p.vy*=0.9; if(p.x>xb-2){ p.x=G.x0+4; p.rec=0; p.y=G.y0+8+Math.random()*(G.y1-G.y0-16); } } // riassorbito → riemesso
    if(p.x>G.x1-5){ p.x=G.x0+4; p.y=G.y0+8+Math.random()*(G.y1-G.y0-16); p.vy=(Math.random()-0.5)*1.4; }  // arrivato al collettore → riemesso
  }
}

// ═══ Rendering ════════════════════════════════════════════════════════════════
function roundRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function arrow(ctx,x1,y1,x2,y2,col,lw){
  ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=lw; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  const a=Math.atan2(y2-y1,x2-x1), s=5+lw;
  ctx.beginPath(); ctx.moveTo(x2,y2); ctx.lineTo(x2-s*Math.cos(a-0.45),y2-s*Math.sin(a-0.45)); ctx.lineTo(x2-s*Math.cos(a+0.45),y2-s*Math.sin(a+0.45)); ctx.closePath(); ctx.fill();
}
function carrier(ctx,p){
  if(p.kind==='e'){ ctx.fillStyle=rgb(T.elec); ctx.beginPath(); ctx.arc(p.x,p.y,3.4,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#fff'; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('−',p.x,p.y+0.5); ctx.textBaseline='alphabetic'; }
  else { // lacuna: cerchio VUOTO con circonferenza tratteggiata
    ctx.strokeStyle=rgb(T.hole); ctx.lineWidth=1.5; ctx.setLineDash([2,2]);
    ctx.beginPath(); ctx.arc(p.x,p.y,4,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]); }
}
function fixedIons(ctx,x0,x1,sign,col){
  const n=Math.round((x1-x0)/40), rows=2;
  ctx.fillStyle=rgba(col,0.6); ctx.font='10px "Space Mono",monospace'; ctx.textAlign='center';
  for(let i=0;i<n;i++) for(let r=0;r<rows;r++){ const x=x0+ (x1-x0)*(i+0.5)/n, y=G.y0+ (G.y1-G.y0)*(0.28+0.44*r);
    ctx.beginPath(); ctx.arc(x,y,6,0,Math.PI*2); ctx.strokeStyle=rgba(col,0.5); ctx.lineWidth=1; ctx.stroke();
    ctx.fillStyle=rgba(col,0.85); ctx.fillText(sign,x,y+3.5); }
}

function draw(canvas){
  const [ctx, W, H] = Lab.ctx2d(canvas);
  T=pal(); ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  geom(W,H);
  if(P.mode==='doping') drawDoping(ctx);
  else if(P.mode==='junction') drawJunction(ctx);
  else drawTransistor(ctx);
}

function crystal(){
  const cols=5, rows=3, mx=G.x0+50, Mx=G.x1-50, my=G.y0+24, My=G.y1-16;
  const dx=(Mx-mx)/(cols-1), dy=(My-my)/(rows-1), r=clamp(Math.min(dx*0.20,dy*0.30),12,18);
  const atoms=[]; for(let rr=0;rr<rows;rr++) for(let c=0;c<cols;c++) atoms.push({x:mx+c*dx,y:my+rr*dy,r});
  return {atoms, cols, rows, dx, dy, dop: Math.floor(rows/2)*cols+Math.floor(cols/2)};
}
function drawBond(ctx,a,b){
  const mx=(a.x+b.x)/2,my=(a.y+b.y)/2, dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1, px=-dy/len,py=dx/len, off=Math.min(7,len*0.10);
  ctx.strokeStyle=dk()?'rgba(210,220,235,0.6)':'rgba(40,55,80,0.65)'; ctx.lineWidth=1.2;
  for(const s of [1,-1]){ ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.quadraticCurveTo(mx+px*off*s,my+py*off*s,b.x,b.y); ctx.stroke(); }
  ctx.fillStyle=dk()?'#e8edf5':'#16233c';   // elettroni di legame (condivisi)
  for(const f of [0.36,0.64]){ ctx.beginPath(); ctx.arc(a.x+dx*f, a.y+dy*f, 2.4,0,Math.PI*2); ctx.fill(); }
}
function drawAtom(ctx,a,label,isDop){
  ctx.fillStyle=dk()?'#0b1018':'#ffffff'; ctx.beginPath(); ctx.arc(a.x,a.y,a.r,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=isDop?T.accent:(dk()?'rgba(220,228,240,0.85)':'rgba(40,55,80,0.85)'); ctx.lineWidth=isDop?2.2:1.4; ctx.stroke();
  ctx.fillStyle=isDop?T.accent:T.txt; ctx.font='bold '+Math.round(a.r*0.72)+'px "Space Mono",monospace'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(label,a.x,a.y); ctx.textBaseline='alphabetic';
}
function drawDoping(ctx){
  const nType=P.dope==='n', cr=crystal();
  // legami covalenti (verso destra e verso il basso)
  for(let r=0;r<cr.rows;r++) for(let c=0;c<cr.cols;c++){ const i=r*cr.cols+c;
    if(c<cr.cols-1) drawBond(ctx,cr.atoms[i],cr.atoms[i+1]);
    if(r<cr.rows-1) drawBond(ctx,cr.atoms[i],cr.atoms[i+cr.cols]);
  }
  // atomi (host +4, dopante +5/+3)
  for(let i=0;i<cr.atoms.length;i++) drawAtom(ctx,cr.atoms[i], i===cr.dop?(nType?'+5':'+3'):'+4', i===cr.dop);
  // elettrone libero (N) o lacuna (P): cerchio tratteggiato + etichetta con leader
  if(freeC){
    if(nType){
      ctx.fillStyle=rgb(T.elec); ctx.beginPath(); ctx.arc(freeC.x,freeC.y,4.5,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle=rgb(T.elec); ctx.lineWidth=1.4; ctx.setLineDash([3,2]); ctx.beginPath(); ctx.arc(freeC.x,freeC.y,9.5,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
    } else {
      ctx.strokeStyle=rgb(T.hole); ctx.lineWidth=1.6; ctx.setLineDash([3,2]);
      ctx.beginPath(); ctx.arc(freeC.x,freeC.y,9.5,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(freeC.x,freeC.y,4.5,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.strokeStyle=T.sub; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(freeC.x,freeC.y-11); ctx.lineTo(freeC.x+16,G.y0-4); ctx.stroke();
    ctx.fillStyle=nType?rgb(T.elec):rgb(T.hole); ctx.font='10px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText(nType?'elettrone libero':'lacuna', freeC.x+18, G.y0-4);
  }
  // intestazione
  ctx.textAlign='left'; ctx.fillStyle=T.accent; ctx.font='bold 14px "Space Mono",monospace';
  ctx.fillText(nType?'Drogaggio N — drogante pentavalente (+5)':'Drogaggio P — drogante trivalente (+3)', 14, 24);
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace';
  ctx.fillText('Reticolo di Silicio (+4) · drogante: '+DOP[P.dope][P.dopElem]+(nType?' → 1 elettrone in più (libero)':' → 1 legame mancante (lacuna)'), 14, 40);
}

function drawJunction(ctx){
  const W=deplW(P.V), half=(G.x1-G.x0)*0.10*W, dL=G.jx-half, dR=G.jx+half, I=diodeRel(P.V);
  // regioni p (sinistra) e n (destra)
  ctx.fillStyle=T.preg; roundRect(ctx,G.x0,G.y0,G.jx-G.x0,G.y1-G.y0,10); ctx.fill();
  ctx.fillStyle=T.nreg; roundRect(ctx,G.jx,G.y0,G.x1-G.jx,G.y1-G.y0,10); ctx.fill();
  ctx.strokeStyle=T.edge; ctx.lineWidth=1.5; roundRect(ctx,G.x0,G.y0,G.x1-G.x0,G.y1-G.y0,10); ctx.stroke();
  // zona di svuotamento
  ctx.fillStyle=T.depl; ctx.fillRect(dL,G.y0,dR-dL,G.y1-G.y0);
  ctx.strokeStyle=rgba([255,255,255],0.25); ctx.setLineDash([3,3]); ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(dL,G.y0); ctx.lineTo(dL,G.y1); ctx.moveTo(dR,G.y0); ctx.lineTo(dR,G.y1); ctx.stroke(); ctx.setLineDash([]);
  // ioni fissi: accettori (−) in p, donatori (+) in n
  fixedIons(ctx,G.x0,G.jx,'−',T.accept); fixedIons(ctx,G.jx,G.x1,'+',T.donor);
  // portatori
  for(const p of parts) carrier(ctx,p);
  // campo built-in nella zona di svuotamento (da n verso p)
  if(half>6){ arrow(ctx, dR-6, G.y0-12, dL+6, G.y0-12, rgb(T.field), 2.4);
    ctx.fillStyle=rgb(T.field); ctx.font='9px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText('E (built-in)', G.jx, G.y0-16); }
  // etichette regioni
  ctx.fillStyle=rgb(T.hole); ctx.font='bold 12px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText('p', (G.x0+dL)/2, G.y1+18);
  ctx.fillStyle=rgb(T.elec); ctx.fillText('n', (dR+G.x1)/2, G.y1+18);
  ctx.fillStyle=T.sub; ctx.font='8px "Space Mono",monospace'; ctx.fillText('svuotamento', G.jx, G.y1+18);
  // intestazione + stato
  ctx.textAlign='left'; ctx.fillStyle=T.accent; ctx.font='bold 14px "Space Mono",monospace';
  ctx.fillText('Giunzione p-n', 14, 24);
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace';
  const stato = P.V>0.05?'polarizzazione DIRETTA → conduce':(P.V<-0.05?'polarizzazione INVERSA → blocca':'equilibrio (nessuna polarizzazione)');
  ctx.fillText(`V = ${Lab.fmt(P.V,2)} V · ${stato}`, 14, 40);
  // batteria/contatti
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillText(P.V>=0?'+':'−', G.x0-4, G.cy+4); ctx.fillText(P.V>=0?'−':'+', G.x1+4, G.cy+4);
}

function drawTransistor(ctx){
  const xe=G.x0+(G.x1-G.x0)*0.30, xb=G.x0+(G.x1-G.x0)*0.46;
  const npn=P.btype==='npn', cE=npn?T.nreg:T.preg, cB=npn?T.preg:T.nreg, cC=npn?T.nreg:T.preg;
  ctx.fillStyle=cE; roundRect(ctx,G.x0,G.y0,xe-G.x0,G.y1-G.y0,8); ctx.fill();
  ctx.fillStyle=cB; ctx.fillRect(xe,G.y0,xb-xe,G.y1-G.y0);
  ctx.fillStyle=cC; roundRect(ctx,xb,G.y0,G.x1-xb,G.y1-G.y0,8); ctx.fill();
  ctx.strokeStyle=T.edge; ctx.lineWidth=1.5; roundRect(ctx,G.x0,G.y0,G.x1-G.x0,G.y1-G.y0,8); ctx.stroke();
  ctx.strokeStyle=rgba([255,255,255,0.3]); ctx.beginPath(); ctx.moveTo(xe,G.y0);ctx.lineTo(xe,G.y1); ctx.moveTo(xb,G.y0);ctx.lineTo(xb,G.y1); ctx.stroke();
  // portatori (elettroni che attraversano emettitore→base→collettore)
  for(const p of parts){ ctx.fillStyle = p.rec? rgb(T.hole):rgb(T.elec);
    ctx.beginPath(); ctx.arc(p.x,p.y,3.2,0,Math.PI*2); ctx.fill(); }
  // etichette regioni
  ctx.fillStyle=T.sub; ctx.font='bold 11px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillText(npn?'EMETTITORE (n)':'EMETTITORE (p)', (G.x0+xe)/2, G.y1+16);
  ctx.fillText(npn?'BASE (p)':'BASE (n)', (xe+xb)/2, G.y1+16);
  ctx.fillText(npn?'COLLETTORE (n)':'COLLETTORE (p)', (xb+G.x1)/2, G.y1+16);
  // frecce correnti
  arrow(ctx, G.x0-4, G.cy, G.x0+24, G.cy, rgb(T.elec), 3);
  arrow(ctx, (xe+xb)/2, G.y1+30, (xe+xb)/2, G.y1+50, rgb(T.hole), 2.2);
  ctx.fillStyle=rgb(T.hole); ctx.font='9px "Space Mono",monospace'; ctx.fillText('I_B', (xe+xb)/2+14, G.y1+44);
  arrow(ctx, G.x1-24, G.cy, G.x1+6, G.cy, rgb(T.elec), 3);
  ctx.fillStyle=rgb(T.elec); ctx.fillText('I_C', G.x1-2, G.cy-8);
  // intestazione
  ctx.textAlign='left'; ctx.fillStyle=T.accent; ctx.font='bold 14px "Space Mono",monospace';
  ctx.fillText('Transistor BJT ('+P.btype.toUpperCase()+')', 14, 24);
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace';
  ctx.fillText(`I_C = β·I_B = ${BETA}·${P.Ib}µA = ${Lab.fmt((icTransistor()/1000),2)} mA   (β=${BETA})`, 14, 40);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
function setTitles(){}   // i titoli sono disegnati dentro i grafici
function drawGraphs(){ if(P.mode==='doping') gDoping(); else if(P.mode==='junction') gJunction(); else gTransistor(); }
// testo centrato in un riquadro vuoto
function noteBox(cv,txt){ if(!cv||!cv._dpr) return; const [ctx,W,H]=Lab.ctx2d(cv), C=Lab.graphColors(); ctx.fillStyle=C.bg; ctx.fillRect(0,0,W,H);
  ctx.fillStyle=C.text; ctx.font='10.5px "DM Sans",sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(txt,W/2,H/2); }

function gJunction(){
  // 1: caratteristica del diodo I = I_s·(e^(V/V_T) − 1): conduce solo in diretta, sopra ~0,6 V
  let g=Lab.panel(gCanvas[0],{ title:'Corrente nel diodo (% di quella a 0,7 V)', xr:[-1,0.8], xStep:0.2, yr:[0,130], yStep:25, xLabel:'tensione V (volt)' });
  if(g){ const [ctx,f]=g; Lab.plot(ctx,f,v=>Math.max(0,diodeRel(v))*100,[-1,0.8],T.accent,2,[],300); Lab.dot(ctx,f,P.V,Math.max(0,diodeRel(P.V))*100,rgb(T.field),4.5);
    ctx.fillStyle=f.C.text; ctx.font='9.5px "DM Sans",sans-serif'; ctx.textBaseline='middle'; ctx.textAlign='left'; ctx.fillText('inversa: corrente ≈ 0',f.L+6,f.B-10); }
  // 2: la zona di svuotamento si allarga in inversa e si stringe in diretta: W ∝ √(V_bi − V)
  g=Lab.panel(gCanvas[1],{ title:'Larghezza della zona di svuotamento (relativa)', xr:[-1,0.8], xStep:0.2, yr:[0,2], yStep:0.5, xLabel:'tensione V (volt)' });
  if(g){ const [ctx,f]=g; Lab.plot(ctx,f,deplW,[-1,0.8],rgb(T.hole),2); Lab.dot(ctx,f,P.V,deplW(P.V),rgb(T.field),4.5); }
  // 3: barriera di potenziale V_bi − V che gli elettroni devono superare
  g=Lab.panel(gCanvas[2],{ title:'Barriera di potenziale V_bi − V (volt)', xr:[0,1], xStep:1e9, xFmt:()=> '', yr:[0,2], yStep:0.5 });
  if(g){ const [ctx,f]=g, v=Math.max(0,VBI-P.V), x0=f.X(0.3), x1=f.X(0.7);
    ctx.fillStyle=rgba(T.field,0.8); ctx.fillRect(x0,f.Y(v),x1-x0,f.B-f.Y(v));
    ctx.save(); ctx.setLineDash([3,3]); ctx.strokeStyle=f.C.text; ctx.beginPath(); ctx.moveTo(f.L,f.Y(VBI)); ctx.lineTo(f.R,f.Y(VBI)); ctx.stroke(); ctx.restore();
    ctx.fillStyle=f.C.title; ctx.font='9.5px "Space Mono",monospace'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(Lab.fmt(v,2)+' V',(x0+x1)/2,Math.max(f.T+6,f.Y(v)-8));
    ctx.fillStyle=f.C.text; ctx.font='9.5px "DM Sans",sans-serif'; ctx.textAlign='right'; ctx.fillText(`V_bi = ${Lab.fmt(VBI,1)} V (equilibrio)`,f.R-4,f.Y(VBI)-8); }
}
function gTransistor(){
  // 1: transcaratteristica I_C = β·I_B
  let g=Lab.panel(gCanvas[0],{ title:`Corrente di collettore I_C = β·I_B (mA), β = ${BETA}`, xr:[0,100], xStep:20, yr:[0,Lab.niceMax(BETA*100/1000)], xLabel:'corrente di base I_B (µA)' });
  if(g){ const [ctx,f]=g; Lab.plot(ctx,f,ib=>BETA*ib/1000,[0,100],T.accent,2); Lab.dot(ctx,f,P.Ib,icTransistor()/1000,rgb(T.field),4.5); }
  // 2: caratteristiche d'uscita: dopo la saturazione I_C non dipende più da V_CE ma solo da I_B
  g=Lab.panel(gCanvas[1],{ title:'Caratteristiche d’uscita I_C (mA)', xr:[0,10], xStep:2, yr:[0,Lab.niceMax(BETA*100/1000)], xLabel:'V_CE (volt)' });
  if(g){ const [ctx,f]=g;
    const set=[...new Set([20,50,100,P.Ib])].filter(v=>v>0).sort((a,b)=>a-b);
    for(const ib of set){ const cur=ib===P.Ib; Lab.plot(ctx,f,v=>BETA*ib*clamp(v/0.4,0,1)/1000,[0,10],cur?T.accent:f.C.text,cur?2.2:1,cur?[]:[3,3]);
      ctx.fillStyle=cur?T.accent:f.C.text; ctx.font='9px "DM Sans",sans-serif'; ctx.textAlign='right'; ctx.textBaseline='bottom'; ctx.fillText(`${ib} µA`,f.R-4,f.Y(BETA*ib/1000)-2); } }
  // 3: amplificazione: la corrente di collettore è β volte quella di base (scala logaritmica)
  g=Lab.panel(gCanvas[2],{ title:'Amplificazione: I_B e I_C (µA, scala log)', xr:[0,2], xStep:1e9, xFmt:()=> '', yr:[1,1e5], yLog:true });
  if(g){ const [ctx,f]=g;
    [[P.Ib,T.hole,'base I_B'],[icTransistor(),T.elec,'collettore I_C']].forEach(([v,c,l],i)=>{ const x=f.X(i+0.25), w=f.X(0.5)-f.X(0), y=f.Y(Math.max(1,v));
      ctx.fillStyle=rgba(c,0.85); ctx.fillRect(x,y,w,f.B-y);
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.font='9.5px "Space Mono",monospace'; ctx.fillStyle=f.C.title; ctx.fillText(Lab.fmt(v,0)+' µA',x+w/2,Math.max(f.T+6,y-8));
      ctx.font='9.5px "DM Sans",sans-serif'; ctx.fillStyle=f.C.text; ctx.fillText(l,x+w/2,f.B+10); }); }
}
function gDoping(){
  // 1: livelli introdotti dal drogante nel gap: donatori sotto la conduzione, accettori sopra la valenza
  const cv=gCanvas[0];
  if(cv&&cv._dpr){ const [ctx,W,H]=Lab.ctx2d(cv), C=Lab.graphColors(); ctx.fillStyle=C.bg; ctx.fillRect(0,0,W,H);
    ctx.fillStyle=C.text; ctx.font='10.5px "DM Sans",sans-serif'; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText('Livelli energetici del drogante',8,11);
    const cB=H*0.32, vB=H*0.82, x0=12, x1=W-12;
    ctx.fillStyle=rgba(T.elec,0.3); ctx.fillRect(x0,cB-8,x1-x0,16); ctx.fillStyle=rgba(T.hole,0.3); ctx.fillRect(x0,vB-8,x1-x0,16);
    ctx.font='9.5px "DM Sans",sans-serif'; ctx.fillStyle=C.text; ctx.fillText('banda di conduzione',x0+4,cB); ctx.fillText('banda di valenza',x0+4,vB);
    ctx.save(); ctx.setLineDash([4,3]); ctx.lineWidth=1.5;
    const y=P.dope==='n'?cB+18:vB-18; ctx.strokeStyle=P.dope==='n'?rgb(T.elec):rgb(T.hole); ctx.beginPath(); ctx.moveTo(x0+8,y); ctx.lineTo(x1-8,y); ctx.stroke(); ctx.restore();
    ctx.fillStyle=P.dope==='n'?rgb(T.elec):rgb(T.hole); ctx.textAlign='right'; ctx.fillText(P.dope==='n'?'livello dei donatori (~0,05 eV sotto)':'livello degli accettori (~0,05 eV sopra)',x1-8,y+(P.dope==='n'?10:-10)); }
  // 2: i portatori maggioritari crescono in proporzione alla concentrazione di drogante
  const g=Lab.panel(gCanvas[1],{ title:`Portatori maggioritari (${P.dope==='n'?'elettroni':'lacune'}, relativi)`, xr:[0,10], xStep:2, yr:[0,10], yStep:2, xLabel:'concentrazione del drogante (relativa)' });
  if(g){ const [ctx,f]=g; Lab.plot(ctx,f,c=>c,[0,10],P.dope==='n'?rgb(T.elec):rgb(T.hole),2); Lab.dot(ctx,f,P.conc,P.conc,rgb(T.field),4.5); }
  noteBox(gCanvas[2], P.dope==='n'?'tipo n: atomi con 5 elettroni di valenza cedono un elettrone libero':'tipo p: atomi con 3 elettroni di valenza creano una lacuna');
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
function reControls(){ setTimeout(buildControls,0); }
function buildControls(){
  const cont=document.getElementById('controls'); cont.innerHTML='';
  const secM=Lab.Section('Dispositivo'); cont.appendChild(secM.el);
  secM.add(Lab.RadioGroup({ label:'Tipo', options:[{value:'doping',label:'Semiconduttore drogato'},{value:'junction',label:'Giunzione p-n'},{value:'transistor',label:'Transistor BJT'}],
    value:P.mode, onChange(v){ if(v===P.mode)return; P.mode=v; setTitles(); initSim(); buildReadout(); reControls(); } }));
  if(P.mode==='doping'){
    const s=Lab.Section('Drogaggio'); cont.appendChild(s.el);
    s.add(Lab.RadioGroup({ label:'Tipo', options:[{value:'n',label:'Tipo n (pentavalente)'},{value:'p',label:'Tipo p (trivalente)'}],
      value:P.dope, onChange(v){ P.dope=v; P.dopElem=Object.keys(DOP[v])[0]; initSim(); reControls(); } }));
    const se=Lab.Section('Elemento drogante'); cont.appendChild(se.el);
    se.add(Lab.RadioGroup({ label:P.dope==='n'?'pentavalenti (+5)':'trivalenti (+3)',
      options:Object.keys(DOP[P.dope]).map(k=>({value:k,label:DOP[P.dope][k]})), value:P.dopElem, onChange(v){ P.dopElem=v; } }));
  } else if(P.mode==='junction'){
    const s=Lab.Section('Polarizzazione'); cont.appendChild(s.el);
    s.add(Lab.Slider({ label:'Tensione V', min:-1, max:0.8, step:0.02, value:P.V, unit:' V', onChange(v){ P.V=v; } }));
  } else {
    const s=Lab.Section('Transistor'); cont.appendChild(s.el);
    s.add(Lab.RadioGroup({ label:'Tipo', options:[{value:'npn',label:'NPN'},{value:'pnp',label:'PNP'}], value:P.btype, onChange(v){ P.btype=v; } }));
    s.add(Lab.Slider({ label:'Corrente di base I_B', min:0, max:100, step:5, value:P.Ib, unit:' µA', onChange(v){ P.Ib=v; } }));
  }
}
function buildReadout(){
  const el=document.getElementById('readout'); el.innerHTML='';
  const f = P.mode==='doping' ? [{key:'tipo',label:'tipo di drogaggio'},{key:'elem',label:'drogante'},{key:'val',label:'elettroni di valenza'},{key:'mob',label:'portatore maggioritario'}]
    : P.mode==='junction' ? [{key:'v',label:'tensione applicata'},{key:'stato',label:'polarizzazione'},{key:'w',label:'zona di svuotamento'},{key:'i',label:'corrente (relativa)'},{key:'vbi',label:'barriera V_bi − V'}]
    : [{key:'ib',label:'corrente di base I_B'},{key:'ic',label:'corrente di collettore I_C'},{key:'beta',label:'guadagno β'},{key:'tipo',label:'tipo di transistor'}];
  readout=new Lab.Readout(el,f);
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
  document.getElementById('btnMode').addEventListener('click',()=>{ P.mode = P.mode==='doping'?'junction':P.mode==='junction'?'transistor':'doping'; setTitles(); initSim(); buildReadout(); buildControls(); });
  document.getElementById('btnReset').addEventListener('click',()=>{ P.mode='junction'; P.dope='n'; P.dopElem='P'; P.V=0; P.Ib=20; P.btype='npn'; P.paused=false; buildControls(); buildReadout(); setTitles(); initSim(); });

  function resize(){
    const area=document.querySelector('.lab-canvas-area'); if(!area)return;
    const ar=area.getBoundingClientRect();
    const rb=document.getElementById('readout').getBoundingClientRect();
    const ga=document.getElementById('graphArea'); const gaH=ga?ga.offsetHeight:0;
    const h=Math.max(220,Math.floor(ar.height-rb.height-gaH-4));
    Lab.hidpi(simCanvas, Math.floor(ar.width), h);
    geom(simCanvas.width/(simCanvas._dpr||1),simCanvas.height/(simCanvas._dpr||1));
    if(!inited) initSim();
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
      if(P.mode==='doping'){
        readout.set('tipo', P.dope==='n'?'n (donatore)':'p (accettore)');
        readout.set('elem', DOP[P.dope][P.dopElem]);
        readout.set('val', P.dope==='n'?'+5 (pentavalente)':'+3 (trivalente)');
        readout.set('mob', P.dope==='n'?'elettrone libero':'lacuna');
      } else if(P.mode==='junction'){
        readout.set('v', Lab.fmt(P.V,2)+' V');
        readout.set('stato', P.V>0.05?'diretta':(P.V<-0.05?'inversa':'equilibrio'));
        readout.set('w', Lab.fmt(deplW(P.V),2)+' (rel.)');
        readout.set('i', Lab.fmt((diodeRel(P.V)*100),0)+' %');
        readout.set('vbi', Lab.fmt((VBI-P.V),2)+' V');
      } else {
        readout.set('ib', Lab.fmt(P.Ib,0)+' µA'); readout.set('ic', Lab.fmt((icTransistor()/1000),2)+' mA');
        readout.set('beta', String(BETA)); readout.set('tipo', P.btype.toUpperCase());
      }
    }catch(err){ console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
