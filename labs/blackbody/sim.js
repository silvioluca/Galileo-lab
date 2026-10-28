'use strict';

// ═══ Costanti fisiche (SI) ══════════════════════════════════════════════════
const TWO = Math.PI * 2;
const H_PLANCK = 6.62607015e-34;                                 // J·s
const C_LIGHT = 2.99792458e8;                                     // m/s
const K_BOLTZ = 1.380649e-23;                                     // J/K
const WIEN_B = 2.897771955e-3;                                    // m·K, legge dello spostamento di Wien
const SIGMA_SB = 5.670374419e-8;                                  // W/(m²·K⁴), costante di Stefan-Boltzmann

const P = {
  T: 5772,                  // K — temperatura del corpo (5772 K = fotosfera del Sole, valore di riferimento riconoscibile)
  epsilon: 1.0,              // emissività (1 = corpo nero ideale)
  mode: 'compare',           // 'quantum' | 'classical' | 'compare'
  speed: 1.0,
  paused: false,
};
let dispT = P.T, dispEps = P.epsilon;                              // valori "smussati" per una transizione visiva morbida, non un salto istantaneo

let animT = 0, last = 0;
let hist = [];
let G = {};
let gCanvas = [null, null, null], gCtx = [null, null, null], gTitle = [null, null, null];
let readout;

// ═══ Palette ══════════════════════════════════════════════════════════════════
function dk() { return document.documentElement.dataset.theme !== 'light'; }
function pal() {
  const d = dk();
  return {
    bg: d ? '#06090f' : '#e7edf4', txt: d ? 'rgba(225,238,250,0.96)' : 'rgba(20,40,70,0.95)',
    sub: d ? 'rgba(165,195,220,0.82)' : 'rgba(60,90,125,0.9)', accent: d ? '#00d4ff' : '#0a78b0',
    ring: d ? 'rgba(150,175,205,0.4)' : 'rgba(60,95,130,0.45)', grid: d ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
    gBg: d ? 'rgb(3,9,22)' : '#eef2f7', gAxis: d ? 'rgba(100,155,210,0.3)' : 'rgba(40,80,130,0.32)', gText: d ? 'rgba(150,205,225,0.88)' : 'rgba(25,65,105,0.92)',
  };
}
let T = pal();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const fmtNm = (nm) => nm >= 10000 ? Lab.fmt((nm / 1000),1) + ' µm' : Lab.fmt(nm,0) + ' nm';

// ═══ Fisica ═══════════════════════════════════════════════════════════════════
// Planck (quantistica, corretta): la quantizzazione dell'energia (E=nhν) fa sì che i modi ad alta
// frequenza abbiano bisogno di un quanto hν troppo grande per essere eccitati termicamente — il
// fattore di Boltzmann e^(hc/λkT) nel denominatore soffoca la curva a piccole λ.
function planckB(lambda, Tk) {                                    // lambda in metri → W·sr⁻¹·m⁻³
  const x = H_PLANCK * C_LIGHT / (lambda * K_BOLTZ * Tk);
  if (x > 700) return 0;                                           // e^x andrebbe in overflow; il valore vero è comunque trascurabile
  return (2 * H_PLANCK * C_LIGHT * C_LIGHT / Math.pow(lambda, 5)) / (Math.exp(x) - 1);
}
// Rayleigh-Jeans (classica): dal teorema di equipartizione, ogni modo ha energia media kT
// indipendentemente dalla frequenza — nessun meccanismo la impedisce di crescere senza limite a
// piccole λ. Diverge come 1/λ⁴: è la "catastrofe ultravioletta" che la fisica classica non riusciva
// a evitare, risolta storicamente proprio dall'ipotesi dei quanti di Planck (1900).
function rayleighJeansB(lambda, Tk) { return 2 * C_LIGHT * K_BOLTZ * Tk / Math.pow(lambda, 4); }
function wienPeakLambda(Tk) { return WIEN_B / Tk; }                // m
function stefanBoltzmannP(Tk, eps) { return eps * SIGMA_SB * Math.pow(Tk, 4); }  // W/m²

// Colori approssimati dell'arcobaleno (non fotometricamente esatti — la vera conversione
// lunghezza d'onda→RGB percepito richiede le funzioni colorimetriche CIE — solo per rendere
// riconoscibile a colpo d'occhio dove cade la banda del visibile sul grafico).
const VIS_STOPS = [
  [380, [143, 0, 255]], [440, [80, 0, 255]], [480, [0, 140, 255]], [510, [0, 255, 140]],
  [560, [200, 255, 0]], [590, [255, 200, 0]], [620, [255, 100, 0]], [700, [255, 0, 0]],
];

// ═══ Colore da temperatura (approssimazione da corpo nero, come in altri lab del sito) ═══
const BB_STOPS = [
  [1000, [255, 60, 10]], [1500, [255, 100, 20]], [2000, [255, 140, 40]], [2500, [255, 170, 80]],
  [3000, [255, 190, 120]], [4000, [255, 210, 160]], [5000, [255, 230, 200]], [5772, [255, 244, 232]],
  [6600, [255, 255, 255]], [8000, [210, 225, 255]], [10000, [170, 195, 255]], [15000, [150, 180, 255]],
];
function blackbodyColor(Traw) {
  const Tc = clamp(Traw, BB_STOPS[0][0], BB_STOPS[BB_STOPS.length - 1][0]);
  for (let i = 0; i < BB_STOPS.length - 1; i++) {
    const [t0, c0] = BB_STOPS[i], [t1, c1] = BB_STOPS[i + 1];
    if (Tc <= t1) {
      const u = clamp((Math.log10(Tc) - Math.log10(t0)) / (Math.log10(t1) - Math.log10(t0)), 0, 1);
      return [Math.round(c0[0] + (c1[0] - c0[0]) * u), Math.round(c0[1] + (c1[1] - c0[1]) * u), Math.round(c0[2] + (c1[2] - c0[2]) * u)];
    }
  }
  return [255, 255, 255];
}

// ═══ Rendering ════════════════════════════════════════════════════════════════
const LAMBDA_MIN = 50e-9;                                          // 50 nm, estremo UV — fisso: la catastrofe va sempre cercata lì
const T_MIN = 200, T_MAX = 15000;                                  // 200 K: più freddo del ghiaccio, emette quasi solo infrarosso lontano
const DRAPER_POINT = 798;                                          // K — sotto questa soglia un oggetto non è "visibilmente" incandescente ad occhio nudo (fatto reale, non un limite tecnico del modello)
// Il bordo destro della finestra si allarga/restringe con la temperatura (ricalcolato ad ogni
// cambio di T, mai in risposta a ε): a basse T il picco di Wien cade a lunghezze d'onda lunghe
// (es. 14.5 μm a 200 K) — con una finestra troppo stretta il picco e tutta la divergenza classica
// finirebbero appena fuori dal grafico, rendendo la catastrofe ultravioletta invisibile proprio nel
// caso in cui si vuole mostrarla. Riscalare in risposta a T non nasconde l'effetto di ε (l'unico
// parametro per cui le regole del progetto vietano il riscalamento): lo rende anzi visibile meglio.
function lamMaxFor(Tk) { return clamp(wienPeakLambda(Tk) * 3.2, 1200e-9, 30000e-9); }

function drawGrid(ctx, W, H) {
  ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}
// Colonna sinistra = modello dell'oggetto che irraggia, colonna destra = curva di Planck/Rayleigh-Jeans
function geom(W, H) {
  const headerH = 44, hintH = 34, gap = 10;
  const leftW = Math.max(180, (W - gap) * 0.32);
  const rightW = W - leftW - gap;
  const padL = 50, padR = 18, padT = 14, padB = 32;
  const x0 = leftW + gap + padL, x1 = W - padR;
  const y0 = headerH + padT, y1 = H - hintH - padB;
  G = {
    W, H,
    model: { x0: 0, x1: leftW, y0: headerH, y1: H - hintH },
    plot: { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0 },
    hintY: H - hintH,
  };
}
// L'asse y è normalizzato al picco del corpo nero IDEALE (ε=1) alla temperatura corrente,
// ricalcolato solo quando cambia T — mai quando cambia ε: se si riscalasse anche con ε, l'effetto
// dell'emissività (una curva più bassa) sparirebbe silenziosamente invece di essere visibile.
function bPeakRef(Tk) { return planckB(wienPeakLambda(Tk), Tk); }
function xOf(lambda) { return G.plot.x0 + clamp((lambda - LAMBDA_MIN) / (G.lamMax - LAMBDA_MIN), 0, 1) * G.plot.w; }
function yOf(v, yMax) { return G.plot.y0 + G.plot.h - clamp(v / yMax, 0, 1.4) * G.plot.h; }
// La finestra va da poche centinaia di nm (T alte) a decine di µm (T basse, oltre 20× di intervallo
// dinamico): usare sempre la stessa lista di tacche le affollerebbe illeggibilmente quando la
// finestra è stretta, o le lascerebbe troppo rade quando è larga — scelta quindi in base a G.lamMax.
function tickCandidatesNm(lamMaxNm) {
  if (lamMaxNm <= 1500) return [100, 250, 500, 750, 1000, 1250, 1500];
  if (lamMaxNm <= 3000) return [250, 500, 1000, 1500, 2000, 2500, 3000];
  if (lamMaxNm <= 8000) return [500, 1000, 2000, 3000, 4000, 6000, 8000];
  return [1000, 5000, 10000, 15000, 20000, 25000, 30000];
}

function drawPlanckGraph(ctx) {
  const { x0, x1, y0, y1, w, h } = G.plot;
  const yMax = bPeakRef(dispT) * 1.3;
  G.lamMax = lamMaxFor(dispT);

  // griglia + assi
  tickCandidatesNm(G.lamMax * 1e9).forEach(nm => {
    const x = xOf(nm * 1e-9); if (x < x0 || x > x1) return;
    ctx.strokeStyle = T.grid; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
    ctx.fillStyle = T.sub; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'center'; ctx.fillText(nm >= 10000 ? (nm / 1000) + 'µm' : nm, x, y1 + 12);
  });
  ctx.strokeStyle = T.ring; ctx.lineWidth = 1; ctx.strokeRect(x0, y0, w, h);
  ctx.fillText('Lunghezza d\'onda (nm)', (x0 + x1) / 2, y1 + 24);
  ctx.save(); ctx.translate(16, (y0 + y1) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillStyle = T.sub; ctx.font = '8px "Space Mono",monospace'; ctx.fillText('Radianza spettrale (relativa al picco ideale)', 0, 0); ctx.restore();

  // banda del visibile con gradiente arcobaleno (colori approssimati, non fotometricamente esatti,
  // solo per far riconoscere a colpo d'occhio dove cade la luce visibile) + banda infrarossa oltre
  // i 700 nm, fino al bordo della finestra corrente — resa in rosso scuro traslucido, la convenzione
  // usuale per "calore/IR" nelle immagini termiche false-colore
  const xVis0 = xOf(380e-9), xVis1 = xOf(700e-9);
  if (xVis1 > xVis0) {
    const rainbow = ctx.createLinearGradient(xVis0, 0, xVis1, 0);
    VIS_STOPS.forEach(([nm, col]) => rainbow.addColorStop(clamp((nm - 380) / (700 - 380), 0, 1), `rgba(${col[0]},${col[1]},${col[2]},0.4)`));
    ctx.fillStyle = rainbow; ctx.fillRect(xVis0, y0, xVis1 - xVis0, h);
  }
  if (x1 > xVis1) {
    ctx.fillStyle = dk() ? 'rgba(160,40,30,0.16)' : 'rgba(160,40,30,0.1)';
    ctx.fillRect(xVis1, y0, x1 - xVis1, h);
    ctx.fillStyle = 'rgba(220,110,90,0.8)'; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left';
    ctx.fillText('infrarosso →', xVis1 + 4, y0 + 10);
  }

  ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();

  if (P.mode === 'classical' || P.mode === 'compare') {
    ctx.strokeStyle = 'rgba(255,110,90,0.85)'; ctx.lineWidth = 1.6; ctx.beginPath();
    for (let i = 0; i <= 240; i++) {
      const lambda = LAMBDA_MIN + (G.lamMax - LAMBDA_MIN) * i / 240;
      const v = dispEps * rayleighJeansB(lambda, dispT);
      const x = xOf(lambda), y = yOf(v, yMax);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  if (P.mode === 'quantum' || P.mode === 'compare') {
    ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i <= 240; i++) {
      const lambda = LAMBDA_MIN + (G.lamMax - LAMBDA_MIN) * i / 240;
      const v = dispEps * planckB(lambda, dispT);
      const x = xOf(lambda), y = yOf(v, yMax);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();

  // etichette delle curve
  ctx.textAlign = 'left'; ctx.font = 'bold 9px "Space Mono",monospace';
  let ly = y0 + 14;
  if (P.mode === 'quantum' || P.mode === 'compare') { ctx.fillStyle = '#00d4ff'; ctx.fillText('Planck (quantistica)', x0 + 8, ly); ly += 13; }
  if (P.mode === 'classical' || P.mode === 'compare') { ctx.fillStyle = 'rgba(255,110,90,0.95)'; ctx.fillText('Rayleigh-Jeans (classica) →∞', x0 + 8, ly); }
}

function draw(canvas) {
  const [ctx, W, H] = Lab.ctx2d(canvas);
  T = pal();
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
  drawGrid(ctx, W, H);
  geom(W, H);

  drawPlanckGraph(ctx);
  drawModel(ctx);

  // intestazione
  ctx.textAlign = 'left';
  ctx.fillStyle = T.accent; ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.fillText('Corpo Nero — radiazione termica e catastrofe ultravioletta', 14, 20);
  ctx.fillStyle = T.txt; ctx.font = '10px "Space Mono",monospace';
  const lp = wienPeakLambda(dispT) * 1e9;
  ctx.fillText(`T=${Lab.fmt(dispT,0)} K   ε=${Lab.fmt(dispEps,2)}   λ_picco=${fmtNm(lp)}   P/A=${Lab.sci(stefanBoltzmannP(dispT, dispEps),3)} W/m²`, 14, 36);

  ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
  const hint = P.mode === 'classical'
    ? 'la fisica classica (Rayleigh-Jeans) prevede un\'energia infinita irraggiata a piccole λ: la "catastrofe ultravioletta"'
    : P.mode === 'quantum'
      ? 'la quantizzazione di Planck (E=hν) impedisce ai modi ad alta frequenza di essere eccitati: la curva si richiude da sola'
      : 'le due curve coincidono a grandi λ ma divergono a piccole λ: solo l\'ipotesi dei quanti evita la catastrofe ultravioletta';
  ctx.fillText(hint, G.plot.x0 + (G.plot.x1 - G.plot.x0) / 2, H - 10);
}

function drawModel(ctx) {
  const m = G.model, cx = (m.x0 + m.x1) / 2, cy = (m.y0 + m.y1) / 2;
  const maxR = Math.min((m.x1 - m.x0), (m.y1 - m.y0)) * 0.28;
  const radius = maxR * (0.65 + 0.35 * dispEps);                   // un emettitore scarso "sembra" anche visivamente più piccolo/spento
  const visible = dispT >= DRAPER_POINT;

  // sfondo grigio neutro dietro la sfera, così un ε basso (poco irraggiamento) resta comunque visibile
  ctx.fillStyle = dk() ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';
  ctx.beginPath(); ctx.arc(cx, cy, maxR * 1.35, 0, TWO); ctx.fill();

  if (visible) {
    // sopra ~800 K (il "punto di Draper") un oggetto emette abbastanza luce visibile da apparire
    // incandescente ad occhio nudo — il colore percepito è quello del corpo nero a quella T
    const [r, g, b] = blackbodyColor(dispT);
    ctx.save();
    ctx.shadowColor = `rgb(${r},${g},${b})`; ctx.shadowBlur = 18 + 55 * dispEps;
    const grad = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, radius * 0.05, cx, cy, radius);
    const mix = (c) => Math.round(c * dispEps + 130 * (1 - dispEps));   // a bassa ε il corpo tende al grigio (legge di Kirchhoff)
    grad.addColorStop(0, `rgb(${mix(255)},${mix(255)},${mix(255)})`);
    grad.addColorStop(1, `rgb(${mix(r)},${mix(g)},${mix(b)})`);
    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.55 + 0.45 * dispEps;
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, TWO); ctx.fill();
    ctx.restore();
  } else {
    // sotto il punto di Draper l'oggetto NON emette abbastanza luce visibile per essere visto
    // "incandescente" — resta scuro ad occhio nudo, ma continua a irraggiare (di più) nell'infrarosso:
    // resa con anelli tratteggiati pulsanti in rosso scuro, la stessa convenzione di una termocamera
    ctx.fillStyle = dk() ? 'rgb(26,30,38)' : 'rgb(207,214,224)';
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, TWO); ctx.fill();
    ctx.strokeStyle = T.ring; ctx.lineWidth = 1; ctx.stroke();
    for (let i = 1; i <= 3; i++) {
      const rr = radius + i * 11 + 4 * Math.sin(animT * 2 + i * 1.3);
      ctx.strokeStyle = `rgba(200,50,35,${clamp(0.4 - i * 0.09, 0, 1) * (0.4 + 0.6 * dispEps)})`;
      ctx.setLineDash([5, 5]); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TWO); ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  ctx.textAlign = 'center'; ctx.fillStyle = T.txt; ctx.font = 'bold 10px "Space Mono",monospace';
  ctx.fillText(`${Lab.fmt(dispT,0)} K`, cx, cy + radius + 22);
  ctx.fillStyle = T.sub; ctx.font = '8px "Space Mono",monospace';
  ctx.fillText(`ε = ${Lab.fmt(dispEps,2)}`, cx, cy + radius + 35);
  ctx.fillStyle = T.sub; ctx.font = '7px "Space Mono",monospace';
  ctx.fillText(visible ? 'emette abbastanza luce visibile da apparire incandescente' : 'emissione infrarossa: invisibile all\'occhio, ma reale', cx, m.y0 + 14);
  ctx.fillText(visible
    ? (dispEps < 0.98 ? '(emette meno, riflette di più: legge di Kirchhoff)' : '(assorbe ed emette tutta la radiazione incidente)')
    : `(sotto ${DRAPER_POINT} K: come una termocamera vedrebbe l'oggetto)`, cx, m.y0 + 26);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
// 1: legge di Wien λ_picco = b/T (b = 2,898·10⁻³ m·K)
function drawGraphWien() {
  const g = Lab.panel(gCanvas[0], { title: 'Legge di Wien: lunghezza d’onda di picco (nm)', xr: [T_MIN, T_MAX], yr: [100, 20000], yLog: true, xLabel: 'temperatura T (K)' });
  if (!g) return; const [ctx, f] = g;
  ctx.fillStyle = 'rgba(160,120,255,0.10)'; ctx.fillRect(f.L, f.Y(750), f.R - f.L, f.Y(380) - f.Y(750));
  Lab.plot(ctx, f, t => wienPeakLambda(t) * 1e9, [T_MIN, T_MAX], '#00d4ff', 2);
  Lab.dot(ctx, f, dispT, wienPeakLambda(dispT) * 1e9, '#ff9d4d', 4.5);
  ctx.fillStyle = f.C.text; ctx.font = '9.5px "DM Sans",sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText('fascia: visibile', f.R - 4, f.Y(565));
}
// 2: legge di Stefan–Boltzmann P/A = ε·σ·T⁴ (curva per ε = 1, punto con l'emissività attuale)
function drawGraphStefan() {
  const g = Lab.panel(gCanvas[1], { title: 'Potenza emessa per m² (W/m²) — Stefan–Boltzmann', xr: [T_MIN, T_MAX], yr: [Math.pow(10, Math.floor(Math.log10(stefanBoltzmannP(T_MIN, 1)))), Math.pow(10, Math.ceil(Math.log10(stefanBoltzmannP(T_MAX, 1))))], yLog: true, xLabel: 'temperatura T (K)' });
  if (!g) return; const [ctx, f] = g;
  Lab.plot(ctx, f, t => stefanBoltzmannP(t, 1), [T_MIN, T_MAX], '#00d4ff', 2);
  Lab.dot(ctx, f, dispT, stefanBoltzmannP(dispT, dispEps), '#ff9d4d', 4.5);
  Lab.legend(ctx, f.L + 8, f.T + 8, [['#00d4ff', 'corpo nero ideale (ε = 1)']]);
}
// 3: quanto sbaglia la fisica classica: rapporto Rayleigh–Jeans / Planck alla temperatura attuale
function drawGraphRatio() {
  const lamMax = lamMaxFor(dispT);
  const g = Lab.panel(gCanvas[2], { title: 'Classica / quantistica (Rayleigh–Jeans ÷ Planck)', xr: [LAMBDA_MIN * 1e9, lamMax * 1e9], yr: [1, 1e8], yLog: true, xLabel: 'λ (nm)' });
  if (!g) return; const [ctx, f] = g;
  Lab.plot(ctx, f, l => Math.max(1, rayleighJeansB(l * 1e-9, dispT) / Math.max(planckB(l * 1e-9, dispT), 1e-300)), [LAMBDA_MIN * 1e9, lamMax * 1e9], '#ff9d4d', 2, [], 400);
}
function drawGraphs() { drawGraphWien(); drawGraphStefan(); drawGraphRatio(); }

// ═══ Passo di simulazione ═══════════════════════════════════════════════════
// Nessuna vera dinamica fisica qui (è un grafico esplorativo, non un sistema che evolve): l'unica
// cosa che "anima" è un morbido inseguimento di T ed ε verso il valore impostato dagli slider,
// così un cambio di parametro si vede come una transizione invece di un salto istantaneo.
function step(dt) {
  animT += dt;
  dispT += (P.T - dispT) * clamp(dt * 4, 0, 1);
  dispEps += (P.epsilon - dispEps) * clamp(dt * 4, 0, 1);
  hist.push({ t: animT, T: dispT });
  const tMin = animT - 10; while (hist.length && hist[0].t < tMin) hist.shift();
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
let tSlider, epsSlider;
function buildControls() {
  const cont = document.getElementById('controls'); cont.innerHTML = '';

  const sc = Lab.Section('Corpo'); cont.appendChild(sc.el);
  tSlider = Lab.Slider({ label: 'Temperatura', min: T_MIN, max: T_MAX, step: 10, value: P.T, unit: ' K', onChange(v) { P.T = v; } });
  sc.add(tSlider);
  epsSlider = Lab.Slider({ label: 'Emissività ε', min: 0.05, max: 1, step: 0.05, value: P.epsilon, onChange(v) { P.epsilon = v; } });
  sc.add(epsSlider);

  const sm = Lab.Section('Modello fisico'); cont.appendChild(sm.el);
  sm.add(Lab.RadioGroup({
    label: 'Visione', value: P.mode,
    options: [
      { value: 'compare', label: 'Confronto', hint: 'entrambe le curve' },
      { value: 'quantum', label: 'Quantistica', hint: 'solo Planck' },
      { value: 'classical', label: 'Classica', hint: 'solo Rayleigh-Jeans' },
    ],
    onChange(v) { P.mode = v; },
  }));

  const sv = Lab.Section('Visualizzazione'); cont.appendChild(sv.el);
  sv.add(Lab.Slider({ label: 'Velocità animazione', min: 0.2, max: 3, step: 0.1, value: P.speed, unit: '×', onChange(v) { P.speed = v; } }));
}

function buildReadout() {
  const cont = document.getElementById('readout'); cont.innerHTML = '';
  readout = new Lab.Readout(cont, [
    { key: 'T', label: 'temperatura' },
    { key: 'eps', label: 'emissività ε' },
    { key: 'lambdaPeak', label: 'λ di picco (Wien)' },
    { key: 'power', label: 'potenza per m²' },
    { key: 'mode', label: 'modello' },
    { key: 'stato', label: 'stato' },
  ]);
}

function initGraphs() {
  // riga di grafici standard; i titoli sono disegnati dentro i grafici
  gCanvas = Lab.graphPanels(document.getElementById('graphArea'), 3);
  gCtx = gCanvas.map(c => c.getContext('2d'));
  gTitle = gCanvas.map(() => ({ textContent: '' }));
}

// ═══ Init ═════════════════════════════════════════════════════════════════════
function init() {
  Lab.initTheme();
  buildControls(); initGraphs(); buildReadout();
  const simCanvas = document.getElementById('simCanvas');
  const btnPlay = document.getElementById('btnPlay');
  function syncPlay() { btnPlay.textContent = P.paused ? '▶  AVVIA' : '⏸  PAUSA'; }
  syncPlay();
  btnPlay.addEventListener('click', () => { P.paused = !P.paused; syncPlay(); });
  document.getElementById('btnReset').addEventListener('click', () => {
    P.T = 5772; P.epsilon = 1.0; P.mode = 'compare'; P.speed = 1.0; P.paused = false;
    buildControls(); syncPlay();
  });

  function resize() {
    const area = document.querySelector('.lab-canvas-area'); if (!area) return;
    const ar = area.getBoundingClientRect();
    const rb = document.getElementById('readout').getBoundingClientRect();
    const ga = document.getElementById('graphArea'); const gaH = ga ? ga.offsetHeight : 0;
    const h = Math.max(240, Math.floor(ar.height - rb.height - gaH - 4));
    Lab.hidpi(simCanvas, Math.floor(ar.width), h);
    Lab.fitPanels(gCanvas);
  }
  resize();
  new ResizeObserver(resize).observe(document.querySelector('.lab-canvas-area'));
  window.addEventListener('load', resize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);

  last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000; last = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0; dt = Math.min(dt, 0.05);
    if (!P.paused) step(dt * P.speed);
    try {
      draw(simCanvas); drawGraphs();
      readout.set('T', Lab.fmt(dispT,0) + ' K');
      readout.set('eps', Lab.fmt(dispEps,2));
      readout.set('lambdaPeak', fmtNm(wienPeakLambda(dispT) * 1e9));
      readout.set('power', Lab.sci(stefanBoltzmannP(dispT, dispEps),3) + ' W/m²');
      readout.set('mode', P.mode === 'compare' ? 'confronto' : P.mode === 'quantum' ? 'quantistico' : 'classico');
      readout.set('stato', Math.abs(dispT - P.T) < 5 && Math.abs(dispEps - P.epsilon) < 0.005 ? 'stabile' : 'in transizione');
    } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
