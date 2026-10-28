'use strict';

// ═══ Costanti fisiche ═════════════════════════════════════════════════════════
const TWO = Math.PI * 2;
const G_ACCEL = 9.81;                                     // m/s²
const ETA_AIR = 1.81e-5;                                  // Pa·s, viscosità dell'aria a ~20°C
const RHO_AIR = 1.204;                                    // kg/m³
const RHO_OIL = 851;                                      // kg/m³, olio tipico dell'esperimento di Millikan
const E_CHARGE = 1.602176634e-19;                         // C, carica elementare
const COL = ['#00d4ff', '#ff9d4d'];
const FCOL = { g: '#00d4ff', e: '#ff5d9e' };

const P = {
  r_um: 0.6, n: 4,                                        // raggio goccia (μm), numero di cariche elementari
  V: 0, fieldOn: false, d_mm: 6,                           // tensione (V), campo acceso, distanza piastre (mm)
  showTrail: true,
  speed: 5.0,
  paused: false,
};

let yPos = 0, tSim = 0, last = 0;                          // yPos in metri, positivo verso l'alto, relativo al centro
let hist = [], trail = [];
let bgDrops = [], sprayAcc = 0, bgLast = 0;                // nebulizzatore: goccioline decorative casuali (dimensione/traiettoria non fisica)
let trackedEntered = false, entryPxY = null;               // la goccia tracciata nasce anche lei allo spruzzatore e cade (solo gravità) finché non attraversa il foro
let VMAX_GRAPH = 0.002;                                    // m/s, scala fissa del grafico v(t) — ricalcolata sui cambi di parametro
const WIN_T = 20;                                          // s, finestra fissa del grafico v(t)
let G = {};
let gCanvas = [null, null, null], gCtx = [null, null, null], gTitle = [null, null, null];
let readout;

// ═══ Palette ══════════════════════════════════════════════════════════════════
function dk() { return document.documentElement.dataset.theme !== 'light'; }
function pal() {
  const d = dk();
  return {
    bg:     d ? '#06090f' : '#e7edf4',
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
const fmtSci = (x, u) => (Math.abs(x) < 1e-3 && x !== 0 || Math.abs(x) >= 1e4) ? Lab.sci(x,4) + (u || '') : Lab.fmt(x,4) + (u || '');

// ═══ Fisica ═══════════════════════════════════════════════════════════════════
// Una goccia d'olio carica, fra due piastre orizzontali, è soggetta a tre forze verticali:
// peso efficace (gravità meno la spinta di Archimede in aria), forza elettrica qE, e
// resistenza viscosa dell'aria (legge di Stokes). Il tempo di rilassamento m/(6πηr) di una
// goccia micrometrica è dell'ordine dei MICROsecondi: la velocità limite si raggiunge in
// pratica istantaneamente, quindi non serve integrare un'equazione del moto con inerzia —
// la velocità è sempre (con ottima approssimazione) quella di equilibrio istantaneo.
const rMeters = () => P.r_um * 1e-6;
const dMeters = () => P.d_mm * 1e-3;
const halfGap = () => dMeters() / 2;
function effWeight(r) { const vol = (4 / 3) * Math.PI * r ** 3; return vol * (RHO_OIL - RHO_AIR) * G_ACCEL; }
function dragCoef(r) { return 6 * Math.PI * ETA_AIR * r; }
// Come nel vero apparato (e in un selettore di velocità): PRIMA di attraversare il forellino
// nella piastra superiore la goccia è fuori dal condensatore e sente solo la gravità; la forza
// di Coulomb qE esiste soltanto una volta dentro il traferro. `trackedEntered` traccia questo
// per la goccia tracciata esattamente come `inGap` fa per le goccioline decorative in updateBgDrops.
function electricForce() { return (P.fieldOn && trackedEntered) ? P.n * E_CHARGE * (P.V / dMeters()) : 0; }
// Stokes: F_attrito = 6πηr·v risolta all'equilibrio → v = (F_elettrica − peso_efficace)/(6πηr).
// Fattorizzata per essere riusata sia dalla goccia tracciata sia dalle goccioline decorative
// del nebulizzatore, ciascuna con il proprio raggio/carica casuali (r più grande → cade più
// veloce, a parità di carica; carica maggiore/campo acceso → può risalire).
function stokesVelocity(r, q) {                             // >0 = sale, <0 = scende
  const Fe = P.fieldOn ? q * (P.V / dMeters()) : 0;
  return (Fe - effWeight(r)) / dragCoef(r);
}
function terminalVelocity() { return stokesVelocity(rMeters(), trackedEntered ? P.n * E_CHARGE : 0); }
function freeFallVelocity(r) { return effWeight(r) / dragCoef(r); }   // velocità di caduta a campo spento
function balanceVoltage() {                                 // tensione che annulla la velocità (se n>0)
  if (P.n === 0) return null;
  return effWeight(rMeters()) * dMeters() / (P.n * E_CHARGE);
}
function updateVGraphRange() {
  const est = Math.max(Math.abs(terminalVelocity()), freeFallVelocity(rMeters()));
  VMAX_GRAPH = clamp(est * 1.6, 2e-6, 0.02);
}

function trimHist() { const tMin = tSim - WIN_T - 1; while (hist.length && hist[0].t < tMin) hist.shift(); }
function step(dt) {
  const v = terminalVelocity();
  yPos = clamp(yPos + v * dt, -halfGap(), halfGap());
  tSim += dt;
  hist.push({ t: tSim, v }); trimHist();
  if (P.showTrail) { trail.push({ y: yPos }); if (trail.length > 500) trail.shift(); }
}
function newDroplet(randomize) {
  if (randomize) { P.r_um = +Lab.fmt((0.25 + Math.random() * 1.4),2); P.n = 1 + Math.floor(Math.random() * 10); }
  yPos = 0; tSim = 0; hist = []; trail = [];
  trackedEntered = false; entryPxY = null;                 // riparte dallo spruzzatore, come le goccioline decorative
  updateVGraphRange();
}
// caduta della goccia tracciata dall'ugello fino al forellino: solo gravità (Fe=0, elettricForce()
// e terminalVelocity() sono già gated su trackedEntered), esattamente come le goccioline del nebulizzatore
function updateTrackedEntry(dt, LY) {
  if (entryPxY === null) entryPxY = LY.nozzleY;
  const v = stokesVelocity(rMeters(), 0);
  entryPxY -= v * LY.scaleYm * dt;
  if (entryPxY >= LY.topY) {
    trackedEntered = true;
    yPos = halfGap() - 1e-9;                                 // appena entrata, in cima al traferro
    tSim = 0; hist = []; trail = [];                          // l'esperimento (grafici) parte da qui
  }
}

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

// nebulizzatore: sciame di goccioline puntiformi (raggio e carica indipendenti, entrambi casuali)
// che nascono all'ugello e convergono con un getto obliquo verso il forellino della piastra
// superiore; solo quelle vicine al centro lo attraversano (come nell'apparato reale — l'osservatore
// ne isola una sola col microscopio). Una volta nel traferro, ciascuna segue la PROPRIA velocità
// di Stokes stokesVelocity(r,q): raggio grande → cade più veloce a parità di carica; carica
// alta col campo acceso → può risalire — le si vede quindi scendere o salire in modo diverso
// l'una dall'altra, non semplicemente "piovere" a velocità uniforme.
function updateBgDrops(now, topY, botY, holeFrac, scaleYm, nozzleX, nozzleY) {
  if (!bgLast) bgLast = now;
  const rawDt = clamp((now - bgLast) / 1000, 0, 0.05); bgLast = now;
  const dt = rawDt * (P.paused ? 0 : P.speed);                  // segue lo stesso controllo velocità della goccia tracciata
  sprayAcc += dt;
  const rate = 10;
  while (sprayAcc > 1 / rate) {
    sprayAcc -= 1 / rate;
    // raggio (e quindi massa/volume) vicino a quello scelto dallo slider, non su tutto il range
    // possibile: sono goccioline dello stesso spruzzo d'olio della goccia che si sta studiando,
    // non una popolazione arbitraria — solo una piccola dispersione ±25% attorno a P.r_um
    if (bgDrops.length < 90) bgDrops.push({
      x0: nozzleX + (Math.random() - 0.5) * 9, y: nozzleY + (Math.random() - 0.5) * 5,
      xf: (Math.random() - 0.5) * 1.2, r_um: clamp(P.r_um * (0.75 + Math.random() * 0.5), 0.12, 2.2),
      q: Math.round((Math.random() - 0.5) * 10) * E_CHARGE,       // carica casuale, spesso piccola, talvolta nulla
      passed: false, blocked: false, age: 0,
    });
  }
  for (let i = bgDrops.length - 1; i >= 0; i--) {
    const d = bgDrops[i];
    d.age += rawDt;                                              // età in tempo REALE, non scalata da P.speed: a 10× i 45s
                                                                   // di durata massima non devono ridursi a 4.5s reali
    const rM = d.r_um * 1e-6;
    const inGap = d.y >= topY && d.y <= botY;
    const v = stokesVelocity(rM, inGap ? d.q : 0);              // il campo agisce solo dentro il traferro
    d.y -= v * scaleYm * dt;                                     // v>0 (sale) → y pixel diminuisce
    if (!d.passed && d.y >= topY) { d.passed = true; if (Math.abs(d.xf) > holeFrac) d.blocked = true; }
    if (d.blocked && d.y >= topY + 2) { bgDrops.splice(i, 1); continue; }
    // una volta dentro il traferro le piastre sono barriere solide: PRIMA qui si rimuoveva la
    // gocciolina non appena y tornava a toccare topY, ma una gocciolina spinta in su dal campo
    // rientra in questa condizione quasi subito dopo essere entrata (un solo frame dopo il varco)
    // e spariva prima che si potesse vederla risalire — sembrava che "poche risentissero del
    // campo" perché erano proprio quelle che ci riuscivano a vanificarsi per prime. Fix: come per
    // la goccia tracciata (yPos è clampato, non rimosso, ai bordi del traferro), qui si blocca
    // (clamp) la posizione contro la piastra invece di cancellare la gocciolina: resta visibile,
    // "premuta" contro la piastra dalla forza elettrica, finché il campo non cambia o scade l'età.
    if (d.passed && !d.blocked) d.y = clamp(d.y, topY, botY);
    if (d.age > 90) { bgDrops.splice(i, 1); continue; }
  }
}

function drawMicroscopePanel(ctx, x0, y0, w, h, topY, botY, dropY, rPxTracked, showTracked) {
  ctx.fillStyle = 'rgba(2,7,18,0.94)'; ctx.fillRect(x0, y0, w, h);
  ctx.strokeStyle = 'rgba(0,212,255,0.4)'; ctx.lineWidth = 1.3; ctx.strokeRect(x0, y0, w, h);
  ctx.fillStyle = 'rgba(0,212,255,0.8)'; ctx.font = 'bold 11px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText('MICROSCOPIO ×100', x0 + w / 2, y0 + 18);

  // il campo del microscopio inquadra tutto il traferro sotto il forellino (dalla piastra
  // superiore a quella inferiore): una finestra più stretta tagliava la caduta a metà e faceva
  // sparire le goccioline che stavano ancora scendendo regolarmente, non solo quelle bloccate
  const viewBotY = botY;

  const innerT = y0 + 32, innerB = y0 + h - 10, innerL = x0 + 12, innerR = x0 + w - 22;
  ctx.strokeStyle = 'rgba(150,205,225,0.22)'; ctx.lineWidth = 0.7; ctx.textAlign = 'left'; ctx.font = '8px "Space Mono",monospace'; ctx.fillStyle = 'rgba(150,205,225,0.55)';
  const NLINES = 8;
  for (let k = 0; k <= NLINES; k++) {
    const yy = innerT + (k / NLINES) * (innerB - innerT);
    ctx.beginPath(); ctx.moveTo(innerL, yy); ctx.lineTo(innerR, yy); ctx.stroke();
    ctx.fillText(String(k), innerR + 4, yy + 3);
  }
  ctx.strokeStyle = 'rgba(150,205,225,0.16)'; ctx.setLineDash([2, 3]);
  ctx.beginPath(); ctx.moveTo(x0 + w / 2, innerT); ctx.lineTo(x0 + w / 2, innerB); ctx.stroke(); ctx.setLineDash([]);

  ctx.save(); ctx.beginPath(); ctx.rect(innerL, innerT, innerR - innerL, innerB - innerT); ctx.clip();
  for (const d of bgDrops) {
    // solo le goccioline che hanno davvero attraversato il forellino: quelle bloccate esistono
    // ancora per un paio di pixel dopo aver toccato la piastra (prima di essere rimosse in
    // updateBgDrops) e ricadrebbero nella finestra del microscopio pur non essendo mai entrate —
    // si vedevano comparire in alto e sparire subito dopo
    if (d.blocked || !d.passed) continue;
    if (d.y < topY || d.y > viewBotY) continue;               // fuori dal campo visivo del microscopio
    const frac = (d.y - topY) / (viewBotY - topY);
    const py = innerT + frac * (innerB - innerT);
    const px = x0 + w / 2 + d.xf * (innerR - innerL) * 0.42;
    const rp = clamp((1.4 + 2.4 * d.r_um) * 2.3, 3.5, 15);
    drawSphere(ctx, px, py, rp, '#fff3d6', '#c98a2e');
  }
  if (showTracked && dropY >= topY && dropY <= viewBotY) {
    const fracT = clamp((dropY - topY) / (viewBotY - topY), 0, 1);
    const pyT = innerT + fracT * (innerB - innerT), pxT = x0 + w / 2;
    const rpT = clamp(rPxTracked * 2.3, 7, 20);
    ctx.strokeStyle = 'rgba(0,212,255,0.85)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(pxT, pyT, rpT + 3, 0, TWO); ctx.stroke();
    drawSphere(ctx, pxT, pyT, rpT, '#fff3d6', '#c98a2e');
  }
  ctx.restore();
}

// geometria pura del dispositivo, derivata solo da dimensioni canvas + P.d_mm: usata sia dal
// tick fisico (updateTrackedEntry/updateBgDrops in frame()) sia dal rendering (draw()), un'unica
// fonte di verità così le due parti non possono disallinearsi fra loro
function computeLayout(canvas) {
  const W = canvas.width / (canvas._dpr || 1), H = canvas.height / (canvas._dpr || 1);
  const scopeW = clamp(W * 0.32, 190, 400);
  const deviceW = Math.max(260, W - scopeW - 20);
  const scopeX = deviceW + 18, scopeY = 14, scopeH = H - 28;
  const cx = deviceW * 0.5, cy = H * 0.5;
  const gapPx = clamp(H * 0.5, 140, 560);
  const scaleYm = gapPx / dMeters();                        // px per metro (verticale, per la goccia)
  const plateHalfW = clamp(deviceW * 0.26, 90, 240);
  const topY = cy - gapPx / 2 + 20, botY = cy + gapPx / 2 + 20;
  const holeHalfW = clamp(plateHalfW * 0.11, 10, 24);
  const holeFrac = holeHalfW / plateHalfW;
  const sprayZoneH = clamp(gapPx * 0.32, 55, 120);
  const wallX0 = cx - plateHalfW - 16, wallX1 = cx + plateHalfW + 16;
  const wallTop = topY - sprayZoneH - 14, wallBot = botY + 40;
  const bulbX = wallX1 + 38, bulbY = wallTop - 52;
  const bodyX = wallX1 + 10, bodyY = wallTop - 20;
  const nozzleX = cx + plateHalfW * 0.32, nozzleY = wallTop + 14;
  return {
    W, H, scopeW, deviceW, scopeX, scopeY, scopeH, cx, cy, gapPx, scaleYm, plateHalfW,
    topY, botY, holeHalfW, holeFrac, sprayZoneH, wallX0, wallX1, wallTop, wallBot,
    bulbX, bulbY, bodyX, bodyY, nozzleX, nozzleY,
  };
}

function draw(canvas, LY) {
  const [ctx, W, H] = Lab.ctx2d(canvas);
  T = pal();
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
  drawGrid(ctx, W, H);

  const { scopeW, deviceW, scopeX, scopeY, scopeH, cx, cy, gapPx, scaleYm, plateHalfW,
    topY, botY, holeHalfW, holeFrac, sprayZoneH, wallX0, wallX1, wallTop, wallBot,
    bulbX, bulbY, bodyX, bodyY, nozzleX, nozzleY } = LY;

  let dropY, dropX;
  if (trackedEntered) { dropY = cy - yPos * scaleYm + 20; dropX = cx; }
  else {
    const py = entryPxY === null ? nozzleY : entryPxY;
    const prog = clamp((py - nozzleY) / (topY - nozzleY), 0, 1);
    dropY = py; dropX = nozzleX + (cx - nozzleX) * prog;
  }

  // camera di vetro (contenitore) attorno a piastre e zona di spruzzo
  ctx.save();
  const wallGrad = ctx.createLinearGradient(0, wallTop, 0, wallBot);
  wallGrad.addColorStop(0, dk() ? 'rgba(90,70,130,0.16)' : 'rgba(120,100,160,0.12)');
  wallGrad.addColorStop(1, dk() ? 'rgba(40,50,90,0.10)' : 'rgba(80,90,140,0.08)');
  ctx.fillStyle = wallGrad;
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(wallX0, wallTop, wallX1 - wallX0, wallBot - wallTop, 20); ctx.fill(); }
  else ctx.fillRect(wallX0, wallTop, wallX1 - wallX0, wallBot - wallTop);
  ctx.strokeStyle = 'rgba(150,175,205,0.3)'; ctx.lineWidth = 1.3;
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(wallX0, wallTop, wallX1 - wallX0, wallBot - wallTop, 20); ctx.stroke(); }
  else ctx.strokeRect(wallX0, wallTop, wallX1 - wallX0, wallBot - wallTop);
  ctx.restore();

  // nebulizzatore realistico, spruzza di lato con getto obliquo (come nell'immagine di riferimento):
  // bulbo di gomma esterno in alto a destra → tubicino di vetro → ugello che punta verso l'apertura
  // della camera; il punto di convergenza del getto (nozzleX/Y) è dove nascono le goccioline
  ctx.strokeStyle = dk() ? 'rgba(140,150,165,0.85)' : 'rgba(110,120,135,0.85)'; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(bulbX - 4, bulbY + 13); ctx.quadraticCurveTo(bulbX - 20, bodyY - 6, bodyX + 6, bodyY); ctx.stroke();
  ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(bodyX - 6, bodyY + 3); ctx.quadraticCurveTo(wallX1 - 6, wallTop, nozzleX, nozzleY); ctx.stroke();
  ctx.lineCap = 'butt';

  ctx.save(); ctx.translate(bodyX, bodyY); ctx.rotate(0.45);
  const bodyGrad = ctx.createLinearGradient(-13, 0, 13, 0);
  bodyGrad.addColorStop(0, 'rgba(180,210,230,0.2)'); bodyGrad.addColorStop(0.5, 'rgba(225,242,250,0.55)'); bodyGrad.addColorStop(1, 'rgba(180,210,230,0.2)');
  ctx.fillStyle = bodyGrad; ctx.strokeStyle = 'rgba(160,190,215,0.55)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(0, 0, 15, 6, 0, 0, TWO); ctx.fill(); ctx.stroke();
  ctx.restore();

  const bulbGrad = ctx.createRadialGradient(bulbX - 5, bulbY - 6, 2, bulbX, bulbY, 17);
  bulbGrad.addColorStop(0, '#c3f3c6'); bulbGrad.addColorStop(1, '#4f9e5c');
  ctx.fillStyle = bulbGrad;
  ctx.beginPath(); ctx.ellipse(bulbX, bulbY, 13, 16, -0.22, 0, TWO); ctx.fill();
  ctx.strokeStyle = 'rgba(55,110,65,0.65)'; ctx.lineWidth = 1; ctx.stroke();

  // sorgente di radiazione ionizzante: ionizza le goccioline lungo tutta la larghezza della
  // piastra superiore (non un punto solo) mentre la attraversano
  const radX = wallX0 - 30, radY = topY + 18;
  ctx.fillStyle = dk() ? 'rgba(120,130,145,0.85)' : 'rgba(95,105,120,0.85)';
  ctx.fillRect(radX - 10, radY - 7, 20, 14);
  ctx.save(); ctx.translate(radX, radY);
  ctx.fillStyle = 'rgba(120,235,150,0.9)';
  ctx.beginPath(); ctx.arc(0, 0, 1.6, 0, TWO); ctx.fill();
  for (let k = 0; k < 3; k++) {
    const ang = -Math.PI / 2 + k * (TWO / 3);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 4.6, ang - 0.42, ang + 0.42); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(120,235,150,0.45)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(radX + 12, radY); ctx.lineTo(wallX0 + 6, radY); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(150,220,170,0.85)'; ctx.font = '8px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText('radiazione ionizzante', radX, radY + 24);

  // piastre del condensatore (quella superiore ha un forellino centrale per l'ingresso delle gocce)
  const posPlateTop = P.fieldOn && P.V >= 0;                 // convenzione: V>0 → piastra superiore positiva
  [{ y: topY, pos: posPlateTop, hole: true }, { y: botY, pos: !posPlateTop, hole: false }].forEach(pl => {
    ctx.fillStyle = dk() ? '#3a4152' : '#8891a3';
    if (pl.hole) {
      ctx.fillRect(cx - plateHalfW, pl.y - 4, plateHalfW - holeHalfW, 8);
      ctx.fillRect(cx + holeHalfW, pl.y - 4, plateHalfW - holeHalfW, 8);
    } else {
      ctx.fillRect(cx - plateHalfW, pl.y - 4, plateHalfW * 2, 8);
    }
    if (P.fieldOn && P.V !== 0) {
      ctx.fillStyle = pl.pos ? 'rgba(255,90,90,0.85)' : 'rgba(90,160,255,0.85)';
      ctx.font = 'bold 13px "Space Mono",monospace'; ctx.textAlign = 'left';
      ctx.fillText(pl.pos ? '+' : '−', cx + plateHalfW + 8, pl.y + 4);
    }
  });
  // bagliore verde della radiazione ionizzante esteso sotto TUTTA la piastra superiore (non un
  // punto/cerchio isolato sul foro) — rappresenta la zona in cui le gocce vengono ionizzate;
  // sfumato sia sopra (verso la piastra) sia sotto (verso l'interno del traferro), non un bordo
  // netto che parte già alla massima opacità
  const bandH = clamp(gapPx * 0.11, 20, 40);
  const bandY0 = topY - bandH * 0.3, bandY1 = bandY0 + bandH;
  const bandGrad = ctx.createLinearGradient(0, bandY0, 0, bandY1);
  bandGrad.addColorStop(0, 'rgba(120,235,150,0)');
  bandGrad.addColorStop(0.5, 'rgba(120,235,150,0.34)');
  bandGrad.addColorStop(1, 'rgba(120,235,150,0)');
  ctx.fillStyle = bandGrad;
  ctx.fillRect(cx - plateHalfW, bandY0, plateHalfW * 2, bandH);

  // nuvola di goccioline casuali del nebulizzatore, puntiformi come uno sciame di polvere; disegnate
  // DOPO le piastre così restano visibili fin sopra la loro superficie (non spariscono "dentro" la
  // barra opaca prima del punto in cui vengono davvero rimosse/bloccate)
  ctx.fillStyle = 'rgba(255,208,110,0.85)';
  for (const d of bgDrops) {
    let px;
    if (d.y < topY) {
      const prog = clamp((d.y - nozzleY) / (topY - nozzleY), 0, 1);
      const targetX = cx + d.xf * plateHalfW;
      px = d.x0 + (targetX - d.x0) * prog;
    } else px = cx + d.xf * plateHalfW;
    // mappatura più ripida (moltiplicatore maggiore, minor offset fisso) così la variazione di
    // raggio/volume fra le goccioline — piccola in assoluto (±25% attorno allo slider) — resta
    // visibile anche a dimensione ridotta, invece di appiattirsi tutta sullo stesso puntino
    const rp = clamp(0.25 + 1.9 * d.r_um, 0.5, 3.4);
    ctx.beginPath(); ctx.arc(px, d.y, rp, 0, TWO); ctx.fill();
  }
  // righello con tacche millimetriche lungo il bordo sinistro del traferro
  ctx.strokeStyle = T.ring; ctx.lineWidth = 1; ctx.textAlign = 'right'; ctx.font = '8px "Space Mono",monospace'; ctx.fillStyle = T.sub;
  const rulerX = cx - plateHalfW - 14;
  for (let k = 0; k <= P.d_mm; k++) { const yy = botY - (k / P.d_mm) * gapPx;
    ctx.beginPath(); ctx.moveTo(rulerX - 4, yy); ctx.lineTo(rulerX + 4, yy); ctx.stroke();
    if (k % 2 === 0) ctx.fillText(k + 'mm', rulerX - 7, yy + 3); }
  ctx.beginPath(); ctx.moveTo(rulerX, topY); ctx.lineTo(rulerX, botY); ctx.stroke();

  // linee di campo (se acceso)
  if (P.fieldOn && P.V !== 0) {
    ctx.strokeStyle = 'rgba(255,210,120,0.35)'; ctx.lineWidth = 1;
    const dir = posPlateTop ? -1 : 1;                         // dal + al −
    for (let i = -3; i <= 3; i++) { const xx = cx + i * (plateHalfW / 4);
      const ya = dir > 0 ? topY + 8 : botY - 8, yb = dir > 0 ? botY - 8 : topY + 8;
      ctx.beginPath(); ctx.moveTo(xx, ya); ctx.lineTo(xx, yb); ctx.stroke();
      const ah = 5, my = ya + (yb - ya) * 0.5;
      ctx.beginPath(); ctx.moveTo(xx, my); ctx.lineTo(xx - ah * 0.5, my - dir * ah); ctx.lineTo(xx + ah * 0.5, my - dir * ah); ctx.closePath();
      ctx.fillStyle = 'rgba(255,210,120,0.35)'; ctx.fill();
    }
  }

  // microscopio di osservazione: tubo cilindrico attaccato perpendicolarmente alla parete della
  // camera, con lente terminale (non più un angolo a freccia fatto di due segmenti obliqui)
  const mTubeLen = 30, mTubeH = 13, mX0 = wallX1, mX1 = wallX1 + mTubeLen;
  ctx.fillStyle = dk() ? 'rgba(75,85,100,0.9)' : 'rgba(130,140,155,0.9)';
  ctx.fillRect(mX0, cy - mTubeH / 2, mTubeLen, mTubeH);
  ctx.strokeStyle = 'rgba(150,175,205,0.5)'; ctx.lineWidth = 1;
  ctx.strokeRect(mX0, cy - mTubeH / 2, mTubeLen, mTubeH);
  const lensGrad = ctx.createRadialGradient(mX1 - 2, cy - 2, 1, mX1, cy, mTubeH * 0.55);
  lensGrad.addColorStop(0, 'rgba(190,230,255,0.95)'); lensGrad.addColorStop(1, 'rgba(35,65,95,0.95)');
  ctx.fillStyle = lensGrad;
  ctx.beginPath(); ctx.ellipse(mX1, cy, mTubeH * 0.5, mTubeH * 0.52, 0, 0, TWO); ctx.fill();
  ctx.strokeStyle = 'rgba(150,205,230,0.6)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = T.sub; ctx.font = '8px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText('microscopio', wallX1 + mTubeLen / 2, cy + mTubeH / 2 + 14);
  ctx.strokeStyle = 'rgba(0,212,255,0.3)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(mX1 + 2, cy); ctx.lineTo(scopeX, scopeY + scopeH / 2); ctx.stroke(); ctx.setLineDash([]);

  // traiettoria
  if (P.showTrail && trail.length > 1) {
    ctx.strokeStyle = 'rgba(0,212,255,0.28)'; ctx.lineWidth = 1.4; ctx.beginPath();
    trail.forEach((p, i) => { const yy = cy - p.y * scaleYm + 20; i ? ctx.lineTo(cx, yy) : ctx.moveTo(cx, yy); });
    ctx.stroke();
  }

  // goccia d'olio tracciata (quella isolata e osservata): cade anche lei dallo spruzzatore insieme
  // allo sciame finché non attraversa il foro (dropX/dropY calcolati sopra), dimensione ridotta
  // per non risultare sproporzionata rispetto alle goccioline decorative
  const rPx = clamp(1.8 + 2.6 * (P.r_um / 1.0), 1.8, 7);
  drawSphere(ctx, dropX, dropY, rPx, '#fff3d6', '#c98a2e');
  if (P.n > 0 && trackedEntered) {
    ctx.fillStyle = 'rgba(120,190,255,0.95)'; ctx.font = 'bold 9px "Space Mono",monospace'; ctx.textAlign = 'center';
    ctx.fillText(`${P.n}−`, dropX, dropY - rPx - 8);
  }

  // intestazione
  const v = terminalVelocity(), Fe = electricForce(), Fg = effWeight(rMeters());
  ctx.textAlign = 'left';
  ctx.fillStyle = T.accent; ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.fillText("Esperimento di Millikan — qE = m_eff·g   (goccia in equilibrio)", 14, 22);
  ctx.fillStyle = T.txt; ctx.font = '10px "Space Mono",monospace';
  ctx.fillText(`r=${Lab.fmt(P.r_um,2)} μm   n=${P.n}   q=n·e=${fmtSci(P.n * E_CHARGE, ' C')}   v=${fmtSci(v * 1000, ' mm/s')}`, 14, 40);
  ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace';
  ctx.fillText(`peso efficace = ${fmtSci(Fg, ' N')}   forza elettrica = ${fmtSci(Fe, ' N')}   ${P.fieldOn ? `V=${Lab.fmt(P.V,0)} V` : 'campo spento'}`, 14, 56);

  if (trackedEntered && Math.abs(yPos) >= halfGap() * 0.995) {
    ctx.fillStyle = FCOL.e; ctx.font = 'bold 11px "Space Mono",monospace'; ctx.textAlign = 'center';
    ctx.fillText('la goccia ha raggiunto una piastra — premi "Nuova goccia" o regola i parametri', cx, 78);
  }

  ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText('accendi il campo e regola la tensione finché la goccia resta sospesa: qE = peso efficace', cx, H - 8);

  drawMicroscopePanel(ctx, scopeX, scopeY, scopeW - 4, scopeH, topY, botY, dropY, rPx, trackedEntered);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
// 1: velocità della goccia nel tempo (mm/s, positiva verso l'alto): raggiunge subito la velocità limite di Stokes
function drawGraphV() {
  const vm = Lab.niceMax(VMAX_GRAPH * 1000), t1 = Math.max(tSim, WIN_T);
  const g = Lab.panel(gCanvas[0], { title: 'Velocità della goccia (mm/s, + verso l’alto)', xr: [t1 - WIN_T, t1], xStep: 5, yr: [-vm, vm], xLabel: 't (s)' });
  if (!g) return; const [ctx, f] = g;
  Lab.plotPts(ctx, f, hist.map(p => [p.t, p.v * 1000]), COL[0], 2);
}
// 2: velocità limite in funzione della tensione: è una retta, e si annulla alla tensione di equilibrio
function drawGraphVV() {
  const r = rMeters(), Fg = effWeight(r), b = dragCoef(r), d = dMeters();
  const vAt = VV => (P.n * E_CHARGE * (VV / d) - Fg) / b * 1000;
  const vm = Lab.niceMax(Math.max(Math.abs(vAt(-1000)), Math.abs(vAt(1000)), 1e-3) * 1.1);
  const g = Lab.panel(gCanvas[1], { title: 'Velocità limite (mm/s) in funzione della tensione', xr: [-1000, 1000], xStep: 500, yr: [-vm, vm], xLabel: 'V (volt)' });
  if (!g) return; const [ctx, f] = g;
  const Vb = balanceVoltage();
  if (Vb !== null && Vb >= -1000 && Vb <= 1000) {
    ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = f.C.amber; ctx.beginPath(); ctx.moveTo(f.X(Vb), f.T); ctx.lineTo(f.X(Vb), f.B); ctx.stroke(); ctx.restore();
    ctx.fillStyle = f.C.amber; ctx.font = '9.5px "DM Sans",sans-serif'; ctx.textBaseline = 'middle';
    const right = f.X(Vb) < (f.L + f.R) / 2; ctx.textAlign = right ? 'left' : 'right';
    ctx.fillText(`equilibrio a ${Lab.fmt(Vb, 0)} V`, f.X(Vb) + (right ? 5 : -5), f.T + 8);
  }
  Lab.plot(ctx, f, vAt, [-1000, 1000], COL[0], 2);
  const curV = P.fieldOn ? P.V : 0;
  Lab.dot(ctx, f, curV, vAt(curV), FCOL.e, 4.5);
}
// 3: la carica è quantizzata: q è sempre un multiplo intero di e = 1,602·10⁻¹⁹ C
function drawGraphQuant() {
  const NMAX = 15;
  const g = Lab.panel(gCanvas[2], { title: 'Carica della goccia q = n·e (10⁻¹⁹ C)', xr: [0, NMAX], xStep: 2, yr: [0, Lab.niceMax(NMAX * 1.602)], xLabel: 'n (numero di cariche elementari)' });
  if (!g) return; const [ctx, f] = g;
  for (let n = 0; n <= NMAX; n++) {
    const cur = n === P.n, q = n * 1.602;
    ctx.strokeStyle = cur ? FCOL.e : 'rgba(0,212,255,0.45)'; ctx.lineWidth = cur ? 3 : 1.6;
    ctx.beginPath(); ctx.moveTo(f.X(n), f.B); ctx.lineTo(f.X(n), f.Y(q)); ctx.stroke();
    Lab.dot(ctx, f, n, q, cur ? FCOL.e : 'rgba(0,212,255,0.8)', cur ? 4.5 : 2.5);
  }
}
function drawGraphs() { drawGraphV(); drawGraphVV(); drawGraphQuant(); }

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls() {
  const cont = document.getElementById('controls'); cont.innerHTML = '';

  const sd = Lab.Section('Goccia d\'olio'); cont.appendChild(sd.el);
  sd.add(Lab.Slider({ label: 'Raggio r', min: 0.2, max: 2.0, step: 0.01, value: P.r_um, unit: ' μm', onChange(v) { P.r_um = v; updateVGraphRange(); } }));
  sd.add(Lab.Slider({ label: 'Cariche elementari n', min: 0, max: 15, step: 1, value: P.n, unit: '', onChange(v) { P.n = v; updateVGraphRange(); } }));
  const bNew = document.createElement('button'); bNew.className = 'ctrl-btn'; bNew.textContent = 'Nuova goccia casuale';
  bNew.addEventListener('click', () => newDroplet(true));
  sd.add(bNew);

  const sc = Lab.Section('Campo elettrico'); cont.appendChild(sc.el);
  sc.add(Lab.Toggle({ label: 'Campo E acceso', value: P.fieldOn, onChange(v) { P.fieldOn = v; updateVGraphRange(); } }));
  sc.add(Lab.Slider({ label: 'Tensione V', min: -1000, max: 1000, step: 5, value: P.V, unit: ' V', onChange(v) { P.V = v; updateVGraphRange(); } }));
  sc.add(Lab.Slider({ label: 'Distanza piastre d', min: 2, max: 15, step: 0.5, value: P.d_mm, unit: ' mm', onChange(v) { P.d_mm = v; updateVGraphRange(); } }));

  const sv = Lab.Section('Visualizzazione'); cont.appendChild(sv.el);
  sv.add(Lab.Toggle({ label: 'Traiettoria', value: P.showTrail, onChange(v) { P.showTrail = v; } }));
  sv.add(Lab.Slider({ label: 'Velocità simulazione', min: 0.2, max: 10, step: 0.1, value: P.speed, unit: '×', onChange(v) { P.speed = v; } }));
}

function buildReadout() {
  const cont = document.getElementById('readout'); cont.innerHTML = '';
  readout = new Lab.Readout(cont, [
    { key: 't', label: 'tempo' },
    { key: 'v', label: 'velocità della goccia' },
    { key: 'Fg', label: 'peso meno spinta d’Archimede' },
    { key: 'Fe', label: 'forza elettrica qE' },
    { key: 'q', label: 'carica q = n·e' },
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
  buildControls(); initGraphs(); buildReadout(); updateVGraphRange();
  const simCanvas = document.getElementById('simCanvas');
  const btnPlay = document.getElementById('btnPlay');
  function syncPlay() { btnPlay.textContent = P.paused ? '▶  AVVIA' : '⏸  PAUSA'; }
  syncPlay();
  btnPlay.addEventListener('click', () => { P.paused = !P.paused; syncPlay(); });
  document.getElementById('btnReset').addEventListener('click', () => {
    P.r_um = 0.6; P.n = 4; P.V = 0; P.fieldOn = false; P.d_mm = 6;
    P.showTrail = true; P.speed = 1.0; P.paused = false;
    bgDrops = []; sprayAcc = 0; bgLast = 0;
    newDroplet(false); buildControls(); syncPlay();
  });

  function resize() {
    const area = document.querySelector('.lab-canvas-area'); if (!area) return;
    const ar = area.getBoundingClientRect();
    const rb = document.getElementById('readout').getBoundingClientRect();
    const ga = document.getElementById('graphArea'); const gaH = ga ? ga.offsetHeight : 0;
    const h = Math.max(240, Math.floor(ar.height - rb.height - gaH - 4));
    Lab.hidpi(simCanvas, Math.floor(ar.width), h);
    Lab.fitPanels(gCanvas);
    // le goccioline decorative e la caduta pre-ingresso della goccia tracciata memorizzano
    // posizioni in PIXEL assoluti; se il canvas cambia dimensione la geometria (pareti, piastre,
    // ugello) si ricalcola altrove e quelle posizioni restano quelle vecchie, facendo sembrare lo
    // sciame "spruzzato da fuori" rispetto alla camera ridisegnata — si scartano e ripartono pulite
    bgDrops = []; sprayAcc = 0; bgLast = 0;
    if (!trackedEntered) entryPxY = null;
  }
  resize();
  new ResizeObserver(resize).observe(document.querySelector('.lab-canvas-area'));
  window.addEventListener('load', resize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);

  last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000; last = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0; dt = Math.min(dt, 0.05);
    const LY = computeLayout(simCanvas);
    if (!P.paused) {
      if (!trackedEntered) updateTrackedEntry(dt * P.speed, LY);
      else step(dt * P.speed);
    }
    updateBgDrops(now, LY.topY, LY.botY, LY.holeFrac, LY.scaleYm, LY.nozzleX, LY.nozzleY);
    try {
      draw(simCanvas, LY); drawGraphs();
      const v = terminalVelocity(), Fg = effWeight(rMeters()), Fe = electricForce();
      readout.set('t', Lab.fmt(tSim, 2) + ' s');
      readout.set('v', fmtSci(v * 1000, ' mm/s'));
      readout.set('Fg', fmtSci(Fg, ' N'));
      readout.set('Fe', fmtSci(Fe, ' N'));
      readout.set('q', fmtSci(P.n * E_CHARGE, ' C'));
    } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
