'use strict';

// ═══ Costanti fisiche ═════════════════════════════════════════════════════════
const TWO = Math.PI * 2;
const E_CHARGE = 1.602176634e-19;                                 // C
const M_ELECTRON = 9.1093837015e-31;                              // kg
const Q_OVER_M = E_CHARGE / M_ELECTRON;                           // C/kg — l'unica cosa che conta per ω_c, r ed energia è |q|: la carica NEGATIVA
                                                                   // dell'elettrone fissa solo il verso di curvatura (una convenzione), non i valori mostrati
// I tempi reali di un ciclotrone a elettroni sono nell'ordine dei nanosecondi (troppo veloci da
// vedere): come PRECESSION_EXAGGERATION nel pendolo di Foucault, un SOLO fattore dichiarato
// rallenta SOLO l'orologio dell'animazione — la fisica (ω_c, raggio, energia) resta quella vera,
// in unità SI, mai alterata.
const TIME_SLOWDOWN = 3e7;
const DEE_RADIUS = 0.03;                                          // m — raggio di estrazione (fisso): quando r_n lo raggiunge il fascio "esce"
const KE0_EV = 0.5;                                               // eV — energia di iniezione, piccola ma non nulla (vicino al centro, come una vera sorgente)
const KE_MIN_EV = 0.05;                                           // eV — pavimento di sicurezza: evita v→0 se il fascio è fuori sincronismo e viene decelerato
const PHI0 = Math.PI / 2;                                         // fase RF fissa: alla risonanza esatta dà il guadagno massimo (+V₀) a OGNI attraversamento
const STREAM_N = 5;                                               // numero di elettroni nella modalità "sequenza"
const STREAM_GAP_HALVES = 3;                                      // distanza fra un'iniezione e la successiva, in mezzi giri — mostra elettroni a stadi diversi contemporaneamente
// Energia di estrazione massima raggiungibile resta sempre sotto qualche keV (vedi KE_MAX_EV
// derivato da B), ben al di sotto dei 511 keV di energia a riposo dell'elettrone: il modello
// resta legittimamente non-relativistico (γ−1 < 1% in tutto l'intervallo dei parametri).

const P = {
  mode: 'single',           // 'single' | 'stream'
  B: 0.006,                  // T — campo magnetico (1–10 mT)
  V0: 15,                     // V — ampiezza della tensione RF fra i due "dee"
  freqMHz: (Q_OVER_M * 0.006 / TWO) * 1e-6,   // MHz — di default esattamente in risonanza con B iniziale
  speed: 1.0,
  paused: false,
};

let animT = 0, last = 0;
let beams = [];
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

// ═══ Fisica (chiusa a tratti: archi di cerchio esatti, separati da "colpi" istantanei al gap) ══
// Con B costante lungo z, la velocità di una carica ruota a velocità angolare COSTANTE
// ω_c=|q|B/m, indipendente dalla velocità stessa — è proprio questo che rende possibile un
// ciclotrone: il tempo di mezzo giro T_half=π/ω_c NON dipende dall'energia della particella, solo
// da B. Fra un attraversamento del gap e il successivo la particella non sente altro che B, quindi
// descrive un arco di cerchio ESATTO (nessuna integrazione numerica): usando che i due estremi di
// ogni arco stanno entrambi sulla linea del gap (una conseguenza geometrica, non un'approssimazione:
// ogni arco è ESATTAMENTE un mezzo giro, quindi i suoi estremi sono diametralmente opposti sul
// cerchio, e la velocità lì è sempre perpendicolare al gap), si ottiene una formula chiusa per
// posizione e velocità in funzione del tempo trascorso nell'arco corrente.
function omegaC() { return Q_OVER_M * P.B; }                     // rad/s
function tHalfPhys() { return Math.PI / omegaC(); }               // s (tempo reale di un mezzo giro)
function tHalfScreen() { return tHalfPhys() * TIME_SLOWDOWN; }    // s (tempo a schermo dello stesso mezzo giro)
function fC_MHz() { return omegaC() / TWO * 1e-6; }
function omegaRF() { return TWO * P.freqMHz * 1e6; }
function keMaxEV() { return 0.5 * M_ELECTRON * (DEE_RADIUS * omegaC()) ** 2 / E_CHARGE; }  // energia (eV) all'estrazione (r=DEE_RADIUS)

function makeBeam(tStartScreen) {
  const v0 = Math.sqrt(2 * KE0_EV * E_CHARGE / M_ELECTRON);
  return {
    tStart: tStartScreen,
    X: [{ t: tStartScreen, x: 0, d: 1, v: v0, r: v0 / omegaC(), KEeV: KE0_EV, dKEeV: 0 }],
    exited: false,
  };
}
// aggiunge il prossimo attraversamento del gap in fondo alla sequenza, usando l'ultimo noto —
// θ_n è la fase RF residua RISPETTO alla risonanza (φ0 + (ω_RF−ω_c)·t): a risonanza esatta
// (ω_RF=ω_c) resta costante ad ogni attraversamento — il fascio guadagna sempre la stessa energia;
// fuori sincronismo deriva lentamente, e il guadagno oscilla fra accelerazione e decelerazione.
function extendBeam(beam) {
  if (beam.exited) return;
  const last = beam.X[beam.X.length - 1];
  const TH = tHalfScreen();
  const tPhys = last.t / TIME_SLOWDOWN;
  const theta = PHI0 + (omegaRF() - omegaC()) * tPhys;
  const dKEeV = P.V0 * Math.sin(theta);
  const KEeV = Math.max(KE_MIN_EV, last.KEeV + dKEeV);
  const v = Math.sqrt(2 * KEeV * E_CHARGE / M_ELECTRON);
  const r = v / omegaC();
  const d = -last.d;
  const x = last.x + 2 * last.r * last.d;
  const t = last.t + TH;
  beam.X.push({ t, x, d, v, r, KEeV, dKEeV });
  if (r >= DEE_RADIUS) beam.exited = true;
}
function ensureBeamUpTo(beam, tScreen) {
  let guard = 0;
  while (!beam.exited && beam.X[beam.X.length - 1].t < tScreen && guard++ < 5000) extendBeam(beam);
}
// posizione (m) all'interno dell'arco corrente, dato un record di attraversamento e il tempo
// FISICO (s, non a schermo) trascorso dall'inizio dell'arco — formula chiusa, vedi commento sopra
function arcPoint(cur, tauPhys) {
  const wc = omegaC();
  const x = cur.x + cur.r * cur.d * (1 - Math.cos(wc * tauPhys));
  const y = cur.r * cur.d * Math.sin(wc * tauPhys);
  return [x, y];
}
function beamPosAt(beam, tScreen) {
  if (tScreen < beam.tStart) return null;
  const TH = tHalfScreen();
  const n = clamp(Math.floor((tScreen - beam.tStart) / TH), 0, beam.X.length - 1);
  if (n >= beam.X.length - 1 && beam.exited) {
    const lastPt = beam.X[beam.X.length - 1];
    return { x: lastPt.x, y: 0, exited: true, KEeV: lastPt.KEeV, r: lastPt.r, n };
  }
  const cur = beam.X[n];
  const tauScreen = clamp(tScreen - cur.t, 0, TH);
  const [x, y] = arcPoint(cur, tauScreen / TIME_SLOWDOWN);
  return { x, y, exited: false, KEeV: cur.KEeV, r: cur.r, n };
}
function beamTrail(beam, tScreen) {
  const pts = [];
  const TH = tHalfScreen();
  const nSeg = 14;
  for (let n = 0; n < beam.X.length; n++) {
    const cur = beam.X[n];
    if (cur.t > tScreen) break;
    const dur = clamp(tScreen - cur.t, 0, TH);
    const steps = Math.max(1, Math.round(nSeg * dur / TH));
    for (let i = 0; i <= steps; i++) pts.push(arcPoint(cur, (dur * i / steps) / TIME_SLOWDOWN));
  }
  return pts;
}

function newRun() {
  animT = 0;
  const TH = tHalfScreen();
  beams = P.mode === 'single'
    ? [makeBeam(0)]
    : Array.from({ length: STREAM_N }, (_, k) => makeBeam(k * TH * STREAM_GAP_HALVES));
}
function step(dt) {
  animT += dt;
  beams.forEach(b => ensureBeamUpTo(b, animT));
}

// ═══ Rendering 3D (proiezione isometrica orbitale, stesso schema di labs/gyroscope) ═══════════
let cam = { az: -0.5, el: 0.85, zoom: 1 };
let camDrag = null;
const SCENE_DEE_R = 1.0, SCENE_BASE_R = 1.22, SCENE_GAP_W = 0.10, SCENE_H_DEE = 0.12, SCENE_BASE_H = 0.16;
const K_SCENE = SCENE_DEE_R / DEE_RADIUS;                          // metri reali → unità di scena (i dee occupano sempre lo stesso spazio a schermo)

function drawGrid(ctx, W, H) {
  ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}
function geom(W, H) {
  const cx = W * 0.52, cy = H * 0.56;
  const S = Math.min(W * 0.85, H * 0.82) * 0.30 / SCENE_BASE_R;
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
function drawSphereSmall(ctx, x, y, r, hi, base) {
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = r;
  const grad = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r * 1.05);
  grad.addColorStop(0, hi); grad.addColorStop(1, base);
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, r, 0, TWO); ctx.fill(); ctx.restore();
}

function drawBaseHousing(ctx) {
  const N = 48, topPts = [], botPts = [];
  for (let i = 0; i <= N; i++) { const a = i / N * TWO; topPts.push(proj([Math.cos(a) * SCENE_BASE_R, Math.sin(a) * SCENE_BASE_R, 0])); botPts.push(proj([Math.cos(a) * SCENE_BASE_R, Math.sin(a) * SCENE_BASE_R, -SCENE_BASE_H])); }
  ctx.strokeStyle = T.ring; ctx.lineWidth = 1;
  for (let i = 0; i < N; i += 4) { ctx.beginPath(); ctx.moveTo(topPts[i].sx, topPts[i].sy); ctx.lineTo(botPts[i].sx, botPts[i].sy); ctx.stroke(); }
  ctx.beginPath(); botPts.forEach((p, i) => i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy)); ctx.closePath();
  ctx.fillStyle = dk() ? 'rgba(90,100,115,0.55)' : 'rgba(150,160,175,0.6)'; ctx.fill(); ctx.strokeStyle = T.ring; ctx.stroke();
  ctx.beginPath(); topPts.forEach((p, i) => i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy)); ctx.closePath();
  ctx.fillStyle = dk() ? 'rgba(120,132,150,0.5)' : 'rgba(180,190,205,0.6)'; ctx.fill(); ctx.strokeStyle = T.ring; ctx.stroke();
}
function deeOutline(sign) {
  const R = SCENE_DEE_R, g = SCENE_GAP_W / 2, aHalf = Math.asin(clamp(g / R, 0, 0.99)), N = 40, pts = [];
  for (let i = 0; i <= N; i++) { const a = sign > 0 ? aHalf + (Math.PI - 2 * aHalf) * i / N : -aHalf - (Math.PI - 2 * aHalf) * i / N; pts.push([Math.cos(a) * R, Math.sin(a) * R]); }
  return pts;
}
// colore di riempimento della faccia superiore, secondo la polarità ISTANTANEA di quel dee
// (positiva=caldo/arancio, negativa=freddo/blu — la stessa coppia di colori usata per i segni +/−)
function polarityColor(isPositive) {
  const d = dk();
  if (isPositive) return d ? 'rgba(255,157,77,0.30)' : 'rgba(255,140,60,0.42)';
  return d ? 'rgba(77,170,255,0.30)' : 'rgba(60,140,255,0.42)';
}
// dee a forma di D con VERO spessore: faccia superiore (dove scorre il fascio, z=SCENE_H_DEE),
// pareti laterali lungo l'arco esterno e lungo il lato piatto rivolto al gap, fino alla base
// (z=0, appoggiata sul coperchio dell'alloggiamento) — nessun depth-sorting reale fra le geometrie
// della scena (stessa semplificazione accettata già in labs/gyroscope), ma per l'angolazione di
// default (quasi dall'alto) l'ordine di disegno base→dee→gap resta sempre corretto
function drawDee(ctx, sign, isPositive) {
  const outline = deeOutline(sign);
  const topPts = outline.map(p => proj([p[0], p[1], SCENE_H_DEE]));
  const botPts = outline.map(p => proj([p[0], p[1], 0]));
  ctx.strokeStyle = 'rgba(180,220,200,0.35)'; ctx.lineWidth = 1;
  for (let i = 0; i < outline.length; i += 4) { ctx.beginPath(); ctx.moveTo(topPts[i].sx, topPts[i].sy); ctx.lineTo(botPts[i].sx, botPts[i].sy); ctx.stroke(); }
  const t0 = topPts[0], t1 = topPts[topPts.length - 1], b0 = botPts[0], b1 = botPts[botPts.length - 1];
  ctx.beginPath(); ctx.moveTo(t0.sx, t0.sy); ctx.lineTo(t1.sx, t1.sy); ctx.lineTo(b1.sx, b1.sy); ctx.lineTo(b0.sx, b0.sy); ctx.closePath();
  ctx.fillStyle = dk() ? 'rgba(120,140,130,0.55)' : 'rgba(150,165,155,0.6)'; ctx.fill(); ctx.strokeStyle = T.ring; ctx.lineWidth = 1; ctx.stroke();
  ctx.beginPath(); topPts.forEach((p, i) => i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy)); ctx.closePath();
  ctx.fillStyle = polarityColor(isPositive); ctx.fill();
  ctx.strokeStyle = isPositive ? 'rgba(255,180,110,0.85)' : 'rgba(120,190,255,0.85)'; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.save();
  const lbl = proj([0, sign * SCENE_DEE_R * 0.55, SCENE_H_DEE + 0.01]);
  ctx.fillStyle = isPositive ? 'rgba(255,195,140,0.95)' : 'rgba(150,205,255,0.95)';
  ctx.font = 'bold 28px "Space Mono",monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(isPositive ? '+' : '−', lbl.sx, lbl.sy);
  ctx.restore();
}
// blocco del gap: ora un VERO muro estruso fra le due facce interne dei dee (non più una lastra
// piatta) — coerente con l'aver dato spessore ai dee stessi
function drawGapBlock(ctx) {
  const R = SCENE_DEE_R * 1.02, g = SCENE_GAP_W / 2, h = SCENE_H_DEE;
  const top = [[-R, -g, h], [R, -g, h], [R, g, h], [-R, g, h]].map(p => proj(p));
  const near = [[-R, -g, h], [R, -g, h], [R, -g, 0], [-R, -g, 0]].map(p => proj(p));
  const far = [[-R, g, h], [R, g, h], [R, g, 0], [-R, g, 0]].map(p => proj(p));
  [near, far].forEach(wall => {
    ctx.beginPath(); wall.forEach((p, i) => i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy)); ctx.closePath();
    ctx.fillStyle = dk() ? 'rgba(110,120,135,0.82)' : 'rgba(130,140,155,0.85)'; ctx.fill(); ctx.strokeStyle = T.ring; ctx.lineWidth = 1; ctx.stroke();
  });
  ctx.beginPath(); top.forEach((p, i) => i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy)); ctx.closePath();
  ctx.fillStyle = dk() ? 'rgba(150,160,175,0.9)' : 'rgba(160,170,185,0.9)'; ctx.fill();
  ctx.strokeStyle = T.ring; ctx.lineWidth = 1.2; ctx.stroke();
}
function drawFieldArrows(ctx) {
  const pts2D = [[-0.55, 0.35], [0, 0.55], [0.55, 0.35], [-0.55, -0.35], [0, -0.55], [0.55, -0.35], [0, 0]];
  const h0 = SCENE_H_DEE, len = 0.42 + 0.35 * clamp((P.B - 0.001) / 0.009, 0, 1);
  ctx.strokeStyle = 'rgba(255,90,90,0.85)'; ctx.fillStyle = 'rgba(255,90,90,0.85)'; ctx.lineWidth = 1.6;
  pts2D.forEach(([x, y]) => {
    const p0 = proj([x, y, h0]), p1 = proj([x, y, h0 + len]), p2 = proj([x, y, h0 + len * 0.82]);
    ctx.beginPath(); ctx.moveTo(p0.sx, p0.sy); ctx.lineTo(p1.sx, p1.sy); ctx.stroke();
    const dx = p1.sx - p2.sx, dy = p1.sy - p2.sy, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, px = -uy, py = ux;
    ctx.beginPath(); ctx.moveTo(p1.sx, p1.sy);
    ctx.lineTo(p1.sx - ux * 7 + px * 4, p1.sy - uy * 7 + py * 4);
    ctx.lineTo(p1.sx - ux * 7 - px * 4, p1.sy - uy * 7 - py * 4);
    ctx.closePath(); ctx.fill();
  });
  const bp = proj([0.55, 0.35, h0 + len + 0.12]);
  ctx.fillStyle = 'rgba(255,140,140,0.95)'; ctx.font = 'bold 12px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText('B', bp.sx, bp.sy);
}
function drawBeamPath(ctx, beam, tScreen, color) {
  const pts = beamTrail(beam, tScreen);
  if (pts.length < 2) return;
  ctx.beginPath();
  pts.forEach((p, i) => { const s = proj([p[0] * K_SCENE, p[1] * K_SCENE, SCENE_H_DEE + 0.002]); i ? ctx.lineTo(s.sx, s.sy) : ctx.moveTo(s.sx, s.sy); });
  ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.stroke();
}
function drawBeamDot(ctx, beam, tScreen) {
  const st = beamPosAt(beam, tScreen); if (!st) return;
  const p = proj([st.x * K_SCENE, st.y * K_SCENE, SCENE_H_DEE + 0.01]);
  drawSphereSmall(ctx, p.sx, p.sy, 6, '#dff4ff', '#00a8d8');
}
function drawVoltageSymbol(ctx, W, H) {
  const x = 54, y = H - 54;
  ctx.strokeStyle = T.sub; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(x, y, 5, 0, TWO); ctx.stroke();
  ctx.beginPath(); ctx.arc(x + 16, y, 5, 0, TWO); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x - 30, y - 14); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 21, y); ctx.lineTo(x + 46, y - 14); ctx.stroke();
  ctx.fillStyle = T.txt; ctx.font = 'bold 11px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText('V∼', x + 8, y + 22);
  ctx.font = '9px "Space Mono",monospace'; ctx.fillStyle = T.sub;
  ctx.fillText(P.V0.toFixed(0) + ' V @ ' + P.freqMHz.toFixed(1) + ' MHz', x + 8, y + 34);
}

function draw(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  T = pal();
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
  drawGrid(ctx, W, H);
  geom(W, H);

  const thNow = PHI0 + omegaRF() * (animT / TIME_SLOWDOWN);       // fase RF assoluta corrente (stessa convenzione di θ_n nei colpi di accelerazione)
  const upperIsPositive = Math.sin(thNow) >= 0;

  drawBaseHousing(ctx);
  drawDee(ctx, 1, upperIsPositive); drawDee(ctx, -1, !upperIsPositive);
  drawGapBlock(ctx);
  beams.forEach((b, i) => drawBeamPath(ctx, b, animT, i === 0 ? 'rgba(0,212,255,0.9)' : 'rgba(0,212,255,0.45)'));
  beams.forEach(b => drawBeamDot(ctx, b, animT));
  drawFieldArrows(ctx);
  drawVoltageSymbol(ctx, W, H);

  ctx.textAlign = 'left';
  ctx.fillStyle = T.accent; ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.fillText('Ciclotrone — spirale di accelerazione', 14, 22);
  ctx.fillStyle = T.txt; ctx.font = '10px "Space Mono",monospace';
  const detuning = (P.freqMHz - fC_MHz()) / fC_MHz() * 100;
  ctx.fillText(`B=${(P.B * 1000).toFixed(1)} mT   f_c=${fC_MHz().toFixed(1)} MHz   f_RF=${P.freqMHz.toFixed(1)} MHz   scarto=${detuning.toFixed(1)}%`, 14, 40);

  ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
  const hint = Math.abs(detuning) < 2
    ? 'in risonanza: ogni attraversamento del gap accelera il fascio, il raggio cresce ad ogni giro — trascina per ruotare la vista'
    : 'fuori sincronismo: il guadagno di energia ad ogni attraversamento oscilla, in media il fascio smette di accelerare — trascina per ruotare la vista';
  ctx.fillText(hint, W / 2, H - 10);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
function gBase(ctx, W, H, PAD) {
  ctx.fillStyle = T.gBg; ctx.fillRect(0, 0, W, H);
  const gW = W - PAD.l - PAD.r, gH = H - PAD.t - PAD.b;
  ctx.strokeStyle = T.gAxis; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(PAD.l, PAD.t); ctx.lineTo(PAD.l, PAD.t + gH); ctx.lineTo(PAD.l + gW, PAD.t + gH); ctx.stroke();
  return { gW, gH };
}
// 1: raggio dell'orbita in funzione del numero di attraversamenti — asse Y VERAMENTE fisso
// (0..DEE_RADIUS): il raggio di estrazione è una costante del dispositivo, non un parametro
// esplorato, quindi qui non c'è alcun conflitto con la regola "non nascondere l'effetto esplorato"
function drawGraphRadius() {
  const cv = gCanvas[0]; if (!cv || !cv.width || !beams[0]) return;
  const ctx = gCtx[0], W = cv.width, H = cv.height, PAD = { t: 14, b: 14, l: 26, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const X = beams[0].X, nMax = Math.max(10, X.length - 1);
  const xOf = n => PAD.l + clamp(n / nMax, 0, 1) * gW;
  const yOf = r => PAD.t + gH - clamp(r / DEE_RADIUS, 0, 1) * gH;
  ctx.strokeStyle = '#00d4ff'; ctx.lineWidth = 1.4; ctx.beginPath();
  X.forEach((rec, i) => { const x = xOf(i), y = yOf(rec.r); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.stroke();
  ctx.fillStyle = '#ff9d4d'; ctx.beginPath(); ctx.arc(xOf(X.length - 1), yOf(X[X.length - 1].r), 3, 0, TWO); ctx.fill();
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('raggio orbita (cm)', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('n (attraversamenti)', PAD.l + gW - 2, PAD.t + gH - 3);
}
// 2: energia cinetica vs n — asse Y ricalcolato su B (KE_max∝B²: fissarlo al valore peggiore
// renderebbe illeggibili quasi tutti gli altri B) MAI su V₀/frequenza, che restano leggibili
// dalla FORMA della curva (rampa pulita vs oscillazione stagnante), non dalla scala dell'asse
function drawGraphEnergy() {
  const cv = gCanvas[1]; if (!cv || !cv.width || !beams[0]) return;
  const ctx = gCtx[1], W = cv.width, H = cv.height, PAD = { t: 14, b: 14, l: 30, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const X = beams[0].X, nMax = Math.max(10, X.length - 1), keMax = Math.max(keMaxEV(), X[X.length - 1].KEeV * 1.15, 10);
  const xOf = n => PAD.l + clamp(n / nMax, 0, 1) * gW;
  const yOf = ke => PAD.t + gH - clamp(ke / keMax, 0, 1) * gH;
  ctx.strokeStyle = '#7fe0a0'; ctx.lineWidth = 1.4; ctx.beginPath();
  X.forEach((rec, i) => { const x = xOf(i), y = yOf(rec.KEeV); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.stroke();
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('energia cinetica (eV)', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('n (attraversamenti)', PAD.l + gW - 2, PAD.t + gH - 3);
}
// 3: guadagno di energia AD OGNI attraversamento vs n — asse Y fisso a ±V₀ corrente (ricalcolato
// solo se cambia V₀): mostra direttamente sin(θₙ) — pinnato in alto se in risonanza, oscillante fra
// i due estremi se fuori sincronismo — è il grafico che spiega perché la frequenza deve combaciare
function drawGraphKick() {
  const cv = gCanvas[2]; if (!cv || !cv.width || !beams[0]) return;
  const ctx = gCtx[2], W = cv.width, H = cv.height, PAD = { t: 14, b: 14, l: 26, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const X = beams[0].X, nMax = Math.max(10, X.length - 1), vMax = Math.max(P.V0, 1);
  const zero = PAD.t + gH / 2;
  ctx.strokeStyle = T.gAxis; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(PAD.l, zero); ctx.lineTo(PAD.l + gW, zero); ctx.stroke();
  const xOf = n => PAD.l + clamp(n / nMax, 0, 1) * gW;
  const yOf = v => zero - clamp(v / vMax, -1, 1) * (gH * 0.46);
  ctx.strokeStyle = '#ff9d4d'; ctx.lineWidth = 1.4; ctx.beginPath();
  X.forEach((rec, i) => { const x = xOf(i), y = yOf(rec.dKEeV); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.stroke();
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('guadagno per attraversamento (eV)', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('n', PAD.l + gW - 2, PAD.t + gH - 3);
}
function drawGraphs() {
  const titles = ['Raggio dell\'orbita', 'Energia cinetica', 'Guadagno per attraversamento'];
  for (let i = 0; i < 3; i++) if (gTitle[i]) gTitle[i].textContent = titles[i];
  drawGraphRadius(); drawGraphEnergy(); drawGraphKick();
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls() {
  const cont = document.getElementById('controls'); cont.innerHTML = '';

  const sm = Lab.Section('Sorgente'); cont.appendChild(sm.el);
  sm.add(Lab.RadioGroup({
    label: 'Particelle iniettate',
    value: P.mode,
    options: [
      { value: 'single', label: 'Un solo elettrone' },
      { value: 'stream', label: 'Sequenza di elettroni' },
    ],
    onChange(v) { P.mode = v; newRun(); },
  }));
  const bNew = document.createElement('button'); bNew.className = 'ctrl-btn'; bNew.textContent = 'Nuovo fascio';
  bNew.addEventListener('click', () => newRun());
  sm.add(bNew);

  const sb = Lab.Section('Campo magnetico'); cont.appendChild(sb.el);
  sb.add(Lab.Slider({ label: 'Campo B', min: 0.001, max: 0.010, step: 0.0005, value: P.B, unit: ' T', onChange(v) { P.B = v; newRun(); } }));

  const sv = Lab.Section('Tensione acceleratrice'); cont.appendChild(sv.el);
  sv.add(Lab.Slider({ label: 'Ampiezza V₀', min: 1, max: 50, step: 1, value: P.V0, unit: ' V', onChange(v) { P.V0 = v; newRun(); } }));
  sv.add(Lab.Slider({ label: 'Frequenza RF', min: 15, max: 350, step: 1, value: P.freqMHz, unit: ' MHz', onChange(v) { P.freqMHz = v; newRun(); } }));

  const sa = Lab.Section('Visualizzazione'); cont.appendChild(sa.el);
  sa.add(Lab.Slider({ label: 'Velocità animazione', min: 0.2, max: 3, step: 0.1, value: P.speed, unit: '×', onChange(v) { P.speed = v; } }));
}

function buildReadout() {
  const cont = document.getElementById('readout'); cont.innerHTML = '';
  readout = new Lab.Readout(cont, [
    { key: 'B', label: 'Campo B' },
    { key: 'fc', label: 'Frequenza di risonanza f_c' },
    { key: 'frf', label: 'Frequenza RF impostata' },
    { key: 'ke', label: 'Energia cinetica' },
    { key: 'r', label: 'Raggio orbita' },
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
    P.mode = 'single'; P.B = 0.006; P.V0 = 15; P.freqMHz = (Q_OVER_M * 0.006 / TWO) * 1e-6; P.speed = 1.0; P.paused = false;
    buildControls(); newRun(); syncPlay();
  });

  // telecamera orbitale: trascina per ruotare (azimut/elevazione), rotella per zoomare (stesso schema di labs/gyroscope)
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
      const primary = beams[0], st = primary ? beamPosAt(primary, animT) : null;
      readout.set('B', (P.B * 1000).toFixed(1) + ' mT');
      readout.set('fc', fC_MHz().toFixed(1) + ' MHz');
      readout.set('frf', P.freqMHz.toFixed(1) + ' MHz');
      readout.set('ke', st ? (st.KEeV >= 1000 ? (st.KEeV / 1000).toFixed(2) + ' keV' : st.KEeV.toFixed(1) + ' eV') : '—');
      readout.set('r', st ? (st.r * 100).toFixed(2) + ' cm' : '—');
      readout.set('stato', st ? (st.exited ? 'estratto' : 'in accelerazione') : '—');
    } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
