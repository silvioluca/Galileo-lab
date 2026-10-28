'use strict';
/* Interferometro di Michelson-Morley — Galileo Lab */

const C_KMS  = 299792.458;
const TWO_PI = Math.PI * 2;

let P = {
  etherV:    30,
  angle:     0,
  L_m:       11,
  lambda_nm: 590,
  speed:     1.0,
  rotating:  false,
};

const simCanvas   = document.getElementById('simCanvas');
const ctx         = simCanvas.getContext('2d');
const graphCanvas = document.getElementById('graphCanvas');
const gctx        = graphCanvas.getContext('2d');
const readoutEl   = document.getElementById('readout');

let SW = 0, SH = 0, GW = 0, GH = 0, DPR = 1;
let dark = true;
let t = 0;
let currentDN = 0, currentI = 0;

// ── Physics ───────────────────────────────────────────────────
function beta()       { return P.etherV / C_KMS; }
function armOPL(aDeg) {
  const b = beta(), a = aDeg * Math.PI / 180;
  return 2 * P.L_m / (1 - b * b) * Math.sqrt(1 - b * b * Math.sin(a) * Math.sin(a));
}
function fringeShift(phi) { return (armOPL(phi) - armOPL(phi + 90)) / (P.lambda_nm * 1e-9); }
function detectorI(dn)    { return 0.5 * (1 + Math.cos(TWO_PI * dn)); }
function maxShift()       { const b = beta(); return 2 * P.L_m * b * b / (P.lambda_nm * 1e-9); }

function lambdaRGB(nm) {
  if (nm < 450) return [120, 0,   240];
  if (nm < 495) return [0,   80,  255];
  if (nm < 570) return [0,   210, 40];
  if (nm < 590) return [190, 220, 0];
  if (nm < 620) return [255, 160, 0];
  return               [255, 40,  0];
}

// Blue(0) → Green(50 km/s) → Yellow(100 km/s)
function windRGB(spd) {
  const u = Math.min(1, spd / 100);
  if (u < 0.5) {
    const v = u * 2;
    return [0, Math.round(80 + 130 * v), Math.round(200 - 150 * v)];
  }
  const v = (u - 0.5) * 2;
  return [Math.round(255 * v), Math.round(210 + 45 * v), Math.round(50 - 10 * v)];
}

// ── drawSim ───────────────────────────────────────────────────
function drawSim() {
  ctx.clearRect(0, 0, SW, SH);
  ctx.fillStyle = dark ? '#0b0f18' : '#e8ecf5';
  ctx.fillRect(0, 0, SW, SH);

  // Subtle grid
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.04)';
  ctx.lineWidth = 1;
  for (let x = 48; x < SW; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, SH); ctx.stroke(); }
  for (let y = 48; y < SH; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SW, y); ctx.stroke(); }

  // Wind streamlines (meteo style)
  drawWindStreams();

  // Apparatus (scales with L_m)
  const maxARM = Math.min(SW * 0.28, SH * 0.36);
  const ARM    = Math.max(32, maxARM * (P.L_m / 11.0));
  const CX     = SW * 0.48;
  const CY     = SH * 0.50;
  const srcDist = maxARM * 0.42; // laser-to-BS, fixed
  const detDist = maxARM * 0.34; // BS-to-eye, fixed

  drawApparatus(CX, CY, ARM, srcDist, detDist);

  // Wind label
  const [wr, wg, wb] = windRGB(P.etherV);
  ctx.font = '12px "Space Mono", monospace';
  ctx.fillStyle = `rgba(${wr},${wg},${wb},0.90)`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(`vento etere  →  ${P.etherV} km/s     β = ${Lab.sci(beta(),3)}`, 10, 8);
}

// ── Meteo-style animated streamlines ─────────────────────────
function drawWindStreams() {
  const spd  = P.etherV;
  const [wr, wg, wb] = windRGB(spd);
  const nStr  = 13;
  const nPart = 8;
  const vNorm = Math.min(1, spd / 100);
  const pSpd  = 0.06 + vNorm * 0.14;   // normalized canvas-widths per second
  const tail  = 7 + vNorm * 38;        // tail length in px
  const alpha = 0.12 + vNorm * 0.50;

  ctx.save();
  ctx.lineCap = 'round';

  for (let s = 0; s < nStr; s++) {
    const baseY = SH * (s + 0.5) / nStr;

    for (let p = 0; p < nPart; p++) {
      const phase = (t * pSpd + p / nPart) % 1;
      const xHead = phase * SW;
      // Gentle sinusoidal wave in y (static shape, particle travels along it)
      const wAmp = 8 + s * 1.2;
      const wFreq = 0.018 + s * 0.001;
      const yHead = baseY + Math.sin(xHead * wFreq + s * 1.3) * wAmp;
      // Tangent angle at head
      const dydx  = wAmp * wFreq * Math.cos(xHead * wFreq + s * 1.3);
      const ang   = Math.atan2(dydx, 1);
      const cosA  = Math.cos(ang), sinA = Math.sin(ang);
      const xTail = xHead - tail * cosA;
      const yTail = yHead - tail * sinA;

      // Gradient: transparent tail → opaque head
      const g = ctx.createLinearGradient(xTail, yTail, xHead, yHead);
      g.addColorStop(0, `rgba(${wr},${wg},${wb},0)`);
      g.addColorStop(1, `rgba(${wr},${wg},${wb},${alpha.toFixed(2)})`);
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.0 + vNorm * 0.8;
      ctx.beginPath(); ctx.moveTo(xTail, yTail); ctx.lineTo(xHead, yHead); ctx.stroke();

      // Head dot
      ctx.beginPath(); ctx.arc(xHead, yHead, 1.2 + vNorm * 0.8, 0, TWO_PI);
      ctx.fillStyle = `rgba(${wr},${wg},${wb},${(alpha * 0.85).toFixed(2)})`;
      ctx.fill();
    }
  }
  ctx.restore();
}

// ── Apparatus ─────────────────────────────────────────────────
function drawApparatus(CX, CY, ARM, srcDist, detDist) {
  const appAngle = P.angle * Math.PI / 180;
  const [lr, lg, lb] = lambdaRGB(P.lambda_nm);

  ctx.save();
  ctx.translate(CX, CY);
  ctx.rotate(appAngle);

  // Beam paths (glow + core)
  beamLine(-srcDist, 0,   0,    0,   lr, lg, lb, 0.90); // laser → BS
  beamLine(0,        0,   0,   -ARM, lr, lg, lb, 0.80); // BS → M1
  beamLine(0,        0,   ARM,  0,   lr, lg, lb, 0.80); // BS → M2
  beamLine(0,        0,   0,    detDist, lr, lg, lb, 0.65); // BS → eye

  // Animated wave crests on the two arms
  beamCrests(0, 0, 0, -ARM, lr, lg, lb, 1.00);
  beamCrests(0, 0, ARM, 0,  lr, lg, lb, 1.18);

  // Mirror M1 (top of vertical arm) — horizontal slab
  mirrorSlab(0, -ARM, 0);
  // Mirror M2 (right of horizontal arm) — vertical slab
  mirrorSlab(ARM, 0, Math.PI / 2);

  // Beam splitter (45° tilted glass plate)
  ctx.save(); ctx.rotate(Math.PI / 4);
  ctx.fillStyle   = dark ? 'rgba(255,220,130,0.35)' : 'rgba(200,160,60,0.40)';
  ctx.strokeStyle = dark ? '#ffdd88' : '#aa7700';
  ctx.lineWidth   = 1.5;
  ctx.fillRect(-16, -3.5, 32, 7);
  ctx.strokeRect(-16, -3.5, 32, 7);
  ctx.restore();

  // Laser source (left of BS)
  laserBox(-srcDist, 0);
  // Eye/detector (below BS)
  eyeBox(0, detDist, lr, lg, lb, currentI);

  // Labels (in rotated frame)
  const mc = dark ? '#88bbff' : '#003399';
  const dc = dark ? 'rgba(255,255,255,0.50)' : 'rgba(0,0,0,0.50)';
  ctx.font = 'bold 11px "Space Mono", monospace';
  ctx.fillStyle = mc;
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText('M₁', 0, -ARM - 14);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('M₂', ARM + 14, 0);

  ctx.font = '9px "Space Mono", monospace';
  ctx.fillStyle = dark ? 'rgba(255,220,100,0.75)' : 'rgba(140,90,0,0.85)';
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillText('BS', -5, -5);

  // Arm length annotation
  if (ARM > 55) {
    ctx.fillStyle = dc;
    ctx.font = '9px "Space Mono", monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(`L=${Lab.fmt(P.L_m,1)}m`, -5, -ARM / 2);
    ctx.textAlign = 'left';
    ctx.fillText(`L=${Lab.fmt(P.L_m,1)}m`, ARM / 2 + 5, 8);
  }

  ctx.restore(); // end apparatus rotation

  // Rotation ring (unrotated frame)
  ctx.save();
  ctx.translate(CX, CY);
  const rr = ARM + srcDist * 0.55;
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
  ctx.lineWidth = 1; ctx.setLineDash([3, 6]);
  ctx.beginPath(); ctx.arc(0, 0, rr, 0, TWO_PI); ctx.stroke();
  ctx.setLineDash([]);
  const ax = Math.cos(appAngle - Math.PI / 2) * rr;
  const ay = Math.sin(appAngle - Math.PI / 2) * rr;
  ctx.beginPath(); ctx.arc(ax, ay, 4, 0, TWO_PI);
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.22)';
  ctx.fill();
  ctx.restore();
}

function beamLine(x1, y1, x2, y2, r, g, b, op) {
  // Glow halo
  ctx.strokeStyle = `rgba(${r},${g},${b},${(op * 0.22).toFixed(2)})`;
  ctx.lineWidth = 8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  // Core beam
  ctx.strokeStyle = `rgba(${r},${g},${b},${op.toFixed(2)})`;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

function beamCrests(x1, y1, x2, y2, r, g, b, phK) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;
  const lam = 26;
  const off = (t * lam * phK) % lam;
  ctx.fillStyle = `rgba(${r},${g},${b},0.92)`;
  for (let s = off; s < len; s += lam) {
    ctx.beginPath(); ctx.arc(x1 + ux * s, y1 + uy * s, 2.5, 0, TWO_PI); ctx.fill();
  }
}

function mirrorSlab(x, y, rot) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot);
  ctx.fillStyle   = dark ? 'rgba(140,190,255,0.50)' : 'rgba(0,80,180,0.45)';
  ctx.strokeStyle = dark ? '#aaddff' : '#0044aa';
  ctx.lineWidth = 1.5;
  ctx.fillRect(-20, -4, 40, 8);
  ctx.strokeRect(-20, -4, 40, 8);
  // Highlight stripe
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.45)';
  ctx.fillRect(-16, -2, 32, 2);
  ctx.restore();
}

function laserBox(x, y) {
  ctx.save(); ctx.translate(x, y);
  const w = 46, h = 22;
  ctx.fillStyle   = dark ? 'rgba(40,160,55,0.82)' : 'rgba(25,130,40,0.82)';
  ctx.strokeStyle = dark ? '#66ff88' : '#004400';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(-w/2, -h/2, w, h, 4); ctx.fill(); ctx.stroke();
  ctx.font = 'bold 9px "Space Mono", monospace';
  ctx.fillStyle = dark ? '#ccffdd' : '#002800';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Laser', 0, 0);
  ctx.restore();
}

function eyeBox(x, y, r, g, b, intensity) {
  ctx.save(); ctx.translate(x, y);
  const w = 38, h = 20;
  // Intensity glow
  const gl = ctx.createRadialGradient(0, 0, 0, 0, 0, w);
  gl.addColorStop(0, `rgba(${r},${g},${b},${(intensity * 0.55).toFixed(2)})`);
  gl.addColorStop(1, 'transparent');
  ctx.beginPath(); ctx.arc(0, 0, w, 0, TWO_PI); ctx.fillStyle = gl; ctx.fill();
  // Box
  const bri = Math.round(intensity * 200 + 40);
  ctx.fillStyle   = dark
    ? `rgba(${bri},${Math.round(bri * 0.78)},28,0.90)`
    : `rgba(${bri},${Math.round(bri * 0.75)},20,0.90)`;
  ctx.strokeStyle = dark ? '#ffee88' : '#886600';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(-w/2, -h/2, w, h, 4); ctx.fill(); ctx.stroke();
  ctx.font = '8px "Space Mono", monospace';
  ctx.fillStyle = dark ? '#ffffcc' : '#443300';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('occhio', 0, 0);
  ctx.restore();
}

// ── drawGraph ─────────────────────────────────────────────────
function drawGraph() {
  gctx.clearRect(0, 0, GW, GH);
  gctx.fillStyle = dark ? '#0a0e14' : '#f0f2f5';
  gctx.fillRect(0, 0, GW, GH);

  const pad  = { l: 46, r: 12, t: 20, b: 32 };
  const splitX = Math.round(GW * 0.58);

  // Left: Δn vs rotation
  drawGPanel(
    pad.l, splitX - 8, pad.t, GH - pad.b,
    i => fringeShift(i),
    'φ  (rotazione)', 'Δn  [λ]',
    dark ? '#ff9944' : '#cc5500',
    P.angle % 360, currentDN
  );

  // Right: circular interferogram
  drawInterferogram(splitX + 8, pad.t, GW - pad.r, GH - pad.b);
}

function drawGPanel(x0, x1, y0, y1, fn, xLbl, yLbl, color, markerX, markerY) {
  const w = x1 - x0, h = y1 - y0;
  if (w < 4 || h < 4) return;

  const N = 360;
  const samples = [];
  for (let i = 0; i <= N; i++) samples.push(fn(i));

  let yMin = Math.min(...samples), yMax = Math.max(...samples);
  if (yMax - yMin < 1e-8) { yMin -= 0.05; yMax += 0.05; }
  else { const pd = (yMax - yMin) * 0.12; yMin -= pd; yMax += pd; }

  const toX = i => x0 + (i / N) * w;
  const toY = v => y1 - ((v - yMin) / (yMax - yMin)) * h;

  // Box + grid
  gctx.strokeStyle = dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)';
  gctx.lineWidth = 1; gctx.strokeRect(x0, y0, w, h);
  gctx.setLineDash([2, 4]);
  gctx.strokeStyle = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  for (let i = 1; i < 4; i++) {
    const yy = y0 + h * i / 4, xx = x0 + w * i / 4;
    gctx.beginPath(); gctx.moveTo(x0, yy); gctx.lineTo(x1, yy); gctx.stroke();
    gctx.beginPath(); gctx.moveTo(xx, y0); gctx.lineTo(xx, y1); gctx.stroke();
  }
  gctx.setLineDash([]);

  // Observed zero line (Δn=0 → no ether effect detected)
  const zy = toY(0);
  if (zy >= y0 && zy <= y1) {
    gctx.strokeStyle = dark ? '#44ff88' : '#006633';
    gctx.lineWidth = 1.5; gctx.setLineDash([5, 3]);
    gctx.beginPath(); gctx.moveTo(x0, zy); gctx.lineTo(x1, zy); gctx.stroke();
    gctx.setLineDash([]);
    gctx.font = '9px "Space Mono", monospace';
    gctx.fillStyle = dark ? '#44ff88' : '#006633';
    gctx.textAlign = 'left'; gctx.textBaseline = 'bottom';
    gctx.fillText('osservato  1887', x0 + 3, zy - 1);
  }

  // Classical curve
  gctx.beginPath(); gctx.strokeStyle = color; gctx.lineWidth = 2;
  for (let i = 0; i <= N; i++) {
    const xx = toX(i), yy = toY(samples[i]);
    if (i === 0) gctx.moveTo(xx, yy); else gctx.lineTo(xx, yy);
  }
  gctx.stroke();

  // Current angle marker
  gctx.beginPath(); gctx.arc(toX(markerX), toY(markerY), 5, 0, TWO_PI);
  gctx.fillStyle = color; gctx.fill();
  gctx.strokeStyle = dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.65)';
  gctx.lineWidth = 1; gctx.stroke();

  // Y labels
  gctx.font = '9px "Space Mono", monospace';
  gctx.fillStyle = dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)';
  gctx.textAlign = 'right'; gctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const v = yMin + (yMax - yMin) * i / 4;
    gctx.fillText(Lab.fmt(v,3), x0 - 3, y1 - h * i / 4);
  }
  // X labels
  gctx.textAlign = 'center'; gctx.textBaseline = 'top';
  for (let i = 0; i <= 4; i++) gctx.fillText(`${i * 90}°`, toX(i * 90), y1 + 3);

  // Titles
  gctx.font = '10px "Space Mono", monospace';
  gctx.fillStyle = dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)';
  gctx.textAlign = 'center'; gctx.textBaseline = 'bottom';
  gctx.fillText(xLbl, x0 + w / 2, y1 + 30);
  gctx.save();
  gctx.translate(x0 - 32, y0 + h / 2);
  gctx.rotate(-Math.PI / 2);
  gctx.fillText(yLbl, 0, 0);
  gctx.restore();
}

// Circular interferogram: concentric rings (equal-inclination fringes)
function drawInterferogram(x0, y0, x1, y1) {
  const w = x1 - x0, h = y1 - y0;
  if (w < 4 || h < 4) return;
  const [lr, lg, lb] = lambdaRGB(P.lambda_nm);
  const cx = x0 + w / 2, cy = y0 + h / 2;
  const maxR = Math.min(w, h) / 2 - 6;

  // Dark background panel
  gctx.fillStyle = '#000';
  gctx.beginPath(); gctx.roundRect(x0, y0, w, h, 6); gctx.fill();
  gctx.strokeStyle = dark ? 'rgba(180,200,255,0.18)' : 'rgba(180,200,255,0.30)';
  gctx.lineWidth = 1.5; gctx.stroke();

  // Clip to panel
  gctx.save();
  gctx.beginPath(); gctx.roundRect(x0, y0, w, h, 6); gctx.clip();

  // Draw concentric rings from outside in (each circle overwrites interior)
  const nSteps = 140;
  for (let i = nSteps; i >= 0; i--) {
    const rn = i / nSteps;
    const r  = maxR * rn;
    if (r < 0.5) continue;
    // Equal-inclination phase: proportional to r² (equal-area ring spacing)
    const phase     = rn * rn * 10 + currentDN;
    const intensity = 0.5 * (1 + Math.cos(TWO_PI * phase));
    gctx.beginPath(); gctx.arc(cx, cy, r, 0, TWO_PI);
    gctx.fillStyle = `rgb(${Math.round(lr * intensity)},${Math.round(lg * intensity)},${Math.round(lb * intensity)})`;
    gctx.fill();
  }

  // Subtle vignette
  const vg = gctx.createRadialGradient(cx, cy, maxR * 0.7, cx, cy, maxR);
  vg.addColorStop(0, 'transparent');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  gctx.beginPath(); gctx.arc(cx, cy, maxR, 0, TWO_PI);
  gctx.fillStyle = vg; gctx.fill();

  gctx.restore();

  // Labels
  gctx.font = 'bold 10px "Space Mono", monospace';
  gctx.fillStyle = dark ? 'rgba(180,210,255,0.65)' : 'rgba(180,210,255,0.75)';
  gctx.textAlign = 'center'; gctx.textBaseline = 'top';
  gctx.fillText('interferogramma', cx, y0 + 5);

  gctx.font = '9px "Space Mono", monospace';
  gctx.fillStyle = dark ? 'rgba(255,180,60,0.88)' : 'rgba(200,100,0,0.88)';
  gctx.textAlign = 'center'; gctx.textBaseline = 'bottom';
  gctx.fillText(`Δn = ${Lab.fmt(currentDN,4)} frange`, cx, y1 - 4);
}

// ── Readout ───────────────────────────────────────────────────
function updateReadout() {
  const mS = maxShift();
  const items = [
    { label: 'rotazione φ', value: `${Lab.fmt(P.angle,1)}°` },
    { label: 'β = v/c',   value: Lab.sci(beta(),3) },
    { label: 'spostamento frange Δn', value: `${Lab.fmt(currentDN,4)} frange` },
    { label: 'Δn massimo atteso', value: `${Lab.fmt(mS,4)} frange` },
    { label: 'intensità al centro', value: Lab.fmt(currentI,3) },
    { label: 'lunghezza bracci L', value: `${Lab.fmt(P.L_m,1)} m` },
    { label: 'lunghezza d’onda λ', value: `${P.lambda_nm} nm` },
  ];
  readoutEl.innerHTML = items.map(r =>
    `<span class="readout-item"><span class="readout-label">${Lab.keepCaseHTML(r.label)}</span><span class="readout-value">${r.value}</span></span>`
  ).join('');
}

// ── Controls ──────────────────────────────────────────────────
let sliderAngle = null;

function buildControls() {
  const el = document.getElementById('controls');
  el.innerHTML = '';

  const secWind = Lab.Section('Vento d\'Etere');
  secWind.add(Lab.Slider({ label: 'Velocità vento etere', unit: ' km/s',
    min: 0, max: 100, step: 1, value: P.etherV,
    onChange: v => { P.etherV = v; } }));
  el.appendChild(secWind.el);

  const secApp = Lab.Section('Apparato');
  sliderAngle = Lab.Slider({ label: 'Rotazione apparato', unit: '°',
    min: 0, max: 360, step: 1, value: P.angle,
    onChange: v => { P.angle = v; } });
  secApp.add(sliderAngle);
  secApp.add(Lab.Slider({ label: 'Lunghezza bracci L', unit: ' m',
    min: 0.5, max: 11, step: 0.5, value: P.L_m,
    onChange: v => { P.L_m = v; } }));
  secApp.add(Lab.Slider({ label: 'Lunghezza d\'onda λ', unit: ' nm',
    min: 400, max: 700, step: 10, value: P.lambda_nm,
    onChange: v => { P.lambda_nm = v; } }));
  el.appendChild(secApp.el);

  const secAnim = Lab.Section('Animazione');
  secAnim.add(Lab.Slider({ label: 'Velocità animazione', unit: '×',
    min: 0, max: 3, step: 0.1, value: P.speed,
    onChange: v => { P.speed = v; } }));
  secAnim.add(Lab.Toggle({ label: 'Rotazione automatica', value: P.rotating,
    onChange: v => { P.rotating = v; } }));
  el.appendChild(secAnim.el);
}

// ── Resize ────────────────────────────────────────────────────
function resize() {
  DPR  = window.devicePixelRatio || 1;
  dark = document.documentElement.getAttribute('data-theme') !== 'light';

  const area = simCanvas.parentElement;          // .lab-canvas-area
  const ga   = document.getElementById('graphArea');
  const rd   = area.querySelector('.readout-bar');
  const gaH  = ga ? ga.clientHeight || 200 : 200;
  const rdH  = rd ? rd.clientHeight || 48  : 48;

  const simLW = area.clientWidth;
  const simLH = Math.max(80, area.clientHeight - gaH - rdH);
  const grLW  = area.clientWidth;
  const grLH  = gaH;

  simCanvas.width        = Math.round(simLW * DPR);
  simCanvas.height       = Math.round(simLH * DPR);
  simCanvas.style.width  = simLW + 'px';
  simCanvas.style.height = simLH + 'px';

  graphCanvas.width        = Math.round(grLW * DPR);
  graphCanvas.height       = Math.round(grLH * DPR);
  graphCanvas.style.width  = grLW + 'px';
  graphCanvas.style.height = grLH + 'px';

  SW = simLW; SH = simLH;
  GW = grLW;  GH = grLH;

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  gctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

// ── Loop ──────────────────────────────────────────────────────
let lastTs = null;
function loop(ts) {
  if (lastTs === null) lastTs = ts;
  const dt = Math.min((ts - lastTs) / 1000, 0.05) * P.speed;
  lastTs = ts;
  t += dt;

  if (P.rotating) {
    P.angle = (P.angle + dt * 18) % 360;
    if (sliderAngle) sliderAngle.setValue(Math.round(P.angle));
  }

  dark      = document.documentElement.getAttribute('data-theme') !== 'light';
  currentDN = fringeShift(P.angle);
  currentI  = detectorI(currentDN);

  drawSim();
  drawGraph();
  updateReadout();
  requestAnimationFrame(loop);
}

// ── Init ──────────────────────────────────────────────────────
Lab.initTheme('themeToggle');
window.addEventListener('resize', resize);
resize();
buildControls();
requestAnimationFrame(loop);
