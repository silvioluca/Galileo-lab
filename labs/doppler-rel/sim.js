'use strict';

// ── Parameters ────────────────────────────────────────────────────────────────
const P = {
  beta:    0.40,
  lambda0: 550,   // source rest-frame wavelength (nm)
  mode:    0,     // 0=approaching  1=receding  2=transverse
};

// ── Canvas elements ────────────────────────────────────────────────────────────
const canvas    = document.getElementById('simCanvas');
const ctx       = canvas.getContext('2d');
const gCanvas   = document.getElementById('graphCanvas');
const gctx      = gCanvas.getContext('2d');
const graphArea = document.getElementById('graphArea');
const readoutEl = document.getElementById('readout');

let SW, SH, GW, GH, DPR;

function resize() {
  DPR = window.devicePixelRatio || 1;
  const area = canvas.parentElement;
  const gaH  = graphArea.offsetHeight;
  const rdH  = readoutEl.offsetHeight || 0;
  SW = area.clientWidth;
  SH = area.clientHeight - gaH - rdH;
  canvas.width        = SW * DPR;
  canvas.height       = SH * DPR;
  canvas.style.width  = SW + 'px';
  canvas.style.height = SH + 'px';
  GW = graphArea.clientWidth;
  GH = graphArea.clientHeight;
  gCanvas.width        = GW * DPR;
  gCanvas.height       = GH * DPR;
  gCanvas.style.width  = GW + 'px';
  gCanvas.style.height = GH + 'px';
}

// ── Physics ────────────────────────────────────────────────────────────────────
function gam(b) { return 1 / Math.sqrt(Math.max(1e-15, 1 - b * b)); }

// Returns f_obs / f0
function dopplerRatio(b, mode) {
  if (mode === 0) return Math.sqrt((1 + b) / Math.max(1e-9, 1 - b));
  if (mode === 1) return Math.sqrt(Math.max(1e-9, 1 - b) / (1 + b));
  return 1 / gam(b); // transverse: f_obs = f0 / gamma
}

// ── Simulation state ───────────────────────────────────────────────────────────
// World units: c = 1, T0 = 1 (source proper emission period)
// Lab-frame emission period = gamma * T0
const WORLD_HALF = 6;
const SIM_SPEED  = 2.5;   // world units per real second
const MAX_WAVES  = 100;

const wavefronts = [];     // { ox, t0 }  emission position + lab-frame time
let simT     = 0;
let nextEmit = 0;
let srcX     = -WORLD_HALF * 0.6;
let running  = true;
let lastTS   = null;

function resetSim() {
  wavefronts.length = 0;
  simT     = 0;
  nextEmit = 0;
  srcX     = -WORLD_HALF * 0.6;
  lastTS   = null;
}

function setRunning(v) {
  running = v;
  document.getElementById('btnPlay').textContent = v ? '⏸  PAUSA' : '▶  RIPRENDI';
}

function stepSim(dt) {
  const b          = P.beta;
  const labPeriod  = Math.max(0.05, gam(b));
  const realDt     = dt * SIM_SPEED;

  simT += realDt;
  srcX += b * realDt;

  while (nextEmit <= simT) {
    const emitX = srcX - b * (simT - nextEmit);
    if (wavefronts.length >= MAX_WAVES) wavefronts.shift();
    wavefronts.push({ ox: emitX, t0: nextEmit });
    nextEmit += labPeriod;
  }

  if (srcX > WORLD_HALF * 0.85) resetSim();
}

// ── Colors ────────────────────────────────────────────────────────────────────
function getCSSVar(n) {
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim();
}

function getColors() {
  const light = document.documentElement.dataset.theme === 'light';
  return {
    bg:    getCSSVar('--bg1')            || (light ? '#f0f2f5' : '#060a10'),
    bg2:   getCSSVar('--bg2')            || (light ? '#ffffff' : '#0b1018'),
    grid:  light ? 'rgba(0,0,0,0.07)'   : 'rgba(255,255,255,0.05)',
    text:  getCSSVar('--text-primary')   || (light ? '#0d1a26' : '#ddeeff'),
    muted: getCSSVar('--text-secondary') || (light ? '#4a6278' : '#6b8099'),
    accent:getCSSVar('--accent')         || (light ? '#0099cc' : '#00d4ff'),
    spCol: light ? '#c04800' : '#ffa030',
    blueShift: '#5588ff',
    redShift:  '#ff5555',
    light,
  };
}

// Wavelength (nm) → RGBA string with optional fade at UV/IR edges
function nmToRgba(nm, alpha) {
  const a = (alpha !== undefined) ? alpha : 1;
  let r = 0, g = 0, b = 0, fade = 1;
  if      (nm >= 380 && nm < 440) { r = -(nm - 440) / 60; b = 1; }
  else if (nm >= 440 && nm < 490) { g = (nm - 440) / 50;  b = 1; }
  else if (nm >= 490 && nm < 510) { g = 1; b = -(nm - 510) / 20; }
  else if (nm >= 510 && nm < 580) { r = (nm - 510) / 70;  g = 1; }
  else if (nm >= 580 && nm < 645) { r = 1; g = -(nm - 645) / 65; }
  else if (nm >= 645 && nm <= 720){ r = 1; }
  if (nm < 420) fade = 0.3 + 0.7 * (nm - 380) / 40;
  else if (nm > 680) fade = Math.max(0, 0.3 + 0.7 * (720 - nm) / 40);
  const ri = Math.round(Math.max(0, Math.min(1, r)) * 255);
  const gi = Math.round(Math.max(0, Math.min(1, g)) * 255);
  const bi = Math.round(Math.max(0, Math.min(1, b)) * 255);
  return 'rgba(' + ri + ',' + gi + ',' + bi + ',' + (a * fade).toFixed(3) + ')';
}

// Plain rgb — clamps out-of-range to extreme visible colors (violet for UV, red for IR)
function nmToColor(nm) {
  const v = Math.max(380, Math.min(720, nm));
  let r = 0, g = 0, b = 0;
  if      (v < 440) { r = -(v - 440) / 60; b = 1; }
  else if (v < 490) { g = (v - 440) / 50;  b = 1; }
  else if (v < 510) { g = 1; b = -(v - 510) / 20; }
  else if (v < 580) { r = (v - 510) / 70;  g = 1; }
  else if (v < 645) { r = 1; g = -(v - 645) / 65; }
  else              { r = 1; }
  const ri = Math.round(Math.max(0, Math.min(1, r)) * 255);
  const gi = Math.round(Math.max(0, Math.min(1, g)) * 255);
  const bi = Math.round(Math.max(0, Math.min(1, b)) * 255);
  return 'rgb(' + ri + ',' + gi + ',' + bi + ')';
}

// ── World → screen coords ─────────────────────────────────────────────────────
function wsc()      { return SW / (2 * WORLD_HALF); }
function toSX(wx)   { return SW / 2 + wx * wsc(); }
function toSY(wy)   { return SH / 2 - wy * wsc(); } // positive wy = up on screen

// Observer world position by mode
function obsWorldPos() {
  if (P.mode === 0) return { wx:  WORLD_HALF * 0.85, wy: 0 };
  if (P.mode === 1) return { wx: -WORLD_HALF * 0.85, wy: 0 };
  return { wx: 0, wy: (SH * 0.30) / wsc() };
}

// ── Main canvas ────────────────────────────────────────────────────────────────
function drawMain(C) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, SW, SH);

  const b      = P.beta;
  const g      = gam(b);
  const D      = dopplerRatio(b, P.mode);
  const lamObs = P.lambda0 / D;
  const s      = wsc();

  // Source trajectory dashed line
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(0, SH / 2);
  ctx.lineTo(SW, SH / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Wavefronts: circles split into N_SEG arcs, each colored by the local Doppler wavelength.
  // At angle θ from the source motion (+x = right): λ(θ) = λ₀ · γ · (1 − β·cos θ)
  // θ=0 (right/forward)  → blueshift;  θ=π (left/backward) → redshift
  const n     = wavefronts.length;
  const N_SEG = 72;
  const dA_seg = (Math.PI * 2) / N_SEG;

  // Precompute once per frame — same geometry for all wavefronts
  const arcCols = [];
  for (let seg = 0; seg < N_SEG; seg++) {
    const theta  = seg * dA_seg;
    const lamSeg = P.lambda0 * g * (1 - b * Math.cos(theta));
    arcCols.push(nmToColor(lamSeg));
  }

  for (let i = 0; i < n; i++) {
    const wf  = wavefronts[i];
    const age = simT - wf.t0;
    if (age <= 0) continue;
    const r  = age * s;
    const cx = toSX(wf.ox);
    const cy = SH / 2;
    if (r < 2) continue;
    if (cx + r < -10 || cx - r > SW + 10 || cy + r < -10 || cy - r > SH + 10) continue;

    const frac      = i / Math.max(1, n - 1);
    ctx.globalAlpha = 0.15 + frac * 0.65;
    ctx.lineWidth   = 2.0;

    for (let seg = 0; seg < N_SEG; seg++) {
      ctx.strokeStyle = arcCols[seg];
      ctx.beginPath();
      ctx.arc(cx, cy, r, seg * dA_seg - dA_seg * 0.5, seg * dA_seg + dA_seg * 0.5);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // Source velocity arrow
  const sx = toSX(srcX);
  const sy = SH / 2;
  if (b > 0.02) {
    const al = 18 + 36 * b;
    ctx.strokeStyle = C.spCol;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx + 11, sy);
    ctx.lineTo(sx + 11 + al, sy);
    ctx.stroke();
    ctx.fillStyle = C.spCol;
    ctx.beginPath();
    ctx.moveTo(sx + 13 + al, sy);
    ctx.lineTo(sx + 6  + al, sy - 4);
    ctx.lineTo(sx + 6  + al, sy + 4);
    ctx.closePath();
    ctx.fill();
  }

  // Source dot — colored with source wavelength
  const srcCol = nmToColor(P.lambda0);
  ctx.fillStyle   = srcCol;
  ctx.strokeStyle = C.bg;
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.arc(sx, sy, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = srcCol;
  ctx.font = 'bold 11px Space Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('S', sx, sy - 11);

  // Observer
  const op  = obsWorldPos();
  const ox  = toSX(op.wx);
  const oy  = toSY(op.wy);
  const inVis = (lamObs >= 380 && lamObs <= 720);

  // Colored glow showing observed wavelength
  if (inVis) {
    const glowC = nmToRgba(lamObs, 0.40);
    const grad  = ctx.createRadialGradient(ox, oy, 4, ox, oy, 30);
    grad.addColorStop(0, glowC);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(ox, oy, 30, 0, Math.PI * 2);
    ctx.fill();
  }

  // Observer dot — colored with observed wavelength
  const obsCol = inVis ? nmToColor(lamObs) : C.muted;
  ctx.fillStyle   = obsCol;
  ctx.strokeStyle = C.bg;
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.arc(ox, oy, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const lblBelow = (P.mode === 2);
  ctx.fillStyle     = obsCol;
  ctx.font          = 'bold 11px Space Mono, monospace';
  ctx.textAlign     = 'center';
  ctx.textBaseline  = lblBelow ? 'top' : 'bottom';
  ctx.fillText('O', ox, oy + (lblBelow ? 10 : -11));

  // Top-left info bar
  const modeLabel = ['AVVICINAMENTO', 'ALLONTANAMENTO', 'TRASVERSALE'][P.mode];
  ctx.fillStyle    = C.muted;
  ctx.font         = '10px Space Mono, monospace';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('β = ' + Lab.fmt(b,2) + '   ' + modeLabel, 12, 12);

  // Top-right wavelength info
  ctx.textAlign = 'right';
  ctx.fillStyle = srcCol;
  ctx.fillText('λ₀ = ' + Lab.fmt(P.lambda0,0) + ' nm', SW - 12, 12);
  const obsLamColor = inVis ? nmToColor(lamObs) : C.muted;
  ctx.fillStyle = obsLamColor;
  const uvir = lamObs < 380 ? ' (UV)' : lamObs > 720 ? ' (IR)' : '';
  ctx.fillText('λ_obs = ' + Lab.fmt(lamObs,1) + ' nm' + uvir, SW - 12, 27);

  ctx.textBaseline = 'alphabetic';
}

// ── Graph panel ────────────────────────────────────────────────────────────────
function drawGraph(C) {
  gctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  gctx.fillStyle = C.bg;
  gctx.fillRect(0, 0, GW, GH);

  const w3 = GW / 3;
  drawSpectrum(C, 0, w3);
  drawDopplerCurves(C, w3, w3);
  drawClassComp(C, 2 * w3, w3);

  // Sub-panel dividers
  gctx.strokeStyle = C.light ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.07)';
  gctx.lineWidth = 1;
  [w3, 2 * w3].forEach(x => {
    gctx.beginPath();
    gctx.moveTo(x, 0);
    gctx.lineTo(x, GH);
    gctx.stroke();
  });
}

// Sub-panel 1: visible spectrum with Balmer lines + Doppler shift
function drawSpectrum(C, x0, pw) {
  gctx.save();
  gctx.beginPath();
  gctx.rect(x0, 0, pw, GH);
  gctx.clip();

  const NM_MIN = 380, NM_MAX = 720;
  const PAD_L = 14, PAD_R = 14;
  const stripW = pw - PAD_L - PAD_R;
  const STRIP_H = 22;

  function nmToGx(nm) {
    return x0 + PAD_L + (nm - NM_MIN) / (NM_MAX - NM_MIN) * stripW;
  }

  // Rainbow gradient helper
  function drawStrip(y) {
    const grad = gctx.createLinearGradient(x0 + PAD_L, 0, x0 + PAD_L + stripW, 0);
    for (let i = 0; i <= 40; i++) {
      const nm = NM_MIN + (NM_MAX - NM_MIN) * i / 40;
      grad.addColorStop(i / 40, nmToRgba(nm, 0.9));
    }
    gctx.fillStyle = grad;
    gctx.fillRect(x0 + PAD_L, y, stripW, STRIP_H);
    gctx.strokeStyle = C.grid;
    gctx.lineWidth = 0.5;
    gctx.strokeRect(x0 + PAD_L, y, stripW, STRIP_H);
  }

  // Title
  gctx.fillStyle    = C.muted;
  gctx.font         = '700 8px Space Mono, monospace';
  gctx.textAlign    = 'center';
  gctx.textBaseline = 'top';
  gctx.fillText('SPETTRO', x0 + pw / 2, 3);

  const y1 = 18; // source strip top
  const y2 = y1 + STRIP_H + 28; // observed strip top

  // Strip labels
  gctx.fillStyle    = C.muted;
  gctx.font         = '8px DM Sans, sans-serif';
  gctx.textAlign    = 'left';
  gctx.textBaseline = 'bottom';
  gctx.fillText('Sorgente', x0 + PAD_L, y1 - 2);
  gctx.fillText('Osservato', x0 + PAD_L, y2 - 2);

  drawStrip(y1);
  drawStrip(y2);

  // Hydrogen Balmer lines
  const BALMER = [
    { nm: 656.3, name: 'Hα' },
    { nm: 486.1, name: 'Hβ' },
    { nm: 434.0, name: 'Hγ' },
    { nm: 410.2, name: 'Hδ' },
  ];

  const b = P.beta;
  const D = dopplerRatio(b, P.mode);

  for (const line of BALMER) {
    // Source strip line
    const xs = nmToGx(line.nm);
    if (xs >= x0 + PAD_L && xs <= x0 + PAD_L + stripW) {
      gctx.strokeStyle = 'rgba(0,0,0,0.80)';
      gctx.lineWidth   = 1.5;
      gctx.beginPath();
      gctx.moveTo(xs, y1);
      gctx.lineTo(xs, y1 + STRIP_H);
      gctx.stroke();
      gctx.fillStyle    = C.muted;
      gctx.font         = '7px Space Mono, monospace';
      gctx.textAlign    = 'center';
      gctx.textBaseline = 'top';
      gctx.fillText(line.name, xs, y1 + STRIP_H + 2);
    }

    // Observed strip line (shifted by Doppler)
    const lamObs = line.nm / D;
    const xo     = nmToGx(lamObs);
    if (xo >= x0 + PAD_L && xo <= x0 + PAD_L + stripW) {
      gctx.strokeStyle = 'rgba(0,0,0,0.80)';
      gctx.lineWidth   = 1.5;
      gctx.beginPath();
      gctx.moveTo(xo, y2);
      gctx.lineTo(xo, y2 + STRIP_H);
      gctx.stroke();
      gctx.fillStyle    = C.muted;
      gctx.font         = '7px Space Mono, monospace';
      gctx.textAlign    = 'center';
      gctx.textBaseline = 'top';
      gctx.fillText(line.name, xo, y2 + STRIP_H + 2);
    }
  }

  // Selected λ₀ marker on source strip
  const xs0 = nmToGx(P.lambda0);
  if (xs0 >= x0 + PAD_L && xs0 <= x0 + PAD_L + stripW) {
    gctx.strokeStyle = C.spCol;
    gctx.lineWidth   = 2;
    gctx.setLineDash([3, 2]);
    gctx.beginPath();
    gctx.moveTo(xs0, y1 - 1);
    gctx.lineTo(xs0, y1 + STRIP_H + 1);
    gctx.stroke();
    gctx.setLineDash([]);
  }

  // Selected λ₀ observed marker
  const lamO0 = P.lambda0 / D;
  const xo0   = nmToGx(lamO0);
  if (xo0 >= x0 + PAD_L && xo0 <= x0 + PAD_L + stripW) {
    gctx.strokeStyle = C.accent;
    gctx.lineWidth   = 2;
    gctx.setLineDash([3, 2]);
    gctx.beginPath();
    gctx.moveTo(xo0, y2 - 1);
    gctx.lineTo(xo0, y2 + STRIP_H + 1);
    gctx.stroke();
    gctx.setLineDash([]);
  }

  // Δλ label
  const dLam     = lamO0 - P.lambda0;
  const shiftTxt = (dLam >= 0 ? 'Δλ = +' : 'Δλ = ') + Lab.fmt(dLam,1) + ' nm';
  const shiftCol = dLam > 1 ? C.redShift : dLam < -1 ? C.blueShift : C.muted;
  gctx.fillStyle    = shiftCol;
  gctx.font         = '9px Space Mono, monospace';
  gctx.textAlign    = 'center';
  gctx.textBaseline = 'top';
  gctx.fillText(shiftTxt, x0 + pw / 2, y2 + STRIP_H + 16);

  // Wavelength axis ticks
  const tickY = y2 + STRIP_H + 32;
  gctx.fillStyle    = C.muted;
  gctx.font         = '7px Space Mono, monospace';
  gctx.textBaseline = 'top';
  [400, 500, 600, 700].forEach(nm => {
    const tx = nmToGx(nm);
    if (tx >= x0 + PAD_L && tx <= x0 + PAD_L + stripW) {
      gctx.textAlign = 'center';
      gctx.fillText(nm, tx, tickY);
      gctx.strokeStyle = C.grid;
      gctx.lineWidth   = 0.5;
      gctx.beginPath();
      gctx.moveTo(tx, y2 + STRIP_H);
      gctx.lineTo(tx, y2 + STRIP_H + 4);
      gctx.stroke();
    }
  });
  gctx.textBaseline = 'alphabetic';
  gctx.textAlign    = 'center';
  gctx.fillStyle    = C.muted;
  gctx.fillText('nm', x0 + pw / 2, tickY + 10);

  gctx.restore();
}

// Sub-panel 2: f_obs/f0 vs β  (three modes)
function drawDopplerCurves(C, x0, pw) {
  gctx.save();
  gctx.beginPath();
  gctx.rect(x0, 0, pw, GH);
  gctx.clip();

  const PAD = { t: 20, b: 22, l: 28, r: 8 };
  const iw  = pw - PAD.l - PAD.r;
  const ih  = GH - PAD.t - PAD.b;
  const ax  = x0 + PAD.l;
  const ay  = PAD.t + ih;
  const F_MAX = 5;

  function bx(bv)  { return ax + (bv / 0.99) * iw; }
  function fy(fv)  { return ay - Math.min(fv, F_MAX) / F_MAX * ih; }

  // Title
  gctx.fillStyle    = C.muted;
  gctx.font         = '700 8px Space Mono, monospace';
  gctx.textAlign    = 'center';
  gctx.textBaseline = 'top';
  gctx.fillText('f_obs / f₀  vs  β', x0 + pw / 2, 3);

  // Axes
  gctx.strokeStyle = C.muted;
  gctx.lineWidth   = 1;
  gctx.beginPath();
  gctx.moveTo(ax, PAD.t);
  gctx.lineTo(ax, ay);
  gctx.lineTo(ax + iw, ay);
  gctx.stroke();

  // Grid + y labels
  [1, 2, 3, 4, 5].forEach(fv => {
    const y = fy(fv);
    gctx.strokeStyle = C.grid;
    gctx.lineWidth   = 0.5;
    gctx.beginPath();
    gctx.moveTo(ax, y);
    gctx.lineTo(ax + iw, y);
    gctx.stroke();
    gctx.fillStyle    = C.muted;
    gctx.font         = '7px Space Mono, monospace';
    gctx.textAlign    = 'right';
    gctx.textBaseline = 'middle';
    gctx.fillText(fv, ax - 3, y);
  });

  // x axis labels
  [0, 0.2, 0.4, 0.6, 0.8].forEach(bv => {
    const x = bx(bv);
    gctx.fillStyle    = C.muted;
    gctx.font         = '7px Space Mono, monospace';
    gctx.textAlign    = 'center';
    gctx.textBaseline = 'top';
    gctx.fillText(Lab.fmt(bv,1), x, ay + 4);
    gctx.strokeStyle = C.muted;
    gctx.lineWidth   = 0.5;
    gctx.beginPath();
    gctx.moveTo(x, ay);
    gctx.lineTo(x, ay + 3);
    gctx.stroke();
  });

  // Three curves
  const curves = [
    { mode: 0, color: C.blueShift, label: 'Avv.' },
    { mode: 1, color: C.redShift,  label: 'All.' },
    { mode: 2, color: C.muted,     label: 'Trasv.' },
  ];

  for (const cv of curves) {
    gctx.strokeStyle = cv.color;
    gctx.lineWidth   = 1.8;
    gctx.beginPath();
    let first = true;
    for (let i = 0; i <= 120; i++) {
      const bv = i / 120 * 0.99;
      const fv = dopplerRatio(bv, cv.mode);
      const x  = bx(bv);
      const y  = fy(fv);
      if (first) { gctx.moveTo(x, y); first = false; }
      else        gctx.lineTo(x, y);
    }
    gctx.stroke();
  }

  // Current β marker
  const b    = P.beta;
  const D    = dopplerRatio(b, P.mode);
  const mcx  = bx(b);
  const mcy  = fy(D);
  const curC = curves.find(cv => cv.mode === P.mode).color;

  gctx.setLineDash([3, 3]);
  gctx.strokeStyle = C.light ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.18)';
  gctx.lineWidth   = 1;
  gctx.beginPath();
  gctx.moveTo(mcx, ay);
  gctx.lineTo(mcx, mcy);
  gctx.stroke();
  gctx.setLineDash([]);

  gctx.fillStyle   = curC;
  gctx.strokeStyle = C.bg;
  gctx.lineWidth   = 1.5;
  gctx.beginPath();
  gctx.arc(mcx, mcy, 4.5, 0, Math.PI * 2);
  gctx.fill();
  gctx.stroke();

  // D value label
  gctx.fillStyle    = curC;
  gctx.font         = 'bold 8px Space Mono, monospace';
  gctx.textAlign    = mcx > ax + iw * 0.55 ? 'right' : 'left';
  gctx.textBaseline = 'bottom';
  gctx.fillText(Lab.fmt(D,3), mcx + (mcx > ax + iw * 0.55 ? -6 : 6), mcy - 3);

  // Legend (top-right)
  let legY = PAD.t + 4;
  const legX = x0 + pw - 5;
  for (const cv of curves) {
    gctx.fillStyle    = cv.color;
    gctx.fillRect(legX - 34, legY, 10, 2);
    gctx.font         = '7px DM Sans, sans-serif';
    gctx.textAlign    = 'left';
    gctx.textBaseline = 'middle';
    gctx.fillText(cv.label, legX - 22, legY + 1);
    legY += 11;
  }

  // Axis labels
  gctx.fillStyle    = C.muted;
  gctx.font         = '8px Space Mono, monospace';
  gctx.textAlign    = 'center';
  gctx.textBaseline = 'top';
  gctx.fillText('β', ax + iw / 2, ay + 13);

  gctx.restore();
}

// Sub-panel 3: relativistic vs classical Doppler (approaching + receding)
function drawClassComp(C, x0, pw) {
  gctx.save();
  gctx.beginPath();
  gctx.rect(x0, 0, pw, GH);
  gctx.clip();

  const PAD = { t: 20, b: 22, l: 28, r: 8 };
  const iw  = pw - PAD.l - PAD.r;
  const ih  = GH - PAD.t - PAD.b;
  const ax  = x0 + PAD.l;
  const ay  = PAD.t + ih;
  const F_MAX = 5;

  function bx(bv)  { return ax + (bv / 0.99) * iw; }
  function fy(fv)  { return ay - Math.min(fv, F_MAX) / F_MAX * ih; }

  // Title
  gctx.fillStyle    = C.muted;
  gctx.font         = '700 8px Space Mono, monospace';
  gctx.textAlign    = 'center';
  gctx.textBaseline = 'top';
  gctx.fillText('Relativ. vs Classico', x0 + pw / 2, 3);

  // Axes
  gctx.strokeStyle = C.muted;
  gctx.lineWidth   = 1;
  gctx.beginPath();
  gctx.moveTo(ax, PAD.t);
  gctx.lineTo(ax, ay);
  gctx.lineTo(ax + iw, ay);
  gctx.stroke();

  // Grid
  [1, 2, 3, 4, 5].forEach(fv => {
    const y = fy(fv);
    gctx.strokeStyle = C.grid;
    gctx.lineWidth   = 0.5;
    gctx.beginPath();
    gctx.moveTo(ax, y);
    gctx.lineTo(ax + iw, y);
    gctx.stroke();
    gctx.fillStyle    = C.muted;
    gctx.font         = '7px Space Mono, monospace';
    gctx.textAlign    = 'right';
    gctx.textBaseline = 'middle';
    gctx.fillText(fv, ax - 3, y);
  });

  // x axis labels
  [0, 0.2, 0.4, 0.6, 0.8].forEach(bv => {
    const x = bx(bv);
    gctx.fillStyle    = C.muted;
    gctx.font         = '7px Space Mono, monospace';
    gctx.textAlign    = 'center';
    gctx.textBaseline = 'top';
    gctx.fillText(Lab.fmt(bv,1), x, ay + 4);
    gctx.strokeStyle = C.muted;
    gctx.lineWidth   = 0.5;
    gctx.beginPath();
    gctx.moveTo(x, ay);
    gctx.lineTo(x, ay + 3);
    gctx.stroke();
  });

  // Draw curves: solid=relativistic, dashed=classical
  // Approaching
  // Relativistic: solid blue
  gctx.strokeStyle = C.blueShift;
  gctx.lineWidth   = 1.8;
  gctx.setLineDash([]);
  gctx.beginPath();
  let first = true;
  for (let i = 0; i <= 120; i++) {
    const bv = i / 120 * 0.99;
    const fv = dopplerRatio(bv, 0);
    const x  = bx(bv), y = fy(fv);
    if (first) { gctx.moveTo(x, y); first = false; } else gctx.lineTo(x, y);
  }
  gctx.stroke();

  // Classical approaching: f = 1/(1-β), dashed blue
  gctx.lineWidth = 1.2;
  gctx.setLineDash([4, 3]);
  gctx.beginPath();
  first = true;
  for (let i = 0; i <= 120; i++) {
    const bv = i / 120 * 0.98;
    const fv = 1 / Math.max(0.001, 1 - bv);
    const x  = bx(bv), y = fy(fv);
    if (first) { gctx.moveTo(x, y); first = false; } else gctx.lineTo(x, y);
  }
  gctx.stroke();
  gctx.setLineDash([]);

  // Receding: relativistic solid red
  gctx.strokeStyle = C.redShift;
  gctx.lineWidth   = 1.8;
  gctx.beginPath();
  first = true;
  for (let i = 0; i <= 120; i++) {
    const bv = i / 120 * 0.99;
    const fv = dopplerRatio(bv, 1);
    const x  = bx(bv), y = fy(fv);
    if (first) { gctx.moveTo(x, y); first = false; } else gctx.lineTo(x, y);
  }
  gctx.stroke();

  // Classical receding: f = 1/(1+β), dashed red
  gctx.lineWidth = 1.2;
  gctx.setLineDash([4, 3]);
  gctx.beginPath();
  first = true;
  for (let i = 0; i <= 120; i++) {
    const bv = i / 120 * 0.99;
    const fv = 1 / (1 + bv);
    const x  = bx(bv), y = fy(fv);
    if (first) { gctx.moveTo(x, y); first = false; } else gctx.lineTo(x, y);
  }
  gctx.stroke();
  gctx.setLineDash([]);

  // Current β marker
  const b   = P.beta;
  const D   = dopplerRatio(b, P.mode);
  const mcx = bx(b);
  const mcy = fy(D);
  const mc  = P.mode === 0 ? C.blueShift : P.mode === 1 ? C.redShift : C.muted;
  gctx.fillStyle   = mc;
  gctx.strokeStyle = C.bg;
  gctx.lineWidth   = 1.5;
  gctx.beginPath();
  gctx.arc(mcx, mcy, 4.5, 0, Math.PI * 2);
  gctx.fill();
  gctx.stroke();

  // Legend
  const legX = x0 + pw - 5;
  let legY   = PAD.t + 4;
  const legendItems = [
    { color: C.blueShift, dash: false, label: 'Rel. avv.' },
    { color: C.blueShift, dash: true,  label: 'Cl.  avv.' },
    { color: C.redShift,  dash: false, label: 'Rel. all.' },
    { color: C.redShift,  dash: true,  label: 'Cl.  all.' },
  ];
  for (const leg of legendItems) {
    gctx.strokeStyle = leg.color;
    gctx.lineWidth   = leg.dash ? 1.2 : 1.8;
    if (leg.dash) gctx.setLineDash([3, 2]); else gctx.setLineDash([]);
    gctx.beginPath();
    gctx.moveTo(legX - 34, legY + 1);
    gctx.lineTo(legX - 24, legY + 1);
    gctx.stroke();
    gctx.setLineDash([]);
    gctx.fillStyle    = C.muted;
    gctx.font         = '7px DM Sans, sans-serif';
    gctx.textAlign    = 'left';
    gctx.textBaseline = 'middle';
    gctx.fillText(leg.label, legX - 22, legY + 1);
    legY += 11;
  }

  // Axis label
  gctx.fillStyle    = C.muted;
  gctx.font         = '8px Space Mono, monospace';
  gctx.textAlign    = 'center';
  gctx.textBaseline = 'top';
  gctx.fillText('β', ax + iw / 2, ay + 13);

  gctx.restore();
}

// ── Readout ────────────────────────────────────────────────────────────────────
const readout = new Lab.Readout(readoutEl, [
  { key: 'beta',     label: 'β = v/c' },
  { key: 'gamma',    label: 'fattore di Lorentz γ' },
  { key: 'lambda0',  label: 'λ emessa λ₀' },
  { key: 'lambdaObs',label: 'λ osservata' },
  { key: 'ratio',    label: 'rapporto f/f₀' },
  { key: 'mode',     label: 'moto della sorgente' },
]);

// ── Controls ───────────────────────────────────────────────────────────────────
function buildControls() {
  const cont = document.getElementById('controls');
  cont.innerHTML = '';

  const sec = Lab.Section('Doppler Relativistico');
  cont.appendChild(sec.el);

  sec.add(Lab.Slider({
    label: 'β = v/c',
    min: 0, max: 0.99, step: 0.01, value: P.beta, unit: '',
    onChange(v) { P.beta = v; resetSim(); },
  }));

  sec.add(Lab.Slider({
    label: 'λ₀ sorgente',
    min: 380, max: 700, step: 1, value: P.lambda0, unit: ' nm',
    onChange(v) { P.lambda0 = v; },
  }));

  const modeLabels = ['Avvicinamento', 'Allontanamento', 'Trasversale'];
  sec.add(Lab.RadioGroup({
    label: 'Modo',
    options: modeLabels.map((label, i) => ({ value: i, label })),
    value: P.mode,
    onChange(v) { P.mode = v; resetSim(); },
  }));
}

// ── Main loop ─────────────────────────────────────────────────────────────────
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = (lastTS === null) ? 0 : Math.min((ts - lastTS) / 1000, 0.05);
  lastTS = ts;

  if (running && dt > 0) stepSim(dt);

  const b    = P.beta;
  const g    = gam(b);
  const D    = dopplerRatio(b, P.mode);
  const lam  = P.lambda0 / D;
  const modeNames = ['Avvic.', 'Allont.', 'Trasv.'];

  readout.set('beta',      Lab.fmt(b,3));
  readout.set('gamma',     Lab.fmt(g,4));
  readout.set('lambda0',   Lab.fmt(P.lambda0,0) + ' nm');
  readout.set('lambdaObs', Lab.fmt(lam,1) + ' nm');
  readout.set('ratio',     Lab.fmt(D,4));
  readout.set('mode',      modeNames[P.mode]);

  const C = getColors();
  drawMain(C);
  drawGraph(C);
}

// ── Init ──────────────────────────────────────────────────────────────────────
Lab.initTheme('themeToggle');
resetSim();
resize();
buildControls();
new ResizeObserver(resize).observe(canvas.parentElement);
document.getElementById('btnPlay').addEventListener('click',  () => setRunning(!running));
document.getElementById('btnReset').addEventListener('click', () => { resetSim(); });
requestAnimationFrame(loop);
