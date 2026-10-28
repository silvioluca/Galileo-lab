'use strict';

/* ── Canvas refs ─────────────────────────────────────────────────────────── */
const sc   = document.getElementById('simCanvas');
const gc   = document.getElementById('graphCanvas');
const ctx  = sc.getContext('2d');
const gctx = gc.getContext('2d');
const DPR  = window.devicePixelRatio || 1;
let SW = 0, SH = 0, GW = 0, GH = 0;

Lab.initTheme('themeToggle');
const dk = () => document.documentElement.dataset.theme !== 'light';

/* ── Grid ────────────────────────────────────────────────────────────────── */
const W      = 260;
const H      = 170;
const SUBSTEPS = 3;
const SPEED    = 0.44; // fixed wave speed (cells/step)
// Mur coefficient for absorbing BC: (c-1)/(c+1) with c=SPEED
const MUR = (SPEED - 1) / (SPEED + 1); // ≈ -0.389
// scala fisica di un ondoscopio reale: 1 cella = 1 mm (vasca 26 × 17 cm), increspature a 25 cm/s;
// ne segue la durata di un passo di simulazione e quindi la frequenza in Hz
const CELL_MM = 1, V_MM_S = 250, STEP_S = SPEED * CELL_MM / V_MM_S;
const cm = c => Lab.fmt(c * CELL_MM / 10, 1) + ' cm';
const hz = f => Lab.fmt(f / STEP_S, 1) + ' Hz';

/* ── Physics arrays ──────────────────────────────────────────────────────── */
let u0      = new Float32Array(W * H);
let u1      = new Float32Array(W * H);
let uw      = new Float32Array(W * H);
let barrier = new Uint8Array(W * H);
let damp    = new Float32Array(W * H);
let envField = new Float32Array(W * H); // running-peak envelope for interference display

function buildDamp() {
  // Flat damp: reflective uses 0.9998 (mild dissipation to prevent DC drift),
  // absorbing uses 0.9999 (interior only; boundary handled by Mur ABC in step()).
  damp.fill(P.reflectWalls ? 0.9998 : 0.9999);
}

/* ── Parameters ──────────────────────────────────────────────────────────── */
const P = {
  freq:    0.012,
  amp:     1.0,
  srcType: 'single',       // 'single' | 'double' | 'lineare'
  srcSep:  80,             // double source separation (cells)
  srcLinearL: Math.round(H * 0.80),
  srcX:    Math.round(W * 0.10),
  srcY:    Math.round(H * 0.50),
  probeX:  Math.round(W * 0.80),
  probeY:  Math.round(H * 0.50),
  barrierX: Math.round(W * 0.42),
  barrierPreset: 'none',   // 'none'|'single'|'double'|'triple'
  slitW:   18,
  slitSep: 30,
  obstacleType: 'none',    // 'none'|'rect'|'circle'
  obstacleX: Math.round(W * 0.68),
  obstacleY: Math.round(H * 0.50),
  obstacleW: 36,
  obstacleH: 24,
  obstacleR: 20,
  obstacleAngle: 0.0,      // radians
  reflectWalls: false,
};

let simT   = 0;
let paused = false;

/* ── Signal history ──────────────────────────────────────────────────────── */
const SIG_LEN = 128;
const sigBuf  = new Float32Array(SIG_LEN);
let   sigIdx  = 0;

/* ── Offscreen canvas ────────────────────────────────────────────────────── */
const offsc   = document.createElement('canvas');
offsc.width = W; offsc.height = H;
const octx    = offsc.getContext('2d');
const imgData = octx.createImageData(W, H);

/* ── Barriers ────────────────────────────────────────────────────────────── */
function buildAllBarriers() {
  barrier.fill(0);
  buildSlitBarrier();
  buildObstacleBarrier();
  clearBarrierWave();
}

function buildSlitBarrier() {
  if (P.barrierPreset === 'none') return;
  const bx = P.barrierX, thick = 3;
  const cy = H / 2, hw = P.slitW / 2, sep = P.slitSep / 2;
  for (let dx = -thick; dx <= thick; dx++) {
    const x = bx + dx;
    if (x < 1 || x >= W-1) continue;
    for (let y = 1; y < H-1; y++) {
      let open = false;
      if (P.barrierPreset === 'single') {
        open = Math.abs(y - cy) <= hw;
      } else if (P.barrierPreset === 'double') {
        open = Math.abs(y-(cy-sep)) <= hw || Math.abs(y-(cy+sep)) <= hw;
      } else if (P.barrierPreset === 'triple') {
        open = Math.abs(y-cy) <= hw
            || Math.abs(y-(cy-P.slitSep)) <= hw
            || Math.abs(y-(cy+P.slitSep)) <= hw;
      }
      if (!open) barrier[y*W+x] = 1;
    }
  }
}

function buildObstacleBarrier() {
  if (P.obstacleType === 'none') return;
  const cx = P.obstacleX, cy = P.obstacleY;
  if (P.obstacleType === 'rect') {
    const cos = Math.cos(-P.obstacleAngle), sin = Math.sin(-P.obstacleAngle);
    const hw = P.obstacleW / 2, hh = P.obstacleH / 2;
    const R  = Math.sqrt(hw*hw + hh*hh);
    const x0 = Math.max(1, Math.floor(cx-R)), x1 = Math.min(W-2, Math.ceil(cx+R));
    const y0 = Math.max(1, Math.floor(cy-R)), y1 = Math.min(H-2, Math.ceil(cy+R));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const dx = x-cx, dy = y-cy;
        if (Math.abs(dx*cos - dy*sin) <= hw && Math.abs(dx*sin + dy*cos) <= hh)
          barrier[y*W+x] = 1;
      }
  } else if (P.obstacleType === 'circle') {
    const r2 = P.obstacleR * P.obstacleR;
    const x0 = Math.max(1, Math.floor(cx-P.obstacleR)), x1 = Math.min(W-2, Math.ceil(cx+P.obstacleR));
    const y0 = Math.max(1, Math.floor(cy-P.obstacleR)), y1 = Math.min(H-2, Math.ceil(cy+P.obstacleR));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++)
        if ((x-cx)*(x-cx)+(y-cy)*(y-cy) <= r2) barrier[y*W+x] = 1;
  }
}

function clearBarrierWave() {
  for (let i = 0; i < W*H; i++)
    if (barrier[i]) { u0[i] = 0; u1[i] = 0; envField[i] = 0; }
}

/* ── Physics step ────────────────────────────────────────────────────────── */
function step() {
  const c2  = SPEED * SPEED;
  const val = P.amp * Math.sin(2 * Math.PI * P.freq * simT);

  if (P.reflectWalls) {
    // Neumann BC: free surface reflection (no phase inversion)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y*W+x;
        if (barrier[i]) { uw[i] = 0; continue; }
        const lv = x > 0   ? u0[i-1] : u0[i+1];
        const rv = x < W-1 ? u0[i+1] : u0[i-1];
        const uv = y > 0   ? u0[i-W] : u0[i+W];
        const dv = y < H-1 ? u0[i+W] : u0[i-W];
        uw[i] = (2*u0[i] - u1[i] + c2*(lv+rv+uv+dv-4*u0[i])) * damp[i];
      }
    }
  } else {
    // Interior update (no sponge — boundary handled by Mur below)
    for (let y = 1; y < H-1; y++) {
      const row = y*W;
      for (let x = 1; x < W-1; x++) {
        const i = row+x;
        if (barrier[i]) { uw[i] = 0; continue; }
        const lap = u0[i-1]+u0[i+1]+u0[i-W]+u0[i+W]-4*u0[i];
        uw[i] = (2*u0[i] - u1[i] + c2*lap) * 0.9999;
      }
    }
    // Mur first-order absorbing BC: u_new[border] = u_old[inner] + MUR*(u_new[inner] - u_old[border])
    // This lets waves exit as if the grid continued indefinitely.
    for (let y = 1; y < H-1; y++) {
      const iL = y*W, iR = y*W + W-1;
      if (!barrier[iL]) uw[iL] = u0[iL+1] + MUR * (uw[iL+1] - u0[iL]);
      if (!barrier[iR]) uw[iR] = u0[iR-1] + MUR * (uw[iR-1] - u0[iR]);
    }
    for (let x = 1; x < W-1; x++) {
      const iT = x, iB = (H-1)*W + x;
      if (!barrier[iT]) uw[iT] = u0[iT+W] + MUR * (uw[iT+W] - u0[iT]);
      if (!barrier[iB]) uw[iB] = u0[iB-W] + MUR * (uw[iB-W] - u0[iB]);
    }
    // Corners: average the two adjacent Mur results
    uw[0]       = (uw[1]           + uw[W]         ) * 0.5;
    uw[W-1]     = (uw[W-2]         + uw[2*W-1]     ) * 0.5;
    uw[(H-1)*W] = (uw[(H-1)*W+1]   + uw[(H-2)*W]   ) * 0.5;
    uw[H*W-1]   = (uw[H*W-2]       + uw[(H-1)*W-1] ) * 0.5;
  }

  // Source excitation
  const sx = Math.round(P.srcX);
  if (P.srcType === 'single') {
    const i = Math.round(P.srcY)*W + sx;
    if (i >= 0 && i < W*H && !barrier[i]) uw[i] = val;
  } else if (P.srcType === 'double') {
    const hy = Math.round(H/2), off = Math.round(P.srcSep/2);
    const i1 = Math.max(1,hy-off)*W+sx, i2 = Math.min(H-2,hy+off)*W+sx;
    if (!barrier[i1]) uw[i1] = val;
    if (!barrier[i2]) uw[i2] = val;
  } else { // lineare
    const hy = Math.round(H/2), ll = Math.round(P.srcLinearL/2);
    for (let y = Math.max(1,hy-ll); y <= Math.min(H-2,hy+ll); y++) {
      const i = y*W+sx;
      if (!barrier[i]) uw[i] = val;
    }
  }

  const tmp = u1; u1 = u0; u0 = uw; uw = tmp;
  simT++;
}

/* ── Color map ───────────────────────────────────────────────────────────── */
function lerpStops(S, t) {
  for (let i = 1; i < S.length; i++) {
    if (t <= S[i][0] || i === S.length-1) {
      const [t0,c0] = S[i-1], [t1,c1] = S[i];
      const f = Math.max(0, Math.min(1, (t-t0)/(t1-t0)));
      return [c0[0]+(c1[0]-c0[0])*f|0, c0[1]+(c1[1]-c0[1])*f|0, c0[2]+(c1[2]-c0[2])*f|0];
    }
  }
}

function waveToRGB(v, dark) {
  // Signed ripple-tank look: trough=dark, zero=medium water, crest=bright
  const t = (v + 1) * 0.5;
  if (dark) return lerpStops([
    [0.00, [  3,   7,  25]],  // trough: near-black navy
    [0.25, [  8,  18,  52]],  // neg mid: dark navy
    [0.50, [  6,  14,  42]],  // zero: very dark — destructive interference appears black
    [0.72, [ 55, 155, 240]],  // pos mid: bright blue
    [1.00, [215, 252, 255]],  // crest: white-cyan
  ], t);
  return lerpStops([
    [0.00, [ 60, 105, 195]],
    [0.25, [140, 175, 225]],
    [0.50, [198, 218, 242]],
    [0.75, [150, 195, 230]],
    [1.00, [ 30,  95, 175]],
  ], t);
}

/* ── Render wave field ───────────────────────────────────────────────────── */
function renderWave() {
  const dark  = dk();
  const d     = imgData.data;
  const invN  = 1 / Math.max(P.amp * 0.70, 0.01);

  // Running-peak envelope: tracks local max amplitude with slow decay.
  // Constructive zones: envField stays near peak amplitude.
  // Destructive zones: envField decays toward 0 (no wave energy).
  // This makes the interference pattern visible regardless of current wave phase.
  for (let i = 0; i < W*H; i++) {
    const a = Math.abs(u0[i]);
    if (a > envField[i]) envField[i] = a;
    else envField[i] *= 0.998;
  }

  const FADE = 58; // cells over which edges fade to background

  for (let i = 0; i < W*H; i++) {
    const pi = i * 4;
    if (barrier[i]) {
      d[pi]=55; d[pi+1]=62; d[pi+2]=85; d[pi+3]=255;
      continue;
    }
    const x = i % W, y = (i / W) | 0;
    // Smooth cosine vignette: 0 at border, 1 in interior
    const tx = Math.min(x, W-1-x, FADE) / FADE;
    const ty = Math.min(y, H-1-y, FADE) / FADE;
    const fade = (1 - Math.cos(Math.PI * tx)) * 0.5 * (1 - Math.cos(Math.PI * ty)) * 0.5;

    const env = envField[i] * invN;
    const abs = Math.min(1, env);
    const v   = Math.sign(u0[i]) * Math.pow(abs, 0.45) * fade;
    const [r,g,b] = waveToRGB(v, dark);
    d[pi]=r; d[pi+1]=g; d[pi+2]=b; d[pi+3]=255;
  }
  octx.putImageData(imgData, 0, 0);
  ctx.drawImage(offsc, 0, 0, SW, SH);
}

/* ── Overlay ─────────────────────────────────────────────────────────────── */
function drawOverlay() {
  const dark = dk();

  // Detector vertical dashed line
  const psx = P.probeX / W * SW;
  ctx.strokeStyle = dark ? 'rgba(0,212,255,0.20)' : 'rgba(0,100,180,0.18)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(psx, 0); ctx.lineTo(psx, SH); ctx.stroke();
  ctx.setLineDash([]);

  // Source indicator(s)
  const drawSrc = (gx, gy, lbl) => {
    const sx = gx/W*SW, sy = gy/H*SH;
    // Animated ring
    const phase = (simT * P.freq * SUBSTEPS) % 1;
    ctx.strokeStyle = `rgba(255,90,90,${(1-phase).toFixed(2)})`;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.arc(sx, sy, 8 + phase*15, 0, Math.PI*2); ctx.stroke();
    // Dot
    ctx.fillStyle   = '#ff5555';
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.35)';
    ctx.lineWidth   = 1.5;
    ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    if (lbl) {
      ctx.fillStyle = dark ? 'rgba(255,150,150,0.80)' : '#aa2200';
      ctx.font = '10px Space Mono, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(lbl, sx, sy - 8);
    }
  };

  const hy = H/2, off = P.srcSep/2;
  if      (P.srcType === 'single')  drawSrc(P.srcX, P.srcY, 'S');
  else if (P.srcType === 'double') { drawSrc(P.srcX, hy-off, 'S₁'); drawSrc(P.srcX, hy+off, 'S₂'); }
  else { // lineare
    // Draw line indicator
    const sx = P.srcX/W*SW;
    const ll = P.srcLinearL/2;
    const sy1 = (hy-ll)/H*SH, sy2 = (hy+ll)/H*SH;
    ctx.strokeStyle = '#ff5555'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(sx, sy1); ctx.lineTo(sx, sy2); ctx.stroke();
    ctx.fillStyle = dark ? 'rgba(255,150,150,0.80)' : '#aa2200';
    ctx.font = '10px Space Mono, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('S', sx, sy1 - 3);
  }

  // Probe dot
  ctx.fillStyle   = '#ffcc00';
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.35)';
  ctx.lineWidth   = 1.5;
  ctx.beginPath(); ctx.arc(psx, P.probeY/H*SH, 8, 0, Math.PI*2);
  ctx.fill(); ctx.stroke();

  // Barrier drag handle — small ↔ button at top of barrier
  if (P.barrierPreset !== 'none') {
    const bsx = P.barrierX / W * SW;
    ctx.fillStyle   = dark ? 'rgba(255,200,50,0.92)' : 'rgba(155,95,0,0.85)';
    ctx.strokeStyle = dark ? 'rgba(0,0,0,0.50)' : 'rgba(255,255,255,0.60)';
    ctx.lineWidth   = 1.5;
    ctx.beginPath(); ctx.arc(bsx, 12, 6, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = dark ? 'rgba(0,0,0,0.80)' : 'rgba(255,255,255,0.90)';
    ctx.lineWidth   = 1.0;
    ctx.beginPath();
    ctx.moveTo(bsx-4,12); ctx.lineTo(bsx+4,12);
    ctx.moveTo(bsx-4,12); ctx.lineTo(bsx-2,10); ctx.moveTo(bsx-4,12); ctx.lineTo(bsx-2,14);
    ctx.moveTo(bsx+4,12); ctx.lineTo(bsx+2,10); ctx.moveTo(bsx+4,12); ctx.lineTo(bsx+2,14);
    ctx.stroke();
  }

  // Obstacle center dot + rotation arc (rect only)
  if (P.obstacleType !== 'none') {
    const ox = P.obstacleX / W * SW, oy = P.obstacleY / H * SH;
    ctx.fillStyle   = dark ? 'rgba(255,200,50,0.92)' : 'rgba(155,95,0,0.85)';
    ctx.strokeStyle = dark ? 'rgba(0,0,0,0.50)' : 'rgba(255,255,255,0.60)';
    ctx.lineWidth   = 1.5;
    ctx.beginPath(); ctx.arc(ox, oy, 5, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    if (P.obstacleType === 'rect') {
      ctx.strokeStyle = dark ? 'rgba(255,200,50,0.55)' : 'rgba(155,95,0,0.55)';
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.arc(ox, oy, 14, P.obstacleAngle - 0.8, P.obstacleAngle + 0.8);
      ctx.stroke();
      const ae = P.obstacleAngle + 0.8;
      ctx.fillStyle = dark ? 'rgba(255,200,50,0.55)' : 'rgba(155,95,0,0.55)';
      ctx.beginPath();
      ctx.arc(ox + 14*Math.cos(ae), oy + 14*Math.sin(ae), 2.5, 0, Math.PI*2);
      ctx.fill();
    }
  }
}

function drawScene() {
  ctx.save();
  ctx.scale(DPR, DPR);
  renderWave();
  drawOverlay();
  ctx.restore();
}

/* ── Graphs ──────────────────────────────────────────────────────────────── */
function drawGraphs() {
  if (!GW || !GH) return;
  const dark   = dk();
  const panW   = Math.floor(GW / 2);
  const PAD    = { t:22, b:28, l:42, r:10 };
  const accent = '#00d4ff';
  const axCol  = dark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.14)';
  const lblCol = dark ? 'rgba(255,255,255,0.48)' : 'rgba(0,0,0,0.44)';

  gctx.clearRect(0, 0, gc.width, gc.height);

  /* Panel 1 — cross-section u(y) at probeX */
  {
    const iW = panW - PAD.l - PAD.r, iH = GH - PAD.t - PAD.b;
    gctx.fillStyle = dark ? 'rgba(0,212,255,0.04)' : 'rgba(0,120,200,0.04)';
    gctx.fillRect(0, 0, panW*DPR, GH*DPR);

    const mapV = v  => (PAD.l + (v+1)/2 * iW) * DPR;
    const mapJ = j  => (PAD.t + j/(H-1)  * iH) * DPR;

    // Grid ±0.5
    gctx.strokeStyle = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
    gctx.lineWidth = 1;
    [-0.5, 0.5].forEach(v => {
      gctx.beginPath(); gctx.moveTo(mapV(v), PAD.t*DPR); gctx.lineTo(mapV(v),(PAD.t+iH)*DPR); gctx.stroke();
    });
    // Axes
    gctx.strokeStyle = axCol; gctx.lineWidth = DPR;
    gctx.beginPath(); gctx.moveTo(mapV(0),PAD.t*DPR); gctx.lineTo(mapV(0),(PAD.t+iH)*DPR); gctx.stroke();
    gctx.beginPath(); gctx.moveTo(PAD.l*DPR, mapJ(H/2)); gctx.lineTo((PAD.l+iW)*DPR, mapJ(H/2)); gctx.stroke();

    // Curve
    const invN = 1 / Math.max(P.amp * 0.20, 0.01);
    const x = Math.max(1, Math.min(W-2, Math.round(P.probeX)));
    gctx.strokeStyle = accent; gctx.lineWidth = 1.5*DPR;
    gctx.beginPath();
    for (let j = 0; j < H; j++) {
      const v = Math.max(-1.05, Math.min(1.05, u0[j*W+x] * invN));
      j === 0 ? gctx.moveTo(mapV(v), mapJ(j)) : gctx.lineTo(mapV(v), mapJ(j));
    }
    gctx.stroke();

    gctx.fillStyle = lblCol; gctx.font = `${10*DPR}px Space Mono, monospace`;
    gctx.textAlign = 'center'; gctx.textBaseline = 'top';
    gctx.fillText('Sezione trasversale', (PAD.l+iW/2)*DPR, 5*DPR);
  }

  /* Panel 2 — signal history at probe */
  {
    const ox = panW, iW = panW - PAD.l - PAD.r, iH = GH - PAD.t - PAD.b;
    gctx.fillStyle = dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)';
    gctx.fillRect(ox*DPR, 0, panW*DPR, GH*DPR);
    gctx.strokeStyle = axCol; gctx.lineWidth = DPR;
    gctx.beginPath(); gctx.moveTo(ox*DPR,0); gctx.lineTo(ox*DPR,GH*DPR); gctx.stroke();

    const mapX = k => (ox + PAD.l + k/SIG_LEN * iW) * DPR;
    const mapV = v => (PAD.t + (1-(v+1)/2) * iH) * DPR;
    gctx.strokeStyle = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
    gctx.lineWidth = 1;
    [-0.5, 0.5].forEach(v => {
      gctx.beginPath(); gctx.moveTo((ox+PAD.l)*DPR,mapV(v)); gctx.lineTo((ox+PAD.l+iW)*DPR,mapV(v)); gctx.stroke();
    });
    gctx.strokeStyle = axCol; gctx.lineWidth = DPR;
    gctx.beginPath(); gctx.moveTo((ox+PAD.l)*DPR,mapV(0)); gctx.lineTo((ox+PAD.l+iW)*DPR,mapV(0)); gctx.stroke();

    const invN = 1 / Math.max(P.amp * 0.20, 0.01);
    gctx.strokeStyle = accent; gctx.lineWidth = 1.5*DPR;
    gctx.beginPath();
    for (let k = 0; k < SIG_LEN; k++) {
      const v = Math.max(-1.05, Math.min(1.05, sigBuf[(sigIdx+k)%SIG_LEN] * invN));
      k === 0 ? gctx.moveTo(mapX(k),mapV(v)) : gctx.lineTo(mapX(k),mapV(v));
    }
    gctx.stroke();

    gctx.fillStyle = lblCol; gctx.font = `${10*DPR}px Space Mono, monospace`;
    gctx.textAlign = 'center'; gctx.textBaseline = 'top';
    gctx.fillText('Segnale rivelatore', (ox+PAD.l+iW/2)*DPR, 5*DPR);
  }
}

function updateReadout() {
  const lam    = cm(SPEED / P.freq);
  const pi     = Math.round(P.probeY)*W + Math.round(P.probeX);
  const aProbe = Lab.fmt(Math.abs(u0[Math.max(0, Math.min(W*H-1, pi))]),3);
  const items = [
    { label: 'lunghezza d’onda λ', value: lam },
    { label: 'frequenza f',        value: hz(P.freq) },
    { label: 'velocità v = λ·f',   value: Lab.fmt(V_MM_S / 10, 0) + ' cm/s' },
    { label: 'ampiezza nella sonda', value: aProbe },
    { label: 'pareti',             value: P.reflectWalls ? 'riflettenti' : 'assorbenti' },
  ];
  document.getElementById('readout').innerHTML = items.map(it =>
    `<span class="readout-item"><span class="readout-label">${Lab.keepCaseHTML(it.label)}</span><span class="readout-value">${it.value}</span></span>`
  ).join('');
}

/* ── Canvas resize ───────────────────────────────────────────────────────── */
function resizeCanvases() {
  const area   = sc.parentElement;
  const ga     = document.getElementById('graphArea');
  const rd     = area.querySelector('.readout-bar');
  const availW = area.clientWidth;
  const gaH    = ga.clientHeight  || 170;
  const rdH    = rd ? (rd.clientHeight || 48) : 48;
  const availH = Math.max(100, area.clientHeight - gaH - rdH);

  // Maintain the grid's 260:170 aspect ratio so circles stay circular
  const ASPECT = W / H;
  if (availW / availH > ASPECT) { SH = availH; SW = Math.round(SH * ASPECT); }
  else                          { SW = availW; SH = Math.round(SW / ASPECT); }

  sc.width  = Math.round(SW*DPR); sc.height = Math.round(SH*DPR);
  sc.style.width  = SW+'px'; sc.style.height = SH+'px';
  sc.style.alignSelf = 'center'; // center in flex column if narrower than container

  GW = area.clientWidth; GH = ga.clientHeight || 170;
  gc.width  = Math.round(GW*DPR); gc.height = Math.round(GH*DPR);
  gc.style.width  = GW+'px'; gc.style.height = GH+'px';
}

/* ── Interaction ─────────────────────────────────────────────────────────── */
let mouseAction = 'none';

function gridXY(e) {
  const r = sc.getBoundingClientRect();
  return [(e.clientX - r.left) * W / r.width,
          (e.clientY - r.top)  * H / r.height];
}

function near(gx, gy, px, py, px_thresh = 20) {
  const r = sc.getBoundingClientRect();
  return Math.hypot((gx-px) * r.width/W, (gy-py) * r.height/H) < px_thresh;
}

function onObstacle(gx, gy) {
  if (P.obstacleType === 'none') return false;
  const dx = gx - P.obstacleX, dy = gy - P.obstacleY;
  const PAD = 6 * W / SW; // 6px hit margin in grid coords
  if (P.obstacleType === 'circle')
    return Math.hypot(dx, dy) < P.obstacleR + PAD;
  const cos = Math.cos(-P.obstacleAngle), sin = Math.sin(-P.obstacleAngle);
  return Math.abs(dx*cos - dy*sin) <= P.obstacleW/2 + PAD
      && Math.abs(dx*sin + dy*cos) <= P.obstacleH/2 + PAD;
}

function onBarrier(gx) {
  if (P.barrierPreset === 'none') return false;
  return Math.abs(gx - P.barrierX) * SW/W < 12;
}

sc.addEventListener('mousedown', e => {
  const [gx, gy] = gridXY(e);
  const hy = H/2, off = P.srcSep/2;
  const srcPoints = P.srcType === 'single'  ? [[P.srcX, P.srcY]]
                  : P.srcType === 'double'  ? [[P.srcX, hy-off],[P.srcX, hy+off]]
                  :                           [[P.srcX, hy]];
  for (const [sx,sy] of srcPoints)
    if (near(gx, gy, sx, sy)) { mouseAction = 'moveSrc'; return; }
  if (near(gx, gy, P.probeX, P.probeY)) { mouseAction = 'moveProbe'; return; }
  if (onObstacle(gx, gy)) {
    dragOffX = gx - P.obstacleX; dragOffY = gy - P.obstacleY;
    mouseAction = 'moveObs'; return;
  }
  if (onBarrier(gx, gy)) { mouseAction = 'moveBarrier'; return; }
});

sc.addEventListener('mousemove', e => {
  const [gx, gy] = gridXY(e);
  if (mouseAction === 'moveSrc') {
    P.srcX = Math.max(1, Math.min(W-2, Math.round(gx)));
    P.srcY = Math.max(1, Math.min(H-2, Math.round(gy)));
  } else if (mouseAction === 'moveProbe') {
    P.probeX = Math.max(1, Math.min(W-2, Math.round(gx)));
    P.probeY = Math.max(1, Math.min(H-2, Math.round(gy)));
  } else if (mouseAction === 'moveObs') {
    P.obstacleX = Math.max(2, Math.min(W-2, Math.round(gx - dragOffX)));
    P.obstacleY = Math.max(2, Math.min(H-2, Math.round(gy - dragOffY)));
    buildAllBarriers();
  } else if (mouseAction === 'moveBarrier') {
    P.barrierX = Math.max(5, Math.min(W-5, Math.round(gx)));
    buildAllBarriers();
  }
  const hy = H/2, off = P.srcSep/2;
  const pts = P.srcType==='single' ? [[P.srcX,P.srcY]]
            : P.srcType==='double' ? [[P.srcX,hy-off],[P.srcX,hy+off]]
            :                        [[P.srcX,hy]];
  const hovSrc   = pts.some(([sx,sy]) => near(gx,gy,sx,sy));
  const hovProbe = near(gx, gy, P.probeX, P.probeY);
  const hovObs   = onObstacle(gx, gy);
  const hovBar   = onBarrier(gx, gy);
  if (mouseAction !== 'none')              sc.style.cursor = 'grabbing';
  else if (hovSrc || hovProbe || hovObs)   sc.style.cursor = 'grab';
  else if (hovBar)                         sc.style.cursor = 'ew-resize';
  else                                     sc.style.cursor = 'default';
});

sc.addEventListener('mouseup',    () => { mouseAction = 'none'; });
sc.addEventListener('mouseleave', () => { mouseAction = 'none'; });

sc.addEventListener('wheel', e => {
  if (P.obstacleType !== 'rect') return;
  const [gx, gy] = gridXY(e);
  if (!onObstacle(gx, gy)) return;
  e.preventDefault();
  const step = e.shiftKey ? Math.PI/180 : Math.PI/36; // 1° or 5°
  P.obstacleAngle = ((P.obstacleAngle + (e.deltaY > 0 ? step : -step)) % Math.PI + Math.PI) % Math.PI;
  buildAllBarriers();
}, { passive: false });

/* ── Controls ────────────────────────────────────────────────────────────── */
let sliderSrcSep, sliderSrcLinearL, sliderSlitSep;
let sliderObsW, sliderObsH, sliderObsR;
let pauseBtn;
let dragOffX = 0, dragOffY = 0;

function buildControls() {
  const ctrl = document.getElementById('controls');
  ctrl.innerHTML = '';

  /* ── Wave ── */
  const waveSec = Lab.Section('Onda');
  waveSec.add(Lab.Slider({ label:'Frequenza', min:0.008, max:0.055, value:P.freq, step:0.001, format:hz,
    onChange: v => { P.freq = v; } }));
  waveSec.add(Lab.Slider({ label:'Ampiezza', min:0.1, max:2.5, value:P.amp, step:0.05,
    onChange: v => { P.amp = v; } }));
  ctrl.appendChild(waveSec.el);

  /* ── Source ── */
  const srcSec = Lab.Section('Sorgente');
  srcSec.add(Lab.RadioGroup({ label:'Tipo',
    options:[
      {label:'Singola (circolare)',value:'single'},
      {label:'Doppia (coerente)',  value:'double'},
      {label:'Lineare (piano)',    value:'lineare'},
    ],
    value: P.srcType,
    onChange: v => {
      P.srcType = v;
      sliderSrcSep.el.style.display     = v === 'double'  ? '' : 'none';
      sliderSrcLinearL.el.style.display = v === 'lineare' ? '' : 'none';
    }
  }));
  sliderSrcSep     = Lab.Slider({ label:'Separazione', min:10, max:130, value:P.srcSep, step:2, format:cm,
    onChange: v => { P.srcSep = v; } });
  sliderSrcLinearL = Lab.Slider({ label:'Lunghezza',   min:10, max:H-4, value:P.srcLinearL, step:2, format:cm,
    onChange: v => { P.srcLinearL = v; } });
  sliderSrcSep.el.style.display     = P.srcType === 'double'  ? '' : 'none';
  sliderSrcLinearL.el.style.display = P.srcType === 'lineare' ? '' : 'none';
  srcSec.add(sliderSrcSep);
  srcSec.add(sliderSrcLinearL);
  ctrl.appendChild(srcSec.el);

  /* ── Fenditura ── */
  const slitSec = Lab.Section('Fenditura');
  slitSec.add(Lab.RadioGroup({ label:'Geometria',
    options:[
      {label:'Nessuna',      value:'none'},
      {label:'Singola',      value:'single'},
      {label:'Doppia',       value:'double'},
      {label:'Tripla',       value:'triple'},
    ],
    value: P.barrierPreset,
    onChange: v => { P.barrierPreset = v; buildAllBarriers(); }
  }));
  slitSec.add(Lab.Slider({ label:'Larghezza', min:4, max:50, value:P.slitW, step:1, format:cm,
    onChange: v => { P.slitW=v; if(P.barrierPreset!=='none') buildAllBarriers(); } }));
  sliderSlitSep = Lab.Slider({ label:'Separazione', min:8, max:70, value:P.slitSep, step:1, format:cm,
    onChange: v => { P.slitSep=v; if(P.barrierPreset!=='none') buildAllBarriers(); } });
  slitSec.add(sliderSlitSep);

  const slitHint = document.createElement('div');
  slitHint.style.cssText = 'font-size:10px;line-height:1.5;padding:5px 2px 0;opacity:0.50;';
  slitHint.textContent = 'Trascina la parete (↔) nel canvas per spostarla';
  slitSec.add(slitHint);
  ctrl.appendChild(slitSec.el);

  /* ── Obstacle ── */
  const obsSec = Lab.Section('Ostacolo');
  obsSec.add(Lab.RadioGroup({ label:'Tipo',
    options:[
      {label:'Nessuno',     value:'none'},
      {label:'Rettangolo',  value:'rect'},
      {label:'Cerchio',     value:'circle'},
    ],
    value: P.obstacleType,
    onChange: v => { P.obstacleType=v; updateObsVisibility(); buildAllBarriers(); }
  }));

  sliderObsW = Lab.Slider({ label:'Larghezza',   min:6,  max:100, value:P.obstacleW, step:1, format:cm,
    onChange: v => { P.obstacleW=v; buildAllBarriers(); } });
  sliderObsH = Lab.Slider({ label:'Altezza',     min:6,  max:80,  value:P.obstacleH, step:1, format:cm,
    onChange: v => { P.obstacleH=v; buildAllBarriers(); } });
  sliderObsR = Lab.Slider({ label:'Raggio',      min:4,  max:60,  value:P.obstacleR, step:1, format:cm,
    onChange: v => { P.obstacleR=v; buildAllBarriers(); } });

  const obsHint = document.createElement('div');
  obsHint.style.cssText = 'font-size:10px;line-height:1.5;padding:5px 2px 0;opacity:0.50;';
  obsHint.textContent = 'Trascina per spostare · scroll per ruotare (rett.)';
  [sliderObsW, sliderObsH, sliderObsR].forEach(s => obsSec.add(s));
  obsSec.add(obsHint);
  ctrl.appendChild(obsSec.el);
  updateObsVisibility();

  /* ── Riflessioni ── */
  const reflSec = Lab.Section('Riflessione pareti');
  reflSec.add(Lab.Toggle({ label:'Attiva riflessione', value:P.reflectWalls,
    onChange: v => { P.reflectWalls=v; buildDamp(); } }));
  ctrl.appendChild(reflSec.el);

  /* ── Comandi ── */
  const cmdSec = Lab.Section('Comandi');
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;margin-top:4px;';

  pauseBtn = document.createElement('button');
  pauseBtn.className = 'btn-primary'; pauseBtn.style.flex = '1';
  pauseBtn.textContent = '⏸  PAUSA';
  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    pauseBtn.textContent = paused ? '▶  RIPRENDI' : '⏸  PAUSA';
  });

  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn-secondary'; resetBtn.style.flex = '1';
  resetBtn.textContent = '↺  RESET';
  resetBtn.addEventListener('click', () => {
    u0.fill(0); u1.fill(0); uw.fill(0); envField.fill(0); sigBuf.fill(0); simT = 0;
  });

  row.append(pauseBtn, resetBtn);
  cmdSec.el.appendChild(row);
  ctrl.appendChild(cmdSec.el);
}

function updateObsVisibility() {
  const t = P.obstacleType;
  sliderObsW.el.style.display = t === 'rect'   ? '' : 'none';
  sliderObsH.el.style.display = t === 'rect'   ? '' : 'none';
  sliderObsR.el.style.display = t === 'circle' ? '' : 'none';
}

/* ── Animation loop ──────────────────────────────────────────────────────── */
function loop() {
  if (!paused) {
    for (let s = 0; s < SUBSTEPS; s++) step();
    const pi = Math.round(P.probeY)*W + Math.round(P.probeX);
    sigBuf[sigIdx] = u0[Math.max(0, Math.min(W*H-1, pi))];
    sigIdx = (sigIdx + 1) % SIG_LEN;
    drawScene();
    drawGraphs();
    updateReadout();
  }
  requestAnimationFrame(loop);
}

/* ── Init ────────────────────────────────────────────────────────────────── */
function init() {
  resizeCanvases();
  buildDamp();
  buildAllBarriers();
  buildControls();
  loop();
}

window.addEventListener('resize', resizeCanvases);
init();
