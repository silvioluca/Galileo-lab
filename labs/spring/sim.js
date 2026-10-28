'use strict';

const G_SPRING = 9.81;
const PHYS_DT  = 1 / 240;
const HIST_SKIP = 4;

/* ── params ─────────────────────────────────────────────────────── */
const params = {
  k:          20,     // N/m
  L0:         1.0,    // m  natural length
  mass:       1.0,    // kg
  x0:         0.25,   // m  initial displacement from equilibrium (+ = down)
  damping:    false,  // enable viscous damping
  zeta:       0.10,   // damping ratio ζ (0=undamped, 1=critical)
  showForces: true,
  showEquil:  true,
};

/* ── simulation (SHM, RK4) ──────────────────────────────────────── */
class SpringSim {
  reset() {
    this._n   = 0;
    this.x    = params.x0;   // displacement from equilibrium
    this.v    = 0;
    this.t    = 0;
    this.hist = { t: [0], x: [params.x0], v: [0] };
  }

  get delta()  { return params.mass * G_SPRING / params.k; }  // equilibrium extension δ = mg/k
  get omega()  { return Math.sqrt(params.k / params.mass); }
  get period() { return 2 * Math.PI / this.omega; }

  accel(x, v = 0) {
    const a = -(params.k / params.mass) * x;
    if (!params.damping) return a;
    const b = 2 * params.zeta * Math.sqrt(params.k * params.mass);  // damping coeff
    return a - (b / params.mass) * v;
  }

  step(dt) {
    const { x, v } = this;
    const k1v = this.accel(x, v),                        k1x = v;
    const k2v = this.accel(x+k1x*dt/2, v+k1v*dt/2),     k2x = v+k1v*dt/2;
    const k3v = this.accel(x+k2x*dt/2, v+k2v*dt/2),     k3x = v+k2v*dt/2;
    const k4v = this.accel(x+k3x*dt,   v+k3v*dt),       k4x = v+k3v*dt;
    this.v += dt/6*(k1v+2*k2v+2*k3v+k4v);
    this.x += dt/6*(k1x+2*k2x+2*k3x+k4x);
    this.t += dt;
    if (++this._n % HIST_SKIP === 0) {
      this.hist.t.push(this.t);
      this.hist.x.push(this.x);
      this.hist.v.push(this.v);
    }
  }

  get forces() {
    const W   = params.mass * G_SPRING;
    const ext = this.delta + this.x;           // total extension from natural length
    const Fs  = params.k * ext;                // spring force (+ = upward on mass)
    const Fnet = -params.k * this.x;           // = W − Fs = −kx
    return { W, Fs, Fnet, ext };
  }
}

const sim = new SpringSim();
sim.reset();

/* ── animation state ─────────────────────────────────────────────── */
let running = false, rafId = null, lastTs = null, physAcc = 0;
let graphRanges = null;

/* ── sim control ─────────────────────────────────────────────────── */
function computeGraphRanges() {
  const A    = Math.abs(params.x0);
  const vMax = Math.max(sim.omega * A * 1.1, 0.05);
  const T    = sim.period;
  // show more cycles when damped so decay is visible
  const nT   = params.damping ? Math.max(6, Math.ceil(2 / (params.zeta + 0.01))) : 3;
  graphRanges = {
    tMax:   Math.max(T * nT, 1),
    xRange: [-(A + 0.02) * 1.15, (A + 0.02) * 1.15],
    vRange: [-vMax * 1.1, vMax * 1.1],
  };
}

function startSim() {
  if (running) return;
  running = true; lastTs = null; physAcc = 0;
  updateBtn(); rafId = requestAnimationFrame(loop);
}
function pauseSim() {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  updateBtn();
}
function resetSim() {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  sim.reset();
  view.scale = 1; view.tx = 0; view.ty = 0;
  computeGraphRanges();
  updateBtn(); draw(); drawGraphs(); updateReadout();
}
function updateBtn() {
  if (running) {
    btnPlay.textContent = '⏸  PAUSA'; btnPlay.classList.add('running');
  } else {
    btnPlay.textContent = sim.t > 0.001 ? '▶  RIPRENDI' : '▶  AVVIA';
    btnPlay.classList.remove('running');
  }
}
function loop(ts) {
  if (!running) return;
  if (lastTs === null) lastTs = ts;
  const dt = Math.min((ts - lastTs) / 1000, 0.05);
  lastTs = ts; physAcc += dt;
  while (physAcc >= PHYS_DT) { sim.step(PHYS_DT); physAcc -= PHYS_DT; }
  draw(); drawGraphs(); updateReadout();
  rafId = requestAnimationFrame(loop);
}

/* ── canvas ──────────────────────────────────────────────────────── */
const canvas      = document.getElementById('simCanvas');
const ctx         = canvas.getContext('2d');
const graphArea   = document.getElementById('graphArea');
const graphCanvas = document.getElementById('graphCanvas');
const gctx        = graphCanvas.getContext('2d');
let cw = 0, ch = 0, gw = 0, gh = 0;

function isDark() { return document.documentElement.dataset.theme !== 'light'; }

function drawGridBg(ctx, w, h, dk) {
  ctx.strokeStyle = dk ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y <= h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
}

function resizeAll() {
  const d   = window.devicePixelRatio || 1;
  const par = canvas.parentElement;
  const gH  = graphArea.offsetHeight || 200;
  const rH  = document.querySelector('.readout-bar')?.offsetHeight || 52;
  const hH  = document.getElementById('resizeHandle')?.offsetHeight || 6;
  cw = par.clientWidth;
  ch = Math.max(120, par.clientHeight - gH - rH - hH);
  canvas.width  = Math.round(cw*d); canvas.height = Math.round(ch*d);
  canvas.style.width = cw+'px';    canvas.style.height = ch+'px';
  ctx.setTransform(d,0,0,d,0,0);
  gw = graphArea.clientWidth; gh = graphArea.clientHeight || 200;
  graphCanvas.width  = Math.round(gw*d); graphCanvas.height = Math.round(gh*d);
  graphCanvas.style.width = gw+'px'; graphCanvas.style.height = gh+'px';
  gctx.setTransform(d,0,0,d,0,0);
}

new ResizeObserver(() => { resizeAll(); draw(); drawGraphs(); }).observe(canvas.parentElement);

/* ── view (zoom / pan) ───────────────────────────────────────────── */
const view = { scale: 1, tx: 0, ty: 0 };

(function initView() {
  canvas.style.cursor = 'grab';
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const f  = e.deltaY < 0 ? 1.12 : 1/1.12;
    const wx = (mx - view.tx) / view.scale, wy = (my - view.ty) / view.scale;
    view.scale = Math.max(0.25, Math.min(10, view.scale * f));
    view.tx = mx - wx * view.scale;
    view.ty = my - wy * view.scale;
    draw();
  }, { passive: false });
  let drag = false, ox = 0, oy = 0, stx = 0, sty = 0;
  canvas.addEventListener('mousedown', e => {
    drag = true; ox = e.clientX; oy = e.clientY; stx = view.tx; sty = view.ty;
    canvas.style.cursor = 'grabbing';
  });
  document.addEventListener('mousemove', e => {
    if (!drag) return;
    view.tx = stx + (e.clientX - ox);
    view.ty = sty + (e.clientY - oy);
    draw();
  });
  document.addEventListener('mouseup', () => { drag = false; canvas.style.cursor = 'grab'; });
}());

/* ── geometry ────────────────────────────────────────────────────── */
const MT_S = 40, MB_S = 20;

function springGeom() {
  const δ  = sim.delta;
  const A  = Math.abs(params.x0);

  const massH = Math.max(32, Math.min(64, cw * 0.07));
  const massW = massH * 1.5;

  /* scale: fit L0 + δ + A (+ margin) in available height */
  const visTotal  = params.L0 + Math.max(δ, 0) + A + 0.15;
  const available = ch - MT_S - MB_S - massH;
  const scale     = Math.max(30, Math.min(available / visTotal, 500));

  const coils = Math.max(5, Math.round(params.L0 * 7));

  const anchorX    = cw / 2;
  const anchorY    = MT_S;
  const naturalEndY = anchorY + params.L0 * scale;        // spring end at L0 (no weight)
  const equilY      = anchorY + (params.L0 + δ) * scale;  // equilibrium (weight attached)
  const springEndY  = equilY + sim.x * scale;              // current spring end

  return { anchorX, anchorY, naturalEndY, equilY, springEndY, scale, massH, massW, coils, δ };
}

/* ── coil spring drawing ─────────────────────────────────────────── */
function drawCoilSpring(ax, ay, bx, by, coils) {
  const len    = by - ay;
  const capLen = Math.min(Math.abs(len) * 0.05, 10);
  const amp    = 20;                   // fixed coil half-width in px
  const steps  = coils * 18;

  ctx.beginPath();
  ctx.moveTo(ax, ay);

  if (Math.abs(len) < capLen * 2 + 2) {
    ctx.lineTo(bx, by);
    ctx.stroke();
    return;
  }

  ctx.lineTo(ax, ay + capLen);

  const usable = len - 2 * capLen;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    ctx.lineTo(ax + amp * Math.sin(t * coils * Math.PI * 2), (ay + capLen) + t * usable);
  }
  ctx.lineTo(bx, by);
  ctx.stroke();
}

/* ── arrow ───────────────────────────────────────────────────────── */
function drawArrow(x0, y0, x1, y1, color, lw) {
  const dx = x1-x0, dy = y1-y0, len = Math.hypot(dx, dy);
  if (len < 4) return;
  const ux = dx/len, uy = dy/len;
  const hl = Math.min(14, len * 0.32);
  ctx.strokeStyle = ctx.fillStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - ux*hl, y1 - uy*hl); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - ux*hl - uy*hl*0.5, y1 - uy*hl + ux*hl*0.5);
  ctx.lineTo(x1 - ux*hl + uy*hl*0.5, y1 - uy*hl - ux*hl*0.5);
  ctx.closePath(); ctx.fill();
}

/* ── draw ────────────────────────────────────────────────────────── */
function draw() {
  if (!cw || !ch) return;
  ctx.clearRect(0, 0, cw, ch);
  const dk = isDark();
  drawGridBg(ctx, cw, ch, dk);
  const g  = springGeom();

  ctx.save();
  ctx.translate(view.tx, view.ty);
  ctx.scale(view.scale, view.scale);

  /* ── ceiling ── */
  const ceilH = 10, ceilW = 80;
  ctx.fillStyle = dk ? 'rgba(0,212,255,0.22)' : 'rgba(0,100,160,0.28)';
  ctx.fillRect(g.anchorX - ceilW/2, g.anchorY - ceilH, ceilW, ceilH);
  ctx.strokeStyle = dk ? 'rgba(0,212,255,0.55)' : 'rgba(0,100,160,0.65)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(g.anchorX - ceilW/2, g.anchorY); ctx.lineTo(g.anchorX + ceilW/2, g.anchorY); ctx.stroke();
  /* hatch */
  ctx.strokeStyle = dk ? 'rgba(0,212,255,0.15)' : 'rgba(0,100,160,0.18)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    const hx = g.anchorX - ceilW/2 + 6 + i * 12;
    ctx.beginPath(); ctx.moveTo(hx, g.anchorY - ceilH); ctx.lineTo(hx - 7, g.anchorY - ceilH - 7); ctx.stroke();
  }

  /* ── equilibrium line ── */
  if (params.showEquil) {
    ctx.strokeStyle = dk ? 'rgba(255,180,50,0.38)' : 'rgba(160,90,0,0.32)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(g.anchorX - 72, g.equilY);
    ctx.lineTo(g.anchorX + 72, g.equilY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = dk ? 'rgba(255,180,50,0.60)' : 'rgba(160,90,0,0.60)';
    ctx.font = '9px "Space Mono",monospace';
    ctx.textAlign = 'right';
    ctx.fillText('equil.', g.anchorX - 76, g.equilY + 4);
  }

  /* ── spring ── */
  const compressed = (g.springEndY - g.anchorY) < params.L0 * g.scale * 0.97;
  ctx.strokeStyle = compressed
    ? (dk ? 'rgba(255,100,70,0.85)' : 'rgba(200,40,20,0.85)')
    : (dk ? 'rgba(0,212,255,0.82)' : 'rgba(0,120,200,0.82)');
  ctx.lineWidth = 2.2;
  ctx.lineJoin  = 'round';
  drawCoilSpring(g.anchorX, g.anchorY, g.anchorX, g.springEndY, g.coils);

  /* anchor dot */
  ctx.fillStyle = dk ? 'rgba(0,212,255,0.90)' : 'rgba(0,100,180,0.90)';
  ctx.beginPath(); ctx.arc(g.anchorX, g.anchorY, 4.5, 0, Math.PI*2); ctx.fill();

  /* ── mass block ── */
  const mTY = g.springEndY;
  const mCY = mTY + g.massH / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
  ctx.fillStyle = dk ? '#0e2236' : '#2c65b0';
  ctx.fillRect(g.anchorX - g.massW/2, mTY, g.massW, g.massH);
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.strokeStyle = dk ? '#00d4ff' : '#004ea0';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(g.anchorX - g.massW/2, mTY, g.massW, g.massH);
  ctx.fillStyle = dk ? 'rgba(170,218,255,0.92)' : 'rgba(8,28,70,0.92)';
  ctx.font = `700 ${Math.max(9, Math.min(13, g.massH * 0.36))}px "Space Mono",monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(`${params.mass} kg`, g.anchorX, mTY + g.massH * 0.62);
  ctx.restore();

  /* ── force vectors ── */
  if (params.showForces) {
    const f   = sim.forces;
    const ref = Math.max(params.mass * G_SPRING, 0.1);
    const sc  = Math.max(50, g.scale * 0.38) / ref;
    const cx  = g.anchorX;

    /* Weight W (down) */
    const wLen = f.W * sc;
    drawArrow(cx, mCY, cx, mCY + wLen, '#ff5555', 2.5);
    ctx.fillStyle = dk ? '#ff9090' : '#bb1515';
    ctx.font = '700 12px "Space Mono",monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`W = ${Lab.fmt(f.W,1)} N`, cx + 10, mCY + wLen * 0.55);

    /* Spring force Fs (up when extended, down when compressed) */
    if (Math.abs(f.Fs) > 0.05) {
      const fsLen = Math.abs(f.Fs) * sc;
      const fsDir = f.Fs > 0 ? -1 : 1;   // upward in screen = −1
      drawArrow(cx, mCY, cx, mCY + fsDir * fsLen, '#44cc44', 2.5);
      ctx.fillStyle = dk ? '#80e880' : '#106010';
      ctx.font = '700 12px "Space Mono",monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`Fs = ${Lab.fmt(Math.abs(f.Fs),1)} N`, cx - 10, mCY + fsDir * fsLen * 0.55);
    }

    /* Net force Fnet (offset to the right) */
    if (Math.abs(f.Fnet) > 0.05) {
      const fnetLen = Math.abs(f.Fnet) * sc * 1.1;
      const fnetDir = f.Fnet > 0 ? 1 : -1;
      const ox = cx + g.massW/2 + 18;
      drawArrow(ox, mCY, ox, mCY + fnetDir * fnetLen, dk ? '#00d4ff' : '#0070a0', 3);
      ctx.fillStyle = dk ? '#70e8ff' : '#005070';
      ctx.font = '700 12px "Space Mono",monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`Fnet = ${Lab.fmt(Math.abs(f.Fnet),1)} N`,
        ox + 10, mCY + fnetDir * fnetLen * 0.5 - 6);
    }
  }

  /* ── displacement ruler ── */
  if (Math.abs(sim.x) > 0.005 && params.showEquil) {
    const rx  = g.anchorX - g.massW/2 - 22;
    const yA  = g.equilY;
    const yB  = g.springEndY;
    const col = dk ? 'rgba(255,180,50,0.55)' : 'rgba(160,90,0,0.55)';
    ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(rx, Math.min(yA,yB)); ctx.lineTo(rx, Math.max(yA,yB)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    [yA, yB].forEach(y => {
      ctx.beginPath(); ctx.moveTo(rx-4, y); ctx.lineTo(rx+4, y); ctx.stroke();
    });
    ctx.fillStyle = col;
    ctx.font = '9px "Space Mono",monospace';
    ctx.textAlign = 'right';
    const sign = sim.x >= 0 ? '+' : '';
    ctx.fillText(`${sign}${Lab.fmt(sim.x,2)} m`, rx - 7, (yA + yB) / 2 + 4);
  }

  /* ── spring constant annotation ── */
  const midSY = (g.anchorY + g.springEndY) / 2;
  ctx.fillStyle = dk ? 'rgba(100,165,225,0.35)' : 'rgba(20,60,120,0.35)';
  ctx.font = '9px "Space Mono",monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`k = ${params.k} N/m`, g.anchorX + 26, midSY);
  ctx.fillText(`L₀= ${params.L0} m`,  g.anchorX + 26, midSY + 14);

  ctx.restore();  /* end view transform */

  /* ── period label (screen-fixed) ── */
  ctx.fillStyle = dk ? 'rgba(100,165,225,0.60)' : 'rgba(20,60,120,0.58)';
  ctx.font = '700 10px "Space Mono",monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`T = ${Lab.fmt(sim.period,3)} s`, 8, 18);
}

/* ── graphs ──────────────────────────────────────────────────────── */
function drawGraphs() {
  if (!gw || !gh) return;
  gctx.clearRect(0, 0, gw, gh);
  const dk = isDark();
  const W  = Math.floor(gw / 2);
  const P  = { t: 14, b: 28, l: 44, r: 10 };
  const gr = graphRanges;
  const hs = sim.hist;

  const tWin   = gr?.tMax ?? 5;
  const tCur   = hs.t.length ? hs.t[hs.t.length - 1] : 0;
  const tEnd   = Math.max(tCur, tWin);
  const tStart = tEnd - tWin;
  const tRange = [tStart, tEnd];
  const mkS = fn => [{ data: hs.t.map((t, i) => ({ t, y: fn(i) })).filter(d => d.t >= tStart - 1e-9), color: '#00d4ff' }];

  drawSingleGraph(0, 0, W,      gh, P, 'x (m)',   dk, mkS(i => hs.x[i]), gr?.xRange, tRange);
  drawSingleGraph(W, 0, gw - W, gh, P, 'v (m/s)', dk, mkS(i => hs.v[i]), gr?.vRange, tRange);

  gctx.strokeStyle = dk ? 'rgba(0,212,255,0.07)' : 'rgba(0,100,160,0.09)';
  gctx.lineWidth = 1;
  gctx.beginPath(); gctx.moveTo(W, 0); gctx.lineTo(W, gh); gctx.stroke();
}

function drawSingleGraph(ox, oy, gW, gH, PAD, label, dark, series, yFixed, tFixed) {
  const pl = PAD.l, pr = PAD.r, pt = PAD.t, pb = PAD.b;
  const iW = gW - pl - pr, iH = gH - pt - pb;
  if (iW <= 0 || iH <= 0) return;

  const allT = series.flatMap(s => s.data.map(d => d.t));
  const allY = series.flatMap(s => s.data.map(d => d.y));
  let tMin = 0, tMax;
  if (Array.isArray(tFixed)) { [tMin, tMax] = tFixed; }
  else { tMax = tFixed ?? (allT.length ? Math.max(...allT) * 1.05 : 0.5); }
  gctx.fillStyle = dark ? '#0b1018' : '#f0f2f5';
  gctx.fillRect(ox, oy, gW, gH);

  let yMin, yMax;
  if (yFixed) { [yMin, yMax] = yFixed; }
  else {
    yMin = allY.length ? Math.min(...allY) : -1;
    yMax = allY.length ? Math.max(...allY) :  1;
    const yr = yMax - yMin || 1; yMin -= yr * 0.08; yMax += yr * 0.08;
  }

  const toX = t => ox + pl + ((t - tMin) / (tMax - tMin)) * iW;
  const toY = y => oy + pt + (1 - (y - yMin) / (yMax - yMin)) * iH;

  const axC = dark ? 'rgba(200,220,255,0.35)' : 'rgba(0,0,0,0.28)';
  const grC = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const tkC = dark ? '#6b8099' : '#4a6278';
  const lbC = dark ? '#6b8099' : '#4a6278';

  const yTks = niceTicks(yMin, yMax, 4), tTks = niceTicks(tMin, tMax, 4);

  yTks.forEach(v => {
    if (v < yMin-1e-9 || v > yMax+1e-9) return;
    const gy = toY(v), z = Math.abs(v) < 1e-9;
    gctx.strokeStyle = z ? axC : grC; gctx.lineWidth = z ? 1.5 : 1;
    gctx.beginPath(); gctx.moveTo(ox+pl, gy); gctx.lineTo(ox+pl+iW, gy); gctx.stroke();
  });
  tTks.forEach(v => {
    if (v < tMin - 1e-9 || v > tMax + 1e-9) return;
    gctx.strokeStyle = grC; gctx.lineWidth = 1;
    gctx.beginPath(); gctx.moveTo(toX(v), oy+pt); gctx.lineTo(toX(v), oy+pt+iH); gctx.stroke();
  });

  gctx.strokeStyle = axC; gctx.lineWidth = 1.5;
  gctx.beginPath(); gctx.moveTo(ox+pl, oy+pt); gctx.lineTo(ox+pl, oy+pt+iH); gctx.stroke();
  if (yMin < -1e-9 && yMax > 1e-9) {
    gctx.beginPath(); gctx.moveTo(ox+pl, toY(0)); gctx.lineTo(ox+pl+iW, toY(0)); gctx.stroke();
  }
  gctx.strokeStyle = dark ? 'rgba(200,220,255,0.35)' : 'rgba(0,0,0,0.28)';
  gctx.lineWidth = 1; gctx.strokeRect(ox+pl, oy+pt, iW, iH);

  gctx.font = '700 9px "Space Mono",monospace';
  gctx.textAlign = 'right';
  yTks.forEach(v => {
    if (v < yMin-1e-9 || v > yMax+1e-9) return;
    const gy = toY(v);
    gctx.strokeStyle = axC; gctx.lineWidth = 1;
    gctx.beginPath(); gctx.moveTo(ox+pl-4, gy); gctx.lineTo(ox+pl, gy); gctx.stroke();
    gctx.fillStyle = tkC; gctx.fillText(fmtTick(v), ox+pl-6, gy+4);
  });
  gctx.textAlign = 'center';
  tTks.forEach(v => {
    if (v < tMin - 1e-9 || v > tMax + 1e-9) return;
    const gx = toX(v); if (gx < ox+pl || gx > ox+pl+iW) return;
    gctx.strokeStyle = axC; gctx.lineWidth = 1;
    gctx.beginPath(); gctx.moveTo(gx, oy+pt+iH); gctx.lineTo(gx, oy+pt+iH+4); gctx.stroke();
    if (v > tMin + (tMax - tMin) * 0.03) { gctx.fillStyle = tkC; gctx.fillText(fmtTick(v)+'s', gx, oy+pt+iH+16); }
  });

  gctx.save();
  gctx.translate(ox+9, oy+pt+iH/2); gctx.rotate(-Math.PI/2);
  gctx.textAlign = 'center'; gctx.fillStyle = lbC;
  gctx.font = '700 9px "Space Mono",monospace';
  gctx.fillText(label, 0, 0);
  gctx.restore();

  /* clip series drawing to plot area so lines never exit the box */
  gctx.save();
  gctx.beginPath();
  gctx.rect(ox+pl, oy+pt, iW, iH);
  gctx.clip();

  series.forEach(s => {
    if (s.data.length < 2) return;
    gctx.strokeStyle = s.color; gctx.lineWidth = 1.5; gctx.lineJoin = 'round';
    gctx.beginPath();
    s.data.forEach((d, i) => i === 0 ? gctx.moveTo(toX(d.t), toY(d.y)) : gctx.lineTo(toX(d.t), toY(d.y)));
    gctx.stroke();
  });

  const ct = series[0]?.data[series[0].data.length-1]?.t ?? 0;
  if (ct > 0) {
    gctx.strokeStyle = dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)';
    gctx.lineWidth = 1; gctx.setLineDash([2,2]);
    gctx.beginPath(); gctx.moveTo(toX(ct), oy+pt); gctx.lineTo(toX(ct), oy+pt+iH); gctx.stroke();
    gctx.setLineDash([]);
  }

  gctx.restore();

  /* dot at current position (outside clip so it's always fully visible) */
  series.forEach(s => {
    const last = s.data[s.data.length-1];
    if (!last) return;
    const lx = Math.max(ox+pl, Math.min(ox+pl+iW, toX(last.t)));
    const ly = Math.max(oy+pt, Math.min(oy+pt+iH, toY(last.y)));
    gctx.beginPath(); gctx.arc(lx, ly, 2.5, 0, Math.PI*2);
    gctx.fillStyle = s.color; gctx.fill();
  });
}

/* ── readout ─────────────────────────────────────────────────────── */
const readout = new Lab.Readout(document.getElementById('readout'), [
  { key: 't',  label: 'tempo t'        },
  { key: 'x',  label: 'spostamento x'        },
  { key: 'v',  label: 'velocità v'        },
  { key: 'a',  label: 'accelerazione a'        },
  { key: 'Fs', label: 'forza elastica'       },
  { key: 'T',  label: 'periodo T' },
]);

function updateReadout() {
  const f = sim.forces;
  readout.set('t',  Lab.fmt(sim.t,2) + ' s');
  readout.set('x',  (sim.x >= 0 ? '+' : '') + Lab.fmt(sim.x,3) + ' m');
  readout.set('v',  (sim.v >= 0 ? '+' : '') + Lab.fmt(sim.v,3) + ' m/s');
  readout.set('a',  (sim.accel(sim.x, sim.v) >= 0 ? '+' : '') + Lab.fmt(sim.accel(sim.x, sim.v),2) + ' m/s²');
  readout.set('Fs', Lab.fmt(f.Fs,1) + ' N');
  readout.set('T',  Lab.fmt(sim.period,3) + ' s');
}

/* ── controls ────────────────────────────────────────────────────── */
function buildControls() {
  const c = document.getElementById('controls');

  const secMolla = Lab.Section('Molla');
  secMolla.add(Lab.SliderInput({
    label: 'Costante elastica k', min: 1, max: 200, value: params.k, step: 1, unit: ' N/m',
    onChange(v) { params.k = v; resetSim(); },
  }));
  secMolla.add(Lab.SliderInput({
    label: 'Lunghezza naturale L₀', min: 0.2, max: 2.5, value: params.L0, step: 0.05, unit: ' m',
    onChange(v) { params.L0 = v; resetSim(); },
  }));
  c.appendChild(secMolla.el);

  const secCorpo = Lab.Section('Corpo');
  secCorpo.add(Lab.SliderInput({
    label: 'Massa', min: 0.1, max: 10, value: params.mass, step: 0.1, unit: ' kg',
    onChange(v) { params.mass = v; resetSim(); },
  }));
  secCorpo.add(Lab.SliderInput({
    label: 'Spostamento iniziale x₀', min: -1.0, max: 1.0, value: params.x0, step: 0.05, unit: ' m',
    hint: '(dall\'equilibrio, + = giù)',
    onChange(v) { params.x0 = v; resetSim(); },
  }));
  c.appendChild(secCorpo.el);

  const secDamp = Lab.Section('Smorzamento');
  const dampSub = Lab.SubPanel();
  dampSub.add(Lab.Slider({
    label: 'Smorzamento ζ', min: 0.01, max: 1.50, value: params.zeta, step: 0.01, unit: '',
    onChange(v) { params.zeta = v; resetSim(); },
  }));
  if (!params.damping) dampSub.hide();
  secDamp.add(Lab.Toggle({
    label: 'Abilita smorzamento', value: params.damping,
    onChange(v) {
      params.damping = v;
      v ? dampSub.show() : dampSub.hide();
      resetSim();
    },
  }));
  secDamp.add(dampSub);
  c.appendChild(secDamp.el);

  const secVis = Lab.Section('Visualizzazione');
  secVis.add(Lab.Toggle({
    label: 'Mostra forze', value: params.showForces,
    onChange(v) { params.showForces = v; draw(); },
  }));
  secVis.add(Lab.Toggle({
    label: 'Mostra equilibrio', value: params.showEquil,
    onChange(v) { params.showEquil = v; draw(); },
  }));
  c.appendChild(secVis.el);
}

/* ── buttons ─────────────────────────────────────────────────────── */
const btnPlay  = document.getElementById('btnPlay');
const btnReset = document.getElementById('btnReset');
btnPlay.addEventListener('click',  () => { running ? pauseSim() : startSim(); });
btnReset.addEventListener('click', resetSim);

/* ── utilities ───────────────────────────────────────────────────── */
function niceTicks(min, max, n = 4) {
  const range = max - min; if (range <= 0) return [min];
  const raw   = range / n;
  const mag   = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm  = raw / mag;
  const step  = (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag;
  const tks   = [];
  for (let i = Math.ceil(min/step); i*step <= max+step*0.001; i++) {
    const v = +(i*step).toPrecision(10);
    if (v >= min - step*0.001) tks.push(v);
  }
  return tks;
}
function fmtTick(v) {
  if (v === 0) return '0';
  const a = Math.abs(v);
  const s = a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : a >= 1 ? v.toFixed(1) : v.toFixed(2);
  return (s.includes('.') ? s.replace(/\.?0+$/, '') : s).replace('.', ',').replace('-', '−');
}

/* ── resize handle ───────────────────────────────────────────────── */
(function () {
  const handle = document.getElementById('resizeHandle');
  if (!handle) return;
  let act = false, startY = 0, startH = 0;
  handle.addEventListener('mousedown', e => {
    act = true; startY = e.clientY; startH = graphArea.offsetHeight;
    handle.classList.add('dragging');
    document.body.style.userSelect = 'none'; e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!act) return;
    graphArea.style.height = Math.max(80, Math.min(500, startH + (startY - e.clientY))) + 'px';
    resizeAll(); draw(); drawGraphs();
  });
  document.addEventListener('mouseup', () => {
    if (!act) return; act = false;
    handle.classList.remove('dragging'); document.body.style.userSelect = '';
  });
}());

/* ── fullscreen ──────────────────────────────────────────────────── */
(function () {
  const btn = document.getElementById('btnFullscreen');
  if (!btn) return;
  btn.addEventListener('click', () => {
    document.fullscreenElement ? document.exitFullscreen()
      : graphArea.requestFullscreen().catch(() => {});
  });
  document.addEventListener('fullscreenchange', () => {
    const inFS = !!document.fullscreenElement;
    btn.textContent = inFS ? '✕' : '⛶';
    btn.title = inFS ? 'Esci da schermo intero' : 'Schermo intero';
    resizeAll(); draw(); drawGraphs();
  });
}());

/* ── theme + init ────────────────────────────────────────────────── */
new MutationObserver(() => { draw(); drawGraphs(); })
  .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

Lab.initTheme();
buildControls();
computeGraphRanges();
graphArea.style.height = (window.innerWidth < 800 ? 130 : 220) + 'px';
resizeAll();
updateReadout();
draw();
drawGraphs();
