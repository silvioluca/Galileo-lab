'use strict';

// ── Parameters ─────────────────────────────────────────────────────────────────
const P = {
  sourceType:   'alpha',
  activity:     0.8,
  bField:       0.0,
  mistOpacity:  1.0,
  beadOpacity:  3.0,
  showLines:    false,     // sovrapposizione linee guida (giallo α, verde β)
};

let srcX = 0.0, srcY = 0.0;

// ── Constants ──────────────────────────────────────────────────────────────────
const CIRC_R     = 0.44;
const TRACK_LIFE = 9.0;
const MAX_BEADS  = 1800;
const STEP       = 0.009;
const RANGE_MAX  = 1.0;    // asse X dei grafici range (in R-units)

const TYPE_DEF = {
  alpha: {
    baseRange: 0.42, eSpr: 0.30, scatter: 0.0012, curv: 0.55, qSign: +1,
    beadSkip:  1,        // controlla ogni step
    spawnProb: 0.65,     // 65% dei nuclei condensano → traccia densa ma spezzata
    spread:    0.030,
    rMin: 0.42, rMax: 0.82,   // stesse dimensioni del beta
    color: 'rgb(255,255,255)',
    lineColor: '#ffcc00',
  },
  beta: {
    baseRange: 0.82, eSpr: 0.75, scatter: 0.025, curv: 11.0, qSign: -1,
    beadSkip:  2,
    spawnProb: 0.80,     // alcuni gap anche per il beta
    spread:    0.004,
    rMin: 0.42, rMax: 0.82,
    color: 'rgb(215,238,255)',
    lineColor: '#44ff88',
  },
};

const RADON_CHAIN = [
  { type: 'alpha', weight: 3, mult: 0.85 },
  { type: 'alpha', weight: 2, mult: 1.00 },
  { type: 'beta',  weight: 2, mult: 0.55 },
  { type: 'alpha', weight: 1, mult: 1.40 },
  { type: 'beta',  weight: 1, mult: 1.18 },
];
const RADON_W = RADON_CHAIN.reduce((s, e) => s + e.weight, 0);

// Ra-226 → Rn-222 → Po-218 → Pb-214 → Bi-214 → Po-214
// Notevole: Po-214 emette α a 7.69 MeV → traccia molto più lunga
const RADIO_CHAIN = [
  { type: 'alpha', weight: 4, mult: 0.92 },  // Ra-226: 4.87 MeV
  { type: 'alpha', weight: 3, mult: 1.14 },  // Rn-222: 5.49 MeV
  { type: 'alpha', weight: 2, mult: 1.27 },  // Po-218: 6.00 MeV
  { type: 'beta',  weight: 2, mult: 0.60 },  // Pb-214 → Bi-214
  { type: 'beta',  weight: 1, mult: 0.88 },  // Bi-214 → Po-214
  { type: 'alpha', weight: 1, mult: 1.62 },  // Po-214: 7.69 MeV (traccia lunga!)
];
const RADIO_W = RADIO_CHAIN.reduce((s, e) => s + e.weight, 0);

// U-238: α a bassa energia (4.27 MeV) → tracce corte; figlia Th-234 emette β deboli
const URANIO_CHAIN = [
  { type: 'alpha', weight: 5, mult: 0.80 },  // U-238: 4.27 MeV (corte)
  { type: 'alpha', weight: 2, mult: 0.88 },  // U-235: 4.68 MeV
  { type: 'beta',  weight: 2, mult: 0.42 },  // Th-234 → Pa-234 (β debole)
  { type: 'beta',  weight: 1, mult: 0.30 },  // Pa-234 → U-234 (β molto debole)
];
const URANIO_W = URANIO_CHAIN.reduce((s, e) => s + e.weight, 0);

// ── State ──────────────────────────────────────────────────────────────────────
let beads      = [];       // nuclei condensazione tracce
let trackLines = [];       // percorsi per linee guida  { pts, nSteps, age, type }
let spawnAccum = 0;
let paused     = false;
let dragging   = false;
let hoverSrc   = false;
let readout;

// ── Grafici — stato ────────────────────────────────────────────────────────────
const N_RATE_BINS   = 30;                               // 30 secondi
const rateAlpha     = new Array(N_RATE_BINS).fill(0);
const rateBeta      = new Array(N_RATE_BINS).fill(0);
let   rateAccA      = 0, rateAccB = 0, rateBinT = 0;

const N_RANGE_BINS  = 22;
const rangeHistory  = [];   // { type, range } ultimi 150 decadimenti
const RANGE_H_MAX   = 150;

let gCanvas = [null, null, null];
let gCtx    = [null, null, null];

// ── Mist particles ─────────────────────────────────────────────────────────────
function lcg(s) {
  const x = Math.sin(s * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const N_PART = 720;
const PARTICLES = Array.from({ length: N_PART }, (_, i) => {
  const posAngle = lcg(i * 3.14 + 11) * Math.PI * 2;
  const r        = Math.sqrt(lcg(i * 7.31 + 17)) * 0.93;
  const vAngle   = lcg(i * 13.7 + 99) * Math.PI * 2;
  const vSpeed   = 0.010 + lcg(i * 8.3 + 7) * 0.030;
  const maxAge   = TRACK_LIFE * (0.75 + lcg(i * 5.77 + 33) * 0.50);  // ~6.75–11.25 s
  return {
    nx:  Math.cos(posAngle) * r,
    ny:  Math.sin(posAngle) * r,
    vx:  Math.cos(vAngle) * vSpeed,
    vy:  Math.sin(vAngle) * vSpeed,
    r:   0.24 + lcg(i * 2.17 + 8) * 0.36,
    age: lcg(i * 11.3 + 7) * maxAge,    // stagger iniziale
    maxAge,
  };
});

// ── Chamber geometry ───────────────────────────────────────────────────────────
function chamberMetrics(W, H) {
  return { cx: W * 0.5, cy: H * 0.5, R: Math.min(W, H) * CIRC_R };
}

// ── Track / bead spawning ──────────────────────────────────────────────────────
function pickEmission() {
  const chains = {
    radon:  [RADON_CHAIN,  RADON_W],
    radio:  [RADIO_CHAIN,  RADIO_W],
    uranio: [URANIO_CHAIN, URANIO_W],
  };
  if (chains[P.sourceType]) {
    const [chain, W] = chains[P.sourceType];
    let r = Math.random() * W;
    for (const e of chain) { r -= e.weight; if (r <= 0) return e; }
    return chain[0];
  }
  return { type: P.sourceType, mult: 1.0 };
}

function spawnTrack() {
  const em    = pickEmission();
  const def   = TYPE_DEF[em.type];
  const range = def.baseRange * (em.mult ?? 1) *
                (1 - def.eSpr / 2 + Math.random() * def.eSpr);
  const maxSteps = Math.ceil(range / STEP);
  const curvStep = def.curv * P.bField * def.qSign * STEP;

  let x = srcX, y = srcY;
  let dir = Math.random() * Math.PI * 2;
  const lineBuf = [x, y];   // per trackLines (tutti i passi)

  for (let i = 0; i < maxSteps; i++) {
    // spawna bead ad ogni beadSkip passi
    if (i % def.beadSkip === 0 && Math.random() < def.spawnProb) {
      const va = Math.random() * Math.PI * 2;
      const vs = 0.005 + Math.random() * 0.018;
      // jitter radiale alla nascita: alpha diffusa, beta stretta
      const ja = Math.random() * Math.PI * 2;
      const jr = Math.random() * def.spread;
      beads.push({
        x: x + Math.cos(ja) * jr,
        y: y + Math.sin(ja) * jr,
        vx: Math.cos(va) * vs,
        vy: Math.sin(va) * vs,
        age: 0,
        r:   def.rMin + Math.random() * (def.rMax - def.rMin),
        type: em.type,
      });
    }
    dir += (Math.random() - 0.5) * def.scatter + curvStep;
    x   += Math.cos(dir) * STEP;
    y   += Math.sin(dir) * STEP;
    if (x * x + y * y > 0.93 * 0.93) break;
    lineBuf.push(x, y);
  }

  // limite bead
  if (beads.length > MAX_BEADS) beads.splice(0, beads.length - MAX_BEADS);

  // salva percorso per linee guida
  const nSteps = lineBuf.length / 2;
  if (nSteps >= 2) {
    trackLines.push({ pts: new Float32Array(lineBuf), nSteps, age: 0, type: em.type });
  }

  // stat grafici
  const actualRange = nSteps * STEP;
  if (em.type === 'alpha') rateAccA++;
  else                     rateAccB++;
  rangeHistory.push({ type: em.type, range: actualRange });
  if (rangeHistory.length > RANGE_H_MAX) rangeHistory.shift();
}

// ── Physics loop ───────────────────────────────────────────────────────────────
function loop(dt) {
  if (paused) return;

  spawnAccum += P.activity * dt;
  while (spawnAccum >= 1) { spawnAccum -= 1; spawnTrack(); }

  // avanza bin rate (1 bin/secondo)
  rateBinT += dt;
  if (rateBinT >= 1.0) {
    rateBinT -= 1.0;
    rateAlpha.push(rateAccA); rateAlpha.shift(); rateAccA = 0;
    rateBeta.push(rateAccB);  rateBeta.shift();  rateAccB = 0;
  }

  // ── beads tracce ─────────────────────────────────────
  let wi = 0;
  for (let i = 0; i < beads.length; i++) {
    const b = beads[i];
    b.age += dt;
    if (b.age > TRACK_LIFE || b.x * b.x + b.y * b.y > 0.96) continue;
    b.vx += (Math.random() - 0.5) * 0.006 * dt;
    b.vy += (Math.random() - 0.5) * 0.006 * dt;
    const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    if (spd > 0.050) { b.vx *= 0.050 / spd; b.vy *= 0.050 / spd; }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    beads[wi++] = b;
  }
  beads.length = wi;

  // ── trackLines: aging + pruning ──────────────────────
  let tli = 0;
  for (let i = 0; i < trackLines.length; i++) {
    trackLines[i].age += dt;
    if (trackLines[i].age < TRACK_LIFE) trackLines[tli++] = trackLines[i];
  }
  trackLines.length = tli;

  // ── nebbiolina sfondo — lifecycle con fade ───────────
  for (const p of PARTICLES) {
    p.age += dt;
    p.vx += (Math.random() - 0.5) * 0.006 * dt;
    p.vy += (Math.random() - 0.5) * 0.006 * dt;
    const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    if (spd > 0.050) { p.vx *= 0.050 / spd; p.vy *= 0.050 / spd; }
    p.nx += p.vx * dt;
    p.ny += p.vy * dt;
    // rispawn quando muore per età o esce dal cerchio
    if (p.age >= p.maxAge || p.nx * p.nx + p.ny * p.ny > 0.96) {
      const a  = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * 0.82;
      p.nx = Math.cos(a) * rr;
      p.ny = Math.sin(a) * rr;
      const va = Math.random() * Math.PI * 2;
      p.vx = Math.cos(va) * (0.010 + Math.random() * 0.025);
      p.vy = Math.sin(va) * (0.010 + Math.random() * 0.025);
      p.age    = 0;
      p.maxAge = TRACK_LIFE * (0.75 + Math.random() * 0.50);
    }
  }
}

// ── Scene drawers ──────────────────────────────────────────────────────────────
function drawChamber(ctx, W, H) {
  const { cx, cy, R } = chamberMetrics(W, H);
  const Ro = R * 1.14;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  const ringG = ctx.createRadialGradient(cx - R * 0.18, cy - R * 0.28, R * 0.5, cx, cy, Ro);
  ringG.addColorStop(0, '#1e242e'); ringG.addColorStop(0.6, '#10141a'); ringG.addColorStop(1, '#070a0d');
  ctx.fillStyle = ringG;
  ctx.beginPath(); ctx.arc(cx, cy, Ro, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = 'rgba(120,148,190,0.24)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, R + 1.5, 0, Math.PI * 2); ctx.stroke();

  const gasG = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  gasG.addColorStop(0, '#0a1220'); gasG.addColorStop(0.60, '#07101c'); gasG.addColorStop(1, '#040b14');
  ctx.fillStyle = gasG;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();

  const coldG = ctx.createLinearGradient(cx, cy + R * 0.35, cx, cy + R);
  coldG.addColorStop(0, 'rgba(0,10,35,0)'); coldG.addColorStop(1, 'rgba(5,18,55,0.35)');
  ctx.fillStyle = coldG; ctx.fillRect(cx - R, cy + R * 0.35, R * 2, R * 0.65);

  const ledG = ctx.createLinearGradient(cx, cy + R * 0.72, cx, cy + R);
  ledG.addColorStop(0, 'rgba(180,215,255,0)'); ledG.addColorStop(1, 'rgba(200,230,255,0.18)');
  ctx.fillStyle = ledG; ctx.fillRect(cx - R, cy + R * 0.72, R * 2, R * 0.28);

  const sideG = ctx.createLinearGradient(cx - R, cy, cx + R * 0.3, cy);
  sideG.addColorStop(0, 'rgba(140,180,240,0.06)'); sideG.addColorStop(0.42, 'rgba(150,188,245,0.10)');
  sideG.addColorStop(0.78, 'rgba(90,140,210,0.03)'); sideG.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sideG; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

  const vigG = ctx.createRadialGradient(cx, cy, R * 0.38, cx, cy, R);
  vigG.addColorStop(0, 'rgba(0,0,0,0)'); vigG.addColorStop(1, 'rgba(0,0,0,0.58)');
  ctx.fillStyle = vigG; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  ctx.restore();

  ctx.strokeStyle = 'rgba(195,215,255,0.13)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
}

// Stessa curva di dissoluzione dei bead beta: 5 bucket età/blur/opacità identici.
function drawFineParticles(ctx, W, H) {
  if (P.mistOpacity < 0.01) return;
  const { cx, cy, R } = chamberMetrics(W, H);
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.98, 0, Math.PI * 2); ctx.clip();

  const THRESH  = [0.18, 0.35, 0.52, 0.72];
  const BLUR    = [1.5,  2.0,  2.8,  4.0,  6.0];
  const OPACITY = [0.90, 0.68, 0.44, 0.22, 0.08];
  const NB = 5;
  const bk = Array.from({ length: NB }, () => []);

  for (const p of PARTICLES) {
    if (p.nx * p.nx + p.ny * p.ny > 0.97) continue;
    const f = p.age / p.maxAge;
    if (f >= 1.0) continue;
    const b = f < THRESH[0] ? 0 : f < THRESH[1] ? 1 : f < THRESH[2] ? 2 : f < THRESH[3] ? 3 : 4;
    bk[b].push(p);
  }

  for (let g = 0; g < NB; g++) {
    if (!bk[g].length) continue;
    ctx.save();
    ctx.filter = `blur(${BLUR[g]}px)`;
    ctx.globalAlpha = OPACITY[g] * P.mistOpacity;
    ctx.fillStyle = TYPE_DEF.beta.color;
    ctx.beginPath();
    for (const p of bk[g]) {
      const px = cx + p.nx * R, py = cy + p.ny * R;
      ctx.moveTo(px + p.r, py); ctx.arc(px, py, p.r, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawBField(ctx, W, H) {
  const { cx, cy, R } = chamberMetrics(W, H);
  const GRID  = 44;
  const alpha = Math.min(Math.abs(P.bField) / 3 * 0.28, 0.28);
  const into  = P.bField > 0;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.97, 0, Math.PI * 2); ctx.clip();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = ctx.fillStyle = '#3a5a80'; ctx.lineWidth = 1;
  for (let gx = cx - R + GRID * 0.5; gx < cx + R; gx += GRID) {
    for (let gy = cy - R + GRID * 0.5; gy < cy + R; gy += GRID) {
      const dx = gx - cx, dy = gy - cy;
      if (dx * dx + dy * dy > R * R * 0.93) continue;
      if (into) {
        const s = 5;
        ctx.beginPath();
        ctx.moveTo(gx - s, gy - s); ctx.lineTo(gx + s, gy + s);
        ctx.moveTo(gx + s, gy - s); ctx.lineTo(gx - s, gy + s);
        ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(gx, gy, 2.8, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  ctx.restore();
}

// ── Linee guida tracce ─────────────────────────────────────────────────────────
function drawTrackLines(ctx, W, H) {
  if (!P.showLines || !trackLines.length) return;
  const { cx, cy, R } = chamberMetrics(W, H);
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.97, 0, Math.PI * 2); ctx.clip();
  ctx.lineWidth = 0.7; ctx.lineCap = 'round';

  for (const tl of trackLines) {
    if (tl.nSteps < 2) continue;
    const ageR    = tl.age / TRACK_LIFE;
    const fadeOut = ageR <= 0.18 ? 1.0 : Math.pow(1 - (ageR - 0.18) / 0.82, 2.0);
    if (fadeOut < 0.02) continue;
    ctx.globalAlpha = fadeOut * 0.70;
    ctx.strokeStyle = TYPE_DEF[tl.type].lineColor;
    ctx.beginPath();
    ctx.moveTo(cx + tl.pts[0] * R, cy + tl.pts[1] * R);
    for (let i = 1; i < tl.nSteps; i++) {
      ctx.lineTo(cx + tl.pts[i * 2] * R, cy + tl.pts[i * 2 + 1] * R);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// ── Bead rendering ─────────────────────────────────────────────────────────────
function drawBeadParticles(ctx, W, H) {
  if (!beads.length || P.beadOpacity < 0.01) return;
  const { cx, cy, R } = chamberMetrics(W, H);
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.98, 0, Math.PI * 2); ctx.clip();

  // Blending additivo: bead piccoli ma si sommano → zone dense diventano bianche.
  ctx.globalCompositeOperation = 'lighter';

  const THRESH  = [0.18, 0.35, 0.52, 0.72];
  const BLUR    = [1.5, 2.0, 2.8, 4.0, 6.0];
  const OPACITY = [0.32, 0.20, 0.11, 0.05, 0.015];
  const NB = 5;
  const abk = Array.from({ length: NB }, () => []);
  const bbk = Array.from({ length: NB }, () => []);

  for (const b of beads) {
    if (b.x * b.x + b.y * b.y > 0.97) continue;
    const f  = b.age / TRACK_LIFE;
    const bk = f < THRESH[0] ? 0 : f < THRESH[1] ? 1 : f < THRESH[2] ? 2 : f < THRESH[3] ? 3 : 4;
    (b.type === 'alpha' ? abk : bbk)[bk].push(b);
  }

  const w = Math.min(Math.max((P.beadOpacity - 1.0) / 3.0, 0), 1);
  const mx = (c) => Math.round(c + (255 - c) * w);
  const aFill = `rgb(${mx(245)},${mx(245)},${mx(240)})`;
  const bFill = `rgb(${mx(220)},${mx(240)},255)`;

  for (let bk = 0; bk < NB; bk++) {
    const ha = abk[bk].length > 0;
    const hb = bbk[bk].length > 0;
    if (!ha && !hb) continue;
    ctx.save();
    ctx.filter = `blur(${BLUR[bk]}px)`;
    const opa = OPACITY[bk] * P.beadOpacity;
    if (ha) {
      ctx.globalAlpha = opa;
      ctx.fillStyle   = aFill;
      ctx.beginPath();
      for (const b of abk[bk]) {
        const px = cx + b.x * R, py = cy + b.y * R;
        ctx.moveTo(px + b.r, py); ctx.arc(px, py, b.r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    if (hb) {
      ctx.globalAlpha = opa * 0.82;
      ctx.fillStyle   = bFill;
      ctx.beginPath();
      for (const b of bbk[bk]) {
        const px = cx + b.x * R, py = cy + b.y * R;
        ctx.moveTo(px + b.r, py); ctx.arc(px, py, b.r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}

// ── Source ─────────────────────────────────────────────────────────────────────
function drawSource(ctx, W, H) {
  const { cx, cy, R } = chamberMetrics(W, H);
  const x = cx + srcX * R;
  const y = cy + srcY * R;

  // ago di montaggio
  ctx.strokeStyle = 'rgba(160,168,180,0.65)'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.lineTo(x, y + 18); ctx.stroke();

  // pellet metallico
  const pg = ctx.createRadialGradient(x - 1.8, y - 1.8, 0.5, x, y, 6);
  pg.addColorStop(0, '#d8e2ea'); pg.addColorStop(0.5, '#8a9caa'); pg.addColorStop(1, '#4a5a65');
  ctx.fillStyle = pg;
  ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(30,45,55,0.5)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.arc(x - 2, y - 2, 2, 0, Math.PI * 2); ctx.fill();
}

// ── Grafici ────────────────────────────────────────────────────────────────────
const GC  = 'rgba(100,170,195,0.55)';   // testo/assi grafici
const GA  = 'rgba(240,238,218,0.78)';   // colore alpha
const GB  = 'rgba(185,225,255,0.68)';   // colore beta

// colori dei grafici leggibili in entrambi i temi (nella camera le tracce restano bianche come le vere scie)
const GCA = '#ff9d4d', GCB = '#4fb4ff';
// barre impilate su un riquadro di Lab.panel
function stackBars(ctx, f, n, a, b) {
  const bw = (f.R - f.L) / n;
  for (let i = 0; i < n; i++) {
    const x = f.L + i * bw + 0.5, ya = f.Y(a[i] + b[i]), yb = f.Y(b[i]);
    if (a[i] > 0) { ctx.fillStyle = GCA; ctx.fillRect(x, ya, Math.max(1, bw - 1), yb - ya); }
    if (b[i] > 0) { ctx.fillStyle = GCB; ctx.fillRect(x, yb, Math.max(1, bw - 1), f.B - yb); }
  }
}
// 1: tracce comparse al secondo negli ultimi 30 s (il decadimento è casuale: il conteggio fluttua)
function drawRateGraph() {
  const mx = Lab.niceMax(Math.max(2, ...rateAlpha.map((a, i) => a + rateBeta[i])));
  const g = Lab.panel(gCanvas[0], { title: 'Tracce al secondo (ultimi 30 s)', xr: [-30, 0], xStep: 10, yr: [0, mx], xLabel: 't (s)' });
  if (!g) return; const [ctx, f] = g;
  stackBars(ctx, f, N_RATE_BINS, rateAlpha, rateBeta);
  Lab.legend(ctx, f.L + 8, f.T + 8, [[GCA, 'α'], [GCB, 'β']]);
}
// 2: lunghezza delle tracce: le α hanno percorso breve e quasi uguale, le β lungo e molto variabile
function drawRangeGraph() {
  const binA = new Array(N_RANGE_BINS).fill(0), binB = new Array(N_RANGE_BINS).fill(0);
  for (const r of rangeHistory) { const bi = Math.min(Math.floor(r.range / RANGE_MAX * N_RANGE_BINS), N_RANGE_BINS - 1); (r.type === 'alpha' ? binA : binB)[bi]++; }
  const g = Lab.panel(gCanvas[1], { title: 'Lunghezza delle tracce (conteggi)', xr: [0, 100], xStep: 25, yr: [0, Lab.niceMax(Math.max(2, ...binA.map((a, i) => a + binB[i])))], xLabel: 'lunghezza (% del raggio della camera)' });
  if (!g) return; const [ctx, f] = g;
  stackBars(ctx, f, N_RANGE_BINS, binA, binB);
  Lab.legend(ctx, f.R - 70, f.T + 8, [[GCA, 'α'], [GCB, 'β']]);
}
// 3: gocce di condensazione attualmente visibili per tipo di particella
function drawActiveGraph() {
  let cA = 0, cB = 0; for (const b of beads) { if (b.type === 'alpha') cA++; else cB++; }
  const g = Lab.panel(gCanvas[2], { title: `Gocce visibili ora (totale ${cA + cB})`, xr: [0, 2], xStep: 1e9, xFmt: () => '', yr: [0, Lab.niceMax(Math.max(10, cA, cB) * 1.15)] });
  if (!g) return; const [ctx, f] = g;
  [[cA, GCA, 'da particelle α'], [cB, GCB, 'da particelle β']].forEach(([v, c, l], i) => {
    const x = f.X(i + 0.25), w = f.X(0.5) - f.X(0), y = f.Y(v);
    ctx.fillStyle = c; ctx.fillRect(x, y, w, f.B - y);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '9.5px "Space Mono",monospace'; ctx.fillStyle = f.C.title; ctx.fillText(String(v), x + w / 2, Math.max(f.T + 6, y - 8));
    ctx.font = '9.5px "DM Sans",sans-serif'; ctx.fillStyle = f.C.text; ctx.fillText(l, x + w / 2, f.B + 10);
  });
}

function drawGraphs() {
  drawRateGraph();
  drawRangeGraph();
  drawActiveGraph();
}

// ── Controls ───────────────────────────────────────────────────────────────────
function buildControls() {
  const cont = document.getElementById('controls');
  cont.innerHTML = '';

  // Campione
  const secSrc = Lab.Section('Campione Radioattivo');
  cont.appendChild(secSrc.el);
  secSrc.add(Lab.RadioGroup({
    label: 'Tipo sorgente',
    options: [
      { value: 'alpha',  label: 'Alfa (α)',    hint: 'corte, spesse' },
      { value: 'beta',   label: 'Beta (β)',    hint: 'lunghe, sottili' },
      { value: 'radon',  label: 'Radon-222',   hint: 'catena α/β' },
      { value: 'radio',  label: 'Radio-226',   hint: 'α vari + Po-214 lungo' },
      { value: 'uranio', label: 'Uranio-238',  hint: 'α corte + β deboli' },
    ],
    value: P.sourceType,
    onChange(v) { P.sourceType = v; },
  }));
  secSrc.add(Lab.Slider({
    label: 'Attività', min: 0.1, max: 4, step: 0.1, value: P.activity, unit: ' Bq',
    onChange(v) { P.activity = v; },
  }));
  // Campo B
  const secB = Lab.Section('Campo Magnetico');
  cont.appendChild(secB.el);
  secB.add(Lab.Slider({
    label: 'B perpendicolare', min: -3, max: 3, step: 0.1, value: P.bField, unit: ' T',
    onChange(v) { P.bField = v; },
  }));

  // Visualizzazione
  const secVis = Lab.Section('Visualizzazione');
  cont.appendChild(secVis.el);
  secVis.add(Lab.Slider({
    label: 'Nebbia sfondo', min: 0, max: 3, step: 0.05, value: P.mistOpacity,
    onChange(v) { P.mistOpacity = v; },
  }));
  secVis.add(Lab.Slider({
    label: 'Luminosità tracce', min: 0, max: 3, step: 0.05, value: P.beadOpacity,
    onChange(v) { P.beadOpacity = v; },
  }));
  secVis.add(Lab.Toggle({
    label: 'Linee guida tracce',
    value: P.showLines,
    onChange(v) { P.showLines = v; },
  }));
}

// ── Drag source ────────────────────────────────────────────────────────────────
function normPos(canvas, e) {
  const rect  = canvas.getBoundingClientRect();
  const R_css = Math.min(rect.width, rect.height) * CIRC_R;
  return {
    vx: (e.clientX - rect.left - rect.width  * 0.5) / R_css,
    vy: (e.clientY - rect.top  - rect.height * 0.5) / R_css,
  };
}

function nearSrc(vx, vy, thr = 0.09) {
  const dx = vx - srcX, dy = vy - srcY;
  return dx * dx + dy * dy < thr * thr;
}

function clampSrc(vx, vy) {
  const r = Math.sqrt(vx * vx + vy * vy);
  if (r > 0.86) { vx *= 0.86 / r; vy *= 0.86 / r; }
  srcX = vx; srcY = vy;
}

function initDrag(canvas) {
  canvas.addEventListener('mousedown', e => {
    const { vx, vy } = normPos(canvas, e);
    if (nearSrc(vx, vy)) { dragging = true; canvas.style.cursor = 'grabbing'; }
  });
  canvas.addEventListener('mousemove', e => {
    const { vx, vy } = normPos(canvas, e);
    if (dragging) { clampSrc(vx, vy); }
    else { hoverSrc = nearSrc(vx, vy); canvas.style.cursor = hoverSrc ? 'grab' : 'default'; }
  });
  canvas.addEventListener('mouseup',    () => { dragging = false; canvas.style.cursor = hoverSrc ? 'grab' : 'default'; });
  canvas.addEventListener('mouseleave', () => { dragging = false; });
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const { vx, vy } = normPos(canvas, e.touches[0]);
    if (nearSrc(vx, vy, 0.12)) dragging = true;
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!dragging) return;
    const { vx, vy } = normPos(canvas, e.touches[0]);
    clampSrc(vx, vy);
  }, { passive: false });
  canvas.addEventListener('touchend', () => { dragging = false; });
}

// ── Graph panel init ───────────────────────────────────────────────────────────
function initGraphs() {
  // riga di grafici standard; i titoli sono disegnati dentro i grafici
  gCanvas = Lab.graphPanels(document.getElementById('graphArea'), 3);
  gCtx = gCanvas.map(c => c.getContext('2d'));
}

// ── Init ───────────────────────────────────────────────────────────────────────
function init() {
  Lab.initTheme();
  buildControls();
  initGraphs();

  const simCanvas = document.getElementById('simCanvas');

  readout = new Lab.Readout(document.getElementById('readout'), [
    { key: 'source', label: 'sorgente' },
    { key: 'bfield', label: 'campo magnetico B' },
    { key: 'beads',  label: 'gocce visibili' },
    { key: 'hint',   label: 'come si usa' },
  ]);
  readout.set('hint', 'trascina ● per spostare la sorgente');

  document.getElementById('btnPlay').addEventListener('click', () => {
    paused = !paused;
    document.getElementById('btnPlay').textContent = paused ? '▶  PLAY' : '⏸  PAUSA';
  });
  document.getElementById('btnReset').addEventListener('click', () => {
    beads = []; trackLines = []; spawnAccum = 0;
    rateAlpha.fill(0); rateBeta.fill(0); rateAccA = 0; rateAccB = 0; rateBinT = 0;
    rangeHistory.length = 0;
    srcX = 0.0; srcY = 0.0;
    paused = false;
    document.getElementById('btnPlay').textContent = '⏸  PAUSA';
  });

  initDrag(simCanvas);

  function resize() {
    const area = document.querySelector('.lab-canvas-area');
    if (!area) return;
    const ar = area.getBoundingClientRect();
    const rb = document.getElementById('readout').getBoundingClientRect();
    const ga = document.getElementById('graphArea');
    const gaH = ga ? ga.offsetHeight : 0;
    Lab.hidpi(simCanvas, Math.floor(ar.width), Math.max(60, Math.floor(ar.height - rb.height - gaH - 4)));

    Lab.fitPanels(gCanvas);
  }
  resize();
  new ResizeObserver(resize).observe(document.querySelector('.lab-canvas-area'));

  const SRC_LABELS = { alpha: 'Alfa (α)', beta: 'Beta (β)', radon: 'Radon-222', radio: 'Radio-226', uranio: 'Uranio-238' };
  let last = performance.now();

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    loop(dt);

    const [ctx, W, H] = Lab.ctx2d(simCanvas);
    drawChamber(ctx, W, H);
    drawFineParticles(ctx, W, H);
    if (Math.abs(P.bField) > 0.02) drawBField(ctx, W, H);
    drawTrackLines(ctx, W, H);
    drawBeadParticles(ctx, W, H);
    drawSource(ctx, W, H);
    drawGraphs();

    readout.set('source', SRC_LABELS[P.sourceType]);
    readout.set('bfield', P.bField === 0 ? '0 T'
      : `${P.bField > 0 ? '+' : ''}${Lab.fmt(P.bField,1)} T`);
    readout.set('beads', String(beads.length));
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

window.addEventListener('DOMContentLoaded', init);
