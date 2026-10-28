'use strict';

const sc   = document.getElementById('simCanvas');
const ctx  = sc.getContext('2d');
const gc   = document.getElementById('graphCanvas');
const gctx = gc.getContext('2d');
const DPR  = window.devicePixelRatio || 1;

let SW = 0, SH = 0, GW = 0, GH = 0;

Lab.initTheme('themeToggle');
const dk = () => document.documentElement.dataset.theme !== 'light';

// ── Predefined chains ────────────────────────────────────────────────────
// Each chain is an array of steps: { label, color, T12 (sim seconds) }
// Last entry is always stable (T12 = Infinity).
const CHAIN_PRESETS = {
  'personalizzato': null,
  'U-235 → Th-231': [
    { label: 'U-235',  color: '#4d9fff', T12: 20  },
    { label: 'Th-231', color: '#ff8844', T12: 5   },
    { label: 'Pa-231', color: '#44dd88', T12: Infinity },
  ],
  'Ra-226 → Rn-222': [
    { label: 'Ra-226', color: '#ff4488', T12: 24   },
    { label: 'Rn-222', color: '#aa66ff', T12: 6    },
    { label: 'Po-218', color: '#ffcc22', T12: 2    },
    { label: 'Pb-214', color: '#55ddff', T12: Infinity },
  ],
  'Th-234 → Pa-234': [
    { label: 'Th-234', color: '#88ffaa', T12: 18   },
    { label: 'Pa-234', color: '#ffaa33', T12: 4    },
    { label: 'U-234',  color: '#4d9fff', T12: Infinity },
  ],
  'Kr-92 (fissione)': [
    { label: 'Kr-92',  color: '#ff5544', T12: 8   },
    { label: 'Rb-92',  color: '#ff9922', T12: 3   },
    { label: 'Sr-92',  color: '#ffdd22', T12: 1.5 },
    { label: 'Y-92',   color: '#aaffaa', T12: Infinity },
  ],
};

const PRESET_KEYS = Object.keys(CHAIN_PRESETS);

// ── Parameters ──────────────────────────────────────────────────────────
const P = {
  N0:      80,
  preset:  'personalizzato',
  T12:      8,
  T12b:     3,
  steps:    1,    // number of decay steps in custom mode (1 or 2)
  type:    'beta',
  speed:    2,
  logY:    false,
  showAct: false, // show activity A(t) instead of N(t)
};

// ── State ───────────────────────────────────────────────────────────────
let atoms   = [];
let simT    = 0;
let lastTS  = null;
let atomR   = 7;

const HIST_DT = 0.2;
let history   = [];
let lastHistT = -HIST_DT;

const TYPE_COLORS = { alpha: '#ff5533', beta: '#44aaff', gamma: '#ffcc22' };
const TYPE_LABELS = { alpha: 'α', beta: 'β', gamma: 'γ' };

// ── Active chain ────────────────────────────────────────────────────────
// Returns array of steps {label, color, T12}
function activeChain() {
  if (P.preset !== 'personalizzato') return CHAIN_PRESETS[P.preset];
  const steps = [];
  steps.push({ label: 'A', color: '#e84040', T12: P.T12 });
  if (P.steps >= 2) steps.push({ label: 'B', color: TYPE_COLORS[P.type], T12: P.T12b });
  steps.push({ label: P.steps >= 2 ? 'C (stabile)' : 'B (stabile)', color: '#555555', T12: Infinity });
  return steps;
}

// ── Geometry ────────────────────────────────────────────────────────────
function computeAtomR() {
  if (!SW || !SH) return;
  const area = (SW - 40) * (SH - 40);
  atomR = Math.max(3, Math.min(13, Math.sqrt(area / Math.max(1, P.N0)) * 0.22));
}

function atomXY(a) {
  const pad = 22 + atomR * 1.5;
  return [pad + a.ax * (SW - 2 * pad), pad + a.ay * (SH - 2 * pad)];
}

// ── Init atoms ──────────────────────────────────────────────────────────
function initAtoms() {
  const chain = activeChain();
  atoms = [];
  const n    = P.N0;
  const cols = Math.ceil(Math.sqrt(n * 1.6));
  const rows = Math.ceil(n / cols);

  for (let i = 0; i < n; i++) {
    const c  = i % cols, r = Math.floor(i / cols);
    const ax = Math.min(0.99, Math.max(0.01, (c + 0.5 + (Math.random() - 0.5) * 0.5) / cols));
    const ay = Math.min(0.99, Math.max(0.01, (r + 0.5 + (Math.random() - 0.5) * 0.5) / rows));

    // Precompute decay times for each step using exponential variate
    let t = 0;
    const decayTimes = [];
    for (let s = 0; s < chain.length - 1; s++) {
      const lam = Math.LN2 / chain[s].T12;
      t += -Math.log(Math.max(1e-15, Math.random())) / lam;
      decayTimes.push(t);
    }
    decayTimes.push(Infinity); // stable

    atoms.push({ ax, ay, state: 0, decayTimes, flashes: [], particles: [] });
  }
  simT = 0; lastHistT = -HIST_DT;
  const nArr = Array(chain.length).fill(0);
  nArr[0] = n;
  history = [{ t: 0, counts: [...nArr] }];
}

// ── Decay effects ────────────────────────────────────────────────────────
function spawnDecay(a, sx, sy, col) {
  a.flashes.push({ r: atomR * 1.3, alpha: 1.0, col });
  const angle = Math.random() * 2 * Math.PI;
  const speed = 55 + Math.random() * 75;
  a.particles.push({
    x: sx, y: sy,
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    life: 0.55, maxLife: 0.55, col,
  });
}

// ── Update ──────────────────────────────────────────────────────────────
function update(dt) {
  const chain = activeChain();
  const simDt = dt * P.speed;
  simT += simDt;

  for (const a of atoms) {
    const [sx, sy] = atomXY(a);
    while (a.state < chain.length - 1 && simT >= a.decayTimes[a.state]) {
      const col = chain[a.state + 1].color;
      a.state++;
      spawnDecay(a, sx, sy, col);
    }

    for (const f of a.flashes) { f.r += dt * 55; f.alpha -= dt * 2.2; }
    a.flashes = a.flashes.filter(f => f.alpha > 0);

    for (const p of a.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    a.particles = a.particles.filter(p => p.life > 0);
  }

  if (simT - lastHistT >= HIST_DT) {
    const counts = chain.map((_, s) => atoms.filter(a => a.state === s).length);
    history.push({ t: simT, counts });
    lastHistT = simT;
    if (history.length > 1200) history.splice(0, 300);
  }
}

// ── Draw simulation ──────────────────────────────────────────────────────
function drawSim() {
  const chain  = activeChain();
  const dark   = dk();
  const bg     = dark ? '#0d0d0d' : '#f4f4f4';
  const fg     = dark ? '#cccccc' : '#333333';

  ctx.save(); ctx.scale(DPR, DPR);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SW, SH);

  // Particles behind atoms
  for (const a of atoms) {
    for (const p of a.particles) {
      const t     = p.life / p.maxLife;
      const alpha = Math.round(t * 210).toString(16).padStart(2, '0');
      ctx.beginPath(); ctx.arc(p.x, p.y, atomR * 0.48 * t, 0, 2 * Math.PI);
      ctx.fillStyle = p.col + alpha; ctx.fill();
    }
  }

  // Atoms + flash rings
  for (const a of atoms) {
    const [sx, sy] = atomXY(a);
    const col = chain[a.state].color;

    for (const f of a.flashes) {
      const fa    = Math.max(0, Math.min(1, f.alpha));
      const alpha = Math.round(fa * 175).toString(16).padStart(2, '0');
      ctx.beginPath(); ctx.arc(sx, sy, f.r, 0, 2 * Math.PI);
      ctx.strokeStyle = f.col + alpha; ctx.lineWidth = 1.5; ctx.stroke();
    }

    const isStable = a.state === chain.length - 1;
    ctx.globalAlpha = isStable ? 0.28 : 1;
    ctx.beginPath(); ctx.arc(sx, sy, atomR, 0, 2 * Math.PI);
    ctx.fillStyle = col; ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Top-left: counts per state
  ctx.textAlign = 'left';
  let oy = 22;
  for (let s = 0; s < chain.length; s++) {
    const n = atoms.filter(a => a.state === s).length;
    ctx.font      = `bold 12px 'Space Mono', monospace`;
    ctx.fillStyle = chain[s].color;
    ctx.fillText(`${chain[s].label} = ${n}`, 12, oy);
    oy += 18;
  }

  // Top-right: time
  ctx.textAlign = 'right';
  ctx.font      = `11px 'DM Sans', sans-serif`;
  ctx.fillStyle = fg + '77';
  ctx.fillText(`T½ = ${P.preset === 'personalizzato' ? P.T12 + ' s' : chain[0].T12 + ' s'}  ·  t = ${Lab.fmt(simT,1)} s`, SW - 10, 18);

  // Legend bottom-right
  let ly = SH - 10;
  ctx.font = `11px 'DM Sans', sans-serif`;
  for (let s = chain.length - 1; s >= 0; s--) {
    const suffix = s === chain.length - 1 ? ' (stabile)' : s === 0 ? ' (genitore)' : ` (${TYPE_LABELS[P.type]})`;
    ctx.fillStyle = chain[s].color;
    ctx.fillText(`● ${chain[s].label}${suffix}`, SW - 10, ly);
    ly -= 17;
  }

  ctx.restore();
}

// ── Draw graph ──────────────────────────────────────────────────────────
function drawGraph() {
  const chain = activeChain();
  const dark  = dk();
  const bg    = dark ? '#111111' : '#ffffff';
  const fg    = dark ? '#cccccc' : '#444444';
  const grid  = dark ? '#1e1e1e' : '#eeeeee';

  gctx.save(); gctx.scale(DPR, DPR);
  gctx.fillStyle = bg;
  gctx.fillRect(0, 0, GW, GH);

  // Panel split: left=N(t) or A(t), right=activity bar if showing N(t)
  const splitX = P.showAct ? GW : Math.round(GW * 0.62);

  // ── Left: N(t) or A(t) vs time ──────────────────────────────────────────
  const LP = { l: 44, r: P.showAct ? 14 : 8, t: 20, b: 30 };
  const lW  = splitX - LP.l - LP.r;
  const lH  = GH - LP.t - LP.b;
  const xMax = Math.max(simT + chain[0].T12 * 0.5, chain[0].T12 * 3);
  const gxL  = t => LP.l + (t / xMax) * lW;

  // Y mapping depends on showAct mode
  const lA  = Math.LN2 / chain[0].T12;
  let yMax, gyL, yLabel;
  if (P.showAct) {
    const aMax = lA * P.N0 * 1.12;
    yMax  = aMax;
    gyL   = a => LP.t + (1 - a / aMax) * lH;
    yLabel = 'Attività A(t) [λN]';
  } else {
    yMax  = P.N0;
    gyL   = (n, logY) => {
      if (P.logY) {
        const yHi = Math.log10(P.N0 + 1), yLo = Math.log10(0.5);
        return LP.t + (1 - (Math.log10(Math.max(0.5, n)) - yLo) / (yHi - yLo)) * lH;
      }
      return LP.t + (1 - n / P.N0) * lH;
    };
    yLabel = P.chain ? 'N_i(t) per isotopo' : 'N_A(t) vs tempo';
  }

  const yTicks = P.showAct
    ? [0, Math.round(yMax * 0.5 * 10) / 10, Math.round(yMax * 10) / 10]
    : P.logY
      ? [1, 2, 5, 10, 20, 50, 100, 200].filter(v => v <= P.N0)
      : [0, Math.round(P.N0 * 0.25), Math.round(P.N0 * 0.5), Math.round(P.N0 * 0.75), P.N0];

  gctx.font = `10px 'Space Mono', monospace`; gctx.textAlign = 'right';
  for (const y of yTicks) {
    const py = P.showAct ? gyL(y) : gyL(y, P.logY);
    gctx.strokeStyle = grid; gctx.lineWidth = 1;
    gctx.beginPath(); gctx.moveTo(LP.l, py); gctx.lineTo(LP.l + lW, py); gctx.stroke();
    gctx.fillStyle = fg + 'aa';
    gctx.fillText(P.showAct ? Lab.fmt(y,1) : String(y), LP.l - 4, py + 4);
  }

  // T½ markers (only for non-activity mode)
  if (!P.showAct) {
    gctx.setLineDash([3, 4]); gctx.strokeStyle = fg + '33'; gctx.lineWidth = 1;
    gctx.font = `9px 'DM Sans', sans-serif`; gctx.textAlign = 'center'; gctx.fillStyle = fg + '55';
    for (let k = 1; k * chain[0].T12 <= xMax + 0.01; k++) {
      const px = gxL(k * chain[0].T12);
      if (px < LP.l || px > LP.l + lW) continue;
      gctx.beginPath(); gctx.moveTo(px, LP.t); gctx.lineTo(px, LP.t + lH); gctx.stroke();
      gctx.fillText(`${k}T½`, px, LP.t + lH + 20);
    }
    gctx.setLineDash([]);
  }

  // Theoretical curves (always visible)
  if (P.showAct) {
    // Theoretical A(t) = λ·N₀·e^(−λt)
    gctx.strokeStyle = chain[0].color + '55'; gctx.lineWidth = 1.5; gctx.setLineDash([5, 4]);
    gctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const t = (i / 120) * xMax;
      const a = lA * P.N0 * Math.exp(-lA * t);
      i === 0 ? gctx.moveTo(gxL(t), gyL(a)) : gctx.lineTo(gxL(t), gyL(a));
    }
    gctx.stroke(); gctx.setLineDash([]);
  } else {
    // Theoretical N(t) for each step
    for (let s = 0; s < chain.length - 1; s++) {
      const col = chain[s].color;
      const lam = Math.LN2 / chain[s].T12;
      gctx.strokeStyle = col + '55'; gctx.lineWidth = 1.5; gctx.setLineDash([5, 4]);
      gctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const t = (i / 120) * xMax;
        const n = s === 0
          ? P.N0 * Math.exp(-lam * t)
          : (() => {
              const l0 = Math.LN2 / chain[0].T12, l1 = Math.LN2 / chain[s].T12;
              return Math.abs(l1 - l0) > 0.001
                ? P.N0 * (l0 / (l1 - l0)) * (Math.exp(-l0 * t) - Math.exp(-l1 * t))
                : 0;
            })();
        const py = gyL(Math.max(0, n), P.logY);
        i === 0 ? gctx.moveTo(gxL(t), py) : gctx.lineTo(gxL(t), py);
      }
      gctx.stroke(); gctx.setLineDash([]);
    }
  }

  // Actual simulation curves
  if (history.length >= 2) {
    for (let s = 0; s < chain.length - 1; s++) {
      gctx.strokeStyle = chain[s].color; gctx.lineWidth = 2; gctx.beginPath();
      history.forEach((h, i) => {
        const val = P.showAct
          ? (Math.LN2 / chain[s].T12) * h.counts[s]
          : h.counts[s];
        const py  = P.showAct ? gyL(val) : gyL(val, P.logY);
        i === 0 ? gctx.moveTo(gxL(h.t), py) : gctx.lineTo(gxL(h.t), py);
      });
      gctx.stroke();
    }
  }

  // Axes + title
  gctx.strokeStyle = fg + 'bb'; gctx.lineWidth = 1;
  gctx.beginPath();
  gctx.moveTo(LP.l, LP.t); gctx.lineTo(LP.l, LP.t + lH); gctx.lineTo(LP.l + lW, LP.t + lH);
  gctx.stroke();
  gctx.fillStyle = fg + 'aa'; gctx.textAlign = 'left'; gctx.font = `10px 'DM Sans', sans-serif`;
  gctx.fillText(yLabel, LP.l + 4, LP.t + 13);

  if (P.showAct) { gctx.restore(); return; }

  // ── Divider ──────────────────────────────────────────────────────────────
  gctx.strokeStyle = grid; gctx.lineWidth = 1;
  gctx.beginPath(); gctx.moveTo(splitX, 6); gctx.lineTo(splitX, GH - 6); gctx.stroke();

  // ── Right: A(t) bar chart ────────────────────────────────────────────────
  const RP = { l: splitX + 32, r: 10, t: 20, b: 30 };
  const rW  = GW - RP.l - RP.r;
  const rH  = GH - RP.t - RP.b;

  // Current activity per state
  const curCounts = chain.map((_, s) => atoms.filter(a => a.state === s).length);
  const activities = chain.map((step, s) =>
    step.T12 === Infinity ? 0 : (Math.LN2 / step.T12) * curCounts[s]
  );
  const aMax = Math.max(lA * P.N0 * 1.1, ...activities) * 1.12;
  const gyR  = a => RP.t + (1 - a / aMax) * rH;
  const nActive = chain.length - 1;
  const barW = rW / nActive;

  for (const av of [0, Math.round(aMax * 0.5 * 10) / 10, Math.round(aMax * 10) / 10]) {
    const py = gyR(av);
    gctx.strokeStyle = grid; gctx.lineWidth = 1;
    gctx.beginPath(); gctx.moveTo(RP.l, py); gctx.lineTo(RP.l + rW, py); gctx.stroke();
    gctx.fillStyle = fg + 'aa'; gctx.font = `9px 'Space Mono', monospace`; gctx.textAlign = 'right';
    gctx.fillText(Lab.fmt(av,1), RP.l - 4, py + 4);
  }

  for (let s = 0; s < nActive; s++) {
    const bx = RP.l + s * barW;
    const by = gyR(activities[s]);
    const bh = RP.t + rH - by;
    gctx.fillStyle = chain[s].color + 'cc';
    gctx.fillRect(bx + 2, by, barW - 4, bh);
    gctx.fillStyle = fg + 'aa'; gctx.textAlign = 'center'; gctx.font = `9px 'DM Sans', sans-serif`;
    gctx.fillText(chain[s].label, bx + barW / 2, RP.t + rH + 14);
  }

  gctx.strokeStyle = fg + 'bb'; gctx.lineWidth = 1;
  gctx.beginPath();
  gctx.moveTo(RP.l, RP.t); gctx.lineTo(RP.l, RP.t + rH); gctx.lineTo(RP.l + rW, RP.t + rH);
  gctx.stroke();
  gctx.fillStyle = fg + 'aa'; gctx.textAlign = 'left'; gctx.font = `10px 'DM Sans', sans-serif`;
  gctx.fillText('Attività A(t) = λN', RP.l + 4, RP.t + 13);

  gctx.restore();
}

// ── Readout ─────────────────────────────────────────────────────────────
function updateReadout() {
  const chain   = activeChain();
  const lA      = Math.LN2 / chain[0].T12;
  const nA      = atoms.filter(a => a.state === 0).length;
  const actA    = lA * nA;
  const thA     = Lab.fmt((P.N0 * Math.exp(-lA * simT)),1);

  const items = [
    { label: 'nuclei genitori N', value: `<span style="color:${chain[0].color}">${nA}</span> <span style="opacity:.5">/ ${P.N0}</span>` },
    { label: 'N teorico N₀·e^(−λt)', value: thA },
    { label: 'attività A = λN', value: `${Lab.fmt(actA,2)} Bq` },
    { label: 'tempo t', value: Lab.fmt(simT,2) + ' s' },
    { label: 'tempo di dimezzamento', value: Lab.fmt(chain[0].T12, 1) + ' s' },
  ];

  for (let s = 1; s < chain.length - 1; s++) {
    const n = atoms.filter(a => a.state === s).length;
    items.splice(s, 0, { label: `N (${chain[s].label})`, value: `<span style="color:${chain[s].color}">${n}</span>` });
  }

  document.getElementById('readout').innerHTML = items
    .map(r => `<span class="readout-item"><span class="readout-label">${Lab.keepCaseHTML(r.label)}</span><span class="readout-value">${r.value}</span></span>`)
    .join('');
}

// ── Controls ────────────────────────────────────────────────────────────
function buildControls() {
  const ctrl = document.getElementById('controls');
  ctrl.innerHTML = '';

  const atomi = Lab.Section('Atomi');
  atomi.add(Lab.Slider({ label: 'Numero atomi N₀', min: 10, max: 250, step: 10, value: P.N0, unit: '',
    onChange: v => { P.N0 = v; computeAtomR(); initAtoms(); } }));
  ctrl.appendChild(atomi.el);

  const catena = Lab.Section('Catena di decadimento');
  catena.add(Lab.RadioGroup({
    label: 'Preset catena',
    options: PRESET_KEYS.map(k => ({ label: k, value: k })),
    value: P.preset,
    onChange: v => { P.preset = v; initAtoms(); buildControls(); },
  }));

  if (P.preset === 'personalizzato') {
    catena.add(Lab.Slider({ label: 'Emivita T½_A [s]', min: 1, max: 30, step: 0.5, value: P.T12, unit: ' s',
      onChange: v => { P.T12 = v; initAtoms(); } }));
    catena.add(Lab.RadioGroup({
      label: 'Tipo di decadimento',
      options: [
        { label: 'α  (alfa)',  value: 'alpha', hint: 'nucleo He-4' },
        { label: 'β  (beta)',  value: 'beta',  hint: 'elettrone'   },
        { label: 'γ  (gamma)', value: 'gamma', hint: 'fotone'      },
      ],
      value: P.type,
      onChange: v => { P.type = v; initAtoms(); },
    }));
    catena.add(Lab.Toggle({ label: 'Catena A → B → stabile', value: P.steps >= 2,
      onChange: v => { P.steps = v ? 2 : 1; initAtoms(); buildControls(); } }));
    if (P.steps >= 2) {
      catena.add(Lab.Slider({ label: 'Emivita T½_B [s]', min: 0.5, max: 30, step: 0.5, value: P.T12b, unit: ' s',
        onChange: v => { P.T12b = v; initAtoms(); } }));
    }
  }
  ctrl.appendChild(catena.el);

  const sim = Lab.Section('Simulazione');
  sim.add(Lab.Slider({ label: 'Velocità', min: 0.2, max: 20, step: 0.2, value: P.speed, unit: '×',
    onChange: v => { P.speed = v; } }));
  sim.add(Lab.Toggle({ label: 'Scala logaritmica Y', value: P.logY,
    onChange: v => { P.logY = v; } }));
  sim.add(Lab.Toggle({ label: 'Mostra A(t) nel grafico', value: P.showAct,
    onChange: v => { P.showAct = v; } }));
  ctrl.appendChild(sim.el);

  const actions = document.createElement('div');
  actions.className = 'panel-actions';
  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn-primary';
  resetBtn.textContent = 'AZZERA SIMULAZIONE';
  resetBtn.addEventListener('click', () => { computeAtomR(); initAtoms(); });
  actions.appendChild(resetBtn);
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

  GW = area.clientWidth; GH = gaH;
  gc.width  = Math.round(GW * DPR); gc.height = Math.round(GH * DPR);
  gc.style.width = GW + 'px';       gc.style.height = GH + 'px';

  computeAtomR();
  for (const a of atoms) { a.flashes = []; a.particles = []; }
}

// ── Loop ────────────────────────────────────────────────────────────────
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
  initAtoms();
  buildControls();
  new ResizeObserver(resize).observe(sc.parentElement);
  requestAnimationFrame(loop);
}

init();
