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
  const ctx=canvas.getContext('2d');
  const W=canvas.width,H=canvas.height;
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
  ctx.fillText(`V = ${P.V.toFixed(2)} V · ${stato}`, 14, 40);
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
  ctx.fillText(`I_C = β·I_B = ${BETA}·${P.Ib}µA = ${(icTransistor()/1000).toFixed(2)} mA   (β=${BETA})`, 14, 40);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
function gBase(ctx,W,H,PAD,zeroX){
  ctx.fillStyle=T.gBg; ctx.fillRect(0,0,W,H);
  const gW=W-PAD.l-PAD.r, gH=H-PAD.t-PAD.b;
  ctx.strokeStyle=T.gAxis; ctx.lineWidth=0.6;
  if(zeroX!=null){ const zx=PAD.l+gW*zeroX; ctx.beginPath(); ctx.moveTo(PAD.l,PAD.t+gH); ctx.lineTo(PAD.l+gW,PAD.t+gH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(zx,PAD.t); ctx.lineTo(zx,PAD.t+gH); ctx.stroke(); return {gW,gH,zx}; }
  ctx.beginPath(); ctx.moveTo(PAD.l,PAD.t); ctx.lineTo(PAD.l,PAD.t+gH); ctx.lineTo(PAD.l+gW,PAD.t+gH); ctx.stroke();
  return {gW,gH};
}
function setTitles(){
  const t = P.mode==='doping' ? ['Livelli energetici','Portatori vs drogaggio','—']
    : P.mode==='junction' ? ['Caratteristica I–V (diodo)','Larghezza svuotamento W(V)','Barriera di potenziale']
    : ['Transfer I_C(I_B)','Uscita I_C(V_CE)','Guadagno β'];
  for(let i=0;i<3;i++) if(gTitle[i]) gTitle[i].textContent=t[i];
}
function drawGraphs(){ if(P.mode==='doping') gDoping(); else if(P.mode==='junction') gJunction(); else gTransistor(); }

function gJunction(){
  // 1: I–V diodo
  if(gCanvas[0]&&gCanvas[0].width){ const cv=gCanvas[0],ctx=gCtx[0],W=cv.width,H=cv.height,PAD={t:14,b:18,l:24,r:8};
    const {gW,gH,zx}=gBase(ctx,W,H,PAD,0.6); const Vmin=-1,Vmax=0.85;
    const xOf=v=>PAD.l+(v-Vmin)/(Vmax-Vmin)*gW, yOf=i=>PAD.t+gH-clamp(i,-0.05,1)*gH*0.85;
    ctx.strokeStyle=T.accent; ctx.lineWidth=1.6; ctx.beginPath(); let f=true;
    for(let i=0;i<=90;i++){ const v=Vmin+(Vmax-Vmin)*i/90,x=xOf(v),y=yOf(diodeRel(v)); f?(ctx.moveTo(x,y),f=false):ctx.lineTo(x,y);} ctx.stroke();
    ctx.fillStyle=rgb(T.field); ctx.beginPath(); ctx.arc(xOf(P.V),yOf(diodeRel(P.V)),3.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('I',PAD.l+2,PAD.t+7); ctx.textAlign='right'; ctx.fillText('V',PAD.l+gW-2,PAD.t+gH-3);
  }
  // 2: W(V)
  if(gCanvas[1]&&gCanvas[1].width){ const cv=gCanvas[1],ctx=gCtx[1],W=cv.width,H=cv.height,PAD={t:14,b:18,l:24,r:8};
    const {gW,gH,zx}=gBase(ctx,W,H,PAD,0.6); const Vmin=-1,Vmax=0.7;
    const xOf=v=>PAD.l+(v-Vmin)/(Vmax-Vmin)*gW, yOf=w=>PAD.t+gH-clamp(w/2,0,1)*gH*0.9;
    ctx.strokeStyle=rgb(T.hole); ctx.lineWidth=1.6; ctx.beginPath(); let f=true;
    for(let i=0;i<=90;i++){ const v=Vmin+(Vmax-Vmin)*i/90,x=xOf(v),y=yOf(deplW(v)); f?(ctx.moveTo(x,y),f=false):ctx.lineTo(x,y);} ctx.stroke();
    ctx.fillStyle=rgb(T.field); ctx.beginPath(); ctx.arc(xOf(P.V),yOf(deplW(P.V)),3.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('W',PAD.l+2,PAD.t+7); ctx.textAlign='right'; ctx.fillText('V',PAD.l+gW-2,PAD.t+gH-3);
  }
  // 3: barriera di potenziale (Vbi − V)
  if(gCanvas[2]&&gCanvas[2].width){ const cv=gCanvas[2],ctx=gCtx[2],W=cv.width,H=cv.height,PAD={t:14,b:18,l:10,r:10};
    const {gW,gH}=gBase(ctx,W,H,PAD);
    const bar=clamp((VBI-P.V)/(VBI+1),0,1);
    ctx.fillStyle=rgba(T.field,0.8); ctx.fillRect(PAD.l+gW*0.3, PAD.t+gH-bar*gH*0.9, gW*0.4, bar*gH*0.9);
    ctx.fillStyle=T.gText; ctx.font='8px "Space Mono",monospace'; ctx.textAlign='center';
    ctx.fillText((VBI-P.V).toFixed(2)+' V', PAD.l+gW*0.5, PAD.t+gH-bar*gH*0.9-4);
    ctx.fillText('barriera = Vbi−V', PAD.l+gW*0.5, PAD.t+gH+10);
  }
}
function gTransistor(){
  // 1: transfer Ic(Ib) lineare
  if(gCanvas[0]&&gCanvas[0].width){ const cv=gCanvas[0],ctx=gCtx[0],W=cv.width,H=cv.height,PAD={t:14,b:18,l:26,r:8};
    const {gW,gH}=gBase(ctx,W,H,PAD); const Ibmax=100;
    const xOf=i=>PAD.l+i/Ibmax*gW, yOf=ic=>PAD.t+gH-clamp(ic/(BETA*Ibmax),0,1)*gH*0.9;
    ctx.strokeStyle=T.accent; ctx.lineWidth=1.6; ctx.beginPath(); ctx.moveTo(xOf(0),yOf(0)); ctx.lineTo(xOf(Ibmax),yOf(BETA*Ibmax)); ctx.stroke();
    ctx.fillStyle=rgb(T.field); ctx.beginPath(); ctx.arc(xOf(P.Ib),yOf(icTransistor()),3.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('I_C',PAD.l+2,PAD.t+7); ctx.textAlign='right'; ctx.fillText('I_B',PAD.l+gW-2,PAD.t+gH-3);
  }
  // 2: uscita Ic(Vce) — saturazione poi plateau ∝ Ib
  if(gCanvas[1]&&gCanvas[1].width){ const cv=gCanvas[1],ctx=gCtx[1],W=cv.width,H=cv.height,PAD={t:14,b:18,l:26,r:8};
    const {gW,gH}=gBase(ctx,W,H,PAD); const Vmax=10, Icmax=BETA*100;
    const xOf=v=>PAD.l+v/Vmax*gW, yOf=ic=>PAD.t+gH-clamp(ic/Icmax,0,1)*gH*0.9;
    for(const ib of [20,50,100]){ ctx.strokeStyle=ib===P.Ib?T.accent:'rgba(120,140,170,0.4)'; ctx.lineWidth=ib===P.Ib?1.7:1; ctx.beginPath();
      for(let i=0;i<=60;i++){ const v=Vmax*i/60, plateau=BETA*ib, ic=plateau*clamp(v/0.4,0,1); const x=xOf(v),y=yOf(ic); i?ctx.lineTo(x,y):ctx.moveTo(x,y);} ctx.stroke(); }
    ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('I_C',PAD.l+2,PAD.t+7); ctx.textAlign='right'; ctx.fillText('V_CE',PAD.l+gW-2,PAD.t+gH-3);
  }
  // 3: guadagno β (barre Ib vs Ic)
  if(gCanvas[2]&&gCanvas[2].width){ const cv=gCanvas[2],ctx=gCtx[2],W=cv.width,H=cv.height,PAD={t:16,b:22,l:10,r:10};
    const {gW,gH}=gBase(ctx,W,H,PAD); const max=BETA*100;
    const bars=[{v:P.Ib,c:T.hole,l:'I_B'},{v:icTransistor(),c:T.elec,l:'I_C'}]; const bw=gW/2*0.5;
    bars.forEach((b,i)=>{ const cx=PAD.l+gW*(i+0.5)/2, bh=clamp(b.v/max,0,1)*gH; ctx.fillStyle=rgba(b.c,0.85); ctx.fillRect(cx-bw/2,PAD.t+gH-bh,bw,bh);
      ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText(b.l,cx,PAD.t+gH+10);
      ctx.fillStyle=rgb(b.c); ctx.fillText((b.v>=1000?(b.v/1000).toFixed(1)+'m':b.v+'µ'), cx, PAD.t+gH-bh-3); });
    ctx.fillStyle=T.gText; ctx.textAlign='center'; ctx.fillText('β = '+BETA, PAD.l+gW*0.5, PAD.t+8);
  }
}
function gDoping(){
  // 1: livelli energetici (donatore vicino a conduzione / accettore vicino a valenza)
  if(gCanvas[0]&&gCanvas[0].width){ const cv=gCanvas[0],ctx=gCtx[0],W=cv.width,H=cv.height,PAD={t:14,b:14,l:10,r:10};
    const {gW,gH}=gBase(ctx,W,H,PAD); const cB=PAD.t+gH*0.2, vB=PAD.t+gH*0.8;
    ctx.fillStyle=rgba(T.elec,0.25); ctx.fillRect(PAD.l,cB-6,gW,12); ctx.fillStyle=rgba(T.hole,0.25); ctx.fillRect(PAD.l,vB-6,gW,12);
    ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('conduzione',PAD.l+2,cB-8); ctx.fillText('valenza',PAD.l+2,vB+14);
    ctx.setLineDash([3,2]); ctx.strokeStyle=rgb(T.dop||[200,140,255]);
    if(P.dope==='n'){ const dy=cB+12; ctx.beginPath(); ctx.moveTo(PAD.l+8,dy); ctx.lineTo(PAD.l+gW-8,dy); ctx.stroke(); ctx.fillStyle='rgb(120,170,255)'; ctx.fillText('livello donatori',PAD.l+10,dy-2); }
    else { const ay=vB-12; ctx.beginPath(); ctx.moveTo(PAD.l+8,ay); ctx.lineTo(PAD.l+gW-8,ay); ctx.stroke(); ctx.fillStyle='rgb(255,140,120)'; ctx.fillText('livello accettori',PAD.l+10,ay-2); }
    ctx.setLineDash([]);
  }
  // 2: portatori vs concentrazione
  if(gCanvas[1]&&gCanvas[1].width){ const cv=gCanvas[1],ctx=gCtx[1],W=cv.width,H=cv.height,PAD={t:14,b:18,l:24,r:8};
    const {gW,gH}=gBase(ctx,W,H,PAD);
    const xOf=c=>PAD.l+c/10*gW, yOf=v=>PAD.t+gH-clamp(v/10,0,1)*gH*0.9;
    ctx.strokeStyle=P.dope==='n'?rgb(T.elec):rgb(T.hole); ctx.lineWidth=1.6; ctx.beginPath(); ctx.moveTo(xOf(0),yOf(0)); ctx.lineTo(xOf(10),yOf(10)); ctx.stroke();
    ctx.fillStyle=rgb(T.field); ctx.beginPath(); ctx.arc(xOf(P.conc),yOf(P.conc),3.5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=T.gText; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('maggioritari',PAD.l+2,PAD.t+7); ctx.textAlign='right'; ctx.fillText('drogaggio',PAD.l+gW-2,PAD.t+gH-3);
  }
  if(gCanvas[2]&&gCanvas[2].width){ const ctx=gCtx[2]; ctx.fillStyle=T.gBg; ctx.fillRect(0,0,gCanvas[2].width,gCanvas[2].height);
    ctx.fillStyle=T.sub; ctx.font='9px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText(P.dope==='n'?'maggioritari: e⁻':'maggioritari: lacune', gCanvas[2].width/2, gCanvas[2].height/2); }
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
  const f = P.mode==='doping' ? [{key:'tipo',label:'Tipo'},{key:'elem',label:'Drogante'},{key:'val',label:'Valenza'},{key:'mob',label:'Portatore'}]
    : P.mode==='junction' ? [{key:'v',label:'Tensione'},{key:'stato',label:'Stato'},{key:'w',label:'Larghezza svuot.'},{key:'i',label:'Corrente (rel.)'},{key:'vbi',label:'Barriera'}]
    : [{key:'ib',label:'I_B'},{key:'ic',label:'I_C'},{key:'beta',label:'Guadagno β'},{key:'tipo',label:'Tipo'}];
  readout=new Lab.Readout(el,f);
}

function initGraphs(){
  const ga=document.getElementById('graphArea');
  ga.style.cssText='display:flex;flex-direction:row;gap:5px;padding:5px 0 3px;height:150px;box-sizing:border-box;border-top:1px solid rgba(100,150,200,0.14);';
  for(let i=0;i<3;i++){
    const panel=document.createElement('div');
    panel.style.cssText='flex:1;min-width:0;position:relative;background:rgba(2,7,18,0.8);border:1px solid rgba(100,150,200,0.11);border-radius:4px;overflow:hidden;';
    const title=document.createElement('div');
    title.style.cssText='position:absolute;top:3px;left:6px;font-size:8px;color:rgba(100,175,200,0.65);font-family:"Space Mono",monospace;text-transform:uppercase;letter-spacing:0.4px;z-index:1;pointer-events:none;';
    const cv=document.createElement('canvas'); cv.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;';
    panel.appendChild(title); panel.appendChild(cv); ga.appendChild(panel);
    gCanvas[i]=cv; gCtx[i]=cv.getContext('2d'); gTitle[i]=title;
  }
  setTitles();
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
    simCanvas.style.width=Math.floor(ar.width)+'px'; simCanvas.style.height=h+'px';
    simCanvas.width=Math.floor(ar.width); simCanvas.height=h;
    geom(simCanvas.width,simCanvas.height);
    if(!inited) initSim();
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
      if(P.mode==='doping'){
        readout.set('tipo', P.dope==='n'?'n (donatore)':'p (accettore)');
        readout.set('elem', DOP[P.dope][P.dopElem]);
        readout.set('val', P.dope==='n'?'+5 (pentavalente)':'+3 (trivalente)');
        readout.set('mob', P.dope==='n'?'elettrone libero':'lacuna');
      } else if(P.mode==='junction'){
        readout.set('v', P.V.toFixed(2)+' V');
        readout.set('stato', P.V>0.05?'diretta':(P.V<-0.05?'inversa':'equilibrio'));
        readout.set('w', deplW(P.V).toFixed(2)+' (rel.)');
        readout.set('i', (diodeRel(P.V)*100).toFixed(0)+' %');
        readout.set('vbi', (VBI-P.V).toFixed(2)+' V');
      } else {
        readout.set('ib', P.Ib+' µA'); readout.set('ic', (icTransistor()/1000).toFixed(2)+' mA');
        readout.set('beta', String(BETA)); readout.set('tipo', P.btype.toUpperCase());
      }
    }catch(err){ console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
