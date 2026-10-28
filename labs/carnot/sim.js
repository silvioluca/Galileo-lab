'use strict';

const R_GAS = 8.314;

const GAS_TYPES = [
  { id:'mono', label:'Monatomico', hint:'γ = 5/3', gamma:5/3 },
  { id:'di',   label:'Biatomico',  hint:'γ = 7/5', gamma:7/5 },
];

const PHASES = [
  { label:'1→2  Isoterma Tᴴ',  color:'#ff5520' },
  { label:'2→3  Adiabatica',    color:'#8898b8' },
  { label:'3→4  Isoterma Tᴄ',  color:'#2080ff' },
  { label:'4→1  Adiabatica',    color:'#8898b8' },
];

const params = { TH:600, TC:300, n:1.0, V1:2.0, r:4.5, gas:'mono', speed:1.0 };
let st = null;

function minR() {
  const gamma = GAS_TYPES.find(g => g.id === params.gas).gamma;
  return Math.pow(params.TH / params.TC, 1 / (gamma - 1));
}

function recompute() {
  const { TH, TC, n, V1, r, gas } = params;
  const gamma = GAS_TYPES.find(g => g.id === gas).gamma;
  const sigma = Math.pow(TH / TC, 1 / (gamma - 1));
  const rUse  = Math.max(r, sigma + 0.02);
  const V2 = V1 * rUse, V3 = V2 * sigma, V4 = V1 * sigma;
  const nR = n * R_GAS;
  const QH = nR * TH * Math.log(rUse), QC = nR * TC * Math.log(rUse);
  st = {
    gamma, sigma, rUse,
    V1, V2, V3, V4,
    P1: nR*TH/V1, P2: nR*TH/V2, P3: nR*TC/V3, P4: nR*TC/V4,
    TH, TC, n,
    QH, QC, Wnet: QH - QC, eta: 1 - TC/TH, dS: nR * Math.log(rUse),
  };
}

// ── Animation state ────────────────────────────────────────────────────────────
let animT = 0, running = false, lastMs = 0, rafId = 0;

function getPoint(t) {
  if (!st || !Number.isFinite(t)) return null;
  const fl    = Math.floor(t);
  const phase = ((fl % 4) + 4) % 4;   // always 0–3, safe for negative t
  const frac  = t - fl;               // always in [0, 1)
  const { V1, V2, V3, V4, TH, TC, gamma, sigma, rUse, dS } = st;
  let V, T, S;
  switch (phase) {
    case 0: V = V1 * Math.pow(rUse,  frac); T = TH; S = dS * frac;              break;
    case 1: V = V2 * Math.pow(sigma, frac); T = TH * Math.pow(V2/V, gamma-1); S = dS;  break;
    case 2: V = V3 * Math.pow(V4/V3, frac); T = TC; S = dS * (1 - frac);       break;
    case 3: V = V4 * Math.pow(V1/V4, frac); T = TC * Math.pow(V4/V, gamma-1); S = 0;   break;
    default: V = V1; T = TH; S = 0; break;
  }
  if (!Number.isFinite(V) || !Number.isFinite(T)) return null;
  return { V, T, S, P: params.n * R_GAS * T / V, phase, frac };
}

// ── Canvas setup ───────────────────────────────────────────────────────────────
const simCanvas   = document.getElementById('simCanvas');
const graphCanvas = document.getElementById('graphCanvas');
const graphArea   = document.getElementById('graphArea');
const readoutEl   = document.getElementById('readout');
const ctx  = simCanvas.getContext('2d');
const gctx = graphCanvas.getContext('2d');
let cw = 0, ch = 0, gw = 0, gh = 0;

function isDark() { return document.documentElement.dataset.theme !== 'light'; }

function resizeCanvases() {
  const dpr    = window.devicePixelRatio || 1;
  const parent = simCanvas.parentElement;
  const graphH = graphArea.offsetHeight;
  const hH     = document.getElementById('resizeHandle').offsetHeight;
  const rH     = readoutEl.offsetHeight;

  cw = parent.clientWidth || 0;
  ch = Math.max(120, (parent.clientHeight || 0) - (graphH || 0) - (rH || 0) - (hH || 0));
  if (!Number.isFinite(cw) || !Number.isFinite(ch)) return;
  simCanvas.width        = Math.round(cw * dpr);
  simCanvas.height       = Math.round(ch * dpr);
  simCanvas.style.width  = cw + 'px';
  simCanvas.style.height = ch + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  gw = graphArea.clientWidth || 0;
  gh = graphArea.clientHeight || 0;
  graphCanvas.width        = Math.round(gw * dpr);
  graphCanvas.height       = Math.round(gh * dpr);
  graphCanvas.style.width  = gw + 'px';
  graphCanvas.style.height = gh + 'px';
  gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ── Particles ──────────────────────────────────────────────────────────────────
const N_PART = 28;
const parts = Array.from({length: N_PART}, () => ({
  x: Math.random(), y: Math.random(),
  vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2,
}));

function stepParts(dt, T) {
  const spd = 0.42 * Math.sqrt(T / 300);
  for (const p of parts) {
    const s = Math.hypot(p.vx, p.vy);
    if (s > 0.001) { p.vx = p.vx/s * spd; p.vy = p.vy/s * spd; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.x < 0) { p.x = 0; p.vx =  Math.abs(p.vx); }
    if (p.x > 1) { p.x = 1; p.vx = -Math.abs(p.vx); }
    if (p.y < 0) { p.y = 0; p.vy =  Math.abs(p.vy); }
    if (p.y > 1) { p.y = 1; p.vy = -Math.abs(p.vy); }
  }
}

// ── Arrow helper ───────────────────────────────────────────────────────────────
function arrowLine(c, x1, y1, x2, y2, col, lw) {
  const dx = x2-x1, dy = y2-y1, L = Math.hypot(dx, dy);
  if (L < 6) return;
  const ux = dx/L, uy = dy/L, hs = 8, hw = 5;
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2 - ux*hs, y2 - uy*hs);
  c.strokeStyle = col; c.lineWidth = lw; c.stroke();
  c.beginPath();
  c.moveTo(x2, y2);
  c.lineTo(x2 - ux*hs - uy*hw, y2 - uy*hs + ux*hw);
  c.lineTo(x2 - ux*hs + uy*hw, y2 - uy*hs - ux*hw);
  c.closePath(); c.fillStyle = col; c.fill();
}

// ── Panel 1: Heat engine schematic ────────────────────────────────────────────
function drawEngine(c, ox, oy, w, h, dk, ap) {
  const cx   = ox + w / 2;
  const HC   = '#ff5520', CC = '#2080ff';
  const WC   = dk ? '#90b0cc' : '#506070';
  const boxW = Math.min(w * 0.80, 160);
  const boxH = Math.min(h * 0.11, 36);
  const engR = Math.min(w * 0.19, h * 0.10, 38);

  const hotTop  = oy + h * 0.08;
  const hotBot  = hotTop + boxH;
  const engCy   = oy + h * 0.50;
  const coldBot = oy + h * 0.92;
  const coldTop = coldBot - boxH;
  const gap     = 5;

  // Panel title
  c.fillStyle = dk ? 'rgba(0,212,255,0.55)' : 'rgba(0,100,180,0.52)';
  c.font = 'bold 9px "Space Mono",monospace'; c.textAlign = 'center';
  c.fillText('MACCHINA TERMICA', cx, oy + 13);

  // Hot reservoir
  c.beginPath(); c.roundRect(cx - boxW/2, hotTop, boxW, boxH, 4);
  c.fillStyle = 'rgba(255,85,30,0.18)'; c.fill();
  c.strokeStyle = HC + '88'; c.lineWidth = 1.5; c.stroke();
  c.fillStyle = HC; c.font = 'bold 11px "DM Sans",sans-serif'; c.textAlign = 'center';
  c.fillText(`Tᴴ = ${st.TH} K`, cx, hotTop + boxH * 0.44);
  c.font = '9px "DM Sans",sans-serif';
  c.fillText('SORGENTE CALDA', cx, hotTop + boxH * 0.82);

  // Cold reservoir
  c.beginPath(); c.roundRect(cx - boxW/2, coldTop, boxW, boxH, 4);
  c.fillStyle = 'rgba(40,120,255,0.18)'; c.fill();
  c.strokeStyle = CC + '88'; c.lineWidth = 1.5; c.stroke();
  c.fillStyle = CC; c.font = 'bold 11px "DM Sans",sans-serif'; c.textAlign = 'center';
  c.fillText(`Tᴄ = ${st.TC} K`, cx, coldTop + boxH * 0.44);
  c.font = '9px "DM Sans",sans-serif';
  c.fillText('POZZO FREDDO', cx, coldTop + boxH * 0.82);

  // Engine circle
  c.beginPath(); c.arc(cx, engCy, engR, 0, Math.PI * 2);
  c.fillStyle = dk ? '#253448' : '#c5d3e0'; c.fill();
  c.strokeStyle = dk ? 'rgba(130,165,220,0.55)' : 'rgba(50,100,170,0.48)';
  c.lineWidth = 2; c.stroke();
  c.fillStyle = dk ? 'rgba(175,210,255,0.82)' : 'rgba(15,55,125,0.78)';
  c.font = 'bold 10px "DM Sans",sans-serif'; c.textAlign = 'center';
  c.fillText('MOTORE', cx, engCy + 4);

  // Q_H arrow (hot → engine)
  arrowLine(c, cx, hotBot + gap, cx, engCy - engR - gap, HC, 2.2);
  c.fillStyle = HC; c.font = '9px "Space Mono",monospace'; c.textAlign = 'left';
  c.fillText(`Qᴴ=${Lab.fmt(st.QH,0)}J`, cx + 7, (hotBot + engCy - engR) / 2 + 4);

  // Q_C arrow (engine → cold)
  arrowLine(c, cx, engCy + engR + gap, cx, coldTop - gap, CC, 2.2);
  c.fillStyle = CC; c.textAlign = 'left';
  c.fillText(`Qᴄ=${Lab.fmt(st.QC,0)}J`, cx + 7, (engCy + engR + coldTop) / 2 + 4);

  // W arrow (engine → right)
  const wx1 = cx + engR + gap, wx2 = ox + w - 10;
  arrowLine(c, wx1, engCy, wx2, engCy, WC, 2.2);
  c.fillStyle = WC; c.font = '9px "Space Mono",monospace'; c.textAlign = 'center';
  c.fillText(`W=${Lab.fmt(st.Wnet,0)}J`, (wx1 + wx2) / 2, engCy - 8);

  // η — prominent
  c.fillStyle = dk ? '#00d4ff' : '#004f99';
  c.font = 'bold 17px "Space Mono",monospace'; c.textAlign = 'center';
  c.fillText(`η = ${Lab.fmt((st.eta * 100),1)}%`, cx, oy + h - 8);

  // Animated pulse on active heat arrow
  if (ap) {
    const pulse = 0.35 + 0.65 * Math.abs(Math.sin(ap.frac * Math.PI * 3));
    if (ap.phase === 0) {
      c.globalAlpha = pulse * 0.65;
      arrowLine(c, cx, hotBot + gap, cx, engCy - engR - gap, HC, 4.5);
      c.globalAlpha = 1;
    } else if (ap.phase === 2) {
      c.globalAlpha = pulse * 0.65;
      arrowLine(c, cx, engCy + engR + gap, cx, coldTop - gap, CC, 4.5);
      c.globalAlpha = 1;
    }
  }
}

// ── Panel 2: Vertical piston ───────────────────────────────────────────────────
function drawPiston(c, ox, oy, w, h, dk, ap) {
  if (!ap) return;
  const ph  = PHASES[ap.phase];
  const tN  = Math.max(0, Math.min(1, (ap.T - st.TC) / (st.TH - st.TC)));
  const rc  = Math.round(30  + tN * 215);
  const gc_ = Math.round(90  - tN *  60);
  const bc_ = Math.round(240 - tN * 210);

  // Panel title
  c.fillStyle = dk ? 'rgba(0,212,255,0.55)' : 'rgba(0,100,180,0.52)';
  c.font = 'bold 9px "Space Mono",monospace'; c.textAlign = 'center';
  c.fillText('PISTONE', ox + w/2, oy + 13);

  // Cylinder geometry — limited width
  const cylW    = Math.min(w * 0.42, 76);
  const cylH    = h * 0.60;
  const cylX    = ox + (w - cylW) / 2;
  const cylBotY = oy + h * 0.80;
  const cylTopY = cylBotY - cylH;
  const pisH    = 11;

  // Gas volume fraction
  const _vr   = (ap.V - st.V1) / (st.V3 - st.V1);
  const vFrac = Number.isFinite(_vr) ? Math.max(0.02, Math.min(0.97, _vr)) : 0.02;
  const gasH    = Math.max(pisH + 4, vFrac * (cylH - pisH));
  const pisTopY = cylBotY - gasH - pisH;
  const gasTopY = pisTopY + pisH;

  // Heat flow indicators
  if (ap.phase === 0) {
    c.fillStyle = '#ff5520'; c.font = '9px "DM Sans",sans-serif'; c.textAlign = 'center';
    c.fillText('↓ Qᴴ', ox + w/2, cylTopY - 16);
    arrowLine(c, ox+w/2-9, cylTopY-12, ox+w/2-9, cylTopY-1, '#ff5520bb', 1.4);
    arrowLine(c, ox+w/2+9, cylTopY-12, ox+w/2+9, cylTopY-1, '#ff5520bb', 1.4);
  } else if (ap.phase === 2) {
    c.fillStyle = '#2080ff'; c.font = '9px "DM Sans",sans-serif'; c.textAlign = 'center';
    c.fillText('↓ Qᴄ', ox + w/2, cylBotY + 24);
    arrowLine(c, ox+w/2-9, cylBotY+2, ox+w/2-9, cylBotY+14, '#2080ffbb', 1.4);
    arrowLine(c, ox+w/2+9, cylBotY+2, ox+w/2+9, cylBotY+14, '#2080ffbb', 1.4);
  }

  // Gas fill
  c.fillStyle = `rgba(${rc},${gc_},${bc_},0.18)`;
  c.fillRect(cylX + 1, gasTopY, cylW - 2, cylBotY - gasTopY);

  // Particles
  const gasRegH = cylBotY - gasTopY;
  if (gasRegH > 2) {
    c.save();
    c.beginPath(); c.rect(cylX + 1, gasTopY, cylW - 2, gasRegH); c.clip();
    for (const p of parts) {
      c.beginPath();
      c.arc(cylX + 1 + p.x * (cylW - 2), gasTopY + p.y * gasRegH, 2.5, 0, Math.PI * 2);
      c.fillStyle = `rgba(${rc},${gc_},${bc_},0.82)`;
      c.fill();
    }
    c.restore();
  }

  // Piston
  const pg = c.createLinearGradient(cylX, pisTopY, cylX, pisTopY + pisH);
  pg.addColorStop(0, dk ? '#b8cce0' : '#8898b0');
  pg.addColorStop(1, dk ? '#485c78' : '#c8d8e8');
  c.fillStyle = pg;
  c.fillRect(cylX + 1, pisTopY, cylW - 2, pisH);
  c.strokeStyle = dk ? 'rgba(185,215,255,0.48)' : 'rgba(50,80,140,0.38)';
  c.lineWidth = 1; c.strokeRect(cylX + 1, pisTopY, cylW - 2, pisH);

  // Piston rod
  const rodW = 5;
  c.fillStyle = dk ? '#607090' : '#8898b8';
  c.fillRect(cylX + cylW/2 - rodW/2, cylTopY, rodW, Math.max(0, pisTopY - cylTopY));

  // Cylinder walls
  c.strokeStyle = dk ? 'rgba(155,185,240,0.32)' : 'rgba(40,70,130,0.26)';
  c.lineWidth = 2;
  c.beginPath(); c.moveTo(cylX, cylTopY); c.lineTo(cylX, cylBotY); c.stroke();
  c.beginPath(); c.moveTo(cylX + cylW, cylTopY); c.lineTo(cylX + cylW, cylBotY); c.stroke();
  c.lineWidth = 3;
  c.beginPath(); c.moveTo(cylX - 3, cylBotY); c.lineTo(cylX + cylW + 3, cylBotY); c.stroke();

  // Phase label
  c.fillStyle = ph.color;
  c.font = 'bold 10px "DM Sans",sans-serif'; c.textAlign = 'center';
  c.fillText(ph.label, ox + w/2, oy + h - 8);

  // State values
  const oc = dk ? 'rgba(148,182,232,0.72)' : 'rgba(18,52,110,0.68)';
  c.fillStyle = oc; c.font = '9px "Space Mono",monospace'; c.textAlign = 'center';
  c.fillText(`V=${Lab.fmt(ap.V,2)}L  T=${Math.round(ap.T)}K`, ox + w/2, oy + h * 0.88);
  c.fillText(`P=${Lab.fmt(ap.P,0)} kPa`, ox + w/2, oy + h * 0.93);
}

// ── P-V diagram ────────────────────────────────────────────────────────────────
function drawPV(c, ox, oy, gW, gH, dk, ap) {
  // assi numerati (Lab.axes) attorno al riquadro; i fondoscala cambiano solo a scatti
  const f = Lab.axes(c, { x: ox - 46, y: oy - 24, w: gW + 56, h: gH + 54, bg: false,
    xr: [0, Lab.niceMax(st.V3 * 1.1)], yr: [0, Lab.niceMax(st.P1 * 1.1)], title: 'Diagramma p–V (p in kPa)', xLabel: 'V (L)' });
  const tx = f.X, ty = f.Y;
  const N  = 64;

  // Filled cycle area
  c.beginPath();
  for (let i=0;i<=N;i++){const V=st.V1+(st.V2-st.V1)*i/N;const P=params.n*R_GAS*st.TH/V;i?c.lineTo(tx(V),ty(P)):c.moveTo(tx(V),ty(P));}
  for (let i=1;i<=N;i++){const V=st.V2+(st.V3-st.V2)*i/N;const P=st.P2*Math.pow(st.V2/V,st.gamma);c.lineTo(tx(V),ty(P));}
  for (let i=1;i<=N;i++){const V=st.V3+(st.V4-st.V3)*i/N;const P=params.n*R_GAS*st.TC/V;c.lineTo(tx(V),ty(P));}
  for (let i=1;i<=N;i++){const V=st.V4+(st.V1-st.V4)*i/N;const P=st.P4*Math.pow(st.V4/V,st.gamma);c.lineTo(tx(V),ty(P));}
  c.closePath();
  c.fillStyle = 'rgba(0,212,255,0.07)'; c.fill();

  // 4 curves
  const curves = [
    { a:st.V1, b:st.V2, P:V=>params.n*R_GAS*st.TH/V,             col:PHASES[0].color },
    { a:st.V2, b:st.V3, P:V=>st.P2*Math.pow(st.V2/V,st.gamma),   col:PHASES[1].color },
    { a:st.V3, b:st.V4, P:V=>params.n*R_GAS*st.TC/V,             col:PHASES[2].color },
    { a:st.V4, b:st.V1, P:V=>st.P4*Math.pow(st.V4/V,st.gamma),   col:PHASES[3].color },
  ];
  curves.forEach(({a, b, P, col}) => {
    c.beginPath();
    for (let i=0;i<=N;i++){const V=a+(b-a)*i/N;i?c.lineTo(tx(V),ty(P(V))):c.moveTo(tx(V),ty(P(V)));}
    c.strokeStyle = col + 'cc'; c.lineWidth = 2.5; c.stroke();
  });

  // State points 1–4
  [{V:st.V1,P:st.P1,l:'1'},{V:st.V2,P:st.P2,l:'2'},{V:st.V3,P:st.P3,l:'3'},{V:st.V4,P:st.P4,l:'4'}]
    .forEach(({V, P, l}) => {
      c.beginPath(); c.arc(tx(V), ty(P), 4.5, 0, Math.PI*2);
      c.fillStyle = 'rgba(0,212,255,0.90)'; c.fill();
      c.fillStyle = dk ? 'rgba(175,215,255,0.88)' : 'rgba(18,58,120,0.84)';
      c.font = 'bold 11px "Space Mono",monospace'; c.textAlign = 'left';
      c.fillText(l, tx(V) + 7, ty(P) - 3);
    });

  // Animated dot
  if (ap) {
    c.beginPath(); c.arc(tx(ap.V), ty(ap.P), 7, 0, Math.PI*2);
    c.fillStyle = PHASES[ap.phase].color; c.fill();
    c.beginPath(); c.arc(tx(ap.V), ty(ap.P), 3, 0, Math.PI*2);
    c.fillStyle = '#fff'; c.fill();
  }
}


// ── T-S diagram ────────────────────────────────────────────────────────────────
function drawTS(c, ox, oy, gW, gH, dk, ap) {
  // T parte da zero: il rapporto fra le altezze dei due lati è Tc/Th, cioè 1 − η
  const f = Lab.axes(c, { x: ox - 46, y: oy - 24, w: gW + 56, h: gH + 54, bg: false,
    xr: [0, Lab.niceMax(st.dS * 1.3)], yr: [0, Lab.niceMax(st.TH * 1.15)], title: 'Diagramma T–S (T in K): l’area è il lavoro', xLabel: 'ΔS (J/K)' });
  const tx = f.X, ty = f.Y;

  c.fillStyle = 'rgba(0,212,255,0.07)';
  c.fillRect(tx(0), ty(st.TH), tx(st.dS) - tx(0), ty(st.TC) - ty(st.TH));

  const sides = [
    {x1:tx(0),     y1:ty(st.TH), x2:tx(st.dS), y2:ty(st.TH), col:PHASES[0].color},
    {x1:tx(st.dS), y1:ty(st.TH), x2:tx(st.dS), y2:ty(st.TC), col:PHASES[1].color},
    {x1:tx(st.dS), y1:ty(st.TC), x2:tx(0),     y2:ty(st.TC), col:PHASES[2].color},
    {x1:tx(0),     y1:ty(st.TC), x2:tx(0),     y2:ty(st.TH), col:PHASES[3].color},
  ];
  sides.forEach(({x1, y1, x2, y2, col}) => {
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
    c.strokeStyle = col + 'cc'; c.lineWidth = 2.5; c.stroke();
  });

  [[0,st.TH,'1'],[st.dS,st.TH,'2'],[st.dS,st.TC,'3'],[0,st.TC,'4']].forEach(([S, T, l]) => {
    c.beginPath(); c.arc(tx(S), ty(T), 4.5, 0, Math.PI*2);
    c.fillStyle = 'rgba(0,212,255,0.88)'; c.fill();
    c.fillStyle = dk ? 'rgba(178,212,255,0.88)' : 'rgba(18,58,120,0.82)';
    c.font = 'bold 10px "Space Mono",monospace'; c.textAlign = 'left';
    c.fillText(l, tx(S) + 7, ty(T) - 3);
  });

  const rcCx = (tx(0) + tx(st.dS)) / 2, rcCy = (ty(st.TH) + ty(st.TC)) / 2;
  c.fillStyle = dk ? 'rgba(0,212,255,0.55)' : 'rgba(0,108,188,0.50)';
  c.font = '9px "Space Mono",monospace'; c.textAlign = 'center';
  c.fillText(`W = ${Lab.fmt(st.Wnet,0)} J`, rcCx, rcCy - 4);
  c.fillText(`η = ${Lab.fmt((st.eta*100),1)}%`, rcCx, rcCy + 10);

  if (ap) {
    c.beginPath(); c.arc(tx(ap.S), ty(ap.T), 6.5, 0, Math.PI*2);
    c.fillStyle = PHASES[ap.phase].color; c.fill();
    c.beginPath(); c.arc(tx(ap.S), ty(ap.T), 2.5, 0, Math.PI*2);
    c.fillStyle = '#fff'; c.fill();
  }
}


// ── Draw simulation canvas (3 panels) ─────────────────────────────────────────
function drawSim(ap) {
  if (!(cw > 0 && ch > 0)) return;
  ctx.clearRect(0, 0, cw, ch);

  const dk = isDark();
  const W = cw, H = ch;
  const pw = Math.floor(W / 3);

  // Dividers
  ctx.fillStyle = dk ? 'rgba(100,130,190,0.15)' : 'rgba(50,80,150,0.11)';
  ctx.fillRect(pw,     0, 1, H);
  ctx.fillRect(pw * 2, 0, 1, H);

  if (!ap || !st) return;

  drawEngine(ctx, 0,      0, pw, H, dk, ap);
  drawPiston(ctx, pw,     0, pw, H, dk, ap);

  drawPV(ctx, pw * 2 + 52, 40, pw - 52 - 14, H - 80, dk, ap);
}

// ── Draw graph canvas (T-S only) ───────────────────────────────────────────────
function drawGraphs(ap) {
  if (!(gw > 0 && gh > 0)) return;
  gctx.clearRect(0, 0, gw, gh);

  if (!st) return;
  const dk = isDark();
  drawTS(gctx, 54, 34, gw - 54 - 16, gh - 34 - 38, dk, ap);
}

// ── Readout ────────────────────────────────────────────────────────────────────
let readout;

function setupReadout() {
  readout = new Lab.Readout(document.getElementById('readout'), [
    { key:'fase', label:'fase del ciclo' },
    { key:'T',    label:'temperatura T'    },
    { key:'P',    label:'pressione p'    },
    { key:'V',    label:'volume V'    },
    { key:'eta',  label:'rendimento'    },
    { key:'W',    label:'lavoro W'    },
    { key:'QH',   label:'calore assorbito Q_H'  },
    { key:'QC',   label:'calore ceduto Q_C'  },
  ]);
}

function updateReadout(ap) {
  if (!ap || !st) return;
  readout.set('fase', `${ap.phase + 1} / 4`);
  readout.set('T',    `${Math.round(ap.T)} K`);
  readout.set('P',    `${Lab.fmt(ap.P,0)} kPa`);
  readout.set('V',    `${Lab.fmt(ap.V,2)} L`);
  readout.set('eta',  `${Lab.fmt((st.eta * 100),1)} %`);
  readout.set('W',    `${Lab.fmt(st.Wnet,0)} J`);
  readout.set('QH',   `${Lab.fmt(st.QH,0)} J`);
  readout.set('QC',   `${Lab.fmt(st.QC,0)} J`);
}

// ── Main draw ──────────────────────────────────────────────────────────────────
function draw() {
  if (!st) return;
  const ap = getPoint(animT);
  drawSim(ap);
  drawGraphs(ap);
  updateReadout(ap);
}

// ── Animation loop ─────────────────────────────────────────────────────────────
function tick(ms) {
  if (!running) return;
  const dt = Math.min((ms - lastMs) / 1000, 0.10);
  lastMs = ms;
  const ap = getPoint(animT);
  if (ap) stepParts(dt, ap.T);
  animT = ((animT + dt * params.speed * 0.45) % 4 + 4) % 4;
  if (!Number.isFinite(animT)) animT = 0;
  draw();
  rafId = requestAnimationFrame(tick);
}

function play() {
  if (running) return;
  running = true; lastMs = performance.now();
  document.getElementById('btnPlay').textContent = '⏸  PAUSA';
  rafId = requestAnimationFrame(tick);
}

function pause() {
  running = false; cancelAnimationFrame(rafId);
  document.getElementById('btnPlay').textContent = '▶  AVVIA';
}

function reset() { pause(); animT = 0; recompute(); draw(); }

// ── Controls ───────────────────────────────────────────────────────────────────
let sTH_s, sTC_s, sR_s;

function buildControls() {
  const c = document.getElementById('controls');

  const secT = Lab.Section('Temperature');
  sTH_s = Lab.SliderInput({ label:'Tᴴ  (sorgente calda)', min:350, max:1000, step:10, value:params.TH, unit:'K',
    onChange(v) {
      params.TH = v;
      if (params.TC >= params.TH - 60) { params.TC = params.TH - 60; sTC_s.setValue(params.TC); }
      const mr = minR();
      if (params.r < mr + 0.1) { params.r = +(mr + 0.15).toFixed(2); sR_s.setValue(params.r); }
      recompute(); draw();
    }
  });
  sTC_s = Lab.SliderInput({ label:'Tᴄ  (pozzo freddo)', min:100, max:500, step:10, value:params.TC, unit:'K',
    onChange(v) {
      params.TC = v;
      if (params.TC >= params.TH - 60) { params.TH = params.TC + 60; sTH_s.setValue(params.TH); }
      const mr = minR();
      if (params.r < mr + 0.1) { params.r = +(mr + 0.15).toFixed(2); sR_s.setValue(params.r); }
      recompute(); draw();
    }
  });
  secT.add(sTH_s).add(sTC_s);
  c.appendChild(secT.el);

  const secM = Lab.Section('Macchina');
  const sV1 = Lab.SliderInput({ label:'V₁  (vol. minimo)', min:0.5, max:6, step:0.5, value:params.V1, unit:'L',
    onChange(v) { params.V1 = v; recompute(); draw(); }
  });
  sR_s = Lab.SliderInput({ label:'V₂/V₁  (rapporto)', min:1.5, max:12, step:0.1, value:params.r, unit:'',
    hint:`min: ${Lab.fmt(minR(),2)}`,
    onChange(v) { params.r = v; recompute(); draw(); }
  });
  const sN = Lab.SliderInput({ label:'n  (quantità)', min:0.5, max:4, step:0.5, value:params.n, unit:'mol',
    onChange(v) { params.n = v; recompute(); draw(); }
  });
  secM.add(sV1).add(sR_s).add(sN);
  c.appendChild(secM.el);

  const secG = Lab.Section('Gas');
  const gasRg = Lab.RadioGroup({
    label:'Tipo', value:params.gas,
    options: GAS_TYPES.map(g => ({ value:g.id, label:g.label, hint:g.hint })),
    onChange(v) {
      params.gas = v;
      const mr = minR();
      if (params.r < mr + 0.1) { params.r = +(mr + 0.15).toFixed(2); sR_s.setValue(params.r); }
      recompute(); draw();
    }
  });
  secG.add(gasRg);
  c.appendChild(secG.el);

  const secS = Lab.Section('Simulazione');
  const sSpd = Lab.SliderInput({ label:'Velocità', min:0.2, max:4, step:0.1, value:params.speed, unit:'×',
    onChange(v) { params.speed = v; }
  });
  secS.add(sSpd);
  c.appendChild(secS.el);
}

// ── Resize handle ──────────────────────────────────────────────────────────────
function initResizeHandle() {
  const handle = document.getElementById('resizeHandle');
  let drag = false, startY = 0, startH = 0;
  handle.addEventListener('mousedown', e => {
    drag = true; startY = e.clientY; startH = graphArea.offsetHeight;
    handle.classList.add('dragging');
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!drag) return;
    graphArea.style.height = Math.max(80, Math.min(500, startH + (startY - e.clientY))) + 'px';
    resizeCanvases(); draw();
  });
  document.addEventListener('mouseup', () => {
    if (drag) { drag = false; handle.classList.remove('dragging'); document.body.style.userSelect = ''; }
  });
}

// ── Fullscreen ─────────────────────────────────────────────────────────────────
document.getElementById('btnFullscreen').addEventListener('click', () => {
  if (!document.fullscreenElement) graphArea.requestFullscreen?.();
  else document.exitFullscreen?.();
});
document.addEventListener('fullscreenchange', () => { resizeCanvases(); draw(); });

// ── Theme observer ─────────────────────────────────────────────────────────────
new MutationObserver(() => draw())
  .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// ── ResizeObserver ─────────────────────────────────────────────────────────────
new ResizeObserver(() => { resizeCanvases(); draw(); })
  .observe(simCanvas.parentElement);

// ── Buttons + Init ─────────────────────────────────────────────────────────────
document.getElementById('btnPlay').addEventListener('click',  () => running ? pause() : play());
document.getElementById('btnReset').addEventListener('click', reset);

Lab.initTheme();
buildControls();
setupReadout();
recompute();
initResizeHandle();
resizeCanvases();
draw();
