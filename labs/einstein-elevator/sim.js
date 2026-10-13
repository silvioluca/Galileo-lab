'use strict';

// ── Parameters ────────────────────────────────────────────────────────────────

const P = {
  isFree:     true,
  g:          3.0,
  showLight:  true,
  showClocks: true,
};

// ── Constants ─────────────────────────────────────────────────────────────────

// Both modes use constant acceleration: elevator free-falls, rocket thrusts upward.
// Velocities start at 0 and increase each frame; fall resets to 0 on wrap.
const FALL_ACC  = 0.11;   // normalized range per second²  (elevator in free fall)
const STAR_ACC  = 0.025;  // panel-heights per second²     (stars in rocket mode)
const FALL_WRAP  = 1.0;

const LIGHT_SPEED = 2.6;
const BEAM_Y0     = 0.48;  // beam entry height (elevator coords, y ∈ [-1,1])

const CLOCK_C2 = 10.0;
const CLOCK_HH = 0.80;

// ── State ─────────────────────────────────────────────────────────────────────

let coordT = 0, paused = false;

let fallDisp    = 0.0;   // normalized [0, FALL_WRAP)
let fallV       = 0.0;   // elevator fall speed (accelerates from 0)
let starScrollN = 0.0;   // normalized, wraps continuously
let rocketV     = 0.0;   // star scroll speed (accelerates from 0)

const OBJ_INIT = [
  { x: -0.44, y:  0.33, vx:  0.18, vy:  0.00 },
  { x:  0.38, y:  0.22, vx: -0.14, vy:  0.08 },
  { x:  0.06, y: -0.16, vx:  0.13, vy:  0.06 },
  { x: -0.27, y: -0.28, vx: -0.09, vy: -0.04 },
];
let objs = OBJ_INIT.map(o => ({ ...o }));
const OBJ_COLORS = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff'];

// Stars: normalized fixed positions, drawn with scroll offset in space panel
function rng(s) { const x = Math.sin(s) * 43758.5453; return x - Math.floor(x); }
const STARS = Array.from({ length: 90 }, (_, i) => ({
  nx: rng(i * 3.14 + 42),
  ny: rng(i * 7.31 + 17),
  r:  rng(i * 11.7 + 63) * 1.3 + 0.3,
}));

let tauTop = 0, tauBot = 0;

const graphData = [];  // { t, tauTop, tauBot, ys: [y0..y3] }

const WALL = 0.94;  // physics + visual wall boundary
const DAMP = 0.70;

let C = {};

// ── Physics ───────────────────────────────────────────────────────────────────

function effAcc() { return P.isFree ? 0.0 : -P.g; }

function resetSim() {
  coordT      = 0;
  fallDisp    = 0;
  fallV       = 0;
  starScrollN = 0;
  rocketV     = 0;
  tauTop      = 0;
  tauBot      = 0;
  graphData.length = 0;
  objs = OBJ_INIT.map(o => ({ ...o }));
}

function loop(dt) {
  if (paused) return;

  // Elevator fall / rocket thrust — both use constant acceleration
  if (P.isFree) {
    fallV    += FALL_ACC * dt;
    fallDisp += fallV * dt;
    if (fallDisp >= FALL_WRAP) { fallDisp = 0; fallV = 0; }  // new drop starts from rest
    rocketV   = 0;
  } else {
    fallDisp  = 0;
    fallV     = 0;
    rocketV  += STAR_ACC * dt;
    starScrollN += rocketV * dt;
  }

  // Objects
  const a = effAcc();
  objs.forEach(o => {
    o.vy += a * dt;
    o.x  += o.vx * dt;
    o.y  += o.vy * dt;
    if (o.x < -WALL) { o.x = -WALL; o.vx =  Math.abs(o.vx) * DAMP; }
    if (o.x >  WALL) { o.x =  WALL; o.vx = -Math.abs(o.vx) * DAMP; }
    if (o.y < -WALL) { o.y = -WALL; o.vy =  Math.abs(o.vy) * DAMP; }
    if (o.y >  WALL) { o.y =  WALL; o.vy = -Math.abs(o.vy) * DAMP; }
  });

  // Clocks — diverge only in bound frame (equivalence principle)
  const af = Math.abs(a);
  tauTop += dt * (1.0 + af * CLOCK_HH / CLOCK_C2);
  tauBot += dt * (1.0 - af * CLOCK_HH / CLOCK_C2);

  coordT += dt;

  if (graphData.length === 0 || coordT - graphData[graphData.length - 1].t >= 0.1) {
    graphData.push({ t: coordT, tauTop, tauBot, ys: objs.map(o => o.y) });
    if (graphData.length > 200) graphData.shift();
  }
}

// ── Color refresh ─────────────────────────────────────────────────────────────

function refreshColors() {
  const s = getComputedStyle(document.documentElement);
  C = {
    bg1:    s.getPropertyValue('--bg1').trim(),
    bg2:    s.getPropertyValue('--bg2').trim(),
    bg3:    s.getPropertyValue('--bg3').trim(),
    text:   s.getPropertyValue('--text-primary').trim(),
    dim:    s.getPropertyValue('--text-secondary').trim(),
    hint:   s.getPropertyValue('--text-hint').trim(),
    accent: s.getPropertyValue('--accent').trim(),
    red:    s.getPropertyValue('--accent-red').trim(),
    green:  s.getPropertyValue('--accent-green').trim(),
    blue:   s.getPropertyValue('--accent-blue').trim(),
    amber:  s.getPropertyValue('--accent-amber').trim(),
    violet: s.getPropertyValue('--accent-violet').trim(),
  };
}

// ── g-vector arrow ────────────────────────────────────────────────────────────

function drawGVector(ctx, arrowX, elevCY, EH, label) {
  const len  = Math.min(EH * 0.40, 75);
  const topY = elevCY - len / 2;
  const botY = elevCY + len / 2;
  const HEAD = 9;

  ctx.strokeStyle = C.amber;
  ctx.fillStyle   = C.amber;
  ctx.lineWidth   = 2;

  // Shaft
  ctx.beginPath();
  ctx.moveTo(arrowX, topY);
  ctx.lineTo(arrowX, botY - HEAD);
  ctx.stroke();

  // Filled arrowhead
  ctx.beginPath();
  ctx.moveTo(arrowX,     botY);
  ctx.lineTo(arrowX - 6, botY - HEAD);
  ctx.lineTo(arrowX + 6, botY - HEAD);
  ctx.closePath();
  ctx.fill();

  // Label above arrow
  ctx.font      = `bold 10px 'Space Mono'`;
  ctx.textAlign = 'center';
  ctx.fillText(label, arrowX, topY - 6);
}

// ── Elevator box + content ────────────────────────────────────────────────────

function drawElevatorContent(ctx, cx, cy, EW, EH) {
  const ex = cx - EW / 2;
  const ey = cy - EH / 2;
  const hw = EW / 2 - 2;  // 2px inset keeps beam + objects within clip boundary
  const hh = EH / 2 - 2;

  // Fill
  ctx.fillStyle = 'rgba(80,120,160,0.08)';
  ctx.fillRect(ex, ey, EW, EH);

  // Border
  ctx.strokeStyle = C.accent;
  ctx.lineWidth   = 2;
  ctx.strokeRect(ex, ey, EW, EH);

  // Floor hatch
  ctx.strokeStyle = C.accent + '35';
  ctx.lineWidth   = 1;
  for (let hx = ex + 6; hx < ex + EW - 4; hx += 8) {
    ctx.beginPath();
    ctx.moveTo(hx, ey + EH);
    ctx.lineTo(hx - 5, ey + EH + 5);
    ctx.stroke();
  }

  // ── Clip to interior ──────────────────────────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.rect(ex + 2, ey + 2, EW - 4, EH - 4);
  ctx.clip();

  // ── Light beam (glowing, multi-pass) ──────────────────────────
  if (P.showLight) {
    const a = effAcc() * 0.18;  // attenuated: show subtle curve, not full deflection

    // Dashed horizontal reference (beam path if no deflection)
    ctx.strokeStyle = 'rgba(255,255,160,0.30)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(cx - hw, cy - BEAM_Y0 * hh);
    ctx.lineTo(cx + hw, cy - BEAM_Y0 * hh);
    ctx.stroke();
    ctx.setLineDash([]);

    // Build parabolic path points
    const pts = [];
    for (let i = 0; i <= 80; i++) {
      const t  = (i / 80) * (2.0 / LIGHT_SPEED);
      const bx = -1.0 + LIGHT_SPEED * t;
      const by = BEAM_Y0 + 0.5 * a * t * t;
      if (Math.abs(by) > 1.06) break;
      pts.push({ x: cx + bx * hw, y: cy - by * hh });
    }

    if (pts.length >= 2) {
      function tracePath() {
        ctx.beginPath();
        pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      }

      // Layer 1 — wide outer glow
      tracePath();
      ctx.strokeStyle = 'rgba(255,255,160,0.10)';
      ctx.lineWidth   = 14;
      ctx.stroke();

      // Layer 2 — medium glow
      ctx.strokeStyle = 'rgba(255,255,200,0.25)';
      ctx.lineWidth   = 7;
      ctx.stroke();

      // Layer 3 — bright core with shadow glow
      ctx.save();
      ctx.shadowBlur  = 10;
      ctx.shadowColor = 'rgba(255,255,80,0.9)';
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth   = 1.8;
      ctx.stroke();
      ctx.restore();

      // ── Emitter source at left wall ──────────────────────────
      const ex0 = pts[0].x;
      const ey0 = pts[0].y;

      // Outer halo
      ctx.beginPath();
      ctx.arc(ex0, ey0, 10, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,180,0.12)';
      ctx.fill();

      // Emitter body (small LED rectangle)
      ctx.fillStyle = C.accent + 'aa';
      ctx.fillRect(ex0 - 1, ey0 - 5, 3, 10);

      // Bright emitter dot
      ctx.save();
      ctx.shadowBlur  = 14;
      ctx.shadowColor = '#ffff00';
      ctx.beginPath();
      ctx.arc(ex0, ey0, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffa0';
      ctx.fill();
      ctx.restore();
    }
  }

  // ── Objects ───────────────────────────────────────────────────
  objs.forEach((o, i) => {
    ctx.beginPath();
    ctx.arc(cx + o.x * hw, cy - o.y * hh, 6, 0, Math.PI * 2);
    ctx.fillStyle   = OBJ_COLORS[i];
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth   = 1;
    ctx.stroke();
  });

  ctx.restore(); // end interior clip

  // ── Clocks (on right wall, positioned to avoid border overlap) ──
  if (P.showClocks) {
    drawClock(ctx, ex + EW - 22, ey + 32,       tauTop, C.blue, 'cima');
    drawClock(ctx, ex + EW - 22, ey + EH - 52,  tauBot, C.red,  'base');
  }
}

function drawClock(ctx, cx, cy, tau, color, label) {
  const R = 11;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle   = color + '1a';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth   = 1.5;
  ctx.stroke();

  const angle = tau * Math.PI * 2 - Math.PI / 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(angle) * R * 0.72, cy + Math.sin(angle) * R * 0.72);
  ctx.strokeStyle = color;
  ctx.lineWidth   = 2;
  ctx.stroke();

  ctx.fillStyle   = color;
  ctx.font        = `8px 'Space Mono'`;
  ctx.textAlign   = 'center';
  ctx.fillText(label,          cx, cy + R + 9);
  ctx.fillText(tau.toFixed(2), cx, cy + R + 18);
}

// ── Gravity panel (left) ──────────────────────────────────────────────────────

function drawGravityPanel(ctx, W, H) {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0.00, '#040810');
  sky.addColorStop(0.72, '#0d1a2c');
  sky.addColorStop(0.87, '#111a0c');
  sky.addColorStop(1.00, '#192808');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  const groundY = H * 0.87;

  ctx.fillStyle   = '#1c2e08';
  ctx.fillRect(0, groundY, W, H - groundY);
  ctx.strokeStyle = '#3a5c14';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(0, groundY); ctx.lineTo(W, groundY);
  ctx.stroke();

  // Background field arrows
  ctx.strokeStyle = 'rgba(255,180,0,0.14)';
  ctx.lineWidth   = 1;
  const asp = W / 5.5;
  for (let ax = asp * 0.5; ax < W; ax += asp) {
    for (let ay = H * 0.05; ay < groundY - 22; ay += H * 0.105) {
      const len = H * 0.054;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax, ay + len);
      ctx.moveTo(ax - 3, ay + len - 7);
      ctx.lineTo(ax, ay + len);
      ctx.lineTo(ax + 3, ay + len - 7);
      ctx.stroke();
    }
  }

  // Elevator geometry — capped so it doesn't grow on large screens
  const EW = Math.min(W * 0.54, 195);
  const EH = Math.min(H * 0.70, 280);
  const cx  = W / 2;
  const topY = H * 0.05 + EH / 2;
  const botY = groundY - EH / 2 - 3;

  const elevCY = P.isFree
    ? topY + (fallDisp / FALL_WRAP) * (botY - topY)
    : groundY - EH / 2;

  drawElevatorContent(ctx, cx, elevCY, EW, EH);

  // g vector — always present in gravity field
  const arrowX = cx + EW / 2 + 22;
  drawGVector(ctx, arrowX, elevCY, EH, 'g');
}

// ── Space panel (right) ───────────────────────────────────────────────────────

function drawSpacePanel(ctx, W, H) {
  ctx.fillStyle = '#030508';
  ctx.fillRect(0, 0, W, H);

  // Stars with scroll in rocket mode
  const scroll = starScrollN % 1.0;
  STARS.forEach(s => {
    const sx = s.nx * W;
    const sy = ((s.ny + scroll) % 1.0) * H;
    ctx.beginPath();
    ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.68)';
    ctx.fill();
  });

  const EW = Math.min(W * 0.54, 195);
  const EH = Math.min(H * 0.70, 280);
  const cx  = W / 2;
  const cy  = H * 0.45;

  // Rocket flame (bound mode only)
  if (!P.isFree) {
    const fbx  = cx;
    const fby  = cy + EH / 2 + 2;
    const t    = coordT * 9;
    const fw   = EW * 0.16;
    const flen = 22 + 8 * Math.sin(t);
    const fg   = ctx.createLinearGradient(fbx, fby, fbx, fby + flen);
    fg.addColorStop(0.0, '#ff7700cc');
    fg.addColorStop(0.5, '#ffcc00aa');
    fg.addColorStop(1.0, 'transparent');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(fbx - fw, fby);
    ctx.quadraticCurveTo(
      fbx + fw * 0.35 * Math.sin(t * 0.9), fby + flen * 0.55,
      fbx + fw * 0.12 * Math.sin(t * 0.7), fby + flen
    );
    ctx.quadraticCurveTo(
      fbx - fw * 0.35 * Math.sin(t * 0.8 + 1), fby + flen * 0.55,
      fbx + fw, fby
    );
    ctx.fill();
  }

  drawElevatorContent(ctx, cx, cy, EW, EH);

  // g_eff vector — only in rocket (bound) mode
  if (!P.isFree) {
    const arrowX = cx + EW / 2 + 22;
    drawGVector(ctx, arrowX, cy, EH, 'g_eff');
  }
}

// ── Main draw ─────────────────────────────────────────────────────────────────

function drawMain() {
  const canvas = document.getElementById('simCanvas');
  const ctx    = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  ctx.clearRect(0, 0, W, H);
  refreshColors();

  const MID = Math.floor(W / 2);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, MID, H);
  ctx.clip();
  drawGravityPanel(ctx, MID, H);
  ctx.restore();

  ctx.save();
  ctx.translate(MID, 0);
  ctx.beginPath();
  ctx.rect(0, 0, W - MID, H);
  ctx.clip();
  drawSpacePanel(ctx, W - MID, H);
  ctx.restore();

  // Divider
  ctx.strokeStyle = C.dim + '44';
  ctx.lineWidth   = 1;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(MID, 20); ctx.lineTo(MID, H - 20);
  ctx.stroke();
  ctx.setLineDash([]);

  // Panel headers
  ctx.font      = `10px 'Space Mono'`;
  ctx.fillStyle = C.dim;
  ctx.textAlign = 'center';
  ctx.fillText('CAMPO GRAVITAZIONALE', MID * 0.5,            14);
  ctx.fillText('SPAZIO PROFONDO',       MID + (W - MID) * 0.5, 14);
}

// ── Graph: two side-by-side subgraphs ─────────────────────────────────────────

function drawGraph() {
  const canvas = document.getElementById('graphCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  if (graphData.length < 2) return;

  const MID = Math.floor(W / 2);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, MID, H);
  ctx.clip();
  drawClockGraph(ctx, MID, H);
  ctx.restore();

  ctx.save();
  ctx.translate(MID, 0);
  ctx.beginPath();
  ctx.rect(0, 0, W - MID, H);
  ctx.clip();
  drawObjGraph(ctx, W - MID, H);
  ctx.restore();

  // Sub-graph divider
  ctx.strokeStyle = C.hint + '50';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(MID, 4); ctx.lineTo(MID, H - 4);
  ctx.stroke();
}

function drawClockGraph(ctx, W, H) {
  const PAD  = { l: 44, r: 10, t: 18, b: 24 };
  const gW   = W - PAD.l - PAD.r;
  const gH   = H - PAD.t - PAD.b;
  const first = graphData[0];
  const last  = graphData[graphData.length - 1];
  const tMin  = first.t;
  const tMax  = Math.max(last.t, tMin + 0.01);
  const vMax  = Math.max(last.tauTop, last.tauBot, last.t) * 1.04;

  const tx = t   => PAD.l + ((t - tMin) / (tMax - tMin)) * gW;
  const ty = tau => PAD.t + gH - (tau / (vMax || 1)) * gH;

  // Grid
  ctx.strokeStyle = C.hint + '44';
  ctx.lineWidth   = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = PAD.t + (i / 4) * gH;
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + gW, y); ctx.stroke();
  }

  // Diagonal reference (coord time)
  ctx.strokeStyle = C.dim + '40';
  ctx.setLineDash([3, 5]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tx(tMin), ty(tMin));
  ctx.lineTo(tx(tMax), ty(tMax));
  ctx.stroke();
  ctx.setLineDash([]);

  // τ_top
  const topAlpha = P.showClocks ? '1.0' : '0.35';
  ctx.strokeStyle = P.showClocks ? C.blue : C.blue + '55';
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  graphData.forEach((d, i) => {
    i === 0 ? ctx.moveTo(tx(d.t), ty(d.tauTop)) : ctx.lineTo(tx(d.t), ty(d.tauTop));
  });
  ctx.stroke();

  // τ_bot
  ctx.strokeStyle = P.showClocks ? C.red : C.red + '55';
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  graphData.forEach((d, i) => {
    i === 0 ? ctx.moveTo(tx(d.t), ty(d.tauBot)) : ctx.lineTo(tx(d.t), ty(d.tauBot));
  });
  ctx.stroke();

  // Axes
  ctx.strokeStyle = C.dim;
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(PAD.l, PAD.t); ctx.lineTo(PAD.l, PAD.t + gH);
  ctx.lineTo(PAD.l + gW, PAD.t + gH); ctx.stroke();

  // Labels
  ctx.font      = `9px 'Space Mono'`;
  ctx.fillStyle = C.dim;
  ctx.textAlign = 'right';
  ctx.fillText('τ (s)', PAD.l - 3, PAD.t + 6);
  ctx.textAlign = 'center';
  ctx.fillText('t (s)', PAD.l + gW / 2, H - 4);

  // Header
  ctx.fillStyle = C.dim;
  ctx.font      = `9px 'Space Mono'`;
  ctx.textAlign = 'left';
  ctx.fillText('OROLOGI', PAD.l, PAD.t - 5);

  // Legend
  const lx = PAD.l + 2;
  ctx.fillStyle = P.showClocks ? C.blue : C.blue + '55';
  ctx.fillRect(lx, PAD.t + 4, 12, 2);
  ctx.fillStyle = C.dim;
  ctx.font      = `7px 'Space Mono'`;
  ctx.fillText('τ cima', lx + 15, PAD.t + 8);
  ctx.fillStyle = P.showClocks ? C.red : C.red + '55';
  ctx.fillRect(lx, PAD.t + 13, 12, 2);
  ctx.fillStyle = C.dim;
  ctx.fillText('τ base', lx + 15, PAD.t + 17);
}

function drawObjGraph(ctx, W, H) {
  const PAD  = { l: 44, r: 10, t: 18, b: 24 };
  const gW   = W - PAD.l - PAD.r;
  const gH   = H - PAD.t - PAD.b;
  const yMin = -WALL - 0.05, yMax = WALL + 0.05;
  const first = graphData[0];
  const last  = graphData[graphData.length - 1];
  const tMin  = first.t;
  const tMax  = Math.max(last.t, tMin + 0.01);

  const tx = t => PAD.l + ((t - tMin) / (tMax - tMin)) * gW;
  const ty = y => PAD.t + gH - ((y - yMin) / (yMax - yMin)) * gH;

  // Grid + reference lines
  ctx.strokeStyle = C.hint + '44';
  ctx.lineWidth   = 0.5;
  // y = 0 (neutral)
  ctx.beginPath(); ctx.moveTo(PAD.l, ty(0)); ctx.lineTo(PAD.l + gW, ty(0)); ctx.stroke();
  // y = -WALL (floor)
  ctx.strokeStyle = C.red + '33';
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(PAD.l, ty(-WALL)); ctx.lineTo(PAD.l + gW, ty(-WALL)); ctx.stroke();
  ctx.setLineDash([]);

  // Object y-position lines
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = OBJ_COLORS[i];
    ctx.beginPath();
    graphData.forEach((d, j) => {
      const x = tx(d.t), y = ty(d.ys[i]);
      j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  // Axes
  ctx.strokeStyle = C.dim;
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(PAD.l, PAD.t); ctx.lineTo(PAD.l, PAD.t + gH);
  ctx.lineTo(PAD.l + gW, PAD.t + gH); ctx.stroke();

  // y-axis ticks
  ctx.font      = `8px 'Space Mono'`;
  ctx.fillStyle = C.dim;
  ctx.textAlign = 'right';
  ctx.fillText('1',   PAD.l - 3, ty(WALL)   + 3);
  ctx.fillText('0',   PAD.l - 3, ty(0)      + 3);
  ctx.fillText('-1',  PAD.l - 3, ty(-WALL)  + 3);

  ctx.textAlign = 'center';
  ctx.fillText('t (s)', PAD.l + gW / 2, H - 4);

  // "suolo" label at floor line
  ctx.fillStyle = C.red + '88';
  ctx.font      = `7px 'Space Mono'`;
  ctx.textAlign = 'right';
  ctx.fillText('suolo', PAD.l + gW - 2, ty(-WALL) - 3);

  // Header
  ctx.fillStyle   = C.dim;
  ctx.font        = `9px 'Space Mono'`;
  ctx.textAlign   = 'left';
  ctx.fillText('POSIZIONE y', PAD.l, PAD.t - 5);
}

// ── Controls ──────────────────────────────────────────────────────────────────

function buildControls() {
  const cont = document.getElementById('controls');
  cont.innerHTML = '';

  const secMode = Lab.Section('Modalità');
  cont.appendChild(secMode.el);
  secMode.add(Lab.Toggle({
    label: 'Caduta libera / Deriva',
    value: P.isFree,
    onChange(v) { P.isFree = v; resetSim(); },
  }));

  const secVis = Lab.Section('Visualizzazioni');
  cont.appendChild(secVis.el);
  secVis.add(Lab.Toggle({
    label: 'Raggio di luce',
    value: P.showLight,
    onChange(v) { P.showLight = v; },
  }));
  secVis.add(Lab.Toggle({
    label: 'Orologi',
    value: P.showClocks,
    onChange(v) { P.showClocks = v; },
  }));
}

// ── Readout ───────────────────────────────────────────────────────────────────

let readout;

function updateReadout() {
  if (!readout) return;
  readout.set('left',  P.isFree ? 'Caduta libera'          : 'A riposo sulla superficie');
  readout.set('right', P.isFree ? 'Deriva — imponderabilità' : 'Razzo in accelerazione');
  const d = tauTop - tauBot;
  readout.set('delta', (d >= 0 ? '+' : '') + d.toFixed(4) + ' s');
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
  Lab.initTheme();
  refreshColors();

  readout = new Lab.Readout(document.getElementById('readout'), [
    { key: 'left',  label: 'Campo g' },
    { key: 'right', label: 'Spazio' },
    { key: 'delta', label: 'Δτ cima−base' },
  ]);

  buildControls();
  resetSim();

  document.getElementById('btnPlay').addEventListener('click', () => {
    paused = !paused;
    document.getElementById('btnPlay').textContent = paused ? '▶  PLAY' : '⏸  PAUSA';
  });
  document.getElementById('btnReset').addEventListener('click', () => {
    resetSim();
    paused = false;
    document.getElementById('btnPlay').textContent = '⏸  PAUSA';
  });

  const simCanvas   = document.getElementById('simCanvas');
  const graphCanvas = document.getElementById('graphCanvas');

  function resize() {
    const area  = document.querySelector('.lab-canvas-area');
    const gArea = document.getElementById('graphArea');
    if (!area || !simCanvas) return;
    const ar = area.getBoundingClientRect();
    const gh = gArea ? gArea.getBoundingClientRect().height : 190;
    simCanvas.width  = Math.floor(ar.width);
    simCanvas.height = Math.floor(simCanvas.clientHeight || ar.height - gh - 56);
    if (graphCanvas) {
      graphCanvas.width  = Math.floor(ar.width);
      graphCanvas.height = Math.floor(gh);
    }
  }

  resize();
  window.addEventListener('resize', resize);

  let lastTime = null;
  function frame(ts) {
    if (lastTime === null) lastTime = ts;
    const dt = Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;
    loop(dt);
    drawMain();
    drawGraph();
    updateReadout();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

window.addEventListener('DOMContentLoaded', init);
