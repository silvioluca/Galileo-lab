'use strict';

// ═══ Tubo di Quincke ═══════════════════════════════════════════════════════════
// L'apparecchio è un anello allungato di tubo metallico: il suono entra dall'imbuto in alto al
// centro, si divide in due rami (a sinistra e a destra) che girano attorno alle due estremità e si
// ricongiunge all'imbuto in basso, dove si ascolta. La U di destra scorre nei giunti a metà dei
// tratti dritti: estraendola di d si allungano sia il tratto superiore sia quello inferiore, quindi
// la differenza di cammino fra i rami è Δ = 2d. Le due onde, di uguale ampiezza, arrivano sfasate di
// 2π·Δ/λ:  ampiezza risultante ∝ |cos(π·Δ/λ)|,  intensità ∝ cos²(π·Δ/λ).
// Massimi per Δ = n·λ, minimi (silenzio) per Δ = (n + ½)·λ. Fra due minimi consecutivi la U si
// sposta di λ/2: misurando quello spostamento a frequenza nota si ricava v = λ·f.
// Si trascurano l'attenuazione nei rami (minimi perfetti) e le riflessioni alle giunzioni.

const P = {
  f: 1000,          // frequenza (Hz)
  tempC: 20,        // temperatura dell'aria (°C)
  d: 0,             // estrazione della U scorrevole (cm)
  showWaves: true,
  speed: 1.0,
};
const D_MAX = 40;                 // cm, corsa della U scorrevole
// geometria in cm (y verso il basso), proporzioni dell'apparecchio reale
const R = 9;                      // raggio delle due curve
const XL = -32, XR0 = 32;         // centri delle curve (quella destra si sposta di d)
const XJ = 4;                     // giunti a manicotto sui tratti dritti, appena a destra degli imbuti
const STEM = 6, FUNNEL_H = 6, FUNNEL_R = 6.5, TUBE_D = 2.6;
const SRC_GAP = 7;                // distanza dell'altoparlante dalla bocca dell'imbuto d'ingresso
const OUT_SPAN = 11;              // fin dove si vedono i fronti uscire dall'imbuto inferiore
const VIS_FREQ = 0.6;             // Hz: l'onda è mostrata rallentata (quella vera oscillerebbe a f)

let tAnim = 0, last = 0, drag = null;
let G = {};
let gCanvas = [], readout, sliderD;
let audio = null;

// ═══ Fisica ═══════════════════════════════════════════════════════════════════
const soundSpeed = () => 331.3 * Math.sqrt(1 + P.tempC / 273.15);        // m/s
const lambdaCm = () => soundSpeed() / P.f * 100;                           // cm
const pathDiff = () => 2 * P.d;                                            // cm
const ampOut = (dCm = P.d, f = P.f) => Math.abs(Math.cos(Math.PI * 2 * dCm / (soundSpeed() / f * 100)));
const intensity = (dCm = P.d, f = P.f) => ampOut(dCm, f) ** 2;
// posizioni della U con silenzio in uscita: 2d = (n + ½)·λ
function minimaPositions() {
  const out = [], lam = lambdaCm();
  for (let n = 0; ; n++) { const d = (2 * n + 1) * lam / 4; if (d > D_MAX) break; out.push(d); }
  return out;
}

// ═══ Percorsi del suono (polilinee del centro del tubo, in cm) ═══════════════
const yIn = -R - STEM - FUNNEL_H, yOut = R + STEM + FUNNEL_H;            // bocche dei due imbuti
function arc(cx, side, n = 40) {                                          // semicirconferenza dall'alto al basso
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = Math.PI * i / n; pts.push([cx + side * R * Math.sin(t), -R * Math.cos(t)]); }
  return pts;
}
function paths() {
  const xR = XR0 + P.d;
  return {
    stemIn: [[0, yIn], [0, -R]],
    left: [[0, -R], ...arc(XL, -1), [0, R]],
    right: [[0, -R], ...arc(xR, +1), [0, R]],
    stemOut: [[0, R], [0, yOut]],
  };
}
// tabella delle lunghezze cumulate, per trovare il punto (e la direzione) a distanza s dall'inizio
function table(pts) {
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, s, L: s[s.length - 1] };
}
function pointAt(tb, s) {
  let i = 1; while (i < tb.s.length - 1 && tb.s[i] < s) i++;
  const a = tb.pts[i - 1], b = tb.pts[i], seg = tb.s[i] - tb.s[i - 1] || 1, f = (s - tb.s[i - 1]) / seg;
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
  return { x: a[0] + dx * f, y: a[1] + dy * f, tx: dx / l, ty: dy / l };
}

// ═══ Disegno ══════════════════════════════════════════════════════════════════
function colors() {
  const C = Lab.graphColors();
  return { ...C,
    metal: '#8d939a', metalDark: '#5f656c', metalHi: '#b4b9bf', channel: C.light ? '#6a7077' : '#4d535a',
    crest: 'rgba(235,245,255,', bg: C.light ? '#eef0f2' : '#0b0f15', ink: C.light ? '#2a3440' : '#c9d6e3' };
}
// margini riservati in alto (intestazione) e in basso (didascalia)
const TOP_PX = 50, BOT_PX = 22;
function geom(W, Hc) {
  const xMin = XL - R - 6, xMax = XR0 + D_MAX + R + 14, yMin = yIn - SRC_GAP - 4, yMax = yOut + OUT_SPAN + 3;
  const h = Hc - TOP_PX - BOT_PX, s = Math.min(W / (xMax - xMin), h / (yMax - yMin));
  G = { s, ox: (W - (xMax - xMin) * s) / 2 - xMin * s, oy: TOP_PX + (h - (yMax - yMin) * s) / 2 - yMin * s };
}
const X = x => G.ox + x * G.s, Y = y => G.oy + y * G.s;

function line(ctx, pts, w, col, cap = 'butt') {
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.lineCap = cap;
  ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))); ctx.stroke();
}
// tubo metallico in sezione: parete grigia con riflesso, canale interno scuro dove viaggia il suono
function tube(ctx, pts, C, w = TUBE_D) {
  const px = w * G.s;
  line(ctx, pts, px + 2, C.metalDark);
  line(ctx, pts, px, C.metal);
  line(ctx, pts, px * 0.55, C.channel);
}
// imbuto metallico: dal tubo (y0) alla bocca (y1)
function funnel(ctx, y0, y1, C) {
  const wT = TUBE_D / 2 * G.s, wM = FUNNEL_R * G.s, xc = X(0);
  const gr = ctx.createLinearGradient(xc - wM, 0, xc + wM, 0);
  gr.addColorStop(0, C.metalDark); gr.addColorStop(0.35, C.metalHi); gr.addColorStop(0.6, C.metal); gr.addColorStop(1, C.metalDark);
  ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(xc - wT, Y(y0)); ctx.lineTo(xc - wM, Y(y1)); ctx.lineTo(xc + wM, Y(y1)); ctx.lineTo(xc + wT, Y(y0)); ctx.closePath(); ctx.fill();
  ctx.fillStyle = C.channel; ctx.beginPath(); ctx.ellipse(xc, Y(y1), wM * 0.92, wM * 0.22, 0, 0, 2 * Math.PI); ctx.fill();
  ctx.strokeStyle = C.metalDark; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(xc, Y(y1), wM, wM * 0.25, 0, 0, 2 * Math.PI); ctx.stroke();
}
// piedino d'appoggio come nell'apparecchio reale: morsetto sul tubo con pomello, asta e piede di gomma
function leg(ctx, x0, y0, x1, y1, kx, ky, C) {
  ctx.strokeStyle = C.metalHi; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(X(x0), Y(y0)); ctx.lineTo(X(x1), Y(y1)); ctx.stroke();
  ctx.fillStyle = '#1b1d20'; ctx.beginPath(); ctx.arc(X(x1), Y(y1), 3.2, 0, 2 * Math.PI); ctx.fill();
  ctx.strokeStyle = C.metalDark; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(x0), Y(y0)); ctx.lineTo(X(x0 + kx), Y(y0 + ky)); ctx.stroke();
  ctx.fillStyle = '#1b1d20'; ctx.beginPath(); ctx.ellipse(X(x0 + kx), Y(y0 + ky), 5, 3, 0, 0, 2 * Math.PI); ctx.fill();
  ctx.fillStyle = C.metal; ctx.fillRect(X(x0) - 4, Y(y0) - 4, 8, 8);
}
// fronti d'onda (creste di compressione) lungo un tubo: barrette che viaggiano alla velocità del suono
function crests(ctx, tb, s0, amp, C) {
  if (amp < 0.02) return;
  const lam = lambdaCm(), sh = VIS_FREQ * lam * tAnim;      // posizione della cresta più avanzata
  const half = TUBE_D * 0.42 * G.s;
  ctx.lineCap = 'round';
  for (let s = ((sh - s0) % lam + lam) % lam; s <= tb.L; s += lam) {
    const p = pointAt(tb, s), nx = -p.ty, ny = p.tx, x = X(p.x), y = Y(p.y);
    ctx.strokeStyle = C.crest + (0.9 * amp) + ')'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x - nx * half, y - ny * half); ctx.lineTo(x + nx * half, y + ny * half); ctx.stroke();
  }
}
// fronti d'onda nell'aria: archi che si allargano da un centro, nel verso indicato (+1 giù, −1 su)
function airArcs(ctx, cx, cy, r0, rMax, amp, dir, C) {
  if (amp < 0.02) return;
  const lam = lambdaCm(), sh = VIS_FREQ * lam * tAnim;
  for (let r = ((sh - r0) % lam + lam) % lam; r <= rMax; r += lam) {
    if (r < 0.5) continue;
    const a = amp * (1 - 0.6 * r / rMax);
    ctx.strokeStyle = C.light ? `rgba(40,60,85,${0.7 * a})` : `rgba(220,235,250,${0.75 * a})`; ctx.lineWidth = 2;
    const mid = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    ctx.beginPath(); ctx.arc(X(cx), Y(cy), r * G.s, mid - 0.6, mid + 0.6); ctx.stroke();
  }
}

function draw(canvas) {
  const [ctx, W, Hc] = Lab.ctx2d(canvas), C = colors();
  geom(W, Hc);
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, Hc);
  const pth = paths(), xR = XR0 + P.d;
  const T = { stemIn: table(pth.stemIn), left: table(pth.left), right: table(pth.right), stemOut: table(pth.stemOut) };
  const ySrc = yIn - SRC_GAP;

  // piedini d'appoggio (quello di destra si sposta con la U)
  leg(ctx, XL + 2, -R, XL + 11, -R + 5.5, -0.5, -3.5, C);
  leg(ctx, XL + 2, R, XL + 12, R + 5, -0.5, 3.5, C);
  leg(ctx, xR + R, -1.5, xR - 1, 3.5, 3.5, -0.5, C);

  // tubi: l'anello (due rami), i due gambi verso gli imbuti
  tube(ctx, pth.left, C); tube(ctx, pth.right, C);
  tube(ctx, pth.stemIn, C); tube(ctx, pth.stemOut, C);
  // tratto telescopico estratto (tubo interno, più sottile e lucido) e manicotti dei giunti
  if (P.d > 0.2) for (const y of [-R, R]) {
    line(ctx, [[XJ, y], [XJ + P.d, y]], TUBE_D * G.s * 0.86, C.metalHi);
    line(ctx, [[XJ, y], [XJ + P.d, y]], TUBE_D * G.s * 0.5, C.channel);
  }
  for (const y of [-R, R]) { ctx.fillStyle = C.metalDark; ctx.fillRect(X(XJ) - 3, Y(y) - TUBE_D * G.s * 0.62, 6, TUBE_D * G.s * 1.24); }
  funnel(ctx, -R - STEM, yIn, C);
  funnel(ctx, R + STEM, yOut, C);

  // onde: dall'altoparlante all'imbuto, nei due rami, e in uscita la loro somma
  if (P.showWaves) {
    const sIn = SRC_GAP, sJ = sIn + T.stemIn.L;           // distanza percorsa all'ingresso dell'imbuto e alla biforcazione
    airArcs(ctx, 0, ySrc, 0, SRC_GAP - 0.5, 1, +1, C);
    crests(ctx, T.stemIn, sIn, 1, C);
    crests(ctx, T.left, sJ, 1, C);
    crests(ctx, T.right, sJ, 1, C);
    // dopo la giunzione le due onde si sommano: stessa frequenza, ampiezza |cos(πΔ/λ)|, fase media
    const sOut = sJ + (T.left.L + T.right.L) / 2, A = ampOut();
    crests(ctx, T.stemOut, sOut, A, C);
    airArcs(ctx, 0, yOut, sOut + T.stemOut.L, OUT_SPAN, A, +1, C);
  }

  // altoparlante sopra l'imbuto d'ingresso
  const sx = X(0), sy = Y(ySrc), u = 7;
  ctx.fillStyle = '#2b2f35'; ctx.fillRect(sx - u * 1.6, sy - u * 2.2, u * 3.2, u * 1.4);
  ctx.beginPath(); ctx.moveTo(sx - u * 1.1, sy - u * 0.8); ctx.lineTo(sx - u * 2.2, sy + u * 0.4); ctx.lineTo(sx + u * 2.2, sy + u * 0.4); ctx.lineTo(sx + u * 1.1, sy - u * 0.8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = C.ink; ctx.font = '10px "DM Sans",sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(`sorgente · ${Lab.fmt(P.f, 0)} Hz`, sx + u * 2.8, sy - u);

  // rivelatore sotto l'imbuto d'uscita, con barra di livello
  const A = ampOut(), I = A * A, my = Y(yOut + OUT_SPAN);
  ctx.fillStyle = '#2b2f35'; ctx.beginPath(); ctx.arc(sx, my, 7, 0, 2 * Math.PI); ctx.fill(); ctx.fillRect(sx - 2, my + 6, 4, 8);
  const bx = sx + 40, bw = 12, bh = Math.min(110, (Y(yOut + OUT_SPAN) - Y(R)) * 1.1), by = my - bh;
  ctx.strokeStyle = C.axis; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, bh);
  const lvl = I > 0.95 ? C.green : I < 0.05 ? C.red : C.amber;
  ctx.fillStyle = lvl; ctx.fillRect(bx + 1, by + bh * (1 - I), bw - 2, bh * I);
  ctx.fillStyle = C.ink; ctx.font = '10px "DM Sans",sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('rivelatore', bx + bw + 8, my - 6);
  ctx.font = 'bold 11px "Space Mono",monospace'; ctx.fillStyle = lvl; ctx.fillText(`${Lab.fmt(I * 100, 0)} %`, bx + bw + 8, my + 8);

  // estrazione d della U (quota sopra il tratto superiore) e indicazioni dei rami
  const yq = Y(-R) - TUBE_D * G.s - 12;
  ctx.strokeStyle = C.amber; ctx.fillStyle = C.amber; ctx.lineWidth = 1.2;
  if (P.d > 0.3) {
    ctx.beginPath(); ctx.moveTo(X(XJ), yq); ctx.lineTo(X(XJ + P.d), yq); ctx.stroke();
    for (const x of [X(XJ), X(XJ + P.d)]) { ctx.beginPath(); ctx.moveTo(x, yq - 5); ctx.lineTo(x, yq + 5); ctx.stroke(); }
    ctx.font = '10px "Space Mono",monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(`d = ${Lab.fmt(P.d, 1)} cm`, Math.max(X(XJ + P.d / 2), X(XJ) + 42), yq - 6);
  }
  ctx.fillStyle = drag ? C.accent : C.ink; ctx.font = '10px "DM Sans",sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.fillText('↔ trascina la U', X(xR + R * 0.2), Y(R) + TUBE_D * G.s + 12);
  ctx.fillStyle = C.ink; ctx.fillText('ramo fisso', X(XL), Y(R) + TUBE_D * G.s + 12);

  // intestazione
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.accent; ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.fillText('Tubo di Quincke — interferenza di due onde sonore', 14, 22);
  ctx.fillStyle = C.ink; ctx.font = '10.5px "Space Mono",monospace';
  ctx.fillText(`λ = v/f = ${Lab.fmt(lambdaCm(), 1)} cm   Δ = 2d = ${Lab.fmt(pathDiff(), 1)} cm   Δ/λ = ${Lab.fmt(pathDiff() / lambdaCm(), 2)}`, 14, 40);
  if (P.showWaves) { ctx.font = '9.5px "DM Sans",sans-serif'; ctx.fillText('le barrette sono i fronti di compressione: avanzano rallentati, ma la loro distanza (λ) è quella vera', 14, Hc - 12); }
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
// 1: intensità in uscita al variare dell'estrazione: minimi equidistanti λ/2
function drawGraphD() {
  const g = Lab.panel(gCanvas[0], { title: 'Intensità in uscita (%) in funzione di d', xr: [0, D_MAX], xStep: 10, yr: [0, 100], yStep: 25, xLabel: 'estrazione della U scorrevole d (cm)' });
  if (!g) return; const [ctx, f] = g;
  const mins = minimaPositions();
  ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = f.C.red; ctx.globalAlpha = 0.6;
  for (const m of mins) { ctx.beginPath(); ctx.moveTo(f.X(m), f.T); ctx.lineTo(f.X(m), f.B); ctx.stroke(); }
  ctx.restore();
  Lab.plot(ctx, f, d => intensity(d) * 100, [0, D_MAX], f.C.accent, 2, [], 500);
  Lab.dot(ctx, f, P.d, intensity() * 100, f.C.amber, 4.5);
  if (mins.length >= 2) {
    const y = f.T + 10, x0 = f.X(mins[0]), x1 = f.X(mins[1]);
    ctx.strokeStyle = f.C.red; ctx.fillStyle = f.C.red; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    ctx.font = '9.5px "DM Sans",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(`λ/2 = ${Lab.fmt(lambdaCm() / 2, 1)} cm`, (x0 + x1) / 2, y - 2);
  }
}
// 2: pressione al rivelatore nel tempo: le due onde (sfasate di 2π·Δ/λ) e la loro somma
function drawGraphTime() {
  const T = 1000 / P.f, tmax = 3 * T, dph = 2 * Math.PI * pathDiff() / lambdaCm();
  const g = Lab.panel(gCanvas[1], { title: 'Pressione al rivelatore nel tempo', xr: [0, tmax], yr: [-1.1, 1.1], yStep: 0.5, xLabel: 't (ms)' });
  if (!g) return; const [ctx, f] = g;
  const w = 2 * Math.PI / T;
  Lab.plot(ctx, f, t => 0.5 * Math.cos(w * t), [0, tmax], 'rgba(160,160,160,0.9)', 1.2, [4, 3], 300);
  Lab.plot(ctx, f, t => 0.5 * Math.cos(w * t - dph), [0, tmax], f.C.violet, 1.2, [4, 3], 300);
  Lab.plot(ctx, f, t => 0.5 * (Math.cos(w * t) + Math.cos(w * t - dph)), [0, tmax], f.C.accent, 2.2, [], 300);
  Lab.legend(ctx, f.L + 8, f.T + 8, [['rgba(160,160,160,0.9)', 'ramo fisso', [4, 3]], [f.C.violet, 'ramo con la U', [4, 3]], [f.C.accent, 'somma']]);
}
// 3: a coulisse ferma, la trasmissione dipende dalla frequenza: si attenuano le f con Δ = (n + ½)·λ
function drawGraphF() {
  const g = Lab.panel(gCanvas[2], { title: `Intensità (%) in funzione della frequenza, d = ${Lab.fmt(P.d, 1)} cm`, xr: [100, 4000], xStep: 1000, yr: [0, 100], yStep: 25, xLabel: 'frequenza (Hz)' });
  if (!g) return; const [ctx, f] = g;
  Lab.plot(ctx, f, fr => intensity(P.d, fr) * 100, [100, 4000], f.C.green, 2, [], 600);
  Lab.dot(ctx, f, P.f, intensity() * 100, f.C.amber, 4.5);
}
function drawGraphs() { drawGraphD(); drawGraphTime(); drawGraphF(); }

// ═══ Audio: tono alla frequenza scelta, con volume pari all'ampiezza in uscita ═══
function audioToggle() {
  const btn = document.getElementById('btnAudio');
  if (audio) { audio.ctx.close(); audio = null; btn.textContent = '🔊  ASCOLTA'; return; }
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ac.createOscillator(), gain = ac.createGain();
  osc.type = 'sine'; osc.frequency.value = P.f; gain.gain.value = 0;
  osc.connect(gain).connect(ac.destination); osc.start();
  audio = { ctx: ac, osc, gain };
  btn.textContent = '■  SILENZIO';
}
function audioUpdate() {
  if (!audio) return;
  const t = audio.ctx.currentTime;
  audio.osc.frequency.setTargetAtTime(P.f, t, 0.02);
  audio.gain.gain.setTargetAtTime(0.18 * ampOut(), t, 0.03);
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls() {
  const cont = document.getElementById('controls'); cont.innerHTML = '';
  const ss = Lab.Section('Sorgente'); cont.appendChild(ss.el);
  ss.add(Lab.Slider({ label: 'Frequenza f', min: 200, max: 4000, step: 10, value: P.f, unit: ' Hz', onChange(v) { P.f = v; } }));
  const sa = Lab.Section('Aria'); cont.appendChild(sa.el);
  sa.add(Lab.Slider({ label: 'Temperatura', min: -10, max: 40, step: 1, value: P.tempC, unit: ' °C', onChange(v) { P.tempC = v; } }));
  const st = Lab.Section('Tubo'); cont.appendChild(st.el);
  sliderD = Lab.Slider({ label: 'Estrazione della U scorrevole d', min: 0, max: D_MAX, step: 0.1, value: P.d, unit: ' cm', onChange(v) { P.d = v; } });
  st.add(sliderD);
  const row = document.createElement('div'); row.className = 'ctrl-btn-row';
  const mk = (txt, fn) => { const b = document.createElement('button'); b.className = 'ctrl-btn'; b.textContent = txt; b.addEventListener('click', fn); row.appendChild(b); };
  // porta la coulisse al minimo (o massimo) successivo: lo spostamento fra due minimi è λ/2
  mk('minimo successivo', () => { const m = minimaPositions().find(x => x > P.d + 0.05); if (m != null) setD(m); });
  mk('massimo successivo', () => { const lam = lambdaCm(); const n = Math.floor(2 * P.d / lam + 1e-6) + 1; const m = n * lam / 2; if (m <= D_MAX) setD(m); });
  st.add(row);
  const hint = document.createElement('div'); hint.className = 'lab-note';
  hint.textContent = 'Per misurare la velocità del suono: porta la U su due minimi consecutivi. Lo spostamento è λ/2, quindi v = 2·(d₂ − d₁)·f.';
  st.add(hint);
  const sv = Lab.Section('Visualizzazione'); cont.appendChild(sv.el);
  sv.add(Lab.Toggle({ label: 'Mostra i fronti d’onda', value: P.showWaves, onChange(v) { P.showWaves = v; } }));
  sv.add(Lab.Slider({ label: 'Velocità animazione', min: 0.2, max: 3, step: 0.1, value: P.speed, unit: '×', onChange(v) { P.speed = v; } }));
}
function setD(v) { P.d = Math.max(0, Math.min(D_MAX, Math.round(v * 10) / 10)); if (sliderD) sliderD.setValue(P.d); }

// ═══ Trascinamento della U scorrevole ════════════════════════════════════════
function initDrag(canvas) {
  const pos = e => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left - G.ox) / G.s, y: (e.clientY - r.top - G.oy) / G.s }; };
  const onU = p => p.x > XJ + P.d - 2 && p.x < XR0 + P.d + R + 4 && Math.abs(p.y) < R + 4 && (Math.abs(Math.abs(p.y) - R) < 3.5 || p.x > XR0 + P.d);
  canvas.addEventListener('pointerdown', e => { const p = pos(e); if (onU(p)) { drag = { x0: p.x, d0: P.d }; canvas.setPointerCapture(e.pointerId); } });
  canvas.addEventListener('pointermove', e => {
    const p = pos(e);
    if (drag) setD(drag.d0 + p.x - drag.x0);
    else canvas.style.cursor = onU(p) ? 'ew-resize' : 'default';
  });
  const end = () => { drag = null; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
}

// ═══ Init ═════════════════════════════════════════════════════════════════════
function init() {
  Lab.initTheme();
  buildControls();
  gCanvas = Lab.graphPanels(document.getElementById('graphArea'), 3);
  readout = new Lab.Readout(document.getElementById('readout'), [
    { key: 'f', label: 'frequenza' },
    { key: 'v', label: 'velocità del suono' },
    { key: 'lam', label: 'λ = v/f' },
    { key: 'dp', label: 'cammino Δ = 2d' },
    { key: 'ratio', label: 'Δ / λ' },
    { key: 'I', label: 'intensità' },
    { key: 'cond', label: 'interferenza' },
  ]);
  const simCanvas = document.getElementById('simCanvas');
  initDrag(simCanvas);
  document.getElementById('btnAudio').addEventListener('click', audioToggle);
  document.getElementById('btnReset').addEventListener('click', () => {
    P.f = 1000; P.tempC = 20; P.d = 0; P.showWaves = true; P.speed = 1; buildControls();
  });

  function resize() {
    const area = document.querySelector('.lab-canvas-area'); if (!area) return;
    const ar = area.getBoundingClientRect();
    const rb = document.getElementById('readout').getBoundingClientRect();
    const ga = document.getElementById('graphArea'), gaH = ga ? ga.offsetHeight : 0;
    Lab.hidpi(simCanvas, Math.floor(ar.width), Math.max(200, Math.floor(ar.height - rb.height - gaH - 4)));
    Lab.fitPanels(gCanvas);
  }
  resize();
  new ResizeObserver(resize).observe(document.querySelector('.lab-canvas-area'));

  last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000; last = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0; dt = Math.min(dt, 0.05);
    tAnim += dt * P.speed;
    draw(simCanvas); drawGraphs(); audioUpdate();
    const I = intensity(), r = pathDiff() / lambdaCm();
    readout.set('f', Lab.fmt(P.f, 0) + ' Hz');
    readout.set('v', Lab.fmt(soundSpeed(), 1) + ' m/s');
    readout.set('lam', Lab.fmt(lambdaCm(), 2) + ' cm');
    readout.set('dp', Lab.fmt(pathDiff(), 1) + ' cm');
    readout.set('ratio', Lab.fmt(r, 2));
    readout.set('I', Lab.fmt(I * 100, 1) + ' %');
    readout.set('cond', I > 0.95 ? 'costruttiva' : I < 0.05 ? 'distruttiva' : 'parziale');
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
