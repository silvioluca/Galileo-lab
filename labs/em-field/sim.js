'use strict';

/* ── Canvas refs ─────────────────────────────────────────────────────────── */
const sc   = document.getElementById('simCanvas');
const ctx  = sc.getContext('2d');
let DPR  = window.devicePixelRatio || 1;
let SW = 0, SH = 0;

/* ── Theme ───────────────────────────────────────────────────────────────── */
Lab.initTheme('themeToggle');
const dk = () => document.documentElement.dataset.theme !== 'light';

/* ── Charge configurations ───────────────────────────────────────────────── */
function polyConfig(n, r, a0 = -Math.PI / 2) {
  return Array.from({ length: n }, (_, i) => ({
    q: i % 2 === 0 ? 1 : -1,
    x: +(r * Math.cos(a0 + 2 * Math.PI * i / n)).toFixed(4),
    y: +(r * Math.sin(a0 + 2 * Math.PI * i / n)).toFixed(4),
  }));
}

const CONFIGS = [
  { name: 'Monopolo',       ch: [{ q: 1, x: 0, y: 0 }] },
  { name: 'Dipolo',         ch: [{ q: 1, x: -1.5, y: 0 }, { q: -1, x: 1.5, y: 0 }] },
  { name: 'Tripolo',        ch: [{ q: 1, x: 0, y: -1.6 }, { q: -1, x: -1.4, y: 0.8 }, { q: -1, x: 1.4, y: 0.8 }] },
  { name: 'Quadrupolo',     ch: polyConfig(4, 1.5, -Math.PI / 4) },
  { name: 'Quad. Lineare',  ch: [{ q: 1, x: -2, y: 0 }, { q: -2, x: 0, y: 0 }, { q: 1, x: 2, y: 0 }] },
  { name: 'Esapolo',        ch: polyConfig(6, 1.5) },
  { name: 'Ottupolo',       ch: polyConfig(8, 1.8) },
];

/* ── State ───────────────────────────────────────────────────────────────── */
const VIEW = 4.5;
const OP   = { configIdx: 1, nLines: 12, showVectors: false, showLines: true, mapMode: 'V' };
let baseScale = 1, scale = 1, zoom = 1, panX = 0, panY = 0;
let charges      = CONFIGS[OP.configIdx].ch.map(c => ({ ...c }));
let testPt       = { x: 2.5, y: 0.5 };
let mapCache     = null;
let linesCache   = null;
let testDragging = false, chargeDragging = -1;
let panDragging = false, panStartX = 0, panStartY = 0, panOriginX = 0, panOriginY = 0;

/* ── Physics ─────────────────────────────────────────────────────────────── */
function potential(x, y) {
  let v = 0;
  for (const c of charges) {
    const r = Math.hypot(x - c.x, y - c.y);
    if (r < 0.01) return c.q > 0 ? 1e6 : -1e6;
    v += c.q / r;
  }
  return v;
}

function eField(x, y) {
  let ex = 0, ey = 0;
  for (const c of charges) {
    const dx = x - c.x, dy = y - c.y;
    const r2 = dx * dx + dy * dy;
    if (r2 < 1e-4) continue;
    const r3 = r2 ** 1.5;
    ex += c.q * dx / r3;
    ey += c.q * dy / r3;
  }
  return [ex, ey];
}

/* ── Color mapping ───────────────────────────────────────────────────────── */
function vToRGB(v, dark) {
  const t = Math.tanh(v * 0.65), a = Math.abs(t);
  const bg   = dark ? [6, 10, 16]    : [240, 244, 248];
  const warm = dark ? [255, 185, 50] : [220, 80, 0];
  const cold = dark ? [20, 180, 255] : [0, 100, 210];
  const c = t >= 0 ? warm : cold;
  return [bg[0] + (c[0] - bg[0]) * a | 0, bg[1] + (c[1] - bg[1]) * a | 0, bg[2] + (c[2] - bg[2]) * a | 0];
}

function eToRGB(em, dark) {
  const t = Math.min(1, Math.log1p(em * 0.4) / Math.log1p(4));
  const bg  = dark ? [6, 10, 16]    : [240, 244, 248];
  const hot = dark ? [255, 215, 70] : [200, 50, 0];
  return [bg[0] + (hot[0] - bg[0]) * t | 0, bg[1] + (hot[1] - bg[1]) * t | 0, bg[2] + (hot[2] - bg[2]) * t | 0];
}

/* ── Caches ──────────────────────────────────────────────────────────────── */
function invalidateMap() { mapCache = null; }
function invalidateAll() { mapCache = null; linesCache = null; }

function ensureMap() {
  if (mapCache && mapCache.dark === dk() && mapCache.mode === OP.mapMode
      && mapCache.scale === scale && mapCache.panX === panX && mapCache.panY === panY) return;
  const PW = Math.round(SW * DPR), PH = Math.round(SH * DPR);
  const img = ctx.createImageData(PW, PH);
  const d = img.data, dark = dk(), hw = SW / 2, hh = SH / 2;
  for (let iy = 0; iy < PH; iy++) {
    for (let ix = 0; ix < PW; ix++) {
      const xp = (ix / DPR - hw - panX) / scale, yp = -(iy / DPR - hh - panY) / scale;
      const px = (iy * PW + ix) * 4;
      let r, g, b;
      if (OP.mapMode === 'V') {
        [r, g, b] = vToRGB(potential(xp, yp), dark);
      } else {
        const [ex, ey] = eField(xp, yp);
        [r, g, b] = eToRGB(Math.hypot(ex, ey), dark);
      }
      d[px] = r; d[px + 1] = g; d[px + 2] = b; d[px + 3] = 255;
    }
  }
  mapCache = { img, dark: dk(), mode: OP.mapMode, scale, panX, panY };
}

/* dir = +1: follow +E (start from +q, stop at -q or boundary)
   dir = -1: follow -E (start from -q, stop at +q or boundary)
   returns { pts, escaped } where escaped=true means the line reached the boundary
   (not terminated by landing on an opposite-sign charge) */
function traceLine(x0, y0, dir) {
  let x = x0, y = y0;
  const pts = [[x, y]];
  const ds = 0.018, capR = 0.26, bound = VIEW * 9;
  const stopPred = dir > 0 ? (q => q < 0) : (q => q > 0);
  const targets  = charges.filter(c => stopPred(c.q));
  let escaped = false;

  for (let i = 0; i < 6000; i++) {
    const [ex, ey] = eField(x, y);
    const em = Math.hypot(ex, ey);
    if (em < 1e-10) break;

    let step = ds;
    if (targets.length > 0) {
      const minD = Math.min(...targets.map(c => Math.hypot(x - c.x, y - c.y)));
      if (minD < capR * 5) step = ds * Math.max(0.2, minD / (capR * 5));
    }

    x += dir * ex / em * step;
    y += dir * ey / em * step;

    if (Math.abs(x) > bound || Math.abs(y) > bound) { escaped = true; pts.push([x, y]); break; }
    if (targets.some(c => Math.hypot(x - c.x, y - c.y) < capR)) break;
    pts.push([x, y]);
  }
  return { pts, escaped };
}

function ensureLines() {
  if (linesCache && linesCache.nLines === OP.nLines) return;
  const lines = [], dirs = [];
  const posQ = charges.filter(c => c.q > 0);
  const negQ = charges.filter(c => c.q < 0);

  if (posQ.length === 0) {
    /* all-negative: trace backward from every charge, all escape to boundary */
    for (const c of negQ) {
      const n = Math.max(6, Math.round(OP.nLines * Math.abs(c.q)));
      for (let i = 0; i < n; i++) {
        const a = 2 * Math.PI * i / n;
        const { pts } = traceLine(c.x + 0.14 * Math.cos(a), c.y + 0.14 * Math.sin(a), -1);
        lines.push(pts); dirs.push(-1);
      }
    }
  } else {
    /* forward from every positive charge */
    for (const c of posQ) {
      const n = Math.max(6, Math.round(OP.nLines * Math.abs(c.q)));
      for (let i = 0; i < n; i++) {
        const a = 2 * Math.PI * i / n;
        const { pts } = traceLine(c.x + 0.14 * Math.cos(a), c.y + 0.14 * Math.sin(a), 1);
        lines.push(pts); dirs.push(1);
      }
    }
    /* backward from every negative charge — keep only lines that escape to the
       boundary (those that terminate at a + charge duplicate the forward traces) */
    for (const c of negQ) {
      const n = Math.max(6, Math.round(OP.nLines * Math.abs(c.q)));
      for (let i = 0; i < n; i++) {
        const a = 2 * Math.PI * i / n;
        const { pts, escaped } = traceLine(c.x + 0.14 * Math.cos(a), c.y + 0.14 * Math.sin(a), -1);
        if (escaped) { lines.push(pts); dirs.push(-1); }
      }
    }
  }

  linesCache = { lines, dirs, nLines: OP.nLines };
}

/* ── Coordinate helpers ──────────────────────────────────────────────────── */
const phyToScr = (x, y) => [SW / 2 + panX + x * scale, SH / 2 + panY - y * scale];
const scrToPhy = (sx, sy) => [(sx - SW / 2 - panX) / scale, -(sy - SH / 2 - panY) / scale];

/* ── Draw scene ──────────────────────────────────────────────────────────── */
function drawScene() {
  ensureMap();
  if (OP.showLines) ensureLines();
  ctx.putImageData(mapCache.img, 0, 0);

  const [tEx, tEy] = eField(testPt.x, testPt.y);
  const tV  = potential(testPt.x, testPt.y);
  const tEm = Math.hypot(tEx, tEy);

  ctx.save();
  ctx.scale(DPR, DPR);
  const dark = dk();

  /* ── grid ── */
  const gs = scale;
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  ctx.lineWidth = 0.5; ctx.setLineDash([]);
  const ox = SW / 2 % gs, oy = SH / 2 % gs;
  for (let x = ox; x <= SW; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, SH); ctx.stroke(); }
  for (let y = oy; y <= SH; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SW, y); ctx.stroke(); }
  const [axX, axY] = phyToScr(0, 0);
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(axX, 0); ctx.lineTo(axX, SH); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, axY); ctx.lineTo(SW, axY); ctx.stroke();

  /* ── field vectors (small background arrows) ── */
  if (OP.showVectors) {
    const vstep = Math.round(gs * 0.75);
    for (let vx = vstep / 2; vx < SW; vx += vstep) {
      for (let vy = vstep / 2; vy < SH; vy += vstep) {
        const [xp, yp] = scrToPhy(vx, vy);
        const [ex, ey] = eField(xp, yp);
        const em = Math.hypot(ex, ey);
        if (em < 1e-6) continue;
        const len = Math.min(vstep * 0.38, Math.log1p(em * 0.4) / Math.log1p(4) * vstep * 0.38);
        const ux = ex / em, uy = ey / em;
        const x2 = vx + ux * len, y2 = vy - uy * len, as = 3.5;
        ctx.beginPath();
        ctx.strokeStyle = dark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.22)';
        ctx.lineWidth = 0.9;
        ctx.moveTo(vx, vy); ctx.lineTo(x2, y2);
        ctx.moveTo(x2, y2); ctx.lineTo(x2 - ux * as + uy * as * 0.4, y2 + uy * as + ux * as * 0.4);
        ctx.moveTo(x2, y2); ctx.lineTo(x2 - ux * as - uy * as * 0.4, y2 + uy * as - ux * as * 0.4);
        ctx.stroke();
      }
    }
  }

  /* ── field lines with directional arrows ── */
  if (OP.showLines && linesCache) {
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.62)' : 'rgba(0,0,0,0.54)';
    ctx.lineWidth = 1.3; ctx.setLineDash([]);

    for (let li = 0; li < linesCache.lines.length; li++) {
      const pts = linesCache.lines[li];
      const lineDir = linesCache.dirs[li];
      if (pts.length < 2) continue;

      const sPts = pts.map(([px, py]) => phyToScr(px, py));

      /* draw line path */
      ctx.beginPath();
      sPts.forEach(([sx, sy], j) => j === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy));
      ctx.stroke();

      /* cumulative screen-distance for arrow placement */
      const cum = [0];
      for (let i = 1; i < sPts.length; i++)
        cum.push(cum[i - 1] + Math.hypot(sPts[i][0] - sPts[i-1][0], sPts[i][1] - sPts[i-1][1]));
      if (cum[cum.length - 1] < 28) continue;

      /* draw arrowheads every ~54px; direction follows physical E (lineDir corrects reversed traces) */
      const spacing = 54;
      let nextD = spacing * 0.52;
      ctx.beginPath();
      for (let i = 1; i < sPts.length; i++) {
        if (cum[i] < nextD) continue;
        const dx = (sPts[i][0] - sPts[i-1][0]) * lineDir;
        const dy = (sPts[i][1] - sPts[i-1][1]) * lineDir;
        const len = Math.hypot(dx, dy);
        if (len < 0.3) { nextD += spacing; continue; }
        const ux = dx / len, uy = dy / len;
        const [ax, ay] = sPts[i];
        const as = 5.5;
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - ux * as + uy * as * 0.44, ay - uy * as - ux * as * 0.44);
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - ux * as - uy * as * 0.44, ay - uy * as + ux * as * 0.44);
        nextD += spacing;
      }
      ctx.stroke();
    }
  }

  /* ── charges ── */
  for (let i = 0; i < charges.length; i++) {
    const c = charges[i];
    if (c.q === 0) continue;
    const [sx, sy] = phyToScr(c.x, c.y);
    const R = 10;
    const col = c.q > 0
      ? (dark ? [255, 80, 40]  : [200, 60, 0])
      : (dark ? [40, 150, 255] : [0, 90, 200]);
    const gd = ctx.createRadialGradient(sx, sy, 0, sx, sy, R * 2.8);
    gd.addColorStop(0, `rgba(${col},0.28)`);
    gd.addColorStop(1, `rgba(${col},0.00)`);
    ctx.beginPath(); ctx.arc(sx, sy, R * 2.8, 0, Math.PI * 2);
    ctx.fillStyle = gd; ctx.fill();
    ctx.beginPath(); ctx.arc(sx, sy, R, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${col})`; ctx.fill();
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1; ctx.stroke();
    const q = c.q;
    const label = q > 0 ? (Math.abs(q) > 1 ? `+${q}` : '+') : (Math.abs(q) > 1 ? `${q}` : '−');
    ctx.font = `bold ${label.length > 1 ? 10 : 13}px Space Mono`;
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, sx, sy + 0.5);
  }

  /* ── test particle ── */
  {
    const [tx, ty] = phyToScr(testPt.x, testPt.y);
    const tc = dark ? [0, 255, 185] : [0, 140, 100];
    if (tEm > 0.001) {
      const len = Math.min(55, Math.log1p(tEm * 0.5) / Math.log1p(10) * 55);
      const ux = tEx / tEm, uy = tEy / tEm;
      const x2 = tx + ux * len, y2 = ty - uy * len, as = 8;
      ctx.beginPath(); ctx.strokeStyle = `rgba(${tc},0.85)`; ctx.lineWidth = 1.8;
      ctx.moveTo(tx, ty); ctx.lineTo(x2, y2);
      ctx.moveTo(x2, y2); ctx.lineTo(x2 - ux * as + uy * as * 0.45, y2 + uy * as + ux * as * 0.45);
      ctx.moveTo(x2, y2); ctx.lineTo(x2 - ux * as - uy * as * 0.45, y2 + uy * as - ux * as * 0.45);
      ctx.stroke();
    }
    const cr = 8;
    ctx.strokeStyle = `rgba(${tc},0.90)`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(tx - cr, ty); ctx.lineTo(tx + cr, ty);
    ctx.moveTo(tx, ty - cr); ctx.lineTo(tx, ty + cr); ctx.stroke();
    ctx.beginPath(); ctx.arc(tx, ty, 4, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${tc})`; ctx.fill();
  }

  ctx.restore();

  /* ── readout ── */
  document.getElementById('readout').innerHTML =
    `<span class="readout-cell"><span class="readout-label">sonda in</span><span class="readout-value">(${Lab.fmt(testPt.x, 1)}; ${Lab.fmt(testPt.y, 1)}) cm</span></span>` +
    `<span class="readout-cell"><span class="readout-label">potenziale V</span><span class="readout-value">${Math.abs(tV) < 1e4 ? Lab.sci(tV * V_UNIT, 3) + ' V' : '—'}</span></span>` +
    `<span class="readout-cell"><span class="readout-label">|E|</span><span class="readout-value">${Lab.sci(tEm * E_UNIT, 3)} kV/m</span></span>` +
    `<span class="readout-cell"><span class="readout-label">E_x</span><span class="readout-value">${Lab.sci(tEx * E_UNIT, 3)} kV/m</span></span>` +
    `<span class="readout-cell"><span class="readout-label">E_y</span><span class="readout-value">${Lab.sci(tEy * E_UNIT, 3)} kV/m</span></span>`;
}

/* ── Grafici ─────────────────────────────────────────────────────────────── */
// Unità reali: le cariche valgono q nC e le coordinate sono in cm. Con k = 8,99·10⁹ N·m²/C²
// il potenziale di 1 nC a 1 cm vale 899 V e il campo 89,9 kV/m: basta moltiplicare i valori
// normalizzati per queste costanti.
const V_UNIT = 899, E_UNIT = 89.9;     // V e kV/m
// 1-2: profili lungo la retta orizzontale che passa per la sonda; 3: |E| lungo il raggio
// dall'origine verso la sonda. Le linee tratteggiate segnano dove si trovano le cariche.
function drawGraph(cv, mode) {
  const C = Lab.graphColors();
  const markers = (c, f, xs) => {
    c.save(); c.setLineDash([3, 4]); c.lineWidth = 1;
    for (const [x, q] of xs) {
      if (x < f.X.inv0 || x > f.X.inv1) continue;
      c.strokeStyle = q > 0 ? 'rgba(255,90,60,0.55)' : 'rgba(60,150,255,0.55)';
      c.beginPath(); c.moveTo(f.X(x), f.T); c.lineTo(f.X(x), f.B); c.stroke();
    }
    c.restore();
  };
  const probe = (c, f, x, y) => {
    c.save(); c.setLineDash([4, 3]); c.strokeStyle = 'rgba(0,220,170,0.75)';
    c.beginPath(); c.moveTo(f.X(x), f.T); c.lineTo(f.X(x), f.B); c.stroke(); c.restore();
    if (Number.isFinite(y)) Lab.dot(c, f, x, y, '#00d8a8', 4);
  };
  if (mode === 'Er') {
    const rMax = VIEW * Math.SQRT2;
    const ang = (testPt.x === 0 && testPt.y === 0) ? 0 : Math.atan2(testPt.y, testPt.x);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const Em = r => { const v = Math.hypot(...eField(r * ca, r * sa)) * E_UNIT; return v < 300 * E_UNIT ? v : NaN; };
    let top = 0; for (let i = 1; i <= 200; i++) { const v = Em(rMax * i / 200); if (v < 40 * E_UNIT) top = Math.max(top, v); }
    const yM = Lab.niceMax(top || 1);
    const g = Lab.panel(cv, { title: `|E| lungo il raggio a ${Math.round(ang * 180 / Math.PI)}° (kV/m)`, xr: [0, rMax], yr: [0, yM], xLabel: 'r (cm)' });
    if (!g) return; const [c, f] = g;
    f.X.inv0 = 0; f.X.inv1 = rMax;
    markers(c, f, charges.filter(q => q.q).map(q => [q.x * ca + q.y * sa, q.q]).filter(([r]) => r > 0));
    Lab.plot(c, f, Em, [rMax / 400, rMax], C.accent, 2, [], 400);
    const rT = Math.hypot(testPt.x, testPt.y);
    probe(c, f, rT, Em(rT));
    return;
  }
  const yS = testPt.y;
  const fn = mode === 'V'
    ? x => { const v = potential(x, yS); return Math.abs(v) < 20 ? v * V_UNIT : NaN; }
    : x => { const e = Math.hypot(...eField(x, yS)); return e < 200 ? e * E_UNIT : NaN; };
  let top = 0; for (let i = 0; i <= 300; i++) { const v = Math.abs(fn(-VIEW + 2 * VIEW * i / 300)); if (Number.isFinite(v) && v < (mode === 'V' ? 8 * V_UNIT : 40 * E_UNIT)) top = Math.max(top, v); }
  const yM = Lab.niceMax(top || 1);
  const g = Lab.panel(cv, {
    title: mode === 'V' ? `Potenziale V lungo y = ${Lab.fmt(yS, 1)} cm (V)` : `|E| lungo y = ${Lab.fmt(yS, 1)} cm (kV/m)`,
    xr: [-VIEW, VIEW], yr: mode === 'V' ? [-yM, yM] : [0, yM], xLabel: 'x (cm)', yFmt: v => Lab.sci(v, 2),
  });
  if (!g) return; const [c, f] = g;
  f.X.inv0 = -VIEW; f.X.inv1 = VIEW;
  markers(c, f, charges.filter(q => q.q).map(q => [q.x, q.q]));
  Lab.plot(c, f, fn, [-VIEW, VIEW], mode === 'V' ? C.amber : C.accent, 2, [], 500);
  probe(c, f, testPt.x, fn(testPt.x));
}

/* ── Master draw ─────────────────────────────────────────────────────────── */
let gCanvas = [];
function draw() {
  drawScene();
  drawGraph(gCanvas[0], 'V');
  drawGraph(gCanvas[1], 'E');
  drawGraph(gCanvas[2], 'Er');
}

/* ── Resize ──────────────────────────────────────────────────────────────── */
function resizeCanvases() {
  const area = sc.parentElement;
  const ga = document.getElementById('graphArea');
  if (!gCanvas.length) gCanvas = Lab.graphPanels(ga, 3, 180);
  SW = area.clientWidth;
  SH = Math.max(80, area.clientHeight - ga.offsetHeight - (document.getElementById('readout').offsetHeight || 56));
  Lab.hidpi(sc, SW, SH);
  /* keep the physics center invariant across resize */
  const cx = -panX / (baseScale || 1), cy = panY / (baseScale || 1);
  baseScale = Math.min(SW, SH) / (2 * VIEW);
  scale = baseScale * zoom;
  panX = -cx * baseScale; panY = cy * baseScale;
  Lab.fitPanels(gCanvas);
  invalidateMap();
  if (SW > 0) draw();
}
new ResizeObserver(resizeCanvases).observe(sc.parentElement);

/* ── Zoom (scroll) ───────────────────────────────────────────────────────── */
sc.addEventListener('wheel', e => {
  e.preventDefault();
  const r = sc.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  const [px, py] = scrToPhy(mx, my);
  const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
  zoom = Math.max(0.2, Math.min(20, zoom * factor));
  scale = baseScale * zoom;
  panX = mx - SW / 2 - px * scale;
  panY = my - SH / 2 + py * scale;
  invalidateMap();
  draw();
}, { passive: false });

/* double-click on empty canvas: reset zoom & pan */
sc.addEventListener('dblclick', e => {
  const r = sc.getBoundingClientRect();
  if (!nearestObj(e.clientX - r.left, e.clientY - r.top)) {
    zoom = 1; panX = 0; panY = 0; scale = baseScale;
    invalidateMap(); draw();
  }
});

/* ── Controls ────────────────────────────────────────────────────────────── */
const SUBS = ['₁','₂','₃','₄','₅','₆','₇','₈'];

function setConfig(idx) {
  OP.configIdx = idx;
  charges = CONFIGS[idx].ch.map(c => ({ ...c }));
  invalidateAll();
  buildControls();
  draw();
}

function buildControls() {
  const panel = document.getElementById('controls');
  panel.innerHTML = '';

  /* Configurazione */
  const secCfg = Lab.Section('Configurazione');
  secCfg.add(Lab.RadioGroup({
    label: 'Tipo',
    options: CONFIGS.map(c => ({ value: c.name, label: c.name })),
    value: CONFIGS[OP.configIdx].name,
    onChange: v => {
      const i = CONFIGS.findIndex(c => c.name === v);
      if (i >= 0) setConfig(i);
    },
  }));
  panel.appendChild(secCfg.el);

  /* Cariche — per-charge q sliders */
  const secQ = Lab.Section('Cariche');
  charges.forEach((c, i) => {
    secQ.add(Lab.Slider({
      label: `q${SUBS[i] || i + 1}`, min: -3, max: 3, step: 1, value: c.q, unit: ' nC',
      onChange: v => {
        charges[i].q = v;
        invalidateAll();
        draw();
      },
    }));
  });
  panel.appendChild(secQ.el);

  /* Visualizzazione */
  const secVis = Lab.Section('Visualizzazione');
  secVis.add(Lab.RadioGroup({
    label: 'Mappa sfondo',
    options: [
      { value: 'V', label: 'Potenziale V' },
      { value: 'E', label: 'Campo |E|' },
    ],
    value: OP.mapMode,
    onChange: v => { OP.mapMode = v; invalidateMap(); draw(); },
  }));
  secVis.add(Lab.Toggle({
    label: 'Linee di campo', value: OP.showLines,
    onChange: v => { OP.showLines = v; draw(); },
  }));
  secVis.add(Lab.Slider({
    label: 'N. linee', min: 4, max: 24, step: 2, value: OP.nLines, unit: '',
    onChange: v => { OP.nLines = v; linesCache = null; draw(); },
  }));
  secVis.add(Lab.Toggle({
    label: 'Vettori campo E', value: OP.showVectors,
    onChange: v => { OP.showVectors = v; draw(); },
  }));
  panel.appendChild(secVis.el);

  const info = document.createElement('div');
  info.style.cssText = 'margin-top:14px;font-size:11px;color:var(--text-secondary);line-height:1.7;padding:10px 12px;background:var(--bg3);border-radius:8px';
  info.innerHTML =
    'Trascina la <span style="color:rgb(0,255,185)">sonda</span> (●) per misurare V ed <b>E</b>.<br>' +
    'Trascina le <b>cariche</b> per riposizionarle.<br>' +
    '<span style="color:rgb(255,80,40)">●</span> positiva &nbsp;' +
    '<span style="color:rgb(40,150,255)">●</span> negativa<br>' +
    'Trascina il canvas (area vuota): sposta la vista.<br>' +
    'Scroll: zoom centrato sul cursore.<br>' +
    'Doppio click: ripristina zoom e posizione.';
  panel.appendChild(info);
}

/* ── Mouse ───────────────────────────────────────────────────────────────── */
sc.style.cursor = 'grab';

function nearestObj(sx, sy) {
  const [tx, ty] = phyToScr(testPt.x, testPt.y);
  if (Math.hypot(sx - tx, sy - ty) < 14) return { type: 'test' };
  for (let i = 0; i < charges.length; i++) {
    const [cx, cy] = phyToScr(charges[i].x, charges[i].y);
    if (Math.hypot(sx - cx, sy - cy) < 14) return { type: 'charge', idx: i };
  }
  return null;
}

sc.addEventListener('mousedown', e => {
  const r = sc.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  const hit = nearestObj(mx, my);
  if (hit) {
    hit.type === 'test' ? (testDragging = true) : (chargeDragging = hit.idx);
    sc.style.cursor = 'crosshair';
  } else {
    panDragging = true;
    panStartX = e.clientX; panStartY = e.clientY;
    panOriginX = panX;     panOriginY = panY;
    sc.style.cursor = 'grabbing';
  }
  e.preventDefault();
});

window.addEventListener('mousemove', e => {
  if (panDragging) {
    panX = panOriginX + (e.clientX - panStartX);
    panY = panOriginY + (e.clientY - panStartY);
    invalidateMap();
    draw();
    return;
  }
  if (!testDragging && chargeDragging < 0) {
    /* update cursor on hover */
    const r = sc.getBoundingClientRect();
    if (e.target === sc) {
      sc.style.cursor = nearestObj(e.clientX - r.left, e.clientY - r.top) ? 'crosshair' : 'grab';
    }
    return;
  }
  const r = sc.getBoundingClientRect();
  const [xp, yp] = scrToPhy(e.clientX - r.left, e.clientY - r.top);
  if (testDragging) {
    testPt.x = xp; testPt.y = yp;
    draw();
  } else {
    charges[chargeDragging].x = xp;
    charges[chargeDragging].y = yp;
    invalidateAll();
    draw();
  }
});

window.addEventListener('mouseup', () => {
  if (panDragging) { panDragging = false; sc.style.cursor = 'grab'; }
  testDragging = false;
  chargeDragging = -1;
});

/* ── Init ────────────────────────────────────────────────────────────────── */
document.getElementById('themeToggle').addEventListener('click', () => {
  setTimeout(() => { invalidateAll(); draw(); }, 20);
});

buildControls();
resizeCanvases();

// i caratteri web arrivano dopo il primo disegno: senza ridisegnare, i grafici restano con il font di ripiego
if (document.fonts) document.fonts.ready.then(() => draw());
