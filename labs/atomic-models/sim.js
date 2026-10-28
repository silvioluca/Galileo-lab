'use strict';

// ── Dati educativi dei modelli ─────────────────────────────────────────────────
const MODELS = {
  thomson: {
    name:      'Modello di Thomson',
    nickname:  '"Panettone" (plum-pudding)',
    physicist: 'Joseph John Thomson',
    info:      'britannico, 1856–1940 · Premio Nobel 1906',
    year:      1904,
    desc:      'Carica positiva distribuita uniformemente in una sfera, con elettroni incastonati come uvette nel panettone. Thomson aveva scoperto l\'elettrone nel 1897 ed elaborò questo modello per un atomo elettricamente neutro.',
    energy:    'Nessuna quantizzazione — energia classica continua; frequenze di oscillazione degli elettroni calcolabili ma non coincidono con le righe spettrali reali.',
    problems:  [
      'Non spiega l\'esperimento di Rutherford (1909): quasi tutta la massa è distribuita, non può deflettere le particelle α di quasi 180°.',
      'Non prevede le righe spettrali discrete osservate per l\'idrogeno.',
      'Non ha principio organizzativo per la struttura del sistema periodico.',
    ],
  },
  rutherford: {
    name:      'Modello di Rutherford',
    nickname:  'Modello Planetario',
    physicist: 'Ernest Rutherford',
    info:      'neozelandese, 1871–1937 · Premio Nobel 1908',
    year:      1911,
    desc:      'Il nucleo denso e positivo occupa al massimo 10⁻¹⁴ m (quasi tutto il volume è vuoto), gli elettroni orbitano attorno come pianeti. Dedotto dall\'esperimento di Geiger–Marsden sul foglio d\'oro.',
    energy:    'E = −e² / (2r)  (classica, orbita circolare) — ma dipende da r e varia con continuità: nessuna quantizzazione.',
    problems:  [
      'Un elettrone che orbita è un\'accelerazione centripeta → per Maxwell irradia energia EM → dovrebbe spiralare nel nucleo in ~10⁻⁸ s.',
      'Non spiega le righe spettrali discrete (Balmer, Lyman, Paschen).',
      'Non spiega la stabilità degli atomi.',
    ],
  },
  bohr: {
    name:      'Modello di Bohr',
    nickname:  'Orbite quantizzate',
    physicist: 'Niels Henrik David Bohr',
    info:      'danese, 1885–1962 · Premio Nobel 1922',
    year:      1913,
    desc:      'Solo orbite con momento angolare L = nℏ sono permesse. L\'elettrone non irradia mentre orbita; emette o assorbe un fotone solo nel salto tra due livelli. Spiega perfettamente lo spettro dell\'idrogeno.',
    energy:    'Eₙ = −13.6 eV / n²   (n = 1, 2, 3, …)\nE₁ = −13.6 eV · E₂ = −3.4 eV · E₃ = −1.51 eV\nΔE = hν = 13.6 eV (1/n_f² − 1/n_i²)',
    problems:  [
      'Funziona solo per sistemi idrogenoidi (H, He⁺, Li²⁺…). Fallisce per atomi multi-elettronici.',
      'Viola il Principio di Indeterminazione di Heisenberg (orbita precisa = p e x noti simultaneamente).',
      'Non spiega la struttura fine (effetti relativistici, spin) né l\'intensità delle righe spettrali.',
      'Postulato ad hoc: non deriva la quantizzazione da principi più fondamentali.',
    ],
  },
  quantum: {
    name:      'Modello Quantomeccanico',
    nickname:  'Orbitali di Schrödinger',
    physicist: 'Erwin Rudolf Josef Alexander Schrödinger',
    info:      'austriaco, 1887–1961 · Premio Nobel 1933',
    year:      1926,
    desc:      'L\'elettrone è descritto da una funzione d\'onda ψ(r,θ,φ). L\'orbitale è la regione dove |ψ|² > soglia. I numeri quantici n (principale), l (azimutale), mₗ (magnetico) e mₛ (spin) descrivono completamente ogni stato elettronico.',
    energy:    'Hψ = Eψ  (equazione di Schrödinger)\nEₙ = −13.6 eV / n²  (idrogeno, stesso di Bohr per la degenerazione l)\nNumeri quantici: n ≥ 1, 0 ≤ l < n, −l ≤ mₗ ≤ l, mₛ = ±½',
    problems:  [
      'Non relativistica: corretta dall\'equazione di Dirac (1928) che include spin e struttura fine.',
      'Risoluzione esatta impossibile per più di 1 elettrone → metodi approssimati (Hartree-Fock, DFT).',
      'L\'interpretazione di Copenhagen di |ψ|² come probabilità è ancora oggetto di dibattito filosofico.',
    ],
  },
};

// ── Stato globale ──────────────────────────────────────────────────────────────
let currentModel = 'thomson';
let paused = false;
let t = 0;   // tempo animazione

// Thomson — elettroni che rimbalzano nella sfera
const TH_N = 8;
const thElec = Array.from({length: TH_N}, (_, i) => {
  const a = (i / TH_N) * Math.PI * 2;
  const r = 0.35 + Math.random() * 0.25;
  return { x: r*Math.cos(a), y: r*Math.sin(a), vx: (Math.random()-0.5)*0.4, vy: (Math.random()-0.5)*0.4 };
});

// Rutherford — elettroni che orbitano
const RU_ORBITS = [
  { r: 0.30, speed: 2.8, angle: 0,    color: '#00d4ff' },
  { r: 0.52, speed: 1.5, angle: Math.PI*0.6, color: '#66ffcc' },
  { r: 0.72, speed: 0.9, angle: Math.PI*1.3, color: '#ff9944' },
];
let ruElec = RU_ORBITS.map(o => ({ ...o }));
let ruSpiral = false;  // mostra instabilità classica
let ruSpiralT = 0;

// Bohr — elettrone che salta tra livelli
const BOHR_N = 6;
let bohrLevel = 1;          // livello corrente (1–6)
let bohrTarget = 1;         // livello destinazione
let bohrJumping = false;
let bohrAngle = 0;
const bohrPhotons = [];     // {x,y, r,dr, color, alpha}

// Quantum — orbitale selezionato
let qN = 1, qL = 0, qM = 0;
const qOffscreen = document.createElement('canvas');
qOffscreen.width = 400; qOffscreen.height = 400;
const qOffCtx = qOffscreen.getContext('2d');
let qDirty = true;   // ricalcola quando cambiano n,l,m

// Grafici
let gCanvas = [null, null, null];
let gCtx    = [null, null, null];

// ── Fisica Bohr ────────────────────────────────────────────────────────────────
const RYDBERG = 13.6;    // eV

function bohrEnergy(n) { return -RYDBERG / (n * n); }

function transitionWavelength(ni, nf) {
  if (ni <= nf) return null;
  const RH = 1.097e7;
  return 1e9 / (RH * (1/(nf*nf) - 1/(ni*ni)));
}

function nmToRgb(lambda) {
  if (!lambda || lambda < 380) return [148, 0, 255];
  if (lambda < 440) { const t=(lambda-380)/60; return [Math.round(148*t),0,255]; }
  if (lambda < 490) { const t=(lambda-440)/50; return [0,Math.round(t*255),255]; }
  if (lambda < 570) { const t=(lambda-490)/80; return [Math.round(t*255),255,Math.round(255*(1-t))]; }
  if (lambda < 625) { const t=(lambda-570)/55; return [255,Math.round(255*(1-t)),0]; }
  if (lambda < 750) return [255,0,0];
  return [139,0,0];
}

// ── Quantum |ψ|² ──────────────────────────────────────────────────────────────
function psi2(n, l, mAbs, r, theta) {
  if (r < 0.01) r = 0.01;
  // Funzioni radiali in unità di a₀
  let R;
  if      (n===1 && l===0) R = 2*Math.exp(-r);
  else if (n===2 && l===0) R = 1/(2*Math.SQRT2)*(2-r)*Math.exp(-r/2);
  else if (n===2 && l===1) R = 1/(2*Math.sqrt(6))*r*Math.exp(-r/2);
  else if (n===3 && l===0) R = 2/(81*Math.sqrt(3))*(27-18*r+2*r*r)*Math.exp(-r/3);
  else if (n===3 && l===1) R = 8/(27*Math.sqrt(6))*(6-r)*r*Math.exp(-r/3);
  else if (n===3 && l===2) R = 4/(81*Math.sqrt(30))*r*r*Math.exp(-r/3);
  else return 0;

  // Armoniche sferiche reali |Y_l^m(θ,φ=0)|²  (sezione xz)
  const c=Math.cos(theta), s=Math.sin(theta);
  let Y2;
  if      (l===0)             Y2 = 1/(4*Math.PI);
  else if (l===1 && mAbs===0) Y2 = 3/(4*Math.PI)*c*c;
  else if (l===1 && mAbs===1) Y2 = 3/(8*Math.PI)*s*s;
  else if (l===2 && mAbs===0) Y2 = 5/(16*Math.PI)*(3*c*c-1)*(3*c*c-1);
  else if (l===2 && mAbs===1) Y2 = 15/(8*Math.PI)*s*s*c*c;
  else if (l===2 && mAbs===2) Y2 = 15/(32*Math.PI)*s*s*s*s;
  else Y2 = 0;

  return R*R*Y2;
}

function renderOrbital() {
  const W=qOffscreen.width, H=qOffscreen.height;
  const cx=W/2, cy=H/2;
  const maxR = qN*qN*5.5 + 3;   // Bohr radii shown
  const scale = (W*0.46) / maxR;
  const img = qOffCtx.createImageData(W, H);
  const d = img.data;

  // Prima passata: calcola valori e trova il massimo
  const vals = new Float32Array(W*H);
  let maxV = 0;
  for (let py=0;py<H;py++) {
    for (let px=0;px<W;px++) {
      const x=(px-cx)/scale, z=-(py-cy)/scale;
      const r=Math.sqrt(x*x+z*z);
      const theta=Math.atan2(x,z);
      const v=psi2(qN,qL,Math.abs(qM),r,theta);
      vals[py*W+px]=v;
      if(v>maxV) maxV=v;
    }
  }
  if(maxV<1e-30){qOffCtx.clearRect(0,0,W,H);return;}

  // Seconda passata: colora
  for (let i=0;i<W*H;i++){
    const t=Math.pow(vals[i]/maxV, 0.38);
    const off=i*4;
    d[off]  =Math.round(t*80);
    d[off+1]=Math.round(t*190);
    d[off+2]=255;
    d[off+3]=Math.round(t*255);
  }
  qOffCtx.clearRect(0,0,W,H);
  qOffCtx.putImageData(img,0,0);
  qDirty=false;
}

// ── Loop fisico ────────────────────────────────────────────────────────────────
function update(dt) {
  if (paused) return;
  t += dt;

  if (currentModel==='thomson') {
    for (const e of thElec) {
      e.x += e.vx*dt; e.y += e.vy*dt;
      const r=Math.sqrt(e.x*e.x+e.y*e.y);
      if(r>0.72){ const nx=e.x/r,ny=e.y/r; e.x=0.72*nx; e.y=0.72*ny; const dot=e.vx*nx+e.vy*ny; e.vx-=2*dot*nx; e.vy-=2*dot*ny; }
    }
  }

  if (currentModel==='rutherford') {
    for (const e of ruElec) {
      if (ruSpiral) {
        ruSpiralT += dt;
        e.r = Math.max(0.01, e.r - dt * 0.03);
        e.speed += dt * 2;
      }
      e.angle += e.speed * dt;
    }
  }

  if (currentModel==='bohr') {
    bohrAngle += (3.5 / Math.pow(bohrLevel, 1.5)) * dt;

    // Aggiorna fotoni
    for (let i=bohrPhotons.length-1;i>=0;i--) {
      const ph=bohrPhotons[i];
      ph.r+=ph.dr*dt;
      ph.alpha-=0.55*dt;
      if(ph.alpha<=0) bohrPhotons.splice(i,1);
    }

    // Salto in corso
    if(bohrJumping && bohrLevel!==bohrTarget){
      // Emetti fotone se scende
      if(bohrLevel>bohrTarget){
        const lambda=transitionWavelength(bohrLevel,bohrTarget);
        const [r,g,b]=nmToRgb(lambda);
        bohrPhotons.push({x:0,y:0,r:0.01,dr:0.45,color:`rgb(${r},${g},${b})`,alpha:1.0});
      }
      bohrLevel=bohrTarget;
      bohrJumping=false;
    }
  }
}

// ── Rendering canvas principale ────────────────────────────────────────────────
function draw(canvas) {
  const [ctx, W, H] = Lab.ctx2d(canvas);
  const cx=W/2, cy=H/2;
  const R=Math.min(W,H)*0.40;  // raggio di riferimento

  ctx.fillStyle='#06090f';
  ctx.fillRect(0,0,W,H);

  if      (currentModel==='thomson')    drawThomson(ctx,cx,cy,R);
  else if (currentModel==='rutherford') drawRutherford(ctx,cx,cy,R);
  else if (currentModel==='bohr')       drawBohr(ctx,cx,cy,R);
  else if (currentModel==='quantum')    drawQuantum(ctx,cx,cy,R,W,H);
}

// ── Thomson ────────────────────────────────────────────────────────────────────
function drawThomson(ctx,cx,cy,R) {
  // Sfera di carica positiva
  const grad=ctx.createRadialGradient(cx,cy,0,cx,cy,R*0.9);
  grad.addColorStop(0,'rgba(255,160,30,0.18)');
  grad.addColorStop(0.7,'rgba(255,100,10,0.10)');
  grad.addColorStop(1,'rgba(255,60,0,0.04)');
  ctx.fillStyle=grad;
  ctx.beginPath(); ctx.arc(cx,cy,R*0.9,0,Math.PI*2); ctx.fill();

  // Bordo sfera
  ctx.strokeStyle='rgba(255,140,40,0.35)';
  ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.arc(cx,cy,R*0.9,0,Math.PI*2); ctx.stroke();

  // Label carica positiva
  ctx.fillStyle='rgba(255,160,60,0.60)';
  ctx.font='11px "Space Mono",monospace';
  ctx.fillText('carica + uniforme',cx-70,cy+R*0.62);

  // Elettroni
  for (const e of thElec) {
    const px=cx+e.x*R, py=cy+e.y*R;
    const eg=ctx.createRadialGradient(px,py,0,px,py,6);
    eg.addColorStop(0,'rgba(200,230,255,1)');
    eg.addColorStop(1,'rgba(100,180,255,0)');
    ctx.fillStyle=eg;
    ctx.beginPath(); ctx.arc(px,py,6,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#e0f0ff';
    ctx.beginPath(); ctx.arc(px,py,2.5,0,Math.PI*2); ctx.fill();
  }

  // Label e-
  ctx.fillStyle='rgba(180,220,255,0.75)';
  ctx.font='10px "Space Mono",monospace';
  ctx.fillText('e⁻',cx+thElec[0].x*R+5,cy+thElec[0].y*R-4);
}

// ── Rutherford ─────────────────────────────────────────────────────────────────
function drawRutherford(ctx,cx,cy,R) {
  // Orbite
  for (const e of ruElec) {
    ctx.strokeStyle=e.color.replace(')',',0.20)').replace('rgb','rgba');
    ctx.lineWidth=0.8;
    ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.arc(cx,cy,e.r*R,0,Math.PI*2); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Nucleo
  const nucleons=[
    {x:-4,y:-3,c:'#ff4444'},{x:4,y:-2,c:'#ff6633'},{x:0,y:4,c:'#ff4444'},
    {x:-2,y:2,c:'#aabbcc'},{x:3,y:3,c:'#aabbcc'},
  ];
  for (const n of nucleons) {
    ctx.fillStyle=n.c;
    ctx.beginPath(); ctx.arc(cx+n.x,cy+n.y,5,0,Math.PI*2); ctx.fill();
  }
  const ng=ctx.createRadialGradient(cx,cy,0,cx,cy,12);
  ng.addColorStop(0,'rgba(255,100,30,0.55)');
  ng.addColorStop(1,'rgba(255,60,0,0)');
  ctx.fillStyle=ng;
  ctx.beginPath(); ctx.arc(cx,cy,12,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='rgba(255,220,180,0.80)';
  ctx.font='9px "Space Mono",monospace';
  ctx.fillText('nucleo',cx+12,cy-8);

  // Elettroni
  for (const e of ruElec) {
    const px=cx+Math.cos(e.angle)*e.r*R;
    const py=cy+Math.sin(e.angle)*e.r*R;
    const eg=ctx.createRadialGradient(px,py,0,px,py,7);
    eg.addColorStop(0,e.color);
    eg.addColorStop(1,e.color.replace(')',',0)').replace('rgb','rgba'));
    ctx.fillStyle=eg;
    ctx.beginPath(); ctx.arc(px,py,7,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#ffffff';
    ctx.beginPath(); ctx.arc(px,py,2.5,0,Math.PI*2); ctx.fill();
  }

  // Warning instabilità
  if (ruSpiral) {
    ctx.fillStyle='rgba(255,80,60,0.85)';
    ctx.font='bold 11px "DM Sans",sans-serif';
    ctx.fillText('⚠ Instabilità classica: e⁻ irradia e spirala!',cx-155,cy+R*0.88);
  }
}

// ── Bohr ───────────────────────────────────────────────────────────────────────
function drawBohr(ctx,cx,cy,R) {
  const ORBIT_SCALE = [0,0.15,0.28,0.42,0.56,0.70,0.86];
  const ORBIT_COLORS=['','#ff6644','#ff9922','#aaee33','#33ccff','#8855ff','#ff55cc'];

  // Fotoni
  for (const ph of bohrPhotons) {
    ctx.save();
    ctx.globalAlpha=Math.max(0,ph.alpha);
    const pr=ph.r*R;
    const pg=ctx.createRadialGradient(cx,cy,pr*0.7,cx,cy,pr);
    pg.addColorStop(0,ph.color.replace('rgb','rgba').replace(')',',0)'));
    pg.addColorStop(0.5,ph.color.replace('rgb','rgba').replace(')',`,${ph.alpha*0.5})`));
    pg.addColorStop(1,ph.color.replace('rgb','rgba').replace(')',',0)'));
    ctx.strokeStyle=ph.color;
    ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.arc(cx,cy,pr,0,Math.PI*2); ctx.stroke();
    ctx.restore();
  }

  // Orbite e label energie
  for (let n=1;n<=BOHR_N;n++) {
    const or=ORBIT_SCALE[n]*R;
    const active=(n===bohrLevel);
    ctx.strokeStyle=active
      ? ORBIT_COLORS[n]
      : ORBIT_COLORS[n].replace(')',',0.22)').replace('rgb','rgba').replace('#','');
    if(!active){ctx.strokeStyle='rgba(120,140,180,0.22)';}
    ctx.lineWidth=active?1.8:0.7;
    ctx.beginPath(); ctx.arc(cx,cy,or,0,Math.PI*2); ctx.stroke();

    // Label En
    const E=Lab.fmt(bohrEnergy(n),2);
    ctx.fillStyle=active?ORBIT_COLORS[n]:'rgba(140,165,200,0.55)';
    ctx.font=`${active?'bold ':''} 9px "Space Mono",monospace`;
    ctx.fillText(`n=${n}  ${E} eV`,cx+or+4,cy-3);
  }

  // Nucleo (protone)
  const ng=ctx.createRadialGradient(cx,cy,0,cx,cy,10);
  ng.addColorStop(0,'rgba(255,100,40,1)');
  ng.addColorStop(1,'rgba(255,50,0,0)');
  ctx.fillStyle=ng;
  ctx.beginPath(); ctx.arc(cx,cy,10,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#ffddcc';
  ctx.font='9px "Space Mono",monospace';
  ctx.fillText('p⁺',cx+11,cy+4);

  // Elettrone
  const er=ORBIT_SCALE[bohrLevel]*R;
  const ex=cx+Math.cos(bohrAngle)*er, ey=cy+Math.sin(bohrAngle)*er;
  const ec=ORBIT_COLORS[bohrLevel];
  const eg=ctx.createRadialGradient(ex,ey,0,ex,ey,9);
  eg.addColorStop(0,ec);
  eg.addColorStop(1,ec.replace(')',',0)').replace('rgb','rgba'));
  ctx.fillStyle=eg;
  ctx.beginPath(); ctx.arc(ex,ey,9,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#ffffff';
  ctx.beginPath(); ctx.arc(ex,ey,3,0,Math.PI*2); ctx.fill();

  // Hint interazione
  ctx.fillStyle='rgba(150,190,210,0.50)';
  ctx.font='9px "Space Mono",monospace';
  ctx.fillText('clicca su un\'orbita per eccitare l\'e⁻',cx-140,cy+R*0.96);
}

// ── Quantum ───────────────────────────────────────────────────────────────────
function drawQuantum(ctx,cx,cy,R,W,H) {
  if (qDirty) renderOrbital();

  // Disegna la nuvola di probabilità
  const size=R*2.1;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx,cy,R*1.05,0,Math.PI*2); ctx.clip();
  ctx.drawImage(qOffscreen,cx-size/2,cy-size/2,size,size);
  ctx.restore();

  // Bordo
  ctx.strokeStyle='rgba(100,150,200,0.20)';
  ctx.lineWidth=1;
  ctx.beginPath(); ctx.arc(cx,cy,R*1.05,0,Math.PI*2); ctx.stroke();

  // Label quantistica
  const orbitLabel = ['s','p','d','f'];
  const label=`${qN}${orbitLabel[qL]}${qM!==0?` m=${qM>0?'+':''}${qM}`:''}`;
  ctx.fillStyle='rgba(0,220,255,0.85)';
  ctx.font='bold 14px "Space Mono",monospace';
  ctx.fillText(`Orbitale ${label}`,cx-50,cy-R*0.88);

  // Assi di riferimento
  ctx.save(); ctx.globalAlpha=0.25; ctx.strokeStyle='#aabbcc'; ctx.lineWidth=0.6;
  ctx.setLineDash([3,5]);
  ctx.beginPath(); ctx.moveTo(cx-R,cy); ctx.lineTo(cx+R,cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx,cy-R); ctx.lineTo(cx,cy+R); ctx.stroke();
  ctx.fillStyle='rgba(180,200,220,0.60)'; ctx.font='10px "Space Mono",monospace';
  ctx.fillText('x',cx+R-10,cy-5); ctx.fillText('z',cx+5,cy-R+12);
  ctx.restore();
}

// ── Grafici ────────────────────────────────────────────────────────────────────
const GC='rgba(150,205,225,0.88)';

// 1: livelli energetici dell'idrogeno E_n = −13,6 eV / n² (evidenziato il livello del modello di Bohr)
function drawEnergyLevels() {
  const COLORS=['','#ff6644','#ff9922','#aaee33','#33ccff','#8855ff','#ff55cc'];
  const g=Lab.panel(gCanvas[0],{ title:'Livelli energetici dell’idrogeno (eV)', xr:[0,1], xStep:1e9, xFmt:()=> '', yr:[-14,0], yStep:2 });
  if(!g) return; const [ctx,f]=g;
  ctx.save(); ctx.setLineDash([3,3]); ctx.strokeStyle=f.C.text; ctx.beginPath(); ctx.moveTo(f.L,f.Y(0)); ctx.lineTo(f.R,f.Y(0)); ctx.stroke(); ctx.restore();
  for(let n=1;n<=6;n++){
    const E=bohrEnergy(n), on=n===bohrLevel&&currentModel==='bohr';
    ctx.strokeStyle=on?COLORS[n]:f.C.text; ctx.lineWidth=on?2.5:1.2; ctx.globalAlpha=on?1:0.7;
    ctx.beginPath(); ctx.moveTo(f.X(0.05),f.Y(E)); ctx.lineTo(f.X(0.7),f.Y(E)); ctx.stroke(); ctx.globalAlpha=1;
    if(n<=3||on){ ctx.fillStyle=on?COLORS[n]:f.C.text; ctx.font='9.5px "DM Sans",sans-serif'; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText(`n = ${n}`,f.X(0.74),f.Y(E)); }
  }
  ctx.fillStyle=f.C.text; ctx.font='9.5px "DM Sans",sans-serif'; ctx.textAlign='right'; ctx.textBaseline='top'; ctx.fillText('E = 0: elettrone libero',f.R-4,f.Y(0)+2);
}
// 2: righe di Balmer (transizioni verso n = 2) nel visibile
function drawEmissionSpectrum() {
  const g=Lab.panel(gCanvas[1],{ title:'Spettro di emissione: serie di Balmer (n → 2)', xr:[380,750], xStep:50, yr:[0,1], yStep:1e9, yFmt:()=> '', xLabel:'λ (nm)', padL:14 });
  if(!g) return; const [ctx,f]=g;
  ctx.fillStyle='#04060c'; ctx.fillRect(f.L,f.T,f.R-f.L,f.B-f.T);
  for(let ni=3;ni<=7;ni++){
    const lambda=transitionWavelength(ni,2); if(!lambda) continue;
    const [r,gg,b]=nmToRgb(lambda), x=f.X(lambda);
    ctx.strokeStyle=`rgb(${r},${gg},${b})`; ctx.lineWidth=2.5; ctx.beginPath(); ctx.moveTo(x,f.T+16); ctx.lineTo(x,f.B); ctx.stroke();
    ctx.fillStyle=`rgb(${r},${gg},${b})`; ctx.font='9px "Space Mono",monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
    if(ni<=5) ctx.fillText(Lab.fmt(lambda,0),x,f.T+8);
  }
}
// 3: densità di probabilità radiale P(r) = r²·|R_nl|², con il raggio di Bohr n²·a₀
function drawRadialDensity() {
  const maxR=qN*qN*8+4, N=240, R=r=>{
    if(qN===1&&qL===0) return 2*Math.exp(-r);
    if(qN===2&&qL===0) return 1/(2*Math.SQRT2)*(2-r)*Math.exp(-r/2);
    if(qN===2&&qL===1) return 1/(2*Math.sqrt(6))*r*Math.exp(-r/2);
    if(qN===3&&qL===0) return 2/(81*Math.sqrt(3))*(27-18*r+2*r*r)*Math.exp(-r/3);
    if(qN===3&&qL===1) return 8/(27*Math.sqrt(6))*(1-r/6)*r*Math.exp(-r/3);
    if(qN===3&&qL===2) return 4/(81*Math.sqrt(30))*r*r*Math.exp(-r/3);
    return 0; };
  let mx=0; for(let i=1;i<=N;i++){ const r=i/N*maxR; mx=Math.max(mx,r*r*R(r)**2); }
  const g=Lab.panel(gCanvas[2],{ title:`Densità radiale P(r) = r²·|R|² (n = ${qN}, l = ${qL})`, xr:[0,maxR], yr:[0,1.1], yStep:0.25, yFmt:v=>Lab.fmt(v,2), xLabel:'r (raggi di Bohr a₀)' });
  if(!g||!(mx>0)) return; const [ctx,f]=g;
  ctx.save(); ctx.setLineDash([3,3]); ctx.strokeStyle=f.C.amber; ctx.beginPath(); ctx.moveTo(f.X(qN*qN),f.T); ctx.lineTo(f.X(qN*qN),f.B); ctx.stroke(); ctx.restore();
  Lab.plot(ctx,f,r=>r*r*R(r)**2/mx,[0,maxR],'rgba(0,210,255,0.95)',2,[],300);
  ctx.fillStyle=f.C.amber; ctx.font='9.5px "DM Sans",sans-serif'; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText(`Bohr: r = n²·a₀ = ${qN*qN} a₀`,f.X(qN*qN)+4,f.T+8);
}

function drawGraphs() {
  drawEnergyLevels(); drawEmissionSpectrum(); drawRadialDensity();
}

// ── Info card ─────────────────────────────────────────────────────────────────
function renderInfoCard() {
  const m=MODELS[currentModel];
  const el=document.getElementById('infoCard');
  const problems=m.problems.map(p=>`<li style="margin-bottom:5px">${p}</li>`).join('');
  el.innerHTML=`
<div style="padding:10px 8px 14px;border-top:1px solid rgba(100,200,255,0.15);margin-top:10px;">
  <div style="font-family:'Space Mono',monospace;font-size:9px;color:#00d4ff;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">INFO MODELLO</div>
  <div style="font-family:'DM Sans',sans-serif;font-size:12px;color:var(--text-primary);line-height:1.6;">
    <div style="margin-bottom:4px"><strong>${m.name}</strong> — <em>${m.nickname}</em></div>
    <div style="color:rgba(0,210,255,0.80);margin-bottom:2px">👤 ${m.physicist}</div>
    <div style="color:var(--text-secondary);font-size:11px;margin-bottom:2px">${m.info}</div>
    <div style="color:rgba(255,200,80,0.80);margin-bottom:6px">📅 ${m.year}</div>
    <div style="margin-bottom:8px;color:var(--text-secondary);font-size:11px;line-height:1.5">${m.desc}</div>
    <div style="background:var(--bg2);border-left:2px solid rgba(0,200,255,0.40);padding:6px 8px;border-radius:3px;font-family:'Space Mono',monospace;font-size:9px;color:var(--text-primary);margin-bottom:8px;white-space:pre-wrap">${m.energy}</div>
    <div style="font-size:10px;color:rgba(255,120,80,0.80);margin-bottom:4px;font-weight:600">⚠ Limiti del modello:</div>
    <ul style="margin:0;padding-left:14px;font-size:11px;color:var(--text-secondary);line-height:1.5">${problems}</ul>
  </div>
</div>`;
}

// ── Controlli ──────────────────────────────────────────────────────────────────
function buildControls() {
  const cont=document.getElementById('controls');
  cont.innerHTML='';

  const secM=Lab.Section('Modello Atomico');
  cont.appendChild(secM.el);
  secM.add(Lab.RadioGroup({
    label:'Seleziona modello',
    options:[
      {value:'thomson',    label:'Thomson 1904',    hint:'panettone'},
      {value:'rutherford', label:'Rutherford 1911',  hint:'planetario'},
      {value:'bohr',       label:'Bohr 1913',        hint:'orbite quantizzate'},
      {value:'quantum',    label:'Schrödinger 1926', hint:'orbitali'},
    ],
    value: currentModel,
    onChange(v){ currentModel=v; renderInfoCard(); rebuildModelControls(); },
  }));

  rebuildModelControls();
  renderInfoCard();
}

let modelControlsEl = null;

function rebuildModelControls() {
  if (modelControlsEl) modelControlsEl.remove();
  const cont=document.getElementById('controls');

  if (currentModel==='rutherford') {
    const sec=Lab.Section('Instabilità Classica');
    cont.appendChild(sec.el);
    sec.add(Lab.Toggle({
      label:'Mostra spirale (perdita E per irradiazione)',
      value: ruSpiral,
      onChange(v){ ruSpiral=v; ruSpiralT=0; if(!v){ ruElec=RU_ORBITS.map(o=>({...o})); } },
    }));
    modelControlsEl=sec.el;
  }

  else if (currentModel==='bohr') {
    const sec=Lab.Section('Livello Energetico');
    cont.appendChild(sec.el);
    sec.add(Lab.Slider({
      label:'n (livello)', min:1, max:6, step:1, value:bohrLevel, unit:'',
      onChange(v){
        bohrTarget=v;
        if(bohrTarget!==bohrLevel) bohrJumping=true;
      },
    }));
    modelControlsEl=sec.el;
  }

  else if (currentModel==='quantum') {
    const sec=Lab.Section('Numeri Quantici');
    cont.appendChild(sec.el);
    sec.add(Lab.Slider({
      label:'n (principale)', min:1, max:3, step:1, value:qN, unit:'',
      onChange(v){ qN=v; qL=Math.min(qL,qN-1); qM=Math.min(qL,Math.abs(qM))*Math.sign(qM||1); qDirty=true; rebuildModelControls(); },
    }));
    sec.add(Lab.Slider({
      label:'l (azimutale)', min:0, max:qN-1, step:1, value:qL, unit:'',
      onChange(v){ qL=v; qM=Math.max(-qL,Math.min(qL,qM)); qDirty=true; rebuildModelControls(); },
    }));
    sec.add(Lab.Slider({
      label:'mₗ (magnetico)', min:-qL, max:qL, step:1, value:qM, unit:'',
      onChange(v){ qM=v; qDirty=true; },
    }));
    modelControlsEl=sec.el;
  }
}

// ── Interazione canvas (Bohr: click su orbita) ─────────────────────────────────
function initCanvasInteraction(canvas) {
  canvas.addEventListener('click', e=>{
    if(currentModel!=='bohr') return;
    const r=canvas.getBoundingClientRect();
    const px=e.clientX-r.left-r.width/2, py=e.clientY-r.top-r.height/2;
    const dist=Math.sqrt(px*px+py*py);
    const R=Math.min(r.width,r.height)*0.40;
    const SCALES=[0,0.15,0.28,0.42,0.56,0.70,0.86];
    for(let n=1;n<=BOHR_N;n++){
      const orR=SCALES[n]*R;
      if(Math.abs(dist-orR)<12){
        if(n!==bohrLevel){ bohrTarget=n; bohrJumping=true; }
        break;
      }
    }
  });
}

// ── Graph panel setup ──────────────────────────────────────────────────────────
function initGraphs() {
  // riga di grafici standard; i titoli sono disegnati dentro i grafici
  gCanvas = Lab.graphPanels(document.getElementById('graphArea'), 3);
  gCtx = gCanvas.map(c => c.getContext('2d'));
}

// ── Init ───────────────────────────────────────────────────────────────────────
let readout;

function init() {
  Lab.initTheme();
  buildControls();
  initGraphs();

  const simCanvas=document.getElementById('simCanvas');
  readout=new Lab.Readout(document.getElementById('readout'),[
    {key:'model', label:'modello'},
    {key:'year',  label:'anno'},
    {key:'phys',  label:'fisico'},
    {key:'hint',  label:'stato'},
  ]);

  function updateReadout(){
    const m=MODELS[currentModel];
    readout.set('model', m.name);
    readout.set('year',  String(m.year));
    readout.set('phys',  m.physicist);
    if(currentModel==='bohr')
      readout.set('hint',`E${bohrLevel} = ${Lab.fmt(bohrEnergy(bohrLevel),2)} eV`);
    else if(currentModel==='quantum')
      readout.set('hint',`n=${qN}  l=${qL}  mₗ=${qM}`);
    else
      readout.set('hint','');
  }

  document.getElementById('btnPlay').addEventListener('click',()=>{
    paused=!paused;
    document.getElementById('btnPlay').textContent=paused?'▶  PLAY':'⏸  PAUSA';
  });
  document.getElementById('btnReset').addEventListener('click',()=>{
    t=0; ruSpiral=false; ruSpiralT=0;
    ruElec=RU_ORBITS.map(o=>({...o}));
    bohrLevel=1; bohrTarget=1; bohrJumping=false; bohrAngle=0;
    bohrPhotons.length=0;
    qN=1; qL=0; qM=0; qDirty=true;
    paused=false;
    document.getElementById('btnPlay').textContent='⏸  PAUSA';
    rebuildModelControls();
  });

  initCanvasInteraction(simCanvas);

  function resize(){
    const area=document.querySelector('.lab-canvas-area');
    if(!area)return;
    const ar=area.getBoundingClientRect();
    const rb=document.getElementById('readout').getBoundingClientRect();
    const ga=document.getElementById('graphArea');
    const gaH=ga?ga.offsetHeight:0;
    Lab.hidpi(simCanvas, Math.floor(ar.width), Math.max(60,Math.floor(ar.height-rb.height-gaH-4)));
    Lab.fitPanels(gCanvas);
  }
  resize();
  new ResizeObserver(resize).observe(document.querySelector('.lab-canvas-area'));

  let last=performance.now();
  function frame(now){
    const dt=Math.min((now-last)/1000,0.05); last=now;
    update(dt);
    draw(simCanvas);
    drawGraphs();
    updateReadout();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

window.addEventListener('DOMContentLoaded', init);
