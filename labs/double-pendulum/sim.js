/* ── Double Pendulum Simulation ─────────────────────────────── */

const PLANETS = [
  { value: 'luna',  label: 'Luna',  hint: '1,62 m/s²', g: 1.62  },
  { value: 'marte', label: 'Marte', hint: '3,72 m/s²', g: 3.72  },
  { value: 'terra', label: 'Terra', hint: '9,81 m/s²', g: 9.81  },
  { value: 'giove', label: 'Giove', hint: '24,79 m/s²', g: 24.79 },
];

// Two bobs per instance need two colors each: [bob1, bob2]
const COLOR_PAIRS = [
  ['#00d4ff', '#ff4757'],
  ['#2ecc71', '#ffb400'],
];

const PHYSICS_DT       = 1 / 120;
const HIST_STEP        = 3;
const MAX_TRAIL        = 1200;
const MAX_TRAIL_PERSIST = 12000;

const params = { damping: false, b: 0.05 };
let persistTrail = false;

/* ── SimInstance ─────────────────────────────────────────────── */
class SimInstance {
  constructor(id, g, L1, L2, m1, m2, theta1_0, theta2_0) {
    this.id       = id;
    this.g        = g;
    this.L1       = L1;
    this.L2       = L2;
    this.m1       = m1;
    this.m2       = m2;
    this.theta1_0 = theta1_0;  // degrees
    this.theta2_0 = theta2_0;  // degrees
    this.color1   = COLOR_PAIRS[id % COLOR_PAIRS.length][0];
    this.color2   = COLOR_PAIRS[id % COLOR_PAIRS.length][1];
    this._stepCount = 0;
    this.reset();
  }

  reset() {
    const t1 = this.theta1_0 * Math.PI / 180;
    const t2 = this.theta2_0 * Math.PI / 180;
    this.state = { t: 0, theta1: t1, omega1: 0, theta2: t2, omega2: 0 };
    this.trail1 = [];
    this.trail2 = [];
    this.history = [];
    this._stepCount = 0;
  }

  // Bob positions (pivot at origin, y up)
  get bob1X() { return this.L1 * Math.sin(this.state.theta1); }
  get bob1Y() { return -this.L1 * Math.cos(this.state.theta1); }
  get bob2X() { return this.bob1X + this.L2 * Math.sin(this.state.theta2); }
  get bob2Y() { return this.bob1Y - this.L2 * Math.cos(this.state.theta2); }

  // Bob velocities
  get v1X() { return  this.L1 * this.state.omega1 * Math.cos(this.state.theta1); }
  get v1Y() { return  this.L1 * this.state.omega1 * Math.sin(this.state.theta1); }
  get v1()  { return  Math.abs(this.state.omega1) * this.L1; }
  get v2X() {
    return this.L1 * this.state.omega1 * Math.cos(this.state.theta1)
         + this.L2 * this.state.omega2 * Math.cos(this.state.theta2);
  }
  get v2Y() {
    return this.L1 * this.state.omega1 * Math.sin(this.state.theta1)
         + this.L2 * this.state.omega2 * Math.sin(this.state.theta2);
  }
  get v2() { return Math.hypot(this.v2X, this.v2Y); }

  // Standard double-pendulum EOM (Lagrangian, absolute angles from downward vertical)
  // Ref: https://www.myphysicslab.com/pendulum/double-pendulum-en.html
  _deriv(theta1, omega1, theta2, omega2) {
    const Delta = theta1 - theta2;
    const sinD  = Math.sin(Delta);
    const cosD  = Math.cos(Delta);
    const denom = 2*this.m1 + this.m2 - this.m2 * Math.cos(2 * Delta);

    const dOmega1 = (
      -this.g * (2*this.m1 + this.m2) * Math.sin(theta1)
      - this.m2 * this.g * Math.sin(theta1 - 2*theta2)
      - 2 * sinD * this.m2 * (omega2*omega2*this.L2 + omega1*omega1*this.L1*cosD)
    ) / (this.L1 * denom);

    const dOmega2 = (
      2 * sinD * (
        (this.m1 + this.m2) * omega1*omega1 * this.L1
        + this.g * (this.m1 + this.m2) * Math.cos(theta1)
        + omega2*omega2 * this.L2 * this.m2 * cosD
      )
    ) / (this.L2 * denom);

    const b = params.damping ? params.b : 0;
    return {
      dTheta1: omega1,       dOmega1: dOmega1 - b * omega1,
      dTheta2: omega2,       dOmega2: dOmega2 - b * omega2,
    };
  }

  step(dt) {
    const { theta1, omega1, theta2, omega2 } = this.state;
    const k1 = this._deriv(theta1,                    omega1,                    theta2,                    omega2);
    const k2 = this._deriv(theta1 + dt/2*k1.dTheta1, omega1 + dt/2*k1.dOmega1, theta2 + dt/2*k1.dTheta2, omega2 + dt/2*k1.dOmega2);
    const k3 = this._deriv(theta1 + dt/2*k2.dTheta1, omega1 + dt/2*k2.dOmega1, theta2 + dt/2*k2.dTheta2, omega2 + dt/2*k2.dOmega2);
    const k4 = this._deriv(theta1 + dt  *k3.dTheta1, omega1 + dt  *k3.dOmega1, theta2 + dt  *k3.dTheta2, omega2 + dt  *k3.dOmega2);

    this.state.theta1 += (dt/6)*(k1.dTheta1 + 2*k2.dTheta1 + 2*k3.dTheta1 + k4.dTheta1);
    this.state.omega1 += (dt/6)*(k1.dOmega1 + 2*k2.dOmega1 + 2*k3.dOmega1 + k4.dOmega1);
    this.state.theta2 += (dt/6)*(k1.dTheta2 + 2*k2.dTheta2 + 2*k3.dTheta2 + k4.dTheta2);
    this.state.omega2 += (dt/6)*(k1.dOmega2 + 2*k2.dOmega2 + 2*k3.dOmega2 + k4.dOmega2);
    this.state.t += dt;

    const x1 = this.bob1X, y1 = this.bob1Y;
    const x2 = this.bob2X, y2 = this.bob2Y;
    const maxT = persistTrail ? MAX_TRAIL_PERSIST : MAX_TRAIL;
    this.trail1.push({ x: x1, y: y1 });
    this.trail2.push({ x: x2, y: y2 });
    if (this.trail1.length > maxT) { this.trail1.shift(); this.trail2.shift(); }

    this._stepCount++;
    if (this._stepCount % HIST_STEP === 0) {
      this.history.push({ t: this.state.t, x1, y1, x2, y2, v1: this.v1, v2: this.v2 });
      if (this.history.length > 3000) this.history.shift();
    }
  }
}

/* ── Simulation state ─────────────────────────────────────────── */
let instances   = [new SimInstance(0, 9.81, 1.0, 1.0, 1.0, 1.0, 90, 90)];
let compareMode = false;
let simRunning  = false;
let rafId       = null;
let lastTs      = null;
let physAcc     = 0;
let graphRanges = null;

function activeInstances() { return compareMode ? instances : [instances[0]]; }

function computeGraphRanges() {
  const insts = activeInstances();
  const pad   = 0.08;
  let maxR = 0, vMax = 0, tMax = 0;

  insts.forEach(inst => {
    const R = inst.L1 + inst.L2;
    maxR = Math.max(maxR, R);
    // Energy-based v upper bound for bob2
    const t1 = inst.theta1_0 * Math.PI / 180;
    const t2 = inst.theta2_0 * Math.PI / 180;
    const E  = (inst.m1 + inst.m2) * inst.g * inst.L1 * (1 - Math.cos(t1))
             + inst.m2 * inst.g * inst.L2 * (1 - Math.cos(t2));
    vMax = Math.max(vMax, Math.sqrt(2 * Math.max(E, 0.01) / Math.min(inst.m2, inst.m1)) * 1.4);
    // Window: ~3 natural periods of outer arm
    const largAngle = 1 / Math.sqrt(Math.max(0.01, Math.cos((Math.max(Math.abs(t1), Math.abs(t2))) / 2)));
    tMax = Math.max(tMax, 2 * Math.PI * Math.sqrt(inst.L2 / inst.g) * largAngle * 3);
  });

  vMax = Math.max(vMax, 0.1);

  if (params.damping) tMax = Math.max(tMax * 3, 6 / params.b);

  graphRanges = {
    tMax:   Math.max(tMax * (1 + pad), 2.0),
    xyRange: [-maxR * (1 + pad), maxR * (1 + pad)],
    vRange:  [0, vMax * (1 + pad)],
  };
}

/* ── Simulation control ──────────────────────────────────────── */
function startSim() {
  if (simRunning) return;
  simRunning = true; lastTs = null; physAcc = 0;
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
  computeGraphRanges();
  updatePlayBtn();
  draw(); drawGraphs(); updateReadout();
}

function updatePlayBtn() {
  if (simRunning) {
    btnPlay.textContent = '⏸  PAUSA';
    btnPlay.classList.add('running');
  } else {
    const anyStarted = instances.some(i => i.state.t > 0);
    btnPlay.textContent = anyStarted ? '▶  RIPRENDI' : '▶  AVVIA';
    btnPlay.classList.remove('running');
  }
}

function loop(ts) {
  if (!simRunning) return;
  if (lastTs === null) lastTs = ts;
  const elapsed = Math.min((ts - lastTs) / 1000, 0.05);
  lastTs = ts; physAcc += elapsed;
  const toStep = activeInstances();
  while (physAcc >= PHYSICS_DT) {
    toStep.forEach(i => i.step(PHYSICS_DT));
    physAcc -= PHYSICS_DT;
  }
  draw(); drawGraphs(); updateReadout();
  rafId = requestAnimationFrame(loop);
}

/* ── Canvas setup ────────────────────────────────────────────── */
const canvas    = document.getElementById('simCanvas');
const ctx       = canvas.getContext('2d');
let dpr = 1, cw = 0, ch = 0;

const graphArea   = document.getElementById('graphArea');
const graphCanvas = document.getElementById('graphCanvas');
const gctx        = graphCanvas.getContext('2d');
let gw = 0, gh = 0;

function isDark() { return document.documentElement.dataset.theme !== 'light'; }

function resizeAll() {
  dpr = window.devicePixelRatio || 1;
  if (document.fullscreenElement === graphArea) {
    gw = graphArea.clientWidth; gh = graphArea.clientHeight;
    graphCanvas.width  = Math.round(gw * dpr); graphCanvas.height = Math.round(gh * dpr);
    graphCanvas.style.width  = gw + 'px';      graphCanvas.style.height = gh + 'px';
    gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return;
  }
  const parent  = canvas.parentElement;
  const graphH  = graphArea.offsetHeight || 240;
  const handleH = document.getElementById('resizeHandle')?.offsetHeight || 6;
  cw = parent.clientWidth;
  ch = Math.max(80, parent.clientHeight - graphH - 52 - handleH);

  canvas.width  = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  canvas.style.width  = cw + 'px';     canvas.style.height = ch + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  gw = graphArea.clientWidth; gh = graphArea.clientHeight || 240;
  graphCanvas.width  = Math.round(gw * dpr); graphCanvas.height = Math.round(gh * dpr);
  graphCanvas.style.width  = gw + 'px';     graphCanvas.style.height = gh + 'px';
  gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

const ro = new ResizeObserver(() => { resizeAll(); draw(); drawGraphs(); });
ro.observe(canvas.parentElement);

/* ── Scene coordinates ───────────────────────────────────────── */
function sceneScale() {
  const maxR = Math.max(...activeInstances().map(i => i.L1 + i.L2), 0.5);
  return Math.min(cw, ch) * 0.40 / maxR;
}
function pivotX() { return cw / 2; }
function pivotY() { return ch * 0.14; }
function toSX(x) { return pivotX() + x * sceneScale(); }
function toSY(y) { return pivotY() - y * sceneScale(); }

/* ── Drawing: simulation canvas ─────────────────────────────── */
function draw() {
  ctx.clearRect(0, 0, cw, ch);
  const dark   = isDark();
  const active = activeInstances();
  drawBackground(dark);
  // Trails first (behind rods)
  active.forEach(inst => drawTrails(inst));
  // Rods and bobs on top
  active.forEach(inst => drawPendulum(inst, dark));
  if (compareMode && active.length > 1) drawLegend(dark);
}

function drawBackground(dark) {
  const px = pivotX(), py = pivotY();
  ctx.strokeStyle = dark ? 'rgba(0,212,255,0.30)' : 'rgba(0,100,160,0.40)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(px - 44, py - 4); ctx.lineTo(px + 44, py - 4); ctx.stroke();
  ctx.strokeStyle = dark ? 'rgba(0,212,255,0.10)' : 'rgba(0,100,160,0.13)';
  ctx.lineWidth = 1;
  for (let i = -4; i <= 4; i++) {
    const x = px + i * 12;
    ctx.beginPath(); ctx.moveTo(x, py - 4); ctx.lineTo(x - 9, py - 13); ctx.stroke();
  }
}

function drawTrails(inst) {
  [[inst.trail1, inst.color1], [inst.trail2, inst.color2]].forEach(([trail, color]) => {
    if (trail.length < 2) return;
    if (persistTrail) {
      ctx.strokeStyle = hexToRgba(color, 0.28);
      ctx.lineWidth = 1;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      trail.forEach((pt, i) => {
        const sx = toSX(pt.x), sy = toSY(pt.y);
        i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      });
      ctx.stroke();
    } else {
      for (let i = 1; i < trail.length; i++) {
        const alpha = (i / trail.length) * 0.50;
        const r     = 0.8 + (i / trail.length) * 1.8;
        ctx.beginPath(); ctx.arc(toSX(trail[i].x), toSY(trail[i].y), r, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(color, alpha); ctx.fill();
      }
    }
  });
}

function drawPendulum(inst, dark) {
  const px = pivotX(), py = pivotY();
  const b1x = toSX(inst.bob1X), b1y = toSY(inst.bob1Y);
  const b2x = toSX(inst.bob2X), b2y = toSY(inst.bob2Y);
  const R1 = Math.max(3, Math.min(7,  Math.min(cw, ch) * 0.018));
  const R2 = Math.max(4, Math.min(9,  Math.min(cw, ch) * 0.022));

  // Rod 1 (pivot → bob1)
  ctx.strokeStyle = dark ? 'rgba(221,238,255,0.45)' : 'rgba(13,26,38,0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(b1x, b1y); ctx.stroke();

  // Rod 2 (bob1 → bob2)
  ctx.strokeStyle = dark ? 'rgba(221,238,255,0.35)' : 'rgba(13,26,38,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(b1x, b1y); ctx.lineTo(b2x, b2y); ctx.stroke();

  // Pivot dot
  ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2);
  ctx.fillStyle = dark ? 'rgba(0,212,255,0.70)' : 'rgba(0,100,160,0.70)'; ctx.fill();

  drawBob(b1x, b1y, R1, inst.color1);
  drawBob(b2x, b2y, R2, inst.color2);

  // Velocity arrows
  if (inst.v1 > 0.01) drawArrow(b1x, b1y, inst.v1X, inst.v1Y, inst.v1, R1, dark);
  if (inst.v2 > 0.01) drawArrow(b2x, b2y, inst.v2X, inst.v2Y, inst.v2, R2, dark);
}

function drawBob(bx, by, R, color) {
  const glow = ctx.createRadialGradient(bx, by, 0, bx, by, R * 3.2);
  glow.addColorStop(0, hexToRgba(color, 0.18));
  glow.addColorStop(1, hexToRgba(color, 0));
  ctx.beginPath(); ctx.arc(bx, by, R * 3.2, 0, Math.PI * 2);
  ctx.fillStyle = glow; ctx.fill();

  const grad = ctx.createRadialGradient(bx - 2, by - 2, 0, bx, by, R);
  grad.addColorStop(0, lighten(color, 0.6));
  grad.addColorStop(0.4, color);
  grad.addColorStop(1, darken(color, 0.5));
  ctx.beginPath(); ctx.arc(bx, by, R, 0, Math.PI * 2);
  ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath(); ctx.arc(bx - 2, by - 2, R * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
}

function drawArrow(ox, oy, vx, vy, speed, R, dark) {
  const refV    = Math.max(...activeInstances().map(i => Math.max(i.v1, i.v2)), 0.01);
  const maxLen  = Math.min(56, Math.min(cw, ch) * 0.12);
  const len     = (speed / refV) * maxLen;
  if (len < 3) return;
  const angle   = Math.atan2(-vy, vx);  // canvas y is inverted
  const arrowColor = dark ? 'rgba(255,180,0,0.80)' : 'rgba(180,120,0,0.80)';
  const sx = ox + Math.cos(angle) * (R + 2);
  const sy = oy + Math.sin(angle) * (R + 2);
  const tx = ox + Math.cos(angle) * (len + R + 2);
  const ty = oy + Math.sin(angle) * (len + R + 2);
  const headLen = Math.min(7, len * 0.4);
  const ha = Math.PI / 6;

  ctx.strokeStyle = arrowColor; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(sx, sy);
  ctx.lineTo(tx - Math.cos(angle)*headLen, ty - Math.sin(angle)*headLen); ctx.stroke();
  ctx.fillStyle = arrowColor;
  ctx.beginPath(); ctx.moveTo(tx, ty);
  ctx.lineTo(tx - Math.cos(angle-ha)*headLen, ty - Math.sin(angle-ha)*headLen);
  ctx.lineTo(tx - Math.cos(angle+ha)*headLen, ty - Math.sin(angle+ha)*headLen);
  ctx.closePath(); ctx.fill();
}

function drawLegend(dark) {
  const pad = 8, lineH = 16;
  const boxW = 170, boxH = pad + instances.length * lineH * 2 + 4;
  const bx = cw - boxW - 12, by = pivotY() + 10;
  ctx.fillStyle = dark ? 'rgba(6,10,16,0.80)' : 'rgba(240,242,245,0.85)';
  ctx.strokeStyle = dark ? 'rgba(0,212,255,0.12)' : 'rgba(0,100,160,0.15)';
  ctx.lineWidth = 1;
  roundRect(ctx, bx, by, boxW, boxH, 6); ctx.fill(); ctx.stroke();
  instances.forEach((inst, i) => {
    const y = by + pad + i * lineH * 2;
    ctx.font = '600 10px "DM Sans",sans-serif';
    ctx.fillStyle = dark ? 'rgba(221,238,255,0.70)' : 'rgba(13,26,38,0.70)';
    ctx.textAlign = 'left';
    ctx.fillText(`#${i+1}  L₁=${inst.L1}m  L₂=${inst.L2}m  θ₁=${inst.theta1_0}°  θ₂=${inst.theta2_0}°`, bx + 8, y + 10);
    ctx.beginPath(); ctx.arc(bx + 12, y + lineH + 6, 4, 0, Math.PI * 2);
    ctx.fillStyle = inst.color1; ctx.fill();
    ctx.beginPath(); ctx.arc(bx + 28, y + lineH + 6, 4, 0, Math.PI * 2);
    ctx.fillStyle = inst.color2; ctx.fill();
    ctx.font = '500 9px "DM Sans",sans-serif';
    ctx.fillStyle = dark ? 'rgba(221,238,255,0.55)' : 'rgba(13,26,38,0.55)';
    ctx.fillText('bob₁', bx + 36, y + lineH + 10);
    ctx.fillText('bob₂', bx + 68, y + lineH + 10);
  });
}

/* ── Graph drawing ───────────────────────────────────────────── */
// Panel selectors
const SEL2 = [
  { key: 'x2', label: 'x₂', g1: d => d.x2, g2: null },
  { key: 'y2', label: 'y₂', g1: d => d.y2, g2: null },
  { key: 'x1', label: 'x₁', g1: d => d.x1, g2: null },
  { key: 'y1', label: 'y₁', g1: d => d.y1, g2: null },
];
const SEL3 = [
  { key: 'v2', label: '|v₂|', g1: d => d.v2, g2: null },
  { key: 'v1', label: '|v₁|', g1: d => d.v1, g2: null },
];
let sel2 = 'x2', sel3 = 'v2';
let sBtnAreas2 = [], sBtnAreas3 = [];

function drawGraphs() {
  if (!gw || !gh) return;
  gctx.clearRect(0, 0, gw, gh);
  const dark   = isDark();
  const active = activeInstances();
  const W      = Math.floor(gw / 3);
  const PAD    = { t: 18, b: 30, l: 46, r: 10 };
  const gr     = graphRanges;
  const tNow   = active[0]?.state.t ?? 0;

  // Panel 1: both bobs x(t) or y(t) — show x1+x2 for single inst, x2 only in compare
  // Panel 2: selected position of selected bob
  // Panel 3: selected speed

  // Build series arrays
  const opt2 = SEL2.find(o => o.key === sel2);
  const opt3 = SEL3.find(o => o.key === sel3);
  const xyR  = gr?.xyRange;
  const vR   = gr?.vRange;
  const tM   = gr?.tMax;

  // Panel 1 — both bobs on same panel (x₁ cyan, x₂ red in single; x₂ per instance in compare)
  const p1label = compareMode ? 'x₂ (m)' : 'x (m)';
  const p1series = compareMode
    ? active.map(inst => ({ color: inst.color2, history: inst.history, getValue: d => d.x2 }))
    : [
        { color: active[0].color1, history: active[0].history, getValue: d => d.x1 },
        { color: active[0].color2, history: active[0].history, getValue: d => d.x2 },
      ];

  const p2series = compareMode
    ? active.map(inst => ({ color: inst.color2, history: inst.history, getValue: opt2.g1 }))
    : [
        { color: active[0].color1, history: active[0].history, getValue: opt2.g1 },
        { color: active[0].color2, history: active[0].history, getValue: opt2.g1 },
      ];

  const p3series = compareMode
    ? active.map(inst => ({ color: inst.color2, history: inst.history, getValue: opt3.g1 }))
    : [
        { color: active[0].color1, history: active[0].history, getValue: opt3.g1 },
        { color: active[0].color2, history: active[0].history, getValue: opt3.g1 },
      ];

  drawSingleGraph(0,   0, W,      gh, PAD, p1series, p1label,           dark, xyR,  tM, tNow);
  drawSingleGraph(W,   0, W,      gh, PAD, p2series, opt2.label + ' (m)', dark, xyR,  tM, tNow);
  drawSingleGraph(W*2, 0, gw-W*2, gh, PAD, p3series, opt3.label + ' (m/s)', dark, vR, tM, tNow);

  const sep = dark ? 'rgba(0,212,255,0.08)' : 'rgba(0,100,160,0.10)';
  gctx.strokeStyle = sep; gctx.lineWidth = 1;
  [W, W*2].forEach(x => {
    gctx.beginPath(); gctx.moveTo(x, 0); gctx.lineTo(x, gh); gctx.stroke();
  });

  drawSelector(sBtnAreas2, SEL2, sel2, W,   PAD, dark);
  drawSelector(sBtnAreas3, SEL3, sel3, W*2, PAD, dark);
}

function drawSelector(btnAreas, opts, selected, panelX, PAD, dark) {
  const btnW = 26, btnH = 15, gap = 3;
  const startX = panelX + PAD.l + 4;
  const startY = 2;
  btnAreas.length = 0;

  opts.forEach((opt, i) => {
    const x = startX + i * (btnW + gap);
    const y = startY;
    const sel = opt.key === selected;

    gctx.fillStyle = sel
      ? (dark ? 'rgba(0,212,255,0.22)' : 'rgba(0,100,160,0.20)')
      : (dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)');
    gctx.strokeStyle = sel
      ? (dark ? 'rgba(0,212,255,0.55)' : 'rgba(0,100,160,0.55)')
      : (dark ? 'rgba(0,212,255,0.15)' : 'rgba(0,100,160,0.18)');
    gctx.lineWidth = 1;
    gctx.beginPath(); gctx.rect(x, y, btnW, btnH);
    gctx.fill(); gctx.stroke();

    gctx.font = '700 8px "Space Mono",monospace';
    gctx.textAlign = 'center';
    gctx.fillStyle = sel
      ? (dark ? 'rgba(0,212,255,0.95)' : 'rgba(0,100,160,0.95)')
      : (dark ? 'rgba(0,212,255,0.45)' : 'rgba(0,100,160,0.50)');
    gctx.fillText(opt.label, x + btnW / 2, y + 10);

    btnAreas.push({ key: opt.key, x, y, w: btnW, h: btnH });
  });
}

graphCanvas.addEventListener('click', e => {
  const rect = graphCanvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (gw / rect.width);
  const my = (e.clientY - rect.top)  * (gh / rect.height);
  for (const btn of sBtnAreas2) {
    if (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h) {
      sel2 = btn.key; drawGraphs(); return;
    }
  }
  for (const btn of sBtnAreas3) {
    if (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h) {
      sel3 = btn.key; drawGraphs(); return;
    }
  }
});

// series: [{ color, history, getValue }]
function drawSingleGraph(ox, oy, gW, gH, PAD, series, label, dark, yFixed, tFixed, tCurrent) {
  const pl = PAD.l, pr = PAD.r, pt = PAD.t, pb = PAD.b;
  const iW = gW - pl - pr, iH = gH - pt - pb;
  if (iW <= 0 || iH <= 0) return;

  let tRange, yMin, yMax;
  if (yFixed != null && tFixed != null) {
    yMin = yFixed[0]; yMax = yFixed[1]; tRange = tFixed;
  } else {
    let tMax = 0; yMin = Infinity; yMax = -Infinity; let hasData = false;
    series.forEach(s => s.history.forEach(d => {
      const v = s.getValue(d);
      tMax = Math.max(tMax, d.t); yMin = Math.min(yMin, v); yMax = Math.max(yMax, v);
      hasData = true;
    }));
    if (!hasData) { tMax = 5; yMin = -1; yMax = 1; }
    const yr = yMax - yMin || 1;
    yMin -= yr * 0.08; yMax += yr * 0.08;
    tRange = Math.max(tMax * 1.05, 0.5);
  }

  // Sliding window
  const tEnd   = Math.max(tCurrent, tRange);
  const tStart = tEnd - tRange;

  function toX(t) { return ox + pl + ((t - tStart) / tRange) * iW; }
  function toY(y) { return oy + pt + (1 - (y - yMin) / (yMax - yMin)) * iH; }

  const axisClr = dark ? 'rgba(200,220,255,0.35)' : 'rgba(0,0,0,0.28)';
  const gridClr = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const tickClr = dark ? '#6b8099' : '#4a6278';
  const lblClr  = dark ? '#6b8099' : '#4a6278';

  const yTicks = niceTicks(yMin, yMax, 4);
  const tTicks = niceTicks(tStart, tEnd, 4);

  yTicks.forEach(tv => {
    if (tv < yMin - 1e-9 || tv > yMax + 1e-9) return;
    const gy = toY(tv);
    const isZero = Math.abs(tv) < 1e-9;
    gctx.strokeStyle = isZero ? axisClr : gridClr;
    gctx.lineWidth   = isZero ? 1.5 : 1;
    gctx.beginPath(); gctx.moveTo(ox + pl, gy); gctx.lineTo(ox + pl + iW, gy); gctx.stroke();
  });

  tTicks.forEach(tv => {
    if (tv < tStart - 1e-9 || tv > tEnd + 1e-9) return;
    const gx = toX(tv);
    gctx.strokeStyle = gridClr; gctx.lineWidth = 1;
    gctx.beginPath(); gctx.moveTo(gx, oy + pt); gctx.lineTo(gx, oy + pt + iH); gctx.stroke();
  });

  gctx.strokeStyle = axisClr; gctx.lineWidth = 1.5;
  gctx.beginPath(); gctx.moveTo(ox + pl, oy + pt); gctx.lineTo(ox + pl, oy + pt + iH); gctx.stroke();

  if (yMin < -1e-9 && yMax > 1e-9) {
    const zeroY = toY(0);
    gctx.strokeStyle = axisClr; gctx.lineWidth = 1.5;
    gctx.beginPath(); gctx.moveTo(ox + pl, zeroY); gctx.lineTo(ox + pl + iW, zeroY); gctx.stroke();
  }

  gctx.strokeStyle = dark ? 'rgba(200,220,255,0.35)' : 'rgba(0,0,0,0.28)';
  gctx.lineWidth = 1;
  gctx.strokeRect(ox + pl, oy + pt, iW, iH);

  gctx.font = '700 9px "Space Mono",monospace'; gctx.textAlign = 'right';
  yTicks.forEach(tv => {
    if (tv < yMin - 1e-9 || tv > yMax + 1e-9) return;
    const gy = toY(tv);
    gctx.strokeStyle = axisClr; gctx.lineWidth = 1;
    gctx.beginPath(); gctx.moveTo(ox + pl - 4, gy); gctx.lineTo(ox + pl, gy); gctx.stroke();
    gctx.fillStyle = tickClr;
    gctx.fillText(fmtTick(tv), ox + pl - 6, gy + 4);
  });

  gctx.textAlign = 'center';
  tTicks.forEach(tv => {
    if (tv < tStart - 1e-9 || tv > tEnd + 1e-9) return;
    const gx = toX(tv);
    if (gx < ox + pl || gx > ox + pl + iW) return;
    gctx.strokeStyle = axisClr; gctx.lineWidth = 1;
    gctx.beginPath(); gctx.moveTo(gx, oy + pt + iH); gctx.lineTo(gx, oy + pt + iH + 4); gctx.stroke();
    if (tv > tStart + tRange * 0.03) {
      gctx.fillStyle = tickClr;
      gctx.fillText(fmtTick(tv) + ' s', gx, oy + pt + iH + 16);
    }
  });

  gctx.save();
  gctx.translate(ox + 9, oy + pt + iH / 2);
  gctx.rotate(-Math.PI / 2);
  gctx.textAlign = 'center'; gctx.fillStyle = lblClr;
  gctx.font = '700 9px "Space Mono",monospace';
  gctx.fillText(label, 0, 0);
  gctx.restore();

  gctx.save();
  gctx.beginPath(); gctx.rect(ox + pl, oy + pt, iW, iH); gctx.clip();

  series.forEach(s => {
    const data = s.history.filter(d => d.t >= tStart);
    if (data.length < 2) return;
    gctx.strokeStyle = s.color; gctx.lineWidth = 1.5; gctx.lineJoin = 'round';
    gctx.beginPath();
    data.forEach((d, i) => {
      const x = toX(d.t), y = toY(s.getValue(d));
      i === 0 ? gctx.moveTo(x, y) : gctx.lineTo(x, y);
    });
    gctx.stroke();
    const last = data[data.length - 1];
    gctx.beginPath(); gctx.arc(toX(last.t), toY(s.getValue(last)), 2.5, 0, Math.PI * 2);
    gctx.fillStyle = s.color; gctx.fill();
  });

  if (tCurrent > 0) {
    const tx = toX(tCurrent);
    gctx.strokeStyle = dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
    gctx.lineWidth = 1; gctx.setLineDash([2, 2]);
    gctx.beginPath(); gctx.moveTo(tx, oy + pt); gctx.lineTo(tx, oy + pt + iH); gctx.stroke();
    gctx.setLineDash([]);
  }

  gctx.restore();
}

/* ── Readout ─────────────────────────────────────────────────── */
const readout = new Lab.Readout(document.getElementById('readout'), [
  { key: 't',  label: 'tempo t'     },
  { key: 't1', label: 'angolo θ₁'    },
  { key: 't2', label: 'angolo θ₂'    },
  { key: 'x2', label: 'posizione x₂'    },
  { key: 'y2', label: 'quota y₂'    },
  { key: 'v2', label: 'velocità |v₂|'  },
]);

function updateReadout() {
  const inst = instances[0];
  const s = inst.state;
  readout.set('t',  Lab.fmt(s.t,2) + ' s');
  readout.set('t1', Lab.fmt((s.theta1 * 180 / Math.PI),1) + '°');
  readout.set('t2', Lab.fmt((s.theta2 * 180 / Math.PI),1) + '°');
  readout.set('x2', Lab.fmt(inst.bob2X,3) + ' m');
  readout.set('y2', Lab.fmt(inst.bob2Y,3) + ' m');
  readout.set('v2', Lab.fmt(inst.v2,3) + ' m/s');
}

/* ── Controls ────────────────────────────────────────────────── */
let compareListEl  = null;
let btnAddScenario = null;
let subDampEl      = null;

function buildControls() {
  const container = document.getElementById('controls');

  // — Condizioni iniziali (braccio 1)
  const sec1 = Lab.Section('Braccio 1');
  sec1.add(Lab.SliderInput({ label: 'Lunghezza L₁', min: 0.2, max: 3.0, value: instances[0].L1, step: 0.1, unit: 'm',
    onChange(v) { instances[0].L1 = v; resetSim(); },
  }));
  sec1.add(Lab.SliderInput({ label: 'Massa m₁', min: 0.1, max: 5.0, value: instances[0].m1, step: 0.1, unit: 'kg',
    onChange(v) { instances[0].m1 = v; resetSim(); },
  }));
  sec1.add(Lab.SliderInput({ label: 'Angolo θ₁', min: -175, max: 175, value: instances[0].theta1_0, step: 1, unit: '°',
    onChange(v) { instances[0].theta1_0 = v; resetSim(); },
  }));
  container.appendChild(sec1.el);

  // — Condizioni iniziali (braccio 2)
  const sec2 = Lab.Section('Braccio 2');
  sec2.add(Lab.SliderInput({ label: 'Lunghezza L₂', min: 0.2, max: 3.0, value: instances[0].L2, step: 0.1, unit: 'm',
    onChange(v) { instances[0].L2 = v; resetSim(); },
  }));
  sec2.add(Lab.SliderInput({ label: 'Massa m₂', min: 0.1, max: 5.0, value: instances[0].m2, step: 0.1, unit: 'kg',
    onChange(v) { instances[0].m2 = v; resetSim(); },
  }));
  sec2.add(Lab.SliderInput({ label: 'Angolo θ₂', min: -175, max: 175, value: instances[0].theta2_0, step: 1, unit: '°',
    onChange(v) { instances[0].theta2_0 = v; resetSim(); },
  }));
  container.appendChild(sec2.el);

  // — Visualizzazione
  const secViz = Lab.Section('Visualizzazione');
  secViz.add(Lab.Toggle({
    label: 'Traiettoria persistente', value: persistTrail,
    onChange(v) { persistTrail = v; instances.forEach(i => { i.trail1 = []; i.trail2 = []; }); draw(); },
  }));
  container.appendChild(secViz.el);

  // — Smorzamento
  const secDamp = Lab.Section('Smorzamento');
  secDamp.add(Lab.Toggle({
    label: 'Smorzamento viscoso', value: params.damping,
    onChange(v) {
      params.damping = v;
      subDampEl.style.display = v ? '' : 'none';
      resetSim();
    },
  }));
  const subDamp = Lab.SubPanel();
  subDampEl = subDamp.el;
  subDampEl.style.display = 'none';
  subDamp.add(Lab.SliderInput({
    label: 'Coefficiente b', min: 0.01, max: 1.0, value: params.b, step: 0.01, unit: '',
    onChange(v) { params.b = v; if (params.damping) resetSim(); },
  }));
  secDamp.add(subDamp);
  container.appendChild(secDamp.el);

  // — Corpo celeste
  const secBody = Lab.Section('Corpo celeste');
  secBody.add(Lab.RadioGroup({
    label: 'Gravità', options: PLANETS, value: 'terra',
    onChange(val, opt) { instances[0].g = opt.g; resetSim(); },
  }));
  container.appendChild(secBody.el);

  // — Confronto
  const compareSec = Lab.Section('Confronto');
  const toggleCompare = Lab.Toggle({
    label: 'Modalità confronto', value: false,
    onChange(v) {
      compareMode = v;
      compareContainer.style.display = v ? '' : 'none';
      if (v && instances.length === 1) {
        const ref = instances[0];
        addCompareInstance(ref.g, ref.L1, ref.L2, ref.m1, ref.m2,
          ref.theta1_0 + 0.5, ref.theta2_0 + 0.5);
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
    if (instances.length >= 2) return;
    const ref = instances[0];
    addCompareInstance(ref.g, ref.L1, ref.L2, ref.m1, ref.m2,
      ref.theta1_0 + 1, ref.theta2_0 + 1);
    rebuildCompareList(); resetSim();
  });

  compareContainer.append(compareListEl, btnAddScenario);
  compareSec.add(toggleCompare);
  compareSec.el.appendChild(compareContainer);
  container.appendChild(compareSec.el);
}

function addCompareInstance(g, L1, L2, m1, m2, theta1_0, theta2_0) {
  const idx = instances.length;
  instances.push(new SimInstance(idx, g, L1, L2, m1, m2,
    Math.max(-175, Math.min(175, Math.round(theta1_0))),
    Math.max(-175, Math.min(175, Math.round(theta2_0))),
  ));
}

function rebuildCompareList() {
  if (!compareListEl) return;
  compareListEl.innerHTML = '';

  // Primary row
  const primary = instances[0];
  const pRow = document.createElement('div'); pRow.className = 'compare-scenario';
  const pDot1 = document.createElement('span'); pDot1.className = 'compare-dot';
  pDot1.style.cssText = `background:${primary.color1};box-shadow:0 0 5px ${primary.color1}`;
  const pDot2 = document.createElement('span'); pDot2.className = 'compare-dot';
  pDot2.style.cssText = `background:${primary.color2};box-shadow:0 0 5px ${primary.color2};margin-left:-4px`;
  const pLabel = document.createElement('span');
  pLabel.style.cssText = 'flex:1;font-size:11px;font-weight:600;color:var(--text-secondary)';
  pLabel.textContent = `θ₁=${primary.theta1_0}°  θ₂=${primary.theta2_0}°`;
  const pBadge = document.createElement('span');
  pBadge.style.cssText = 'font-size:9px;font-weight:700;font-family:"Space Mono",monospace;color:var(--text-hint)';
  pBadge.textContent = 'PRINCIPALE';
  pRow.append(pDot1, pDot2, pLabel, pBadge);
  compareListEl.appendChild(pRow);

  instances.slice(1).forEach((inst, ri) => {
    const i = ri + 1;
    const card = document.createElement('div');
    card.style.cssText = 'padding:7px 10px;border-radius:8px;border:1px solid var(--border-idle);background:var(--bg3);display:flex;flex-direction:column;gap:6px;';

    const row1 = document.createElement('div');
    row1.style.cssText = 'display:flex;align-items:center;gap:6px;';
    const dot1 = document.createElement('span'); dot1.className = 'compare-dot';
    dot1.style.cssText = `background:${inst.color1};box-shadow:0 0 5px ${inst.color1};flex-shrink:0`;
    const dot2 = document.createElement('span'); dot2.className = 'compare-dot';
    dot2.style.cssText = `background:${inst.color2};box-shadow:0 0 5px ${inst.color2};flex-shrink:0;margin-left:-4px`;

    const selPlanet = document.createElement('select'); selPlanet.className = 'ctrl-select';
    PLANETS.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.value; opt.textContent = p.label;
      if (Math.abs(p.g - inst.g) < 0.01) opt.selected = true;
      selPlanet.appendChild(opt);
    });
    selPlanet.addEventListener('change', () => {
      inst.g = PLANETS.find(p => p.value === selPlanet.value).g; resetSim();
    });

    const rm = document.createElement('button'); rm.className = 'btn-remove-scenario'; rm.textContent = '×';
    rm.addEventListener('click', () => {
      instances.splice(i, 1);
      instances.forEach((x, j) => {
        x.id = j; x.color1 = COLOR_PAIRS[j % COLOR_PAIRS.length][0];
        x.color2 = COLOR_PAIRS[j % COLOR_PAIRS.length][1];
      });
      rebuildCompareList(); resetSim();
    });
    row1.append(dot1, dot2, selPlanet, rm);

    const row2 = document.createElement('div');
    row2.style.cssText = 'display:flex;align-items:center;gap:6px;padding-left:15px;flex-wrap:wrap;';

    function makeNum(labelTxt, unit, value, min, max, step, onchange) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;align-items:center;gap:3px;';
      const lbl = document.createElement('span');
      lbl.style.cssText = 'font-size:10px;font-weight:600;color:var(--text-hint);font-family:"Space Mono",monospace;white-space:nowrap';
      lbl.textContent = labelTxt;
      const num = document.createElement('input');
      num.type = 'number'; num.min = min; num.max = max; num.step = step; num.value = value;
      num.className = 'ctrl-number'; num.style.width = '44px'; num.title = unit;
      num.addEventListener('change', () => {
        let v = parseFloat(num.value);
        if (isNaN(v)) v = value;
        v = Math.max(min, Math.min(max, v));
        num.value = v; onchange(v); resetSim();
      });
      const u = document.createElement('span');
      u.style.cssText = 'font-size:9px;color:var(--text-hint);font-family:"Space Mono",monospace';
      u.textContent = unit;
      wrap.append(lbl, num, u);
      return wrap;
    }

    row2.appendChild(makeNum('L₁', 'm',  inst.L1,       0.2, 3.0, 0.1, v => { inst.L1 = v; }));
    row2.appendChild(makeNum('L₂', 'm',  inst.L2,       0.2, 3.0, 0.1, v => { inst.L2 = v; }));
    row2.appendChild(makeNum('θ₁', '°',  inst.theta1_0, -175, 175, 1, v => { inst.theta1_0 = v; }));
    row2.appendChild(makeNum('θ₂', '°',  inst.theta2_0, -175, 175, 1, v => { inst.theta2_0 = v; }));

    card.append(row1, row2);
    compareListEl.appendChild(card);
  });

  if (btnAddScenario) btnAddScenario.disabled = instances.length >= 2;
}

/* ── Buttons ─────────────────────────────────────────────────── */
const btnPlay  = document.getElementById('btnPlay');
const btnReset = document.getElementById('btnReset');
btnPlay.addEventListener('click',  () => simRunning ? pauseSim() : startSim());
btnReset.addEventListener('click', resetSim);

/* ── Utilities ───────────────────────────────────────────────── */
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
  const s = abs >= 100 ? v.toFixed(0) : abs >= 10 ? v.toFixed(1) : abs >= 1 ? v.toFixed(1) : v.toFixed(2);
  return (s.includes('.') ? s.replace(/\.?0+$/, '') : s).replace('.', ',').replace('-', '−');
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
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

/* ── Resize-handle drag ──────────────────────────────────────── */
(function () {
  const handle = document.getElementById('resizeHandle');
  if (!handle) return;
  let active = false, startY = 0, startH = 0;
  handle.addEventListener('mousedown', e => {
    active = true; startY = e.clientY; startH = graphArea.offsetHeight;
    handle.classList.add('dragging'); document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!active) return;
    graphArea.style.height = Math.max(80, Math.min(500, startH + (startY - e.clientY))) + 'px';
    resizeAll(); draw(); drawGraphs();
  });
  document.addEventListener('mouseup', () => {
    if (!active) return;
    active = false; handle.classList.remove('dragging'); document.body.style.userSelect = '';
  });
}());

/* ── Fullscreen ──────────────────────────────────────────────── */
(function () {
  const btn = document.getElementById('btnFullscreen');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (!document.fullscreenElement) graphArea.requestFullscreen().catch(() => {});
    else document.exitFullscreen();
  });
  document.addEventListener('fullscreenchange', () => {
    const inFS = !!document.fullscreenElement;
    btn.textContent = inFS ? '✕' : '⛶';
    btn.title = inFS ? 'Esci da schermo intero' : 'Schermo intero';
    resizeAll(); draw(); drawGraphs();
  });
}());

/* ── Init ────────────────────────────────────────────────────── */
Lab.initTheme();
buildControls();
rebuildCompareList();
computeGraphRanges();
graphArea.style.height = (window.innerWidth < 800 ? 130 : 240) + 'px';
resizeAll();
updateReadout();
draw();
drawGraphs();

new MutationObserver(() => { draw(); drawGraphs(); }).observe(
  document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }
);
