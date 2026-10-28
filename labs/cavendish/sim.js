'use strict';

// ═══ Costanti fisiche ═════════════════════════════════════════════════════════
const TWO = Math.PI * 2;
const G_CONST = 6.674e-11;                              // costante di gravitazione universale, N·m²/kg²
const KE_CONST = 8.9875e9;                               // costante di Coulomb, N·m²/C²
const COL = ['#00d4ff', '#ff9d4d'];
const FCOL = { g: '#00d4ff', e: '#ff5d9e' };
// distanza di "contatto" fisico fra le sfere: usata come pavimento OVUNQUE si calcoli d,
// non solo come controllo a posteriori — così la forza (e quindi l'accelerazione angolare)
// non può mai superare il valore che ha al contatto, il momento torcente resta limitato e
// l'equilibrio con κθ esiste sempre, senza bisogno di irrigidire l'integratore vicino al
// contatto (che altrimenti "salterebbe oltre" la barriera in un solo passo RK4)
const D_CONTACT = 0.015;

const P = {
  mode: '2d',                                             // '2d' | '3d'
  M: 10, m: 0.02, L: 0.1, d0: 0.05,                       // masse (kg), braccio e distanza minima (m)
  qM: 0, qm: 0,                                           // cariche elettriche (nC)
  kappa: 10,                                              // costante di torsione del filo (×10⁻⁹ N·m/rad)
  damping: 0.35,                                          // frazione dello smorzamento critico
  showOptical: true,
  speed: 1.0,
  paused: false,
};

let theta = 0, omega = 0, tSim = 0, last = 0;
let hist = [];
// finestra del grafico θ(t): una bilancia di torsione reale oscilla MOLTO lentamente (il periodo
// naturale T=2π√(I/κ) può arrivare a decine di minuti con κ piccolo) — una finestra fissa a 30s
// mostrerebbe solo una riga piatta nel caso di sola gravità. Va quindi ricalcolata insieme alla
// scala verticale, non lasciata fissa a un valore arbitrario.
let WIN_T = 30;
// scala del grafico θ(t): FISSA durante l'evoluzione temporale (non dipende dal θ istantaneo,
// altrimenti l'effetto della crescita sparirebbe — vedi lezione sugli assi fissi), ma viene
// RICALCOLATA quando l'utente cambia un parametro fisico (stesso pattern di universe-expansion
// per l'asse di a(t)): senza questo, con gravità pura (θ_eq~0.001°) il grafico sembra una riga
// piatta perché il range fisso non ha alcuna relazione con i valori tipici raggiungibili.
let THETA_MAX_GRAPH = 0.01;
let G = {};
let gCanvas = [null, null, null], gCtx = [null, null, null], gTitle = [null, null, null];
let readout;
let updateCursorUI = () => {};                            // assegnata in init(); richiamabile anche da buildControls()

// ═══ Palette ══════════════════════════════════════════════════════════════════
function dk() { return document.documentElement.dataset.theme !== 'light'; }
function pal() {
  const d = dk();
  return {
    bg:     d ? '#06090f' : '#e7edf4',
    txt:    d ? 'rgba(225,238,250,0.96)' : 'rgba(20,40,70,0.95)',
    sub:    d ? 'rgba(165,195,220,0.82)' : 'rgba(60,90,125,0.9)',
    accent: d ? '#00d4ff' : '#0a78b0',
    ring:   d ? 'rgba(150,175,205,0.4)' : 'rgba(60,95,130,0.45)',
    grid:   d ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)',
    gBg:    d ? 'rgb(3,9,22)' : '#eef2f7',
    gAxis:  d ? 'rgba(100,155,210,0.3)' : 'rgba(40,80,130,0.32)',
    gText:  d ? 'rgba(150,205,225,0.88)' : 'rgba(25,65,105,0.92)',
  };
}
let T = pal();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const fmtSci = (x, u) => (x === 0 ? '0' : Lab.sci(x, 3)) + (u || '');

// ═══ Fisica ═══════════════════════════════════════════════════════════════════
// Bilancia di torsione: due masse piccole m su un'asta di semi-lunghezza L, sospese al
// centro da un filo di torsione. Due masse grandi M fisse, posizionate in diagonale
// (stessa configurazione del vero esperimento di Cavendish) così le due coppie
// producono momento torcente nello stesso verso. Oltre alla gravità, le masse possono
// essere cariche elettricamente: la forza di Coulomb si somma (con segno) a quella
// gravitazionale, sempre lungo la congiungente delle due masse.
function pairState(th) {
  const p1 = { x: P.L * Math.cos(th), y: P.L * Math.sin(th) };
  const M1 = { x: P.L, y: P.d0 };
  const dx = M1.x - p1.x, dy = M1.y - p1.y;
  const d = Math.max(Math.hypot(dx, dy), D_CONTACT);
  const ux = dx / d, uy = dy / d;
  const Fg = G_CONST * P.M * P.m / (d * d);               // sempre attrattiva
  const qMc = P.qM * 1e-9, qmc = P.qm * 1e-9;
  const Fe = KE_CONST * qMc * qmc / (d * d);               // >0 se cariche concordi (repulsiva), <0 se discordi (attrattiva)
  const Fnet = Fg - Fe;                                    // netto lungo la direzione "verso M1" (positivo = attrazione)
  const Fx = Fnet * ux, Fy = Fnet * uy;
  const tau1 = p1.x * Fy - p1.y * Fx;
  return { p1, M1, d, Fg, Fe, tau: 2 * tau1 };              // ×2: il secondo braccio raddoppia per simmetria
}
function angAccel(th, om) {
  const st = pairState(th);
  const I = 2 * P.m * P.L * P.L;
  const kappaSI = P.kappa * 1e-9;
  const bCoef = P.damping * 2 * Math.sqrt(kappaSI * I);    // smorzamento come frazione di quello critico
  return (st.tau - kappaSI * th - bCoef * om) / I;
}
// distanza minima fra la massa piccola p1 e una delle due masse grandi, qualunque sia il
// verso di rotazione — serve a impedire che le sfere si compenetrino (vedi step())
function minApproachDist(th) {
  const p1 = { x: P.L * Math.cos(th), y: P.L * Math.sin(th) };
  const M1 = { x: P.L, y: P.d0 }, M2 = { x: -P.L, y: -P.d0 };
  return Math.min(Math.hypot(M1.x - p1.x, M1.y - p1.y), Math.hypot(M2.x - p1.x, M2.y - p1.y));
}
// stima (per bisezione, statica: ignora inerzia e smorzamento) l'angolo di equilibrio
// τ_ext(θ)=κθ per i parametri correnti — serve solo a dimensionare il grafico θ(t)
function estimateEquilibriumTheta() {
  const kappaSI = P.kappa * 1e-9;
  const g = th => pairState(th).tau - kappaSI * th;
  const upper = 170 * Math.PI / 180;
  if (g(0) <= 0) return 0.002 * Math.PI / 180;              // già a riposo: valore minimo per non azzerare la scala
  if (g(upper) > 0) return upper;                            // il momento resta dominante fino al fine-corsa
  let lo = 0, hi = upper;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (g(mid) > 0) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
function updateThetaGraphRange() {
  THETA_MAX_GRAPH = clamp(estimateEquilibriumTheta() * 1.7, 0.0005, Math.PI);
  const I = 2 * P.m * P.L * P.L, kappaSI = P.kappa * 1e-9;
  const period = TWO * Math.sqrt(I / kappaSI);              // periodo naturale non smorzato, s
  WIN_T = clamp(period * 2.4, 4, 400);
}
function rk4(th, om, dt) {
  const f = (t, o) => [o, angAccel(t, o)];
  const [k1t, k1o] = f(th, om);
  const [k2t, k2o] = f(th + k1t * dt / 2, om + k1o * dt / 2);
  const [k3t, k3o] = f(th + k2t * dt / 2, om + k2o * dt / 2);
  const [k4t, k4o] = f(th + k3t * dt, om + k3o * dt);
  return { th: th + dt / 6 * (k1t + 2 * k2t + 2 * k3t + k4t), om: om + dt / 6 * (k1o + 2 * k2o + 2 * k3o + k4o) };
}
function trimHist() { const tMin = tSim - WIN_T - 1; while (hist.length && hist[0].t < tMin) hist.shift(); }
function step(dt) {
  const nSub = clamp(Math.round(dt * 500), 1, 60), h = dt / nSub;
  for (let s = 0; s < nSub; s++) {
    const r = rk4(theta, omega, h);
    if (minApproachDist(r.th) < D_CONTACT) { omega = 0; break; }   // le sfere si toccherebbero: si ferma qui, come un urto anelastico contro un fine-corsa
    theta = r.th; omega = r.om;
  }
  tSim += dt;
  hist.push({ t: tSim, th: theta }); trimHist();
}
function reset() { theta = 0; omega = 0; tSim = 0; hist = []; updateThetaGraphRange(); }

// ═══ Rendering ════════════════════════════════════════════════════════════════
function drawGrid(ctx, W, H) {
  ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}
const LASER_COL = '#ff3050';
function drawArrow(ctx, x0, y0, x1, y1, col, lw) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy); if (len < 3) return;
  const ux = dx / len, uy = dy / len, hl = Math.min(9, len * 0.35);
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - ux * hl, y1 - uy * hl); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - ux * hl - uy * hl * 0.5, y1 - uy * hl + ux * hl * 0.5);
  ctx.lineTo(x1 - ux * hl + uy * hl * 0.5, y1 - uy * hl - ux * hl * 0.5);
  ctx.closePath(); ctx.fill();
}
function drawChargeBadge(ctx, x, y, q, r) {
  if (Math.abs(q) < 1e-9) return;
  ctx.fillStyle = q > 0 ? 'rgba(255,90,90,0.9)' : 'rgba(90,160,255,0.9)';
  ctx.beginPath(); ctx.arc(x, y - r - 9, 6, 0, TWO); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(x - 3, y - r - 9); ctx.lineTo(x + 3, y - r - 9); ctx.stroke();
  if (q > 0) { ctx.beginPath(); ctx.moveTo(x, y - r - 12); ctx.lineTo(x, y - r - 6); ctx.stroke(); }
}
// sfera con ombreggiatura radiale (luce da alto-sinistra), senza contorno — solo il volume pieno
function drawSphere(ctx, x, y, r, hi, base) {
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = r * 0.5; ctx.shadowOffsetY = r * 0.15;
  const grad = ctx.createRadialGradient(x - r * 0.38, y - r * 0.4, r * 0.1, x, y, r * 1.05);
  grad.addColorStop(0, hi); grad.addColorStop(1, base);
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, r, 0, TWO); ctx.fill();
  ctx.restore();
}
function sphereRadii() {
  return { rm: clamp(6 + 5.5 * Math.cbrt(P.m / 0.02), 6, 22), rM: clamp(10 + 8 * Math.cbrt(P.M / 10), 10, 34) };
}
// fascio laser con alone (tre tratti sovrapposti, largo-trasparente → stretto-brillante)
function drawLaser(ctx, x0, y0, x1, y1, col) {
  ctx.save(); ctx.lineCap = 'round';
  ctx.strokeStyle = col; ctx.globalAlpha = 0.14; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.globalAlpha = 0.4; ctx.lineWidth = 3.2;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.globalAlpha = 1; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.restore();
}
// indicatore di distanza (linea tratteggiata + etichetta), offset perpendicolare per non
// sovrapporsi alle frecce delle forze
function drawDistanceLabel(ctx, x0, y0, x1, y1, label) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, off = 16;
  const ax = x0 + nx * off, ay = y0 + ny * off, bx = x1 + nx * off, by = y1 + ny * off;
  ctx.strokeStyle = 'rgba(200,215,235,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(ax, ay); ctx.moveTo(x1, y1); ctx.lineTo(bx, by); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText(label, (ax + bx) / 2, (ay + by) / 2 - 5);
}

function draw(canvas) {
  const [ctx, W, H] = Lab.ctx2d(canvas);
  T = pal();
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
  drawGrid(ctx, W, H);
  if (P.mode === '3d') draw3D(ctx, W, H); else draw2D(ctx, W, H);
  drawHeaderFooter(ctx, W, H);
}

function draw2D(ctx, W, H) {
  const st = pairState(theta);
  const cx = W * 0.44, cy = H * 0.5;
  const extent = P.L + P.d0 + 0.06;
  const scale = clamp(Math.min(W * 0.58, H * 0.8) / (extent * 2.3), 300, 2600);
  const toS = (x, y) => ({ x: cx + x * scale, y: cy - y * scale });

  // leva ottica: specchio al centro + fascio laser fino a uno schermo graduato, con margine
  // sufficiente perché testo e schermo restino sempre dentro il canvas
  if (P.showOptical) {
    const mirror = toS(0, 0);
    const screenX = clamp(cx - Math.min(cx - 70, 230), 60, cx - 90);
    const beamAng = 2 * theta;                              // la riflessione raddoppia l'angolo di rotazione
    const beamLen = mirror.x - screenX;
    const ex = mirror.x - Math.cos(beamAng) * beamLen, ey = mirror.y - Math.sin(beamAng) * beamLen * 0.4;
    drawLaser(ctx, mirror.x, mirror.y, ex, ey, LASER_COL);
    // specchietto sul perno centrale, orientato con l'asta
    ctx.save(); ctx.translate(mirror.x, mirror.y); ctx.rotate(-theta);
    ctx.fillStyle = dk() ? '#dfe8f2' : '#334'; ctx.fillRect(-7, -1.6, 14, 3.2);
    ctx.restore();
    // schermo graduato
    ctx.strokeStyle = T.ring; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(screenX, mirror.y - 55); ctx.lineTo(screenX, mirror.y + 55); ctx.stroke();
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(screenX - 4, mirror.y + k * 20); ctx.lineTo(screenX + 4, mirror.y + k * 20); ctx.stroke(); }
    ctx.save(); ctx.shadowColor = LASER_COL; ctx.shadowBlur = 10;
    ctx.fillStyle = LASER_COL; ctx.beginPath(); ctx.arc(screenX, clamp(ey, mirror.y - 55, mirror.y + 55), 3.6, 0, TWO); ctx.fill();
    ctx.restore();
    ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
    ctx.fillText('schermo', screenX, mirror.y - 62);
    ctx.fillText('laser (∝2θ)', (mirror.x + screenX) / 2, mirror.y - 14);
  }

  // asta: trave con leggero rilievo invece di una semplice linea
  const p1s = toS(st.p1.x, st.p1.y), p2s = toS(-st.p1.x, -st.p1.y), c0 = toS(0, 0);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(p1s.x, p1s.y + 1.5); ctx.lineTo(p2s.x, p2s.y + 1.5); ctx.stroke();
  ctx.strokeStyle = COL[0]; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(p1s.x, p1s.y); ctx.lineTo(p2s.x, p2s.y); ctx.stroke();
  ctx.lineCap = 'butt';
  // perno / testa di torsione
  ctx.fillStyle = T.ring; ctx.beginPath(); ctx.arc(c0.x, c0.y, 6, 0, TWO); ctx.fill();
  ctx.strokeStyle = dk() ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(c0.x, c0.y, 6, 0, TWO); ctx.stroke();
  ctx.beginPath(); ctx.arc(c0.x, c0.y, 2, 0, TWO); ctx.stroke();

  const { rm, rM } = sphereRadii();
  const M1s = toS(st.M1.x, st.M1.y), M2s = toS(-st.M1.x, -st.M1.y);
  [p1s, p2s].forEach(p => { drawSphere(ctx, p.x, p.y, rm, '#9be9ff', '#0091b8'); drawChargeBadge(ctx, p.x, p.y, P.qm, rm); });
  [M1s, M2s].forEach(p => { drawSphere(ctx, p.x, p.y, rM, dk() ? '#e4e8ef' : '#c9ced8', dk() ? '#565c68' : '#3d434f'); drawChargeBadge(ctx, p.x, p.y, P.qM, rM); });

  drawDistanceLabel(ctx, p1s.x, p1s.y, M1s.x, M1s.y, `d = ${Lab.fmt((st.d * 100),2)} cm`);

  // frecce delle forze (gravità e Coulomb separate) sulla massa 1
  const fScale = clamp(26 / Math.max(st.Fg, Math.abs(st.Fe), 1e-30), 4, 4e9);
  const dirx = (M1s.x - p1s.x), diry = (M1s.y - p1s.y), dlen = Math.hypot(dirx, diry) || 1;
  const ux = dirx / dlen, uy = diry / dlen;
  const gLen = clamp(st.Fg * fScale, 6, 70);
  drawArrow(ctx, p1s.x, p1s.y, p1s.x + ux * gLen, p1s.y + uy * gLen, FCOL.g, 2.4);
  if (Math.abs(st.Fe) > 1e-30) {
    const eSign = st.Fe > 0 ? 1 : -1;                        // >0 repulsiva (si allontana da M1)
    const eLen = clamp(Math.abs(st.Fe) * fScale, 6, 70);
    drawArrow(ctx, p1s.x, p1s.y, p1s.x - eSign * ux * eLen, p1s.y - eSign * uy * eLen, FCOL.e, 2.4);
  }
}

// camera orbitale per la vista prospettica: azimut/elevazione (trascinando) e zoom (rotellina)
const cam = { az: 45 * Math.PI / 180, el: 35.264 * Math.PI / 180, zoom: 1 };
function project3D(x, y, z, cx, cy, S) {
  const ca = Math.cos(cam.az), sa = Math.sin(cam.az);
  const x1 = x * ca - y * sa, y1 = x * sa + y * ca, z1 = z;
  const ce = Math.cos(cam.el), se = Math.sin(cam.el);
  const y2 = y1 * ce - z1 * se, z2 = y1 * se + z1 * ce;
  return { sx: cx + x1 * S, sy: cy - z2 * S, depth: y2 };
}
function draw3D(ctx, W, H) {
  const st = pairState(theta);
  const cx = W * 0.5, cy = H * 0.42;
  const extent = P.L + P.d0 + 0.08;
  const S = clamp(Math.min(W * 0.46, H * 0.62) / (extent * 2.6), 260, 2200) * cam.zoom;
  const zTop = P.L * 1.3, zBase = -0.035;
  const proj = (x, y, z) => project3D(x, y, z, cx, cy, S);

  // piano d'appoggio
  const be = extent * 1.05;
  const b = [proj(-be, -be, zBase), proj(be, -be, zBase), proj(be, be, zBase), proj(-be, be, zBase)];
  ctx.fillStyle = dk() ? 'rgba(50,68,98,0.32)' : 'rgba(150,170,200,0.28)';
  ctx.beginPath(); ctx.moveTo(b[0].sx, b[0].sy); b.slice(1).forEach(p => ctx.lineTo(p.sx, p.sy)); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = T.ring; ctx.lineWidth = 1; ctx.stroke();

  // solo il filo di torsione, appeso da un punto fisso sopra il centro (nessun braccio/cavalletto)
  const fiberTop = proj(0, 0, zTop), fiberBot = proj(0, 0, 0);
  ctx.strokeStyle = dk() ? 'rgba(220,230,245,0.65)' : 'rgba(40,60,90,0.65)'; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(fiberTop.sx, fiberTop.sy); ctx.lineTo(fiberBot.sx, fiberBot.sy); ctx.stroke();
  ctx.fillStyle = T.ring; ctx.beginPath(); ctx.arc(fiberTop.sx, fiberTop.sy, 3, 0, TWO); ctx.fill();

  // piedistalli delle masse grandi (fisse, poggiano sul piano)
  [{ x: st.M1.x, y: st.M1.y }, { x: -st.M1.x, y: -st.M1.y }].forEach(p => {
    const base = proj(p.x, p.y, zBase), top = proj(p.x, p.y, 0);
    ctx.strokeStyle = T.ring; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(base.sx, base.sy); ctx.lineTo(top.sx, top.sy); ctx.stroke();
  });

  // laser (opzionale), nel piano orizzontale, verso uno schermo dietro le masse grandi
  if (P.showOptical) {
    const beamAng = 2 * theta, beamLen = extent * 0.9;
    const screenPt = proj(-Math.cos(beamAng) * beamLen, -Math.sin(beamAng) * beamLen, 0);
    const mirrorPt = proj(0, 0, 0);
    drawLaser(ctx, mirrorPt.sx, mirrorPt.sy, screenPt.sx, screenPt.sy, LASER_COL);
    ctx.save(); ctx.shadowColor = LASER_COL; ctx.shadowBlur = 9;
    ctx.fillStyle = LASER_COL; ctx.beginPath(); ctx.arc(screenPt.sx, screenPt.sy, 3.2, 0, TWO); ctx.fill();
    ctx.restore();
  }

  // asta
  const p1p = proj(st.p1.x, st.p1.y, 0), p2p = proj(-st.p1.x, -st.p1.y, 0);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(p1p.sx, p1p.sy + 1.5); ctx.lineTo(p2p.sx, p2p.sy + 1.5); ctx.stroke();
  ctx.strokeStyle = COL[0]; ctx.lineWidth = 3.2;
  ctx.beginPath(); ctx.moveTo(p1p.sx, p1p.sy); ctx.lineTo(p2p.sx, p2p.sy); ctx.stroke();
  ctx.lineCap = 'butt';

  // sfere ordinate per profondità rispetto alla camera corrente (depth crescente = più lontane)
  const { rm, rM } = sphereRadii();
  const M1proj = proj(st.M1.x, st.M1.y, 0), M2proj = proj(-st.M1.x, -st.M1.y, 0);
  const items = [
    { p: p1p, r: rm, big: false, q: P.qm },
    { p: p2p, r: rm, big: false, q: P.qm },
    { p: M1proj, r: rM, big: true, q: P.qM },
    { p: M2proj, r: rM, big: true, q: P.qM },
  ].sort((a, b) => b.p.depth - a.p.depth);
  items.forEach(it => {
    if (it.big) drawSphere(ctx, it.p.sx, it.p.sy, it.r, dk() ? '#e4e8ef' : '#c9ced8', dk() ? '#565c68' : '#3d434f');
    else drawSphere(ctx, it.p.sx, it.p.sy, it.r, '#9be9ff', '#0091b8');
    drawChargeBadge(ctx, it.p.sx, it.p.sy, it.q, it.r);
  });

  // forza sulla massa 1 (proiettata)
  const fScale = clamp(26 / Math.max(st.Fg, Math.abs(st.Fe), 1e-30), 4, 4e9);
  const dirx = M1proj.sx - p1p.sx, diry = M1proj.sy - p1p.sy, dlen = Math.hypot(dirx, diry) || 1;
  const ux = dirx / dlen, uy = diry / dlen, gLen = clamp(st.Fg * fScale, 6, 60);
  drawArrow(ctx, p1p.sx, p1p.sy, p1p.sx + ux * gLen, p1p.sy + uy * gLen, FCOL.g, 2.2);
  if (Math.abs(st.Fe) > 1e-30) {
    const eSign = st.Fe > 0 ? 1 : -1, eLen = clamp(Math.abs(st.Fe) * fScale, 6, 60);
    drawArrow(ctx, p1p.sx, p1p.sy, p1p.sx - eSign * ux * eLen, p1p.sy - eSign * uy * eLen, FCOL.e, 2.2);
  }

}

function drawHeaderFooter(ctx, W, H) {
  const st = pairState(theta);
  ctx.textAlign = 'left';
  ctx.fillStyle = T.accent; ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.fillText('Bilancia di Cavendish — F = G·M·m/d² ± k_e·q_M·q_m/d²', 14, 22);
  ctx.fillStyle = T.txt; ctx.font = '10px "Space Mono",monospace';
  ctx.fillText(`M=${Lab.fmt(P.M,2)} kg   m=${Lab.fmt(P.m,3)} kg   d=${Lab.fmt((st.d * 100),2)} cm   θ=${Lab.fmt((theta * 180 / Math.PI),3)}°`, 14, 40);
  ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'left';
  ctx.fillText(`F gravità = ${fmtSci(st.Fg, ' N')}   F elettrica = ${fmtSci(st.Fe, ' N')} (${st.Fe > 0 ? 'repulsiva' : (st.Fe < 0 ? 'attrattiva' : '—')})`, 14, 56);

  if (minApproachDist(theta) <= D_CONTACT * 1.05) {
    ctx.fillStyle = FCOL.e; ctx.font = 'bold 11px "Space Mono",monospace'; ctx.textAlign = 'center';
    ctx.fillText('CONTATTO — le sfere si toccano, la rotazione si arresta qui', W / 2, 78);
  }

  ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText(P.mode === '3d'
    ? 'trascina per ruotare la vista, rotellina per zoomare · regola masse e cariche'
    : 'regola masse e cariche e osserva l\'asta ruotare fino all\'equilibrio col filo di torsione', W / 2, H - 8);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
// 1: θ(t) nella finestra WIN_T, con il fondo scala THETA_MAX_GRAPH (ricalcolato quando cambiano
//    i parametri, mai durante il moto)
function drawGraphTheta() {
  const DEG = 180 / Math.PI, t0 = tSim - WIN_T, ym = Lab.niceMax(THETA_MAX_GRAPH * DEG);
  const g = Lab.panel(gCanvas[0], { title: 'Angolo di rotazione θ (°)', xr: [Math.max(0, t0), Math.max(WIN_T, tSim)], yr: [-ym, ym], xLabel: 't (s)', yFmt: v => Lab.sci(v, 2) });
  if (!g) return; const [ctx, f] = g;
  Lab.plotPts(ctx, f, hist.map(p => [p.t, p.th * DEG]), COL[0], 2);
}
// 2: |F| in funzione della distanza, in scala log-log: due rette di pendenza −2 (stessa legge 1/d²)
function drawGraphForceD() {
  const dMax = P.L + P.d0 + 0.05, dMin = D_CONTACT;
  const qMc = P.qM * 1e-9, qmc = P.qm * 1e-9;
  const fgAt = d => G_CONST * P.M * P.m / (d * d), feAt = d => Math.abs(KE_CONST * qMc * qmc) / (d * d);
  const top = 10 ** Math.ceil(Math.log10(Math.max(fgAt(dMin), feAt(dMin), 1e-12)));
  const g = Lab.panel(gCanvas[1], { title: 'Forza fra le sfere (N), scala log', xr: [dMin * 100, dMax * 100], xLog: true, yr: [top * 1e-10, top], yLog: true, xLabel: 'd (cm)', xFmt: v => Lab.fmt(v, 0), yFmt: v => Lab.sci(v, 1) });
  if (!g) return; const [ctx, f] = g;
  Lab.plot(ctx, f, dc => fgAt(dc / 100), [dMin * 100, dMax * 100], FCOL.g, 2);
  if (qMc && qmc) Lab.plot(ctx, f, dc => feAt(dc / 100), [dMin * 100, dMax * 100], FCOL.e, 2);
  const st = pairState(theta);
  Lab.dot(ctx, f, st.d * 100, st.Fg, FCOL.g, 4);
  if (Math.abs(st.Fe) > 0) Lab.dot(ctx, f, st.d * 100, Math.abs(st.Fe), FCOL.e, 4);
  Lab.legend(ctx, f.L + 8, f.T + 8, [[FCOL.g, 'gravitazionale'], [FCOL.e, 'elettrica']]);
}
// 3: confronto diretto, scala log: con cariche anche piccolissime l'elettrica stravince
function drawGraphBars() {
  const st = pairState(theta);
  const vals = [Math.max(st.Fg, 1e-30), Math.max(Math.abs(st.Fe), 1e-30)];
  const top = 10 ** Math.ceil(Math.log10(Math.max(...vals)));
  const ratio = st.Fg > 0 && Math.abs(st.Fe) > 0 ? Math.abs(st.Fe) / st.Fg : null;
  const g = Lab.panel(gCanvas[2], { title: ratio ? `|F| a confronto · elettrica/gravità ≈ ${Lab.sci(ratio, 2)}` : '|F| a confronto (N), scala log', xr: [0, 2], xStep: 9, xFmt: () => '', yr: [top * 1e-12, top], yLog: true, yFmt: v => Lab.sci(v, 1) });
  if (!g) return; const [ctx, f] = g;
  [['gravitazionale', vals[0], FCOL.g], ['elettrica', vals[1], FCOL.e]].forEach(([lbl, v, col], i) => {
    const cx = f.X(i + 0.5), bw = (f.R - f.L) * 0.26, y = f.Y(Math.max(v, top * 1e-12));
    ctx.fillStyle = col; ctx.fillRect(cx - bw / 2, y, bw, f.B - y);
    ctx.font = '9.5px "Space Mono",monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = f.C.title; ctx.fillText(v > 1e-29 ? Lab.sci(v, 3) + ' N' : '0', cx, y - 8);
    ctx.fillStyle = f.C.text; ctx.font = '9.5px "DM Sans",sans-serif'; ctx.fillText(lbl, cx, f.B + 10);
  });
}
function drawGraphs() { drawGraphTheta(); drawGraphForceD(); drawGraphBars(); }

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls() {
  const cont = document.getElementById('controls'); cont.innerHTML = '';

  const smod = Lab.Section('Modalità'); cont.appendChild(smod.el);
  smod.add(Lab.RadioGroup({ label: 'Visualizzazione', value: P.mode,
    options: [{ value: '2d', label: 'Dall\'alto', hint: '2D' }, { value: '3d', label: 'Prospettica', hint: '3D' }],
    onChange(v) { P.mode = v; updateCursorUI(); } }));

  const sm = Lab.Section('Masse'); cont.appendChild(sm.el);
  sm.add(Lab.Slider({ label: 'Massa grande M', min: 0.5, max: 20, step: 0.1, value: P.M, unit: ' kg', onChange(v) { P.M = v; updateThetaGraphRange(); } }));
  sm.add(Lab.Slider({ label: 'Massa piccola m', min: 0.005, max: 0.2, step: 0.005, value: P.m, unit: ' kg', onChange(v) { P.m = v; updateThetaGraphRange(); } }));
  sm.add(Lab.Slider({ label: 'Braccio L', min: 0.05, max: 0.2, step: 0.005, value: P.L, unit: ' m', onChange(v) { P.L = v; updateThetaGraphRange(); } }));
  sm.add(Lab.Slider({ label: 'Distanza minima d₀', min: 0.02, max: 0.2, step: 0.005, value: P.d0, unit: ' m', onChange(v) { P.d0 = v; updateThetaGraphRange(); } }));

  const sq = Lab.Section('Cariche elettriche'); cont.appendChild(sq.el);
  sq.add(Lab.Slider({ label: 'Carica massa grande q_M', min: -2000, max: 2000, step: 10, value: P.qM, unit: ' nC', onChange(v) { P.qM = v; updateThetaGraphRange(); } }));
  sq.add(Lab.Slider({ label: 'Carica massa piccola q_m', min: -2000, max: 2000, step: 10, value: P.qm, unit: ' nC', onChange(v) { P.qm = v; updateThetaGraphRange(); } }));

  const st = Lab.Section('Bilancia di torsione'); cont.appendChild(st.el);
  st.add(Lab.Slider({ label: 'Costante di torsione κ', min: 1, max: 100, step: 1, value: P.kappa, unit: ' ×10⁻⁹ N·m/rad', onChange(v) { P.kappa = v; updateThetaGraphRange(); } }));
  st.add(Lab.Slider({ label: 'Smorzamento', min: 0, max: 1, step: 0.05, value: P.damping, unit: '', onChange(v) { P.damping = v; } }));

  const sv = Lab.Section('Visualizzazione'); cont.appendChild(sv.el);
  sv.add(Lab.Toggle({ label: 'Leva ottica laser', value: P.showOptical, onChange(v) { P.showOptical = v; } }));
  sv.add(Lab.Slider({ label: 'Velocità simulazione', min: 0.2, max: 10, step: 0.1, value: P.speed, unit: '×', onChange(v) { P.speed = v; } }));
}

function buildReadout() {
  const cont = document.getElementById('readout'); cont.innerHTML = '';
  readout = new Lab.Readout(cont, [
    { key: 't', label: 'Tempo' },
    { key: 'theta', label: 'Angolo θ' },
    { key: 'Fg', label: 'Forza gravità' },
    { key: 'Fe', label: 'Forza elettrica' },
    { key: 'ratio', label: 'F_e / F_g' },
  ]);
}

function initGraphs(){
  // riga di grafici standard (Lab.graphPanels); i titoli sono disegnati dentro i grafici
  gCanvas = Lab.graphPanels(document.getElementById('graphArea'), 3);
  gCtx = gCanvas.map(c => c.getContext('2d'));
  gTitle = gCanvas.map(() => ({ textContent: '' }));
}

// ═══ Init ═════════════════════════════════════════════════════════════════════
function init() {
  Lab.initTheme();
  buildControls(); initGraphs(); buildReadout(); updateThetaGraphRange();
  const simCanvas = document.getElementById('simCanvas');
  const btnPlay = document.getElementById('btnPlay');
  function syncPlay() { btnPlay.textContent = P.paused ? '▶  AVVIA' : '⏸  PAUSA'; }
  syncPlay();
  btnPlay.addEventListener('click', () => { P.paused = !P.paused; syncPlay(); });
  document.getElementById('btnReset').addEventListener('click', () => {
    P.mode = '2d'; P.M = 10; P.m = 0.02; P.L = 0.1; P.d0 = 0.05; P.qM = 0; P.qm = 0;
    P.kappa = 10; P.damping = 0.35; P.showOptical = true; P.speed = 1.0; P.paused = false;
    cam.az = 45 * Math.PI / 180; cam.el = 35.264 * Math.PI / 180; cam.zoom = 1;
    reset(); buildControls(); syncPlay(); updateCursor();
  });

  // vista prospettica: trascina per ruotare la camera (azimut/elevazione), rotellina per zoomare
  let camDragging = false, camLastX = 0, camLastY = 0;
  function updateCursor() { simCanvas.style.cursor = P.mode === '3d' ? (camDragging ? 'grabbing' : 'grab') : 'default'; }
  updateCursorUI = updateCursor; updateCursor();
  simCanvas.addEventListener('pointerdown', e => {
    if (P.mode !== '3d') return;
    camDragging = true; camLastX = e.clientX; camLastY = e.clientY; updateCursor();
    try { simCanvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  simCanvas.addEventListener('pointermove', e => {
    if (!camDragging) return;
    const dx = e.clientX - camLastX, dy = e.clientY - camLastY;
    camLastX = e.clientX; camLastY = e.clientY;
    cam.az += dx * 0.008;
    cam.el = clamp(cam.el - dy * 0.008, 0.12, 1.45);
  });
  simCanvas.addEventListener('pointerup', () => { camDragging = false; updateCursor(); });
  simCanvas.addEventListener('wheel', e => {
    if (P.mode !== '3d') return;
    e.preventDefault();
    cam.zoom = clamp(cam.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), 0.35, 3.5);
  }, { passive: false });

  function resize() {
    const area = document.querySelector('.lab-canvas-area'); if (!area) return;
    const ar = area.getBoundingClientRect();
    const rb = document.getElementById('readout').getBoundingClientRect();
    const ga = document.getElementById('graphArea'); const gaH = ga ? ga.offsetHeight : 0;
    const h = Math.max(240, Math.floor(ar.height - rb.height - gaH - 4));
    Lab.hidpi(simCanvas, Math.floor(ar.width), h);
    Lab.fitPanels(gCanvas);
  }
  resize();
  new ResizeObserver(resize).observe(document.querySelector('.lab-canvas-area'));
  window.addEventListener('load', resize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);

  last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000; last = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0; dt = Math.min(dt, 0.05);
    if (!P.paused) step(dt * P.speed);
    try {
      draw(simCanvas); drawGraphs();
      const st = pairState(theta);
      readout.set('t', Lab.fmt(tSim,2) + ' s');
      readout.set('theta', Lab.fmt((theta * 180 / Math.PI),3) + '°');
      readout.set('Fg', fmtSci(st.Fg, ' N'));
      readout.set('Fe', fmtSci(st.Fe, ' N'));
      readout.set('ratio', st.Fg > 0 ? Lab.sci((Math.abs(st.Fe) / st.Fg),3) : '—');
    } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
