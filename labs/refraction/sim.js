'use strict';

/* ── Media presets  (Cauchy: n(λ) = A + B/λ²,  λ in μm) ──── */
const MEDIA = [
  { name: 'Aria',              n: 1.000, A: 1.0000, B: 0.000000 },
  { name: 'Acqua',             n: 1.333, A: 1.3199, B: 0.004970 },
  { name: 'Vetro crown (BK7)', n: 1.520, A: 1.5046, B: 0.004250 },
  { name: 'Vetro flint (F2)',  n: 1.625, A: 1.5974, B: 0.009590 },
  { name: 'Diamante',          n: 2.417, A: 2.3761, B: 0.014260 },
  { name: 'Personalizzato',    n: 1.500, A: 1.5000, B: 0.000000 },
];
const CUSTOM = MEDIA.length - 1;

/* Visible spectrum: 9 wavelengths (nm) with display colors */
const WAVELENGTHS = [
  { lam: 390, color: '#9400d3' },
  { lam: 430, color: '#6600ee' },
  { lam: 460, color: '#1a66ff' },
  { lam: 490, color: '#0099ff' },
  { lam: 530, color: '#00cc00' },
  { lam: 560, color: '#aacc00' },
  { lam: 590, color: '#ffcc00' },
  { lam: 620, color: '#ff6600' },
  { lam: 680, color: '#ff0000' },
];

/* ── State ───────────────────────────────────────────────── */
const params = {
  theta1:     45,
  preset1:     0,   // Aria
  preset2:     2,   // BK7
  preset3:     0,   // Aria
  n1c: 1.000, n2c: 1.520, n3c: 1.000,   // custom n per preset=CUSTOM
  d2:      3,       // spessore della lastra (cm)
  useN3:  false,
  dispersion: false,
};

/* ── Canvas ──────────────────────────────────────────────── */
const canvas      = document.getElementById('simCanvas');
const ctx         = canvas.getContext('2d');
const graphCanvas = document.getElementById('graphCanvas');
const gctx        = graphCanvas.getContext('2d');
const graphArea   = document.getElementById('graphArea');
const readoutEl   = document.getElementById('readout');
let cw = 0, ch = 0, gw = 0, gh = 0;

function resizeCanvases() {
  const dpr      = window.devicePixelRatio || 1;
  const parent   = canvas.parentElement;
  const graphH   = graphArea.offsetHeight;
  const handleH  = document.getElementById('resizeHandle').offsetHeight;
  const readoutH = readoutEl.offsetHeight;

  cw = parent.clientWidth;
  ch = Math.max(100, parent.clientHeight - graphH - readoutH - handleH);

  canvas.width  = cw * dpr; canvas.height = ch * dpr;
  canvas.style.width  = cw + 'px'; canvas.style.height = ch + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  gw = graphArea.clientWidth; gh = graphArea.clientHeight;
  graphCanvas.width  = gw * dpr; graphCanvas.height = gh * dpr;
  graphCanvas.style.width  = gw + 'px'; graphCanvas.style.height = gh + 'px';
  gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/* ── Physics ─────────────────────────────────────────────── */
function cauchyN(m, lam_nm) {
  if (m.B === 0) return m.A;
  const u = lam_nm / 1000;   // nm → μm
  return m.A + m.B / (u * u);
}

/* Returns refractive index for given preset+customN at given λ (null = standard) */
function getN(presetIdx, customN, lam_nm) {
  if (presetIdx === CUSTOM) return customN;
  const m = MEDIA[presetIdx];
  if (lam_nm == null) return m.n;
  return cauchyN(m, lam_nm);
}

/* Ray trace result: { tir12, tir23, t1, t2, t3, n1, n2, n3 } (angles in rad) */
function traceRay(theta1_deg, lam_nm) {
  const t1    = theta1_deg * Math.PI / 180;
  const n1    = getN(params.preset1, params.n1c, lam_nm);
  const n2    = getN(params.preset2, params.n2c, lam_nm);
  const n3eff = params.useN3 ? getN(params.preset3, params.n3c, lam_nm) : n1;

  const sinT2 = n1 * Math.sin(t1) / n2;
  if (sinT2 >= 1) return { tir12: true, t1, n1, n2, n3: n3eff };
  const t2 = Math.asin(sinT2);

  const sinT3 = n2 * Math.sin(t2) / n3eff;
  if (sinT3 >= 1) return { tir12: false, tir23: true, t1, t2, n1, n2, n3: n3eff };

  return { tir12: false, tir23: false, t1, t2, t3: Math.asin(sinT3), n1, n2, n3: n3eff };
}

/* ── Scene geometry ──────────────────────────────────────── */
function y1Int() { return ch * 0.30; }
function y2Int() { return y1Int() + ch * Math.min(params.d2 / 10, 0.42); }
function hitX()  { return cw * 0.50; }

/* ── Helpers ─────────────────────────────────────────────── */
function hexToRgba(hex, a) {
  const r = parseInt(hex.slice(1,3), 16),
        g = parseInt(hex.slice(3,5), 16),
        b = parseInt(hex.slice(5,7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

const MCOLORS = ['#4d9fff', '#00d4ff', '#2ecc71'];

/* ── Drawing: scene ──────────────────────────────────────── */
function drawScene() {
  const dark = document.documentElement.dataset.theme !== 'light';
  ctx.clearRect(0, 0, cw, ch);

  const y1 = y1Int(), y2 = y2Int(), hx = hitX();
  const incLen = y1 * 0.92;   // length of incident ray above interface

  /* Background fills */
  [
    { x:0, y:0,  w:cw, h:y1,      col: MCOLORS[0], a: dark ? 0.09 : 0.06 },
    { x:0, y:y1, w:cw, h:y2-y1,   col: MCOLORS[1], a: dark ? 0.15 : 0.10 },
    { x:0, y:y2, w:cw, h:ch-y2,   col: params.useN3 ? MCOLORS[2] : MCOLORS[0], a: dark ? 0.09 : 0.06 },
  ].forEach(r => {
    ctx.fillStyle = hexToRgba(r.col, r.a);
    ctx.fillRect(r.x, r.y, r.w, r.h);
  });

  /* Grid */
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.045)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= cw; x += 50) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,ch); ctx.stroke(); }
  for (let y = 0; y <= ch; y += 50) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(cw,y); ctx.stroke(); }

  /* Interface lines */
  ctx.strokeStyle = dark ? 'rgba(200,220,255,0.28)' : 'rgba(50,80,120,0.22)';
  ctx.lineWidth = 1.5; ctx.setLineDash([]);
  [y1, y2].forEach(y => { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(cw,y); ctx.stroke(); });

  /* Normal (dashed) at hit point */
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.16)';
  ctx.lineWidth = 1; ctx.setLineDash([6,5]);
  ctx.beginPath(); ctx.moveTo(hx, 0); ctx.lineTo(hx, y2 + 24); ctx.stroke();
  ctx.setLineDash([]);

  /* Draw rays */
  if (params.dispersion) {
    WAVELENGTHS.forEach(w => drawRay(traceRay(params.theta1, w.lam), w.color, hx, y1, y2, incLen, 0.72, dark));
  } else {
    const ray = traceRay(params.theta1, null);
    drawRay(ray, '#00d4ff', hx, y1, y2, incLen, 1.0, dark);
    drawAngles(ray, hx, y1, y2, dark);
  }

  drawLabels(y1, y2, dark);
  updateReadout();
}

/* Draw a single ray path; lw = line width derived from alpha */
function drawRay(ray, col, hx, y1, y2, incLen, alpha, dark) {
  if (!ray) return;
  const lw     = alpha >= 1 ? 2.0 : 1.4;
  const slabH  = y2 - y1;

  /* Incident ray: upper-left → hit point */
  const ix0 = hx - Math.tan(ray.t1) * incLen;
  arrowLine(ix0, y1 - incLen, hx, y1, col, alpha, 0.55, lw);

  if (ray.tir12) {
    /* TIR at 1→2: reflected ray going upper-right */
    arrowLine(hx, y1, hx + Math.tan(ray.t1) * incLen, y1 - incLen, col, alpha * 0.70, 0.55, lw);
    return;
  }

  /* Ray inside slab (1→2 to 2→3 hit) */
  const hx2 = hx + Math.tan(ray.t2) * slabH;
  arrowLine(hx, y1, hx2, y2, col, alpha, 0.50, lw);

  /* Normal at second interface (monochromatic only) */
  if (alpha >= 1) {
    const nExt = Math.min(ch * 0.22, slabH);
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.14)';
    ctx.lineWidth = 1; ctx.setLineDash([6,5]);
    ctx.beginPath(); ctx.moveTo(hx2, y2 - nExt); ctx.lineTo(hx2, y2 + nExt); ctx.stroke();
    ctx.setLineDash([]);
  }

  if (ray.tir23) {
    /* TIR at 2→3: reflect back through slab, exit upper-right */
    const rxUp = hx2 - Math.tan(ray.t2) * slabH;   // == hx
    arrowLine(hx2, y2, rxUp, y1, col, alpha * 0.65, 0.50, lw);
    arrowLine(rxUp, y1, rxUp + Math.tan(ray.t1) * incLen, y1 - incLen, col, alpha * 0.50, 0.55, lw);
    return;
  }

  /* Exit ray below slab */
  const exitH = ch - y2;
  arrowLine(hx2, y2, hx2 + Math.tan(ray.t3) * exitH, y2 + exitH, col, alpha, 0.50, lw);
}

function arrowLine(x1, y1, x2, y2, col, alpha, arrowPos, lw) {
  ctx.strokeStyle = hexToRgba(col, alpha); ctx.lineWidth = lw; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();

  const ax = x1 + (x2-x1)*arrowPos, ay = y1 + (y2-y1)*arrowPos;
  const ang = Math.atan2(y2-y1, x2-x1), hl = 9;
  ctx.beginPath();
  ctx.moveTo(ax - Math.cos(ang-0.42)*hl, ay - Math.sin(ang-0.42)*hl);
  ctx.lineTo(ax, ay);
  ctx.lineTo(ax - Math.cos(ang+0.42)*hl, ay - Math.sin(ang+0.42)*hl);
  ctx.stroke();
}

/*
 * Angle arcs: angles measured from the interface normal (vertical).
 * In canvas coords (y down), upward normal = -π/2.
 * Incident arc: ctx.arc(hx, y1, r,  -π/2, -π/2 - t1, CCW=true)
 * Refracted arc: ctx.arc(hx, y1, r,  π/2,  π/2 - t2, CCW=true)
 */
function drawAngles(ray, hx, y1, y2, dark) {
  if (!ray) return;
  const textCol = dark ? '#ddeeff' : '#0d1a26';
  const arcR    = Math.max(22, Math.min(44, Math.min(cw, ch) * 0.07));
  const fSize   = Math.max(11, Math.min(13, cw * 0.026));
  ctx.font = `bold ${fSize}px 'Space Mono', monospace`;
  ctx.textAlign = 'center'; ctx.lineWidth = 1.5;

  function arc(cx, cy, r, a0, a1, col) {
    ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1, true); ctx.stroke();
    const mid = a0 + (a1 - a0) * 0.5;
    ctx.fillStyle = textCol;
    ctx.fillText(
      `θ=${Lab.fmt(Math.abs(a0 - a1) * 180/Math.PI, 1)}°`,
      cx + Math.cos(mid) * (r + 18),
      cy + Math.sin(mid) * (r + 18)
    );
  }

  /* θ₁ — incident, above interface */
  arc(hx, y1, arcR, -Math.PI/2, -Math.PI/2 - ray.t1,
      dark ? 'rgba(255,200,60,0.8)' : 'rgba(200,130,0,0.85)');

  if (ray.tir12) return;

  /* θ₂ — refracted, below interface 1 */
  arc(hx, y1, arcR, Math.PI/2, Math.PI/2 - ray.t2,
      dark ? 'rgba(46,204,113,0.8)' : 'rgba(30,150,80,0.85)');

  if (!params.useN3 || ray.tir23) return;

  /* θ₃ — exit, below interface 2 */
  const hx2 = hx + Math.tan(ray.t2) * (y2 - y1);
  arc(hx2, y2, arcR, Math.PI/2, Math.PI/2 - ray.t3,
      dark ? 'rgba(255,180,0,0.8)' : 'rgba(200,120,0,0.85)');
}

function drawLabels(y1, y2, dark) {
  const col   = dark ? 'rgba(180,215,255,0.60)' : 'rgba(20,50,90,0.60)';
  const fSize = Math.max(11, Math.min(13, cw * 0.022));
  ctx.fillStyle = col;
  ctx.font = `600 ${fSize}px 'DM Sans', sans-serif`;
  ctx.textAlign = 'left';
  const lx = 10;
  const n1 = getN(params.preset1, params.n1c, null);
  const n2 = getN(params.preset2, params.n2c, null);
  const n3 = getN(params.preset3, params.n3c, null);

  ctx.fillText(`${MEDIA[params.preset1].name}  n₁ = ${Lab.fmt(n1, 3)}`, lx, y1 * 0.50 + fSize * 0.4);
  ctx.fillText(`${MEDIA[params.preset2].name}  n₂ = ${Lab.fmt(n2, 3)}`, lx, y1 + (y2-y1) * 0.50 + fSize * 0.4);
  const m3name = params.useN3 ? MEDIA[params.preset3].name : MEDIA[params.preset1].name;
  const n3val  = params.useN3 ? n3 : n1;
  const n3key  = params.useN3 ? 'n₃' : 'n₁';
  ctx.fillText(`${m3name}  ${n3key} = ${Lab.fmt(n3val, 3)}`, lx, y2 + (ch-y2) * 0.50 + fSize * 0.4);
}

/* ── Readout ─────────────────────────────────────────────── */
function updateReadout() {
  const ray = traceRay(params.theta1, null);
  const n1  = getN(params.preset1, params.n1c, null);
  const n2  = getN(params.preset2, params.n2c, null);
  const n3  = params.useN3 ? getN(params.preset3, params.n3c, null) : n1;

  const items = [{ label: 'incidenza θ₁', value: `${Lab.fmt(params.theta1, 1)}°` }];
  const deg = r => `${Lab.fmt(r * 180 / Math.PI, 1)}°`;
  if (ray.tir12) {
    items.push({ label: 'nel mezzo 2', value: 'riflessione totale' });
  } else {
    items.push({ label: 'rifrazione θ₂', value: deg(ray.t2) });
    if (params.useN3) items.push(ray.tir23 ? { label: 'nel mezzo 3', value: 'riflessione totale' } : { label: 'nel mezzo 3 θ₃', value: deg(ray.t3) });
    // spostamento laterale del raggio uscente rispetto al prolungamento di quello incidente
    if (!params.useN3 || Math.abs(n3 - n1) < 1e-9)
      items.push({ label: 'spostamento laterale', value: `${Lab.fmt(params.d2 * Math.sin(ray.t1 - ray.t2) / Math.cos(ray.t2), 2)} cm` });
  }
  const r = fresnel(n1, n2, ray.t1);
  items.push({ label: 'luce riflessa', value: `${Lab.fmt((r.Rs + r.Rp) * 50, 1)} %` });
  if (n1 > n2) items.push({ label: 'angolo limite 1→2', value: deg(Math.asin(n2 / n1)) });
  if (params.useN3 && n2 > n3) items.push({ label: 'angolo limite 2→3', value: deg(Math.asin(n3 / n2)) });

  readoutEl.innerHTML = items.map(it =>
    `<span class="readout-item"><span class="readout-label">${Lab.keepCaseHTML(it.label)}</span><span class="readout-value">${it.value}</span></span>`
  ).join('');
}

/* ── Graphs ──────────────────────────────────────────────── */
// frazione di luce riflessa all'interfaccia a → b (formule di Fresnel), polarizzazione s e p
function fresnel(na, nb, th) {
  const s = na * Math.sin(th) / nb;
  if (s >= 1) return { Rs: 1, Rp: 1 };
  const ci = Math.cos(th), ct = Math.sqrt(1 - s * s);
  const rs = (na * ci - nb * ct) / (na * ci + nb * ct), rp = (nb * ci - na * ct) / (nb * ci + na * ct);
  return { Rs: rs * rs, Rp: rp * rp };
}
// zona di riflessione totale: da θ_c a 90°
function shadeFrom(f, deg) {
  if (deg == null) return;
  gctx.fillStyle = f.C.light ? 'rgba(220,60,60,0.08)' : 'rgba(255,80,80,0.09)';
  gctx.fillRect(f.X(deg), f.T, f.R - f.X(deg), f.B - f.T);
  gctx.save(); gctx.setLineDash([4, 3]); gctx.strokeStyle = 'rgba(255,90,100,0.6)';
  gctx.beginPath(); gctx.moveTo(f.X(deg), f.T); gctx.lineTo(f.X(deg), f.B); gctx.stroke(); gctx.restore();
}

function drawGraphs() {
  if (!gw || !gh) return;
  gctx.clearRect(0, 0, gw, gh);
  const pw = gw / 3, d2r = Math.PI / 180;
  const n1 = getN(params.preset1, params.n1c, null), n2 = getN(params.preset2, params.n2c, null);
  const n3 = params.useN3 ? getN(params.preset3, params.n3c, null) : n1;
  const ray = traceRay(params.theta1, null);
  const box = i => ({ x: i * pw + 3, y: 3, w: (i < 2 ? pw : gw - 2 * pw) - 6, h: gh - 6, xr: [0, 90], xStep: 15, xLabel: 'θ₁ (°)', yr: [0, 90], yStep: 15 });
  const th2 = deg => { const s = n1 * Math.sin(deg * d2r) / n2; return s < 1 ? Math.asin(s) / d2r : NaN; };
  const th3 = deg => { const s = n1 * Math.sin(deg * d2r) / n3; return s < 1 && Number.isFinite(th2(deg)) ? Math.asin(s) / d2r : NaN; };
  const tc12 = n1 > n2 ? Math.asin(n2 / n1) / d2r : null, tc13 = n1 > n3 ? Math.asin(n3 / n1) / d2r : null;

  // 1: legge di Snell n₁·sin θ₁ = n₂·sin θ₂
  let f = Lab.axes(gctx, { ...box(0), title: 'Angolo di rifrazione θ₂ (°) — legge di Snell' });
  shadeFrom(f, tc12);
  Lab.plot(gctx, f, d => d, [0, 90], f.C.light ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.18)', 1, [3, 3]);
  Lab.plot(gctx, f, th2, [0, 90], '#00d4ff', 2);
  if (!ray.tir12) Lab.dot(gctx, f, params.theta1, ray.t2 / d2r, '#00d4ff', 4.5);
  Lab.legend(gctx, f.L + 8, f.T + 8, [['#00d4ff', 'θ₂'], [f.C.light ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)', 'θ₂ = θ₁ (nessuna deviazione)', [3, 3]]]);

  // 2: con il terzo mezzo, angolo nel mezzo 3; altrimenti n(λ) dei mezzi (dispersione)
  if (params.useN3) {
    f = Lab.axes(gctx, { ...box(1), title: 'Angolo nel terzo mezzo θ₃ (°)' });
    shadeFrom(f, tc12 != null && tc13 != null ? Math.min(tc12, tc13) : (tc12 ?? tc13));
    Lab.plot(gctx, f, th3, [0, 90], '#2ecc71', 2);
    if (!ray.tir12 && !ray.tir23) Lab.dot(gctx, f, params.theta1, ray.t3 / d2r, '#2ecc71', 4.5);
  } else {
    // solo i mezzi dispersivi (l'aria, costante, schiaccerebbe la scala); se nessuno lo è, la lastra
    let ms = [[params.preset1, params.n1c, MCOLORS[0]], [params.preset2, params.n2c, MCOLORS[1]]].filter(([pi]) => pi !== CUSTOM && MEDIA[pi].B > 0);
    if (!ms.length) ms = [[params.preset2, params.n2c, MCOLORS[1]]];
    const nOf = (pi, nc, lam) => pi === CUSTOM ? nc : cauchyN(MEDIA[pi], lam);
    let lo = Infinity, hi = -Infinity;
    for (const [pi, nc] of ms) for (let lam = 380; lam <= 700; lam += 10) { const v = nOf(pi, nc, lam); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const sp = Math.max(hi - lo, 0.02), ys = Lab.niceStep(sp * 1.4);
    f = Lab.axes(gctx, { x: pw + 3, y: 3, w: pw - 6, h: gh - 6, xr: [380, 700], xStep: 50, xLabel: 'λ (nm)', title: 'Indice di rifrazione n(λ) — dispersione',
      yr: [Math.floor((lo - sp * 0.2) / ys) * ys, Math.ceil((hi + sp * 0.2) / ys) * ys], yStep: ys, padL: 52 });
    for (const [pi, nc, col] of ms) Lab.plot(gctx, f, lam => nOf(pi, nc, lam), [380, 700], col, 2);
    Lab.legend(gctx, f.L + 8, f.T + 8, ms.map(([pi, , col]) => [col, MEDIA[pi].name]));
  }

  // 3: luce riflessa alla prima superficie (Fresnel): si annulla per p all'angolo di Brewster
  f = Lab.axes(gctx, { ...box(2), title: 'Luce riflessa R (%) — formule di Fresnel', yr: [0, 100], yStep: 25 });
  shadeFrom(f, tc12);
  Lab.plot(gctx, f, d => fresnel(n1, n2, d * d2r).Rs * 100, [0, 90], '#ff9d4d', 1.6);
  Lab.plot(gctx, f, d => fresnel(n1, n2, d * d2r).Rp * 100, [0, 90], '#b48cff', 1.6);
  Lab.plot(gctx, f, d => { const r = fresnel(n1, n2, d * d2r); return (r.Rs + r.Rp) * 50; }, [0, 90], f.C.title, 2);
  const r0 = fresnel(n1, n2, params.theta1 * d2r);
  Lab.dot(gctx, f, params.theta1, (r0.Rs + r0.Rp) * 50, f.C.title, 4.5);
  if (Math.abs(n1 - n2) > 1e-6) { const tb = Math.atan(n2 / n1) / d2r; if (tc12 == null || tb < tc12) {
    gctx.fillStyle = '#b48cff'; gctx.font = '9.5px "DM Sans",sans-serif'; gctx.textAlign = 'center'; gctx.textBaseline = 'middle';
    gctx.fillText(`Brewster ${Lab.fmt(tb, 1)}°`, Math.min(f.R - 40, Math.max(f.L + 40, f.X(tb))), f.Y(16)); Lab.dot(gctx, f, tb, 0, '#b48cff', 3.5); } }
  Lab.legend(gctx, f.L + 8, f.T + 8, [[f.C.title, 'luce naturale'], ['#ff9d4d', 's'], ['#b48cff', 'p']]);
}

/* ── Controls ────────────────────────────────────────────── */
function buildControls() {
  const el = document.getElementById('controls');
  el.innerHTML = '';

  /* ---- Fascio incidente ---- */
  const sec0 = Lab.Section('Fascio incidente');
  sec0.add(Lab.SliderInput({ label: 'Angolo di incidenza θ₁', min:0, max:89, step:0.5,
    value: params.theta1, unit: '°',
    hint: 'misurato dalla normale all\'interfaccia',
    onChange(v) { params.theta1 = v; requestRedraw(); },
  }));
  el.appendChild(sec0.el);

  /* ---- Mezzo 1 ---- */
  const sec1 = Lab.Section('Mezzo 1 (sopra)');
  const n1Sub = Lab.SubPanel();
  n1Sub.add(Lab.SliderInput({ label:'Indice n₁', min:1.0, max:3.5, step:0.001,
    value: params.n1c, unit:'',
    onChange(v) { params.n1c = v; requestRedraw(); },
  }));
  if (params.preset1 !== CUSTOM) n1Sub.hide();
  sec1.add(Lab.RadioGroup({ label:'Materiale', options: MEDIA.map((m,i) => ({ label: m.name, value: i })),
    value: params.preset1,
    onChange(v) {
      params.preset1 = v;
      if (v < CUSTOM) { params.n1c = MEDIA[v].n; n1Sub.hide(); } else n1Sub.show();
      requestRedraw();
    },
  }));
  sec1.add(n1Sub);
  el.appendChild(sec1.el);

  /* ---- Mezzo 2 ---- */
  const sec2 = Lab.Section('Mezzo 2 (lastra)');
  const n2Sub = Lab.SubPanel();
  n2Sub.add(Lab.SliderInput({ label:'Indice n₂', min:1.0, max:3.5, step:0.001,
    value: params.n2c, unit:'',
    onChange(v) { params.n2c = v; requestRedraw(); },
  }));
  if (params.preset2 !== CUSTOM) n2Sub.hide();
  sec2.add(Lab.RadioGroup({ label:'Materiale', options: MEDIA.map((m,i) => ({ label: m.name, value: i })),
    value: params.preset2,
    onChange(v) {
      params.preset2 = v;
      if (v < CUSTOM) { params.n2c = MEDIA[v].n; n2Sub.hide(); } else n2Sub.show();
      requestRedraw();
    },
  }));
  sec2.add(n2Sub);
  sec2.add(Lab.SliderInput({ label:'Spessore lastra', min:0.5, max:10, step:0.1,
    value: params.d2, unit:' cm',
    onChange(v) { params.d2 = v; requestRedraw(); },
  }));
  el.appendChild(sec2.el);

  /* ---- Terzo mezzo ---- */
  const sec3 = Lab.Section('Terzo mezzo');
  const n3Panel = Lab.SubPanel();
  if (!params.useN3) n3Panel.hide();

  const n3Sub = Lab.SubPanel();
  n3Sub.add(Lab.SliderInput({ label:'Indice n₃', min:1.0, max:3.5, step:0.001,
    value: params.n3c, unit:'',
    onChange(v) { params.n3c = v; requestRedraw(); },
  }));
  if (params.preset3 !== CUSTOM) n3Sub.hide();

  n3Panel.add(Lab.RadioGroup({ label:'Materiale', options: MEDIA.map((m,i) => ({ label: m.name, value: i })),
    value: params.preset3,
    onChange(v) {
      params.preset3 = v;
      if (v < CUSTOM) { params.n3c = MEDIA[v].n; n3Sub.hide(); } else n3Sub.show();
      requestRedraw();
    },
  }));
  n3Panel.add(n3Sub);

  sec3.add(Lab.Toggle({ label:'Aggiungi terzo mezzo', value: params.useN3,
    onChange(v) { params.useN3 = v; v ? n3Panel.show() : n3Panel.hide(); requestRedraw(); },
  }));
  sec3.add(n3Panel);
  el.appendChild(sec3.el);

  /* ---- Visualizzazione ---- */
  const secV = Lab.Section('Visualizzazione');
  secV.add(Lab.Toggle({ label:'Dispersione cromatica', value: params.dispersion,
    onChange(v) { params.dispersion = v; requestRedraw(); },
  }));
  const hint = document.createElement('div');
  hint.className = 'ctrl-hint'; hint.style.padding = '2px 12px 8px';
  hint.textContent = 'Legge di Cauchy n(λ): mostra la separazione spettrale del fascio';
  secV.el.appendChild(hint);
  el.appendChild(secV.el);
}

/* ── Redraw ──────────────────────────────────────────────── */
let _pending = false;
function requestRedraw() {
  if (!_pending) {
    _pending = true;
    requestAnimationFrame(() => { _pending = false; drawScene(); drawGraphs(); });
  }
}

/* ── Resize handle ───────────────────────────────────────── */
function initResizeHandle() {
  const handle = document.getElementById('resizeHandle');
  let drag = false, startY = 0, startH = 0;
  handle.addEventListener('mousedown', e => {
    drag = true; startY = e.clientY; startH = graphArea.offsetHeight;
    document.body.style.userSelect = 'none';
  });
  document.addEventListener('mousemove', e => {
    if (!drag) return;
    graphArea.style.height = Math.max(80, Math.min(500, startH + (startY - e.clientY))) + 'px';
    resizeCanvases(); requestRedraw();
  });
  document.addEventListener('mouseup', () => { if (drag) { drag = false; document.body.style.userSelect = ''; } });
}

/* ── Fullscreen ──────────────────────────────────────────── */
function initFullscreen() {
  document.getElementById('btnFullscreen').addEventListener('click', () => {
    !document.fullscreenElement
      ? (graphArea.requestFullscreen?.() ?? graphArea.webkitRequestFullscreen?.())
      : (document.exitFullscreen?.() ?? document.webkitExitFullscreen?.());
  });
  document.addEventListener('fullscreenchange', () => { resizeCanvases(); requestRedraw(); });
}

/* ── Theme observer ──────────────────────────────────────── */
new MutationObserver(() => requestRedraw())
  .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

/* ── Init ────────────────────────────────────────────────── */
function init() {
  Lab.initTheme();
  buildControls();
  graphArea.style.height = (window.innerWidth < 800 ? 130 : 240) + 'px';
  resizeCanvases();
  requestRedraw();

  new ResizeObserver(() => { resizeCanvases(); requestRedraw(); }).observe(canvas.parentElement);
  initResizeHandle();
  initFullscreen();

  document.getElementById('btnReset').addEventListener('click', () => {
    params.theta1 = 45;
    params.preset1 = 0;  params.n1c = 1.000;
    params.preset2 = 2;  params.n2c = 1.520;
    params.preset3 = 0;  params.n3c = 1.000;
    params.d2 = 3; params.useN3 = false; params.dispersion = false;
    buildControls();
    requestRedraw();
  });
}

init();
