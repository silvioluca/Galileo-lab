/* Sintesi del Colore — Additiva (RGB) + Sottrattiva (CMY) + Sistema Munsell */
'use strict';

// ── CIE 1931 spectral locus ───────────────────────────────────────────────────
const LOCUS = [
  [380,0.1741,0.0050],[390,0.1740,0.0050],[400,0.1733,0.0048],[410,0.1714,0.0057],
  [420,0.1714,0.0076],[430,0.1584,0.0177],[440,0.1505,0.0257],[450,0.1355,0.0311],
  [460,0.1241,0.0600],[470,0.1096,0.0868],[480,0.0913,0.1327],[490,0.0454,0.2950],
  [500,0.0082,0.5384],[510,0.0139,0.6502],[520,0.0743,0.8338],[530,0.1547,0.8059],
  [540,0.2296,0.7549],[550,0.3016,0.6923],[560,0.3731,0.6245],[570,0.4441,0.5547],
  [580,0.5125,0.4866],[590,0.5752,0.4242],[600,0.6270,0.3725],[610,0.6658,0.3340],
  [620,0.6915,0.3083],[630,0.7006,0.2993],[640,0.7034,0.2966],[650,0.7073,0.2927],
  [700,0.7347,0.2653],[780,0.7347,0.2653],
];
const LOCUS_XY = LOCUS.map(([,x,y]) => [x,y]);

function ptInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi,yi] = poly[i], [xj,yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < (xj-xi)*(py-yi)/(yj-yi)+xi) inside = !inside;
  }
  return inside;
}

// ── General color math ────────────────────────────────────────────────────────
function clamp(v)  { return Math.max(0, Math.min(255, Math.round(v))); }
function rgb(c)    { return `rgb(${c[0]},${c[1]},${c[2]})`; }
function toHex(c)  { return '#' + c.map(v => v.toString(16).padStart(2,'0')).join(''); }

function linearize(v) { return v <= 0.04045 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }
function gammaEnc(v)  { return v <= 0.0031308 ? 12.92*v : 1.055*Math.pow(Math.max(0,v), 1/2.4) - 0.055; }

function rgbToXY(R, G, B) {
  const r=linearize(R/255), g=linearize(G/255), b=linearize(B/255);
  const X=0.4124*r+0.3576*g+0.1805*b, Y=0.2126*r+0.7152*g+0.0722*b, Z=0.0193*r+0.1192*g+0.9505*b;
  const s=X+Y+Z; return s>1e-6 ? [X/s,Y/s] : [0.3127,0.3290];
}
function xyzToLinRGB(X,Y,Z) {
  return [3.2406*X-1.5372*Y-0.4986*Z, -0.9689*X+1.8758*Y+0.0415*Z, 0.0557*X-0.2040*Y+1.0570*Z];
}

function hslToRgb(h, s, l) {
  const C=(1-Math.abs(2*l-1))*s, X=C*(1-Math.abs((h/60)%2-1)), m=l-C/2;
  let r=0,g=0,b=0;
  if(h<60){r=C;g=X;}else if(h<120){r=X;g=C;}else if(h<180){g=C;b=X;}
  else if(h<240){g=X;b=C;}else if(h<300){r=X;b=C;}else{r=C;b=X;}
  return [clamp((r+m)*255),clamp((g+m)*255),clamp((b+m)*255)];
}
function rgbToHsl(R, G, B) {
  const r=R/255,g=G/255,b=B/255;
  const mx=Math.max(r,g,b), mn=Math.min(r,g,b), l=(mx+mn)/2;
  let h=0,s=0;
  if(mx!==mn){
    const d=mx-mn; s=l>0.5?d/(2-mx-mn):d/(mx+mn);
    if(mx===r) h=((g-b)/d+(g<b?6:0))/6;
    else if(mx===g) h=((b-r)/d+2)/6;
    else h=((r-g)/d+4)/6;
  }
  return [h*360,s,l];
}

function addMix(...cols) {
  return [clamp(cols.reduce((s,c)=>s+c[0],0)), clamp(cols.reduce((s,c)=>s+c[1],0)), clamp(cols.reduce((s,c)=>s+c[2],0))];
}
function mulMix(...cols) {
  return [clamp(cols.reduce((p,c)=>p*c[0]/255,255)), clamp(cols.reduce((p,c)=>p*c[1]/255,255)), clamp(cols.reduce((p,c)=>p*c[2]/255,255))];
}

// ── Munsell ↔ HSL / RGB conversion (approximate) ────────────────────────────
// Piecewise mapping: Munsell H (0-100) ↔ HSL H (0-360°)
// Anchor points derived from Munsell renotation data
const MH_MAP = [
  [0,352],[5,0],[10,14],[15,28],[20,44],[25,62],[30,77],[35,92],[40,115],
  [45,140],[50,158],[55,178],[60,198],[65,220],[70,242],[75,260],[80,275],
  [85,290],[90,306],[95,320],[100,352],
];

function munsellHToHslH(mH) {
  mH = ((mH % 100) + 100) % 100;
  const kn = MH_MAP;
  for (let i = 0; i < kn.length-1; i++) {
    const [m0,h0] = kn[i], [m1,h1] = kn[i+1];
    if (mH >= m0 && mH <= m1) return h0 + (mH-m0)/(m1-m0)*(h1-h0);
  }
  return 0;
}
function hslHToMunsellH(hslH) {
  hslH = ((hslH % 360)+360)%360;
  const kn = MH_MAP;
  for (let i = 0; i < kn.length-1; i++) {
    const [m0,h0] = kn[i], [m1,h1] = kn[i+1];
    if (hslH >= h0 && hslH <= h1) return m0 + (hslH-h0)/(h1-h0)*(m1-m0);
  }
  return 5;
}

// mV: Munsell Value 0-10, mC: Munsell Chroma 0-14+
function munsellToRGB(mH, mV, mC) {
  const h = munsellHToHslH(mH);
  const l = mV / 10;
  const maxC = 1 - Math.abs(2*l - 1); // HSL max chroma factor at this L
  const s = maxC > 0.01 ? Math.min(1, (mC / 14) / maxC) : 0;
  return hslToRgb(h, s, l);
}
function rgbToMunsell(R, G, B) {
  const [h, s, l] = rgbToHsl(R, G, B);
  const mH = hslHToMunsellH(h);
  const mV = l * 10;
  const maxC = 1 - Math.abs(2*l - 1);
  const mC = s * maxC * 14;
  return [mH, mV, mC];
}

// ── Params ────────────────────────────────────────────────────────────────────
const params = { iR:1.0, iG:1.0, iB:1.0, iC:1.0, iM:1.0, iY:1.0 };

// i cursori sono intensità di luce (lineari): si convertono in valori sRGB con la curva gamma
const enc = i => clamp(gammaEnc(i) * 255);
function allMixesAdd() {
  const c1=[enc(params.iR),0,0], c2=[0,enc(params.iG),0], c3=[0,0,enc(params.iB)];
  return { c1,c2,c3, c12:addMix(c1,c2), c13:addMix(c1,c3), c23:addMix(c2,c3), c123:addMix(c1,c2,c3) };
}
function allMixesSub() {
  // ogni filtro trasmette la frazione (1 − densità) del suo canale complementare
  const c1=[enc(1-params.iC),255,255], c2=[255,enc(1-params.iM),255], c3=[255,255,enc(1-params.iY)];
  return { c1,c2,c3, c12:mulMix(c1,c2), c13:mulMix(c1,c3), c23:mulMix(c2,c3), c123:mulMix(c1,c2,c3) };
}

// ── Canvas ────────────────────────────────────────────────────────────────────
const simCv  = document.getElementById('simCanvas');
const simCtx = simCv.getContext('2d');
const grCv   = document.getElementById('graphCanvas');
const grCtx  = grCv.getContext('2d');
let SW=0, SH=0, GW=0, GH=0;

function isDark() { return document.documentElement.dataset.theme !== 'light'; }

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const par = simCv.parentElement;
  const gH  = document.getElementById('graphArea').offsetHeight || 230;
  const rH  = document.querySelector('.readout-bar')?.offsetHeight || 56;

  SW = par.clientWidth;
  SH = Math.max(160, par.clientHeight - gH - rH);
  simCv.width  = Math.round(SW*dpr); simCv.height = Math.round(SH*dpr);
  simCv.style.width = SW+'px'; simCv.style.height = SH+'px';
  simCtx.setTransform(dpr,0,0,dpr,0,0);

  GW = par.clientWidth;
  GH = document.getElementById('graphArea').clientHeight || 230;
  grCv.width  = Math.round(GW*dpr); grCv.height = Math.round(GH*dpr);
  grCv.style.width = GW+'px'; grCv.style.height = GH+'px';
  grCtx.setTransform(dpr,0,0,dpr,0,0);

  cieCv = null; munsellCv = null; // force precompute on next draw
}

// ── CIE 1931 — precomputed offscreen canvas ───────────────────────────────────
let cieCv = null, cieW = 0, cieH = 0;

function buildCieCv(W, H) {
  if (W < 10 || H < 10) return;
  const dpr = window.devicePixelRatio || 1;
  const pw = Math.round(W*dpr), ph = Math.round(H*dpr);
  const cv = document.createElement('canvas'); cv.width=pw; cv.height=ph;
  const imgData = new ImageData(pw, ph); const d = imgData.data;
  const X0=0.0,X1=0.80,Y0=0.0,Y1=0.90;
  for (let py=0; py<ph; py++) {
    const yc = Y1-(py/(ph-1))*(Y1-Y0);
    for (let px=0; px<pw; px++) {
      const xc = X0+(px/(pw-1))*(X1-X0);
      const idx = (py*pw+px)*4;
      if (yc<0.002 || !ptInPoly(xc,yc,LOCUS_XY)) { d[idx+3]=0; continue; }
      const X=xc/yc,Y=1.0,Z=(1-xc-yc)/yc;
      let [r,g,b]=xyzToLinRGB(X,Y,Z);
      r=Math.max(0,r); g=Math.max(0,g); b=Math.max(0,b);
      const mx=Math.max(r,g,b,1e-9); r/=mx; g/=mx; b/=mx;
      d[idx]=Math.round(gammaEnc(r)*255); d[idx+1]=Math.round(gammaEnc(g)*255);
      d[idx+2]=Math.round(gammaEnc(b)*255); d[idx+3]=255;
    }
  }
  cv.getContext('2d').putImageData(imgData,0,0);
  cieCv=cv; cieW=W; cieH=H;
}

// ── Munsell wheel — precomputed offscreen canvas ──────────────────────────────
let munsellCv = null, munsellCvW = 0, munsellCvH = 0;

function buildMunsellCv(W, H) {
  if (W < 10 || H < 10) return;
  const dpr = window.devicePixelRatio || 1;
  const pw = Math.round(W*dpr), ph = Math.round(H*dpr);
  const cv = document.createElement('canvas'); cv.width=pw; cv.height=ph;
  const imgData = new ImageData(pw, ph); const d = imgData.data;

  // Wheel geometry (leave margin for labels)
  const margin = 20 * dpr;
  const maxR = Math.min(pw, ph) / 2 - margin;
  const cx = pw/2, cy = ph/2;
  const MAX_C = 14, V = 5; // fixed Munsell Value = 5

  for (let py=0; py<ph; py++) {
    for (let px=0; px<pw; px++) {
      const dx=px-cx, dy=py-cy, r=Math.sqrt(dx*dx+dy*dy);
      const idx=(py*pw+px)*4;
      if (r > maxR) { d[idx+3]=0; continue; }
      // angle → Munsell H: 5R at top (-π/2), clockwise
      const angle = Math.atan2(dy, dx);
      const mH = ((5 + (angle + Math.PI/2) / (2*Math.PI) * 100) % 100 + 100) % 100;
      const mC = (r/maxR) * MAX_C;
      if (mC < 0.4) {
        // Neutral achromatic center (grey at V=5)
        d[idx]=d[idx+1]=d[idx+2]=128; d[idx+3]=255; continue;
      }
      const [rr,gg,bb] = munsellToRGB(mH, V, mC);
      d[idx]=rr; d[idx+1]=gg; d[idx+2]=bb; d[idx+3]=255;
    }
  }
  cv.getContext('2d').putImageData(imgData,0,0);
  munsellCv=cv; munsellCvW=W; munsellCvH=H;
}

// ── Draw one half of simCanvas ────────────────────────────────────────────────
function drawHalf(ctx, ox, oy, W, H, mode) {
  const add = mode === 'additiva';
  const mx  = add ? allMixesAdd() : allMixesSub();
  ctx.save(); ctx.beginPath(); ctx.rect(ox,oy,W,H); ctx.clip();
  ctx.fillStyle = add ? '#000000' : '#ffffff'; ctx.fillRect(ox,oy,W,H);
  const cx=ox+W/2, cy=oy+H/2, R=Math.min(W,H)*0.34, d=R*0.52, S3=Math.sqrt(3)/2;
  const cens=[
    {x:cx,      y:cy-d,     c:mx.c1, lbl:add?'R':'C'},
    {x:cx-d*S3, y:cy+d*0.5, c:mx.c2, lbl:add?'G':'M'},
    {x:cx+d*S3, y:cy+d*0.5, c:mx.c3, lbl:add?'B':'Y'},
  ];
  ctx.globalCompositeOperation = add ? 'lighter' : 'multiply';
  cens.forEach(({x,y,c}) => {
    ctx.fillStyle=rgb(c); ctx.beginPath(); ctx.arc(x,y,R,0,Math.PI*2); ctx.fill();
  });
  ctx.globalCompositeOperation = 'source-over';
  ctx.font='bold 12px "Space Mono",monospace'; ctx.textAlign='center';
  cens.forEach(({x,y,c,lbl}) => {
    const lx=cx+(x-cx)*1.76, ly=oy+Math.max(16,Math.min(H-6,(cy-oy)+(y-cy)*1.76));
    ctx.fillStyle=add?rgb(c):'#555555'; ctx.fillText(lbl,lx,ly+5);
  });
  ctx.font='700 9px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillStyle=add?'rgba(255,255,255,0.40)':'rgba(0,0,0,0.30)';
  ctx.fillText(add?'ADDITIVA':'SOTTRATTIVA',cx,oy+13);
  const center=mx.c123, br=(center[0]*299+center[1]*587+center[2]*114)/1000;
  ctx.font='9px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillStyle=br>128?'rgba(0,0,0,0.50)':'rgba(255,255,255,0.50)';
  ctx.fillText(toHex(center),cx,cy+4);
  ctx.restore();
}

function drawScene() {
  const ctx=simCtx; ctx.clearRect(0,0,SW,SH);
  const half=Math.floor(SW/2);
  drawHalf(ctx,0,0,half,SH,'additiva');
  drawHalf(ctx,half,0,SW-half,SH,'sottrattiva');
  ctx.strokeStyle='rgba(0,212,255,0.30)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(half,0); ctx.lineTo(half,SH); ctx.stroke();
}

// ── CIE panel ─────────────────────────────────────────────────────────────────
function drawCiePanel(ctx, dk, ox, oy, pw, ph) {
  const PAD={t:22,b:28,l:36,r:8};
  const il=ox+PAD.l, it=oy+PAD.t, iw=pw-PAD.l-PAD.r, ih=ph-PAD.t-PAD.b;
  if(iw<10||ih<10) return;
  const c={ax:dk?'rgba(200,220,255,0.35)':'rgba(0,0,0,0.28)',tk:dk?'#6b8099':'#4a6278'};
  const X0=0.0,X1=0.80,Y0=0.0,Y1=0.90;
  const toC=(x,y)=>[il+(x-X0)/(X1-X0)*iw, it+ih-(y-Y0)/(Y1-Y0)*ih];

  ctx.fillStyle=dk?'#0b1018':'#f0f2f5'; ctx.fillRect(ox,oy,pw,ph);
  if(!cieCv||Math.abs(cieW-iw)>2||Math.abs(cieH-ih)>2) buildCieCv(iw,ih);
  if(!cieCv) return;
  ctx.fillStyle=dk?'#0b1018':'#d8dae0'; ctx.fillRect(il,it,iw,ih);
  ctx.drawImage(cieCv,il,it,iw,ih);

  // sRGB gamut triangle
  ctx.beginPath();
  [[0.6400,0.3300],[0.3000,0.6000],[0.1500,0.0600]].forEach(([x,y],i)=>{
    const [cx,cy]=toC(x,y); i?ctx.lineTo(cx,cy):ctx.moveTo(cx,cy);
  });
  ctx.closePath(); ctx.strokeStyle='rgba(255,255,255,0.55)'; ctx.lineWidth=1;
  ctx.setLineDash([3,3]); ctx.stroke(); ctx.setLineDash([]);

  const [wpx,wpy]=toC(0.3127,0.3290);
  ctx.fillStyle='white'; ctx.beginPath(); ctx.arc(wpx,wpy,2,0,Math.PI*2); ctx.fill();

  const mA=allMixesAdd().c123;
  const [ax,ay]=rgbToXY(mA[0],mA[1],mA[2]), [apx,apy]=toC(ax,ay);
  ctx.fillStyle=rgb(mA); ctx.strokeStyle='white'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.arc(apx,apy,5,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.font='700 8px "Space Mono",monospace'; ctx.fillStyle='white'; ctx.textAlign='left';
  ctx.fillText('A',apx+7,apy+3);

  const mS=allMixesSub().c123;
  const [sx,sy]=rgbToXY(mS[0],mS[1],mS[2]), [spx,spy]=toC(sx,sy);
  ctx.fillStyle=rgb(mS); ctx.strokeStyle=dk?'rgba(0,0,0,0.7)':'rgba(30,30,30,0.8)'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.arc(spx,spy,5,0,Math.PI*2); ctx.fill(); ctx.stroke();
  const sBr=(mS[0]*299+mS[1]*587+mS[2]*114)/1000;
  ctx.fillStyle=sBr>128?'#333':'white'; ctx.textAlign='left'; ctx.fillText('S',spx+7,spy+3);

  ctx.strokeStyle=c.ax; ctx.lineWidth=1; ctx.strokeRect(il,it,iw,ih);
  [0,0.2,0.4,0.6,0.8].forEach(xv=>{
    const gx=il+(xv-X0)/(X1-X0)*iw;
    ctx.strokeStyle=c.ax; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(gx,it+ih); ctx.lineTo(gx,it+ih+4); ctx.stroke();
    ctx.fillStyle=c.tk; ctx.font='700 8px "Space Mono",monospace'; ctx.textAlign='center';
    ctx.fillText(Lab.fmt(xv,1),gx,it+ih+14);
  });
  ctx.fillStyle=c.tk; ctx.textAlign='center'; ctx.fillText('x',il+iw/2,it+ih+26);
  [0,0.2,0.4,0.6,0.8].forEach(yv=>{
    const gy=it+ih-(yv-Y0)/(Y1-Y0)*ih; if(gy<it-1||gy>it+ih+1) return;
    ctx.strokeStyle=c.ax; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(il-4,gy); ctx.lineTo(il,gy); ctx.stroke();
    ctx.fillStyle=c.tk; ctx.font='700 8px "Space Mono",monospace'; ctx.textAlign='right';
    ctx.fillText(Lab.fmt(yv,1),il-6,gy+3);
  });
  ctx.save(); ctx.translate(ox+10,it+ih/2); ctx.rotate(-Math.PI/2);
  ctx.textAlign='center'; ctx.fillStyle=c.tk; ctx.font='700 8px "Space Mono",monospace';
  ctx.fillText('y',0,0); ctx.restore();
  ctx.font="10px 'Space Mono',monospace"; ctx.textAlign='center';
  ctx.fillStyle=dk?'rgba(200,220,255,0.50)':'rgba(40,60,100,0.50)';
  ctx.fillText('Diagramma CIE 1931  (A = additiva, S = sottrattiva)',ox+pw/2,oy+14);
}

// ── Complementary panel ───────────────────────────────────────────────────────
function drawComplementPanel(ctx, dk, ox, oy, pw, ph) {
  const PAD=8;
  const c={ax:dk?'rgba(200,220,255,0.35)':'rgba(0,0,0,0.28)',tk:dk?'#6b8099':'#4a6278'};
  ctx.fillStyle=dk?'#0b1018':'#f0f2f5'; ctx.fillRect(ox,oy,pw,ph);
  ctx.font="10px 'Space Mono',monospace"; ctx.textAlign='center';
  ctx.fillStyle=dk?'rgba(200,220,255,0.50)':'rgba(40,60,100,0.50)';
  ctx.fillText('Colori Complementari',ox+pw/2,oy+14);

  const mA=allMixesAdd().c123, mS=allMixesSub().c123;
  const rows=[
    {left:mA, right:[255-mA[0],255-mA[1],255-mA[2]], tag:'Additiva (A)'},
    {left:mS, right:[255-mS[0],255-mS[1],255-mS[2]], tag:'Sottrattiva (S)'},
  ];
  const available=ph-22-PAD*3, rowH=Math.max(10,Math.floor(available/2)-14);
  const colW=Math.floor((pw-PAD*3)/2);
  rows.forEach(({left,right,tag},ri)=>{
    const ry=oy+22+PAD+ri*(rowH+14+PAD);
    ctx.font='700 8px "Space Mono",monospace'; ctx.textAlign='left';
    ctx.fillStyle=c.tk; ctx.fillText(tag,ox+PAD,ry-2);
    [left,right].forEach((col,ci)=>{
      const rx=ox+PAD+ci*(colW+PAD);
      ctx.fillStyle=rgb(col); ctx.fillRect(rx,ry,colW,rowH);
      ctx.strokeStyle=c.ax; ctx.lineWidth=1; ctx.strokeRect(rx,ry,colW,rowH);
      ctx.font='700 8px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillStyle=c.tk;
      ctx.fillText(ci===0?'Colore':'Compl.',rx+colW/2,ry+rowH+10);
      ctx.fillText(toHex(col),rx+colW/2,ry+rowH+20);
    });
  });
}

// ── Munsell panel ─────────────────────────────────────────────────────────────
const MUNSELL_HNAMES = ['R','YR','Y','GY','G','BG','B','PB','P','RP'];

function munsellHueName(mH) {
  mH = ((mH % 100) + 100) % 100;
  const sec = Math.floor(mH / 10) % 10;
  const step = mH % 10;
  return step.toFixed(0) + MUNSELL_HNAMES[sec];
}

function drawMunsellPanel(ctx, dk, ox, oy, pw, ph) {
  const c={ax:dk?'rgba(200,220,255,0.35)':'rgba(0,0,0,0.28)',tk:dk?'#6b8099':'#4a6278'};
  ctx.fillStyle=dk?'#0b1018':'#f0f2f5'; ctx.fillRect(ox,oy,pw,ph);

  // Title
  ctx.font="10px 'Space Mono',monospace"; ctx.textAlign='center';
  ctx.fillStyle=dk?'rgba(200,220,255,0.50)':'rgba(40,60,100,0.50)';
  ctx.fillText('Sistema Munsell — Ruota H-C a V=5  (A = additiva, S = sottrattiva)', ox+pw/2, oy+14);

  // Layout: wheel on left, value scale + HVC readout on right
  const LABEL_W = 120;
  const wheelArea = pw - LABEL_W;
  const margin = 20;
  const maxR = Math.min(wheelArea/2 - margin, (ph-40)/2 - margin);
  const cx = ox + wheelArea/2;
  const cy = oy + ph/2 + 5;

  // Build wheel image if needed
  const wW = Math.round(wheelArea), wH = Math.round(ph - 20);
  if (!munsellCv || Math.abs(munsellCvW-wW)>2 || Math.abs(munsellCvH-wH)>2) buildMunsellCv(wW, wH);
  if (munsellCv) ctx.drawImage(munsellCv, ox, oy+10, wW, wH);

  // Outer ring border
  ctx.strokeStyle = c.ax; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, maxR, 0, Math.PI*2); ctx.stroke();

  // Radial chroma ticks (at C=4, 8, 12)
  [4, 8, 12].forEach(C => {
    const r = (C/14) * maxR;
    ctx.strokeStyle = dk?'rgba(255,255,255,0.12)':'rgba(0,0,0,0.10)'; ctx.lineWidth=1;
    ctx.setLineDash([2,3]);
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font='700 7px "Space Mono",monospace'; ctx.fillStyle=c.tk; ctx.textAlign='left';
    ctx.fillText('C='+C, cx+r+3, cy+3);
  });

  // Hue labels at rim (10 principal hues)
  const labelR = maxR + 14;
  ctx.font='700 9px "Space Mono",monospace';
  MUNSELL_HNAMES.forEach((name, i) => {
    const mH = i*10 + 5; // 5R, 5YR, ... 5RP
    const angle = -Math.PI/2 + (mH-5)/100*2*Math.PI;
    const lx = cx + labelR*Math.cos(angle);
    const ly = cy + labelR*Math.sin(angle);
    ctx.fillStyle = c.tk; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('5'+name, lx, ly);
  });
  ctx.textBaseline='alphabetic';

  // Central neutral dot label
  ctx.font='700 8px "Space Mono",monospace'; ctx.fillStyle=dk?'#aaa':'#555'; ctx.textAlign='center';
  ctx.fillText('N', cx, cy+3);

  // Value scale strip (right side)
  const scX = ox + wheelArea + 10;
  const scW = LABEL_W - 20;
  const scY = oy + 25;
  const scH = ph - 50;
  const N_V = 20;
  for (let vi=0; vi<N_V; vi++) {
    const V = (1 - vi/N_V) * 10; // top=V10 (white), bottom=V0 (black)
    const vy = scY + vi/N_V*scH;
    const vh = scH/N_V + 1;
    // Use neutral grey for the scale
    const lum = Math.round(V/10*255);
    ctx.fillStyle = `rgb(${lum},${lum},${lum})`;
    ctx.fillRect(scX, vy, scW/2-2, vh);
    // Right half: use hue of A at this value
    const mA=allMixesAdd().c123;
    const [mHA] = rgbToMunsell(mA[0],mA[1],mA[2]);
    const [cr,cg,cb] = munsellToRGB(mHA, V, 8);
    ctx.fillStyle=`rgb(${cr},${cg},${cb})`;
    ctx.fillRect(scX+scW/2, vy, scW/2-2, vh);
  }
  ctx.strokeStyle=c.ax; ctx.lineWidth=1; ctx.strokeRect(scX,scY,scW-4,scH);
  // Scale labels
  ctx.font='700 7px "Space Mono",monospace'; ctx.textAlign='left'; ctx.fillStyle=c.tk;
  ctx.fillText('V10',scX+scW-2,scY+6);
  ctx.fillText('V0', scX+scW-2,scY+scH);
  ctx.fillText('V5', scX+scW-2,scY+scH/2+3);
  ctx.save(); ctx.translate(scX-8,scY+scH/2); ctx.rotate(-Math.PI/2);
  ctx.textAlign='center'; ctx.fillText('Valore',0,0); ctx.restore();

  // Plot A point in the wheel
  const mA=allMixesAdd().c123;
  const [mHA,mVA,mCA] = rgbToMunsell(mA[0],mA[1],mA[2]);
  const aAngle=-Math.PI/2+(mHA-5)/100*2*Math.PI;
  const aR=Math.min(mCA/14,1)*maxR;
  const apx=cx+aR*Math.cos(aAngle), apy=cy+aR*Math.sin(aAngle);
  ctx.fillStyle=rgb(mA); ctx.strokeStyle='white'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.arc(apx,apy,5,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.font='700 8px "Space Mono",monospace'; ctx.fillStyle='white'; ctx.textAlign='left';
  ctx.fillText('A',apx+7,apy+3);

  // Plot S point in the wheel
  const mS=allMixesSub().c123;
  const [mHS,mVS,mCS]=rgbToMunsell(mS[0],mS[1],mS[2]);
  const sAngle=-Math.PI/2+(mHS-5)/100*2*Math.PI;
  const sR=Math.min(mCS/14,1)*maxR;
  const spx=cx+sR*Math.cos(sAngle), spy=cy+sR*Math.sin(sAngle);
  ctx.fillStyle=rgb(mS); ctx.strokeStyle=dk?'rgba(0,0,0,0.7)':'rgba(30,30,30,0.8)'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.arc(spx,spy,5,0,Math.PI*2); ctx.fill(); ctx.stroke();
  const sBr=(mS[0]*299+mS[1]*587+mS[2]*114)/1000;
  ctx.fillStyle=sBr>128?'#333':'white'; ctx.textAlign='left'; ctx.fillText('S',spx+7,spy+3);

  // HVC readout text
  const ryBase = oy + ph - 44;
  ctx.font='700 8px "Space Mono",monospace'; ctx.fillStyle=c.tk;
  ctx.textAlign='left';
  ctx.fillText('A: '+munsellHueName(mHA)+' V'+Lab.fmt(mVA,1)+'/C'+Lab.fmt(mCA,1), ox+4, ryBase);
  ctx.fillText('S: '+munsellHueName(mHS)+' V'+Lab.fmt(mVS,1)+'/C'+Lab.fmt(mCS,1), ox+4, ryBase+13);

  // Separator line between wheel area and value scale
  ctx.strokeStyle=dk?'rgba(0,212,255,0.08)':'rgba(0,100,160,0.10)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(ox+wheelArea,oy); ctx.lineTo(ox+wheelArea,oy+ph); ctx.stroke();
}

// ── Draw graphs (tre pannelli allineati orizzontalmente) ─────────────────────
function drawGraphs() {
  const ctx=grCtx, dk=isDark();
  ctx.clearRect(0,0,GW,GH);
  ctx.fillStyle=dk?'#0b1018':'#f0f2f5'; ctx.fillRect(0,0,GW,GH);

  const w1 = Math.floor(GW * 0.36); // CIE 1931
  const w2 = Math.floor(GW * 0.20); // Complementari
  const w3 = GW - w1 - w2;          // Munsell

  drawCiePanel(ctx, dk, 0, 0, w1, GH);
  drawComplementPanel(ctx, dk, w1, 0, w2, GH);
  drawMunsellPanel(ctx, dk, w1+w2, 0, w3, GH);

  const sep = dk?'rgba(0,212,255,0.08)':'rgba(0,100,160,0.10)';
  ctx.strokeStyle=sep; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(w1,0); ctx.lineTo(w1,GH); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w1+w2,0); ctx.lineTo(w1+w2,GH); ctx.stroke();
}

// ── Readout ───────────────────────────────────────────────────────────────────
const rdout = new Lab.Readout(document.getElementById('readout'), [
  { key:'a_rgb', label:'centro additivo (RGB)'    },
  { key:'a_hex', label:'codice esadecimale'       },
  { key:'s_rgb', label:'centro sottrattivo (RGB)' },
  { key:'s_hex', label:'codice esadecimale'       },
]);
function updateReadout() {
  const a=allMixesAdd().c123, s=allMixesSub().c123;
  rdout.set('a_rgb',`rgb(${a[0]},${a[1]},${a[2]})`); rdout.set('a_hex',toHex(a));
  rdout.set('s_rgb',`rgb(${s[0]},${s[1]},${s[2]})`); rdout.set('s_hex',toHex(s));
}

// ── Controls ──────────────────────────────────────────────────────────────────
function refresh() { drawScene(); drawGraphs(); updateReadout(); }

function buildControls() {
  const cont=document.getElementById('controls'); cont.innerHTML='';
  const secA=Lab.Section('Sintesi Additiva (luce)');
  secA
    .add(Lab.SliderInput({label:'Intensità rosso R',  min:0,max:1,value:params.iR,step:0.01,unit:'', onChange:v=>{params.iR=v;refresh();}}))
    .add(Lab.SliderInput({label:'Intensità verde G',  min:0,max:1,value:params.iG,step:0.01,unit:'', onChange:v=>{params.iG=v;refresh();}}))
    .add(Lab.SliderInput({label:'Intensità blu B',    min:0,max:1,value:params.iB,step:0.01,unit:'', onChange:v=>{params.iB=v;refresh();}}));
  const secS=Lab.Section('Sintesi Sottrattiva (pigmenti)');
  secS
    .add(Lab.SliderInput({label:'Densità ciano C',   min:0,max:1,value:params.iC,step:0.01,unit:'', onChange:v=>{params.iC=v;refresh();}}))
    .add(Lab.SliderInput({label:'Densità magenta M', min:0,max:1,value:params.iM,step:0.01,unit:'', onChange:v=>{params.iM=v;refresh();}}))
    .add(Lab.SliderInput({label:'Densità giallo Y',  min:0,max:1,value:params.iY,step:0.01,unit:'', onChange:v=>{params.iY=v;refresh();}}));
  const actions=document.createElement('div'); actions.className='panel-actions';
  const btnR=document.createElement('button'); btnR.className='btn-secondary'; btnR.textContent='↺  RESET';
  btnR.addEventListener('click',()=>{ params.iR=params.iG=params.iB=params.iC=params.iM=params.iY=1.0; buildControls(); refresh(); });
  actions.appendChild(btnR);
  cont.appendChild(secA.el); cont.appendChild(secS.el); cont.appendChild(actions);
}

// ── Init ──────────────────────────────────────────────────────────────────────
Lab.initTheme();
buildControls();
new ResizeObserver(()=>{ resize(); refresh(); }).observe(simCv.parentElement);
new MutationObserver(()=>{ refresh(); }).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
resize(); refresh();
