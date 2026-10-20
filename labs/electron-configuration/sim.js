'use strict';

// ── Elementi ─────────────────────────────────────────────────────────────────
const ELEMENTS = [null, ...('H Idrogeno,He Elio,Li Litio,Be Berillio,B Boro,C Carbonio,N Azoto,O Ossigeno,F Fluoro,Ne Neon,' +
  'Na Sodio,Mg Magnesio,Al Alluminio,Si Silicio,P Fosforo,S Zolfo,Cl Cloro,Ar Argon,K Potassio,Ca Calcio,' +
  'Sc Scandio,Ti Titanio,V Vanadio,Cr Cromo,Mn Manganese,Fe Ferro,Co Cobalto,Ni Nichel,Cu Rame,Zn Zinco,' +
  'Ga Gallio,Ge Germanio,As Arsenico,Se Selenio,Br Bromo,Kr Kripton,Rb Rubidio,Sr Stronzio,Y Ittrio,Zr Zirconio,' +
  'Nb Niobio,Mo Molibdeno,Tc Tecnezio,Ru Rutenio,Rh Rodio,Pd Palladio,Ag Argento,Cd Cadmio,In Indio,Sn Stagno,' +
  'Sb Antimonio,Te Tellurio,I Iodio,Xe Xeno,Cs Cesio,Ba Bario,La Lantanio,Ce Cerio,Pr Praseodimio,Nd Neodimio,' +
  'Pm Promezio,Sm Samario,Eu Europio,Gd Gadolinio,Tb Terbio,Dy Disprosio,Ho Olmio,Er Erbio,Tm Tulio,Yb Itterbio,' +
  'Lu Lutezio,Hf Afnio,Ta Tantalio,W Tungsteno,Re Renio,Os Osmio,Ir Iridio,Pt Platino,Au Oro,Hg Mercurio,' +
  'Tl Tallio,Pb Piombo,Bi Bismuto,Po Polonio,At Astato,Rn Radon,Fr Francio,Ra Radio,Ac Attinio,Th Torio,' +
  'Pa Protoattinio,U Uranio,Np Nettunio,Pu Plutonio,Am Americio,Cm Curio,Bk Berkelio,Cf Californio,Es Einsteinio,Fm Fermio,' +
  'Md Mendelevio,No Nobelio,Lr Laurenzio,Rf Rutherfordio,Db Dubnio,Sg Seaborgio,Bh Bohrio,Hs Hassio,Mt Meitnerio,Ds Darmstadtio,' +
  'Rg Roentgenio,Cn Copernicio,Nh Nihonio,Fl Flerovio,Mc Moscovio,Lv Livermorio,Ts Tennesso,Og Oganesson')
  .split(',').map(s => { const [sym, name] = s.split(' '); return { sym, name }; })];
const NOBLE = [2, 10, 18, 36, 54, 86];

// ── Sottolivelli in ordine di energia (regola di Madelung: n + l crescente, poi n crescente) ──
const L_LETTER = ['s', 'p', 'd', 'f'];
const SUBSHELLS = [];
for (let sum = 1; sum <= 8; sum++) {
  for (let l = Math.min(3, sum - 1); l >= 0; l--) {
    const n = sum - l;
    if (n > 7 || l >= n) continue;
    SUBSHELLS.push({ n, l, label: n + L_LETTER[l], cap: 2 * (2 * l + 1), k: 2 * l + 1, order: SUBSHELLS.length });
  }
}
const SUB = Object.fromEntries(SUBSHELLS.map(s => [s.label, s]));

// Stati fondamentali che non seguono la regola di Madelung (configurazioni sperimentali, NIST)
const EXCEPTIONS = {
  24: '[Ar] 3d5 4s1', 29: '[Ar] 3d10 4s1',
  41: '[Kr] 4d4 5s1', 42: '[Kr] 4d5 5s1', 44: '[Kr] 4d7 5s1', 45: '[Kr] 4d8 5s1', 46: '[Kr] 4d10', 47: '[Kr] 4d10 5s1',
  57: '[Xe] 5d1 6s2', 58: '[Xe] 4f1 5d1 6s2', 64: '[Xe] 4f7 5d1 6s2', 78: '[Xe] 4f14 5d9 6s1', 79: '[Xe] 4f14 5d10 6s1',
  89: '[Rn] 6d1 7s2', 90: '[Rn] 6d2 7s2', 91: '[Rn] 5f2 6d1 7s2', 92: '[Rn] 5f3 6d1 7s2', 93: '[Rn] 5f4 6d1 7s2',
  96: '[Rn] 5f7 6d1 7s2', 103: '[Rn] 5f14 7s2 7p1',
};
const HALF_FULL_NOTE = {
  24: 'un elettrone passa da 4s a 3d, perché il sottolivello 3d semipieno (5 elettroni spaiati) è più stabile',
  29: 'un elettrone passa da 4s a 3d, perché il sottolivello 3d completo è più stabile',
  42: 'un elettrone passa da 5s a 4d, perché il sottolivello 4d semipieno è più stabile',
  47: 'un elettrone passa da 5s a 4d, perché il sottolivello 4d completo è più stabile',
  79: 'un elettrone passa da 6s a 5d, perché il sottolivello 5d completo è più stabile',
};

// ── Configurazioni ────────────────────────────────────────────────────────────
const emptyCounts = () => Object.fromEntries(SUBSHELLS.map(s => [s.label, 0]));

function aufbau(nEl) {
  const c = emptyCounts();
  for (const s of SUBSHELLS) {
    if (nEl <= 0) break;
    const k = Math.min(s.cap, nEl);
    c[s.label] = k; nEl -= k;
  }
  return c;
}

function parseConfig(str) {
  let c = emptyCounts();
  for (const tok of str.split(' ')) {
    const core = tok.match(/^\[(\w+)\]$/);
    if (core) { const z = ELEMENTS.findIndex(e => e && e.sym === core[1]); c = aufbau(z); continue; }
    const m = tok.match(/^(\d)([spdf])(\d+)$/);
    if (m) c[m[1] + m[2]] = +m[3];
  }
  return c;
}

const neutralConfig = Z => EXCEPTIONS[Z] ? parseConfig(EXCEPTIONS[Z]) : aufbau(Z);

// Ione: i cationi perdono prima gli elettroni del livello n più alto (il 4s prima del 3d),
// gli anioni aggiungono elettroni seguendo l'Aufbau.
function groundConfig(Z, charge) {
  const c = neutralConfig(Z);
  if (charge > 0) {
    for (let q = 0; q < charge; q++) {
      let best = null;
      for (const s of SUBSHELLS) if (c[s.label] > 0 && (!best || s.n > best.n || (s.n === best.n && s.l > best.l))) best = s;
      if (best) c[best.label]--;
    }
  } else {
    for (let q = 0; q < -charge; q++) {
      const s = SUBSHELLS.find(t => c[t.label] < t.cap);
      if (s) c[s.label]++;
    }
  }
  return c;
}

// Caselle (orbitali) riempite secondo Hund: prima un elettrone ↑ in ciascuna, poi i ↓
function boxesFromCounts(c) {
  const b = {};
  for (const s of SUBSHELLS) {
    const e = c[s.label];
    b[s.label] = Array.from({ length: s.k }, (_, j) => [j < e ? 1 : 0, j + s.k < e ? -1 : 0]);
  }
  return b;
}

// Sequenza di riempimento per l'animazione: [sottolivello, casella, spin]
function fillSequence(c) {
  const seq = [];
  for (const s of SUBSHELLS) {
    for (let j = 0; j < c[s.label]; j++) seq.push({ sub: s, box: j < s.k ? j : j - s.k, spin: j < s.k ? 1 : -1, idx: j });
  }
  return seq;
}

const SUPS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = n => String(n).split('').map(d => SUPS[+d]).join('');

function configString(c, byN, shorthand, isIon = false) {
  let subs = SUBSHELLS.filter(s => c[s.label] > 0);
  let prefix = '';
  if (shorthand) {
    for (let i = NOBLE.length - 1; i >= 0; i--) {
      const core = aufbau(NOBLE[i]);
      const coreSubs = SUBSHELLS.filter(s => core[s.label] > 0);
      const total = subs.reduce((a, s) => a + c[s.label], 0);
      // un atomo neutro di gas nobile si scrive per esteso; uno ione isoelettronico può valere [Ne], [Ar]...
      if ((total > NOBLE[i] || (isIon && total === NOBLE[i])) && coreSubs.every(s => c[s.label] === s.cap)) {
        prefix = `[${ELEMENTS[NOBLE[i]].sym}] `;
        subs = subs.filter(s => !coreSubs.includes(s));
        break;
      }
    }
  }
  if (byN) subs = subs.slice().sort((a, b) => a.n - b.n || a.l - b.l);
  return (prefix + subs.map(s => s.label + sup(c[s.label])).join(' ')).trim() || '—';
}

// Posizione nella tavola periodica (gruppo 3: Sc, Y, Lu, Lr)
function tablePos(Z) {
  const ends = [2, 10, 18, 36, 54, 86, 118];
  const period = ends.findIndex(e => Z <= e) + 1;
  const i = Z - (period === 1 ? 0 : ends[period - 2]);
  if (period === 1) return { period, col: i === 1 ? 1 : 18 };
  if (period <= 3) return { period, col: i <= 2 ? i : i + 10 };
  if (period <= 5) return { period, col: i };
  if (i <= 2) return { period, col: i };
  if (i <= 16) return { period, col: null, frow: period - 6, fcol: i - 3 };
  return { period, col: i - 14 };
}
const blockOf = Z => L_LETTER[fillSequence(aufbau(Z)).pop().sub.l];

// ── Parametri ────────────────────────────────────────────────────────────────
const P = {
  Z: 8,
  charge: 0,
  mode: 'ground',      // 'ground' | 'build'
  byN: false,          // ordine della configurazione: per energia (false) o per n (true)
  speed: 1,
};
let build = null;      // caselle compilate dallo studente
let anim = null;       // { seq, shown, t }
let selected = null;   // { sub, box, slot }

const nElectrons = () => P.Z - P.charge;

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
  SW = area.clientWidth;
  SH = Math.max(0, area.clientHeight - graphArea.offsetHeight - (readoutEl.offsetHeight || 0));
  canvas.width = SW * DPR; canvas.height = SH * DPR;
  canvas.style.width = SW + 'px'; canvas.style.height = SH + 'px';
  GW = graphArea.clientWidth; GH = graphArea.clientHeight;
  gCanvas.width = GW * DPR; gCanvas.height = GH * DPR;
  gCanvas.style.width = GW + 'px'; gCanvas.style.height = GH + 'px';
}

function getCSSVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
let C = {};
function getColors() {
  const light = document.documentElement.dataset.theme === 'light';
  return {
    light,
    bg: getCSSVar('--bg1') || '#060a10', panel: getCSSVar('--bg2') || '#0b1018', bg3: getCSSVar('--bg3') || '#111820',
    text: getCSSVar('--text-primary') || '#ddeeff', muted: getCSSVar('--text-secondary') || '#6b8099',
    hint: getCSSVar('--text-hint') || '#2d4055', accent: getCSSVar('--accent') || '#00d4ff',
    grid: light ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)',
    up: light ? '#0a84c0' : '#3fd6ff', down: light ? '#d6336c' : '#ff6b9d',
    bad: light ? '#e03131' : '#ff5c5c', good: light ? '#2b8a3e' : '#4cd97b', warn: light ? '#e8590c' : '#ffb44d',
    block: { s: '#ff8a5c', p: '#5cc8ff', d: '#ffd24d', f: '#7ee08a' },
  };
}

function text(str, x, y, { color = C.text, size = 12, align = 'left', base = 'middle', bold = false, mono = false } = {}) {
  ctx.fillStyle = color;
  ctx.font = `${bold ? '700 ' : ''}${size}px ${mono ? 'Space Mono, monospace' : 'DM Sans, sans-serif'}`;
  ctx.textAlign = align; ctx.textBaseline = base;
  ctx.fillText(str, x, y);
}

function spinArrow(x, y, h, spin, color, width = 2) {
  const top = y - h / 2, bot = y + h / 2, head = Math.max(3, h * 0.28);
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, spin > 0 ? bot : top); ctx.lineTo(x, spin > 0 ? top + head * 0.6 : bot - head * 0.6); ctx.stroke();
  const ty = spin > 0 ? top : bot, d = spin > 0 ? 1 : -1;
  ctx.beginPath(); ctx.moveTo(x, ty); ctx.lineTo(x - head * 0.6, ty + d * head); ctx.lineTo(x + head * 0.6, ty + d * head); ctx.closePath(); ctx.fill();
}

// ── Stato da mostrare ────────────────────────────────────────────────────────
function currentBoxes() {
  if (P.mode === 'build') return build;
  const target = groundConfig(P.Z, P.charge);
  if (!anim) return boxesFromCounts(target);
  const b = boxesFromCounts(emptyCounts());
  for (let i = 0; i < anim.shown; i++) { const e = anim.seq[i]; b[e.sub.label][e.box][e.spin > 0 ? 0 : 1] = e.spin; }
  return b;
}
const countsOf = boxes => Object.fromEntries(SUBSHELLS.map(s => [s.label, boxes[s.label].reduce((a, bx) => a + (bx[0] ? 1 : 0) + (bx[1] ? 1 : 0), 0)]));

// Verifica delle regole sulla configurazione costruita dallo studente
function validate(boxes) {
  const res = { pauli: new Set(), hund: new Set(), aufbau: false, count: 0, ok: false, msgs: [] };
  const c = countsOf(boxes);
  res.count = Object.values(c).reduce((a, v) => a + v, 0);
  for (const s of SUBSHELLS) {
    const bx = boxes[s.label];
    bx.forEach((b, j) => { if (b[0] && b[1] && b[0] === b[1]) res.pauli.add(s.label + ':' + j); });
    const e = c[s.label], doubles = bx.filter(b => b[0] && b[1]).length, empties = bx.filter(b => !b[0] && !b[1]).length;
    const singles = bx.filter(b => (b[0] !== 0) !== (b[1] !== 0)).map(b => b[0] || b[1]);
    if ((doubles > 0 && empties > 0) || (singles.length > 1 && new Set(singles).size > 1)) res.hund.add(s.label);
    if (e > 0) {
      const lowerOpen = SUBSHELLS.some(t => t.order < s.order && c[t.label] < t.cap);
      if (lowerOpen) res.aufbau = true;
    }
  }
  const target = groundConfig(P.Z, P.charge), N = nElectrons();
  const matches = SUBSHELLS.every(s => c[s.label] === target[s.label]);
  if (res.pauli.size) res.msgs.push(['bad', 'Pauli: due elettroni nello stesso orbitale hanno lo stesso spin. Devono avere spin opposti (↑↓).']);
  if (res.hund.size) res.msgs.push(['warn', `Hund: in ${[...res.hund].join(', ')} gli elettroni vanno prima uno per orbitale, con spin paralleli.`]);
  if (res.count !== N) res.msgs.push(['warn', `Elettroni sistemati: ${res.count} su ${N}.`]);
  else if (!matches && !res.pauli.size) res.msgs.push(['warn', res.aufbau
    ? 'Aufbau: c\'è un sottolivello a energia più bassa non ancora pieno. Così è uno stato eccitato, non quello fondamentale.'
    : 'La distribuzione non corrisponde allo stato fondamentale.']);
  res.ok = res.count === N && matches && !res.pauli.size && !res.hund.size;
  if (res.ok) res.msgs.push(['good', EXCEPTIONS[P.Z] && P.charge === 0
    ? 'Corretto! È lo stato fondamentale (e questo elemento è un\'eccezione alla regola di Madelung).'
    : 'Corretto! È la configurazione dello stato fondamentale.']);
  return res;
}

// ── Disegno ──────────────────────────────────────────────────────────────────
let slotRects = [];

function layout(top) {
  const leftW = Math.max(360, Math.min(SW * 0.6, SW - 330));
  const B = Math.max(12, Math.min((leftW - 70) / 20.6, (SH - top - 26) / 14.6, 30));
  return { top, leftW, B };
}

function caption(boxes, valid) {
  if (P.mode === 'build') return valid.msgs;
  if (anim && anim.shown > 0 && anim.shown < anim.seq.length) {
    const e = anim.seq[anim.shown - 1], s = e.sub;
    if (e.idx === 0) return [['info', `Aufbau: il prossimo elettrone va nel sottolivello libero a energia più bassa, ${s.label}.`]];
    if (e.spin > 0) return [['info', `Regola di Hund: in ${s.label} un elettrone per orbitale, tutti con spin paralleli.`]];
    return [['info', `Principio di Pauli: il secondo elettrone dell'orbitale ha spin opposto (al massimo 2 per orbitale).`]];
  }
  return [['explain', explain(P.Z, P.charge)]];
}

// ── Spiegazione breve dell'elemento o dello ione scelto ──────────────────────
const ionLabel = q => q === 0 ? '' : (Math.abs(q) > 1 ? sup(Math.abs(q)) : '') + (q > 0 ? '⁺' : '⁻');
function unpairedOf(c) {
  let u = 0;
  for (const s of SUBSHELLS) { const e = c[s.label]; u += e <= s.k ? e : 2 * s.k - e; }
  return u;
}

// Tre frasi: chi è, cosa ha di particolare la sua configurazione (e perché), elettroni spaiati.
function explain(Z, q) {
  const el = ELEMENTS[Z], N = Z - q, c = groundConfig(Z, q), pos = tablePos(Z), n = pos.period;
  const who = q === 0 ? 'l\'atomo' : 'lo ione';
  const out = [];

  const nEl = k => k === 1 ? '1 elettrone' : `${k} elettroni`;
  if (q === 0) out.push(`${el.name}, Z = ${Z}: l'atomo neutro ha ${nEl(Z)}.`);
  else out.push(`Lo ione ${el.sym}${ionLabel(q)} ha ${nEl(N)}: l'atomo ${Math.abs(q) === 1
    ? (q > 0 ? 'ha perso un elettrone' : 'ha acquistato un elettrone')
    : `ne ha ${q > 0 ? 'persi' : 'acquistati'} ${Math.abs(q)}`}.`);

  if (q !== 0) {
    const noble = NOBLE.find(z => z === N);
    const neutral = groundConfig(Z, 0);
    const sLost = SUBSHELLS.some(s => s.l === 0 && c[s.label] < neutral[s.label] && SUBSHELLS.some(d => d.l === 2 && d.n === s.n - 1 && c[d.label] > 0));
    if (noble && SUBSHELLS.every(s => c[s.label] === aufbau(N)[s.label])) {
      const art = { 2: 'dell\'elio', 10: 'del neon', 18: 'dell\'argon', 36: 'del kripton', 54: 'dello xeno', 86: 'del radon' }[noble];
      out.push(`Ha la stessa configurazione ${art} (è isoelettronico con un gas nobile): per questo è uno ione stabile.`);
    } else if (q > 0 && sLost) {
      out.push(`Si tolgono prima gli elettroni del livello n più alto, cioè gli s, anche se nell'atomo neutro il sottolivello d si era riempito dopo.`);
    } else if (q > 0) {
      out.push('Si tolgono per primi gli elettroni del livello più esterno, i meno trattenuti dal nucleo.');
    } else {
      out.push('Gli elettroni in più occupano i posti liberi a energia più bassa, come prevede l\'Aufbau.');
    }
  } else if (EXCEPTIONS[Z]) {
    out.push(HALF_FULL_NOTE[Z]
      ? `Fa eccezione alla regola di Madelung: ${HALF_FULL_NOTE[Z]}.`
      : 'Fa eccezione alla regola di Madelung: sottolivelli con energie molto vicine si scambiano un elettrone, e la configurazione reale è quella mostrata.');
  } else if (pos.col === 18) {
    out.push(Z === 2 ? 'Il livello n = 1 è completo con 2 elettroni: configurazione molto stabile, l\'elio è un gas nobile.'
      : `Il livello esterno n = ${n} è completo (ottetto ${n}s² ${n}p⁶): configurazione molto stabile, gas nobile poco reattivo.`);
  } else if (Z === 1) {
    out.push('L\'unico elettrone occupa l\'orbitale 1s, quello a energia più bassa.');
  } else if (pos.col === 1) {
    out.push(`L'unico elettrone esterno, ${n}s¹, è debolmente trattenuto: viene ceduto facilmente e si forma lo ione ${el.sym}⁺.`);
  } else if (pos.col === 2) {
    out.push(`I due elettroni esterni ${n}s² vengono ceduti con facilità: si forma lo ione ${el.sym}²⁺.`);
  } else if (pos.col === 17) {
    out.push(`Al livello esterno manca un solo elettrone per completare l'ottetto: tende ad acquistarlo e forma lo ione ${el.sym}⁻.`);
  } else if (pos.col === 16) {
    out.push(`Al livello esterno mancano due elettroni per l'ottetto: tende a formare lo ione ${el.sym}²⁻.`);
  } else if (pos.col >= 13) {
    const np = c[n + 'p'];
    out.push(`Nel livello esterno ci sono ${2 + np} elettroni (${n}s² ${n}p${sup(np)}); ${np > 1 ? `nel ${n}p ognuno occupa un orbitale diverso, come vuole la regola di Hund` : `il ${n}p è appena iniziato`}.`);
  } else if (pos.col) {
    out.push(pos.col === 12
      ? `Il ${n - 1}d è completo (d¹⁰): dopo il ${n}s² non restano posti liberi nel sottolivello d.`
      : `Dopo il ${n}s si riempie il ${n - 1}d: il ${n}s ha energia più bassa ed è occupato prima, anche se ha n maggiore.`);
  } else {
    out.push(`Si riempie il sottolivello ${n - 2}f, nascosto sotto i livelli più esterni: è ${n === 6 ? 'un lantanide' : 'un attinide'}.`);
  }

  const u = unpairedOf(c);
  out.push(u
    ? `${u === 1 ? 'C\'è 1 elettrone spaiato' : `Ci sono ${u} elettroni spaiati (regola di Hund)`}: ${who} è paramagnetico.`
    : `Tutti gli elettroni sono appaiati con spin opposti (Pauli): ${who} è diamagnetico.`);
  if (Z >= 104) out.push('Per gli elementi superpesanti la configurazione è una previsione teorica.');
  return out.join(' ');
}

// Testo a capo entro una larghezza massima
function wrapLines(str, maxW, font) {
  ctx.font = font;
  const words = str.split(' '), lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

let explainKey = '', flashT = 0;

function drawDiagram(boxes, valid, L) {
  const { top, B } = L;
  const x0 = 58, dy = B * 0.75;
  const colX = [x0, x0 + 2.6 * B, x0 + 7 * B, x0 + 13.4 * B];
  const baseY = SH - 18 - B / 2;
  const c = countsOf(boxes);
  const lastFilled = Math.max(-1, ...SUBSHELLS.filter(s => c[s.label] > 0).map(s => s.order));
  slotRects = [];

  // asse dell'energia
  ctx.strokeStyle = C.muted; ctx.fillStyle = C.muted; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(18, baseY + B / 2); ctx.lineTo(18, top + 8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(18, top + 2); ctx.lineTo(14, top + 10); ctx.lineTo(22, top + 10); ctx.closePath(); ctx.fill();
  ctx.save(); ctx.translate(30, (top + baseY) / 2); ctx.rotate(-Math.PI / 2);
  text('energia', 0, 0, { color: C.muted, size: 10, align: 'center' }); ctx.restore();

  for (const s of SUBSHELLS) {
    const y = baseY - s.order * dy, x = colX[s.l];
    const dim = P.mode === 'ground' && s.order > lastFilled + 1;
    ctx.globalAlpha = dim ? 0.3 : 1;
    const bad = valid && valid.hund.has(s.label);
    text(s.label, x - 6, y, { color: bad ? C.warn : C.block[L_LETTER[s.l]], size: Math.max(9, B * 0.5), align: 'right', bold: true });
    for (let j = 0; j < s.k; j++) {
      const bx = x + j * B, by = y - B / 2;
      const pauliBad = valid && valid.pauli.has(s.label + ':' + j);
      ctx.strokeStyle = pauliBad ? C.bad : bad ? C.warn : C.grid;
      ctx.lineWidth = pauliBad || bad ? 2 : 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, B - 1, B - 1);
      const box = boxes[s.label][j];
      for (let k = 0; k < 2; k++) {
        const sx = bx + B * (k ? 0.68 : 0.32);
        slotRects.push({ x: bx + (k ? B / 2 : 0), y: by, w: B / 2, h: B, sub: s, box: j, slot: k });
        if (!box[k]) continue;
        const isSel = selected && selected.sub === s && selected.box === j && selected.slot === k;
        if (isSel) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(bx + (k ? B / 2 : 1), by + 1, B / 2 - 1, B - 2); }
        spinArrow(sx, y, B * 0.66, box[k], pauliBad ? C.bad : box[k] > 0 ? C.up : C.down, Math.max(1.5, B / 13));
      }
    }
    ctx.globalAlpha = 1;
  }
}

// Diagramma di Madelung: sottolivelli per n e l, frecce diagonali nell'ordine di riempimento
function drawMadelung(boxes, L) {
  const c = countsOf(boxes);
  const x0 = L.leftW + 24, w = SW - x0 - 16;
  const cw = Math.min(64, w / 4.4), ch = Math.min(40, (SH - L.top - 120) / 7.4);
  if (cw < 30 || ch < 20) return;
  const ox = x0 + (w - cw * 4) / 2 + cw / 2, oy = L.top + 22;
  const pos = s => [ox + s.l * cw, oy + (s.n - 1) * ch];
  text('Ordine di riempimento (regola di Madelung)', x0 + w / 2, L.top + 2, { color: C.muted, size: 11, align: 'center' });

  ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.globalAlpha = 0.55;
  for (let sum = 1; sum <= 8; sum++) {
    const diag = SUBSHELLS.filter(s => s.n + s.l === sum);
    if (diag.length < 1) continue;
    const [ax, ay] = pos(diag[0]), [bx, by] = pos(diag[diag.length - 1]);
    const ex = ax + cw * 0.42, ey = ay - ch * 0.42, fx = bx - cw * 0.42, fy = by + ch * 0.42;
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(fx, fy); ctx.stroke();
    const a = Math.atan2(fy - ey, fx - ex);
    ctx.beginPath(); ctx.moveTo(fx, fy);
    ctx.lineTo(fx - 7 * Math.cos(a - 0.4), fy - 7 * Math.sin(a - 0.4));
    ctx.lineTo(fx - 7 * Math.cos(a + 0.4), fy - 7 * Math.sin(a + 0.4));
    ctx.closePath(); ctx.fillStyle = C.muted; ctx.fill();
  }
  ctx.globalAlpha = 1;

  const r = Math.min(cw, ch) * 0.4;
  for (const s of SUBSHELLS) {
    const [x, y] = pos(s), col = C.block[L_LETTER[s.l]], f = c[s.label] / s.cap;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = C.bg3; ctx.fill();
    if (f > 0) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + f * 2 * Math.PI); ctx.closePath();
      ctx.globalAlpha = 0.55; ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.strokeStyle = f > 0 ? col : C.grid; ctx.lineWidth = 1.5; ctx.stroke();
    text(s.label, x, y - 1, { size: Math.max(9, r * 0.62), align: 'center', bold: true, color: f > 0 ? C.text : C.muted });
    if (c[s.label]) text(String(c[s.label]), x + r * 0.95, y - r * 0.85, { size: 9, color: col, mono: true });
  }
  return oy + 6.6 * ch;
}

// Numeri quantici dell'elettrone selezionato
function drawQuantum(y0, L) {
  const x0 = L.leftW + 24, w = SW - x0 - 16;
  if (!selected || y0 + 70 > SH) return;
  const { sub, box, slot } = selected, spin = currentBoxes()[sub.label][box][slot];
  if (!spin) return;
  const ml = box - sub.l;
  ctx.fillStyle = C.panel; ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x0, y0, w, 66, 8); ctx.fill(); ctx.stroke();
  text('Numeri quantici dell\'elettrone selezionato', x0 + 10, y0 + 13, { size: 10, color: C.muted });
  const items = [['n', sub.n], ['l', `${sub.l} (${L_LETTER[sub.l]})`], ['mₗ', (ml > 0 ? '+' : '') + ml], ['mₛ', spin > 0 ? '+½ ↑' : '−½ ↓']];
  items.forEach(([k, v], i) => {
    const x = x0 + 10 + i * (w - 20) / 4;
    text(k, x, y0 + 33, { size: 11, color: C.muted, mono: true });
    text(String(v), x, y0 + 51, { size: 13, bold: true, mono: true, color: k === 'mₛ' ? (spin > 0 ? C.up : C.down) : C.text });
  });
}

function drawHeader(boxes, msgs) {
  const el = ELEMENTS[P.Z], c = countsOf(boxes);
  const ion = ionLabel(P.charge);
  text(el.sym + ion, 16, 26, { size: 26, bold: true });
  ctx.font = '700 26px DM Sans, sans-serif';
  const sw = ctx.measureText(el.sym + ion).width;
  text(`${el.name} · Z = ${P.Z}${P.charge ? ` · ${nElectrons()} elettroni` : ''}`, 16 + sw + 10, 20, { size: 12, color: C.muted });
  text(configString(c, P.byN, false), 16 + sw + 10, 38, { size: 13, mono: true, bold: true, color: C.accent });
  const short = configString(c, true, true, P.charge !== 0);
  if (short.startsWith('[')) text('forma abbreviata: ' + short, SW - 16, 20, { size: 11, mono: true, color: C.muted, align: 'right' });

  let y = 58;
  for (const [kind, m] of msgs.slice(0, 3)) {
    const explainMsg = kind === 'explain';
    const font = `${explainMsg ? 12.5 : 11}px DM Sans, sans-serif`;
    const lines = wrapLines(m, SW - 44, font).slice(0, 4);
    if (explainMsg) {
      // riquadro che si illumina per un attimo quando cambia l'elemento o la carica
      const h = lines.length * 16 + 10;
      ctx.fillStyle = C.panel; ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(10, y - 9, SW - 20, h, 7); ctx.fill(); ctx.stroke();
      if (flashT > 0) {
        ctx.save(); ctx.globalAlpha = Math.min(1, flashT) * 0.35;
        ctx.strokeStyle = C.accent; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(10, y - 9, SW - 20, h, 7); ctx.stroke();
        ctx.fillStyle = C.accent; ctx.globalAlpha *= 0.4; ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = C.accent; ctx.fillRect(10, y - 9, 3, h);
    }
    const col = kind === 'bad' ? C.bad : kind === 'warn' ? C.warn : kind === 'good' ? C.good : explainMsg ? C.text : C.muted;
    for (const ln of lines) {
      ctx.fillStyle = col; ctx.font = font; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(ln, explainMsg ? 22 : 16, y + (explainMsg ? 1 : 0));
      y += explainMsg ? 16 : 15;
    }
    if (explainMsg) y += 6;
  }
  return y;
}

function drawScene() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, SW, SH);
  if (SW < 50 || SH < 50) return;
  const boxes = currentBoxes();
  const valid = P.mode === 'build' ? validate(boxes) : null;
  const msgs = caption(boxes, valid);
  const key = `${P.Z}|${P.charge}|${P.mode}`;
  if (key !== explainKey) { explainKey = key; flashT = 1.6; }
  const L = layout(drawHeader(boxes, msgs) + 6);
  drawDiagram(boxes, valid, L);
  const yq = drawMadelung(boxes, L);
  if (yq) drawQuantum(yq + 8, L);
  if (P.mode === 'build') {
    text('clic sulla metà sinistra o destra di una casella: vuota → ↑ → ↓ → vuota', SW - 16, SH - 10, { size: 10, color: C.muted, align: 'right' });
  }
}

// ── Tavola periodica (area grafici) ──────────────────────────────────────────
let cellRects = [];
function drawTable() {
  gctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  gctx.fillStyle = C.panel; gctx.fillRect(0, 0, GW, GH);
  cellRects = [];
  const pad = 8, cw = (GW - pad * 2) / 18, rows = 9.4, ch = Math.min(26, (GH - pad * 2) / rows);
  for (let Z = 1; Z <= 118; Z++) {
    const p = tablePos(Z);
    const x = pad + (p.col ? p.col - 1 : p.fcol + 2) * cw;
    const y = pad + (p.col ? p.period - 1 : 7.4 + p.frow) * ch;
    const blk = blockOf(Z), col = C.block[blk], sel = Z === P.Z;
    gctx.globalAlpha = sel ? 0.95 : 0.28;
    gctx.fillStyle = col; gctx.fillRect(x + 1, y + 1, cw - 2, ch - 2);
    gctx.globalAlpha = 1;
    if (sel) { gctx.strokeStyle = C.text; gctx.lineWidth = 2; gctx.strokeRect(x + 1, y + 1, cw - 2, ch - 2); }
    gctx.fillStyle = sel ? '#06101a' : C.text;
    gctx.font = `${sel ? '700 ' : ''}${Math.min(12, ch * 0.5)}px DM Sans, sans-serif`;
    gctx.textAlign = 'center'; gctx.textBaseline = 'middle';
    gctx.fillText(ELEMENTS[Z].sym, x + cw / 2, y + ch / 2 + 1);
    if (cw > 34) {
      gctx.font = `${Math.min(8, ch * 0.32)}px Space Mono, monospace`; gctx.textAlign = 'left';
      gctx.fillStyle = sel ? '#06101a' : C.muted;
      gctx.fillText(String(Z), x + 3, y + 7);
    }
    cellRects.push({ x, y, w: cw, h: ch, Z });
  }
  // legenda dei blocchi
  const lx = pad + 3 * cw, ly = pad + 1.1 * ch;
  ['s', 'p', 'd', 'f'].forEach((b, i) => {
    gctx.globalAlpha = 0.6; gctx.fillStyle = C.block[b]; gctx.fillRect(lx + i * 66, ly - 5, 10, 10); gctx.globalAlpha = 1;
    gctx.fillStyle = C.muted; gctx.font = '10px DM Sans, sans-serif'; gctx.textAlign = 'left'; gctx.textBaseline = 'middle';
    gctx.fillText('blocco ' + b, lx + i * 66 + 14, ly);
  });
  gctx.fillStyle = C.muted; gctx.font = '10px DM Sans, sans-serif';
  gctx.fillText('clic su un elemento per sceglierlo', lx, ly + 16);
}

// ── Readout ───────────────────────────────────────────────────────────────────
const readout = new Lab.Readout(readoutEl, [
  { key: 'el',    label: 'Elemento' },
  { key: 'conf',  label: 'Configurazione' },
  { key: 'unp',   label: 'Elettroni spaiati' },
  { key: 'mag',   label: 'Magnetismo' },
  { key: 'outer', label: 'Guscio esterno' },
  { key: 'pos',   label: 'Periodo · gruppo · blocco' },
]);

function updateReadout() {
  const boxes = currentBoxes(), c = countsOf(boxes);
  let unp = 0;
  for (const s of SUBSHELLS) for (const b of boxes[s.label]) if ((b[0] !== 0) !== (b[1] !== 0)) unp++;
  const occupied = SUBSHELLS.filter(s => c[s.label] > 0);
  const nMax = occupied.length ? Math.max(...occupied.map(s => s.n)) : 0;
  const outer = occupied.filter(s => s.n === nMax).reduce((a, s) => a + c[s.label], 0);
  const p = tablePos(P.Z);
  readout.set('el', `${ELEMENTS[P.Z].sym} · ${ELEMENTS[P.Z].name}`);
  readout.set('conf', configString(c, true, true, P.charge !== 0));
  readout.set('unp', String(unp));
  readout.set('mag', unp > 0 ? 'paramagnetico' : 'diamagnetico');
  readout.set('outer', nMax ? `n = ${nMax}: ${outer} e⁻` : '—');
  readout.set('pos', `${p.period} · ${p.col || '—'} · ${blockOf(P.Z)}`);
}

// ── Controlli ─────────────────────────────────────────────────────────────────
let zSlider, chargeSlider, buildBox;

function resetBuild() { build = boxesFromCounts(emptyCounts()); selected = null; }

function setElement(Z) {
  P.Z = Math.max(1, Math.min(118, Z));
  if (P.charge >= P.Z) P.charge = P.Z - 1;
  zSlider.setValue(P.Z); chargeSlider.setValue(P.charge);
  anim = null; resetBuild();
  selectLast();
}

function selectLast() {
  if (P.mode === 'build') { selected = null; return; }
  const seq = fillSequence(groundConfig(P.Z, P.charge));
  const e = seq[seq.length - 1];
  selected = e ? { sub: e.sub, box: e.box, slot: e.spin > 0 ? 0 : 1 } : null;
}

function buildControls() {
  const cont = document.getElementById('controls');
  cont.innerHTML = '';
  const boxCss = 'font-size:11px;color:var(--text-secondary);line-height:1.7;padding:10px 12px;background:var(--bg3);border-radius:8px;';

  const secAtom = Lab.Section('Atomo');
  zSlider = Lab.Slider({ label: 'Numero atomico Z', min: 1, max: 118, step: 1, value: P.Z, onChange(v) { setElement(v); } });
  chargeSlider = Lab.Slider({ label: 'Carica dello ione', min: -3, max: 3, step: 1, value: P.charge,
    onChange(v) { P.charge = Math.min(v, P.Z - 1); if (P.charge !== v) chargeSlider.setValue(P.charge); anim = null; resetBuild(); selectLast(); } });
  secAtom.add(zSlider); secAtom.add(chargeSlider);

  const secMode = Lab.Section('Modalità');
  secMode.add(Lab.RadioGroup({
    label: 'Cosa fare',
    options: [
      { value: 'ground', label: 'Stato fondamentale', hint: 'guarda' },
      { value: 'build',  label: 'Costruisci tu', hint: 'prova' },
    ],
    value: P.mode,
    onChange(v) { P.mode = v; anim = null; resetBuild(); selectLast(); buildBox.style.display = v === 'build' ? '' : 'none'; },
  }));
  buildBox = document.createElement('div');
  buildBox.style.display = P.mode === 'build' ? '' : 'none';
  const row = document.createElement('div');
  row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;';
  for (const [label, fn] of [['Svuota', () => { resetBuild(); }], ['Mostra soluzione', () => { build = boxesFromCounts(groundConfig(P.Z, P.charge)); }]]) {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'padding:7px 4px;border-radius:6px;border:1px solid var(--border-hover);background:var(--bg3);color:var(--text-primary);cursor:pointer;font-family:"DM Sans",sans-serif;font-size:11px;font-weight:600;';
    b.addEventListener('click', fn);
    row.appendChild(b);
  }
  const hint = document.createElement('div');
  hint.style.cssText = boxCss + 'margin-bottom:12px;';
  hint.innerHTML = 'Sistema gli elettroni nelle caselle: clic sulla metà sinistra o destra di una casella per mettere ↑, poi ↓, poi toglierlo. Il lab controlla Pauli, Hund e Aufbau mentre lavori.';
  buildBox.append(row, hint);
  secMode.add(buildBox);

  const secView = Lab.Section('Visualizzazione');
  secView.add(Lab.RadioGroup({
    label: 'Ordine nella configurazione',
    options: [
      { value: 'energy', label: 'Per energia', hint: '… 4s² 3d⁶' },
      { value: 'n',      label: 'Per livello n', hint: '… 3d⁶ 4s²' },
    ],
    value: P.byN ? 'n' : 'energy',
    onChange(v) { P.byN = v === 'n'; },
  }));
  secView.add(Lab.Slider({ label: 'Velocità del riempimento', unit: '×', min: 0.25, max: 4, step: 0.25, value: P.speed, onChange(v) { P.speed = v; } }));

  const secRules = Lab.Section('Le regole');
  const rules = document.createElement('div');
  rules.style.cssText = boxCss;
  rules.innerHTML =
    '<b style="color:var(--text-primary)">Numeri quantici.</b> Ogni elettrone è descritto da n (livello), l (forma dell\'orbitale: s, p, d, f), mₗ (orientazione, da −l a +l) e mₛ (spin, +½ o −½).<br>' +
    '<b style="color:var(--text-primary)">Principio di esclusione di Pauli.</b> In un atomo due elettroni non possono avere tutti e quattro i numeri quantici uguali: un orbitale contiene al massimo 2 elettroni, con spin opposti.<br>' +
    '<b style="color:var(--text-primary)">Principio di Aufbau.</b> Gli elettroni occupano prima i sottolivelli a energia più bassa, nell\'ordine dato dalla regola di Madelung (n + l crescente; a parità, n crescente).<br>' +
    '<b style="color:var(--text-primary)">Regola di Hund.</b> In un sottolivello con più orbitali (p, d, f) gli elettroni si dispongono prima uno per orbitale, con spin paralleli, e solo dopo si appaiano.<br>' +
    'Alcuni elementi (Cr, Cu, Mo, Ag, Au, molte terre rare) fanno eccezione: il lab mostra la loro configurazione reale.';
  secRules.add(rules);

  cont.append(secAtom.el, secMode.el, secView.el, secRules.el);
}

// ── Interazione ───────────────────────────────────────────────────────────────
canvas.addEventListener('click', e => {
  const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  const hit = slotRects.find(s => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h);
  if (!hit) return;
  if (P.mode === 'build') {
    const b = build[hit.sub.label][hit.box];
    b[hit.slot] = b[hit.slot] === 0 ? 1 : b[hit.slot] === 1 ? -1 : 0;
    selected = b[hit.slot] ? { sub: hit.sub, box: hit.box, slot: hit.slot } : null;
  } else if (currentBoxes()[hit.sub.label][hit.box][hit.slot]) {
    selected = { sub: hit.sub, box: hit.box, slot: hit.slot };
  }
});
canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  canvas.style.cursor = slotRects.some(s => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) ? 'pointer' : 'default';
});
gCanvas.addEventListener('click', e => {
  const r = gCanvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  const hit = cellRects.find(c => x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h);
  if (hit) setElement(hit.Z);
});
gCanvas.addEventListener('mousemove', e => {
  const r = gCanvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  const hit = cellRects.find(c => x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h);
  gCanvas.style.cursor = hit ? 'pointer' : 'default';
  gCanvas.title = hit ? `${hit.Z} · ${ELEMENTS[hit.Z].name}` : '';
});

// ── Animazione del riempimento ───────────────────────────────────────────────
const btnPlay = document.getElementById('btnPlay');
function syncPlay() { btnPlay.textContent = anim && anim.shown < anim.seq.length ? '⏸  STOP' : '▶  RIEMPI'; }
btnPlay.addEventListener('click', () => {
  if (anim && anim.shown < anim.seq.length) { anim = null; selectLast(); syncPlay(); return; }
  if (P.mode === 'build') { P.mode = 'ground'; buildControls(); }
  anim = { seq: fillSequence(groundConfig(P.Z, P.charge)), shown: 0, t: 0 };
  syncPlay();
});
document.getElementById('btnReset').addEventListener('click', () => {
  P.charge = 0; P.mode = 'ground'; P.byN = false; P.speed = 1;
  buildControls(); setElement(8); syncPlay();
});

let lastTS = null;
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = lastTS === null ? 0 : Math.min((ts - lastTS) / 1000, 0.1);
  lastTS = ts;
  if (anim && anim.shown < anim.seq.length) {
    anim.t += dt * P.speed;
    while (anim.t >= 0.55 && anim.shown < anim.seq.length) {
      anim.t -= 0.55; anim.shown++;
      const e = anim.seq[anim.shown - 1];
      selected = { sub: e.sub, box: e.box, slot: e.spin > 0 ? 0 : 1 };
    }
    if (anim.shown >= anim.seq.length) syncPlay();
  }
  flashT = Math.max(0, flashT - dt);
  C = getColors();
  drawScene();
  drawTable();
  updateReadout();
}

// ── Init ──────────────────────────────────────────────────────────────────────
Lab.initTheme('themeToggle');
resize();
buildControls();
resetBuild();
selectLast();
syncPlay();
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(canvas.parentElement);
requestAnimationFrame(loop);
