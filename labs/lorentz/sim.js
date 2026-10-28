'use strict';

/* ── Canvas ──────────────────────────────────────────────────────────────── */
const sc   = document.getElementById('simCanvas');
const ctx  = sc.getContext('2d');
let DPR  = window.devicePixelRatio || 1;
let SW = 0, SH = 0;
let gCanvas = [];

Lab.initTheme('themeToggle');
const dk = () => document.documentElement.dataset.theme !== 'light';

/* ── Parametri ────────────────────────────────────────────────────────────── */
// Coordinate destrorse: x a destra, y in alto, z verso chi guarda. B = (0, 0, B), E = (0, E, 0).
// Fisica in unità SI con particelle vere. Le scale di lunghezza e di tempo dipendono solo dal tipo
// di particella (non da B o da v), così cambiando i parametri si vede davvero il raggio cambiare.
const QE = 1.602e-19;
const PT = {
  e: { name: 'Elettrone',     m: 9.109e-31, q: -QE,   Bmax: 2e-3, Bdef: 1e-3, Bu: [1e-3, 'mT'], vmax: 5e6, vdef: 2e6, vu: [1e6, '10⁶ m/s'], Emax: 3000, Eu: [1, 'V/m'], L: [1e-3, 'mm'], ppu: 8, col: '#4d9fff' },
  p: { name: 'Protone',       m: 1.673e-27, q: QE,    Bmax: 0.2,  Bdef: 0.1,  Bu: [1e-3, 'mT'], vmax: 3e5, vdef: 1e5, vu: [1e3, 'km/s'],    Emax: 2e4,  Eu: [1e3, 'kV/m'], L: [1e-2, 'cm'], ppu: 40, col: '#ff5757' },
  a: { name: 'Particella α',  m: 6.645e-27, q: 2 * QE, Bmax: 0.2, Bdef: 0.1,  Bu: [1e-3, 'mT'], vmax: 3e5, vdef: 1e5, vu: [1e3, 'km/s'],    Emax: 2e4,  Eu: [1e3, 'kV/m'], L: [1e-2, 'cm'], ppu: 20, col: '#ffb400' },
};
const P = {
  pt:        'p',
  Bz:        0.1,     // T  (+ = uscente)
  E:         0,       // V/m lungo +y
  v0:        1e5,     // m/s nel piano (parte lungo +x)
  vz:        0,       // m/s lungo B
  showTrail: true,
  showForce: true,
  follow:    true,
};
const pt = () => PT[P.pt];
const k = () => pt().ppu / pt().L[0];                       // pixel di scena per metro
// tempo: un giro di ciclotrone con il campo predefinito dura ~3 s sullo schermo
const timeScale = () => 2 * Math.PI * pt().m / (Math.abs(pt().q) * pt().Bdef) / 3;
const omegaC = () => Math.abs(pt().q * P.Bz) / pt().m;

/* ── Camera ──────────────────────────────────────────────────────────────── */
let camTheta = 0.45;   // azimuth (rad)
let camPhi   = 0.35;   // elevation (rad)
let zoom     = 1.0;
let panX     = 0;
let panY     = 0;

/* ── State ───────────────────────────────────────────────────────────────── */
let particle = null;
let paused   = false;

const TRAIL_LEN = 1500;
const SUBSTEPS  = 8;
const DT        = 1 / 60;
let simT = 0;            // tempo vero (s)
let hist = [];           // [t, |v|, v_∥, energia cinetica in eV]
let follow = { x: 0, y: 0, z: 0 };   // centro della vista che insegue la particella (pixel di scena)

/* ── Particella ───────────────────────────────────────────────────────────── */
function initParticle() {
  hist = []; simT = 0; follow = { x: 0, y: 0, z: 0 };
  particle = { X: 0, Y: 0, Z: 0, vx: P.v0, vy: 0, vz: P.vz, x: 0, y: 0, z: 0, trail: [], color: pt().col };
}

/* ── Fisica: F = q(E + v×B) ──────────────────────────────────────────────── */
// v×B con B = (0,0,B): (vy·B, −vx·B, 0)
function accel(vx, vy, vz) {
  const qm = pt().q / pt().m;
  return [qm * vy * P.Bz, qm * (P.E - vx * P.Bz), 0];
}

/* ── Passo RK4 (stato a 6 componenti, SI) ─────────────────────────────────── */
function rk4Step(p, dt) {
  const [c1,d1,e1] = accel(p.vx,           p.vy,           p.vz          );
  const [c2,d2,e2] = accel(p.vx+.5*dt*c1, p.vy+.5*dt*d1, p.vz+.5*dt*e1);
  const [c3,d3,e3] = accel(p.vx+.5*dt*c2, p.vy+.5*dt*d2, p.vz+.5*dt*e2);
  const [c4,d4,e4] = accel(p.vx+dt*c3,    p.vy+dt*d3,    p.vz+dt*e3   );
  const a1=p.vx, b1=p.vy, f1=p.vz;
  const a2=p.vx+.5*dt*c1, b2=p.vy+.5*dt*d1, f2=p.vz+.5*dt*e1;
  const a3=p.vx+.5*dt*c2, b3=p.vy+.5*dt*d2, f3=p.vz+.5*dt*e2;
  const a4=p.vx+dt*c3,    b4=p.vy+dt*d3,    f4=p.vz+dt*e3;
  p.X  += dt*(a1+2*a2+2*a3+a4)/6;
  p.Y  += dt*(b1+2*b2+2*b3+b4)/6;
  p.Z  += dt*(f1+2*f2+2*f3+f4)/6;
  p.vx += dt*(c1+2*c2+2*c3+c4)/6;
  p.vy += dt*(d1+2*d2+2*d3+d4)/6;
  p.vz += dt*(e1+2*e2+2*e3+e4)/6;
}

/* ── Passo di simulazione ─────────────────────────────────────────────────── */
function step() {
  const dt = DT * timeScale() / SUBSTEPS;
  for (let s = 0; s < SUBSTEPS; s++) rk4Step(particle, dt);
  simT += DT * timeScale();
  const p = particle, K = k();
  p.x = p.X * K; p.y = p.Y * K; p.z = p.Z * K;
  p.trail.push({ x: p.x, y: p.y, z: p.z });
  if (p.trail.length > TRAIL_LEN) p.trail.shift();
  // la vista segue lentamente la particella (utile con la deriva E×B)
  const a = P.follow ? 0.03 : 0;
  follow.x += (p.x - follow.x) * a; follow.y += (p.y - follow.y) * a; follow.z += (p.z - follow.z) * a;
  const v2 = p.vx * p.vx + p.vy * p.vy + p.vz * p.vz;
  hist.push([simT, Math.sqrt(v2), p.vz, 0.5 * pt().m * v2 / QE]);
  if (hist.length > 600) hist.shift();
}

/* ── 3D projection (orthographic orbit camera) ───────────────────────────── */
function proj(wx, wy, wz) {
  wx -= follow.x; wy -= follow.y; wz -= follow.z;
  // Rotate around Y (azimuth)
  const ct = Math.cos(camTheta), st = Math.sin(camTheta);
  const x1 = wx*ct - wz*st;
  const z1 = wx*st + wz*ct;
  // Rotate around X (elevation)
  const cp = Math.cos(camPhi), sp = Math.sin(camPhi);
  const y1 =  wy*cp - z1*sp;
  const z2 =  wy*sp + z1*cp;
  return {
    sx: SW/2 + panX + x1*zoom,
    sy: SH/2 + panY - y1*zoom,
    depth: z2,
  };
}

/* ── Drawing ─────────────────────────────────────────────────────────────── */
function drawSim() {
  const dark = dk();
  ctx.save();
  ctx.scale(DPR, DPR);

  ctx.fillStyle = dark ? '#060a10' : '#e8f0f8';
  ctx.fillRect(0, 0, SW, SH);

  drawBField(dark);
  if (particle) {
    if (P.showTrail) {
      drawShadowTrail(particle, dark);
      drawTrail(particle);
    }
    drawParticle(particle, dark);
    if (P.showForce) drawForceVector(particle, dark);
  }
  drawAxesGizmo(dark);
  drawHint(dark);

  ctx.restore();
}

function drawBField(dark) {
  const S = 75, L = 45;
  const gx0 = Math.round(follow.x / S) * S, gy0 = Math.round(follow.y / S) * S;
  ctx.save();
  if (Math.abs(P.Bz) > 1e-9) {
    const a = 0.08 + 0.2 * Math.min(1, Math.abs(P.Bz) / pt().Bmax);
    const col = dark ? `rgba(0,212,255,${a})` : `rgba(0,100,180,${a * 0.85})`;
    const sgn = Math.sign(P.Bz);
    ctx.strokeStyle = ctx.fillStyle = col; ctx.lineWidth = 1;
    for (let gx = gx0 - 225; gx <= gx0 + 225; gx += S) for (let gy = gy0 - 225; gy <= gy0 + 225; gy += S) {
      const tail = proj(gx, gy, follow.z - sgn * L), head = proj(gx, gy, follow.z + sgn * L);
      const ang = Math.atan2(head.sy - tail.sy, head.sx - tail.sx);
      ctx.beginPath(); ctx.moveTo(tail.sx, tail.sy); ctx.lineTo(head.sx, head.sy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(head.sx, head.sy);
      ctx.lineTo(head.sx - 5*Math.cos(ang-0.5), head.sy - 5*Math.sin(ang-0.5));
      ctx.lineTo(head.sx - 5*Math.cos(ang+0.5), head.sy - 5*Math.sin(ang+0.5));
      ctx.closePath(); ctx.fill();
    }
  }
  if (Math.abs(P.E) > 1e-9) {
    // E lungo y: frecce ambra nel piano z = 0
    const a = 0.12 + 0.3 * Math.min(1, Math.abs(P.E) / pt().Emax);
    const col = dark ? `rgba(255,180,0,${a})` : `rgba(180,110,0,${a})`;
    const sgn = Math.sign(P.E);
    ctx.strokeStyle = ctx.fillStyle = col; ctx.lineWidth = 1.2;
    for (let gx = gx0 - 225 + S / 2; gx <= gx0 + 225; gx += S) for (let gy = gy0 - 225 + S / 2; gy <= gy0 + 225; gy += S) {
      const tail = proj(gx, gy - sgn * 22, follow.z), head = proj(gx, gy + sgn * 22, follow.z);
      const ang = Math.atan2(head.sy - tail.sy, head.sx - tail.sx);
      ctx.beginPath(); ctx.moveTo(tail.sx, tail.sy); ctx.lineTo(head.sx, head.sy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(head.sx, head.sy);
      ctx.lineTo(head.sx - 5*Math.cos(ang-0.5), head.sy - 5*Math.sin(ang-0.5));
      ctx.lineTo(head.sx - 5*Math.cos(ang+0.5), head.sy - 5*Math.sin(ang+0.5));
      ctx.closePath(); ctx.fill();
    }
  }
  // etichette dei campi (in alto a destra)
  ctx.font = 'bold 11px "Space Mono", monospace';
  ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  ctx.fillStyle = dark ? 'rgba(0,212,255,0.8)' : 'rgba(0,100,180,0.85)';
  ctx.fillText(`B = ${Lab.fmt(Math.abs(P.Bz) / pt().Bu[0], 2)} ${pt().Bu[1]} ${P.Bz >= 0 ? '⊙ (+z)' : '⊗ (−z)'}`, SW - 10, 10);
  ctx.fillStyle = dark ? 'rgba(255,180,0,0.85)' : 'rgba(170,100,0,0.9)';
  ctx.fillText(`E = ${Lab.fmt(Math.abs(P.E) / pt().Eu[0], 2)} ${pt().Eu[1]} ${P.E >= 0 ? '↑ (+y)' : '↓ (−y)'}`, SW - 10, 26);
  // scala delle lunghezze
  const bar = 5 * pt().ppu * zoom;
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(SW - 20 - bar, SH - 22); ctx.lineTo(SW - 20, SH - 22);
  ctx.moveTo(SW - 20 - bar, SH - 26); ctx.lineTo(SW - 20 - bar, SH - 18); ctx.moveTo(SW - 20, SH - 26); ctx.lineTo(SW - 20, SH - 18); ctx.stroke();
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)';
  ctx.font = '10px "Space Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(`5 ${pt().L[1]}`, SW - 20 - bar / 2, SH - 28);
  ctx.restore();
}

// Axes gizmo fixed in top-left corner — rotates with camera but stays on screen.
function drawAxesGizmo(dark) {
  const OX = 100, OY = 100; // anchor (CSS px from top-left)
  const L  = 38;           // arm length in CSS px
  const ct = Math.cos(camTheta), st = Math.sin(camTheta);
  const cp = Math.cos(camPhi),   sp = Math.sin(camPhi);

  // Project a unit world vector to a 2D screen offset (no zoom/pan, fixed scale L)
  function axisDir(wx, wy, wz) {
    const x1 = wx*ct - wz*st;
    const z1 = wx*st + wz*ct;
    const y1 = wy*cp - z1*sp;
    return { dx: x1 * L, dy: -y1 * L };
  }

  const axes = [
    { d: axisDir(1,0,0), col: '#ff5555', lbl: 'X' },
    { d: axisDir(0,1,0), col: '#55cc55', lbl: 'Y' },
    { d: axisDir(0,0,1), col: '#00d4ff', lbl: 'Z' },
  ];

  ctx.save();
  for (const { d, col, lbl } of axes) {
    const ex = OX + d.dx, ey = OY + d.dy;
    const ang = Math.atan2(d.dy, d.dx);
    const alpha = dark ? 'cc' : 'aa';
    ctx.strokeStyle = col + alpha;
    ctx.fillStyle   = col + alpha;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(OX, OY); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - 7*Math.cos(ang-0.4), ey - 7*Math.sin(ang-0.4));
    ctx.lineTo(ex - 7*Math.cos(ang+0.4), ey - 7*Math.sin(ang+0.4));
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = col;
    ctx.font = 'bold 10px "Space Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(lbl, ex + 11*Math.cos(ang), ey + 11*Math.sin(ang));
  }
  ctx.restore();
}

function drawForceVector(p, dark) {
  const [ax, ay] = accel(p.vx, p.vy, p.vz);
  const Fx = ax, Fy = ay;
  const Fmag = Math.hypot(Fx, Fy);
  if (Fmag < 1e-12) return;

  // Fixed arrow length in world units (stays proportional to zoom)
  const ARROW = 55;
  const scale = ARROW / Fmag;
  const { sx: x0, sy: y0 } = proj(p.x, p.y, p.z);
  const { sx: x1, sy: y1 } = proj(p.x + Fx*scale, p.y + Fy*scale, p.z);

  const ang = Math.atan2(y1 - y0, x1 - x0);
  const col = dark ? '#ff9944' : '#cc5500';

  ctx.save();
  ctx.strokeStyle = col; ctx.fillStyle = col;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - 10*Math.cos(ang-0.4), y1 - 10*Math.sin(ang-0.4));
  ctx.lineTo(x1 - 10*Math.cos(ang+0.4), y1 - 10*Math.sin(ang+0.4));
  ctx.closePath(); ctx.fill();
  ctx.font = 'bold 10px "Space Mono", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('F', x1 + 12*Math.cos(ang), y1 + 12*Math.sin(ang));
  ctx.restore();
}

function drawShadowTrail(p, dark) {
  const T = p.trail;
  if (T.length < 2) return;
  ctx.save();
  ctx.globalAlpha = 0.10;
  ctx.strokeStyle = p.color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  let pt = proj(T[0].x, T[0].y, 0);
  ctx.moveTo(pt.sx, pt.sy);
  for (let i = 1; i < T.length; i++) {
    pt = proj(T[i].x, T[i].y, 0);
    ctx.lineTo(pt.sx, pt.sy);
  }
  ctx.stroke();
  ctx.restore();
}

function drawTrail(p) {
  const T = p.trail;
  if (T.length < 2) return;
  const BATCHES = 8;
  ctx.save();
  ctx.lineWidth = 1.5;
  for (let b = 0; b < BATCHES; b++) {
    const s = Math.floor(b       * T.length / BATCHES);
    const e = Math.floor((b + 1) * T.length / BATCHES);
    if (e <= s + 1) continue;
    ctx.globalAlpha = ((b + 1) / BATCHES) * 0.68;
    ctx.strokeStyle = p.color;
    ctx.beginPath();
    let pt = proj(T[s].x, T[s].y, T[s].z);
    ctx.moveTo(pt.sx, pt.sy);
    for (let i = s + 1; i < e; i++) {
      pt = proj(T[i].x, T[i].y, T[i].z);
      ctx.lineTo(pt.sx, pt.sy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawParticle(p, dark) {
  const { sx, sy } = proj(p.x, p.y, p.z);

  // Glow
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 14);
  g.addColorStop(0, dark ? 'rgba(0,212,255,0.55)' : 'rgba(0,120,200,0.45)');
  g.addColorStop(1, 'rgba(0,212,255,0)');
  ctx.beginPath(); ctx.arc(sx, sy, 14, 0, 2*Math.PI);
  ctx.fillStyle = g; ctx.fill();

  // Body
  ctx.beginPath(); ctx.arc(sx, sy, 6, 0, 2*Math.PI);
  ctx.fillStyle = p.color; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1; ctx.stroke();

  // Sign
  ctx.fillStyle = '#000';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(pt().q >= 0 ? '+' : '−', sx, sy + 0.5);

  // Shadow dot + dashed stem at z=0
  const { sx: shx, sy: shy } = proj(p.x, p.y, 0);
  ctx.save();
  ctx.strokeStyle = dark ? 'rgba(0,212,255,0.18)' : 'rgba(0,120,200,0.15)';
  ctx.lineWidth = 0.7;
  ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(shx, shy); ctx.lineTo(sx, sy); ctx.stroke();
  ctx.restore();
  ctx.beginPath(); ctx.arc(shx, shy, 3, 0, 2*Math.PI);
  ctx.fillStyle = dark ? 'rgba(0,212,255,0.22)' : 'rgba(0,120,200,0.18)';
  ctx.fill();
}

function drawHint(dark) {
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.45)';
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.font = '10px "DM Sans", sans-serif';
  ctx.fillText('trascina: ruota · rotella: zoom · Ctrl+trascina: sposta · doppio clic: vista iniziale', 10, SH - 8);
}

/* ── Grafici ─────────────────────────────────────────────────────────────── */
// 1: modulo della velocità e componente lungo B; 2: energia cinetica. Il campo magnetico curva la
// traiettoria ma non compie lavoro (|v| costante); il campo elettrico invece cambia l'energia.
function drawGraphs() {
  if (!hist.length) return;
  const C = Lab.graphColors(), T = pt();
  const tu = simT < 2e-6 ? [1e-9, 'ns'] : simT < 2e-3 ? [1e-6, 'µs'] : [1e-3, 'ms'];
  const t1 = hist[hist.length - 1][0] / tu[0], t0 = hist[0][0] / tu[0];
  const vM = Lab.niceMax(Math.max(T.vmax, ...hist.map(h => h[1])) / T.vu[0]);
  let g = Lab.panel(gCanvas[0], { title: `Velocità (${T.vu[1]})`, xr: [t0, Math.max(t1, t0 + 1e-9)], yr: [-vM, vM], xLabel: `t (${tu[1]})` });
  if (g) {
    const [c, f] = g;
    Lab.plotPts(c, f, hist.map(h => [h[0] / tu[0], h[1] / T.vu[0]]), C.accent, 2);
    Lab.plotPts(c, f, hist.map(h => [h[0] / tu[0], h[2] / T.vu[0]]), C.violet, 1.6);
    Lab.legend(c, f.L + 8, f.T + 8, [[C.accent, '|v|'], [C.violet, 'v_∥ (lungo B)']]);
  }
  const eM = Lab.niceMax(Math.max(0.5 * T.m * T.vmax * T.vmax / QE, ...hist.map(h => h[3])));
  const eu = eM >= 2000 ? [1e3, 'keV'] : [1, 'eV'];
  g = Lab.panel(gCanvas[1], { title: `Energia cinetica (${eu[1]})`, xr: [t0, Math.max(t1, t0 + 1e-9)], yr: [0, eM / eu[0]], xLabel: `t (${tu[1]})` });
  if (g) { const [c, f] = g; Lab.plotPts(c, f, hist.map(h => [h[0] / tu[0], h[3] / eu[0]]), C.amber, 2); }
}

/* ── Readout ─────────────────────────────────────────────────────────────── */
function updateReadout() {
  if (!particle) return;
  const T = pt(), p = particle;
  const vp = Math.hypot(p.vx, p.vy), wc = omegaC();
  const L = T.L;
  const rL = wc > 0 ? Lab.fmt(T.m * vp / (Math.abs(T.q) * Math.abs(P.Bz)) / L[0], 2) + ' ' + L[1] : '∞';
  const Tc = wc > 0 ? Lab.sci(2 * Math.PI / wc, 3) + ' s' : '∞';
  const vd = Math.abs(P.Bz) > 0 ? Lab.sci(Math.abs(P.E / P.Bz), 3) + ' m/s' : '—';
  document.getElementById('readout').innerHTML = [
    { label: 'velocità perpendicolare a B', value: Lab.sci(vp, 3) + ' m/s' },
    { label: 'raggio r = mv/qB', value: rL },
    { label: 'periodo T = 2πm/qB', value: Tc },
    { label: 'deriva E/B',      value: vd },
    { label: 'energia',         value: Lab.sci(0.5 * T.m * (p.vx * p.vx + p.vy * p.vy + p.vz * p.vz) / QE, 3) + ' eV' },
  ].map(it =>
    `<span class="readout-item"><span class="readout-label">${Lab.keepCaseHTML(it.label)}</span><span class="readout-value">${it.value}</span></span>`
  ).join('');
}

/* ── Mouse / zoom interaction ────────────────────────────────────────────── */
let drag = null;

sc.addEventListener('mousedown', e => {
  e.preventDefault();
  const mode = (e.ctrlKey || e.button === 2) ? 'pan' : 'orbit';
  drag = { mode, x0: e.clientX, y0: e.clientY, th0: camTheta, ph0: camPhi, px0: panX, py0: panY };
});
sc.addEventListener('mousemove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
  if (drag.mode === 'orbit') {
    camTheta = drag.th0 + dx * 0.008;
    camPhi   = Math.max(-1.48, Math.min(1.48, drag.ph0 - dy * 0.008));
  } else {
    panX = drag.px0 + dx;
    panY = drag.py0 + dy;
  }
});
sc.addEventListener('mouseup',    () => { drag = null; });
sc.addEventListener('mouseleave', () => { drag = null; });
sc.addEventListener('contextmenu', e => e.preventDefault());
sc.addEventListener('wheel', e => {
  e.preventDefault();
  zoom = Math.max(0.1, Math.min(25, zoom * (e.deltaY > 0 ? 0.92 : 1.087)));
}, { passive: false });
sc.addEventListener('dblclick', () => {
  camTheta = 0.45; camPhi = 0.35; zoom = 1.0; panX = 0; panY = 0;
});

/* ── Touch support ───────────────────────────────────────────────────────── */
let touch0 = null, pinch0 = null;
sc.addEventListener('touchstart', e => {
  e.preventDefault();
  if (e.touches.length === 1) {
    const t = e.touches[0];
    touch0 = { x0: t.clientX, y0: t.clientY, th0: camTheta, ph0: camPhi };
    pinch0 = null;
  } else if (e.touches.length === 2) {
    pinch0 = { d0: Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY), z0: zoom };
    touch0 = null;
  }
}, { passive: false });
sc.addEventListener('touchmove', e => {
  e.preventDefault();
  if (e.touches.length === 1 && touch0) {
    const t = e.touches[0];
    camTheta = touch0.th0 + (t.clientX - touch0.x0) * 0.008;
    camPhi   = Math.max(-1.48, Math.min(1.48, touch0.ph0 - (t.clientY - touch0.y0) * 0.008));
  } else if (e.touches.length === 2 && pinch0) {
    const d = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
    zoom = Math.max(0.1, Math.min(25, pinch0.z0 * d / pinch0.d0));
  }
}, { passive: false });
sc.addEventListener('touchend', () => { touch0 = null; pinch0 = null; });

/* ── Controlli ────────────────────────────────────────────────────────────── */
function buildControls() {
  const ctrl = document.getElementById('controls');
  ctrl.innerHTML = '';
  const T = pt();

  const pSec = Lab.Section('Particella');
  pSec.add(Lab.RadioGroup({
    label: 'Tipo',
    options: Object.entries(PT).map(([value, o]) => ({ value, label: o.name, hint: (o.q > 0 ? '+' : '−') + (Math.abs(o.q) > QE * 1.5 ? '2e' : 'e') })),
    value: P.pt,
    onChange: v => { P.pt = v; const o = PT[v]; P.Bz = o.Bdef; P.v0 = o.vdef; P.vz = 0; P.E = 0; initParticle(); buildControls(); },
  }));
  pSec.add(Lab.Slider({ label: 'Velocità nel piano v_⊥', min: 0, max: T.vmax / T.vu[0], step: T.vmax / T.vu[0] / 60, value: P.v0 / T.vu[0],
    format: v => Lab.fmt(v, 2) + ' ' + T.vu[1], onChange: v => { P.v0 = v * T.vu[0]; initParticle(); } }));
  pSec.add(Lab.Slider({ label: 'Velocità lungo B v_∥', min: -T.vmax / T.vu[0], max: T.vmax / T.vu[0], step: T.vmax / T.vu[0] / 60, value: P.vz / T.vu[0],
    format: v => Lab.fmt(v, 2) + ' ' + T.vu[1], onChange: v => { P.vz = v * T.vu[0]; initParticle(); } }));
  ctrl.appendChild(pSec.el);

  const fSec = Lab.Section('Campi');
  fSec.add(Lab.Slider({ label: 'B_z (+ uscente)', min: -T.Bmax / T.Bu[0], max: T.Bmax / T.Bu[0], step: T.Bmax / T.Bu[0] / 80, value: P.Bz / T.Bu[0],
    format: v => Lab.fmt(v, 2) + ' ' + T.Bu[1], onChange: v => { P.Bz = v * T.Bu[0]; } }));
  fSec.add(Lab.Slider({ label: 'E_y (+ verso l’alto)', min: -T.Emax / T.Eu[0], max: T.Emax / T.Eu[0], step: T.Emax / T.Eu[0] / 40, value: P.E / T.Eu[0],
    format: v => Lab.fmt(v, 2) + ' ' + T.Eu[1], onChange: v => { P.E = v * T.Eu[0]; } }));
  const note = document.createElement('div');
  note.className = 'lab-note';
  note.innerHTML = 'Con solo B la particella gira con <b>r = mv/qB</b> e la velocità non cambia. Aggiungendo E perpendicolare a B il centro dell\'orbita <b>deriva</b> con velocità E/B, uguale per tutte le cariche.';
  fSec.add(note);
  ctrl.appendChild(fSec.el);

  const visSec = Lab.Section('Visualizzazione');
  visSec.add(Lab.Toggle({ label: 'Traiettoria', value: P.showTrail, onChange: v => { P.showTrail = v; } }));
  visSec.add(Lab.Toggle({ label: 'Vettore forza F', value: P.showForce, onChange: v => { P.showForce = v; } }));
  visSec.add(Lab.Toggle({ label: 'La vista segue la particella', value: P.follow, onChange: v => { P.follow = v; } }));
  ctrl.appendChild(visSec.el);
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
}
new ResizeObserver(resizeCanvases).observe(sc.parentElement);

// pausa, azzeramento e vista con i pulsanti in fondo al pannello
document.getElementById('btnPlay').addEventListener('click', e => {
  paused = !paused;
  e.currentTarget.textContent = paused ? '▶  AVVIA' : '⏸  PAUSA';
});
document.getElementById('btnReset').addEventListener('click', () => {
  initParticle(); camTheta = 0.45; camPhi = 0.35; zoom = 1.0; panX = 0; panY = 0;
});

/* ── Animation loop ──────────────────────────────────────────────────────── */
function loop() {
  if (!paused) {
    step();
    drawSim();
    drawGraphs();
    updateReadout();
  }
  requestAnimationFrame(loop);
}

/* ── Init ────────────────────────────────────────────────────────────────── */
function init() {
  resizeCanvases();
  buildControls();
  initParticle();
  requestAnimationFrame(loop);
}

init();
