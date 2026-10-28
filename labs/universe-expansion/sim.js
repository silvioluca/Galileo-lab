'use strict';

// ═══ Costanti fisiche e di dominio (SEMPRE fisse — vedi lezione sugli assi fissi) ═══
const TWO = Math.PI * 2;
const T_INTEGRATE_START = 1e-6;                        // Gyr, inizio integrazione (dominio di radiazione profondo)
const T_DISPLAY_START = 1e-4;                           // Gyr (100 000 anni), "apice" del cono / inizio scala log visibile
const T_END = 30;                                        // Gyr, orizzonte futuro mostrato
const OMEGA_R = 9.0e-5;                                  // densità di radiazione oggi (fissa, non esplorabile: conta solo nei primi 50 000 anni)
const T0_CMB = 2.725;                                    // K, temperatura del fondo cosmico oggi
const COL = ['#00d4ff', '#ff9d4d'];
const COSMO_COL = { r: '#4fd0ff', m: '#ffb400', l: '#c47fff' };

const EPOCHS = [
  { name: 'Big Bang', t: T_DISPLAY_START, desc: "Origine dello spazio-tempo: plasma caldissimo e densissimo." },
  { name: 'Inflazione', t: T_DISPLAY_START, desc: 'Espansione esponenziale nei primissimi istanti (circa 10⁻³² s dopo il Big Bang).' },
  { name: 'Bagliore Fossile (CMB)', t: 3.8e-4, desc: "L'universo diventa trasparente: la luce si libera (ricombinazione, z≈1100)." },
  { name: 'Età Oscura', t: 0.1, desc: 'Nessuna stella ancora accesa: solo idrogeno neutro nel buio.' },
  { name: 'Prime Stelle', t: 0.4, desc: 'Si accendono le prime stelle e galassie (reionizzazione).' },
  { name: 'Galassie e Quasar', t: 1.5, desc: 'Le galassie si aggregano ed evolvono rapidamente.' },
  { name: "Accelerazione", t: 9, desc: "L'energia oscura inizia a dominare: l'espansione accelera." },
  { name: 'Oggi', t: 13.8, desc: "L'epoca attuale, 13.8 miliardi di anni dopo il Big Bang." },
];

const P = {
  mode: 'timeline',                                      // 'timeline' | 'cmb'
  omegaM: 0.315, omegaL: 0.685, H0: 67.4,                 // parametri cosmologici (ΛCDM piatto per default)
  tPos: 0,                                                // posizione sul tempo (scala log 0..1000, vedi tOfP/xFracOfT)
  cmbGrowth: 0,                                            // 0..1: la sfera del CMB parte da un punto e cresce fino alla dimensione piena
  showAnnot: true,
  speed: 1.0,
  paused: false,
};

const CMB_GROWTH_DURATION = 3.2;                          // s, durata dell'animazione "nasce da un punto" della sfera CMB

let TABLE = null;
let cmbTex = null, miniCmbTex = null, cmbSeed = 7.31;
let G = {};
let gCanvas = [null, null, null], gCtx = [null, null, null], gTitle = [null, null, null];
let readout;
let dragging = false;
let simCanvas = null;
let syncPlayUI = () => {};                                // assegnata in init(); richiamabile anche da buildControls()
let realT = 0;                                            // secondi reali trascorsi, per le animazioni decorative (scintille, ecc.)

// ═══ Palette ══════════════════════════════════════════════════════════════════
function dk() { return document.documentElement.dataset.theme !== 'light'; }
function pal() {
  const d = dk();
  return {
    bg:     d ? '#04060c' : '#e7edf4',
    txt:    d ? 'rgba(225,238,250,0.96)' : 'rgba(20,40,70,0.95)',
    sub:    d ? 'rgba(165,195,220,0.82)' : 'rgba(60,90,125,0.9)',
    accent: d ? '#00d4ff' : '#0a78b0',
    ring:   d ? 'rgba(150,175,205,0.4)' : 'rgba(60,95,130,0.45)',
    grid:   d ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)',
    gBg:    d ? 'rgb(3,9,22)' : '#eef2f7',
    gAxis:  d ? 'rgba(100,155,210,0.3)' : 'rgba(40,80,130,0.32)',
    gText:  d ? 'rgba(150,205,225,0.88)' : 'rgba(25,65,105,0.92)',
  };
}
let T = pal();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ═══ Fisica: equazione di Friedmann per un universo ΛCDM (con curvatura residua) ═══
// H(a)² = H0²·[Ωr/a⁴ + Ωm/a³ + Ωk/a² + ΩΛ]      Ωk = 1 − Ωr − Ωm − ΩΛ
const H0PerGyr = H0kms => H0kms * 1.0227e-3;             // km/s/Mpc → 1/Gyr

function interpLogLogArr(ts, as, tq) {
  tq = clamp(tq, ts[0], ts[ts.length - 1]);
  let lo = 0, hi = ts.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ts[mid] <= tq) lo = mid; else hi = mid; }
  const t0 = ts[lo], t1 = ts[hi], a0 = as[lo], a1 = as[hi];
  if (t1 === t0) return a0;
  const f = (Math.log(tq) - Math.log(t0)) / (Math.log(t1) - Math.log(t0));
  return Math.exp(Math.log(a0) + f * (Math.log(a1) - Math.log(a0)));
}

function buildTable() {
  const H0g = H0PerGyr(P.H0);
  const omegaK = 1 - OMEGA_R - P.omegaM - P.omegaL;
  const Hofa = a => H0g * Math.sqrt(Math.max(1e-14, OMEGA_R / a ** 4 + P.omegaM / a ** 3 + omegaK / a ** 2 + P.omegaL));
  const dadt = a => a * Hofa(a);

  const N = 1600;
  const lnT0 = Math.log(T_INTEGRATE_START), lnT1 = Math.log(T_END);
  let a = Math.sqrt(2 * H0g * Math.sqrt(OMEGA_R) * T_INTEGRATE_START);   // analitico, dominio di radiazione
  let t = T_INTEGRATE_START;
  const ts = [t], as = [a];
  for (let i = 1; i <= N; i++) {
    const tNext = Math.exp(lnT0 + (lnT1 - lnT0) * i / N), dt = tNext - t;
    const k1 = dadt(a), k2 = dadt(a + k1 * dt / 2), k3 = dadt(a + k2 * dt / 2), k4 = dadt(a + k3 * dt);
    a = a + dt / 6 * (k1 + 2 * k2 + 2 * k3 + k4);
    t = tNext;
    ts.push(t); as.push(a);
  }
  // le densità Ω sono riferite a oggi, quindi a = 1 cade da sé nel presente: l'età dell'universo
  // è il tempo in cui a(t) = 1 e dipende da H₀, Ωm e ΩΛ (13,8 miliardi di anni solo per i valori di Planck)
  const aNorm = as;
  TABLE = { t: ts, a: aNorm };
  const tWhen = aT => { for (let i = 1; i < as.length; i++) if (as[i] >= aT) { const f = Math.log(aT / as[i - 1]) / Math.log(as[i] / as[i - 1]); return Math.exp(Math.log(ts[i - 1]) + f * Math.log(ts[i] / ts[i - 1])); } return Infinity; };
  TABLE.age = tWhen(1);
  const today = EPOCHS.find(e => e.name === 'Oggi');
  today.t = Math.min(TABLE.age, T_END);
  today.desc = `L'epoca attuale, ${Lab.fmt(TABLE.age, 1)} miliardi di anni dopo il Big Bang.`;
  // l'espansione accelera quando ΩΛ supera metà della densità di materia: a³ = Ωm / (2·ΩΛ)
  EPOCHS.find(e => e.name === 'Accelerazione').t = P.omegaL > 0 ? tWhen(Math.cbrt(P.omegaM / (2 * P.omegaL))) : Infinity;
  TABLE.gAMin = interpLogLogArr(ts, aNorm, T_DISPLAY_START);
  TABLE.gAMax = interpLogLogArr(ts, aNorm, T_END);
}
const aOfT = t => interpLogLogArr(TABLE.t, TABLE.a, t);
const zOfT = t => 1 / aOfT(t) - 1;
const tempOfT = t => T0_CMB / aOfT(t);
function HofT(t) {
  const a = aOfT(t), H0g = H0PerGyr(P.H0), omegaK = 1 - OMEGA_R - P.omegaM - P.omegaL;
  return H0g * Math.sqrt(Math.max(1e-14, OMEGA_R / a ** 4 + P.omegaM / a ** 3 + omegaK / a ** 2 + P.omegaL));
}
function omegaFracsAt(t) {
  const a = aOfT(t), omegaK = 1 - OMEGA_R - P.omegaM - P.omegaL;
  const r = OMEGA_R / a ** 4, m = P.omegaM / a ** 3, k = omegaK / a ** 2, l = P.omegaL;
  const sum = r + m + k + l;
  return { r: r / sum, m: m / sum, l: l / sum };
}

// ═══ tempo cosmico ↔ posizione sullo slider/asse log (0..1000) ═══
const xFracOfT = t => clamp(Math.log(Math.max(t, T_DISPLAY_START) / T_DISPLAY_START) / Math.log(T_END / T_DISPLAY_START), 0, 1);
const tOfP = p => T_DISPLAY_START * Math.pow(T_END / T_DISPLAY_START, p / 1000);
// forma del cono: potenza artistica come base, ma con una svasatura extra oltre l'inizio
// dell'epoca "Accelerazione" — l'energia oscura fa espandere lo spazio sempre più in fretta,
// quindi il cono deve allargarsi più rapidamente proprio negli ultimi tratti, non di meno
const ACCEL_FRAC = xFracOfT(9);
function coneShapeRaw(xf) {
  let v = 0.035 + 0.965 * Math.pow(xf, 0.42);
  if (xf > ACCEL_FRAC) { const loc = (xf - ACCEL_FRAC) / (1 - ACCEL_FRAC); v *= 1 + 0.55 * Math.pow(loc, 1.6); }
  return v;
}
const CONE_NORM = coneShapeRaw(1);
// l'inflazione dura ~10⁻³² s: dopo l'apice del cono e fino alla ricombinazione l'universo è un plasma opaco
const PLASMA = { name: 'Plasma primordiale', desc: 'Nuclei, elettroni e fotoni in un plasma caldo e opaco: la luce non viaggia ancora libera.' };
function currentEpoch(t) {
  let cur = EPOCHS[0]; for (const ep of EPOCHS) if (ep.t <= t * 1.0001) cur = ep;
  return (cur.name === 'Inflazione' || cur.name === 'Big Bang') && t > T_DISPLAY_START * 1.05 ? PLASMA : cur;
}
function fmtTime(tGyr) {
  if (tGyr < 1e-3) return Lab.fmt(tGyr * 1e6, 0) + ' mila anni';
  if (tGyr < 1) return Lab.fmt(tGyr * 1e3, 0) + ' milioni di anni';
  return Lab.fmt(tGyr, 2) + ' mld di anni';
}

// ═══ rumore procedurale (per la mappa del CMB) ═══
function hashRand(i, salt) { const v = Math.sin(i * 127.1 + salt * 311.7 + 13.7) * 43758.5453; return v - Math.floor(v); }
function hash2(ix, iy, seed) { const v = Math.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453; return v - Math.floor(v); }
function valueNoise(x, y, seed) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const v00 = hash2(x0, y0, seed), v10 = hash2(x0 + 1, y0, seed), v01 = hash2(x0, y0 + 1, seed), v11 = hash2(x0 + 1, y0 + 1, seed);
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = v00 + (v10 - v00) * sx, b = v01 + (v11 - v01) * sx;
  return a + (b - a) * sy;
}
// Approssimazione sintetica dello spettro di potenza angolare del CMB ℓ(ℓ+1)Cℓ/2π:
// plateau di Sachs-Wolfe a basso ℓ + primi tre picchi acustici barionici (ℓ≈220, 540, 800,
// valori indicativi da WMAP/Planck) + smorzamento di Silk oltre ℓ≈900. Usata per pesare le
// ottave del rumore procedurale, così le fluttuazioni non sono "rumore rosa" generico ma
// riproducono la scala angolare dominante (~1°) e la caduta di potenza alle piccole scale
// che caratterizzano davvero il fondo cosmico — non una sintesi in armoniche sferiche
// completa (troppo onerosa per il browser), ma un'approssimazione fisicamente motivata.
function acousticPower(l) {
  const sw = 1400 / (1 + (l / 30) ** 2);
  const peak1 = 5200 * Math.exp(-(((l - 220) / 70) ** 2));
  const peak2 = 2600 * Math.exp(-(((l - 540) / 90) ** 2));
  const peak3 = 2200 * Math.exp(-(((l - 800) / 110) ** 2));
  const damping = Math.exp(-((Math.max(0, l - 900) / 500) ** 1.4));
  return (sw + peak1 + peak2 + peak3) * damping;
}
const L_CALIB = 220;                                     // ℓ del picco acustico principale ↔ ottava di base (freq=1)
function fbm(x, y, seed, octaveLo, octaveHi) {
  let sum = 0, norm = 0, freq = 2 ** octaveLo;
  for (let o = octaveLo; o <= octaveHi; o++) {
    const l = L_CALIB * freq, amp = Math.sqrt(acousticPower(l));
    sum += valueNoise(x * freq, y * freq, seed + o * 17) * amp;
    norm += amp;
    freq *= 2.15;
  }
  return norm > 0 ? sum / norm : 0.5;
}
const CMAP = [[-1, [30, 30, 190]], [-0.5, [0, 190, 230]], [0, [40, 200, 90]], [0.5, [235, 225, 40]], [1, [220, 40, 30]]];
function cmbColor(v) {
  for (let i = 0; i < CMAP.length - 1; i++) {
    const [v0, c0] = CMAP[i], [v1, c1] = CMAP[i + 1];
    if (v <= v1 || i === CMAP.length - 2) { const f = clamp((v - v0) / (v1 - v0), 0, 1); return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f]; }
  }
  return CMAP[CMAP.length - 1][1];
}
// Colore approssimato di corpo nero per una data temperatura (K) — approssimazione
// standard (Tanner Helland) usata per rendere il passaggio caldo→freddo della sfera CMB.
function blackbodyColor(tempK) {
  const t = clamp(tempK, 1000, 40000) / 100;
  let r, g, b;
  r = t <= 66 ? 255 : clamp(329.7 * Math.pow(t - 60, -0.1332), 0, 255);
  g = t <= 66 ? clamp(99.47 * Math.log(t) - 161.1, 0, 255) : clamp(288.1 * Math.pow(t - 60, -0.0755), 0, 255);
  b = t >= 66 ? 255 : (t <= 19 ? 0 : clamp(138.5 * Math.log(t - 10) - 305.0, 0, 255));
  return [r, g, b];
}
const lerp = (a, b, f) => a + (b - a) * f;

// Genera (una sola volta, mai per-frame) la texture con le anisotropie: usata sia per la
// sfera principale sia per la piccola porzione mostrata dentro il cono della cronologia.
function buildAnisotropyTexture(size) {
  const R = size / 2;
  const off = document.createElement('canvas'); off.width = size; off.height = size;
  const octx = off.getContext('2d');
  const img = octx.createImageData(size, size);
  const freqScale = 480 / size * 0.045;                   // stessa scala fisica della sfera principale, indipendente dalla risoluzione
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const dx = (px - R + 0.5) / R, dy = (py - R + 0.5) / R, rr = Math.hypot(dx, dy);
      const idx = (py * size + px) * 4;
      if (rr > 1) { img.data[idx + 3] = 0; continue; }
      const nz = Math.sqrt(Math.max(0, 1 - rr * rr));
      // ottave da -1 a +3: la principale (freq=1, ℓ≈220) domina il peso, le successive
      // seguono la caduta prevista da acousticPower() invece di un fattore 0.5 arbitrario
      let v = fbm(px * freqScale, py * freqScale, cmbSeed, -1, 3);
      v = clamp((v - 0.5) * 3.4, -1, 1);                  // riporta la distribuzione naturale sulla scala di visualizzazione ±3σ
      const [r, g, b] = cmbColor(v), shade = 0.55 + 0.55 * nz;
      img.data[idx] = clamp(r * shade, 0, 255); img.data[idx + 1] = clamp(g * shade, 0, 255); img.data[idx + 2] = clamp(b * shade, 0, 255); img.data[idx + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return off;
}
function buildCMBTexture() { cmbTex = buildAnisotropyTexture(480); }
function buildMiniCMBTexture() { miniCmbTex = buildAnisotropyTexture(96); }

// ═══ Rendering ════════════════════════════════════════════════════════════════
function drawGrid(ctx, W, H) {
  ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}
const coneHH = (xf, maxHalfH) => maxHalfH * coneShapeRaw(xf) / CONE_NORM;
const RING_SQUASH = 0.26;                                 // rapporto rx/ry delle ellissi in prospettiva: usato per anelli, griglia e patch del CMB
function drawTubeRing(ctx, x, coneY, hh, alpha) {
  ctx.save(); ctx.strokeStyle = `rgba(255,255,255,${alpha})`; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(x, coneY, Math.max(2, hh * RING_SQUASH), hh, 0, 0, TWO); ctx.stroke();
  ctx.restore();
}
// linee longitudinali: insieme agli anelli formano un reticolo 3D sulla superficie del cono
// (la "griglia dello spazio" che si espande, come nell'immagine di riferimento)
function drawTubeLongitudes(ctx, coneX0, coneX1, coneY, maxHalfH, curFrac) {
  const fracs = [-0.9, -0.5, 0, 0.5, 0.9];
  ctx.strokeStyle = 'rgba(255,255,255,0.09)'; ctx.lineWidth = 1;
  fracs.forEach(fr => {
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) { const xf = (i / 60) * curFrac, x = coneX0 + xf * (coneX1 - coneX0), hh = coneHH(xf, maxHalfH), y = coneY + fr * hh;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
  });
}
// stella con nucleo brillante + alone morbido, colore da una tavolozza di tipi stellari realistici
const STAR_COLORS = ['155,176,255', '202,215,255', '255,255,255', '255,244,214', '255,210,161', '255,166,81'];
function drawStar(ctx, x, y, r, alpha, col) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
  g.addColorStop(0, `rgba(${col},${alpha})`); g.addColorStop(0.4, `rgba(${col},${(alpha * 0.45).toFixed(2)})`); g.addColorStop(1, `rgba(${col},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, TWO); ctx.fill();
  ctx.fillStyle = `rgba(${col},${alpha})`; ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, TWO); ctx.fill();
}
// galassia: nucleo ellittico più luminoso dentro un alone soffuso allungato e ruotato
const GALAXY_TINTS = [['255,246,222', '150,185,255'], ['255,232,196', '255,190,140'], ['255,214,196', '220,150,190']];
function drawGalaxyBlob(ctx, x, y, r, angle, tintIdx) {
  const [core, halo] = GALAXY_TINTS[tintIdx % GALAXY_TINTS.length];
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(1.9, 1);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, `rgba(${core},0.55)`); g.addColorStop(0.35, `rgba(${halo},0.4)`); g.addColorStop(1, `rgba(${halo},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TWO); ctx.fill();
  ctx.fillStyle = `rgba(${core},0.85)`; ctx.beginPath(); ctx.arc(0, 0, r * 0.16, 0, TWO); ctx.fill();
  ctx.restore();
}
// patch del CMB inclinata come le altre ellissi del tubo (stessa prospettiva degli anelli),
// non più un disco piatto che rompeva l'illusione 3D
function drawMiniCMBPatch(ctx, cx, cy, hh, alpha) {
  if (!miniCmbTex) buildMiniCMBTexture();
  const rx = Math.max(3, hh * RING_SQUASH), ry = hh;
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TWO); ctx.clip();
  ctx.drawImage(miniCmbTex, cx - rx, cy - ry, rx * 2, ry * 2);
  ctx.restore();
  ctx.strokeStyle = `rgba(255,255,255,${(alpha * 0.5).toFixed(2)})`; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TWO); ctx.stroke();
}

function drawTimeline(ctx, W, H, t) {
  const marginL = 50, marginR = 30, topY = 62, botHint = 46;
  const coneY = topY + (H - topY - botHint) * 0.44;
  const coneX0 = marginL, coneX1 = W - marginR;
  const maxHalfH = clamp((H - topY - botHint) * 0.30, 40, 170);
  G.coneX0 = coneX0; G.coneX1 = coneX1; G.mode = 'timeline';
  const curFrac = Math.max(0.006, xFracOfT(t));           // la struttura parte da un punto e cresce con il tempo
  const cmbFrac = xFracOfT(3.8e-4), starsFrac = xFracOfT(0.4), galFrac = xFracOfT(1.5);

  // sagoma "fantasma" dell'estensione finale: mostra dove arriverà la struttura
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.setLineDash([3, 5]); ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 80; i++) { const xf = i / 80, x = coneX0 + xf * (coneX1 - coneX0), hh = coneHH(xf, maxHalfH); i ? ctx.lineTo(x, coneY - hh) : ctx.moveTo(x, coneY - hh); }
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i <= 80; i++) { const xf = i / 80, x = coneX0 + xf * (coneX1 - coneX0), hh = coneHH(xf, maxHalfH); i ? ctx.lineTo(x, coneY + hh) : ctx.moveTo(x, coneY + hh); }
  ctx.stroke(); ctx.setLineDash([]); ctx.restore();

  const N = Math.max(6, Math.round(140 * curFrac)), topPts = [], botPts = [];
  for (let i = 0; i <= N; i++) {
    const xf = (i / N) * curFrac, x = coneX0 + xf * (coneX1 - coneX0), hh = coneHH(xf, maxHalfH);
    topPts.push({ x, y: coneY - hh }); botPts.push({ x, y: coneY + hh });
  }
  const grad = ctx.createLinearGradient(coneX0, 0, coneX1, 0);
  grad.addColorStop(0, '#fbe9ff'); grad.addColorStop(0.05, '#c9a6ff'); grad.addColorStop(0.16, '#ff8a5c');
  grad.addColorStop(0.35, '#7a3ea8'); grad.addColorStop(0.6, '#233a72'); grad.addColorStop(1, dk() ? '#050a16' : '#101a30');
  ctx.beginPath();
  topPts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  for (let i = botPts.length - 1; i >= 0; i--) ctx.lineTo(botPts[i].x, botPts[i].y);
  ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1; ctx.stroke();

  // bagliore accecante del Big Bang: un lampo intenso e stabile all'apice, additivo
  // così resta luminoso anche sopra il gradiente più chiaro
  const flashR = clamp(maxHalfH * 0.95, 30, 140);
  const flash = ctx.createRadialGradient(coneX0, coneY, 0, coneX0, coneY, flashR);
  flash.addColorStop(0, 'rgba(255,255,255,0.98)'); flash.addColorStop(0.16, 'rgba(255,246,228,0.85)');
  flash.addColorStop(0.42, 'rgba(255,205,150,0.4)'); flash.addColorStop(1, 'rgba(255,180,120,0)');
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = flash; ctx.beginPath(); ctx.arc(coneX0, coneY, flashR, 0, TWO); ctx.fill();
  ctx.restore();

  // elementi cosmici e sezioni ad anello (pseudo-3D: il "tubo" del tempo visto di scorcio), tutto
  // ritagliato dentro la sagoma già cresciuta
  ctx.save();
  ctx.beginPath();
  topPts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  for (let i = botPts.length - 1; i >= 0; i--) ctx.lineTo(botPts[i].x, botPts[i].y);
  ctx.closePath(); ctx.clip();

  drawTubeLongitudes(ctx, coneX0, coneX1, coneY, maxHalfH, curFrac);
  for (let i = 0; i <= 14; i++) {
    const xf = (i / 14) * curFrac; if (xf < 0.01) continue;
    drawTubeRing(ctx, coneX0 + xf * (coneX1 - coneX0), coneY, coneHH(xf, maxHalfH), 0.10);
  }
  // plasma primordiale: scintille calde prima della ricombinazione
  for (let i = 0; i < 160; i++) {
    const rx = hashRand(i, 11) * Math.min(cmbFrac, curFrac); if (rx > curFrac) continue;
    const hh = coneHH(rx, maxHalfH), x = coneX0 + rx * (coneX1 - coneX0), y = coneY + (hashRand(i, 12) * 2 - 1) * hh;
    const flick = 0.4 + 0.5 * Math.abs(Math.sin(realT * (2 + hashRand(i, 13) * 3) + i));
    ctx.fillStyle = `rgba(255,${190 + Math.round(hashRand(i, 14) * 60)},140,${flick.toFixed(2)})`;
    ctx.beginPath(); ctx.arc(x, y, 0.8 + 1.2 * hashRand(i, 15), 0, TWO); ctx.fill();
  }
  // bagliore fossile: piccola porzione della mappa del CMB proprio nel punto della ricombinazione,
  // inclinata come le ellissi del tubo invece di un disco piatto
  if (curFrac >= cmbFrac - 0.01) {
    const x = coneX0 + cmbFrac * (coneX1 - coneX0), hh = coneHH(cmbFrac, maxHalfH);
    drawMiniCMBPatch(ctx, x, coneY, hh, clamp((curFrac - cmbFrac) * 20, 0.15, 0.9));
  }
  // stelle: densità crescente e più fitta dopo le "prime stelle", colori da tipi stellari realistici
  for (let i = 0; i < 950; i++) {
    const rx = hashRand(i, 1); if (rx < starsFrac || rx > curFrac) continue;
    const dens = clamp((rx - starsFrac) / (1 - starsFrac), 0, 1);
    if (hashRand(i, 3) > 0.18 + 0.82 * dens) continue;
    const x = coneX0 + rx * (coneX1 - coneX0), hh = coneHH(rx, maxHalfH), y = coneY + (hashRand(i, 2) * 2 - 1) * hh;
    const col = STAR_COLORS[Math.floor(Math.pow(hashRand(i, 5), 1.6) * STAR_COLORS.length)];
    drawStar(ctx, x, y, 0.5 + 1.3 * hashRand(i, 4), 0.25 + 0.65 * dens, col);
  }
  // galassie: chiazze allungate e ruotate dopo l'epoca "Galassie e Quasar", densità crescente verso oggi
  for (let i = 0; i < 130; i++) {
    const rx = galFrac + hashRand(i, 21) * (1 - galFrac); if (rx > curFrac) continue;
    const dens = clamp((rx - galFrac) / (1 - galFrac), 0, 1);
    if (hashRand(i, 25) > 0.3 + 0.6 * dens) continue;
    const x = coneX0 + rx * (coneX1 - coneX0), hh = coneHH(rx, maxHalfH), y = coneY + (hashRand(i, 22) * 2 - 1) * hh * 0.85;
    const angle = hashRand(i, 26) * Math.PI;
    drawGalaxyBlob(ctx, x, y, 3.5 + 6.5 * hashRand(i, 24), angle, Math.floor(hashRand(i, 23) * GALAXY_TINTS.length));
  }
  ctx.restore();

  // tacche ed etichette delle epoche: appaiono solo quando la struttura le ha raggiunte
  if (P.showAnnot) {
    EPOCHS.forEach((ep, i) => {
      if (!(ep.t <= T_END)) return;
      const xf = xFracOfT(ep.t); if (xf > curFrac + 0.003) return;
      const x = coneX0 + xf * (coneX1 - coneX0), hh = coneHH(xf, maxHalfH);
      const off = i % 2 ? 34 : 18;
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, coneY - hh - 6); ctx.lineTo(x, coneY - hh - off); ctx.stroke();
      ctx.fillStyle = T.txt; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
      ctx.fillText(ep.name, x, coneY - hh - off - 4);
    });
  }

  // marcatore del tempo corrente (trascinabile), sul bordo della struttura appena cresciuta
  const curX = coneX0 + curFrac * (coneX1 - coneX0), curHH = coneHH(curFrac, maxHalfH);
  ctx.strokeStyle = T.accent; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(curX, coneY - curHH - 10); ctx.lineTo(curX, coneY + curHH + 10); ctx.stroke();
  ctx.fillStyle = T.accent; ctx.beginPath(); ctx.arc(curX, coneY, 5, 0, TWO); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.stroke();

  // intestazione
  ctx.textAlign = 'left';
  ctx.fillStyle = T.accent; ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.fillText("Espansione dell'Universo — modello ΛCDM (parametri tipo Planck 2018)", 14, 22);
  ctx.fillStyle = T.txt; ctx.font = '10px "Space Mono",monospace';
  ctx.fillText(`Ωm=${Lab.fmt(P.omegaM,2)}   ΩΛ=${Lab.fmt(P.omegaL,2)}   Ωr=${Lab.sci(OMEGA_R,2)}   H₀=${Lab.fmt(P.H0,1)} km/s/Mpc`, 14, 40);

  // pannello descrizione epoca corrente
  const ep = currentEpoch(t);
  ctx.textAlign = 'center';
  ctx.fillStyle = T.accent; ctx.font = 'bold 12px "Space Mono",monospace';
  ctx.fillText(`${ep.name} · ${fmtTime(t)} dopo il Big Bang`, W / 2, H - botHint + botHint * 0.38);
  ctx.fillStyle = T.sub; ctx.font = '10px "Space Mono",monospace';
  ctx.fillText(ep.desc, W / 2, H - botHint + botHint * 0.78);
}

const easeSmooth = g => g * g * (3 - 2 * g);

function drawCMB(ctx, W, H) {
  G.mode = 'cmb';
  if (!cmbTex) buildCMBTexture();
  const diamFull = clamp(Math.min(W, H) * 0.68, 160, 480);
  const grow = easeSmooth(clamp(P.cmbGrowth, 0, 1));
  const diam = Math.max(2, diamFull * grow);
  const cx = W * 0.5, cy = H * 0.46;

  // temperatura equivalente: caldissima quando la sfera è appena nata (piccola), si
  // raffredda mentre "si espande" verso la dimensione finale — alla piena crescita la
  // tinta residua corrisponde al reale bagliore arancio-caldo della superficie di ultimo
  // scattering (~3000 K), sopra cui restano visibili le anisotropie
  const tempParam = lerp(15000, 3000, grow);
  const [br, bg, bb] = blackbodyColor(tempParam);
  const visibility = clamp((grow - 0.12) / 0.55, 0, 1);   // il pattern "si condensa" e diventa leggibile mentre si raffredda

  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, diam / 2, 0, TWO); ctx.clip();
  ctx.drawImage(cmbTex, cx - diam / 2, cy - diam / 2, diam, diam);
  // tinta di corpo nero: quasi opaca e bianco-calda all'inizio, residua e arancio a crescita completa
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = `rgba(${br | 0},${bg | 0},${bb | 0},${(1 - visibility * 0.82).toFixed(2)})`;
  ctx.fillRect(cx - diam / 2, cy - diam / 2, diam, diam);
  // illuminazione direzionale (oltre al limb-darkening già nella texture), per l'effetto sfera 3D
  const lightG = ctx.createRadialGradient(cx - diam * 0.26, cy - diam * 0.3, diam * 0.02, cx - diam * 0.05, cy - diam * 0.02, diam * 0.78);
  lightG.addColorStop(0, 'rgba(255,255,255,0.4)'); lightG.addColorStop(0.45, 'rgba(255,255,255,0)'); lightG.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = lightG; ctx.fillRect(cx - diam / 2, cy - diam / 2, diam, diam);
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
  ctx.strokeStyle = T.ring; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, diam / 2, 0, TWO); ctx.stroke();
  // sagoma "fantasma" della dimensione finale, per capire quanto manca alla crescita completa
  if (grow < 0.999) {
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.setLineDash([4, 5]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, diamFull / 2, 0, TWO); ctx.stroke(); ctx.setLineDash([]);
  }

  const alpha = clamp((grow - 0.5) * 2, 0, 1);            // testo/legenda in dissolvenza mentre la sfera cresce
  const lw = clamp(W * 0.34, 160, 280), lx = cx - lw / 2, ly = cy + diamFull / 2 + 30;
  ctx.save(); ctx.globalAlpha = alpha;
  const legGrad = ctx.createLinearGradient(lx, 0, lx + lw, 0);
  CMAP.forEach(([v, c]) => legGrad.addColorStop((v + 1) / 2, `rgb(${c[0]},${c[1]},${c[2]})`));
  ctx.fillStyle = legGrad; ctx.fillRect(lx, ly, lw, 10);
  ctx.strokeStyle = T.ring; ctx.lineWidth = 1; ctx.strokeRect(lx, ly, lw, 10);
  ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('−200 μK', lx, ly + 24);
  ctx.textAlign = 'right'; ctx.fillText('+200 μK', lx + lw, ly + 24);
  ctx.textAlign = 'center'; ctx.fillText('ΔT/T — fluttuazioni di temperatura', cx, ly + 38);
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.fillStyle = T.accent; ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.fillText('Fondo Cosmico a Microonde (CMB)', 14, 22);
  ctx.fillStyle = T.txt; ctx.font = '10px "Space Mono",monospace';
  ctx.fillText(`ricombinazione: t≈380 000 anni · z≈1100 · T≈3000 K → oggi ${T0_CMB} K (redshiftata dall'espansione)`, 14, 40);
  ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace';
  ctx.fillText('spettro di potenza angolare approssimato: picchi acustici barionici a ℓ≈220, 540, 800', 14, 54);
  ctx.fillStyle = grow < 0.999 ? `rgb(${br | 0},${bg | 0},${bb | 0})` : T.sub;
  ctx.font = 'bold 10px "Space Mono",monospace';
  ctx.fillText(`temperatura equivalente: ${tempParam >= 1000 ? Lab.fmt((tempParam / 1000),1) + ' mila K' : Lab.fmt(tempParam,0) + ' K'}${grow < 0.999 ? ' — si sta raffreddando…' : ''}`, 14, 68);
  ctx.textAlign = 'center';
  ctx.fillText("le macchie sono minuscole variazioni di temperatura (~1 su 100 000): i semi delle future galassie", W / 2, H - 10);
}

function draw(canvas, t) {
  const [ctx, W, H] = Lab.ctx2d(canvas);
  T = pal();
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
  drawGrid(ctx, W, H);
  if (P.mode === 'cmb') drawCMB(ctx, W, H);
  else drawTimeline(ctx, W, H, t);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
// assi logaritmici sul tempo cosmico (da 100 000 anni a 30 miliardi di anni), con la linea di "oggi"
const TX = { xr: [T_DISPLAY_START, T_END], xLog: true, xFmt: v => v < 1e-3 ? Lab.fmt(v * 1e6, 0) + ' ka' : v < 1 ? Lab.fmt(v * 1e3, 0) + ' Ma' : Lab.fmt(v, 0) + ' Ga', xLabel: 'tempo dal Big Bang' };
function todayLine(ctx, f) {
  if (!(TABLE.age <= T_END)) return;
  ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = f.C.text; ctx.beginPath(); ctx.moveTo(f.X(TABLE.age), f.T); ctx.lineTo(f.X(TABLE.age), f.B); ctx.stroke(); ctx.restore();
  ctx.fillStyle = f.C.text; ctx.font = '9.5px "DM Sans",sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText('oggi', f.X(TABLE.age) - 4, f.B - 8);
}
// 1: fattore di scala a(t): a = 1 oggi; ∝ t^½ con la radiazione, t^⅔ con la materia, esponenziale con ΩΛ
function drawGraphA(t) {
  const g = Lab.panel(gCanvas[0], { ...TX, title: 'Fattore di scala a(t)', yr: [1e-4, 10], yLog: true });
  if (!g) return; const [ctx, f] = g;
  todayLine(ctx, f);
  Lab.plot(ctx, f, aOfT, [T_DISPLAY_START, T_END], COL[0], 2, [], 300);
  const tc = clamp(t, T_DISPLAY_START, T_END); Lab.dot(ctx, f, tc, aOfT(tc), COL[0], 4.5);
}
// 2: frazioni di densità di radiazione, materia ed energia oscura
function drawGraphOmega(t) {
  const g = Lab.panel(gCanvas[1], { ...TX, title: 'Densità relative Ω(t)', yr: [0, 1], yStep: 0.25 });
  if (!g) return; const [ctx, f] = g;
  todayLine(ctx, f);
  const tc = clamp(t, T_DISPLAY_START, T_END), fc = omegaFracsAt(tc);
  for (const [k, col] of [['r', COSMO_COL.r], ['m', COSMO_COL.m], ['l', COSMO_COL.l]]) {
    Lab.plot(ctx, f, tt => omegaFracsAt(tt)[k], [T_DISPLAY_START, T_END], col, 2, [], 300);
    Lab.dot(ctx, f, tc, fc[k], col, 3.5);
  }
  Lab.legend(ctx, f.L + 8, f.T + 8, [[COSMO_COL.r, 'radiazione'], [COSMO_COL.m, 'materia'], [COSMO_COL.l, 'energia oscura']]);
}
// 3: temperatura del fondo cosmico T = 2,725 K / a
function drawGraphTemp(t) {
  const g = Lab.panel(gCanvas[2], { ...TX, title: 'Temperatura della radiazione T = 2,725 K / a', yr: [0.1, 1e5], yLog: true });
  if (!g) return; const [ctx, f] = g;
  todayLine(ctx, f);
  Lab.plot(ctx, f, tempOfT, [T_DISPLAY_START, T_END], T.accent, 2, [], 300);
  const tc = clamp(t, T_DISPLAY_START, T_END); Lab.dot(ctx, f, tc, tempOfT(tc), T.accent, 4.5);
  ctx.fillStyle = f.C.text; ctx.font = '9.5px "DM Sans",sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('T (K)', f.L + 4, f.T + 8);
}
function drawGraphs(t) { drawGraphA(t); drawGraphOmega(t); drawGraphTemp(t); }

// ═══ Controlli ════════════════════════════════════════════════════════════════
function reControls() { setTimeout(buildControls, 0); }
function buildControls() {
  const cont = document.getElementById('controls'); cont.innerHTML = '';

  const sm = Lab.Section('Modalità'); cont.appendChild(sm.el);
  sm.add(Lab.RadioGroup({ label: 'Visualizzazione', value: P.mode,
    options: [{ value: 'timeline', label: 'Cronologia', hint: 'cono di espansione' }, { value: 'cmb', label: 'Fondo cosmico', hint: 'mappa CMB' }],
    onChange(v) {
      P.mode = v;
      if (v === 'cmb') { P.cmbGrowth = 0; P.paused = false; syncPlayUI(); }   // fa sempre partire da subito la transizione caldo→freddo
      reControls();
    } }));

  const sc = Lab.Section('Parametri cosmologici'); cont.appendChild(sc.el);
  sc.add(Lab.Slider({ label: 'Materia Ωm', min: 0.05, max: 0.9, step: 0.01, value: P.omegaM, unit: '', onChange(v) { P.omegaM = v; buildTable(); } }));
  sc.add(Lab.Slider({ label: 'Energia oscura ΩΛ', min: 0, max: 0.95, step: 0.01, value: P.omegaL, unit: '', onChange(v) { P.omegaL = v; buildTable(); } }));
  sc.add(Lab.Slider({ label: 'Costante di Hubble H₀', min: 50, max: 100, step: 0.5, value: P.H0, unit: ' km/s/Mpc', onChange(v) { P.H0 = v; buildTable(); } }));

  const sv = Lab.Section('Visualizzazione'); cont.appendChild(sv.el);
  sv.add(Lab.Toggle({ label: 'Annotazioni epoche', value: P.showAnnot, onChange(v) { P.showAnnot = v; } }));
  sv.add(Lab.Slider({ label: 'Velocità animazione', min: 0.2, max: 3, step: 0.1, value: P.speed, unit: '×', onChange(v) { P.speed = v; } }));
  if (P.mode === 'cmb') {
    const b = document.createElement('button'); b.className = 'ctrl-btn'; b.textContent = 'Rigenera mappa CMB';
    b.addEventListener('click', () => { cmbSeed = Math.random() * 1000; cmbTex = null; miniCmbTex = null; });
    sv.add(b);
  }
}

function buildReadout() {
  const cont = document.getElementById('readout'); cont.innerHTML = '';
  readout = new Lab.Readout(cont, [
    { key: 't', label: 'tempo dal Big Bang' },
    { key: 'a', label: 'fattore di scala a' },
    { key: 'z', label: 'redshift z' },
    { key: 'T', label: 'temperatura della radiazione' },
    { key: 'epoch', label: 'epoca' },
    { key: 'age', label: 'età dell’universo oggi' },
  ]);
}

function initGraphs() {
  // riga di grafici standard; i titoli sono disegnati dentro i grafici
  gCanvas = Lab.graphPanels(document.getElementById('graphArea'), 3);
  gCtx = gCanvas.map(c => c.getContext('2d'));
  gTitle = gCanvas.map(() => ({ textContent: '' }));
}

// ═══ Init ═════════════════════════════════════════════════════════════════════
function init() {
  Lab.initTheme();
  buildTable();
  buildControls(); initGraphs(); buildReadout();
  simCanvas = document.getElementById('simCanvas');
  const btnPlay = document.getElementById('btnPlay');
  function syncPlay() { btnPlay.textContent = P.paused ? '▶  AVVIA' : '⏸  PAUSA'; }
  syncPlayUI = syncPlay;
  syncPlay();
  btnPlay.addEventListener('click', () => {
    if (P.mode === 'timeline' && P.tPos >= 1000) P.tPos = 0;
    if (P.mode === 'cmb' && P.cmbGrowth >= 1) P.cmbGrowth = 0;
    P.paused = !P.paused; syncPlay();
  });
  document.getElementById('btnReset').addEventListener('click', () => {
    P.mode = 'timeline'; P.omegaM = 0.315; P.omegaL = 0.685; P.H0 = 67.4;
    P.tPos = 0; P.cmbGrowth = 0; P.showAnnot = true; P.speed = 1.0; P.paused = false;
    buildTable(); buildControls(); syncPlay();
  });

  // trascina sul cono per scorrere il tempo (solo in modalità Cronologia)
  function evtX(e) { const r = simCanvas.getBoundingClientRect(); return e.clientX - r.left; }
  function setPosFromScreen(sx) {
    if (P.mode !== 'timeline' || !G.coneX1) return;
    const xf = clamp((sx - G.coneX0) / (G.coneX1 - G.coneX0), 0, 1);
    P.tPos = xf * 1000;
  }
  simCanvas.addEventListener('pointerdown', e => { dragging = true; setPosFromScreen(evtX(e)); try { simCanvas.setPointerCapture(e.pointerId); } catch (_) {} });
  simCanvas.addEventListener('pointermove', e => { if (dragging) setPosFromScreen(evtX(e)); });
  simCanvas.addEventListener('pointerup', () => { dragging = false; });

  function resize() {
    const area = document.querySelector('.lab-canvas-area'); if (!area) return;
    const ar = area.getBoundingClientRect();
    const rb = document.getElementById('readout').getBoundingClientRect();
    const ga = document.getElementById('graphArea'); const gaH = ga ? ga.offsetHeight : 0;
    const h = Math.max(240, Math.floor(ar.height - rb.height - gaH - 4));
    Lab.hidpi(simCanvas, Math.floor(ar.width), h);
    Lab.fitPanels(gCanvas);
  }
  resize();
  new ResizeObserver(resize).observe(document.querySelector('.lab-canvas-area'));
  window.addEventListener('load', resize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);

  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000; last = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0; dt = Math.min(dt, 0.05);
    realT += dt;
    if (!P.paused) {
      if (P.mode === 'timeline') {
        P.tPos += dt * P.speed * (1000 / 30);
        if (P.tPos >= 1000) { P.tPos = 1000; P.paused = true; syncPlay(); }
      } else {
        P.cmbGrowth += dt * P.speed / CMB_GROWTH_DURATION;
        if (P.cmbGrowth >= 1) { P.cmbGrowth = 1; P.paused = true; syncPlay(); }
      }
    }
    try {
      const t = tOfP(P.tPos);
      draw(simCanvas, t); drawGraphs(t);
      const ep = currentEpoch(t);
      readout.set('t', fmtTime(t));
      readout.set('a', Lab.sci(aOfT(t), 3));
      readout.set('z', Lab.sci(zOfT(t), 3));
      readout.set('T', Lab.sci(tempOfT(t), 3) + ' K');
      readout.set('epoch', ep.name);
      readout.set('age', Lab.fmt(TABLE.age, 2) + ' mld di anni');
    } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
