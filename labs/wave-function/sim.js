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
function fmt(x, u) { return Lab.fmt(x, Math.abs(x) < 10 ? 2 : 1) + (u || ''); }

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
  const [ctx, W, H] = Lab.ctx2d(canvas);
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
      ctx.fillText(Lab.fmt(tv,step < 1 ? 1 : 0), X, G.originY + 15);
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
    ctx.fillText(Lab.fmt(a,1), G.originX - 6, Y + 3);
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
  const hint = G.mode === 'x' ? `sonda x = ${Lab.fmt(px,2)} m · trascina per spostarla`
    : `punto osservato x = ${Lab.fmt(px,2)} m · regolabile con lo slider "posizione sonda"`;
  ctx.fillText(hint, G.marginL + G.plotW / 2, H - 8);

  // intestazione
  ctx.textAlign = 'left';
  ctx.fillStyle = T.accent; ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.fillText("Funzione d'Onda — y(x,t) = A·sin(kx − ωt + φ)", 14, 22);
  ws.forEach((w, i) => {
    const ly = 40 + i * 15;
    ctx.fillStyle = w.col; ctx.beginPath(); ctx.arc(20, ly - 3, 4.5, 0, TWO); ctx.fill();
    ctx.fillStyle = T.txt; ctx.font = '10px "Space Mono",monospace';
    ctx.fillText(`A=${Lab.fmt(w.A,2)} m   λ=${Lab.fmt(w.lam,2)} m   T=${Lab.fmt(w.T,2)} s   f=${Lab.fmt((1 / w.T),2)} Hz   v=${Lab.fmt(vOf(w),2)} m/s   φ=${w.ph}°   ${w.dir > 0 ? '→' : '←'}`, 30, ly);
  });
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
// curve delle onde (e della somma, se richiesta) su un riquadro di Lab.panel
function plotWaves(ctx, f, fn, xr) {
  const ws = waves();
  for (const w of ws) Lab.plot(ctx, f, u => fn(w, u), xr, w.col, 1.8, [], 300);
  if (P.compare && P.showSum) Lab.plot(ctx, f, u => ws.reduce((s, w) => s + fn(w, u), 0), xr, SUMCOL, 2.2, [], 300);
}
// 1: y(t) nel punto sonda, ultimi 10 s
function drawProbeT() {
  const px = clamp(P.probeX, 0, SPAN_X), t1 = Math.max(tSim, WIN_T);
  const g = Lab.panel(gCanvas[0], { title: `Oscillazione nel punto x = ${Lab.fmt(px, 1)} m`, xr: [t1 - WIN_T, t1], xStep: 2, yr: [-Y_MAX, Y_MAX], yStep: 1, xLabel: 't (s)', yFmt: v => Lab.fmt(v, 0) });
  if (!g) return; const [ctx, f] = g;
  plotWaves(ctx, f, (w, t) => (t >= 0 ? yAt(w, px, t) : NaN), [t1 - WIN_T, t1]);
}
// 2: y(x) all'istante attuale, con la posizione della sonda
function drawSnapshotX() {
  const g = Lab.panel(gCanvas[1], { title: 'Forma dell’onda all’istante t', xr: [0, SPAN_X], xStep: 2, yr: [-Y_MAX, Y_MAX], yStep: 1, xLabel: 'x (m)', yFmt: v => Lab.fmt(v, 0) });
  if (!g) return; const [ctx, f] = g;
  const px = clamp(P.probeX, 0, SPAN_X);
  ctx.save(); ctx.setLineDash([2, 3]); ctx.strokeStyle = T.probe; ctx.beginPath(); ctx.moveTo(f.X(px), f.T); ctx.lineTo(f.X(px), f.B); ctx.stroke(); ctx.restore();
  plotWaves(ctx, f, (w, x) => yAt(w, x, tSim), [0, SPAN_X]);
}
// 3: confronto di fase (curva di Lissajous y₁–y₂ nella sonda) oppure v = λ/T a periodo fisso
function drawThird() {
  if (P.compare) {
    const ws = waves(), w1 = ws[0], w2 = ws[1], px = clamp(P.probeX, 0, SPAN_X);
    const g = Lab.panel(gCanvas[2], { title: 'Confronto di fase nella sonda (y₁, y₂)', xr: [-1.6, 1.6], xStep: 0.5, yr: [-1.6, 1.6], yStep: 0.5, xLabel: 'y₁ (m)' });
    if (!g) return; const [ctx, f] = g;
    const Tc = Math.max(w1.T, w2.T) * 8, pts = [];
    for (let i = 0; i <= 600; i++) { const t = i / 600 * Tc; pts.push([yAt(w1, px, t), yAt(w2, px, t)]); }
    Lab.plotPts(ctx, f, pts, T.accent, 1.2);
    Lab.dot(ctx, f, yAt(w1, px, tSim), yAt(w2, px, tSim), T.accent, 4);
    ctx.fillStyle = f.C.text; ctx.font = '9.5px "DM Sans",sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('y₂ (m)', f.L + 4, f.T + 8);
  } else {
    const g = Lab.panel(gCanvas[2], { title: `Velocità v = λ/T con T = ${Lab.fmt(P.T1, 2)} s`, xr: [0, 6], xStep: 1, yr: [0, 15], yStep: 5, xLabel: 'λ (m)' });
    if (!g) return; const [ctx, f] = g;
    Lab.plot(ctx, f, l => l / P.T1, [0, 6], T.accent, 2);
    Lab.dot(ctx, f, P.lam1, vOf({ lam: P.lam1, T: P.T1 }), COL[0], 4.5);
    ctx.fillStyle = f.C.text; ctx.font = '9.5px "DM Sans",sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('v (m/s)', f.L + 4, f.T + 8);
  }
}
function drawGraphs() { drawProbeT(); drawSnapshotX(); drawThird(); }

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
    { key: 't', label: 'tempo' },
    { key: 'y', label: 'spostamento nella sonda' },
    { key: 'T', label: 'periodo T' },
    { key: 'lam', label: 'lunghezza d’onda λ' },
    { key: 'v', label: 'velocità v = λ/T' },
  ]);
}

function initGraphs() {
  // riga di grafici standard; i titoli sono disegnati dentro i grafici
  gCanvas = Lab.graphPanels(document.getElementById('graphArea'), 3);
  gCtx = gCanvas.map(c => c.getContext('2d'));
  gTitle = gCanvas.map(() => ({ textContent: '' }));
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
  function evtX(e) { const r = simCanvas.getBoundingClientRect(); return e.clientX - r.left; }
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
    if (!P.paused) tSim += dt * P.speed;
    try {
      draw(simCanvas); drawGraphs();
      const ws = waves(), w1 = ws[0], px = clamp(P.probeX, 0, SPAN_X);
      readout.set('t', Lab.fmt(tSim, 2) + ' s');
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
