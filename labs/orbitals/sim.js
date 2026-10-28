'use strict';

// ═══ Element data (Z = 1..118) ═══════════════════════════════════════════════
const SYMBOLS = ['H','He','Li','Be','B','C','N','O','F','Ne','Na','Mg','Al','Si','P','S','Cl','Ar','K','Ca','Sc','Ti','V','Cr','Mn','Fe','Co','Ni','Cu','Zn','Ga','Ge','As','Se','Br','Kr','Rb','Sr','Y','Zr','Nb','Mo','Tc','Ru','Rh','Pd','Ag','Cd','In','Sn','Sb','Te','I','Xe','Cs','Ba','La','Ce','Pr','Nd','Pm','Sm','Eu','Gd','Tb','Dy','Ho','Er','Tm','Yb','Lu','Hf','Ta','W','Re','Os','Ir','Pt','Au','Hg','Tl','Pb','Bi','Po','At','Rn','Fr','Ra','Ac','Th','Pa','U','Np','Pu','Am','Cm','Bk','Cf','Es','Fm','Md','No','Lr','Rf','Db','Sg','Bh','Hs','Mt','Ds','Rg','Cn','Nh','Fl','Mc','Lv','Ts','Og'];
const NAMES = ['Idrogeno','Elio','Litio','Berillio','Boro','Carbonio','Azoto','Ossigeno','Fluoro','Neon','Sodio','Magnesio','Alluminio','Silicio','Fosforo','Zolfo','Cloro','Argon','Potassio','Calcio','Scandio','Titanio','Vanadio','Cromo','Manganese','Ferro','Cobalto','Nichel','Rame','Zinco','Gallio','Germanio','Arsenico','Selenio','Bromo','Kripton','Rubidio','Stronzio','Ittrio','Zirconio','Niobio','Molibdeno','Tecnezio','Rutenio','Rodio','Palladio','Argento','Cadmio','Indio','Stagno','Antimonio','Tellurio','Iodio','Xeno','Cesio','Bario','Lantanio','Cerio','Praseodimio','Neodimio','Promezio','Samario','Europio','Gadolinio','Terbio','Disprosio','Olmio','Erbio','Tulio','Itterbio','Lutezio','Afnio','Tantalio','Tungsteno','Renio','Osmio','Iridio','Platino','Oro','Mercurio','Tallio','Piombo','Bismuto','Polonio','Astato','Radon','Francio','Radio','Attinio','Torio','Protoattinio','Uranio','Nettunio','Plutonio','Americio','Curio','Berkelio','Californio','Einsteinio','Fermio','Mendelevio','Nobelio','Laurenzio','Rutherfordio','Dubnio','Seaborgio','Bohrio','Hassio','Meitnerio','Darmstadtio','Roentgenio','Copernicio','Nihonio','Flerovio','Moscovio','Livermorio','Tennesso','Oganesson'];

// Aufbau (Madelung) subshell order, capacity 2(2l+1)
const AUFBAU = [
  [1,0],[2,0],[2,1],[3,0],[3,1],[4,0],[3,2],[4,1],[5,0],[4,2],[5,1],
  [6,0],[4,3],[5,2],[6,1],[7,0],[5,3],[6,2],[7,1],
];
const L_LABEL = ['s','p','d','f','g'];
const SUP = {'0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹'};
function sup(n){ return String(n).split('').map(c=>SUP[c]).join(''); }

// Riempie gli elettroni → lista subshell occupate { n, l, count }
function electronConfig(Z) {
  const out = [];
  let left = Z;
  for (const [n,l] of AUFBAU) {
    if (left <= 0) break;
    const cap = 2*(2*l+1);
    const c = Math.min(cap, left);
    out.push({ n, l, count: c });
    left -= c;
  }
  return out;
}

function configString(cfg) {
  return cfg.map(s => `${s.n}${L_LABEL[s.l]}${sup(s.count)}`).join(' ');
}

// ═══ Hydrogenic radial wavefunction R_nl(r) (a₀ = 1, Z = 1) ═══════════════════
// Generalized Laguerre L_k^a(x) via recurrence
function laguerre(k, a, x) {
  if (k === 0) return 1;
  if (k === 1) return 1 + a - x;
  let Lm1 = 1, L0 = 1 + a - x;
  for (let m = 1; m < k; m++) {
    const L1 = ((2*m + 1 + a - x)*L0 - (m + a)*Lm1) / (m + 1);
    Lm1 = L0; L0 = L1;
  }
  return L0;
}
function factorial(n){ let f=1; for(let i=2;i<=n;i++) f*=i; return f; }

function R_nl(n, l, r) {
  const rho = 2*r/n;
  const norm = Math.sqrt((2/n)**3 * factorial(n-l-1) / (2*n*factorial(n+l)));
  return norm * Math.exp(-rho/2) * Math.pow(rho, l) * laguerre(n-l-1, 2*l+1, rho);
}

// ═══ Real Cartesian spherical harmonics (proportional), unit dir (x,y,z) ═══════
function angular(l, m, x, y, z) {
  switch (l) {
    case 0: return 0.282095;
    case 1:
      if (m === -1) return y;
      if (m ===  0) return z;
      return x;
    case 2:
      if (m === -2) return x*y;
      if (m === -1) return y*z;
      if (m ===  0) return 3*z*z - 1;
      if (m ===  1) return x*z;
      return x*x - y*y;
    case 3:
      if (m === -3) return y*(3*x*x - y*y);
      if (m === -2) return x*y*z;
      if (m === -1) return y*(5*z*z - 1);
      if (m ===  0) return z*(5*z*z - 3);
      if (m ===  1) return x*(5*z*z - 1);
      if (m ===  2) return z*(x*x - y*y);
      return x*(x*x - 3*y*y);
  }
  return 0;
}
// Etichette orbitali p/d/f per (l,m)
const ORB_NAME = {
  '1,-1':'pᵧ','1,0':'p_z','1,1':'pₓ',
  '2,-2':'d_xy','2,-1':'d_yz','2,0':'d_z²','2,1':'d_xz','2,2':'d_x²−y²',
  '3,-3':'f_y(3x²−y²)','3,-2':'f_xyz','3,-1':'f_yz²','3,0':'f_z³','3,1':'f_xz²','3,2':'f_z(x²−y²)','3,3':'f_x(x²−3y²)',
};
function orbName(n,l,m){ return l===0 ? `${n}s` : `${n}${(ORB_NAME[`${l},${m}`]||'').replace('_','')}`; }

// ═══ Stato ════════════════════════════════════════════════════════════════════
const P = {
  Z: 6,            // elemento (carbonio)
  n: 2, l: 1, m: 0, s: +1,
  view: '3d-points',   // '3d-points' | '3d-volume' | '2d'
  plane: 'xz',     // piano sezione 2D
  points: 9000,
};
const VIEW_LABELS = { '3d-points':'3D (punti)', '3d-volume':'3D (superfici)', '2d':'2D (sezioni)' };

let rotX = -0.35, rotY = 0.6;
let dragging = false, lastX = 0, lastY = 0;
let cloudDirty = true, sliceDirty = true;

// Point cloud
let cloud = null;        // { x:Float32Array, y, z, sign:Int8Array, rmax }
const offCV = document.createElement('canvas');
offCV.width = 360; offCV.height = 360;
const offCtx = offCV.getContext('2d');

let gCanvas=[null,null,null], gCtx=[null,null,null];
let readout;

// ═══ Palette theme-aware ══════════════════════════════════════════════════════
function dk(){ return document.documentElement.dataset.theme !== 'light'; }
function pal(){
  const d = dk();
  return {
    canvasBg: d ? '#06090f' : '#e7edf4',
    gBg:      d ? 'rgb(3,9,22)' : '#eef2f7',
    gAxis:    d ? 'rgba(100,155,210,0.26)' : 'rgba(40,80,130,0.30)',
    gText:    d ? 'rgba(150,205,225,0.88)' : 'rgba(25,65,105,0.92)',
    gCurve:   d ? 'rgba(0,210,255,0.9)' : 'rgba(0,115,185,0.95)',
    gNode:    d ? 'rgba(255,200,80,0.95)' : 'rgba(205,125,0,0.95)',
    posRGB:   d ? [60,180,255] : [20,90,205],   // fase +
    negRGB:   d ? [255,140,50] : [210,80,0],     // fase −
    isoAlpha: d ? 0.28 : 0.36,
    hudBg:    d ? 'rgba(4,10,22,0.58)' : 'rgba(244,248,252,0.85)',
    accent:   d ? '#00d4ff' : '#0a78b0',
    accentHi: d ? '#00e6ff' : '#0a78b0',
    txt:      d ? 'rgba(210,232,250,0.95)' : 'rgba(20,45,75,0.95)',
    sub:      d ? 'rgba(170,200,225,0.8)' : 'rgba(60,95,130,0.88)',
    tokOff:   d ? 'rgba(165,200,225,0.85)' : 'rgba(70,100,135,0.88)',
    boxLine:  d ? 'rgba(120,150,190,0.5)' : 'rgba(90,120,160,0.7)',
    arrowUp:  d ? 'rgba(255,210,90,0.95)' : 'rgba(205,135,0,0.95)',
    arrowDn:  d ? 'rgba(120,200,255,0.95)' : 'rgba(0,120,200,0.95)',
    hint:     d ? 'rgba(150,180,210,0.5)' : 'rgba(70,100,135,0.75)',
    axisLab:  d ? 'rgba(180,200,220,0.6)' : 'rgba(55,90,125,0.85)',
    axisLine: d ? '#aabbcc' : '#5a7088',
  };
}
let T = pal();

// ═══ Costruzione nuvola 3D (sampling da |ψ|²) ═════════════════════════════════
function buildCloud() {
  const { n, l, m } = P;
  const rmax = n*n*2.2 + 6;

  // CDF radiale P(r) = R²·r²
  const NR = 500;
  const pdf = new Float32Array(NR), cdf = new Float32Array(NR);
  let acc = 0;
  for (let i = 0; i < NR; i++) {
    const r = (i+0.5)/NR*rmax;
    const R = R_nl(n,l,r);
    pdf[i] = R*R*r*r;
    acc += pdf[i];
    cdf[i] = acc;
  }
  for (let i = 0; i < NR; i++) cdf[i] /= acc;

  // max |Y|² per rejection direzionale
  let maxY2 = 0;
  for (let s = 0; s < 4000; s++) {
    const u = Math.random()*2-1, ph = Math.random()*Math.PI*2;
    const sx = Math.sqrt(1-u*u);
    const A = angular(l,m, sx*Math.cos(ph), sx*Math.sin(ph), u);
    if (A*A > maxY2) maxY2 = A*A;
  }
  maxY2 *= 1.02;

  const N = P.points;
  const X = new Float32Array(N), Y = new Float32Array(N), Zc = new Float32Array(N);
  const SG = new Int8Array(N);

  let idx = 0, guard = 0;
  while (idx < N && guard < N*60) {
    guard++;
    // r da inverse-CDF
    const t = Math.random();
    let lo=0, hi=NR-1;
    while (lo < hi) { const mid=(lo+hi)>>1; if (cdf[mid] < t) lo=mid+1; else hi=mid; }
    const r = (lo+0.5)/NR*rmax;

    // direzione da rejection su |Y|²
    const u = Math.random()*2-1, ph = Math.random()*Math.PI*2;
    const sxy = Math.sqrt(1-u*u);
    const dx = sxy*Math.cos(ph), dy = sxy*Math.sin(ph), dz = u;
    const A = angular(l,m,dx,dy,dz);
    if (A*A < Math.random()*maxY2) continue;

    const Rsign = Math.sign(R_nl(n,l,r)) || 1;
    X[idx] = dx*r; Y[idx] = dy*r; Zc[idx] = dz*r;
    SG[idx] = (Rsign * Math.sign(A) >= 0) ? 1 : -1;
    idx++;
  }

  cloud = { x:X, y:Y, z:Zc, sign:SG, count:idx, rmax };
  cloudDirty = false;
}

// ═══ Sezione 2D |ψ|² ══════════════════════════════════════════════════════════
function buildSlice() {
  const { n, l, m, plane } = P;
  const W = offCV.width, H = offCV.height, cx = W/2, cy = H/2;
  const rmax = n*n*2.2 + 6;
  const scale = (W*0.47)/rmax;

  const img = offCtx.createImageData(W, H);
  const d = img.data;
  const vals = new Float32Array(W*H);
  const sgn  = new Int8Array(W*H);
  let maxV = 0;

  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const a = (px - cx)/scale;     // ascissa piano
      const b = -(py - cy)/scale;    // ordinata piano
      let X,Yc,Zc;
      if (plane === 'xz') { X=a; Yc=0; Zc=b; }
      else if (plane === 'xy') { X=a; Yc=b; Zc=0; }
      else { X=0; Yc=a; Zc=b; }      // yz
      const r = Math.sqrt(X*X+Yc*Yc+Zc*Zc) || 1e-6;
      const R = R_nl(n,l,r);
      const A = angular(l,m, X/r, Yc/r, Zc/r);
      const psi = R*A;
      const v = psi*psi;
      vals[py*W+px] = v;
      sgn[py*W+px]  = psi >= 0 ? 1 : -1;
      if (v > maxV) maxV = v;
    }
  }
  if (maxV < 1e-30) maxV = 1;

  for (let i = 0; i < W*H; i++) {
    const t = Math.pow(vals[i]/maxV, 0.40);
    const o = i*4;
    if (sgn[i] >= 0) { d[o]=Math.round(t*60); d[o+1]=Math.round(t*200); d[o+2]=255; }
    else             { d[o]=255; d[o+1]=Math.round(t*150); d[o+2]=Math.round(t*60); }
    d[o+3] = Math.round(t*255);
  }
  offCtx.clearRect(0,0,W,H);
  offCtx.putImageData(img,0,0);
  sliceDirty = false;
}

// ═══ Rendering canvas ════════════════════════════════════════════════════════
function draw(canvas) {
  const [ctx, W, H] = Lab.ctx2d(canvas);
  ctx.fillStyle = T.canvasBg;
  ctx.fillRect(0,0,W,H);

  if      (P.view === '2d')        draw2D(ctx, W, H);
  else if (P.view === '3d-volume') draw3DIso(ctx, W, H);
  else                             draw3D(ctx, W, H);

  drawHUD(ctx, W, H);
}

function rotPt(x,y,z,cosX,sinX,cosY,sinY){
  const x1 = x*cosY - z*sinY;
  const z1 = x*sinY + z*cosY;
  const y1 = y*cosX - z1*sinX;
  const z2 = y*sinX + z1*cosX;
  return [x1, y1, z2];
}

function draw3D(ctx, W, H) {
  if (cloudDirty) buildCloud();
  const cx = W/2, cy = H/2;
  const scale = Math.min(W,H)*0.42 / cloud.rmax;
  const cosX=Math.cos(rotX), sinX=Math.sin(rotX);
  const cosY=Math.cos(rotY), sinY=Math.sin(rotY);

  const { x, y, z, sign, count } = cloud;
  const depth = new Float32Array(count), px = new Float32Array(count), py = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const [x1,y1,z2] = rotPt(x[i],y[i],z[i],cosX,sinX,cosY,sinY);
    depth[i] = z2; px[i] = cx + x1*scale; py[i] = cy - y1*scale;
  }
  const order = new Int32Array(count);
  for (let i = 0; i < count; i++) order[i] = i;
  order.sort((a,b)=>depth[a]-depth[b]);
  for (let k = 0; k < count; k++) {
    const i = order[k];
    const dn = (depth[i]/cloud.rmax + 1)*0.5;
    const alpha = (dk()?0.12:0.22) + dn*0.45;
    const rad = 0.7 + dn*1.6;
    const c = sign[i] >= 0 ? T.posRGB : T.negRGB;
    ctx.fillStyle = `rgba(${c[0]},${Math.round(c[1]+dn*55)},${c[2]},${alpha})`;
    ctx.beginPath(); ctx.arc(px[i], py[i], rad, 0, Math.PI*2); ctx.fill();
  }
  draw3DAxes(ctx, cx, cy, scale*cloud.rmax*0.85, cosX,sinX,cosY,sinY);
}

// ─── Isosuperficie |ψ|² = soglia → forma 3D dei lobi ──────────────────────────
let iso = null, isoKey = '';
function psiVal(n,l,m,x,y,z){
  const r = Math.sqrt(x*x+y*y+z*z) || 1e-6;
  return R_nl(n,l,r) * angular(l,m, x/r, y/r, z/r);
}
function buildIso() {
  const { n, l, m } = P;
  const rmax = n*n*2.4 + 6;

  // max |ψ|² su griglia raggi×direzioni grezza
  // Isovalore = superficie di contorno che racchiude il 90% della probabilità.
  // (un semplice frazione-del-massimo cancellerebbe i gusci esterni degli orbitali s,
  //  dove il picco vicino al nucleo domina.)
  const NDc = 240, NRc = 200;
  const dr = rmax/NRc;
  const fs = [], ws = [];
  let total = 0;
  for (let d = 0; d < NDc; d++) {
    const yy = 1 - 2*(d+0.5)/NDc;
    const rad = Math.sqrt(Math.max(0,1-yy*yy));
    const th = d*2.39996323;
    const dx = rad*Math.cos(th), dy = rad*Math.sin(th), dz = yy;
    for (let ir = 1; ir < NRc; ir++) {
      const r = ir*dr;
      const v = R_nl(n,l,r)*angular(l,m,dx,dy,dz);
      const f = v*v;
      const w = f * r*r;     // peso = densità × elemento di volume (dΩ,dr costanti)
      fs.push(f); ws.push(w); total += w;
    }
  }
  // ordina per densità decrescente, cumula fino al 90% → isovalore
  const idx = Array.from(fs.keys()).sort((a,b)=>fs[b]-fs[a]);
  let acc = 0, thresh = 0;
  for (const i of idx) { acc += ws[i]; if (acc >= 0.90*total) { thresh = fs[i]; break; } }
  if (thresh <= 0) thresh = 1e-9;

  // Fibonacci sphere direzioni — numero legato allo slider densità
  const NDIR = Math.max(800, Math.round(P.points*0.42)), NRm = 320;
  const GA = Math.PI*(3-Math.sqrt(5));
  const X=[],Y=[],Z=[],NXa=[],NYa=[],NZa=[],SG=[];
  const eps = rmax*0.012;

  for (let d = 0; d < NDIR; d++) {
    const yy = 1 - 2*(d+0.5)/NDIR;
    const rad = Math.sqrt(Math.max(0,1-yy*yy));
    const th = d*GA;
    const dx = rad*Math.cos(th), dy = rad*Math.sin(th), dz = yy;

    // marcia in r, trova attraversamenti di (ψ²-thresh)
    const psi0 = R_nl(n,l,1e-4)*angular(l,m,dx,dy,dz);
    let prevV = psi0*psi0 - thresh, prevR = 0;
    for (let ir = 1; ir <= NRm; ir++) {
      const r = ir/NRm*rmax;
      const psi = R_nl(n,l,r)*angular(l,m,dx,dy,dz);
      const f = psi*psi - thresh;
      if (prevV < 0 && f >= 0 || prevV >= 0 && f < 0) {
        // interpola r del crossing
        const t = prevV/(prevV - f);
        const rc = prevR + (r-prevR)*t;
        const X0=dx*rc, Y0=dy*rc, Z0=dz*rc;
        // normale = -grad(ψ²)
        const fx = psiSq(n,l,m,X0+eps,Y0,Z0)-psiSq(n,l,m,X0-eps,Y0,Z0);
        const fy = psiSq(n,l,m,X0,Y0+eps,Z0)-psiSq(n,l,m,X0,Y0-eps,Z0);
        const fz = psiSq(n,l,m,X0,Y0,Z0+eps)-psiSq(n,l,m,X0,Y0,Z0-eps);
        let nx=-fx, ny=-fy, nz=-fz;
        const nl=Math.hypot(nx,ny,nz)||1; nx/=nl; ny/=nl; nz/=nl;
        X.push(X0); Y.push(Y0); Z.push(Z0);
        NXa.push(nx); NYa.push(ny); NZa.push(nz);
        SG.push(psiVal(n,l,m,X0,Y0,Z0) >= 0 ? 1 : -1);
      }
      prevV = f; prevR = r;
    }
  }
  iso = {
    x:Float32Array.from(X), y:Float32Array.from(Y), z:Float32Array.from(Z),
    nx:Float32Array.from(NXa), ny:Float32Array.from(NYa), nz:Float32Array.from(NZa),
    sign:Int8Array.from(SG), count:X.length, rmax,
  };
  isoKey = `${n},${l},${m},${P.points}`;
}
function psiSq(n,l,m,x,y,z){ const v=psiVal(n,l,m,x,y,z); return v*v; }

function draw3DIso(ctx, W, H) {
  if (!iso || isoKey !== `${P.n},${P.l},${P.m},${P.points}`) buildIso();
  const cx=W/2, cy=H/2;
  const scale = Math.min(W,H)*0.42 / iso.rmax;
  const cosX=Math.cos(rotX), sinX=Math.sin(rotX);
  const cosY=Math.cos(rotY), sinY=Math.sin(rotY);
  const { x,y,z,nx,ny,nz,sign,count } = iso;

  // luce in spazio schermo
  const Lx=-0.4, Ly=0.55, Lz=0.74;

  const depth=new Float32Array(count), shade=new Float32Array(count);
  const px=new Float32Array(count), py=new Float32Array(count);
  const order=new Int32Array(count);
  for (let i=0;i<count;i++){
    const [x1,y1,z2]=rotPt(x[i],y[i],z[i],cosX,sinX,cosY,sinY);
    px[i]=cx+x1*scale; py[i]=cy-y1*scale; depth[i]=z2; order[i]=i;
    const [rnx,rny,rnz]=rotPt(nx[i],ny[i],nz[i],cosX,sinX,cosY,sinY);
    const diff=Math.max(0, rnx*Lx+rny*Ly+rnz*Lz);
    shade[i]=0.28 + 0.72*diff;   // ambient + diffuse
  }
  order.sort((a,b)=>depth[a]-depth[b]);   // back-to-front

  const sz = 3.0 + scale*0.22;
  for (let k=0;k<count;k++){
    const i=order[k];
    const s=shade[i];
    const c = sign[i]>=0 ? T.posRGB : T.negRGB;
    const r=Math.min(255,c[0]*s+20), g=Math.min(255,c[1]*s+22), b=Math.min(255,c[2]*s+20);
    // tutte le superfici semitrasparenti → interno sempre visibile
    ctx.fillStyle=`rgba(${r|0},${g|0},${b|0},${T.isoAlpha})`;
    ctx.beginPath(); ctx.arc(px[i],py[i],sz,0,Math.PI*2); ctx.fill();
  }
  draw3DAxes(ctx, cx, cy, scale*iso.rmax*0.85, cosX,sinX,cosY,sinY);
}


function draw3DAxes(ctx, cx, cy, len, cosX,sinX,cosY,sinY) {
  const axes = [[1,0,0,'x','rgba(255,90,90,0.6)'],[0,1,0,'y','rgba(90,255,140,0.6)'],[0,0,1,'z','rgba(120,170,255,0.6)']];
  for (const [ax,ay,az,lbl,col] of axes) {
    const x1 = ax*cosY - az*sinY;
    const z1 = ax*sinY + az*cosY;
    const y1 = ay*cosX - z1*sinX;
    const ex = cx + x1*len, ey = cy - y1*len;
    ctx.strokeStyle=col; ctx.lineWidth=1; ctx.globalAlpha=0.5;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(ex,ey); ctx.stroke();
    ctx.globalAlpha=1; ctx.fillStyle=col; ctx.font='10px "Space Mono",monospace';
    ctx.fillText(lbl, ex+2, ey+2);
  }
}

function draw2D(ctx, W, H) {
  if (sliceDirty) buildSlice();
  const cx=W/2, cy=H/2, R=Math.min(W,H)*0.46;
  const size = R*2;
  ctx.drawImage(offCV, cx-size/2, cy-size/2, size, size);

  // assi
  ctx.save(); ctx.globalAlpha=0.32; ctx.strokeStyle=T.axisLine; ctx.lineWidth=0.6; ctx.setLineDash([3,5]);
  ctx.beginPath(); ctx.moveTo(cx-R,cy); ctx.lineTo(cx+R,cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx,cy-R); ctx.lineTo(cx,cy+R); ctx.stroke();
  ctx.restore();
  const ax = { xz:['x','z'], xy:['x','y'], yz:['y','z'] }[P.plane];
  ctx.fillStyle=T.axisLab; ctx.font='11px "Space Mono",monospace';
  ctx.fillText(ax[0], cx+R-12, cy-6); ctx.fillText(ax[1], cx+8, cy-R+14);
}

// HUD su canvas: dati elemento (sx) + numeri quantici (dx) + hint (basso)
function drawHUD(ctx, W, H) {
  const cfg = electronConfig(P.Z);
  const period = Math.max(...cfg.map(s=>s.n));
  const block  = L_LABEL[cfg[cfg.length-1].l];
  const valence = cfg.filter(s=>s.n===period).reduce((a,s)=>a+s.count,0);

  // ── Pannello sinistro: elemento + config estesa + diagramma di Pauli ──
  // layout config estesa (token a capo)
  ctx.font='9px "Space Mono",monospace';
  const tokens = cfg.map(s=>({txt:`${s.n}${L_LABEL[s.l]}${sup(s.count)}`, cur:(s.n===P.n&&s.l===P.l)}));
  const cfgLines=[]; let line=[]; let clx=14; const cMaxX=232;
  for (const tk of tokens) {
    const w = ctx.measureText(tk.txt+' ').width;
    if (clx+w>cMaxX && line.length) { cfgLines.push(line); line=[]; clx=14; }
    tk.x=clx; line.push(tk); clx+=w;
  }
  if (line.length) cfgLines.push(line);

  const cfgY0 = 70, cfgLH = 12;
  const pauliY0 = cfgY0 + cfgLines.length*cfgLH + 12;
  const rowH = 13, boxW = 11, boxGap = 2, x0 = 38;
  const maxRows = Math.floor((H - 16 - pauliY0) / rowH);
  const nRows = Math.min(cfg.length, Math.max(2, maxRows));
  const panelH = Math.min(H-16, pauliY0 + nRows*rowH + 4);

  ctx.save();

  ctx.fillStyle=T.accent; ctx.font='bold 26px "Space Mono",monospace';
  ctx.fillText(SYMBOLS[P.Z-1], 16, 38);
  ctx.fillStyle=T.txt; ctx.font='12px "DM Sans",sans-serif';
  ctx.fillText(NAMES[P.Z-1], 60, 26);
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace';
  ctx.fillText(`Z = ${P.Z}`, 60, 40);
  ctx.fillStyle=T.sub; ctx.font='9px "Space Mono",monospace';
  ctx.fillText(`Periodo ${period} · Blocco ${block} · ${valence}e⁻ est.`, 16, 56);

  // Configurazione elettronica per esteso
  ctx.font='9px "Space Mono",monospace';
  for (let li=0; li<cfgLines.length; li++) {
    const yy = cfgY0 + li*cfgLH;
    for (const tk of cfgLines[li]) {
      ctx.fillStyle = tk.cur ? T.accentHi : T.tokOff;
      ctx.fillText(tk.txt, tk.x, yy);
    }
  }

  // Diagramma di Pauli: caselle orbitali + frecce di spin (Hund)
  const startRow = Math.max(0, cfg.length - nRows);   // se troppi, mostra ultimi gusci
  let y = pauliY0;
  for (let si = startRow; si < cfg.length; si++) {
    const s = cfg[si];
    if (y + rowH > 8 + panelH) break;
    const cur = (s.n===P.n && s.l===P.l);
    ctx.fillStyle = cur ? T.accentHi : T.tokOff;
    ctx.font='9px "Space Mono",monospace';
    ctx.fillText(`${s.n}${L_LABEL[s.l]}`, 14, y+9);

    const nOrb = 2*s.l+1;
    // riempimento Hund: prima tutti ↑, poi ↓
    let c = s.count;
    const up = new Array(nOrb).fill(false), dn = new Array(nOrb).fill(false);
    for (let o=0;o<nOrb&&c>0;o++){ up[o]=true; c--; }
    for (let o=0;o<nOrb&&c>0;o++){ dn[o]=true; c--; }

    for (let o=0;o<nOrb;o++){
      const bx = x0 + o*(boxW+boxGap);
      if (bx+boxW > 232) break;
      const here = cur && (o - s.l) === P.m;
      ctx.strokeStyle = here ? T.accentHi : T.boxLine;
      ctx.lineWidth = here ? 1.4 : 0.7;
      ctx.strokeRect(bx, y, boxW, rowH-2);
      const mid = bx + boxW/2;
      if (up[o]) { ctx.strokeStyle=T.arrowUp; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(mid-1.6,y+rowH-4); ctx.lineTo(mid-1.6,y+2);
        ctx.lineTo(mid-3.4,y+4.5); ctx.stroke(); }
      if (dn[o]) { ctx.strokeStyle=T.arrowDn; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(mid+1.6,y+2); ctx.lineTo(mid+1.6,y+rowH-4);
        ctx.lineTo(mid+3.4,y+rowH-6.5); ctx.stroke(); }
    }
    y += rowH;
  }
  if (startRow > 0) {
    ctx.fillStyle=T.hint; ctx.font='8px "Space Mono",monospace';
    ctx.fillText('⋮', 30, pauliY0-3);
  }
  ctx.restore();

  // ── Pannello destro: numeri quantici ──
  ctx.save();
  const RW=150, rx=W-RW-8;
  ctx.textAlign='right';
  const rr=W-16;
  ctx.fillStyle=T.accent; ctx.font='bold 14px "Space Mono",monospace';
  ctx.fillText(`orbitale ${orbName(P.n,P.l,P.m)}`, rr, 26);
  ctx.font='10px "Space Mono",monospace'; ctx.fillStyle=T.txt;
  const E=-13.6*P.Z*P.Z/(P.n*P.n);
  const lines=[
    `n = ${P.n}   (principale)`,
    `l = ${P.l} ${L_LABEL[P.l]}  (azimutale)`,
    `mₗ = ${P.m>0?'+':''}${P.m}   (magnetico)`,
    `mₛ = ${P.s>0?'+½ ↑':'−½ ↓'}`,
    `nodi: ${P.n-P.l-1} radiali · ${P.l} angolari`,
  ];
  let yy=42;
  for (const ln of lines){ ctx.fillText(ln, rr, yy); yy+=13; }
  ctx.restore();

  // ── Hint in basso ──
  ctx.fillStyle=T.hint; ctx.font='10px "Space Mono",monospace';
  const hint = P.view==='2d'
    ? `sezione |ψ|² piano ${P.plane} · blu/arancio = fase di ψ`
    : (P.view==='3d-volume'
        ? 'isosuperficie |ψ|² · forma 3D dei lobi · trascina per ruotare'
        : 'nuvola di punti · trascina per ruotare · 2 colori = fase');
  ctx.fillText(hint, 14, H-12);
}

function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
let GC='rgba(150,205,225,0.88)';
// 1: probabilità radiale P(r) = r²·|R_nl|² (massimo = 1)
function drawRadial() {
  const rmax=P.n*P.n*4+6; let mx=0;
  for(let i=1;i<=240;i++){ const r=i/240*rmax, R=R_nl(P.n,P.l,r); mx=Math.max(mx,R*R*r*r); }
  const g=Lab.panel(gCanvas[0],{ title:`Probabilità radiale P(r) · nodi radiali: ${P.n-P.l-1}`, xr:[0,rmax], yr:[0,1.1], yStep:0.25, xLabel:'r (raggi di Bohr a₀)' });
  if(!g||!(mx>0)) return; const [ctx,f]=g;
  Lab.plot(ctx,f,r=>{ const R=R_nl(P.n,P.l,r); return R*R*r*r/mx; },[0,rmax],T.gCurve,2,[],300);
}
// 2: distribuzione angolare |Y_lm|² nel piano xz (diagramma polare), colorata secondo il segno della funzione
function drawAngular() {
  const cv=gCanvas[1]; if(!cv||!cv._dpr) return;
  const [ctx,W,H]=Lab.ctx2d(cv), C=Lab.graphColors();
  ctx.fillStyle=C.bg; ctx.fillRect(0,0,W,H);
  ctx.fillStyle=C.text; ctx.font='10.5px "DM Sans",sans-serif'; ctx.textAlign='left'; ctx.textBaseline='middle';
  ctx.fillText(`Distribuzione angolare |Y|² (piano xz) · nodi angolari: ${P.l}`,8,11);
  const cx=W/2, cy=H/2+8, NS=360, rad=Math.min(W,H-24)*0.42;
  const vals=new Float32Array(NS+1), sgn=new Int8Array(NS+1); let mx=1e-12;
  for(let i=0;i<=NS;i++){ const th=i/NS*Math.PI*2, A=angular(P.l,P.m,Math.sin(th),0,Math.cos(th)); vals[i]=A*A; sgn[i]=A>=0?1:-1; if(vals[i]>mx) mx=vals[i]; }
  ctx.strokeStyle=C.grid; ctx.lineWidth=1;
  ctx.beginPath(); ctx.arc(cx,cy,rad,0,Math.PI*2); ctx.moveTo(cx-rad,cy); ctx.lineTo(cx+rad,cy); ctx.moveTo(cx,cy-rad); ctx.lineTo(cx,cy+rad); ctx.stroke();
  const pc=`rgb(${T.posRGB.join(',')})`, nc=`rgb(${T.negRGB.join(',')})`;
  ctx.lineWidth=1.8;
  for(let i=0;i<NS;i++){
    const th0=i/NS*Math.PI*2, th1=(i+1)/NS*Math.PI*2, r0=vals[i]/mx*rad, r1=vals[i+1]/mx*rad;
    ctx.strokeStyle=sgn[i]>=0?pc:nc; ctx.beginPath(); ctx.moveTo(cx+Math.sin(th0)*r0,cy-Math.cos(th0)*r0); ctx.lineTo(cx+Math.sin(th1)*r1,cy-Math.cos(th1)*r1); ctx.stroke();
  }
  ctx.fillStyle=C.text; ctx.font='9.5px "DM Sans",sans-serif'; ctx.textAlign='left'; ctx.fillText('z',cx+4,cy-rad+6); ctx.fillText('x',cx+rad-10,cy-8);
  Lab.legend(ctx,8,H-10,[[pc,'Ψ > 0'],[nc,'Ψ < 0']]);
}
// 3: funzione d'onda radiale R_nl(r): i nodi sono gli zeri
function drawRadialWave() {
  const rmax=P.n*P.n*4+6; let mx=0;
  for(let i=1;i<=300;i++){ mx=Math.max(mx,Math.abs(R_nl(P.n,P.l,i/300*rmax))); }
  const g=Lab.panel(gCanvas[2],{ title:'Funzione d’onda radiale R(r) (massimo = 1)', xr:[0,rmax], yr:[-1.1,1.1], yStep:0.5, xLabel:'r (raggi di Bohr a₀)' });
  if(!g||!(mx>0)) return; const [ctx,f]=g;
  Lab.plot(ctx,f,r=>R_nl(P.n,P.l,r)/mx,[0,rmax],T.gCurve,2,[],300);
  let prev=R_nl(P.n,P.l,1e-3);
  for(let i=1;i<=600;i++){ const r=i/600*rmax, v=R_nl(P.n,P.l,r); if(prev*v<0) Lab.dot(ctx,f,r,0,T.gNode,3.5); prev=v; }
}

function drawGraphs(){ drawRadial(); drawAngular(); drawRadialWave(); }

// (info card rimossa: dati elemento e numeri quantici sono sul canvas)
function renderInfo() {}

// ═══ Controlli ════════════════════════════════════════════════════════════════
let orbCtrlEl=null;
function buildControls() {
  const cont=document.getElementById('controls');
  cont.innerHTML='';

  const secE=Lab.Section('Elemento');
  cont.appendChild(secE.el);
  secE.add(Lab.Slider({
    label:'Numero atomico Z', min:1, max:118, step:1, value:P.Z, unit:'',
    onChange(v){ P.Z=v; clampOrbital(); renderInfo(); rebuildOrbControls(); },
  }));

  const secV=Lab.Section('Visualizzazione');
  cont.appendChild(secV.el);
  secV.add(Lab.RadioGroup({
    label:'Vista',
    options:[
      {value:'3d-points', label:'3D (punti)',    hint:'nuvola di probabilità'},
      {value:'3d-volume', label:'3D (superfici)', hint:'isosuperficie lobi'},
      {value:'2d',        label:'2D (sezioni)',  hint:'sezione |ψ|²'},
    ],
    value:P.view,
    onChange(v){ P.view=v; rebuildOrbControls(); },
  }));

  rebuildOrbControls();
  renderInfo();
}

function rebuildOrbControls() {
  if(orbCtrlEl) orbCtrlEl.forEach(e=>e.remove());
  orbCtrlEl=[];
  const cont=document.getElementById('controls');

  const cfg=electronConfig(P.Z);
  // subshell occupate uniche
  const sub=cfg.map(s=>({n:s.n,l:s.l,count:s.count}));

  const secO=Lab.Section('Orbitale (numeri quantici)');
  cont.appendChild(secO.el); orbCtrlEl.push(secO.el);

  secO.add(Lab.RadioGroup({
    label:'Subshell occupata',
    options: sub.map(s=>({value:`${s.n},${s.l}`, label:`${s.n}${L_LABEL[s.l]}`, hint:`${s.count}e⁻`})),
    value:`${P.n},${P.l}`,
    onChange(v){ const [n,l]=v.split(',').map(Number); P.n=n; P.l=l; P.m=Math.max(-l,Math.min(l,P.m)); cloudDirty=true; sliceDirty=true; renderInfo(); rebuildOrbControls(); },
  }));
  secO.add(Lab.Slider({
    label:'mₗ (magnetico)', min:-P.l, max:P.l, step:1, value:P.m, unit:'',
    onChange(v){ P.m=v; cloudDirty=true; sliceDirty=true; renderInfo(); },
  }));
  secO.add(Lab.RadioGroup({
    label:'mₛ (spin)',
    options:[{value:'1',label:'+½ ↑'},{value:'-1',label:'−½ ↓'}],
    value:String(P.s),
    onChange(v){ P.s=Number(v); renderInfo(); },
  }));

  if(P.view==='2d'){
    secO.add(Lab.RadioGroup({
      label:'Piano sezione',
      options:[{value:'xz',label:'xz'},{value:'xy',label:'xy'},{value:'yz',label:'yz'}],
      value:P.plane,
      onChange(v){ P.plane=v; sliceDirty=true; },
    }));
  } else {
    secO.add(Lab.Slider({
      label:'Densità punti/dischi', min:3000, max:16000, step:1000, value:P.points, unit:'',
      onChange(v){ P.points=v; cloudDirty=true; },
    }));
  }
}

function clampOrbital() {
  const cfg=electronConfig(P.Z);
  const ok=cfg.some(s=>s.n===P.n&&s.l===P.l);
  if(!ok){ const last=cfg[cfg.length-1]; P.n=last.n; P.l=last.l; P.m=0; }
  cloudDirty=true; sliceDirty=true;
}

// ═══ Drag rotazione 3D ════════════════════════════════════════════════════════
function initDrag(canvas) {
  canvas.addEventListener('mousedown', e=>{ if(P.view!=='2d'){dragging=true;lastX=e.clientX;lastY=e.clientY;canvas.style.cursor='grabbing';} });
  window.addEventListener('mousemove', e=>{ if(!dragging)return; rotY+=(e.clientX-lastX)*0.01; rotX+=(e.clientY-lastY)*0.01; rotX=Math.max(-1.5,Math.min(1.5,rotX)); lastX=e.clientX; lastY=e.clientY; });
  window.addEventListener('mouseup', ()=>{ dragging=false; canvas.style.cursor='default'; });
  canvas.addEventListener('touchstart', e=>{ if(P.view!=='2d'){dragging=true;lastX=e.touches[0].clientX;lastY=e.touches[0].clientY;} },{passive:true});
  canvas.addEventListener('touchmove', e=>{ if(!dragging)return; rotY+=(e.touches[0].clientX-lastX)*0.01; rotX+=(e.touches[0].clientY-lastY)*0.01; rotX=Math.max(-1.5,Math.min(1.5,rotX)); lastX=e.touches[0].clientX; lastY=e.touches[0].clientY; },{passive:true});
  canvas.addEventListener('touchend', ()=>{ dragging=false; });
}

// ═══ Graph panel ══════════════════════════════════════════════════════════════
function initGraphs() {
  // riga di grafici standard; i titoli sono disegnati dentro i grafici
  gCanvas = Lab.graphPanels(document.getElementById('graphArea'), 3);
  gCtx = gCanvas.map(c => c.getContext('2d'));
}

// ═══ Init ═════════════════════════════════════════════════════════════════════
function init() {
  Lab.initTheme();
  buildControls();
  initGraphs();

  const simCanvas=document.getElementById('simCanvas');
  readout=new Lab.Readout(document.getElementById('readout'),[
    {key:'energy', label:'energia Eₙ (atomo idrogenoide)'},
    {key:'qn',     label:'numeri quantici n, l, mₗ, mₛ'},
    {key:'view',   label:'vista'},
  ]);

  document.getElementById('btnView').addEventListener('click',()=>{
    const cyc=['3d-points','3d-volume','2d'];
    P.view = cyc[(cyc.indexOf(P.view)+1)%3];
    buildControls();
  });
  document.getElementById('btnReset').addEventListener('click',()=>{
    P.Z=6; P.n=2; P.l=1; P.m=0; P.s=1; P.view='3d-points'; P.plane='xz'; P.points=9000;
    rotX=-0.35; rotY=0.6;
    cloudDirty=true; sliceDirty=true;
    buildControls();
  });

  initDrag(simCanvas);

  function resize(){
    const area=document.querySelector('.lab-canvas-area');
    if(!area)return;
    const ar=area.getBoundingClientRect();
    const rb=document.getElementById('readout').getBoundingClientRect();
    const ga=document.getElementById('graphArea');
    const gaH=ga?ga.offsetHeight:0;
    Lab.hidpi(simCanvas, Math.floor(ar.width), Math.max(60,Math.floor(ar.height-rb.height-gaH-4)));
    Lab.fitPanels(gCanvas);
  }
  resize();
  new ResizeObserver(resize).observe(document.querySelector('.lab-canvas-area'));

  function frame(){
    T = pal();
    GC = T.gText;
    draw(simCanvas);
    drawGraphs();
    const E = -13.6*P.Z*P.Z/(P.n*P.n);
    readout.set('energy', `${Lab.fmt(E,1)} eV`);
    readout.set('qn', `${P.n}, ${P.l}, ${P.m>0?'+':''}${P.m}, ${P.s>0?'+½':'−½'}`);
    readout.set('view', VIEW_LABELS[P.view]);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

window.addEventListener('DOMContentLoaded', init);
