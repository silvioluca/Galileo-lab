'use strict';

const sc   = document.getElementById('simCanvas');
const ctx  = sc.getContext('2d');
let DPR  = window.devicePixelRatio || 1;
let SW = 0, SH = 0;
let gCanvas = [];

Lab.initTheme('themeToggle');
const dk = () => document.documentElement.dataset.theme !== 'light';

/* ── Parameters ──────────────────────────────────────────────────────────── */
// Il calcolo usa k = 1 (∮ E·dA = 4π·q); le posizioni sono in pixel con 1 cm = PX_CM pixel e le
// cariche in nC. Il flusso vero in V·m si ottiene moltiplicando per k·1 nC = 8,988 V·m:
// così ∮ E·dA = Q/ε₀ con Q in coulomb.
const K4PI = 4 * Math.PI;
const PX_CM = 13;
const PHI_SI = 8.98755;            // V·m per unità di flusso normalizzato (1 nC, k = 1/4πε₀)

const P = {
  mode:       'E',      // 'E' | 'B'
  surface:    'sphere', // 'sphere' | 'cube' | 'blob'
  R:          130,      // raggio / semilato della superficie (pixel; 10 cm)
  view3D:     false,
  fieldLines: false,
};

/* ── State ───────────────────────────────────────────────────────────────── */
// E mode: { x, y, q }         B mode: { x, y, q≥0, angle }
let sources = [
  { x:  40, y: -20, q:  2 },
  { x: -190, y:  50, q: -1 },
];
let surfX = 0, surfY = 0;   // Gaussian surface centre [physics px]

let cachedFlux = 0;
let fluxDirty  = true;

/* ── Layout ──────────────────────────────────────────────────────────────── */
let CX = 0, CY = 0;
let viewZoom = 1, viewAzim = 0.25;
const toSc  = (px, py) => [CX + px, CY + py];
const toPhy = (sx, sy) => [sx - CX, sy - CY];
// Oblique projection with azimuth orbit around Y axis
const OX = 0.48, OY = 0.30;
const p3 = (x, y, z) => {
  const cosA = Math.cos(viewAzim), sinA = Math.sin(viewAzim);
  const rx = x * cosA + z * sinA, rz = -x * sinA + z * cosA;
  return [CX + rx + rz * OX, CY + y - rz * OY];
};

/* ── Blob shape ──────────────────────────────────────────────────────────── */
// 2-D cross-section (z = 0 plane)
function blobR2D(t) { return 1 + 0.22 * Math.cos(2 * t) + 0.12 * Math.sin(3 * t); }
// 3-D surface parameterisation r(θ,φ)
function blobR3D(th, ph) {
  const s = Math.sin(th);
  return 1 + 0.20 * s * s * Math.cos(2 * ph) + 0.10 * Math.sin(3 * ph) * s;
}

/* ── Field ───────────────────────────────────────────────────────────────── */
function computeField(x, y, z) {
  let fx = 0, fy = 0, fz = 0;
  for (const s of sources) {
    const dx = x - s.x, dy = y - s.y, dz = z;
    const r2 = dx * dx + dy * dy + dz * dz;
    if (r2 < 0.01) continue;
    if (P.mode === 'E') {
      const c = s.q / (r2 * Math.sqrt(r2));
      fx += c * dx; fy += c * dy; fz += c * dz;
    } else {
      // magnetic dipole  m = q·(cos a, sin a, 0)
      const a = s.angle ?? -Math.PI / 2;
      const mx = Math.cos(a), my = Math.sin(a);
      const mdr = mx * dx + my * dy;
      const r5  = r2 * r2 * Math.sqrt(r2);
      fx += s.q * (3 * mdr * dx - mx * r2) / r5;
      fy += s.q * (3 * mdr * dy - my * r2) / r5;
      fz += s.q * (3 * mdr * dz           ) / r5;
    }
  }
  return [fx, fy, fz];
}

/* ── Inside/outside test ─────────────────────────────────────────────────── */
function isInside(lx, ly, lz) {
  const R = P.R;
  if (P.surface === 'sphere') return lx * lx + ly * ly + lz * lz < R * R;
  if (P.surface === 'cube')   return Math.abs(lx) < R && Math.abs(ly) < R && Math.abs(lz) < R;
  const r = Math.sqrt(lx * lx + ly * ly + lz * lz + 1e-9);
  const th = Math.acos(Math.max(-1, Math.min(1, lz / r)));
  const ph = Math.atan2(ly, lx);
  return r < R * blobR3D(th, ph);
}

/* ── Flux integration (3-D numerical) ───────────────────────────────────── */
function computeFlux() {
  const NI = 24, R = P.R, cx = surfX, cy = surfY;
  let phi = 0;

  if (P.surface === 'sphere') {
    const base = R * R * (Math.PI / NI) * (2 * Math.PI / NI);
    for (let i = 0; i < NI; i++) {
      const th = Math.PI * (i + 0.5) / NI;
      const sinT = Math.sin(th), cosT = Math.cos(th);
      const dA = base * sinT;
      for (let j = 0; j < NI; j++) {
        const ph = 2 * Math.PI * j / NI;
        const nx = sinT * Math.cos(ph), ny = sinT * Math.sin(ph), nz = cosT;
        const [fx, fy, fz] = computeField(cx + R * nx, cy + R * ny, R * nz);
        phi += (fx * nx + fy * ny + fz * nz) * dA;
      }
    }

  } else if (P.surface === 'cube') {
    const a = R, NG = 17, dA = (2 * a / NG) ** 2;
    for (const [nx, ny, nz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
      for (let i = 0; i < NG; i++) {
        for (let j = 0; j < NG; j++) {
          const u = -a + (i + .5) * 2 * a / NG, v = -a + (j + .5) * 2 * a / NG;
          let px, py, pz;
          if (nx !== 0) { px = cx + nx * a; py = cy + u; pz = v; }
          else if (ny !== 0) { px = cx + u; py = cy + ny * a; pz = v; }
          else { px = cx + u; py = cy + v; pz = nz * a; }
          const [fx, fy, fz] = computeField(px, py, pz);
          phi += (fx * nx + fy * ny + fz * nz) * dA;
        }
      }
    }

  } else { // blob
    for (let i = 0; i < NI; i++) {
      const th = Math.PI * (i + 0.5) / NI;
      const sinT = Math.sin(th), cosT = Math.cos(th);
      for (let j = 0; j < NI; j++) {
        const ph = 2 * Math.PI * j / NI;
        const rS = blobR3D(th, ph), r = R * rS;
        const nx = sinT * Math.cos(ph), ny = sinT * Math.sin(ph), nz = cosT;
        const dA = r * r * sinT * (Math.PI / NI) * (2 * Math.PI / NI);
        const [fx, fy, fz] = computeField(cx + r * nx, cy + r * ny, r * nz);
        phi += (fx * nx + fy * ny + fz * nz) * dA;
      }
    }
  }
  return phi;
}

function exactFlux() {
  if (P.mode === 'B') return 0;
  let q = 0;
  for (const s of sources) if (isInside(s.x - surfX, s.y - surfY, 0)) q += s.q;
  return K4PI * q;
}

/* ── Colour helpers ──────────────────────────────────────────────────────── */
const CYAN = (d, a = 1) => d ? `rgba(0,212,255,${a})` : `rgba(0,100,200,${a})`;

function fluxCol(t, dark) { // t ∈ [-1,1]: cyan=outward, magenta=inward
  if (t > 0) return dark ? `rgba(0,212,255,${0.25 + 0.75 * t})` : `rgba(0,100,200,${0.25 + 0.75 * t})`;
  if (t < 0) return dark ? `rgba(255,80,120,${0.25 - 0.75 * t})` : `rgba(200,40,80,${0.25 - 0.75 * t})`;
  return dark ? 'rgba(200,200,200,0.18)' : 'rgba(100,100,100,0.18)';
}

// flusso normalizzato → testo in V·m (campo E) o unità arbitrarie (campo B, sempre ≈ 0)
function fmt(v) {
  if (!isFinite(v)) return '∞';
  if (P.mode === 'B') return Math.abs(v) < 0.05 ? '0,0' : Lab.fmt(v, 1);
  const a = Math.abs(v * PHI_SI);
  if (a < 0.5) return '0 V·m';
  return Lab.fmt(v * PHI_SI, 0) + ' V·m';
}

/* ── Draw simulation ─────────────────────────────────────────────────────── */
function drawSim() {
  const dark = dk();
  ctx.save(); ctx.scale(DPR, DPR);
  ctx.fillStyle = dark ? '#060a10' : '#e8f0f8';
  ctx.fillRect(0, 0, SW, SH);
  ctx.save();
  ctx.translate(CX, CY); ctx.scale(viewZoom, viewZoom); ctx.translate(-CX, -CY);
  drawGrid(dark);
  if (P.fieldLines) drawFieldLines(dark);
  if (P.view3D) draw3DSurface(dark);
  else { drawSurface(dark); drawFieldArrows(dark); }
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

/* ── Gaussian surface ────────────────────────────────────────────────────── */
function drawSurface(dark) {
  const [scx, scy] = toSc(surfX, surfY);
  const R = P.R;
  ctx.save();

  if (P.surface === 'sphere') {
    const NS = 72;
    for (let i = 0; i < NS; i++) {
      const a1 = 2 * Math.PI * i / NS, a2 = 2 * Math.PI * (i + 1) / NS, am = (a1 + a2) / 2;
      const nx = Math.cos(am), ny = Math.sin(am);
      const [fx, fy] = computeField(surfX + R * nx, surfY + R * ny, 0);
      ctx.strokeStyle = fluxCol(Math.tanh((fx * nx + fy * ny) * 0.5), dark);
      ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.arc(scx, scy, R, a1, a2); ctx.stroke();
    }
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.16)';
    ctx.lineWidth = 1; ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.arc(scx, scy, R, 0, 2 * Math.PI); ctx.stroke();

  } else if (P.surface === 'cube') {
    const sides = [
      { n: [0, -1], p0: [-1, -1], p1: [1, -1] },
      { n: [1,  0], p0: [1,  -1], p1: [1,  1] },
      { n: [0,  1], p0: [1,   1], p1: [-1, 1] },
      { n: [-1, 0], p0: [-1,  1], p1: [-1,-1] },
    ];
    const NS = 20;
    for (const { n, p0, p1 } of sides) {
      for (let i = 0; i < NS; i++) {
        const t1 = i / NS, t2 = (i + 1) / NS, tm = (t1 + t2) / 2;
        const mx = p0[0] + tm * (p1[0] - p0[0]), my = p0[1] + tm * (p1[1] - p0[1]);
        const [fx, fy] = computeField(surfX + mx * R, surfY + my * R, 0);
        ctx.strokeStyle = fluxCol(Math.tanh((fx * n[0] + fy * n[1]) * 0.5), dark);
        ctx.lineWidth = 3.5;
        const x1 = scx + (p0[0] + t1 * (p1[0] - p0[0])) * R, y1 = scy + (p0[1] + t1 * (p1[1] - p0[1])) * R;
        const x2 = scx + (p0[0] + t2 * (p1[0] - p0[0])) * R, y2 = scy + (p0[1] + t2 * (p1[1] - p0[1])) * R;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
    }
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.16)';
    ctx.lineWidth = 1; ctx.setLineDash([6, 4]);
    ctx.strokeRect(scx - R, scy - R, 2 * R, 2 * R);

  } else { // blob
    const NB = 80;
    for (let i = 0; i < NB; i++) {
      const a1 = 2 * Math.PI * i / NB, a2 = 2 * Math.PI * (i + 1) / NB, am = (a1 + a2) / 2;
      const rm = P.R * blobR2D(am);
      const dr = (P.R * blobR2D(am + 0.01) - P.R * blobR2D(am - 0.01)) / 0.02;
      const tx = -rm * Math.sin(am) + dr * Math.cos(am), ty = rm * Math.cos(am) + dr * Math.sin(am);
      const tl = Math.sqrt(tx * tx + ty * ty);
      const outN = [ty / tl, -tx / tl];
      const [fx, fy] = computeField(surfX + rm * Math.cos(am), surfY + rm * Math.sin(am), 0);
      ctx.strokeStyle = fluxCol(Math.tanh((fx * outN[0] + fy * outN[1]) * 0.5), dark);
      ctx.lineWidth = 3.5;
      const r1 = P.R * blobR2D(a1), r2 = P.R * blobR2D(a2);
      ctx.beginPath();
      ctx.moveTo(scx + r1 * Math.cos(a1), scy + r1 * Math.sin(a1));
      ctx.lineTo(scx + r2 * Math.cos(a2), scy + r2 * Math.sin(a2));
      ctx.stroke();
    }
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.16)';
    ctx.lineWidth = 1; ctx.setLineDash([6, 4]);
    ctx.beginPath();
    for (let i = 0; i <= NB; i++) {
      const a = 2 * Math.PI * i / NB, r = P.R * blobR2D(a);
      i === 0 ? ctx.moveTo(scx + r * Math.cos(a), scy + r * Math.sin(a))
              : ctx.lineTo(scx + r * Math.cos(a), scy + r * Math.sin(a));
    }
    ctx.closePath(); ctx.stroke();
  }

  ctx.setLineDash([]);

  // Labels
  const topY = scy - R * (P.surface === 'blob' ? 1.25 : 1) - 12;
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.70)';
  ctx.font = 'bold 12px "Space Mono",monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(`Φ = ∮ E·dA = ${fmt(cachedFlux)}`, scx, topY);
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.30)';
  ctx.font = '9px "Space Mono",monospace';
  ctx.fillText(
    P.mode === 'E' ? `Q_int/ε₀ = ${fmt(exactFlux())}` : '∮ B·dA = 0  (non esistono monopoli)',
    scx, topY + 14
  );

  // Surface centre crosshair
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(scx - 8, scy); ctx.lineTo(scx + 8, scy);
  ctx.moveTo(scx, scy - 8); ctx.lineTo(scx, scy + 8);
  ctx.stroke();

  ctx.restore();
}

/* ── Field arrows on surface boundary ───────────────────────────────────── */
function drawFieldArrows(dark) {
  const R = P.R, N = 16;
  ctx.save();
  for (let i = 0; i < N; i++) {
    const a = 2 * Math.PI * i / N;
    let px, py;
    if (P.surface === 'sphere') {
      px = surfX + R * Math.cos(a); py = surfY + R * Math.sin(a);
    } else if (P.surface === 'cube') {
      const seg = i / N * 4;
      const si = Math.floor(seg), t = seg - si;
      const corners = [[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]];
      px = surfX + (corners[si][0] + (corners[si+1][0] - corners[si][0]) * t) * R;
      py = surfY + (corners[si][1] + (corners[si+1][1] - corners[si][1]) * t) * R;
    } else {
      px = surfX + R * blobR2D(a) * Math.cos(a);
      py = surfY + R * blobR2D(a) * Math.sin(a);
    }
    const [fx, fy] = computeField(px, py, 0);
    const mag = Math.sqrt(fx * fx + fy * fy);
    if (mag < 1e-9) continue;
    const len = Math.min(22, 8 / mag);
    const [sx, sy] = toSc(px, py);
    drawArrow(sx, sy, sx + (fx / mag) * len, sy + (fy / mag) * len,
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

/* ── 3-D wireframe surface ───────────────────────────────────────────────── */
function draw3DSurface(dark) {
  const R = P.R, NL = 8, NS = 32;
  const [scx, scy] = toSc(surfX, surfY);
  ctx.save();

  // Draw one colored segment between two 3-D points on the surface
  function seg(x1, y1, z1, x2, y2, z2, nx, ny, nz) {
    const [sx1, sy1] = p3(x1, y1, z1), [sx2, sy2] = p3(x2, y2, z2);
    const [fx, fy, fz] = computeField((x1+x2)/2, (y1+y2)/2, (z1+z2)/2);
    ctx.strokeStyle = fluxCol(Math.tanh((fx*nx + fy*ny + fz*nz) * 0.5), dark);
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2); ctx.stroke();
  }

  if (P.surface === 'sphere') {
    for (let li = 1; li < NL; li++) {
      const th = Math.PI*li/NL, sinT = Math.sin(th), cosT = Math.cos(th);
      for (let j = 0; j < NS; j++) {
        const a1 = 2*Math.PI*j/NS, a2 = 2*Math.PI*(j+1)/NS, am = (a1+a2)/2;
        seg(
          surfX+R*sinT*Math.cos(a1), surfY+R*sinT*Math.sin(a1), R*cosT,
          surfX+R*sinT*Math.cos(a2), surfY+R*sinT*Math.sin(a2), R*cosT,
          sinT*Math.cos(am), sinT*Math.sin(am), cosT
        );
      }
    }
    for (let mi = 0; mi < NL*2; mi++) {
      const ph = Math.PI*mi/NL;
      for (let j = 0; j < NL; j++) {
        const th1 = Math.PI*j/NL, th2 = Math.PI*(j+1)/NL, thm = (th1+th2)/2;
        seg(
          surfX+R*Math.sin(th1)*Math.cos(ph), surfY+R*Math.sin(th1)*Math.sin(ph), R*Math.cos(th1),
          surfX+R*Math.sin(th2)*Math.cos(ph), surfY+R*Math.sin(th2)*Math.sin(ph), R*Math.cos(th2),
          Math.sin(thm)*Math.cos(ph), Math.sin(thm)*Math.sin(ph), Math.cos(thm)
        );
      }
    }

  } else if (P.surface === 'cube') {
    const a = R, NG = 5;
    const FACES = [
      { n:[0,0, 1], u:[1,0,0], v:[0,1,0], c:[0,0, a] },
      { n:[0,0,-1], u:[1,0,0], v:[0,1,0], c:[0,0,-a] },
      { n:[1,0, 0], u:[0,1,0], v:[0,0,1], c:[a,0, 0] },
      { n:[-1,0,0], u:[0,1,0], v:[0,0,1], c:[-a,0,0] },
      { n:[0, 1,0], u:[1,0,0], v:[0,0,1], c:[0, a,0] },
      { n:[0,-1,0], u:[1,0,0], v:[0,0,1], c:[0,-a,0] },
    ];
    for (const { n, u, v, c } of FACES) {
      for (let i = 0; i <= NG; i++) {
        const t = -a + i*2*a/NG;
        for (let j = 0; j < NG; j++) {
          const s1 = -a+j*2*a/NG, s2 = -a+(j+1)*2*a/NG;
          seg(
            surfX+c[0]+t*u[0]+s1*v[0], surfY+c[1]+t*u[1]+s1*v[1], c[2]+t*u[2]+s1*v[2],
            surfX+c[0]+t*u[0]+s2*v[0], surfY+c[1]+t*u[1]+s2*v[1], c[2]+t*u[2]+s2*v[2],
            n[0], n[1], n[2]
          );
          seg(
            surfX+c[0]+s1*u[0]+t*v[0], surfY+c[1]+s1*u[1]+t*v[1], c[2]+s1*u[2]+t*v[2],
            surfX+c[0]+s2*u[0]+t*v[0], surfY+c[1]+s2*u[1]+t*v[1], c[2]+s2*u[2]+t*v[2],
            n[0], n[1], n[2]
          );
        }
      }
    }

  } else { // blob
    for (let li = 1; li < NL; li++) {
      const th = Math.PI*li/NL, sinT = Math.sin(th), cosT = Math.cos(th);
      for (let j = 0; j < NS; j++) {
        const a1 = 2*Math.PI*j/NS, a2 = 2*Math.PI*(j+1)/NS, am = (a1+a2)/2;
        const r1 = R*blobR3D(th,a1), r2 = R*blobR3D(th,a2);
        seg(
          surfX+r1*sinT*Math.cos(a1), surfY+r1*sinT*Math.sin(a1), r1*cosT,
          surfX+r2*sinT*Math.cos(a2), surfY+r2*sinT*Math.sin(a2), r2*cosT,
          sinT*Math.cos(am), sinT*Math.sin(am), cosT
        );
      }
    }
    for (let mi = 0; mi < NL*2; mi++) {
      const ph = Math.PI*mi/NL;
      for (let j = 0; j < NL; j++) {
        const th1 = Math.PI*j/NL, th2 = Math.PI*(j+1)/NL, thm = (th1+th2)/2;
        const r1 = R*blobR3D(th1,ph), r2 = R*blobR3D(th2,ph);
        seg(
          surfX+r1*Math.sin(th1)*Math.cos(ph), surfY+r1*Math.sin(th1)*Math.sin(ph), r1*Math.cos(th1),
          surfX+r2*Math.sin(th2)*Math.cos(ph), surfY+r2*Math.sin(th2)*Math.sin(ph), r2*Math.cos(th2),
          Math.sin(thm)*Math.cos(ph), Math.sin(thm)*Math.sin(ph), Math.cos(thm)
        );
      }
    }
  }

  // Labels + crosshair (same as 2D view)
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.70)';
  ctx.font = 'bold 12px "Space Mono",monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(`Φ = ∮ E·dA = ${fmt(cachedFlux)}`, scx, scy - R - 12);
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.30)';
  ctx.font = '9px "Space Mono",monospace';
  ctx.fillText(
    P.mode === 'E' ? `Q_int/ε₀ = ${fmt(exactFlux())}` : '∮ B·dA = 0  (non esistono monopoli)',
    scx, scy - R + 2
  );
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(scx - 8, scy); ctx.lineTo(scx + 8, scy);
  ctx.moveTo(scx, scy - 8); ctx.lineTo(scx, scy + 8);
  ctx.stroke();
  ctx.restore();
}

/* ── Field lines ─────────────────────────────────────────────────────────── */
function drawFieldLines(dark) {
  const col = dark ? 'rgba(0,212,255,0.18)' : 'rgba(0,80,160,0.16)';
  const NL  = 10;
  if (P.mode === 'E') {
    for (const s of sources) {
      const dir = s.q > 0 ? 1 : -1;
      for (let i = 0; i < NL; i++) {
        const a = 2 * Math.PI * i / NL;
        traceLine(s.x + 14 * Math.cos(a), s.y + 14 * Math.sin(a), dir, col, false);
      }
    }
  } else {
    for (const s of sources) {
      for (const r0 of [15, 35, 70]) {
        for (let i = 0; i < 8; i++) {
          const a = 2 * Math.PI * i / 8;
          traceLine(s.x + r0 * Math.cos(a), s.y + r0 * Math.sin(a), 1, col, true);
        }
      }
    }
  }
}

function traceLine(startX, startY, dir, col, isB) {
  let x = startX, y = startY;
  const dt = isB ? 4 : 2.5;
  const maxSteps = isB ? 1200 : 400;
  ctx.save();
  ctx.strokeStyle = col; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(CX + x, CY + y);
  for (let i = 0; i < maxSteps; i++) {
    const [fx, fy] = computeField(x, y, 0);
    const mag = Math.sqrt(fx * fx + fy * fy);
    if (mag < 1e-10) break;
    x += dir * fx / mag * dt;
    y += dir * fy / mag * dt;
    ctx.lineTo(CX + x, CY + y);
    if (isB) {
      if (i > 50 && Math.hypot(x - startX, y - startY) < dt * 2) { ctx.closePath(); break; }
    } else {
      if (Math.abs(x) > SW * 0.58 || Math.abs(y) > SH * 0.58) break;
      let stop = false;
      for (const s of sources) {
        if (s.q * dir < 0 && Math.hypot(x - s.x, y - s.y) < 10) { stop = true; break; }
      }
      if (stop) break;
    }
  }
  ctx.stroke(); ctx.restore();
}

/* ── Sources ─────────────────────────────────────────────────────────────── */
function drawSources(dark) {
  for (const s of sources) {
    const [sx, sy] = toSc(s.x, s.y);
    const inside = isInside(s.x - surfX, s.y - surfY, 0);
    ctx.save();
    if (P.mode === 'E') {
      ctx.fillStyle = s.q > 0 ? (dark ? '#ff5555' : '#cc2222') : (dark ? '#5599ff' : '#2244cc');
      ctx.strokeStyle = inside ? (dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)') : 'rgba(150,150,150,0.4)';
      ctx.lineWidth = inside ? 2.5 : 1.5;
      if (!inside) ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(sx, sy, 11, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'white'; ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(s.q > 0 ? '+' : '−', sx, sy + 1);
    } else {
      const a = s.angle ?? -Math.PI / 2, d = 10;
      const dx = Math.cos(a) * d, dy = Math.sin(a) * d;
      ctx.beginPath(); ctx.arc(sx + dx, sy + dy, 8, 0, 2 * Math.PI);
      ctx.fillStyle = dark ? '#ff5555' : '#cc2222'; ctx.fill();
      ctx.beginPath(); ctx.arc(sx - dx, sy - dy, 8, 0, 2 * Math.PI);
      ctx.fillStyle = dark ? '#5599ff' : '#2244cc'; ctx.fill();
      ctx.fillStyle = 'white'; ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('N', sx + dx, sy + dy); ctx.fillText('S', sx - dx, sy - dy);
    }
    ctx.restore();
  }
}

/* ── Grafici ─────────────────────────────────────────────────────────────── */
// 1: flusso calcolato sulla superficie e valore previsto Q_int/ε₀ (in V·m);
// 2: flusso in funzione della dimensione della superficie: a gradini, salta solo quando una carica
//    entra o esce. Con il campo B il flusso è nullo per qualunque superficie.
function fluxForR(R) {
  const keep = P.R; P.R = R;
  const v = exactFlux(); P.R = keep;
  return v;
}
function drawGraphs() {
  const C = Lab.graphColors(), E = P.mode === 'E', k = E ? PHI_SI : 1;
  const ex = exactFlux() * k, comp = cachedFlux * k;
  let m = Lab.niceMax(Math.max(Math.abs(ex), Math.abs(comp), E ? 50 : 1) * 1.2);
  let g = Lab.panel(gCanvas[0], { title: E ? 'Flusso di E attraverso la superficie (V·m)' : 'Flusso di B (unità arbitrarie)', xr: [0, 2], xStep: 9, xFmt: () => '', yr: [-m, m] });
  if (g) {
    const [c, f] = g;
    const bars = [[0.5, comp, C.accent, 'calcolato ∮ F·dA'], [1.5, ex, C.amber, E ? 'previsto Q_int/ε₀' : 'previsto: 0']];
    for (const [x, v, col, lbl] of bars) {
      const cx = f.X(x), bw = (f.R - f.L) * 0.22, y0 = f.Y(0), y1 = f.Y(v);
      c.fillStyle = col; c.globalAlpha = 0.85; c.fillRect(cx - bw / 2, Math.min(y0, y1), bw, Math.abs(y1 - y0)); c.globalAlpha = 1;
      c.font = '9.5px "DM Sans",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = C.text; c.fillText(lbl, cx, f.B + 10);
      c.font = '9.5px "Space Mono",monospace'; c.fillStyle = C.title; c.fillText(E ? Lab.fmt(v, 0) : Lab.fmt(v, 2), cx, y1 + (v >= 0 ? -8 : 8));
    }
  }
  const Rs = [], pts = [];
  for (let r = 1; r <= 16; r += 0.05) { Rs.push(r); pts.push([r, fluxForR(r * PX_CM) * k]); }
  m = Lab.niceMax(Math.max(...pts.map(p => Math.abs(p[1])), E ? 50 : 1) * 1.1);
  g = Lab.panel(gCanvas[1], { title: 'Flusso in funzione della dimensione della superficie' + (E ? ' (V·m)' : ''), xr: [0, 16], xStep: 2, yr: [-m, m], xLabel: 'raggio / semilato (cm)' });
  if (g) {
    const [c, f] = g;
    Lab.plotPts(c, f, pts, C.amber, 2);
    Lab.dot(c, f, P.R / PX_CM, ex, C.accent, 4.5);
  }
}

/* ── Readout ─────────────────────────────────────────────────────────────── */
function updateReadout() {
  const ex = exactFlux();
  const qIn = sources.filter(s => isInside(s.x - surfX, s.y - surfY, 0)).reduce((a, s) => a + s.q, 0);
  document.getElementById('readout').innerHTML = [
    { label: P.mode === 'E' ? '∮ E·dA calcolato' : '∮ B·dA calcolato', value: fmt(cachedFlux) },
    { label: P.mode === 'E' ? 'Q_int/ε₀' : 'previsto', value: fmt(ex) },
    { label: P.mode === 'E' ? 'carica interna' : 'dipoli', value: P.mode === 'E' ? `${qIn > 0 ? '+' : ''}${qIn} nC` : `${sources.length}` },
    { label: 'superficie',               value: { sphere: 'sferica', cube: 'cubica', blob: 'amorfa' }[P.surface] },
  ].map(r =>
    `<span class="readout-item"><span class="readout-label">${r.label}</span><span class="readout-value">${r.value}</span></span>`
  ).join('');
}

/* ── Animation loop ──────────────────────────────────────────────────────── */
function loop() {
  if (fluxDirty) { cachedFlux = computeFlux(); fluxDirty = false; }
  drawSim();
  drawGraphs();
  updateReadout();
  requestAnimationFrame(loop);
}

/* ── Drag ────────────────────────────────────────────────────────────────── */
let drag = null;
const GRAB = 18;

function evPhy(e) {
  const r = sc.getBoundingClientRect();
  const ex = e.touches ? e.touches[0].clientX : e.clientX;
  const ey = e.touches ? e.touches[0].clientY : e.clientY;
  return [(ex - r.left - CX) / viewZoom, (ey - r.top - CY) / viewZoom];
}

sc.addEventListener('mousedown', e => {
  const [px, py] = evPhy(e);
  if (Math.hypot(px - surfX, py - surfY) < GRAB) { drag = { type: 'surf' }; return; }
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    if (Math.hypot(px - s.x, py - s.y) < GRAB) { drag = { type: 'src', i }; return; }
  }
  if (P.view3D) drag = { type: 'view', lastX: e.clientX };
});
sc.addEventListener('touchstart', e => {
  e.preventDefault();
  const [px, py] = evPhy(e);
  if (Math.hypot(px - surfX, py - surfY) < GRAB) { drag = { type: 'surf' }; return; }
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    if (Math.hypot(px - s.x, py - s.y) < GRAB) { drag = { type: 'src', i }; return; }
  }
  if (P.view3D) drag = { type: 'view', lastX: e.touches[0].clientX };
}, { passive: false });

function onMove(e) {
  if (!drag) return;
  if (drag.type === 'view') {
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    viewAzim += (cx - drag.lastX) * 0.008;
    drag.lastX = cx;
    return;
  }
  const [px, py] = evPhy(e);
  if (drag.type === 'surf') { surfX = px; surfY = py; }
  else { sources[drag.i].x = px; sources[drag.i].y = py; }
  fluxDirty = true;
}
window.addEventListener('mousemove', onMove);
window.addEventListener('touchmove', e => { e.preventDefault(); onMove(e); }, { passive: false });
window.addEventListener('mouseup',  () => { drag = null; });
window.addEventListener('touchend', () => { drag = null; });

sc.addEventListener('wheel', e => {
  e.preventDefault();
  viewZoom = Math.max(0.2, Math.min(6, viewZoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
}, { passive: false });
sc.addEventListener('dblclick', () => { viewZoom = 1; viewAzim = 0.25; });

/* ── Controls ────────────────────────────────────────────────────────────── */
function buildControls() {
  const ctrl = document.getElementById('controls');
  ctrl.innerHTML = '';

  const modeSec = Lab.Section('Campo');
  modeSec.add(Lab.RadioGroup({
    label: 'Tipo campo',
    options: [
      { label: 'Elettrico E',  value: 'E', hint: '∮ E·dA = Q_enc/ε₀' },
      { label: 'Magnetico B',  value: 'B', hint: '∮ B·dA = 0' },
    ],
    value: P.mode,
    onChange: v => {
      P.mode = v;
      if (v === 'B') sources.forEach(s => { s.angle = -Math.PI / 2; s.q = Math.abs(s.q) || 1; });
      fluxDirty = true; buildControls();
    },
  }));
  ctrl.appendChild(modeSec.el);

  const visSec = Lab.Section('Visualizzazione');
  visSec.add(Lab.Toggle({ label: 'Vista 3D',       value: P.view3D,
    onChange: v => { P.view3D = v; } }));
  visSec.add(Lab.Toggle({ label: 'Linee di campo', value: P.fieldLines,
    onChange: v => { P.fieldLines = v; } }));
  ctrl.appendChild(visSec.el);

  const surfSec = Lab.Section('Superficie di Gauss');
  surfSec.add(Lab.RadioGroup({
    label: 'Forma',
    options: [
      { label: 'Sferica', value: 'sphere', hint: 'Sezione circolare' },
      { label: 'Cubica',  value: 'cube',   hint: 'Sezione quadrata'  },
      { label: 'Amorfa',  value: 'blob',   hint: 'Forma irregolare'  },
    ],
    value: P.surface,
    onChange: v => { P.surface = v; fluxDirty = true; },
  }));
  surfSec.add(Lab.Slider({
    label: 'Raggio / semilato', min: 4, max: 15, step: 0.5, value: P.R / PX_CM, unit: ' cm',
    onChange: v => { P.R = v * PX_CM; fluxDirty = true; },
  }));
  ctrl.appendChild(surfSec.el);

  const srcSec = Lab.Section('Sorgenti');
  const addAt = s => { const a = Math.random() * 2 * Math.PI, r = P.R * 0.5 * Math.random(); sources.push({ x: surfX + r * Math.cos(a), y: surfY + r * Math.sin(a), ...s }); fluxDirty = true; buildControls(); };
  srcSec.add(Lab.ItemList({
    items: sources,
    text: (s, i) => (P.mode === 'E' ? `Carica ${i + 1}: ${s.q > 0 ? '+' : '−'}${Math.abs(s.q)} nC` : `Dipolo magnetico ${i + 1}`),
    color: s => (P.mode === 'E' ? (s.q > 0 ? '#ff7070' : '#7090ff') : '#00d4ff'),
    onRemove: i => { sources.splice(i, 1); fluxDirty = true; buildControls(); },
    max: 8,
    add: P.mode === 'E'
      ? [['+1 nC', 1], ['+2 nC', 2], ['−1 nC', -1], ['−2 nC', -2]].map(([label, q]) => ({ label, color: q > 0 ? '#ff7070' : '#7090ff', onClick: () => addAt({ q }) }))
      : [{ label: '+ dipolo', onClick: () => addAt({ q: 1, angle: -Math.PI / 2 }) }],
  }));
  const note = document.createElement('div');
  note.className = 'lab-note';
  note.innerHTML = 'Trascina le sorgenti e il centro della superficie. Il flusso dipende solo dalla carica <b>interna</b>, non da forma e dimensione della superficie.';
  srcSec.add(note);
  ctrl.appendChild(srcSec.el);

  const exSec = Lab.Section('Esempi');
  const ex = document.createElement('div');
  ex.className = 'ctrl-btn-row';
  const EX = P.mode === 'E' ? [
    ['Una carica dentro', [{ x: 30, y: -20, q: 2 }]],
    ['Una carica fuori: Φ = 0', [{ x: -200, y: 40, q: 2 }]],
    ['Dipolo dentro: Φ = 0', [{ x: -35, y: 0, q: 2 }, { x: 35, y: 0, q: -2 }]],
    ['Due dentro, una fuori', [{ x: 40, y: -30, q: 1 }, { x: -45, y: 40, q: 2 }, { x: 205, y: 10, q: -2 }]],
  ] : [
    ['Un dipolo dentro', [{ x: 0, y: 0, q: 1, angle: -Math.PI / 2 }]],
    ['Due dipoli', [{ x: -40, y: 10, q: 1, angle: -Math.PI / 2 }, { x: 50, y: -20, q: 1, angle: 0 }]],
  ];
  for (const [label, src] of EX) {
    const b = document.createElement('button');
    b.className = 'ctrl-btn'; b.textContent = label;
    b.onclick = () => { sources = src.map(o => ({ ...o })); surfX = 0; surfY = 0; fluxDirty = true; buildControls(); };
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
