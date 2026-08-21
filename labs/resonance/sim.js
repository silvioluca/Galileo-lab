'use strict';

// ═══ Costanti (domini FISSI: non riscalare mai in base ai parametri correnti,
//     altrimenti l'effetto di ampiezza/smorzamento/frequenza sparisce) ═════════
const TWO = Math.PI * 2;
const COL = ['#00d4ff', '#ff9d4d'];
const X_MAX = 1.6;                                    // m, scala di spostamento fissa (canvas + grafico x(t))
const WIN_T = 16;                                      // s, finestra temporale fissa del grafico x(t)
const OMEGA_MIN = 0.2, OMEGA_MAX = 10;                 // rad/s, dominio fisso di ω per i grafici A(ω), φ(ω)
const A_GRAPH_MAX = 6;                                  // m, scala fissa dell'asse A nel grafico di risonanza
const X_COLLAPSE = 1.8;                                 // m, deflessione a centro campata oltre cui l'impalcato collassa e la simulazione si ferma

const P = {
  mode: 'molla',                                        // 'molla' | 'ponte' (Tacoma Narrows)
  m: 1.0, k: 16, c: 0.6,                                // oscillatore: massa, costante elastica, smorzamento
  F0: 3.0, omega: 2.0,                                  // forzante: ampiezza, pulsazione (il controllo di "sweep")
  compare: false, c2: 2.2,                              // secondo smorzamento per il confronto (stesso m,k,F0,ω → stesso ω₀)
  showAnnot: true,
  speed: 1.0,
  paused: false,
};

let x1 = 0, v1 = 0, x2 = 0, v2 = 0, tSim = 0, last = 0;
let hist1 = [], hist2 = [];
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
    wall:   d ? 'rgba(0,212,255,0.55)' : 'rgba(0,100,160,0.65)',
    force:  d ? '#ffb400' : '#a05f00',
    grid:   d ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)',
    gBg:    d ? 'rgb(3,9,22)' : '#eef2f7',
    gAxis:  d ? 'rgba(100,155,210,0.3)' : 'rgba(40,80,130,0.32)',
    gText:  d ? 'rgba(150,205,225,0.88)' : 'rgba(25,65,105,0.92)',
  };
}
let T = pal();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function fmt(x, u) { return (Math.abs(x) < 10 ? x.toFixed(2) : x.toFixed(1)) + (u || ''); }

// ═══ Fisica ═══════════════════════════════════════════════════════════════════
// m·x'' + c·x' + k·x = F0·cos(ωt)
function omega0(m, k) { return Math.sqrt(k / m); }
function zetaOf(m, k, c) { return c / (2 * Math.sqrt(k * m)); }
function Qof(m, k, c) { const z = zetaOf(m, k, c); return z > 1e-9 ? 1 / (2 * z) : Infinity; }
function accel(x, v, t, m, k, c, F0, w) { return (F0 * Math.cos(w * t) - c * v - k * x) / m; }
function rk4(x, v, t, dt, m, k, c, F0, w) {
  const f = (xx, vv, tt) => [vv, accel(xx, vv, tt, m, k, c, F0, w)];
  const [k1x, k1v] = f(x, v, t);
  const [k2x, k2v] = f(x + k1x * dt / 2, v + k1v * dt / 2, t + dt / 2);
  const [k3x, k3v] = f(x + k2x * dt / 2, v + k2v * dt / 2, t + dt / 2);
  const [k4x, k4v] = f(x + k3x * dt, v + k3v * dt, t + dt);
  return { x: x + dt / 6 * (k1x + 2 * k2x + 2 * k3x + k4x), v: v + dt / 6 * (k1v + 2 * k2v + 2 * k3v + k4v) };
}
// ampiezza e fase della risposta stazionaria (formule analitiche, dipendono solo dai parametri correnti)
function AofOmega(m, k, c, F0, w) { const w0 = omega0(m, k); return (F0 / m) / Math.sqrt((w0 * w0 - w * w) ** 2 + (c / m * w) ** 2); }
function phiOfOmega(m, k, c, w) { const w0 = omega0(m, k); return Math.atan2(c / m * w, w0 * w0 - w * w); }

function trimHist(h) { const tMin = tSim - WIN_T - 1; while (h.length && h[0].t < tMin) h.shift(); }
function step(dt) {
  const nSub = clamp(Math.round(dt * 120), 1, 12), h = dt / nSub;
  let t = tSim;
  for (let s = 0; s < nSub; s++) {
    const r1 = rk4(x1, v1, t, h, P.m, P.k, P.c, P.F0, P.omega); x1 = r1.x; v1 = r1.v;
    if (P.compare) { const r2 = rk4(x2, v2, t, h, P.m, P.k, P.c2, P.F0, P.omega); x2 = r2.x; v2 = r2.v; }
    t += h;
  }
  tSim = t;
  hist1.push({ t: tSim, x: x1 }); trimHist(hist1);
  if (P.compare) { hist2.push({ t: tSim, x: x2 }); trimHist(hist2); } else hist2.length = 0;
}
function reset() {
  x1 = 0; v1 = 0; x2 = 0; v2 = 0; tSim = 0; hist1 = []; hist2 = [];
}

// ═══ Rendering ════════════════════════════════════════════════════════════════
function drawGrid(ctx, W, H) {
  ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}
function drawSpringH(ctx, xa, xb, y, coils, amp) {
  const len = xb - xa;
  if (len < 16) { ctx.beginPath(); ctx.moveTo(xa, y); ctx.lineTo(xb, y); ctx.stroke(); return; }
  const capLen = Math.min(len * 0.08, 12), steps = coils * 16;
  ctx.beginPath(); ctx.moveTo(xa, y); ctx.lineTo(xa + capLen, y);
  const usable = len - 2 * capLen;
  for (let i = 0; i <= steps; i++) { const t = i / steps; ctx.lineTo((xa + capLen) + t * usable, y + amp * Math.sin(t * coils * TWO)); }
  ctx.lineTo(xb, y); ctx.stroke();
}
function drawArrow(ctx, x0, y0, x1, y1, col, lw) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy); if (len < 3) return;
  const ux = dx / len, uy = dy / len, hl = Math.min(10, len * 0.4);
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - ux * hl, y1 - uy * hl); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - ux * hl - uy * hl * 0.5, y1 - uy * hl + ux * hl * 0.5);
  ctx.lineTo(x1 - ux * hl + uy * hl * 0.5, y1 - uy * hl - ux * hl * 0.5);
  ctx.closePath(); ctx.fill();
}

function drawOscRow(ctx, W, y, rowH, xval, cVal, col, label) {
  const marginL = 34;
  const restPx = clamp(W * 0.15, 150, 260);
  const wallX = marginL, eqX = wallX + restPx;
  const massH = clamp(rowH * 0.62, 60, 170), massW = massH * 1.15;
  // mappatura morbida (tanh): lineare (proporzionale ad x) per spostamenti tipici, satura in modo
  // asintotico per valori estremi — non esce MAI dal riquadro e non scatta mai a un valore fisso
  // (niente "muro invisibile", niente "si blocca tornando alla posizione iniziale")
  const X_VIS = X_MAX * 1.6;
  const leftRoom = restPx - massW / 2 - 14, rightRoom = (W - eqX) - massW / 2 - 30;
  const pxPerM = clamp(Math.min(leftRoom, rightRoom) / X_VIS, 20, 150);
  const massX = eqX + X_VIS * pxPerM * Math.tanh(xval / X_VIS);
  const wallH = rowH * 0.92;

  // parete
  ctx.fillStyle = T.wall; ctx.fillRect(wallX - 12, y - wallH / 2, 12, wallH);
  ctx.strokeStyle = T.ring; ctx.lineWidth = 1.4;
  for (let i = 0; i < 7; i++) { const hy = y - wallH / 2 + 8 + i * (wallH - 16) / 6;
    ctx.beginPath(); ctx.moveTo(wallX - 12, hy); ctx.lineTo(wallX - 26, hy + 11); ctx.stroke(); }

  // molla
  ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.lineJoin = 'round';
  drawSpringH(ctx, wallX, massX - massW / 2, y, 8, clamp(massH * 0.24, 12, 20));

  // massa
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.32)'; ctx.shadowBlur = 9; ctx.shadowOffsetY = 3;
  ctx.fillStyle = dk() ? '#0e2236' : '#2c65b0';
  ctx.fillRect(massX - massW / 2, y - massH / 2, massW, massH);
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.strokeStyle = col; ctx.lineWidth = 2.2;
  ctx.strokeRect(massX - massW / 2, y - massH / 2, massW, massH);
  ctx.restore();

  // forza applicata F(t) = F0 cos(ωt)
  const Ft = P.F0 * Math.cos(P.omega * tSim);
  const fPx = clamp(Ft * 12, -100, 100);
  drawArrow(ctx, massX, y - massH / 2 - 18, massX + fPx, y - massH / 2 - 18, T.force, 3);

  // linea di equilibrio
  ctx.strokeStyle = 'rgba(150,175,205,0.3)'; ctx.setLineDash([4, 5]); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(eqX, y - massH / 2 - 26); ctx.lineTo(eqX, y + massH / 2 + 26); ctx.stroke();
  ctx.setLineDash([]);

  // etichetta
  ctx.fillStyle = col; ctx.font = `bold ${clamp(rowH * 0.09, 12, 16)}px "Space Mono",monospace`; ctx.textAlign = 'left';
  ctx.fillText(label, wallX, y - rowH / 2 - 8);
  ctx.fillStyle = T.sub; ctx.font = '11px "Space Mono",monospace';
  ctx.fillText(`c=${cVal.toFixed(2)} kg/s   x=${xval.toFixed(3)} m`, wallX, y + rowH / 2 + 16);
}

// ── modalità Ponte: interpreta x(t) come deflessione verticale a centro campata di un
// impalcato flessibile, incernierato (nodo fisso, spostamento nullo) a entrambe le
// estremità — il primo modo di vibrazione di una trave appoggiata-appoggiata,
// forma(u) = sin(π·(u+L/2)/L), che vale 0 ai due estremi e 1 al centro. ──
function sevColor(sev) {
  if (sev < 0.55) return null;
  const t = clamp((sev - 0.55) / 0.75, 0, 1);
  const a = [255, 180, 0], b = [255, 71, 87];
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}
const beamShape = (u, halfLen) => Math.sin(Math.PI * (u + halfLen) / (2 * halfLen));
// torre reticolare a due montanti con controventi a X e sella per il cavo in cima
function drawTower(ctx, txCenter, topY, botY, ringCol) {
  const legOff = 15, xA = txCenter - legOff / 2, xB = txCenter + legOff / 2, n = 5;
  ctx.strokeStyle = ringCol;
  ctx.lineWidth = 3.4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(xA, botY); ctx.lineTo(xA, topY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(xB, botY); ctx.lineTo(xB, topY); ctx.stroke();
  ctx.lineCap = 'butt'; ctx.lineWidth = 1.3;
  for (let i = 0; i <= n; i++) {
    const ty = botY + (topY - botY) * i / n;
    ctx.beginPath(); ctx.moveTo(xA, ty); ctx.lineTo(xB, ty); ctx.stroke();
    if (i < n) {
      const ty2 = botY + (topY - botY) * (i + 1) / n;
      ctx.beginPath(); ctx.moveTo(xA, ty); ctx.lineTo(xB, ty2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(xB, ty); ctx.lineTo(xA, ty2); ctx.stroke();
    }
  }
  ctx.fillStyle = ringCol; ctx.fillRect(txCenter - 9, topY - 3, 18, 5);
}
const bez2 = (t, p0, p1, p2, k) => (1 - t) ** 2 * p0[k] + 2 * (1 - t) * t * p1[k] + t ** 2 * p2[k];

function drawBridgeRow(ctx, W, y, rowH, xval, cVal, col, label) {
  const deckLen = clamp(W * 0.56, 220, 640), halfLen = deckLen / 2;
  const cx = W / 2;
  const towerX1 = cx - halfLen - 44, towerX2 = cx + halfLen + 44;
  const towerH = rowH * 0.9, towerTopY = y - towerH * 0.56, towerBotY = y + towerH * 0.4;
  const deckThick = clamp(rowH * 0.11, 12, 24);
  // scala di deflessione FISSA (non dipende dall'ampiezza corrente, altrimenti l'effetto sparisce):
  // a xval = X_COLLAPSE il centro campata arriva a ~0.36·rowH, un rigonfiamento vistoso ma contenuto
  const pxPerM = clamp((rowH * 0.36) / X_COLLAPSE, 20, 140);
  const sev = Math.abs(xval) / X_COLLAPSE;
  const deckCol = sevColor(sev) || col;
  const bendY = u => y - xval * pxPerM * beamShape(u, halfLen);

  // acqua (base scena, con un leggero moto ondoso)
  ctx.strokeStyle = 'rgba(100,155,210,0.22)'; ctx.lineWidth = 1;
  for (let r = 0; r < 3; r++) {
    const wy = towerBotY + 10 + r * 9;
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) { const px = towerX1 - 30 + (towerX2 - towerX1 + 60) * i / 40, py = wy + Math.sin(i * 0.8 + r + tSim * 0.6) * 1.6;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.stroke();
  }

  // ancoraggi a terra (il cavo principale prosegue oltre le torri fino al blocco d'ancoraggio)
  ctx.strokeStyle = 'rgba(150,175,205,0.3)'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(towerX1, towerTopY); ctx.lineTo(towerX1 - 34, towerBotY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(towerX2, towerTopY); ctx.lineTo(towerX2 + 34, towerBotY); ctx.stroke();
  ctx.fillStyle = 'rgba(150,175,205,0.3)';
  ctx.fillRect(towerX1 - 42, towerBotY - 5, 20, 10); ctx.fillRect(towerX2 + 22, towerBotY - 5, 20, 10);

  // torri reticolari
  drawTower(ctx, towerX1, towerTopY, towerBotY, T.ring);
  drawTower(ctx, towerX2, towerTopY, towerBotY, T.ring);

  // cavo di sospensione principale (catenaria, statico)
  const cableCtrl = [cx, y - towerH * 0.06];
  const p0 = [towerX1, towerTopY], p1 = cableCtrl, p2 = [towerX2, towerTopY];
  ctx.strokeStyle = 'rgba(150,175,205,0.4)'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.quadraticCurveTo(p1[0], p1[1], p2[0], p2[1]); ctx.stroke();

  // pendini: dal cavo principale ai punti dell'impalcato che si flette (si accorciano/allungano
  // in modo alternato lungo la campata, come nei filmati reali del Tacoma Narrows)
  const NH = 13;
  ctx.strokeStyle = 'rgba(150,175,205,0.45)'; ctx.lineWidth = 1;
  for (let i = 0; i < NH; i++) {
    const t = i / (NH - 1), u = -halfLen + t * deckLen;
    const cxp = bez2(t, p0, p1, p2, 0), cyp = bez2(t, p0, p1, p2, 1);
    ctx.beginPath(); ctx.moveTo(cxp, cyp); ctx.lineTo(cx + u, bendY(u)); ctx.stroke();
  }

  // impalcato: trave flessibile incernierata (nodo, spostamento nullo) alle due estremità
  const N = 32, topPts = [], botPts = [], midPts = [];
  for (let i = 0; i <= N; i++) {
    const u = -halfLen + i / N * deckLen, wy = bendY(u);
    midPts.push({ x: cx + u, y: wy });
    topPts.push({ x: cx + u, y: wy - deckThick / 2 });
    botPts.push({ x: cx + u, y: wy + deckThick / 2 });
  }
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.32)'; ctx.shadowBlur = 9; ctx.shadowOffsetY = 3;
  ctx.fillStyle = dk() ? '#0e2236' : '#2c65b0';
  ctx.beginPath();
  topPts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  for (let i = botPts.length - 1; i >= 0; i--) ctx.lineTo(botPts[i].x, botPts[i].y);
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.strokeStyle = deckCol; ctx.lineWidth = 2.4; ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
  // correnti (flange) della trave
  ctx.strokeStyle = 'rgba(150,175,205,0.4)'; ctx.lineWidth = 1;
  ctx.beginPath(); topPts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y + 3) : ctx.moveTo(p.x, p.y + 3)); ctx.stroke();
  ctx.beginPath(); botPts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y - 3) : ctx.moveTo(p.x, p.y - 3)); ctx.stroke();
  // linea di mezzeria carreggiata
  ctx.strokeStyle = 'rgba(255,210,70,0.5)'; ctx.lineWidth = 1.3; ctx.setLineDash([9, 7]);
  ctx.beginPath(); midPts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
  ctx.setLineDash([]);

  // nodi (cerniere fisse) alle due estremità dell'impalcato
  [midPts[0], midPts[N]].forEach(p => {
    ctx.fillStyle = T.ring; ctx.beginPath(); ctx.arc(p.x, p.y, 5.5, 0, TWO); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.stroke();
  });

  // forza applicata F(t) = F0 cos(ωt), verticale, sopra il centro campata
  const Ft = P.F0 * Math.cos(P.omega * tSim);
  const fPy = clamp(Ft * 10, -40, 40);
  const farY = towerTopY - 22;
  drawArrow(ctx, cx, farY, cx, farY + fPy, T.force, 3);

  // avviso / arresto per collasso
  if (sev >= 1) {
    ctx.fillStyle = 'rgba(255,71,87,1)';
    ctx.font = `bold ${clamp(rowH * 0.09, 12, 16)}px "Space Mono",monospace`; ctx.textAlign = 'center';
    ctx.fillText('COLLASSO STRUTTURALE — SIMULAZIONE FERMATA', cx, farY - 16);
  } else if (sev >= 0.7) {
    const alpha = 0.55 + 0.45 * Math.sin(tSim * 8);
    ctx.fillStyle = `rgba(255,71,87,${alpha.toFixed(2)})`;
    ctx.font = `bold ${clamp(rowH * 0.09, 12, 16)}px "Space Mono",monospace`; ctx.textAlign = 'center';
    ctx.fillText('RISCHIO DI COLLASSO STRUTTURALE', cx, farY - 16);
  }

  // etichetta
  ctx.fillStyle = col; ctx.font = `bold ${clamp(rowH * 0.09, 12, 16)}px "Space Mono",monospace`; ctx.textAlign = 'left';
  ctx.fillText(label, 14, y - rowH / 2 - 8);
  ctx.fillStyle = T.sub; ctx.font = '11px "Space Mono",monospace';
  ctx.fillText(`c=${cVal.toFixed(2)} kg/s   x=${xval.toFixed(3)} m`, 14, y + rowH / 2 + 16);
}

function drawRow(ctx, W, y, rowH, xval, cVal, col, label) {
  if (P.mode === 'ponte') drawBridgeRow(ctx, W, y, rowH, xval, cVal, col, label);
  else drawOscRow(ctx, W, y, rowH, xval, cVal, col, label);
}

function draw(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  T = pal();
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
  drawGrid(ctx, W, H);

  ctx.save();
  ctx.beginPath(); ctx.rect(0, 56, W, H - 90); ctx.clip();
  if (P.compare) {
    drawRow(ctx, W, H * 0.25, H * 0.26, x1, P.c, COL[0], 'OSCILLATORE 1');
    drawRow(ctx, W, H * 0.77, H * 0.26, x2, P.c2, COL[1], 'OSCILLATORE 2 (confronto)');
  } else {
    drawRow(ctx, W, H * 0.5, H * 0.5, x1, P.c, COL[0], 'OSCILLATORE');
  }
  ctx.restore();

  // intestazione
  const w0 = omega0(P.m, P.k), Q = Qof(P.m, P.k, P.c);
  ctx.textAlign = 'left';
  ctx.fillStyle = T.accent; ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.fillText("Risonanza — m·x'' + c·x' + k·x = F₀·cos(ωt)", 14, 22);
  ctx.fillStyle = T.txt; ctx.font = '10px "Space Mono",monospace';
  ctx.fillText(`m=${P.m.toFixed(2)} kg   k=${P.k.toFixed(1)} N/m   F₀=${P.F0.toFixed(2)} N   ω=${P.omega.toFixed(2)} rad/s   ω₀=${w0.toFixed(2)} rad/s   Q₁=${Number.isFinite(Q) ? Q.toFixed(1) : '∞'}`, 14, 40);

  ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText(P.mode === 'ponte'
    ? 'regola ω per avvicinarti a ω₀: l\'impalcato oscilla sempre più forte fino al collasso — la simulazione si ferma da sola quando si rompe'
    : 'regola ω (pulsazione forzante) per avvicinarti a ω₀ e osserva l\'ampiezza crescere', W / 2, H - 8);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
function gBase(ctx, W, H, PAD) {
  ctx.fillStyle = T.gBg; ctx.fillRect(0, 0, W, H);
  const gW = W - PAD.l - PAD.r, gH = H - PAD.t - PAD.b;
  ctx.strokeStyle = T.gAxis; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(PAD.l, PAD.t); ctx.lineTo(PAD.l, PAD.t + gH); ctx.lineTo(PAD.l + gW, PAD.t + gH); ctx.stroke();
  return { gW, gH };
}

// 1: x(t) — transitorio (scala FISSA: ±X_MAX*1.3, finestra FISSA WIN_T)
function drawXt() {
  const cv = gCanvas[0]; if (!cv || !cv.width) return;
  const ctx = gCtx[0], W = cv.width, H = cv.height, PAD = { t: 14, b: 16, l: 24, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const zero = PAD.t + gH / 2, yCap = X_MAX * 1.3;
  ctx.strokeStyle = T.gAxis; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(PAD.l, zero); ctx.lineTo(PAD.l + gW, zero); ctx.stroke();
  ctx.save(); ctx.beginPath(); ctx.rect(PAD.l, PAD.t, gW, gH); ctx.clip();
  // NIENTE clamp sul valore prima di mapparlo: il valore vero esce dal rettangolo e viene
  // ritagliato dal clip qui sopra, così la sinusoide non si appiattisce mai in cima (niente "taglio").
  const xOf = t => PAD.l + (t - (tSim - WIN_T)) / WIN_T * gW;
  const yOf = x => zero - x / yCap * (gH * 0.46);
  [[hist1, COL[0]], ...(P.compare ? [[hist2, COL[1]]] : [])].forEach(([h, col]) => {
    if (h.length < 2) return;
    ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.beginPath();
    h.forEach((p, i) => { const x = xOf(p.t), y = yOf(p.x); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
  });
  ctx.restore();
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'right'; ctx.fillText('t', PAD.l + gW - 2, PAD.t + gH + 11);
}

// 2: A(ω) — curva di risonanza (dominio e scala SEMPRE fissi: OMEGA_MIN..MAX, 0..A_GRAPH_MAX)
function drawAOmega() {
  const cv = gCanvas[1]; if (!cv || !cv.width) return;
  const ctx = gCtx[1], W = cv.width, H = cv.height, PAD = { t: 14, b: 16, l: 22, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const xOf = w => PAD.l + (w - OMEGA_MIN) / (OMEGA_MAX - OMEGA_MIN) * gW;
  const yOf = a => PAD.t + gH - clamp(a, 0, A_GRAPH_MAX) / A_GRAPH_MAX * gH * 0.92;
  const w0 = omega0(P.m, P.k);
  if (P.showAnnot) {
    ctx.strokeStyle = T.ring; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(xOf(w0), PAD.t); ctx.lineTo(xOf(w0), PAD.t + gH); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'center'; ctx.fillText('ω₀', xOf(w0), PAD.t + 8);
  }
  [[P.c, COL[0]], ...(P.compare ? [[P.c2, COL[1]]] : [])].forEach(([c, col]) => {
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i <= 200; i++) { const w = OMEGA_MIN + i / 200 * (OMEGA_MAX - OMEGA_MIN), a = AofOmega(P.m, P.k, c, P.F0, w);
      i ? ctx.lineTo(xOf(w), yOf(a)) : ctx.moveTo(xOf(w), yOf(a)); }
    ctx.stroke();
    const aCur = AofOmega(P.m, P.k, c, P.F0, P.omega);
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(xOf(P.omega), yOf(aCur), 3.2, 0, TWO); ctx.fill();
  });
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('A', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('ω', PAD.l + gW - 2, PAD.t + gH - 3);
}

// 3: φ(ω) — sfasamento (dominio fisso, 0..π)
function drawPhiOmega() {
  const cv = gCanvas[2]; if (!cv || !cv.width) return;
  const ctx = gCtx[2], W = cv.width, H = cv.height, PAD = { t: 14, b: 16, l: 22, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const xOf = w => PAD.l + (w - OMEGA_MIN) / (OMEGA_MAX - OMEGA_MIN) * gW;
  const yOf = p => PAD.t + gH - clamp(p, 0, Math.PI) / Math.PI * gH * 0.9;
  const w0 = omega0(P.m, P.k);
  if (P.showAnnot) {
    ctx.strokeStyle = T.ring; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(xOf(w0), PAD.t); ctx.lineTo(xOf(w0), PAD.t + gH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(PAD.l, yOf(Math.PI / 2)); ctx.lineTo(PAD.l + gW, yOf(Math.PI / 2)); ctx.stroke(); ctx.setLineDash([]);
  }
  [[P.c, COL[0]], ...(P.compare ? [[P.c2, COL[1]]] : [])].forEach(([c, col]) => {
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i <= 200; i++) { const w = OMEGA_MIN + i / 200 * (OMEGA_MAX - OMEGA_MIN), p = phiOfOmega(P.m, P.k, c, w);
      i ? ctx.lineTo(xOf(w), yOf(p)) : ctx.moveTo(xOf(w), yOf(p)); }
    ctx.stroke();
    const pCur = phiOfOmega(P.m, P.k, c, P.omega);
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(xOf(P.omega), yOf(pCur), 3.2, 0, TWO); ctx.fill();
  });
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('φ', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('ω', PAD.l + gW - 2, PAD.t + gH - 3);
}
function drawGraphs() {
  const titles = ['x(t) — transitorio', 'A(ω) — curva di risonanza', 'φ(ω) — sfasamento'];
  for (let i = 0; i < 3; i++) if (gTitle[i]) gTitle[i].textContent = titles[i];
  drawXt(); drawAOmega(); drawPhiOmega();
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
let omegaSliderCtrl;
function reControls() { setTimeout(buildControls, 0); }
function buildControls() {
  const cont = document.getElementById('controls'); cont.innerHTML = '';

  const sm = Lab.Section('Modalità'); cont.appendChild(sm.el);
  sm.add(Lab.RadioGroup({ label: 'Visualizzazione', value: P.mode,
    options: [{ value: 'molla', label: 'Molla', hint: 'oscillatore' }, { value: 'ponte', label: 'Ponte', hint: 'Tacoma Narrows' }],
    onChange(v) { P.mode = v; } }));

  const so = Lab.Section('Oscillatore'); cont.appendChild(so.el);
  so.add(Lab.Slider({ label: 'Massa m', min: 0.5, max: 3, step: 0.1, value: P.m, unit: ' kg', onChange(v) { P.m = v; } }));
  so.add(Lab.Slider({ label: 'Costante elastica k', min: 5, max: 40, step: 0.5, value: P.k, unit: ' N/m', onChange(v) { P.k = v; } }));
  so.add(Lab.Slider({ label: 'Smorzamento c', min: 0.15, max: 3, step: 0.05, value: P.c, unit: ' kg/s', onChange(v) { P.c = v; } }));

  const sf = Lab.Section('Forzante'); cont.appendChild(sf.el);
  sf.add(Lab.Slider({ label: 'Ampiezza F₀', min: 0.5, max: 5, step: 0.1, value: P.F0, unit: ' N', onChange(v) { P.F0 = v; } }));
  omegaSliderCtrl = Lab.Slider({ label: 'Pulsazione forzante ω', min: OMEGA_MIN, max: OMEGA_MAX, step: 0.05, value: P.omega, unit: ' rad/s', onChange(v) { P.omega = v; } });
  sf.add(omegaSliderCtrl);
  const tuneBtn = document.createElement('button');
  tuneBtn.className = 'ctrl-btn'; tuneBtn.textContent = 'Sintonizza a risonanza (ω → ω₀)';
  tuneBtn.addEventListener('click', () => { P.omega = clamp(omega0(P.m, P.k), OMEGA_MIN, OMEGA_MAX); if (omegaSliderCtrl) omegaSliderCtrl.setValue(P.omega); });
  sf.add(tuneBtn);

  const sc = Lab.Section('Confronto'); cont.appendChild(sc.el);
  sc.add(Lab.Toggle({ label: 'Confronta con smorzamento diverso', value: P.compare, onChange(v) { P.compare = v; reControls(); } }));
  if (P.compare) sc.add(Lab.Slider({ label: 'Smorzamento c₂', min: 0.15, max: 3, step: 0.05, value: P.c2, unit: ' kg/s', onChange(v) { P.c2 = v; } }));

  const sv = Lab.Section('Visualizzazione'); cont.appendChild(sv.el);
  sv.add(Lab.Toggle({ label: 'Annotazioni (ω₀, punto attuale)', value: P.showAnnot, onChange(v) { P.showAnnot = v; } }));
  sv.add(Lab.Slider({ label: 'Velocità simulazione', min: 0.2, max: 2.5, step: 0.1, value: P.speed, unit: '×', onChange(v) { P.speed = v; } }));
}

function buildReadout() {
  const cont = document.getElementById('readout'); cont.innerHTML = '';
  readout = new Lab.Readout(cont, [
    { key: 't', label: 'Tempo' },
    { key: 'x', label: 'x (osc. 1)' },
    { key: 'w0', label: 'ω₀' },
    { key: 'Q', label: 'Fattore Q' },
    { key: 'A', label: 'A(ω) teorica' },
  ]);
}

function initGraphs() {
  const ga = document.getElementById('graphArea');
  ga.style.cssText = 'display:flex;flex-direction:row;gap:5px;padding:5px 0 3px;height:150px;box-sizing:border-box;border-top:1px solid rgba(100,150,200,0.14);';
  for (let i = 0; i < 3; i++) {
    const panel = document.createElement('div');
    panel.style.cssText = 'flex:1;min-width:0;position:relative;background:rgba(2,7,18,0.8);border:1px solid rgba(100,150,200,0.11);border-radius:4px;overflow:hidden;';
    const title = document.createElement('div'); title.textContent = '';
    title.style.cssText = 'position:absolute;top:3px;left:6px;font-size:8px;color:rgba(100,175,200,0.65);font-family:"Space Mono",monospace;text-transform:uppercase;letter-spacing:0.4px;z-index:1;pointer-events:none;';
    const cv = document.createElement('canvas'); cv.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';
    panel.appendChild(title); panel.appendChild(cv); ga.appendChild(panel);
    gCanvas[i] = cv; gCtx[i] = cv.getContext('2d'); gTitle[i] = title;
  }
}

// ═══ Init ═════════════════════════════════════════════════════════════════════
function init() {
  Lab.initTheme();
  buildControls(); initGraphs(); buildReadout();
  const simCanvas = document.getElementById('simCanvas');
  const btnPlay = document.getElementById('btnPlay');
  function syncPlay() { btnPlay.textContent = P.paused ? '▶  AVVIA' : '⏸  PAUSA'; }
  syncPlay();
  btnPlay.addEventListener('click', () => { P.paused = !P.paused; syncPlay(); });
  document.getElementById('btnReset').addEventListener('click', () => {
    P.mode = 'molla'; P.m = 1.0; P.k = 16; P.c = 0.6; P.F0 = 3.0; P.omega = 2.0;
    P.compare = false; P.c2 = 2.2; P.showAnnot = true; P.speed = 1.0; P.paused = false;
    reset(); buildControls(); syncPlay();
  });

  function resize() {
    const area = document.querySelector('.lab-canvas-area'); if (!area) return;
    const ar = area.getBoundingClientRect();
    const rb = document.getElementById('readout').getBoundingClientRect();
    const ga = document.getElementById('graphArea'); const gaH = ga ? ga.offsetHeight : 0;
    const h = Math.max(240, Math.floor(ar.height - rb.height - gaH - 4));
    simCanvas.style.width = Math.floor(ar.width) + 'px'; simCanvas.style.height = h + 'px';
    simCanvas.width = Math.floor(ar.width); simCanvas.height = h;
    for (const cv of gCanvas) { if (!cv) continue; cv.width = Math.floor(cv.parentElement.clientWidth); cv.height = Math.floor(cv.parentElement.clientHeight); }
  }
  resize();
  new ResizeObserver(resize).observe(document.querySelector('.lab-canvas-area'));
  window.addEventListener('load', resize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);

  last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000; last = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0; dt = Math.min(dt, 0.05);
    if (!P.paused) {
      step(dt * P.speed);
      // modalità Ponte: quando la deflessione supera la soglia di collasso, ferma la
      // simulazione (fotogramma congelato sull'istante della rottura)
      if (P.mode === 'ponte') {
        const sev1 = Math.abs(x1) / X_COLLAPSE, sev2 = P.compare ? Math.abs(x2) / X_COLLAPSE : 0;
        if (Math.max(sev1, sev2) >= 1) { P.paused = true; syncPlay(); }
      }
    }
    try {
      draw(simCanvas); drawGraphs();
      const w0 = omega0(P.m, P.k), Q = Qof(P.m, P.k, P.c);
      readout.set('t', tSim.toFixed(2) + ' s');
      readout.set('x', fmt(x1, ' m'));
      readout.set('w0', fmt(w0, ' rad/s'));
      readout.set('Q', Number.isFinite(Q) ? Q.toFixed(2) : '∞');
      readout.set('A', fmt(AofOmega(P.m, P.k, P.c, P.F0, P.omega), ' m'));
    } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
