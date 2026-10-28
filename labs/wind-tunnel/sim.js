'use strict';

// ─── D2Q9 Lattice Boltzmann ────────────────────────────────────────────────────
//  6 2 5
//  3 0 1   ← velocity directions (EX, EY)
//  7 4 8
const EX  = new Int8Array( [ 0, 1, 0,-1, 0, 1,-1,-1, 1]);
const EY  = new Int8Array( [ 0, 0, 1, 0,-1, 1, 1,-1,-1]);
const WT  = new Float32Array([4/9,1/9,1/9,1/9,1/9,1/36,1/36,1/36,1/36]);
const OPP = new Uint8Array(  [ 0,  3,  4,  1,  2,  7,   8,   5,   6]);

const NX = 220, NY = 80, N = NX * NY;

const f    = new Float32Array(N * 9);
const fswp = new Float32Array(N * 9);
const rho  = new Float32Array(N);
const ux   = new Float32Array(N);
const uy   = new Float32Array(N);
const wall = new Uint8Array(N);

// ─── Simulation parameters ─────────────────────────────────────────────────────
const P = {
  speed:    0.10,       // inlet velocity (lattice units, << 1/√3)
  angle:    5,          // angle of attack (°)
  profile:  'naca0012', // 'naca0012'|'naca4412'|'cylinder'|'flatplate'
  vizMode:  'velocity', // 'velocity'|'pressure'|'vorticity'
  tau:      0.60,       // BGK relaxation; ν=(τ-0.5)/3; Re=U·L/ν
  steps:    12,         // LBM steps per animation frame
  showLift: false,      // mostra vettori portanza/resistenza sul canvas
};

const CHORD = Math.round(NY * 0.36);  // chord in cells
let afX = Math.round(NX * 0.38);     // airfoil center x
let afY = Math.round(NY * 0.50);     // airfoil center y

let paused   = false;
let dragAF   = false;   // dragging airfoil
let readoutEl;
let curPoly  = [];

// Force history for graph
const HIST_LEN = 300;
const liftHist = new Float32Array(HIST_LEN);
const dragHist = new Float32Array(HIST_LEN);
let histIdx = 0;

// ─── Offscreen buffer for field rendering ──────────────────────────────────────
const offCV  = document.createElement('canvas');
offCV.width  = NX; offCV.height = NY;
const offCtx = offCV.getContext('2d');
const imgBuf = offCtx.createImageData(NX, NY);

// ─── Graph canvases ────────────────────────────────────────────────────────────
let gCanvas = [null, null, null];
let gCtx    = [null, null, null];

// ─── NACA airfoil geometry ─────────────────────────────────────────────────────
function nacaNorm(code, n = 60) {
  const m = parseInt(code[0]) / 100;
  const p = parseInt(code[1]) / 10;
  const t = parseInt(code.slice(2)) / 100;
  const upper = [], lower = [];
  for (let i = 0; i <= n; i++) {
    const xc = 0.5 * (1 - Math.cos(Math.PI * i / n));
    const yt = 5*t*(0.2969*Math.sqrt(xc) - 0.126*xc - 0.3516*xc**2 + 0.2843*xc**3 - 0.1015*xc**4);
    let yc = 0, th = 0;
    if (m > 0) {
      if (xc < p) { yc = m/p/p*(2*p*xc-xc**2);       th = Math.atan(2*m/p/p*(p-xc)); }
      else        { yc = m/(1-p)**2*(1-2*p+2*p*xc-xc**2); th = Math.atan(2*m/(1-p)**2*(p-xc)); }
    }
    upper.push([xc - yt*Math.sin(th), yc + yt*Math.cos(th)]);
    lower.push([xc + yt*Math.sin(th), yc - yt*Math.cos(th)]);
  }
  return [...upper, ...lower.reverse()];
}

function toGrid(normPts, cx, cy, c, angleDeg) {
  const a = angleDeg * Math.PI / 180;
  const ca = Math.cos(a), sa = Math.sin(a);
  return normPts.map(([nx, ny]) => {
    // la griglia ha y verso il basso: il dorso del profilo (ny > 0) va verso y minori
    const lx = (nx - 0.5) * c;
    const ly = -ny * c;
    return [cx + lx*ca - ly*sa, cy + lx*sa + ly*ca];
  });
}

function buildPoly(profile, cx, cy, c, angle) {
  if (profile === 'cylinder') {
    const r = c * 0.30, pts = [];
    for (let i = 0; i < 64; i++) {
      const a = 2*Math.PI*i/64;
      pts.push([cx + r*Math.cos(a), cy + r*Math.sin(a)]);
    }
    return pts;
  }
  if (profile === 'flatplate') {
    const th = 0.028;
    const norm = [];
    for (let i = 0; i <= 50; i++) norm.push([i/50, th]);
    for (let i = 50; i >= 0; i--) norm.push([i/50,-th]);
    return toGrid(norm, cx, cy, c, angle);
  }
  const code = profile === 'naca4412' ? '4412' : '0012';
  return toGrid(nacaNorm(code), cx, cy, c, angle);
}

function inPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length-1; i < poly.length; j = i++) {
    const [xi,yi] = poly[i], [xj,yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < (xj-xi)*(py-yi)/(yj-yi)+xi) inside = !inside;
  }
  return inside;
}

function rebuildWalls() {
  const prev = wall.slice();
  wall.fill(0);

  // Tunnel walls (top + bottom rows = solid)
  for (let x = 0; x < NX; x++) {
    wall[0*NX+x] = 1;
    wall[(NY-1)*NX+x] = 1;
  }

  // Airfoil
  curPoly = buildPoly(P.profile, afX, afY, CHORD, P.angle);
  let x0=NX,x1=0,y0=NY,y1=0;
  for (const [px,py] of curPoly) {
    x0=Math.min(x0,px-2); x1=Math.max(x1,px+2);
    y0=Math.min(y0,py-2); y1=Math.max(y1,py+2);
  }
  for (let y=Math.max(1,Math.floor(y0)); y<=Math.min(NY-2,Math.ceil(y1)); y++) {
    for (let x=Math.max(0,Math.floor(x0)); x<=Math.min(NX-1,Math.ceil(x1)); x++) {
      if (inPoly(x+0.5, y+0.5, curPoly)) wall[y*NX+x] = 1;
    }
  }

  // Re-initialize cells that switched fluid↔solid
  const u0 = P.speed, usq = u0*u0;
  for (let i = 0; i < N; i++) {
    if (wall[i]) { f.fill(0, i*9, i*9+9); continue; }
    if (prev[i]) {   // was solid, now fluid
      rho[i]=1; ux[i]=u0; uy[i]=0;
      for (let k=0;k<9;k++) { const eu=EX[k]*u0; f[i*9+k]=WT[k]*(1+3*eu+4.5*eu*eu-1.5*usq); }
    }
  }
}

function initLBM() {
  const u0 = P.speed;
  for (let i = 0; i < N; i++) {
    if (wall[i]) { f.fill(0,i*9,i*9+9); rho[i]=1; ux[i]=0; uy[i]=0; continue; }
    const pert = (Math.random()-0.5)*0.002;
    rho[i]=1; ux[i]=u0; uy[i]=pert;
    const usq=u0*u0+pert*pert;
    for (let k=0;k<9;k++) {
      const eu=EX[k]*u0+EY[k]*pert;
      f[i*9+k]=WT[k]*(1+3*eu+4.5*eu*eu-1.5*usq);
    }
  }
}

function lbmStep() {
  const inv = 1/P.tau, u0 = P.speed, usq0 = u0*u0;

  // Collision (BGK)
  for (let y=0;y<NY;y++) {
    for (let x=0;x<NX;x++) {
      const i=y*NX+x;
      if (wall[i]) continue;
      let r=0,vx=0,vy=0;
      const b=i*9;
      for (let k=0;k<9;k++){const fk=f[b+k];r+=fk;vx+=EX[k]*fk;vy+=EY[k]*fk;}
      if(r<1e-9)r=1e-9; vx/=r; vy/=r;
      rho[i]=r; ux[i]=vx; uy[i]=vy;
      const usq=vx*vx+vy*vy;
      for(let k=0;k<9;k++){
        const eu=EX[k]*vx+EY[k]*vy;
        f[b+k]+=(WT[k]*r*(1+3*eu+4.5*eu*eu-1.5*usq)-f[b+k])*inv;
      }
    }
  }

  // Streaming + bounce-back
  fswp.fill(0);
  for (let y=0;y<NY;y++) {
    for (let x=0;x<NX;x++) {
      const i=y*NX+x, b=i*9;
      for (let k=0;k<9;k++) {
        const fv=f[b+k]; if(fv===0)continue;
        const nx2=x+EX[k], ny2=y+EY[k];
        if(nx2<0||nx2>=NX) continue;    // handled by inlet/outlet BCs
        if(ny2<0||ny2>=NY) { fswp[b+k]+=fv; continue; } // safety (wall cells absorb)
        const ni=ny2*NX+nx2;
        if(wall[ni]) fswp[b+OPP[k]]+=fv; // half-way bounce-back (no-slip)
        else         fswp[ni*9+k]  +=fv;
      }
    }
  }

  // Inlet BC (x=0): fixed velocity
  for (let y=1;y<NY-1;y++) {
    const b=y*NX*9;
    for(let k=0;k<9;k++){const eu=EX[k]*u0;fswp[b+k]=WT[k]*(1+3*eu+4.5*eu*eu-1.5*usq0);}
    rho[y*NX]=1; ux[y*NX]=u0; uy[y*NX]=0;
  }

  // Outlet BC (x=NX-1): zero-gradient
  for (let y=1;y<NY-1;y++) {
    const i=(y*NX+NX-1)*9, i2=(y*NX+NX-2)*9;
    for(let k=0;k<9;k++) fswp[i+k]=fswp[i2+k];
  }

  f.set(fswp);
}

// ─── Force estimation (momentum exchange at solid surface) ─────────────────────
function computeForces() {
  let Fx=0, Fy=0;
  for (let y=1;y<NY-1;y++) {
    for (let x=1;x<NX-1;x++) {
      const i=y*NX+x;
      if(!wall[i]) continue;
      for(let k=1;k<9;k++){
        const nx2=x+EX[k], ny2=y+EY[k];
        if(nx2<0||nx2>=NX||ny2<0||ny2>=NY)continue;
        const ni=ny2*NX+nx2;
        if(wall[ni])continue;
        // Momentum exchange at bounce-back: 2 × f_in × e
        const fv = f[ni*9+OPP[k]];
        Fx += 2*fv*EX[OPP[k]];
        Fy += 2*fv*EY[OPP[k]];
      }
    }
  }
  // Il flusso libero va lungo +x: la resistenza è la componente lungo x, la portanza quella
  // perpendicolare (non quella perpendicolare alla corda). La y della griglia punta in basso,
  // quindi una portanza verso l'alto è −Fy.
  return { lift: -Fy, drag: Fx };
}

// ─── Color maps ────────────────────────────────────────────────────────────────
const CMAP_VEL = [[3,8,22],[0,30,90],[0,110,175],[0,200,220],[120,240,255],[255,255,255]];
const CMAP_PRE = [[0,20,120],[0,80,200],[200,220,255],[255,255,255],[255,180,60],[220,40,0]];
const CMAP_VOR = [[0,30,180],[5,5,30],[0,0,0],[25,5,5],[180,30,0]];

function lerp3(cmap, t) {
  t = Math.max(0,Math.min(1,t));
  const s = t*(cmap.length-1), i = Math.min(Math.floor(s),cmap.length-2), f = s-i;
  const a=cmap[i], b=cmap[i+1];
  return [a[0]+(b[0]-a[0])*f|0, a[1]+(b[1]-a[1])*f|0, a[2]+(b[2]-a[2])*f|0];
}

let maxSpeed = 0;

function updateImageBuf() {
  const px = imgBuf.data;
  let ms = 0;
  for (let i=0;i<N;i++) if(!wall[i]){const s=ux[i]*ux[i]+uy[i]*uy[i];if(s>ms)ms=s;}
  maxSpeed = Math.sqrt(ms)*1.1 || P.speed*2;

  for (let y=0;y<NY;y++) {
    for (let x=0;x<NX;x++) {
      const i=y*NX+x, off=(y*NX+x)*4;
      if(wall[i]){
        const isEdge=(y===0||y===NY-1);
        px[off]=isEdge?22:55; px[off+1]=isEdge?28:65; px[off+2]=isEdge?42:80; px[off+3]=255;
        continue;
      }
      let t, rgb;
      if(P.vizMode==='velocity'){
        t = Math.sqrt(ux[i]*ux[i]+uy[i]*uy[i])/maxSpeed;
        rgb = lerp3(CMAP_VEL, t);
      } else if(P.vizMode==='pressure'){
        t = (rho[i]-0.90)/0.20;
        rgb = lerp3(CMAP_PRE, t);
      } else {
        // vorticity: ∂uy/∂x - ∂ux/∂y (finite difference)
        const ip=wall[(y)*NX+Math.min(x+1,NX-1)]?i:y*NX+Math.min(x+1,NX-1);
        const im=wall[(y)*NX+Math.max(x-1,0)]?i:y*NX+Math.max(x-1,0);
        const jp=wall[Math.min(y+1,NY-1)*NX+x]?i:Math.min(y+1,NY-1)*NX+x;
        const jm=wall[Math.max(y-1,0)*NX+x]?i:Math.max(y-1,0)*NX+x;
        const curl=(uy[ip]-uy[im])*0.5-(ux[jp]-ux[jm])*0.5;
        t = 0.5 + curl/(P.speed*2.5);
        rgb = lerp3(CMAP_VOR, t);
      }
      px[off]=rgb[0]; px[off+1]=rgb[1]; px[off+2]=rgb[2]; px[off+3]=255;
    }
  }
  offCtx.putImageData(imgBuf,0,0);
}

// ─── Streamlines ───────────────────────────────────────────────────────────────
let streamlines = [];
let slFrame = 0;

function traceStreamlines(n=16) {
  streamlines = [];
  for (let s=0;s<n;s++) {
    const y0 = 1.5 + (NY-3)*s/(n-1);
    const line = [];
    let x=2.0, y=y0;
    for (let it=0;it<600;it++) {
      const xi=Math.max(0,Math.min(NX-1,x|0)), yi=Math.max(0,Math.min(NY-1,y|0));
      const i=yi*NX+xi;
      if(wall[i])break;
      line.push([x,y]);
      const vx=ux[i], vy=uy[i];
      const spd=Math.sqrt(vx*vx+vy*vy);
      if(spd<1e-4)break;
      const ds=0.6/spd;
      x+=vx*ds; y+=vy*ds;
      if(x>NX-1||x<0||y>NY-1||y<0)break;
    }
    if(line.length>4) streamlines.push(line);
  }
}

// ─── Main draw ──────────────────────────────────────────────────────────────────
// ─── Lift / drag vector overlay ────────────────────────────────────────────────
function drawArrow(ctx, x1, y1, x2, y2, color, label) {
  const len = Math.sqrt((x2-x1)**2+(y2-y1)**2);
  if (len < 4) return;
  const ang = Math.atan2(y2-y1, x2-x1);
  const as = 9;
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2,y2);
  ctx.lineTo(x2-as*Math.cos(ang-0.42), y2-as*Math.sin(ang-0.42));
  ctx.lineTo(x2-as*Math.cos(ang+0.42), y2-as*Math.sin(ang+0.42));
  ctx.closePath(); ctx.fill();
  ctx.font = 'bold 11px "Space Mono",monospace';
  const lx = (x1+x2)*0.5+10, ly = (y1+y2)*0.5-4;
  // Halo leggibilità
  ctx.strokeStyle='rgba(0,0,0,0.6)'; ctx.lineWidth=3;
  ctx.strokeText(label, lx, ly);
  ctx.fillText(label, lx, ly);
  ctx.restore();
}

function drawLiftVector(ctx, W, H) {
  const sx = W/NX, sy = H/NY;
  const {lift, drag} = computeForces();
  const q  = 0.5 * P.speed * P.speed * CHORD;
  const CL = lift / q;
  const CD = drag / q;

  const cx = afX * sx;
  const cy = afY * sy;

  // Portanza: perpendicolare al flusso → verticale (su = positiva)
  const liftPx = Math.max(-H*0.38, Math.min(H*0.38, CL * H * 0.14));
  // Resistenza: parallela al flusso → orizzontale (destra = positiva)
  const dragPx = Math.max(-W*0.25, Math.min(W*0.25, CD * W * 0.07));

  if (Math.abs(liftPx) > 4)
    drawArrow(ctx, cx, cy, cx, cy - liftPx, '#00ff88', 'CL=' + CL.toFixed(3));
  if (Math.abs(dragPx) > 4)
    drawArrow(ctx, cx, cy, cx + dragPx, cy, '#ff8c1a', 'CD=' + CD.toFixed(3));
}

function draw(canvas) {
  const ctx = canvas.getContext('2d');
  const W=canvas.width, H=canvas.height;
  const sx=W/NX, sy=H/NY;

  // Field
  updateImageBuf();
  ctx.save();
  ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='medium';
  ctx.drawImage(offCV,0,0,W,H);
  ctx.restore();

  // Streamlines
  ctx.save();
  ctx.globalAlpha=0.50;
  ctx.strokeStyle='rgba(0,220,255,1)';
  ctx.lineWidth=0.9;
  for(const line of streamlines){
    if(line.length<2)continue;
    ctx.beginPath();
    ctx.moveTo(line[0][0]*sx, line[0][1]*sy);
    for(let i=1;i<line.length;i++) ctx.lineTo(line[i][0]*sx,line[i][1]*sy);
    ctx.stroke();
  }
  ctx.restore();

  // Airfoil outline
  if(curPoly.length>2){
    ctx.save();
    ctx.strokeStyle='rgba(200,220,255,0.70)';
    ctx.lineWidth=1.2;
    ctx.beginPath();
    ctx.moveTo(curPoly[0][0]*sx, curPoly[0][1]*sy);
    for(const [px,py] of curPoly) ctx.lineTo(px*sx,py*sy);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  // Velocity arrows (coarse grid)
  ctx.save();
  ctx.globalAlpha=0.45;
  const AGRID=22;
  for(let y=AGRID/2;y<NY;y+=AGRID){
    for(let x=AGRID/2;x<NX;x+=AGRID){
      const i=(y|0)*NX+(x|0);
      if(wall[i])continue;
      const vx=ux[i],vy=uy[i];
      const spd=Math.sqrt(vx*vx+vy*vy);
      if(spd<0.005)continue;
      const len=Math.min(spd/P.speed*AGRID*0.38, AGRID*0.48);
      const ax=x*sx, ay=y*sy;
      const ex=ax+vx/spd*len*sx/NX*NX, ey=ay+vy/spd*len*sy/NY*NY;
      ctx.strokeStyle='rgba(255,255,255,0.6)';
      ctx.lineWidth=0.7;
      ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(ex,ey); ctx.stroke();
      // arrowhead
      const ang=Math.atan2(ey-ay,ex-ax);
      const as=3.5;
      ctx.beginPath();
      ctx.moveTo(ex,ey);
      ctx.lineTo(ex-as*Math.cos(ang-0.45),ey-as*Math.sin(ang-0.45));
      ctx.lineTo(ex-as*Math.cos(ang+0.45),ey-as*Math.sin(ang+0.45));
      ctx.closePath();
      ctx.fillStyle='rgba(255,255,255,0.6)';
      ctx.fill();
    }
  }
  ctx.restore();

  // Lift/drag vectors
  if (P.showLift) drawLiftVector(ctx, W, H);
}

// ─── Graphs ────────────────────────────────────────────────────────────────────
const GC = 'rgba(155,210,232,0.92)';  // testo/assi — leggibile su sfondo scuro in entrambi i temi
const GL = 'rgba(0,230,255,0.90)';
const GD = 'rgba(255,145,50,0.90)';

// Grafici: coefficienti adimensionali, che non dipendono dalle unità del reticolo.
// CL = portanza/(½·ρ·U²·c), CD = resistenza/(½·ρ·U²·c), Cp = (p − p∞)/(½·ρ·U²) con p = ρ/3.
function qRef() { return 0.5 * P.speed * P.speed; }

function drawForceGraph() {
  const q = qRef() * CHORD;
  const lift = [...liftHist.slice(histIdx), ...liftHist.slice(0, histIdx)].map(v => v / q);
  const drag = [...dragHist.slice(histIdx), ...dragHist.slice(0, histIdx)].map(v => v / q);
  const m = Lab.niceMax(Math.max(1, ...lift.map(Math.abs), ...drag.map(Math.abs)) * 1.05);
  const g = Lab.panel(gCanvas[0], { title: 'Coefficienti di portanza CL e resistenza CD', xr: [0, HIST_LEN], xFmt: () => '', yr: [-m, m], xLabel: 'tempo →' });
  if (!g) return; const [ctx, f] = g;
  Lab.plotPts(ctx, f, lift.map((v, i) => [i, v]), GL, 1.8);
  Lab.plotPts(ctx, f, drag.map((v, i) => [i, v]), GD, 1.8);
  Lab.legend(ctx, f.L + 8, f.T + 8, [[GL, 'CL'], [GD, 'CD']]);
}

// profilo di velocità nella scia, 20 celle dietro il bordo d'uscita
function drawWakeGraph() {
  const xProbe = Math.min(NX - 2, afX + CHORD / 2 + 20) | 0;
  const g = Lab.panel(gCanvas[1], { title: 'Velocità nella scia u/U₀ (dietro il profilo)', xr: [0, 1.6], xStep: 0.25, yr: [0, 100], yStep: 25, xLabel: 'u/U₀', yFmt: v => Lab.fmt(v, 0) + '%' });
  if (!g) return; const [ctx, f] = g;
  ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = f.C.text; ctx.beginPath(); ctx.moveTo(f.X(1), f.T); ctx.lineTo(f.X(1), f.B); ctx.stroke(); ctx.restore();
  const pts = [];
  for (let y = 1; y < NY - 1; y++) { const i = y * NX + xProbe; pts.push([wall[i] ? 0 : ux[i] / P.speed, 100 - (y - 1) / (NY - 3) * 100]); }
  Lab.plotPts(ctx, f, pts, GL, 2);
  ctx.fillStyle = f.C.text; ctx.font = '9.5px "DM Sans",sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('altezza nella galleria', f.L + 4, f.T + 8);
}

// coefficiente di pressione sul dorso e sul ventre (−Cp verso l'alto, come nei testi di aerodinamica)
function drawPressureGraph() {
  // pressione di riferimento: media su una sezione una corda a monte del profilo (all'ingresso
  // sarebbe più alta, perché lungo la galleria la viscosità fa calare la pressione)
  const xRef = Math.max(2, (afX - CHORD) | 0);
  let pSum = 0, nRef = 0;
  for (let y = 2; y < NY - 2; y++) { const i = y * NX + xRef; if (!wall[i]) { pSum += rho[i] / 3; nRef++; } }
  const q = qRef(), pInf = nRef ? pSum / nRef : 1 / 3;
  const xStart = (afX - CHORD / 2) | 0, xEnd = (afX + CHORD / 2) | 0;
  const cpU = [], cpL = [];
  for (let x = Math.max(1, xStart); x <= Math.min(NX - 2, xEnd); x++) {
    let yTop = -1, yBot = -1;
    for (let y = 1; y < NY - 1; y++) {
      const i = y * NX + x;
      if (wall[i]) {
        if (wall[(y - 1) * NX + x] === 0 && yTop < 0) yTop = y - 1;
        if (wall[(y + 1) * NX + x] === 0) yBot = y + 1;
      }
    }
    const s = (x - xStart) / (xEnd - xStart) * 100;
    if (yTop > 0) cpU.push([s, -(rho[yTop * NX + x] / 3 - pInf) / q]);
    if (yBot > 0) cpL.push([s, -(rho[yBot * NX + x] / 3 - pInf) / q]);
  }
  const m = Lab.niceMax(Math.max(1, ...cpU.map(p => Math.abs(p[1])), ...cpL.map(p => Math.abs(p[1]))) * 1.05);
  const g = Lab.panel(gCanvas[2], { title: 'Coefficiente di pressione −Cp', xr: [0, 100], yr: [-m, m], xLabel: 'posizione lungo la corda (%)' });
  if (!g) return; const [ctx, f] = g;
  Lab.plotPts(ctx, f, cpU, 'rgba(0,220,255,0.9)', 1.8);
  Lab.plotPts(ctx, f, cpL, 'rgba(255,100,80,0.9)', 1.8);
  Lab.legend(ctx, f.L + 8, f.T + 8, [['rgba(0,220,255,0.9)', 'dorso'], ['rgba(255,100,80,0.9)', 'ventre']]);
}

function drawGraphs() {
  drawForceGraph(); drawWakeGraph(); drawPressureGraph();
}

// ─── Controls ──────────────────────────────────────────────────────────────────
function buildControls() {
  const cont=document.getElementById('controls');
  cont.innerHTML='';

  const secFlow=Lab.Section('Flusso d\'Aria');
  cont.appendChild(secFlow.el);
  secFlow.add(Lab.Slider({
    label:'Velocità flusso', min:0.02, max:0.22, step:0.01, value:P.speed, unit:' U',
    onChange(v){ P.speed=v; },
  }));
  secFlow.add(Lab.Slider({
    label:'Viscosità (τ)', min:0.52, max:1.20, step:0.01, value:P.tau, unit:'',
    onChange(v){ P.tau=v; },
  }));

  const secProfile=Lab.Section('Profilo');
  cont.appendChild(secProfile.el);
  secProfile.add(Lab.RadioGroup({
    label:'Profilo alare',
    options:[
      {value:'naca0012', label:'NACA 0012', hint:'simmetrico'},
      {value:'naca4412', label:'NACA 4412', hint:'portante'},
      {value:'cylinder', label:'Cilindro',  hint:'von Kármán'},
      {value:'flatplate',label:'Lastra piatta', hint:'α elevato'},
    ],
    value:P.profile,
    onChange(v){ P.profile=v; rebuildWalls(); traceStreamlines(); },
  }));
  secProfile.add(Lab.Slider({
    label:'Angolo d\'attacco', min:-30, max:30, step:1, value:P.angle, unit:'°',
    onChange(v){ P.angle=v; rebuildWalls(); traceStreamlines(); },
  }));

  const secViz=Lab.Section('Visualizzazione');
  cont.appendChild(secViz.el);
  secViz.add(Lab.RadioGroup({
    label:'Campo visualizzato',
    options:[
      {value:'velocity', label:'Velocità'},
      {value:'pressure', label:'Pressione'},
      {value:'vorticity',label:'Vorticità'},
    ],
    value:P.vizMode,
    onChange(v){ P.vizMode=v; },
  }));
  secViz.add(Lab.Toggle({
    label:'Vettori portanza/resistenza',
    value: P.showLift,
    onChange(v){ P.showLift=v; },
  }));
}

// ─── Drag airfoil ──────────────────────────────────────────────────────────────
function canvasToGrid(canvas, e) {
  const r=canvas.getBoundingClientRect();
  return {
    gx: (e.clientX-r.left)/r.width  * NX,
    gy: (e.clientY-r.top )/r.height * NY,
  };
}

function initDrag(canvas) {
  canvas.addEventListener('mousedown', e=>{
    const {gx,gy}=canvasToGrid(canvas,e);
    const dx=gx-afX, dy=gy-afY;
    if(Math.sqrt(dx*dx+dy*dy)<CHORD*0.55){ dragAF=true; canvas.style.cursor='grabbing'; }
  });
  canvas.addEventListener('mousemove', e=>{
    if(!dragAF) return;
    const {gx,gy}=canvasToGrid(canvas,e);
    afX=Math.max(CHORD*0.6, Math.min(NX-CHORD*0.6, gx))|0;
    afY=Math.max(NY*0.15,    Math.min(NY*0.85,      gy))|0;
    rebuildWalls(); traceStreamlines();
  });
  canvas.addEventListener('mouseup',    ()=>{ dragAF=false; canvas.style.cursor='default'; });
  canvas.addEventListener('mouseleave', ()=>{ dragAF=false; });
  canvas.addEventListener('touchstart', e=>{ e.preventDefault(); const {gx,gy}=canvasToGrid(canvas,e.touches[0]); const dx=gx-afX,dy=gy-afY; if(Math.sqrt(dx*dx+dy*dy)<CHORD*0.55)dragAF=true; },{passive:false});
  canvas.addEventListener('touchmove',  e=>{ e.preventDefault(); if(!dragAF)return; const {gx,gy}=canvasToGrid(canvas,e.touches[0]); afX=Math.max(CHORD*0.6,Math.min(NX-CHORD*0.6,gx))|0; afY=Math.max(NY*0.15,Math.min(NY*0.85,gy))|0; rebuildWalls(); traceStreamlines(); },{passive:false});
  canvas.addEventListener('touchend',   ()=>{ dragAF=false; });
}

// ─── Graph panel setup ─────────────────────────────────────────────────────────
function initGraphs() {
  gCanvas = Lab.graphPanels(document.getElementById('graphArea'), 3, 170);
}

// ─── Readout ───────────────────────────────────────────────────────────────────
let readout;

// ─── Init + loop ───────────────────────────────────────────────────────────────
function init() {
  Lab.initTheme();
  buildControls();
  initGraphs();

  const simCanvas=document.getElementById('simCanvas');
  readout=new Lab.Readout(document.getElementById('readout'),[
    {key:'re',    label:'numero di Reynolds'},
    {key:'speed', label:'velocità (unità reticolo)'},
    {key:'angle', label:'angolo d’attacco'},
    {key:'lift',  label:'portanza'},
    {key:'drag',  label:'resistenza'},
    {key:'hint',  label:'regime'},
  ]);

  document.getElementById('btnPlay').addEventListener('click',()=>{
    paused=!paused;
    document.getElementById('btnPlay').textContent=paused?'▶  PLAY':'⏸  PAUSA';
  });
  document.getElementById('btnReset').addEventListener('click',()=>{
    liftHist.fill(0); dragHist.fill(0); histIdx=0;
    initLBM(); traceStreamlines();
    paused=false;
    document.getElementById('btnPlay').textContent='⏸  PAUSA';
  });

  rebuildWalls();
  initLBM();
  traceStreamlines();
  initDrag(simCanvas);

  function resize() {
    const area=document.querySelector('.lab-canvas-area');
    if(!area)return;
    const ar=area.getBoundingClientRect();
    const rb=document.getElementById('readout').getBoundingClientRect();
    const ga=document.getElementById('graphArea');
    const gaH=ga?ga.offsetHeight:0;
    simCanvas.width =Math.floor(ar.width);
    simCanvas.height=Math.max(60,Math.floor(ar.height-rb.height-gaH-4));
    Lab.fitPanels(gCanvas);
  }
  resize();
  new ResizeObserver(resize).observe(document.querySelector('.lab-canvas-area'));

  let frameCount=0, last=performance.now();

  function frame(now) {
    const dt=Math.min((now-last)/1000,0.05); last=now;

    if(!paused){
      for(let s=0;s<P.steps;s++) lbmStep();

      // Update force history every 4 frames
      if(frameCount%4===0){
        const {lift,drag}=computeForces();
        liftHist[histIdx]=lift;
        dragHist[histIdx]=drag;
        histIdx=(histIdx+1)%HIST_LEN;
      }

      // Re-trace streamlines every 60 frames
      if(frameCount%60===0) traceStreamlines();
    }

    draw(simCanvas);
    drawGraphs();

    // Readout
    const nu=(P.tau-0.5)/3;
    const Re=(P.speed*CHORD/nu)|0;
    const {lift,drag}=computeForces();
    const q=0.5*P.speed*P.speed;
    const S=CHORD;
    const CL=Lab.fmt(lift/(q*S),2);
    const CD=Lab.fmt(drag/(q*S),2);
    readout.set('re',  String(Re));
    // con Re di qualche centinaio la viscosità domina: la resistenza è molto più alta di quella
    // di un'ala vera (Re ~ 10⁶) e la portanza più bassa
    readout.set('hint', Re<500 ? 'viscoso (Re basso)' : Re<2000 ? 'laminare' : 'verso la turbolenza');
    readout.set('speed',Lab.fmt(P.speed,2));
    readout.set('angle',P.angle+'°');
    readout.set('lift', 'CL = '+CL);
    readout.set('drag', 'CD = '+CD);

    frameCount++;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

window.addEventListener('DOMContentLoaded', init);
