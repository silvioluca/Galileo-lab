'use strict';

// ═══ Costanti fisiche ═════════════════════════════════════════════════════════
const RH = 1.0967758e7;     // costante di Rydberg (m⁻¹)
const E1 = -13.605;         // energia stato fondamentale (eV)
const eV_to_J = 1.602e-19;  // 1 eV in J

// Serie spettrali dell'idrogeno
const SERIES = [
  { name:'Lyman',    nf:1, color:'#3a5fff', region:'UV'  },
  { name:'Balmer',   nf:2, color:'#ff3a3a', region:'Vis' },
  { name:'Paschen',  nf:3, color:'#1faf3f', region:'IR'  },
  { name:'Brackett', nf:4, color:'#d98a00', region:'IR'  },
  { name:'Pfund',    nf:5, color:'#c742c7', region:'IR'  },
];

const VIS_MIN=380, VIS_MAX=750;

// ═══ Stato ════════════════════════════════════════════════════════════════════
const P = {
  niMax:      7,        // n massimo delle transizioni
  showUV:     true,
  showVis:    true,
  showIR:     true,
  formulas:   true,
  energyUnit: 'eV',     // 'eV' | 'J'
  view:       'levels', // 'levels' | 'orbits'
};
let gCanvas=[null,null], gCtx=[null,null];
let readout;

// ═══ Palette theme-aware ══════════════════════════════════════════════════════
function dk(){ return document.documentElement.dataset.theme !== 'light'; }
function pal(){
  const d=dk();
  return {
    bg:    d?'#06090f':'#eef2f7',
    txt:   d?'rgba(215,235,250,0.95)':'rgba(20,45,75,0.95)',
    sub:   d?'rgba(165,195,220,0.8)':'rgba(60,95,130,0.88)',
    accent:d?'#00d4ff':'#0a78b0',
    level: d?'rgba(170,195,220,0.55)':'rgba(50,85,120,0.6)',
    tick:  d?'rgba(150,180,210,0.7)':'rgba(50,85,120,0.85)',
    gBg:   d?'rgb(3,9,22)':'#eef2f7',
    gAxis: d?'rgba(100,155,210,0.26)':'rgba(40,80,130,0.30)',
    gText: d?'rgba(150,205,225,0.88)':'rgba(25,65,105,0.92)',
    box:   d?'rgba(10,16,28,0.55)':'rgba(244,248,252,0.82)',
  };
}
let T=pal();

// ═══ Fisica ═══════════════════════════════════════════════════════════════════
function En(n){ return E1/(n*n); }                       // energia livello (eV)
function lambdaNm(nf,ni){ return 1e9/(RH*(1/(nf*nf)-1/(ni*ni))); }
function regionOf(l){ return l<VIS_MIN?'UV':l>VIS_MAX?'IR':'Vis'; }
function regionOn(reg){ return reg==='UV'?P.showUV:reg==='IR'?P.showIR:P.showVis; }

function nmToRgb(l){
  let r=0,g=0,b=0;
  if(l<380){r=.2;g=0;b=.3;} else if(l<440){r=-(l-440)/60;b=1;}
  else if(l<490){g=(l-440)/50;b=1;} else if(l<510){g=1;b=-(l-510)/20;}
  else if(l<580){r=(l-510)/70;g=1;} else if(l<645){r=1;g=-(l-645)/65;}
  else if(l<=780){r=1;} else {r=.35;}
  let f=1; if(l<420)f=.3+.7*(l-380)/40; else if(l>700)f=.3+.7*(780-l)/80;
  const q=x=>Math.round(255*Math.pow(Math.max(0,Math.min(1,x))*f,.8));
  return [q(r),q(g),q(b)];
}
function lineColor(l){ return l<VIS_MIN?[150,120,235]:l>VIS_MAX?[225,90,70]:nmToRgb(l); }

// tutte le transizioni abilitate (per regione)
function activeTransitions(){
  const out=[];
  for(const s of SERIES){
    for(let ni=s.nf+1; ni<=P.niMax; ni++){
      const l=lambdaNm(s.nf,ni);
      const reg=regionOf(l);
      if(regionOn(reg)) out.push({s,ni,l,reg,E:En(s.nf)-En(ni)});
    }
  }
  return out;
}

// ═══ Diagramma principale ═════════════════════════════════════════════════════
function draw(canvas){
  const [ctx,W,H]=Lab.ctx2d(canvas);
  ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);

  if(P.view==='orbits'){ drawOrbits(ctx,W,H); if(P.formulas) drawFormulas(ctx,W,H); return; }

  const padL=120, padR=120, padT=40, padB=24;
  const plotW=W-padL-padR, plotH=H-padT-padB;
  const Emin=En(1), Emax=0;
  const yOf=E=>padT + (Emax-E)/(Emax-Emin)*plotH;

  // ── livelli energetici ──
  ctx.font='10px "Space Mono",monospace';
  // i livelli alti si addensano verso E = 0: si etichettano solo quelli distanti almeno 12 px
  let lastLabY=Infinity;
  for(let n=1;n<=P.niMax;n++){
    const y=yOf(En(n));
    ctx.strokeStyle=T.level; ctx.lineWidth = n===1?1.3:0.8;
    ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(W-padR,y); ctx.stroke();
    if(lastLabY-y<12 || y-yOf(0)<12) continue;
    lastLabY=y;
    ctx.fillStyle=T.sub; ctx.textAlign='right';
    ctx.fillText(`n=${n}`, padL-8, y+3);
    // energia a destra
    ctx.textAlign='left';
    const val = P.energyUnit==='eV' ? Lab.fmt(En(n),2)+' eV'
                                    : Lab.fmt(En(n)*eV_to_J*1e19,2)+'·10⁻¹⁹ J';
    ctx.fillStyle=T.tick; ctx.fillText(val, W-padR+8, y+3);
  }
  // continuo n=∞ (E=0)
  ctx.strokeStyle=T.tick; ctx.lineWidth=1; ctx.setLineDash([4,3]);
  ctx.beginPath(); ctx.moveTo(padL,yOf(0)); ctx.lineTo(W-padR,yOf(0)); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle=T.sub; ctx.textAlign='right'; ctx.fillText('n=∞', padL-8, yOf(0)+3);
  ctx.textAlign='left'; ctx.fillStyle=T.tick;
  ctx.fillText(P.energyUnit==='eV'?'0,00 eV':'0 J', W-padR+8, yOf(0)+3);
  ctx.textAlign='left';

  // ── colonne delle serie ──
  const nVisSeries=SERIES.length;
  const colW=plotW/nVisSeries;
  SERIES.forEach((s,si)=>{
    const cx0=padL+si*colW;
    // titolo serie
    ctx.fillStyle=s.color; ctx.font='bold 10px "Space Mono",monospace'; ctx.textAlign='center';
    ctx.fillText(s.name, cx0+colW/2, padT-22);
    ctx.fillStyle=T.sub; ctx.font='8px "Space Mono",monospace';
    ctx.fillText(`→ n=${s.nf} (${s.region})`, cx0+colW/2, padT-12);

    // transizioni ni → nf
    const trans=[];
    for(let ni=s.nf+1; ni<=P.niMax; ni++){
      const l=lambdaNm(s.nf,ni);
      if(regionOn(regionOf(l))) trans.push({ni,l});
    }
    const yEnd=yOf(En(s.nf));
    trans.forEach((tr,ti)=>{
      const x=cx0+colW*(0.18+(trans.length>1?0.64*ti/(trans.length-1):0.32));
      const yStart=yOf(En(tr.ni));
      ctx.strokeStyle=s.color; ctx.lineWidth=1.6; ctx.globalAlpha=0.9;
      ctx.beginPath(); ctx.moveTo(x,yStart); ctx.lineTo(x,yEnd); ctx.stroke();
      // freccia
      ctx.fillStyle=s.color;
      ctx.beginPath(); ctx.moveTo(x,yEnd); ctx.lineTo(x-3,yEnd-6); ctx.lineTo(x+3,yEnd-6); ctx.closePath(); ctx.fill();
      ctx.globalAlpha=1;
    });
  });
  ctx.textAlign='left';

  // ── formule: nello spazio libero fra n = 2 e n = 1, a destra delle frecce di Lyman ──
  if(P.formulas) drawFormulas(ctx,W,H, padL+colW*1.15, (yOf(En(2))+yOf(En(1)))/2-40);
}

// ═══ Vista "orbite" (modello di Bohr) ════════════════════════════════════════
function drawOrbits(ctx,W,H){
  const cx=W*0.40, cy=H*0.52;
  const nMax=Math.min(P.niMax,6);
  const maxR=Math.min(W*0.40, H*0.46);
  const rOf=n=>n/nMax*maxR;

  // orbite concentriche
  ctx.strokeStyle=T.level; ctx.lineWidth=0.8;
  for(let n=1;n<=nMax;n++){
    ctx.beginPath(); ctx.arc(cx,cy,rOf(n),0,Math.PI*2); ctx.stroke();
    ctx.fillStyle=T.sub; ctx.font='9px "Space Mono",monospace'; ctx.textAlign='center';
    ctx.fillText(`n=${n}`, cx, cy+rOf(n)-5);
  }
  // nucleo
  ctx.fillStyle='#ff5040'; ctx.beginPath(); ctx.arc(cx,cy,3,0,Math.PI*2); ctx.fill();

  // ventagli di transizioni per serie (angoli in gradi, lato destro)
  const FANS = {
    Lyman:    [-58,-12],
    Balmer:   [-6, 18],
    Paschen:  [24, 50],
    Brackett: [54, 70],
    Pfund:    [74, 86],
  };
  ctx.textAlign='left';
  for(const s of SERIES){
    if(!regionOn(s.region)) continue;
    if(s.nf>nMax) continue;
    const fan=FANS[s.name]; if(!fan) continue;
    const trans=[];
    for(let ni=s.nf+1; ni<=nMax; ni++){
      const l=lambdaNm(s.nf,ni);
      if(regionOn(regionOf(l))) trans.push({ni,l});
    }
    trans.forEach((tr,ti)=>{
      const a=(fan[0]+(trans.length>1?(fan[1]-fan[0])*ti/(trans.length-1):0.5*(fan[1]-fan[0])))*Math.PI/180;
      const r0=rOf(s.nf), r1=rOf(tr.ni);
      const x0=cx+Math.cos(a)*r0, y0=cy+Math.sin(a)*r0;
      const x1=cx+Math.cos(a)*r1, y1=cy+Math.sin(a)*r1;
      const [r,g,b]=lineColor(tr.l);
      ctx.strokeStyle=`rgb(${r},${g},${b})`; ctx.lineWidth=1.4;
      ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.stroke();
      // etichetta λ all'estremo esterno
      ctx.fillStyle=T.txt; ctx.font='8px "Space Mono",monospace';
      const fmt=tr.l>=1000?Lab.fmt(tr.l/1000,2)+' µm':Lab.fmt(tr.l,0)+' nm';
      ctx.fillText(fmt, x1+Math.cos(a)*4-6, y1+Math.sin(a)*4);
    });
    // nome serie al bordo del ventaglio
    if(trans.length){
      const am=(fan[1])*Math.PI/180;
      const rr=rOf(nMax)+18;
      ctx.fillStyle=s.color; ctx.font='bold 10px "Space Mono",monospace';
      ctx.fillText(`serie di ${s.name}`, cx+Math.cos(am)*rr, cy+Math.sin(am)*rr);
    }
  }
}

function drawFormulas(ctx,W,H,bx,by){
  const lines=[
    'Formula di Rydberg:',
    '  1/λ = R_H ( 1/n_f² − 1/n_i² )',
    '  R_H = 1,097·10⁷ m⁻¹',
    'Energia livelli:',
    '  E_n = −13,6 / n²  eV',
    'Energia fotone emesso:',
    '  ΔE = E_i − E_f = h c / λ',
  ];
  const x=bx??14, y0=by??H-lines.length*13-12, w=232, h=lines.length*13+10;
  ctx.save();
  ctx.fillStyle=T.box;
  ctx.fillRect(x-6,y0-12,w,h);
  ctx.font='9px "Space Mono",monospace'; ctx.textAlign='left';
  lines.forEach((ln,i)=>{
    ctx.fillStyle = ln.startsWith('  ') ? T.txt : T.accent;
    ctx.fillText(ln, x, y0+i*13);
  });
  ctx.restore();
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
// asse λ logaritmico: le righe vanno da ~91 nm (Lyman) a ~7,5 µm (Pfund)
const L_MIN=80, L_MAX=10000;
const fmtL=v=>v>=1000?Lab.fmt(v/1000,0)+' µm':Lab.fmt(v,0)+' nm';
function spectrumPanel(i,title){
  const g=Lab.panel(gCanvas[i],{ title, xr:[L_MIN,L_MAX], xLog:true, xFmt:fmtL, yr:[0,1], yStep:1e9, yFmt:()=>'', padL:14, padR:22 });
  if(!g) return null; const [ctx,f]=g;
  ctx.fillStyle='#04060c'; ctx.fillRect(f.L,f.T,f.R-f.L,f.B-f.T);
  return g;
}
function visBand(ctx,f,full){
  for(let x=Math.floor(f.X(VIS_MIN)); x<f.X(VIS_MAX); x++){
    const l=Math.pow(10, Math.log10(L_MIN)+(x-f.L)/(f.R-f.L)*Math.log10(L_MAX/L_MIN));
    const [r,g,b]=nmToRgb(l); ctx.fillStyle=full?`rgb(${r},${g},${b})`:`rgba(${r},${g},${b},0.12)`; ctx.fillRect(x,f.T,1.5,f.B-f.T);
  }
}
// 1: spettro di emissione — righe colorate su fondo nero; la fascia tenue è il visibile
function drawSpectrum(){
  const g=spectrumPanel(0,'Spettro di emissione (scala logaritmica)'); if(!g) return; const [ctx,f]=g;
  visBand(ctx,f,false);
  for(const t of activeTransitions()){ const [r,gg,b]=lineColor(t.l); ctx.strokeStyle=`rgb(${r},${gg},${b})`; ctx.lineWidth=1.4;
    ctx.beginPath(); ctx.moveTo(f.X(t.l),f.T); ctx.lineTo(f.X(t.l),f.B); ctx.stroke(); }
  ctx.fillStyle='rgba(255,255,255,0.7)'; ctx.font='9px "DM Sans",sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('visibile',(f.X(VIS_MIN)+f.X(VIS_MAX))/2,f.T+8);
}
// 2: spettro di assorbimento — luce continua con righe scure alle stesse λ dell'emissione
function drawAbsorption(){
  const g=spectrumPanel(1,'Spettro di assorbimento (scala logaritmica)'); if(!g) return; const [ctx,f]=g;
  ctx.fillStyle='#1a2230'; ctx.fillRect(f.L,f.T,f.R-f.L,f.B-f.T);
  visBand(ctx,f,true);
  for(const t of activeTransitions()){
    const x=f.X(t.l);
    if(t.l>=VIS_MIN&&t.l<=VIS_MAX) ctx.fillStyle='rgba(0,0,0,0.92)';
    else { const [r,gg,b]=lineColor(t.l); ctx.fillStyle=`rgba(${r},${gg},${b},0.9)`; }
    ctx.fillRect(x-0.8,f.T,1.6,f.B-f.T);
  }
}

function drawGraphs(){ drawSpectrum(); drawAbsorption(); }

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls(){
  const cont=document.getElementById('controls');
  cont.innerHTML='';

  const secR=Lab.Section('Regioni Spettrali');
  cont.appendChild(secR.el);
  secR.add(Lab.Toggle({ label:'UV (Lyman)',          value:P.showUV,  onChange(v){P.showUV=v;} }));
  secR.add(Lab.Toggle({ label:'Visibile (Balmer)',   value:P.showVis, onChange(v){P.showVis=v;} }));
  secR.add(Lab.Toggle({ label:'IR (Paschen/Brackett/Pfund)', value:P.showIR, onChange(v){P.showIR=v;} }));

  const secD=Lab.Section('Diagramma');
  cont.appendChild(secD.el);
  secD.add(Lab.RadioGroup({
    label:'Visualizzazione',
    options:[{value:'levels',label:'Livelli energetici'},{value:'orbits',label:'Orbite (Bohr)'}],
    value:P.view, onChange(v){P.view=v;},
  }));
  secD.add(Lab.Slider({ label:'n massimo', min:6, max:12, step:1, value:P.niMax, unit:'', onChange(v){P.niMax=v;} }));
  secD.add(Lab.RadioGroup({
    label:'Unità energia',
    options:[{value:'eV',label:'eV'},{value:'J',label:'Joule'}],
    value:P.energyUnit, onChange(v){P.energyUnit=v;},
  }));
  secD.add(Lab.Toggle({ label:'Mostra formule', value:P.formulas, onChange(v){P.formulas=v;} }));
}

// ═══ Graph panel ══════════════════════════════════════════════════════════════
function initGraphs(){
  gCanvas = Lab.graphPanels(document.getElementById('graphArea'), 2, 120);
  gCtx = gCanvas.map(c => c.getContext('2d'));
}

// ═══ Init ═════════════════════════════════════════════════════════════════════
function init(){
  Lab.initTheme();
  buildControls();
  initGraphs();

  const simCanvas=document.getElementById('simCanvas');
  readout=new Lab.Readout(document.getElementById('readout'),[
    {key:'series', label:'serie attive'},
    {key:'lines',  label:'righe mostrate'},
    {key:'range',  label:'regioni'},
    {key:'hint',   label:'riga Hα (3 → 2)'},
  ]);

  document.getElementById('btnFormulas').addEventListener('click',()=>{ P.formulas=!P.formulas; buildControls(); });
  document.getElementById('btnReset').addEventListener('click',()=>{
    P.niMax=7; P.showUV=true; P.showVis=true; P.showIR=true; P.formulas=true; P.energyUnit='eV'; P.view='levels';
    buildControls();
  });

  function resize(){
    const area=document.querySelector('.lab-canvas-area');
    if(!area)return;
    const ar=area.getBoundingClientRect();
    const rb=document.getElementById('readout').getBoundingClientRect();
    const ga=document.getElementById('graphArea');
    const gaH=ga?ga.offsetHeight:0;
    Lab.hidpi(simCanvas, Math.floor(ar.width), Math.max(160,Math.floor(ar.height-rb.height-gaH-4)));
    Lab.fitPanels(gCanvas);
  }
  resize();
  new ResizeObserver(resize).observe(document.querySelector('.lab-canvas-area'));

  function frame(){
    T=pal();
    draw(simCanvas);
    drawGraphs();
    const regs=[P.showUV&&'UV',P.showVis&&'Vis',P.showIR&&'IR'].filter(Boolean);
    const trans=activeTransitions();
    const activeSeries=new Set(trans.map(t=>t.s.name));
    readout.set('series', String(activeSeries.size));
    readout.set('lines', String(trans.length));
    readout.set('range', regs.join(' · ')||'—');
    readout.set('hint', `${Lab.fmt(lambdaNm(2,3),1)} nm · ${Lab.fmt(En(3)-En(2),2)} eV`);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

window.addEventListener('DOMContentLoaded', init);
