'use strict';

const TWO_PI = Math.PI * 2;

/* ── Parameters ──────────────────────────────────────────── */
let P = {
  N:          200,   // numero di spire
  R:          4.0,   // raggio della bobina (cm)
  strength:   2.0,   // momento magnetico del magnete m (A·m²)
  resistance: 10,    // resistenza del circuito (Ω)
  omega:      2.0,   // pulsazione dell'oscillazione del magnete (rad/s)
  flip:       false, // magnete capovolto: polo N verso la bobina
};
// Sullo schermo le posizioni sono in "unità" da 5 cm: magRel = 2 vuol dire 10 cm dalla bobina
const U_CM = 5;
const MU0 = 4e-7 * Math.PI;
const mSigned = () => (P.flip ? -1 : 1) * P.strength;   // m lungo +x (verso la bobina se capovolto)

/* ── Canvas ──────────────────────────────────────────────── */
const simCanvas   = document.getElementById('simCanvas');
const ctx         = simCanvas.getContext('2d');
const graphArea   = document.getElementById('graphArea');
const readoutEl   = document.getElementById('readout');
let SW=0, SH=0, GW=0, GH=0, DPR=1, dark=true;

/* ── Layout (recomputed in resize) ───────────────────────── */
let scale=110;    // px per physics unit
let CX=0, CY=0;  // coil center in screen px
let coilR=0;      // coil radius in px
let coilL=0;      // coil half-length in px

/* ── Magnet state ────────────────────────────────────────── */
let magRel  = 2.0;    // magnet position relative to coil (physics units along x)
let magXPrv = 0;      // previous screen x (for velocity)
let magVel  = 0;      // velocità del magnete lungo l'asse (unità fisiche/s)
let dragging = false;
let dragOff  = 0;

/* ── Physics state ───────────────────────────────────────── */
let running = true;
let animT   = 0;
let simT    = 0;
let phi     = 0;
let emf     = 0;
let current = 0;
const HIST_MAX = 500;
let histT=[], histPhi=[], histEMF=[];

let _lastTs = null;

/* ── Physics ─────────────────────────────────────────────── */
// Flusso del dipolo m (sull'asse, a distanza d) attraverso N spire di raggio R. Per reciprocità è
// uguale a m per il campo che la spira genera sul proprio asse:  Φ = N·μ₀·m·R² / (2·(R²+d²)^{3/2})
// d in unità da 5 cm, risultato in Wb
function computePhi(d) {
  const R = P.R / 100, x = d * U_CM / 100;
  return P.N * MU0 * mSigned() * R * R / (2 * Math.pow(R * R + x * x, 1.5));
}
// ε = −dΦ/dt = −(dΦ/dx)·v = N·μ₀·m·R²·3x·v / (2·(R²+x²)^{5/2})   (v in unità/s, risultato in V)
function computeEMF(d, vd) {
  const R = P.R / 100, x = d * U_CM / 100, v = vd * U_CM / 100;
  return P.N * MU0 * mSigned() * R * R * 3 * x * v / (2 * Math.pow(R * R + x * x, 2.5));
}

function magScreenX() { return CX + magRel * scale; }

/* ── Field line drawing ──────────────────────────────────── */
// Dipole field lines: r = A·sin²(θ), θ from +x axis
function drawFieldLines() {
  const mx = magScreenX();
  const Avals = [0.35, 0.75, 1.5, 2.8, 5.0];
  const col = dark ? 'rgba(110,155,255,0.28)' : 'rgba(0,50,200,0.15)';
  ctx.strokeStyle = col;
  ctx.lineWidth = 1;

  for (const A_u of Avals) {
    const A = A_u * scale;
    for (const ysign of [-1, 1]) {
      ctx.beginPath();
      for (let k=0; k<=160; k++) {
        const th = Math.PI * k / 160;
        const r  = A * Math.sin(th) * Math.sin(th);
        const px = mx + r * Math.cos(th);
        const py = CY + ysign * r * Math.sin(th);
        k===0 ? ctx.moveTo(px,py) : ctx.lineTo(px,py);
      }
      ctx.stroke();

      // Arrowhead near θ = π/2 (peak of each line)
      const th1 = Math.PI * (P.flip ? 0.55 : 0.53), th2 = Math.PI * (P.flip ? 0.53 : 0.55);
      const r1  = A * Math.sin(th1)**2, r2 = A * Math.sin(th2)**2;
      const ax  = mx + r1*Math.cos(th1), ay = CY + ysign*r1*Math.sin(th1);
      const bx  = mx + r2*Math.cos(th2), by = CY + ysign*r2*Math.sin(th2);
      ctx.fillStyle = col;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(Math.atan2(by-ay, bx-ax));
      ctx.beginPath();
      ctx.moveTo(0,0); ctx.lineTo(-6,-3); ctx.lineTo(-6,3); ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}

/* ── Coil drawing ────────────────────────────────────────── */
function drawCoil() {
  const nVis    = Math.min(Math.max(P.N, 1), 12);
  const spacing = coilL * 2 / (nVis + 1);
  const front   = dark ? '#4a92d8' : '#1a5fa8';
  const back    = dark ? '#2a547a' : '#7aaad0';
  const body    = dark ? 'rgba(18,36,72,0.55)' : 'rgba(170,195,230,0.50)';

  // Body fill
  ctx.fillStyle = body;
  ctx.fillRect(CX - coilL, CY - coilR, coilL*2, coilR*2);

  // Back arcs (darker, drawn first)
  ctx.strokeStyle = back; ctx.lineWidth = 1.5;
  for (let k=0; k<nVis; k++) {
    const wx = CX - coilL + (k + 0.5) * spacing;
    ctx.beginPath();
    ctx.ellipse(wx, CY, spacing*0.42, coilR, 0, Math.PI, 0, false);
    ctx.stroke();
  }

  // Top and bottom edges
  ctx.strokeStyle = front; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(CX-coilL, CY-coilR); ctx.lineTo(CX+coilL, CY-coilR);
  ctx.moveTo(CX-coilL, CY+coilR); ctx.lineTo(CX+coilL, CY+coilR);
  ctx.stroke();

  // Front arcs (brighter)
  ctx.strokeStyle = front; ctx.lineWidth = 2;
  for (let k=0; k<nVis; k++) {
    const wx = CX - coilL + (k + 0.5) * spacing;
    ctx.beginPath();
    ctx.ellipse(wx, CY, spacing*0.42, coilR, 0, 0, Math.PI, false);
    ctx.stroke();
  }

  // Current indicators (dots = out of page, crosses = into page)
  if (Math.abs(current) > 0.005) {
    const alpha = Math.min(1, Math.abs(current) / 3);
    const col = `rgba(255,210,40,${0.25 + alpha*0.75})`;
    // current > 0: la corrente indotta circola in verso positivo attorno a +x (il suo campo dentro
    // la bobina punta a destra). Guardando lo schermo, in alto esce (•) e in basso entra (×).
    const topSym = current > 0 ? '•' : '×';
    const botSym = current > 0 ? '×' : '•';
    ctx.fillStyle = col;
    ctx.font = 'bold 13px "Space Mono",monospace';
    ctx.textAlign = 'center';
    for (let k=0; k<nVis; k++) {
      const wx = CX - coilL + (k + 0.5) * spacing;
      ctx.fillText(topSym, wx, CY - coilR - 6);
      ctx.fillText(botSym, wx, CY + coilR + 16);
    }
  }
}

/* ── Bar magnet ──────────────────────────────────────────── */
function drawMagnet() {
  const mx  = magScreenX();
  const hl  = Math.min(85, scale * 0.85);
  const hh  = 16;

  // polo sinistro (verso la bobina): S, oppure N se il magnete è capovolto
  ctx.fillStyle = P.flip ? '#c03030' : '#3068b0';
  roundRect(ctx, mx - hl, CY - hh, hl, hh*2, [4,0,0,4]);
  ctx.fill();
  ctx.fillStyle = P.flip ? '#3068b0' : '#c03030';
  roundRect(ctx, mx, CY - hh, hl, hh*2, [0,4,4,0]);
  ctx.fill();
  // Dividing line
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(mx, CY-hh); ctx.lineTo(mx, CY+hh); ctx.stroke();
  // Border
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, mx - hl, CY - hh, hl*2, hh*2, 4);
  ctx.stroke();
  // Labels
  ctx.font = 'bold 13px "DM Sans",sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText(P.flip ? 'N' : 'S', mx - hl/2, CY + 5);
  ctx.fillText(P.flip ? 'S' : 'N', mx + hl/2, CY + 5);
}

/* ── Galvanometer ────────────────────────────────────────── */
function drawGalvanometer(gx, gy) {
  const r = Math.max(32, Math.min(52, SH * 0.13));

  // Dial background
  ctx.fillStyle  = dark ? '#18243a' : '#eef2ff';
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(gx, gy, r, 0, TWO_PI); ctx.fill(); ctx.stroke();

  // Scale arc (upper semicircle)
  const arcColor = dark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.28)';
  ctx.strokeStyle = arcColor; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(gx, gy, r*0.82, Math.PI*1.08, Math.PI*1.92, false);
  ctx.stroke();

  // Tick marks
  for (let t = -5; t <= 5; t++) {
    const ang  = Math.PI*1.5 + (t/5)*Math.PI*0.44;
    const tick = (t===0||Math.abs(t)===5) ? r*0.16 : r*0.08;
    ctx.strokeStyle = arcColor; ctx.lineWidth = (t===0) ? 1.5 : 0.8;
    ctx.beginPath();
    ctx.moveTo(gx + r*0.82*Math.cos(ang), gy + r*0.82*Math.sin(ang));
    ctx.lineTo(gx + (r*0.82-tick)*Math.cos(ang), gy + (r*0.82-tick)*Math.sin(ang));
    ctx.stroke();
  }

  // "+", "−", "0" labels
  ctx.fillStyle = arcColor;
  ctx.font = `${Math.round(r*0.22)}px "Space Mono",monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('0', gx, gy - r*0.60);
  ctx.fillText('+', gx - r*0.68, gy - r*0.10);
  ctx.fillText('−', gx + r*0.68, gy - r*0.10);

  // Needle
  const maxAng   = Math.PI * 0.43;
  const rawAngle = -maxAng * Math.tanh(current * 1e3 / 6);   // ~lineare fino a qualche mA
  const needAng  = Math.PI*1.5 + Math.max(-maxAng, Math.min(maxAng, rawAngle));
  ctx.strokeStyle = dark ? '#f0d040' : '#b08000';
  ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(gx, gy);
  ctx.lineTo(gx + r*0.82*Math.cos(needAng), gy + r*0.82*Math.sin(needAng));
  ctx.stroke();
  ctx.lineCap = 'butt';

  // Pivot
  ctx.fillStyle = dark ? '#cccccc' : '#555555';
  ctx.beginPath(); ctx.arc(gx, gy, 3, 0, TWO_PI); ctx.fill();

  // Label
  ctx.fillStyle = arcColor;
  ctx.font = `11px "Space Mono",monospace`;
  ctx.fillText('G (mA)', gx, gy + r + 15);
}

/* ── Connecting wires ────────────────────────────────────── */
function drawWires(gx, gy) {
  const wc = dark ? 'rgba(200,200,80,0.45)' : 'rgba(100,100,0,0.35)';
  ctx.strokeStyle = wc; ctx.lineWidth = 1.5;

  const r = r_galv();
  // capo superiore della bobina → lato destro del galvanometro
  ctx.beginPath();
  ctx.moveTo(CX-coilL, CY-coilR);
  ctx.lineTo(CX-coilL-16, CY-coilR);
  ctx.lineTo(CX-coilL-16, gy);
  ctx.lineTo(gx + r + 4, gy);
  ctx.stroke();

  // capo inferiore della bobina → sotto il galvanometro
  ctx.beginPath();
  ctx.moveTo(CX-coilL, CY+coilR);
  ctx.lineTo(gx, CY+coilR);
  ctx.lineTo(gx, gy + r + 4);
  ctx.stroke();
}

function r_galv() {
  return Math.max(32, Math.min(52, SH * 0.13));
}

/* ── Axis guide ──────────────────────────────────────────── */
function drawAxisGuide() {
  // Horizontal guide line through coil axis (dashed)
  const gc = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  ctx.strokeStyle = gc; ctx.lineWidth = 1;
  ctx.setLineDash([4,8]);
  ctx.beginPath();
  ctx.moveTo(30, CY); ctx.lineTo(SW - 30, CY);
  ctx.stroke();
  ctx.setLineDash([]);
}

/* ── Distance label ──────────────────────────────────────── */
function drawDistLabel() {
  const d = magRel;
  const mx = magScreenX();
  if (mx <= CX + 5) return;
  const tc = dark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.32)';
  // Arrow between magnet center and coil center
  const mid = (mx + CX) / 2;
  ctx.strokeStyle = tc; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(CX+2, CY+coilR+22); ctx.lineTo(mx-2, CY+coilR+22);
  ctx.stroke();
  // Arrowheads
  ctx.fillStyle = tc;
  for (const [ox, dir] of [[CX+2, -1],[mx-2, 1]]) {
    ctx.save(); ctx.translate(ox, CY+coilR+22); ctx.rotate(dir > 0 ? 0 : Math.PI);
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-5,-3); ctx.lineTo(-5,3); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = tc;
  ctx.font = '10px "Space Mono",monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`d = ${Lab.fmt(Math.abs(d) * U_CM, 1)} cm`, mid, CY + coilR + 36);
}

/* ── Main draw ───────────────────────────────────────────── */
function drawSim() {
  ctx.fillStyle = dark ? '#0d1117' : '#f0f2f5';
  ctx.fillRect(0, 0, SW, SH);

  const rg = r_galv(), gx = 28 + rg, gy = 34 + rg;

  drawAxisGuide();
  drawFieldLines();
  drawWires(gx, gy);
  drawCoil();
  drawMagnet();
  drawGalvanometer(gx, gy);
  drawDistLabel();

  // Lenz's law hint
  if (Math.abs(current) > 0.02) {
    const dir = magRel * magVel < 0
      ? 'il magnete si avvicina: la corrente indotta lo respinge (legge di Lenz)'
      : 'il magnete si allontana: la corrente indotta lo trattiene (legge di Lenz)';
    const tc = dark ? 'rgba(255,210,40,0.6)' : 'rgba(140,100,0,0.7)';
    ctx.fillStyle = tc;
    ctx.font = '10px "DM Sans",sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(dir, CX, 18);
  }
}

/* ── Graph ───────────────────────────────────────────────── */
// Tre grafici: Φ(t), ε(t) negli ultimi secondi e Φ in funzione della posizione del magnete.
// Il fondo scala di Φ è il flusso massimo (magnete al centro della bobina), quello di ε il valore
// "tondo" sopra il picco: entrambi a gradini, con i valori scritti sull'asse.
const T_WIN = 8;
let gCanvas = [];
function drawGraph() {
  const C = Lab.graphColors();
  const t1 = Math.max(simT, T_WIN), t0 = t1 - T_WIN;
  const phiMax = Lab.niceMax(Math.abs(computePhi(0)) * 1e3);
  const pts = (arr, k) => histT.map((t, i) => [t, arr[i] * k]).filter(p => p[0] >= t0);
  let g = Lab.panel(gCanvas[0], { title: 'Flusso Φ (mWb)', xr: [t0, t1], yr: [-phiMax, phiMax], xLabel: 't (s)' });
  if (g) { const [c, f] = g; Lab.plotPts(c, f, pts(histPhi, 1e3), C.blue, 2); }
  const emfMax = Lab.niceMax(Math.max(1e-3, ...histEMF.map(Math.abs)) * 1e3);
  g = Lab.panel(gCanvas[1], { title: 'f.e.m. indotta ε = −dΦ/dt (mV)', xr: [t0, t1], yr: [-emfMax, emfMax], xLabel: 't (s)' });
  if (g) { const [c, f] = g; Lab.plotPts(c, f, pts(histEMF, 1e3), C.red, 2); }
  // Φ in funzione della distanza: la f.e.m. è proporzionale alla pendenza di questa curva
  const dMax = 25;
  g = Lab.panel(gCanvas[2], { title: 'Φ (mWb) in funzione della posizione del magnete', xr: [-dMax, dMax], yr: [-phiMax, phiMax], xLabel: 'd (cm)' });
  if (g) {
    const [c, f] = g;
    Lab.plot(c, f, x => computePhi(x / U_CM) * 1e3, [-dMax, dMax], C.blue, 2);
    // tangente nel punto attuale: pendenza dΦ/dx, che moltiplicata per v dà −ε
    const x0 = magRel * U_CM, h = 0.2, sl = (computePhi((x0 + h) / U_CM) - computePhi((x0 - h) / U_CM)) / (2 * h) * 1e3;
    Lab.plot(c, f, x => computePhi(x0 / U_CM) * 1e3 + sl * (x - x0), [x0 - 5, x0 + 5], C.amber, 1.5, [4, 3]);
    Lab.dot(c, f, x0, computePhi(magRel) * 1e3, C.amber, 4);
    Lab.legend(c, f.L + 8, f.T + 8, [[C.blue, 'Φ(d)'], [C.amber, 'pendenza: ε = −(dΦ/dd)·v', [4, 3]]]);
  }
}

/* ── Readout ─────────────────────────────────────────────── */
function updateReadout() {
  const d = magRel;
  const items = [
    {label:'Distanza d',  value: Lab.fmt(d * U_CM,1)+' cm'},
    {label:'Flusso Φ',    value: Lab.fmt(phi*1e3,3)+' mWb'},
    {label:'f.e.m. ε',    value: Lab.fmt(emf*1e3,1)+' mV'},
    {label:'Corrente I',  value: Lab.fmt(current*1e3,2)+' mA'},
    {label:'Velocità v',  value: Lab.fmt(magVel * U_CM,1)+' cm/s'},
  ];
  readoutEl.innerHTML = items.map(r =>
    `<span class="readout-item"><span class="readout-label">${r.label}</span><span class="readout-value">${r.value}</span></span>`
  ).join('');
}

/* ── Utility ─────────────────────────────────────────────── */
function roundRect(ctx, x, y, w, h, r) {
  const [tl,tr,br,bl] = Array.isArray(r) ? r : [r,r,r,r];
  ctx.beginPath();
  ctx.moveTo(x+tl, y);
  ctx.lineTo(x+w-tr, y); ctx.arc(x+w-tr, y+tr, tr, -Math.PI/2, 0);
  ctx.lineTo(x+w, y+h-br); ctx.arc(x+w-br, y+h-br, br, 0, Math.PI/2);
  ctx.lineTo(x+bl, y+h); ctx.arc(x+bl, y+h-bl, bl, Math.PI/2, Math.PI);
  ctx.lineTo(x, y+tl); ctx.arc(x+tl, y+tl, tl, Math.PI, -Math.PI/2);
  ctx.closePath();
}

/* ── Resize ──────────────────────────────────────────────── */
function resize() {
  DPR  = window.devicePixelRatio || 1;
  dark = document.documentElement.getAttribute('data-theme') !== 'light';
  const area = simCanvas.parentElement;
  const rd   = area.querySelector('.readout-bar');
  if (!gCanvas.length) gCanvas = Lab.graphPanels(graphArea, 3, 180);
  const gaH  = graphArea.offsetHeight || 180;
  const rdH  = rd ? rd.offsetHeight || 48 : 48;
  SW = area.clientWidth;
  SH = Math.max(80, area.clientHeight - gaH - rdH);
  Lab.hidpi(simCanvas, SW, SH);
  ctx.setTransform(DPR,0,0,DPR,0,0);
  Lab.fitPanels(gCanvas);

  scale  = Math.max(60, Math.min(130, SW*0.11, SH*0.28));
  CX     = SW * 0.40;
  CY     = SH * 0.50;
  coilR  = P.R / U_CM * scale;
  coilL  = Math.min(coilR * 1.6, scale * 0.9);
}

/* ── Interaction (drag when paused) ─────────────────────── */
function initInteraction() {
  const hl = () => Math.min(85, scale * 0.85);

  simCanvas.addEventListener('mousedown', e => {
    if (running) return;
    const rect = simCanvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left), my = (e.clientY - rect.top);
    const mgx = magScreenX();
    if (Math.abs(my - CY) < 24 && mx > mgx - hl() && mx < mgx + hl()) {
      dragging = true;
      dragOff  = mx - mgx;
    }
  });
  simCanvas.addEventListener('mousemove', e => {
    const rect = simCanvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left), my = (e.clientY - rect.top);
    if (dragging) {
      const newMgx = mx - dragOff;
      magRel = (newMgx - CX) / scale;
      magRel = Math.max(-3.0, Math.min(5.0, magRel));
    } else if (!running) {
      const mgx = magScreenX();
      simCanvas.style.cursor =
        (Math.abs(my-CY) < 24 && mx > mgx-hl() && mx < mgx+hl()) ? 'grab' : 'default';
    }
  });
  simCanvas.addEventListener('mouseup',    () => { dragging = false; });
  simCanvas.addEventListener('mouseleave', () => { dragging = false; });
}

/* ── Running ─────────────────────────────────────────────── */
function setRunning(v) {
  running = v;
  const btn = document.getElementById('btnPlay');
  if (btn) btn.textContent = running ? '⏸  PAUSA' : '▶  AVVIA';
  if (!running) simCanvas.style.cursor = 'grab';
  else          simCanvas.style.cursor = 'default';
}

/* ── Main loop ───────────────────────────────────────────── */
function loop(ts) {
  requestAnimationFrame(loop);
  if (_lastTs===null){_lastTs=ts;return;}
  const dt = Math.min((ts - _lastTs)/1000, 0.05);
  _lastTs = ts;

  const prevMgx = magScreenX();

  if (running && !dragging) {
    animT += dt;
    // d(t) = d_offset + d_amp * sin(ω·t)
    const d_amp    = 1.8;
    const d_offset = 2.0;
    magRel = d_offset + d_amp * Math.sin(P.omega * animT);
    magRel = Math.max(-3.0, Math.min(5.0, magRel));
  }

  // Analytical EMF: ε = N·k·R²·3d·vd / (R²+d²)^(5/2)
  const d  = magRel;
  const vd = (magScreenX() - prevMgx) / scale / Math.max(dt, 0.001); // physics units/s
  magVel = vd;
  phi     = computePhi(d);
  emf     = computeEMF(d, vd);
  current = emf / P.resistance;

  simT += dt;
  histT.push(simT); histPhi.push(phi); histEMF.push(emf);
  if (histT.length > HIST_MAX) { histT.shift(); histPhi.shift(); histEMF.shift(); }

  // Update coil geometry if R changed via slider
  coilR = P.R / U_CM * scale;
  coilL = Math.min(coilR * 1.6, scale * 0.9);

  drawSim();
  drawGraph();
  updateReadout();
}

/* ── Controls ────────────────────────────────────────────── */
function buildControls() {
  const ctrl = document.getElementById('controls');
  ctrl.innerHTML = '';

  const secCoil = Lab.Section('Bobina');
  secCoil.add(Lab.Slider({label:'Spire N', min:10, max:500, step:10, value:P.N,
    onChange(v){P.N=v;}}).el);
  secCoil.add(Lab.Slider({label:'Raggio R', unit:' cm', min:2, max:8, step:0.5, value:P.R,
    onChange(v){P.R=v;}}).el);
  secCoil.add(Lab.Slider({label:'Resistenza del circuito', unit:' Ω', min:1, max:100, step:1, value:P.resistance,
    onChange(v){P.resistance=v;}}).el);
  ctrl.appendChild(secCoil.el);

  const secMag = Lab.Section('Magnete');
  secMag.add(Lab.Slider({label:'Momento magnetico m', unit:' A·m²', min:0.5, max:10.0, step:0.5, value:P.strength,
    onChange(v){P.strength=v;}}).el);
  secMag.add(Lab.Slider({label:'Rapidità dell\'oscillazione ω', unit:' rad/s', min:0.2, max:5.0, step:0.1, value:P.omega,
    onChange(v){P.omega=v;}}).el);
  secMag.add(Lab.Toggle({label:'Polo N verso la bobina', value:P.flip,
    onChange(v){P.flip=v; histT=[]; histPhi=[]; histEMF=[];}}).el);
  const note = document.createElement('div');
  note.className = 'lab-note';
  note.innerHTML = 'Mettendo in pausa si può <b>trascinare</b> il magnete. Il verso della corrente indotta (• uscente, × entrante) si oppone sempre alla variazione del flusso: <b>legge di Lenz</b>.';
  secMag.add(note);
  ctrl.appendChild(secMag.el);
}

function resetSim() {
  animT = 0; simT = 0; magRel = 2.0;
  phi = 0; emf = 0; current = 0;
  histT = []; histPhi = []; histEMF = [];
}

/* ── Init ────────────────────────────────────────────────── */
Lab.initTheme('themeToggle');
new ResizeObserver(resize).observe(simCanvas.parentElement);
new MutationObserver(() => {
  dark = document.documentElement.getAttribute('data-theme') !== 'light';
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

resize();
buildControls();
initInteraction();
requestAnimationFrame(loop);

document.getElementById('btnPlay').addEventListener('click', () => setRunning(!running));
document.getElementById('btnReset').addEventListener('click', () => { resetSim(); });
