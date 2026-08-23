'use strict';

// ═══ Costanti ═══════════════════════════════════════════════════════════════
const TWO = Math.PI * 2;
// Il sistema di Lorenz è caotico: a differenza di quasi tutti gli altri lab di questo sito (dove
// si è sempre trovata una soluzione in forma chiusa, anche per traiettorie complicate come quella
// del ciclotrone o della forza di Coriolis), qui NON esiste una soluzione analitica — è un fatto
// matematico, non un limite di questa implementazione. Runge-Kutta 4° ordine è quindi la scelta
// onesta, non un ripiego: passo fisso piccolo (`DT_INT`) e ben dentro la regione di stabilità di
// RK4 per tutto l'intervallo di σ,ρ,β ammesso dagli slider.
const DT_INT = 0.006;
const TRAIL_MAX = 6000;
const SCALE_UNIT = 22, Z_CENTER = 25;                             // normalizzazione FISSA scena↔coordinate di Lorenz, tarata sul caso classico ρ=28 — mai ricalcolata su ρ (altrimenti l'effetto della transizione al caos verrebbe nascosto da un continuo riadattamento della vista)

const P = {
  sigma: 10,                // σ, numero di Prandtl
  rho: 28,                   // ρ, numero di Rayleigh (il parametro che porta al caos oltre ρ_c≈24.74)
  beta: 8 / 3,                // β, fattore geometrico
  twin: true,                 // mostra una seconda traiettoria con condizione iniziale perturbata di poco (effetto farfalla)
  epsilonExp: -3,             // perturbazione iniziale = 10^epsilonExp
  speed: 1.0,
  paused: false,
};

let animT = 0, last = 0;
let A = [0.1, 0.1, 0.1], B = [0.1, 0.1, 0.1];
let trailA = [], trailB = [];
let G = {};
let gCanvas = [null, null, null], gCtx = [null, null, null], gTitle = [null, null, null];
let readout;

// ═══ Palette ══════════════════════════════════════════════════════════════════
function dk() { return document.documentElement.dataset.theme !== 'light'; }
function pal() {
  const d = dk();
  return {
    bg: d ? '#06090f' : '#e7edf4', txt: d ? 'rgba(225,238,250,0.96)' : 'rgba(20,40,70,0.95)',
    sub: d ? 'rgba(165,195,220,0.82)' : 'rgba(60,90,125,0.9)', accent: d ? '#00d4ff' : '#0a78b0',
    ring: d ? 'rgba(150,175,205,0.4)' : 'rgba(60,95,130,0.45)', grid: d ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)',
    gBg: d ? 'rgb(3,9,22)' : '#eef2f7', gAxis: d ? 'rgba(100,155,210,0.3)' : 'rgba(40,80,130,0.32)', gText: d ? 'rgba(150,205,225,0.88)' : 'rgba(25,65,105,0.92)',
  };
}
let T = pal();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ═══ Fisica: equazioni di Lorenz, integrate con Runge-Kutta 4 ═══════════════════
// ẋ=σ(y−x)   ẏ=x(ρ−z)−y   ż=xy−βz — nate come modello semplificato della convezione di
// Rayleigh-Bénard (σ=numero di Prandtl, ρ=numero di Rayleigh normalizzato, β=fattore geometrico
// legato al rapporto d'aspetto della cella convettiva), qui usate come il prototipo più famoso di
// sistema caotico a bassa dimensione.
function derivAt(x, y, z) { return [P.sigma * (y - x), x * (P.rho - z) - y, x * y - P.beta * z]; }
function rk4(x, y, z, dt) {
  const [k1x, k1y, k1z] = derivAt(x, y, z);
  const [k2x, k2y, k2z] = derivAt(x + k1x * dt / 2, y + k1y * dt / 2, z + k1z * dt / 2);
  const [k3x, k3y, k3z] = derivAt(x + k2x * dt / 2, y + k2y * dt / 2, z + k2z * dt / 2);
  const [k4x, k4y, k4z] = derivAt(x + k3x * dt, y + k3y * dt, z + k3z * dt);
  return [
    x + dt / 6 * (k1x + 2 * k2x + 2 * k3x + k4x),
    y + dt / 6 * (k1y + 2 * k2y + 2 * k3y + k4y),
    z + dt / 6 * (k1z + 2 * k2z + 2 * k3z + k4z),
  ];
}
// I tre punti fissi hanno soluzione ESATTA (questa parte, a differenza della traiettoria, è chiusa):
// l'origine (sempre) e, per ρ>1, la coppia simmetrica C±=(±√(β(ρ−1)), ±√(β(ρ−1)), ρ−1). La soglia
// di Hopf ρ_c=σ(σ+β+3)/(σ−β−1) (valida per σ>β+1) è la formula classica che segna l'ingresso nel
// regime caotico — anch'essa chiusa, ricalcolata dal vivo su σ,β invece che scritta come "24.74".
function equilibria() {
  if (P.rho <= 1) return { c: null };
  const r = Math.sqrt(P.beta * (P.rho - 1));
  return { c: { plus: [r, r, P.rho - 1], minus: [-r, -r, P.rho - 1] } };
}
function rhoCrit() {
  const denom = P.sigma - P.beta - 1;
  return denom > 0 ? P.sigma * (P.sigma + P.beta + 3) / denom : null;
}
// versione lunga (per la didascalia a schermo, dove c'è spazio) e versione corta (per la barra
// dei readout, a larghezza fissa: un testo lungo lì trabocca e si sovrappone alla cella vicina)
function regimeText() {
  if (P.rho <= 1) return 'punto fisso stabile nell\'origine — nessuna convezione';
  const rc = rhoCrit();
  if (rc === null) return 'regime non lineare (soglia di Hopf non definita per questi σ,β)';
  if (P.rho < rc) return 'due punti fissi stabili — convezione stazionaria, non caotica';
  return 'regime caotico — nessun punto fisso stabile (l\'attrattore di Lorenz)';
}
function regimeShort() {
  if (P.rho <= 1) return 'stabile (origine)';
  const rc = rhoCrit();
  if (rc === null) return 'non lineare';
  return P.rho < rc ? 'stabile (2 punti fissi)' : 'caotico';
}

function newRun() {
  animT = 0;
  const eps = Math.pow(10, P.epsilonExp);
  A = [0.1, 0.1, 0.1];
  B = [0.1 + eps, 0.1, 0.1];
  trailA = [{ t: 0, x: A[0], y: A[1], z: A[2] }];
  trailB = [{ t: 0, x: B[0], y: B[1], z: B[2] }];
}
function step(dtReal) {
  let remaining = dtReal, guard = 0;
  while (remaining > 1e-9 && guard++ < 400) {
    const h = Math.min(DT_INT, remaining);
    A = rk4(A[0], A[1], A[2], h);
    animT += h;
    trailA.push({ t: animT, x: A[0], y: A[1], z: A[2] }); if (trailA.length > TRAIL_MAX) trailA.shift();
    if (P.twin) {
      B = rk4(B[0], B[1], B[2], h);
      trailB.push({ t: animT, x: B[0], y: B[1], z: B[2] }); if (trailB.length > TRAIL_MAX) trailB.shift();
    }
    remaining -= h;
  }
}

// ═══ Rendering 3D (proiezione isometrica orbitale, stesso schema di labs/gyroscope) ═══════════
let cam = { az: -0.5, el: 0.4, zoom: 1 };
let camDrag = null;
function drawGrid(ctx, W, H) {
  ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}
function geom(W, H) {
  const cx = W * 0.52, cy = H * 0.56;
  const S = Math.min(W * 0.85, H * 0.82) * 0.34;
  G = { cx, cy, S, W, H };
}
function proj(v) {
  const ct = Math.cos(cam.az), st = Math.sin(cam.az);
  const x1 = v[0] * ct - v[1] * st, y1 = v[0] * st + v[1] * ct, z1 = v[2];
  const ce = Math.cos(cam.el), se = Math.sin(cam.el);
  const y2 = y1 * ce - z1 * se, z2 = y1 * se + z1 * ce;
  const S = G.S * cam.zoom;
  return { sx: G.cx + x1 * S, sy: G.cy - z2 * S };
}
function toScene(x, y, z) { return [x / SCALE_UNIT, y / SCALE_UNIT, (z - Z_CENTER) / SCALE_UNIT]; }
function drawSphereSmall(ctx, x, y, r, hi, base) {
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = r;
  const grad = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r * 1.05);
  grad.addColorStop(0, hi); grad.addColorStop(1, base);
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, r, 0, TWO); ctx.fill(); ctx.restore();
}
function drawAxes3D(ctx) {
  const L = 1.35, o = proj([0, 0, 0]);
  [{ v: [L, 0, 0], c: 'rgba(255,120,120,0.55)', label: 'x' },
   { v: [0, L, 0], c: 'rgba(120,220,140,0.55)', label: 'y' },
   { v: [0, 0, L], c: 'rgba(120,180,255,0.55)', label: 'z' }].forEach(ax => {
    const p = proj(ax.v);
    ctx.strokeStyle = ax.c; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(o.sx, o.sy); ctx.lineTo(p.sx, p.sy); ctx.stroke();
    ctx.fillStyle = ax.c; ctx.font = 'bold 11px "Space Mono",monospace'; ctx.textAlign = 'center';
    ctx.fillText(ax.label, p.sx, p.sy - 6);
  });
}
function drawEquilibria(ctx) {
  const eq = equilibria();
  const pts = [toScene(0, 0, 0)];
  if (eq.c) { pts.push(toScene(...eq.c.plus)); pts.push(toScene(...eq.c.minus)); }
  ctx.fillStyle = T.sub;
  pts.forEach(v => { const p = proj(v); ctx.beginPath(); ctx.arc(p.sx, p.sy, 3, 0, TWO); ctx.fill(); });
}
function drawTrail(ctx, trail, color) {
  if (trail.length < 2) return;
  ctx.beginPath();
  trail.forEach((p, i) => { const s = proj(toScene(p.x, p.y, p.z)); i ? ctx.lineTo(s.sx, s.sy) : ctx.moveTo(s.sx, s.sy); });
  ctx.strokeStyle = color; ctx.lineWidth = 1.3; ctx.stroke();
}
function drawDot(ctx, p, hi, base) {
  const s = proj(toScene(p[0], p[1], p[2]));
  drawSphereSmall(ctx, s.sx, s.sy, 5, hi, base);
}

function draw(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  T = pal();
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
  drawGrid(ctx, W, H);
  geom(W, H);

  drawAxes3D(ctx);
  drawEquilibria(ctx);
  drawTrail(ctx, trailA, 'rgba(0,212,255,0.85)');
  if (P.twin) drawTrail(ctx, trailB, 'rgba(255,157,77,0.85)');
  drawDot(ctx, A, '#dff4ff', '#00a8d8');
  if (P.twin) drawDot(ctx, B, '#ffe3c2', '#d97a2e');

  ctx.textAlign = 'left';
  ctx.fillStyle = T.accent; ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.fillText('Attrattore di Lorenz', 14, 22);
  ctx.fillStyle = T.txt; ctx.font = '10px "Space Mono",monospace';
  ctx.fillText(`σ=${P.sigma.toFixed(1)}   ρ=${P.rho.toFixed(1)}   β=${P.beta.toFixed(2)}   t=${animT.toFixed(1)} s`, 14, 40);

  ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText(regimeText() + ' — trascina per ruotare la vista', W / 2, H - 10);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
function gBase(ctx, W, H, PAD) {
  ctx.fillStyle = T.gBg; ctx.fillRect(0, 0, W, H);
  const gW = W - PAD.l - PAD.r, gH = H - PAD.t - PAD.b;
  ctx.strokeStyle = T.gAxis; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(PAD.l, PAD.t); ctx.lineTo(PAD.l, PAD.t + gH); ctx.lineTo(PAD.l + gW, PAD.t + gH); ctx.stroke();
  return { gW, gH };
}
// 1: x(t) delle due traiettorie sovrapposte — finestra scorrevole FISSA (12s, mai ricalcolata sui
// parametri): mostra le due curve identiche all'inizio, poi improvvisamente divergenti
const GRAPH_WIN_T = 12;
function drawGraphXY_t() {
  const cv = gCanvas[0]; if (!cv || !cv.width) return;
  const ctx = gCtx[0], W = cv.width, H = cv.height, PAD = { t: 14, b: 16, l: 22, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const XMAX = 26, zero = PAD.t + gH / 2;
  ctx.strokeStyle = T.gAxis; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(PAD.l, zero); ctx.lineTo(PAD.l + gW, zero); ctx.stroke();
  const xOf = t => PAD.l + (t - (animT - GRAPH_WIN_T)) / GRAPH_WIN_T * gW;
  const yOf = v => zero - clamp(v / XMAX, -1, 1) * (gH * 0.46);
  ctx.save(); ctx.beginPath(); ctx.rect(PAD.l, PAD.t, gW, gH); ctx.clip();
  const drawSeries = (trail, col) => {
    ctx.strokeStyle = col; ctx.lineWidth = 1.3; ctx.beginPath();
    let started = false;
    for (let i = 0; i < trail.length; i++) { const p = trail[i]; if (p.t < animT - GRAPH_WIN_T) continue; const x = xOf(p.t), y = yOf(p.x); started ? ctx.lineTo(x, y) : ctx.moveTo(x, y); started = true; }
    ctx.stroke();
  };
  drawSeries(trailA, '#00d4ff');
  if (P.twin) drawSeries(trailB, '#ff9d4d');
  ctx.restore();
  ctx.fillStyle = '#00d4ff'; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('x(t)', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('t (s)', PAD.l + gW - 2, PAD.t + gH - 3);
}
// 2: distanza fra le due traiettorie gemelle, scala logaritmica — dominio X che cresce con animT
// (accettabile: non è il parametro esplorato a determinarlo, è il tempo trascorso; l'effetto di
// σ/ρ/β resta sempre visibile come pendenza/forma della curva, mai nascosto). Asse Y log FISSO
// da 10⁻⁶ (perturbazione minima ammessa) al diametro tipico dell'attrattore.
function drawGraphDivergence() {
  const cv = gCanvas[1]; if (!cv || !cv.width) return;
  const ctx = gCtx[1], W = cv.width, H = cv.height, PAD = { t: 14, b: 14, l: 30, r: 8 };
  if (!P.twin) {
    gBase(ctx, W, H, PAD);
    ctx.fillStyle = T.gText; ctx.font = '8px "Space Mono",monospace'; ctx.textAlign = 'center';
    ctx.fillText('attiva la traiettoria gemella', W / 2, H / 2);
    return;
  }
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const tMax = Math.max(animT, 1), DMIN = 1e-6, DMAX = 60;
  const logMin = Math.log10(DMIN), logMax = Math.log10(DMAX);
  const xOf = t => PAD.l + clamp(t / tMax, 0, 1) * gW;
  const yOf = d => PAD.t + gH - clamp((Math.log10(Math.max(d, DMIN)) - logMin) / (logMax - logMin), 0, 1) * gH;
  ctx.strokeStyle = '#ff9d4d'; ctx.lineWidth = 1.3; ctx.beginPath();
  const n = Math.min(trailA.length, trailB.length);
  for (let i = 0; i < n; i++) {
    const a = trailA[i], b = trailB[i];
    const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    const x = xOf(a.t), y = yOf(d);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('distanza fra gemelle (log)', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('t (s)', PAD.l + gW - 2, PAD.t + gH - 3);
}
// 3: proiezione pulita x–z, il classico profilo "a farfalla" — assi FISSI (range tipico del caso
// ρ=28), coerente con la scelta di non riscalare la vista 3D sui parametri esplorati
function drawGraphButterfly() {
  const cv = gCanvas[2]; if (!cv || !cv.width) return;
  const ctx = gCtx[2], W = cv.width, H = cv.height, PAD = { t: 14, b: 14, l: 14, r: 10 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const XMAX = 26, ZMAX = 50;
  const xOf = x => PAD.l + (x + XMAX) / (2 * XMAX) * gW;
  const yOf = z => PAD.t + gH - clamp(z / ZMAX, 0, 1) * gH;
  const drawSeries = (trail, col) => {
    ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath();
    trail.forEach((p, i) => { const x = xOf(p.x), y = yOf(p.z); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
  };
  drawSeries(trailA, 'rgba(0,212,255,0.7)');
  if (P.twin) drawSeries(trailB, 'rgba(255,157,77,0.6)');
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('x', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('z', PAD.l + gW - 2, PAD.t + gH - 3);
}
function drawGraphs() {
  const titles = ['x(t): traiettorie a confronto', 'Divergenza fra le gemelle', 'Proiezione x–z (farfalla)'];
  for (let i = 0; i < 3; i++) if (gTitle[i]) gTitle[i].textContent = titles[i];
  drawGraphXY_t(); drawGraphDivergence(); drawGraphButterfly();
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls() {
  const cont = document.getElementById('controls'); cont.innerHTML = '';

  const sp = Lab.Section('Parametri'); cont.appendChild(sp.el);
  sp.add(Lab.Slider({ label: 'σ (Prandtl)', min: 1, max: 20, step: 0.5, value: P.sigma, unit: '', onChange(v) { P.sigma = v; newRun(); } }));
  sp.add(Lab.Slider({ label: 'ρ (Rayleigh)', min: 0, max: 50, step: 0.5, value: P.rho, unit: '', onChange(v) { P.rho = v; newRun(); } }));
  sp.add(Lab.Slider({ label: 'β', min: 0.5, max: 5, step: 0.1, value: P.beta, unit: '', onChange(v) { P.beta = v; newRun(); } }));

  const sf = Lab.Section('Effetto farfalla'); cont.appendChild(sf.el);
  sf.add(Lab.Toggle({ label: 'Traiettoria gemella', value: P.twin, onChange(v) { P.twin = v; newRun(); } }));
  sf.add(Lab.Slider({ label: 'Perturbazione iniziale (10^x)', min: -6, max: -1, step: 0.5, value: P.epsilonExp, unit: '', onChange(v) { P.epsilonExp = v; newRun(); } }));
  const bNew = document.createElement('button'); bNew.className = 'ctrl-btn'; bNew.textContent = 'Nuova simulazione';
  bNew.addEventListener('click', () => newRun());
  sf.add(bNew);

  const sv = Lab.Section('Visualizzazione'); cont.appendChild(sv.el);
  sv.add(Lab.Slider({ label: 'Velocità animazione', min: 0.2, max: 3, step: 0.1, value: P.speed, unit: '×', onChange(v) { P.speed = v; } }));
}

function buildReadout() {
  const cont = document.getElementById('readout'); cont.innerHTML = '';
  readout = new Lab.Readout(cont, [
    { key: 'sigma', label: 'σ' },
    { key: 'rho', label: 'ρ' },
    { key: 'beta', label: 'β' },
    { key: 'dist', label: 'Distanza fra gemelle' },
    { key: 't', label: 'Tempo' },
    { key: 'regime', label: 'Regime' },
  ]);
}

function initGraphs() {
  const ga = document.getElementById('graphArea');
  ga.style.cssText = 'display:flex;flex-direction:row;gap:5px;padding:5px 0 3px;height:150px;box-sizing:border-box;border-top:1px solid rgba(100,150,200,0.14);';
  for (let i = 0; i < 3; i++) {
    const panel = document.createElement('div');
    panel.style.cssText = 'flex:1;min-width:0;position:relative;background:rgba(2,7,18,0.8);border:1px solid rgba(100,150,200,0.11);border-radius:4px;overflow:hidden;';
    const title = document.createElement('div'); title.textContent = '';
    title.style.cssText = 'position:absolute;top:3px;left:6px;font-size:8px;color:rgba(100,175,200,0.65);font-family:"Space Mono",monospace;text-transform:uppercase;letter-spacing:0.4px;z-index:1;pointer-events:none;';
    const cv = document.createElement('canvas'); cv.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';
    panel.appendChild(title); panel.appendChild(cv); ga.appendChild(panel);
    gCanvas[i] = cv; gCtx[i] = cv.getContext('2d'); gTitle[i] = title;
  }
}

// ═══ Init ═════════════════════════════════════════════════════════════════════
function init() {
  Lab.initTheme();
  buildControls(); initGraphs(); buildReadout(); newRun();
  const simCanvas = document.getElementById('simCanvas');
  const btnPlay = document.getElementById('btnPlay');
  function syncPlay() { btnPlay.textContent = P.paused ? '▶  AVVIA' : '⏸  PAUSA'; }
  syncPlay();
  btnPlay.addEventListener('click', () => { P.paused = !P.paused; syncPlay(); });
  document.getElementById('btnReset').addEventListener('click', () => {
    P.sigma = 10; P.rho = 28; P.beta = 8 / 3; P.twin = true; P.epsilonExp = -3; P.speed = 1.0; P.paused = false;
    buildControls(); newRun(); syncPlay();
  });

  // telecamera orbitale: trascina per ruotare (azimut/elevazione), rotella per zoomare (stesso schema di labs/gyroscope)
  simCanvas.style.cursor = 'grab';
  simCanvas.addEventListener('pointerdown', e => {
    camDrag = { x: e.clientX, y: e.clientY, az: cam.az, el: cam.el };
    simCanvas.setPointerCapture(e.pointerId);
    simCanvas.style.cursor = 'grabbing';
  });
  simCanvas.addEventListener('pointermove', e => {
    if (!camDrag) return;
    const dx = e.clientX - camDrag.x, dy = e.clientY - camDrag.y;
    cam.az = camDrag.az + dx * 0.008;
    cam.el = clamp(camDrag.el - dy * 0.008, -1.4, 1.4);
  });
  simCanvas.addEventListener('pointerup', () => { camDrag = null; simCanvas.style.cursor = 'grab'; });
  simCanvas.addEventListener('pointercancel', () => { camDrag = null; simCanvas.style.cursor = 'grab'; });
  simCanvas.addEventListener('wheel', e => {
    e.preventDefault();
    cam.zoom = clamp(cam.zoom * (e.deltaY > 0 ? 0.92 : 1.08), 0.4, 3);
  }, { passive: false });

  function resize() {
    const area = document.querySelector('.lab-canvas-area'); if (!area) return;
    const ar = area.getBoundingClientRect();
    const rb = document.getElementById('readout').getBoundingClientRect();
    const ga = document.getElementById('graphArea'); const gaH = ga ? ga.offsetHeight : 0;
    const h = Math.max(240, Math.floor(ar.height - rb.height - gaH - 4));
    simCanvas.style.width = Math.floor(ar.width) + 'px'; simCanvas.style.height = h + 'px';
    simCanvas.width = Math.floor(ar.width); simCanvas.height = h;
    for (const cv of gCanvas) { if (!cv) continue; cv.width = Math.floor(cv.parentElement.clientWidth); cv.height = Math.floor(cv.parentElement.clientHeight); }
  }
  resize();
  new ResizeObserver(resize).observe(document.querySelector('.lab-canvas-area'));
  window.addEventListener('load', resize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);

  last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000; last = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0; dt = Math.min(dt, 0.05);
    if (!P.paused) step(dt * P.speed);
    try {
      draw(simCanvas); drawGraphs();
      readout.set('sigma', P.sigma.toFixed(1));
      readout.set('rho', P.rho.toFixed(1));
      readout.set('beta', P.beta.toFixed(2));
      readout.set('dist', P.twin ? Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]).toExponential(2) : '—');
      readout.set('t', animT.toFixed(1) + ' s');
      readout.set('regime', regimeShort());
    } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
