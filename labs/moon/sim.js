'use strict';

// ── Dati ─────────────────────────────────────────────────────────────────────
const R_MOON = 1737.4; // km, raggio medio

// [nome, latitudine °N, longitudine °E, dimensione km, rango (1 = sempre visibile), nota]
const FEATURES = {
  mare: [
    ['Oceanus Procellarum', 18.4, -57.4, 2590, 1, 'Il più esteso dei mari lunari: l\'unico chiamato «oceano».'],
    ['Mare Imbrium', 32.8, -15.6, 1145, 1, 'Grande bacino da impatto riempito di lava basaltica circa 3,8 miliardi di anni fa.'],
    ['Mare Serenitatis', 28.0, 17.5, 675, 1, ''],
    ['Mare Tranquillitatis', 8.5, 31.4, 875, 1, 'Qui atterrò Apollo 11 nel luglio 1969.'],
    ['Mare Crisium', 17.0, 59.1, 555, 1, 'Mare isolato, ben visibile a occhio nudo vicino al bordo orientale.'],
    ['Mare Fecunditatis', -7.8, 51.3, 840, 2, ''],
    ['Mare Nectaris', -15.2, 35.5, 340, 2, ''],
    ['Mare Nubium', -21.3, -16.6, 715, 1, ''],
    ['Mare Humorum', -24.4, -38.6, 420, 2, ''],
    ['Mare Frigoris', 56.0, 1.4, 1445, 2, 'Lunga fascia di lava a nord del Mare Imbrium.'],
    ['Mare Vaporum', 13.3, 3.6, 245, 3, ''],
    ['Mare Orientale', -19.4, -92.8, 295, 1, 'Bacino a più anelli quasi intatto, al confine con la faccia nascosta.'],
    ['Mare Moscoviense', 27.3, 147.9, 275, 1, 'Uno dei pochi mari della faccia nascosta.'],
    ['Bacino Polo Sud–Aitken', -53.0, -169.0, 2500, 1, 'Il più grande e antico bacino da impatto della Luna, profondo fino a 8 km.'],
  ],
  crater: [
    ['Tycho', -43.3, -11.4, 85, 1, 'Cratere giovane (circa 108 milioni di anni) con una vistosa raggiera che attraversa mezzo emisfero.'],
    ['Copernicus', 9.6, -20.1, 93, 1, 'Cratere a terrazze con picchi centrali e raggiera, tra i più spettacolari al telescopio.'],
    ['Kepler', 8.1, -38.0, 31, 2, ''],
    ['Aristarchus', 23.7, -47.4, 40, 1, 'Il cratere più luminoso della faccia visibile.'],
    ['Plato', 51.6, -9.3, 101, 1, 'Cratere dal fondo scuro e piatto, riempito di lava.'],
    ['Clavius', -58.4, -14.4, 231, 1, 'Uno dei crateri più grandi della faccia visibile, con un arco di crateri minori all\'interno.'],
    ['Ptolemaeus', -9.2, -1.8, 154, 2, ''],
    ['Alphonsus', -13.4, -2.8, 110, 3, ''],
    ['Arzachel', -18.2, -1.9, 97, 3, ''],
    ['Archimedes', 29.7, -4.0, 81, 2, ''],
    ['Eratosthenes', 14.5, -11.3, 59, 3, ''],
    ['Grimaldi', -5.4, -68.4, 173, 2, 'Bacino dal fondo molto scuro vicino al bordo occidentale.'],
    ['Langrenus', -8.9, 61.0, 132, 2, ''],
    ['Petavius', -25.3, 60.4, 177, 2, ''],
    ['Theophilus', -11.4, 26.4, 99, 2, ''],
    ['Posidonius', 31.8, 29.9, 95, 3, ''],
    ['Aristoteles', 50.2, 17.4, 87, 2, ''],
    ['Gassendi', -17.6, -40.0, 110, 2, ''],
    ['Schickard', -44.4, -55.0, 227, 3, ''],
    ['Bailly', -66.6, -69.2, 301, 3, 'Il più grande cratere della faccia visibile, molto degradato.'],
    ['Tsiolkovskiy', -20.4, 129.0, 185, 1, 'Cratere della faccia nascosta con fondo scuro di lava e picco centrale.'],
    ['Korolev', -4.0, -157.4, 437, 1, ''],
    ['Hertzsprung', 1.4, -128.7, 570, 2, ''],
    ['Apollo', -36.1, -151.8, 537, 2, ''],
    ['Gagarin', -20.2, 149.2, 265, 3, ''],
    ['Mendeleev', 5.7, 140.9, 313, 2, ''],
    ['Daedalus', -5.9, 179.4, 93, 3, 'Vicino al centro della faccia nascosta.'],
    ['Van de Graaff', -27.4, 172.2, 233, 3, ''],
  ],
  mount: [
    ['Montes Apenninus', 18.9, -3.7, 600, 1, 'La catena più imponente: bordo sud-orientale del Mare Imbrium, con cime oltre 5 km.'],
    ['Montes Caucasus', 38.4, 10.0, 445, 2, ''],
    ['Montes Alpes', 47.0, -1.0, 335, 2, 'Tagliati dalla Vallis Alpes, lunga circa 170 km.'],
    ['Montes Carpatus', 14.5, -24.4, 335, 3, ''],
    ['Montes Jura', 47.1, -34.0, 420, 2, 'Arco montuoso che racchiude il Sinus Iridum.'],
    ['Montes Taurus', 28.4, 41.1, 170, 3, ''],
    ['Montes Pyrenaeus', -15.6, 41.2, 165, 3, ''],
    ['Montes Haemus', 19.9, 9.2, 400, 3, ''],
    ['Mons Huygens', 20.0, -2.9, 40, 3, 'La montagna più alta della Luna: circa 5,5 km.'],
    ['Mons Pico', 45.7, -8.9, 25, 3, 'Montagna isolata nel Mare Imbrium.'],
    ['Mons Hadley', 26.5, 4.7, 25, 3, 'Sovrasta il sito di allunaggio di Apollo 15.'],
    ['Montes Cordillera', -17.5, -81.6, 575, 2, 'Anello esterno del bacino Orientale.'],
    ['Rupes Recta', -22.1, -7.8, 110, 3, 'La «Spada»: una scarpata rettilinea lunga circa 110 km.'],
  ],
  site: [
    ['Apollo 11', 0.67, 23.47, 0, 1, '20 luglio 1969: primo sbarco umano (Armstrong e Aldrin), Mare Tranquillitatis.'],
    ['Apollo 12', -3.01, -23.42, 0, 2, 'Novembre 1969, Oceanus Procellarum.'],
    ['Apollo 14', -3.65, -17.47, 0, 2, 'Febbraio 1971, altopiano di Fra Mauro.'],
    ['Apollo 15', 26.13, 3.63, 0, 2, 'Luglio 1971, Rima Hadley: prima missione con il rover.'],
    ['Apollo 16', -8.97, 15.50, 0, 2, 'Aprile 1972, altopiani di Descartes.'],
    ['Apollo 17', 20.19, 30.77, 0, 2, 'Dicembre 1972, valle Taurus–Littrow: ultima missione con equipaggio.'],
    ['Chang\'e 4', -45.4, 177.6, 0, 1, 'Gennaio 2019: primo allunaggio morbido sulla faccia nascosta.'],
    ['Chandrayaan-3', -69.4, 32.3, 0, 2, 'Agosto 2023: primo allunaggio vicino al polo sud.'],
  ],
};
const CATEGORIES = [
  { id: 'mare',   label: 'Mari e bacini',  type: 'Mare / bacino',        color: '#9fd0ff' },
  { id: 'crater', label: 'Crateri',        type: 'Cratere',              color: '#ffe9a8' },
  { id: 'mount',  label: 'Monti e rilievi', type: 'Rilievo',             color: '#b6f09c' },
  { id: 'site',   label: 'Siti di allunaggio', type: 'Sito di allunaggio', color: '#ff9a8b' },
];
const CAT = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

const DEG = Math.PI / 180;
const ALL_FEATURES = [];
for (const c of CATEGORIES) {
  for (const [name, lat, lon, size, rank, note] of FEATURES[c.id]) {
    const cl = Math.cos(lat * DEG);
    ALL_FEATURES.push({
      cat: c.id, name, lat, lon, size, rank, note,
      m: [cl * Math.sin(lon * DEG), Math.sin(lat * DEG), cl * Math.cos(lon * DEG)],
    });
  }
}

// Struttura interna (raggi in km; Weber et al. 2011, dati sismici Apollo; crosta da GRAIL)
const LAYERS = [
  { name: 'Crosta',                 r0: 1697, r1: R_MOON, rgb: [190, 186, 178], desc: 'spessore medio ≈ 34–43 km; anortosite, basalti nei mari' },
  { name: 'Mantello',               r0: 480,  r1: 1697,   rgb: [142, 96, 62],   desc: 'solido; olivina e pirosseni; terremoti profondi a 700–1200 km' },
  { name: 'Strato parzialmente fuso', r0: 330, r1: 480,   rgb: [226, 110, 40],  desc: 'base del mantello, in parte fusa' },
  { name: 'Nucleo esterno fluido',  r0: 240,  r1: 330,    rgb: [255, 176, 60],  desc: 'ferro liquido con zolfo' },
  { name: 'Nucleo interno solido',  r0: 0,    r1: 240,    rgb: [255, 236, 170], desc: 'ricco di ferro; raggio ≈ 240 km' },
];

const FACTS = [
  ['Raggio medio', '1737,4 km (0,273 Terre)'],
  ['Massa', '7,342 × 10²² kg (1/81 della Terra)'],
  ['Densità media', '3,344 g/cm³'],
  ['Gravità in superficie', '1,62 m/s² (0,165 g)'],
  ['Velocità di fuga', '2,38 km/s'],
  ['Distanza media dalla Terra', '384 400 km'],
  ['Perigeo / apogeo', '≈ 363 300 / 405 500 km'],
  ['Eccentricità orbitale', '0,0549'],
  ['Periodo siderale', '27,32 giorni'],
  ['Periodo sinodico (lunazione)', '29,53 giorni'],
  ['Rotazione', 'sincrona: 27,32 giorni'],
  ['Velocità orbitale media', '1,022 km/s'],
  ['Inclinazione dell\'orbita', '5,145° sull\'eclittica'],
  ['Inclinazione dell\'asse', '1,54° sull\'eclittica'],
  ['Diametro apparente', '29,3′ – 34,1′'],
  ['Albedo', '≈ 0,12'],
  ['Temperatura al suolo', 'da ≈ −173 °C a ≈ +127 °C'],
  ['Atmosfera', 'praticamente assente (esosfera)'],
  ['Allontanamento dalla Terra', '≈ 3,8 cm all\'anno'],
  ['Età', '≈ 4,5 miliardi di anni'],
];

// ── Parameters ───────────────────────────────────────────────────────────────
const P = {
  mode: 'surface',     // 'surface' | 'interior'
  zoom: 1,
  autoRotate: false,
  grid: false,
  phaseOn: false,
  phase: 135,          // 0 = nuova, 180 = piena
  show: { mare: true, crater: true, mount: true, site: false },
};

// ── Canvas / layout ──────────────────────────────────────────────────────────
const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');
const readoutEl = document.getElementById('readout');
const buf = document.createElement('canvas');
const bctx = buf.getContext('2d');

let SW = 0, SH = 0, DPR = 1;
let sphereDirty = true, composeDirty = true;

function resize() {
  DPR = window.devicePixelRatio || 1;
  const area = canvas.parentElement;
  SW = area.clientWidth;
  SH = Math.max(0, area.clientHeight - (readoutEl.offsetHeight || 0));
  canvas.width = Math.round(SW * DPR);
  canvas.height = Math.round(SH * DPR);
  canvas.style.width = SW + 'px';
  canvas.style.height = SH + 'px';
  sphereDirty = true;
}

// ── Texture ──────────────────────────────────────────────────────────────────
let tex = null, TW = 0, TH = 0;
{
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    TW = c.width = img.naturalWidth;
    TH = c.height = img.naturalHeight;
    const cc = c.getContext('2d');
    cc.drawImage(img, 0, 0);
    tex = cc.getImageData(0, 0, TW, TH).data;
    sphereDirty = true;
  };
  img.src = MOON_TEXTURE;
}

// ── Rotazione: matrice 3×3 (riga per riga) dal sistema lunare a quello di vista
// Sistema lunare: z verso la Terra (lat 0°, lon 0°), x verso est, y verso nord.
// Sistema di vista: x a destra, y in alto, z verso l'osservatore.
const mul = (A, B) => {
  const C = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
  }
  return C;
};
const transpose = A => [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];
const rotX = a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
const rotY = a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };

function rotAxis(ax, ay, az, a) {
  const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [
    t * ax * ax + c,      t * ax * ay - s * az, t * ax * az + s * ay,
    t * ax * ay + s * az, t * ay * ay + c,      t * ay * az - s * ax,
    t * ax * az - s * ay, t * ay * az + s * ax, t * az * az + c,
  ];
}

// Gram–Schmidt: evita che gli errori numerici deformino la sfera
function orthonormalize(A) {
  let [a, b, c, d, e, f] = A;
  let n = Math.hypot(a, b, c); a /= n; b /= n; c /= n;
  const dot = a * d + b * e + c * f;
  d -= dot * a; e -= dot * b; f -= dot * c;
  n = Math.hypot(d, e, f); d /= n; e /= n; f /= n;
  return [a, b, c, d, e, f, b * f - c * e, c * d - a * f, a * e - b * d];
}

const VIEWS = {
  near:     [1, 0, 0, 0, 1, 0, 0, 0, 1],
  far:      rotY(Math.PI),
  north:    rotX(Math.PI / 2),
  south:    rotX(-Math.PI / 2),
  interior: mul(rotX(32 * DEG), rotY(-45 * DEG)),
};

let M = VIEWS.near.slice();
let Mtarget = null;       // orientamento verso cui si sta ruotando

const toView = (m, A = M) => [
  A[0] * m[0] + A[1] * m[1] + A[2] * m[2],
  A[3] * m[0] + A[4] * m[1] + A[5] * m[2],
  A[6] * m[0] + A[7] * m[1] + A[8] * m[2],
];

// Avanza verso Mtarget lungo la rotazione più breve
function stepTowardsTarget() {
  const R = mul(Mtarget, transpose(M));
  const ang = Math.acos(Math.max(-1, Math.min(1, (R[0] + R[4] + R[8] - 1) / 2)));
  if (ang < 0.003) { M = Mtarget.slice(); Mtarget = null; return; }
  const s = 2 * Math.sin(ang);
  let ax = 0, ay = 1, az = 0;
  if (Math.abs(s) > 1e-3) { ax = (R[7] - R[5]) / s; ay = (R[2] - R[6]) / s; az = (R[3] - R[1]) / s; }
  const stepA = Math.min(ang, Math.max(ang * 0.16, 0.012));
  M = orthonormalize(mul(rotAxis(ax, ay, az, stepA), M));
}

// ── Geometria della scena ────────────────────────────────────────────────────
const geom = () => {
  const interior = P.mode === 'interior';
  const R = Math.min(SW, SH) * 0.43 * P.zoom;
  // nella vista interna la Luna si sposta a sinistra per lasciare posto alla legenda
  const cx = interior ? Math.max(SW * 0.36, SW / 2 - 150) : SW / 2;
  return { R, cx, cy: SH / 2 };
};

// Spicchio rimosso nella vista interna: x > 0 e y > 0 (sistema lunare)
const inCut = m => m[0] > 0 && m[1] > 0;

// Direzione del Sole nel sistema lunare per la fase scelta
function sunDir() {
  const a = P.phase * DEG;
  return [Math.sin(a), 0, -Math.cos(a)];
}

// Colore di una faccia del taglio in funzione del raggio (frazione di R)
const LB = LAYERS.map(l => l.r0 / R_MOON);    // [crosta, mantello, parz. fuso, nucleo est., 0]
function layerIndex(r) {
  for (let i = 0; i < LAYERS.length; i++) if (r >= LB[i]) return i;
  return LAYERS.length - 1;
}

// ── Render della sfera (ray casting ortografico, per pixel) ──────────────────
let lastImg = null, bufRect = { x: 0, y: 0, w: 0, h: 0 };

function renderSphere(hq) {
  const { R, cx, cy } = geom();
  const s = hq ? Math.min(DPR, 2) : 1;
  const x0 = Math.max(0, Math.floor(cx - R - 1)), x1 = Math.min(SW, Math.ceil(cx + R + 1));
  const y0 = Math.max(0, Math.floor(cy - R - 1)), y1 = Math.min(SH, Math.ceil(cy + R + 1));
  const bw = Math.max(1, Math.round((x1 - x0) * s)), bh = Math.max(1, Math.round((y1 - y0) * s));
  bufRect = { x: x0, y: y0, w: bw / s, h: bh / s };
  if (buf.width !== bw || buf.height !== bh) { buf.width = bw; buf.height = bh; lastImg = null; }
  if (!lastImg) lastImg = bctx.createImageData(bw, bh);
  const data = lastImg.data;
  if (!tex) { data.fill(0); bctx.putImageData(lastImg, 0, 0); return; }

  const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = M;
  const interior = P.mode === 'interior';
  const lit = P.phaseOn && !interior;
  const [sx, sy, sz] = sunDir();
  const dx = -m6, dy = -m7, dz = -m8;          // direzione dei raggi nel sistema lunare
  const Rpx = R * s, invR = 1 / R, invS = 1 / s;
  const PI = Math.PI, TWm = TW - 1, THm = TH - 1;

  for (let py = 0, o = 0; py < bh; py++) {
    const vy = -((py + 0.5) * invS + y0 - cy) * invR;
    for (let px = 0; px < bw; px++, o += 4) {
      const vx = ((px + 0.5) * invS + x0 - cx) * invR;
      const d2 = vx * vx + vy * vy;
      if (d2 >= 1) { data[o + 3] = 0; continue; }
      const vz = Math.sqrt(1 - d2);
      let alpha = 255;
      if (d2 > 0.96) alpha = Math.min(255, (1 - Math.sqrt(d2)) * Rpx * 255) | 0;

      // punto d'ingresso nel sistema lunare
      let mx = m0 * vx + m3 * vy + m6 * vz;
      let my = m1 * vx + m4 * vy + m7 * vz;
      let mz = m2 * vx + m5 * vy + m8 * vz;

      if (interior && mx > 0 && my > 0) {
        // il raggio entra nello spicchio vuoto: prosegue fino a una delle due facce
        const tx = dx < 0 ? -mx / dx : Infinity;
        const ty = dy < 0 ? -my / dy : Infinity;
        const t = tx < ty ? tx : ty;
        if (t === Infinity) { data[o + 3] = 0; continue; }
        const qx = mx + dx * t, qy = my + dy * t, qz = mz + dz * t;
        const r = Math.sqrt(qx * qx + qy * qy + qz * qz);
        if (r > 1) { data[o + 3] = 0; continue; }
        const li = layerIndex(r);
        let [cr, cg, cb] = LAYERS[li].rgb;
        if (li === 1) {                       // mantello: più caldo in profondità
          const k = (r - LB[1]) / (LB[0] - LB[1]);
          cr += (1 - k) * 44; cg += (1 - k) * 4; cb -= (1 - k) * 14;
        }
        // luce: facce orientate verso l'osservatore più chiare, linee ai confini
        // le due facce hanno luminosità diversa, così si legge lo spigolo fra loro
        let sh = tx < ty ? 0.66 + 0.38 * -dx : 0.5 + 0.34 * -dy;
        const edge = li > 0 ? LB[li - 1] - r : 1;
        if (edge < 0.006 || r - LB[li] < 0.006 && li < LAYERS.length - 1) sh *= 0.72;
        data[o] = cr * sh; data[o + 1] = cg * sh; data[o + 2] = cb * sh; data[o + 3] = alpha;
        continue;
      }

      // superficie: campionamento bilineare della mappa equirettangolare
      const lat = Math.asin(my > 1 ? 1 : my < -1 ? -1 : my);
      const lon = Math.atan2(mx, mz);
      let fu = (lon / (2 * PI) + 0.5) * TW - 0.5;
      let fv = (0.5 - lat / PI) * TH - 0.5;
      if (fv < 0) fv = 0; else if (fv > THm) fv = THm;
      if (fu < 0) fu += TW;
      let cr, cg, cb;
      const u0 = fu | 0, v0 = fv | 0;
      if (hq) {
        const u1 = u0 >= TWm ? 0 : u0 + 1, v1 = v0 >= THm ? THm : v0 + 1;
        const a = fu - u0, b = fv - v0;
        const i00 = (v0 * TW + u0) * 4, i10 = (v0 * TW + u1) * 4, i01 = (v1 * TW + u0) * 4, i11 = (v1 * TW + u1) * 4;
        const w00 = (1 - a) * (1 - b), w10 = a * (1 - b), w01 = (1 - a) * b, w11 = a * b;
        cr = tex[i00] * w00 + tex[i10] * w10 + tex[i01] * w01 + tex[i11] * w11;
        cg = tex[i00 + 1] * w00 + tex[i10 + 1] * w10 + tex[i01 + 1] * w01 + tex[i11 + 1] * w11;
        cb = tex[i00 + 2] * w00 + tex[i10 + 2] * w10 + tex[i01 + 2] * w01 + tex[i11 + 2] * w11;
      } else {
        const i = (v0 * TW + (u0 > TWm ? TWm : u0)) * 4;
        cr = tex[i]; cg = tex[i + 1]; cb = tex[i + 2];
      }
      let sh;
      if (lit) {
        const nl = mx * sx + my * sy + mz * sz;
        sh = nl <= 0 ? 0.035 : 0.035 + 1.25 * Math.min(1, nl * 3) * (0.55 + 0.45 * nl);
      } else {
        sh = 0.8 + 0.3 * vz;                   // leggero oscuramento al bordo
      }
      cr *= sh; cg *= sh; cb *= sh;
      data[o] = cr > 255 ? 255 : cr; data[o + 1] = cg > 255 ? 255 : cg; data[o + 2] = cb > 255 ? 255 : cb;
      data[o + 3] = alpha;
    }
  }
  bctx.putImageData(lastImg, 0, 0);
}

// Raggio (frazione di R) colpito su una faccia del taglio nel punto di schermo dato, o −1
function cutHitRadius(vx, vy) {
  const d2 = vx * vx + vy * vy;
  if (d2 >= 1) return -1;
  const v = [vx, vy, Math.sqrt(1 - d2)];
  const Mt = transpose(M);
  const m = toView(v, Mt);
  if (!inCut(m)) return -1;
  const d = [-M[6], -M[7], -M[8]];
  const tx = d[0] < 0 ? -m[0] / d[0] : Infinity, ty = d[1] < 0 ? -m[1] / d[1] : Infinity;
  const t = Math.min(tx, ty);
  if (t === Infinity) return -1;
  const r = Math.hypot(m[0] + d[0] * t, m[1] + d[1] * t, m[2] + d[2] * t);
  return r > 1 ? -1 : r;
}

// ── Overlay ──────────────────────────────────────────────────────────────────
const STARS = [];
{
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 220; i++) STARS.push([rnd(), rnd(), 0.3 + rnd() * 0.9, 0.25 + rnd() * 0.6]);
}

function label(str, x, y, { color = '#fff', size = 11, align = 'left', bold = false, italic = false, alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${italic ? 'italic ' : ''}${bold ? '700 ' : '600 '}${size}px DM Sans, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeText(str, x, y);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  ctx.restore();
}

function drawGraticule(g) {
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 0.8;
  const interior = P.mode === 'interior';
  const line = pts => {
    ctx.beginPath();
    let pen = false;
    for (const m of pts) {
      const v = toView(m);
      if (v[2] <= 0 || (interior && inCut(m))) { pen = false; continue; }
      const x = g.cx + v[0] * g.R, y = g.cy - v[1] * g.R;
      pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      pen = true;
    }
    ctx.stroke();
  };
  for (let lat = -60; lat <= 60; lat += 30) {
    const pts = [], cl = Math.cos(lat * DEG), sl = Math.sin(lat * DEG);
    for (let lon = 0; lon <= 360; lon += 3) pts.push([cl * Math.sin(lon * DEG), sl, cl * Math.cos(lon * DEG)]);
    line(pts);
  }
  for (let lon = 0; lon < 360; lon += 30) {
    const pts = [];
    for (let lat = -90; lat <= 90; lat += 3) {
      const cl = Math.cos(lat * DEG);
      pts.push([cl * Math.sin(lon * DEG), Math.sin(lat * DEG), cl * Math.cos(lon * DEG)]);
    }
    line(pts);
  }
}

let placed = [];          // etichette disegnate, per il clic: {f, x, y}
let selected = null;

function featureScreen(f, g) {
  const v = toView(f.m);
  if (v[2] <= 0.1) return null;
  if (P.mode === 'interior' && inCut(f.m)) return null;
  return { x: g.cx + v[0] * g.R, y: g.cy - v[1] * g.R, z: v[2] };
}

function drawFeatures(g) {
  placed = [];
  const boxes = [];
  const maxRank = P.zoom < 1.25 ? 1 : P.zoom < 2 ? 2 : 3;
  const list = ALL_FEATURES.filter(f => P.show[f.cat] && (f.rank <= maxRank || f === selected))
    .sort((a, b) => (b === selected) - (a === selected) || a.rank - b.rank);

  for (const f of list) {
    const p = featureScreen(f, g);
    if (!p || p.x < -40 || p.x > SW + 40 || p.y < -20 || p.y > SH + 20) continue;
    const cat = CAT[f.cat], isSel = f === selected;
    const size = f.cat === 'mare' ? 12 : 11;
    ctx.font = `600 ${size}px DM Sans, sans-serif`;
    const w = ctx.measureText(f.name).width;
    const mare = f.cat === 'mare';
    const box = mare ? [p.x - w / 2 - 3, p.y - 9, w + 6, 18] : [p.x - 6, p.y - 9, w + 18, 18];
    if (!isSel && boxes.some(b => box[0] < b[0] + b[2] && box[0] + box[2] > b[0] && box[1] < b[1] + b[3] && box[1] + box[3] > b[1])) continue;
    boxes.push(box);
    const alpha = Math.min(1, (p.z - 0.1) / 0.25);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = cat.color; ctx.fillStyle = cat.color; ctx.lineWidth = 1.5;
    if (f.cat === 'crater') { ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, 2 * Math.PI); ctx.stroke(); }
    else if (f.cat === 'mount') { ctx.beginPath(); ctx.moveTo(p.x, p.y - 4); ctx.lineTo(p.x + 4, p.y + 3); ctx.lineTo(p.x - 4, p.y + 3); ctx.closePath(); ctx.fill(); }
    else if (f.cat === 'site') { ctx.beginPath(); ctx.moveTo(p.x - 3.5, p.y - 3.5); ctx.lineTo(p.x + 3.5, p.y + 3.5); ctx.moveTo(p.x + 3.5, p.y - 3.5); ctx.lineTo(p.x - 3.5, p.y + 3.5); ctx.stroke(); }
    ctx.restore();
    if (mare) label(f.name, p.x, p.y, { color: cat.color, size, align: 'center', italic: true, bold: isSel, alpha });
    else label(f.name, p.x + 8, p.y, { color: cat.color, size, bold: isSel, alpha });
    placed.push({ f, x: mare ? p.x : p.x + 4 + w / 2, y: p.y, hw: w / 2 + 10 });
  }
}

// Contorno della formazione selezionata, alla sua dimensione reale
function drawSelection(g) {
  if (!selected || !featureScreen(selected, g)) return;
  const c = selected.m;
  const rho = Math.max(selected.size / 2 / R_MOON, 6 / g.R);
  const up = Math.abs(c[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let e1 = [up[1] * c[2] - up[2] * c[1], up[2] * c[0] - up[0] * c[2], up[0] * c[1] - up[1] * c[0]];
  const n = Math.hypot(...e1); e1 = e1.map(v => v / n);
  const e2 = [c[1] * e1[2] - c[2] * e1[1], c[2] * e1[0] - c[0] * e1[2], c[0] * e1[1] - c[1] * e1[0]];
  ctx.beginPath();
  let pen = false;
  for (let i = 0; i <= 72; i++) {
    const a = i / 72 * 2 * Math.PI, cr = Math.cos(rho), sr = Math.sin(rho);
    const m = [0, 1, 2].map(k => c[k] * cr + (e1[k] * Math.cos(a) + e2[k] * Math.sin(a)) * sr);
    const v = toView(m);
    if (v[2] <= 0) { pen = false; continue; }
    const x = g.cx + v[0] * g.R, y = g.cy - v[1] * g.R;
    pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    pen = true;
  }
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.6;
  ctx.setLineDash([5, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
}

// Legenda degli strati con linee di richiamo sulle facce del taglio
function drawLayerLegend(g) {
  const x = Math.min(SW - 250, g.cx + g.R + 36);
  const y0 = Math.max(70, g.cy - 110);
  const dirs = [[1, 0, 0], [0, 1, 0], [0.7071, 0, 0.7071], [0, 0.7071, 0.7071], [0.7071, 0, -0.7071], [0, 0.7071, -0.7071]];
  LAYERS.forEach((l, i) => {
    const y = y0 + i * 46;
    const rgb = `rgb(${l.rgb.join(',')})`;
    ctx.fillStyle = rgb;
    ctx.fillRect(x, y - 7, 14, 14);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y - 6.5, 13, 13);
    label(l.name, x + 22, y - 6, { size: 12, bold: true });
    const depth = l.r1 >= R_MOON ? `0 – ${Math.round(R_MOON - l.r0)} km di profondità`
                : `${Math.round(R_MOON - l.r1)} – ${Math.round(R_MOON - l.r0)} km di profondità`;
    label(depth, x + 22, y + 9, { size: 10, color: '#b9c6d6' });

    // richiamo: primo punto del taglio in cui lo strato è davvero visibile
    const rm = (l.r0 + l.r1) / 2 / R_MOON;
    for (const d of dirs) {
      const v = toView(d.map(k => k * rm));
      const hit = cutHitRadius(v[0], v[1]);
      if (hit < 0 || layerIndex(hit) !== i) continue;
      const px = g.cx + v[0] * g.R, py = g.cy - v[1] * g.R;
      ctx.beginPath();
      ctx.moveTo(px, py); ctx.lineTo(x - 26, y); ctx.lineTo(x - 5, y);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath(); ctx.arc(px, py, 2.5, 0, 2 * Math.PI); ctx.fillStyle = '#fff'; ctx.fill();
      break;
    }
  });
  label('Strati in scala. La crosta è spessa appena il 2% del raggio.', x, y0 + LAYERS.length * 46 + 2, { size: 10, color: '#8fa3b8' });
}

const PHASE_NAMES = ['Luna nuova', 'Falce crescente', 'Primo quarto', 'Gibbosa crescente', 'Luna piena', 'Gibbosa calante', 'Ultimo quarto', 'Falce calante'];
function phaseName() {
  const a = ((P.phase % 360) + 360) % 360;
  for (const [c, i] of [[0, 0], [90, 2], [180, 4], [270, 6], [360, 0]]) if (Math.abs(a - c) <= 6) return PHASE_NAMES[i];
  return PHASE_NAMES[a < 90 ? 1 : a < 180 ? 3 : a < 270 ? 5 : 7];
}

function compose() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#03050a';
  ctx.fillRect(0, 0, SW, SH);
  for (const [u, v, r, a] of STARS) {
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fillRect(u * SW, v * SH, r, r);
  }
  const g = geom();
  if (!tex) { label('Caricamento della mappa…', SW / 2, SH / 2, { align: 'center', size: 13 }); return; }
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(buf, bufRect.x, bufRect.y, bufRect.w, bufRect.h);

  if (P.grid) drawGraticule(g);
  drawFeatures(g);
  drawSelection(g);
  if (P.mode === 'interior') drawLayerLegend(g);

  label(P.mode === 'interior' ? 'STRUTTURA INTERNA' : 'SUPERFICIE', 14, 20, { size: 12, bold: true, color: '#9fd0ff' });
  if (P.phaseOn && P.mode === 'surface') {
    const frac = (1 - Math.cos(P.phase * DEG)) / 2;
    label(`${phaseName()} · illuminata al ${Math.round(frac * 100)}%`, 14, 40, { size: 11, color: '#d6e2f0' });
  }
  label('trascina per ruotare · rotella per lo zoom · clic su un nome per i dettagli', 14, SH - 16, { size: 10, color: '#8fa3b8' });
}

// ── Readout ───────────────────────────────────────────────────────────────────
const readout = new Lab.Readout(readoutEl, [
  { key: 'center', label: 'centro della vista' },
  { key: 'side',   label: 'emisfero' },
  { key: 'radius', label: 'raggio medio' },
  { key: 'g',      label: 'gravità in superficie' },
  { key: 'dist',   label: 'distanza media dalla Terra' },
  { key: 'period', label: 'periodo siderale' },
]);
readout.set('radius', '1737,4 km');
readout.set('g', '1,62 m/s²');
readout.set('dist', '384 400 km');
readout.set('period', '27,32 d');

const fmtCoord = (lat, lon) =>
  `${Lab.fmt(Math.abs(lat),1).replace('.', ',')}°${lat >= 0 ? 'N' : 'S'} ${Lab.fmt(Math.abs(lon),1).replace('.', ',')}°${lon >= 0 ? 'E' : 'O'}`;

function updateReadout() {
  const c = [M[6], M[7], M[8]];             // punto della Luna al centro dello schermo
  const lat = Math.asin(Math.max(-1, Math.min(1, c[1]))) / DEG, lon = Math.atan2(c[0], c[2]) / DEG;
  readout.set('center', fmtCoord(lat, lon));
  readout.set('side', c[2] > 0.5 ? 'Faccia visibile' : c[2] < -0.5 ? 'Faccia nascosta' : 'Bordo');
}

// ── Controls ──────────────────────────────────────────────────────────────────
let zoomSlider, infoBox, modeRadio;

function setView(name) { Mtarget = VIEWS[name].slice(); }

function setMode(mode) {
  P.mode = mode;
  setView(mode === 'interior' ? 'interior' : 'near');
  if (mode === 'interior' && P.zoom > 1.3) { P.zoom = 1; zoomSlider.setValue(1); }
  sphereDirty = true;
}

function showInfo() {
  if (!selected) {
    infoBox.innerHTML = 'Fai clic sul nome di un cratere, di un mare o di un monte per vederne i dati.';
    return;
  }
  const f = selected, cat = CAT[f.cat];
  const sizeLabel = f.cat === 'mount' ? 'Estensione' : 'Diametro';
  infoBox.innerHTML =
    `<div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:4px">${f.name}</div>` +
    `<div><b>Tipo:</b> ${cat.type}</div>` +
    `<div><b>Coordinate:</b> ${fmtCoord(f.lat, f.lon)}</div>` +
    (f.size ? `<div><b>${sizeLabel}:</b> ≈ ${f.size} km</div>` : '') +
    `<div><b>Emisfero:</b> ${Math.abs(f.lon) <= 90 ? 'faccia visibile' : 'faccia nascosta'}</div>` +
    (f.note ? `<div style="margin-top:6px">${f.note}</div>` : '');
}

function buttonRow(items) {
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:16px;';
  for (const [text, fn] of items) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = 'padding:7px 4px;border-radius:6px;border:1px solid var(--border-hover);background:var(--bg3);color:var(--text-primary);cursor:pointer;font-family:"DM Sans",sans-serif;font-size:11px;font-weight:600;';
    btn.addEventListener('click', fn);
    grid.appendChild(btn);
  }
  return grid;
}

function buildControls() {
  const cont = document.getElementById('controls');
  cont.innerHTML = '';
  const boxCss = 'font-size:11px;color:var(--text-secondary);line-height:1.7;padding:10px 12px;background:var(--bg3);border-radius:8px;';

  const secView = Lab.Section('Vista');
  modeRadio = Lab.RadioGroup({
    label: 'Cosa mostrare',
    options: [
      { value: 'surface',  label: 'Superficie' },
      { value: 'interior', label: 'Struttura interna' },
    ],
    value: P.mode,
    onChange: setMode,
  });
  secView.add(modeRadio);
  secView.add(buttonRow([
    ['Faccia visibile', () => setView('near')],
    ['Faccia nascosta', () => setView('far')],
    ['Polo nord', () => setView('north')],
    ['Polo sud', () => setView('south')],
  ]));
  zoomSlider = Lab.Slider({
    label: 'Zoom', unit: '×', min: 0.5, max: 4, step: 0.1, value: P.zoom,
    onChange(v) { P.zoom = v; sphereDirty = true; }
  });
  secView.add(zoomSlider);
  secView.add(Lab.Toggle({
    label: 'Reticolo lat/lon (30°)', value: P.grid,
    onChange(v) { P.grid = v; composeDirty = true; }
  }));

  const secLight = Lab.Section('Illuminazione');
  secLight.add(Lab.Toggle({
    label: 'Fasi lunari', value: P.phaseOn,
    onChange(v) { P.phaseOn = v; sphereDirty = true; }
  }));
  secLight.add(Lab.Slider({
    label: 'Fase (0° nuova, 180° piena)', unit: '°', min: 0, max: 360, step: 5, value: P.phase,
    onChange(v) { P.phase = v; if (P.phaseOn) sphereDirty = true; }
  }));

  const secNames = Lab.Section('Nomi');
  for (const c of CATEGORIES) {
    secNames.add(Lab.Toggle({
      label: c.label, value: P.show[c.id],
      onChange(v) { P.show[c.id] = v; composeDirty = true; }
    }));
  }
  const hint = document.createElement('div');
  hint.style.cssText = 'font-size:10px;color:var(--text-hint);line-height:1.6;margin-bottom:12px;';
  hint.textContent = 'Aumentando lo zoom compaiono anche le formazioni minori.';
  secNames.add(hint);

  const secInfo = Lab.Section('Dettagli');
  infoBox = document.createElement('div');
  infoBox.style.cssText = boxCss;
  secInfo.add(infoBox);
  showInfo();

  const secLayers = Lab.Section('Struttura interna');
  const layers = document.createElement('div');
  layers.style.cssText = boxCss;
  layers.innerHTML = LAYERS.map(l =>
    `<div style="margin-bottom:6px"><span style="display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px;background:rgb(${l.rgb.join(',')})"></span>` +
    `<b style="color:var(--text-primary)">${l.name}</b><br>${l.desc}</div>`).join('') +
    '<div>La Luna è differenziata come la Terra, ma il nucleo è piccolo: circa il 20% del raggio (nella Terra è oltre il 50%).</div>';
  secLayers.add(layers);

  const secFacts = Lab.Section('Dati tecnici');
  const table = document.createElement('div');
  table.style.cssText = boxCss;
  table.innerHTML = FACTS.map(([k, v]) =>
    `<div style="display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid var(--border-idle);padding:3px 0">` +
    `<span>${k}</span><b style="color:var(--text-primary);text-align:right">${v}</b></div>`).join('') +
    '<div style="margin-top:8px;font-size:10px">Mappa: NASA / LRO (Lunar Reconnaissance Orbiter).</div>';
  secFacts.add(table);

  cont.append(secView.el, secLight.el, secNames.el, secInfo.el, secLayers.el, secFacts.el);
}

// ── Interazione ───────────────────────────────────────────────────────────────
let dragging = false, moved = 0, lastX = 0, lastY = 0, lastInteract = 0;

canvas.style.touchAction = 'none';
canvas.style.cursor = 'grab';
canvas.addEventListener('pointerdown', e => {
  dragging = true; moved = 0;
  lastX = e.clientX; lastY = e.clientY;
  Mtarget = null;
  canvas.setPointerCapture(e.pointerId);
  canvas.style.cursor = 'grabbing';
});
canvas.addEventListener('pointermove', e => {
  if (!dragging) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  moved += Math.abs(dx) + Math.abs(dy);
  const { R } = geom();
  M = orthonormalize(mul(mul(rotY(dx / R), rotX(dy / R)), M));
  sphereDirty = true;
  lastInteract = performance.now();
});
function endDrag(e) {
  if (!dragging) return;
  dragging = false;
  canvas.style.cursor = 'grab';
  if (moved < 5 && e.type === 'pointerup') {          // clic: selezione di una formazione
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const hit = placed.find(p => Math.abs(x - p.x) <= p.hw && Math.abs(y - p.y) <= 10);
    selected = hit ? hit.f : null;
    showInfo();
    composeDirty = true;
  }
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  P.zoom = Math.min(4, Math.max(0.5, P.zoom * Math.exp(-e.deltaY * 0.0012)));
  P.zoom = Math.round(P.zoom * 100) / 100;
  zoomSlider.setValue(Math.round(P.zoom * 10) / 10);
  sphereDirty = true;
  lastInteract = performance.now();
}, { passive: false });

// ── Main loop ─────────────────────────────────────────────────────────────────
let lastTS = null, hqDone = false;

function setAutoRotate(v) {
  P.autoRotate = v;
  document.getElementById('btnPlay').textContent = v ? '⏸  FERMA' : '▶  RUOTA';
}

function loop(ts) {
  requestAnimationFrame(loop);
  const dt = lastTS === null ? 0 : Math.min((ts - lastTS) / 1000, 0.05);
  lastTS = ts;

  let moving = dragging;
  if (Mtarget) { stepTowardsTarget(); sphereDirty = true; moving = true; }
  else if (P.autoRotate && !dragging) {
    M = orthonormalize(mul(rotY(dt * 0.25), M));
    sphereDirty = true; moving = true;
  }
  if (performance.now() - lastInteract < 180) moving = true;

  if (sphereDirty) {
    // in movimento si disegna a bassa risoluzione; da fermi si rifinisce una volta
    renderSphere(!moving);
    hqDone = !moving;
    sphereDirty = false;
    composeDirty = true;
  } else if (!moving && !hqDone) {
    renderSphere(true);
    hqDone = true;
    composeDirty = true;
  }
  if (composeDirty) {
    compose();
    updateReadout();
    composeDirty = false;
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
Lab.initTheme('themeToggle');
resize();
buildControls();
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(canvas.parentElement);

document.getElementById('btnPlay').addEventListener('click', () => setAutoRotate(!P.autoRotate));
document.getElementById('btnReset').addEventListener('click', () => {
  setAutoRotate(false);
  selected = null; showInfo();
  P.zoom = 1; zoomSlider.setValue(1);
  setView(P.mode === 'interior' ? 'interior' : 'near');
  sphereDirty = true;
});

requestAnimationFrame(loop);
