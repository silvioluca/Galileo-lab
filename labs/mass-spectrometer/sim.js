'use strict';

/* ── Canvas ──────────────────────────────────────────────────────────────── */
const sc   = document.getElementById('simCanvas');
const ctx  = sc.getContext('2d');
let DPR  = window.devicePixelRatio || 1;
let SW = 0, SH = 0;
let gCanvas = [];

Lab.initTheme('themeToggle');
const dk = () => document.documentElement.dataset.theme !== 'light';

/* ── Physical constants ──────────────────────────────────────────────────── */
const E_C = 1.602e-19;   // C per elementary charge
const U_M = 1.661e-27;   // kg per atomic mass unit

/* ── Parameters ──────────────────────────────────────────────────────────── */
// Setup: B into page (⊗). Positive ions enter downward through slit.
// Lorentz force curves them to the right → semicircle → screen at same height.
// r = m·v / (q·B).   Hit position x = 2r from entry slit.
const P = {
  B:  0.50,   // T (into page, always > 0)
  v:  10,     // ×10⁵ m/s
  q:  1,      // elementary charges (integer)
  m1: 20,     // u  (isotope 1, cyan)
  m2: 22,     // u  (isotope 2, orange)
};

function vSI()           { return P.v * 1e5; }
function larmor(m_u)     { return (m_u * U_M * vSI()) / (P.q * E_C * P.B); }

/* ── Geometry ────────────────────────────────────────────────────────────── */
let r1 = 0, r2 = 0;     // radii in metres
let DIV_Y  = 0;          // y of the divider / screen line (canvas px)
let ENTRY_X = 0;         // x of the entry slit (canvas px)
let PX_PER_M = 1;        // canvas pixels per metre — fixed at default params

// Reference values used to fix the scale (default P).
// PX_PER_M is computed once so changing params makes arcs grow/shrink visually.
const REF_M1 = 20, REF_M2 = 22, REF_B = 0.50, REF_V = 10, REF_Q = 1;

function compute() {
  r1 = larmor(P.m1);
  r2 = larmor(P.m2);
}

function computeLayout() {
  DIV_Y   = Math.round(SH * 0.20);
  ENTRY_X = Math.round(SW * 0.12);
  // Scale fixed to reference default — never changes when P changes.
  const r1ref = (REF_M1 * U_M * REF_V * 1e5) / (REF_Q * E_C * REF_B);
  const r2ref = (REF_M2 * U_M * REF_V * 1e5) / (REF_Q * E_C * REF_B);
  const rMax  = Math.max(r1ref, r2ref);
  const maxH  = SH - DIV_Y - 38;
  const maxW  = SW - ENTRY_X - 24;
  PX_PER_M = Math.min(maxH / rMax, maxW / (2 * rMax)) * 0.86;
}

function rPx(r_m)    { return r_m * PX_PER_M; }
function hitX(r_m)   { return ENTRY_X + 2 * rPx(r_m); }
function arcCX(r_m)  { return ENTRY_X + rPx(r_m); }

/* ── Arrow helper ────────────────────────────────────────────────────────── */
function arrowHead(c, x0, y0, x1, y1, tip) {
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  const a = Math.atan2(y1 - y0, x1 - x0);
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x1 - tip * Math.cos(a - 0.42), y1 - tip * Math.sin(a - 0.42));
  c.lineTo(x1 - tip * Math.cos(a + 0.42), y1 - tip * Math.sin(a + 0.42));
  c.closePath(); c.fill();
}

/* ── Animation state ─────────────────────────────────────────────────────── */
let animFrac = 0;
const ANIM_DT = 1 / 160;

/* ── Main draw ───────────────────────────────────────────────────────────── */
function drawSim() {
  const dark = dk();
  ctx.save(); ctx.scale(DPR, DPR);

  ctx.fillStyle = dark ? '#060a10' : '#e8f0f8';
  ctx.fillRect(0, 0, SW, SH);

  drawBField(dark);
  drawScreen(dark);
  drawPaths(dark);
  drawAnimParticles(dark);
  drawScreenMarkers(dark);
  drawDimLines(dark);
  drawFieldLabel(dark);

  ctx.restore();
}

/* ── B field ⊗ grid ─────────────────────────────────────────────────────── */
function drawBField(dark) {
  const alpha = dark ? 0.20 : 0.15;
  const col   = dark ? `rgba(0,212,255,${alpha})` : `rgba(0,80,160,${alpha})`;
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = col;
  ctx.lineWidth = 1;
  const STEP = 55;
  for (let x = STEP / 2; x < SW; x += STEP) {
    for (let y = DIV_Y + STEP / 2; y < SH - 4; y += STEP) {
      ctx.beginPath(); ctx.arc(x, y, 5.5, 0, 2 * Math.PI); ctx.stroke();
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x - 3.5, y - 3.5); ctx.lineTo(x + 3.5, y + 3.5);
      ctx.moveTo(x + 3.5, y - 3.5); ctx.lineTo(x - 3.5, y + 3.5);
      ctx.stroke(); ctx.lineWidth = 1;
    }
  }
  ctx.restore();
}

/* ── Screen / divider line ───────────────────────────────────────────────── */
function drawScreen(dark) {
  const y = DIV_Y;

  // Main divider (the screen)
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SW, y); ctx.stroke();

  // Cover the slit gap so it looks like a barrier with a hole
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, y - 10, ENTRY_X - 4, 10);            // left of slit
  ctx.fillRect(ENTRY_X + 5, y - 10, SW - ENTRY_X - 5, 10); // right of slit

  // "schermo" label
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.30)' : 'rgba(0,0,0,0.28)';
  ctx.font = '9px "Space Mono", monospace';
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillText('schermo →', SW - 10, y - 14);

  // Entry slit arrow (v₀ downward)
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = dark ? 'rgba(0,212,255,0.60)' : 'rgba(0,100,180,0.65)';
  ctx.lineWidth = 1.5;
  arrowHead(ctx, ENTRY_X, y - 32, ENTRY_X, y - 2, 7);
  ctx.font = '9px "Space Mono", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText('v₀', ENTRY_X, y - 32);
  ctx.restore();

  // "selettore v" hint top-left
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.20)';
  ctx.font = '8px "Space Mono", monospace';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('← selettore di velocità', 8, y / 2);
}

/* ── Dashed semicircular paths ───────────────────────────────────────────── */
function drawPaths(dark) {
  drawArc(r1, dark ? '#00d4ff' : '#0088cc');
  drawArc(r2, dark ? '#ff9944' : '#cc5500');
}

function drawArc(r_m, col) {
  const cx = arcCX(r_m), cy = DIV_Y, rp = rPx(r_m);
  if (rp < 2) return;
  ctx.save();
  // Clip to the B-field region (below divider) so arcs never bleed into the top area.
  ctx.beginPath(); ctx.rect(0, DIV_Y, SW, SH - DIV_Y); ctx.clip();
  ctx.strokeStyle = col;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  // Arc from angle π (left=entry) to 0 (right=exit), anticlockwise → bottom semicircle ✓
  ctx.beginPath(); ctx.arc(cx, cy, rp, Math.PI, 0, true); ctx.stroke();
  ctx.restore();
}

/* ── Animated particles ──────────────────────────────────────────────────── */
function drawAnimParticles(dark) {
  ctx.save();
  ctx.beginPath(); ctx.rect(0, DIV_Y, SW, SH - DIV_Y); ctx.clip();
  drawMovingParticle(r1, animFrac,              '#00d4ff', dark);
  drawMovingParticle(r2, (animFrac + 0.38) % 1, '#ff9944', dark);
  ctx.restore();
}

function drawMovingParticle(r_m, frac, col, dark) {
  const rp = rPx(r_m);
  if (rp < 2) return;
  const cx = arcCX(r_m);
  const angle = Math.PI * (1 - frac); // π → 0, through bottom
  const sx = cx + rp * Math.cos(angle);
  const sy = DIV_Y + rp * Math.sin(angle);
  if (sy < DIV_Y) return;

  // Glow
  const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, 11);
  grd.addColorStop(0, col + 'aa');
  grd.addColorStop(1, col + '00');
  ctx.beginPath(); ctx.arc(sx, sy, 11, 0, 2 * Math.PI);
  ctx.fillStyle = grd; ctx.fill();

  ctx.beginPath(); ctx.arc(sx, sy, 4.5, 0, 2 * Math.PI);
  ctx.fillStyle = col; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1; ctx.stroke();

  // Charge sign
  ctx.fillStyle = '#000';
  ctx.font = 'bold 7px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('+', sx, sy + 0.5);
}

/* ── Screen tick markers ─────────────────────────────────────────────────── */
function drawScreenMarkers(dark) {
  drawTick(r1, '#00d4ff', `m₁=${P.m1} u`, dark, 'above');
  drawTick(r2, '#ff9944', `m₂=${P.m2} u`, dark, 'above');

  // Δx brace between the two hit positions
  const x1 = hitX(r1), x2 = hitX(r2);
  if (Math.abs(x2 - x1) > 6) {
    const xL = Math.min(x1, x2), xR = Math.max(x1, x2);
    const y  = DIV_Y;
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = dark ? 'rgba(255,255,255,0.50)' : 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(xL, y + 6); ctx.lineTo(xR, y + 6); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(xL, y + 3); ctx.lineTo(xL, y + 9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(xR, y + 3); ctx.lineTo(xR, y + 9); ctx.stroke();
    ctx.font = '10px "Space Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(`Δx = ${Lab.fmt(Math.abs(r2 - r1) * 2e2, 1)} cm`, (xL + xR) / 2, y + 16);
    ctx.restore();
  }
}

function drawTick(r_m, col, label, dark, pos) {
  const hx = hitX(r_m), y = DIV_Y;
  if (hx > SW - 2) return;   // off-screen → skip tick
  ctx.save();
  ctx.strokeStyle = col; ctx.fillStyle = col;
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(hx, y - 9); ctx.lineTo(hx, y + 9); ctx.stroke();
  ctx.font = 'bold 10px "Space Mono", monospace';
  // le due etichette si spostano ai lati se i punti d'arrivo sono vicini
  const other = r_m === r1 ? hitX(r2) : hitX(r1), close = Math.abs(other - hx) < 70;
  ctx.textAlign = close ? (hx < other ? 'right' : 'left') : 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(label, hx + (close ? (hx < other ? 4 : -4) : 0), y - 11);
  ctx.restore();
}

/* ── Dimension lines (2r₁, 2r₂) under arcs ──────────────────────────────── */
function drawDimLines(dark) {
  const yBase = DIV_Y + Math.min(Math.max(rPx(r1), rPx(r2)) * 0.95, SH - DIV_Y - 60);
  drawDimLine(r1, yBase + 10,  `2r₁ = ${Lab.fmt(2 * r1 * 100, 1)} cm`, '#00d4ff', dark);
  drawDimLine(r2, yBase + 28, `2r₂ = ${Lab.fmt(2 * r2 * 100, 1)} cm`, '#ff9944', dark);
}

function drawDimLine(r_m, y, label, col, dark) {
  const x0 = ENTRY_X, x1 = Math.min(hitX(r_m), SW - 4);
  if (y > SH - 8) return;
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = col;
  ctx.globalAlpha = 0.48;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x0, y - 3); ctx.lineTo(x0, y + 3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x1, y - 3); ctx.lineTo(x1, y + 3); ctx.stroke();
  ctx.globalAlpha = 0.72;
  ctx.font = '10px "Space Mono", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(label, (x0 + x1) / 2, y - 2);
  ctx.restore();
}

/* ── B label ─────────────────────────────────────────────────────────────── */
function drawFieldLabel(dark) {
  ctx.fillStyle = dark ? 'rgba(0,212,255,0.55)' : 'rgba(0,80,160,0.60)';
  ctx.font = 'bold 10px "Space Mono", monospace';
  ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.fillText(`B = ${Lab.fmt(P.B, 2)} T  ⊗ (entrante)`, SW - 10, DIV_Y + 10);
}

/* ── Grafici ─────────────────────────────────────────────────────────────── */
// 1: raggio in funzione della massa (retta: r ∝ m); 2: raggio in funzione di B (iperbole: r ∝ 1/B).
// L'asse delle masse è fisso (1–200 u); quello dei raggi a gradini, con i valori scritti.
function drawGraphs() {
  const C = Lab.graphColors(), c1 = '#00d4ff', c2 = '#ff9944';
  const rOf = (m, B) => (m * U_M * vSI()) / (P.q * E_C * B) * 100;    // cm
  let rm = Lab.niceMax(rOf(200, P.B));
  let g = Lab.panel(gCanvas[0], { title: 'Raggio r = mv/(qB) in funzione della massa (cm)', xr: [0, 200], yr: [0, rm], xLabel: 'm (u)', yFmt: v => Lab.sci(v, 2) });
  if (g) {
    const [c, f] = g;
    Lab.plot(c, f, m => rOf(m, P.B), [0, 200], C.text, 1.5);
    Lab.dot(c, f, P.m1, r1 * 100, c1, 4.5); Lab.dot(c, f, P.m2, r2 * 100, c2, 4.5);
    Lab.legend(c, f.L + 8, f.T + 8, [[c1, `m₁ = ${P.m1} u`], [c2, `m₂ = ${P.m2} u`]]);
  }
  rm = Lab.niceMax(rOf(Math.max(P.m1, P.m2), 0.25));
  g = Lab.panel(gCanvas[1], { title: 'Raggio in funzione del campo B (cm)', xr: [0, 3], yr: [0, rm], xLabel: 'B (T)', yFmt: v => Lab.sci(v, 2) });
  if (g) {
    const [c, f] = g;
    Lab.plot(c, f, B => rOf(P.m1, B), [0.02, 3], c1, 2);
    Lab.plot(c, f, B => rOf(P.m2, B), [0.02, 3], c2, 2);
    c.save(); c.setLineDash([3, 3]); c.strokeStyle = C.text; c.beginPath(); c.moveTo(f.X(P.B), f.T); c.lineTo(f.X(P.B), f.B); c.stroke(); c.restore();
    Lab.dot(c, f, P.B, r1 * 100, c1, 4.5); Lab.dot(c, f, P.B, r2 * 100, c2, 4.5);
  }
}

/* ── Readout ─────────────────────────────────────────────────────────────── */
function updateReadout() {
  const dr = Math.abs(r2 - r1);
  document.getElementById('readout').innerHTML = [
    { label: 'raggio isotopo 1', value: Lab.fmt((r1 * 100),2) + ' cm' },
    { label: 'raggio isotopo 2', value: Lab.fmt((r2 * 100),2) + ' cm' },
    { label: 'differenza dei raggi', value: Lab.fmt((dr * 100),2) + ' cm' },
    { label: 'distanza sulla lastra', value: Lab.fmt((dr * 200),2) + ' cm' },
  ].map(r =>
    `<span class="readout-item"><span class="readout-label">${Lab.keepCaseHTML(r.label)}</span><span class="readout-value">${r.value}</span></span>`
  ).join('');
}

/* ── Animation loop ──────────────────────────────────────────────────────── */
function loop() {
  animFrac = (animFrac + ANIM_DT) % 1;
  drawSim();
  drawGraphs();
  updateReadout();
  requestAnimationFrame(loop);
}

/* ── Controls ────────────────────────────────────────────────────────────── */
function buildControls() {
  const ctrl = document.getElementById('controls');
  ctrl.innerHTML = '';

  const bSec = Lab.Section('Campo Magnetico');
  bSec.add(Lab.Slider({ label: 'Campo B (entrante ⊗)', min: 0.05, max: 3, step: 0.01, value: P.B, unit: ' T',
    onChange: v => { P.B = v; refresh(); } }));
  ctrl.appendChild(bSec.el);

  const vSec = Lab.Section('Velocità  (da selettore)');
  vSec.add(Lab.Slider({ label: 'Velocità v₀', min: 1, max: 100, step: 1, value: P.v, unit: '·10⁵ m/s',
    onChange: v => { P.v = v; refresh(); } }));
  ctrl.appendChild(vSec.el);

  const iSec = Lab.Section('Ione');
  iSec.add(Lab.Slider({ label: 'Carica q', min: 1, max: 4, step: 1, value: P.q, unit: ' e',
    onChange: v => { P.q = v; refresh(); } }));
  ctrl.appendChild(iSec.el);

  const mSec = Lab.Section('Isotopi');
  mSec.add(Lab.Slider({ label: 'Massa m₁', min: 1, max: 200, step: 1, value: P.m1, unit: ' u',
    onChange: v => { P.m1 = v; refresh(); } }));
  mSec.add(Lab.Slider({ label: 'Massa m₂', min: 1, max: 200, step: 1, value: P.m2, unit: ' u',
    onChange: v => { P.m2 = v; refresh(); } }));
  ctrl.appendChild(mSec.el);
}

function refresh() { compute(); }

/* ── Resize ──────────────────────────────────────────────────────────────── */
function resizeCanvases() {
  const area = sc.parentElement;
  const ga   = document.getElementById('graphArea');
  if (!gCanvas.length) gCanvas = Lab.graphPanels(ga, 2, 180);
  const rd   = area.querySelector('.readout-bar');
  const rdH  = rd ? rd.offsetHeight || 48 : 48;
  const gaH  = ga.offsetHeight || 180;
  DPR = window.devicePixelRatio || 1;
  SW = area.clientWidth;
  SH = Math.max(80, area.clientHeight - gaH - rdH);
  Lab.hidpi(sc, SW, SH);
  Lab.fitPanels(gCanvas);
  computeLayout();
}

new ResizeObserver(() => { resizeCanvases(); refresh(); }).observe(sc.parentElement);

function init() {
  resizeCanvases();
  buildControls();
  compute();
  computeLayout();
  requestAnimationFrame(loop);
}

init();
