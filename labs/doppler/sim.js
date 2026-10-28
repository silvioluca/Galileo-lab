'use strict';

// ── Parameters ──────────────────────────────────────────────────────────────
const P = {
  vSound: 340,      // m/s (displayed unit)
  fSource: 440,     // Hz
  vSource: 0,       // m/s (positive = rightward)
  vListener: 0,     // m/s (positive = rightward)
  audioOn: false,
  audioMode: 'sine', // 'sine' | 'ambulance'
};

// ── Canvas / layout ──────────────────────────────────────────────────────────
const canvas  = document.getElementById('simCanvas');
const ctx     = canvas.getContext('2d');
const gCanvas = document.getElementById('graphCanvas');
const gctx    = gCanvas.getContext('2d');
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

  canvas.width  = SW * DPR;
  canvas.height = SH * DPR;
  canvas.style.width  = SW + 'px';
  canvas.style.height = SH + 'px';

  GW = graphArea.clientWidth;
  GH = graphArea.clientHeight;
  gCanvas.width  = GW * DPR;
  gCanvas.height = GH * DPR;
  gCanvas.style.width  = GW + 'px';
  gCanvas.style.height = GH + 'px';
}

// ── Simulation units ─────────────────────────────────────────────────────────
// World units: 1 unit = ~10 m.  Screen spans ±worldHalf horizontally.
// vSound = 340 m/s → 34 u/s.  Speeds are in m/s, scaled down for display.
const WORLD_SCALE = 10;

// ── State ─────────────────────────────────────────────────────────────────────
let running = true;
let simT    = 0;
let nextEmit = 0;

// Source and listener: world positions (world units). They move horizontally
// at the slider speed, or follow the mouse while dragged.
let srcX  = 0, srcY = 0;
let lstX  = 8, lstY = 0;

// Current velocities in m/s: slider value, or mouse velocity while dragged
const srcV = { x: 0, y: 0 };
const lstV = { x: 0, y: 0 };

let drag = null;                 // 'src' | 'lst' | null
const mouseW = { x: 0, y: 0 };   // pointer position in world units

// Wavefronts: {ox, oy, r}  — origin in world units, radius growing at v_sound
const wavefronts = [];
const MAX_WAVEFRONTS = 200;

// f_obs history for the time-domain chart
const HIST_MAX = 500;
const histT = [];
const histF = [];

let lastTS = null;

// ── Audio (Web Audio API) ─────────────────────────────────────────────────────
// Ambulance siren: sine carrier swept by LFO between a fixed low/high range.
// The Doppler ratio (f_obs / f_src) shifts the entire band up or down.
const SIREN_F_LOW  = 550;  // Hz — low note of the siren sweep
const SIREN_F_HIGH = 1350; // Hz — high note
const SIREN_CENTER = (SIREN_F_HIGH + SIREN_F_LOW) / 2;   // 950 Hz
const SIREN_DEV    = (SIREN_F_HIGH - SIREN_F_LOW) / 2;   // 400 Hz
const SIREN_RATE   = 0.65; // Hz — one full wail every ~1.5 s

let audioCtx = null;
let oscillator = null;
let gainNode = null;
let lfoOsc = null;
let lfoGain = null;

function startAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  gainNode = audioCtx.createGain();
  gainNode.gain.setValueAtTime(0.18, audioCtx.currentTime);
  gainNode.connect(audioCtx.destination);

  oscillator = audioCtx.createOscillator();
  oscillator.type = 'sine';

  if (P.audioMode === 'ambulance') {
    // The carrier sits at SIREN_CENTER scaled by the Doppler ratio.
    // The LFO adds ±SIREN_DEV (also scaled) to produce the wail.
    const ratio = dopplerRatio();
    oscillator.frequency.setValueAtTime(SIREN_CENTER * ratio, audioCtx.currentTime);

    lfoOsc = audioCtx.createOscillator();
    lfoOsc.type = 'sine';
    lfoOsc.frequency.setValueAtTime(SIREN_RATE, audioCtx.currentTime);

    lfoGain = audioCtx.createGain();
    lfoGain.gain.setValueAtTime(SIREN_DEV * ratio, audioCtx.currentTime);

    lfoOsc.connect(lfoGain);
    lfoGain.connect(oscillator.frequency);
    lfoOsc.start();
  } else {
    const fObs0 = computeFObs();
    oscillator.frequency.setValueAtTime(
      isFinite(fObs0) && fObs0 > 0 ? fObs0 : P.fSource,
      audioCtx.currentTime
    );
  }

  oscillator.connect(gainNode);
  oscillator.start();
}

function stopAudio() {
  if (!audioCtx) return;
  if (lfoOsc)  { lfoOsc.stop(); lfoOsc.disconnect(); lfoOsc = null; }
  if (lfoGain) { lfoGain.disconnect(); lfoGain = null; }
  oscillator.stop();
  oscillator.disconnect();
  gainNode.disconnect();
  audioCtx.close();
  audioCtx = null;
  oscillator = null;
  gainNode = null;
}

// Returns f_obs / f_src — the multiplicative Doppler shift applied to any frequency.
function dopplerRatio() {
  const fObs = computeFObs();
  if (!isFinite(fObs) || fObs <= 0) return 1;
  return fObs / P.fSource;
}

function updateAudioFreq(fObs) {
  if (!oscillator || !audioCtx) return;
  if (P.audioMode === 'ambulance') {
    const ratio = isFinite(fObs) && fObs > 0 ? fObs / P.fSource : 1;
    oscillator.frequency.setTargetAtTime(SIREN_CENTER * ratio, audioCtx.currentTime, 0.08);
    if (lfoGain) lfoGain.gain.setTargetAtTime(SIREN_DEV * ratio, audioCtx.currentTime, 0.08);
  } else {
    oscillator.frequency.setTargetAtTime(Math.max(20, Math.min(20000, fObs)), audioCtx.currentTime, 0.05);
  }
}

// ── Doppler physics ───────────────────────────────────────────────────────────
// Sign convention: positive = rightward.
// Listener is to the right of source → source approaches listener.
// f_obs = f_s * (v_sound + v_listener_toward_source) / (v_sound - v_source_toward_listener)
// "toward" means toward the other: if listener moves left (toward right-moving source) → positive.
// Standard formula with direction:
//   f_obs = f_s * (v + v_L·sign) / (v - v_S·sign)
// where sign = sign of (lstX - srcX), i.e. +1 if listener is to the right.
// In 2D only the velocity components along the source→listener line count:
// off-axis the shift shrinks, and it vanishes when the motion is perpendicular.
function computeFObs() {
  const v  = P.vSound;
  const dx = lstX - srcX, dy = lstY - srcY;
  const d  = Math.hypot(dx, dy);
  const nx = d > 1e-6 ? dx / d : 1, ny = d > 1e-6 ? dy / d : 0;
  const vsAlong = srcV.x * nx + srcV.y * ny;      // positive if source moves toward listener
  const vlAlong = -(lstV.x * nx + lstV.y * ny);   // positive if listener moves toward source
  const denom = v - vsAlong;
  // sorgente a velocità del suono (o più) verso l'ascoltatore: la formula non vale, il suono arriva tutto insieme col cono di Mach
  if (denom < 0.01 * v) return Infinity;
  return P.fSource * (v + vlAlong) / denom;
}

function getMachNumber() {
  return Math.hypot(srcV.x, srcV.y) / P.vSound;
}

// ── Reset ─────────────────────────────────────────────────────────────────────
function resetSim() {
  simT     = 0;
  nextEmit = 0;
  srcX     = 0; srcY = 0;
  lstX     = 8; lstY = 0;
  drag     = null;
  wavefronts.length = 0;
  histT.length = 0;
  histF.length = 0;
  lastTS = null;
}

// ── Draw helpers ──────────────────────────────────────────────────────────────
function getCSSVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function getColors() {
  const light = document.documentElement.dataset.theme === 'light';
  return {
    bg:     getCSSVar('--bg1')            || (light ? '#f0f2f5' : '#060a10'),
    grid:   light ? 'rgba(0,0,0,0.07)'   : 'rgba(255,255,255,0.05)',
    text:   getCSSVar('--text-primary')   || (light ? '#0d1a26' : '#ddeeff'),
    muted:  getCSSVar('--text-secondary') || (light ? '#4a6278' : '#6b8099'),
    accent: getCSSVar('--accent')         || (light ? '#0099cc' : '#00d4ff'),
  };
}

// World-to-screen mapping
function wx2sx(wx) { return SW / 2 + wx * scale; }
function wy2sy(wy) { return SH / 2 - wy * scale; }

let scale = 30; // px per world unit, recalculated in draw

function computeScale() {
  scale = SW / 24; // 24 world units visible horizontally (±12)
}

function drawBackground(C) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, SW, SH);

  // grid lines
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  const step = 2; // world units
  const xStart = Math.floor(-SW / scale / 2 / step) * step;
  const xEnd   = Math.ceil( SW / scale / 2 / step) * step;
  for (let wx = xStart; wx <= xEnd; wx += step) {
    const sx = wx2sx(wx);
    ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, SH); ctx.stroke();
  }
  const yStart = Math.floor(-SH / scale / 2 / step) * step;
  const yEnd   = Math.ceil( SH / scale / 2 / step) * step;
  for (let wy = yStart; wy <= yEnd; wy += step) {
    const sy = wy2sy(wy);
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(SW, sy); ctx.stroke();
  }
}

function drawWavefronts(C, mach) {
  const supersonic = mach >= 1;
  const maxR = Math.sqrt(SW * SW + SH * SH) / scale * 1.2;

  if (!supersonic) {
    // Draw each circular wavefront
    for (const wf of wavefronts) {
      if (wf.r > maxR) continue;
      const opacity = Math.max(0, 0.7 - wf.r / maxR * 0.6);
      ctx.beginPath();
      ctx.arc(wx2sx(wf.ox), wy2sy(wf.oy), wf.r * scale, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(110,231,247,${opacity})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  } else {
    // Mach cone: draw only the envelope tangent lines
    // Mach angle: sin(θ) = v_sound / v_source  → θ from source motion axis
    const sinTheta = 1 / mach;
    const cosTheta = Math.sqrt(Math.max(0, 1 - sinTheta * sinTheta));
    const srcSX = wx2sx(srcX);
    const srcSY = wy2sy(srcY);
    // unit vector pointing backward along the source velocity
    const sp = Math.hypot(srcV.x, srcV.y) || 1;
    const bx = -srcV.x / sp, by = -srcV.y / sp;

    // Also draw the compressed wavefronts behind the cone
    for (const wf of wavefronts) {
      if (wf.r > maxR) continue;
      const opacity = Math.max(0, 0.5 - wf.r / maxR * 0.4);
      ctx.beginPath();
      ctx.arc(wx2sx(wf.ox), wy2sy(wf.oy), wf.r * scale, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,140,80,${opacity})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    // Mach cone lines (tangent to all wavefront circles)
    // The apex is at srcX. The half-angle is θ from the direction of motion.
    const armLen = Math.max(SW, SH) / scale;
    for (const ysign of [-1, 1]) {
      // cone arm: backward direction rotated by ±θ
      const dx = bx * cosTheta - ysign * by * sinTheta;
      const dy = ysign * bx * sinTheta + by * cosTheta;
      ctx.beginPath();
      ctx.moveTo(srcSX, srcSY);
      ctx.lineTo(srcSX + dx * armLen * scale, srcSY - dy * armLen * scale);
      ctx.strokeStyle = 'rgba(255,100,60,0.85)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Shock cone fill
    ctx.beginPath();
    ctx.moveTo(srcSX, srcSY);
    const dx1 = bx * cosTheta - by * sinTheta, dy1 =  bx * sinTheta + by * cosTheta;
    const dx2 = bx * cosTheta + by * sinTheta, dy2 = -bx * sinTheta + by * cosTheta;
    ctx.lineTo(srcSX + dx1 * armLen * scale, srcSY - dy1 * armLen * scale);
    ctx.lineTo(srcSX + dx2 * armLen * scale, srcSY - dy2 * armLen * scale);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,80,40,0.07)';
    ctx.fill();
  }
}

function drawSource(C) {
  const sx = wx2sx(srcX);
  const sy = wy2sy(srcY);
  const r  = 12;

  // Glow
  const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 2.5);
  grd.addColorStop(0, 'rgba(110,231,247,0.35)');
  grd.addColorStop(1, 'rgba(110,231,247,0)');
  ctx.beginPath();
  ctx.arc(sx, sy, r * 2.5, 0, Math.PI * 2);
  ctx.fillStyle = grd;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fillStyle = C.accent;
  ctx.fill();

  ctx.fillStyle = C.bg;
  ctx.font = `bold ${r}px DM Sans, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('S', sx, sy);

  // velocity arrow
  drawVelocityArrow(sx, sy, srcV, C.accent);
}

function drawListener(C) {
  const sx = wx2sx(lstX);
  const sy = wy2sy(lstY);
  const r  = 12;

  const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 2.5);
  grd.addColorStop(0, 'rgba(168,85,247,0.35)');
  grd.addColorStop(1, 'rgba(168,85,247,0)');
  ctx.beginPath();
  ctx.arc(sx, sy, r * 2.5, 0, Math.PI * 2);
  ctx.fillStyle = grd;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#a855f7';
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.font = `bold ${r}px DM Sans, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('L', sx, sy);

  drawVelocityArrow(sx, sy, lstV, '#a855f7');
}

function drawVelocityArrow(sx, sy, vel, color) {
  const sp = Math.hypot(vel.x, vel.y);
  if (sp <= 1) return;
  const len = Math.min(50, sp / P.vSound * 80);
  drawArrow(ctx, sx, sy, sx + vel.x / sp * len, sy - vel.y / sp * len, color);
}

function drawArrow(c, x1, y1, x2, y2, color) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 4) return;
  const ux = dx / len, uy = dy / len;
  const ah = 8, aw = 5;
  c.beginPath();
  c.moveTo(x1 + ux * 14, y1 + uy * 14);
  c.lineTo(x2, y2);
  c.strokeStyle = color;
  c.lineWidth = 2.5;
  c.stroke();
  c.beginPath();
  c.moveTo(x2, y2);
  c.lineTo(x2 - ux * ah - uy * aw, y2 - uy * ah + ux * aw);
  c.lineTo(x2 - ux * ah + uy * aw, y2 - uy * ah - ux * aw);
  c.closePath();
  c.fillStyle = color;
  c.fill();
}

function drawDragHint(C) {
  ctx.save();
  ctx.font = '10px DM Sans, sans-serif';
  ctx.fillStyle = C.muted;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('trascina S o L con il mouse', SW - 12, 14);
  ctx.restore();
}

function drawMachLabel(C, mach) {
  if (mach < 0.05) return;
  const supersonic = mach >= 1;
  const label = supersonic
    ? `CHERENKOV  M = ${Lab.fmt(mach,2)}`
    : `M = ${Lab.fmt(mach,2)}`;
  const col = supersonic ? '#ff6428' : C.accent;
  ctx.save();
  ctx.font = '700 13px Space Mono, monospace';
  ctx.fillStyle = col;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(label, 12, 12);
  ctx.restore();
}

// ── Graph ─────────────────────────────────────────────────────────────────────
function drawGraph(C) {
  gctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  gctx.fillStyle = C.bg;
  gctx.fillRect(0, 0, GW, GH);

  const splitX = Math.floor(GW * 0.52);

  // Vertical divider
  gctx.strokeStyle = C.grid;
  gctx.lineWidth = 1;
  gctx.beginPath();
  gctx.moveTo(splitX, 5);
  gctx.lineTo(splitX, GH - 5);
  gctx.stroke();

  drawSinPanel(C, 0, splitX);
  drawFObsPanel(C, splitX, GW - splitX);
}

// Left panel: static sinusoidal comparison
function drawSinPanel(C, offX, pw) {
  const PAD = { l: 10, r: 8, t: 14, b: 8 };
  const iw = pw - PAD.l - PAD.r;
  const ih = GH - PAD.t - PAD.b;
  const phHalf = ih / 2;
  const N = 500;

  const fSrc = P.fSource;
  const fObs = computeFObs();
  const T_window = 3 / fSrc; // window = 3 source cycles

  // Channel divider
  const divY = PAD.t + phHalf;
  gctx.strokeStyle = C.grid;
  gctx.lineWidth = 1;
  gctx.beginPath();
  gctx.moveTo(offX + PAD.l, divY);
  gctx.lineTo(offX + PAD.l + iw, divY);
  gctx.stroke();

  function drawChan(cy, f, color, label, freqLabel) {
    const amp = phHalf * 0.38;
    const stripTop = cy - phHalf / 2;

    // Zero line
    gctx.setLineDash([3, 4]);
    gctx.strokeStyle = C.grid;
    gctx.lineWidth = 0.8;
    gctx.beginPath();
    gctx.moveTo(offX + PAD.l, cy);
    gctx.lineTo(offX + PAD.l + iw, cy);
    gctx.stroke();
    gctx.setLineDash([]);

    // Labels
    gctx.fillStyle = color;
    gctx.font = '700 10px Space Mono, monospace';
    gctx.textAlign = 'left';
    gctx.textBaseline = 'top';
    gctx.fillText(label, offX + PAD.l + 4, stripTop + 3);
    gctx.font = '10px Space Mono, monospace';
    gctx.fillText(freqLabel, offX + PAD.l + 4, stripTop + 16);

    if (!isFinite(f) || f <= 0) return;

    // Static sine: t ∈ [0, T_window], no simT phase — shape frozen, only frequency matters
    gctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * T_window;
      const y = cy - amp * Math.sin(2 * Math.PI * f * t);
      const x = offX + PAD.l + (i / N) * iw;
      i === 0 ? gctx.moveTo(x, y) : gctx.lineTo(x, y);
    }
    gctx.strokeStyle = color;
    gctx.lineWidth = 1.8;
    gctx.stroke();
  }

  drawChan(PAD.t + phHalf / 2,           fSrc, C.accent,  'SORGENTE', Lab.fmt(fSrc,0) + ' Hz');
  drawChan(PAD.t + phHalf + phHalf / 2,  fObs, '#a855f7', 'OSSERVATA',
    isFinite(fObs) && fObs > 0 ? Lab.fmt(fObs,1) + ' Hz' : 'cono di Mach');
}

// Right panel: f_obs(t) history
function drawFObsPanel(C, offX, pw) {
  const PAD = { l: 42, r: 8, t: 18, b: 24 };
  const iw = pw - PAD.l - PAD.r;
  const ih = GH - PAD.t - PAD.b;

  if (histF.length < 2) {
    gctx.fillStyle = C.muted;
    gctx.font = '11px DM Sans, sans-serif';
    gctx.textAlign = 'center';
    gctx.textBaseline = 'middle';
    gctx.fillText('f(t)', offX + pw / 2, GH / 2);
    return;
  }

  const fMin = P.fSource * 0.35;
  const fMax = P.fSource * 1.65;
  const tMin = histT[0];
  const tSpan = Math.max(histT[histT.length - 1] - tMin, 1);

  // Axes
  gctx.strokeStyle = C.grid;
  gctx.lineWidth = 1;
  gctx.beginPath();
  gctx.moveTo(offX + PAD.l, PAD.t);
  gctx.lineTo(offX + PAD.l, PAD.t + ih);
  gctx.lineTo(offX + PAD.l + iw, PAD.t + ih);
  gctx.stroke();

  // f_source reference
  const refY = PAD.t + ih - (P.fSource - fMin) / (fMax - fMin) * ih;
  gctx.setLineDash([4, 3]);
  gctx.strokeStyle = C.muted;
  gctx.lineWidth = 1;
  gctx.beginPath();
  gctx.moveTo(offX + PAD.l, refY);
  gctx.lineTo(offX + PAD.l + iw, refY);
  gctx.stroke();
  gctx.setLineDash([]);

  gctx.fillStyle = C.muted;
  gctx.font = '9px Space Mono, monospace';
  gctx.textAlign = 'right';
  gctx.textBaseline = 'middle';
  gctx.fillText('f₀', offX + PAD.l - 3, refY);

  // Curve
  gctx.beginPath();
  let first = true;
  for (let i = 0; i < histT.length; i++) {
    const fv = histF[i];
    if (!isFinite(fv)) { first = true; continue; }
    const x = offX + PAD.l + (histT[i] - tMin) / tSpan * iw;
    const y = PAD.t + ih - (Math.min(Math.max(fv, fMin), fMax) - fMin) / (fMax - fMin) * ih;
    first ? gctx.moveTo(x, y) : gctx.lineTo(x, y);
    first = false;
  }
  gctx.strokeStyle = '#a855f7';
  gctx.lineWidth = 2;
  gctx.stroke();

  // Axis labels
  gctx.fillStyle = C.muted;
  gctx.font = '9px Space Mono, monospace';
  gctx.textAlign = 'center';
  gctx.textBaseline = 'bottom';
  gctx.fillText('t (s)', offX + PAD.l + iw / 2, GH - 2);
  gctx.save();
  gctx.translate(offX + 10, PAD.t + ih / 2);
  gctx.rotate(-Math.PI / 2);
  gctx.textBaseline = 'middle';
  gctx.fillText('f_obs', 0, 0);
  gctx.restore();

  // Current value
  const last = histF[histF.length - 1];
  if (isFinite(last)) {
    gctx.fillStyle = '#a855f7';
    gctx.font = 'bold 10px Space Mono, monospace';
    gctx.textAlign = 'right';
    gctx.textBaseline = 'top';
    gctx.fillText(Lab.fmt(last,1) + ' Hz', offX + PAD.l + iw, PAD.t + 2);
  }
}

// ── Readout ───────────────────────────────────────────────────────────────────
const readout = new Lab.Readout(readoutEl, [
  { key: 'fObs',  label: 'frequenza percepita' },
  { key: 'fSrc',  label: 'frequenza emessa' },
  { key: 'mach',  label: 'numero di Mach' },
  { key: 'shift', label: 'spostamento Δf' },
]);

// ── Controls ──────────────────────────────────────────────────────────────────
let audioToggleWidget;

function buildControls() {
  const cont = document.getElementById('controls');
  cont.innerHTML = '';

  const secSource = Lab.Section('Sorgente');
  secSource.add(Lab.Slider({
    label: 'Frequenza f₀', unit: ' Hz', min: 100, max: 2000, step: 10, value: P.fSource,
    onChange(v) {
      P.fSource = v;
      wavefronts.length = 0;  // clear so new spacing is visible immediately
      nextEmit = 0;
    }
  }));
  secSource.add(Lab.Slider({
    label: 'Velocità sorgente vₛ', unit: ' m/s', min: -800, max: 800, step: 5, value: P.vSource,
    onChange(v) { P.vSource = v; }
  }));

  const secListener = Lab.Section('Osservatore');
  secListener.add(Lab.Slider({
    label: 'Velocità osservatore v_L', unit: ' m/s', min: -800, max: 800, step: 5, value: P.vListener,
    onChange(v) { P.vListener = v; }
  }));

  const secWave = Lab.Section('Mezzo');
  secWave.add(Lab.Slider({
    label: 'Velocità del suono v', unit: ' m/s', min: 50, max: 1200, step: 10, value: P.vSound,
    onChange(v) { P.vSound = v; }
  }));

  const secAudio = Lab.Section('Audio');
  audioToggleWidget = Lab.Toggle({
    label: '🔊  Ascolta effetto', value: P.audioOn,
    onChange(v) {
      P.audioOn = v;
      if (v) startAudio(); else stopAudio();
    }
  });
  secAudio.add(audioToggleWidget);

  secAudio.add(Lab.Toggle({
    label: '🚑  Sirena ambulanza', value: P.audioMode === 'ambulance',
    onChange(v) {
      P.audioMode = v ? 'ambulance' : 'sine';
      if (P.audioOn) { stopAudio(); startAudio(); }
    }
  }));

  cont.append(secSource.el, secListener.el, secWave.el, secAudio.el);
}

// ── Drag di sorgente e osservatore ───────────────────────────────────────────
const HIT_R = 22; // px

function pointerWorld(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left - SW / 2) / scale, y: (SH / 2 - (e.clientY - r.top)) / scale };
}

function hitTest(w) {
  const dS = Math.hypot(w.x - srcX, w.y - srcY) * scale;
  const dL = Math.hypot(w.x - lstX, w.y - lstY) * scale;
  if (Math.min(dS, dL) > HIT_R) return null;
  return dS <= dL ? 'src' : 'lst';
}

// The dragged body follows the pointer; its (smoothed) velocity feeds the Doppler formula
function updateDrag(dt) {
  if (!drag) return;
  const hw = SW / scale / 2 - 0.3, hh = SH / scale / 2 - 0.3;
  const tx = Math.min(Math.max(mouseW.x, -hw), hw);
  const ty = Math.min(Math.max(mouseW.y, -hh), hh);
  const isSrc = drag === 'src';
  const px = isSrc ? srcX : lstX, py = isSrc ? srcY : lstY;
  const vel = isSrc ? srcV : lstV;
  if (running) {
    const k = 1 - Math.exp(-dt / 0.12);   // smoothing: mouse events are jittery
    vel.x += ((tx - px) / dt * WORLD_SCALE - vel.x) * k;
    vel.y += ((ty - py) / dt * WORLD_SCALE - vel.y) * k;
  } else {
    vel.x = 0; vel.y = 0;
  }
  if (isSrc) { srcX = tx; srcY = ty; } else { lstX = tx; lstY = ty; }
}

canvas.style.touchAction = 'none';
canvas.addEventListener('pointerdown', e => {
  const w = pointerWorld(e);
  const hit = hitTest(w);
  if (!hit) return;
  drag = hit;
  mouseW.x = w.x; mouseW.y = w.y;
  const vel = hit === 'src' ? srcV : lstV;
  vel.x = 0; vel.y = 0;
  canvas.setPointerCapture(e.pointerId);
  canvas.style.cursor = 'grabbing';
});
canvas.addEventListener('pointermove', e => {
  const w = pointerWorld(e);
  mouseW.x = w.x; mouseW.y = w.y;
  if (!drag) canvas.style.cursor = hitTest(w) ? 'grab' : 'default';
});
const endDrag = () => { drag = null; canvas.style.cursor = 'default'; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// ── Main loop ─────────────────────────────────────────────────────────────────
function setRunning(v) {
  running = v;
  document.getElementById('btnPlay').textContent = v ? '⏸  PAUSA' : '▶  RIPRENDI';
}

function loop(ts) {
  requestAnimationFrame(loop);

  const dt = lastTS === null ? 0 : Math.min((ts - lastTS) / 1000, 0.05);
  lastTS = ts;

  // Velocities: slider value, replaced by the mouse velocity for a dragged body
  if (drag !== 'src') { srcV.x = P.vSource;   srcV.y = 0; }
  if (drag !== 'lst') { lstV.x = P.vListener; lstV.y = 0; }
  if (dt > 0) updateDrag(dt);

  if (running && dt > 0) {
    // Advance sim time
    simT += dt;

    // Move source and listener (wrap horizontally at ±world boundary)
    const worldBound = 12;
    if (drag !== 'src') srcX += (P.vSource / WORLD_SCALE) * dt;
    if (drag !== 'lst') lstX += (P.vListener / WORLD_SCALE) * dt;

    // Soft wrap to keep them visible
    if (srcX >  worldBound) srcX -= 2 * worldBound;
    if (srcX < -worldBound) srcX += 2 * worldBound;
    if (lstX >  worldBound) lstX -= 2 * worldBound;
    if (lstX < -worldBound) lstX += 2 * worldBound;

    // Emit new wavefront — interval proportional to 1/fSource so spacing reflects wavelength
    const emitInterval = 26 / P.fSource;
    if (simT >= nextEmit) {
      wavefronts.push({ ox: srcX, oy: srcY, r: 0 });
      nextEmit = simT + emitInterval;
      if (wavefronts.length > MAX_WAVEFRONTS) wavefronts.shift();
    }

    // Grow all wavefronts
    const vSoundW = P.vSound / WORLD_SCALE;
    for (const wf of wavefronts) wf.r += vSoundW * dt;

    // Remove wavefronts that are too large
    const cullR = Math.sqrt(SW * SW + SH * SH) / scale * 1.3;
    while (wavefronts.length > 0 && wavefronts[0].r > cullR) wavefronts.shift();

    // Doppler frequency
    const fObs = computeFObs();
    const mach = getMachNumber();

    if (isFinite(fObs)) {
      histT.push(simT);
      histF.push(fObs);
      if (histT.length > HIST_MAX) { histT.shift(); histF.shift(); }
      if (P.audioOn) updateAudioFreq(fObs);
    }

    // Readout
    const fObsDisplay = isFinite(fObs) ? Lab.fmt(fObs,1) + ' Hz' : 'cono di Mach';
    readout.set('fObs',  fObsDisplay);
    readout.set('fSrc',  Lab.fmt(P.fSource,0) + ' Hz');
    readout.set('mach',  Lab.fmt(mach,2));
    readout.set('shift', isFinite(fObs) ? (fObs - P.fSource > 0 ? '+' : '') + Lab.fmt((fObs - P.fSource),1) + ' Hz' : '—');
  }

  // Draw
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  computeScale();
  const C = getColors();
  drawBackground(C);
  const mach = getMachNumber();
  drawWavefronts(C, mach);
  drawSource(C);
  drawListener(C);
  drawMachLabel(C, mach);
  drawDragHint(C);
  drawGraph(C);
}

// ── Init ──────────────────────────────────────────────────────────────────────
Lab.initTheme('themeToggle');
resetSim();
resize();
buildControls();
window.addEventListener('resize', resize);

document.getElementById('btnPlay').addEventListener('click', () => setRunning(!running));
document.getElementById('btnReset').addEventListener('click', () => {
  resetSim();
});

requestAnimationFrame(loop);
