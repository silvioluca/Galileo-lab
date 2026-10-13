'use strict';

// ── Parameters ──────────────────────────────────────────────────────────────
const P = {
  mach: 1.5,        // numero di Mach dell'aereo
  altitude: 10,     // km
  tempC: 15,        // °C (aria uniforme)
  length: 20,       // m, lunghezza del velivolo
  timeScale: 8,     // secondi simulati per secondo reale
  showWaves: true,
  showCone: true,
  audioOn: false,
};

// ── Canvas / layout ──────────────────────────────────────────────────────────
const canvas  = document.getElementById('simCanvas');
const ctx     = canvas.getContext('2d');
const gCanvas = document.getElementById('graphCanvas');
const gctx    = gCanvas.getContext('2d');
const graphArea = document.getElementById('graphArea');
const readoutEl = document.getElementById('readout');

let SW = 0, SH = 0, GW = 0, GH = 0, DPR = 1;

function resize() {
  DPR = window.devicePixelRatio || 1;
  const area = canvas.parentElement;
  const gaH  = graphArea.offsetHeight;
  const rdH  = readoutEl.offsetHeight || 0;
  SW = area.clientWidth;
  SH = Math.max(0, area.clientHeight - gaH - rdH);

  canvas.width  = SW * DPR;
  canvas.height = SH * DPR;
  canvas.style.width  = SW + 'px';
  canvas.style.height = SH + 'px';

  GW = graphArea.clientWidth;
  GH = graphArea.clientHeight;
  gCanvas.width  = GW * DPR;
  gCanvas.height = GH * DPR;
  gCanvas.style.width  = GW + 'px';
  gCanvas.style.height = GH + 'px';
}

// ── World (km) ───────────────────────────────────────────────────────────────
// Vista laterale ad assi fissi: quota 0–22 km, stessa scala in orizzontale.
const VIEW_TOP_KM = 22;
const GROUND_PX   = 34;
const START_X     = -5;    // km, l'aereo parte fuori scena a sinistra
const EMIT_DT     = 2;     // s simulati fra due fronti d'onda
const MAX_WAVEFRONTS = 160;

let scale = 20;            // px per km
function computeScale() { scale = Math.max(1, (SH - GROUND_PX - 8) / VIEW_TOP_KM); }
const groundY = () => SH - GROUND_PX;
const kx = x => x * scale;
const ky = y => groundY() - y * scale;
const viewW = () => SW / scale;   // km visibili in orizzontale

// ── Physics ──────────────────────────────────────────────────────────────────
const P_GROUND = 101325;   // Pa
const SCALE_H  = 7.4;      // km, altezza di scala dell'atmosfera
const K_REFL   = 2.0;      // riflessione al suolo
const K_SHAPE  = 0.085;    // fattore di forma del velivolo (fisso)

const soundSpeed = () => 331.3 * Math.sqrt(1 + P.tempC / 273.15) / 1000;   // km/s
const planeSpeed = () => P.mach * soundSpeed();                            // km/s
const isSupersonic = () => P.mach > 1;
const machAngle = () => Math.asin(1 / P.mach);                             // rad, solo M > 1

// Distanza orizzontale fra l'aereo e il punto in cui il cono tocca il suolo
const footprintLag = () => P.altitude * Math.sqrt(P.mach * P.mach - 1);    // km
// Tempo fra il passaggio sulla verticale e l'arrivo del boom
const boomDelay = () => footprintLag() / planeSpeed();                     // s

// Sovrappressione di picco al suolo — metodo semplificato di Carlson (NASA, 1978)
function overpressure(hKm, mach = P.mach) {
  if (mach <= 1) return 0;
  const pv = P_GROUND * Math.exp(-hKm / SCALE_H);
  const h = hKm * 1000;
  return K_REFL * Math.sqrt(pv * P_GROUND) * Math.pow(mach * mach - 1, 1 / 8)
       * Math.pow(P.length / h, 3 / 4) * K_SHAPE;
}

// Durata dell'onda a N (s)
function nWaveDuration() {
  if (!isSupersonic()) return 0;
  const a = soundSpeed() * 1000;
  const h = P.altitude * 1000;
  return (3.42 / a) * P.mach / Math.pow(P.mach * P.mach - 1, 3 / 8)
       * Math.pow(h, 1 / 4) * Math.pow(P.length, 3 / 4) * K_SHAPE;
}

// ── State ─────────────────────────────────────────────────────────────────────
let running = true;
let simT = 0;
let nextEmit = 0;
let planeX = START_X;
let obsX = null;           // km, impostata al primo resize
let heard = false;         // il suono ha raggiunto l'osservatore
let boomFlash = -1;        // istante reale (ms) dell'ultimo boom
let endTimer = 0;          // pausa reale a fine passaggio
let lastTS = null;
const wavefronts = [];     // {x, r} — emessi alla quota dell'aereo

function resetSim() {
  simT = 0;
  nextEmit = 0;
  planeX = START_X;
  heard = false;
  boomFlash = -1;
  endTimer = 0;
  wavefronts.length = 0;
}

const footprintX = () => planeX - footprintLag();

// Il suono ha già raggiunto l'osservatore? (senza far scattare il boom)
function soundReached() {
  if (isSupersonic()) return footprintX() >= obsX;
  return wavefronts.some(w => Math.hypot(obsX - w.x, P.altitude) <= w.r);
}

function step(dt) {
  simT += dt;
  planeX += planeSpeed() * dt;

  while (simT >= nextEmit) {
    const age = simT - nextEmit;
    wavefronts.push({ x: planeX - planeSpeed() * age, r: soundSpeed() * age });
    nextEmit += EMIT_DT;
    if (wavefronts.length > MAX_WAVEFRONTS) wavefronts.shift();
  }
  const c = soundSpeed();
  for (const w of wavefronts) w.r += c * dt;

  if (!heard && soundReached()) {
    heard = true;
    if (isSupersonic()) {
      boomFlash = performance.now();
      if (P.audioOn) playBoom();
    }
  }
}

function passFinished() {
  if (isSupersonic()) return footprintX() > viewW() + 3;
  return planeX > viewW() + 8;
}

// ── Audio: doppio colpo separato dalla durata dell'onda a N ───────────────────
let audioCtx = null;

function thump(t0) {
  const len = Math.floor(audioCtx.sampleRate * 0.5);
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.18));
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const lp = audioCtx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 140;
  const g = audioCtx.createGain();
  g.gain.value = 0.9;
  src.connect(lp); lp.connect(g); g.connect(audioCtx.destination);
  src.start(t0);
}

function playBoom() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime + 0.01;
  thump(t);
  thump(t + Math.min(0.6, Math.max(0.05, nWaveDuration())));
}

// ── Draw helpers ──────────────────────────────────────────────────────────────
function getCSSVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function getColors() {
  const light = document.documentElement.dataset.theme === 'light';
  return {
    light,
    bg:     getCSSVar('--bg1')            || (light ? '#f0f2f5' : '#060a10'),
    panel:  getCSSVar('--bg2')            || (light ? '#ffffff' : '#0b1018'),
    ground: light ? '#c9d3df' : '#141d28',
    grid:   light ? 'rgba(0,0,0,0.08)'   : 'rgba(255,255,255,0.06)',
    text:   getCSSVar('--text-primary')   || (light ? '#0d1a26' : '#ddeeff'),
    muted:  getCSSVar('--text-secondary') || (light ? '#4a6278' : '#6b8099'),
    accent: getCSSVar('--accent')         || (light ? '#0099cc' : '#00d4ff'),
    shock:  light ? '#d9480f' : '#ff6b35',
    obs:    '#a855f7',
  };
}

function drawBackground(C) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, SW, SH);

  // griglia di quota ogni 5 km
  ctx.font = '9px Space Mono, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  for (let h = 5; h <= 20; h += 5) {
    const y = ky(h);
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SW, y); ctx.stroke();
    ctx.fillStyle = C.muted;
    ctx.fillText(h + ' km', SW - 6, y - 2);
  }
  for (let x = 10; x < viewW(); x += 10) {
    ctx.strokeStyle = C.grid;
    ctx.beginPath(); ctx.moveTo(kx(x), 0); ctx.lineTo(kx(x), groundY()); ctx.stroke();
  }
}

function drawWavefronts(C) {
  const sup = isSupersonic();
  const rgb = sup ? '255,140,80' : '110,231,247';
  const fade = 45; // km
  for (const w of wavefronts) {
    const alpha = Math.max(0, 0.65 - w.r / fade * 0.6);
    if (alpha <= 0) continue;
    ctx.beginPath();
    ctx.arc(kx(w.x), ky(P.altitude), w.r * scale, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${rgb},${alpha})`;
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }
}

function drawCone(C) {
  const mu = machAngle();
  const cosM = Math.cos(mu), sinM = Math.sin(mu);
  const ax = kx(planeX), ay = ky(P.altitude);
  // il cono è sviluppato solo fino al fronte più vecchio
  const arm = Math.max(0, planeX - START_X) * cosM * scale;
  if (arm < 2) return;

  const ux = ax - cosM * arm, uy = ay - sinM * arm;   // braccio superiore
  const lx = ax - cosM * arm, ly = ay + sinM * arm;   // braccio inferiore

  ctx.beginPath();
  ctx.moveTo(ax, ay); ctx.lineTo(ux, uy); ctx.lineTo(lx, ly); ctx.closePath();
  // sfuma verso la coda: il cono non ha un bordo posteriore netto
  const grad = ctx.createLinearGradient(ax, 0, ux, 0);
  grad.addColorStop(0, C.light ? 'rgba(217,72,15,0.14)' : 'rgba(255,90,40,0.16)');
  grad.addColorStop(1, 'rgba(255,90,40,0)');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = C.shock;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ux, uy); ctx.lineTo(ax, ay); ctx.lineTo(lx, ly);
  ctx.stroke();

  // angolo di Mach
  const rArc = 46;
  ctx.beginPath();
  ctx.arc(ax, ay, rArc, Math.PI - mu, Math.PI);
  ctx.strokeStyle = C.text;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax - rArc - 26, ay); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = C.text;
  ctx.font = '10px Space Mono, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('μ = ' + (mu * 180 / Math.PI).toFixed(1) + '°',
    ax - (rArc + 8) * Math.cos(mu / 2), ay + (rArc + 8) * Math.sin(mu / 2) + 2);
}

function drawPlane(C) {
  const x = kx(planeX), y = ky(P.altitude);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = C.text;
  ctx.beginPath();               // fusoliera, muso sull'origine
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-8, -4, -22, -4);
  ctx.lineTo(-40, -3);
  ctx.lineTo(-46, -13);          // deriva
  ctx.lineTo(-50, -13);
  ctx.lineTo(-48, 2);
  ctx.lineTo(-22, 3);
  ctx.quadraticCurveTo(-8, 3, 0, 0);
  ctx.fill();
  ctx.beginPath();               // ala
  ctx.moveTo(-16, 1); ctx.lineTo(-38, 8); ctx.lineTo(-42, 8); ctx.lineTo(-32, 1);
  ctx.closePath();
  ctx.fillStyle = C.muted;
  ctx.fill();
  ctx.restore();
}

function drawGround(C) {
  const gy = groundY();
  ctx.fillStyle = C.ground;
  ctx.fillRect(0, gy, SW, GROUND_PX);
  ctx.strokeStyle = C.muted;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(SW, gy); ctx.stroke();

  // tappeto sonoro: tratto di suolo già percorso dall'onda d'urto
  if (isSupersonic()) {
    const fx = footprintX();
    const x0 = kx(START_X), x1 = kx(fx);
    if (planeX - START_X > footprintLag() && x1 > 0) {
      ctx.fillStyle = C.light ? 'rgba(217,72,15,0.30)' : 'rgba(255,107,53,0.32)';
      ctx.fillRect(x0, gy, x1 - x0, 5);
      ctx.beginPath();
      ctx.arc(x1, gy, 4, 0, Math.PI * 2);
      ctx.fillStyle = C.shock;
      ctx.fill();
      ctx.font = '9px Space Mono, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('tappeto sonoro', x1 - 8, gy + 9);
    }
  }
}

function drawObserver(C, now) {
  const x = kx(obsX), gy = groundY();
  const since = boomFlash < 0 ? Infinity : (now - boomFlash) / 1000;

  // verticale dell'osservatore
  ctx.setLineDash([2, 6]);
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, gy); ctx.stroke();
  ctx.setLineDash([]);

  if (since < 1.4) {
    for (let i = 0; i < 3; i++) {
      const k = since / 1.4 - i * 0.18;
      if (k <= 0) continue;
      ctx.beginPath();
      ctx.arc(x, gy - 10, k * 70, Math.PI, 2 * Math.PI);
      ctx.strokeStyle = `rgba(255,107,53,${Math.max(0, 0.9 * (1 - k))})`;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    ctx.fillStyle = C.shock;
    ctx.font = '700 18px Space Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('BOOM!', x, gy - 34 - since * 14);
  }

  // omino
  ctx.strokeStyle = C.obs;
  ctx.fillStyle = C.obs;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, gy - 17, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x, gy - 13); ctx.lineTo(x, gy - 5);
  ctx.moveTo(x - 5, gy - 10); ctx.lineTo(x + 5, gy - 10);
  ctx.moveTo(x, gy - 5); ctx.lineTo(x - 4, gy);
  ctx.moveTo(x, gy - 5); ctx.lineTo(x + 4, gy);
  ctx.stroke();

  ctx.font = '9px Space Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(heard ? 'sente il suono' : 'silenzio', x, gy + 19);
}

function drawHud(C) {
  const sup = isSupersonic();
  const regime = sup ? 'SUPERSONICO' : (P.mach === 1 ? 'MURO DEL SUONO' : 'SUBSONICO');
  ctx.font = '700 13px Space Mono, monospace';
  ctx.fillStyle = sup ? C.shock : C.accent;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`M = ${P.mach.toFixed(2)}  ·  ${regime}`, 12, 12);
  ctx.font = '10px DM Sans, sans-serif';
  ctx.fillStyle = C.muted;
  ctx.fillText(sup
    ? 'L\'aereo supera i propri fronti d\'onda: il suono arriva tutto insieme lungo il cono.'
    : 'I fronti d\'onda precedono l\'aereo: nessuna onda d\'urto.', 12, 32);
  ctx.textAlign = 'right';
  ctx.fillText('trascina l\'osservatore', SW - 12, 14);
}

function drawScene(C, now) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawBackground(C);

  // tutto ciò che sta in aria viene ritagliato al suolo
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, SW, groundY());
  ctx.clip();
  if (P.showWaves) drawWavefronts(C);
  if (P.showCone && isSupersonic()) drawCone(C);
  drawPlane(C);
  ctx.restore();

  drawGround(C);
  drawObserver(C, now);
  drawHud(C);
}

// ── Graphs ────────────────────────────────────────────────────────────────────
const NW_TMAX = 0.6;                 // s, asse fisso
const DP_MIN = 10, DP_MAX = 10000;   // Pa, asse log fisso
const H_MAX = 20;                    // km

function drawNoBoom(C, offX, pw) {
  gctx.fillStyle = C.muted;
  gctx.font = '11px DM Sans, sans-serif';
  gctx.textAlign = 'center';
  gctx.textBaseline = 'middle';
  gctx.fillText('Nessun boom: serve M > 1', offX + pw / 2, GH / 2);
}

// Sinistra: firma di pressione al suolo (onda a N), ampiezza normalizzata
function drawNWavePanel(C, offX, pw) {
  const PAD = { l: 46, r: 14, t: 26, b: 26 };
  const iw = pw - PAD.l - PAD.r, ih = GH - PAD.t - PAD.b;
  if (iw < 20 || ih < 20) return;

  gctx.fillStyle = C.text;
  gctx.font = '10px Space Mono, monospace';
  gctx.textAlign = 'left';
  gctx.textBaseline = 'top';
  gctx.fillText('Onda a N al suolo  Δp(t)', offX + PAD.l, 7);

  if (!isSupersonic()) { drawNoBoom(C, offX, pw); return; }

  const dp = overpressure(P.altitude), tau = nWaveDuration();
  const x0 = offX + PAD.l, midY = PAD.t + ih / 2, amp = ih / 2 - 6;
  const tx = t => x0 + t / NW_TMAX * iw;
  const tLead = 0.06;

  gctx.strokeStyle = C.grid;
  gctx.lineWidth = 1;
  gctx.beginPath();
  gctx.moveTo(x0, PAD.t); gctx.lineTo(x0, PAD.t + ih);
  gctx.moveTo(x0, midY); gctx.lineTo(x0 + iw, midY);
  gctx.stroke();

  gctx.fillStyle = C.muted;
  gctx.font = '9px Space Mono, monospace';
  gctx.textAlign = 'center';
  gctx.textBaseline = 'top';
  for (let t = 0; t <= NW_TMAX + 1e-9; t += 0.1) {
    gctx.fillText((t * 1000).toFixed(0), tx(t), PAD.t + ih + 3);
  }
  gctx.fillText('t (ms)', x0 + iw / 2, GH - 11);
  gctx.textAlign = 'right';
  gctx.textBaseline = 'middle';
  gctx.fillText('+' + dp.toFixed(0), x0 - 4, midY - amp);
  gctx.fillText('0', x0 - 4, midY);
  gctx.fillText('−' + dp.toFixed(0), x0 - 4, midY + amp);
  gctx.fillText('Pa', x0 - 4, PAD.t - 6);

  gctx.save();
  gctx.beginPath(); gctx.rect(x0, PAD.t - 2, iw, ih + 4); gctx.clip();
  gctx.beginPath();
  gctx.moveTo(tx(0), midY);
  gctx.lineTo(tx(tLead), midY);
  gctx.lineTo(tx(tLead), midY - amp);
  gctx.lineTo(tx(tLead + tau), midY + amp);
  gctx.lineTo(tx(tLead + tau), midY);
  gctx.lineTo(tx(NW_TMAX), midY);
  gctx.strokeStyle = C.shock;
  gctx.lineWidth = 2;
  gctx.stroke();
  gctx.restore();

  gctx.fillStyle = C.shock;
  gctx.font = '700 10px Space Mono, monospace';
  gctx.textAlign = 'right';
  gctx.textBaseline = 'top';
  gctx.fillText(`Δp = ${dp.toFixed(0)} Pa · durata ${(tau * 1000).toFixed(0)} ms`, offX + pw - PAD.r, 7);
}

// Destra: sovrappressione di picco in funzione della quota
function drawAltitudePanel(C, offX, pw) {
  const PAD = { l: 50, r: 14, t: 26, b: 26 };
  const iw = pw - PAD.l - PAD.r, ih = GH - PAD.t - PAD.b;
  if (iw < 20 || ih < 20) return;

  gctx.fillStyle = C.text;
  gctx.font = '10px Space Mono, monospace';
  gctx.textAlign = 'left';
  gctx.textBaseline = 'top';
  gctx.fillText('Sovrappressione (Pa) vs quota', offX + PAD.l, 7);

  const x0 = offX + PAD.l, y0 = PAD.t + ih;
  const hx = h => x0 + h / H_MAX * iw;
  const lmin = Math.log10(DP_MIN), lmax = Math.log10(DP_MAX);
  const py = p => y0 - (Math.log10(p) - lmin) / (lmax - lmin) * ih;

  gctx.font = '9px Space Mono, monospace';
  gctx.lineWidth = 1;
  for (let e = lmin; e <= lmax; e++) {
    const y = py(Math.pow(10, e));
    gctx.strokeStyle = C.grid;
    gctx.beginPath(); gctx.moveTo(x0, y); gctx.lineTo(x0 + iw, y); gctx.stroke();
    gctx.fillStyle = C.muted;
    gctx.textAlign = 'right';
    gctx.textBaseline = 'middle';
    gctx.fillText(String(Math.pow(10, e)), x0 - 4, y);
  }
  gctx.textAlign = 'center';
  gctx.textBaseline = 'top';
  for (let h = 0; h <= H_MAX; h += 5) gctx.fillText(String(h), hx(h), y0 + 3);
  gctx.fillText('quota (km)', x0 + iw / 2, GH - 11);

  if (!isSupersonic()) { drawNoBoom(C, offX, pw); return; }

  gctx.save();
  gctx.beginPath(); gctx.rect(x0, PAD.t, iw, ih); gctx.clip();
  gctx.beginPath();
  for (let i = 0; i <= 120; i++) {
    const h = 0.5 + (H_MAX - 0.5) * i / 120;
    const x = hx(h), y = py(Math.max(overpressure(h), 1e-3));
    i === 0 ? gctx.moveTo(x, y) : gctx.lineTo(x, y);
  }
  gctx.strokeStyle = C.accent;
  gctx.lineWidth = 2;
  gctx.stroke();

  const dp = overpressure(P.altitude);
  gctx.beginPath();
  gctx.arc(hx(P.altitude), py(Math.max(dp, 1e-3)), 4.5, 0, Math.PI * 2);
  gctx.fillStyle = C.shock;
  gctx.fill();
  gctx.restore();
}

function drawGraph(C) {
  gctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  gctx.fillStyle = C.panel;
  gctx.fillRect(0, 0, GW, GH);

  const splitX = Math.floor(GW / 2);
  gctx.strokeStyle = C.grid;
  gctx.lineWidth = 1;
  gctx.beginPath(); gctx.moveTo(splitX, 5); gctx.lineTo(splitX, GH - 5); gctx.stroke();

  drawNWavePanel(C, 0, splitX);
  drawAltitudePanel(C, splitX, GW - splitX);
}

// ── Readout ───────────────────────────────────────────────────────────────────
const readout = new Lab.Readout(readoutEl, [
  { key: 'v',     label: 'Velocità' },
  { key: 'c',     label: 'v suono' },
  { key: 'mu',    label: 'Angolo di Mach' },
  { key: 'delay', label: 'Ritardo boom' },
  { key: 'dp',    label: 'Δp al suolo' },
  { key: 'db',    label: 'Livello' },
]);

function updateReadout() {
  const sup = isSupersonic();
  readout.set('v', (planeSpeed() * 3600).toFixed(0) + ' km/h');
  readout.set('c', (soundSpeed() * 1000).toFixed(0) + ' m/s');
  readout.set('mu', sup ? (machAngle() * 180 / Math.PI).toFixed(1) + '°' : '—');
  readout.set('delay', sup ? boomDelay().toFixed(1) + ' s' : '—');
  const dp = overpressure(P.altitude);
  readout.set('dp', sup ? dp.toFixed(0) + ' Pa' : '—');
  readout.set('db', sup && dp > 0 ? (20 * Math.log10(dp / 2e-5)).toFixed(0) + ' dB' : '—');
}

// ── Controls ──────────────────────────────────────────────────────────────────
function buildControls() {
  const cont = document.getElementById('controls');
  cont.innerHTML = '';

  const secPlane = Lab.Section('Aereo');
  secPlane.add(Lab.Slider({
    label: 'Numero di Mach', min: 0.5, max: 3, step: 0.05, value: P.mach,
    onChange(v) { P.mach = v; resetSim(); }
  }));
  secPlane.add(Lab.Slider({
    label: 'Quota', unit: ' km', min: 1, max: 20, step: 0.5, value: P.altitude,
    onChange(v) { P.altitude = v; resetSim(); }
  }));
  secPlane.add(Lab.Slider({
    label: 'Lunghezza velivolo', unit: ' m', min: 10, max: 70, step: 1, value: P.length,
    onChange(v) { P.length = v; }
  }));

  const secAir = Lab.Section('Aria');
  secAir.add(Lab.Slider({
    label: 'Temperatura', unit: ' °C', min: -50, max: 40, step: 5, value: P.tempC,
    onChange(v) { P.tempC = v; resetSim(); }
  }));

  const secSim = Lab.Section('Simulazione');
  secSim.add(Lab.Slider({
    label: 'Velocità del tempo', unit: '×', min: 1, max: 20, step: 1, value: P.timeScale,
    onChange(v) { P.timeScale = v; }
  }));
  secSim.add(Lab.Toggle({
    label: 'Fronti d\'onda', value: P.showWaves,
    onChange(v) { P.showWaves = v; }
  }));
  secSim.add(Lab.Toggle({
    label: 'Cono di Mach', value: P.showCone,
    onChange(v) { P.showCone = v; }
  }));
  secSim.add(Lab.Toggle({
    label: '🔊  Audio del boom', value: P.audioOn,
    onChange(v) {
      P.audioOn = v;
      if (v && !audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }));

  const info = document.createElement('div');
  info.style.cssText = 'margin-top:14px;font-size:11px;color:var(--text-secondary);line-height:1.7;padding:10px 12px;background:var(--bg3);border-radius:8px';
  info.innerHTML = 'Cono di Mach: sin μ = 1/M. Il boom arriva dopo il passaggio sulla verticale, con ritardo h·√(M²−1)/v.<br>Δp e durata sono stime con il metodo semplificato di Carlson (aria uniforme, fattore di forma fisso): valgono come ordine di grandezza.';
  secSim.add(info);

  cont.append(secPlane.el, secAir.el, secSim.el);
}

// ── Drag dell'osservatore ─────────────────────────────────────────────────────
let dragging = false;

function pointerX(e) { return e.clientX - canvas.getBoundingClientRect().left; }

function moveObserver(px) {
  obsX = Math.min(Math.max(px / scale, 1), viewW() - 1);
  heard = soundReached();   // riallinea lo stato senza far scattare il boom
}

canvas.addEventListener('pointerdown', e => {
  const r = canvas.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  if (Math.abs(x - kx(obsX)) < 24 && y > groundY() - 40) {
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
  }
});
canvas.addEventListener('pointermove', e => {
  const r = canvas.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  if (dragging) moveObserver(x);
  canvas.style.cursor = dragging || (Math.abs(x - kx(obsX)) < 24 && y > groundY() - 40) ? 'ew-resize' : 'default';
});
const endDrag = () => { dragging = false; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// ── Main loop ─────────────────────────────────────────────────────────────────
function setRunning(v) {
  running = v;
  document.getElementById('btnPlay').textContent = v ? '⏸  PAUSA' : '▶  RIPRENDI';
}

function loop(ts) {
  requestAnimationFrame(loop);

  const dt = lastTS === null ? 0 : Math.min((ts - lastTS) / 1000, 0.05);
  lastTS = ts;

  computeScale();
  if (obsX === null && SW > 0) obsX = viewW() * 0.6;
  if (obsX === null) return;

  if (running && dt > 0) {
    if (passFinished()) {
      endTimer += dt;
      if (endTimer > 1.2) resetSim();
    } else {
      // sotto-passi: l'istante del boom non deve dipendere dal frame rate
      const total = dt * P.timeScale, n = Math.ceil(total / 0.05);
      for (let i = 0; i < n; i++) step(total / n);
    }
  }

  const C = getColors();
  drawScene(C, performance.now());
  drawGraph(C);
  updateReadout();
}

// ── Init ──────────────────────────────────────────────────────────────────────
Lab.initTheme('themeToggle');
resetSim();
resize();
buildControls();
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(canvas.parentElement);

document.getElementById('btnPlay').addEventListener('click', () => setRunning(!running));
document.getElementById('btnReset').addEventListener('click', resetSim);

requestAnimationFrame(loop);
