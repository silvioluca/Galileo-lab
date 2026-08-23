'use strict';

// ═══ Costanti ═══════════════════════════════════════════════════════════════
const TWO = Math.PI * 2;
const Q_FACTOR = 22;                                            // "fattore di qualità" della risonanza: quanto è stretto il picco
const F0_SQUARE = 80;                                            // Hz, costante di calibrazione per la piastra quadrata
const F0_CIRCLE = 46;                                            // Hz, costante di calibrazione per la piastra circolare
const N_MODES_MAX = 5;                                           // indici di modo usati, da 0 a N_MODES_MAX

const P = {
  shape: 'square',          // 'square' | 'circle'
  freq: 320,                 // Hz, frequenza di eccitazione impostata dall'utente
  particleCount: 2500,
  speed: 0.7,
  showNodal: true,
  paused: false,
};

let animT = 0, last = 0;
let particles = [];
let modes = [];             // {n,m,f,label,(j per il cerchio)}
let curMode = null;
let amp = 0;                 // ampiezza di risposta attuale (0..1), si avvicina con un transitorio all'ampiezza di risonanza
let nodalPts = [];           // punti della linea nodale teorica del modo corrente (ricalcolati solo quando cambia il modo)
let hist = [];               // {t, amp, order} per i grafici
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
    ring: d ? 'rgba(150,175,205,0.4)' : 'rgba(60,95,130,0.45)', grid: d ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
    plate: d ? 'rgba(70,85,105,0.35)' : 'rgba(120,140,165,0.3)', sand: d ? 'rgba(230,238,250,0.85)' : 'rgba(30,45,70,0.85)',
    nodal: d ? 'rgba(0,212,255,0.28)' : 'rgba(10,120,176,0.3)',
    gBg: d ? 'rgb(3,9,22)' : '#eef2f7', gAxis: d ? 'rgba(100,155,210,0.3)' : 'rgba(40,80,130,0.32)', gText: d ? 'rgba(150,205,225,0.88)' : 'rgba(25,65,105,0.92)',
  };
}
let T = pal();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ═══ Funzioni di Bessel (serie di potenza + ricerca degli zeri) ═══════════════════
// Servono solo per la piastra circolare: i modi di una membrana/piastra circolare sono
// J_n(k·r)·cos(nθ), e la condizione al contorno (bordo libero preso qui, per semplicità, come
// bordo fisso J_n=0 — la stessa approssimazione standard usata per il tamburo circolare) fissa
// k·R = j_(n,m), l'm-esimo zero di J_n. Gli zeri sono trovati numericamente (bisezione), non presi
// da una tabella precompilata — coerente con l'idea di derivare la fisica invece di incollarla.
function factorial(k) { let r = 1; for (let i = 2; i <= k; i++) r *= i; return r; }
function besselJ(n, x) {
  if (x < 0) return (n % 2 === 0 ? 1 : -1) * besselJ(n, -x);
  let term = Math.pow(x / 2, n) / factorial(n), sum = 0;
  for (let k = 0; k < 45; k++) { sum += term; term *= -(x * x / 4) / ((k + 1) * (n + k + 1)); }
  return sum;
}
function besselJDeriv(n, x) { return n === 0 ? -besselJ(1, x) : (besselJ(n - 1, x) - besselJ(n + 1, x)) / 2; }
function besselZeros(n, count) {
  const zeros = []; let prev = besselJ(n, 0.01), x = 0.01; const step = 0.02;
  while (zeros.length < count && x < 60) {
    const xn = x + step, cur = besselJ(n, xn);
    if ((prev < 0) !== (cur < 0)) {
      let lo = x, hi = xn, signLo = prev < 0;
      for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if ((besselJ(n, mid) < 0) !== signLo) hi = mid; else lo = mid; }
      zeros.push((lo + hi) / 2);
    }
    prev = cur; x = xn;
  }
  return zeros;
}

// ═══ Forme dei modi ═══════════════════════════════════════════════════════════
// Piastra quadrata: sovrapposizione di due modi "a griglia" ruotati di 90°, la formula standard
// usata per generare figure di Chladni quadrate (approssima una piastra bloccata al centro con
// bordi liberi — il problema esatto non ha soluzione chiusa semplice). x,y ∈ [0,1].
function squareZ(n, m, x, y) {
  return Math.cos(n * Math.PI * x) * Math.cos(m * Math.PI * y) - Math.cos(m * Math.PI * x) * Math.cos(n * Math.PI * y);
}
function squareGrad(n, m, x, y) {
  const dzdx = -n * Math.PI * Math.sin(n * Math.PI * x) * Math.cos(m * Math.PI * y) + m * Math.PI * Math.sin(m * Math.PI * x) * Math.cos(n * Math.PI * y);
  const dzdy = -m * Math.PI * Math.cos(n * Math.PI * x) * Math.sin(m * Math.PI * y) + n * Math.PI * Math.cos(m * Math.PI * x) * Math.sin(n * Math.PI * y);
  return [dzdx, dzdy];
}
// Piastra circolare: J_n(j·r)·cos(nθ). x,y ∈ [-1,1] con r=√(x²+y²) ≤ 1.
function circleZ(n, j, x, y) {
  const r = Math.hypot(x, y), th = Math.atan2(y, x);
  return besselJ(n, j * r) * Math.cos(n * th);
}
function circleGrad(n, j, x, y) {
  const r = Math.max(Math.hypot(x, y), 1e-4), th = Math.atan2(y, x);
  const Jn = besselJ(n, j * r), Jnp = besselJDeriv(n, j * r);
  const dzdr = j * Jnp * Math.cos(n * th), dzdth = -n * Jn * Math.sin(n * th);
  return [dzdr * Math.cos(th) - dzdth * Math.sin(th) / r, dzdr * Math.sin(th) + dzdth * Math.cos(th) / r];
}
function modeZ(md, x, y) { return P.shape === 'square' ? squareZ(md.n, md.m, x, y) : circleZ(md.n, md.j, x, y); }
function modeGrad(md, x, y) { return P.shape === 'square' ? squareGrad(md.n, md.m, x, y) : circleGrad(md.n, md.j, x, y); }

// ═══ Elenco dei modi disponibili e loro frequenza ═════════════════════════════
// f ∝ (n²+m²) per la piastra quadrata (esatto per una piastra appoggiata, buona approssimazione
// qualitativa anche per il caso bloccata-al-centro) e f ∝ j_(n,m)² per quella circolare (stessa
// struttura, autovalore al quadrato) — le costanti F0 sono tarate solo per dare un intervallo di
// frequenze "credibile" (dell'ordine delle centinaia/migliaia di Hz delle dimostrazioni reali), non
// misurate su una piastra vera.
function buildModes() {
  const list = [];
  if (P.shape === 'square') {
    for (let n = 0; n <= N_MODES_MAX; n++) for (let m = n + 1; m <= N_MODES_MAX; m++) list.push({ n, m, f: F0_SQUARE * (n * n + m * m) });
  } else {
    for (let n = 0; n <= N_MODES_MAX; n++) besselZeros(n, 4).forEach((j, i) => list.push({ n, m: i + 1, j, f: F0_CIRCLE * j * j }));
  }
  list.sort((a, b) => a.f - b.f);
  return list;
}
function modeLabel(md) { return `(${md.n},${md.m})`; }
function lorentzian(f, f0) { const gamma = f0 / Q_FACTOR; return 1 / Math.sqrt(1 + Math.pow((f - f0) / (gamma / 2), 2)); }
function nearestMode() {
  let best = modes[0], bestResp = -1;
  for (const md of modes) { const r = lorentzian(P.freq, md.f); if (r > bestResp) { bestResp = r; best = md; } }
  return { mode: best, resp: bestResp };
}

// ═══ Audio (Web Audio API) ═══════════════════════════════════════════════════
// Il tono riprodotto è il segnale di eccitazione (quello che nella dimostrazione reale un
// generatore invia all'altoparlante sotto la piastra): ampiezza costante, sempre alla frequenza
// impostata — è la RISPOSTA della piastra a variare (la sabbia), non il segnale in ingresso.
let audioCtx = null, osc = null, gn = null, audioOn = false;
function startAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  osc = audioCtx.createOscillator(); gn = audioCtx.createGain();
  osc.type = 'sine'; osc.frequency.value = P.freq; gn.gain.value = 0.18;
  osc.connect(gn); gn.connect(audioCtx.destination);
  osc.start(); audioOn = true;
}
function updateAudioFreq() { if (audioCtx && osc) osc.frequency.setTargetAtTime(P.freq, audioCtx.currentTime, 0.02); }
function stopAudio() {
  if (osc) { osc.stop(); osc = null; }
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  audioOn = false;
  const b = document.getElementById('btnAudio'); if (b) b.textContent = '🔊  ASCOLTA';
}

// ═══ Particelle (granelli di sabbia) ═══════════════════════════════════════════
// Non è una simulazione granulare rigorosa (attrito di Coulomb fra grani, urti...) — troppo
// costosa per un browser — ma un modello a gradiente: ogni granello viene spinto lontano dai
// ventri di vibrazione (dove |z| è grande) verso le linee nodali (z=0), con una forza proporzionale
// all'ampiezza di risposta corrente e un rumore casuale che DOMINA quando si è fuori risonanza
// (replicando il comportamento reale: lontano da una frequenza propria la sabbia non si organizza).
//
// Attrito statico per granello: ogni granello ha una propria soglia fissa (assegnata alla nascita,
// non ricalcolata ogni frame — rappresenta una proprietà del singolo grano, tipo la sua rugosità)
// sotto la quale la forza che lo spinge verso il nodo non basta a smuoverlo. Senza questo, TUTTI i
// granelli convergerebbero esattamente sulla linea nodale matematica anche in perfetta risonanza —
// non è realistico: nella sabbia vera l'attrito fa sì che una parte dei grani resti bloccata prima
// di arrivarci, disperdendo la figura invece di una linea infinitamente sottile. La distribuzione è
// pesata verso soglie basse (la maggioranza dei grani raggiunge comunque la linea, disegnando una
// figura riconoscibile) con una coda di soglie alte (una minoranza resta visibilmente sparsa).
const STRENGTH = 5.5, DAMPING = 3.5, JITTER = 0.55, FRICTION_MAX = STRENGTH * 0.5;
function spawnParticles() {
  particles = [];
  for (let i = 0; i < P.particleCount; i++) {
    const friction = FRICTION_MAX * Math.pow(Math.random(), 2.2);
    if (P.shape === 'square') particles.push({ x: Math.random(), y: Math.random(), vx: 0, vy: 0, friction });
    else { const r = Math.sqrt(Math.random()), a = Math.random() * TWO; particles.push({ x: r * Math.cos(a), y: r * Math.sin(a), vx: 0, vy: 0, friction }); }
  }
}
function stepParticles(dt) {
  let sumAbsZ = 0;
  particles.forEach(p => {
    const z = modeZ(curMode, p.x, p.y);
    const [gx, gy] = modeGrad(curMode, p.x, p.y);
    sumAbsZ += Math.abs(z);
    const jx = (Math.random() - 0.5) * JITTER * (1 - amp * 0.9);
    const jy = (Math.random() - 0.5) * JITTER * (1 - amp * 0.9);
    const pullMag = Math.abs(z) * amp * STRENGTH;                // quanto forte la piastra "spinge" questo granello verso il nodo qui
    const pull = pullMag > p.friction ? 1 : 0;                    // sotto la propria soglia di attrito il granello non si stacca
    p.vx += (-z * gx * STRENGTH * amp * pull - p.vx * DAMPING) * dt + jx * Math.sqrt(dt);
    p.vy += (-z * gy * STRENGTH * amp * pull - p.vy * DAMPING) * dt + jy * Math.sqrt(dt);
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (P.shape === 'square') {
      if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx) * 0.3; } else if (p.x > 1) { p.x = 1; p.vx = -Math.abs(p.vx) * 0.3; }
      if (p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy) * 0.3; } else if (p.y > 1) { p.y = 1; p.vy = -Math.abs(p.vy) * 0.3; }
    } else {
      const r = Math.hypot(p.x, p.y);
      if (r > 1) { const s = 1 / r; p.x *= s; p.y *= s; const rad = (p.vx * p.x + p.vy * p.y) / r; p.vx -= 1.3 * rad * p.x / r; p.vy -= 1.3 * rad * p.y / r; }
    }
  });
  return sumAbsZ / particles.length;
}

// ═══ Linea nodale teorica (per confronto visivo con la sabbia) ═══════════════════
// Campiona una griglia fine e segna i punti dove il segno di z cambia rispetto al vicino — un
// modo economico di disegnare un contorno approssimato senza implementare marching squares.
function computeNodalPts() {
  const pts = []; const N = 140;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      let x, y, inside;
      if (P.shape === 'square') { x = i / N; y = j / N; inside = true; }
      else { x = -1 + 2 * i / N; y = -1 + 2 * j / N; inside = Math.hypot(x, y) <= 1; }
      if (!inside) continue;
      const z0 = modeZ(curMode, x, y);
      const xr = P.shape === 'square' ? Math.min(x + 1 / N, 1) : x + 2 / N;
      const yu = P.shape === 'square' ? Math.min(y + 1 / N, 1) : y + 2 / N;
      const zx = modeZ(curMode, xr, y), zy = modeZ(curMode, x, yu);
      if ((z0 < 0) !== (zx < 0) || (z0 < 0) !== (zy < 0)) pts.push([x, y]);
    }
  }
  return pts;
}

function newRun() {
  modes = buildModes();
  const nr = nearestMode(); curMode = nr.mode;
  spawnParticles();
  nodalPts = computeNodalPts();
  amp = 0; animT = 0; hist = [];
}

// ═══ Rendering ════════════════════════════════════════════════════════════════
function drawGrid(ctx, W, H) {
  ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}
function geom(W, H) {
  const cx = W * 0.5, cy = H * 0.54;
  const S = Math.min(W, H) * 0.34;
  G = { cx, cy, S, W, H };
}
function toScreen(x, y) {
  if (P.shape === 'square') return { sx: G.cx - G.S + 2 * G.S * x, sy: G.cy + G.S - 2 * G.S * y };
  return { sx: G.cx + G.S * x, sy: G.cy - G.S * y };
}

function draw(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  T = pal();
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
  drawGrid(ctx, W, H);
  geom(W, H);

  // piastra
  ctx.fillStyle = T.plate; ctx.strokeStyle = T.ring; ctx.lineWidth = 1.6;
  ctx.beginPath();
  if (P.shape === 'square') ctx.rect(G.cx - G.S, G.cy - G.S, G.S * 2, G.S * 2);
  else ctx.arc(G.cx, G.cy, G.S, 0, TWO);
  ctx.fill(); ctx.stroke();

  ctx.save(); ctx.beginPath();
  if (P.shape === 'square') ctx.rect(G.cx - G.S, G.cy - G.S, G.S * 2, G.S * 2); else ctx.arc(G.cx, G.cy, G.S, 0, TWO);
  ctx.clip();

  // linea nodale teorica (opzionale)
  if (P.showNodal) {
    ctx.fillStyle = T.nodal;
    nodalPts.forEach(([x, y]) => { const s = toScreen(x, y); ctx.beginPath(); ctx.arc(s.sx, s.sy, 1.6, 0, TWO); ctx.fill(); });
  }

  // perno centrale (la piastra reale è tenuta da una vite al centro)
  ctx.fillStyle = T.sub; ctx.beginPath(); ctx.arc(G.cx, G.cy, 4, 0, TWO); ctx.fill();

  // sabbia
  ctx.fillStyle = T.sand;
  particles.forEach(p => { const s = toScreen(p.x, p.y); ctx.beginPath(); ctx.arc(s.sx, s.sy, 1.3, 0, TWO); ctx.fill(); });
  ctx.restore();

  // intestazione
  ctx.textAlign = 'left';
  ctx.fillStyle = T.accent; ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.fillText('Piastre di Chladni — figure di risonanza', 14, 20);
  ctx.fillStyle = T.txt; ctx.font = '10px "Space Mono",monospace';
  const shapeName = P.shape === 'square' ? 'quadrata' : 'circolare';
  ctx.fillText(`piastra ${shapeName}   f=${P.freq.toFixed(0)} Hz   modo più vicino ${modeLabel(curMode)} a ${curMode.f.toFixed(0)} Hz`, 14, 36);

  ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
  const detune = Math.abs(P.freq - curMode.f) / curMode.f * 100;
  const hint = amp > 0.7
    ? 'vicino alla risonanza: la sabbia si organizza lungo le linee nodali (dove la piastra non vibra)'
    : `fuori risonanza (${detune.toFixed(0)}% di scarto dal modo più vicino): prova ad avvicinare la frequenza a ${curMode.f.toFixed(0)} Hz`;
  ctx.fillText(hint, W / 2, H - 8);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
function gBase(ctx, W, H, PAD) {
  ctx.fillStyle = T.gBg; ctx.fillRect(0, 0, W, H);
  const gW = W - PAD.l - PAD.r, gH = H - PAD.t - PAD.b;
  ctx.strokeStyle = T.gAxis; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(PAD.l, PAD.t); ctx.lineTo(PAD.l, PAD.t + gH); ctx.lineTo(PAD.l + gW, PAD.t + gH); ctx.stroke();
  return { gW, gH };
}
// 1: spettro di risonanza — curva FISSA (ricalcolata solo quando cambia la forma/i modi, non ad
// ogni frame), con un cursore verticale sulla frequenza attuale: spiega perché solo certe
// frequenze producono una figura pulita
function drawGraphSpectrum() {
  const cv = gCanvas[0]; if (!cv || !cv.width || !modes.length) return;
  const ctx = gCtx[0], W = cv.width, H = cv.height, PAD = { t: 14, b: 14, l: 20, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const fMax = modes[modes.length - 1].f * 1.08;
  const xOf = f => PAD.l + clamp(f / fMax, 0, 1) * gW;
  const yOf = v => PAD.t + gH - clamp(v, 0, 1) * gH;
  ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 1.3; ctx.beginPath();
  for (let i = 0; i <= 300; i++) {
    const f = i / 300 * fMax;
    let resp = 0; for (const md of modes) resp = Math.max(resp, lorentzian(f, md.f));
    const x = xOf(f), y = yOf(resp);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
  const cx = xOf(P.freq);
  ctx.strokeStyle = 'rgba(255,157,77,0.85)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(cx, PAD.t); ctx.lineTo(cx, PAD.t + gH); ctx.stroke();
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('risposta', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('f (Hz)', PAD.l + gW - 2, PAD.t + gH - 3);
}
// 2: ampiezza di risposta nel tempo (transitorio di risalita/discesa della risonanza)
function drawGraphAmp() {
  const cv = gCanvas[1]; if (!cv || !cv.width) return;
  const ctx = gCtx[1], W = cv.width, H = cv.height, PAD = { t: 14, b: 14, l: 20, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const WIN = 12, t0 = Math.max(0, animT - WIN);
  const xOf = t => PAD.l + clamp((t - t0) / WIN, 0, 1) * gW;
  const yOf = v => PAD.t + gH - clamp(v, 0, 1) * gH;
  ctx.save(); ctx.beginPath(); ctx.rect(PAD.l, PAD.t, gW, gH); ctx.clip();
  ctx.strokeStyle = '#ff9d4d'; ctx.lineWidth = 1.4; ctx.beginPath();
  hist.forEach((p, i) => { const x = xOf(p.t), y = yOf(p.amp); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.stroke(); ctx.restore();
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('ampiezza', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('t', PAD.l + gW - 2, PAD.t + gH - 3);
}
// 3: quanto la sabbia è organizzata (media di |z| nelle posizioni dei granelli — scende quando si
// addensano sulle linee nodali). Range FISSO per forma (0 .. valore massimo tipico di |z| per quella
// forma), ricalcolato solo al cambio forma, non ad ogni frame.
function drawGraphOrder() {
  const cv = gCanvas[2]; if (!cv || !cv.width) return;
  const ctx = gCtx[2], W = cv.width, H = cv.height, PAD = { t: 14, b: 14, l: 20, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const zMax = P.shape === 'square' ? 1.4 : 0.6;
  const WIN = 12, t0 = Math.max(0, animT - WIN);
  const xOf = t => PAD.l + clamp((t - t0) / WIN, 0, 1) * gW;
  const yOf = v => PAD.t + gH - clamp(v / zMax, 0, 1) * gH;
  ctx.save(); ctx.beginPath(); ctx.rect(PAD.l, PAD.t, gW, gH); ctx.clip();
  ctx.strokeStyle = '#7fe0a0'; ctx.lineWidth = 1.4; ctx.beginPath();
  hist.forEach((p, i) => { const x = xOf(p.t), y = yOf(p.order); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.stroke(); ctx.restore();
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('|z| media', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('t', PAD.l + gW - 2, PAD.t + gH - 3);
}
function drawGraphs() {
  const titles = ['Spettro di risonanza', 'Ampiezza(t)', 'Ordine del pattern(t)'];
  for (let i = 0; i < 3; i++) if (gTitle[i]) gTitle[i].textContent = titles[i];
  drawGraphSpectrum(); drawGraphAmp(); drawGraphOrder();
}

// ═══ Passo di simulazione ═══════════════════════════════════════════════════
function step(dt) {
  animT += dt;
  const nr = nearestMode();
  if (nr.mode !== curMode) { curMode = nr.mode; nodalPts = computeNodalPts(); }
  amp += (nr.resp - amp) * clamp(dt * 6, 0, 1);
  const order = stepParticles(dt);
  hist.push({ t: animT, amp, order });
  const tMin = animT - 13; while (hist.length && hist[0].t < tMin) hist.shift();
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
let freqSlider;
function buildControls() {
  const cont = document.getElementById('controls'); cont.innerHTML = '';

  const sp = Lab.Section('Piastra'); cont.appendChild(sp.el);
  sp.add(Lab.RadioGroup({
    label: 'Forma', value: P.shape,
    options: [
      { value: 'square', label: 'Quadrata', hint: 'bloccata al centro' },
      { value: 'circle', label: 'Circolare', hint: 'bloccata al centro' },
    ],
    onChange(v) { P.shape = v; newRun(); P.freq = Math.round(curMode.f); freqSlider.setValue(P.freq); updateAudioFreq(); },
  }));

  const se = Lab.Section('Eccitazione'); cont.appendChild(se.el);
  freqSlider = Lab.Slider({ label: 'Frequenza', min: 50, max: 3500, step: 1, value: P.freq, unit: ' Hz', onChange(v) { P.freq = v; updateAudioFreq(); } });
  se.add(freqSlider);
  const bSnap = document.createElement('button'); bSnap.className = 'ctrl-btn'; bSnap.textContent = 'Vai alla risonanza più vicina';
  bSnap.addEventListener('click', () => { P.freq = Math.round(curMode.f); freqSlider.setValue(P.freq); updateAudioFreq(); });
  se.add(bSnap);

  const sv = Lab.Section('Visualizzazione'); cont.appendChild(sv.el);
  sv.add(Lab.Toggle({ label: 'Linee nodali teoriche', value: P.showNodal, onChange(v) { P.showNodal = v; } }));
  sv.add(Lab.Slider({ label: 'Numero di grani', min: 200, max: 5000, step: 100, value: P.particleCount, onChange(v) { P.particleCount = v; spawnParticles(); } }));
  sv.add(Lab.Slider({ label: 'Velocità animazione', min: 0.2, max: 3, step: 0.1, value: P.speed, unit: '×', onChange(v) { P.speed = v; } }));
}

function buildReadout() {
  const cont = document.getElementById('readout'); cont.innerHTML = '';
  readout = new Lab.Readout(cont, [
    { key: 'freq', label: 'Frequenza' },
    { key: 'mode', label: 'Modo più vicino' },
    { key: 'modeFreq', label: 'Frequenza di risonanza' },
    { key: 'detune', label: 'Scarto dalla risonanza' },
    { key: 'amp', label: 'Ampiezza di risposta' },
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
  const btnAudio = document.getElementById('btnAudio');
  btnAudio.addEventListener('click', () => {
    if (audioOn) { stopAudio(); } else { startAudio(); btnAudio.textContent = '🔇  MUTO'; }
  });
  document.getElementById('btnReset').addEventListener('click', () => {
    P.shape = 'square'; P.freq = 320; P.particleCount = 1200; P.speed = 1.0; P.showNodal = true; P.paused = false;
    buildControls(); newRun(); syncPlay(); updateAudioFreq();
  });

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
    if (!P.paused) step(dt * P.speed);
    try {
      draw(simCanvas); drawGraphs();
      const detune = Math.abs(P.freq - curMode.f) / curMode.f * 100;
      readout.set('freq', P.freq.toFixed(0) + ' Hz');
      readout.set('mode', modeLabel(curMode));
      readout.set('modeFreq', curMode.f.toFixed(0) + ' Hz');
      readout.set('detune', detune.toFixed(1) + '%');
      readout.set('amp', (amp * 100).toFixed(0) + '%');
      readout.set('stato', amp > 0.7 ? 'in risonanza' : amp > 0.3 ? 'quasi in risonanza' : 'fuori risonanza');
    } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
