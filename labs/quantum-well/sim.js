'use strict';

// ═══ Costanti fisiche ═════════════════════════════════════════════════════════
const TWO = Math.PI * 2;
const HBAR = 1.054571817e-34;                              // J·s
const ME = 9.1093837015e-31;                                // kg, massa elettrone
const MP = 1.67262192369e-27;                                // kg, massa protone
const EV = 1.602176634e-19;                                  // J, 1 eV
// Il periodo di battimento reale fra due autostati è dell'ordine dei femtosecondi (troppo
// rapido per qualunque slider di velocità ragionevole, a differenza di Cavendish/Millikan dove
// i tempi reali sono solo "lenti"): l'animazione scorre in un proprio orologio "a schermo"
// proporzionale al tempo fisico reale tramite questo fattore fisso di compressione, MAI
// una velocità arbitraria scollegata dalla fisica — cambiare L o particella cambia ΔE e quindi
// cambia visibilmente anche il ritmo dell'animazione, non solo i numeri nel readout.
const TIME_COMPRESSION = 8e14;
const COL = { a: '#00d4ff', b: '#ff9d4d', re: '#00d4ff', im: '#ff5d9e' };

const P = {
  mode: 'single',        // 'single' | 'super'
  n: 2,
  n1: 1, n2: 2,
  L_nm: 1.0,
  particle: 'electron',  // 'electron' | 'proton'
  showComponents: false,
  speed: 1.0,
  paused: false,
};

let animT = 0, last = 0;                                    // animT: secondi "a schermo" (già compressi)
let hist = [];
const WIN_T = 10;                                            // finestra fissa del grafico ⟨u⟩(t)
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
    wall:   d ? 'rgba(255,120,120,0.5)' : 'rgba(180,40,40,0.5)',
    grid:   d ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)',
    gBg:    d ? 'rgb(3,9,22)' : '#eef2f7',
    gAxis:  d ? 'rgba(100,155,210,0.3)' : 'rgba(40,80,130,0.32)',
    gText:  d ? 'rgba(150,205,225,0.88)' : 'rgba(25,65,105,0.92)',
  };
}
let T = pal();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const fmtSci = (x, u) => (Math.abs(x) < 1e-3 && x !== 0 || Math.abs(x) >= 1e4) ? x.toExponential(3) + (u || '') : x.toFixed(4) + (u || '');

// ═══ Fisica ═══════════════════════════════════════════════════════════════════
// Buca di potenziale infinita di larghezza L: autostati φ_n(u)=√2·sin(nπu) con u=x/L∈[0,1]
// (adimensionale, ∫₀¹|φ_n|²du=1 — così la FORMA non dipende da L, solo l'energia ne dipende),
// energie E_n = n²π²ℏ²/(2mL²). Un autostato puro è uno STATO STAZIONARIO: |Ψ|² non cambia nel
// tempo (solo la fase ruota) — la dinamica visibile appare solo in una SOVRAPPOSIZIONE di due
// autostati, che "sloscia" avanti e indietro nella buca con periodo T=h/(E₂−E₁) (battimento).
const mass = () => P.particle === 'proton' ? MP : ME;
const Lm = () => P.L_nm * 1e-9;
function En(n) { return (n * n * Math.PI * Math.PI * HBAR * HBAR) / (2 * mass() * Lm() * Lm()); }
function EnEV(n) { return En(n) / EV; }
function phiN(n, u) { return (u < 0 || u > 1) ? 0 : Math.sqrt(2) * Math.sin(n * Math.PI * u); }
// componenti complesse di Ψ(u,t) e densità |Ψ|² — unificate per singolo/sovrapposizione:
// per un singolo autostato la densità torna identica a φ_n(u)² per costruzione (re²+im²=φ²),
// dimostrando esplicitamente la stazionarietà invece di trattarla come caso speciale a parte.
function componentsAt(u, aT) {
  const tphys = aT / TIME_COMPRESSION;
  if (P.mode === 'single') {
    const th = En(P.n) * tphys / HBAR;
    const p = phiN(P.n, u);
    return { re: p * Math.cos(th), im: -p * Math.sin(th) };
  }
  const w = 1 / Math.SQRT2;
  const th1 = En(P.n1) * tphys / HBAR, th2 = En(P.n2) * tphys / HBAR;
  const p1 = phiN(P.n1, u), p2 = phiN(P.n2, u);
  return { re: w * p1 * Math.cos(th1) + w * p2 * Math.cos(th2), im: -w * p1 * Math.sin(th1) - w * p2 * Math.sin(th2) };
}
function densityAt(u, aT) { const c = componentsAt(u, aT); return c.re * c.re + c.im * c.im; }
function beatPeriodFs() {                                    // T=h/ΔE, in femtosecondi — solo sovrapposizione
  if (P.mode !== 'super' || P.n1 === P.n2) return null;
  const dE = Math.abs(En(P.n2) - En(P.n1));
  return (TWO * Math.PI * HBAR / dE) * 1e15;
}
function meanU(aT) {                                          // ⟨x⟩/L numerico: sempre in [0,1] per costruzione,
  const N = 120; let s = 0, norm = 0;                          // quindi il grafico può usare un asse fisso 0–1
  for (let i = 0; i <= N; i++) { const u = i / N, d = densityAt(u, aT); s += u * d; norm += d; }
  return s / (norm || 1);
}

function trimHist() { const tMin = animT - WIN_T - 1; while (hist.length && hist[0].t < tMin) hist.shift(); }
function step(dt) { animT += dt; hist.push({ t: animT, u: meanU(animT) }); trimHist(); }
function resetSim() { animT = 0; hist = []; }

// ═══ Rendering ════════════════════════════════════════════════════════════════
function drawGrid(ctx, W, H) {
  ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}
function drawHatch(ctx, x0, x1, yTop, yBot, col) {
  ctx.save(); ctx.beginPath(); ctx.rect(x0, yTop, x1 - x0, yBot - yTop); ctx.clip();
  ctx.strokeStyle = col; ctx.lineWidth = 1.4;
  const step = 9;
  for (let x = x0 - (yBot - yTop); x < x1 + (yBot - yTop); x += step) {
    ctx.beginPath(); ctx.moveTo(x, yTop); ctx.lineTo(x + (yBot - yTop), yBot); ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.strokeRect(x0, yTop, x1 - x0, yBot - yTop);
}

// Dominio orizzontale SEMPRE fisso in u=x/L∈[−0.22,1.22] (frazione della buca, mai in nm): la
// forma di φ_n non dipende da L, quindi non c'è bisogno — né senso — di riscalare l'asse con L.
const U_MIN = -0.22, U_MAX = 1.22, Y_MAX = 4.3;
function geom(W, H) {
  const marginL = 20, marginR = 20, marginT = 44, marginB = 34;
  const plotW = Math.max(10, W - marginL - marginR), plotH = Math.max(10, H - marginT - marginB);
  const xScale = plotW / (U_MAX - U_MIN);
  const yScale = plotH / Y_MAX;
  G = { marginL, marginR, marginT, marginB, plotW, plotH, xScale, yScale, W, H };
}
const sx = u => G.marginL + (u - U_MIN) * G.xScale;
const sy0 = () => G.marginT + G.plotH;                        // linea di base (densità = 0)
const sy = d => sy0() - d * G.yScale;

function draw(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  T = pal();
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
  drawGrid(ctx, W, H);
  geom(W, H);

  // pareti a potenziale infinito
  drawHatch(ctx, sx(U_MIN), sx(0), G.marginT, sy0(), T.wall);
  drawHatch(ctx, sx(1), sx(U_MAX), G.marginT, sy0(), T.wall);
  ctx.fillStyle = T.wall; ctx.font = 'bold 10px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText('V = ∞', sx(U_MIN / 2), G.marginT + 14);
  ctx.fillText('V = ∞', sx((1 + U_MAX) / 2), G.marginT + 14);

  // linea di base e assi
  ctx.strokeStyle = T.ring; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(sx(0), sy0()); ctx.lineTo(sx(1), sy0()); ctx.stroke();
  ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText('x = 0', sx(0), sy0() + 15);
  ctx.fillText(`x = L = ${P.L_nm.toFixed(2)} nm`, sx(1), sy0() + 15);

  // area di disegno ritagliata alla buca
  ctx.save(); ctx.beginPath(); ctx.rect(sx(0), G.marginT, sx(1) - sx(0), G.plotH); ctx.clip();

  // densità di probabilità |Ψ(u)|² — curva piena
  const N = 260;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) { const u = i / N, d = densityAt(u, animT); const X = sx(u), Y = sy(d); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
  ctx.lineTo(sx(1), sy0()); ctx.lineTo(sx(0), sy0()); ctx.closePath();
  const fillGrad = ctx.createLinearGradient(0, G.marginT, 0, sy0());
  fillGrad.addColorStop(0, 'rgba(0,212,255,0.38)'); fillGrad.addColorStop(1, 'rgba(0,212,255,0.04)');
  ctx.fillStyle = fillGrad; ctx.fill();
  ctx.strokeStyle = COL.a; ctx.lineWidth = 2.2; ctx.beginPath();
  for (let i = 0; i <= N; i++) { const u = i / N, d = densityAt(u, animT); const X = sx(u), Y = sy(d); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
  ctx.stroke();

  // componenti reale/immaginaria (opzionali), centrate su una propria linea di base più in alto
  if (P.showComponents) {
    const reIm0 = G.marginT + G.plotH * 0.24, reImScale = (G.plotH * 0.20) / 1.55;
    ctx.strokeStyle = T.ring; ctx.lineWidth = 0.6; ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(sx(0), reIm0); ctx.lineTo(sx(1), reIm0); ctx.stroke(); ctx.setLineDash([]);
    [['re', COL.re], ['im', COL.im]].forEach(([key, col]) => {
      ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.setLineDash([4, 3]); ctx.beginPath();
      for (let i = 0; i <= N; i++) { const u = i / N, c = componentsAt(u, animT); const X = sx(u), Y = reIm0 - c[key] * reImScale; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
      ctx.stroke(); ctx.setLineDash([]);
    });
  }
  ctx.restore();

  // intestazione e info fisiche
  ctx.textAlign = 'left';
  ctx.fillStyle = T.accent; ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.fillText('Buca di Potenziale Infinita — E_n = n²π²ℏ²/(2mL²)', 14, 22);
  ctx.fillStyle = T.txt; ctx.font = '10px "Space Mono",monospace';
  if (P.mode === 'single') {
    ctx.fillText(`n=${P.n}   E_n=${EnEV(P.n).toFixed(4)} eV   stato stazionario: |Ψ|² non cambia nel tempo`, 14, 40);
  } else {
    const Tp = beatPeriodFs();
    ctx.fillText(`n₁=${P.n1} (E=${EnEV(P.n1).toFixed(3)} eV)   n₂=${P.n2} (E=${EnEV(P.n2).toFixed(3)} eV)   ${Tp != null ? `T_battimento=${Tp.toFixed(2)} fs` : 'n₁=n₂: nessun battimento'}`, 14, 40);
  }

  ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText(P.mode === 'single' ? 'un autostato puro non evolve: prova la sovrapposizione per vedere il pacchetto "sloscare" nella buca' : 'la sovrapposizione di due autostati sloscia con periodo T = h / (E₂ − E₁)', W / 2, H - 8);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
function gBase(ctx, W, H, PAD) {
  ctx.fillStyle = T.gBg; ctx.fillRect(0, 0, W, H);
  const gW = W - PAD.l - PAD.r, gH = H - PAD.t - PAD.b;
  ctx.strokeStyle = T.gAxis; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(PAD.l, PAD.t); ctx.lineTo(PAD.l, PAD.t + gH); ctx.lineTo(PAD.l + gW, PAD.t + gH); ctx.stroke();
  return { gW, gH };
}
// 1: ⟨x⟩/L nel tempo — asse Y SEMPRE 0..1 (⟨x⟩/L è un'aspettazione di posizione relativa,
// intrinsecamente limitata a quell'intervallo qualunque siano n₁,n₂,L o la particella)
function drawGraphMeanU() {
  const cv = gCanvas[0]; if (!cv || !cv.width) return;
  const ctx = gCtx[0], W = cv.width, H = cv.height, PAD = { t: 14, b: 16, l: 22, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const mid = PAD.t + gH / 2;
  ctx.strokeStyle = T.gAxis; ctx.lineWidth = 0.4; ctx.setLineDash([2, 3]);
  ctx.beginPath(); ctx.moveTo(PAD.l, mid); ctx.lineTo(PAD.l + gW, mid); ctx.stroke(); ctx.setLineDash([]);
  ctx.save(); ctx.beginPath(); ctx.rect(PAD.l, PAD.t, gW, gH); ctx.clip();
  const xOf = t => PAD.l + (t - (animT - WIN_T)) / WIN_T * gW;
  const yOf = u => PAD.t + gH - clamp(u, 0, 1) * gH;
  if (hist.length > 1) {
    ctx.strokeStyle = COL.a; ctx.lineWidth = 1.5; ctx.beginPath();
    hist.forEach((p, i) => { const x = xOf(p.t), y = yOf(p.u); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('⟨x⟩/L', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('t', PAD.l + gW - 2, PAD.t + gH - 3);
}
// 2: diagramma dei livelli energetici E_n (n=1..8) — ricalcolato ad ogni frame da L/particella
// correnti (non è un'evoluzione temporale, quindi nessun conflitto con la regola "assi fissi")
function drawGraphLevels() {
  const cv = gCanvas[1]; if (!cv || !cv.width) return;
  const ctx = gCtx[1], W = cv.width, H = cv.height, PAD = { t: 14, b: 16, l: 8, r: 10 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const NMAX = 8, Emax = EnEV(NMAX) * 1.12;
  const xOf = n => PAD.l + (n - 0.5) / NMAX * gW;
  const yOf = e => PAD.t + gH - clamp(e / Emax, 0, 1) * gH;
  const activeSet = P.mode === 'single' ? [P.n] : [P.n1, P.n2];
  for (let n = 1; n <= NMAX; n++) {
    const isActive = activeSet.includes(n);
    const x = xOf(n), y = yOf(EnEV(n));
    ctx.strokeStyle = isActive ? COL.a : 'rgba(150,205,225,0.35)'; ctx.lineWidth = isActive ? 2.4 : 1.2;
    ctx.beginPath(); ctx.moveTo(x - gW / NMAX * 0.32, y); ctx.lineTo(x + gW / NMAX * 0.32, y); ctx.stroke();
    ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'center';
    ctx.fillText(String(n), x, PAD.t + gH + 9);
  }
  if (P.mode === 'super' && P.n1 !== P.n2) {
    const y1 = yOf(EnEV(P.n1)), y2 = yOf(EnEV(P.n2));
    const xb = PAD.l + gW * 0.92;
    ctx.strokeStyle = COL.b; ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
    ctx.beginPath(); ctx.moveTo(xb, y1); ctx.lineTo(xb, y2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = COL.b; ctx.font = 'bold 8px "Space Mono",monospace'; ctx.textAlign = 'left';
    ctx.fillText('ΔE', xb + 3, (y1 + y2) / 2 + 3);
  }
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('E (eV)', PAD.l + 2, PAD.t + 7);
}
// 3: Re(Ψ)/Im(Ψ) istantanei lungo u — asse Y fisso ±1.55 (|φ_n|≤√2 sempre, qualunque n)
function drawGraphComponents() {
  const cv = gCanvas[2]; if (!cv || !cv.width) return;
  const ctx = gCtx[2], W = cv.width, H = cv.height, PAD = { t: 14, b: 16, l: 18, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const zero = PAD.t + gH / 2, YM = 1.55;
  ctx.strokeStyle = T.gAxis; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(PAD.l, zero); ctx.lineTo(PAD.l + gW, zero); ctx.stroke();
  [['re', COL.re], ['im', COL.im]].forEach(([key, col]) => {
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i <= 200; i++) { const u = i / 200, c = componentsAt(u, animT); const x = PAD.l + u * gW, y = zero - c[key] / YM * (gH * 0.46); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
  });
  ctx.fillStyle = COL.re; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('Re(Ψ)', PAD.l + 2, PAD.t + 7);
  ctx.fillStyle = COL.im; ctx.textAlign = 'right'; ctx.fillText('Im(Ψ)', PAD.l + gW - 2, PAD.t + 7);
}
function drawGraphs() {
  const titles = ['⟨x⟩/L nel tempo', 'Livelli energetici E_n', 'Re(Ψ), Im(Ψ) — istantanea'];
  for (let i = 0; i < 3; i++) if (gTitle[i]) gTitle[i].textContent = titles[i];
  drawGraphMeanU(); drawGraphLevels(); drawGraphComponents();
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls() {
  const cont = document.getElementById('controls'); cont.innerHTML = '';

  const sm = Lab.Section('Modalità'); cont.appendChild(sm.el);
  sm.add(Lab.RadioGroup({
    label: 'Stato della particella', value: P.mode,
    options: [{ value: 'single', label: 'Autostato singolo', hint: 'stazionario' }, { value: 'super', label: 'Sovrapposizione', hint: 'dinamica' }],
    onChange(v) { P.mode = v; resetSim(); buildControls(); },
  }));
  if (P.mode === 'single') {
    sm.add(Lab.Slider({ label: 'Numero quantico n', min: 1, max: 8, step: 1, value: P.n, unit: '', onChange(v) { P.n = v; } }));
  } else {
    sm.add(Lab.Slider({ label: 'Numero quantico n₁', min: 1, max: 6, step: 1, value: P.n1, unit: '', onChange(v) { P.n1 = v; resetSim(); } }));
    sm.add(Lab.Slider({ label: 'Numero quantico n₂', min: 1, max: 6, step: 1, value: P.n2, unit: '', onChange(v) { P.n2 = v; resetSim(); } }));
  }

  const sb = Lab.Section('Buca e particella'); cont.appendChild(sb.el);
  sb.add(Lab.Slider({ label: 'Larghezza pozzo L', min: 0.2, max: 3, step: 0.05, value: P.L_nm, unit: ' nm', onChange(v) { P.L_nm = v; } }));
  sb.add(Lab.RadioGroup({
    label: 'Particella', value: P.particle,
    options: [{ value: 'electron', label: 'Elettrone' }, { value: 'proton', label: 'Protone' }],
    onChange(v) { P.particle = v; },
  }));

  const sv = Lab.Section('Visualizzazione'); cont.appendChild(sv.el);
  sv.add(Lab.Toggle({ label: 'Mostra Re(Ψ) / Im(Ψ)', value: P.showComponents, onChange(v) { P.showComponents = v; } }));
  sv.add(Lab.Slider({ label: 'Velocità animazione', min: 0.2, max: 10, step: 0.1, value: P.speed, unit: '×', onChange(v) { P.speed = v; } }));
}

function buildReadout() {
  const cont = document.getElementById('readout'); cont.innerHTML = '';
  readout = new Lab.Readout(cont, [
    { key: 't', label: 'Tempo (animazione)' },
    { key: 'E', label: 'Energia' },
    { key: 'dE', label: 'ΔE' },
    { key: 'T', label: 'Periodo battimento' },
    { key: 'x', label: '⟨x⟩ / L' },
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
    P.mode = 'single'; P.n = 2; P.n1 = 1; P.n2 = 2; P.L_nm = 1.0; P.particle = 'electron';
    P.showComponents = false; P.speed = 1.0; P.paused = false;
    resetSim(); buildControls(); syncPlay();
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
    if (!P.paused) step(dt * P.speed);
    try {
      draw(simCanvas); drawGraphs();
      const Tp = beatPeriodFs();
      readout.set('t', animT.toFixed(2) + ' s');
      readout.set('E', P.mode === 'single' ? EnEV(P.n).toFixed(4) + ' eV' : `${EnEV(P.n1).toFixed(3)} / ${EnEV(P.n2).toFixed(3)} eV`);
      readout.set('dE', P.mode === 'single' ? '—' : fmtSci(Math.abs(EnEV(P.n2) - EnEV(P.n1)), ' eV'));
      readout.set('T', Tp != null ? Tp.toFixed(2) + ' fs' : '—');
      readout.set('x', meanU(animT).toFixed(3));
    } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
