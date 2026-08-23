'use strict';

// ═══ Costanti fisiche ═════════════════════════════════════════════════════════
const TWO = Math.PI * 2;
const G_ACCEL = 9.81;
const STAND_H = 0.07;                                        // m, altezza decorativa del sostegno sotto il perno

const P = {
  m: 0.3,                 // massa del rotore (kg)
  rpm: 3000,               // velocità di rotazione iniziale (giri/min)
  R_rotor: 0.045,          // raggio del rotore (m)
  r_arm: 0.14,             // distanza dal perno al baricentro del rotore (m) — braccio della coppia
  theta_deg: 65,           // angolo dell'asse di rotazione dalla VERTICALE (°) — 0=asse verticale (nessuna coppia), 90=asse orizzontale
  dampRate: 0.01,          // smorzamento dello spin (1/s): ω(t)=ω₀·e^(−dampRate·t)
  showTrail: true,
  speed: 1.0,
  paused: false,
};

let animT = 0, last = 0, fallen = false;
let trail = [], hist = [];
const TRAIL_MAX = 2000;
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
const fmt = (x, u) => (Math.abs(x) < 10 ? x.toFixed(3) : x.toFixed(1)) + (u || '');

// ═══ Vettori 3D (minimi) ══════════════════════════════════════════════════════
const vAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vScale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const vCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vNorm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// ═══ Fisica ═══════════════════════════════════════════════════════════════════
// Giroscopio veloce (approssimazione standard, la stessa di ogni trattazione elementare): un
// rotore di momento d'inerzia I₃=½mR² che gira a ω attorno al proprio asse, appoggiato su un
// perno a distanza r dal baricentro, inclinato di θ dalla verticale. La coppia di gravità
// τ=mgr·sinθ fa precedere l'asse (quindi L=I₃ω) attorno alla verticale con velocità
//   Ω_prec = |dL/dt|/(L·sinθ) = (mgr·sinθ)/(I₃ω·sinθ) = mgr/(I₃ω)
// il fattore sinθ si SEMPLIFICA: la velocità di precessione NON dipende dall'inclinazione —
// fatto sorprendente ma reale (finché θ≠0, dove la coppia si annulla e il giroscopo "dorme"
// verticale senza precedere), analogo alla scoperta già fatta nel pendolo di Foucault che la
// precessione non dipende dalla lunghezza del filo. Lo smorzamento rallenta ω nel tempo
// (ω(t)=ω₀e^(−dampRate·t)): poiché Ω_prec∝1/ω, la precessione ACCELERA mentre il giroscopo
// rallenta — esattamente il comportamento osservabile in una vera trottola che "corre sempre
// più veloce" prima di cadere. φ(t) ha forma chiusa (integrale di un'esponenziale) quindi non
// serve RK4, come già in Millikan/Foucault: qui la scelta analitica non è un'approssimazione ad
// hoc ma la soluzione esatta del modello a precessione stazionaria.
const omega0 = () => P.rpm * TWO / 60;                          // rad/s
const I3 = () => 0.5 * P.m * P.R_rotor * P.R_rotor;
const torqueMax = () => P.m * G_ACCEL * P.r_arm;                 // N·m, coppia a sinθ=1 (il valore che conta per Ω_prec)
// A θ=0 esatto (asse verticale) la coppia di gravità è IDENTICAMENTE nulla (sinθ=0): l'equazione
// che definisce Ω_prec diventa 0=Ω_prec·L·0, soddisfatta per qualunque Ω_prec — indeterminata, non
// "una velocità qualunque". La scelta fisicamente corretta è Ω_prec=0 (il giroscopio "dorme"
// verticale, nessuna coppia che lo spinga a precedere): gestito esplicitamente qui perché nella
// formula semplificata sotto il fattore sinθ si è già semplificato via e non lo vedrebbe da solo.
const precOmega0 = () => P.theta_deg < 0.5 ? 0 : torqueMax() / (I3() * omega0());   // Ω_prec a t=0
function omegaAt(t) { return omega0() * Math.exp(-P.dampRate * t); }
function precOmegaAt(t) { return precOmega0() * Math.exp(P.dampRate * t); }
function phiAt(t) {
  const O0 = precOmega0();
  return P.dampRate > 1e-6 ? (O0 / P.dampRate) * (Math.exp(P.dampRate * t) - 1) : O0 * t;
}
// Ω_prec∝1/ω: lasciando decadere lo spin fino quasi a zero la precessione si avvitava a velocità
// implausibili (fino a 25× quella iniziale con la soglia precedente del 4%) prima di fermarsi.
// Soglia alzata al 20%: il giroscopio "cade" (si ferma) prima che la precessione si impenni così
// tanto, restando comunque ben oltre il punto in cui l'approssimazione "giroscopio veloce" smette
// di reggere fisicamente.
const FALL_FRACTION = 0.2;
// Con lo smorzamento attivo l'inclinazione NON resta costante: mentre lo spin si esaurisce il
// giroscopio "si affloscia" verso l'orizzontale, esattamente come una vera trottola che accelera
// la precessione E si abbassa sempre di più prima di cadere — non solo la seconda cosa. Questo è
// un accoppiamento SEMPLIFICATO (non la soluzione rigorosa delle equazioni di Eulero del corpo
// rigido, che richiederebbe integrare anche l'angolo θ con un potenziale efficace): qui θ(t)
// interpola in modo liscio da θ₀ (allo spin iniziale) a 90° (orizzontale, corpo praticamente
// caduto) man mano che ω scende verso la soglia di caduta — riproduce il comportamento
// qualitativo corretto senza pretendere di essere la dinamica esatta.
function thetaAt(t) {
  if (P.dampRate < 1e-6) return P.theta_deg;
  const om0 = omega0(), omFall = om0 * FALL_FRACTION, om = omegaAt(t);
  const rho = clamp((om - omFall) / (om0 - omFall), 0, 1);        // 1 allo spin pieno, 0 alla soglia di caduta
  return 90 - (90 - P.theta_deg) * Math.pow(rho, 2.4);
}
function axisDirAt(t) {
  const th = thetaAt(t) * Math.PI / 180, phi = phiAt(t);
  return [Math.sin(th) * Math.cos(phi), Math.sin(th) * Math.sin(phi), Math.cos(th)];
}

function trimHist() { const tMin = animT - winT() - 1; while (hist.length && hist[0].t < tMin) hist.shift(); }
function winT() { const p = precOmega0() > 1e-9 ? TWO / precOmega0() : 10; return clamp(p * 3, 3, 60); }
function step(dt) {
  if (fallen) return;
  animT += dt;
  if (omegaAt(animT) < omega0() * FALL_FRACTION) fallen = true;
  const dir = axisDirAt(animT);
  const tip = vScale(dir, P.r_arm + P.R_rotor * 0.6);
  trail.push({ t: animT, p: tip });
  if (trail.length > TRAIL_MAX) trail.shift();   // tetto di sicurezza soltanto: la traccia copre l'intero lancio, non una finestra recente
  hist.push({ t: animT, om: omegaAt(animT), prec: precOmegaAt(animT) }); trimHist();
}
function newRun() { animT = 0; fallen = false; trail = []; hist = []; }

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

// Telecamera orbitale trascinabile (stesso schema del lab Cavendish): azimut + elevazione attorno
// alla scena, nessun depth-sorting delle geometrie (accettabile per questa scena semplice).
let cam = { az: -Math.PI * 0.22, el: 0.5, zoom: 1 };
let camDrag = null;
function geom(W, H) {
  const cx = W * 0.5, cy = H * 0.58;
  const extent = P.r_arm + P.R_rotor + 0.06;
  const S = Math.min(W * 0.9, H * 0.85) * 0.30 / extent;
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

function draw(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  T = pal();
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
  drawGrid(ctx, W, H);
  geom(W, H);

  const dir = axisDirAt(animT);
  // base ortonormale del piano del rotore, perpendicolare all'asse di spin
  const ref = Math.abs(dir[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const e1 = vNorm(vCross(dir, ref)), e2 = vNorm(vCross(dir, e1));

  // sostegno: base + palo verticale fino al perno
  const baseP = proj([0, 0, -STAND_H]), pivotP = proj([0, 0, 0]);
  ctx.beginPath(); ctx.ellipse(baseP.sx, baseP.sy, 34, 10, 0, 0, TWO);
  ctx.fillStyle = dk() ? '#4b5563' : '#8b95a3'; ctx.fill();
  ctx.strokeStyle = T.ring; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(baseP.sx, baseP.sy); ctx.lineTo(pivotP.sx, pivotP.sy); ctx.stroke();

  // traccia della precessione (punta del vettore L): copre l'intero lancio dall'inizio, non solo
  // una finestra recente. Disegnata in DUE passate: (1) l'intera storia in un SOLO stroke() a
  // bassa opacità — un solo path, non un segmento per chiamata, altrimenti centinaia di
  // sovrapposizioni si sommerebbero fino a sembrare quasi opache, vanificando l'effetto "ghost";
  // (2) sopra, un secondo stroke più marcato ricalca solo le ultime orbite recenti, così il giro
  // ATTUALE resta ben leggibile anche quando la precessione nel frattempo è molto accelerata.
  if (P.showTrail && trail.length > 1) {
    ctx.beginPath();
    trail.forEach((p, i) => { const s = proj(p.p); i ? ctx.lineTo(s.sx, s.sy) : ctx.moveTo(s.sx, s.sy); });
    ctx.strokeStyle = 'rgba(255,90,90,0.16)'; ctx.lineWidth = 1.2; ctx.stroke();

    const pRec = precOmegaAt(animT);
    const recentWin = clamp((pRec > 1e-9 ? TWO / pRec : 10) * 2.2, 0.6, 30);
    const tMinRecent = animT - recentWin;
    let startIdx = 0;
    while (startIdx < trail.length - 1 && trail[startIdx].t < tMinRecent) startIdx++;
    if (trail.length - startIdx > 1) {
      ctx.beginPath();
      for (let i = startIdx; i < trail.length; i++) { const s = proj(trail[i].p); i > startIdx ? ctx.lineTo(s.sx, s.sy) : ctx.moveTo(s.sx, s.sy); }
      ctx.strokeStyle = 'rgba(255,90,90,0.6)'; ctx.lineWidth = 1.4; ctx.stroke();
    }
  }

  // asse di rotazione (perno → oltre il rotore)
  const rotorC = vScale(dir, P.r_arm);
  const axisEnd = vScale(dir, P.r_arm + P.R_rotor * 0.5);
  const pAxisEnd = proj(axisEnd);
  ctx.strokeStyle = 'rgba(200,210,225,0.55)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(pivotP.sx, pivotP.sy); ctx.lineTo(pAxisEnd.sx, pAxisEnd.sy); ctx.stroke();

  // anello del gimbal (decorativo), nel piano del rotore, leggermente più largo
  const gimbalR = P.R_rotor * 1.35;
  ctx.strokeStyle = 'rgba(150,175,205,0.5)'; ctx.lineWidth = 2.2;
  ctx.beginPath();
  for (let i = 0; i <= 48; i++) { const a = i / 48 * TWO; const p = proj(vAdd(rotorC, vAdd(vScale(e1, Math.cos(a) * gimbalR), vScale(e2, Math.sin(a) * gimbalR)))); i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy); }
  ctx.stroke();

  // rotore: disco CON SPESSORE (faccia posteriore in ombra → fascia laterale → faccia anteriore,
  // in quest'ordine — senza depth-sorting è l'unico ordine di disegno che legge come un cilindro
  // pieno invece che come un disco piatto) + un paio di razze che ruotano a una velocità VISIVA
  // (non ω reale: a migliaia di rpm sarebbe un frame indistinguibile da uno sfocato — qui solo per
  // suggerire che sta girando, tarata sulla velocità di animazione, non sulla vera velocità angolare)
  ctx.save();
  const halfTh = P.R_rotor * 0.18;
  const backC = vAdd(rotorC, vScale(dir, -halfTh)), frontC = vAdd(rotorC, vScale(dir, halfTh));
  const NSEG = 40;
  const backPts = [], frontPts = [];
  for (let i = 0; i <= NSEG; i++) {
    const a = i / NSEG * TWO;
    const rim = vAdd(vScale(e1, Math.cos(a) * P.R_rotor), vScale(e2, Math.sin(a) * P.R_rotor));
    backPts.push(vAdd(backC, rim)); frontPts.push(vAdd(frontC, rim));
  }
  ctx.beginPath(); backPts.forEach((v, i) => { const p = proj(v); i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy); }); ctx.closePath();
  ctx.fillStyle = '#2e3644'; ctx.fill();
  ctx.fillStyle = '#3c4658';
  for (let i = 0; i < NSEG; i++) {
    const b0 = proj(backPts[i]), b1 = proj(backPts[i + 1]), f0 = proj(frontPts[i]), f1 = proj(frontPts[i + 1]);
    ctx.beginPath(); ctx.moveTo(b0.sx, b0.sy); ctx.lineTo(b1.sx, b1.sy); ctx.lineTo(f1.sx, f1.sy); ctx.lineTo(f0.sx, f0.sy); ctx.closePath(); ctx.fill();
  }
  ctx.beginPath(); frontPts.forEach((v, i) => { const p = proj(v); i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy); }); ctx.closePath();
  const pc = proj(frontC);
  const rg = ctx.createRadialGradient(pc.sx - 6, pc.sy - 6, 2, pc.sx, pc.sy, P.R_rotor * G.S);
  rg.addColorStop(0, '#aebfd6'); rg.addColorStop(1, '#4a5568');
  ctx.fillStyle = rg; ctx.fill();
  ctx.strokeStyle = 'rgba(220,230,245,0.4)'; ctx.lineWidth = 1; ctx.stroke();
  const spinVis = (animT * clamp(P.rpm / 3000, 0.3, 3) * 4) % TWO;
  ctx.strokeStyle = 'rgba(20,30,45,0.5)'; ctx.lineWidth = 1.6;
  [0, Math.PI / 2].forEach(off => {
    const a = spinVis + off;
    const p1 = proj(vAdd(frontC, vAdd(vScale(e1, Math.cos(a) * P.R_rotor), vScale(e2, Math.sin(a) * P.R_rotor))));
    const p2 = proj(vAdd(frontC, vAdd(vScale(e1, -Math.cos(a) * P.R_rotor), vScale(e2, -Math.sin(a) * P.R_rotor))));
    ctx.beginPath(); ctx.moveTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy); ctx.stroke();
  });
  ctx.restore();

  // vettore momento angolare L (dal centro del rotore, oltre l'asse)
  const Lend = vScale(dir, P.r_arm + P.R_rotor + 0.05);
  const pL0 = proj(rotorC), pL1 = proj(Lend);
  ctx.strokeStyle = fallen ? 'rgba(255,90,90,0.5)' : '#ff5d3a'; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(pL0.sx, pL0.sy); ctx.lineTo(pL1.sx, pL1.sy); ctx.stroke();
  const ang = Math.atan2(pL1.sy - pL0.sy, pL1.sx - pL0.sx);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.beginPath(); ctx.moveTo(pL1.sx, pL1.sy);
  ctx.lineTo(pL1.sx - 9 * Math.cos(ang - 0.4), pL1.sy - 9 * Math.sin(ang - 0.4));
  ctx.lineTo(pL1.sx - 9 * Math.cos(ang + 0.4), pL1.sy - 9 * Math.sin(ang + 0.4));
  ctx.closePath(); ctx.fill();
  ctx.font = 'bold 12px "Space Mono",monospace'; ctx.textAlign = 'left';
  ctx.fillText('L', pL1.sx + 8, pL1.sy - 4);

  // perno: disegnato per ULTIMO così resta sempre visibile come riferimento fisso, anche quando
  // la sua proiezione a schermo ricade sotto il disco del rotore (capita spesso in isometrica)
  drawSphere(ctx, pivotP.sx, pivotP.sy, 5, '#dfe8f2', '#7c8ba0');

  // intestazione
  ctx.textAlign = 'left';
  ctx.fillStyle = T.accent; ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.fillText('Giroscopio — precessione sotto la coppia di gravità', 14, 22);
  ctx.fillStyle = T.txt; ctx.font = '10px "Space Mono",monospace';
  ctx.fillText(`m=${P.m.toFixed(2)} kg   ω=${P.rpm.toFixed(0)} rpm   θ₀=${P.theta_deg.toFixed(0)}°   θ=${thetaAt(animT).toFixed(0)}° (dalla verticale)`, 14, 40);

  ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText(fallen
    ? 'lo spin è sceso troppo: il giroscopio è caduto — premi "Nuovo lancio" per ripartire'
    : 'Ω_prec = mgr/(I₃ω) — NON dipende da θ (finché θ≠0): prova a cambiare l\'inclinazione senza fermare l\'animazione', G.cx, H - 8);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
function gBase(ctx, W, H, PAD) {
  ctx.fillStyle = T.gBg; ctx.fillRect(0, 0, W, H);
  const gW = W - PAD.l - PAD.r, gH = H - PAD.t - PAD.b;
  ctx.strokeStyle = T.gAxis; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(PAD.l, PAD.t); ctx.lineTo(PAD.l, PAD.t + gH); ctx.lineTo(PAD.l + gW, PAD.t + gH); ctx.stroke();
  return { gW, gH };
}
// 1: ω(t) — decadimento dello spin (tempo reale, nessuna compressione: qui i tempi sono già
// dell'ordine di secondi/minuti, non femtosecondi o ore come negli altri lab di questo sito)
function drawGraphOmega() {
  const cv = gCanvas[0]; if (!cv || !cv.width) return;
  const ctx = gCtx[0], W = cv.width, H = cv.height, PAD = { t: 14, b: 16, l: 26, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const WIN_T = winT();
  const xOf = t => PAD.l + (t - (animT - WIN_T)) / WIN_T * gW;
  const yOf = om => PAD.t + gH - clamp(om / omega0(), 0, 1) * gH;
  ctx.save(); ctx.beginPath(); ctx.rect(PAD.l, PAD.t, gW, gH); ctx.clip();
  ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 1.5; ctx.beginPath();
  hist.forEach((p, i) => { const x = xOf(p.t), y = yOf(p.om); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('ω', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('t', PAD.l + gW - 2, PAD.t + gH - 3);
}
// 2: Ω_prec(t) — accelera mentre ω rallenta
function drawGraphPrec() {
  const cv = gCanvas[1]; if (!cv || !cv.width) return;
  const ctx = gCtx[1], W = cv.width, H = cv.height, PAD = { t: 14, b: 16, l: 26, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const WIN_T = winT();
  // pMax ha un pavimento minimo: a θ=0 la precessione è identicamente nulla (coppia zero), e senza
  // questo pavimento tutti i termini si azzererebbero insieme causando una divisione 0/0 (NaN)
  const pMax = Math.max(precOmega0() * 3, hist.length ? hist[hist.length - 1].prec * 1.15 : precOmega0() * 2, 1e-3);
  const xOf = t => PAD.l + (t - (animT - WIN_T)) / WIN_T * gW;
  const yOf = om => PAD.t + gH - clamp(om / pMax, 0, 1) * gH;
  ctx.save(); ctx.beginPath(); ctx.rect(PAD.l, PAD.t, gW, gH); ctx.clip();
  ctx.strokeStyle = '#ff9d4d'; ctx.lineWidth = 1.5; ctx.beginPath();
  hist.forEach((p, i) => { const x = xOf(p.t), y = yOf(p.prec); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('Ω_prec', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('t', PAD.l + gW - 2, PAD.t + gH - 3);
}
// 3: Ω_prec in funzione di θ — dovrebbe essere una retta ORIZZONTALE (indipendenza da θ),
// ricalcolata dai parametri correnti (non un'evoluzione temporale)
function drawGraphPrecTheta() {
  const cv = gCanvas[2]; if (!cv || !cv.width) return;
  const ctx = gCtx[2], W = cv.width, H = cv.height, PAD = { t: 14, b: 16, l: 26, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  // la retta di riferimento usa il valore GENERICO (θ≠0) della formula, non precOmega0() corrente:
  // se lo slider è a θ=0 precOmega0() vale 0 per il caso degenere, e userei quello schiaccerebbe a
  // zero l'intera retta invece di mostrare correttamente "costante per θ>0, poi crolla a 0 in θ=0"
  const Pgen = torqueMax() / (I3() * omega0()), P0 = precOmega0(), yTop = Pgen * 1.5;
  const xOf = th => PAD.l + th / 90 * gW, yOf = v => PAD.t + gH - clamp(v / yTop, 0, 1) * gH;
  ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 1.6; ctx.beginPath();
  ctx.moveTo(xOf(2), yOf(Pgen)); ctx.lineTo(xOf(90), yOf(Pgen)); ctx.stroke();
  ctx.fillStyle = '#ff9d4d'; ctx.beginPath(); ctx.arc(xOf(P.theta_deg), yOf(P0), 3.4, 0, TWO); ctx.fill();
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('Ω_prec', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('θ', PAD.l + gW - 2, PAD.t + gH - 3);
}
function drawGraphs() {
  const titles = ['ω(t) — decadimento spin', 'Ω_prec(t) — accelera', 'Ω_prec(θ) — indipendente!'];
  for (let i = 0; i < 3; i++) if (gTitle[i]) gTitle[i].textContent = titles[i];
  drawGraphOmega(); drawGraphPrec(); drawGraphPrecTheta();
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls() {
  const cont = document.getElementById('controls'); cont.innerHTML = '';

  const sr = Lab.Section('Rotore'); cont.appendChild(sr.el);
  sr.add(Lab.Slider({ label: 'Massa m', min: 0.05, max: 1, step: 0.01, value: P.m, unit: ' kg', onChange(v) { P.m = v; newRun(); } }));
  sr.add(Lab.Slider({ label: 'Velocità di rotazione', min: 500, max: 6000, step: 50, value: P.rpm, unit: ' rpm', onChange(v) { P.rpm = v; newRun(); } }));

  const sg = Lab.Section('Geometria'); cont.appendChild(sg.el);
  sg.add(Lab.Slider({ label: 'Raggio rotore R', min: 3, max: 10, step: 0.2, value: P.R_rotor * 100, unit: ' cm', onChange(v) { P.R_rotor = v / 100; newRun(); } }));
  sg.add(Lab.Slider({ label: 'Distanza dal perno r', min: 5, max: 20, step: 0.5, value: P.r_arm * 100, unit: ' cm', onChange(v) { P.r_arm = v / 100; newRun(); } }));
  sg.add(Lab.Slider({ label: 'Inclinazione θ (dalla verticale)', min: 0, max: 90, step: 1, value: P.theta_deg, unit: '°', onChange(v) { P.theta_deg = v; } }));

  const sd = Lab.Section('Smorzamento'); cont.appendChild(sd.el);
  sd.add(Lab.Slider({ label: 'Smorzamento dello spin', min: 0, max: 0.05, step: 0.001, value: P.dampRate, unit: ' /s', onChange(v) { P.dampRate = v; newRun(); } }));
  const bNew = document.createElement('button'); bNew.className = 'ctrl-btn'; bNew.textContent = 'Nuovo lancio';
  bNew.addEventListener('click', () => newRun());
  sd.add(bNew);

  const sv = Lab.Section('Visualizzazione'); cont.appendChild(sv.el);
  sv.add(Lab.Toggle({ label: 'Traccia di precessione', value: P.showTrail, onChange(v) { P.showTrail = v; } }));
  sv.add(Lab.Slider({ label: 'Velocità animazione', min: 0.2, max: 10, step: 0.1, value: P.speed, unit: '×', onChange(v) { P.speed = v; } }));
}

function buildReadout() {
  const cont = document.getElementById('readout'); cont.innerHTML = '';
  readout = new Lab.Readout(cont, [
    { key: 't', label: 'Tempo' },
    { key: 'om', label: 'Velocità di rotazione ω' },
    { key: 'precT', label: 'Periodo di precessione' },
    { key: 'L', label: 'Momento angolare L' },
    { key: 'theta', label: 'Inclinazione attuale θ' },
    { key: 'stato', label: 'Stato' },
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
    P.m = 0.3; P.rpm = 3000; P.R_rotor = 0.045; P.r_arm = 0.14; P.theta_deg = 65; P.dampRate = 0.01;
    P.showTrail = true; P.speed = 1.0; P.paused = false;
    buildControls(); newRun(); syncPlay();
  });

  // telecamera orbitale: trascina per ruotare (azimut/elevazione), rotella per zoomare
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
      const om = omegaAt(animT), pr = precOmegaAt(animT);
      readout.set('t', animT.toFixed(1) + ' s');
      readout.set('om', (om * 60 / TWO).toFixed(0) + ' rpm');
      readout.set('precT', pr > 1e-9 ? fmt(TWO / pr, ' s') : '—');
      readout.set('L', fmt(I3() * om, ' kg·m²/s'));
      readout.set('theta', thetaAt(animT).toFixed(1) + '°');
      readout.set('stato', fallen ? 'caduto' : 'in precessione');
    } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
