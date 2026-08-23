'use strict';

// ═══ Costanti ═══════════════════════════════════════════════════════════════
const TWO = Math.PI * 2;
// Frazioni di massa convertite in energia (E=mc²) per ciascun tipo di fusione — valori REALI o
// rappresentativi dai difetti di massa nucleari veri: 4¹H→⁴He libera 26.73 MeV su una massa a
// riposo di ~3727 MeV (0.71%); 3⁴He→¹²C (tripla-alfa) libera 7.275 MeV su ~11178 MeV (0.065%, un
// ordine di grandezza meno efficiente — motivo per cui la combustione dell'elio dura molto meno di
// quella dell'idrogeno pur avendo meno "carburante" da bruciare). Le fasi successive (C,Ne,O,Si)
// hanno frazioni via via più piccole — un fatto fisico reale: l'efficienza della fusione scende
// stadio per stadio avvicinandosi al ferro, che ha l'energia di legame per nucleone più alta di
// tutti i nuclidi — oltre il ferro la fusione non libera più energia, un limite fisico invalicabile,
// non una semplificazione.
const H_MASS_DEFECT = 0.0071, HE_MASS_DEFECT = 0.00065;
const C_MASS_DEFECT = 0.00040, NE_MASS_DEFECT = 0.00025, O_MASS_DEFECT = 0.00018, SI_MASS_DEFECT = 0.00009;
const HE_IGNITION_M = 0.5;                                        // M☉ — sotto questa massa il nucleo di elio non raggiunge mai la temperatura di innesco
const CNO_THRESHOLD_M = 1.3;                                      // M☉ — sopra questa massa il ciclo CNO domina sulla catena protone-protone
const ADV_IGNITION_M = 8;                                         // M☉ — sopra questa massa la stella prosegue oltre l'elio fino al ferro
// Le vere durate delle fasi differiscono di ordini di grandezza (miliardi di anni per l'idrogeno,
// giorni per il silicio in una stella molto massiccia) — troppo per un'animazione. Come altrove in
// questo sito (TIME_SLOWDOWN nel ciclotrone, TIME_SCALE nelle onde gravitazionali), si usa un
// tempo-schermo dichiarato per ogni fase — via via più corto per le fasi avanzate, per dare almeno
// un'idea qualitativa della vera accelerazione verso la fine — mentre il readout mostra sempre la
// vera durata stimata (formule di scala reali, ancorate al Sole).
const STAGE_VISUAL_DURATION = 13;
const ADV_DURATIONS = { Cburn: 8, Neburn: 5, Oburn: 4, Siburn: 3 };
const X_RESIDUAL = 0.02;                                          // una fase si considera "esaurita" a questa frazione residua di combustibile, mai a zero — come in una vera stella

const P = {
  massLog10: 0,                  // M=10^x M☉ — slider logaritmico: la fisica cambia qualitativamente su più ordini di grandezza (soglie a 0.5, 1.3, 8 M☉)
  Xh0: 0.70, Yhe0: 0.28,           // composizione iniziale (frazioni di massa) — il resto è "metalli" inerti Z=1−X−Y
  speed: 1.0,
  paused: false,
};

let animT = 0, last = 0;
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
const smooth = x => x * x * (3 - 2 * x);
const ELEMENT_COLOR = { H: '#00d4ff', He: '#ff9d4d', C: '#7fe0a0', O: '#4dc9ff', Ne: '#a0e0c0', Mg: '#c0e0a0', Si: '#e0c87f', S: '#e0a87f', Fe: '#e07f7f' };

// ═══ Fisica ═══════════════════════════════════════════════════════════════════
// Relazioni di scala di sequenza principale (approssimazioni standard da manuale, valide per
// stelle "tipiche" — non un modello di struttura stellare completo, che richiede di risolvere un
// sistema di equazioni differenziali senza soluzione chiusa generale): L∝M^3.5, R∝M^0.8. La
// temperatura del nucleo si stima dal teorema del viriale (T∝GMμm_H/(Rk_B)), tarata sul Sole
// (1.57×10⁷ K). Il canale dominante (catena pp sotto 1.3 M☉, ciclo CNO sopra) è il ben noto
// risultato della sensibilità alla temperatura molto più estrema del CNO (tasso∝T^~18, contro
// T^~4 della catena pp) — qui applicato come soglia netta invece di calcolare i due tassi assoluti.
//
// SEMPLIFICAZIONE IMPORTANTE, dichiarata: una stella vera brucia più combustibili contemporaneamente
// in gusci concentrici a raggi diversi ("struttura a cipolla" — idrogeno fuori, elio più dentro,
// carbonio ancora più dentro, ...). Qui si modella invece una singola zona che attraversa le fasi
// IN SEQUENZA nel tempo: la sequenza degli elementi prodotti è quella vera, la simultaneità reale
// dei gusci non lo è.
function derive() {
  const M = Math.pow(10, P.massLog10);
  const L = Math.pow(M, 3.5);
  const Rms = Math.pow(M, 0.8);
  const Tcore = 1.57e7 * (M / Rms);
  const cno = M >= CNO_THRESHOLD_M;
  const canHe = M >= HE_IGNITION_M;
  const canAdv = canHe && M >= ADV_IGNITION_M;
  const Xh0 = clamp(P.Xh0, 0.02, 0.98);
  const Yhe0 = clamp(Math.min(P.Yhe0, 1 - Xh0), 0, 1);
  const Z = clamp(1 - Xh0 - Yhe0, 0, 1);
  const tH_years = 1e10 * Math.pow(M, -2.5);                       // durata reale della combustione dell'idrogeno, ancorata ai ~10 miliardi di anni del Sole
  const tHe_years = tH_years * 0.1;                                 // rapporto tipico reale: la fase dell'elio dura circa un decimo di quella dell'idrogeno
  const Rrg = clamp(Rms * (55 / Math.pow(M, 0.35)), Rms * 8, Rms * 260);   // raggio da gigante/supergigante rossa, stima illustrativa
  const Rfinal = canAdv ? 1.4e-5 : 0.010;                           // R☉ — stella di neutroni (~10 km) oppure nana bianca (~0.01 R☉, la dimensione della Terra)
  const stages = [{ name: 'H', dur: STAGE_VISUAL_DURATION }];
  if (canHe) stages.push({ name: 'He', dur: STAGE_VISUAL_DURATION });
  if (canAdv) {
    stages.push({ name: 'Cburn', dur: ADV_DURATIONS.Cburn });
    stages.push({ name: 'Neburn', dur: ADV_DURATIONS.Neburn });
    stages.push({ name: 'Oburn', dur: ADV_DURATIONS.Oburn });
    stages.push({ name: 'Siburn', dur: ADV_DURATIONS.Siburn });
  }
  stages.push({ name: 'Collapse', dur: STAGE_VISUAL_DURATION * 0.35 });
  const totalDur = stages.reduce((s, x) => s + x.dur, 0);
  D = { M, L, Rms, Tcore, cno, canHe, canAdv, Xh0, Yhe0, Z, tH_years, tHe_years, Rrg, Rfinal, stages, totalDur };
}
function newRun() { animT = 0; derive(); }
function step(dt) { animT += dt * P.speed; }

// Il vero tasso di consumo di un combustibile nucleare dipende da temperatura e densità che
// cambiano nel tempo in un modo che richiederebbe di risolvere l'intera struttura stellare (non
// una singola legge di velocità in forma chiusa, a differenza di altre fisiche in questo sito). Un
// primo tentativo con dX/dt=−kX² (che pure si integra esattamente) si è rivelato mal distribuito
// per la visualizzazione: la forma della curva concentra quasi tutto il consumo nel primissimo
// istante della fase, lasciando poi un lungo tratto piatto. Qui si usa quindi un'interpolazione
// liscia dichiarata (smoothstep, lento-veloce-lento) fra X0 e Xend distribuita su tutta la durata
// della fase — una scelta di ritmo onesta, non la soluzione di un'equazione differenziale specifica.
function depletion(X0, Xend, t, dur) {
  if (t <= 0) return X0;
  if (t >= dur) return Xend;
  return X0 + (Xend - X0) * smooth(t / dur);
}
// Ogni fase di fusione è descritta come "consuma questi combustibili, produce questi elementi in
// queste proporzioni, con questa frazione di massa convertita in energia" — dati, non codice
// duplicato per ogni fase: applyStage() è la stessa funzione per idrogeno, elio e tutte le fasi
// avanzate. Le proporzioni C/O, Ne/Mg, O/Mg, Si/S sono rappresentative (i rapporti reali dipendono
// da tassi nucleari e condizioni non modellate qui in dettaglio), ma la SEQUENZA degli elementi
// prodotti — e il fatto che il ferro sia il capolinea — è quella vera.
const STAGE_DEFS = {
  H: { consumes: ['Xh'], produces: [['Yhe', 1.0]], defect: H_MASS_DEFECT },
  He: { consumes: ['Yhe'], produces: [['Xc', 0.42], ['Xo', 0.58]], defect: HE_MASS_DEFECT },
  Cburn: { consumes: ['Xc'], produces: [['Xne', 0.7], ['Xmg', 0.3]], defect: C_MASS_DEFECT },
  Neburn: { consumes: ['Xne'], produces: [['Xo', 0.4], ['Xmg', 0.6]], defect: NE_MASS_DEFECT },
  Oburn: { consumes: ['Xo'], produces: [['Xsi', 0.65], ['Xs', 0.35]], defect: O_MASS_DEFECT },
  Siburn: { consumes: ['Xsi', 'Xs'], produces: [['Xfe', 1.0]], defect: SI_MASS_DEFECT },
};
function applyStage(state, name, tt, dur) {
  const def = STAGE_DEFS[name];
  const fuelStart = def.consumes.reduce((s, k) => s + state[k], 0);
  const fuelEnd = fuelStart * X_RESIDUAL;
  const fuelNow = depletion(fuelStart, fuelEnd, tt, dur);
  const burned = fuelStart - fuelNow;
  const fracLeft = fuelStart > 1e-9 ? fuelNow / fuelStart : 0;
  def.consumes.forEach(k => { state[k] *= fracLeft; });
  const produced = burned * (1 - def.defect);
  def.produces.forEach(([k, frac]) => { state[k] = (state[k] || 0) + produced * frac; });
  state.dM += burned * def.defect;
}
// Stato completo (composizione per elemento, massa persa, raggio) al tempo-schermo t, percorrendo
// in sequenza le fasi applicabili a QUESTA stella. Ogni fase eredita lo stato lasciato dalla
// precedente — nessuna integrazione numerica: ogni passo è una valutazione diretta della stessa
// formula chiusa di esaurimento, applicata ai combustibili di quella fase.
function stateAt(t) {
  const state = { Xh: D.Xh0, Yhe: D.Yhe0, Xc: 0, Xo: 0, Xne: 0, Xmg: 0, Xsi: 0, Xs: 0, Xfe: 0, dM: 0 };
  let R = D.Rms, remaining = t, stageName = D.stages[0].name, stageProgress = 0;
  for (const st of D.stages) {
    const tt = clamp(remaining, 0, st.dur);
    const progress = st.dur > 0 ? tt / st.dur : 1;
    if (st.name === 'Collapse') {
      R = R * (1 - smooth(progress)) + D.Rfinal * smooth(progress);
    } else {
      applyStage(state, st.name, tt, st.dur);
      // il raggio sale verso quello da gigante SOLO durante la fase dell'elio; nelle fasi
      // avanzate successive resta fermo lì (un vero raggio "a cipolla" cambia pochissimo mentre
      // il nucleo profondo brucia elementi via via più pesanti) — ricalcolare la stessa rampa ad
      // ogni fase avrebbe fatto ripartire il raggio da R_ms ogni volta, un piccolo "tuffo" visibile
      // ad ogni cambio di fase nel grafico, mai fisicamente inteso
      if (st.name === 'H') R = D.Rms;
      else if (st.name === 'He') R = D.Rms + (D.Rrg - D.Rms) * smooth(clamp(tt / (st.dur * 0.3), 0, 1));
      else R = D.Rrg;
    }
    stageName = st.name; stageProgress = progress;
    remaining -= st.dur;
    if (remaining <= 0) break;
  }
  return { ...state, Z: D.Z, R, stageName, stageProgress };
}
function currentTeff(R_solar) { return 5772 * Math.pow(D.L, 0.25) / Math.pow(Math.max(R_solar, 1e-6), 0.5); }

// ═══ Colore corpo nero (interpolazione fra ancoraggi, stessa idea usata altrove nel sito) ═════
function tempColor(Tk) {
  const stops = [[3000, [255, 170, 100]], [4500, [255, 205, 150]], [5772, [255, 244, 220]], [7500, [225, 232, 255]], [12000, [175, 205, 255]], [30000, [145, 180, 255]]];
  const t = clamp(Tk, stops[0][0], stops[stops.length - 1][0]);
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      const f = (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
      const c0 = stops[i][1], c1 = stops[i + 1][1];
      return `rgb(${Math.round(c0[0] + (c1[0] - c0[0]) * f)},${Math.round(c0[1] + (c1[1] - c0[1]) * f)},${Math.round(c0[2] + (c1[2] - c0[2]) * f)})`;
    }
  }
  return 'rgb(255,244,220)';
}

// ═══ Rendering ════════════════════════════════════════════════════════════════
function drawGrid(ctx, W, H) {
  ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
}
function geom(W, H) {
  const headerH = 46, hintH = 30, gap = 10;
  const leftW = Math.min(W * 0.42, 380);
  G = { W, H, headerH, hintH, leftX: 6, leftW, rightX: leftW + gap, rightW: W - leftW - gap - 6, areaY: headerH, areaH: H - headerH - hintH };
}
function drawSphereGlow(ctx, x, y, r, color) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g1 = ctx.createRadialGradient(x, y, 0, x, y, r * 4.5);
  g1.addColorStop(0, color.replace(')', ',0.5)').replace('rgb', 'rgba'));
  g1.addColorStop(1, color.replace(')', ',0)').replace('rgb', 'rgba'));
  ctx.fillStyle = g1; ctx.beginPath(); ctx.arc(x, y, r * 4.5, 0, TWO); ctx.fill();
  ctx.restore();
  const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.05);
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.4, color); grad.addColorStop(1, color);
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, r, 0, TWO); ctx.fill();
}
function displayStarRadiusPx(R, panelMin) {
  const ratio = clamp(R / D.Rms, 1e-4, 300);
  const t = Math.log10(ratio);
  const frac = clamp(0.15 + t * 0.045, 0.02, 0.30);
  return panelMin * frac;
}
function drawStarModel(ctx, x0, y0, w, h, st) {
  const cx = x0 + w / 2, cy = y0 + h / 2 + 6;
  const r = displayStarRadiusPx(st.R, Math.min(w, h));
  const Teff = currentTeff(st.R);
  drawSphereGlow(ctx, cx, cy, Math.max(3, r), tempColor(Teff));
  ctx.fillStyle = T.txt; ctx.font = '10px "Space Mono",monospace'; ctx.textAlign = 'center';
  const rTxt = st.R < 0.001 ? (st.R * 696000).toFixed(0) + ' km' : st.R.toFixed(st.R < 1 ? 4 : 1) + ' R☉';
  ctx.fillText(`R = ${rTxt}`, cx, y0 + h - 34);
  ctx.fillText(`T_eff ≈ ${Teff >= 1000 ? (Teff / 1000).toFixed(1) + ' mila K' : Teff.toFixed(0) + ' K'}`, cx, y0 + h - 20);
  ctx.fillStyle = T.accent; ctx.font = 'bold 10px "Space Mono",monospace';
  ctx.fillText(STAGE_LABEL[st.stageName] || st.stageName, cx, y0 + h - 6);
}

// ═══ Diagrammi dei cicli di fusione ═════════════════════════════════════════════
const STAGE_LABEL = {
  H: 'combustione dell\'idrogeno', He: 'combustione dell\'elio',
  Cburn: 'combustione del carbonio', Neburn: 'combustione del neon',
  Oburn: 'combustione dell\'ossigeno', Siburn: 'combustione del silicio',
  Collapse: 'collasso del nucleo',
};
// mappa "in che nodo della roadmap ricade la fase corrente" — usata anche per far pulsare il nodo giusto
const STAGE_TO_ROADMAP = { H: 'H', He: 'He', Cburn: 'C', Neburn: 'Ne', Oburn: 'O', Siburn: 'Si', Collapse: 'Fe' };
const ROADMAP_SEQ = ['H', 'He', 'C', 'Ne', 'O', 'Si', 'Fe'];
// Un tentativo precedente disegnava ogni nucleo come un grappolo di pallini protone/neutrone, poi
// le particelle emesse (fotoni, neutrini, positroni) come icone sopra la freccia — ma l'utente ha
// chiesto che restasse tutto testo, "semplicemente nell'equazione": γ, ν, e⁺ sono ora voci come le
// altre nell'elenco dei prodotti (right), disegnate con la STESSA funzione `drawNucleus`, invece di
// avere ciascuna una resa grafica speciale. Un'equazione vera, non un'illustrazione.
function nucleusColor(sym) {
  const map = {
    p: '#ff9d4d', n: '#8fb0c8', d: '#ffb86b', '³He': '#7fe0ff', '⁴He': '#00d4ff', '⁸Be': '#c8a2ff',
    '¹²C': '#7fe0a0', '¹³C': '#7fe0a0', '¹³N': '#ffd27a', '¹⁴N': '#ffd27a', '¹⁵N': '#ffd27a', '¹⁵O': '#4dc9ff', '¹⁶O': '#4dc9ff',
    '²⁰Ne': '#a0e0c0', '²³Na': '#ffb86b', '²⁴Mg': '#c0e0a0', '²⁸Si': '#e0c87f', '³¹P': '#ffb86b', '³²S': '#e0a87f', '⁵⁶Fe': '#e07f7f', '…': '#e0a87f',
    'γ': '#ffd23f', 'ν': '#cfe0f0', 'e⁺': '#ff7ec7',
  };
  return map[sym] || T.txt;
}
const NUCLEUS_SLOT = 62;
function drawNucleus(ctx, x, y, sym, big) {
  ctx.fillStyle = nucleusColor(sym);
  ctx.font = `bold ${big ? 22 : 17}px "Space Mono",monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(sym, x, y + 0.5);
  ctx.textBaseline = 'alphabetic';
}
// Riga di reazione: ogni simbolo (nucleo o particella) occupa una "casella" di larghezza FISSA
// (NUCLEUS_SLOT), qualunque sia la lunghezza del testo — una disposizione prevedibile invece di
// una larghezza calcolata dal testo.
function drawReaction(ctx, cx, y, left, right, caption) {
  const slot = NUCLEUS_SLOT;
  let x = cx - 56 - left.length * slot;
  left.forEach((sym, i) => {
    drawNucleus(ctx, x + slot / 2, y, sym); x += slot;
    if (i < left.length - 1) { ctx.fillStyle = T.sub; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center'; ctx.fillText('+', x, y + 5); }
  });
  const arrowX0 = x + 10, arrowX1 = cx + 56;
  ctx.strokeStyle = 'rgba(200,220,240,0.75)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(arrowX0, y); ctx.lineTo(arrowX1, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(arrowX1, y); ctx.lineTo(arrowX1 - 9, y - 5); ctx.lineTo(arrowX1 - 9, y + 5); ctx.closePath();
  ctx.fillStyle = 'rgba(200,220,240,0.75)'; ctx.fill();
  if (caption) { ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center'; ctx.fillText(caption, (arrowX0 + arrowX1) / 2, y - 10); }
  let x2 = arrowX1 + 22;
  right.forEach((sym, i) => {
    drawNucleus(ctx, x2 + slot / 2, y, sym); x2 += slot;
    if (i < right.length - 1) { ctx.fillStyle = T.sub; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center'; ctx.fillText('+', x2, y + 5); }
  });
}
function diagramHeader(ctx, cx, y0, title, subtitle) {
  ctx.fillStyle = T.accent; ctx.font = 'bold 13px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText(title, cx, y0 + 17);
  ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace';
  ctx.fillText(subtitle, cx, y0 + 32);
}
function drawPPChain(ctx, x0, y0, w, h) {
  const cx = x0 + w / 2;
  diagramHeader(ctx, cx, y0, 'Catena protone-protone (pp-I)', 'l\'idrogeno si trasforma in elio');
  const rowY = i => y0 + 76 + i * 92;
  drawReaction(ctx, cx, rowY(0), ['p', 'p'], ['d', 'e⁺', 'ν'], '');
  drawReaction(ctx, cx, rowY(1), ['d', 'p'], ['³He', 'γ'], '');
  drawReaction(ctx, cx, rowY(2), ['³He', '³He'], ['⁴He', 'p', 'p'], '');
}
// Il ciclo CNO resta un anello (la forma stessa comunica "catalitico": C-12 rientra alla fine),
// ma l'etichetta di ogni passo è ora testo semplice accanto alla freccia (protone catturato e
// particella emessa scritti insieme, come "+p → γ"), non più un'icona dedicata.
function drawCNO(ctx, x0, y0, w, h) {
  const cx = x0 + w / 2;
  diagramHeader(ctx, cx, y0, 'Ciclo CNO (CNO-I)', 'l\'idrogeno si trasforma in elio — C, N, O fanno solo da catalizzatori');
  const cy = y0 + 50 + (h - 90) / 2, R = Math.min(w, h - 90) * 0.30;
  const nuclei = ['¹²C', '¹³N', '¹³C', '¹⁴N', '¹⁵O', '¹⁵N'];
  const labels = ['+p → γ', 'β⁺, ν', '+p → γ', '+p → γ', 'β⁺, ν', '+p → α'];
  const pos = nuclei.map((n, i) => { const a = -Math.PI / 2 + i / 6 * TWO; return { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, n }; });
  for (let i = 0; i < 6; i++) {
    const a = pos[i], b = pos[(i + 1) % 6];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    const sx = a.x + ux * 22, sy = a.y + uy * 22, ex = b.x - ux * 22, ey = b.y - uy * 22;
    ctx.strokeStyle = 'rgba(200,220,240,0.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    const ang = Math.atan2(ey - sy, ex - sx);
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - 8 * Math.cos(ang - 0.4), ey - 8 * Math.sin(ang - 0.4)); ctx.lineTo(ex - 8 * Math.cos(ang + 0.4), ey - 8 * Math.sin(ang + 0.4)); ctx.closePath();
    ctx.fillStyle = 'rgba(200,220,240,0.6)'; ctx.fill();
    ctx.fillStyle = T.txt; ctx.font = 'bold 11px "Space Mono",monospace'; ctx.textAlign = 'center';
    ctx.fillText(labels[i], (sx + ex) / 2 + uy * 15, (sy + ey) / 2 - ux * 15);
  }
  pos.forEach(p => drawNucleus(ctx, p.x, p.y, p.n));
}
function drawTripleAlpha(ctx, x0, y0, w, h) {
  const cx = x0 + w / 2;
  diagramHeader(ctx, cx, y0, 'Processo tripla-alfa', 'l\'elio si trasforma in carbonio e ossigeno');
  const rowY = i => y0 + 76 + i * 92;
  drawReaction(ctx, cx, rowY(0), ['⁴He', '⁴He'], ['⁸Be'], '(instabile)');
  drawReaction(ctx, cx, rowY(1), ['⁸Be', '⁴He'], ['¹²C', 'γ'], '');
  drawReaction(ctx, cx, rowY(2), ['¹²C', '⁴He'], ['¹⁶O', 'γ'], 'cattura successiva');
}
function drawCarbonBurn(ctx, x0, y0, w, h) {
  const cx = x0 + w / 2;
  diagramHeader(ctx, cx, y0, 'Combustione del carbonio', 'il carbonio si trasforma in neon e magnesio');
  const rowY = i => y0 + 80 + i * 100;
  drawReaction(ctx, cx, rowY(0), ['¹²C', '¹²C'], ['²⁰Ne', '⁴He'], 'canale dominante');
  drawReaction(ctx, cx, rowY(1), ['¹²C', '¹²C'], ['²³Na', 'p'], 'canale minore');
  ctx.fillStyle = T.sub; ctx.font = '8px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText('solo nel nucleo di stelle molto massicce, a T ≈ 6·10⁸ K', cx, y0 + h - 8);
}
function drawNeonBurn(ctx, x0, y0, w, h) {
  const cx = x0 + w / 2;
  diagramHeader(ctx, cx, y0, 'Combustione del neon', 'il neon torna in parte ossigeno, in parte magnesio');
  const rowY = i => y0 + 80 + i * 100;
  drawReaction(ctx, cx, rowY(0), ['²⁰Ne', 'γ'], ['¹⁶O', '⁴He'], 'fotodisintegrazione');
  drawReaction(ctx, cx, rowY(1), ['²⁰Ne', '⁴He'], ['²⁴Mg', 'γ'], 'cattura successiva');
  ctx.fillStyle = T.sub; ctx.font = '8px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText('a T ≈ 1.2·10⁹ K i fotoni sono energetici abbastanza da spezzare i nuclei', cx, y0 + h - 8);
}
function drawOxygenBurn(ctx, x0, y0, w, h) {
  const cx = x0 + w / 2;
  diagramHeader(ctx, cx, y0, 'Combustione dell\'ossigeno', 'l\'ossigeno si trasforma in silicio e zolfo');
  const rowY = i => y0 + 80 + i * 100;
  drawReaction(ctx, cx, rowY(0), ['¹⁶O', '¹⁶O'], ['²⁸Si', '⁴He'], 'canale dominante');
  drawReaction(ctx, cx, rowY(1), ['¹⁶O', '¹⁶O'], ['³¹P', 'p'], 'canale minore');
  ctx.fillStyle = T.sub; ctx.font = '8px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText('a T ≈ 1.5·10⁹ K', cx, y0 + h - 8);
}
function drawSiliconBurn(ctx, x0, y0, w, h) {
  const cx = x0 + w / 2;
  diagramHeader(ctx, cx, y0, 'Combustione del silicio', 'il silicio si riorganizza fino al ferro — l\'ultimo passo utile');
  const rowY = i => y0 + 80 + i * 100;
  drawReaction(ctx, cx, rowY(0), ['²⁸Si', '⁴He'], ['³²S'], 'prima cattura α');
  drawReaction(ctx, cx, rowY(1), ['³²S', '…'], ['⁵⁶Fe'], 'catture α e fotodisint. successive');
  ctx.fillStyle = T.sub; ctx.font = '8px "Space Mono",monospace'; ctx.textAlign = 'center';
  ctx.fillText('un vero processo di quasi-equilibrio fra molti nuclidi (S, Ar, Ca, Ti, Cr, …), qui semplificato', cx, y0 + h - 22);
  ctx.fillStyle = T.txt; ctx.font = 'bold 8px "Space Mono",monospace';
  ctx.fillText('il ferro ha l\'energia di legame più alta per nucleone: qui la fusione SI FERMA', cx, y0 + h - 8);
}
function drawCollapseDiagram(ctx, x0, y0, w, h, canAdv) {
  const cx = x0 + w / 2, cy = y0 + h / 2;
  diagramHeader(ctx, cx, y0, 'Fusione terminata', canAdv ? 'il nucleo, ormai di ferro, non può più liberare energia fondendosi' : 'l\'elio si è esaurito, il nucleo di carbonio-ossigeno non si accende');
  drawNucleus(ctx, cx, cy - 10, canAdv ? '⁵⁶Fe' : '¹⁶O', true);
  ctx.fillStyle = T.txt; ctx.font = 'bold 11px "Space Mono",monospace'; ctx.textAlign = 'center';
  const msg = canAdv ? 'il nucleo di ferro collassa: nasce una stella di neutroni' : 'il nucleo esposto si raffredda: nasce una nana bianca';
  ctx.fillText(msg, cx, cy + 40);
}
function drawCycleDiagram(ctx, x0, y0, w, h, st) {
  if (st.stageName === 'H') { D.cno ? drawCNO(ctx, x0, y0, w, h) : drawPPChain(ctx, x0, y0, w, h); }
  else if (st.stageName === 'He') drawTripleAlpha(ctx, x0, y0, w, h);
  else if (st.stageName === 'Cburn') drawCarbonBurn(ctx, x0, y0, w, h);
  else if (st.stageName === 'Neburn') drawNeonBurn(ctx, x0, y0, w, h);
  else if (st.stageName === 'Oburn') drawOxygenBurn(ctx, x0, y0, w, h);
  else if (st.stageName === 'Siburn') drawSiliconBurn(ctx, x0, y0, w, h);
  else drawCollapseDiagram(ctx, x0, y0, w, h, D.canAdv);
}
// Panoramica compatta H→He→C→Ne→O→Si→Fe, col nodo della fase attiva evidenziato: dà sempre un
// riferimento di contesto ("a che punto siamo nella catena") sopra al diagramma di dettaglio della
// singola reazione, che da solo poteva risultare isolato e poco comprensibile.
function drawStageRoadmap(ctx, x0, y0, w, stageName) {
  const y = y0 + 15, n = ROADMAP_SEQ.length, gap = w / n;
  const active = STAGE_TO_ROADMAP[stageName];
  ROADMAP_SEQ.forEach((el, i) => {
    const x = x0 + gap * i + gap / 2, isActive = el === active;
    if (i < n - 1) {
      const x2 = x0 + gap * (i + 1) + gap / 2;
      ctx.strokeStyle = 'rgba(150,170,195,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 13, y); ctx.lineTo(x2 - 13, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x2 - 13, y); ctx.lineTo(x2 - 19, y - 3); ctx.lineTo(x2 - 19, y + 3); ctx.closePath();
      ctx.fillStyle = 'rgba(150,170,195,0.35)'; ctx.fill();
    }
    ctx.beginPath(); ctx.arc(x, y, isActive ? 12 : 9, 0, TWO);
    ctx.fillStyle = isActive ? ELEMENT_COLOR[el] : (dk() ? 'rgba(140,160,185,0.22)' : 'rgba(100,120,150,0.22)');
    ctx.fill();
    if (isActive) { ctx.strokeStyle = T.accent; ctx.lineWidth = 1.6; ctx.stroke(); }
    ctx.fillStyle = isActive ? '#0a1420' : T.sub; ctx.font = (isActive ? 'bold ' : '') + '8px "Space Mono",monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(el, x, y + 0.5); ctx.textBaseline = 'alphabetic';
  });
}

function draw(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  T = pal();
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
  drawGrid(ctx, W, H);
  geom(W, H);

  const st = stateAt(animT);

  drawStarModel(ctx, G.leftX, G.areaY, G.leftW, G.areaH, st);

  ctx.save(); ctx.beginPath(); ctx.rect(G.rightX, G.areaY, G.rightW, G.areaH); ctx.clip();
  drawStageRoadmap(ctx, G.rightX + 14, G.areaY, G.rightW - 28, st.stageName);
  drawCycleDiagram(ctx, G.rightX, G.areaY + 34, G.rightW, G.areaH - 34, st);
  ctx.restore();

  ctx.strokeStyle = T.ring; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(G.rightX - 5, G.areaY); ctx.lineTo(G.rightX - 5, G.areaY + G.areaH); ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = T.accent; ctx.font = 'bold 14px "Space Mono",monospace';
  ctx.fillText('Fusione Nucleare Stellare', 10, 20);
  ctx.fillStyle = T.txt; ctx.font = '10px "Space Mono",monospace';
  ctx.fillText(`M=${D.M.toFixed(2)} M☉   X₀=${D.Xh0.toFixed(2)}   Y₀=${D.Yhe0.toFixed(2)}   Z=${D.Z.toFixed(2)}`, 10, 38);

  ctx.fillStyle = T.sub; ctx.font = '9px "Space Mono",monospace'; ctx.textAlign = 'center';
  const hint = D.canAdv ? 'stella massiccia: proseguirà oltre l\'elio fino al ferro' : D.canHe ? 'accenderà l\'elio ma non le fasi avanzate: finirà come nana bianca di carbonio-ossigeno' : 'massa troppo bassa per accendere l\'elio: finirà come nana bianca dopo la sola combustione dell\'idrogeno';
  ctx.fillText(hint, W / 2, H - 10);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
function gBase(ctx, W, H, PAD) {
  ctx.fillStyle = T.gBg; ctx.fillRect(0, 0, W, H);
  const gW = W - PAD.l - PAD.r, gH = H - PAD.t - PAD.b;
  ctx.strokeStyle = T.gAxis; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(PAD.l, PAD.t); ctx.lineTo(PAD.l, PAD.t + gH); ctx.lineTo(PAD.l + gW, PAD.t + gH); ctx.stroke();
  return { gW, gH };
}
// 1: istogramma della percentuale di massa per elemento, dall'idrogeno al ferro, ISTANTANEO
// (aggiornato ad ogni fotogramma con lo stato attuale — non una storia nel tempo come prima:
// un istogramma mostra per costruzione un solo istante, ed è quello che l'utente ha chiesto)
function drawGraphHistogram() {
  const cv = gCanvas[0]; if (!cv || !cv.width || !D) return;
  const ctx = gCtx[0], W = cv.width, H = cv.height, PAD = { t: 14, b: 16, l: 4, r: 4 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const s = stateAt(animT);
  const elements = [['H', s.Xh], ['He', s.Yhe], ['C', s.Xc], ['O', s.Xo], ['Ne', s.Xne], ['Mg', s.Xmg], ['Si', s.Xsi], ['S', s.Xs], ['Fe', s.Xfe]];
  const bw = gW / elements.length;
  elements.forEach(([label, val], i) => {
    const bh = clamp(val, 0, 1) * gH * 0.8;
    const x = PAD.l + i * bw + bw * 0.16, w = bw * 0.68;
    ctx.fillStyle = ELEMENT_COLOR[label];
    ctx.fillRect(x, PAD.t + gH - bh, w, Math.max(1, bh));
    ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, PAD.t + gH + 11);
    if (val > 0.006) ctx.fillText((val * 100).toFixed(0) + '%', x + w / 2, PAD.t + gH - bh - 3);
  });
}
// 2: frazione di massa persa per irraggiamento (E=mc²) — dominio fisso, asse Y fisso (0-1%, copre
// ampiamente il massimo possibile, che è sempre sotto l'1% della massa)
function drawGraphMassLoss() {
  const cv = gCanvas[1]; if (!cv || !cv.width || !D) return;
  const ctx = gCtx[1], W = cv.width, H = cv.height, PAD = { t: 14, b: 14, l: 30, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const tMax = D.totalDur, yMax = 0.01;
  const xOf = t => PAD.l + clamp(t / tMax, 0, 1) * gW;
  const yOf = v => PAD.t + gH - clamp(v / yMax, 0, 1) * gH;
  ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 1.4; ctx.beginPath();
  for (let i = 0; i <= 160; i++) { const t = tMax * i / 160; const s = stateAt(t); const x = xOf(t), y = yOf(s.dM); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke();
  const now = stateAt(animT);
  ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.arc(xOf(animT), yOf(now.dM), 3, 0, TWO); ctx.fill();
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('massa persa ΔM/M₀ (E=mc²)', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('t', PAD.l + gW - 2, PAD.t + gH - 3);
}
// 3: raggio nel tempo, scala LOGARITMICA (varia da ~10⁻⁵ a ~300 R☉: troppo per un asse lineare)
function drawGraphRadius() {
  const cv = gCanvas[2]; if (!cv || !cv.width || !D) return;
  const ctx = gCtx[2], W = cv.width, H = cv.height, PAD = { t: 14, b: 14, l: 30, r: 8 };
  const { gW, gH } = gBase(ctx, W, H, PAD);
  const tMax = D.totalDur, rMin = 1e-5, rMax = 300;
  const logMin = Math.log10(rMin), logMax = Math.log10(rMax);
  const xOf = t => PAD.l + clamp(t / tMax, 0, 1) * gW;
  const yOf = r => PAD.t + gH - clamp((Math.log10(clamp(r, rMin, rMax)) - logMin) / (logMax - logMin), 0, 1) * gH;
  ctx.strokeStyle = '#c86eff'; ctx.lineWidth = 1.4; ctx.beginPath();
  for (let i = 0; i <= 160; i++) { const t = tMax * i / 160; const s = stateAt(t); const x = xOf(t), y = yOf(s.R); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke();
  const now = stateAt(animT);
  ctx.fillStyle = '#c86eff'; ctx.beginPath(); ctx.arc(xOf(animT), yOf(now.R), 3, 0, TWO); ctx.fill();
  ctx.fillStyle = T.gText; ctx.font = '7px "Space Mono",monospace'; ctx.textAlign = 'left'; ctx.fillText('raggio (R☉, scala log)', PAD.l + 2, PAD.t + 7);
  ctx.textAlign = 'right'; ctx.fillText('t', PAD.l + gW - 2, PAD.t + gH - 3);
}
function drawGraphs() {
  const titles = ['Percentuale per elemento (H→Fe)', 'Massa persa per irraggiamento', 'Raggio (scala log)'];
  for (let i = 0; i < 3; i++) if (gTitle[i]) gTitle[i].textContent = titles[i];
  drawGraphHistogram(); drawGraphMassLoss(); drawGraphRadius();
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls() {
  const cont = document.getElementById('controls'); cont.innerHTML = '';

  const sm = Lab.Section('Stella'); cont.appendChild(sm.el);
  sm.add(Lab.Slider({ label: 'Massa (10^x M☉)', min: -0.5, max: 1.6, step: 0.02, value: P.massLog10, unit: '', onChange(v) { P.massLog10 = v; newRun(); } }));
  sm.add(Lab.Slider({ label: 'Idrogeno iniziale X', min: 0.1, max: 0.95, step: 0.01, value: P.Xh0, unit: '', onChange(v) { P.Xh0 = v; newRun(); } }));
  sm.add(Lab.Slider({ label: 'Elio iniziale Y', min: 0, max: 0.9, step: 0.01, value: P.Yhe0, unit: '', onChange(v) { P.Yhe0 = v; newRun(); } }));
  const bNew = document.createElement('button'); bNew.className = 'ctrl-btn'; bNew.textContent = 'Nuova stella';
  bNew.addEventListener('click', () => newRun());
  sm.add(bNew);

  const sv = Lab.Section('Visualizzazione'); cont.appendChild(sv.el);
  sv.add(Lab.Slider({ label: 'Velocità animazione', min: 0.2, max: 3, step: 0.1, value: P.speed, unit: '×', onChange(v) { P.speed = v; } }));
}

function buildReadout() {
  const cont = document.getElementById('readout'); cont.innerHTML = '';
  readout = new Lab.Readout(cont, [
    { key: 'stage', label: 'Fase' },
    { key: 'mass', label: 'Massa attuale' },
    { key: 'radius', label: 'Raggio attuale' },
    { key: 'h', label: 'Idrogeno' },
    { key: 'he', label: 'Elio' },
    { key: 'heavy', label: 'Elementi più pesanti' },
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
  buildControls(); initGraphs(); buildReadout(); newRun();
  const simCanvas = document.getElementById('simCanvas');
  const btnPlay = document.getElementById('btnPlay');
  function syncPlay() { btnPlay.textContent = P.paused ? '▶  AVVIA' : '⏸  PAUSA'; }
  syncPlay();
  btnPlay.addEventListener('click', () => { P.paused = !P.paused; syncPlay(); });
  document.getElementById('btnReset').addEventListener('click', () => {
    P.massLog10 = 0; P.Xh0 = 0.70; P.Yhe0 = 0.28; P.speed = 1.0; P.paused = false;
    buildControls(); newRun(); syncPlay();
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
    if (!P.paused) step(dt);
    try {
      draw(simCanvas); drawGraphs();
      const st = stateAt(animT);
      readout.set('stage', STAGE_LABEL[st.stageName] || st.stageName);
      readout.set('mass', (D.M * (1 - st.dM)).toFixed(3) + ' M☉');
      readout.set('radius', st.R < 0.001 ? (st.R * 696000).toFixed(0) + ' km' : st.R.toFixed(st.R < 1 ? 4 : 1) + ' R☉');
      readout.set('h', (st.Xh * 100).toFixed(1) + '%');
      readout.set('he', (st.Yhe * 100).toFixed(1) + '%');
      readout.set('heavy', ((st.Xc + st.Xo + st.Xne + st.Xmg + st.Xsi + st.Xs + st.Xfe) * 100).toFixed(2) + '%');
    } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
