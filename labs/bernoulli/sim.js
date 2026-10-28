/* Equazione di Bernoulli — Tubo di Flusso */
'use strict';

const P_ATM    = 101325;   // Pa
const G        = 9.81;     // m/s²
const TUBE_LEN = 3.0;      // effective physical length for particle speed (m)

const FLUIDS = {
  acqua: { rho: 1000,  label: 'Acqua',        hint: '1000 kg/m³' },
  olio:  { rho: 900,   label: 'Olio minerale', hint: '900 kg/m³'  },
  aria:  { rho: 1.225, label: 'Aria',           hint:'1,2 kg/m³'  },
};

const params = {
  r1:    0.14,    // section 1 radius, m
  r2:    0.08,    // section 2 radius, m
  v1:    1.5,     // inlet velocity, m/s
  y1:    0.5,     // height at section 1, m
  y2:    2.5,     // height at section 2, m
  P1:    200000,  // inlet pressure, Pa
  fluid: 'acqua',
};

// ── Physics ───────────────────────────────────────────────────────────────────
function rho() { return FLUIDS[params.fluid].rho; }

// Tube profile: constant sections bookending a smooth taper over middle 56 %
const SEG = { L1: 0.22, T2: 0.78 };

function localR(t) {
  if (t <= SEG.L1) return params.r1;
  if (t >= SEG.T2) return params.r2;
  const s  = (t - SEG.L1) / (SEG.T2 - SEG.L1);
  const sm = s * s * (3 - 2 * s);
  return params.r1 + (params.r2 - params.r1) * sm;
}

function localY(t) {   // physical height of tube centerline at t
  if (t <= SEG.L1) return params.y1;
  if (t >= SEG.T2) return params.y2;
  const s  = (t - SEG.L1) / (SEG.T2 - SEG.L1);
  const sm = s * s * (3 - 2 * s);
  return params.y1 + (params.y2 - params.y1) * sm;
}

function localV(t) {
  const r = localR(t);
  return params.v1 * (params.r1 / r) ** 2;
}

function localP(t) {
  const v = localV(t), y = localY(t);
  return params.P1
       + 0.5 * rho() * (params.v1 ** 2 - v ** 2)
       + rho() * G * (params.y1 - y);
}

function v2()        { return localV(1); }
function p2()        { return localP(1); }
function bernoulli() { return params.P1 + 0.5 * rho() * params.v1 ** 2 + rho() * G * params.y1; }

// ── Particles ─────────────────────────────────────────────────────────────────
const LANES = [-0.70, -0.42, -0.14, 0.14, 0.42, 0.70];
const PPC   = 9;
const parts = [];

function initParts() {
  parts.length = 0;
  LANES.forEach(f => {
    for (let i = 0; i < PPC; i++) {
      parts.push({ t: (i + Math.random() * 0.8) / PPC, f });
    }
  });
}

function stepParts(dt) {
  for (const p of parts) {
    p.t += localV(p.t) / TUBE_LEN * dt;
    if (p.t > 1) p.t -= 1;
  }
}

// ── Canvas / layout ───────────────────────────────────────────────────────────
const simCv  = document.getElementById('simCanvas');
const simCtx = simCv.getContext('2d');
const grCv   = document.getElementById('graphCanvas');
const grCtx  = grCv.getContext('2d');

let SW = 0, SH = 0, GW = 0, GH = 0;
let TL = 0, TR = 0, BASELINE = 0, YPXM = 0, RSCALE = 0;

function isDark() { return document.documentElement.dataset.theme !== 'light'; }

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const par = simCv.parentElement;
  const gH  = document.getElementById('graphArea').offsetHeight || 200;
  const rH  = document.querySelector('.readout-bar')?.offsetHeight || 56;

  SW = par.clientWidth;
  SH = Math.max(140, par.clientHeight - gH - rH);
  simCv.width  = Math.round(SW * dpr);
  simCv.height = Math.round(SH * dpr);
  simCv.style.width  = SW + 'px';
  simCv.style.height = SH + 'px';
  simCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  GW = par.clientWidth;
  GH = document.getElementById('graphArea').clientHeight || 200;
  grCv.width  = Math.round(GW * dpr);
  grCv.height = Math.round(GH * dpr);
  grCv.style.width  = GW + 'px';
  grCv.style.height = GH + 'px';
  grCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  recomputeLayout();
}

function recomputeLayout() {
  TL       = 88;
  TR       = SW - 55;
  BASELINE = SH - 38;

  // YPXM: pixels/m for height — ensure the tallest section + its radius fits
  const yTop   = Math.max(params.y1, params.y2) + Math.max(params.r1, params.r2) + 0.4;
  const availH = BASELINE - 28;
  YPXM = Math.min(68, availH * 0.68 / yTop);

  // RSCALE: pixels/m for tube radius — independent of height scale so tubes look thick
  const rMax = Math.max(params.r1, params.r2);
  RSCALE = Math.min(260, (SH * 0.20) / rMax);
}

// ── Coordinate helpers ────────────────────────────────────────────────────────
function tubeCX(t)      { return TL + t * (TR - TL); }
function tubeCenY(t)    { return BASELINE - localY(t) * YPXM; }
function tubeTopY(t)    { return tubeCenY(t) - localR(t) * RSCALE; }
function tubeBotY(t)    { return tubeCenY(t) + localR(t) * RSCALE; }

// ── Scene helpers ─────────────────────────────────────────────────────────────
function getCol() {
  const s = getComputedStyle(document.documentElement);
  const g = k => s.getPropertyValue(k).trim();
  return {
    text:   g('--text')       || '#e8edf5',
    muted:  g('--text-muted') || '#4a5568',
    accent: g('--accent')     || '#00d4ff',
  };
}

function drawGridBg(ctx, w, h) {
  ctx.strokeStyle = isDark() ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y <= h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
}

function velColor(v, vmax) {
  const t = Math.max(0, Math.min(1, v / vmax));
  return `hsl(${200 - t * 170}, 100%, ${52 + t * 12}%)`;
}

// ── Scene ─────────────────────────────────────────────────────────────────────
const N = 100;

function drawScene() {
  const ctx = simCtx;
  const col = getCol();
  ctx.clearRect(0, 0, SW, SH);
  drawGridBg(ctx, SW, SH);
  recomputeLayout();

  const ts = Array.from({ length: N + 1 }, (_, i) => i / N);

  // ── Ground / x-axis ──────────────────────────────────────────────────────
  const axCol = isDark() ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.20)';
  ctx.strokeStyle = axCol; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(TL - 24, BASELINE); ctx.lineTo(TR + 8, BASELINE); ctx.stroke();
  ctx.fillStyle = axCol;
  ctx.beginPath();
  ctx.moveTo(TR + 13, BASELINE);
  ctx.lineTo(TR + 5,  BASELINE - 4);
  ctx.lineTo(TR + 5,  BASELINE + 4);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = axCol;
  ctx.font = '9px Space Mono, monospace'; ctx.textAlign = 'left';
  ctx.fillText('x', TR + 16, BASELINE + 3);

  // ── y-axis ticks ─────────────────────────────────────────────────────────
  const yMax  = Math.max(params.y1, params.y2) + Math.max(params.r1, params.r2) * 1.2;
  const yStep = yMax > 3 ? 1 : yMax > 1.5 ? 0.5 : 0.25;
  const tickCol  = isDark() ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
  const tickLblC = isDark() ? '#5a7090' : '#6a7898';
  ctx.font = '9px Space Mono, monospace'; ctx.textAlign = 'right';
  for (let y = 0; y <= yMax + 0.01; y += yStep) {
    const cy = BASELINE - y * YPXM;
    if (cy < 10 || cy > BASELINE + 2) continue;
    ctx.strokeStyle = tickCol; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(TL - 16, cy); ctx.lineTo(TL - 5, cy); ctx.stroke();
    ctx.fillStyle = tickLblC;
    ctx.fillText(Lab.fmt(y,1), TL - 18, cy + 3);
  }
  // y-axis label
  const midYpx = BASELINE - Math.max(params.y1, params.y2) * YPXM * 0.5;
  ctx.save();
  ctx.translate(TL - 60, midYpx); ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center'; ctx.fillStyle = tickLblC;
  ctx.fillText('y (m)', 0, 0);
  ctx.restore();

  // ── Height dashed markers ─────────────────────────────────────────────────
  [[0, params.y1, '₁'], [1, params.y2, '₂']].forEach(([t, phy_y, sub]) => {
    const cx     = tubeCX(t);
    const cyBot  = tubeBotY(t);
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = isDark() ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, cyBot + 4); ctx.lineTo(cx, BASELINE); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    if (phy_y > 0.05) {
      const mid = (cyBot + 4 + BASELINE) / 2;
      ctx.fillStyle = tickLblC;
      ctx.font = '700 9px Space Mono, monospace'; ctx.textAlign = 'center';
      ctx.fillText('y' + sub + '=' + Lab.fmt(phy_y,1) + ' m', cx + (t === 0 ? 20 : -20), mid);
    }
  });

  // ── Fluid fill ────────────────────────────────────────────────────────────
  ctx.beginPath();
  ts.forEach((t, i) => {
    i === 0 ? ctx.moveTo(tubeCX(t), tubeTopY(t))
            : ctx.lineTo(tubeCX(t), tubeTopY(t));
  });
  for (let i = N; i >= 0; i--) ctx.lineTo(tubeCX(i / N), tubeBotY(i / N));
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,100,210,0.13)';
  ctx.fill();

  // ── Streamlines ───────────────────────────────────────────────────────────
  LANES.forEach(f => {
    ctx.beginPath();
    ts.forEach((t, i) => {
      const x = tubeCX(t);
      const y = tubeCenY(t) + f * localR(t) * RSCALE * 0.88;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = 'rgba(0,160,255,0.09)'; ctx.lineWidth = 1;
    ctx.stroke();
  });

  // ── Tube walls ────────────────────────────────────────────────────────────
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ts.forEach((t, i) => {
      const x = tubeCX(t);
      const y = tubeCenY(t) + side * localR(t) * RSCALE;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = col.text; ctx.lineWidth = 2.5; ctx.stroke();
  }
  for (const t of [0, 1]) {
    ctx.beginPath();
    ctx.moveTo(tubeCX(t), tubeTopY(t));
    ctx.lineTo(tubeCX(t), tubeBotY(t));
    ctx.strokeStyle = col.text; ctx.lineWidth = 2.5; ctx.stroke();
  }

  // ── Inlet chevrons ────────────────────────────────────────────────────────
  const inCX = tubeCX(0), inCY = tubeCenY(0), inR = params.r1 * RSCALE;
  for (let k = -1; k <= 1; k++) {
    const arY = inCY + k * inR * 0.40;
    ctx.strokeStyle = 'rgba(0,180,255,0.30)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(inCX - 22, arY - 5); ctx.lineTo(inCX - 12, arY); ctx.lineTo(inCX - 22, arY + 5);
    ctx.stroke();
  }

  // ── Particles ─────────────────────────────────────────────────────────────
  const vmax = Math.max(params.v1, v2()) * 1.05;
  for (const p of parts) {
    ctx.beginPath();
    ctx.arc(tubeCX(p.t), tubeCenY(p.t) + p.f * localR(p.t) * RSCALE * 0.88, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = velColor(localV(p.t), vmax);
    ctx.fill();
  }

  // ── Section measurement markers ───────────────────────────────────────────
  const p1v = params.P1, p2v = p2();
  const Pvals = [p1v, p2v];
  const Vvals = [params.v1, v2()];
  const Pmax  = Math.max(p1v, p2v, P_ATM) * 1.04;
  const BAR_H = Math.max(22, Math.min(62, Math.min(tubeTopY(0), tubeTopY(1)) - 18));

  [[0, '₁', '#4488ff'], [1, '₂', '#ffaa44']].forEach(([t, sub, sColor]) => {
    const mx    = tubeCX(t);
    const topY  = tubeTopY(t);
    const botY  = tubeBotY(t);
    const P     = Pvals[t];
    const V     = Vvals[t];
    const isLow = P < P_ATM;

    // Dashed guide line through tube
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(mx, topY - 4); ctx.lineTo(mx, botY + 4); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Pressure bar above tube
    const barW  = 18;
    const boxY  = topY - 10 - BAR_H;
    const barH  = Math.max(0, (P / Pmax) * BAR_H);
    const fillY = topY - 10 - barH;
    ctx.strokeStyle = isLow ? '#ff6060' : col.accent; ctx.lineWidth = 1.5;
    ctx.strokeRect(mx - barW / 2, boxY, barW, BAR_H);
    ctx.fillStyle = isLow ? 'rgba(255,80,80,0.45)' : 'rgba(0,180,255,0.38)';
    ctx.fillRect(mx - barW / 2, fillY, barW, barH);
    ctx.fillStyle = isLow ? '#ff7070' : col.accent;
    ctx.font = 'bold 10px Space Mono, monospace'; ctx.textAlign = 'center';
    ctx.fillText(Lab.fmt((P / 1000),1) + ' kPa', mx, boxY - 4);
    ctx.fillStyle = col.muted; ctx.font = '9px Space Mono, monospace';
    ctx.fillText('P' + sub, mx, boxY - 14);

    // Section label below end cap
    ctx.fillStyle = sColor;
    ctx.font = '700 9px Space Mono, monospace';
    ctx.fillText('Sez.' + sub, mx, botY + 10);

    // Velocity arrow below section label
    const VSCALE = 12;
    const alen   = Math.min(V * VSCALE, 70);
    const arY    = botY + 24;
    ctx.strokeStyle = '#ffaa44'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(mx - alen / 2, arY); ctx.lineTo(mx + alen / 2, arY); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mx + alen / 2, arY);
    ctx.lineTo(mx + alen / 2 - 6, arY - 4);
    ctx.lineTo(mx + alen / 2 - 6, arY + 4);
    ctx.closePath(); ctx.fillStyle = '#ffaa44'; ctx.fill();
    ctx.fillStyle = '#ffaa44';
    ctx.font = '10px Space Mono, monospace'; ctx.textAlign = 'center';
    ctx.fillText(Lab.fmt(V,2) + ' m/s', mx, arY + 15);
  });

  // ── Cavitation warning ────────────────────────────────────────────────────
  if (p2v < 0) {
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 11px DM Sans, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('⚠ Cavitazione: P₂ < 0  (regime non fisico)', SW / 2, BASELINE - 8);
  }

  // ── Bernoulli annotation ──────────────────────────────────────────────────
  ctx.fillStyle = col.muted;
  ctx.font = '10px Space Mono, monospace'; ctx.textAlign = 'left';
  ctx.fillText(
    'P + ½ρv² + ρgy = ' + (bernoulli() / 1000).toFixed(1) + ' kPa  (costante)',
    TL + 4, BASELINE - 8
  );
}

// ── Graph utilities ───────────────────────────────────────────────────────────
function niceTicks(mn, mx, n = 4) {
  const r = mx - mn; if (r <= 0) return [mn];
  const raw = r / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const nm  = raw / mag;
  const step = (nm < 1.5 ? 1 : nm < 3.5 ? 2 : nm < 7.5 ? 5 : 10) * mag;
  const tks = [];
  for (let i = Math.ceil(mn / step); i * step <= mx + step * 0.001; i++) {
    const v = +(i * step).toPrecision(10);
    if (v >= mn - step * 0.001) tks.push(v);
  }
  return tks;
}
function fmtTick(v) {
  if (v === 0) return '0';
  const a = Math.abs(v);
  const s = a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : a >= 1 ? v.toFixed(1) : v.toFixed(2);
  return (s.includes('.') ? s.replace(/\.?0+$/, '') : s).replace('.', ',').replace('-', '−');
}

// ── Shared bar-chart panel ────────────────────────────────────────────────────
function drawBarPanel(ctx, dk, ox, oy, pw, ph, title, bars, yLabel, yMin, yMax, refLine) {
  const PAD = { t: 22, b: 28, l: 46, r: 10 };
  const il = ox + PAD.l, it = oy + PAD.t, iw = pw - PAD.l - PAD.r, ih = ph - PAD.t - PAD.b;
  const axC = dk ? 'rgba(200,220,255,0.35)' : 'rgba(0,0,0,0.28)';
  const grC = dk ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const tkC = dk ? '#6b8099' : '#4a6278';
  const lbC = dk ? '#6b8099' : '#4a6278';

  ctx.fillStyle = dk ? '#0b1018' : '#f0f2f5';
  ctx.fillRect(ox, oy, pw, ph);

  ctx.fillStyle = dk ? 'rgba(200,220,255,0.50)' : 'rgba(40,60,100,0.50)';
  ctx.font = "10px 'Space Mono',monospace"; ctx.textAlign = 'center';
  ctx.fillText(title, ox + pw / 2, oy + 14);

  const span = yMax - yMin || 1;
  const toY  = v => it + ih - (v - yMin) / span * ih;
  const yTks = niceTicks(yMin, yMax, 4);

  // Horizontal grid lines
  yTks.forEach(v => {
    if (v < yMin - 1e-9 || v > yMax + 1e-9) return;
    const gy = toY(v);
    ctx.strokeStyle = grC; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(il, gy); ctx.lineTo(il + iw, gy); ctx.stroke();
  });

  // Reference line (e.g. Patm)
  if (refLine !== undefined) {
    const rv = refLine;
    if (rv >= yMin && rv <= yMax) {
      const gy = toY(rv);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = axC; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(il, gy); ctx.lineTo(il + iw, gy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      ctx.fillStyle = tkC; ctx.font = '700 8px "Space Mono",monospace'; ctx.textAlign = 'left';
      ctx.fillText('Patm', il + 3, gy - 3);
    }
  }

  // Left axis
  ctx.strokeStyle = axC; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(il, it); ctx.lineTo(il, it + ih); ctx.stroke();

  // Border
  ctx.strokeStyle = dk ? 'rgba(200,220,255,0.35)' : 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 1; ctx.strokeRect(il, it, iw, ih);

  // Y-tick labels
  ctx.font = '700 9px "Space Mono",monospace'; ctx.textAlign = 'right';
  yTks.forEach(v => {
    if (v < yMin - 1e-9 || v > yMax + 1e-9) return;
    const gy = toY(v);
    if (gy < it - 5 || gy > it + ih + 5) return;
    ctx.strokeStyle = axC; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(il - 4, gy); ctx.lineTo(il, gy); ctx.stroke();
    ctx.fillStyle = tkC; ctx.fillText(fmtTick(v), il - 6, gy + 4);
  });

  // Y-axis label (rotated)
  ctx.save();
  ctx.translate(ox + 10, it + ih / 2); ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center'; ctx.fillStyle = lbC;
  ctx.font = '700 9px "Space Mono",monospace';
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();

  // Bars + x-tick labels
  const n   = bars.length;
  const gap = iw / (n + 1);
  bars.forEach((bar, i) => {
    const bx   = il + gap * (i + 1);
    const bw   = gap * 0.45;
    const vc   = Math.max(yMin, Math.min(yMax, bar.value));
    const y0   = toY(Math.max(yMin, 0));
    const y1   = toY(vc);
    const top  = Math.min(y0, y1), barH = Math.abs(y0 - y1);

    ctx.fillStyle   = bar.color + (dk ? '99' : '88');
    ctx.fillRect(bx - bw / 2, top, bw, barH);
    ctx.strokeStyle = bar.color; ctx.lineWidth = 1.5;
    ctx.strokeRect(bx - bw / 2, top, bw, barH);

    // X-tick
    ctx.strokeStyle = axC; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(bx, it + ih); ctx.lineTo(bx, it + ih + 4); ctx.stroke();
    ctx.fillStyle = tkC; ctx.font = '700 9px "Space Mono",monospace'; ctx.textAlign = 'center';
    ctx.fillText(bar.label, bx, it + ih + 15);

    // Value label above/below bar
    ctx.fillStyle = bar.color; ctx.font = '700 9px "Space Mono",monospace';
    const labelY = bar.value >= 0 ? top - 4 : top + barH + 12;
    ctx.fillText(fmtTick(bar.value), bx, labelY);
  });
}

// ── Graph panels ──────────────────────────────────────────────────────────────
function drawGraphs() {
  const ctx = grCtx;
  const dk  = isDark();
  ctx.clearRect(0, 0, GW, GH);

  const half = Math.floor(GW / 2);
  drawVPanel(ctx, dk, 0,    0, half,      GH);
  drawPPanel(ctx, dk, half, 0, GW - half, GH);

  ctx.strokeStyle = dk ? 'rgba(0,212,255,0.08)' : 'rgba(0,100,160,0.10)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(half, 0); ctx.lineTo(half, GH); ctx.stroke();
}

function drawVPanel(ctx, dk, ox, oy, pw, ph) {
  const v1v = params.v1, v2v = v2();
  const vhi = Math.max(v1v, v2v) * 1.28 + 0.3;
  drawBarPanel(ctx, dk, ox, oy, pw, ph, 'v (m/s)', [
    { value: v1v, label: 'Sez. 1', color: '#4488ff' },
    { value: v2v, label: 'Sez. 2', color: '#ffaa44' },
  ], 'v (m/s)', 0, vhi);
}

function drawPPanel(ctx, dk, ox, oy, pw, ph) {
  const p1v = params.P1 / 1000;
  const p2v = p2() / 1000;
  const patm = P_ATM / 1000;
  const plo = Math.min(p1v, p2v, patm) - 15;
  const phi = Math.max(p1v, p2v, patm) + 15;
  drawBarPanel(ctx, dk, ox, oy, pw, ph, 'P (kPa)', [
    { value: p1v, label: 'Sez. 1', color: '#4488ff' },
    { value: p2v, label: 'Sez. 2', color: p2() < P_ATM ? '#ff6060' : '#ffaa44' },
  ], 'P (kPa)', plo, phi, patm);
}

// ── Readout ───────────────────────────────────────────────────────────────────
const rdout = new Lab.Readout(document.getElementById('readout'), [
  { key: 'v1', label: 'v₁'          },
  { key: 'v2', label: 'v₂'          },
  { key: 'P1', label: 'P₁'          },
  { key: 'P2', label: 'P₂'          },
  { key: 'dP', label: 'ΔP'          },
  { key: 'B',  label: 'P+½ρv²+ρgy'  },
]);

function updateReadout() {
  const p2v = p2();
  rdout.set('v1', params.v1.toFixed(2) + ' m/s');
  rdout.set('v2', v2().toFixed(2) + ' m/s');
  rdout.set('P1', (params.P1 / 1000).toFixed(1) + ' kPa');
  rdout.set('P2', (p2v / 1000).toFixed(1) + ' kPa' + (p2v < 0 ? ' ⚠' : ''));
  rdout.set('dP', ((params.P1 - p2v) / 1000).toFixed(2) + ' kPa');
  rdout.set('B',  (bernoulli() / 1000).toFixed(1) + ' kPa');
}

// ── Controls ──────────────────────────────────────────────────────────────────
function buildControls() {
  const cont = document.getElementById('controls');
  cont.innerHTML = '';

  const secSez1 = Lab.Section('Sezione 1');
  secSez1
    .add(Lab.SliderInput({ label: 'Raggio r₁', min: 0.05, max: 0.30, value: params.r1, step: 0.01, unit: ' m',
      onChange: v => { params.r1 = v; onParamChange(); } }))
    .add(Lab.SliderInput({ label: 'Altezza y₁', min: 0, max: 4, value: params.y1, step: 0.1, unit: ' m',
      onChange: v => { params.y1 = v; onParamChange(); } }));

  const secSez2 = Lab.Section('Sezione 2');
  secSez2
    .add(Lab.SliderInput({ label: 'Raggio r₂', min: 0.05, max: 0.30, value: params.r2, step: 0.01, unit: ' m',
      onChange: v => { params.r2 = v; onParamChange(); } }))
    .add(Lab.SliderInput({ label: 'Altezza y₂', min: 0, max: 4, value: params.y2, step: 0.1, unit: ' m',
      onChange: v => { params.y2 = v; onParamChange(); } }));

  const secFlow = Lab.Section('Flusso');
  secFlow
    .add(Lab.SliderInput({ label: 'Velocità v₁', min: 0.5, max: 10, value: params.v1, step: 0.1, unit: ' m/s',
      onChange: v => { params.v1 = v; onParamChange(); } }))
    .add(Lab.SliderInput({ label: 'Pressione P₁', min: 110, max: 500, value: params.P1 / 1000, step: 10, unit: ' kPa',
      onChange: v => { params.P1 = v * 1000; onParamChange(); } }));

  const secFluid = Lab.Section('Fluido');
  secFluid.add(Lab.RadioGroup({
    label: 'Fluido',
    value: params.fluid,
    options: Object.entries(FLUIDS).map(([k, f]) => ({ value: k, label: f.label, hint: f.hint })),
    onChange: v => { params.fluid = v; onParamChange(); },
  }));

  cont.appendChild(secSez1.el);
  cont.appendChild(secSez2.el);
  cont.appendChild(secFlow.el);
  cont.appendChild(secFluid.el);
}

function onParamChange() {
  drawScene();
  drawGraphs();
  updateReadout();
}

// ── Animation loop ────────────────────────────────────────────────────────────
let running = false, animId = null, lastTs = null;

function tick(ts) {
  if (!running) return;
  if (lastTs === null) lastTs = ts;
  const dt = Math.min((ts - lastTs) / 1000, 0.05);
  lastTs = ts;
  stepParts(dt);
  drawScene();
  animId = requestAnimationFrame(tick);
}

function startSim() {
  if (running) return;
  running = true; lastTs = null;
  document.getElementById('btnPlay').textContent = '⏸  PAUSA';
  animId = requestAnimationFrame(tick);
}

function stopSim() {
  running = false; lastTs = null;
  if (animId) { cancelAnimationFrame(animId); animId = null; }
  document.getElementById('btnPlay').textContent = '▶  AVVIA';
}

// ── Init ──────────────────────────────────────────────────────────────────────
Lab.initTheme();
buildControls();
initParts();
updateReadout();

new ResizeObserver(() => { resize(); drawScene(); drawGraphs(); }).observe(simCv.parentElement);
new MutationObserver(() => { drawScene(); drawGraphs(); })
  .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

document.getElementById('btnPlay').addEventListener('click', () => {
  if (running) stopSim(); else startSim();
});
document.getElementById('btnReset').addEventListener('click', () => {
  stopSim();
  initParts();
  drawScene(); drawGraphs(); updateReadout();
});

requestAnimationFrame(() => {
  resize();
  initParts();
  drawScene();
  drawGraphs();
  updateReadout();
});
