'use strict';

const sc   = document.getElementById('simCanvas');
const ctx  = sc.getContext('2d');
const gc   = document.getElementById('graphCanvas');
const gctx = gc.getContext('2d');
const DPR  = window.devicePixelRatio || 1;
let SW = 0, SH = 0, GW = 0, GH = 0, CX = 0, CY = 0;

Lab.initTheme('themeToggle');
const dk = () => document.documentElement.dataset.theme !== 'light';

// ── Physical constants ───────────────────────────────────────────────────────
const K_E = 8.99e9, E_C = 1.6e-19, MeV_J = 1.6e-13;

// ── Parameters ───────────────────────────────────────────────────────────────
const P = {
  Z2: 79,        // target atomic number (79 = Au)
  E_MeV: 5.0,   // alpha kinetic energy [MeV]
  bMax: 6.0,     // max impact parameter in D units
  nBeam: 8,      // beam lines per side
  speed: 8.0,
  continuous: false,
};

// ── Element data ─────────────────────────────────────────────────────────────
// Approximate mass number A(Z) and atomic radius R_atom(Z) [pm]
const ELEMENTS = {
   1:{sym:'H',  A:1,   R:53},   2:{sym:'He', A:4,   R:31},
   6:{sym:'C',  A:12,  R:77},   7:{sym:'N',  A:14,  R:75},   8:{sym:'O',  A:16,  R:73},
  13:{sym:'Al', A:27,  R:143}, 14:{sym:'Si', A:28,  R:111},
  26:{sym:'Fe', A:56,  R:126}, 28:{sym:'Ni', A:58,  R:124}, 29:{sym:'Cu', A:64,  R:128},
  47:{sym:'Ag', A:108, R:165}, 50:{sym:'Sn', A:118, R:145},
  79:{sym:'Au', A:197, R:144}, 82:{sym:'Pb', A:208, R:154}, 92:{sym:'U',  A:238, R:156},
};
function elemData(Z) {
  if (ELEMENTS[Z]) return ELEMENTS[Z];
  // Fallback: estimate A ≈ 2Z for light, 2.5Z for heavy; R_atom ≈ 100+Z*0.6 pm (rough)
  const A = Z <= 20 ? Math.round(2 * Z) : Math.round(2.5 * Z - 10);
  return { sym: `Z${Z}`, A, R: Math.round(90 + Z * 0.7) };
}
function elemSym() { return elemData(P.Z2).sym; }
function massNum() { return elemData(P.Z2).A; }
function atomR_pm(){ return elemData(P.Z2).R; }  // atomic radius [pm]

// ── Physics (dimensionless: D=1, v₀=1) ──────────────────────────────────────
// D = kZ₁Z₂e²/T = closest-approach distance for head-on collision
function D_m()     { return K_E * 2 * P.Z2 * E_C * E_C / (P.E_MeV * MeV_J); }
function D_fm()    { return D_m() * 1e15; }
// Nuclear radius R_nuc = r₀·A^(1/3), r₀ = 1.2 fm
function R_nuc_fm(){ return 1.2 * Math.pow(massNum(), 1 / 3); }
// Ratio R_atom/D (for annotation)
function atomD_ratio() { return (atomR_pm() * 1000) / D_fm(); }  // R_atom in fm / D_fm
// Scattering angle from impact parameter b (in D units)
function rutTheta(b) { return b < 1e-9 ? Math.PI : 2 * Math.atan(0.5 / b); }
// Differential cross section dσ/dΩ in units of D²/sr
function dSigma(th)  { const s = Math.sin(th / 2); return s < 1e-6 ? 1e10 : 0.0625 / s ** 4; }
// Impact parameter from angle
function thetaToB(th) { return th < 1e-6 ? 1e9 : 0.5 / Math.tan(th / 2); }

// ── Particle system (RK4, units: D, D/v₀) ───────────────────────────────────
let particles  = [];
let hist       = new Array(36).fill(0);
let totalCount = 0;
let pxPerD     = 1;
let lastTS     = null;
const X0 = 18;  // start/exit distance in D units

function makeParticle(b) {
  return { x: -X0, y: b, vx: 1, vy: 0, b0: b, done: false,
           trail: [[-X0, b]], age: 0 };
}

function accel(x, y) {
  const r2 = x * x + y * y;
  if (r2 < 1e-4) return [0, 0];
  const r3 = r2 * Math.sqrt(r2);
  return [x / r3, y / r3];
}

function stepP(p, dt) {
  const f = (x, y, vx, vy) => { const [ax, ay] = accel(x, y); return [vx, vy, ax, ay]; };
  const [dx1, dy1, dvx1, dvy1] = f(p.x, p.y, p.vx, p.vy);
  const [dx2, dy2, dvx2, dvy2] = f(p.x+.5*dt*dx1, p.y+.5*dt*dy1, p.vx+.5*dt*dvx1, p.vy+.5*dt*dvy1);
  const [dx3, dy3, dvx3, dvy3] = f(p.x+.5*dt*dx2, p.y+.5*dt*dy2, p.vx+.5*dt*dvx2, p.vy+.5*dt*dvy2);
  const [dx4, dy4, dvx4, dvy4] = f(p.x+dt*dx3,    p.y+dt*dy3,    p.vx+dt*dvx3,    p.vy+dt*dvy3   );
  p.x  += dt * (dx1  + 2*dx2  + 2*dx3  + dx4 ) / 6;
  p.y  += dt * (dy1  + 2*dy2  + 2*dy3  + dy4 ) / 6;
  p.vx += dt * (dvx1 + 2*dvx2 + 2*dvx3 + dvx4) / 6;
  p.vy += dt * (dvy1 + 2*dvy2 + 2*dvy3 + dvy4) / 6;
  p.age += dt;
  p.trail.push([p.x, p.y]);
  if (p.trail.length > 320) p.trail.shift();
}

function recordAngle(p) {
  const vmag = Math.hypot(p.vx, p.vy);
  const th   = Math.acos(Math.max(-1, Math.min(1, p.vx / vmag)));
  const bin  = Math.min(35, Math.floor(th * 180 / Math.PI / 5));
  hist[bin]++;
  totalCount++;
}

function resetBeam() {
  particles = [];
  for (let i = 0; i < P.nBeam; i++) {
    const b = P.bMax * (i + 0.5) / P.nBeam;
    particles.push(makeParticle(b));
    particles.push(makeParticle(-b));
  }
}

function update(dtReal) {
  const simDt   = dtReal * P.speed;
  const substeps = 12;
  const subDt    = simDt / substeps;
  const exitR    = X0 * 1.18;

  for (let s = 0; s < substeps; s++) {
    for (const p of particles) {
      if (p.done) continue;
      stepP(p, subDt);
      if (Math.hypot(p.x, p.y) > exitR && p.age > 0.5) {
        p.done = true;
        recordAngle(p);
      }
    }
  }

  if (!P.continuous) {
    // Beam mode: respawn at same impact parameter
    for (const p of particles) {
      if (p.done) {
        p.x = -X0; p.y = p.b0; p.vx = 1; p.vy = 0;
        p.done = false; p.age = 0; p.trail = [[-X0, p.b0]];
      }
    }
  } else {
    // Random mode: replace done particles with new random b
    for (let i = particles.length - 1; i >= 0; i--) {
      if (particles[i].done) particles.splice(i, 1);
    }
    while (particles.length < P.nBeam * 2) {
      const b    = Math.sqrt(Math.random()) * P.bMax;
      const sign = Math.random() < 0.5 ? 1 : -1;
      particles.push(makeParticle(b * sign));
    }
  }
}

// ── Coordinate helpers ───────────────────────────────────────────────────────
const sx = x => CX + x * pxPerD;
const sy = y => CY - y * pxPerD;   // canvas y is inverted

// ── Draw simulation ──────────────────────────────────────────────────────────
function drawSim() {
  const dark = dk();
  ctx.save(); ctx.scale(DPR, DPR);

  // ── 1. Background ──────────────────────────────────────────────────────────
  ctx.fillStyle = dark ? '#06090f' : '#f0f2f5';
  ctx.fillRect(0, 0, SW, SH);
  const gs = 48;
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.030)' : 'rgba(0,0,0,0.040)';
  ctx.lineWidth = 1;
  for (let x = gs; x < SW; x += gs) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,SH); ctx.stroke(); }
  for (let y = gs; y < SH; y += gs) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(SW,y); ctx.stroke(); }

  // ── Pre-compute sizes (needed by both cloud and nucleus sections) ─────────
  const R_nuc_au  = 1.2 * Math.pow(197, 1 / 3);   // ≈ 7.0 fm (gold reference)
  const R_nuc_fm_ = R_nuc_fm();
  const nucVisPx  = Math.max(4, 18 * (R_nuc_fm_ / R_nuc_au));
  const atomMaxPx = Math.min(CY * 0.72, CX * 0.62, (SW - CX) * 0.72);
  const atomVisPx = Math.max(nucVisPx * 3, atomMaxPx * (atomR_pm() / 144));

  // ── 2. Electron cloud ──────────────────────────────────────────────────────
  // Soft glow fill
  const cg = ctx.createRadialGradient(CX, CY, pxPerD * 0.8, CX, CY, atomVisPx * 1.05);
  cg.addColorStop(0,   dark ? 'rgba(80,140,255,0.00)'  : 'rgba(60,100,220,0.00)');
  cg.addColorStop(0.5, dark ? 'rgba(70,130,240,0.05)'  : 'rgba(50,90,200,0.04)');
  cg.addColorStop(0.88,dark ? 'rgba(60,110,220,0.11)'  : 'rgba(40,80,180,0.09)');
  cg.addColorStop(1.0, dark ? 'rgba(50,90,200,0.18)'   : 'rgba(30,65,160,0.14)');
  ctx.beginPath(); ctx.arc(CX, CY, atomVisPx * 1.05, 0, 2 * Math.PI);
  ctx.fillStyle = cg; ctx.fill();
  // Dashed boundary circle
  ctx.beginPath(); ctx.arc(CX, CY, atomVisPx, 0, 2 * Math.PI);
  ctx.strokeStyle = dark ? 'rgba(100,160,255,0.32)' : 'rgba(40,90,200,0.28)';
  ctx.lineWidth = 1.2; ctx.setLineDash([6, 5]); ctx.stroke(); ctx.setLineDash([]);
  // Electron orbit arcs (decorative — 3 faint ellipses)
  for (const [rx, ry, rot] of [[atomVisPx*0.62, atomVisPx*0.28, 0.4],
                                [atomVisPx*0.75, atomVisPx*0.20,-0.5],
                                [atomVisPx*0.55, atomVisPx*0.35, 1.1]]) {
    ctx.save(); ctx.translate(CX, CY); ctx.rotate(rot);
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 2*Math.PI);
    ctx.strokeStyle = dark ? 'rgba(100,160,255,0.10)' : 'rgba(40,90,200,0.08)';
    ctx.lineWidth = 0.8; ctx.stroke();
    ctx.restore();
  }
  // Atom boundary label
  ctx.fillStyle = dark ? 'rgba(100,160,255,0.55)' : 'rgba(40,90,200,0.55)';
  ctx.font = `9px 'Space Mono', monospace`; ctx.textAlign = 'center';
  ctx.fillText(`Nuvola e⁻  R ≈ ${atomR_pm()} pm`, CX, CY - atomVisPx - 7);
  ctx.font = `8px 'DM Sans', sans-serif`;
  ctx.fillText(`(non in scala — R_atom ≈ ${Math.round(atomD_ratio())} D)`, CX, CY - atomVisPx + 10);

  // ── 3. Optical axis ────────────────────────────────────────────────────────
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 1; ctx.setLineDash([6, 5]);
  ctx.beginPath(); ctx.moveTo(0, CY); ctx.lineTo(SW, CY); ctx.stroke();
  ctx.setLineDash([]);

  // ── 4. Beam source indicator (left edge) ──────────────────────────────────
  const beamSrcX = 14;
  // Bracket / "source" icon
  ctx.strokeStyle = dark ? 'rgba(255,160,60,0.45)' : 'rgba(180,80,0,0.45)';
  ctx.lineWidth = 2;
  const bMaxPx = P.bMax * pxPerD;
  ctx.beginPath(); ctx.moveTo(beamSrcX + 6, CY - bMaxPx);
  ctx.lineTo(beamSrcX, CY - bMaxPx); ctx.lineTo(beamSrcX, CY + bMaxPx);
  ctx.lineTo(beamSrcX + 6, CY + bMaxPx); ctx.stroke();
  ctx.fillStyle = dark ? 'rgba(255,160,60,0.65)' : 'rgba(180,80,0,0.65)';
  ctx.font = `bold 9px 'DM Sans', sans-serif`; ctx.textAlign = 'left';
  ctx.fillText('fascio α', beamSrcX + 9, CY - bMaxPx - 6);

  // ── 5. Impact-parameter lines (b lines, positive side only for clarity) ───
  const shownBs = new Set();
  for (const p of particles) {
    const bAbs = Math.abs(p.b0).toFixed(2);
    if (p.b0 <= 0 || shownBs.has(bAbs)) continue;
    shownBs.add(bAbs);
    const yb = sy(p.b0);
    if (yb < 4 || yb > SH - 4) continue;
    ctx.strokeStyle = dark ? 'rgba(255,200,80,0.10)' : 'rgba(160,100,0,0.12)';
    ctx.lineWidth = 1; ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.moveTo(beamSrcX + 8, yb); ctx.lineTo(CX, yb); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = dark ? 'rgba(255,200,80,0.40)' : 'rgba(160,100,0,0.55)';
    ctx.font = `8px 'Space Mono', monospace`; ctx.textAlign = 'left';
    ctx.fillText(`b=${p.b0.toFixed(1)}D`, beamSrcX + 10, yb - 3);
  }

  // ── 6. Particle trails ─────────────────────────────────────────────────────
  for (const p of particles) {
    if (p.trail.length < 2) continue;
    const col = dark ? '255,160,50' : '200,80,0';
    ctx.lineWidth = 1.5;
    const n = p.trail.length;
    for (let i = 1; i < n; i++) {
      const a = Math.pow(i / n, 1.2) * 0.65;
      ctx.strokeStyle = `rgba(${col},${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(sx(p.trail[i-1][0]), sy(p.trail[i-1][1]));
      ctx.lineTo(sx(p.trail[i  ][0]), sy(p.trail[i  ][1]));
      ctx.stroke();
    }
  }

  // ── 7. Alpha particle heads ────────────────────────────────────────────────
  for (const p of particles) {
    if (p.done) continue;
    const px_ = sx(p.x), py_ = sy(p.y);
    if (px_ < -16 || px_ > SW+16 || py_ < -16 || py_ > SH+16) continue;
    // Outer glow
    const glow = ctx.createRadialGradient(px_, py_, 1, px_, py_, 11);
    glow.addColorStop(0,   dark ? 'rgba(255,100,20,0.35)' : 'rgba(200,60,0,0.30)');
    glow.addColorStop(1,   'rgba(255,80,0,0)');
    ctx.beginPath(); ctx.arc(px_, py_, 11, 0, 2*Math.PI);
    ctx.fillStyle = glow; ctx.fill();
    // Core sphere (radius 5)
    const cg2 = ctx.createRadialGradient(px_-1.5, py_-1.5, 0.5, px_, py_, 5.5);
    cg2.addColorStop(0,   '#fff0a0');
    cg2.addColorStop(0.45,'#ff9900');
    cg2.addColorStop(1,   '#cc2200');
    ctx.beginPath(); ctx.arc(px_, py_, 5.5, 0, 2*Math.PI);
    ctx.fillStyle = cg2; ctx.fill();
    ctx.strokeStyle = 'rgba(255,60,0,0.55)'; ctx.lineWidth = 1; ctx.stroke();
    // "α" label
    ctx.fillStyle = '#fff';
    ctx.font = `bold 7px 'Space Mono', monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('α', px_, py_ + 0.5);
    ctx.textBaseline = 'alphabetic';
  }

  // ── 8. Gold nucleus ────────────────────────────────────────────────────────
  const R_nuc_D = R_nuc_fm_ / D_fm();
  // Extended glow
  const ngOuter = ctx.createRadialGradient(CX, CY, nucVisPx * 0.5, CX, CY, nucVisPx * 3.5);
  ngOuter.addColorStop(0,   dark ? 'rgba(255,220,60,0.45)' : 'rgba(200,140,0,0.40)');
  ngOuter.addColorStop(0.5, dark ? 'rgba(255,170,20,0.12)' : 'rgba(180,100,0,0.10)');
  ngOuter.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.beginPath(); ctx.arc(CX, CY, nucVisPx * 3.5, 0, 2*Math.PI);
  ctx.fillStyle = ngOuter; ctx.fill();
  // Nucleus sphere
  const ngCore = ctx.createRadialGradient(CX-3, CY-3, 1, CX, CY, nucVisPx);
  ngCore.addColorStop(0,   '#fffce0');
  ngCore.addColorStop(0.35,'#ffd040');
  ngCore.addColorStop(0.75,'#e09000');
  ngCore.addColorStop(1,   '#8b5500');
  ctx.beginPath(); ctx.arc(CX, CY, nucVisPx, 0, 2*Math.PI);
  ctx.fillStyle = ngCore; ctx.fill();
  ctx.strokeStyle = dark ? 'rgba(255,210,60,0.70)' : 'rgba(160,100,0,0.70)';
  ctx.lineWidth = 1.5; ctx.stroke();
  // "Au" text
  ctx.fillStyle = '#1a0800';
  ctx.font = `bold ${Math.max(8, nucVisPx * 0.65).toFixed(0)}px 'DM Sans', sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(elemSym(), CX, CY); ctx.textBaseline = 'alphabetic';
  // Nuclear radius annotation
  ctx.strokeStyle = dark ? 'rgba(255,210,60,0.40)' : 'rgba(160,100,0,0.40)';
  ctx.lineWidth = 0.8; ctx.setLineDash([2, 3]);
  ctx.beginPath(); ctx.moveTo(CX + nucVisPx, CY); ctx.lineTo(CX + nucVisPx + 18, CY - 18); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = dark ? 'rgba(255,210,60,0.65)' : 'rgba(160,100,0,0.65)';
  ctx.font = `8px 'Space Mono', monospace`; ctx.textAlign = 'left';
  ctx.fillText(`R_nuc ≈ ${R_nuc_fm_.toFixed(1)} fm`, CX + nucVisPx + 20, CY - 18);

  // ── 9. D reference ring ────────────────────────────────────────────────────
  ctx.beginPath(); ctx.arc(CX, CY, pxPerD, 0, 2*Math.PI);
  ctx.strokeStyle = dark ? 'rgba(255,200,80,0.20)' : 'rgba(160,120,0,0.20)';
  ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = dark ? 'rgba(255,200,80,0.48)' : 'rgba(140,90,0,0.55)';
  ctx.font = `8px 'Space Mono', monospace`; ctx.textAlign = 'left';
  ctx.fillText(`D=${D_fm().toFixed(1)} fm`, CX + pxPerD + 4, CY - 3);

  // ── 10. Angle arcs + θ labels for scattered particles ─────────────────────
  for (const p of particles) {
    if (p.done || p.x < 0.5 || Math.abs(p.b0) < 0.02) continue;
    const vmag = Math.hypot(p.vx, p.vy);
    const th   = Math.acos(Math.max(-1, Math.min(1, p.vx / vmag)));
    if (th < 0.06) continue;
    const sign  = p.b0 > 0 ? 1 : -1;   // b>0 → scattered downward in canvas (+y)
    const arcR  = Math.min(32 + Math.abs(p.b0) * pxPerD * 0.15, 55);
    ctx.strokeStyle = dark ? 'rgba(255,200,80,0.42)' : 'rgba(160,100,0,0.42)';
    ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    // Arc from 0 to ±th in canvas coords (downward = positive, so b>0 → +th from +x axis)
    ctx.beginPath(); ctx.arc(CX, CY, arcR, 0, sign * th, false);
    ctx.stroke(); ctx.setLineDash([]);
    const midAng = sign * th * 0.5;
    ctx.fillStyle = dark ? 'rgba(255,200,80,0.70)' : 'rgba(160,100,0,0.70)';
    ctx.font = `8px 'Space Mono', monospace`; ctx.textAlign = 'left';
    ctx.fillText(`${(th * 180 / Math.PI).toFixed(0)}°`,
      CX + (arcR + 7) * Math.cos(midAng), CY + (arcR + 7) * Math.sin(midAng) + 3);
  }

  // ── 11. Scale bar at bottom-left ──────────────────────────────────────────
  const sbY = SH - 18, sbX = 20;
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.38)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(sbX, sbY); ctx.lineTo(sbX + pxPerD, sbY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(sbX, sbY-4); ctx.lineTo(sbX, sbY+4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(sbX+pxPerD, sbY-4); ctx.lineTo(sbX+pxPerD, sbY+4); ctx.stroke();
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.48)' : 'rgba(0,0,0,0.48)';
  ctx.font = `8px 'Space Mono', monospace`; ctx.textAlign = 'left';
  ctx.fillText(`1D = ${D_fm().toFixed(1)} fm`, sbX + pxPerD + 5, sbY + 3);

  // ── 12. Top-left info ─────────────────────────────────────────────────────
  ctx.textAlign = 'left'; ctx.font = `10px 'Space Mono', monospace`;
  ctx.fillStyle = dark ? 'rgba(255,200,80,0.72)' : 'rgba(140,80,0,0.72)';
  ctx.fillText(`α → ${elemSym()} (Z=${P.Z2}, A=${massNum()})   E₀=${P.E_MeV} MeV`, 12, 18);
  if (P.continuous && totalCount > 0) {
    ctx.textAlign = 'right'; ctx.fillStyle = dark ? '#ffffff44' : '#00000044';
    ctx.fillText(`${totalCount} rilevate`, SW - 12, 18);
  }

  ctx.restore();
}

// ── Draw graph ─────────────────────────────────────────────────────────────────
// Left: dσ/dΩ vs θ (Rutherford formula, log y-axis)
// Right: angular histogram of recorded events
function drawGraph() {
  const dark = dk();
  const bg   = dark ? '#111111' : '#ffffff';
  const fg   = dark ? '#cccccc' : '#444444';
  const grid = dark ? '#1e1e1e' : '#eeeeee';

  gctx.save(); gctx.scale(DPR, DPR);
  gctx.fillStyle = bg; gctx.fillRect(0, 0, GW, GH);

  const splitX = Math.round(GW * 0.58);

  // ── Left: Rutherford dσ/dΩ(θ) ────────────────────────────────────────────
  const LP = { l: 46, r: 8, t: 20, b: 30 };
  const lW = splitX - LP.l - LP.r, lH = GH - LP.t - LP.b;
  const thMin = 2 * Math.PI / 180, thMax = Math.PI;
  const logMin = -1, logMax = 6;  // log10 of dσ/dΩ in D²/sr
  const gxTh = th => LP.l + (th - thMin) / (thMax - thMin) * lW;
  const gyDs = v  => LP.t + (1 - (v - logMin) / (logMax - logMin)) * lH;

  // Grid
  for (let v = logMin; v <= logMax; v++) {
    const y = gyDs(v);
    gctx.strokeStyle = grid; gctx.lineWidth = 1;
    gctx.beginPath(); gctx.moveTo(LP.l, y); gctx.lineTo(LP.l + lW, y); gctx.stroke();
    gctx.fillStyle = fg + '88'; gctx.font = `8px 'Space Mono', monospace`; gctx.textAlign = 'right';
    gctx.fillText(`10${superscript(v)}`, LP.l - 3, y + 3);
  }
  for (let deg of [30, 60, 90, 120, 150]) {
    const x = gxTh(deg * Math.PI / 180);
    gctx.strokeStyle = grid; gctx.lineWidth = 1;
    gctx.beginPath(); gctx.moveTo(x, LP.t); gctx.lineTo(x, LP.t + lH); gctx.stroke();
    gctx.fillStyle = fg + '88'; gctx.font = `8px 'Space Mono', monospace`; gctx.textAlign = 'center';
    gctx.fillText(deg + '°', x, LP.t + lH + 18);
  }

  // Rutherford curve
  gctx.beginPath();
  let first = true;
  for (let i = 0; i <= 300; i++) {
    const th  = thMin + (thMax - thMin) * i / 300;
    const ds  = dSigma(th);
    const lv  = Math.log10(Math.max(1e-2, ds));
    if (lv < logMin || lv > logMax) { first = true; continue; }
    const x = gxTh(th), y = gyDs(lv);
    first ? (gctx.moveTo(x, y), first = false) : gctx.lineTo(x, y);
  }
  gctx.strokeStyle = dark ? '#ffcc44' : '#c08000'; gctx.lineWidth = 2; gctx.stroke();

  // Mark current bMax and corresponding θ_min
  const thMin_b = rutTheta(P.bMax);
  if (thMin_b > thMin) {
    const xm = gxTh(thMin_b);
    gctx.strokeStyle = dark ? '#ff8844aa' : '#cc440088';
    gctx.lineWidth = 1; gctx.setLineDash([4, 3]);
    gctx.beginPath(); gctx.moveTo(xm, LP.t); gctx.lineTo(xm, LP.t + lH); gctx.stroke();
    gctx.setLineDash([]);
    gctx.fillStyle = dark ? '#ff8844cc' : '#cc4400cc';
    gctx.font = `8px 'DM Sans', sans-serif`; gctx.textAlign = 'center';
    gctx.fillText('θ_min', xm, LP.t + 9);
  }

  // Axes
  gctx.strokeStyle = fg + 'bb'; gctx.lineWidth = 1;
  gctx.beginPath(); gctx.moveTo(LP.l, LP.t); gctx.lineTo(LP.l, LP.t+lH); gctx.lineTo(LP.l+lW, LP.t+lH); gctx.stroke();
  gctx.fillStyle = fg + 'aa'; gctx.font = `9px 'DM Sans', sans-serif`; gctx.textAlign = 'center';
  gctx.fillText('θ [gradi]', LP.l + lW / 2, LP.t + lH + 28);
  gctx.save(); gctx.translate(LP.l - 36, LP.t + lH / 2);
  gctx.rotate(-Math.PI / 2);
  gctx.fillText('dσ/dΩ [D²/sr]', 0, 0);
  gctx.restore();
  gctx.fillStyle = fg + 'cc'; gctx.font = `9px 'DM Sans', sans-serif`; gctx.textAlign = 'left';
  gctx.fillText('Rutherford', LP.l + 4, LP.t + 11);

  // Divider
  gctx.strokeStyle = grid; gctx.lineWidth = 1;
  gctx.beginPath(); gctx.moveTo(splitX, 4); gctx.lineTo(splitX, GH - 4); gctx.stroke();

  // ── Right: angular histogram ──────────────────────────────────────────────
  const RP = { l: splitX + 10, r: 8, t: 20, b: 30 };
  const rW = GW - RP.l - RP.r, rH = GH - RP.t - RP.b;
  const nBins = 36;
  const histMax = Math.max(1, ...hist);
  const barW = rW / nBins;

  gctx.fillStyle = fg + 'bb'; gctx.font = `9px 'DM Sans', sans-serif`; gctx.textAlign = 'center';
  gctx.fillText('Distribuzione angolare', RP.l + rW / 2, RP.t - 6);

  for (let b = 0; b < nBins; b++) {
    const h = (hist[b] / histMax) * rH;
    const x = RP.l + b * barW;
    const th_c = (b + 0.5) * 5 * Math.PI / 180;
    const ds   = dSigma(th_c);
    const col  = dark ? '#ffcc44' : '#c08000';
    gctx.fillStyle = col + '55';
    gctx.fillRect(x, RP.t + rH - h, barW - 1, h);
    gctx.strokeStyle = col + 'aa'; gctx.lineWidth = 1;
    gctx.strokeRect(x, RP.t + rH - h, barW - 1, h);
  }

  // Rutherford shape overlay (dσ/dΩ · sinθ, normalized to panel)
  {
    // Sample to find max for normalization
    let shapeMax = 0;
    for (let i = 1; i <= 300; i++) {
      const th = (i / 300) * Math.PI;
      shapeMax = Math.max(shapeMax, dSigma(th) * Math.sin(th));
    }
    gctx.beginPath();
    let fst = true;
    for (let i = 1; i <= 300; i++) {
      const th = (i / 300) * Math.PI;
      const v  = Math.min(dSigma(th) * Math.sin(th) / shapeMax, 1);
      const x  = RP.l + (th / Math.PI) * rW;
      const y  = RP.t + rH * (1 - v);
      fst ? (gctx.moveTo(x, y), fst = false) : gctx.lineTo(x, y);
    }
    gctx.strokeStyle = dark ? '#ff884466' : '#cc440066'; gctx.lineWidth = 1.5;
    gctx.setLineDash([3, 3]); gctx.stroke(); gctx.setLineDash([]);
  }

  // Axis labels
  gctx.strokeStyle = fg + 'bb'; gctx.lineWidth = 1;
  gctx.beginPath(); gctx.moveTo(RP.l, RP.t); gctx.lineTo(RP.l, RP.t+rH); gctx.lineTo(RP.l+rW, RP.t+rH); gctx.stroke();
  gctx.fillStyle = fg + '88'; gctx.font = `8px 'Space Mono', monospace`; gctx.textAlign = 'center';
  for (const deg of [0, 45, 90, 135, 180]) {
    const x = RP.l + (deg / 180) * rW;
    gctx.fillText(deg + '°', x, RP.t + rH + 16);
  }
  if (totalCount > 0) {
    gctx.fillStyle = fg + 'aa'; gctx.font = `8px 'DM Sans', sans-serif`; gctx.textAlign = 'right';
    gctx.fillText(`n=${totalCount}`, RP.l + rW, RP.t + 11);
  }

  gctx.restore();
}

function superscript(n) {
  const s = n < 0 ? '⁻' : '';
  const d = Math.abs(n).toString();
  return s + d.split('').map(c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]).join('');
}

// ── Readout ───────────────────────────────────────────────────────────────────
function updateReadout() {
  const D    = D_fm();
  const thMn = rutTheta(P.bMax) * 180 / Math.PI;
  const ds90 = dSigma(Math.PI / 2);
  document.getElementById('readout').innerHTML = [
    { label: 'Bersaglio', value: `${elemSym()} (Z=${P.Z2}, A=${massNum()})` },
    { label: 'E_α',       value: `${P.E_MeV} MeV` },
    { label: 'D',         value: `${D.toFixed(2)} fm` },
    { label: 'R_nuc',     value: `${R_nuc_fm().toFixed(1)} fm  (${(R_nuc_fm()/D).toFixed(3)} D)` },
    { label: 'R_atom',    value: `${atomR_pm()} pm  (≈${Math.round(atomD_ratio())} D)` },
    { label: 'θ_min',     value: `${thMn.toFixed(1)}°` },
    { label: 'dσ/dΩ|90°', value: `${ds90.toFixed(3)} D²/sr` },
  ].map(r =>
    `<span class="readout-item"><span class="readout-label">${r.label}</span><span class="readout-value">${r.value}</span></span>`
  ).join('');
}

// ── Controls ──────────────────────────────────────────────────────────────────
function buildControls() {
  const el = document.getElementById('controls');
  el.innerHTML = '';

  const secTarget = Lab.Section('Bersaglio');
  secTarget.add(Lab.Slider({ label: 'Numero atomico Z₂', min: 1, max: 92, step: 1, value: P.Z2, unit: '',
    onChange: v => { P.Z2 = Math.round(v); resetBeam(); } }));
  el.appendChild(secTarget.el);

  const secBeam = Lab.Section('Fascio α');
  secBeam.add(Lab.Slider({ label: 'Energia [MeV]', min: 1, max: 20, step: 0.5, value: P.E_MeV, unit: ' MeV',
    onChange: v => { P.E_MeV = v; resetBeam(); } }));
  secBeam.add(Lab.Slider({ label: 'b_max [D]', min: 1, max: 12, step: 0.5, value: P.bMax, unit: ' D',
    onChange: v => { P.bMax = v; resetBeam(); } }));
  secBeam.add(Lab.Slider({ label: 'Linee del fascio', min: 2, max: 16, step: 1, value: P.nBeam, unit: '',
    onChange: v => { P.nBeam = Math.round(v); resetBeam(); } }));
  el.appendChild(secBeam.el);

  const secSim = Lab.Section('Simulazione');
  secSim.add(Lab.Toggle({ label: 'Modo casuale (istogramma)', value: P.continuous,
    onChange: v => {
      P.continuous = v;
      hist = new Array(36).fill(0); totalCount = 0;
      resetBeam();
      buildControls();
    } }));
  secSim.add(Lab.Slider({ label: 'Velocità', min: 0.2, max: 200, step: 0.2, value: P.speed, unit: '×',
    onChange: v => { P.speed = v; } }));
  el.appendChild(secSim.el);

  if (P.continuous) {
    const actions = document.createElement('div');
    actions.className = 'panel-actions';
    const btn = document.createElement('button');
    btn.className = 'btn-secondary'; btn.textContent = 'AZZERA ISTOGRAMMA';
    btn.addEventListener('click', () => { hist = new Array(36).fill(0); totalCount = 0; });
    actions.appendChild(btn); el.appendChild(actions);
  }

  const info = document.createElement('div');
  info.style.cssText = 'margin-top:14px;font-size:11px;color:var(--text-secondary);line-height:1.7;padding:10px 12px;background:var(--bg3);border-radius:8px';
  info.innerHTML = '<b style="color:var(--text-primary)">Scattering di Rutherford</b><br>' +
    'Particelle α (Z=2) deflesse dal nucleo d\'oro tramite forza di Coulomb repulsiva.<br>' +
    'b = parametro d\'impatto; D = distanza di avvicinamento massimo.<br>' +
    'Formula: <i>b = (D/2) cot(θ/2)</i>';
  el.appendChild(info);
}

// ── Resize ────────────────────────────────────────────────────────────────────
function resize() {
  const area = sc.parentElement;
  const ga   = document.getElementById('graphArea');
  const rd   = area.querySelector('.readout-bar');
  const rdH  = rd ? rd.clientHeight || 48 : 48;
  const gaH  = ga ? ga.clientHeight || 190 : 190;

  SW = area.clientWidth;
  SH = Math.max(80, area.clientHeight - gaH - rdH);
  sc.width = Math.round(SW * DPR); sc.height = Math.round(SH * DPR);
  sc.style.width = SW + 'px'; sc.style.height = SH + 'px';
  CX = SW * 0.40; CY = SH / 2;

  GW = area.clientWidth; GH = gaH;
  gc.width = Math.round(GW * DPR); gc.height = Math.round(GH * DPR);
  gc.style.width = GW + 'px'; gc.style.height = GH + 'px';

  // Scale: leave ~30px left margin, bMax * pxPerD ≤ 80% of half-height
  pxPerD = Math.min((CX - 30) / X0, (CY * 0.80) / Math.max(P.bMax, 1));
  resetBeam();
}

// ── Loop ──────────────────────────────────────────────────────────────────────
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
  resize();
  buildControls();
  window.addEventListener('resize', resize);
  requestAnimationFrame(loop);
}

init();
