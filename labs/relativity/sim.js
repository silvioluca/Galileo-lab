'use strict';

const P  = { beta: 0.60 };
const L0 = 4.0;

const canvas    = document.getElementById('simCanvas');
const ctx       = canvas.getContext('2d');
const gCanvas   = document.getElementById('graphCanvas');
const gctx      = gCanvas.getContext('2d');
const graphArea = document.getElementById('graphArea');
const readoutEl = document.getElementById('readout');

let SW, SH, GW, GH, DPR;

function resize() {
  DPR = window.devicePixelRatio || 1;
  const area = canvas.parentElement;
  const gaH  = graphArea.offsetHeight;
  const rdH  = readoutEl.offsetHeight || 0;
  SW = area.clientWidth;  SH = area.clientHeight - gaH - rdH;
  canvas.width  = SW * DPR;  canvas.height  = SH * DPR;
  canvas.style.width  = SW + 'px';  canvas.style.height = SH + 'px';
  GW = graphArea.clientWidth;  GH = graphArea.clientHeight;
  gCanvas.width  = GW * DPR;  gCanvas.height  = GH * DPR;
  gCanvas.style.width  = GW + 'px';  gCanvas.style.height = GH + 'px';
}

function gam(b) { return 1 / Math.sqrt(Math.max(1e-15, 1 - b * b)); }

let running = true, tau = 0, lastTS = null;
const TAU_RATE = 0.35;

function resetSim() { tau = 0; lastTS = null; }
function setRunning(v) {
  running = v;
  document.getElementById('btnPlay').textContent = v ? '⏸  PAUSA' : '▶  RIPRENDI';
}

function getCSSVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function getColors() {
  const light = document.documentElement.dataset.theme === 'light';
  return {
    bg:    getCSSVar('--bg1') || (light ? '#f0f2f5' : '#060a10'),
    bg2:   getCSSVar('--bg2') || (light ? '#ffffff' : '#0b1018'),
    grid:  light ? 'rgba(0,0,0,0.06)'  : 'rgba(255,255,255,0.04)',
    text:  getCSSVar('--text-primary')   || (light ? '#0d1a26' : '#ddeeff'),
    muted: getCSSVar('--text-secondary') || (light ? '#4a6278' : '#6b8099'),
    accent:getCSSVar('--accent')         || (light ? '#0099cc' : '#00d4ff'),
    spCol: light ? '#c04800' : '#ffa030',
    light,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function rndPath(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x+r,y); c.lineTo(x+w-r,y); c.quadraticCurveTo(x+w,y,x+w,y+r);
  c.lineTo(x+w,y+h-r); c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  c.lineTo(x+r,y+h);   c.quadraticCurveTo(x,y+h,x,y+h-r);
  c.lineTo(x,y+r);     c.quadraticCurveTo(x,y,x+r,y);
  c.closePath();
}

function drawClock(c, cx, cy, r, t, color, C, cap) {
  c.beginPath(); c.arc(cx,cy,r,0,Math.PI*2);
  c.fillStyle = C.light ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'; c.fill();
  c.beginPath(); c.arc(cx,cy,r,0,Math.PI*2);
  c.strokeStyle = color; c.lineWidth = 2.5; c.stroke();
  for (let i=0; i<12; i++) {
    const a = i/12*Math.PI*2 - Math.PI/2, maj = i%3===0;
    c.beginPath();
    c.moveTo(cx+Math.cos(a)*r*(maj?0.77:0.87), cy+Math.sin(a)*r*(maj?0.77:0.87));
    c.lineTo(cx+Math.cos(a)*r*0.95,            cy+Math.sin(a)*r*0.95);
    c.strokeStyle = color; c.lineWidth = maj?2:1; c.stroke();
  }
  const a = (t%1)*Math.PI*2 - Math.PI/2;
  c.beginPath(); c.moveTo(cx,cy);
  c.lineTo(cx+Math.cos(a)*r*0.68, cy+Math.sin(a)*r*0.68);
  c.strokeStyle = color; c.lineWidth = 2.5; c.lineCap = 'round'; c.stroke(); c.lineCap = 'butt';
  c.beginPath(); c.arc(cx,cy,4,0,Math.PI*2); c.fillStyle = color; c.fill();
  c.fillStyle = color; c.font = 'bold 10px Space Mono, monospace';
  c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(cap, cx, cy+r+7);
}

// ── MAIN CANVAS ───────────────────────────────────────────────────────────────
const TH = 36;
function pxpu(pw) { return (pw - 60) / (L0 * 2.8); }

function drawMain(C) {
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.fillStyle = C.bg; ctx.fillRect(0,0,SW,SH);
  const b = P.beta, g = gam(b), hw = SW/2;
  ctx.strokeStyle = C.light ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(hw,0); ctx.lineTo(hw,SH); ctx.stroke();
  drawSPanel(C,0,hw,b,g);
  drawSpPanel(C,hw,hw,b,g);
}


// ── S panel: moving ship (contracted) + two clocks ───────────────────────────
function drawSPanel(C, x0, pw, b, g) {
  const sc    = pxpu(pw), cx = x0 + pw/2;
  const shipY = TH + (SH - TH) * 0.28;
  const L     = L0 / g, bodyW = L * sc;

  ctx.fillStyle = C.light ? 'rgba(0,153,204,0.06)' : 'rgba(0,212,255,0.05)';
  ctx.fillRect(x0, 0, pw, TH);
  ctx.fillStyle = C.accent; ctx.font = '700 11px Space Mono, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('S  —  osservatore a riposo', cx, TH/2);

  ctx.fillStyle = C.muted; ctx.font = '9px Space Mono, monospace';
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillText('v = '+Lab.fmt(b,3)+'c  →', x0+pw-10, TH+14);

  for (let k=-6; k<=6; k++) {
    const sx = cx + k*sc;
    if (sx < x0+4 || sx > x0+pw-4) continue;
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx, TH+4); ctx.lineTo(sx, shipY+30); ctx.stroke();
  }

  const shipCx = x0 + (pw/2 + (b*g*tau*sc)) % pw;
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, TH, pw, SH-TH); ctx.clip();
  for (let w=-1; w<=1; w++) {
    const rx = shipCx + w*pw;
    rndPath(ctx, rx-bodyW/2, shipY-8, bodyW, 16, 3);
    ctx.fillStyle = C.light ? 'rgba(0,120,200,0.18)' : 'rgba(0,212,255,0.15)'; ctx.fill();
    ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rx-bodyW/2,shipY-14); ctx.lineTo(rx-bodyW/2,shipY-10);
    ctx.moveTo(rx-bodyW/2,shipY-12); ctx.lineTo(rx+bodyW/2,shipY-12);
    ctx.moveTo(rx+bodyW/2,shipY-14); ctx.lineTo(rx+bodyW/2,shipY-10);
    ctx.stroke();
    ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rx-20,shipY+14); ctx.lineTo(rx+20,shipY+14);
    ctx.moveTo(rx+13,shipY+9); ctx.lineTo(rx+20,shipY+14); ctx.lineTo(rx+13,shipY+19);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = C.accent; ctx.font = '10px Space Mono, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('L = L₀/γ = '+Lab.fmt(L0/g,3)+' m', cx, shipY+26);

  // Clocks: gray = S proper time (reference), cyan = ship clock (dilated slow)
  const cTop = shipY + 46, cH = SH - cTop - 12;
  const cR   = Math.min(cH * 0.36, pw * 0.17, 50);
  const cY   = cTop + cH * 0.44;
  const cx1  = x0 + pw * 0.27, cx2 = x0 + pw * 0.73;

  ctx.strokeStyle = C.light ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1; ctx.setLineDash([4,4]);
  ctx.beginPath(); ctx.moveTo(cx, cTop); ctx.lineTo(cx, SH-8); ctx.stroke();
  ctx.setLineDash([]);

  drawClock(ctx, cx1, cY, cR, tau,   C.muted,  C, 't = '+Lab.fmt(tau,2));
  ctx.fillStyle = C.muted; ctx.font = '8px Space Mono, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('tempo proprio S', cx1, cY+cR+18);

  drawClock(ctx, cx2, cY, cR, tau/g, C.accent, C, 'τ = '+Lab.fmt((tau/g),2));
  ctx.fillStyle = C.accent; ctx.font = 'bold 8px Space Mono, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText("tempo improprio S'", cx2, cY+cR+18);
}

// ── S' panel: ship at rest (proper length) + two clocks ──────────────────────
function drawSpPanel(C, x0, pw, b, g) {
  const sc    = pxpu(pw), cx = x0 + pw/2, col = C.spCol;
  const shipY = TH + (SH - TH) * 0.28;
  const bodyW = L0 * sc;

  ctx.fillStyle = C.light ? 'rgba(180,70,0,0.06)' : 'rgba(255,140,30,0.05)';
  ctx.fillRect(x0, 0, pw, TH);
  ctx.fillStyle = col; ctx.font = '700 11px Space Mono, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText("S'  —  bordo della navicella", cx, TH/2);

  ctx.fillStyle = C.muted; ctx.font = '9px Space Mono, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText("v = 0  in S'", cx, TH+14);

  for (let k=-6; k<=6; k++) {
    const sx = cx + k*sc;
    if (sx < x0+4 || sx > x0+pw-4) continue;
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx, TH+22); ctx.lineTo(sx, shipY+30); ctx.stroke();
  }

  rndPath(ctx, cx-bodyW/2, shipY-8, bodyW, 16, 3);
  ctx.fillStyle = C.light ? 'rgba(180,70,0,0.18)' : 'rgba(255,140,30,0.15)'; ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx-bodyW/2,shipY-14); ctx.lineTo(cx-bodyW/2,shipY-10);
  ctx.moveTo(cx-bodyW/2,shipY-12); ctx.lineTo(cx+bodyW/2,shipY-12);
  ctx.moveTo(cx+bodyW/2,shipY-14); ctx.lineTo(cx+bodyW/2,shipY-10);
  ctx.stroke();

  ctx.fillStyle = col; ctx.font = '10px Space Mono, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('L₀ = '+Lab.fmt(L0,1)+' m  (lunghezza propria)', cx, shipY+26);

  // Clocks: orange = S' proper time (reference), gray = S clock as seen from S' (dilated)
  const cTop = shipY + 46, cH = SH - cTop - 12;
  const cR   = Math.min(cH * 0.36, pw * 0.17, 50);
  const cY   = cTop + cH * 0.44;
  const cx1  = x0 + pw * 0.27, cx2 = x0 + pw * 0.73;

  ctx.strokeStyle = C.light ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1; ctx.setLineDash([4,4]);
  ctx.beginPath(); ctx.moveTo(cx, cTop); ctx.lineTo(cx, SH-8); ctx.stroke();
  ctx.setLineDash([]);

  drawClock(ctx, cx1, cY, cR, tau, col, C, "τ = "+Lab.fmt(tau,2));
  ctx.fillStyle = col; ctx.font = '8px Space Mono, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText("tempo proprio S'", cx1, cY+cR+18);

  // S clock as seen from S': appears dilated (slow) by factor 1/γ
  drawClock(ctx, cx2, cY, cR, tau/g, C.muted, C, 't = '+Lab.fmt((tau/g),2));
  ctx.fillStyle = C.muted; ctx.font = 'bold 8px Space Mono, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('tempo improprio S', cx2, cY+cR+18);
}

// ── GRAPH: three panels ───────────────────────────────────────────────────────
function drawGraph(C) {
  gctx.setTransform(DPR,0,0,DPR,0,0);
  gctx.fillStyle = C.bg; gctx.fillRect(0,0,GW,GH);
  const w3 = GW/3;
  drawMink(C, 0, w3);
  drawGammaCurve(C, w3, w3);
  drawEffects(C, 2*w3, w3);
  gctx.strokeStyle = C.light ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.07)';
  gctx.lineWidth = 1;
  [w3, 2*w3].forEach(x => { gctx.beginPath(); gctx.moveTo(x,0); gctx.lineTo(x,GH); gctx.stroke(); });
}

// Panel 1 — Minkowski
function drawMink(C, ox, ow) {
  const sg_m = Math.min(GH, ow) / 6.5;
  const orig_x = ox + ow/2, orig_y = GH*0.60;
  const b = P.beta, g = gam(b);

  function mx(x)   { return orig_x + x*sg_m; }
  function mct(ct) { return orig_y - ct*sg_m; }

  function mline(x0, ct0, dx, dct, col, lw, dash) {
    const xH  =  (ow/2)/sg_m + 1;
    const ctT =  orig_y/sg_m + 1;
    const ctB = -(GH - orig_y)/sg_m - 1;
    let tA = -1e9, tB = 1e9;
    if (Math.abs(dx) > 1e-12) {
      const t1 = (-xH-x0)/dx, t2 = (xH-x0)/dx;
      tA = Math.max(tA,Math.min(t1,t2)); tB = Math.min(tB,Math.max(t1,t2));
    } else if (Math.abs(x0) > xH) return;
    if (Math.abs(dct) > 1e-12) {
      const t1 = (ctB-ct0)/dct, t2 = (ctT-ct0)/dct;
      tA = Math.max(tA,Math.min(t1,t2)); tB = Math.min(tB,Math.max(t1,t2));
    } else if (ct0 < ctB || ct0 > ctT) return;
    if (tA >= tB) return;
    if (dash) gctx.setLineDash(dash);
    gctx.beginPath();
    gctx.moveTo(mx(x0+tA*dx), mct(ct0+tA*dct));
    gctx.lineTo(mx(x0+tB*dx), mct(ct0+tB*dct));
    gctx.strokeStyle = col; gctx.lineWidth = lw; gctx.stroke();
    if (dash) gctx.setLineDash([]);
  }

  gctx.save();
  gctx.beginPath(); gctx.rect(ox,0,ow,GH); gctx.clip();

  const BIG = Math.max(ow,GH)/sg_m + 4;
  // future cone
  gctx.beginPath();
  gctx.moveTo(mx(0),mct(0)); gctx.lineTo(mx(BIG),mct(BIG));
  gctx.lineTo(mx(BIG),mct(BIG*3)); gctx.lineTo(mx(-BIG),mct(BIG*3)); gctx.lineTo(mx(-BIG),mct(BIG));
  gctx.closePath();
  gctx.fillStyle = C.light?'rgba(0,120,200,0.08)':'rgba(0,212,255,0.09)'; gctx.fill();
  // past cone
  gctx.beginPath();
  gctx.moveTo(mx(0),mct(0)); gctx.lineTo(mx(BIG),mct(-BIG));
  gctx.lineTo(mx(BIG),mct(-BIG*3)); gctx.lineTo(mx(-BIG),mct(-BIG*3)); gctx.lineTo(mx(-BIG),mct(-BIG));
  gctx.closePath();
  gctx.fillStyle = C.light?'rgba(160,70,0,0.07)':'rgba(255,130,0,0.08)'; gctx.fill();

  // S grid
  const gN = Math.ceil(Math.max(ow,GH)/(2*sg_m)) + 2;
  for (let k=-gN; k<=gN; k++) {
    if (k===0) continue;
    mline(k,0,0,1,C.grid,0.4,null);
    mline(0,k,1,0,C.grid,0.4,null);
  }
  // S' grid
  const spGrid = C.light?'rgba(180,60,0,0.09)':'rgba(255,130,30,0.09)';
  for (let k=-gN; k<=gN; k++) {
    if (k===0) continue;
    mline(k/g,0,b,1,spGrid,0.5,null);
    mline(0,k/g,1,b,spGrid,0.5,null);
  }

  // Light cone
  const lcCol = C.light?'rgba(0,120,200,0.50)':'rgba(0,212,255,0.50)';
  mline(0,0, 1, 1,lcCol,1.3,[4,3]); mline(0,0,-1, 1,lcCol,1.3,[4,3]);
  mline(0,0, 1,-1,lcCol,1.3,[4,3]); mline(0,0,-1,-1,lcCol,1.3,[4,3]);

  // S axes
  const axCol = C.light?'rgba(0,0,0,0.28)':'rgba(255,255,255,0.28)';
  mline(0,0,0,1,axCol,1.6,null); mline(0,0,1,0,axCol,1.6,null);
  // S' axes
  const spAx = C.light?'rgba(180,60,0,0.88)':'rgba(255,145,30,0.90)';
  mline(0,0,b,1,spAx,2.2,null); mline(0,0,1,b,spAx,2.2,null);

  // Animated dots — tau is S coordinate time t
  const ctMax = orig_y/sg_m;
  const t_w   = tau % ctMax;          // S coordinate time (wraps to stay in diagram)
  const dotX  = b * t_w;              // S' x position (moves at velocity β)
  const dotCt = t_w;                  // ct axis: same for both (simultaneity at t_w)
  mline(dotX, dotCt, 1, b, C.light?'rgba(180,60,0,0.22)':'rgba(255,145,30,0.22)', 1.2, [3,5]);

  if (t_w <= ctMax) {
    gctx.beginPath(); gctx.arc(mx(0),mct(t_w),4.5,0,Math.PI*2);
    gctx.fillStyle = C.accent; gctx.fill();
    gctx.fillStyle = C.accent; gctx.font = 'bold 9px Space Mono, monospace';
    gctx.textAlign = 'right'; gctx.textBaseline = 'middle';
    gctx.fillText('S', mx(0)-7, mct(t_w));
  }
  if (dotCt <= ctMax) {
    gctx.beginPath(); gctx.arc(mx(dotX),mct(dotCt),4.5,0,Math.PI*2);
    gctx.fillStyle = C.spCol; gctx.fill();
    gctx.fillStyle = C.spCol; gctx.font = "bold 9px Space Mono, monospace";
    gctx.textAlign = 'left'; gctx.textBaseline = 'middle';
    gctx.fillText("S'", mx(dotX)+7, mct(dotCt));
  }

  // Labels
  gctx.fillStyle = axCol; gctx.font = 'italic 700 10px DM Sans, monospace';
  gctx.textAlign = 'center'; gctx.textBaseline = 'top';
  gctx.fillText('ct', mx(0.2), mct(ctMax)+2);
  gctx.textAlign = 'left'; gctx.textBaseline = 'middle';
  gctx.fillText('x', mx(ow/(2*sg_m))-12, mct(0)-8);
  gctx.fillStyle = spAx;
  gctx.fillText("ct'", mx(b*ctMax)+3, mct(ctMax)+2);

  gctx.fillStyle = C.muted; gctx.font = '700 8px Space Mono, monospace';
  gctx.textAlign = 'center'; gctx.textBaseline = 'top';
  gctx.fillText('MINKOWSKI', orig_x, 3);
  gctx.restore();
}

// Panel 2 — γ(β)
function drawGammaCurve(C, ox, ow) {
  const PAD = {t:22, b:22, l:34, r:8};
  const iw = ow-PAD.l-PAD.r, ih = GH-PAD.t-PAD.b;
  const ax = ox+PAD.l, ay = PAD.t+ih;
  const G_MAX = 10;
  const bCur = P.beta, gCur = gam(bCur);

  function bx(bv) { return ax + (bv/0.999)*iw; }
  function gy(gv) { return ay - Math.min(gv/G_MAX, 1)*ih; }

  gctx.save();
  gctx.beginPath(); gctx.rect(ox,0,ow,GH); gctx.clip();

  gctx.fillStyle = C.muted; gctx.font = '700 8px Space Mono, monospace';
  gctx.textAlign = 'center'; gctx.textBaseline = 'top';
  gctx.fillText('γ (β)', ox+ow/2, 3);

  // Axes
  gctx.strokeStyle = C.muted; gctx.lineWidth = 1;
  gctx.beginPath(); gctx.moveTo(ax,PAD.t); gctx.lineTo(ax,ay); gctx.lineTo(ax+iw,ay); gctx.stroke();

  // γ grid
  [1,2,3,5,7,10].forEach(gv => {
    const y = gy(gv);
    gctx.setLineDash([3,3]); gctx.strokeStyle = C.grid; gctx.lineWidth = 0.7;
    gctx.beginPath(); gctx.moveTo(ax,y); gctx.lineTo(ax+iw,y); gctx.stroke();
    gctx.setLineDash([]);
    gctx.fillStyle = C.muted; gctx.font = '8px Space Mono, monospace';
    gctx.textAlign = 'right'; gctx.textBaseline = 'middle';
    gctx.fillText(gv, ax-3, y);
  });

  // β ticks
  [0, 0.2, 0.4, 0.6, 0.8].forEach(bv => {
    const x = bx(bv);
    gctx.strokeStyle = C.muted; gctx.lineWidth = 1;
    gctx.beginPath(); gctx.moveTo(x,ay); gctx.lineTo(x,ay+4); gctx.stroke();
    gctx.fillStyle = C.muted; gctx.font = '7px Space Mono, monospace';
    gctx.textAlign = 'center'; gctx.textBaseline = 'top';
    gctx.fillText(Lab.fmt(bv,1), x, ay+5);
  });

  // Curve
  gctx.beginPath();
  for (let i=0; i<=200; i++) {
    const bv = (i/200)*0.999;
    i===0 ? gctx.moveTo(bx(bv), gy(gam(bv))) : gctx.lineTo(bx(bv), gy(gam(bv)));
  }
  gctx.strokeStyle = C.accent; gctx.lineWidth = 2; gctx.stroke();

  // Current marker
  const cx = bx(bCur), cy = gy(gCur);
  gctx.setLineDash([3,3]);
  gctx.strokeStyle = C.light?'rgba(0,0,0,0.15)':'rgba(255,255,255,0.15)';
  gctx.lineWidth = 1;
  gctx.beginPath(); gctx.moveTo(cx,ay); gctx.lineTo(cx,cy); gctx.stroke();
  gctx.setLineDash([]);
  gctx.beginPath(); gctx.arc(cx,cy,5,0,Math.PI*2);
  gctx.fillStyle = C.accent; gctx.fill();
  gctx.strokeStyle = C.bg; gctx.lineWidth = 1.5; gctx.stroke();

  gctx.fillStyle = C.accent; gctx.font = 'bold 9px Space Mono, monospace';
  gctx.textAlign = cx > ax+iw*0.6 ? 'right' : 'left';
  gctx.textBaseline = 'bottom';
  gctx.fillText('γ='+Lab.fmt(gCur,2), cx+(cx>ax+iw*0.6?-7:7), cy-4);

  gctx.fillStyle = C.muted; gctx.font = 'italic 9px DM Sans, monospace';
  gctx.textAlign = 'center'; gctx.textBaseline = 'top';
  gctx.fillText('β', ax+iw/2, ay+13);
  gctx.restore();
}

// Panel 3 — L/L₀ and τ/t vs β
function drawEffects(C, ox, ow) {
  const PAD = {t:22, b:22, l:30, r:8};
  const iw = ow-PAD.l-PAD.r, ih = GH-PAD.t-PAD.b;
  const ax = ox+PAD.l, ay = PAD.t+ih;
  const bCur = P.beta, gCur = gam(bCur);

  function bx(bv) { return ax + (bv/0.999)*iw; }
  function ry(r)  { return PAD.t + ih*(1 - Math.max(0, Math.min(r, 1))); }

  gctx.save();
  gctx.beginPath(); gctx.rect(ox,0,ow,GH); gctx.clip();

  gctx.fillStyle = C.muted; gctx.font = '700 8px Space Mono, monospace';
  gctx.textAlign = 'center'; gctx.textBaseline = 'top';
  gctx.fillText('L/L₀  ∙  τ/t', ox+ow/2, 3);

  // Axes
  gctx.strokeStyle = C.muted; gctx.lineWidth = 1;
  gctx.beginPath(); gctx.moveTo(ax,PAD.t); gctx.lineTo(ax,ay); gctx.lineTo(ax+iw,ay); gctx.stroke();

  // Grid
  [0.25, 0.5, 0.75, 1.0].forEach(v => {
    const y = ry(v);
    gctx.setLineDash([3,3]); gctx.strokeStyle = C.grid; gctx.lineWidth = 0.7;
    gctx.beginPath(); gctx.moveTo(ax,y); gctx.lineTo(ax+iw,y); gctx.stroke();
    gctx.setLineDash([]);
    gctx.fillStyle = C.muted; gctx.font = '8px Space Mono, monospace';
    gctx.textAlign = 'right'; gctx.textBaseline = 'middle';
    gctx.fillText(Lab.fmt(v,2), ax-3, y);
  });

  // β ticks
  [0, 0.2, 0.4, 0.6, 0.8].forEach(bv => {
    const x = bx(bv);
    gctx.strokeStyle = C.muted; gctx.lineWidth = 1;
    gctx.beginPath(); gctx.moveTo(x,ay); gctx.lineTo(x,ay+4); gctx.stroke();
    gctx.fillStyle = C.muted; gctx.font = '7px Space Mono, monospace';
    gctx.textAlign = 'center'; gctx.textBaseline = 'top';
    gctx.fillText(Lab.fmt(bv,1), x, ay+5);
  });

  // L/L₀ = 1/γ — solid accent
  gctx.beginPath();
  for (let i=0; i<=200; i++) {
    const bv = (i/200)*0.999, v = 1/gam(bv);
    i===0 ? gctx.moveTo(bx(bv),ry(v)) : gctx.lineTo(bx(bv),ry(v));
  }
  gctx.strokeStyle = C.accent; gctx.lineWidth = 2; gctx.stroke();

  // τ/t = 1/γ — dashed spCol (same curve, distinct label)
  gctx.setLineDash([5,4]);
  gctx.beginPath();
  for (let i=0; i<=200; i++) {
    const bv = (i/200)*0.999, v = 1/gam(bv);
    i===0 ? gctx.moveTo(bx(bv),ry(v)) : gctx.lineTo(bx(bv),ry(v));
  }
  gctx.strokeStyle = C.spCol; gctx.lineWidth = 2; gctx.stroke();
  gctx.setLineDash([]);

  // Current marker
  const val = 1/gCur;
  const cx = bx(bCur), cy = ry(val);
  gctx.setLineDash([3,3]);
  gctx.strokeStyle = C.light?'rgba(0,0,0,0.15)':'rgba(255,255,255,0.15)';
  gctx.lineWidth = 1;
  gctx.beginPath(); gctx.moveTo(cx,ay); gctx.lineTo(cx,cy); gctx.stroke();
  gctx.setLineDash([]);
  gctx.beginPath(); gctx.arc(cx,cy,5,0,Math.PI*2);
  gctx.fillStyle = C.accent; gctx.fill();
  gctx.strokeStyle = C.bg; gctx.lineWidth = 1.5; gctx.stroke();

  gctx.fillStyle = C.accent; gctx.font = 'bold 9px Space Mono, monospace';
  gctx.textAlign = cx > ax+iw*0.6 ? 'right' : 'left';
  gctx.textBaseline = 'top';
  gctx.fillText(Lab.fmt(val,3), cx+(cx>ax+iw*0.6?-7:7), cy+4);

  // Legend
  const lx = ax+4, ly = PAD.t+10;
  gctx.strokeStyle = C.accent; gctx.lineWidth = 2; gctx.setLineDash([]);
  gctx.beginPath(); gctx.moveTo(lx,ly); gctx.lineTo(lx+12,ly); gctx.stroke();
  gctx.fillStyle = C.accent; gctx.font = '8px Space Mono, monospace';
  gctx.textAlign = 'left'; gctx.textBaseline = 'middle';
  gctx.fillText('L/L₀', lx+15, ly);

  gctx.setLineDash([5,4]); gctx.strokeStyle = C.spCol; gctx.lineWidth = 2;
  gctx.beginPath(); gctx.moveTo(lx,ly+13); gctx.lineTo(lx+12,ly+13); gctx.stroke();
  gctx.setLineDash([]);
  gctx.fillStyle = C.spCol; gctx.fillText('τ/t', lx+15, ly+13);

  gctx.fillStyle = C.muted; gctx.font = 'italic 9px DM Sans, monospace';
  gctx.textAlign = 'center'; gctx.textBaseline = 'top';
  gctx.fillText('β', ax+iw/2, ay+13);
  gctx.restore();
}

// ── Readout ───────────────────────────────────────────────────────────────────
const readout = new Lab.Readout(readoutEl, [
  { key: 'beta',  label: 'β = v/c' },
  { key: 'gamma', label: 'fattore di Lorentz γ' },
  { key: 'L',     label: 'lunghezza misurata L' },
  { key: 'E',     label: 'energia totale E' },
  { key: 'Ek',    label: 'energia cinetica' },
  { key: 'p',     label: 'quantità di moto p' },
]);

function buildControls() {
  const cont = document.getElementById('controls');
  cont.innerHTML = '';
  const sec = Lab.Section('Cinematica relativistica');
  sec.add(Lab.Slider({
    label: 'Velocità β = v/c', unit: '', min: 0, max: 0.999, step: 0.001, value: P.beta,
    onChange(v) { P.beta = v; }
  }));
  cont.appendChild(sec.el);
}

function loop(ts) {
  requestAnimationFrame(loop);
  const dt = lastTS === null ? 0 : Math.min((ts - lastTS) / 1000, 0.05);
  lastTS = ts;
  if (running && dt > 0) tau += TAU_RATE * dt;
  const b = P.beta, g = gam(b);
  readout.set('beta',  Lab.fmt(b,4));
  readout.set('gamma', Lab.fmt(g,4));
  readout.set('L',     Lab.fmt(L0/g,3)+' m');
  readout.set('E',     Lab.fmt(g,4)+' mc²');
  readout.set('Ek',    Lab.fmt((g-1),4)+' mc²');
  readout.set('p',     Lab.fmt((g*b),4)+' mc');
  const C = getColors();
  drawMain(C);
  drawGraph(C);
}

Lab.initTheme('themeToggle');
resetSim();
resize();
buildControls();
new ResizeObserver(resize).observe(canvas.parentElement);
document.getElementById('btnPlay').addEventListener('click', () => setRunning(!running));
document.getElementById('btnReset').addEventListener('click', resetSim);
requestAnimationFrame(loop);
