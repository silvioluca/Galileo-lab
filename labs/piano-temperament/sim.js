'use strict';

// ── Temperamenti ─────────────────────────────────────────────────────────────
// Ogni temperamento dà, per i 12 semitoni sopra la tonica, la distanza in cent (1200·log₂ r)
// e, se c'è, il rapporto esatto come frazione.
const cents = r => 1200 * Math.log2(r);
const frac = s => { const [a, b] = s.split('/').map(Number); return a / b; };
const MEANTONE_FIFTH = cents(Math.pow(5, 0.25));            // quinta ristretta di 1/4 di comma sintonico
const MEANTONE_CHAIN = [0, 7, 2, -3, 4, -1, 6, 1, 8, 3, -2, 5]; // posizione di ogni semitono nella catena di quinte

const TEMPERAMENTS = {
  equal: {
    name: 'Equabile', hint: '2^(1/12)',
    cents: Array.from({ length: 12 }, (_, k) => 100 * k),
    info: '<b>Temperamento equabile.</b> L\'ottava è divisa in 12 semitoni tutti uguali, di rapporto ¹²√2 ≈ 1,05946. Tutte le tonalità suonano allo stesso modo, ma nessun intervallo tranne l\'ottava è puro: la quinta è più stretta di 2 cent rispetto a 3/2, la terza maggiore più larga di 13,7 cent rispetto a 5/4. Prova un accordo maggiore con il timbro «organo»: si sentono i battimenti. È l\'accordatura dei pianoforti moderni.',
  },
  just: {
    name: 'Naturale (giusto)', hint: 'rapporti interi',
    fracs: ['1/1', '16/15', '9/8', '6/5', '5/4', '4/3', '45/32', '3/2', '8/5', '5/3', '9/5', '15/8'],
    info: '<b>Intonazione naturale.</b> Le note hanno rapporti di numeri interi piccoli con la tonica: 5/4 per la terza maggiore, 3/2 per la quinta. Gli accordi della tonalità d\'accordatura sono perfettamente consonanti, senza battimenti. Ma cambiando tonalità alcuni intervalli stonano: la quinta Re–La, nell\'accordatura in Do, vale 40/27 ed è più stretta di un comma sintonico (81/80, 21,5 cent).',
  },
  pythagorean: {
    name: 'Pitagorico', hint: 'quinte 3/2',
    fracs: ['1/1', '256/243', '9/8', '32/27', '81/64', '4/3', '729/512', '3/2', '128/81', '27/16', '16/9', '243/128'],
    info: '<b>Accordatura pitagorica.</b> Si ottiene sovrapponendo quinte pure 3/2 e riportandole nell\'ottava. Le quinte sono perfette, tranne una: chiudendo il giro 12 quinte superano 7 ottave di un comma pitagorico (23,5 cent), che finisce tutto nella «quinta del lupo» (con tonica Do, fra Fa♯ e Do♯). Le terze maggiori, 81/64, sono molto larghe: +21,5 cent rispetto a 5/4.',
  },
  meantone: {
    name: 'Mesotonico 1/4 di comma', hint: 'terze 5/4',
    cents: MEANTONE_CHAIN.map(k => ((k * MEANTONE_FIFTH) % 1200 + 1200) % 1200),
    info: '<b>Temperamento mesotonico.</b> Ogni quinta è ristretta di 1/4 di comma sintonico, così quattro quinte di seguito danno una terza maggiore pura 5/4. Usato nel Rinascimento e nel primo Barocco: suona benissimo nelle tonalità con pochi diesis e bemolle, ma ha una quinta del lupo larghissima (con tonica Do, fra Sol♯ e Mi♭: 737,6 cent) e alcune terze inutilizzabili.',
  },
  werckmeister: {
    name: 'Werckmeister III', hint: 'buon temperamento',
    cents: [0, 90.225, 192.18, 294.135, 390.225, 498.045, 588.27, 696.09, 792.18, 888.27, 996.09, 1092.18],
    info: '<b>Werckmeister III (1691).</b> Un «buon temperamento»: quattro quinte (Do–Sol, Sol–Re, Re–La, Si–Fa♯) sono ristrette di 1/4 di comma pitagorico, le altre otto sono pure. Tutte le tonalità sono suonabili, ma ognuna ha un colore diverso: le tonalità vicine a Do hanno terze quasi pure, quelle lontane terze più aspre. È l\'epoca del Clavicembalo ben temperato di Bach.',
  },
};
for (const t of Object.values(TEMPERAMENTS)) if (t.fracs) t.cents = t.fracs.map(f => cents(frac(f)));
const ET = TEMPERAMENTS.equal.cents;

// Rapporti puri di riferimento per gli intervalli (per numero di semitoni)
const JUST_REF = ['1/1', '16/15', '9/8', '6/5', '5/4', '4/3', '45/32', '3/2', '8/5', '5/3', '9/5', '15/8', '2/1'];
const INTERVAL_NAMES = ['unisono', 'seconda minore', 'seconda maggiore', 'terza minore', 'terza maggiore', 'quarta giusta',
  'tritono', 'quinta giusta', 'sesta minore', 'sesta maggiore', 'settima minore', 'settima maggiore', 'ottava'];

const NAMES_IT = ['Do', 'Do♯', 'Re', 'Mi♭', 'Mi', 'Fa', 'Fa♯', 'Sol', 'La♭', 'La', 'Si♭', 'Si'];
const NAMES_EN = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const IS_BLACK = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];

// ── Parametri ────────────────────────────────────────────────────────────────
const P = {
  temp: 'equal',
  tonic: 0,          // semitono della tonica dell'accordatura (0 = Do)
  refA: 440,         // La4 di riferimento
  startOct: 3,       // la tastiera parte da Do3
  octaves: 2,
  english: false,
  showKeys: true,
  timbre: 'piano',   // 'piano' | 'organ' | 'sine'
  volume: 0.7,
  latch: false,      // pedale: le note restano finché non si ripremono
  freqLog: false,    // grafico note–frequenza: asse verticale logaritmico
};

// ── Frequenze ────────────────────────────────────────────────────────────────
// MIDI: Do4 = 60, La4 = 69. La tonica ha la stessa frequenza che avrebbe nel temperamento
// equabile; le altre note seguono i rapporti del temperamento scelto rispetto a lei.
const etFreq = m => P.refA * Math.pow(2, (m - 69) / 12);
function noteInfo(m) {
  const tonicMidi = 60 + P.tonic;
  const d = m - tonicMidi, k = ((d % 12) + 12) % 12, oct = Math.floor(d / 12);
  const t = TEMPERAMENTS[P.temp];
  const c = t.cents[k];
  const f = etFreq(tonicMidi) * Math.pow(2, oct + c / 1200);
  return { m, k, f, c, dev: c - ET[k], frac: t.fracs ? t.fracs[k] : null, ratio: Math.pow(2, c / 1200) };
}
const noteName = m => (P.english ? NAMES_EN : NAMES_IT)[m % 12] + (Math.floor(m / 12) - 1);
const fmt = (v, d) => v.toFixed(d).replace('.', ',');
const signed = (v, d) => (v > 0.005 ? '+' : v < -0.005 ? '−' : '±') + fmt(Math.abs(v), d);

// ── Audio ────────────────────────────────────────────────────────────────────
const HARMONICS = {
  piano: [1, 0.55, 0.32, 0.24, 0.13, 0.09, 0.06, 0.04, 0.025, 0.015],
  organ: [1, 0.7, 0.45, 0.35, 0.22, 0.16, 0.11, 0.08],
  sine:  [1],
};
let audio = null;
const voices = new Map();     // midi → { osc, gain }

function initAudio() {
  if (audio) return audio;
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const comp = ac.createDynamicsCompressor();
  const master = ac.createGain();
  master.gain.value = P.volume * 0.35;
  master.connect(comp); comp.connect(ac.destination);
  const waves = {};
  for (const [k, h] of Object.entries(HARMONICS)) {
    const real = new Float32Array(h.length + 1), imag = new Float32Array(h.length + 1);
    h.forEach((a, i) => { imag[i + 1] = a; });
    waves[k] = ac.createPeriodicWave(real, imag);
  }
  audio = { ac, master, waves };
  return audio;
}

function noteOn(m) {
  if (voices.has(m)) return;
  const { ac, master, waves } = initAudio();
  if (ac.state === 'suspended') ac.resume();
  const osc = ac.createOscillator(), gain = ac.createGain();
  osc.setPeriodicWave(waves[P.timbre]);
  osc.frequency.value = noteInfo(m).f;
  const t = ac.currentTime;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.5, t + 0.006);
  if (P.timbre === 'piano') gain.gain.setTargetAtTime(0, t + 0.02, 0.9);   // la corda si smorza
  else gain.gain.setTargetAtTime(0.38, t + 0.02, 0.15);
  osc.connect(gain); gain.connect(master);
  osc.start();
  voices.set(m, { osc, gain });
}

function noteOff(m) {
  const v = voices.get(m);
  if (!v) return;
  const t = audio.ac.currentTime;
  v.gain.gain.cancelScheduledValues(t);
  v.gain.gain.setValueAtTime(v.gain.gain.value, t);
  v.gain.gain.setTargetAtTime(0, t, P.timbre === 'piano' ? 0.12 : 0.05);
  v.osc.stop(t + 0.6);
  voices.delete(m);
}

// Cambiando temperamento o La di riferimento, le note che suonano si riaccordano dal vivo
function retuneVoices() {
  if (!audio) return;
  for (const [m, v] of voices) v.osc.frequency.setTargetAtTime(noteInfo(m).f, audio.ac.currentTime, 0.03);
  waveDirty = true;
}

// ── Note premute ─────────────────────────────────────────────────────────────
const held = new Map();       // midi → insieme delle sorgenti (mouse, tastiera, pedale)
let lastNote = 60;
let waveDirty = true;

function press(m, src) {
  if (!held.has(m)) { held.set(m, new Set()); noteOn(m); waveDirty = true; }
  held.get(m).add(src);
  lastNote = m;
}
function release(m, src) {
  const s = held.get(m);
  if (!s) return;
  s.delete(src);
  if (!s.size) { held.delete(m); noteOff(m); waveDirty = true; }
}
function releaseAll() { for (const m of [...held.keys()]) { held.delete(m); noteOff(m); } waveDirty = true; }

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
  // l'area dei grafici cresce con la finestra, ma lascia sempre spazio alla tastiera
  const avail = area.clientHeight - (readoutEl.offsetHeight || 56);
  const gh = Math.round(Math.max(170, Math.min(280, avail * 0.4, avail - 340)));
  if (graphArea.offsetHeight !== gh) { graphArea.style.height = gh + 'px'; graphArea.style.minHeight = '0'; }
  SW = area.clientWidth;
  SH = Math.max(0, area.clientHeight - gh - (readoutEl.offsetHeight || 0));
  canvas.width = Math.round(SW * DPR); canvas.height = Math.round(SH * DPR);
  canvas.style.width = SW + 'px'; canvas.style.height = SH + 'px';
  GW = graphArea.clientWidth; GH = graphArea.clientHeight;
  gCanvas.width = Math.round(GW * DPR); gCanvas.height = Math.round(GH * DPR);
  gCanvas.style.width = GW + 'px'; gCanvas.style.height = GH + 'px';
  waveDirty = true;
}

function getCSSVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
let C = {};
function getColors() {
  const light = document.documentElement.dataset.theme === 'light';
  return {
    light,
    bg: getCSSVar('--bg1') || '#060a10', panel: getCSSVar('--bg2') || '#0b1018', bg3: getCSSVar('--bg3') || '#111820',
    text: getCSSVar('--text-primary') || '#ddeeff', muted: getCSSVar('--text-secondary') || '#6b8099',
    accent: getCSSVar('--accent') || '#00d4ff',
    grid: light ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.12)',
    sharp: light ? '#c92a2a' : '#ff7b7b', flat: light ? '#1971c2' : '#6cb6ff', good: light ? '#2b8a3e' : '#4cd97b',
    white: light ? '#ffffff' : '#f2f4f7', whiteDown: light ? '#bfe9f7' : '#bfefff',
    black: '#15181d', blackDown: light ? '#0a6d8f' : '#0a7fa3',
    inkOnWhite: '#1d2733', mutedOnWhite: '#5d6b7a', inkOnBlack: '#e9eef5', mutedOnBlack: '#9aa7b6',
  };
}

function text(c, str, x, y, { color = C.text, size = 12, align = 'center', bold = false, mono = false } = {}) {
  c.fillStyle = color;
  c.font = `${bold ? '700 ' : ''}${size}px ${mono ? 'Space Mono, monospace' : 'DM Sans, sans-serif'}`;
  c.textAlign = align; c.textBaseline = 'middle';
  c.fillText(str, x, y + size * 0.06);
}
function fitText(c, str, maxW, size, opts = {}) {
  c.font = `${opts.bold ? '700 ' : ''}${size}px ${opts.mono ? 'Space Mono, monospace' : 'DM Sans, sans-serif'}`;
  const w = c.measureText(str).width;
  return w > maxW ? Math.max(7, size * maxW / w) : size;
}
// Spezza il testo in righe che stanno nella larghezza data
function wrapText(c, str, maxW, size, opts = {}) {
  c.font = `${opts.bold ? '700 ' : ''}${size}px ${opts.mono ? 'Space Mono, monospace' : 'DM Sans, sans-serif'}`;
  const lines = [];
  let cur = '';
  for (const w of str.split(' ')) {
    const t = cur ? cur + ' ' + w : w;
    if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
function card(c, x, y, w, h, title) {
  c.fillStyle = C.panel; c.strokeStyle = C.grid; c.lineWidth = 1;
  c.beginPath(); c.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 8); c.fill(); c.stroke();
  if (title) text(c, title, x + 12, y + 14, { size: 10.5, color: C.muted, align: 'left' });
}

// ── Tastiera ─────────────────────────────────────────────────────────────────
// Tasti della tastiera del computer (posizione fisica): due ottave a partire dal Do scelto
const KEY_CODES = ['KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY', 'KeyH', 'KeyU', 'KeyJ',
  'KeyK', 'KeyO', 'KeyL', 'KeyP', 'Semicolon', 'Quote'];
const KEY_LABELS = ['A', 'W', 'S', 'E', 'D', 'F', 'T', 'G', 'Y', 'H', 'U', 'J', 'K', 'O', 'L', 'P', 'Ò', 'À'];
let kbBase = 0;               // spostamento (in ottave) dei tasti del computer dentro la tastiera

let keyRects = [];
const firstMidi = () => 12 * (P.startOct + 1);
const lastMidi = () => firstMidi() + 12 * P.octaves;

function keyboardGeometry(x0, y0, w, h) {
  const whites = [];
  for (let m = firstMidi(); m <= lastMidi(); m++) if (!IS_BLACK[m % 12]) whites.push(m);
  const ww = w / whites.length, bw = ww * 0.6, bh = h * 0.52;
  const rects = [];
  whites.forEach((m, i) => rects.push({ m, black: false, x: x0 + i * ww, y: y0, w: ww, h }));
  for (let m = firstMidi(); m <= lastMidi(); m++) {
    if (!IS_BLACK[m % 12]) continue;
    const left = rects.find(r => !r.black && r.m === m - 1);
    rects.push({ m, black: true, x: left.x + ww - bw / 2, y: y0, w: bw, h: bh });
  }
  return { rects, ww, bw, bh };
}

function drawKeyboard(x0, y0, w, h) {
  const G = keyboardGeometry(x0, y0, w, h);
  keyRects = G.rects;
  const kbIndex = m => { const i = m - firstMidi() - kbBase * 12; return i >= 0 && i < KEY_CODES.length ? KEY_LABELS[i] : null; };
  const tonicPc = P.tonic;

  for (const r of G.rects) {
    const down = held.has(r.m), info = noteInfo(r.m);
    const ink = r.black ? C.inkOnBlack : C.inkOnWhite, sub = r.black ? C.mutedOnBlack : C.mutedOnWhite;
    ctx.fillStyle = r.black ? (down ? C.blackDown : C.black) : (down ? C.whiteDown : C.white);
    ctx.strokeStyle = C.light ? '#9aa7b6' : '#05070a'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(r.x + 0.5, r.y, r.w - 1, r.h, [0, 0, r.black ? 3 : 5, r.black ? 3 : 5]);
    ctx.fill(); ctx.stroke();
    if (r.black && !down) {                    // riflesso sul tasto nero
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(r.x + 3, r.y, r.w - 6, r.h * 0.12);
    }

    const cx = r.x + r.w / 2, maxW = r.w - 4;
    const s1 = Math.min(r.black ? 11 : 13.5, r.w * (r.black ? 0.34 : 0.27));
    const lines = [];
    lines.push([noteName(r.m), s1, ink, true, false]);
    lines.push([fmt(info.f, info.f < 1000 ? 1 : 0), s1 * 0.86, ink, false, true]);
    if (!r.black || r.w > 22) {
      lines.push([info.frac || fmt(info.ratio, 4), s1 * 0.8, sub, false, true]);
      if (P.temp !== 'equal') {
        lines.push([signed(info.dev, 1) + ' c', s1 * 0.74, Math.abs(info.dev) < 0.05 ? sub : info.dev > 0 ? C.sharp : C.flat, false, true]);
      }
    }
    const lh = s1 * 1.14;
    // spazio per le scritte: sotto i tasti neri (bianchi) o nella parte bassa del tasto nero,
    // lasciando libero il posto della lettera del computer
    const letterH = P.showKeys ? 17 : 4;
    const room = r.black ? r.h - letterH - 8 : r.h - G.bh - letterH - 8;
    const fitN = Math.max(1, Math.min(lines.length, Math.floor(room / lh)));
    lines.length = fitN;
    let ly = r.y + r.h - 10 - (lines.length - 1) * lh;
    for (const [str, size, color, bold, mono] of lines) {
      text(ctx, str, cx, ly, { size: fitText(ctx, str, maxW, size, { bold, mono }), color, bold, mono });
      ly += lh;
    }
    // tonica e tasto del computer
    if (r.m % 12 === tonicPc) {                // la tonica: un punto sopra il nome, se c'è posto
      const dy = r.y + r.h - 10 - (lines.length - 1) * lh - lh * 0.95;
      if (dy > (r.black ? r.y : r.y + G.bh) + letterH) {
        ctx.fillStyle = C.accent;
        ctx.beginPath(); ctx.arc(cx, dy, 3, 0, 2 * Math.PI); ctx.fill();
      }
    }
    const kl = P.showKeys ? kbIndex(r.m) : null;
    if (kl) {
      const ky = r.black ? r.y + 11 : r.y + G.bh + 10;
      text(ctx, kl, cx, ky, { size: Math.min(11, r.w * 0.3), color: sub, mono: true });
    }
  }
}

// ── Pannelli informativi (sopra la tastiera) ─────────────────────────────────
function pairAnalysis(m1, m2) {
  const a = noteInfo(m1), b = noteInfo(m2);
  const r = b.f / a.f, c = cents(r), semis = m2 - m1;
  const simple = semis % 12, octs = Math.floor(semis / 12);
  // rapporto puro più vicino, anche per intervalli più grandi di un'ottava, ridotto ai minimi termini
  const [p0, q0] = JUST_REF[simple].split('/').map(Number);
  const gcd = (u, v) => v ? gcd(v, u % v) : u;
  let p = p0 * Math.pow(2, octs), q = q0;
  const g = gcd(p, q); p /= g; q /= g;
  const dev = c - cents(p / q);
  // battimenti: l'armonica q-esima della nota acuta e la p-esima della grave quasi coincidono
  const beat = Math.abs(p * a.f - q * b.f);
  const name = simple === 0 ? (octs === 1 ? 'ottava' : `${octs} ottave`) : INTERVAL_NAMES[simple] + (octs ? ' (composta)' : '');
  return { a, b, r, c, dev, beat, name, pure: `${p}/${q}` };
}

function drawInfo(x, y, w, h) {
  const gap = 10, w1 = Math.max(220, Math.min(330, w * 0.34)), w2 = w - w1 - gap;
  // nota appena suonata
  card(ctx, x, y, w1, h, 'Ultima nota');
  const n = noteInfo(lastNote);
  text(ctx, noteName(lastNote), x + 12, y + 38, { size: 20, bold: true, align: 'left' });
  text(ctx, `${fmt(n.f, 2)} Hz`, x + w1 - 12, y + 38, { size: 16, bold: true, align: 'right', mono: true, color: C.accent });
  const rows = [
    ['rapporto con la tonica', n.frac ? `${n.frac} = ${fmt(n.ratio, 4)}` : fmt(n.ratio, 4)],
    ['dalla tonica', `${fmt(n.c, 1)} cent`],
    ['rispetto all\'equabile', `${signed(n.dev, 1)} cent`],
    ['periodo · λ nell\'aria', `${fmt(1000 / n.f, 2)} ms · ${fmt(343 / n.f, 2)} m`],
  ];
  const step = 18, fit = Math.max(1, Math.floor((h - 62) / step));
  rows.slice(0, fit).forEach(([k, v], i) => {
    const yy = y + 64 + i * step;
    ctx.font = '11px Space Mono, monospace';
    const vw = ctx.measureText(v).width;
    text(ctx, k, x + 12, yy, { size: fitText(ctx, k, w1 - 36 - vw, 11), color: C.muted, align: 'left' });
    text(ctx, v, x + w1 - 12, yy, { size: 11, mono: true, align: 'right' });
  });

  // intervalli fra le note premute
  const x2 = x + w1 + gap;
  card(ctx, x2, y, w2, h, 'Intervalli fra le note premute');
  const notes = [...held.keys()].sort((a, b) => a - b);
  if (notes.length < 2) {
    const tip = P.latch ? 'Pedale attivo: clicca più tasti per formare un accordo.'
      : 'Premi due o più note insieme (tastiera del computer, o attiva il pedale) per vedere i rapporti e i battimenti.';
    const lines = wrapText(ctx, tip, w2 - 40, 12);
    lines.forEach((ln, i) => text(ctx, ln, x2 + w2 / 2, y + h / 2 + 6 + (i - (lines.length - 1) / 2) * 17, { size: 12, color: C.muted }));
    return;
  }
  const pairs = [];
  for (let i = 0; i < notes.length; i++) for (let j = i + 1; j < notes.length; j++) pairs.push(pairAnalysis(notes[i], notes[j]));
  const wide = w2 >= 560;
  const fr = wide ? [0.0, 0.33, 0.5, 0.64, 0.86] : [0.0, 0.42, null, 0.6, 0.85];
  const cols = fr.map(f => f === null ? null : x2 + 12 + f * (w2 - 24));
  const head = ['intervallo', 'rapporto', 'cent', 'vs puro', 'battimenti'];
  head.forEach((t, i) => { if (cols[i] !== null) text(ctx, t, cols[i], y + 34, { size: 10, color: C.muted, align: 'left' }); });
  // ogni riga è alta quanto serve: il nome dell'intervallo va a capo se non sta nella colonna
  let yy = y + 46, shown = 0;
  for (const pr of pairs) {
    const label = `${noteName(pr.a.m)}–${noteName(pr.b.m)} ${pr.name}`;
    const labelW = cols[1] - cols[0] - 10;
    const lines = wrapText(ctx, label, labelW, 11);
    const rh = lines.length * 14 + 5;
    if (yy + rh > y + h - 4) break;
    const cy = yy + rh / 2;
    lines.forEach((ln, i) => text(ctx, ln, cols[0], cy + (i - (lines.length - 1) / 2) * 14, { size: 11, align: 'left' }));
    const cell = (str, i, color = C.text) => {
      const next = cols.slice(i + 1).find(v => v !== null) ?? x2 + w2 - 8;
      const ls = wrapText(ctx, str, next - cols[i] - 8, 11, { mono: true });
      ls.forEach((ln, k) => text(ctx, ln, cols[i], cy + (k - (ls.length - 1) / 2) * 14, { size: 11, mono: true, align: 'left', color }));
    };
    cell(fmt(pr.r, 4), 1);
    if (wide) cell(fmt(pr.c, 1), 2);
    const devCol = Math.abs(pr.dev) < 0.5 ? C.good : pr.dev > 0 ? C.sharp : C.flat;
    cell(`${signed(pr.dev, 1)} (${pr.pure})`, 3, devCol);
    cell(pr.beat < 0.05 ? 'nessuno' : pr.beat < 40 ? `${fmt(pr.beat, 1)} Hz` : '—', 4, pr.beat < 0.05 ? C.good : C.text);
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x2 + 12, yy + rh); ctx.lineTo(x2 + w2 - 12, yy + rh); ctx.stroke();
    yy += rh; shown++;
  }
  if (shown < pairs.length) text(ctx, `+ altri ${pairs.length - shown} intervalli`, x2 + w2 - 12, y + 14, { size: 10, color: C.muted, align: 'right' });
}

function drawScene() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, SW, SH);
  if (SW < 80 || SH < 80) return;
  const pad = 12;
  const infoH = Math.max(120, Math.min(170, SH * 0.36));
  drawInfo(pad, pad, SW - 2 * pad, infoH);
  drawKeyboard(pad, infoH + pad * 2, SW - 2 * pad, SH - infoH - pad * 3);
}

// ── Grafici (area in basso) ──────────────────────────────────────────────────
// Sinistra: scostamento di ogni nota dal temperamento equabile, con i rapporti naturali come punti
function drawDeviation(x0, w) {
  card(gctx, x0, 6, w, PH - 12, w > 420 ? `Scostamento dall'equabile (cent) · tonica ${(P.english ? NAMES_EN : NAMES_IT)[P.tonic]}` : 'Scostamento dall\'equabile (cent)');
  const L = x0 + 40, R = x0 + w - 12, T = 34, B = PH - 34;
  const YMAX = 30, y = v => (T + B) / 2 - v / YMAX * (B - T) / 2;
  gctx.strokeStyle = C.grid; gctx.lineWidth = 1;
  for (const v of [-30, -15, 0, 15, 30]) {
    gctx.beginPath(); gctx.moveTo(L, y(v)); gctx.lineTo(R, y(v)); gctx.stroke();
    text(gctx, (v > 0 ? '+' : '') + v, L - 6, y(v), { size: 9, color: C.muted, align: 'right', mono: true });
  }
  const t = TEMPERAMENTS[P.temp], cw = (R - L) / 12;
  for (let k = 0; k < 12; k++) {
    const cx = L + cw * (k + 0.5), dev = t.cents[k] - ET[k];
    gctx.fillStyle = dev > 0 ? C.sharp : C.flat;
    gctx.globalAlpha = 0.8;
    const yv = y(Math.max(-YMAX, Math.min(YMAX, dev)));
    gctx.fillRect(cx - cw * 0.3, Math.min(yv, y(0)), cw * 0.6, Math.max(1, Math.abs(yv - y(0))));
    gctx.globalAlpha = 1;
    const jd = cents(frac(JUST_REF[k])) - ET[k];                  // dove starebbe la nota pura
    gctx.beginPath(); gctx.arc(cx, y(jd), 3.2, 0, 2 * Math.PI);
    gctx.fillStyle = C.good; gctx.fill();
    const pc = (k + P.tonic) % 12;
    text(gctx, (P.english ? NAMES_EN : NAMES_IT)[pc], cx, B + 12, { size: Math.min(10, cw * 0.36), color: C.muted });
  }
  if (w > 420) {
    gctx.beginPath(); gctx.arc(x0 + w - 120, 20, 3.2, 0, 2 * Math.PI); gctx.fillStyle = C.good; gctx.fill();
    text(gctx, 'rapporto naturale', x0 + w - 112, 20, { size: 9.5, color: C.muted, align: 'left' });
  }
}

// Destra: inviluppo dell'onda sonora delle note premute su mezzo secondo. Il picco è preso su un
// periodo della nota più grave, così l'ampiezza che sale e scende per i battimenti è ben visibile.
let waveCache = null;
function drawWave(x0, w) {
  card(gctx, x0, 6, w, PH - 12, w > 360 ? 'Inviluppo del suono delle note premute (0,5 s)' : 'Inviluppo del suono (0,5 s)');
  const L = x0 + 12, R = x0 + w - 12, T = 30, B = PH - 22, mid = (T + B) / 2;
  const notes = [...held.keys()];
  if (!notes.length) { text(gctx, 'nessuna nota', (L + R) / 2, mid, { size: 11, color: C.muted }); return; }
  const cols = Math.max(10, Math.round(R - L));
  if (waveDirty || !waveCache || waveCache.length !== cols) {
    const h = HARMONICS[P.timbre], freqs = notes.map(m => noteInfo(m).f);
    const DUR = 0.5, RATE = 12000, N = Math.round(DUR * RATE);
    const amp = h.reduce((a, v) => a + v, 0) * notes.length;
    const sig = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const t = i / RATE;
      let v = 0;
      for (const f of freqs) for (let n = 0; n < h.length; n++) v += h[n] * Math.sin(2 * Math.PI * f * (n + 1) * t);
      sig[i] = v / amp;
    }
    const win = Math.max(2, Math.round(RATE / Math.min(...freqs)));
    waveCache = new Float32Array(cols);
    for (let c = 0; c < cols; c++) {
      const center = Math.round((c + 0.5) / cols * N);
      let pk = 0;
      for (let i = Math.max(0, center - win); i < Math.min(N, center + win); i++) pk = Math.max(pk, Math.abs(sig[i]));
      waveCache[c] = pk;
    }
    waveDirty = false;
  }
  const H2 = (B - T) / 2;
  gctx.beginPath();
  gctx.moveTo(L, mid);
  for (let c = 0; c < cols; c++) gctx.lineTo(L + c, mid - waveCache[c] * H2);
  for (let c = cols - 1; c >= 0; c--) gctx.lineTo(L + c, mid + waveCache[c] * H2);
  gctx.closePath();
  gctx.fillStyle = C.accent; gctx.globalAlpha = 0.35; gctx.fill(); gctx.globalAlpha = 1;
  gctx.strokeStyle = C.accent; gctx.lineWidth = 1.2;
  gctx.beginPath();
  for (let c = 0; c < cols; c++) c ? gctx.lineTo(L + c, mid - waveCache[c] * H2) : gctx.moveTo(L, mid - waveCache[c] * H2);
  gctx.stroke();
  gctx.strokeStyle = C.grid; gctx.beginPath(); gctx.moveTo(L, mid); gctx.lineTo(R, mid); gctx.stroke();
  for (const [t, lbl] of [[0, '0'], [0.25, '0,25 s'], [0.5, '0,5 s']]) {
    text(gctx, lbl, L + t / 0.5 * (R - L), B + 9, { size: 9, color: C.muted, align: t === 0 ? 'left' : t === 0.5 ? 'right' : 'center' });
  }
}

// Interruttore «Lineare | Log» nell'intestazione del grafico (cliccabile)
let scaleSwitch = [];
function drawScaleSwitch(right, cy) {
  const opts = [['lin', 'Lineare'], ['log', 'Log']];
  gctx.font = '600 10px DM Sans, sans-serif';
  const ws = opts.map(([, t]) => gctx.measureText(t).width + 16);
  let x = right - ws.reduce((a, b) => a + b, 0);
  scaleSwitch = [];
  gctx.beginPath(); gctx.roundRect(x - 0.5, cy - 9.5, ws[0] + ws[1] + 1, 19, 6);
  gctx.strokeStyle = C.grid; gctx.lineWidth = 1; gctx.stroke();
  opts.forEach(([key, t], i) => {
    const on = (key === 'log') === P.freqLog;
    if (on) {
      gctx.fillStyle = C.accent; gctx.globalAlpha = 0.22;
      gctx.beginPath(); gctx.roundRect(x, cy - 9, ws[i], 18, 5); gctx.fill(); gctx.globalAlpha = 1;
    }
    text(gctx, t, x + ws[i] / 2, cy, { size: 10, bold: on, color: on ? C.accent : C.muted });
    scaleSwitch.push({ key, x, y: cy - 9, w: ws[i], h: 18 });
    x += ws[i];
  });
}
function setFreqLog(v) {
  P.freqLog = v;
  if (freqLogToggle) freqLogToggle.setValue(v);
}
let freqLogToggle = null;
gCanvas.addEventListener('click', e => {
  const r = gCanvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  const hit = scaleSwitch.find(b => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
  if (hit) setFreqLog(hit.key === 'log');
});
gCanvas.addEventListener('mousemove', e => {
  const r = gCanvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  gCanvas.style.cursor = scaleSwitch.some(b => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) ? 'pointer' : 'default';
});

// Note (asse orizzontale, un passo per semitono) e frequenze (asse verticale). In scala lineare
// i punti salgono lungo una curva esponenziale: ogni ottava la frequenza raddoppia. In scala
// logaritmica la stessa curva diventa una retta, perché i semitoni equabili hanno tutti lo stesso
// rapporto. Le note del temperamento scelto sono i punti; la linea è il temperamento equabile.
function drawNoteFreq(x0, y0, w, h) {
  card(gctx, x0, y0, w, h, w > 330 ? 'Frequenza delle note' : 'Frequenze');
  drawScaleSwitch(x0 + w - 12, y0 + 14);
  const L = x0 + 48, R = x0 + w - 14, T = y0 + 30, B = y0 + h - 30;
  const m0 = firstMidi(), m1 = lastMidi();
  const fLo = noteInfo(m0).f, fHi = noteInfo(m1).f;
  const yMin = P.freqLog ? fLo / 1.12 : 0, yMax = fHi * (P.freqLog ? 1.12 : 1.06);
  const X = m => L + (m - m0 + 0.5) / (m1 - m0 + 1) * (R - L);
  const Y = f => P.freqLog
    ? B - Math.log(f / yMin) / Math.log(yMax / yMin) * (B - T)
    : B - (f - yMin) / (yMax - yMin) * (B - T);

  // griglia delle frequenze
  const ticks = [];
  if (P.freqLog) {
    for (let d = 10; d <= 10000; d *= 10) for (const k of [1, 2, 5]) { const f = d * k; if (f >= yMin && f <= yMax) ticks.push(f); }
  } else {
    const raw = (yMax - yMin) / 5, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 5, 10].map(k => k * mag).find(v => v >= raw);
    for (let f = 0; f <= yMax; f += step) ticks.push(f);
  }
  gctx.strokeStyle = C.grid; gctx.lineWidth = 1;
  for (const f of ticks) {
    const ty = Y(f);
    gctx.beginPath(); gctx.moveTo(L, ty); gctx.lineTo(R, ty); gctx.stroke();
    text(gctx, f >= 1000 ? fmt(f / 1000, f % 1000 ? 1 : 0) + 'k' : String(Math.round(f)), L - 5, ty, { size: 9, color: C.muted, align: 'right', mono: true });
  }
  text(gctx, 'Hz', L - 5, T - 12, { size: 9, color: C.muted, align: 'right' });

  // note sull'asse orizzontale: i Do sempre, gli altri tasti bianchi se c'è spazio
  const step = (R - L) / (m1 - m0 + 1);
  for (let m = m0; m <= m1; m++) {
    const isC = m % 12 === 0, white = !IS_BLACK[m % 12];
    if (isC) { gctx.strokeStyle = C.grid; gctx.beginPath(); gctx.moveTo(X(m), T); gctx.lineTo(X(m), B); gctx.stroke(); }
    if (isC || (white && step > 13)) {
      text(gctx, isC ? noteName(m) : (P.english ? NAMES_EN : NAMES_IT)[m % 12], X(m), B + 10,
        { size: isC ? 9.5 : 8, bold: isC, color: isC ? C.text : C.muted });
    }
  }

  // temperamento equabile come curva continua
  gctx.strokeStyle = C.muted; gctx.lineWidth = 1.2; gctx.setLineDash([4, 3]);
  gctx.beginPath();
  for (let i = 0; i <= 160; i++) {
    const m = m0 + (m1 - m0) * i / 160;
    const px = X(m), py = Y(etFreq(m));
    i ? gctx.lineTo(px, py) : gctx.moveTo(px, py);
  }
  gctx.stroke(); gctx.setLineDash([]);

  // ×2 fra un Do e il successivo: l'ottava raddoppia la frequenza
  for (let m = m0; m + 12 <= m1; m += 12) {
    if (m % 12) continue;
    const xa = X(m), xb = X(m + 12), ya = Y(noteInfo(m).f), yb = Y(noteInfo(m + 12).f);
    gctx.strokeStyle = C.accent; gctx.globalAlpha = 0.5; gctx.lineWidth = 1;
    gctx.beginPath(); gctx.moveTo(xa, ya); gctx.lineTo(xb, ya); gctx.lineTo(xb, yb); gctx.stroke();
    gctx.globalAlpha = 1;
    text(gctx, '×2', xb + 4, (ya + yb) / 2, { size: 9.5, bold: true, color: C.accent, align: 'left' });
  }

  // le note del temperamento scelto
  const r = Math.max(2, Math.min(4, step * 0.28));
  for (let m = m0; m <= m1; m++) {
    const info = noteInfo(m), px = X(m), py = Y(info.f), down = held.has(m), black = IS_BLACK[m % 12];
    gctx.beginPath(); gctx.arc(px, py, down ? r + 2 : r, 0, 2 * Math.PI);
    gctx.fillStyle = down ? C.accent : black ? C.panel : C.text; gctx.fill();
    gctx.strokeStyle = down ? C.accent : C.text; gctx.lineWidth = 1.2; gctx.stroke();
  }
  // etichette delle note premute
  const boxes = [];
  for (const m of [...held.keys()].sort((a, b) => a - b)) {
    if (m < m0 || m > m1) continue;
    const info = noteInfo(m), px = X(m), py = Y(info.f);
    // con molte note premute basta il nome: le frequenze sono già sui tasti
    const lbl = held.size > 2 ? noteName(m) : `${noteName(m)} · ${fmt(info.f, 1)} Hz`;
    gctx.font = '700 9.5px DM Sans, sans-serif';
    const tw = gctx.measureText(lbl).width;
    const align = px > R - 60 ? 'right' : px < L + 60 ? 'left' : 'center';
    const bx = align === 'left' ? px : align === 'right' ? px - tw : px - tw / 2;
    let ly = py - 12;
    const hits = y => boxes.some(b => bx < b.x + b.w + 4 && bx + tw + 4 > b.x && Math.abs(y - b.y) < 12);
    if (hits(ly)) ly = py + 13;
    if (hits(ly)) continue;
    boxes.push({ x: bx, y: ly, w: tw });
    text(gctx, lbl, px, ly, { size: 9.5, bold: true, color: C.accent, align });
  }
  // legenda
  const lx = L + 10, ly = T + 8;
  if (w > 380) {
    gctx.strokeStyle = C.muted; gctx.setLineDash([4, 3]); gctx.beginPath(); gctx.moveTo(lx, ly); gctx.lineTo(lx + 16, ly); gctx.stroke(); gctx.setLineDash([]);
    text(gctx, 'equabile', lx + 20, ly, { size: 9, color: C.muted });
    if (P.temp !== 'equal') {
      gctx.beginPath(); gctx.arc(lx + 78, ly, 3, 0, 2 * Math.PI); gctx.fillStyle = C.text; gctx.fill();
      text(gctx, TEMPERAMENTS[P.temp].name.split(' ')[0].toLowerCase(), lx + 85, ly, { size: 9, color: C.muted });
    }
  }
}

let PH = 0;   // altezza dei pannelli
function drawBottom() {
  gctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  gctx.fillStyle = C.panel; gctx.fillRect(0, 0, GW, GH);
  // tre pannelli affiancati: note–frequenza (il più largo), scostamento in cent, inviluppo
  PH = GH;
  const inner = GW - 24, w1 = Math.floor(inner * 0.42), w2 = Math.floor(inner * 0.3), w3 = inner - w1 - w2;
  drawNoteFreq(6, 6, w1, GH - 12);
  drawDeviation(12 + w1, w2);
  drawWave(18 + w1 + w2, w3);
}

// ── Readout ───────────────────────────────────────────────────────────────────
const readout = new Lab.Readout(readoutEl, [
  { key: 'temp',  label: 'Temperamento' },
  { key: 'tonic', label: 'Tonica' },
  { key: 'a4',    label: 'La4 effettivo' },
  { key: 'fifth', label: 'Quinta (vs 3/2)' },
  { key: 'third', label: 'Terza magg. (vs 5/4)' },
]);
function updateReadout() {
  const t = TEMPERAMENTS[P.temp];
  readout.set('temp', t.name);
  readout.set('tonic', `${(P.english ? NAMES_EN : NAMES_IT)[P.tonic]}4 · ${fmt(etFreq(60 + P.tonic), 2)} Hz`);
  readout.set('a4', `${fmt(noteInfo(69).f, 2)} Hz`);
  readout.set('fifth', `${fmt(t.cents[7], 1)} c (${signed(t.cents[7] - cents(1.5), 1)})`);
  readout.set('third', `${fmt(t.cents[4], 1)} c (${signed(t.cents[4] - cents(1.25), 1)})`);
}

// ── Controlli ─────────────────────────────────────────────────────────────────
let infoBox;
const boxCss = 'font-size:11px;color:var(--text-secondary);line-height:1.7;padding:10px 12px;background:var(--bg3);border-radius:8px;';

function selectRow(label, options, value, onChange) {
  const row = document.createElement('div');
  row.className = 'ctrl-group';
  row.style.cssText = 'display:flex;align-items:center;gap:10px;';
  const l = document.createElement('span'); l.className = 'ctrl-label'; l.textContent = label;
  const sel = document.createElement('select'); sel.className = 'ctrl-select';
  options.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); });
  sel.value = value;
  sel.addEventListener('change', () => onChange(sel.value));
  row.append(l, sel);
  return row;
}
function buttonGrid(items) {
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:14px;';
  for (const [label, fn] of items) {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'padding:7px 4px;border-radius:6px;border:1px solid var(--border-hover);background:var(--bg3);color:var(--text-primary);cursor:pointer;font-family:"DM Sans",sans-serif;font-size:11px;font-weight:600;';
    b.addEventListener('click', fn);
    grid.appendChild(b);
  }
  return grid;
}

// Accordi di prova costruiti sulla tonica (o su un'altra nota, per sentire le altre tonalità)
function playChord(rootOffset, intervals) {
  releaseAll();
  const root = firstMidi() + ((P.tonic + rootOffset) % 12);
  for (const iv of intervals) if (root + iv <= lastMidi()) press(root + iv, 'latch');
  if (!P.latch) setTimeout(() => { for (const iv of intervals) release(root + iv, 'latch'); }, 1800);
}

function buildControls() {
  const cont = document.getElementById('controls');
  cont.innerHTML = '';

  const secT = Lab.Section('Temperamento');
  secT.add(Lab.RadioGroup({
    label: 'Accordatura',
    options: Object.entries(TEMPERAMENTS).map(([value, t]) => ({ value, label: t.name, hint: t.hint })),
    value: P.temp,
    onChange(v) { P.temp = v; infoBox.innerHTML = TEMPERAMENTS[v].info; retuneVoices(); },
  }));
  secT.add(selectRow('Tonica dell\'accordatura', NAMES_IT.map((n, i) => [i, `${n} (${NAMES_EN[i]})`]), P.tonic,
    v => { P.tonic = +v; retuneVoices(); }));
  secT.add(Lab.Slider({ label: 'La4 di riferimento', unit: ' Hz', min: 415, max: 466, step: 1, value: P.refA,
    onChange(v) { P.refA = v; retuneVoices(); } }));
  infoBox = document.createElement('div');
  infoBox.style.cssText = boxCss + 'margin-bottom:6px;';
  infoBox.innerHTML = TEMPERAMENTS[P.temp].info;
  secT.add(infoBox);

  const secS = Lab.Section('Suono');
  secS.add(Lab.RadioGroup({
    label: 'Timbro',
    options: [
      { value: 'piano', label: 'Pianoforte', hint: 'si smorza' },
      { value: 'organ', label: 'Organo', hint: 'battimenti' },
      { value: 'sine',  label: 'Sinusoide', hint: 'tono puro' },
    ],
    value: P.timbre,
    onChange(v) { P.timbre = v; releaseAll(); },
  }));
  secS.add(Lab.Slider({ label: 'Volume', min: 0, max: 1, step: 0.05, value: P.volume,
    onChange(v) { P.volume = v; if (audio) audio.master.gain.setTargetAtTime(v * 0.35, audio.ac.currentTime, 0.05); } }));
  secS.add(Lab.Toggle({ label: 'Pedale: le note restano premute', value: P.latch,
    onChange(v) { P.latch = v; if (!v) releaseAll(); } }));
  secS.add(buttonGrid([
    ['Quinta', () => playChord(0, [0, 7])],
    ['Terza maggiore', () => playChord(0, [0, 4])],
    ['Accordo maggiore', () => playChord(0, [0, 4, 7, 12])],
    ['Accordo minore', () => playChord(0, [0, 3, 7, 12])],
    ['Accordo su Re', () => playChord(2, [0, 4, 7])],
    ['Accordo su Mi', () => playChord(4, [0, 4, 7])],
  ]));

  const secK = Lab.Section('Tastiera');
  secK.add(Lab.Slider({ label: 'Ottava di partenza (Do)', min: 1, max: 6, step: 1, value: P.startOct,
    onChange(v) { P.startOct = v; releaseAll(); } }));
  secK.add(Lab.Slider({ label: 'Numero di ottave', min: 1, max: 3, step: 1, value: P.octaves,
    onChange(v) { P.octaves = v; kbBase = Math.min(kbBase, P.octaves - 1); releaseAll(); } }));
  secK.add(Lab.Toggle({ label: 'Nomi anglosassoni (C, D, E…)', value: P.english, onChange(v) { P.english = v; } }));
  secK.add(Lab.Toggle({ label: 'Mostra i tasti del computer', value: P.showKeys, onChange(v) { P.showKeys = v; } }));
  freqLogToggle = Lab.Toggle({ label: 'Grafico note–frequenza in scala log', value: P.freqLog, onChange(v) { P.freqLog = v; } });
  secK.add(freqLogToggle);
  const tip = document.createElement('div');
  tip.style.cssText = boxCss;
  tip.innerHTML = 'Suona con il mouse (trascina per un glissando) o con la tastiera del computer: A S D F G H J K per i tasti bianchi, W E T Y U O P per i neri. Z e X spostano i tasti del computer di un\'ottava.<br>Su ogni tasto: nome, frequenza in Hz, rapporto con la tonica (frazione esatta quando esiste) e scostamento in cent dal temperamento equabile. 100 cent = un semitono equabile.';
  secK.add(tip);

  cont.append(secT.el, secS.el, secK.el);
}

// ── Interazione ───────────────────────────────────────────────────────────────
function keyAt(x, y) {
  // i tasti neri stanno sopra i bianchi: si controllano per primi
  return keyRects.find(r => r.black && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)
      || keyRects.find(r => !r.black && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}
let pointerNote = null;
canvas.style.touchAction = 'none';
canvas.addEventListener('pointerdown', e => {
  const r = canvas.getBoundingClientRect(), k = keyAt(e.clientX - r.left, e.clientY - r.top);
  if (!k) return;
  canvas.setPointerCapture(e.pointerId);
  if (P.latch) {
    if (held.has(k.m)) { held.delete(k.m); noteOff(k.m); waveDirty = true; } else press(k.m, 'latch');
    return;
  }
  pointerNote = k.m;
  press(k.m, 'mouse');
});
canvas.addEventListener('pointermove', e => {
  const r = canvas.getBoundingClientRect(), k = keyAt(e.clientX - r.left, e.clientY - r.top);
  canvas.style.cursor = k ? 'pointer' : 'default';
  if (pointerNote === null || !k || k.m === pointerNote) return;
  release(pointerNote, 'mouse');                 // glissando
  pointerNote = k.m;
  press(k.m, 'mouse');
});
const endPointer = () => { if (pointerNote !== null) { release(pointerNote, 'mouse'); pointerNote = null; } };
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

window.addEventListener('keydown', e => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest && e.target.closest('input, select, textarea')) return;
  if (e.code === 'KeyZ') { kbBase = Math.max(0, kbBase - 1); return; }
  if (e.code === 'KeyX') { kbBase = Math.min(P.octaves - 1, kbBase + 1); return; }
  const i = KEY_CODES.indexOf(e.code);
  if (i < 0) return;
  const m = firstMidi() + kbBase * 12 + i;
  if (m > lastMidi()) return;
  e.preventDefault();
  press(m, 'key:' + e.code);
});
window.addEventListener('keyup', e => {
  const i = KEY_CODES.indexOf(e.code);
  if (i < 0) return;
  for (const m of [...held.keys()]) release(m, 'key:' + e.code);
});
window.addEventListener('blur', () => { for (const m of [...held.keys()]) for (const s of [...held.get(m)]) if (s.startsWith('key:') || s === 'mouse') release(m, s); });

document.getElementById('btnPlay').addEventListener('click', releaseAll);
document.getElementById('btnReset').addEventListener('click', () => {
  releaseAll();
  Object.assign(P, { temp: 'equal', tonic: 0, refA: 440, startOct: 3, octaves: 2, english: false, showKeys: true, timbre: 'piano', volume: 0.7, latch: false, freqLog: false });
  kbBase = 0; lastNote = 60;
  buildControls();
});

// ── Loop ─────────────────────────────────────────────────────────────────────
function loop() {
  requestAnimationFrame(loop);
  C = getColors();
  drawScene();
  drawBottom();
  updateReadout();
}

Lab.initTheme('themeToggle');
resize();
buildControls();
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(canvas.parentElement);
requestAnimationFrame(loop);
