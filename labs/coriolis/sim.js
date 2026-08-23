'use strict';

// ═══ Costanti ═══════════════════════════════════════════════════════════════
const TWO = Math.PI * 2;
const HIT_TOL = 0.08;                                             // entro l'8% del raggio dal centro conta come "bersaglio colpito"
const G_ACCEL = 9.81;
const PEND_TRAIL_MAX = 6000;                                       // punti massimi della scia del pendolo (finestra scorrevole, come in labs/foucault-pendulum)

const P = {
  mode: 'ball',              // 'ball' = lancio pallina, 'pendulum' = pendolo/rosetta
  omega: 0.3,               // rad/s — velocità angolare della piattaforma (positiva = antioraria, come vista dall'alto)
  v0: 4,                     // m/s — velocità di lancio della pallina, misurata da chi la lancia STANDO sulla piattaforma
  aim: 0,                    // gradi — correzione di mira rispetto alla direzione "punta dritto al centro"
  R: 8,                       // m — raggio della piattaforma
  L: 3,                       // m — lunghezza del filo del pendolo
  ampDeg: 18,                 // ° — ampiezza angolare iniziale del pendolo rispetto alla verticale
  plane: 0,                   // ° — direzione del piano di oscillazione iniziale
  speed: 1.0,
  paused: false,
};

let animT = 0, last = 0, ended = false;
let D = null;                                                     // quantità derivate del lancio (pallina), ricalcolate ad ogni nuovo lancio
let pendTrail = [];                                                // impronte del pendolo sulla piattaforma: lista di istanti t campionati
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
    ring: d ? 'rgba(150,175,205,0.4)' : 'rgba(60,95,130,0.45)', grid: d ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
    platform: d ? 'rgba(70,85,105,0.3)' : 'rgba(120,140,165,0.25)', star: d ? 'rgba(200,220,240,0.5)' : 'rgba(60,90,130,0.35)',
    gBg: d ? 'rgb(3,9,22)' : '#eef2f7', gAxis: d ? 'rgba(100,155,210,0.3)' : 'rgba(40,80,130,0.32)', gText: d ? 'rgba(150,205,225,0.88)' : 'rgba(25,65,105,0.92)',
  };
}
let T = pal();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ═══ Fisica della pallina (interamente in forma chiusa — nessuna integrazione numerica) ═════════════
// Un corpo su cui non agisce ALCUNA forza reale si muove di moto rettilineo uniforme nel
// riferimento INERZIALE (le "stelle fisse") — questo è tutto ciò che serve. La "forza di
// Coriolis" non è una forza vera: è semplicemente il nome che diamo all'accelerazione apparente
// che si osserva quando si descrive quello stesso moto rettilineo usando le coordinate di un
// riferimento che RUOTA. Qui non simuliamo la forza pseudo — calcoliamo la retta nel riferimento
// inerziale (esatta, per definizione) e la ruotiamo nel riferimento della piattaforma:
//   x_rot(t) = x_in(t)·cos(Ωt) + y_in(t)·sin(Ωt)
//   y_rot(t) = −x_in(t)·sin(Ωt) + y_in(t)·cos(Ωt)
// Chi lancia la pallina sta FERMO rispetto alla piattaforma (ci cammina sopra), quindi la
// velocità che imprime "a occhio" (nel riferimento rotante) va sommata alla velocità di
// trascinamento della piattaforma nel punto di lancio (Ω×r) per ottenere la velocità vera,
// inerziale, con cui la pallina poi si muove in linea retta.
function computeDerived() {
  const R = P.R, delta = P.aim * Math.PI / 180;
  const x0 = -R, y0 = 0;                                          // lancio dal bordo sinistro, verso il centro
  const vThrowX = P.v0 * Math.cos(delta), vThrowY = P.v0 * Math.sin(delta);   // velocità di lancio "percepita" sulla piattaforma
  const vCarryX = -P.omega * y0, vCarryY = P.omega * x0;           // velocità di trascinamento Ω×r nel punto di lancio
  const vxi = vThrowX + vCarryX, vyi = vThrowY + vCarryY;          // velocità inerziale vera (quella che conta per il moto rettilineo)
  const V2 = vxi * vxi + vyi * vyi;
  const tExit = 2 * R * vxi / V2;                                  // soluzione esatta di |r0+v·t|=R (l'altra è t=0, il lancio)
  const tClosest = tExit / 2;                                      // per simmetria della retta rispetto al cerchio, il punto più vicino è sempre a metà volo
  const rMin = R * Math.sqrt(Math.max(0, 1 - vxi * vxi / V2));      // distanza minima dal centro, formula chiusa
  return { R, delta, x0, y0, vxi, vyi, V2, tExit, tClosest, rMin };
}
function inertialPos(t) { return [D.x0 + D.vxi * t, D.y0 + D.vyi * t]; }
function toRotating(xi, yi, t) {
  const a = P.omega * t, c = Math.cos(a), s = Math.sin(a);
  return [xi * c + yi * s, -xi * s + yi * c];
}
function rotatingPos(t) { const [xi, yi] = inertialPos(t); return toRotating(xi, yi, t); }

// ═══ Fisica del pendolo (modalità "Pendolo") ═════════════════════════════════════
// Un pendolo appeso a un perno libero di ruotare attorno alla verticale (senza attrito
// azimutale — proprio come il vero pendolo di Foucault) non subisce ALCUNA coppia attorno
// all'asse verticale: il suo momento angolare verticale si conserva, quindi il PIANO di
// oscillazione resta fisso nel riferimento inerziale — qualunque cosa faccia il sostegno
// (anche se è fissato al centro esatto della piattaforma che ruota: quel punto è sull'asse di
// rotazione, quindi non si sposta mai). Per piccole oscillazioni il moto nel piano fisso è
// armonico semplice — stessa approssimazione già usata in labs/foucault-pendulum:
//   x_in(t) = A·cos(φ₀)·cos(ω_p t),   y_in(t) = A·sin(φ₀)·cos(ω_p t)
// con ω_p=√(g/L) e A=L·sin(θ₀) ampiezza lineare ESATTA del bob all'estremo dell'oscillazione
// (θ₀ = ampiezza angolare dalla verticale — non è un'approssimazione, è la geometria del filo).
// Passando al riferimento rotante con la STESSA trasformazione già usata per la pallina, il
// piano appare ruotare a velocità −Ω: è di nuovo l'effetto Coriolis, applicato a un oscillatore
// invece che a un proiettile — ed è proprio questa precessione relativa a disegnare la rosetta.
function omegaP() { return Math.sqrt(G_ACCEL / P.L); }
function pendAmp() { return P.L * Math.sin(P.ampDeg * Math.PI / 180); }
function pendInertialPos(t) {
  const A = pendAmp(), pl = P.plane * Math.PI / 180, s = A * Math.cos(omegaP() * t);
  return [s * Math.cos(pl), s * Math.sin(pl)];
}
function pendBobXY(t, mode) {
  const [xi, yi] = pendInertialPos(t);
  return mode === 'inertial' ? [xi, yi] : toRotating(xi, yi, t);
}
// altezza VERA (mai esagerata: la traccia lasciata sulla piattaforma è a questa quota zero
// solo all'equilibrio) del bob sopra la piattaforma, dato lo spostamento orizzontale (x,y):
// il filo ha lunghezza fissa L dal perno (che sta ad altezza L sopra il centro), quindi
// z(x,y) = L − √(L²−x²−y²) — vale 0 quando il pendolo pende verticale, cresce agli estremi.
function pendHeight(x, y) { const r2 = x * x + y * y; return P.L - Math.sqrt(Math.max(0, P.L * P.L - r2)); }

function newRun() {
  animT = 0;
  if (P.mode === 'ball') { D = computeDerived(); ended = false; }
  else { pendTrail = []; }
}
function step(dt) {
  if (P.mode === 'ball') {
    if (ended) return;
    animT += dt;
    if (animT >= D.tExit) { animT = D.tExit; ended = true; }
  } else {
    animT += dt;
    pendTrail.push(animT);
    if (pendTrail.length > PEND_TRAIL_MAX) pendTrail.shift();
  }
}

// ═══ Rendering ════════════════════════════════════════════════════════════════
function drawGrid(ctx, W, H) {
  ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}
function geom(W, H) {
  const headerH = 44, hintH = 34, gap = 14;
  const areaH = H - headerH - hintH;
  const panelW = (W - gap) / 2;
  const S = Math.min(panelW, areaH) * 0.4;
  G = {
    W, H,
    left: { cx: panelW * 0.5, cy: headerH + areaH * 0.54, S },
    right: { cx: panelW + gap + panelW * 0.5, cy: headerH + areaH * 0.54, S },
  };
}
function toScreen(panel, x, y) { return { sx: panel.cx + (x / D.R) * panel.S, sy: panel.cy - (y / D.R) * panel.S }; }

// disegna la piattaforma (cerchio + raggi) — spokeAngle è l'orientamento a schermo dei raggi:
// nel riferimento inerziale ruotano (Ωt), nel riferimento rotante restano fissi (la piattaforma
// "sembra" ferma a chi ci sta sopra)
function drawPlatform(ctx, panel, spokeAngle) {
  ctx.strokeStyle = T.ring; ctx.fillStyle = T.platform; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(panel.cx, panel.cy, panel.S, 0, TWO); ctx.fill(); ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = spokeAngle + i * Math.PI / 4;
    ctx.beginPath(); ctx.moveTo(panel.cx, panel.cy); ctx.lineTo(panel.cx + Math.cos(a) * panel.S, panel.cy - Math.sin(a) * panel.S); ctx.stroke();
  }
  [0.5, 1].forEach(f => { ctx.beginPath(); ctx.arc(panel.cx, panel.cy, panel.S * f, 0, TWO); ctx.stroke(); });
  // bersaglio al centro
  ctx.fillStyle = 'rgba(255,157,77,0.9)';
  ctx.beginPath(); ctx.arc(panel.cx, panel.cy, 4, 0, TWO); ctx.fill();
  ctx.strokeStyle = 'rgba(255,157,77,0.6)'; ctx.beginPath(); ctx.arc(panel.cx, panel.cy, 9, 0, TWO); ctx.stroke();
}
function drawStars(ctx, W, H, phase) {
  // sfondo di "stelle fisse" — nel pannello inerziale sono immobili, in quello rotante sembrano
  // ruotare (in verso opposto alla piattaforma): un promemoria che la rotazione è relativa
  ctx.fillStyle = T.star;
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * TWO + phase, r = 0.15 + 0.35 * ((i * 37) % 11) / 11;
    const x = W * 0.5 + Math.cos(a) * W * r, y = H * 0.5 + Math.sin(a) * H * r * 0.6;
    ctx.beginPath(); ctx.arc(x, y, 0.9, 0, TWO); ctx.fill();
  }
}

function drawTrail(ctx, panel, mode) {
  if (animT <= 0) return;
  ctx.beginPath();
  const N = 60;
  for (let i = 0; i <= N; i++) {
    const t = animT * i / N;
    const [xi, yi] = inertialPos(t);
    const [x, y] = mode === 'inertial' ? [xi, yi] : toRotating(xi, yi, t);
    const s = toScreen(panel, x, y);
    i ? ctx.lineTo(s.sx, s.sy) : ctx.moveTo(s.sx, s.sy);
  }
  ctx.strokeStyle = 'rgba(0,212,255,0.85)'; ctx.lineWidth = 2; ctx.stroke();
}
function drawBall(ctx, panel, mode) {
  const [xi, yi] = inertialPos(animT);
  const [x, y] = mode === 'inertial' ? [xi, yi] : toRotating(xi, yi, animT);
  const s = toScreen(panel, x, y);
  ctx.save(); ctx.shadowColor = '#00d4ff'; ctx.shadowBlur = 12;
  ctx.fillStyle = '#dff4ff'; ctx.beginPath(); ctx.arc(s.sx, s.sy, 5, 0, TWO); ctx.fill();
  ctx.restore();
}
// la linea di mira "ideale" (dritta al centro) è fissa nel riferimento ROTANTE per definizione —
// è quella che chi lancia vede puntando davanti a sé — utile come riferimento per misurare la deviazione
function drawAimLine(ctx, panel) {
  const p0 = toScreen(panel, D.x0, D.y0), p1 = toScreen(panel, 0, 0);
  ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(p0.sx, p0.sy); ctx.lineTo(p1.sx, p1.sy); ctx.stroke();
  ctx.setLineDash([]);
}

// ── vista 3D isometrica del pendolo (stessa proiezione di labs/foucault-pendulum) ──────────────
const ICOS3 = Math.cos(Math.PI / 6), ISIN3 = Math.sin(Math.PI / 6);
// ZEXAG esagera SOLO l'altezza nella resa grafica (mai la fisica, mai la traccia sulla
// piattaforma, che resta sempre a z=0 vero): a piccoli angoli il dislivello reale del bob è
// quasi impercettibile rispetto al raggio della piattaforma, esattamente come già dichiarato
// per PRECESSION_EXAGGERATION nel lab del pendolo di Foucault — qui si esagera lo spazio invece
// che il tempo, con lo stesso principio di "una sola scala dichiarata, mai la grandezza che si sta studiando".
const ZEXAG = 4;
function proj3(panel, x, y, z) {
  const s = panel.S / P.R;
  return { sx: panel.cx + (x - y) * ICOS3 * s, sy: panel.cy - (x + y) * ISIN3 * s - z * ZEXAG * s };
}
function drawPlatform3D(ctx, panel, spokeAngle) {
  ctx.strokeStyle = T.ring; ctx.fillStyle = T.platform; ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let i = 0; i <= 64; i++) { const a = i / 64 * TWO; const p = proj3(panel, Math.cos(a) * P.R, Math.sin(a) * P.R, 0); i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  const c = proj3(panel, 0, 0, 0);
  for (let i = 0; i < 8; i++) {
    const a = spokeAngle + i * Math.PI / 4;
    const p = proj3(panel, Math.cos(a) * P.R, Math.sin(a) * P.R, 0);
    ctx.beginPath(); ctx.moveTo(c.sx, c.sy); ctx.lineTo(p.sx, p.sy); ctx.stroke();
  }
  [0.5, 1].forEach(f => {
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) { const a = i / 64 * TWO; const p = proj3(panel, Math.cos(a) * P.R * f, Math.sin(a) * P.R * f, 0); i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy); }
    ctx.stroke();
  });
  ctx.fillStyle = 'rgba(255,157,77,0.9)';
  ctx.beginPath(); ctx.arc(c.sx, c.sy, 4, 0, TWO); ctx.fill();
  ctx.strokeStyle = 'rgba(255,157,77,0.6)'; ctx.beginPath(); ctx.arc(c.sx, c.sy, 9, 0, TWO); ctx.stroke();
}
// scia = impronte del bob proiettate a quota zero sulla piattaforma (esattamente ciò che un
// perno tracciante lascerebbe su sabbia, come nelle dimostrazioni reali del pendolo di Foucault)
function drawTrailPend(ctx, panel, mode) {
  if (pendTrail.length < 2) return;
  ctx.beginPath();
  for (let i = 0; i < pendTrail.length; i++) {
    const t = pendTrail[i]; const [x, y] = pendBobXY(t, mode);
    const p = proj3(panel, x, y, 0);
    i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy);
  }
  ctx.strokeStyle = 'rgba(0,212,255,0.55)'; ctx.lineWidth = 1.1; ctx.stroke();
}
function drawSphereSmall(ctx, x, y, r) {
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = r;
  const grad = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r * 1.05);
  grad.addColorStop(0, '#fff3d6'); grad.addColorStop(1, '#c98a2e');
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, r, 0, TWO); ctx.fill(); ctx.restore();
}
function drawPendulumRig(ctx, panel, mode) {
  const [x, y] = pendBobXY(animT, mode);
  const zBob = pendHeight(x, y);
  const pivot = proj3(panel, 0, 0, P.L), foot = proj3(panel, x, y, 0), bob = proj3(panel, x, y, zBob);
  ctx.strokeStyle = T.ring; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(foot.sx, foot.sy); ctx.lineTo(pivot.sx, pivot.sy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(pivot.sx - 14, pivot.sy - 7); ctx.lineTo(pivot.sx, pivot.sy); ctx.lineTo(pivot.sx + 14, pivot.sy - 7); ctx.stroke();
  ctx.strokeStyle = 'rgba(180,200,220,0.55)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(pivot.sx, pivot.sy); ctx.lineTo(bob.sx, bob.sy); ctx.stroke();
  ctx.setLineDash([2, 3]); ctx.strokeStyle = 'rgba(0,212,255,0.4)';
  ctx.beginPath(); ctx.moveTo(bob.sx, bob.sy); ctx.lineTo(foot.sx, foot.sy); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(0,212,255,0.85)'; ctx.beginPath(); ctx.arc(foot.sx, foot.sy, 2.5, 0, TWO); ctx.fill();
  drawSphereSmall(ctx, bob.sx, bob.sy, 7);
}

function draw(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  T = pal();
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
  drawGrid(ctx, W, H);
  geom(W, H);

  const alpha = P.omega * animT;

  if (P.mode === 'ball') {
    // pannello sinistro: riferimento INERZIALE — la piattaforma ruota, la pallina va dritta
    drawStars(ctx, G.left.cx * 2, H, 0);
    drawPlatform(ctx, G.left, alpha);
    drawAimLine(ctx, G.left);
    drawTrail(ctx, G.left, 'inertial');
    drawBall(ctx, G.left, 'inertial');

    // pannello destro: riferimento ROTANTE (quello di chi sta sulla piattaforma) — la piattaforma
    // sembra ferma, la pallina devia
    drawStars(ctx, G.right.cx * 2, H, -alpha);
    drawPlatform(ctx, G.right, 0);
    drawAimLine(ctx, G.right);
    drawTrail(ctx, G.right, 'rotating');
    drawBall(ctx, G.right, 'rotating');
  } else {
    drawStars(ctx, G.left.cx * 2, H, 0);
    drawPlatform3D(ctx, G.left, alpha);
    drawTrailPend(ctx, G.left, 'inertial');
    drawPendulumRig(ctx, G.left, 'inertial');

    drawStars(ctx, G.right.cx * 2, H, -alpha);
    drawPlatform3D(ctx, G.right, 0);
    drawTrailPend(ctx, G.right, 'rotating');
    drawPendulumRig(ctx, G.right, 'rotating');
  }

  // separatore + etichette dei due pannelli
  ctx.strokeStyle = T.ring; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(G.left.cx * 2 + 7, 44); ctx.lineTo(G.left.cx * 2 + 7, H - 34); ctx.stroke();
  ctx.textAlign = 'center'; ctx.fillStyle = T.accent; ctx.font = 'bold 10px "Space Mono",monospace';
  ctx.fillText('RIFERIMENTO INERZIALE (le stelle fisse)', G.left.cx, 56);
  ctx.fillText('RIFERIMENTO ROTANTE (chi è sulla piattaforma)', G.right.cx, 56);
  ctx.fillStyle = T.sub; ctx.font = '8px "Space Mono",monospace';
  if (P.mode === 'ball') {
    ctx.fillText('la pallina va in linea retta: nessuna forza reale agisce su di lei', G.left.cx, 68);
    ctx.fillText('la stessa pallina, vista da qui, sembra deviare: è la "forza" di Coriolis', G.right.cx, 68);
  } else {
    ctx.fillText('il piano di oscillazione resta fisso: nessuna coppia agisce sul perno', G.left.cx, 68);
    ctx.fillText('lo stesso pendolo, visto da qui, sembra precedere: nasce la rosetta', G.right.cx, 68);
  }

  // intestazione
  ctx.textAlign = 'left';
  ctx.fillStyle = T.accent; ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.fillText(P.mode === 'ball' ? 'Forza di Coriolis — la stessa pallina, due punti di vista' : 'Forza di Coriolis — lo stesso pendolo, due punti di vista', 14, 20);
  ctx.fillStyle = T.txt; ctx.font = '10px "Space Mono",monospace';
  if (P.mode === 'ball') {
    ctx.fillText(`Ω=${P.omega.toFixed(2)} rad/s   v₀=${P.v0.toFixed(1)} m/s   mira=${P.aim.toFixed(0)}°   scarto dal bersaglio=${D.rMin.toFixed(2)} m`, 14, 36);
  } else {
    ctx.fillText(`Ω=${P.omega.toFixed(2)} rad/s   L=${P.L.toFixed(1)} m   T₀=${(TWO / omegaP()).toFixed(2)} s   ampiezza=${P.ampDeg.toFixed(0)}°   (altezza esagerata ×${ZEXAG} per visibilità)`, 14, 36);
  }

  ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
  if (P.mode === 'ball') {
    const hemi = P.omega > 0.01 ? 'come nell\'emisfero Nord: devia verso destra' : P.omega < -0.01 ? 'come nell\'emisfero Sud: devia verso sinistra' : 'nessuna rotazione: nessuna deviazione';
    const hint = ended
      ? (D.rMin < HIT_TOL * D.R ? 'bersaglio colpito! — premi "Nuovo lancio" per riprovare' : `mancato di ${D.rMin.toFixed(2)} m — premi "Nuovo lancio" per riprovare, magari correggendo la mira`)
      : hemi;
    ctx.fillText(hint, W / 2, H - 10);
  } else {
    ctx.fillText('il pendolo oscilla in un piano fisso nello spazio: sulla piattaforma il piano sembra ruotare a velocità −Ω, tracciando la rosetta', W / 2, H - 10);
  }
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
function gBase(ctx, W, H, PAD) {
  ctx.fillStyle = T.gBg; ctx.fillRect(0, 0, W, H);
  const gW = W - PAD.l - PAD.r, gH = H - PAD.t - PAD.b;
  ctx.strokeStyle = T.gAxis; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(PAD.l, PAD.t); ctx.lineTo(PAD.l, PAD.t + gH); ctx.lineTo(PAD.l + gW, PAD.t + gH); ctx.stroke();
  return { gW, gH };
}
// 1: distanza dal centro nel tempo — a V, minimo esattamente a metà volo (per simmetria)
function drawGraphDistance() {
  const cv = gCanvas[0]; if (!cv || !cv.width || !D) return;
  const ctx = gCtx[0], W = cv.width, H = cv.height, PAD = { t: 14, b: 14, l: 26, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const xOfT = t => PAD.l + clamp(t / D.tExit, 0, 1) * gW;
  const yOfR = r => PAD.t + gH - clamp(r / D.R, 0, 1) * gH;
  ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 1.4; ctx.beginPath();
  for (let i = 0; i <= 100; i++) { const t = D.tExit * i / 100; const [xi, yi] = inertialPos(t); const r = Math.hypot(xi, yi); const x = xOfT(t), y = yOfR(r); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke();
  const px = xOfT(Math.min(animT, D.tExit)), py = yOfR(Math.hypot(...inertialPos(Math.min(animT, D.tExit))));
  ctx.fillStyle = '#ff9d4d'; ctx.beginPath(); ctx.arc(px, py, 3, 0, TWO); ctx.fill();
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('distanza dal centro (m)', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('t (s)', PAD.l + gW - 2, PAD.t + gH - 3);
}
// 2: scostamento laterale dalla linea di mira ideale, nel riferimento rotante — cresce, quantifica
// "quanto ha deviato" rispetto a dove avrebbe dovuto andare senza rotazione
function drawGraphLateral() {
  const cv = gCanvas[1]; if (!cv || !cv.width || !D) return;
  const ctx = gCtx[1], W = cv.width, H = cv.height, PAD = { t: 14, b: 14, l: 26, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const latMax = Math.max(D.rMin * 1.3, 0.3);
  const xOfT = t => PAD.l + clamp(t / D.tExit, 0, 1) * gW;
  const yOfL = l => PAD.t + gH - clamp(l / latMax, 0, 1) * gH;
  const dirx = Math.cos(D.delta), diry = Math.sin(D.delta);
  ctx.strokeStyle = '#7fe0a0'; ctx.lineWidth = 1.4; ctx.beginPath();
  for (let i = 0; i <= 100; i++) {
    const t = D.tExit * i / 100; const [x, y] = rotatingPos(t);
    const lateral = Math.abs((x - D.x0) * diry - (y - D.y0) * dirx);
    const px = xOfT(t), py = yOfL(lateral); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.stroke();
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('scostamento laterale (m)', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('t (s)', PAD.l + gW - 2, PAD.t + gH - 3);
}
// 3: scarto dal bersaglio in funzione di Ω (a v₀, mira, R correnti) — curva FISSA (ricalcolata solo
// se cambiano v₀/mira/R, non su Ω, che è proprio l'asse x), con Ω attuale marcato
function drawGraphMissVsOmega() {
  const cv = gCanvas[2]; if (!cv || !cv.width || !D) return;
  const ctx = gCtx[2], W = cv.width, H = cv.height, PAD = { t: 14, b: 14, l: 26, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const OMEGA_MIN = -1.5, OMEGA_MAX = 1.5;
  const xOfW = w => PAD.l + clamp((w - OMEGA_MIN) / (OMEGA_MAX - OMEGA_MIN), 0, 1) * gW;
  const yOfM = m => PAD.t + gH - clamp(m / P.R, 0, 1) * gH;
  const missAt = (w) => {
    const vThrowX = P.v0 * Math.cos(D.delta), vThrowY = P.v0 * Math.sin(D.delta);
    const vcx = -w * D.y0, vcy = w * D.x0;
    const vxi = vThrowX + vcx, vyi = vThrowY + vcy, V2 = vxi * vxi + vyi * vyi;
    return P.R * Math.sqrt(Math.max(0, 1 - vxi * vxi / V2));
  };
  ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 1.4; ctx.beginPath();
  for (let i = 0; i <= 100; i++) { const w = OMEGA_MIN + (OMEGA_MAX - OMEGA_MIN) * i / 100; const x = xOfW(w), y = yOfM(missAt(w)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke();
  const px = xOfW(P.omega), py = yOfM(D.rMin);
  ctx.fillStyle = '#ff9d4d'; ctx.beginPath(); ctx.arc(px, py, 3, 0, TWO); ctx.fill();
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('scarto dal bersaglio (m)', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('Ω (rad/s)', PAD.l + gW - 2, PAD.t + gH - 3);
}
// 1p: x(t),y(t) nel riferimento ROTANTE, finestra scorrevole di alcuni periodi di oscillazione —
// mostra il "battimento" lento (precessione) sovrapposto all'oscillazione veloce del pendolo
function pendWinT() { return (TWO / omegaP()) * 6; }
function drawGraphPendXY() {
  const cv = gCanvas[0]; if (!cv || !cv.width) return;
  const ctx = gCtx[0], W = cv.width, H = cv.height, PAD = { t: 14, b: 16, l: 22, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const WIN = pendWinT(), A = Math.max(pendAmp(), 0.01);
  const zero = PAD.t + gH / 2;
  ctx.strokeStyle = T.gAxis; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(PAD.l, zero); ctx.lineTo(PAD.l + gW, zero); ctx.stroke();
  const xOf = t => PAD.l + (t - (animT - WIN)) / WIN * gW;
  const yOf = v => zero - clamp(v / A, -1, 1) * (gH * 0.46);
  const pts = pendTrail.filter(t => t >= animT - WIN);
  ctx.save(); ctx.beginPath(); ctx.rect(PAD.l, PAD.t, gW, gH); ctx.clip();
  [['x', '#00d4ff', 0], ['y', '#ff9d4d', 1]].forEach(([key, col]) => {
    ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.beginPath();
    pts.forEach((t, i) => { const [x, y] = pendBobXY(t, 'rotating'); const v = key === 'x' ? x : y; const px = xOf(t), py = yOf(v); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    ctx.stroke();
  });
  ctx.restore();
  ctx.fillStyle = '#00d4ff'; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('x', PAD.l + 2, PAD.t + 7);
  ctx.fillStyle = '#ff9d4d'; ctx.fillText('y', PAD.l + 2, PAD.t + 16);
}
// 2p: traiettoria X-Y pulita nel riferimento rotante — la rosetta, sugli stessi assi in metri
function drawGraphPendRosette() {
  const cv = gCanvas[1]; if (!cv || !cv.width) return;
  const ctx = gCtx[1], W = cv.width, H = cv.height, PAD = { t: 14, b: 14, l: 14, r: 10 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const cx = PAD.l + gW / 2, cy = PAD.t + gH / 2, A = pendAmp(), s = Math.min(gW, gH) * 0.46 / Math.max(A, 0.05);
  ctx.strokeStyle = T.gAxis; ctx.lineWidth = 0.4; ctx.setLineDash([2, 3]);
  ctx.beginPath(); ctx.arc(cx, cy, s * A, 0, TWO); ctx.stroke(); ctx.setLineDash([]);
  if (pendTrail.length > 1) {
    ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 1; ctx.beginPath();
    pendTrail.forEach((t, i) => { const [x, y] = pendBobXY(t, 'rotating'); const px = cx + x * s, py = cy - y * s; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    ctx.stroke();
  }
  const [bx, by] = pendBobXY(animT, 'rotating');
  ctx.fillStyle = '#ff9d4d'; ctx.beginPath(); ctx.arc(cx + bx * s, cy - by * s, 3, 0, TWO); ctx.fill();
}
// 3p: angolo del piano di oscillazione nel riferimento rotante, mod 360° — finestra temporale
// FISSA (mai ricalcolata su Ω): all'aumentare di |Ω| il dente di sega si vede diventare più fitto,
// l'effetto di Ω è mostrato, non nascosto
const PEND_ANGLE_WIN = 20;
function drawGraphPendAngle() {
  const cv = gCanvas[2]; if (!cv || !cv.width) return;
  const ctx = gCtx[2], W = cv.width, H = cv.height, PAD = { t: 14, b: 16, l: 26, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const t0 = Math.max(0, animT - PEND_ANGLE_WIN), tEnd = Math.min(animT, t0 + PEND_ANGLE_WIN);
  const xOf = t => PAD.l + clamp((t - t0) / PEND_ANGLE_WIN, 0, 1) * gW;
  const yOf = deg => PAD.t + gH - (deg / 360) * gH;
  const angDeg = t => { let d = P.plane - t * P.omega * 180 / Math.PI; d = ((d % 360) + 360) % 360; return d; };
  const N = 200;
  ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 1.4;
  let prevY = null; ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const t = t0 + (tEnd - t0) * i / N;
    const y = yOf(angDeg(t)), x = xOf(t);
    if (prevY !== null && Math.abs(y - prevY) > gH * 0.6) { ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y); }
    else { i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    prevY = y;
  }
  ctx.stroke();
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('angolo piano, rif. rotante (0-360°)', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('t (s)', PAD.l + gW - 2, PAD.t + gH - 3);
}
function drawGraphs() {
  if (P.mode === 'ball') {
    const titles = ['Distanza dal centro', 'Scostamento laterale', 'Scarto dal bersaglio vs Ω'];
    for (let i = 0; i < 3; i++) if (gTitle[i]) gTitle[i].textContent = titles[i];
    drawGraphDistance(); drawGraphLateral(); drawGraphMissVsOmega();
  } else {
    const titles = ['x(t), y(t) — riferimento rotante', 'Traiettoria (rosetta)', 'Angolo del piano nel tempo'];
    for (let i = 0; i < 3; i++) if (gTitle[i]) gTitle[i].textContent = titles[i];
    drawGraphPendXY(); drawGraphPendRosette(); drawGraphPendAngle();
  }
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls() {
  const cont = document.getElementById('controls'); cont.innerHTML = '';

  const sm = Lab.Section('Modalità'); cont.appendChild(sm.el);
  sm.add(Lab.RadioGroup({
    label: 'Cosa mettere sulla piattaforma',
    value: P.mode,
    options: [
      { value: 'ball', label: 'Pallina (traiettoria)' },
      { value: 'pendulum', label: 'Pendolo (rosetta 3D)' },
    ],
    onChange(v) { P.mode = v; buildControls(); buildReadout(); newRun(); },
  }));

  const sp = Lab.Section('Piattaforma'); cont.appendChild(sp.el);
  sp.add(Lab.Slider({ label: 'Velocità angolare Ω', min: -1.5, max: 1.5, step: 0.05, value: P.omega, unit: ' rad/s', onChange(v) { P.omega = v; newRun(); } }));
  sp.add(Lab.Slider({ label: 'Raggio piattaforma', min: 4, max: 12, step: 0.5, value: P.R, unit: ' m', onChange(v) { P.R = v; newRun(); } }));

  if (P.mode === 'ball') {
    const sl = Lab.Section('Lancio'); cont.appendChild(sl.el);
    sl.add(Lab.Slider({ label: 'Velocità di lancio', min: 1, max: 8, step: 0.2, value: P.v0, unit: ' m/s', onChange(v) { P.v0 = v; newRun(); } }));
    sl.add(Lab.Slider({ label: 'Correzione di mira', min: -60, max: 60, step: 1, value: P.aim, unit: '°', onChange(v) { P.aim = v; newRun(); } }));
    const bNew = document.createElement('button'); bNew.className = 'ctrl-btn'; bNew.textContent = 'Nuovo lancio';
    bNew.addEventListener('click', () => newRun());
    sl.add(bNew);
  } else {
    const spd = Lab.Section('Pendolo'); cont.appendChild(spd.el);
    spd.add(Lab.Slider({ label: 'Lunghezza del filo L', min: 1, max: 6, step: 0.2, value: P.L, unit: ' m', onChange(v) { P.L = v; newRun(); } }));
    spd.add(Lab.Slider({ label: 'Ampiezza iniziale', min: 4, max: 30, step: 1, value: P.ampDeg, unit: '°', onChange(v) { P.ampDeg = v; newRun(); } }));
    spd.add(Lab.Slider({ label: 'Direzione piano di lancio', min: 0, max: 360, step: 5, value: P.plane, unit: '°', onChange(v) { P.plane = v; newRun(); } }));
    const bNew = document.createElement('button'); bNew.className = 'ctrl-btn'; bNew.textContent = 'Riavvia pendolo';
    bNew.addEventListener('click', () => newRun());
    spd.add(bNew);
  }

  const sv = Lab.Section('Visualizzazione'); cont.appendChild(sv.el);
  sv.add(Lab.Slider({ label: 'Velocità animazione', min: 0.2, max: 3, step: 0.1, value: P.speed, unit: '×', onChange(v) { P.speed = v; } }));
}

function buildReadout() {
  const cont = document.getElementById('readout'); cont.innerHTML = '';
  readout = new Lab.Readout(cont, P.mode === 'ball' ? [
    { key: 'omega', label: 'Velocità angolare Ω' },
    { key: 'v0', label: 'Velocità di lancio' },
    { key: 'aim', label: 'Correzione di mira' },
    { key: 'miss', label: 'Scarto dal bersaglio' },
    { key: 'time', label: 'Tempo di volo' },
    { key: 'stato', label: 'Stato' },
  ] : [
    { key: 'omega', label: 'Velocità angolare Ω' },
    { key: 'L', label: 'Lunghezza filo L' },
    { key: 'T0', label: 'Periodo oscillazione T₀' },
    { key: 'amp', label: 'Ampiezza' },
    { key: 'time', label: 'Tempo trascorso' },
    { key: 'angle', label: 'Angolo piano (rotante)' },
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
    P.mode = 'ball'; P.omega = 0.3; P.v0 = 4; P.aim = 0; P.R = 8;
    P.L = 3; P.ampDeg = 18; P.plane = 0; P.speed = 1.0; P.paused = false;
    buildControls(); buildReadout(); newRun(); syncPlay();
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
      readout.set('omega', P.omega.toFixed(2) + ' rad/s');
      if (P.mode === 'ball') {
        readout.set('v0', P.v0.toFixed(1) + ' m/s');
        readout.set('aim', P.aim.toFixed(0) + '°');
        readout.set('miss', D.rMin.toFixed(2) + ' m');
        readout.set('time', Math.min(animT, D.tExit).toFixed(2) + ' s');
        readout.set('stato', !ended ? 'in volo' : (D.rMin < HIT_TOL * D.R ? 'bersaglio colpito' : 'uscito dalla piattaforma'));
      } else {
        readout.set('L', P.L.toFixed(1) + ' m');
        readout.set('T0', (TWO / omegaP()).toFixed(2) + ' s');
        readout.set('amp', P.ampDeg.toFixed(0) + '°');
        readout.set('time', animT.toFixed(1) + ' s');
        let ang = P.plane - animT * P.omega * 180 / Math.PI; ang = ((ang % 360) + 360) % 360;
        readout.set('angle', ang.toFixed(0) + '°');
      }
    } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
