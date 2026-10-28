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
const ionLabel = q => q === 0 ? '' : (Math.abs(q) > 1 ? sup(Math.abs(q)) : '') + (q > 0 ? '⁺' : '⁻');

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

function unpairedOf(c) {
  let u = 0;
  for (const s of SUBSHELLS) { const e = c[s.label]; u += e <= s.k ? e : 2 * s.k - e; }
  return u;
}

// Elettroni del guscio di valenza per il simbolo di Lewis: s e p del livello esterno dell'atomo
// neutro (per i metalli di transizione e le terre rare restano solo gli s esterni).
function lewisDots(Z, c) {
  const n = tablePos(Z).period;
  return (c[n + 's'] || 0) + (c[n + 'p'] || 0);
}

// ── Spiegazione breve dell'elemento o dello ione scelto ──────────────────────
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
      out.push('Si tolgono prima gli elettroni del livello n più alto, cioè gli s, anche se nell\'atomo neutro il sottolivello d si era riempito dopo.');
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

// ── Parametri e stato ─────────────────────────────────────────────────────────
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
const infoBar   = document.getElementById('infoBar');
let SW = 0, SH = 0, GW = 0, GH = 0, DPR = 1;

function resize() {
  DPR = window.devicePixelRatio || 1;
  const area = canvas.parentElement, areaH = area.clientHeight;
  const stacked = window.innerWidth <= 800;    // layout a colonna: la pagina scorre
  // l'area della tavola periodica si adatta all'altezza disponibile, così il diagramma resta grande
  const gh = stacked ? 170 : Math.round(Math.max(118, Math.min(230, areaH * 0.26)));
  if (graphArea.offsetHeight !== gh) { graphArea.style.height = gh + 'px'; graphArea.style.minHeight = '0'; }
  SW = area.clientWidth;
  SH = stacked ? 380 : Math.max(0, areaH - infoBar.offsetHeight - gh - (readoutEl.offsetHeight || 0));
  canvas.width = Math.round(SW * DPR); canvas.height = Math.round(SH * DPR);
  canvas.style.width = SW + 'px'; canvas.style.height = SH + 'px';
  GW = graphArea.clientWidth; GH = gh;
  gCanvas.width = Math.round(GW * DPR); gCanvas.height = Math.round(GH * DPR);
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
    accent: getCSSVar('--accent') || '#00d4ff',
    grid: light ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.16)',
    up: light ? '#0a84c0' : '#3fd6ff', down: light ? '#d6336c' : '#ff6b9d',
    bad: light ? '#e03131' : '#ff5c5c', warn: light ? '#e8590c' : '#ffb44d',
    block: { s: '#ff8a5c', p: '#5cc8ff', d: '#ffd24d', f: '#7ee08a' },
  };
}

// Testo centrato davvero: base "middle" corretta di poco verso il basso per le maiuscole
function text(c, str, x, y, { color = C.text, size = 12, align = 'center', bold = false, mono = false } = {}) {
  c.fillStyle = color;
  c.font = `${bold ? '700 ' : ''}${size}px ${mono ? 'Space Mono, monospace' : 'DM Sans, sans-serif'}`;
  c.textAlign = align; c.textBaseline = 'middle';
  c.fillText(str, x, y + size * 0.06);
}

function spinArrow(x, y, h, spin, color, width = 2) {
  const top = y - h / 2, bot = y + h / 2, head = Math.max(3, h * 0.28);
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, spin > 0 ? bot : top); ctx.lineTo(x, spin > 0 ? top + head * 0.6 : bot - head * 0.6); ctx.stroke();
  const ty = spin > 0 ? top : bot, d = spin > 0 ? 1 : -1;
  ctx.beginPath(); ctx.moveTo(x, ty); ctx.lineTo(x - head * 0.6, ty + d * head); ctx.lineTo(x + head * 0.6, ty + d * head); ctx.closePath(); ctx.fill();
}

function card(c, x, y, w, h, title) {
  c.fillStyle = C.panel; c.strokeStyle = C.grid; c.lineWidth = 1;
  c.beginPath(); c.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 8); c.fill(); c.stroke();
  if (title) text(c, title, x + 12, y + 14, { size: 10.5, color: C.muted, align: 'left' });
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
    const doubles = bx.filter(b => b[0] && b[1]).length, empties = bx.filter(b => !b[0] && !b[1]).length;
    const singles = bx.filter(b => (b[0] !== 0) !== (b[1] !== 0)).map(b => b[0] || b[1]);
    if ((doubles > 0 && empties > 0) || (singles.length > 1 && new Set(singles).size > 1)) res.hund.add(s.label);
    if (c[s.label] > 0 && SUBSHELLS.some(t => t.order < s.order && c[t.label] < t.cap)) res.aufbau = true;
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

function messages(valid) {
  if (P.mode === 'build') return [['', `Sistema ${nElectrons()} elettroni nelle caselle.`], ...valid.msgs];
  if (anim && anim.shown > 0 && anim.shown < anim.seq.length) {
    const e = anim.seq[anim.shown - 1], s = e.sub;
    if (e.idx === 0) return [['', `Aufbau: l'elettrone ${anim.shown} va nel sottolivello libero a energia più bassa, ${s.label}.`]];
    if (e.spin > 0) return [['', `Regola di Hund: in ${s.label} un elettrone per orbitale, tutti con spin paralleli (elettrone ${anim.shown}).`]];
    return [['', `Principio di Pauli: il secondo elettrone dell'orbitale ha spin opposto, al massimo 2 per orbitale (elettrone ${anim.shown}).`]];
  }
  return [['', explain(P.Z, P.charge)]];
}

// ── Intestazione (HTML) ──────────────────────────────────────────────────────
let infoKey = '', flashKey = '';
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function updateInfo(boxes, valid) {
  const c = countsOf(boxes), el = ELEMENTS[P.Z];
  const msgs = messages(valid);
  const short = configString(c, true, true, P.charge !== 0);
  const key = [P.Z, P.charge, P.mode, P.byN, C.light, configString(c, P.byN, false), JSON.stringify(msgs)].join('|');
  if (key === infoKey) return;
  infoKey = key;
  const blk = blockOf(P.Z);
  const tile = document.getElementById('infoTile');
  tile.style.background = C.block[blk] + (C.light ? '55' : '33');
  tile.style.borderColor = C.block[blk];
  document.getElementById('infoZ').textContent = P.Z;
  document.getElementById('infoSym').textContent = el.sym + ionLabel(P.charge);
  document.getElementById('infoName').textContent = el.name;
  document.getElementById('infoTitle').textContent = `Z = ${P.Z} · ${nElectrons()} elettroni${P.charge ? ` (ione ${P.charge > 0 ? 'positivo' : 'negativo'})` : ''}`;
  document.getElementById('infoFull').textContent = configString(c, P.byN, false);
  document.getElementById('infoShort').textContent = short.startsWith('[') ? 'forma abbreviata: ' + short : '';
  const ex = document.getElementById('infoExplain');
  ex.innerHTML = msgs.map(([k, m]) => `<div class="${k}">${esc(m)}</div>`).join('');
  // evidenzia per un attimo quando cambia elemento, carica o modalità
  const fk = `${P.Z}|${P.charge}|${P.mode}`;
  if (fk !== flashKey) { flashKey = fk; ex.classList.remove('flash'); void ex.offsetWidth; ex.classList.add('flash'); }
  resize();
}

// ── Diagramma degli orbitali (caselle di Pauli e Hund) ───────────────────────
let slotRects = [];

// Si mostrano i sottolivelli fino a due oltre l'ultimo occupato: il diagramma resta grande
function visibleSubshells(boxes) {
  const c = countsOf(boxes);
  const groundLast = fillSequence(groundConfig(P.Z, Math.min(P.charge, 0))).pop();
  let last = groundLast ? groundLast.sub.order : 0;
  for (const s of SUBSHELLS) if (c[s.label] > 0) last = Math.max(last, s.order);
  const maxOrder = Math.min(SUBSHELLS.length - 1, Math.max(5, last + 2));
  return SUBSHELLS.filter(s => s.order <= maxOrder);
}

// Geometria: colonne per l (s, p, d, f), righe in ordine di energia. Due sottolivelli della
// stessa colonna non si sovrappongono mai: la riga sale di almeno una casella intera.
function diagramGeometry(subs, x0, y0, w, h) {
  const cols = [0, 1, 2, 3].filter(l => subs.some(s => s.l === l));
  const LABEL = 1.3, GAP = 0.45;
  const widthUnits = cols.reduce((a, l) => a + LABEL + (2 * l + 1) + GAP, 0) - GAP;
  const ys = [], lastInCol = {};
  let y = 0;
  subs.forEach((s, i) => {
    if (i > 0) y += 0.72;
    if (lastInCol[s.l] !== undefined) y = Math.max(y, lastInCol[s.l] + 1.18);
    ys.push(y); lastInCol[s.l] = y;
  });
  const heightUnits = y + 1;
  const B = Math.max(10, Math.min(w / widthUnits, h / heightUnits, 46));
  const colX = {};
  let x = x0 + (w - widthUnits * B) / 2;
  for (const l of cols) { colX[l] = x + LABEL * B; x += (LABEL + (2 * l + 1) + GAP) * B; }
  const yBase = y0 + h / 2 + (heightUnits * B) / 2 - B / 2;   // centro della riga più bassa
  return { B, pos: subs.map((s, i) => ({ s, x: colX[s.l], y: yBase - ys[i] * B })), top: yBase - (heightUnits - 1) * B - B / 2, bottom: yBase + B / 2 };
}

function drawDiagram(boxes, valid, x0, y0, w, h) {
  const subs = visibleSubshells(boxes);
  const G = diagramGeometry(subs, x0 + 34, y0, w - 34, h);
  const { B } = G;
  slotRects = [];

  // asse dell'energia
  const ax = x0 + 14;
  ctx.strokeStyle = C.muted; ctx.fillStyle = C.muted; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(ax, G.bottom); ctx.lineTo(ax, G.top + 8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ax, G.top); ctx.lineTo(ax - 4, G.top + 9); ctx.lineTo(ax + 4, G.top + 9); ctx.closePath(); ctx.fill();
  ctx.save(); ctx.translate(ax + 11, (G.top + G.bottom) / 2); ctx.rotate(-Math.PI / 2);
  text(ctx, 'energia', 0, 0, { color: C.muted, size: 10 }); ctx.restore();

  const c = countsOf(boxes);
  for (const { s, x, y } of G.pos) {
    const hundBad = valid && valid.hund.has(s.label);
    const empty = c[s.label] === 0 && P.mode === 'ground';
    ctx.globalAlpha = empty ? 0.45 : 1;
    text(ctx, s.label, x - B * 0.3, y, { color: hundBad ? C.warn : C.block[L_LETTER[s.l]], size: Math.max(10, B * 0.46), align: 'right', bold: true });
    for (let j = 0; j < s.k; j++) {
      const bx = x + j * B, by = y - B / 2;
      const pauliBad = valid && valid.pauli.has(s.label + ':' + j);
      ctx.strokeStyle = pauliBad ? C.bad : hundBad ? C.warn : C.grid;
      ctx.lineWidth = pauliBad || hundBad ? 2 : 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, B - 1, B - 1);
      const box = boxes[s.label][j];
      for (let k = 0; k < 2; k++) {
        slotRects.push({ x: bx + (k ? B / 2 : 0), y: by, w: B / 2, h: B, sub: s, box: j, slot: k });
        if (!box[k]) continue;
        const isSel = selected && selected.sub === s && selected.box === j && selected.slot === k;
        if (isSel) { ctx.fillStyle = C.light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.14)'; ctx.fillRect(bx + (k ? B / 2 : 1), by + 1, B / 2 - 1, B - 2); }
        spinArrow(bx + B * (k ? 0.68 : 0.32), y, B * 0.62, box[k], pauliBad ? C.bad : box[k] > 0 ? C.up : C.down, Math.max(1.5, B / 14));
      }
    }
    ctx.globalAlpha = 1;
  }
  if (P.mode === 'build') {
    text(ctx, 'clic sulla metà sinistra o destra di una casella: vuota → ↑ → ↓ → vuota', x0 + w / 2, y0 + h + 4, { size: 10, color: C.muted });
  }
}

// ── Simbolo di Lewis ─────────────────────────────────────────────────────────
function drawLewis(boxes, x, y, w, h) {
  if (h < 64 || w < 150) return;
  card(ctx, x, y, w, h, 'Simbolo di Lewis');
  const c = countsOf(boxes), el = ELEMENTS[P.Z];
  const dots = lewisDots(P.Z, c);
  const compact = h < 115;                     // poco spazio: simbolo a sinistra, testo a destra
  const cx = compact ? x + Math.min(w * 0.3, 90) : x + w / 2;
  const cy = compact ? y + 14 + (h - 14) / 2 : y + 28 + (h - 76) / 2;
  const fs = compact ? Math.max(18, Math.min(40, (h - 22) * 0.36)) : Math.max(20, Math.min(54, (h - 72) * 0.45, w * 0.2));
  const R = fs * 0.78, gapPair = fs * 0.24, dr = Math.max(2.6, fs * 0.075);
  text(ctx, el.sym, cx, cy, { size: fs, bold: true });

  // un elettrone per lato (su, destra, giù, sinistra), poi le coppie: come la regola di Hund
  const sides = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const perSide = [0, 0, 0, 0];
  if (P.Z === 2 && dots === 2) perSide[1] = 2;
  else for (let i = 0; i < dots; i++) perSide[i % 4]++;
  sides.forEach(([sx, sy], i) => {
    const n = perSide[i];
    for (let k = 0; k < n; k++) {
      const off = n === 2 ? (k ? gapPair : -gapPair) / 2 : 0;
      const px = cx + sx * R + (sy ? off : 0), py = cy + sy * R + (sx ? off : 0);
      ctx.beginPath(); ctx.arc(px, py, dr, 0, 2 * Math.PI);
      ctx.fillStyle = n === 1 ? C.accent : C.text; ctx.fill();
    }
  });
  if (P.charge !== 0) {
    ctx.strokeStyle = C.text; ctx.lineWidth = Math.max(1.5, fs / 26);
    const bw = R + fs * 0.42, bh = R + fs * 0.36, t = fs * 0.16;
    ctx.beginPath();
    ctx.moveTo(cx - bw + t, cy - bh); ctx.lineTo(cx - bw, cy - bh); ctx.lineTo(cx - bw, cy + bh); ctx.lineTo(cx - bw + t, cy + bh);
    ctx.moveTo(cx + bw - t, cy - bh); ctx.lineTo(cx + bw, cy - bh); ctx.lineTo(cx + bw, cy + bh); ctx.lineTo(cx + bw - t, cy + bh);
    ctx.stroke();
    text(ctx, (Math.abs(P.charge) > 1 ? Math.abs(P.charge) : '') + (P.charge > 0 ? '+' : '−'), cx + bw + 4, cy - bh + fs * 0.12, { size: fs * 0.42, bold: true, align: 'left' });
  }
  const pairs = perSide.filter(n => n === 2).length, singles = perSide.filter(n => n === 1).length;
  const blk = blockOf(P.Z);
  const note = dots === 0 ? 'guscio di valenza vuoto'
    : `${dots} elettron${dots === 1 ? 'e' : 'i'} di valenza` + (pairs ? ` · ${pairs} coppi${pairs === 1 ? 'a' : 'e'}` : '') + (singles ? ` · ${singles} spaiat${singles === 1 ? 'o' : 'i'}` : '');
  const sub2 = blk === 'd' || blk === 'f' ? 'metallo di transizione: solo gli s esterni' : 'punti colorati = elettroni spaiati';
  if (compact) {
    const tx = cx + R + fs * 0.75 + 10, room = x + w - tx - 10;
    const lines = [
      ...fitLines(note.split(' · '), room, '11px DM Sans, sans-serif').map(t => [t, 11, C.text]),
      ...fitLines([sub2], room, '9.5px DM Sans, sans-serif').map(t => [t, 9.5, C.muted]),
    ];
    let ly = cy - (lines.length - 1) * 7.5;
    for (const [t, size, color] of lines) { text(ctx, t, tx, ly, { size, color, align: 'left' }); ly += 15; }
  } else {
    text(ctx, note, cx, y + h - 34, { size: 11.5, color: C.text });
    text(ctx, sub2, cx, y + h - 16, { size: 10, color: C.muted });
  }
}

// Unisce i pezzi finché stanno nella larghezza, altrimenti va a capo (anche dentro un pezzo)
function fitLines(parts, maxW, font) {
  ctx.font = font;
  const lines = [];
  let cur = '';
  const push = t => {
    if (ctx.measureText(t).width <= maxW) { lines.push(t); return; }
    let line = '';
    for (const w of t.split(' ')) {
      const tt = line ? line + ' ' + w : w;
      if (ctx.measureText(tt).width > maxW && line) { lines.push(line); line = w; } else line = tt;
    }
    if (line) lines.push(line);
  };
  for (const part of parts) {
    const t = cur ? cur + ' · ' + part : part;
    if (ctx.measureText(t).width <= maxW) cur = t;
    else { if (cur) push(cur); cur = part; }
  }
  if (cur) push(cur);
  return lines;
}

// ── Numeri quantici dell'elettrone selezionato ───────────────────────────────
function drawQuantum(boxes, x, y, w, h) {
  card(ctx, x, y, w, h, w < 280 ? 'Numeri quantici' : 'Numeri quantici dell\'elettrone selezionato');
  const spin = selected ? boxes[selected.sub.label][selected.box][selected.slot] : 0;
  if (!spin) { text(ctx, 'fai clic su una freccia', x + w / 2, y + h / 2 + 7, { size: 11, color: C.muted }); return; }
  const { sub, box } = selected, ml = box - sub.l;
  const items = [['n', String(sub.n)], ['l', `${sub.l} (${L_LETTER[sub.l]})`], ['mₗ', (ml > 0 ? '+' : '') + ml], ['mₛ', spin > 0 ? '+½ ↑' : '−½ ↓']];
  const cw = (w - 16) / 4, mid = y + 14 + (h - 14) / 2;
  items.forEach(([k, v], i) => {
    const cx = x + 8 + cw * (i + 0.5);
    text(ctx, k, cx, mid - 9, { size: 11, color: C.muted, mono: true });
    text(ctx, v, cx, mid + 10, { size: 13, bold: true, mono: true, color: k === 'mₛ' ? (spin > 0 ? C.up : C.down) : C.text });
  });
}

function drawScene(boxes, valid) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, SW, SH);
  if (SW < 60 || SH < 60) return;
  const pad = 12;
  // il diagramma ha la precedenza: Lewis e numeri quantici compaiono a lato solo se c'è spazio
  const side = SW >= 520 ? Math.max(190, Math.min(360, SW * 0.3)) : 0;
  const strip = side ? 0 : Math.min(96, SH * 0.36);
  const bottomHint = P.mode === 'build' ? 16 : 0;
  drawDiagram(boxes, valid, pad, pad, SW - side - pad * (side ? 3 : 2), SH - pad * 2 - bottomHint - (strip ? strip + pad : 0));
  if (side) {
    const x = SW - side - pad, qh = Math.max(64, Math.min(80, SH * 0.28));
    drawLewis(boxes, x, pad, side, SH - qh - pad * 3);
    drawQuantum(boxes, x, SH - qh - pad, side, qh);
  } else if (strip > 50) {
    const y = SH - strip - pad, lw = (SW - pad * 3) * 0.55;
    drawLewis(boxes, pad, y, lw, strip);
    drawQuantum(boxes, pad * 2 + lw, y, SW - pad * 3 - lw, strip);
  }
}

// ── Tavola periodica e diagramma di Madelung (area in basso) ─────────────────
let cellRects = [];
function drawTable(w) {
  cellRects = [];
  const pad = 8, cw = (w - pad * 2) / 18, ch = (GH - pad * 2) / 9.3;
  for (let Z = 1; Z <= 118; Z++) {
    const p = tablePos(Z);
    const x = pad + (p.col ? p.col - 1 : p.fcol + 2) * cw;
    const y = pad + (p.col ? p.period - 1 : 7.3 + p.frow) * ch;
    const col = C.block[blockOf(Z)], sel = Z === P.Z;
    gctx.globalAlpha = sel ? 0.95 : 0.3;
    gctx.fillStyle = col; gctx.fillRect(x + 1, y + 1, cw - 2, ch - 2);
    gctx.globalAlpha = 1;
    if (sel) { gctx.strokeStyle = C.text; gctx.lineWidth = 2; gctx.strokeRect(x + 1, y + 1, cw - 2, ch - 2); }
    text(gctx, ELEMENTS[Z].sym, x + cw / 2, y + ch / 2, { size: Math.max(8, Math.min(12, ch * 0.5, cw * 0.42)), bold: sel, color: sel ? '#06101a' : C.text });
    if (cw > 36 && ch > 18) text(gctx, String(Z), x + 3, y + 6, { size: 7.5, mono: true, align: 'left', color: sel ? '#06101a' : C.muted });
    cellRects.push({ x, y, w: cw, h: ch, Z });
  }
  // legenda dei blocchi nello spazio vuoto in alto, fra il gruppo 2 e il gruppo 13
  const lx = pad + 2.4 * cw, ly = pad + ch * 0.5, room = 10 * cw;
  const long = room >= 4 * 66, step = long ? Math.min(70, room / 4) : Math.min(30, room / 4);
  ['s', 'p', 'd', 'f'].forEach((b, i) => {
    gctx.globalAlpha = 0.65; gctx.fillStyle = C.block[b]; gctx.fillRect(lx + i * step, ly - 5, 10, 10); gctx.globalAlpha = 1;
    text(gctx, long ? 'blocco ' + b : b, lx + i * step + 14, ly, { size: 10, color: C.muted, align: 'left' });
  });
  if (ch > 14 && room > 190) text(gctx, 'clic su un elemento per sceglierlo', lx, ly + ch, { size: 10, color: C.muted, align: 'left' });
}

function drawMadelung(boxes, x0, w) {
  const c = countsOf(boxes);
  card(gctx, x0, 6, w, GH - 12, 'Ordine di riempimento');
  const cw = (w - 20) / 4, ch = (GH - 40) / 7;
  const r = Math.max(7, Math.min(cw * 0.42, ch * 0.44));
  const pos = s => [x0 + 10 + cw * (s.l + 0.5), 30 + ch * (s.n - 0.5)];
  // diagonali n + l = costante, percorse dall'alto a destra verso il basso a sinistra
  gctx.strokeStyle = C.muted; gctx.fillStyle = C.muted; gctx.lineWidth = 1; gctx.globalAlpha = 0.5;
  for (let sum = 1; sum <= 8; sum++) {
    const diag = SUBSHELLS.filter(s => s.n + s.l === sum);
    const [ax, ay] = pos(diag[0]), [bx, by] = pos(diag[diag.length - 1]);
    const a = Math.atan2(ch, -cw), ux = Math.cos(a), uy = Math.sin(a);
    const sx = ax - ux * r * 1.1, sy = ay - uy * r * 1.1, ex = bx + ux * r * 1.25, ey = by + uy * r * 1.25;
    gctx.beginPath(); gctx.moveTo(sx, sy); gctx.lineTo(ex, ey); gctx.stroke();
    gctx.beginPath(); gctx.moveTo(ex, ey);
    gctx.lineTo(ex - 6 * Math.cos(a - 0.45), ey - 6 * Math.sin(a - 0.45));
    gctx.lineTo(ex - 6 * Math.cos(a + 0.45), ey - 6 * Math.sin(a + 0.45));
    gctx.closePath(); gctx.fill();
  }
  gctx.globalAlpha = 1;
  for (const s of SUBSHELLS) {
    const [x, y] = pos(s), col = C.block[L_LETTER[s.l]], f = c[s.label] / s.cap;
    gctx.beginPath(); gctx.arc(x, y, r, 0, 2 * Math.PI); gctx.fillStyle = C.bg3; gctx.fill();
    if (f > 0) {
      gctx.beginPath(); gctx.moveTo(x, y); gctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + f * 2 * Math.PI); gctx.closePath();
      gctx.globalAlpha = 0.55; gctx.fillStyle = col; gctx.fill(); gctx.globalAlpha = 1;
    }
    gctx.beginPath(); gctx.arc(x, y, r, 0, 2 * Math.PI);
    gctx.strokeStyle = f > 0 ? col : C.grid; gctx.lineWidth = 1.4; gctx.stroke();
    text(gctx, s.label + (c[s.label] ? sup(c[s.label]) : ''), x, y, { size: Math.max(8, r * 0.62), bold: true, color: f > 0 ? C.text : C.muted });
  }
}

function drawBottom(boxes) {
  gctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  gctx.fillStyle = C.panel; gctx.fillRect(0, 0, GW, GH);
  const mw = GW >= 640 ? Math.max(170, Math.min(240, GW * 0.22)) : 0;
  drawTable(GW - mw - (mw ? 8 : 0));
  if (mw) drawMadelung(boxes, GW - mw - 6, mw);
}

// ── Readout ───────────────────────────────────────────────────────────────────
const readout = new Lab.Readout(readoutEl, [
  { key: 'el',    label: 'Elemento' },
  { key: 'conf',  label: 'Configurazione' },
  { key: 'unp',   label: 'Elettroni spaiati' },
  { key: 'mag',   label: 'Magnetismo' },
  { key: 'pos',   label: 'Periodo · gruppo' },
]);

function updateReadout(boxes) {
  const c = countsOf(boxes);
  let unp = 0;
  for (const s of SUBSHELLS) for (const b of boxes[s.label]) if ((b[0] !== 0) !== (b[1] !== 0)) unp++;
  const p = tablePos(P.Z);
  readout.set('el', `${ELEMENTS[P.Z].sym}${ionLabel(P.charge)} · ${ELEMENTS[P.Z].name}`);
  readout.set('conf', configString(c, true, true, P.charge !== 0));
  readout.set('unp', String(unp));
  readout.set('mag', unp > 0 ? 'paramagnetico' : 'diamagnetico');
  readout.set('pos', `${p.period} · ${p.col || '—'} (${blockOf(P.Z)})`);
}

// ── Controlli ─────────────────────────────────────────────────────────────────
let zSlider, chargeSlider, buildBox;

function resetBuild() { build = boxesFromCounts(emptyCounts()); if (P.mode === 'build') selected = null; }

function setElement(Z) {
  P.Z = Math.max(1, Math.min(118, Z));
  if (P.charge >= P.Z) P.charge = P.Z - 1;
  zSlider.setValue(P.Z); chargeSlider.setValue(P.charge);
  anim = null; resetBuild(); selectLast(); syncPlay();
}

function selectLast() {
  if (P.mode === 'build') { selected = null; return; }
  const e = fillSequence(groundConfig(P.Z, P.charge)).pop();
  selected = e ? { sub: e.sub, box: e.box, slot: e.spin > 0 ? 0 : 1 } : null;
}

function smallButton(label, fn) {
  const b = document.createElement('button');
  b.textContent = label;
  b.style.cssText = 'padding:7px 4px;border-radius:6px;border:1px solid var(--border-hover);background:var(--bg3);color:var(--text-primary);cursor:pointer;font-family:"DM Sans",sans-serif;font-size:11px;font-weight:600;';
  b.addEventListener('click', fn);
  return b;
}

function buildControls() {
  const cont = document.getElementById('controls');
  cont.innerHTML = '';
  const boxCss = 'font-size:11px;color:var(--text-secondary);line-height:1.7;padding:10px 12px;background:var(--bg3);border-radius:8px;';

  const secAtom = Lab.Section('Atomo');
  zSlider = Lab.Slider({ label: 'Numero atomico Z', min: 1, max: 118, step: 1, value: P.Z, onChange(v) { setElement(v); } });
  chargeSlider = Lab.Slider({ label: 'Carica dello ione', min: -3, max: 3, step: 1, value: P.charge,
    onChange(v) { P.charge = Math.min(v, P.Z - 1); if (P.charge !== v) chargeSlider.setValue(P.charge); anim = null; resetBuild(); selectLast(); syncPlay(); } });
  secAtom.add(zSlider);
  const nav = document.createElement('div');
  nav.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:-6px 0 16px;';
  nav.append(smallButton('◀  precedente', () => setElement(P.Z - 1)), smallButton('successivo  ▶', () => setElement(P.Z + 1)));
  secAtom.add(nav);
  secAtom.add(chargeSlider);

  const secMode = Lab.Section('Modalità');
  secMode.add(Lab.RadioGroup({
    label: 'Cosa fare',
    options: [
      { value: 'ground', label: 'Stato fondamentale', hint: 'guarda' },
      { value: 'build',  label: 'Costruisci tu', hint: 'prova' },
    ],
    value: P.mode,
    onChange(v) { P.mode = v; anim = null; resetBuild(); selectLast(); syncPlay(); buildBox.style.display = v === 'build' ? '' : 'none'; },
  }));
  buildBox = document.createElement('div');
  buildBox.style.display = P.mode === 'build' ? '' : 'none';
  const row = document.createElement('div');
  row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;';
  row.append(smallButton('Svuota', () => resetBuild()), smallButton('Mostra soluzione', () => { build = boxesFromCounts(groundConfig(P.Z, P.charge)); }));
  const hint = document.createElement('div');
  hint.style.cssText = boxCss + 'margin-bottom:12px;';
  hint.textContent = 'Sistema gli elettroni nelle caselle: clic sulla metà sinistra o destra di una casella per mettere ↑, poi ↓, poi toglierlo. Il lab controlla Pauli, Hund e Aufbau mentre lavori.';
  buildBox.append(row, hint);
  secMode.add(buildBox);

  const secView = Lab.Section('Visualizzazione');
  secView.add(Lab.RadioGroup({
    label: 'Ordine nella configurazione',
    options: [
      { value: 'energy', label: 'Per energia', hint: '4s² 3d⁶' },
      { value: 'n',      label: 'Per livello n', hint: '3d⁶ 4s²' },
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
    '<b style="color:var(--text-primary)">Simbolo di Lewis.</b> Il simbolo dell\'elemento circondato dai suoi elettroni di valenza, come punti: prima uno per lato, poi in coppie.<br>' +
    'Alcuni elementi (Cr, Cu, Mo, Ag, Au, molte terre rare) fanno eccezione: il lab mostra la loro configurazione reale.';
  secRules.add(rules);

  cont.append(secAtom.el, secMode.el, secView.el, secRules.el);
}

// ── Interazione ───────────────────────────────────────────────────────────────
const hitSlot = (x, y) => slotRects.find(s => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h);
const hitCell = (x, y) => cellRects.find(c => x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h);
const localXY = (el, e) => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

canvas.addEventListener('click', e => {
  const hit = hitSlot(...localXY(canvas, e));
  if (!hit) return;
  if (P.mode === 'build') {
    const b = build[hit.sub.label][hit.box];
    b[hit.slot] = b[hit.slot] === 0 ? 1 : b[hit.slot] === 1 ? -1 : 0;
    selected = b[hit.slot] ? { sub: hit.sub, box: hit.box, slot: hit.slot } : null;
  } else if (currentBoxes()[hit.sub.label][hit.box][hit.slot]) {
    selected = { sub: hit.sub, box: hit.box, slot: hit.slot };
  }
});
canvas.addEventListener('mousemove', e => { canvas.style.cursor = hitSlot(...localXY(canvas, e)) ? 'pointer' : 'default'; });
gCanvas.addEventListener('click', e => { const hit = hitCell(...localXY(gCanvas, e)); if (hit) setElement(hit.Z); });
gCanvas.addEventListener('mousemove', e => {
  const hit = hitCell(...localXY(gCanvas, e));
  gCanvas.style.cursor = hit ? 'pointer' : 'default';
  gCanvas.title = hit ? `${hit.Z} · ${ELEMENTS[hit.Z].name}` : '';
});
// frecce della tastiera: elemento precedente / successivo
window.addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input, select, textarea')) return;
  if (e.key === 'ArrowRight') setElement(P.Z + 1);
  if (e.key === 'ArrowLeft') setElement(P.Z - 1);
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
  buildControls(); setElement(8);
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
  C = getColors();
  const boxes = currentBoxes();
  const valid = P.mode === 'build' ? validate(boxes) : null;
  updateInfo(boxes, valid);
  drawScene(boxes, valid);
  drawBottom(boxes);
  updateReadout(boxes);
}

// ── Init ──────────────────────────────────────────────────────────────────────
Lab.initTheme('themeToggle');
buildControls();
resetBuild();
selectLast();
syncPlay();
resize();
new ResizeObserver(resize).observe(canvas.parentElement);
new ResizeObserver(resize).observe(infoBar);
requestAnimationFrame(loop);
