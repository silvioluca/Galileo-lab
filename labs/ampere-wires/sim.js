'use strict';

// ═══ Costanti ═════════════════════════════════════════════════════════════════
const MU0 = 4*Math.PI*1e-7;   // T·m/A

// ═══ Stato ════════════════════════════════════════════════════════════════════
const P = {
  I1:   10,      // corrente filo 1 (A), segno = verso
  I2:   10,      // corrente filo 2 (A)
  dist: 4,       // distanza a riposo (cm)
  tension: 50,   // tensione dei fili (N) — rigidità al movimento
  view: '2d',    // '2d' | '3d'
  showB: true,
  showForce: true,
};

// posizione laterale del CENTRO dei fili (cm); estremità fisse a ∓dist/2
let x1=-2, x2=+2, v1=0, v2=0;
let zoom=1;
let rotX=-0.35, rotY=0.6, dragging=false, lastX=0, lastY=0;
let gTitle=[null,null,null];
let gCanvas=[null,null,null], gCtx=[null,null,null];
let readout, t=0;

// ═══ Palette ══════════════════════════════════════════════════════════════════
function dk(){ return document.documentElement.dataset.theme !== 'light'; }
function pal(){
  const d=dk();
  return {
    bg:    d?'#06090f':'#e7edf4',
    txt:   d?'rgba(215,235,250,0.95)':'rgba(20,45,75,0.95)',
    sub:   d?'rgba(165,195,220,0.8)':'rgba(60,95,130,0.88)',
    accent:d?'#00d4ff':'#0a78b0',
    wire1: d?'#ff8a3a':'#d2620a',
    wire2: d?'#4fd0ff':'#0a78b0',
    bfield:d?'rgba(120,180,255,0.45)':'rgba(40,110,200,0.5)',
    force: d?'#ff4d6d':'#d61f4a',
    grid:  d?'rgba(120,150,190,0.22)':'rgba(60,95,130,0.28)',
    gBg:   d?'rgb(3,9,22)':'#eef2f7',
    gAxis: d?'rgba(100,155,210,0.26)':'rgba(40,80,130,0.30)',
    gText: d?'rgba(150,205,225,0.88)':'rgba(25,65,105,0.92)',
  };
}
let T=pal();

// ═══ Fisica ═══════════════════════════════════════════════════════════════════
// La forza si calcola alla distanza a riposo: lo spostamento vero dei fili è di pochi micrometri
function forcePerLen(){ return MU0*P.I1*P.I2/(2*Math.PI*P.dist/100); } // N/m (con segno)
function attracting(){ return P.I1*P.I2>0; }              // correnti concordi → attrazione

// riporta i fili dritti (a riposo) → l'animazione riparte
function resetWires(){ x1=-P.dist/2; x2=P.dist/2; v1=0; v2=0; }

// ═══ Dinamica (molla = tensione) ──────────────────────────────────────────────
// Freccia di un filo lungo 1 m teso con tensione T sotto il carico F/L: f = (F/L)·L²/(8T).
// È dell'ordine del micrometro, quindi la si mostra amplificata e limitata a una frazione della
// distanza: cresce con la forza e cala con la tensione, ma i fili non si toccano mai.
function sagShown(){
  const sag = Math.abs(forcePerLen())/(8*P.tension);          // m
  return (P.dist/2)*0.6*Math.tanh(sag/2e-6);                  // cm sullo schermo
}
function physics(dt){
  const r1=-P.dist/2, r2=+P.dist/2;
  const dir = attracting()?1:-1;                 // +1 attrae, −1 respinge
  const d = sagShown();
  // i fili si portano (con un'oscillazione smorzata) alla freccia di equilibrio
  const a1 = 30*(r1+dir*d-x1) - 8*v1;
  const a2 = 30*(r2-dir*d-x2) - 8*v2;
  v1+=a1*dt; v2+=a2*dt; x1+=v1*dt; x2+=v2*dt;
}

// ═══ Rendering ════════════════════════════════════════════════════════════════
function draw(canvas){
  const [ctx, W, H] = Lab.ctx2d(canvas);
  ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  drawGrid(ctx,W,H);
  if(P.view==='2d') draw2D(ctx,W,H); else draw3D(ctx,W,H);
  drawHeader(ctx,W,H);
}

function drawGrid(ctx,W,H){
  ctx.strokeStyle = dk() ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';
  ctx.lineWidth=1;
  const step=40*zoom;
  for(let x=(W/2)%step; x<=W; x+=step){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for(let y=(H/2)%step; y<=H; y+=step){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
}

function drawHeader(ctx,W,H){
  ctx.textAlign='left';
  ctx.fillStyle=T.accent; ctx.font='bold 14px "Space Mono",monospace';
  ctx.fillText(`F/L = μ₀·I₁·I₂ / (2π·d)`, 14, 24);
  ctx.fillStyle=attracting()?T.wire2:T.force; ctx.font='12px "DM Sans",sans-serif';
  ctx.fillText(attracting()?'correnti concordi → ATTRAZIONE':'correnti discordi → REPULSIONE', 14, 42);
}

// ── Vista 2D (sezione trasversale): fili puntuali ⊙/⊗, fili fermi ─────────────
function draw2D(ctx,W,H){
  const cx=W/2, cy=H*0.52;
  const scale=Math.min(W,H)*0.06*zoom;        // px per cm
  const wx1=cx-P.dist/2*scale, wx2=cx+P.dist/2*scale;
  const wr=11;

  // campo magnetico: cerchi concentrici con freccine animate (verso del campo)
  if(P.showB){
    drawFieldCircles(ctx, wx1, cy, P.I1);
    drawFieldCircles(ctx, wx2, cy, P.I2);
    // etichetta B
    ctx.fillStyle=T.bfield; ctx.font='italic bold 12px "Space Mono",monospace'; ctx.textAlign='center';
    ctx.fillText('B', wx1, cy-78);
    ctx.fillText('B', wx2, cy-78);
  }

  // forza
  if(P.showForce){
    const att=attracting();
    drawForceArrow(ctx, wx1, cy, att?+1:-1, 'F₁');
    drawForceArrow(ctx, wx2, cy, att?-1:+1, 'F₂');
  }

  // fili puntuali con simbolo corrente (⊙ uscente / ⊗ entrante) e flusso animato
  drawWireDot(ctx, wx1, cy, wr, P.I1, T.wire1, 'I₁');
  drawWireDot(ctx, wx2, cy, wr, P.I2, T.wire2, 'I₂');

  // distanza
  ctx.strokeStyle=T.sub; ctx.lineWidth=1; ctx.setLineDash([3,3]);
  ctx.beginPath(); ctx.moveTo(wx1,cy+54); ctx.lineTo(wx2,cy+54); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillText(`d = ${Lab.fmt(P.dist,1)} cm`, (wx1+wx2)/2, cy+68);

  ctx.textAlign='left'; ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace';
  ctx.fillText('sezione trasversale · ⊙ corrente uscente · ⊗ corrente entrante', 14, H-16);
}

// cerchi di campo con freccine tangenziali animate (scorrimento = verso corrente)
function drawFieldCircles(ctx, wx, cy, I){
  const sign = I>=0 ? 1 : -1;     // uscente (⊙) → B antiorario
  ctx.strokeStyle=T.bfield; ctx.fillStyle=T.bfield; ctx.lineWidth=1;
  for(let r=24;r<=72;r+=16){
    ctx.beginPath(); ctx.arc(wx,cy,r,0,Math.PI*2); ctx.stroke();
    // 3 freccine tangenziali, posizioni animate nel tempo
    for(let j=0;j<3;j++){
      const a = sign*t*1.2 + j*Math.PI*2/3;
      const px=wx+Math.cos(a)*r, py=cy+Math.sin(a)*r;
      // direzione tangente (verso del campo)
      const tx=-Math.sin(a)*sign, ty=Math.cos(a)*sign;
      ctx.beginPath();
      ctx.moveTo(px+tx*5, py+ty*5);
      ctx.lineTo(px-tx*4-ty*3, py-ty*4+tx*3);
      ctx.lineTo(px-tx*4+ty*3, py-ty*4-tx*3);
      ctx.closePath(); ctx.fill();
    }
  }
}

// filo puntuale: cerchio + ⊙/⊗, con anello pulsante = scorrimento corrente
function drawWireDot(ctx, x, y, r, I, col, lbl){
  // alone pulsante (scorrere della corrente)
  const pulse=0.5+0.5*Math.sin(t*4*(I>=0?1:-1));
  ctx.globalAlpha=0.25+0.35*pulse;
  const g=ctx.createRadialGradient(x,y,r*0.4,x,y,r*1.9);
  g.addColorStop(0,col); g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r*1.9,0,Math.PI*2); ctx.fill();
  ctx.globalAlpha=1;

  ctx.fillStyle=col; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,0.4)'; ctx.lineWidth=1; ctx.stroke();
  // simbolo verso
  if(I>=0){ ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill(); }
  else { ctx.strokeStyle='#fff'; ctx.lineWidth=2; const s=r*0.55;
    ctx.beginPath(); ctx.moveTo(x-s,y-s); ctx.lineTo(x+s,y+s); ctx.moveTo(x+s,y-s); ctx.lineTo(x-s,y+s); ctx.stroke(); }
  ctx.fillStyle=col; ctx.font='11px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillText(`${lbl} = ${I} A`, x, y+r+18);
}

// freccia forza orizzontale con etichetta
function drawForceArrow(ctx, x, y, dir, lbl){
  const len=40, x2=x+dir*len;
  ctx.strokeStyle=T.force; ctx.fillStyle=T.force; ctx.lineWidth=2.5;
  ctx.beginPath(); ctx.moveTo(x+dir*14,y); ctx.lineTo(x2,y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x2,y); ctx.lineTo(x2-dir*8,y-5); ctx.lineTo(x2-dir*8,y+5); ctx.closePath(); ctx.fill();
  ctx.fillStyle=T.force; ctx.font='bold 11px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillText(lbl||'F', x+dir*28, y-9);
}

// ── Vista 3D ──────────────────────────────────────────────────────────────────
function rot(p, cosX,sinX,cosY,sinY){
  const x1=p[0]*cosY - p[2]*sinY, z1=p[0]*sinY + p[2]*cosY;
  const y1=p[1]*cosX - z1*sinX, z2=p[1]*sinX + z1*cosX;
  return [x1,y1,z2];
}
function draw3D(ctx,W,H){
  const cx=W/2, cy=H*0.52, S=Math.min(W,H)*0.018*zoom;
  const cosX=Math.cos(rotX),sinX=Math.sin(rotX),cosY=Math.cos(rotY),sinY=Math.sin(rotY);
  const proj=p=>{ const r=rot(p,cosX,sinX,cosY,sinY); return [cx+r[0]*S, cy-r[1]*S, r[2]]; };
  const Lh=14;   // semi-altezza fili (unità)
  // estremità fisse a ∓dist/2, centro incurvato a x1/x2
  const bow=u=>Math.sin(Math.PI*u);   // u∈[0,1]
  const xAt=(yy,xc,xr)=>{ const u=(yy+Lh)/(2*Lh); return xr + (xc-xr)*bow(u); };

  const wires=[
    { xc:x1, xr:-P.dist/2, I:P.I1, col:T.wire1, lbl:'I₁' },
    { xc:x2, xr:+P.dist/2, I:P.I2, col:T.wire2, lbl:'I₂' },
  ];

  // morsetti fissi alle estremità
  ctx.fillStyle=T.sub;
  for(const w of wires){
    for(const yy of [-Lh,Lh]){ const p=proj([w.xr,yy,0]); ctx.beginPath(); ctx.arc(p[0],p[1],4,0,Math.PI*2); ctx.fill(); }
  }

  // campo magnetico: anelli attorno a ciascun filo (seguono la curva)
  if(P.showB){
    ctx.strokeStyle=T.bfield; ctx.lineWidth=1;
    for(const w of wires){
      for(let yy=-Lh+4; yy<=Lh-4; yy+=7){
        const wx=xAt(yy,w.xc,w.xr), rad=4;
        ctx.beginPath();
        for(let a=0;a<=48;a++){
          const th=a/48*Math.PI*2;
          const p=proj([wx+Math.cos(th)*rad, yy, Math.sin(th)*rad]);
          a===0?ctx.moveTo(p[0],p[1]):ctx.lineTo(p[0],p[1]);
        }
        ctx.stroke();
      }
    }
  }

  // fili incurvati con frecce di corrente
  for(const w of wires){
    ctx.strokeStyle=w.col; ctx.lineWidth=3; ctx.beginPath();
    for(let i=0;i<=40;i++){ const yy=-Lh+2*Lh*i/40; const p=proj([xAt(yy,w.xc,w.xr),yy,0]); i===0?ctx.moveTo(p[0],p[1]):ctx.lineTo(p[0],p[1]); }
    ctx.stroke();
    // frecce di corrente che SCORRONO lungo il filo (animazione del flusso)
    const dir=w.I>=0?1:-1;
    const SP=5;                                  // spaziatura
    const phase=((t*6*dir)%SP+SP)%SP;            // offset animato
    ctx.fillStyle=w.col;
    for(let yy=-Lh+1+phase; yy<Lh-1; yy+=SP){
      const p0=proj([xAt(yy,w.xc,w.xr),yy,0]), p1=proj([xAt(yy+dir*2.0,w.xc,w.xr),yy+dir*2.0,0]);
      const ang=Math.atan2(p1[1]-p0[1],p1[0]-p0[0]);
      ctx.beginPath(); ctx.moveTo(p1[0],p1[1]);
      ctx.lineTo(p1[0]-7*Math.cos(ang-0.4),p1[1]-7*Math.sin(ang-0.4));
      ctx.lineTo(p1[0]-7*Math.cos(ang+0.4),p1[1]-7*Math.sin(ang+0.4));
      ctx.closePath(); ctx.fill();
    }
    const top=proj([w.xr,Lh+2,0]);
    ctx.fillStyle=w.col; ctx.font='11px "Space Mono",monospace'; ctx.textAlign='center';
    ctx.fillText(`${w.lbl}=${w.I}A`, top[0], top[1]);
  }

  // etichetta B vicino agli anelli di campo
  if(P.showB){
    const w=wires[0]; const pb=proj([w.xc+5, 0, 0]);
    ctx.fillStyle=T.bfield; ctx.font='italic bold 12px "Space Mono",monospace'; ctx.textAlign='center';
    ctx.fillText('B', pb[0], pb[1]);
  }

  // forza al centro (incurvamento massimo)
  if(P.showForce){
    const att=attracting();
    for(const w of wires){
      const dir=(w===wires[0]?(att?1:-1):(att?-1:1));
      const p0=proj([w.xc,0,0]), p1=proj([w.xc+dir*3,0,0]);
      ctx.strokeStyle=T.force; ctx.fillStyle=T.force; ctx.lineWidth=2.5;
      ctx.beginPath(); ctx.moveTo(p0[0],p0[1]); ctx.lineTo(p1[0],p1[1]); ctx.stroke();
      const ang=Math.atan2(p1[1]-p0[1],p1[0]-p0[0]);
      ctx.beginPath(); ctx.moveTo(p1[0],p1[1]);
      ctx.lineTo(p1[0]-8*Math.cos(ang-0.4),p1[1]-8*Math.sin(ang-0.4));
      ctx.lineTo(p1[0]-8*Math.cos(ang+0.4),p1[1]-8*Math.sin(ang+0.4));
      ctx.closePath(); ctx.fill();
      ctx.font='bold 11px "Space Mono",monospace'; ctx.textAlign='center';
      ctx.fillText(w===wires[0]?'F₁':'F₂', p1[0]+dir*8, p1[1]-6);
    }
  }

  ctx.textAlign='left'; ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace';
  ctx.fillText('trascina per ruotare · scroll per zoom', 14, H-16);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════

// 1: F/L in funzione della distanza, scala log-log fissa: la legge 1/d è una retta di pendenza −1
function drawFvsD(){
  const II=Math.abs(P.I1*P.I2);
  const g=Lab.panel(gCanvas[0],{ title:'F/L (N/m) in funzione della distanza', xr:[0.5,10], xLog:true, yr:[1e-6,1e-1], yLog:true, xLabel:'d (cm)', xFmt:v=>String(v), yFmt:v=>Lab.sci(v,1) });
  if(!g) return; const [ctx,f]=g;
  if(II>0){
    Lab.plot(ctx,f,d=>MU0*II/(2*Math.PI*d/100),[0.5,10],T.accent,2);
    Lab.dot(ctx,f,P.dist,Math.abs(forcePerLen()),T.force,4);
  }
  Lab.legend(ctx,f.L+8,f.T+8,[[T.accent,'μ₀I₁I₂/(2πd)']]);
}
// 2: F/L in funzione del prodotto delle correnti, alla distanza scelta
function drawFvsI(){
  const d=P.dist/100, Fm=Lab.niceMax(MU0*400/(2*Math.PI*d)*1e3);
  const g=Lab.panel(gCanvas[1],{ title:`F/L (mN/m) a d = ${Lab.fmt(P.dist,1)} cm`, xr:[0,400], yr:[0,Fm], xLabel:'|I₁·I₂| (A²)' });
  if(!g) return; const [ctx,f]=g;
  Lab.plot(ctx,f,II=>MU0*II/(2*Math.PI*d)*1e3,[0,400],T.accent,2);
  Lab.dot(ctx,f,Math.abs(P.I1*P.I2),Math.abs(forcePerLen())*1e3,T.force,4);
  Lab.legend(ctx,f.L+8,f.T+8,[[T.accent,'proporzionale a I₁·I₂']]);
}
// 3: campo del filo 1, B = μ₀I/(2πr), anch'esso in log-log
function drawBvsR(){
  const g=Lab.panel(gCanvas[2],{ title:'B (µT) attorno al filo 1', xr:[0.2,10], xLog:true, yr:[1,1e4], yLog:true, xLabel:'r (cm)', xFmt:v=>String(v), yFmt:v=>v>=1000?(v/1000)+'k':String(v) });
  if(!g) return; const [ctx,f]=g;
  if(P.I1!==0){
    Lab.plot(ctx,f,r=>MU0*Math.abs(P.I1)/(2*Math.PI*r/100)*1e6,[0.2,10],f.C.blue,2);
    // il filo 2 si trova a distanza d: lì il campo del filo 1 genera la forza
    Lab.dot(ctx,f,P.dist,MU0*Math.abs(P.I1)/(2*Math.PI*P.dist/100)*1e6,T.force,4);
  }
  Lab.legend(ctx,f.L+8,f.T+8,[[f.C.blue,'B = μ₀I₁/(2πr)'],[T.force,'sul filo 2']]);
}
function drawGraphs(){ drawFvsD(); drawFvsI(); drawBvsR(); }

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls(){
  const cont=document.getElementById('controls');
  cont.innerHTML='';

  const secC=Lab.Section('Correnti');
  cont.appendChild(secC.el);
  secC.add(Lab.Slider({ label:'I₁ (verso ±)', min:-20, max:20, step:1, value:P.I1, unit:' A', onChange(v){P.I1=v; resetWires();} }));
  secC.add(Lab.Slider({ label:'I₂ (verso ±)', min:-20, max:20, step:1, value:P.I2, unit:' A', onChange(v){P.I2=v; resetWires();} }));

  const secG=Lab.Section('Geometria');
  cont.appendChild(secG.el);
  secG.add(Lab.Slider({ label:'Distanza a riposo', min:2, max:9, step:0.5, value:P.dist, unit:' cm', onChange(v){P.dist=v; resetWires();} }));
  secG.add(Lab.Slider({ label:'Tensione fili', min:10, max:120, step:5, value:P.tension, unit:' N', onChange(v){P.tension=v; resetWires();} }));

  const secV=Lab.Section('Visualizzazione');
  cont.appendChild(secV.el);
  secV.add(Lab.RadioGroup({
    label:'Vista', options:[{value:'2d',label:'2D (sezione)'},{value:'3d',label:'3D'}],
    value:P.view, onChange(v){P.view=v;},
  }));
  secV.add(Lab.Toggle({ label:'Campo magnetico B', value:P.showB, onChange(v){P.showB=v;} }));
  secV.add(Lab.Toggle({ label:'Forza F', value:P.showForce, onChange(v){P.showForce=v;} }));
}

// ═══ Drag 3D ══════════════════════════════════════════════════════════════════
function initDrag(canvas){
  canvas.addEventListener('mousedown',e=>{ if(P.view==='3d'){dragging=true;lastX=e.clientX;lastY=e.clientY;canvas.style.cursor='grabbing';} });
  window.addEventListener('mousemove',e=>{ if(!dragging)return; rotY+=(e.clientX-lastX)*0.01; rotX+=(e.clientY-lastY)*0.01; rotX=Math.max(-1.5,Math.min(1.5,rotX)); lastX=e.clientX; lastY=e.clientY; });
  window.addEventListener('mouseup',()=>{ dragging=false; canvas.style.cursor='default'; });
  canvas.addEventListener('touchstart',e=>{ if(P.view==='3d'){dragging=true;lastX=e.touches[0].clientX;lastY=e.touches[0].clientY;} },{passive:true});
  canvas.addEventListener('touchmove',e=>{ if(!dragging)return; rotY+=(e.touches[0].clientX-lastX)*0.01; rotX+=(e.touches[0].clientY-lastY)*0.01; rotX=Math.max(-1.5,Math.min(1.5,rotX)); lastX=e.touches[0].clientX; lastY=e.touches[0].clientY; },{passive:true});
  canvas.addEventListener('touchend',()=>{ dragging=false; });
  canvas.addEventListener('wheel',e=>{ e.preventDefault(); zoom=Math.max(0.4,Math.min(3.5, zoom*(e.deltaY<0?1.12:0.89))); },{passive:false});
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
    {key:'force', label:'forza per metro F/L'},
    {key:'type',  label:'Interazione'},
    {key:'dist',  label:'Distanza'},
    {key:'hint',  label:'Vista'},
  ]);

  // il pulsante principale inverte il verso di I₂: si passa da attrazione a repulsione
  document.getElementById('btnView').addEventListener('click',()=>{ P.I2=-P.I2; resetWires(); buildControls(); });
  document.getElementById('btnReset').addEventListener('click',()=>{
    // mantiene la vista corrente, riavvia la simulazione
    P.I1=10; P.I2=10; P.dist=4; P.tension=50; P.showB=true; P.showForce=true;
    x1=-2; x2=2; v1=0; v2=0; zoom=1; buildControls();
  });

  initDrag(simCanvas);

  function resize(){
    const area=document.querySelector('.lab-canvas-area');
    if(!area)return;
    const ar=area.getBoundingClientRect();
    const rb=document.getElementById('readout').getBoundingClientRect();
    const ga=document.getElementById('graphArea');
    const gaH=ga?ga.offsetHeight:0;
    Lab.hidpi(simCanvas, Math.floor(ar.width), Math.max(140,Math.floor(ar.height-rb.height-gaH-4)));
    Lab.fitPanels(gCanvas);
  }
  resize();
  new ResizeObserver(resize).observe(document.querySelector('.lab-canvas-area'));

  let last=performance.now();
  function frame(now){
    const dt=Math.min((now-last)/1000,0.04); last=now; t+=dt;
    T=pal();
    physics(dt);
    draw(simCanvas);
    drawGraphs();
    const F=Math.abs(forcePerLen());
    readout.set('force', Lab.sci(F,3)+' N/m');
    readout.set('type', attracting()?'attrazione':'repulsione');
    readout.set('dist', Lab.fmt(P.dist,1)+' cm');
    readout.set('hint', P.view==='3d'?'3D (flessione amplificata)':'sezione trasversale');
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

window.addEventListener('DOMContentLoaded', init);
