'use strict';

// ═══ Costanti ═══════════════════════════════════════════════════════════════
const TWO = Math.PI * 2;
const FLOW_SPEED = 55;      // px/s, ritmo visivo fisso dei pallini di corrente (non scalato sulla vera intensità: servirebbe a rendere il flusso troppo lento o troppo veloce a seconda dei valori scelti)
const N_MIN = 2, N_MAX = 8;

const P = {
  elemType: 'R',        // 'R' resistori | 'C' condensatori (solo per serie/parallelo)
  config: 'series',      // 'series' | 'parallel' | 'star-delta' | 'wheatstone'
  n: 3,
  values: [],            // interpretazione dipende da config: N valori (serie/parallelo), [Ra,Rb,Rc] (stella-triangolo), [R1,R2,R3,R4,Rg] (Wheatstone)
  v0: 9,                  // tensione applicata, V
  paused: false,
};
function isNetworkConfig() { return P.config === 'star-delta' || P.config === 'wheatstone'; }

let animT = 0, last = 0;
let G = {};
let gCanvas = [null, null, null], gCtx = [null, null, null], gTitle = [null, null, null];
let readout;
let valuesContainer;

// ═══ Palette ══════════════════════════════════════════════════════════════════
function dk() { return document.documentElement.dataset.theme !== 'light'; }
function pal() {
  const d = dk();
  return {
    bg: d ? '#06090f' : '#e7edf4', txt: d ? 'rgba(225,238,250,0.96)' : 'rgba(20,40,70,0.95)',
    sub: d ? 'rgba(165,195,220,0.82)' : 'rgba(60,90,125,0.9)', accent: d ? '#00d4ff' : '#0a78b0',
    wire: d ? 'rgba(205,225,245,0.88)' : 'rgba(30,50,80,0.85)', grid: d ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
    gBg: d ? 'rgb(3,9,22)' : '#eef2f7', gAxis: d ? 'rgba(100,155,210,0.3)' : 'rgba(40,80,130,0.32)', gText: d ? 'rgba(150,205,225,0.88)' : 'rgba(25,65,105,0.92)',
  };
}
let T = pal();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const SUBS = '₀₁₂₃₄₅₆₇₈₉';
function sub(n) { return String(n).split('').map(d => SUBS[+d]).join(''); }

// ═══ Valori di default (serie E-like, solo per un aspetto realistico all'avvio) ═══════════
function extendValues(type, arr, n) {
  const Rset = [100, 220, 330, 470, 680, 1000, 150, 270, 390, 560, 820, 1200];
  const Cset = [10, 22, 33, 47, 68, 100, 15, 27, 39, 56, 82, 120];
  const set = type === 'R' ? Rset : Cset;
  const out = arr.slice();
  while (out.length < n) out.push(set[out.length % set.length]);
  return out.slice(0, n);
}

// ═══ Fisica: combinazione di resistori/condensatori in serie/parallelo ═══════════════
// Tutte formule chiuse ed esatte, nessuna approssimazione: R serie = Σ Ri, R parallelo = 1/Σ(1/Ri),
// C serie = 1/Σ(1/Ci) (duale della R serie), C parallelo = Σ Ci (duale della R parallelo).
function computeEquivalent() {
  const vals = P.values.slice(0, P.n);
  const sum = vals.reduce((a, b) => a + b, 0);
  const sumInv = vals.reduce((a, b) => a + 1 / b, 0);
  if (P.elemType === 'R') return P.config === 'series' ? sum : 1 / sumInv;
  return P.config === 'series' ? 1 / sumInv : sum;
}
// grandezza comune a tutti gli elementi e grandezza che varia da elemento a elemento, secondo
// le leggi di Kirchhoff: in serie la corrente (R) o la carica (C) è la stessa ovunque, in
// parallelo è la tensione ad essere la stessa ovunque.
function computeDistribution() {
  const vals = P.values.slice(0, P.n);
  const eq = computeEquivalent(), V0 = P.v0;
  if (P.elemType === 'R') {
    if (P.config === 'series') { const I = V0 / eq; return vals.map(R => ({ varying: I * R, varLabel: 'V', varUnit: 'V' })); }
    return vals.map(R => ({ varying: V0 / R, varLabel: 'I', varUnit: 'A' }));
  } else {
    if (P.config === 'series') { const Q = eq * V0; return vals.map(C => ({ varying: Q / C, varLabel: 'V', varUnit: 'V' })); }
    return vals.map(C => ({ varying: C * V0, varLabel: 'Q', varUnit: 'µC' }));
  }
}
// grandezza totale erogata dal generatore: per i resistori è la corrente totale I=V0/Req,
// per i condensatori è la carica totale Q=Ceq·V0 — la stessa formula in entrambe le configurazioni,
// perché è proprio così che l'equivalente viene definito.
function computeTotal() { return P.elemType === 'R' ? P.v0 / computeEquivalent() : computeEquivalent() * P.v0; }

// ═══ Fisica: trasformazione stella-triangolo (Y-Δ) ═══════════════════════════════════
// Formule chiuse esatte: la rete a stella (Ra,Rb,Rc da un centro a tre morsetti A,B,C) e quella a
// triangolo (Rab,Rbc,Rca fra le coppie di morsetti) sono elettricamente indistinguibili viste dai
// tre morsetti — stessa tensione e corrente per qualunque carico esterno. Rxy(Δ) = ΣRiRj / Rz, dove
// Rz è la resistenza a stella del terzo morsetto (quello non coinvolto nel lato xy).
function computeStarDelta() {
  const [Ra, Rb, Rc] = P.values;
  const sumProd = Ra * Rb + Rb * Rc + Rc * Ra;
  return { Ra, Rb, Rc, Rab: sumProd / Rc, Rbc: sumProd / Ra, Rca: sumProd / Rb };
}

// ═══ Fisica: ponte di Wheatstone ═══════════════════════════════════════════════════
// Analisi esatta via equivalente di Thevenin visto dai morsetti B,C dove è inserito il
// galvanometro: V_th = V_B − V_C (con Rg scollegato) = V0·(R2/(R1+R2) − R4/(R3+R4));
// R_th = (R1∥R2) + (R3∥R4) (con V0 cortocircuitato, A e D diventano lo stesso nodo, quindi R1,R2
// sono in parallelo fra B e quel nodo, R3,R4 fra C e quel nodo, i due gruppi in serie fra B e C).
// Corrente nel galvanometro: I_g = V_th/(R_th+Rg). Il ponte è bilanciato (I_g=0, indipendentemente
// da Rg) quando R1/R2 = R3/R4, cioè R1·R4 = R2·R3 — condizione classica usata per misurare una
// resistenza incognita confrontandola con tre note.
function computeWheatstone() {
  const [R1, R2, R3, R4, Rg] = P.values;
  const V0 = P.v0;
  const Vb = V0 * R2 / (R1 + R2), Vc = V0 * R4 / (R3 + R4);
  const Vth = Vb - Vc;
  const Rth = (R1 * R2) / (R1 + R2) + (R3 * R4) / (R3 + R4);
  const Ig = Vth / (Rth + Rg);
  const balanced = Math.abs(R1 * R4 - R2 * R3) < 1e-6 * Math.max(R1 * R4, R2 * R3, 1);
  return { R1, R2, R3, R4, Rg, Vb, Vc, Vth, Rth, Ig, balanceRatioLeft: R1 / R2, balanceRatioRight: R3 / R4, balanced };
}

function newRun() { animT = 0; }

// ═══ Disegno del circuito ═══════════════════════════════════════════════════════
let flowSegs = [];
function drawWire(ctx, x1, y1, x2, y2, track) {
  ctx.strokeStyle = T.wire; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  if (track) flowSegs.push([x1, y1, x2, y2]);
}
function drawBatterySymbol(ctx, x, cy, h) {
  ctx.strokeStyle = T.wire; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(x - 10, cy - h * 0.18); ctx.lineTo(x + 10, cy - h * 0.18); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 5, cy + h * 0.18); ctx.lineTo(x + 5, cy + h * 0.18); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, cy - h / 2); ctx.lineTo(x, cy - h * 0.18); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, cy + h * 0.18); ctx.lineTo(x, cy + h / 2); ctx.stroke();
  ctx.font = '10px "Space Mono",monospace'; ctx.textAlign = 'left';
  ctx.fillStyle = T.accent; ctx.fillText('+', x + 15, cy - h * 0.18 + 3);
  ctx.fillStyle = T.sub; ctx.fillText('−', x + 15, cy + h * 0.18 + 3);
  ctx.fillStyle = T.txt; ctx.textAlign = 'center';
  ctx.fillText('V₀', x, cy + h / 2 + 15);
}
// simbolo dell'elemento (resistore a zigzag o condensatore a piastre) lungo il segmento (x1,y1)-(x2,y2),
// orientato automaticamente via rotazione — funziona per rami orizzontali, verticali o diagonali
function drawElementSymbol(ctx, x1, y1, x2, y2, kind, valueLabel) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
  ctx.save(); ctx.translate(x1, y1); ctx.rotate(ang);
  const bodyLen = Math.min(48, len * 0.55), leadLen = (len - bodyLen) / 2;
  ctx.strokeStyle = T.wire; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(leadLen, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(len - leadLen, 0); ctx.lineTo(len, 0); ctx.stroke();
  if (kind === 'R') {
    const n = 6, h = 8;
    ctx.beginPath(); ctx.moveTo(leadLen, 0);
    for (let i = 0; i <= n; i++) { const px = leadLen + bodyLen * i / n, py = (i === 0 || i === n) ? 0 : (i % 2 === 1 ? -h : h); ctx.lineTo(px, py); }
    ctx.stroke();
  } else {
    const gap = 10, midx = len / 2;
    // stub che collegano i reofori alle piastre — senza, le piastre restano "staccate" dal resto del filo
    ctx.beginPath(); ctx.moveTo(leadLen, 0); ctx.lineTo(midx - gap / 2, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(midx + gap / 2, 0); ctx.lineTo(len - leadLen, 0); ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(midx - gap / 2, -14); ctx.lineTo(midx - gap / 2, 14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(midx + gap / 2, -14); ctx.lineTo(midx + gap / 2, 14); ctx.stroke();
  }
  ctx.restore();
  // etichetta sempre sopra l'elemento (mai sovrapposta), indipendentemente dall'orientamento del ramo
  const midX = (x1 + x2) / 2, topY = Math.min(y1, y2);
  ctx.fillStyle = T.txt; ctx.font = 'bold 13px "Space Mono",monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(valueLabel, midX, topY - 18);
}
function elLabel(i, v) { return `${P.elemType}${sub(i + 1)}=${v}${P.elemType === 'R' ? 'Ω' : 'µF'}`; }
function drawTerminal(ctx, p, label, dx, dy) {
  ctx.fillStyle = T.accent; ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, TWO); ctx.fill();
  ctx.fillStyle = T.txt; ctx.font = 'bold 12px "Space Mono",monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, p.x + dx, p.y + dy); ctx.textBaseline = 'alphabetic';
}
function triPos(cx, cy, R) {
  return { A: { x: cx, y: cy - R }, B: { x: cx - R * 0.87, y: cy + R * 0.5 }, C: { x: cx + R * 0.87, y: cy + R * 0.5 } };
}

function drawSeries(ctx, x0, x1, cy) {
  const yTop = cy - 45, yBot = cy + 45, batX = x0 - 35;
  const track = P.elemType === 'R';
  drawWire(ctx, batX, cy - 35, batX, yTop, track); drawWire(ctx, batX, yTop, x0, yTop, track);
  const n = P.n, segW = (x1 - x0) / n, vals = P.values.slice(0, n);
  for (let i = 0; i < n; i++) {
    const xa = x0 + i * segW, xb = x0 + (i + 1) * segW;
    drawElementSymbol(ctx, xa, yTop, xb, yTop, P.elemType, elLabel(i, vals[i]));
  }
  drawWire(ctx, x1, yTop, x1, yBot, track);
  drawWire(ctx, x1, yBot, batX, yBot, track); drawWire(ctx, batX, yBot, batX, cy + 35, track);
  drawBatterySymbol(ctx, batX, cy, 70);
}
function drawParallel(ctx, x0, x1, cy) {
  const yTop = cy - 45, yBot = cy + 45, batX = x0 - 35;
  drawWire(ctx, batX, cy - 35, batX, yTop); drawWire(ctx, batX, yTop, x1, yTop);
  drawWire(ctx, batX, cy + 35, batX, yBot); drawWire(ctx, batX, yBot, x1, yBot);
  drawBatterySymbol(ctx, batX, cy, 70);
  const n = P.n, vals = P.values.slice(0, n);
  for (let i = 0; i < n; i++) {
    const bx = x0 + (x1 - x0) * (i + 0.5) / n;
    drawElementSymbol(ctx, bx, yTop, bx, yBot, P.elemType, elLabel(i, vals[i]));
  }
}
function drawEquivalent(ctx, x0, x1, cy, eqVal) {
  const yTop = cy - 28, yBot = cy + 28, batX = x0 + 18, elemX0 = batX + 55, elemX1 = x1 - 10;
  drawWire(ctx, batX, cy - 20, batX, yTop); drawWire(ctx, batX, yTop, elemX0, yTop);
  drawWire(ctx, elemX1, yTop, x1, yTop);
  drawWire(ctx, batX, cy + 20, batX, yBot); drawWire(ctx, batX, yBot, x1, yBot);
  drawWire(ctx, x1, yTop, x1, yBot);
  drawBatterySymbol(ctx, batX, cy, 40);
  const label = `${P.elemType}eq=${Lab.fmt(eqVal,2)}${P.elemType === 'R' ? 'Ω' : 'µF'}`;
  drawElementSymbol(ctx, elemX0, yTop, elemX1, yTop, P.elemType, label);
}
function drawFlowDots(ctx) {
  const total = flowSegs.reduce((s, seg) => s + Math.hypot(seg[2] - seg[0], seg[3] - seg[1]), 0);
  if (!total) return;
  const N = Math.max(6, Math.round(total / 30));
  ctx.fillStyle = T.accent;
  for (let k = 0; k < N; k++) {
    let s = (animT * FLOW_SPEED + k * total / N) % total;
    for (const seg of flowSegs) {
      const l = Math.hypot(seg[2] - seg[0], seg[3] - seg[1]);
      if (s <= l) { const f = s / l, x = seg[0] + (seg[2] - seg[0]) * f, y = seg[1] + (seg[3] - seg[1]) * f; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TWO); ctx.fill(); break; }
      s -= l;
    }
  }
}
function drawSeriesParallelScene(ctx, W, H) {
  const cy = H * 0.52, eqW = Math.min(260, W * 0.3), mainX0 = 95, mainX1 = W - eqW - 75;
  flowSegs = [];
  if (P.config === 'series') drawSeries(ctx, mainX0, mainX1, cy); else drawParallel(ctx, mainX0, mainX1, cy);
  drawFlowDots(ctx);

  ctx.strokeStyle = T.grid; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(mainX1 + 35, 55); ctx.lineTo(mainX1 + 35, H - 65); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = T.sub; ctx.font = '18px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText('≡', mainX1 + 35, cy + 6);
  const eq = computeEquivalent();
  drawEquivalent(ctx, mainX1 + 55, W - 25, cy, eq);

  ctx.textAlign = 'left';
  ctx.fillStyle = T.accent; ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.fillText(`${P.elemType === 'R' ? 'Resistori' : 'Condensatori'} in ${P.config === 'series' ? 'serie' : 'parallelo'}`, 14, 20);
  ctx.fillStyle = T.txt; ctx.font = '10px "Space Mono",monospace';
  const unit = P.elemType === 'R' ? ' Ω' : ' µF';
  ctx.fillText(`N=${P.n}   equivalente = ${Lab.fmt(eq,2)}${unit}   V₀=${P.v0} V`, 14, 36);

  ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
  let hint;
  if (P.elemType === 'R') hint = P.config === 'series' ? 'in serie la resistenza equivalente è sempre maggiore della più grande delle resistenze' : 'in parallelo la resistenza equivalente è sempre minore della più piccola delle resistenze';
  else hint = P.config === 'series' ? 'in serie la capacità equivalente è sempre minore della più piccola delle capacità' : 'in parallelo la capacità equivalente è sempre maggiore della più grande delle capacità';
  ctx.fillText(hint, W / 2, H - 8);
}

// ═══ Disegno: stella-triangolo ═══════════════════════════════════════════════════
function drawStarPanel(ctx, cx, cy, R, Ra, Rb, Rc) {
  const { A, B, C } = triPos(cx, cy, R);
  const M = { x: cx, y: cy + R * 0.15 };
  drawElementSymbol(ctx, M.x, M.y, A.x, A.y, 'R', `Ra=${Ra}Ω`);
  drawElementSymbol(ctx, M.x, M.y, B.x, B.y, 'R', `Rb=${Rb}Ω`);
  drawElementSymbol(ctx, M.x, M.y, C.x, C.y, 'R', `Rc=${Rc}Ω`);
  ctx.fillStyle = T.sub; ctx.beginPath(); ctx.arc(M.x, M.y, 2.5, 0, TWO); ctx.fill();
  drawTerminal(ctx, A, 'A', 0, -14); drawTerminal(ctx, B, 'B', -16, 8); drawTerminal(ctx, C, 'C', 16, 8);
}
function drawDeltaPanel(ctx, cx, cy, R, Rab, Rbc, Rca) {
  const { A, B, C } = triPos(cx, cy, R);
  drawElementSymbol(ctx, A.x, A.y, B.x, B.y, 'R', `Rab=${Lab.fmt(Rab,1)}Ω`);
  drawElementSymbol(ctx, B.x, B.y, C.x, C.y, 'R', `Rbc=${Lab.fmt(Rbc,1)}Ω`);
  drawElementSymbol(ctx, C.x, C.y, A.x, A.y, 'R', `Rca=${Lab.fmt(Rca,1)}Ω`);
  drawTerminal(ctx, A, 'A', 0, -14); drawTerminal(ctx, B, 'B', -16, 8); drawTerminal(ctx, C, 'C', 16, 8);
}
function drawStarDeltaScene(ctx, W, H) {
  const sd = computeStarDelta();
  ctx.textAlign = 'left';
  ctx.fillStyle = T.accent; ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.fillText('Trasformazione stella-triangolo (Y-Δ)', 14, 20);
  ctx.fillStyle = T.txt; ctx.font = '10px "Space Mono",monospace';
  ctx.fillText(`Ra=${sd.Ra}Ω Rb=${sd.Rb}Ω Rc=${sd.Rc}Ω  →  Rab=${Lab.fmt(sd.Rab,1)}Ω Rbc=${Lab.fmt(sd.Rbc,1)}Ω Rca=${Lab.fmt(sd.Rca,1)}Ω`, 14, 36);

  const cy = H * 0.54, R = Math.min(W * 0.16, H * 0.26), cxL = W * 0.26, cxR = W * 0.74;
  drawStarPanel(ctx, cxL, cy, R, sd.Ra, sd.Rb, sd.Rc);
  drawDeltaPanel(ctx, cxR, cy, R, sd.Rab, sd.Rbc, sd.Rca);
  ctx.strokeStyle = T.grid; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(W * 0.5, 55); ctx.lineTo(W * 0.5, H - 65); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = T.sub; ctx.font = '18px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText('⇄', W * 0.5, cy + 6);
  ctx.font = '11px "Space Mono",monospace';
  ctx.fillText('stella (Y)', cxL, cy - R - 30);
  ctx.fillText('triangolo (Δ)', cxR, cy - R - 30);

  ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText('due reti equivalenti viste dai tre morsetti A,B,C: qualunque tensione o corrente esterna è identica per entrambe', W / 2, H - 8);
}

// ═══ Disegno: ponte di Wheatstone ═══════════════════════════════════════════════════
function drawWheatstoneScene(ctx, W, H) {
  const wb = computeWheatstone();
  ctx.textAlign = 'left';
  ctx.fillStyle = T.accent; ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.fillText('Ponte di Wheatstone', 14, 20);
  ctx.fillStyle = T.txt; ctx.font = '10px "Space Mono",monospace';
  ctx.fillText(`I_g=${Lab.fmt((wb.Ig * 1000),3)} mA   V₀=${P.v0} V   ${wb.balanced ? 'ponte bilanciato' : 'ponte sbilanciato'}`, 14, 36);

  const cx = W * 0.42, cy = H * 0.54, Rd = Math.min(W * 0.16, H * 0.3);
  const A = { x: cx, y: cy - Rd }, D = { x: cx, y: cy + Rd }, B = { x: cx - Rd * 0.95, y: cy }, C = { x: cx + Rd * 0.95, y: cy };
  drawElementSymbol(ctx, A.x, A.y, B.x, B.y, 'R', `R₁=${wb.R1}Ω`);
  drawElementSymbol(ctx, B.x, B.y, D.x, D.y, 'R', `R₂=${wb.R2}Ω`);
  drawElementSymbol(ctx, A.x, A.y, C.x, C.y, 'R', `R₃=${wb.R3}Ω`);
  drawElementSymbol(ctx, C.x, C.y, D.x, D.y, 'R', `R₄=${wb.R4}Ω`);
  drawElementSymbol(ctx, B.x, B.y, C.x, C.y, 'R', `Rg=${wb.Rg}Ω`);
  const gx = (B.x + C.x) / 2, gy = (B.y + C.y) / 2;
  ctx.fillStyle = T.bg; ctx.strokeStyle = T.wire; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(gx, gy, 11, 0, TWO); ctx.fill(); ctx.stroke();
  ctx.fillStyle = wb.balanced ? '#7fe0a0' : '#ff9d4d';
  ctx.font = 'bold 11px "Space Mono",monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('G', gx, gy + 0.5); ctx.textBaseline = 'alphabetic';

  // il ramo del generatore deve restare ben fuori dal rombo (a sinistra del vertice B), altrimenti
  // il tratto verticale del filo attraversa i lati R1/R2 del ponte
  const batX = B.x - 65;
  drawWire(ctx, batX, cy - 40, batX, A.y); drawWire(ctx, batX, A.y, A.x, A.y);
  drawWire(ctx, batX, cy + 40, batX, D.y); drawWire(ctx, batX, D.y, D.x, D.y);
  drawBatterySymbol(ctx, batX, cy, 80);
  drawTerminal(ctx, A, 'A', 0, -14); drawTerminal(ctx, D, 'D', 0, 16);
  drawTerminal(ctx, B, 'B', -14, -10); drawTerminal(ctx, C, 'C', 14, -10);

  const px0 = W - 300;
  ctx.strokeStyle = T.grid; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(px0 - 25, 55); ctx.lineTo(px0 - 25, H - 65); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = T.txt; ctx.font = '11px "Space Mono",monospace'; ctx.textAlign = 'left';
  ctx.fillText(`R₁/R₂ = ${Lab.fmt(wb.balanceRatioLeft,3)}`, px0, cy - 40);
  ctx.fillText(`R₃/R₄ = ${Lab.fmt(wb.balanceRatioRight,3)}`, px0, cy - 20);
  ctx.fillStyle = wb.balanced ? '#7fe0a0' : '#ff9d4d';
  ctx.font = 'bold 13px "Space Mono",monospace';
  ctx.fillText(wb.balanced ? '✓ ponte bilanciato' : '✗ ponte sbilanciato', px0, cy + 10);
  ctx.fillStyle = T.txt; ctx.font = '10px "Space Mono",monospace';
  ctx.fillText(`I_g = ${Lab.fmt((wb.Ig * 1000),3)} mA`, px0, cy + 34);
  ctx.fillText(`V_th = V_B−V_C = ${Lab.fmt(wb.Vth,3)} V`, px0, cy + 52);

  ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText('il ponte è bilanciato (I_g=0) quando R₁/R₂ = R₃/R₄, indipendentemente dal valore di Rg', W / 2, H - 8);
}

function draw(canvas) {
  const [ctx, W, H] = Lab.ctx2d(canvas);
  T = pal();
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  if (P.config === 'star-delta') drawStarDeltaScene(ctx, W, H);
  else if (P.config === 'wheatstone') drawWheatstoneScene(ctx, W, H);
  else drawSeriesParallelScene(ctx, W, H);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
// istogramma con asse dei valori numerato (il fondo scala è un valore "tondo" sopra il massimo)
function drawBars(i, title, values, colors, labels) {
  const max = Lab.niceMax(Math.max(...values.map(Math.abs), 1e-9) * 1.1);
  const g = Lab.panel(gCanvas[i], { title, xr: [0, values.length], xStep: 1e9, xFmt: () => '', yr: [0, max] });
  if (!g) return; const [ctx, f] = g;
  const gap = (f.R - f.L) / values.length, bw = gap * 0.6;
  values.forEach((v, k) => {
    const x = f.L + k * gap + (gap - bw) / 2, y = f.Y(Math.max(0, v));
    ctx.fillStyle = colors[k]; ctx.fillRect(x, y, bw, f.B - y);
    ctx.font = '9.5px "Space Mono",monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = f.C.text; ctx.fillText(labels[k], x + bw / 2, f.B + 10);
    ctx.fillStyle = f.C.title; ctx.fillText(Lab.sci(v, 3), x + bw / 2, y - 7);
  });
}
const BAR = 'rgba(0,212,255,0.75)';
// 1: valori dei singoli elementi confrontati con il valore equivalente
function drawGraphValues() {
  const vals = P.values.slice(0, P.n), eq = computeEquivalent();
  drawBars(0, `Valori ed equivalente (${P.elemType === 'R' ? 'Ω' : 'µF'})`, vals.concat([eq]),
    vals.map(() => BAR).concat(['#ff9d4d']), vals.map((_, i) => sub(i + 1)).concat(['eq']));
}
// 2: grandezza che varia da elemento a elemento (V per la serie di R, I per il parallelo di R, ecc.)
function drawGraphDistribution() {
  const dist = computeDistribution(), d0 = dist[0] || { varLabel: '', varUnit: '' };
  drawBars(1, `${d0.varLabel} su ogni elemento (${d0.varUnit})`, dist.map(d => d.varying), dist.map(() => '#7fe0a0'), dist.map((_, i) => sub(i + 1)));
}
// 3: come cambierebbe l'equivalente al variare di N, per N elementi tutti uguali al valore medio
// attuale — R serie ∝ N, R parallelo ∝ 1/N, C serie ∝ 1/N, C parallelo ∝ N (duali)
function drawGraphTrend() {
  const vals = P.values.slice(0, P.n), vbar = vals.reduce((a, b) => a + b, 0) / vals.length;
  const NMAX = 12;
  const eqOf = k => {
    if (P.elemType === 'R') return P.config === 'series' ? vbar * k : vbar / k;
    return P.config === 'series' ? vbar / k : vbar * k;
  };
  const pts = []; for (let k = 1; k <= NMAX; k++) pts.push([k, eqOf(k)]);
  const max = Lab.niceMax(Math.max(...pts.map(p => p[1])) * 1.05);
  const g = Lab.panel(gCanvas[2], { title: `Equivalente di N elementi uguali alla media (${P.elemType === 'R' ? 'Ω' : 'µF'})`, xr: [1, NMAX], xStep: 1, yr: [0, max], xLabel: 'N' });
  if (!g) return; const [ctx, f] = g;
  Lab.plotPts(ctx, f, pts, f.C.accent, 2);
  for (const [k, v] of pts) Lab.dot(ctx, f, k, v, f.C.accent, 2.2);
  Lab.dot(ctx, f, P.n, eqOf(P.n), '#ff9d4d', 4.5);
}
// grafici: stella-triangolo
function drawGraphStarDeltaLine() {
  const g = Lab.panel(gCanvas[2], { title: 'Con Ra = Rb = Rc = R: Rab = Rbc = Rca = 3R', xr: [0, 1000], yr: [0, 3000], xLabel: 'R (Ω)' });
  if (!g) return; const [ctx, f] = g;
  Lab.plot(ctx, f, x => 3 * x, [0, 1000], f.C.accent, 2);
  const sd = computeStarDelta(), vbar = (sd.Ra + sd.Rb + sd.Rc) / 3;
  Lab.dot(ctx, f, vbar, 3 * vbar, '#ff9d4d', 4);
}
function drawGraphsStarDelta() {
  const sd = computeStarDelta();
  drawBars(0, 'Resistenze della stella (Ω)', [sd.Ra, sd.Rb, sd.Rc], [BAR, BAR, BAR], ['Ra', 'Rb', 'Rc']);
  drawBars(1, 'Resistenze del triangolo equivalente (Ω)', [sd.Rab, sd.Rbc, sd.Rca], ['#ff9d4d', '#ff9d4d', '#ff9d4d'], ['Rab', 'Rbc', 'Rca']);
  drawGraphStarDeltaLine();
}
// grafici: ponte di Wheatstone
function drawGraphWheatstoneSweep(wb) {
  const R4max = Lab.niceMax(Math.max(wb.R4 * 3, 100));
  const igOf = R4 => {
    const Vb = P.v0 * wb.R2 / (wb.R1 + wb.R2), Vc = P.v0 * R4 / (wb.R3 + R4);
    const Rth = (wb.R1 * wb.R2) / (wb.R1 + wb.R2) + (wb.R3 * R4) / (wb.R3 + R4);
    return (Vb - Vc) / (Rth + wb.Rg) * 1e3;      // mA
  };
  let maxAbs = 1e-9; for (let i = 0; i <= 100; i++) maxAbs = Math.max(maxAbs, Math.abs(igOf(i / 100 * R4max)));
  const m = Lab.niceMax(maxAbs);
  const g = Lab.panel(gCanvas[1], { title: 'Corrente nel galvanometro I_g (mA) al variare di R₄', xr: [0, R4max], yr: [-m, m], xLabel: 'R₄ (Ω)', yFmt: v => Lab.sci(v, 2) });
  if (!g) return; const [ctx, f] = g;
  Lab.plot(ctx, f, igOf, [0, R4max], f.C.accent, 2);
  Lab.dot(ctx, f, wb.R4, wb.Ig * 1e3, '#ff9d4d', 4);
  // R₄ di bilanciamento: R₄ = R₃·R₂/R₁
  const R4b = wb.R3 * wb.R2 / wb.R1;
  if (R4b <= R4max) { ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = f.C.green; ctx.beginPath(); ctx.moveTo(f.X(R4b), f.T); ctx.lineTo(f.X(R4b), f.B); ctx.stroke(); ctx.restore(); }
  Lab.legend(ctx, f.L + 8, f.T + 8, [[f.C.green, 'bilanciamento R₄ = R₂R₃/R₁', [3, 3]]]);
}
function drawGraphsWheatstone() {
  const wb = computeWheatstone();
  drawBars(0, 'Resistenze del ponte (Ω)', [wb.R1, wb.R2, wb.R3, wb.R4, wb.Rg], [BAR, BAR, BAR, BAR, '#c47fff'], ['R1', 'R2', 'R3', 'R4', 'Rg']);
  drawGraphWheatstoneSweep(wb);
  drawBars(2, 'Tensioni ai nodi del ponte (V)', [wb.Vb, wb.Vc], ['#7fe0a0', '#ff9d4d'], ['Vb', 'Vc']);
}
function drawGraphs() {
  if (P.config === 'star-delta') drawGraphsStarDelta();
  else if (P.config === 'wheatstone') drawGraphsWheatstone();
  else { drawGraphValues(); drawGraphDistribution(); drawGraphTrend(); }
}

// ═══ Passo di simulazione ═══════════════════════════════════════════════════
function step(dt) { animT += dt; }

// ═══ Controlli ════════════════════════════════════════════════════════════════
function rebuildValueSliders() {
  valuesContainer.innerHTML = '';
  const unit = P.elemType === 'R' ? ' Ω' : ' µF';
  const add = (label, idx) => {
    valuesContainer.appendChild(Lab.SliderInput({
      label, min: 1, max: 1000, step: 1, unit, value: P.values[idx],
      onChange(v) { P.values[idx] = v; },
    }).el);
  };
  if (P.config === 'star-delta') { ['Ra', 'Rb', 'Rc'].forEach((l, i) => add(l, i)); }
  else if (P.config === 'wheatstone') { ['R₁', 'R₂', 'R₃', 'R₄', 'Rg (galvanometro)'].forEach((l, i) => add(l, i)); }
  else { for (let i = 0; i < P.n; i++) add(`${P.elemType}${sub(i + 1)}`, i); }
}
function buildControls() {
  const cont = document.getElementById('controls'); cont.innerHTML = '';
  const net = isNetworkConfig();

  const st = Lab.Section('Tipo ed elementi'); cont.appendChild(st.el);
  if (!net) {
    st.add(Lab.RadioGroup({
      label: 'Elemento', value: P.elemType,
      options: [{ value: 'R', label: 'Resistori', hint: 'Ω' }, { value: 'C', label: 'Condensatori', hint: 'µF' }],
      onChange(v) { P.elemType = v; P.values = extendValues(v, [], P.n); rebuildValueSliders(); buildReadout(); },
    }));
  }
  st.add(Lab.RadioGroup({
    label: 'Configurazione', value: P.config,
    options: [
      { value: 'series', label: 'Serie' },
      { value: 'parallel', label: 'Parallelo' },
      { value: 'star-delta', label: 'Stella-Triangolo', hint: 'Y-Δ' },
      { value: 'wheatstone', label: 'Ponte di Wheatstone', hint: 'misura R' },
    ],
    onChange(v) {
      P.config = v;
      if (v === 'wheatstone') { P.elemType = 'R'; P.values = [100, 100, 100, 100, 50]; }
      else if (v === 'star-delta') { P.elemType = 'R'; P.values = extendValues('R', [], 3); }
      else { P.values = extendValues(P.elemType, P.values, P.n); }
      buildControls(); buildReadout();
    },
  }));

  if (!net) {
    const sn = Lab.Section('Numero di elementi'); cont.appendChild(sn.el);
    sn.add(Lab.SliderInput({
      label: 'N', min: N_MIN, max: N_MAX, step: 1, value: P.n,
      onChange(v) { v = Math.round(v); P.values = extendValues(P.elemType, P.values.slice(0, v), v); P.n = v; rebuildValueSliders(); },
    }));
  }

  const sv = Lab.Section(P.config === 'star-delta' ? 'Valori della stella' : P.config === 'wheatstone' ? 'Valori del ponte' : 'Valori degli elementi');
  cont.appendChild(sv.el);
  valuesContainer = document.createElement('div'); sv.el.appendChild(valuesContainer);
  rebuildValueSliders();

  const sa = Lab.Section('Alimentazione'); cont.appendChild(sa.el);
  sa.add(Lab.SliderInput({ label: 'Tensione applicata', min: 1, max: 24, step: 0.5, value: P.v0, unit: ' V', onChange(v) { P.v0 = v; } }));
}

function buildReadout() {
  const cont = document.getElementById('readout'); cont.innerHTML = '';
  if (P.config === 'star-delta') {
    readout = new Lab.Readout(cont, [
      { key: 'ra', label: 'Ra (stella)' }, { key: 'rb', label: 'Rb (stella)' }, { key: 'rc', label: 'Rc (stella)' },
      { key: 'rab', label: 'Rab (triangolo)' }, { key: 'rbc', label: 'Rbc (triangolo)' }, { key: 'rca', label: 'Rca (triangolo)' },
    ]);
  } else if (P.config === 'wheatstone') {
    readout = new Lab.Readout(cont, [
      { key: 'rth', label: 'Resistenza Thevenin' }, { key: 'vth', label: 'Tensione Thevenin' },
      { key: 'ig', label: 'Corrente galvanometro' }, { key: 'stato', label: 'Stato del ponte' },
      { key: 'r1r2', label: 'R1/R2' }, { key: 'r3r4', label: 'R3/R4' },
    ]);
  } else {
    readout = new Lab.Readout(cont, [
      { key: 'tipo', label: 'Elemento' }, { key: 'config', label: 'Configurazione' }, { key: 'n', label: 'Numero N' },
      { key: 'eq', label: 'Valore equivalente' }, { key: 'v0', label: 'Tensione applicata' },
      { key: 'tot', label: P.elemType === 'R' ? 'Corrente totale' : 'Carica totale' },
    ]);
  }
}

function initGraphs(){
  // riga di grafici standard (Lab.graphPanels); i titoli sono disegnati dentro i grafici
  gCanvas = Lab.graphPanels(document.getElementById('graphArea'), 3);
  gCtx = gCanvas.map(c => c.getContext('2d'));
  gTitle = gCanvas.map(() => ({ textContent: '' }));
}

// ═══ Init ═════════════════════════════════════════════════════════════════════
function init() {
  Lab.initTheme();
  P.values = extendValues(P.elemType, [], P.n);
  buildControls(); initGraphs(); buildReadout(); newRun();
  const simCanvas = document.getElementById('simCanvas');
  const btnPlay = document.getElementById('btnPlay');
  function syncPlay() { btnPlay.textContent = P.paused ? '▶  AVVIA' : '⏸  PAUSA'; }
  syncPlay();
  btnPlay.addEventListener('click', () => { P.paused = !P.paused; syncPlay(); });
  document.getElementById('btnReset').addEventListener('click', () => {
    P.elemType = 'R'; P.config = 'series'; P.n = 3; P.values = extendValues('R', [], 3); P.v0 = 9; P.paused = false;
    buildControls(); buildReadout(); newRun(); syncPlay();
  });

  function resize() {
    const area = document.querySelector('.lab-canvas-area'); if (!area) return;
    const ar = area.getBoundingClientRect();
    const rb = document.getElementById('readout').getBoundingClientRect();
    const ga = document.getElementById('graphArea'); const gaH = ga ? ga.offsetHeight : 0;
    const h = Math.max(240, Math.floor(ar.height - rb.height - gaH - 4));
    simCanvas.style.width = Math.floor(ar.width) + 'px'; simCanvas.style.height = h + 'px';
    Lab.hidpi(simCanvas, Math.floor(ar.width), h);
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
    if (!P.paused) step(dt);
    try {
      draw(simCanvas); drawGraphs();
      if (P.config === 'star-delta') {
        const sd = computeStarDelta();
        readout.set('ra', Lab.fmt(sd.Ra,1) + ' Ω'); readout.set('rb', Lab.fmt(sd.Rb,1) + ' Ω'); readout.set('rc', Lab.fmt(sd.Rc,1) + ' Ω');
        readout.set('rab', Lab.fmt(sd.Rab,1) + ' Ω'); readout.set('rbc', Lab.fmt(sd.Rbc,1) + ' Ω'); readout.set('rca', Lab.fmt(sd.Rca,1) + ' Ω');
      } else if (P.config === 'wheatstone') {
        const wb = computeWheatstone();
        readout.set('rth', Lab.fmt(wb.Rth,2) + ' Ω'); readout.set('vth', Lab.fmt(wb.Vth,3) + ' V');
        readout.set('ig', Lab.fmt((wb.Ig * 1000),3) + ' mA'); readout.set('stato', wb.balanced ? 'bilanciato' : 'sbilanciato');
        readout.set('r1r2', Lab.fmt(wb.balanceRatioLeft,3)); readout.set('r3r4', Lab.fmt(wb.balanceRatioRight,3));
      } else {
        const unit = P.elemType === 'R' ? ' Ω' : ' µF';
        readout.set('tipo', P.elemType === 'R' ? 'Resistori' : 'Condensatori');
        readout.set('config', P.config === 'series' ? 'Serie' : 'Parallelo');
        readout.set('n', String(P.n));
        readout.set('eq', Lab.fmt(computeEquivalent(),2) + unit);
        readout.set('v0', Lab.fmt(P.v0,1) + ' V');
        const tot = computeTotal();
        readout.set('tot', P.elemType === 'R' ? Lab.fmt((tot * 1000),1) + ' mA' : Lab.fmt(tot,2) + ' µC');
      }
    } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
