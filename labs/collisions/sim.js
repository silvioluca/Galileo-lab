/* Urti — Galileo Lab */

function isDark() { return document.documentElement.dataset.theme !== 'light'; }

function drawGridBg(ctx, w, h) {
  ctx.strokeStyle = isDark() ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y <= h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
}

/* ── params ── */
const params = {
  mode:  '1d',       // '1d' | '2d'
  type:  'elastic',  // 'elastic' | 'inelastic' | 'perfect'
  e:     0.70,       // coeff. of restitution (inelastic only)
  m1:    2.0,
  m2:    1.0,
  v1:    3.0,        // m/s (signed, 1d)
  v2:   -1.0,        // m/s (signed, 1d)
  v1_2d: 4.0,        // m/s magnitude (2d), always rightward
  theta: 20,         // deg — impact angle (2d)
};

/* ── shared state ── */
const SCALE = 70;    // px/m
const FPS   = 60;

function ballR(m) { return Math.max(16, Math.min(50, 22 * Math.cbrt(m))); }
function ke(b)    { return 0.5 * b.m * (b.vx * b.vx + b.vy * b.vy); }
function px(b)    { return b.m * b.vx; }
function py(b)    { return b.m * b.vy; }

let sim = null;
let animId = null;
let running = false;
let lastTime = null;

/* ── colours ── */
const C1 = '#00d4ff';
const C2 = '#ff6b35';
const C1d = '#0088aa';
const C2d = '#aa3800';

// canvas non interpreta var(): i colori del tema vanno letti dal CSS
const themeColor = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/* ─────────────────────────────────────────────
   SimState
───────────────────────────────────────────── */
class SimState {
  constructor() {
    this.reset();
  }

  reset() {
    const { m1, m2, v1, v2, v1_2d, theta, mode } = params;
    const r1px = ballR(m1), r2px = ballR(m2); // pixel radii (for drawing)
    const r1 = r1px / SCALE,  r2 = r2px / SCALE; // metre radii (for physics)
    const gap = 0.12; // metres of extra clearance

    if (mode === '1d') {
      const D = r1 + r2 + gap + 1.5; // metres between centres and canvas edge
      this.b1 = { x: -D, y: 0, vx: v1, vy: 0, m: m1, r: r1px };
      this.b2 = { x:  D, y: 0, vx: v2, vy: 0, m: m2, r: r2px };
    } else {
      // 2D: b2 at rest at centre, b1 comes from left with vertical offset
      const thRad = theta * Math.PI / 180;
      const yOff  = (r1 + r2) * Math.sin(thRad); // metres
      const D     = r1 + r2 + gap + 1.8;
      // negative yOff: ball A comes from upper-left so ball B departs lower-right at angle θ
      this.b1 = { x: -D, y: -yOff, vx: v1_2d, vy: 0, m: m1, r: r1px };
      this.b2 = { x:  0, y:  0,    vx: 0,      vy: 0, m: m2, r: r2px };
    }

    this.phase  = 'pre';    // 'pre' | 'post'
    this.merged = false;

    // dashed-line trajectory anchors
    this.startPos1   = { x: this.b1.x, y: this.b1.y };
    this.startPos2   = { x: this.b2.x, y: this.b2.y };
    this.collidePos1 = null;
    this.collidePos2 = null;
    // post-collision velocity directions (stored at impact, ball keeps moving)
    this.outVel1 = null;
    this.outVel2 = null;

    // pre-collision KE/p stored for graph
    this.pre_ke1 = ke(this.b1);
    this.pre_ke2 = ke(this.b2);
    this.pre_p1x = px(this.b1); this.pre_p1y = py(this.b1);
    this.pre_p2x = px(this.b2); this.pre_p2y = py(this.b2);
    this.post_ke1 = null; this.post_ke2 = null;
    this.post_p1x = null; this.post_p1y = null;
    this.post_p2x = null; this.post_p2y = null;

    this.t = 0;
  }

  step(dt) {
    this._moveFree(dt);
    this.t += dt;
    if (this.phase === 'post') return;

    // collision detection
    const { b1, b2 } = this;
    const dx = b2.x - b1.x;
    const dy = b2.y - b1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= b1.r / SCALE + b2.r / SCALE + 1e-4 && this.phase === 'pre') {
      this.collidePos1 = { x: b1.x, y: b1.y };
      this.collidePos2 = { x: b2.x, y: b2.y };
      this._collide(dx, dy, dist);
      this.phase = 'post';
      this.outVel1 = { vx: b1.vx, vy: b1.vy };
      this.outVel2 = { vx: b2.vx, vy: b2.vy };
      this.post_ke1 = ke(b1);
      this.post_ke2 = ke(b2);
      this.post_p1x = px(b1); this.post_p1y = py(b1);
      this.post_p2x = px(b2); this.post_p2y = py(b2);
    }
  }

  _moveFree(dt) {
    this.b1.x += this.b1.vx * dt;
    this.b1.y += this.b1.vy * dt;
    if (this.merged) {
      // b2 moves with b1's velocity (they share velocity after perfectly inelastic collision)
      this.b2.x += this.b1.vx * dt;
      this.b2.y += this.b1.vy * dt;
    } else {
      this.b2.x += this.b2.vx * dt;
      this.b2.y += this.b2.vy * dt;
    }
  }

  _collide(dx, dy, dist) {
    const { b1, b2 } = this;

    // snap to contact surface
    const nx = dist > 0 ? dx / dist : 1;
    const ny = dist > 0 ? dy / dist : 0;

    const dvx = b1.vx - b2.vx;
    const dvy = b1.vy - b2.vy;
    const vRel = dvx * nx + dvy * ny; // approach speed along normal

    if (vRel <= 0) return; // already separating

    if (params.type === 'perfect') {
      // perfectly inelastic — common velocity
      const M  = b1.m + b2.m;
      const vx = (b1.m * b1.vx + b2.m * b2.vx) / M;
      const vy = (b1.m * b1.vy + b2.m * b2.vy) / M;
      b1.vx = vx; b1.vy = vy;
      b2.vx = vx; b2.vy = vy;
      this.merged = true;
    } else {
      const e = params.type === 'elastic' ? 1 : params.e;
      const J = (1 + e) * vRel * b1.m * b2.m / (b1.m + b2.m);
      b1.vx -= J / b1.m * nx;
      b1.vy -= J / b1.m * ny;
      b2.vx += J / b2.m * nx;
      b2.vy += J / b2.m * ny;
    }
  }

}

/* ─────────────────────────────────────────────
   Canvas / drawing
───────────────────────────────────────────── */
const canvas = document.getElementById('simCanvas');
const ctx    = canvas.getContext('2d');
let dpr = 1;

function resize() {
  dpr = window.devicePixelRatio || 1;
  canvas.width  = canvas.clientWidth  * dpr;
  canvas.height = canvas.clientHeight * dpr;
}

function worldToScreen(x, y) {
  const cx = canvas.width  / 2 / dpr;
  const cy = canvas.height / 2 / dpr;
  return [cx + x * SCALE, cy + y * SCALE];
}

function drawBall(b, color, darkColor, label) {
  const [sx, sy] = worldToScreen(b.x, b.y);
  const r = b.r;

  // glow
  const grd = ctx.createRadialGradient(sx, sy, r * 0.2, sx, sy, r * 1.6);
  grd.addColorStop(0, color + '33');
  grd.addColorStop(1, color + '00');
  ctx.beginPath();
  ctx.arc(sx, sy, r * 1.6, 0, Math.PI * 2);
  ctx.fillStyle = grd;
  ctx.fill();

  // body
  const bodyGrd = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.3, r * 0.1, sx, sy, r);
  bodyGrd.addColorStop(0, color);
  bodyGrd.addColorStop(1, darkColor);
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fillStyle = bodyGrd;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // label
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.max(11, r * 0.55)}px DM Sans, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, sx, sy);
}



function drawTrajectories() {
  if (!sim || sim.phase !== 'post' || !sim.collidePos1) return;

  const dashIn  = [8, 6];
  const dashOut = [10, 7];

  const drawSeg = (ax, ay, bx, by, color, alpha, dash) => {
    const [sax, say] = worldToScreen(ax, ay);
    const [sbx, sby] = worldToScreen(bx, by);
    ctx.beginPath();
    ctx.moveTo(sax, say);
    ctx.lineTo(sbx, sby);
    ctx.strokeStyle = color + Math.round(alpha * 255).toString(16).padStart(2, '0');
    ctx.lineWidth = 1.5;
    ctx.setLineDash(dash);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  const drawOutRay = (from, vel, color, alpha) => {
    // extend from `from` in direction `vel` until it leaves the canvas
    const W = canvas.width / dpr, H = canvas.height / dpr;
    const [sx, sy] = worldToScreen(from.x, from.y);
    const ux = vel.vx * SCALE, uy = vel.vy * SCALE;
    if (Math.abs(ux) < 1e-6 && Math.abs(uy) < 1e-6) return;
    let tMax = 1e9;
    if (ux > 1e-6) tMax = Math.min(tMax, (W - sx) / ux);
    if (ux < -1e-6) tMax = Math.min(tMax, (0 - sx) / ux);
    if (uy > 1e-6) tMax = Math.min(tMax, (H - sy) / uy);
    if (uy < -1e-6) tMax = Math.min(tMax, (0 - sy) / uy);
    const ex = sx + ux * tMax, ey = sy + uy * tMax;
    ctx.beginPath();
    ctx.moveTo(sx, sy); ctx.lineTo(ex, ey);
    ctx.strokeStyle = color + Math.round(alpha * 255).toString(16).padStart(2, '0');
    ctx.lineWidth = 1.5;
    ctx.setLineDash(dashOut);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  // incoming: segment from startPos to collidePos
  drawSeg(sim.startPos1.x, sim.startPos1.y, sim.collidePos1.x, sim.collidePos1.y, C1, 0.4, dashIn);
  if (Math.abs(sim.startPos2.x - sim.collidePos2.x) > 1e-4 || Math.abs(sim.startPos2.y - sim.collidePos2.y) > 1e-4) {
    drawSeg(sim.startPos2.x, sim.startPos2.y, sim.collidePos2.x, sim.collidePos2.y, C2, 0.4, dashIn);
  }

  // outgoing: rays extending to canvas edge
  drawOutRay(sim.collidePos1, sim.outVel1, C1, 0.75);
  drawOutRay(sim.collidePos2, sim.outVel2, C2, 0.75);

  // dot at contact midpoint
  const cpx = (sim.collidePos1.x + sim.collidePos2.x) / 2;
  const cpy = (sim.collidePos1.y + sim.collidePos2.y) / 2;
  const [cpsx, cpsy] = worldToScreen(cpx, cpy);
  ctx.beginPath();
  ctx.arc(cpsx, cpsy, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff66';
  ctx.fill();
}

function drawVelocityArrow(b, color, showAngle) {
  if (Math.abs(b.vx) < 0.01 && Math.abs(b.vy) < 0.01) return;
  const [sx, sy] = worldToScreen(b.x, b.y);
  const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
  const ux = b.vx / speed, uy = b.vy / speed;
  const len = Math.max(20, Math.min(90, speed * 14));
  const ex = sx + ux * (b.r + len);
  const ey = sy + uy * (b.r + len);
  const ah = Math.min(12, len * 0.35);

  ctx.beginPath();
  ctx.moveTo(sx + ux * b.r, sy + uy * b.r);
  ctx.lineTo(ex, ey);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // arrowhead
  const perp = [-uy, ux];
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - ux * ah + perp[0] * ah * 0.4, ey - uy * ah + perp[1] * ah * 0.4);
  ctx.lineTo(ex - ux * ah - perp[0] * ah * 0.4, ey - uy * ah - perp[1] * ah * 0.4);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();

  // speed label: placed beyond the arrow tip along the arrow direction
  const labelDist = 20;
  ctx.fillStyle = color;
  ctx.font = '11px Space Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(speed.toFixed(2) + ' m/s', ex + ux * labelDist - 5, ey - uy * labelDist + 20);

  // angle annotation (post-collision)
  if (showAngle) {
    const canvasAngle = Math.atan2(b.vy, b.vx); // canvas convention: y down
    const dispAngle   = Math.atan2(-b.vy, b.vx) * 180 / Math.PI; // display: up = positive

    const arcR = b.r + 22;

    // horizontal reference tick
    const xSign = b.vx >= 0 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(sx + xSign * b.r, sy);
    ctx.lineTo(sx + xSign * (arcR + 8), sy);
    ctx.strokeStyle = color + '55';
    ctx.lineWidth = 1;
    ctx.stroke();

    // arc from nearest horizontal to velocity direction (short sweep)
    const refAngle  = b.vx >= 0 ? 0 : Math.PI;
    const sweepAngle = canvasAngle - refAngle;
    const normSweep  = ((sweepAngle + Math.PI) % (2 * Math.PI)) - Math.PI;
    if (Math.abs(normSweep) > 0.02) {
      ctx.beginPath();
      ctx.arc(sx, sy, arcR, refAngle, refAngle + normSweep, normSweep < 0);
      ctx.strokeStyle = color + 'aa';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // angle label well outside the arc
    const midA   = refAngle + normSweep / 2;
    const lRadius = arcR + 28;
    const lx2    = sx + Math.cos(midA) * lRadius;
    const ly2    = sy + Math.sin(midA) * lRadius;
    ctx.fillStyle = color;
    ctx.font = 'bold 11px Space Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.abs(dispAngle).toFixed(1) + '°', lx2, ly2);
  }
}

function drawScene() {
  const W = canvas.width / dpr, H = canvas.height / dpr;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(dpr, dpr);
  drawGridBg(ctx, W, H);

  // faint horizontal line (ground/axis)
  const [lx, ly] = worldToScreen(-100, 0);
  const [rx, ry] = worldToScreen( 100, 0);
  ctx.beginPath();
  ctx.moveTo(lx, ly); ctx.lineTo(rx, ry);
  ctx.strokeStyle = themeColor('--border-hover');
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 8]);
  ctx.stroke();
  ctx.setLineDash([]);

  if (!sim) { ctx.restore(); return; }

  const showAngle = sim.phase === 'post';

  drawTrajectories();

  if (sim.merged) {
    // draw both balls stuck together; a bond line connects their centres
    const [s1x, s1y] = worldToScreen(sim.b1.x, sim.b1.y);
    const [s2x, s2y] = worldToScreen(sim.b2.x, sim.b2.y);
    ctx.beginPath();
    ctx.moveTo(s1x, s1y); ctx.lineTo(s2x, s2y);
    ctx.strokeStyle = '#cc88ff';
    ctx.lineWidth = 4;
    ctx.stroke();
    drawBall(sim.b1, C1, C1d, 'A');
    drawBall(sim.b2, C2, C2d, 'B');
    drawVelocityArrow(sim.b1, '#cc88ff', showAngle);
  } else {
    drawBall(sim.b1, C1, C1d, 'A');
    drawBall(sim.b2, C2, C2d, 'B');
    drawVelocityArrow(sim.b1, C1, showAngle);
    drawVelocityArrow(sim.b2, C2, showAngle);
  }

  // phase label
  const phaseLabel = { pre: 'Prima dell\'urto', colliding: 'Urto', post: 'Dopo l\'urto' }[sim.phase] || '';
  ctx.fillStyle = themeColor('--text-secondary');
  ctx.font = '12px Space Mono, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(phaseLabel, 12, 12);

  ctx.restore();
}

/* ─────────────────────────────────────────────
   Graphs
───────────────────────────────────────────── */
const graphCanvas = document.getElementById('graphCanvas');
const gctx = graphCanvas.getContext('2d');

function resizeGraph() {
  const dpr2 = window.devicePixelRatio || 1;
  graphCanvas.width  = graphCanvas.clientWidth  * dpr2;
  graphCanvas.height = graphCanvas.clientHeight * dpr2;
}

function drawGraphs() {
  const dpr2 = window.devicePixelRatio || 1;
  const GW = graphCanvas.width / dpr2, GH = graphCanvas.height / dpr2;
  gctx.clearRect(0, 0, graphCanvas.width, graphCanvas.height);
  gctx.save();
  gctx.scale(dpr2, dpr2);

  if (!sim) { gctx.restore(); return; }

  const hasPost = sim.post_ke1 !== null;

  // side by side: left = KE, right = momentum, separated by a thin divider
  const gap = 1;
  const half = Math.floor(GW / 2);
  drawKEPanel(0,        0, half - gap, GH, hasPost);
  drawMomPanel(half + gap, 0, GW - half - gap, GH, hasPost);

  gctx.restore();
}

function drawPanelBg(x, y, w, h, title) {
  const dk = isDark();
  gctx.fillStyle = dk ? '#0b1018' : '#f0f2f5';
  gctx.fillRect(x, y, w, h);
  gctx.strokeStyle = dk ? 'rgba(200,220,255,0.20)' : 'rgba(0,0,0,0.10)';
  gctx.lineWidth = 1;
  gctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  gctx.fillStyle = dk ? 'rgba(200,220,255,0.50)' : 'rgba(40,60,100,0.50)';
  gctx.font = '700 10px "Space Mono",monospace';
  gctx.textAlign = 'center';
  gctx.textBaseline = 'top';
  gctx.fillText(title, x + w / 2, y + 7);
  gctx.textBaseline = 'alphabetic';
}

function drawKEPanel(x, y, w, h, hasPost) {
  drawPanelBg(x, y, w, h, 'Energia Cinetica (J)');

  const ke1_pre  = sim.pre_ke1;
  const ke2_pre  = sim.pre_ke2;
  const ke1_post = hasPost ? sim.post_ke1 : 0;
  const ke2_post = hasPost ? sim.post_ke2 : 0;
  const keMax = Math.max(ke1_pre + ke2_pre, ke1_post + ke2_post, 0.1);

  const pl = 20, pr = 20, pt = 26, pb = 30;
  const iW = w - pl - pr, iH = h - pt - pb;
  const baseY = y + pt + iH;
  const toH = v => (v / keMax) * iH;

  // two stacked bars: "Prima" and "Dopo"
  const barW = Math.min(60, iW * 0.28);
  const gapBars = (iW - 2 * barW) / 3;
  const bx = [x + pl + gapBars, x + pl + 2 * gapBars + barW];
  const groupLabels = ['Prima', 'Dopo'];

  const groups = [
    { ke1: ke1_pre,  ke2: ke2_pre,  alpha: 1,    dimmed: false },
    { ke1: ke1_post, ke2: ke2_post, alpha: hasPost ? 1 : 0.3, dimmed: !hasPost },
  ];

  groups.forEach((g, gi) => {
    const h1 = toH(g.ke1), h2 = toH(g.ke2);
    const stackBase = baseY;

    // segment A (bottom, cyan)
    gctx.globalAlpha = g.alpha;
    gctx.fillStyle = C1;
    gctx.fillRect(bx[gi], stackBase - h1, barW, h1);

    // segment B (top, orange)
    gctx.fillStyle = C2;
    gctx.fillRect(bx[gi], stackBase - h1 - h2, barW, h2);
    gctx.globalAlpha = 1;

    // value labels inside segments (if tall enough)
    gctx.font = '9px Space Mono, monospace';
    gctx.textAlign = 'center';
    if (h1 > 14) {
      gctx.fillStyle = '#000a';
      gctx.textBaseline = 'middle';
      gctx.fillText(g.ke1.toFixed(2), bx[gi] + barW / 2, stackBase - h1 / 2);
    }
    if (h2 > 14) {
      gctx.fillStyle = '#000a';
      gctx.textBaseline = 'middle';
      gctx.fillText(g.ke2.toFixed(2), bx[gi] + barW / 2, stackBase - h1 - h2 / 2);
    }

    // total above bar
    const ktot = g.ke1 + g.ke2;
    gctx.fillStyle = g.dimmed ? themeColor('--text-secondary') : themeColor('--text-primary');
    gctx.globalAlpha = g.alpha;
    gctx.textBaseline = 'bottom';
    gctx.fillText(ktot.toFixed(2) + ' J', bx[gi] + barW / 2, stackBase - h1 - h2 - 3);
    gctx.globalAlpha = 1;

    // group label below
    gctx.fillStyle = themeColor('--text-secondary');
    gctx.font = '10px DM Sans, sans-serif';
    gctx.textBaseline = 'top';
    gctx.fillText(groupLabels[gi], bx[gi] + barW / 2, baseY + 4);
  });

  // legend: A = cyan dot, B = orange dot
  const legX = x + pl;
  const legY = y + pt - 2;
  gctx.font = '9px DM Sans, sans-serif';
  gctx.textAlign = 'left';
  gctx.textBaseline = 'middle';
  [[C1, 'A'], [C2, 'B']].forEach(([col, lbl], i) => {
    const lx2 = legX + i * 36;
    gctx.fillStyle = col;
    gctx.fillRect(lx2, legY - 4, 8, 8);
    gctx.fillStyle = themeColor('--text-secondary');
    gctx.fillText(lbl, lx2 + 10, legY);
  });

  // ΔKE annotation
  if (hasPost) {
    const ktPre  = ke1_pre + ke2_pre;
    const ktPost = ke1_post + ke2_post;
    const dKE    = ktPost - ktPre;
    const col = dKE < -0.01 ? C2 : '#00d4ff';
    gctx.fillStyle = col;
    gctx.font = '10px Space Mono, monospace';
    gctx.textAlign = 'right';
    gctx.textBaseline = 'top';
    gctx.fillText('ΔKE = ' + (dKE >= 0 ? '+' : '') + dKE.toFixed(2) + ' J', x + w - pr, y + pt - 2);
  }
}

function drawMomPanel(x, y, w, h, hasPost) {
  const is2d = params.mode === '2d';
  drawPanelBg(x, y, w, h, 'Quantità di Moto (kg·m/s)' + (is2d ? ' — x e y' : ''));

  // Stacked bar: each group (Pre/Dopo) shows p1 + p2 stacked, signed
  // For 2D: left half = px, right half = py
  const drawComponent = (cx, cy, cw, ch, p1pre, p2pre, p1post, p2post, compLabel) => {
    const pl2 = 6, pr2 = 6, pt2 = 20, pb2 = 18;
    const iW = cw - pl2 - pr2, iH = ch - pt2 - pb2;
    const midY = cy + pt2 + iH / 2;

    // scale
    const allAbs = [Math.abs(p1pre+p2pre), Math.abs(p1post+p2post),
                    Math.abs(p1pre), Math.abs(p2pre),
                    Math.abs(p1post), Math.abs(p2post)];
    const pMax = Math.max(...allAbs, 0.1);
    const toH  = v => (v / pMax) * (iH / 2);

    const barW = Math.min(50, iW * 0.30);
    const gapB = (iW - 2 * barW) / 3;
    const bxs  = [cx + pl2 + gapB, cx + pl2 + 2 * gapB + barW];

    // draw one signed stacked bar (A bottom, B stacked on top starting from A's end)
    const drawStackedBar = (bxi, pa, pb_, alpha) => {
      const ha = toH(pa); // signed px height
      const hb = toH(pb_);

      gctx.globalAlpha = alpha;

      // segment A: midY → midY - ha
      const a_top = Math.min(midY, midY - ha);
      gctx.fillStyle = C1;
      gctx.fillRect(bxs[bxi], a_top, barW, Math.max(1, Math.abs(ha)));

      // segment B: midY-ha → midY-ha-hb
      const aEnd  = midY - ha;
      const b_top = Math.min(aEnd, aEnd - hb);
      gctx.fillStyle = C2;
      gctx.fillRect(bxs[bxi], b_top, barW, Math.max(1, Math.abs(hb)));

      // total label above/below the combined bar
      const ptot    = pa + pb_;
      const extreme = midY - ha - hb; // canvas y at bar tip
      gctx.fillStyle = themeColor('--text-primary');
      gctx.font = '9px Space Mono, monospace';
      gctx.textAlign = 'center';
      if (ptot >= 0) {
        gctx.textBaseline = 'bottom';
        gctx.fillText(ptot.toFixed(2), bxs[bxi] + barW / 2, extreme - 2);
      } else {
        gctx.textBaseline = 'top';
        gctx.fillText(ptot.toFixed(2), bxs[bxi] + barW / 2, extreme + 2);
      }

      gctx.globalAlpha = 1;
    };

    drawStackedBar(0, p1pre,  p2pre,  1);
    drawStackedBar(1, p1post, p2post, hasPost ? 1 : 0.3);

    // zero line
    gctx.strokeStyle = themeColor('--border-hover');
    gctx.lineWidth = 1;
    gctx.beginPath();
    gctx.moveTo(cx + pl2, midY); gctx.lineTo(cx + pl2 + iW, midY);
    gctx.stroke();

    // group labels
    gctx.fillStyle = themeColor('--text-secondary');
    gctx.font = '9px DM Sans, sans-serif';
    gctx.textAlign = 'center';
    gctx.textBaseline = 'top';
    gctx.fillText('Prima', bxs[0] + barW / 2, cy + pt2 + iH + 2);
    gctx.fillText('Dopo',  bxs[1] + barW / 2, cy + pt2 + iH + 2);

    // component title
    gctx.fillStyle = themeColor('--text-secondary');
    gctx.font = '10px DM Sans, sans-serif';
    gctx.textAlign = 'left';
    gctx.textBaseline = 'top';
    if (compLabel) gctx.fillText(compLabel, cx + pl2 + 4, cy + pt2);

    // divider between groups
    const divX = (bxs[0] + barW + bxs[1]) / 2;
    gctx.setLineDash([3, 5]);
    gctx.strokeStyle = themeColor('--border-hover');
    gctx.beginPath();
    gctx.moveTo(divX, cy + pt2); gctx.lineTo(divX, cy + pt2 + iH);
    gctx.stroke();
    gctx.setLineDash([]);
  };

  const p1xPre  = sim.pre_p1x,  p2xPre  = sim.pre_p2x;
  const p1xPost = hasPost ? sim.post_p1x : sim.pre_p1x;
  const p2xPost = hasPost ? sim.post_p2x : sim.pre_p2x;

  if (is2d) {
    const p1yPre  = sim.pre_p1y,  p2yPre  = sim.pre_p2y;
    const p1yPost = hasPost ? sim.post_p1y : sim.pre_p1y;
    const p2yPost = hasPost ? sim.post_p2y : sim.pre_p2y;
    drawComponent(x,       y, w / 2, h, p1xPre, p2xPre, p1xPost, p2xPost, 'componente x');
    drawComponent(x + w/2, y, w / 2, h, p1yPre, p2yPre, p1yPost, p2yPost, 'componente y');
  } else {
    drawComponent(x, y, w, h, p1xPre, p2xPre, p1xPost, p2xPost, '');
  }

  // legend
  const legX = x + w - 60;
  const legY = y + 8;
  gctx.font = '9px DM Sans, sans-serif';
  gctx.textBaseline = 'middle';
  [[C1, 'A'], [C2, 'B']].forEach(([col, lbl], i) => {
    gctx.fillStyle = col;
    gctx.fillRect(legX + i * 28, legY - 4, 8, 8);
    gctx.fillStyle = themeColor('--text-secondary');
    gctx.textAlign = 'left';
    gctx.fillText(lbl, legX + i * 28 + 10, legY);
  });
}

/* ─────────────────────────────────────────────
   Readout
───────────────────────────────────────────── */
function updateReadout() {
  const el = document.getElementById('readout');
  if (!sim || !el) return;

  const { b1, b2, merged } = sim;
  const v1 = Math.sqrt(b1.vx * b1.vx + b1.vy * b1.vy);
  const v2 = merged ? v1 : Math.sqrt(b2.vx * b2.vx + b2.vy * b2.vy);
  const ptx  = b1.m * b1.vx + (merged ? 0 : b2.m * b2.vx);
  const pty  = b1.m * b1.vy + (merged ? 0 : b2.m * b2.vy);
  const KE   = ke(b1) + (merged ? 0 : ke(b2));

  const items = [
    { label: '|v₁|',  value: v1.toFixed(3) + ' m/s' },
    { label: '|v₂|',  value: merged ? '— (fusi)' : v2.toFixed(3) + ' m/s' },
    { label: 'p tot x', value: ptx.toFixed(3) + ' kg·m/s' },
    { label: 'KE tot', value: KE.toFixed(3) + ' J' },
  ];
  if (params.mode === '2d') items.push({ label: 'p tot y', value: pty.toFixed(3) + ' kg·m/s' });

  el.innerHTML = items.map(i =>
    `<span class="readout-item"><span class="readout-label">${i.label}</span><span class="readout-value">${i.value}</span></span>`
  ).join('');
}

/* ─────────────────────────────────────────────
   Animation loop
───────────────────────────────────────────── */
const SIM_SPEED = 1.0;
const MAX_DT    = 1 / 30;

function tick(ts) {
  if (!running) return;
  animId = requestAnimationFrame(tick);

  if (lastTime === null) { lastTime = ts; return; }
  let dt = (ts - lastTime) / 1000 * SIM_SPEED;
  lastTime = ts;
  if (dt > MAX_DT) dt = MAX_DT;

  const steps = 8;
  for (let i = 0; i < steps; i++) sim.step(dt / steps);

  // auto-stop when both balls are far away and phase=post
  if (sim.phase === 'post' || sim.merged) {
    const [sx1] = worldToScreen(sim.b1.x, sim.b1.y);
    const [sx2] = worldToScreen(sim.b2.x, sim.b2.y);
    const W = canvas.clientWidth;
    if ((sx1 < -200 || sx1 > W + 200) && (sx2 < -200 || sx2 > W + 200)) {
      running = false;
    }
  }

  drawScene();
  drawGraphs();
  updateReadout();
}

function startSim() {
  if (running) return;
  running   = true;
  lastTime  = null;
  animId    = requestAnimationFrame(tick);
}

function stopSim() {
  running = false;
  if (animId) cancelAnimationFrame(animId);
  animId = null;
}

function resetSim() {
  stopSim();
  sim = new SimState();
  drawScene();
  drawGraphs();
  updateReadout();
}

/* ─────────────────────────────────────────────
   Controls
───────────────────────────────────────────── */
let sub1d = null;
let sub2d = null;
let subE  = null;

function buildControls() {
  const c = document.getElementById('controls');
  c.innerHTML = '';

  // ── Traiettoria
  const secTraj = Lab.Section('Traiettoria');
  secTraj.add(Lab.RadioGroup({
    label: 'Modalità',
    options: [
      { value: '1d', label: 'Rettilineo', hint: 'moto su una linea' },
      { value: '2d', label: 'Obliquo',    hint: 'urto eccentrico 2D' },
    ],
    value: params.mode,
    onChange(v) { params.mode = v; refreshModeSubs(); resetSim(); },
  }));
  c.appendChild(secTraj.el);

  // ── Tipo urto
  const secType = Lab.Section('Tipo di Urto');
  secType.add(Lab.RadioGroup({
    label: 'Tipo',
    options: [
      { value: 'elastic',   label: 'Elastico',               hint: 'e = 1' },
      { value: 'inelastic', label: 'Anelastico',             hint: '0 < e < 1' },
      { value: 'perfect',   label: 'Perfettamente anelast.', hint: 'e = 0, fusione' },
    ],
    value: params.type,
    onChange(v) { params.type = v; refreshTypeSub(); resetSim(); },
  }));
  subE = Lab.SubPanel();
  subE.add(Lab.Slider({
    label: 'Coefficiente e', min: 0.01, max: 0.99, value: params.e, step: 0.01, unit: '',
    onChange(v) { params.e = v; resetSim(); },
  }));
  if (params.type !== 'inelastic') subE.hide();
  secType.add(subE);
  c.appendChild(secType.el);

  // ── Masse
  const secMasse = Lab.Section('Masse');
  secMasse.add(Lab.SliderInput({ label: 'Massa A', min: 0.5, max: 10, value: params.m1, step: 0.1, unit: ' kg', onChange(v) { params.m1 = v; resetSim(); } }));
  secMasse.add(Lab.SliderInput({ label: 'Massa B', min: 0.5, max: 10, value: params.m2, step: 0.1, unit: ' kg', onChange(v) { params.m2 = v; resetSim(); } }));
  c.appendChild(secMasse.el);

  // ── Velocità 1D
  const sec1d = Lab.Section('Velocità Iniziali');
  sec1d.add(Lab.SliderInput({ label: 'v₁  (+ = destra)', min: -8, max: 8, value: params.v1,  step: 0.1, unit: ' m/s', onChange(v) { params.v1  = v; resetSim(); } }));
  sec1d.add(Lab.SliderInput({ label: 'v₂  (+ = destra)', min: -8, max: 8, value: params.v2,  step: 0.1, unit: ' m/s', onChange(v) { params.v2  = v; resetSim(); } }));
  sub1d = Lab.SubPanel();
  sub1d.add(sec1d);
  c.appendChild(sub1d.el);

  // ── Velocità / angolo 2D
  const sec2d = Lab.Section('Velocità & Angolo');
  sec2d.add(Lab.SliderInput({ label: 'v₁', min: 0.5, max: 10, value: params.v1_2d, step: 0.1, unit: ' m/s', onChange(v) { params.v1_2d = v; resetSim(); } }));
  sec2d.add(Lab.SliderInput({ label: 'Angolo impatto θ', min: 0, max: 89, value: params.theta, step: 1, unit: '°', onChange(v) { params.theta = v; resetSim(); } }));
  sub2d = Lab.SubPanel();
  sub2d.add(sec2d);
  c.appendChild(sub2d.el);

  refreshModeSubs();
}

function refreshModeSubs() {
  if (!sub1d || !sub2d) return;
  params.mode === '1d' ? sub1d.show() : sub1d.hide();
  params.mode === '2d' ? sub2d.show() : sub2d.hide();
}

function refreshTypeSub() {
  if (!subE) return;
  params.type === 'inelastic' ? subE.show() : subE.hide();
}

/* ─────────────────────────────────────────────
   Graph area (fixed height, no resize)
───────────────────────────────────────────── */
const graphArea = document.getElementById('graphArea');

/* ─────────────────────────────────────────────
   Init
───────────────────────────────────────────── */
document.getElementById('btnPlay').addEventListener('click', () => {
  if (running) { stopSim(); document.getElementById('btnPlay').textContent = '▶  AVVIA'; }
  else         { startSim(); document.getElementById('btnPlay').textContent = '⏸  PAUSA'; }
});
document.getElementById('btnReset').addEventListener('click', () => {
  document.getElementById('btnPlay').textContent = '▶  AVVIA';
  resetSim();
});

window.addEventListener('resize', () => {
  resize(); resizeGraph();
  if (sim) { drawScene(); drawGraphs(); }
});

Lab.initTheme();
new MutationObserver(() => { drawScene(); drawGraphs(); })
  .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
buildControls();
resize();
resizeGraph();
resetSim();
