/* Battimenti */
'use strict';

const params = {
  A1: 1.0,
  f1: 440,
  A2: 1.0,
  f2: 443,
};

// ── Physics ───────────────────────────────────────────────────────────────────
function fBeat()    { return Math.abs(params.f1 - params.f2); }
function TBeat()    { const fb = fBeat(); return fb > 0.001 ? 1 / fb : Infinity; }
function fCarrier() { return (params.f1 + params.f2) / 2; }

function y1(t)       { return params.A1 * Math.sin(2 * Math.PI * params.f1 * t); }
function y2(t)       { return params.A2 * Math.sin(2 * Math.PI * params.f2 * t); }
function ySum(t)     { return y1(t) + y2(t); }

// General amplitude envelope: sqrt(A1²+A2²+2·A1·A2·cos(2π·Δf·t))
function envelope(t) {
  const df = params.f1 - params.f2;
  return Math.sqrt(
    params.A1 ** 2 + params.A2 ** 2 +
    2 * params.A1 * params.A2 * Math.cos(2 * Math.PI * df * t)
  );
}

// ── Audio (Web Audio API) ─────────────────────────────────────────────────────
let audioCtx = null, osc1 = null, osc2 = null, gn1 = null, gn2 = null;
let audioOn  = false;

function startAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  osc1 = audioCtx.createOscillator();
  osc2 = audioCtx.createOscillator();
  gn1  = audioCtx.createGain();
  gn2  = audioCtx.createGain();
  const master = audioCtx.createGain();
  master.gain.value = 0.35;

  osc1.type = osc2.type = 'sine';
  osc1.frequency.value = params.f1;
  osc2.frequency.value = params.f2;
  gn1.gain.value = params.A1 * 0.5;
  gn2.gain.value = params.A2 * 0.5;

  osc1.connect(gn1); gn1.connect(master);
  osc2.connect(gn2); gn2.connect(master);
  master.connect(audioCtx.destination);
  osc1.start(); osc2.start();
  audioOn = true;
}

function updateAudio() {
  if (!audioCtx || !osc1) return;
  const now = audioCtx.currentTime;
  osc1.frequency.setTargetAtTime(params.f1, now, 0.02);
  osc2.frequency.setTargetAtTime(params.f2, now, 0.02);
  gn1.gain.setTargetAtTime(params.A1 * 0.5, now, 0.02);
  gn2.gain.setTargetAtTime(params.A2 * 0.5, now, 0.02);
}

function stopAudio() {
  if (osc1) { osc1.stop(); osc1 = null; }
  if (osc2) { osc2.stop(); osc2 = null; }
  if (audioCtx) { audioCtx.close(); audioCtx = null; }
  audioOn = false;
  document.getElementById('btnAudio').textContent = '🔊  ASCOLTA';
}

// ── Canvas ────────────────────────────────────────────────────────────────────
const simCv  = document.getElementById('simCanvas');
const simCtx = simCv.getContext('2d');
const grCv   = document.getElementById('graphCanvas');
const grCtx  = grCv.getContext('2d');

let SW = 0, SH = 0, GW = 0, GH = 0;

function isDark() { return document.documentElement.dataset.theme !== 'light'; }

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const par = simCv.parentElement;
  const gH  = document.getElementById('graphArea').offsetHeight || 180;
  const rH  = document.querySelector('.readout-bar')?.offsetHeight || 56;

  SW = par.clientWidth;
  SH = Math.max(160, par.clientHeight - gH - rH);
  simCv.width  = Math.round(SW * dpr);
  simCv.height = Math.round(SH * dpr);
  simCv.style.width  = SW + 'px';
  simCv.style.height = SH + 'px';
  simCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  GW = par.clientWidth;
  GH = document.getElementById('graphArea').clientHeight || 180;
  grCv.width  = Math.round(GW * dpr);
  grCv.height = Math.round(GH * dpr);
  grCv.style.width  = GW + 'px';
  grCv.style.height = GH + 'px';
  grCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// Shared colour constants (follow grey scheme from memory)
const CC = {
  dark:  { ax: 'rgba(200,220,255,0.35)', gr: 'rgba(255,255,255,0.05)', tk: '#6b8099', lb: '#6b8099' },
  light: { ax: 'rgba(0,0,0,0.28)',       gr: 'rgba(0,0,0,0.06)',       tk: '#4a6278', lb: '#4a6278' },
};
function cc(dk) { return dk ? CC.dark : CC.light; }

// ── Animation time ────────────────────────────────────────────────────────────
let animT = 0, lastTs = null, rafId = null;

// ── Wave strip drawing ────────────────────────────────────────────────────────
function drawWaveStrip(ctx, x, y, w, h, cfg, dk, tWin) {
  // cfg: { fn, label, color, yRange, showEnvelope }
  const c   = cc(dk);
  const t0  = 0;
  const t1  = tWin;
  const mid = y + h / 2;
  const pxA = (h / 2 - 5) / cfg.yRange;

  // Background
  ctx.fillStyle = dk ? '#0b1018' : '#f0f2f5';
  ctx.fillRect(x, y, w, h);

  // Zero line
  ctx.strokeStyle = c.ax; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, mid); ctx.lineTo(x + w, mid); ctx.stroke();

  // ±amplitude guide lines
  [1, -1].forEach(s => {
    const gy = mid - s * cfg.yRange * pxA;
    ctx.strokeStyle = c.gr; ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); ctx.stroke();
    ctx.setLineDash([]);
  });

  // Border
  ctx.strokeStyle = dk ? 'rgba(200,220,255,0.35)' : 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);

  const toX = t => x + (t - t0) / tWin * w;
  const toY = v => mid - v * pxA;

  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();

  if (cfg.showEnvelope) {
    const N  = Math.ceil(w * 2);
    const Nd = Math.ceil(w * 6);

    // Filled envelope band
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const t = t0 + i / N * tWin;
      i === 0 ? ctx.moveTo(toX(t), toY(envelope(t))) : ctx.lineTo(toX(t), toY(envelope(t)));
    }
    for (let i = N; i >= 0; i--) ctx.lineTo(toX(t0 + i / N * tWin), toY(-envelope(t0 + i / N * tWin)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,212,255,0.07)'; ctx.fill();

    // Dense wave texture inside envelope
    ctx.beginPath();
    for (let i = 0; i <= Nd; i++) {
      const t = t0 + i / Nd * tWin;
      i === 0 ? ctx.moveTo(toX(t), toY(cfg.fn(t))) : ctx.lineTo(toX(t), toY(cfg.fn(t)));
    }
    ctx.strokeStyle = cfg.color + 'aa'; ctx.lineWidth = 1; ctx.stroke();

    // Envelope outline (upper & lower)
    for (const s of [1, -1]) {
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const t = t0 + i / N * tWin;
        i === 0 ? ctx.moveTo(toX(t), toY(s * envelope(t))) : ctx.lineTo(toX(t), toY(s * envelope(t)));
      }
      ctx.strokeStyle = '#ffb833'; ctx.lineWidth = 2; ctx.stroke();
    }
  } else {
    // Individual wave — enough samples per period for clear oscillations
    const N = Math.ceil(w * 2);
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const t = t0 + i / N * tWin;
      i === 0 ? ctx.moveTo(toX(t), toY(cfg.fn(t))) : ctx.lineTo(toX(t), toY(cfg.fn(t)));
    }
    ctx.strokeStyle = cfg.color; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke();
  }

  ctx.restore();

  // Labels
  ctx.fillStyle = c.tk; ctx.font = '700 9px "Space Mono",monospace';
  ctx.textAlign = 'left';
  ctx.fillText(cfg.label, x + 5, y + 13);
  ctx.textAlign = 'right';
  ctx.fillText('Δt=' + Lab.fmt((tWin * 1000),1) + ' ms', x + w - 5, y + 13);
}

// ── Scene (three stacked waveform strips) ─────────────────────────────────────
function drawScene() {
  const ctx = simCtx;
  const dk  = isDark();
  ctx.clearRect(0, 0, SW, SH);

  // Fixed 50ms window for individual strips → cycle density changes visibly with frequency.
  // Fixed ±1.05 scale → wave height changes visibly with amplitude.
  const twInd = 0.05;
  const fb    = fBeat();
  const twSum = fb > 0.5 ? Math.min(3 / fb, 3.0) : 3.0;

  const PAD = 3;
  const h13 = Math.floor((SH - PAD * 4) / 3);
  const hSum = SH - PAD * 4 - h13 * 2;

  const yScl  = 1.05;
  const ySclS = params.A1 + params.A2 + 0.05;

  drawWaveStrip(ctx, 0, PAD,               SW, h13,  { fn: y1,   label: 'y₁ = A₁ · sin(2πf₁t)', color: '#4488ff', yRange: yScl,  showEnvelope: false }, dk, twInd);
  drawWaveStrip(ctx, 0, PAD*2+h13,         SW, h13,  { fn: y2,   label: 'y₂ = A₂ · sin(2πf₂t)', color: '#ffaa44', yRange: yScl,  showEnvelope: false }, dk, twInd);
  drawWaveStrip(ctx, 0, PAD*3+h13*2,       SW, hSum, { fn: ySum, label: 'y = y₁ + y₂',           color: '#00d4ff', yRange: ySclS, showEnvelope: true  }, dk, twSum);

  // Panel separators (cyan, intentional — matches other labs)
  const sepC = dk ? 'rgba(0,212,255,0.07)' : 'rgba(0,100,160,0.09)';
  ctx.strokeStyle = sepC; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, PAD*2+h13-0.5);   ctx.lineTo(SW, PAD*2+h13-0.5);   ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, PAD*3+h13*2-0.5); ctx.lineTo(SW, PAD*3+h13*2-0.5); ctx.stroke();
}

// ── Graph utilities ───────────────────────────────────────────────────────────
function niceTicks(mn, mx, n = 4) {
  const r = mx - mn; if (r <= 0) return [mn];
  const raw = r / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const nm  = raw / mag;
  const step = (nm < 1.5 ? 1 : nm < 3.5 ? 2 : nm < 7.5 ? 5 : 10) * mag;
  const tks = [];
  for (let i = Math.ceil(mn / step); i * step <= mx + step * 0.001; i++) {
    const v = +(i * step).toPrecision(10);
    if (v >= mn - step * 0.001) tks.push(v);
  }
  return tks;
}
function fmtTick(v) {
  if (v === 0) return '0';
  const a = Math.abs(v);
  const s = a >= 1000 ? Lab.fmt(v,0) : a >= 100 ? Lab.fmt(v,0) : a >= 10 ? Lab.fmt(v,1) : a >= 1 ? Lab.fmt(v,1) : Lab.fmt(v,2);
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

// ── Graph panels ──────────────────────────────────────────────────────────────
function drawGraphs() {
  const ctx = grCtx;
  const dk  = isDark();
  ctx.clearRect(0, 0, GW, GH);

  const half = Math.floor(GW / 2);
  drawSpectrumPanel(ctx, dk, 0,    0, half,      GH);
  drawEnvelopePanel(ctx, dk, half, 0, GW - half, GH);

  ctx.strokeStyle = dk ? 'rgba(0,212,255,0.08)' : 'rgba(0,100,160,0.10)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(half, 0); ctx.lineTo(half, GH); ctx.stroke();
}

function drawSpectrumPanel(ctx, dk, ox, oy, pw, ph) {
  const PAD = { t: 22, b: 28, l: 46, r: 10 };
  const il = ox + PAD.l, it = oy + PAD.t, iw = pw - PAD.l - PAD.r, ih = ph - PAD.t - PAD.b;
  const c = cc(dk);

  ctx.fillStyle = dk ? '#0b1018' : '#f0f2f5';
  ctx.fillRect(ox, oy, pw, ph);
  ctx.fillStyle = dk ? 'rgba(200,220,255,0.50)' : 'rgba(40,60,100,0.50)';
  ctx.font = "10px 'Space Mono',monospace"; ctx.textAlign = 'center';
  ctx.fillText('Spettro', ox + pw / 2, oy + 14);

  // X range: window around both frequencies
  const fMid  = fCarrier();
  const fSpan = Math.max(fBeat() * 3, 30);
  const fLo   = fMid - fSpan, fHi = fMid + fSpan;
  const Amax  = Math.max(params.A1, params.A2) * 1.3;

  const toX = f => il + (f - fLo) / (fHi - fLo) * iw;
  const toY = a => it + ih - a / Amax * ih;
  const fTks = niceTicks(fLo, fHi, 4);
  const yTks = niceTicks(0, Amax, 4);

  // Grid
  yTks.forEach(v => {
    const gy = toY(v); if (gy < it || gy > it + ih) return;
    ctx.strokeStyle = v < 1e-9 ? c.ax : c.gr; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(il, gy); ctx.lineTo(il + iw, gy); ctx.stroke();
  });

  ctx.strokeStyle = c.ax; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(il, it); ctx.lineTo(il, it + ih); ctx.stroke();
  ctx.strokeStyle = dk ? 'rgba(200,220,255,0.35)' : 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 1; ctx.strokeRect(il, it, iw, ih);

  // Y tick labels
  ctx.font = '700 9px "Space Mono",monospace'; ctx.textAlign = 'right';
  yTks.forEach(v => {
    const gy = toY(v); if (gy < it - 4 || gy > it + ih + 4) return;
    ctx.strokeStyle = c.ax; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(il - 4, gy); ctx.lineTo(il, gy); ctx.stroke();
    ctx.fillStyle = c.tk; ctx.fillText(fmtTick(v), il - 6, gy + 4);
  });
  ctx.save();
  ctx.translate(ox + 10, it + ih / 2); ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center'; ctx.fillStyle = c.lb;
  ctx.font = '700 9px "Space Mono",monospace'; ctx.fillText('Ampiezza', 0, 0);
  ctx.restore();

  // X tick labels
  ctx.textAlign = 'center';
  fTks.forEach(f => {
    const gx = toX(f); if (gx < il || gx > il + iw) return;
    ctx.strokeStyle = c.ax; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(gx, it + ih); ctx.lineTo(gx, it + ih + 4); ctx.stroke();
    ctx.fillStyle = c.tk; ctx.font = '700 9px "Space Mono",monospace';
    ctx.fillText(fmtTick(f), gx, it + ih + 15);
  });
  ctx.fillStyle = c.lb; ctx.font = '700 9px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText('f (Hz)', il + iw / 2, it + ih + 26);

  // Frequency bars (clipped)
  ctx.save();
  ctx.beginPath(); ctx.rect(il, it, iw, ih); ctx.clip();

  [[params.f1, params.A1, '#4488ff', 'f₁'], [params.f2, params.A2, '#ffaa44', 'f₂']].forEach(([f, A, col, lbl]) => {
    const gx = toX(f), gy = toY(A);
    const bw = Math.max(4, iw * 0.05);
    ctx.fillStyle = col + (dk ? '88' : '77');
    ctx.fillRect(gx - bw / 2, gy, bw, it + ih - gy);
    ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    ctx.strokeRect(gx - bw / 2, gy, bw, it + ih - gy);
    // Dashed vertical marker
    ctx.save(); ctx.setLineDash([3, 3]);
    ctx.strokeStyle = col + '66'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(gx, it); ctx.lineTo(gx, gy); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
  });
  ctx.restore();

  // Bar labels outside clip
  [[params.f1, params.A1, '#4488ff', 'f₁'], [params.f2, params.A2, '#ffaa44', 'f₂']].forEach(([f, A, col, lbl]) => {
    const gx = Math.max(il + 12, Math.min(il + iw - 12, toX(f)));
    const gy = Math.max(it + 4, toY(A));
    ctx.fillStyle = col; ctx.font = '700 9px "Space Mono",monospace'; ctx.textAlign = 'center';
    ctx.fillText(lbl + '=' + f + ' Hz', gx, gy - 4);
  });
}

function drawEnvelopePanel(ctx, dk, ox, oy, pw, ph) {
  const PAD = { t: 22, b: 28, l: 46, r: 10 };
  const il = ox + PAD.l, it = oy + PAD.t, iw = pw - PAD.l - PAD.r, ih = ph - PAD.t - PAD.b;
  const c = cc(dk);

  ctx.fillStyle = dk ? '#0b1018' : '#f0f2f5';
  ctx.fillRect(ox, oy, pw, ph);
  ctx.fillStyle = dk ? 'rgba(200,220,255,0.50)' : 'rgba(40,60,100,0.50)';
  ctx.font = "10px 'Space Mono',monospace"; ctx.textAlign = 'center';
  ctx.fillText('Inviluppo (1 periodo)', ox + pw / 2, oy + 14);

  const Amax = (params.A1 + params.A2) * 1.15;
  const fb   = fBeat();
  const Tb   = fb > 0.001 ? 1 / fb : 1.0;
  const yTks = niceTicks(0, Amax, 4);
  const tTks = niceTicks(0, Tb * 1000, 4);

  const toX = t  => il + (t / Tb) * iw;
  const toY = a  => it + ih - a / Amax * ih;
  const N   = Math.ceil(iw * 2);

  // Grid
  yTks.forEach(v => {
    const gy = toY(v); if (gy < it || gy > it + ih) return;
    ctx.strokeStyle = v < 1e-9 ? c.ax : c.gr; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(il, gy); ctx.lineTo(il + iw, gy); ctx.stroke();
  });

  ctx.strokeStyle = c.ax; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(il, it); ctx.lineTo(il, it + ih); ctx.stroke();
  ctx.strokeStyle = dk ? 'rgba(200,220,255,0.35)' : 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 1; ctx.strokeRect(il, it, iw, ih);

  // Y ticks
  ctx.font = '700 9px "Space Mono",monospace'; ctx.textAlign = 'right';
  yTks.forEach(v => {
    const gy = toY(v); if (gy < it - 4 || gy > it + ih + 4) return;
    ctx.strokeStyle = c.ax; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(il - 4, gy); ctx.lineTo(il, gy); ctx.stroke();
    ctx.fillStyle = c.tk; ctx.fillText(fmtTick(v), il - 6, gy + 4);
  });
  ctx.save();
  ctx.translate(ox + 10, it + ih / 2); ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center'; ctx.fillStyle = c.lb;
  ctx.font = '700 9px "Space Mono",monospace'; ctx.fillText('Ampiezza', 0, 0);
  ctx.restore();

  // X ticks (in ms)
  ctx.textAlign = 'center';
  tTks.forEach(tms => {
    const gx = il + (tms / 1000 / Tb) * iw;
    if (gx < il || gx > il + iw) return;
    ctx.strokeStyle = c.ax; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(gx, it + ih); ctx.lineTo(gx, it + ih + 4); ctx.stroke();
    ctx.fillStyle = c.tk; ctx.font = '700 9px "Space Mono",monospace';
    ctx.fillText(fmtTick(tms), gx, it + ih + 15);
  });
  ctx.fillStyle = c.lb; ctx.font = '700 9px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText('t (ms)', il + iw / 2, it + ih + 26);

  // Draw clipped content
  ctx.save();
  ctx.beginPath(); ctx.rect(il, it, iw, ih); ctx.clip();

  // Shaded area under envelope
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const t = i / N * Tb;
    i === 0 ? ctx.moveTo(toX(t), toY(envelope(t))) : ctx.lineTo(toX(t), toY(envelope(t)));
  }
  ctx.lineTo(il + iw, it + ih); ctx.lineTo(il, it + ih); ctx.closePath();
  ctx.fillStyle = 'rgba(255,184,51,0.10)'; ctx.fill();

  // Envelope curve
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const t = i / N * Tb;
    i === 0 ? ctx.moveTo(toX(t), toY(envelope(t))) : ctx.lineTo(toX(t), toY(envelope(t)));
  }
  ctx.strokeStyle = '#ffb833'; ctx.lineWidth = 2; ctx.stroke();

  // Max (A1+A2) and min (|A1-A2|) dashed reference lines
  const eMax = params.A1 + params.A2;
  const eMin = Math.abs(params.A1 - params.A2);
  [[eMax, 'A₁+A₂'], [eMin, '|A₁−A₂|']].forEach(([val, lbl]) => {
    if (val < 0.02 || val > Amax) return;
    const gy = toY(val);
    ctx.save(); ctx.setLineDash([4, 4]);
    ctx.strokeStyle = c.gr; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(il, gy); ctx.lineTo(il + iw, gy); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
    ctx.fillStyle = c.tk; ctx.font = '700 8px "Space Mono",monospace'; ctx.textAlign = 'left';
    ctx.fillText(lbl, il + 3, gy - 3);
  });

  ctx.restore();
}

// ── Readout ───────────────────────────────────────────────────────────────────
const rdout = new Lab.Readout(document.getElementById('readout'), [
  { key: 'f1',   label: 'frequenza f₁' },
  { key: 'f2',   label: 'frequenza f₂' },
  { key: 'fbat', label: 'battimenti |f₁ − f₂|' },
  { key: 'Tbat', label: 'periodo dei battimenti' },
  { key: 'f0',   label: 'portante (f₁ + f₂)/2' },
]);

function updateReadout() {
  const fb = fBeat(), Tb = TBeat();
  rdout.set('f1',   Lab.fmt(params.f1,1) + ' Hz');
  rdout.set('f2',   Lab.fmt(params.f2,1) + ' Hz');
  rdout.set('fbat', Lab.fmt(fb,2) + ' Hz');
  rdout.set('Tbat', isFinite(Tb) ? Lab.fmt(Tb,3) + ' s' : '∞');
  rdout.set('f0',   Lab.fmt(fCarrier(),1) + ' Hz');
}

// ── Controls ──────────────────────────────────────────────────────────────────
function buildControls() {
  const cont = document.getElementById('controls');
  cont.innerHTML = '';

  const sec1 = Lab.Section('Onda 1');
  sec1
    .add(Lab.SliderInput({ label: 'Ampiezza A₁', min: 0.1, max: 1.0, value: params.A1, step: 0.05, unit: '',
      onChange: v => { params.A1 = v; updateAudio(); updateReadout(); drawScene(); drawGraphs(); } }))
    .add(Lab.SliderInput({ label: 'Frequenza f₁', min: 300, max: 600, value: params.f1, step: 0.5, unit: ' Hz',
      onChange: v => { params.f1 = v; updateAudio(); updateReadout(); drawScene(); drawGraphs(); } }));

  const sec2 = Lab.Section('Onda 2');
  sec2
    .add(Lab.SliderInput({ label: 'Ampiezza A₂', min: 0.1, max: 1.0, value: params.A2, step: 0.05, unit: '',
      onChange: v => { params.A2 = v; updateAudio(); updateReadout(); drawScene(); drawGraphs(); } }))
    .add(Lab.SliderInput({ label: 'Frequenza f₂', min: 300, max: 600, value: params.f2, step: 0.5, unit: ' Hz',
      onChange: v => { params.f2 = v; updateAudio(); updateReadout(); drawScene(); drawGraphs(); } }));

  cont.appendChild(sec1.el);
  cont.appendChild(sec2.el);
}

// ── Animation loop ────────────────────────────────────────────────────────────
function tick(ts) {
  if (lastTs !== null) animT += Math.min((ts - lastTs) / 1000, 0.05);
  lastTs = ts;
  drawScene();
  rafId = requestAnimationFrame(tick);
}

// ── Init ──────────────────────────────────────────────────────────────────────
Lab.initTheme();
buildControls();
updateReadout();

new ResizeObserver(() => { resize(); drawScene(); drawGraphs(); }).observe(simCv.parentElement);
new MutationObserver(() => { drawScene(); drawGraphs(); })
  .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

document.getElementById('btnAudio').addEventListener('click', () => {
  if (audioOn) {
    stopAudio();
  } else {
    startAudio();
    document.getElementById('btnAudio').textContent = '🔇  MUTO';
  }
});

document.getElementById('btnReset').addEventListener('click', () => {
  stopAudio();
  params.A1 = 1.0; params.f1 = 440;
  params.A2 = 1.0; params.f2 = 443;
  buildControls();
  updateReadout();
  drawGraphs();
});

requestAnimationFrame(ts => {
  resize();
  drawGraphs();
  lastTs = ts;
  rafId = requestAnimationFrame(tick);
});
