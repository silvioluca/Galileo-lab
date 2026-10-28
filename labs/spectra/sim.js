'use strict';

// ═══ Dati: righe spettrali (λ in nm, intensità relativa 0–1) ═══════════════════
// Comprende UV (<380), visibile (380–750) e IR (>750). Valori didattici NIST.
const ELEMENTS = {
  H:  { Z:1,  name:'Idrogeno', lines:[[656.3,1.0],[486.1,0.42],[434.0,0.22],[410.2,0.12],[397.0,0.06],[388.9,0.04],[121.6,1.0],[102.6,0.35],[97.3,0.18]] },
  He: { Z:2,  name:'Elio',     lines:[[587.6,1.0],[447.1,0.5],[667.8,0.5],[501.6,0.45],[471.3,0.3],[492.2,0.3],[706.5,0.35],[728.1,0.2],[388.9,0.5],[1083.0,1.0],[318.8,0.2]] },
  Li: { Z:3,  name:'Litio',    lines:[[670.8,1.0],[610.4,0.4],[460.3,0.2],[323.3,0.2],[812.6,0.3]] },
  Na: { Z:11, name:'Sodio',    lines:[[589.0,1.0],[589.6,0.95],[568.8,0.15],[615.4,0.1],[330.3,0.3],[819.5,0.5],[818.3,0.45]] },
  K:  { Z:19, name:'Potassio', lines:[[766.5,1.0],[769.9,0.6],[404.4,0.18],[404.7,0.12],[344.7,0.1]] },
  Ca: { Z:20, name:'Calcio',   lines:[[422.7,1.0],[393.4,0.6],[396.8,0.5],[612.2,0.3],[616.2,0.3],[558.9,0.2],[272.2,0.2]] },
  Ne: { Z:10, name:'Neon',     lines:[[640.2,1.0],[638.3,0.8],[633.4,0.7],[626.6,0.6],[621.7,0.5],[614.3,0.5],[607.4,0.5],[603.0,0.4],[594.5,0.55],[588.2,0.45],[585.2,0.6],[650.7,0.5],[659.9,0.4],[692.9,0.3],[703.2,0.3],[540.1,0.2],[865.4,0.5],[837.8,0.4]] },
  Hg: { Z:80, name:'Mercurio', lines:[[546.1,1.0],[435.8,0.8],[577.0,0.6],[579.1,0.6],[404.7,0.5],[491.6,0.3],[365.0,0.7],[253.7,1.0],[1014.0,0.4]] },
  Ar: { Z:18, name:'Argon',    lines:[[811.5,1.0],[763.5,0.8],[750.4,0.7],[772.4,0.6],[696.5,0.6],[706.7,0.5],[738.4,0.5],[794.8,0.5],[415.9,0.3],[420.1,0.3],[451.1,0.2],[912.3,0.5],[922.5,0.4]] },
};
const EL_KEYS = Object.keys(ELEMENTS);

const VIS_MIN=380, VIS_MAX=750;

// ═══ Stato ════════════════════════════════════════════════════════════════════
const P = {
  el:        'H',
  mode:      'emission',
  broaden:   2.0,
  labels:    true,
  bothBands: true,
  fullRange: false,        // mostra anche UV/IR
};
let hoverLambda = null;
let gCanvas=[null,null], gCtx=[null,null];
let readout;

function WMIN(){ return P.fullRange ? 100  : VIS_MIN; }
function WMAX(){ return P.fullRange ? 1100 : VIS_MAX; }

// ═══ Palette theme-aware ══════════════════════════════════════════════════════
function dk(){ return document.documentElement.dataset.theme !== 'light'; }
function pal(){
  const d=dk();
  return {
    bg:     d?'#06090f':'#e7edf4',
    band:   '#04060c',
    nonvis: d?'#0c1018':'#11151c',     // regioni UV/IR (non visibile)
    txt:    d?'rgba(215,235,250,0.95)':'rgba(20,45,75,0.95)',
    sub:    d?'rgba(165,195,220,0.8)':'rgba(60,95,130,0.88)',
    accent: d?'#00d4ff':'#0a78b0',
    axis:   d?'rgba(140,175,205,0.6)':'rgba(55,90,125,0.85)',
    gBg:    d?'rgb(3,9,22)':'#eef2f7',
    gAxis:  d?'rgba(100,155,210,0.26)':'rgba(40,80,130,0.30)',
    gText:  d?'rgba(150,205,225,0.88)':'rgba(25,65,105,0.92)',
    tick:   d?'rgba(150,180,210,0.55)':'rgba(60,95,130,0.8)',
    frame:  d?'rgba(150,180,210,0.25)':'rgba(60,95,130,0.4)',
  };
}
let T = pal();

// ═══ λ (nm) → RGB ═════════════════════════════════════════════════════════════
function nmToRgb(l) {
  let r=0,g=0,b=0;
  if      (l<380) { r=0.2; g=0; b=0.3; }
  else if (l<440) { r=-(l-440)/(440-380); g=0; b=1; }
  else if (l<490) { r=0; g=(l-440)/(490-440); b=1; }
  else if (l<510) { r=0; g=1; b=-(l-510)/(510-490); }
  else if (l<580) { r=(l-510)/(580-510); g=1; b=0; }
  else if (l<645) { r=1; g=-(l-645)/(645-580); b=0; }
  else if (l<=780){ r=1; g=0; b=0; }
  else            { r=0.35; g=0; b=0; }
  let f=1;
  if (l<420) f=0.3+0.7*(l-380)/40;
  else if (l>700) f=0.3+0.7*(780-l)/80;
  const q=x=>Math.round(255*Math.pow(Math.max(0,Math.min(1,x))*f,0.8));
  return [q(r),q(g),q(b)];
}
// colore per righe, incluse UV/IR (rese visibili con tinta convenzionale)
function colorForLine(l){
  if (l < VIS_MIN) return [185,150,240];   // UV → violetto chiaro
  if (l > VIS_MAX) return [235,95,70];      // IR → rosso scuro
  return nmToRgb(l);
}

function lToX(l, x0, w){ return x0 + (l-WMIN())/(WMAX()-WMIN())*w; }
function xToL(x, x0, w){ return WMIN() + (x-x0)/w*(WMAX()-WMIN()); }
function windowLines(){ return ELEMENTS[P.el].lines.filter(([l])=>l>=WMIN()&&l<=WMAX()); }

// ═══ Rendering ════════════════════════════════════════════════════════════════
function draw(canvas) {
  const [ctx, W, H] = Lab.ctx2d(canvas);
  ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);

  const el=ELEMENTS[P.el];
  const margin=46, x0=margin, w=W-margin*2;

  ctx.fillStyle=T.accent; ctx.font='bold 22px "Space Mono",monospace';
  ctx.fillText(`${P.el}`, x0, 34);
  ctx.fillStyle=T.txt; ctx.font='15px "DM Sans",sans-serif';
  ctx.fillText(el.name, x0+36, 26);
  ctx.fillStyle=T.sub; ctx.font='11px "Space Mono",monospace';
  ctx.fillText(`Z=${el.Z} · ${windowLines().length} righe · ${P.fullRange?'UV–vis–IR':'visibile'}`, x0+36, 40);

  const both=P.bothBands;
  const bandH=both?Math.min(120,(H-150)/2):Math.min(190,H-150);
  let y=60;

  if (both||P.mode==='emission'){ drawBandLabel(ctx,'EMISSIONE',x0,y); drawEmission(ctx,x0,y+10,w,bandH); y+=bandH+34; }
  if (both||P.mode==='absorption'){ drawBandLabel(ctx,'ASSORBIMENTO',x0,y); drawAbsorption(ctx,x0,y+10,w,bandH); y+=bandH+34; }

  drawRuler(ctx,x0,y-12,w);

  if (hoverLambda!=null){
    const hx=lToX(hoverLambda,x0,w);
    ctx.strokeStyle=T.axis; ctx.lineWidth=1; ctx.setLineDash([2,3]);
    ctx.beginPath(); ctx.moveTo(hx,58); ctx.lineTo(hx,y-14); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle=T.txt; ctx.font='11px "Space Mono",monospace';
    const reg = hoverLambda<VIS_MIN?' (UV)':hoverLambda>VIS_MAX?' (IR)':'';
    ctx.fillText(`${Lab.fmt(hoverLambda,1)} nm${reg}`, Math.min(hx+5,W-92), 54);
  }
}

function drawBandLabel(ctx,txt,x,y){ ctx.fillStyle=T.sub; ctx.font='9px "Space Mono",monospace'; ctx.fillText(txt,x,y+6); }
function lineWidthFor(i){ return 0.8 + P.broaden*(0.4+i*1.4); }

// disegna le bande grigie UV/IR + etichette regione
function drawNonVisRegions(ctx, x0, y, w, h) {
  if (!P.fullRange) return;
  const xUVend=lToX(VIS_MIN,x0,w), xIRstart=lToX(VIS_MAX,x0,w);
  ctx.save();
  ctx.fillStyle=T.nonvis;
  ctx.fillRect(x0,y,xUVend-x0,h);
  ctx.fillRect(xIRstart,y,(x0+w)-xIRstart,h);
  ctx.fillStyle='rgba(180,180,200,0.35)'; ctx.font='10px "Space Mono",monospace';
  ctx.fillText('UV', (x0+xUVend)/2-8, y+14);
  ctx.fillText('IR', (xIRstart+x0+w)/2-6, y+14);
  ctx.restore();
}

function drawEmission(ctx, x0, y, w, h) {
  ctx.fillStyle=T.band; ctx.fillRect(x0,y,w,h);
  drawNonVisRegions(ctx,x0,y,w,h);
  ctx.save();
  for (const [l,inten] of windowLines()) {
    const x=lToX(l,x0,w);
    const [r,g,b]=colorForLine(l);
    const lw=lineWidthFor(inten);
    const grd=ctx.createLinearGradient(x-lw*4,0,x+lw*4,0);
    grd.addColorStop(0,`rgba(${r},${g},${b},0)`);
    grd.addColorStop(0.5,`rgba(${r},${g},${b},${0.35*inten})`);
    grd.addColorStop(1,`rgba(${r},${g},${b},0)`);
    ctx.fillStyle=grd; ctx.fillRect(x-lw*4,y,lw*8,h);
    ctx.fillStyle=`rgb(${r},${g},${b})`; ctx.globalAlpha=0.5+0.5*inten;
    ctx.fillRect(x-lw/2,y,lw,h); ctx.globalAlpha=1;
  }
  ctx.restore();
  ctx.strokeStyle=T.frame; ctx.lineWidth=1; ctx.strokeRect(x0,y,w,h);
  if (P.labels) drawLineLabels(ctx,x0,y,w,h,false);
}

function drawAbsorption(ctx, x0, y, w, h) {
  // continuo arcobaleno solo nel visibile
  const xVa=lToX(Math.max(VIS_MIN,WMIN()),x0,w), xVb=lToX(Math.min(VIS_MAX,WMAX()),x0,w);
  for (let px=Math.floor(xVa); px<xVb; px++) {
    const l=xToL(px,x0,w);
    const [r,g,b]=nmToRgb(l);
    ctx.fillStyle=`rgb(${r},${g},${b})`; ctx.fillRect(px,y,1,h);
  }
  drawNonVisRegions(ctx,x0,y,w,h);
  // righe di assorbimento (scure)
  for (const [l,inten] of windowLines()) {
    const x=lToX(l,x0,w);
    const lw=lineWidthFor(inten);
    if (l>=VIS_MIN&&l<=VIS_MAX) ctx.fillStyle=`rgba(0,0,0,${0.55+0.45*inten})`;
    else { const [r,g,b]=colorForLine(l); ctx.fillStyle=`rgba(${r},${g},${b},${0.5+0.5*inten})`; }
    ctx.fillRect(x-lw/2,y,lw,h);
  }
  ctx.strokeStyle=T.frame; ctx.lineWidth=1; ctx.strokeRect(x0,y,w,h);
  if (P.labels) drawLineLabels(ctx,x0,y,w,h,true);
}

// etichette λ DI LATO alla riga, colore fisso (sta sullo sfondo della banda)
function drawLineLabels(ctx, x0, y, w, h, darkBand) {
  ctx.save();
  ctx.font='8px "Space Mono",monospace';
  // emissione: banda scura → testo chiaro. assorbimento: continuo chiaro → testo scuro.
  const colVis = darkBand ? 'rgba(12,16,26,0.92)' : 'rgba(225,238,252,0.9)';
  const shown=[];
  for (const [l,inten] of windowLines()) {
    if (inten<0.3) continue;
    const x=lToX(l,x0,w);
    if (shown.some(sx=>Math.abs(sx-x)<13)) continue;
    shown.push(x);
    // testo verticale appena a destra della riga, vicino al bordo superiore
    ctx.fillStyle = (l<VIS_MIN||l>VIS_MAX) ? 'rgba(210,210,225,0.85)' : colVis;
    ctx.save();
    ctx.translate(x+lineWidthFor(inten)/2+4, y+8);
    ctx.rotate(Math.PI/2);
    ctx.fillText(`${l.toFixed(0)}`, 0, 3);
    ctx.restore();
  }
  ctx.restore();
}

function drawRuler(ctx, x0, y, w) {
  ctx.strokeStyle=T.tick; ctx.fillStyle=T.tick; ctx.lineWidth=1;
  ctx.font='9px "Space Mono",monospace';
  ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x0+w,y); ctx.stroke();
  const step = P.fullRange?100:50;
  const start = Math.ceil(WMIN()/step)*step;
  for (let l=start; l<=WMAX(); l+=step) {
    const x=lToX(l,x0,w);
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y+5); ctx.stroke();
    ctx.fillText(`${l}`, x-9, y+16);
  }
  ctx.fillText('nm', x0+w-16, y+16);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
// 1: spettro a righe I(λ): altezza = intensità relativa
function drawLineSpectrum() {
  const g=Lab.panel(gCanvas[0],{ title:`Spettro a righe di ${ELEMENTS[P.el].name}: intensità relativa`, xr:[WMIN(),WMAX()], xStep:P.fullRange?100:50, yr:[0,1], yStep:0.25, xLabel:'λ (nm)' });
  if(!g) return; const [ctx,f]=g;
  for (const [l,inten] of windowLines()) {
    const [r,gg,b]=colorForLine(l);
    ctx.strokeStyle=`rgb(${r},${gg},${b})`; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(f.X(l),f.B); ctx.lineTo(f.X(l),f.Y(inten)); ctx.stroke();
  }
}

// 2: energia del fotone E = hc/λ (≈ 1240 eV·nm / λ): righe blu e viola portano più energia
function drawEnergyLevels() {
  const lines=windowLines();
  const g=Lab.panel(gCanvas[1],{ title:'Energia del fotone E = hc/λ (eV)', xr:[WMIN(),WMAX()], xStep:P.fullRange?100:50,
    yr:[0,P.fullRange?14:4], yStep:P.fullRange?2:1, xLabel:'λ (nm)' });
  if(!g) return; const [ctx,f]=g;
  Lab.plot(ctx,f,l=>1240/l,[WMIN(),WMAX()],f.C.text,1.2,[4,3]);
  let lastX=-99;
  for (const [l,inten] of [...lines].sort((a,b)=>b[1]-a[1])) {
    const [r,gg,b]=colorForLine(l), E=1240/l;
    Lab.dot(ctx,f,l,E,`rgb(${r},${gg},${b})`,2.5+2*inten);
  }
  ctx.font='9px "Space Mono",monospace'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle=f.C.title;
  for (const [l,inten] of [...lines].sort((a,b)=>a[0]-b[0])) {
    if (inten<0.3 || Math.abs(f.X(l)-lastX)<40) continue;
    lastX=f.X(l); const E=1240/l;
    if (f.Y(E)>f.T+14) ctx.fillText(Lab.fmt(E,2),f.X(l),f.Y(E)-10);
  }
}

function drawGraphs(){ drawLineSpectrum(); drawEnergyLevels(); }

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls() {
  const cont=document.getElementById('controls');
  cont.innerHTML='';

  const secE=Lab.Section('Elemento');
  cont.appendChild(secE.el);
  secE.add(Lab.RadioGroup({
    label:'Sorgente',
    options: EL_KEYS.map(k=>({value:k,label:`${k} · ${ELEMENTS[k].name}`})),
    value:P.el,
    onChange(v){ P.el=v; },
  }));

  const secV=Lab.Section('Visualizzazione');
  cont.appendChild(secV.el);
  secV.add(Lab.RadioGroup({
    label:'Bande',
    options:[
      {value:'both',label:'Emissione + Assorbimento'},
      {value:'emission',label:'Solo emissione'},
      {value:'absorption',label:'Solo assorbimento'},
    ],
    value: P.bothBands?'both':P.mode,
    onChange(v){ if(v==='both'){P.bothBands=true;} else {P.bothBands=false;P.mode=v;} },
  }));
  secV.add(Lab.Toggle({
    label:'Mostra UV / IR (non visibile)',
    value:P.fullRange,
    onChange(v){ P.fullRange=v; },
  }));
  secV.add(Lab.Slider({
    label:'Larghezza righe', min:0.5, max:6, step:0.1, value:P.broaden, unit:' px',
    onChange(v){ P.broaden=v; },
  }));
  secV.add(Lab.Toggle({
    label:'Etichette λ',
    value:P.labels,
    onChange(v){ P.labels=v; },
  }));
}

// ═══ Hover λ ══════════════════════════════════════════════════════════════════
function initHover(canvas) {
  canvas.addEventListener('mousemove', e=>{
    const r=canvas.getBoundingClientRect();
    const margin=46, x0=margin, w=r.width-margin*2;
    const x=e.clientX-r.left;
    hoverLambda = (x>=x0&&x<=x0+w) ? xToL(x,x0,w) : null;
  });
  canvas.addEventListener('mouseleave', ()=>{ hoverLambda=null; });
}

// ═══ Graph panel ══════════════════════════════════════════════════════════════
function initGraphs() {
  gCanvas = Lab.graphPanels(document.getElementById('graphArea'), 2, 205);
  gCtx = gCanvas.map(c => c.getContext('2d'));
}

// ═══ Init ═════════════════════════════════════════════════════════════════════
function init() {
  Lab.initTheme();
  buildControls();
  initGraphs();

  const simCanvas=document.getElementById('simCanvas');
  readout=new Lab.Readout(document.getElementById('readout'),[
    {key:'el',    label:'elemento'},
    {key:'lines', label:'righe mostrate'},
    {key:'strong',label:'riga più intensa'},
    {key:'hint',  label:'bande'},
  ]);

  document.getElementById('btnMode').addEventListener('click',()=>{
    if (P.bothBands){ P.bothBands=false; P.mode='emission'; }
    else if (P.mode==='emission') P.mode='absorption';
    else P.bothBands=true;
    buildControls();
  });
  document.getElementById('btnReset').addEventListener('click',()=>{
    P.el='H'; P.mode='emission'; P.bothBands=true; P.broaden=2.0; P.labels=true; P.fullRange=false;
    hoverLambda=null; buildControls();
  });

  initHover(simCanvas);

  function resize(){
    const area=document.querySelector('.lab-canvas-area');
    if(!area)return;
    const ar=area.getBoundingClientRect();
    const rb=document.getElementById('readout').getBoundingClientRect();
    const ga=document.getElementById('graphArea');
    const gaH=ga?ga.offsetHeight:0;
    Lab.hidpi(simCanvas, Math.floor(ar.width), Math.max(120,Math.floor(ar.height-rb.height-gaH-4)));
    Lab.fitPanels(gCanvas);
  }
  resize();
  new ResizeObserver(resize).observe(document.querySelector('.lab-canvas-area'));

  function frame(){
    T=pal();
    draw(simCanvas);
    drawGraphs();
    const lines=windowLines();
    const strong=lines.reduce((a,b)=>b[1]>a[1]?b:a,[0,0]);
    readout.set('el', `${P.el} · ${ELEMENTS[P.el].name}`);
    readout.set('lines', String(lines.length));
    readout.set('strong', strong[0]?`${Lab.fmt(strong[0],1)} nm · ${Lab.fmt(1240/strong[0],2)} eV`:'—');
    readout.set('hint', P.bothBands?'emissione + assorbimento':(P.mode==='emission'?'emissione':'assorbimento'));
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

window.addEventListener('DOMContentLoaded', init);
