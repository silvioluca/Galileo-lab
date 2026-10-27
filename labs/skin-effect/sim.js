'use strict';

// ═══ Stato ════════════════════════════════════════════════════════════════════
const MAT = {
  Cu:{name:'Rame',      sigma:5.96e7, mur:1},
  Al:{name:'Alluminio', sigma:3.50e7, mur:1},
  Ag:{name:'Argento',   sigma:6.30e7, mur:1},
  Au:{name:'Oro',       sigma:4.10e7, mur:1},
  Fe:{name:'Ferro',     sigma:1.00e7, mur:1000},   // ferromagnetico → δ piccolissima
};
const P = {
  fExp: 3,        // log10(frequenza) → f = 10^fExp Hz
  mat: 'Cu',
  R: 4,           // raggio del filo (mm)
  paused:false,
};
const MU0 = 4*Math.PI*1e-7;

let tAnim=0, last=0, acPhase=0;
let gTitle=[null,null,null];
let gCanvas=[null,null,null], gCtx=[null,null,null];
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
    skin:  [255,200,90],
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

// ═══ Fisica (effetto pelle) ═══════════════════════════════════════════════════
function freq(){ return Math.pow(10,P.fExp); }
function Rm(){ return P.R*1e-3; }                       // raggio (m)
function deltaOf(f,m){ return Math.sqrt(1/(Math.PI*f*MU0*m.mur*m.sigma)); }
function delta(){ return deltaOf(freq(),MAT[P.mat]); }  // profondità di penetrazione (m)
function dRatio(){ return clamp(delta()/Rm(), 1e-4, 50); }

// ── Soluzione esatta per il filo cilindrico ─────────────────────────────────
// Nel conduttore J soddisfa ∇²J = jωμσ·J: la soluzione regolare è J(r) ∝ J₀(k·r) con
// k = (1−j)/δ. Si usano le serie di Bessel finché |k·R| ≤ 20 (lì sono precise); oltre, lo strato
// è sottilissimo rispetto al raggio e vale lo sviluppo asintotico J ∝ √(R/r)·e^{−(R−r)/δ}.
const cmul=(a,b)=>[a[0]*b[0]-a[1]*b[1], a[0]*b[1]+a[1]*b[0]];
const cdiv=(a,b)=>{ const d=b[0]*b[0]+b[1]*b[1]; return [(a[0]*b[0]+a[1]*b[1])/d, (a[1]*b[0]-a[0]*b[1])/d]; };
function besselJ(n,z){            // J₀ o J₁ di argomento complesso, serie di potenze
  const z2=cmul(z,z), q=[-z2[0]/4,-z2[1]/4];
  let term = n===0 ? [1,0] : [z[0]/2,z[1]/2], sum=[...term];
  for(let m=1;m<80;m++){
    term=cmul(term,q); const d=m*(m+n); term=[term[0]/d,term[1]/d];
    sum=[sum[0]+term[0],sum[1]+term[1]];
    if(Math.hypot(...term)<1e-16*Math.hypot(...sum)) break;
  }
  return sum;
}
const SERIES_MAX=20;
// |J(r)|/|J(R)| con s = r/R
function Jprofile(s,dr){
  const x=1/dr;                                   // R/δ
  if(x<=SERIES_MAX){
    const k=[x,-x];                               // k·R = (1−j)·R/δ
    const a=besselJ(0,[k[0]*s,k[1]*s]), b=besselJ(0,k);
    return Math.hypot(...a)/Math.hypot(...b);
  }
  return Math.sqrt(1/Math.max(s,1e-3))*Math.exp(-(1-s)*x);
}
function Jn(s){ return Jprofile(s,dRatio()); }
// R_ac/R_dc = Re[ (kR/2)·J₀(kR)/J₁(kR) ];  per R ≫ δ tende a R/(2δ) + 1/4
function racRdc(dr){
  const x=1/dr;
  if(x>SERIES_MAX) return x/2+0.25;
  const k=[x,-x], r=cdiv(cmul([k[0]/2,k[1]/2],besselJ(0,k)),besselJ(1,k));
  return Math.max(1,r[0]);
}
function aEffRatio(){ return racRdc(dRatio()); }
function fmtF(f){ if(f<1e3) return Lab.fmt(f,0)+' Hz'; if(f<1e6) return Lab.fmt((f/1e3),1)+' kHz'; if(f<1e9) return Lab.fmt((f/1e6),2)+' MHz'; return Lab.fmt((f/1e9),2)+' GHz'; }
function fmtL(m){ if(m>=1e-3) return Lab.fmt((m*1e3),2)+' mm'; if(m>=1e-6) return Lab.fmt((m*1e6),1)+' µm'; return Lab.fmt((m*1e9),0)+' nm'; }
function jcol(t){ t=clamp(t,0,1);
  return [clamp(Math.round(38+t*255),0,255), clamp(Math.round(28+t*210),0,255), clamp(Math.round(55+(t>0.7?(t-0.7)*560:0)),0,255)]; }

// ═══ Rendering ════════════════════════════════════════════════════════════════
let G={};
function rScale(){ return clamp(0.32+0.68*(P.R-0.5)/9.5, 0.32, 1); }   // raggio ∝ slider
function geom(W,H){
  const s=rScale();
  const cx=W*0.21, cy=H*0.46, R=Math.min(H*0.30,W*0.15)*s;            // sezione (raggio ∝ R)
  const ax0=W*0.46, ax1=W*0.93, ay=H*0.46, rr=Math.min(H*0.24,W*0.085)*s, dpt=rr*0.42;  // cilindro 3D
  G={W,H,cx,cy,R,ax0,ax1,ay,rr,dpt};
}

function draw(canvas){
  const [ctx, W, H] = Lab.ctx2d(canvas);
  T=pal(); ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  drawGrid(ctx,W,H);
  geom(W,H);
  const dr=dRatio(), amp=0.55+0.45*Math.abs(Math.sin(acPhase)), into=Math.sin(acPhase)>=0;
  drawField3D(ctx,into);     // anelli di B dietro
  draw3D(ctx,dr,amp,into);
  drawCross(ctx,dr,amp,into);
  // intestazione
  ctx.textAlign='left'; ctx.fillStyle=T.accent; ctx.font='bold 14px "Space Mono",monospace';
  ctx.fillText('Effetto pelle:  δ = 1/√(π f μ σ)', 14, 24);
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace';
  const reg = dr>=1.2?'bassa frequenza: corrente quasi uniforme (DC-like)':(dr<0.15?'alta frequenza: corrente in un guscio sottile':'effetto pelle marcato');
  ctx.fillText(`${MAT[P.mat].name} · f = ${fmtF(freq())} · raggio ${P.R} mm · ${reg}`, 14, 40);
}

// ── sezione (cross-section) con campo B attorno ──
function drawCross(ctx,dr,amp,into){
  const {cx,cy,R}=G;
  // campo magnetico attorno al filo (cerchi concentrici, B∝1/r fuori)
  const bcol=[90,210,150];
  for(let i=1;i<=3;i++){ const rb=R*(1+0.32*i), al=0.5/i;
    ctx.strokeStyle=rgba(bcol,al); ctx.lineWidth=1.3; ctx.beginPath(); ctx.arc(cx,cy,rb,0,Math.PI*2); ctx.stroke();
    // freccia tangente (verso orario se corrente entrante)
    const a=-Math.PI/2; const tx=cx+Math.cos(a)*rb, ty=cy+Math.sin(a)*rb; const dir=into?1:-1;
    ctx.fillStyle=rgba(bcol,Math.min(0.9,al+0.3)); ctx.beginPath();
    ctx.moveTo(tx+dir*6,ty); ctx.lineTo(tx-dir*2,ty-4); ctx.lineTo(tx-dir*2,ty+4); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle=rgba(bcol,0.9); ctx.font='bold 10px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText('B', cx, cy-R*1.96-4);
  // sezione del filo colorata per densità di corrente
  const g=ctx.createRadialGradient(cx,cy,0,cx,cy,R);
  for(let i=0;i<=12;i++){ const s=i/12; g.addColorStop(s, rgb(jcol(Jn(s)*amp))); }
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=T.edge; ctx.lineWidth=2; ctx.stroke();
  // anello di δ
  if(dr<1){ const rs=R*(1-dr);
    ctx.strokeStyle=rgba([255,255,255],0.7); ctx.setLineDash([4,3]); ctx.lineWidth=1.4; ctx.beginPath(); ctx.arc(cx,cy,rs,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle=T.accent; ctx.lineWidth=1.6; ctx.beginPath(); ctx.moveTo(cx+R,cy); ctx.lineTo(cx+rs,cy); ctx.stroke();
    ctx.fillStyle=T.accent; ctx.font='bold 11px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText('δ', cx+(R+rs)/2, cy-6); }
  // simboli di corrente (⊗/⊙ alternati, densità ∝ J)
  ctx.strokeStyle=rgba([255,255,255],0.55); ctx.lineWidth=1;
  for(let k=0;k<60;k++){ const a=k*2.39996, r=R*Math.sqrt((k+0.5)/60), x=cx+Math.cos(a)*r, y=cy+Math.sin(a)*r;
    if(Jn(r/R)*amp<0.25) continue;
    if(into){ ctx.beginPath(); ctx.arc(x,y,2.4,0,Math.PI*2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x-1.7,y-1.7); ctx.lineTo(x+1.7,y+1.7); ctx.moveTo(x+1.7,y-1.7); ctx.lineTo(x-1.7,y+1.7); ctx.stroke(); }
    else { ctx.fillStyle=rgba([255,255,255],0.75); ctx.beginPath(); ctx.arc(x,y,2,0,Math.PI*2); ctx.fill(); }
  }
  ctx.fillStyle=T.sub; ctx.font='9px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText('sezione del filo', cx, cy+R+18);
}

// ── filo in 3D (cilindro): faccia tagliata con la distribuzione + superficie + correnti ──
function draw3D(ctx,dr,amp,into){
  const {ax0,ax1,ay,rr,dpt}=G;
  // corpo del cilindro (superficie laterale)
  const lg=ctx.createLinearGradient(0,ay-rr,0,ay+rr);
  lg.addColorStop(0, rgb(jcol(0.28*amp))); lg.addColorStop(0.42, rgb(jcol(0.92*amp)));
  lg.addColorStop(0.66, rgb(jcol(0.55*amp))); lg.addColorStop(1, rgb(jcol(0.22*amp)));
  ctx.fillStyle=lg; ctx.fillRect(ax0,ay-rr,ax1-ax0,2*rr);
  // tappo destro
  ctx.fillStyle=rgb(jcol(0.6*amp)); ctx.beginPath(); ctx.ellipse(ax1,ay,dpt,rr,0,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=T.edge; ctx.lineWidth=1.2; ctx.stroke();
  // contorni laterali
  ctx.strokeStyle=T.edge; ctx.lineWidth=1.4; ctx.beginPath(); ctx.moveTo(ax0,ay-rr); ctx.lineTo(ax1,ay-rr); ctx.moveTo(ax0,ay+rr); ctx.lineTo(ax1,ay+rr); ctx.stroke();
  // correnti che scorrono sulla SUPERFICIE (vicino ai bordi), animate col verso AC
  const dir=into?1:-1, span=ax1-ax0, ph=((acPhase*55)%span+span)%span;
  ctx.fillStyle=rgb(jcol(Math.min(1,amp+0.2)));
  for(let k=0;k<14;k++){ let x=ax0+((ph+k*span/14)%span); if(dir<0) x=ax1-(x-ax0);
    ctx.beginPath(); ctx.arc(x,ay-rr+4,2.2,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(x,ay+rr-4,2.2,0,Math.PI*2); ctx.fill(); }
  // faccia tagliata a sinistra: distribuzione radiale (guscio brillante, nucleo scuro)
  const rg=ctx.createRadialGradient(ax0,ay,0,ax0,ay,rr);
  for(let i=0;i<=12;i++){ const s=i/12; rg.addColorStop(s, rgb(jcol(Jn(s)*amp))); }
  ctx.fillStyle=rg; ctx.beginPath(); ctx.ellipse(ax0,ay,dpt,rr,0,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=T.edge; ctx.lineWidth=1.4; ctx.stroke();
  if(dr<1){ ctx.strokeStyle=rgba([255,255,255],0.6); ctx.setLineDash([3,3]); ctx.lineWidth=1.1;
    ctx.beginPath(); ctx.ellipse(ax0,ay,dpt*(1-dr),rr*(1-dr),0,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]); }
  ctx.fillStyle=T.sub; ctx.font='9px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText('filo 3D — corrente sulla superficie', (ax0+ax1)/2, ay+rr+16);
}

// ── campo magnetico azimutale attorno al cilindro 3D (anelli) ──
function drawField3D(ctx,into){
  const {ax0,ax1,ay,rr,dpt}=G; const bcol=[90,210,150], dir=into?1:-1;
  const n=4; for(let i=1;i<=n;i++){ const x=ax0+(ax1-ax0)*i/(n+0.5), Rx=dpt*1.9, Ry=rr*1.45;
    // metà posteriore (tratteggiata) e anteriore (piena)
    ctx.strokeStyle=rgba(bcol,0.35); ctx.setLineDash([3,3]); ctx.lineWidth=1.1;
    ctx.beginPath(); ctx.ellipse(x,ay,Rx,Ry,0,-Math.PI/2,Math.PI/2,true); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle=rgba(bcol,0.6); ctx.beginPath(); ctx.ellipse(x,ay,Rx,Ry,0,-Math.PI/2,Math.PI/2,false); ctx.stroke();
    // freccia di circolazione (in alto)
    ctx.fillStyle=rgba(bcol,0.8); ctx.beginPath(); ctx.moveTo(x+dir*5,ay-Ry); ctx.lineTo(x-dir*2,ay-Ry-4); ctx.lineTo(x-dir*2,ay-Ry+4); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle=rgba(bcol,0.9); ctx.font='bold 10px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText('B', ax0-4, ay-rr*1.5-6);
}
function roundRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function drawGrid(ctx,W,H){ ctx.strokeStyle=T.grid; ctx.lineWidth=1;
  for(let x=0;x<=W;x+=40){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for(let y=0;y<=H;y+=40){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); } }

// ═══ Grafici ══════════════════════════════════════════════════════════════════
function gBase(ctx,W,H,PAD){
  ctx.fillStyle=T.gBg; ctx.fillRect(0,0,W,H);
  const gW=W-PAD.l-PAD.r, gH=H-PAD.t-PAD.b;
  ctx.strokeStyle=T.gAxis; ctx.lineWidth=0.6;
  ctx.beginPath(); ctx.moveTo(PAD.l,PAD.t); ctx.lineTo(PAD.l,PAD.t+gH); ctx.lineTo(PAD.l+gW,PAD.t+gH); ctx.stroke();
  return {gW,gH};
}
function drawGraphs(){
  const m=MAT[P.mat], dr=dRatio(), C=Lab.graphColors();
  const fAx=[1,10**9.3], fFmt=v=>Lab.eng(v).replace(' ','');
  // 1: profilo J(r)/J(R) lungo il diametro
  let g=Lab.panel(gCanvas[0],{ title:'Densità di corrente J/J_superficie', xr:[-P.R,P.R], yr:[0,1.05], yStep:0.25, xLabel:'r (mm)', yFmt:v=>Lab.fmt(v,2) });
  if(g){ const [ctx,f]=g;
    ctx.save(); ctx.strokeStyle=C.text; ctx.setLineDash([3,3]);
    // profondità δ misurata dalla superficie
    const dmm=delta()*1e3;
    if(dmm<P.R) for(const sgn of [-1,1]){ const x=f.X(sgn*(P.R-dmm)); ctx.beginPath(); ctx.moveTo(x,f.T); ctx.lineTo(x,f.B); ctx.stroke(); }
    ctx.restore();
    Lab.plot(ctx,f,x=>Jprofile(Math.abs(x)/P.R,dr),[-P.R,P.R],rgb(T.skin),2,[],400);
    Lab.legend(ctx,f.L+8,f.T+8,[[rgb(T.skin),'J(r) esatta (Bessel)'],[C.text,'R − δ',[3,3]]]);
  }
  // 2: δ(f) in scala log-log, retta di pendenza −1/2
  g=Lab.panel(gCanvas[1],{ title:'Profondità di penetrazione δ', xr:fAx, xLog:true, yr:[1e-7,1], yLog:true, xLabel:'f (Hz)', xFmt:fFmt, yFmt:v=>Lab.eng(v,'m') });
  if(g){ const [ctx,f]=g;
    ctx.save(); ctx.strokeStyle=C.text; ctx.setLineDash([3,3]); ctx.beginPath(); ctx.moveTo(f.L,f.Y(Rm())); ctx.lineTo(f.R,f.Y(Rm())); ctx.stroke(); ctx.restore();
    const pts=[]; for(let e=0;e<=9.3;e+=0.1) pts.push([10**e,deltaOf(10**e,m)]);
    Lab.plotPts(ctx,f,pts,C.accent,2);
    Lab.dot(ctx,f,freq(),delta(),rgb(T.skin),4);
    Lab.legend(ctx,f.L+8,f.T+8,[[C.accent,'δ = 1/√(πfμσ)'],[C.text,'raggio R',[3,3]]]);
  }
  // 3: R_ac/R_dc(f): 1 finché δ ≫ R, poi cresce come R/2δ
  g=Lab.panel(gCanvas[2],{ title:'Resistenza in alternata R_ac/R_dc', xr:fAx, xLog:true, yr:[1,1e4], yLog:true, xLabel:'f (Hz)', xFmt:fFmt, yFmt:v=>Lab.eng(v).replace(' ','') });
  if(g){ const [ctx,f]=g;
    const pts=[]; for(let e=0;e<=9.3;e+=0.05){ const d=clamp(deltaOf(10**e,m)/Rm(),1e-4,50); pts.push([10**e,racRdc(d)]); }
    Lab.plotPts(ctx,f,pts,rgb(T.skin),2);
    Lab.dot(ctx,f,freq(),aEffRatio(),C.accent,4);
  }
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls(){
  const cont=document.getElementById('controls'); cont.innerHTML='';
  const secF=Lab.Section('Corrente alternata'); cont.appendChild(secF.el);
  secF.add(Lab.Slider({ label:'Frequenza f (scala logaritmica)', min:0, max:9.3, step:0.1, value:P.fExp, format:v=>fmtF(10**v), onChange(v){P.fExp=v;} }));
  const secM=Lab.Section('Conduttore'); cont.appendChild(secM.el);
  secM.add(Lab.RadioGroup({ label:'Materiale', options:Object.keys(MAT).map(k=>({value:k,label:MAT[k].name, hint:MAT[k].mur>1?('µr='+MAT[k].mur):''})), value:P.mat, onChange(v){P.mat=v;} }));
  secM.add(Lab.Slider({ label:'Raggio del filo', min:0.5, max:10, step:0.5, value:P.R, unit:' mm', onChange(v){P.R=v;} }));
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
  buildControls(); initGraphs();
  const simCanvas=document.getElementById('simCanvas');
  readout=new Lab.Readout(document.getElementById('readout'),[
    {key:'f',  label:'Frequenza'},
    {key:'d',  label:'Profondità δ'},
    {key:'dr', label:'δ / R'},
    {key:'rac',label:'R_ac / R_dc'},
    {key:'jc', label:'J centro / J sup.'},
    {key:'reg',label:'Regime'},
  ]);
  const btnPlay=document.getElementById('btnPlay');
  btnPlay.addEventListener('click',()=>{ P.paused=!P.paused; btnPlay.textContent=P.paused?'▶  AVVIA':'⏸  PAUSA'; });
  document.getElementById('btnReset').addEventListener('click',()=>{ P.fExp=3; P.mat='Cu'; P.R=4; P.paused=false; btnPlay.textContent='⏸  PAUSA'; buildControls(); });

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
    tAnim+=dt; if(!P.paused) acPhase+=dt*3.2;
    try{
      draw(simCanvas); drawGraphs();
      readout.set('f', fmtF(freq()));
      readout.set('d', fmtL(delta()));
      readout.set('dr', Lab.fmt(dRatio(),3));
      readout.set('rac', Lab.fmt(aEffRatio(),2)+'×');
      readout.set('jc', dRatio()>=8? '≈ 1 (uniforme)' : Lab.sci(Jn(0),2));
      readout.set('reg', dRatio()>=1.2?'quasi uniforme':(dRatio()<0.15?'forte effetto pelle':'effetto pelle'));
    }catch(err){ console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
