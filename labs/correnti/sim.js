'use strict';

// Campo magnetico generato da correnti stazionarie.
// La scena è una sezione piana scelta in modo che il campo stia tutto nel piano:
//   spira circolare, spira quadrata, solenoide → piano xz, che contiene l'asse z delle spire;
//   filo infinito, toroide                     → piano xy, perpendicolare al filo / all'asse del toroide.
// I campi sono calcolati in forma esatta: spira circolare con gli integrali ellittici completi,
// spira quadrata con la formula di Biot–Savart per i tratti rettilinei, solenoide come somma delle
// sue spire, filo e toroide con la legge di Ampère. Le linee di campo partono da punti scelti in
// modo che fra due linee vicine passi lo stesso flusso: dove le linee sono fitte il campo è intenso.

const canvas    = document.getElementById('simCanvas');
const ctx       = canvas.getContext('2d');
const gCanvas   = document.getElementById('graphCanvas');
const gctx      = gCanvas.getContext('2d');
const graphArea = document.getElementById('graphArea');
const readoutEl = document.getElementById('readout');
let SW = 0, SH = 0, GW = 0, GH = 0, DPR = 1;

const MU0 = 4 * Math.PI * 1e-7;
const VIEW = 15;        // cm: mezza larghezza della sezione mostrata (fissa)
const I_MAX = 10;

const SOURCES = {
  wire:     { label: 'Filo infinito',   plane: 'xy', fs: 2e-4 },
  loop:     { label: 'Spira circolare', plane: 'xz', fs: 1.6e-4 },
  square:   { label: 'Spira quadrata',  plane: 'xz', fs: 1.6e-4 },
  solenoid: { label: 'Solenoide',       plane: 'xz', fs: 2e-3 },
  toroid:   { label: 'Toroide',         plane: 'xy', fs: 2e-3 },
};

const P = {
  src: 'loop',
  I: 5,            // A
  R: 5,            // cm  raggio della spira
  side: 8,         // cm  lato della spira quadrata
  solR: 4,         // cm  raggio del solenoide
  solL: 14,        // cm  lunghezza del solenoide
  solN: 24,        //     spire del solenoide
  torR: 7,         // cm  raggio medio del toroide
  tora: 2,         // cm  raggio della sezione del toroide
  torN: 60,        //     spire del toroide
  lines: true,
  nLines: 12,
  heat: true,
  view: '3d',      // '3d' vista in prospettiva ruotabile, '2d' sezione piana
  spin: true,      // rotazione automatica nella vista 3D
};
const cam = { yaw: -0.6, el: 0.38, zoom: 1 };
let planePhi = 0;  // angolo del piano meridiano usato da fieldUV (serve alla spira quadrata in 3D)

// ── Integrali ellittici completi K(m), E(m) con la media aritmetico-geometrica ──
function ellipKE(m) {
  let a = 1, b = Math.sqrt(1 - m), sum = m / 2, w = 0.5;
  for (let i = 0; i < 20 && Math.abs(a - b) > 1e-13 * a; i++) {
    const c = (a - b) / 2;
    const an = (a + b) / 2;
    b = Math.sqrt(a * b); a = an;
    w *= 2; sum += w * c * c;
  }
  const K = Math.PI / (2 * a);
  return [K, K * (1 - sum)];
}

// Spira circolare di raggio a (m) nel piano z = z0, corrente antioraria vista da +z.
// Restituisce [Bρ, Bz] (T) nel punto a distanza ρ ≥ 0 dall'asse e quota z (m).
function loopB(a, z0, rho, z, I) {
  const zeta = z - z0, s = a * a + rho * rho + zeta * zeta;
  const al2 = s - 2 * a * rho, be2 = s + 2 * a * rho;
  if (al2 < 1e-14) return [0, 0];
  const be = Math.sqrt(be2), [K, E] = ellipKE(1 - al2 / be2), C = MU0 * I / Math.PI;
  const bz = C / (2 * al2 * be) * ((a * a - rho * rho - zeta * zeta) * E + al2 * K);
  const br = rho < 1e-6 ? 0 : C * zeta / (2 * al2 * be * rho) * (s * E - al2 * K);
  return [br, bz];
}

// Tratto rettilineo da p1 a p2 (m), punto p: Biot–Savart esatto
function segmentB(p1, p2, p, I, out) {
  const ux = p2[0] - p1[0], uy = p2[1] - p1[1], uz = p2[2] - p1[2], len = Math.hypot(ux, uy, uz);
  const ex = ux / len, ey = uy / len, ez = uz / len;
  const wx = p[0] - p1[0], wy = p[1] - p1[1], wz = p[2] - p1[2];
  const t = wx * ex + wy * ey + wz * ez;
  const dx = wx - t * ex, dy = wy - t * ey, dz = wz - t * ez, d2 = dx * dx + dy * dy + dz * dz;
  if (d2 < 1e-12) return;
  const r1 = Math.hypot(wx, wy, wz), r2 = Math.hypot(p[0] - p2[0], p[1] - p2[1], p[2] - p2[2]);
  const f = MU0 * I / (4 * Math.PI * d2) * ((len - t) / r2 + t / r1);
  out[0] += f * (ey * dz - ez * dy);
  out[1] += f * (ez * dx - ex * dz);
  out[2] += f * (ex * dy - ey * dx);
}

const cm = v => v / 100;
const solTurns = () => {
  const zs = [];
  for (let i = 0; i < P.solN; i++) zs.push(cm(-P.solL / 2 + P.solL * (i + 0.5) / P.solN));
  return zs;
};
// distanza dal centro al bordo della spira quadrata lungo la direzione φ del piano meridiano
const sqHalf = () => P.side / 2 / Math.max(Math.abs(Math.cos(planePhi)), Math.abs(Math.sin(planePhi)));
const torA = () => Math.min(P.tora, P.torR - 1);    // la sezione non può superare il foro centrale

// Campo nel piano della sezione, coordinate (u, v) in cm sullo schermo: u verso destra, v verso l'alto.
// Piano xz: u = x, v = z.  Piano xy: u = x, v = y.  Restituisce [Bu, Bv] in tesla.
let turnZ = [];
function fieldUV(u, v) {
  const I = P.I;
  switch (P.src) {
    case 'wire': {
      const r2 = cm(u) ** 2 + cm(v) ** 2;
      if (r2 < 1e-10) return [0, 0];
      const f = MU0 * I / (2 * Math.PI * r2);
      return [-f * cm(v), f * cm(u)];
    }
    case 'toroid': {
      const r = Math.hypot(u, v), a = torA();
      if (r < P.torR - a || r > P.torR + a) return [0, 0];
      const f = MU0 * P.torN * I / (2 * Math.PI * cm(r) * r);
      return [-f * v, f * u];
    }
    case 'loop': {
      const [br, bz] = loopB(cm(P.R), 0, cm(Math.abs(u)), cm(v), I);
      return [u < 0 ? -br : br, bz];
    }
    case 'solenoid': {
      let br = 0, bz = 0;
      const rho = cm(Math.abs(u)), z = cm(v), a = cm(P.solR);
      for (const z0 of turnZ) { const b = loopB(a, z0, rho, z, I); br += b[0]; bz += b[1]; }
      return [u < 0 ? -br : br, bz];
    }
    case 'square': {
      const h = cm(P.side / 2), out = [0, 0, 0], cp = Math.cos(planePhi), sp = Math.sin(planePhi);
      const p = [cm(u) * cp, cm(u) * sp, cm(v)];
      const c = [[h, -h, 0], [h, h, 0], [-h, h, 0], [-h, -h, 0]];   // antioraria vista da +z
      for (let i = 0; i < 4; i++) segmentB(c[i], c[(i + 1) % 4], p, I, out);
      return [out[0] * cp + out[1] * sp, out[2]];
    }
  }
  return [0, 0];
}

// Dove i conduttori attraversano il piano: [u, v, verso] con verso +1 = corrente uscente (⊙)
function crossings() {
  switch (P.src) {
    case 'wire': return [[0, 0, 1]];
    case 'loop': return [[-P.R, 0, 1], [P.R, 0, -1]];
    case 'square': return [[-sqHalf(), 0, 1], [sqHalf(), 0, -1]];
    case 'solenoid': {
      const out = [];
      for (const z of turnZ) { out.push([-P.solR, z * 100, 1]); out.push([P.solR, z * 100, -1]); }
      return out;
    }
    case 'toroid': {
      const out = [], a = torA(), n = Math.min(P.torN, 40);
      for (let i = 0; i < n; i++) {
        const t = 2 * Math.PI * (i + 0.5) / n;
        out.push([(P.torR - a) * Math.cos(t), (P.torR - a) * Math.sin(t), 1]);
        out.push([(P.torR + a) * Math.cos(t), (P.torR + a) * Math.sin(t), -1]);
      }
      return out;
    }
  }
  return [];
}

// ── Linee di campo ───────────────────────────────────────────────────────────
// Filo e toroide: le linee sono circonferenze. Fra due circonferenze di raggi r e r' passa un
// flusso (per unità di lunghezza) ∝ ln(r'/r): raggi in progressione geometrica = flusso uguale.
// Spire e solenoide: si parte dal diametro della spira (z = 0), dove passano tutte le linee, con
// punti che dividono il flusso in parti uguali; ogni linea si segue con Runge–Kutta finché si chiude.
let cross = [];
function nearestConductor(u, v) {
  let d = Infinity;
  for (const c of cross) d = Math.min(d, Math.hypot(u - c[0], v - c[1]));
  return d;
}
function dirAt(u, v) {
  const b = fieldUV(u, v), m = Math.hypot(b[0], b[1]);
  return m > 0 ? [b[0] / m, b[1] / m] : null;
}
function traceLine(u0, v0) {
  const pts = [[u0, v0]];
  let u = u0, v = v0, len = 0, closed = false;
  for (let i = 0; i < 5000; i++) {
    const h = Math.max(0.015, Math.min(0.45, 0.22 * nearestConductor(u, v)));
    const d1 = dirAt(u, v); if (!d1) break;
    const d2 = dirAt(u + d1[0] * h / 2, v + d1[1] * h / 2); if (!d2) break;
    const d3 = dirAt(u + d2[0] * h / 2, v + d2[1] * h / 2); if (!d3) break;
    const d4 = dirAt(u + d3[0] * h, v + d3[1] * h); if (!d4) break;
    u += h * (d1[0] + 2 * d2[0] + 2 * d3[0] + d4[0]) / 6;
    v += h * (d1[1] + 2 * d2[1] + 2 * d3[1] + d4[1]) / 6;
    len += h; pts.push([u, v]);
    if (len > 20 * h && Math.hypot(u - u0, v - v0) < 1.2 * h) { pts.push([u0, v0]); closed = true; break; }
    if (Math.abs(u) > 90 || Math.abs(v) > 90) break;
  }
  return { pts, closed };
}
function circleLine(r) {
  const pts = [];
  for (let k = 0; k <= 120; k++) { const t = 2 * Math.PI * k / 120; pts.push([r * Math.cos(t), r * Math.sin(t)]); }
  return { pts, closed: true };
}

let lineCache = { key: '', lines: [] };
function buildLines(n = P.nLines) {
  const out = [];
  if (P.src === 'wire') {
    const r0 = 0.7, r1 = VIEW * 1.45;
    for (let k = 0; k < n; k++) out.push(circleLine(r0 * Math.pow(r1 / r0, (k + 0.5) / n)));
  } else if (P.src === 'toroid') {
    const a = torA(), r0 = P.torR - a, r1 = P.torR + a, m = Math.max(3, Math.round(n / 2));
    for (let k = 0; k < m; k++) out.push(circleLine(r0 * Math.pow(r1 / r0, (k + 0.5) / m)));
  } else {
    // flusso (per unità di lunghezza, nel piano) lungo il raggio interno della spira, a z = 0
    // ci si ferma prima del conduttore: lì il campo diverge e assorbirebbe quasi tutte le linee
    const rin = (P.src === 'loop' ? P.R : P.src === 'square' ? sqHalf() : P.solR) * 0.88 / 0.995;
    const S = 400, cum = [0];
    let prev = fieldUV(0, 0)[1];
    for (let i = 1; i <= S; i++) {
      const u = rin * 0.995 * i / S, b = fieldUV(u, 0)[1];
      cum.push(cum[i - 1] + (prev + b) / 2 * rin * 0.995 / S); prev = b;
    }
    const half = Math.max(1, Math.round(n / 2)), tot = cum[S];
    for (let k = 0; k < half; k++) {
      const target = tot * (k + 0.5) / half;
      let i = 1;
      while (i < S && cum[i] < target) i++;
      const f = (target - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
      const u0 = rin * 0.995 * (i - 1 + f) / S;
      const line = traceLine(u0, 0);
      out.push(line);
      // la sezione è simmetrica: la linea a sinistra è la speculare
      out.push({ pts: line.pts.map(([u, v]) => [-u, v]), closed: line.closed });
    }
  }
  return out;
}

// ── Linee e conduttori nello spazio (vista 3D) ───────────────────────────────
// Spire e solenoide: il piano xz non ha niente di speciale, ogni piano che contiene l'asse è un
// piano di simmetria e il campo vi giace dentro. Le linee della sezione, ruotate attorno all'asse,
// sono quindi linee di campo vere. Per la spira quadrata solo i piani per i lati (0°, 90°) e per le
// diagonali (45°, 135°) sono di simmetria: lì le linee si calcolano a parte.
// Filo e toroide: circonferenze orizzontali a varie quote.
const PHIS = [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4];
function finishLine(pts3, k) {
  // ricampiona a passo ≈ 0,3 cm e sceglie dove mettere le frecce (ogni 7 cm, sfalsate)
  const keep = [pts3[0]];
  for (let i = 1; i < pts3.length; i++) {
    const a = keep[keep.length - 1], b = pts3[i];
    if (i === pts3.length - 1 || Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) >= 0.3) keep.push(b);
  }
  const pts = new Float32Array(keep.length * 3), arrows = [];
  let acc = 7 * (0.3 + 0.23 * (k % 4));
  keep.forEach((q, i) => {
    pts.set(q, 3 * i);
    if (i) { const a = keep[i - 1]; acc += Math.hypot(q[0] - a[0], q[1] - a[1], q[2] - a[2]); }
    if (acc >= 7 && i > 0 && i < keep.length - 1) { acc = 0; arrows.push(i); }
  });
  return { pts, arrows };
}
function circle3(r, z, n = 96) {
  const pts = [];
  for (let k = 0; k <= n; k++) { const t = 2 * Math.PI * k / n; pts.push([r * Math.cos(t), r * Math.sin(t), z]); }
  return pts;
}
function buildLines3D() {
  const out = [];
  let k = 0;
  if (P.src === 'wire') {
    const m = Math.max(3, Math.round(P.nLines / 3)), r0 = 0.7, r1 = VIEW;
    for (const z of [-10, -5, 0, 5, 10])
      for (let i = 0; i < m; i++) out.push(finishLine(circle3(r0 * Math.pow(r1 / r0, (i + 0.5) / m), z), k++));
  } else if (P.src === 'toroid') {
    const a = torA(), m = Math.max(2, Math.round(P.nLines / 4));
    for (const z of [0, 0.6 * a, -0.6 * a]) {
      const h = Math.sqrt(a * a - z * z), r0 = P.torR - h, r1 = P.torR + h;
      for (let i = 0; i < m; i++) out.push(finishLine(circle3(r0 * Math.pow(r1 / r0, (i + 0.5) / m), z), k++));
    }
  } else {
    const n3 = Math.max(4, Math.round(P.nLines / 4) * 2), sets = {};
    for (const phi of PHIS) {
      const sk = P.src === 'square' && Math.abs(Math.sin(2 * phi)) > 0.5 ? 'diag' : 'side';
      if (!sets[sk]) { planePhi = phi; cross = crossings(); sets[sk] = buildLines(n3); }
      const c = Math.cos(phi), s = Math.sin(phi);
      for (const { pts } of sets[sk]) out.push(finishLine(pts.map(([u, v]) => [u * c, u * s, v]), k++));
    }
    planePhi = 0; cross = crossings();
  }
  return out;
}
// conduttori come polilinee orientate nel verso della corrente
function buildConductors3D() {
  const list = [];
  const add = (pts, w, spacing) => {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
    }
    list.push({ pts, cum, len: cum[cum.length - 1], w, spacing });
  };
  const seg = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a.map((x, j) => x + (b[j] - x) * i / n));
  if (P.src === 'wire') add(seg([0, 0, -VIEW], [0, 0, VIEW], 60), 4, 2.5);
  else if (P.src === 'loop') add(circle3(P.R, 0), 2.8, 2);
  else if (P.src === 'square') {
    const h = P.side / 2, c = [[h, -h, 0], [h, h, 0], [-h, h, 0], [-h, -h, 0], [h, -h, 0]];
    let pts = [];
    for (let i = 0; i < 4; i++) pts = pts.concat(seg(c[i], c[i + 1], 16).slice(i ? 1 : 0));
    add(pts, 2.8, 2);
  } else if (P.src === 'solenoid') {
    const pts = [], M = P.solN * 40;
    for (let i = 0; i <= M; i++) {
      const t = 2 * Math.PI * P.solN * i / M;
      pts.push([P.solR * Math.cos(t), P.solR * Math.sin(t), -P.solL / 2 + P.solL * i / M]);
    }
    add(pts, 1.8, 2.5);
  } else if (P.src === 'toroid') {
    // avvolgimenti: verso l'alto sul lato interno (⊙ nella sezione xy), verso il basso su quello esterno
    const a = torA();
    for (let j = 0; j < P.torN; j++) {
      const p = 2 * Math.PI * (j + 0.5) / P.torN, pts = [];
      for (let i = 0; i <= 28; i++) {
        const t = 2 * Math.PI * i / 28, r = P.torR + a * Math.cos(t);
        pts.push([r * Math.cos(p), r * Math.sin(p), -a * Math.sin(t)]);
      }
      add(pts, P.torN > 100 ? 0.8 : 1.1, Math.PI * a);
    }
  }
  return list;
}

// ── Mappa dell'intensità ─────────────────────────────────────────────────────
const HEAT_N = 180;
let heatCache = { key: '', img: null };
const heatCanvas = document.createElement('canvas');
heatCanvas.width = heatCanvas.height = HEAT_N;
const hctx = heatCanvas.getContext('2d');

function heatColor(t, light) {
  const S = light
    ? [[0, [244, 247, 250]], [0.35, [196, 228, 242]], [0.65, [84, 176, 216]], [0.85, [0, 112, 170]], [1, [10, 52, 96]]]
    : [[0, [6, 10, 16]], [0.3, [10, 36, 62]], [0.6, [0, 110, 150]], [0.85, [0, 200, 240]], [1, [210, 250, 255]]];
  for (let i = 1; i < S.length; i++) {
    if (t <= S[i][0]) {
      const [t0, c0] = S[i - 1], [t1, c1] = S[i], f = (t - t0) / (t1 - t0);
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
    }
  }
  return S[S.length - 1][1];
}
// scala logaritmica fissa per ogni sorgente: 2,5 decadi sotto il fondo scala
function buildHeat(light) {
  const fs = SOURCES[P.src].fs, img = hctx.createImageData(HEAT_N, HEAT_N);
  const sym = SOURCES[P.src].plane === 'xz';
  const val = new Float32Array(HEAT_N * HEAT_N);
  for (let j = 0; j < HEAT_N; j++) {
    const v = VIEW - (j + 0.5) / HEAT_N * 2 * VIEW;
    for (let i = 0; i < HEAT_N; i++) {
      if (sym && i < HEAT_N / 2) continue;
      const u = -VIEW + (i + 0.5) / HEAT_N * 2 * VIEW;
      const b = fieldUV(u, v), m = Math.hypot(b[0], b[1]);
      val[j * HEAT_N + i] = m;
      if (sym) val[j * HEAT_N + (HEAT_N - 1 - i)] = m;
    }
  }
  for (let k = 0; k < val.length; k++) {
    const t = val[k] > 0 ? Math.max(0, Math.min(1, (Math.log10(val[k] / fs) + 2.5) / 2.5)) : 0;
    const c = heatColor(t, light);
    img.data[4 * k] = c[0]; img.data[4 * k + 1] = c[1]; img.data[4 * k + 2] = c[2]; img.data[4 * k + 3] = 255;
  }
  hctx.putImageData(img, 0, 0);
}

// ── Colori e testo ───────────────────────────────────────────────────────────
function getCSSVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
let C = {};
function getColors() {
  const light = document.documentElement.dataset.theme === 'light';
  return {
    light,
    bg: getCSSVar('--bg1') || '#060a10', panel: getCSSVar('--bg2') || '#0b1018', bg3: getCSSVar('--bg3') || '#111820',
    text: getCSSVar('--text-primary') || '#ddeeff', muted: getCSSVar('--text-secondary') || '#6b8099',
    accent: getCSSVar('--accent') || '#00d4ff', amber: getCSSVar('--accent-amber') || '#ffb400',
    red: getCSSVar('--accent-red') || '#ff4757', green: getCSSVar('--accent-green') || '#2ecc71',
    grid: light ? 'rgba(0,0,0,0.13)' : 'rgba(255,255,255,0.11)',
    line: light ? 'rgba(15,25,40,0.85)' : 'rgba(255,255,255,0.88)',
  };
}
function text(c, str, x, y, { color = C.text, size = 11, align = 'center', bold = false, mono = false } = {}) {
  c.fillStyle = color;
  c.font = `${bold ? '700 ' : ''}${size}px ${mono ? 'Space Mono, monospace' : 'DM Sans, sans-serif'}`;
  c.textAlign = align; c.textBaseline = 'middle';
  c.fillText(str, x, y + size * 0.06);
}
function card(c, x, y, w, h, title) {
  c.fillStyle = C.panel; c.strokeStyle = C.grid; c.lineWidth = 1;
  c.beginPath(); c.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 8); c.fill(); c.stroke();
  if (title) text(c, title, x + 12, y + 14, { size: 10.5, color: C.muted, align: 'left' });
}
const fmt = (v, d = 1) => Lab.fmt(v, d);
function fmtB(T) {
  const a = Math.abs(T);
  if (a >= 1e-3) return `${fmt(T * 1e3, a >= 1e-2 ? 1 : 2)} mT`;
  return `${fmt(T * 1e6, a >= 1e-5 ? 1 : 2)} μT`;
}

// ── Layout ───────────────────────────────────────────────────────────────────
function resize() {
  DPR = window.devicePixelRatio || 1;
  const area = canvas.parentElement;
  const avail = area.clientHeight - (readoutEl.offsetHeight || 56);
  const gh = Math.round(Math.max(150, Math.min(240, avail * 0.36, avail - 280)));
  graphArea.style.height = gh + 'px'; graphArea.style.minHeight = '0';
  SW = area.clientWidth;
  SH = Math.max(0, area.clientHeight - gh - (readoutEl.offsetHeight || 0));
  canvas.width = Math.round(SW * DPR); canvas.height = Math.round(SH * DPR);
  canvas.style.width = SW + 'px'; canvas.style.height = SH + 'px';
  GW = graphArea.clientWidth; GH = graphArea.clientHeight;
  gCanvas.width = Math.round(GW * DPR); gCanvas.height = Math.round(GH * DPR);
  gCanvas.style.width = GW + 'px'; gCanvas.style.height = GH + 'px';
  draw();
}

// ── Scena ────────────────────────────────────────────────────────────────────
let plot = { x0: 0, y0: 0, s: 1 };        // pixel per cm, origine al centro
const toPx = (u, v) => [plot.x0 + u * plot.s, plot.y0 - v * plot.s];
let probe = null;                           // posizione del mouse in cm
let cache3 = { key: '', lines: [], cond: [] };
let animT = 0;                              // tempo dell'animazione delle cariche (s)

function ensureCaches() {
  turnZ = P.src === 'solenoid' ? solTurns() : [];
  cross = crossings();
  const key = [P.src, P.I, P.R, P.side, P.solR, P.solL, P.solN, P.torR, P.tora, P.torN].join('|');
  if (lineCache.key !== key + '|' + P.nLines) lineCache = { key: key + '|' + P.nLines, lines: buildLines() };
  if (P.view === '3d' && cache3.key !== key + '|' + P.nLines)
    cache3 = { key: key + '|' + P.nLines, lines: buildLines3D(), cond: buildConductors3D() };
  const hk = key + '|' + C.light;
  if (heatCache.key !== hk) { buildHeat(C.light); heatCache.key = hk; }
}

function drawScene() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, SW, SH);
  if (SW < 80 || SH < 80) return;
  if (P.view === '3d') { drawScene3D(); return; }
  const side = Math.min(SW - 70, SH - 56);
  plot = { x0: SW / 2, y0: 24 + side / 2 + 4, s: side / (2 * VIEW) };
  const L = plot.x0 - side / 2, T = plot.y0 - side / 2;
  const src = SOURCES[P.src];

  ctx.save();
  ctx.beginPath(); ctx.rect(L, T, side, side); ctx.clip();
  if (P.heat) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(heatCanvas, L, T, side, side);
  }
  // griglia ogni 5 cm
  ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
  for (let g = -VIEW; g <= VIEW; g += 5) {
    const [x] = toPx(g, 0), [, y] = toPx(0, g);
    ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + side); ctx.moveTo(L, y); ctx.lineTo(L + side, y); ctx.stroke();
  }
  drawGeometryHints();
  if (P.lines) drawLines();
  drawConductors();
  ctx.restore();

  ctx.strokeStyle = C.grid; ctx.strokeRect(L + 0.5, T + 0.5, side - 1, side - 1);
  // assi
  const hName = 'x', vName = src.plane === 'xz' ? 'z' : 'y';
  for (let g = -VIEW; g <= VIEW; g += 5) {
    text(ctx, String(g), toPx(g, 0)[0], T + side + 10, { size: 9, color: C.muted, mono: true });
    text(ctx, String(g), L - 6, toPx(0, g)[1], { size: 9, color: C.muted, mono: true, align: 'right' });
  }
  text(ctx, `${hName} (cm)`, L + side, T + side + 22, { size: 9.5, color: C.muted, align: 'right' });
  text(ctx, `${vName} (cm)`, L - 6, T - 9, { size: 9.5, color: C.muted, align: 'right' });
  // titolo della sezione: versione corta se si sovrapporrebbe all'etichetta dell'asse
  let title = src.plane === 'xz' ? 'Sezione nel piano xz: contiene l\'asse delle spire'
    : 'Sezione nel piano xy: perpendicolare ' + (P.src === 'wire' ? 'al filo' : 'all\'asse del toroide');
  ctx.font = '11px DM Sans, sans-serif';
  if (14 + ctx.measureText(title).width > L - 50) title = src.plane === 'xz' ? 'Sezione xz' : 'Sezione xy';
  text(ctx, title, 14, 14, { size: 11, color: C.muted, align: 'left' });

  drawLegend(L + side + 12, T);
  drawInset();
  drawProbe();
}

function drawGeometryHints() {
  ctx.setLineDash([4, 4]); ctx.strokeStyle = C.accent; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
  if (P.src === 'solenoid') {
    // sagoma del solenoide
    const [x0, y0] = toPx(-P.solR, P.solL / 2), [x1, y1] = toPx(P.solR, -P.solL / 2);
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  } else if (P.src === 'toroid') {
    const a = torA();
    for (const r of [P.torR - a, P.torR + a]) { ctx.beginPath(); ctx.arc(plot.x0, plot.y0, r * plot.s, 0, 2 * Math.PI); ctx.stroke(); }
  } else if (P.src === 'loop' || P.src === 'square') {
    // traccia della spira (vista di taglio) e asse
    const h = P.src === 'loop' ? P.R : P.side / 2;
    const [x0, y] = toPx(-h, 0), [x1] = toPx(h, 0);
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
  }
  if (SOURCES[P.src].plane === 'xz') {
    const [x, y0] = toPx(0, VIEW), [, y1] = toPx(0, -VIEW);
    ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
  }
  ctx.setLineDash([]); ctx.globalAlpha = 1;
}

function drawLines() {
  ctx.strokeStyle = C.line; ctx.fillStyle = C.line; ctx.lineWidth = 1.4; ctx.lineJoin = 'round';
  let k = 0;
  for (const { pts } of lineCache.lines) {
    ctx.beginPath();
    pts.forEach(([u, v], i) => { const [x, y] = toPx(u, v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
    // frecce a intervalli regolari sullo schermo, solo nel tratto visibile, sfalsate fra le linee
    const spacing = 150;
    let acc = spacing * (0.35 + 0.29 * (k++ % 3)), prev = toPx(...pts[0]);
    for (let i = 1; i < pts.length; i++) {
      const cur = toPx(...pts[i]);
      const inView = Math.abs(pts[i][0]) < VIEW * 0.96 && Math.abs(pts[i][1]) < VIEW * 0.96;
      acc += Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
      if (inView && acc >= spacing) {
        acc = 0;
        const a = toPx(...pts[Math.max(0, i - 2)]), b = toPx(...pts[Math.min(pts.length - 1, i + 2)]);
        const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
        if (l > 0.5) {
          const ux = dx / l, uy = dy / l, [cx, cy] = cur;
          ctx.beginPath();
          ctx.moveTo(cx + ux * 5, cy + uy * 5);
          ctx.lineTo(cx - ux * 4 - uy * 4, cy - uy * 4 + ux * 4);
          ctx.lineTo(cx - ux * 4 + uy * 4, cy - uy * 4 - ux * 4);
          ctx.closePath(); ctx.fill();
        }
      }
      prev = cur;
    }
  }
}

function drawConductors() {
  let gap = Infinity;
  for (let i = 1; i < cross.length; i++) gap = Math.min(gap, Math.hypot(cross[i][0] - cross[i - 1][0], cross[i][1] - cross[i - 1][1]));
  const r = Math.max(2.5, Math.min(7, plot.s * 0.45, gap * plot.s * 0.42));
  for (const [u, v, dir] of cross) {
    const [x, y] = toPx(u, v);
    ctx.fillStyle = C.bg3; ctx.strokeStyle = dir > 0 ? C.amber : C.red; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    if (dir > 0) {
      ctx.fillStyle = C.amber; ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, 2 * Math.PI); ctx.fill();
    } else {
      const k = r * 0.55;
      ctx.beginPath(); ctx.moveTo(x - k, y - k); ctx.lineTo(x + k, y + k); ctx.moveTo(x + k, y - k); ctx.lineTo(x - k, y + k); ctx.stroke();
    }
  }
}

function drawLegend(x, y, rows = [
  ['⊙', C.amber, 'corrente verso di te'],
  ['⊗', C.red, 'corrente che entra'],
  ['→', C.line, 'linea di campo B'],
]) {
  if (SW - x < 120) return;
  rows.forEach(([s, col, t], i) => {
    text(ctx, s, x + 6, y + 8 + i * 18, { size: 13, bold: true, color: col });
    text(ctx, t, x + 18, y + 8 + i * 18, { size: 10, color: C.muted, align: 'left' });
  });
  if (P.heat) {
    // scala dei colori (logaritmica)
    const fs = SOURCES[P.src].fs, by = y + 16 + rows.length * 18, bh = Math.min(140, SH - by - 140);
    if (bh < 50) return;
    for (let k = 0; k < bh; k++) {
      const c = heatColor(1 - k / bh, C.light);
      ctx.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
      ctx.fillRect(x + 2, by + k, 10, 1);
    }
    ctx.strokeStyle = C.grid; ctx.strokeRect(x + 2.5, by + 0.5, 10, bh);
    text(ctx, '|B|', x + 2, by - 10, { size: 9.5, color: C.muted, align: 'left' });
    [0, 1, 2].forEach(d => {
      const yy = by + d / 2.5 * bh;
      text(ctx, fmtB(fs / 10 ** d), x + 18, yy, { size: 9, color: C.muted, align: 'left', mono: true });
    });
  }
}

// Piccolo disegno in prospettiva: dov'è il conduttore e quale sezione stiamo guardando
function drawInset() {
  const w = 120, h = 96, x0 = 10, y0 = SH - h - 8;
  if (plot.x0 - VIEW * plot.s - 10 < w && SH < 420) return;
  ctx.fillStyle = C.panel; ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x0 + 0.5, y0 + 0.5, w, h, 8); ctx.fill(); ctx.stroke();
  const cx = x0 + w / 2, cy = y0 + h / 2 + 6, s = 2.4;
  const P3 = (x, y, z) => [cx + (x - y) * 0.87 * s, cy + (x + y) * 0.42 * s - z * s];
  const path = (pts, close) => { ctx.beginPath(); pts.forEach((p, i) => { const q = P3(...p); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); if (close) ctx.closePath(); };
  // piano della sezione
  const E = 13;
  path(SOURCES[P.src].plane === 'xz' ? [[-E, 0, -E], [E, 0, -E], [E, 0, E], [-E, 0, E]] : [[-E, -E, 0], [E, -E, 0], [E, E, 0], [-E, E, 0]], true);
  ctx.fillStyle = C.accent; ctx.globalAlpha = 0.14; ctx.fill(); ctx.globalAlpha = 0.5; ctx.strokeStyle = C.accent; ctx.stroke(); ctx.globalAlpha = 1;
  ctx.strokeStyle = C.amber; ctx.lineWidth = 1.6;
  const circle = (r, z, n = 40) => { const pts = []; for (let k = 0; k <= n; k++) { const t = 2 * Math.PI * k / n; pts.push([r * Math.cos(t), r * Math.sin(t), z]); } return pts; };
  if (P.src === 'wire') { path([[0, 0, -16], [0, 0, 16]]); ctx.stroke(); }
  else if (P.src === 'loop') { path(circle(7, 0)); ctx.stroke(); }
  else if (P.src === 'square') { path([[-6, -6, 0], [6, -6, 0], [6, 6, 0], [-6, 6, 0]], true); ctx.stroke(); }
  else if (P.src === 'solenoid') {
    const pts = [];
    for (let k = 0; k <= 400; k++) { const t = 2 * Math.PI * 7 * k / 400; pts.push([5 * Math.cos(t), 5 * Math.sin(t), -11 + 22 * k / 400]); }
    path(pts); ctx.lineWidth = 1; ctx.stroke();
  } else if (P.src === 'toroid') {
    ctx.lineWidth = 1;
    for (let i = 0; i < 16; i++) {
      const p = 2 * Math.PI * i / 16, pts = [];
      for (let k = 0; k <= 16; k++) {
        const t = 2 * Math.PI * k / 16;
        const r = 9 + 3 * Math.cos(t);
        pts.push([r * Math.cos(p), r * Math.sin(p), 3 * Math.sin(t)]);
      }
      path(pts); ctx.stroke();
    }
  }
  text(ctx, SOURCES[P.src].plane === 'xz' ? 'sezione xz' : 'sezione xy', x0 + 8, y0 + 11, { size: 9, color: C.muted, align: 'left' });
}

function drawProbe() {
  if (!probe) return;
  const [x, y] = toPx(probe[0], probe[1]);
  const b = fieldUV(probe[0], probe[1]), m = Math.hypot(b[0], b[1]);
  ctx.strokeStyle = C.amber; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, 5, 0, 2 * Math.PI); ctx.stroke();
  if (m > 0) {
    // freccia lunga in proporzione al logaritmo dell'intensità
    const fs = SOURCES[P.src].fs, len = 14 + 30 * Math.max(0, Math.min(1, (Math.log10(m / fs) + 2.5) / 2.5));
    const ux = b[0] / m, uy = -b[1] / m;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + ux * len, y + uy * len); ctx.stroke();
    ctx.fillStyle = C.amber; ctx.beginPath();
    ctx.moveTo(x + ux * (len + 6), y + uy * (len + 6));
    ctx.lineTo(x + ux * len - uy * 4, y + uy * len + ux * 4);
    ctx.lineTo(x + ux * len + uy * 4, y + uy * len - ux * 4);
    ctx.closePath(); ctx.fill();
  }
  const lbl = `|B| = ${fmtB(m)}`;
  const right = x > SW - 140;
  text(ctx, lbl, x + (right ? -10 : 10), y - 14, { size: 10.5, bold: true, color: C.amber, align: right ? 'right' : 'left' });
}

// ── Vista 3D ─────────────────────────────────────────────────────────────────
// Proiezione ortogonale: così il piano della sezione resta un parallelogramma e la mappa di |B| ci
// si stende sopra con una semplice trasformazione affine. La profondità si rende con la trasparenza
// (lontano = più tenue) e disegnando i segmenti dal più lontano al più vicino, a fasce; quelli
// dietro il piano della sezione vengono disegnati prima del piano, gli altri dopo.
function camera() {
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), ce = Math.cos(cam.el), se = Math.sin(cam.el);
  const s = Math.min(SW, SH - 30) / (2 * VIEW * 1.15) * cam.zoom, ox = SW / 2, oy = SH / 2 + 12;
  const pr = (x, y, z) => {
    const xr = x * cy + y * sy, yr = -x * sy + y * cy;
    return [ox + xr * s, oy - (z * ce + yr * se) * s, z * se - yr * ce];
  };
  // da che parte del piano della sezione sta l'osservatore (+1 o −1 lungo la normale)
  const side = SOURCES[P.src].plane === 'xz' ? Math.sign(-cy * ce) || 1 : Math.sign(se) || 1;
  return { pr, s, side };
}
const inCube = (x, y, z) => Math.abs(x) <= VIEW && Math.abs(y) <= VIEW && Math.abs(z) <= VIEW;

function drawScene3D() {
  const { pr, s, side } = camera(), xz = SOURCES[P.src].plane === 'xz';
  const planePt = (u, v) => (xz ? pr(u, 0, v) : pr(u, v, 0));
  const normalOf = (x, y, z) => (xz ? y : z) * side;      // > 0: davanti al piano
  const NB = 12, Dm = VIEW * 1.8;
  const bins = Array.from({ length: 2 * NB }, () => ({ l: [], c: [], d: [], a: [] }));
  const binOf = (d, front) => Math.max(0, Math.min(NB - 1, Math.floor((d / Dm + 1) / 2 * NB))) + (front ? NB : 0);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 28, SW, SH - 28); ctx.clip();     // la riga del titolo resta libera

  // assi di riferimento, tratteggiati
  ctx.setLineDash([3, 4]); ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
  for (const [a, b] of [[[-VIEW, 0, 0], [VIEW, 0, 0]], [[0, -VIEW, 0], [0, VIEW, 0]], [[0, 0, -VIEW], [0, 0, VIEW]]]) {
    const p = pr(...a), q = pr(...b);
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
  }
  ctx.setLineDash([]);

  if (P.lines) {
    cache3.lines.forEach(({ pts, arrows }) => {
      const n = pts.length / 3, sp = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) sp.set(pr(pts[3 * i], pts[3 * i + 1], pts[3 * i + 2]), 3 * i);
      for (let i = 1; i < n; i++) {
        const a = 3 * (i - 1), b = 3 * i;
        if (!inCube(pts[a], pts[a + 1], pts[a + 2]) || !inCube(pts[b], pts[b + 1], pts[b + 2])) continue;
        const front = normalOf((pts[a] + pts[b]) / 2, (pts[a + 1] + pts[b + 1]) / 2, (pts[a + 2] + pts[b + 2]) / 2) >= -1e-3;
        bins[binOf((sp[a + 2] + sp[b + 2]) / 2, front)].l.push(sp[a], sp[a + 1], sp[b], sp[b + 1]);
      }
      for (const i of arrows) {
        const b = 3 * i;
        if (!inCube(pts[b], pts[b + 1], pts[b + 2])) continue;
        const dx = sp[b + 3] - sp[b - 3], dy = sp[b + 4] - sp[b - 2], l = Math.hypot(dx, dy);
        if (l < 0.6) continue;     // linea vista quasi di punta
        const front = normalOf(pts[b], pts[b + 1], pts[b + 2]) >= -1e-3;
        bins[binOf(sp[b + 2], front)].a.push(sp[b], sp[b + 1], dx / l, dy / l);
      }
    });
  }
  // conduttori e cariche in moto (verso convenzionale della corrente)
  for (const { pts, cum, len, spacing } of cache3.cond) {
    const sp = pts.map(p => pr(...p));
    for (let i = 1; i < pts.length; i++) {
      const m = pts[i - 1].map((x, j) => (x + pts[i][j]) / 2);
      bins[binOf((sp[i - 1][2] + sp[i][2]) / 2, normalOf(...m) >= 0)].c.push(sp[i - 1][0], sp[i - 1][1], sp[i][0], sp[i][1]);
    }
    const off = (animT * 1.2 * P.I) % spacing;
    let j = 1;
    for (let d = off; d < len; d += spacing) {
      while (j < cum.length - 1 && cum[j] < d) j++;
      const f = (d - cum[j - 1]) / (cum[j] - cum[j - 1] || 1), a = pts[j - 1], b = pts[j];
      const q = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f], p = pr(...q);
      bins[binOf(p[2], normalOf(...q) >= 0)].d.push(p[0], p[1]);
    }
  }

  const condW = cache3.cond.length ? cache3.cond[0].w : 2;
  const drawBin = (bin, b) => {
    const depth = (b % NB + 0.5) / NB;
    ctx.globalAlpha = 0.2 + 0.8 * depth;
    if (bin.l.length) {
      ctx.strokeStyle = C.line; ctx.lineWidth = 1.3; ctx.beginPath();
      for (let i = 0; i < bin.l.length; i += 4) { ctx.moveTo(bin.l[i], bin.l[i + 1]); ctx.lineTo(bin.l[i + 2], bin.l[i + 3]); }
      ctx.stroke();
    }
    if (bin.a.length) {
      ctx.fillStyle = C.line; ctx.beginPath();
      for (let i = 0; i < bin.a.length; i += 4) {
        const cx = bin.a[i], cy = bin.a[i + 1], ux = bin.a[i + 2], uy = bin.a[i + 3];
        ctx.moveTo(cx + ux * 5, cy + uy * 5);
        ctx.lineTo(cx - ux * 4 - uy * 4, cy - uy * 4 + ux * 4);
        ctx.lineTo(cx - ux * 4 + uy * 4, cy - uy * 4 - ux * 4);
        ctx.closePath();
      }
      ctx.fill();
    }
    ctx.globalAlpha = 0.35 + 0.65 * depth;
    if (bin.c.length) {
      ctx.strokeStyle = C.amber; ctx.lineWidth = condW; ctx.lineCap = 'round'; ctx.beginPath();
      for (let i = 0; i < bin.c.length; i += 4) { ctx.moveTo(bin.c[i], bin.c[i + 1]); ctx.lineTo(bin.c[i + 2], bin.c[i + 3]); }
      ctx.stroke(); ctx.lineCap = 'butt';
    }
    if (bin.d.length) {
      ctx.fillStyle = C.light ? '#7a3d00' : '#fff3c4'; ctx.beginPath();
      const r = Math.max(1.6, condW * 0.7);
      for (let i = 0; i < bin.d.length; i += 2) { ctx.moveTo(bin.d[i] + r, bin.d[i + 1]); ctx.arc(bin.d[i], bin.d[i + 1], r, 0, 2 * Math.PI); }
      ctx.fill();
    }
  };
  ctx.lineJoin = 'round';
  // dietro il piano della sezione, poi il piano, poi davanti
  for (let b = 0; b < NB; b++) drawBin(bins[b], b);
  ctx.globalAlpha = 1;
  const o = planePt(-VIEW, VIEW), ei = planePt(VIEW, VIEW), ej = planePt(-VIEW, -VIEW);
  if (P.heat) {
    ctx.save();
    ctx.globalAlpha = 0.62;
    ctx.setTransform(DPR * (ei[0] - o[0]) / HEAT_N, DPR * (ei[1] - o[1]) / HEAT_N,
      DPR * (ej[0] - o[0]) / HEAT_N, DPR * (ej[1] - o[1]) / HEAT_N, DPR * o[0], DPR * o[1]);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(heatCanvas, 0, 0);
    ctx.restore();
  }
  // bordo e griglia del piano della sezione
  ctx.strokeStyle = C.accent; ctx.lineWidth = 1;
  for (let g = -VIEW; g <= VIEW; g += 5) {
    ctx.globalAlpha = Math.abs(g) === VIEW ? 0.55 : 0.12;
    const a = planePt(g, -VIEW), b = planePt(g, VIEW), c = planePt(-VIEW, g), d = planePt(VIEW, g);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.stroke();
  }
  for (let b = NB; b < 2 * NB; b++) drawBin(bins[b], b);
  ctx.globalAlpha = 1;
  ctx.restore();

  // terna degli assi in basso a sinistra
  const tx = 40, ty = SH - 40, cyw = Math.cos(cam.yaw), syw = Math.sin(cam.yaw), ce = Math.cos(cam.el), se = Math.sin(cam.el);
  for (const [name, v, col] of [['x', [1, 0, 0], C.red], ['y', [0, 1, 0], C.green], ['z', [0, 0, 1], C.accent]]) {
    const xr = v[0] * cyw + v[1] * syw, yr = -v[0] * syw + v[1] * cyw;
    const dx = xr * 24, dy = -(v[2] * ce + yr * se) * 24;
    ctx.strokeStyle = col; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + dx, ty + dy); ctx.stroke();
    text(ctx, name, tx + dx * 1.3, ty + dy * 1.3, { size: 10, bold: true, color: col });
  }
  // scala: 5 cm in orizzontale sullo schermo
  const bar = 5 * s, bx = 84, by = SH - 18;
  ctx.strokeStyle = C.muted; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bx, by); ctx.lineTo(bx + bar, by);
  ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by + 4); ctx.moveTo(bx + bar, by - 4); ctx.lineTo(bx + bar, by + 4);
  ctx.stroke();
  text(ctx, '5 cm', bx + bar / 2, by - 10, { size: 9, color: C.muted, mono: true });

  let title = `Vista 3D · in azzurro il piano della sezione ${xz ? 'xz' : 'xy'} · trascina per ruotare, rotella per lo zoom`;
  ctx.font = '11px DM Sans, sans-serif';
  if (14 + ctx.measureText(title).width > SW - 14) title = 'Vista 3D · trascina per ruotare';
  text(ctx, title, 14, 14, { size: 11, color: C.muted, align: 'left' });
  drawLegend(SW - 150, 34, [['●', C.amber, 'cariche: verso di I'], ['→', C.line, 'linea di campo B']]);
}

// ── Grafici ──────────────────────────────────────────────────────────────────
function onAxisTheory(z) {      // z in cm → T
  const I = P.I;
  if (P.src === 'loop') { const a = cm(P.R), zz = cm(z); return MU0 * I * a * a / (2 * (a * a + zz * zz) ** 1.5); }
  if (P.src === 'square') {
    const l = cm(P.side), zz = cm(z);
    return MU0 * I * l * l / (2 * Math.PI * (zz * zz + l * l / 4) * Math.sqrt(zz * zz + l * l / 2));
  }
  if (P.src === 'solenoid') {
    const n = P.solN / cm(P.solL), a = cm(P.solR), zp = cm(z + P.solL / 2), zm = cm(z - P.solL / 2);
    return MU0 * n * I / 2 * (zp / Math.hypot(a, zp) - zm / Math.hypot(a, zm));
  }
  return 0;
}
function niceFull(v) {
  const p = 10 ** Math.floor(Math.log10(v)), m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

function plotFrame(x0, y0, w, h, title, xr, yr, xLabel, yFmt, yStep = (yr[1] - yr[0]) / 4) {
  card(gctx, x0, y0, w, h, title);
  const L = x0 + 54, R = x0 + w - 12, T = y0 + 30, B = y0 + h - 24;
  const X = x => L + (x - xr[0]) / (xr[1] - xr[0]) * (R - L);
  const Y = y => B - (y - yr[0]) / (yr[1] - yr[0]) * (B - T);
  gctx.lineWidth = 1;
  for (let yv = yr[0]; yv <= yr[1] + yStep * 1e-6; yv += yStep) {
    gctx.strokeStyle = Math.abs(yv) < 1e-15 ? C.muted : C.grid;
    gctx.beginPath(); gctx.moveTo(L, Y(yv)); gctx.lineTo(R, Y(yv)); gctx.stroke();
    text(gctx, yFmt(yv), L - 5, Y(yv), { size: 9, color: C.muted, align: 'right', mono: true });
  }
  for (let xv = xr[0]; xv <= xr[1] + 1e-9; xv += 5) {
    text(gctx, String(Math.round(xv)), X(xv), B + 10, { size: 9, color: C.muted, mono: true });
  }
  text(gctx, xLabel, R, y0 + 14, { size: 9.5, color: C.muted, align: 'right' });
  return { L, R, T, B, X, Y };
}
function curve(f, fn, xr, color, width, dash = []) {
  gctx.save();
  gctx.beginPath(); gctx.rect(f.L, f.T - 2, f.R - f.L, f.B - f.T + 4); gctx.clip();
  gctx.strokeStyle = color; gctx.lineWidth = width; gctx.setLineDash(dash);
  gctx.beginPath();
  let pen = false;
  for (let i = 0; i <= 400; i++) {
    const x = xr[0] + (xr[1] - xr[0]) * i / 400, y = fn(x);
    if (!Number.isFinite(y)) { pen = false; continue; }
    const px = f.X(x), py = f.Y(y);
    pen ? gctx.lineTo(px, py) : gctx.moveTo(px, py); pen = true;
  }
  gctx.stroke(); gctx.restore();
}
function legendRow(x, y, items) {
  let cx = x;
  for (const [col, lbl, dash] of items) {
    gctx.strokeStyle = col; gctx.lineWidth = 2; gctx.setLineDash(dash || []);
    gctx.beginPath(); gctx.moveTo(cx, y); gctx.lineTo(cx + 16, y); gctx.stroke(); gctx.setLineDash([]);
    text(gctx, lbl, cx + 20, y, { size: 9.5, color: C.muted, align: 'left' });
    gctx.font = '9.5px DM Sans, sans-serif';
    cx += 30 + gctx.measureText(lbl).width;
  }
}

function drawGraphs() {
  gctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  gctx.fillStyle = C.panel; gctx.fillRect(0, 0, GW, GH);
  if (GW < 100 || GH < 80) return;
  const two = GW >= 640, w1 = two ? Math.floor((GW - 18) / 2) : GW - 12;
  const fs = SOURCES[P.src].fs, unitB = fs >= 1e-3 ? [1e3, 'mT'] : [1e6, 'μT'];
  // etichette con i decimali che servono davvero (passo = fondo scala / 4)
  const dec = Math.max(0, Math.ceil(-Math.log10(fs * unitB[0] / 4) + 0.01));
  const yB = v => fmt(Math.abs(v) < fs * 1e-6 ? 0 : v * unitB[0], dec);

  if (P.src === 'wire' || P.src === 'toroid') {
    // 1) B in funzione della distanza dal centro
    const xr = [0, VIEW], f = plotFrame(6, 6, w1, GH - 12, `B in funzione della distanza r (${unitB[1]})`, xr, [0, fs], 'r (cm)', yB);
    curve(f, r => Math.hypot(...fieldUV(r, 0)), xr, C.accent, 2.2);
    if (P.src === 'wire') legendRow(f.L + 8, f.T + 8, [[C.accent, 'B = μ₀I / 2πr']]);
    else {
      const a = torA();
      for (const r of [P.torR - a, P.torR + a]) { gctx.strokeStyle = C.muted; gctx.setLineDash([3, 3]); gctx.beginPath(); gctx.moveTo(f.X(r), f.T); gctx.lineTo(f.X(r), f.B); gctx.stroke(); }
      gctx.setLineDash([]);
      legendRow(f.L + 8, f.T + 8, [[C.accent, 'B = μ₀NI / 2πr dentro, 0 fuori']]);
    }
    if (!two) return;
    // 2) Legge di Ampère: circuitazione di B lungo una circonferenza di raggio r, divisa per μ₀
    const Imax = P.src === 'wire' ? 12 : niceFull(1.15 * P.torN * I_MAX);
    const f2 = plotFrame(12 + w1, 6, w1, GH - 12, 'Legge di Ampère: ∮B·dl / μ₀ (A)', xr, [0, Imax], 'r (cm)', v => fmt(v, 0));
    curve(f2, r => Math.hypot(...fieldUV(r, 0)) * 2 * Math.PI * cm(r) / MU0, [0.05, VIEW], C.amber, 2.2);
    legendRow(f2.L + 8, f2.T + 8, [[C.amber, P.src === 'wire' ? 'corrente concatenata = I' : 'concatenata: 0, poi N·I, poi 0']]);
    return;
  }

  // spire e solenoide
  const zr = [-VIEW, VIEW];
  const f = plotFrame(6, 6, w1, GH - 12, `B lungo l'asse z (${unitB[1]})`, zr, [0, fs], 'z (cm)', yB);
  curve(f, z => onAxisTheory(z), zr, C.muted, 1.5, [5, 4]);
  curve(f, z => fieldUV(0, z)[1], zr, C.accent, 2.2);
  legendRow(f.L + 8, f.T + 8, [[C.accent, 'calcolato (Biot–Savart)'], [C.muted, P.src === 'solenoid' ? 'solenoide continuo' : 'formula sull\'asse', [5, 4]]]);
  if (P.src === 'solenoid') {
    const ideal = MU0 * P.solN * P.I / cm(P.solL);
    gctx.strokeStyle = C.green; gctx.setLineDash([2, 3]);
    gctx.beginPath(); gctx.moveTo(f.X(-P.solL / 2), f.Y(ideal)); gctx.lineTo(f.X(P.solL / 2), f.Y(ideal)); gctx.stroke(); gctx.setLineDash([]);
    text(gctx, 'μ₀NI/L', f.X(P.solL / 2) + 4, f.Y(ideal), { size: 9, color: C.green, align: 'left' });
  }
  if (!two) return;
  const f2 = plotFrame(12 + w1, 6, w1, GH - 12, `Componente Bz lungo il diametro, z = 0 (${unitB[1]})`, zr, [-fs / 2, fs], 'x (cm)', yB, fs / 4);
  const rin = P.src === 'loop' ? P.R : P.src === 'square' ? P.side / 2 : P.solR;
  for (const s of [-1, 1]) {
    gctx.strokeStyle = C.red; gctx.globalAlpha = 0.5; gctx.setLineDash([3, 3]);
    gctx.beginPath(); gctx.moveTo(f2.X(s * rin), f2.T); gctx.lineTo(f2.X(s * rin), f2.B); gctx.stroke();
  }
  gctx.setLineDash([]); gctx.globalAlpha = 1;
  curve(f2, x => (Math.abs(Math.abs(x) - rin) < 0.15 ? NaN : fieldUV(x, 0)[1]), zr, C.accent, 2.2);
  legendRow(f2.L + 8, f2.T + 8, [[C.accent, 'fuori dalle spire B si inverte'], [C.red, 'conduttore', [3, 3]]]);
}

// ── Readout ──────────────────────────────────────────────────────────────────
const readout = new Lab.Readout(readoutEl, [
  { key: 'calc',   label: 'B CALCOLATO' },
  { key: 'theory', label: 'FORMULA' },
  { key: 'probe',  label: 'SONDA (MOUSE)' },
]);
function updateReadout() {
  let where, calc, th, thLbl;
  if (P.src === 'wire') { where = 'a r = 5 cm'; calc = Math.hypot(...fieldUV(5, 0)); th = MU0 * P.I / (2 * Math.PI * 0.05); thLbl = 'μ₀I/2πr'; }
  else if (P.src === 'toroid') { where = 'a r = R'; calc = Math.hypot(...fieldUV(P.torR, 0)); th = MU0 * P.torN * P.I / (2 * Math.PI * cm(P.torR)); thLbl = 'μ₀NI/2πR'; }
  else if (P.src === 'loop') { where = 'al centro'; calc = fieldUV(0, 0)[1]; th = MU0 * P.I / (2 * cm(P.R)); thLbl = 'μ₀I/2R'; }
  else if (P.src === 'square') { where = 'al centro'; calc = fieldUV(0, 0)[1]; th = 2 * Math.SQRT2 * MU0 * P.I / (Math.PI * cm(P.side)); thLbl = '2√2μ₀I/πℓ'; }
  else { where = 'al centro'; calc = fieldUV(0, 0)[1]; th = MU0 * P.solN * P.I / cm(P.solL); thLbl = 'μ₀NI/L (ideale)'; }
  readout.set('calc', `${fmtB(calc)} ${where}`);
  readout.set('theory', `${thLbl} = ${fmtB(th)}`);
  if (probe) {
    const b = fieldUV(probe[0], probe[1]);
    readout.set('probe', `${fmtB(Math.hypot(b[0], b[1]))} in (${fmt(probe[0], 1)}; ${fmt(probe[1], 1)}) cm`);
  } else readout.set('probe', P.view === '3d' ? 'nella sezione 2D' : 'muovi il mouse sulla sezione');
}

// ── Disegno ──────────────────────────────────────────────────────────────────
let pending = false;
function draw() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    C = getColors();
    ensureCaches();
    drawScene();
    drawGraphs();
    updateReadout();
  });
}

// animazione della vista 3D: rotazione automatica e cariche in moto
let lastTs = 0, drag = null;
function tick(ts) {
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
  lastTs = ts;
  if (P.view === '3d' && !document.hidden && !pending && C.bg) {
    animT += dt;
    if (P.spin && !drag) cam.yaw += dt * 0.22;
    ensureCaches();
    drawScene();
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

canvas.addEventListener('pointerdown', e => {
  if (P.view !== '3d') return;
  drag = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
  canvas.style.cursor = 'grabbing';
});
canvas.addEventListener('pointermove', e => {
  if (!drag) return;
  cam.yaw -= (e.clientX - drag.x) * 0.008;
  cam.el = Math.max(-1.5, Math.min(1.5, cam.el + (e.clientY - drag.y) * 0.008));
  drag = { x: e.clientX, y: e.clientY };
});
const endDrag = () => { drag = null; canvas.style.cursor = P.view === '3d' ? 'grab' : ''; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', e => {
  if (P.view !== '3d') return;
  e.preventDefault();
  cam.zoom = Math.max(0.6, Math.min(3, cam.zoom * Math.exp(-e.deltaY * 0.0012)));
}, { passive: false });
canvas.addEventListener('dblclick', () => { if (P.view === '3d') { cam.yaw = -0.6; cam.el = 0.38; cam.zoom = 1; } });

canvas.addEventListener('mousemove', e => {
  if (P.view === '3d') return;
  const r = canvas.getBoundingClientRect();
  const u = (e.clientX - r.left - plot.x0) / plot.s, v = -(e.clientY - r.top - plot.y0) / plot.s;
  probe = Math.abs(u) <= VIEW && Math.abs(v) <= VIEW ? [u, v] : null;
  draw();
});
canvas.addEventListener('mouseleave', () => { probe = null; draw(); });

// ── Controlli ────────────────────────────────────────────────────────────────
const geo = {};
const NOTES = {
  wire: 'Le linee sono <b>circonferenze</b> attorno al filo. B = μ₀I/2πr cala come 1/r: per questo i cerchi sono sempre più distanziati.',
  loop: 'Vicino al filo le linee girano attorno al conduttore; al centro il campo è quello di un piccolo <b>magnete</b>: entra da sotto ed esce da sopra.',
  square: 'Lontano dalla spira il campo è quasi uguale a quello della spira circolare: conta soprattutto l\'area e la corrente (il <b>momento magnetico</b>).',
  solenoid: 'Dentro il solenoide le linee sono quasi <b>parallele ed equidistanti</b>: campo uniforme, B ≈ μ₀NI/L. Fuori il campo è debole.',
  toroid: 'Il campo esiste solo <b>dentro</b> il toroide: una circonferenza esterna concatena correnti uguali e opposte, quindi B = 0 (legge di Ampère).',
};
let noteEl = null;

function changed() { draw(); }
let spinCtl = null;
function updateVisibility() {
  spinCtl.el.style.display = P.view === '3d' ? '' : 'none';
  canvas.style.cursor = P.view === '3d' ? 'grab' : '';
  for (const [k, s] of Object.entries(geo)) s.el.style.display = s.srcs.includes(P.src) ? '' : 'none';
  noteEl.innerHTML = NOTES[P.src];
}

function buildControls() {
  const panel = document.getElementById('controls');

  const secS = Lab.Section('Sorgente');
  secS.add(Lab.RadioGroup({
    label: 'Sorgente',
    options: Object.entries(SOURCES).map(([value, s]) => ({ value, label: s.label })),
    value: P.src,
    onChange(v) { P.src = v; updateVisibility(); changed(); },
  }));
  noteEl = document.createElement('div');
  noteEl.className = 'cr-note';
  secS.add(noteEl);
  panel.appendChild(secS.el);

  const secP = Lab.Section('Corrente e geometria');
  secP.add(Lab.Slider({ label: 'Corrente I', min: 0.5, max: I_MAX, value: P.I, step: 0.5, unit: ' A', onChange(v) { P.I = v; changed(); } }));
  const add = (key, srcs, opts) => {
    const s = Lab.Slider({ ...opts, onChange(v) { P[key] = v; changed(); } });
    s.srcs = srcs; geo[key] = s; secP.add(s);
  };
  add('R', ['loop'], { label: 'Raggio R', min: 2, max: 8, value: P.R, step: 0.5, unit: ' cm' });
  add('side', ['square'], { label: 'Lato ℓ', min: 4, max: 16, value: P.side, step: 0.5, unit: ' cm' });
  add('solR', ['solenoid'], { label: 'Raggio R', min: 1, max: 6, value: P.solR, step: 0.5, unit: ' cm' });
  add('solL', ['solenoid'], { label: 'Lunghezza L', min: 4, max: 24, value: P.solL, step: 1, unit: ' cm' });
  add('solN', ['solenoid'], { label: 'Spire N', min: 2, max: 40, value: P.solN, step: 1 });
  add('torR', ['toroid'], { label: 'Raggio medio R', min: 4, max: 10, value: P.torR, step: 0.5, unit: ' cm' });
  add('tora', ['toroid'], { label: 'Raggio della sezione a', min: 1, max: 3, value: P.tora, step: 0.25, unit: ' cm' });
  add('torN', ['toroid'], { label: 'Spire N', min: 10, max: 200, value: P.torN, step: 10 });
  panel.appendChild(secP.el);

  const secV = Lab.Section('Visualizzazione');
  secV.add(Lab.RadioGroup({
    label: 'Vista',
    options: [{ value: '3d', label: 'Vista 3D', hint: 'ruotabile' }, { value: '2d', label: 'Sezione 2D', hint: 'con sonda' }],
    value: P.view,
    onChange(v) { P.view = v; probe = null; updateVisibility(); changed(); },
  }));
  spinCtl = Lab.Toggle({ label: 'Rotazione automatica', value: P.spin, onChange(v) { P.spin = v; } });
  secV.add(spinCtl);
  secV.add(Lab.Toggle({ label: 'Linee di campo', value: P.lines, onChange(v) { P.lines = v; changed(); } }));
  secV.add(Lab.Slider({ label: 'Numero di linee', min: 4, max: 24, value: P.nLines, step: 2, onChange(v) { P.nLines = v; changed(); } }));
  secV.add(Lab.Toggle({ label: 'Mappa dell\'intensità |B|', value: P.heat, onChange(v) { P.heat = v; changed(); } }));
  const vNote = document.createElement('div');
  vNote.className = 'cr-note';
  vNote.innerHTML = 'Fra due linee vicine passa sempre lo <b>stesso flusso</b>: dove sono fitte il campo è più intenso. I colori usano una scala logaritmica fissa. In 3D la mappa è stesa sul piano della sezione e i punti luminosi sul conduttore si muovono nel verso della corrente.';
  secV.add(vNote);
  panel.appendChild(secV.el);

  updateVisibility();
}

new MutationObserver(() => draw()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
new ResizeObserver(resize).observe(canvas.parentElement);
Lab.initTheme();
buildControls();
resize();
