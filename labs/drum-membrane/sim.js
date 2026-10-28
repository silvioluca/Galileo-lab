'use strict';

// ═══ Costanti ═══════════════════════════════════════════════════════════════
const TWO = Math.PI * 2;
// Ampiezza e frequenza VISIVE: uno spostamento fisico reale di una membrana è di frazioni di
// millimetro e la frequenza propria è decine/centinaia di Hz — troppo piccolo e troppo veloce per
// essere visto a schermo. VISUAL_AMPLITUDE è una frazione fissa del raggio (non l'ampiezza reale,
// che dipenderebbe da quanto forte si "batte" la membrana e non è modellata qui). VISUAL_FREQ è la
// cadenza di oscillazione SEMPRE mostrata a schermo, indipendente dalla vera frequenza propria: la
// vera frequenza (che dipende da raggio, tensione e densità) è calcolata correttamente e mostrata
// nel readout, ma la sua velocità reale non verrebbe percepita in un'animazione.
const VISUAL_AMPLITUDE = 0.34;
const VISUAL_FREQ = 0.35;

const P = {
  m: 0, n: 1,             // numero angolare (diametri nodali) e radiale (cerchi nodali + 1)
  R: 0.2,                  // raggio della membrana, m
  T: 1200,                 // tensione superficiale, N/m
  sigma: 0.2,               // densità superficiale, kg/m²
  showNodal: true,
  speed: 1.0,
  paused: false,
};

let animT = 0, last = 0;
let D = {};                // dati derivati del modo corrente: {m,n,jmn,kmn,c,omega,freq,nodalRadii,nodalAngles,rhoRef}
let hist = [];              // {t, u} spostamento nel tempo in un punto di riferimento, per il grafico
let SPECTRUM_MODES = [];    // {m,n,jmn} per una griglia fissa di modi, per il grafico dello spettro
let cam = { az: -0.6, el: 0.65, zoom: 1 };
let camDrag = null;
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
    ring: d ? 'rgba(150,175,205,0.45)' : 'rgba(60,95,130,0.5)', grid: d ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
    gBg: d ? 'rgb(3,9,22)' : '#eef2f7', gAxis: d ? 'rgba(100,155,210,0.3)' : 'rgba(40,80,130,0.32)', gText: d ? 'rgba(150,205,225,0.88)' : 'rgba(25,65,105,0.92)',
  };
}
let T = pal();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ═══ Funzioni di Bessel (serie di potenza + ricerca degli zeri) ═══════════════════
// I modi di una membrana circolare fissata al bordo sono u = J_m(k·r)·cos(mθ)·cos(ωt): la condizione
// al contorno u(R)=0 fissa k·R = j_(m,n), l'n-esimo zero positivo di J_m. Gli zeri sono trovati
// numericamente (bisezione su un campionamento), non presi da una tabella — la serie usa una
// relazione di ricorrenza tra un termine e il successivo invece di ricalcolare fattoriali e potenze
// da zero ad ogni termine, per restare stabile numericamente anche per argomenti grandi.
function factorial(k) { let r = 1; for (let i = 2; i <= k; i++) r *= i; return r; }
function besselJ(m, x) {
  if (x === 0) return m === 0 ? 1 : 0;
  const h = x / 2, h2 = h * h;
  let term = Math.pow(h, m) / factorial(m), sum = term;
  for (let k = 1; k < 60; k++) {
    term *= -h2 / (k * (m + k));
    sum += term;
    if (Math.abs(term) < 1e-15 * Math.abs(sum) && k > 5) break;
  }
  return sum;
}
function besselZeros(m, count) {
  const zeros = []; let xPrev = 0.02, fPrev = besselJ(m, xPrev); const dx = 0.03;
  let x = xPrev;
  while (zeros.length < count && x < 80) {
    const xn = x + dx, fn = besselJ(m, xn);
    if ((fPrev < 0) !== (fn < 0)) {
      let lo = x, hi = xn, signLo = fPrev < 0;
      for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if ((besselJ(m, mid) < 0) !== signLo) hi = mid; else lo = mid; }
      zeros.push((lo + hi) / 2);
    }
    fPrev = fn; x = xn;
  }
  return zeros;
}
function findAntinode(m, jmn) {
  let bestRho = 0.5, bestVal = -1;
  for (let i = 1; i < 400; i++) { const rho = i / 400, v = Math.abs(besselJ(m, jmn * rho)); if (v > bestVal) { bestVal = v; bestRho = rho; } }
  return bestRho;
}

// ═══ Nota musicale più vicina (solo per un aggancio intuitivo alla frequenza) ═════════════
const NOTE_NAMES = ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
function noteName(f) {
  if (!(f > 0)) return '—';
  const midi = 69 + 12 * Math.log2(f / 440);
  const nRound = Math.round(midi);
  return `${NOTE_NAMES[((nRound % 12) + 12) % 12]}${Math.floor(nRound / 12) - 1}`;
}

// ═══ Fisica del modo corrente ═══════════════════════════════════════════════════
function deriveMode() {
  const m = P.m, n = P.n;
  const zeros = besselZeros(m, n);
  const jmn = zeros[n - 1];
  const kmn = jmn / P.R;
  const c = Math.sqrt(P.T / P.sigma);
  const omega = c * kmn;
  const freq = omega / TWO;
  const nodalRadii = zeros.slice(0, n - 1).map(z => z / jmn);          // cerchi nodali interni, in ρ=r/R
  const nodalAngles = []; for (let k = 0; k < m; k++) nodalAngles.push(Math.PI / (2 * m) + k * Math.PI / m); // diametri nodali
  const rhoRef = findAntinode(m, jmn);
  D = { m, n, jmn, kmn, c, omega, freq, nodalRadii, nodalAngles, rhoRef };
}
function buildSpectrum() {
  SPECTRUM_MODES = [];
  for (let m = 0; m <= 4; m++) for (let n = 1; n <= 3; n++) { const z = besselZeros(m, n); SPECTRUM_MODES.push({ m, n, jmn: z[n - 1] }); }
}
// spostamento normalizzato: rho=r/R ∈[0,1], theta in radianti, t in secondi "visivi" (già scalati da P.speed)
function dispAt(rho, theta, t) {
  if (rho > 1) return 0;
  return VISUAL_AMPLITUDE * besselJ(D.m, D.jmn * rho) * Math.cos(D.m * theta) * Math.cos(TWO * VISUAL_FREQ * t);
}

function newRun() { deriveMode(); animT = 0; hist = []; }

// ═══ Rendering 3D (proiezione ortografica orbitale, stesso schema di labs/pulsar) ══════════
const SCENE_EXTENT = 1.25; // fisso: la geometria è sempre in coordinate normalizzate ρ∈[0,1], indipendente da R/T/σ
function drawGrid(ctx, W, H) {
  ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}
function geom(W, H) {
  const cx = W * 0.5, cy = H * 0.56;
  const S = Math.min(W * 0.8, H * 0.78) * 0.5 / SCENE_EXTENT;
  G = { cx, cy, S, W, H };
}
function proj(v) {
  const ct = Math.cos(cam.az), st = Math.sin(cam.az);
  const x1 = v[0] * ct - v[1] * st, y1 = v[0] * st + v[1] * ct, z1 = v[2];
  const ce = Math.cos(cam.el), se = Math.sin(cam.el);
  const y2 = y1 * ce - z1 * se, z2 = y1 * se + z1 * ce;
  const S = G.S * cam.zoom;
  return { sx: G.cx + x1 * S, sy: G.cy - z2 * S, depth: y2 };
}
function toScene(rho, theta, z) { return [rho * Math.cos(theta), rho * Math.sin(theta), z]; }

function drawRim(ctx) {
  const pts = []; for (let j = 0; j <= 64; j++) { const th = j / 64 * TWO; pts.push(proj(toScene(1, th, 0))); }
  ctx.strokeStyle = T.ring; ctx.lineWidth = 2.2;
  ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy)); ctx.closePath(); ctx.stroke();
}
function drawNodalLines(ctx) {
  ctx.save(); ctx.setLineDash([3, 3]); ctx.lineWidth = 1.2; ctx.strokeStyle = T.sub;
  D.nodalRadii.forEach(rho => {
    const pts = []; for (let j = 0; j <= 48; j++) { const th = j / 48 * TWO; pts.push(proj(toScene(rho, th, 0))); }
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy)); ctx.closePath(); ctx.stroke();
  });
  D.nodalAngles.forEach(th => {
    const p0 = proj(toScene(1, th, 0)), p1 = proj(toScene(1, th + Math.PI, 0));
    ctx.beginPath(); ctx.moveTo(p0.sx, p0.sy); ctx.lineTo(p1.sx, p1.sy); ctx.stroke();
  });
  ctx.restore();
}
// colore per altezza: blu (spostamento negativo) → grigio neutro (zero) → arancio (spostamento positivo)
function lerp(a, b, f) { return a + (b - a) * f; }
function heightColor(zNorm) {
  const t = clamp(zNorm, -1, 1);
  const neg = [0, 175, 255], mid = [110, 120, 140], pos = [255, 150, 60];
  let c0, c1, f;
  if (t < 0) { c0 = neg; c1 = mid; f = t + 1; } else { c0 = mid; c1 = pos; f = t; }
  const r = Math.round(lerp(c0[0], c1[0], f)), g = Math.round(lerp(c0[1], c1[1], f)), b = Math.round(lerp(c0[2], c1[2], f));
  return `rgba(${r},${g},${b},0.9)`;
}
function buildMeshSegments(t) {
  const Nr = 16, Nth = 48, NthLines = 24, segs = [];
  for (let i = 1; i <= Nr; i++) {
    const rho = i / Nr;
    let prevP = null, prevZ = null;
    for (let j = 0; j <= Nth; j++) {
      const th = j / Nth * TWO, z = dispAt(rho, th, t), p = proj(toScene(rho, th, z));
      if (prevP) segs.push({ a: prevP, b: p, depth: (prevP.depth + p.depth) / 2, zAvg: (prevZ + z) / 2 });
      prevP = p; prevZ = z;
    }
  }
  for (let j = 0; j < NthLines; j++) {
    const th = j / NthLines * TWO;
    let prevP = null, prevZ = null;
    for (let i = 0; i <= Nr; i++) {
      const rho = i / Nr, z = dispAt(rho, th, t), p = proj(toScene(rho, th, z));
      if (prevP) segs.push({ a: prevP, b: p, depth: (prevP.depth + p.depth) / 2, zAvg: (prevZ + z) / 2 });
      prevP = p; prevZ = z;
    }
  }
  return segs;
}
function drawMembrane(ctx, t) {
  const segs = buildMeshSegments(t);
  segs.sort((s1, s2) => s1.depth - s2.depth);
  ctx.lineWidth = 1.15;
  for (const s of segs) { ctx.strokeStyle = heightColor(s.zAvg / VISUAL_AMPLITUDE); ctx.beginPath(); ctx.moveTo(s.a.sx, s.a.sy); ctx.lineTo(s.b.sx, s.b.sy); ctx.stroke(); }
}

function draw(canvas) {
  const [ctx, W, H] = Lab.ctx2d(canvas);
  T = pal();
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
  drawGrid(ctx, W, H);
  geom(W, H);

  drawRim(ctx);
  if (P.showNodal) drawNodalLines(ctx);
  drawMembrane(ctx, animT);

  ctx.textAlign = 'left';
  ctx.fillStyle = T.accent; ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.fillText('Membrana Vibrante — onde stazionarie su un tamburo circolare', 14, 20);
  ctx.fillStyle = T.txt; ctx.font = '10px "Space Mono",monospace';
  ctx.fillText(`modo (m=${D.m}, n=${D.n})   f = ${Lab.fmt(D.freq, 1)} Hz   ${D.n - 1} linee nodali circolari, ${D.m} diametrali`, 14, 36);
  ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText('trascina per ruotare, rotellina per zoomare — la cadenza mostrata è rallentata per essere visibile (un tamburo vero vibra a decine/centinaia di Hz)', W / 2, H - 8);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
// 1: forma radiale del modo J_m(j_mn·r/R): tratteggiato l'inviluppo, pieno la forma istantanea; i punti sono i nodi
function drawGraphProfile() {
  const N = 160, vals = []; let maxAbs = 1e-6;
  for (let i = 0; i <= N; i++) { const v = besselJ(D.m, D.jmn * (i / N)); vals.push(v); maxAbs = Math.max(maxAbs, Math.abs(v)); }
  const g = Lab.panel(gCanvas[0], { title: `Forma radiale del modo: J${D.m}(j·r/R)`, xr: [0, 1], xStep: 0.25, yr: [-1, 1], yStep: 0.5, xLabel: 'r/R' });
  if (!g) return; const [ctx, f] = g;
  const phase = Math.cos(TWO * VISUAL_FREQ * animT), at = r => vals[Math.round(r * N)] / maxAbs;
  Lab.plot(ctx, f, at, [0, 1], f.C.text, 1, [3, 3], N);
  Lab.plot(ctx, f, r => at(r) * phase, [0, 1], '#00d4ff', 2, [], N);
  D.nodalRadii.concat([1]).forEach(rho => Lab.dot(ctx, f, rho, 0, '#ff9d4d', 3.5));
}
// 2: spostamento nel tempo nell'antinodo: l'onda stazionaria "respira" in un punto fisso
function drawGraphTime() {
  const WIN = 10, t1 = Math.max(animT, WIN);
  const g = Lab.panel(gCanvas[1], { title: 'Spostamento nel punto di massima ampiezza', xr: [t1 - WIN, t1], xStep: 2, xFmt: () => '', yr: [-1, 1], yStep: 0.5, xLabel: 'tempo (rallentato) →' });
  if (!g) return; const [ctx, f] = g;
  Lab.plotPts(ctx, f, hist.map(p => [p.t, p.u / VISUAL_AMPLITUDE]), '#ff9d4d', 1.8);
}
// 3: spettro dei modi — a differenza di una corda, le frequenze del tamburo NON sono multipli interi
//    della fondamentale (sono fissate dagli zeri di Bessel). Le linee tratteggiate sono le armoniche intere.
function drawGraphSpectrum() {
  if (!SPECTRUM_MODES.length) return;
  const j01 = SPECTRUM_MODES.find(s => s.m === 0 && s.n === 1).jmn;
  const maxR = Math.ceil(Math.max(...SPECTRUM_MODES.map(s => s.jmn / j01)) + 0.2);
  const g = Lab.panel(gCanvas[2], { title: 'Frequenze dei modi f/f₀₁ (non armoniche)', xr: [0, maxR], xStep: 1, yr: [-0.5, 4.5], yStep: 1, xLabel: 'f / f₀₁', yFmt: v => 'm=' + Lab.fmt(v, 0), padL: 40 });
  if (!g) return; const [ctx, f] = g;
  ctx.save(); ctx.setLineDash([2, 3]); ctx.strokeStyle = f.C.amber; ctx.globalAlpha = 0.5;
  for (let k = 1; k <= maxR; k++) { ctx.beginPath(); ctx.moveTo(f.X(k), f.T); ctx.lineTo(f.X(k), f.B); ctx.stroke(); }
  ctx.restore();
  SPECTRUM_MODES.forEach(s => { const cur = s.m === P.m && s.n === P.n; Lab.dot(ctx, f, s.jmn / j01, s.m, cur ? '#ff9d4d' : 'rgba(0,212,255,0.7)', cur ? 5 : 3); });
}
function drawGraphs() { drawGraphProfile(); drawGraphTime(); drawGraphSpectrum(); }

// ═══ Passo di simulazione ═══════════════════════════════════════════════════
function step(dt) {
  animT += dt;
  hist.push({ t: animT, u: dispAt(D.rhoRef, 0, animT) });
  const tMin = animT - 10; while (hist.length && hist[0].t < tMin) hist.shift();
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls() {
  const cont = document.getElementById('controls'); cont.innerHTML = '';

  const sm = Lab.Section('Modo di vibrazione'); cont.appendChild(sm.el);
  sm.add(Lab.Slider({ label: 'Numero angolare m', min: 0, max: 5, step: 1, value: P.m, onChange(v) { P.m = v; deriveMode(); hist = []; } }));
  sm.add(Lab.Slider({ label: 'Numero radiale n', min: 1, max: 5, step: 1, value: P.n, onChange(v) { P.n = v; deriveMode(); hist = []; } }));

  const sb = Lab.Section('Membrana'); cont.appendChild(sb.el);
  sb.add(Lab.Slider({ label: 'Raggio', min: 0.1, max: 0.4, step: 0.01, value: P.R, unit: ' m', onChange(v) { P.R = v; deriveMode(); } }));
  sb.add(Lab.Slider({ label: 'Tensione', min: 200, max: 4000, step: 50, value: P.T, unit: ' N/m', onChange(v) { P.T = v; deriveMode(); } }));
  sb.add(Lab.Slider({ label: 'Densità superficiale', min: 0.05, max: 0.5, step: 0.01, value: P.sigma, unit: ' kg/m²', onChange(v) { P.sigma = v; deriveMode(); } }));

  const sv = Lab.Section('Visualizzazione'); cont.appendChild(sv.el);
  sv.add(Lab.Toggle({ label: 'Linee nodali', value: P.showNodal, onChange(v) { P.showNodal = v; } }));
  sv.add(Lab.Slider({ label: 'Velocità animazione', min: 0.2, max: 3, step: 0.1, value: P.speed, unit: '×', onChange(v) { P.speed = v; } }));
}

function buildReadout() {
  const cont = document.getElementById('readout'); cont.innerHTML = '';
  readout = new Lab.Readout(cont, [
    { key: 'modo', label: 'modo (m, n)' },
    { key: 'freq', label: 'frequenza propria' },
    { key: 'nota', label: 'nota più vicina' },
    { key: 'c', label: 'velocità delle onde' },
    { key: 'nodCirc', label: 'cerchi nodali' },
    { key: 'nodDiam', label: 'diametri nodali' },
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
  buildSpectrum();
  buildControls(); initGraphs(); buildReadout(); newRun();
  const simCanvas = document.getElementById('simCanvas');
  const btnPlay = document.getElementById('btnPlay');
  function syncPlay() { btnPlay.textContent = P.paused ? '▶  AVVIA' : '⏸  PAUSA'; }
  syncPlay();
  btnPlay.addEventListener('click', () => { P.paused = !P.paused; syncPlay(); });
  document.getElementById('btnReset').addEventListener('click', () => {
    P.m = 0; P.n = 1; P.R = 0.2; P.T = 1200; P.sigma = 0.2; P.showNodal = true; P.speed = 1.0; P.paused = false;
    cam = { az: -0.6, el: 0.65, zoom: 1 };
    buildControls(); newRun(); syncPlay();
  });

  simCanvas.style.cursor = 'grab';
  simCanvas.addEventListener('pointerdown', e => {
    camDrag = { x: e.clientX, y: e.clientY, az: cam.az, el: cam.el };
    simCanvas.style.cursor = 'grabbing'; simCanvas.setPointerCapture(e.pointerId);
  });
  simCanvas.addEventListener('pointermove', e => {
    if (!camDrag) return;
    const dx = e.clientX - camDrag.x, dy = e.clientY - camDrag.y;
    cam.az = camDrag.az + dx * 0.008;
    cam.el = clamp(camDrag.el - dy * 0.008, -1.4, 1.4);
  });
  simCanvas.addEventListener('pointerup', () => { camDrag = null; simCanvas.style.cursor = 'grab'; });
  simCanvas.addEventListener('pointercancel', () => { camDrag = null; simCanvas.style.cursor = 'grab'; });
  simCanvas.addEventListener('wheel', e => {
    e.preventDefault();
    cam.zoom = clamp(cam.zoom * (e.deltaY > 0 ? 0.92 : 1.08), 0.4, 3);
  }, { passive: false });

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
      readout.set('modo', `m=${D.m}, n=${D.n}`);
      readout.set('freq', Lab.fmt(D.freq, 1) + ' Hz');
      readout.set('nota', noteName(D.freq));
      readout.set('c', Lab.fmt(D.c, 0) + ' m/s');
      readout.set('nodCirc', String(D.n - 1));
      readout.set('nodDiam', String(D.m));
    } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
