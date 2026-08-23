'use strict';

// ═══ Costanti ═══════════════════════════════════════════════════════════════
const TWO = Math.PI * 2;
const WORLD_R = 15;                                               // stessa scala del lab Relatività Generale (labs/gr) — unità geometriche G=c=1
// TIME_SCALE converte tempo-fisico (unità geometriche) in tempo-schermo: un solo fattore
// dichiarato, applicato alla dinamica orbitale ESATTA — stesso principio di PRECESSION_EXAGGERATION
// in foucault-pendulum e TIME_SLOWDOWN nel ciclotrone, qui tarato per far durare una fusione
// completa una trentina di secondi invece delle migliaia di unità fisiche che richiederebbe.
const TIME_SCALE = 150;
// La vera velocità di propagazione delle onde è la stessa c=1 della dinamica orbitale — ma a
// quella velocità la lunghezza d'onda (λ=c·T_gw) è SEMPRE molto più grande della separazione
// orbitale (è proprio la condizione v_orbita≪c che rende valida l'approssimazione di quadrupolo
// usata qui), quindi una spirale a più bracci come quella dell'immagine di riferimento non
// entrerebbe mai nella finestra visibile a scala realistica — esattamente come in OGNI
// illustrazione divulgativa di questo fenomeno, anche quella di riferimento. Si mostra quindi la
// propagazione a una velocità "artistica" più lenta (dichiarata qui, mai nella dinamica orbitale,
// che resta quella vera): cambia solo quanto la spirale appare avvolta sullo schermo, non la
// fisica del chirp (raddoppio di frequenza, aumento vicino alla fusione).
const WAVE_DELAY_PER_UNIT = 22;                                   // unità di tempo fisico di ritardo per unità di distanza mostrata
const WAVE_AMP_SCALE = 900;
// Il decadimento 1/d è quello vero della radiazione, ma preso alla lettera vicino alla sorgente fa
// crescere l'ampiezza (e quindi il dislivello fra punti vicini della griglia) più in fretta di
// quanto la semplice tecnica di disegno a "linee ordinate per profondità media" (la stessa già
// usata in labs/gr) riesca a gestire senza intrecciarsi visivamente — si applica quindi un raggio
// di attenuazione minimo dichiarato, puramente per la resa grafica, mai nella fisica del chirp.
const WAVE_NEAR_SOFTEN = 2.6;
const RING_DECAY_RATE = 0.02;                                     // smorzamento del "ringdown" qualitativo dopo la fusione — espresso in unità di tempo FISICO, quindi già coerente con TIME_SCALE (un tasso tarato sui secondi reali sarebbe durato una frazione di frame, impercettibile, una volta compresso il tempo)
const RADIATED_FRACTION = 0.05;                                   // frazione tipica di massa irraggiata in una fusione di buchi neri di massa comparabile (~5%, come GW150914)

const P = {
  m1: 0.15, m2: 0.15,        // masse dei due buchi neri (unità geometriche G=c=1, Rs=2m)
  r0: 6,                       // separazione iniziale
  showWaves: true,
  showWaveLine: false,
  speed: 1.0,
  paused: false,
};

let tPhys = 0, last = 0;
let D = null;                                                     // quantità derivate dal lancio corrente (k, tMerge, ...)
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
    ring: d ? 'rgba(150,175,205,0.4)' : 'rgba(60,95,130,0.45)', grid: d ? 'rgba(80,190,230,0.28)' : 'rgba(0,100,180,0.22)',
    gBg: d ? 'rgb(3,9,22)' : '#eef2f7', gAxis: d ? 'rgba(100,155,210,0.3)' : 'rgba(40,80,130,0.32)', gText: d ? 'rgba(150,205,225,0.88)' : 'rgba(25,65,105,0.92)',
  };
}
let T = pal();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ═══ Fisica: inspiral in forma chiusa (approssimazione di quadrupolo, ordine dominante) ═══════
// Due masse in orbita circolare perdono energia per emissione di onde gravitazionali (formula del
// quadrupolo): questo fa decadere la separazione secondo dr/dt=−(64/5)·G³/c⁵·m₁m₂(m₁+m₂)/r³ — in
// unità geometriche G=c=1, dr/dt=−k/r³ con k=(64/5)m₁m₂(m₁+m₂). Questa equazione, a differenza di
// quasi tutto ciò che riguarda la vera dinamica di due buchi neri (che richiede relatività
// numerica), si integra ESATTAMENTE: r³dr=−k dt → r(t)=(r₀⁴−4kt)^(1/4). Usando ω(r)=√(M/r³)
// (orbita kepleriana, M=m₁+m₂) si può integrare anche la fase φ(t)=∫ω dt in forma chiusa (calcolo
// diretto per sostituzione, mai fatto per iscritto nei testi standard ma non più difficile):
//   φ(t) = (2√M)/(5k) · [ r₀^(5/2) − r(t)^(5/2) ]
// — derivata verificata: dφ/dt = √M·r(t)^(−3/2) = ω(t) ✓. Nessuna integrazione numerica in tutta
// la fase di inspiral. Il modello smette di essere valido (per la vera fisica, non per questa
// implementazione) quando l'approssimazione post-newtoniana perde senso, cosa che qui si fa
// coincidere con il contatto fra i due orizzonti degli eventi (r=2m₁+2m₂) — la vera coalescenza
// richiederebbe relatività numerica, non modellata: dopo quel punto si mostra un singolo buco nero
// finale (con una frazione tipica di massa irraggiata) e un rapido, dichiaratamente qualitativo,
// smorzamento dell'ultima increspatura, non un vero ringdown a modi quasi-normali.
function newRun() {
  tPhys = 0;
  const m1 = P.m1, m2 = P.m2, M = m1 + m2;
  const k = (64 / 5) * m1 * m2 * M;
  const r0 = P.r0;
  const rMerge = 2 * M * 1.05;
  const tMerge = (Math.pow(r0, 4) - Math.pow(rMerge, 4)) / (4 * k);
  const phiMerge = (2 * Math.sqrt(M) / (5 * k)) * (Math.pow(r0, 2.5) - Math.pow(rMerge, 2.5));
  D = { m1, m2, M, k, r0, rMerge, tMerge, phiMerge };
}
function stateAt(tp) {
  if (tp >= D.tMerge) return { merged: true, r: D.rMerge, phi: D.phiMerge, x1: 0, y1: 0, x2: 0, y2: 0 };
  const r = Math.pow(Math.pow(D.r0, 4) - 4 * D.k * tp, 0.25);
  const phi = (2 * Math.sqrt(D.M) / (5 * D.k)) * (Math.pow(D.r0, 2.5) - Math.pow(r, 2.5));
  const f1 = D.m2 / D.M, f2 = D.m1 / D.M;
  return {
    merged: false, r, phi,
    x1: f1 * r * Math.cos(phi), y1: f1 * r * Math.sin(phi),
    x2: -f2 * r * Math.cos(phi), y2: -f2 * r * Math.sin(phi),
  };
}
function orbFreq(r) { return Math.sqrt(D.M / (r * r * r)) / TWO; }   // Hz "geometrici" (cicli per unità di tempo fisico)
function step(dtScreen) { tPhys += dtScreen * P.speed * TIME_SCALE; }

function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
// fase (φ_ret o φ_merge) al tempo ritardato corrispondente alla distanza d, in forma chiusa —
// la stessa funzione usata sia per l'increspatura della griglia sia per tracciare la linea del
// fronte d'onda, così le due cose restano sempre coerenti fra loro
function retardedPhase(d) {
  const tRet = tPhys - d * WAVE_DELAY_PER_UNIT;
  if (tRet < 0) return null;
  if (tRet >= D.tMerge) return { phi: D.phiMerge, decay: Math.exp(-(tRet - D.tMerge) * RING_DECAY_RATE) };
  const rRet = Math.pow(Math.pow(D.r0, 4) - 4 * D.k * tRet, 0.25);
  const phi = (2 * Math.sqrt(D.M) / (5 * D.k)) * (Math.pow(D.r0, 2.5) - Math.pow(rRet, 2.5));
  return { phi, rRet, decay: 1 };
}
// increspatura dell'onda in un punto della griglia, a tempo ritardato (propagazione verso l'esterno):
// l'ampiezza ~ m₁m₂/r (momento di quadrupolo) diviso per la distanza (decadimento di radiazione
// 1/d). La dipendenza dall'angolo θ=atan2(y,x) — non solo dalla distanza — è ciò che trasforma un
// insieme di increspature CONCENTRICHE in una vera SPIRALE: il quadrupolo ruota, quindi il fronte
// osservato in una direzione porta l'impronta della fase φ che la sorgente aveva quando quell'onda
// è partita, combinata con la direzione stessa — il pattern di radiazione (l=2,m=2) dipende da
// 2(θ−φ_ret), fatto fisico reale (lo stesso che dà ai bracci della spirale la simmetria a due punte
// di un sistema binario), non un abbellimento estetico. Vicino al centro l'ampiezza si smorza con
// una dissolvenza morbida (mai un taglio netto) per evitare una cucitura visibile nel punto dove
// tutte le direzioni angolari convergono.
function waveAtRet(x, y) {
  const d = Math.hypot(x, y);
  const near = smoothstep(0.6, 2.4, d);
  if (near <= 0) return 0;
  const ph = retardedPhase(d);
  if (!ph || ph.decay < 0.015) return 0;
  const theta = Math.atan2(y, x);
  const rEff = ph.rRet !== undefined ? ph.rRet : D.rMerge;
  const amp = WAVE_AMP_SCALE * (D.m1 * D.m2) / Math.max(rEff, D.rMerge * 0.5) / Math.max(d, WAVE_NEAR_SOFTEN);
  return amp * Math.cos(2 * (theta - ph.phi)) * ph.decay * near;
}

// ═══ Rendering 3D (proiezione prospettica, stesso schema di labs/gr) ═══════════════════════════
let CAM = { azim: 0.4, elev: 0.85, fov: 30 };
let zoomFactor = 3.0;
let camDrag = null;
let _ca = 1, _sa = 0, _ce = 1, _se = 0, _ps = 160;
function geom(W, H) { G = { cx: W * 0.5, cy: H * 0.54, W, H }; }
function updateProjCache() {
  _ca = Math.cos(CAM.azim); _sa = Math.sin(CAM.azim);
  _ce = Math.cos(CAM.elev); _se = Math.sin(CAM.elev);
  _ps = Math.min(G.W, G.H) * 0.026 * zoomFactor;
}
function project3D(wx, wy, wz) {
  const rx = wx * _ca + wy * _sa, ry = -wx * _sa + wy * _ca;
  const px = rx, py = ry * _ce + wz * _se, pz = -ry * _se + wz * _ce;
  const d = CAM.fov - pz;
  if (d < 0.01) return null;
  const sc = (CAM.fov / d) * _ps;
  return { sx: G.cx + px * sc, sy: G.cy - py * sc, depth: pz };
}
function flammZ(r, Rs) { return r <= Rs ? 0 : 2.0 * Math.sqrt(Rs * (r - Rs)); }
const FUNNEL_CAP_MULT = 14;                                       // il vero paraboloide di Flamm continua a crescere come √r all'infinito (una "tromba" che si allarga sempre, corretta per l'embedding ma non per QUESTA illustrazione): oltre 14 raggi di Schwarzschild si appiattisce, così lontano dai due buchi neri il foglio torna piatto e le onde propaganti restano ben visibili sopra di esso, come nell'immagine di riferimento, invece di essere sovrastate da una china sempre crescente
// altezza della griglia in un punto: somma dei due imbuti di Flamm (uno per buco nero — sovrapposizione
// lineare approssimata, la vera metrica a due corpi non ha soluzione esatta; stessa idea già usata
// in labs/gr per il corpo secondario in orbita) più l'increspatura dell'onda propagante
function heightAt(x, y, st) {
  let z = 0;
  if (!st.merged) {
    const Rs1 = 2 * D.m1, Rs2 = 2 * D.m2;
    z += flammZ(Math.min(Math.max(Math.hypot(x - st.x1, y - st.y1), Rs1), Rs1 * FUNNEL_CAP_MULT), Rs1);
    z += flammZ(Math.min(Math.max(Math.hypot(x - st.x2, y - st.y2), Rs2), Rs2 * FUNNEL_CAP_MULT), Rs2);
  } else {
    const RsF = 2 * D.M * (1 - RADIATED_FRACTION);
    z += flammZ(Math.min(Math.max(Math.hypot(x, y), RsF), RsF * FUNNEL_CAP_MULT), RsF);
  }
  if (P.showWaves) z += waveAtRet(x, y);
  return z;
}
function isInsideHorizon(x, y, st) {
  if (st.merged) { const RsF = 2 * D.M * (1 - RADIATED_FRACTION); return Math.hypot(x, y) < RsF * 0.97; }
  return Math.hypot(x - st.x1, y - st.y1) < 2 * D.m1 * 0.97 || Math.hypot(x - st.x2, y - st.y2) < 2 * D.m2 * 0.97;
}
function buildGridLines(st) {
  const STEP = 0.6, NSAMP = 130, lines = [];
  function buildLine(pts) { let dSum = 0, n = 0; for (const p of pts) if (p) { dSum += p.depth; n++; } lines.push({ pts, avgDepth: n > 0 ? dSum / n : 0 }); }
  for (let xW = -WORLD_R; xW <= WORLD_R + 1e-6; xW += STEP) {
    const pts = [];
    for (let k = 0; k <= NSAMP; k++) { const yW = -WORLD_R + 2 * WORLD_R * k / NSAMP; pts.push(isInsideHorizon(xW, yW, st) ? null : project3D(xW, yW, heightAt(xW, yW, st))); }
    buildLine(pts);
  }
  for (let yW = -WORLD_R; yW <= WORLD_R + 1e-6; yW += STEP) {
    const pts = [];
    for (let k = 0; k <= NSAMP; k++) { const xW = -WORLD_R + 2 * WORLD_R * k / NSAMP; pts.push(isInsideHorizon(xW, yW, st) ? null : project3D(xW, yW, heightAt(xW, yW, st))); }
    buildLine(pts);
  }
  return lines;
}
// buco nero come sfera nera 3D (non più un disco piatto): il centro sta a un'altezza Rs sopra il
// piano z=0 della griglia (dove il paraboloide di Flamm vale esattamente 0 sull'orizzonte), così
// la sfera poggia visivamente sul foglio deformato invece di attraversarlo a metà. Il raggio a
// schermo si ottiene proiettando anche un punto sul bordo (a distanza Rs dal centro) e misurando
// la distanza in pixel: l'unico modo corretto di ottenere un raggio apparente coerente con una
// proiezione prospettica, che non scala i punti in modo uniforme.
function drawBlackSphere(ctx, cx, cy, Rs, rimColor) {
  const pc = project3D(cx, cy, Rs), pe = project3D(cx + Rs, cy, Rs);
  if (!pc || !pe) return;
  const r = Math.max(3, Math.hypot(pe.sx - pc.sx, pe.sy - pc.sy));
  const grad = ctx.createRadialGradient(pc.sx - r * 0.35, pc.sy - r * 0.4, r * 0.05, pc.sx, pc.sy, r * 1.15);
  grad.addColorStop(0, 'rgba(55,55,65,0.95)');
  grad.addColorStop(0.55, 'rgba(8,8,12,0.98)');
  grad.addColorStop(1, '#000000');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(pc.sx, pc.sy, r, 0, TWO); ctx.fill();
  ctx.strokeStyle = rimColor; ctx.lineWidth = 1.6; ctx.stroke();
}
// linea verde che ripercorre un fronte d'onda (una cresta, dove cos(2(θ−φ_ret))=1): poiché
// θ_cresta(d)=φ_ret(d) è già in forma chiusa (la stessa usata per l'increspatura della griglia),
// non serve alcuna ricerca numerica — si campiona direttamente in coordinate polari (d,θ_cresta(d))
// per ottenere la spirale esatta. Due bracci (sfasati di π) per la simmetria a due punte del
// quadrupolo di un sistema binario.
function waveCrestPoints(armOffset) {
  const pts = [], dMax = WORLD_R * 1.5, steps = 260;
  for (let i = 0; i <= steps; i++) {
    const d = 0.7 + (dMax - 0.7) * i / steps;
    const ph = retardedPhase(d);
    if (!ph || ph.decay < 0.05) { if (pts.length) pts.push(null); continue; }
    const theta = ph.phi + armOffset;
    pts.push([d * Math.cos(theta), d * Math.sin(theta)]);
  }
  return pts;
}
function drawWaveCrest(ctx, st, armOffset) {
  const pts = waveCrestPoints(armOffset);
  ctx.beginPath(); let started = false;
  for (const p of pts) {
    if (!p) { started = false; continue; }
    const [x, y] = p;
    const s = project3D(x, y, heightAt(x, y, st) + 0.05);
    if (!s) { started = false; continue; }
    started ? ctx.lineTo(s.sx, s.sy) : (ctx.moveTo(s.sx, s.sy), started = true);
  }
  ctx.stroke();
}

function draw(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  T = pal();
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
  geom(W, H); updateProjCache();

  const st = stateAt(tPhys);

  const lines = buildGridLines(st);
  lines.sort((a, b) => a.avgDepth - b.avgDepth);
  ctx.lineWidth = 0.9; ctx.strokeStyle = T.grid;
  for (const { pts } of lines) {
    ctx.beginPath(); let started = false;
    for (const p of pts) {
      if (!p) { started = false; continue; }
      started ? ctx.lineTo(p.sx, p.sy) : (ctx.moveTo(p.sx, p.sy), started = true);
    }
    ctx.stroke();
  }

  if (P.showWaveLine && !st.merged) {
    ctx.strokeStyle = 'rgba(80,230,140,0.85)'; ctx.lineWidth = 1.6;
    drawWaveCrest(ctx, st, 0);
    drawWaveCrest(ctx, st, Math.PI);
  }

  if (!st.merged) {
    drawBlackSphere(ctx, st.x1, st.y1, 2 * D.m1, 'rgba(255,160,50,0.85)');
    drawBlackSphere(ctx, st.x2, st.y2, 2 * D.m2, 'rgba(120,190,255,0.85)');
  } else {
    drawBlackSphere(ctx, 0, 0, 2 * D.M * (1 - RADIATED_FRACTION), 'rgba(255,200,120,0.9)');
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = T.accent; ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.fillText('Onde Gravitazionali — fusione di due buchi neri', 14, 22);
  ctx.fillStyle = T.txt; ctx.font = '10px "Space Mono",monospace';
  ctx.fillText(`m₁=${D.m1.toFixed(2)}   m₂=${D.m2.toFixed(2)}   r=${st.merged ? '—' : st.r.toFixed(2)}   ${st.merged ? 'fuso' : 'in avvicinamento'}`, 14, 40);

  ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText((st.merged ? 'buco nero finale — l\'inspiral è concluso' : 'la separazione decresce, la frequenza aumenta: il "chirp"') + ' — trascina per ruotare la vista', W / 2, H - 10);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
function gBase(ctx, W, H, PAD) {
  ctx.fillStyle = T.gBg; ctx.fillRect(0, 0, W, H);
  const gW = W - PAD.l - PAD.r, gH = H - PAD.t - PAD.b;
  ctx.strokeStyle = T.gAxis; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(PAD.l, PAD.t); ctx.lineTo(PAD.l, PAD.t + gH); ctx.lineTo(PAD.l + gW, PAD.t + gH); ctx.stroke();
  return { gW, gH };
}
// 1: frequenza dell'onda gravitazionale nel tempo — il "chirp": dominio FISSO [0,tMerge] per il
// lancio corrente (ricalcolato solo su nuovi parametri, mai sul tempo che passa)
function drawGraphChirp() {
  const cv = gCanvas[0]; if (!cv || !cv.width || !D) return;
  const ctx = gCtx[0], W = cv.width, H = cv.height, PAD = { t: 14, b: 14, l: 30, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const tMax = D.tMerge, fMax = 2 * orbFreq(D.rMerge);
  const xOf = t => PAD.l + clamp(t / tMax, 0, 1) * gW;
  const yOf = f => PAD.t + gH - clamp(f / fMax, 0, 1) * gH;
  ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 1.4; ctx.beginPath();
  for (let i = 0; i <= 200; i++) { const t = tMax * i / 200; const r = Math.pow(Math.pow(D.r0, 4) - 4 * D.k * t, 0.25); const f = 2 * orbFreq(r); const x = xOf(t), y = yOf(f); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke();
  if (tPhys < D.tMerge) { const st = stateAt(tPhys); ctx.fillStyle = '#ff9d4d'; ctx.beginPath(); ctx.arc(xOf(tPhys), yOf(2 * orbFreq(st.r)), 3, 0, TWO); ctx.fill(); }
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('frequenza onda (cicli/unità)', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('t', PAD.l + gW - 2, PAD.t + gH - 3);
}
// 2: separazione r(t) — stesso dominio fisso
function drawGraphSeparation() {
  const cv = gCanvas[1]; if (!cv || !cv.width || !D) return;
  const ctx = gCtx[1], W = cv.width, H = cv.height, PAD = { t: 14, b: 14, l: 26, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const tMax = D.tMerge;
  const xOf = t => PAD.l + clamp(t / tMax, 0, 1) * gW;
  const yOf = r => PAD.t + gH - clamp(r / D.r0, 0, 1) * gH;
  ctx.strokeStyle = '#7fe0a0'; ctx.lineWidth = 1.4; ctx.beginPath();
  for (let i = 0; i <= 200; i++) { const t = tMax * i / 200; const r = Math.pow(Math.pow(D.r0, 4) - 4 * D.k * t, 0.25); const x = xOf(t), y = yOf(r); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke();
  if (tPhys < D.tMerge) { const st = stateAt(tPhys); ctx.fillStyle = '#ff9d4d'; ctx.beginPath(); ctx.arc(xOf(tPhys), yOf(st.r), 3, 0, TWO); ctx.fill(); }
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('separazione r', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('t', PAD.l + gW - 2, PAD.t + gH - 3);
}
// 3: forma d'onda (strain) — ampiezza ~ m₁m₂/r che oscilla a 2φ(t), il classico "chirp" del
// segnale rivelato — dominio fisso, ampiezza normalizzata al valore massimo raggiunto alla fusione
function drawGraphStrain() {
  const cv = gCanvas[2]; if (!cv || !cv.width || !D) return;
  const ctx = gCtx[2], W = cv.width, H = cv.height, PAD = { t: 14, b: 14, l: 14, r: 10 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const tMax = D.tMerge, hMax = (D.m1 * D.m2) / D.rMerge, zero = PAD.t + gH / 2;
  ctx.strokeStyle = T.gAxis; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(PAD.l, zero); ctx.lineTo(PAD.l + gW, zero); ctx.stroke();
  const xOf = t => PAD.l + clamp(t / tMax, 0, 1) * gW;
  const yOf = h => zero - clamp(h / hMax, -1, 1) * (gH * 0.46);
  ctx.strokeStyle = '#ff9d4d'; ctx.lineWidth = 1; ctx.beginPath();
  for (let i = 0; i <= 900; i++) {
    const t = tMax * i / 900, r = Math.pow(Math.pow(D.r0, 4) - 4 * D.k * t, 0.25);
    const phi = (2 * Math.sqrt(D.M) / (5 * D.k)) * (Math.pow(D.r0, 2.5) - Math.pow(r, 2.5));
    const h = (D.m1 * D.m2 / r) * Math.cos(2 * phi);
    const x = xOf(t), y = yOf(h); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('h(t) — forma d\'onda', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('t', PAD.l + gW - 2, PAD.t + gH - 3);
}
function drawGraphs() {
  const titles = ['Frequenza — il "chirp"', 'Separazione r(t)', 'Forma d\'onda h(t)'];
  for (let i = 0; i < 3; i++) if (gTitle[i]) gTitle[i].textContent = titles[i];
  drawGraphChirp(); drawGraphSeparation(); drawGraphStrain();
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls() {
  const cont = document.getElementById('controls'); cont.innerHTML = '';

  const sb = Lab.Section('Buchi neri'); cont.appendChild(sb.el);
  sb.add(Lab.Slider({ label: 'Massa 1', min: 0.05, max: 0.3, step: 0.01, value: P.m1, unit: '', onChange(v) { P.m1 = v; newRun(); } }));
  sb.add(Lab.Slider({ label: 'Massa 2', min: 0.05, max: 0.3, step: 0.01, value: P.m2, unit: '', onChange(v) { P.m2 = v; newRun(); } }));
  sb.add(Lab.Slider({ label: 'Separazione iniziale', min: 3, max: 9, step: 0.2, value: P.r0, unit: '', onChange(v) { P.r0 = v; newRun(); } }));
  const bNew = document.createElement('button'); bNew.className = 'ctrl-btn'; bNew.textContent = 'Nuova fusione';
  bNew.addEventListener('click', () => newRun());
  sb.add(bNew);

  const sv = Lab.Section('Visualizzazione'); cont.appendChild(sv.el);
  sv.add(Lab.Toggle({ label: 'Mostra onde gravitazionali', value: P.showWaves, onChange(v) { P.showWaves = v; } }));
  sv.add(Lab.Toggle({ label: 'Evidenzia fronti d\'onda (linea verde)', value: P.showWaveLine, onChange(v) { P.showWaveLine = v; } }));
  sv.add(Lab.Slider({ label: 'Velocità animazione', min: 0.2, max: 3, step: 0.1, value: P.speed, unit: '×', onChange(v) { P.speed = v; } }));
}

function buildReadout() {
  const cont = document.getElementById('readout'); cont.innerHTML = '';
  readout = new Lab.Readout(cont, [
    { key: 'sep', label: 'Separazione r' },
    { key: 'forb', label: 'Frequenza orbitale' },
    { key: 'fgw', label: 'Frequenza onda' },
    { key: 'ttm', label: 'Tempo alla fusione' },
    { key: 'stato', label: 'Stato' },
  ]);
}

function initGraphs() {
  const ga = document.getElementById('graphArea');
  ga.style.cssText = 'display:flex;flex-direction:row;gap:5px;padding:5px 0 3px;height:150px;box-sizing:border-box;border-top:1px solid rgba(100,150,200,0.14);';
  for (let i = 0; i < 3; i++) {
    const panel = document.createElement('div');
    panel.style.cssText = 'flex:1;min-width:0;position:relative;background:rgba(2,7,18,0.8);border:1px solid rgba(100,150,200,0.11);border-radius:4px;overflow:hidden;';
    const title = document.createElement('div'); title.textContent = '';
    title.style.cssText = 'position:absolute;top:3px;left:6px;font-size:8px;color:rgba(100,175,200,0.65);font-family:"Space Mono",monospace;text-transform:uppercase;letter-spacing:0.4px;z-index:1;pointer-events:none;';
    const cv = document.createElement('canvas'); cv.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';
    panel.appendChild(title); panel.appendChild(cv); ga.appendChild(panel);
    gCanvas[i] = cv; gCtx[i] = cv.getContext('2d'); gTitle[i] = title;
  }
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
    P.m1 = 0.15; P.m2 = 0.15; P.r0 = 6; P.showWaves = true; P.showWaveLine = false; P.speed = 1.0; P.paused = false;
    buildControls(); newRun(); syncPlay();
  });

  // telecamera orbitale: trascina per ruotare (azimut/elevazione), rotella per zoomare
  simCanvas.style.cursor = 'grab';
  simCanvas.addEventListener('pointerdown', e => {
    camDrag = { x: e.clientX, y: e.clientY, az: CAM.azim, el: CAM.elev };
    simCanvas.setPointerCapture(e.pointerId);
    simCanvas.style.cursor = 'grabbing';
  });
  simCanvas.addEventListener('pointermove', e => {
    if (!camDrag) return;
    const dx = e.clientX - camDrag.x, dy = e.clientY - camDrag.y;
    CAM.azim = camDrag.az + dx * 0.008;
    CAM.elev = clamp(camDrag.el - dy * 0.008, 0.08, 1.4);
  });
  simCanvas.addEventListener('pointerup', () => { camDrag = null; simCanvas.style.cursor = 'grab'; });
  simCanvas.addEventListener('pointercancel', () => { camDrag = null; simCanvas.style.cursor = 'grab'; });
  simCanvas.addEventListener('wheel', e => {
    e.preventDefault();
    zoomFactor = clamp(zoomFactor * (e.deltaY > 0 ? 0.92 : 1.08), 0.5, 10);
  }, { passive: false });

  function resize() {
    const area = document.querySelector('.lab-canvas-area'); if (!area) return;
    const ar = area.getBoundingClientRect();
    const rb = document.getElementById('readout').getBoundingClientRect();
    const ga = document.getElementById('graphArea'); const gaH = ga ? ga.offsetHeight : 0;
    const h = Math.max(240, Math.floor(ar.height - rb.height - gaH - 4));
    simCanvas.style.width = Math.floor(ar.width) + 'px'; simCanvas.style.height = h + 'px';
    simCanvas.width = Math.floor(ar.width); simCanvas.height = h;
    for (const cv of gCanvas) { if (!cv) continue; cv.width = Math.floor(cv.parentElement.clientWidth); cv.height = Math.floor(cv.parentElement.clientHeight); }
  }
  resize();
  new ResizeObserver(resize).observe(document.querySelector('.lab-canvas-area'));
  window.addEventListener('load', resize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);

  last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000; last = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0; dt = Math.min(dt, 0.05);
    if (!P.paused) step(dt);
    try {
      draw(simCanvas); drawGraphs();
      const st = stateAt(tPhys);
      readout.set('sep', st.merged ? '—' : st.r.toFixed(2) + ' u');
      readout.set('forb', st.merged ? '—' : orbFreq(st.r).toFixed(3) + ' /u');
      readout.set('fgw', st.merged ? '—' : (2 * orbFreq(st.r)).toFixed(3) + ' /u');
      readout.set('ttm', st.merged ? 'fuso' : (D.tMerge - tPhys).toFixed(1) + ' u');
      readout.set('stato', st.merged ? 'buco nero fuso' : 'in avvicinamento (chirp)');
    } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
