/* ── Free Fall Simulation ─────────────────────────────────── */

const PLANETS = [
  { value: 'luna',  label: 'Luna',  hint: '1,62 m/s²', g: 1.62  },
  { value: 'marte', label: 'Marte', hint: '3,72 m/s²', g: 3.72  },
  { value: 'terra', label: 'Terra', hint: '9,81 m/s²', g: 9.81  },
  { value: 'giove', label: 'Giove', hint: '24,79 m/s²', g: 24.79 },
];

// Colors for comparison mode (primary is always index 0)
const COLORS = ['#00d4ff', '#ff4757', '#2ecc71', '#ffb400'];

const RHO_AIR   = 1.225;   // kg/m³
const BALL_R_M  = 0.1;     // ball radius for drag area
const PHYSICS_DT = 1 / 120;
const HIST_STEP  = 3;      // record history every N physics steps

// Convention: v positive = upward, h increases when ball moves up
// Ground = h <= 0, impact terminates simulation

/* ── Shared parameters ────────────────────────────────────── */
const params = {
  h0: 100,     // initial height (m)
  v0: 0,       // initial velocity (+= upward, -= downward)
  airResistance: false,
  Cd: 0.47,
  strobe: true,    // fotografia stroboscopica: un'immagine della pallina a ogni lampo
  strobeDt: 0.4,   // intervallo fra due lampi (s)
};

/* ── SimInstance ──────────────────────────────────────────── */
class SimInstance {
  constructor(id, color, g, mass) {
    this.id    = id;
    this.color = color;
    this.g     = g;
    this.mass  = mass;
    this._stepCount = 0;
    this.reset();
  }

  get terminalV() {
    if (!params.airResistance) return Infinity;
    const A = Math.PI * BALL_R_M * BALL_R_M;
    return Math.sqrt(2 * this.mass * this.g / (RHO_AIR * params.Cd * A));
  }

  // Theoretical peak height (positive v0 only, no air)
  get peakH() {
    if (params.v0 <= 0) return params.h0;
    return params.h0 + (params.v0 * params.v0) / (2 * this.g);
  }

  reset() {
    this.state = { t: 0, h: params.h0, v: params.v0, a: 0, done: false };
    this.trail   = [];   // altezze recenti (m), per la scia continua
    this.history = []; // { t, v, a }
    this.flashes = [{ t: 0, h: params.h0 }];   // posizioni ai lampi dello stroboscopio
    this.lastFlashMs = -1e9;
    this._stepCount = 0;
  }

  step(dt) {
    if (this.state.done) return;

    let a = -this.g;
    if (params.airResistance) {
      const A    = Math.PI * BALL_R_M * BALL_R_M;
      const drag = -Math.sign(this.state.v) * 0.5 * RHO_AIR * params.Cd * A
                   * this.state.v * this.state.v / this.mass;
      a = -this.g + drag;
    }

    const t0 = this.state.t, h0 = this.state.h;
    // passo esatto per accelerazione costante nell'intervallo dt: h += v·dt + ½·a·dt²
    this.state.a  = a;
    this.state.h += this.state.v * dt + 0.5 * a * dt * dt;
    this.state.v += a * dt;
    this.state.t += dt;

    // lampo dello stroboscopio: posizione interpolata all'istante esatto k·Δt
    const k = this.flashes.length, tf = k * params.strobeDt;
    if (tf <= this.state.t && this.state.h > 0) {
      const f = (tf - t0) / dt;
      this.flashes.push({ t: tf, h: h0 + (this.state.h - h0) * f });
      this.lastFlashMs = performance.now();
    }

    this.trail.push(this.state.h);
    if (this.trail.length > 280) this.trail.shift();

    this._stepCount++;
    if (this._stepCount % HIST_STEP === 0) {
      this.history.push({ t: this.state.t, h: this.state.h, v: this.state.v, a: this.state.a });
    }

    if (this.state.h <= 0) {
      // istante e velocità d'impatto ricavati all'interno del passo
      const f = h0 / (h0 - this.state.h);
      this.state.t = t0 + f * dt;
      this.state.vImpact = this.state.v - a * dt * (1 - f);
      this.state.h = 0; this.state.v = 0; this.state.a = 0;
      this.state.done = true;
    }
  }
}

/* ── Simulation state ─────────────────────────────────────── */
let instances   = [new SimInstance(0, COLORS[0], 9.81, 1.0)];
let compareMode = false;
let simRunning  = false;
let rafId       = null;
let lastTs      = null;
let physAcc     = 0;
let viewMaxH    = 100; // recomputed at each reset
let arrowVRef   = 10;  // shared reference velocity for arrow normalization
let graphRanges = null; // pre-computed theoretical ranges for fixed graph axes

/* ── Simulation control ───────────────────────────────────── */
function activeInstances() { return compareMode ? instances : [instances[0]]; }
function allDone()         { return activeInstances().every(i => i.state.done); }

function computeViewMaxH() {
  const maxPeak = Math.max(...activeInstances().map(i => i.peakH));
  viewMaxH = Math.max(params.h0, maxPeak) * 1.08;
}

// Pre-compute theoretical graph ranges so axes are fixed from t=0
function computeGraphRanges() {
  const insts = activeInstances();
  const { h0, v0, airResistance } = params;

  let tMax = 0, hMax = 0, vMin = 0, aMin = 0;

  insts.forEach(inst => {
    const g = inst.g;
    const peak = v0 > 0 ? h0 + (v0 * v0) / (2 * g) : h0;
    hMax = Math.max(hMax, peak);

    const vImpact = Math.sqrt(Math.max(0, v0 * v0 + 2 * g * h0));
    vMin = Math.min(vMin, -(airResistance ? Math.min(vImpact, inst.terminalV) : vImpact));

    aMin = Math.min(aMin, -g);

    const disc = v0 * v0 + 2 * g * h0;
    if (disc >= 0) {
      let t = (v0 + Math.sqrt(disc)) / g;
      if (airResistance) t *= 1.6;
      tMax = Math.max(tMax, t);
    }
  });

  const vMax = Math.max(v0, 0);
  const pad  = 0.06; // 6% padding each side so axes don't clip data

  graphRanges = {
    tMax:   Math.max(tMax * (1 + pad), 0.5),
    hRange: [-hMax * pad,              hMax * (1 + pad)],
    vRange: [vMin * (1 + pad),         Math.max(vMax * (1 + pad), -vMin * pad)],
    aRange: [aMin * (1 + pad),         Math.abs(aMin) * pad],
  };
}

// Single reference for ALL instances so equal |v| → equal arrow length
function computeArrowVRef() {
  arrowVRef = Math.max(5, ...activeInstances().map(inst =>
    Math.sqrt(params.v0 * params.v0 + 2 * inst.g * params.h0)
  ));
}

function startSim() {
  if (simRunning || allDone()) return;
  simRunning = true;
  lastTs     = null;
  physAcc    = 0;
  updatePlayBtn();
  rafId = requestAnimationFrame(loop);
}

function pauseSim() {
  simRunning = false;
  if (rafId) cancelAnimationFrame(rafId);
  updatePlayBtn();
}

function resetSim() {
  simRunning = false;
  if (rafId) cancelAnimationFrame(rafId);
  instances.forEach(i => i.reset());
  computeViewMaxH();
  computeArrowVRef();
  computeGraphRanges();
  updatePlayBtn();
  draw();
  drawGraphs();
  updateReadout();
}

function updatePlayBtn() {
  if (simRunning) {
    btnPlay.textContent = '⏸  PAUSA';
    btnPlay.classList.add('running');
  } else {
    const anyStarted = instances.some(i => i.state.t > 0);
    btnPlay.textContent = anyStarted && !allDone() ? '▶  RIPRENDI' : '▶  AVVIA';
    btnPlay.classList.remove('running');
  }
}

function loop(ts) {
  if (!simRunning) return;
  if (lastTs === null) lastTs = ts;
  const elapsed = Math.min((ts - lastTs) / 1000, 0.05);
  lastTs   = ts;
  physAcc += elapsed;

  const toStep = activeInstances();
  while (physAcc >= PHYSICS_DT) {
    toStep.forEach(i => i.step(PHYSICS_DT));
    physAcc -= PHYSICS_DT;
  }

  draw();
  drawGraphs();
  updateReadout();

  if (allDone()) { simRunning = false; updatePlayBtn(); return; }
  rafId = requestAnimationFrame(loop);
}

/* ── Canvas (simulation) ──────────────────────────────────── */
const canvas = document.getElementById('simCanvas');
const ctx    = canvas.getContext('2d');
let dpr = 1, cw = 0, ch = 0;

// Graph canvas
const graphArea   = document.getElementById('graphArea');
const graphCanvas = document.getElementById('graphCanvas');
const gctx        = graphCanvas.getContext('2d');
let gw = 0, gh = 0;

function resizeAll() {
  dpr = window.devicePixelRatio || 1;

  if (document.fullscreenElement === graphArea) {
    gw = graphArea.clientWidth;
    gh = graphArea.clientHeight;
    graphCanvas.width  = Math.round(gw * dpr);
    graphCanvas.height = Math.round(gh * dpr);
    graphCanvas.style.width  = gw + 'px';
    graphCanvas.style.height = gh + 'px';
    gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return;
  }

  const parent   = canvas.parentElement;
  const graphH   = graphArea.offsetHeight || 240;
  const readoutH = 52;
  const handleH  = document.getElementById('resizeHandle')?.offsetHeight || 6;
  cw = parent.clientWidth;
  ch = Math.max(80, parent.clientHeight - graphH - readoutH - handleH);

  canvas.width  = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  canvas.style.width  = cw + 'px';
  canvas.style.height = ch + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  gw = graphArea.clientWidth;
  gh = graphArea.clientHeight || 200;
  graphCanvas.width  = Math.round(gw * dpr);
  graphCanvas.height = Math.round(gh * dpr);
  graphCanvas.style.width  = gw + 'px';
  graphCanvas.style.height = gh + 'px';
  gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

const ro = new ResizeObserver(() => { resizeAll(); draw(); drawGraphs(); });
ro.observe(canvas.parentElement);

/* ── Layout helpers ───────────────────────────────────────── */
const PAD_L = 60, PAD_T = 20, PAD_B = 20;
function ballPx() { return Math.max(4, Math.min(10, Math.min(cw, ch) * 0.020)); }

function groundY()     { return ch - PAD_B; }
function topY()        { return PAD_T; }
function scaleM()      { return (groundY() - topY()) / viewMaxH; }
function ballY(h)      { return groundY() - h * scaleM(); }
function centerX()     { return PAD_L + (cw - PAD_L) / 2; }
function isDark()      { return document.documentElement.dataset.theme !== 'light'; }

function instanceX(idx) {
  if (!compareMode || instances.length <= 1) return centerX();
  const n = instances.length;
  const spread = Math.min(44, (cw - PAD_L) * 0.1);
  return centerX() + (idx - (n - 1) / 2) * spread;
}

function gridStep() {
  const h = viewMaxH;
  if (h <= 25)  return 5;
  if (h <= 60)  return 10;
  if (h <= 160) return 25;
  if (h <= 350) return 50;
  return 100;
}

/* ── Drawing: simulation canvas ───────────────────────────── */
function draw() {
  ctx.clearRect(0, 0, cw, ch);
  const active = activeInstances();
  drawGridLines();
  drawScaleRuler();
  drawStartLine();
  if (params.v0 > 0) active.forEach((inst, i) => drawPeakMarker(inst, i));
  if (params.strobe) active.forEach((inst, i) => drawStrobe(inst, i, i === 0));
  else active.forEach((inst, i) => drawTrail(inst, i));
  drawGround();
  active.forEach((inst, i) => {
    if (inst.state.h > 0 || !inst.state.done) {
      drawBall(inst, i);
      if (Math.abs(inst.state.v) > 0.05) drawVelocityArrow(inst, i);
    }
  });
  if (compareMode && active.length > 1) drawLegend();
}

function drawGridLines() {
  const step = gridStep();
  ctx.strokeStyle = isDark() ? 'rgba(0,212,255,0.045)' : 'rgba(0,100,160,0.07)';
  ctx.lineWidth = 1;
  for (let h = 0; h <= viewMaxH + step; h += step) {
    const y = ballY(h);
    if (y < 0 || y > ch) continue;
    ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(cw, y); ctx.stroke();
  }
}

function drawScaleRuler() {
  const step = gridStep();
  ctx.font = '700 9px "Space Mono",monospace';
  ctx.textAlign = 'right';
  for (let h = 0; h <= viewMaxH + step; h += step) {
    const y = ballY(h);
    if (y < -4 || y > ch + 4) continue;
    ctx.fillStyle = isDark() ? 'rgba(0,212,255,0.35)' : 'rgba(0,100,160,0.5)';
    ctx.fillText(h + ' m', PAD_L - 5, y + 3.5);
    ctx.strokeStyle = isDark() ? 'rgba(0,212,255,0.2)' : 'rgba(0,100,160,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD_L - 3, y); ctx.lineTo(PAD_L + 2, y); ctx.stroke();
  }
  ctx.strokeStyle = isDark() ? 'rgba(0,212,255,0.14)' : 'rgba(0,100,160,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD_L, topY() - 4); ctx.lineTo(PAD_L, groundY() + 4); ctx.stroke();
}

function drawStartLine() {
  const y = ballY(params.h0);
  if (y < 0 || y > ch) return;
  ctx.strokeStyle = isDark() ? 'rgba(0,212,255,0.18)' : 'rgba(0,100,160,0.22)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 5]);
  ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(cw, y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = '700 9px "Space Mono",monospace';
  ctx.fillStyle = isDark() ? 'rgba(0,212,255,0.4)' : 'rgba(0,100,160,0.5)';
  ctx.textAlign = 'left';
  ctx.fillText('h₀ = ' + params.h0 + ' m', PAD_L + 8, y - 5);
}

function drawPeakMarker(inst, idx) {
  const y = ballY(inst.peakH);
  if (y < 0 || y > ch) return;
  const x = instanceX(idx);
  ctx.strokeStyle = inst.color;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(x - 20, y); ctx.lineTo(x + 20, y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.font = '700 8px "Space Mono",monospace';
  ctx.fillStyle = inst.color;
  ctx.globalAlpha = 0.55;
  ctx.textAlign = 'left';
  ctx.fillText('h_max', x + 22, y + 3.5);
  ctx.globalAlpha = 1;
}

function drawTrail(inst, idx) {
  if (inst.trail.length < 2) return;
  const x = instanceX(idx);
  for (let i = 1; i < inst.trail.length; i++) {
    const alpha = (i / inst.trail.length) * 0.5;
    const r     = 1 + (i / inst.trail.length) * 2;
    ctx.beginPath();
    ctx.arc(x, ballY(inst.trail[i]), r, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(inst.color, alpha);
    ctx.fill();
  }
}

// Fotografia stroboscopica: a intervalli di tempo uguali Δt la pallina viene "fotografata".
// Le immagini restano sulla scena; a destra le distanze percorse fra un lampo e l'altro e il loro
// rapporto con la prima: partendo da ferma, senza aria, crescono come 1 : 3 : 5 : 7 … (Galileo).
function drawStrobe(inst, idx, labels) {
  const F = inst.flashes, x = instanceX(idx), r = ballPx(), dark = isDark();
  // un istante di luce bianca quando scatta il lampo
  const since = performance.now() - inst.lastFlashMs;
  if (simRunning && since < 110) {
    const a = 1 - since / 110, y = ballY(inst.state.h);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 7);
    g.addColorStop(0, `rgba(255,255,255,${0.55 * a})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 7, 0, Math.PI * 2); ctx.fill();
  }
  // immagini ai lampi
  drawStrobe.lastY = -1e9;
  F.forEach((f, k) => {
    const y = ballY(f.h);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(inst.color, 0.28); ctx.fill();
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.75)' : 'rgba(20,40,70,0.7)';
    ctx.lineWidth = 1.2; ctx.stroke();
    if (!labels) return;
    // trattino verso la colonna delle misure
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)';
    ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + r + 3, y); ctx.lineTo(x + 70, y); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = dark ? 'rgba(221,238,255,0.55)' : 'rgba(13,26,38,0.6)';
    // l'etichetta del tempo solo se c'è spazio rispetto alla precedente scritta
    if (k === 0 || y - drawStrobe.lastY >= 11) { ctx.fillText(`t = ${Lab.fmt(f.t, 2)} s`, x - r - 70, y); drawStrobe.lastY = y; }
  });
  if (!labels || F.length < 2) return;
  // distanze fra lampi successivi e rapporto con la prima
  const d1 = F[0].h - F[1].h;
  ctx.font = '9.5px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (let k = 1; k < F.length; k++) {
    const yA = ballY(F[k - 1].h), yB = ballY(F[k].h);
    if (yB - yA < 11) continue;                 // troppo vicine per scriverci accanto
    const xb = x + 74;
    ctx.strokeStyle = hexToRgba(inst.color, 0.7); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(xb, yA + 1); ctx.lineTo(xb + 4, yA + 1); ctx.lineTo(xb + 4, yB - 1); ctx.lineTo(xb, yB - 1); ctx.stroke();
    const dh = F[k - 1].h - F[k].h;
    ctx.fillStyle = dark ? 'rgba(221,238,255,0.8)' : 'rgba(13,26,38,0.8)';
    ctx.fillText(`Δh = ${Lab.fmt(dh, dh < 10 ? 2 : 1)} m`, xb + 9, (yA + yB) / 2);
    if (d1 > 1e-6) {
      ctx.fillStyle = hexToRgba(inst.color, 0.95);
      ctx.fillText(`× ${Lab.fmt(dh / d1, 1)}`, xb + 112, (yA + yB) / 2);
    }
  }
  // didascalia della fotografia
  const free = params.v0 === 0 && !params.airResistance;
  ctx.font = '10.5px "DM Sans",sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.fillStyle = dark ? 'rgba(221,238,255,0.7)' : 'rgba(13,26,38,0.75)';
  ctx.fillText(`Stroboscopio: un lampo ogni ${Lab.fmt(params.strobeDt, 2)} s`, cw - 12, 10);
  if (free) {
    // rapporti misurati sulle prime distanze: 1 : 3 : 5 : 7 …
    const rat = [];
    for (let k = 1; k < Math.min(F.length, 7); k++) rat.push(Lab.fmt((F[k - 1].h - F[k].h) / d1, k === 1 ? 0 : 1));
    ctx.fillStyle = hexToRgba(inst.color, 0.95);
    ctx.fillText(`distanze fra lampi successivi  ${rat.join(' : ')}${F.length > 7 ? ' …' : ''}  (numeri dispari)`, cw - 12, 26);
  } else if (params.airResistance) {
    ctx.fillText('con l’aria le distanze crescono sempre meno: si arriva alla velocità limite', cw - 12, 26);
  }
}

function drawBall(inst, idx) {
  const x = instanceX(idx);
  const y = ballY(inst.state.h);
  if (y < -ballPx() * 4 || y > ch + ballPx()) return;

  // Glow
  const glow = ctx.createRadialGradient(x, y, 0, x, y, ballPx() * 3.2);
  glow.addColorStop(0, hexToRgba(inst.color, 0.15));
  glow.addColorStop(1, hexToRgba(inst.color, 0));
  ctx.beginPath(); ctx.arc(x, y, ballPx() * 3.2, 0, Math.PI * 2);
  ctx.fillStyle = glow; ctx.fill();

  // Ball
  const grad = ctx.createRadialGradient(x - 3, y - 3, 0, x, y, ballPx());
  grad.addColorStop(0, lighten(inst.color, 0.6));
  grad.addColorStop(0.4, inst.color);
  grad.addColorStop(1, darken(inst.color, 0.5));
  ctx.beginPath(); ctx.arc(x, y, ballPx(), 0, Math.PI * 2);
  ctx.fillStyle = grad; ctx.fill();

  // Highlight
  ctx.beginPath(); ctx.arc(x - 3, y - 3, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
}

function drawVelocityArrow(inst, idx) {
  const x   = instanceX(idx);
  const by  = ballY(inst.state.h);
  const v   = inst.state.v;
  const maxLen = Math.min(70, ch * 0.18);
  const len    = Math.min(maxLen, (Math.abs(v) / arrowVRef) * maxLen);
  const dir    = v >= 0 ? -1 : 1; // -1 = up, +1 = down

  const startY = by + dir * (ballPx() + 2);
  const tipY   = by + dir * (ballPx() + 2 + len);

  if (Math.abs(tipY - startY) < 4) return;
  if (dir > 0 && tipY > groundY() - 4) return;
  if (dir < 0 && tipY < topY()) return;

  const arrowColor = isDark() ? 'rgba(255,180,0,0.8)' : 'rgba(180,120,0,0.85)';
  ctx.strokeStyle = arrowColor;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, tipY - dir * 7); ctx.stroke();
  ctx.fillStyle = arrowColor;
  ctx.beginPath();
  ctx.moveTo(x - 5, tipY - dir * 7);
  ctx.lineTo(x, tipY);
  ctx.lineTo(x + 5, tipY - dir * 7);
  ctx.closePath(); ctx.fill();
}

function drawGround() {
  const y = groundY();
  ctx.strokeStyle = isDark() ? 'rgba(0,212,255,0.45)' : 'rgba(0,100,160,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(cw, y); ctx.stroke();
  ctx.strokeStyle = isDark() ? 'rgba(0,212,255,0.12)' : 'rgba(0,100,160,0.16)';
  ctx.lineWidth = 1;
  for (let x = PAD_L + 8; x < cw + 10; x += 14) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 9, y + 9); ctx.stroke();
  }
  ctx.fillStyle = isDark() ? 'rgba(0,212,255,0.28)' : 'rgba(0,100,160,0.38)';
  ctx.font = '700 9px "Space Mono",monospace';
  ctx.textAlign = 'left';
  ctx.fillText('SUOLO  h = 0 m', PAD_L + 8, y + 16);
}

function drawLegend() {
  const pad = 10, lineH = 18, boxW = 130, boxH = pad + instances.length * lineH + 4;
  const bx = cw - boxW - 10, by = 10;
  ctx.fillStyle = isDark() ? 'rgba(6,10,16,0.75)' : 'rgba(240,242,245,0.82)';
  ctx.strokeStyle = isDark() ? 'rgba(0,212,255,0.12)' : 'rgba(0,100,160,0.15)';
  ctx.lineWidth = 1;
  roundRect(ctx, bx, by, boxW, boxH, 6);
  ctx.fill(); ctx.stroke();

  instances.forEach((inst, i) => {
    const y = by + pad + i * lineH;
    ctx.beginPath();
    ctx.arc(bx + 12, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = inst.color;
    ctx.fill();
    ctx.font = '600 10px "DM Sans",sans-serif';
    ctx.fillStyle = isDark() ? 'rgba(221,238,255,0.85)' : 'rgba(13,26,38,0.85)';
    ctx.textAlign = 'left';
    const planet = PLANETS.find(p => p.g === inst.g) || { label: 'Custom' };
    ctx.fillText(`${planet.label}  ${inst.mass} kg`, bx + 22, y + 4);
  });
}

/* ── Drawing: graph canvas ────────────────────────────────── */
function drawGraphs() {
  if (!gw || !gh) return;
  gctx.clearRect(0, 0, gw, gh);

  const dark   = isDark();
  const toShow = activeInstances();
  const W      = Math.floor(gw / 3);
  const PAD    = { t: 18, b: 30, l: 46, r: 10 };
  const gr     = graphRanges;

  drawSingleGraph(0,   0, W,      gh, PAD, d => d.h, 'h (m)',    dark, toShow, gr?.hRange, gr?.tMax);
  drawSingleGraph(W,   0, W,      gh, PAD, d => d.v, 'v (m/s)',  dark, toShow, gr?.vRange, gr?.tMax);
  drawSingleGraph(W*2, 0, gw-W*2, gh, PAD, d => d.a, 'a (m/s²)', dark, toShow, gr?.aRange, gr?.tMax);

  const sep = dark ? 'rgba(0,212,255,0.08)' : 'rgba(0,100,160,0.10)';
  gctx.strokeStyle = sep; gctx.lineWidth = 1;
  [W, W * 2].forEach(x => {
    gctx.beginPath(); gctx.moveTo(x, 0); gctx.lineTo(x, gh); gctx.stroke();
  });
}

function drawSingleGraph(ox, oy, gW, gH, PAD, getValue, label, dark, toShow, yFixed, tFixed) {
  const pl = PAD.l, pr = PAD.r, pt = PAD.t, pb = PAD.b;
  const iW = gW - pl - pr;
  const iH = gH - pt - pb;
  if (iW <= 0 || iH <= 0) return;

  // Use pre-computed fixed ranges so axes never jump during playback
  let tRange, yMin, yMax;
  if (yFixed != null && tFixed != null) {
    yMin   = yFixed[0];
    yMax   = yFixed[1];
    tRange = tFixed;
  } else {
    let tMax = 0, hasData = false;
    yMin = Infinity; yMax = -Infinity;
    toShow.forEach(inst => {
      inst.history.forEach(d => {
        const v = getValue(d);
        tMax = Math.max(tMax, d.t);
        yMin = Math.min(yMin, v);
        yMax = Math.max(yMax, v);
        hasData = true;
      });
    });
    if (!hasData) { tMax = 5; yMin = -10; yMax = 2; }
    const yrng = yMax - yMin || 1;
    yMin -= yrng * 0.08; yMax += yrng * 0.08;
    tRange = Math.max(tMax * 1.05, 0.5);
  }

  function toX(t) { return ox + pl + (t / tRange) * iW; }
  function toY(y) { return oy + pt + (1 - (y - yMin) / (yMax - yMin)) * iH; }

  const axisClr = dark ? 'rgba(200,220,255,0.35)' : 'rgba(0,0,0,0.28)';
  const gridClr = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const tickClr = dark ? '#6b8099' : '#4a6278';
  const lblClr  = dark ? '#6b8099' : '#4a6278';

  const yTicks = niceTicks(yMin, yMax, 4);
  const tTicks = niceTicks(0, tRange, 4);

  // Y grid lines — bold at y = 0
  yTicks.forEach(tv => {
    if (tv < yMin - 1e-9 || tv > yMax + 1e-9) return;
    const gy = toY(tv);
    const isZero = Math.abs(tv) < 1e-9;
    gctx.strokeStyle = isZero ? axisClr : gridClr;
    gctx.lineWidth   = isZero ? 1.5 : 1;
    gctx.beginPath(); gctx.moveTo(ox + pl, gy); gctx.lineTo(ox + pl + iW, gy); gctx.stroke();
  });

  // T grid lines
  tTicks.forEach(tv => {
    if (tv < -1e-9 || tv > tRange + 1e-9) return;
    const gx = toX(tv);
    gctx.strokeStyle = gridClr; gctx.lineWidth = 1;
    gctx.beginPath(); gctx.moveTo(gx, oy + pt); gctx.lineTo(gx, oy + pt + iH); gctx.stroke();
  });

  // Y axis — solid left edge
  gctx.strokeStyle = axisClr; gctx.lineWidth = 1.5;
  gctx.beginPath(); gctx.moveTo(ox + pl, oy + pt); gctx.lineTo(ox + pl, oy + pt + iH); gctx.stroke();

  // X axis at y = 0 if strictly inside range
  if (yMin < -1e-9 && yMax > 1e-9) {
    const zeroY = toY(0);
    gctx.strokeStyle = axisClr; gctx.lineWidth = 1.5;
    gctx.beginPath(); gctx.moveTo(ox + pl, zeroY); gctx.lineTo(ox + pl + iW, zeroY); gctx.stroke();
  }

  // Inner box border
  gctx.strokeStyle = dark ? 'rgba(200,220,255,0.35)' : 'rgba(0,0,0,0.28)';
  gctx.lineWidth = 1;
  gctx.strokeRect(ox + pl, oy + pt, iW, iH);

  // Y tick marks + labels
  gctx.font = '700 9px "Space Mono",monospace';
  gctx.textAlign = 'right';
  yTicks.forEach(tv => {
    if (tv < yMin - 1e-9 || tv > yMax + 1e-9) return;
    const gy = toY(tv);
    gctx.strokeStyle = axisClr; gctx.lineWidth = 1;
    gctx.beginPath(); gctx.moveTo(ox + pl - 4, gy); gctx.lineTo(ox + pl, gy); gctx.stroke();
    gctx.fillStyle = tickClr;
    gctx.fillText(fmtTick(tv), ox + pl - 6, gy + 4);
  });

  // X tick marks + labels (fixed at bottom edge)
  gctx.textAlign = 'center';
  tTicks.forEach(tv => {
    if (tv < -1e-9 || tv > tRange + 1e-9) return;
    const gx = toX(tv);
    if (gx < ox + pl || gx > ox + pl + iW) return;
    gctx.strokeStyle = axisClr; gctx.lineWidth = 1;
    gctx.beginPath(); gctx.moveTo(gx, oy + pt + iH); gctx.lineTo(gx, oy + pt + iH + 4); gctx.stroke();
    if (tv > tRange * 0.03) {
      gctx.fillStyle = tickClr;
      gctx.fillText(fmtTick(tv) + ' s', gx, oy + pt + iH + 16);
    }
  });

  // Rotated Y label
  gctx.save();
  gctx.translate(ox + 9, oy + pt + iH / 2);
  gctx.rotate(-Math.PI / 2);
  gctx.textAlign = 'center';
  gctx.fillStyle = lblClr;
  gctx.font = '700 9px "Space Mono",monospace';
  gctx.fillText(label, 0, 0);
  gctx.restore();

  // Data lines
  toShow.forEach(inst => {
    if (inst.history.length < 2) return;
    gctx.strokeStyle = inst.color;
    gctx.lineWidth = 1.5;
    gctx.lineJoin = 'round';
    gctx.beginPath();
    inst.history.forEach((d, i) => {
      const x = toX(d.t), y = toY(getValue(d));
      i === 0 ? gctx.moveTo(x, y) : gctx.lineTo(x, y);
    });
    gctx.stroke();
    const last = inst.history[inst.history.length - 1];
    gctx.beginPath();
    gctx.arc(toX(last.t), toY(getValue(last)), 2.5, 0, Math.PI * 2);
    gctx.fillStyle = inst.color; gctx.fill();
  });
  // istanti dei lampi dello stroboscopio sul grafico dell'altezza
  if (params.strobe && label.startsWith('h')) {
    toShow.forEach(inst => inst.flashes.forEach(f => {
      gctx.beginPath(); gctx.arc(toX(f.t), toY(f.h), 3, 0, Math.PI * 2);
      gctx.strokeStyle = inst.color; gctx.lineWidth = 1.2; gctx.stroke();
    }));
  }

  // Current-time marker
  const t = toShow[0]?.state.t ?? 0;
  if (t > 0) {
    const tx = toX(t);
    gctx.strokeStyle = dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
    gctx.lineWidth = 1;
    gctx.setLineDash([2, 2]);
    gctx.beginPath(); gctx.moveTo(tx, oy + pt); gctx.lineTo(tx, oy + pt + iH); gctx.stroke();
    gctx.setLineDash([]);
  }
}

/* ── Readout ──────────────────────────────────────────────── */
const readout = new Lab.Readout(document.getElementById('readout'), [
  { key: 't',  label: 'tempo t' },
  { key: 'h',  label: 'altezza h' },
  { key: 'v',  label: 'velocità v' },
  { key: 'a',  label: 'accelerazione a' },
  { key: 'vt', label: 'velocità limite' },
]);

function updateReadout() {
  const s = instances[0].state;
  readout.set('t',  Lab.fmt(s.t, 2) + ' s');
  readout.set('h',  Lab.fmt(s.h, 1) + ' m');
  readout.set('v',  s.done ? Lab.fmt(s.vImpact, 2) + ' m/s all’impatto' : (s.v > 0 ? '+' : '') + Lab.fmt(s.v, 2) + ' m/s');
  readout.set('a',  (s.a > 0 ? '+' : '') + Lab.fmt(s.a, 2) + ' m/s²');
  const vt = instances[0].terminalV;
  readout.set('vt', isFinite(vt) ? Lab.fmt(vt, 1) + ' m/s' : '— (senza aria)');
}

/* ── Controls ─────────────────────────────────────────────── */
let subAirEl   = null;
let compareSec = null;
let compareListEl   = null;
let btnAddScenario  = null;

function buildControls() {
  const container = document.getElementById('controls');

  // ── Condizioni iniziali
  const secInit = Lab.Section('Condizioni iniziali');

  const sliderH0 = Lab.SliderInput({
    label: 'Altezza iniziale', min: 5, max: 300, value: params.h0, step: 5, unit: 'm',
    onChange(v) { params.h0 = v; resetSim(); },
  });

  const sliderV0 = Lab.SliderInput({
    label: 'Velocità iniziale', min: -50, max: 50, value: params.v0, step: 0.5,
    unit: 'm/s', hint: '(+ su / − giù)',
    onChange(v) { params.v0 = v; instances.forEach(i => { /* v0 applied at reset */ }); resetSim(); },
  });

  secInit.add(sliderH0).add(sliderV0);
  container.appendChild(secInit.el);

  // ── Corpo
  const secBody = Lab.Section('Corpo');

  const radioG = Lab.RadioGroup({
    label: 'Gravità',
    options: PLANETS,
    value: 'terra',
    onChange(val, opt) {
      instances[0].g = opt.g;
      if (compareMode) rebuildCompareList();
      resetSim();
    },
  });

  const sliderMass = Lab.SliderInput({
    label: 'Massa', min: 0.1, max: 20, value: instances[0].mass, step: 0.1, unit: 'kg',
    onChange(v) {
      instances[0].mass = v;
      if (compareMode) rebuildCompareList();
    },
  });

  secBody.add(radioG).add(sliderMass);
  container.appendChild(secBody.el);

  // ── Ambiente
  const secEnv = Lab.Section('Ambiente');

  const toggleAir = Lab.Toggle({
    label: 'Resistenza dell\'aria',
    value: params.airResistance,
    onChange(v) {
      params.airResistance = v;
      subAirEl.style.display = v ? '' : 'none';
      resetSim();
    },
  });

  const subAir = Lab.SubPanel();
  subAirEl = subAir.el;
  subAirEl.style.display = 'none';

  const sliderCd = Lab.SliderInput({
    label: 'Coefficiente di resistenza C_D', min: 0.1, max: 2.0, value: params.Cd, step: 0.01, unit: '',
    onChange(v) { params.Cd = v; },
  });

  subAir.add(sliderCd);
  secEnv.add(toggleAir).add(subAir);
  container.appendChild(secEnv.el);

  // ── Stroboscopio
  const secStrobe = Lab.Section('Fotografia stroboscopica');
  const subStrobe = Lab.SubPanel();
  secStrobe.add(Lab.Toggle({
    label: 'Effetto stroboscopico', value: params.strobe,
    onChange(v) { params.strobe = v; subStrobe.el.style.display = v ? '' : 'none'; draw(); drawGraphs(); },
  }));
  subStrobe.add(Lab.Slider({
    label: 'Intervallo fra i lampi Δt', min: 0.1, max: 1, step: 0.05, value: params.strobeDt, unit: ' s',
    onChange(v) { params.strobeDt = v; resetSim(); },
  }));
  const note = document.createElement('div');
  note.className = 'lab-note';
  note.innerHTML = 'Come in una foto con il flash che scatta a intervalli regolari: le immagini si <b>allontanano</b> sempre di più perché la velocità cresce. Partendo da ferma le distanze stanno come i <b>numeri dispari</b> 1 : 3 : 5 : 7, quindi h ∝ t².';
  subStrobe.add(note);
  secStrobe.add(subStrobe);
  container.appendChild(secStrobe.el);

  // ── Confronto
  compareSec = Lab.Section('Confronto');

  const toggleCompare = Lab.Toggle({
    label: 'Modalità confronto',
    value: false,
    onChange(v) {
      compareMode = v;
      compareContainer.style.display = v ? '' : 'none';
      if (v && instances.length === 1) {
        addCompareInstance(1.62); // default: Luna
        rebuildCompareList();
      }
      resetSim();
    },
  });

  const compareContainer = document.createElement('div');
  compareContainer.style.display = 'none';

  compareListEl = document.createElement('div');
  compareListEl.className = 'compare-list';

  btnAddScenario = document.createElement('button');
  btnAddScenario.className = 'btn-add-scenario';
  btnAddScenario.textContent = '+ Aggiungi scenario';
  btnAddScenario.addEventListener('click', () => {
    if (instances.length >= 4) return;
    addCompareInstance(PLANETS[(instances.length) % PLANETS.length].g);
    rebuildCompareList();
    resetSim();
  });

  compareContainer.append(compareListEl, btnAddScenario);
  compareSec.add(toggleCompare);
  compareSec.el.appendChild(compareContainer);
  container.appendChild(compareSec.el);
}

function addCompareInstance(g) {
  const idx   = instances.length;
  const color = COLORS[idx % COLORS.length];
  const planet = PLANETS.find(p => p.g === g) || PLANETS[2];
  instances.push(new SimInstance(idx, color, planet.g, 1.0));
}

function rebuildCompareList() {
  if (!compareListEl) return;
  compareListEl.innerHTML = '';

  // Row 0 — primary (read-only, controlled by main panel)
  const primary = instances[0];
  const pRow = document.createElement('div');
  pRow.className = 'compare-scenario';
  const pDot = document.createElement('span');
  pDot.className = 'compare-dot';
  pDot.style.cssText = `background:${primary.color};box-shadow:0 0 6px ${primary.color}`;
  const pLabel = document.createElement('span');
  pLabel.style.cssText = 'flex:1;font-size:11px;font-weight:600;color:var(--text-secondary)';
  const pPlanet = PLANETS.find(p => Math.abs(p.g - primary.g) < 0.01) || { label: 'Custom' };
  pLabel.textContent = `${pPlanet.label} · ${primary.mass} kg`;
  const pBadge = document.createElement('span');
  pBadge.style.cssText = 'font-size:9px;font-weight:700;font-family:"Space Mono",monospace;color:var(--text-hint);letter-spacing:0.5px';
  pBadge.textContent = 'PRINCIPALE';
  pRow.append(pDot, pLabel, pBadge);
  compareListEl.appendChild(pRow);

  // Rows 1..n — extra instances (editable)
  instances.slice(1).forEach((inst, ri) => {
    const i = ri + 1;
    const row = document.createElement('div');
    row.className = 'compare-scenario';

    const dot = document.createElement('span');
    dot.className = 'compare-dot';
    dot.style.cssText = `background:${inst.color};box-shadow:0 0 6px ${inst.color}`;

    const sel = document.createElement('select');
    sel.className = 'ctrl-select';
    PLANETS.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.value;
      opt.textContent = p.label;
      if (Math.abs(p.g - inst.g) < 0.01) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', () => {
      inst.g = PLANETS.find(p => p.value === sel.value).g;
      resetSim();
    });

    const massNum = document.createElement('input');
    massNum.type  = 'number';
    massNum.min   = 0.1; massNum.max = 20; massNum.step = 0.1;
    massNum.value = inst.mass.toFixed(1);
    massNum.className = 'ctrl-number';
    massNum.style.width = '48px';
    massNum.title = 'massa (kg)';
    massNum.addEventListener('change', () => {
      let v = parseFloat(massNum.value);
      if (isNaN(v)) v = inst.mass;
      v = Math.max(0.1, Math.min(20, v));
      massNum.value = v.toFixed(1);
      inst.mass = v;
    });

    const rm = document.createElement('button');
    rm.className = 'btn-remove-scenario';
    rm.textContent = '×';
    rm.addEventListener('click', () => {
      instances.splice(i, 1);
      instances.forEach((x, j) => { x.id = j; x.color = COLORS[j % COLORS.length]; });
      rebuildCompareList();
      resetSim();
    });

    row.append(dot, sel, massNum, rm);
    compareListEl.appendChild(row);
  });

  if (btnAddScenario) btnAddScenario.disabled = instances.length >= 4;
}

/* ── Buttons ──────────────────────────────────────────────── */
const btnPlay  = document.getElementById('btnPlay');
const btnReset = document.getElementById('btnReset');

btnPlay.addEventListener('click', () => {
  if (allDone()) return;
  simRunning ? pauseSim() : startSim();
});
btnReset.addEventListener('click', resetSim);

/* ── Utilities ────────────────────────────────────────────── */
function fmtNum(v) {
  const abs = Math.abs(v);
  if (abs >= 100) return v.toFixed(0);
  if (abs >= 10)  return v.toFixed(1);
  return v.toFixed(2);
}

function niceTicks(min, max, n = 4) {
  const range = max - min;
  if (range <= 0) return [min];
  const rawStep = range / n;
  const mag  = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag;
  const ticks = [];
  for (let i = Math.ceil(min / step); i * step <= max + step * 0.001; i++) {
    const v = +(i * step).toPrecision(10);
    if (v >= min - step * 0.001) ticks.push(v);
  }
  return ticks;
}

function fmtTick(v) {
  if (v === 0) return '0';
  const abs = Math.abs(v);
  const s = abs >= 100 ? v.toFixed(0) :
            abs >= 10  ? v.toFixed(1) :
            abs >= 1   ? v.toFixed(1) :
                         v.toFixed(2);
  return (s.includes('.') ? s.replace(/\.?0+$/, '') : s).replace('.', ',').replace('-', '−');
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function lighten(hex, amt) {
  const r = Math.min(255, parseInt(hex.slice(1,3),16) + Math.round(255*amt));
  const g = Math.min(255, parseInt(hex.slice(3,5),16) + Math.round(255*amt));
  const b = Math.min(255, parseInt(hex.slice(5,7),16) + Math.round(255*amt));
  return `rgb(${r},${g},${b})`;
}

function darken(hex, amt) {
  const r = Math.max(0, parseInt(hex.slice(1,3),16) - Math.round(255*amt));
  const g = Math.max(0, parseInt(hex.slice(3,5),16) - Math.round(255*amt));
  const b = Math.max(0, parseInt(hex.slice(5,7),16) - Math.round(255*amt));
  return `rgb(${r},${g},${b})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/* ── Resize-handle drag ────────────────────────────────────── */
(function () {
  const handle = document.getElementById('resizeHandle');
  if (!handle) return;
  let active = false, startY = 0, startH = 0;

  handle.addEventListener('mousedown', e => {
    active  = true;
    startY  = e.clientY;
    startH  = graphArea.offsetHeight;
    handle.classList.add('dragging');
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!active) return;
    const newH = Math.max(80, Math.min(500, startH + (startY - e.clientY)));
    graphArea.style.height = newH + 'px';
    resizeAll(); draw(); drawGraphs();
  });

  document.addEventListener('mouseup', () => {
    if (!active) return;
    active = false;
    handle.classList.remove('dragging');
    document.body.style.userSelect = '';
  });
}());

/* ── Fullscreen ────────────────────────────────────────────── */
(function () {
  const btn = document.getElementById('btnFullscreen');
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      graphArea.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  });

  document.addEventListener('fullscreenchange', () => {
    const inFS = !!document.fullscreenElement;
    btn.textContent = inFS ? '✕' : '⛶';
    btn.title       = inFS ? 'Esci da schermo intero' : 'Schermo intero';
    resizeAll(); draw(); drawGraphs();
  });
}());

/* ── Init ─────────────────────────────────────────────────── */
Lab.initTheme();
buildControls();
rebuildCompareList();
computeViewMaxH();
computeArrowVRef();
computeGraphRanges();
graphArea.style.height = (window.innerWidth < 800 ? 130 : 240) + 'px';
resizeAll();
updateReadout();
draw();
drawGraphs();

new MutationObserver(() => { draw(); drawGraphs(); }).observe(
  document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }
);
