/* Ottica Geometrica — Lenti */
'use strict';

const simCanvas   = document.getElementById('simCanvas');
const graphCanvas = document.getElementById('graphCanvas');
const sc = simCanvas.getContext('2d');
const gc = graphCanvas.getContext('2d');

let SW = 0, SH = 0, GW = 0, GH = 0;
let dpr = window.devicePixelRatio || 1;

// ── App state ─────────────────────────────────────────────────────────────────
const params = {
  lensType:   'biconvex',
  n:          1.5,
  R1:         80,
  R2:        -80,
  objectDist: -160,   // mm (p), always negative
  viewMode:   'rays', // 'rays' | 'object'
  nRays:      5,
  showLabels: true,
};

// View transform (zoom + pan)
const view = { zoom: 1.0, panX: 0 };  // panX in canvas px

// ── Lens type presets ─────────────────────────────────────────────────────────
const LENS_TYPES = {
  biconvex:     { R1:  80,       R2:  -80,       label: 'Biconvessa'    },
  planoconvex:  { R1: Infinity,  R2:  -80,       label: 'Piano convessa'},
  posmenisc:    { R1:  60,       R2:  100,       label: 'Menisco convergente' },
  biconcave:    { R1: -80,       R2:   80,       label: 'Biconcava'     },
  planoconcave: { R1: -Infinity, R2:   80,       label: 'Piano concava' },
  negmenisc:    { R1: -60,       R2: -100,       label: 'Menisco divergente'  },
};

// Visual shape presets: ew = edge half-width fraction, sl/sr = sagitta sign
const LENS_SHAPES = {
  biconvex:     { ew: 0.00, slSign: +1, srSign: +1 },
  planoconvex:  { ew: 0.00, slSign:  0, srSign: +1 },
  posmenisc:    { ew: 0.08, slSign: +1, srSign: -1 },
  biconcave:    { ew: 0.28, slSign: -1, srSign: -1 },
  planoconcave: { ew: 0.22, slSign:  0, srSign: -1 },
  negmenisc:    { ew: 0.08, slSign: -1, srSign: +1 },
};

// ── Physics ───────────────────────────────────────────────────────────────────
// 1/f = (n-1)(1/R1 - 1/R2)
function focalLength(n, R1, R2) {
  const i1 = isFinite(R1) ? 1/R1 : 0;
  const i2 = isFinite(R2) ? 1/R2 : 0;
  const iF = (n - 1) * (i1 - i2);
  return Math.abs(iF) > 1e-10 ? 1/iF : Infinity;
}
// Cartesian sign convention (p = u < 0): 1/q = 1/f + 1/p
function imageDistance(f, p) {
  if (!isFinite(f)) return Infinity;
  const iq = 1/f + 1/p;
  return Math.abs(iq) > 1e-10 ? 1/iq : Infinity;
}
// m = q/p  (m < 0 → inverted)
function magnif(q, p) { return q / p; }

// ── View helpers ──────────────────────────────────────────────────────────────
function isDark() { return document.documentElement.dataset.theme !== 'light'; }

function baseScale() { return SW / 600; }
function effScale()  { return baseScale() * view.zoom; }
function lensCanvasX() { return SW / 2 + view.panX; }
const cy0 = () => SH / 2;

// Physics (mm) → canvas (px)
function wx(x_mm) { return lensCanvasX() + x_mm * effScale(); }
function wy(y_mm) { return cy0() - y_mm * effScale(); }
// Canvas → physics
function cxToMm(px) { return (px - lensCanvasX()) / effScale(); }

const LENS_APERTURE_MM = 80;
function lensHeight() {
  const px = LENS_APERTURE_MM * effScale();
  return Math.min(Math.max(px, 15), SH * 0.48);
}

// ── Background grid ───────────────────────────────────────────────────────────
function drawGrid() {
  const dk = isDark();
  const cx = lensCanvasX(), cy = cy0();
  const sc_ = effScale();

  // Adaptive grid step: aim for 40-100px spacing
  const rawStep = 50; // mm
  const stepsToTry = [5, 10, 20, 25, 50, 100, 200, 500];
  let step = rawStep;
  for (const s of stepsToTry) {
    if (s * sc_ >= 40) { step = s; break; }
  }

  const gridC  = dk ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
  const axisC  = dk ? 'rgba(200,220,255,0.18)' : 'rgba(0,0,80,0.14)';
  const tickC  = dk ? '#4a5e78' : '#8899aa';

  sc.save();
  sc.lineWidth = 1;

  // Vertical lines
  const xStart = Math.ceil(cxToMm(0) / step) * step;
  const xEnd   = Math.floor(cxToMm(SW) / step) * step;
  for (let xmm = xStart; xmm <= xEnd; xmm += step) {
    const x = wx(xmm);
    sc.strokeStyle = xmm === 0 ? axisC : gridC;
    sc.beginPath(); sc.moveTo(x, 0); sc.lineTo(x, SH); sc.stroke();
    if (xmm !== 0) {
      sc.fillStyle = tickC; sc.font = '9px Space Mono'; sc.textAlign = 'center';
      sc.fillText(xmm + '', x, cy + 14);
    }
  }

  // Horizontal axis + grid lines
  const sc2 = effScale();
  const yStepPx = step * sc2;
  const yLines = Math.ceil(SH / 2 / yStepPx);
  for (let k = -yLines; k <= yLines; k++) {
    const y = cy + k * yStepPx;
    sc.strokeStyle = k === 0 ? axisC : gridC;
    sc.lineWidth = k === 0 ? 1 : 1;
    sc.beginPath(); sc.moveTo(0, y); sc.lineTo(SW, y); sc.stroke();
  }

  sc.restore();
}

// ── Lens drawing ──────────────────────────────────────────────────────────────
function sagFrac(R_mm, lH) {
  if (!isFinite(R_mm) || R_mm === 0) return 0;
  const sc_ = effScale();
  const R_px = Math.abs(R_mm) * sc_;
  const h    = lH * 0.55;
  if (R_px <= h) return 0.40;
  const s = R_px - Math.sqrt(R_px * R_px - h * h);
  return Math.min(s / lH, 0.44);
}

function drawLens(lH) {
  const cx = lensCanvasX(), cy = cy0();
  const sh = LENS_SHAPES[params.lensType] || LENS_SHAPES.biconvex;
  const ew = sh.ew * lH;

  let sl = sh.slSign * sagFrac(params.R1, lH) * lH;
  let sr = sh.srSign * sagFrac(params.R2, lH) * lH;

  // Prevent surfaces from crossing: gap at center = 2*ew + sl + sr must be > minGap
  const minGap = 5;
  const centerGap = 2 * ew + sl + sr;
  if (centerGap < minGap) {
    const deficit = minGap - centerGap;
    // Shrink sagittas that narrow the gap (sl < 0 and/or sr < 0)
    const slNeg = Math.min(sl, 0), srNeg = Math.min(sr, 0);
    const pool = -(slNeg + srNeg);
    if (pool > 0) {
      const frac = Math.max(0, (pool - deficit) / pool);
      if (slNeg < 0) sl = slNeg * frac;
      if (srNeg < 0) sr = srNeg * frac;
    }
  }

  const xl = cx - ew, xr = cx + ew;
  const lctrl = xl - 2 * sl, rctrl = xr + 2 * sr;
  const dk = isDark();

  sc.save();
  sc.beginPath();
  sc.moveTo(xl, cy - lH);
  if (Math.abs(sl) < 0.5) sc.lineTo(xl, cy + lH);
  else sc.quadraticCurveTo(lctrl, cy, xl, cy + lH);
  if (Math.abs(xr - xl) > 0.5) sc.lineTo(xr, cy + lH);
  if (Math.abs(sr) < 0.5) sc.lineTo(xr, cy - lH);
  else sc.quadraticCurveTo(rctrl, cy, xr, cy - lH);
  sc.closePath();

  sc.fillStyle = dk ? 'rgba(120,190,255,0.20)' : 'rgba(80,150,220,0.22)';
  sc.fill();
  sc.strokeStyle = dk ? '#60c8ff' : '#2277bb';
  sc.lineWidth = 2;
  sc.stroke();

  // Lens center tick + C label
  sc.strokeStyle = dk ? 'rgba(200,220,255,0.22)' : 'rgba(0,0,80,0.16)';
  sc.lineWidth = 1;
  sc.beginPath(); sc.moveTo(cx, cy - lH - 14); sc.lineTo(cx, cy + lH + 14); sc.stroke();
  sc.fillStyle = dk ? '#b0c8e0' : '#334455';
  sc.beginPath(); sc.arc(cx, cy, 3, 0, Math.PI*2); sc.fill();
  if (params.showLabels) {
    sc.fillStyle = dk ? '#b0c8e0' : '#334455';
    sc.font = 'bold 11px Space Mono'; sc.textAlign = 'center';
    sc.fillText('C', cx, cy + 16);
  }
  sc.restore();
}

// ── Arrow helper ──────────────────────────────────────────────────────────────
function arrowLine(ctx, x1, y1, x2, y2, color, w, hs) {
  const dx = x2-x1, dy = y2-y1, len = Math.hypot(dx, dy);
  if (len < 2) return;
  const ux = dx/len, uy = dy/len, h = hs || 9;
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w || 1.5;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - ux*h*0.8, y2 - uy*h*0.8); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - ux*h - uy*h*0.4, y2 - uy*h + ux*h*0.4);
  ctx.lineTo(x2 - ux*h + uy*h*0.4, y2 - uy*h - ux*h*0.4);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// Focal point tick mark
function drawFocalTick(x, cy, label, dk) {
  if (x < -20 || x > SW + 20) return;
  const fc = dk ? '#ff5555' : '#cc0000';
  sc.save();
  sc.strokeStyle = fc; sc.lineWidth = 1.5;
  sc.beginPath(); sc.moveTo(x, cy-10); sc.lineTo(x, cy+10); sc.stroke();
  sc.fillStyle = fc; sc.font = 'bold 11px Space Mono'; sc.textAlign = 'center';
  sc.fillText(label, x, cy - 16);
  sc.restore();
}

// ── Ray mode ──────────────────────────────────────────────────────────────────
function drawRayMode(f, dk) {
  const cy = cy0(), lH = lensHeight();
  const nR = params.nRays;
  const aperture = lH * 0.88;
  const rayC = '#dd2222';
  const dashC = 'rgba(200,80,80,0.45)';
  const isConv = f > 0;

  if (isFinite(f)) {
    drawFocalTick(wx(f),  cy, 'F\'', dk);
    drawFocalTick(wx(-f), cy, 'F',   dk);
  }

  for (let i = 0; i < nR; i++) {
    const t  = nR === 1 ? 0.5 : i / (nR - 1);
    const yL = (cy - aperture) + t * 2 * aperture;
    const yL_mm = (cy - yL) / effScale();
    const cx_lens = lensCanvasX();

    // Paraxial: incoming parallel, slopeOut_phys = -yL_mm/f
    const mOut = isFinite(f) ? yL_mm / f : 0;  // canvas slope (dy_canvas/dx_canvas)

    sc.save();
    sc.strokeStyle = rayC; sc.lineWidth = 1.5;

    // Incoming: far left → lens
    sc.beginPath(); sc.moveTo(0, yL); sc.lineTo(cx_lens, yL); sc.stroke();
    arrowLine(sc, cx_lens * 0.42, yL, cx_lens * 0.58, yL, rayC, 1.5, 7);

    // Outgoing: lens → far right
    const xEnd = SW + 100;
    const yEnd = yL + mOut * (xEnd - cx_lens);
    sc.beginPath(); sc.moveTo(cx_lens, yL); sc.lineTo(xEnd, yEnd); sc.stroke();
    const xAr = cx_lens + (xEnd - cx_lens) * 0.45;
    arrowLine(sc, xAr, yL + mOut*(xAr - cx_lens), xAr + 2, yL + mOut*(xAr - cx_lens + 2), rayC, 1.5, 7);

    // Dashed back-extension for diverging lens
    if (!isConv && isFinite(f)) {
      sc.save(); sc.strokeStyle = dashC; sc.setLineDash([5, 4]);
      const xBack = Math.max(-100, wx(f) * 2.2 - cx_lens * 1.2);
      const yBack = yL + mOut * (xBack - cx_lens);
      sc.beginPath(); sc.moveTo(cx_lens, yL); sc.lineTo(xBack, yBack); sc.stroke();
      sc.restore();
    }

    sc.restore();
  }

  // Focal dot
  if (isFinite(f)) {
    sc.save();
    sc.fillStyle = dk ? '#ff5555' : '#cc0000';
    sc.beginPath(); sc.arc(wx(f), cy, 4, 0, Math.PI*2); sc.fill();
    sc.restore();
  }
}

// ── Object/image mode ─────────────────────────────────────────────────────────
function drawObjectMode(f, dk) {
  const cy = cy0(), lH = lensHeight();
  const p = params.objectDist;   // mm
  const q = imageDistance(f, p); // mm
  const isRealImg = isFinite(q) && q > 0;
  const m = isFinite(q) ? magnif(q, p) : 0;

  // Heights in mm
  const hObj = (lH * 0.52) / effScale();
  const hImg = m * hObj;

  const cx_lens = lensCanvasX();
  const pCanvasX = wx(p), pCanvasY = wy(hObj);
  const qCanvasX = isFinite(q) ? wx(q) : null;
  const qCanvasY = wy(hImg);

  // Focal ticks
  if (isFinite(f)) {
    drawFocalTick(wx(f),  cy, 'F\'', dk);
    drawFocalTick(wx(-f), cy, 'F',   dk);
  }

  const rayC  = '#dd2222';
  const xFarR = SW + 200, xFarL = -200;

  if (isFinite(f) && pCanvasX > xFarL && pCanvasX < xFarR) {
    sc.save();
    sc.strokeStyle = rayC; sc.lineWidth = 1.8;

    // ── Ray 1: horizontal → refracts through F' ──
    {
      const mOut = hObj / f;  // canvas slope: hObj_mm / f_mm, dimensionally consistent
      // incoming
      sc.beginPath(); sc.moveTo(pCanvasX, pCanvasY); sc.lineTo(cx_lens, pCanvasY); sc.stroke();
      const arx = pCanvasX + (cx_lens - pCanvasX) * 0.5;
      arrowLine(sc, arx - 1, pCanvasY, arx + 1, pCanvasY, rayC, 1.8, 7);
      // outgoing
      const x2 = isRealImg ? Math.min(wx(q) + 80, xFarR) : xFarR;
      const y2 = pCanvasY + mOut * (x2 - cx_lens);
      sc.beginPath(); sc.moveTo(cx_lens, pCanvasY); sc.lineTo(x2, y2); sc.stroke();
      const xA = cx_lens + (x2 - cx_lens) * 0.5;
      arrowLine(sc, xA, pCanvasY + mOut*(xA-cx_lens), xA + 1, pCanvasY + mOut*(xA-cx_lens+1), rayC, 1.8, 7);
      // dashed back for virtual
      if (!isRealImg) {
        sc.save(); sc.setLineDash([5, 4]);
        const xB = xFarL, yB = pCanvasY + mOut * (xB - cx_lens);
        sc.beginPath(); sc.moveTo(cx_lens, pCanvasY); sc.lineTo(xB, yB); sc.stroke();
        sc.restore();
      }
    }

    // ── Ray 2: through center C, undeflected ──
    {
      const mC = (cy - pCanvasY) / (cx_lens - pCanvasX);
      sc.beginPath(); sc.moveTo(pCanvasX, pCanvasY); sc.lineTo(cx_lens, cy); sc.stroke();
      const arx2 = pCanvasX + (cx_lens - pCanvasX) * 0.5;
      arrowLine(sc, arx2, pCanvasY + mC*(arx2-pCanvasX), arx2+1, pCanvasY + mC*(arx2-pCanvasX+1), rayC, 1.8, 7);
      const x2 = isRealImg ? Math.min(wx(q) + 80, xFarR) : xFarR;
      const y2 = cy + mC * (x2 - cx_lens);
      sc.beginPath(); sc.moveTo(cx_lens, cy); sc.lineTo(x2, y2); sc.stroke();
      const xA2 = cx_lens + (x2 - cx_lens) * 0.5;
      arrowLine(sc, xA2, cy + mC*(xA2-cx_lens), xA2+1, cy + mC*(xA2-cx_lens+1), rayC, 1.8, 7);
      if (!isRealImg) {
        sc.save(); sc.setLineDash([5, 4]);
        const xB = xFarL, yB = cy + mC * (xB - cx_lens);
        sc.beginPath(); sc.moveTo(cx_lens, cy); sc.lineTo(xB, yB); sc.stroke();
        sc.restore();
      }
    }

    sc.restore();
  }

  // ── Object arrow ──
  const objC = dk ? '#44ee88' : '#007733';
  if (pCanvasX > -100 && pCanvasX < SW + 100) {
    arrowLine(sc, pCanvasX, cy, pCanvasX, pCanvasY, objC, 2.5, 10);
    if (params.showLabels) {
      sc.save(); sc.fillStyle = objC; sc.font = '11px DM Sans'; sc.textAlign = 'right';
      sc.fillText('Oggetto', pCanvasX - 6, Math.min(pCanvasY, cy) - 8);
      sc.restore();
    }
  }

  // ── Image arrow ──
  if (isFinite(q) && qCanvasX !== null) {
    const iC = isRealImg ? (dk ? '#00d4ff' : '#0066cc') : (dk ? '#ff88cc' : '#cc0066');
    if (qCanvasX > -100 && qCanvasX < SW + 100) {
      arrowLine(sc, qCanvasX, cy, qCanvasX, qCanvasY, iC, 2.5, 10);
      if (params.showLabels) {
        sc.save(); sc.fillStyle = iC; sc.font = '11px DM Sans';
        const ta = qCanvasX > cx_lens ? 'left' : 'right';
        sc.textAlign = ta;
        const lx = qCanvasX + (ta === 'left' ? 6 : -6);
        sc.fillText(isRealImg ? 'Immagine reale' : 'Immagine virtuale', lx, Math.min(qCanvasY, cy) - 8);
        sc.restore();
      }
    }

    // ── Distance annotation lines ──
    const annY = cy + lH * 0.60;
    const pC   = objC;
    const qC   = isRealImg ? (dk ? '#00d4ff' : '#0066cc') : (dk ? '#ff88cc' : '#cc0066');

    sc.save();
    sc.font = '9px Space Mono';

    // p line (lens → object, always left)
    if (pCanvasX > -100 && pCanvasX < cx_lens - 4) {
      sc.strokeStyle = pC; sc.lineWidth = 1; sc.setLineDash([4, 3]);
      sc.beginPath(); sc.moveTo(cx_lens, annY); sc.lineTo(pCanvasX, annY); sc.stroke();
      sc.setLineDash([]);
      sc.beginPath(); sc.moveTo(cx_lens, annY-4); sc.lineTo(cx_lens, annY+4); sc.stroke();
      sc.beginPath(); sc.moveTo(pCanvasX, annY-4); sc.lineTo(pCanvasX, annY+4); sc.stroke();
      sc.fillStyle = pC; sc.textAlign = 'center';
      sc.fillText('p = ' + Lab.fmt(p, 0) + ' mm', (cx_lens + pCanvasX) / 2, annY + 12);
    }

    // q line (lens → image)
    if (isFinite(q) && Math.abs(qCanvasX - cx_lens) > 8 &&
        qCanvasX > -100 && qCanvasX < SW + 100) {
      const vAnnY = annY + (isRealImg ? 0 : 28);
      sc.strokeStyle = qC; sc.lineWidth = 1; sc.setLineDash([4, 3]);
      sc.beginPath(); sc.moveTo(cx_lens, vAnnY); sc.lineTo(qCanvasX, vAnnY); sc.stroke();
      sc.setLineDash([]);
      sc.beginPath(); sc.moveTo(cx_lens,  vAnnY-4); sc.lineTo(cx_lens,  vAnnY+4); sc.stroke();
      sc.beginPath(); sc.moveTo(qCanvasX, vAnnY-4); sc.lineTo(qCanvasX, vAnnY+4); sc.stroke();
      sc.fillStyle = qC; sc.textAlign = 'center';
      sc.fillText('q = ' + (q > 0 ? '+' : '') + Lab.fmt(q, 0) + ' mm',
                  (cx_lens + qCanvasX) / 2, vAnnY + 12);
    }

    sc.restore();
  }
}

// ── Main draw ─────────────────────────────────────────────────────────────────
function drawScene() {
  sc.clearRect(0, 0, SW, SH);
  const dk = isDark();
  sc.fillStyle = dk ? '#060a10' : '#f4f8ff';
  sc.fillRect(0, 0, SW, SH);

  const lH = lensHeight();
  const f  = focalLength(params.n, params.R1, params.R2);

  drawGrid();

  if (params.viewMode === 'rays') {
    drawRayMode(f, dk);
  } else {
    drawObjectMode(f, dk);
  }

  drawLens(lH);
  updateReadout(f);
}

// ── Graphs ────────────────────────────────────────────────────────────────────
function drawGraphs() {
  if (!GW || !GH) return;
  gc.clearRect(0, 0, GW, GH);
  const f = focalLength(params.n, params.R1, params.R2), half = GW / 2;
  // assi fissi (in mm, sulla gamma del cursore di p): cambiando la lente si vede cambiare la curva
  const qOf = p => { const q = imageDistance(f, p); return Math.abs(q) > 2000 ? NaN : q; };
  const mOf = p => { const q = imageDistance(f, p); const m = q / p; return Math.abs(m) > 6 ? NaN : m; };
  const p0 = params.objectDist, show = params.viewMode === 'object';
  const C = Lab.graphColors();
  const fLine = g => { if (!isFinite(f) || f <= 0) return; gc.save(); gc.setLineDash([3, 3]); gc.strokeStyle = C.amber;
    gc.beginPath(); gc.moveTo(g.X(-f), g.T); gc.lineTo(g.X(-f), g.B); gc.stroke(); gc.restore();
    gc.fillStyle = C.amber; gc.font = '9.5px "DM Sans",sans-serif'; gc.textAlign = 'right'; gc.textBaseline = 'middle'; gc.fillText('p = −f', g.X(-f) - 4, g.T + 22); };

  // 1: distanza dell'immagine q(p): q > 0 immagine reale (dietro la lente), q < 0 virtuale
  let g = Lab.axes(gc, { x: 3, y: 3, w: half - 6, h: GH - 6, xr: [-500, 0], xStep: 100, yr: [-1000, 1000], yStep: 500,
    title: 'Distanza dell’immagine q (mm) — 1/q = 1/f + 1/p', xLabel: 'distanza dell’oggetto p (mm)', padL: 50 });
  fLine(g);
  if (isFinite(f)) Lab.plot(gc, g, qOf, [-500, -1], dk_() ? '#00d4ff' : '#0088cc', 2, [], 600);
  if (show && Number.isFinite(qOf(p0))) Lab.dot(gc, g, p0, qOf(p0), C.amber, 4.5);
  gc.fillStyle = C.text; gc.font = '9.5px "DM Sans",sans-serif'; gc.textAlign = 'right'; gc.textBaseline = 'middle';
  gc.fillText('reale ↑', g.R - 4, g.T + 8); gc.fillText('virtuale ↓', g.R - 4, g.B - 8);

  // 2: ingrandimento m = q/p: |m| > 1 ingrandita, m < 0 capovolta
  g = Lab.axes(gc, { x: half + 3, y: 3, w: GW - half - 6, h: GH - 6, xr: [-500, 0], xStep: 100, yr: [-5, 5], yStep: 1,
    title: 'Ingrandimento m = q/p', xLabel: 'distanza dell’oggetto p (mm)' });
  fLine(g);
  gc.save(); gc.setLineDash([2, 3]); gc.strokeStyle = C.axis;
  for (const v of [1, -1]) { gc.beginPath(); gc.moveTo(g.L, g.Y(v)); gc.lineTo(g.R, g.Y(v)); gc.stroke(); }
  gc.restore();
  if (isFinite(f)) Lab.plot(gc, g, mOf, [-500, -1], dk_() ? '#ff8844' : '#cc4400', 2, [], 600);
  if (show && Number.isFinite(mOf(p0))) Lab.dot(gc, g, p0, mOf(p0), C.amber, 4.5);
  gc.fillStyle = C.text; gc.font = '9.5px "DM Sans",sans-serif'; gc.textAlign = 'right'; gc.textBaseline = 'middle';
  gc.fillText('diritta ↑', g.R - 4, g.T + 8); gc.fillText('capovolta ↓', g.R - 4, g.B - 8);
}
const dk_ = () => isDark();

// ── Readout ───────────────────────────────────────────────────────────────────
const rdout = new Lab.Readout(document.getElementById('readout'), [
  { key: 'f',  label: 'distanza focale f' },
  { key: 'D',  label: 'potere diottrico'  },
  { key: 'p',  label: 'oggetto p'         },
  { key: 'q',  label: 'immagine q'        },
  { key: 'm',  label: 'ingrandimento m'   },
  { key: 'k',  label: 'immagine'          },
]);

function updateReadout(f) {
  const sg = v => (v > 0 ? '+' : '');
  rdout.set('f', isFinite(f) ? sg(f) + Lab.fmt(f, 1) + ' mm' : '∞');
  rdout.set('D', isFinite(f) && Math.abs(f) > 0.01 ? sg(f) + Lab.fmt(1000 / f, 2) + ' D' : '0 D');

  if (params.viewMode === 'object') {
    const p = params.objectDist;
    const q = imageDistance(f, p);
    const m = isFinite(q) ? magnif(q, p) : null;
    rdout.set('p', Lab.fmt(p, 0) + ' mm');
    rdout.set('q', isFinite(q) ? sg(q) + Lab.fmt(q, 0) + ' mm' : '∞');
    rdout.set('m', m !== null && isFinite(m) ? Lab.fmt(m, 2) + '×' : '∞');
    rdout.set('k', !isFinite(q) ? 'all’infinito' : `${q > 0 ? 'reale' : 'virtuale'}, ${m < 0 ? 'capovolta' : 'diritta'}`);
  } else {
    rdout.set('p', '—'); rdout.set('q', '—'); rdout.set('m', '—'); rdout.set('k', '—');
  }
}

// ── Resize ────────────────────────────────────────────────────────────────────
const graphArea = document.getElementById('graphArea');

function resize() {
  dpr = window.devicePixelRatio || 1;
  const parent   = simCanvas.parentElement;
  const graphH   = graphArea.offsetHeight  || 180;
  const readoutH = document.getElementById('readout').offsetHeight || 56;

  SW = parent.clientWidth;
  SH = Math.max(80, parent.clientHeight - graphH - readoutH);

  simCanvas.width  = Math.round(SW * dpr);  simCanvas.height  = Math.round(SH * dpr);
  simCanvas.style.width  = SW + 'px';       simCanvas.style.height = SH + 'px';
  sc.setTransform(dpr, 0, 0, dpr, 0, 0);

  GW = graphArea.clientWidth;
  GH = graphArea.clientHeight || 180;
  graphCanvas.width  = Math.round(GW * dpr);  graphCanvas.height  = Math.round(GH * dpr);
  graphCanvas.style.width  = GW + 'px';       graphCanvas.style.height = GH + 'px';
  gc.setTransform(dpr, 0, 0, dpr, 0, 0);

  drawScene(); drawGraphs();
}

const ro = new ResizeObserver(() => { resize(); });
ro.observe(simCanvas.parentElement);

// ── Controls ──────────────────────────────────────────────────────────────────
function buildControls() {
  const el = document.getElementById('controls');
  el.innerHTML = '';

  const secMode = Lab.Section('Modalità');
  secMode.add(Lab.RadioGroup({
    label: 'Che cosa mostrare',
    options: [
      { value: 'rays',   label: 'Raggi paralleli'    },
      { value: 'object', label: 'Oggetto e immagine' },
    ],
    value: params.viewMode,
    onChange: v => { params.viewMode = v; buildControls(); drawScene(); drawGraphs(); },
  }));
  el.appendChild(secMode.el);

  const secType = Lab.Section('Tipo di Lente');
  secType.add(Lab.RadioGroup({
    label: 'Forma',
    options: Object.entries(LENS_TYPES).map(([id,p]) => ({ value: id, label: p.label })),
    value: params.lensType,
    onChange: v => {
      params.lensType = v;
      const p = LENS_TYPES[v]; params.R1 = p.R1; params.R2 = p.R2;
      buildControls(); drawScene(); drawGraphs();
    },
  }));
  el.appendChild(secType.el);

  const secLens = Lab.Section('Parametri Lente');
  if (isFinite(params.R1)) {
    secLens.add(Lab.SliderInput({
      label: '|R₁|', min: 20, max: 400, value: Math.abs(params.R1), step: 5, unit: ' mm',
      onChange: v => { params.R1 = Math.sign(params.R1 || 1) * v; drawScene(); drawGraphs(); },
    }));
  }
  if (isFinite(params.R2)) {
    secLens.add(Lab.SliderInput({
      label: '|R₂|', min: 20, max: 400, value: Math.abs(params.R2), step: 5, unit: ' mm',
      onChange: v => { params.R2 = Math.sign(params.R2 || -1) * v; drawScene(); drawGraphs(); },
    }));
  }
  secLens.add(Lab.SliderInput({
    label: 'Indice n', min: 1.2, max: 2.5, value: params.n, step: 0.05, unit: '',
    onChange: v => { params.n = v; drawScene(); drawGraphs(); },
  }));
  el.appendChild(secLens.el);

  const secDisp = Lab.Section('Visualizzazione');
  if (params.viewMode === 'rays') {
    secDisp.add(Lab.SliderInput({
      label: 'N° raggi', min: 1, max: 15, value: params.nRays, step: 1, unit: '',
      onChange: v => { params.nRays = Math.round(v); drawScene(); },
    }));
  }
  if (params.viewMode === 'object') {
    secDisp.add(Lab.SliderInput({
      label: 'Distanza dell’oggetto p', min: -500, max: -10, value: params.objectDist, step: 5, unit: ' mm',
      onChange: v => { params.objectDist = v; drawScene(); drawGraphs(); },
    }));
  }
  secDisp.add(Lab.Toggle({
    label: 'Etichette', value: params.showLabels,
    onChange: v => { params.showLabels = v; drawScene(); },
  }));
  el.appendChild(secDisp.el);
}

// ── Zoom (wheel) ──────────────────────────────────────────────────────────────
simCanvas.addEventListener('wheel', e => {
  e.preventDefault();
  const rect = simCanvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const factor = e.deltaY > 0 ? 0.88 : 1/0.88;
  const newZoom = Math.max(0.2, Math.min(10, view.zoom * factor));
  // Keep physics coordinate under mouse fixed
  const physX = (mx - (SW/2 + view.panX)) / (baseScale() * view.zoom);
  view.panX = mx - SW/2 - physX * baseScale() * newZoom;
  view.zoom = newZoom;
  drawScene();
}, { passive: false });

// Double-click: reset zoom/pan
simCanvas.addEventListener('dblclick', () => {
  view.zoom = 1; view.panX = 0; drawScene();
});

// ── Pan (left-click drag) + drag object (left-click near arrow) ───────────────
let panState = null;
let dragging  = false;

simCanvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  const rect = simCanvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  // In object mode, clicks near the object arrow drag it; elsewhere pan
  if (params.viewMode === 'object') {
    const objX = wx(params.objectDist);
    if (Math.abs(mx - objX) < 22) { dragging = true; e.preventDefault(); return; }
  }
  panState = { startX: e.clientX, startPanX: view.panX };
  e.preventDefault();
});

window.addEventListener('mousemove', e => {
  if (panState) {
    view.panX = panState.startPanX + (e.clientX - panState.startX);
    drawScene();
  }
});

window.addEventListener('mouseup', e => {
  if (e.button === 0) panState = null;
});

// ── Drag object cursor + movement ────────────────────────────────────────────
simCanvas.addEventListener('mousemove', e => {
  if (params.viewMode !== 'object') { simCanvas.style.cursor = panState ? 'grabbing' : ''; return; }
  const rect = simCanvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const objX = wx(params.objectDist);
  if (dragging) {
    const p_mm = cxToMm(mx);
    params.objectDist = Math.max(-500, Math.min(-5, Math.round(p_mm / 5) * 5));
    drawScene(); drawGraphs();
    simCanvas.style.cursor = 'ew-resize';
  } else {
    simCanvas.style.cursor = Math.abs(mx - objX) < 22 ? 'ew-resize' : (panState ? 'grabbing' : '');
  }
});

simCanvas.addEventListener('mouseup',    () => { dragging = false; simCanvas.style.cursor = ''; });
simCanvas.addEventListener('mouseleave', () => { dragging = false; });

// ── Init ──────────────────────────────────────────────────────────────────────
Lab.initTheme();
buildControls();
new MutationObserver(() => { drawScene(); drawGraphs(); })
  .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
resize();
