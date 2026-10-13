'use strict';

/* ── Canvas refs ─────────────────────────────────────────────────────────── */
const sc   = document.getElementById('simCanvas');
const gc   = document.getElementById('graphCanvas');
const ctx  = sc.getContext('2d');
const gctx = gc.getContext('2d');
const DPR  = window.devicePixelRatio || 1;
let SW = 0, SH = 0, GW = 0, GH = 0;

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
    `<span class="readout-cell"><span class="readout-label">V</span><span class="readout-value">${Math.abs(tV) < 1e4 ? tV.toFixed(3) : '—'}</span></span>` +
    `<span class="readout-cell"><span class="readout-label">|E|</span><span class="readout-value">${tEm.toFixed(3)}</span></span>` +
    `<span class="readout-cell"><span class="readout-label">Ex</span><span class="readout-value">${tEx.toFixed(3)}</span></span>` +
    `<span class="readout-cell"><span class="readout-label">Ey</span><span class="readout-value">${tEy.toFixed(3)}</span></span>`;
}

/* ── Graph panel ─────────────────────────────────────────────────────────── */
function drawGraph(x0, panelW, mode) {
  const dark = dk();
  gctx.save(); gctx.scale(DPR, DPR);
  gctx.fillStyle = dark ? '#040810' : '#f0f4f8';
  gctx.fillRect(x0, 0, panelW, GH);

  const pad = { l: 42, r: 10, t: 14, b: 26 };
  const W = panelW - pad.l - pad.r, H = GH - pad.t - pad.b;

  if (mode === 'Er') {
    const rMax = VIEW * Math.SQRT2;
    const angle = (testPt.x === 0 && testPt.y === 0) ? 0 : Math.atan2(testPt.y, testPt.x);
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const N = 320;
    const pts = Array.from({ length: N }, (_, i) => {
      const r = rMax * (i + 0.5) / N;
      const [ex, ey] = eField(r * cosA, r * sinA);
      const em = Math.hypot(ex, ey);
      return { r, val: em < 300 ? em : null };
    });
    const vals = pts.filter(p => p.val !== null).map(p => p.val);
    const vMax = vals.length ? Math.max(...vals) : 1;
    const xS = r => x0 + pad.l + (r / rMax) * W;
    const yS = v => pad.t + H * (1 - Math.min(v, vMax) / vMax);

    /* grid */
    gctx.strokeStyle = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)'; gctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = pad.t + H * i / 4;
      gctx.beginPath(); gctx.moveTo(x0 + pad.l, y); gctx.lineTo(x0 + pad.l + W, y); gctx.stroke();
    }

    /* charge projections along the ray */
    for (const c of charges) {
      if (c.q === 0) continue;
      const rDot = c.x * cosA + c.y * sinA;
      if (rDot <= 0 || rDot >= rMax) continue;
      const cs = xS(rDot);
      const col = c.q > 0
        ? (dark ? 'rgba(255,80,40,0.45)'  : 'rgba(200,60,0,0.45)')
        : (dark ? 'rgba(40,150,255,0.45)' : 'rgba(0,90,200,0.45)');
      gctx.strokeStyle = col; gctx.lineWidth = 1; gctx.setLineDash([3, 4]);
      gctx.beginPath(); gctx.moveTo(cs, pad.t); gctx.lineTo(cs, pad.t + H); gctx.stroke();
      gctx.setLineDash([]);
    }

    /* curve */
    gctx.beginPath(); gctx.strokeStyle = dark ? '#00d4ff' : '#0060c0'; gctx.lineWidth = 2;
    let on = false;
    for (const p of pts) {
      if (p.val === null) { if (on) { gctx.stroke(); gctx.beginPath(); on = false; } continue; }
      const sx = xS(p.r), sy = yS(p.val);
      on ? gctx.lineTo(sx, sy) : (gctx.moveTo(sx, sy), on = true);
    }
    if (on) gctx.stroke();

    /* test particle marker at r = |testPt| */
    const rTest = Math.hypot(testPt.x, testPt.y);
    const txS = xS(rTest);
    if (rTest <= rMax && txS >= x0 + pad.l && txS <= x0 + pad.l + W) {
      gctx.strokeStyle = dark ? 'rgba(0,255,185,0.75)' : 'rgba(0,140,100,0.75)';
      gctx.lineWidth = 1.2; gctx.setLineDash([4, 3]);
      gctx.beginPath(); gctx.moveTo(txS, pad.t); gctx.lineTo(txS, pad.t + H); gctx.stroke();
      gctx.setLineDash([]);
      const emT = Math.hypot(...eField(testPt.x, testPt.y));
      if (emT < 300) {
        gctx.beginPath(); gctx.arc(txS, yS(emT), 4, 0, Math.PI * 2);
        gctx.fillStyle = dark ? '#00ffb8' : '#00a080'; gctx.fill();
      }
    }

    /* axes */
    gctx.strokeStyle = dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)';
    gctx.lineWidth = 1; gctx.setLineDash([]);
    gctx.beginPath();
    gctx.moveTo(x0 + pad.l, pad.t); gctx.lineTo(x0 + pad.l, pad.t + H);
    gctx.lineTo(x0 + pad.l + W, pad.t + H); gctx.stroke();

    gctx.font = '8px Space Mono'; gctx.fillStyle = dark ? '#80a0c0' : '#506080';
    gctx.textAlign = 'right'; gctx.textBaseline = 'middle';
    [0, 0.5, 1].forEach(t => gctx.fillText((vMax * (1 - t)).toFixed(1), x0 + pad.l - 3, pad.t + H * t));
    gctx.textAlign = 'center'; gctx.textBaseline = 'top';
    [0, 2, 4].forEach(r => {
      if (r <= rMax) gctx.fillText(r, xS(r), pad.t + H + 3);
    });

    const deg = Math.round(angle * 180 / Math.PI);
    gctx.fillStyle = dark ? '#608090' : '#405060';
    gctx.textAlign = 'center'; gctx.textBaseline = 'top';
    gctx.fillText(`|E|(r, ${deg}°)`, x0 + pad.l + W / 2, pad.t - 6);

    gctx.restore();
    return;
  }

  const N = 300, xMin = -VIEW, xMax = VIEW, ySlice = testPt.y;

  const pts = Array.from({ length: N }, (_, i) => {
    const xp = xMin + (xMax - xMin) * i / (N - 1);
    if (mode === 'V') {
      const v = potential(xp, ySlice);
      return { xp, val: Math.abs(v) < 20 ? v : null };
    }
    const [ex, ey] = eField(xp, ySlice);
    const em = Math.hypot(ex, ey);
    return { xp, val: em < 200 ? em : null };
  });

  const vals = pts.filter(p => p.val !== null).map(p => p.val);
  if (vals.length < 2) { gctx.restore(); return; }

  let vMin = Math.min(...vals), vMax = Math.max(...vals);
  if (mode === 'V') { const va = Math.max(Math.abs(vMin), Math.abs(vMax)); vMin = -va; vMax = va; }
  else vMin = 0;
  const vRange = (vMax - vMin) || 1;
  const xS = xp => x0 + pad.l + (xp - xMin) / (xMax - xMin) * W;
  const yS = v  => pad.t + H * (1 - (Math.max(vMin, Math.min(vMax, v)) - vMin) / vRange);

  gctx.strokeStyle = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)'; gctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = pad.t + H * i / 4;
    gctx.beginPath(); gctx.moveTo(x0 + pad.l, y); gctx.lineTo(x0 + pad.l + W, y); gctx.stroke();
  }

  if (mode === 'V') {
    const y0l = yS(0);
    gctx.strokeStyle = dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.16)';
    gctx.lineWidth = 1; gctx.setLineDash([4, 4]);
    gctx.beginPath(); gctx.moveTo(x0 + pad.l, y0l); gctx.lineTo(x0 + pad.l + W, y0l); gctx.stroke();
    gctx.setLineDash([]);
  }

  for (const c of charges) {
    const cs = xS(c.x);
    if (cs < x0 + pad.l || cs > x0 + pad.l + W) continue;
    const col = c.q > 0
      ? (dark ? 'rgba(255,80,40,0.40)'  : 'rgba(200,60,0,0.40)')
      : (dark ? 'rgba(40,150,255,0.40)' : 'rgba(0,90,200,0.40)');
    gctx.strokeStyle = col; gctx.lineWidth = 1; gctx.setLineDash([3, 4]);
    gctx.beginPath(); gctx.moveTo(cs, pad.t); gctx.lineTo(cs, pad.t + H); gctx.stroke();
    gctx.setLineDash([]);
  }

  gctx.beginPath(); gctx.strokeStyle = dark ? '#00d4ff' : '#0060c0'; gctx.lineWidth = 2;
  let on = false;
  for (const p of pts) {
    if (p.val === null) { if (on) { gctx.stroke(); gctx.beginPath(); on = false; } continue; }
    const sx = xS(p.xp), sy = yS(p.val);
    on ? gctx.lineTo(sx, sy) : (gctx.moveTo(sx, sy), on = true);
  }
  if (on) gctx.stroke();

  const txS = xS(testPt.x);
  if (txS >= x0 + pad.l && txS <= x0 + pad.l + W) {
    gctx.strokeStyle = dark ? 'rgba(0,255,185,0.75)' : 'rgba(0,140,100,0.75)';
    gctx.lineWidth = 1.2; gctx.setLineDash([4, 3]);
    gctx.beginPath(); gctx.moveTo(txS, pad.t); gctx.lineTo(txS, pad.t + H); gctx.stroke();
    gctx.setLineDash([]);
    const tv = mode === 'V' ? potential(testPt.x, testPt.y) : Math.hypot(...eField(testPt.x, testPt.y));
    if (Math.abs(tv) < (mode === 'V' ? 20 : 200)) {
      gctx.beginPath(); gctx.arc(txS, yS(tv), 4, 0, Math.PI * 2);
      gctx.fillStyle = dark ? '#00ffb8' : '#00a080'; gctx.fill();
    }
  }

  gctx.strokeStyle = dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)';
  gctx.lineWidth = 1; gctx.setLineDash([]);
  gctx.beginPath();
  gctx.moveTo(x0 + pad.l, pad.t); gctx.lineTo(x0 + pad.l, pad.t + H);
  gctx.lineTo(x0 + pad.l + W, pad.t + H); gctx.stroke();

  gctx.font = '8px Space Mono'; gctx.fillStyle = dark ? '#80a0c0' : '#506080';
  gctx.textAlign = 'right'; gctx.textBaseline = 'middle';
  [0, 0.5, 1].forEach(t => {
    const v = vMin + vRange * (1 - t);
    gctx.fillText(v.toFixed(1), x0 + pad.l - 3, pad.t + H * t);
  });
  gctx.textAlign = 'center'; gctx.textBaseline = 'top';
  [-3, 0, 3].forEach(xp => {
    if (xp >= xMin && xp <= xMax) gctx.fillText(xp, xS(xp), pad.t + H + 3);
  });

  gctx.fillStyle = dark ? '#608090' : '#405060';
  gctx.textAlign = 'center'; gctx.textBaseline = 'top';
  gctx.fillText(mode === 'V' ? 'V(x)  [u.a.]' : '|E|(x)  [u.a.]', x0 + pad.l + W / 2, pad.t - 6);

  if (mode === 'V' || mode === 'E') {
    gctx.strokeStyle = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.09)'; gctx.lineWidth = 1;
    gctx.beginPath(); gctx.moveTo(x0 + panelW - 0.5, 4); gctx.lineTo(x0 + panelW - 0.5, GH - 4); gctx.stroke();
  }

  gctx.restore();
}

/* ── Master draw ─────────────────────────────────────────────────────────── */
function draw() {
  drawScene();
  const third = Math.floor(GW / 3);
  drawGraph(0, third, 'V');
  drawGraph(third, third, 'E');
  drawGraph(2 * third, GW - 2 * third, 'Er');
}

/* ── Resize ──────────────────────────────────────────────────────────────── */
function resizeCanvases() {
  const area = sc.parentElement;
  SW = area.clientWidth;
  SH = sc.clientHeight || area.clientHeight * 0.60;
  sc.width = SW * DPR; sc.height = SH * DPR;
  sc.style.width = SW + 'px'; sc.style.height = SH + 'px';
  /* keep the physics center invariant across resize */
  const cx = -panX / (baseScale || 1), cy = panY / (baseScale || 1);
  baseScale = Math.min(SW, SH) / (2 * VIEW);
  scale = baseScale * zoom;
  panX = -cx * baseScale; panY = cy * baseScale;

  const ga = document.getElementById('graphArea');
  GW = ga.clientWidth; GH = ga.clientHeight;
  gc.width = GW * DPR; gc.height = GH * DPR;
  gc.style.width = GW + 'px'; gc.style.height = GH + 'px';
  invalidateMap();
  if (SW > 0 && GW > 0) draw();
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
      label: `q${SUBS[i] || i + 1}`, min: -3, max: 3, step: 1, value: c.q, unit: '',
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
