/* ── Simple Pendulum Simulation ─────────────────────────────── */

const PLANETS = [
  { value: 'luna',  label: 'Luna',  hint: '1,62 m/s²', g: 1.62  },
  { value: 'marte', label: 'Marte', hint: '3,72 m/s²', g: 3.72  },
  { value: 'terra', label: 'Terra', hint: '9,81 m/s²', g: 9.81  },
  { value: 'giove', label: 'Giove', hint: '24,79 m/s²', g: 24.79 },
];

const COLORS     = ['#00d4ff', '#ff4757', '#2ecc71', '#ffb400'];
const PHYSICS_DT = 1 / 120;
const HIST_STEP  = 3;

const params = { damping: false, b: 0.05 };

/* ── SimInstance ─────────────────────────────────────────────── */
class SimInstance {
  constructor(id, color, g, length = 1.0, mass = 1.0, angle0 = 30, type = 'math') {
    this.id     = id;
    this.color  = color;
    this.g      = g;
    this.length = length;   // m
    this.mass   = mass;     // kg
    this.angle0 = angle0;   // degrees
    this.type   = type;     // 'math' | 'physical'
    this._stepCount = 0;
    this.reset();
  }

  // For a uniform rod pivoting at one end: I = mL²/3
  // τ = -mg(L/2)sinθ  →  θ'' = -(3g/2L)sinθ
  // For mathematical pendulum: θ'' = -(g/L)sinθ
  get alpha0() {
    return this.type === 'physical'
      ? (3 * this.g) / (2 * this.length)
      : this.g / this.length;
  }

  // Small-angle period (for scale pre-computation only)
  get period() {
    return 2 * Math.PI / Math.sqrt(this.alpha0);
  }

  get omegaMax() {
    const theta0 = this.angle0 * Math.PI / 180;
    if (this.type === 'physical') {
      return Math.sqrt(3 * this.g * (1 - Math.cos(theta0)) / this.length);
    }
    return Math.sqrt(2 * this.g * (1 - Math.cos(theta0)) / this.length);
  }

  get tipVMax() {
    return this.omegaMax * this.length;
  }

  reset() {
    const theta0 = this.angle0 * Math.PI / 180;
    this.state = { t: 0, theta: theta0, omega: 0 };
    this.trail = [];
    this.history = [];
    this._stepCount = 0;
  }

  // RK4 on θ'' = -alpha0·sin(θ) - b·ω  (b=0 when undamped)
  _deriv(theta, omega) {
    const damp = params.damping ? params.b * omega : 0;
    return { dTheta: omega, dOmega: -this.alpha0 * Math.sin(theta) - damp };
  }

  step(dt) {
    const { theta, omega } = this.state;

    const k1 = this._deriv(theta,              omega);
    const k2 = this._deriv(theta + dt/2*k1.dTheta, omega + dt/2*k1.dOmega);
    const k3 = this._deriv(theta + dt/2*k2.dTheta, omega + dt/2*k2.dOmega);
    const k4 = this._deriv(theta + dt  *k3.dTheta, omega + dt  *k3.dOmega);

    this.state.theta += (dt / 6) * (k1.dTheta + 2*k2.dTheta + 2*k3.dTheta + k4.dTheta);
    this.state.omega += (dt / 6) * (k1.dOmega + 2*k2.dOmega + 2*k3.dOmega + k4.dOmega);
    this.state.t     += dt;

    // Cartesian position of bob (pivot at origin, y points up)
    const L = this.length;
    const x =  L * Math.sin(this.state.theta);
    const y = -L * Math.cos(this.state.theta);
    // velocity (ω × L in tangential direction)
    const vx =  L * this.state.omega * Math.cos(this.state.theta);
    const vy =  L * this.state.omega * Math.sin(this.state.theta);
    const v  = Math.abs(this.state.omega) * L;

    this.trail.push({ x, y });
    if (this.trail.length > 800) this.trail.shift();

    this._stepCount++;
    if (this._stepCount % HIST_STEP === 0) {
      this.history.push({ t: this.state.t, x, y, vx, vy, v });
      if (this.history.length > 3000) this.history.shift();
    }
  }

  // Current cartesian position
  get bobX() { return this.length * Math.sin(this.state.theta); }
  get bobY() { return -this.length * Math.cos(this.state.theta); }
  get bobVx() { return this.length * this.state.omega * Math.cos(this.state.theta); }
  get bobVy() { return this.length * this.state.omega * Math.sin(this.state.theta); }
  get bobV()  { return Math.abs(this.state.omega) * this.length; }
}

/* ── Simulation state ────────────────────────────────────────── */
let instances   = [new SimInstance(0, COLORS[0], 9.81, 2.0, 1.0, 30, 'math')];   // 2 m: ben visibile con la scala fissa (5 m a tutta altezza)
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
  let tMax = 0, xMax = 0, yBottom = 0, yTop = -Infinity, vMax = 0;

  insts.forEach(inst => {
    const theta0 = inst.angle0 * Math.PI / 180;
    // 1/sqrt(cos(θ/2)) approximates the large-angle period correction factor
    const largAngleFactor = 1 / Math.sqrt(Math.max(0.01, Math.cos(theta0 / 2)));
    tMax    = Math.max(tMax, inst.period * largAngleFactor * 2.5);
    xMax    = Math.max(xMax, inst.length * Math.abs(Math.sin(theta0)));
    // bob y ranges from -L (equilibrium) to -L*cos(θ₀) (max angle)
    yBottom = Math.min(yBottom, -inst.length);
    yTop    = Math.max(yTop,    -inst.length * Math.cos(theta0));
    vMax    = Math.max(vMax, inst.tipVMax);
  });

  xMax = Math.max(xMax, 0.01); vMax = Math.max(vMax, 0.01);
  const ySpan = Math.max(yTop - yBottom, 0.001);

  // With damping show ~3 time-constants (τ = 2/b) or at least 3 periods
  if (params.damping) tMax = Math.max(tMax * 3, 6 / params.b);

  graphRanges = {
    tMax:    Math.max(tMax * (1 + pad), 1.0),
    xRange:  [-xMax * (1 + pad),          xMax * (1 + pad)],
    yRange:  [yBottom - ySpan * pad,       yTop  + ySpan * pad],
    vRange:  [-vMax * (1 + pad),           vMax  * (1 + pad)],
    vxRange: [-vMax * (1 + pad),           vMax  * (1 + pad)],
    vyRange: [-vMax * (1 + pad),           vMax  * (1 + pad)],
  };
}

/* ── Simulation control ───────────────────────────────────────── */
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

/* ── Canvas setup ─────────────────────────────────────────────── */
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

/* ── Drawing: simulation canvas ──────────────────────────────── */
// Scala FISSA in px/metro: la lunghezza disegnata è proporzionale a L (max slider = 5 m).
// Così modificando L cambia anche la lunghezza visibile nel canvas.
const L_FULLSCALE = 5.0;
function sceneScale() {
  return Math.min(ch * 0.72, cw * 0.42) / L_FULLSCALE;
}
function pivotX() { return cw / 2; }
function pivotY() { return ch * 0.16; }

function toSX(x) { return pivotX() + x * sceneScale(); }
function toSY(y) { return pivotY() - y * sceneScale(); }  // y is negative down from pivot

function draw() {
  ctx.clearRect(0, 0, cw, ch);
  const dark = isDark();
  drawBackground(dark);
  const active = activeInstances();
  active.forEach(inst => drawTrail(inst));
  active.forEach(inst => drawPendulum(inst, dark));
  if (compareMode && active.length > 1) drawLegend(dark);
}

function drawBackground(dark) {
  // Ceiling bar
  const px = pivotX(), py = pivotY();
  ctx.strokeStyle = dark ? 'rgba(0,212,255,0.30)' : 'rgba(0,100,160,0.40)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(px - 40, py - 4); ctx.lineTo(px + 40, py - 4); ctx.stroke();
  // Hatch
  ctx.strokeStyle = dark ? 'rgba(0,212,255,0.10)' : 'rgba(0,100,160,0.13)';
  ctx.lineWidth = 1;
  for (let i = -4; i <= 4; i++) {
    const x = px + i * 12;
    ctx.beginPath(); ctx.moveTo(x, py - 4); ctx.lineTo(x - 9, py - 13); ctx.stroke();
  }
}

function drawTrail(inst) {
  if (inst.trail.length < 2) return;
  for (let i = 1; i < inst.trail.length; i++) {
    const pt = inst.trail[i];
    const alpha = (i / inst.trail.length) * 0.45;
    const r = 1 + (i / inst.trail.length) * 2;
    ctx.beginPath(); ctx.arc(toSX(pt.x), toSY(pt.y), r, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(inst.color, alpha); ctx.fill();
  }
}

function drawPendulum(inst, dark) {
  const px = pivotX(), py = pivotY();
  const bx = toSX(inst.bobX), by = toSY(inst.bobY);
  const BALL_R = Math.max(4, Math.min(10, Math.min(cw, ch) * 0.022));

  // Rod
  if (inst.type === 'physical') {
    // Draw as a thick rod
    const sc = sceneScale();
    const rodLen = inst.length * sc;
    const angle  = inst.state.theta;  // from vertical
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-angle);  // canvas +y points down; negate so positive θ tilts rod right
    const rodW = 6;
    const grad = ctx.createLinearGradient(-rodW/2, 0, rodW/2, 0);
    grad.addColorStop(0, hexToRgba(inst.color, 0.25));
    grad.addColorStop(0.5, hexToRgba(inst.color, 0.55));
    grad.addColorStop(1, hexToRgba(inst.color, 0.25));
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.rect(-rodW/2, 0, rodW, rodLen); ctx.fill();
    ctx.strokeStyle = hexToRgba(inst.color, 0.6); ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  } else {
    // String
    ctx.strokeStyle = dark ? 'rgba(221,238,255,0.50)' : 'rgba(13,26,38,0.50)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(bx, by); ctx.stroke();
  }

  // Pivot dot
  ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2);
  ctx.fillStyle = dark ? 'rgba(0,212,255,0.70)' : 'rgba(0,100,160,0.70)'; ctx.fill();

  // Bob glow
  const glow = ctx.createRadialGradient(bx, by, 0, bx, by, BALL_R * 3);
  glow.addColorStop(0, hexToRgba(inst.color, 0.18));
  glow.addColorStop(1, hexToRgba(inst.color, 0));
  ctx.beginPath(); ctx.arc(bx, by, BALL_R * 3, 0, Math.PI * 2);
  ctx.fillStyle = glow; ctx.fill();

  // Bob
  const grad = ctx.createRadialGradient(bx - 3, by - 3, 0, bx, by, BALL_R);
  grad.addColorStop(0, lighten(inst.color, 0.6));
  grad.addColorStop(0.4, inst.color);
  grad.addColorStop(1, darken(inst.color, 0.5));
  ctx.beginPath(); ctx.arc(bx, by, BALL_R, 0, Math.PI * 2);
  ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath(); ctx.arc(bx - 3, by - 3, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();

  // Velocity arrow
  const v = inst.bobV;
  if (v > 0.01) {
    const refV = Math.max(...activeInstances().map(i => i.tipVMax), 0.01);
    const maxLen = Math.min(64, Math.min(cw, ch) * 0.14);
    const len    = (v / refV) * maxLen;
    const angle  = Math.atan2(-inst.bobVy, inst.bobVx);
    const arrowColor = dark ? 'rgba(255,180,0,0.85)' : 'rgba(180,120,0,0.85)';
    const sx = bx + Math.cos(angle) * (BALL_R + 2);
    const sy = by + Math.sin(angle) * (BALL_R + 2);
    const tx = bx + Math.cos(angle) * (len + BALL_R + 2);
    const ty = by + Math.sin(angle) * (len + BALL_R + 2);
    const headLen = Math.min(8, len * 0.4);
    const ha = Math.PI / 6;
    ctx.strokeStyle = arrowColor; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx, sy);
    ctx.lineTo(tx - Math.cos(angle)*headLen, ty - Math.sin(angle)*headLen); ctx.stroke();
    ctx.fillStyle = arrowColor;
    ctx.beginPath(); ctx.moveTo(tx, ty);
    ctx.lineTo(tx - Math.cos(angle-ha)*headLen, ty - Math.sin(angle-ha)*headLen);
    ctx.lineTo(tx - Math.cos(angle+ha)*headLen, ty - Math.sin(angle+ha)*headLen);
    ctx.closePath(); ctx.fill();
  }

  // Angle arc: from downward vertical (π/2 in canvas) to current bob position
  const curTheta = inst.state.theta;
  if (Math.abs(inst.angle0) > 1) {
    const arcR = Math.min(40, inst.length * sceneScale() * 0.3);
    ctx.strokeStyle = hexToRgba(inst.color, 0.30); ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    // canvas angle of rod = π/2 - theta (since positive theta tilts right = smaller canvas angle)
    ctx.arc(px, py, arcR, Math.PI / 2, Math.PI / 2 - curTheta, curTheta > 0);
    ctx.stroke(); ctx.setLineDash([]);
  }
}

function drawLegend(dark) {
  const pad = 10, lineH = 18;
  const boxW = 150, boxH = pad + instances.length * lineH + 4;
  const bx = cw - boxW - 14, by = pivotY() + 10;
  ctx.fillStyle = dark ? 'rgba(6,10,16,0.80)' : 'rgba(240,242,245,0.85)';
  ctx.strokeStyle = dark ? 'rgba(0,212,255,0.12)' : 'rgba(0,100,160,0.15)';
  ctx.lineWidth = 1;
  roundRect(ctx, bx, by, boxW, boxH, 6); ctx.fill(); ctx.stroke();
  instances.forEach((inst, i) => {
    const y = by + pad + i * lineH;
    ctx.beginPath(); ctx.arc(bx + 12, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = inst.color; ctx.fill();
    ctx.font = '600 10px "DM Sans",sans-serif';
    ctx.fillStyle = dark ? 'rgba(221,238,255,0.85)' : 'rgba(13,26,38,0.85)';
    ctx.textAlign = 'left';
    const pLabel = inst.type === 'physical' ? 'Fisico' : 'Math';
    ctx.fillText(`${Lab.fmt(inst.length,1)}m · ${inst.angle0}° · ${pLabel}`, bx + 22, y + 4);
  });
}

/* ── Graph drawing ────────────────────────────────────────────── */
const V_OPTIONS = [
  { key: 'v',  label: '|v|', getter: d => d.v  },
  { key: 'vx', label: 'vx',  getter: d => d.vx },
  { key: 'vy', label: 'vy',  getter: d => d.vy },
];
let selectedV  = 'v';
let vBtnAreas  = [];

function drawGraphs() {
  if (!gw || !gh) return;
  gctx.clearRect(0, 0, gw, gh);
  const dark   = isDark();
  const toShow = activeInstances();
  const W      = Math.floor(gw / 3);
  const PAD    = { t: 18, b: 30, l: 46, r: 10 };
  const gr     = graphRanges;

  const opt     = V_OPTIONS.find(o => o.key === selectedV);
  const vYRange = selectedV === 'v'  ? gr?.vRange  :
                  selectedV === 'vx' ? gr?.vxRange : gr?.vyRange;
  const vLabel  = selectedV === 'v'  ? 'v (m/s)'  :
                  selectedV === 'vx' ? 'vx (m/s)' : 'vy (m/s)';

  drawSingleGraph(0,   0, W,      gh, PAD, d => d.x, 'x (m)',  dark, toShow, gr?.xRange, gr?.tMax);
  drawSingleGraph(W,   0, W,      gh, PAD, d => d.y, 'y (m)',  dark, toShow, gr?.yRange, gr?.tMax);
  drawSingleGraph(W*2, 0, gw-W*2, gh, PAD, opt.getter, vLabel, dark, toShow, vYRange,    gr?.tMax);

  const sep = dark ? 'rgba(0,212,255,0.08)' : 'rgba(0,100,160,0.10)';
  gctx.strokeStyle = sep; gctx.lineWidth = 1;
  [W, W*2].forEach(x => {
    gctx.beginPath(); gctx.moveTo(x, 0); gctx.lineTo(x, gh); gctx.stroke();
  });

  drawVSelector(W * 2, PAD, dark);
}

function drawVSelector(panelX, PAD, dark) {
  const btnW = 24, btnH = 15, gap = 3;
  const startX = panelX + PAD.l + 4;
  const startY = 2;
  vBtnAreas = [];

  V_OPTIONS.forEach((opt, i) => {
    const x = startX + i * (btnW + gap);
    const y = startY;
    const sel = opt.key === selectedV;

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

    vBtnAreas.push({ key: opt.key, x, y, w: btnW, h: btnH });
  });
}

graphCanvas.addEventListener('click', e => {
  const rect = graphCanvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (gw / rect.width);
  const my = (e.clientY - rect.top)  * (gh / rect.height);
  for (const btn of vBtnAreas) {
    if (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h) {
      selectedV = btn.key;
      drawGraphs();
      break;
    }
  }
});

function drawSingleGraph(ox, oy, gW, gH, PAD, getValue, label, dark, toShow, yFixed, tFixed) {
  const pl = PAD.l, pr = PAD.r, pt = PAD.t, pb = PAD.b;
  const iW = gW - pl - pr, iH = gH - pt - pb;
  if (iW <= 0 || iH <= 0) return;

  let tRange, yMin, yMax;
  if (yFixed != null && tFixed != null) {
    yMin = yFixed[0]; yMax = yFixed[1]; tRange = tFixed;
  } else {
    let tMax = 0; yMin = Infinity; yMax = -Infinity;
    let hasData = false;
    toShow.forEach(inst => inst.history.forEach(d => {
      const v = getValue(d);
      tMax = Math.max(tMax, d.t); yMin = Math.min(yMin, v); yMax = Math.max(yMax, v);
      hasData = true;
    }));
    if (!hasData) { tMax = 5; yMin = -1; yMax = 1; }
    const yr = yMax - yMin || 1;
    yMin -= yr * 0.08; yMax += yr * 0.08;
    tRange = Math.max(tMax * 1.05, 0.5);
  }

  // Sliding time window: once tCurrent exceeds tRange, scroll right
  const tCurrent = toShow[0]?.state.t ?? 0;
  const tEnd     = Math.max(tCurrent, tRange);
  const tStart   = tEnd - tRange;

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

  // Clip drawing to the inner plot area
  gctx.save();
  gctx.rect(ox + pl, oy + pt, iW, iH);
  gctx.clip();

  toShow.forEach(inst => {
    const data = inst.history.filter(d => d.t >= tStart);
    if (data.length < 2) return;
    gctx.strokeStyle = inst.color; gctx.lineWidth = 1.5; gctx.lineJoin = 'round';
    gctx.beginPath();
    data.forEach((d, i) => {
      const x = toX(d.t), y = toY(getValue(d));
      i === 0 ? gctx.moveTo(x, y) : gctx.lineTo(x, y);
    });
    gctx.stroke();
    const last = data[data.length - 1];
    gctx.beginPath(); gctx.arc(toX(last.t), toY(getValue(last)), 2.5, 0, Math.PI * 2);
    gctx.fillStyle = inst.color; gctx.fill();
  });

  // Time cursor — always at right edge when scrolling
  if (tCurrent > 0) {
    const tx = toX(tCurrent);
    gctx.strokeStyle = dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
    gctx.lineWidth = 1; gctx.setLineDash([2, 2]);
    gctx.beginPath(); gctx.moveTo(tx, oy + pt); gctx.lineTo(tx, oy + pt + iH); gctx.stroke();
    gctx.setLineDash([]);
  }

  gctx.restore();
}

/* ── Readout ──────────────────────────────────────────────────── */
const readout = new Lab.Readout(document.getElementById('readout'), [
  { key: 't',     label: 'tempo t'      },
  { key: 'theta', label: 'angolo θ'      },
  { key: 'omega', label: 'velocità angolare ω'      },
  { key: 'x',     label: 'posizione x'      },
  { key: 'y',     label: 'quota y'      },
  { key: 'v',     label: 'velocità |v|'    },
]);

function updateReadout() {
  const inst = instances[0];
  const s = inst.state;
  readout.set('t',     Lab.fmt(s.t,2)  + ' s');
  readout.set('theta', Lab.fmt((s.theta * 180 / Math.PI),1) + '°');
  readout.set('omega', Lab.fmt(s.omega,2) + ' rad/s');
  readout.set('x',     Lab.fmt(inst.bobX,3) + ' m');
  readout.set('y',     Lab.fmt(inst.bobY,3) + ' m');
  readout.set('v',     Lab.fmt(inst.bobV,3) + ' m/s');
}

/* ── Controls ─────────────────────────────────────────────────── */
let compareListEl  = null;
let btnAddScenario = null;
let subDampEl      = null;

function buildControls() {
  const container = document.getElementById('controls');

  // — Condizioni iniziali
  const secInit = Lab.Section('Condizioni iniziali');
  const sliderAngle = Lab.SliderInput({
    label: 'Angolo iniziale', min: 1, max: 175, value: instances[0].angle0, step: 1, unit: '°',
    onChange(v) { instances[0].angle0 = v; resetSim(); },
  });
  const sliderLen = Lab.SliderInput({
    label: 'Lunghezza', min: 0.1, max: 5.0, value: instances[0].length, step: 0.1, unit: 'm',
    onChange(v) { instances[0].length = v; resetSim(); },
  });
  const sliderMass = Lab.SliderInput({
    label: 'Massa', min: 0.1, max: 10, value: instances[0].mass, step: 0.1, unit: 'kg',
    onChange(v) { instances[0].mass = v; resetSim(); },
  });
  secInit.add(sliderAngle).add(sliderLen).add(sliderMass);
  container.appendChild(secInit.el);

  // — Tipo di pendolo
  const secType = Lab.Section('Tipo di pendolo');
  const radioType = Lab.RadioGroup({
    label: 'Modello',
    options: [
      { value: 'math',     label: 'Matematico',  hint: 'Massa puntiforme' },
      { value: 'physical', label: 'Fisico',       hint: 'Asta uniforme'    },
    ],
    value: instances[0].type,
    onChange(val) { instances[0].type = val; resetSim(); },
  });
  secType.add(radioType);
  container.appendChild(secType.el);

  // — Smorzamento
  const secDamp = Lab.Section('Smorzamento');
  const toggleDamp = Lab.Toggle({
    label: 'Smorzamento viscoso', value: params.damping,
    onChange(v) {
      params.damping = v;
      subDampEl.style.display = v ? '' : 'none';
      resetSim();
    },
  });
  const subDamp = Lab.SubPanel();
  subDampEl = subDamp.el;
  subDampEl.style.display = 'none';
  const sliderB = Lab.SliderInput({
    label: 'Coefficiente b', min: 0.01, max: 1.0, value: params.b, step: 0.01, unit: '',
    hint: 'θ\'\' += −b·ω',
    onChange(v) { params.b = v; if (params.damping) resetSim(); },
  });
  subDamp.add(sliderB);
  secDamp.add(toggleDamp).add(subDamp);
  container.appendChild(secDamp.el);

  // — Corpo celeste
  const secBody = Lab.Section('Corpo celeste');
  const radioG = Lab.RadioGroup({
    label: 'Gravità', options: PLANETS, value: 'terra',
    onChange(val, opt) {
      instances[0].g = opt.g;
      resetSim();
    },
  });
  secBody.add(radioG);
  container.appendChild(secBody.el);

  // — Confronto
  const compareSec = Lab.Section('Confronto');
  const toggleCompare = Lab.Toggle({
    label: 'Modalità confronto', value: false,
    onChange(v) {
      compareMode = v;
      compareContainer.style.display = v ? '' : 'none';
      if (v && instances.length === 1) {
        addCompareInstance(instances[0].g, instances[0].length * 0.6, instances[0].mass, instances[0].angle0 * 0.7, instances[0].type);
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
  btnAddScenario.textContent = '+ Aggiungi pendolo';
  btnAddScenario.addEventListener('click', () => {
    if (instances.length >= 4) return;
    const ref = instances[0];
    addCompareInstance(ref.g, ref.length * (0.5 + Math.random() * 0.5), ref.mass, ref.angle0 * (0.5 + Math.random()), ref.type);
    rebuildCompareList(); resetSim();
  });

  compareContainer.append(compareListEl, btnAddScenario);
  compareSec.add(toggleCompare);
  compareSec.el.appendChild(compareContainer);
  container.appendChild(compareSec.el);
}

function addCompareInstance(g, length, mass, angle0, type) {
  const idx = instances.length;
  instances.push(new SimInstance(
    idx, COLORS[idx % COLORS.length], g,
    +length.toFixed(1), +mass.toFixed(1),
    Math.max(1, Math.min(175, Math.round(angle0))),
    type,
  ));
}

function rebuildCompareList() {
  if (!compareListEl) return;
  compareListEl.innerHTML = '';

  // Primary row
  const primary = instances[0];
  const pRow = document.createElement('div'); pRow.className = 'compare-scenario';
  const pDot = document.createElement('span'); pDot.className = 'compare-dot';
  pDot.style.cssText = `background:${primary.color};box-shadow:0 0 6px ${primary.color}`;
  const pLabel = document.createElement('span');
  pLabel.style.cssText = 'flex:1;font-size:11px;font-weight:600;color:var(--text-secondary)';
  pLabel.textContent = `${Lab.fmt(primary.length,1)}m · ${primary.angle0}° · ${primary.type === 'physical' ? 'Fisico' : 'Math'}`;
  const pBadge = document.createElement('span');
  pBadge.style.cssText = 'font-size:9px;font-weight:700;font-family:"Space Mono",monospace;color:var(--text-hint);letter-spacing:0.5px';
  pBadge.textContent = 'PRINCIPALE';
  pRow.append(pDot, pLabel, pBadge);
  compareListEl.appendChild(pRow);

  instances.slice(1).forEach((inst, ri) => {
    const i    = ri + 1;
    const card = document.createElement('div');
    card.style.cssText = 'padding:7px 10px;border-radius:8px;border:1px solid var(--border-idle);background:var(--bg3);display:flex;flex-direction:column;gap:6px;';

    // Row 1: dot + planet select + type select + remove
    const row1 = document.createElement('div');
    row1.style.cssText = 'display:flex;align-items:center;gap:6px;';

    const dot = document.createElement('span'); dot.className = 'compare-dot';
    dot.style.cssText = `background:${inst.color};box-shadow:0 0 6px ${inst.color};flex-shrink:0`;

    const selPlanet = document.createElement('select'); selPlanet.className = 'ctrl-select';
    PLANETS.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.value; opt.textContent = p.label;
      if (Math.abs(p.g - inst.g) < 0.01) opt.selected = true;
      selPlanet.appendChild(opt);
    });
    selPlanet.addEventListener('change', () => {
      inst.g = PLANETS.find(p => p.value === selPlanet.value).g;
      resetSim();
    });

    const selType = document.createElement('select'); selType.className = 'ctrl-select';
    [{ value: 'math', label: 'Math' }, { value: 'physical', label: 'Fisico' }].forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.value; opt.textContent = t.label;
      if (t.value === inst.type) opt.selected = true;
      selType.appendChild(opt);
    });
    selType.addEventListener('change', () => { inst.type = selType.value; resetSim(); });

    const rm = document.createElement('button'); rm.className = 'btn-remove-scenario'; rm.textContent = '×';
    rm.addEventListener('click', () => {
      instances.splice(i, 1);
      instances.forEach((x, j) => { x.id = j; x.color = COLORS[j % COLORS.length]; });
      rebuildCompareList(); resetSim();
    });
    row1.append(dot, selPlanet, selType, rm);

    // Row 2: L, m, θ inputs
    const row2 = document.createElement('div');
    row2.style.cssText = 'display:flex;align-items:center;gap:6px;padding-left:15px;flex-wrap:wrap;';

    function makeParamInput(labelTxt, unit, value, min, max, step, onchange) {
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

    row2.appendChild(makeParamInput('L', 'm',  inst.length, 0.1, 5.0, 0.1, v => { inst.length = v; }));
    row2.appendChild(makeParamInput('m', 'kg', inst.mass,   0.1, 10,  0.1, v => { inst.mass   = v; }));
    row2.appendChild(makeParamInput('θ', '°',  inst.angle0, 1,   175, 1,   v => { inst.angle0 = v; }));

    card.append(row1, row2);
    compareListEl.appendChild(card);
  });

  if (btnAddScenario) btnAddScenario.disabled = instances.length >= 4;
}

/* ── Buttons ──────────────────────────────────────────────────── */
const btnPlay  = document.getElementById('btnPlay');
const btnReset = document.getElementById('btnReset');
btnPlay.addEventListener('click',  () => simRunning ? pauseSim() : startSim());
btnReset.addEventListener('click', resetSim);

/* ── Utilities ────────────────────────────────────────────────── */
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

new MutationObserver(() => { draw(); drawGraphs(); }).observe(
  document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }
);
