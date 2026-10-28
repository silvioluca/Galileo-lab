'use strict';

// ═══ Costanti ═══════════════════════════════════════════════════════════════
const TWO = Math.PI * 2;
const TSUN = 5772;                                               // K, temperatura effettiva del Sole
const TRAIL_MAX = 4000, HIST_MAX = 4000;

const P = {
  mass: 1.0,               // massa iniziale (M☉)
  showTrail: true,
  speed: 1.0,
  paused: false,
};

let animT = 0, last = 0, ended = false;
let phaseIdx = 0, segU = 0, curLogT = 0, curLogL = 0, curInto = null, curRemnant = false;
let trail = [], hist = [];
let track = null;
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

// ═══ Fisica di sequenza principale (relazioni analitiche standard) ═══════════════
// Le relazioni massa-luminosità, massa-raggio e la vita sulla sequenza principale sono le uniche
// parti dell'evoluzione stellare che ammettono buone leggi di scala in forma chiusa (dedotte dalla
// fisica dell'equilibrio idrostatico + trasporto radiativo): usate qui esattamente come nei testi
// introduttivi di astrofisica. Tutto ciò che avviene DOPO la sequenza principale (ramo delle
// giganti, flash dell'elio, AGB, supernova...) NON ha invece una legge di scala semplice — richiede
// di risolvere l'intera struttura stellare con l'opacità e le reazioni nucleari che cambiano nel
// tempo — perciò lì il modello passa deliberatamente a un CAMMINO SCRIPT-ATO (punti chiave presi
// dalla fenomenologia osservata/da modelli stellari reali, collegati con un'interpolazione liscia),
// dichiarato esplicitamente come tale invece di fingere una precisione che non avrebbe senso qui.
function msLuminosity(M) {                                       // L/L☉, relazione massa-luminosità a tratti
  if (M < 0.43) return 0.23 * Math.pow(M, 2.3);
  if (M < 2) return Math.pow(M, 4);
  if (M < 20) return 1.5 * Math.pow(M, 3.5);
  return 3200 * M;
}
function msRadius(M) { return M < 1 ? Math.pow(M, 0.8) : Math.pow(M, 0.57); }   // R/R☉
function teffFromLR(L, R) { return TSUN * Math.pow(L / (R * R), 0.25); }        // Stefan-Boltzmann invertita
function msLifetimeGyr(M) { return 10 * Math.pow(M, -2.5); }                    // Gyr — il Sole=10, una nana da 0.3M☉ ≈ 200 Gyr (> età dell'universo)
function radiusFromLT(logL, logT) {                              // R/R☉ dedotto da L e T correnti (stessa relazione di Stefan-Boltzmann, non un valore indipendente)
  const L = Math.pow(10, logL), T = Math.pow(10, logT);
  return Math.sqrt(L) / Math.pow(T / TSUN, 2);
}
function category(M) {
  if (M < 0.5) return 'dwarf';
  if (M < 8) return 'sunlike';
  if (M < 25) return 'massive';
  return 'verymassive';
}
const CAT_LABEL = { dwarf: 'Nana rossa', sunlike: 'Simile al Sole', massive: 'Stella massiccia', verymassive: 'Stella molto massiccia' };

// ═══ Cammini evolutivi ════════════════════════════════════════════════════════
// Ogni punto: {name, logT, logL, animDur (secondi di animazione per ARRIVARE qui dal punto
// precedente — per il primo punto, quanto la stella "sosta" lì prima di iniziare a evolvere),
// realGyr (durata reale approssimata della stessa fase, per il readout), note (curiosità fisica),
// isFlash/isSupernova (evento quasi istantaneo, disegnato come lampo invece che come spostamento),
// isEnd (stato finale, l'evoluzione si ferma qui), isRemnant (residuo compatto: non ha più una
// fotosfera classica, non rappresentabile sugli stessi assi T-L — mostrato con un'etichetta a parte)
function buildTrack(M) {
  const Lms = msLuminosity(M), Rms = msRadius(M), Tms = teffFromLR(Lms, Rms), tMS = msLifetimeGyr(M);
  const lT = Math.log10(Tms), lL = Math.log10(Lms);
  const cat = category(M);
  let points;

  if (cat === 'dwarf') {
    points = [{
      name: 'Sequenza Principale', logT: lT, logL: lL, animDur: 10, realGyr: tMS,
      note: `una nana rossa così poco massiccia brucia idrogeno lentissimamente: resterà qui ~${Lab.fmt(tMS,0)} Gyr, più a lungo dell'età dell'universo (13.8 Gyr) — non la vedremo mai lasciare la sequenza principale`,
    }];
    return { cat, tMS, points: finalizeTrack(points), sliding: true, slideWin: 12 };
  }

  if (cat === 'sunlike') {
    const rgbTipL = 2000, rgbTipT = 3800;                          // il picco del ramo delle giganti è quasi indipendente dalla massa (vedi nota)
    const hbL = 45, hbT = 5100;
    const agbL = Math.max(rgbTipL * 2.2, Lms * 3500), agbT = 3450;
    const pnT = 55000, pnL = agbL * 0.55;
    const wdT = 22000, wdL = 0.0025;
    points = [
      { name: 'Sequenza Principale', logT: lT, logL: lL, animDur: 6.5, realGyr: tMS },
      { name: 'Sottogigante', logT: Math.log10(Tms * 0.82), logL: Math.log10(Lms * 1.7), animDur: 1.1, realGyr: tMS * 0.015 },
      {
        name: 'Ramo delle Giganti Rosse', logT: Math.log10(rgbTipT), logL: Math.log10(rgbTipL), animDur: 1.8, realGyr: tMS * 0.07,
        note: 'il picco del ramo delle giganti rosse è quasi INDIPENDENTE dalla massa iniziale (per stelle di piccola massa) — gli astronomi lo usano come "candela standard" (TRGB) per misurare le distanze delle galassie',
      },
      { name: "Flash dell'elio", logT: Math.log10(rgbTipT), logL: Math.log10(rgbTipL), animDur: 0.35, realGyr: 0.0000015, isFlash: true, note: "l'elio nel nucleo degenere si accende quasi tutto insieme in pochi secondi — un lampo di energia che però non arriva mai in superficie" },
      { name: 'Ramo Orizzontale', logT: Math.log10(hbT), logL: Math.log10(hbL), animDur: 1.3, realGyr: tMS * 0.008 },
      { name: 'Ramo Asintotico (AGB)', logT: Math.log10(agbT), logL: Math.log10(agbL), animDur: 1.5, realGyr: tMS * 0.004 },
      { name: 'Nebulosa Planetaria', logT: Math.log10(pnT), logL: Math.log10(pnL), animDur: 1.1, realGyr: 0.00003, note: 'gli strati esterni vengono espulsi e illuminati dal nucleo bollente rimasto scoperto: quello che resta della stella diventerà una nana bianca' },
      { name: 'Nana Bianca', logT: Math.log10(wdT), logL: Math.log10(wdL), animDur: 1.8, realGyr: 0.6, isEnd: true, note: 'un residuo grande come la Terra ma con la massa di una stella: si raffredda per miliardi di anni senza più reazioni nucleari' },
    ];
    return { cat, tMS, points: finalizeTrack(points), sliding: false };
  }

  // massive / verymassive
  const rsgT = 3700, rsgL = Lms * 1.15;
  points = [
    { name: 'Sequenza Principale', logT: lT, logL: lL, animDur: 5.5, realGyr: tMS },
    { name: 'Supergigante Rossa', logT: Math.log10(rsgT), logL: Math.log10(rsgL), animDur: 2.4, realGyr: tMS * 0.012, note: 'a differenza delle stelle simili al Sole, una stella massiccia si muove quasi ORIZZONTALMENTE nel diagramma H-R: la luminosità resta quasi costante, cambia soprattutto la temperatura' },
  ];
  if (cat === 'verymassive') {
    points.push({ name: 'Wolf-Rayet', logT: Math.log10(52000), logL: Math.log10(Lms * 1.35), animDur: 1.4, realGyr: tMS * 0.001, note: 'venti stellari fortissimi spogliano gli strati esterni e riportano la stella verso il blu, bollente e nuda del suo inviluppo di idrogeno' });
  }
  const preSN = points[points.length - 1];
  points.push({ name: 'Supernova', logT: preSN.logT, logL: preSN.logL, animDur: 0.45, realGyr: 0, isFlash: true, isSupernova: true, note: 'il nucleo di ferro collassa in meno di un secondo: per alcune settimane la stella può brillare quanto un\'intera galassia' });
  points.push({
    name: cat === 'massive' ? 'Stella di Neutroni' : 'Buco Nero', logT: NaN, logL: NaN, animDur: 1.2, realGyr: 0, isEnd: true, isRemnant: true,
    note: cat === 'massive'
      ? 'un residuo di ~1.4 M☉ compresso in una sfera di ~20 km: un cucchiaino della sua materia peserebbe miliardi di tonnellate'
      : 'la gravità vince su ogni altra forza: nemmeno la luce può più sfuggire oltre l\'orizzonte degli eventi',
  });
  return { cat, tMS, points: finalizeTrack(points), sliding: false };
}
function finalizeTrack(points) {
  let acc = 0;
  points.forEach(p => { acc += p.animDur; p.cum = acc; });
  points._totalDur = acc;
  return points;
}

function stateAt(trk, t) {
  const pts = trk.points;
  if (t <= pts[0].cum) {
    const u = clamp(t / (pts[0].cum || 1e-6), 0, 1);
    return { logT: pts[0].logT, logL: pts[0].logL, idx: 0, u, into: pts[0], remnant: false };
  }
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i].cum) {
      const prev = pts[i - 1], cur = pts[i];
      const u = clamp((t - prev.cum) / (cur.animDur || 1e-6), 0, 1);
      if (cur.isRemnant) return { logT: prev.logT, logL: prev.logL, idx: i, u, into: cur, remnant: true };
      const e = u * u * (3 - 2 * u);                              // smoothstep: la stella accelera ed esce dolcemente da ogni fase, non a scatti
      return { logT: prev.logT + (cur.logT - prev.logT) * e, logL: prev.logL + (cur.logL - prev.logL) * e, idx: i, u, into: cur, remnant: false };
    }
  }
  const lastP = pts[pts.length - 1];
  return { logT: lastP.logT, logL: lastP.logL, idx: pts.length - 1, u: 1, into: lastP, remnant: !!lastP.isRemnant };
}

function realGyrElapsed() {
  const pts = track.points; let sum = 0;
  for (let i = 0; i < phaseIdx; i++) sum += (pts[i].realGyr || 0);
  sum += (pts[phaseIdx].realGyr || 0) * segU;
  return sum;
}
function fmtGyr(g) {
  if (g >= 1) return Lab.fmt(g,2) + ' Gyr';
  if (g >= 1e-3) return Lab.fmt((g * 1000),1) + ' Myr';
  if (g >= 1e-6) return Lab.fmt((g * 1e6),0) + ' kyr';
  if (g >= 1e-9) return Lab.fmt((g * 1e9),0) + ' yr';
  return '~0';
}
function fmtNum(x, d = 2) {
  if (!Number.isFinite(x)) return '—';
  if (x >= 1000 || (x > 0 && x < 0.01)) return Lab.sci(x,2);
  return Lab.fmt(x,d);
}

function trimHist() {
  if (hist.length > HIST_MAX) hist.shift();
  if (trail.length > TRAIL_MAX) trail.shift();
  if (track.sliding) {
    const tMin = animT - track.slideWin;
    while (hist.length && hist[0].t < tMin) hist.shift();
    while (trail.length && trail[0].t < tMin) trail.shift();
  }
}
function step(dt) {
  if (ended) return;
  animT += dt;
  if (!track.sliding && animT >= track.points._totalDur) { animT = track.points._totalDur; ended = true; }
  const res = stateAt(track, animT);
  curLogT = res.logT; curLogL = res.logL; phaseIdx = res.idx; segU = res.u; curInto = res.into; curRemnant = res.remnant;
  if (!curRemnant && Number.isFinite(curLogT)) {
    trail.push({ t: animT, logT: curLogT, logL: curLogL });
  }
  hist.push({ t: animT, L: Math.pow(10, curLogL), T: Math.pow(10, curLogT), R: radiusFromLT(curLogL, curLogT) });
  trimHist();
}
function newRun() {
  track = buildTrack(P.mass);
  animT = 0; ended = false; phaseIdx = 0; segU = 0; curRemnant = false;
  trail = []; hist = [];
  const res = stateAt(track, 0);
  curLogT = res.logT; curLogL = res.logL; curInto = res.into;
}

// ═══ Colore da temperatura (approssimazione da corpo nero, sequenza O-B-A-F-G-K-M) ═══
function teffToColor(Traw) {
  const stops = [
    [2500, [255, 110, 60]], [3200, [255, 150, 90]], [4000, [255, 190, 130]], [5000, [255, 220, 175]],
    [5800, [255, 244, 224]], [6600, [255, 255, 255]], [8000, [210, 225, 255]], [12000, [175, 200, 255]],
    [20000, [155, 185, 255]], [55000, [140, 175, 255]],
  ];
  const Tc = clamp(Traw, stops[0][0], stops[stops.length - 1][0]);
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i], [t1, c1] = stops[i + 1];
    if (Tc <= t1) {
      const u = clamp((Math.log10(Tc) - Math.log10(t0)) / (Math.log10(t1) - Math.log10(t0)), 0, 1);
      return `rgb(${Math.round(c0[0] + (c1[0] - c0[0]) * u)},${Math.round(c0[1] + (c1[1] - c0[1]) * u)},${Math.round(c0[2] + (c1[2] - c0[2]) * u)})`;
    }
  }
  return 'rgb(255,255,255)';
}

// ═══ Rendering ════════════════════════════════════════════════════════════════
const TMIN = 3.3, TMAX = 4.9;    // log10(Teff): 2000K .. ~79000K — usato solo per i grafici Teff(t) e per il cammino della stella
// LMIN/LMAX e BVMIN/BVMAX hanno un margine extra oltre al range effettivo dei dati (che arriva a
// logL≈-5.16..4.97 e B-V≈-0.19..2.07) apposta: senza questo "padding interno" i punti e le
// etichette più estremi (l'angolo delle supergiganti blu, le nane bianche) cadono esattamente sul
// bordo del riquadro e diventano illeggibili/tagliati.
const LMIN = -5.9, LMAX = 5.9;   // log10(L/L☉)
const RMIN = -3, RMAX = 3.5;     // log10(R/R☉), usato solo nel grafico del raggio
const BVMIN = -0.55, BVMAX = 2.3; // asse orizzontale nativo del diagramma: colore B-V

function drawGrid(ctx, W, H) {
  ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}

// Canvas diviso in due, come richiesto: a sinistra il diagramma H-R, a destra il modello di
// stella a scala. G.plot è il rettangolo del grafico (dentro la colonna sinistra), G.right la
// colonna del modello.
function geom(W, H) {
  const headerH = 44, hintH = 32, gap = 10;
  const rightW = (W - gap) / 2;
  const leftW = W - rightW - gap;
  const padL = 56, padR = 44, padT = 34, padB = 34;         // padT/padB ospitano le due righe di assi (classe+temperatura sopra, colore B-V sotto)
  const x0 = padL, x1 = leftW - padR;
  const y0 = headerH + padT, y1 = H - hintH - padB;
  G = {
    W, H,
    plot: { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0 },
    right: { x0: leftW + gap, x1: W, y0: headerH, y1: H - hintH },
    hintY: H - hintH, hintW: x1 - x0,
  };
}
// Asse orizzontale nativo = B-V (colore), la stessa unità dei dati osservativi reali usati per lo
// sfondo — niente conversione/arrotondamento intermedio per quei punti. La stella dell'utente, che
// invece è calcolata in temperatura (Teff) dalla fisica, passa per xOfT() che la converte al volo.
function xOf(bv) { return G.plot.x0 + (bv - BVMIN) / (BVMAX - BVMIN) * G.plot.w; }
function xOfT(logT) { return xOf(bvFromTeff(Math.pow(10, logT))); }
function yOf(logL) { return G.plot.y0 + (LMAX - logL) / (LMAX - LMIN) * G.plot.h; }

// Classi spettrali (bordi di temperatura standard) e relazione temperatura → colore (B-V),
// approssimazione da manuale valida per stelle di sequenza principale — usata per posizionare sopra
// l'asse le lettere O-B-A-F-G-K-M e per convertire la stella dell'utente (Teff) sull'asse B-V.
const SPEC_BOUNDS = [50000, 30000, 10000, 7500, 6000, 5200, 3700, 2000];
const SPEC_LETTERS = ['O', 'B', 'A', 'F', 'G', 'K', 'M'];
const BV_STOPS = [
  [50000, -0.33], [30000, -0.31], [20000, -0.28], [15000, -0.22], [10000, -0.02],
  [8000, 0.18], [7000, 0.32], [6000, 0.52], [5800, 0.63], [5200, 0.80],
  [4500, 1.00], [4000, 1.20], [3500, 1.45], [3000, 1.70], [2500, 1.90],
];
function bvFromTeff(Traw) {
  const Tc = clamp(Traw, BV_STOPS[BV_STOPS.length - 1][0], BV_STOPS[0][0]);
  for (let i = 0; i < BV_STOPS.length - 1; i++) {
    const [t0, b0] = BV_STOPS[i], [t1, b1] = BV_STOPS[i + 1];
    if (Tc <= t0 && Tc >= t1) return b0 + (b1 - b0) * (Math.log10(t0) - Math.log10(Tc)) / (Math.log10(t0) - Math.log10(t1));
  }
  return BV_STOPS[BV_STOPS.length - 1][1];
}

function drawAxes(ctx) {
  const { x0, x1, y0, y1, w, h } = G.plot;
  // griglia verticale (colore B-V) e orizzontale (luminosità)
  [-0.3, 0, 0.4, 0.8, 1.2, 1.6, 2.0].forEach(bv => {
    const x = xOf(bv); if (x < x0 || x > x1) return;
    ctx.strokeStyle = T.grid; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
  });
  for (let lp = -5; lp <= 5; lp += 1) {
    const y = yOf(lp); if (y < y0 || y > y1) continue;
    ctx.strokeStyle = T.grid; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
  }
  ctx.strokeStyle = T.ring; ctx.lineWidth = 1; ctx.strokeRect(x0, y0, w, h);

  // sopra: classi spettrali (al centro di ciascuna banda, colorate come la stella tipica di quella
  // classe) + temperatura numerica ai confini — posizionate convertendo T→B-V sullo stesso asse
  ctx.textAlign = 'center'; ctx.font = 'bold 9px "Space Mono",monospace';
  for (let i = 0; i < SPEC_LETTERS.length; i++) {
    const midT = Math.sqrt(SPEC_BOUNDS[i] * SPEC_BOUNDS[i + 1]);
    const x = xOf(bvFromTeff(midT)); if (x < x0 || x > x1) continue;
    ctx.fillStyle = teffToColor(midT); ctx.fillText(SPEC_LETTERS[i], x, y0 - 18);
  }
  ctx.fillStyle = T.sub; ctx.font = '7px "Space Mono",monospace';
  [30000, 10000, 7500, 6000, 5200, 4000, 3000].forEach(t0 => {
    const x = xOf(bvFromTeff(t0)); if (x < x0 || x > x1) return;
    ctx.fillText(t0 >= 1000 ? (t0 / 1000) + 'k' : String(t0), x, y0 - 6);
  });

  // sotto: colore B-V — asse nativo dei dati, nessuna conversione
  ctx.fillStyle = T.sub; ctx.font = '7px "Space Mono",monospace';
  [-0.3, 0, 0.4, 0.8, 1.2, 1.6, 2.0].forEach(bv => {
    const x = xOf(bv); if (x < x0 || x > x1) return;
    ctx.fillText(Lab.fmt(bv,1), x, y1 + 12);
  });
  ctx.fillText('Colore (B-V)', (x0 + x1) / 2, y1 + 24);

  // sinistra: luminosità in L☉ — destra: magnitudine assoluta bolometrica (M=4.74−2.5·log L)
  ctx.textAlign = 'right'; ctx.font = '8px "Space Mono",monospace';
  for (let lp = -5; lp <= 5; lp += 1) {
    const y = yOf(lp); if (y < y0 || y > y1) continue;
    ctx.fillStyle = T.sub; ctx.fillText('10' + toSuper(lp), x0 - 6, y + 3);
    ctx.textAlign = 'left'; ctx.fillText(Lab.fmt((4.74 - 2.5 * lp),0), x1 + 6, y + 3); ctx.textAlign = 'right';
  }
  ctx.save(); ctx.translate(16, (y0 + y1) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillStyle = T.sub; ctx.font = '8px "Space Mono",monospace'; ctx.fillText('Luminosità (L☉)', 0, 0); ctx.restore();
  ctx.save(); ctx.translate(G.plot.x1 + 40, (y0 + y1) / 2); ctx.rotate(Math.PI / 2); ctx.textAlign = 'center'; ctx.fillStyle = T.sub; ctx.font = '8px "Space Mono",monospace'; ctx.fillText('Magnitudine assoluta', 0, 0); ctx.restore();
}
function toSuper(n) {
  const map = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  return String(n).split('').map(c => map[c] ?? c).join('');
}

// ═══ Popolazione di sfondo: dati OSSERVATIVI reali, digitizzati dall'utente ═══════════════════
// Non più una nuvola sintetica: HR_DATA (caricato da hr_data.js) è un campione rappresentativo di
// ~3000 punti reali estratti pixel per pixel da un diagramma H-R osservativo (le ~12.000 righe
// originali dell'utente sarebbero state impraticabili da trascrivere per intero qui — campionate
// mantenendo la copertura sull'intero intervallo di luminosità e tutte le categorie di colore).
// Coordinate native in (B-V, log L): disegnate qui SENZA conversione, a differenza della stella
// dell'utente che passa per xOfT()/bvFromTeff() perché calcolata in temperatura dalla fisica.
const CAT_COLOR = {
  white_OB: 'rgb(222,232,255)', paleyellow_F: 'rgb(255,244,214)', yellow_G: 'rgb(255,225,90)',
  orange_K: 'rgb(255,160,70)', red_M: 'rgb(214,70,55)', cyan_WD: 'rgb(150,220,255)', lightblue_WD: 'rgb(190,210,255)',
};
function drawBackgroundStars(ctx) {
  if (typeof HR_DATA === 'undefined') return;
  for (const cat in HR_DATA) {
    ctx.fillStyle = CAT_COLOR[cat] || '#fff'; ctx.globalAlpha = 0.7;
    HR_DATA[cat].forEach(([bv, logL]) => {
      if (bv < BVMIN || bv > BVMAX || logL < LMIN || logL > LMAX) return;
      const x = xOf(bv), y = yOf(logL);
      ctx.beginPath(); ctx.arc(x, y, 1.15, 0, TWO); ctx.fill();
    });
  }
  ctx.globalAlpha = 1;
}
// Le etichette hanno un alone scuro (strokeText col colore di sfondo, disegnato PRIMA del
// riempimento magenta) — senza, il testo diventa illeggibile quando ci capita sopra una stella
// molto calda/luminosa della simulazione (che nel diagramma finisce proprio nello stesso angolo
// in alto a sinistra riservato alle "Supergiganti blu", qualunque posizione si scelga per l'etichetta).
function haloText(ctx, text, x, y, align) {
  ctx.textAlign = align || 'left';
  ctx.lineWidth = 3; ctx.strokeStyle = T.bg; ctx.globalAlpha = 0.9; ctx.strokeText(text, x, y);
  ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(232,110,224,0.95)'; ctx.fillText(text, x, y);
}
function drawPopulationLabels(ctx) {
  ctx.font = 'italic 9px "Space Mono",monospace';
  haloText(ctx, 'Supergiganti blu', xOf(BVMIN + 0.1), yOf(LMAX - 0.3), 'left');
  haloText(ctx, 'ramo delle giganti', xOf(1.1), yOf(2.2), 'left');
  haloText(ctx, 'Sequenza Principale', xOf(1.55), yOf(-2.3), 'right');
  const lx = xOf(-0.05), ly = yOf(-1.7), tx = xOf(0.35), ty = yOf(-2.9);
  ctx.strokeStyle = 'rgba(232,110,224,0.55)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(lx, ly); ctx.quadraticCurveTo((lx + tx) / 2 + 20, (ly + ty) / 2, tx, ty); ctx.stroke();
  haloText(ctx, 'nane bianche', xOf(-0.05), yOf(-1.55), 'left');
}

function draw(canvas) {
  const [ctx, W, H] = Lab.ctx2d(canvas);
  T = pal();
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
  drawGrid(ctx, W, H);
  geom(W, H);
  drawAxes(ctx);

  ctx.save(); ctx.beginPath(); ctx.rect(G.plot.x0, G.plot.y0, G.plot.w, G.plot.h); ctx.clip();
  drawBackgroundStars(ctx);
  drawPopulationLabels(ctx);

  // traccia percorsa: un SOLO stroke() sull'intero path (mai un segmento per chiamata — chiamate
  // separate si sommerebbero in opacità fino a sembrare quasi piene anche partendo da alpha basse)
  if (P.showTrail && trail.length > 1) {
    ctx.beginPath();
    trail.forEach((p, i) => { const x = xOfT(p.logT), y = yOf(p.logL); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.strokeStyle = 'rgba(255,157,77,0.85)'; ctx.lineWidth = 2; ctx.stroke();
  }

  // tappe già raggiunte: pallino + etichetta (i lampi/eventi istantanei condividono la posizione
  // del punto precedente, quindi non ricevono una propria etichetta — si sovrapporrebbe)
  if (track) {
    ctx.font = '7px "Space Mono",monospace';
    for (let i = 0; i <= phaseIdx; i++) {
      const p = track.points[i]; if (!p || !Number.isFinite(p.logT) || p.isFlash) continue;
      const x = xOfT(p.logT), y = yOf(p.logL);
      ctx.fillStyle = T.txt; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TWO); ctx.fill();
      // allineamento preferito alternato per varietà visiva, ma capovolto se farebbe uscire il
      // testo dal riquadro ritagliato (capita per le stelle molto calde, vicine al bordo sinistro)
      let align = i % 2 ? 'left' : 'right';
      const w = ctx.measureText(p.name).width;
      if (align === 'right' && x - 6 - w < G.plot.x0) align = 'left';
      else if (align === 'left' && x + 6 + w > G.plot.x1) align = 'right';
      ctx.textAlign = align; ctx.fillStyle = T.txt;
      ctx.fillText(p.name, x + (align === 'left' ? 6 : -6), y - 5);
    }
  }

  // lampo (flash dell'elio / supernova): un cerchio che cresce e sfuma, indipendente dalla scala L
  if (curInto && curInto.isFlash && segU > 0 && segU < 1 && !curRemnant) {
    const x = xOfT(curLogT), y = yOf(curLogL);
    const env = Math.sin(segU * Math.PI);
    const big = !!curInto.isSupernova;
    const r = 8 + (big ? 150 : 34) * env;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    const col = big ? '255,225,180' : '255,255,220';
    grad.addColorStop(0, `rgba(${col},${(0.9 * env).toFixed(2)})`);
    grad.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, r, 0, TWO); ctx.fill();
  }

  // stella corrente (nascosta se è già un residuo compatto senza fotosfera)
  if (!curRemnant && Number.isFinite(curLogT)) {
    const x = xOfT(curLogT), y = yOf(curLogL);
    const col = teffToColor(Math.pow(10, curLogT));
    const r = clamp(5 + 1.7 * (curLogL + 3), 4, 15);
    ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = r * 1.8;
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TWO); ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // residuo compatto: etichetta fissa vicino all'ultimo punto valido (il nucleo non ha più una
  // fotosfera "normale": non avrebbe senso continuare a piazzarlo sugli stessi assi T-L)
  if (curRemnant) {
    const last = trail.length ? trail[trail.length - 1] : null;
    const x = last ? clamp(xOfT(last.logT), G.plot.x0 + 20, G.plot.x1 - 20) : G.plot.x0 + G.plot.w * 0.3;
    const y = last ? clamp(yOf(last.logL), G.plot.y0 + 20, G.plot.y1 - 20) : G.plot.y0 + 40;
    const a = Math.min(1, segU * 1.4);
    const isBH = curInto.name === 'Buco Nero';
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = isBH ? '#000' : '#dfe8f2';
    ctx.strokeStyle = isBH ? 'rgba(180,140,255,0.9)' : 'rgba(150,190,255,0.9)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(x, y, isBH ? 9 : 4, 0, TWO); ctx.fill(); ctx.stroke();
    ctx.fillStyle = T.txt; ctx.font = 'bold 10px "Space Mono",monospace'; ctx.textAlign = 'center';
    ctx.fillText(curInto.name, x, y - 16);
    ctx.restore();
  }

  // intestazione
  ctx.textAlign = 'left';
  ctx.fillStyle = T.accent; ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.fillText('Evoluzione Stellare — diagramma H-R', 14, 20);
  ctx.fillStyle = T.txt; ctx.font = '10px "Space Mono",monospace';
  const catName = track ? CAT_LABEL[track.cat] : '';
  ctx.fillText(`M=${Lab.fmt(P.mass,2)} M☉  (${catName})   fase: ${curInto ? curInto.name : '—'}`, 14, 36);

  drawStarModelPanel(ctx);

  // suggerimento in basso
  ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
  const hint = (curInto && curInto.note) || 'più caldo a sinistra, più freddo a destra. La sequenza principale segue leggi di scala precise; il resto è un cammino qualitativo';
  wrapText(ctx, hint, G.plot.x0 + G.hintW / 2, G.hintY + 22, G.hintW - 10, 11);
}
function wrapText(ctx, text, cx, y, maxW, lh) {
  const words = text.split(' '); let line = '', lines = [];
  words.forEach(w => { const test = line ? line + ' ' + w : w; if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test; });
  if (line) lines.push(line);
  lines = lines.slice(-2);
  const y0 = y - (lines.length - 1) * lh;
  lines.forEach((l, i) => ctx.fillText(l, cx, y0 + i * lh));
}

// ═══ Colonna destra: modello di stella a scala compressa (nessun pannello/sfondo proprio — poggia
// direttamente sulla griglia comune, come il resto della scena) ═══════════════════
function drawStarModelPanel(ctx) {
  const r = G.right;
  const cx = (r.x0 + r.x1) / 2;
  ctx.textAlign = 'center';
  ctx.fillStyle = T.accent; ctx.font = 'bold 9px "Space Mono",monospace'; ctx.fillText('MODELLO DI STELLA', cx, r.y0 + 18);
  ctx.fillStyle = T.sub; ctx.font = '7px "Space Mono",monospace'; ctx.fillText('scala compressa, non lineare', cx, r.y0 + 30);

  const rSun = 30, sunY = r.y0 + 100;
  ctx.fillStyle = '#ffd76a'; ctx.save(); ctx.shadowColor = '#ffd76a'; ctx.shadowBlur = 20;
  ctx.beginPath(); ctx.arc(cx, sunY, rSun, 0, TWO); ctx.fill(); ctx.restore();
  ctx.fillStyle = T.sub; ctx.font = '8px "Space Mono",monospace'; ctx.fillText('☉ Sole (1 R☉)', cx, sunY + rSun + 16);

  const starY = sunY + rSun + 300;             // triplicato lo spazio verticale: da grande la stella non deve coprire il Sole sopra
  const maxR = clamp(Math.min((r.x1 - r.x0) / 2 - 18, r.y1 - starY - 30), 8, 140);

  if (!curRemnant && Number.isFinite(curLogT)) {
    const R = radiusFromLT(curLogL, curLogT);
    const rStar = clamp(22 * Math.pow(Math.max(R, 1e-4), 0.32), 6, maxR);
    const col = teffToColor(Math.pow(10, curLogT));
    ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = rStar * 0.8;
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, starY, rStar, 0, TWO); ctx.fill();
    ctx.restore();
    ctx.fillStyle = T.txt; ctx.font = 'bold 9px "Space Mono",monospace'; ctx.fillText(curInto ? curInto.name : '', cx, starY + rStar + 16);
    ctx.fillStyle = T.sub; ctx.font = '7px "Space Mono",monospace';
    ctx.fillText(`R≈${fmtNum(R, R < 1 ? 3 : 1)} R☉`, cx, starY + rStar + 28);
    ctx.fillText(`T≈${Math.round(Math.pow(10, curLogT)).toLocaleString('it-IT')} K`, cx, starY + rStar + 39);
  } else if (curRemnant) {
    const isBH = curInto && curInto.name === 'Buco Nero';
    ctx.fillStyle = isBH ? '#000' : '#dfe8f2';
    ctx.strokeStyle = isBH ? 'rgba(180,140,255,0.9)' : 'rgba(150,190,255,0.9)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(cx, starY, isBH ? 22 : 10, 0, TWO); ctx.fill(); ctx.stroke();
    ctx.fillStyle = T.txt; ctx.font = 'bold 9px "Space Mono",monospace'; ctx.fillText(curInto ? curInto.name : '', cx, starY + 38);
    ctx.fillStyle = T.sub; ctx.font = '7px "Space Mono",monospace'; ctx.fillText('~20 km, nessuna fotosfera', cx, starY + 50);
  }
}

// ═══ Grafici (3 pannelli): L(t), Teff(t), R(t) — assi FISSI, mai riscalati sui dati ═══
function graphDomainT() { return track.sliding ? { t0: Math.max(0, animT - track.slideWin), t1: Math.max(animT, track.slideWin) } : { t0: 0, t1: track.points._totalDur }; }
// grandezze della stella nel tempo (scale logaritmiche): asse dei tempi non lineare, le fasi brevi sono dilatate
function drawLogGraph(idx, title, color, valueOf, vmin, vmax) {
  if (!track) return;
  const { t0, t1 } = graphDomainT();
  const g = Lab.panel(gCanvas[idx], { title, xr: [t0, t1 || 1], xStep: 1e9, xFmt: () => '', yr: [Math.pow(10, vmin), Math.pow(10, vmax)], yLog: true, xLabel: 'evoluzione →' });
  if (!g) return; const [ctx, f] = g;
  Lab.plotPts(ctx, f, hist.map(p => [p.t, Math.max(valueOf(p), Math.pow(10, vmin))]), color, 2);
}
function drawGraphs() {
  drawLogGraph(0, 'Luminosità L (L☉)', '#00d4ff', p => p.L, LMIN, LMAX);
  drawLogGraph(1, 'Temperatura superficiale (K)', '#ff9d4d', p => p.T, TMIN, TMAX);
  drawLogGraph(2, 'Raggio R (R☉)', '#7fe0a0', p => p.R, RMIN, RMAX);
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
let massSlider;
function buildControls() {
  const cont = document.getElementById('controls'); cont.innerHTML = '';

  const sp = Lab.Section('Tipo di stella'); cont.appendChild(sp.el);
  sp.add(Lab.RadioGroup({
    label: 'Cammino evolutivo',
    value: 'sunlike',
    options: [
      { value: 'dwarf', label: 'Nana rossa', hint: '0.3 M☉' },
      { value: 'sunlike', label: 'Simile al Sole', hint: '1 M☉' },
      { value: 'massive', label: 'Stella massiccia', hint: '15 M☉' },
      { value: 'verymassive', label: 'Molto massiccia', hint: '30 M☉' },
    ],
    onChange(v) {
      const preset = { dwarf: 0.3, sunlike: 1, massive: 15, verymassive: 30 }[v];
      P.mass = preset; massSlider.setValue(preset); newRun();
    },
  }));

  const sm = Lab.Section('Massa iniziale'); cont.appendChild(sm.el);
  massSlider = Lab.Slider({ label: 'Massa M', min: 0.1, max: 40, step: 0.1, value: P.mass, unit: ' M☉', onChange(v) { P.mass = v; newRun(); } });
  sm.add(massSlider);

  const sv = Lab.Section('Visualizzazione'); cont.appendChild(sv.el);
  sv.add(Lab.Toggle({ label: 'Traccia evolutiva', value: P.showTrail, onChange(v) { P.showTrail = v; } }));
  sv.add(Lab.Slider({ label: 'Velocità animazione', min: 0.2, max: 6, step: 0.1, value: P.speed, unit: '×', onChange(v) { P.speed = v; } }));
}

function buildReadout() {
  const cont = document.getElementById('readout'); cont.innerHTML = '';
  readout = new Lab.Readout(cont, [
    { key: 'fase', label: 'fase' },
    { key: 'T', label: 'temperatura superficiale' },
    { key: 'L', label: 'luminosità' },
    { key: 'R', label: 'raggio' },
    { key: 'tempo', label: 'età della stella' },
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
  buildControls(); initGraphs(); buildReadout(); newRun();
  const simCanvas = document.getElementById('simCanvas');
  const btnPlay = document.getElementById('btnPlay');
  function syncPlay() { btnPlay.textContent = P.paused ? '▶  AVVIA' : '⏸  PAUSA'; }
  syncPlay();
  btnPlay.addEventListener('click', () => { P.paused = !P.paused; syncPlay(); });
  document.getElementById('btnReset').addEventListener('click', () => {
    P.mass = 1.0; P.showTrail = true; P.speed = 1.0; P.paused = false;
    buildControls(); newRun(); syncPlay();
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
      readout.set('fase', curInto ? curInto.name : '—');
      readout.set('T', curRemnant ? '—' : Math.round(Math.pow(10, curLogT)).toLocaleString('it-IT') + ' K');
      readout.set('L', curRemnant ? '—' : fmtNum(Math.pow(10, curLogL)) + ' L☉');
      readout.set('R', curRemnant ? '—' : fmtNum(radiusFromLT(curLogL, curLogT), radiusFromLT(curLogL, curLogT) < 1 ? 3 : 1) + ' R☉');
      readout.set('tempo', fmtGyr(realGyrElapsed()));
      readout.set('stato', track.sliding ? 'stabile (nana rossa)' : (ended ? 'evoluzione conclusa' : 'in evoluzione'));
    } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
