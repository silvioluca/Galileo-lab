'use strict';

const P = {
  Rs: 0.18, rClock: 0.42, rOrbit: 0.76, rs2Frac: 0.24,
  showRays: false, showClocks: false, showFall: false, showOrbit: true,
};

const canvas    = document.getElementById('simCanvas');
const ctx       = canvas.getContext('2d');
const gCanvas   = document.getElementById('graphCanvas');
const gctx      = gCanvas.getContext('2d');
const graphArea = document.getElementById('graphArea');
const readoutEl = document.getElementById('readout');

let SW, SH, GW, GH, DPR;

function resize() {
  DPR = window.devicePixelRatio || 1;
  const area = canvas.parentElement;
  const gaH  = graphArea.offsetHeight;
  const rdH  = readoutEl.offsetHeight || 0;
  SW = area.clientWidth;
  SH = area.clientHeight - gaH - rdH;
  canvas.width        = SW * DPR;
  canvas.height       = SH * DPR;
  canvas.style.width  = SW + 'px';
  canvas.style.height = SH + 'px';
  GW = graphArea.clientWidth;
  GH = graphArea.clientHeight;
  gCanvas.width        = GW * DPR;
  gCanvas.height       = GH * DPR;
  gCanvas.style.width  = GW + 'px';
  gCanvas.style.height = GH + 'px';
  invalidateCache();
}

// ── Physics ───────────────────────────────────────────────────────────────────
function properDist(r, Rs) {
  if (r <= Rs) return 0;
  const x = r / Rs;
  return Rs * (Math.sqrt(x * (x - 1)) + Math.log(Math.sqrt(x) + Math.sqrt(x - 1)));
}
function timeFactor(r, Rs) {
  if (r <= Rs) return 0;
  return Math.sqrt(Math.max(0, 1 - Rs / r));
}
function bCrit(Rs) { return 1.5 * Math.sqrt(3) * Rs; }

// ── Flamm paraboloid ──────────────────────────────────────────────────────────
const WORLD_R = 15.0;

function flammZ(r, Rs) {
  if (r <= Rs) return 0;
  return 2.0 * Math.sqrt(Rs * (r - Rs));
}

function zAt(wx, wy, Rs, Rs2, ox, oy) {
  const r1   = Math.sqrt(wx * wx + wy * wy);
  const z1   = flammZ(r1, Rs);
  const dx   = wx - ox, dy = wy - oy;
  const r2sq = dx * dx + dy * dy;
  const sig  = Rs2 * 6.5;
  const dep  = 2.5 * Math.sqrt(Rs2 * sig) * 0.52;
  return z1 - dep * Math.exp(-r2sq / (sig * sig));
}

// ── Wavelength to RGB (handles infrared fade-out) ────────────────────────────
function nmToColor(nm) {
  let r = 0, g = 0, b = 0, sc = 1.0;
  if (nm > 780) {
    // infrared: fade to black through deep red
    sc = Math.max(0, 1 - (nm - 780) / 320);
    r  = 1;
  } else if (nm < 380) {
    r = 0.4; b = 0.8; sc = Math.max(0, (nm - 300) / 80) * 0.5;
  } else if (nm < 440) {
    r = -(nm - 440) / 60; b = 1;
  } else if (nm < 490) {
    g = (nm - 440) / 50; b = 1;
  } else if (nm < 510) {
    g = 1; b = -(nm - 510) / 20;
  } else if (nm < 580) {
    r = (nm - 510) / 70; g = 1;
  } else if (nm < 645) {
    r = 1; g = -(nm - 645) / 65;
  } else {
    r = 1;
  }
  const cl = x => Math.round(Math.max(0, Math.min(1, x)) * 255 * sc);
  return 'rgb(' + cl(r) + ',' + cl(g) + ',' + cl(b) + ')';
}

// ── 3D camera & projection ────────────────────────────────────────────────────
const CAM = { azim: 0.38, elev: 0.50, fov: 30 };
let zoomFactor = 4.5;

let _ca = 1, _sa = 0, _ce = 1, _se = 0, _ps = 160;
function updateProjCache() {
  _ca = Math.cos(CAM.azim); _sa = Math.sin(CAM.azim);
  _ce = Math.cos(CAM.elev); _se = Math.sin(CAM.elev);
  _ps = Math.min(SW, SH) * 0.028 * zoomFactor;
}

function project3D(wx, wy, wz) {
  const rx =  wx * _ca + wy * _sa;
  const ry = -wx * _sa + wy * _ca;
  const px = rx;
  const py = ry * _ce + wz * _se;
  const pz = -ry * _se + wz * _ce;
  const d  = CAM.fov - pz;
  if (d < 0.01) return null;
  const sc = (CAM.fov / d) * _ps;
  return { sx: SW * 0.50 + px * sc, sy: SH * 0.52 - py * sc, depth: pz };
}

// ── Interaction ───────────────────────────────────────────────────────────────
(function () {
  let drag = false, lx = 0, ly = 0, lpd = 0;
  function startDrag(x, y) { drag = true; lx = x; ly = y; }
  function doDrag(x, y) {
    if (!drag) return;
    CAM.azim += (x - lx) * 0.006;
    CAM.elev  = Math.max(0.08, Math.min(1.35, CAM.elev - (y - ly) * 0.006));
    lx = x; ly = y; invalidateCache();
  }
  function endDrag() { drag = false; }
  canvas.addEventListener('mousedown',  e => startDrag(e.clientX, e.clientY));
  window.addEventListener('mousemove',  e => doDrag(e.clientX, e.clientY));
  window.addEventListener('mouseup',    endDrag);
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    zoomFactor = Math.max(0.20, Math.min(20.0, zoomFactor * (e.deltaY > 0 ? 0.90 : 1.11)));
  }, { passive: false });
  canvas.addEventListener('touchstart', e => {
    if (e.touches.length === 1) startDrag(e.touches[0].clientX, e.touches[0].clientY);
    else if (e.touches.length === 2) {
      drag = false;
      lpd = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                       e.touches[0].clientY - e.touches[1].clientY);
    }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    if (e.touches.length === 1 && drag) doDrag(e.touches[0].clientX, e.touches[0].clientY);
    else if (e.touches.length === 2 && lpd > 0) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                           e.touches[0].clientY - e.touches[1].clientY);
      zoomFactor = Math.max(0.20, Math.min(20.0, zoomFactor * d / lpd));
      lpd = d;
    }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchend', () => { endDrag(); lpd = 0; });
}());

// ── Photon geodesics ──────────────────────────────────────────────────────────
function findUmin(b, Rs) {
  if (b <= 0) return 1 / Rs;
  let u = 0.5 / b;
  for (let i = 0; i < 40; i++) {
    const s  = Math.sqrt(Math.max(1e-12, 1 - Rs * u));
    const f  = u * s - 1 / b;
    const df = s - Rs * u / (2 * s);
    if (Math.abs(df) < 1e-15) break;
    u -= f / df;
    u  = Math.max(1e-9, Math.min(u, 0.99 / Rs));
  }
  return u;
}

function integratePhotonHalf(b, Rs) {
  const u_min = findUmin(b, Rs);
  let u = u_min, v = 1e-9, phi = Math.PI / 2;
  const dPhi = 0.008, pts = [{ r: 1 / u, phi }], rMax = WORLD_R * 1.10;
  for (let i = 0; i < 5000; i++) {
    const r = 1 / u;
    if (r < Rs * 1.01 || r > rMax) { pts.push({ r, phi }); break; }
    const f  = (uu, vv) => ({ du: vv, dv: 1.5 * Rs * uu * uu - uu });
    const k1 = f(u, v);
    const k2 = f(u + dPhi / 2 * k1.du, v + dPhi / 2 * k1.dv);
    const k3 = f(u + dPhi / 2 * k2.du, v + dPhi / 2 * k2.dv);
    const k4 = f(u + dPhi * k3.du,     v + dPhi * k3.dv);
    u   += dPhi / 6 * (k1.du + 2 * k2.du + 2 * k3.du + k4.du);
    v   += dPhi / 6 * (k1.dv + 2 * k2.dv + 2 * k3.dv + k4.dv);
    phi += dPhi;
    pts.push({ r: 1 / u, phi });
  }
  return pts;
}

function photonToXY(pts) {
  const xy = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const { r, phi } = pts[i];
    xy.push({ x: -r * Math.cos(phi), y: r * Math.sin(phi) });
  }
  for (const { r, phi } of pts) xy.push({ x: r * Math.cos(phi), y: r * Math.sin(phi) });
  return xy;
}

function buildRays(Rs) {
  const bc = bCrit(Rs);
  return [0.85, 1.02, 1.15, 1.40, 1.90, 3.20].map(f => photonToXY(integratePhotonHalf(f * bc, Rs)));
}

let cachedRays = null, cachedRs = -1;
function invalidateCache() { cachedRs = -1; }
function getRays() {
  if (cachedRs !== P.Rs) { cachedRays = buildRays(P.Rs); cachedRs = P.Rs; }
  return cachedRays;
}

// ── Colors ────────────────────────────────────────────────────────────────────
function getCSSVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function getColors() {
  const light = document.documentElement.dataset.theme === 'light';
  return {
    bg:    getCSSVar('--bg1')            || (light ? '#f0f2f5' : '#060a10'),
    bg2:   getCSSVar('--bg2')            || (light ? '#ffffff' : '#0b1018'),
    grid:  light ? 'rgba(0,100,180,0.22)' : 'rgba(60,190,230,0.30)',
    text:  getCSSVar('--text-primary')   || (light ? '#0d1a26' : '#ddeeff'),
    muted: getCSSVar('--text-secondary') || (light ? '#4a6278' : '#6b8099'),
    accent:getCSSVar('--accent')         || (light ? '#0099cc' : '#00d4ff'),
    spCol: light ? '#c04800' : '#ffa030',
    light,
  };
}

// ── Infall simulation ─────────────────────────────────────────────────────────
// Radial geodesic in Schwarzschild: dr/dt = -(1-Rs/r)/E * sqrt(E^2-(1-Rs/r))
// E = sqrt(1-Rs/r0) for a particle falling from rest at r0.
// Observed frequency ratio (emitter infalling radially, observer at infinity):
//   f_obs / f_emit = (1-Rs/r) / (E + sqrt(E^2-(1-Rs/r)))
const LAMBDA_EMIT    = 560;   // nm — emitted wavelength (yellow-green)
const EMIT_IV_PROPER = 0.30;  // proper-time units between signal emissions

const fall = {
  r: 0, E: 0, r0: 0,
  realAge: 0, properAge: 0,
  lastEmitProper: -1e9,
  signals: [],
};

function resetFall(Rs) {
  fall.r0 = Math.max(Rs * 9, 0.30);
  fall.r  = fall.r0 * (1 - 2e-4);  // tiny inward nudge so RK4 starts (sq>0)
  fall.E  = Math.sqrt(Math.max(0.001, 1 - Rs / fall.r0));
  fall.realAge        = 0;
  fall.properAge      = 0;
  fall.lastEmitProper = -1e9;
  fall.signals.length = 0;
}

function fallDrDt(r, Rs, E) {
  const f  = Math.max(0, 1 - Rs / r);
  const sq = E * E - f;
  if (sq <= 0) return 0;
  return -(f / E) * Math.sqrt(sq);
}

function fallFreqRatio(r, Rs, E) {
  const f    = Math.max(1e-8, 1 - Rs / r);
  const sq   = Math.max(0, E * E - f);
  const denom = E + Math.sqrt(sq);
  return denom > 1e-9 ? f / denom : 0;
}

// ── Time ──────────────────────────────────────────────────────────────────────
let running = true, coordT = 0, lastTS = null;
const T_RATE = 3.0;

function resetSim() {
  coordT = 0; lastTS = null;
  resetFall(P.Rs);
}
function setRunning(v) {
  running = v;
  document.getElementById('btnPlay').textContent = v ? '⏸  PAUSA' : '▶  RIPRENDI';
}

// ── Clock drawing ─────────────────────────────────────────────────────────────
function drawClock(cx, cy, rad, tau, color, C, label) {
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.fillStyle = C.bg2 || C.bg;
  ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();

  for (let i = 0; i < 12; i++) {
    const a  = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const r0 = i % 3 === 0 ? rad * 0.76 : rad * 0.85;
    ctx.strokeStyle = color; ctx.lineWidth = i % 3 === 0 ? 1.5 : 0.8;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0,         cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * rad * 0.94, cy + Math.sin(a) * rad * 0.94);
    ctx.stroke();
  }
  const secAngle = (tau % 60)   / 60   * Math.PI * 2 - Math.PI / 2;
  const hrAngle  = (tau % 3600) / 3600 * Math.PI * 2 - Math.PI / 2;
  ctx.strokeStyle = color; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(secAngle) * rad * 0.80, cy + Math.sin(secAngle) * rad * 0.80);
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(hrAngle)  * rad * 0.52, cy + Math.sin(hrAngle)  * rad * 0.52);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(cx, cy, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color; ctx.font = '9px Space Mono, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(label, cx, cy + rad + 4);
  ctx.textBaseline = 'alphabetic';
}

// ── Main 3D canvas ────────────────────────────────────────────────────────────
function drawMain(C) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, SW, SH);
  updateProjCache();

  const Rs   = P.Rs;
  const rOrb = Math.max(P.rOrbit, Rs * 2.2);
  const omega    = Math.sqrt(Rs / (2.0 * rOrb * rOrb * rOrb));
  const orbAngle = omega * coordT;
  const orbX = P.showOrbit ? rOrb * Math.cos(orbAngle) : 0;
  const orbY = P.showOrbit ? rOrb * Math.sin(orbAngle) : 0;
  const Rs2  = P.showOrbit ? Rs * P.rs2Frac : 0;

  // ── Grid ───────────────────────────────────────────────────────────────────
  {
    const STEP = 0.5, NSAMP = 200;
    const lines = [];
    function buildLine(pts) {
      let dSum = 0, n = 0;
      for (const p of pts) { if (p) { dSum += p.depth; n++; } }
      lines.push({ pts, avgDepth: n > 0 ? dSum / n : 0 });
    }
    for (let xW = -WORLD_R; xW <= WORLD_R + 1e-6; xW += STEP) {
      const pts = [];
      for (let k = 0; k <= NSAMP; k++) {
        const yW = -WORLD_R + 2 * WORLD_R * k / NSAMP;
        const r  = Math.sqrt(xW * xW + yW * yW);
        pts.push(r < Rs * 0.97 ? null : project3D(xW, yW, zAt(xW, yW, Rs, Rs2, orbX, orbY)));
      }
      buildLine(pts);
    }
    for (let yW = -WORLD_R; yW <= WORLD_R + 1e-6; yW += STEP) {
      const pts = [];
      for (let k = 0; k <= NSAMP; k++) {
        const xW = -WORLD_R + 2 * WORLD_R * k / NSAMP;
        const r  = Math.sqrt(xW * xW + yW * yW);
        pts.push(r < Rs * 0.97 ? null : project3D(xW, yW, zAt(xW, yW, Rs, Rs2, orbX, orbY)));
      }
      buildLine(pts);
    }
    lines.sort((a, b) => a.avgDepth - b.avgDepth);
    ctx.lineWidth = 0.9; ctx.strokeStyle = C.grid;
    for (const { pts } of lines) {
      ctx.beginPath(); let started = false;
      for (const p of pts) {
        if (!p) { started = false; continue; }
        if (!started) { ctx.moveTo(p.sx, p.sy); started = true; }
        else          { ctx.lineTo(p.sx, p.sy); }
      }
      ctx.stroke();
    }
  }

  // ── Photon geodesics ────────────────────────────────────────────────────────
  if (P.showRays) {
    const rays = getRays();
    const rayColors = [
      C.light ? 'rgba(200,0,0,0.80)'   : 'rgba(255,80,80,0.85)',
      C.light ? 'rgba(220,140,0,0.75)' : 'rgba(255,200,60,0.80)',
      C.light ? 'rgba(0,140,60,0.70)'  : 'rgba(60,220,120,0.75)',
      C.light ? 'rgba(0,100,200,0.70)' : 'rgba(80,180,255,0.75)',
      C.light ? 'rgba(80,0,180,0.65)'  : 'rgba(160,120,255,0.70)',
      C.light ? 'rgba(0,160,160,0.60)' : 'rgba(60,220,220,0.65)',
    ];
    rays.forEach((ray, ri) => {
      ctx.strokeStyle = rayColors[ri]; ctx.lineWidth = 1.6;
      ctx.beginPath(); let started = false;
      for (const { x, y } of ray) {
        const r = Math.sqrt(x * x + y * y);
        if (r < Rs * 0.97 || r > WORLD_R * 1.02) { started = false; continue; }
        const p = project3D(x, y, flammZ(r, Rs));
        if (!p) { started = false; continue; }
        if (!started) { ctx.moveTo(p.sx, p.sy); started = true; }
        else          { ctx.lineTo(p.sx, p.sy); }
      }
      ctx.stroke();
    });
  }

  // ── Signal rings from infalling body ─────────────────────────────────────
  if (P.showFall) {
    for (const s of fall.signals) {
      const p = project3D(s.wx, s.wy, s.wz);
      if (!p) continue;
      const age    = fall.realAge - s.birthRealT;
      const maxAge = 3.5;
      if (age > maxAge) continue;
      const alpha  = Math.max(0, 1 - age / maxAge);
      const rPx    = age * 55 + 4;
      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = s.color;
      ctx.lineWidth   = 2.0;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, rPx, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ── Accretion glow ─────────────────────────────────────────────────────────
  const cP = project3D(0, 0, 0);
  if (cP) {
    const eP  = project3D(Rs, 0, 0);
    const glR = eP ? Math.hypot(eP.sx - cP.sx, eP.sy - cP.sy) * 3.8 : 55;
    const g   = ctx.createRadialGradient(cP.sx, cP.sy, 0, cP.sx, cP.sy, glR);
    g.addColorStop(0,   C.light ? 'rgba(200,120,0,0.55)' : 'rgba(255,150,30,0.50)');
    g.addColorStop(0.5, C.light ? 'rgba(200,80,0,0.12)'  : 'rgba(255,100,20,0.10)');
    g.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, SW, SH);
  }

  // ── Event horizon ───────────────────────────────────────────────────────────
  const horPts = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const p = project3D(Rs * Math.cos(a), Rs * Math.sin(a), 0);
    if (p) horPts.push(p);
  }
  if (horPts.length > 2) {
    ctx.beginPath(); ctx.moveTo(horPts[0].sx, horPts[0].sy);
    for (let i = 1; i < horPts.length; i++) ctx.lineTo(horPts[i].sx, horPts[i].sy);
    ctx.closePath(); ctx.fillStyle = '#000000'; ctx.fill();
    ctx.strokeStyle = C.light ? 'rgba(255,140,0,0.85)' : 'rgba(255,160,50,0.75)';
    ctx.lineWidth   = 2.2; ctx.stroke();
  }

  // ── Photon sphere ring ──────────────────────────────────────────────────────
  {
    const rPh = 1.5 * Rs, zPh = flammZ(rPh, Rs);
    ctx.strokeStyle = C.light ? 'rgba(255,200,0,0.55)' : 'rgba(255,200,0,0.48)';
    ctx.lineWidth   = 1.0; ctx.setLineDash([4, 4]);
    ctx.beginPath(); let started = false;
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const p = project3D(rPh * Math.cos(a), rPh * Math.sin(a), zPh);
      if (!p) { started = false; continue; }
      if (!started) { ctx.moveTo(p.sx, p.sy); started = true; }
      else          { ctx.lineTo(p.sx, p.sy); }
    }
    ctx.stroke(); ctx.setLineDash([]);
  }

  // ── Orbiting massive body ───────────────────────────────────────────────────
  const zOrb = zAt(orbX, orbY, Rs, Rs2, orbX, orbY);
  const orbP = P.showOrbit ? project3D(orbX, orbY, zOrb) : null;
  if (orbP) {
    const sR  = Math.max(5, Math.min(28, _ps * 0.070 * Math.sqrt(P.rs2Frac / 0.24)));
    ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(orbP.sx + sR * 0.22, orbP.sy + sR * 0.65, sR * 0.90, sR * 0.28, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.restore();
    const grd = ctx.createRadialGradient(orbP.sx - sR * 0.38, orbP.sy - sR * 0.38, 0, orbP.sx, orbP.sy, sR);
    grd.addColorStop(0.00, 'rgba(210,230,255,1.0)');
    grd.addColorStop(0.30, 'rgba(110,160,215,0.95)');
    grd.addColorStop(0.70, 'rgba(35,70,140,0.92)');
    grd.addColorStop(1.00, 'rgba(8,20,55,0.80)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(orbP.sx, orbP.sy, sR, 0, Math.PI * 2); ctx.fill();
  }

  // ── Infalling body ─────────────────────────────────────────────────────────
  if (P.showFall) {
    const rf = fall.r;
    if (rf > Rs * 1.01) {
      const fRatio  = fallFreqRatio(rf, Rs, fall.E);
      const lambObs = LAMBDA_EMIT / Math.max(1e-9, fRatio);
      const bodyCol = nmToColor(lambObs);
      const zf = flammZ(rf, Rs);
      const fp = project3D(rf, 0, zf);
      if (fp) {
        const sR = Math.max(5, Math.min(18, _ps * 0.055));
        // Glow matching observed color
        const glr = ctx.createRadialGradient(fp.sx, fp.sy, 0, fp.sx, fp.sy, sR * 2.5);
        glr.addColorStop(0,   bodyCol.replace(')', ',0.45)').replace('rgb(', 'rgba('));
        glr.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = glr;
        ctx.beginPath(); ctx.arc(fp.sx, fp.sy, sR * 2.5, 0, Math.PI * 2); ctx.fill();
        // Sphere
        const grd = ctx.createRadialGradient(fp.sx - sR * 0.35, fp.sy - sR * 0.35, 0, fp.sx, fp.sy, sR);
        grd.addColorStop(0, 'rgba(255,255,220,1.0)');
        grd.addColorStop(0.4, bodyCol.replace(')', ',1.0)').replace('rgb(', 'rgba('));
        grd.addColorStop(1, 'rgba(0,0,0,0.7)');
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(fp.sx, fp.sy, sR, 0, Math.PI * 2); ctx.fill();
        // Redshift label
        ctx.fillStyle    = bodyCol;
        ctx.font         = '9px Space Mono, monospace';
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('z = ' + (Lab.fmt((1 / Math.max(1e-9, fRatio) - 1),2)),
                     fp.sx + sR + 4, fp.sy);
        ctx.textBaseline = 'alphabetic';
      }
    }
  }

  // ── Clocks ──────────────────────────────────────────────────────────────────
  if (P.showClocks) {
    const rNear   = Math.max(P.rClock, Rs * 1.05);
    const rFar    = rOrb;
    const tauNear = coordT * timeFactor(rNear, Rs);
    const tauFar  = coordT * timeFactor(rFar,  Rs);
    const clockR  = Math.min(SW, SH) * 0.052;
    const nA  = Math.PI / 5;
    const nCX = rNear * Math.cos(nA), nCY = rNear * Math.sin(nA);
    const fCX = P.showOrbit ? orbX : rFar * Math.cos(-Math.PI / 4);
    const fCY = P.showOrbit ? orbY : rFar * Math.sin(-Math.PI / 4);
    const nearP = project3D(nCX, nCY, zAt(nCX, nCY, Rs, Rs2, orbX, orbY));
    const farP  = project3D(fCX, fCY, zAt(fCX, fCY, Rs, Rs2, orbX, orbY));
    if (farP)  drawClock(farP.sx,  farP.sy,  clockR, tauFar,  C.accent, C,
      'r = ' + Lab.fmt((rFar / Rs),1) + ' Rs');
    if (nearP) drawClock(nearP.sx, nearP.sy, clockR, tauNear, C.spCol,  C,
      'r = ' + Lab.fmt((rNear / Rs),1) + ' Rs');
  }

  // ── Labels ──────────────────────────────────────────────────────────────────
  ctx.fillStyle = C.muted; ctx.font = '10px Space Mono, monospace';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('Rs = ' + Lab.fmt(Rs,2), 12, 12);
  ctx.fillStyle = C.light ? 'rgba(180,140,0,0.90)' : 'rgba(255,200,0,0.90)';
  ctx.textAlign = 'right';
  ctx.fillText('r = 1.5 Rs  sfera fotonica', SW - 12, 12);
  ctx.fillStyle = C.muted; ctx.font = '9px DM Sans, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText('scroll zoom  |  trascina per ruotare', SW / 2, SH - 4);
  ctx.textBaseline = 'alphabetic';
}

// ── Graph panel ───────────────────────────────────────────────────────────────
function drawGraph(C) {
  gctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  gctx.fillStyle = C.bg; gctx.fillRect(0, 0, GW, GH);
  const w3 = GW / 3;
  drawFlammProfile(C, 0, w3);
  drawTimeDilation(C, w3, w3);
  drawDeflection(C, 2 * w3, w3);
  gctx.strokeStyle = C.light ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.07)';
  gctx.lineWidth   = 1;
  [w3, 2 * w3].forEach(x => {
    gctx.beginPath(); gctx.moveTo(x, 0); gctx.lineTo(x, GH); gctx.stroke();
  });
}

function drawFlammProfile(C, x0, pw) {
  gctx.save(); gctx.beginPath(); gctx.rect(x0, 0, pw, GH); gctx.clip();
  const PAD = { t: 20, b: 22, l: 28, r: 8 };
  const iw  = pw - PAD.l - PAD.r, ih = GH - PAD.t - PAD.b;
  const ax  = x0 + PAD.l, ay = PAD.t + ih;
  const Rs  = P.Rs, rMax = 10 * Rs, zMax = 2 * Math.sqrt(Rs * (rMax - Rs));
  function rx(r) { return ax + (r - Rs) / (rMax - Rs) * iw; }
  function zy(z) { return ay - z / zMax * ih; }
  gctx.fillStyle = C.muted; gctx.font = '700 8px Space Mono, monospace';
  gctx.textAlign = 'center'; gctx.textBaseline = 'top';
  gctx.fillText('PARABOLOIDE DI FLAMM', x0 + pw / 2, 3);
  gctx.strokeStyle = C.muted; gctx.lineWidth = 1;
  gctx.beginPath(); gctx.moveTo(ax, PAD.t); gctx.lineTo(ax, ay); gctx.lineTo(ax + iw, ay); gctx.stroke();
  gctx.beginPath();
  for (let i = 0; i <= 150; i++) {
    const r = Rs + (rMax - Rs) * i / 150, z = 2 * Math.sqrt(Rs * (r - Rs));
    i === 0 ? gctx.moveTo(rx(r), zy(z)) : gctx.lineTo(rx(r), zy(z));
  }
  gctx.lineTo(ax + iw, ay); gctx.closePath();
  gctx.fillStyle = C.light ? 'rgba(0,100,200,0.08)' : 'rgba(0,180,255,0.07)'; gctx.fill();
  gctx.strokeStyle = C.accent; gctx.lineWidth = 2; gctx.beginPath();
  for (let i = 0; i <= 150; i++) {
    const r = Rs + (rMax - Rs) * i / 150, z = 2 * Math.sqrt(Rs * (r - Rs));
    i === 0 ? gctx.moveTo(rx(r), zy(z)) : gctx.lineTo(rx(r), zy(z));
  }
  gctx.stroke();
  gctx.strokeStyle = C.light ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.20)';
  gctx.lineWidth = 1; gctx.setLineDash([3, 3]);
  gctx.beginPath(); gctx.moveTo(ax, PAD.t); gctx.lineTo(ax, ay); gctx.stroke(); gctx.setLineDash([]);
  const rc = P.rClock;
  if (rc > Rs && rc < rMax) {
    gctx.fillStyle = C.spCol;
    gctx.beginPath(); gctx.arc(rx(rc), zy(2 * Math.sqrt(Rs * (rc - Rs))), 4, 0, Math.PI * 2); gctx.fill();
  }
  if (P.showFall && fall.r > Rs && fall.r < rMax) {
    const fRatio = fallFreqRatio(fall.r, Rs, fall.E);
    gctx.fillStyle = nmToColor(LAMBDA_EMIT / Math.max(1e-9, fRatio));
    gctx.beginPath(); gctx.arc(rx(fall.r), zy(2 * Math.sqrt(Rs * (fall.r - Rs))), 4, 0, Math.PI * 2); gctx.fill();
  }
  gctx.fillStyle = C.muted; gctx.font = '7px Space Mono, monospace';
  gctx.textAlign = 'center'; gctx.textBaseline = 'top'; gctx.fillText('r / Rs', ax + iw / 2, ay + 5);
  [2, 4, 6, 8, 10].forEach(n => {
    const xx = rx(n * Rs);
    if (xx < ax + iw) {
      gctx.fillText(n, xx, ay + 5);
      gctx.strokeStyle = C.grid; gctx.lineWidth = 0.5;
      gctx.beginPath(); gctx.moveTo(xx, ay); gctx.lineTo(xx, ay + 3); gctx.stroke();
    }
  });
  gctx.textAlign = 'right'; gctx.textBaseline = 'middle'; gctx.fillText('z', ax - 3, PAD.t + ih / 2);
  gctx.restore();
}

function drawTimeDilation(C, x0, pw) {
  gctx.save(); gctx.beginPath(); gctx.rect(x0, 0, pw, GH); gctx.clip();
  const PAD = { t: 20, b: 22, l: 28, r: 8 };
  const iw  = pw - PAD.l - PAD.r, ih = GH - PAD.t - PAD.b;
  const ax  = x0 + PAD.l, ay = PAD.t + ih;
  const Rs  = P.Rs, rMax = 10 * Rs;
  function rx(r) { return ax + (r / rMax) * iw; }
  function ty(t) { return ay - t * ih; }
  gctx.fillStyle = C.muted; gctx.font = '700 8px Space Mono, monospace';
  gctx.textAlign = 'center'; gctx.textBaseline = 'top';
  gctx.fillText('DILATAZIONE TEMPORALE', x0 + pw / 2, 3);
  gctx.strokeStyle = C.muted; gctx.lineWidth = 1;
  gctx.beginPath(); gctx.moveTo(ax, PAD.t); gctx.lineTo(ax, ay); gctx.lineTo(ax + iw, ay); gctx.stroke();
  [0.25, 0.5, 0.75, 1.0].forEach(tv => {
    gctx.strokeStyle = C.grid; gctx.lineWidth = 0.5;
    gctx.beginPath(); gctx.moveTo(ax, ty(tv)); gctx.lineTo(ax + iw, ty(tv)); gctx.stroke();
    gctx.fillStyle = C.muted; gctx.font = '7px Space Mono, monospace';
    gctx.textAlign = 'right'; gctx.textBaseline = 'middle'; gctx.fillText(Lab.fmt(tv,2), ax - 3, ty(tv));
  });
  gctx.strokeStyle = C.accent; gctx.lineWidth = 2; gctx.beginPath();
  let first = true;
  for (let i = 1; i <= 200; i++) {
    const r = Rs + (rMax - Rs) * i / 200, tv = timeFactor(r, Rs);
    if (first) { gctx.moveTo(rx(r), ty(tv)); first = false; } else gctx.lineTo(rx(r), ty(tv));
  }
  gctx.stroke();
  const rc = P.rClock;
  if (rc > Rs && rc < rMax) {
    const tv = timeFactor(rc, Rs);
    gctx.fillStyle = C.spCol; gctx.strokeStyle = C.bg; gctx.lineWidth = 1.5;
    gctx.beginPath(); gctx.arc(rx(rc), ty(tv), 4.5, 0, Math.PI * 2); gctx.fill(); gctx.stroke();
    gctx.fillStyle = C.spCol; gctx.font = '8px Space Mono, monospace';
    gctx.textAlign = rc > rMax * 0.6 ? 'right' : 'left'; gctx.textBaseline = 'bottom';
    gctx.fillText(Lab.fmt(tv,3), rx(rc) + (rc > rMax * 0.6 ? -6 : 6), ty(tv) - 3);
  }
  // Show infall position on time-dilation curve
  if (P.showFall && fall.r > Rs && fall.r < rMax) {
    const fRatio = fallFreqRatio(fall.r, Rs, fall.E);
    gctx.fillStyle = nmToColor(LAMBDA_EMIT / Math.max(1e-9, fRatio));
    gctx.beginPath(); gctx.arc(rx(fall.r), ty(timeFactor(fall.r, Rs)), 4.5, 0, Math.PI * 2); gctx.fill();
  }
  gctx.fillStyle = C.muted; gctx.font = '7px Space Mono, monospace';
  gctx.textAlign = 'center'; gctx.textBaseline = 'top'; gctx.fillText('r / Rs', ax + iw / 2, ay + 5);
  [2, 4, 6, 8, 10].forEach(n => {
    const xx = rx(n * Rs);
    if (xx < ax + iw) {
      gctx.fillText(n, xx, ay + 5);
      gctx.strokeStyle = C.grid; gctx.lineWidth = 0.5;
      gctx.beginPath(); gctx.moveTo(xx, ay); gctx.lineTo(xx, ay + 3); gctx.stroke();
    }
  });
  gctx.textAlign = 'right'; gctx.textBaseline = 'middle'; gctx.fillText('dt/dt', ax - 3, PAD.t + ih / 2);
  gctx.restore();
}

function drawDeflection(C, x0, pw) {
  gctx.save(); gctx.beginPath(); gctx.rect(x0, 0, pw, GH); gctx.clip();
  const PAD  = { t: 20, b: 22, l: 32, r: 8 };
  const iw   = pw - PAD.l - PAD.r, ih = GH - PAD.t - PAD.b;
  const ax   = x0 + PAD.l, ay = PAD.t + ih;
  const Rs   = P.Rs, bc = bCrit(Rs), bMax = 6 * bc, aMax = Math.PI * 1.1;
  function bx(b)  { return ax + (b / bMax) * iw; }
  function ay_(a) { return ay - Math.min(a, aMax) / aMax * ih; }
  gctx.fillStyle = C.muted; gctx.font = '700 8px Space Mono, monospace';
  gctx.textAlign = 'center'; gctx.textBaseline = 'top';
  gctx.fillText('DEFLESSIONE LUCE', x0 + pw / 2, 3);
  gctx.strokeStyle = C.muted; gctx.lineWidth = 1;
  gctx.beginPath(); gctx.moveTo(ax, PAD.t); gctx.lineTo(ax, ay); gctx.lineTo(ax + iw, ay); gctx.stroke();
  gctx.strokeStyle = C.light ? 'rgba(255,0,0,0.30)' : 'rgba(255,80,80,0.35)';
  gctx.lineWidth = 1; gctx.setLineDash([3, 3]);
  gctx.beginPath(); gctx.moveTo(bx(bc), PAD.t); gctx.lineTo(bx(bc), ay); gctx.stroke(); gctx.setLineDash([]);
  gctx.strokeStyle = C.light ? 'rgba(0,0,200,0.35)' : 'rgba(120,180,255,0.45)';
  gctx.lineWidth = 1.2; gctx.setLineDash([4, 3]); gctx.beginPath();
  let firstW = true;
  for (let i = 1; i <= 150; i++) {
    const b = bc + (bMax - bc) * i / 150, a = 2 * Rs / b;
    if (firstW) { gctx.moveTo(bx(b), ay_(a)); firstW = false; } else gctx.lineTo(bx(b), ay_(a));
  }
  gctx.stroke(); gctx.setLineDash([]);
  gctx.strokeStyle = C.accent; gctx.lineWidth = 2; gctx.beginPath();
  let firstN = true;
  for (let i = 1; i <= 50; i++) {
    const b = bc * (1.01 + 5 * i / 50), half = integratePhotonHalf(b, Rs);
    if (half.length < 2) continue;
    const alpha = Math.max(0, 2 * (half[half.length - 1].phi - Math.PI / 2) - Math.PI);
    if (firstN) { gctx.moveTo(bx(b), ay_(alpha)); firstN = false; } else gctx.lineTo(bx(b), ay_(alpha));
  }
  gctx.stroke();
  gctx.fillStyle = C.muted; gctx.font = '7px Space Mono, monospace';
  gctx.textAlign = 'center'; gctx.textBaseline = 'top'; gctx.fillText('b / Rs', ax + iw / 2, ay + 5);
  [1, 2, 3, 4, 5].forEach(n => {
    const xx = bx(n * bc);
    if (xx > ax && xx < ax + iw) {
      gctx.fillText(Lab.fmt((n * 2.598),1), xx, ay + 5);
      gctx.strokeStyle = C.grid; gctx.lineWidth = 0.5;
      gctx.beginPath(); gctx.moveTo(xx, ay); gctx.lineTo(xx, ay + 3); gctx.stroke();
    }
  });
  gctx.textAlign = 'right'; gctx.textBaseline = 'middle'; gctx.fillText('α', ax - 3, PAD.t + ih / 2);
  const legX = x0 + pw - 5;
  gctx.font = '8px DM Sans, sans-serif'; gctx.textAlign = 'left'; gctx.textBaseline = 'middle';
  gctx.fillStyle = C.accent; gctx.fillRect(legX - 36, PAD.t + 4, 10, 2);
  gctx.fillText('Esatta', legX - 24, PAD.t + 5);
  gctx.strokeStyle = 'rgba(120,180,255,0.8)'; gctx.lineWidth = 1.2; gctx.setLineDash([4, 3]);
  gctx.beginPath(); gctx.moveTo(legX - 36, PAD.t + 17); gctx.lineTo(legX - 26, PAD.t + 17);
  gctx.stroke(); gctx.setLineDash([]);
  gctx.fillStyle = C.muted; gctx.fillText('Campo deb.', legX - 24, PAD.t + 17);
  gctx.restore();
}

// ── Readout ───────────────────────────────────────────────────────────────────
const readout = new Lab.Readout(readoutEl, [
  { key: 'Rs',     label: 'raggio di Schwarzschild Rs' },
  { key: 'rClock', label: 'distanza dell’orologio' },
  { key: 'tau',    label: 'tempo proprio τ' },
  { key: 'ratio',  label: 'ritmo dτ/dt = √(1 − Rs/r)' },
  { key: 'rOrb',   label: 'raggio dell’orbita' },
  { key: 'rFall',  label: 'distanza in caduta' },
  { key: 'zShift', label: 'redshift z' },
]);

// ── Controls ──────────────────────────────────────────────────────────────────
function buildControls() {
  const cont = document.getElementById('controls');
  cont.innerHTML = '';

  // ── Buco Nero ──
  const secBH = Lab.Section('Buco Nero');
  cont.appendChild(secBH.el);
  secBH.add(Lab.Slider({
    label: 'Rs  raggio di Schwarzschild',
    min: 0.06, max: 0.38, step: 0.01, value: P.Rs, unit: '',
    onChange(v) { P.Rs = v; resetFall(v); },
  }));

  // ── Corpo in orbita ──
  const secOrb = Lab.Section('Corpo massivo in orbita');
  cont.appendChild(secOrb.el);
  const orbPanel = Lab.SubPanel();
  if (!P.showOrbit) orbPanel.hide();
  orbPanel.add(Lab.Slider({
    label: 'Raggio orbita r',
    min: 0.20, max: 14.0, step: 0.10, value: P.rOrbit, unit: '',
    onChange(v) { P.rOrbit = v; },
  }));
  orbPanel.add(Lab.Slider({
    label: 'Massa relativa',
    min: 0.02, max: 0.70, step: 0.02, value: P.rs2Frac, unit: '',
    onChange(v) { P.rs2Frac = v; },
  }));
  secOrb.add(Lab.Toggle({
    label: 'Attiva',
    value: P.showOrbit,
    onChange(v) { P.showOrbit = v; v ? orbPanel.show() : orbPanel.hide(); },
  }));
  secOrb.add(orbPanel);

  // ── Dilatazione temporale ──
  const secClk = Lab.Section('Dilatazione temporale');
  cont.appendChild(secClk.el);
  const clkPanel = Lab.SubPanel();
  if (!P.showClocks) clkPanel.hide();
  clkPanel.add(Lab.Slider({
    label: 'Raggio orologio vicino r',
    min: 0.10, max: 14.0, step: 0.10, value: P.rClock, unit: '',
    onChange(v) { P.rClock = Math.max(v, P.Rs * 1.05); },
  }));
  secClk.add(Lab.Toggle({
    label: 'Mostra orologi',
    value: P.showClocks,
    onChange(v) { P.showClocks = v; v ? clkPanel.show() : clkPanel.hide(); },
  }));
  secClk.add(clkPanel);

  // ── Geodetiche fotoniche ──
  const secRays = Lab.Section('Geodetiche fotoniche');
  cont.appendChild(secRays.el);
  secRays.add(Lab.Toggle({
    label: 'Mostra raggi luminosi',
    value: P.showRays,
    onChange(v) { P.showRays = v; },
  }));

  // ── Caduta nel buco nero ──
  const secFall = Lab.Section('Caduta nel buco nero');
  cont.appendChild(secFall.el);
  secFall.add(Lab.Toggle({
    label: 'Attiva simulazione',
    value: P.showFall,
    onChange(v) { P.showFall = v; if (v) resetFall(P.Rs); },
  }));
}

// ── Loop ──────────────────────────────────────────────────────────────────────
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = lastTS === null ? 0 : Math.min((ts - lastTS) / 1000, 0.05);
  lastTS = ts;
  const dCoord = running && dt > 0 ? T_RATE * dt : 0;
  if (dCoord > 0) coordT += dCoord;

  const Rs   = P.Rs;
  const rc   = Math.max(P.rClock, Rs * 1.05);
  const tf   = timeFactor(rc, Rs);
  const rOrb = Math.max(P.rOrbit, Rs * 2.2);
  const omg  = Math.sqrt(Rs / (2.0 * rOrb * rOrb * rOrb));

  // Advance infall
  if (P.showFall && dCoord > 0) {
    fall.realAge += dt;
    if (fall.r > Rs * 1.002) {
      // RK4 on dr/dcoordT
      const k1 = fallDrDt(fall.r, Rs, fall.E);
      const k2 = fallDrDt(fall.r + dCoord / 2 * k1, Rs, fall.E);
      const k3 = fallDrDt(fall.r + dCoord / 2 * k2, Rs, fall.E);
      const k4 = fallDrDt(fall.r + dCoord * k3, Rs, fall.E);
      fall.r += dCoord / 6 * (k1 + 2 * k2 + 2 * k3 + k4);
      fall.r  = Math.max(fall.r, Rs * 1.002);
      // Proper time: dτ = (1-Rs/r)/E * dt_coord
      fall.properAge += dCoord * Math.max(0, 1 - Rs / fall.r) / fall.E;
    }
    // Emit at fixed proper-time intervals — spacing grows near horizon
    if (fall.properAge - fall.lastEmitProper >= EMIT_IV_PROPER) {
      const fRatio  = fallFreqRatio(fall.r, Rs, fall.E);
      const lambObs = LAMBDA_EMIT / Math.max(1e-9, fRatio);
      fall.signals.push({
        wx: fall.r, wy: 0, wz: flammZ(fall.r, Rs),
        birthRealT: fall.realAge,
        color:      nmToColor(lambObs),
        freqRatio:  fRatio,
      });
      fall.lastEmitProper = fall.properAge;
      fall.signals = fall.signals.filter(s => fall.realAge - s.birthRealT < 4.0);
    }
  }

  // Readout
  const fRatio = P.showFall ? fallFreqRatio(fall.r, Rs, fall.E) : null;
  readout.set('Rs',     '1 Rs = 2GM/c²');
  readout.set('rClock', Lab.fmt(rc / Rs, 2) + ' Rs');
  readout.set('tau',    Lab.fmt(coordT * tf, 3));
  readout.set('ratio',  Lab.fmt(tf, 4));
  readout.set('rOrb',   Lab.fmt(rOrb / Rs, 1) + ' Rs');
  readout.set('rFall',  P.showFall ? Lab.fmt(fall.r / Rs, 2) + ' Rs' : '—');
  readout.set('zShift', fRatio !== null ? Lab.fmt(1 / Math.max(1e-9, fRatio) - 1, 3) : '—');

  const C = getColors();
  drawMain(C);
  drawGraph(C);
}

// ── Init ──────────────────────────────────────────────────────────────────────
Lab.initTheme('themeToggle');
resetSim();
resize();
buildControls();
new ResizeObserver(resize).observe(canvas.parentElement);
document.getElementById('btnPlay').addEventListener('click',  () => setRunning(!running));
document.getElementById('btnReset').addEventListener('click', resetSim);
requestAnimationFrame(loop);
