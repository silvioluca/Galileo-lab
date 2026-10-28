'use strict';

// ═══ Stato ════════════════════════════════════════════════════════════════════
const MATS = {
  metal:  {name:'Conduttore (metallo)', Eg:0.0},
  Ge:     {name:'Germanio',  Eg:0.67},
  Si:     {name:'Silicio',   Eg:1.12},
  GaAs:   {name:'Arseniuro di gallio', Eg:1.42},
  diamond:{name:'Diamante (isolante)', Eg:5.47},
};
const P = {
  mat:'Si', Eg:1.12,
  T: 300,           // temperatura (K)
  doping:'i',       // 'i' intrinseco | 'n' tipo n | 'p' tipo p
  paused:false,
};
const e0=1.602e-19, kB=1.381e-23;
const NCAP=20;

let tAnim=0, last=0, transTimer=0;
let electrons=[], pHoles=[];
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
    cond:  [95,170,255],          // banda di conduzione
    val:   [120,200,150],         // banda di valenza
    elec:  [90,170,255],
    hole:  [255,120,100],
    gap:   d?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.05)',
    fermi: [255,205,70],
    dop:   [200,140,255],
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
function classify(){ return P.Eg<0.1?'Conduttore':(P.Eg<3?'Semiconduttore':'Isolante'); }
function kT_eV(){ return 8.617e-5*P.T; }
// frazione di elettroni eccitati ∝ exp(−Eg/2kT) (fisica reale)
function excFrac(){ return Math.exp(-P.Eg/(2*kT_eV())); }
// indice di conduzione per la VISUALIZZAZIONE (amplificato per essere visibile)
function condIndex(){ return clamp(Math.exp(-P.Eg/(0.42*P.T/300)),0,1); }
function niRel(){ return Math.pow(P.T,1.5)*excFrac(); }   // concentrazione intrinseca (u.a.)
function sigmaOf(Tk,Eg){ if(Eg<0.1) return 6e7*(300/Tk); return 481*Math.pow(Tk,1.5)*Math.exp(-Eg/(2*8.617e-5*Tk)); }

// ═══ Geometria ════════════════════════════════════════════════════════════════
let G={};
function geomBands(W,H){
  const bx0=W*0.07, bx1=W*0.90;
  const cTop=H*0.12, bandH=H*0.075, cBot=cTop+bandH;          // banda di conduzione (in alto)
  const barrierTop=cBot;                                       // massimi del potenziale TANGENTI al fondo della conduzione
  const gap=clamp(P.Eg*12,2,H*0.20);   // metalli: gap ~0 → bande quasi a contatto
  const vTop=cBot+gap, vBot=vTop+bandH;                        // banda di valenza SOTTO i massimi
  const wellBot=H*0.93, nIon=5;                                // gole profonde (nuclei in fondo)
  G={W,H,bx0,bx1,cTop,cBot,vTop,vBot,bandH,barrierTop,wellBot,nIon,
     yCon:(cTop+cBot)/2, per:(bx1-bx0)/nIon, nr:clamp((bx1-bx0)/nIon*0.07,6,10)};
}
function ionsX(){ const a=[]; for(let k=0;k<G.nIon;k++) a.push(G.bx0+G.per*(k+0.5)); return a; }
function rawV(x,ions){ let r=0; for(const xn of ions) r+=1/Math.sqrt(((x-xn)/G.per)*((x-xn)/G.per)+0.0016); return r; }  // imbuti stretti e profondi
function Vy(x,ions,rmin,rmax){ const f=clamp((rawV(x,ions)-rmin)/(rmax-rmin),0,1); return G.barrierTop+(G.wellBot-G.barrierTop)*f; }
function vtip(ctx,x,y,dir){ ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x-4,y+dir*6); ctx.lineTo(x+4,y+dir*6); ctx.closePath(); ctx.fill(); }
function drawNucleus(ctx,cx,cy,r){
  for(let i=0;i<13;i++){ const a=i*2.39996, rr=r*0.62*Math.sqrt(i/13), x=cx+Math.cos(a)*rr, y=cy+Math.sin(a)*rr;
    ctx.fillStyle=(i%2)?'rgb(70,110,220)':'rgb(220,60,60)'; ctx.beginPath(); ctx.arc(x,y,r*0.33,0,Math.PI*2); ctx.fill(); } }

// ═══ Animazione ═══════════════════════════════════════════════════════════════
function initSim(){
  electrons=[]; const perAtom=7;
  // depth: posizione energetica relativa alla banda — 0=cima valenza, 1=fondo valenza, >1=sotto la banda (più in profondità)
  for(let a=0;a<5;a++) for(let j=0;j<perAtom;j++) electrons.push({atom:a, depth:Math.random()*1.7, level:0, x:0, y:0, vx:(Math.random()-0.5)*1.4});
  pHoles=[]; transTimer=0;
}
function nearestAtom(x,ions){ let bi=0,bd=1e9; for(let i=0;i<ions.length;i++){ const d=Math.abs(x-ions[i]); if(d<bd){bd=d;bi=i;} } return bi; }
function demoteE(e,ions){ e.level=0; e.atom=nearestAtom(e.x,ions); e.depth=Math.random()*1.7; e.vx=(Math.random()-0.5)*1.4; }  // ricadrà animato verso la buca
function targetCond(){
  let b=condIndex()*electrons.length*0.6;
  if(P.doping==='n' && classify()==='Semiconduttore') b+=3;
  return Math.round(clamp(b,0,electrons.length*0.7));
}
function step(dt){
  if(P.paused) return;
  if(G.W) geomBands(G.W,G.H);
  if(!electrons.length){ initSim(); }
  const dtf=Math.min(dt,0.05)*60, ions=ionsX();
  const rmax=rawV(ions[2],ions), rmin=rawV((ions[0]+ions[1])/2,ions);
  const target=targetCond();
  let promoted=0; for(const e of electrons) if(e.level) promoted++;
  transTimer-=dtf;
  const fastT = classify()==='Conduttore'?2:4;   // scambio più frequente nei metalli
  if(transTimer<=0){ transTimer=fastT+Math.random()*3;
    const cV=electrons.filter(e=>!e.level), cC=electrons.filter(e=>e.level);
    if(promoted<target && cV.length){ const e=cV[(Math.random()*cV.length)|0]; e.level=1; e.vx=(Math.random()-0.5)*2; }
    else if(promoted>target && cC.length){ demoteE(cC[(Math.random()*cC.length)|0], ions); }
    else if(target>0 && cC.length && cV.length && Math.random()<0.75){   // equilibrio: scambio continuo (salita + ricaduta)
      demoteE(cC[(Math.random()*cC.length)|0], ions);
      const e2=cV[(Math.random()*cV.length)|0]; e2.level=1; e2.vx=(Math.random()-0.5)*2;
    }
  }
  const sp=0.7+P.T/600;
  for(const e of electrons){
    if(e.level){
      // conduzione: LIBERO, deriva orizzontale sopra i massimi (banda tangente alle barriere)
      if(e.x===0) e.x=G.bx0+10+Math.random()*(G.bx1-G.bx0-20);
      const ty=G.yCon+Math.sin(tAnim*1.6+e.x*0.01)*G.bandH*0.30;
      e.y+=(ty-e.y)*clamp(0.16*dtf,0,1);
      e.x += e.vx*1.7*dtf;
      if(e.x<G.bx0+8){ e.x=G.bx0+8; e.vx=Math.abs(e.vx); } if(e.x>G.bx1-8){ e.x=G.bx1-8; e.vx=-Math.abs(e.vx); }
    } else {
      // valenza/sotto-banda: confinato nella buca; energia RELATIVA alla banda
      const cx=ions[e.atom];
      if(e.x===0){ e.x=cx; e.y=G.vTop+e.depth*G.bandH; }
      const yE=G.vTop + e.depth*G.bandH;
      if(e.y < yE-6){
        // RICADUTA visibile dalla conduzione: scende verso la buca e converge sull'atomo
        e.y += (yE-e.y)*clamp(0.10*dtf,0,1);
        e.x += (cx-e.x)*clamp(0.08*dtf,0,1);
      } else {
        e.y += (yE-e.y)*clamp(0.25*dtf,0,1);
        const nx=e.x+e.vx*sp*dtf, v=Vy(nx,ions,rmin,rmax);
        if(v<=yE) e.vx=-e.vx; else e.x=nx;   // riflette sulle pareti → resta nella buca
      }
    }
  }
  // drogaggio p: posti vacanti nella buca
  const wantP=(P.doping==='p' && classify()==='Semiconduttore')?3:0;
  while(pHoles.length<wantP) pHoles.push({atom:(Math.random()*5)|0, yE:G.vTop+G.bandH*0.5});
  while(pHoles.length>wantP) pHoles.pop();
}

// ═══ Rendering ════════════════════════════════════════════════════════════════
function draw(canvas){
  const [ctx, W, H] = Lab.ctx2d(canvas);
  T=pal();
  ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  geomBands(W,H);
  drawCrystal(ctx);
  // intestazione
  ctx.textAlign='left'; ctx.fillStyle=T.accent; ctx.font='bold 14px "Space Mono",monospace';
  ctx.fillText('Modello a bande nel reticolo cristallino', 14, 24);
  // badge classificazione (in alto a destra)
  const cls=classify();
  ctx.textAlign='right'; ctx.font='bold 12px "Space Mono",monospace';
  ctx.fillStyle=cls==='Conduttore'?'rgb(95,225,140)':cls==='Semiconduttore'?'rgb(255,205,70)':'rgb(255,120,100)';
  ctx.fillText(cls.toUpperCase(), W-14, 22);
  ctx.fillStyle=T.sub; ctx.font='9px "Space Mono",monospace';
  ctx.fillText('E_g='+Lab.fmt(P.Eg,2)+' eV · T='+P.T+' K · σ='+Lab.sci(sigmaOf(P.T,P.Eg),2)+' S/m', W-14, 36);
}

function drawCrystal(ctx){
  const x0=G.bx0,x1=G.bx1,w=x1-x0, ions=ionsX();
  const rmax=rawV(ions[2],ions), rmin=rawV((ions[0]+ions[1])/2,ions);
  const curve=dk()?'rgba(232,238,248,0.92)':'rgba(20,30,50,0.88)';
  const fill=dk()?'rgba(150,160,175,0.12)':'rgba(120,130,145,0.20)';
  // riempimento grigio sotto il potenziale
  ctx.beginPath(); ctx.moveTo(x0,Vy(x0,ions,rmin,rmax));
  for(let i=1;i<=360;i++){ const x=x0+w*i/360; ctx.lineTo(x,Vy(x,ions,rmin,rmax)); }
  ctx.lineTo(x1,G.wellBot+60); ctx.lineTo(x0,G.wellBot+60); ctx.closePath(); ctx.fillStyle=fill; ctx.fill();
  // strisce delle bande
  ctx.fillStyle=rgba([95,150,255],0.28); ctx.fillRect(x0,G.cTop,w,G.bandH);    // conduzione (blu)
  ctx.fillStyle=rgba([232,140,140],0.32); ctx.fillRect(x0,G.vTop,w,G.bandH);   // valenza (rossa)
  // curva del potenziale periodico (sopra le strisce)
  ctx.strokeStyle=curve; ctx.lineWidth=2; ctx.beginPath();
  for(let i=0;i<=360;i++){ const x=x0+w*i/360, y=Vy(x,ions,rmin,rmax); i?ctx.lineTo(x,y):ctx.moveTo(x,y); }
  ctx.stroke();
  // etichette bande
  ctx.font='8px "Space Mono",monospace'; ctx.textAlign='left';
  ctx.fillStyle='rgba(120,170,255,0.95)'; ctx.fillText('BANDA DI CONDUZIONE — elettroni liberi', x0+4, G.cTop-3);
  ctx.fillStyle='rgba(232,140,140,0.98)'; ctx.fillText('BANDA DI VALENZA — elettroni confinati nelle buche di potenziale', x0+4, G.vBot+11);
  // E_g
  if(P.Eg>=0.1){ const gx=x1+14; ctx.strokeStyle=rgba([180,190,210],0.85); ctx.fillStyle=rgba([180,190,210],0.9); ctx.lineWidth=1.4;
    ctx.beginPath(); ctx.moveTo(gx,G.cBot); ctx.lineTo(gx,G.vTop); ctx.stroke(); vtip(ctx,gx,G.cBot,-1); vtip(ctx,gx,G.vTop,1);
    ctx.fillStyle=T.txt; ctx.font='bold 9px "Space Mono",monospace'; ctx.fillText('E_g', gx+6,(G.cBot+G.vTop)/2+3);
  } else { ctx.fillStyle='rgba(120,170,255,0.9)'; ctx.font='9px "Space Mono",monospace'; ctx.fillText('sovrapposte', x1+8, G.midGapY); }
  // livelli di drogaggio
  if(classify()==='Semiconduttore'){
    if(P.doping==='n') dashLevel(ctx, G.cBot+(G.vTop-G.cBot)*0.22, 'donatori');
    if(P.doping==='p') dashLevel(ctx, G.vTop-(G.vTop-G.cBot)*0.22, 'accettori');
  }
  // nuclei in FONDO agli imbuti (profondi, lontani dalle bande)
  for(const xn of ions) drawNucleus(ctx,xn,G.wellBot-G.nr,G.nr);
  // lacune (drogaggio p): posti vacanti nella buca
  ctx.strokeStyle='rgb(232,120,120)'; ctx.lineWidth=1.6;
  for(const h of pHoles){ const cx=ions[h.atom]; ctx.beginPath(); ctx.arc(cx, h.yE||(G.vTop+G.bandH*0.5),3.4,0,Math.PI*2); ctx.stroke(); }
  // elettroni: valenza (viola, mobili tra le buche) e conduzione (blu, liberi)
  for(const e of electrons){ ctx.fillStyle = e.level? 'rgb(70,120,250)' : 'rgb(140,90,200)';
    ctx.beginPath(); ctx.arc(e.x,e.y,3.6,0,Math.PI*2); ctx.fill(); }
}
function dashLevel(ctx,y,label){
  ctx.strokeStyle='rgba(200,140,255,0.85)'; ctx.lineWidth=1.2; ctx.setLineDash([3,3]);
  ctx.beginPath(); ctx.moveTo(G.bx0+8,y); ctx.lineTo(G.bx1-8,y); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle='rgb(200,140,255)'; ctx.font='7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillText(label,G.bx0+10,y-2);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
// livello di Fermi: a metà gap nel semiconduttore puro; il drogaggio lo avvicina alla banda di conduzione (n) o di valenza (p)
function fermiLevel() {
  if (classify() !== 'Semiconduttore' || P.doping === 'i') return P.Eg / 2;
  return P.doping === 'n' ? Math.max(P.Eg / 2, P.Eg - 0.2) : Math.min(P.Eg / 2, 0.2);
}
function drawGraphs(){
  // 1: conducibilità intrinseca in funzione della temperatura (scala logaritmica), con i riferimenti
  //    di metallo (gap nullo), silicio (1,12 eV) e diamante (5,47 eV)
  let g=Lab.panel(gCanvas[0],{ title:'Conducibilità σ (S/m) in funzione di T', xr:[50,600], xStep:100, yr:[1e-6,1e8], yLog:true, xLabel:'temperatura T (K)' });
  if(g){ const [ctx,f]=g;
    for(const eg of [0,1.12,5.47]) Lab.plot(ctx,f,t=>Math.max(1e-7,sigmaOf(t,eg)),[60,600],f.C.text,1,[3,3]);
    Lab.plot(ctx,f,t=>Math.max(1e-7,sigmaOf(t,P.Eg)),[60,600],T.accent,2);
    Lab.dot(ctx,f,P.T,sigmaOf(P.T,P.Eg),rgb(T.fermi),4.5);
    Lab.legend(ctx,f.L+8,f.B-10,[[T.accent,'materiale scelto'],[f.C.text,'metallo, Si, diamante',[3,3]]]); }
  // 2: distribuzione di Fermi–Dirac f(E): probabilità che uno stato di energia E sia occupato
  const Emin=-1.2, Emax=Math.max(2,P.Eg+1.2), Ef=fermiLevel(), kT=kT_eV();
  g=Lab.panel(gCanvas[1],{ title:`Occupazione f(E) di Fermi–Dirac a ${Lab.fmt(P.T,0)} K`, xr:[Emin,Emax], yr:[0,1], yStep:0.25, xLabel:'energia E (eV, 0 = cima della valenza)' });
  if(g){ const [ctx,f]=g;
    ctx.fillStyle=rgba(T.val,0.18); ctx.fillRect(f.L,f.T,f.X(0)-f.L,f.B-f.T);
    ctx.fillStyle=rgba(T.cond,0.16); ctx.fillRect(f.X(P.Eg),f.T,f.R-f.X(P.Eg),f.B-f.T);
    ctx.save(); ctx.setLineDash([3,3]); ctx.strokeStyle=rgb(T.fermi); ctx.beginPath(); ctx.moveTo(f.X(Ef),f.T); ctx.lineTo(f.X(Ef),f.B); ctx.stroke(); ctx.restore();
    Lab.plot(ctx,f,E=>1/(1+Math.exp((E-Ef)/kT)),[Emin,Emax],T.accent,2,[],400);
    ctx.font='9.5px "DM Sans",sans-serif'; ctx.textBaseline='middle'; ctx.textAlign='center';
    ctx.fillStyle=rgb(T.val); ctx.fillText('valenza',(f.L+f.X(0))/2,f.T+8);
    ctx.fillStyle=rgb(T.cond); ctx.fillText('conduzione',(f.X(P.Eg)+f.R)/2,f.T+8);
    ctx.fillStyle=rgb(T.fermi); ctx.fillText('E_F',f.X(Ef),f.B-8); }
  // 3: grafico di Arrhenius: ln σ in funzione di 1/T è una retta di pendenza −E_g/(2k)
  g=Lab.panel(gCanvas[2],{ title:'Grafico di Arrhenius: ln σ in funzione di 1000/T', xr:[1000/600,10], xStep:2, yr:(()=>{ const a=Math.log(sigmaOf(600,P.Eg)), b=Math.log(sigmaOf(100,P.Eg)); const lo=Math.min(a,b), hi=Math.max(a,b), st=Lab.niceStep(Math.max(hi-lo,2)); return [Math.floor(lo/st)*st, Math.ceil(hi/st)*st]; })(), xLabel:'1000 / T (K⁻¹)' });
  if(g){ const [ctx,f]=g;
    Lab.plot(ctx,f,x=>Math.log(sigmaOf(1000/x,P.Eg)),[1000/600,10],T.accent,2);
    Lab.dot(ctx,f,1000/P.T,Math.log(sigmaOf(P.T,P.Eg)),rgb(T.fermi),4.5); }
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
function reControls(){ setTimeout(buildControls,0); }
function buildControls(){
  const cont=document.getElementById('controls'); cont.innerHTML='';
  const secM=Lab.Section('Materiale'); cont.appendChild(secM.el);
  secM.add(Lab.RadioGroup({ label:'Preset', options:Object.keys(MATS).map(k=>({value:k,label:MATS[k].name,hint:Lab.fmt(MATS[k].Eg,2)+' eV'})),
    value:P.mat, onChange(v){ P.mat=v; P.Eg=MATS[v].Eg; reControls(); } }));
  secM.add(Lab.Slider({ label:'Gap E_g', min:0, max:6, step:0.05, value:P.Eg, unit:' eV', onChange(v){ P.Eg=v; P.mat='custom'; } }));
  const secT=Lab.Section('Condizioni'); cont.appendChild(secT.el);
  secT.add(Lab.Slider({ label:'Temperatura T', min:50, max:600, step:10, value:P.T, unit:' K', onChange(v){P.T=v;} }));
  const secD=Lab.Section('Drogaggio (semiconduttore)'); cont.appendChild(secD.el);
  secD.add(Lab.RadioGroup({ label:'Tipo', options:[{value:'i',label:'Intrinseco'},{value:'n',label:'Tipo n (donatori)'},{value:'p',label:'Tipo p (accettori)'}],
    value:P.doping, onChange(v){ P.doping=v; } }));
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
  buildControls(); initGraphs(); initSim();
  const simCanvas=document.getElementById('simCanvas');
  readout=new Lab.Readout(document.getElementById('readout'),[
    {key:'cls', label:'classificazione'},
    {key:'eg',  label:'gap E_g'},
    {key:'t',   label:'temperatura'},
    {key:'exc', label:'frazione eccitata e^(−E_g/2kT)'},
    {key:'ni',  label:'portatori intrinseci (relativi)'},
    {key:'sig', label:'conducibilità σ'},
  ]);
  const btnHeat=document.getElementById('btnHeat');
  btnHeat.addEventListener('click',()=>{ P.T=clamp(P.T+100,50,600); buildControls(); });
  document.getElementById('btnReset').addEventListener('click',()=>{
    P.mat='Si'; P.Eg=1.12; P.T=300; P.doping='i'; P.paused=false; buildControls(); initSim();
  });

  function resize(){
    const area=document.querySelector('.lab-canvas-area'); if(!area)return;
    const ar=area.getBoundingClientRect();
    const rb=document.getElementById('readout').getBoundingClientRect();
    const ga=document.getElementById('graphArea'); const gaH=ga?ga.offsetHeight:0;
    const h=Math.max(220,Math.floor(ar.height-rb.height-gaH-4));
    Lab.hidpi(simCanvas, Math.floor(ar.width), h);
    geomBands(simCanvas.width/(simCanvas._dpr||1),simCanvas.height/(simCanvas._dpr||1));
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
      readout.set('cls', classify());
      readout.set('eg', Lab.fmt(P.Eg,2)+' eV');
      readout.set('t', Lab.fmt(P.T,0)+' K');
      readout.set('exc', excFrac()<1e-3? Lab.sci(excFrac(),2) : Lab.fmt(excFrac(),3));
      readout.set('ni', Lab.sci(niRel(),2));
      readout.set('sig', Lab.sci(sigmaOf(P.T,P.Eg),2)+' S/m');
    }catch(err){ console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
