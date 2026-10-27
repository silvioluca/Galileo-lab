'use strict';

const sc   = document.getElementById('simCanvas');
const ctx  = sc.getContext('2d');
let DPR  = window.devicePixelRatio || 1;
let SW = 0, SH = 0;
let gCanvas = [];

Lab.initTheme('themeToggle');
const dk = () => document.documentElement.dataset.theme !== 'light';

/* ── Physics (μ₀ = ε₀ = 1) ──────────────────────────────────────────────────
   AC: I(t) = I₀·sin(ωt),  E(t) = -cos(ωt)·E_max  (90° lag)
   DC: I(t) = I₀ (costante),  E(t) = (t·f)%1       (rampa lineare)
   In entrambi i casi: I_d = ε₀·dΦ_E/dt = I_c  →  ∮ B·dl uguale nel filo e nel gap
   ─────────────────────────────────────────────────────────────────────────── */

// Valori reali: corrente in mA, frequenza in kHz, misure in cm (PX_CM pixel per cm).
// L'animazione è al rallentatore: un periodo di 1 ms dura circa 3 s sullo schermo.
const PX_CM = 10, EPS0 = 8.854e-12, MU0 = 4e-7 * Math.PI;
const SLOW = 0.35;                          // periodi mostrati al secondo per ogni kHz
const P = {
  I0: 1.0,   // corrente di picco (mA)
  f:  1.0,   // frequenza (kHz) — in continua: frequenza delle ricariche
  R:  85,    // raggio delle armature = raggio del percorso (pixel; 8,5 cm)
  d:  65,    // semidistanza fra le armature (pixel; 6,5 cm)
  ac: true,  // true = alternata, false = continua
};
const fAnim = () => SLOW * P.f;             // Hz sullo schermo
const tReal = () => simT * SLOW * 1e-3;    // tempo vero (s): 1 periodo = 1/(f·1000)
const areaM2 = () => Math.PI * (P.R / PX_CM / 100) ** 2;
// ampiezza del campo fra le armature (V/m): E = Q/(ε₀A), con Q = I₀/ω in alternata,
// Q massima = I₀·T nella carica a corrente costante
function Eamp() {
  const I = P.I0 * 1e-3, w = 2 * Math.PI * P.f * 1e3;
  return P.ac ? I / (w * EPS0 * areaM2()) : I / (P.f * 1e3) / (EPS0 * areaM2());
}
// campo magnetico sul percorso di raggio R (T): μ₀·I/(2πR), uguale nel filo e fra le armature
const Bloop = () => MU0 * Math.abs(Ic()) * 1e-3 / (2 * Math.PI * P.R / PX_CM / 100);

/* ── State ───────────────────────────────────────────────────────────────── */
let simT    = 0;
let loopZ   = 195;   // Amperian loop position along wire [px from CX]
let running = true;
let prevTS  = null;

const HIST  = 320;
const hIc   = new Float32Array(HIST);
const hE    = new Float32Array(HIST);
let   hHead = 0, hFull = false;

/* ── Layout ──────────────────────────────────────────────────────────────── */
let CX = 0, CY = 0;

/* ── Physics functions ───────────────────────────────────────────────────── */
function Ic() {
  if (P.ac) return P.I0 * Math.sin(2 * Math.PI * fAnim() * simT);
  return P.I0;                    // DC: constant conduction current
}
function Enorm() {
  if (P.ac) return -Math.cos(2 * Math.PI * fAnim() * simT);   // 90° lag, ±1
  return (simT * fAnim()) % 1;   // continua: rampa 0→1 (E cresce mentre il condensatore si carica)
}

// B_z at screen-relative position (wx, wy): + = out of screen, – = into screen
// wx = x – CX (along wire axis), wy = y – CY (transverse, + = below wire)
function Bz(wx, wy) {
  const r = Math.abs(wy);
  if (r < 1) return 0;
  const inGap = Math.abs(wx) < P.d;
  const geo   = (inGap && r < P.R) ? r / (2 * Math.PI * P.R * P.R) : 1 / (2 * Math.PI * r);
  // corrente verso +x: sopra il filo B esce dallo schermo (x̂ × ŷ = ẑ), sotto entra
  return Ic() * geo * (wy > 0 ? -1 : 1);
}

function loopCirculation() {
  // ∮ B·dl for circular loop of radius P.R at position loopZ
  return Math.abs(loopZ) < P.d ? Ic() : Ic(); // always equal: I_d = I_c
}

function fmt(v) {   // corrente in mA
  if (!isFinite(v)) return '∞';
  const a = Math.abs(v);
  if (a < 0.005) return '0,00 mA';
  return Lab.fmt(v, 2) + ' mA';
}

/* ── drawSim ─────────────────────────────────────────────────────────────── */
function drawSim() {
  const dark = dk();
  ctx.save(); ctx.scale(DPR, DPR);
  ctx.fillStyle = dark ? '#060a10' : '#e8f0f8';
  ctx.fillRect(0, 0, SW, SH);
  drawGrid(dark);
  drawGapShade(dark);
  drawBdots(dark);
  drawWire(dark);
  drawPlates(dark);
  drawEfield(dark);
  drawCurrentArrows(dark);
  drawLoop(dark);
  ctx.restore();
}

function drawGrid(dark) {
  ctx.save();
  ctx.strokeStyle = dark ? 'rgba(0,212,255,0.05)' : 'rgba(0,80,180,0.07)';
  ctx.lineWidth = 1;
  for (let x = 40; x < SW; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, SH); ctx.stroke(); }
  for (let y = 40; y < SH; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SW, y); ctx.stroke(); }
  ctx.restore();
}

// Faint shading in the capacitor gap so the region is visually distinct
function drawGapShade(dark) {
  ctx.save();
  ctx.fillStyle = dark ? 'rgba(180,200,255,0.045)' : 'rgba(100,140,255,0.07)';
  ctx.fillRect(CX - P.d, 0, 2 * P.d, SH);
  ctx.restore();
}

/* ── B field dots (⊙ / ⊗) ───────────────────────────────────────────────── */
function drawBdots(dark) {
  const step = 42;
  const Bref = P.I0 / (2 * Math.PI * P.R); // B at plate edge with peak current
  ctx.save();
  for (let sx = step * 0.5; sx < SW; sx += step) {
    for (let sy = step * 0.5; sy < SH; sy += step) {
      const wx = sx - CX, wy = sy - CY;
      if (Math.abs(wy) < 10) continue; // skip wire region
      const bz    = Bz(wx, wy);
      const alpha = Math.min(0.85, Math.abs(bz) / Bref * 0.85);
      if (alpha < 0.04) continue;
      ctx.globalAlpha = alpha;
      drawDot(sx, sy, bz > 0, dark);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawDot(sx, sy, outOfScreen, dark) {
  const R   = 5;
  const col = outOfScreen
    ? (dark ? '#00d4ff' : '#0064c8')
    : (dark ? '#ff5090' : '#c82850');
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.arc(sx, sy, R, 0, 2 * Math.PI); ctx.stroke();
  if (outOfScreen) {
    ctx.beginPath(); ctx.arc(sx, sy, 2, 0, 2 * Math.PI); ctx.fill();
  } else {
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(sx - R * 0.65, sy - R * 0.65); ctx.lineTo(sx + R * 0.65, sy + R * 0.65);
    ctx.moveTo(sx + R * 0.65, sy - R * 0.65); ctx.lineTo(sx - R * 0.65, sy + R * 0.65);
    ctx.stroke();
  }
}

/* ── Wire ────────────────────────────────────────────────────────────────── */
function drawWire(dark) {
  ctx.save();
  ctx.strokeStyle = dark ? 'rgba(220,225,235,0.75)' : 'rgba(50,50,70,0.70)';
  ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(0, CY);         ctx.lineTo(CX - P.d, CY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(CX + P.d, CY);  ctx.lineTo(SW, CY);       ctx.stroke();
  ctx.restore();
}

/* ── Capacitor plates ────────────────────────────────────────────────────── */
function drawPlates(dark) {
  ctx.save();
  const E = Enorm();
  for (const side of [-1, 1]) {
    const px = CX + side * P.d;

    // Main plate ellipse (perspective: thin)
    ctx.fillStyle   = dark ? 'rgba(160,190,255,0.82)' : 'rgba(70,100,200,0.78)';
    ctx.strokeStyle = dark ? 'rgba(200,220,255,0.95)' : 'rgba(50,70,180,0.95)';
    ctx.lineWidth   = 1.2;
    ctx.beginPath(); ctx.ellipse(px, CY, 10, P.R, 0, 0, 2 * Math.PI);
    ctx.fill(); ctx.stroke();

    // Charge label below plate (E > 0 means field points right → left plate is +)
    const charge = (side === -1)
      ? (E > 0.05 ? '+' : E < -0.05 ? '−' : '·')
      : (E > 0.05 ? '−' : E < -0.05 ? '+' : '·');
    ctx.fillStyle  = dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.75)';
    ctx.font       = 'bold 18px sans-serif';
    ctx.textAlign  = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(charge, px, CY + P.R + 8);
  }
  ctx.restore();
}

/* ── E field arrows ──────────────────────────────────────────────────────── */
function drawEfield(dark) {
  const E = Enorm();
  if (Math.abs(E) < 0.02) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.abs(E));
  const col  = dark ? '#ffdd44' : '#b08000';
  const nRow = 5;
  for (let ri = 0; ri < nRow; ri++) {
    const sy = CY - P.R * 0.75 + P.R * 1.5 * ri / (nRow - 1);
    const halfH = Math.sqrt(Math.max(0, P.R * P.R - (sy - CY) ** 2));
    if (halfH < 15) continue;
    const x1 = CX - P.d + 14, x2 = CX + P.d - 14;
    arrow(E > 0 ? x1 : x2, sy, E > 0 ? x2 : x1, sy, col);
  }
  // "E" label above the gap
  ctx.globalAlpha = Math.min(1, Math.abs(E));
  ctx.fillStyle = col;
  ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText('E', CX, CY - P.R - 10);
  ctx.globalAlpha = 1;
  ctx.restore();
}

function arrow(x1, y1, x2, y2, col) {
  const dx = x2 - x1, dy = y2 - y1, l = Math.sqrt(dx * dx + dy * dy);
  if (l < 4) return;
  const ux = dx / l, uy = dy / l, ah = 7;
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - ux * ah + uy * ah * 0.4, y2 - uy * ah - ux * ah * 0.4);
  ctx.lineTo(x2 - ux * ah - uy * ah * 0.4, y2 - uy * ah + ux * ah * 0.4);
  ctx.closePath(); ctx.fill();
}

/* ── Current direction arrows on wire ───────────────────────────────────── */
function drawCurrentArrows(dark) {
  const ic = Ic();
  if (Math.abs(ic) < 0.02) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.abs(ic) / P.I0);
  const col = dark ? 'rgba(230,235,245,0.90)' : 'rgba(40,40,60,0.80)';
  const dir = ic > 0 ? 1 : -1;
  const sp  = 90;
  // Left segment
  for (let sx = sp; sx < CX - P.d - 20; sx += sp)
    arrow(sx - dir * 18, CY, sx + dir * 18, CY, col);
  // Right segment
  for (let sx = CX + P.d + 45; sx < SW - 20; sx += sp)
    arrow(sx - dir * 18, CY, sx + dir * 18, CY, col);
  // "i" label
  ctx.fillStyle = col; ctx.font = 'italic bold 13px "DM Sans",sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText('i', CX - P.d * 1.6, CY - 6);
  ctx.fillText('i', CX + P.d * 1.6, CY - 6);
  ctx.globalAlpha = 1;
  ctx.restore();
}

/* ── Amperian loop ───────────────────────────────────────────────────────── */
function drawLoop(dark) {
  const sx     = CX + loopZ;
  const inGap  = Math.abs(loopZ) < P.d;
  const circ   = loopCirculation();

  // Green = conduction current, orange = displacement current
  const col = inGap
    ? (dark ? '#ff9940' : '#cc6000')
    : (dark ? '#40dd88' : '#007744');

  ctx.save();

  // Perspective ellipse (thin = depth cue)
  ctx.strokeStyle = col; ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.ellipse(sx, CY, P.R * 0.16, P.R, 0, 0, 2 * Math.PI);
  ctx.stroke();

  // Small arrowhead on the top of the loop (shows traversal direction)
  const tipY = CY - P.R;
  const aw   = 7;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(sx + aw, tipY + aw);
  ctx.lineTo(sx,      tipY - 4);
  ctx.lineTo(sx - aw, tipY + aw);
  ctx.closePath(); ctx.fill();

  // ∮ B·dl label above
  ctx.font = 'bold 11px "Space Mono",monospace';
  ctx.fillStyle = col;
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(`∮ B·dl / μ₀ = ${fmt(circ)}`, sx, tipY - 8);

  // Enclosed current type label
  ctx.font = '9px "Space Mono",monospace';
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.50)';
  ctx.fillText(inGap ? 'racchiude I_d' : 'racchiude I_c', sx, tipY + 2);

  // Shaded surface area (shows which surface the loop bounds)
  ctx.save();
  ctx.fillStyle = inGap
    ? (dark ? 'rgba(255,153,64,0.08)' : 'rgba(200,100,0,0.07)')
    : (dark ? 'rgba(64,221,136,0.08)' : 'rgba(0,120,68,0.07)');
  ctx.beginPath();
  ctx.ellipse(sx, CY, P.R * 0.16, P.R, 0, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();

  // "B" label with circular arrow cue outside the gap (right side of loop)
  if (!inGap) {
    ctx.font = 'italic bold 13px "DM Sans",sans-serif';
    ctx.fillStyle = dark ? 'rgba(64,221,136,0.75)' : 'rgba(0,100,50,0.75)';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('B', sx + P.R * 0.2 + 6, CY);
  }

  ctx.restore();
}

/* ── Grafici ─────────────────────────────────────────────────────────────── */
// Storia (tempo vero, in ms): 1) corrente di conduzione nel filo e corrente di spostamento fra
// le armature, che coincidono; 2) campo elettrico fra le armature, la cui derivata dà I_d.
function drawGraphs() {
  const C = Lab.graphColors(), hLen = hFull ? HIST : hHead;
  const tNow = tReal() * 1e3, dtStep = 1 / 60 * SLOW;        // ms per campione (60 fotogrammi/s)
  const span = HIST * dtStep, t0 = Math.max(0, tNow - span), t1 = Math.max(span, tNow);
  const ser = arr => { const out = []; for (let k = 0; k < hLen; k++) { const idx = (hHead - hLen + k + HIST) % HIST; out.push([tNow - (hLen - 1 - k) * dtStep, arr[idx]]); } return out; };
  const Im = Lab.niceMax(P.I0 * 1.1);
  let g = Lab.panel(gCanvas[0], { title: 'Corrente di conduzione I_c e di spostamento I_d (mA)', xr: [t0, t1], yr: [P.ac ? -Im : -Im * 0.25, Im], xLabel: 't (ms)' });
  if (g) {
    const [c, f] = g, s = ser(hIc);
    Lab.plotPts(c, f, s, C.accent, 3);
    Lab.plotPts(c, f, s, C.amber, 1.5);
    Lab.legend(c, f.L + 8, f.T + 8, [[C.accent, 'I_c nel filo'], [C.amber, 'I_d = ε₀·dΦ_E/dt']]);
  }
  const Ea = Eamp() / 1e3, Em = Lab.niceMax(Ea * 1.1);
  g = Lab.panel(gCanvas[1], { title: 'Campo elettrico fra le armature (kV/m)', xr: [t0, t1], yr: [P.ac ? -Em : -Em * 0.25, Em], xLabel: 't (ms)', yFmt: v => Lab.sci(v, 2) });
  if (g) { const [c, f] = g; Lab.plotPts(c, f, ser(hE).map(([t, e]) => [t, e * Ea]), C.amber, 2); }
}

/* ── Readout ─────────────────────────────────────────────────────────────── */
function updateReadout() {
  const ic    = Ic();
  const inGap = Math.abs(loopZ) < P.d;
  document.getElementById('readout').innerHTML = [
    { label: '∮ B·dl / μ₀',   value: fmt(ic) },
    { label: inGap ? 'I_d (fra le armature)' : 'I_c (nel filo)', value: fmt(ic) },
    { label: 'E fra le armature', value: Lab.sci(Enorm() * Eamp() / 1e3, 3) + ' kV/m' },
    { label: 'B sul percorso', value: Lab.fmt(Bloop() * 1e9, 2) + ' nT' },
  ].map(r =>
    `<span class="readout-item"><span class="readout-label">${r.label}</span><span class="readout-value">${r.value}</span></span>`
  ).join('');
}

/* ── Animation loop ──────────────────────────────────────────────────────── */
function loop(ts) {
  if (running && prevTS !== null) {
    const dt = Math.min((ts - prevTS) / 1000, 0.05);
    simT += dt;
    hIc[hHead] = Ic();
    hE[hHead]  = Enorm();
    hHead = (hHead + 1) % HIST;
    if (hHead === 0) hFull = true;
  }
  prevTS = ts;
  drawSim();
  drawGraphs();
  updateReadout();
  requestAnimationFrame(loop);
}

/* ── Drag (loop position) ────────────────────────────────────────────────── */
let drag = null;

function evX(e) {
  const r  = sc.getBoundingClientRect();
  const cx = e.touches ? e.touches[0].clientX : e.clientX;
  return cx - r.left - CX;
}

sc.addEventListener('mousedown', e => {
  const x = evX(e);
  if (Math.abs(x - loopZ) < 30) drag = { startX: x, startZ: loopZ };
});
sc.addEventListener('touchstart', e => {
  e.preventDefault();
  const x = evX(e);
  if (Math.abs(x - loopZ) < 30) drag = { startX: x, startZ: loopZ };
}, { passive: false });

function onMove(e) {
  if (!drag) return;
  const x = evX(e);
  loopZ = Math.max(-(SW / 2 - 35), Math.min(SW / 2 - 35, drag.startZ + x - drag.startX));
}
window.addEventListener('mousemove', onMove);
window.addEventListener('touchmove', e => { e.preventDefault(); onMove(e); }, { passive: false });
window.addEventListener('mouseup',  () => { drag = null; });
window.addEventListener('touchend', () => { drag = null; });

/* ── Controls ────────────────────────────────────────────────────────────── */
function buildControls() {
  const ctrl = document.getElementById('controls');
  ctrl.innerHTML = '';

  const src = Lab.Section('Sorgente');
  src.add(Lab.RadioGroup({
    label: 'Tipo corrente',
    options: [
      { label: 'AC', value: 'ac', hint: 'sinusoidale' },
      { label: 'DC', value: 'dc', hint: 'costante' },
    ],
    value: P.ac ? 'ac' : 'dc',
    onChange: v => {
      P.ac = v === 'ac';
      simT = 0; hHead = 0; hFull = false;
      buildControls();
    },
  }));
  src.add(Lab.Slider({ label: 'Corrente di picco I₀', min: 0.2, max: 3, step: 0.1, value: P.I0, unit: ' mA',
    onChange: v => { P.I0 = v; } }));
  src.add(Lab.Slider({
    label: P.ac ? 'Frequenza f' : 'Frequenza delle ricariche',
    min: 0.1, max: 2.0, step: 0.05, value: P.f, unit: ' kHz',
    onChange: v => { P.f = v; },
  }));
  ctrl.appendChild(src.el);

  const cap = Lab.Section('Condensatore');
  cap.add(Lab.Slider({ label: 'Raggio delle armature R', min: 4, max: 13, step: 0.5, value: P.R / PX_CM, unit: ' cm',
    onChange: v => { P.R = v * PX_CM; } }));
  cap.add(Lab.Slider({ label: 'Distanza fra le armature', min: 5, max: 26, step: 1, value: 2 * P.d / PX_CM, unit: ' cm',
    onChange: v => { P.d = v * PX_CM / 2; } }));
  const note = document.createElement('div');
  note.className = 'lab-note';
  note.innerHTML = 'Trascina il <b>percorso</b> (l\'anello verde) lungo il filo: fuori dal condensatore abbraccia la corrente nel filo, fra le armature la corrente di spostamento. ∮B·dl non cambia. Animazione al rallentatore.';
  cap.add(note);
  ctrl.appendChild(cap.el);
}

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
  CX = SW / 2; CY = SH / 2;
}

new ResizeObserver(resizeCanvases).observe(sc.parentElement);

// pausa e azzeramento con i pulsanti in fondo al pannello, come negli altri lab
document.getElementById('btnPlay').addEventListener('click', e => {
  running = !running;
  e.currentTarget.textContent = running ? '⏸  PAUSA' : '▶  AVVIA';
});
document.getElementById('btnReset').addEventListener('click', () => { simT = 0; hHead = 0; hFull = false; loopZ = 195; });

function init() {
  resizeCanvases();
  buildControls();
  requestAnimationFrame(loop);
}

init();
