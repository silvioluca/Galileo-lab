'use strict';

// ═══ Costanti fisiche (unità geometrizzate G=c=1, distanze in unità di M) ═══════════════════
// Render a ray-tracing reale: per ogni pixello si integra la vera equazione della geodetica nulla
// di Schwarzschild (non un'approssimazione grafica) per scoprire dove quel raggio di luce
// interseca il piano del disco di accrescimento — è esattamente questo che produce l'"alone"
// deformato attorno al buco nero (la luce del lato lontano del disco, piegata sopra e sotto
// l'orizzonte, diventa visibile) invece di disegnarlo a mano.
//
// Equazione integrata (forma del second'ordine, robusta — nessun segno da invertire ai punti di
// inversione): d²u/dφ² = -u + 3u², con u=1/r. Validata a parte contro la formula di Einstein per
// la deflessione debole Δφ≈4M/b (errore <0.1% per b grandi, e il residuo coincide con l'ordine
// successivo noto 15πM²/(4b²)) e contro la cattura sotto b_crit=3√3M — PRIMA di essere integrata
// qui, esattamente come per il risolutore di circuiti di questa sessione.
const TWO = Math.PI * 2;
const SCHW_KM_PER_MSUN = 2.953;
const CAM_R = 22;              // distanza della camera dal buco nero, unità di M — fissa: la tabella di deflessione dipende da questo valore, tenerlo costante evita di doverla ricostruire
const B_CRIT = 3 * Math.sqrt(3); // parametro d'impatto critico esatto di Schwarzschild (fotoni con b<b_crit vengono catturati)

// ═══ Tabella di deflessione fotonica — costruita UNA volta, riusata per ogni pixel di ogni frame ═══
const B_MAX = 34, B_SAMPLES = 480;
const PHI_MAX = 11 * Math.PI, PHI_STEP = 0.018;
const N_PHI = Math.round(PHI_MAX / PHI_STEP);
let deflTable = null; // Float32Array[B_SAMPLES*N_PHI]: u(φ) per ciascun b; -1 = già catturato a quel φ
function bOfIndex(bi) { return 0.05 + (B_MAX - 0.05) * Math.pow(bi / (B_SAMPLES - 1), 1.6); } // più campioni vicino a b_crit
function indexOfB(b) { return (B_SAMPLES - 1) * Math.pow(Math.max(0, (b - 0.05) / (B_MAX - 0.05)), 1 / 1.6); }
function odeDeriv(u, up) { return [up, -u + 3 * u * u]; }
function rk4(u, up, h) {
  const k1 = odeDeriv(u, up);
  const k2 = odeDeriv(u + h / 2 * k1[0], up + h / 2 * k1[1]);
  const k3 = odeDeriv(u + h / 2 * k2[0], up + h / 2 * k2[1]);
  const k4 = odeDeriv(u + h * k3[0], up + h * k3[1]);
  return [u + h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]), up + h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])];
}
function buildDeflectionTable() {
  deflTable = new Float32Array(B_SAMPLES * N_PHI);
  const dphiInt = 0.003;
  const u0 = 1 / CAM_R;
  // una volta che un fotone è chiaramente sfuggito (u molto piccolo, r decine di volte la distanza
  // della camera, e ancora in allontanamento) si smette di integrare e si "congela" u a un valore
  // piccolo ma POSITIVO — senza questo taglio l'equazione continua oltre il punto in cui il fotone
  // è ormai andato all'infinito e u oscilla fino a diventare negativo (puro artefatto numerico, non
  // fisica), che lookupU scambiava per "catturato dall'orizzonte": bug reale scoperto controllando
  // perché l'etichetta "Anello di fotoni" finiva ancorata al bordo superiore del fotogramma — i
  // raggi con parametro d'impatto grande (chiaramente diretti al cielo) venivano marcati come
  // orizzonte, gonfiando artificialmente la sagoma nera lungo tutto il bordo superiore dell'immagine.
  const ESCAPE_U = u0 * 0.05;
  for (let bi = 0; bi < B_SAMPLES; bi++) {
    const b = bOfIndex(bi);
    let u = u0, up = Math.sqrt(Math.max(0, 1 / (b * b) - u * u + 2 * u * u * u));
    let phi = 0, captured = false, escaped = false, uFrozen = 0;
    for (let s = 0; s < N_PHI; s++) {
      const targetPhi = s * PHI_STEP;
      if (!captured && !escaped) {
        while (phi < targetPhi - 1e-9) {
          const h = Math.min(dphiInt, targetPhi - phi);
          const r2 = rk4(u, up, h); u = r2[0]; up = r2[1]; phi += h;
          if (u > 0.5) { captured = true; break; }
          if (u < ESCAPE_U && up < 0) { escaped = true; uFrozen = Math.max(u, 1e-5); break; }
        }
      }
      deflTable[bi * N_PHI + s] = captured ? -1 : (escaped ? uFrozen : u);
    }
  }
}
function lookupU(b, phi) {
  if (phi < 0 || phi > PHI_MAX - PHI_STEP) return null;
  const bf = clamp(indexOfB(b), 0, B_SAMPLES - 1.0001);
  const bi0 = Math.floor(bf), bfrac = bf - bi0, bi1 = Math.min(bi0 + 1, B_SAMPLES - 1);
  const pf = clamp(phi / PHI_STEP, 0, N_PHI - 1.0001);
  const pi0 = Math.floor(pf), pfrac = pf - pi0, pi1 = Math.min(pi0 + 1, N_PHI - 1);
  const g = (bi, pi) => deflTable[bi * N_PHI + pi];
  const u00 = g(bi0, pi0), u01 = g(bi0, pi1), u10 = g(bi1, pi0), u11 = g(bi1, pi1);
  if (u00 < 0 || u01 < 0 || u10 < 0 || u11 < 0) return -1;
  return u00 * (1 - bfrac) * (1 - pfrac) + u10 * bfrac * (1 - pfrac) + u01 * (1 - bfrac) * pfrac + u11 * bfrac * pfrac;
}

// ═══ ISCO di Kerr esatta (Bardeen-Press-Teukolsky) — fissa il raggio interno del disco ═══════════
// (la curvatura della luce nel render resta quella di Schwarzschild: la vera geodetica di Kerr non
// è una superficie di rivoluzione semplice per il trascinamento dei sistemi di riferimento — qui
// dichiarata approssimazione visiva; l'ISCO che determina il bordo del disco resta invece esatta)
function kerrISCO(aStar) {
  const Z1 = 1 + Math.cbrt(1 - aStar * aStar) * (Math.cbrt(1 + aStar) + Math.cbrt(1 - aStar));
  const Z2 = Math.sqrt(3 * aStar * aStar + Z1 * Z1);
  return 3 + Z2 - Math.sqrt((3 - Z1) * (3 + Z1 + 2 * Z2));
}

const SPIN_VISUAL_BOOST = 22; // il gas reale impiegherebbe minuti-ore a fare un giro visibile: fattore di velocità dichiarato, solo per la texture animata (non tocca alcuna fisica calcolata)

const P = {
  aStar: 0.6,
  massSolar: 10,
  incDeg: 75,          // inclinazione della camera rispetto al polo, gradi
  diskOut: 16,          // raggio esterno del disco, unità di M
  speed: 1.0,
  paused: false,
};
let D = {};
let cam = { az: 0.4 };
let camDrag = null;
let animT = 0, last = 0;
let G = {};
let gCanvas = [null, null, null], gCtx = [null, null, null], gTitle = [null, null, null];
let readout;

// buffer di rendering fuori schermo (bassa risoluzione interna, poi scalato sul canvas)
let traceBuf = null;      // {w,h, kind:Uint8Array, r:Float32Array, phi:Float32Array, order:Uint8Array}
let offCanvas = null, offCtx = null, offImg = null;
let needsRetrace = true;

// ═══ Palette ══════════════════════════════════════════════════════════════════
function dk() { return document.documentElement.dataset.theme !== 'light'; }
function pal() {
  const d = dk();
  return {
    bg: '#000003', txt: d ? 'rgba(225,238,250,0.96)' : 'rgba(20,40,70,0.95)',
    sub: d ? 'rgba(165,195,220,0.82)' : 'rgba(60,90,125,0.9)', accent: d ? '#00d4ff' : '#0a78b0',
    warn: d ? '#ff9d4d' : '#c0680a', grid: d ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.04)',
    gBg: d ? 'rgb(3,6,16)' : '#eef2f7', gAxis: d ? 'rgba(100,155,210,0.3)' : 'rgba(40,80,130,0.32)', gText: d ? 'rgba(150,205,225,0.88)' : 'rgba(25,65,105,0.92)',
  };
}
let T = pal();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1e-9; return [a[0] / l, a[1] / l, a[2] / l]; }
function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }

function derive() {
  const aStar = clamp(P.aStar, 0, 0.998);
  const rPlus = 1 + Math.sqrt(1 - aStar * aStar);
  const rIsco = kerrISCO(aStar);
  const rsKm = SCHW_KM_PER_MSUN * P.massSolar;
  D = { aStar, rPlus, rIsco, rsKm, rDiskIn: Math.max(rIsco, rPlus * 1.01), rDiskOut: P.diskOut };
}
function newRun() { derive(); animT = 0; needsRetrace = true; }

// ═══ Traccia un singolo raggio: camPos e rayDir in coordinate del mondo (unità di M) ═══════════
function traceRay(camPos, rayDir) {
  const rCam = Math.hypot(camPos[0], camPos[1], camPos[2]);
  const radial = [camPos[0] / rCam, camPos[1] / rCam, camPos[2] / rCam];
  const cospsi = clamp(dot(radial, rayDir), -1, 1);
  const sinpsi = Math.sqrt(Math.max(0, 1 - cospsi * cospsi));
  const b = rCam * sinpsi / Math.sqrt(Math.max(1e-6, 1 - 2 / rCam));
  if (cospsi <= -0.999999) return { kind: 'sky' }; // raggio praticamente radiale uscente, nessun piano orbitale definito — trascurabile

  let planeN = cross(camPos, rayDir);
  const pnLen = Math.hypot(planeN[0], planeN[1], planeN[2]);
  if (pnLen < 1e-7) {
    // il raggio è quasi radiale: se punta verso il centro cade dentro, altrimenti fugge — nessun piano da definire
    return cospsi > 0.999999 ? { kind: b < B_CRIT ? 'horizon' : 'sky' } : { kind: 'sky' };
  }
  planeN = [planeN[0] / pnLen, planeN[1] / pnLen, planeN[2] / pnLen];

  const e1 = radial;
  let e2 = cross(planeN, e1);
  if (dot(rayDir, e2) < 0) e2 = [-e2[0], -e2[1], -e2[2]];

  let nodeDir = cross(planeN, [0, 0, 1]);
  const ndLen = Math.hypot(nodeDir[0], nodeDir[1], nodeDir[2]);
  if (ndLen < 1e-7) nodeDir = e1; else nodeDir = [nodeDir[0] / ndLen, nodeDir[1] / ndLen, nodeDir[2] / ndLen];

  const nx = dot(nodeDir, e1), ny = dot(nodeDir, e2);
  let phiNode = Math.atan2(ny, nx);
  if (phiNode < 0) phiNode += TWO;

  for (let k = 0; k < 10; k++) {
    const phiCross = phiNode + k * Math.PI;
    if (phiCross > PHI_MAX - PHI_STEP) break;
    const u = lookupU(b, phiCross);
    if (u === -1) return { kind: 'horizon' };
    if (u === null) continue;
    const r = 1 / u;
    if (r >= D.rDiskIn && r <= D.rDiskOut) {
      const cx = Math.cos(phiCross), sx = Math.sin(phiCross);
      const dir3 = [e1[0] * cx + e2[0] * sx, e1[1] * cx + e2[1] * sx, e1[2] * cx + e2[2] * sx];
      const globalPhi = Math.atan2(dir3[1], dir3[0]);
      return { kind: 'disk', r, phi: globalPhi, order: k };
    }
  }
  return { kind: 'sky' };
}

// ═══ Costruzione dell'immagine (tracciamento completo) ══════════════════════════════════════
function buildCamera() {
  const inc = P.incDeg * Math.PI / 180;
  const camPos = [CAM_R * Math.sin(inc) * Math.cos(cam.az), CAM_R * Math.sin(inc) * Math.sin(cam.az), CAM_R * Math.cos(inc)];
  const forward = norm([-camPos[0], -camPos[1], -camPos[2]]);
  let right = cross(forward, [0, 0, 1]);
  if (Math.hypot(right[0], right[1], right[2]) < 1e-6) right = [1, 0, 0]; else right = norm(right);
  const up = norm(cross(right, forward));
  return { camPos, forward, right, up };
}
function retrace(lowRes) {
  const w = lowRes ? 160 : Math.min(760, Math.max(320, Math.round(G.W * 0.62)));
  const h = Math.round(w * (G.H / G.W));
  const { camPos, forward, right, up } = buildCamera();
  const fovHalf = Math.PI / 180 * 20 / cam.zoomFov;
  const aspect = w / h;
  const kind = new Uint8Array(w * h);       // 0=sky 1=horizon 2=disk
  const rArr = new Float32Array(w * h);
  const phiArr = new Float32Array(w * h);
  const orderArr = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    const py = (0.5 - j / (h - 1)) * 2;
    for (let i = 0; i < w; i++) {
      const px = (i / (w - 1) - 0.5) * 2 * aspect;
      const rd = norm([
        forward[0] + px * Math.tan(fovHalf) * right[0] + py * Math.tan(fovHalf) * up[0],
        forward[1] + px * Math.tan(fovHalf) * right[1] + py * Math.tan(fovHalf) * up[1],
        forward[2] + px * Math.tan(fovHalf) * right[2] + py * Math.tan(fovHalf) * up[2],
      ]);
      const res = traceRay(camPos, rd);
      const idx = j * w + i;
      if (res.kind === 'horizon') kind[idx] = 1;
      else if (res.kind === 'disk') { kind[idx] = 2; rArr[idx] = res.r; phiArr[idx] = res.phi; orderArr[idx] = res.order; }
    }
  }
  traceBuf = { w, h, kind, r: rArr, phi: phiArr, order: orderArr };
  if (!offCanvas) { offCanvas = document.createElement('canvas'); offCtx = offCanvas.getContext('2d'); }
  offCanvas.width = w; offCanvas.height = h;
  offImg = offCtx.createImageData(w, h);
  needsRetrace = false;
}

// ═══ Colorazione del disco (temperatura, turbolenza, beaming Doppler, redshift gravitazionale) ═══
function tempColor(t) {
  t = clamp(t, 0, 1);
  const stops = [[0, 110, 15, 8], [0.28, 235, 70, 15], [0.58, 255, 175, 60], [0.83, 255, 240, 205], [1, 255, 255, 255]];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (t >= a[0] && t <= b[0]) { const f = (t - a[0]) / (b[0] - a[0]); return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f]; }
  }
  return [255, 255, 255];
}
function omegaOf(r) { const r15 = Math.pow(r, 1.5); return 1 / (r15 + D.aStar); } // Kerr, prograda, unità di M
// bande scure "a solchi" nel gas: due frequenze indipendenti (una segue la rotazione, una fissa nel
// raggio) si moltiplicano invece di sommarsi, cosi' dove entrambe sono basse si scava un solco
// davvero scuro invece di una semplice ondulazione di luminosità — l'effetto "vinile" della figura di riferimento
function streakTexture(phiLocal, rr) {
  const band1 = 0.5 + 0.5 * Math.sin(phiLocal * 5.2 + rr * 1.05);
  const band2 = 0.5 + 0.5 * Math.sin(phiLocal * 11.3 - rr * 2.1 + 1.4);
  const fine = 0.5 + 0.5 * Math.sin(phiLocal * 21 + rr * 3.4 - 0.7);
  const radialGroove = 0.5 + 0.5 * Math.sin(rr * 5.5 - phiLocal * 0.8);
  let t = (0.35 + 0.55 * band1) * (0.55 + 0.45 * band2) * (0.8 + 0.2 * fine) * (0.45 + 0.55 * radialGroove);
  return clamp(t, 0.08, 1.35);
}
let labelAnchors = null;
function paintFrame() {
  if (!traceBuf) return;
  const { w, h, kind, r, phi, order } = traceBuf;
  const data = offImg.data;
  const { camPos } = buildCamera();
  let hxMin = w, hxMax = 0, hyMin = h, hyMax = 0, hAny = false;
  let brightVal = -1, brightX = 0, brightY = 0;
  let topDiskY = h, topDiskX = 0, botDiskY = 0, botDiskX = 0;
  let leftDiskX = w, leftDiskY = 0, rightDiskX = 0, rightDiskY = 0;
  for (let idx = 0; idx < w * h; idx++) {
    const p4 = idx * 4, xPix = idx % w, yPix = (idx / w) | 0;
    if (kind[idx] === 0) { data[p4] = 2; data[p4 + 1] = 3; data[p4 + 2] = 7; data[p4 + 3] = 255; continue; }
    if (kind[idx] === 1) {
      data[p4] = 0; data[p4 + 1] = 0; data[p4 + 2] = 0; data[p4 + 3] = 255;
      hAny = true; if (xPix < hxMin) hxMin = xPix; if (xPix > hxMax) hxMax = xPix; if (yPix < hyMin) hyMin = yPix; if (yPix > hyMax) hyMax = yPix;
      continue;
    }
    const rr = r[idx], phiLocal = phi[idx] - omegaOf(rr) * animT * SPIN_VISUAL_BOOST;
    const tempFrac = clamp(Math.pow(D.rDiskIn / rr, 0.75), 0, 1);
    const turb = streakTexture(phiLocal, rr);
    const [tr, tg, tb] = tempColor(tempFrac * turb);
    // beaming relativistico approssimato: velocità locale orbitale beta=sqrt(1/(r-2)), confrontata con la direzione verso la camera
    const beta = Math.min(0.93, Math.sqrt(1 / Math.max(0.05, rr - 2)));
    const velDir = [-Math.sin(phi[idx]), Math.cos(phi[idx]), 0];
    const diskPt = [rr * Math.cos(phi[idx]), rr * Math.sin(phi[idx]), 0];
    const toCam = norm(sub3(camPos, diskPt));
    const cosAlpha = dot(velDir, toCam);
    const beam = Math.pow(clamp(1 / (1 - beta * cosAlpha), 0.15, 6), 2.2);
    const gravRed = Math.sqrt(clamp(1 - 2 / rr, 0.02, 1));
    const orderFade = Math.pow(0.62, order[idx]);
    const bright = clamp(beam * gravRed * orderFade, 0.05, 3.2);
    data[p4] = clamp(tr * bright, 0, 255); data[p4 + 1] = clamp(tg * bright, 0, 255); data[p4 + 2] = clamp(tb * bright, 0, 255); data[p4 + 3] = 255;
    if (bright > brightVal) { brightVal = bright; brightX = xPix; brightY = yPix; }
    if (yPix < topDiskY) { topDiskY = yPix; topDiskX = xPix; }
    if (yPix > botDiskY) { botDiskY = yPix; botDiskX = xPix; }
    if (xPix < leftDiskX) { leftDiskX = xPix; leftDiskY = yPix; }
    if (xPix > rightDiskX) { rightDiskX = xPix; rightDiskY = yPix; }
  }
  offCtx.putImageData(offImg, 0, 0);
  labelAnchors = hAny
    ? { hcx: (hxMin + hxMax) / 2, hcy: (hyMin + hyMax) / 2, hTopX: (hxMin + hxMax) / 2, hTopY: hyMin, hRadius: (hxMax - hxMin) / 2,
        brightX, brightY, topDiskX, topDiskY, botDiskX, botDiskY, leftDiskX, leftDiskY, rightDiskX, rightDiskY, w, h }
    : null;
}

// ═══ Etichette con connettori a gomito ═══════════════════════════════════════════════════════
// Le etichette sono ancorate a una DISTANZA DAL BUCO NERO proporzionale alla dimensione del disco
// a schermo (non a frazioni fisse del canvas): quando si zooma indietro e il disco rimpicciolisce,
// le etichette si stringono insieme allo stesso ritmo invece di restare appese lontano ai bordi
// con lunghe linee diagonali che si incrociano — questo è esattamente ciò che rendeva le etichette
// illeggibili con lo zoom ridotto prima di questa modifica.
function drawElbow(ctx, A, L) {
  const bend = [A[0], L[1]];
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(bend[0], bend[1]); ctx.lineTo(L[0], L[1]); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(A[0], A[1], 2.2, 0, TWO); ctx.fill();
}
function drawLabels(ctx, W, H) {
  if (!labelAnchors) return;
  const a = labelAnchors;
  const sx = W / a.w, sy = H / a.h;
  const pt = (x, y) => [x * sx, y * sy];
  const [hcx, hcy] = pt(a.hcx, a.hcy);
  // "estensione" del disco a schermo: quanto è grande la scena visibile in questo momento, in px
  const diskExtentPx = Math.max(
    Math.abs(hcy - pt(a.topDiskX, a.topDiskY)[1]), Math.abs(pt(a.botDiskX, a.botDiskY)[1] - hcy),
    Math.abs(hcx - pt(a.leftDiskX, a.leftDiskY)[0]), Math.abs(pt(a.rightDiskX, a.rightDiskY)[0] - hcx),
    a.hRadius * sx * 1.3,
  );
  const dist = clamp(diskExtentPx * 0.5, 60, Math.min(W, H) * 0.42);
  const place = (anchor, dx, dy) => {
    const n = Math.hypot(dx, dy) || 1;
    const x = clamp(anchor[0] + (dx / n) * dist, 10, W - 10);
    const y = clamp(anchor[1] + (dy / n) * dist, 60, H - 18); // 60: lascia spazio alle due righe di titolo/intestazione in alto a sinistra
    return [x, y];
  };

  const items = [];
  const aShadow = [hcx, hcy]; items.push({ a: aShadow, l: place(aShadow, 1, -0.7), text: 'Ombra del buco nero' });
  const aRing = pt(a.hTopX, a.hTopY); items.push({ a: aRing, l: place(aRing, 0.2, -1), text: 'Anello di fotoni' });
  const aFar = pt(a.topDiskX, a.topDiskY); items.push({ a: aFar, l: place(aFar, -0.9, -1), text: 'Lato lontano del disco' });
  const aBeam = pt(a.brightX, a.brightY); items.push({ a: aBeam, l: place(aBeam, -1, -0.3), text: 'Beaming Doppler' });
  const aDisk = pt(a.leftDiskX, a.leftDiskY); items.push({ a: aDisk, l: place(aDisk, -1, 0.35), text: 'Disco di accrescimento' });
  if (P.incDeg > 55) { const aUnder = pt(a.botDiskX, a.botDiskY); items.push({ a: aUnder, l: place(aUnder, 0.1, 1), text: 'Lato inferiore (lensato)' }); }

  ctx.font = '11px "Space Mono",monospace';
  items.forEach(it => {
    drawElbow(ctx, it.a, it.l);
    const alignLeft = it.l[0] < W * 0.5;
    ctx.textAlign = alignLeft ? 'left' : 'right';
    const tx = it.l[0] + (alignLeft ? 5 : -5), ty = it.l[1] - 5;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(it.text, tx, ty);
    ctx.fillStyle = 'rgba(245,248,252,0.98)'; ctx.fillText(it.text, tx, ty);
  });
}

// ═══ Disegno ══════════════════════════════════════════════════════════════════
function draw(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  G.W = W; G.H = H;
  T = pal();
  if (needsRetrace) retrace(!!camDrag);
  paintFrame();
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(offCanvas, 0, 0, W, H);

  drawLabels(ctx, W, H);

  ctx.textAlign = 'left';
  ctx.fillStyle = T.accent; ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.fillText('Buco Nero — vista ray-traced', 14, 20);
  ctx.fillStyle = 'rgba(230,240,250,0.9)'; ctx.font = '10px "Space Mono",monospace';
  ctx.fillText(`M=${P.massSolar}M☉ (rs=${D.rsKm.toFixed(1)}km)   a*=${D.aStar.toFixed(2)}   disco: ${D.rDiskIn.toFixed(1)}M–${D.rDiskOut.toFixed(1)}M`, 14, 36);
  ctx.fillStyle = 'rgba(200,215,230,0.8)'; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText('trascina per ruotare — la luce del lato lontano del disco è piegata sopra l\'orizzonte: è vero ray-tracing, non un disegno', W / 2, H - 8);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
function gBase(ctx, W, H, PAD) {
  ctx.fillStyle = T.gBg; ctx.fillRect(0, 0, W, H);
  const gW = W - PAD.l - PAD.r, gH = H - PAD.t - PAD.b;
  ctx.strokeStyle = T.gAxis; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(PAD.l, PAD.t); ctx.lineTo(PAD.l, PAD.t + gH); ctx.lineTo(PAD.l + gW, PAD.t + gH); ctx.stroke();
  return { gW, gH };
}
function drawGraphDeflection() {
  const cv = gCanvas[0]; if (!cv || !cv.width || !deflTable) return;
  const ctx = gCtx[0], W = cv.width, H = cv.height, PAD = { t: 14, b: 14, l: 32, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const bMaxPlot = 15;
  const xOf = b => PAD.l + b / bMaxPlot * gW;
  const defl = b => { const u = lookupU(b, Math.PI); return u === null || u === -1 ? null : 1 / u; }; // placeholder non usato
  // angolo di deflessione totale (rispetto a una linea retta) in funzione di b, dalla tabella
  ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 1.4; ctx.beginPath();
  let started = false;
  for (let i = 0; i <= 120; i++) {
    const b = B_CRIT * 1.01 + i / 120 * (bMaxPlot - B_CRIT * 1.01);
    // trova il phi a cui u torna vicino a 1/CAM_R (uscita) per stimare la deflessione totale
    let phiExit = null;
    for (let s = 1; s < N_PHI; s++) { const u = deflTable[Math.round(indexOfB(b)) * N_PHI + s]; if (u >= 0 && u < 1 / CAM_R * 1.02 && s * PHI_STEP > 0.05) { phiExit = s * PHI_STEP; break; } }
    if (phiExit == null) continue;
    const flatBase = Math.PI - 2 * Math.asin(Math.min(1, b / CAM_R));
    const deflection = phiExit - flatBase;
    const x = xOf(b), y = PAD.t + gH - clamp(deflection / 2, 0, 1) * gH;
    if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('deflessione totale Δφ(b) — cresce verso b_crit', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('b (M)', PAD.l + gW - 2, PAD.t + gH - 3);
}
function drawGraphTemp() {
  const cv = gCanvas[1]; if (!cv || !cv.width) return;
  const ctx = gCtx[1], W = cv.width, H = cv.height, PAD = { t: 14, b: 14, l: 8, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  for (let i = 0; i < gW; i++) {
    const r = D.rDiskIn + (i / gW) * (D.rDiskOut - D.rDiskIn);
    const tf = clamp(Math.pow(D.rDiskIn / r, 0.75), 0, 1);
    const [cr, cg, cb] = tempColor(tf);
    ctx.fillStyle = `rgb(${cr | 0},${cg | 0},${cb | 0})`;
    ctx.fillRect(PAD.l + i, PAD.t, 1, gH * 0.55);
  }
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left';
  ctx.fillText(`T(r) ∝ (rISCO/r)^0.75 — ISCO=${D.rDiskIn.toFixed(1)}M`, PAD.l + 2, PAD.t + gH * 0.55 + 12);
  ctx.textAlign = 'right'; ctx.fillText(`${D.rDiskOut.toFixed(0)}M`, PAD.l + gW - 2, PAD.t + gH * 0.55 + 12);
}
function drawGraphOmega() {
  const cv = gCanvas[2]; if (!cv || !cv.width) return;
  const ctx = gCtx[2], W = cv.width, H = cv.height, PAD = { t: 14, b: 14, l: 32, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const xOf = r => PAD.l + (r - D.rDiskIn) / (D.rDiskOut - D.rDiskIn) * gW;
  const maxOm = omegaOf(D.rDiskIn) * 1.05;
  const yOf = om => PAD.t + gH - clamp(om / maxOm, 0, 1) * gH;
  ctx.strokeStyle = '#7fe0a0'; ctx.lineWidth = 1.4; ctx.beginPath();
  for (let i = 0; i <= 80; i++) { const r = D.rDiskIn + i / 80 * (D.rDiskOut - D.rDiskIn); const x = xOf(r), y = yOf(omegaOf(r)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke();
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('Ω(r) del gas nel disco (Kerr)', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('r (M)', PAD.l + gW - 2, PAD.t + gH - 3);
}
function drawGraphs() {
  const titles = ['Deflessione Δφ(b)', 'Profilo di temperatura', 'Velocità angolare Ω(r)'];
  for (let i = 0; i < 3; i++) if (gTitle[i]) gTitle[i].textContent = titles[i];
  drawGraphDeflection(); drawGraphTemp(); drawGraphOmega();
}

// ═══ Passo di simulazione ═══════════════════════════════════════════════════
function step(dt) { animT += dt * P.speed; }

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls() {
  const cont = document.getElementById('controls'); cont.innerHTML = '';
  const sb = Lab.Section('Buco nero'); cont.appendChild(sb.el);
  sb.add(Lab.Slider({ label: 'Massa', min: 1, max: 40, step: 1, value: P.massSolar, unit: ' M☉', onChange(v) { P.massSolar = v; derive(); } }));
  sb.add(Lab.Slider({ label: 'Spin a*', min: 0, max: 0.99, step: 0.01, value: P.aStar, onChange(v) { P.aStar = v; derive(); needsRetrace = true; } }));
  sb.add(Lab.Slider({ label: 'Raggio esterno disco', min: 6, max: 30, step: 1, value: P.diskOut, unit: 'M', onChange(v) { P.diskOut = v; derive(); needsRetrace = true; } }));

  const sc = Lab.Section('Camera'); cont.appendChild(sc.el);
  sc.add(Lab.Slider({ label: 'Inclinazione', min: 15, max: 89, step: 1, value: P.incDeg, unit: '°', onChange(v) { P.incDeg = v; needsRetrace = true; } }));

  const sv = Lab.Section('Simulazione'); cont.appendChild(sv.el);
  sv.add(Lab.Slider({ label: 'Velocità animazione', min: 0.1, max: 4, step: 0.1, value: P.speed, unit: '×', onChange(v) { P.speed = v; } }));
}
function buildReadout() {
  const cont = document.getElementById('readout'); cont.innerHTML = '';
  readout = new Lab.Readout(cont, [
    { key: 'rs', label: 'Raggio di Schwarzschild' }, { key: 'spin', label: 'Spin a*' },
    { key: 'isco', label: 'ISCO (bordo interno disco)' }, { key: 'bcrit', label: 'Parametro d\'impatto critico' },
    { key: 'inc', label: 'Inclinazione camera' }, { key: 'diskout', label: 'Raggio esterno disco' },
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
  cam.zoomFov = 1;
  buildDeflectionTable();
  buildControls(); initGraphs(); buildReadout(); newRun();
  const simCanvas = document.getElementById('simCanvas');
  const btnPlay = document.getElementById('btnPlay');
  function syncPlay() { btnPlay.textContent = P.paused ? '▶  AVVIA' : '⏸  PAUSA'; }
  syncPlay();
  btnPlay.addEventListener('click', () => { P.paused = !P.paused; syncPlay(); });
  document.getElementById('btnReset').addEventListener('click', () => {
    P.aStar = 0.6; P.massSolar = 10; P.incDeg = 75; P.diskOut = 16; P.speed = 1.0; P.paused = false;
    cam = { az: 0.4, zoomFov: 1 };
    buildControls(); buildReadout(); newRun(); syncPlay();
  });

  simCanvas.style.cursor = 'grab';
  simCanvas.addEventListener('pointerdown', e => {
    camDrag = { x: e.clientX, y: e.clientY, az: cam.az, inc: P.incDeg };
    simCanvas.style.cursor = 'grabbing'; simCanvas.setPointerCapture(e.pointerId);
  });
  simCanvas.addEventListener('pointermove', e => {
    if (!camDrag) return;
    const dx = e.clientX - camDrag.x, dy = e.clientY - camDrag.y;
    cam.az = camDrag.az + dx * 0.01;
    P.incDeg = clamp(camDrag.inc - dy * 0.15, 8, 90);
    needsRetrace = true;
  });
  simCanvas.addEventListener('pointerup', () => { camDrag = null; simCanvas.style.cursor = 'grab'; needsRetrace = true; });
  simCanvas.addEventListener('pointercancel', () => { camDrag = null; simCanvas.style.cursor = 'grab'; needsRetrace = true; });
  simCanvas.addEventListener('wheel', e => {
    e.preventDefault();
    cam.zoomFov = clamp(cam.zoomFov * (e.deltaY > 0 ? 0.92 : 1.08), 0.35, 3.5);
    needsRetrace = true;
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
    needsRetrace = true;
  }
  resize();
  new ResizeObserver(resize).observe(document.querySelector('.lab-canvas-area'));
  window.addEventListener('load', resize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);

  last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000; last = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0; dt = Math.min(dt, 0.05);
    if (!P.paused) step(dt);
    try {
      draw(simCanvas); drawGraphs();
      readout.set('rs', `${D.rsKm.toFixed(2)} km`);
      readout.set('spin', D.aStar.toFixed(2));
      readout.set('isco', `${D.rDiskIn.toFixed(2)} M`);
      readout.set('bcrit', `${B_CRIT.toFixed(3)} M`);
      readout.set('inc', `${P.incDeg.toFixed(0)}°`);
      readout.set('diskout', `${D.rDiskOut.toFixed(1)} M`);
    } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
