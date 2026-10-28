'use strict';

// ═══ Costanti ═══════════════════════════════════════════════════════════════
const TWO = Math.PI * 2;
const C_LIGHT = 2.998e8;                                          // m/s
const R0 = 12000;                                                 // m — raggio di riferimento (12 km) per una stella di neutroni "tipica" da 1.4 masse solari
const M0 = 1.4;                                                   // masse solari di riferimento
// Il vero rapporto fra il raggio della stella (~10 km) e il raggio del cilindro di luce (da
// centinaia a migliaia di km) è enorme — non rappresentabile su una scala lineare nella stessa
// scena. Si comprime quindi SOLO la posizione a schermo (logaritmicamente, mai i numeri mostrati
// nei readout, che restano quelli veri) fra 1 unità di scena (superficie) e un valore fra questi
// due limiti (il cilindro di luce) — così l'occhio riesce comunque a vedere sia le linee di campo
// vicine alla stella sia il cilindro di luce lontano nella stessa inquadratura.
const SCENE_LC_MIN = 3, SCENE_LC_MAX = 12;
// Un pulsar reale rallenta per irraggiamento di dipolo magnetico su scale di tempo di migliaia o
// milioni di anni — troppo lento da vedere. Come TIME_SLOWDOWN nel ciclotrone o TIME_SCALE nelle
// onde gravitazionali, un SOLO fattore dichiarato comprime SOLO il ritmo con cui il tempo passa
// nella formula esatta del rallentamento (mai la sua forma, che resta quella vera — vedi sotto).
const SPINDOWN_K = 4.2e-23;
// Un pulsar veloce (periodo di pochi ms) compie decine di giri al secondo — impossibile da seguire
// a occhio in un'animazione. Come per gli altri fattori dichiarati qui sopra, si separa la fisica
// (il readout mostra sempre il vero periodo/frequenza) dalla resa: la velocità angolare usata SOLO
// per disegnare la scena è limitata a questo massimo, un valore scelto per restare comprensibile
// qualunque sia il periodo vero impostato.
const OMEGA_VISUAL_MAX = TWO * 0.42;

const P = {
  periodLog10: Math.log10(33),   // periodo di rotazione in ms, su slider logaritmico (i pulsar spaziano da ~1.4 ms a diversi secondi)
  alphaDeg: 45,                    // inclinazione fra asse magnetico e asse di rotazione
  mass: 1.4,                       // masse solari
  showField: true, showRadio: true, showGamma: true,
  speed: 1.0,
  paused: false,
};

let tPhys = 0, last = 0, visualPsi = 0;
let D = null;
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
    gBg: d ? 'rgb(3,9,22)' : '#eef2f7', gAxis: d ? 'rgba(100,155,210,0.3)' : 'rgba(40,80,130,0.32)', gText: d ? 'rgba(150,205,225,0.88)' : 'rgba(25,65,105,0.92)',
  };
}
let T = pal();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ═══ Fisica ═══════════════════════════════════════════════════════════════════
// Rotatore obliquo con campo di dipolo puro. Le linee di campo di un dipolo hanno soluzione ESATTA
// (nessuna approssimazione): in coordinate sferiche centrate sull'asse magnetico, ogni linea segue
// r(θ)=L·sin²θ, dove L (il valore di r all'equatore magnetico) etichetta la linea. Le linee con
// L fino al raggio del cilindro di luce R_lc=c/Ω sono CHIUSE (corotano rigidamente con la stella);
// quelle oltre sono considerate APERTE — non possono chiudersi entro il cilindro di luce senza che
// il loro punto più esterno si muova più veloce della luce — ed è lungo queste che si ritiene
// abbia origine il fascio radio (vicino ai poli magnetici) e, più in generale sul fascio di linee
// aperte, l'emissione gamma. Il semiangolo della calotta polare (l'ultima linea chiusa che tocca il
// cilindro di luce) ha anch'esso soluzione chiusa: ponendo r=Rstar, L=R_lc nella formula del campo,
// sin²θ_pc=Rstar/R_lc → θ_pc=arcsin(√(Rstar/R_lc)) — una formula reale della fisica dei pulsar, non
// una scelta arbitraria.
//
// Un rotatore obliquo (inclinazione α>0) irraggia come un dipolo magnetico rotante e perde energia
// rotazionale: I·dΩ/dt=−(2/3c³)m²Ω³sin²α (m=momento di dipolo, I=momento d'inerzia). A differenza
// di quasi tutta la vera magnetosfera di un pulsar (che richiede simulazioni numeriche), QUESTA
// equazione si integra esattamente: dΩ/Ω³=−k dt (k∝sin²α/I) → Ω(t)=Ω₀/√(1+2Ω₀²k t) — la classica
// legge di frenata a indice n=3 dei testi di astrofisica dei pulsar. Integrando ancora una volta si
// ottiene anche la FASE in forma chiusa (raramente scritta per esteso nei testi standard):
//   φ(t) = [√(1+2Ω₀²k t) − 1] / (Ω₀k)
// (derivata verificata: dφ/dt=Ω₀/√(1+2Ω₀²k t)=Ω(t) ✓). Nessuna integrazione numerica in tutto il
// modello — un rotatore ALLINEATO (α=0) non irraggia affatto per questo canale (fatto fisico
// reale, non un'omissione: k∝sin²α si annulla esattamente), quindi ruota per sempre alla stessa
// velocità, correttamente riprodotto qui come caso limite.
function derive() {
  const M = P.mass;
  const Rstar = R0 * Math.pow(M / M0, -1 / 3);
  const Iner = 0.4 * M * Rstar * Rstar;
  const alpha = P.alphaDeg * Math.PI / 180;
  const periodMs0 = Math.pow(10, P.periodLog10);
  const omega0 = TWO / (periodMs0 / 1000);
  const Rlc = C_LIGHT / omega0;
  const k = SPINDOWN_K * Math.pow(Rstar, 6) * Math.sin(alpha) * Math.sin(alpha) / Iner;
  const thetaPC = Math.asin(clamp(Math.sqrt(Rstar / Rlc), 0, 1));
  const lcRatio = Math.max(1.02, Rlc / Rstar);
  const lcSceneR = clamp(2.2 * Math.log10(lcRatio) + 2, SCENE_LC_MIN, SCENE_LC_MAX);
  D = { M, Rstar, Iner, alpha, omega0, periodMs0, Rlc, k, thetaPC, lcRatio, lcSceneR };
}
function newRun() { tPhys = 0; visualPsi = 0; derive(); }
function omegaAt(t) { return D.k < 1e-30 ? D.omega0 : D.omega0 / Math.sqrt(1 + 2 * D.omega0 * D.omega0 * D.k * t); }
function phaseAt(t) {
  if (D.k < 1e-30) return D.omega0 * t;
  return (Math.sqrt(1 + 2 * D.omega0 * D.omega0 * D.k * t) - 1) / (D.omega0 * D.k);
}
function step(dtScreen) {
  const dtEff = dtScreen * P.speed;
  tPhys += dtEff;
  visualPsi = (visualPsi + Math.min(omegaAt(tPhys), OMEGA_VISUAL_MAX) * dtEff) % TWO;
}

// mappa un raggio VERO (metri) in unità di scena, compresso in scala log fra la superficie (1
// unità) e il cilindro di luce (D.lcSceneR unità) — vedi nota su SCENE_LC_MIN/MAX in cima al file
function sceneR(rTrue) {
  const ratio = Math.max(1, rTrue / D.Rstar);
  if (ratio <= 1.0001) return 1;
  const t = Math.log(ratio) / Math.log(D.lcRatio);
  return 1 + t * (D.lcSceneR - 1);
}
// (r,θ,φ) nel riferimento del dipolo → posizione nella scena, dopo aver inclinato l'asse
// magnetico di α (attorno all'asse x) e ruotato della fase di spin corrente ψ (attorno al vero
// asse di rotazione, z)
function dipToScene(rTrue, theta, phiLine, psi) {
  const rs = sceneR(rTrue);
  const xd = rs * Math.sin(theta) * Math.cos(phiLine), yd = rs * Math.sin(theta) * Math.sin(phiLine), zd = rs * Math.cos(theta);
  const ca = Math.cos(D.alpha), sa = Math.sin(D.alpha);
  const x1 = xd * ca + zd * sa, y1 = yd, z1 = -xd * sa + zd * ca;
  const cs = Math.cos(psi), ss = Math.sin(psi);
  return [x1 * cs - y1 * ss, x1 * ss + y1 * cs, z1];
}

// ═══ Profili di impulso (radio/gamma), forma chiusa in funzione della fase ψ ══════════════════
// Un osservatore vede il polo quando quest'ultimo punta (quasi) verso di lui: l'angolo fra la
// direzione del polo e la linea di vista è β, e l'intensità è modellata come una gaussiana in β —
// il fascio radio è stretto (σ legata all'angolo reale della calotta polare θ_pc), quello gamma più
// largo (le linee aperte più esterne, verso il cilindro di luce, coprono un angolo maggiore) —
// entrambi i poli contribuiscono, il che riproduce naturalmente il caso reale (osservato in molti
// pulsar) di due impulsi per rotazione quando l'inclinazione lo permette. La linea di vista è
// scelta a un angolo ζ dall'asse di rotazione PARI all'inclinazione α (invece di una direzione
// fissa arbitraria, es. equatoriale): questo garantisce che il polo passi esattamente per la linea
// di vista una volta per giro (β_min=|ζ−α|=0) qualunque sia α — una scelta di comodo dichiarata
// (un osservatore reale è a un angolo ζ fisso casuale, e la maggior parte dei pulsar non è
// osservabile da Terra proprio per questo — un effetto di selezione reale), che qui garantisce
// sempre un impulso visibile invece di richiedere all'utente di "trovare" l'angolo giusto.
function poleBeta(psi, poleSign) {
  const sa = Math.sin(D.alpha), ca = Math.cos(D.alpha);
  const cosb = poleSign * (sa * sa * Math.cos(psi) + ca * ca);
  return Math.acos(clamp(cosb, -1, 1));
}
function poleResponse(beta, sigma) { return Math.exp(-(beta * beta) / (2 * sigma * sigma)); }
const RADIO_SIGMA = () => Math.max(0.05, D.thetaPC * 1.1);
const GAMMA_SIGMA = () => Math.max(0.08, D.thetaPC * 3.2);
function radioPoleIntensity(psi, poleSign) { return poleResponse(poleBeta(psi, poleSign), RADIO_SIGMA()); }
function gammaPoleIntensity(psi, poleSign) { return poleResponse(poleBeta(psi, poleSign), GAMMA_SIGMA()); }
function radioIntensity(psi) { return radioPoleIntensity(psi, 1) + radioPoleIntensity(psi, -1); }
function gammaIntensity(psi) { return gammaPoleIntensity(psi, 1) + gammaPoleIntensity(psi, -1); }

// ═══ Rendering 3D (proiezione ortografica orbitale, stesso schema di labs/gyroscope) ══════════
let cam = { az: -0.5, el: 0.4, zoom: 1 };
let camDrag = null;
function drawGrid(ctx, W, H) {
  ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}
const SCENE_EXTENT = SCENE_LC_MAX * 1.15;                          // FISSA — mai ricalcolata sul periodo corrente, altrimenti la vista si "auto-zoommerebbe" e nasconderebbe l'effetto reale di un cilindro di luce che cresce o si restringe
function geom(W, H) {
  const cx = W * 0.5, cy = H * 0.55;
  const S = Math.min(W * 0.85, H * 0.82) * 0.5 / SCENE_EXTENT;
  G = { cx, cy, S, W, H };
}
function proj(v) {
  const ct = Math.cos(cam.az), st = Math.sin(cam.az);
  const x1 = v[0] * ct - v[1] * st, y1 = v[0] * st + v[1] * ct, z1 = v[2];
  const ce = Math.cos(cam.el), se = Math.sin(cam.el);
  const y2 = y1 * ce - z1 * se, z2 = y1 * se + z1 * ce;
  const S = G.S * cam.zoom;
  return { sx: G.cx + x1 * S, sy: G.cy - z2 * S, depth: y2 };            // depth = distanza lungo l'asse di vista dopo la rotazione, per l'ordinamento in profondità (stesso schema di labs/mag-field)
}
function drawSphere(ctx, x, y, r, hi, base) {
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = r * 0.5;
  const grad = ctx.createRadialGradient(x - r * 0.4, y - r * 0.42, r * 0.1, x, y, r * 1.05);
  grad.addColorStop(0, hi); grad.addColorStop(1, base);
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, r, 0, TWO); ctx.fill(); ctx.restore();
}
function strokePolyline(ctx, pts3D) {
  ctx.beginPath();
  pts3D.forEach((v, i) => { const s = proj(v); i ? ctx.lineTo(s.sx, s.sy) : ctx.moveTo(s.sx, s.sy); });
  ctx.stroke();
}

function fieldLineArc(L, thetaStart, thetaEnd, phiLine, psi, N) {
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const theta = thetaStart + (thetaEnd - thetaStart) * i / N;
    const r = L * Math.sin(theta) * Math.sin(theta);
    if (r < D.Rstar * 0.999) continue;
    pts.push(dipToScene(r, theta, phiLine, psi));
  }
  return pts;
}
// Stesso schema di resa delle linee 3D di labs/mag-field: non un colore unico per linea, ma
// TUTTI i segmenti di TUTTE le linee raccolti insieme, ordinati per profondità (l'asse di vista
// rimasto dopo le due rotazioni della telecamera) e disegnati dal più lontano al più vicino, con
// alpha e spessore che crescono verso la telecamera — un effetto di profondità reale invece che
// un semplice groviglio di linee tutte uguali. Qui sottili e blu (invece del bianco di mag-field),
// senza distinguere linee aperte/chiuse per colore: la forma stessa (chiuse=anelli, aperte=archi
// che si interrompono verso il cilindro di luce) resta comunque leggibile.
function drawFieldLines(ctx, psi) {
  const nPlanes = 5, closedLs = [1.3, 2.6].map(f => D.Rstar * (1 + f * (D.lcRatio - 1) / 3.2));
  const openLs = [D.Rlc * 1.3];
  const capR = D.Rlc * 1.35;
  const lines = [];
  for (let p = 0; p < nPlanes; p++) {
    const phiLine = p / nPlanes * TWO;
    closedLs.forEach(L => {
      if (L <= D.Rstar * 1.001) return;
      const th0 = Math.asin(clamp(Math.sqrt(D.Rstar / L), 0, 1));
      lines.push(fieldLineArc(L, th0, Math.PI - th0, phiLine, psi, 36));
    });
    openLs.forEach(L => {
      const th0 = Math.asin(clamp(Math.sqrt(D.Rstar / L), 0, 1));
      const thCap = Math.asin(clamp(Math.sqrt(Math.min(capR, L) / L), 0, 1));
      lines.push(fieldLineArc(L, th0, thCap, phiLine, psi, 20));
      lines.push(fieldLineArc(L, Math.PI - thCap, Math.PI - th0, phiLine, psi, 20));
    });
  }
  const segs = [];
  for (const pts3D of lines) {
    const proj2 = pts3D.map(v => proj(v));
    for (let i = 0; i < proj2.length - 1; i++) {
      segs.push({ a: proj2[i], b: proj2[i + 1], depth: (proj2[i].depth + proj2[i + 1].depth) * 0.5 });
    }
  }
  if (!segs.length) return;
  segs.sort((s1, s2) => s1.depth - s2.depth);
  const dMin = segs[0].depth, dMax = segs[segs.length - 1].depth, dRng = (dMax - dMin) || 1;
  for (const s of segs) {
    const f = (s.depth - dMin) / dRng;
    const alpha = 0.18 + 0.42 * f;
    ctx.strokeStyle = dk() ? `rgba(110,180,255,${alpha.toFixed(2)})` : `rgba(20,100,190,${(alpha + 0.15).toFixed(2)})`;
    ctx.lineWidth = 0.5 + 0.4 * f;
    ctx.beginPath(); ctx.moveTo(s.a.sx, s.a.sy); ctx.lineTo(s.b.sx, s.b.sy); ctx.stroke();
  }
}
function drawLightCylinder(ctx) {
  const pts = [];
  for (let i = 0; i <= 64; i++) { const a = i / 64 * TWO; pts.push([Math.cos(a) * D.lcSceneR, Math.sin(a) * D.lcSceneR, 0]); }
  ctx.strokeStyle = dk() ? 'rgba(255,255,255,0.22)' : 'rgba(40,60,90,0.3)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
  strokePolyline(ctx, pts); ctx.setLineDash([]);
}
function drawAxisLine(ctx, dir, len, color, dash) {
  ctx.strokeStyle = color; ctx.lineWidth = 1.3; if (dash) ctx.setLineDash(dash);
  strokePolyline(ctx, [[-dir[0] * len, -dir[1] * len, -dir[2] * len], [dir[0] * len, dir[1] * len, dir[2] * len]]);
  ctx.setLineDash([]);
}
// estende un segmento (dal punto p0 nella direzione di p1) fino al bordo del canvas — così il
// fascio arriva sempre al margine dell'immagine, qualunque sia lo zoom o la scala della scena,
// invece di fermarsi a una distanza arbitraria calcolata nello spazio 3D
function extendToEdge(p0, p1, W, H) {
  const dx = p1.sx - p0.sx, dy = p1.sy - p0.sy;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return p1;
  let tMax = Infinity;
  if (dx > 0) tMax = Math.min(tMax, (W - p0.sx) / dx); else if (dx < 0) tMax = Math.min(tMax, (0 - p0.sx) / dx);
  if (dy > 0) tMax = Math.min(tMax, (H - p0.sy) / dy); else if (dy < 0) tMax = Math.min(tMax, (0 - p0.sy) / dy);
  if (!Number.isFinite(tMax) || tMax < 0) tMax = 0;
  return { sx: p0.sx + dx * tMax, sy: p0.sy + dy * tMax };
}
// Il fascio radio (stretto) e quello gamma (più largo, più sfumato) sono resi come un cono
// "nebuloso": molti raggi sottilissimi, sparsi nell'angolo del cono con l'angolo aureo (copertura
// uniforme senza pattern visibili a occhio, senza bisogno di numeri casuali), più densi vicino
// all'asse (campionamento in √u anziché lineare) e composti con `globalCompositeOperation:
// 'lighter'` — dove si sovrappongono si sommano, dando naturalmente un nucleo più luminoso verso
// il centro che si dirada verso il bordo, lo stesso effetto "sfumato" del bagliore reale senza
// bisogno di alcun filtro di blur del canvas. L'apice è sempre il CENTRO della stella (non la sua
// superficie): il cono nasce da lì, come richiesto. Ogni raggio si estende fino al bordo del
// canvas. La luminosità complessiva è modulata dalla stessa funzione di intensità dei grafici del
// profilo d'impulso — l'effetto "faro" quando il polo passa vicino alla linea di vista.
function drawBeamCone(ctx, thetaBeam, psi, poleSign, kind) {
  const isRadio = kind === 'radio';
  const farDist = SCENE_EXTENT * 6;
  const nRays = isRadio ? 30 : 46;
  const rgb = isRadio ? '255,255,255' : (dk() ? '225,120,255' : '185,55,220');
  const flash = clamp(isRadio ? radioPoleIntensity(psi, poleSign) : gammaPoleIntensity(psi, poleSign), 0, 1);
  const baseAlpha = (isRadio ? 0.045 : 0.028) + (isRadio ? 0.09 : 0.07) * flash;
  const apex = [0, 0, 0];                                           // il centro della stella, non la sua superficie
  const p0 = proj(apex);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (let i = 0; i < nRays; i++) {
    const u = (i + 0.5) / nRays;
    const theta0 = thetaBeam * Math.sqrt(u);
    const theta = poleSign > 0 ? theta0 : Math.PI - theta0;
    const chi = (i * 2.399963) % TWO;                                // angolo aureo (in radianti): distribuzione azimutale uniforme senza pattern
    const dir = dipToScene(farDist, theta, chi, psi);
    const p1 = proj(dir);
    const edge = extendToEdge(p0, p1, G.W, G.H);
    ctx.globalAlpha = baseAlpha * (0.55 + 0.45 * (1 - u));
    ctx.strokeStyle = `rgba(${rgb},1)`;
    ctx.lineWidth = 1.4 + 3.2 * (1 - u);
    ctx.beginPath(); ctx.moveTo(p0.sx, p0.sy); ctx.lineTo(edge.sx, edge.sy); ctx.stroke();
  }
  // nucleo centrale più marcato, lungo l'asse esatto del fascio
  ctx.globalAlpha = Math.min(1, baseAlpha * 3);
  ctx.strokeStyle = `rgba(${rgb},1)`; ctx.lineWidth = isRadio ? 2.2 : 1.6;
  const axisDir = dipToScene(farDist, poleSign > 0 ? 0.0005 : Math.PI - 0.0005, 0, psi);
  const axisEdge = extendToEdge(p0, proj(axisDir), G.W, G.H);
  ctx.beginPath(); ctx.moveTo(p0.sx, p0.sy); ctx.lineTo(axisEdge.sx, axisEdge.sy); ctx.stroke();
  ctx.restore();
}
function drawStarHalo(ctx, sx, sy, r) {
  const haloR = r * 9;
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, haloR);
  g.addColorStop(0, dk() ? 'rgba(255,255,255,0.9)' : 'rgba(220,235,255,0.85)');
  g.addColorStop(0.1, dk() ? 'rgba(230,242,255,0.65)' : 'rgba(195,220,255,0.6)');
  g.addColorStop(0.22, dk() ? 'rgba(190,215,255,0.32)' : 'rgba(160,195,255,0.3)');
  g.addColorStop(0.5, dk() ? 'rgba(150,190,255,0.12)' : 'rgba(150,190,255,0.12)');
  g.addColorStop(1, 'rgba(150,190,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, haloR, 0, TWO); ctx.fill();
}

function draw(canvas) {
  const [ctx, W, H] = Lab.ctx2d(canvas);
  T = pal();
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
  drawGrid(ctx, W, H);
  geom(W, H);

  const psi = visualPsi;                                           // fase usata per il disegno (limitata, vedi OMEGA_VISUAL_MAX) — i readout usano invece la fase/frequenza VERE

  drawLightCylinder(ctx);
  drawAxisLine(ctx, [0, 0, 1], SCENE_LC_MAX * 1.05, dk() ? 'rgba(150,175,205,0.4)' : 'rgba(60,95,130,0.45)', [2, 3]);
  const magDir = dipToScene(D.Rstar, 0.001, 0, psi);
  const mn = Math.hypot(...magDir) || 1;
  drawAxisLine(ctx, [magDir[0] / mn, magDir[1] / mn, magDir[2] / mn], SCENE_LC_MAX * 0.35, dk() ? 'rgba(255,180,100,0.7)' : 'rgba(190,110,10,0.8)', null);
  const losDir = [Math.sin(D.alpha), 0, Math.cos(D.alpha)];
  ctx.strokeStyle = dk() ? 'rgba(120,255,180,0.4)' : 'rgba(10,140,80,0.5)'; ctx.lineWidth = 1.2; ctx.setLineDash([1, 3]);
  strokePolyline(ctx, [[losDir[0] * SCENE_EXTENT, losDir[1] * SCENE_EXTENT, losDir[2] * SCENE_EXTENT], [losDir[0] * 1.4, losDir[1] * 1.4, losDir[2] * 1.4]]); ctx.setLineDash([]);

  if (P.showField) drawFieldLines(ctx, psi);
  if (P.showGamma) { drawBeamCone(ctx, D.thetaPC * 3.2, psi, 1, 'gamma'); drawBeamCone(ctx, D.thetaPC * 3.2, psi, -1, 'gamma'); }
  if (P.showRadio) { drawBeamCone(ctx, D.thetaPC * 0.85, psi, 1, 'radio'); drawBeamCone(ctx, D.thetaPC * 0.85, psi, -1, 'radio'); }

  const starP = proj([0, 0, 0]);
  const starR = Math.max(4, G.S * cam.zoom * 1.0);
  drawStarHalo(ctx, starP.sx, starP.sy, starR);
  drawSphere(ctx, starP.sx, starP.sy, starR, '#ffffff', '#d8e8ff');
  // nucleo sovraesposto: un secondo passaggio additivo, più piccolo e più bianco, per un aspetto
  // "bruciato" di luce invece di una sfera semplicemente colorata
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const core = ctx.createRadialGradient(starP.sx, starP.sy, 0, starP.sx, starP.sy, starR * 1.15);
  core.addColorStop(0, 'rgba(255,255,255,0.9)');
  core.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = core; ctx.beginPath(); ctx.arc(starP.sx, starP.sy, starR * 1.15, 0, TWO); ctx.fill();
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.fillStyle = T.accent; ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.fillText('Pulsar — rotatore obliquo con campo di dipolo', 14, 22);
  ctx.fillStyle = T.txt; ctx.font = '10px "Space Mono",monospace';
  ctx.fillText(`P=${Lab.fmt((TWO / omegaAt(tPhys) * 1000),2)} ms   α=${Lab.fmt(P.alphaDeg,0)}°   M=${Lab.fmt(P.mass,2)} M☉   θ_pc=${Lab.fmt((D.thetaPC * 180 / Math.PI),1)}°`, 14, 40);

  ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText('linea tratteggiata verde = verso l\'osservatore — trascina per ruotare la vista', W / 2, H - 10);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
// 1–2: profilo dell'impulso su due giri: un picco a ogni passaggio del fascio sulla linea di vista
function drawPulseGraph(idx, fn, color, title) {
  if (!D) return;
  const g = Lab.panel(gCanvas[idx], { title, xr: [0, 720], xStep: 180, yr: [0, 2], yStep: 0.5, xLabel: 'fase di rotazione (°, due giri)' });
  if (!g) return; const [ctx, f] = g;
  Lab.plot(ctx, f, a => fn(a * Math.PI / 180), [0, 720], color, 1.8, [], 480);
  const ph = ((visualPsi % TWO) + TWO) % TWO;
  Lab.dot(ctx, f, ph * 180 / Math.PI, fn(ph), '#ff9d4d', 4); Lab.dot(ctx, f, ph * 180 / Math.PI + 360, fn(ph), '#ff9d4d', 4);
}
// 3: il periodo cresce perché la stella perde energia di rotazione irradiando (rallentamento esagerato)
function drawGraphSpindown() {
  if (!D) return;
  const tMax = Lab.niceMax(Math.max(tPhys * 1.15, 20));
  const g = Lab.panel(gCanvas[2], { title: 'Periodo di rotazione (ms) — rallentamento esagerato', xr: [0, tMax], yr: [0, Lab.niceMax(D.periodMs0 * 3)], xLabel: 't (s)' });
  if (!g) return; const [ctx, f] = g;
  Lab.plot(ctx, f, t => TWO / omegaAt(t) * 1000, [0, tMax], '#7fe0a0', 2);
  Lab.dot(ctx, f, tPhys, TWO / omegaAt(tPhys) * 1000, '#ff9d4d', 4);
}
function drawGraphs() {
  drawPulseGraph(0, radioIntensity, '#00d4ff', 'Impulso radio ricevuto (intensità relativa)');
  drawPulseGraph(1, gammaIntensity, '#c86eff', 'Impulso gamma ricevuto (intensità relativa)');
  drawGraphSpindown();
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls() {
  const cont = document.getElementById('controls'); cont.innerHTML = '';

  const sr = Lab.Section('Rotazione'); cont.appendChild(sr.el);
  sr.add(Lab.Slider({ label: 'Periodo (10^x ms)', min: 0.15, max: 3.3, step: 0.02, value: P.periodLog10, unit: '', onChange(v) { P.periodLog10 = v; newRun(); } }));
  const bNew = document.createElement('button'); bNew.className = 'ctrl-btn'; bNew.textContent = 'Nuovo pulsar';
  bNew.addEventListener('click', () => newRun());
  sr.add(bNew);

  const si = Lab.Section('Inclinazione'); cont.appendChild(si.el);
  si.add(Lab.Slider({ label: 'Inclinazione asse magnetico α', min: 0, max: 90, step: 1, value: P.alphaDeg, unit: '°', onChange(v) { P.alphaDeg = v; newRun(); } }));

  const sm = Lab.Section('Massa'); cont.appendChild(sm.el);
  sm.add(Lab.Slider({ label: 'Massa', min: 1.0, max: 2.2, step: 0.05, value: P.mass, unit: ' M☉', onChange(v) { P.mass = v; newRun(); } }));

  const sv = Lab.Section('Visualizzazione'); cont.appendChild(sv.el);
  sv.add(Lab.Toggle({ label: 'Linee di campo magnetico', value: P.showField, onChange(v) { P.showField = v; } }));
  sv.add(Lab.Toggle({ label: 'Fascio radio', value: P.showRadio, onChange(v) { P.showRadio = v; } }));
  sv.add(Lab.Toggle({ label: 'Raggi gamma', value: P.showGamma, onChange(v) { P.showGamma = v; } }));
  sv.add(Lab.Slider({ label: 'Velocità animazione', min: 0.2, max: 3, step: 0.1, value: P.speed, unit: '×', onChange(v) { P.speed = v; } }));
}

function buildReadout() {
  const cont = document.getElementById('readout'); cont.innerHTML = '';
  readout = new Lab.Readout(cont, [
    { key: 'period', label: 'periodo' },
    { key: 'freq', label: 'frequenza di rotazione' },
    { key: 'rstar', label: 'raggio della stella' },
    { key: 'rlc', label: 'cilindro di luce c/Ω' },
    { key: 'thetapc', label: 'calotta polare' },
    { key: 'mass', label: 'massa' },
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
  buildControls(); initGraphs(); buildReadout(); newRun();
  const simCanvas = document.getElementById('simCanvas');
  const btnPlay = document.getElementById('btnPlay');
  function syncPlay() { btnPlay.textContent = P.paused ? '▶  AVVIA' : '⏸  PAUSA'; }
  syncPlay();
  btnPlay.addEventListener('click', () => { P.paused = !P.paused; syncPlay(); });
  document.getElementById('btnReset').addEventListener('click', () => {
    P.periodLog10 = Math.log10(33); P.alphaDeg = 45; P.mass = 1.4;
    P.showField = true; P.showRadio = true; P.showGamma = true; P.speed = 1.0; P.paused = false;
    buildControls(); newRun(); syncPlay();
  });

  simCanvas.style.cursor = 'grab';
  simCanvas.addEventListener('pointerdown', e => {
    camDrag = { x: e.clientX, y: e.clientY, az: cam.az, el: cam.el };
    simCanvas.setPointerCapture(e.pointerId);
    simCanvas.style.cursor = 'grabbing';
  });
  simCanvas.addEventListener('pointermove', e => {
    if (!camDrag) return;
    const dx = e.clientX - camDrag.x, dy = e.clientY - camDrag.y;
    cam.az = camDrag.az + dx * 0.008;
    cam.el = clamp(camDrag.el - dy * 0.008, -1.4, 1.4);
  });
  simCanvas.addEventListener('pointerup', () => { camDrag = null; simCanvas.style.cursor = 'grab'; });
  simCanvas.addEventListener('pointercancel', () => { camDrag = null; simCanvas.style.cursor = 'grab'; });
  simCanvas.addEventListener('wheel', e => {
    e.preventDefault();
    cam.zoom = clamp(cam.zoom * (e.deltaY > 0 ? 0.92 : 1.08), 0.4, 3);
  }, { passive: false });

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
    if (!P.paused) step(dt);
    try {
      draw(simCanvas); drawGraphs();
      const omega = omegaAt(tPhys), periodMs = TWO / omega * 1000;
      readout.set('period', Lab.fmt(periodMs,2) + ' ms');
      readout.set('freq', Lab.fmt((omega / TWO),2) + ' Hz');
      readout.set('rstar', Lab.fmt((D.Rstar / 1000),2) + ' km');
      readout.set('rlc', Lab.fmt((D.Rlc / 1000),0) + ' km');
      readout.set('thetapc', Lab.fmt((D.thetaPC * 180 / Math.PI),1) + '°');
      readout.set('mass', Lab.fmt(D.M,2) + ' M☉');
    } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
