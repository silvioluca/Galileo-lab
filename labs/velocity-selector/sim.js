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
// x a destra, y in alto; E lungo +y, B lungo +z (uscente). Le forze sono entrambe verticali:
// F_E = qE e F_B = −q·vx·B. Traiettoria parabolica: x = vx·t, y = y0 + vy0·t + ½·ay·t².
// Bilancio a v_sel = E/B, che non dipende né dalla carica né dalla massa dello ione.
// Unità interne: lunghezze in cm, velocità in 10⁵ m/s, tempi in 10⁻⁷ s (1 cm a 10⁵ m/s).
const QE = 1.602e-19, AMU = 1.661e-27;
const IONS = {
  p:  { name: 'Protone',        z: 1, A: 1 },
  a:  { name: 'Particella α',   z: 2, A: 4 },
  na: { name: 'Ione sodio Na⁺', z: 1, A: 23 },
};
const P = {
  E:          50,     // campo elettrico (kV/m)
  B:          100,    // campo magnetico (mT), + = uscente
  v0:         5,      // velocità d'ingresso (10⁵ m/s)
  ion:        'p',
  d:          2.0,    // distanza fra le piastre (cm)
  L:          10.0,   // lunghezza delle piastre (cm)
  y0:         0.0,    // quota d'ingresso (cm)
  angle:      0,      // angolo d'ingresso (°)
  showForces: false,
  beamMode:   false,
};
P.q = 1;   // carica positiva: serve solo per il segno disegnato sulla particella
const qOverM = () => IONS[P.ion].z * QE / (IONS[P.ion].A * AMU);
// accelerazione verticale nelle unità interne (cm / (10⁻⁷ s)²) per una data vx (10⁵ m/s)
const accY = vx => qOverM() * (P.E * 1e3 - vx * 1e5 * P.B * 1e-3) * 1e-12;
// forza verticale in fN su uno ione con velocità orizzontale vx (10⁵ m/s)
const forceY = vx => IONS[P.ion].z * QE * (P.E * 1e3 - vx * 1e5 * P.B * 1e-3) * 1e15;

/* ── Trajectory computation (analytical — exact parabola) ────────────────── */
function computeTrajForV(v0) {
  const rad = P.angle * Math.PI / 180;
  const vx  = v0 * Math.cos(rad);
  const vy0 = v0 * Math.sin(rad);
  const ay  = accY(vx);
  const hd  = P.d / 2;
  const y0c = Math.max(-hd * 0.98, Math.min(hd * 0.98, P.y0));
  const N   = 300;
  const tMax = Math.abs(vx) > 0.01 ? P.L / Math.abs(vx) : 30;
  const dt  = tMax / N;

  const path = [];
  let hitPlate = false;

  for (let i = 0; i <= N; i++) {
    const t = i * dt;
    const x = vx * t;
    const y = y0c + vy0 * t + 0.5 * ay * t * t;

    if (y >= hd || y <= -hd) {
      const yT = y >= hd ? hd : -hd;
      if (i > 0) {
        const tp = (i - 1) * dt;
        const yp = y0c + vy0 * tp + 0.5 * ay * tp * tp;
        const f  = (yT - yp) / (y - yp);
        path.push({ x: vx * (tp + f * dt), y: yT });
      }
      hitPlate = true;
      break;
    }
    path.push({ x, y });
    if (x >= P.L) break;
  }

  if (path.length === 0) path.push({ x: 0, y: y0c });
  const last = path[path.length - 1];
  return { path, exitX: last.x, exitY: last.y, hitPlate, vx, vy0, ay, y0c };
}

/* ── Single-particle state ───────────────────────────────────────────────── */
let traj      = null;
let animIdx   = 0;
let animSpeed = 1;

function computeTraj() {
  traj      = computeTrajForV(P.v0);
  animIdx   = 0;
  animSpeed = Math.max(1, Math.floor(traj.path.length / 120));
}

/* ── Beam state (7 particles, centered on v_sel) ─────────────────────────── */
const BEAM_RATIOS = [1/3, 1/2, 2/3, 1, 3/2, 2, 3]; // relative to center
let beamTrajs = [];
let beamT = 0, beamMaxT = 5, beamDT = 0.04;

function vSel() {
  const cosA = Math.cos(P.angle * Math.PI / 180);
  // v_sel = E/(B·cos θ), in 10⁵ m/s
  return (Math.abs(P.B) > 0.01 && Math.abs(cosA) > 0.01)
    ? (P.E * 1e3) / (P.B * 1e-3 * cosA) / 1e5 : null;
}

function computeBeamTrajs() {
  const vs = vSel();
  const center = (vs !== null && vs > 0.2 && vs < 30) ? vs : P.v0;

  beamTrajs = [];
  for (let i = 0; i < BEAM_RATIOS.length; i++) {
    const v = center * BEAM_RATIOS[i];
    if (v < 0.05) continue;
    const hue = 240 - i * 40;           // blue(240) → green(120) → red(0)
    const td  = computeTrajForV(v);
    beamTrajs.push({ ...td, v, color: `hsl(${hue},85%,62%)` });
  }

  const minVx = Math.min(...beamTrajs.filter(t => t.vx > 0.01).map(t => t.vx));
  beamMaxT = isFinite(minVx) ? P.L / minVx * 1.05 : 20;
  beamDT   = beamMaxT / 150;
  beamT    = 0;
}

/* ── Canvas coordinate mapping ───────────────────────────────────────────── */
const PADPX = 28;
function wx(x) { return PADPX + (x + 1) / (P.L + 2) * (SW - 2 * PADPX); }
function wy(y) {
  const hr = P.d / 2 + Math.max(0.4, P.d * 0.4);
  return SH / 2 - (y / hr) * (SH / 2 - PADPX);
}

/* ── Arrow helper ────────────────────────────────────────────────────────── */
function arrow(c, x0, y0, x1, y1, tip) {
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  const a = Math.atan2(y1 - y0, x1 - x0);
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x1 - tip * Math.cos(a - 0.45), y1 - tip * Math.sin(a - 0.45));
  c.lineTo(x1 - tip * Math.cos(a + 0.45), y1 - tip * Math.sin(a + 0.45));
  c.closePath(); c.fill();
}

/* ── Main draw ───────────────────────────────────────────────────────────── */
function drawSim() {
  const dark = dk();
  ctx.save(); ctx.scale(DPR, DPR);

  ctx.fillStyle = dark ? '#060a10' : '#e8f0f8';
  ctx.fillRect(0, 0, SW, SH);

  drawCapacitor(dark);
  drawEField(dark);
  drawBField(dark);

  if (P.beamMode) {
    drawBeamTrajectories(dark);
    drawBeamParticles(dark);
  } else if (traj) {
    drawTrajectory(dark);
    drawExitMarker(dark);
    if (P.showForces) drawForceArrows(dark);
    drawAnimParticle(dark);
  }

  drawFieldLabels(dark);
  ctx.restore();
}

/* ── Capacitor ───────────────────────────────────────────────────────────── */
function drawCapacitor(dark) {
  const x0 = wx(0), x1 = wx(P.L);
  const yt = wy(P.d / 2), yb = wy(-P.d / 2);
  const pH = 8;

  ctx.fillStyle = dark ? 'rgba(255,255,255,0.022)' : 'rgba(0,0,0,0.018)';
  ctx.fillRect(x0, yt, x1 - x0, yb - yt);

  // E va dalla piastra + alla −: con E > 0 (verso l'alto, come nella forza q·E) la + è in basso
  const topPos = P.E < 0;
  const red = dark ? '#c04040' : '#992222', blue = dark ? '#4466cc' : '#224499';
  ctx.fillStyle = topPos ? red : blue;
  ctx.fillRect(x0, yt - pH, x1 - x0, pH);
  ctx.fillStyle = topPos ? blue : red;
  ctx.fillRect(x0, yb, x1 - x0, pH);

  ctx.font = 'bold 12px "Space Mono", monospace';
  ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
  const redT = dark ? '#ff8888' : '#cc2222', blueT = dark ? '#88aaff' : '#2244cc';
  ctx.fillStyle = topPos ? redT : blueT;
  ctx.fillText(topPos ? '+' : '−', x0 - 7, yt - pH / 2);
  ctx.fillStyle = topPos ? blueT : redT;
  ctx.fillText(topPos ? '−' : '+', x0 - 7, yb + pH / 2);

  // Center line
  ctx.save();
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  ctx.lineWidth = 1; ctx.setLineDash([3, 5]);
  ctx.beginPath(); ctx.moveTo(x0, wy(0)); ctx.lineTo(x1, wy(0)); ctx.stroke();
  ctx.restore();

  // Entry velocity arrow at the given angle
  const hd  = P.d / 2;
  const y0c = Math.max(-hd * 0.98, Math.min(hd * 0.98, P.y0));
  const rad = P.angle * Math.PI / 180;
  const L   = 32; // px
  // Canvas y is inverted: upward world → negative canvas y → tail_sy = wy(y0c) + L*sin(rad)
  const tailSx = wx(0) - L * Math.cos(rad);
  const tailSy = wy(y0c) + L * Math.sin(rad);
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = dark ? 'rgba(0,212,255,0.4)' : 'rgba(0,100,180,0.4)';
  ctx.lineWidth = 1.5;
  arrow(ctx, tailSx, tailSy, wx(0), wy(y0c), 6);
  ctx.restore();
}

/* ── E field arrows ──────────────────────────────────────────────────────── */
function drawEField(dark) {
  if (Math.abs(P.E) < 0.01) return;
  const x0 = wx(0), x1 = wx(P.L);
  const yt = wy(P.d / 2), yb = wy(-P.d / 2);
  const W = x1 - x0, H = yb - yt;
  const sgn = Math.sign(P.E);
  const alpha = Math.min(0.55, 0.12 + Math.abs(P.E) / 100 * 0.43);
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle =
    dark ? `rgba(255,210,60,${alpha})` : `rgba(170,120,0,${alpha})`;
  ctx.lineWidth = 1.2;
  const NX = Math.max(3, Math.round(W / 65));
  const NY = Math.max(2, Math.round(H / 52));
  for (let i = 1; i <= NX; i++) {
    const cx = x0 + i * W / (NX + 1);
    for (let j = 1; j <= NY; j++) {
      const cy = yt + j * H / (NY + 1);
      const al = Math.min(H / (NY + 1) * 0.62, 26);
      arrow(ctx, cx, cy + sgn * al / 2, cx, cy - sgn * al / 2, 5);
    }
  }
  ctx.restore();
}

/* ── B field symbols ─────────────────────────────────────────────────────── */
function drawBField(dark) {
  if (Math.abs(P.B) < 0.01) return;
  const x0 = wx(0), x1 = wx(P.L);
  const yt = wy(P.d / 2), yb = wy(-P.d / 2);
  const W = x1 - x0, H = yb - yt;
  const out = P.B > 0;
  const alpha = Math.min(0.6, 0.13 + Math.abs(P.B) / 200 * 0.47);
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle =
    dark ? `rgba(0,212,255,${alpha})` : `rgba(0,80,160,${alpha})`;
  ctx.lineWidth = 1;
  const NX = Math.max(3, Math.round(W / 58));
  const NY = Math.max(2, Math.round(H / 48));
  for (let i = 1; i <= NX; i++) {
    for (let j = 1; j <= NY; j++) {
      const cx = x0 + i * W / (NX + 1);
      const cy = yt + j * H / (NY + 1);
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, 2 * Math.PI); ctx.stroke();
      if (out) {
        ctx.beginPath(); ctx.arc(cx, cy, 1.8, 0, 2 * Math.PI); ctx.fill();
      } else {
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(cx - 3, cy - 3); ctx.lineTo(cx + 3, cy + 3);
        ctx.moveTo(cx + 3, cy - 3); ctx.lineTo(cx - 3, cy + 3);
        ctx.stroke(); ctx.lineWidth = 1;
      }
    }
  }
  ctx.restore();
}

/* ── Single-particle trajectory (dashed) ─────────────────────────────────── */
function drawTrajectory(dark) {
  const path = traj.path;
  if (path.length < 2) return;
  ctx.save();
  ctx.strokeStyle = dark ? 'rgba(255,245,80,0.78)' : 'rgba(150,110,0,0.82)';
  ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(wx(path[0].x), wy(path[0].y));
  for (let i = 1; i < path.length; i++) ctx.lineTo(wx(path[i].x), wy(path[i].y));
  ctx.stroke();
  ctx.restore();
}

/* ── Exit marker ─────────────────────────────────────────────────────────── */
function drawExitMarker(dark) {
  const { exitY, hitPlate } = traj;
  const xl = wx(P.L);
  const yt = wy(P.d / 2), yb = wy(-P.d / 2);
  const sy = wy(exitY);

  ctx.save();
  ctx.strokeStyle = dark ? 'rgba(255,245,80,0.28)' : 'rgba(150,110,0,0.28)';
  ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(xl, yt); ctx.lineTo(xl, yb); ctx.stroke();
  ctx.restore();

  if (!hitPlate) {
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = dark ? '#ffdd55' : '#906800';
    ctx.lineWidth = 1.5; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(xl - 5, sy); ctx.lineTo(xl + 10, sy); ctx.stroke();
    ctx.font = '9px "Space Mono", monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`y = ${Lab.fmt(exitY * 10, 2)} mm`, xl + 13, sy);
    ctx.restore();
  }
}

/* ── Force vectors on animated particle ──────────────────────────────────── */
function drawForceArrows(dark) {
  const pt = traj.path[Math.min(animIdx, traj.path.length - 1)];
  const sx = wx(pt.x), sy = wy(pt.y);

  const FE =  P.E * 1e3;                    // forza elettrica per unità di carica (verticale)
  const FB = -traj.vx * 1e5 * P.B * 1e-3;   // forza magnetica per unità di carica (vx costante)
  const fMax = Math.max(Math.abs(FE), Math.abs(FB), 0.1);
  const SCALE = P.d * 0.30;        // max arrow in world units = 30% of half-sep

  // F_E — yellow, slightly left of particle
  if (Math.abs(FE) > 0.01) {
    const tipY = wy(pt.y + (FE / fMax) * SCALE);
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = dark ? '#ffdd44' : '#aa8800';
    ctx.lineWidth = 2;
    arrow(ctx, sx - 9, sy, sx - 9, tipY, 7);
    ctx.font = 'bold 9px "Space Mono", monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText('F_E', sx - 16, (sy + tipY) / 2);
    ctx.restore();
  }

  // F_B — magenta, slightly right of particle
  if (Math.abs(FB) > 0.01) {
    const tipY = wy(pt.y + (FB / fMax) * SCALE);
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = dark ? '#ff66aa' : '#cc1166';
    ctx.lineWidth = 2;
    arrow(ctx, sx + 9, sy, sx + 9, tipY, 7);
    ctx.font = 'bold 9px "Space Mono", monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('F_B', sx + 16, (sy + tipY) / 2);
    ctx.restore();
  }
}

/* ── Animated single particle ────────────────────────────────────────────── */
function drawAnimParticle(dark) {
  const { x, y } = traj.path[Math.min(animIdx, traj.path.length - 1)];
  const sx = wx(x), sy = wy(y);

  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 12);
  g.addColorStop(0, dark ? 'rgba(0,212,255,0.55)' : 'rgba(0,140,210,0.45)');
  g.addColorStop(1, 'rgba(0,212,255,0)');
  ctx.beginPath(); ctx.arc(sx, sy, 12, 0, 2 * Math.PI);
  ctx.fillStyle = g; ctx.fill();

  ctx.beginPath(); ctx.arc(sx, sy, 5, 0, 2 * Math.PI);
  ctx.fillStyle = '#00d4ff'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1; ctx.stroke();

  ctx.fillStyle = '#000';
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(P.q >= 0 ? '+' : '−', sx, sy + 0.5);
}

/* ── Beam: dashed trajectories ───────────────────────────────────────────── */
function drawBeamTrajectories(dark) {
  for (const bt of beamTrajs) {
    if (bt.path.length < 2) continue;
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = bt.color;
    ctx.lineWidth = 1.2; ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(wx(bt.path[0].x), wy(bt.path[0].y));
    for (let i = 1; i < bt.path.length; i++)
      ctx.lineTo(wx(bt.path[i].x), wy(bt.path[i].y));
    ctx.stroke();
    ctx.restore();
  }
}

/* ── Beam: animated particles (analytical positions) ─────────────────────── */
function drawBeamParticles(dark) {
  for (const bt of beamTrajs) {
    const x = bt.vx * beamT;
    if (x < -0.01 || x > P.L + 0.01) continue;
    const y = bt.y0c + bt.vy0 * beamT + 0.5 * bt.ay * beamT * beamT;
    if (y < -P.d / 2 - 0.01 || y > P.d / 2 + 0.01) continue;
    const sx = wx(x), sy = wy(y);
    ctx.beginPath(); ctx.arc(sx, sy, 4.5, 0, 2 * Math.PI);
    ctx.fillStyle = bt.color; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.8; ctx.stroke();
  }
}

/* ── Field labels & v_sel annotation ─────────────────────────────────────── */
function drawFieldLabels(dark) {
  const x0 = wx(0), x1 = wx(P.L);
  const yt = wy(P.d / 2), yb = wy(-P.d / 2);
  ctx.font = '9px "Space Mono", monospace';

  if (Math.abs(P.E) > 0.01) {
    ctx.fillStyle = dark ? 'rgba(255,210,60,0.75)' : 'rgba(150,110,0,0.82)';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('E', x1 + 7, (yt + yb) / 2);
  }
  if (Math.abs(P.B) > 0.01) {
    ctx.fillStyle = dark ? 'rgba(0,212,255,0.72)' : 'rgba(0,80,160,0.78)';
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText(`B = ${Lab.fmt(Math.abs(P.B), 0)} mT ${P.B >= 0 ? '⊙' : '⊗'}`, x1 - 4, yb - 3);
  }

  const vs = vSel();
  if (vs !== null && vs > 0 && isFinite(vs)) {
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.32)' : 'rgba(0,0,0,0.28)';
    ctx.font = '8px "Space Mono", monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    const label = P.angle !== 0
      ? `v_sel = E/(B·cosθ) = ${Lab.fmt(vs, 2)}·10⁵ m/s`
      : `v_sel = E/B = ${Lab.fmt(vs, 2)}·10⁵ m/s`;
    ctx.fillText(label, x0, yt - 12);
  }
}

/* ── Grafico: forza verticale in funzione della velocità ────────────────── */
// F_y = q(E − v·B): retta che si annulla a v_sel. Le particelle più lente sono spinte da E,
// quelle più veloci da B; solo a v_sel passano diritte.
function drawGraphs() {
  const C = Lab.graphColors(), vs = vSel(), cosA = Math.cos(P.angle * Math.PI / 180);
  const vMax = 15, fM = Lab.niceMax(Math.max(Math.abs(forceY(0)), Math.abs(forceY(vMax * cosA)), 1));
  const g = Lab.panel(gCanvas[0], { title: `Forza verticale sullo ione F_y = q(E − v·B) (fN)`, xr: [0, vMax], yr: [-fM, fM], xLabel: 'v₀ (10⁵ m/s)' });
  if (!g) return; const [c, f] = g;
  if (vs !== null && vs > 0 && vs <= vMax) {
    c.save(); c.setLineDash([3, 3]); c.strokeStyle = C.green; c.beginPath(); c.moveTo(f.X(vs), f.T); c.lineTo(f.X(vs), f.B); c.stroke(); c.restore();
    c.fillStyle = C.green; c.font = '10px "DM Sans",sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(`v_sel = E/B = ${Lab.fmt(vs, 2)}·10⁵ m/s`, f.X(vs) + 5, f.B - 10);
  }
  Lab.plot(c, f, v => forceY(v * cosA), [0, vMax], C.amber, 2);
  if (P.beamMode) for (const bt of beamTrajs) Lab.dot(c, f, bt.v, forceY(bt.vx), bt.color, 3.5);
  Lab.dot(c, f, P.v0, forceY(P.v0 * cosA), C.accent, 4.5);
}

/* ── Readout ─────────────────────────────────────────────────────────────── */
function updateReadout() {
  const vs = vSel();

  if (P.beamMode) {
    document.getElementById('readout').innerHTML = [
      { label: 'v_sel = E/B',  value: vs !== null ? Lab.fmt(vs,2) + '·10⁵ m/s' : '∞' },
      { label: 'flusso', value: `${beamTrajs.length} particelle` },
      { label: 'selezionate', value: `${beamTrajs.filter(b => !b.hitPlate).length}` },
    ].map(r =>
      `<span class="readout-item"><span class="readout-label">${Lab.keepCaseHTML(r.label)}</span><span class="readout-value">${r.value}</span></span>`
    ).join('');
    return;
  }

  if (!traj) return;
  const { exitY, hitPlate, y0c } = traj;
  const dy = exitY - y0c;
  const stato = hitPlate              ? 'intercettata'
              : Math.abs(dy) < 0.005  ? 'selezionata ✓'
              : dy > 0                ? 'deflessa ↑'
                                      : 'deflessa ↓';

  document.getElementById('readout').innerHTML = [
    { label: 'v_sel = E/B', value: vs !== null ? Lab.fmt(vs,2) + '·10⁵ m/s' : '∞' },
    { label: 'quota d\'uscita', value: hitPlate ? '—' : Lab.fmt(exitY * 10,2) + ' mm' },
    { label: 'deviazione Δy',  value: hitPlate ? '—' : Lab.fmt(dy * 10,2) + ' mm' },
    { label: 'stato',    value: stato },
  ].map(r =>
    `<span class="readout-item"><span class="readout-label">${Lab.keepCaseHTML(r.label)}</span><span class="readout-value">${r.value}</span></span>`
  ).join('');
}

/* ── Animation loop ──────────────────────────────────────────────────────── */
function loop() {
  if (P.beamMode) {
    beamT = (beamT + beamDT) % beamMaxT;
  } else if (traj) {
    animIdx = (animIdx + animSpeed) % traj.path.length;
  }
  drawSim();
  drawGraphs();
  updateReadout();
  requestAnimationFrame(loop);
}

/* ── Controls ────────────────────────────────────────────────────────────── */
function buildControls() {
  const ctrl = document.getElementById('controls');
  ctrl.innerHTML = '';

  const iSec = Lab.Section('Ione');
  iSec.add(Lab.RadioGroup({
    label: 'Tipo di ione',
    options: Object.entries(IONS).map(([value, o]) => ({ value, label: o.name, hint: `q = ${o.z}e, m = ${o.A} u` })),
    value: P.ion,
    onChange: v => { P.ion = v; refresh(); },
  }));
  const note = document.createElement('div');
  note.className = 'lab-note';
  note.innerHTML = 'Cambiando ione la curvatura delle traiettorie cambia, ma la <b>velocità selezionata E/B</b> resta la stessa.';
  iSec.add(note);
  ctrl.appendChild(iSec.el);

  const fSec = Lab.Section('Campi');
  fSec.add(Lab.Slider({ label: 'Campo elettrico E', min: 0, max: 100, step: 1, value: P.E, unit: ' kV/m',
    onChange: v => { P.E = v; refresh(); } }));
  fSec.add(Lab.Slider({ label: 'Campo magnetico B (+ uscente)', min: -200, max: 200, step: 2, value: P.B, unit: ' mT',
    onChange: v => { P.B = v; refresh(); } }));
  ctrl.appendChild(fSec.el);

  const pSec = Lab.Section('Ingresso');
  pSec.add(Lab.Slider({ label: 'Velocità v₀', min: 0.5, max: 15, step: 0.05, value: P.v0, unit: '·10⁵ m/s',
    onChange: v => { P.v0 = v; refresh(); } }));
  pSec.add(Lab.Slider({ label: 'Angolo θ', min: -30, max: 30, step: 1, value: P.angle, unit: '°',
    onChange: v => { P.angle = v; refresh(); } }));
  pSec.add(Lab.Slider({ label: 'Quota d\'ingresso y₀', min: -0.9, max: 0.9, step: 0.05, value: P.y0, unit: ' cm',
    onChange: v => { P.y0 = v; refresh(); } }));
  ctrl.appendChild(pSec.el);

  const gSec = Lab.Section('Geometria');
  gSec.add(Lab.Slider({ label: 'Distanza fra le piastre d', min: 1, max: 5, step: 0.1, value: P.d, unit: ' cm',
    onChange: v => { P.d = v; refresh(); } }));
  gSec.add(Lab.Slider({ label: 'Lunghezza delle piastre L', min: 4, max: 20, step: 0.5, value: P.L, unit: ' cm',
    onChange: v => { P.L = v; refresh(); } }));
  ctrl.appendChild(gSec.el);

  const visSec = Lab.Section('Visualizzazione');
  visSec.add(Lab.Toggle({ label: 'Vettori F_E e F_B', value: P.showForces,
    onChange: v => { P.showForces = v; } }));
  visSec.add(Lab.Toggle({ label: 'Fascio di velocità diverse', value: P.beamMode,
    onChange: v => { P.beamMode = v; if (v) computeBeamTrajs(); } }));
  ctrl.appendChild(visSec.el);
}

function refresh() {
  computeTraj();
  if (P.beamMode) computeBeamTrajs();
}

/* ── Resize ──────────────────────────────────────────────────────────────── */
function resizeCanvases() {
  const area = sc.parentElement;
  const ga   = document.getElementById('graphArea');
  if (!gCanvas.length) gCanvas = Lab.graphPanels(ga, 1, 180);
  const rd   = area.querySelector('.readout-bar');
  const rdH  = rd ? rd.offsetHeight || 48 : 48;
  const gaH  = ga.offsetHeight || 180;
  DPR = window.devicePixelRatio || 1;
  SW = area.clientWidth;
  SH = Math.max(80, area.clientHeight - gaH - rdH);
  Lab.hidpi(sc, SW, SH);
  Lab.fitPanels(gCanvas);
}

new ResizeObserver(() => { resizeCanvases(); refresh(); }).observe(sc.parentElement);

function init() {
  resizeCanvases();
  buildControls();
  computeTraj();
  requestAnimationFrame(loop);
}

init();
