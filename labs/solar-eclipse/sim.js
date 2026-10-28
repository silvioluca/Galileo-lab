'use strict';

// ═══ Effemeridi reali di Sole e Luna ══════════════════════════════════════════
// Formule di Jean Meeus ("Astronomical Algorithms"): Sole a bassa precisione (cap. 25, ~0.01°)
// e Luna con gli elementi medi e le serie periodiche complete del cap. 47 (60 + 60 termini, più
// i termini aggiuntivi), ΔT e osservatore sull'ellissoide terrestre.
// Verificato contro eclissi reali viste da città sulla linea centrale: durata della totalità entro
// una decina di secondi (Stoccarda 1999: 138 s contro 137 s reali; Luxor 2027: 386 s contro ~380 s;
// Burgos 2026: 98 s contro ~104 s; Dallas 2024: 242 s contro 232 s) e istante del massimo entro
// un minuto. Vicino ai bordi della fascia di totalità il risultato può comunque differire da
// quello reale: non sostituisce le effemeridi ufficiali (NASA/IMCCE) per pianificare un viaggio.
const DEG = Math.PI / 180, RAD = 180 / Math.PI, TWO = Math.PI * 2;
const sin = x => Math.sin(x * DEG), cos = x => Math.cos(x * DEG), tan = x => Math.tan(x * DEG);
function norm360(x) { x = x % 360; return x < 0 ? x + 360 : x; }
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

function JD(y, m, d, h) {
  h = h || 0;
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + h / 24 + B - 1524.5;
}
function jdToYMDH(jd) {
  jd += 0.5; const Z = Math.floor(jd), Fr = jd - Z;
  let A = Z; if (Z >= 2299161) { const al = Math.floor((Z - 1867216.25) / 36524.25); A = Z + 1 + al - Math.floor(al / 4); }
  const B = A + 1524, C = Math.floor((B - 122.1) / 365.25), D2 = Math.floor(365.25 * C), E2 = Math.floor((B - D2) / 30.6001);
  const day = B - D2 - Math.floor(30.6001 * E2) + Fr;
  const month = E2 < 14 ? E2 - 1 : E2 - 13;
  const year = month > 2 ? C - 4716 : C - 4715;
  const dayInt = Math.floor(day), hour = (day - dayInt) * 24;
  return { y: year, m: month, d: dayInt, h: hour };
}

function sunPos(jd) {
  const T = (jd - 2451545.0) / 36525;
  const L0 = norm360(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
  const M = norm360(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
  const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sin(M) + (0.019993 - 0.000101 * T) * sin(2 * M) + 0.000289 * sin(3 * M);
  const trueLong = L0 + C, trueAnom = M + C;
  const R = 1.000001018 * (1 - e * e) / (1 + e * cos(trueAnom));
  const Omega = 125.04 - 1934.136 * T;
  const appLong = trueLong - 0.00569 - 0.00478 * sin(Omega);
  return { lon: norm360(appLong), R };
}
function moonMeanElements(T) {
  const Lp = norm360(218.3164477 + 481267.88123421 * T - 0.0015786 * T * T + T ** 3 / 538841 - T ** 4 / 65194000);
  const D = norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T + T ** 3 / 545868 - T ** 4 / 113065000);
  const M = norm360(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T + T ** 3 / 24490000);
  const Mp = norm360(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T + T ** 3 / 69699 - T ** 4 / 14712000);
  const F = norm360(93.2720950 + 483202.0175233 * T - 0.0036539 * T * T - T ** 3 / 3526000 + T ** 4 / 863310000);
  return { Lp, D, M, Mp, F };
}
// Serie periodiche complete di Meeus (tabelle 47.A e 47.B): [D, M, M', F, Σl (10⁻⁶ °), Σr (10⁻³ km)]
// e [D, M, M', F, Σb (10⁻⁶ °)]. Con le serie troncate ai soli termini maggiori l'errore sulla
// posizione della Luna (~0,03°) bastava a trasformare un'eclissi totale in parziale.
const LR_TERMS = [
  [0,0,1,0,6288774,-20905355],[2,0,-1,0,1274027,-3699111],[2,0,0,0,658314,-2955968],[0,0,2,0,213618,-569925],
  [0,1,0,0,-185116,48888],[0,0,0,2,-114332,-3149],[2,0,-2,0,58793,246158],[2,-1,-1,0,57066,-152138],
  [2,0,1,0,53322,-170733],[2,-1,0,0,45758,-204586],[0,1,-1,0,-40923,-129620],[1,0,0,0,-34720,108743],
  [0,1,1,0,-30383,104755],[2,0,0,-2,15327,10321],[0,0,1,2,-12528,0],[0,0,1,-2,10980,79661],
  [4,0,-1,0,10675,-34782],[0,0,3,0,10034,-23210],[4,0,-2,0,8548,-21636],[2,1,-1,0,-7888,24208],
  [2,1,0,0,-6766,30824],[1,0,-1,0,-5163,-8379],[1,1,0,0,4987,-16675],[2,-1,1,0,4036,-12831],
  [2,0,2,0,3994,-10445],[4,0,0,0,3861,-11650],[2,0,-3,0,3665,14403],[0,1,-2,0,-2689,-7003],
  [2,0,-1,2,-2602,0],[2,-1,-2,0,2390,10056],[1,0,1,0,-2348,6322],[2,-2,0,0,2236,-9884],
  [0,1,2,0,-2120,5751],[0,2,0,0,-2069,0],[2,-2,-1,0,2048,-4950],[2,0,1,-2,-1773,4130],
  [2,0,0,2,-1595,0],[4,-1,-1,0,1215,-3958],[0,0,2,2,-1110,0],[3,0,-1,0,-892,3258],
  [2,1,1,0,-810,2616],[4,-1,-2,0,759,-1897],[0,2,-1,0,-713,-2117],[2,2,-1,0,-700,2354],
  [2,1,-2,0,691,0],[2,-1,0,-2,596,0],[4,0,1,0,549,-1423],[0,0,4,0,537,-1117],
  [4,-1,0,0,520,-1571],[1,0,-2,0,-487,-1739],[2,1,0,-2,-399,0],[0,0,2,-2,-381,-4421],
  [1,1,1,0,351,0],[3,0,-2,0,-340,0],[4,0,-3,0,330,0],[2,-1,2,0,327,0],
  [0,2,1,0,-323,1165],[1,1,-1,0,299,0],[2,0,3,0,294,0],[2,0,-1,-2,0,8752],
];
const B_TERMS = [
  [0,0,0,1,5128122],[0,0,1,1,280602],[0,0,1,-1,277693],[2,0,0,-1,173237],[2,0,-1,1,55413],[2,0,-1,-1,46271],
  [2,0,0,1,32573],[0,0,2,1,17198],[2,0,1,-1,9266],[0,0,2,-1,8822],[2,-1,0,-1,8216],[2,0,-2,-1,4324],
  [2,0,1,1,4200],[2,1,0,-1,-3359],[2,-1,-1,1,2463],[2,-1,0,1,2211],[2,-1,-1,-1,2065],[0,1,-1,-1,-1870],
  [4,0,-1,-1,1828],[0,1,0,1,-1794],[0,0,0,3,-1749],[0,1,-1,1,-1565],[1,0,0,1,-1491],[0,1,1,1,-1475],
  [0,1,1,-1,-1410],[0,1,0,-1,-1344],[1,0,0,-1,-1335],[0,0,3,1,1107],[4,0,0,-1,1021],[4,0,-1,1,833],
  [0,0,1,-3,777],[4,0,-2,1,671],[2,0,0,-3,607],[2,0,2,-1,596],[2,-1,1,-1,491],[2,0,-2,1,-451],
  [0,0,3,-1,439],[2,0,2,1,422],[2,0,-3,-1,421],[2,1,-1,1,-366],[2,1,0,1,-351],[4,0,0,1,331],
  [2,-1,1,1,315],[2,-2,0,-1,302],[0,0,1,3,-283],[2,1,1,-1,-229],[1,1,0,-1,223],[1,1,0,1,223],
  [0,1,-2,-1,-220],[2,1,-1,-1,-220],[1,0,1,1,-185],[2,-1,-2,-1,181],[0,1,2,1,-177],[4,0,-2,-1,176],
  [4,-1,-1,-1,166],[1,0,1,-1,-164],[4,0,1,-1,132],[1,0,-1,-1,-119],[4,-1,0,-1,115],[2,-2,0,1,107],
];
function moonPos(jd) {
  const T = (jd - 2451545.0) / 36525;
  const { Lp, D, M, Mp, F } = moonMeanElements(T);
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  const Efac = m => m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E;
  let sumL = 0, sumB = 0, sumR = 0;
  for (const [d, m, mp, f, cl, cr] of LR_TERMS) {
    const arg = d * D + m * M + mp * Mp + f * F, e = Efac(m);
    sumL += cl * e * sin(arg); sumR += cr * e * cos(arg);
  }
  for (const [d, m, mp, f, cb] of B_TERMS) sumB += cb * Efac(m) * sin(d * D + m * M + mp * Mp + f * F);
  // termini aggiuntivi: Venere, Giove e schiacciamento terrestre
  const A1 = 119.75 + 131.849 * T, A2 = 53.09 + 479264.290 * T, A3 = 313.45 + 481266.484 * T;
  sumL += 3958 * sin(A1) + 1962 * sin(Lp - F) + 318 * sin(A2);
  sumB += -2235 * sin(Lp) + 382 * sin(A3) + 175 * sin(A1 - F) + 175 * sin(A1 + F) + 127 * sin(Lp - Mp) - 115 * sin(Lp + Mp);
  // nutazione in longitudine (termine principale), come già applicata al Sole
  const nut = -0.00478 * sin(125.04 - 1934.136 * T);
  return { lon: norm360(Lp + sumL / 1e6 + nut), lat: sumB / 1e6, dist: 385000.56 + sumR / 1000, D };
}
// ΔT = TD − UT in secondi (polinomi di Espenak e Meeus): le effemeridi vogliono il tempo
// dinamico, la rotazione terrestre il tempo universale. Trascurarlo sposta la fascia di
// totalità di una trentina di km.
function deltaT(y) {
  if (y < 1986) { const t = y - 1975; return 45.45 + 1.067 * t - t * t / 260 - t * t * t / 718; }
  if (y < 2005) { const t = y - 2000; return 63.86 + 0.3345 * t - 0.060374 * t ** 2 + 0.0017275 * t ** 3 + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5; }
  if (y < 2050) { const t = y - 2000; return 62.92 + 0.32217 * t + 0.005589 * t * t; }
  return -20 + 32 * ((y - 1820) / 100) ** 2 - 0.5628 * (2150 - y);
}
function obliquity(T) { return 23.439291 - 0.0130042 * T - 1.64e-7 * T * T + 5.04e-7 * T * T * T; }
function eclToEq(lon, lat, eps) {
  const ra = Math.atan2(sin(lon) * cos(eps) - tan(lat) * sin(eps), cos(lon)) * RAD;
  const dec = Math.asin(sin(lat) * cos(eps) + cos(lat) * sin(eps) * sin(lon)) * RAD;
  return { ra: norm360(ra), dec };
}
function gmst(jd) {
  const T = (jd - 2451545.0) / 36525;
  return norm360(280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - T ** 3 / 38710000);
}
// correzione topocentrica in coordinate rettangolari equatoriali: l'unico modo pulito per non
// sbagliare segni nella parallasse
function topocentric(ra, dec, distKm, jd, lonObs, latObs) {
  const distER = distKm / 6378.14; // raggi terrestri
  const lst = norm360(gmst(jd) + lonObs);
  const x = distER * cos(dec) * cos(ra), y = distER * cos(dec) * sin(ra), z = distER * sin(dec);
  // osservatore sull'ellissoide terrestre (al livello del mare)
  const u = Math.atan(0.99664719 * tan(latObs)), rc = Math.cos(u), rs = 0.99664719 * Math.sin(u);
  const x0 = rc * cos(lst), y0 = rc * sin(lst), z0 = rs;
  const xp = x - x0, yp = y - y0, zp = z - z0;
  const distP = Math.hypot(xp, yp, zp);
  return { ra: norm360(Math.atan2(yp, xp) * RAD), dec: Math.asin(clamp(zp / distP, -1, 1)) * RAD, dist: distP * 6378.14, lst };
}
function altAzOf(ra, dec, lst, latObs) {
  let H = norm360(lst - ra); if (H > 180) H -= 360;
  const alt = Math.asin(sin(latObs) * sin(dec) + cos(latObs) * cos(dec) * cos(H)) * RAD;
  const az = norm360(Math.atan2(sin(H), cos(H) * sin(latObs) - tan(dec) * cos(latObs)) * RAD + 180);
  return { alt, az };
}
const SUN_R_KM = 695700, MOON_R_KM = 1737.4, EARTH_R_KM = 6378.14, AU_KM = 149597870.7;

// stato completo osservatore-dipendente per un dato istante
function eventAt(jd, latObs, lonObs) {
  const jde = jd + deltaT(2000 + (jd - 2451545.0) / 365.25) / 86400;
  const T = (jde - 2451545.0) / 36525, eps = obliquity(T);
  const sp = sunPos(jde), mp = moonPos(jde);
  const sunEq = eclToEq(sp.lon, 0, eps);
  const moonEq = eclToEq(mp.lon, mp.lat, eps);
  const sunDistKm = sp.R * AU_KM;
  const moonTopo = topocentric(moonEq.ra, moonEq.dec, mp.dist, jd, lonObs, latObs);
  // il Sole ha parallasse trascurabile (max 8.8"): la sua posizione topocentrica coincide di fatto
  // con quella geocentrica per gli scopi di questa visualizzazione
  const sunAlt = altAzOf(sunEq.ra, sunEq.dec, moonTopo.lst, latObs);
  const moonAlt = altAzOf(moonTopo.ra, moonTopo.dec, moonTopo.lst, latObs);
  const cosSep = clamp(sin(sunEq.dec) * sin(moonTopo.dec) + cos(sunEq.dec) * cos(moonTopo.dec) * cos(sunEq.ra - moonTopo.ra), -1, 1);
  const sep = Math.acos(cosSep) * RAD;
  const sunR = Math.atan(SUN_R_KM / sunDistKm) * RAD;
  const moonR = Math.atan(MOON_R_KM / moonTopo.dist) * RAD;
  // offset in piano tangente (ottimo per separazioni piccole come queste, <2°): dRA*cos(dec), dDec
  let dra = moonTopo.ra - sunEq.ra; while (dra > 180) dra -= 360; while (dra < -180) dra += 360;
  const dx = dra * cos((sunEq.dec + moonTopo.dec) / 2), dy = moonTopo.dec - sunEq.dec;
  // offset della Luna rispetto al Sole come li vede l'osservatore: zenit in alto, azimut
  // crescente verso destra (è il cielo reale, non una carta con il nord in alto)
  let daz = moonAlt.az - sunAlt.az; while (daz > 180) daz -= 360; while (daz < -180) daz += 360;
  const vx = daz * cos((sunAlt.alt + moonAlt.alt) / 2), vy = moonAlt.alt - sunAlt.alt;
  const coverage = coverageFraction(sunR, moonR, sep);
  let type = 'nessuna';
  if (sep < sunR + moonR) {
    if (sep < Math.abs(moonR - sunR)) type = moonR >= sunR ? 'totale' : 'anulare';
    else type = 'parziale';
  }
  return { sunEq, moonEq: { ra: moonTopo.ra, dec: moonTopo.dec }, sunAlt: sunAlt.alt, moonAlt: moonAlt.alt, sep, sunR, moonR, dx, dy, vx, vy, coverage, type, moonDistTopo: moonTopo.dist, sunDistKm };
}
// area di sovrapposizione di due cerchi (R=sole, r=luna, d=separazione centri) come frazione del
// disco solare — formula standard dell'area della lente di intersezione fra due cerchi
function coverageFraction(R, r, d) {
  if (d >= R + r) return 0;
  if (d <= Math.abs(R - r)) return r <= R ? (r * r) / (R * R) : 1;
  const a1 = R * R * Math.acos(clamp((d * d + R * R - r * r) / (2 * d * R), -1, 1));
  const a2 = r * r * Math.acos(clamp((d * d + r * r - R * R) / (2 * d * r), -1, 1));
  const a3 = 0.5 * Math.sqrt(Math.max(0, (-d + r + R) * (d + r - R) * (d - r + R) * (d + r + R)));
  const area = a1 + a2 - a3;
  return clamp(area / (Math.PI * R * R), 0, 1);
}

// ═══ Ricerca del prossimo novilunio e verifica di visibilità locale ═══════════
function findNextNewMoon(fromJD) {
  let jd = fromJD;
  const f = x => { let d = moonPos(x).D; if (d > 180) d -= 360; return d; };
  let prev = f(jd), found = null;
  for (let t = jd; t <= jd + 40; t += 0.5) {
    const cur = f(t);
    if ((prev > 90 && cur < -90) || (prev < 0 && cur >= 0 && Math.abs(cur - prev) < 180)) { found = t; break; }
    prev = cur;
  }
  if (!found) return jd + 29.5;
  let t = found;
  for (let k = 0; k < 8; k++) { const d1 = f(t), d2 = f(t + 0.01); t -= d1 / ((d2 - d1) / 0.01); }
  return t;
}
function findNextVisibleEclipse(fromJD, latObs, lonObs, maxTries) {
  let jd = fromJD;
  for (let i = 0; i < maxTries; i++) {
    const nm = findNextNewMoon(jd);
    // raffina intorno al novilunio (±0.6 giorni, passo fine) cercando il minimo di separazione TOPOCENTRICA
    let bestJD = nm, bestSep = Infinity, bestEv = null;
    for (let dt = -0.8; dt <= 0.8; dt += 0.02) {
      const ev = eventAt(nm + dt, latObs, lonObs);
      if (ev.sep < bestSep) { bestSep = ev.sep; bestJD = nm + dt; bestEv = ev; }
    }
    if (bestEv.type !== 'nessuna' && bestEv.sunAlt > -0.5) return { jd: bestJD, ev: bestEv, visible: true };
    jd = nm + 20;
  }
  return null;
}

const P = { lat: 41.9, lon: 12.5, year: 2026, month: 8, day: 24, hour: 12, playing: false, speed: 10 }; // speed: minuti simulati al secondo
let last = 0, autoPlayT = 0;
let G = {}, gCanvas = [null, null, null], gCtx = [null, null, null], gTitle = [null, null, null];
let readout, stars = [];
let lastSearchMsg = '';

function dk() { return document.documentElement.dataset.theme !== 'light'; }
function pal() {
  const d = dk();
  return {
    bg: d ? '#050810' : '#e7edf4', txt: d ? 'rgba(225,238,250,0.96)' : 'rgba(20,40,70,0.95)',
    sub: d ? 'rgba(165,195,220,0.82)' : 'rgba(60,90,125,0.9)', accent: d ? '#00d4ff' : '#0a78b0',
    gBg: d ? 'rgb(3,9,22)' : '#eef2f7', gAxis: d ? 'rgba(100,155,210,0.3)' : 'rgba(40,80,130,0.32)', gText: d ? 'rgba(150,205,225,0.88)' : 'rgba(25,65,105,0.92)',
  };
}
let T = pal();
function initStars(n) { stars = []; for (let i = 0; i < n; i++) stars.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.1 + 0.2, a: Math.random() * 0.6 + 0.15 }); }

function currentJD() { return JD(P.year, P.month, P.day, P.hour); }

// ═══ Resa realistica ══════════════════════════════════════════════════════════
// Tutto ciò che segue è l'aspetto, non l'astronomia: posizioni, dimensioni angolari e copertura
// arrivano dalle effemeridi qui sopra. Fotosfera, corona e lembo lunare sono texture procedurali
// generate una volta sola.
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function hash(n) { const v = Math.sin(n * 127.1) * 43758.5453; return v - Math.floor(v); }
function noise1(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash(i) * (1 - u) + hash(i + 1) * u; }
function noise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const h = (a, b) => hash(a + b * 57.31);
  return (h(ix, iy) * (1 - ux) + h(ix + 1, iy) * ux) * (1 - uy) + (h(ix, iy + 1) * (1 - ux) + h(ix + 1, iy + 1) * ux) * uy;
}

// Fotosfera in luce bianca: oscuramento al bordo (più forte nel blu, quindi lembo più caldo),
// e granulazione fine.
const SUN_TEX_R = 280;
let sunTex = null;
function makeSunTexture() {
  const R = SUN_TEX_R, N = R * 2 + 4, c = document.createElement('canvas');
  c.width = c.height = N;
  const cx = c.getContext('2d'), img = cx.createImageData(N, N), d = img.data, o0 = N / 2;
  for (let y = 0, o = 0; y < N; y++) for (let x = 0; x < N; x++, o += 4) {
    const dx = (x + 0.5 - o0) / R, dy = (y + 0.5 - o0) / R, rho = Math.hypot(dx, dy);
    if (rho > 1 + 1 / R) continue;
    const mu = Math.sqrt(Math.max(0, 1 - rho * rho));
    const f = 1 + 0.05 * (noise2(x * 0.33, y * 0.33) - 0.5) + 0.035 * (noise2(x * 0.9, y * 0.9) - 0.5);
    d[o]     = 255 * (1 - 0.30 * (1 - mu)) * f;
    d[o + 1] = 247 * (1 - 0.44 * (1 - mu)) * f;
    d[o + 2] = 226 * (1 - 0.62 * (1 - mu)) * f;
    d[o + 3] = 255 * clamp((1 - rho) * R + 0.5, 0, 1);
  }
  cx.putImageData(img, 0, 0);
  sunTex = c;
}

// Corona, cromosfera e protuberanze. La luminosità della corona crolla con la distanza dal lembo
// (qui ~ρ⁻⁷, più lenta lungo i pennacchi); i raggi fini imitano le linee del campo magnetico.
const COR_R = 110, COR_N = 1024;
let coronaTex = null;
function makeCoronaTexture() {
  const N = COR_N, c = document.createElement('canvas');
  c.width = c.height = N;
  const cx = c.getContext('2d'), img = cx.createImageData(N, N), d = img.data, o0 = N / 2;
  const streamers = [[0.25, 0.9, 0.30], [1.9, 0.6, 0.22], [3.3, 1.0, 0.34], [4.4, 0.5, 0.20], [5.4, 0.75, 0.26]];
  const proms = [[0.9, 0.045], [2.6, 0.03], [3.9, 0.06], [5.6, 0.035]];
  const wrap = a => { a = Math.abs(a) % TWO; return a > Math.PI ? TWO - a : a; };
  for (let y = 0, o = 0; y < N; y++) for (let x = 0; x < N; x++, o += 4) {
    const dx = (x + 0.5 - o0) / COR_R, dy = (y + 0.5 - o0) / COR_R, rho = Math.hypot(dx, dy);
    if (rho < 0.9) continue;
    const th = Math.atan2(dy, dx) + Math.PI;
    let st = 0;
    for (const [a, amp, w] of streamers) { const q = wrap(th - a) / w; st += amp * Math.exp(-q * q); }
    const n = 6.8 - 3.0 * Math.min(st, 1.1);
    const rays = (0.72 + 0.56 * noise1(th * 38 + 3 * noise1(th * 7))) * (0.85 + 0.3 * noise1(th * 140 + 11));
    const rr = Math.max(rho, 1);
    const I = Math.pow(rr, -n) * (0.5 + 0.8 * st) * rays + 0.9 * Math.exp(-(rr - 1) * 14);
    const a = (1 - Math.exp(-I * 1.7)) * smooth(4.6, 3.4, rho);
    let pk = 0.85 * Math.exp(-(((rho - 1.004) / 0.008) ** 2));
    for (const [pa, h] of proms) { const q = wrap(th - pa) / 0.05; pk += Math.exp(-q * q) * Math.exp(-Math.max(0, rho - 1) / h) * (rho > 0.99 ? 1 : 0); }
    pk = Math.min(1, pk);
    const t = a + pk;
    if (t <= 0.002) continue;
    d[o]     = (236 * a + 255 * pk) / t;
    d[o + 1] = (242 * a + 70 * pk) / t;
    d[o + 2] = (255 * a + 115 * pk) / t;
    d[o + 3] = 255 * Math.min(1, t);
  }
  cx.putImageData(img, 0, 0);
  coronaTex = c;
}

// Luce cinerea: alla totalità la faccia della Luna è debolmente rischiarata dalla Terra.
// Usa la mappa reale del lab «La Luna», se caricata.
const MOON_TEX_R = 150;
let moonTex = null;
function makeMoonTexture() {
  if (typeof MOON_TEXTURE === 'undefined') return;
  const im = new Image();
  im.onload = () => {
    const src = document.createElement('canvas'); src.width = im.naturalWidth; src.height = im.naturalHeight;
    const sc = src.getContext('2d'); sc.drawImage(im, 0, 0);
    const tw = src.width, th = src.height, tex = sc.getImageData(0, 0, tw, th).data;
    const R = MOON_TEX_R, N = R * 2, c = document.createElement('canvas'); c.width = c.height = N;
    const cx = c.getContext('2d'), img = cx.createImageData(N, N), d = img.data;
    for (let y = 0, o = 0; y < N; y++) for (let x = 0; x < N; x++, o += 4) {
      const vx = (x + 0.5 - R) / R, vy = -(y + 0.5 - R) / R, r2 = vx * vx + vy * vy;
      if (r2 >= 1) continue;
      const vz = Math.sqrt(1 - r2);
      const u = Math.min(tw - 1, ((Math.atan2(vx, vz) / TWO + 0.5) * tw) | 0);
      const v = Math.min(th - 1, ((0.5 - Math.asin(vy) / Math.PI) * th) | 0);
      const g = tex[(v * tw + u) * 4];
      d[o] = g * 0.62; d[o + 1] = g * 0.72; d[o + 2] = g * 0.95; d[o + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    moonTex = c;
  };
  im.src = MOON_TEXTURE;
}

// Profilo del lembo lunare: monti e valli (esagerati di poco) fanno filtrare la luce in punti
// separati poco prima della totalità — i grani di Baily.
const LIMB = [];
for (let i = 0; i < 720; i++) {
  const a = i / 720 * TWO;
  let v = 0;
  for (let k = 1; k <= 9; k++) v += Math.sin(a * (5 + k * 9.7) + hash(k) * TWO) / k;
  LIMB.push(0.0009 * v);
}
function moonPath(ctx, mx, my, R) {
  ctx.beginPath();
  for (let i = 0; i < LIMB.length; i++) {
    const a = i / LIMB.length * TWO, r = R * (1 + LIMB[i]);
    const x = mx + Math.cos(a) * r, y = my + Math.sin(a) * r;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}

// Colore del cielo: dipende dall'altezza del Sole (giorno/crepuscolo/notte) e da quanta
// fotosfera resta scoperta. L'occhio si adatta, quindi il cielo scurisce davvero solo negli
// ultimi minuti: `k` segue il logaritmo della frazione visibile (1 = pieno giorno, 0 = totalità).
function skyRGB(sunAlt, k) {
  let r, g, b;
  if (sunAlt > 10) { r = 62; g = 136; b = 226; }
  else if (sunAlt > -2) { const q = (sunAlt + 2) / 12; r = 250 - q * 188; g = 122 + q * 14; b = 92 + q * 134; }
  else if (sunAlt > -12) { const q = (sunAlt + 12) / 10; r = 8 + q * 92; g = 8 + q * 84; b = 30 + q * 60; }
  else { r = 4; g = 6; b = 14; }
  const kk = Math.pow(k, 1.4);
  return [r * kk + 8 * (1 - kk), g * kk + 12 * (1 - kk), b * kk + 28 * (1 - kk)];
}

function draw(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = canvas.width / (canvas.clientWidth || canvas.width);
  const W = canvas.width / dpr, H = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  T = pal();
  const jd = currentJD();
  const ev = eventAt(jd, P.lat, P.lon);
  const up = ev.sunAlt >= -0.5;

  const vis = up ? 1 - ev.coverage : 1;                                 // fotosfera ancora scoperta
  const k = vis <= 0 ? 0 : clamp((Math.log10(Math.max(vis, 1e-4)) + 4) / 4, 0, 1);
  const tot = up ? 1 - smooth(0, 0.004, vis) : 0;                       // 1 = totalità piena
  const sky = skyRGB(ev.sunAlt, k);
  const skyCss = `rgb(${sky[0] | 0},${sky[1] | 0},${sky[2] | 0})`;
  ctx.fillStyle = skyCss; ctx.fillRect(0, 0, W, H);

  // stelle e pianeti: di notte, oppure le più brillanti durante la totalità
  const night = clamp((5 - ev.sunAlt) / 20, 0, 1), starA = Math.max(night, (1 - k) * 0.9);
  if (starA > 0.02) {
    ctx.fillStyle = '#ffffff';
    for (const st of stars) {
      if (night < 0.5 && st.a < 0.5) continue;
      ctx.globalAlpha = starA * st.a; ctx.beginPath(); ctx.arc(st.x * W, st.y * H, st.r, 0, TWO); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // scala angolare fissa: il Sole mantiene la sua dimensione apparente reale (cambia di ±1,7%
  // nell'anno), la Luna cambia molto di più fra perigeo e apogeo
  const cx = W * 0.5, cy = H * 0.5;
  const S = Math.min(W, H) * 0.2 / 0.2666;                              // px per grado
  const sunPxR = ev.sunR * S, moonPxR = ev.moonR * S;
  const mx = cx + ev.vx * S, my = cy - ev.vy * S;

  if (!up) {
    ctx.fillStyle = '#dfe6f0'; ctx.font = '12px "Space Mono",monospace'; ctx.textAlign = 'center';
    ctx.fillText('il Sole è sotto l\'orizzonte in questo momento — l\'eclissi non è osservabile da qui', cx, cy);
  } else {
    // corona, cromosfera e protuberanze: visibili solo quando la fotosfera è (quasi) sparita
    if (tot > 0.01 && coronaTex) {
      const cs = COR_N * sunPxR / COR_R;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = tot;
      ctx.drawImage(coronaTex, cx - cs / 2, cy - cs / 2, cs, cs);
      ctx.restore();
    }

    // fotosfera, arrossata dall'atmosfera quando il Sole è basso
    if (sunTex) {
      const ss = sunTex.width * sunPxR / SUN_TEX_R;
      ctx.drawImage(sunTex, cx - ss / 2, cy - ss / 2, ss, ss);
      const low = clamp((14 - ev.sunAlt) / 14, 0, 1);
      if (low > 0) {
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, sunPxR, 0, TWO); ctx.clip();
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = `rgb(255,${255 - low * 105 | 0},${255 - low * 190 | 0})`;
        ctx.fillRect(cx - sunPxR, cy - sunPxR, sunPxR * 2, sunPxR * 2);
        ctx.restore();
      }
    }

    // Luna: al novilunio ci mostra il lato in ombra, quindi contro il cielo non si distingue.
    // Ha il colore del cielo e si nota solo perché nasconde Sole e corona.
    if (ev.sep < ev.sunR + ev.moonR + 2.5) {
      ctx.save();
      moonPath(ctx, mx, my, moonPxR);
      ctx.fillStyle = skyCss; ctx.fill();
      if (tot > 0.05 && moonTex) {                                       // luce cinerea
        ctx.clip();
        ctx.globalAlpha = 0.14 * tot;
        ctx.drawImage(moonTex, mx - moonPxR, my - moonPxR, moonPxR * 2, moonPxR * 2);
      }
      ctx.restore();
    }

    // bagliore: la fotosfera abbaglia e l'atmosfera diffonde la luce attorno al disco
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // (è un velo davanti a tutto: schiarisce anche la parte di cielo occupata dalla Luna)
    const glOut = sunPxR * (1.7 + 2.3 * k);
    const gl = ctx.createRadialGradient(cx, cy, 0, cx, cy, glOut);
    gl.addColorStop(0, `rgba(255,246,225,${0.3 * k})`);
    gl.addColorStop(sunPxR / glOut, `rgba(255,246,225,${0.3 * k})`);
    gl.addColorStop(1, 'rgba(255,246,225,0)');
    ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H);

    // anello di diamante: l'ultimo (o il primo) frammento di fotosfera, a ridosso della totalità
    if (vis > 0 && vis < 0.004 && ev.moonR >= ev.sunR * 0.985) {
      const dd = Math.hypot(cx - mx, cy - my) || 1;
      const px = cx + (cx - mx) / dd * sunPxR, py = cy + (cy - my) / dd * sunPxR;
      const a = smooth(0.004, 0.0015, vis) * Math.sqrt(clamp(vis / 0.00002, 0, 1));
      const gr = sunPxR * (0.2 + 0.5 * Math.sqrt(vis / 0.004));
      const dg = ctx.createRadialGradient(px, py, 0, px, py, gr);
      dg.addColorStop(0, `rgba(255,255,250,${a})`);
      dg.addColorStop(0.25, `rgba(255,250,235,${0.55 * a})`);
      dg.addColorStop(1, 'rgba(255,250,235,0)');
      ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(px, py, gr, 0, TWO); ctx.fill();
      ctx.strokeStyle = `rgba(255,255,250,${0.5 * a})`; ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const an = i * Math.PI / 4 + 0.3;
        ctx.beginPath();
        ctx.moveTo(px - Math.cos(an) * gr * 1.5, py - Math.sin(an) * gr * 1.5);
        ctx.lineTo(px + Math.cos(an) * gr * 1.5, py + Math.sin(an) * gr * 1.5);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // il canvas dipinge un vero cielo (blu di giorno, scuro di notte) indipendente dal tema del sito:
  // il testo usa quindi uno stile a contrasto fisso (bianco + ombra scura), non i colori del tema
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 4;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff'; ctx.font = 'bold 14px "Space Mono",monospace';
  const phaseTxt = !up ? 'Sole sotto l\'orizzonte' : ev.type === 'nessuna' ? 'nessuna eclissi in corso'
    : ev.type === 'totale' ? 'TOTALITÀ' : ev.type === 'anulare' ? 'FASE ANULARE' : 'fase parziale';
  ctx.fillText('Eclissi di Sole — ' + phaseTxt, 14, 22);
  ctx.fillStyle = '#f0f4fa'; ctx.font = '10px "Space Mono",monospace';
  const d = jdToYMDH(jd);
  const hh = Math.floor(d.h), mm = Math.floor((d.h - hh) * 60), ss2 = Math.floor(((d.h - hh) * 60 - mm) * 60);
  const pad = v => String(v).padStart(2, '0');
  ctx.fillText(`${d.y}-${pad(d.m)}-${pad(Math.floor(d.d))}  ${pad(hh)}:${pad(mm)}:${pad(ss2)} UT   lat ${Lab.fmt(P.lat,1)}°  lon ${Lab.fmt(P.lon,1)}°   copertura ${Lab.fmt((ev.coverage * 100),1)}%`, 14, 40);
  ctx.textAlign = 'right';
  ctx.fillText('vista dell\'osservatore · zenit in alto', W - 14, 22);
  ctx.fillStyle = '#dfe6f0'; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText(`separazione Sole–Luna: ${Lab.fmt(ev.sep,3)}°   raggio ang. Sole: ${Lab.fmt(ev.sunR,3)}°   raggio ang. Luna: ${Lab.fmt(ev.moonR,3)}° (dist. ${Lab.fmt(ev.moonDistTopo,0)} km)`, cx, H - 8);
  ctx.restore();
  return ev;
}

// Istante di massima eclissi (minima separazione con il Sole sopra l'orizzonte) attorno a jd0
function findMaxEclipse(jd0, latObs, lonObs) {
  let best = null;
  const scan = (from, to, step) => {
    for (let t = from; t <= to; t += step) {
      const ev = eventAt(t, latObs, lonObs);
      if (ev.sunAlt > -0.5 && (!best || ev.sep < best.sep)) best = { jd: t, sep: ev.sep };
    }
  };
  scan(jd0 - 0.75, jd0 + 0.75, 2 / 1440);
  if (!best) return null;
  scan(best.jd - 3 / 1440, best.jd + 3 / 1440, 5 / 86400);
  return best.jd;
}
function jumpToJD(jd) {
  const d = jdToYMDH(jd);
  P.year = d.y; P.month = d.m; P.day = Math.floor(d.d); P.hour = Math.round(d.h * 3600) / 3600;
}

// Eclissi notevoli, viste da un luogo sulla linea centrale
const PRESETS = [
  ['11 ago 1999 · totale · Stoccarda', 1999, 8, 11, 48.78, 9.18],
  ['14 ott 2023 · anulare · Albuquerque', 2023, 10, 14, 35.08, -106.65],
  ['8 apr 2024 · totale · Dallas', 2024, 4, 8, 32.78, -96.80],
  ['12 ago 2026 · totale · Burgos', 2026, 8, 12, 42.34, -3.70],
  ['2 ago 2027 · totale · Tarifa', 2027, 8, 2, 36.01, -5.60],
  ['2 ago 2027 · totale · Luxor', 2027, 8, 2, 25.69, 32.64],
];

// ═══ Grafici: tre curve statiche sull'intera giornata scelta (0-24h UT), con marcatore mobile ═══
function dayCurve() {
  const jd0 = JD(P.year, P.month, P.day, 0);
  const pts = [];
  for (let k = 0; k <= 144; k++) { const h = k / 144 * 24; pts.push({ h, ev: eventAt(jd0 + h / 24, P.lat, P.lon) }); }
  return pts;
}
// ora UT del giorno scelto: asse comune ai tre grafici, con la linea dell'istante attuale
const HX = { xr: [0, 24], xStep: 3, xLabel: 'ora UT' };
function nowLine(ctx, f) { ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = f.C.text; ctx.beginPath(); ctx.moveTo(f.X(P.hour), f.T); ctx.lineTo(f.X(P.hour), f.B); ctx.stroke(); ctx.restore(); }
// 1: altezza sull'orizzonte di Sole e Luna nel corso del giorno
function drawGraphAltitudes(pts) {
  const g = Lab.panel(gCanvas[0], { ...HX, title: 'Altezza sull’orizzonte (°)', yr: [-90, 90], yStep: 30 });
  if (!g) return; const [ctx, f] = g;
  ctx.fillStyle = f.C.light ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)'; ctx.fillRect(f.L, f.Y(0), f.R - f.L, f.B - f.Y(0));
  nowLine(ctx, f);
  Lab.plotPts(ctx, f, pts.map(p => [p.h, p.ev.sunAlt]), '#ffb400', 2);
  Lab.plotPts(ctx, f, pts.map(p => [p.h, p.ev.moonAlt]), '#9fb4ff', 1.6);
  Lab.legend(ctx, f.L + 8, f.T + 8, [['#ffb400', 'Sole'], ['#9fb4ff', 'Luna']]);
}
// 2: distanza angolare fra i centri: c'è eclissi quando scende sotto la somma dei raggi apparenti (~0,5°)
function drawGraphSeparation(pts) {
  const g = Lab.panel(gCanvas[1], { ...HX, title: 'Distanza angolare Sole–Luna (°)', yr: [0, 15], yStep: 3 });
  if (!g) return; const [ctx, f] = g;
  ctx.fillStyle = 'rgba(255,157,77,0.18)'; ctx.fillRect(f.L, f.Y(0.53), f.R - f.L, f.B - f.Y(0.53));
  nowLine(ctx, f);
  Lab.plotPts(ctx, f, pts.map(p => [p.h, p.ev.sep]), '#4dff9d', 2);
  ctx.fillStyle = f.C.text; ctx.font = '9.5px "DM Sans",sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillText('sotto ~0,5°: i dischi si sovrappongono', f.R - 4, f.T + 8);
}
// 3: frazione del disco solare coperta dalla Luna
function drawGraphCoverage(pts) {
  const g = Lab.panel(gCanvas[2], { ...HX, title: 'Copertura del disco solare (%)', yr: [0, 100], yStep: 25 });
  if (!g) return; const [ctx, f] = g;
  nowLine(ctx, f);
  Lab.plotPts(ctx, f, pts.map(p => [p.h, p.ev.coverage * 100]), '#ff9d4d', 2);
}
function drawGraphs() {
  const pts = dayCurve();
  drawGraphAltitudes(pts); drawGraphSeparation(pts); drawGraphCoverage(pts);
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
let sliderRefs = {};
function buildControls() {
  const cont = document.getElementById('controls'); cont.innerHTML = '';

  const so = Lab.Section('Osservatore'); cont.appendChild(so.el);
  sliderRefs.lat = Lab.SliderInput({ label: 'Latitudine', min: -90, max: 90, step: 0.1, value: P.lat, unit: '°', onChange(v) { P.lat = v; } });
  so.add(sliderRefs.lat);
  sliderRefs.lon = Lab.SliderInput({ label: 'Longitudine', min: -180, max: 180, step: 0.1, value: P.lon, unit: '°', onChange(v) { P.lon = v; } });
  so.add(sliderRefs.lon);

  const sd = Lab.Section('Data e ora (UT)'); cont.appendChild(sd.el);
  sliderRefs.year = Lab.SliderInput({ label: 'Anno', min: 1980, max: 2080, step: 1, value: P.year, onChange(v) { P.year = v; } });
  sd.add(sliderRefs.year);
  sliderRefs.month = Lab.SliderInput({ label: 'Mese', min: 1, max: 12, step: 1, value: P.month, onChange(v) { P.month = v; } });
  sd.add(sliderRefs.month);
  sliderRefs.day = Lab.SliderInput({ label: 'Giorno', min: 1, max: 31, step: 1, value: P.day, onChange(v) { P.day = v; } });
  sd.add(sliderRefs.day);
  sliderRefs.hour = Lab.SliderInput({ label: 'Ora', min: 0, max: 24, step: 0.01, value: P.hour, unit: 'h', onChange(v) { P.hour = v; } });
  sd.add(sliderRefs.hour);
  sd.add(Lab.Toggle({ label: 'Anima (avanza l\'ora)', value: P.playing, onChange(v) { P.playing = v; } }));
  sliderRefs.speed = Lab.Slider({ label: 'Velocità animazione', min: 0.5, max: 120, step: 0.5, value: P.speed, unit: ' min/s', onChange(v) { P.speed = v; } });
  sd.add(sliderRefs.speed);

  const sm = Lab.Section('Momento migliore'); cont.appendChild(sm.el);
  const bMax = document.createElement('button'); bMax.className = 'ctrl-btn'; bMax.textContent = 'Vai al massimo dell\'eclissi';
  bMax.addEventListener('click', () => {
    const jm = findMaxEclipse(JD(P.year, P.month, P.day, 12), P.lat, P.lon);
    if (jm !== null) { jumpToJD(jm); buildControls(); }
  });
  sm.add(bMax);
  const tip = document.createElement('div');
  tip.style.cssText = 'font-size:10px;color:var(--text-hint);margin:8px 0 4px;line-height:1.6;';
  tip.textContent = 'La totalità dura pochi minuti: per vederla bene abbassa la velocità a 0,5–1 min/s.';
  sm.add(tip);

  const sp = Lab.Section('Eclissi notevoli'); cont.appendChild(sp.el);
  for (const [name, y, mo, dd, la, lo] of PRESETS) {
    const b = document.createElement('button'); b.className = 'ctrl-btn'; b.textContent = name;
    b.style.cssText = 'display:block;width:100%;margin-bottom:6px;text-align:left;';
    b.addEventListener('click', () => {
      P.lat = la; P.lon = lo; P.year = y; P.month = mo; P.day = dd; P.hour = 12;
      const jm = findMaxEclipse(JD(y, mo, dd, 12), la, lo);
      if (jm !== null) jumpToJD(jm);
      buildControls();
    });
    sp.add(b);
  }

  const se = Lab.Section('Prossima eclissi'); cont.appendChild(se.el);
  const bFind = document.createElement('button'); bFind.className = 'ctrl-btn'; bFind.textContent = 'Trova la prossima eclissi qui';
  bFind.addEventListener('click', () => {
    const res = findNextVisibleEclipse(currentJD(), P.lat, P.lon, 40);
    if (res) {
      const d = jdToYMDH(res.jd);
      P.year = d.y; P.month = d.m; P.day = Math.floor(d.d); P.hour = Math.round(d.h * 100) / 100;
      lastSearchMsg = `${d.y}-${String(d.m).padStart(2, '0')}-${String(Math.floor(d.d)).padStart(2, '0')} ${Lab.fmt(d.h,1)}h UT — eclissi ${res.ev.type} (copertura ${Lab.fmt((res.ev.coverage * 100),0)}%)`;
    } else {
      lastSearchMsg = 'nessuna eclissi trovata da qui nell\'orizzonte di ricerca';
    }
    buildControls();
  });
  se.add(bFind);
  const msg = document.createElement('div');
  msg.style.cssText = 'font-family:"Space Mono",monospace;font-size:10px;color:var(--accent);margin-top:8px;line-height:1.5;';
  msg.textContent = lastSearchMsg || 'premi il pulsante per cercare in avanti dalla data corrente';
  se.add(msg);
}

function buildReadout() {
  const cont = document.getElementById('readout'); cont.innerHTML = '';
  readout = new Lab.Readout(cont, [
    { key: 'data', label: 'data e ora (UT)' },
    { key: 'tipo', label: 'tipo di eclissi' },
    { key: 'copertura', label: 'copertura del Sole' },
    { key: 'sep', label: 'distanza angolare Sole–Luna' },
    { key: 'altSole', label: 'altezza del Sole' },
    { key: 'distLuna', label: 'distanza della Luna' },
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
  initStars(160);
  makeSunTexture(); makeCoronaTexture(); makeMoonTexture();
  buildControls(); initGraphs(); buildReadout();
  // apertura: cerca subito la prossima eclissi dalla posizione/data di default, così il primo
  // impatto del lab risponde già a "quando sarà la prossima eclissi" senza dover cliccare nulla
  const first = findNextVisibleEclipse(currentJD(), P.lat, P.lon, 40);
  if (first) {
    const d = jdToYMDH(first.jd);
    P.year = d.y; P.month = d.m; P.day = Math.floor(d.d); P.hour = Math.round(d.h * 100) / 100;
    lastSearchMsg = `${d.y}-${String(d.m).padStart(2, '0')}-${String(Math.floor(d.d)).padStart(2, '0')} ${Lab.fmt(d.h,1)}h UT — eclissi ${first.ev.type} (copertura ${Lab.fmt((first.ev.coverage * 100),0)}%)`;
    buildControls();
  }

  const simCanvas = document.getElementById('simCanvas');
  const btnPlay = document.getElementById('btnPlay');
  function syncPlay() { btnPlay.textContent = P.playing ? '⏸  PAUSA' : '▶  ANIMA'; }
  syncPlay();
  btnPlay.addEventListener('click', () => { P.playing = !P.playing; syncPlay(); buildControls(); });
  document.getElementById('btnReset').addEventListener('click', () => {
    P.lat = 41.9; P.lon = 12.5; P.playing = false; P.speed = 10;
    const now = new Date();
    P.year = now.getUTCFullYear(); P.month = now.getUTCMonth() + 1; P.day = now.getUTCDate(); P.hour = now.getUTCHours() + now.getUTCMinutes() / 60;
    lastSearchMsg = '';
    buildControls(); syncPlay();
  });

  function resize() {
    const area = document.querySelector('.lab-canvas-area'); if (!area) return;
    const ar = area.getBoundingClientRect();
    const rb = document.getElementById('readout').getBoundingClientRect();
    const ga = document.getElementById('graphArea'); const gaH = ga ? ga.offsetHeight : 0;
    const h = Math.max(240, Math.floor(ar.height - rb.height - gaH - 4));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    Lab.hidpi(simCanvas, Math.floor(ar.width), h);
    Lab.fitPanels(gCanvas);
  }
  resize();
  new ResizeObserver(resize).observe(document.querySelector('.lab-canvas-area'));
  window.addEventListener('load', resize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);

  last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000; last = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0; dt = Math.min(dt, 0.05);
    if (P.playing) {
      P.hour += dt * P.speed / 60;
      if (P.hour >= 24) { P.hour -= 24; P.day += 1; }
      if (sliderRefs.hour) sliderRefs.hour.setValue(P.hour);
      if (sliderRefs.day) sliderRefs.day.setValue(P.day);
    }
    try {
      const ev = draw(simCanvas); drawGraphs();
      const d = jdToYMDH(currentJD());
      readout.set('data', `${String(Math.floor(d.d)).padStart(2, '0')}/${String(d.m).padStart(2, '0')}/${d.y} ${String(Math.floor(d.h)).padStart(2, '0')}:${String(Math.floor((d.h % 1) * 60)).padStart(2, '0')}`);
      readout.set('tipo', ev.type);
      readout.set('copertura', Lab.fmt(ev.coverage * 100, 1) + ' %');
      readout.set('sep', Lab.fmt(ev.sep, 3) + '°');
      readout.set('altSole', Lab.fmt(ev.sunAlt, 1) + '°');
      readout.set('distLuna', Lab.fmt(ev.moonDistTopo, 0) + ' km');
    } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
