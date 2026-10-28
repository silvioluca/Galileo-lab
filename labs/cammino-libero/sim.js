'use strict';

/* ── Canvas ──────────────────────────────────────────────────────────────── */
const sc   = document.getElementById('simCanvas');
const gc   = document.getElementById('graphCanvas');
const ctx  = sc.getContext('2d');
const gctx = gc.getContext('2d');
const DPR  = window.devicePixelRatio || 1;
let SW = 0, SH = 0, GW = 0, GH = 0;

Lab.initTheme('themeToggle');
const dk = () => document.documentElement.dataset.theme !== 'light';

/* ── Physics box (arbitrary units) ──────────────────────────────────────── */
const BW = 400;
const BH = 280;

/* ── Parameters ──────────────────────────────────────────────────────────── */
const P = {
  N:          80,
  r:          3,      // particle radius (starts at minimum)
  sigma:      4.0,    // velocity std-dev per component; T ∝ σ²
  e:          1.0,    // coefficient of restitution (1=elastic, 0=perfectly inelastic)
  thermostat: false,  // velocity-rescaling thermostat (keeps σ = P.sigma)
  substeps:   6,
};

/* ── State ───────────────────────────────────────────────────────────────── */
let particles = [];
let paused    = false;
let scX = 1, scY = 1;   // physics → CSS-pixel scale

/* ── Statistics (ring buffer) ────────────────────────────────────────────── */
const NBUF     = 3000;
const pathBuf  = new Float32Array(NBUF);
const speedBuf = new Float32Array(NBUF);
let   nPath = 0, nSpeed = 0;

/* ── Temperature history ─────────────────────────────────────────────────── */
const NTEMP   = 300;   // ~5 s at 60 fps
const tempBuf = new Float32Array(NTEMP);
let   tempIdx = 0;

/* ── Pressure measurement ────────────────────────────────────────────────── */
let wallImpulseAcc = 0;   // accumulated |Δp| from wall bounces
let wallStepCount  = 0;   // substeps elapsed since last measurement
let measuredP      = 0;   // last computed pressure

/* ── Box-Muller Gaussian ─────────────────────────────────────────────────── */
function gauss() {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

/* ── Init particles ──────────────────────────────────────────────────────── */
function initParticles() {
  particles = [];
  pathBuf.fill(0); speedBuf.fill(0);
  nPath = 0; nSpeed = 0;

  tempBuf.fill(0); tempIdx = 0;
  wallImpulseAcc = 0; wallStepCount = 0; measuredP = 0;

  const maxTries = P.N * 600;
  for (let tries = 0; particles.length < P.N && tries < maxTries; tries++) {
    const x = P.r + Math.random() * (BW - 2 * P.r);
    const y = P.r + Math.random() * (BH - 2 * P.r);
    if (particles.some(q => Math.hypot(x - q.x, y - q.y) < 2 * P.r + 0.5)) continue;
    particles.push({
      x, y,
      vx: gauss() * P.sigma,
      vy: gauss() * P.sigma,
      fromX: x, fromY: y,
      pathLen: 0,
      hue: Math.random() * 360,
    });
  }
}

/* ── Record a path-length sample on collision ────────────────────────────── */
function record(p) {
  if (p.pathLen < 0.5) return;
  pathBuf[nPath % NBUF]   = p.pathLen;
  speedBuf[nSpeed % NBUF] = Math.hypot(p.vx, p.vy);
  nPath++; nSpeed++;
  p.fromX = p.x; p.fromY = p.y;
  p.pathLen = 0;
}

/* ── Physics step ────────────────────────────────────────────────────────── */
// Ogni passo è diviso in KSUB sotto-passi: con spostamenti per passo maggiori del diametro due
// particelle potrebbero attraversarsi senza "vedersi" (urti persi → cammino libero troppo lungo).
const KSUB = 4;
function step() {
  for (let k = 0; k < KSUB; k++) subStep(1 / KSUB);
  wallStepCount++;
}
function subStep(h) {
  const r    = P.r;
  const dmin = 2 * r;
  const N    = particles.length;

  // Move + wall bounces
  for (const p of particles) {
    p.x += p.vx * h;
    p.y += p.vy * h;
    p.pathLen += Math.hypot(p.vx, p.vy) * h;

    // Rimbalzi elastici sulle pareti (servono alla misura della pressione). NON chiudono un
    // cammino libero: λ è la distanza media fra due urti con altre molecole; contando anche le
    // pareti, in una scatola di dimensioni paragonabili a λ, la misura risultava molto più corta.
    if (p.x < r)    { wallImpulseAcc += 2*Math.abs(p.vx); p.x = r;    p.vx =  Math.abs(p.vx); }
    if (p.x > BW-r) { wallImpulseAcc += 2*Math.abs(p.vx); p.x = BW-r; p.vx = -Math.abs(p.vx); }
    if (p.y < r)    { wallImpulseAcc += 2*Math.abs(p.vy); p.y = r;    p.vy =  Math.abs(p.vy); }
    if (p.y > BH-r) { wallImpulseAcc += 2*Math.abs(p.vy); p.y = BH-r; p.vy = -Math.abs(p.vy); }
  }

  // Pair collisions O(N²)
  for (let i = 0; i < N - 1; i++) {
    const a = particles[i];
    for (let j = i + 1; j < N; j++) {
      const b  = particles[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= dmin * dmin || d2 < 1e-8) continue;

      const d  = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d;
      const dvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (dvn >= 0) continue; // separating

      // Equal-mass impulse with restitution e: factor=(1+e)/2
      // e=1 → elastic (full exchange), e=0 → perfectly inelastic (average normal velocity)
      const f = (1 + P.e) * 0.5;
      a.vx += f * dvn * nx; a.vy += f * dvn * ny;
      b.vx -= f * dvn * nx; b.vy -= f * dvn * ny;

      // Overlap correction
      const ov = (dmin - d) * 0.5;
      a.x -= ov * nx; a.y -= ov * ny;
      b.x += ov * nx; b.y += ov * ny;

      record(a);
      record(b);
    }
  }
}

/* ── Derived quantities ──────────────────────────────────────────────────── */
function computeSigma() {
  if (!particles.length) return P.sigma;
  let s = 0;
  for (const p of particles) s += p.vx * p.vx + p.vy * p.vy;
  return Math.sqrt(s / (2 * particles.length));
}

function lambdaTheory() {
  // Dischi rigidi in 2D: un disco spazza una striscia larga 2d = 4r (urta chi ha il centro a
  // distanza < d = 2r dalla sua traiettoria); con il fattore √2 delle velocità relative
  // λ = A / (√2 · N · 2d) = A / (√2 · N · 4r)
  return (BW * BH) / (Math.SQRT2 * particles.length * 4 * P.r);
}

function lambdaMeasured() {
  const n = Math.min(nPath, NBUF);
  if (!n) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) s += pathBuf[i];
  return s / n;
}

function pressureTheory() {
  // 2D ideal gas: P = N σ² / A  (units: mass·length⁻¹·time⁻²)
  const s = computeSigma();
  return particles.length * s * s / (BW * BH);
}

function applyThermostat() {
  if (!P.thermostat || !particles.length) return;
  const s = computeSigma();
  if (s < 1e-6) return;
  const scale = P.sigma / s;
  for (const p of particles) { p.vx *= scale; p.vy *= scale; }
}

/* ── Draw simulation canvas ──────────────────────────────────────────────── */
function drawSim() {
  const dark = dk();
  ctx.save();
  ctx.scale(DPR, DPR);

  // Background
  ctx.fillStyle = dark ? '#050a14' : '#d8e8f4';
  ctx.fillRect(0, 0, SW, SH);

  // Box border
  ctx.strokeStyle = dark ? 'rgba(0,212,255,0.22)' : 'rgba(0,80,160,0.22)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, SW - 1, SH - 1);

  const sig  = computeSigma();
  const vRef = sig * 3;
  const pr   = P.r * scX;

  // Trails — current free path segment
  ctx.lineWidth = 1;
  for (const p of particles) {
    ctx.strokeStyle = dark
      ? `hsla(${p.hue},70%,65%,0.14)`
      : `hsla(${p.hue},60%,35%,0.14)`;
    ctx.beginPath();
    ctx.moveTo(p.fromX * scX, p.fromY * scY);
    ctx.lineTo(p.x    * scX, p.y    * scY);
    ctx.stroke();
  }

  // Particles — colored by speed (blue=slow, red=fast)
  for (const p of particles) {
    const t   = Math.min(1, Math.hypot(p.vx, p.vy) / vRef);
    const hue = 240 - t * 240;
    const lum = dark ? 48 + t * 30 : 36 + t * 22;
    ctx.fillStyle = `hsl(${hue}, 82%, ${lum}%)`;
    ctx.beginPath(); ctx.arc(p.x * scX, p.y * scY, pr, 0, Math.PI * 2); ctx.fill();

    // Specular highlight
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.40)' : 'rgba(255,255,255,0.50)';
    ctx.beginPath();
    ctx.arc(p.x * scX - pr * 0.3, p.y * scY - pr * 0.3, pr * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/* ── Draw graphs ─────────────────────────────────────────────────────────── */
// istogramma (conteggi per classe) con la curva teorica attesa sovrapposta
function histPanel(x, w, o) {
  const { buf, n, xMax, theory, title, xLabel, marks } = o;
  const BINS = 30, binW = xMax / BINS, bins = new Float32Array(BINS);
  let maxBin = 0;
  for (let i = 0; i < n; i++) {
    const b = Math.floor(buf[i] / xMax * BINS);
    if (b >= 0 && b < BINS && ++bins[b] > maxBin) maxBin = bins[b];
  }
  const exp = v => n * binW * theory(v);           // conteggio atteso per classe
  let tMax = 0; for (let i = 0; i <= 60; i++) tMax = Math.max(tMax, exp(xMax * i / 60));
  const f = Lab.axes(gctx, { x: x + 3, y: 3, w: w - 6, h: GH - 6, xr: [0, xMax], yr: [0, Lab.niceMax(Math.max(maxBin, tMax, 1) * 1.12)],
    title: `${title}  (n = ${Lab.fmt(o.total, 0)})`, xLabel });
  const C = f.C;
  gctx.fillStyle = C.light ? 'rgba(0,100,200,0.42)' : 'rgba(0,212,255,0.45)';
  for (let b = 0; b < BINS; b++) if (bins[b]) gctx.fillRect(f.X(b * binW), f.Y(bins[b]), f.X((b + 1) * binW) - f.X(b * binW) - 1, f.B - f.Y(bins[b]));
  if (n < 40) {
    gctx.fillStyle = C.text; gctx.font = '10.5px "DM Sans",sans-serif'; gctx.textAlign = 'center'; gctx.textBaseline = 'middle';
    gctx.fillText('raccogliendo dati…', (f.L + f.R) / 2, (f.T + f.B) / 2);
    return;
  }
  Lab.plot(gctx, f, exp, [binW * 0.02, xMax], C.amber, 1.8);
  for (const [v, col] of marks) {
    if (!(v > 0 && v < xMax)) continue;
    gctx.save(); gctx.setLineDash([3, 3]); gctx.strokeStyle = col; gctx.lineWidth = 1;
    gctx.beginPath(); gctx.moveTo(f.X(v), f.T); gctx.lineTo(f.X(v), f.B); gctx.stroke(); gctx.restore();
  }
  Lab.legend(gctx, (f.L + f.R) / 2, f.T + 8,
    [[C.amber, 'teoria'], ...marks.map(([, col, lbl]) => [col, lbl, [3, 3]])]);
}

function drawGraphs() {
  if (!GW || !GH) return;
  gctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  gctx.clearRect(0, 0, GW, GH);
  const C = Lab.graphColors(), green = C.light ? 'rgba(0,120,0,0.8)' : 'rgba(150,255,150,0.8)';
  const panW = GW / 3;
  const sig = computeSigma(), lam = lambdaTheory();

  // 1: cammini liberi, distribuzione esponenziale P(ℓ) = (1/λ)·e^(−ℓ/λ)
  histPanel(0, panW, { buf: pathBuf, n: Math.min(nPath, NBUF), total: nPath, xMax: Lab.niceMax(lam * 4.5),
    theory: l => Math.exp(-l / lam) / lam, title: 'Cammini liberi ℓ', xLabel: 'ℓ (u)', marks: [[lam, C.amber, 'λ']] });

  // 2: velocità, distribuzione di Maxwell–Boltzmann in 2D f(v) = (v/σ²)·e^(−v²/2σ²)
  histPanel(panW, panW, { buf: speedBuf, n: Math.min(nSpeed, NBUF), total: nSpeed, xMax: Lab.niceMax(sig * 4.5),
    theory: v => v / (sig * sig) * Math.exp(-v * v / (2 * sig * sig)), title: 'Velocità v', xLabel: 'v (u/passo)',
    marks: [[sig * Math.sqrt(Math.PI / 2), green, '⟨v⟩']] });

  // 3: agitazione termica σ negli ultimi ~5 s (con il termostato resta su σ₀)
  const nT = Math.min(tempIdx, NTEMP), startI = tempIdx >= NTEMP ? tempIdx % NTEMP : 0, tWin = NTEMP / 60;
  const f = Lab.axes(gctx, { x: 2 * panW + 3, y: 3, w: GW - 2 * panW - 6, h: GH - 6, xr: [-tWin, 0], xStep: 1,
    yr: [0, Lab.niceMax(Math.max(P.sigma, sig) * 1.6)], title: 'Agitazione termica σ (∝ √T)' + (P.thermostat ? ' · termostato attivo' : ''), xLabel: 't (s)' });
  gctx.save(); gctx.setLineDash([3, 3]); gctx.strokeStyle = C.amber;
  gctx.beginPath(); gctx.moveTo(f.L, f.Y(P.sigma)); gctx.lineTo(f.R, f.Y(P.sigma)); gctx.stroke(); gctx.restore();
  const pts = []; for (let k = 0; k < nT; k++) pts.push([(k - nT + 1) / 60, tempBuf[(startI + k) % NTEMP]]);
  if (pts.length > 1) Lab.plotPts(gctx, f, pts, C.accent, 1.8);
  Lab.legend(gctx, f.L + 8, f.B - 10, [[C.accent, 'σ misurata'], [C.amber, 'σ₀ impostata', [3, 3]]]);
}

/* ── Readout ─────────────────────────────────────────────────────────────── */
function updateReadout() {
  const sig   = computeSigma();
  const lT    = Lab.fmt(lambdaTheory(),1);
  const lM    = Lab.fmt(lambdaMeasured(),1);
  const pct   = Lab.fmt((particles.length * Math.PI * P.r * P.r / (BW * BH) * 100),1);
  const vmean = Lab.fmt((sig * Math.sqrt(Math.PI / 2)),2);
  const pT = Lab.fmt(pressureTheory(),4);
  const pM = Lab.fmt(measuredP,4);
  const items = [
    { label: 'λ teorico',  value: `${lT} u` },
    { label: 'λ misurato', value: `${lM} u` },
    { label: 'agitazione σ (∝ √T)', value: Lab.fmt(sig, 2) },
    { label: 'P = Nσ²/A',  value: pT },
    { label: 'P misurata', value: pM },
  ];
  document.getElementById('readout').innerHTML = items.map(it =>
    `<span class="readout-item"><span class="readout-label">${Lab.keepCaseHTML(it.label)}</span><span class="readout-value">${it.value}</span></span>`
  ).join('');
}

/* ── Resize ──────────────────────────────────────────────────────────────── */
function resizeCanvases() {
  const area   = sc.parentElement;
  const ga     = document.getElementById('graphArea');
  const rd     = area.querySelector('.readout-bar');
  const availW = area.clientWidth;
  const gaH    = ga.clientHeight  || 200;
  const rdH    = rd ? rd.clientHeight || 48 : 48;
  const availH = Math.max(80, area.clientHeight - gaH - rdH);

  const ASPECT = BW / BH;
  if (availW / availH > ASPECT) { SH = availH; SW = Math.round(SH * ASPECT); }
  else                          { SW = availW; SH = Math.round(SW / ASPECT); }

  sc.width  = Math.round(SW * DPR); sc.height = Math.round(SH * DPR);
  sc.style.width  = SW + 'px'; sc.style.height = SH + 'px';
  sc.style.alignSelf = 'center';

  scX = SW / BW; scY = SH / BH;

  GW = area.clientWidth; GH = ga.clientHeight || 200;
  gc.width  = Math.round(GW * DPR); gc.height = Math.round(GH * DPR);
  gc.style.width  = GW + 'px'; gc.style.height = GH + 'px';
}

/* ── Controls ────────────────────────────────────────────────────────────── */
let pauseBtn;

function buildControls() {
  const ctrl = document.getElementById('controls');
  ctrl.innerHTML = '';

  const gasSec = Lab.Section('Gas molecolare');
  gasSec.add(Lab.Slider({ label: 'N particelle', min: 20, max: 200, value: P.N, step: 5,
    onChange: v => { P.N = v; initParticles(); } }));
  gasSec.add(Lab.Slider({ label: 'Raggio r', min: 3, max: 14, value: P.r, step: 0.5, unit: ' u',
    onChange: v => { P.r = v; initParticles(); } }));
  gasSec.add(Lab.Slider({ label: 'Temperatura (σ)', min: 1, max: 12, value: P.sigma, step: 0.5,
    onChange: v => { P.sigma = v; initParticles(); } }));
  gasSec.add(Lab.Slider({ label: 'Elasticità (e)', min: 0, max: 1, value: P.e, step: 0.05,
    onChange: v => { P.e = v; } }));
  gasSec.add(Lab.Toggle({ label: 'Termostato (σ fisso)', value: P.thermostat,
    onChange: v => { P.thermostat = v; } }));
  ctrl.appendChild(gasSec.el);

  const cmdSec = Lab.Section('Comandi');
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;margin-top:4px;';

  pauseBtn = document.createElement('button');
  pauseBtn.className = 'btn-primary'; pauseBtn.style.flex = '1';
  pauseBtn.textContent = '⏸  PAUSA';
  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    pauseBtn.textContent = paused ? '▶  RIPRENDI' : '⏸  PAUSA';
  });

  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn-secondary'; resetBtn.style.flex = '1';
  resetBtn.textContent = '↺  RESET';
  resetBtn.addEventListener('click', () => initParticles());

  row.append(pauseBtn, resetBtn);
  cmdSec.el.appendChild(row);
  ctrl.appendChild(cmdSec.el);
}

/* ── Animation loop ──────────────────────────────────────────────────────── */
function loop() {
  if (!paused) {
    for (let s = 0; s < P.substeps; s++) step();

    applyThermostat();

    // Sample current σ into temperature history
    tempBuf[tempIdx % NTEMP] = computeSigma();
    tempIdx++;

    // Update measured pressure every 120 substeps (~0.3 s at 60 fps × 6 substeps)
    if (wallStepCount >= 120) {
      measuredP = wallImpulseAcc / (2 * (BW + BH) * wallStepCount);
      wallImpulseAcc = 0; wallStepCount = 0;
    }

    drawSim();
    drawGraphs();
    updateReadout();
  }
  requestAnimationFrame(loop);
}

/* ── Init ────────────────────────────────────────────────────────────────── */
function init() {
  resizeCanvases();
  initParticles();
  buildControls();
  requestAnimationFrame(loop);
}

new ResizeObserver(resizeCanvases).observe(sc.parentElement);
init();
