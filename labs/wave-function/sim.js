'use strict';

// ═══ Stato ════════════════════════════════════════════════════════════════════
const TWO = Math.PI * 2;
const COL = ['#00d4ff', '#ff9d4d'];
const SUMCOL = '#ffe24a';

const SPAN_X = 10;                                    // dominio spaziale visibile (m), indipendente dal modo assi
const WIN_T = 10;                                     // finestra temporale visibile (s), indipendente dal periodo
const Y_MAX = 3.3;                                    // scala verticale FISSA: mai riscalare in base ad A, altrimenti l'effetto dell'ampiezza sparisce

const P = {
  A1: 1.0, T1: 2.0, lam1: 3.0, ph1: 0, dir1: 1,     // onda 1
  compare: false,
  A2: 0.6, T2: 1.3, lam2: 2.0, ph2: 90, dir2: 1,    // onda 2
  showSum: false,
  showAnnot: true,
  axis: 'x',                                          // asse principale del canvas: 'x' spazio | 't' tempo
  speed: 1.0,
  paused: false,
  probeX: 2.5,                                       // posizione sonda (m)
};

let tSim = 0, last = 0;
let G = {};                                           // geometria canvas (ricalcolata ogni frame)
let dragging = false;
let simCanvas = null;
let gCanvas = [null, null, null], gCtx = [null, null, null], gTitle = [null, null, null];
let readout, probeSliderCtrl;

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
    probe:  d ? 'rgba(255,255,255,0.5)' : 'rgba(20,45,75,0.5)',
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
// y(x,t) = A·sin(k·x − dir·ω·t + φ)   con k=2π/λ, ω=2π/T
function waves() {
  const w1 = { A: P.A1, T: P.T1, lam: P.lam1, ph: P.ph1, dir: P.dir1, col: COL[0], n: '1' };
  if (!P.compare) return [w1];
  const w2 = { A: P.A2, T: P.T2, lam: P.lam2, ph: P.ph2, dir: P.dir2, col: COL[1], n: '2' };
  return [w1, w2];
}
function kOf(w) { return TWO / w.lam; }
function omOf(w) { return TWO / w.T; }
function vOf(w) { return w.lam / w.T; }
function yAt(w, x, t) { return w.A * Math.sin(kOf(w) * x - w.dir * omOf(w) * t + w.ph * Math.PI / 180); }
// campiona y lungo l'asse principale corrente: profilo spaziale a t=tSim, oppure storia temporale nel punto sonda
function sampleY(w, u) { return G.mode === 'x' ? yAt(w, u, tSim) : yAt(w, P.probeX, u); }
function sampleSum(u) {
  const ws = waves();
  return G.mode === 'x' ? yAt(ws[0], u, tSim) + yAt(ws[1], u, tSim) : yAt(ws[0], P.probeX, u) + yAt(ws[1], P.probeX, u);
}

// ═══ Geometria ════════════════════════════════════════════════════════════════
// Dominio e scala SEMPRE fissi (non dipendono da A, T o λ correnti): se si riscalasse
// con i parametri, l'effetto visivo di una modifica ad ampiezza o periodo sparirebbe.
function geom(W, H) {
  const marginL = 46, marginR = 18, marginT = 30, marginB = 40;
  const plotW = Math.max(10, W - marginL - marginR), plotH = Math.max(10, H - marginT - marginB);
  let uMin, domain, xLabel;
  if (P.axis === 'x') { uMin = 0; domain = SPAN_X; xLabel = 'x (m)'; }
  else { uMin = tSim - WIN_T; domain = WIN_T; xLabel = 't (s)'; }
  const xScale = plotW / domain;
  const yMax = Y_MAX;
  const yScale = (plotH / 2) / yMax;
  const originX = marginL, originY = marginT + plotH / 2;
  G = { mode: P.axis, uMin, domain, xLabel, marginL, marginR, marginT, marginB, plotW, plotH, xScale, yMax, yScale, originX, originY, W, H };
}
const sx = u => G.originX + (u - G.uMin) * G.xScale;
const sy = y => G.originY - y * G.yScale;

// ═══ Rendering ════════════════════════════════════════════════════════════════
function drawGrid(ctx, W, H) {
  ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}
function bracket(ctx, x1, y1, x2, y2, col, lbl, lblAt) {
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  const tick = 5;
  if (Math.abs(x1 - x2) > Math.abs(y1 - y2)) {                     // orizzontale
    ctx.beginPath(); ctx.moveTo(x1, y1 - tick); ctx.lineTo(x1, y1 + tick); ctx.moveTo(x2, y2 - tick); ctx.lineTo(x2, y2 + tick); ctx.stroke();
  } else {                                                          // verticale
    ctx.beginPath(); ctx.moveTo(x1 - tick, y1); ctx.lineTo(x1 + tick, y1); ctx.moveTo(x2 - tick, y2); ctx.lineTo(x2 + tick, y2); ctx.stroke();
  }
  ctx.font = 'bold 10px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText(lbl, lblAt.x, lblAt.y);
}

function draw(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  T = pal();
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
  drawGrid(ctx, W, H);

  const ws = waves();
  geom(W, H);

  // assi
  ctx.strokeStyle = T.ring; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(G.marginL, G.originY); ctx.lineTo(G.marginL + G.plotW, G.originY); ctx.stroke();
  if (G.mode === 'x') {                                // l'origine spaziale x=0 ha senso solo nel modo "spazio"
    ctx.beginPath(); ctx.moveTo(G.originX, G.marginT); ctx.lineTo(G.originX, G.marginT + G.plotH); ctx.stroke();
  }

  // tacche asse principale: metri (modo spazio) o secondi (modo tempo)
  ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
  if (G.mode === 'x') {
    for (let m = 0; m <= G.domain; m++) {
      const X = sx(m);
      ctx.strokeStyle = T.ring; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X, G.originY - 3); ctx.lineTo(X, G.originY + 3); ctx.stroke();
      if (m > 0) ctx.fillText(String(m), X, G.originY + 15);
    }
  } else {
    const step = G.domain <= 6 ? 0.5 : (G.domain <= 12 ? 1 : 2);
    const t0 = Math.ceil(G.uMin / step) * step;
    for (let tv = t0; tv <= G.uMin + G.domain + 1e-6; tv += step) {
      const X = sx(tv);
      ctx.strokeStyle = T.ring; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X, G.originY - 3); ctx.lineTo(X, G.originY + 3); ctx.stroke();
      ctx.fillText(tv.toFixed(step < 1 ? 1 : 0), X, G.originY + 15);
    }
  }
  ctx.fillText(G.xLabel, G.marginL + G.plotW - 4, G.marginT + G.plotH + 16);
  // tacche y (ampiezza)
  ctx.textAlign = 'right';
  for (let a = -Math.floor(G.yMax * 2) / 2; a <= G.yMax; a += 0.5) {
    if (Math.abs(a) < 1e-6) continue;
    const Y = sy(a);
    if (Y < G.marginT || Y > G.marginT + G.plotH) continue;
    ctx.strokeStyle = T.ring; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(G.originX - 3, Y); ctx.lineTo(G.originX + 3, Y); ctx.stroke();
    ctx.fillText(a.toFixed(1), G.originX - 6, Y + 3);
  }

  // area di disegno ritagliata
  ctx.save();
  ctx.beginPath(); ctx.rect(G.marginL, G.marginT, G.plotW, G.plotH); ctx.clip();

  // curve
  const N = 420;
  for (const w of ws) {
    ctx.strokeStyle = w.col; ctx.lineWidth = 2.3; ctx.beginPath();
    for (let i = 0; i <= N; i++) { const u = G.uMin + i / N * G.domain, y = sampleY(w, u);
      i ? ctx.lineTo(sx(u), sy(y)) : ctx.moveTo(sx(u), sy(y)); }
    ctx.stroke();
  }
  if (P.compare && P.showSum) {
    ctx.strokeStyle = SUMCOL; ctx.lineWidth = 1.8; ctx.setLineDash([5, 3]); ctx.beginPath();
    for (let i = 0; i <= N; i++) { const u = G.uMin + i / N * G.domain, y = sampleSum(u);
      i ? ctx.lineTo(sx(u), sy(y)) : ctx.moveTo(sx(u), sy(y)); }
    ctx.stroke(); ctx.setLineDash([]);
  }

  // annotazioni A e λ/T (posizionate in frazione del dominio visibile, valgono in entrambi i modi)
  if (P.showAnnot) {
    ws.forEach((w, i) => {
      const ua = G.uMin + G.domain - G.domain * 0.06 - i * G.domain * 0.09;
      bracket(ctx, sx(ua), sy(0), sx(ua), sy(w.A), w.col, 'A' + (P.compare ? '₁₂'[i] : ''), { x: sx(ua) + 16, y: sy(w.A / 2) + 3 });
      const u0 = G.uMin + G.domain * 0.05, ylv = -G.yMax * (0.65 + i * 0.22);
      const span = G.mode === 'x' ? w.lam : w.T, lbl = (G.mode === 'x' ? 'λ' : 'T') + (P.compare ? '₁₂'[i] : '');
      bracket(ctx, sx(u0), sy(ylv), sx(u0 + span), sy(ylv), w.col, lbl, { x: sx(u0 + span / 2), y: sy(ylv) - 7 });
    });
  }

  // sonda (modo spazio: trascinabile lungo x) / punto "adesso" (modo tempo: bordo destro, fisso)
  const px = clamp(P.probeX, 0, SPAN_X);
  const markerX = G.mode === 'x' ? sx(px) : sx(tSim);
  ctx.strokeStyle = T.probe; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(markerX, G.marginT); ctx.lineTo(markerX, G.marginT + G.plotH); ctx.stroke();
  ctx.setLineDash([]);
  ws.forEach(w => {
    const py = yAt(w, px, tSim);
    ctx.fillStyle = w.col; ctx.beginPath(); ctx.arc(markerX, sy(py), 5.5, 0, TWO); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.stroke();
  });
  ctx.restore();

  ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
  const hint = G.mode === 'x' ? `sonda x = ${px.toFixed(2)} m · trascina per spostarla`
    : `punto osservato x = ${px.toFixed(2)} m · regolabile con lo slider "posizione sonda"`;
  ctx.fillText(hint, G.marginL + G.plotW / 2, H - 8);

  // intestazione
  ctx.textAlign = 'left';
  ctx.fillStyle = T.accent; ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.fillText("Funzione d'Onda — y(x,t) = A·sin(kx − ωt + φ)", 14, 22);
  ws.forEach((w, i) => {
    const ly = 40 + i * 15;
    ctx.fillStyle = w.col; ctx.beginPath(); ctx.arc(20, ly - 3, 4.5, 0, TWO); ctx.fill();
    ctx.fillStyle = T.txt; ctx.font = '10px "Space Mono",monospace';
    ctx.fillText(`A=${w.A.toFixed(2)} m   λ=${w.lam.toFixed(2)} m   T=${w.T.toFixed(2)} s   f=${(1 / w.T).toFixed(2)} Hz   v=${vOf(w).toFixed(2)} m/s   φ=${w.ph}°   ${w.dir > 0 ? '→' : '←'}`, 30, ly);
  });
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
function gBase(ctx, W, H, PAD) {
  ctx.fillStyle = T.gBg; ctx.fillRect(0, 0, W, H);
  const gW = W - PAD.l - PAD.r, gH = H - PAD.t - PAD.b;
  ctx.strokeStyle = T.gAxis; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(PAD.l, PAD.t); ctx.lineTo(PAD.l, PAD.t + gH); ctx.lineTo(PAD.l + gW, PAD.t + gH); ctx.stroke();
  return { gW, gH };
}

// 1: y(t) nel punto sonda
function drawProbeT() {
  const cv = gCanvas[0]; if (!cv || !cv.width) return;
  const ctx = gCtx[0], W = cv.width, H = cv.height, PAD = { t: 14, b: 16, l: 22, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const ws = waves();
  const zero = PAD.t + gH / 2;
  ctx.strokeStyle = T.gAxis; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(PAD.l, zero); ctx.lineTo(PAD.l + gW, zero); ctx.stroke();
  const px = clamp(P.probeX, 0, SPAN_X);
  for (const w of ws) {
    ctx.strokeStyle = w.col; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i <= 200; i++) { const t = tSim - WIN_T + i / 200 * WIN_T, x = PAD.l + i / 200 * gW, y = zero - yAt(w, px, t) / Y_MAX * (gH * 0.44);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
  }
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'right'; ctx.fillText('t', PAD.l + gW - 2, PAD.t + gH + 11);
}

// 2: y(x) istantanea
function drawSnapshotX() {
  const cv = gCanvas[1]; if (!cv || !cv.width) return;
  const ctx = gCtx[1], W = cv.width, H = cv.height, PAD = { t: 14, b: 16, l: 18, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const ws = waves();
  const zero = PAD.t + gH / 2;
  ctx.strokeStyle = T.gAxis; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(PAD.l, zero); ctx.lineTo(PAD.l + gW, zero); ctx.stroke();
  for (const w of ws) {
    ctx.strokeStyle = w.col; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i <= 240; i++) { const xw = i / 240 * SPAN_X, x = PAD.l + i / 240 * gW, y = zero - yAt(w, xw, tSim) / Y_MAX * (gH * 0.44);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
  }
  const px = clamp(P.probeX, 0, SPAN_X), pxg = PAD.l + px / SPAN_X * gW;
  ctx.strokeStyle = T.probe; ctx.lineWidth = 0.8; ctx.setLineDash([2, 3]);
  ctx.beginPath(); ctx.moveTo(pxg, PAD.t); ctx.lineTo(pxg, PAD.t + gH); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'right'; ctx.fillText('x', PAD.l + gW - 2, PAD.t + gH + 11);
}

// 3: confronto di fase (Lissajous y1–y2) oppure relazione v = λ/T
function drawThird() {
  const cv = gCanvas[2]; if (!cv || !cv.width) return;
  const ctx = gCtx[2], W = cv.width, H = cv.height, PAD = { t: 14, b: 14, l: 14, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  if (P.compare) {
    const ws = waves(), w1 = ws[0], w2 = ws[1];
    const cx = PAD.l + gW / 2, cy = PAD.t + gH / 2, half = Math.min(gW, gH) * 0.46;
    const px = clamp(P.probeX, 0, SPAN_X);
    const Tcommon = Math.max(w1.T, w2.T) * 8;
    ctx.strokeStyle = T.accent; ctx.lineWidth = 1.1; ctx.beginPath();
    for (let i = 0; i <= 480; i++) { const t = i / 480 * Tcommon;
      const X = cx + yAt(w1, px, t) / w1.A / 1.15 * half, Y = cy - yAt(w2, px, t) / w2.A / 1.15 * half;
      i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
    ctx.stroke();
    const X0 = cx + yAt(w1, px, tSim) / w1.A / 1.15 * half, Y0 = cy - yAt(w2, px, tSim) / w2.A / 1.15 * half;
    ctx.fillStyle = T.accent; ctx.beginPath(); ctx.arc(X0, Y0, 3, 0, TWO); ctx.fill();
    ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left';
    ctx.fillText('y₂/A₂', PAD.l + 2, PAD.t + 7); ctx.textAlign = 'right'; ctx.fillText('y₁/A₁', PAD.l + gW - 2, cy - 3);
  } else {
    const lmax = 6.4, vmax = lmax / 0.4 * 1.05;
    const xOf = l => PAD.l + l / lmax * gW, yOf = vv => PAD.t + gH - clamp(vv / vmax, 0, 1) * gH * 0.9;
    ctx.strokeStyle = T.accent; ctx.lineWidth = 1.6; ctx.beginPath();
    for (let l = 0.4; l <= lmax; l += 0.05) { const x = xOf(l), y = yOf(l / P.T1); l <= 0.4 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
    ctx.fillStyle = COL[0]; ctx.beginPath(); ctx.arc(xOf(P.lam1), yOf(vOf({ lam: P.lam1, T: P.T1 })), 3.4, 0, TWO); ctx.fill();
    ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('v', PAD.l + 2, PAD.t + 7);
    ctx.textAlign = 'right'; ctx.fillText('λ', PAD.l + gW - 2, PAD.t + gH - 3);
  }
}
function drawGraphs() {
  const titles = ['y(t) — sonda', 'y(x) — istantanea', P.compare ? 'Confronto di fase (y₁,y₂)' : 'Relazione v = λ/T'];
  for (let i = 0; i < 3; i++) if (gTitle[i]) gTitle[i].textContent = titles[i];
  drawProbeT(); drawSnapshotX(); drawThird();
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
function updateCursor() { if (simCanvas) simCanvas.style.cursor = P.axis === 'x' ? 'ew-resize' : 'default'; }
function reControls() { setTimeout(buildControls, 0); }
function buildControls() {
  const cont = document.getElementById('controls'); cont.innerHTML = '';

  const s1 = Lab.Section('Onda 1'); cont.appendChild(s1.el);
  s1.add(Lab.Slider({ label: 'Ampiezza A', min: 0.2, max: 1.5, step: 0.05, value: P.A1, unit: ' m', onChange(v) { P.A1 = v; } }));
  s1.add(Lab.Slider({ label: 'Periodo T', min: 0.4, max: 4, step: 0.05, value: P.T1, unit: ' s', onChange(v) { P.T1 = v; } }));
  s1.add(Lab.Slider({ label: "Lunghezza d'onda λ", min: 0.4, max: 6, step: 0.05, value: P.lam1, unit: ' m', onChange(v) { P.lam1 = v; } }));
  s1.add(Lab.Slider({ label: 'Fase iniziale φ', min: -180, max: 180, step: 5, value: P.ph1, unit: '°', onChange(v) { P.ph1 = v; } }));
  s1.add(Lab.RadioGroup({ label: 'Direzione di propagazione', value: String(P.dir1),
    options: [{ value: '1', label: '→  (+x)' }, { value: '-1', label: '←  (−x)' }], onChange(v) { P.dir1 = parseInt(v); } }));

  const sc = Lab.Section('Confronto'); cont.appendChild(sc.el);
  sc.add(Lab.Toggle({ label: 'Aggiungi onda 2', value: P.compare, onChange(v) { P.compare = v; reControls(); } }));
  if (P.compare) {
    sc.add(Lab.Slider({ label: 'Ampiezza A (2)', min: 0.2, max: 1.5, step: 0.05, value: P.A2, unit: ' m', onChange(v) { P.A2 = v; } }));
    sc.add(Lab.Slider({ label: 'Periodo T (2)', min: 0.4, max: 4, step: 0.05, value: P.T2, unit: ' s', onChange(v) { P.T2 = v; } }));
    sc.add(Lab.Slider({ label: "Lunghezza d'onda λ (2)", min: 0.4, max: 6, step: 0.05, value: P.lam2, unit: ' m', onChange(v) { P.lam2 = v; } }));
    sc.add(Lab.Slider({ label: 'Fase iniziale φ (2)', min: -180, max: 180, step: 5, value: P.ph2, unit: '°', onChange(v) { P.ph2 = v; } }));
    sc.add(Lab.RadioGroup({ label: 'Direzione di propagazione (2)', value: String(P.dir2),
      options: [{ value: '1', label: '→  (+x)' }, { value: '-1', label: '←  (−x)' }], onChange(v) { P.dir2 = parseInt(v); } }));
    sc.add(Lab.Toggle({ label: 'Mostra somma y₁+y₂', value: P.showSum, onChange(v) { P.showSum = v; } }));
  }

  const sv = Lab.Section('Visualizzazione'); cont.appendChild(sv.el);
  sv.add(Lab.RadioGroup({ label: 'Asse principale del grafico', value: P.axis,
    options: [{ value: 'x', label: 'Spazio — y(x)', hint: 'istantanea' }, { value: 't', label: 'Tempo — y(t)', hint: 'nel punto sonda' }],
    onChange(v) { P.axis = v; updateCursor(); } }));
  probeSliderCtrl = Lab.Slider({ label: 'Posizione sonda x', min: 0, max: SPAN_X, step: 0.1, value: P.probeX, unit: ' m', onChange(v) { P.probeX = v; } });
  sv.add(probeSliderCtrl);
  sv.add(Lab.Toggle({ label: 'Annotazioni A, λ/T', value: P.showAnnot, onChange(v) { P.showAnnot = v; } }));
  sv.add(Lab.Slider({ label: 'Velocità simulazione', min: 0.2, max: 2.5, step: 0.1, value: P.speed, unit: '×', onChange(v) { P.speed = v; } }));
}

function buildReadout() {
  const cont = document.getElementById('readout'); cont.innerHTML = '';
  readout = new Lab.Readout(cont, [
    { key: 't', label: 'Tempo' },
    { key: 'y', label: 'y (sonda)' },
    { key: 'T', label: 'Periodo T' },
    { key: 'lam', label: 'Lunghezza λ' },
    { key: 'v', label: 'Velocità v' },
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
  simCanvas = document.getElementById('simCanvas');
  buildControls(); initGraphs(); buildReadout(); updateCursor();
  const btnPlay = document.getElementById('btnPlay');
  function syncPlay() { btnPlay.textContent = P.paused ? '▶  AVVIA' : '⏸  PAUSA'; }
  syncPlay();
  btnPlay.addEventListener('click', () => { P.paused = !P.paused; syncPlay(); });
  document.getElementById('btnReset').addEventListener('click', () => {
    P.A1 = 1.0; P.T1 = 2.0; P.lam1 = 3.0; P.ph1 = 0; P.dir1 = 1;
    P.compare = false; P.A2 = 0.6; P.T2 = 1.3; P.lam2 = 2.0; P.ph2 = 90; P.dir2 = 1;
    P.showSum = false; P.showAnnot = true; P.axis = 'x'; P.speed = 1.0; P.paused = false; P.probeX = 2.5;
    tSim = 0; buildControls(); updateCursor(); syncPlay();
  });

  // interazione: trascina sulla vista principale per spostare la sonda (solo nel modo "spazio")
  function evtX(e) { const r = simCanvas.getBoundingClientRect(); return (e.clientX - r.left) * (simCanvas.width / r.width); }
  function setProbeFromScreen(px) {
    if (P.axis !== 'x' || !G.xScale) return;
    P.probeX = clamp((px - G.originX) / G.xScale, 0, SPAN_X);
    if (probeSliderCtrl) probeSliderCtrl.setValue(P.probeX);
  }
  simCanvas.addEventListener('pointerdown', e => { dragging = true; setProbeFromScreen(evtX(e)); try { simCanvas.setPointerCapture(e.pointerId); } catch (_) {} });
  simCanvas.addEventListener('pointermove', e => { if (dragging) setProbeFromScreen(evtX(e)); });
  simCanvas.addEventListener('pointerup', () => { dragging = false; });

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
    if (!P.paused) tSim += dt * P.speed;
    try {
      draw(simCanvas); drawGraphs();
      const ws = waves(), w1 = ws[0], px = clamp(P.probeX, 0, SPAN_X);
      readout.set('t', tSim.toFixed(2) + ' s');
      readout.set('y', fmt(yAt(w1, px, tSim), ' m'));
      readout.set('T', fmt(w1.T, ' s'));
      readout.set('lam', fmt(w1.lam, ' m'));
      readout.set('v', fmt(vOf(w1), ' m/s'));
    } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
