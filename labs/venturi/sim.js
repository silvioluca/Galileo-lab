/* Effetto Bernoulli — Tubo di Venturi */
'use strict';

const P_ATM    = 101325;  // Pa
const TUBE_LEN = 2.0;     // physical length (m) — used for particle speed

const FLUIDS = {
  acqua: { rho: 1000,  label: 'Acqua',         hint: '1000 kg/m³' },
  olio:  { rho: 900,   label: 'Olio minerale',  hint: '900 kg/m³'  },
  aria:  { rho: 1.225, label: 'Aria',            hint:'1,2 kg/m³'  },
};

const params = {
  v1:    2.0,     // inlet velocity m/s
  ratio: 0.55,    // r₂/r₁  (throat radius ratio)
  fluid: 'acqua',
  P1:    200000,  // inlet pressure Pa
};

// ── Tube geometry (normalized x ∈ [0,1]) ─────────────────────────────────────
// Sections: left wide → taper → throat → taper → right wide
const SEG = { L1: 0.22, T1: 0.36, TH: 0.64, T2: 0.78 };

function tubeR(x) {
  const r = params.ratio;
  if (x < SEG.L1) return 1;
  if (x < SEG.T1) return 1 + (r - 1) * (x - SEG.L1) / (SEG.T1 - SEG.L1);
  if (x < SEG.TH) return r;
  if (x < SEG.T2) return r + (1 - r) * (x - SEG.TH) / (SEG.T2 - SEG.TH);
  return 1;
}

// ── Physics (incompressible, horizontal, inviscid) ────────────────────────────
function rho()     { return FLUIDS[params.fluid].rho; }
function localV(x) { return params.v1 / tubeR(x) ** 2; }          // A₁v₁ = A(x)v(x)
function localP(x) {
  const v = localV(x);
  return params.P1 + 0.5 * rho() * (params.v1 ** 2 - v ** 2);    // Bernoulli
}
function stagP()   { return params.P1 + 0.5 * rho() * params.v1 ** 2; }
function throatV() { return localV(0.5); }
function throatP() { return localP(0.5); }

// ── Particle streamlines ──────────────────────────────────────────────────────
// Particles follow fixed y-fraction lanes (streamlines). They speed up through
// the throat because localV increases — this makes gaps appear between them,
// visually showing the continuity equation.
const LANES = [-0.70, -0.46, -0.23, 0, 0.23, 0.46, 0.70];
const PPC   = 8;  // particles per lane
const parts  = [];

function initParts() {
  parts.length = 0;
  LANES.forEach(yf => {
    for (let i = 0; i < PPC; i++) {
      parts.push({ x: i / PPC + Math.random() * 0.02, yf });
    }
  });
}

function stepParts(dt) {
  for (const p of parts) {
    p.x += localV(p.x) / TUBE_LEN * dt;
    if (p.x > 1) p.x -= 1;
  }
}

// ── Canvas setup ──────────────────────────────────────────────────────────────
const simCv  = document.getElementById('simCanvas');
const simCtx = simCv.getContext('2d');
const grCv   = document.getElementById('graphCanvas');
const grCtx  = grCv.getContext('2d');

let SW = 0, SH = 0, GW = 0, GH = 0;
let TL = 0, TR = 0, CY = 0, R1PX = 0;

function isDark() { return document.documentElement.dataset.theme !== 'light'; }

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const par = simCv.parentElement;
  const gH  = document.getElementById('graphArea').offsetHeight || 200;
  const rH  = document.querySelector('.readout-bar')?.offsetHeight || 56;

  SW = par.clientWidth;
  SH = Math.max(120, par.clientHeight - gH - rH);
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

  TL   = 70;
  TR   = SW - 70;
  R1PX = Math.min(46, SH * 0.115);
  CY   = SH * 0.62;
}

function drawGridBg(ctx, w, h) {
  ctx.strokeStyle = isDark() ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y <= h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
}

function getCol() {
  const s = getComputedStyle(document.documentElement);
  const g = k => s.getPropertyValue(k).trim();
  return {
    text:   g('--text')        || '#e8edf5',
    muted:  g('--text-muted')  || '#4a5568',
    accent: g('--accent')      || '#00d4ff',
    grid:   g('--grid')        || 'rgba(255,255,255,0.06)',
  };
}

// Velocity → colour: blue (slow) → orange-red (fast)
function velColor(v, vmax) {
  const t = Math.max(0, Math.min(1, v / vmax));
  return `hsl(${200 - t * 170}, 100%, ${52 + t * 12}%)`;
}

// ── Scene ─────────────────────────────────────────────────────────────────────
const MPTS = [0.11, 0.50, 0.89];  // measurement x-positions

function canvasX(xn)       { return TL + xn * (TR - TL); }
function canvasY(xn, frac) { return CY + frac * tubeR(xn) * R1PX; }

function drawScene() {
  const ctx = simCtx;
  const col = getCol();
  ctx.clearRect(0, 0, SW, SH);
  drawGridBg(ctx, SW, SH);

  const N  = 120;
  const xs = Array.from({ length: N + 1 }, (_, i) => i / N);

  // ── Fluid fill ────────────────────────────────────────────────────────────
  ctx.beginPath();
  xs.forEach((x, i) => {
    i === 0 ? ctx.moveTo(canvasX(x), canvasY(x, -1))
            : ctx.lineTo(canvasX(x), canvasY(x, -1));
  });
  for (let i = N; i >= 0; i--) ctx.lineTo(canvasX(i/N), canvasY(i/N, 1));
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,100,210,0.13)';
  ctx.fill();

  // ── Static streamlines (background) ──────────────────────────────────────
  LANES.forEach(yf => {
    ctx.beginPath();
    xs.forEach((x, i) => {
      const py = canvasY(x, yf * 0.88);
      i === 0 ? ctx.moveTo(canvasX(x), py) : ctx.lineTo(canvasX(x), py);
    });
    ctx.strokeStyle = 'rgba(0,160,255,0.09)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // ── Tube walls ────────────────────────────────────────────────────────────
  for (const sign of [-1, 1]) {
    ctx.beginPath();
    xs.forEach((x, i) => {
      const py = canvasY(x, sign);
      i === 0 ? ctx.moveTo(canvasX(x), py) : ctx.lineTo(canvasX(x), py);
    });
    ctx.strokeStyle = col.text;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  // End caps
  for (const xn of [0, 1]) {
    ctx.beginPath();
    ctx.moveTo(canvasX(xn), canvasY(xn, -1));
    ctx.lineTo(canvasX(xn), canvasY(xn,  1));
    ctx.strokeStyle = col.text;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // ── Flow direction chevrons (inlet) ───────────────────────────────────────
  const inX = canvasX(0);
  const inR = tubeR(0) * R1PX;
  for (let k = -1; k <= 1; k++) {
    const arY = CY + k * inR * 0.45;
    ctx.strokeStyle = 'rgba(0,180,255,0.30)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(inX - 22, arY - 5); ctx.lineTo(inX - 12, arY); ctx.lineTo(inX - 22, arY + 5);
    ctx.stroke();
  }

  // ── Particles ─────────────────────────────────────────────────────────────
  const vmax = throatV() * 1.05;
  for (const p of parts) {
    const px = canvasX(p.x);
    const py = canvasY(p.x, p.yf * 0.88);
    ctx.beginPath();
    ctx.arc(px, py, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = velColor(localV(p.x), vmax);
    ctx.fill();
  }

  // ── Measurement-point bars + velocity labels ──────────────────────────────
  const Pvals  = MPTS.map(x => localP(x));
  const Vvals  = MPTS.map(x => localV(x));
  const Pmax   = Math.max(...Pvals) * 1.02;
  const BAR_H  = Math.max(40, CY - R1PX - 46);

  MPTS.forEach((xm, idx) => {
    const mx    = canvasX(xm);
    const topY  = canvasY(xm, -1);
    const botY  = canvasY(xm,  1);
    const P     = Pvals[idx];
    const V     = Vvals[idx];
    const isLow = P < P_ATM;

    // Dashed measurement line through tube
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mx, topY - 4); ctx.lineTo(mx, botY + 4);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Pressure bar box + fill above tube
    const barW = 20;
    const barH = Math.max(0, (P / Pmax) * BAR_H);
    const boxY = topY - 10 - BAR_H;
    const fillY = topY - 10 - barH;
    ctx.strokeStyle = isLow ? '#ff6060' : col.accent;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(mx - barW/2, boxY, barW, BAR_H);
    ctx.fillStyle = isLow ? 'rgba(255,80,80,0.50)' : 'rgba(0,180,255,0.40)';
    ctx.fillRect(mx - barW/2, fillY, barW, barH);

    // P label
    ctx.fillStyle = isLow ? '#ff7070' : col.accent;
    ctx.font = 'bold 10px Space Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(Lab.fmt((P/1000),1) + ' kPa', mx, boxY - 4);

    // Section subscript
    ctx.fillStyle = col.muted;
    ctx.font = '9px Space Mono, monospace';
    ctx.fillText('P' + (idx + 1), mx, boxY - 14);

    // Velocity arrow + label below tube
    const VSCALE = 12;
    const alen  = Math.min(V * VSCALE, 80);
    const arY   = botY + 22;
    ctx.strokeStyle = '#ffaa44';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mx - alen/2, arY); ctx.lineTo(mx + alen/2, arY);
    ctx.stroke();
    // arrowhead
    ctx.beginPath();
    ctx.moveTo(mx + alen/2,     arY);
    ctx.lineTo(mx + alen/2 - 7, arY - 4);
    ctx.lineTo(mx + alen/2 - 7, arY + 4);
    ctx.closePath();
    ctx.fillStyle = '#ffaa44';
    ctx.fill();
    ctx.fillStyle = '#ffaa44';
    ctx.font = '10px Space Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(Lab.fmt(V,2) + ' m/s', mx, arY + 16);
  });

  // ── Cavitation warning ────────────────────────────────────────────────────
  if (throatP() < 0) {
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 12px DM Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚠ Cavitazione: P₂ < 0 (flusso non fisico)', SW/2, CY + R1PX + 52);
  }

  // ── Bernoulli annotation ──────────────────────────────────────────────────
  ctx.fillStyle = col.muted;
  ctx.font = '11px Space Mono, monospace';
  ctx.textAlign = 'left';
  ctx.fillText('P + ½ρv² = ' + Lab.fmt((stagP()/1000),1) + ' kPa (costante)', TL + 4, SH - 10);
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
  const ctx = grCtx;
  const dk  = isDark();
  ctx.clearRect(0, 0, GW, GH);

  const half = Math.floor(GW / 2);
  drawVPanel(ctx, dk, 0,         0, half,           GH);
  drawPPanel(ctx, dk, half,      0, GW - half,       GH);

  ctx.strokeStyle = dk ? 'rgba(0,212,255,0.08)' : 'rgba(0,100,160,0.10)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(half, 0); ctx.lineTo(half, GH); ctx.stroke();
}

function drawVPanel(ctx, dk, ox, oy, pw, ph) {
  const PAD = { t: 22, b: 26, l: 46, r: 10 };
  const il = ox + PAD.l, it = oy + PAD.t, iw = pw - PAD.l - PAD.r, ih = ph - PAD.t - PAD.b;
  const axC = dk ? 'rgba(200,220,255,0.35)' : 'rgba(0,0,0,0.28)';
  const grC = dk ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const tkC = dk ? '#6b8099' : '#4a6278';
  const lbC = dk ? '#6b8099' : '#4a6278';

  ctx.fillStyle = dk ? '#0b1018' : '#f0f2f5';
  ctx.fillRect(ox, oy, pw, ph);

  ctx.fillStyle = dk ? 'rgba(200,220,255,0.50)' : 'rgba(40,60,100,0.50)';
  ctx.font = "10px 'Space Mono',monospace"; ctx.textAlign = 'center';
  ctx.fillText('v (m/s)', ox + pw/2, oy + 14);

  const vmax = throatV() * 1.18;
  const yTks = niceTicks(0, vmax, 4);

  yTks.forEach(v => {
    if (v < 0 || v > vmax + 1e-9) return;
    const gy = it + ih - (v / vmax) * ih;
    ctx.strokeStyle = v < 1e-9 ? axC : grC; ctx.lineWidth = v < 1e-9 ? 1.5 : 1;
    ctx.beginPath(); ctx.moveTo(il, gy); ctx.lineTo(il + iw, gy); ctx.stroke();
  });
  [0.25, 0.5, 0.75].forEach(f => {
    ctx.strokeStyle = grC; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(il + f*iw, it); ctx.lineTo(il + f*iw, it + ih); ctx.stroke();
  });

  ctx.strokeStyle = axC; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(il, it); ctx.lineTo(il, it + ih); ctx.stroke();
  ctx.strokeStyle = dk ? 'rgba(200,220,255,0.35)' : 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 1; ctx.strokeRect(il, it, iw, ih);

  ctx.font = '700 9px "Space Mono",monospace'; ctx.textAlign = 'right';
  yTks.forEach(v => {
    if (v < 0 || v > vmax + 1e-9) return;
    const gy = it + ih - (v / vmax) * ih;
    ctx.strokeStyle = axC; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(il - 4, gy); ctx.lineTo(il, gy); ctx.stroke();
    ctx.fillStyle = tkC; ctx.fillText(fmtTick(v), il - 6, gy + 4);
  });

  // x-axis section labels at measurement points
  ctx.textAlign = 'center';
  MPTS.forEach((xm, i) => {
    const gx = il + xm * iw;
    ctx.strokeStyle = axC; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(gx, it + ih); ctx.lineTo(gx, it + ih + 4); ctx.stroke();
    ctx.fillStyle = tkC; ctx.fillText(['1','2','3'][i], gx, it + ih + 16);
  });

  ctx.save();
  ctx.translate(ox + 10, it + ih/2); ctx.rotate(-Math.PI/2);
  ctx.textAlign = 'center'; ctx.fillStyle = lbC;
  ctx.font = '700 9px "Space Mono",monospace';
  ctx.fillText('v (m/s)', 0, 0);
  ctx.restore();

  ctx.save();
  ctx.beginPath(); ctx.rect(il, it, iw, ih); ctx.clip();
  ctx.beginPath();
  for (let i = 0; i <= 100; i++) {
    const xn = i/100, py = it + ih - (localV(xn)/vmax)*ih;
    i === 0 ? ctx.moveTo(il + xn*iw, py) : ctx.lineTo(il + xn*iw, py);
  }
  ctx.strokeStyle = '#ffaa44'; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();

  MPTS.forEach(xm => {
    ctx.beginPath(); ctx.arc(il + xm*iw, it + ih - (localV(xm)/vmax)*ih, 4, 0, Math.PI*2);
    ctx.fillStyle = '#ffaa44'; ctx.fill();
  });
}

function drawPPanel(ctx, dk, ox, oy, pw, ph) {
  const PAD = { t: 22, b: 26, l: 46, r: 10 };
  const il = ox + PAD.l, it = oy + PAD.t, iw = pw - PAD.l - PAD.r, ih = ph - PAD.t - PAD.b;
  const axC = dk ? 'rgba(200,220,255,0.35)' : 'rgba(0,0,0,0.28)';
  const grC = dk ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const tkC = dk ? '#6b8099' : '#4a6278';
  const lbC = dk ? '#6b8099' : '#4a6278';

  ctx.fillStyle = dk ? '#0b1018' : '#f0f2f5';
  ctx.fillRect(ox, oy, pw, ph);

  ctx.fillStyle = dk ? 'rgba(200,220,255,0.50)' : 'rgba(40,60,100,0.50)';
  ctx.font = "10px 'Space Mono',monospace"; ctx.textAlign = 'center';
  ctx.fillText('P (kPa)', ox + pw/2, oy + 14);

  const ps  = Array.from({length: 101}, (_, i) => localP(i/100));
  const Plo = Math.min(...ps, P_ATM) - 1000;
  const Phi = Math.max(...ps) + 1000;
  const Pr  = Phi - Plo || 1;
  const toY = P => it + ih - (P - Plo)/Pr * ih;
  const yTks = niceTicks(Plo/1000, Phi/1000, 4).map(v => v * 1000);

  yTks.forEach(P => {
    if (P < Plo - 1e-3 || P > Phi + 1e-3) return;
    const gy = toY(P);
    ctx.strokeStyle = grC; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(il, gy); ctx.lineTo(il + iw, gy); ctx.stroke();
  });
  [0.25, 0.5, 0.75].forEach(f => {
    ctx.strokeStyle = grC; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(il + f*iw, it); ctx.lineTo(il + f*iw, it + ih); ctx.stroke();
  });

  // P_atm reference line
  const patmY = toY(P_ATM);
  if (patmY >= it && patmY <= it + ih) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = axC; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(il, patmY); ctx.lineTo(il + iw, patmY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    ctx.fillStyle = tkC; ctx.font = '700 8px "Space Mono",monospace';
    ctx.textAlign = 'left'; ctx.fillText('Patm', il + 3, patmY - 3);
  }

  ctx.strokeStyle = axC; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(il, it); ctx.lineTo(il, it + ih); ctx.stroke();
  ctx.strokeStyle = dk ? 'rgba(200,220,255,0.35)' : 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 1; ctx.strokeRect(il, it, iw, ih);

  ctx.font = '700 9px "Space Mono",monospace'; ctx.textAlign = 'right';
  yTks.forEach(P => {
    if (P < Plo - 1e-3 || P > Phi + 1e-3) return;
    const gy = toY(P);
    if (gy < it - 4 || gy > it + ih + 4) return;
    ctx.strokeStyle = axC; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(il - 4, gy); ctx.lineTo(il, gy); ctx.stroke();
    ctx.fillStyle = tkC; ctx.fillText(fmtTick(P/1000), il - 6, gy + 4);
  });

  ctx.textAlign = 'center';
  MPTS.forEach((xm, i) => {
    const gx = il + xm * iw;
    ctx.strokeStyle = axC; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(gx, it + ih); ctx.lineTo(gx, it + ih + 4); ctx.stroke();
    ctx.fillStyle = tkC; ctx.fillText(['1','2','3'][i], gx, it + ih + 16);
  });

  ctx.save();
  ctx.translate(ox + 10, it + ih/2); ctx.rotate(-Math.PI/2);
  ctx.textAlign = 'center'; ctx.fillStyle = lbC;
  ctx.font = '700 9px "Space Mono",monospace';
  ctx.fillText('P (kPa)', 0, 0);
  ctx.restore();

  ctx.save();
  ctx.beginPath(); ctx.rect(il, it, iw, ih); ctx.clip();
  ctx.beginPath();
  for (let i = 0; i <= 100; i++) {
    const xn = i/100, py = toY(localP(xn));
    i === 0 ? ctx.moveTo(il + xn*iw, py) : ctx.lineTo(il + xn*iw, py);
  }
  const col = getCol();
  ctx.strokeStyle = col.accent; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();

  MPTS.forEach(xm => {
    const P = localP(xm);
    ctx.beginPath(); ctx.arc(il + xm*iw, toY(P), 4, 0, Math.PI*2);
    ctx.fillStyle = P < P_ATM ? '#ff6060' : getCol().accent; ctx.fill();
  });
}

// ── Readout ───────────────────────────────────────────────────────────────────
const rdout = new Lab.Readout(document.getElementById('readout'), [
  { key: 'v1',   label: 'v₁' },
  { key: 'v2',   label: 'v₂ (gola)' },
  { key: 'P1',   label: 'P₁' },
  { key: 'P2',   label: 'P₂ (gola)' },
  { key: 'dP',   label: 'ΔP' },
  { key: 'stag', label: 'P + ½ρv²' },
]);

function updateReadout() {
  const v2 = throatV(), p2 = throatP();
  rdout.set('v1',   params.v1.toFixed(2) + ' m/s');
  rdout.set('v2',   v2.toFixed(2) + ' m/s');
  rdout.set('P1',   (params.P1 / 1000).toFixed(1) + ' kPa');
  rdout.set('P2',   (p2 / 1000).toFixed(1) + ' kPa');
  rdout.set('dP',   ((params.P1 - p2) / 1000).toFixed(2) + ' kPa');
  rdout.set('stag', (stagP() / 1000).toFixed(1) + ' kPa');
}

// ── Controls ──────────────────────────────────────────────────────────────────
function buildControls() {
  const cont = document.getElementById('controls');
  cont.innerHTML = '';

  const secFlow = Lab.Section('Flusso');
  secFlow
    .add(Lab.Slider({ label: 'Velocità v₁', min: 0.5, max: 15, value: params.v1, step: 0.5, unit: ' m/s',
      onChange: v => { params.v1 = v; onParamChange(); } }))
    .add(Lab.Slider({ label: 'Pressione P₁', min: 110, max: 500, value: params.P1/1000, step: 10, unit: ' kPa',
      onChange: v => { params.P1 = v * 1000; onParamChange(); } }));

  const secGeo = Lab.Section('Geometria');
  secGeo.add(Lab.Slider({ label: 'Raggio gola r₂/r₁', min: 0.30, max: 0.90, value: params.ratio, step: 0.05, unit: '',
    onChange: v => { params.ratio = v; onParamChange(); } }));

  const secFluid = Lab.Section('Fluido');
  secFluid.add(Lab.RadioGroup({
    label: 'Fluido',
    value: params.fluid,
    options: Object.entries(FLUIDS).map(([k, f]) => ({ value: k, label: f.label, hint: f.hint })),
    onChange: v => { params.fluid = v; onParamChange(); },
  }));

  cont.appendChild(secFlow.el);
  cont.appendChild(secGeo.el);
  cont.appendChild(secFluid.el);
}

function onParamChange() {
  drawScene();
  drawGraphs();
  updateReadout();
}

// ── Animation loop ────────────────────────────────────────────────────────────
let running = false;
let animId  = null;
let lastTs  = null;

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
  running = true;
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
  drawScene();
  drawGraphs();
  updateReadout();
});

requestAnimationFrame(() => {
  resize();
  initParts();
  drawScene();
  drawGraphs();
  updateReadout();
});
