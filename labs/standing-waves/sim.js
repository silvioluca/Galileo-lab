'use strict';

// Onde stazionarie forzate e smorzate.
// Un estremo è mosso da una forzante sinusoidale di frequenza f (vibratore per la corda, pistone o
// altoparlante per i tubi); l'altro estremo riflette l'onda. La soluzione di regime si scrive in
// forma chiusa con un numero d'onda complesso κ = k − iα (α = attenuazione per metro):
//   corda fissata:        Y(x) = sin κ(L−x) / sin κL
//   tubo chiuso–aperto:   Y(x) = cos κ(L−x) / cos κL
//   tubo aperto–aperto:   Y(x) = cos κ(L−x) / sin κL · tanh kL
// Y è l'ampiezza (complessa) dello spostamento rispetto a quella della forzante. Quando il
// denominatore si annulla (sin kL = 0 o cos kL = 0) l'onda riflessa si somma in fase con quella
// emessa: è la risonanza, e l'amplificazione vale circa 1/(αL) = 2Q/π.

const canvas    = document.getElementById('simCanvas');
const ctx       = canvas.getContext('2d');
const gCanvas   = document.getElementById('graphCanvas');
const gctx      = gCanvas.getContext('2d');
const graphArea = document.getElementById('graphArea');
const readoutEl = document.getElementById('readout');
let SW = 0, SH = 0, GW = 0, GH = 0, DPR = 1;

const P = {
  type: 'string',     // 'string' | 'closed-open' | 'open-open'
  length: 2.0,        // m (si parte dalla lunghezza massima)
  tension: 40,        // N    (corda)
  mu: 0.005,          // kg/m (corda)
  tempC: 20,          // °C   (tubi: velocità del suono)
  freq: 89.4,         // Hz   frequenza della forzante
  Q: 12,              // fattore di qualità
  fScale: 100,        // Hz   fondo scala dei grafici (fisso, scelto dall'utente)
  slowHz: 1.0,        // oscillazioni mostrate al secondo (rallentatore)
  envelope: true,
  pressure: true,
  sweep: false,
  sound: false,
};
const Q_MAX = 20;
const L_MAX = 2;        // m, lunghezza massima: fissa la scala orizzontale della scena
const G_REF = 2 * Q_MAX / Math.PI * 1.08;   // fondo scala fisso dell'amplificazione
// frequenza massima della forzante e fondi scala: la corda arriva a 100 Hz, i tubi a 2 kHz
const fMax = () => (P.type === 'string' ? 100 : 2000);
const scales = () => (P.type === 'string' ? [25, 50, 100] : [250, 500, 1000, 2000]);

// ── Fisica ───────────────────────────────────────────────────────────────────
function waveSpeed() {
  if (P.type === 'string') return Math.sqrt(P.tension / P.mu);
  return 331.3 * Math.sqrt(1 + P.tempC / 273.15);
}
// attenuazione α: scelta in modo che il picco di risonanza valga 2Q/π per ogni modo
const alphaDamp = () => Math.PI / (2 * P.Q * P.length);
// larghezza a metà potenza dei picchi (uguale per tutti i modi)
const peakWidth = () => alphaDamp() * waveSpeed() / Math.PI;

function resonances(count = 14) {
  const v = waveSpeed(), L = P.length, out = [];
  for (let j = 1; j <= count; j++) {
    if (P.type === 'closed-open') out.push({ n: 2 * j - 1, f: (2 * j - 1) * v / (4 * L) });
    else out.push({ n: j, f: j * v / (2 * L) });
  }
  return out;
}
function nearestResonance(f) {
  const v = waveSpeed(), L = P.length;
  if (P.type === 'closed-open') {
    const j = Math.max(1, Math.round((f * 4 * L / v + 1) / 2));
    return { n: 2 * j - 1, f: (2 * j - 1) * v / (4 * L) };
  }
  const n = Math.max(1, Math.round(f * 2 * L / v));
  return { n, f: n * v / (2 * L) };
}

const csin = (a, b) => [Math.sin(a) * Math.cosh(b), Math.cos(a) * Math.sinh(b)];
const ccos = (a, b) => [Math.cos(a) * Math.cosh(b), -Math.sin(a) * Math.sinh(b)];
function cdiv(p, q) {
  const m = q[0] * q[0] + q[1] * q[1];
  return [(p[0] * q[0] + p[1] * q[1]) / m, (p[1] * q[0] - p[0] * q[1]) / m];
}

// ampiezza complessa dello spostamento in u = x/L, relativa alla forzante
function response(f, u, v = waveSpeed(), al = alphaDamp()) {
  const L = P.length, k = 2 * Math.PI * f / v, s = L * (1 - u);
  if (P.type === 'string') return cdiv(csin(k * s, -al * s), csin(k * L, -al * L));
  if (P.type === 'closed-open') return cdiv(ccos(k * s, -al * s), ccos(k * L, -al * L));
  // l'altoparlante davanti a un'estremità aperta non spinge aria a frequenza molto bassa
  const r = cdiv(ccos(k * s, -al * s), csin(k * L, -al * L)), t = Math.tanh(k * L);
  return [r[0] * t, r[1] * t];
}
// amplificazione: massimo di |Y| lungo il sistema
function gainAt(f) {
  const v = waveSpeed(), al = alphaDamp();
  let g = 0;
  for (let i = 0; i <= 64; i++) { const y = response(f, i / 64, v, al); g = Math.max(g, Math.hypot(y[0], y[1])); }
  return g;
}

// nodi e ventri del modo n (posizioni u = x/L)
function nodesAndAntinodes(n) {
  const m = P.type === 'closed-open' ? n / 2 : n;   // kL/π del modo
  const sinShape = P.type === 'string';
  const nodes = [], anti = [];
  for (let j = 0; j <= 2 * m + 1; j++) {
    const s = j / (2 * m);                      // (1−u) a passi di mezzo λ/2
    if (s > 1 + 1e-9) break;
    const u = Math.max(0, 1 - s);
    ((j % 2 === 0) === sinShape ? nodes : anti).push(u);
  }
  return { nodes, anti };
}

// ── Stato dell'animazione ─────────────────────────────────────────────────────
let running = true, lastMs = 0;
let profile = null;     // { N, re[], im[], pre[], pim[], gain }

function computeProfile() {
  const v = waveSpeed(), al = alphaDamp(), k = 2 * Math.PI * P.freq / v;
  const N = Math.min(2400, Math.max(300, Math.ceil(k * P.length / Math.PI * 24)));
  const re = new Float64Array(N + 1), im = new Float64Array(N + 1);
  let gain = 0;
  for (let i = 0; i <= N; i++) {
    const y = response(P.freq, i / N, v, al);
    re[i] = y[0]; im[i] = y[1]; gain = Math.max(gain, Math.hypot(y[0], y[1]));
  }
  // pressione acustica p = −(1/k) ∂s/∂x: stessa unità dello spostamento, sfasata di un quarto di λ
  const pre = new Float64Array(N + 1), pim = new Float64Array(N + 1);
  const scale = N / (P.length * Math.max(k, 1e-6));
  for (let i = 0; i <= N; i++) {
    const a = Math.max(0, i - 1), b = Math.min(N, i + 1);
    pre[i] = -(re[b] - re[a]) / (b - a) * scale;
    pim[i] = -(im[b] - im[a]) / (b - a) * scale;
  }
  profile = { N, re, im, pre, pim, gain };
}

// ── Colori e testo ───────────────────────────────────────────────────────────
function getCSSVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
let C = {};
function getColors() {
  const light = document.documentElement.dataset.theme === 'light';
  return {
    light,
    bg: getCSSVar('--bg1') || '#060a10', panel: getCSSVar('--bg2') || '#0b1018', bg3: getCSSVar('--bg3') || '#111820',
    text: getCSSVar('--text-primary') || '#ddeeff', muted: getCSSVar('--text-secondary') || '#6b8099',
    accent: getCSSVar('--accent') || '#00d4ff', amber: getCSSVar('--accent-amber') || '#ffb400',
    green: getCSSVar('--accent-green') || '#2ecc71', red: getCSSVar('--accent-red') || '#ff4757',
    grid: light ? 'rgba(0,0,0,0.13)' : 'rgba(255,255,255,0.11)',
    soft: light ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)',
    metal: light ? '#8a98a8' : '#5d6e82',
  };
}
function text(c, str, x, y, { color = C.text, size = 11, align = 'center', bold = false, mono = false } = {}) {
  c.fillStyle = color;
  c.font = `${bold ? '700 ' : ''}${size}px ${mono ? 'Space Mono, monospace' : 'DM Sans, sans-serif'}`;
  c.textAlign = align; c.textBaseline = 'middle';
  c.fillText(str, x, y + size * 0.06);
}
function card(c, x, y, w, h, title) {
  c.fillStyle = C.panel; c.strokeStyle = C.grid; c.lineWidth = 1;
  c.beginPath(); c.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 8); c.fill(); c.stroke();
  if (title) text(c, title, x + 12, y + 14, { size: 10.5, color: C.muted, align: 'left' });
}
const fmt = (v, d = 1) => Lab.fmt(v, d);
const fmtLen = m => m >= 1 ? `${fmt(m, 2)} m` : `${Math.round(m * 100)} cm`;
const fmtHz = f => f >= 1000 ? `${fmt(f / 1000, 2)} kHz` : `${fmt(f, f < 100 ? 1 : 0)} Hz`;
const SYSTEM_NAME = { string: 'Corda fissata (esperimento di Melde)', 'closed-open': 'Tubo chiuso–aperto', 'open-open': 'Tubo aperto–aperto' };

// ── Layout ───────────────────────────────────────────────────────────────────
function resize() {
  DPR = window.devicePixelRatio || 1;
  const area = canvas.parentElement;
  const avail = area.clientHeight - (readoutEl.offsetHeight || 56);
  const gh = Math.round(Math.max(160, Math.min(270, avail * 0.4, avail - 260)));
  graphArea.style.height = gh + 'px'; graphArea.style.minHeight = '0';
  SW = area.clientWidth;
  SH = Math.max(0, area.clientHeight - gh - (readoutEl.offsetHeight || 0));
  canvas.width = Math.round(SW * DPR); canvas.height = Math.round(SH * DPR);
  canvas.style.width = SW + 'px'; canvas.style.height = SH + 'px';
  GW = graphArea.clientWidth; GH = graphArea.clientHeight;
  gCanvas.width = Math.round(GW * DPR); gCanvas.height = Math.round(GH * DPR);
  gCanvas.style.width = GW + 'px'; gCanvas.style.height = GH + 'px';
}

// ── Scena ────────────────────────────────────────────────────────────────────
// spostamento istantaneo (in unità della forzante) e pressione nel punto i del profilo
// ── Simulazione nel tempo ────────────────────────────────────────────────────
// L'equazione delle onde smorzata  y_tt + 2γ y_t = v² y_xx  (γ = α·v) integrata alle differenze
// finite. Così si vede davvero cosa succede: l'onda parte dalla forzante, si riflette, e solo dopo
// alcuni tempi di smorzamento si arriva al regime. Fuori risonanza l'onda emessa e quelle riflesse
// non sono in fase: il moto resta irregolare a lungo e lo spostamento è distribuito su tutta la
// corda, senza nodi netti; a regime restano solo dei minimi poco profondi.
let sim = null;
function simGridN() {
  const v = waveSpeed();
  return Math.min(3000, Math.max(160, Math.ceil(24 * P.length * Math.max(P.freq, 1) / v)));
}
function ensureSim() {
  let N = simGridN();
  // la griglia cambia solo se serve davvero (isteresi): ogni ricampionamento disturba un po' la forma
  if (sim && sim.type === P.type && N <= sim.N && N * 1.6 > sim.N) return;
  if (sim && sim.type === P.type && N > sim.N) N = Math.min(3000, Math.ceil(N * 1.25));
  const ns = { N, type: P.type, y: new Float64Array(N + 1), yOld: new Float64Array(N + 1),
    tmp: new Float64Array(N + 1), env: new Float64Array(N + 1), phase: sim ? sim.phase : 0, cycles: sim ? sim.cycles : 0,
    dt: sim ? sim.dt : 0, acc: sim ? sim.acc : 0 };
  if (sim && sim.type === P.type) {
    // stessa forma, griglia diversa: si ricampiona in u = x/L
    const rs = (src, dst) => {
      for (let i = 0; i <= N; i++) {
        const t = i / N * sim.N, a = Math.min(sim.N - 1, Math.floor(t)), f = t - a;
        dst[i] = src[a] * (1 - f) + src[a + 1] * f;
      }
    };
    rs(sim.y, ns.y); rs(sim.yOld, ns.yOld); rs(sim.env, ns.env);
  }
  sim = ns;
}
function resetSim() { sim = null; ensureSim(); }

function stepSim(dtPhys) {
  const v = waveSpeed(), N = sim.N, dx = P.length / N;
  // passo temporale fisso (90% del limite di stabilità). Un passo che cambia a ogni fotogramma
  // rende instabile lo schema a tre livelli: era questo a far "esplodere" la corda.
  const dt = 0.9 * dx / v;
  let { y, yOld, tmp } = sim;
  if (sim.dt && sim.dt !== dt) {
    // il passo è cambiato (griglia o velocità): si conserva la velocità di ogni punto
    const r = dt / sim.dt;
    for (let i = 0; i <= N; i++) yOld[i] = y[i] - (y[i] - yOld[i]) * r;
  }
  sim.dt = dt;
  // se il calcolo resta indietro si rallenta la simulazione, non si allunga il passo
  sim.acc = Math.min(sim.acc + dtPhys, 3000 * dt);
  const steps = Math.floor(sim.acc / dt);
  sim.acc -= steps * dt;
  const c2 = 0.81, g = alphaDamp() * v * dt;
  const w = 2 * Math.PI * P.freq, k = w / v, slope = k * Math.tanh(k * P.length);
  for (let n = 0; n < steps; n++) {
    sim.phase += w * dt;
    sim.cycles += P.freq * dt;
    // la forzante parte dolcemente (circa due periodi): un avvio a gradino lancerebbe un fronte
    // ripido che eccita tutte le armoniche e rende la corda frastagliata
    const drive = Math.cos(sim.phase) * (1 - Math.exp(-sim.cycles / 1.2));
    for (let i = 1; i < N; i++) tmp[i] = (2 * y[i] - (1 - g) * yOld[i] + c2 * (y[i + 1] - 2 * y[i] + y[i - 1])) / (1 + g);
    // estremo lontano: fisso per la corda, aperto (∂s/∂x = 0) per i tubi
    if (P.type === 'string') tmp[N] = 0;
    else tmp[N] = (2 * y[N] - (1 - g) * yOld[N] + c2 * (2 * y[N - 1] - 2 * y[N])) / (1 + g);
    // estremo della forzante: spostamento imposto, oppure (altoparlante) pendenza imposta
    if (P.type === 'open-open') {
      const ghost = y[1] - 2 * dx * slope * drive;
      tmp[0] = (2 * y[0] - (1 - g) * yOld[0] + c2 * (y[1] - 2 * y[0] + ghost)) / (1 + g);
    } else tmp[0] = drive;
    const t = yOld; yOld = y; y = tmp; tmp = t;
    if (P.type === 'open-open') {
      // con due estremi aperti un'aria spostata tutta insieme non ha forza di richiamo: lo
      // spostamento medio lasciato dal transitorio si toglie lentamente (media su alcuni periodi)
      let m = 0;
      for (let i = 0; i <= N; i++) m += y[i];
      const e = Math.min(1, dt * P.freq * 0.3);
      sim.dc = (sim.dc || 0) + (m / (N + 1) - (sim.dc || 0)) * e;
      const c = sim.dc * e;
      for (let i = 0; i <= N; i++) { y[i] -= c; yOld[i] -= c; }
    }
  }
  sim.y = y; sim.yOld = yOld; sim.tmp = tmp;
}
// Smorzamento delle onde molto corte. In una corda reale (rigidezza, attrito interno, aria) le
// increspature corte si spengono molto prima del moto principale. Il filtro agisce come −D⁴y:
// attenua circa (k·dx)⁴, quindi lascia intatta la lunghezza d'onda della forzante
// (24 punti per λ) e cancella in pochi periodi quelle 4–5 volte più corte.
function dampShort(dtDisp) {
  const e = Math.min(0.45, 18 * dtDisp * P.slowHz), N = sim.N;
  for (const a of [sim.y, sim.yOld]) {
    const t = sim.tmp;
    for (let i = 2; i <= N - 2; i++) t[i] = a[i] - e / 16 * (a[i - 2] - 4 * a[i - 1] + 6 * a[i] - 4 * a[i + 1] + a[i + 2]);
    for (let i = 2; i <= N - 2; i++) a[i] = t[i];
  }
}
// inviluppo: l'escursione massima recente di ogni punto (si scarica in circa un periodo mostrato)
function updateEnv(dtDisp) {
  const d = Math.exp(-dtDisp * P.slowHz * 1.3);
  for (let i = 0; i <= sim.N; i++) sim.env[i] = Math.max(Math.abs(sim.y[i]), sim.env[i] * d);
}
// Durata dei transitori. Il rallentatore è legato alla frequenza della forzante: a 2000 Hz un
// secondo sullo schermo è mezzo millesimo di secondo vero. Un residuo di moto lasciato da una
// frequenza precedente, che nella realtà si spegne in un decimo di secondo, al rallentatore
// resterebbe "congelato" per minuti. Per questo lo scostamento dal regime si smorza almeno con una
// costante di tempo di 4 s sullo schermo (se lo smorzamento vero è già più rapido, non cambia nulla).
const TAU_SHOW = 4;
function limitTransient(dtDisp) {
  const gShow = alphaDamp() * waveSpeed() * P.slowHz / P.freq;
  const extra = 1 / TAU_SHOW - gShow;
  if (extra <= 0 || !sim.dt) return;
  const f = Math.exp(-extra * dtDisp), N = sim.N, M = profile.N;
  const ramp = 1 - Math.exp(-sim.cycles / 1.2);
  const ph = sim.phase, phO = ph - 2 * Math.PI * P.freq * sim.dt;
  const c = Math.cos(ph) * ramp, sn = Math.sin(ph) * ramp, cO = Math.cos(phO) * ramp, sO = Math.sin(phO) * ramp;
  for (let i = 0; i <= N; i++) {
    const t = i / N * M, a = Math.min(M - 1, Math.floor(t)), fr = t - a;
    const re = profile.re[a] * (1 - fr) + profile.re[a + 1] * fr, im = profile.im[a] * (1 - fr) + profile.im[a + 1] * fr;
    const ys = re * c - im * sn, ysO = re * cO - im * sO;
    sim.y[i] = ys + (sim.y[i] - ys) * f;
    sim.yOld[i] = ysO + (sim.yOld[i] - ysO) * f;
  }
}
function simMax() { let m = 0; for (let i = 0; i <= sim.N; i++) m = Math.max(m, sim.env[i]); return m; }

const dispAt = i => sim.y[i];
const envAt = i => sim.env[i];
// pressione p = −(1/k) ∂s/∂x: stessa unità dello spostamento
function presAt(i) {
  const N = sim.N, a = Math.max(0, i - 1), b = Math.min(N, i + 1);
  const k = Math.max(2 * Math.PI * P.freq / waveSpeed(), 0.05);
  return -(sim.y[b] - sim.y[a]) / ((b - a) * P.length / N) / k;
}

function modeInfo() {
  const r = nearestResonance(P.freq);
  const gPeak = gainAt(r.f);
  const ratio = profile.gain / gPeak;
  // in risonanza solo sul picco; nei dintorni si dice qual è il modo vicino
  return { r, gPeak, ratio, resonant: ratio > 0.85, near: ratio > 0.35 };
}

function drawScene() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, SW, SH);
  if (SW < 50 || SH < 80) return;
  const mi = modeInfo();
  const mx = Math.max(56, Math.min(90, SW * 0.08));
  // scala orizzontale fissa: L_MAX occupa tutta la larghezza, quindi la lunghezza si vede davvero
  const x0 = mx, x1 = SW - mx, pxPerM = (x1 - x0) / L_MAX, xE = x0 + P.length * pxPerM;

  // intestazione
  text(ctx, SYSTEM_NAME[P.type], 14, 16, { size: 11, color: C.muted, align: 'left' });
  const slow = P.freq / P.slowHz;
  text(ctx, running ? `rallentato ×${slow >= 100 ? Math.round(slow) : fmt(slow, 0)}` : 'in pausa', SW - 14, 16,
    { size: 10, color: C.muted, align: 'right', mono: true });
  const name = `${mi.r.n}ª armonica${P.type === 'closed-open' ? ` (${(mi.r.n + 1) / 2}° modo)` : ''}`;
  const head = mi.resonant ? `${name}  ·  ${fmtHz(mi.r.f)}`
    : mi.near ? `vicino alla ${name} (${fmtHz(mi.r.f)})  ·  amplificazione ×${fmt(profile.gain, 1)}`
    : `fuori risonanza  ·  amplificazione ×${fmt(profile.gain, 1)}`;
  text(ctx, head, SW / 2, 36, { size: 13, bold: true, color: mi.resonant ? C.green : C.amber });

  if (P.type === 'string') drawString(x0, xE, 54, SH - 34, mi);
  else drawTube(x0, xE, 54, SH - 34, mi);

  // righello in metri, sempre da 0 a L_MAX
  const ry = SH - 16;
  ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x0, ry); ctx.lineTo(x1, ry); ctx.stroke();
  for (let m = 0; m <= L_MAX + 1e-9; m += 0.25) {
    const x = x0 + m * pxPerM, major = Math.abs(m - Math.round(m * 2) / 2) < 1e-9;
    ctx.beginPath(); ctx.moveTo(x, ry - (major ? 5 : 3)); ctx.lineTo(x, ry); ctx.stroke();
    if (major && Math.abs(x - xE) > 62) text(ctx, `${fmt(m, m % 1 ? 1 : 0)} m`, x, ry + 8, { size: 9, color: C.muted, mono: true });
  }
  ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(xE, ry - 7); ctx.lineTo(xE, ry); ctx.stroke();
  text(ctx, `L = ${fmtLen(P.length)}`, xE, ry + 8, { size: 9, color: C.accent, mono: true, bold: true });
}

// marcatori di nodi (N) e ventri (V), e la parentesi con λ/2: solo in risonanza
function drawNodes(x0, x1, yMid, by, yBot, mi) {
  if (!mi.resonant) return;
  const { nodes, anti } = nodesAndAntinodes(mi.r.n);
  const X = u => x0 + u * (x1 - x0);
  ctx.globalAlpha = Math.min(1, (mi.ratio - 0.85) / 0.1);
  for (const u of nodes) {
    ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(X(u), yMid, 4, 0, 2 * Math.PI); ctx.fill();
    text(ctx, 'N', X(u), yBot + 9, { size: 9.5, bold: true, color: C.red });
  }
  for (const u of anti) text(ctx, 'V', X(u), yBot + 9, { size: 9.5, bold: true, color: C.green });
  // λ/2 fra due nodi consecutivi, oppure λ/4 fra nodo e ventre
  const ns = [...nodes].sort((a, b) => a - b), as = [...anti].sort((a, b) => a - b);
  let a, b, lbl;
  const lam = waveSpeed() / mi.r.f;
  if (ns.length >= 2) { a = ns[0]; b = ns[1]; lbl = `λ/2 = ${fmtLen(lam / 2)}`; }
  else { a = ns[0]; b = as.find(u => u > a) ?? 1; lbl = `λ/4 = ${fmtLen(lam / 4)}`; }
  const xa = X(a), xb = X(b);
  ctx.strokeStyle = C.muted; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(xa, by + 5); ctx.lineTo(xa, by); ctx.lineTo(xb, by); ctx.lineTo(xb, by + 5); ctx.stroke();
  text(ctx, lbl, (xa + xb) / 2, by - 8, { size: 10, color: C.text, mono: true });
  ctx.globalAlpha = 1;
}

function drawString(x0, x1, top, bot, mi) {
  const yMid = (top + bot) / 2 + 6, half = (bot - top) / 2 - 18;
  const pxPerUnit = half / G_REF;
  const N = sim.N, X = i => x0 + (x1 - x0) * i / N;

  // carrucola e peso che danno la tensione
  const pr = 9, px = x1 + 6, py = yMid + pr;
  ctx.strokeStyle = C.metal; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(px, py, pr, 0, 2 * Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 22, py - 24); ctx.stroke();
  ctx.strokeStyle = C.text; ctx.lineWidth = 1.4;
  const wy = Math.min(bot - 6, yMid + half * 0.75);
  ctx.beginPath(); ctx.moveTo(x1, yMid); ctx.lineTo(px, yMid);
  ctx.arc(px, py, pr, -Math.PI / 2, 0); ctx.lineTo(px + pr, wy - 18); ctx.stroke();
  ctx.fillStyle = C.metal; ctx.fillRect(px + pr - 11, wy - 18, 22, 22);
  text(ctx, `T = ${P.tension} N`, px + pr, wy + 15, { size: 9, color: C.muted, mono: true });

  // vibratore: la sua punta si muove davvero, con l'ampiezza della forzante
  const drive = dispAt(0) * pxPerUnit;
  ctx.fillStyle = C.bg3; ctx.strokeStyle = C.metal; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.roundRect(x0 - 44, yMid - 24, 30, 48, 4); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = C.metal; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x0 - 14, yMid - drive); ctx.lineTo(x0, yMid - drive); ctx.stroke();
  text(ctx, 'vibratore', x0 - 29, yMid + 36, { size: 9, color: C.muted });
  text(ctx, '~', x0 - 29, yMid, { size: 16, bold: true, color: C.accent });

  ctx.save();
  ctx.beginPath(); ctx.rect(x0 - 2, top, x1 - x0 + 4, bot - top); ctx.clip();
  // linea di riposo
  ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x0, yMid); ctx.lineTo(x1, yMid); ctx.stroke();
  // inviluppo: la massima escursione di ogni punto
  if (P.envelope) {
    ctx.fillStyle = C.soft;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) ctx.lineTo(X(i), yMid - envAt(i) * pxPerUnit);
    for (let i = N; i >= 0; i--) ctx.lineTo(X(i), yMid + envAt(i) * pxPerUnit);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    for (const sg of [-1, 1]) {
      ctx.beginPath();
      for (let i = 0; i <= N; i++) ctx.lineTo(X(i), yMid + sg * envAt(i) * pxPerUnit);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  // la corda
  const col = mi.resonant ? C.accent : C.amber;
  ctx.strokeStyle = col; ctx.lineWidth = 2.6;
  ctx.shadowColor = col; ctx.shadowBlur = mi.resonant ? 10 : 0;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) ctx.lineTo(X(i), yMid - dispAt(i) * pxPerUnit);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = C.metal;
  ctx.beginPath(); ctx.arc(x1, yMid, 3.5, 0, 2 * Math.PI); ctx.fill();
  drawNodes(x0, x1, yMid, top + 6, Math.min(bot - 14, yMid + half + 2), mi);
}

// Il tubo: dentro si vedono le particelle d'aria e, sovrapposte, le onde di spostamento e di
// pressione. La scala verticale è fissa: il picco più alto possibile (Q massimo) resta dentro le pareti.
function drawTube(x0, x1, top, bot, mi) {
  const closed = P.type === 'closed-open';
  const tubeT = top + 34, tubeB = Math.max(tubeT + 60, bot - 20);
  const tubeH = tubeB - tubeT, tubeM = (tubeT + tubeB) / 2;
  const half = tubeH / 2 - 8, pxPerUnit = half / G_REF;
  const N = sim.N, X = i => x0 + (x1 - x0) * i / N;
  const W = x1 - x0;

  // particelle d'aria: ognuna oscilla attorno alla sua posizione di riposo
  const cols = Math.max(12, Math.floor(W / 8)), rows = Math.max(4, Math.floor(tubeH / 13));
  const spacing = W / cols, pPx = spacing * 2.4 / G_REF;
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, tubeT + 1, W + (closed ? 0 : 30), tubeH - 2); ctx.clip();
  const pScale = 1 / (G_REF * 0.5);
  for (let c = 0; c < cols; c++) {
    const u = (c + 0.5) / cols, i = Math.round(u * N);
    const dx = dispAt(i) * pPx;
    const p = Math.max(-1, Math.min(1, presAt(i) * pScale));
    ctx.fillStyle = p > 0 ? C.amber : C.accent;
    ctx.globalAlpha = 0.1 + 0.5 * Math.abs(p);
    for (let r = 0; r < rows; r++) {
      const y = tubeT + 1 + (r + 0.5 + (c % 2) * 0.3) * (tubeH - 2) / rows;
      ctx.beginPath(); ctx.arc(x0 + u * W + dx, y, 1.8, 0, 2 * Math.PI); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // onde dentro il tubo
  ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x0, tubeM); ctx.lineTo(x1, tubeM); ctx.stroke();
  const curve = (fn, color, w, dash) => {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash(dash);
    ctx.beginPath();
    for (let i = 0; i <= N; i++) ctx.lineTo(X(i), tubeM - fn(i) * pxPerUnit);
    ctx.stroke(); ctx.setLineDash([]);
  };
  if (P.envelope) {
    curve(i => envAt(i), C.muted, 1, [4, 4]);
    curve(i => -envAt(i), C.muted, 1, [4, 4]);
  }
  if (P.pressure) curve(presAt, C.amber, 2, []);
  ctx.shadowColor = C.accent; ctx.shadowBlur = mi.resonant ? 8 : 0;
  curve(dispAt, C.accent, 2.4, []);
  ctx.restore();

  // pareti del tubo
  ctx.strokeStyle = C.metal; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(x0, tubeT); ctx.lineTo(x1, tubeT); ctx.moveTo(x0, tubeB); ctx.lineTo(x1, tubeB); ctx.stroke();
  const drive = dispAt(0) * pPx;
  ctx.fillStyle = C.metal;
  if (closed) {
    // pistone sull'estremo chiuso
    ctx.fillRect(x0 - 5 + drive, tubeT, 5, tubeH);
    ctx.fillRect(x0 - 30 + drive, tubeM - 2, 25, 4);
  } else {
    // altoparlante davanti all'estremo aperto
    const cx = x0 - 14 + drive * 0.5, ch = Math.min(tubeH * 0.38, 46);
    ctx.beginPath(); ctx.moveTo(cx - 14, tubeM - 8); ctx.lineTo(cx, tubeM - ch); ctx.lineTo(cx, tubeM + ch);
    ctx.lineTo(cx - 14, tubeM + 8); ctx.closePath(); ctx.fill();
    ctx.fillRect(cx - 24, tubeM - 8, 10, 16);
  }
  text(ctx, closed ? 'chiuso · pistone' : 'aperto · altoparlante', x0 - 40, tubeT - 9, { size: 9, color: C.muted, align: 'left' });
  text(ctx, 'aperto', x1, tubeT - 9, { size: 9, color: C.muted, align: W > 150 ? 'right' : 'left' });

  // legenda, accanto al nome del sistema
  ctx.font = '11px DM Sans, sans-serif';
  let lx = 14 + ctx.measureText(SYSTEM_NAME[P.type]).width + 26;
  text(ctx, '— spostamento s', lx, 16, { size: 9.5, color: C.accent, align: 'left' });
  lx += 92;
  if (P.pressure) { text(ctx, '— pressione p', lx, 16, { size: 9.5, color: C.amber, align: 'left' }); lx += 82; }
  if (SW - lx > 420) text(ctx, '· particelle: arancio = compressione, azzurro = rarefazione', lx, 16, { size: 9, color: C.muted, align: 'left' });

  drawNodes(x0, x1, tubeM, tubeT - 22, tubeB, mi);
}

// ── Grafici in basso ─────────────────────────────────────────────────────────
let curveCache = { key: '', fs: null, gs: null };
function responseCurve() {
  const key = [P.type, P.length, P.tension, P.mu, P.tempC, P.Q, P.fScale].join('|');
  if (curveCache.key === key) return curveCache;
  const fs = [];
  for (let i = 0; i <= 900; i++) fs.push(P.fScale * i / 900);
  // campioni extra sui picchi, così ogni picco viene disegnato alla sua vera altezza
  const w = peakWidth();
  for (const r of resonances(Math.min(500, Math.ceil(P.fScale / resonances(1)[0].f) + 1))) {
    if (r.f > P.fScale) break;
    for (const d of [-2, -1, -0.5, -0.25, 0, 0.25, 0.5, 1, 2]) fs.push(r.f + d * w);
  }
  fs.sort((a, b) => a - b);
  const keep = fs.filter(f => f > 0 && f <= P.fScale);
  curveCache = { key, fs: keep, gs: keep.map(gainAt) };
  return curveCache;
}

let hit = { switch: [], resp: null, bars: [] };

function drawGraphs() {
  gctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  gctx.fillStyle = C.panel; gctx.fillRect(0, 0, GW, GH);
  hit = { switch: [], resp: null, bars: [] };
  if (GW < 60 || GH < 60) return;
  if (GW < 620) { drawResponse(6, 6, GW - 12, GH - 12); return; }
  const w1 = Math.floor((GW - 18) * 0.62);
  drawResponse(6, 6, w1, GH - 12);
  drawSeries(12 + w1, 6, GW - 18 - w1, GH - 12);
}

function drawScaleSwitch(right, cy) {
  gctx.font = '600 10px DM Sans, sans-serif';
  const ws = scales().map(s => gctx.measureText(String(s)).width + 12);
  let x = right - ws.reduce((a, b) => a + b, 0);
  text(gctx, 'fondo scala Hz', x - 6, cy, { size: 9.5, color: C.muted, align: 'right' });
  gctx.strokeStyle = C.grid; gctx.lineWidth = 1;
  gctx.beginPath(); gctx.roundRect(x - 0.5, cy - 9.5, ws.reduce((a, b) => a + b, 0) + 1, 19, 6); gctx.stroke();
  scales().forEach((s, i) => {
    const on = s === P.fScale;
    if (on) {
      gctx.fillStyle = C.accent; gctx.globalAlpha = 0.22;
      gctx.beginPath(); gctx.roundRect(x, cy - 9, ws[i], 18, 5); gctx.fill(); gctx.globalAlpha = 1;
    }
    text(gctx, String(s), x + ws[i] / 2, cy, { size: 10, bold: on, color: on ? C.accent : C.muted });
    hit.switch.push({ s, x, y: cy - 9, w: ws[i], h: 18 });
    x += ws[i];
  });
}

function freqTicks(L, R, B, y) {
  const step = P.fScale / 5;
  for (let f = 0; f <= P.fScale + 1e-9; f += step) {
    const x = L + f / P.fScale * (R - L);
    gctx.strokeStyle = C.grid; gctx.beginPath(); gctx.moveTo(x, B); gctx.lineTo(x, B + 3); gctx.stroke();
    text(gctx, String(Math.round(f)), x, y, { size: 9, color: C.muted, mono: true });
  }
}

// Risposta in frequenza: amplificazione (massimo spostamento / spostamento della forzante) in
// funzione della frequenza. Ogni picco è un modo stazionario; la linea tratteggiata è la forzante.
function drawResponse(x0, y0, w, h) {
  card(gctx, x0, y0, w, h, w > 420 ? 'Risposta in frequenza — amplificazione' : 'Risposta in frequenza');
  drawScaleSwitch(x0 + w - 10, y0 + 15);
  const L = x0 + 40, R = x0 + w - 14, T = y0 + 34, B = y0 + h - 26;
  if (R - L < 40 || B - T < 30) return;
  const X = f => L + f / P.fScale * (R - L), Y = g => B - Math.min(g, G_REF) / G_REF * (B - T);
  hit.resp = { L, R, T, B };

  // griglia
  gctx.lineWidth = 1;
  for (let g = 0; g <= G_REF; g += 10) {
    gctx.strokeStyle = C.grid; gctx.beginPath(); gctx.moveTo(L, Y(g)); gctx.lineTo(R, Y(g)); gctx.stroke();
    text(gctx, `×${g}`, L - 5, Y(g), { size: 9, color: C.muted, align: 'right', mono: true });
  }
  freqTicks(L, R, B, B + 11);

  // curva
  const { fs, gs } = responseCurve();
  gctx.save();
  gctx.beginPath(); gctx.rect(L, T - 2, R - L, B - T + 2); gctx.clip();
  const r1 = resonances(2), gap = X(r1[1].f) - X(r1[0].f);
  if (gap < 5) {
    // picchi più fitti dei pixel: per ogni colonna si disegna il massimo, così non nascono
    // figure di moiré dovute al campionamento
    const cols = Math.ceil(R - L) + 1, mx = new Float64Array(cols);
    fs.forEach((f, i) => { const c = Math.round(X(f) - L); if (c >= 0 && c < cols) mx[c] = Math.max(mx[c], gs[i]); });
    for (let c = 1; c < cols; c++) if (!mx[c]) mx[c] = mx[c - 1];
    gctx.beginPath(); gctx.moveTo(L, B);
    for (let c = 0; c < cols; c++) gctx.lineTo(L + c, Y(mx[c]));
    gctx.lineTo(R, B); gctx.closePath();
    gctx.fillStyle = C.accent; gctx.globalAlpha = 0.35; gctx.fill(); gctx.globalAlpha = 1;
    text(gctx, 'picchi troppo fitti: scegli un fondo scala più piccolo', (L + R) / 2, B - 10, { size: 9.5, color: C.muted });
  } else {
    gctx.beginPath(); gctx.moveTo(X(0), B);
    fs.forEach((f, i) => gctx.lineTo(X(f), Y(gs[i])));
    gctx.lineTo(X(fs[fs.length - 1]), B); gctx.closePath();
    gctx.fillStyle = C.accent; gctx.globalAlpha = 0.12; gctx.fill(); gctx.globalAlpha = 1;
    gctx.beginPath();
    fs.forEach((f, i) => gctx.lineTo(X(f), Y(gs[i])));
    gctx.strokeStyle = C.accent; gctx.lineWidth = 1.4; gctx.stroke();
  }
  gctx.restore();

  // etichette dei picchi
  const res = resonances(60).filter(r => r.f <= P.fScale);
  const spacing = res.length > 1 ? X(res[1].f) - X(res[0].f) : 999;
  const every = Math.max(1, Math.ceil(22 / spacing));
  res.forEach((r, i) => {
    if (i % every) return;
    text(gctx, `f${r.n}`, X(r.f), Math.max(T - 6, Y(gainAt(r.f)) - 8), { size: 9, color: C.muted });
  });

  // forzante
  const f = P.freq;
  if (f <= P.fScale) {
    const x = X(f), g = profile.gain;
    gctx.strokeStyle = C.amber; gctx.lineWidth = 1.3; gctx.setLineDash([3, 3]);
    gctx.beginPath(); gctx.moveTo(x, T); gctx.lineTo(x, B); gctx.stroke(); gctx.setLineDash([]);
    gctx.fillStyle = C.amber; gctx.beginPath(); gctx.arc(x, Y(g), 4, 0, 2 * Math.PI); gctx.fill();
    const lbl = `${fmtHz(f)} · ×${fmt(g, 1)}`;
    const right = x > R - 100;
    text(gctx, lbl, x + (right ? -6 : 6), T + 4, { size: 10, bold: true, color: C.amber, align: right ? 'right' : 'left' });
  } else {
    text(gctx, `forzante a ${fmtHz(f)} →`, R - 2, T + 6, { size: 10, bold: true, color: C.amber, align: 'right' });
  }
}

// Serie armonica: le frequenze dei modi in funzione del numero d'armonica n. I punti stanno su
// una retta che passa per l'origine: fₙ = n·f₁. Nel tubo chiuso–aperto mancano le armoniche pari.
function drawSeries(x0, y0, w, h) {
  const closed = P.type === 'closed-open';
  card(gctx, x0, y0, w, h, closed ? 'Serie armonica: solo n dispari' : 'Serie armonica: fₙ = n·f₁');
  const L = x0 + 40, R = x0 + w - 12, T = y0 + 34, B = y0 + h - 26;
  if (R - L < 40 || B - T < 30) return;
  const NB = 10, bw = (R - L) / NB;
  const X = n => L + (n - 0.5) * bw, Y = f => B - Math.min(f, P.fScale) / P.fScale * (B - T);
  const step = P.fScale / 5;
  for (let f = 0; f <= P.fScale + 1e-9; f += step) {
    gctx.strokeStyle = C.grid; gctx.lineWidth = 1; gctx.beginPath(); gctx.moveTo(L, Y(f)); gctx.lineTo(R, Y(f)); gctx.stroke();
    text(gctx, String(Math.round(f)), L - 5, Y(f), { size: 9, color: C.muted, align: 'right', mono: true });
  }
  text(gctx, 'Hz', L - 5, T - 10, { size: 9, color: C.muted, align: 'right' });

  const v = waveSpeed(), base = closed ? v / (4 * P.length) : v / (2 * P.length);
  const near = nearestResonance(P.freq);
  // retta fₙ = n·f₁ (nel tubo chiuso f₁ = v/4L e le armoniche sono 1, 3, 5, …)
  gctx.save();
  gctx.beginPath(); gctx.rect(L, T, R - L, B - T); gctx.clip();
  gctx.strokeStyle = C.muted; gctx.setLineDash([4, 3]); gctx.lineWidth = 1;
  gctx.beginPath(); gctx.moveTo(X(0), Y(0)); gctx.lineTo(X(NB + 1), B - (NB + 1) * base / P.fScale * (B - T)); gctx.stroke();
  gctx.setLineDash([]);
  gctx.restore();

  for (let n = 1; n <= NB; n++) {
    const x = X(n), fn = n * base, present = !closed || n % 2 === 1;
    const bwid = Math.min(18, bw * 0.55);
    text(gctx, String(n), x, B + 11, { size: 9.5, bold: n === near.n, color: n === near.n ? C.text : C.muted, mono: true });
    if (!present) {
      gctx.strokeStyle = C.grid; gctx.setLineDash([2, 3]);
      gctx.strokeRect(x - bwid / 2, Y(fn), bwid, B - Y(fn)); gctx.setLineDash([]);
      continue;
    }
    const on = n === near.n;
    gctx.fillStyle = on ? C.accent : C.muted; gctx.globalAlpha = on ? 0.85 : 0.35;
    gctx.fillRect(x - bwid / 2, Y(fn), bwid, B - Y(fn)); gctx.globalAlpha = 1;
    if (fn > P.fScale) text(gctx, '▲', x, T + 4, { size: 8, color: C.muted });
    else if (bw > 26) text(gctx, String(Math.round(fn)), x, Y(fn) - 7, { size: 8.5, color: on ? C.accent : C.muted, mono: true });
    hit.bars.push({ n, x: x - bw / 2, w: bw, T, B });
  }
  // la forzante
  if (P.freq <= P.fScale) {
    const y = Y(P.freq);
    gctx.strokeStyle = C.amber; gctx.lineWidth = 1.3; gctx.setLineDash([3, 3]);
    gctx.beginPath(); gctx.moveTo(L, y); gctx.lineTo(R, y); gctx.stroke(); gctx.setLineDash([]);
  }
}

// ── Readout ──────────────────────────────────────────────────────────────────
let readout = null;
function updateReadout() {
  const v = waveSpeed(), r = nearestResonance(P.freq);
  readout.set('freq', fmtHz(P.freq));
  readout.set('speed', `${fmt(v, 0)} m/s`);
  readout.set('lambda', fmtLen(v / P.freq));
  readout.set('harm', `n = ${r.n} · ${fmtHz(r.f)}`);
  readout.set('gain', `×${fmt(profile.gain, 1)}`);
  readout.set('width', fmtHz(peakWidth()));
}

// ── Suono ────────────────────────────────────────────────────────────────────
let audio = null;
function setSound(on) {
  P.sound = on;
  if (on && !audio) {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ac.createOscillator(), gain = ac.createGain();
    osc.type = 'sine'; osc.frequency.value = P.freq; gain.gain.value = 0;
    osc.connect(gain).connect(ac.destination); osc.start();
    audio = { ac, osc, gain };
  } else if (!on && audio) {
    const a = audio; audio = null;
    a.gain.gain.setTargetAtTime(0, a.ac.currentTime, 0.03);
    setTimeout(() => a.ac.close(), 200);
  }
}
function updateSound() {
  if (!audio) return;
  const t = audio.ac.currentTime;
  audio.osc.frequency.setTargetAtTime(P.freq, t, 0.02);
  // il volume segue l'ampiezza: alla risonanza il suono si rinforza
  const lvl = running ? 0.015 + 0.25 * Math.min(1, simMax() / (2 * Q_MAX / Math.PI)) : 0;
  audio.gain.gain.setTargetAtTime(lvl, t, 0.06);
}

// ── Animazione ───────────────────────────────────────────────────────────────
let paramsChanged = true;
function invalidate() { paramsChanged = true; }

function frame(ms) {
  const dt = Math.min(0.1, Math.max(0, (ms - lastMs) / 1000));
  lastMs = ms;
  if (running && P.sweep) {
    setFreq(P.freq + dt * P.fScale / 45, false);
    if (P.freq >= P.fScale) setFreq(1, false);
  }
  if (paramsChanged) { computeProfile(); paramsChanged = false; }
  ensureSim();
  if (running && dt > 0) {
    // rallentatore: in un secondo sullo schermo passano slowHz periodi della forzante
    stepSim(dt * P.slowHz / P.freq);
    dampShort(dt);
    limitTransient(dt);
    updateEnv(dt);
  }
  C = getColors();
  drawScene();
  drawGraphs();
  updateReadout();
  updateSound();
  requestAnimationFrame(frame);
}

// ── Controlli ────────────────────────────────────────────────────────────────
let freqCtl = null, stringSub = null, tubeSub = null, snapRow = null, pressureToggle = null, sweepToggle = null;

function setFreq(f, stopSweep = true) {
  P.freq = Math.max(1, Math.min(fMax(), Math.round(f * 10) / 10));
  if (freqCtl) freqCtl.setValue(P.freq);
  // se la forzante esce dai grafici si passa al fondo scala successivo (mai a uno più piccolo)
  if (stopSweep && P.freq > P.fScale) P.fScale = scales().find(v => v >= P.freq) || scales().at(-1);
  if (stopSweep && P.sweep) { P.sweep = false; sweepToggle.setValue(false); }
  invalidate();
}
function snapTo(n) {
  const r = resonances(40).find(r => r.n === n);
  if (r) setFreq(r.f);
}
function rebuildSnap() {
  snapRow.innerHTML = '';
  resonances(6).forEach(r => {
    const b = document.createElement('button');
    b.className = 'btn-secondary';
    b.textContent = `f${r.n}`;
    b.title = fmtHz(r.f);
    // armoniche oltre il limite della forzante: il pulsante resta visibile ma spento
    if (r.f > fMax()) { b.disabled = true; b.style.opacity = '0.35'; b.title += ` (oltre ${fmtHz(fMax())})`; }
    b.addEventListener('click', () => snapTo(r.n));
    snapRow.appendChild(b);
  });
}
function systemChanged() {
  invalidate();
  rebuildSnap();
}

function buildControls() {
  const panel = document.getElementById('controls');

  const secType = Lab.Section('Sistema');
  secType.add(Lab.RadioGroup({
    label: 'Tipo di sistema',
    options: [
      { label: 'Corda fissata',      value: 'string',      hint: 'fₙ = n·v/2L' },
      { label: 'Tubo chiuso–aperto', value: 'closed-open', hint: 'fₙ = n·v/4L, n dispari' },
      { label: 'Tubo aperto–aperto', value: 'open-open',   hint: 'fₙ = n·v/2L' },
    ],
    value: P.type,
    onChange(v) {
      P.type = v;
      // limite della frequenza e fondo scala propri del sistema scelto
      freqCtl.el.querySelectorAll('input').forEach(inp => { inp.max = fMax(); });
      P.fScale = v === 'string' ? 100 : 500;
      stringSub.el.style.display = v === 'string' ? '' : 'none';
      tubeSub.el.style.display = v === 'string' ? 'none' : '';
      pressureToggle.el.style.display = v === 'string' ? 'none' : '';
      resetSim();
      systemChanged();
      snapTo(resonances(1)[0].n);
    },
  }));
  secType.add(Lab.Slider({
    label: 'Lunghezza L', min: 0.3, max: L_MAX, value: P.length, step: 0.05, unit: ' m',
    onChange(v) { P.length = v; systemChanged(); },
  }));
  stringSub = Lab.SubPanel();
  stringSub.add(Lab.Slider({
    label: 'Tensione T', min: 10, max: 200, value: P.tension, step: 1, unit: ' N',
    onChange(v) { P.tension = v; systemChanged(); },
  }));
  stringSub.add(Lab.Slider({
    label: 'Densità lineare μ', min: 0.002, max: 0.02, value: P.mu, step: 0.001, unit: ' kg/m',
    onChange(v) { P.mu = v; systemChanged(); },
  }));
  const sNote = document.createElement('div');
  sNote.className = 'sw-note';
  sNote.textContent = 'v = √(T/μ): più tensione o una corda più leggera alzano tutte le armoniche.';
  stringSub.add(sNote);
  secType.add(stringSub);
  tubeSub = Lab.SubPanel();
  tubeSub.add(Lab.Slider({
    label: 'Temperatura dell\'aria', min: -10, max: 40, value: P.tempC, step: 1, unit: ' °C',
    onChange(v) { P.tempC = v; systemChanged(); },
  }));
  const tNote = document.createElement('div');
  tNote.className = 'sw-note';
  tNote.textContent = 'v ≈ 331 m/s · √(1 + t/273 °C): l\'aria calda alza l\'intonazione dei tubi.';
  tubeSub.add(tNote);
  tubeSub.el.style.display = 'none';
  secType.add(tubeSub);
  panel.appendChild(secType.el);

  const secF = Lab.Section('Forzante');
  freqCtl = Lab.SliderInput({
    label: 'Frequenza f', min: 1, max: fMax(), value: P.freq, step: 0.1, unit: 'Hz',
    onChange(v) { P.freq = v; if (P.sweep) { P.sweep = false; sweepToggle.setValue(false); } invalidate(); },
  });
  secF.add(freqCtl);
  snapRow = document.createElement('div');
  snapRow.className = 'sw-snap';
  secF.add(snapRow);
  sweepToggle = Lab.Toggle({ label: 'Scansione automatica', value: P.sweep, onChange(v) { P.sweep = v; } });
  secF.add(sweepToggle);
  secF.add(Lab.Toggle({ label: 'Ascolta la frequenza', value: P.sound, onChange: setSound }));
  panel.appendChild(secF.el);

  const secD = Lab.Section('Smorzamento');
  secD.add(Lab.Slider({
    label: 'Fattore di qualità Q', min: 3, max: Q_MAX, value: P.Q, step: 1,
    onChange(v) { P.Q = v; invalidate(); },
  }));
  const dNote = document.createElement('div');
  dNote.className = 'sw-note';
  dNote.textContent = 'Q alto = poco attrito: picchi più alti e più stretti, ma servono più oscillazioni per raggiungere il regime.';
  secD.add(dNote);
  panel.appendChild(secD.el);

  const secV = Lab.Section('Visualizzazione');
  secV.add(Lab.Toggle({ label: 'Inviluppo (escursione massima)', value: P.envelope, onChange(v) { P.envelope = v; } }));
  pressureToggle = Lab.Toggle({ label: 'Pressione nel tubo', value: P.pressure, onChange(v) { P.pressure = v; } });
  pressureToggle.el.style.display = 'none';
  secV.add(pressureToggle);
  secV.add(Lab.Slider({
    label: 'Rallentatore (oscillazioni/s mostrate)', min: 0.2, max: 2, value: P.slowHz, step: 0.1,
    onChange(v) { P.slowHz = v; },
  }));
  panel.appendChild(secV.el);

  rebuildSnap();
}

// ── Interazione con i grafici ────────────────────────────────────────────────
let dragging = false;
function graphPos(e) { const r = gCanvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
const inRect = (p, b) => p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h;
function freqFromX(x) { const { L, R } = hit.resp; return Math.max(1, Math.min(1, (x - L) / (R - L)) * P.fScale); }

gCanvas.addEventListener('pointerdown', e => {
  const p = graphPos(e);
  const sw = hit.switch.find(b => inRect(p, b));
  if (sw) { P.fScale = sw.s; return; }
  const rp = hit.resp;
  if (rp && p.x >= rp.L && p.x <= rp.R && p.y >= rp.T - 6 && p.y <= rp.B + 6) {
    dragging = true; gCanvas.setPointerCapture(e.pointerId);
    setFreq(freqFromX(p.x));
    return;
  }
  const bar = hit.bars.find(b => p.x >= b.x && p.x < b.x + b.w && p.y >= b.T && p.y <= b.B + 16);
  if (bar) snapTo(bar.n);
});
gCanvas.addEventListener('pointermove', e => {
  const p = graphPos(e);
  if (dragging) { setFreq(freqFromX(p.x)); return; }
  const rp = hit.resp;
  const overPlot = rp && p.x >= rp.L && p.x <= rp.R && p.y >= rp.T - 6 && p.y <= rp.B + 6;
  const overBtn = hit.switch.some(b => inRect(p, b)) || hit.bars.some(b => p.x >= b.x && p.x < b.x + b.w && p.y >= b.T && p.y <= b.B + 16);
  gCanvas.style.cursor = overBtn ? 'pointer' : overPlot ? 'ew-resize' : 'default';
});
gCanvas.addEventListener('pointerup', () => { dragging = false; });
gCanvas.addEventListener('pointercancel', () => { dragging = false; });

// ── Pulsanti ─────────────────────────────────────────────────────────────────
const btnPlay = document.getElementById('btnPlay');
function setRunning(on) {
  running = on;
  btnPlay.textContent = on ? '⏸  PAUSA' : '▶  AVVIA';
  btnPlay.classList.toggle('running', on);
}
btnPlay.addEventListener('click', () => setRunning(!running));
document.getElementById('btnReset').addEventListener('click', () => {
  resetSim();
  setRunning(true);
});

// ── Avvio ────────────────────────────────────────────────────────────────────
Lab.initTheme();
buildControls();
readout = new Lab.Readout(readoutEl, [
  { key: 'freq',   label: 'forzante f' },
  { key: 'speed',  label: 'velocità v' },
  { key: 'lambda', label: 'λ = v/f' },
  { key: 'harm',   label: 'modo più vicino' },
  { key: 'gain',   label: 'amplificazione' },
  { key: 'width',  label: 'larghezza dei picchi' },
]);
new ResizeObserver(resize).observe(canvas.parentElement);
resize();
snapTo(2);
setRunning(true);
requestAnimationFrame(ms => { lastMs = ms; frame(ms); });
