'use strict';

// ═══ Costanti fisiche reali della Luna ═══════════════════════════════════════
// Elementi orbitali medi e periodi delle precessioni: valori reali standard
// dell'astronomia lunare (non inventati né stimati). La forma dell'orbita
// (equazione di Keplero, esatta) e l'orientamento dell'asse (leggi di Cassini,
// esatte come relazione geometrica) sono modello chiuso; i TASSI di
// precessione (nodale, apsidale) sono presi come costanti empiriche note —
// è la perturbazione solare reale a produrli, ma il tasso medio osservato è
// una costante ben misurata, quindi usarlo direttamente è legittimo quanto
// usare G in un problema di gravitazione, non un'approssimazione ad hoc.
const DEG = Math.PI / 180, TWO = Math.PI * 2;
const MOON_A_KM = 384400;            // semiasse maggiore
const MOON_E = 0.0549;               // eccentricità
const MOON_I_DEG = 5.145;            // inclinazione del piano orbitale sull'eclittica
const MOON_OBLIQUITY_DEG = 1.543;    // inclinazione dell'asse di rotazione lunare rispetto al polo dell'eclittica (leggi di Cassini)
const T_SIDEREAL = 27.32166;         // giorni: periodo di rivoluzione (=rotazione, sincrona) rispetto alle stelle fisse
const T_ANOMALISTIC = 27.55455;      // giorni: perigeo→perigeo (usato per l'anomalia media, dato che gli apsidi avanzano)
const T_NODAL_PRECESSION = 6798.38;  // giorni ≈18,60 anni: periodo di regressione della linea dei nodi
const T_APSIDAL_PRECESSION = 3232.6; // giorni ≈8,85 anni: periodo di avanzamento della linea degli apsidi
const T_NUTATION = T_NODAL_PRECESSION / 2; // termine di nutazione illustrativo (periodo legato a metà del ciclo nodale)
const NUTATION_AMP_DEG = 1.3;        // AMPIEZZA ESAGERATA di proposito: la vera nutazione lunare è di pochi secondi d'arco,
                                      // invisibile a qualunque scala di questo disegno — qui ingrandita per essere osservabile
const MM = 1 / 1000;                 // km → Mm (megametri), unità di scena

const P = {
  speed: 2.5,        // giorni simulati al secondo (orbita + rotazione sincrona)
  precBoost: 15,      // fattore EXTRA solo per nodo/apsidi/asse/nutazione (dichiarato, si vede nel testo)
  showEcliptic: true,
  showOrbitPlane: true,
  showNodes: true,
  showApsides: true,
  showAxis: true,
  showNutation: true,
  paused: false,
};

let simDays = 0, last = 0;
let G = {}, cam = { az: 0.55, el: 0.42, zoom: 1.15 }, camDrag = null;
let gCanvas = [null, null, null], gCtx = [null, null, null], gTitle = [null, null, null];
let readout, stars = [];

// ═══ Palette ══════════════════════════════════════════════════════════════════
function dk() { return document.documentElement.dataset.theme !== 'light'; }
function pal() {
  const d = dk();
  return {
    bg: d ? '#050810' : '#e7edf4', txt: d ? 'rgba(225,238,250,0.96)' : 'rgba(20,40,70,0.95)',
    sub: d ? 'rgba(165,195,220,0.82)' : 'rgba(60,90,125,0.9)', accent: d ? '#00d4ff' : '#0a78b0',
    ring: d ? 'rgba(150,175,205,0.4)' : 'rgba(60,95,130,0.45)',
    gBg: d ? 'rgb(3,9,22)' : '#eef2f7', gAxis: d ? 'rgba(100,155,210,0.3)' : 'rgba(40,80,130,0.32)', gText: d ? 'rgba(150,205,225,0.88)' : 'rgba(25,65,105,0.92)',
  };
}
let T = pal();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const fmt = (x, u) => (Math.abs(x) < 10 ? x.toFixed(2) : x.toFixed(1)) + (u || '');
const degOf = r => r * 180 / Math.PI;
function normalizeAngle(a) { a = a % TWO; if (a > Math.PI) a -= TWO; if (a < -Math.PI) a += TWO; return a; }

// ═══ Vettori 3D minimi ════════════════════════════════════════════════════════
const vAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vScale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const vCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vNorm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1e-9; return [a[0] / l, a[1] / l, a[2] / l]; };
function rodrigues(v, k, theta) {
  const kv = vCross(k, v), kd = vDot(k, v), c = Math.cos(theta), s = Math.sin(theta);
  return [v[0] * c + kv[0] * s + k[0] * kd * (1 - c), v[1] * c + kv[1] * s + k[1] * kd * (1 - c), v[2] * c + kv[2] * s + k[2] * kd * (1 - c)];
}

// ═══ Meccanica orbitale (validata numericamente prima di scrivere il rendering:
// perigeo/apogeo esatti da a,e; libr. in longitudine ≈2e; libr. in latitudine
// esattamente i+obliquità=6,69°; deriva nodale retrograda e apsidale prograda
// ai tassi giusti; inclinazione del piano corretta) ═══════════════════════════
function solveKepler(M, e) {
  let E = M;
  for (let k = 0; k < 10; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
}
// Trasformazione standard elementi-orbitali→cartesiane (sequenza di rotazione 3-1-3):
// ruota di ω (argomento del perigeo) nel piano, inclina di i, ruota di Ω (nodo) attorno al polo.
// NOTA sulla convenzione: con questa sequenza l'azimut del NODO ascendente nel piano xy è Ω,
// ma l'azimut della NORMALE al piano orbitale è Ω−90° (non Ω) — la normale è perpendicolare
// alla linea dei nodi, non allineata con essa. Va tenuto a mente per l'asse di spin sotto.
function orbitalToEcliptic(xpf, ypf, omega, inc, Omega) {
  const cw = Math.cos(omega), sw = Math.sin(omega);
  const x1 = xpf * cw - ypf * sw, y1 = xpf * sw + ypf * cw, z1 = 0;
  const ci = Math.cos(inc), si = Math.sin(inc);
  const x2 = x1, y2 = y1 * ci - z1 * si, z2 = y1 * si + z1 * ci;
  const cO = Math.cos(Omega), sO = Math.sin(Omega);
  return [x2 * cO - y2 * sO, x2 * sO + y2 * cO, z2];
}

function deriveState(sd) {
  const boosted = sd * P.precBoost;                       // "tempo effettivo" per nodo/apsidi/asse/nutazione
  let Omega = -TWO / T_NODAL_PRECESSION * boosted;         // regressione dei nodi (retrograda)
  const nut = P.showNutation ? NUTATION_AMP_DEG * DEG * Math.sin(TWO * boosted / T_NUTATION) : 0;
  Omega += nut;
  // +45° di fase iniziale: scelta arbitraria dell'epoca (come scegliere quale plenilunio è t=0), non
  // ha alcun effetto fisico — solo scelta per cui il diagramma di librazione parte da un anello ben
  // aperto invece che dal caso degenere (perigeo sul nodo, ω=0) in cui librazione in longitudine e
  // in latitudine sono quasi perfettamente anti-correlate e il diagramma collassa in una linea sottile
  const omega = TWO / T_APSIDAL_PRECESSION * boosted + Math.PI / 4;      // avanzamento degli apsidi (prograda)
  const inc = MOON_I_DEG * DEG;

  const M = (TWO / T_ANOMALISTIC * sd) % TWO;              // anomalia media (moto uniforme rispetto al perigeo mobile)
  const E = solveKepler(M, MOON_E);
  const trueAnom = 2 * Math.atan2(Math.sqrt(1 + MOON_E) * Math.sin(E / 2), Math.sqrt(1 - MOON_E) * Math.cos(E / 2));
  const rKm = MOON_A_KM * (1 - MOON_E * Math.cos(E));
  const pos = orbitalToEcliptic(rKm * Math.cos(trueAnom), rKm * Math.sin(trueAnom), omega, inc, Omega);

  // asse di spin (leggi di Cassini): inclinato di MOON_OBLIQUITY_DEG dal polo dell'eclittica, sul
  // lato OPPOSTO alla normale orbitale — normale, polo eclittico e asse restano complanari mentre
  // precedono insieme, con lo STESSO periodo nodale. Azimut = Ω+90° (vedi nota sopra sulla convenzione).
  const spinAxisLon = Omega + Math.PI / 2;
  const tilt = MOON_OBLIQUITY_DEG * DEG;
  const zBody = [Math.sin(tilt) * Math.cos(spinAxisLon), Math.sin(tilt) * Math.sin(spinAxisLon), Math.cos(tilt)];
  const xRef = vNorm(vCross([0, 0, 1], zBody));
  const spinAngle = M;                                     // rotazione sincrona: uniforme, al ritmo del moto MEDIO (non vero)
  const xBody = rodrigues(xRef, zBody, spinAngle);
  const yBody = vCross(zBody, xBody);

  const dirToEarth = vNorm(pos.map(c => -c));
  const bodyLat = Math.asin(clamp(vDot(dirToEarth, zBody), -1, 1));
  const bodyLon = Math.atan2(vDot(dirToEarth, yBody), vDot(dirToEarth, xBody));

  const nodeDir = [Math.cos(Omega), Math.sin(Omega), 0];               // nodo ascendente
  const perigeeDir = vNorm(orbitalToEcliptic(1, 0, omega, inc, Omega)); // direzione del perigeo

  return {
    Omega, omega, inc, M, E, trueAnom, rKm, pos,
    zBody, xBody, yBody, spinAngle,
    librationLon: normalizeAngle(trueAnom - M), bodyLat, bodyLon,
    nodeDir, perigeeDir,
  };
}

function step(dt) { if (!P.paused) simDays += dt * P.speed; }

// ═══ Telecamera orbitale trascinabile (stesso schema di gyroscope/pulsar) ═════
function geom(W, H) {
  const cx = W * 0.5, cy = H * 0.56;
  const extent = MOON_A_KM * (1 + MOON_E) * MM * 1.08;
  const S = Math.min(W * 0.92, H * 0.88) * 0.5 / extent;
  G = { cx, cy, S, W, H };
}
function proj(v) {
  const ct = Math.cos(cam.az), st = Math.sin(cam.az);
  const x1 = v[0] * ct - v[1] * st, y1 = v[0] * st + v[1] * ct, z1 = v[2];
  const ce = Math.cos(cam.el), se = Math.sin(cam.el);
  const y2 = y1 * ce - z1 * se, z2 = y1 * se + z1 * ce;
  const S = G.S * cam.zoom;
  return { sx: G.cx + x1 * S, sy: G.cy - z2 * S, depth: y2 };
}
function projScaled(vKm) { return proj(vScale(vKm, MM)); }

// ═══ Rendering ════════════════════════════════════════════════════════════════
const EARTH_VIS_R = 24, MOON_VIS_R = 10;   // Mm di scena — NON in scala reale (dichiarato in didascalia): a scala vera sarebbero puntini di pochi px
function initStars(n) { stars = []; for (let i = 0; i < n; i++) stars.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.2 + 0.2, a: Math.random() * 0.5 + 0.15 }); }

function drawSphere(ctx, x, y, r, hi, base) {
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = r * 0.4; ctx.shadowOffsetY = r * 0.12;
  const grad = ctx.createRadialGradient(x - r * 0.4, y - r * 0.42, r * 0.1, x, y, r * 1.05);
  grad.addColorStop(0, hi); grad.addColorStop(1, base);
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, r, 0, TWO); ctx.fill(); ctx.restore();
}
function ringPoints(fn, n) { const pts = []; for (let k = 0; k <= n; k++) pts.push(fn(k / n * TWO)); return pts; }
function strokePoly(ctx, pts, close) {
  ctx.beginPath();
  pts.forEach((v, i) => { const p = proj(v); i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy); });
  if (close) ctx.closePath();
  ctx.stroke();
}
function fillPoly(ctx, pts) {
  ctx.beginPath();
  pts.forEach((v, i) => { const p = proj(v); i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy); });
  ctx.closePath(); ctx.fill();
}

function draw(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  T = pal();
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = dk() ? 'rgba(255,255,255,0.7)' : 'rgba(30,50,80,0.25)';
  for (const s of stars) { ctx.globalAlpha = s.a; ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, TWO); ctx.fill(); }
  ctx.globalAlpha = 1;
  geom(W, H);

  const S = deriveState(simDays);
  const posMm = vScale(S.pos, MM);
  const extentMm = MOON_A_KM * (1 + MOON_E) * MM;

  // piano dell'eclittica: griglia di riferimento a z=0
  if (P.showEcliptic) {
    ctx.strokeStyle = dk() ? 'rgba(100,180,220,0.14)' : 'rgba(30,80,120,0.16)'; ctx.lineWidth = 1;
    for (let rr = extentMm * 0.28; rr <= extentMm * 1.18; rr += extentMm * 0.28) strokePoly(ctx, ringPoints(a => [Math.cos(a) * rr, Math.sin(a) * rr, 0], 72), true);
    ctx.beginPath();
    [0, Math.PI / 2].forEach(a => { const p1 = proj([Math.cos(a) * extentMm * 1.18, Math.sin(a) * extentMm * 1.18, 0]), p2 = proj([-Math.cos(a) * extentMm * 1.18, -Math.sin(a) * extentMm * 1.18, 0]); ctx.moveTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy); });
    ctx.stroke();
  }

  // piano orbitale della Luna: disco sottile (solo orientamento: i, Ω) sotto l'ellisse dell'orbita vera
  if (P.showOrbitPlane) {
    ctx.fillStyle = dk() ? 'rgba(190,120,255,0.07)' : 'rgba(140,60,220,0.08)';
    fillPoly(ctx, ringPoints(a => orbitalToEcliptic(Math.cos(a) * MOON_A_KM * MM, Math.sin(a) * MOON_A_KM * MM, 0, S.inc, S.Omega), 72));
  }
  // orbita vera (ellisse kepleriana, con eccentricità e perigeo attuali)
  ctx.strokeStyle = dk() ? 'rgba(190,120,255,0.55)' : 'rgba(140,60,220,0.6)'; ctx.lineWidth = 1.6;
  strokePoly(ctx, ringPoints(nu => {
    const r = MOON_A_KM * (1 - MOON_E * MOON_E) / (1 + MOON_E * Math.cos(nu));
    return orbitalToEcliptic(r * Math.cos(nu) * MM, r * Math.sin(nu) * MM, S.omega, S.inc, S.Omega);
  }, 96), true);

  // linea dei nodi (intersezione piano orbitale / eclittica)
  if (P.showNodes) {
    const ext = extentMm * 1.12;
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 1.6; ctx.setLineDash([6, 5]);
    const p1 = proj(vScale(S.nodeDir, ext)), p2 = proj(vScale(S.nodeDir, -ext));
    ctx.beginPath(); ctx.moveTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffd23f'; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'left';
    ctx.fillText('☊ nodo asc.', p1.sx + 6, p1.sy);
  }
  // linea degli apsidi (perigeo—apogeo)
  if (P.showApsides) {
    const rPeri = MOON_A_KM * (1 - MOON_E) * MM, rApo = MOON_A_KM * (1 + MOON_E) * MM;
    const pPeri = proj(vScale(S.perigeeDir, rPeri)), pApo = proj(vScale(S.perigeeDir, -rApo));
    ctx.strokeStyle = '#ff9d4d'; ctx.lineWidth = 1.6; ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.moveTo(pPeri.sx, pPeri.sy); ctx.lineTo(pApo.sx, pApo.sy); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#ff9d4d'; ctx.font = '9px "Space Mono",monospace';
    ctx.fillText('perigeo', pPeri.sx + 6, pPeri.sy + 10);
    ctx.fillText('apogeo', pApo.sx + 6, pApo.sy + 10);
  }

  // depth-sort semplice fra Terra e Luna (scena altrimenti senza depth-sorting, come altri lab del sito)
  const earthP = proj([0, 0, 0]), moonP = proj(posMm);
  const drawEarth = () => { drawSphere(ctx, earthP.sx, earthP.sy, EARTH_VIS_R * G.S * cam.zoom, '#8fd0ff', '#1c5a8a'); };
  const drawMoon = () => {
    const mr = MOON_VIS_R * G.S * cam.zoom;
    drawSphere(ctx, moonP.sx, moonP.sy, mr, '#e8e4dc', '#8a8478');

    // asse di rotazione (con precessione assiale di Cassini)
    if (P.showAxis) {
      const a1 = proj(vAdd(posMm, vScale(S.zBody, MOON_VIS_R * 2.1))), a2 = proj(vAdd(posMm, vScale(S.zBody, -MOON_VIS_R * 2.1)));
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(a1.sx, a1.sy); ctx.lineTo(a2.sx, a2.sy); ctx.stroke();
    }
    // meridiano di riferimento del corpo (rotazione uniforme) vs punto sub-terrestre reale (posizione
    // vera): lo SCARTO fra i due, visibile a occhio, È la librazione in longitudine+latitudine
    const refPt = vAdd(posMm, vScale(S.xBody, MOON_VIS_R));
    const dirToEarth = vNorm(vScale(posMm, -1));
    const subEarthPt = vAdd(posMm, vScale(dirToEarth, MOON_VIS_R));
    const centerDepth = moonP.depth;
    const pRef = proj(refPt), pSub = proj(subEarthPt);
    if (pRef.depth < centerDepth + 0.5) { ctx.fillStyle = '#ff9d4d'; ctx.beginPath(); ctx.arc(pRef.sx, pRef.sy, 2.6, 0, TWO); ctx.fill(); }
    if (pSub.depth < centerDepth + 0.5) { ctx.fillStyle = '#4dff9d'; ctx.beginPath(); ctx.arc(pSub.sx, pSub.sy, 2.6, 0, TWO); ctx.fill(); }
  };
  if (earthP.depth <= moonP.depth) { drawEarth(); drawMoon(); } else { drawMoon(); drawEarth(); }

  // intestazione
  ctx.textAlign = 'left';
  ctx.fillStyle = T.accent; ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.fillText('I moti della Luna — rotazione, rivoluzione, precessioni, librazioni', 14, 22);
  ctx.fillStyle = T.txt; ctx.font = '10px "Space Mono",monospace';
  ctx.fillText(`t=${simDays.toFixed(1)}g   r=${S.rKm.toFixed(0)}km   Ω=${degOf(S.Omega).toFixed(1)}°   ω=${degOf(S.omega).toFixed(1)}°   libr. lon=${degOf(S.librationLon).toFixed(1)}° lat=${degOf(S.bodyLat).toFixed(1)}°`, 14, 40);
  ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText('● arancio = meridiano di riferimento (rotazione uniforme)   ● verde = punto realmente rivolto verso la Terra — la loro distanza è la librazione. Terra/Luna fuori scala per essere visibili; distanze e angoli sono esatti.', G.cx, H - 8);
}

// ═══ Grafici (curve analitiche statiche + marcatore mobile — nessun buffer di storia necessario,
// tutte e tre le quantità sono funzioni chiuse dei parametri correnti) ═════════════════════════
function gBase(ctx, W, H, PAD) {
  ctx.fillStyle = T.gBg; ctx.fillRect(0, 0, W, H);
  const gW = W - PAD.l - PAD.r, gH = H - PAD.t - PAD.b;
  ctx.strokeStyle = T.gAxis; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(PAD.l, PAD.t); ctx.lineTo(PAD.l, PAD.t + gH); ctx.lineTo(PAD.l + gW, PAD.t + gH); ctx.stroke();
  return { gW, gH };
}
// 1: diagramma di librazione (longitudine vs latitudine) — ciclo chiuso su un'orbita, all'omega attuale
function drawGraphLibration() {
  const cv = gCanvas[0]; if (!cv || !cv.width) return;
  const ctx = gCtx[0], W = cv.width, H = cv.height, PAD = { t: 12, b: 14, l: 22, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const Snow = deriveState(simDays);
  // curva parametrica su un'orbita intera all'omega/Omega correnti (congelati): a seconda della fase
  // apsidale attuale il loop può apparire più o meno "aperto" — riscaliamo gli assi sull'estensione
  // REALE della curva (non un ±9° fisso) così resta sempre ben leggibile qualunque sia la fase
  const pts = [];
  let lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity;
  for (let k = 0; k <= 240; k++) {
    const Mp = k / 240 * TWO;
    const E = solveKepler(Mp, MOON_E);
    const nu = 2 * Math.atan2(Math.sqrt(1 + MOON_E) * Math.sin(E / 2), Math.sqrt(1 - MOON_E) * Math.cos(E / 2));
    const rKm = MOON_A_KM * (1 - MOON_E * Math.cos(E));
    const pos = orbitalToEcliptic(rKm * Math.cos(nu), rKm * Math.sin(nu), Snow.omega, Snow.inc, Snow.Omega);
    const dirE = vNorm(pos.map(c => -c));
    const lat = Math.asin(clamp(vDot(dirE, Snow.zBody), -1, 1));
    const xBodyK = rodrigues(vNorm(vCross([0, 0, 1], Snow.zBody)), Snow.zBody, Mp);
    const yBodyK = vCross(Snow.zBody, xBodyK);
    const lon = Math.atan2(vDot(dirE, yBodyK), vDot(dirE, xBodyK));
    pts.push([lon, lat]);
    lonMin = Math.min(lonMin, lon); lonMax = Math.max(lonMax, lon); latMin = Math.min(latMin, lat); latMax = Math.max(latMax, lat);
  }
  const lonC = (lonMin + lonMax) / 2, latC = (latMin + latMax) / 2;
  const AMP = Math.max(lonMax - lonMin, latMax - latMin, 1 * DEG) / 2 * 1.25;
  const xOf = lon => PAD.l + ((lon - lonC) / AMP * 0.5 + 0.5) * gW, yOf = lat => PAD.t + gH - ((lat - latC) / AMP * 0.5 + 0.5) * gH;
  ctx.strokeStyle = '#4dff9d'; ctx.lineWidth = 1.3; ctx.beginPath();
  pts.forEach(([lon, lat], k) => { const x = xOf(lon), y = yOf(lat); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.stroke();
  const cx = xOf(Snow.bodyLon), cy = yOf(Snow.bodyLat);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, 2.8, 0, TWO); ctx.fill();
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('lat', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('lon', PAD.l + gW - 2, PAD.t + gH - 3);
}
// 2: Ω(t) e ω(t) su una finestra di anni (tempo effettivo, con il boost di precessione già applicato)
function drawGraphPrecession() {
  const cv = gCanvas[1]; if (!cv || !cv.width) return;
  const ctx = gCtx[1], W = cv.width, H = cv.height, PAD = { t: 12, b: 14, l: 22, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const YEARS = 20;
  const xOf = y => PAD.l + y / YEARS * gW, yOf = deg => PAD.t + gH - (clamp(deg, -180, 540) + 180) / 720 * gH;
  const TnodY = T_NODAL_PRECESSION / 365.25, TapsY = T_APSIDAL_PRECESSION / 365.25;
  ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 1.4; ctx.beginPath();
  for (let k = 0; k <= 200; k++) { const y = k / 200 * YEARS; const deg = (-360 / TnodY * y); const x = xOf(y), yy = yOf(((deg % 360) + 360) % 360 - 180); k ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); }
  ctx.stroke();
  ctx.strokeStyle = '#ff9d4d'; ctx.lineWidth = 1.4; ctx.beginPath();
  for (let k = 0; k <= 200; k++) { const y = k / 200 * YEARS; const deg = (360 / TapsY * y); const x = xOf(y), yy = yOf(((deg % 360) + 360) % 360 - 180); k ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); }
  ctx.stroke();
  const curY = clamp(simDays * P.precBoost / 365.25, 0, YEARS);
  const px = xOf(curY);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, PAD.t); ctx.lineTo(px, PAD.t + gH); ctx.stroke();
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('Ω,ω [°]', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('anni', PAD.l + gW - 2, PAD.t + gH - 3);
}
// 3: distanza Terra-Luna in funzione dell'anomalia — perigeo/apogeo dell'orbita corrente
function drawGraphDistance() {
  const cv = gCanvas[2]; if (!cv || !cv.width) return;
  const ctx = gCtx[2], W = cv.width, H = cv.height, PAD = { t: 12, b: 14, l: 26, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const rMin = MOON_A_KM * (1 - MOON_E), rMax = MOON_A_KM * (1 + MOON_E);
  const xOf = M => PAD.l + M / TWO * gW, yOf = r => PAD.t + gH - (r - rMin * 0.985) / (rMax * 1.015 - rMin * 0.985) * gH;
  ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 1.4; ctx.beginPath();
  for (let k = 0; k <= 200; k++) { const Mp = k / 200 * TWO; const E = solveKepler(Mp, MOON_E); const r = MOON_A_KM * (1 - MOON_E * Math.cos(E)); const x = xOf(Mp), y = yOf(r); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke();
  const Snow = deriveState(simDays);
  const cx = xOf(Snow.M), cy = yOf(Snow.rKm);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, 2.8, 0, TWO); ctx.fill();
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('r [km]', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('M', PAD.l + gW - 2, PAD.t + gH - 3);
}
function drawGraphs() {
  const titles = ['Librazione: lon × lat', 'Ω nodo, ω apsidi (anni)', 'Distanza r(M)'];
  for (let i = 0; i < 3; i++) if (gTitle[i]) gTitle[i].textContent = titles[i];
  drawGraphLibration(); drawGraphPrecession(); drawGraphDistance();
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls() {
  const cont = document.getElementById('controls'); cont.innerHTML = '';

  const st = Lab.Section('Tempo'); cont.appendChild(st.el);
  st.add(Lab.Slider({ label: 'Velocità orbita/rotazione', min: 0.3, max: 12, step: 0.1, value: P.speed, unit: ' giorni/s', onChange(v) { P.speed = v; } }));
  st.add(Lab.Slider({ label: 'Velocità precessione (extra)', min: 1, max: 50, step: 1, value: P.precBoost, unit: '×', onChange(v) { P.precBoost = v; } }));

  const sv = Lab.Section('Visualizza'); cont.appendChild(sv.el);
  sv.add(Lab.Toggle({ label: 'Piano dell\'eclittica', value: P.showEcliptic, onChange(v) { P.showEcliptic = v; } }));
  sv.add(Lab.Toggle({ label: 'Piano orbitale della Luna', value: P.showOrbitPlane, onChange(v) { P.showOrbitPlane = v; } }));
  sv.add(Lab.Toggle({ label: 'Linea dei nodi', value: P.showNodes, onChange(v) { P.showNodes = v; } }));
  sv.add(Lab.Toggle({ label: 'Linea degli apsidi', value: P.showApsides, onChange(v) { P.showApsides = v; } }));
  sv.add(Lab.Toggle({ label: 'Asse di rotazione', value: P.showAxis, onChange(v) { P.showAxis = v; } }));
  sv.add(Lab.Toggle({ label: 'Nutazione (esagerata)', value: P.showNutation, onChange(v) { P.showNutation = v; } }));

  const sc = Lab.Section('Telecamera'); cont.appendChild(sc.el);
  const bTop = document.createElement('button'); bTop.className = 'ctrl-btn'; bTop.textContent = 'Vista dall\'alto (nodi/apsidi)';
  bTop.addEventListener('click', () => { cam.az = 0.02; cam.el = 1.45; });
  sc.add(bTop);
  const bSide = document.createElement('button'); bSide.className = 'ctrl-btn'; bSide.textContent = 'Vista laterale (inclinazione)';
  bSide.addEventListener('click', () => { cam.az = 0.3; cam.el = 0.06; });
  sc.add(bSide);

  buildPeriodsInfo(cont);
}

// Elenco dei periodi reali, calcolato dalle stesse costanti usate nella fisica (non valori scritti a
// mano separatamente): se le costanti cambiassero questo pannello resterebbe automaticamente coerente.
function buildPeriodsInfo(cont) {
  const sp = Lab.Section('Periodi reali'); cont.appendChild(sp.el);
  const rows = [
    ['Rotazione (sincrona)', T_SIDEREAL.toFixed(2) + ' giorni'],
    ['Rivoluzione (siderale)', T_SIDEREAL.toFixed(2) + ' giorni'],
    ['Rivoluzione (anomalistica)', T_ANOMALISTIC.toFixed(2) + ' giorni'],
    ['Precessione nodale (retr.)', (T_NODAL_PRECESSION / 365.25).toFixed(2) + ' anni'],
    ['Precessione apsidale (prog.)', (T_APSIDAL_PRECESSION / 365.25).toFixed(2) + ' anni'],
    ['Precessione assiale (Cassini)', (T_NODAL_PRECESSION / 365.25).toFixed(2) + ' anni'],
    ['Nutazione (illustrativa)', (T_NUTATION / 365.25).toFixed(2) + ' anni'],
    ['Librazione lon./lat.', T_ANOMALISTIC.toFixed(2) + ' giorni'],
  ];
  const list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
  rows.forEach(([label, value]) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-family:"Space Mono",monospace;';
    const l = document.createElement('span');
    l.textContent = label;
    l.style.cssText = 'font-size:10px;color:var(--text-secondary);letter-spacing:0.2px;';
    const v = document.createElement('span');
    v.textContent = value;
    v.style.cssText = 'font-size:11px;font-weight:700;color:var(--accent);white-space:nowrap;';
    row.append(l, v);
    list.appendChild(row);
  });
  sp.add(list);
}

function buildReadout() {
  const cont = document.getElementById('readout'); cont.innerHTML = '';
  readout = new Lab.Readout(cont, [
    { key: 't', label: 'Tempo simulato' },
    { key: 'r', label: 'Distanza Terra-Luna' },
    { key: 'Omega', label: 'Longitudine del nodo Ω' },
    { key: 'omega', label: 'Longitudine del perigeo' },
    { key: 'libLon', label: 'Librazione in longitudine' },
    { key: 'libLat', label: 'Librazione in latitudine' },
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
  initStars(140);
  buildControls(); initGraphs(); buildReadout();
  const simCanvas = document.getElementById('simCanvas');
  const btnPlay = document.getElementById('btnPlay');
  function syncPlay() { btnPlay.textContent = P.paused ? '▶  AVVIA' : '⏸  PAUSA'; }
  syncPlay();
  btnPlay.addEventListener('click', () => { P.paused = !P.paused; syncPlay(); });
  document.getElementById('btnReset').addEventListener('click', () => {
    P.speed = 2.5; P.precBoost = 15; P.showEcliptic = true; P.showOrbitPlane = true; P.showNodes = true;
    P.showApsides = true; P.showAxis = true; P.showNutation = true; P.paused = false;
    simDays = 0; cam = { az: 0.55, el: 0.42, zoom: 1.15 };
    buildControls(); syncPlay();
  });

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
    cam.el = clamp(camDrag.el - dy * 0.008, -1.5, 1.5);
  });
  simCanvas.addEventListener('pointerup', () => { camDrag = null; simCanvas.style.cursor = 'grab'; });
  simCanvas.addEventListener('pointercancel', () => { camDrag = null; simCanvas.style.cursor = 'grab'; });
  simCanvas.addEventListener('wheel', e => {
    e.preventDefault();
    cam.zoom = clamp(cam.zoom * (e.deltaY > 0 ? 0.92 : 1.08), 0.35, 3.5);
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
    step(dt);
    try {
      draw(simCanvas); drawGraphs();
      const S = deriveState(simDays);
      readout.set('t', simDays.toFixed(1) + ' giorni (' + (simDays / 365.25).toFixed(2) + ' anni)');
      readout.set('r', S.rKm.toFixed(0) + ' km');
      readout.set('Omega', degOf(S.Omega).toFixed(1) + '°');
      readout.set('omega', degOf(S.omega).toFixed(1) + '°');
      readout.set('libLon', degOf(S.librationLon).toFixed(2) + '°');
      readout.set('libLat', degOf(S.bodyLat).toFixed(2) + '°');
    } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
