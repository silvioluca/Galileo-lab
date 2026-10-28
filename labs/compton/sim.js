'use strict';

const sc   = document.getElementById('simCanvas');
const ctx  = sc.getContext('2d');
const gc   = document.getElementById('graphCanvas');
const gctx = gc.getContext('2d');
const DPR  = window.devicePixelRatio || 1;

let SW = 0, SH = 0, GW = 0, GH = 0;
let CX = 0, CY = 0;

Lab.initTheme('themeToggle');
const dk = () => document.documentElement.dataset.theme !== 'light';

// ── Physical constants ───────────────────────────────────────────────────
const LAMBDA_C = 2.426e-12;   // Compton wavelength [m]
const ME_C2    = 511.0;       // electron rest energy [keV]
// hc = 1240 eV·nm = 1240 keV·pm  →  λ[pm] = 1240 / E[keV]

// ── Parameters ───────────────────────────────────────────────────────────
const P = {
  E0:         100,
  theta:      90,
  continuous: false,
  speed:      1.0,
};

// ── Physics ──────────────────────────────────────────────────────────────
function comptonCalc(E0, thetaDeg) {
  const theta  = thetaDeg * Math.PI / 180;
  const eps    = E0 / ME_C2;
  const cosT   = Math.cos(theta);
  const sinT   = Math.sin(theta);
  const E1     = E0 / (1 + eps * (1 - cosT));
  const T      = E0 - E1;
  const dLam_m = LAMBDA_C * (1 - cosT);
  const dLam   = dLam_m * 1e12;          // pm
  const lam0   = 1240 / E0;              // pm
  const lam1   = lam0 + dLam;            // pm
  const phi    = (Math.abs(1 - cosT) < 1e-9)
    ? 0
    : Math.atan(Math.abs(sinT) / Math.max(1e-14, (1 + eps) * (1 - cosT)));
  return { E1, T, dLam, lam0, lam1, phi, eps, theta };
}

// Klein-Nishina dσ/dΩ (max = 1.0 at θ=0 for any ε)
function kn(eps, theta) {
  const r = 1 / (1 + eps * (1 - Math.cos(theta)));
  return 0.5 * r * r * (r + 1 / r - Math.sin(theta) ** 2);
}

function sampleKN(eps) {
  for (;;) {
    const t = Math.random() * Math.PI;
    if (Math.random() < kn(eps, t)) return t;
  }
}

// ── Animation state ──────────────────────────────────────────────────────
let anim = { phase: 0, thetaDeg: 90, wp0: 0, wp1: 0 };
let thetaHist  = new Array(36).fill(0);
let totalShots = 0;
let lastTS     = null;

// ── Color: energy → hue  (high E = blue/violet, low E = orange/red) ──────
function photonColor(E_keV) {
  // logE: 0 (1 keV) → 3.3 (2000 keV)  →  hue: 20 (orange) → 250 (blue-violet)
  const h = Math.max(20, Math.min(250, 20 + 70 * Math.log10(Math.max(1, E_keV))));
  return `hsl(${h.toFixed(0)},90%,62%)`;
}

function photonWavePx(E_keV) {
  return Math.max(10, 28 * Math.pow(100 / Math.max(0.1, E_keV), 0.35));
}

// ── Draw helpers ─────────────────────────────────────────────────────────
function drawWave(cx, cy, dx, dy, wavePx, color, phase) {
  const px = -dy, py = dx;
  const amp = 8, nCyc = 3.5;
  const total = nCyc * wavePx;
  const sigma = total / 3.2;
  const steps = Math.max(80, Math.ceil(total * 1.8));
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const s   = (i / steps - 0.5) * total;
    const env = Math.exp(-s * s / (2 * sigma * sigma));
    const w   = Math.sin(2 * Math.PI * s / wavePx + phase) * amp * env;
    i === 0 ? ctx.moveTo(cx + dx*s + px*w, cy + dy*s + py*w)
            : ctx.lineTo(cx + dx*s + px*w, cy + dy*s + py*w);
  }
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
}

function drawElectron(x, y, pulse, alpha) {
  const dark = dk();
  const r = 11 + (pulse || 0) * 4;
  ctx.globalAlpha = alpha ?? 1;
  const g = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, r * 1.3);
  g.addColorStop(0, '#aaddff'); g.addColorStop(1, '#1144aa');
  ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = '#44aaffaa'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = dark ? '#cceeff' : '#002266';
  ctx.font = `bold 9px 'Space Mono', monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('e⁻', x, y);
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = 1;
}

function drawArc(cx, cy, r, a0, a1, color) {
  ctx.beginPath();
  for (let i = 0; i <= 32; i++) {
    const a = a0 + (a1 - a0) * (i / 32);
    i === 0 ? ctx.moveTo(cx + r*Math.cos(a), cy + r*Math.sin(a))
            : ctx.lineTo(cx + r*Math.cos(a), cy + r*Math.sin(a));
  }
  ctx.strokeStyle = color; ctx.lineWidth = 1.2;
  ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
}

// Returns t such that (cx+dx*t, cy+dy*t) hits canvas edge
function edgeDist(cx, cy, dx, dy) {
  let t = 1e9;
  if (dx >  1e-6) t = Math.min(t, (SW  - cx) / dx);
  if (dx < -1e-6) t = Math.min(t, -cx / dx);
  if (dy >  1e-6) t = Math.min(t, (SH  - cy) / dy);
  if (dy < -1e-6) t = Math.min(t, -cy / dy);
  return t;
}

// ── Update ────────────────────────────────────────────────────────────────
function update(dt) {
  anim.phase += dt * P.speed * 0.55;
  anim.wp0   += dt * P.speed * 3.8;
  anim.wp1   += dt * P.speed * 3.8;

  if (anim.phase >= 1) {
    if (P.continuous) {
      const t = sampleKN(P.E0 / ME_C2);
      anim.thetaDeg = t * 180 / Math.PI;
      thetaHist[Math.min(35, Math.floor(anim.thetaDeg / 5))]++;
      totalShots++;
    } else {
      anim.thetaDeg = P.theta;
    }
    anim.phase = 0;
  }
}

// ── Draw sim ──────────────────────────────────────────────────────────────
// Convention (matches reference image):
//   Incident photon → from left, along +x axis
//   Scattered photon → at angle θ BELOW +x axis  (canvas: +sin → downward)
//   Recoil electron  → at angle φ ABOVE +x axis  (canvas: -sin → upward)
function drawSim() {
  const dark = dk();
  const fg   = dark ? '#cccccc' : '#333333';
  const cd   = comptonCalc(P.E0, anim.thetaDeg);
  const phs  = anim.phase;

  ctx.save(); ctx.scale(DPR, DPR);
  ctx.fillStyle = dark ? '#06090f' : '#f0f2f5';
  ctx.fillRect(0, 0, SW, SH);

  // Background grid
  const gridStep = 48;
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.045)';
  ctx.lineWidth = 1;
  for (let x = gridStep; x < SW; x += gridStep) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, SH); ctx.stroke();
  }
  for (let y = gridStep; y < SH; y += gridStep) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SW, y); ctx.stroke();
  }

  const col0 = photonColor(P.E0);
  const col1 = photonColor(cd.E1);
  const wPx0 = photonWavePx(P.E0);
  const wPx1 = photonWavePx(cd.E1);
  const tR   = cd.theta;

  // Scattered photon direction: below x-axis (downward in canvas)
  const sdX = Math.cos(tR), sdY = Math.sin(tR);
  // Electron recoil direction: above x-axis (upward in canvas)
  const edX = Math.cos(cd.phi), edY = -Math.sin(cd.phi);

  const fromX = 28;
  const maxD  = Math.min(CX - fromX, Math.min(CY, SH - CY) - 20) * 0.9;

  // ── Dashed x-axis guide (incident direction extension) ───────────────
  ctx.beginPath(); ctx.moveTo(fromX, CY); ctx.lineTo(SW - 16, CY);
  ctx.strokeStyle = dark ? '#ffffff0a' : '#0000000a';
  ctx.lineWidth = 1; ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]);

  if (phs < 0.45) {
    // ── INCOMING ──────────────────────────────────────────────────────
    const prog  = phs / 0.45;
    const photX = fromX + (CX - fromX) * prog;
    drawWave(photX, CY, 1, 0, wPx0, col0, anim.wp0);
    drawElectron(CX, CY, 0, 1);

  } else if (phs < 0.56) {
    // ── COLLISION FLASH ────────────────────────────────────────────────
    const t = (phs - 0.45) / 0.11;
    for (let i = 0; i < 3; i++) {
      const tr = Math.max(0, t - i * 0.2);
      if (tr === 0) continue;
      ctx.beginPath(); ctx.arc(CX, CY, tr * 50, 0, 2 * Math.PI);
      ctx.strokeStyle = `rgba(255,210,60,${(1 - tr) * 0.7})`;
      ctx.lineWidth = 2 - i * 0.4; ctx.stroke();
    }
    drawElectron(CX, CY, Math.sin(t * Math.PI), 1);

  } else {
    // ── OUTGOING ──────────────────────────────────────────────────────
    const t    = (phs - 0.56) / 0.44;
    const dist = t * maxD;

    // Direction guide lines (dashed, full extent to canvas edge)
    const tEdge = edgeDist(CX, CY, sdX, sdY);
    const eEdge = edgeDist(CX, CY, edX, edY);
    ctx.setLineDash([5, 4]); ctx.lineWidth = 1;
    ctx.strokeStyle = col1 + '55';
    ctx.beginPath(); ctx.moveTo(CX, CY); ctx.lineTo(CX + sdX*tEdge, CY + sdY*tEdge); ctx.stroke();
    ctx.strokeStyle = '#4488ff55';
    ctx.beginPath(); ctx.moveTo(CX, CY); ctx.lineTo(CX + edX*eEdge, CY + edY*eEdge); ctx.stroke();
    ctx.setLineDash([]);

    // Ghost electron at origin (semi-transparent — "before collision")
    drawElectron(CX, CY, 0, 0.22);

    // Scattered photon wave packet
    drawWave(CX + sdX*dist, CY + sdY*dist, sdX, sdY, wPx1, col1, anim.wp1);

    // Recoil electron
    const eD = dist * 0.28;
    drawElectron(CX + edX*eD, CY + edY*eD, 0, 1);

    // Recoil trail
    ctx.beginPath(); ctx.moveTo(CX, CY); ctx.lineTo(CX + edX*eD, CY + edY*eD);
    ctx.strokeStyle = '#4488ff44'; ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);

    // Angle arcs + labels
    if (dist > 50) {
      const arcR = 42;
      // θ: from 0 (right) to +tR (downward in canvas)
      drawArc(CX, CY, arcR, 0, tR, col1 + 'cc');
      ctx.fillStyle = col1; ctx.font = `bold 11px 'DM Sans', sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(`θ=${Lab.fmt(anim.thetaDeg,0)}°`,
        CX + (arcR + 16) * Math.cos(tR / 2), CY + (arcR + 16) * Math.sin(tR / 2));

      // φ: from -phi (upward in canvas) to 0
      if (cd.phi > 0.05) {
        drawArc(CX, CY, arcR + 14, -cd.phi, 0, '#4488ffcc');
        ctx.fillStyle = '#4488ff'; ctx.font = `bold 11px 'DM Sans', sans-serif`; ctx.textAlign = 'center';
        ctx.fillText(`φ=${Lab.fmt((cd.phi * 180 / Math.PI),0)}°`,
          CX + (arcR + 30) * Math.cos(-cd.phi / 2), CY + (arcR + 30) * Math.sin(-cd.phi / 2));
      }
    }

    // Wavelength labels alongside waves
    if (t > 0.35) {
      const alpha = Math.min(1, (t - 0.35) / 0.3);
      ctx.globalAlpha = alpha;
      // Scattered photon: label above the wave path
      const perpX = -sdY, perpY = sdX;  // perpendicular pointing "left" of travel direction
      const lx = CX + sdX * dist + perpX * 18;
      const ly = CY + sdY * dist + perpY * 18;
      ctx.font = `10px 'Space Mono', monospace`; ctx.textAlign = 'center';
      ctx.fillStyle = col1;
      ctx.fillText(`λ' = ${Lab.fmt(cd.lam1,2)} pm  E' = ${Lab.fmt(cd.E1,1)} keV`, lx, ly);
      ctx.globalAlpha = 1;
    }
  }

  // ── Static overlay ────────────────────────────────────────────────────
  ctx.textAlign = 'left'; ctx.font = `10px 'Space Mono', monospace`;
  ctx.fillStyle = col0;
  ctx.fillText(`E₀ = ${P.E0} keV   λ₀ = ${Lab.fmt(cd.lam0,2)} pm`, 12, 20);
  ctx.fillStyle = fg + '88';
  ctx.fillText(`ε = ${Lab.fmt(cd.eps,3)}   Δλ_max = ${Lab.fmt((2 * LAMBDA_C * 1e12),3)} pm  (θ=180°)`, 12, 36);

  if (P.continuous && totalShots > 0) {
    ctx.textAlign = 'right'; ctx.fillStyle = fg + '66';
    ctx.fillText(`${totalShots} collisioni`, SW - 12, 20);
  }

  ctx.restore();
}

// ── Draw graph ─────────────────────────────────────────────────────────────
// Left panel: intensity spectrum I(λ) — two Gaussian peaks A (λ₀) and B (λ')
// Right panel: Klein-Nishina polar plot
function drawGraph() {
  const dark  = dk();
  const bg    = dark ? '#111111' : '#ffffff';
  const fg    = dark ? '#cccccc' : '#444444';
  const grid  = dark ? '#1e1e1e' : '#eeeeee';
  const eps   = P.E0 / ME_C2;
  const cd    = comptonCalc(P.E0, anim.thetaDeg);

  gctx.save(); gctx.scale(DPR, DPR);
  gctx.fillStyle = bg;
  gctx.fillRect(0, 0, GW, GH);

  const splitX = Math.round(GW * 0.56);

  // ── Left: I(λ) spectrum ───────────────────────────────────────────────
  const LP = { l: 38, r: 8, t: 22, b: 30 };
  const lW  = splitX - LP.l - LP.r;
  const lH  = GH - LP.t - LP.b;

  const lam0  = cd.lam0;   // pm
  const lam1  = cd.lam1;   // pm
  const dL    = cd.dLam;   // pm
  const sigma = Math.max(0.12 * lam0, Math.abs(lam1 - lam0) * 0.32, 0.04);
  const xMin  = lam0 - sigma * 4.2;
  const xMax  = lam1 + sigma * 4.2;
  const gxS   = l => LP.l + ((l - xMin) / (xMax - xMin)) * lW;
  const gyS   = v => LP.t + (1 - v) * lH;  // v normalised [0,1]

  const gauss = (x, mu, s) => Math.exp(-0.5 * ((x - mu) / s) ** 2);

  // Normalise so peak B = 1.0
  let Imax = 0;
  for (let i = 0; i <= 300; i++) {
    const l = xMin + (xMax - xMin) * (i / 300);
    Imax = Math.max(Imax, 0.65 * gauss(l, lam0, sigma) + gauss(l, lam1, sigma));
  }

  // Grid lines
  for (const v of [0.25, 0.5, 0.75, 1.0]) {
    gctx.strokeStyle = grid; gctx.lineWidth = 1;
    gctx.beginPath(); gctx.moveTo(LP.l, gyS(v)); gctx.lineTo(LP.l + lW, gyS(v)); gctx.stroke();
  }

  // Dashed vertical lines at λ₀ and λ'
  gctx.setLineDash([4, 3]); gctx.lineWidth = 1.2;
  gctx.strokeStyle = photonColor(P.E0) + '88';
  gctx.beginPath(); gctx.moveTo(gxS(lam0), LP.t); gctx.lineTo(gxS(lam0), LP.t + lH); gctx.stroke();
  gctx.strokeStyle = photonColor(cd.E1) + '88';
  gctx.beginPath(); gctx.moveTo(gxS(lam1), LP.t); gctx.lineTo(gxS(lam1), LP.t + lH); gctx.stroke();
  gctx.setLineDash([]);

  // Peak A fill then stroke
  const drawPeak = (mu, height, color) => {
    gctx.beginPath();
    for (let i = 0; i <= 300; i++) {
      const l = xMin + (xMax - xMin) * (i / 300);
      const v = height * gauss(l, mu, sigma) / Imax;
      i === 0 ? gctx.moveTo(gxS(l), gyS(v)) : gctx.lineTo(gxS(l), gyS(v));
    }
    gctx.lineTo(gxS(xMax), gyS(0)); gctx.lineTo(gxS(xMin), gyS(0)); gctx.closePath();
    gctx.fillStyle = color + '20'; gctx.fill();
    // stroke only the curve (re-trace without closing)
    gctx.beginPath();
    for (let i = 0; i <= 300; i++) {
      const l = xMin + (xMax - xMin) * (i / 300);
      const v = height * gauss(l, mu, sigma) / Imax;
      i === 0 ? gctx.moveTo(gxS(l), gyS(v)) : gctx.lineTo(gxS(l), gyS(v));
    }
    gctx.strokeStyle = color; gctx.lineWidth = 2; gctx.stroke();
  };

  drawPeak(lam0, 0.65, photonColor(P.E0));
  drawPeak(lam1, 1.00, photonColor(cd.E1));

  // Peak labels A and B
  const peakAh = 0.65 / Imax;
  const peakBh = 1.00 / Imax;
  gctx.font = `bold 10px 'DM Sans', sans-serif`; gctx.textAlign = 'center';
  gctx.fillStyle = photonColor(P.E0);
  gctx.fillText('A', gxS(lam0), gyS(peakAh) - 6);
  gctx.fillStyle = photonColor(cd.E1);
  gctx.fillText('B', gxS(lam1), gyS(peakBh) - 6);

  // Δλ bracket at the top
  const bx0 = gxS(lam0), bx1 = gxS(lam1), bY = LP.t + 8;
  gctx.strokeStyle = fg + 'aa'; gctx.lineWidth = 1;
  gctx.beginPath();
  gctx.moveTo(bx0, bY + 5); gctx.lineTo(bx0, bY);
  gctx.lineTo(bx1, bY); gctx.lineTo(bx1, bY + 5);
  gctx.stroke();
  gctx.fillStyle = fg + 'cc'; gctx.textAlign = 'center'; gctx.font = `9px 'DM Sans', sans-serif`;
  gctx.fillText(`Δλ = ${Lab.fmt(dL,3)} pm`, (bx0 + bx1) / 2, bY - 1);

  // λ axis labels
  gctx.font = `9px 'Space Mono', monospace`; gctx.textAlign = 'center';
  gctx.fillStyle = photonColor(P.E0) + 'bb';
  gctx.fillText(`λ=${Lab.fmt(lam0,2)}`, gxS(lam0), LP.t + lH + 18);
  gctx.fillStyle = photonColor(cd.E1) + 'bb';
  gctx.fillText(`λ'=${Lab.fmt(lam1,2)}`, gxS(lam1), LP.t + lH + 18);

  // Axes
  gctx.strokeStyle = fg + 'bb'; gctx.lineWidth = 1;
  gctx.beginPath(); gctx.moveTo(LP.l, LP.t); gctx.lineTo(LP.l, LP.t+lH); gctx.lineTo(LP.l+lW, LP.t+lH); gctx.stroke();
  gctx.fillStyle = fg + 'aa'; gctx.textAlign = 'left'; gctx.font = `9px 'DM Sans', sans-serif`;
  gctx.fillText('intensità', LP.l + 2, LP.t + 11);
  gctx.textAlign = 'center';
  gctx.fillText('lunghezza d\'onda λ [pm]', LP.l + lW / 2, LP.t + lH + 27);

  // ── Divider ───────────────────────────────────────────────────────────
  gctx.strokeStyle = grid; gctx.lineWidth = 1;
  gctx.beginPath(); gctx.moveTo(splitX, 4); gctx.lineTo(splitX, GH - 4); gctx.stroke();

  // ── Right: Klein-Nishina polar plot ───────────────────────────────────
  const rx0   = splitX + 8;
  const rW    = GW - rx0 - 8;
  const pcx   = rx0 + rW / 2;
  const pcy   = GH / 2;
  const maxR  = Math.min(rW / 2, GH / 2) - 14;
  const knMax = kn(eps, 0);  // always 1.0

  for (const f of [0.33, 0.67, 1]) {
    gctx.beginPath(); gctx.arc(pcx, pcy, maxR * f, 0, 2 * Math.PI);
    gctx.strokeStyle = grid; gctx.lineWidth = 1; gctx.stroke();
  }
  gctx.strokeStyle = grid; gctx.lineWidth = 1;
  gctx.beginPath(); gctx.moveTo(pcx - maxR - 4, pcy); gctx.lineTo(pcx + maxR + 4, pcy); gctx.stroke();
  gctx.beginPath(); gctx.moveTo(pcx, pcy - maxR - 4); gctx.lineTo(pcx, pcy + maxR + 4); gctx.stroke();

  // KN lobe: fill (closed to origin) then stroke (curve only)
  for (const sign of [-1, +1]) {
    // Fill
    gctx.beginPath(); gctx.moveTo(pcx, pcy);
    for (let i = 0; i <= 180; i++) {
      const th = i * Math.PI / 180;
      const r  = (kn(eps, th) / knMax) * maxR;
      gctx.lineTo(pcx + r * Math.cos(th), pcy + sign * r * Math.sin(th));
    }
    gctx.closePath();
    gctx.fillStyle = '#44ccff10'; gctx.fill();
    // Stroke (curve only)
    gctx.beginPath();
    for (let i = 0; i <= 180; i++) {
      const th = i * Math.PI / 180;
      const r  = (kn(eps, th) / knMax) * maxR;
      i === 0 ? gctx.moveTo(pcx + r * Math.cos(th), pcy + sign * r * Math.sin(th))
              : gctx.lineTo(pcx + r * Math.cos(th), pcy + sign * r * Math.sin(th));
    }
    gctx.strokeStyle = '#44ccff'; gctx.lineWidth = 1.5; gctx.stroke();
  }

  // Histogram overlay
  if (P.continuous && totalShots > 0) {
    const histMax = Math.max(1, ...thetaHist);
    for (const sign of [-1, +1]) {
      gctx.beginPath();
      for (let b = 0; b <= 36; b++) {
        const th  = Math.min(b, 35) * 5 * Math.PI / 180;
        const r   = (thetaHist[Math.min(b, 35)] / histMax) * maxR;
        const px  = pcx + r * Math.cos(th);
        const py  = pcy + sign * r * Math.sin(th);
        b === 0 ? gctx.moveTo(px, py) : gctx.lineTo(px, py);
      }
      gctx.closePath();
      gctx.strokeStyle = '#ffaa44aa'; gctx.lineWidth = 1; gctx.stroke();
      gctx.fillStyle = '#ffaa4418'; gctx.fill();
    }
  }

  // Current θ ray (lower half — matches scattered photon going below x-axis)
  const cthRad = anim.thetaDeg * Math.PI / 180;
  const cR     = (kn(eps, cthRad) / knMax) * maxR;
  const cpx    = pcx + cR * Math.cos(cthRad);
  const cpy    = pcy + cR * Math.sin(cthRad);  // lower half (positive y in canvas)
  gctx.strokeStyle = photonColor(P.E0); gctx.lineWidth = 2;
  gctx.beginPath(); gctx.moveTo(pcx, pcy); gctx.lineTo(cpx, cpy); gctx.stroke();
  gctx.beginPath(); gctx.arc(cpx, cpy, 3, 0, 2 * Math.PI);
  gctx.fillStyle = photonColor(P.E0); gctx.fill();

  gctx.fillStyle = fg + 'aa'; gctx.textAlign = 'left'; gctx.font = `8px 'DM Sans', sans-serif`;
  gctx.fillText('γ₀→', pcx + maxR + 4, pcy + 3);
  gctx.textAlign = 'center'; gctx.font = `9px 'DM Sans', sans-serif`;
  gctx.fillText('Klein-Nishina dσ/dΩ', pcx, GH - 4);

  gctx.restore();
}

// ── Readout ───────────────────────────────────────────────────────────────
function updateReadout() {
  const cd = comptonCalc(P.E0, anim.thetaDeg);
  document.getElementById('readout').innerHTML = [
    { label: 'fotone incidente E₀', value: `${P.E0} keV` },
    { label: "fotone diffuso E'", value: `${Lab.fmt(cd.E1,2)} keV` },
    { label: 'energia dell’elettrone', value: `${Lab.fmt(cd.T,2)} keV` },
    { label: 'spostamento Δλ', value: `${Lab.fmt(cd.dLam,4)} pm` },
    { label: 'angolo del fotone θ', value: `${Lab.fmt(anim.thetaDeg,1)}°` },
    { label: 'angolo dell’elettrone φ', value: `${Lab.fmt((cd.phi * 180 / Math.PI),1)}°` },
    { label: 'rapporto E₀/(mₑc²)', value: Lab.fmt(cd.eps,3) },
  ].map(r =>
    `<span class="readout-item"><span class="readout-label">${Lab.keepCaseHTML(r.label)}</span><span class="readout-value">${r.value}</span></span>`
  ).join('');
}

// ── Controls ──────────────────────────────────────────────────────────────
function buildControls() {
  const ctrl = document.getElementById('controls');
  ctrl.innerHTML = '';

  const phot = Lab.Section('Fotone incidente');
  phot.add(Lab.Slider({ label: 'Energia E₀ [keV]', min: 1, max: 2000, step: 1, value: P.E0, unit: ' keV',
    onChange: v => { P.E0 = v; } }));
  ctrl.appendChild(phot.el);

  const scat = Lab.Section('Scattering');
  if (!P.continuous) {
    scat.add(Lab.Slider({ label: 'Angolo θ [°]', min: 1, max: 179, step: 1, value: P.theta, unit: '°',
      onChange: v => { P.theta = v; anim.thetaDeg = v; } }));
  }
  scat.add(Lab.Toggle({ label: 'Angoli casuali (distribuz. KN)', value: P.continuous,
    onChange: v => {
      P.continuous = v;
      if (v) { thetaHist = new Array(36).fill(0); totalShots = 0; }
      else   { anim.thetaDeg = P.theta; }
      buildControls();
    },
  }));
  ctrl.appendChild(scat.el);

  const sim = Lab.Section('Simulazione');
  sim.add(Lab.Slider({ label: 'Velocità', min: 0.2, max: 5, step: 0.2, value: P.speed, unit: '×',
    onChange: v => { P.speed = v; } }));
  ctrl.appendChild(sim.el);

  if (P.continuous) {
    const actions = document.createElement('div');
    actions.className = 'panel-actions';
    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn-secondary';
    resetBtn.textContent = 'AZZERA ISTOGRAMMA';
    resetBtn.addEventListener('click', () => { thetaHist = new Array(36).fill(0); totalShots = 0; });
    actions.appendChild(resetBtn);
    ctrl.appendChild(actions);
  }
}

// ── Resize ────────────────────────────────────────────────────────────────
function resize() {
  const area = sc.parentElement;
  const ga   = document.getElementById('graphArea');
  const rd   = area.querySelector('.readout-bar');
  const rdH  = rd ? rd.clientHeight || 48 : 48;
  const gaH  = ga ? ga.clientHeight || 190 : 190;

  SW = area.clientWidth;
  SH = Math.max(80, area.clientHeight - gaH - rdH);
  sc.width  = Math.round(SW * DPR); sc.height = Math.round(SH * DPR);
  sc.style.width = SW + 'px';       sc.style.height = SH + 'px';
  CX = SW / 2; CY = SH / 2;

  GW = area.clientWidth; GH = gaH;
  gc.width  = Math.round(GW * DPR); gc.height = Math.round(GH * DPR);
  gc.style.width = GW + 'px';       gc.style.height = GH + 'px';
}

// ── Loop ──────────────────────────────────────────────────────────────────
function loop(ts) {
  if (lastTS !== null) {
    const dt = Math.min((ts - lastTS) / 1000, 0.05);
    update(dt);
  }
  lastTS = ts;
  drawSim();
  drawGraph();
  updateReadout();
  requestAnimationFrame(loop);
}

function init() {
  anim.thetaDeg = P.theta;
  resize();
  buildControls();
  new ResizeObserver(resize).observe(sc.parentElement);
  requestAnimationFrame(loop);
}

init();
