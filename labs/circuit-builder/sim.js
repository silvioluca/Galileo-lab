'use strict';

// ═══ Costanti ═══════════════════════════════════════════════════════════════
// Risolutore: Modified Nodal Analysis con modelli companion (Eulero implicito) per
// condensatori e induttori — le stesse equazioni sono state validate a parte contro le
// soluzioni analitiche note (transitorio RC, transitorio RL, partitore resistivo,
// amplificatore operazionale ideale, RLC sottosmorzato) prima di essere integrate qui.
const TWO = Math.PI * 2;
const R_ON = 0.01; // resistenza equivalente di un interruttore chiuso — aperto = nessuno stamp (circuito davvero aperto)

const PALETTE = [
  { type: 'WIRE', label: 'Filo', group: 'Base' },
  { type: 'GND', label: 'Terra ⏚', group: 'Base' },
  { type: 'R', label: 'Resistore', group: 'Passivi' },
  { type: 'POT', label: 'Potenziometro', group: 'Passivi' },
  { type: 'C', label: 'Condensatore', group: 'Passivi' },
  { type: 'L', label: 'Induttore', group: 'Passivi' },
  { type: 'LAMP', label: 'Lampadina', group: 'Passivi' },
  { type: 'SW', label: 'Interruttore', group: 'Interruttori' },
  { type: 'PB', label: 'Pulsante', group: 'Interruttori' },
  { type: 'VDC', label: 'Generatore ⎓', group: 'Generatori' },
  { type: 'VAC', label: 'Generatore ∿', group: 'Generatori' },
  { type: 'ISRC', label: 'Sorgente I', group: 'Generatori' },
  { type: 'OPAMP', label: 'Amplificatore', group: 'Attivi' },
];
function defaultsFor(type) {
  switch (type) {
    case 'R': return { value: 1000 };
    case 'POT': return { value: 1000 };
    case 'C': return { value: 1e-3, Vprev: 0 };
    case 'L': return { value: 0.5, Iprev: 0 };
    case 'LAMP': return { value: 200 };
    case 'SW': return { value: 0, closed: true };
    case 'PB': return { value: 0, closed: false };
    case 'VDC': return { value: 9 };
    case 'VAC': return { value: 9, freq: 1, phase: 0 };
    case 'ISRC': return { value: 0.01 };
    case 'OPAMP': return { value: 0 };
    default: return {};
  }
}

// ═══ Stato ════════════════════════════════════════════════════════════════════
let elements = [];      // componenti piazzati
let nextId = 1;
let selectedIds = new Set(); // selezione multipla (Ctrl+clic aggiunge/toglie); un clic semplice la sostituisce con un solo elemento
let lastSelectedId = null;   // ultimo elemento toccato dalla selezione — usato per il pannello proprietà e il readout, che mostrano un solo componente alla volta
const SEL_COLORS = ['#00d4ff', '#ff9d4d', '#7fe0a0', '#ff7ec7', '#ffe066', '#a0c4ff'];
let tool = null;         // null = selezione | {type, phase:1|2, gx1,gy1}
let activePB = null;     // pulsante attualmente tenuto premuto
let dirty = true;         // la topologia (fili/terminali) è cambiata, va ricostruita la mappa dei nodi
let animT = 0, last = 0;
let CELL = 32, originX = 32, originY = 32, GX = 20, GY = 14, zoom = 1;
let mousePx = -1, mousePy = -1;
let labelBoxes = [];      // {id, field, x,y,w,h} — ricalcolate ad ogni draw(), per il click sulle etichette
let G = {};
let gCanvas = [null, null, null], gCtx = [null, null, null], gTitle = [null, null, null];
let readout;
let paletteBtnEls = {};
function clearSelection() { selectedIds.clear(); lastSelectedId = null; }
function selectOnly(id) { selectedIds.clear(); if (id != null) { selectedIds.add(id); lastSelectedId = id; } else lastSelectedId = null; }
function toggleSelection(id) {
  if (selectedIds.has(id)) { selectedIds.delete(id); if (lastSelectedId === id) lastSelectedId = selectedIds.size ? [...selectedIds][selectedIds.size - 1] : null; }
  else { selectedIds.add(id); lastSelectedId = id; }
}

// ═══ Palette colori ══════════════════════════════════════════════════════════
function dk() { return document.documentElement.dataset.theme !== 'light'; }
function pal() {
  const d = dk();
  return {
    bg: d ? '#06090f' : '#e7edf4', txt: d ? 'rgba(225,238,250,0.96)' : 'rgba(20,40,70,0.95)',
    sub: d ? 'rgba(165,195,220,0.82)' : 'rgba(60,90,125,0.9)', accent: d ? '#00d4ff' : '#0a78b0',
    wire: d ? 'rgba(205,225,245,0.88)' : 'rgba(30,50,80,0.85)', grid: d ? 'rgba(150,175,205,0.22)' : 'rgba(60,95,130,0.28)',
    gBg: d ? 'rgb(3,9,22)' : '#eef2f7', gAxis: d ? 'rgba(100,155,210,0.3)' : 'rgba(40,80,130,0.32)', gText: d ? 'rgba(150,205,225,0.88)' : 'rgba(25,65,105,0.92)',
  };
}
let T = pal();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ═══ Formattazione/parsing valori ingegneristici (1k, 100u, 2.2M...) ═══════════════
function formatEng(v, unit) {
  if (!(Math.abs(v) >= 0)) return '—';
  if (v === 0) return `0${unit}`;
  const table = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
  const abs = Math.abs(v);
  let mag = table[table.length - 1];
  for (const t of table) { if (abs >= t[0]) { mag = t; break; } }
  const num = v / mag[0];
  const digits = Math.abs(num) < 10 ? 2 : Math.abs(num) < 100 ? 1 : 0;
  return `${Lab.fmt(num, digits)}${mag[1]}${unit}`;
}
function parseEng(str) {
  const m = String(str).trim().match(/^(-?[\d.]+)\s*([GMkmµun]?)/i);
  if (!m) return NaN;
  const mult = { G: 1e9, M: 1e6, k: 1e3, '': 1, m: 1e-3, µ: 1e-6, u: 1e-6, n: 1e-9 }[m[2]] ?? 1;
  return parseFloat(m[1]) * mult;
}

// ═══ Griglia ══════════════════════════════════════════════════════════════════
function keyOf(gx, gy) { return gx + ',' + gy; }
function gridToScreen(gx, gy) { return { x: originX + gx * CELL * zoom, y: originY + gy * CELL * zoom }; }
function nearestGrid(px, py) {
  return { gx: clamp(Math.round((px - originX) / (CELL * zoom)), 0, GX), gy: clamp(Math.round((py - originY) / (CELL * zoom)), 0, GY) };
}

// ═══ Union-Find (fili a resistenza nulla che uniscono i punti della griglia in nodi) ════
let ufParent = {};
function ufFind(k) { if (!(k in ufParent)) ufParent[k] = k; while (ufParent[k] !== k) { ufParent[k] = ufParent[ufParent[k]]; k = ufParent[k]; } return k; }
function ufUnion(a, b) { const ra = ufFind(a), rb = ufFind(b); if (ra !== rb) ufParent[ra] = rb; }

let nodeOf = {}, nNodeCount = 0;
function rebuildNodes() {
  ufParent = {}; nodeOf = {}; nNodeCount = 0;
  elements.forEach(e => { if (e.type === 'WIRE') ufUnion(keyOf(e.gx1, e.gy1), keyOf(e.gx2, e.gy2)); });
  let groundRoot = null;
  elements.forEach(e => { if (e.type === 'GND') groundRoot = ufFind(keyOf(e.gx1, e.gy1)); });
  function idxFor(gx, gy) {
    const r = ufFind(keyOf(gx, gy));
    if (groundRoot !== null && r === groundRoot) return -1;
    if (!(r in nodeOf)) nodeOf[r] = nNodeCount++;
    return nodeOf[r];
  }
  elements.forEach(e => {
    if (e.type === 'WIRE' || e.type === 'GND') return;
    if (e.type === 'OPAMP') { e.n1 = idxFor(e.gxP, e.gyP); e.n2 = idxFor(e.gx1, e.gy1); e.nout = idxFor(e.gx2, e.gy2); }
    else { e.n1 = idxFor(e.gx1, e.gy1); e.n2 = idxFor(e.gx2, e.gy2); }
  });
  dirty = false;
}

// ═══ Risolutore MNA (validato) ═══════════════════════════════════════════════════
function solveLinear(A, b) {
  const n = A.length;
  const M = A.map((row, i) => row.slice().concat([b[i]]));
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) continue;
    [M[col], M[piv]] = [M[piv], M[col]];
    const pv = M[col][col];
    for (let c = col; c <= n; c++) M[col][c] /= pv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col]; if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map(row => row[n]);
}
function solveCircuit(dt) {
  if (dirty) rebuildNodes();
  const hasGround = elements.some(e => e.type === 'GND');
  const comps = elements.filter(e => e.type !== 'WIRE' && e.type !== 'GND');
  if (!hasGround || comps.length === 0 || nNodeCount === 0) return { hasGround, empty: comps.length === 0 };
  let extra = 0;
  comps.forEach(c => { if (c.type === 'VDC' || c.type === 'VAC' || c.type === 'OPAMP') { c.mnaIndex = nNodeCount + extra; extra++; } });
  const size = nNodeCount + extra;
  const A = Array.from({ length: size }, () => new Array(size).fill(0));
  const b = new Array(size).fill(0);
  const stampG = (n1, n2, g) => { if (n1 >= 0) A[n1][n1] += g; if (n2 >= 0) A[n2][n2] += g; if (n1 >= 0 && n2 >= 0) { A[n1][n2] -= g; A[n2][n1] -= g; } };
  const stampI = (n1, n2, i) => { if (n1 >= 0) b[n1] -= i; if (n2 >= 0) b[n2] += i; };
  for (const c of comps) {
    if (c.type === 'R' || c.type === 'POT' || c.type === 'LAMP') stampG(c.n1, c.n2, 1 / Math.max(1e-3, c.value));
    // interruttore aperto: NESSUNO stamp (circuito davvero aperto, corrente esattamente zero) —
    // usare una resistenza enorme ma finita lasciava passare una corrente residua minuscola ma
    // visibile nel readout (nA), che sembrava "corrente che scorre" anche a interruttore aperto
    else if (c.type === 'SW' || c.type === 'PB') { if (c.closed) stampG(c.n1, c.n2, 1 / R_ON); }
    else if (c.type === 'C') { const Geq = c.value / dt; stampG(c.n1, c.n2, Geq); stampI(c.n1, c.n2, -Geq * (c.Vprev || 0)); }
    else if (c.type === 'L') { const Geq = dt / Math.max(1e-6, c.value); stampG(c.n1, c.n2, Geq); stampI(c.n1, c.n2, c.Iprev || 0); }
    else if (c.type === 'VDC' || c.type === 'VAC') {
      const k = c.mnaIndex;
      const v = c.type === 'VDC' ? c.value : c.value * Math.sin(TWO * c.freq * animT + (c.phase || 0));
      if (c.n1 >= 0) { A[c.n1][k] += 1; A[k][c.n1] += 1; }
      if (c.n2 >= 0) { A[c.n2][k] -= 1; A[k][c.n2] -= 1; }
      b[k] += v;
    } else if (c.type === 'ISRC') stampI(c.n1, c.n2, c.value);
    else if (c.type === 'OPAMP') {
      const k = c.mnaIndex;
      if (c.nout >= 0) A[c.nout][k] += 1;
      if (c.n1 >= 0) A[k][c.n1] += 1;
      if (c.n2 >= 0) A[k][c.n2] -= 1;
      b[k] = 0;
    }
  }
  const x = solveLinear(A, b);
  const V = i => (i < 0 ? 0 : (x[i] || 0));
  for (const c of comps) {
    if (c.type === 'C') { const Geq = c.value / dt; const Vnow = V(c.n1) - V(c.n2); c.lastI = Geq * Vnow - Geq * (c.Vprev || 0); c.Vprev = Vnow; c.lastV = Vnow; }
    else if (c.type === 'L') { const Geq = dt / Math.max(1e-6, c.value); const Vnow = V(c.n1) - V(c.n2); c.Iprev = (c.Iprev || 0) + Geq * Vnow; c.lastI = c.Iprev; c.lastV = Vnow; }
    else if (c.type === 'VDC' || c.type === 'VAC') { c.lastI = x[c.mnaIndex] || 0; c.lastV = V(c.n1) - V(c.n2); }
    else if (c.type === 'OPAMP') { c.lastI = x[c.mnaIndex] || 0; c.lastV = V(c.nout); }
    else if (c.type === 'ISRC') { c.lastI = c.value; c.lastV = V(c.n1) - V(c.n2); }
    else if (c.type === 'SW' || c.type === 'PB') { c.lastV = V(c.n1) - V(c.n2); c.lastI = c.closed ? c.lastV / R_ON : 0; }
    else { c.lastV = V(c.n1) - V(c.n2); c.lastI = c.lastV / Math.max(1e-3, c.value); }
  }
  return { hasGround: true, empty: false, ok: true };
}

// ═══ Passo di simulazione ═══════════════════════════════════════════════════
let lastSolveStatus = { hasGround: false, empty: true };
function step(dt) {
  animT += dt;
  lastSolveStatus = solveCircuit(dt);
  if (lastSolveStatus.ok) {
    selectedIds.forEach(id => {
      const el = elements.find(e => e.id === id);
      if (!el || el.type === 'WIRE' || el.type === 'GND') return;
      if (!el.hist) el.hist = [];
      el.hist.push({ t: animT, V: el.lastV || 0, I: el.lastI || 0 });
      const tMin = animT - 10; while (el.hist.length && el.hist[0].t < tMin) el.hist.shift();
    });
  }
}

// ═══ Disegno ══════════════════════════════════════════════════════════════════
function drawLine(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function drawGridDots(ctx) {
  ctx.fillStyle = T.grid;
  for (let gx = 0; gx <= GX; gx++) for (let gy = 0; gy <= GY; gy++) { const p = gridToScreen(gx, gy); ctx.beginPath(); ctx.arc(p.x, p.y, 1.3, 0, TWO); ctx.fill(); }
}
function drawGround(ctx, p, selected, selColor) {
  ctx.strokeStyle = selected ? selColor : T.wire; ctx.lineWidth = selected ? 3.2 : 2.8;
  drawLine(ctx, p.x, p.y, p.x, p.y + 17);
  [13, 8, 4].forEach((w, i) => { const y = p.y + 18 + i * 6; drawLine(ctx, p.x - w, y, p.x + w, y); });
}
// Disegno interamente vettoriale (nessuna ipotesi su "orizzontale, uscita a destra"): i tre
// terminali v+,v-,uscita possono trovarsi in QUALSIASI direzione reciproca a seconda di come è
// stato trascinato il componente, quindi il triangolo va costruito dai vettori reali fra i punti
// invece che da offset fissi in x/y — prima l'amplificatore si "orientava male" ogni volta che
// non veniva trascinato esattamente in orizzontale da sinistra a destra.
function drawOpAmp(ctx, e, sel, selColor) {
  const pv = gridToScreen(e.gxP, e.gyP), pm = gridToScreen(e.gx1, e.gy1), po = gridToScreen(e.gx2, e.gy2);
  const cz = CELL * zoom;
  ctx.strokeStyle = sel ? selColor : T.wire; ctx.lineWidth = sel ? 3.2 : 2.8;
  const midInX = (pv.x + pm.x) / 2, midInY = (pv.y + pm.y) / 2;
  let dx = po.x - midInX, dy = po.y - midInY;
  const dlen = Math.hypot(dx, dy) || 1; dx /= dlen; dy /= dlen;
  const baseHalf = Math.hypot(pv.x - pm.x, pv.y - pm.y) / 2;
  const apexDist = Math.max(cz * 1.1, baseHalf * 1.8);
  const apex = { x: midInX + dx * apexDist, y: midInY + dy * apexDist };
  ctx.beginPath(); ctx.moveTo(pv.x, pv.y); ctx.lineTo(pm.x, pm.y); ctx.lineTo(apex.x, apex.y); ctx.closePath(); ctx.stroke();
  drawLine(ctx, apex.x, apex.y, po.x, po.y);
  ctx.fillStyle = T.txt; ctx.font = `bold ${Math.round(13 * zoom)}px "Space Mono",monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('+', pv.x + dx * 14, pv.y + dy * 14); ctx.fillText('−', pm.x + dx * 14, pm.y + dy * 14);
  ctx.textBaseline = 'alphabetic';
}
// corpo di un componente a 2 terminali fra (x1,y1)-(x2,y2), orientato via rotazione del contesto
function drawBody(ctx, x1, y1, x2, y2, e, selColor) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
  ctx.save(); ctx.translate(x1, y1); ctx.rotate(ang);
  const selected = !!selColor;
  ctx.strokeStyle = selected ? selColor : T.wire; ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = selected ? 3.2 : 2.8;
  const bodyLen = Math.min(CELL * zoom * 1.05, len * 0.75), leadLen = (len - bodyLen) / 2, midx = len / 2;
  if (e.type === 'WIRE') { drawLine(ctx, 0, 0, len, 0); ctx.restore(); return; }
  drawLine(ctx, 0, 0, leadLen, 0);
  drawLine(ctx, len - leadLen, 0, len, 0);
  switch (e.type) {
    case 'R': case 'POT': {
      const n = 6, h = 10;
      ctx.beginPath(); ctx.moveTo(leadLen, 0);
      for (let i = 0; i <= n; i++) { const px = leadLen + bodyLen * i / n, py = (i === 0 || i === n) ? 0 : (i % 2 === 1 ? -h : h); ctx.lineTo(px, py); }
      ctx.stroke();
      if (e.type === 'POT') { drawLine(ctx, midx - 14, -22, midx + 14, -4); ctx.beginPath(); ctx.moveTo(midx + 14, -4); ctx.lineTo(midx + 5, -8); ctx.lineTo(midx + 10, 2); ctx.closePath(); ctx.fill(); }
      break;
    }
    case 'LAMP': {
      const r = bodyLen * 0.46;
      const power = (e.lastI || 0) * (e.lastI || 0) * e.value;
      const glow = clamp(power / 1.5, 0, 1);
      ctx.fillStyle = `rgba(255,220,120,${(0.12 + 0.75 * glow).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(midx, 0, r, 0, TWO); ctx.fill();
      ctx.strokeStyle = selected ? selColor : T.wire;
      ctx.beginPath(); ctx.arc(midx, 0, r, 0, TWO); ctx.stroke();
      drawLine(ctx, midx - r * 0.6, -r * 0.6, midx + r * 0.6, r * 0.6);
      drawLine(ctx, midx - r * 0.6, r * 0.6, midx + r * 0.6, -r * 0.6);
      break;
    }
    case 'C': {
      const gap = 13;
      drawLine(ctx, leadLen, 0, midx - gap / 2, 0);
      drawLine(ctx, midx + gap / 2, 0, len - leadLen, 0);
      ctx.lineWidth = 4;
      drawLine(ctx, midx - gap / 2, -18, midx - gap / 2, 18);
      drawLine(ctx, midx + gap / 2, -18, midx + gap / 2, 18);
      break;
    }
    case 'L': {
      const loops = 4, r = bodyLen / (2 * loops);
      ctx.beginPath(); ctx.moveTo(leadLen, 0);
      for (let i = 0; i < loops; i++) ctx.arc(leadLen + r + i * 2 * r, 0, r, Math.PI, 0, false);
      ctx.stroke();
      break;
    }
    case 'SW': case 'PB': {
      ctx.beginPath(); ctx.arc(leadLen, 0, 3.6, 0, TWO); ctx.fill();
      ctx.beginPath(); ctx.arc(len - leadLen, 0, 3.6, 0, TWO); ctx.fill();
      ctx.beginPath(); ctx.moveTo(leadLen, 0);
      if (e.closed) ctx.lineTo(len - leadLen, 0); else ctx.lineTo(len - leadLen - bodyLen * 0.32, -bodyLen * 0.46);
      ctx.stroke();
      break;
    }
    case 'VDC': case 'VAC': case 'ISRC': {
      const r = bodyLen * 0.5;
      ctx.beginPath(); ctx.arc(midx, 0, r, 0, TWO); ctx.stroke();
      if (e.type === 'VDC') {
        ctx.font = `bold ${Math.round(13 * zoom)}px "Space Mono",monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('+', midx - r * 0.42, 0); ctx.fillText('−', midx + r * 0.42, 0); ctx.textBaseline = 'alphabetic';
      } else if (e.type === 'VAC') {
        ctx.beginPath();
        for (let i = 0; i <= 16; i++) { const t = i / 16, x = midx - r * 0.62 + t * r * 1.24, y = -Math.sin(t * TWO) * r * 0.35; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke();
      } else {
        drawLine(ctx, midx, -r * 0.55, midx, r * 0.5);
        ctx.beginPath(); ctx.moveTo(midx, r * 0.55); ctx.lineTo(midx - 5, r * 0.55 - 9); ctx.lineTo(midx + 5, r * 0.55 - 9); ctx.closePath(); ctx.fill();
      }
      break;
    }
  }
  ctx.restore();
}
function fmtValueLabel(e) {
  switch (e.type) {
    case 'R': case 'POT': return formatEng(e.value, 'Ω');
    case 'C': return formatEng(e.value, 'F');
    case 'L': return formatEng(e.value, 'H');
    case 'LAMP': return formatEng(e.value, 'Ω');
    case 'VDC': return formatEng(e.value, 'V');
    case 'ISRC': return formatEng(e.value, 'A');
    default: return '';
  }
}
function drawComponent(ctx, e) {
  const selIdx = [...selectedIds].indexOf(e.id);
  const isSel = selIdx >= 0;
  const selColor = isSel ? SEL_COLORS[selIdx % SEL_COLORS.length] : null;
  if (e.type === 'GND') { drawGround(ctx, gridToScreen(e.gx1, e.gy1), isSel, selColor); return; }
  if (e.type === 'OPAMP') { drawOpAmp(ctx, e, isSel, selColor); }
  else { const p1 = gridToScreen(e.gx1, e.gy1), p2 = gridToScreen(e.gx2, e.gy2); drawBody(ctx, p1.x, p1.y, p2.x, p2.y, e, selColor); }
  if (e.type === 'WIRE') return;

  const p1 = e.type === 'OPAMP' ? gridToScreen(e.gxP, e.gyP) : gridToScreen(e.gx1, e.gy1);
  const p2 = gridToScreen(e.gx2, e.gy2);
  const midX = (p1.x + p2.x) / 2, topY = Math.min(p1.y, p2.y), botMidY = (p1.y + p2.y) / 2;

  const labelFont = Math.round(13 * zoom);
  ctx.font = `bold ${labelFont}px "Space Mono",monospace`; ctx.textAlign = 'center';
  ctx.fillStyle = isSel ? selColor : T.txt;
  let ly = topY - 24 * zoom;
  if (e.type === 'VAC') {
    const l1 = formatEng(e.value, 'V');
    const w1 = ctx.measureText(l1).width;
    ctx.fillText(l1, midX, ly);
    labelBoxes.push({ id: e.id, field: 'value', x: midX - w1 / 2 - 4, y: ly - 12, w: w1 + 8, h: 16 });
    const l2 = formatEng(e.freq, 'Hz'); const ly2 = ly - 18 * zoom;
    ctx.font = `${Math.round(12 * zoom)}px "Space Mono",monospace`;
    const w2 = ctx.measureText(l2).width;
    ctx.fillText(l2, midX, ly2);
    labelBoxes.push({ id: e.id, field: 'freq', x: midX - w2 / 2 - 4, y: ly2 - 11, w: w2 + 8, h: 15 });
  } else {
    const label = fmtValueLabel(e);
    if (label) {
      const w = ctx.measureText(label).width;
      ctx.fillText(label, midX, ly);
      labelBoxes.push({ id: e.id, field: 'value', x: midX - w / 2 - 4, y: ly - 12, w: w + 8, h: 16 });
    }
  }
  if (e.type !== 'OPAMP' || lastSolveStatus.ok) {
    const iv = `${formatEng(e.lastV || 0, 'V')}  ${formatEng(e.lastI || 0, 'A')}`;
    ctx.font = `${Math.round(10 * zoom)}px "Space Mono",monospace`; ctx.fillStyle = T.sub; ctx.textAlign = 'center';
    ctx.fillText(iv, midX, botMidY + 26 * zoom);
  }
}
function draw(canvas) {
  const [ctx, W, H] = Lab.ctx2d(canvas);
  T = pal();
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
  drawGridDots(ctx);
  labelBoxes = [];

  elements.forEach(e => drawComponent(ctx, e));

  if (tool) {
    if (tool.phase === 2) {
      const g = nearestGrid(mousePx, mousePy);
      const dx = g.gx - tool.gx1, dy = g.gy - tool.gy1;
      let gx2 = tool.gx1, gy2 = tool.gy1;
      if (Math.abs(dx) >= Math.abs(dy)) gx2 = tool.gx1 + dx; else gy2 = tool.gy1 + dy;
      const p1 = gridToScreen(tool.gx1, tool.gy1), p2 = gridToScreen(gx2, gy2);
      ctx.save(); ctx.globalAlpha = 0.5;
      if (tool.type !== 'OPAMP' && tool.type !== 'GND') drawBody(ctx, p1.x, p1.y, p2.x, p2.y, Object.assign({ id: -1 }, defaultsFor(tool.type), { type: tool.type }));
      else { ctx.strokeStyle = T.accent; ctx.setLineDash([3, 3]); drawLine(ctx, p1.x, p1.y, p2.x, p2.y); ctx.setLineDash([]); }
      ctx.restore();
    }
    const g = nearestGrid(mousePx, mousePy);
    const p = gridToScreen(g.gx, g.gy);
    ctx.fillStyle = T.accent; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, TWO); ctx.fill();
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = T.accent; ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.fillText('Costruttore di Circuiti', 14, 20);
  ctx.fillStyle = T.sub; ctx.font = '10px "Space Mono",monospace';
  let hint;
  if (tool) hint = tool.phase === 1 ? `${paletteLabel(tool.type)}: clicca il punto di partenza (Esc per annullare)` : `${paletteLabel(tool.type)}: clicca il punto di arrivo`;
  else if (!elements.some(e => e.type === 'GND')) hint = 'aggiungi un componente "Terra" per definire il riferimento a 0V, poi il circuito potrà essere risolto';
  else if (selectedIds.size > 1) hint = `${selectedIds.size} componenti selezionati — Ctrl+clic per aggiungere o togliere dalla selezione, Canc per eliminarli tutti`;
  else if (lastSelectedId != null) { const el = elements.find(e => e.id === lastSelectedId); hint = el ? `selezionato: ${paletteLabel(el.type)} — clicca un'etichetta o usa gli slider per modificarne il valore, Ctrl+clic per selezionarne altri, Canc per eliminarlo` : ''; }
  else hint = 'scegli un componente dal pannello, poi clicca due punti sulla griglia per posizionarlo (Ctrl+clic per selezionare più componenti)';
  ctx.fillText(hint, 14, 36);
}
function paletteLabel(type) { const p = PALETTE.find(p => p.type === type); return p ? p.label : type; }

// ═══ Grafici ══════════════════════════════════════════════════════════════════
// Storia degli ultimi 10 s del componente selezionato (o di più componenti con Ctrl+clic).
// Il fondo scala è il valore "tondo" sopra il picco registrato, con il prefisso SI adatto.
const G_WIN = 10;
function drawEmptyGraph(i, title, msg) {
  const g = Lab.panel(gCanvas[i], { title, xr: [0, G_WIN], yr: [-1, 1], xLabel: 't (s)', yFmt: () => '' });
  if (!g) return; const [ctx, f] = g;
  ctx.fillStyle = f.C.text; ctx.font = '10.5px "DM Sans",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(msg, (f.L + f.R) / 2, (f.T + f.B) / 2);
}
// selezione singola: una sola curva nel colore "tema" del grafico. Selezione multipla (Ctrl+clic):
// una curva per componente selezionato, ciascuna in un colore diverso, con legenda.
function drawMultiSeriesGraph(i, sels, key, title, unit, themeColor) {
  const t1 = Math.max(animT, G_WIN), t0 = t1 - G_WIN;
  let maxAbs = 0; sels.forEach(el => (el.hist || []).forEach(p => { if (p.t >= t0) maxAbs = Math.max(maxAbs, Math.abs(p[key])); }));
  // prefisso SI scelto sul picco: l'asse mostra numeri semplici (es. 0–5 mA)
  const pre = [[1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n']].find(([m]) => maxAbs >= m * 0.999) || [1e-9, 'n'];
  const m = Lab.niceMax(Math.max(maxAbs / pre[0], 1e-6));
  const g = Lab.panel(gCanvas[i], { title: `${title} (${pre[1]}${unit})`, xr: [t0, t1], yr: [-m, m], xLabel: 't (s)' });
  if (!g) return; const [ctx, f] = g;
  sels.forEach((el, k) => {
    const col = sels.length > 1 ? SEL_COLORS[k % SEL_COLORS.length] : themeColor;
    Lab.plotPts(ctx, f, (el.hist || []).filter(p => p.t >= t0 - 0.1).map(p => [p.t, p[key] / pre[0]]), col, 2);
  });
  if (sels.length > 1) Lab.legend(ctx, f.L + 8, f.T + 8, sels.map((el, k) => [SEL_COLORS[k % SEL_COLORS.length], paletteLabel(el.type)]));
}
function selectedElements() {
  return [...selectedIds].map(id => elements.find(e => e.id === id)).filter(el => el && el.type !== 'WIRE' && el.type !== 'GND');
}
function drawGraphs() {
  const titles = ['Tensione V(t)', 'Corrente I(t)', 'Potenza P(t)'];
  const sels = selectedElements();
  if (!sels.length) { [0, 1, 2].forEach(i => drawEmptyGraph(i, titles[i], 'clicca su un componente per vederne l\'andamento')); return; }
  sels.forEach(el => (el.hist || []).forEach(p => { p.P = p.V * p.I; }));
  drawMultiSeriesGraph(0, sels, 'V', titles[0], 'V', '#00d4ff');
  drawMultiSeriesGraph(1, sels, 'I', titles[1], 'A', '#ff9d4d');
  drawMultiSeriesGraph(2, sels, 'P', titles[2], 'W', '#7fe0a0');
}

// ═══ Interazione: piazzamento, selezione, modifica valori ═══════════════════════
function finalizePlacement(type, gx1, gy1, gx2, gy2) {
  const id = nextId++;
  const e = Object.assign({ id, type, gx1, gy1, gx2, gy2 }, defaultsFor(type));
  if (type === 'OPAMP') {
    // v+ va sempre PERPENDICOLARE alla direzione del trascinamento (mai sulla stessa retta di v- e
    // dell'uscita, altrimenti il triangolo degenera in un segmento) — se l'uscita è trascinata
    // prevalentemente in orizzontale v+ va sopra v-, se in verticale v+ va di lato
    const ddx = gx2 - gx1, ddy = gy2 - gy1;
    if (Math.abs(ddx) >= Math.abs(ddy)) { e.gxP = gx1; e.gyP = gy1 - 2; }
    else { e.gxP = gx1 - 2; e.gyP = gy1; }
  }
  elements.push(e); dirty = true; selectOnly(id);
}
function finalizeGround(gx, gy) {
  const id = nextId++;
  elements.push({ id, type: 'GND', gx1: gx, gy1: gy, gx2: gx, gy2: gy });
  dirty = true; selectOnly(id);
}
function undo() {
  if (!elements.length) return;
  elements.pop();
  dirty = true; clearSelection(); refreshProps();
}
function armTool(type) {
  tool = { type, phase: 1 }; clearSelection(); refreshProps();
  Object.values(paletteBtnEls).forEach(b => b.classList.remove('active'));
  if (paletteBtnEls[type]) paletteBtnEls[type].classList.add('active');
}
function disarmTool() {
  tool = null;
  Object.values(paletteBtnEls).forEach(b => b.classList.remove('active'));
}
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0; t = clamp(t, 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
function hitTestComponent(px, py) {
  let best = null, bestD = 14;
  elements.forEach(e => {
    let p1, p2;
    if (e.type === 'GND') { const p = gridToScreen(e.gx1, e.gy1); p1 = p; p2 = { x: p.x, y: p.y + 30 }; }
    else { p1 = gridToScreen(e.gx1, e.gy1); p2 = gridToScreen(e.gx2, e.gy2); }
    const d = distToSegment(px, py, p1.x, p1.y, p2.x, p2.y);
    if (d < bestD) { bestD = d; best = e.id; }
  });
  return best;
}
function rawValueString(e, field) {
  if (field === 'freq') return formatEng(e.freq, '');
  return formatEng(e.value, '');
}
function openValueEditor(el, box) {
  const rect = document.getElementById('simCanvas').getBoundingClientRect();
  const input = document.createElement('input');
  input.type = 'text'; input.value = rawValueString(el, box.field);
  input.style.cssText = `position:fixed; left:${rect.left + box.x}px; top:${rect.top + box.y}px; width:${Math.max(56, box.w)}px; height:${box.h}px; font:bold 12px "Space Mono",monospace; text-align:center; z-index:1000; background:${T.bg}; color:${T.accent}; border:1px solid ${T.accent}; border-radius:3px; padding:0;`;
  document.body.appendChild(input);
  input.focus(); input.select();
  let done = false;
  function commit() {
    if (done) return; done = true;
    const v = parseEng(input.value);
    if (!isNaN(v) && v > 0) { if (box.field === 'freq') el.freq = v; else el.value = v; }
    input.remove();
    refreshProps();
  }
  input.addEventListener('keydown', ev => { if (ev.key === 'Enter') commit(); else if (ev.key === 'Escape') { done = true; input.remove(); } });
  input.addEventListener('blur', commit);
}

// ═══ Controlli (palette + proprietà del componente selezionato) ═════════════════
let propsWrap;
function refreshProps() {
  if (!propsWrap) return;
  propsWrap.innerHTML = '';
  if (selectedIds.size > 1) {
    const msg = document.createElement('div');
    msg.className = 'panel-section';
    msg.innerHTML = `<div class="panel-section-title">Proprietà</div><div class="ctrl-hint" style="padding:2px 0 8px;">${selectedIds.size} componenti selezionati — modifica un solo componente alla volta per vederne gli slider</div>`;
    propsWrap.appendChild(msg);
    return;
  }
  const el = elements.find(e => e.id === lastSelectedId);
  if (!el || el.type === 'WIRE' || el.type === 'GND' || el.type === 'OPAMP') return;
  const sec = Lab.Section(`Proprietà — ${paletteLabel(el.type)}`);
  propsWrap.appendChild(sec.el);
  switch (el.type) {
    case 'R': case 'POT': case 'LAMP':
      sec.add(Lab.SliderInput({ label: 'Resistenza', min: 1, max: 10000, step: 1, unit: ' Ω', value: el.value, onChange(v) { el.value = v; } }));
      break;
    case 'C':
      sec.add(Lab.SliderInput({ label: 'Capacità', min: 1, max: 2000, step: 1, unit: ' µF', value: el.value * 1e6, onChange(v) { el.value = v * 1e-6; } }));
      break;
    case 'L':
      sec.add(Lab.SliderInput({ label: 'Induttanza', min: 1, max: 2000, step: 1, unit: ' mH', value: el.value * 1000, onChange(v) { el.value = v / 1000; } }));
      break;
    case 'VDC':
      sec.add(Lab.SliderInput({ label: 'Tensione', min: 0.5, max: 24, step: 0.5, unit: ' V', value: el.value, onChange(v) { el.value = v; } }));
      break;
    case 'VAC':
      sec.add(Lab.SliderInput({ label: 'Ampiezza', min: 0.5, max: 24, step: 0.5, unit: ' V', value: el.value, onChange(v) { el.value = v; } }));
      sec.add(Lab.SliderInput({ label: 'Frequenza', min: 0.1, max: 10, step: 0.1, unit: ' Hz', value: el.freq, onChange(v) { el.freq = v; } }));
      break;
    case 'ISRC':
      sec.add(Lab.SliderInput({ label: 'Corrente', min: 1, max: 100, step: 1, unit: ' mA', value: el.value * 1000, onChange(v) { el.value = v / 1000; } }));
      break;
    case 'SW': case 'PB':
      sec.add(Lab.Toggle({ label: 'Chiuso', value: el.closed, onChange(v) { el.closed = v; } }));
      break;
  }
}
function buildControls() {
  const cont = document.getElementById('controls'); cont.innerHTML = '';
  propsWrap = document.createElement('div'); cont.appendChild(propsWrap);
  paletteBtnEls = {};
  const groups = {};
  PALETTE.forEach(p => { (groups[p.group] = groups[p.group] || []).push(p); });
  Object.keys(groups).forEach(gname => {
    const sec = Lab.Section(gname); cont.appendChild(sec.el);
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;';
    groups[gname].forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'ctrl-btn'; btn.textContent = p.label; btn.style.textAlign = 'center';
      btn.addEventListener('click', () => armTool(p.type));
      grid.appendChild(btn);
      paletteBtnEls[p.type] = btn;
    });
    sec.el.appendChild(grid);
  });
  const style = document.createElement('style');
  style.textContent = '.ctrl-btn.active{background:rgba(0,212,255,0.22);border-color:var(--border-active);color:var(--accent, #00d4ff);}';
  cont.appendChild(style);
}
function buildReadout() {
  const cont = document.getElementById('readout'); cont.innerHTML = '';
  readout = new Lab.Readout(cont, [
    { key: 'comp', label: 'Componente selezionato' }, { key: 'valore', label: 'Valore' },
    { key: 'v', label: 'Tensione ai capi' }, { key: 'i', label: 'Corrente' },
    { key: 'nodi', label: 'Nodi del circuito' }, { key: 'stato', label: 'Stato' },
  ]);
}
function initGraphs(){
  // riga di grafici standard (Lab.graphPanels); i titoli sono disegnati dentro i grafici
  gCanvas = Lab.graphPanels(document.getElementById('graphArea'), 3);
  gCtx = gCanvas.map(c => c.getContext('2d'));
  gTitle = gCanvas.map(() => ({ textContent: '' }));
}

// ═══ Circuito di esempio ═════════════════════════════════════════════════════
// All'avvio: pila da 9 V, interruttore, R = 1 kΩ e C = 1 mF (τ = RC = 1 s) con la terra.
// Il condensatore è selezionato, così i grafici mostrano subito la carica esponenziale.
function loadExample() {
  const add = (type, gx1, gy1, gx2, gy2, extra = {}) => {
    const id = nextId++;
    elements.push(Object.assign({ id, type, gx1, gy1, gx2, gy2 }, defaultsFor(type), extra));
    return id;
  };
  add('VDC', 3, 4, 3, 9);                 // + in alto (primo terminale)
  add('WIRE', 3, 4, 6, 4);
  add('SW', 6, 4, 9, 4, { closed: true });
  add('R', 9, 4, 13, 4);
  add('WIRE', 13, 4, 15, 4);
  const cap = add('C', 15, 4, 15, 9);
  add('WIRE', 15, 9, 3, 9);
  add('GND', 3, 9, 3, 9);
  dirty = true; animT = 0;
  selectOnly(cap);
}

// ═══ Init ═════════════════════════════════════════════════════════════════════
function init() {
  Lab.initTheme();
  buildControls(); initGraphs(); buildReadout();
  loadExample(); refreshProps();
  const simCanvas = document.getElementById('simCanvas');
  const btnPlay = document.getElementById('btnPlay');
  let paused = false;
  function syncPlay() { btnPlay.textContent = paused ? '▶  AVVIA' : '⏸  PAUSA'; }
  syncPlay();
  btnPlay.addEventListener('click', () => { paused = !paused; syncPlay(); });
  document.getElementById('btnDelete').addEventListener('click', () => {
    if (!selectedIds.size) return;
    elements = elements.filter(e => !selectedIds.has(e.id)); clearSelection(); dirty = true; refreshProps();
  });
  document.getElementById('btnUndo').addEventListener('click', undo);
  document.getElementById('btnReset').addEventListener('click', () => {
    elements = []; nextId = 1; clearSelection(); tool = null; dirty = true; animT = 0; zoom = 1;
    disarmTool(); refreshProps();
  });

  simCanvas.style.cursor = 'crosshair';
  simCanvas.addEventListener('pointerdown', e => {
    const rect = simCanvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    const g = nearestGrid(px, py);
    if (tool) {
      if (tool.type === 'GND') { finalizeGround(g.gx, g.gy); disarmTool(); refreshProps(); return; }
      if (tool.phase === 1) { tool.gx1 = g.gx; tool.gy1 = g.gy; tool.phase = 2; return; }
      const dx = g.gx - tool.gx1, dy = g.gy - tool.gy1;
      let gx2 = tool.gx1, gy2 = tool.gy1;
      if (Math.abs(dx) >= Math.abs(dy)) gx2 = tool.gx1 + dx; else gy2 = tool.gy1 + dy;
      if (gx2 !== tool.gx1 || gy2 !== tool.gy1) finalizePlacement(tool.type, tool.gx1, tool.gy1, gx2, gy2);
      // disarma subito lo strumento dopo il piazzamento, cosi' il clic successivo seleziona invece
      // di piazzarne un altro — il componente appena messo resta selezionato (mostra i suoi slider)
      disarmTool(); refreshProps();
      return;
    }
    for (const box of labelBoxes) {
      if (px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h) {
        const el = elements.find(x => x.id === box.id);
        // preventDefault: senza, il mousedown "di compatibilità" che segue il pointerdown ruba
        // subito il focus al nuovo <input> appena creato (il campo si apre e si chiude nello stesso click)
        e.preventDefault();
        if (el) openValueEditor(el, box);
        return;
      }
    }
    const hitId = hitTestComponent(px, py);
    if (e.ctrlKey || e.metaKey) {
      if (hitId != null) toggleSelection(hitId);
    } else {
      selectOnly(hitId);
    }
    refreshProps();
    if (hitId != null) {
      const el = elements.find(x => x.id === hitId);
      if (el.type === 'SW') { el.closed = !el.closed; refreshProps(); }
      else if (el.type === 'PB') { el.closed = true; activePB = el; }
    }
  });
  simCanvas.addEventListener('pointermove', e => {
    const rect = simCanvas.getBoundingClientRect();
    mousePx = e.clientX - rect.left; mousePy = e.clientY - rect.top;
  });
  window.addEventListener('pointerup', () => { if (activePB) { activePB.closed = false; activePB = null; refreshProps(); } });
  simCanvas.addEventListener('wheel', e => {
    e.preventDefault();
    zoom = clamp(zoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.5, 2.5);
  }, { passive: false });
  window.addEventListener('keydown', e => {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    if (e.key === 'Escape') { disarmTool(); clearSelection(); refreshProps(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size) {
      e.preventDefault();
      elements = elements.filter(x => !selectedIds.has(x.id)); clearSelection(); dirty = true; refreshProps();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  });

  function resize() {
    const area = document.querySelector('.lab-canvas-area'); if (!area) return;
    const ar = area.getBoundingClientRect();
    const rb = document.getElementById('readout').getBoundingClientRect();
    const ga = document.getElementById('graphArea'); const gaH = ga ? ga.offsetHeight : 0;
    const h = Math.max(240, Math.floor(ar.height - rb.height - gaH - 4));
    simCanvas.style.width = Math.floor(ar.width) + 'px'; simCanvas.style.height = h + 'px';
    Lab.hidpi(simCanvas, Math.floor(ar.width), h);
    CELL = Math.max(26, Math.min(42, Math.floor(ar.width / 28)));
    originX = CELL; originY = CELL;
    GX = Math.max(4, Math.floor((Math.floor(ar.width) - 2 * CELL) / CELL));
    GY = Math.max(4, Math.floor((h - 2 * CELL) / CELL));
    Lab.fitPanels(gCanvas);
  }
  resize();
  new ResizeObserver(resize).observe(document.querySelector('.lab-canvas-area'));
  window.addEventListener('load', resize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);

  last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000; last = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0; dt = Math.min(dt, 0.05);
    if (!paused) step(dt);
    try {
      draw(simCanvas); drawGraphs();
      const sel = elements.find(e => e.id === lastSelectedId);
      if (sel) {
        const suffix = selectedIds.size > 1 ? ` (+${selectedIds.size - 1})` : '';
        readout.set('comp', paletteLabel(sel.type) + suffix);
        readout.set('valore', sel.type === 'GND' || sel.type === 'WIRE' ? '—' : fmtValueLabel(sel) || (sel.type === 'VAC' ? formatEng(sel.value, 'V') : '—'));
        readout.set('v', formatEng(sel.lastV || 0, 'V'));
        readout.set('i', formatEng(sel.lastI || 0, 'A'));
      } else {
        readout.set('comp', '—'); readout.set('valore', '—'); readout.set('v', '—'); readout.set('i', '—');
      }
      readout.set('nodi', String(nNodeCount));
      readout.set('stato', !lastSolveStatus.hasGround ? 'manca la terra' : lastSolveStatus.empty ? 'circuito vuoto' : 'risolto');
    } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
