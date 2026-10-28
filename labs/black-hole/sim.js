'use strict';

/* ── Canvas refs ────────────────────────────────────────────────────────── */
const sc   = document.getElementById('simCanvas');
const gc   = document.getElementById('graphCanvas');
const ctx  = sc.getContext('2d');
const gctx = gc.getContext('2d');
const DPR  = window.devicePixelRatio || 1;
let SW = 0, SH = 0, GW = 0, GH = 0;

/* ── Theme ──────────────────────────────────────────────────────────────── */
Lab.initTheme('themeToggle');
const dk = () => document.documentElement.dataset.theme !== 'light';

/* ── Parameters ─────────────────────────────────────────────────────────── */
const LP = { cx: 0.5, cy: 0.5 };
const OP = {
  M: 1, a: 0.0,
  L: 3.8, E2: 0.935, r0: 12, running: true,
  speed: 200,
  showLightRay: false, lightB: 8.0,
  showDisk: false,
};

/* ── Milky Way image ────────────────────────────────────────────────────── */
let mwData = null;
function loadMilkyway() {
  if (mwData) return;
  const img = new Image();
  img.onload = () => {
    const MAX = 2048, sc_ = Math.min(1, MAX / img.naturalWidth);
    const W = Math.round(img.naturalWidth * sc_), H = Math.round(img.naturalHeight * sc_);
    const tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    const tc = tmp.getContext('2d');
    tc.drawImage(img, 0, 0, W, H);
    // aprendo la pagina da file:// il browser vieta di leggere i pixel dell'immagine: si resta sul fondo stellato
    let id;
    try { id = tc.getImageData(0, 0, W, H); } catch (e) { return; }
    mwData = { px: id.data, W, H };
    invalidateLens();
    if (SW > 0 && GW > 0) draw();
  };
  img.src = 'milkyway.jpg';
}
function sampleMW(u, v) {
  if (!mwData) return [3, 5, 14];
  const { px, W, H } = mwData;
  const ix = ((Math.floor(u * W) % W) + W) % W;
  const iy = Math.max(0, Math.min(H - 1, Math.floor(v * H)));
  const p = (iy * W + ix) * 4;
  return [px[p], px[p + 1], px[p + 2]];
}

/* ── Physics helpers ────────────────────────────────────────────────────── */
const RS    = M => 2 * M;
const Rphot = M => 3 * M;
const Risco = M => 6 * M;
const Bcrit = M => 3 * Math.sqrt(3) * M;
const Rplus = (M, a) => M + Math.sqrt(Math.max(0, M*M - a*a));
const Rergo = M => 2 * M;  // equatorial static limit

function Veff2(r, M, L) {
  if (r <= RS(M)) return 0;
  return (1 - RS(M) / r) * (1 + L * L / (r * r));
}

// Kerr radial potential: orbit exists where Rkerr(r) >= 0
// ṙ² = Rkerr(r) / r⁴
function Rkerr(r, M, a, E, Lz) {
  const d = r*r - 2*M*r + a*a;
  const p = E*(r*r + a*a) - a*Lz;
  const q = Lz - a*E;
  return p*p - d*(q*q + r*r);
}

/* ── Photon ODE integration ─────────────────────────────────────────────── */
// u'' + u = 3Mu², u=1/r, prime=d/φ
// Returns { pts:[[x,y],...], captured }
function tracePhotonPath(b, M) {
  const R0 = 32 * M;
  if (b >= R0) return { pts: [], captured: false };
  const phi0 = Math.asin(Math.min(b / R0, 1));
  let u = 1 / R0, v = Math.cos(phi0) / b, phi = phi0;
  const dphi = 0.008, maxPhi = phi0 + 5 * Math.PI, rsCut = RS(M) * 1.02;
  const pts = [];
  let captured = false;
  while (phi < maxPhi) {
    const r = 1 / u;
    pts.push([r * Math.cos(phi), r * Math.sin(phi)]);
    if (r < rsCut) { captured = true; break; }
    if (r > R0 * 1.05 && phi > phi0 + 0.4) break;
    const acc = uu => 3 * M * uu * uu - uu;
    const k1u = v,              k1v = acc(u);
    const k2u = v+.5*dphi*k1v, k2v = acc(u+.5*dphi*k1u);
    const k3u = v+.5*dphi*k2v, k3v = acc(u+.5*dphi*k2u);
    const k4u = v+   dphi*k3v, k4v = acc(u+   dphi*k3u);
    u += dphi*(k1u+2*k2u+2*k3u+k4u)/6;
    v += dphi*(k1v+2*k2v+2*k3v+k4v)/6;
    phi += dphi;
  }
  return { pts, captured };
}

// Deflection angle via phi accumulation
function deflectionAngle(b, M) {
  const R0 = 32 * M;
  if (b >= R0) return 0;
  const phi0 = Math.asin(Math.min(b / R0, 1));
  let u = 1 / R0, v = Math.cos(phi0) / b, phi = phi0;
  const dphi = 0.008, maxPhi = phi0 + 6 * Math.PI, rsCut = RS(M) * 1.02;
  while (phi < maxPhi) {
    const r = 1 / u;
    if (r < rsCut) return NaN;
    if (r > R0 * 1.05 && phi > phi0 + 0.4) return Math.max(0, phi - phi0 - Math.PI);
    const acc = uu => 3 * M * uu * uu - uu;
    const k1u = v,              k1v = acc(u);
    const k2u = v+.5*dphi*k1v, k2v = acc(u+.5*dphi*k1u);
    const k3u = v+.5*dphi*k2v, k3v = acc(u+.5*dphi*k2u);
    const k4u = v+   dphi*k3v, k4v = acc(u+   dphi*k3u);
    u += dphi*(k1u+2*k2u+2*k3u+k4u)/6;
    v += dphi*(k1v+2*k2v+2*k3v+k4v)/6;
    phi += dphi;
  }
  return NaN;
}

/* ── Deflection lookup table ────────────────────────────────────────────── */
let deflTable = null;
const DEFL_N = 900;

function buildDeflTable(M) {
  const bc = Bcrit(M);
  const lnMin = Math.log(3e-4), lnMax = Math.log(60);
  const bArr = new Float64Array(DEFL_N);
  const alpha = new Float64Array(DEFL_N);
  for (let i = 0; i < DEFL_N; i++) {
    const t = i / (DEFL_N - 1);
    const x = Math.exp(lnMin + t * (lnMax - lnMin));
    bArr[i] = bc * (1 + x);
    alpha[i] = deflectionAngle(bArr[i], M) ?? 0;
  }
  deflTable = { bArr, alpha, bc, M };
}

function lookupDefl(bPhy) {
  const { bArr, alpha } = deflTable;
  if (bPhy <= bArr[0]) return alpha[0] + 2;
  if (bPhy >= bArr[DEFL_N - 1]) return 0;
  let lo = 0, hi = DEFL_N - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; bArr[m] <= bPhy ? lo = m : hi = m; }
  const t = (bPhy - bArr[lo]) / (bArr[hi] - bArr[lo]);
  return alpha[lo] + t * (alpha[hi] - alpha[lo]);
}

/* ── Lens render cache ──────────────────────────────────────────────────── */
let lensCache = null;
function invalidateLens() { lensCache = null; }

function renderLens(M) {
  if (!deflTable || deflTable.M !== M) buildDeflTable(M);
  const bc = Bcrit(M), scale = Math.min(SW, SH) * 0.14 / Bcrit(1);
  const sp = scale * DPR, PW = Math.round(SW * DPR), PH = Math.round(SH * DPR);
  const cxP = LP.cx * PW, cyP = LP.cy * PH;
  const imgData = ctx.createImageData(PW, PH);
  const data = imgData.data;
  const ringW = bc * 0.06;

  for (let iy = 0; iy < PH; iy++) {
    for (let ix = 0; ix < PW; ix++) {
      const dx = ix - cxP, dy = cyP - iy;
      const bPx = Math.sqrt(dx * dx + dy * dy);
      const b = bPx / sp, phi = Math.atan2(dy, dx);
      const px = (iy * PW + ix) * 4;

      if (b < bc - ringW) {
        data[px] = 0; data[px+1] = 0; data[px+2] = 0; data[px+3] = 255;
      } else if (b < bc) {
        const t = (b - (bc - ringW)) / ringW, w = t * t;
        const a0 = lookupDefl(bc * 1.0001);
        const phiSrc = phi + a0;
        const u = (((cxP + bPx * Math.cos(phiSrc)) / PW) % 1 + 1) % 1;
        const v = Math.max(0, Math.min(1, (cyP - bPx * Math.sin(phiSrc)) / PH));
        const [sr, sg, sb] = sampleMW(u, v);
        data[px]   = Math.min(255, sr * 0.15 + 255 * w * 0.85) | 0;
        data[px+1] = Math.min(255, sg * 0.15 + 195 * w * 0.70) | 0;
        data[px+2] = Math.min(255, sb * 0.15 +  65 * w * 0.20) | 0;
        data[px+3] = 255;
      } else if (b < bc + ringW) {
        const t = 1 - (b - bc) / ringW;
        const alpha = lookupDefl(b);
        const phiSrc = phi + alpha;
        const u = (((cxP + bPx * Math.cos(phiSrc)) / PW) % 1 + 1) % 1;
        const v = Math.max(0, Math.min(1, (cyP - bPx * Math.sin(phiSrc)) / PH));
        const [sr, sg, sb] = sampleMW(u, v);
        const boost = 1 + t * t * 5.5;
        data[px]   = Math.min(255, sr * boost * 0.82 + 190 * t * t) | 0;
        data[px+1] = Math.min(255, sg * boost * 0.82 + 130 * t * t) | 0;
        data[px+2] = Math.min(255, sb * boost * 0.82 +  35 * t * t) | 0;
        data[px+3] = 255;
      } else {
        const alpha = lookupDefl(b);
        const phiSrc = phi + alpha;
        const u = (((cxP + bPx * Math.cos(phiSrc)) / PW) % 1 + 1) % 1;
        const v = Math.max(0, Math.min(1, (cyP - bPx * Math.sin(phiSrc)) / PH));
        const [r, g, bl] = sampleMW(u, v);
        data[px] = r; data[px+1] = g; data[px+2] = bl; data[px+3] = 255;
      }
    }
  }
  lensCache = { imgData, scale, bc, M };
  return lensCache;
}

/* ── Single light ray visualization ────────────────────────────────────── */
function drawLightRay(c, M, cx, cy, scale) {
  const b = OP.lightB;
  const dark = dk();
  const col = dark ? 'rgba(255,228,55,0.90)' : 'rgba(180,138,0,0.90)';
  const { pts, captured } = tracePhotonPath(b, M);
  if (pts.length < 2) return;

  // Extend ray backward from pts[0] to the canvas edge
  {
    const [x0p, y0p] = pts[0], [x1p, y1p] = pts[1];
    const sfx = cx + x0p * scale, sfy = cy - y0p * scale;
    const ddx = sfx - (cx + x1p * scale), ddy = sfy - (cy - y1p * scale);
    const cands = [];
    if (Math.abs(ddx) > 0.01) { cands.push((SW + 20 - sfx) / ddx); cands.push((-20 - sfx) / ddx); }
    if (Math.abs(ddy) > 0.01) { cands.push((SH + 20 - sfy) / ddy); cands.push((-20 - sfy) / ddy); }
    const tEdge = Math.min(...cands.filter(t => t > 0.1));
    if (isFinite(tEdge)) {
      c.beginPath(); c.strokeStyle = col; c.lineWidth = 1.9; c.setLineDash([]);
      c.moveTo(sfx + tEdge * ddx, sfy + tEdge * ddy);
      c.lineTo(sfx, sfy); c.stroke();
    }
  }

  c.beginPath(); c.strokeStyle = col; c.lineWidth = 1.9; c.setLineDash([]);
  let on = false;
  for (const [px_, py_] of pts) {
    const sx = cx + px_*scale, sy = cy - py_*scale;
    if (sx < -10 || sx > SW+10 || sy < -10 || sy > SH+10) {
      if (on) { c.stroke(); c.beginPath(); on = false; }
      continue;
    }
    on ? c.lineTo(sx, sy) : (c.moveTo(sx, sy), on = true);
  }
  if (on) c.stroke();

  // Extend forward from pts[last] to canvas edge (exit ray)
  if (!captured && pts.length >= 2) {
    const [xNm1, yNm1] = pts[pts.length - 2];
    const [xN, yN] = pts[pts.length - 1];
    const efx = cx + xN * scale, efy = cy - yN * scale;
    const ddx2 = efx - (cx + xNm1 * scale), ddy2 = efy - (cy - yNm1 * scale);
    const cands2 = [];
    if (Math.abs(ddx2) > 0.01) { cands2.push((SW + 20 - efx) / ddx2); cands2.push((-20 - efx) / ddx2); }
    if (Math.abs(ddy2) > 0.01) { cands2.push((SH + 20 - efy) / ddy2); cands2.push((-20 - efy) / ddy2); }
    const tEdge2 = Math.min(...cands2.filter(t => t > 0.1));
    if (isFinite(tEdge2)) {
      c.beginPath(); c.strokeStyle = col; c.lineWidth = 1.9; c.setLineDash([]);
      c.moveTo(efx, efy);
      c.lineTo(efx + tEdge2 * ddx2, efy + tEdge2 * ddy2); c.stroke();
    }
  }

  const step = Math.max(1, Math.floor(pts.length / 4));
  for (let i = step; i < pts.length - 3; i += step) {
    const [px1, py1] = pts[i];
    const [px2, py2] = pts[Math.min(i+4, pts.length-1)];
    const dx = (px2-px1)*scale, dy = -(py2-py1)*scale;
    const len = Math.sqrt(dx*dx+dy*dy);
    if (len < 1) continue;
    const ux = dx/len, uy = dy/len;
    const sx = cx+px1*scale, sy_ = cy-py1*scale;
    const as = 7;
    c.beginPath(); c.strokeStyle = col; c.lineWidth = 1.4;
    c.moveTo(sx, sy_);
    c.lineTo(sx - ux*as + uy*as*0.45, sy_ - uy*as - ux*as*0.45);
    c.moveTo(sx, sy_);
    c.lineTo(sx - ux*as - uy*as*0.45, sy_ - uy*as + ux*as*0.45);
    c.stroke();
  }

  if (deflTable) {
    const alpha_r = b > Bcrit(M) ? lookupDefl(b) : NaN;
    const [ex, ey] = pts[pts.length - 1];
    const sx = cx + ex*scale, sy_ = cy - ey*scale;
    if (!isNaN(alpha_r) && sx > 0 && sx < SW && sy_ > 0 && sy_ < SH) {
      const deg = Lab.fmt((alpha_r * 180 / Math.PI),1);
      c.font = '9px Space Mono'; c.fillStyle = dark?'rgba(255,228,55,0.80)':'rgba(140,100,0,0.80)';
      c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText(`α = ${deg}°`, sx+7, sy_);
    }
    if (captured) {
      c.font = '9px Space Mono'; c.fillStyle = dark?'rgba(255,120,50,0.80)':'rgba(200,60,0,0.80)';
      c.textAlign = 'center'; c.textBaseline = 'top';
      c.fillText('catturato', cx, cy + RS(M)*scale + 10);
    }
  }
}

/* ── Orbit integration (Kerr equatorial) ────────────────────────────────── */
// state = [r, φ, ṙ]  — using proper time τ as affine parameter
// Equations from Carter (1968): for equatorial θ=π/2, Σ=r²
//   ṙ² = R(r)/r⁴  where R = P² - Δ(Q²+r²),  P=E(r²+a²)-aLz,  Q=Lz-aE
//   r̈ = (R'r - 4R) / (2r⁵)
//   φ̇ = (-aE + Lz + aP/Δ) / r²
function stepOrbit(state, M, a, E, Lz, dt) {
  const Delta  = r => r*r - 2*M*r + a*a;
  const P      = r => E*(r*r + a*a) - a*Lz;
  const Q      = Lz - a*E;
  const Rfn    = r => { const p=P(r),d=Delta(r); return p*p - d*(Q*Q+r*r); };
  const dRfn   = r => { const p=P(r),d=Delta(r); return 4*E*r*p - (2*r-2*M)*(Q*Q+r*r) - d*2*r; };
  const rddot  = r => (dRfn(r)*r - 4*Rfn(r)) / (2*r*r*r*r*r);
  const phidot = r => { const d=Delta(r); return (-a*E + Lz + a*P(r)/d) / (r*r); };
  const f = (r_, phi_, rd_) => [rd_, phidot(r_), rddot(r_)];
  const [r,phi,rdot] = state;
  const [k1r,k1p,k1d] = f(r,phi,rdot);
  const [k2r,k2p,k2d] = f(r+.5*dt*k1r, phi+.5*dt*k1p, rdot+.5*dt*k1d);
  const [k3r,k3p,k3d] = f(r+.5*dt*k2r, phi+.5*dt*k2p, rdot+.5*dt*k2d);
  const [k4r,k4p,k4d] = f(r+   dt*k3r, phi+   dt*k3p, rdot+   dt*k3d);
  return [
    r    + dt*(k1r+2*k2r+2*k3r+k4r)/6,
    phi  + dt*(k1p+2*k2p+2*k3p+k4p)/6,
    rdot + dt*(k1d+2*k2d+2*k3d+k4d)/6,
  ];
}

let orbitState = null, orbitTrail = [], animId = null, lastTime = 0;
let lensDragging = false;

function initOrbit() {
  const M = OP.M, a = OP.a * M, Lz = OP.L * M, r0 = OP.r0 * M;
  const E = Math.sqrt(OP.E2);
  const R0 = Rkerr(r0, M, a, E, Lz);
  orbitState = [r0, 0, Math.sqrt(Math.max(0, R0)) / (r0 * r0)];
  orbitTrail = [];
}
function startAnim() { initOrbit(); lastTime = 0; animId = requestAnimationFrame(animLoop); }
function stopAnim()  { if (animId) { cancelAnimationFrame(animId); animId = null; } }

function animLoop(time) {
  if (!animId) return;
  const dtReal = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
  lastTime = time;
  if (dtReal > 0 && OP.running && orbitState) {
    const M = OP.M, a = OP.a * M, Lz = OP.L * M, E = Math.sqrt(OP.E2);
    const rCapture = Rplus(M, a) * 1.02;
    const substeps = 80, dtSim = dtReal * OP.speed;
    for (let i = 0; i < substeps; i++) {
      orbitState = stepOrbit(orbitState, M, a, E, Lz, dtSim / substeps);
      const [r, phi] = orbitState;
      if (r < rCapture || r > 500*M) { orbitState = null; break; }
      orbitTrail.push([r*Math.cos(phi), r*Math.sin(phi)]);
      if (orbitTrail.length > 3500) orbitTrail.shift();
    }
  }
  draw();
  animId = requestAnimationFrame(animLoop);
}

/* ── Draw helpers ───────────────────────────────────────────────────────── */
function drawCircle(c, cx, cy, r, style, lw, dash) {
  c.save(); c.strokeStyle=style; c.lineWidth=lw;
  dash ? c.setLineDash(dash) : c.setLineDash([]);
  c.beginPath(); c.arc(cx,cy,r,0,Math.PI*2); c.stroke(); c.restore();
}

/* ── Accretion disk ─────────────────────────────────────────────────────── */
function drawAccretionDisk(c, M, cx, cy, scale) {
  const r0   = Bcrit(M) * 1.08 * scale;  // inner edge: just outside photon ring
  const rOut = 11 * M * scale;            // outer disk edge

  c.save();

  // Pass 1: broad soft glow
  c.filter = 'blur(9px)';
  const g1 = c.createRadialGradient(cx, cy, r0 * 0.85, cx, cy, rOut * 1.15);
  g1.addColorStop(0,    'rgba(255,245,190,0.30)');
  g1.addColorStop(0.18, 'rgba(255,175,50,0.22)');
  g1.addColorStop(0.48, 'rgba(255,85,8,0.14)');
  g1.addColorStop(0.78, 'rgba(190,35,0,0.05)');
  g1.addColorStop(1,    'rgba(100,10,0,0.00)');
  c.beginPath(); c.arc(cx, cy, rOut * 1.15, 0, Math.PI * 2);
  c.fillStyle = g1; c.fill();
  c.filter = 'none';

  // Pass 2: sharper disk body
  const g2 = c.createRadialGradient(cx, cy, r0, cx, cy, rOut);
  g2.addColorStop(0,    'rgba(255,255,210,0.22)');
  g2.addColorStop(0.13, 'rgba(255,200,75,0.17)');
  g2.addColorStop(0.32, 'rgba(255,115,18,0.12)');
  g2.addColorStop(0.62, 'rgba(215,55,0,0.06)');
  g2.addColorStop(1,    'rgba(90,8,0,0.00)');
  c.beginPath(); c.arc(cx, cy, rOut, 0, Math.PI * 2);
  c.fillStyle = g2; c.fill();

  c.restore();
}

/* ── Draw: unified scene (lensing background + geodesic overlay) ────────── */
function drawScene() {
  const M = OP.M;
  if (!lensCache || lensCache.M !== M) renderLens(M);
  ctx.putImageData(lensCache.imgData, 0, 0);

  const { scale, bc } = lensCache;
  const dark = dk();
  const cx = LP.cx * SW, cy = LP.cy * SH;
  const a_phys = OP.a * M;
  const rplus = Rplus(M, a_phys), rergo = Rergo(M);

  ctx.save(); ctx.scale(DPR, DPR);

  // Accretion disk
  if (OP.showDisk) drawAccretionDisk(ctx, M, cx, cy, scale);

  // Ergosphere fill (Kerr only)
  if (a_phys > 0.01) {
    const eg = ctx.createRadialGradient(cx, cy, rplus*scale*0.98, cx, cy, rergo*scale*1.02);
    eg.addColorStop(0, 'rgba(255,160,0,0.18)');
    eg.addColorStop(1, 'rgba(255,80,0,0.03)');
    ctx.fillStyle = eg;
    ctx.beginPath(); ctx.arc(cx, cy, rergo*scale*1.02, 0, Math.PI*2); ctx.fill();
  }

  // Reference circles
  drawCircle(ctx, cx, cy, Risco(M)*scale, dark?'rgba(0,255,120,0.35)':'rgba(0,160,60,0.35)', 1, [3,5]);
  drawCircle(ctx, cx, cy, Rphot(M)*scale, dark?'rgba(0,212,255,0.30)':'rgba(0,100,200,0.30)', 1, [5,5]);
  if (a_phys > 0.01)
    drawCircle(ctx, cx, cy, rergo*scale, dark?'rgba(255,160,0,0.60)':'rgba(200,110,0,0.60)', 1, [4,3]);

  // Light ray geodesic
  if (OP.showLightRay) drawLightRay(ctx, M, cx, cy, scale);

  // Orbit trail — redshift coloring: blue (far) → red (near event horizon)
  if (orbitTrail.length > 1) {
    const n = orbitTrail.length;
    const rs = RS(M);
    for (let i = 0; i < n-1; i += 6) {
      const [tx, ty] = orbitTrail[i];
      const r_ = Math.sqrt(tx*tx + ty*ty);
      const t = Math.max(0, Math.min(1, 1 - rs / Math.max(r_, rs * 1.001)));
      const hue = Math.round(t * 220); // 0=red, 220=blue
      const alpha = Math.pow((i+6)/n, 0.55);
      ctx.beginPath();
      ctx.moveTo(cx + tx*scale, cy - ty*scale);
      for (let j = i+1; j < Math.min(i+7, n); j++)
        ctx.lineTo(cx + orbitTrail[j][0]*scale, cy - orbitTrail[j][1]*scale);
      ctx.strokeStyle = dark ? `hsla(${hue},90%,65%,${alpha*0.88})` : `hsla(${hue},85%,38%,${alpha*0.78})`;
      ctx.lineWidth = 1.5; ctx.setLineDash([]); ctx.stroke();
    }
    const last = orbitTrail[n-1];
    const rl = orbitState ? orbitState[0] : Math.hypot(last[0], last[1]);
    const tl = Math.max(0, Math.min(1, 1 - rs / Math.max(rl, rs * 1.001)));
    ctx.beginPath(); ctx.arc(cx + last[0]*scale, cy - last[1]*scale, 3.5, 0, Math.PI*2);
    ctx.fillStyle = dark ? `hsl(${Math.round(tl*220)},90%,65%)` : `hsl(${Math.round(tl*220)},85%,38%)`;
    ctx.fill();
  }

  // Capture message
  if (!orbitState) {
    ctx.font = '600 13px DM Sans'; ctx.fillStyle = dark?'rgba(255,120,60,0.9)':'rgba(200,50,0,0.9)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('PARTICELLA CATTURATA — premi RESET', SW/2, SH*0.88);
  }

  // Geodesic labels
  ctx.font = '11px Space Mono'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillStyle = dark?'rgba(0,212,255,0.65)':'rgba(0,100,200,0.65)';
  ctx.fillText('r = 3M', cx + Rphot(M)*scale + 5, cy);
  ctx.fillStyle = dark?'rgba(0,255,120,0.65)':'rgba(0,160,60,0.65)';
  ctx.fillText('ISCO  r = 6M', cx + Risco(M)*scale + 5, cy);
  if (a_phys > 0.01) {
    ctx.fillStyle = dark?'rgba(255,160,0,0.75)':'rgba(200,110,0,0.75)';
    ctx.fillText('ergosfera', cx + rergo*scale + 5, cy);
  }
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillStyle = 'rgba(200,220,255,0.45)';
  ctx.fillText(`ombra  r_s = ${Lab.fmt(RS(M),0)} M`, SW-10, SH-10);
  ctx.fillText(`anello fotonico  b_c = ${Lab.fmt(bc,2)} M`, SW-10, SH-22);

  ctx.restore();

  // Readout
  if (orbitState) {
    const [r,,rdot] = orbitState, vphi = OP.L*M/(r*r);
    document.getElementById('readout').innerHTML =
      `<span class="readout-cell"><span class="readout-label">distanza r</span><span class="readout-value">${Lab.fmt(r,2)} M</span></span>`+
      `<span class="readout-cell"><span class="readout-label">velocità radiale dr/dτ</span><span class="readout-value">${Lab.fmt(rdot,3)}</span></span>`+
      `<span class="readout-cell"><span class="readout-label">velocità angolare d<span class="nc">φ</span>/d<span class="nc">τ</span></span><span class="readout-value">${Lab.fmt(vphi,4)}</span></span>`+
      `<span class="readout-cell"><span class="readout-label">momento angolare L</span><span class="readout-value">${Lab.fmt(OP.L,2)} M</span></span>`+
      `<span class="readout-cell"><span class="readout-label">energia E²</span><span class="readout-value">${Lab.fmt(OP.E2,3)}</span></span>`;
  } else {
    document.getElementById('readout').innerHTML = '';
  }
}

/* ── Graph: deflection angle α(b)  [left panel] ─────────────────────────── */
function drawDeflGraph(x0, panelW) {
  const dark = dk();
  gctx.save(); gctx.scale(DPR, DPR);
  const M = OP.M, bc = Bcrit(M);
  const pad = { l:44, r:8, t:12, b:28 }, W = panelW-pad.l-pad.r, H = GH-pad.t-pad.b;
  gctx.fillStyle = dark?'#040810':'#f0f4f8'; gctx.fillRect(x0, 0, panelW, GH);
  if (!deflTable || deflTable.M !== M) buildDeflTable(M);
  const bMin = bc*1.005, bMax = 22*M, pts = [];
  for (let i = 0; i < DEFL_N; i++) {
    const b = deflTable.bArr[i]; if (b < bMin || b > bMax) continue;
    const a = deflTable.alpha[i]; if (isNaN(a) || a < 0) continue;
    pts.push({ b, a });
  }
  if (pts.length < 2) { gctx.restore(); return; }
  const alphaMax = Math.min(pts[0].a*1.05, Math.PI*2.5);
  const xB = b => x0+pad.l+(b-bMin)/(bMax-bMin)*W;
  const yA = a => pad.t+H*(1-Math.min(a,alphaMax)/alphaMax);
  gctx.strokeStyle=dark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.07)'; gctx.lineWidth=1;
  for(let i=1;i<4;i++){const y=pad.t+H*i/4;gctx.beginPath();gctx.moveTo(x0+pad.l,y);gctx.lineTo(x0+pad.l+W,y);gctx.stroke();}
  gctx.strokeStyle=dark?'rgba(255,210,60,0.55)':'rgba(140,100,0,0.55)'; gctx.lineWidth=1; gctx.setLineDash([4,4]);
  gctx.beginPath();gctx.moveTo(xB(bMin),pad.t);gctx.lineTo(xB(bMin),pad.t+H);gctx.stroke(); gctx.setLineDash([]);
  gctx.beginPath(); pts.forEach(({b,a},i)=>{const x=xB(b),y=yA(a); i===0?gctx.moveTo(x,y):gctx.lineTo(x,y);});
  gctx.strokeStyle=dark?'#00d4ff':'#0060c0'; gctx.lineWidth=2; gctx.stroke();
  gctx.strokeStyle=dark?'rgba(255,255,255,0.18)':'rgba(0,0,0,0.18)'; gctx.lineWidth=1; gctx.setLineDash([]);
  gctx.beginPath();gctx.moveTo(x0+pad.l,pad.t);gctx.lineTo(x0+pad.l,pad.t+H);gctx.lineTo(x0+pad.l+W,pad.t+H);gctx.stroke();
  gctx.strokeStyle=dark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.09)'; gctx.lineWidth=1;
  gctx.beginPath();gctx.moveTo(x0+panelW-0.5,4);gctx.lineTo(x0+panelW-0.5,GH-4);gctx.stroke();
  gctx.font='8px Space Mono'; gctx.fillStyle=dark?'#80a0c0':'#506080';
  gctx.textAlign='right'; gctx.textBaseline='middle';
  [0,.5,1].forEach(t=>{const a=alphaMax*(1-t); gctx.fillText(a<0.01?'0':Lab.fmt(a,2),x0+pad.l-3,pad.t+H*t);});
  gctx.textAlign='center'; gctx.textBaseline='top';
  gctx.fillText('b_cr',xB(bMin),pad.t+H+3); gctx.fillText(`${Lab.fmt(bMax,0)} M`,x0+pad.l+W,pad.t+H+3);
  gctx.fillStyle=dark?'#608090':'#405060'; gctx.fillText('α(b)  [rad]',x0+pad.l+W/2,pad.t-2);
  gctx.restore();
}

/* ── Graph: effective potential  [right panel] ──────────────────────────── */
function drawOrbitGraph(x0, panelW) {
  const dark = dk();
  gctx.save(); gctx.scale(DPR, DPR);
  gctx.fillStyle=dark?'#040810':'#f0f4f8'; gctx.fillRect(x0,0,panelW,GH);
  const M=OP.M, a_phys=OP.a*M, L=OP.L*M, E2=OP.E2;
  const rp=Rplus(M,a_phys);
  const pad={l:42,r:14,t:12,b:28}, W=panelW-pad.l-pad.r, H=GH-pad.t-pad.b;
  const rMin=rp*1.005, rMax=26*M, N=300;
  const vVals=Array.from({length:N},(_,i)=>{const r=rMin+(rMax-rMin)*i/(N-1);return{r,v2:Veff2(r,M,L)};});
  const vPeak = Math.max(...vVals.map(d=>d.v2).filter(v=>isFinite(v)));
  const v2Max = Math.max(isFinite(vPeak) ? vPeak * 1.08 : 1.5, E2 * 1.15, 0.05);
  const xR=r=>x0+pad.l+(r-rMin)/(rMax-rMin)*W;
  const yV=v=>pad.t+H*(1-Math.min(v,v2Max)/v2Max);
  gctx.strokeStyle=dark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.07)'; gctx.lineWidth=1;
  for(let i=1;i<4;i++){const y=pad.t+H*i/4;gctx.beginPath();gctx.moveTo(x0+pad.l,y);gctx.lineTo(x0+pad.l+W,y);gctx.stroke();}
  gctx.beginPath();
  vVals.forEach(({r,v2},i)=>{if(v2>E2){const x=xR(r),y=yV(v2);if(i===0||vVals[i-1].v2<=E2)gctx.moveTo(x,yV(E2));gctx.lineTo(x,y);}});
  gctx.fillStyle=dark?'rgba(255,80,0,0.12)':'rgba(200,50,0,0.09)'; gctx.fill();
  gctx.beginPath();
  vVals.forEach(({r,v2},i)=>{const x=xR(r),y=yV(Math.min(v2,v2Max)); i===0?gctx.moveTo(x,y):gctx.lineTo(x,y);});
  gctx.strokeStyle=dark?'#00d4ff':'#0060c0'; gctx.lineWidth=2; gctx.setLineDash([]); gctx.stroke();
  const yE2=yV(E2);
  gctx.strokeStyle=dark?'rgba(0,255,120,0.75)':'rgba(0,160,60,0.75)'; gctx.lineWidth=1.5; gctx.setLineDash([6,4]);
  gctx.beginPath();gctx.moveTo(x0+pad.l,yE2);gctx.lineTo(x0+pad.l+W,yE2);gctx.stroke(); gctx.setLineDash([]);
  [{r:rp,      label:a_phys>0.01?'r+':'rs',col:dark?'rgba(255,120,0,0.55)':'rgba(200,60,0,0.55)'},
   ...(a_phys>0.01?[{r:Rergo(M),label:'ergo',col:dark?'rgba(255,160,0,0.55)':'rgba(200,110,0,0.55)'}]:[]),
   {r:Rphot(M),label:'r_ph',col:dark?'rgba(0,212,255,0.45)':'rgba(0,100,200,0.45)'},
   {r:Risco(M),label:'ISCO',col:dark?'rgba(0,255,120,0.45)':'rgba(0,160,60,0.45)'}
  ].forEach(({r,label,col})=>{
    const x=xR(r); if(x<x0+pad.l||x>x0+pad.l+W) return;
    gctx.strokeStyle=col;gctx.lineWidth=1;gctx.setLineDash([3,4]);
    gctx.beginPath();gctx.moveTo(x,pad.t);gctx.lineTo(x,pad.t+H);gctx.stroke(); gctx.setLineDash([]);
    gctx.font='7px Space Mono';gctx.fillStyle=col;gctx.textAlign='center';gctx.textBaseline='top';
    gctx.fillText(label,x,pad.t+H+2);
  });
  gctx.strokeStyle=dark?'rgba(255,255,255,0.18)':'rgba(0,0,0,0.18)'; gctx.lineWidth=1; gctx.setLineDash([]);
  gctx.beginPath();gctx.moveTo(x0+pad.l,pad.t);gctx.lineTo(x0+pad.l,pad.t+H);gctx.lineTo(x0+pad.l+W,pad.t+H);gctx.stroke();
  gctx.font='8px Space Mono'; gctx.fillStyle=dark?'#80a0c0':'#506080';
  gctx.textAlign='right'; gctx.textBaseline='middle';
  [0,.5,1].forEach(t=>{const v=v2Max*(1-t); gctx.fillText(Lab.fmt(v,2),x0+pad.l-3,pad.t+H*t);});
  gctx.fillStyle=dark?'rgba(0,255,120,0.85)':'rgba(0,160,60,0.85)'; gctx.textAlign='left'; gctx.textBaseline='middle';
  gctx.fillText(`E²=${Lab.fmt(E2,3)}`,x0+pad.l+4,yE2-6);
  gctx.fillStyle=dark?'#608090':'#405060'; gctx.textAlign='center'; gctx.textBaseline='top';
  gctx.fillText('V²eff(r)',x0+pad.l+W/2,pad.t-2);
  gctx.restore();
}

/* ── Graph: Flamm's paraboloid  [right panel] ───────────────────────────── */
function drawFlammGraph(x0, panelW) {
  const dark = dk();
  gctx.save();
  gctx.scale(DPR, DPR);
  gctx.fillStyle = dark ? '#040810' : '#f0f4f8';
  gctx.fillRect(x0, 0, panelW, GH);

  const M = OP.M, rs = RS(M);
  const rMax = 20; // fixed physical extent — varying M changes throat size and funnel depth visibly
  const cx = x0 + panelW / 2;
  const cy = GH * 0.82;
  const scaleR = panelW * 0.38 / rMax;
  const sinT = 0.82, cosT = 0.57;

  const project = (r, phi) => {
    const z = 2 * Math.sqrt(Math.max(0, rs * (r - rs)));
    return {
      x: cx + r * Math.cos(phi) * scaleR,
      y: cy - z * sinT * scaleR + r * Math.sin(phi) * cosT * scaleR * 0.45
    };
  };

  const Nr = 16, Nph = 64, Nmerid = 24;
  const ringCol = a => dark ? `rgba(0,212,255,${a})` : `rgba(0,100,200,${a})`;

  // Meridians
  for (let im = 0; im < Nmerid; im++) {
    const phi = 2 * Math.PI * im / Nmerid;
    const isFront = Math.sin(phi) >= 0;
    gctx.beginPath();
    for (let ir = 0; ir <= Nr; ir++) {
      const r = rs + (rMax - rs) * ir / Nr;
      const p = project(r, phi);
      ir === 0 ? gctx.moveTo(p.x, p.y) : gctx.lineTo(p.x, p.y);
    }
    gctx.strokeStyle = ringCol(isFront ? 0.28 : 0.13);
    gctx.lineWidth = 0.75; gctx.setLineDash([]); gctx.stroke();
  }

  // Rings: outer → inner so throat renders on top
  for (let ir = Nr; ir >= 0; ir--) {
    const r = rs + (rMax - rs) * ir / Nr;
    const isThroat = ir === 0;
    gctx.beginPath();
    for (let iph = 0; iph <= Nph; iph++) {
      const p = project(r, 2 * Math.PI * iph / Nph);
      iph === 0 ? gctx.moveTo(p.x, p.y) : gctx.lineTo(p.x, p.y);
    }
    if (isThroat) {
      gctx.strokeStyle = dark ? 'rgba(255,120,0,0.90)' : 'rgba(200,60,0,0.90)';
      gctx.lineWidth = 1.8;
    } else {
      const alpha = 0.15 + (Nr - ir) / Nr * 0.22;
      gctx.strokeStyle = ringCol(alpha);
      gctx.lineWidth = 0.8;
    }
    gctx.stroke();
  }

  // Labels
  gctx.setLineDash([]);
  gctx.font = '8px Space Mono';
  gctx.fillStyle = dark ? '#608090' : '#405060';
  gctx.textAlign = 'center'; gctx.textBaseline = 'top';
  gctx.fillText('Paraboloide di Flamm', x0 + panelW / 2, 2);

  const tp = project(rs, 0);
  gctx.fillStyle = dark ? 'rgba(255,120,0,0.80)' : 'rgba(200,60,0,0.80)';
  gctx.textAlign = 'left'; gctx.textBaseline = 'middle';
  gctx.fillText(`r_s=${Lab.fmt(rs,1)}M`, tp.x + 4, tp.y);

  gctx.restore();
}

/* ── Master draw ────────────────────────────────────────────────────────── */
function draw() {
  drawScene();
  const third = GW / 3;
  drawDeflGraph(0, third);
  drawOrbitGraph(third, third);
  drawFlammGraph(2 * third, third);
}

/* ── Canvas resize ──────────────────────────────────────────────────────── */
function resizeCanvases() {
  const area = sc.parentElement;
  const ga = document.getElementById('graphArea');
  const rb = document.getElementById('readout');
  SW = area.clientWidth;
  // Calcolata dal contenitore meno gli elementi a dimensione fissa (grafici + misure), MAI da
  // sc.clientHeight: quel valore diventa auto-referenziale una volta che gli si assegna uno
  // style.height esplicito, quindi il canvas smette di restringersi quando la finestra si
  // rimpicciolisce e spinge grafici/misure fuori dall'area visibile (tagliati da overflow:hidden).
  SH = Math.max(160, area.clientHeight - ga.offsetHeight - rb.offsetHeight);
  sc.width=SW*DPR; sc.height=SH*DPR; sc.style.width=SW+'px'; sc.style.height=SH+'px';
  GW=ga.clientWidth; GH=ga.clientHeight;
  gc.width=GW*DPR; gc.height=GH*DPR; gc.style.width=GW+'px'; gc.style.height=GH+'px';
  invalidateLens();
  if (SW>0 && GW>0) draw();
}
new ResizeObserver(resizeCanvases).observe(sc.parentElement);

/* ── Controls ───────────────────────────────────────────────────────────── */
let lightBSlider = null;

function buildControls() {
  const panel = document.getElementById('controls');
  panel.innerHTML = '';
  lightBSlider = null;

  // ── Buco Nero ──
  const secBH = Lab.Section('Buco Nero');
  secBH.add(Lab.Slider({ label: 'Massa M', min: 0.5, max: 3.0, value: OP.M,
    step: 0.1, unit: ' M☉',
    onChange: v => { OP.M = v; buildDeflTable(OP.M); invalidateLens(); if (animId) initOrbit(); draw(); } }));
  secBH.add(Lab.Slider({ label: 'Spin a', min: 0, max: 0.99, value: OP.a,
    step: 0.01, unit: ' M',
    onChange: v => { OP.a = v; if (animId) initOrbit(); draw(); } }));

  const lrSub = Lab.SubPanel();
  lightBSlider = Lab.Slider({ label: 'Parametro d\'impatto b', min: 2.0, max: 40.0,
    value: OP.lightB, step: 0.2, unit: '',
    onChange: v => { OP.lightB = v; draw(); } });
  lrSub.add(lightBSlider);
  if (!OP.showLightRay) lrSub.hide();

  secBH.add(Lab.Toggle({ label: 'Disco di accrescimento', value: OP.showDisk,
    onChange: v => { OP.showDisk = v; draw(); } }));
  secBH.add(Lab.Toggle({ label: 'Raggio di luce', value: OP.showLightRay,
    onChange: v => { OP.showLightRay = v; v ? lrSub.show() : lrSub.hide(); draw(); } }));
  secBH.el.appendChild(lrSub.el);
  panel.appendChild(secBH.el);

  // ── Satellite ──
  const secSat = Lab.Section('Satellite');
  secSat.add(Lab.Slider({ label: 'Momento angolare L', min: 2.0, max: 8.0, value: OP.L,
    step: 0.05, unit: ' M',
    onChange: v => { OP.L = v; if (animId) initOrbit(); else draw(); } }));
  secSat.add(Lab.Slider({ label: 'Energia E²', min: 0.60, max: 1.05, value: OP.E2,
    step: 0.005,
    onChange: v => { OP.E2 = v; if (animId) initOrbit(); else draw(); } }));
  secSat.add(Lab.Slider({ label: 'Raggio iniziale r₀', min: 4, max: 30, value: OP.r0,
    step: 0.5, unit: ' M',
    onChange: v => { OP.r0 = v; if (animId) initOrbit(); else draw(); } }));

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;margin-top:12px';
  const btnReset = document.createElement('button');
  btnReset.className='btn-secondary'; btnReset.textContent='↺  RESET'; btnReset.style.flex='1';
  btnReset.addEventListener('click', () => { stopAnim(); startAnim(); });
  const btnPause = document.createElement('button');
  btnPause.className='btn-primary'; btnPause.textContent='⏸  PAUSA'; btnPause.style.flex='1';
  btnPause.addEventListener('click', () => {
    OP.running = !OP.running;
    btnPause.textContent = OP.running ? '⏸  PAUSA' : '▶  RIPRENDI';
  });
  row.append(btnReset, btnPause);
  secSat.el.appendChild(row);

  const info = document.createElement('div');
  info.style.cssText = 'margin-top:14px;font-size:11px;color:var(--text-secondary);line-height:1.68;padding:10px 12px;background:var(--bg3);border-radius:8px';
  info.innerHTML = '<b style="color:var(--text-primary)">Geodetiche di Schwarzschild/Kerr</b><br>Lo sfondo è deformato dalla lente gravitazionale.<br><span style="color:rgba(0,255,120,0.8)">━ ISCO  r = 6M</span>: orbita stabile più interna.<br><span style="color:rgba(0,212,255,0.7)">━</span> sfera fotonica  r = 3M.<br>Con <b>a&gt;0</b> l\'orizzonte r<sub>+</sub>&lt;2M si restringe.<br>Trascina il buco nero per spostarlo.';
  secSat.el.appendChild(info);
  panel.appendChild(secSat.el);
}

/* ── BH drag ────────────────────────────────────────────────────────────── */
sc.style.cursor = 'crosshair';
sc.addEventListener('mousedown', e => {
  lensDragging = true;
  const rect = sc.getBoundingClientRect();
  LP.cx = Math.max(0, Math.min(1, (e.clientX - rect.left) / SW));
  LP.cy = Math.max(0, Math.min(1, (e.clientY - rect.top) / SH));
  invalidateLens(); draw();
});
window.addEventListener('mousemove', e => {
  if (!lensDragging) return;
  const rect = sc.getBoundingClientRect();
  LP.cx = Math.max(0, Math.min(1, (e.clientX - rect.left) / SW));
  LP.cy = Math.max(0, Math.min(1, (e.clientY - rect.top) / SH));
  invalidateLens(); draw();
});
window.addEventListener('mouseup', () => { lensDragging = false; });

/* ── Init ───────────────────────────────────────────────────────────────── */
document.getElementById('themeToggle').addEventListener('click', () => {
  setTimeout(() => { invalidateLens(); draw(); }, 20);
});

loadMilkyway();
buildDeflTable(OP.M);
buildControls();
resizeCanvases();
startAnim();
