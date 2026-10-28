/* Pendolo Balistico */

const G = 9.81;
const BULLET_TIME = 1.0;   // seconds for bullet to travel across canvas
const FLASH_DUR   = 0.25;  // impact flash duration

const params = { v0: 200, m: 0.020, M: 2.0, L: 1.2 };

// Derived physics
function Vpost()    { return params.m * params.v0 / (params.m + params.M); }
function thMax()    { const c = 1 - Vpost()**2 / (2*G*params.L); return Math.acos(Math.max(-1, Math.min(1, c))); }
function hMax()     { return params.L * (1 - Math.cos(thMax())); }
function KE0()      { return 0.5 * params.m * params.v0**2; }
function KE1()      { return 0.5 * (params.m + params.M) * Vpost()**2; }

// RK4 for pendulum: state = [theta, omega]
function rk4step(th, om, dt) {
  const a = t => -(G / params.L) * Math.sin(t);
  const k1v = om,          k1a = a(th);
  const k2v = om+k1a*dt/2, k2a = a(th+k1v*dt/2);
  const k3v = om+k2a*dt/2, k3a = a(th+k2v*dt/2);
  const k4v = om+k3a*dt,   k4a = a(th+k3v*dt);
  return [
    th + dt/6*(k1v + 2*k2v + 2*k3v + k4v),
    om + dt/6*(k1a + 2*k2a + 2*k3a + k4a),
  ];
}

// Simulation state
let phase = 'idle';   // 'idle' | 'bullet' | 'flash' | 'swing'
let bulletFrac = 0;   // 0→1 during bullet phase
let flashT = 0;
let theta = 0;        // pendulum angle (rad)
let omega = 0;
let simT  = 0;
let running = false;
let animId  = null;
let lastTs  = null;

// θ(t) history for graph
const MAX_HIST = 5400;
const thetaHist = [];  // {t, th}

function resetSim() {
  phase      = 'idle';
  bulletFrac = 0;
  flashT     = 0;
  theta      = 0;
  omega      = 0;
  simT       = 0;
  thetaHist.length = 0;
}

function stepSim(dt) {
  if (!running) return;

  if (phase === 'bullet') {
    bulletFrac += dt / BULLET_TIME;
    if (bulletFrac >= 1) {
      bulletFrac = 1;
      phase = 'flash';
      flashT = 0;
      // initial pendulum velocity from conservation of momentum
      omega = Vpost() / params.L;
      theta = 0;
    }
  } else if (phase === 'flash') {
    flashT += dt;
    if (flashT >= FLASH_DUR) {
      phase = 'swing';
      simT = 0;
    }
  } else if (phase === 'swing') {
    const SUBSTEPS = 8;
    const sub = dt / SUBSTEPS;
    for (let i = 0; i < SUBSTEPS; i++) {
      [theta, omega] = rk4step(theta, omega, sub);
    }
    simT += dt;
    if (thetaHist.length < MAX_HIST) {
      thetaHist.push({ t: simT, th: theta });
    }
  }
}

// ── Canvas setup ──────────────────────────────────────────────────────────────
const simCanvas = document.getElementById('simCanvas');
const simCtx    = simCanvas.getContext('2d');
const graphCanvas = document.getElementById('graphCanvas');
const graphCtx    = graphCanvas.getContext('2d');

let SW = 0, SH = 0;  // logical canvas dimensions
let GW = 0, GH = 0;

function isDark() { return document.documentElement.dataset.theme !== 'light'; }

function resizeCanvases() {
  const dpr = window.devicePixelRatio || 1;
  const par = simCanvas.parentElement;
  const gH  = document.getElementById('graphArea').offsetHeight || 200;
  const rH  = document.querySelector('.readout-bar')?.offsetHeight || 56;

  SW = par.clientWidth;
  SH = Math.max(120, par.clientHeight - gH - rH);
  simCanvas.width  = Math.round(SW * dpr);
  simCanvas.height = Math.round(SH * dpr);
  simCanvas.style.width  = SW + 'px';
  simCanvas.style.height = SH + 'px';
  simCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  GW = par.clientWidth;
  GH = document.getElementById('graphArea').clientHeight || 200;
  graphCanvas.width  = Math.round(GW * dpr);
  graphCanvas.height = Math.round(GH * dpr);
  graphCanvas.style.width  = GW + 'px';
  graphCanvas.style.height = GH + 'px';
  graphCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawGridBg(ctx, w, h) {
  ctx.strokeStyle = isDark() ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y <= h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
}

// ── Drawing helpers ───────────────────────────────────────────────────────────
function getColors() {
  const s = getComputedStyle(document.documentElement);
  return {
    bg:      s.getPropertyValue('--background').trim() || '#060a10',
    surface: s.getPropertyValue('--surface').trim()    || '#0d1520',
    text:    s.getPropertyValue('--text').trim()        || '#e8edf5',
    muted:   s.getPropertyValue('--text-muted').trim()  || '#4a5568',
    accent:  s.getPropertyValue('--accent').trim()      || '#00d4ff',
    grid:    s.getPropertyValue('--grid').trim()         || 'rgba(255,255,255,0.06)',
  };
}

const C_BOB    = '#00d4ff';
const C_BOB_D  = '#0099bb';
const C_BULLET = '#ffcc00';
const C_GHOST  = 'rgba(0,212,255,0.18)';
const C_SWING  = '#4488ff';
const C_ARC    = '#ff8844';

function drawScene() {
  const ctx = simCtx;
  const col = getColors();
  ctx.clearRect(0, 0, SW, SH);
  drawGridBg(ctx, SW, SH);

  // pivot position: centre-x, 12% from top
  const px = SW / 2;
  const py = SH * 0.12;
  const Lpx = params.L * 160;  // pixels per metre

  // Ghost at θ_max
  const th_max = thMax();
  if (th_max > 0.005) {
    const gx = px + Lpx * Math.sin(th_max);
    const gy = py + Lpx * Math.cos(th_max);
    const bobR = 22;
    // ghost string
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = C_GHOST;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(gx, gy);
    ctx.stroke();
    ctx.setLineDash([]);
    // ghost bob
    ctx.beginPath();
    ctx.arc(gx, gy, bobR, 0, Math.PI*2);
    ctx.fillStyle = C_GHOST;
    ctx.fill();
    // ghost h_max label
    ctx.fillStyle = col.muted;
    ctx.font = '11px Space Mono, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('h = ' + Lab.fmt(hMax(),3) + ' m', gx + bobR + 6, gy);
    ctx.restore();
  }

  // Angle arc (only during/after swing)
  if ((phase === 'swing' || phase === 'flash') && th_max > 0.005) {
    const arcR = Lpx * 0.35;
    const strA = Math.PI/2 - theta;  // canvas angle of string (y-down)
    const refA  = Math.PI/2;         // straight down = π/2

    ctx.save();
    ctx.strokeStyle = C_ARC;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    // vertical reference line from pivot
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, py + arcR + 14);
    ctx.stroke();
    ctx.setLineDash([]);
    // arc from vertical to current string angle
    if (Math.abs(theta) > 0.01) {
      ctx.beginPath();
      ctx.arc(px, py, arcR, strA, refA, theta < 0);
      ctx.stroke();
      // label at midpoint of arc
      const midA = (strA + refA) / 2;
      const lx = px + (arcR + 20) * Math.cos(midA);
      const ly = py + (arcR + 20) * Math.sin(midA);
      ctx.font = 'bold 12px Space Mono, monospace';
      ctx.fillStyle = C_ARC;
      ctx.textAlign = 'center';
      ctx.fillText(Lab.fmt((Math.abs(theta) * 180/Math.PI),1) + '°', lx, ly);
    }
    ctx.restore();
  }

  // Current bob position
  const bobX = px + Lpx * Math.sin(theta);
  const bobY = py + Lpx * Math.cos(theta);
  const bobR = 22;

  // String
  ctx.save();
  ctx.strokeStyle = col.text;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(bobX, bobY);
  ctx.stroke();

  // Pivot
  ctx.beginPath();
  ctx.arc(px, py, 5, 0, Math.PI*2);
  ctx.fillStyle = col.muted;
  ctx.fill();
  ctx.restore();

  // Bob gradient
  const grad = simCtx.createRadialGradient(bobX-5, bobY-5, 2, bobX, bobY, bobR);
  grad.addColorStop(0, '#88eeff');
  grad.addColorStop(1, C_BOB_D);
  ctx.beginPath();
  ctx.arc(bobX, bobY, bobR, 0, Math.PI*2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = C_BOB;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Bob mass label
  ctx.fillStyle = '#000';
  ctx.font = 'bold 11px DM Sans, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('M', bobX, bobY);
  ctx.textBaseline = 'alphabetic';

  // Flash effect at impact
  if (phase === 'flash') {
    const alpha = Math.max(0, 1 - flashT/FLASH_DUR);
    ctx.save();
    ctx.beginPath();
    ctx.arc(bobX, bobY, bobR + 18 * (1-alpha), 0, Math.PI*2);
    ctx.fillStyle = `rgba(255, 220, 60, ${alpha * 0.5})`;
    ctx.fill();
    ctx.restore();
  }

  // Bullet (animated across canvas during 'bullet' phase)
  if (phase === 'bullet') {
    // bullet travels from left edge to bob
    const startX = -20;
    const endX   = bobX - bobR - 2;
    const bx = startX + bulletFrac * (endX - startX);
    const by = bobY;  // same height as bob centre
    ctx.save();
    ctx.beginPath();
    ctx.arc(bx, by, 5, 0, Math.PI*2);
    ctx.fillStyle = C_BULLET;
    ctx.shadowColor = C_BULLET;
    ctx.shadowBlur = 10;
    ctx.fill();
    // motion trail
    for (let i = 1; i <= 4; i++) {
      const tx = bx - i * 10;
      ctx.beginPath();
      ctx.arc(tx, by, 5 - i*0.8, 0, Math.PI*2);
      ctx.fillStyle = `rgba(255,204,0,${0.25 - i*0.05})`;
      ctx.fill();
    }
    ctx.restore();
  }

  // Idle state hint
  if (phase === 'idle') {
    ctx.fillStyle = col.muted;
    ctx.font = '13px DM Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Premi AVVIA per lanciare il proiettile', SW/2, SH * 0.88);
  }

  // θ_max annotation (when stopped at maximum)
  if (phase === 'swing' && th_max > 0.005) {
    ctx.fillStyle = col.muted;
    ctx.font = '12px Space Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('θ_max = ' + Lab.fmt((th_max * 180/Math.PI),1) + '°', SW/2, SH * 0.96);
  }
}

// ── Graph utilities ───────────────────────────────────────────────────────────
function niceTicks(mn, mx, n = 4) {
  const r = mx - mn; if (r <= 0) return [mn];
  const raw = r / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const nm = raw / mag;
  const step = (nm < 1.5 ? 1 : nm < 3.5 ? 2 : nm < 7.5 ? 5 : 10) * mag;
  const tks = [];
  for (let i = Math.ceil(mn/step); i*step <= mx+step*0.001; i++) {
    const v = +(i*step).toPrecision(10);
    if (v >= mn - step*0.001) tks.push(v);
  }
  return tks;
}
function fmtTick(v) {
  if (v === 0) return '0';
  const a = Math.abs(v);
  const s = a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : a >= 1 ? v.toFixed(1) : v.toFixed(2);
  return (s.includes('.') ? s.replace(/\.?0+$/, '') : s).replace('.', ',').replace('-', '−');
}

// ── Graphs ────────────────────────────────────────────────────────────────────
function drawGraphs() {
  const ctx = graphCtx;
  const dk  = isDark();
  ctx.clearRect(0, 0, GW, GH);

  const half = Math.floor(GW / 2);
  drawEnergyPanel(ctx, dk, 0,    0, half,     GH);
  drawThetaPanel (ctx, dk, half, 0, GW-half,  GH);

  ctx.strokeStyle = dk ? 'rgba(0,212,255,0.08)' : 'rgba(0,100,160,0.10)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(half, 0); ctx.lineTo(half, GH); ctx.stroke();
}

function drawEnergyPanel(ctx, dk, ox, oy, pw, ph) {
  const PAD = { t: 22, b: 28, l: 44, r: 12 };
  const il = ox + PAD.l, it = oy + PAD.t, iw = pw - PAD.l - PAD.r, ih = ph - PAD.t - PAD.b;
  const axC = dk ? 'rgba(200,220,255,0.35)' : 'rgba(0,0,0,0.28)';
  const tkC = dk ? '#6b8099' : '#4a6278';

  ctx.fillStyle = dk ? '#0b1018' : '#f0f2f5';
  ctx.fillRect(ox, oy, pw, ph);
  ctx.fillStyle = dk ? 'rgba(200,220,255,0.50)' : 'rgba(40,60,100,0.50)';
  ctx.font = "10px 'Space Mono',monospace"; ctx.textAlign = 'center';
  ctx.fillText('ENERGIA CINETICA', ox + pw/2, oy + 14);

  const ke0    = KE0(), ke1 = KE1();
  const maxKE  = Math.max(ke0, 1e-6);
  const barW   = Math.min(Math.floor(iw * 0.30), 50);
  const gapBar = Math.floor(iw * 0.14);
  const bx0    = il + (iw - 2*barW - gapBar) / 2;
  const bx1    = bx0 + barW + gapBar;
  const baseY  = it + ih;
  const hasSwung = phase === 'swing' || phase === 'flash';

  function bar(x, val, color, lbl) {
    const bh = Math.max(0, (val / maxKE) * ih);
    ctx.fillStyle = color; ctx.fillRect(x, baseY - bh, barW, bh);
    ctx.fillStyle = color; ctx.font = '700 9px "Space Mono",monospace';
    ctx.textAlign = 'center';
    ctx.fillText(Lab.fmt(val,1) + ' J', x + barW/2, baseY - bh - 4);
    ctx.fillStyle = tkC; ctx.font = '9px "Space Mono",monospace';
    ctx.fillText(lbl, x + barW/2, baseY + 16);
  }

  bar(bx0, ke0, '#ff8844', 'Prima');
  bar(bx1, hasSwung ? ke1 : 0, C_BOB, 'Dopo');

  if (hasSwung) {
    ctx.fillStyle = tkC; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
    ctx.fillText('ΔKE = −' + Lab.fmt((ke0-ke1),2) + ' J', ox + pw/2, it + ih - 4);
  }

  ctx.strokeStyle = axC; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(il, baseY); ctx.lineTo(il + iw, baseY); ctx.stroke();
  ctx.strokeStyle = dk ? 'rgba(200,220,255,0.35)' : 'rgba(0,0,0,0.28)';
  ctx.strokeRect(il, it, iw, ih);
}

function drawThetaPanel(ctx, dk, ox, oy, pw, ph) {
  const PAD = { t: 22, b: 26, l: 44, r: 10 };
  const il = ox + PAD.l, it = oy + PAD.t, iw = pw - PAD.l - PAD.r, ih = ph - PAD.t - PAD.b;
  const axC = dk ? 'rgba(200,220,255,0.35)' : 'rgba(0,0,0,0.28)';
  const grC = dk ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const tkC = dk ? '#6b8099' : '#4a6278';
  const lbC = dk ? '#6b8099' : '#4a6278';

  ctx.fillStyle = dk ? '#0b1018' : '#f0f2f5';
  ctx.fillRect(ox, oy, pw, ph);
  ctx.fillStyle = dk ? 'rgba(200,220,255,0.50)' : 'rgba(40,60,100,0.50)';
  ctx.font = "10px 'Space Mono',monospace"; ctx.textAlign = 'center';
  ctx.fillText('θ (°)', ox + pw/2, oy + 14);

  // y-axis: show θ in degrees, range 0 → θ_max * 1.1
  const th_max = thMax();
  const yMax   = Math.max(th_max * 180/Math.PI * 1.12, 5);
  const yTks   = niceTicks(0, yMax, 4);
  const toY    = v => it + ih - (v / yMax) * ih;

  // x-axis: sliding window — 2 periods
  const Tperiod  = 2 * Math.PI * Math.sqrt(params.L / G);
  const tRange   = Math.max(Tperiod * 2, 2.0);
  const tCurrent = simT;
  const tEnd     = Math.max(tCurrent, tRange);
  const tStart   = tEnd - tRange;
  const tTks     = niceTicks(tStart, tEnd, 4);
  const toX      = t => il + ((t - tStart) / tRange) * iw;

  // grid
  yTks.forEach(v => {
    if (v < 0 || v > yMax + 1e-9) return;
    const gy = toY(v);
    ctx.strokeStyle = v < 1e-9 ? axC : grC; ctx.lineWidth = v < 1e-9 ? 1.5 : 1;
    ctx.beginPath(); ctx.moveTo(il, gy); ctx.lineTo(il + iw, gy); ctx.stroke();
  });
  tTks.forEach(v => {
    const gx = toX(v); if (gx < il || gx > il + iw) return;
    ctx.strokeStyle = grC; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(gx, it); ctx.lineTo(gx, it + ih); ctx.stroke();
  });

  // θ_max reference dashed line
  if (th_max > 0.01) {
    const ymx = toY(th_max * 180/Math.PI);
    if (ymx >= it && ymx <= it + ih) {
      ctx.save(); ctx.setLineDash([4, 4]);
      ctx.strokeStyle = C_ARC; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(il, ymx); ctx.lineTo(il + iw, ymx); ctx.stroke();
      ctx.setLineDash([]); ctx.restore();
      ctx.fillStyle = C_ARC; ctx.font = '700 8px "Space Mono",monospace';
      ctx.textAlign = 'left';
      ctx.fillText(Lab.fmt((th_max*180/Math.PI),1)+'°', il + 3, ymx - 3);
    }
  }

  ctx.strokeStyle = axC; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(il, it); ctx.lineTo(il, it + ih); ctx.stroke();
  ctx.strokeStyle = dk ? 'rgba(200,220,255,0.35)' : 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 1; ctx.strokeRect(il, it, iw, ih);

  // tick labels
  ctx.font = '700 9px "Space Mono",monospace'; ctx.textAlign = 'right';
  yTks.forEach(v => {
    if (v < 0 || v > yMax + 1e-9) return;
    const gy = toY(v);
    ctx.strokeStyle = axC; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(il - 4, gy); ctx.lineTo(il, gy); ctx.stroke();
    ctx.fillStyle = tkC; ctx.fillText(fmtTick(v) + '°', il - 6, gy + 4);
  });
  ctx.textAlign = 'center';
  tTks.forEach(v => {
    const gx = toX(v); if (gx < il || gx > il + iw) return;
    ctx.strokeStyle = axC; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(gx, it + ih); ctx.lineTo(gx, it + ih + 4); ctx.stroke();
    if (v > tStart + tRange * 0.03) { ctx.fillStyle = tkC; ctx.fillText(fmtTick(v) + 's', gx, it + ih + 16); }
  });

  ctx.save();
  ctx.translate(ox + 10, it + ih/2); ctx.rotate(-Math.PI/2);
  ctx.textAlign = 'center'; ctx.fillStyle = lbC;
  ctx.font = '700 9px "Space Mono",monospace';
  ctx.fillText('θ (°)', 0, 0);
  ctx.restore();

  if (thetaHist.length < 2) return;

  // draw curve, clipped, only data in [tStart, tEnd]
  ctx.save();
  ctx.beginPath(); ctx.rect(il, it, iw, ih); ctx.clip();

  const data = thetaHist.filter(d => d.t >= tStart - 0.05);
  ctx.beginPath();
  ctx.strokeStyle = C_SWING; ctx.lineWidth = 1.8; ctx.lineJoin = 'round';
  data.forEach((pt, i) => {
    const gx = toX(pt.t), gy = toY(Math.abs(pt.th) * 180/Math.PI);
    i === 0 ? ctx.moveTo(gx, gy) : ctx.lineTo(gx, gy);
  });
  ctx.stroke();

  // time cursor
  if (tCurrent > 0) {
    ctx.strokeStyle = dk ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)';
    ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
    ctx.beginPath(); ctx.moveTo(toX(tCurrent), it); ctx.lineTo(toX(tCurrent), it + ih); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();

  // current value dot (outside clip so always fully visible)
  const last = thetaHist[thetaHist.length - 1];
  if (last) {
    const lx = Math.max(il, Math.min(il + iw, toX(last.t)));
    const ly = Math.max(it, Math.min(it + ih, toY(Math.abs(last.th) * 180/Math.PI)));
    ctx.beginPath(); ctx.arc(lx, ly, 3, 0, Math.PI*2);
    ctx.fillStyle = C_SWING; ctx.fill();
  }
}

// ── Readout ───────────────────────────────────────────────────────────────────
const readout = new Lab.Readout(document.getElementById('readout'), [
  { key: 'v0',    label: 'velocità proiettile v₀' },
  { key: 'vpost', label: 'velocità dopo l’urto' },
  { key: 'thmax', label: 'angolo massimo' },
  { key: 'hmax',  label: 'altezza massima' },
  { key: 'ke0',   label: 'energia cinetica iniziale' },
  { key: 'dke',   label: 'energia dissipata' },
]);

function updateReadout() {
  readout.set('v0',    Lab.fmt(params.v0,0) + ' m/s');
  readout.set('vpost', Lab.fmt(Vpost(),3) + ' m/s');
  readout.set('thmax', Lab.fmt((thMax()*180/Math.PI),2) + '°');
  readout.set('hmax',  Lab.fmt(hMax(),4) + ' m');
  readout.set('ke0',   Lab.fmt(KE0(),2) + ' J');
  readout.set('dke',   '−' + Lab.fmt((KE0()-KE1()),2) + ' J');
}

// ── Controls ──────────────────────────────────────────────────────────────────
function buildControls() {
  const cont = document.getElementById('controls');
  cont.innerHTML = '';

  const secBullet = Lab.Section('Proiettile');
  const slV0 = Lab.Slider({ label: 'Velocità v₀', min: 50, max: 600, value: params.v0, step: 10, unit: ' m/s', onChange: v => { params.v0 = v; onParamChange(); } });
  const slM  = Lab.Slider({ label: 'Massa m', min: 5, max: 100, value: params.m*1000, step: 5, unit: ' g', onChange: v => { params.m = v/1000; onParamChange(); } });
  secBullet.add(slV0).add(slM);

  const secPend = Lab.Section('Pendolo');
  const slBobM = Lab.Slider({ label: 'Massa M', min: 0.5, max: 10, value: params.M, step: 0.5, unit: ' kg', onChange: v => { params.M = v; onParamChange(); } });
  const slL    = Lab.Slider({ label: 'Lunghezza L', min: 0.3, max: 3.0, value: params.L, step: 0.1, unit: ' m', onChange: v => { params.L = v; onParamChange(); } });
  secPend.add(slBobM).add(slL);

  cont.appendChild(secBullet.el);
  cont.appendChild(secPend.el);
}

function onParamChange() {
  if (running) stopSim();
  resetSim();
  updateReadout();
  drawScene();
  drawGraphs();
}

// ── Animation loop ────────────────────────────────────────────────────────────
function tick(ts) {
  if (!running) return;
  if (lastTs === null) lastTs = ts;
  const raw = (ts - lastTs) / 1000;
  lastTs = ts;
  const dt = Math.min(raw, 0.05);

  stepSim(dt);
  drawScene();
  drawGraphs();
  updateReadout();

  if (phase === 'swing' && simT > 60) {
    running = false;
    lastTs  = null;
    document.getElementById('btnPlay').textContent = '▶  AVVIA';
    return;
  }

  animId = requestAnimationFrame(tick);
}

function startSim() {
  if (running) return;
  if (phase === 'idle') resetSim();
  running = true;
  phase   = 'bullet';
  lastTs  = null;
  document.getElementById('btnPlay').textContent = '⏸  PAUSA';
  animId = requestAnimationFrame(tick);
}

function stopSim() {
  running = false;
  lastTs  = null;
  if (animId) { cancelAnimationFrame(animId); animId = null; }
  document.getElementById('btnPlay').textContent = '▶  AVVIA';
}

// ── Init ──────────────────────────────────────────────────────────────────────
Lab.initTheme();
buildControls();
updateReadout();

new ResizeObserver(() => { resizeCanvases(); drawScene(); drawGraphs(); }).observe(simCanvas.parentElement);
new MutationObserver(() => { drawScene(); drawGraphs(); })
  .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

document.getElementById('btnPlay').addEventListener('click', () => {
  if (running) stopSim();
  else startSim();
});

document.getElementById('btnReset').addEventListener('click', () => {
  stopSim();
  resetSim();
  updateReadout();
  drawScene();
  drawGraphs();
});

// Initial draw after layout settles
requestAnimationFrame(() => {
  resizeCanvases();
  drawScene();
  drawGraphs();
});
