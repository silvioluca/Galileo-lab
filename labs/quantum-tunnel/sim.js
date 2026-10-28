'use strict';

// ═══ Costanti fisiche ═════════════════════════════════════════════════════════
const TWO = Math.PI * 2;
const HBAR = 1.054571817e-34;                               // J·s
const ME = 9.1093837015e-31;                                 // kg
const MP = 1.67262192369e-27;                                // kg
const EV = 1.602176634e-19;                                  // J
const TIME_COMPRESSION = 6e14;                                // stesso principio di [[quantum-well]]: i tempi reali
                                                                // sono femtosecondi, l'orologio a schermo li comprime
                                                                // in modo FISSO (non arbitrario) così cambiare massa
                                                                // o energia cambia visibilmente anche il ritmo
const COL = { psi: '#00d4ff', re: '#00d4ff', im: '#ff5d9e', barrier: 'rgba(255,140,90,0.28)', T: '#2ecc71', R: '#ff6b6b' };

// ═══ Griglia numerica (Crank–Nicolson, potenziale assorbente ai bordi) ═════════
const N = 640;
const X_MIN_NM = -10, X_MAX_NM = 10;                          // dominio spaziale fisso, nm
const DX_NM = (X_MAX_NM - X_MIN_NM) / (N - 1);
const CAP_START_NM = 7.6;                                     // da qui in poi (su entrambi i lati) il potenziale
const GAMMA0_EV = 3.5;                                        // assorbente "smorza" l'onda invece di rifletterla
                                                                // sul bordo del dominio numerico
const xArr = new Float64Array(N);
for (let j = 0; j < N; j++) xArr[j] = (X_MIN_NM + j * DX_NM) * 1e-9;

const P = {
  V0_eV: 1.0, width_nm: 0.3,                                  // barriera
  E0_eV: 0.6, sigma_nm: 0.7,                                  // pacchetto d'onda incidente
  particle: 'electron',
  showComponents: false,
  speed: 1.0,
  paused: false,
};

// stato dinamico
let psiRe = new Float64Array(N), psiIm = new Float64Array(N);
let Vgrid = new Float64Array(N), Gam = new Float64Array(N);
let offRe = 0;                                                 // termine cinetico fuori-diagonale (reale, costante)
let diagRe = new Float64Array(N);                               // parte reale della diagonale di H (cinetica+potenziale)
let invDiag0Re = 0, invDiag0Im = 0;                             // 1/diag[0] di A, precalcolato
let cPrimeRe = new Float64Array(N), cPrimeIm = new Float64Array(N);
let invMRe = new Float64Array(N), invMIm = new Float64Array(N); // reciproci dei pivot, precalcolati una volta per H
let bRe = new Float64Array(N), bIm = new Float64Array(N);
let dPrimeRe = new Float64Array(N), dPrimeIm = new Float64Array(N);
let alphaRe = 0, alphaIm = 0;                                   // α = i·dt/(2ℏ)
let DT_PHYS = 0;                                                // passo temporale fisico per sub-step (s)

let animT = 0, last = 0, reflectedProb = 0, transmittedProb = 0, currentNorm = 1, finished = false;
let hist = [];
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
    ring: d ? 'rgba(150,175,205,0.4)' : 'rgba(60,95,130,0.45)', grid: d ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)',
    cap: d ? 'rgba(150,120,255,0.10)' : 'rgba(100,70,200,0.08)',
    gBg: d ? 'rgb(3,9,22)' : '#eef2f7', gAxis: d ? 'rgba(100,155,210,0.3)' : 'rgba(40,80,130,0.32)', gText: d ? 'rgba(150,205,225,0.88)' : 'rgba(25,65,105,0.92)',
  };
}
let T = pal();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const fmtPct = x => Lab.fmt((x * 100),1) + '%';

// ═══ Fisica ═══════════════════════════════════════════════════════════════════
const mass = () => P.particle === 'proton' ? MP : ME;
// Coefficiente di trasmissione ESATTO per una barriera rettangolare (formula da manuale, es.
// Griffiths): usato come confronto "teorico" con quanto misura davvero la simulazione numerica —
// se la CAP (potenziale assorbente) fosse mal tarata i due valori divergerebbero, quindi questo
// numero è anche una verifica di correttezza del solutore, non solo un readout didattico.
function TTheory(E0eV, V0eV, widthNm, m) {
  const a = widthNm * 1e-9;
  let E = E0eV * EV, V0 = V0eV * EV;
  if (Math.abs(E - V0) < 1e-6 * EV) E = V0 + 1e-6 * EV;         // evita la singolarità rimovibile 0/0 in E=V0
  if (E < V0) {
    const kappa = Math.sqrt(2 * m * (V0 - E)) / HBAR, sh = Math.sinh(kappa * a);
    return 1 / (1 + (V0 * V0 * sh * sh) / (4 * E * (V0 - E)));
  }
  const kp = Math.sqrt(2 * m * (E - V0)) / HBAR, si = Math.sin(kp * a);
  return 1 / (1 + (V0 * V0 * si * si) / (4 * E * (E - V0)));
}

// ── Thomas complesso: precompila i coefficienti dell'algoritmo di eliminazione (cPrime, invM)
// UNA SOLA VOLTA quando cambia la barriera/particella (matrice A costante nel tempo) — ad ogni
// passo Crank–Nicolson serve solo la sostituzione in avanti/indietro con il nuovo termine noto b,
// O(N) senza divisioni complesse a runtime.
function cdiv(are, aim, bre, bim) { const d = bre * bre + bim * bim; return [(are * bre + aim * bim) / d, (aim * bre - are * bim) / d]; }

function rebuildHamiltonian() {
  const m = mass(), dx = DX_NM * 1e-9;
  offRe = -(HBAR * HBAR) / (2 * m * dx * dx);
  const kinDiag = -2 * offRe;
  const halfW = P.width_nm / 2 * 1e-9;
  for (let j = 0; j < N; j++) {
    Vgrid[j] = (Math.abs(xArr[j]) <= halfW) ? P.V0_eV * EV : 0;
    const capDist = Math.abs(xArr[j] * 1e9) - CAP_START_NM;
    Gam[j] = capDist > 0 ? GAMMA0_EV * EV * (capDist / (X_MAX_NM - CAP_START_NM)) ** 2 : 0;
    diagRe[j] = kinDiag + Vgrid[j];
  }
  // dt fisico per sub-step: piccolo abbastanza da risolvere sia l'energia cinetica tipica sia
  // l'altezza di barriera più alta selezionabile, indipendente dallo slider "velocità" (che
  // controlla solo QUANTI sub-step girano per frame, mai l'accuratezza numerica)
  const Escale = Math.max(P.E0_eV, P.V0_eV, 0.3) * EV;
  DT_PHYS = (HBAR / Escale) * 0.06;
  const dtHalf = DT_PHYS / 2;
  alphaRe = 0; alphaIm = dtHalf / HBAR;                          // α = i·dt/(2ℏ)  → Re=0, Im=dt/(2ℏ)

  // A = I + αH  (H ha diagonale complessa: diagRe[j] − i·Gam[j])
  const offAre = 0, offAim = alphaIm * offRe;                    // α·off = (i·αim)·off, off reale puro → parte immaginaria
  let prevMre = 0, prevMim = 0;
  for (let j = 0; j < N; j++) {
    const Hjjre = diagRe[j], Hjjim = -Gam[j];
    let Are = 1 - alphaIm * Hjjim, Aim = alphaIm * Hjjre;         // 1 + i·αim·(Hre+iHim) = 1 - αim·Him + i·αim·Hre
    if (j === 0) {
      const inv = cdiv(1, 0, Are, Aim); invDiag0Re = inv[0]; invDiag0Im = inv[1];
      const cp = cdiv(offAre, offAim, Are, Aim); cPrimeRe[0] = cp[0]; cPrimeIm[0] = cp[1];
      prevMre = Are; prevMim = Aim;
    } else {
      // m_j = A_jj − sub·cPrime[j-1]  (sub = offAre,offAim, stesso valore costante)
      const subCPre = offAre * cPrimeRe[j - 1] - offAim * cPrimeIm[j - 1];
      const subCPim = offAre * cPrimeIm[j - 1] + offAim * cPrimeRe[j - 1];
      const Mre = Are - subCPre, Mim = Aim - subCPim;
      const invM = cdiv(1, 0, Mre, Mim); invMRe[j] = invM[0]; invMIm[j] = invM[1];
      if (j < N - 1) { const cp = cdiv(offAre, offAim, Mre, Mim); cPrimeRe[j] = cp[0]; cPrimeIm[j] = cp[1]; }
      prevMre = Mre; prevMim = Mim;
    }
  }
}

function newPacket() {
  rescaleDensityAxis();
  const m = mass(), k0 = Math.sqrt(2 * m * P.E0_eV * EV) / HBAR;
  const sigma = P.sigma_nm * 1e-9, x0 = -6e-9;
  let norm = 0;
  for (let j = 0; j < N; j++) {
    const dxj = xArr[j] - x0;
    const env = Math.exp(-(dxj * dxj) / (4 * sigma * sigma));
    psiRe[j] = env * Math.cos(k0 * xArr[j]);
    psiIm[j] = env * Math.sin(k0 * xArr[j]);
    norm += (psiRe[j] * psiRe[j] + psiIm[j] * psiIm[j]);
  }
  norm *= DX_NM * 1e-9;
  const s = 1 / Math.sqrt(norm);
  for (let j = 0; j < N; j++) { psiRe[j] *= s; psiIm[j] *= s; }
  animT = 0; reflectedProb = 0; transmittedProb = 0; currentNorm = 1; finished = false; hist = [];
  rebuildHamiltonian();
}

function cnStep() {
  const dx = DX_NM * 1e-9;
  const offBre = 0, offBim = -alphaIm * offRe;                   // B = I - αH → off_B = -α·off = -i·αim·off
  // b = B·Ψ  (matvec tridiagonale con Dirichlet Ψ=0 fuori dal dominio)
  for (let j = 0; j < N; j++) {
    const Hjjre = diagRe[j], Hjjim = -Gam[j];
    const Bre = 1 + alphaIm * Hjjim, Bim = -alphaIm * Hjjre;
    let re = Bre * psiRe[j] - Bim * psiIm[j], im = Bre * psiIm[j] + Bim * psiRe[j];
    if (j > 0) { re += offBre * psiRe[j - 1] - offBim * psiIm[j - 1]; im += offBre * psiIm[j - 1] + offBim * psiRe[j - 1]; }
    if (j < N - 1) { re += offBre * psiRe[j + 1] - offBim * psiIm[j + 1]; im += offBre * psiIm[j + 1] + offBim * psiRe[j + 1]; }
    bRe[j] = re; bIm[j] = im;
  }
  // assorbimento: quanta probabilità viene "smorzata" in questo passo, separata per lato sinistro/destro
  let leftLoss = 0, rightLoss = 0;
  for (let j = 0; j < N; j++) {
    if (Gam[j] <= 0) continue;
    const dens = psiRe[j] * psiRe[j] + psiIm[j] * psiIm[j];
    const loss = (2 * Gam[j] / HBAR) * dens * dx * DT_PHYS;
    if (xArr[j] < 0) leftLoss += loss; else rightLoss += loss;
  }
  reflectedProb += leftLoss; transmittedProb += rightLoss;

  // Thomas: sostituzione in avanti (dPrime) — offA = -alphaIm*offRe (stesso di rebuildHamiltonian)
  const offAre = 0, offAim = alphaIm * offRe;
  dPrimeRe[0] = bRe[0] * invDiag0Re - bIm[0] * invDiag0Im;
  dPrimeIm[0] = bRe[0] * invDiag0Im + bIm[0] * invDiag0Re;
  for (let j = 1; j < N; j++) {
    const subDre = offAre * dPrimeRe[j - 1] - offAim * dPrimeIm[j - 1];
    const subDim = offAre * dPrimeIm[j - 1] + offAim * dPrimeRe[j - 1];
    const rhsRe = bRe[j] - subDre, rhsIm = bIm[j] - subDim;
    dPrimeRe[j] = rhsRe * invMRe[j] - rhsIm * invMIm[j];
    dPrimeIm[j] = rhsRe * invMIm[j] + rhsIm * invMRe[j];
  }
  // sostituzione all'indietro
  psiRe[N - 1] = dPrimeRe[N - 1]; psiIm[N - 1] = dPrimeIm[N - 1];
  for (let j = N - 2; j >= 0; j--) {
    const cxRe = cPrimeRe[j] * psiRe[j + 1] - cPrimeIm[j] * psiIm[j + 1];
    const cxIm = cPrimeRe[j] * psiIm[j + 1] + cPrimeIm[j] * psiRe[j + 1];
    psiRe[j] = dPrimeRe[j] - cxRe; psiIm[j] = dPrimeIm[j] - cxIm;
  }

  animT += DT_PHYS * TIME_COMPRESSION;
  let normNow = 0; for (let j = 0; j < N; j++) normNow += psiRe[j] * psiRe[j] + psiIm[j] * psiIm[j];
  currentNorm = normNow * dx;
  if (currentNorm < 0.01) finished = true;
}

function step(dtDisplay) {
  if (finished) return;
  const subSteps = clamp(Math.round(dtDisplay / (DT_PHYS * TIME_COMPRESSION)), 1, 60);
  for (let k = 0; k < subSteps && !finished; k++) cnStep();
  hist.push({ t: animT, R: reflectedProb, Tt: transmittedProb, rem: currentNorm });
}

// ═══ Rendering ════════════════════════════════════════════════════════════════
function drawGrid(ctx, W, H) {
  ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}
// Scala verticale della densità |Ψ|²: NON un numero fisso arbitrario (un pacchetto gaussiano
// normalizzato ha picco ≈1/(σ√2π) — con σ piccolo, ad es. lo slider minimo 0.2nm, il picco vero
// supera facilmente 10⁹ m⁻¹, molto oltre una costante generica scelta a caso, quindi la curva
// veniva ritagliata di netto dal clip del riquadro invece di rientrare dentro). Ricalcolata in
// `newPacket()` — cioè al cambio di parametro, mai durante l'evoluzione — con un margine ×3.5
// per lasciare spazio ai picchi di interferenza (incidente+riflessa possono sommarsi in fase).
let DENS_MAX = 3.2e8, PSI_MAX = Math.sqrt(DENS_MAX);
function rescaleDensityAxis() {
  const peak = 1 / (P.sigma_nm * 1e-9 * Math.sqrt(2 * Math.PI));
  DENS_MAX = peak * 3.5;
  PSI_MAX = Math.sqrt(DENS_MAX);
}
function geom(W, H) {
  const marginL = 20, marginR = 20, marginT = 50, marginB = 34;
  const plotW = Math.max(10, W - marginL - marginR), plotH = Math.max(10, H - marginT - marginB);
  G = { marginL, marginR, marginT, marginB, plotW, plotH, W, H };
}
const sx = xnm => G.marginL + (xnm - X_MIN_NM) / (X_MAX_NM - X_MIN_NM) * G.plotW;
const sy0 = () => G.marginT + G.plotH;
const sy = d => sy0() - clamp(d / DENS_MAX, 0, 1) * G.plotH;

function draw(canvas) {
  const [ctx, W, H] = Lab.ctx2d(canvas);
  T = pal();
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
  drawGrid(ctx, W, H);
  geom(W, H);

  // zone assorbenti (bordo dominio numerico)
  ctx.fillStyle = T.cap;
  ctx.fillRect(sx(X_MIN_NM), G.marginT, sx(-CAP_START_NM) - sx(X_MIN_NM), G.plotH);
  ctx.fillRect(sx(CAP_START_NM), G.marginT, sx(X_MAX_NM) - sx(CAP_START_NM), G.plotH);

  // barriera di potenziale
  const halfW = P.width_nm / 2;
  const barrH = clamp(P.V0_eV / 3.5, 0, 1) * G.plotH * 0.9;
  ctx.fillStyle = COL.barrier;
  ctx.fillRect(sx(-halfW), sy0() - barrH, sx(halfW) - sx(-halfW), barrH);
  ctx.strokeStyle = 'rgba(255,140,90,0.8)'; ctx.lineWidth = 1.4;
  ctx.strokeRect(sx(-halfW), sy0() - barrH, sx(halfW) - sx(-halfW), barrH);
  ctx.fillStyle = 'rgba(255,160,110,0.85)'; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText(`V₀=${Lab.fmt(P.V0_eV,2)} eV`, sx(0), sy0() - barrH - 6);

  // linea di base
  ctx.strokeStyle = T.ring; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(sx(X_MIN_NM), sy0()); ctx.lineTo(sx(X_MAX_NM), sy0()); ctx.stroke();

  // densità di probabilità |Ψ(x)|²
  ctx.save(); ctx.beginPath(); ctx.rect(G.marginL, G.marginT, G.plotW, G.plotH); ctx.clip();
  ctx.beginPath();
  for (let j = 0; j < N; j += 2) { const d = psiRe[j] * psiRe[j] + psiIm[j] * psiIm[j]; const X = sx(xArr[j] * 1e9), Y = sy(d); j ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
  ctx.lineTo(sx(X_MAX_NM), sy0()); ctx.lineTo(sx(X_MIN_NM), sy0()); ctx.closePath();
  const fillGrad = ctx.createLinearGradient(0, G.marginT, 0, sy0());
  fillGrad.addColorStop(0, 'rgba(0,212,255,0.4)'); fillGrad.addColorStop(1, 'rgba(0,212,255,0.03)');
  ctx.fillStyle = fillGrad; ctx.fill();
  ctx.strokeStyle = COL.psi; ctx.lineWidth = 2; ctx.beginPath();
  for (let j = 0; j < N; j += 2) { const d = psiRe[j] * psiRe[j] + psiIm[j] * psiIm[j]; const X = sx(xArr[j] * 1e9), Y = sy(d); j ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
  ctx.stroke();

  if (P.showComponents) {
    const reIm0 = G.marginT + G.plotH * 0.20, reImScale = (G.plotH * 0.16) / PSI_MAX;
    [['re', COL.re], ['im', COL.im]].forEach(([key, col]) => {
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath();
      for (let j = 0; j < N; j += 2) { const v = key === 're' ? psiRe[j] : psiIm[j]; const X = sx(xArr[j] * 1e9), Y = reIm0 - v * reImScale; j ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
      ctx.stroke(); ctx.setLineDash([]);
    });
  }
  ctx.restore();

  // intestazione
  ctx.textAlign = 'left';
  ctx.fillStyle = T.accent; ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.fillText('Effetto Tunnel — pacchetto d\'onda contro una barriera di potenziale', 14, 22);
  ctx.fillStyle = T.txt; ctx.font = '10px "Space Mono",monospace';
  const regime = P.E0_eV < P.V0_eV ? 'E₀ < V₀ — tunneling classicamente proibito' : 'E₀ > V₀ — riflessione parziale anche sopra la barriera';
  ctx.fillText(`E₀=${Lab.fmt(P.E0_eV,2)} eV   ${P.particle === 'proton' ? 'protone' : 'elettrone'}   ${regime}`, 14, 40);

  ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText(finished ? 'pacchetto assorbito ai bordi — premi "Nuovo pacchetto" per rilanciarlo' : 'le zone violacee ai bordi assorbono l\'onda in uscita (non sono pareti fisiche, solo il confine della simulazione)', W / 2, H - 8);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
// 1: probabilità di essere riflesso, trasmesso o ancora in volo, dal lancio del pacchetto
function drawGraphProb() {
  const g = Lab.panel(gCanvas[0], { title: 'Probabilità: riflessa, trasmessa, in volo', xr: [0, Math.max(animT, 0.5)], xFmt: () => '', yr: [0, 1], yStep: 0.25, xLabel: 'tempo dal lancio →' });
  if (!g) return; const [ctx, f] = g;
  Lab.plotPts(ctx, f, hist.map(p => [p.t, p.rem]), f.C.text, 1.2);
  Lab.plotPts(ctx, f, hist.map(p => [p.t, p.R]), COL.R, 2);
  Lab.plotPts(ctx, f, hist.map(p => [p.t, p.Tt]), COL.T, 2);
  Lab.legend(ctx, f.L + 8, f.T + 8, [[COL.R, 'riflessa R'], [COL.T, 'trasmessa T'], [f.C.text, 'in volo']]);
}
// 2: coefficiente di trasmissione teorico di una barriera rettangolare: non nullo anche sotto V₀ (effetto tunnel)
function drawGraphTE() {
  const Emax = Lab.niceMax(Math.max(P.V0_eV * 2.2, P.E0_eV * 1.6, 1.5)), m = mass();
  const g = Lab.panel(gCanvas[1], { title: 'Trasmissione teorica T(E)', xr: [0, Emax], yr: [0, 1], yStep: 0.25, xLabel: 'energia E (eV)' });
  if (!g) return; const [ctx, f] = g;
  ctx.fillStyle = 'rgba(255,140,90,0.10)'; ctx.fillRect(f.L, f.T, f.X(P.V0_eV) - f.L, f.B - f.T);
  ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(255,140,90,0.8)'; ctx.beginPath(); ctx.moveTo(f.X(P.V0_eV), f.T); ctx.lineTo(f.X(P.V0_eV), f.B); ctx.stroke(); ctx.restore();
  Lab.plot(ctx, f, e => TTheory(Math.max(e, 1e-4), P.V0_eV, P.width_nm, m), [0, Emax], COL.T, 2, [], 400);
  Lab.dot(ctx, f, P.E0_eV, TTheory(P.E0_eV, P.V0_eV, P.width_nm, m), T.accent, 4.5);
  ctx.fillStyle = 'rgba(255,140,90,0.95)'; ctx.font = '9.5px "DM Sans",sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillText('E < V₀: tunnel', f.X(P.V0_eV) - 4, f.B - 10);
}
// 3: parte reale e immaginaria del pacchetto d'onda
function drawGraphComponents() {
  const g = Lab.panel(gCanvas[2], { title: 'Funzione d’onda Ψ(x) all’istante attuale', xr: [X_MIN_NM, X_MAX_NM], xStep: 5, yr: [-PSI_MAX, PSI_MAX], yFmt: () => '', xLabel: 'x (nm)', padL: 14 });
  if (!g) return; const [ctx, f] = g;
  ctx.fillStyle = 'rgba(255,140,90,0.14)'; ctx.fillRect(f.X(-P.width_nm / 2), f.T, f.X(P.width_nm) - f.X(0), f.B - f.T);
  for (const [arr, col] of [[psiRe, COL.re], [psiIm, COL.im]]) {
    const pts = []; for (let j = 0; j < N; j += 2) pts.push([xArr[j] * 1e9, clamp(arr[j], -PSI_MAX, PSI_MAX)]);
    Lab.plotPts(ctx, f, pts, col, 1.4);
  }
  Lab.legend(ctx, f.L + 8, f.T + 8, [[COL.re, 'Re Ψ'], [COL.im, 'Im Ψ']]);
}
function drawGraphs() { drawGraphProb(); drawGraphTE(); drawGraphComponents(); }

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls() {
  const cont = document.getElementById('controls'); cont.innerHTML = '';

  const sp = Lab.Section('Pacchetto incidente'); cont.appendChild(sp.el);
  sp.add(Lab.Slider({ label: 'Energia media E₀', min: 0.05, max: 3, step: 0.05, value: P.E0_eV, unit: ' eV', onChange(v) { P.E0_eV = v; newPacket(); } }));
  sp.add(Lab.Slider({ label: 'Larghezza pacchetto σ', min: 0.2, max: 1.5, step: 0.05, value: P.sigma_nm, unit: ' nm', onChange(v) { P.sigma_nm = v; newPacket(); } }));
  sp.add(Lab.RadioGroup({
    label: 'Particella', value: P.particle,
    options: [{ value: 'electron', label: 'Elettrone' }, { value: 'proton', label: 'Protone' }],
    onChange(v) { P.particle = v; newPacket(); },
  }));
  const bNew = document.createElement('button'); bNew.className = 'ctrl-btn'; bNew.textContent = 'Nuovo pacchetto';
  bNew.addEventListener('click', () => newPacket());
  sp.add(bNew);

  const sb = Lab.Section('Barriera di potenziale'); cont.appendChild(sb.el);
  sb.add(Lab.Slider({ label: 'Altezza V₀', min: 0, max: 3, step: 0.05, value: P.V0_eV, unit: ' eV', onChange(v) { P.V0_eV = v; newPacket(); } }));
  sb.add(Lab.Slider({ label: 'Larghezza', min: 0.05, max: 1.2, step: 0.02, value: P.width_nm, unit: ' nm', onChange(v) { P.width_nm = v; newPacket(); } }));

  const sv = Lab.Section('Visualizzazione'); cont.appendChild(sv.el);
  sv.add(Lab.Toggle({ label: 'Mostra Re(Ψ) / Im(Ψ)', value: P.showComponents, onChange(v) { P.showComponents = v; } }));
  sv.add(Lab.Slider({ label: 'Velocità animazione', min: 0.2, max: 10, step: 0.1, value: P.speed, unit: '×', onChange(v) { P.speed = v; } }));
}

function buildReadout() {
  const cont = document.getElementById('readout'); cont.innerHTML = '';
  readout = new Lab.Readout(cont, [
    { key: 't', label: 'tempo (rallentato)' },
    { key: 'T', label: 'trasmessa (simulazione)' },
    { key: 'Tth', label: 'trasmessa (teoria, E media)' },
    { key: 'R', label: 'riflessa (simulazione)' },
    { key: 'cons', label: 'totale R + T + in volo' },
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
  buildControls(); initGraphs(); buildReadout(); newPacket();
  const simCanvas = document.getElementById('simCanvas');
  const btnPlay = document.getElementById('btnPlay');
  function syncPlay() { btnPlay.textContent = P.paused ? '▶  AVVIA' : '⏸  PAUSA'; }
  syncPlay();
  btnPlay.addEventListener('click', () => { P.paused = !P.paused; syncPlay(); });
  document.getElementById('btnReset').addEventListener('click', () => {
    P.V0_eV = 1.0; P.width_nm = 0.3; P.E0_eV = 0.6; P.sigma_nm = 0.7; P.particle = 'electron';
    P.showComponents = false; P.speed = 1.0; P.paused = false;
    buildControls(); newPacket(); syncPlay();
  });

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
      readout.set('t', Lab.fmt(animT,2) + ' s');
      readout.set('T', fmtPct(transmittedProb));
      readout.set('Tth', fmtPct(TTheory(P.E0_eV, P.V0_eV, P.width_nm, mass())));
      readout.set('R', fmtPct(reflectedProb));
      readout.set('cons', fmtPct(reflectedProb + transmittedProb + currentNorm));
    } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
