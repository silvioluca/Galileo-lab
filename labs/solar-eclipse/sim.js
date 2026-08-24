'use strict';

// ═══ Effemeridi reali di Sole e Luna ══════════════════════════════════════════
// Formule standard di Jean Meeus ("Astronomical Algorithms"): Sole a bassa precisione (cap. 25,
// ~0.01°) e Luna con gli elementi medi ESATTI (cap. 47) più i termini periodici di ampiezza
// maggiore (evezione, variazione, equazione annua, ...) — non l'intera serie ELP2000 (che ne ha
// centinaia), ma un troncamento ai ~16+8+10 termini dominanti. Validato in uno script Node
// separato PRIMA di scrivere questo file, confrontando la separazione Sole-Luna calcolata contro
// 5 eclissi solari reali note (14 ott 2023, 8 apr 2024, 12 ago 2026, 6 feb 2027, 2 ago 2027):
// scarto <0.1° in longitudine eclittica in tutti i casi — coerente con un vero allineamento.
// Precisione dichiarata: dell'ordine di minuti d'arco/qualche ora sul momento esatto — sufficiente
// per mostrare la geometria e stimare bene la prossima eclissi, non sostituisce le effemeridi
// ufficiali (NASA/IMCCE) per la pianificazione di un viaggio di osservazione.
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
const LON_TERMS = [
  [6.288774, 0, 0, 1, 0], [1.274027, 2, 0, -1, 0], [0.658314, 2, 0, 0, 0], [0.213618, 0, 0, 2, 0],
  [-0.185116, 0, 1, 0, 0], [-0.114332, 0, 0, 0, 2], [0.058793, 2, 0, -2, 0], [0.057066, 2, -1, -1, 0],
  [0.053322, 2, 0, 1, 0], [0.045758, 2, -1, 0, 0], [-0.040923, 0, 1, -1, 0], [-0.034720, 1, 0, 0, 0],
  [-0.030383, 0, 1, 1, 0], [0.015327, 2, 0, -2, 0], [-0.012528, 0, 0, 1, 2], [0.010980, 0, 0, 1, -2],
];
const LAT_TERMS = [
  [5.128122, 0, 0, 0, 1], [0.280602, 0, 0, 1, 1], [0.277693, 0, 0, 1, -1], [0.173237, 2, 0, 0, -1],
  [0.055413, 2, 0, -1, 1], [0.046271, 2, 0, -1, -1], [0.032573, 2, 0, 0, 1], [0.017198, 0, 0, 2, 1],
];
const DIST_TERMS = [
  [-20905.355, 0, 0, 1, 0], [-3699.111, 2, 0, -1, 0], [-2955.968, 2, 0, 0, 0], [-569.925, 0, 0, 2, 0],
  [48.888, 0, 1, 0, 0], [-3.149, 0, 0, 0, 2], [246.158, 2, 0, -2, 0], [-152.138, 2, -1, -1, 0],
  [-170.733, 2, 0, 1, 0], [-204.586, 2, -1, 0, 0],
];
function moonPos(jd) {
  const T = (jd - 2451545.0) / 36525;
  const { Lp, D, M, Mp, F } = moonMeanElements(T);
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  const Efac = m => m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E;
  let sumL = 0, sumB = 0, sumR = 0;
  for (const [c, d, m, mp, f] of LON_TERMS) sumL += c * Efac(m) * sin(d * D + m * M + mp * Mp + f * F);
  for (const [c, d, m, mp, f] of LAT_TERMS) sumB += c * Efac(m) * sin(d * D + m * M + mp * Mp + f * F);
  for (const [c, d, m, mp, f] of DIST_TERMS) sumR += c * Efac(m) * cos(d * D + m * M + mp * Mp + f * F);
  return { lon: norm360(Lp + sumL), lat: sumB, dist: 385000.56 + sumR, D };
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
// correzione topocentrica rigorosa (Terra sferica, dichiarato: l'ellitticità reale sposta il
// risultato di al più qualche arcosecondo, trascurabile per questa visualizzazione) in coordinate
// rettangolari equatoriali: unico modo pulito per non sbagliare segni nella parallasse
function topocentric(ra, dec, distKm, jd, lonObs, latObs) {
  const distER = distKm / 6378.14; // raggi terrestri
  const lst = norm360(gmst(jd) + lonObs);
  const x = distER * cos(dec) * cos(ra), y = distER * cos(dec) * sin(ra), z = distER * sin(dec);
  const x0 = cos(latObs) * cos(lst), y0 = cos(latObs) * sin(lst), z0 = sin(latObs);
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
  const T = (jd - 2451545.0) / 36525, eps = obliquity(T);
  const sp = sunPos(jd), mp = moonPos(jd);
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
  const coverage = coverageFraction(sunR, moonR, sep);
  let type = 'nessuna';
  if (sep < sunR + moonR) {
    if (sep < Math.abs(moonR - sunR)) type = moonR >= sunR ? 'totale' : 'anulare';
    else type = 'parziale';
  }
  return { sunEq, moonEq: { ra: moonTopo.ra, dec: moonTopo.dec }, sunAlt: sunAlt.alt, moonAlt: moonAlt.alt, sep, sunR, moonR, dx, dy, coverage, type, moonDistTopo: moonTopo.dist, sunDistKm };
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

const P = { lat: 41.9, lon: 12.5, year: 2026, month: 8, day: 24, hour: 12, playing: false, speed: 1 };
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

// colore del cielo: dipende dall'altezza del Sole (giorno/crepuscolo/notte) E dalla copertura
// dell'eclissi (oscuramento marcato solo vicino alla totalità, come nella realtà — un'eclissi
// all'80% di copertura schiarisce a malapena il cielo, l'effetto drammatico è solo table oltre il ~95%)
function skyColor(sunAlt, coverage) {
  let r, g, b;
  if (sunAlt > 10) { r = 60; g = 140; b = 235; }
  else if (sunAlt > -2) { const k = (sunAlt + 2) / 12; r = 255 - k * (255 - 60); g = 140 - k * 0 + k * 0; g = 120 + k * 20; b = 90 + k * 145; }
  else if (sunAlt > -12) { const k = (sunAlt + 12) / 10; r = 10 + k * 245 * 0 + k * 90 * 0; r = 8 + k * 92; g = 8 + k * 84; b = 30 + k * 60; }
  else { r = 4; g = 6; b = 14; }
  const dark = Math.pow(clamp(coverage, 0, 1), 5);
  r = r * (1 - dark * 0.93) + 4 * dark * 0.93;
  g = g * (1 - dark * 0.93) + 5 * dark * 0.93;
  b = b * (1 - dark * 0.93) + 12 * dark * 0.93;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function draw(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  T = pal();
  const jd = currentJD();
  const ev = eventAt(jd, P.lat, P.lon);

  ctx.fillStyle = skyColor(ev.sunAlt, ev.coverage); ctx.fillRect(0, 0, W, H);
  if (ev.sunAlt < 5) {
    const starAlpha = clamp((5 - ev.sunAlt) / 20, 0, 1) * (dk() ? 1 : 0.4);
    ctx.fillStyle = dk() ? 'rgba(255,255,255,0.9)' : 'rgba(20,30,60,0.5)';
    for (const s of stars) { ctx.globalAlpha = starAlpha * s.a; ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, TWO); ctx.fill(); }
    ctx.globalAlpha = 1;
  }

  const cx = W * 0.5, cy = H * 0.52;
  const maxR = Math.max(ev.sunR, ev.moonR);
  const S = Math.min(W, H) * 0.34 / maxR; // px per grado, autofit sulla dimensione angolare corrente

  if (ev.sunAlt < -0.5) {
    ctx.fillStyle = '#dfe6f0'; ctx.font = '12px "Space Mono",monospace'; ctx.textAlign = 'center';
    ctx.fillText('il Sole è sotto l\'orizzonte in questo momento — l\'eclissi non è osservabile da qui', cx, cy);
  } else {
    const sunPxR = ev.sunR * S;

    // alone/bagliore atmosferico: sempre presente attorno al Sole (com'è nella realtà, un disco
    // luminoso non ha mai un bordo netto contro il cielo), molto più intenso e bianco vicino alla
    // totalità — dove diventa la corona visibile a occhio nudo attorno al disco nero della Luna
    const haloK = clamp((ev.coverage - 0.9) / 0.1, 0, 1);
    const haloR = sunPxR * (1.5 + haloK * 1.6);
    const halo = ctx.createRadialGradient(cx, cy, sunPxR * 0.9, cx, cy, haloR);
    halo.addColorStop(0, `rgba(255,${230 + haloK * 20 | 0},${190 + haloK * 60 | 0},${0.55 + haloK * 0.35})`);
    halo.addColorStop(1, 'rgba(255,235,200,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, haloR, 0, TWO); ctx.fill();

    // Sole: oscuramento al lembo più marcato + granulazione (macchie soffuse, posizioni fisse così
    // non tremolano da un frame all'altro — solo la texture superficiale, non la fisica, è decorativa)
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, sunPxR, 0, TWO); ctx.clip();
    const sg = ctx.createRadialGradient(cx, cy, 0, cx, cy, sunPxR);
    sg.addColorStop(0, '#fffbf0'); sg.addColorStop(0.55, '#ffe9a8'); sg.addColorStop(0.82, '#ffc24d'); sg.addColorStop(1, '#e8791f');
    ctx.fillStyle = sg; ctx.fillRect(cx - sunPxR, cy - sunPxR, sunPxR * 2, sunPxR * 2);
    for (let i = 0; i < 22; i++) {
      const a = (i * 2.399963) % TWO, rf = 0.1 + 0.8 * ((i * 0.6180339887) % 1);
      const gx = cx + Math.cos(a) * rf * sunPxR, gy = cy + Math.sin(a) * rf * sunPxR;
      const gr = sunPxR * (0.1 + 0.11 * ((i * 0.37) % 1));
      const dark = i % 3 !== 0;
      const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
      gg.addColorStop(0, dark ? 'rgba(180,90,10,0.16)' : 'rgba(255,255,235,0.16)');
      gg.addColorStop(1, 'rgba(180,90,10,0)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(gx, gy, gr, 0, TWO); ctx.fill();
    }
    ctx.restore();

    // Luna: NON è visibile di per sé contro il cielo (novilunio, lato in ombra verso di noi) — si
    // vede SOLO come la parte del disco solare che copre, quindi il disco scuro va disegnato con un
    // clip sul disco del Sole: fuori da quel bordo semplicemente non esiste nulla da mostrare
    const mx = cx + ev.dx * S, my = cy - ev.dy * S;
    const moonPxR = ev.moonR * S;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, sunPxR, 0, TWO); ctx.clip();
    const mg = ctx.createRadialGradient(mx - moonPxR * 0.3, my - moonPxR * 0.3, moonPxR * 0.1, mx, my, moonPxR);
    mg.addColorStop(0, '#1c1c22'); mg.addColorStop(1, '#020203');
    ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, moonPxR, 0, TWO); ctx.fill();
    ctx.restore();
  }

  // il canvas dipinge un vero cielo (blu di giorno, scuro di notte) indipendente dal tema del sito:
  // il testo usa quindi uno stile a contrasto fisso (bianco + ombra scura), non i colori del tema,
  // altrimenti in tema chiaro il testo diventa illeggibile su un cielo diurno altrettanto chiaro
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 4;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff'; ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.fillText('Eclissi di Sole — transito reale da coordinate e data scelte', 14, 22);
  ctx.fillStyle = '#f0f4fa'; ctx.font = '10px "Space Mono",monospace';
  const d = jdToYMDH(jd);
  ctx.fillText(`${d.y}-${String(d.m).padStart(2, '0')}-${String(Math.floor(d.d)).padStart(2, '0')} ${d.h.toFixed(1)}h UT   lat=${P.lat.toFixed(1)}° lon=${P.lon.toFixed(1)}°   tipo: ${ev.type}   copertura: ${(ev.coverage * 100).toFixed(1)}%`, 14, 40);
  ctx.fillStyle = '#dfe6f0'; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText(`separazione angolare Sole-Luna: ${ev.sep.toFixed(3)}°   raggio ang. Sole: ${ev.sunR.toFixed(3)}°   raggio ang. Luna: ${ev.moonR.toFixed(3)}° (dist. ${ev.moonDistTopo.toFixed(0)}km)`, cx, H - 8);
  ctx.restore();
  return ev;
}

// ═══ Grafici: tre curve statiche sull'intera giornata scelta (0-24h UT), con marcatore mobile ═══
function gBase(ctx, W, H, PAD) {
  ctx.fillStyle = T.gBg; ctx.fillRect(0, 0, W, H);
  const gW = W - PAD.l - PAD.r, gH = H - PAD.t - PAD.b;
  ctx.strokeStyle = T.gAxis; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(PAD.l, PAD.t); ctx.lineTo(PAD.l, PAD.t + gH); ctx.lineTo(PAD.l + gW, PAD.t + gH); ctx.stroke();
  return { gW, gH };
}
function dayCurve() {
  const jd0 = JD(P.year, P.month, P.day, 0);
  const pts = [];
  for (let k = 0; k <= 144; k++) { const h = k / 144 * 24; pts.push({ h, ev: eventAt(jd0 + h / 24, P.lat, P.lon) }); }
  return pts;
}
function drawGraphAltitudes(pts) {
  const cv = gCanvas[0]; if (!cv || !cv.width) return;
  const ctx = gCtx[0], W = cv.width, H = cv.height, PAD = { t: 12, b: 14, l: 24, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const xOf = h => PAD.l + h / 24 * gW, yOf = a => PAD.t + gH - (clamp(a, -90, 90) + 90) / 180 * gH;
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.moveTo(PAD.l, yOf(0)); ctx.lineTo(PAD.l + gW, yOf(0)); ctx.stroke();
  ctx.strokeStyle = '#ffd24d'; ctx.lineWidth = 1.4; ctx.beginPath();
  pts.forEach((p, i) => { const x = xOf(p.h), y = yOf(p.ev.sunAlt); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
  ctx.strokeStyle = '#9fb4ff'; ctx.lineWidth = 1.2; ctx.beginPath();
  pts.forEach((p, i) => { const x = xOf(p.h), y = yOf(p.ev.moonAlt); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('alt°', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('h UT', PAD.l + gW - 2, PAD.t + gH - 3);
  const cx = xOf(P.hour); ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.moveTo(cx, PAD.t); ctx.lineTo(cx, PAD.t + gH); ctx.stroke();
}
function drawGraphSeparation(pts) {
  const cv = gCanvas[1]; if (!cv || !cv.width) return;
  const ctx = gCtx[1], W = cv.width, H = cv.height, PAD = { t: 12, b: 14, l: 24, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const maxSep = Math.max(0.6, ...pts.map(p => p.ev.sep)) * 1.08;
  const xOf = h => PAD.l + h / 24 * gW, yOf = s => PAD.t + gH - clamp(s / maxSep, 0, 1) * gH;
  ctx.strokeStyle = '#4dff9d'; ctx.lineWidth = 1.4; ctx.beginPath();
  pts.forEach((p, i) => { const x = xOf(p.h), y = yOf(p.ev.sep); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('sep°', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('h UT', PAD.l + gW - 2, PAD.t + gH - 3);
  const cx = xOf(P.hour); ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.moveTo(cx, PAD.t); ctx.lineTo(cx, PAD.t + gH); ctx.stroke();
}
function drawGraphCoverage(pts) {
  const cv = gCanvas[2]; if (!cv || !cv.width) return;
  const ctx = gCtx[2], W = cv.width, H = cv.height, PAD = { t: 12, b: 14, l: 24, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const xOf = h => PAD.l + h / 24 * gW, yOf = c => PAD.t + gH - clamp(c, 0, 1) * gH;
  ctx.strokeStyle = '#ff9d4d'; ctx.lineWidth = 1.4; ctx.beginPath();
  pts.forEach((p, i) => { const x = xOf(p.h), y = yOf(p.ev.coverage); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('copertura', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('h UT', PAD.l + gW - 2, PAD.t + gH - 3);
  const cx = xOf(P.hour); ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.moveTo(cx, PAD.t); ctx.lineTo(cx, PAD.t + gH); ctx.stroke();
}
function drawGraphs() {
  const titles = ['Altezza Sole/Luna (giorno)', 'Separazione angolare (giorno)', 'Copertura del Sole (giorno)'];
  for (let i = 0; i < 3; i++) if (gTitle[i]) gTitle[i].textContent = titles[i];
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
  sliderRefs.hour = Lab.SliderInput({ label: 'Ora', min: 0, max: 24, step: 0.05, value: P.hour, unit: 'h', onChange(v) { P.hour = v; } });
  sd.add(sliderRefs.hour);
  sd.add(Lab.Toggle({ label: 'Anima (avanza l\'ora)', value: P.playing, onChange(v) { P.playing = v; } }));
  sliderRefs.speed = Lab.Slider({ label: 'Velocità animazione', min: 0.2, max: 8, step: 0.1, value: P.speed, unit: ' h/s', onChange(v) { P.speed = v; } });
  sd.add(sliderRefs.speed);

  const se = Lab.Section('Prossima eclissi'); cont.appendChild(se.el);
  const bFind = document.createElement('button'); bFind.className = 'ctrl-btn'; bFind.textContent = 'Trova la prossima eclissi qui';
  bFind.addEventListener('click', () => {
    const res = findNextVisibleEclipse(currentJD(), P.lat, P.lon, 40);
    if (res) {
      const d = jdToYMDH(res.jd);
      P.year = d.y; P.month = d.m; P.day = Math.floor(d.d); P.hour = Math.round(d.h * 100) / 100;
      lastSearchMsg = `${d.y}-${String(d.m).padStart(2, '0')}-${String(Math.floor(d.d)).padStart(2, '0')} ${d.h.toFixed(1)}h UT — eclissi ${res.ev.type} (copertura ${(res.ev.coverage * 100).toFixed(0)}%)`;
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
    { key: 'data', label: 'Data e ora (UT)' },
    { key: 'tipo', label: 'Tipo di eclissi' },
    { key: 'copertura', label: 'Copertura del Sole' },
    { key: 'sep', label: 'Separazione angolare' },
    { key: 'altSole', label: 'Altezza del Sole' },
    { key: 'distLuna', label: 'Distanza della Luna' },
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
  initStars(160);
  buildControls(); initGraphs(); buildReadout();
  // apertura: cerca subito la prossima eclissi dalla posizione/data di default, così il primo
  // impatto del lab risponde già a "quando sarà la prossima eclissi" senza dover cliccare nulla
  const first = findNextVisibleEclipse(currentJD(), P.lat, P.lon, 40);
  if (first) {
    const d = jdToYMDH(first.jd);
    P.year = d.y; P.month = d.m; P.day = Math.floor(d.d); P.hour = Math.round(d.h * 100) / 100;
    lastSearchMsg = `${d.y}-${String(d.m).padStart(2, '0')}-${String(Math.floor(d.d)).padStart(2, '0')} ${d.h.toFixed(1)}h UT — eclissi ${first.ev.type} (copertura ${(first.ev.coverage * 100).toFixed(0)}%)`;
    buildControls();
  }

  const simCanvas = document.getElementById('simCanvas');
  const btnPlay = document.getElementById('btnPlay');
  function syncPlay() { btnPlay.textContent = P.playing ? '⏸  PAUSA' : '▶  ANIMA'; }
  syncPlay();
  btnPlay.addEventListener('click', () => { P.playing = !P.playing; syncPlay(); buildControls(); });
  document.getElementById('btnReset').addEventListener('click', () => {
    P.lat = 41.9; P.lon = 12.5; P.playing = false; P.speed = 1;
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
    if (P.playing) {
      P.hour += dt * P.speed;
      if (P.hour >= 24) { P.hour -= 24; P.day += 1; }
      if (sliderRefs.hour) sliderRefs.hour.setValue(P.hour);
      if (sliderRefs.day) sliderRefs.day.setValue(P.day);
    }
    try {
      const ev = draw(simCanvas); drawGraphs();
      const d = jdToYMDH(currentJD());
      readout.set('data', `${d.y}-${String(d.m).padStart(2, '0')}-${String(Math.floor(d.d)).padStart(2, '0')} ${d.h.toFixed(2)}h`);
      readout.set('tipo', ev.type);
      readout.set('copertura', (ev.coverage * 100).toFixed(1) + '%');
      readout.set('sep', ev.sep.toFixed(3) + '°');
      readout.set('altSole', ev.sunAlt.toFixed(1) + '°');
      readout.set('distLuna', ev.moonDistTopo.toFixed(0) + ' km');
    } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
