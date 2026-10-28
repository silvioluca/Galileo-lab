'use strict';

const sc  = document.getElementById('simCanvas');
const ctx = sc.getContext('2d');
const gc  = document.getElementById('graphCanvas');
const gctx = gc.getContext('2d');
const DPR = window.devicePixelRatio || 1;

let SW = 0, SH = 0, GW = 0, GH = 0;
let CX = 0, CY = 0;

Lab.initTheme('themeToggle');
const dk = () => document.documentElement.dataset.theme !== 'light';

// ── Element data ────────────────────────────────────────────────────────
const ELEMENTS = {
  'U-235':  { ν: 2.43, pFast: 0.68, pThermal: 0.84, color: '#4d9fff', energyMeV: 202.5 },
  'Pu-239': { ν: 2.87, pFast: 0.76, pThermal: 0.92, color: '#ff8844', energyMeV: 207.1 },
  'U-233':  { ν: 2.49, pFast: 0.73, pThermal: 0.88, color: '#44dd88', energyMeV: 197.9 },
  'U-238':  { ν: 2.50, pFast: 0.04, pThermal: 0.002,color: '#8899aa', energyMeV: 200.0 },
};

// ── Parameters ──────────────────────────────────────────────────────────
const P = {
  element:    'U-235',
  N:          200,
  enrichment: 90,
  moderator:  false,
  absorber:   0,
  sigma:      1.0,
  nInit:      1,
  speed:      2,
};

// ── Constants ───────────────────────────────────────────────────────────
const NEUTRON_SPEED = 280;   // px / sim-second
const CAPTURE_R     = 10;    // px — effective cross-section radius
const MAX_NEUTRONS  = 2000;
const CELL          = CAPTURE_R * 2.5;

// ── State ───────────────────────────────────────────────────────────────
// Nuclei stored as relative offsets {rx,ry} from CX,CY — survives resize
let nuclei    = [];
let neutrons  = [];
let flashes   = [];
let fragments = [];
let running   = false;
let simT      = 0;
let lastTS    = null;

let totalFissions = 0;
let totalEnergy   = 0;
let nHistory      = [];
let lastHistT     = 0;
let coreTemp      = 0;   // 0 = cold, 1 = white-hot
let genCounts     = [];  // genCounts[g] = neutrons spawned in generation g

function tempColor(t) {
  const stops = [
    [0,    [7,   7,  20]],
    [0.25, [20,  40, 180]],
    [0.55, [230,  80,  10]],
    [0.80, [255,  30,   0]],
    [1.0,  [255, 230, 200]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i], [t1, c1] = stops[i + 1];
    if (t <= t1) {
      const s = (t - t0) / (t1 - t0);
      const r = Math.round(c0[0] + s * (c1[0] - c0[0]));
      const g = Math.round(c0[1] + s * (c1[1] - c0[1]));
      const b = Math.round(c0[2] + s * (c1[2] - c0[2]));
      return '#' + r.toString(16).padStart(2, '0')
                 + g.toString(16).padStart(2, '0')
                 + b.toString(16).padStart(2, '0');
    }
  }
  return '#ffe6c8';
}

// ── Geometry ────────────────────────────────────────────────────────────
function matR() { return Math.min(SW, SH) * 0.37; }
function nucR() {
  const area = Math.PI * matR() ** 2;
  return Math.max(2.5, Math.min(9, Math.sqrt(area / Math.max(1, P.N)) * 0.18));
}

// ── Init nuclei ─────────────────────────────────────────────────────────
function initNuclei() {
  const R = matR();
  nuclei = [];
  for (let i = 0; i < P.N; i++) {
    let rx, ry;
    do { rx = (Math.random() * 2 - 1) * R; ry = (Math.random() * 2 - 1) * R; }
    while (rx * rx + ry * ry > R * R);
    nuclei.push({ rx, ry, state: 'intact' });
  }
  neutrons = []; flashes = []; fragments = [];
  simT = 0; lastHistT = 0;
  totalFissions = 0; totalEnergy = 0;
  nHistory = [{ t: 0, n: 0 }];
  coreTemp = 0; genCounts = [];
  running = false;
}

// ── Spatial hash grid ────────────────────────────────────────────────────
function buildGrid() {
  const R  = matR() + CAPTURE_R * 2;
  const x0 = CX - R, y0 = CY - R;
  const cols = Math.ceil(2 * R / CELL) + 1;
  const grid = new Map();
  for (const nuc of nuclei) {
    if (nuc.state !== 'intact') continue;
    const cx = Math.floor((CX + nuc.rx - x0) / CELL);
    const cy = Math.floor((CY + nuc.ry - y0) / CELL);
    const k  = cy * cols + cx;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(nuc);
  }
  return { grid, x0, y0, cols };
}

function nearbyNuclei(gd, px, py, dx, dy) {
  const { grid, x0, y0, cols } = gd;
  const seen = new Set(), result = [];
  const nS = Math.max(2, Math.ceil(Math.hypot(dx, dy) / (CELL * 0.5)) + 1);
  for (let si = 0; si < nS; si++) {
    const t = nS > 1 ? si / (nS - 1) : 0;
    const bx = Math.floor((px + dx * t - x0) / CELL);
    const by = Math.floor((py + dy * t - y0) / CELL);
    for (let dcx = -1; dcx <= 1; dcx++) {
      for (let dcy = -1; dcy <= 1; dcy++) {
        const cell = grid.get((by + dcy) * cols + (bx + dcx));
        if (!cell) continue;
        for (const nuc of cell) {
          if (!seen.has(nuc)) { seen.add(nuc); result.push(nuc); }
        }
      }
    }
  }
  return result;
}

function segDist(px, py, dx, dy, nx, ny) {
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-10) return Math.hypot(px - nx, py - ny);
  const t = Math.max(0, Math.min(1, ((nx - px) * dx + (ny - py) * dy) / len2));
  return Math.hypot(px + t * dx - nx, py + t * dy - ny);
}

// ── Fission event ────────────────────────────────────────────────────────
function doFission(nuc, gen) {
  const el  = ELEMENTS[P.element];
  const p0  = P.moderator ? el.pThermal : el.pFast;
  const pEff = P.element === 'U-235'
    ? Math.max(0, (P.enrichment / 100) * p0 - (1 - P.enrichment / 100) * 0.08)
    : p0;
  const pFission = pEff * (1 - P.absorber / 100);

  const ax = CX + nuc.rx, ay = CY + nuc.ry;

  if (Math.random() >= pFission) { nuc.state = 'captured'; return; }

  nuc.state = 'split';
  totalFissions++;
  totalEnergy += el.energyMeV;
  coreTemp = Math.min(1, coreTemp + 0.005);

  const νf = Math.floor(el.ν) + (Math.random() < (el.ν % 1) ? 1 : 0);
  const nextGen = gen + 1;
  genCounts[nextGen] = (genCounts[nextGen] || 0) + νf;
  for (let i = 0; i < νf; i++) {
    const a = Math.random() * 2 * Math.PI;
    neutrons.push({ x: ax, y: ay, vx: Math.cos(a) * NEUTRON_SPEED, vy: Math.sin(a) * NEUTRON_SPEED, gen: nextGen, trail: [] });
  }
  flashes.push({ x: ax, y: ay, r: 3, alpha: 1.0 });
  const fa = Math.random() * Math.PI;
  for (const s of [1, -1]) {
    fragments.push({
      x: ax, y: ay,
      vx: Math.cos(fa + s * Math.PI * 0.4) * (70 + Math.random() * 60),
      vy: Math.sin(fa + s * Math.PI * 0.4) * (70 + Math.random() * 60),
      life: 1.0, col: el.color,
    });
  }
  running = true;
}

// ── Fire initial neutrons ────────────────────────────────────────────────
// Spawn uniformly inside the inner 65% of the material to guarantee they
// start well within the escape boundary and immediately hit nuclei.
function fire() {
  const R = matR() * 0.65;
  for (let i = 0; i < P.nInit; i++) {
    const r  = Math.sqrt(Math.random()) * R;
    const sa = Math.random() * 2 * Math.PI;
    const va = Math.random() * 2 * Math.PI;
    neutrons.push({ x: CX + r * Math.cos(sa), y: CY + r * Math.sin(sa), vx: Math.cos(va) * NEUTRON_SPEED, vy: Math.sin(va) * NEUTRON_SPEED, gen: 0, trail: [] });
  }
  running = true;
}

// ── Update ──────────────────────────────────────────────────────────────
function update(dt) {
  const simDt = dt * P.speed;
  simT += simDt;

  const escR = matR() + CAPTURE_R;
  const gd   = buildGrid();
  const dead = [];

  for (let ni = 0; ni < neutrons.length; ni++) {
    const n  = neutrons[ni];
    const dx = n.vx * simDt;
    const dy = n.vy * simDt;
    const nx2 = n.x + dx, ny2 = n.y + dy;

    if ((nx2 - CX) ** 2 + (ny2 - CY) ** 2 > escR * escR) {
      dead.push(ni); continue;
    }

    n.trail.push({ x: n.x, y: n.y });
    if (n.trail.length > 6) n.trail.shift();

    let hit = false;
    for (const nuc of nearbyNuclei(gd, n.x, n.y, dx, dy)) {
      if (nuc.state !== 'intact') continue;
      if (segDist(n.x, n.y, dx, dy, CX + nuc.rx, CY + nuc.ry) < CAPTURE_R * P.sigma) {
        doFission(nuc, n.gen);
        dead.push(ni); hit = true; break;
      }
    }
    if (!hit) { n.x = nx2; n.y = ny2; }
  }

  for (let i = dead.length - 1; i >= 0; i--) neutrons.splice(dead[i], 1);
  if (neutrons.length > MAX_NEUTRONS) neutrons.splice(0, neutrons.length - MAX_NEUTRONS);

  for (const f of flashes)  { f.r += dt * 90;   f.alpha -= dt * 3; }
  flashes   = flashes.filter(f => f.alpha > 0);

  for (const fr of fragments) { fr.x += fr.vx * simDt; fr.y += fr.vy * simDt; fr.life -= dt * 1.5; }
  fragments = fragments.filter(fr => fr.life > 0);

  if (simT - lastHistT > 0.1) {
    nHistory.push({ t: simT, n: neutrons.length });
    lastHistT = simT;
    if (nHistory.length > 900) nHistory.splice(0, 300);
  }
  if (running && neutrons.length === 0 && flashes.length === 0) running = false;
  if (coreTemp > 0) coreTemp *= Math.exp(-simDt * 0.35);
}

// ── k_eff (analytical) ──────────────────────────────────────────────────
function computeKeff() {
  const el   = ELEMENTS[P.element];
  const p0   = P.moderator ? el.pThermal : el.pFast;
  const pEff = P.element === 'U-235'
    ? Math.max(0, (P.enrichment / 100) * p0 - (1 - P.enrichment / 100) * 0.08)
    : p0;
  const pFission = pEff * (1 - P.absorber / 100);
  const R   = matR();
  const mfp = Math.PI * R * R / (P.N * 2 * CAPTURE_R * P.sigma);
  return el.ν * pFission * (1 - Math.exp(-R / mfp));
}

// ── Draw sim ────────────────────────────────────────────────────────────
function drawSim() {
  const dark = dk();
  const bg   = dark ? '#07070f' : '#f0f0f5';
  const fg   = dark ? '#cccccc' : '#333333';
  const el   = ELEMENTS[P.element];

  ctx.save(); ctx.scale(DPR, DPR);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SW, SH);

  const R  = matR();
  const nr = nucR();

  // Temperature-colored core
  if (coreTemp > 0.02) {
    const tc = tempColor(coreTemp);
    const grad = ctx.createRadialGradient(CX, CY, 0, CX, CY, R);
    const aHot = Math.round(coreTemp * 90).toString(16).padStart(2, '0');
    grad.addColorStop(0,   tc + aHot);
    grad.addColorStop(0.6, tc + Math.round(coreTemp * 30).toString(16).padStart(2, '0'));
    grad.addColorStop(1,   tc + '00');
    ctx.beginPath(); ctx.arc(CX, CY, R, 0, 2 * Math.PI);
    ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = tc + Math.round(60 + coreTemp * 120).toString(16).padStart(2, '0');
    ctx.lineWidth = 1.5 + coreTemp * 2.5; ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(CX, CY, R, 0, 2 * Math.PI);
    ctx.strokeStyle = el.color + '30'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle   = el.color + '08'; ctx.fill();
  }

  for (const nuc of nuclei) {
    const nx = CX + nuc.rx, ny = CY + nuc.ry;
    let col, a;
    if      (nuc.state === 'intact')  { col = el.color;  a = 1;    }
    else if (nuc.state === 'split')   { col = '#ff6633'; a = 0.22; }
    else                              { col = '#667788'; a = 0.18; }
    ctx.globalAlpha = a;
    ctx.beginPath(); ctx.arc(nx, ny, nr, 0, 2 * Math.PI);
    ctx.fillStyle = col; ctx.fill();
    ctx.globalAlpha = 1;
  }

  for (const fr of fragments) {
    ctx.globalAlpha = fr.life * 0.85;
    ctx.beginPath(); ctx.arc(fr.x, fr.y, nr * 0.65, 0, 2 * Math.PI);
    ctx.fillStyle = fr.col; ctx.fill();
    ctx.globalAlpha = 1;
  }

  for (const f of flashes) {
    const a = Math.max(0, f.alpha);
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 2 * Math.PI);
    ctx.strokeStyle = `rgba(255,220,60,${a * 0.9})`; ctx.lineWidth = 2; ctx.stroke();
    if (f.r < CAPTURE_R * 2.5) {
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.38, 0, 2 * Math.PI);
      ctx.fillStyle = `rgba(255,255,180,${a * 0.7})`; ctx.fill();
    }
  }

  for (const n of neutrons) {
    for (let i = 0; i < n.trail.length; i++) {
      ctx.globalAlpha = ((i + 1) / n.trail.length) * 0.3;
      ctx.beginPath(); ctx.arc(n.trail[i].x, n.trail[i].y, 1.5, 0, 2 * Math.PI);
      ctx.fillStyle = '#ffffcc'; ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(n.x, n.y, 2.5, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff'; ctx.fill();
  }

  const kVal   = computeKeff();
  const kCol   = kVal > 1.05 ? '#ff4444' : kVal > 0.95 ? '#ffcc00' : '#44cc77';
  const status = kVal > 1.05 ? 'SUPERCRITICO' : kVal > 0.95 ? 'CRITICO' : 'SOTTOCRITICO';
  const intact = nuclei.filter(n => n.state === 'intact').length;
  const energy = totalEnergy > 1000 ? Lab.fmt((totalEnergy / 1000),1) + ' GeV' : Lab.fmt(totalEnergy,0) + ' MeV';

  ctx.textAlign = 'left';
  ctx.font      = `bold 14px 'Space Mono', monospace`;
  ctx.fillStyle = el.color;
  ctx.fillText(P.element, 12, 22);

  ctx.font      = `bold 13px 'Space Mono', monospace`;
  ctx.fillStyle = kCol;
  ctx.fillText(`k_eff ≈ ${Lab.fmt(kVal,2)}`, 12, 42);

  ctx.font      = `10px 'DM Sans', sans-serif`;
  ctx.fillStyle = kCol + 'bb';
  ctx.fillText(status, 12, 57);

  ctx.fillStyle = fg + 'aa';
  ctx.fillText(`Nuclei intatti: ${intact} / ${P.N}`, 12, 73);
  ctx.fillText(`Fissioni: ${totalFissions}`, 12, 87);
  ctx.fillText(`Energia: ${energy}`, 12, 101);
  ctx.fillText(`Neutroni: ${neutrons.length}`, 12, 115);

  // k gauge below the material circle
  const gW = 160, gH = 8;
  const gx = CX - gW / 2, gy = CY + R + 16;
  const kScale = k => Math.max(0, Math.min(1, k / 2));

  ctx.fillStyle = dark ? '#222' : '#ddd';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(gx, gy, gW, gH, 4); else ctx.rect(gx, gy, gW, gH);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(gx, gy, gW, gH, 4); else ctx.rect(gx, gy, gW, gH);
  ctx.clip();
  for (const [from, to, col] of [[0,.9,'#44cc77'],[.9,.98,'#aacc22'],[.98,1.02,'#ffcc00'],[1.02,1.3,'#ff8800'],[1.3,2,'#ff4444']]) {
    ctx.fillStyle = col + '66';
    ctx.fillRect(gx + kScale(from) * gW, gy, (kScale(to) - kScale(from)) * gW, gH);
  }
  ctx.restore();

  const px2 = gx + kScale(kVal) * gW;
  ctx.fillStyle = kCol;
  ctx.beginPath(); ctx.moveTo(px2 - 4, gy - 1); ctx.lineTo(px2 + 4, gy - 1); ctx.lineTo(px2, gy + gH + 3); ctx.closePath(); ctx.fill();

  ctx.textAlign = 'center'; ctx.font = `9px 'DM Sans', sans-serif`; ctx.fillStyle = fg + '55';
  ctx.fillText('0', gx,          gy + gH + 13);
  ctx.fillText('1', gx + gW / 2, gy + gH + 13);
  ctx.fillText('2', gx + gW,     gy + gH + 13);

  ctx.textAlign = 'right'; ctx.font = `10px 'DM Sans', sans-serif`; ctx.fillStyle = fg + '55';
  ctx.fillText(`t = ${Lab.fmt(simT,2)} s`, SW - 10, 18);

  ctx.restore();
}

// ── Draw graph ──────────────────────────────────────────────────────────
function drawGraph() {
  const dark = dk();
  const bg   = dark ? '#111111' : '#ffffff';
  const fg   = dark ? '#cccccc' : '#444444';
  const grid = dark ? '#1e1e1e' : '#eeeeee';

  gctx.save(); gctx.scale(DPR, DPR);
  gctx.fillStyle = bg;
  gctx.fillRect(0, 0, GW, GH);

  const splitX = Math.round(GW * 0.58);

  // ── Left panel: neutrons vs time ─────────────────────────────────────────
  const LP = { l: 44, r: 8, t: 20, b: 28 };
  const lW = splitX - LP.l - LP.r;
  const lH = GH - LP.t - LP.b;
  const tMax = Math.max(simT + 0.5, 5);
  const nMax = nHistory.length >= 2 ? Math.max(20, ...nHistory.map(h => h.n)) * 1.12 : 20;
  const gxL  = t => LP.l + (t / tMax) * lW;
  const gyL  = n => LP.t + (1 - n / nMax) * lH;

  for (const n of [0, Math.round(nMax * 0.5), Math.round(nMax)]) {
    const py = gyL(n);
    gctx.strokeStyle = grid; gctx.lineWidth = 1;
    gctx.beginPath(); gctx.moveTo(LP.l, py); gctx.lineTo(LP.l + lW, py); gctx.stroke();
    gctx.fillStyle = fg + 'aa'; gctx.font = `10px 'Space Mono', monospace`; gctx.textAlign = 'right';
    gctx.fillText(String(n), LP.l - 4, py + 4);
  }
  gctx.strokeStyle = fg + 'bb'; gctx.lineWidth = 1;
  gctx.beginPath();
  gctx.moveTo(LP.l, LP.t); gctx.lineTo(LP.l, LP.t + lH); gctx.lineTo(LP.l + lW, LP.t + lH);
  gctx.stroke();
  gctx.fillStyle = fg + 'aa'; gctx.textAlign = 'left'; gctx.font = `10px 'DM Sans', sans-serif`;
  gctx.fillText('Neutroni vs tempo [s]', LP.l + 4, LP.t + 13);

  if (nHistory.length >= 2) {
    const elColor = ELEMENTS[P.element].color;
    gctx.strokeStyle = elColor; gctx.lineWidth = 2; gctx.beginPath();
    nHistory.forEach((h, i) => { i === 0 ? gctx.moveTo(gxL(h.t), gyL(h.n)) : gctx.lineTo(gxL(h.t), gyL(h.n)); });
    gctx.stroke();
  } else {
    gctx.fillStyle = fg + '33'; gctx.textAlign = 'center'; gctx.font = `11px 'DM Sans', sans-serif`;
    gctx.fillText('Premi AVVIA REAZIONE', LP.l + lW / 2, LP.t + lH / 2);
  }

  // ── Divider ──────────────────────────────────────────────────────────────
  gctx.strokeStyle = grid; gctx.lineWidth = 1;
  gctx.beginPath(); gctx.moveTo(splitX, 6); gctx.lineTo(splitX, GH - 6); gctx.stroke();

  // ── Right panel: generation histogram ────────────────────────────────────
  const RP = { l: splitX + 36, r: 10, t: 20, b: 28 };
  const rW = GW - RP.l - RP.r;
  const rH = GH - RP.t - RP.b;

  const validGens = genCounts.map((c, i) => ({ g: i, c: c || 0 })).filter(e => e.c > 0);
  const maxGen    = validGens.length > 0 ? validGens[validGens.length - 1].g : 8;
  const maxCount  = validGens.length > 0 ? Math.max(...validGens.map(e => e.c)) * 1.12 : 1;
  const numBars   = Math.max(maxGen + 1, 8);
  const barW      = rW / numBars;
  const gyR       = c => RP.t + (1 - c / maxCount) * rH;

  for (const yv of [0, Math.round(maxCount * 0.5), Math.round(maxCount)]) {
    const py = gyR(yv);
    gctx.strokeStyle = grid; gctx.lineWidth = 1;
    gctx.beginPath(); gctx.moveTo(RP.l, py); gctx.lineTo(RP.l + rW, py); gctx.stroke();
    gctx.fillStyle = fg + 'aa'; gctx.font = `10px 'Space Mono', monospace`; gctx.textAlign = 'right';
    gctx.fillText(String(yv), RP.l - 4, py + 4);
  }

  const elColor = ELEMENTS[P.element].color;
  for (let g = 0; g <= maxGen; g++) {
    const count = genCounts[g] || 0;
    if (count === 0) continue;
    const bx = RP.l + g * barW;
    const by = gyR(count);
    const bh = RP.t + rH - by;
    const heat = Math.min(1, g / 12);
    gctx.fillStyle = coreTemp > 0.1 ? tempColor(heat) + 'bb' : elColor + 'bb';
    gctx.fillRect(bx + 1, by, barW - 2, bh);
  }

  gctx.strokeStyle = fg + 'bb'; gctx.lineWidth = 1;
  gctx.beginPath();
  gctx.moveTo(RP.l, RP.t); gctx.lineTo(RP.l, RP.t + rH); gctx.lineTo(RP.l + rW, RP.t + rH);
  gctx.stroke();
  gctx.fillStyle = fg + 'aa'; gctx.textAlign = 'left'; gctx.font = `10px 'DM Sans', sans-serif`;
  gctx.fillText('Generazioni', RP.l + 4, RP.t + 13);

  if (validGens.length === 0) {
    gctx.fillStyle = fg + '33'; gctx.textAlign = 'center';
    gctx.fillText('— in attesa —', RP.l + rW / 2, RP.t + rH / 2);
  } else {
    gctx.fillStyle = fg + '77'; gctx.textAlign = 'center'; gctx.font = `9px 'DM Sans', sans-serif`;
    for (let g = 0; g <= maxGen; g += Math.max(1, Math.floor(numBars / 8))) {
      gctx.fillText(String(g), RP.l + g * barW + barW / 2, RP.t + rH + 14);
    }
  }
  gctx.restore();
}

// ── Readout ─────────────────────────────────────────────────────────────
function updateReadout() {
  const el     = ELEMENTS[P.element];
  const kVal   = computeKeff();
  const kCol   = kVal > 1.05 ? '#ff4444' : kVal > 0.95 ? '#ffcc00' : '#44cc77';
  const status = kVal > 1.05 ? 'Supercritico' : kVal > 0.95 ? 'Critico' : 'Sottocritico';
  const energy = totalEnergy > 1000 ? Lab.fmt((totalEnergy / 1000),1) + ' GeV' : Lab.fmt(totalEnergy,0) + ' MeV';

  document.getElementById('readout').innerHTML = [
    { label: 'elemento',  value: `<span style="color:${el.color}">${P.element}</span>` },
    { label: 'fattore di moltiplicazione k', value: `<span style="color:${kCol}">${Lab.fmt(kVal,3)}</span>` },
    { label: 'regime',    value: `<span style="color:${kCol}">${status}</span>` },
    { label: 'fissioni avvenute', value: totalFissions },
    { label: 'energia liberata', value: energy },
    { label: 'neutroni liberi', value: neutrons.length },
  ].map(r =>
    `<span class="readout-item"><span class="readout-label">${Lab.keepCaseHTML(r.label)}</span><span class="readout-value">${r.value}</span></span>`
  ).join('');
}

// ── Controls ────────────────────────────────────────────────────────────
function buildControls() {
  const ctrl = document.getElementById('controls');
  ctrl.innerHTML = '';

  const mat = Lab.Section('Materiale');
  mat.add(Lab.RadioGroup({
    label: 'Elemento fissile',
    options: [
      { label: 'U-235',  value: 'U-235',  hint: 'ν = 2,43' },
      { label: 'Pu-239', value: 'Pu-239', hint: 'ν = 2,87' },
      { label: 'U-233',  value: 'U-233',  hint: 'ν = 2,49' },
      { label: 'U-238',  value: 'U-238',  hint: 'fertile'   },
    ],
    value: P.element,
    onChange: v => { P.element = v; initNuclei(); buildControls(); },
  }));
  if (P.element === 'U-235') {
    mat.add(Lab.Slider({ label: 'Arricchimento [%]', min: 3, max: 100, step: 1, value: P.enrichment, unit: '%',
      onChange: v => { P.enrichment = v; } }));
  }
  mat.add(Lab.Slider({ label: 'Numero di nuclei N', min: 30, max: 500, step: 10, value: P.N, unit: '',
    onChange: v => { P.N = v; initNuclei(); } }));
  ctrl.appendChild(mat.el);

  const phys = Lab.Section('Fisica del reattore');
  phys.add(Lab.Toggle({ label: 'Moderatore (neutroni termici)', value: P.moderator,
    onChange: v => { P.moderator = v; } }));
  phys.add(Lab.Slider({ label: 'Barre di controllo [%]', min: 0, max: 95, step: 5, value: P.absorber, unit: '%',
    onChange: v => { P.absorber = v; } }));
  phys.add(Lab.Slider({ label: 'Sezione d\'urto σ', min: 0.2, max: 3.0, step: 0.1, value: P.sigma, unit: '×',
    onChange: v => { P.sigma = v; } }));
  ctrl.appendChild(phys.el);

  const sim = Lab.Section('Simulazione');
  sim.add(Lab.Slider({ label: 'Neutroni iniziali', min: 1, max: 10, step: 1, value: P.nInit, unit: '',
    onChange: v => { P.nInit = v; } }));
  sim.add(Lab.Slider({ label: 'Velocità', min: 0.5, max: 10, step: 0.5, value: P.speed, unit: '×',
    onChange: v => { P.speed = v; } }));
  ctrl.appendChild(sim.el);

  const actions = document.createElement('div');
  actions.className = 'panel-actions';
  const fireBtn = document.createElement('button');
  fireBtn.className = 'btn-primary';
  fireBtn.textContent = 'AVVIA REAZIONE';
  fireBtn.addEventListener('click', fire);
  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn-secondary';
  resetBtn.textContent = 'AZZERA MATERIALE';
  resetBtn.addEventListener('click', initNuclei);
  actions.append(fireBtn, resetBtn);
  ctrl.appendChild(actions);
}

// ── Resize ──────────────────────────────────────────────────────────────
function resize() {
  const area = sc.parentElement;
  const ga   = document.getElementById('graphArea');
  const rd   = area.querySelector('.readout-bar');
  const rdH  = rd ? rd.clientHeight || 48 : 48;
  const gaH  = ga ? ga.clientHeight || 190 : 190;

  SW = area.clientWidth;
  SH = Math.max(80, area.clientHeight - gaH - rdH);
  sc.width  = Math.round(SW * DPR); sc.height = Math.round(SH * DPR);
  sc.style.width = SW + 'px';       sc.style.height = SH + 'px';
  CX = SW / 2; CY = SH / 2;

  GW = area.clientWidth; GH = gaH;
  gc.width  = Math.round(GW * DPR); gc.height = Math.round(GH * DPR);
  gc.style.width = GW + 'px';       gc.style.height = GH + 'px';
}

// ── Loop ────────────────────────────────────────────────────────────────
function loop(ts) {
  if (lastTS !== null) {
    const dt = Math.min((ts - lastTS) / 1000, 0.05);
    if (running || flashes.length > 0 || fragments.length > 0) update(dt);
  }
  lastTS = ts;
  drawSim();
  drawGraph();
  updateReadout();
  requestAnimationFrame(loop);
}

function init() {
  resize();
  initNuclei();
  buildControls();
  new ResizeObserver(() => { resize(); initNuclei(); }).observe(sc.parentElement);
  requestAnimationFrame(loop);
}

init();
