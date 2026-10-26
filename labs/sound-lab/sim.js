'use strict';

// ── Parametri ────────────────────────────────────────────────────────────────
const P = {
  source: 'gen',        // 'gen' | 'mic' | 'file'
  wave: 'sine',         // sine | square | triangle | sawtooth | white | pink
  freq: 440,
  amp: 0.5,
  second: false,        // secondo tono (battimenti, accordi)
  freq2: 444,
  speakers: true,       // ascolto dagli altoparlanti
  loop: true,
  timebase: 3,          // indice in TIMEBASES
  vzoom: 1,
  logFreq: true,
  smoothing: 0.5,
  freeze: false,
  calib: 100,           // dB SPL stimati che corrispondono a 0 dBFS
};
const TIMEBASES = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];   // ms mostrati dall'oscilloscopio
const F_MIN = 20, F_MAX = 20000, DB_MIN = -110, DB_MAX = 0;

const WAVES = {
  sine:     { name: 'Sinusoidale', info: '<b>Sinusoide.</b> Un tono puro: nello spettro c\'è un\'unica riga, alla frequenza scelta. Tutti gli altri suoni si possono scomporre in somme di sinusoidi (teorema di Fourier).' },
  square:   { name: 'Quadra', info: '<b>Onda quadra.</b> Contiene solo le armoniche dispari (f, 3f, 5f, …) con ampiezza 1/n: la terza armonica è 1/3 della fondamentale (−9,5 dB), la quinta 1/5 (−14 dB). Ha un suono «vuoto», da clarinetto o da vecchio videogioco.' },
  triangle: { name: 'Triangolare', info: '<b>Onda triangolare.</b> Anche qui solo armoniche dispari, ma con ampiezza 1/n²: calano molto più in fretta che nell\'onda quadra (la terza è a −19 dB), quindi il suono è più morbido, vicino a quello del flauto.' },
  sawtooth: { name: 'Dente di sega', info: '<b>Dente di sega.</b> Contiene tutte le armoniche (f, 2f, 3f, …) con ampiezza 1/n. È il suono più ricco e brillante, simile a quello degli strumenti ad arco o degli ottoni.' },
  white:    { name: 'Rumore bianco', info: '<b>Rumore bianco.</b> Tutte le frequenze con la stessa intensità, in modo casuale: lo spettro è piatto e lo spettrogramma è uniforme. Suona come un fruscio acuto (la radio fra due stazioni).' },
  pink:     { name: 'Rumore rosa', info: '<b>Rumore rosa.</b> L\'intensità cala di 3 dB per ottava: ogni ottava contiene la stessa energia. Al nostro orecchio suona più equilibrato del rumore bianco, come la pioggia o una cascata.' },
};

// ── Audio ────────────────────────────────────────────────────────────────────
let audio = null;          // { ac, analyser, out }
let running = false;
let src = {};              // nodi della sorgente attiva
let fileBuffer = null, fileName = '';

function initAudio() {
  if (audio) return audio;
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const analyser = ac.createAnalyser();
  analyser.fftSize = 32768;          // ~0,7 s a 48 kHz: basta per vedere i battimenti
  analyser.minDecibels = DB_MIN; analyser.maxDecibels = DB_MAX;
  analyser.smoothingTimeConstant = P.smoothing;
  const out = ac.createGain();
  out.gain.value = P.speakers ? 1 : 0;
  analyser.connect(out); out.connect(ac.destination);
  audio = { ac, analyser, out, time: new Float32Array(analyser.fftSize), freq: new Float32Array(analyser.frequencyBinCount) };
  return audio;
}

// Rumore in un buffer da qualche secondo, ripetuto: bianco, oppure rosa (filtro di P. Kellet)
function noiseBuffer(ac, kind) {
  const n = ac.sampleRate * 4, buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') { d[i] = w * 0.5; continue; }
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856; b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return buf;
}

function stopSource() {
  for (const k of ['osc', 'osc2', 'noise', 'file']) if (src[k]) { try { src[k].stop(); } catch (e) { /* già fermo */ } }
  if (src.stream) src.stream.getTracks().forEach(t => t.stop());
  for (const k of Object.keys(src)) if (src[k] && src[k].disconnect) src[k].disconnect();
  src = {};
}

async function startSource() {
  const { ac, analyser } = initAudio();
  if (ac.state === 'suspended') await ac.resume();
  stopSource();
  setStatus('');
  if (P.source === 'gen') {
    const gain = ac.createGain();
    gain.gain.value = P.amp;
    gain.connect(analyser);
    src.gain = gain;
    if (P.wave === 'white' || P.wave === 'pink') {
      const nz = ac.createBufferSource();
      nz.buffer = noiseBuffer(ac, P.wave); nz.loop = true;
      nz.connect(gain); nz.start();
      src.noise = nz;
    } else {
      const osc = ac.createOscillator();
      osc.type = P.wave; osc.frequency.value = P.freq;
      osc.connect(gain); osc.start();
      src.osc = osc;
      if (P.second) {
        const osc2 = ac.createOscillator();
        osc2.type = P.wave; osc2.frequency.value = P.freq2;
        osc2.connect(gain); osc2.start();
        src.osc2 = osc2;
        gain.gain.value = P.amp / 2;            // due toni: la somma resta entro il fondo scala
      }
    }
  } else if (P.source === 'mic') {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus('Il browser non permette di usare il microfono da questa pagina (serve https o localhost).');
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      src.stream = stream;
      src.mic = ac.createMediaStreamSource(stream);
      src.mic.connect(analyser);
    } catch (e) {
      setStatus('Microfono non disponibile: ' + (e.name === 'NotAllowedError' ? 'permesso negato.' : e.message));
      return false;
    }
  } else {
    if (!fileBuffer) { setStatus('Scegli prima un file audio.'); return false; }
    const f = ac.createBufferSource();
    f.buffer = fileBuffer; f.loop = P.loop;
    f.connect(analyser); f.start();
    f.onended = () => { if (src.file === f) { running = false; syncPlay(); } };
    src.file = f;
  }
  return true;
}

async function setRunning(v) {
  if (v) { running = await startSource(); }
  else { stopSource(); running = false; }
  syncPlay();
}
function restartIfRunning() { if (running) setRunning(true); }

function applyLive() {
  if (!audio) return;
  const t = audio.ac.currentTime;
  audio.out.gain.setTargetAtTime(P.speakers ? 1 : 0, t, 0.02);
  audio.analyser.smoothingTimeConstant = P.smoothing;
  if (src.gain) src.gain.gain.setTargetAtTime(src.osc2 ? P.amp / 2 : P.amp, t, 0.02);
  if (src.osc) src.osc.frequency.setTargetAtTime(P.freq, t, 0.01);
  if (src.osc2) src.osc2.frequency.setTargetAtTime(P.freq2, t, 0.01);
}

// ── Canvas ───────────────────────────────────────────────────────────────────
const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');
const readoutEl = document.getElementById('readout');
let SW = 0, SH = 0, DPR = 1;

function resize() {
  DPR = window.devicePixelRatio || 1;
  const area = canvas.parentElement;
  SW = area.clientWidth;
  SH = Math.max(0, area.clientHeight - (readoutEl.offsetHeight || 0));
  canvas.width = Math.round(SW * DPR); canvas.height = Math.round(SH * DPR);
  canvas.style.width = SW + 'px'; canvas.style.height = SH + 'px';
  specImg = null;
}

function getCSSVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
let C = {};
function getColors() {
  const light = document.documentElement.dataset.theme === 'light';
  return {
    light,
    bg: getCSSVar('--bg1') || '#060a10', panel: getCSSVar('--bg2') || '#0b1018',
    text: getCSSVar('--text-primary') || '#ddeeff', muted: getCSSVar('--text-secondary') || '#6b8099',
    accent: getCSSVar('--accent') || '#00d4ff',
    grid: light ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.09)',
    trace: light ? '#0a8f3c' : '#4dff88', spec: light ? '#0a78b0' : '#3fd6ff', harm: light ? '#e8590c' : '#ffb44d',
    screen: light ? '#f4f8f5' : '#050b08',
  };
}

function text(str, x, y, { color = C.text, size = 11, align = 'left', bold = false, mono = false } = {}) {
  ctx.fillStyle = color;
  ctx.font = `${bold ? '700 ' : ''}${size}px ${mono ? 'Space Mono, monospace' : 'DM Sans, sans-serif'}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y + size * 0.06);
}
function card(x, y, w, h, title, right) {
  ctx.fillStyle = C.panel; ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 8); ctx.fill(); ctx.stroke();
  text(title, x + 12, y + 14, { size: 10.5, color: C.muted });
  if (right) text(right, x + w - 12, y + 14, { size: 10.5, color: C.muted, align: 'right', mono: true });
}
const fmt = (v, d) => v.toFixed(d).replace('.', ',');
const fmtHz = f => f >= 1000 ? fmt(f / 1000, f >= 10000 ? 1 : 2) + ' kHz' : fmt(f, f < 100 ? 1 : 0) + ' Hz';

// Scala delle frequenze (log o lineare) fra F_MIN e F_MAX
const fToU = f => P.logFreq ? Math.log(Math.max(f, F_MIN) / F_MIN) / Math.log(F_MAX / F_MIN) : (f - F_MIN) / (F_MAX - F_MIN);
const uToF = u => P.logFreq ? F_MIN * Math.pow(F_MAX / F_MIN, u) : F_MIN + u * (F_MAX - F_MIN);
const FREQ_TICKS_LOG = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const FREQ_TICKS_LIN = [20, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000, 20000];

// Valore in dB dello spettro fra due frequenze (massimo dei canali FFT, interpolato se il tratto è più stretto di un canale)
function dbBetween(fa, fb) {
  const { freq, ac } = audio, binHz = ac.sampleRate / audio.analyser.fftSize;
  const ia = fa / binHz, ib = fb / binHz;
  if (ib - ia < 1) {
    const i = Math.floor((ia + ib) / 2), fr = (ia + ib) / 2 - i;
    const a = freq[i] ?? DB_MIN, b = freq[i + 1] ?? DB_MIN;
    return a + (b - a) * fr;
  }
  let m = -Infinity;
  for (let i = Math.floor(ia); i <= Math.ceil(ib) && i < freq.length; i++) m = Math.max(m, freq[i]);
  return m;
}

// ── Misure ───────────────────────────────────────────────────────────────────
const M = { rms: 0, peak: 0, peakHold: -120, peakHoldT: 0, domF: 0, domDb: DB_MIN, hist: [] };
function measure(dt) {
  const { time, freq, analyser, ac } = audio;
  analyser.getFloatTimeDomainData(time);
  analyser.getFloatFrequencyData(freq);
  let s = 0, pk = 0;
  const n0 = Math.max(0, time.length - 2048);
  for (let i = n0; i < time.length; i++) { s += time[i] * time[i]; pk = Math.max(pk, Math.abs(time[i])); }
  M.rms = Math.sqrt(s / (time.length - n0)); M.peak = pk;
  const db = 20 * Math.log10(Math.max(M.rms, 1e-7));
  const pdb = 20 * Math.log10(Math.max(pk, 1e-7));
  M.peakHoldT -= dt;
  if (pdb > M.peakHold || M.peakHoldT <= 0) { M.peakHold = pdb; M.peakHoldT = 1.5; }
  M.hist.push(db); if (M.hist.length > 600) M.hist.shift();
  // frequenza dominante: canale più forte, con interpolazione parabolica fra i vicini
  const binHz = ac.sampleRate / analyser.fftSize;
  let bi = 0, bv = -Infinity;
  for (let i = Math.ceil(F_MIN / binHz); i < freq.length - 1; i++) if (freq[i] > bv) { bv = freq[i]; bi = i; }
  const a = freq[bi - 1], b = freq[bi], c = freq[bi + 1];
  const off = (a - 2 * b + c) !== 0 ? 0.5 * (a - c) / (a - 2 * b + c) : 0;
  M.domF = (bi + Math.max(-0.5, Math.min(0.5, off))) * binHz;
  M.domDb = bv;
}

// ── Oscilloscopio ────────────────────────────────────────────────────────────
function drawScope(x, y, w, h) {
  const winMs = TIMEBASES[P.timebase];
  card(x, y, w, h, 'Oscilloscopio', `${fmt(winMs / 10, winMs < 10 ? 2 : 1)} ms/div · ×${P.vzoom}`);
  const L = x + 12, R = x + w - 12, T = y + 28, B = y + h - 22, mid = (T + B) / 2;
  ctx.fillStyle = C.screen; ctx.fillRect(L, T, R - L, B - T);
  ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) { const gx = L + (R - L) * i / 10; ctx.beginPath(); ctx.moveTo(gx, T); ctx.lineTo(gx, B); ctx.stroke(); }
  for (let j = 0; j <= 8; j++) { const gy = T + (B - T) * j / 8; ctx.beginPath(); ctx.moveTo(L, gy); ctx.lineTo(R, gy); ctx.stroke(); }
  text('0', L, B + 10, { size: 9, color: C.muted });
  text(`${fmt(winMs, winMs < 1 ? 1 : 0)} ms`, R, B + 10, { size: 9, color: C.muted, align: 'right' });
  if (!audio || !running) { text('premi AVVIA', (L + R) / 2, mid, { size: 12, color: C.muted, align: 'center' }); return; }

  const { time, ac } = audio;
  const n = Math.min(time.length - 1, Math.round(winMs / 1000 * ac.sampleRate));
  // trigger: prima salita attraverso lo zero, così la traccia sta ferma
  let start = 0;
  for (let i = 1; i < time.length - n; i++) if (time[i - 1] < 0 && time[i] >= 0) { start = i; break; }
  ctx.save();
  ctx.beginPath(); ctx.rect(L, T, R - L, B - T); ctx.clip();
  ctx.strokeStyle = C.trace; ctx.lineWidth = 1.6;
  ctx.shadowColor = C.trace; ctx.shadowBlur = C.light ? 0 : 6;
  ctx.beginPath();
  const step = Math.max(1, Math.floor(n / ((R - L) * 2)));
  for (let i = 0; i <= n; i += step) {
    const px = L + i / n * (R - L), py = mid - time[start + i] * P.vzoom * (B - T) / 2;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
}

// ── Analizzatore di spettro ──────────────────────────────────────────────────
function drawSpectrum(x, y, w, h) {
  card(x, y, w, h, 'Analizzatore di spettro (dBFS)', running && audio && M.domDb > DB_MIN + 20 ? `picco ${fmtHz(M.domF)} · ${fmt(M.domDb, 0)} dB` : '');
  const L = x + 40, R = x + w - 12, T = y + 28, B = y + h - 22;
  const X = f => L + fToU(f) * (R - L), Y = db => T + (DB_MAX - db) / (DB_MAX - DB_MIN) * (B - T);
  ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
  for (const db of [0, -20, -40, -60, -80, -100]) {
    ctx.beginPath(); ctx.moveTo(L, Y(db)); ctx.lineTo(R, Y(db)); ctx.stroke();
    text(String(db), L - 5, Y(db), { size: 9, color: C.muted, align: 'right', mono: true });
  }
  const ticks = P.logFreq ? FREQ_TICKS_LOG : FREQ_TICKS_LIN;
  let lastLabel = -Infinity;
  ticks.forEach((f, i) => {
    const gx = X(f);
    ctx.beginPath(); ctx.moveTo(gx, T); ctx.lineTo(gx, B); ctx.stroke();
    const room = f === F_MAX ? 46 : 28;
    if (gx - lastLabel < room) return;
    lastLabel = gx;
    if (P.logFreq || i % 2 === 0) text((f >= 1000 ? (f / 1000) + 'k' : String(f)) + (f === F_MAX ? ' Hz' : ''), gx, B + 10, { size: 9, color: C.muted, align: f === F_MAX ? 'right' : 'center' });
  });
  if (!audio || !running) { text('premi AVVIA', (L + R) / 2, (T + B) / 2, { size: 12, color: C.muted, align: 'center' }); return; }

  // armoniche attese del generatore: dove l'onda scelta mette energia
  if (P.source === 'gen' && !['white', 'pink'].includes(P.wave)) {
    ctx.save(); ctx.setLineDash([3, 4]); ctx.strokeStyle = C.harm; ctx.globalAlpha = 0.6;
    for (let k = 1; k * P.freq <= F_MAX && k <= 40; k++) {
      if ((P.wave === 'square' || P.wave === 'triangle') && k % 2 === 0) continue;
      if (P.wave === 'sine' && k > 1) break;
      const gx = X(k * P.freq);
      ctx.beginPath(); ctx.moveTo(gx, T); ctx.lineTo(gx, B); ctx.stroke();
      if (k <= 7 && (X((k + 2) * P.freq) - gx > 16 || k === 1)) text(k === 1 ? 'f' : `${k}f`, gx + 3, T + 8, { size: 9, color: C.harm });
    }
    ctx.restore();
  }
  const cols = Math.round(R - L);
  ctx.beginPath(); ctx.moveTo(L, B);
  for (let c = 0; c <= cols; c++) {
    const db = Math.max(DB_MIN, Math.min(DB_MAX, dbBetween(uToF(c / cols), uToF((c + 1) / cols))));
    ctx.lineTo(L + c, Y(db));
  }
  ctx.lineTo(R, B); ctx.closePath();
  const g = ctx.createLinearGradient(0, T, 0, B);
  g.addColorStop(0, C.spec); g.addColorStop(1, C.light ? 'rgba(10,120,176,0.08)' : 'rgba(63,214,255,0.06)');
  ctx.fillStyle = g; ctx.globalAlpha = 0.55; ctx.fill(); ctx.globalAlpha = 1;
  ctx.strokeStyle = C.spec; ctx.lineWidth = 1.3; ctx.stroke();
  if (M.domDb > DB_MIN + 20) {
    ctx.beginPath(); ctx.arc(X(M.domF), Y(M.domDb), 4, 0, 2 * Math.PI); ctx.fillStyle = C.text; ctx.fill();
  }
}

// ── Spettrogramma ────────────────────────────────────────────────────────────
// Mappa colori tipo «magma»: dal nero (silenzio) al bianco-giallo (forte)
const LUT = (() => {
  const stops = [[0, 0, 0, 4], [0.25, 59, 15, 112], [0.5, 140, 41, 129], [0.7, 222, 73, 104], [0.85, 254, 159, 109], [1, 252, 253, 191]];
  const t = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    let k = 0; while (k < stops.length - 2 && v > stops[k + 1][0]) k++;
    const [a, b] = [stops[k], stops[k + 1]], f = (v - a[0]) / (b[0] - a[0]);
    for (let c = 0; c < 3; c++) t[i * 3 + c] = a[c + 1] + (b[c + 1] - a[c + 1]) * f;
  }
  return t;
})();
let specCanvas = null, specCtx = null, specImg = null, specW = 0, specH = 0;

function drawSpectrogram(x, y, w, h) {
  card(x, y, w, h, 'Spettrogramma (Hz)', 'tempo →');
  const L = x + 40, R = x + w - 12, T = y + 28, B = y + h - 22;
  const pw = Math.max(2, Math.round((R - L) * DPR)), ph = Math.max(2, Math.round((B - T) * DPR));
  if (!specCanvas || specW !== pw || specH !== ph || !specImg) {
    specCanvas = document.createElement('canvas'); specCanvas.width = pw; specCanvas.height = ph;
    specCtx = specCanvas.getContext('2d'); specCtx.fillStyle = '#000004'; specCtx.fillRect(0, 0, pw, ph);
    specImg = specCtx.createImageData(1, ph); specW = pw; specH = ph;
  }
  if (audio && running && !P.freeze) {
    const shift = Math.max(1, Math.round(DPR));
    specCtx.drawImage(specCanvas, -shift, 0);
    const d = specImg.data;
    for (let j = 0; j < ph; j++) {
      const u0 = 1 - (j + 1) / ph, u1 = 1 - j / ph;
      const db = dbBetween(uToF(u0), uToF(u1));
      const v = Math.max(0, Math.min(255, Math.round((db - DB_MIN) / (DB_MAX - DB_MIN) * 255)));
      d[j * 4] = LUT[v * 3]; d[j * 4 + 1] = LUT[v * 3 + 1]; d[j * 4 + 2] = LUT[v * 3 + 2]; d[j * 4 + 3] = 255;
    }
    for (let s = 0; s < shift; s++) specCtx.putImageData(specImg, pw - 1 - s, 0);
  }
  ctx.drawImage(specCanvas, L, T, R - L, B - T);
  const ticks = P.logFreq ? [50, 100, 200, 500, 1000, 2000, 5000, 10000] : [2000, 5000, 10000, 15000];
  for (const f of ticks) {
    const gy = B - fToU(f) * (B - T);
    text(f >= 1000 ? (f / 1000) + 'k' : String(f), L - 5, gy, { size: 9, color: C.muted, align: 'right' });
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.moveTo(L, gy); ctx.lineTo(L + 5, gy); ctx.stroke();
  }
  const secs = (R - L) / 60;   // circa 60 colonne al secondo
  text(`−${fmt(secs, 0)} s`, L, B + 10, { size: 9, color: C.muted });
  text('ora', R, B + 10, { size: 9, color: C.muted, align: 'right' });
}

// ── Livello sonoro ───────────────────────────────────────────────────────────
function drawMeter(x, y, w, h) {
  card(x, y, w, h, 'Livello sonoro');
  const on = audio && running;
  const db = on ? 20 * Math.log10(Math.max(M.rms, 1e-7)) : -Infinity;
  const T = y + 34, B = y + h - 104, bx = x + 20, bw = 26;
  const Y = v => T + (0 - Math.max(-60, Math.min(0, v))) / 60 * (B - T);
  // barra con zone verde / giallo / rosso
  const g = ctx.createLinearGradient(0, B, 0, T);
  g.addColorStop(0, '#2fbf5b'); g.addColorStop(0.7, '#2fbf5b'); g.addColorStop(0.85, '#f2c94c'); g.addColorStop(1, '#ff4d4d');
  ctx.fillStyle = C.screen; ctx.fillRect(bx, T, bw, B - T);
  if (on) { ctx.fillStyle = g; ctx.fillRect(bx, Y(db), bw, B - Y(db)); }
  ctx.strokeStyle = C.grid; ctx.strokeRect(bx + 0.5, T + 0.5, bw - 1, B - T - 1);
  for (const v of [0, -6, -12, -20, -30, -40, -50, -60]) {
    ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(bx + bw, Y(v)); ctx.lineTo(bx + bw + 5, Y(v)); ctx.stroke();
    text(String(v), bx + bw + 8, Y(v), { size: 9, color: C.muted, mono: true });
  }
  if (on && M.peakHold > -60) {
    ctx.fillStyle = C.text; ctx.fillRect(bx - 2, Y(M.peakHold) - 1, bw + 4, 2);
  }
  // valori numerici
  const vx = x + 92;
  const spl = db + P.calib;
  const dbs = v => v < -100 ? '< −100 dBFS' : `${fmt(v, 1)} dBFS`;
  const rows = [
    ['RMS', on ? dbs(db) : '—'],
    ['picco', on ? dbs(20 * Math.log10(Math.max(M.peak, 1e-7))) : '—'],
    ['stima', on ? (db < -100 ? 'silenzio' : `${fmt(Math.max(0, spl), 0)} dB SPL`) : '—'],
  ];
  rows.forEach(([k, v], i) => {
    text(k, vx, T + 8 + i * 34, { size: 10, color: C.muted });
    text(v, vx, T + 22 + i * 34, { size: 12, bold: true, mono: true });
  });
  // andamento del livello negli ultimi secondi
  const hy = y + h - 92, hh = 60, hx = x + 12, hw = w - 24;
  ctx.fillStyle = C.screen; ctx.fillRect(hx, hy, hw, hh);
  text('ultimi 10 s', hx + 4, hy + 8, { size: 8.5, color: C.muted });
  if (M.hist.length > 1) {
    ctx.strokeStyle = C.accent; ctx.lineWidth = 1.2; ctx.beginPath();
    M.hist.forEach((v, i) => {
      const px = hx + hw - (M.hist.length - 1 - i) / 600 * hw, py = hy + hh - (Math.max(-60, Math.min(0, v)) + 60) / 60 * hh;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.stroke();
  }
  text('dBFS = rispetto al massimo digitale', x + 12, y + h - 18, { size: 8.5, color: C.muted });
  text('dB SPL = stima, dipende dal microfono', x + 12, y + h - 8, { size: 8.5, color: C.muted });
}

// ── Composizione ─────────────────────────────────────────────────────────────
let statusMsg = '';
function setStatus(m) { statusMsg = m; }

function drawScene() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, SW, SH);
  if (SW < 200 || SH < 200) return;
  const pad = 10, gap = 10;
  const topH = Math.round((SH - pad * 2 - gap) * 0.5);
  const half = Math.round((SW - pad * 2 - gap) / 2);
  const meterW = Math.max(190, Math.min(240, SW * 0.2));
  drawScope(pad, pad, half, topH);
  drawSpectrum(pad + half + gap, pad, SW - pad * 2 - half - gap, topH);
  const by = pad + topH + gap, bh = SH - by - pad;
  drawSpectrogram(pad, by, SW - pad * 2 - meterW - gap, bh);
  drawMeter(SW - pad - meterW, by, meterW, bh);
  if (statusMsg) {
    ctx.font = '12px DM Sans, sans-serif';
    const tw = ctx.measureText(statusMsg).width + 24;
    ctx.fillStyle = C.light ? 'rgba(255,240,230,0.95)' : 'rgba(60,20,10,0.92)';
    ctx.beginPath(); ctx.roundRect(SW / 2 - tw / 2, SH / 2 - 16, tw, 32, 8); ctx.fill();
    text(statusMsg, SW / 2, SH / 2, { size: 12, color: C.light ? '#a33a00' : '#ffb48a', align: 'center' });
  }
}

// ── Readout ───────────────────────────────────────────────────────────────────
const readout = new Lab.Readout(readoutEl, [
  { key: 'src',  label: 'Sorgente' },
  { key: 'dom',  label: 'Frequenza' },
  { key: 'per',  label: 'Periodo' },
  { key: 'lam',  label: 'λ nell\'aria' },
  { key: 'lev',  label: 'Livello' },
]);
function updateReadout() {
  const on = audio && running;
  readout.set('src', P.source === 'gen' ? WAVES[P.wave].name
    : P.source === 'mic' ? 'Microfono' : (fileName || 'File audio'));
  const f = on && M.domDb > DB_MIN + 20 ? M.domF : 0;
  readout.set('dom', f ? fmtHz(f) : '—');
  readout.set('per', f ? `${fmt(1000 / f, f > 1000 ? 3 : 2)} ms` : '—');
  readout.set('lam', f ? `${fmt(343 / f, f > 1000 ? 3 : 2)} m` : '—');
  const lv = 20 * Math.log10(Math.max(M.rms, 1e-7));
  readout.set('lev', on ? (lv < -100 ? 'silenzio' : `${fmt(lv, 1)} dBFS`) : '—');
}

// ── Controlli ─────────────────────────────────────────────────────────────────
const boxCss = 'font-size:11px;color:var(--text-secondary);line-height:1.7;padding:10px 12px;background:var(--bg3);border-radius:8px;';
let infoBox, secGen, secMic, secFile, speakerToggle;

// Slider con valore mostrato da una funzione (per le scale logaritmiche)
function customSlider({ label, min, max, step, value, show, onChange }) {
  const group = document.createElement('div'); group.className = 'ctrl-group';
  const row = document.createElement('div'); row.className = 'ctrl-label-row';
  const lbl = document.createElement('span'); lbl.className = 'ctrl-label'; lbl.textContent = label;
  const val = document.createElement('span'); val.className = 'ctrl-value'; val.textContent = show(value);
  row.append(lbl, val);
  const input = document.createElement('input');
  Object.assign(input, { type: 'range', min, max, step, value, className: 'ctrl-slider' });
  input.addEventListener('input', () => { const v = parseFloat(input.value); val.textContent = show(v); onChange(v); });
  group.append(row, input);
  return { el: group, setValue(v) { input.value = v; val.textContent = show(v); } };
}
const logToHz = v => Math.round(Math.pow(10, v) * 10) / 10;

function buildControls() {
  const cont = document.getElementById('controls');
  cont.innerHTML = '';

  const secSrc = Lab.Section('Sorgente');
  secSrc.add(Lab.RadioGroup({
    label: 'Da dove viene il suono',
    options: [
      { value: 'gen',  label: 'Generatore', hint: 'onde' },
      { value: 'mic',  label: 'Microfono', hint: 'ascolta' },
      { value: 'file', label: 'File audio', hint: 'mp3, wav…' },
    ],
    value: P.source,
    onChange(v) {
      P.source = v;
      // con il microfono gli altoparlanti si spengono: eviterebbero il fischio dell'effetto Larsen
      P.speakers = v !== 'mic';
      speakerToggle.setValue(P.speakers);
      showSections(); applyLive(); restartIfRunning();
    },
  }));
  speakerToggle = Lab.Toggle({ label: 'Ascolta dagli altoparlanti', value: P.speakers, onChange(v) { P.speakers = v; applyLive(); } });
  secSrc.add(speakerToggle);

  // generatore
  secGen = Lab.Section('Generatore');
  secGen.add(Lab.RadioGroup({
    label: 'Forma d\'onda',
    options: Object.entries(WAVES).map(([value, w]) => ({ value, label: w.name })),
    value: P.wave,
    onChange(v) { P.wave = v; infoBox.innerHTML = WAVES[v].info; restartIfRunning(); },
  }));
  secGen.add(customSlider({ label: 'Frequenza', min: Math.log10(20), max: Math.log10(20000), step: 0.001, value: Math.log10(P.freq),
    show: v => fmtHz(logToHz(v)), onChange(v) { P.freq = logToHz(v); applyLive(); } }));
  secGen.add(customSlider({ label: 'Ampiezza', min: 0, max: 1, step: 0.01, value: P.amp,
    show: v => `${fmt(v, 2)} (${v > 0 ? fmt(20 * Math.log10(v), 1) : '−∞'} dB)`, onChange(v) { P.amp = v; applyLive(); } }));
  secGen.add(Lab.Toggle({ label: 'Secondo tono (battimenti)', value: P.second, onChange(v) { P.second = v; restartIfRunning(); } }));
  secGen.add(customSlider({ label: 'Frequenza del secondo tono', min: Math.log10(20), max: Math.log10(20000), step: 0.0005, value: Math.log10(P.freq2),
    show: v => fmtHz(logToHz(v)), onChange(v) { P.freq2 = logToHz(v); applyLive(); } }));
  infoBox = document.createElement('div');
  infoBox.style.cssText = boxCss + 'margin-bottom:6px;';
  infoBox.innerHTML = WAVES[P.wave].info;
  secGen.add(infoBox);

  // microfono
  secMic = Lab.Section('Microfono');
  const micInfo = document.createElement('div');
  micInfo.style.cssText = boxCss;
  micInfo.innerHTML = 'Premi AVVIA e consenti l\'accesso al microfono. Prova a fischiare (spettro con una sola riga), a cantare una vocale (fondamentale e armoniche) o a dire «sss» (rumore ad alta frequenza). Gli altoparlanti restano spenti per evitare il fischio dell\'effetto Larsen.';
  secMic.add(micInfo);

  // file
  secFile = Lab.Section('File audio');
  const fileRow = document.createElement('div');
  fileRow.className = 'ctrl-group';
  const fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.accept = 'audio/*';
  fileInput.style.cssText = 'width:100%;font-size:11px;color:var(--text-secondary);';
  const fileState = document.createElement('div');
  fileState.style.cssText = 'font-size:11px;color:var(--text-secondary);margin-top:6px;';
  fileState.textContent = fileName ? `Caricato: ${fileName}` : 'Nessun file caricato.';
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0];
    if (!f) return;
    fileState.textContent = 'Decodifica in corso…';
    try {
      const { ac } = initAudio();
      fileBuffer = await ac.decodeAudioData(await f.arrayBuffer());
      fileName = f.name;
      fileState.textContent = `Caricato: ${f.name} (${fmt(fileBuffer.duration, 1)} s)`;
      setRunning(true);
    } catch (e) {
      fileState.textContent = 'Formato non riconosciuto dal browser.';
    }
  });
  fileRow.append(fileInput, fileState);
  secFile.add(fileRow);
  secFile.add(Lab.Toggle({ label: 'Ripeti in loop', value: P.loop, onChange(v) { P.loop = v; if (src.file) src.file.loop = v; } }));

  // visualizzazione
  const secView = Lab.Section('Visualizzazione');
  secView.add(customSlider({ label: 'Oscilloscopio: finestra', min: 0, max: TIMEBASES.length - 1, step: 1, value: P.timebase,
    show: v => `${fmt(TIMEBASES[v], TIMEBASES[v] < 1 ? 1 : 0)} ms`, onChange(v) { P.timebase = v; } }));
  secView.add(customSlider({ label: 'Oscilloscopio: zoom verticale', min: 0, max: 5, step: 1, value: [1, 2, 5, 10, 20, 50].indexOf(P.vzoom),
    show: v => `×${[1, 2, 5, 10, 20, 50][v]}`, onChange(v) { P.vzoom = [1, 2, 5, 10, 20, 50][v]; } }));
  secView.add(Lab.RadioGroup({
    label: 'Asse delle frequenze',
    options: [{ value: 'log', label: 'Logaritmico', hint: 'come l\'orecchio' }, { value: 'lin', label: 'Lineare', hint: 'in Hz' }],
    value: P.logFreq ? 'log' : 'lin',
    onChange(v) { P.logFreq = v === 'log'; specImg = null; },
  }));
  secView.add(Lab.Slider({ label: 'Media dello spettro', min: 0, max: 0.95, step: 0.05, value: P.smoothing, onChange(v) { P.smoothing = v; applyLive(); } }));
  secView.add(Lab.Toggle({ label: 'Blocca i grafici', value: P.freeze, onChange(v) { P.freeze = v; } }));
  secView.add(Lab.Slider({ label: 'Calibrazione: dB SPL a 0 dBFS', min: 70, max: 130, step: 1, value: P.calib, onChange(v) { P.calib = v; } }));

  cont.append(secSrc.el, secGen.el, secMic.el, secFile.el, secView.el);
  showSections();
}
function showSections() {
  secGen.el.style.display = P.source === 'gen' ? '' : 'none';
  secMic.el.style.display = P.source === 'mic' ? '' : 'none';
  secFile.el.style.display = P.source === 'file' ? '' : 'none';
}

const btnPlay = document.getElementById('btnPlay');
function syncPlay() { btnPlay.textContent = running ? '■  FERMA' : '▶  AVVIA'; }
btnPlay.addEventListener('click', () => setRunning(!running));
document.getElementById('btnReset').addEventListener('click', () => {
  setRunning(false);
  Object.assign(P, { source: 'gen', wave: 'sine', freq: 440, amp: 0.5, second: false, freq2: 444, speakers: true, loop: true,
    timebase: 3, vzoom: 1, logFreq: true, smoothing: 0.5, freeze: false, calib: 100 });
  M.hist.length = 0; specImg = null; setStatus('');
  buildControls(); applyLive();
});

// ── Loop ─────────────────────────────────────────────────────────────────────
let lastTS = null;
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = lastTS === null ? 0 : Math.min((ts - lastTS) / 1000, 0.1);
  lastTS = ts;
  C = getColors();
  if (audio && running && !P.freeze) measure(dt);
  drawScene();
  updateReadout();
}

Lab.initTheme('themeToggle');
resize();
buildControls();
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(canvas.parentElement);
requestAnimationFrame(loop);
