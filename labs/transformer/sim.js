'use strict';

/* ── Canvas ──────────────────────────────────────────────────────────────── */
const sc   = document.getElementById('simCanvas');
const ctx  = sc.getContext('2d');
let DPR  = window.devicePixelRatio || 1;
let SW = 0, SH = 0;
let gCanvas = [];

Lab.initTheme('themeToggle');
const dk = () => document.documentElement.dataset.theme !== 'light';

/* ── Core materials ──────────────────────────────────────────────────────── */
const CORES = [
  { label: 'Aria',           k: 0.08,  hint: 'k ≈ 8%',    df: 'rgba(70,90,120,0.18)',  lf: 'rgba(160,175,200,0.28)' },
  { label: 'Ferrite',        k: 0.97,  hint: 'k ≈ 97%',   df: '#2d1004',               lf: '#7a4028'                },
  { label: 'Ferro laminato', k: 0.995, hint: 'k ≈ 99.5%', df: '#141420',               lf: '#505068'                },
];

/* ── Parameters ──────────────────────────────────────────────────────────── */
const P = {
  V1:    120,
  N1:    100,
  N2:    200,
  f:     50,
  core:  1,
  ac:    true,
  speed: 0.10,   // rallentatore (0,1 = dieci volte più lento del vero)
  RL:    100,    // resistenza di carico sul secondario (Ω)
};

const ratio   = () => P.N2 / P.N1;
const kc      = () => CORES[P.core].k;
const V2peak  = () => P.ac ? ratio() * P.V1 * kc() : 0;
const V1rms   = () => P.ac ? P.V1 / Math.SQRT2 : P.V1;
const V2rms   = () => P.ac ? V2peak() / Math.SQRT2 : 0;
const v1at    = t  => P.ac ? P.V1     * Math.sin(2 * Math.PI * P.f * t) : P.V1;
const v2at    = t  => P.ac ? V2peak() * Math.sin(2 * Math.PI * P.f * t) : 0;
// Φ(t) = -V₁/(N₁·ω) · cos(ωt)  from Faraday V₁ = N₁·dΦ/dt; Φ=0 for DC (dΦ/dt=0 → V₂=0)
const phiPeak = () => P.ac ? P.V1 / (P.N1 * 2 * Math.PI * P.f) : 0;
const phiAt   = t  => P.ac ? -phiPeak() * Math.cos(2 * Math.PI * P.f * t) : 0;
// correnti con il carico R_L: I₂ = V₂/R_L; nel trasformatore ideale la potenza si conserva,
// quindi I₁ ≈ (N₂/N₁)·I₂ (si trascura la piccola corrente di magnetizzazione)
const I2peak  = () => V2peak() / P.RL;
const I1peak  = () => kc() * ratio() * I2peak();
const i2at    = t  => v2at(t) / P.RL;
const i1at    = t  => P.ac ? I1peak() * Math.sin(2 * Math.PI * P.f * t) : 0;

/* ── Time ────────────────────────────────────────────────────────────────── */
let simT = 0;
let lastTS = null;

/* ── Layout (H-frame core, recomputed on resize) ─────────────────────────── */
// Geometry: rectangular frame with central window.
// Left leg = primary coil, right leg = secondary coil.
let CX, CY, CH;
let legW, barH, winW;
let frameL, frameR, frameT, frameB;
let winL, winR, coilT, coilB, coilH_px;
let legLcx, legRcx;    // leg center x
let rx;                 // horizontal radius of coil ellipses
let priWireX, secWireX, leftLineX, rightLineX;

function computeLayout() {
  CX  = SW * 0.50;
  CY  = SH * 0.47;
  CH  = Math.min(SH * 0.62, 200);

  legW = Math.max(22, Math.min(40, SW * 0.055));
  barH = Math.max(18, CH * 0.14);
  winW = legW * 3.2;

  const frameW = 2 * legW + winW;
  frameL = CX - frameW / 2;
  frameR = CX + frameW / 2;
  frameT = CY - CH / 2;
  frameB = CY + CH / 2;

  winL   = frameL + legW;
  winR   = frameR - legW;
  legLcx = frameL + legW / 2;
  legRcx = frameR - legW / 2;
  coilT  = frameT + barH;
  coilB  = frameB - barH;
  coilH_px = coilB - coilT;

  rx = legW * 1.40;           // ellipse horizontal radius — bulge outside the frame
  priWireX  = frameL;        // arc endpoints on the outer left face of the core
  secWireX  = frameR;        // arc endpoints on the outer right face of the core
  leftLineX  = priWireX - 40;
  rightLineX = secWireX + 40;
}

/* ── Color helpers ───────────────────────────────────────────────────────── */
const CYAN = (dark, a = 1) => dark ? `rgba(0,212,255,${a})`  : `rgba(0,110,200,${a})`;
const ORNG = (dark, a = 1) => dark ? `rgba(255,153,68,${a})` : `rgba(180,75,0,${a})`;

/* ── Main draw ───────────────────────────────────────────────────────────── */
function drawSim() {
  const dark = dk();
  ctx.save(); ctx.scale(DPR, DPR);
  ctx.fillStyle = dark ? '#060a10' : '#e8f0f8';
  ctx.fillRect(0, 0, SW, SH);
  drawGrid(dark);
  drawTransformer(dark);
  ctx.restore();
}

function drawGrid(dark) {
  ctx.save();
  ctx.strokeStyle = dark ? 'rgba(0,212,255,0.055)' : 'rgba(0,80,180,0.07)';
  ctx.lineWidth = 1;
  for (let x = 40; x < SW; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, SH); ctx.stroke(); }
  for (let y = 40; y < SH; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SW, y); ctx.stroke(); }
  ctx.restore();
}

function drawTransformer(dark) {
  const wireTop = frameT - 30, wireBot = frameB + 30;

  // Drawing order: core first → coil arcs ON TOP (clipped to their leg area).
  // Clipping keeps arcs off the window while they remain visible over the core.

  // 1. Core frame
  drawCore(dark);

  // 2. Flux animation in the window area
  drawFlux(dark);

  // 3. Primary coil arcs: outer face frameL → inner face winL, bulge left
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, winL + 1, SH); ctx.clip();
  drawCoilArcs(frameL, winL, coilT, coilB, P.N1, CYAN(dark), true);
  ctx.restore();

  // 4. Secondary coil arcs: outer face frameR → inner face winR, bulge right
  ctx.save();
  ctx.beginPath(); ctx.rect(winR - 1, 0, SW - winR + 1, SH); ctx.clip();
  drawCoilArcs(frameR, winR, coilT, coilB, P.N2, ORNG(dark), false);
  ctx.restore();

  // 4. Circuit wires
  const lw = 2;
  ctx.save();
  ctx.lineWidth = lw;

  // Primary outer spine and top/bottom connectors
  ctx.strokeStyle = CYAN(dark);
  ctx.beginPath();
  ctx.moveTo(priWireX, wireTop); ctx.lineTo(priWireX, coilT);
  ctx.moveTo(priWireX, coilB);  ctx.lineTo(priWireX, wireBot);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(leftLineX, wireTop); ctx.lineTo(priWireX, wireTop);
  ctx.moveTo(leftLineX, wireBot); ctx.lineTo(priWireX, wireBot);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(leftLineX, wireTop); ctx.lineTo(leftLineX, CY - 22);
  ctx.moveTo(leftLineX, CY + 22); ctx.lineTo(leftLineX, wireBot);
  ctx.stroke();

  // Secondary outer spine and top/bottom connectors
  ctx.strokeStyle = ORNG(dark);
  ctx.beginPath();
  ctx.moveTo(secWireX, wireTop); ctx.lineTo(secWireX, coilT);
  ctx.moveTo(secWireX, coilB);  ctx.lineTo(secWireX, wireBot);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(secWireX, wireTop); ctx.lineTo(rightLineX, wireTop);
  ctx.moveTo(secWireX, wireBot); ctx.lineTo(rightLineX, wireBot);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(rightLineX, wireTop); ctx.lineTo(rightLineX, CY - 22);
  ctx.moveTo(rightLineX, CY + 22); ctx.lineTo(rightLineX, wireBot);
  ctx.stroke();
  ctx.restore();

  // 5. Source and load
  drawSource(leftLineX, CY, dark);
  drawLoad(rightLineX, CY, dark);

  // 6. Animated current dots
  if (P.ac) {
    const span = wireBot - wireTop;
    const frac  = ((2 * Math.PI * P.f * simT) % (2 * Math.PI)) / (2 * Math.PI);
    const frac2 = (frac + 0.5) % 1;
    ctx.beginPath(); ctx.arc(priWireX, wireTop + frac  * span, 3.5, 0, 2 * Math.PI);
    ctx.fillStyle = CYAN(dark, 0.85); ctx.fill();
    ctx.beginPath(); ctx.arc(secWireX, wireTop + frac2 * span, 3.5, 0, 2 * Math.PI);
    ctx.fillStyle = ORNG(dark, 0.85); ctx.fill();
  }

  // 7. Labels
  ctx.save();

  // Primary: static peak + RMS (no instantaneous — too fast to read)
  ctx.fillStyle = CYAN(dark);
  ctx.font = 'bold 10px "Space Mono",monospace';
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillText(`V₁ = ${Lab.fmt(P.V1, 0)} V di picco`, leftLineX - 24, CY - 24);
  ctx.font = '8px "Space Mono",monospace';
  ctx.fillStyle = CYAN(dark, 0.65);
  ctx.fillText(`${Lab.fmt(V1rms(), 1)} V efficaci`, leftLineX - 24, CY - 12);
  // N₁ label
  ctx.fillStyle = CYAN(dark, 0.60);
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(`N₁ = ${P.N1}`, priWireX, frameT - 5);

  // Secondary: static
  ctx.fillStyle = ORNG(dark);
  ctx.font = 'bold 10px "Space Mono",monospace';
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText(`V₂ = ${Lab.fmt(V2peak(), 1)} V di picco`, rightLineX + 24, CY - 24);
  ctx.font = '8px "Space Mono",monospace';
  ctx.fillStyle = ORNG(dark, 0.65);
  ctx.fillText(`${Lab.fmt(V2rms(), 1)} V efficaci`, rightLineX + 24, CY - 12);
  // N₂ label
  ctx.fillStyle = ORNG(dark, 0.60);
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(`N₂ = ${P.N2}`, secWireX, frameT - 5);

  // Turns ratio + efficiency below frame
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.30)' : 'rgba(0,0,0,0.28)';
  ctx.font = '8px "Space Mono",monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(`N₂/N₁ = ${Lab.fmt(ratio(), 2)}   accoppiamento k = ${Lab.fmt(kc() * 100, 1)} %`, CX, frameB + 10);

  // AC/DC badge (inside window top)
  ctx.fillStyle = CYAN(dark, 0.40);
  ctx.font = 'bold 8px "Space Mono",monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(P.ac ? '∿  AC' : '⎓  DC', CX, coilT + 4);

  ctx.restore();
}

/* ── Coil arcs ───────────────────────────────────────────────────────────── */
// Each arc: quadratic bezier from outerX (core outer face) to innerX (window face).
// Control point pushed outward by rx → arc bulges outside the core.
// 1 visible arc per 10 real turns, max 30 arcs.
function drawCoilArcs(outerX, innerX, coilTop, coilBot, N, col, goLeft) {
  const MAX_VIS = 30;
  const visN  = Math.min(Math.ceil(N / 10), MAX_VIS);
  const turnH = (coilBot - coilTop) / visN;
  const cpX   = goLeft ? outerX - rx : outerX + rx;

  ctx.save();
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.8;

  for (let i = 0; i < visN; i++) {
    const y1 = coilTop + i * turnH;
    const y2 = coilTop + (i + 1) * turnH;
    ctx.beginPath();
    ctx.moveTo(outerX, y1);
    ctx.quadraticCurveTo(cpX, (y1 + y2) * 0.5, innerX, y2);
    ctx.stroke();
  }
  ctx.restore();
}

/* ── Core H-frame ────────────────────────────────────────────────────────── */
// Filled rectangle with an inner window cut out using evenodd fill.
// Drawn on top of coil arcs — covers the inner arc portions automatically.
function drawCore(dark) {
  const core = CORES[P.core];
  ctx.save();

  // Fill frame (outer rect minus inner window) using evenodd rule
  ctx.fillStyle = dark ? core.df : core.lf;
  ctx.beginPath();
  // Outer rectangle (CW)
  ctx.moveTo(frameL, frameT); ctx.lineTo(frameR, frameT);
  ctx.lineTo(frameR, frameB); ctx.lineTo(frameL, frameB); ctx.closePath();
  // Inner window (CCW = hole)
  ctx.moveTo(winL, coilT); ctx.lineTo(winL, coilB);
  ctx.lineTo(winR, coilB); ctx.lineTo(winR, coilT); ctx.closePath();
  ctx.fill('evenodd');

  // Borders
  const sc_col = dark ? 'rgba(0,212,255,0.28)' : 'rgba(0,80,160,0.30)';
  ctx.strokeStyle = sc_col; ctx.lineWidth = 1.5;
  ctx.strokeRect(frameL, frameT, frameR - frameL, frameB - frameT);
  ctx.strokeRect(winL, coilT, winR - winL, coilB - coilT);

  // Material label in window
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.20)';
  ctx.font = '7px "Space Mono",monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(CORES[P.core].label, CX, CY);

  ctx.restore();
}

/* ── Magnetic flux in window ─────────────────────────────────────────────── */
function drawFlux(dark) {
  const phi = 2 * Math.PI * P.f * simT;
  const amp = P.ac
    ? Math.abs(Math.sin(phi)) * 0.55 + 0.10
    : (P.core > 0 ? 0.30 : 0.06);
  const dir = P.ac ? (Math.sin(phi) >= 0 ? 1 : -1) : 1;
  const col = dark ? `rgba(0,212,255,${amp})` : `rgba(0,80,160,${amp})`;

  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = 1;
  const n = 4;
  for (let i = 0; i < n; i++) {
    const y = coilT + (i + 0.5) * coilH_px / n;
    ctx.beginPath(); ctx.moveTo(winL + 4, y); ctx.lineTo(winR - 4, y); ctx.stroke();
  }
  const mx = CX, my = CY;
  ctx.beginPath();
  ctx.moveTo(mx, my); ctx.lineTo(mx + dir * 6, my - 3);
  ctx.moveTo(mx, my); ctx.lineTo(mx + dir * 6, my + 3);
  ctx.stroke();
  ctx.restore();
}

/* ── AC source / DC battery ──────────────────────────────────────────────── */
function drawSource(x, y, dark) {
  const R = 17;
  ctx.save();
  ctx.strokeStyle = CYAN(dark); ctx.fillStyle = dark ? '#060a10' : '#e8f0f8';
  ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.arc(x, y, R, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  if (P.ac) {
    ctx.strokeStyle = CYAN(dark); ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let xi = -11; xi <= 11; xi++) {
      const yn = -Math.sin((xi / 11) * Math.PI) * 7;
      xi === -11 ? ctx.moveTo(x + xi, y + yn) : ctx.lineTo(x + xi, y + yn);
    }
    ctx.stroke();
  } else {
    ctx.strokeStyle = CYAN(dark);
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(x - 5, y - 7); ctx.lineTo(x - 5, y + 7); ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x + 2, y - 4); ctx.lineTo(x + 2, y + 4); ctx.stroke();
  }
  ctx.restore();
}

/* ── Load resistor ───────────────────────────────────────────────────────── */
function drawLoad(x, y, dark) {
  const w = 16, h = 30;
  ctx.save();
  ctx.strokeStyle = ORNG(dark); ctx.fillStyle = dark ? '#060a10' : '#e8f0f8';
  ctx.lineWidth = 1.8;
  ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.strokeRect(x - w / 2, y - h / 2, w, h);
  ctx.fillStyle = ORNG(dark, 0.55);
  ctx.font = '8px "Space Mono",monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('R', x, y);
  ctx.restore();
}

/* ── Grafici ─────────────────────────────────────────────────────────────── */
// Tre periodi della tensione di rete (tempo vero): tensioni, flusso nel nucleo, correnti.
function drawGraphs() {
  const C = Lab.graphColors(), PHICOL = C.violet;
  const win = P.ac ? 3 / P.f : 0.08, tu = win < 0.02 ? [1e-3, 'ms'] : [1e-3, 'ms'];
  const t1 = Math.max(simT, win), t0 = t1 - win;
  const xr = [t0 / tu[0], t1 / tu[0]];
  const ser = fn => { const out = []; for (let i = 0; i <= 300; i++) { const t = t0 + win * i / 300; out.push([t / tu[0], fn(t)]); } return out; };
  const vM = Lab.niceMax(Math.max(P.V1, V2peak(), 1));
  let g = Lab.panel(gCanvas[0], { title: 'Tensioni (V)', xr, yr: [-vM, vM], xLabel: `t (${tu[1]})` });
  if (g) {
    const [c, f] = g;
    Lab.plotPts(c, f, ser(v1at), C.accent, 2);
    Lab.plotPts(c, f, ser(v2at), C.amber, 2);
    Lab.legend(c, f.L + 8, f.T + 8, [[C.accent, 'v₁ primario'], [C.amber, 'v₂ secondario']]);
  }
  const fM = Lab.niceMax(Math.max(phiPeak() * 1e3, 1e-3));
  g = Lab.panel(gCanvas[1], { title: 'Flusso nel nucleo Φ (mWb)', xr, yr: [-fM, fM], xLabel: `t (${tu[1]})`, yFmt: v => Lab.sci(v, 2) });
  if (g) { const [c, f] = g; Lab.plotPts(c, f, ser(t => phiAt(t) * 1e3), PHICOL, 2); }
  const iM = Lab.niceMax(Math.max(I1peak(), I2peak(), 1e-3));
  g = Lab.panel(gCanvas[2], { title: `Correnti (A) con carico ${P.RL} Ω`, xr, yr: [-iM, iM], xLabel: `t (${tu[1]})`, yFmt: v => Lab.sci(v, 2) });
  if (g) {
    const [c, f] = g;
    Lab.plotPts(c, f, ser(i1at), C.accent, 2);
    Lab.plotPts(c, f, ser(i2at), C.amber, 2);
    Lab.legend(c, f.L + 8, f.T + 8, [[C.accent, 'i₁'], [C.amber, 'i₂']]);
  }
}

/* ── Readout ──────────────────────────────────────────────────────────────── */
function updateReadout() {
  document.getElementById('readout').innerHTML = [
    { label: 'V₁ efficace', value: P.ac ? `${Lab.fmt(V1rms(),1)} V` : `${Lab.fmt(P.V1,0)} V` },
    { label: 'V₂ efficace', value: P.ac ? `${Lab.fmt(V2rms(),1)} V` : '0 V' },
    { label: 'rapporto N₂/N₁', value: Lab.fmt(ratio(),2) },
    { label: 'I₂ efficace', value: Lab.sci(I2peak() / Math.SQRT2, 3) + ' A' },
    { label: 'I₁ efficace', value: Lab.sci(I1peak() / Math.SQRT2, 3) + ' A' },
    { label: 'potenza al carico', value: Lab.sci(V2rms() * I2peak() / Math.SQRT2, 3) + ' W' },
    { label: 'Φ di picco', value: P.ac ? `${Lab.sci(phiPeak()*1000,3)} mWb` : '0 mWb' },
  ].map(r =>
    `<span class="readout-item"><span class="readout-label">${r.label}</span><span class="readout-value">${r.value}</span></span>`
  ).join('');
}

/* ── Animation loop ──────────────────────────────────────────────────────── */
function loop(ts) {
  if (lastTS !== null) {
    simT += Math.min((ts - lastTS) / 1000, 0.04) * P.speed;
  }
  lastTS = ts;
  drawSim();
  drawGraphs();
  updateReadout();
  requestAnimationFrame(loop);
}

/* ── Controls ────────────────────────────────────────────────────────────── */
function buildControls() {
  const ctrl = document.getElementById('controls');
  ctrl.innerHTML = '';

  const sSec = Lab.Section('Sorgente');
  sSec.add(Lab.RadioGroup({
    label: 'Tensione al primario',
    options: [{ value: 'ac', label: 'Alternata', hint: 'sinusoidale' }, { value: 'dc', label: 'Continua', hint: 'nessuna induzione' }],
    value: P.ac ? 'ac' : 'dc',
    onChange: v => { P.ac = v === 'ac'; simT = 0; },
  }));
  sSec.add(Lab.Slider({ label: 'V₁ di picco', min: 10, max: 500, step: 5, value: P.V1, unit: ' V',
    onChange: v => { P.V1 = v; } }));
  sSec.add(Lab.Slider({ label: 'Frequenza', min: 1, max: 1000, step: 1, value: P.f, unit: ' Hz',
    onChange: v => { P.f = v; } }));
  sSec.add(Lab.Slider({ label: 'Rallentatore', min: 0.01, max: 2, step: 0.01, value: P.speed, unit: '×',
    onChange: v => { P.speed = v; } }));
  ctrl.appendChild(sSec.el);

  const nSec = Lab.Section('Avvolgimenti e carico');
  nSec.add(Lab.Slider({ label: 'Spire primario N₁', min: 1, max: 500, step: 1, value: P.N1,
    onChange: v => { P.N1 = v; } }));
  nSec.add(Lab.Slider({ label: 'Spire secondario N₂', min: 1, max: 500, step: 1, value: P.N2,
    onChange: v => { P.N2 = v; } }));
  nSec.add(Lab.Slider({ label: 'Carico R_L', min: 10, max: 1000, step: 10, value: P.RL, unit: ' Ω',
    onChange: v => { P.RL = v; } }));
  const note = document.createElement('div');
  note.className = 'lab-note';
  note.innerHTML = 'V₂/V₁ = N₂/N₁ e, conservando la potenza, I₁/I₂ = N₂/N₁: chi alza la tensione abbassa la corrente. In continua il flusso non varia e al secondario non arriva nulla.';
  nSec.add(note);
  ctrl.appendChild(nSec.el);

  const cSec = Lab.Section('Nucleo magnetico');
  cSec.add(Lab.RadioGroup({
    label: 'Materiale',
    options: CORES.map((c, i) => ({ label: c.label, value: i, hint: c.hint })),
    value: P.core,
    onChange: v => { P.core = +v; },
  }));
  ctrl.appendChild(cSec.el);
}

/* ── Resize ──────────────────────────────────────────────────────────────── */
function resizeCanvases() {
  const area = sc.parentElement;
  const ga   = document.getElementById('graphArea');
  if (!gCanvas.length) gCanvas = Lab.graphPanels(ga, 3, 180);
  const rd   = area.querySelector('.readout-bar');
  const rdH  = rd ? rd.offsetHeight || 48 : 48;
  const gaH  = ga.offsetHeight || 180;
  DPR = window.devicePixelRatio || 1;
  SW = area.clientWidth;
  SH = Math.max(80, area.clientHeight - gaH - rdH);
  Lab.hidpi(sc, SW, SH);
  Lab.fitPanels(gCanvas);
}

new ResizeObserver(() => { resizeCanvases(); computeLayout(); }).observe(sc.parentElement);

function init() {
  resizeCanvases();
  buildControls();
  computeLayout();
  requestAnimationFrame(loop);
}

init();
