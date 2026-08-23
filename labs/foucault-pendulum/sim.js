'use strict';

// ═══ Costanti fisiche ═════════════════════════════════════════════════════════
const TWO = Math.PI * 2;
const G_ACCEL = 9.81;
const OMEGA_EARTH = 7.292115e-5;                              // rad/s, velocità angolare di rotazione terrestre (giorno siderale)
// Il periodo di precessione reale va da ~24h (ai poli) a infinito (all'equatore) — troppo lento
// per essere osservato in una sessione di pochi secondi, mentre l'oscillazione del pendolo (pochi
// secondi di periodo) deve invece restare a ritmo naturale per "sembrare" un vero pendolo che
// oscilla. Si esagera quindi SOLO la velocità di precessione con un fattore fisso e dichiarato
// (mai l'oscillazione stessa) — stesso principio del TIME_COMPRESSION nei lab quantistici, qui
// applicato a una sola delle due scale temporali del sistema invece che a tutto l'orologio.
const PRECESSION_EXAGGERATION = 900;

const P = {
  lat_deg: 48.8,          // latitudine (°N, negativa=emisfero Sud) — 48.8° = Parigi, dimostrazione originale di Foucault (1851)
  L_m: 50,                // lunghezza del filo (m) — il pendolo del Panthéon di Parigi è lungo 67m
  amp_deg: 8,             // ampiezza angolare iniziale (°)
  ellip: 0,                // ellitticità iniziale (0-0.3): un rilascio imperfetto del pendolo reale
  showTrail: true,
  speed: 1.0,
  paused: false,
};

let animT = 0, last = 0;
let trail = [], hist = [];
const TRAIL_MAX = 3600;
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
const fmt = (x, u) => (Math.abs(x) < 10 ? x.toFixed(2) : x.toFixed(1)) + (u || '');

// ═══ Fisica ═══════════════════════════════════════════════════════════════════
// Nel sistema di riferimento della Terra rotante, un pendolo (piccole oscillazioni) soddisfa
// ẍ − 2Ω_z ẏ + ω₀²x = 0, ÿ + 2Ω_z ẋ + ω₀²y = 0 con Ω_z = Ω_terra·sin(latitudine). Ponendo
// u=x+iy si ottiene ü + 2iΩ_z u̇ + ω₀²u = 0, la cui soluzione esatta è una oscillazione a
// frequenza ω'=√(ω₀²+Ω_z²) vista in un piano che ruota uniformemente a velocità −Ω_z. Poiché
// Ω_z (≈10⁻⁵ rad/s) è sempre più piccolo di ω₀ (≈0.1–3 rad/s) di almeno 4 ordini di grandezza,
// ω'≈ω₀ con un errore relativo ~10⁻⁸ — quindi si usa direttamente questa soluzione analitica
// "piano che precede + oscillazione semplice al suo interno" invece di integrare con RK4: non è
// un'approssimazione ad hoc, è la soluzione esatta delle equazioni linearizzate a meno di un
// errore già trascurabile rispetto all'approssimazione di piccole oscillazioni stessa.
const omega0 = () => Math.sqrt(G_ACCEL / P.L_m);
const omegaZ = () => OMEGA_EARTH * Math.sin(P.lat_deg * Math.PI / 180);
const swingPeriodS = () => TWO / omega0();
const ampLinear = () => P.amp_deg * Math.PI / 180 * P.L_m;
function precessionPeriodH() {
  const oz = Math.abs(omegaZ());
  return oz > 1e-9 ? (TWO / oz) / 3600 : Infinity;
}
// Tempo REALE (ore) corrispondente a quanto animT ha già "raccontato": dato che l'unica cosa che
// PRECESSION_EXAGGERATION fa è comprimere il tempo (θ_animazione(animT)=θ_reale(animT·ESAGERAZ.)),
// il tempo reale trascorso è semplicemente animT·ESAGERAZIONE — indipendente da L e da latitudine
// (l'esagerazione è un fattore di conversione temporale puro, non una velocità angolare). Quanto
// QUEL tempo reale faccia ruotare il piano dipende invece da Ω_z, cioè solo dalla latitudine
// (mai da L: il periodo di precessione di un pendolo di Foucault NON dipende dalla lunghezza del
// filo — fatto fisico reale, non un'omissione — la lunghezza determina solo T₀, il periodo della
// singola oscillazione, una scala temporale completamente diversa).
function realHoursElapsed() { return animT * PRECESSION_EXAGGERATION / 3600; }
function fmtHours(h) {
  if (!isFinite(h)) return '∞';
  const totMin = Math.round(h * 60);
  const hh = Math.floor(totMin / 60), mm = totMin % 60;
  return `${hh}h ${String(mm).padStart(2, '0')}min`;
}
function positionAt(t) {
  const w0 = omega0(), A = ampLinear();
  const xi = A * Math.cos(w0 * t), eta = A * P.ellip * Math.sin(w0 * t);
  const theta = -omegaZ() * PRECESSION_EXAGGERATION * t;         // negativo → orario (emisfero N) nella convenzione standard (angolo che cresce=antiorario)
  const ct = Math.cos(theta), st = Math.sin(theta);
  return { x: xi * ct - eta * st, y: xi * st + eta * ct };
}

function trimHist() { const tMin = animT - winT() - 1; while (hist.length && hist[0].t < tMin) hist.shift(); }
function winT() { return swingPeriodS() * 6; }                  // finestra del grafico x(t)/y(t): alcuni periodi di oscillazione
function step(dt) {
  animT += dt;
  const pos = positionAt(animT);
  trail.push(pos); if (trail.length > TRAIL_MAX) trail.shift();
  hist.push({ t: animT, x: pos.x, y: pos.y }); trimHist();
}
function newRun() { animT = 0; trail = []; hist = []; }

// ═══ Rendering ════════════════════════════════════════════════════════════════
function drawGrid(ctx, W, H) {
  ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}
function drawSphere(ctx, x, y, r, hi, base) {
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = r * 0.5; ctx.shadowOffsetY = r * 0.15;
  const grad = ctx.createRadialGradient(x - r * 0.4, y - r * 0.42, r * 0.1, x, y, r * 1.05);
  grad.addColorStop(0, hi); grad.addColorStop(1, base);
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, r, 0, TWO); ctx.fill();
  ctx.restore();
}

// Geometria SEMPRE ricalcolata dai parametri correnti (mai dal tempo/animazione): la scala
// px/metro dipende solo da L e ampiezza — cambia se l'utente sposta uno slider, mai durante lo
// svolgimento dell'animazione, quindi ricalcolarla ad ogni frame non nasconde alcun effetto.
// Canvas diviso in due: vista dall'alto (rosa dei venti) a sinistra, vista 3D del pendolo che
// oscilla a lato destro — stesso schema device+pannello già usato in labs/millikan e labs/solar-system.
const ICOS3 = Math.cos(Math.PI / 6), ISIN3 = Math.sin(Math.PI / 6);   // proiezione isometrica standard
const L_MAX_SLIDER = 67;                                       // il filo del Panthéon, usato per calibrare UNA
                                                                 // scala px/metro FISSA nel pannello 3D — il filo è
                                                                 // così sempre in vera scala reciproca (67m occupa
                                                                 // tutto lo spazio verticale, un filo più corto una
                                                                 // frazione proporzionale), invece di un riferimento
                                                                 // artificiale a lunghezza fissa indipendente da L
function geom(W, H) {
  const scopeW = clamp(W * 0.34, 200, 420);
  const deviceW = Math.max(280, W - scopeW - 18);
  const scopeX = deviceW + 16, scopeY = 14, scopeH = H - 28, scopeWc = scopeW - 2;

  const cx = deviceW / 2, cy = H / 2 + 6;
  const R = Math.max(60, Math.min(deviceW, H) * 0.5 - 56);
  const scale = R * 0.80 / Math.max(ampLinear(), 0.05);

  const p3cx = scopeX + scopeWc / 2, p3cy = scopeY + scopeH * 0.09;   // sostegno vicino alla cima: spazio sotto per fili lunghi
  const S3 = (scopeH * 0.86) / L_MAX_SLIDER;

  G = { cx, cy, R, scale, W, H, deviceW, scopeX, scopeY, scopeH, scopeWc, p3cx, p3cy, S3 };
}
const sxp = x => G.cx + x * G.scale;
const syp = y => G.cy - y * G.scale;
function proj3D(x, y, z) {                                    // isometrica: (x,y) orizzontali, z verticale (negativo=giù)
  return { sx: G.p3cx + (x - y) * ICOS3 * G.S3, sy: G.p3cy + (x + y) * ISIN3 * G.S3 - z * G.S3 };
}

function draw(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  T = pal();
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
  drawGrid(ctx, W, H);
  geom(W, H);

  // rosa dei venti
  ctx.strokeStyle = T.ring; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.arc(G.cx, G.cy, G.R, 0, TWO); ctx.stroke();
  ctx.strokeStyle = 'rgba(150,175,205,0.18)'; ctx.lineWidth = 1;
  for (let a = 0; a < 360; a += 30) {
    const rad = a * Math.PI / 180;
    ctx.beginPath(); ctx.moveTo(G.cx, G.cy); ctx.lineTo(G.cx + Math.sin(rad) * G.R, G.cy - Math.cos(rad) * G.R); ctx.stroke();
  }
  ctx.fillStyle = T.sub; ctx.font = 'bold 11px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText('N', G.cx, G.cy - G.R - 8);
  ctx.fillText('S', G.cx, G.cy + G.R + 16);
  ctx.fillText('E', G.cx + G.R + 12, G.cy + 4);
  ctx.fillText('O', G.cx - G.R - 12, G.cy + 4);
  // cerchio di ampiezza massima (dove batterebbe il pendolo senza precessione)
  ctx.strokeStyle = 'rgba(150,175,205,0.22)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.arc(G.cx, G.cy, G.scale * ampLinear(), 0, TWO); ctx.stroke(); ctx.setLineDash([]);

  // scia (traccia della rosetta)
  if (P.showTrail && trail.length > 1) {
    ctx.save(); ctx.beginPath(); ctx.arc(G.cx, G.cy, G.R, 0, TWO); ctx.clip();
    ctx.beginPath();
    trail.forEach((p, i) => { const X = sxp(p.x), Y = syp(p.y); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
    ctx.strokeStyle = 'rgba(0,212,255,0.45)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
  }

  // asse istantaneo di oscillazione (linea che passa per il centro, mostra il piano attuale)
  const pos = positionAt(animT);
  const theta = -omegaZ() * PRECESSION_EXAGGERATION * animT;
  const axLen = G.scale * ampLinear() * 1.08;
  ctx.strokeStyle = 'rgba(255,157,60,0.55)'; ctx.lineWidth = 1.4; ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(G.cx - Math.sin(theta) * axLen, G.cy + Math.cos(theta) * axLen);
  ctx.lineTo(G.cx + Math.sin(theta) * axLen, G.cy - Math.cos(theta) * axLen);
  ctx.stroke(); ctx.setLineDash([]);

  // sostegno e filo (prospettiva semplice: il punto di sospensione è al centro)
  ctx.fillStyle = T.ring; ctx.beginPath(); ctx.arc(G.cx, G.cy, 3.5, 0, TWO); ctx.fill();
  const bx = sxp(pos.x), by = syp(pos.y);
  ctx.strokeStyle = 'rgba(180,200,220,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(G.cx, G.cy); ctx.lineTo(bx, by); ctx.stroke();

  // bob del pendolo
  drawSphere(ctx, bx, by, 9, '#fff3d6', '#c98a2e');

  // verso di precessione
  const lat = P.lat_deg;
  const verso = Math.abs(lat) < 0.05 ? 'nessuna (equatore)' : (lat > 0 ? 'oraria' : 'antioraria');
  ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText(`precessione ${verso} · esagerata ×${PRECESSION_EXAGGERATION} per essere visibile (periodo reale ${precessionPeriodH() === Infinity ? '∞' : precessionPeriodH().toFixed(1) + ' h'})`, G.cx, H - 8);

  // intestazione
  ctx.textAlign = 'left';
  ctx.fillStyle = T.accent; ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.fillText('Pendolo di Foucault — precessione del piano di oscillazione', 14, 22);
  ctx.fillStyle = T.txt; ctx.font = '10px "Space Mono",monospace';
  ctx.fillText(`φ=${P.lat_deg.toFixed(1)}°   L=${P.L_m.toFixed(1)} m   T₀=${swingPeriodS().toFixed(2)} s`, 14, 40);

  draw3DPanel(ctx, pos, theta);
}

// Pannello 3D: stesso pendolo, vista isometrica laterale, filo IN VERA SCALA (S3 è fissa,
// calibrata su L_MAX_SLIDER) — niente riquadro/sfondo proprio, si disegna direttamente sopra
// lo sfondo del canvas principale, solo l'etichetta resta a indicare il pannello.
function draw3DPanel(ctx, pos, theta) {
  const { scopeX, scopeY, scopeWc, scopeH, p3cx, p3cy, S3 } = G;
  ctx.fillStyle = 'rgba(0,212,255,0.8)'; ctx.font = 'bold 11px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText('VISTA 3D', scopeX + scopeWc / 2, scopeY + 18);

  ctx.save(); ctx.beginPath(); ctx.rect(scopeX, scopeY, scopeWc, scopeH); ctx.clip();

  const L = P.L_m, A = ampLinear() / L;                          // ampiezza angolare (rad), indipendente da L

  // "pavimento": proiezione del cerchio di ampiezza massima al livello del punto più basso
  // dell'oscillazione (z=−L), riferimento di profondità/orientamento del piano — reso più
  // evidente (più opaco, tratteggio più marcato, colore accento) su richiesta esplicita
  ctx.strokeStyle = 'rgba(0,212,255,0.42)'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.6; ctx.beginPath();
  for (let i = 0; i <= 64; i++) { const a = i / 64 * TWO; const p = proj3D(Math.sin(a) * L * A, Math.cos(a) * L * A, -L); i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy); }
  ctx.stroke(); ctx.setLineDash([]);

  // supporto/soffitto
  const sup = proj3D(0, 0, 0);
  ctx.strokeStyle = T.ring; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(sup.sx - 22, sup.sy - 10); ctx.lineTo(sup.sx, sup.sy); ctx.lineTo(sup.sx + 22, sup.sy - 10); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(sup.sx - 30, sup.sy - 10); ctx.lineTo(sup.sx + 30, sup.sy - 10); ctx.stroke();

  // asse istantaneo di oscillazione, proiettato (stesso ruolo della linea arancione nella vista dall'alto)
  const axA = L * A * 1.1;
  const pA = proj3D(-Math.sin(theta) * axA, Math.cos(theta) * axA, -L * Math.cos(A));
  const pB = proj3D(Math.sin(theta) * axA, -Math.cos(theta) * axA, -L * Math.cos(A));
  ctx.strokeStyle = 'rgba(255,157,60,0.4)'; ctx.lineWidth = 1.2; ctx.setLineDash([2, 3]);
  ctx.beginPath(); ctx.moveTo(pA.sx, pA.sy); ctx.lineTo(pB.sx, pB.sy); ctx.stroke(); ctx.setLineDash([]);

  // filo e bob: pos.x/pos.y sono già le coordinate reali (m) — il filo è in vera scala con L
  const bobZ = -Math.sqrt(Math.max(0, L * L - pos.x * pos.x - pos.y * pos.y));
  const pb = proj3D(pos.x, pos.y, bobZ);
  ctx.strokeStyle = 'rgba(180,200,220,0.5)'; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(sup.sx, sup.sy); ctx.lineTo(pb.sx, pb.sy); ctx.stroke();
  drawSphere(ctx, pb.sx, pb.sy, 10, '#fff3d6', '#c98a2e');

  ctx.restore();
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
function gBase(ctx, W, H, PAD) {
  ctx.fillStyle = T.gBg; ctx.fillRect(0, 0, W, H);
  const gW = W - PAD.l - PAD.r, gH = H - PAD.t - PAD.b;
  ctx.strokeStyle = T.gAxis; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(PAD.l, PAD.t); ctx.lineTo(PAD.l, PAD.t + gH); ctx.lineTo(PAD.l + gW, PAD.t + gH); ctx.stroke();
  return { gW, gH };
}
// 1: x(t) e y(t) — finestra fissa (alcuni periodi di oscillazione), mostra il "battimento" lento
// dovuto alla precessione sovrapposto all'oscillazione veloce
function drawGraphXY_t() {
  const cv = gCanvas[0]; if (!cv || !cv.width) return;
  const ctx = gCtx[0], W = cv.width, H = cv.height, PAD = { t: 14, b: 16, l: 22, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const WIN_T = winT(), A = ampLinear();
  const zero = PAD.t + gH / 2;
  ctx.strokeStyle = T.gAxis; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(PAD.l, zero); ctx.lineTo(PAD.l + gW, zero); ctx.stroke();
  const xOf = t => PAD.l + (t - (animT - WIN_T)) / WIN_T * gW;
  const yOf = v => zero - clamp(v / A, -1, 1) * (gH * 0.46);
  ctx.save(); ctx.beginPath(); ctx.rect(PAD.l, PAD.t, gW, gH); ctx.clip();
  [['x', '#00d4ff'], ['y', '#ff9d4d']].forEach(([key, col]) => {
    ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.beginPath();
    hist.forEach((p, i) => { const x = xOf(p.t), y = yOf(p[key]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
  });
  ctx.restore();
  ctx.fillStyle = '#00d4ff'; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('x', PAD.l + 2, PAD.t + 7);
  ctx.fillStyle = '#ff9d4d'; ctx.fillText('y', PAD.l + 2, PAD.t + 16);
}
// 2: velocità di precessione Ω_z in funzione della latitudine — curva analitica, ricalcolata
// solo se cambia il riferimento (mai un'evoluzione temporale)
function drawGraphOmegaLat() {
  const cv = gCanvas[1]; if (!cv || !cv.width) return;
  const ctx = gCtx[1], W = cv.width, H = cv.height, PAD = { t: 14, b: 16, l: 26, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const degPerH = rad => rad * (180 / Math.PI) * 3600;
  const maxDegH = degPerH(OMEGA_EARTH);
  const xOf = phi => PAD.l + (phi + 90) / 180 * gW, yOf = v => PAD.t + gH - clamp((v + maxDegH) / (2 * maxDegH), 0, 1) * gH;
  ctx.strokeStyle = T.gAxis; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(PAD.l, yOf(0)); ctx.lineTo(PAD.l + gW, yOf(0)); ctx.stroke();
  ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 1.6; ctx.beginPath();
  for (let phi = -90; phi <= 90; phi += 1) { const v = degPerH(OMEGA_EARTH * Math.sin(phi * Math.PI / 180)); const x = xOf(phi), y = yOf(v); phi === -90 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
  ctx.stroke();
  const curV = degPerH(omegaZ());
  ctx.fillStyle = '#ff9d4d'; ctx.beginPath(); ctx.arc(xOf(P.lat_deg), yOf(curV), 3.2, 0, TWO); ctx.fill();
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('Ω_z (°/h)', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('φ', PAD.l + gW - 2, PAD.t + gH - 3);
}
// 3: traiettoria X-Y pulita (rosetta), stessa scia del canvas principale ma su assi in metri
function drawGraphRosette() {
  const cv = gCanvas[2]; if (!cv || !cv.width) return;
  const ctx = gCtx[2], W = cv.width, H = cv.height, PAD = { t: 14, b: 14, l: 14, r: 10 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const cx = PAD.l + gW / 2, cy = PAD.t + gH / 2, A = ampLinear(), s = Math.min(gW, gH) * 0.46 / Math.max(A, 0.05);
  ctx.strokeStyle = T.gAxis; ctx.lineWidth = 0.4; ctx.setLineDash([2, 3]);
  ctx.beginPath(); ctx.arc(cx, cy, s * A, 0, TWO); ctx.stroke(); ctx.setLineDash([]);
  if (trail.length > 1) {
    ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 1; ctx.beginPath();
    trail.forEach((p, i) => { const x = cx + p.x * s, y = cy - p.y * s; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
  }
  const pos = positionAt(animT);
  ctx.fillStyle = '#ff9d4d'; ctx.beginPath(); ctx.arc(cx + pos.x * s, cy - pos.y * s, 3, 0, TWO); ctx.fill();
}
function drawGraphs() {
  const titles = ['x(t), y(t)', 'Ω_z(φ) — velocità di precessione', 'Traiettoria (rosetta)'];
  for (let i = 0; i < 3; i++) if (gTitle[i]) gTitle[i].textContent = titles[i];
  drawGraphXY_t(); drawGraphOmegaLat(); drawGraphRosette();
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls() {
  const cont = document.getElementById('controls'); cont.innerHTML = '';

  const sl = Lab.Section('Luogo'); cont.appendChild(sl.el);
  sl.add(Lab.Slider({ label: 'Latitudine φ', min: -90, max: 90, step: 0.5, value: P.lat_deg, unit: '°', onChange(v) { P.lat_deg = v; newRun(); } }));

  const sp = Lab.Section('Pendolo'); cont.appendChild(sp.el);
  sp.add(Lab.Slider({ label: 'Lunghezza del filo L', min: 1, max: 67, step: 0.5, value: P.L_m, unit: ' m', onChange(v) { P.L_m = v; newRun(); } }));
  sp.add(Lab.Slider({ label: 'Ampiezza iniziale', min: 1, max: 8, step: 0.5, value: P.amp_deg, unit: '°', onChange(v) { P.amp_deg = v; newRun(); } }));
  sp.add(Lab.Slider({ label: 'Ellitticità iniziale', min: 0, max: 0.3, step: 0.01, value: P.ellip, unit: '', onChange(v) { P.ellip = v; newRun(); } }));

  const sv = Lab.Section('Visualizzazione'); cont.appendChild(sv.el);
  sv.add(Lab.Toggle({ label: 'Scia (rosetta)', value: P.showTrail, onChange(v) { P.showTrail = v; } }));
  sv.add(Lab.Slider({ label: 'Velocità animazione', min: 0.2, max: 10, step: 0.1, value: P.speed, unit: '×', onChange(v) { P.speed = v; } }));
}

function buildReadout() {
  const cont = document.getElementById('readout'); cont.innerHTML = '';
  readout = new Lab.Readout(cont, [
    { key: 't', label: 'Tempo reale trascorso' },
    { key: 'Tprec', label: 'Periodo precessione reale' },
    { key: 'angle', label: 'Angolo piano ruotato' },
    { key: 'verso', label: 'Verso' },
    { key: 'T0', label: 'Periodo oscillazione T₀' },
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
    P.lat_deg = 48.8; P.L_m = 20; P.amp_deg = 3; P.ellip = 0;
    P.showTrail = true; P.speed = 1.0; P.paused = false;
    buildControls(); newRun(); syncPlay();
  });

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
      const lat = P.lat_deg;
      const verso = Math.abs(lat) < 0.05 ? 'nessuna' : (lat > 0 ? 'oraria ↻' : 'antioraria ↺');
      const angleDeg = (Math.abs(omegaZ()) * PRECESSION_EXAGGERATION * animT * 180 / Math.PI) % 360;
      readout.set('t', fmtHours(realHoursElapsed()));
      readout.set('T0', fmt(swingPeriodS(), ' s'));
      readout.set('Tprec', precessionPeriodH() === Infinity ? '∞ (equatore)' : fmt(precessionPeriodH(), ' h'));
      readout.set('angle', fmt(angleDeg, '°'));
      readout.set('verso', verso);
    } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
