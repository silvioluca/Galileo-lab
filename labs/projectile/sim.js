/* ── Projectile Motion Simulation ─────────────────────────── */

const PLANETS = [
  { value: 'luna',  label: 'Luna',  hint: '1,62 m/s²', g: 1.62  },
  { value: 'marte', label: 'Marte', hint: '3,72 m/s²', g: 3.72  },
  { value: 'terra', label: 'Terra', hint: '9,81 m/s²', g: 9.81  },
  { value: 'giove', label: 'Giove', hint: '24,79 m/s²', g: 24.79 },
];

const COLORS     = ['#00d4ff', '#ff4757', '#2ecc71', '#ffb400'];
const PHYSICS_DT = 1 / 120;
const HIST_STEP  = 3;
const RHO_AIR    = 1.225;   // kg/m³
const BALL_R_M   = 0.1;     // m  (default ball radius for drag cross-section)

const params = { airResistance: false, Cd: 0.47, mass: 1.0 };

/* ── SimInstance ──────────────────────────────────────────── */
class SimInstance {
  constructor(id, color, g, v0 = 30, angle = 45) {
    this.id    = id;
    this.color = color;
    this.g     = g;
    this.v0    = v0;
    this.angle = angle;
    this._stepCount = 0;
    this.reset();
  }

  get vx0()        { return this.v0 * Math.cos(this.angle * Math.PI / 180); }
  get vy0()        { return this.v0 * Math.sin(this.angle * Math.PI / 180); }
  // No-drag analytical values (used for scale pre-computation)
  get flightTime() { return this.vy0 > 0 ? 2 * this.vy0 / this.g : 0.01; }
  get range()      { return this.vx0 * this.flightTime; }
  get maxHeight()  { return (this.vy0 * this.vy0) / (2 * this.g); }
  get terminalV()  {
    if (!params.airResistance) return Infinity;
    const A = Math.PI * BALL_R_M * BALL_R_M;
    return Math.sqrt(2 * params.mass * this.g / (RHO_AIR * params.Cd * A));
  }

  reset() {
    this.state = { t: 0, x: 0, y: 0, vx: this.vx0, vy: this.vy0, done: false };
    this.trail   = [];
    this.history = [];
    this._stepCount = 0;
  }

  step(dt) {
    if (this.state.done) return;
    let ax = 0, ay = -this.g;
    if (params.airResistance) {
      const vMag = Math.hypot(this.state.vx, this.state.vy);
      if (vMag > 1e-6) {
        const A = Math.PI * BALL_R_M * BALL_R_M;
        const k = 0.5 * RHO_AIR * params.Cd * A / params.mass;
        ax += -k * vMag * this.state.vx;
        ay += -k * vMag * this.state.vy;
      }
    }
    // passo esatto per accelerazione costante nell'intervallo: x += v·dt + ½·a·dt²
    const y0 = this.state.y, t0 = this.state.t;
    this.state.x  += this.state.vx * dt + 0.5 * ax * dt * dt;
    this.state.y  += this.state.vy * dt + 0.5 * ay * dt * dt;
    this.state.vx += ax * dt;
    this.state.vy += ay * dt;
    this.state.t  += dt;

    this.trail.push({ x: this.state.x, y: this.state.y });
    if (this.trail.length > 600) this.trail.shift();

    this._stepCount++;
    if (this._stepCount % HIST_STEP === 0) {
      const v = Math.hypot(this.state.vx, this.state.vy);
      this.history.push({ t: this.state.t, x: this.state.x, y: this.state.y,
                          vx: this.state.vx, vy: this.state.vy, v });
    }

    if (this.state.y <= 0 && this.state.t > 0.05) {
      // punto d'atterraggio interpolato dentro il passo: la gittata coincide con quella teorica
      const f = y0 / (y0 - this.state.y);
      this.state.x -= this.state.vx * dt * (1 - f);
      this.state.t  = t0 + f * dt;
      this.state.y = 0; this.state.done = true;
      const last = this.trail[this.trail.length - 1];
      if (last) { last.x = this.state.x; last.y = 0; }
    }
  }
}

/* ── Simulation state ─────────────────────────────────────── */
let instances      = [new SimInstance(0, COLORS[0], 9.81, 30, 45)];
let compareMode    = false;
let simRunning     = false;
let rafId          = null;
let lastTs         = null;
let physAcc        = 0;
let showTrajectory = false;

let viewMaxX    = 100;
let viewMaxY    = 50;
let graphRanges = null;

function activeInstances() { return compareMode ? instances : [instances[0]]; }
function allDone()         { return activeInstances().every(i => i.state.done); }

function computeView() {
  const insts = activeInstances();
  viewMaxX = Math.max(...insts.map(i => i.range),   1) * 1.14;
  viewMaxY = Math.max(...insts.map(i => i.maxHeight), 1) * 1.20;
}

function computeGraphRanges() {
  const insts = activeInstances();
  const pad   = 0.07;
  let tMax = 0, xMax = 0, yMax = 0, vMax = 0, vxMin = Infinity, vyMax = 0;

  insts.forEach(inst => {
    tMax  = Math.max(tMax,  inst.flightTime);
    xMax  = Math.max(xMax,  inst.range);
    yMax  = Math.max(yMax,  inst.maxHeight);
    vMax  = Math.max(vMax,  inst.v0);
    vxMin = Math.min(vxMin, inst.vx0);
    vyMax = Math.max(vyMax, inst.vy0);
  });
  xMax = Math.max(xMax, 0.1); yMax = Math.max(yMax, 0.1);
  vxMin = Math.max(vxMin, 0); vyMax = Math.max(vyMax, 0.1);

  if (params.airResistance) tMax *= 1.5; // drag slows descent → longer flight

  graphRanges = {
    tMax:    Math.max(tMax * (1 + pad), 0.5),
    yRange:  [-yMax * pad,      yMax  * (1 + pad)],
    xRange:  [-xMax * pad,      xMax  * (1 + pad)],
    vRange:  [vxMin * (1-pad),  vMax  * (1 + pad)],
    vxRange: [0,                vMax  * (1 + pad)],
    vyRange: [-vyMax*(1+pad),   vyMax * (1 + pad)],
  };
}

/* ── Simulation control ───────────────────────────────────── */
function startSim() {
  if (simRunning || allDone()) return;
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
  computeView();
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
    btnPlay.textContent = anyStarted && !allDone() ? '▶  RIPRENDI' : '▶  AVVIA';
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
  if (allDone()) { simRunning = false; updatePlayBtn(); return; }
  rafId = requestAnimationFrame(loop);
}

/* ── Canvas setup ─────────────────────────────────────────── */
const canvas    = document.getElementById('simCanvas');
const ctx       = canvas.getContext('2d');
let dpr = 1, cw = 0, ch = 0;

const graphArea   = document.getElementById('graphArea');
const graphCanvas = document.getElementById('graphCanvas');
const gctx        = graphCanvas.getContext('2d');
let gw = 0, gh = 0;

const PL = 52, PR = 16, PT = 18, PB = 34;

function toSX(x) { return PL + (x / viewMaxX) * (cw - PL - PR); }
function toSY(y) { return ch - PB - (y / viewMaxY) * (ch - PB - PT); }
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

/* ── Drawing: simulation canvas ───────────────────────────── */
function ballPx() { return Math.max(4, Math.min(9, Math.min(cw, ch) * 0.018)); }

function draw() {
  ctx.clearRect(0, 0, cw, ch);
  const dark   = isDark();
  const active = activeInstances();
  drawGrid(dark);
  drawScaleAxes(dark);
  drawGround(dark);
  if (showTrajectory) drawTheoreticalArcs(dark);
  active.forEach((inst, i) => drawTrail(inst, i));
  active.forEach((inst, i) => drawRangeMarker(inst, i, dark));
  active.forEach((inst, i) => {
    drawBall(inst, i);
    if (Math.hypot(inst.state.vx, inst.state.vy) > 0.05) drawVelocityArrow(inst, i, dark);
  });
  if (compareMode && active.length > 1) drawLegend(dark);
}

function niceStep(range, n) {
  const raw = range / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  return (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag;
}

function drawGrid(dark) {
  const sx = niceStep(viewMaxX, 5), sy = niceStep(viewMaxY, 4);
  ctx.strokeStyle = dark ? 'rgba(0,212,255,0.04)' : 'rgba(0,100,160,0.06)';
  ctx.lineWidth = 1;
  for (let x = sx; x < viewMaxX + sx; x += sx) {
    const cx = toSX(x); if (cx > cw - PR) break;
    ctx.beginPath(); ctx.moveTo(cx, PT); ctx.lineTo(cx, ch - PB); ctx.stroke();
  }
  for (let y = sy; y < viewMaxY + sy; y += sy) {
    const cy = toSY(y); if (cy < PT) break;
    ctx.beginPath(); ctx.moveTo(PL, cy); ctx.lineTo(cw - PR, cy); ctx.stroke();
  }
}

function drawScaleAxes(dark) {
  const axClr  = dark ? 'rgba(0,212,255,0.30)' : 'rgba(0,100,160,0.40)';
  const lblClr = dark ? 'rgba(0,212,255,0.50)' : 'rgba(0,100,160,0.60)';
  const sx = niceStep(viewMaxX, 5), sy = niceStep(viewMaxY, 4);

  ctx.strokeStyle = axClr; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PL, PT - 4); ctx.lineTo(PL, ch - PB + 4); ctx.stroke();

  ctx.font = '700 9px "Space Mono",monospace'; ctx.fillStyle = lblClr;

  ctx.textAlign = 'right';
  for (let y = 0; y <= viewMaxY + sy * 0.01; y += sy) {
    const cy = toSY(y); if (cy < PT - 4 || cy > ch - PB + 4) continue;
    ctx.strokeStyle = axClr;
    ctx.beginPath(); ctx.moveTo(PL - 3, cy); ctx.lineTo(PL + 2, cy); ctx.stroke();
    ctx.fillStyle = lblClr;
    ctx.fillText(fmtNum(y) + ' m', PL - 6, cy + 3.5);
  }

  ctx.textAlign = 'center';
  for (let x = sx; x <= viewMaxX + sx * 0.01; x += sx) {
    const cx = toSX(x); if (cx > cw - PR + 4) break;
    ctx.strokeStyle = axClr;
    ctx.beginPath(); ctx.moveTo(cx, ch - PB); ctx.lineTo(cx, ch - PB + 3); ctx.stroke();
    ctx.fillStyle = lblClr;
    ctx.fillText(fmtNum(x) + ' m', cx, ch - PB + 15);
  }

  // Axis labels
  ctx.save();
  ctx.translate(10, PT + (ch - PT - PB) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillStyle = lblClr;
  ctx.fillText('y (m)', 0, 0);
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.fillStyle = lblClr;
  ctx.fillText('x (m)', PL + (cw - PL - PR) / 2, ch - 4);
}

function drawGround(dark) {
  const gy = ch - PB;
  ctx.strokeStyle = dark ? 'rgba(0,212,255,0.45)' : 'rgba(0,100,160,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(PL, gy); ctx.lineTo(cw - PR, gy); ctx.stroke();
  ctx.strokeStyle = dark ? 'rgba(0,212,255,0.12)' : 'rgba(0,100,160,0.16)';
  ctx.lineWidth = 1;
  for (let x = PL + 8; x < cw - PR + 10; x += 14) {
    ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x - 9, gy + 9); ctx.stroke();
  }
}

function drawTrail(inst, idx) {
  if (inst.trail.length < 2) return;
  for (let i = 1; i < inst.trail.length; i++) {
    const pt = inst.trail[i];
    const cx = toSX(pt.x), cy = toSY(pt.y);
    const alpha = (i / inst.trail.length) * 0.55;
    const r = 1 + (i / inst.trail.length) * 2.5;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(inst.color, alpha); ctx.fill();
  }
}

function drawBall(inst, idx) {
  const x = toSX(inst.state.x), y = toSY(inst.state.y);
  if (x < PL - ballPx() * 2 || x > cw + ballPx() * 2) return;
  if (y < PT - ballPx() * 2 || y > ch + ballPx() * 2) return;

  const glow = ctx.createRadialGradient(x, y, 0, x, y, ballPx() * 3.2);
  glow.addColorStop(0, hexToRgba(inst.color, 0.15));
  glow.addColorStop(1, hexToRgba(inst.color, 0));
  ctx.beginPath(); ctx.arc(x, y, ballPx() * 3.2, 0, Math.PI * 2);
  ctx.fillStyle = glow; ctx.fill();

  const grad = ctx.createRadialGradient(x - 3, y - 3, 0, x, y, ballPx());
  grad.addColorStop(0, lighten(inst.color, 0.6));
  grad.addColorStop(0.4, inst.color);
  grad.addColorStop(1, darken(inst.color, 0.5));
  ctx.beginPath(); ctx.arc(x, y, ballPx(), 0, Math.PI * 2);
  ctx.fillStyle = grad; ctx.fill();

  ctx.beginPath(); ctx.arc(x - 3, y - 3, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
}

function drawVelocityArrow(inst, idx, dark) {
  const ox = toSX(inst.state.x), oy = toSY(inst.state.y);
  const vMag = Math.hypot(inst.state.vx, inst.state.vy);
  const maxLen = Math.min(64, Math.min(cw, ch) * 0.14);
  const angle  = Math.atan2(-inst.state.vy, inst.state.vx);
  const refV0  = Math.max(...activeInstances().map(i => i.v0));
  const len    = (vMag / refV0) * maxLen;
  const arrowColor = dark ? 'rgba(255,180,0,0.85)' : 'rgba(180,120,0,0.85)';
  const shaftX = ox + Math.cos(angle) * (ballPx() + 2);
  const shaftY = oy + Math.sin(angle) * (ballPx() + 2);
  const tipX = ox + Math.cos(angle) * (len + ballPx() + 2);
  const tipY = oy + Math.sin(angle) * (len + ballPx() + 2);
  const headLen = Math.min(8, len * 0.4);

  ctx.strokeStyle = arrowColor; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(shaftX, shaftY);
  ctx.lineTo(tipX - Math.cos(angle) * headLen, tipY - Math.sin(angle) * headLen);
  ctx.stroke();

  const ha = Math.PI / 6;
  ctx.fillStyle = arrowColor;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - Math.cos(angle - ha) * headLen, tipY - Math.sin(angle - ha) * headLen);
  ctx.lineTo(tipX - Math.cos(angle + ha) * headLen, tipY - Math.sin(angle + ha) * headLen);
  ctx.closePath(); ctx.fill();
}

function drawTheoreticalArcs(dark) {
  const A_ball = Math.PI * BALL_R_M * BALL_R_M;
  activeInstances().forEach(inst => {
    let x = 0, y = 0, vx = inst.vx0, vy = inst.vy0;
    const estT = inst.flightTime * (params.airResistance ? 1.6 : 1);
    const dt   = Math.max(estT / 200, PHYSICS_DT);

    ctx.strokeStyle = hexToRgba(inst.color, 0.35);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(toSX(0), toSY(0));

    for (let s = 0; s < 3000; s++) {
      let ax = 0, ay = -inst.g;
      if (params.airResistance) {
        const vMag = Math.hypot(vx, vy);
        if (vMag > 1e-6) {
          const k = 0.5 * RHO_AIR * params.Cd * A_ball / params.mass;
          ax += -k * vMag * vx;
          ay += -k * vMag * vy;
        }
      }
      vx += ax * dt; vy += ay * dt;
      x  += vx * dt; y  += vy * dt;
      ctx.lineTo(toSX(x), toSY(Math.max(y, 0)));
      if (y <= 0) break;
    }
    ctx.stroke();
    ctx.setLineDash([]);
  });
}

function drawRangeMarker(inst, idx, dark) {
  if (inst.range <= 0) return;
  const rx = toSX(inst.range), gy = toSY(0);
  if (rx < PL || rx > cw - PR) return;

  ctx.strokeStyle = inst.color; ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(rx, PT + 4); ctx.lineTo(rx, gy); ctx.stroke();
  ctx.setLineDash([]);

  ctx.globalAlpha = 0.7;
  ctx.beginPath(); ctx.arc(rx, gy, 4, 0, Math.PI * 2);
  ctx.fillStyle = inst.color; ctx.fill();

  ctx.font = '700 8px "Space Mono",monospace';
  ctx.textAlign = 'center'; ctx.fillStyle = inst.color;
  const lbl = 'gittata ' + Lab.fmt(inst.range, inst.range >= 100 ? 0 : 1);
  ctx.fillText(lbl + ' m', rx, gy - 10);
  ctx.globalAlpha = 1;
}

function drawLegend(dark) {
  const pad = 10, lineH = 18;
  const boxW = 130, boxH = pad + instances.length * lineH + 4;
  const bx = cw - boxW - 14, by = PT + 6;
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
    const planet = PLANETS.find(p => p.g === inst.g) || { label: 'Custom' };
    ctx.fillText(planet.label, bx + 22, y + 4);
  });
}

/* ── Graph drawing ────────────────────────────────────────── */
const V_OPTIONS = [
  { key: 'v',  label: '|v|', getter: d => d.v  },
  { key: 'vx', label: 'vx',  getter: d => d.vx },
  { key: 'vy', label: 'vy',  getter: d => d.vy },
];
let selectedV = 'v';
let vBtnAreas = [];

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

  drawSingleGraph(0,   0, W,      gh, PAD, d => d.y,      'y (m)',  dark, toShow, gr?.yRange, gr?.tMax);
  drawSingleGraph(W,   0, W,      gh, PAD, d => d.x,      'x (m)',  dark, toShow, gr?.xRange, gr?.tMax);
  drawSingleGraph(W*2, 0, gw-W*2, gh, PAD, opt.getter,    vLabel,   dark, toShow, vYRange,    gr?.tMax);

  const sep = dark ? 'rgba(0,212,255,0.08)' : 'rgba(0,100,160,0.10)';
  gctx.strokeStyle = sep; gctx.lineWidth = 1;
  [W, W * 2].forEach(x => {
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
    gctx.beginPath();
    gctx.rect(x, y, btnW, btnH);
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
      computeGraphRanges();
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
    let tMax = 0, hasData = false;
    yMin = Infinity; yMax = -Infinity;
    toShow.forEach(inst => inst.history.forEach(d => {
      const v = getValue(d);
      tMax = Math.max(tMax, d.t); yMin = Math.min(yMin, v); yMax = Math.max(yMax, v);
      hasData = true;
    }));
    if (!hasData) { tMax = 5; yMin = -10; yMax = 10; }
    const yr = yMax - yMin || 1;
    yMin -= yr * 0.08; yMax += yr * 0.08;
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

  yTicks.forEach(tv => {
    if (tv < yMin - 1e-9 || tv > yMax + 1e-9) return;
    const gy = toY(tv);
    const isZero = Math.abs(tv) < 1e-9;
    gctx.strokeStyle = isZero ? axisClr : gridClr;
    gctx.lineWidth   = isZero ? 1.5 : 1;
    gctx.beginPath(); gctx.moveTo(ox + pl, gy); gctx.lineTo(ox + pl + iW, gy); gctx.stroke();
  });

  tTicks.forEach(tv => {
    if (tv < -1e-9 || tv > tRange + 1e-9) return;
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

  gctx.save();
  gctx.translate(ox + 9, oy + pt + iH / 2);
  gctx.rotate(-Math.PI / 2);
  gctx.textAlign = 'center'; gctx.fillStyle = lblClr;
  gctx.font = '700 9px "Space Mono",monospace';
  gctx.fillText(label, 0, 0);
  gctx.restore();

  toShow.forEach(inst => {
    if (inst.history.length < 2) return;
    gctx.strokeStyle = inst.color; gctx.lineWidth = 1.5; gctx.lineJoin = 'round';
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

  const t = toShow[0]?.state.t ?? 0;
  if (t > 0) {
    const tx = toX(t);
    gctx.strokeStyle = dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
    gctx.lineWidth = 1; gctx.setLineDash([2, 2]);
    gctx.beginPath(); gctx.moveTo(tx, oy + pt); gctx.lineTo(tx, oy + pt + iH); gctx.stroke();
    gctx.setLineDash([]);
  }
}

/* ── Readout ──────────────────────────────────────────────── */
const readout = new Lab.Readout(document.getElementById('readout'), [
  { key: 't',  label: 'tempo t'   },
  { key: 'x',  label: 'distanza x'   },
  { key: 'y',  label: 'altezza y'   },
  { key: 'v',  label: 'velocità |v|' },
  { key: 'vx', label: 'v_x'  },
  { key: 'vy', label: 'v_y'  },
]);

function updateReadout() {
  const s = instances[0].state;
  const v = Math.hypot(s.vx, s.vy);
  readout.set('t',  Lab.fmt(s.t,2)  + ' s');
  readout.set('x',  Lab.fmt(s.x,1)  + ' m');
  readout.set('y',  Lab.fmt(s.y,1)  + ' m');
  readout.set('v',  Lab.fmt(v,1)    + ' m/s');
  readout.set('vx', Lab.fmt(s.vx,1) + ' m/s');
  readout.set('vy', (s.vy >= 0 ? '+' : '') + Lab.fmt(s.vy,1) + ' m/s');
}

/* ── Controls ─────────────────────────────────────────────── */
let compareListEl  = null;
let btnAddScenario = null;
let subAirEl       = null;

function buildControls() {
  const container = document.getElementById('controls');

  const secInit = Lab.Section('Condizioni iniziali');
  const sliderV0 = Lab.SliderInput({
    label: 'Velocità iniziale', min: 5, max: 100, value: instances[0].v0, step: 1, unit: 'm/s',
    onChange(v) { instances[0].v0 = v; resetSim(); },
  });
  const sliderAngle = Lab.SliderInput({
    label: 'Angolo di lancio', min: 1, max: 89, value: instances[0].angle, step: 1, unit: '°',
    onChange(v) { instances[0].angle = v; resetSim(); },
  });
  secInit.add(sliderV0).add(sliderAngle);
  container.appendChild(secInit.el);

  const secViz = Lab.Section('Visualizzazione');
  const toggleTraj = Lab.Toggle({
    label: 'Traiettoria teorica', value: showTrajectory,
    onChange(v) { showTrajectory = v; draw(); },
  });
  secViz.add(toggleTraj);
  container.appendChild(secViz.el);

  const secEnv = Lab.Section('Ambiente');
  const toggleAir = Lab.Toggle({
    label: 'Resistenza dell\'aria', value: params.airResistance,
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
    label: 'Coeff. drag (Cᴅ)', min: 0.1, max: 2.0, value: params.Cd, step: 0.01, unit: '',
    onChange(v) { params.Cd = v; if (params.airResistance) resetSim(); },
  });
  const sliderMass = Lab.SliderInput({
    label: 'Massa', min: 0.1, max: 10, value: params.mass, step: 0.1, unit: 'kg',
    onChange(v) { params.mass = v; if (params.airResistance) resetSim(); },
  });
  subAir.add(sliderCd).add(sliderMass);
  secEnv.add(toggleAir).add(subAir);
  container.appendChild(secEnv.el);

  const secBody = Lab.Section('Corpo celeste');
  const radioG = Lab.RadioGroup({
    label: 'Gravità', options: PLANETS, value: 'terra',
    onChange(val, opt) {
      instances[0].g = opt.g;
      if (compareMode) rebuildCompareList();
      resetSim();
    },
  });
  secBody.add(radioG);
  container.appendChild(secBody.el);

  const compareSec = Lab.Section('Confronto');
  const toggleCompare = Lab.Toggle({
    label: 'Modalità confronto', value: false,
    onChange(v) {
      compareMode = v;
      compareContainer.style.display = v ? '' : 'none';
      if (v && instances.length === 1) { addCompareInstance(1.62, instances[0].v0, instances[0].angle); rebuildCompareList(); }
      resetSim();
    },
  });

  const compareContainer = document.createElement('div');
  compareContainer.style.display = 'none';
  compareListEl = document.createElement('div');
  compareListEl.className = 'compare-list';

  btnAddScenario = document.createElement('button');
  btnAddScenario.className = 'btn-add-scenario';
  btnAddScenario.textContent = '+ Aggiungi pianeta';
  btnAddScenario.addEventListener('click', () => {
    if (instances.length >= 4) return;
    addCompareInstance(PLANETS[instances.length % PLANETS.length].g);
    rebuildCompareList(); resetSim();
  });

  compareContainer.append(compareListEl, btnAddScenario);
  compareSec.add(toggleCompare);
  compareSec.el.appendChild(compareContainer);
  container.appendChild(compareSec.el);
}

function addCompareInstance(g, v0, angle) {
  const idx    = instances.length;
  const planet = PLANETS.find(p => p.g === g) || PLANETS[2];
  instances.push(new SimInstance(
    idx, COLORS[idx % COLORS.length], planet.g,
    v0    ?? instances[0].v0,
    angle ?? instances[0].angle,
  ));
}

function rebuildCompareList() {
  if (!compareListEl) return;
  compareListEl.innerHTML = '';

  const primary  = instances[0];
  const pRow     = document.createElement('div');
  pRow.className = 'compare-scenario';
  const pDot = document.createElement('span'); pDot.className = 'compare-dot';
  pDot.style.cssText = `background:${primary.color};box-shadow:0 0 6px ${primary.color}`;
  const pLabel = document.createElement('span');
  pLabel.style.cssText = 'flex:1;font-size:11px;font-weight:600;color:var(--text-secondary)';
  const pPlanet = PLANETS.find(p => Math.abs(p.g - primary.g) < 0.01) || { label: 'Custom' };
  pLabel.textContent = pPlanet.label;
  const pBadge = document.createElement('span');
  pBadge.style.cssText = 'font-size:9px;font-weight:700;font-family:"Space Mono",monospace;color:var(--text-hint);letter-spacing:0.5px';
  pBadge.textContent = 'PRINCIPALE';
  pRow.append(pDot, pLabel, pBadge);
  compareListEl.appendChild(pRow);

  instances.slice(1).forEach((inst, ri) => {
    const i    = ri + 1;
    const card = document.createElement('div');
    card.style.cssText = 'padding:7px 10px;border-radius:8px;border:1px solid var(--border-idle);background:var(--bg3);display:flex;flex-direction:column;gap:6px;';

    // — Row 1: dot + planet select + remove
    const row1 = document.createElement('div');
    row1.style.cssText = 'display:flex;align-items:center;gap:7px;';

    const dot = document.createElement('span'); dot.className = 'compare-dot';
    dot.style.cssText = `background:${inst.color};box-shadow:0 0 6px ${inst.color};flex-shrink:0`;

    const sel = document.createElement('select'); sel.className = 'ctrl-select';
    PLANETS.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.value; opt.textContent = p.label;
      if (Math.abs(p.g - inst.g) < 0.01) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', () => { inst.g = PLANETS.find(p => p.value === sel.value).g; resetSim(); });

    const rm = document.createElement('button'); rm.className = 'btn-remove-scenario'; rm.textContent = '×';
    rm.addEventListener('click', () => {
      instances.splice(i, 1);
      instances.forEach((x, j) => { x.id = j; x.color = COLORS[j % COLORS.length]; });
      rebuildCompareList(); resetSim();
    });
    row1.append(dot, sel, rm);

    // — Row 2: v0 and angle inputs
    const row2 = document.createElement('div');
    row2.style.cssText = 'display:flex;align-items:center;gap:6px;padding-left:15px;';

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

    row2.appendChild(makeParamInput('v', 'm/s', inst.v0,    5, 100, 1, v => { inst.v0    = v; }));
    row2.appendChild(makeParamInput('θ', '°',   inst.angle, 1, 89,  1, v => { inst.angle = v; }));

    card.append(row1, row2);
    compareListEl.appendChild(card);
  });

  if (btnAddScenario) btnAddScenario.disabled = instances.length >= 4;
}

/* ── Buttons ──────────────────────────────────────────────── */
const btnPlay  = document.getElementById('btnPlay');
const btnReset = document.getElementById('btnReset');
btnPlay.addEventListener('click',  () => { if (allDone()) return; simRunning ? pauseSim() : startSim(); });
btnReset.addEventListener('click', resetSim);

/* ── Utilities ────────────────────────────────────────────── */
// etichette compatte con la virgola: 20 m, 2,5 m (senza zeri inutili)
function fmtNum(v) {
  const abs = Math.abs(v);
  const s = abs >= 100 ? v.toFixed(0) : abs >= 10 ? v.toFixed(1) : v.toFixed(2);
  return (s.includes('.') ? s.replace(/\.?0+$/, '') : s).replace('.', ',');
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

/* ── Resize-handle drag ────────────────────────────────────── */
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

/* ── Fullscreen ────────────────────────────────────────────── */
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

/* ── Init ─────────────────────────────────────────────────── */
Lab.initTheme();
buildControls();
rebuildCompareList();
computeView();
computeGraphRanges();
graphArea.style.height = (window.innerWidth < 800 ? 130 : 240) + 'px';
resizeAll();
updateReadout();
draw();
drawGraphs();

new MutationObserver(() => { draw(); drawGraphs(); }).observe(
  document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }
);
