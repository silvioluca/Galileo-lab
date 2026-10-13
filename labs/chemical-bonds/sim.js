'use strict';

// ── Elementi ─────────────────────────────────────────────────────────────────
// c: colore, en: elettronegatività di Pauling, m: metallo, r: raggio di disegno,
// d: etichetta scura (atomi chiari)
const EL = {
  H:  { c: '#e9eef4', en: 2.20, r: 20, d: 1 },
  He: { c: '#bff3ff', r: 26, d: 1 },
  Li: { c: '#b98cff', en: 0.98, m: 1, r: 30 },
  Be: { c: '#9fdc6a', en: 1.57, m: 1, r: 26, d: 1 },
  B:  { c: '#f2b6a0', en: 2.04, r: 26, d: 1 },
  C:  { c: '#7d8791', en: 2.55, r: 28 },
  N:  { c: '#4f7dff', en: 3.04, r: 28 },
  O:  { c: '#ff5252', en: 3.44, r: 27 },
  F:  { c: '#9ae65c', en: 3.98, r: 26, d: 1 },
  Na: { c: '#a678f0', en: 0.93, m: 1, r: 34 },
  Mg: { c: '#57b85c', en: 1.31, m: 1, r: 32 },
  Al: { c: '#b9a9a9', en: 1.61, m: 1, r: 31, d: 1 },
  Si: { c: '#d9b77e', en: 1.90, r: 31, d: 1 },
  P:  { c: '#ff9a3c', en: 2.19, r: 31, d: 1 },
  S:  { c: '#f0d93a', en: 2.58, r: 31, d: 1 },
  Cl: { c: '#3ed65f', en: 3.16, r: 32, d: 1 },
  Ar: { c: '#62d6e8', r: 32, d: 1 },
  K:  { c: '#8a5fd6', en: 0.82, m: 1, r: 38 },
  Ca: { c: '#6fcf73', en: 1.00, m: 1, r: 36, d: 1 },
  Fe: { c: '#e07a3c', en: 1.83, m: 1, r: 32 },
  Cu: { c: '#d98a55', en: 1.90, m: 1, r: 32 },
  Zn: { c: '#8f9bb8', en: 1.65, m: 1, r: 32 },
  Br: { c: '#c2553b', en: 2.96, r: 35 },
  Ag: { c: '#c9d1d9', en: 1.93, m: 1, r: 34, d: 1 },
  I:  { c: '#9652c2', en: 2.66, r: 38 },
  Xe: { c: '#4c9fc4', r: 38 },
  Cs: { c: '#6f4bbd', en: 0.79, m: 1, r: 42 },
};
const PREDICT_ELEMENTS = Object.keys(EL).filter(k => EL[k].en !== undefined);

// ── Tipi di legame ───────────────────────────────────────────────────────────
// range: energia tipica in kJ/mol. curve: 'morse' oppure esponente m dell'attrazione 1/r^m.
const TYPES = [
  {
    id: 'ionic', group: 'primary', name: 'Ionico', short: 'Ionico',
    range: [400, 4000], curve: 1, law: 'attrazione ione–ione ∝ 1/r',
    eLabel: 'En. reticolare',
    examples: [
      { id: 'NaCl', label: 'NaCl', M: 'Na', X: 'Cl', ne: 1, E: 787,  d: 282, den: 2.23 },
      { id: 'LiF',  label: 'LiF',  M: 'Li', X: 'F',  ne: 1, E: 1037, d: 201, den: 3.00 },
      { id: 'MgO',  label: 'MgO',  M: 'Mg', X: 'O',  ne: 2, E: 3791, d: 211, den: 2.13 },
    ],
    info: '<b>Legame ionico.</b> Un metallo cede uno o più elettroni a un non metallo: nascono un catione e un anione che si attraggono elettrostaticamente. Si forma quando la differenza di elettronegatività è grande (indicativamente ΔEN &gt; 1,7).<br>Non è direzionale: ogni ione attira tutti quelli di segno opposto, quindi non esistono molecole ma un reticolo cristallino.<br><b>Proprietà:</b> solidi duri e fragili, alte temperature di fusione, conducono solo fusi o in soluzione.',
  },
  {
    id: 'covalent', group: 'primary', name: 'Covalente puro (apolare)', short: 'Covalente puro',
    range: [150, 1100], curve: 'morse', law: 'buca di potenziale (curva di Morse)',
    eLabel: 'En. di legame',
    examples: [
      { id: 'H2',  label: 'H₂ (singolo)',  A: 'H',  B: 'H',  order: 1, lp: [0, 0], E: 436, d: 74,  den: 0, lewis: 'H—H' },
      { id: 'Cl2', label: 'Cl₂ (singolo)', A: 'Cl', B: 'Cl', order: 1, lp: [3, 3], E: 242, d: 199, den: 0, lewis: 'Cl—Cl' },
      { id: 'O2',  label: 'O₂ (doppio)',   A: 'O',  B: 'O',  order: 2, lp: [2, 2], E: 498, d: 121, den: 0, lewis: 'O═O' },
      { id: 'N2',  label: 'N₂ (triplo)',   A: 'N',  B: 'N',  order: 3, lp: [1, 1], E: 945, d: 110, den: 0, lewis: 'N≡N' },
    ],
    info: '<b>Legame covalente puro.</b> Due atomi uguali (o con la stessa elettronegatività, ΔEN &lt; 0,4) mettono in comune una o più coppie di elettroni, condivise in parti uguali.<br>Il primo legame è sempre di tipo <b>σ</b> (sovrapposizione lungo l\'asse); i legami in più sono di tipo <b>π</b> (sovrapposizione laterale). Più coppie condivise = legame più corto e più forte.<br><b>Proprietà:</b> è direzionale e forma molecole; le sostanze apolari hanno basse temperature di ebollizione e non conducono.',
  },
  {
    id: 'polar', group: 'primary', name: 'Covalente polare', short: 'Covalente polare',
    range: [150, 1100], curve: 'morse', law: 'buca di potenziale (curva di Morse)',
    eLabel: 'En. di legame',
    examples: [
      { id: 'HCl', label: 'HCl', A: 'H', B: 'Cl', order: 1, lp: [0, 3], E: 431, d: 127, den: 0.96, lewis: 'H—Cl' },
      { id: 'HBr', label: 'HBr', A: 'H', B: 'Br', order: 1, lp: [0, 3], E: 366, d: 141, den: 0.76, lewis: 'H—Br' },
      { id: 'HF',  label: 'HF',  A: 'H', B: 'F',  order: 1, lp: [0, 3], E: 567, d: 92,  den: 1.78, lewis: 'H—F' },
    ],
    info: '<b>Legame covalente polare.</b> Gli elettroni sono condivisi, ma l\'atomo più elettronegativo li attira di più (0,4 &lt; ΔEN &lt; 1,7): su di lui compare una carica parziale δ−, sull\'altro una δ+. Il legame è un <b>dipolo</b>.<br>È il caso intermedio fra covalente puro e ionico: il carattere ionico cresce con ΔEN. HF supera la soglia di 1,7 ma resta una molecola covalente: le soglie sono solo indicative.<br><b>Proprietà:</b> se i dipoli non si annullano per simmetria, la molecola è polare (H₂O sì, CO₂ no).',
  },
  {
    id: 'dative', group: 'primary', name: 'Covalente dativo', short: 'Dativo',
    range: [150, 1100], curve: 'morse', law: 'buca di potenziale (curva di Morse)',
    eLabel: 'En. di legame',
    examples: [
      { id: 'NH4', label: 'NH₃ + H⁺ → NH₄⁺', donor: 'NH3', acceptor: 'H+',  product: 'ione ammonio NH₄⁺' },
      { id: 'H3O', label: 'H₂O + H⁺ → H₃O⁺', donor: 'H2O', acceptor: 'H+',  product: 'ione idronio H₃O⁺' },
      { id: 'BF3', label: 'NH₃ + BF₃ → H₃N→BF₃', donor: 'NH3', acceptor: 'BF3', product: 'addotto H₃N→BF₃' },
    ],
    info: '<b>Legame dativo (di coordinazione).</b> È un legame covalente in cui <b>entrambi</b> gli elettroni della coppia condivisa provengono dallo stesso atomo (il donatore, che ha una coppia solitaria); l\'altro (l\'accettore) mette a disposizione un orbitale vuoto.<br>Una volta formato è indistinguibile da un normale legame covalente: in NH₄⁺ i quattro legami N–H sono identici. Si indica con una freccia dal donatore all\'accettore.<br>È il legame dei complessi dei metalli di transizione e degli acidi e basi di Lewis.',
  },
  {
    id: 'metallic', group: 'primary', name: 'Metallico', short: 'Metallico',
    range: [75, 1000], curve: 'morse', law: 'buca di potenziale (curva di Morse)',
    eLabel: 'En. di atomizzazione',
    examples: [
      { id: 'Na', label: 'Na (1 e⁻ per atomo)', sym: 'Na', ion: 'Na⁺',  ne: 1, E: 107, d: 372 },
      { id: 'Mg', label: 'Mg (2 e⁻ per atomo)', sym: 'Mg', ion: 'Mg²⁺', ne: 2, E: 148, d: 320 },
      { id: 'Al', label: 'Al (3 e⁻ per atomo)', sym: 'Al', ion: 'Al³⁺', ne: 3, E: 326, d: 286 },
    ],
    info: '<b>Legame metallico.</b> Gli atomi di un metallo cedono gli elettroni di valenza a tutto il cristallo: i cationi restano ai nodi del reticolo, immersi in un «mare» di elettroni delocalizzati che li tiene uniti.<br>Più elettroni mette in comune ogni atomo, più il legame è forte (Na &lt; Mg &lt; Al).<br><b>Proprietà:</b> conducibilità elettrica e termica, lucentezza, malleabilità e duttilità (i piani di cationi scorrono senza rompere il legame). Attiva la differenza di potenziale per vedere la corrente.',
  },
  {
    id: 'hbond', group: 'inter', name: 'Legame a idrogeno', short: 'Legame a idrogeno',
    range: [10, 40], curve: 3, law: 'elettrostatico e direzionale',
    eLabel: 'Energia',
    examples: [
      { id: 'H2O', label: 'H₂O',  kind: 'water', E: 21, d: 180 },
      { id: 'HF',  label: 'HF',   kind: 'chain', X: 'F', extraH: 0, E: 29 },
      { id: 'NH3', label: 'NH₃',  kind: 'chain', X: 'N', extraH: 2, E: 13 },
    ],
    info: '<b>Legame a idrogeno.</b> Un atomo di H legato a un atomo piccolo e molto elettronegativo (<b>F, O, N</b>) resta quasi privo di elettroni (δ+) ed è attratto dalla coppia solitaria di un atomo F, O o N di una molecola vicina.<br>È la più forte delle forze intermolecolari ed è direzionale (i tre atomi X–H···Y tendono ad allinearsi).<br><b>Effetti:</b> alta temperatura di ebollizione dell\'acqua, ghiaccio meno denso dell\'acqua liquida, doppia elica del DNA, struttura delle proteine.',
  },
  {
    id: 'iondipole', group: 'inter', name: 'Ione–dipolo', short: 'Ione–dipolo',
    range: [40, 600], curve: 2, law: 'attrazione ∝ 1/r²',
    eLabel: 'En. di idratazione',
    examples: [
      { id: 'Na', label: 'Na⁺ in acqua', sym: 'Na', ion: 'Na⁺', q: 1,  E: 406 },
      { id: 'K',  label: 'K⁺ in acqua',  sym: 'K',  ion: 'K⁺',  q: 1,  E: 322 },
      { id: 'Cl', label: 'Cl⁻ in acqua', sym: 'Cl', ion: 'Cl⁻', q: -1, E: 363 },
    ],
    info: '<b>Interazione ione–dipolo.</b> Uno ione attira l\'estremità di carica opposta di una molecola polare. È ciò che avviene quando un sale si scioglie in acqua: le molecole d\'acqua circondano ogni ione (solvatazione, o idratazione) rivolgendo l\'ossigeno δ− verso i cationi e gli idrogeni δ+ verso gli anioni.<br>L\'energia liberata compensa l\'energia reticolare del cristallo: per questo molti composti ionici sono solubili in acqua. Il valore indicato è l\'entalpia di idratazione dello ione, cioè la somma di tutte le interazioni con l\'acqua che lo circonda.',
  },
  {
    id: 'dipole', group: 'inter', name: 'Dipolo–dipolo', short: 'Dipolo–dipolo',
    range: [5, 25], curve: 3, law: 'dipoli orientati: attrazione ∝ 1/r³',
    eLabel: 'Energia',
    examples: [
      { id: 'HCl', label: 'HCl (μ = 1,08 D)', X: 'Cl' },
      { id: 'HBr', label: 'HBr (μ = 0,82 D)', X: 'Br' },
      { id: 'HI',  label: 'HI (μ = 0,44 D)',  X: 'I' },
    ],
    info: '<b>Forze dipolo–dipolo (di Keesom).</b> Le molecole polari hanno un dipolo permanente: l\'estremità δ+ di una attira l\'estremità δ− dell\'altra, e le molecole tendono a orientarsi «testa–coda».<br>L\'agitazione termica disturba l\'allineamento, quindi l\'effetto diminuisce con la temperatura. Più grande è il momento dipolare μ, più forte è l\'attrazione.<br>Insieme alle due forze seguenti e a quelle di London forma le <b>forze di van der Waals</b>.',
  },
  {
    id: 'ioninduced', group: 'inter', name: 'Ione–dipolo indotto', short: 'Ione–dip. indotto',
    range: [3, 15], curve: 4, law: 'attrazione ∝ 1/r⁴',
    eLabel: 'Energia',
    examples: [
      { id: 'FeO2', label: 'Fe²⁺ ··· O₂', inducer: { ion: 'Fe', label: 'Fe²⁺', q: 1 },  target: ['O', 'O'] },
      { id: 'II2',  label: 'I⁻ ··· I₂',   inducer: { ion: 'I',  label: 'I⁻',  q: -1 }, target: ['I', 'I'] },
    ],
    info: '<b>Interazione ione–dipolo indotto.</b> La carica di uno ione deforma la nuvola elettronica di una molecola apolare vicina, che diventa temporaneamente un dipolo (dipolo <b>indotto</b>) e ne viene attratta.<br>L\'effetto dipende dalla <b>polarizzabilità</b> della molecola: è maggiore per nuvole elettroniche grandi e poco trattenute.<br>Esempi: il legame dell\'ossigeno con il ferro dell\'emoglobina inizia così; lo iodio I₂ si scioglie in soluzioni di ioduro formando I₃⁻.',
  },
  {
    id: 'dipoleinduced', group: 'inter', name: 'Dipolo–dipolo indotto', short: 'Dipolo–dip. indotto',
    range: [2, 10], curve: 6, law: 'attrazione ∝ 1/r⁶',
    eLabel: 'Energia',
    examples: [
      { id: 'H2OO2', label: 'H₂O ··· O₂', inducer: { mol: 'H2O' }, target: ['O', 'O'] },
      { id: 'HClAr', label: 'HCl ··· Ar', inducer: { mol: 'HCl' }, target: ['Ar'] },
    ],
    info: '<b>Forze dipolo–dipolo indotto (di Debye).</b> Una molecola polare, avvicinandosi a una apolare, ne deforma la nuvola elettronica e vi induce un dipolo; i due dipoli poi si attraggono.<br>È una forza debole, ma spiega perché gas apolari come O₂, N₂ e i gas nobili si sciolgono (poco) in acqua: è grazie a questa interazione che i pesci respirano l\'ossigeno disciolto.',
  },
  {
    id: 'london', group: 'inter', name: 'Forze di London', short: 'London (dispersione)',
    range: [0.05, 40], curve: 6, law: 'attrazione ∝ 1/r⁶',
    eLabel: 'Energia',
    examples: [
      { id: 'He', label: 'He (T eb. −269 °C)', sym: 'He', R: 30, A: 3,  E: 0.09 },
      { id: 'Ar', label: 'Ar (T eb. −186 °C)', sym: 'Ar', R: 46, A: 8,  E: 1.0 },
      { id: 'Xe', label: 'Xe (T eb. −108 °C)', sym: 'Xe', R: 62, A: 14, E: 2.3 },
    ],
    info: '<b>Forze di dispersione di London.</b> Anche in un atomo apolare gli elettroni si muovono: in ogni istante la nuvola può essere sbilanciata e creare un <b>dipolo istantaneo</b>, che induce un dipolo nell\'atomo vicino. I due dipoli fluttuano in sincronia e si attraggono.<br>Agiscono fra <b>tutte</b> le particelle e sono le sole presenti fra molecole apolari. Crescono con la polarizzabilità, cioè con il numero di elettroni e la superficie di contatto: per questo la temperatura di ebollizione sale da He a Xe, e I₂ è solido a temperatura ambiente.',
  },
  {
    id: 'predict', group: 'tool', name: 'Prevedi dal ΔEN', short: 'Previsione',
    info: '<b>Che legame si forma?</b> Scegli due elementi: la differenza di elettronegatività (scala di Pauling) dà una previsione di massima.<br>• due metalli → legame metallico<br>• ΔEN &lt; 0,4 → covalente puro<br>• 0,4 ≤ ΔEN ≤ 1,7 → covalente polare<br>• ΔEN &gt; 1,7 → ionico<br>Il carattere ionico percentuale è stimato con la formula di Pauling, 1 − e<sup>−ΔEN²/4</sup>. È una regola empirica: le soglie sono indicative e ci sono eccezioni (per esempio HF).',
  },
];
const TYPE_BY_ID = Object.fromEntries(TYPES.map(t => [t.id, t]));
const CHART_TYPES = TYPES.filter(t => t.range);

// ── Parameters ───────────────────────────────────────────────────────────────
const P = {
  type: 'ionic',
  example: {},        // id esempio scelto per ogni tipo
  speed: 1,
  labels: true,
  voltage: false,
  elA: 'Na',
  elB: 'Cl',
};
TYPES.forEach(t => { if (t.examples) P.example[t.id] = t.examples[0].id; });

const curType = () => TYPE_BY_ID[P.type];
const curExample = (t = curType()) => t.examples ? t.examples.find(e => e.id === P.example[t.id]) : null;

// Previsione dal ΔEN per la coppia scelta
function prediction() {
  const a = EL[P.elA], b = EL[P.elB];
  const den = Math.abs(a.en - b.en);
  let kind;
  if (a.m && b.m) kind = 'metallic';
  else if (den < 0.4) kind = 'covalent';
  else if (den <= 1.7) kind = 'polar';
  else kind = 'ionic';
  // l'elemento più elettronegativo va a destra
  const [lo, hi] = a.en <= b.en ? [P.elA, P.elB] : [P.elB, P.elA];
  return { kind, den, lo, hi, ionic: 1 - Math.exp(-den * den / 4) };
}

// Tipo effettivo (per grafici e letture): in modalità previsione è quello previsto
const effectiveType = () => P.type === 'predict' ? TYPE_BY_ID[prediction().kind] : curType();

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

// ── Helpers ──────────────────────────────────────────────────────────────────
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const ease = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
const seg = (p, a, b) => ease((p - a) / (b - a));     // avanzamento 0→1 nel tratto [a, b]
const fmt = (v, d = 0) => v.toFixed(d).replace('.', ',');
const SUP = { 1: '', 2: '²', 3: '³' };

function getCSSVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

let C = {};
function getColors() {
  const light = document.documentElement.dataset.theme === 'light';
  return {
    light,
    bg:     getCSSVar('--bg1')            || (light ? '#f0f2f5' : '#060a10'),
    panel:  getCSSVar('--bg2')            || (light ? '#ffffff' : '#0b1018'),
    grid:   light ? 'rgba(0,0,0,0.09)'   : 'rgba(255,255,255,0.07)',
    text:   getCSSVar('--text-primary')   || (light ? '#0d1a26' : '#ddeeff'),
    muted:  getCSSVar('--text-secondary') || (light ? '#4a6278' : '#6b8099'),
    accent: getCSSVar('--accent')         || (light ? '#0099cc' : '#00d4ff'),
    elec:   light ? '#d98a00' : '#ffc94a',
    elecRGB: light ? '217,138,0' : '255,201,74',
    negRGB:  light ? '28,126,214' : '92,200,255',
    cloud:  light ? '0,140,200' : '0,212,255',
    pos:    light ? '#d6336c' : '#ff6b8b',
    neg:    light ? '#1c7ed6' : '#5cc8ff',
    primary: light ? '#e8590c' : '#ff9a4a',
    inter:   light ? '#0c8599' : '#35c9e0',
  };
}

function mixWhite(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const ch = s => Math.round(lerp((n >> s) & 255, 255, k));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

// Atomo: sfera con simbolo
function atom(x, y, r, sym, label = sym, alpha = 1) {
  const el = EL[sym];
  ctx.save();
  ctx.globalAlpha *= alpha;
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, mixWhite(el.c, 0.55));
  g.addColorStop(1, el.c);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  if (label) {
    ctx.fillStyle = el.d ? '#10202e' : '#ffffff';
    ctx.font = `700 ${Math.max(9, Math.min(16, r * 0.72))}px DM Sans, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 0.5);
  }
  ctx.restore();
}

// Gli elettroni non sono palline: si disegna la densità elettronica, cioè dove
// è più probabile trovarli. Macchia sfumata, senza contorno.
function glow(x, y, r, rgb = C.elecRGB, alpha = 0.9) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${alpha})`);
  g.addColorStop(0.45, `rgba(${rgb},${alpha * 0.5})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
}

// Lobo di densità di una coppia di elettroni, allungato lungo `ang`
function lobe(x, y, ang, rl, rw, rgb = C.elecRGB, alpha = 0.95) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.scale(1, rw / rl);
  glow(0, 0, rl, rgb, alpha);
  ctx.restore();
}

// Guscio di valenza: anello di densità, aperto finché l'ottetto non è completo
function valenceShell(x, y, r, frac, gapAt, rgb) {
  const gap = (1 - frac) * TAU;
  ctx.save();
  ctx.lineCap = 'round';
  for (const [w, a] of [[13, 0.16], [8, 0.3], [3.5, 0.75]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, gapAt + gap / 2, gapAt + TAU - gap / 2);
    ctx.strokeStyle = `rgba(${rgb},${a})`;
    ctx.lineWidth = w;
    ctx.stroke();
  }
  ctx.restore();
}

// Nuvola elettronica: ellisse sfumata
function cloud(x, y, rx, ry, alpha = 0.3) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, rx * 0.1, 0, 0, rx);
  g.addColorStop(0, `rgba(${C.cloud},${alpha})`);
  g.addColorStop(0.7, `rgba(${C.cloud},${alpha * 0.55})`);
  g.addColorStop(1, `rgba(${C.cloud},0)`);
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

function dashed(x1, y1, x2, y2, color, alpha = 1, width = 1.6) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.restore();
}

// Tratteggio fra i bordi di due atomi
function dashedBetween(a, b, color, alpha = 1) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
  dashed(a.x + dx / d * (a.r + 2), a.y + dy / d * (a.r + 2),
         b.x - dx / d * (b.r + 2), b.y - dy / d * (b.r + 2), color, alpha);
}

function text(str, x, y, { color = C.text, size = 12, align = 'center', base = 'middle', bold = false, mono = false, alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  ctx.font = `${bold ? '700 ' : ''}${size}px ${mono ? 'Space Mono, monospace' : 'DM Sans, sans-serif'}`;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  ctx.fillText(str, x, y);
  ctx.restore();
}

// Carica parziale δ+ / δ−
function delta(x, y, sign, alpha = 1) {
  if (!P.labels) return;
  text(sign > 0 ? 'δ+' : 'δ−', x, y, { color: sign > 0 ? C.pos : C.neg, size: 13, bold: true, alpha });
}

function arrow(x1, y1, x2, y2, color, width = 2) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  if (len < 3) return;
  const ux = dx / len, uy = dy / len;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - ux * 6, y2 - uy * 6); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - ux * 9 - uy * 4.5, y2 - uy * 9 + ux * 4.5);
  ctx.lineTo(x2 - ux * 9 + uy * 4.5, y2 - uy * 9 - ux * 4.5);
  ctx.closePath(); ctx.fill();
}

// Spazio di disegno: origine al centro, ±490 × ±200, scalato sulla scena
// Didascalia e nota sono disegnate dopo la scena, fuori dal suo ingrandimento.
let DH = 400;
const pending = { caption: '', footnote: '' };
function caption(str) { pending.caption = str; }
function footnote(str) { pending.footnote = str; }

// Ingrandimento delle scene che occupano poco spazio
const SCENE_ZOOM = {
  ionic: 1.15, covalent: 1.45, polar: 1.45, dative: 1.25, hbond: 1.5, dipole: 1.5,
  iondipole: 1.25, ioninduced: 1.35, dipoleinduced: 1.35, london: 1.5,
};

// ── Scene: ionico ────────────────────────────────────────────────────────────
function drawIonPair(t, ex, cx) {
  const p = (t % 9) / 9;
  const tr = seg(p, 0.22, 0.45), ap = seg(p, 0.45, 0.62);
  const rM = lerp(EL[ex.M].r, EL[ex.M].r * 0.72, tr);
  const rX = lerp(EL[ex.X].r, EL[ex.X].r * 1.18, tr);
  const sep = lerp(230, rM + rX, ap);
  const xM = cx - sep / 2, xX = cx + sep / 2;
  const charged = tr > 0.97;

  atom(xM, 0, rM, ex.M, ex.M + (charged ? SUP[ex.ne] + '⁺' : ''));
  atom(xX, 0, rX, ex.X, ex.X + (charged ? SUP[ex.ne] + '⁻' : ''));

  // guscio di valenza del non metallo: incompleto dal lato del metallo, si chiude con l'ottetto
  valenceShell(xX, 0, rX + 9, (8 - ex.ne + ex.ne * tr) / 8, Math.PI, C.negRGB);
  // densità di valenza del metallo, trasferita lungo un arco fino a chiudere il guscio
  for (let i = 0; i < ex.ne; i++) {
    const a = (i - (ex.ne - 1) / 2) * 0.7 + Math.sin(t * 2 + i) * 0.15 * (1 - tr);
    const sx = xM + Math.cos(a) * (rM + 10), sy = Math.sin(a) * (rM + 10);
    const b = Math.PI + (i - (ex.ne - 1) / 2) * 0.5;
    const tx = xX + Math.cos(b) * (rX + 9), ty = Math.sin(b) * (rX + 9);
    glow(lerp(sx, tx, tr), lerp(sy, ty, tr) - Math.sin(Math.PI * tr) * 46, 13, C.elecRGB, 0.95 * (1 - 0.6 * seg(tr, 0.8, 1)));
  }
  if (ap > 0 && ap < 1) {
    arrow(xM + rM + 26, 52, xM + rM + 54, 52, C.muted, 1.6);
    arrow(xX - rX - 26, 52, xX - rX - 54, 52, C.muted, 1.6);
  }
  return p;
}

function drawLattice(ex, cx, alpha, t) {
  const n = 5, s = 48;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const cation = (i + j) % 2 === 0;
    const x = cx + (i - (n - 1) / 2) * s + Math.sin(t * 5 + i * 2 + j) * 1.2;
    const y = (j - (n - 1) / 2) * s + Math.cos(t * 5.5 + i + j * 2) * 1.2;
    atom(x, y, cation ? 13 : 21, cation ? ex.M : ex.X, cation ? '+' : '−', alpha);
  }
}

function sceneIonic(t, ex) {
  const p = drawIonPair(t, ex, -230);
  const lat = seg(p, 0.62, 0.8);
  drawLattice(ex, 250, 0.18 + 0.82 * lat, t);
  text('reticolo cristallino di ' + ex.label, 250, 150, { color: C.muted, size: 11, alpha: 0.4 + 0.6 * lat });
  const val = n => n === 1 ? '1 elettrone' : n + ' elettroni';
  caption(p < 0.22 ? `Atomi neutri: ${ex.M} ha ${val(ex.ne)} di valenza, ${ex.X} ne ha ${8 - ex.ne}`
        : p < 0.45 ? `${ex.M} cede ${val(ex.ne)} a ${ex.X}: entrambi raggiungono l'ottetto`
        : p < 0.62 ? 'Ioni di carica opposta si attraggono (forza di Coulomb)'
        : 'Nel solido ogni ione è circondato da ioni di segno opposto');
  footnote(`${ex.M} → ${ex.M}${SUP[ex.ne]}⁺ + ${ex.ne === 1 ? '' : ex.ne}e⁻     ${ex.X} + ${ex.ne === 1 ? '' : ex.ne}e⁻ → ${ex.X}${SUP[ex.ne]}⁻`);
}

// ── Scene: covalente (puro e polare) ─────────────────────────────────────────
function lonePairs(x, y, r, n, dir) {
  const angles = n === 3 ? [dir, dir + 90 * DEG, dir - 90 * DEG]
               : n === 2 ? [dir + 60 * DEG, dir - 60 * DEG]
               : n === 1 ? [dir] : [];
  for (const a of angles) {
    lobe(x + Math.cos(a) * (r + 6), y + Math.sin(a) * (r + 6), a, 15, 10, C.negRGB, 0.9);
  }
}

function drawCovalentPair(t, A, B, den, order, lp) {
  const rA = EL[A].r * 1.35, rB = EL[B].r * 1.35;
  const d = (rA + rB) * 0.86 * (1 + 0.025 * Math.sin(t * 5));
  const xA = -d / 2, xB = d / 2;
  const shift = Math.min(den, 2.2) / 2.2;                    // 0 = condivisione equa
  const mid = (xA + rA + xB - rB) / 2 + shift * 16;

  const R = Math.max(rA, rB);
  cloud(shift * 26, 0, d / 2 + R + 26, R + 26, 0.34);
  if (shift > 0) cloud(xB + 4, 0, rB + 20, rB + 20, 0.3 * shift);

  atom(xA, 0, rA, A);
  atom(xB, 0, rB, B);
  lonePairs(xA, 0, rA, lp[0], Math.PI);
  lonePairs(xB, 0, rB, lp[1], 0);

  // coppie condivise
  for (let j = 0; j < order; j++) {
    const y = (j - (order - 1) / 2) * 14, ph = t * 3 + j * 2.1;
    lobe(mid, y, 0, 19 + Math.sin(ph) * 2, 7, C.elecRGB, 0.95);
  }

  if (den >= 0.4) {
    delta(xA, -rA - 28, +1);
    delta(xB, -rB - 28, -1);
    if (P.labels) {                                          // vettore momento dipolare
      const y = -R - 54;
      arrow(xA, y, xB, y, C.muted, 1.8);
      ctx.beginPath(); ctx.moveTo(xA + 7, y - 6); ctx.lineTo(xA + 7, y + 6); ctx.stroke();
      text('μ', 0, y - 12, { color: C.muted, size: 12 });
    }
  }
}

function sceneCovalent(t, ex) {
  drawCovalentPair(t, ex.A, ex.B, ex.den, ex.order, ex.lp);
  const comp = ['', '1 legame σ', '1 σ + 1 π', '1 σ + 2 π'][ex.order];
  caption(ex.den < 0.4
    ? 'Stessa elettronegatività: gli elettroni sono condivisi in parti uguali'
    : `ΔEN = ${fmt(ex.den, 2)}: la nuvola elettronica è spostata verso ${ex.B}`);
  footnote(`${ex.lewis}     ${ex.order} ${ex.order === 1 ? 'coppia condivisa' : 'coppie condivise'}  ·  ${comp}`);
}

// ── Scene: dativo ────────────────────────────────────────────────────────────
const DONORS = {
  NH3: { sym: 'N', subs: [130, 180, 230], spare: [] },
  H2O: { sym: 'O', subs: [140, 220], spare: [-90] },
};

function sceneDative(t, ex) {
  const p = (t % 9) / 9;
  const ap = seg(p, 0.2, 0.5), bond = seg(p, 0.5, 0.62);
  const don = DONORS[ex.donor];
  const rD = 34, xD = -90;

  // accettore
  const isProton = ex.acceptor === 'H+';
  const rAcc = isProton ? 15 : 27;
  const xAcc = lerp(260, xD + rD + rAcc + 14, ap);

  // donatore
  for (const a of don.subs) {
    atom(xD + Math.cos(a * DEG) * 50, Math.sin(a * DEG) * 50, 17, 'H');
  }
  atom(xD, 0, rD, don.sym);
  for (const a of don.spare) lonePairs(xD, 0, rD, 1, a * DEG);

  if (isProton) {
    atom(xAcc, 0, rAcc, 'H', bond > 0.5 ? 'H' : 'H⁺');
  } else {
    for (const a of [0, 105, -105]) {
      atom(xAcc + Math.cos(a * DEG) * 52, Math.sin(a * DEG) * 52, 22, 'F');
    }
    atom(xAcc, 0, rAcc, 'B');
  }
  // orbitale vuoto dell'accettore
  if (bond < 1) {
    ctx.save();
    ctx.globalAlpha = 1 - bond;
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = C.muted;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(xAcc - rAcc - 10, 0, 9, 0, TAU); ctx.stroke();
    ctx.restore();
    if (P.labels && ap < 0.3) text('orbitale vuoto', xAcc - rAcc - 10, 30, { color: C.muted, size: 10 });
  }

  // coppia solitaria → coppia condivisa
  const ex0 = xD + rD + 7;
  lobe(ex0 + lerp(0, 3, bond), 0, 0, lerp(13, 16, bond) + Math.sin(t * 3), lerp(10, 8, bond));
  if (P.labels) {
    text(bond > 0.5 ? 'coppia condivisa (entrambi gli e⁻ dal donatore)' : 'coppia solitaria',
      ex0, -96, { color: C.elec, size: 11 });
  }
  if (bond > 0.5) {
    arrow(xD + 6, 92, xAcc - 4, 92, C.accent, 2);
    text('donatore → accettore', (xD + xAcc) / 2, 108, { color: C.accent, size: 10 });
  }

  caption(p < 0.2 ? `${don.sym} ha una coppia solitaria; l'accettore ha un orbitale vuoto`
        : p < 0.5 ? 'L\'accettore si avvicina alla coppia solitaria'
        : 'La coppia è condivisa: si è formato un legame dativo');
  footnote(bond > 0.5 ? ex.product : ex.label);
}

// ── Scene: metallico ─────────────────────────────────────────────────────────
const SEA = { key: '', e: [] };
const SEA_W = 430, SEA_H = 150;

function seedSea(key, count) {
  SEA.key = key;
  SEA.e = [];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * TAU;
    SEA.e.push({ x: (Math.random() * 2 - 1) * SEA_W, y: (Math.random() * 2 - 1) * SEA_H, a });
  }
}

function drawMetal(t, dt, syms, ions, ne) {
  const cols = 8, rows = 4, sx = 104, sy = 78;
  const key = syms.join() + ne;
  if (SEA.key !== key) seedSea(key, cols * rows * ne);

  // gas di elettroni: macchie di densità che si sommano in una foschia
  const drift = P.voltage ? 150 : 0;
  ctx.save();
  if (!C.light) ctx.globalCompositeOperation = 'lighter';
  for (const e of SEA.e) {
    if (Math.random() < dt * 2.5) e.a = Math.random() * TAU;      // urto: nuova direzione
    e.x += (Math.cos(e.a) * 95 + drift) * dt;
    e.y += Math.sin(e.a) * 95 * dt;
    if (e.x > SEA_W) e.x -= 2 * SEA_W; else if (e.x < -SEA_W) e.x += 2 * SEA_W;
    if (e.y > SEA_H) e.y -= 2 * SEA_H; else if (e.y < -SEA_H) e.y += 2 * SEA_H;
    glow(e.x, e.y, 38, C.elecRGB, C.light ? 0.26 : 0.24);
  }
  ctx.restore();

  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const k = (i + j) % syms.length;
    atom((i - (cols - 1) / 2) * sx + Math.sin(t * 6 + i * 1.7 + j) * 1.6,
         (j - (rows - 1) / 2) * sy + Math.cos(t * 6.4 + i + j * 2.3) * 1.6,
         23, syms[k], ions[k]);
  }
  if (P.voltage) {
    text('−', -SEA_W - 34, 0, { color: C.neg, size: 30, bold: true });
    text('+', SEA_W + 34, 0, { color: C.pos, size: 26, bold: true });
  }
}

function sceneMetallic(t, ex, dt) {
  drawMetal(t, dt, [ex.sym], [ex.ion], ex.ne);
  caption(P.voltage
    ? 'Con una differenza di potenziale gli elettroni liberi scorrono verso il polo positivo: è la corrente'
    : 'Cationi ai nodi del reticolo, elettroni di valenza liberi di muoversi: il «mare di elettroni»');
  footnote(`${ex.sym} → ${ex.ion} + ${ex.ne === 1 ? '' : ex.ne}e⁻ delocalizzat${ex.ne === 1 ? 'o' : 'i'}`);
}

// ── Molecole polari usate dalle forze intermolecolari ────────────────────────
// Acqua: bisettrice lungo `rot`, idrogeni a ±52°. Restituisce [O, H1, H2].
function waterAtoms(x, y, rot, s = 1) {
  const h = a => ({ x: x + Math.cos(rot + a) * 30 * s, y: y + Math.sin(rot + a) * 30 * s, r: 12 * s, sym: 'H' });
  return [{ x, y, r: 20 * s, sym: 'O' }, h(-52 * DEG), h(52 * DEG)];
}

function drawAtoms(atoms, labels = false) {
  // prima gli H, poi l'atomo centrale sopra
  for (const a of atoms) if (a.sym === 'H') atom(a.x, a.y, a.r, a.sym, labels ? a.sym : '');
  for (const a of atoms) if (a.sym !== 'H') atom(a.x, a.y, a.r, a.sym, labels || a.r > 15 ? a.sym : '');
}

// Diatomica polare H–X orientata lungo `ang` (X = estremità δ−)
function dipoleAtoms(x, y, ang, X) {
  const rX = EL[X].r * 0.72, L = rX + 8;
  return [
    { x: x - Math.cos(ang) * L * 0.75, y: y - Math.sin(ang) * L * 0.75, r: 13, sym: 'H' },
    { x: x + Math.cos(ang) * L * 0.35, y: y + Math.sin(ang) * L * 0.35, r: rX, sym: X },
  ];
}

// ── Scene: legame a idrogeno ─────────────────────────────────────────────────
function sceneHBond(t, ex) {
  const mols = [], bonds = [];
  const wig = i => [Math.sin(t * 1.3 + i * 2.1) * 2.5, Math.cos(t * 1.7 + i * 1.3) * 2.5, Math.sin(t * 1.1 + i) * 0.05];
  const dir = a => [Math.cos(a * DEG), Math.sin(a * DEG)];
  const L = 48;

  if (ex.kind === 'water') {
    const c0 = [0, 8];
    const add = (x, y, rot, i) => { const w = wig(i); mols.push(waterAtoms(x + w[0], y + w[1], rot * DEG + w[2], 1)); };
    add(c0[0], c0[1], 90, 0);                                   // H a 38° e 142°
    for (const [k, a] of [[1, 38], [2, 142]]) {                 // accettori sotto
      const d = dir(a);
      add(c0[0] + d[0] * (30 + L), c0[1] + d[1] * (30 + L), a, k);
    }
    for (const [k, a, rot] of [[3, 235, 107], [4, 305, 73]]) {  // donatori sopra
      const d = dir(a);
      add(c0[0] + d[0] * (L + 30), c0[1] + d[1] * (L + 30), rot, k);
    }
    bonds.push([mols[0][1], mols[1][0]], [mols[0][2], mols[2][0]], [mols[3][1], mols[0][0]], [mols[4][2], mols[0][0]]);
  } else {
    const n = 5, rX = 21;
    const pos = i => [-260 + 130 * i, (i % 2 ? -1 : 1) * 30];
    for (let i = 0; i < n; i++) {
      const w = wig(i), [x0, y0] = pos(i), [x1, y1] = pos(i + 1);
      const x = x0 + w[0], y = y0 + w[1];
      const a = Math.atan2(y1 - y0, x1 - x0) + w[2];
      const atoms = [{ x, y, r: rX, sym: ex.X },
                     { x: x + Math.cos(a) * 31, y: y + Math.sin(a) * 31, r: 12, sym: 'H' }];
      for (let k = 0; k < ex.extraH; k++) {
        const b = a + (k ? -1 : 1) * 108 * DEG;
        atoms.push({ x: x + Math.cos(b) * 31, y: y + Math.sin(b) * 31, r: 12, sym: 'H' });
      }
      mols.push(atoms);
    }
    for (let i = 0; i < n - 1; i++) bonds.push([mols[i][1], mols[i + 1][0]]);
  }

  for (const [h, acc] of bonds) dashedBetween(h, acc, C.accent, 0.75 + 0.25 * Math.sin(t * 2));
  mols.forEach(m => drawAtoms(m));
  // cariche parziali sulla prima coppia donatore–accettore
  const [h0, a0] = bonds[0];
  const bd = Math.hypot(a0.x - h0.x, a0.y - h0.y) || 1;
  const nx = (a0.y - h0.y) / bd, ny = -(a0.x - h0.x) / bd;      // normale al legame a idrogeno
  delta(h0.x + nx * (h0.r + 11), h0.y + ny * (h0.r + 11), +1);
  delta(a0.x + nx * (a0.r + 11), a0.y + ny * (a0.r + 11), -1);

  const heavy = ex.kind === 'water' ? 'O' : ex.X;
  caption(`H legato a ${heavy} (molto elettronegativo) è attratto dalla coppia solitaria di un ${heavy} vicino`);
  footnote(`${heavy}—H ··· ${heavy}        ——— covalente     · · · legame a idrogeno`);
}

// ── Scene: dipolo–dipolo ─────────────────────────────────────────────────────
const DIP_RANDOM = [2.1, -1.3, 0.7, 3.9, -2.4, 1.2];

function sceneDipole(t, ex) {
  const p = (t % 9) / 9;
  const al = seg(p, 0.1, 0.45) * (1 - seg(p, 0.86, 1));
  const mols = [];
  for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) {
    const k = j * 3 + i;
    const target = j === 0 ? 0 : Math.PI;
    const ang = lerp(DIP_RANDOM[k], target, al) + Math.sin(t * 2.3 + k * 1.9) * 0.1;
    mols.push(dipoleAtoms((i - 1) * 190, (j - 0.5) * 120, ang, ex.X));
  }
  if (al > 0.85) {
    const a = (al - 0.85) / 0.15;
    // testa–coda nella riga, δ+ sopra δ− fra le due righe
    for (const [m, n] of [[0, 1], [1, 2]]) dashedBetween(mols[m][1], mols[n][0], C.accent, a);
    for (const [m, n] of [[4, 3], [5, 4]]) dashedBetween(mols[m][1], mols[n][0], C.accent, a);
    for (let i = 0; i < 3; i++) dashedBetween(mols[i][0], mols[3 + i][1], C.accent, a * 0.7);
  }
  mols.forEach(m => drawAtoms(m, true));
  const m0 = mols[0];
  delta(m0[0].x, m0[0].y - 26, +1);
  delta(m0[1].x, m0[1].y - m0[1].r - 14, -1);

  caption(al > 0.85 ? 'I dipoli permanenti si orientano «testa–coda»: δ+ vicino a δ−'
                    : 'L\'agitazione termica disorienta le molecole polari');
  footnote(`Hδ+—${ex.X}δ− ··· Hδ+—${ex.X}δ−`);
}

// ── Scene: ione–dipolo ───────────────────────────────────────────────────────
const SHELL_RANDOM = [1.0, 4.2, 2.6, 5.5, 0.3, 3.4];

function sceneIonDipole(t, ex) {
  const p = (t % 9) / 9;
  const al = seg(p, 0.08, 0.48) * (1 - seg(p, 0.88, 1));
  const rIon = EL[ex.sym].r * 0.85;
  const R = lerp(125, rIon + 62, al);
  const mols = [];
  for (let i = 0; i < 6; i++) {
    const a = i * 60 * DEG + Math.sin(t * 0.9 + i) * 0.05;
    // catione: ossigeno verso lo ione; anione: un idrogeno verso lo ione
    const target = ex.q > 0 ? a : a + Math.PI + 52 * DEG;
    const rot = lerp(SHELL_RANDOM[i], target, al) + Math.sin(t * 2 + i * 1.7) * 0.07;
    mols.push(waterAtoms(Math.cos(a) * R, Math.sin(a) * R * 0.92, rot, 0.85));
  }
  const ion = { x: 0, y: 0, r: rIon };
  if (al > 0.85) {
    const a = (al - 0.85) / 0.15;
    for (const m of mols) dashedBetween(ion, ex.q > 0 ? m[0] : m[1], C.accent, a);
  }
  mols.forEach(m => drawAtoms(m));
  atom(0, 0, rIon, ex.sym, ex.ion);
  const o0 = mols[0][0], hFar = mols[0][2];
  delta(o0.x, o0.y - o0.r - 11, -1);
  delta(hFar.x + hFar.r + 12, hFar.y, +1);

  caption(ex.q > 0
    ? 'L\'ossigeno (δ−) delle molecole d\'acqua si rivolge verso il catione'
    : 'Gli idrogeni (δ+) delle molecole d\'acqua si rivolgono verso l\'anione');
  footnote(`${ex.ion}(aq): ione idratato, circondato da molecole d'acqua`);
}

// ── Scene: dipolo indotto (da ione o da dipolo) ──────────────────────────────
function sceneInduced(t, ex) {
  const p = (t % 8) / 8;
  const al = seg(p, 0.1, 0.48) * (1 - seg(p, 0.82, 1));
  const ind = ex.inducer;
  const xi = -200;
  let q, edge, near;                    // carica rivolta al bersaglio, bordo destro dell'induttore

  if (ind.ion) {
    const r = 30;
    atom(xi, 0, r, ind.ion, ind.label);
    q = ind.q; edge = xi + r; near = { x: xi, y: 0, r };
  } else if (ind.mol === 'H2O') {
    const w = waterAtoms(xi - 20, 0, 52 * DEG, 1.15);        // un H punta a destra
    drawAtoms(w, true);
    delta(w[0].x - 34, w[0].y - 20, -1);
    delta(w[1].x, w[1].y - 24, +1);
    q = 1; edge = w[1].x + w[1].r; near = w[1];
  } else {
    const m = dipoleAtoms(xi - 6, 0, Math.PI, 'Cl');         // H a destra
    drawAtoms(m, true);
    delta(m[1].x, m[1].y - m[1].r - 14, -1);
    delta(m[0].x, m[0].y - 26, +1);
    q = 1; edge = m[0].x + m[0].r; near = m[0];
  }

  const di = ex.target.length === 2;
  const rx = di ? 70 : 50, ry = di ? 46 : 50;
  const xt = lerp(230, edge + rx + 34, al);
  const off = -q * 15 * al;             // la nuvola (negativa) va verso una carica positiva
  cloud(xt + off, 0, rx + 10, ry + 10, 0.42);
  if (di) {
    atom(xt - 22, 0, 15, ex.target[0]);
    atom(xt + 22, 0, 15, ex.target[1]);
  } else {
    atom(xt, 0, 17, ex.target[0]);
  }
  if (al > 0.4) {
    const a = (al - 0.4) / 0.6;
    delta(xt - rx - 4, -ry + 4, -q, a);
    delta(xt + rx + 4, -ry + 4, q, a);
    dashed(near.x + near.r + 3, 0, xt - rx + 6 + off, 0, C.accent, a);
  }

  const who = ind.ion ? 'La carica dello ione' : 'Il dipolo permanente';
  caption(al > 0.4 ? `${who} deforma la nuvola elettronica: nasce un dipolo indotto`
                   : 'Lontano dall\'induttore la nuvola della molecola apolare è simmetrica');
  footnote(ex.label + '        dipolo indotto ∝ polarizzabilità');
}

// ── Scene: London ────────────────────────────────────────────────────────────
function sceneLondon(t, ex) {
  const fl = tt => ex.A * (0.62 * Math.sin(tt * 2.1) + 0.38 * Math.sin(tt * 3.7 + 1));
  const s = [fl(t), fl(t - 0.18)];      // il secondo atomo segue il primo
  const xs = [-(ex.R + 26), ex.R + 26];
  xs.forEach((x, i) => {
    cloud(x + s[i], 0, ex.R + 12, ex.R + 12 - Math.abs(s[i]) * 0.4, 0.42);
    atom(x, 0, 15, ex.sym);
  });
  const pol = Math.abs(s[0]) / ex.A;
  if (pol > 0.35) {
    const a = clamp01((pol - 0.35) / 0.3), sign = Math.sign(s[0]);
    xs.forEach(x => {
      delta(x + sign * (ex.R + 4), -ex.R - 4, -1, a);
      delta(x - sign * (ex.R + 4), -ex.R - 4, +1, a);
    });
    dashed(xs[0] + 20, 0, xs[1] - 20, 0, C.accent, a);
  }
  caption(pol > 0.35 ? 'Dipolo istantaneo → dipolo indotto nell\'atomo vicino: i due si attraggono'
                     : 'In media la nuvola elettronica è simmetrica, ma fluttua continuamente');
  footnote(`${ex.sym} ··· ${ex.sym}        nuvola più grande = più polarizzabile = attrazione più forte`);
}

// ── Scene: previsione dal ΔEN ────────────────────────────────────────────────
const EN_MAX = 3.3;

function drawEnScale(den, y) {
  const x0 = -300, w = 600;
  const X = v => x0 + Math.min(v, EN_MAX) / EN_MAX * w;
  const zones = [[0, 0.4, 'covalente puro', C.inter], [0.4, 1.7, 'covalente polare', C.accent], [1.7, EN_MAX, 'ionico', C.primary]];
  for (const [a, b, name, col] of zones) {
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.28;
    ctx.fillRect(X(a), y, X(b) - X(a), 14);
    ctx.globalAlpha = 1;
    text(name, (X(a) + X(b)) / 2, y + 28, { color: col, size: 10 });
  }
  for (const v of [0, 0.4, 1.7, EN_MAX]) text(fmt(v, 1), X(v), y - 9, { color: C.muted, size: 9, mono: true });
  ctx.beginPath();
  ctx.moveTo(X(den), y + 16); ctx.lineTo(X(den) - 6, y + 26); ctx.lineTo(X(den) + 6, y + 26);
  ctx.closePath();
  ctx.fillStyle = C.text;
  ctx.fill();
  ctx.fillRect(X(den) - 1, y - 2, 2, 18);
  text('ΔEN', x0 - 12, y + 7, { color: C.muted, size: 10, align: 'right' });
}

function scenePredict(t, dt) {
  const pr = prediction();
  ctx.save();
  ctx.translate(0, -26);
  if (pr.kind === 'metallic') {
    ctx.scale(0.72, 0.72);
    const syms = P.elA === P.elB ? [P.elA] : [P.elA, P.elB];
    drawMetal(t, dt, syms, syms.map(s => s + '⁺'), 1);
  } else if (pr.kind === 'ionic') {
    ctx.scale(1.3, 1.3);
    const rM = EL[pr.lo].r * 0.9, rX = EL[pr.hi].r * 1.3;
    cloud((rM + rX) / 2, 0, rX + 22, rX + 22, 0.3);
    atom(-(rM + rX) / 2, 0, rM, pr.lo, pr.lo + '⁺');
    atom((rM + rX) / 2, 0, rX, pr.hi, pr.hi + '⁻');
  } else {
    ctx.scale(1.05, 1.05);
    drawCovalentPair(t, pr.lo, pr.hi, pr.den, 1, [0, 0]);
  }
  ctx.restore();

  drawEnScale(pr.den, DH / 2 - 92);
  const name = TYPE_BY_ID[pr.kind].name.toLowerCase();
  caption(`${P.elA} (EN ${fmt(EL[P.elA].en, 2)})  +  ${P.elB} (EN ${fmt(EL[P.elB].en, 2)})  →  legame ${name}`);
  footnote(pr.kind === 'metallic'
    ? 'due metalli: elettroni di valenza delocalizzati'
    : `ΔEN = ${fmt(pr.den, 2)}  ·  carattere ionico ≈ ${fmt(pr.ionic * 100)} %`);
}

// ── Scene dispatcher ─────────────────────────────────────────────────────────
function drawScene(t, dt) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, SW, SH);
  if (SW < 10 || SH < 10) return;

  const k = Math.min(SW / 1000, SH / 400);
  DH = SH / k;
  ctx.save();
  ctx.translate(SW / 2, SH / 2);
  ctx.scale(k, k);
  const ex = curExample();
  const z = SCENE_ZOOM[P.type] || 1;
  pending.caption = pending.footnote = '';
  ctx.save();
  ctx.scale(z, z);
  switch (P.type) {
    case 'ionic':         sceneIonic(t, ex); break;
    case 'covalent':
    case 'polar':         sceneCovalent(t, ex); break;
    case 'dative':        sceneDative(t, ex); break;
    case 'metallic':      sceneMetallic(t, ex, dt); break;
    case 'hbond':         sceneHBond(t, ex); break;
    case 'iondipole':     sceneIonDipole(t, ex); break;
    case 'dipole':        sceneDipole(t, ex); break;
    case 'ioninduced':
    case 'dipoleinduced': sceneInduced(t, ex); break;
    case 'london':        sceneLondon(t, ex); break;
    case 'predict':       scenePredict(t, dt); break;
  }
  ctx.restore();
  text(pending.caption, 0, -DH / 2 + 22, { color: C.muted, size: 13 });
  text(pending.footnote, 0, DH / 2 - 20, { size: 13, mono: true });
  ctx.restore();
}

// ── Graphs ────────────────────────────────────────────────────────────────────
// Curva di energia normalizzata: minimo −1 in r = r₀
function energyCurve(kind, x) {
  if (kind === 'morse') { const e = 1 - Math.exp(-2.2 * (x - 1)); return e * e - 1; }
  const m = kind, n = m === 1 ? 9 : 12;
  return (m / (n - m)) * Math.pow(x, -n) - (n / (n - m)) * Math.pow(x, -m);
}
const CURVES = [1, 2, 3, 4, 6, 'morse'];
const CURVE_TAG = { 1: '1/r', 2: '1/r²', 3: '1/r³', 4: '1/r⁴', 6: '1/r⁶' };

function gtext(str, x, y, color, { size = 9, align = 'left', base = 'middle', bold = false, sans = false } = {}) {
  gctx.fillStyle = color;
  gctx.font = `${bold ? '700 ' : ''}${size}px ${sans ? 'DM Sans, sans-serif' : 'Space Mono, monospace'}`;
  gctx.textAlign = align;
  gctx.textBaseline = base;
  gctx.fillText(str, x, y);
}

// Sinistra: energia potenziale in funzione della distanza (assi fissi, normalizzati)
function drawCurvePanel(offX, pw) {
  const PAD = { l: 44, r: 16, t: 26, b: 28 };
  const iw = pw - PAD.l - PAD.r, ih = GH - PAD.t - PAD.b;
  if (iw < 40 || ih < 40) return;
  const type = effectiveType(), ex = P.type === 'predict' ? null : curExample();
  const XMIN = 0.6, XMAX = 3.2, YMIN = -1.25, YMAX = 0.9;
  const x0 = offX + PAD.l, y0 = PAD.t;
  const X = v => x0 + (v - XMIN) / (XMAX - XMIN) * iw;
  const Y = v => y0 + (YMAX - v) / (YMAX - YMIN) * ih;

  gtext('Energia potenziale vs distanza', x0, 12, C.text, { size: 10 });

  gctx.strokeStyle = C.grid;
  gctx.lineWidth = 1;
  gctx.beginPath();
  gctx.moveTo(x0, y0); gctx.lineTo(x0, y0 + ih);
  gctx.moveTo(x0, Y(0)); gctx.lineTo(x0 + iw, Y(0));
  gctx.stroke();
  for (const v of [1, 2, 3]) gtext(v + 'r₀', X(v), y0 + ih + 9, C.muted, { align: 'center' });
  gtext('distanza r', x0 + iw / 2, GH - 7, C.muted, { align: 'center', sans: true });
  gtext('0', x0 - 5, Y(0), C.muted, { align: 'right' });
  gtext('−E₀', x0 - 5, Y(-1), C.muted, { align: 'right' });
  gtext('E', x0 - 5, y0 + 4, C.muted, { align: 'right' });

  gctx.save();
  gctx.beginPath(); gctx.rect(x0, y0, iw, ih); gctx.clip();
  const trace = kind => {
    gctx.beginPath();
    for (let i = 0; i <= 160; i++) {
      const xv = XMIN + (XMAX - XMIN) * i / 160;
      const yv = Math.min(energyCurve(kind, xv), 3);
      i === 0 ? gctx.moveTo(X(xv), Y(yv)) : gctx.lineTo(X(xv), Y(yv));
    }
  };
  for (const kind of CURVES) {            // le altre leggi, in trasparenza, per confronto
    if (kind === type.curve) continue;
    trace(kind);
    gctx.strokeStyle = C.grid;
    gctx.lineWidth = 1.2;
    gctx.stroke();
  }
  trace(type.curve);
  gctx.strokeStyle = type.group === 'primary' ? C.primary : C.inter;
  gctx.lineWidth = 2.4;
  gctx.stroke();
  gctx.restore();

  for (const kind of [1, 2]) {
    if (kind !== type.curve) gtext(CURVE_TAG[kind], x0 + iw - 2, Y(energyCurve(kind, XMAX)) - 7, C.muted, { size: 8, align: 'right' });
  }

  // minimo: distanza ed energia di legame
  gctx.beginPath();
  gctx.arc(X(1), Y(-1), 4, 0, TAU);
  gctx.fillStyle = C.text;
  gctx.fill();
  const lines = [type.law];
  if (ex && ex.E) lines.push(`E₀ ≈ ${fmt(ex.E, ex.E < 10 ? 2 : 0)} kJ/mol`);
  else lines.push(`E₀ ≈ ${fmt(type.range[0], type.range[0] < 1 ? 2 : 0)}–${type.range[1]} kJ/mol`);
  if (ex && ex.d) lines.push(`r₀ ≈ ${ex.d} pm`);
  lines.forEach((l, i) => gtext(l, x0 + iw - 4, y0 + 8 + i * 13, i === 0 ? C.text : C.muted, { align: 'right', sans: i === 0, size: i === 0 ? 10 : 9 }));
}

// Destra: energie tipiche dei vari legami, scala logaritmica fissa
const BAR = { PAD: { l: 128, r: 16, t: 26, b: 22 }, LMIN: -2, LMAX: 4 };

function barGeometry(offX, pw) {
  const { PAD } = BAR;
  const iw = pw - PAD.l - PAD.r, ih = GH - PAD.t - PAD.b;
  return { x0: offX + PAD.l, y0: PAD.t, iw, ih, row: ih / CHART_TYPES.length };
}

function drawBarPanel(offX, pw) {
  const g = barGeometry(offX, pw);
  if (g.iw < 40 || g.ih < 40) return;
  const { LMIN, LMAX } = BAR;
  const X = v => g.x0 + (Math.log10(v) - LMIN) / (LMAX - LMIN) * g.iw;
  const sel = effectiveType();

  gtext('Energia tipica (kJ/mol, scala logaritmica)', offX + 12, 12, C.text, { size: 10 });
  for (let e = LMIN; e <= LMAX; e++) {
    const x = X(Math.pow(10, e));
    gctx.strokeStyle = C.grid;
    gctx.lineWidth = 1;
    gctx.beginPath(); gctx.moveTo(x, g.y0); gctx.lineTo(x, g.y0 + g.ih); gctx.stroke();
    gtext(String(Math.pow(10, e)).replace('.', ','), x, g.y0 + g.ih + 9, C.muted, { align: 'center', size: 8 });
  }

  CHART_TYPES.forEach((t, i) => {
    const y = g.y0 + i * g.row, on = t === sel;
    const col = t.group === 'primary' ? C.primary : C.inter;
    const h = Math.max(4, g.row - 5);
    gctx.globalAlpha = on ? 1 : 0.38;
    gctx.fillStyle = col;
    gctx.fillRect(X(t.range[0]), y + (g.row - h) / 2, X(t.range[1]) - X(t.range[0]), h);
    gctx.globalAlpha = 1;
    gtext(t.short, g.x0 - 8, y + g.row / 2, on ? C.text : C.muted, { align: 'right', sans: true, size: 10, bold: on });
    if (on) {
      gctx.strokeStyle = C.text;
      gctx.lineWidth = 1;
      gctx.strokeRect(X(t.range[0]) - 0.5, y + (g.row - h) / 2 - 0.5, X(t.range[1]) - X(t.range[0]) + 1, h + 1);
      const ex = P.type === 'predict' ? null : curExample();
      if (ex && ex.E) {                 // valore dell'esempio scelto
        const mx = X(ex.E), my = y + g.row / 2;
        gctx.beginPath();
        gctx.moveTo(mx, my - 6); gctx.lineTo(mx + 5, my); gctx.lineTo(mx, my + 6); gctx.lineTo(mx - 5, my);
        gctx.closePath();
        gctx.fillStyle = C.text;
        gctx.fill();
      }
    }
  });
}

let barPanel = { offX: 0, pw: 0 };

function drawGraph() {
  gctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  gctx.fillStyle = C.panel;
  gctx.fillRect(0, 0, GW, GH);
  const splitX = Math.floor(GW * 0.42);
  gctx.strokeStyle = C.grid;
  gctx.lineWidth = 1;
  gctx.beginPath(); gctx.moveTo(splitX, 5); gctx.lineTo(splitX, GH - 5); gctx.stroke();
  drawCurvePanel(0, splitX);
  barPanel = { offX: splitX, pw: GW - splitX };
  drawBarPanel(barPanel.offX, barPanel.pw);
}

// Clic su una riga del grafico: seleziona quel tipo di legame
function barRowAt(e) {
  const r = gCanvas.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  if (x < barPanel.offX) return null;
  const g = barGeometry(barPanel.offX, barPanel.pw);
  const i = Math.floor((y - g.y0) / g.row);
  return i >= 0 && i < CHART_TYPES.length ? CHART_TYPES[i] : null;
}
gCanvas.addEventListener('click', e => {
  const t = barRowAt(e);
  if (t && t.id !== P.type) selectType(t.id);
});
gCanvas.addEventListener('mousemove', e => { gCanvas.style.cursor = barRowAt(e) ? 'pointer' : 'default'; });

// ── Readout ───────────────────────────────────────────────────────────────────
const readout = new Lab.Readout(readoutEl, [
  { key: 'type',  label: 'Legame' },
  { key: 'ex',    label: 'Esempio' },
  { key: 'den',   label: 'ΔEN' },
  { key: 'ionic', label: 'Carattere ionico' },
  { key: 'E',     label: 'Energia' },
  { key: 'd',     label: 'Distanza' },
]);

function updateReadout() {
  const type = effectiveType();
  let ex = curExample(), den = null, label;
  if (P.type === 'predict') {
    ex = null;
    den = prediction().kind === 'metallic' ? null : prediction().den;
    label = `${P.elA}–${P.elB}`;
  } else {
    if (ex.den !== undefined) den = ex.den;
    label = ex.label.split(' (')[0];
  }
  readout.set('type', type.short);
  readout.set('ex', label);
  readout.set('den', den === null ? '—' : fmt(den, 2));
  readout.set('ionic', den === null ? '—' : fmt((1 - Math.exp(-den * den / 4)) * 100) + ' %');
  readout.set('E', ex && ex.E
    ? `≈ ${fmt(ex.E, ex.E < 10 ? 2 : 0)} kJ/mol`
    : `${fmt(type.range[0], type.range[0] < 1 ? 2 : 0)}–${type.range[1]} kJ/mol`);
  readout.set('d', ex && ex.d ? ex.d + ' pm' : '—');
}

// ── Controls ──────────────────────────────────────────────────────────────────
function selectType(id) {
  P.type = id;
  simT = 0;
  buildControls();
}

function elementSelect(labelText, key) {
  const row = document.createElement('div');
  row.className = 'ctrl-group';
  row.style.cssText = 'display:flex;align-items:center;gap:10px;';
  const lbl = document.createElement('span');
  lbl.className = 'ctrl-label';
  lbl.textContent = labelText;
  const sel = document.createElement('select');
  sel.className = 'ctrl-select';
  for (const s of PREDICT_ELEMENTS) {
    const o = document.createElement('option');
    o.value = s;
    o.textContent = `${s}  (EN ${fmt(EL[s].en, 2)}${EL[s].m ? ', metallo' : ''})`;
    sel.appendChild(o);
  }
  sel.value = P[key];
  sel.addEventListener('change', () => { P[key] = sel.value; });
  row.append(lbl, sel);
  return row;
}

function buildControls() {
  const cont = document.getElementById('controls');
  const scroller = cont.closest('.panel-scroll');
  const scrollTop = scroller ? scroller.scrollTop : 0;
  cont.innerHTML = '';
  const type = curType();
  const group = (title, label, g) => {
    const sec = Lab.Section(title);
    sec.add(Lab.RadioGroup({
      label,
      options: TYPES.filter(t => t.group === g).map(t => ({ value: t.id, label: t.name })),
      value: P.type,
      onChange: selectType,
    }));
    return sec;
  };

  const secPrimary = group('Legami primari', 'Fra atomi', 'primary');
  const secInter   = group('Forze intermolecolari', 'Fra molecole o ioni', 'inter');
  const secTool    = group('Strumenti', 'Elettronegatività', 'tool');

  const secEx = Lab.Section(type.examples ? 'Esempio' : 'Elementi');
  if (type.examples) {
    secEx.add(Lab.RadioGroup({
      label: type.name,
      options: type.examples.map(e => ({ value: e.id, label: e.label })),
      value: P.example[type.id],
      onChange(v) { P.example[type.id] = v; simT = 0; },
    }));
  } else {
    secEx.add(elementSelect('Atomo A', 'elA'));
    secEx.add(elementSelect('Atomo B', 'elB'));
  }
  const info = document.createElement('div');
  info.style.cssText = 'margin-top:6px;font-size:11px;color:var(--text-secondary);line-height:1.7;padding:10px 12px;background:var(--bg3);border-radius:8px';
  info.innerHTML = type.info;
  secEx.add(info);

  const secView = Lab.Section('Visualizzazione');
  secView.add(Lab.Slider({
    label: 'Velocità animazione', unit: '×', min: 0.2, max: 2, step: 0.1, value: P.speed,
    onChange(v) { P.speed = v; }
  }));
  secView.add(Lab.Toggle({
    label: 'Cariche ed etichette', value: P.labels,
    onChange(v) { P.labels = v; }
  }));
  if (P.type === 'metallic') {
    secView.add(Lab.Toggle({
      label: 'Differenza di potenziale', value: P.voltage,
      onChange(v) { P.voltage = v; }
    }));
  }

  cont.append(secPrimary.el, secInter.el, secTool.el, secEx.el, secView.el);
  if (scroller) scroller.scrollTop = scrollTop;
}

// ── Main loop ─────────────────────────────────────────────────────────────────
let running = true;
let simT = 0;
let lastTS = null;

function setRunning(v) {
  running = v;
  document.getElementById('btnPlay').textContent = v ? '⏸  PAUSA' : '▶  RIPRENDI';
}

function loop(ts) {
  requestAnimationFrame(loop);
  let dt = lastTS === null ? 0 : Math.min((ts - lastTS) / 1000, 0.05);
  lastTS = ts;
  dt = running ? dt * P.speed : 0;
  simT += dt;

  C = getColors();
  drawScene(simT, dt);
  drawGraph();
  updateReadout();
}

// ── Init ──────────────────────────────────────────────────────────────────────
Lab.initTheme('themeToggle');
resize();
buildControls();
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(canvas.parentElement);

document.getElementById('btnPlay').addEventListener('click', () => setRunning(!running));
document.getElementById('btnReset').addEventListener('click', () => { simT = 0; SEA.key = ''; });

requestAnimationFrame(loop);
