'use strict';

// ═══ Costanti ═════════════════════════════════════════════════════════════════
const H_PLANCK = 6.62607015e-34;   // J·s
const eV = 1.602176634e-19;

const PARTICLES = {
  electron: { m:9.109e-31,  name:'Elettrone' },
  proton:   { m:1.673e-27,  name:'Protone' },
  neutron:  { m:1.675e-27,  name:'Neutrone' },
  alpha:    { m:6.645e-27,  name:'Particella α' },
  c60:      { m:1.196e-24,  name:'Fullerene C₆₀' },
};
const PART_KEYS = Object.keys(PARTICLES);

// ═══ Stato ════════════════════════════════════════════════════════════════════
const P = {
  particle: 'electron',
  v:        2.0e6,        // velocità (m/s)
  view:     'packet',     // 'packet' | 'orbits' | 'scale'
  orbitN:   4,            // numero di lunghezze d'onda sull'orbita (può essere non intero)
};
let t=0;
let gCanvas=[null,null,null], gCtx=[null,null,null];
let readout, paused=false;

// ═══ Palette ══════════════════════════════════════════════════════════════════
function dk(){ return document.documentElement.dataset.theme !== 'light'; }
function pal(){
  const d=dk();
  return {
    bg:    d?'#06090f':'#e7edf4',
    txt:   d?'rgba(215,235,250,0.95)':'rgba(20,45,75,0.95)',
    sub:   d?'rgba(165,195,220,0.8)':'rgba(60,95,130,0.88)',
    accent:d?'#00d4ff':'#0a78b0',
    wave:  d?'rgba(0,210,255,0.9)':'rgba(0,120,190,0.95)',
    env:   d?'rgba(255,180,80,0.85)':'rgba(210,130,0,0.9)',
    grid:  d?'rgba(120,150,190,0.25)':'rgba(60,95,130,0.3)',
    gBg:   d?'rgb(3,9,22)':'#eef2f7',
    gAxis: d?'rgba(100,155,210,0.26)':'rgba(40,80,130,0.30)',
    gText: d?'rgba(150,205,225,0.88)':'rgba(25,65,105,0.92)',
    dot:   d?'rgba(120,220,255,0.9)':'rgba(0,110,180,0.85)',
    screen:d?'#04060c':'#0a0c12',
  };
}
let T=pal();

// ═══ Fisica de Broglie ════════════════════════════════════════════════════════
function mass(){ return PARTICLES[P.particle].m; }
// relativistico: p = γ·m·v, Eₖ = (γ − 1)·m·c² (a basse velocità coincidono con m·v e ½·m·v²)
const C_LIGHT=299792458;
function gamma(v){ return 1/Math.sqrt(1-(v/C_LIGHT)**2); }
function momentum(){ return gamma(P.v)*mass()*P.v; }
function lambdaDB(){ return H_PLANCK/momentum(); }          // m
function eKin(){ return (gamma(P.v)-1)*mass()*C_LIGHT*C_LIGHT; }               // J
function fmtLen(m){
  if(m>=1e-3) return Lab.fmt(m*1e3,2)+' mm';
  if(m>=1e-6) return Lab.fmt(m*1e6,2)+' µm';
  if(m>=1e-9) return Lab.fmt(m*1e9,3)+' nm';
  if(m>=1e-12)return Lab.fmt(m*1e12,2)+' pm';
  if(m>=1e-15)return Lab.fmt(m*1e15,2)+' fm';
  return Lab.sci(m,3)+' m';
}

// ═══ Rendering ════════════════════════════════════════════════════════════════
function draw(canvas){
  const [ctx, W, H] = Lab.ctx2d(canvas);
  ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  if      (P.view==='packet') drawPacket(ctx,W,H);
  else if (P.view==='orbits') drawOrbitsWave(ctx,W,H);
  else                        drawScale(ctx,W,H);
  drawHeader(ctx,W,H);
}

function drawHeader(ctx,W,H){
  const p=PARTICLES[P.particle];
  ctx.fillStyle=T.accent; ctx.font='bold 15px "Space Mono",monospace'; ctx.textAlign='left';
  ctx.fillText(`λ = h/p = ${fmtLen(lambdaDB())}`, 14, 24);
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace';
  ctx.fillText(`${p.name} · v = ${Lab.sci(P.v,3)} m/s · p = ${Lab.sci(momentum(),3)} kg·m/s · Eₖ = ${Lab.eng(eKin()/eV,'eV',2)}`, 14, 40);
}

// ── Vista 1: pacchetto d'onda ─────────────────────────────────────────────────
function drawPacket(ctx,W,H){
  const cy=H*0.52, amp=H*0.26;
  const x0=40, x1=W-40, w=x1-x0;

  // asse
  ctx.strokeStyle=T.grid; ctx.lineWidth=0.6;
  ctx.beginPath(); ctx.moveTo(x0,cy); ctx.lineTo(x1,cy); ctx.stroke();

  // lunghezza d'onda → pixel (scala log per restare visibile)
  const lam=lambdaDB();
  // mappa λ in pixel: scala in modo che resti tra 12 e 200 px
  const pxPerWave = Math.max(10, Math.min(220, 6e-10/lam*60));
  const k=2*Math.PI/pxPerWave;
  const cxp=(x0+x1)/2, sigma=w*0.16;

  // inviluppo gaussiano (localizzazione = particella)
  ctx.strokeStyle=T.env; ctx.lineWidth=1.2; ctx.beginPath();
  for(let x=x0;x<=x1;x++){ const e=Math.exp(-(((x-cxp)/sigma)**2)); ctx.lineTo(x,cy-amp*e); }
  ctx.stroke();
  ctx.beginPath();
  for(let x=x0;x<=x1;x++){ const e=Math.exp(-(((x-cxp)/sigma)**2)); ctx.lineTo(x,cy+amp*e); }
  ctx.stroke();

  // onda portante × inviluppo (parte reale di ψ), animata
  ctx.strokeStyle=T.wave; ctx.lineWidth=1.6; ctx.beginPath();
  for(let x=x0;x<=x1;x++){
    const e=Math.exp(-(((x-cxp)/sigma)**2));
    const y=cy - amp*e*Math.cos(k*(x-cxp)-t*3);
    x===x0?ctx.moveTo(x,y):ctx.lineTo(x,y);
  }
  ctx.stroke();

  // misura λ (tra due creste al centro)
  const xa=cxp, xb=cxp+pxPerWave;
  ctx.strokeStyle=T.sub; ctx.lineWidth=1; ctx.setLineDash([3,3]);
  ctx.beginPath(); ctx.moveTo(xa,cy-amp-8); ctx.lineTo(xa,cy+amp+8);
  ctx.moveTo(xb,cy-amp-8); ctx.lineTo(xb,cy+amp+8); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle=T.txt; ctx.font='10px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillText(`λ = ${fmtLen(lam)}`, (xa+xb)/2, cy-amp-14);
  ctx.textAlign='left';
  ctx.fillStyle=T.sub; ctx.font='10px "DM Sans",sans-serif';
  ctx.fillText('Particella localizzata = sovrapposizione di onde (pacchetto). Aumenta v → λ diminuisce.', x0, H-16);
}

// ── Vista 2: orbite permesse (onda stazionaria 2πr = nλ) ──────────────────────
function drawOrbitsWave(ctx,W,H){
  const cx=W*0.45, cy=H*0.52;
  const R=Math.min(W*0.32, H*0.34);
  const n=P.orbitN;
  const frac=Math.abs(n-Math.round(n));
  const allowed = frac<0.06;       // condizione di chiusura → orbita permessa
  const col = allowed ? T.wave : 'rgba(255,90,70,0.95)';
  const amp = R*0.16;

  // nucleo
  ctx.fillStyle='#ff5040'; ctx.beginPath(); ctx.arc(cx,cy,4,0,Math.PI*2); ctx.fill();

  // orbita di riferimento (tratteggiata)
  ctx.strokeStyle=T.grid; ctx.lineWidth=0.8; ctx.setLineDash([3,4]);
  ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]);

  // onda stazionaria avvolta sull'orbita: r(θ) = R + amp·sin(nθ)·cos(ωt)
  const osc=Math.cos(t*3);
  const NSEG=400;
  ctx.strokeStyle=col; ctx.lineWidth=2;
  ctx.beginPath();
  for(let i=0;i<=NSEG;i++){
    const th=i/NSEG*Math.PI*2;
    const rr=R+amp*Math.sin(n*th)*osc;
    const x=cx+Math.cos(th)*rr, y=cy+Math.sin(th)*rr;
    i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
  }
  ctx.stroke();

  // se proibita: evidenzia il disallineamento tra inizio e fine onda
  if(!allowed){
    const th0=0, thE=Math.PI*2;
    const r0=R+amp*Math.sin(n*th0)*osc;
    const rE=R+amp*Math.sin(n*thE)*osc;
    const x0=cx+Math.cos(th0)*r0, y0=cy+Math.sin(th0)*r0;
    const xE=cx+Math.cos(thE)*rE, yE=cy+Math.sin(thE)*rE;
    ctx.strokeStyle='rgba(255,90,70,0.95)'; ctx.lineWidth=1.5; ctx.setLineDash([2,2]);
    ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(xE,yE); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle='rgba(255,120,100,0.95)'; ctx.font='9px "Space Mono",monospace'; ctx.textAlign='left';
    ctx.fillText('l\'onda non si chiude → interferenza distruttiva', cx-R, cy+R+30);
  }

  // etichette
  ctx.textAlign='center';
  ctx.fillStyle=col; ctx.font='bold 13px "Space Mono",monospace';
  ctx.fillText(allowed?`ORBITA PERMESSA · n=${Math.round(n)}`:'ORBITA PROIBITA', cx, cy-R-22);
  ctx.fillStyle=T.sub; ctx.font='11px "Space Mono",monospace';
  ctx.fillText(`2πr = n·λ   (n = ${Lab.fmt(n,1)})`, cx, cy-R-6);

  ctx.textAlign='left';
  ctx.fillStyle=T.sub; ctx.font='10px "DM Sans",sans-serif';
  ctx.fillText('Solo le orbite in cui un numero intero di λ chiude l\'onda sono stabili (Bohr–de Broglie).', 24, H-16);
}

// ── Vista 3: confronto scala λ ────────────────────────────────────────────────
const SCALE_OBJ = [
  { name:'Elettrone (10⁶ m/s)', m:9.109e-31, v:1e6 },
  { name:'Protone (10⁵ m/s)',   m:1.673e-27, v:1e5 },
  { name:'Atomo He (10³ m/s)',  m:6.646e-27, v:1e3 },
  { name:'C₆₀ (200 m/s)',       m:1.196e-24, v:200 },
  { name:'Granello (1 µg, 1mm/s)', m:1e-9,   v:1e-3 },
  { name:'Pallone (0.4 kg, 10 m/s)', m:0.4,  v:10 },
  { name:'Uomo (70 kg, 1 m/s)', m:70,        v:1 },
];
function drawScale(ctx,W,H){
  const x0=200, x1=W-60, w=x1-x0, y0=70, rowH=Math.min(48,(H-130)/SCALE_OBJ.length);
  // asse log λ da 1e-35 a 1e-9 m
  const lo=-35, hi=-9;
  const xOf=lam=>{ const e=Math.log10(lam); return x0+(e-lo)/(hi-lo)*w; };

  ctx.strokeStyle=T.grid; ctx.lineWidth=0.6;
  ctx.fillStyle=T.sub; ctx.font='8px "Space Mono",monospace'; ctx.textAlign='center';
  for(let e=lo;e<=hi;e+=4){
    const x=xOf(Math.pow(10,e));
    ctx.beginPath(); ctx.moveTo(x,y0-6); ctx.lineTo(x,y0+SCALE_OBJ.length*rowH); ctx.stroke();
    ctx.fillText(`10${supExp(e)} m`, x, y0-10);
  }

  SCALE_OBJ.forEach((o,i)=>{
    const lam=H_PLANCK/(o.m*o.v);
    const y=y0+i*rowH+rowH*0.5;
    ctx.fillStyle=T.txt; ctx.font='10px "Space Mono",monospace'; ctx.textAlign='right';
    ctx.fillText(o.name, x0-10, y+3);
    const x=Math.max(x0,Math.min(x1,xOf(lam)));
    // marcatore
    ctx.fillStyle=T.accent; ctx.beginPath(); ctx.arc(x,y,5,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle=T.grid; ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x,y); ctx.stroke();
    ctx.fillStyle=T.sub; ctx.font='8px "Space Mono",monospace'; ctx.textAlign='left';
    ctx.fillText(fmtLen(lam), x+8, y+3);
  });
  ctx.textAlign='left'; ctx.fillStyle=T.sub; ctx.font='10px "DM Sans",sans-serif';
  ctx.fillText('Oggetti macroscopici: λ così piccola da essere inosservabile. Solo le particelle hanno λ rilevante.', x0-180, H-16);
}
function supExp(e){ const m={'-':'⁻','0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹'}; return String(e).split('').map(c=>m[c]||c).join(''); }

// ═══ Grafici ══════════════════════════════════════════════════════════════════
// 1: λ = h/p in funzione della velocità (scale logaritmiche): raddoppiare v dimezza λ
function drawLambdaV(){
  const m=mass(), lamAt=v=>H_PLANCK/(m*gamma(v)*v);
  const g=Lab.panel(gCanvas[0],{ title:`λ di de Broglie (m) — ${PARTICLES[P.particle].name}`, xr:[1e2,1e8], xLog:true, yr:[1e-16,1e-5], yLog:true, xLabel:'v (m/s)' });
  if(!g) return; const [ctx,f]=g;
  Lab.plot(ctx,f,v=>lamAt(v),[1e2,1e8],T.wave,2,[],200);
  Lab.dot(ctx,f,P.v,lambdaDB(),T.env,4.5);
}
// 2: l'onda "srotolata" lungo l'orbita: è stazionaria solo se sull'orbita stanno n lunghezze d'onda intere
function drawStandingWave(){
  const n=P.orbitN, allowed=Math.abs(n-Math.round(n))<0.06, col=allowed?T.wave:'rgba(255,90,70,0.95)';
  const g=Lab.panel(gCanvas[1],{ title:`Onda lungo l’orbita, 2πr = ${Lab.fmt(n,1)}·λ`, xr:[0,360], xStep:90, yr:[-1,1], yStep:1, xLabel:'angolo lungo l’orbita (°)' });
  if(!g) return; const [ctx,f]=g;
  Lab.plot(ctx,f,a=>Math.sin(n*a*Math.PI/180)*Math.cos(t*3),[0,360],col,2);
  ctx.fillStyle=col; ctx.font='10px "DM Sans",sans-serif'; ctx.textAlign='right'; ctx.textBaseline='middle';
  ctx.fillText(allowed?'si richiude su sé stessa: orbita permessa':'non si richiude: orbita non permessa',f.R-4,f.B-10);
}
// 3: λ in funzione dell'energia cinetica (scale logaritmiche), con p relativistico
function drawEnergyLambda(){
  const m=mass();
  const lamE=Eev=>{ const E=Eev*eV, mc2=m*C_LIGHT*C_LIGHT; return H_PLANCK*C_LIGHT/Math.sqrt(E*E+2*E*mc2); };
  const g=Lab.panel(gCanvas[2],{ title:'λ (m) in funzione dell’energia cinetica', xr:[1e-3,1e6], xLog:true, yr:[1e-15,1e-7], yLog:true, xLabel:'Eₖ (eV)' });
  if(!g) return; const [ctx,f]=g;
  Lab.plot(ctx,f,lamE,[1e-3,1e6],T.env,2,[],200);
  Lab.dot(ctx,f,eKin()/eV,lambdaDB(),T.wave,4.5);
}

function drawGraphs(){ drawLambdaV(); drawStandingWave(); drawEnergyLambda(); }

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls(){
  const cont=document.getElementById('controls');
  cont.innerHTML='';

  const secV=Lab.Section('Visualizzazione');
  cont.appendChild(secV.el);
  secV.add(Lab.RadioGroup({
    label:'Vista',
    options:[
      {value:'packet',label:'Pacchetto d\'onda'},
      {value:'orbits',label:'Orbite permesse'},
      {value:'scale', label:'Confronto scala λ'},
    ],
    value:P.view, onChange(v){ P.view=v; },
  }));

  const secP=Lab.Section('Particella');
  cont.appendChild(secP.el);
  secP.add(Lab.RadioGroup({
    label:'Tipo',
    options: PART_KEYS.map(k=>({value:k,label:PARTICLES[k].name})),
    value:P.particle, onChange(v){ P.particle=v; },
  }));
  secP.add(Lab.Slider({
    label:'Velocità (log₁₀ m/s)', min:3, max:7.5, step:0.1, value:Math.log10(P.v), unit:'',
    onChange(v){ P.v=Math.pow(10,v); },
  }));

  const secO=Lab.Section('Orbite Permesse');
  cont.appendChild(secO.el);
  secO.add(Lab.Slider({
    label:'n (λ sull\'orbita)', min:1, max:8, step:0.1, value:P.orbitN, unit:'',
    onChange(v){ P.orbitN=v; },
  }));
}

// ═══ Graph panel ══════════════════════════════════════════════════════════════
function initGraphs() {
  // riga di grafici standard; i titoli sono disegnati dentro i grafici
  gCanvas = Lab.graphPanels(document.getElementById('graphArea'), 3);
  gCtx = gCanvas.map(c => c.getContext('2d'));
}

// ═══ Init ═════════════════════════════════════════════════════════════════════
function init(){
  Lab.initTheme();
  buildControls();
  initGraphs();

  const simCanvas=document.getElementById('simCanvas');
  readout=new Lab.Readout(document.getElementById('readout'),[
    {key:'lambda', label:'λ di de Broglie'},
    {key:'p',      label:'quantità di moto'},
    {key:'E',      label:'energia cinetica'},
    {key:'hint',   label:'velocità'},
  ]);

  document.getElementById('btnView').addEventListener('click',()=>{
    const cyc=['packet','orbits','scale'];
    P.view=cyc[(cyc.indexOf(P.view)+1)%3];
    buildControls();
  });
  document.getElementById('btnReset').addEventListener('click',()=>{
    P.particle='electron'; P.v=2e6; P.view='packet'; P.orbitN=4;
    t=0; buildControls();
  });

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
    const dt=Math.min((now-last)/1000,0.05); last=now;
    if(!paused) t+=dt;
    T=pal();
    draw(simCanvas);
    drawGraphs();
    readout.set('lambda', fmtLen(lambdaDB()));
    readout.set('p', Lab.sci(momentum(),3)+' kg·m/s');
    readout.set('E', Lab.eng(eKin()/eV,'eV',2));
    readout.set('hint', Lab.sci(P.v,3)+' m/s');
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

window.addEventListener('DOMContentLoaded', init);
