'use strict';

/* ── Lunghezze d'onda per luce bianca ────────────────────── */
const WAVES_WHITE = [400, 440, 480, 510, 550, 590, 630, 670];

/* ── Stato ───────────────────────────────────────────────── */
const params = {
  aperture:  'single_linear',
  lightType: 'mono',
  lambda:    550,
  slitW:     0.10,
  slitD:     0.30,
  numSlits:  8,
  screenL:   500,
  tilt:      0,
};

/* ── Canvas ──────────────────────────────────────────────── */
const canvas      = document.getElementById('simCanvas');
const ctx         = canvas.getContext('2d');
const graphCanvas = document.getElementById('graphCanvas');
const gctx        = graphCanvas.getContext('2d');
const graphArea   = document.getElementById('graphArea');
const readoutEl   = document.getElementById('readout');
let cw=0, ch=0, gw=0, gh=0;

function resizeCanvases() {
  const dpr    = window.devicePixelRatio || 1;
  const parent = canvas.parentElement;
  const graphH = graphArea.offsetHeight;
  const hH     = document.getElementById('resizeHandle').offsetHeight;
  const rH     = readoutEl.offsetHeight;
  cw = parent.clientWidth;
  ch = Math.max(100, parent.clientHeight - graphH - rH - hH);
  canvas.width  = cw*dpr; canvas.height = ch*dpr;
  canvas.style.width  = cw+'px'; canvas.style.height = ch+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  gw = graphArea.clientWidth; gh = graphArea.clientHeight;
  graphCanvas.width  = gw*dpr; graphCanvas.height = gh*dpr;
  graphCanvas.style.width  = gw+'px'; graphCanvas.style.height = gh+'px';
  gctx.setTransform(dpr,0,0,dpr,0,0);
}

/* ── Fisica ──────────────────────────────────────────────── */
function sinc(x) { return Math.abs(x) < 1e-9 ? 1 : Math.sin(x)/x; }

/* J₁(x): Abramowitz & Stegun */
function j1(x) {
  const ax = Math.abs(x);
  if (ax < 3.75) {
    const t = (x/3.75)**2;
    return x*(0.5+t*(-0.0562499985+t*(0.0187499720+t*(-0.0020833666+t*(0.0002629895+t*(-0.0000401137+t*0.0000039374))))));
  }
  const z = 3.75/ax, y = z*z;
  const amp = (0.79788456+y*(-7.7e-7+y*(-0.01672534+y*(0.00239399+y*(-0.00366469+y*(0.00420059+y*(-0.00421741+y*0.00163801))))))) / Math.sqrt(ax);
  const pha = ax - 2.356194491 + z*(0.12499612+z*(5.65e-5+z*(-0.00637879+z*(0.00074348+z*(0.00079824+z*(-0.00029166+z*0.00011622))))));
  return amp * Math.cos(pha) * (x < 0 ? -1 : 1);
}

function airy(x) { return Math.abs(x) < 1e-9 ? 1 : 2*j1(x)/x; }

function wavToRGB(lam) {
  let r=0, g=0, b=0;
  if      (lam < 380) { r=0.5; b=0.5; }
  else if (lam < 440) { r=(440-lam)/60; b=1; }
  else if (lam < 490) { g=(lam-440)/50; b=1; }
  else if (lam < 510) { g=1; b=(510-lam)/20; }
  else if (lam < 580) { r=(lam-510)/70; g=1; }
  else if (lam < 645) { r=1; g=(645-lam)/65; }
  else                { r=1; }
  const fac = lam < 420 ? 0.3+0.7*(lam-380)/40 : lam > 700 ? Math.max(0,0.3+0.7*(780-lam)/80) : 1;
  return [r*fac, g*fac, b*fac];
}

function intensityAt(sinT, lam_nm) {
  const sinT0 = Math.sin(params.tilt * Math.PI/180);
  const ds    = sinT - sinT0;
  const a_nm  = params.slitW * 1e6;
  const d_nm  = params.slitD * 1e6;
  const alpha = Math.PI * a_nm * ds / lam_nm;
  const env   = sinc(alpha)**2;
  const N     = params.numSlits;
  const delta = Math.PI * d_nm * ds / lam_nm;
  const sd    = Math.sin(delta);
  switch (params.aperture) {
    case 'single_linear':
    case 'obstacle_linear':   return env;
    case 'single_circular':
    case 'obstacle_circular': return airy(alpha)**2;
    case 'double':            return Math.cos(delta)**2 * env;
    case 'triple':            return (Math.abs(sd)<1e-12 ? 1 : (Math.sin(3*delta)/(3*sd))**2) * env;
    case 'grating':           return (Math.abs(sd)<1e-12 ? 1 : (Math.sin(N*delta)/(N*sd))**2) * env;
  }
  return 0;
}

function dispI(sinT, lam_nm) {
  return Math.pow(Math.max(0, intensityAt(sinT, lam_nm)), 0.38);
}

/* y-range FISSA: riferimento a_ref=0.10mm e L_ref=500mm — NON dipende da a né da L */
function getFixedYRange() {
  const a_nm_ref = 0.10 * 1e6;   // riferimento fisso: 100 μm
  const d_nm     = params.slitD * 1e6;
  const lam      = params.lambda;
  const y1       = 500 * lam / a_nm_ref;
  if (params.aperture === 'grating') {
    const ord1 = 500 * lam / d_nm;
    return Math.max(y1 * 2, ord1 * (Math.min(params.numSlits, 12) + 1));
  }
  return Math.max(y1 * 10, 2);
}

/* y-range per grafici (scala con L e a per auto-scale) */
function getYRange() {
  const L    = params.screenL;
  const a_nm = params.slitW * 1e6;
  const d_nm = params.slitD * 1e6;
  const lam  = params.lambda;
  const y1   = L * lam / a_nm;
  if (params.aperture === 'grating') {
    const ord1 = L * lam / d_nm;
    return Math.max(y1*2, ord1*(Math.min(params.numSlits,12)+1));
  }
  return Math.max(y1*10, 2);
}

/* ── Layout: 3 zone — schema | schermo quadrato | I(y) ──── */
function getLayout() {
  const schW = Math.round(cw * 0.42);
  const gap  = Math.max(6, Math.round(cw * 0.012));
  /* Schermo quadrato: lato = minimo tra 80% ch e 22% cw */
  const side = Math.round(Math.min(ch * 0.82, cw * 0.22));
  const scW  = side;
  const scH  = side;
  const scX  = schW + gap;
  const scY  = Math.round((ch - scH) / 2);
  /* Grafico I(y): stretto, affiancato allo schermo */
  const igX  = scX + scW + gap;
  const igW  = Math.max(24, Math.round(cw * 0.12));
  return { schW, scX, scW, scH, scY, igX, igW };
}

/* ── Scena principale ────────────────────────────────────── */
function drawScene() {
  ctx.clearRect(0,0,cw,ch);
  const dark   = document.documentElement.dataset.theme !== 'light';
  const { schW, scX, scW, scH, scY, igX, igW } = getLayout();
  const yFixed = getFixedYRange();

  drawGrid(dark);
  drawSchematic(dark, schW, scY, scH);
  drawScreenPattern(scX, scY, scW, scH, yFixed);
  drawScreenFrame(scX, scY, scW, scH, yFixed, dark);
  drawIyGraph(igX, scY, igW, scH, yFixed, dark);
  updateReadout();
}

function drawGrid(dark) {
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';
  ctx.lineWidth = 1;
  for (let x=0; x<=cw; x+=50) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,ch); ctx.stroke(); }
  for (let y=0; y<=ch; y+=50) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(cw,y); ctx.stroke(); }
}

/* ── Schema ottico autocontenuto in 0..schW ─────────────── */
function drawSchematic(dark, schW, scY, scH) {
  const midY    = scY + scH / 2;        // allineato al centro dello schermo
  const srcX    = schW * 0.06;
  const aperX   = schW * 0.36;
  const tiltRad = params.tilt * Math.PI / 180;
  const dimC    = dark ? 'rgba(180,220,255,0.60)' : 'rgba(30,80,150,0.60)';
  const fS      = Math.max(9, Math.min(11, cw * 0.017));
  const beamH   = scH * 0.30;

  /* Posizione schermo nello schema: scala logaritmica di L */
  const L_min = 50, L_max = 5000;
  const tLog  = Math.log(params.screenL / L_min) / Math.log(L_max / L_min);
  const scrRange   = schW - aperX - 22;
  const schScrX    = aperX + 10 + tLog * scrRange;
  const schScrH    = Math.round(scH * 0.55);   // altezza del mini-schermo

  /* Raggi paralleli in ingresso */
  const nRays = 9;
  for (let i = 0; i < nRays; i++) {
    const ySrc = midY - beamH + (2*beamH/(nRays-1))*i;
    const yAp  = ySrc - (aperX - srcX) * Math.tan(tiltRad);
    ctx.strokeStyle = dark ? 'rgba(255,255,200,0.22)' : 'rgba(200,170,0,0.22)';
    ctx.lineWidth = 1.0;
    ctx.beginPath(); ctx.moveTo(srcX, ySrc); ctx.lineTo(aperX - 7, yAp); ctx.stroke();
  }

  /* Icona sorgente: fronte d'onda */
  ctx.strokeStyle = dark ? 'rgba(255,255,160,0.65)' : 'rgba(180,140,0,0.70)';
  ctx.lineWidth = 2.0;
  ctx.beginPath(); ctx.moveTo(srcX, midY - beamH*0.65); ctx.lineTo(srcX, midY + beamH*0.65); ctx.stroke();
  ctx.lineWidth = 1.2;
  for (let i = -2; i <= 2; i++) {
    const ty = midY + i * beamH * 0.28;
    ctx.beginPath(); ctx.moveTo(srcX, ty); ctx.lineTo(srcX + 7, ty); ctx.stroke();
  }

  /* Label sorgente */
  const srcLabel = params.lightType === 'mono' ? `λ = ${params.lambda} nm` : 'luce bianca';
  ctx.fillStyle = dimC;
  ctx.font = `${fS}px 'Space Mono', monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(srcLabel, srcX + (aperX - srcX) * 0.38, midY - beamH - 10);

  /* Fenditura */
  drawApertureShape(aperX, midY, dark);

  /* Raggi diffratti verso il mini-schermo */
  const a_nm   = params.slitW * 1e6;
  const sinT1  = Math.min(0.82, params.lambda / a_nm);
  const theta1 = Math.asin(sinT1);
  const dx     = schScrX - aperX;
  const rayLam = params.lightType === 'mono' ? params.lambda : 550;
  const [rr,rg,rb] = wavToRGB(rayLam);
  const rc = `rgba(${Math.round(rr*255)},${Math.round(rg*255)},${Math.round(rb*255)}`;

  /* raggio centrale */
  ctx.strokeStyle = rc+',0.65)'; ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(aperX, midY);
  ctx.lineTo(schScrX - 3, midY + dx * Math.tan(tiltRad));
  ctx.stroke();

  /* ±1° ordine */
  const dyAtScr = dx * Math.tan(theta1);
  if (dyAtScr < schScrH * 0.50) {
    ctx.strokeStyle = rc+',0.30)'; ctx.lineWidth = 1.0;
    [-1,1].forEach(s => {
      const y2 = midY + s*dyAtScr + dx*Math.tan(tiltRad);
      ctx.beginPath(); ctx.moveTo(aperX, midY); ctx.lineTo(schScrX - 3, y2); ctx.stroke();
    });
  }

  /* Asse ottico */
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)';
  ctx.lineWidth = 1; ctx.setLineDash([5,5]);
  ctx.beginPath(); ctx.moveTo(srcX, midY); ctx.lineTo(schScrX, midY); ctx.stroke();
  ctx.setLineDash([]);

  /* Mini-schermo nello schema (si sposta con L) */
  ctx.fillStyle = dark ? 'rgba(0,180,255,0.70)' : 'rgba(0,100,200,0.80)';
  ctx.fillRect(schScrX - 2, midY - schScrH/2, 5, schScrH);
  /* bordo più luminoso */
  ctx.strokeStyle = dark ? 'rgba(0,212,255,0.90)' : 'rgba(0,150,220,0.90)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(schScrX - 2, midY - schScrH/2, 5, schScrH);

  /* Freccia L: aperX → schScrX */
  const arrY = Math.min(ch - 10, midY + schScrH/2 + 20);
  ctx.strokeStyle = dimC; ctx.fillStyle = dimC; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(aperX, arrY); ctx.lineTo(schScrX, arrY); ctx.stroke();
  [[aperX, 1],[schScrX, -1]].forEach(([ax, dir]) => {
    ctx.beginPath();
    ctx.moveTo(ax + dir*6, arrY - 3);
    ctx.lineTo(ax, arrY);
    ctx.lineTo(ax + dir*6, arrY + 3);
    ctx.stroke();
  });
  ctx.font = `${fS}px 'Space Mono', monospace`; ctx.textAlign = 'center';
  ctx.fillText(`L = ${params.screenL} mm`, (aperX + schScrX)/2, arrY - 4);

  /* Label a, d */
  ctx.fillStyle = dimC; ctx.textAlign = 'left';
  ctx.fillText(`a = ${Lab.fmt((params.slitW*1000),0)} μm`, aperX + 14, midY - scH*0.10);
  if (['double','triple','grating'].includes(params.aperture))
    ctx.fillText(`d = ${Lab.fmt((params.slitD*1000),0)} μm`, aperX + 14, midY - scH*0.18);

  /* Arco inclinazione */
  if (Math.abs(params.tilt) > 0.5) {
    const arcR = 28;
    ctx.strokeStyle = dark ? 'rgba(255,200,60,0.65)' : 'rgba(180,130,0,0.65)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(aperX, midY, arcR, -Math.PI/2, -Math.PI/2 - tiltRad, tiltRad > 0);
    ctx.stroke();
    ctx.fillStyle = dark ? 'rgba(255,200,60,0.75)' : 'rgba(180,130,0,0.75)';
    ctx.font = `${fS}px 'Space Mono', monospace`; ctx.textAlign = 'left';
    ctx.fillText(`θ₀ = ${params.tilt}°`, aperX + arcR + 5, midY - 8);
  }
}

/* ── Apertura ─────────────────────────────────────────────── */
function getSlitGaps(aPx, dPx, midY) {
  switch (params.aperture) {
    case 'single_linear':
    case 'single_circular':
      return [{ top: midY-aPx/2, bot: midY+aPx/2 }];
    case 'obstacle_linear':
    case 'obstacle_circular':
      return [];
    case 'double':
      return [
        { top: midY-dPx/2-aPx/2, bot: midY-dPx/2+aPx/2 },
        { top: midY+dPx/2-aPx/2, bot: midY+dPx/2+aPx/2 },
      ];
    case 'triple':
      return [
        { top: midY-dPx-aPx/2, bot: midY-dPx+aPx/2 },
        { top: midY-aPx/2,     bot: midY+aPx/2      },
        { top: midY+dPx-aPx/2, bot: midY+dPx+aPx/2  },
      ];
    case 'grating': {
      const N = Math.min(params.numSlits, 9);
      return Array.from({length:N}, (_,i) => {
        const cy = midY + (i-(N-1)/2)*dPx;
        return { top: cy-aPx/2, bot: cy+aPx/2 };
      });
    }
  }
  return [];
}

function drawApertureShape(x, midY, dark) {
  const plateW = 10;
  const plateH = ch * 0.88;
  const top    = midY - plateH/2;
  const bot    = midY + plateH/2;
  const scale  = Math.min(120/0.5, ch*0.18 / Math.max(params.slitW, 0.01));
  const aPx    = Math.max(2, params.slitW * scale);
  const dPx    = Math.max(2, params.slitD * scale);
  const fillC  = dark ? 'rgba(30,45,70,0.95)' : 'rgba(130,155,190,0.90)';
  const strokeC= dark ? 'rgba(0,212,255,0.65)' : 'rgba(0,130,200,0.65)';
  const gaps   = getSlitGaps(aPx, dPx, midY);

  ctx.fillStyle = fillC;
  let y = top;
  for (const g of gaps) {
    ctx.fillRect(x-plateW/2, y, plateW, Math.max(0, g.top-y));
    y = g.bot;
  }
  ctx.fillRect(x-plateW/2, y, plateW, Math.max(0, bot-y));

  if (params.aperture === 'single_circular' || params.aperture === 'obstacle_circular') {
    const r = Math.max(3, Math.min(40, aPx/2));
    ctx.clearRect(x-plateW/2, midY-r-1, plateW, r*2+2);
    if (params.aperture === 'obstacle_circular') {
      ctx.fillStyle = fillC;
      ctx.beginPath(); ctx.arc(x, midY, r, 0, Math.PI*2); ctx.fill();
    }
  }

  ctx.strokeStyle = strokeC; ctx.lineWidth = 1.5;
  ctx.strokeRect(x-plateW/2, top, plateW, plateH);
}

/* ── Pattern sullo schermo (quadrato, asse y fisso) ─────── */
function drawScreenPattern(scX, scY, scW, scH, yFixed) {
  const dpr = window.devicePixelRatio || 1;
  const pX  = Math.round(scX * dpr);
  const pY  = Math.round(scY * dpr);
  const pW  = Math.round(scW * dpr);
  const pH  = Math.round(scH * dpr);
  const L   = params.screenL;
  const is2D = params.aperture === 'single_circular' || params.aperture === 'obstacle_circular';
  const cX  = pW/2, cY = pH/2;

  const imgData = new ImageData(pW, pH);

  for (let py = 0; py < pH; py++) {
    const y_mm = (py - cY) / pH * 2 * yFixed;

    if (!is2D) {
      const sinT = y_mm / Math.hypot(y_mm, L);
      let R=0, G=0, B=0;
      if (params.lightType === 'mono') {
        const I = dispI(sinT, params.lambda);
        const [r,g,b] = wavToRGB(params.lambda);
        R=r*I*255; G=g*I*255; B=b*I*255;
      } else {
        for (const lam of WAVES_WHITE) {
          const I = dispI(sinT, lam);
          const [r,g,b] = wavToRGB(lam);
          R+=r*I*255/WAVES_WHITE.length;
          G+=g*I*255/WAVES_WHITE.length;
          B+=b*I*255/WAVES_WHITE.length;
        }
      }
      const rv=Math.min(255,Math.round(R)), gv=Math.min(255,Math.round(G)), bv=Math.min(255,Math.round(B));
      for (let px=0; px<pW; px++) {
        const idx=(py*pW+px)*4;
        imgData.data[idx]=rv; imgData.data[idx+1]=gv; imgData.data[idx+2]=bv; imgData.data[idx+3]=255;
      }
    } else {
      for (let px = 0; px < pW; px++) {
        const x_mm = (px-cX)/pW*2*yFixed;
        const r_mm = Math.hypot(x_mm, y_mm);
        const sinT = r_mm / Math.hypot(r_mm, L);
        let R=0, G=0, B=0;
        if (params.lightType === 'mono') {
          const I = dispI(sinT, params.lambda);
          const [r,g,b] = wavToRGB(params.lambda);
          R=r*I*255; G=g*I*255; B=b*I*255;
        } else {
          for (const lam of WAVES_WHITE) {
            const I = dispI(sinT, lam);
            const [r,g,b] = wavToRGB(lam);
            R+=r*I*255/WAVES_WHITE.length;
            G+=g*I*255/WAVES_WHITE.length;
            B+=b*I*255/WAVES_WHITE.length;
          }
        }
        const idx=(py*pW+px)*4;
        imgData.data[idx]=Math.min(255,Math.round(R));
        imgData.data[idx+1]=Math.min(255,Math.round(G));
        imgData.data[idx+2]=Math.min(255,Math.round(B));
        imgData.data[idx+3]=255;
      }
    }
  }

  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  ctx.putImageData(imgData, pX, pY);
  ctx.restore();
}

function drawScreenFrame(scX, scY, scW, scH, yFixed, dark) {
  ctx.strokeStyle = dark ? 'rgba(0,212,255,0.45)' : 'rgba(0,130,200,0.45)';
  ctx.lineWidth = 1.5; ctx.strokeRect(scX, scY, scW, scH);

  ctx.fillStyle = dark ? 'rgba(0,212,255,0.60)' : 'rgba(0,100,180,0.65)';
  ctx.font = `10px 'Space Mono', monospace`; ctx.textAlign = 'center';
  ctx.fillText('SCHERMO', scX+scW/2, scY-5);

  /* Asse centrale */
  const midY = scY + scH/2;
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)';
  ctx.lineWidth = 1; ctx.setLineDash([3,4]);
  ctx.beginPath(); ctx.moveTo(scX, midY); ctx.lineTo(scX+scW, midY); ctx.stroke();
  ctx.setLineDash([]);

  /* Scale y a sinistra */
  const tickVals = [-yFixed, -yFixed/2, 0, yFixed/2, yFixed];
  ctx.font = `8px 'Space Mono', monospace`;
  for (const v of tickVals) {
    const py = scY + scH/2 + (v/yFixed)*scH/2;
    ctx.fillStyle = dark ? 'rgba(200,230,255,0.55)' : 'rgba(30,60,130,0.55)';
    ctx.textAlign = 'left';
    ctx.fillText(`${v>=0?'+':''}${Lab.fmt(v,1)}`, scX+3, py+3);
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(scX, py); ctx.lineTo(scX+6, py); ctx.stroke();
  }
  ctx.fillStyle = dark ? 'rgba(180,210,255,0.50)' : 'rgba(30,60,130,0.50)';
  ctx.textAlign = 'center';
  ctx.fillText('mm', scX+14, scY+10);
}

/* ── Grafico I(y) verticale, affiancato allo schermo ────── */
function drawIyGraph(ox, oy, pw, ph, yFixed, dark) {
  if (pw < 20) return;
  const L    = params.screenL;
  const dimC = dark ? 'rgba(180,220,255,0.55)' : 'rgba(30,80,150,0.55)';
  const tc   = dark ? 'rgba(160,200,240,0.50)' : 'rgba(30,60,130,0.50)';

  const steps = Math.min(ph * 2, 800);
  const pts   = [];
  let Imax = 0.01;

  if (params.lightType === 'mono') {
    for (let i = 0; i <= steps; i++) {
      const y_mm = -yFixed + (i/steps)*2*yFixed;
      const sinT = y_mm / Math.hypot(y_mm, L);
      const I    = intensityAt(sinT, params.lambda);
      pts.push({ y_mm, I });
      Imax = Math.max(Imax, I);
    }
  } else {
    for (let i = 0; i <= steps; i++) {
      const y_mm = -yFixed + (i/steps)*2*yFixed;
      const sinT = y_mm / Math.hypot(y_mm, L);
      const I    = WAVES_WHITE.reduce((s,lam) => s + intensityAt(sinT,lam), 0) / WAVES_WHITE.length;
      pts.push({ y_mm, I });
      Imax = Math.max(Imax, I);
    }
  }

  const graphW = pw - 4;
  const getCy  = y_mm => oy + (y_mm + yFixed) / (2*yFixed) * ph;

  if (params.lightType === 'mono') {
    const [r,g,b] = wavToRGB(params.lambda);
    const col = `${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)}`;
    /* Fill */
    ctx.beginPath();
    ctx.moveTo(ox, getCy(-yFixed));
    for (const { y_mm, I } of pts)
      ctx.lineTo(ox + (I/Imax)*graphW, getCy(y_mm));
    ctx.lineTo(ox, getCy(yFixed));
    ctx.closePath();
    ctx.fillStyle = `rgba(${col},0.16)`;
    ctx.fill();
    /* Stroke */
    ctx.beginPath();
    pts.forEach(({ y_mm, I }, i) => {
      const cx = ox + (I/Imax)*graphW;
      const cy = getCy(y_mm);
      i===0 ? ctx.moveTo(cx,cy) : ctx.lineTo(cx,cy);
    });
    ctx.strokeStyle = `rgba(${col},0.88)`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else {
    for (const lam of WAVES_WHITE) {
      const [r,g,b] = wavToRGB(lam);
      ctx.beginPath();
      let first = true;
      for (let i = 0; i <= steps; i++) {
        const y_mm = -yFixed + (i/steps)*2*yFixed;
        const sinT = y_mm / Math.hypot(y_mm, L);
        const I    = intensityAt(sinT, lam);
        const cx   = ox + (I/Imax)*graphW;
        const cy   = getCy(y_mm);
        first ? ctx.moveTo(cx,cy) : ctx.lineTo(cx,cy); first=false;
      }
      ctx.strokeStyle = `rgba(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)},0.45)`;
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
  }

  /* Asse y */
  ctx.strokeStyle = dark ? 'rgba(200,220,255,0.30)' : 'rgba(0,0,0,0.20)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, oy+ph); ctx.stroke();

  /* Centro */
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  ctx.setLineDash([3,4]);
  ctx.beginPath(); ctx.moveTo(ox, oy+ph/2); ctx.lineTo(ox+graphW, oy+ph/2); ctx.stroke();
  ctx.setLineDash([]);

  /* Titolo */
  ctx.fillStyle = dimC;
  ctx.font = `10px 'Space Mono', monospace`; ctx.textAlign = 'center';
  ctx.fillText('I(y)', ox + graphW/2, oy - 5);

  /* Labels I */
  ctx.fillStyle = tc; ctx.font = `8px 'Space Mono', monospace`; ctx.textAlign = 'left';
  ctx.fillText('1', ox + graphW + 1, oy + 9);
  ctx.fillText('0', ox + 1, oy + 9);

  /* Cornice leggera */
  ctx.strokeStyle = dark ? 'rgba(0,212,255,0.18)' : 'rgba(0,100,180,0.18)';
  ctx.lineWidth = 1;
  ctx.strokeRect(ox, oy, graphW, ph);
}

/* ── Readout ─────────────────────────────────────────────── */
function updateReadout() {
  const a_nm = params.slitW * 1e6;
  const d_nm = params.slitD * 1e6;
  const lam  = params.lambda;
  const L    = params.screenL;
  const y1   = L * lam / a_nm;
  const items = [
    { label: 'lunghezza d’onda λ', value: `${lam} nm`                            },
    { label: 'apertura a', value: `${Lab.fmt((params.slitW*1000),0)} μm` },
    { label: 'distanza schermo L', value: `${L} mm`                              },
    { label: 'primo minimo', value: `± ${Lab.fmt(y1,2)} mm`                },
  ];
  if (['double','triple','grating'].includes(params.aperture))
    items.push({ label: 'primo massimo d’interferenza', value: `± ${Lab.fmt((L*lam/d_nm),2)} mm` });
  if (params.aperture === 'single_circular')
    items.push({ label: 'raggio del disco di Airy', value: `± ${Lab.fmt((1.22*y1),2)} mm` });
  if (params.aperture.startsWith('obstacle'))
    items.push({ label: 'centro dell’ombra', value: 'macchia di Poisson' });

  readoutEl.innerHTML = items.map(it =>
    `<span class="readout-item"><span class="readout-label">${Lab.keepCaseHTML(it.label)}</span><span class="readout-value">${it.value}</span></span>`
  ).join('');
}

/* ── Grafici (2 pannelli) ────────────────────────────────── */
function drawGraphs() {
  if (!gw || !gh) return;
  gctx.clearRect(0,0,gw,gh);
  const dark = document.documentElement.dataset.theme !== 'light';
  const pw   = Math.floor(gw/2);
  drawIthetaPanel(0,  0, pw,    gh, dark);
  drawSpecPanel  (pw, 0, gw-pw, gh, dark);
}

const GP = { l:40, r:8, t:18, b:26 };

function panelBase(gc, ox, oy, pw, ph, dark) {
  gc.fillStyle = dark ? '#0b1018' : '#f0f2f5';
  gc.fillRect(ox,oy,pw,ph);
  const l=ox+GP.l, t=oy+GP.t, iW=pw-GP.l-GP.r, iH=ph-GP.t-GP.b;
  gc.strokeStyle = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'; gc.lineWidth=1;
  for (let i=0; i<=4; i++) {
    const x=l+(i/4)*iW; gc.beginPath(); gc.moveTo(x,t); gc.lineTo(x,t+iH); gc.stroke();
    const y=t+(i/4)*iH; gc.beginPath(); gc.moveTo(l,y); gc.lineTo(l+iW,y); gc.stroke();
  }
  if (ox>0) {
    gc.strokeStyle = dark ? 'rgba(0,212,255,0.07)' : 'rgba(0,100,160,0.07)';
    gc.beginPath(); gc.moveTo(ox,oy); gc.lineTo(ox,oy+ph); gc.stroke();
  }
  return {l,t,iW,iH};
}

function panelTitle(gc, ox, oy, pw, title, dark) {
  gc.fillStyle = dark ? 'rgba(200,220,255,0.50)' : 'rgba(40,60,100,0.50)';
  gc.font=`10px 'Space Mono', monospace`; gc.textAlign='center';
  gc.fillText(title, ox+pw/2, oy+12);
}

/* Pannello I vs θ */
function drawIthetaPanel(ox, oy, pw, ph, dark) {
  const {l,t,iW,iH} = panelBase(gctx, ox, oy, pw, ph, dark);
  const yR = getYRange();
  const thetaMax = Math.min(45, Math.asin(Math.min(0.99, yR/Math.hypot(yR,params.screenL))) * 180/Math.PI);

  if (params.lightType === 'mono') {
    const [r,g,b] = wavToRGB(params.lambda);
    gctx.strokeStyle=`rgba(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)},0.85)`;
    gctx.lineWidth=1.8; gctx.beginPath();
    for (let i=0; i<=iW; i++) {
      const theta_deg = -thetaMax + (i/iW)*2*thetaMax;
      const sinT = Math.sin(theta_deg*Math.PI/180);
      const I = intensityAt(sinT, params.lambda);
      const cx=l+(i/iW)*iW, cy=t+iH-I*iH;
      i===0 ? gctx.moveTo(cx,cy) : gctx.lineTo(cx,cy);
    }
    gctx.stroke();
  } else {
    for (const lam of WAVES_WHITE) {
      const [r,g,b] = wavToRGB(lam);
      gctx.strokeStyle=`rgba(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)},0.55)`;
      gctx.lineWidth=1.2; gctx.beginPath();
      let first=true;
      for (let i=0; i<=iW; i++) {
        const theta_deg = -thetaMax + (i/iW)*2*thetaMax;
        const sinT = Math.sin(theta_deg*Math.PI/180);
        const I = intensityAt(sinT, lam);
        const cx=l+(i/iW)*iW, cy=t+iH-I*iH;
        first ? gctx.moveTo(cx,cy) : gctx.lineTo(cx,cy); first=false;
      }
      gctx.stroke();
    }
  }

  const midX=l+iW/2;
  gctx.strokeStyle = dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)';
  gctx.lineWidth=1; gctx.setLineDash([3,4]);
  gctx.beginPath(); gctx.moveTo(midX,t); gctx.lineTo(midX,t+iH); gctx.stroke();
  gctx.setLineDash([]);

  const tc = dark ? '#6b8099' : '#4a6278';
  gctx.strokeStyle = dark ? 'rgba(200,220,255,0.35)' : 'rgba(0,0,0,0.28)';
  gctx.lineWidth=1; gctx.strokeRect(l,t,iW,iH);
  gctx.fillStyle=tc; gctx.font=`9px 'Space Mono', monospace`;
  gctx.textAlign='center';
  gctx.fillText(`-${Lab.fmt(thetaMax,0)}°`, l, t+iH+14);
  gctx.fillText('0',                         l+iW/2, t+iH+14);
  gctx.fillText(`+${Lab.fmt(thetaMax,0)}°`,  l+iW,   t+iH+14);
  gctx.textAlign='right'; gctx.fillText('0',l-3,t+iH+4); gctx.fillText('1',l-3,t+4);
  panelTitle(gctx, ox, oy, pw, 'Intensità vs angolo θ', dark);
}

/* Pannello inviluppo sinc² / spettro */
function drawSpecPanel(ox, oy, pw, ph, dark) {
  const {l,t,iW,iH} = panelBase(gctx, ox, oy, pw, ph, dark);
  const tc = dark ? '#6b8099' : '#4a6278';

  if (params.lightType === 'white') {
    const lamMin=380, lamMax=700;
    for (let px=0; px<iW; px++) {
      const lam = lamMin + (px/iW)*(lamMax-lamMin);
      const [r,g,b] = wavToRGB(lam);
      gctx.fillStyle = `rgba(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)},0.85)`;
      gctx.fillRect(l+px, t, 1, iH);
    }
    gctx.fillStyle=tc; gctx.font=`9px 'Space Mono', monospace`; gctx.textAlign='center';
    gctx.fillText('380', l, t+iH+14); gctx.fillText('540', l+iW/2, t+iH+14); gctx.fillText('700 nm', l+iW, t+iH+14);
    panelTitle(gctx, ox, oy, pw, 'Spettro visibile', dark);
  } else {
    const yMax = getYRange(), L = params.screenL;
    const a_nm = params.slitW * 1e6;
    const lam  = params.lambda;

    gctx.strokeStyle = dark ? 'rgba(0,212,255,0.35)' : 'rgba(0,130,200,0.35)';
    gctx.lineWidth=1.2; gctx.setLineDash([3,3]); gctx.beginPath();
    for (let i=0; i<=iW; i++) {
      const y_mm = -yMax+(i/iW)*2*yMax;
      const sinT = y_mm/Math.hypot(y_mm,L);
      const alpha = Math.PI*a_nm*(sinT-Math.sin(params.tilt*Math.PI/180))/lam;
      const env = sinc(alpha)**2;
      const cx=l+(i/iW)*iW, cy=t+iH-env*iH;
      i===0 ? gctx.moveTo(cx,cy) : gctx.lineTo(cx,cy);
    }
    gctx.stroke(); gctx.setLineDash([]);

    const [r,g,b] = wavToRGB(lam);
    gctx.strokeStyle=`rgba(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)},0.88)`;
    gctx.lineWidth=1.8; gctx.beginPath();
    for (let i=0; i<=iW; i++) {
      const y_mm = -yMax+(i/iW)*2*yMax;
      const sinT = y_mm/Math.hypot(y_mm,L);
      const I = intensityAt(sinT, lam);
      const cx=l+(i/iW)*iW, cy=t+iH-I*iH;
      i===0 ? gctx.moveTo(cx,cy) : gctx.lineTo(cx,cy);
    }
    gctx.stroke();

    gctx.fillStyle=tc; gctx.font=`9px 'Space Mono', monospace`; gctx.textAlign='center';
    gctx.fillText(`-${Lab.fmt(yMax,1)}`, l, t+iH+14);
    gctx.fillText('0', l+iW/2, t+iH+14);
    gctx.fillText(`+${Lab.fmt(yMax,1)} mm`, l+iW, t+iH+14);
    gctx.textAlign='right'; gctx.fillText('0',l-3,t+iH+4); gctx.fillText('1',l-3,t+4);
    panelTitle(gctx, ox, oy, pw, 'Inviluppo sinc² + I totale', dark);
  }
  gctx.strokeStyle = dark ? 'rgba(200,220,255,0.35)' : 'rgba(0,0,0,0.28)';
  gctx.lineWidth=1; gctx.strokeRect(l,t,iW,iH);
}

/* ── Controlli ───────────────────────────────────────────── */
function buildControls() {
  const el = document.getElementById('controls');
  el.innerHTML = '';

  const secA = Lab.Section('Apertura / Ostacolo');
  secA.add(Lab.RadioGroup({ label:'Tipo di apertura', options:[
    { label:'Singola (lineare)',    value:'single_linear'    },
    { label:'Singola (circolare)', value:'single_circular'  },
    { label:'Doppia',              value:'double'           },
    { label:'Tripla',              value:'triple'           },
    { label:'Reticolo',            value:'grating'          },
    { label:'Ostacolo (lineare)',  value:'obstacle_linear'  },
    { label:'Ostacolo (circolare)',value:'obstacle_circular' },
  ], value: params.aperture,
    onChange(v) { params.aperture=v; buildControls(); requestRedraw(); },
  }));
  el.appendChild(secA.el);

  const secL = Lab.Section('Sorgente luminosa');
  secL.add(Lab.RadioGroup({ label:'Tipo di luce', options:[
    { label:'Monocromatica', value:'mono'  },
    { label:'Bianca',        value:'white' },
  ], value: params.lightType,
    onChange(v) { params.lightType=v; lambdaSub[v==='mono'?'show':'hide'](); requestRedraw(); },
  }));
  const lambdaCtrl = Lab.SliderInput({ label:'Lunghezza d\'onda λ', min:380, max:700, step:5,
    value: params.lambda, unit:' nm',
    onChange(v) { params.lambda=v; requestRedraw(); },
  });
  const lambdaSub = Lab.SubPanel();
  lambdaSub.add(lambdaCtrl);
  if (params.lightType !== 'mono') lambdaSub.hide();
  secL.add(lambdaSub);
  el.appendChild(secL.el);

  const secG = Lab.Section('Geometria');
  secG.add(Lab.SliderInput({ label:'Ampiezza a', min:0.01, max:2.0, step:0.01,
    value: params.slitW, unit:' mm',
    hint: params.aperture.includes('circular') ? 'diametro dell\'apertura' : 'larghezza della fenditura',
    onChange(v) { params.slitW=v; requestRedraw(); },
  }));
  if (['double','triple','grating'].includes(params.aperture)) {
    secG.add(Lab.SliderInput({ label:'Passo d (c-c)', min:0.05, max:5.0, step:0.05,
      value: params.slitD, unit:' mm',
      hint: 'distanza centro-centro tra fenditure',
      onChange(v) { params.slitD=v; requestRedraw(); },
    }));
  }
  if (params.aperture === 'grating') {
    secG.add(Lab.SliderInput({ label:'N fenditure', min:2, max:50, step:1,
      value: params.numSlits, unit:'',
      onChange(v) { params.numSlits=v; requestRedraw(); },
    }));
  }
  el.appendChild(secG.el);

  const secS = Lab.Section('Schermo e fascio');
  secS.add(Lab.SliderInput({ label:'Distanza L', min:50, max:5000, step:10,
    value: params.screenL, unit:' mm',
    onChange(v) { params.screenL=v; requestRedraw(); },
  }));
  secS.add(Lab.SliderInput({ label:'Inclinazione θ₀', min:-45, max:45, step:1,
    value: params.tilt, unit:'°',
    hint: 'angolo di incidenza del fascio sulla fenditura',
    onChange(v) { params.tilt=v; requestRedraw(); },
  }));
  el.appendChild(secS.el);
}

/* ── Ridisegno ───────────────────────────────────────────── */
let _pending = false;
function requestRedraw() {
  if (!_pending) {
    _pending = true;
    requestAnimationFrame(() => { _pending=false; drawScene(); drawGraphs(); });
  }
}

function initResizeHandle() {
  const handle = document.getElementById('resizeHandle');
  let drag=false, sY=0, sH=0;
  handle.addEventListener('mousedown', e => { drag=true; sY=e.clientY; sH=graphArea.offsetHeight; document.body.style.userSelect='none'; });
  document.addEventListener('mousemove', e => { if(!drag)return; graphArea.style.height=Math.max(80,Math.min(500,sH+(sY-e.clientY)))+'px'; resizeCanvases(); requestRedraw(); });
  document.addEventListener('mouseup', () => { if(drag){drag=false; document.body.style.userSelect='';} });
}

function initFullscreen() {
  document.getElementById('btnFullscreen').addEventListener('click', () => {
    !document.fullscreenElement
      ? (graphArea.requestFullscreen?.() ?? graphArea.webkitRequestFullscreen?.())
      : (document.exitFullscreen?.()  ?? document.webkitExitFullscreen?.());
  });
  document.addEventListener('fullscreenchange', () => { resizeCanvases(); requestRedraw(); });
}

new MutationObserver(() => requestRedraw())
  .observe(document.documentElement, { attributes:true, attributeFilter:['data-theme'] });

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
    params.aperture='single_linear'; params.lightType='mono'; params.lambda=550;
    params.slitW=0.10; params.slitD=0.30; params.numSlits=8;
    params.screenL=500; params.tilt=0;
    buildControls(); requestRedraw();
  });
}

init();
