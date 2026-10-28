'use strict';

/* ── Media presets (Cauchy: n(λ) = A + B/λ², λ in μm) ────── */
const MEDIA = [
  { name: 'Aria',              n: 1.000, A: 1.0000, B: 0.000000 },
  { name: 'Acqua',             n: 1.333, A: 1.3199, B: 0.004970 },
  { name: 'Vetro crown (BK7)', n: 1.520, A: 1.5046, B: 0.004250 },
  { name: 'Vetro flint (F2)',  n: 1.625, A: 1.5974, B: 0.009590 },
  { name: 'Diamante',          n: 2.417, A: 2.3761, B: 0.014260 },
  { name: 'Personalizzato',    n: 1.500, A: 1.5000, B: 0.000000 },
];
const CUSTOM = MEDIA.length - 1;

const WAVELENGTHS = [
  { lam: 390, color: '#9400d3' },
  { lam: 430, color: '#6600ee' },
  { lam: 460, color: '#1a66ff' },
  { lam: 490, color: '#0099ff' },
  { lam: 530, color: '#00cc00' },
  { lam: 560, color: '#aacc00' },
  { lam: 590, color: '#ffcc00' },
  { lam: 620, color: '#ff6600' },
  { lam: 680, color: '#ff0000' },
];

/* ── State ───────────────────────────────────────────────── */
const params = {
  prismType:  'triangle',
  apexAngle:  60,          // degrees, triangle only
  theta1:     30,          // incident angle at entry face (degrees)
  presetPrism:  2,         // BK7
  presetMedium: 0,         // Aria
  nPrismC:  1.520,
  nMediumC: 1.000,
  dispersion: false,
};

/* ── Canvas ──────────────────────────────────────────────── */
const canvas      = document.getElementById('simCanvas');
const ctx         = canvas.getContext('2d');
const graphCanvas = document.getElementById('graphCanvas');
const gctx        = graphCanvas.getContext('2d');
const graphArea   = document.getElementById('graphArea');
const readoutEl   = document.getElementById('readout');
let cw = 0, ch = 0, gw = 0, gh = 0;

function resizeCanvases() {
  const dpr      = window.devicePixelRatio || 1;
  const parent   = canvas.parentElement;
  const graphH   = graphArea.offsetHeight;
  const handleH  = document.getElementById('resizeHandle').offsetHeight;
  const readoutH = readoutEl.offsetHeight;
  cw = parent.clientWidth;
  ch = Math.max(100, parent.clientHeight - graphH - readoutH - handleH);
  canvas.width  = cw * dpr; canvas.height = ch * dpr;
  canvas.style.width  = cw + 'px'; canvas.style.height = ch + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  gw = graphArea.clientWidth; gh = graphArea.clientHeight;
  graphCanvas.width  = gw * dpr; graphCanvas.height = gh * dpr;
  graphCanvas.style.width  = gw + 'px'; graphCanvas.style.height = gh + 'px';
  gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/* ── Color helpers ───────────────────────────────────────── */
function hexToRgba(hex, a) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

/* ── Physics: Cauchy & n ─────────────────────────────────── */
function cauchyN(m, lam_nm) {
  if (m.B === 0) return m.A;
  const u = lam_nm / 1000;
  return m.A + m.B / (u * u);
}

function getN(presetIdx, customN, lam_nm) {
  if (presetIdx === CUSTOM) return customN;
  const m = MEDIA[presetIdx];
  if (lam_nm == null) return m.n;
  return cauchyN(m, lam_nm);
}

/* ── 2D Vector math ──────────────────────────────────────── */
const V = {
  dot:   (a,b) => a.x*b.x + a.y*b.y,
  len:   (v)   => Math.sqrt(v.x*v.x + v.y*v.y),
  norm:  (v)   => { const l = Math.sqrt(v.x*v.x+v.y*v.y); return { x:v.x/l, y:v.y/l }; },
  scale: (v,s) => ({ x:v.x*s, y:v.y*s }),
  add:   (a,b) => ({ x:a.x+b.x, y:a.y+b.y }),
  sub:   (a,b) => ({ x:a.x-b.x, y:a.y-b.y }),
};

/* ── Polygon geometry ────────────────────────────────────── */
/* All polygons: vertices in CLOCKWISE order in canvas (y-down).
   Outward normal of edge v1→v2: normalize(edge.y, -edge.x).          */

function prismSize() { return Math.min(cw, ch) * 0.30; }
function prismCX()   { return cw * 0.45; }
function prismCY()   { return ch * 0.50; }

function getPrismVertices() {
  const S = prismSize();
  const type = params.prismType;
  if (type === 'triangle') {
    const h  = S * 0.90;
    const hw = h * Math.tan(params.apexAngle * Math.PI / 360);  // half-base = h*tan(A/2)
    return [
      { x:  0,    y: -h/2 },   // apex
      { x:  hw,   y:  h/2 },   // base-right
      { x: -hw,   y:  h/2 },   // base-left
    ];
  }
  if (type === 'square') {
    const s = S * 0.55;
    return [{ x:-s,y:-s },{ x:s,y:-s },{ x:s,y:s },{ x:-s,y:s }];
  }
  return regularPoly(type === 'pentagon' ? 5 : 6, S * 0.58);
}

function regularPoly(n, r) {
  const verts = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI/2 + 2*Math.PI*i/n;
    verts.push({ x: r*Math.cos(a), y: r*Math.sin(a) });
  }
  return verts;
}

/* Outward normal for edge v1→v2 in a CW polygon */
function edgeNormal(v1, v2) {
  const e = V.sub(v2, v1);
  return V.norm({ x: e.y, y: -e.x });
}

/* Find the entry face: face whose outward normal has the most negative x (points left) */
function entryFace(poly) {
  let minNx = Infinity, idx = 0;
  poly.forEach((v1, i) => {
    const v2 = poly[(i+1) % poly.length];
    const n  = edgeNormal(v1, v2);
    if (n.x < minNx) { minNx = n.x; idx = i; }
  });
  const v1 = poly[idx], v2 = poly[(idx+1) % poly.length];
  const outN = edgeNormal(v1, v2);
  const inN  = V.scale(outN, -1);
  const mid  = { x: (v1.x+v2.x)/2, y: (v1.y+v2.y)/2 };
  return { v1, v2, outN, inN, mid, idx };
}

/* Ray direction for incident angle θ₁ at given inward normal (CW rotation) */
function beamDir(inN, theta1_deg) {
  const t = theta1_deg * Math.PI / 180;
  return V.norm({
    x:  inN.x * Math.cos(t) + inN.y * Math.sin(t),
    y: -inN.x * Math.sin(t) + inN.y * Math.cos(t),
  });
}

/* Ray start: left canvas edge, aimed at face midpoint (in canvas coords) */
function beamStart(faceMidCanvas, dir) {
  const t = faceMidCanvas.x / dir.x;
  return { x: 0, y: faceMidCanvas.y - t * dir.y };
}

/* ── Unified shape descriptor ────────────────────────────── */
/* Returns a shape object in canvas coordinates with entry face info.
   shape.type = 'poly' | 'circle'
   shape.entryMid  = canvas-coord point where beam aims
   shape.entryInN  = inward normal at entry (unit vector)              */
function getShapeCanvas() {
  const cx = prismCX(), cy = prismCY();
  if (params.prismType === 'circle') {
    const r = prismSize() * 0.55;
    return {
      type: 'circle',
      center: { x: cx, y: cy },
      radius: r,
      entryMid: { x: cx - r, y: cy },
      entryInN: { x: 1, y: 0 },
    };
  }
  const localPoly = getPrismVertices();
  const verts = localPoly.map(v => ({ x: v.x + cx, y: v.y + cy }));
  const ef = entryFace(localPoly);
  return {
    type: 'poly',
    verts,
    entryMid: { x: ef.mid.x + cx, y: ef.mid.y + cy },
    entryInN: ef.inN,
  };
}

/* ── Ray-polygon intersection ────────────────────────────── */
function rayPolyHit(pos, dir, verts) {
  let minT = Infinity, result = null;
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const v1 = verts[i], v2 = verts[(i+1)%n];
    const e    = V.sub(v2, v1);
    const denom = dir.x*e.y - dir.y*e.x;
    if (Math.abs(denom) < 1e-10) continue;
    const diff = V.sub(v1, pos);
    const t = (diff.x*e.y - diff.y*e.x) / denom;
    const s = (diff.x*dir.y - diff.y*dir.x) / denom;
    if (t > 1e-5 && s >= -1e-5 && s <= 1+1e-5 && t < minT) {
      minT = t;
      result = { point: V.add(pos, V.scale(dir, t)), outN: edgeNormal(v1, v2), t: minT, edgeIdx: i };
    }
  }
  return result;
}

/* ── Ray-circle intersection ─────────────────────────────── */
function rayCircleHit(pos, dir, center, radius) {
  const oc  = V.sub(pos, center);
  const bh  = V.dot(dir, oc);              // b/2 in quadratic
  const c   = V.dot(oc, oc) - radius * radius;
  const disc = bh * bh - c;
  if (disc < 0) return null;
  const sqrtD = Math.sqrt(disc);
  const t1 = -bh - sqrtD, t2 = -bh + sqrtD;
  let t;
  if      (t1 > 1e-5) t = t1;
  else if (t2 > 1e-5) t = t2;
  else return null;
  const point = V.add(pos, V.scale(dir, t));
  const outN  = V.norm(V.sub(point, center));   // radially outward
  return { point, outN, t };
}

/* Dispatch hit test to polygon or circle */
function hitShape(pos, dir, shape) {
  if (shape.type === 'poly') return rayPolyHit(pos, dir, shape.verts);
  return rayCircleHit(pos, dir, shape.center, shape.radius);
}

/* ── Snell's law refraction ──────────────────────────────── */
/* Returns { dir, tir }.  normal = outward surface normal. */
function snell(incDir, outNormal, n1, n2) {
  let n = outNormal;
  if (V.dot(incDir, n) > 0) n = V.scale(n, -1);  // ensure n opposes incident ray
  const cosI  = -V.dot(incDir, n);
  const sin2T = (n1/n2)*(n1/n2) * (1 - cosI*cosI);
  if (sin2T >= 1) {
    // TIR: reflect
    return { dir: V.norm(V.add(incDir, V.scale(n, 2*cosI))), tir: true };
  }
  const cosT = Math.sqrt(1 - sin2T);
  const r    = n1/n2;
  return { dir: V.norm(V.add(V.scale(incDir, r), V.scale(n, r*cosI - cosT))), tir: false };
}

/* ── Clip point to canvas boundaries ────────────────────── */
function clipToCanvas(pos, dir) {
  let tMin = Infinity;
  const tests = [
    dir.x > 0 ? (cw - pos.x) / dir.x : Infinity,
    dir.x < 0 ? (0 - pos.x) / dir.x  : Infinity,
    dir.y > 0 ? (ch - pos.y) / dir.y  : Infinity,
    dir.y < 0 ? (0 - pos.y) / dir.y   : Infinity,
  ];
  tests.forEach(t => { if (t > 0 && t < tMin) tMin = t; });
  return V.add(pos, V.scale(dir, tMin));
}

/* ── Full ray trace ──────────────────────────────────────── */
/* Returns array of segments: [{from, to, inside, tir}]       */
function traceRay(startPos, dir, shape, nPrism, nMedium) {
  const segs   = [];
  let pos      = startPos;
  let d        = V.norm(dir);
  let inside   = false;
  let n_cur    = nMedium;

  for (let bounce = 0; bounce < 10; bounce++) {
    const hit = hitShape(pos, d, shape);
    if (!hit) {
      segs.push({ from: pos, to: clipToCanvas(pos, d), inside, tir: false });
      break;
    }
    segs.push({ from: pos, to: hit.point, inside, tir: false });

    const n1   = inside ? nPrism : nMedium;
    const n2   = inside ? nMedium : nPrism;
    const res  = snell(d, hit.outN, n1, n2);
    pos = hit.point;
    d   = res.dir;

    if (!res.tir) {
      inside = !inside;
      n_cur  = inside ? nPrism : nMedium;
    }

    if (!inside && bounce >= 1) {
      segs.push({ from: pos, to: clipToCanvas(pos, d), inside: false, tir: false, n: hit.outN });
      break;
    }
  }
  return segs;
}

/* ── Compute deviation angle for a traced result ─────────── */
function deviation(startDir, segs) {
  if (segs.length < 2) return null;
  const lastSeg = segs[segs.length - 1];
  if (lastSeg.inside) return null;
  const exitDir = V.norm(V.sub(lastSeg.to, lastSeg.from));
  const c = Math.max(-1, Math.min(1, V.dot(startDir, exitDir)));
  return Math.acos(c) * 180 / Math.PI;
}

/* ── Drawing ─────────────────────────────────────────────── */
function drawScene() {
  const dark = document.documentElement.dataset.theme !== 'light';
  ctx.clearRect(0, 0, cw, ch);

  const shape = getShapeCanvas();

  drawGrid(dark);
  drawPrism(shape, dark);

  const dir   = beamDir(shape.entryInN, params.theta1);
  const start = beamStart(shape.entryMid, dir);

  if (params.dispersion) {
    WAVELENGTHS.forEach(w => {
      const nP = getN(params.presetPrism,  params.nPrismC,  w.lam);
      const nM = getN(params.presetMedium, params.nMediumC, w.lam);
      const segs = traceRay(start, dir, shape, nP, nM);
      drawRaySegs(segs, w.color, 0.70);
    });
  } else {
    const nP  = getN(params.presetPrism,  params.nPrismC,  null);
    const nM  = getN(params.presetMedium, params.nMediumC, null);
    const segs = traceRay(start, dir, shape, nP, nM);
    drawRaySegs(segs, '#00d4ff', 1.0);
    drawAngleArcs(segs, dir, shape, dark);
  }

  drawLabels(dark);
  updateReadout(shape);
}

function drawGrid(dark) {
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= cw; x += 50) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,ch); ctx.stroke(); }
  for (let y = 0; y <= ch; y += 50) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(cw,y); ctx.stroke(); }
}

function drawPrism(shape, dark) {
  const cx = prismCX(), cy = prismCY();
  const grad = ctx.createRadialGradient(cx, cy*0.8, 0, cx, cy, prismSize()*1.2);
  grad.addColorStop(0, dark ? 'rgba(130,200,255,0.18)' : 'rgba(100,160,220,0.22)');
  grad.addColorStop(1, dark ? 'rgba(60,140,220,0.07)'  : 'rgba(60,120,200,0.10)');

  ctx.beginPath();
  if (shape.type === 'circle') {
    ctx.arc(shape.center.x, shape.center.y, shape.radius, 0, Math.PI * 2);
  } else {
    shape.verts.forEach((v,i) => i===0 ? ctx.moveTo(v.x,v.y) : ctx.lineTo(v.x,v.y));
    ctx.closePath();
  }
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = dark ? 'rgba(0,212,255,0.55)' : 'rgba(0,130,200,0.60)';
  ctx.lineWidth = 1.8;
  ctx.stroke();
}

function drawRaySegs(segs, color, alpha) {
  const lw = alpha >= 1 ? 2.0 : 1.4;
  segs.forEach((seg, i) => {
    const a   = seg.inside ? alpha * 0.85 : alpha;
    ctx.strokeStyle = hexToRgba(color, a);
    ctx.lineWidth   = lw;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(seg.from.x, seg.from.y);
    ctx.lineTo(seg.to.x, seg.to.y);
    ctx.stroke();

    // Arrowhead at midpoint of each segment
    const mx = (seg.from.x + seg.to.x) * 0.5;
    const my = (seg.from.y + seg.to.y) * 0.5;
    const ang = Math.atan2(seg.to.y - seg.from.y, seg.to.x - seg.from.x);
    const hl  = 8;
    ctx.beginPath();
    ctx.moveTo(mx - Math.cos(ang-0.42)*hl, my - Math.sin(ang-0.42)*hl);
    ctx.lineTo(mx, my);
    ctx.lineTo(mx - Math.cos(ang+0.42)*hl, my - Math.sin(ang+0.42)*hl);
    ctx.stroke();
  });
}

/*
 * Angle arc at the entry point (segs[0].to) and exit point.
 */
function drawAngleArcs(segs, incDir, shape, dark) {
  if (segs.length < 2) return;
  const textCol = dark ? '#ddeeff' : '#0d1a26';
  const arcR    = Math.max(20, Math.min(38, Math.min(cw, ch) * 0.06));
  const fSize   = Math.max(10, Math.min(13, cw * 0.024));
  ctx.font = `bold ${fSize}px 'Space Mono', monospace`;
  ctx.textAlign = 'center'; ctx.lineWidth = 1.5;

  function arcAt(cx, cy, r, incD, refD, col1, col2, label1, label2) {
    const ang_inc = Math.atan2(incD.y, incD.x);
    const hit = hitShape(V.add({x:cx,y:cy}, V.scale(incD,-0.01)), incD, shape);
    if (!hit) return;
    const outN  = hit.outN;
    const ang_n = Math.atan2(outN.y, outN.x);
    const ang_in = ang_n + Math.PI;

    const theta1_rad = Math.acos(Math.max(-1, Math.min(1, V.dot(incD, {x:Math.cos(ang_in),y:Math.sin(ang_in)}))));
    ctx.strokeStyle = col1;
    ctx.beginPath();
    const a0 = ang_in, a1 = ang_inc;
    const diff = ((a1 - a0) + Math.PI*3) % (Math.PI*2) - Math.PI;
    ctx.arc(cx, cy, r, a0, a0 + diff, diff < 0);
    ctx.stroke();
    const aMid = a0 + diff/2;
    ctx.fillStyle = textCol;
    ctx.fillText(label1, cx + Math.cos(aMid)*(r+16), cy + Math.sin(aMid)*(r+16));

    if (!refD) return;
    const ang_inT = ang_n;
    const ang_ref = Math.atan2(refD.y, refD.x);
    const diff2 = ((ang_ref - ang_inT) + Math.PI*3) % (Math.PI*2) - Math.PI;
    ctx.strokeStyle = col2;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.85, ang_inT, ang_inT + diff2, diff2 < 0);
    ctx.stroke();
    const aMid2 = ang_inT + diff2/2;
    ctx.fillStyle = textCol;
    ctx.fillText(label2, cx + Math.cos(aMid2)*(r+16), cy + Math.sin(aMid2)*(r+16));
  }

  // Entry arc
  if (segs.length >= 2) {
    const ep   = segs[0].to;
    const refD = segs[1].from.x !== segs[1].to.x || segs[1].from.y !== segs[1].to.y
      ? V.norm(V.sub(segs[1].to, segs[1].from)) : null;
    arcAt(ep.x, ep.y, arcR, incDir, refD,
      dark ? 'rgba(255,200,60,0.8)' : 'rgba(200,130,0,0.85)',
      dark ? 'rgba(46,204,113,0.8)' : 'rgba(30,150,80,0.85)',
      'θ₁', 'θ₂');
  }

  // Exit arc (last transition from inside to outside)
  const exitIdx = segs.findIndex((s,i) => i > 0 && s.inside === false && segs[i-1].inside === true);
  if (exitIdx > 0) {
    const ep     = segs[exitIdx].from;
    const incD2  = V.norm(V.sub(segs[exitIdx-1].to, segs[exitIdx-1].from));
    const exitD  = V.norm(V.sub(segs[exitIdx].to, segs[exitIdx].from));
    arcAt(ep.x, ep.y, arcR, incD2, exitD,
      dark ? 'rgba(255,180,0,0.8)' : 'rgba(200,120,0,0.85)',
      dark ? 'rgba(255,71,87,0.75)' : 'rgba(200,40,60,0.80)',
      'θ₃', 'θ₄');
  }
}

function drawLabels(dark) {
  const col   = dark ? 'rgba(180,215,255,0.60)' : 'rgba(20,50,90,0.55)';
  const fSize = Math.max(11, Math.min(13, cw * 0.022));
  ctx.fillStyle = col;
  ctx.font = `600 ${fSize}px 'DM Sans', sans-serif`;
  ctx.textAlign = 'left';
  const nP  = getN(params.presetPrism,  params.nPrismC,  null);
  const nM  = getN(params.presetMedium, params.nMediumC, null);
  ctx.fillText(`Prisma: ${MEDIA[params.presetPrism].name}  n = ${Lab.fmt(nP, 3)}`, 10, fSize + 4);
  ctx.fillText(`Mezzo:  ${MEDIA[params.presetMedium].name}  n = ${Lab.fmt(nM, 3)}`, 10, fSize * 2 + 8);
}

/* ── Readout ─────────────────────────────────────────────── */
function updateReadout(shape) {
  const dir   = beamDir(shape.entryInN, params.theta1);
  const start = beamStart(shape.entryMid, dir);
  const nP    = getN(params.presetPrism,  params.nPrismC,  null);
  const nM    = getN(params.presetMedium, params.nMediumC, null);
  const segs  = traceRay(start, dir, shape, nP, nM);

  const dev     = deviation(dir, segs);
  const tirHit  = segs.some((s,i) => i > 0 && segs[i-1].inside && s.inside);

  const res = rayResult(shape, params.theta1, nP, nM);
  const items = [
    { label: 'incidenza θ₁', value: `${Lab.fmt(params.theta1, 1)}°` },
    { label: 'uscita θ₄',    value: res && res.th4 != null ? `${Lab.fmt(res.th4, 1)}°` : '—' },
    { label: 'deviazione D', value: res ? `${Lab.fmt(res.D, 2)}°` : (dev != null ? `${Lab.fmt(dev, 2)}°` : '—') },
  ];

  if (params.prismType === 'triangle') {
    const A = params.apexAngle;
    const nRel = nP / nM;
    const sinArg = nRel * Math.sin(A * Math.PI / 360);
    if (sinArg <= 1) {
      const Dmin_deg = 2 * Math.asin(sinArg) * 180/Math.PI - A;
      items.push({ label: 'deviazione minima', value: `${Lab.fmt(Dmin_deg, 2)}°` });
    }
  }
  if (tirHit) items.push({ label: 'riflessione totale', value: 'sì, dentro il prisma' });

  readoutEl.innerHTML = items.map(it =>
    `<span class="readout-item"><span class="readout-label">${Lab.keepCaseHTML(it.label)}</span><span class="readout-value">${it.value}</span></span>`
  ).join('');
}

/* ── Graphs ──────────────────────────────────────────────── */
// esito del raggio per un dato θ₁: deviazione D e angolo d'uscita θ₄ (dalla normale alla faccia d'uscita);
// null se il raggio subisce riflessione totale dentro il prisma
function rayResult(shape, theta1, nP, nM) {
  const dir  = beamDir(shape.entryInN, theta1);
  const segs = traceRay(beamStart(shape.entryMid, dir), dir, shape, nP, nM);
  if (segs.length < 3 || segs[segs.length - 1].inside) return null;
  if (segs.some((s, i) => i > 0 && segs[i - 1].inside && s.inside)) return null;
  const last = segs[segs.length - 1], exitD = V.norm(V.sub(last.to, last.from));
  const D = deviation(dir, segs);
  const th4 = last.n ? Math.acos(Math.min(1, Math.abs(V.dot(exitD, last.n)))) * 180 / Math.PI : null;
  return { D, th4 };
}
function sweep(shape, nP, nM) {
  const pts = [];
  for (let deg = 0; deg <= 89; deg += 0.5) { const r = rayResult(shape, deg, nP, nM); pts.push([deg, r ? r.D : NaN, r ? r.th4 : NaN]); }
  return pts;
}
// curva per punti che si interrompe dove il valore non esiste (riflessione totale)
function plotGaps(f, pts, k, col, w, dash) {
  gctx.save(); gctx.strokeStyle = col; gctx.lineWidth = w; gctx.setLineDash(dash || []);
  gctx.beginPath(); let pen = false;
  for (const p of pts) { if (!Number.isFinite(p[k])) { pen = false; continue; } pen ? gctx.lineTo(f.X(p[0]), f.Y(p[k])) : gctx.moveTo(f.X(p[0]), f.Y(p[k])); pen = true; }
  gctx.stroke(); gctx.restore();
}
// fasce dove il raggio non esce (riflessione totale interna)
function shadeTIR(f, pts, k) {
  gctx.fillStyle = f.C.light ? 'rgba(220,60,60,0.08)' : 'rgba(255,80,80,0.08)';
  for (let i = 0; i < pts.length; i++) if (!Number.isFinite(pts[i][k])) gctx.fillRect(f.X(pts[i][0]), f.T, f.X(Math.min(90, pts[i][0] + 0.5)) - f.X(pts[i][0]), f.B - f.T);
}

function drawGraphs() {
  if (!gw || !gh) return;
  gctx.clearRect(0, 0, gw, gh);
  const shape = getShapeCanvas(), pw = gw / 3;
  const nP = getN(params.presetPrism, params.nPrismC, null), nM = getN(params.presetMedium, params.nMediumC, null);
  const pts = sweep(shape, nP, nM), cur = rayResult(shape, params.theta1, nP, nM);
  const box = i => ({ x: i * pw + 3, y: 3, w: (i < 2 ? pw : gw - 2 * pw) - 6, h: gh - 6, xr: [0, 90], xStep: 15, xLabel: 'θ₁ (°)' });

  // 1: deviazione D(θ₁), con il minimo; con la dispersione anche rosso e violetto
  const ext = params.dispersion ? [[680, '#ff3030'], [400, '#9b5cff']].map(([lam, col]) =>
    [sweep(shape, getN(params.presetPrism, params.nPrismC, lam), getN(params.presetMedium, params.nMediumC, lam)), col]) : [];
  let dMax = 10; for (const P_ of [pts, ...ext.map(e => e[0])]) for (const p of P_) if (p[1] > dMax) dMax = p[1];
  let f = Lab.axes(gctx, { ...box(0), title: 'Deviazione D (°) in funzione di θ₁', yr: [0, Lab.niceMax(dMax * 1.08)] });
  shadeTIR(f, pts, 1);
  for (const [P_, col] of ext) plotGaps(f, P_, 1, col, 1.4);
  plotGaps(f, pts, 1, '#00d4ff', 2);
  let iMin = -1; pts.forEach((p, i) => { if (Number.isFinite(p[1]) && (iMin < 0 || p[1] < pts[iMin][1])) iMin = i; });
  if (iMin > 0 && iMin < pts.length - 1 && Number.isFinite(pts[iMin - 1][1]) && Number.isFinite(pts[iMin + 1][1])) {
    gctx.save(); gctx.setLineDash([3, 3]); gctx.strokeStyle = f.C.amber; gctx.beginPath(); gctx.moveTo(f.L, f.Y(pts[iMin][1])); gctx.lineTo(f.R, f.Y(pts[iMin][1])); gctx.stroke(); gctx.restore();
    Lab.dot(gctx, f, pts[iMin][0], pts[iMin][1], f.C.amber, 3.5);
  }
  if (cur) Lab.dot(gctx, f, params.theta1, cur.D, '#00d4ff', 4.5);
  Lab.legend(gctx, f.L + 8, f.T + 8, params.dispersion ? [['#ff3030', 'rosso'], ['#9b5cff', 'violetto'], [f.C.amber, 'D minima', [3, 3]]] : [[f.C.amber, 'deviazione minima', [3, 3]]]);

  // 2: angolo d'uscita θ₄ dalla normale alla faccia d'uscita; in rosso le zone di riflessione totale
  f = Lab.axes(gctx, { ...box(1), title: 'Angolo d’uscita θ₄ (°) dalla normale', yr: [0, 90], yStep: 15 });
  shadeTIR(f, pts, 2);
  plotGaps(f, pts, 2, '#2ecc71', 2);
  if (cur && cur.th4 != null) Lab.dot(gctx, f, params.theta1, cur.th4, '#2ecc71', 4.5);
  if (pts.some(p => !Number.isFinite(p[2]))) { gctx.fillStyle = f.C.light ? 'rgba(200,40,40,0.8)' : 'rgba(255,110,110,0.85)'; gctx.font = '9.5px "DM Sans",sans-serif';
    gctx.textAlign = 'left'; gctx.textBaseline = 'middle'; gctx.fillText('zona rossa: riflessione totale, il raggio non esce', f.L + 6, f.T + 8); }

  // 3: indice di rifrazione n(λ) (legge di Cauchy): la dispersione separa i colori
  const nOf = (pi, nc, lam) => pi === CUSTOM ? nc : cauchyN(MEDIA[pi], lam);
  let lo = Infinity, hi = -Infinity;
  // si disegna solo il prisma (e il mezzo se è dispersivo): con l'aria sulla stessa scala la curva sembrerebbe piatta
  const medDisp = params.presetMedium !== CUSTOM && MEDIA[params.presetMedium].B > 0;
  for (let lam = 380; lam <= 700; lam += 10) for (const v of [nOf(params.presetPrism, params.nPrismC, lam), ...(medDisp ? [nOf(params.presetMedium, params.nMediumC, lam)] : [])]) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const sp = Math.max(hi - lo, 0.02), ys = Lab.niceStep(sp * 1.4);
  f = Lab.axes(gctx, { ...box(2), xr: [380, 700], xStep: 50, xLabel: 'λ (nm)', title: 'Indice di rifrazione n(λ)',
    yr: [Math.floor((lo - sp * 0.2) / ys) * ys, Math.ceil((hi + sp * 0.2) / ys) * ys], yStep: ys, padL: 52 });
  for (let x = f.L; x < f.R; x += 2) { const lam = 380 + (x - f.L) / (f.R - f.L) * 320; gctx.fillStyle = lamColor(lam); gctx.fillRect(x, f.B - 4, 2, 4); }
  Lab.plot(gctx, f, lam => nOf(params.presetPrism, params.nPrismC, lam), [380, 700], '#00d4ff', 2);
  if (medDisp) Lab.plot(gctx, f, lam => nOf(params.presetMedium, params.nMediumC, lam), [380, 700], '#2ecc71', 1.6, [4, 3]);
  Lab.legend(gctx, f.L + 8, f.T + 8, [['#00d4ff', MEDIA[params.presetPrism].name], ...(medDisp ? [['#2ecc71', MEDIA[params.presetMedium].name, [4, 3]]] : [])]);
}
// colore approssimato di una lunghezza d'onda visibile
function lamColor(l) {
  let r = 0, g = 0, b = 0;
  if (l < 440) { r = (440 - l) / 60; b = 1; } else if (l < 490) { g = (l - 440) / 50; b = 1; } else if (l < 510) { g = 1; b = (510 - l) / 20; }
  else if (l < 580) { r = (l - 510) / 70; g = 1; } else if (l < 645) { r = 1; g = (645 - l) / 65; } else r = 1;
  const k = l < 420 ? 0.3 + 0.7 * (l - 380) / 40 : l > 680 ? 0.3 + 0.7 * (700 - l) / 20 : 1;
  return `rgb(${Math.round(255 * r * k)},${Math.round(255 * g * k)},${Math.round(255 * b * k)})`;
}

/* ── Controls ────────────────────────────────────────────── */
function buildControls() {
  const el = document.getElementById('controls');
  el.innerHTML = '';

  /* ---- Forma ---- */
  const secF = Lab.Section('Forma del prisma');
  secF.add(Lab.RadioGroup({ label:'Forma', options: [
    { label:'Triangolo', value:'triangle' },
    { label:'Quadrato',  value:'square'   },
    { label:'Pentagono', value:'pentagon' },
    { label:'Esagono',   value:'hexagon'  },
    { label:'Cerchio (goccia)', value:'circle' },
  ], value: params.prismType,
    onChange(v) { params.prismType = v; apexSub[v==='triangle'?'show':'hide'](); requestRedraw(); },
  }));
  const apexCtrl = Lab.SliderInput({ label:'Angolo apice A', min:20, max:90, step:1,
    value: params.apexAngle, unit:'°',
    hint: 'angolo al vertice del triangolo',
    onChange(v) { params.apexAngle = v; requestRedraw(); },
  });
  const apexSub = Lab.SubPanel();
  apexSub.add(apexCtrl);
  if (params.prismType !== 'triangle') apexSub.hide();
  secF.add(apexSub);
  el.appendChild(secF.el);

  /* ---- Fascio ---- */
  const secR = Lab.Section('Fascio incidente');
  secR.add(Lab.SliderInput({ label:'Angolo di incidenza θ₁', min:0, max:85, step:0.5,
    value: params.theta1, unit:'°',
    hint: 'misurato dalla normale alla faccia d\'entrata',
    onChange(v) { params.theta1 = v; requestRedraw(); },
  }));
  el.appendChild(secR.el);

  /* ---- Prisma ---- */
  const secP = Lab.Section('Materiale prisma');
  const nPSub = Lab.SubPanel();
  nPSub.add(Lab.SliderInput({ label:'Indice n (prisma)', min:1.0, max:3.5, step:0.001,
    value: params.nPrismC, unit:'',
    onChange(v) { params.nPrismC = v; requestRedraw(); },
  }));
  if (params.presetPrism !== CUSTOM) nPSub.hide();
  secP.add(Lab.RadioGroup({ label:'Materiale', options: MEDIA.map((m,i)=>({ label:m.name, value:i })),
    value: params.presetPrism,
    onChange(v) { params.presetPrism=v; if(v<CUSTOM){params.nPrismC=MEDIA[v].n;nPSub.hide();}else nPSub.show(); requestRedraw(); },
  }));
  secP.add(nPSub);
  el.appendChild(secP.el);

  /* ---- Mezzo ---- */
  const secM = Lab.Section('Mezzo circostante');
  const nMSub = Lab.SubPanel();
  nMSub.add(Lab.SliderInput({ label:'Indice n (mezzo)', min:1.0, max:3.5, step:0.001,
    value: params.nMediumC, unit:'',
    onChange(v) { params.nMediumC = v; requestRedraw(); },
  }));
  if (params.presetMedium !== CUSTOM) nMSub.hide();
  secM.add(Lab.RadioGroup({ label:'Mezzo', options: MEDIA.map((m,i)=>({ label:m.name, value:i })),
    value: params.presetMedium,
    onChange(v) { params.presetMedium=v; if(v<CUSTOM){params.nMediumC=MEDIA[v].n;nMSub.hide();}else nMSub.show(); requestRedraw(); },
  }));
  secM.add(nMSub);
  el.appendChild(secM.el);

  /* ---- Visualizzazione ---- */
  const secV = Lab.Section('Visualizzazione');
  secV.add(Lab.Toggle({ label:'Dispersione cromatica', value: params.dispersion,
    onChange(v) { params.dispersion = v; requestRedraw(); },
  }));
  const hint = document.createElement('div');
  hint.className = 'ctrl-hint'; hint.style.padding = '2px 12px 8px';
  hint.textContent = 'Legge di Cauchy n(λ): mostra la separazione dello spettro visibile';
  secV.el.appendChild(hint);
  el.appendChild(secV.el);
}

/* ── Redraw ──────────────────────────────────────────────── */
let _pending = false;
function requestRedraw() {
  if (!_pending) {
    _pending = true;
    requestAnimationFrame(() => { _pending = false; drawScene(); drawGraphs(); });
  }
}

/* ── Resize handle ───────────────────────────────────────── */
function initResizeHandle() {
  const handle = document.getElementById('resizeHandle');
  let drag = false, startY = 0, startH = 0;
  handle.addEventListener('mousedown', e => {
    drag = true; startY = e.clientY; startH = graphArea.offsetHeight;
    document.body.style.userSelect = 'none';
  });
  document.addEventListener('mousemove', e => {
    if (!drag) return;
    graphArea.style.height = Math.max(80, Math.min(500, startH+(startY-e.clientY))) + 'px';
    resizeCanvases(); requestRedraw();
  });
  document.addEventListener('mouseup', () => { if (drag) { drag = false; document.body.style.userSelect=''; } });
}

/* ── Fullscreen ──────────────────────────────────────────── */
function initFullscreen() {
  document.getElementById('btnFullscreen').addEventListener('click', () => {
    !document.fullscreenElement
      ? (graphArea.requestFullscreen?.() ?? graphArea.webkitRequestFullscreen?.())
      : (document.exitFullscreen?.() ?? document.webkitExitFullscreen?.());
  });
  document.addEventListener('fullscreenchange', () => { resizeCanvases(); requestRedraw(); });
}

new MutationObserver(() => requestRedraw())
  .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

/* ── Init ────────────────────────────────────────────────── */
function init() {
  Lab.initTheme();
  buildControls();
  graphArea.style.height = (window.innerWidth < 800 ? 130 : 240) + 'px';
  resizeCanvases();
  requestRedraw();

  new ResizeObserver(() => { resizeCanvases(); requestRedraw(); }).observe(canvas.parentElement);
  initResizeHandle();
  initFullscreen();

  document.getElementById('btnReset').addEventListener('click', () => {
    params.prismType = 'triangle'; params.apexAngle = 60; params.theta1 = 30;
    params.presetPrism = 2; params.nPrismC = 1.520;
    params.presetMedium = 0; params.nMediumC = 1.000;
    params.dispersion = false;
    buildControls(); requestRedraw();
  });
}

init();
