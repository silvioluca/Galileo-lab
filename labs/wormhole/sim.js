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
const CAM_R = 80;              // distanza della camera dal buco nero, unità di M — fissa: la tabella di deflessione dipende da questo valore, tenerlo costante evita di doverla ricostruire
const B_CRIT = 3 * Math.sqrt(3); // parametro d'impatto critico esatto di Schwarzschild (fotoni con b<b_crit vengono catturati)

// ═══ Tabella di deflessione fotonica — costruita UNA volta, riusata per ogni pixel di ogni frame ═══
const B_MAX = 82, B_SAMPLES = 640; // b arriva fino a ~CAM_R: copre ogni raggio dell'inquadratura, anche con lo zoom al minimo
const PHI_MAX = 11 * Math.PI, PHI_STEP = 0.018;
const N_PHI = Math.round(PHI_MAX / PHI_STEP);
let deflTable = null; // Float32Array[B_SAMPLES*N_PHI]: u(φ) per ciascun b; -1 = già catturato a quel φ
function bOfIndex(bi) { return 0.05 + (B_MAX - 0.05) * Math.pow(bi / (B_SAMPLES - 1), 1.6); } // più campioni vicino a b_crit
function indexOfB(b) { return (B_SAMPLES - 1) * Math.pow(Math.max(0, (b - 0.05) / (B_MAX - 0.05)), 1 / 1.6); }
let phiEscape = null; // Float32Array[B_SAMPLES]: angolo totale percorso dai fotoni che sfuggono (-1 = catturato)
const ESCAPE_U = 0.05 / CAM_R;
function buildDeflectionTable() {
  deflTable = new Float32Array(B_SAMPLES * N_PHI);
  phiEscape = new Float32Array(B_SAMPLES);
  const dphiInt = 0.003;
  const u0 = 1 / CAM_R;
  // una volta che un fotone è chiaramente sfuggito (u molto piccolo, r decine di volte la distanza
  // della camera, e ancora in allontanamento) si smette di integrare e si "congela" u a un valore
  // piccolo ma POSITIVO: oltre quel punto l'equazione oscillerebbe fino a u negativo (puro artefatto
  // numerico), che verrebbe scambiato per una cattura da parte dell'orizzonte.
  for (let bi = 0; bi < B_SAMPLES; bi++) {
    const b = bOfIndex(bi);
    let u = u0, up = Math.sqrt(Math.max(0, 1 / (b * b) - u * u + 2 * u * u * u));
    let phi = 0, captured = false, escaped = false, uFrozen = 0;
    phiEscape[bi] = -1;
    for (let s = 0; s < N_PHI; s++) {
      const targetPhi = s * PHI_STEP;
      if (!captured && !escaped) {
        while (phi < targetPhi - 1e-9) {
          const h = Math.min(dphiInt, targetPhi - phi);
          // RK4 su u'' = -u + 3u² (scritto per esteso: niente array temporanei nel ciclo più caldo)
          const k1p = -u + 3 * u * u;
          const u2 = u + h / 2 * up, p2 = up + h / 2 * k1p, k2p = -u2 + 3 * u2 * u2;
          const u3 = u + h / 2 * p2, p3 = up + h / 2 * k2p, k3p = -u3 + 3 * u3 * u3;
          const u4 = u + h * p3, p4 = up + h * k3p, k4p = -u4 + 3 * u4 * u4;
          u += h / 6 * (up + 2 * p2 + 2 * p3 + p4); up += h / 6 * (k1p + 2 * k2p + 2 * k3p + k4p); phi += h;
          if (u > 0.5) { captured = true; break; }
          if (u < ESCAPE_U && up < 0) {
            escaped = true; uFrozen = Math.max(u, 1e-5);
            phiEscape[bi] = phi + Math.asin(Math.min(1, b * u));   // tratto restante fino all'infinito
            break;
          }
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
  const u00 = deflTable[bi0 * N_PHI + pi0], u01 = deflTable[bi0 * N_PHI + pi1];
  const u10 = deflTable[bi1 * N_PHI + pi0], u11 = deflTable[bi1 * N_PHI + pi1];
  if (u00 < 0 || u01 < 0 || u10 < 0 || u11 < 0) return -1;
  return u00 * (1 - bfrac) * (1 - pfrac) + u10 * bfrac * (1 - pfrac) + u01 * (1 - bfrac) * pfrac + u11 * bfrac * pfrac;
}
// angolo totale percorso da un fotone che sfugge (per sapere da quale punto del cielo arriva), o -1
function lookupEscape(b) {
  const bf = clamp(indexOfB(b), 0, B_SAMPLES - 1.0001);
  const bi0 = Math.floor(bf), fr = bf - bi0, bi1 = Math.min(bi0 + 1, B_SAMPLES - 1);
  const a = phiEscape[bi0], c = phiEscape[bi1];
  return a < 0 || c < 0 ? -1 : a * (1 - fr) + c * fr;
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
  doppler: true,        // spostamento Doppler e redshift gravitazionale su colore e luminosità
  tempK: 5500,          // temperatura di colore del punto più caldo del disco
  stars: true,
  labels: true,
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
const bloomCanvas = {};

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

// ═══ Fisica dell'emissione ════════════════════════════════════════════════════════════════════
function omegaOf(r) { const r15 = Math.pow(r, 1.5); return 1 / (r15 + D.aStar); } // Kerr, prograda, unità di M

// Flusso emesso da un disco sottile (profilo di Shakura–Sunyaev / Novikov–Thorne senza le correzioni
// relativistiche): F ∝ r⁻³·(1 − √(r_in/r)). Si annulla al bordo interno e ha il massimo a
// r = (49/36)·r_in. Normalizzato a 1 sul massimo.
function fluxOf(r) {
  const rin = D.rDiskIn;
  if (r <= rin) return 0;
  const rp = rin * 49 / 36;
  return Math.pow(r, -3) * (1 - Math.sqrt(rin / r)) / (Math.pow(rp, -3) / 7);
}

// Fattore di spostamento g = ν_osservata / ν_emessa per gas in orbita circolare:
// g = 1 / [u^t · (1 − Ω·λ)], con λ = L_z/E momento angolare del fotone attorno all'asse del disco.
// Contiene insieme Doppler (il lato che si avvicina ha g > 1) e redshift gravitazionale.
function shiftFactor(r, lam) {
  const r15 = Math.pow(r, 1.5), a = D.aStar;
  const ut = (1 + a / r15) / Math.sqrt(Math.max(0.01, 1 - 3 / r + 2 * a / r15));
  return 1 / (ut * Math.max(0.05, 1 - omegaOf(r) * lam));
}

// Resa a schermo. Fisicamente T ∝ F^¼, ma su un disco così piccolo darebbe un colore quasi uniforme:
// l'esponente è accentuato perché il gradiente dal bordo interno caldo a quello esterno freddo si veda.
const COLOR_EXP = 0.36, EXPOSURE = 1.5, TONE_EXP = 0.5;

// Colore di un corpo nero alla temperatura T (approssimazione di T. Helland), massimo = 1
const _bb = [0, 0, 0];
function bbColor(T) {
  const t = clamp(T, 800, 40000) / 100;
  let r, g, b;
  if (t <= 66) { r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661; }
  else { r = 329.698727446 * Math.pow(t - 60, -0.1332047592); g = 288.1221695283 * Math.pow(t - 60, -0.0755148492); }
  b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  _bb[0] = clamp(r, 0, 255) / 255; _bb[1] = clamp(g, 0, 255) / 255; _bb[2] = clamp(b, 0, 255) / 255;
  return _bb;
}

// ═══ Rumore per la turbolenza del gas (texture ripetibile, calcolata una volta) ═════════════════
const NZ = 256;
let noiseTex = null;
function buildNoise() {
  noiseTex = new Float32Array(NZ * NZ);
  const hash = (i, j, s) => { const v = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
  let amp = 0.5, tot = 0;
  for (const period of [64, 32, 16, 8]) {
    const n = NZ / period;
    for (let y = 0; y < NZ; y++) for (let x = 0; x < NZ; x++) {
      const fx = x / period, fy = y / period, ix = Math.floor(fx), iy = Math.floor(fy);
      let ux = fx - ix, uy = fy - iy; ux = ux * ux * (3 - 2 * ux); uy = uy * uy * (3 - 2 * uy);
      const i1 = (ix + 1) % n, j1 = (iy + 1) % n;
      noiseTex[y * NZ + x] += amp * ((hash(ix, iy, period) * (1 - ux) + hash(i1, iy, period) * ux) * (1 - uy)
        + (hash(ix, j1, period) * (1 - ux) + hash(i1, j1, period) * ux) * uy);
    }
    tot += amp; amp *= 0.55;
  }
  for (let i = 0; i < noiseTex.length; i++) noiseTex[i] /= tot;
}
function sampleNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const x0 = ix & 255, x1 = (ix + 1) & 255, y0 = (iy & 255) * NZ, y1 = ((iy + 1) & 255) * NZ;
  return (noiseTex[y0 + x0] * (1 - fx) + noiseTex[y0 + x1] * fx) * (1 - fy) + (noiseTex[y1 + x0] * (1 - fx) + noiseTex[y1 + x1] * fx) * fy;
}

// ═══ Cielo di sfondo: stelle e una fascia tipo Via Lattea, in funzione della direzione ══════════
// È procedurale (non un catalogo reale): serve a mostrare come la gravità deforma lo sfondo.
function skyColor(dx, dy, dz, out, o) {
  let r = 2, g = 3, b = 7;
  if (P.stars) {
    const lat = Math.asin(clamp(dz, -1, 1)), lon = Math.atan2(dy, dx);
    const band = dx * 0.34 + dy * 0.2 + dz * 0.92;
    const mw = Math.exp(-(band / 0.17) * (band / 0.17)) * (0.35 + 0.65 * sampleNoise(lon * 60 + 300, lat * 60 + 300));
    r += 20 * mw; g += 19 * mw; b += 27 * mw;
    const CS = 400 / Math.PI;                     // celle di ~0,45°
    const fi = lat * CS + 1000, i = Math.floor(fi);
    const cl = Math.max(0.05, Math.cos((i + 0.5 - 1000) / CS));
    const fj = lon * CS * cl + 4000, j = Math.floor(fj);
    const h1 = Math.sin(i * 127.1 + j * 311.7) * 43758.5453, q = h1 - Math.floor(h1);
    if (q < 0.09) {
      const h2 = Math.sin(i * 269.5 + j * 183.3) * 43758.5453, h3 = Math.sin(i * 419.2 + j * 371.9) * 43758.5453;
      const sx = 0.25 + 0.5 * (h2 - Math.floor(h2)), sy = 0.25 + 0.5 * (h3 - Math.floor(h3));
      const ddx = fj - j - sx, ddy = fi - i - sy;
      const mag = 70 + 185 * Math.pow(q / 0.09, 4);
      const v = mag * Math.exp(-(ddx * ddx + ddy * ddy) / 0.011);
      const warm = (h2 - Math.floor(h2)) > 0.6 ? 0.8 : 1;
      r += v; g += v * (0.9 + 0.1 * warm); b += v * warm;
    }
  }
  out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
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

let labelAnchors = null;
// Per ogni pixel: si lancia un raggio dalla camera e si segue la geodetica (tabella di deflessione)
// attraverso i successivi attraversamenti del piano del disco. Tutto ciò che non cambia nel tempo
// (colore, luminosità, sfondo) viene calcolato qui una volta; a ogni fotogramma resta da animare
// solo la turbolenza del gas.
function retrace(lowRes) {
  const w = lowRes ? 240 : Math.min(1000, Math.max(320, Math.round(G.W * 0.9)));
  const h = Math.max(2, Math.round(w * (G.H / G.W)));
  const N = w * h;
  const { camPos, forward, right, up } = buildCamera();
  const tf = Math.tan(Math.atan(15 / CAM_R) / cam.zoomFov);
  const aspect = w / h;
  const stat = new Uint8ClampedArray(N * 4);
  const diskIdx = new Uint32Array(N);
  const cR = new Float32Array(N), cG = new Float32Array(N), cB = new Float32Array(N), baseI = new Float32Array(N);
  const texX = new Float32Array(N), texY = new Float32Array(N), omg = new Float32Array(N);
  let nDisk = 0;

  const e1x = camPos[0] / CAM_R, e1y = camPos[1] / CAM_R, e1z = camPos[2] / CAM_R;
  const lapse = Math.sqrt(1 - 2 / CAM_R);
  const rin = D.rDiskIn, rout = D.rDiskOut, PI = Math.PI;
  let hxMin = w, hxMax = 0, hyMin = h, hyMax = 0, hAny = false;
  let brightVal = -1, brightX = 0, brightY = 0;
  let topDiskY = h, topDiskX = 0, botDiskY = 0, botDiskX = 0, leftDiskX = w, leftDiskY = 0, rightDiskX = 0, rightDiskY = 0;

  for (let j = 0; j < h; j++) {
    const py = (0.5 - j / (h - 1)) * 2 * tf;
    for (let i = 0; i < w; i++) {
      const px = (i / (w - 1) - 0.5) * 2 * aspect * tf;
      let dx = forward[0] + px * right[0] + py * up[0], dy = forward[1] + px * right[1] + py * up[1], dz = forward[2] + px * right[2] + py * up[2];
      const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
      const idx = j * w + i, o = idx * 4;
      const cospsi = e1x * dx + e1y * dy + e1z * dz;
      const sinpsi = Math.sqrt(Math.max(0, 1 - cospsi * cospsi));
      let kind = 0;                                   // 0 = cielo, 1 = orizzonte, 2 = disco
      let hitR = 0, hitPhi = 0, lam = 0, skyX = dx, skyY = dy, skyZ = dz;
      const b = CAM_R * sinpsi / lapse;
      if (sinpsi < 1e-6) kind = cospsi < 0 ? 1 : 0;   // raggio radiale: verso il centro cade nell'orizzonte
      else if (b < B_MAX) {
        // piano dell'orbita del fotone: n = e1 × d, e2 = n × e1 (il raggio avanza da e1 verso e2)
        const nx = (e1y * dz - e1z * dy) / sinpsi, ny = (e1z * dx - e1x * dz) / sinpsi, nz = (e1x * dy - e1y * dx) / sinpsi;
        const e2x = ny * e1z - nz * e1y, e2y = nz * e1x - nx * e1z, e2z = nx * e1y - ny * e1x;
        // la linea dei nodi (intersezione con il piano del disco) è lungo n × z = (ny, −nx, 0)
        const nl = Math.hypot(nx, ny);
        let phiNode = PI;
        if (nl > 1e-7) {
          phiNode = Math.atan2((ny * e2x - nx * e2y) / nl, (ny * e1x - nx * e1y) / nl);
          phiNode -= PI * Math.floor(phiNode / PI);    // i nodi si ripetono ogni π
          if (phiNode < 1e-6) phiNode += PI;
        }
        let escaped = false;
        for (let k = 0; k < 10; k++) {
          const pc = phiNode + k * PI;
          if (pc > PHI_MAX - PHI_STEP) break;
          const u = lookupU(b, pc);
          if (u === -1) { kind = 1; break; }
          if (u < ESCAPE_U * 1.2) { escaped = true; break; }
          const r = 1 / u;
          if (r >= rin && r <= rout) {
            const c = Math.cos(pc), sn = Math.sin(pc);
            kind = 2; hitR = r;
            hitPhi = Math.atan2(e1y * c + e2y * sn, e1x * c + e2x * sn);
            lam = -b * nz;                             // il fotone reale viaggia in senso opposto al raggio tracciato
            break;
          }
        }
        if (kind === 0) {
          const pe = lookupEscape(b);
          if (pe < 0 && !escaped) kind = 1;
          else if (pe >= 0) { const c = Math.cos(pe), sn = Math.sin(pe); skyX = e1x * c + e2x * sn; skyY = e1y * c + e2y * sn; skyZ = e1z * c + e2z * sn; }
          else kind = 1;
        }
      }

      if (kind === 0) { skyColor(skyX, skyY, skyZ, stat, o); continue; }
      stat[o + 3] = 255;
      if (kind === 1) {
        hAny = true; if (i < hxMin) hxMin = i; if (i > hxMax) hxMax = i; if (j < hyMin) hyMin = j; if (j > hyMax) hyMax = j;
        continue;
      }
      const F = fluxOf(hitR), gfac = P.doppler ? shiftFactor(hitR, lam) : 1;
      const col = bbColor(P.tempK * Math.pow(Math.max(F, 1e-6), COLOR_EXP) * gfac);
      const I = Math.min(40, F * gfac * gfac * gfac * gfac);   // intensità bolometrica ∝ g⁴
      // esposizione (comprime le alte luci) e viraggio al bianco delle zone più brillanti: non
      // dipendono dal tempo, quindi si calcolano qui
      const wm = I > 4 ? Math.min(0.55, (I - 4) / 20) : 0;
      cR[idx] = col[0] + (1 - col[0]) * wm; cG[idx] = col[1] + (1 - col[1]) * wm; cB[idx] = col[2] + (1 - col[2]) * wm;
      baseI[idx] = 255 * (1 - Math.exp(-EXPOSURE * Math.pow(I, TONE_EXP)));
      texX[idx] = hitPhi / TWO * NZ; texY[idx] = Math.log(hitR) * 230; omg[idx] = omegaOf(hitR);
      diskIdx[nDisk++] = idx;
      if (I > brightVal) { brightVal = I; brightX = i; brightY = j; }
      if (j < topDiskY) { topDiskY = j; topDiskX = i; }
      if (j > botDiskY) { botDiskY = j; botDiskX = i; }
      if (i < leftDiskX) { leftDiskX = i; leftDiskY = j; }
      if (i > rightDiskX) { rightDiskX = i; rightDiskY = j; }
    }
  }
  traceBuf = { w, h, stat, diskIdx, nDisk, cR, cG, cB, baseI, texX, texY, omg };
  if (!offCanvas) { offCanvas = document.createElement('canvas'); offCtx = offCanvas.getContext('2d'); }
  offCanvas.width = w; offCanvas.height = h;
  offImg = offCtx.createImageData(w, h);
  offImg.data.set(stat);
  labelAnchors = hAny && nDisk
    ? { hcx: (hxMin + hxMax) / 2, hcy: (hyMin + hyMax) / 2, hTopX: (hxMin + hxMax) / 2, hTopY: hyMin, hRadius: (hxMax - hxMin) / 2,
        brightX, brightY, topDiskX, topDiskY, botDiskX, botDiskY, leftDiskX, leftDiskY, rightDiskX, rightDiskY, w, h }
    : null;
  needsRetrace = false;
}

// ═══ Fotogramma: turbolenza del gas trascinata dalla rotazione differenziale ════════════════════
// Il gas interno gira più in fretta di quello esterno, quindi una struttura si allunga in strisce.
// Lasciata andare all'infinito si avvolgerebbe in righe sempre più fitte: si usano due copie
// sfasate di mezzo ciclo che sfumano l'una nell'altra, così l'aspetto resta stabile nel tempo.
const FLOW_PERIOD = 6;
function paintFrame() {
  if (!traceBuf) return;
  const { diskIdx, nDisk, cR, cG, cB, baseI, texX, texY, omg } = traceBuf;
  const data = offImg.data;
  const tA = animT % FLOW_PERIOD, cA = Math.floor(animT / FLOW_PERIOD);
  const tB = (animT + FLOW_PERIOD / 2) % FLOW_PERIOD, cB2 = Math.floor((animT + FLOW_PERIOD / 2) / FLOW_PERIOD);
  const wA = 1 - Math.abs(2 * tA / FLOW_PERIOD - 1), wB = 1 - wA;
  const kA = tA * SPIN_VISUAL_BOOST / TWO * NZ, kB = tB * SPIN_VISUAL_BOOST / TWO * NZ;
  const oA = cA * 37 % NZ, oB = cB2 * 37 % NZ + 91;
  for (let n = 0; n < nDisk; n++) {
    const idx = diskIdx[n], o = idx * 4;
    const y = texY[idx], om = omg[idx];
    const xa = texX[idx] - om * kA, xb = texX[idx] - om * kB;
    const na = 0.62 * sampleNoise(xa + oA, y + oA) + 0.38 * sampleNoise(xa * 2 + 53 + oA, y * 2.3 + 17);
    const nb = 0.62 * sampleNoise(xb + oB, y + oB) + 0.38 * sampleNoise(xb * 2 + 53 + oB, y * 2.3 + 71);
    let tx = (wA * na + wB * nb - 0.5) * 1.9 + 0.5;          // più contrasto
    tx = tx < 0 ? 0 : tx > 1 ? 1 : tx;
    const v = baseI[idx] * (0.42 + 1.05 * tx);                // la turbolenza modula la luminosità già esposta
    data[o] = v * cR[idx]; data[o + 1] = v * cG[idx]; data[o + 2] = v * cB[idx];
  }
  offCtx.putImageData(offImg, 0, 0);
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
  const aShadow = [hcx, hcy]; items.push({ a: aShadow, l: place(aShadow, 1, 0.12), text: 'Ombra del buco nero' });
  const aRing = pt(a.hTopX, a.hTopY); items.push({ a: aRing, l: place(aRing, 1, -0.5), text: 'Anello di fotoni' });
  const aFar = pt(a.topDiskX, a.topDiskY); items.push({ a: aFar, l: place(aFar, -0.55, -1), text: 'Lato lontano del disco' });
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

  // bagliore: copie rimpicciolite e riallargate dell'immagine, sommate — è l'alone che una
  // sorgente molto luminosa lascia nell'occhio o in una camera
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [div, alpha] of [[5, 0.42], [14, 0.3]]) {
    const bw = Math.max(2, Math.round(offCanvas.width / div)), bh = Math.max(2, Math.round(offCanvas.height / div));
    if (!bloomCanvas[div]) bloomCanvas[div] = document.createElement('canvas');
    const bc = bloomCanvas[div];
    if (bc.width !== bw || bc.height !== bh) { bc.width = bw; bc.height = bh; }
    const bx = bc.getContext('2d');
    bx.imageSmoothingEnabled = true;
    bx.drawImage(offCanvas, 0, 0, bw, bh);
    ctx.globalAlpha = alpha;
    ctx.drawImage(bc, 0, 0, W, H);
  }
  ctx.restore();

  if (P.labels) drawLabels(ctx, W, H);

  ctx.textAlign = 'left';
  ctx.fillStyle = T.accent; ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.fillText('Buco Nero — vista ray-traced', 14, 20);
  ctx.fillStyle = 'rgba(230,240,250,0.9)'; ctx.font = '10px "Space Mono",monospace';
  ctx.fillText(`M=${P.massSolar}M☉ (rs=${D.rsKm.toFixed(1)}km)   a*=${D.aStar.toFixed(2)}   disco: ${D.rDiskIn.toFixed(1)}M–${D.rDiskOut.toFixed(1)}M`, 14, 36);
  ctx.fillStyle = 'rgba(200,215,230,0.8)'; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText('trascina per ruotare · rotella per lo zoom — la luce del lato lontano del disco è piegata sopra e sotto l\'ombra', W / 2, H - 8);
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
    const F = fluxOf(r);
    const col = bbColor(P.tempK * Math.pow(Math.max(F, 1e-6), COLOR_EXP));
    const v = 255 * (1 - Math.exp(-EXPOSURE * Math.pow(F, TONE_EXP)));
    ctx.fillStyle = `rgb(${col[0] * v | 0},${col[1] * v | 0},${col[2] * v | 0})`;
    ctx.fillRect(PAD.l + i, PAD.t, 1, gH * 0.55);
  }
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left';
  ctx.fillText(`colore del gas dal bordo interno (${D.rDiskIn.toFixed(1)}M) a quello esterno`, PAD.l + 2, PAD.t + gH * 0.55 + 12);
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

  const sa = Lab.Section('Aspetto'); cont.appendChild(sa.el);
  sa.add(Lab.Toggle({ label: 'Doppler e redshift', value: P.doppler, onChange(v) { P.doppler = v; needsRetrace = true; } }));
  sa.add(Lab.Slider({ label: 'Temperatura di colore', min: 3000, max: 15000, step: 500, value: P.tempK, unit: ' K', onChange(v) { P.tempK = v; needsRetrace = true; } }));
  sa.add(Lab.Toggle({ label: 'Stelle di sfondo', value: P.stars, onChange(v) { P.stars = v; needsRetrace = true; } }));
  sa.add(Lab.Toggle({ label: 'Etichette', value: P.labels, onChange(v) { P.labels = v; } }));
  const note = document.createElement('div');
  note.style.cssText = 'font-size:10px;color:var(--text-hint);line-height:1.6;margin-bottom:12px;';
  note.textContent = 'Il lato del disco che ruota verso di noi appare più luminoso e più blu, quello che si allontana più debole e più rosso. I colori sono riscalati: un disco reale attorno a un buco nero stellare è così caldo da emettere soprattutto raggi X.';
  sa.add(note);

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
  buildDeflectionTable(); buildNoise();
  buildControls(); initGraphs(); buildReadout(); newRun();
  const simCanvas = document.getElementById('simCanvas');
  const btnPlay = document.getElementById('btnPlay');
  function syncPlay() { btnPlay.textContent = P.paused ? '▶  AVVIA' : '⏸  PAUSA'; }
  syncPlay();
  btnPlay.addEventListener('click', () => { P.paused = !P.paused; syncPlay(); });
  document.getElementById('btnReset').addEventListener('click', () => {
    P.aStar = 0.6; P.massSolar = 10; P.incDeg = 75; P.diskOut = 16; P.speed = 1.0; P.paused = false;
    P.doppler = true; P.tempK = 5500; P.stars = true; P.labels = true;
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
