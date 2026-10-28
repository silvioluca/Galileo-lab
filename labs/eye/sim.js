/* L'Occhio Umano — Galileo Lab */
'use strict';

const simCanvas   = document.getElementById('simCanvas');
const graphCanvas = document.getElementById('graphCanvas');
const sc = simCanvas.getContext('2d');
const gc = graphCanvas.getContext('2d');
let SW = 0, SH = 0, GW = 0, GH = 0;
let dpr = window.devicePixelRatio || 1;

const eyeImage = new Image();
eyeImage.onload = () => { drawScene(); drawGraphs(); };
eyeImage.src = 'occhio.png';

const lensImage = new Image();
lensImage.onload = () => { drawScene(); drawGraphs(); };
lensImage.src = 'cristallino.png';
const IMG_EYE_CX = 0.50;  // eye-centre x as fraction of image width
const IMG_EYE_CY = 0.50;  // eye-centre y as fraction of image height
const IMG_EYE_RF = 0.42;  // eye radius as fraction of min(IW, IH)

// ── State ─────────────────────────────────────────────────────────────────────
const params = {
  defect:     0,      // D: negative=myopia, positive=hyperopia, 0=normal
  correction: 0,      // D: diopters of corrective lens (0 = no glasses)
  astig:      0,      // D: astigmatism cylinder (simplified as extra defocus)
  nRays:      7,
  showLabels: true,
  objectMode: false,  // show object arrow + inverted image on retina
};

// ── Eye optical model (reduced eye) ──────────────────────────────────────────
// Emmetropic eye: total power P0 = n_vit / L = 1336/24 ≈ 55.67 D
// We use a single thin-lens model at the corneal vertex.
// defect (spherical equivalent SE in D):
//   SE > 0 → hyperopia   (eye too weak / too short, needs +)
//   SE < 0 → myopia      (eye too strong / too long, needs −)
//
// Image distance in vitreous (n=1.336):
//   1/q = P_total / n_vit − (1/object_dist_mm)*sign  [simplified thin-lens in medium]
//
// For simplicity we work in air-equivalent distances:
//   P_eff = P_emmetropic − SE_defect + P_correction
//   q_air  = 1000 / P_eff  (mm, from lens)
//   retina is always at q_retina = 1000 / P_emmetropic = 17.95 mm (air-equivalent)

const P_EMMETROPIC = 55.67;        // D
const Q_RETINA     = 1000 / P_EMMETROPIC; // ≈ 17.95 mm (air-equivalent)

function totalPower() {
  // un occhio miope (difetto < 0) è troppo convergente: potenza P₀ − difetto; la lente si somma
  return P_EMMETROPIC - params.defect + params.correction;
}
// errore residuo (D): 0 se la lente uguaglia la prescrizione. < 0: fuoco davanti alla retina
function residualD() { return params.defect - params.correction; }
// sfocatura complessiva: errore sferico residuo + metà del cilindro (cerchio di minima confusione)
function blurD() { return Math.abs(residualD()) + params.astig * 0.5; }
// acuità decimale (10/10 = 1): ~5/10 a 0,5 D, ~3/10 a 1 D, ~1/10 a 3–4 D
function acuityOf(b) { return 1 / (1 + 2.5 * b); }
// spostamento del fuoco rispetto alla retina: ≈ 0,45 mm per diottria nell'occhio ridotto
const MM_PER_D = 0.45;

// Image distance in air-equiv mm (from lens plane), for given object distance
// objectMm: object distance in mm (negative = real object left of lens)
function imageDistMm(P, objectMm) {
  if (!isFinite(P) || Math.abs(P) < 0.01) return Infinity;
  if (objectMm === -Infinity || objectMm === Infinity) {
    return 1000 / P;  // parallel rays → focal length
  }
  const iq = P / 1000 - 1 / objectMm;  // 1/q = P/1000 - 1/|u| (real obj: u<0, so +1/|u|)
  return Math.abs(iq) > 1e-9 ? 1 / iq : Infinity;
}

function objectDistMm() {
  return params.objectDist === 'inf' ? Infinity : -330; // 33 cm
}

// ── Drawing scale & layout ────────────────────────────────────────────────────
const MM_TO_PX  = () => Math.min(SW / 44, SH / 30);
const EYE_AX_MM = 24;   // axial length mm

function eyeX()  { return SW * 0.42; }
function eyeCY() { return SH * 0.50; }

function mmX(mm) { return eyeX() + mm * MM_TO_PX(); }
function mmY(mm) { return eyeCY() - mm * MM_TO_PX(); }

// Corrective lens sits this far in front of the cornea
const LENS_OFFSET_MM = 12;
function lensX() { return eyeX() - LENS_OFFSET_MM * MM_TO_PX(); }

// ── Colour helpers ────────────────────────────────────────────────────────────
function isDark() { return document.documentElement.dataset.theme !== 'light'; }

function eyeColors(dk) {
  return {
    sclera:     dk ? '#1e2c44' : '#f2ece0',
    scleraLine: dk ? '#3a5578' : '#8899bb',
    choroid:    dk ? 'rgba(185,95,42,0.90)' : 'rgba(190,105,42,0.88)',
    vitreous:   dk ? 'rgba(175,220,242,0.78)' : 'rgba(188,228,248,0.84)',
    cornea:     dk ? 'rgba(120,200,255,0.22)' : 'rgba(145,220,255,0.28)',
    corneaLine: dk ? '#60beff' : '#1a7acc',
    aqueous:    dk ? 'rgba(160,220,250,0.38)' : 'rgba(185,235,255,0.42)',
    iris:       dk ? '#4a2838' : '#3d2030',
    irisLine:   dk ? '#2a1020' : '#281018',
    ciliary:    dk ? 'rgba(210,120,148,0.90)' : 'rgba(218,128,152,0.88)',
    pupil:      dk ? '#040810' : '#060810',
    lens:       dk ? 'rgba(155,210,255,0.44)' : 'rgba(175,225,255,0.50)',
    lensLine:   dk ? '#70b8f8' : '#1a78cc',
    fovea:      dk ? '#ffcc44' : '#dd9900',
    ray:        '#e03030',
    focusOk:    dk ? '#00e676' : '#00a844',
    focusBad:   dk ? '#ff5252' : '#cc0000',
    corrLens:   dk ? 'rgba(60,240,160,0.22)' : 'rgba(35,165,110,0.20)',
    corrBorder: dk ? '#30eea8' : '#008855',
    axis:       dk ? 'rgba(200,220,255,0.13)' : 'rgba(0,0,80,0.09)',
  };
}

// ── Draw the eye globe ────────────────────────────────────────────────────────
function drawEye(dk) {
  const s   = MM_TO_PX();
  const cx  = eyeX();
  const cy  = eyeCY();

  const R   = 12 * s;
  const gcx = cx + R;

  const Rc  = 7.8 * s;
  const cX  = cx + Rc;
  const cH  = 5.8 * s;
  const αC  = Math.asin(cH / Rc);

  const lcx = cx + 4.0 * s;
  const lH  = 5.5 * s;
  const lB  = 1.2 * s;

  // ── 1. occhio.png clipped to globe circle ─────────────────────────────────
  sc.save();
  sc.beginPath();
  sc.arc(gcx, cy, R * 1.06, 0, Math.PI * 2);
  sc.clip();

  if (eyeImage.complete && eyeImage.naturalWidth > 0) {
    const IW = eyeImage.naturalWidth;
    const IH = eyeImage.naturalHeight;
    const imgEyeR = IMG_EYE_RF * Math.min(IW, IH);
    const scale   = (R * 1.06) / imgEyeR;
    sc.drawImage(eyeImage,
      gcx - IMG_EYE_CX * IW * scale,
      cy  - IMG_EYE_CY * IH * scale,
      IW * scale, IH * scale);
  } else {
    sc.fillStyle = dk ? '#1e2c44' : '#f4edd2';
    sc.fillRect(gcx - R * 1.1, cy - R * 1.1, R * 2.2, R * 2.2);
  }
  sc.restore();

  // ── 2. Crystalline lens — cristallino.png clipped to biconvex shape ─────────
  {
    // lBActive varies with diopter: myopia→thicker, hyperopia→thinner
    const defNorm  = Math.max(-1, Math.min(1, params.defect / 6));
    const lBActive = lB * (1.0 - defNorm * 0.30);
    // Radius and geometry of each circular arc surface
    const lR = (lBActive * lBActive + lH * lH) / (2 * lBActive);
    const lD = lR - lBActive;
    const lA = Math.asin(lH / lR);

    const lensPath = () => {
      sc.beginPath();
      sc.arc(lcx + lD, cy, lR, -(Math.PI - lA), Math.PI - lA, true);  // left convex surface
      sc.arc(lcx - lD, cy, lR,  lA, -lA,                       true);  // right convex surface
      sc.closePath();
    };

    sc.save();
    sc.globalAlpha = 0.55;  // semi-transparent lens
    lensPath(); sc.clip();

    // Blue gradient base
    const lGrad = sc.createRadialGradient(
      lcx - lB * 0.28, cy - lH * 0.22, lH * 0.04,
      lcx, cy, lH * 1.15
    );
    lGrad.addColorStop(0,    'rgba(200,228,255,1)');
    lGrad.addColorStop(0.28, 'rgba(145,198,255,1)');
    lGrad.addColorStop(0.60, 'rgba(80,148,230,1)');
    lGrad.addColorStop(1,    'rgba(35,80,180,1)');
    sc.fillStyle = lGrad;
    sc.fillRect(lcx - lBActive * 4, cy - lH * 1.6, lBActive * 8, lH * 3.2);

    // cristallino.png with multiply
    if (lensImage.complete && lensImage.naturalWidth > 0) {
      const dH = lH * 2.85;
      sc.globalCompositeOperation = 'multiply';
      sc.drawImage(lensImage, lcx - dH / 2, cy - dH / 2, dH, dH);
      sc.globalCompositeOperation = 'source-over';
    }

    sc.restore();

    // Outline
    sc.save();
    sc.globalAlpha = 0.55;
    lensPath();
    sc.strokeStyle = 'rgba(140,195,255,0.80)';
    sc.lineWidth   = 1.5;
    sc.stroke();
    sc.restore();
  }

  // ── 3. Cornea arc overlay (ray-entry alignment) ───────────────────────────
  sc.save();
  sc.beginPath();
  sc.arc(cX, cy, Rc, Math.PI + αC, Math.PI - αC, true);
  sc.strokeStyle = dk ? 'rgba(100,190,255,0.45)' : 'rgba(60,140,220,0.45)';
  sc.lineWidth   = 1.5;
  sc.stroke();
  sc.restore();

  // ── 4. Labels ─────────────────────────────────────────────────────────────
  if (!params.showLabels) return;
  sc.font = '9px Space Mono';

  sc.fillStyle = dk ? '#60beff' : '#1a7acc'; sc.textAlign = 'right';
  sc.fillText('cornea', cx - 4, cy - cH * 0.52);

  sc.fillStyle = dk ? '#c8a0e0' : '#5530a0'; sc.textAlign = 'center';
  sc.fillText('cristallino', lcx, cy - lH - 8);

  sc.fillStyle = dk ? '#d07040' : '#803018'; sc.textAlign = 'right';
  sc.fillText('retina', gcx + R * 0.60, cy - R * 0.62);
}

// ── Draw corrective lens (if correction ≠ 0) ─────────────────────────────────
function drawCorrectiveLens(dk) {
  if (params.correction === 0) return;
  const col  = eyeColors(dk);
  const s    = MM_TO_PX();
  const lx   = lensX();
  const cy   = eyeCY();
  const lH   = 11 * s;

  // Ophthalmic lenses are always meniscus: front convex, back concave (same direction)
  // Plus (+D): front less curved, back less curved → thicker at centre
  // Minus (−D): front less curved, back more curved → thicker at edges
  const D    = params.correction;
  const frac = Math.min(Math.abs(D) / 10, 1.0);
  const plus = D > 0;

  // Edge half-width (ew): minus needs more to avoid centre crossing
  const ew = (plus ? 0.04 + frac * 0.03 : 0.10 + frac * 0.10) * lH;

  // Sagittas: sl = front (always convex, positive), sr = back (always concave, negative)
  let sl = frac * lH * (plus ? 0.32 : 0.18);   // front convex sag
  let sr = frac * lH * (plus ? -0.18 : -0.32); // back concave sag (opposite sign)

  // Prevent surfaces crossing: gap at centre = 2*ew + sl + sr >= minGap
  const minGap = 4;
  const gap = 2 * ew + sl + sr;
  if (gap < minGap) sr = minGap - 2 * ew - sl;  // clamp back surface

  const xl = lx - ew, xr = lx + ew;

  sc.save();
  sc.beginPath();
  sc.moveTo(xl, cy - lH);
  sc.quadraticCurveTo(xl - 2 * sl, cy, xl, cy + lH);  // front surface (convex)
  sc.lineTo(xr, cy + lH);
  sc.quadraticCurveTo(xr + 2 * sr, cy, xr, cy - lH);  // back surface (concave, sr<0 → same dir)
  sc.closePath();
  sc.fillStyle   = col.corrLens;
  sc.strokeStyle = col.corrBorder;
  sc.lineWidth = 2;
  sc.fill();
  sc.stroke();

  if (params.showLabels) {
    const dSign = params.correction > 0 ? '+' : '';
    sc.fillStyle = col.corrBorder;
    sc.font = 'bold 10px Space Mono';
    sc.textAlign = 'center';
    sc.fillText(dSign + Lab.fmt(params.correction, 2) + ' D', lx, cy - lH - 10);
    sc.fillText('lente correttiva', lx, cy - lH - 22);
  }
  sc.restore();
}

// ── Draw optical axis ─────────────────────────────────────────────────────────
function drawAxis(dk) {
  const col = eyeColors(dk);
  const cx  = eyeX(), cy = eyeCY();
  const s   = MM_TO_PX();
  sc.save();
  sc.strokeStyle = col.axis;
  sc.lineWidth = 1;
  sc.setLineDash([6, 4]);
  sc.beginPath();
  sc.moveTo(0, cy);
  sc.lineTo(cx + EYE_AX_MM * s + 40, cy);
  sc.stroke();
  sc.restore();
}

// ── Ray tracing ───────────────────────────────────────────────────────────────
function drawRays(dk) {
  const col  = eyeColors(dk);
  const s    = MM_TO_PX();
  const cx   = eyeX();
  const cy   = eyeCY();
  const clx  = lensX();

  // Net ametropia after correction
  const net = residualD();
  // fuoco spostato di ~0,45 mm per diottria di errore residuo
  const focPhysMm = EYE_AX_MM + net * MM_PER_D;
  const focX = cx + focPhysMm * s;
  const retX = cx + EYE_AX_MM * s;

  const isAmetropic = blurD() > 0.15;
  const rayColor = isAmetropic
    ? (dk ? '#ff5252' : '#cc2222')
    : (dk ? '#88aacc' : '#334466');

  const nR     = params.nRays;
  const aperMM = 2.5;

  sc.save();

  for (let i = 0; i < nR; i++) {
    const t   = nR === 1 ? 0.5 : i / (nR - 1);
    const yMm = -aperMM + t * 2 * aperMM;   // mm above optical axis (+ = above)
    const yAtClx = cy - yMm * s;            // canvas y at corrective-lens plane

    // After corrective lens: paraxial slope = yMm / f_corr = yMm * Pc / 1000
    const m1 = yMm * params.correction / 1000;

    // Canvas y where ray arrives at cornea
    const yAt_cx = params.correction !== 0
      ? yAtClx + m1 * (cx - clx)
      : yAtClx;

    // Slope inside eye so ray converges to focX on axis
    const m2 = (focX - cx) > 0.5 ? (cy - yAt_cx) / (focX - cx) : 0;

    sc.strokeStyle = rayColor;
    sc.lineWidth   = 1.2;
    sc.setLineDash([]);

    // Segment 1: horizontal from left edge → corrective lens (or cornea)
    const xSeg1End = params.correction !== 0 ? clx : cx;
    sc.beginPath();
    sc.moveTo(0, yAtClx);
    sc.lineTo(xSeg1End, yAtClx);
    sc.stroke();

    // Segment 2 (only if corrective lens present): clx → cx, bent by correction
    if (params.correction !== 0) {
      sc.beginPath();
      sc.moveTo(clx, yAtClx);
      sc.lineTo(cx, yAt_cx);
      sc.stroke();
    }

    // Segment 3: inside eye, converging toward focX
    const xFocDraw = Math.min(focX, cx + (EYE_AX_MM + 3) * s);
    const yFocDraw = yAt_cx + m2 * (xFocDraw - cx);
    sc.beginPath();
    sc.moveTo(cx, yAt_cx);
    sc.lineTo(xFocDraw, yFocDraw);
    sc.stroke();

    // Dashed continuation past focus for myopia (rays diverge after crossing)
    if (isAmetropic && focX < retX - 2) {
      const xExt = Math.min(retX + 8, cx + (EYE_AX_MM + 4) * s);
      const yExt = yFocDraw + m2 * (xExt - xFocDraw);
      sc.save();
      sc.setLineDash([3, 3]);
      sc.globalAlpha = 0.45;
      sc.beginPath();
      sc.moveTo(xFocDraw, yFocDraw);
      sc.lineTo(xExt, yExt);
      sc.stroke();
      sc.setLineDash([]);
      sc.restore();
    }
  }

  drawFocusOnRetina(focX, retX, cy, s, isAmetropic ? col.focusBad : col.focusOk, dk);

  sc.restore();
}


function drawFocusOnRetina(focX, retX, cy, s, color, dk) {
  // Draw where the rays converge relative to retina
  const col = eyeColors(dk);
  const delta = focX - retX;  // positive = behind retina (hyperopia), negative = in front (myopia)

  // Focus dot (real position)
  if (isFinite(focX) && focX > eyeX() && focX < eyeX() + (EYE_AX_MM + 15) * s) {
    sc.save();
    sc.beginPath();
    sc.arc(focX, cy, 5, 0, Math.PI * 2);
    sc.fillStyle = color;
    sc.fill();

    // If not on retina: dashed line showing offset
    if (Math.abs(delta) > 3) {
      sc.strokeStyle = color;
      sc.lineWidth = 1;
      sc.setLineDash([3, 3]);
      sc.beginPath();
      sc.moveTo(retX, cy - 8);
      sc.lineTo(retX, cy + 8);
      sc.stroke();
      sc.setLineDash([]);

      // Blur circle on retina
      const blurR = Math.min(Math.abs(delta) * 0.35, 12);
      sc.beginPath();
      sc.arc(retX, cy, blurR, 0, Math.PI * 2);
      sc.strokeStyle = col.focusBad;
      sc.lineWidth = 1.5;
      sc.setLineDash([2, 2]);
      sc.stroke();
      sc.setLineDash([]);
    }
    sc.restore();
  }
}

// ── Vision defect label ───────────────────────────────────────────────────────
function drawDefectLabel(dk) {
  const net    = residualD();
  const label  = Math.abs(params.defect) < 0.1 && Math.abs(params.astig) < 0.1
    ? 'Vista normale'
    : params.defect < -0.1 ? 'Miopia'
    : params.defect > 0.1  ? 'Ipermetropia'
    : 'Astigmatismo';

  // ipercorretto: la lente va oltre la prescrizione (errore residuo di segno opposto al difetto)
  const corrLabel = Math.abs(params.defect) < 0.1 ? 'lente non necessaria'
    : Math.abs(net) < 0.1 ? 'corretto' : (net * params.defect < 0 ? 'ipercorretto' : 'sottocorretto');

  sc.save();
  sc.font = 'bold 13px DM Sans';
  sc.fillStyle = isDark() ? '#c8dff0' : '#1a2a3a';
  sc.textAlign = 'left';
  sc.fillText(label, 16, 28);

  if (Math.abs(params.correction) > 0.05) {
    sc.font = '11px Space Mono';
    sc.fillStyle = Math.abs(net) < 0.1
      ? (isDark() ? '#00e676' : '#007733')
      : (isDark() ? '#ffaa44' : '#aa4400');
    sc.fillText(corrLabel, 16, 44);
  }
  sc.restore();
}

// ── Object mode: arrow + inverted image ──────────────────────────────────────
function drawObjectMode(dk) {
  const s    = MM_TO_PX();
  const cx   = eyeX(), cy = eyeCY();
  const retX = cx + EYE_AX_MM * s;

  // Image position moves with diopters (same formula as drawRays for parallel rays).
  // imgXpx === retX when net = 0 (10/10 vision, no residual error).
  const net       = residualD();
  const focPhysMm = EYE_AX_MM + net * MM_PER_D;
  const imgXpx    = cx + focPhysMm * s;

  // Magnification from thin-lens formula (object at 500 mm) — just for arrow size
  const P   = totalPower();
  const vMm = imageDistMm(P, -500);
  const mag = isFinite(vMm) ? vMm / 500 : 0.03;

  const objXpx = Math.max(18, lensX() - 52);
  const hObjPx = Math.min(SH * 0.14, 9.5 * s);
  const hImgPx = Math.min(hObjPx * Math.max(Math.abs(mag) * 26, 0.9), SH * 0.16);
  const imgTipY = cy + hImgPx;  // inverted, below axis

  const rayColor = dk ? '#d4aa30' : '#9070b0';
  sc.save();

  // Rays: object tip → pupil → converge to optical image position
  const aperPx = 2.2 * s;
  const nR = Math.min(params.nRays, 5);
  sc.strokeStyle = rayColor; sc.lineWidth = 1.1; sc.setLineDash([]);

  for (let i = 0; i < nR; i++) {
    const t      = nR === 1 ? 0.5 : i / (nR - 1);
    const yPupil = cy - aperPx + t * 2 * aperPx;

    sc.beginPath(); sc.moveTo(objXpx, cy - hObjPx); sc.lineTo(cx, yPupil); sc.stroke();
    sc.beginPath(); sc.moveTo(cx, yPupil); sc.lineTo(imgXpx, imgTipY); sc.stroke();
  }

  // Object arrow (upward ↑, amber)
  const arrowC = dk ? '#f0e060' : '#775512';
  sc.strokeStyle = arrowC; sc.fillStyle = arrowC; sc.lineWidth = 2.2;
  sc.beginPath(); sc.moveTo(objXpx, cy); sc.lineTo(objXpx, cy - hObjPx); sc.stroke();
  sc.beginPath();
  sc.moveTo(objXpx, cy - hObjPx);
  sc.lineTo(objXpx - 5, cy - hObjPx + 10);
  sc.lineTo(objXpx + 5, cy - hObjPx + 10);
  sc.closePath(); sc.fill();
  if (params.showLabels) {
    sc.font = '9px Space Mono'; sc.textAlign = 'center';
    sc.fillText('oggetto', objXpx, cy - hObjPx - 5);
  }

  // Image arrow: green, inverted (downward ↓), at optical image position
  // Lands on retina (retX) only when net = 0 — i.e. 10/10 vision
  const imgC = dk ? '#00e676' : '#00a844';
  sc.strokeStyle = imgC; sc.fillStyle = imgC; sc.lineWidth = 2.2;
  sc.beginPath(); sc.moveTo(imgXpx, cy); sc.lineTo(imgXpx, imgTipY); sc.stroke();
  sc.beginPath();
  sc.moveTo(imgXpx, imgTipY);
  sc.lineTo(imgXpx - 5, imgTipY - 9);
  sc.lineTo(imgXpx + 5, imgTipY - 9);
  sc.closePath(); sc.fill();
  if (params.showLabels) {
    sc.font = '9px Space Mono'; sc.textAlign = 'center';
    sc.fillText('immagine invertita', imgXpx, imgTipY + 13);
  }

  sc.restore();
}

// ── Main draw ─────────────────────────────────────────────────────────────────
function drawScene() {
  sc.clearRect(0, 0, SW, SH);
  const dk = isDark();
  sc.fillStyle = dk ? '#060a10' : '#f4f8ff';
  sc.fillRect(0, 0, SW, SH);

  drawAxis(dk);
  drawCorrectiveLens(dk);
  drawEye(dk);
  if (params.objectMode) {
    drawObjectMode(dk);
  } else {
    drawRays(dk);
  }
  drawDefectLabel(dk);
  updateReadout();
}

// ── Graphs ────────────────────────────────────────────────────────────────────
function drawGraphs() {
  gc.clearRect(0, 0, GW, GH);
  const dk = isDark(), C = Lab.graphColors();
  const w1 = Math.floor(GW * 0.36), w2 = Math.floor(GW * 0.36), w3 = GW - w1 - w2;
  const lens = [-10, 10], rx = params.defect;

  // 1: posizione del fuoco rispetto alla retina in funzione della lente: si annulla alla prescrizione
  let g = Lab.axes(gc, { x: 3, y: 3, w: w1 - 6, h: GH - 6, xr: lens, xStep: 2, yr: [-6, 6], yStep: 2,
    title: 'Fuoco rispetto alla retina (mm)', xLabel: 'lente (D)' });
  gc.save(); gc.setLineDash([3, 3]); gc.strokeStyle = C.amber; gc.beginPath(); gc.moveTo(g.X(rx), g.T); gc.lineTo(g.X(rx), g.B); gc.stroke(); gc.restore();
  Lab.plot(gc, g, d => (params.defect - d) * MM_PER_D, lens, dk ? '#00d4ff' : '#0088cc', 2);
  Lab.dot(gc, g, params.correction, residualD() * MM_PER_D, blurD() < 0.15 ? C.green : C.amber, 4.5);
  gc.fillStyle = C.text; gc.font = '9.5px "DM Sans",sans-serif'; gc.textAlign = 'right'; gc.textBaseline = 'middle';
  gc.fillText('dietro la retina ↑', g.R - 4, g.T + 8); gc.fillText('davanti ↓', g.R - 4, g.B - 8);

  // 2: acuità visiva in funzione della lente: massima quando la lente uguaglia la prescrizione
  g = Lab.axes(gc, { x: w1 + 3, y: 3, w: w2 - 6, h: GH - 6, xr: lens, xStep: 2, yr: [0, 10], yStep: 2,
    title: 'Acuità visiva (decimi)', xLabel: 'lente (D)' });
  gc.save(); gc.setLineDash([3, 3]); gc.strokeStyle = C.amber; gc.beginPath(); gc.moveTo(g.X(rx), g.T); gc.lineTo(g.X(rx), g.B); gc.stroke(); gc.restore();
  Lab.plot(gc, g, d => 10 * acuityOf(Math.abs(params.defect - d) + params.astig * 0.5), lens, C.green, 2);
  Lab.dot(gc, g, params.correction, 10 * acuityOf(blurD()), C.green, 4.5);
  Lab.legend(gc, g.L + 8, g.T + 8, [[C.amber, `prescrizione ${(rx > 0 ? '+' : '') + Lab.fmt(rx, 2)} D`, [3, 3]]]);

  drawVisionTest(w1 + w2, 0, w3, GH, dk);
}

// Graph 2: simulated vision through an optometrist's eyepiece
function drawVisionTest(ox, oy, W, H, dk) {
  const net    = residualD();
  const blurPx = Math.min(blurD() * 2.8, 28);

  const mx = ox + W / 2;
  const my = oy + H / 2 + 5;
  const r  = Math.min(W * 0.44, (H - 26) * 0.47);

  // Title
  gc.save();
  gc.fillStyle = dk ? '#c8dff0' : '#223';
  gc.font = '11px DM Sans'; gc.textAlign = 'center';
  gc.fillText('Vista simulata', mx, oy + 13);
  gc.restore();

  // Horizon at 48% from circle top
  const hy = my - r * 0.05;

  // ── Blurred scene inside circle ───────────────────────────────────────────
  gc.save();
  gc.beginPath(); gc.arc(mx, my, r, 0, Math.PI * 2); gc.clip();
  if (blurPx > 0.3) gc.filter = `blur(${blurPx.toFixed(1)}px)`;

  // Sky
  const skyG = gc.createLinearGradient(mx, my - r, mx, hy);
  skyG.addColorStop(0, '#0c4ea0'); skyG.addColorStop(1, '#3b90de');
  gc.fillStyle = skyG;
  gc.fillRect(mx - r - 2, my - r - 2, r * 2 + 4, hy - (my - r) + 2);

  // Ground (yellow-green field)
  const gndG = gc.createLinearGradient(mx, hy, mx, my + r);
  gndG.addColorStop(0, '#80ba28'); gndG.addColorStop(0.5, '#a8d840'); gndG.addColorStop(1, '#cce870');
  gc.fillStyle = gndG;
  gc.fillRect(mx - r - 2, hy, r * 2 + 4, r + 4);

  // Road (perspective trapezoid)
  const vhw = r * 0.022, bhw = r * 0.38;
  gc.beginPath();
  gc.moveTo(mx - vhw, hy); gc.lineTo(mx + vhw, hy);
  gc.lineTo(mx + bhw, my + r + 2); gc.lineTo(mx - bhw, my + r + 2);
  gc.closePath();
  gc.fillStyle = '#38383c'; gc.fill();

  // Road edge lines (white)
  gc.lineWidth = 1.5; gc.strokeStyle = 'rgba(240,240,240,0.72)';
  for (const s of [-1, 1]) {
    gc.beginPath();
    gc.moveTo(mx + s * vhw * 0.82, hy);
    gc.lineTo(mx + s * bhw * 0.86, my + r + 2);
    gc.stroke();
  }

  // Center dashes (yellow, perspective thickness)
  gc.strokeStyle = '#f0c830';
  for (let i = 0; i < 8; i++) {
    const t0 = (i + 0.1) / 8, t1 = (i + 0.55) / 8;
    const ya = hy + t0 * r * 0.93, yb = hy + t1 * r * 0.93;
    gc.lineWidth = 0.6 + t0 * 1.8;
    gc.beginPath(); gc.moveTo(mx, ya); gc.lineTo(mx, yb); gc.stroke();
  }

  // Clouds
  gc.fillStyle = 'rgba(255,255,255,0.78)';
  for (const [ex, ey, erx, ery] of [
    [mx - r*0.50, hy - r*0.53, r*0.16, r*0.065],
    [mx - r*0.41, hy - r*0.60, r*0.10, r*0.054],
    [mx + r*0.47, hy - r*0.51, r*0.14, r*0.062],
    [mx + r*0.54, hy - r*0.44, r*0.09, r*0.048],
  ]) {
    gc.beginPath(); gc.ellipse(ex, ey, erx, ery, 0, 0, Math.PI * 2); gc.fill();
  }

  // Hot air balloon
  const bx = mx, by = hy - r * 0.30, bR = r * 0.145;
  const bCols = ['#e82020','#f06820','#f0d020','#28a828','#3060c8','#e82020'];
  gc.save();
  gc.beginPath(); gc.ellipse(bx, by, bR, bR * 1.12, 0, 0, Math.PI * 2); gc.clip();
  bCols.forEach((c, i) => {
    gc.fillStyle = c;
    gc.fillRect(bx - bR + (i / bCols.length) * bR * 2, by - bR * 1.2,
                bR * 2 / bCols.length + 1, bR * 2.4);
  });
  gc.restore();
  gc.beginPath(); gc.ellipse(bx, by, bR, bR * 1.12, 0, 0, Math.PI * 2);
  gc.strokeStyle = 'rgba(0,0,0,0.30)'; gc.lineWidth = 1; gc.stroke();
  // Basket + ropes
  gc.fillStyle = '#a06020';
  gc.fillRect(bx - bR * 0.22, by + bR * 1.12, bR * 0.44, bR * 0.26);
  gc.strokeStyle = 'rgba(100,50,0,0.55)'; gc.lineWidth = 0.7;
  for (const sx of [-0.18, 0.18]) {
    gc.beginPath(); gc.moveTo(bx + sx * bR, by + bR * 1.0); gc.lineTo(bx + sx * bR, by + bR * 1.12); gc.stroke();
  }

  gc.filter = 'none';
  gc.restore();  // end clip

  // Mask outside circle with panel background
  gc.save();
  gc.beginPath();
  gc.rect(ox, oy + 18, W, H);
  gc.arc(mx, my, r, 0, Math.PI * 2, true);
  gc.fillStyle = dk ? '#060a10' : '#f4f8ff'; gc.fill();
  // Thin circle border
  gc.beginPath(); gc.arc(mx, my, r, 0, Math.PI * 2);
  gc.strokeStyle = dk ? 'rgba(200,220,255,0.25)' : 'rgba(0,0,80,0.18)';
  gc.lineWidth = 1; gc.stroke();
  gc.restore();

  // Bottom label
  gc.save();
  const isOk = blurD() < 0.15;
  gc.fillStyle = isOk ? (dk ? '#00e676' : '#00a844') : (dk ? '#ff8844' : '#cc5500');
  gc.font = '9px Space Mono'; gc.textAlign = 'center';
  gc.fillText(isOk ? 'fuoco perfetto' : 'sfocata: errore ' + (net > 0 ? '+' : '') + Lab.fmt(net, 2) + ' D' + (params.astig > 0 ? ' + astigm.' : ''), mx, oy + H - 3);
  gc.restore();
}

// ── Readout ───────────────────────────────────────────────────────────────────
const rdout = new Lab.Readout(document.getElementById('readout'), [
  { key: 'defect', label: 'difetto (prescrizione)' },
  { key: 'corr',   label: 'lente' },
  { key: 'net',    label: 'errore residuo' },
  { key: 'focus',  label: 'fuoco' },
  { key: 'acuity', label: 'acuità visiva' },
]);

function updateReadout() {
  const net = residualD(), off = net * MM_PER_D;
  const fmtD = v => (v > 0 ? '+' : '') + Lab.fmt(v, 2) + ' D';
  rdout.set('defect', fmtD(params.defect) + (params.astig > 0 ? ` · cil. ${Lab.fmt(params.astig, 2)}` : ''));
  rdout.set('corr',   params.correction === 0 ? 'nessuna' : fmtD(params.correction));
  rdout.set('net',    fmtD(net));
  rdout.set('focus',  Math.abs(off) < 0.05 ? 'sulla retina' : `${Lab.fmt(Math.abs(off), 1)} mm ${off < 0 ? 'davanti' : 'dietro'}`);
  rdout.set('acuity', Lab.fmt(acuityOf(blurD()) * 10, 1) + '/10');
}

// ── Controls ──────────────────────────────────────────────────────────────────
function buildControls() {
  const el = document.getElementById('controls');
  el.innerHTML = '';

  const secDefect = Lab.Section('Difetto visivo');
  secDefect.add(Lab.SliderInput({
    label: 'Miopia / Ipermetropia', min: -8, max: 8, value: params.defect, step: 0.25, unit: ' D',
    hint: '− = miopia  + = ipermetropia',
    onChange: v => { params.defect = v; drawScene(); drawGraphs(); },
  }));
  secDefect.add(Lab.SliderInput({
    label: 'Astigmatismo', min: 0, max: 4, value: params.astig, step: 0.25, unit: ' D',
    onChange: v => { params.astig = v; drawScene(); drawGraphs(); },
  }));
  el.appendChild(secDefect.el);

  const secCorr = Lab.Section('Lente correttiva');
  secCorr.add(Lab.SliderInput({
    label: 'Lente dell’occhiale', min: -10, max: 10, value: params.correction, step: 0.25, unit: ' D',
    hint: '− divergente (miopia), + convergente (ipermetropia)',
    onChange: v => { params.correction = v; drawScene(); drawGraphs(); },
  }));
  el.appendChild(secCorr.el);

  const secDisp = Lab.Section('Visualizzazione');
  secDisp.add(Lab.SliderInput({
    label: 'N° raggi', min: 3, max: 13, value: params.nRays, step: 2, unit: '',
    onChange: v => { params.nRays = Math.round(v); drawScene(); },
  }));
  secDisp.add(Lab.Toggle({
    label: 'Etichette', value: params.showLabels,
    onChange: v => { params.showLabels = v; drawScene(); },
  }));
  secDisp.add(Lab.Toggle({
    label: 'Modalità oggetto', value: params.objectMode,
    onChange: v => { params.objectMode = v; drawScene(); },
  }));
  el.appendChild(secDisp.el);
}

// ── Resize ────────────────────────────────────────────────────────────────────
const graphArea = document.getElementById('graphArea');

function resize() {
  dpr = window.devicePixelRatio || 1;
  const parent   = simCanvas.parentElement;
  const graphH   = graphArea.offsetHeight  || 180;
  const readoutH = document.getElementById('readout').offsetHeight || 56;

  SW = parent.clientWidth;
  SH = Math.max(80, parent.clientHeight - graphH - readoutH);

  simCanvas.width  = Math.round(SW * dpr);  simCanvas.height  = Math.round(SH * dpr);
  simCanvas.style.width  = SW + 'px';       simCanvas.style.height = SH + 'px';
  sc.setTransform(dpr, 0, 0, dpr, 0, 0);

  GW = graphArea.clientWidth;
  GH = graphArea.clientHeight || 180;
  graphCanvas.width  = Math.round(GW * dpr);  graphCanvas.height  = Math.round(GH * dpr);
  graphCanvas.style.width  = GW + 'px';       graphCanvas.style.height = GH + 'px';
  gc.setTransform(dpr, 0, 0, dpr, 0, 0);

  drawScene(); drawGraphs();
}

const ro = new ResizeObserver(() => resize());
ro.observe(simCanvas.parentElement);

// ── Init ──────────────────────────────────────────────────────────────────────
Lab.initTheme();
buildControls();
new MutationObserver(() => { drawScene(); drawGraphs(); })
  .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
resize();
