'use strict';

/* ─── Data ──────────────────────────────────────────────────── */
const PLANETS_IP = [
  { value:'luna',  label:'Luna',  hint:'1.62 m/s²', g:1.62  },
  { value:'marte', label:'Marte', hint:'3.72 m/s²', g:3.72  },
  { value:'terra', label:'Terra', hint:'9.81 m/s²', g:9.81  },
  { value:'giove', label:'Giove', hint:'24.79 m/s²',g:24.79 },
];

const G_VALS = { luna:1.62, marte:3.72, terra:9.81, giove:24.79 };

const PHYS_DT = 1 / 120;
const HIST_N  = 3;
const L_PHYS  = 8;   // fixed slope length (m)

/* ─── Params ─────────────────────────────────────────────────── */
const params = {
  mass:   2.0,
  angle:  30,
  muS:    0.40,
  muK:    0.25,
  initV:  0,
  planet: 'terra',
  showForces: true,
};

/* ─── Simulation ─────────────────────────────────────────────── */
class InclinedSim {
  reset() {
    this._n = 0;
    this.x = 0;
    this.v = params.initV;
    this.t = 0;
    const g  = G_VALS[params.planet];
    const th = params.angle * Math.PI / 180;
    const N  = params.mass * g * Math.cos(th);
    const Fp = params.mass * g * Math.sin(th);
    this.sliding = Math.abs(params.initV) > 1e-6 || Math.abs(Fp) > params.muS * N;
    this.stopped = !this.sliding;
    this.hist = { t:[0], x:[0], v:[params.initV], a:[] };
    this.hist.a.push(this._accel(this.v));
  }

  _accel(v) {
    if (!this.sliding) return 0;
    const g  = G_VALS[params.planet];
    const th = params.angle * Math.PI / 180;
    const N  = params.mass * g * Math.cos(th);
    const Fp = params.mass * g * Math.sin(th);
    const dir = Math.abs(v) > 1e-6 ? Math.sign(v) : (Math.sign(Fp) || 1);
    return (Fp - params.muK * N * dir) / params.mass;
  }

  step(dt) {
    if (this.stopped) return;
    if (!this.sliding) {
      const g  = G_VALS[params.planet];
      const th = params.angle * Math.PI / 180;
      const N  = params.mass * g * Math.cos(th);
      const Fp = params.mass * g * Math.sin(th);
      if (Math.abs(Fp) <= params.muS * N) { this.t += dt; return; }
      this.sliding = true;
    }
    const a = this._accel(this.v);
    this.v += a * dt;
    this.x += this.v * dt;
    this.t += dt;

    if (this.x >= L_PHYS) {
      this.x = L_PHYS; this.v = 0; this.stopped = true; this.sliding = false;
      this._pushHist();
    } else if (this.x < 0) {
      this.x = 0; this.v = 0; this.stopped = true; this.sliding = false;
      this._pushHist();
    } else if (this.sliding && Math.abs(this.v) < 0.008) {
      const g  = G_VALS[params.planet];
      const th = params.angle * Math.PI / 180;
      const N  = params.mass * g * Math.cos(th);
      const Fp = params.mass * g * Math.sin(th);
      if (Math.abs(Fp) <= params.muS * N) {
        this.v = 0; this.sliding = false; this.stopped = true;
        this._pushHist();
      }
    }
    this._n++;
    if (this._n % HIST_N === 0) this._pushHist();
  }

  _pushHist() {
    this.hist.t.push(this.t);
    this.hist.x.push(this.x);
    this.hist.v.push(this.v);
    this.hist.a.push(this._accel(this.v));
  }

  get forces() {
    const g  = G_VALS[params.planet];
    const th = params.angle * Math.PI / 180;
    const N  = params.mass * g * Math.cos(th);
    const Fp = params.mass * g * Math.sin(th);
    const W  = params.mass * g;
    let fric = 0;
    if (this.sliding) {
      const dir = Math.abs(this.v) > 1e-6 ? Math.sign(this.v) : (Math.sign(Fp) || 1);
      fric = params.muK * N * dir;
    } else {
      // Static: friction balances the slope component (points opposite to Fp)
      fric = Math.min(Math.abs(Fp), params.muS * N) * (Math.sign(Fp) || 0);
    }
    return { W, N, Fp, fric, Fnet: Fp - fric };
  }

  get statusText() {
    if (this.stopped && this.x >= L_PHYS - 0.001) return 'Arrivato';
    if (this.stopped) return 'Fermo';
    return 'Scivola';
  }
}

const sim = new InclinedSim();
sim.reset();

let running  = false;
let rafId    = null;
let lastTs   = null;
let physAcc  = 0;
let graphRanges = null;

/* ─── Sim control ─────────────────────────────────────────────── */
function computeGraphRanges() {
  const g  = G_VALS[params.planet];
  const th = params.angle * Math.PI / 180;
  const m  = params.mass;
  const N  = m * g * Math.cos(th);
  const Fp = m * g * Math.sin(th);
  const v0 = params.initV;
  const startSlide = Math.abs(Fp) > params.muS * N || Math.abs(v0) > 1e-6;
  let tMax = 5, vAbs = Math.max(Math.abs(v0), 1);

  if (startSlide) {
    if (v0 >= 0) {
      const a = (Fp - params.muK * N) / m;
      if (a > 1e-4) {
        tMax = Math.sqrt(2 * L_PHYS / a);
        vAbs = Math.sqrt(v0 * v0 + 2 * a * L_PHYS);
      } else if (a < -1e-4 && v0 > 0) {
        tMax = v0 / Math.abs(a) * 1.1; vAbs = v0;
      } else {
        tMax = v0 > 0.1 ? L_PHYS / v0 : 10; vAbs = Math.max(v0, 1);
      }
    } else {
      const aUp   = (Fp + params.muK * N) / m;
      const tUp   = Math.abs(v0) / Math.max(aUp, 0.01);
      const xStop = v0 * v0 / (2 * Math.max(aUp, 0.01));
      const aDown = (Fp - params.muK * N) / m;
      const tDown = aDown > 1e-4 ? Math.sqrt(2 * Math.min(xStop, L_PHYS) / aDown) : 20;
      tMax = tUp + tDown;
      vAbs = Math.max(Math.abs(v0), Math.sqrt(Math.max(0, 2 * aDown * Math.min(xStop, L_PHYS))));
    }
  }
  tMax = Math.max(tMax * 1.12, 1.5);
  vAbs = Math.max(vAbs * 1.12, 1);
  const aAbs = Math.max(Math.abs((Fp - params.muK * N) / m), 0.5);
  const vMin = Math.min(v0 < 0 ? v0 * 1.1 : 0, 0);

  graphRanges = {
    tMax,
    xRange: [-0.04 * L_PHYS, L_PHYS * 1.05],
    vRange: [vMin - vAbs * 0.05, vAbs],
    aRange: [-aAbs * 1.1, aAbs * 1.1],
  };
}

function startSim() {
  if (running || sim.stopped) return;
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
    const started = sim.t > 0;
    btnPlay.textContent = started && !sim.stopped ? '▶  RIPRENDI' : '▶  AVVIA';
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
  if (sim.stopped) { running = false; updateBtn(); return; }
  rafId = requestAnimationFrame(loop);
}

/* ─── Canvas ──────────────────────────────────────────────────── */
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
  canvas.width  = Math.round(cw * d); canvas.height = Math.round(ch * d);
  canvas.style.width = cw + 'px';    canvas.style.height = ch + 'px';
  ctx.setTransform(d, 0, 0, d, 0, 0);
  gw = graphArea.clientWidth; gh = graphArea.clientHeight || 200;
  graphCanvas.width  = Math.round(gw * d); graphCanvas.height = Math.round(gh * d);
  graphCanvas.style.width = gw + 'px';    graphCanvas.style.height = gh + 'px';
  gctx.setTransform(d, 0, 0, d, 0, 0);
}

new ResizeObserver(() => { resizeAll(); draw(); drawGraphs(); }).observe(canvas.parentElement);

/* ─── Slope geometry ──────────────────────────────────────────── */
const ML = 90, MR = 52, MT = 100, MB = 46;   // margini ampi: i vettori forza in cima al piano restano visibili

function slopeGeom() {
  const th   = params.angle * Math.PI / 180;
  const sinT = Math.max(Math.sin(th), 1e-3);
  const cosT = Math.max(Math.cos(th), 1e-3);
  const aw   = cw - ML - MR;
  const ah   = ch - MT - MB;
  const sL   = Math.max(80, Math.min(ah / sinT, aw / cosT) * 0.82);
  // Right angle on LEFT:
  // rax,ray = right-angle vertex (lower-left, where vertical wall meets ground)
  // px,py   = peak (upper-left, top of vertical wall)
  // fx,fy   = foot (lower-right, end of slope on ground)
  const rax = ML,            ray = ch - MB;
  const px  = ML,            py  = ray - sL * sinT;
  const fx  = ML + sL * cosT, fy = ray;
  return { th, sinT, cosT, sL, fx, fy, px, py, rax, ray };
}

function blockPos(g) {
  const frac = 1 - sim.x / L_PHYS;  // 1=at peak, 0=at foot
  const bx   = g.fx + frac * (g.px - g.fx);
  const by   = g.fy + frac * (g.py - g.fy);
  // Slope direction (down-right) = (cosT, sinT)
  // Normal (upper-right, away from triangle) = 90° CW of slope dir = (sinT, -cosT)
  const nx = g.sinT, ny = -g.cosT;
  const bh = Math.max(12, g.sL * 0.055);
  const bw = bh * 1.3;
  return { bx, by, nx, ny, bh, bw, cx: bx + nx * bh / 2, cy: by + ny * bh / 2 };
}

/* ─── View (zoom / pan) ───────────────────────────────────────── */
const view = { scale: 1, tx: 0, ty: 0 };

(function initViewInteraction() {
  canvas.style.cursor = 'grab';
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const wx = (mx - view.tx) / view.scale, wy = (my - view.ty) / view.scale;
    view.scale = Math.max(0.25, Math.min(10, view.scale * factor));
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

/* ─── Arrow utility ───────────────────────────────────────────── */
function drawArrow(fromX, fromY, toX, toY, color, lw) {
  const dx = toX - fromX, dy = toY - fromY;
  const len = Math.hypot(dx, dy);
  if (len < 3) return;
  const ux = dx / len, uy = dy / len;
  const hl = Math.min(14, len * 0.35);
  ctx.strokeStyle = ctx.fillStyle = color;
  ctx.lineWidth = lw || 2;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX - ux * hl, toY - uy * hl);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - ux * hl - uy * hl * 0.5, toY - uy * hl + ux * hl * 0.5);
  ctx.lineTo(toX - ux * hl + uy * hl * 0.5, toY - uy * hl - ux * hl * 0.5);
  ctx.closePath(); ctx.fill();
}

/* ─── Draw simulation ─────────────────────────────────────────── */
function draw() {
  if (!cw || !ch) return;
  ctx.clearRect(0, 0, cw, ch);
  const dk = isDark();
  drawGridBg(ctx, cw, ch, dk);
  const g  = slopeGeom();
  const bp = blockPos(g);

  ctx.save();
  ctx.translate(view.tx, view.ty);
  ctx.scale(view.scale, view.scale);

  // Ground
  ctx.strokeStyle = dk ? 'rgba(0,212,255,0.28)' : 'rgba(0,100,160,0.38)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, g.fy); ctx.lineTo(cw, g.fy); ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = dk ? 'rgba(0,212,255,0.08)' : 'rgba(0,100,160,0.10)';
  for (let x = 8; x < cw; x += 14) {
    ctx.beginPath(); ctx.moveTo(x, g.fy); ctx.lineTo(x - 8, g.fy + 8); ctx.stroke();
  }

  // Slope triangle fill: rax,ray → px,py → fx,fy
  ctx.beginPath();
  ctx.moveTo(g.rax, g.ray); ctx.lineTo(g.px, g.py); ctx.lineTo(g.fx, g.fy);
  ctx.closePath();
  ctx.fillStyle = dk ? 'rgba(20,42,72,0.52)' : 'rgba(155,180,220,0.42)';
  ctx.fill();

  // Slope surface: peak (upper-left) → foot (lower-right)
  ctx.beginPath(); ctx.moveTo(g.px, g.py); ctx.lineTo(g.fx, g.fy);
  ctx.strokeStyle = dk ? 'rgba(0,212,255,0.62)' : 'rgba(0,100,160,0.72)';
  ctx.lineWidth = 2.5; ctx.stroke();

  // Vertical side: peak → right-angle vertex (both on left)
  ctx.beginPath(); ctx.moveTo(g.px, g.py); ctx.lineTo(g.rax, g.ray);
  ctx.strokeStyle = dk ? 'rgba(0,212,255,0.22)' : 'rgba(0,100,160,0.28)';
  ctx.lineWidth = 1.5; ctx.stroke();

  // Right angle marker at lower-left
  const sq = 9;
  ctx.strokeStyle = dk ? 'rgba(0,212,255,0.30)' : 'rgba(0,100,160,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(g.rax, g.ray - sq, sq, sq);

  // Angle arc + label at foot (lower-right)
  if (params.angle >= 1) {
    const arcR = Math.min(42, g.sL * 0.13);
    ctx.beginPath(); ctx.arc(g.fx, g.fy, arcR, Math.PI, Math.PI + g.th);
    ctx.strokeStyle = dk ? 'rgba(255,200,50,0.65)' : 'rgba(155,95,0,0.75)';
    ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle  = dk ? 'rgba(255,200,50,0.82)' : 'rgba(155,95,0,0.88)';
    ctx.font = '700 10px "Space Mono",monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${params.angle}°`, g.fx - arcR - 5, g.fy - 4);
  }

  // Slope length label (offset in normal direction from midpoint)
  const midX = (g.px + g.fx) / 2 + g.sinT * 14;
  const midY = (g.py + g.fy) / 2 - g.cosT * 14;
  ctx.fillStyle = dk ? 'rgba(100,165,225,0.38)' : 'rgba(20,60,120,0.38)';
  ctx.font = '9px "Space Mono",monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`L = ${L_PHYS} m`, midX, midY);

  // Block
  const { bx, by, nx, ny, bh, bw, cx: bcx, cy: bcy } = bp;
  ctx.save();
  ctx.translate(bcx, bcy);
  ctx.rotate(g.th);   // slope tilts down-right → positive angle in screen coords
  ctx.shadowColor = 'rgba(0,0,0,0.30)';
  ctx.shadowBlur = 6; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
  ctx.fillStyle = dk ? '#0e2236' : '#2c65b0';
  ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
  ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.strokeStyle = dk ? '#00d4ff' : '#004ea0';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
  ctx.fillStyle = dk ? 'rgba(170,218,255,0.92)' : 'rgba(8,28,70,0.92)';
  //ctx.font = `700 ${Math.max(8, Math.min(11, bh * 0.42))}px "Space Mono",monospace`;
  //ctx.textAlign = 'center';
  //ctx.fillText(`${params.mass} kg`, 0, bh * 0.18);
  ctx.restore();

  // Force arrows
  if (params.showForces) {
    const f   = sim.forces;
    const ref = params.mass * G_VALS[params.planet];
    const sc  = Math.max(44, g.sL * 0.22) / ref;  // bigger vectors

    // Weight (straight down)
    const wLen = f.W * sc;
    drawArrow(bcx, bcy, bcx, bcy + wLen, '#ff5555', 2.5);
    ctx.fillStyle = dk ? '#ff9090' : '#bb1515';
    ctx.font = '700 12px "Space Mono",monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`W=${Lab.fmt(f.W,1)} N`, bcx + 15, bcy + wLen * 0.55);

    // Normal (upper-right, perpendicular to slope)
    const nLen = f.N * sc;
    drawArrow(bcx, bcy, bcx + nx * nLen, bcy + ny * nLen, '#44cc44', 2.5);
    ctx.fillStyle = dk ? '#80e880' : '#106010';
    ctx.font = '700 12px "Space Mono",monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`N=${Lab.fmt(f.N,1)} N`, bcx + nx * nLen + 6, bcy + ny * nLen + 4);

    // Friction: fric>0 → UP slope = (-cosT, -sinT); fric<0 → DOWN slope
    if (Math.abs(f.fric) > 0.05) {
      const fLen = Math.abs(f.fric) * sc;
      const fs   = Math.sign(f.fric);
      const fdx  = fs * (-g.cosT);   // up-slope direction for new geometry
      const fdy  = fs * (-g.sinT);
      drawArrow(bcx, bcy, bcx + fdx * fLen, bcy + fdy * fLen, '#ffb400', 2.5);
      ctx.fillStyle = dk ? '#ffd060' : '#906000';
      ctx.font = '700 12px "Space Mono",monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`f=${Lab.fmt(Math.abs(f.fric),1)} N`,
        bcx + fdx * fLen * 1.5 + nx * 18, bcy + fdy * fLen * 0.5 + ny * 18);
    }

    // Net force (only when sliding): Fnet>0 → DOWN slope = (cosT, sinT)
    if (sim.sliding && Math.abs(f.Fnet) > 0.05) {
      const fnetLen = Math.abs(f.Fnet) * sc * 1.1;
      const ns  = Math.sign(f.Fnet);
      const ndx = ns * g.cosT;    // down-slope for new geometry
      const ndy = ns * g.sinT;
      const ox2 = bcx; //bcx + nx * (bh + 14);
      const oy2 = bcy; //bcy + ny * (bh + 14);
      drawArrow(ox2, oy2, ox2 + ndx * fnetLen, oy2 + ndy * fnetLen,
        dk ? '#00d4ff' : '#0070a0', 3);
      ctx.fillStyle = dk ? '#70e8ff' : '#005070';
      ctx.font = '700 12px "Space Mono",monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`Fnet=${Lab.fmt(Math.abs(f.Fnet),1)} N`,
        ox2 + ndx * fnetLen * 0.5 + 40, oy2 + ndy * fnetLen * 0.5 - 10);
    }
  }

  ctx.restore(); // end view transform

  // Status (screen-fixed, outside view transform)
  const st = sim.statusText;
  ctx.fillStyle = st === 'Scivola' ? (dk ? '#ffb400' : '#906000')
                : st === 'Arrivato' ? (dk ? '#44dd88' : '#008844')
                : (dk ? 'rgba(155,195,255,0.58)' : 'rgba(20,60,120,0.62)');
  ctx.font = '700 10px "Space Mono",monospace';
  ctx.textAlign = 'left';
  ctx.fillText(st.toUpperCase(), 8, 18);
}

/* ─── Draw graphs ─────────────────────────────────────────────── */
function drawGraphs() {
  if (!gw || !gh) return;
  gctx.clearRect(0, 0, gw, gh);
  const dk = isDark();
  const W  = Math.floor(gw / 3);
  const P  = { t:18, b:30, l:46, r:10 };
  const gr = graphRanges;
  const hs = sim.hist;
  const mk = fn => [{ data: hs.t.map((t, i) => ({ t, y: fn(i) })), color:'#00d4ff' }];

  drawSingleGraph(0,   0, W,      gh, P, 'x (m)',    dk, mk(i=>hs.x[i]), gr?.xRange, gr?.tMax);
  drawSingleGraph(W,   0, W,      gh, P, 'v (m/s)',  dk, mk(i=>hs.v[i]), gr?.vRange, gr?.tMax);
  drawSingleGraph(W*2, 0, gw-W*2, gh, P, 'a (m/s²)', dk, mk(i=>hs.a[i]), gr?.aRange, gr?.tMax);

  gctx.strokeStyle = dk ? 'rgba(0,212,255,0.07)' : 'rgba(0,100,160,0.09)';
  gctx.lineWidth = 1;
  [W, W*2].forEach(x => {
    gctx.beginPath(); gctx.moveTo(x, 0); gctx.lineTo(x, gh); gctx.stroke();
  });
}

function drawSingleGraph(ox, oy, gW, gH, PAD, label, dark, series, yFixed, tFixed) {
  const pl = PAD.l, pr = PAD.r, pt = PAD.t, pb = PAD.b;
  const iW = gW - pl - pr, iH = gH - pt - pb;
  if (iW <= 0 || iH <= 0) return;

  const allT = series.flatMap(s => s.data.map(d => d.t));
  const allY = series.flatMap(s => s.data.map(d => d.y));
  const tMax = tFixed ?? (allT.length ? Math.max(...allT) * 1.05 : 0.5);
  gctx.fillStyle = dark ? '#0b1018' : '#f0f2f5';
  gctx.fillRect(ox, oy, gW, gH);

  let yMin, yMax;
  if (yFixed) { [yMin, yMax] = yFixed; }
  else {
    yMin = allY.length ? Math.min(...allY) : -1;
    yMax = allY.length ? Math.max(...allY) :  1;
    const yr = yMax - yMin || 1;
    yMin -= yr * 0.08; yMax += yr * 0.08;
  }

  const toX = t => ox + pl + (t / tMax) * iW;
  const toY = y => oy + pt + (1 - (y - yMin) / (yMax - yMin)) * iH;

  const axClr  = dark ? 'rgba(200,220,255,0.35)' : 'rgba(0,0,0,0.28)';
  const grClr  = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const tkClr  = dark ? '#6b8099' : '#4a6278';
  const lblClr = dark ? '#6b8099' : '#4a6278';

  const yTks = niceTicks(yMin, yMax, 4);
  const tTks = niceTicks(0, tMax, 4);

  yTks.forEach(v => {
    if (v < yMin - 1e-9 || v > yMax + 1e-9) return;
    const gy = toY(v), isZ = Math.abs(v) < 1e-9;
    gctx.strokeStyle = isZ ? axClr : grClr; gctx.lineWidth = isZ ? 1.5 : 1;
    gctx.beginPath(); gctx.moveTo(ox+pl, gy); gctx.lineTo(ox+pl+iW, gy); gctx.stroke();
  });
  tTks.forEach(v => {
    if (v < -1e-9 || v > tMax + 1e-9) return;
    gctx.strokeStyle = grClr; gctx.lineWidth = 1;
    gctx.beginPath(); gctx.moveTo(toX(v), oy+pt); gctx.lineTo(toX(v), oy+pt+iH); gctx.stroke();
  });

  gctx.strokeStyle = axClr; gctx.lineWidth = 1.5;
  gctx.beginPath(); gctx.moveTo(ox+pl, oy+pt); gctx.lineTo(ox+pl, oy+pt+iH); gctx.stroke();
  if (yMin < -1e-9 && yMax > 1e-9) {
    gctx.beginPath(); gctx.moveTo(ox+pl, toY(0)); gctx.lineTo(ox+pl+iW, toY(0)); gctx.stroke();
  }
  gctx.strokeStyle = dark ? 'rgba(200,220,255,0.35)' : 'rgba(0,0,0,0.28)';
  gctx.lineWidth = 1; gctx.strokeRect(ox+pl, oy+pt, iW, iH);

  gctx.font = '700 9px "Space Mono",monospace';
  gctx.textAlign = 'right';
  yTks.forEach(v => {
    if (v < yMin - 1e-9 || v > yMax + 1e-9) return;
    const gy = toY(v);
    gctx.strokeStyle = axClr; gctx.lineWidth = 1;
    gctx.beginPath(); gctx.moveTo(ox+pl-4, gy); gctx.lineTo(ox+pl, gy); gctx.stroke();
    gctx.fillStyle = tkClr; gctx.fillText(fmtTick(v), ox+pl-6, gy+4);
  });
  gctx.textAlign = 'center';
  tTks.forEach(v => {
    if (v < -1e-9 || v > tMax + 1e-9) return;
    const gx = toX(v); if (gx < ox+pl || gx > ox+pl+iW) return;
    gctx.strokeStyle = axClr; gctx.lineWidth = 1;
    gctx.beginPath(); gctx.moveTo(gx, oy+pt+iH); gctx.lineTo(gx, oy+pt+iH+4); gctx.stroke();
    if (v > tMax * 0.03) { gctx.fillStyle = tkClr; gctx.fillText(fmtTick(v)+'s', gx, oy+pt+iH+16); }
  });

  gctx.save();
  gctx.translate(ox+9, oy+pt+iH/2); gctx.rotate(-Math.PI/2);
  gctx.textAlign = 'center'; gctx.fillStyle = lblClr;
  gctx.font = '700 9px "Space Mono",monospace';
  gctx.fillText(label, 0, 0);
  gctx.restore();

  series.forEach(s => {
    if (s.data.length < 2) return;
    gctx.strokeStyle = s.color; gctx.lineWidth = 1.5; gctx.lineJoin = 'round';
    gctx.beginPath();
    s.data.forEach((d, i) => { i === 0 ? gctx.moveTo(toX(d.t), toY(d.y)) : gctx.lineTo(toX(d.t), toY(d.y)); });
    gctx.stroke();
    const last = s.data[s.data.length - 1];
    gctx.beginPath(); gctx.arc(toX(last.t), toY(last.y), 2.5, 0, Math.PI*2);
    gctx.fillStyle = s.color; gctx.fill();
  });

  const ct = series[0]?.data[series[0].data.length-1]?.t ?? 0;
  if (ct > 0) {
    gctx.strokeStyle = dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)';
    gctx.lineWidth = 1; gctx.setLineDash([2, 2]);
    gctx.beginPath(); gctx.moveTo(toX(ct), oy+pt); gctx.lineTo(toX(ct), oy+pt+iH); gctx.stroke();
    gctx.setLineDash([]);
  }
}

/* ─── Readout ─────────────────────────────────────────────────── */
const readout = new Lab.Readout(document.getElementById('readout'), [
  { key:'t',     label:'tempo t'     },
  { key:'x',     label:'percorso x'     },
  { key:'v',     label:'velocità v'     },
  { key:'a',     label:'accelerazione a'     },
  { key:'N',     label:'reazione normale N'     },
  { key:'f',     label:'attrito f'     },
  { key:'stato', label:'stato' },
]);

function updateReadout() {
  const f = sim.forces;
  readout.set('t',     Lab.fmt(sim.t,2) + ' s');
  readout.set('x',     Lab.fmt(sim.x,2) + ' m');
  readout.set('v',     (sim.v >= 0 ? '+' : '') + Lab.fmt(sim.v,2) + ' m/s');
  readout.set('a',     Lab.fmt(sim._accel(sim.v),2) + ' m/s²');
  readout.set('N',     Lab.fmt(f.N,1) + ' N');
  readout.set('f',     Lab.fmt(Math.abs(f.fric),1) + ' N');
  readout.set('stato', sim.statusText);
}

/* ─── Controls ────────────────────────────────────────────────── */
let slMuK;

function buildControls() {
  const c = document.getElementById('controls');

  const secPendio = Lab.Section('Pendio');
  secPendio.add(Lab.SliderInput({
    label:'Angolo', min:0, max:89, value:params.angle, step:1, unit:'°',
    onChange(v) { params.angle = v; resetSim(); },
  }));
  c.appendChild(secPendio.el);

  const secCorpo = Lab.Section('Corpo');
  secCorpo.add(Lab.SliderInput({
    label:'Massa', min:0.5, max:20, value:params.mass, step:0.5, unit:'kg',
    onChange(v) { params.mass = v; resetSim(); },
  }));
  secCorpo.add(Lab.SliderInput({
    label:'Velocità iniziale', min:-8, max:10, value:params.initV, step:0.5, unit:'m/s',
    hint:'(− su · + giù)',
    onChange(v) { params.initV = v; resetSim(); },
  }));
  c.appendChild(secCorpo.el);

  const secAttr = Lab.Section('Attrito');
  secAttr.add(Lab.SliderInput({
    label:'μ statico (μs)', min:0, max:1.0, value:params.muS, step:0.01, unit:'',
    onChange(v) {
      params.muS = v;
      if (params.muK > params.muS) { params.muK = params.muS; slMuK?.setValue(v); }
      resetSim();
    },
  }));
  slMuK = Lab.SliderInput({
    label:'μ cinetico (μk)', min:0, max:1.0, value:params.muK, step:0.01, unit:'',
    hint:'(≤ μs)',
    onChange(v) { params.muK = Math.min(v, params.muS); resetSim(); },
  });
  secAttr.add(slMuK);
  c.appendChild(secAttr.el);

  const secAmb = Lab.Section('Ambiente');
  secAmb.add(Lab.RadioGroup({
    label:'Gravità', options:PLANETS_IP, value:params.planet,
    onChange(val) { params.planet = val; resetSim(); },
  }));
  c.appendChild(secAmb.el);

  const secVis = Lab.Section('Visualizzazione');
  secVis.add(Lab.Toggle({
    label:'Mostra forze', value:params.showForces,
    onChange(v) { params.showForces = v; draw(); },
  }));
  c.appendChild(secVis.el);
}

/* ─── Buttons ─────────────────────────────────────────────────── */
const btnPlay  = document.getElementById('btnPlay');
const btnReset = document.getElementById('btnReset');
btnPlay.addEventListener('click',  () => { running ? pauseSim() : startSim(); });
btnReset.addEventListener('click', resetSim);

/* ─── Utilities ───────────────────────────────────────────────── */
function niceTicks(min, max, n = 4) {
  const range = max - min; if (range <= 0) return [min];
  const raw = range / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag;
  const tks = [];
  for (let i = Math.ceil(min / step); i * step <= max + step * 0.001; i++) {
    const v = +(i * step).toPrecision(10);
    if (v >= min - step * 0.001) tks.push(v);
  }
  return tks;
}

function fmtTick(v) {
  if (v === 0) return '0';
  const a = Math.abs(v);
  const s = a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : a >= 1 ? v.toFixed(1) : v.toFixed(2);
  return (s.includes('.') ? s.replace(/\.?0+$/, '') : s).replace('.', ',').replace('-', '−');
}

/* ─── Resize handle ───────────────────────────────────────────── */
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

/* ─── Fullscreen ──────────────────────────────────────────────── */
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

/* ─── Theme ───────────────────────────────────────────────────── */
new MutationObserver(() => { draw(); drawGraphs(); })
  .observe(document.documentElement, { attributes:true, attributeFilter:['data-theme'] });

/* ─── Init ────────────────────────────────────────────────────── */
Lab.initTheme();
buildControls();
computeGraphRanges();
graphArea.style.height = (window.innerWidth < 800 ? 130 : 220) + 'px';
resizeAll();
updateReadout();
draw();
drawGraphs();
