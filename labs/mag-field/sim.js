'use strict';

/* ── Canvas refs ─────────────────────────────────────────────────────────── */
const sc   = document.getElementById('simCanvas');
const ctx  = sc.getContext('2d');
let DPR  = window.devicePixelRatio || 1;
let SW = 0, SH = 0;

/* ── Theme ───────────────────────────────────────────────────────────────── */
Lab.initTheme('themeToggle');
const dk = () => document.documentElement.dataset.theme !== 'light';

/* ── Constants ───────────────────────────────────────────────────────────── */
const HL = 0.90;
const HW = 0.22;
const PI = Math.PI;

/* ── Preset configurations ───────────────────────────────────────────────── */
const CONFIGS = [
  { name: 'Singolo',      ms: [{ x: 0,  y:  0, angle: 0 }] },
  { name: 'Attrazione',   ms: [{ x: -2, y:  0, angle: 0 }, { x: 2, y: 0, angle: 0 }] },
  { name: 'Repulsione',   ms: [{ x: -2, y:  0, angle: 0 }, { x: 2, y: 0, angle: PI }] },
  { name: 'Antiparalleli',ms: [{ x:  0, y: -2, angle: 0 }, { x: 0, y: 2, angle: PI }] },
  { name: 'Croce', ms: [
    { x: -3, y:  0, angle:     0 }, { x: 3, y:  0, angle:    PI },
    { x:  0, y: -3, angle: PI/2  }, { x: 0, y:  3, angle: -PI/2 },
  ]},
];

/* ── State ───────────────────────────────────────────────────────────────── */
const VIEW = 4.5;
const OP = { configIdx: 0, nLines: 10, showLines: true, showVectors: false, mapMode: 'B', view3D: false };
let baseScale = 1, scale = 1, zoom = 1, panX = 0, panY = 0;
let magnets = CONFIGS[0].ms.map(m => ({ ...m }));
let poles   = [];
let testPt  = { x: 2.5, y: 0.5 };
let mapCache = null, linesCache = null, linesCache3D = null;

let testDragging = false, magnetDragging = -1;
let panDragging  = false, panStartX = 0, panStartY = 0, panOriginX = 0, panOriginY = 0;
let rot3X = 0.42, rot3Y = 0.38;
let rot3Dragging = false, rot3StartX = 0, rot3StartY = 0, rot3OrigX = 0, rot3OrigY = 0;

/* ── Poli e sorgenti del campo ─────────────────────────────────────────────── */
// Ogni magnete è una barra magnetizzata uniformemente (M lungo l'asse, da S a N). Fuori dalla barra
// il campo è quello di due "facce cariche" di segno opposto: ogni polo è distribuito su una griglia
// 3×3 di punti sulla faccia, così vicino ai poli il campo non diverge come per un polo puntiforme.
// Dentro la barra B = μ₀(H + M): si aggiunge M, e le linee di B attraversano il magnete da S a N
// chiudendosi su se stesse (non esistono monopoli). Unità normalizzate: H = Σ q·r̂/r².
const MAG = 4 * PI / (2 * HW) ** 2;   // M tale che il flusso di M nella barra eguagli quello uscente dal polo (4π·q)
let srcPts = [];
function updatePoles() {
  poles = []; srcPts = [];
  const off = [-HW * 0.66, 0, HW * 0.66];
  for (const m of magnets) {
    const ca = Math.cos(m.angle), sa = Math.sin(m.angle);
    poles.push({ x: m.x + HL * ca, y: m.y + HL * sa, q:  1 });
    poles.push({ x: m.x - HL * ca, y: m.y - HL * sa, q: -1 });
    for (const q of [1, -1]) for (const u of off) for (const w of off) {
      srcPts.push({ x: m.x + q * HL * ca - u * sa, y: m.y + q * HL * sa + u * ca, z: w, q: q / 9 });
    }
  }
}
// contributo della magnetizzazione: M dentro la barra, nulla fuori
function magM(x, y, z = 0) {
  let mx = 0, my = 0;
  for (const m of magnets) {
    const ca = Math.cos(m.angle), sa = Math.sin(m.angle);
    const dx = x - m.x, dy = y - m.y, u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
    if (Math.abs(u) < HL && Math.abs(v) < HW && Math.abs(z) < HW) { mx += MAG * ca; my += MAG * sa; }
  }
  return [mx, my];
}

/* ── Physics ─────────────────────────────────────────────────────────────── */
function bField(x, y) {
  let [bx, by] = magM(x, y);
  for (const p of srcPts) {
    const dx = x - p.x, dy = y - p.y, dz = p.z;
    const r2 = dx * dx + dy * dy + dz * dz;
    if (r2 < 1e-4) continue;
    const r3 = r2 ** 1.5;
    bx += p.q * dx / r3;
    by += p.q * dy / r3;
  }
  return [bx, by];
}

function bField3D(x, y, z) {
  let [bx, by] = magM(x, y, z), bz = 0;
  for (const p of srcPts) {
    const dx = x - p.x, dy = y - p.y, dz = z - p.z;
    const r2 = dx*dx + dy*dy + dz*dz;
    if (r2 < 1e-4) continue;
    const r3 = r2 ** 1.5;
    bx += p.q * dx / r3;
    by += p.q * dy / r3;
    bz += p.q * dz / r3;
  }
  return [bx, by, bz];
}

/* ── Mappa dei colori ─────────────────────────────────────────────────────── */
function lerpStops(S, t) {
  for (let i = 1; i < S.length; i++) {
    if (t <= S[i][0] || i === S.length - 1) {
      const [t0, c0] = S[i-1], [t1, c1] = S[i];
      const f = Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
      return [c0[0]+(c1[0]-c0[0])*f|0, c0[1]+(c1[1]-c0[1])*f|0, c0[2]+(c1[2]-c0[2])*f|0];
    }
  }
}

// stessa tavolozza della mappa |B| del lab "Campi da correnti": nero → blu → azzurro → bianco
function bToRGB(bm, dark) {
  /* la potenza 0,28 allarga i valori intermedi: il campo resta visibile anche lontano dai poli */
  const t = Math.min(1, Math.pow(Math.max(0, bm) * 0.08, 0.28));
  if (dark) {
    return lerpStops([
      [0.00, [  6, 10, 16]],
      [0.30, [ 10, 36, 62]],
      [0.60, [  0,110,150]],
      [0.85, [  0,200,240]],
      [1.00, [210,250,255]],
    ], t);
  }
  return lerpStops([
    [0.00, [244,247,250]],
    [0.35, [196,228,242]],
    [0.65, [ 84,176,216]],
    [0.85, [  0,112,170]],
    [1.00, [ 10, 52, 96]],
  ], t);
}

/* ── Caches ──────────────────────────────────────────────────────────────── */
function invalidateMap()  { mapCache = null; }
function invalidateAll()  { mapCache = null; linesCache = null; linesCache3D = null; }

function ensureMap() {
  if (mapCache && mapCache.dark === dk() && mapCache.scale === scale
      && mapCache.panX === panX && mapCache.panY === panY) return;
  const PW = Math.round(SW * DPR), PH = Math.round(SH * DPR);
  const img = ctx.createImageData(PW, PH);
  const d = img.data, dark = dk(), hw = SW / 2, hh = SH / 2;
  for (let iy = 0; iy < PH; iy++) {
    for (let ix = 0; ix < PW; ix++) {
      const xp = (ix / DPR - hw - panX) / scale, yp = -(iy / DPR - hh - panY) / scale;
      const [bx, by] = bField(xp, yp);
      const [r, g, b] = bToRGB(Math.hypot(bx, by), dark);
      const px = (iy * PW + ix) * 4;
      d[px] = r; d[px+1] = g; d[px+2] = b; d[px+3] = 255;
    }
  }
  mapCache = { img, dark: dk(), scale, panX, panY };
}

/* ── 2D field line tracing ───────────────────────────────────────────────── */
function traceLine(x0, y0, dir) {
  let x = x0, y = y0;
  const pts = [[x, y]];
  const ds = 0.018, capR = 0.30, bound = VIEW * 9;
  const stopPred = dir > 0 ? (q => q < 0) : (q => q > 0);
  const targets  = poles.filter(p => stopPred(p.q));
  let escaped = false;
  for (let i = 0; i < 6000; i++) {
    const [bx, by] = bField(x, y);
    const bm = Math.hypot(bx, by);
    if (bm < 1e-10) break;
    let step = ds;
    if (targets.length > 0) {
      const minD = Math.min(...targets.map(p => Math.hypot(x - p.x, y - p.y)));
      if (minD < capR * 5) step = ds * Math.max(0.2, minD / (capR * 5));
    }
    x += dir * bx / bm * step;
    y += dir * by / bm * step;
    if (Math.abs(x) > bound || Math.abs(y) > bound) { escaped = true; pts.push([x, y]); break; }
    if (targets.some(p => Math.hypot(x - p.x, y - p.y) < capR)) break;
    pts.push([x, y]);
  }
  return { pts, escaped };
}

function ensureLines() {
  if (linesCache && linesCache.nLines === OP.nLines) return;
  const lines = [], dirs = [];
  const nPoles = poles.filter(p => p.q > 0);
  const sPoles = poles.filter(p => p.q < 0);
  if (nPoles.length === 0) {
    for (const p of sPoles) {
      for (let i = 0; i < OP.nLines; i++) {
        const a = 2 * PI * i / OP.nLines;
        const { pts } = traceLine(p.x + 0.14 * Math.cos(a), p.y + 0.14 * Math.sin(a), -1);
        lines.push(pts); dirs.push(-1);
      }
    }
  } else {
    for (const p of nPoles) {
      for (let i = 0; i < OP.nLines; i++) {
        const a = 2 * PI * i / OP.nLines;
        const { pts } = traceLine(p.x + 0.14 * Math.cos(a), p.y + 0.14 * Math.sin(a), 1);
        lines.push(pts); dirs.push(1);
      }
    }
    for (const p of sPoles) {
      for (let i = 0; i < OP.nLines; i++) {
        const a = 2 * PI * i / OP.nLines;
        const { pts, escaped } = traceLine(p.x + 0.14 * Math.cos(a), p.y + 0.14 * Math.sin(a), -1);
        if (escaped) { lines.push(pts); dirs.push(-1); }
      }
    }
  }
  linesCache = { lines, dirs, nLines: OP.nLines };
}

/* ── 3D field line tracing ───────────────────────────────────────────────── */
function traceLine3D(x0, y0, z0, dir) {
  let x = x0, y = y0, z = z0;
  const pts = [[x, y, z]];
  const ds = 0.022, capR = 0.32, bound = VIEW * 5;
  const stopPred = dir > 0 ? (q => q < 0) : (q => q > 0);
  const targets  = poles.filter(p => stopPred(p.q));
  let escaped = false;
  for (let i = 0; i < 5000; i++) {
    const [bx, by, bz] = bField3D(x, y, z);
    const bm = Math.hypot(bx, by, bz);
    if (bm < 1e-10) break;
    let step = ds;
    if (targets.length > 0) {
      const minD = Math.min(...targets.map(p => Math.hypot(x - p.x, y - p.y, z)));
      if (minD < capR * 5) step = ds * Math.max(0.2, minD / (capR * 5));
    }
    x += dir * bx / bm * step;
    y += dir * by / bm * step;
    z += dir * bz / bm * step;
    if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) > bound) {
      escaped = true; pts.push([x, y, z]); break;
    }
    if (targets.some(p => Math.hypot(x - p.x, y - p.y, z) < capR)) break;
    pts.push([x, y, z]);
  }
  return { pts, escaped };
}

function fibonacciSphere(n) {
  const pts = [], phi = PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const fy = 1 - (i / (n - 1)) * 2;
    const r  = Math.sqrt(Math.max(0, 1 - fy * fy));
    const th = phi * i;
    pts.push([r * Math.cos(th), fy, r * Math.sin(th)]);
  }
  return pts;
}

function ensureLines3D() {
  const nDir = Math.max(8, OP.nLines * 2);
  if (linesCache3D && linesCache3D.nDir === nDir) return;
  const lines3D = [];
  const dirs3D  = fibonacciSphere(nDir);
  const R = 0.16;
  const nPoles = poles.filter(p => p.q > 0);
  const sPoles = poles.filter(p => p.q < 0);

  if (nPoles.length === 0) {
    for (const p of sPoles) {
      for (const [dx, dy, dz] of dirs3D) {
        const { pts } = traceLine3D(p.x + R*dx, p.y + R*dy, R*dz, -1);
        if (pts.length > 3) lines3D.push(pts);
      }
    }
  } else {
    /* Forward from N poles — captures lines that close quickly to S */
    for (const p of nPoles) {
      for (const [dx, dy, dz] of dirs3D) {
        const { pts } = traceLine3D(p.x + R*dx, p.y + R*dy, R*dz, 1);
        if (pts.length > 3) lines3D.push(pts);
      }
    }
    /* Backward from S poles — keep only escaped lines.
       These represent the incoming half of long-range field lines that
       exit the view boundary before numerically closing. */
    for (const p of sPoles) {
      for (const [dx, dy, dz] of dirs3D) {
        const { pts, escaped } = traceLine3D(p.x + R*dx, p.y + R*dy, R*dz, -1);
        if (escaped && pts.length > 3) lines3D.push(pts);
      }
    }
  }
  linesCache3D = { lines: lines3D, nDir };
}

/* ── Coordinate helpers ──────────────────────────────────────────────────── */
const phyToScr = (x, y) => [SW / 2 + panX + x * scale, SH / 2 + panY - y * scale];
const scrToPhy = (sx, sy) => [(sx - SW / 2 - panX) / scale, -(sy - SH / 2 - panY) / scale];

/* ── 3D projection (yaw then pitch, orthographic) ────────────────────────── */
function project3D(x, y, z) {
  const cy = Math.cos(rot3Y), sy = Math.sin(rot3Y);
  const x1 =  x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const cx = Math.cos(rot3X), sx2 = Math.sin(rot3X);
  const y2 =  y * cx - z1 * sx2;
  const z2 =  y * sx2 + z1 * cx;
  const [scrX, scrY] = phyToScr(x1, y2);
  return [scrX, scrY, z2];
}

/* ── Iron filings ────────────────────────────────────────────────────────── */
function drawFilings() {
  const dark = dk();
  const spPx = 18, spPhy = spPx / scale;
  const [xl, yt] = scrToPhy(0, 0);
  const [xr, yb] = scrToPhy(SW, SH);
  const x0 = Math.floor(xl / spPhy) * spPhy;
  const y0 = Math.floor(yb / spPhy) * spPhy;
  ctx.strokeStyle = dark ? 'rgba(0,195,145,0.55)' : 'rgba(0,100,70,0.50)';
  ctx.lineWidth = 1.1;
  for (let xi = x0; xi <= xr + spPhy; xi += spPhy) {
    for (let yi = y0; yi <= yt + spPhy; yi += spPhy) {
      const [bx, by] = bField(xi, yi);
      const bm = Math.hypot(bx, by);
      if (bm < 1e-6) continue;
      const ux = bx / bm, uy = by / bm;
      const lenPx = Math.min(spPx * 0.42, Math.log1p(bm * 0.3) / Math.log1p(3) * spPx * 0.44);
      const [sx, sy] = phyToScr(xi, yi);
      ctx.beginPath();
      ctx.moveTo(sx - ux*lenPx, sy + uy*lenPx);
      ctx.lineTo(sx + ux*lenPx, sy - uy*lenPx);
      ctx.stroke();
    }
  }
}

/* ── Rounded rect ────────────────────────────────────────────────────────── */
function roundRectPath(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);  c.quadraticCurveTo(x + w, y,     x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);  c.quadraticCurveTo(x,     y + h, x,     y + h - r);
  c.lineTo(x, y + r);      c.quadraticCurveTo(x,     y,     x + r, y);
  c.closePath();
}

/* ── Magnet 2D ───────────────────────────────────────────────────────────── */
function drawMagnet(m) {
  const [sx, sy] = phyToScr(m.x, m.y);
  const hw = HL * scale, hh = HW * scale, r = hh * 0.45;
  const dark = dk();
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(-m.angle);
  const g = ctx.createLinearGradient(-hw, 0, hw, 0);
  g.addColorStop(0,     dark ? '#1a5cbf' : '#1050a0');
  g.addColorStop(0.499, dark ? '#1a5cbf' : '#1050a0');
  g.addColorStop(0.501, dark ? '#bf2525' : '#9e1c1c');
  g.addColorStop(1,     dark ? '#bf2525' : '#9e1c1c');
  ctx.beginPath(); roundRectPath(ctx, -hw, -hh, hw*2, hh*2, r);
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); roundRectPath(ctx, -hw, -hh, hw*2, hh*2, r); ctx.stroke();
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, -hh); ctx.lineTo(0, hh); ctx.stroke();
  const fs = Math.max(8, Math.min(Math.round(hh * 1.35), Math.round(hw * 0.5)));
  ctx.font = `bold ${fs}px DM Sans`;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('S', -hw * 0.5, 0.5);
  ctx.fillText('N',  hw * 0.5, 0.5);
  ctx.restore();
}

/* ── Magnet 3D parallelepiped ────────────────────────────────────────────── */
function drawMagnet3D(m, dark) {
  const ca = Math.cos(m.angle), sa = Math.sin(m.angle);
  const HT = 0.18;  // half-thickness in z

  /* Project a corner given (length-factor, width-factor, height-factor) */
  const C = (lf, wf, hf) => project3D(
    m.x + lf * HL * ca - wf * HW * sa,
    m.y + lf * HL * sa + wf * HW * ca,
    hf * HT
  );

  /* 3 cross-section layers: S end (l=-1), centre (l=0), N end (l=+1) */
  const s0 = C(-1,-1, 1), s1 = C(-1, 1, 1), s2 = C(-1, 1,-1), s3 = C(-1,-1,-1);
  const m0 = C( 0,-1, 1), m1 = C( 0, 1, 1), m2 = C( 0, 1,-1), m3 = C( 0,-1,-1);
  const n0 = C( 1,-1, 1), n1 = C( 1, 1, 1), n2 = C( 1, 1,-1), n3 = C( 1,-1,-1);

  /* Face colours – S half blue, N half red, shaded by face orientation */
  const sTop = dark ? 'rgba(35,100,220,0.95)' : 'rgba(22,75,185,0.95)';
  const sSide= dark ? 'rgba(22, 70,175,0.90)' : 'rgba(14,56,150,0.90)';
  const sCap = dark ? 'rgba(15, 52,150,0.85)' : 'rgba(10,40,128,0.85)';
  const nTop = dark ? 'rgba(220, 45, 45,0.95)': 'rgba(185,28,28,0.95)';
  const nSide= dark ? 'rgba(178, 35, 35,0.90)': 'rgba(150,20,20,0.90)';
  const nCap = dark ? 'rgba(148, 26, 26,0.85)': 'rgba(125,15,15,0.85)';

  const faces = [
    /* S half: 5 faces */
    { pts: [s0,s1,s2,s3], col: sCap  }, // S end cap
    { pts: [s0,m0,m3,s3], col: sSide }, // S back
    { pts: [s1,m1,m2,s2], col: sSide }, // S front
    { pts: [s3,m3,m2,s2], col: sCap  }, // S bottom
    { pts: [s0,m0,m1,s1], col: sTop  }, // S top
    /* N half: 5 faces */
    { pts: [n0,n1,n2,n3], col: nCap  }, // N end cap
    { pts: [m0,n0,n3,m3], col: nSide }, // N back
    { pts: [m1,n1,n2,m2], col: nSide }, // N front
    { pts: [m3,n3,n2,m2], col: nCap  }, // N bottom
    { pts: [m0,n0,n1,m1], col: nTop  }, // N top
  ];

  /* Painter's algorithm: sort back-to-front by average projected depth */
  for (const f of faces) f.depth = f.pts.reduce((s,p) => s + p[2], 0) / f.pts.length;
  faces.sort((a, b) => a.depth - b.depth);

  const edgeCol = dark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 0.7;
  for (const f of faces) {
    ctx.beginPath();
    f.pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
    ctx.closePath();
    ctx.fillStyle = f.col; ctx.fill();
    ctx.strokeStyle = edgeCol; ctx.stroke();
  }

  /* N / S labels on top face */
  const [slx, sly] = C(-0.5, 0, 1);
  const [nlx, nly] = C( 0.5, 0, 1);
  ctx.font = 'bold 10px DM Sans';
  ctx.fillStyle = 'rgba(255,255,255,0.93)';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('S', slx, sly);
  ctx.fillText('N', nlx, nly);
}

/* ── Draw 2D scene ───────────────────────────────────────────────────────── */
function drawScene() {
  const dark = dk();

  if (OP.mapMode === 'B') {
    ensureMap();
    ctx.putImageData(mapCache.img, 0, 0);
  }
  if (OP.showLines) ensureLines();

  ctx.save();
  ctx.scale(DPR, DPR);

  if (OP.mapMode !== 'B') {
    ctx.fillStyle = dark ? '#060a10' : '#f0f4f8';
    ctx.fillRect(0, 0, SW, SH);
    if (OP.mapMode === 'limature') drawFilings();
  }

  /* grid */
  const gs = scale;
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  ctx.lineWidth = 0.5; ctx.setLineDash([]);
  const ox = ((SW/2 + panX) % gs + gs) % gs, oy = ((SH/2 + panY) % gs + gs) % gs;
  for (let x = ox; x <= SW; x += gs) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,SH); ctx.stroke(); }
  for (let y = oy; y <= SH; y += gs) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(SW,y); ctx.stroke(); }
  const [axX, axY] = phyToScr(0, 0);
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.14)'; ctx.lineWidth = 1;
  if (axX >= 0 && axX <= SW) { ctx.beginPath(); ctx.moveTo(axX,0); ctx.lineTo(axX,SH); ctx.stroke(); }
  if (axY >= 0 && axY <= SH) { ctx.beginPath(); ctx.moveTo(0,axY); ctx.lineTo(SW,axY); ctx.stroke(); }

  /* field vectors */
  if (OP.showVectors) {
    const vstep = Math.round(gs * 0.75);
    for (let vx = vstep/2; vx < SW; vx += vstep) {
      for (let vy = vstep/2; vy < SH; vy += vstep) {
        const [xp, yp] = scrToPhy(vx, vy);
        const [bx, by] = bField(xp, yp);
        const bm = Math.hypot(bx, by);
        if (bm < 1e-6) continue;
        const len = Math.min(vstep*0.38, Math.log1p(bm*0.4)/Math.log1p(4)*vstep*0.38);
        const ux = bx/bm, uy = by/bm;
        const x2 = vx+ux*len, y2 = vy-uy*len, as = 3.5;
        ctx.beginPath();
        ctx.strokeStyle = dark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.22)';
        ctx.lineWidth = 0.9;
        ctx.moveTo(vx,vy); ctx.lineTo(x2,y2);
        ctx.moveTo(x2,y2); ctx.lineTo(x2-ux*as+uy*as*0.4, y2+uy*as+ux*as*0.4);
        ctx.moveTo(x2,y2); ctx.lineTo(x2-ux*as-uy*as*0.4, y2+uy*as-ux*as*0.4);
        ctx.stroke();
      }
    }
  }

  /* field lines with arrows */
  if (OP.showLines && linesCache) {
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.62)' : 'rgba(0,0,0,0.54)';
    ctx.lineWidth = 1.3; ctx.setLineDash([]);
    for (let li = 0; li < linesCache.lines.length; li++) {
      const pts = linesCache.lines[li];
      const lineDir = linesCache.dirs[li];
      if (pts.length < 2) continue;
      const sPts = pts.map(([px, py]) => phyToScr(px, py));
      ctx.beginPath();
      sPts.forEach(([sx, sy], j) => j===0 ? ctx.moveTo(sx,sy) : ctx.lineTo(sx,sy));
      ctx.stroke();
      const cum = [0];
      for (let i = 1; i < sPts.length; i++)
        cum.push(cum[i-1] + Math.hypot(sPts[i][0]-sPts[i-1][0], sPts[i][1]-sPts[i-1][1]));
      if (cum[cum.length-1] < 28) continue;
      let nextD = 54 * 0.52;
      ctx.beginPath();
      for (let i = 1; i < sPts.length; i++) {
        if (cum[i] < nextD) continue;
        const dx = (sPts[i][0]-sPts[i-1][0]) * lineDir;
        const dy = (sPts[i][1]-sPts[i-1][1]) * lineDir;
        const len = Math.hypot(dx, dy);
        if (len < 0.3) { nextD += 54; continue; }
        const ux = dx/len, uy = dy/len;
        const [ax, ay] = sPts[i], as = 5.5;
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax-ux*as+uy*as*0.44, ay-uy*as-ux*as*0.44);
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax-ux*as-uy*as*0.44, ay-uy*as+ux*as*0.44);
        nextD += 54;
      }
      ctx.stroke();
    }
  }

  /* magnets */
  for (const m of magnets) drawMagnet(m);

  /* test particle */
  const [tBx, tBy] = bField(testPt.x, testPt.y);
  const tBm = Math.hypot(tBx, tBy);
  {
    const [tx, ty] = phyToScr(testPt.x, testPt.y);
    const tc = dark ? '0,255,185' : '0,140,100';
    if (tBm > 0.001) {
      const len = Math.min(55, Math.log1p(tBm*0.5)/Math.log1p(10)*55);
      const ux = tBx/tBm, uy = tBy/tBm;
      const x2 = tx+ux*len, y2 = ty-uy*len, as = 8;
      ctx.beginPath(); ctx.strokeStyle = `rgba(${tc},0.85)`; ctx.lineWidth = 1.8;
      ctx.moveTo(tx,ty); ctx.lineTo(x2,y2);
      ctx.moveTo(x2,y2); ctx.lineTo(x2-ux*as+uy*as*0.45, y2+uy*as+ux*as*0.45);
      ctx.moveTo(x2,y2); ctx.lineTo(x2-ux*as-uy*as*0.45, y2+uy*as-ux*as*0.45);
      ctx.stroke();
    }
    ctx.strokeStyle = `rgba(${tc},0.90)`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(tx-8,ty); ctx.lineTo(tx+8,ty);
    ctx.moveTo(tx,ty-8); ctx.lineTo(tx,ty+8); ctx.stroke();
    ctx.beginPath(); ctx.arc(tx,ty,4,0,PI*2);
    ctx.fillStyle = `rgb(${tc})`; ctx.fill();
  }

  ctx.restore();

  document.getElementById('readout').innerHTML =
    `<span class="readout-cell"><span class="readout-label">sonda in</span><span class="readout-value">(${Lab.fmt(testPt.x, 1)}; ${Lab.fmt(testPt.y, 1)}) cm</span></span>` +
    `<span class="readout-cell"><span class="readout-label">|B|</span><span class="readout-value">${Lab.sci(tBm * B_UNIT, 3)} mT</span></span>` +
    `<span class="readout-cell"><span class="readout-label">B_x</span><span class="readout-value">${Lab.sci(tBx * B_UNIT, 3)} mT</span></span>` +
    `<span class="readout-cell"><span class="readout-label">B_y</span><span class="readout-value">${Lab.sci(tBy * B_UNIT, 3)} mT</span></span>`;
}

/* ── Draw 3D scene ───────────────────────────────────────────────────────── */
function drawScene3D() {
  const dark = dk();
  ctx.save();
  ctx.scale(DPR, DPR);
  ctx.fillStyle = dark ? '#060a10' : '#f0f4f8';
  ctx.fillRect(0, 0, SW, SH);

  /* floor grid in z=0 plane */
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 0.5; ctx.setLineDash([]);
  for (let v = -4; v <= 4; v++) {
    const [ax,ay] = project3D(-4,v,0), [bx,by] = project3D(4,v,0);
    const [cx,cy] = project3D(v,-4,0), [dx,dy] = project3D(v,4,0);
    ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(dx,dy); ctx.stroke();
  }

  /* z-axis */
  ctx.setLineDash([4,4]);
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1;
  const [za0x,za0y] = project3D(0,0,-2.8), [za1x,za1y] = project3D(0,0,2.8);
  ctx.beginPath(); ctx.moveTo(za0x,za0y); ctx.lineTo(za1x,za1y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = '10px Space Mono';
  ctx.fillStyle = dark ? '#608090' : '#405060';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText('z', za1x, za1y - 4);

  /* 3D field lines — white, depth-sorted, with directional arrowheads */
  if (OP.showLines) {
    ensureLines3D();
    if (linesCache3D && linesCache3D.lines.length > 0) {
      /* Project all lines once */
      const projLines = linesCache3D.lines.map(pts => pts.map(p => project3D(...p)));

      /* Collect segments with depth for sorting */
      const segs = [];
      for (const sPts of projLines) {
        for (let i = 0; i < sPts.length - 1; i++) {
          segs.push({
            ax: sPts[i][0], ay: sPts[i][1],
            bx: sPts[i+1][0], by: sPts[i+1][1],
            depth: (sPts[i][2] + sPts[i+1][2]) * 0.5,
          });
        }
      }
      segs.sort((a, b) => a.depth - b.depth);

      /* Draw lines — white with depth-based opacity */
      const dMin = segs[0]?.depth ?? 0, dMax = segs[segs.length-1]?.depth ?? 1;
      const dRng = (dMax - dMin) || 1;
      for (const s of segs) {
        const f = (s.depth - dMin) / dRng;
        const alpha = (0.28 + 0.55 * f).toFixed(2);
        ctx.strokeStyle = dark ? `rgba(255,255,255,${alpha})` : `rgba(30,30,30,${alpha})`;
        ctx.lineWidth = 0.80 + 0.55 * f;
        ctx.beginPath(); ctx.moveTo(s.ax, s.ay); ctx.lineTo(s.bx, s.by); ctx.stroke();
      }

      /* Arrowheads — placed at ~50% along each line in screen space */
      ctx.strokeStyle = dark ? 'rgba(255,255,255,0.85)' : 'rgba(30,30,30,0.80)';
      ctx.lineWidth = 1.2;
      for (const sPts of projLines) {
        const cum = [0];
        for (let i = 1; i < sPts.length; i++)
          cum.push(cum[i-1] + Math.hypot(sPts[i][0]-sPts[i-1][0], sPts[i][1]-sPts[i-1][1]));
        const total = cum[cum.length - 1];
        if (total < 30) continue;
        /* One arrow near midpoint; two arrows for long lines */
        const targets = total > 160 ? [total * 0.30, total * 0.70] : [total * 0.50];
        ctx.beginPath();
        for (const tgt of targets) {
          for (let i = 1; i < sPts.length; i++) {
            if (cum[i] < tgt) continue;
            const dx = sPts[i][0] - sPts[i-1][0], dy = sPts[i][1] - sPts[i-1][1];
            const len = Math.hypot(dx, dy);
            if (len < 0.3) break;
            const ux = dx/len, uy = dy/len;
            const [ax, ay] = sPts[i], as = 5.5;
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax - ux*as + uy*as*0.44, ay - uy*as - ux*as*0.44);
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax - ux*as - uy*as*0.44, ay - uy*as + ux*as*0.44);
            break;
          }
        }
        ctx.stroke();
      }
    }
  }

  /* magnets */
  for (const m of magnets) drawMagnet3D(m, dark);

  /* hint */
  ctx.font = '11px DM Sans';
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.22)';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('Trascina: ruota  •  Scroll: zoom  •  Doppio click: reimposta', 10, 8);

  ctx.restore();

  document.getElementById('readout').innerHTML =
    `<span class="readout-cell"><span class="readout-label">rotazione X</span><span class="readout-value">${Lab.fmt(rot3X*180/PI,0)}°</span></span>` +
    `<span class="readout-cell"><span class="readout-label">rotazione Y</span><span class="readout-value">${Lab.fmt(rot3Y*180/PI,0)}°</span></span>`;
}

/* ── Grafici ─────────────────────────────────────────────────────────────── */
// Le coordinate sono in cm: ogni magnete è una barretta al neodimio lunga 1,8 cm. B_UNIT converte
// il campo normalizzato in mT, scelto in modo che al centro della barra B ≈ 1,2 T (valore tipico).
let B_UNIT = 1;
function calibrateB() {
  const keep = magnets; magnets = [{ x: 0, y: 0, angle: 0 }]; updatePoles();
  B_UNIT = 1200 / Math.hypot(...bField(0, 0));
  magnets = keep; updatePoles();
}
// 1: |B| e 2: B_x lungo la retta orizzontale per la sonda; 3: |B| lungo il raggio verso la sonda
function drawGraph(cv, mode) {
  const C = Lab.graphColors();
  const probe = (c, f, x, y) => {
    c.save(); c.setLineDash([4, 3]); c.strokeStyle = 'rgba(0,220,170,0.75)';
    c.beginPath(); c.moveTo(f.X(x), f.T); c.lineTo(f.X(x), f.B); c.stroke(); c.restore();
    if (Number.isFinite(y)) Lab.dot(c, f, x, y, '#00d8a8', 4);
  };
  const inMagnet = (x, y) => magnets.some(m => {
    const ca = Math.cos(m.angle), sa = Math.sin(m.angle), dx = x - m.x, dy = y - m.y;
    return Math.abs(dx * ca + dy * sa) < HL && Math.abs(-dx * sa + dy * ca) < HW;
  });
  const shadeMagnets = (c, f, along) => {
    // fasce grigie dove la retta del grafico attraversa un magnete
    c.save(); c.fillStyle = C.light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
    let start = null;
    for (let i = 0; i <= 400; i++) {
      const s = f.X.a + (f.X.b - f.X.a) * i / 400, inside = inMagnet(...along(s));
      if (inside && start === null) start = s;
      if ((!inside || i === 400) && start !== null) { c.fillRect(f.X(start), f.T, f.X(s) - f.X(start), f.B - f.T); start = null; }
    }
    c.restore();
  };
  if (mode === 'Br') {
    const rMax = VIEW * Math.SQRT2;
    const ang = (testPt.x === 0 && testPt.y === 0) ? 0 : Math.atan2(testPt.y, testPt.x);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const Bm = r => Math.hypot(...bField(r * ca, r * sa)) * B_UNIT;
    let top = 0; for (let i = 1; i <= 200; i++) top = Math.max(top, Bm(rMax * i / 200));
    const yM = Lab.niceMax(Math.min(top, 1500) || 1);
    const g = Lab.panel(cv, { title: `|B| lungo il raggio a ${Math.round(ang * 180 / PI)}° (mT)`, xr: [0, rMax], yr: [0, yM], xLabel: 'r (cm)' });
    if (!g) return; const [c, f] = g;
    f.X.a = 0; f.X.b = rMax; shadeMagnets(c, f, r => [r * ca, r * sa]);
    Lab.plot(c, f, Bm, [0, rMax], C.accent, 2, [], 400);
    const rT = Math.hypot(testPt.x, testPt.y);
    probe(c, f, rT, Bm(rT));
    return;
  }
  const yS = testPt.y;
  const fn = mode === 'Bx' ? x => bField(x, yS)[0] * B_UNIT : x => Math.hypot(...bField(x, yS)) * B_UNIT;
  let top = 0; for (let i = 0; i <= 300; i++) top = Math.max(top, Math.abs(fn(-VIEW + 2 * VIEW * i / 300)));
  const yM = Lab.niceMax(Math.min(top, 1500) || 1);
  const g = Lab.panel(cv, {
    title: mode === 'Bx' ? `Componente B_x lungo y = ${Lab.fmt(yS, 1)} cm (mT)` : `|B| lungo y = ${Lab.fmt(yS, 1)} cm (mT)`,
    xr: [-VIEW, VIEW], yr: mode === 'Bx' ? [-yM, yM] : [0, yM], xLabel: 'x (cm)',
  });
  if (!g) return; const [c, f] = g;
  f.X.a = -VIEW; f.X.b = VIEW; shadeMagnets(c, f, x => [x, yS]);
  Lab.plot(c, f, fn, [-VIEW, VIEW], mode === 'Bx' ? C.amber : C.accent, 2, [], 500);
  probe(c, f, testPt.x, fn(testPt.x));
}

/* ── Master draw ─────────────────────────────────────────────────────────── */
let gCanvas = [];
function draw() {
  if (OP.view3D) drawScene3D(); else drawScene();
  drawGraph(gCanvas[0], 'Babs');
  drawGraph(gCanvas[1], 'Bx');
  drawGraph(gCanvas[2], 'Br');
}

/* ── Resize ──────────────────────────────────────────────────────────────── */
function resizeCanvases() {
  const area = sc.parentElement;
  const ga   = document.getElementById('graphArea');
  if (!gCanvas.length) gCanvas = Lab.graphPanels(ga, 3, 180);
  const rd   = area.querySelector('.readout-bar');
  SW = area.clientWidth;
  const gaH = ga.offsetHeight || 180;
  const rdH = rd ? (rd.offsetHeight || 56) : 56;
  SH = Math.max(120, area.clientHeight - gaH - rdH);
  Lab.hidpi(sc, SW, SH);
  const cx = -panX / (baseScale || 1), cy = panY / (baseScale || 1);
  baseScale = Math.min(SW, SH) / (2 * VIEW);
  scale = baseScale * zoom;
  panX = -cx * baseScale; panY = cy * baseScale;
  Lab.fitPanels(gCanvas);
  invalidateMap();
  if (SW > 0) draw();
}
new ResizeObserver(resizeCanvases).observe(sc.parentElement);

/* ── Scroll: zoom or magnet rotate ──────────────────────────────────────── */
sc.addEventListener('wheel', e => {
  e.preventDefault();
  const r = sc.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  if (!OP.view3D) {
    const hit = nearestObj(mx, my);
    if (hit && hit.type === 'magnet') {
      magnets[hit.idx].angle += e.deltaY > 0 ? 0.08 : -0.08;
      updatePoles(); invalidateAll(); draw();
      return;
    }
  }
  const [px, py] = scrToPhy(mx, my);
  const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
  zoom = Math.max(0.2, Math.min(20, zoom * factor));
  scale = baseScale * zoom;
  panX = mx - SW / 2 - px * scale;
  panY = my - SH / 2 + py * scale;
  invalidateMap(); draw();
}, { passive: false });

sc.addEventListener('dblclick', e => {
  const r = sc.getBoundingClientRect();
  if (OP.view3D) {
    rot3X = 0.42; rot3Y = 0.38; draw();
  } else if (!nearestObj(e.clientX - r.left, e.clientY - r.top)) {
    zoom = 1; panX = 0; panY = 0; scale = baseScale;
    invalidateMap(); draw();
  }
});

/* ── Controls ────────────────────────────────────────────────────────────── */
function setConfig(idx) {
  OP.configIdx = idx;
  magnets = CONFIGS[idx].ms.map(m => ({ ...m }));
  updatePoles(); invalidateAll(); draw();
}

function buildControls() {
  const panel = document.getElementById('controls');
  panel.innerHTML = '';

  const secVista = Lab.Section('Vista');
  secVista.add(Lab.Toggle({
    label: 'Modalità 3D', value: OP.view3D,
    onChange: v => {
      OP.view3D = v;
      linesCache3D = null;
      sc.style.cursor = v ? 'grab' : 'grab';
      draw();
    },
  }));
  panel.appendChild(secVista.el);

  const secCfg = Lab.Section('Configurazione');
  secCfg.add(Lab.RadioGroup({
    label: 'Preset',
    options: CONFIGS.map(c => ({ value: c.name, label: c.name })),
    value: CONFIGS[OP.configIdx].name,
    onChange: v => { const i = CONFIGS.findIndex(c => c.name === v); if (i >= 0) setConfig(i); },
  }));
  panel.appendChild(secCfg.el);

  const secVis = Lab.Section('Visualizzazione');
  secVis.add(Lab.RadioGroup({
    label: 'Sfondo',
    options: [
      { value: 'B',        label: 'Mappa |B|' },
      { value: 'limature', label: 'Limatura'  },
      { value: 'off',      label: 'Griglia'   },
    ],
    value: OP.mapMode,
    onChange: v => { OP.mapMode = v; invalidateMap(); draw(); },
  }));
  secVis.add(Lab.Toggle({
    label: 'Linee di campo', value: OP.showLines,
    onChange: v => { OP.showLines = v; draw(); },
  }));
  secVis.add(Lab.Slider({
    label: 'N. linee', min: 4, max: 20, step: 2, value: OP.nLines, unit: '',
    onChange: v => { OP.nLines = v; linesCache = null; linesCache3D = null; draw(); },
  }));
  secVis.add(Lab.Toggle({
    label: 'Vettori B', value: OP.showVectors,
    onChange: v => { OP.showVectors = v; draw(); },
  }));
  panel.appendChild(secVis.el);

  const info = document.createElement('div');
  info.style.cssText = 'margin-top:14px;font-size:11px;color:var(--text-secondary);line-height:1.7;padding:10px 12px;background:var(--bg3);border-radius:8px';
  info.innerHTML =
    '<b>2D:</b> Trascina un <b>magnete</b> per spostarlo.<br>' +
    'Scroll su magnete: ruotalo. Scroll canvas: zoom.<br>' +
    'Trascina la <span style="color:rgb(0,255,185)">sonda</span> per misurare <b>B</b>.<br>' +
    'Trascina l\'area: sposta. Doppio click: reimposta.<br>' +
    '<b>3D:</b> Trascina per ruotare. Doppio click: reimposta.';
  panel.appendChild(info);
  const phys = document.createElement('div');
  phys.className = 'lab-note';
  phys.style.marginTop = '10px';
  phys.innerHTML = 'Le linee di B escono dal polo N, rientrano nel polo S e <b>dentro la barra</b> tornano da S a N: sono sempre chiuse, perché non esistono poli magnetici isolati. Il grafico di |B| lungo il raggio mostra il campo intenso dentro la barra (zona grigia).';
  panel.appendChild(phys);
}

/* ── nearestObj ──────────────────────────────────────────────────────────── */
function nearestObj(sx, sy) {
  const [tx, ty] = phyToScr(testPt.x, testPt.y);
  if (Math.hypot(sx - tx, sy - ty) < 14) return { type: 'test' };
  for (let i = 0; i < magnets.length; i++) {
    const [mx, my] = phyToScr(magnets[i].x, magnets[i].y);
    if (Math.hypot(sx - mx, sy - my) < HL * scale * 1.4) return { type: 'magnet', idx: i };
  }
  return null;
}

/* ── Mouse ───────────────────────────────────────────────────────────────── */
sc.style.cursor = 'grab';

sc.addEventListener('mousedown', e => {
  const r = sc.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;

  if (OP.view3D) {
    rot3Dragging = true;
    rot3StartX = e.clientX; rot3StartY = e.clientY;
    rot3OrigX = rot3X; rot3OrigY = rot3Y;
    sc.style.cursor = 'grabbing';
    e.preventDefault(); return;
  }

  const hit = nearestObj(mx, my);
  if (hit) {
    hit.type === 'test' ? (testDragging = true) : (magnetDragging = hit.idx);
    sc.style.cursor = 'crosshair';
  } else {
    panDragging = true;
    panStartX = e.clientX; panStartY = e.clientY;
    panOriginX = panX; panOriginY = panY;
    sc.style.cursor = 'grabbing';
  }
  e.preventDefault();
});

window.addEventListener('mousemove', e => {
  if (rot3Dragging) {
    const sens = 0.007;
    rot3Y = rot3OrigY + (e.clientX - rot3StartX) * sens;
    rot3X = Math.max(-PI/2, Math.min(PI/2, rot3OrigX - (e.clientY - rot3StartY) * sens));
    draw(); return;
  }
  if (panDragging) {
    panX = panOriginX + (e.clientX - panStartX);
    panY = panOriginY + (e.clientY - panStartY);
    invalidateMap(); draw(); return;
  }
  if (!testDragging && magnetDragging < 0) {
    if (e.target === sc && !OP.view3D) {
      const r = sc.getBoundingClientRect();
      sc.style.cursor = nearestObj(e.clientX - r.left, e.clientY - r.top) ? 'crosshair' : 'grab';
    }
    return;
  }
  const r = sc.getBoundingClientRect();
  const [xp, yp] = scrToPhy(e.clientX - r.left, e.clientY - r.top);
  if (testDragging) {
    testPt.x = xp; testPt.y = yp; draw();
  } else {
    magnets[magnetDragging].x = xp;
    magnets[magnetDragging].y = yp;
    updatePoles(); invalidateAll(); draw();
  }
});

window.addEventListener('mouseup', () => {
  if (rot3Dragging) { rot3Dragging = false; sc.style.cursor = 'grab'; }
  if (panDragging)  { panDragging  = false; sc.style.cursor = 'grab'; }
  testDragging = false; magnetDragging = -1;
});

/* ── Init ────────────────────────────────────────────────────────────────── */
document.getElementById('themeToggle').addEventListener('click', () => {
  setTimeout(() => { invalidateAll(); draw(); }, 20);
});

updatePoles();
calibrateB();
buildControls();
resizeCanvases();

// i caratteri web arrivano dopo il primo disegno: senza ridisegnare, i grafici restano con il font di ripiego
if (document.fonts) document.fonts.ready.then(() => draw());
