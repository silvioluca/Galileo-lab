'use strict';

// ═══ Costanti e fisica ══════════════════════════════════════════════════════════
// Sfera che cade (o sale, se galleggia) in un fluido viscoso: tre forze, tutte esatte —
// peso (4/3)πr³ρ_sfera·g, spinta di Archimede (4/3)πr³ρ_fluido·g, resistenza viscosa di
// Stokes 6πηrv (valida solo in regime laminare, numero di Reynolds basso — verificato e
// dichiarato a schermo, non nascosto). L'equazione del moto m·dv/dt = peso−Archimede−Stokes
// è lineare del primo ordine in v e ha soluzione chiusa esatta (nessuna integrazione numerica):
// v(t) = v_term·(1−e^(−t/τ)),  x(t) = v_term·t − v_term·τ·(1−e^(−t/τ))
// con v_term = 2r²g(ρ_sfera−ρ_fluido)/(9η) e τ = 2r²ρ_sfera/(9η) la costante di tempo.
const TWO = Math.PI * 2;
const G_ACC = 9.81;
const TUBE_HEIGHT_M = 0.40; // altezza del tubo, m — dimensione tipica di un cilindro graduato da laboratorio
const STOKES_RE_LIMIT = 1;   // soglia (approssimata) oltre la quale la legge di Stokes non è più affidabile

const SPHERE_MATERIALS = [
  { name: 'Acciaio', density: 7800, color: '#aab2bd' },
  { name: 'Piombo', density: 11340, color: '#767b82' },
  { name: 'Alluminio', density: 2700, color: '#d7dbe0' },
  { name: 'Vetro', density: 2500, color: '#8fd6ea' },
  { name: 'Legno', density: 600, color: '#b5895a' },
];
const FLUIDS = [
  { name: 'Acqua', density: 1000, viscosity: 0.001, color: 'rgba(90,170,255,0.32)' },
  { name: "Olio d'oliva", density: 920, viscosity: 0.084, color: 'rgba(210,185,60,0.42)' },
  { name: 'Olio motore', density: 900, viscosity: 0.3, color: 'rgba(130,95,40,0.5)' },
  { name: 'Glicerina', density: 1260, viscosity: 1.5, color: 'rgba(225,215,180,0.48)' },
  { name: 'Miele', density: 1400, viscosity: 10, color: 'rgba(220,150,25,0.58)' },
];

const P = {
  sphereIdx: 0, // Acciaio
  fluidIdx: 3,   // Glicerina
  radiusMm: 3,
  speed: 1.0,
  paused: false,
};

let D = {};
let animT = 0, last = 0, dropT = 0;
let hist = [];  // {t,v,x} del tuffo/risalita corrente — azzerato ad ogni nuovo rilascio
let G = {};
let gCanvas = [null, null, null], gCtx = [null, null, null], gTitle = [null, null, null];
let readout;

// ═══ Palette ══════════════════════════════════════════════════════════════════
function dk() { return document.documentElement.dataset.theme !== 'light'; }
function pal() {
  const d = dk();
  return {
    bg: d ? '#06090f' : '#e7edf4', txt: d ? 'rgba(225,238,250,0.96)' : 'rgba(20,40,70,0.95)',
    sub: d ? 'rgba(165,195,220,0.82)' : 'rgba(60,90,125,0.9)', accent: d ? '#00d4ff' : '#0a78b0',
    warn: d ? '#ff9d4d' : '#c0680a', ring: d ? 'rgba(150,175,205,0.4)' : 'rgba(60,95,130,0.45)', grid: d ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
    gBg: d ? 'rgb(3,9,22)' : '#eef2f7', gAxis: d ? 'rgba(100,155,210,0.3)' : 'rgba(40,80,130,0.32)', gText: d ? 'rgba(150,205,225,0.88)' : 'rgba(25,65,105,0.92)',
  };
}
let T = pal();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ═══ Fisica ═══════════════════════════════════════════════════════════════════
function derive() {
  const sm = SPHERE_MATERIALS[P.sphereIdx], fl = FLUIDS[P.fluidIdx];
  const r = P.radiusMm / 1000; // m
  const rhoS = sm.density, rhoF = fl.density, eta = fl.viscosity;
  const a = G_ACC * (1 - rhoF / rhoS); // accelerazione netta: >0 affonda, <0 galleggia, =0 sospesa
  const k = 9 * eta / (2 * r * r * rhoS); // 1/τ
  const tau = 1 / k;
  const vt = Math.abs(a) / k; // modulo della velocità terminale
  const Re = fl.density * vt * (2 * r) / eta; // numero di Reynolds alla velocità terminale
  const dir = a >= 0 ? 1 : -1; // +1 = affonda (verso il basso), -1 = galleggia (verso l'alto)
  D = { sm, fl, r, rhoS, rhoF, eta, a, k, tau, vt, Re, dir, laminar: Re < STOKES_RE_LIMIT };
}
function vAt(t) { return D.vt * (1 - Math.exp(-t / D.tau)); }
function xAt(t) { return D.vt * t - D.vt * D.tau * (1 - Math.exp(-t / D.tau)); }

function newRun() { derive(); animT = 0; dropT = 0; hist = []; }

// ═══ Disegno ══════════════════════════════════════════════════════════════════
function geom(W, H) {
  const tubeW = Math.min(150, W * 0.22);
  const top = 66, bottom = H - 46;
  const cx = W * 0.42;
  G = { cx, top, bottom, tubeW, H: bottom - top };
}
function drawTube(ctx) {
  const { cx, top, bottom, tubeW } = G;
  const rx = tubeW / 2, ry = 10;
  ctx.fillStyle = D.fl.color;
  ctx.beginPath();
  ctx.moveTo(cx - rx, top); ctx.lineTo(cx - rx, bottom);
  ctx.ellipse(cx, bottom, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(cx + rx, top);
  ctx.ellipse(cx, top, rx, ry, 0, 0, Math.PI, true);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = T.ring; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(cx - rx, top); ctx.lineTo(cx - rx, bottom); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + rx, top); ctx.lineTo(cx + rx, bottom); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(cx, top, rx, ry, 0, 0, TWO); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(cx, bottom, rx, ry, 0, 0, Math.PI); ctx.stroke();
  // graduazione (cm)
  ctx.strokeStyle = T.ring; ctx.fillStyle = T.sub; ctx.font = '8px "Space Mono",monospace'; ctx.textAlign = 'left';
  const cmTotal = TUBE_HEIGHT_M * 100;
  for (let cm = 0; cm <= cmTotal; cm += 5) {
    const y = top + (cm / cmTotal) * (bottom - top);
    const w = cm % 10 === 0 ? 8 : 4;
    ctx.beginPath(); ctx.moveTo(cx - rx - w, y); ctx.lineTo(cx - rx, y); ctx.stroke();
    if (cm % 10 === 0) ctx.fillText(`${cm}`, cx - rx - w - 22, y + 3);
  }
}
// dimensione VISIVA della sfera: dichiaratamente non in scala reale col tubo (una sfera di pochi mm
// sarebbe pressoché invisibile su un tubo di 40cm) — solo il moto (posizione, velocità) è a scala reale
function visualRadius() { return clamp(6 + P.radiusMm * 1.8, 7, 26); }
function drawScene(ctx, W, H) {
  geom(W, H);
  drawTube(ctx);
  const rx = G.tubeW / 2 - visualRadius() - 3;
  ctx.save(); ctx.beginPath();
  ctx.rect(G.cx - G.tubeW / 2, G.top, G.tubeW, G.bottom - G.top); ctx.clip();

  const xFrac = clamp(xAt(dropT) / TUBE_HEIGHT_M, 0, 1);
  const yBall = D.dir > 0 ? G.top + xFrac * G.H : G.bottom - xFrac * G.H;
  const vNow = vAt(dropT), vFrac = D.vt > 0 ? clamp(vNow / D.vt, 0, 1) : 0;

  // scia sfumata dietro la sfera, lunghezza proporzionale alla velocità attuale
  const trailLen = 8 + vFrac * 46;
  const trailDir = D.dir > 0 ? -1 : 1;
  const grad = ctx.createLinearGradient(G.cx, yBall, G.cx, yBall + trailDir * trailLen);
  grad.addColorStop(0, 'rgba(0,212,255,0.35)'); grad.addColorStop(1, 'rgba(0,212,255,0)');
  ctx.strokeStyle = grad; ctx.lineWidth = visualRadius() * 0.5;
  ctx.beginPath(); ctx.moveTo(G.cx, yBall); ctx.lineTo(G.cx, yBall + trailDir * trailLen); ctx.stroke();

  // sfera
  const r = visualRadius();
  const grad2 = ctx.createRadialGradient(G.cx - r * 0.35, yBall - r * 0.4, r * 0.1, G.cx, yBall, r * 1.05);
  grad2.addColorStop(0, '#ffffff'); grad2.addColorStop(0.35, D.sm.color); grad2.addColorStop(1, D.sm.color);
  ctx.fillStyle = grad2; ctx.beginPath(); ctx.arc(G.cx, yBall, r, 0, TWO); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.stroke();

  // vettore velocità (lunghezza normalizzata a v/v_term, sempre visibile qualunque sia il valore assoluto)
  const arrowDir = D.dir > 0 ? 1 : -1;
  const arrowLen = 14 + vFrac * 36;
  const ax = G.cx + rx + 26, ay0 = yBall, ay1 = yBall + arrowDir * arrowLen;
  ctx.strokeStyle = T.accent; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(ax, ay0); ctx.lineTo(ax, ay1); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ax, ay1); ctx.lineTo(ax - 4, ay1 - arrowDir * 8); ctx.lineTo(ax + 4, ay1 - arrowDir * 8); ctx.closePath();
  ctx.fillStyle = T.accent; ctx.fill();
  ctx.restore();

  ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText('v', ax + 14, (ay0 + ay1) / 2 + 3);
}
function draw(canvas) {
  const [ctx, W, H] = Lab.ctx2d(canvas);
  T = pal();
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  drawScene(ctx, W, H);

  ctx.textAlign = 'left';
  ctx.fillStyle = T.accent; ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.fillText('Caduta in un Fluido Viscoso', 14, 20);
  ctx.fillStyle = T.txt; ctx.font = '10px "Space Mono",monospace';
  ctx.fillText(`${D.sm.name} (Ø${Lab.fmt((P.radiusMm * 2),1)}mm) in ${D.fl.name}   v_term=${Lab.fmt((D.vt * 100),2)} cm/s`, 14, 36);

  ctx.fillStyle = D.laminar ? T.sub : T.warn; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
  const hint = D.laminar
    ? `regime laminare (Re=${Lab.fmt(D.Re,2)} < ${STOKES_RE_LIMIT}) — la legge di Stokes è una buona approssimazione`
    : `Re=${Lab.fmt(D.Re,1)} ≥ ${STOKES_RE_LIMIT}: fuori dal regime di validità di Stokes — nella realtà la resistenza sarebbe maggiore (turbolenta), qui mostriamo comunque la previsione della formula`;
  ctx.fillText(hint, W / 2, H - 8);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
// 1: velocità nel tempo, che tende alla velocità limite (tratteggiata)
function drawGraphV() {
  const tMax = Math.max(hist.length ? hist[hist.length - 1].t : 0, D.tau * 0.5, 1e-3);
  const vm = Lab.niceMax(D.vt * 100 * 1.15 || 1e-3);
  const g = Lab.panel(gCanvas[0], { title: `Velocità (cm/s) · limite ${Lab.fmt(D.vt * 100, 2)} cm/s`, xr: [0, tMax], yr: [0, vm], xLabel: 't (s)', xFmt: v => Lab.sci(v, 2) });
  if (!g) return; const [ctx, f] = g;
  ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = T.warn; ctx.beginPath(); ctx.moveTo(f.L, f.Y(D.vt * 100)); ctx.lineTo(f.R, f.Y(D.vt * 100)); ctx.stroke(); ctx.restore();
  Lab.plotPts(ctx, f, hist.map(p => [p.t, p.v * 100]), '#00d4ff', 2);
}
// 2: profondità percorsa: prima curva (accelera), poi retta (velocità costante)
function drawGraphX() {
  const tMax = Math.max(hist.length ? hist[hist.length - 1].t : 0, D.tau * 0.5, 1e-3);
  const g = Lab.panel(gCanvas[1], { title: 'Profondità percorsa (cm)', xr: [0, tMax], yr: [0, TUBE_HEIGHT_M * 100], xLabel: 't (s)', xFmt: v => Lab.sci(v, 2) });
  if (!g) return; const [ctx, f] = g;
  Lab.plotPts(ctx, f, hist.map(p => [p.t, p.x * 100]), '#ff9d4d', 2);
}
// 3: velocità limite in funzione del raggio (v ∝ r²). La legge di Stokes vale finché il numero di
//    Reynolds resta sotto 1: oltre, la curva è tratteggiata perché la resistenza vera è maggiore
function drawGraphScaling() {
  const rMaxMm = 15;
  const vtOf = rMm => { const r = rMm / 1000; return Math.abs(G_ACC * (1 - D.rhoF / D.rhoS)) * 2 * r * r * D.rhoS / (9 * D.eta); };
  const reOf = rMm => D.rhoF * vtOf(rMm) * 2 * rMm / 1000 / D.eta;
  const g = Lab.panel(gCanvas[2], { title: 'Velocità limite (m/s) in funzione del raggio', xr: [0, rMaxMm], yr: [0, Lab.niceMax(vtOf(rMaxMm))], xLabel: 'raggio (mm)', yFmt: v => Lab.sci(v, 2) });
  if (!g) return; const [ctx, f] = g;
  Lab.plot(ctx, f, r => (reOf(r) <= 1 ? vtOf(r) : NaN), [0, rMaxMm], '#7fe0a0', 2);
  Lab.plot(ctx, f, r => (reOf(r) > 1 ? vtOf(r) : NaN), [0, rMaxMm], '#7fe0a0', 1.4, [4, 4]);
  Lab.dot(ctx, f, P.radiusMm, D.vt, '#ff9d4d', 4.5);
  Lab.legend(ctx, f.L + 8, f.T + 8, [['#7fe0a0', 'Stokes, Re < 1'], ['#7fe0a0', 'Re > 1: non vale più', [4, 4]]]);
}
function drawGraphs() { drawGraphV(); drawGraphX(); drawGraphScaling(); }

// ═══ Passo di simulazione ═══════════════════════════════════════════════════
function step(dt) {
  animT += dt; dropT += dt;
  hist.push({ t: dropT, v: vAt(dropT), x: xAt(dropT) });
  if (hist.length > 4000) hist.shift();
  if (xAt(dropT) >= TUBE_HEIGHT_M) { dropT = 0; hist = []; }
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls() {
  const cont = document.getElementById('controls'); cont.innerHTML = '';

  const ss = Lab.Section('Sfera'); cont.appendChild(ss.el);
  ss.add(Lab.RadioGroup({
    label: 'Materiale', value: String(P.sphereIdx),
    options: SPHERE_MATERIALS.map((m, i) => ({ value: String(i), label: m.name, hint: `${m.density} kg/m³` })),
    onChange(v) { P.sphereIdx = +v; newRun(); },
  }));
  ss.add(Lab.Slider({ label: 'Raggio', min: 0.5, max: 15, step: 0.1, value: P.radiusMm, unit: ' mm', onChange(v) { P.radiusMm = v; newRun(); } }));

  const sf = Lab.Section('Fluido'); cont.appendChild(sf.el);
  sf.add(Lab.RadioGroup({
    label: 'Tipo', value: String(P.fluidIdx),
    options: FLUIDS.map((f, i) => ({ value: String(i), label: f.name, hint: `η=${f.viscosity} Pa·s` })),
    onChange(v) { P.fluidIdx = +v; newRun(); },
  }));

  const sv = Lab.Section('Simulazione'); cont.appendChild(sv.el);
  sv.add(Lab.Slider({ label: 'Velocità animazione', min: 0.1, max: 5, step: 0.1, value: P.speed, unit: '×', onChange(v) { P.speed = v; } }));
}
function buildReadout() {
  const cont = document.getElementById('readout'); cont.innerHTML = '';
  readout = new Lab.Readout(cont, [
    { key: 'vterm', label: 'Velocità terminale' }, { key: 'tau', label: 'Costante di tempo τ' },
    { key: 're', label: 'Numero di Reynolds' }, { key: 'stato', label: 'Regime' },
    { key: 'depth', label: 'Profondità percorsa' }, { key: 'vnow', label: 'Velocità attuale' },
  ]);
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
  buildControls(); initGraphs(); buildReadout(); newRun();
  const simCanvas = document.getElementById('simCanvas');
  const btnPlay = document.getElementById('btnPlay');
  function syncPlay() { btnPlay.textContent = P.paused ? '▶  AVVIA' : '⏸  PAUSA'; }
  syncPlay();
  btnPlay.addEventListener('click', () => { P.paused = !P.paused; syncPlay(); });
  document.getElementById('btnReset').addEventListener('click', () => { dropT = 0; hist = []; });

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
    if (!P.paused) step(dt * P.speed);
    try {
      draw(simCanvas); drawGraphs();
      readout.set('vterm', `${Lab.fmt((D.vt * 100),2)} cm/s`);
      readout.set('tau', D.tau < 1 ? `${Lab.fmt((D.tau * 1000),1)} ms` : `${Lab.fmt(D.tau,2)} s`);
      readout.set('re', Lab.fmt(D.Re,3));
      readout.set('stato', D.laminar ? 'laminare (Stokes valido)' : 'turbolento (Stokes non valido)');
      readout.set('depth', `${Lab.fmt((xAt(dropT) * 100),1)} cm`);
      readout.set('vnow', `${Lab.fmt((vAt(dropT) * 100),2)} cm/s`);
    } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
