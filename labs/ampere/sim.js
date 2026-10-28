'use strict';

const sc   = document.getElementById('simCanvas');
const ctx  = sc.getContext('2d');
let DPR  = window.devicePixelRatio || 1;
let SW = 0, SH = 0;
let gCanvas = [];

Lab.initTheme('themeToggle');
const dk = () => document.documentElement.dataset.theme !== 'light';

/* ── Fisica ──────────────────────────────────────────────────────────────── */
// Filo infinito: B = μ₀I/(2πr). Le posizioni sono in pixel della scena, con 1 cm = PX_CM pixel;
// le correnti in ampere. Il calcolo usa B/μ₀ = I/(2πr), così ∮B·dl/μ₀ esce direttamente in ampere
// ed è uguale alla corrente concatenata: è questo che il lab fa vedere.
const PX_CM = 13;
const MU0 = 4e-7 * Math.PI;

const P = {
  loop:       'circle',  // 'circle' | 'rect' | 'blob'
  R:          130,       // pixel (10 cm)
  fieldLines: false,
};

/* ── State ───────────────────────────────────────────────────────────────── */
let sources = [
  { x:  50, y: -30, I:  5 },
  { x: -195, y:  60, I: -3 },
];
let loopX = 0, loopY = 0;

let cachedCirc  = 0;
let cachedCumul = new Array(201).fill(0);
let circDirty   = true;

/* ── Layout ──────────────────────────────────────────────────────────────── */
let CX = 0, CY = 0;
let viewZoom = 1;
const toSc = (px, py) => [CX + px, CY + py];

/* ── Blob ────────────────────────────────────────────────────────────────── */
function blobR2D(t) { return 1 + 0.22 * Math.cos(2 * t) + 0.12 * Math.sin(3 * t); }

/* ── Field ───────────────────────────────────────────────────────────────── */
function computeField(x, y) {
  let bx = 0, by = 0;
  for (const w of sources) {
    const dx = x - w.x, dy = y - w.y;
    const r2 = dx * dx + dy * dy;
    if (r2 < 0.01) continue;
    // lo schermo ha y verso il basso: per I > 0 (⊙, verso chi guarda) il campo gira in senso
    // antiorario come lo si vede, cioè (dy, −dx) in coordinate dello schermo
    const c = w.I / (2 * Math.PI * r2);
    bx += c * dy;
    by -= c * dx;
  }
  return [bx, by];
}

/* ── Loop geometry ───────────────────────────────────────────────────────── */
// percorso in senso antiorario sullo schermo (y verso il basso, quindi −sin t)
function loopPoint(t) {
  const R = P.R;
  if (P.loop === 'circle') {
    return [loopX + R * Math.cos(t), loopY - R * Math.sin(t)];
  }
  if (P.loop === 'rect') {
    const s  = ((t / (2 * Math.PI) * 4 + 4) % 4);
    const si = Math.floor(s), u = s - si;
    const C  = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    return [
      loopX + (C[si][0] + u * (C[(si + 1) % 4][0] - C[si][0])) * R,
      loopY - (C[si][1] + u * (C[(si + 1) % 4][1] - C[si][1])) * R,
    ];
  }
  const r = R * blobR2D(t);
  return [loopX + r * Math.cos(t), loopY - r * Math.sin(t)];
}

function isInsideLoop(lx, ly) {
  const R = P.R;
  if (P.loop === 'circle') return lx * lx + ly * ly < R * R;
  if (P.loop === 'rect')   return Math.abs(lx) < R && Math.abs(ly) < R;
  const r = Math.sqrt(lx * lx + ly * ly + 1e-9);
  return r < R * blobR2D(Math.atan2(-ly, lx));
}

/* ── Circulation integral ────────────────────────────────────────────────── */
const NI = 200;

function recompute() {
  let sum = 0;
  const cumul = [0];
  for (let i = 0; i < NI; i++) {
    const t1 = 2 * Math.PI * i / NI, t2 = 2 * Math.PI * (i + 1) / NI;
    const [x1, y1] = loopPoint(t1), [x2, y2] = loopPoint(t2);
    const [bx, by] = computeField((x1 + x2) * 0.5, (y1 + y2) * 0.5);
    sum += bx * (x2 - x1) + by * (y2 - y1);
    cumul.push(sum);
  }
  cachedCirc  = sum;
  cachedCumul = cumul;
}

function exactCirc() {
  let I = 0;
  for (const w of sources) if (isInsideLoop(w.x - loopX, w.y - loopY)) I += w.I;
  return I;
}

/* ── Colour helpers ──────────────────────────────────────────────────────── */
function circCol(t, dark) {
  if (t > 0) return dark ? `rgba(0,212,255,${0.2 + 0.8 * t})`  : `rgba(0,100,200,${0.2 + 0.8 * t})`;
  if (t < 0) return dark ? `rgba(255,80,120,${0.2 - 0.8 * t})` : `rgba(200,40,80,${0.2 - 0.8 * t})`;
  return dark ? 'rgba(200,200,200,0.18)' : 'rgba(100,100,100,0.18)';
}

function fmt(v) {
  if (!isFinite(v)) return '∞';
  const a = Math.abs(v);
  if (a < 0.005) return '0,00 A';
  return Lab.fmt(v, 2) + ' A';
}
// campo vero (µT) in un punto, a partire da B/μ₀ in A/pixel
const toMicroT = b => b * MU0 * PX_CM * 100 * 1e6;

/* ── drawSim ─────────────────────────────────────────────────────────────── */
function drawSim() {
  const dark = dk();
  ctx.save(); ctx.scale(DPR, DPR);
  ctx.fillStyle = dark ? '#060a10' : '#e8f0f8';
  ctx.fillRect(0, 0, SW, SH);
  ctx.save();
  ctx.translate(CX, CY); ctx.scale(viewZoom, viewZoom); ctx.translate(-CX, -CY);
  drawGrid(dark);
  if (P.fieldLines) drawFieldLines(dark);
  drawLoop(dark);
  drawFieldArrows(dark);
  drawSources(dark);
  ctx.restore();
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

/* ── Amperian loop ───────────────────────────────────────────────────────── */
function drawLoop(dark) {
  const NS = 120;
  ctx.save();

  // Dynamic scale so avg segment gives ~0.5 tanh saturation
  const totalAbs = Math.max(Math.abs(cachedCirc), 0.1);
  const scale    = 0.6 * NS / totalAbs;

  for (let i = 0; i < NS; i++) {
    const t1 = 2 * Math.PI * i / NS, t2 = 2 * Math.PI * (i + 1) / NS;
    const [x1, y1] = loopPoint(t1), [x2, y2] = loopPoint(t2);
    const [bx, by] = computeField((x1 + x2) * 0.5, (y1 + y2) * 0.5);
    const contrib  = bx * (x2 - x1) + by * (y2 - y1);
    ctx.strokeStyle = circCol(Math.tanh(contrib * scale), dark);
    ctx.lineWidth = 3.5;
    const [sx1, sy1] = toSc(x1, y1), [sx2, sy2] = toSc(x2, y2);
    ctx.beginPath(); ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2); ctx.stroke();
  }

  // Dashed outline
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.16)';
  ctx.lineWidth = 1; ctx.setLineDash([6, 4]);
  const [scx, scy] = toSc(loopX, loopY);
  if (P.loop === 'circle') {
    ctx.beginPath(); ctx.arc(scx, scy, P.R, 0, 2 * Math.PI); ctx.stroke();
  } else if (P.loop === 'rect') {
    ctx.strokeRect(scx - P.R, scy - P.R, 2 * P.R, 2 * P.R);
  } else {
    ctx.beginPath();
    for (let i = 0; i <= NS; i++) {
      const [x, y] = loopPoint(2 * Math.PI * i / NS);
      const [sx, sy] = toSc(x, y);
      i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.closePath(); ctx.stroke();
  }
  ctx.setLineDash([]);

  // freccia del verso di percorrenza (antiorario) sul lato destro
  {
    const [ax1, ay1] = loopPoint(-0.13), [ax2, ay2] = loopPoint(0.13);
    const [sax1, say1] = toSc(ax1, ay1), [sax2, say2] = toSc(ax2, ay2);
    drawArrow(sax1, say1, sax2, say2, dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)');
  }

  // Labels
  const topY = scy - P.R * (P.loop === 'blob' ? 1.28 : 1) - 14;
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.70)';
  ctx.font = 'bold 12px "Space Mono",monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(`∮ B·dl / μ₀ = ${fmt(cachedCirc)}`, scx, topY - 14);
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)';
  ctx.font = '10px "Space Mono",monospace';
  ctx.fillText(`corrente concatenata = ${fmt(exactCirc())}`, scx, topY);

  // Crosshair at loop centre
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(scx - 8, scy); ctx.lineTo(scx + 8, scy);
  ctx.moveTo(scx, scy - 8); ctx.lineTo(scx, scy + 8);
  ctx.stroke();
  ctx.restore();
}

/* ── Field arrows on loop boundary ──────────────────────────────────────── */
function drawFieldArrows(dark) {
  const N = 16;
  ctx.save();
  for (let i = 0; i < N; i++) {
    const [px, py] = loopPoint(2 * Math.PI * i / N);
    const [bx, by] = computeField(px, py);
    const mag = Math.sqrt(bx * bx + by * by);
    if (mag < 1e-9) continue;
    const len = Math.min(22, 6 / mag);
    const [sx, sy] = toSc(px, py);
    drawArrow(sx, sy, sx + (bx / mag) * len, sy + (by / mag) * len,
      dark ? 'rgba(255,255,180,0.55)' : 'rgba(0,60,150,0.45)');
  }
  ctx.restore();
}

function drawArrow(x1, y1, x2, y2, col) {
  const dx = x2 - x1, dy = y2 - y1, l = Math.sqrt(dx * dx + dy * dy);
  if (l < 2) return;
  const ux = dx / l, uy = dy / l, ah = 5;
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - ux * ah + uy * ah * 0.4, y2 - uy * ah - ux * ah * 0.4);
  ctx.lineTo(x2 - ux * ah - uy * ah * 0.4, y2 - uy * ah + ux * ah * 0.4);
  ctx.closePath(); ctx.fill();
}

/* ── Field lines ─────────────────────────────────────────────────────────── */
// Linee di campo esatte. Nel piano, il campo di fili rettilinei è B = ẑ × ∇ψ (a meno di μ₀/2π) con
// ψ = Σ Iₖ·ln rₖ: le linee di B sono le curve di livello di ψ. Prendendo livelli equispaziati fra
// due linee vicine passa sempre lo stesso flusso, quindi dove le linee sono fitte il campo è intenso.
// Le curve si estraggono con il metodo dei "marching squares" e si ricalcolano solo se cambia qualcosa.
let lineCache = { key: '', segs: [] };
const PSI_STEP = 1.2;      // A: passo fra due livelli di ψ
function psiAt(x, y) {
  let s = 0;
  for (const w of sources) s += w.I * Math.log(Math.max(0.3, Math.hypot(x - w.x, y - w.y) / PX_CM));
  return s;
}
function buildFieldLines() {
  const cell = 5 / viewZoom;                           // ~5 pixel di schermo per cella
  const x0 = -CX / viewZoom - cell, y0 = -CY / viewZoom - cell;
  const nx = Math.ceil(SW / viewZoom / cell) + 3, ny = Math.ceil(SH / viewZoom / cell) + 3;
  const v = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = psiAt(x0 + i * cell, y0 + j * cell);
  const segs = [];
  const near = (x, y) => sources.some(w => Math.hypot(x - w.x, y - w.y) < 0.45 * PX_CM);
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = v[j * nx + i], b = v[j * nx + i + 1], c = v[(j + 1) * nx + i + 1], d = v[(j + 1) * nx + i];
    const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d);
    const X = x0 + i * cell, Y = y0 + j * cell;
    if (near(X + cell / 2, Y + cell / 2)) continue;   // dentro il filo il logaritmo è troncato
    for (let k = Math.ceil(lo / PSI_STEP); k * PSI_STEP <= hi; k++) {
      const L = k * PSI_STEP, pts = [];
      const edge = (p, q, x1, y1, x2, y2) => {
        if ((p < L) !== (q < L)) { const t = (L - p) / (q - p); pts.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]); }
      };
      edge(a, b, X, Y, X + cell, Y);
      edge(b, c, X + cell, Y, X + cell, Y + cell);
      edge(c, d, X + cell, Y + cell, X, Y + cell);
      edge(d, a, X, Y + cell, X, Y);
      for (let m = 0; m + 1 < pts.length; m += 2) segs.push(pts[m][0], pts[m][1], pts[m + 1][0], pts[m + 1][1]);
    }
  }
  return segs;
}
function drawFieldLines(dark) {
  const key = sources.map(w => `${w.x},${w.y},${w.I}`).join(';') + `|${SW}|${SH}|${viewZoom}`;
  if (lineCache.key !== key) lineCache = { key, segs: buildFieldLines() };
  const s = lineCache.segs;
  ctx.save();
  ctx.strokeStyle = dark ? 'rgba(0,212,255,0.45)' : 'rgba(0,80,160,0.45)';
  ctx.lineWidth = 1.1 / viewZoom;
  ctx.beginPath();
  for (let i = 0; i < s.length; i += 4) { ctx.moveTo(CX + s[i], CY + s[i + 1]); ctx.lineTo(CX + s[i + 2], CY + s[i + 3]); }
  ctx.stroke();
  ctx.restore();
}

/* ── Wires ───────────────────────────────────────────────────────────────── */
function drawSources(dark) {
  for (const w of sources) {
    const [sx, sy] = toSc(w.x, w.y);
    const inside = isInsideLoop(w.x - loopX, w.y - loopY);
    ctx.save();
    ctx.fillStyle   = w.I > 0 ? (dark ? '#ff5555' : '#cc2222') : (dark ? '#5599ff' : '#2244cc');
    ctx.strokeStyle = inside ? (dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)') : 'rgba(150,150,150,0.4)';
    ctx.lineWidth   = inside ? 2.5 : 1.5;
    if (!inside) ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(sx, sy, 11, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'white'; ctx.fillStyle = 'white'; ctx.lineWidth = 1.5;
    if (w.I > 0) { // ⊙ out of page
      ctx.beginPath(); ctx.arc(sx, sy, 3, 0, 2 * Math.PI); ctx.fill();
      ctx.beginPath(); ctx.arc(sx, sy, 8, 0, 2 * Math.PI); ctx.stroke();
    } else { // ⊗ into page
      ctx.beginPath();
      ctx.moveTo(sx - 6, sy - 6); ctx.lineTo(sx + 6, sy + 6);
      ctx.moveTo(sx + 6, sy - 6); ctx.lineTo(sx - 6, sy + 6);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(sx, sy, 8, 0, 2 * Math.PI); ctx.stroke();
    }
    ctx.restore();
  }
}

/* ── Grafici ─────────────────────────────────────────────────────────────── */
// 1: integrale ∫B·dl/μ₀ accumulato lungo il percorso; 2: componente tangente di B lungo il percorso.
// Il campo cambia da punto a punto, ma l'integrale completo vale sempre la corrente concatenata.
function drawGraphs() {
  if (cachedCumul.length < 2) return;
  const C = Lab.graphColors(), N = cachedCumul.length - 1, ex = exactCirc();
  const vMax = Lab.niceMax(Math.max(...cachedCumul.map(Math.abs), Math.abs(ex), 1));
  let g = Lab.panel(gCanvas[0], { title: '∫B·dl / μ₀ accumulato lungo il percorso (A)', xr: [0, 360], xStep: 90, yr: [-vMax, vMax], xLabel: 'posizione sul percorso (°)' });
  if (g) {
    const [c, f] = g;
    c.save(); c.setLineDash([5, 4]); c.strokeStyle = C.amber; c.beginPath(); c.moveTo(f.L, f.Y(ex)); c.lineTo(f.R, f.Y(ex)); c.stroke(); c.restore();
    Lab.plotPts(c, f, cachedCumul.map((v, i) => [i / N * 360, v]), C.accent, 2);
    Lab.legend(c, f.L + 8, f.T + 8, [[C.accent, '∫ da 0 a θ'], [C.amber, 'corrente concatenata', [5, 4]]]);
  }
  // componente di B lungo il percorso, in µT
  const Bt = [];
  for (let i = 0; i < N; i++) {
    const t1 = 2 * Math.PI * i / N, t2 = 2 * Math.PI * (i + 1) / N;
    const [x1, y1] = loopPoint(t1), [x2, y2] = loopPoint(t2), dl = Math.hypot(x2 - x1, y2 - y1);
    const [bx, by] = computeField((x1 + x2) / 2, (y1 + y2) / 2);
    Bt.push([(i + 0.5) / N * 360, toMicroT((bx * (x2 - x1) + by * (y2 - y1)) / dl)]);
  }
  const bMax = Lab.niceMax(Math.max(...Bt.map(p => Math.abs(p[1])), 1));
  g = Lab.panel(gCanvas[1], { title: 'Componente di B lungo il percorso (µT)', xr: [0, 360], xStep: 90, yr: [-bMax, bMax], xLabel: 'posizione sul percorso (°)' });
  if (g) { const [c, f] = g; Lab.plotPts(c, f, Bt, C.blue, 2); }
}

/* ── Readout ─────────────────────────────────────────────────────────────── */
function updateReadout() {
  const ex  = exactCirc();
  const enc = sources.filter(w => isInsideLoop(w.x - loopX, w.y - loopY)).length;
  const Lcm = (() => { let L = 0; for (let i = 0; i < NI; i++) { const [a, b] = loopPoint(2 * Math.PI * i / NI), [c, d] = loopPoint(2 * Math.PI * (i + 1) / NI); L += Math.hypot(c - a, d - b); } return L / PX_CM; })();
  document.getElementById('readout').innerHTML = [
    { label: '∮ B·dl / μ₀',           value: fmt(cachedCirc) },
    { label: 'corrente concatenata',  value: fmt(ex)    },
    { label: 'lunghezza del percorso', value: Lab.fmt(Lcm, 1) + ' cm' },
    { label: 'fili interni',          value: `${enc} su ${sources.length}` },
  ].map(r =>
    `<span class="readout-item"><span class="readout-label">${Lab.keepCaseHTML(r.label)}</span><span class="readout-value">${r.value}</span></span>`
  ).join('');
}

/* ── Animation loop ──────────────────────────────────────────────────────── */
function loop() {
  if (circDirty) { recompute(); circDirty = false; }
  drawSim();
  drawGraphs();
  updateReadout();
  requestAnimationFrame(loop);
}

/* ── Drag ────────────────────────────────────────────────────────────────── */
let drag = null;
const GRAB = 18;

function evPhy(e) {
  const r  = sc.getBoundingClientRect();
  const ex = e.touches ? e.touches[0].clientX : e.clientX;
  const ey = e.touches ? e.touches[0].clientY : e.clientY;
  return [(ex - r.left - CX) / viewZoom, (ey - r.top - CY) / viewZoom];
}

sc.addEventListener('mousedown', e => {
  const [px, py] = evPhy(e);
  if (Math.hypot(px - loopX, py - loopY) < GRAB) { drag = { type: 'loop' }; return; }
  for (let i = 0; i < sources.length; i++) {
    if (Math.hypot(px - sources[i].x, py - sources[i].y) < GRAB) { drag = { type: 'wire', i }; return; }
  }
});
sc.addEventListener('touchstart', e => {
  e.preventDefault();
  const [px, py] = evPhy(e);
  if (Math.hypot(px - loopX, py - loopY) < GRAB) { drag = { type: 'loop' }; return; }
  for (let i = 0; i < sources.length; i++) {
    if (Math.hypot(px - sources[i].x, py - sources[i].y) < GRAB) { drag = { type: 'wire', i }; return; }
  }
}, { passive: false });

function onMove(e) {
  if (!drag) return;
  const [px, py] = evPhy(e);
  if (drag.type === 'loop') { loopX = px; loopY = py; }
  else { sources[drag.i].x = px; sources[drag.i].y = py; }
  circDirty = true;
}
window.addEventListener('mousemove', onMove);
window.addEventListener('touchmove', e => { e.preventDefault(); onMove(e); }, { passive: false });
window.addEventListener('mouseup',  () => { drag = null; });
window.addEventListener('touchend', () => { drag = null; });

sc.addEventListener('wheel', e => {
  e.preventDefault();
  viewZoom = Math.max(0.2, Math.min(6, viewZoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
}, { passive: false });
sc.addEventListener('dblclick', () => { viewZoom = 1; });

/* ── Controls ────────────────────────────────────────────────────────────── */
function buildControls() {
  const ctrl = document.getElementById('controls');
  ctrl.innerHTML = '';

  const visSec = Lab.Section('Visualizzazione');
  visSec.add(Lab.Toggle({ label: 'Linee di campo B', value: P.fieldLines,
    onChange: v => { P.fieldLines = v; } }));
  ctrl.appendChild(visSec.el);

  const loopSec = Lab.Section('Percorso amperiano');
  loopSec.add(Lab.RadioGroup({
    label: 'Forma',
    options: [
      { label: 'Circolare',    value: 'circle', hint: 'Simmetria radiale' },
      { label: 'Rettangolare', value: 'rect',   hint: 'Sezione quadrata'  },
      { label: 'Amorfa',       value: 'blob',   hint: 'Forma irregolare'  },
    ],
    value: P.loop,
    onChange: v => { P.loop = v; circDirty = true; },
  }));
  loopSec.add(Lab.Slider({
    label: 'Raggio / semilato', min: 3, max: 16, step: 0.5, value: P.R / PX_CM, unit: ' cm',
    onChange: v => { P.R = v * PX_CM; circDirty = true; },
  }));
  ctrl.appendChild(loopSec.el);

  const wireSec = Lab.Section('Fili conduttori');
  wireSec.add(Lab.ItemList({
    items: sources,
    text: (w, i) => `Filo ${i + 1}: I = ${w.I > 0 ? '+' : '−'}${Math.abs(w.I)} A ${w.I > 0 ? '⊙' : '⊗'}`,
    color: w => (w.I > 0 ? '#ff7070' : '#7090ff'),
    onRemove: i => { sources.splice(i, 1); circDirty = true; buildControls(); },
    max: 8,
    add: [['+2 A', 2], ['+5 A', 5], ['−2 A', -2], ['−5 A', -5]].map(([label, I]) => ({
      label, color: I > 0 ? '#ff7070' : '#7090ff',
      onClick: () => {
        const a = Math.random() * 2 * Math.PI, r0 = P.R * 0.5 * Math.random();
        sources.push({ x: loopX + r0 * Math.cos(a), y: loopY + r0 * Math.sin(a), I });
        circDirty = true; buildControls();
      },
    })),
  }));
  const note = document.createElement('div');
  note.className = 'lab-note';
  note.innerHTML = 'Trascina i fili e il centro del percorso. ⊙ corrente verso di te, ⊗ corrente che entra. Il percorso è percorso in senso antiorario.';
  wireSec.add(note);
  ctrl.appendChild(wireSec.el);

  // situazioni tipiche, per vedere subito il teorema all'opera
  const exSec = Lab.Section('Esempi');
  const ex = document.createElement('div');
  ex.className = 'ctrl-btn-row';
  const EXAMPLES = [
    ['Un filo dentro il percorso', [{ x: 40, y: -20, I: 5 }]],
    ['Un filo fuori: ∮ = 0', [{ x: -200, y: 40, I: 5 }]],
    ['Due correnti opposte dentro', [{ x: 45, y: -25, I: 5 }, { x: -50, y: 35, I: -5 }]],
    ['Tre fili, uno fuori', [{ x: 40, y: -30, I: 5 }, { x: -40, y: 45, I: 2 }, { x: 210, y: 20, I: -5 }]],
  ];
  for (const [label, src] of EXAMPLES) {
    const b = document.createElement('button');
    b.className = 'ctrl-btn'; b.textContent = label;
    b.onclick = () => { sources = src.map(o => ({ ...o })); loopX = 0; loopY = 0; circDirty = true; buildControls(); };
    ex.appendChild(b);
  }
  exSec.add(ex);
  ctrl.appendChild(exSec.el);
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

function init() {
  resizeCanvases();
  buildControls();
  requestAnimationFrame(loop);
}

init();
