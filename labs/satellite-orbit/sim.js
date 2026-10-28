'use strict';

// ═══ Pianeti (dati reali) ═════════════════════════════════════════════════════
// GM in m³/s², raggio medio in km, giorno siderale in s. La simulazione usa per ogni pianeta
// unità proprie: lunghezza = raggio del pianeta, tempo τ = √(R³/GM), così GM = 1 e R = 1;
// le grandezze mostrate si riconvertono in km, km/s e ore.
const PLANETS = {
  earth:   { name:'Terra', GM:3.986004e14, Rkm:6371.0,  Tday:86164.1,   col:'#3a7bd5' },
  mars:    { name:'Marte', GM:4.282837e13, Rkm:3389.5,  Tday:88642.7,   col:'#c1440e' },
  jupiter: { name:'Giove', GM:1.26687e17,  Rkm:69911,   Tday:35730,     col:'#d8a070' },
  moon:    { name:'Luna',  GM:4.9028e12,   Rkm:1737.4,  Tday:2360591.5, col:'#b9bcc4' },
};
for (const pl of Object.values(PLANETS)) {
  pl.tau = Math.sqrt(Math.pow(pl.Rkm * 1000, 3) / pl.GM);   // s per unità di tempo
  pl.M = 1; pl.R = 1; pl.Trot = pl.Tday / pl.tau;
}
const PL = () => PLANETS[P.planet];
const km   = r => r * PL().Rkm;                       // distanza (unità R) → km
const kms  = v => v * PL().Rkm / PL().tau;            // velocità → km/s
const hrs  = t => t * PL().tau / 3600;                // tempo → ore
function fmtDur(t) {                                  // durata in unità di simulazione → testo
  const sec = t * PL().tau;
  if (sec < 7200) return Lab.fmt(sec / 60, 1) + ' min';
  if (sec < 172800) return Lab.fmt(sec / 3600, 2) + ' h';
  return Lab.fmt(sec / 86400, 2) + ' giorni';
}

// ═══ Stato ════════════════════════════════════════════════════════════════════
const P = {
  planet:'earth',
  mode:'circular', // 'circular' | 'elliptical' | 'escape'
  rR: 4.0,        // distanza iniziale in raggi planetari
  vfrac: 1.0,     // velocità in frazioni di v_circolare (1=circolare, √2=fuga)
  vescFrac: 1.0,  // (modalità fuga) velocità di lancio in frazioni di v_fuga
  showGrav:true, showCentrif:true, showGeo:true,
  speed: 1.0,
};
let st={x:0,y:0,vx:0,vy:0};   // posizione/velocità satellite
let tSim=0, planetAng=0, viewRef=5, zoom=1, stopped=false;
let trail=[];
let hist=[];   // {t,r,v,L}
let gCanvas=[null,null,null], gCtx=[null,null,null];
let readout;

// ═══ Palette ══════════════════════════════════════════════════════════════════
function dk(){ return document.documentElement.dataset.theme !== 'light'; }
function pal(){
  const d=dk();
  return {
    bg:    d?'#04060d':'#e7edf4',
    txt:   d?'rgba(215,235,250,0.95)':'rgba(20,45,75,0.95)',
    sub:   d?'rgba(165,195,220,0.8)':'rgba(60,95,130,0.88)',
    accent:d?'#00d4ff':'#0a78b0',
    grav:  d?'#ff5d73':'#d61f4a',
    centr: d?'#4fd0ff':'#0a78b0',
    Lcol:  d?'#ffd24d':'#d08800',
    orbit: d?'rgba(150,180,220,0.5)':'rgba(60,95,130,0.5)',
    geo:   d?'rgba(120,255,180,0.5)':'rgba(0,150,90,0.6)',
    star:  d?'rgba(255,255,255,0.5)':'rgba(60,95,130,0.4)',
    gBg:   d?'rgb(3,9,22)':'#eef2f7',
    gAxis: d?'rgba(100,155,210,0.26)':'rgba(40,80,130,0.30)',
    gText: d?'rgba(150,205,225,0.88)':'rgba(25,65,105,0.92)',
  };
}
let T=pal();

// ═══ Fisica ═══════════════════════════════════════════════════════════════════
function GM(){ return PLANETS[P.planet].M; }
function vCirc(r){ return Math.sqrt(GM()/r); }
function vEsc(r){ return Math.sqrt(2*GM()/r); }
function rGeo(){ const pl=PLANETS[P.planet]; return Math.cbrt(pl.M*pl.Trot*pl.Trot/(4*Math.PI*Math.PI)); }
function rNow(){ return Math.hypot(st.x,st.y); }
function vNow(){ return Math.hypot(st.vx,st.vy); }
function angMom(){ return st.x*st.vy - st.y*st.vx; }   // L specifico (m=1)
function orbitParams(){
  const r=rNow(), v=vNow(), g=GM();
  const E=v*v/2 - g/r;                       // energia specifica
  const L=angMom();
  const a = E<0 ? -g/(2*E) : Infinity;
  const e = Math.sqrt(Math.max(0,1+2*E*L*L/(g*g)));
  const rapo = (E<0)? a*(1+e) : r*2.5;
  const Tper = (E<0)? 2*Math.PI*Math.sqrt(a*a*a/g) : Infinity;
  return {E,L,a,e,rapo,Tper};
}

function reset(){
  const R=PLANETS[P.planet].R;
  let r0, v0;
  if(P.mode==='escape'){            // lancio tangenziale dalla superficie
    r0=R*1.02; v0=P.vescFrac*vEsc(r0);
  } else {
    r0=P.rR*R;
    const vf=(P.mode==='circular')?1.0:P.vfrac;
    v0=vf*vCirc(r0);
  }
  st={x:r0, y:0, vx:0, vy:v0};               // velocità tangenziale (antioraria)
  tSim=0; planetAng=0; trail=[]; hist=[]; stopped=false;
  const op=orbitParams();
  viewRef = (P.mode==='escape') ? Math.max(10*R, isFinite(op.rapo)?op.rapo:10*R)
                                : Math.max(op.rapo, r0*1.1);
}

function accel(x,y){ const r=Math.hypot(x,y)||1e-6, g=GM(); const k=-g/(r*r*r); return [k*x,k*y]; }
function rk4(h){
  const s=st;
  const a1=accel(s.x,s.y);
  const k1=[s.vx,s.vy,a1[0],a1[1]];
  const a2=accel(s.x+k1[0]*h/2, s.y+k1[1]*h/2);
  const k2=[s.vx+k1[2]*h/2, s.vy+k1[3]*h/2, a2[0],a2[1]];
  const a3=accel(s.x+k2[0]*h/2, s.y+k2[1]*h/2);
  const k3=[s.vx+k2[2]*h/2, s.vy+k2[3]*h/2, a3[0],a3[1]];
  const a4=accel(s.x+k3[0]*h, s.y+k3[1]*h);
  const k4=[s.vx+k3[2]*h, s.vy+k3[3]*h, a4[0],a4[1]];
  s.x+=h/6*(k1[0]+2*k2[0]+2*k3[0]+k4[0]);
  s.y+=h/6*(k1[1]+2*k2[1]+2*k3[1]+k4[1]);
  s.vx+=h/6*(k1[2]+2*k2[2]+2*k3[2]+k4[2]);
  s.vy+=h/6*(k1[3]+2*k2[3]+2*k3[3]+k4[3]);
}
function step(dt){
  if(stopped) return;
  const adv=dt*P.speed*1.2;
  const n=Math.min(400, Math.max(1, Math.ceil(adv/0.004)));
  const h=adv/n;
  for(let i=0;i<n;i++) rk4(h);
  tSim+=adv; planetAng+=2*Math.PI/PLANETS[P.planet].Trot*adv;
  const r=rNow();
  if(r<PLANETS[P.planet].R*0.99){ stopped=true; return; }   // impatto → ferma (mostra la traiettoria)
  trail.push([st.x,st.y]); if(trail.length>1400) trail.shift();
  hist.push({t:tSim, r, v:vNow(), L:angMom()}); if(hist.length>6000) hist.shift();
  if(P.mode==='escape') viewRef=Math.max(viewRef, r*1.15);  // segue il satellite in fuga
}

// ═══ Rendering ════════════════════════════════════════════════════════════════
function vec(ctx,x1,y1,x2,y2,col,lbl){
  if(Math.hypot(x2-x1,y2-y1)<3) return;
  ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=2.4;
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  const a=Math.atan2(y2-y1,x2-x1);
  ctx.beginPath(); ctx.moveTo(x2,y2);
  ctx.lineTo(x2-9*Math.cos(a-0.4),y2-9*Math.sin(a-0.4));
  ctx.lineTo(x2-9*Math.cos(a+0.4),y2-9*Math.sin(a+0.4));
  ctx.closePath(); ctx.fill();
  if(lbl){ ctx.font='bold 11px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText(lbl,x2+11*Math.cos(a),y2+11*Math.sin(a)); }
}

function draw(canvas){
  const [ctx, W, H] = Lab.ctx2d(canvas);
  ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  drawStars(ctx,W,H);
  const pl=PLANETS[P.planet];
  const cx=W*0.42, cy=H*0.52;
  const sc=Math.min(W,H)*0.42/viewRef*zoom;
  const X=x=>cx+x*sc, Y=y=>cy-y*sc;

  // anello geostazionario
  if(P.showGeo){
    const rg=rGeo()*sc;
    ctx.strokeStyle=T.geo; ctx.lineWidth=1; ctx.setLineDash([5,5]);
    ctx.beginPath(); ctx.arc(cx,cy,rg,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle=T.geo; ctx.font='9px "Space Mono",monospace'; ctx.textAlign='center';
    ctx.fillText(P.planet==='earth'?'orbita geostazionaria':'orbita sincrona', cx, cy-rg-6);
  }

  // orbita (scia)
  if(trail.length>1){
    ctx.strokeStyle=T.orbit; ctx.lineWidth=1.2; ctx.beginPath();
    trail.forEach((p,i)=>{ const px=X(p[0]),py=Y(p[1]); i===0?ctx.moveTo(px,py):ctx.lineTo(px,py); });
    ctx.stroke();
  }

  // pianeta + rotazione (marker sulla superficie)
  const Rp=pl.R*sc;
  const g=ctx.createRadialGradient(cx-Rp*0.3,cy-Rp*0.3,Rp*0.2,cx,cy,Rp);
  g.addColorStop(0, pl.col); g.addColorStop(1, dk()?'#0a0f18':'#aab4c0');
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(cx,cy,Rp,0,Math.PI*2); ctx.fill();
  // meridiano di riferimento (rotazione del pianeta)
  ctx.strokeStyle='rgba(255,255,255,0.5)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Math.cos(planetAng)*Rp, cy-Math.sin(planetAng)*Rp); ctx.stroke();
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillText(pl.name, cx, cy+Rp+14);

  // satellite + vettori
  const sx=X(st.x), sy=Y(st.y);
  const r=rNow();
  // scala comune dei vettori: gravità ≈ 60 px, centrifuga proporzionale (relativa)
  const Fg=GM()/(r*r), K=60/Math.max(1e-3,Fg);
  const dxn=(cx-sx)/(Math.hypot(cx-sx,cy-sy)||1), dyn=(cy-sy)/(Math.hypot(cx-sx,cy-sy)||1);
  if(P.showGrav){
    vec(ctx,sx,sy, sx+dxn*Fg*K, sy+dyn*Fg*K, T.grav,'F_g');
  }
  if(P.showCentrif){
    const vt=Math.abs(angMom())/r, Fc=vt*vt/r;
    vec(ctx,sx,sy, sx-dxn*Fc*K, sy-dyn*Fc*K, T.centr,'F_cf');
  }
  // satellite (orientato lungo la velocità)
  drawSat(ctx, sx, sy, Math.atan2(-st.vy, st.vx));

  // intestazione
  const op=orbitParams();
  const type = op.E>=-1e-6 ? (op.E>1e-6?'iperbolica (fuga)':'parabolica') : (op.e<0.02?'circolare':'ellittica');
  ctx.textAlign='left';
  ctx.fillStyle=T.accent; ctx.font='bold 14px "Space Mono",monospace';
  ctx.fillText(`Orbita ${type}${op.e<1?` · e = ${Lab.fmt(op.e,3)}`:''}`, 14, 22);

  // ── messaggi in basso nel canvas ──
  ctx.textAlign='left';
  if(P.mode==='escape'){
    const ve=vEsc(PLANETS[P.planet].R*1.02), escaped=op.E>=-1e-9;
    ctx.font='bold 12px "Space Mono",monospace';
    if(stopped){ ctx.fillStyle=T.grav; ctx.fillText('💥 RICADUTO AL SUOLO (v < v_fuga)', 14, H-28); }
    else if(escaped){ ctx.fillStyle=T.geo; ctx.fillText('🚀 VELOCITÀ DI FUGA RAGGIUNTA — il satellite sfugge alla gravità', 14, H-28); }
    else { ctx.fillStyle=T.Lcol; ctx.fillText('traiettoria sub-orbitale (ricadrà)', 14, H-28); }
    ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace';
    ctx.fillText(`v_fuga = √(2GM/R) = ${Lab.fmt(kms(ve),2)} km/s   ·   v lancio = ${Lab.fmt(kms(vNow()),2)} km/s`, 14, H-12);
  } else {
    const isGeo = P.mode==='circular' && Math.abs(rNow()-rGeo()) < rGeo()*0.03;
    if(isGeo){ ctx.fillStyle=T.geo; ctx.font='bold 12px "Space Mono",monospace';
      ctx.fillText(`🛰 ${P.planet==='earth'?'GEOSTAZIONARIA':'SINCRONA'} — il satellite resta sullo stesso meridiano (${Lab.fmt(km(rGeo())/1000,0)} mila km dal centro)`, 14, H-14); }
    if(P.planet==='moon' && P.showGeo){ ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace';
      ctx.fillText('sulla Luna l’orbita sincrona (~88 000 km) è instabile: la gravità terrestre la disturba', 14, H-30); }
  }
  ctx.fillStyle=T.sub; ctx.font='11px "Space Mono",monospace';
  ctx.fillText('F_g = GMm/r²    L = m·v·r = cost.    v_circ = √(GM/r)', 14, 40);
}

// satellite stilizzato: pannelli solari + corpo + antenna parabolica
function drawSat(ctx,sx,sy,ang){
  ctx.save(); ctx.translate(sx,sy); ctx.rotate(ang);
  // pannelli solari
  ctx.fillStyle='#2a6cc0'; ctx.strokeStyle='rgba(255,255,255,0.45)'; ctx.lineWidth=0.6;
  ctx.fillRect(-15,-3.5,9,7); ctx.strokeRect(-15,-3.5,9,7);
  ctx.fillRect(6,-3.5,9,7);   ctx.strokeRect(6,-3.5,9,7);
  ctx.beginPath(); ctx.moveTo(-6,0); ctx.lineTo(6,0); ctx.stroke();        // braccio pannelli
  // corpo
  ctx.fillStyle=T.accent; ctx.fillRect(-4,-4.5,8,9);
  ctx.strokeStyle='#fff'; ctx.lineWidth=0.8; ctx.strokeRect(-4,-4.5,8,9);
  // antenna parabolica
  ctx.strokeStyle='#fff'; ctx.beginPath(); ctx.moveTo(0,-4.5); ctx.lineTo(0,-9); ctx.stroke();
  ctx.fillStyle='#e8eef6'; ctx.beginPath(); ctx.arc(0,-10,2.6,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

function drawStars(ctx,W,H){
  ctx.fillStyle=T.star;
  for(let i=0;i<70;i++){ const x=(Math.sin(i*127.1)*43758.5)%1*W, y=(Math.sin(i*311.7)*9999.7)%1*H;
    ctx.fillRect(Math.abs(x),Math.abs(y),1,1); }
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
// finestra temporale: almeno un periodo, così si vede un giro completo
function tWin(){ const Tp=orbitParams().Tper; return Math.max(8, isFinite(Tp)?Math.min(Tp,400):0); }
// serie temporale in unità reali; asse y da zero, il fondoscala cambia solo a scatti
function lineGraph(idx,key,conv,col,title){
  const win=tWin(), t1=Math.max(tSim,win), t0=t1-win;
  let hi=0; for(const h of hist) hi=Math.max(hi,conv(h[key]));
  const g=Lab.panel(gCanvas[idx],{ title, xr:[hrs(t0),hrs(t1)], yr:[0,Lab.niceMax(hi*1.15||1)], xLabel:'t (ore)', padL:52 });
  if(!g) return; const [ctx,f]=g;
  Lab.plotPts(ctx,f,hist.filter(h=>h.t>=t0).map(h=>[hrs(h.t),conv(h[key])]),col,1.8);
}
function drawGraphs(){
  lineGraph(0,'r',km,T.orbit,'Distanza dal centro r (km)');
  lineGraph(1,'v',kms,T.accent,'Velocità v (km/s)');
  // L per unità di massa = r·v_⊥, in km²/s: resta costante perché la gravità è una forza centrale
  lineGraph(2,'L',L=>Math.abs(L)*PL().Rkm*PL().Rkm/PL().tau,T.Lcol,'Momento angolare per unità di massa L (km²/s): costante');
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
function buildControls(){
  const cont=document.getElementById('controls');
  cont.innerHTML='';
  const s=Lab.Section('Pianeta');
  cont.appendChild(s.el);
  s.add(Lab.RadioGroup({
    label:'Corpo centrale',
    options:Object.keys(PLANETS).map(k=>({value:k,label:PLANETS[k].name})),
    value:P.planet, onChange(v){ P.planet=v; reset(); },
  }));

  const o=Lab.Section('Orbita');
  cont.appendChild(o.el);
  o.add(Lab.RadioGroup({
    label:'Tipo di orbita',
    options:[
      {value:'circular',  label:'Circolare'},
      {value:'elliptical',label:'Ellittica'},
      {value:'escape',    label:'Fuga (lancio dalla superficie)'},
    ],
    value:P.mode, onChange(v){ P.mode=v; if(v==='circular') P.vfrac=1; reset(); buildControls(); },
  }));
  if(P.mode==='escape'){
    o.add(Lab.Slider({ label:'Velocità lancio (×v_fuga)', min:0.5, max:1.3, step:0.01, value:P.vescFrac, unit:'',
      onChange(v){ P.vescFrac=(Math.abs(v-1)<0.04)?1:v; reset(); } }));   // snap magnetico alla velocità di fuga (×1)
  } else {
    o.add(Lab.Slider({ label:'Distanza r (raggi del pianeta)', min:1.2, max:Math.max(15,Math.ceil(rGeo()*1.15)), step:0.001, value:P.rR, unit:' R',
      onChange(v){ const rg=rGeo()/PLANETS[P.planet].R; P.rR=(Math.abs(v-rg)<0.25)?rg:v; reset(); } }));
    if(P.mode==='elliptical'){
      o.add(Lab.Slider({ label:'Velocità (×v_circ)', min:0.4, max:1.41, step:0.01, value:P.vfrac, unit:'', onChange(v){P.vfrac=v; reset();} }));
    }
  }

  const vz=Lab.Section('Visualizzazione');
  cont.appendChild(vz.el);
  vz.add(Lab.Toggle({ label:'Forza di gravità', value:P.showGrav, onChange(v){P.showGrav=v;} }));
  vz.add(Lab.Toggle({ label:'Forza centrifuga', value:P.showCentrif, onChange(v){P.showCentrif=v;} }));
  vz.add(Lab.Toggle({ label:'Anello geostazionario', value:P.showGeo, onChange(v){P.showGeo=v;} }));
  vz.add(Lab.Slider({ label:'Velocità simulazione', min:0.2, max:10, step:0.1, value:P.speed, unit:'×', onChange(v){P.speed=v;} }));
}

// ═══ Graph panel ══════════════════════════════════════════════════════════════
function initGraphs() {
  // riga di grafici standard; i titoli sono disegnati dentro i grafici
  gCanvas = Lab.graphPanels(document.getElementById('graphArea'), 3);
  gCtx = gCanvas.map(c => c.getContext('2d'));
}

// ═══ Init ═════════════════════════════════════════════════════════════════════
function init(){
  Lab.initTheme();
  buildControls();
  initGraphs();
  reset();

  const simCanvas=document.getElementById('simCanvas');
  readout=new Lab.Readout(document.getElementById('readout'),[
    {key:'r',  label:'distanza dal centro r'},
    {key:'L',  label:'quota sulla superficie'},
    {key:'v',  label:'velocità v'},
    {key:'T',  label:'periodo orbitale'},
  ]);

  document.getElementById('btnGeo').addEventListener('click',()=>{
    const rg=rGeo(); P.rR=rg/PLANETS[P.planet].R; P.mode='circular'; P.vfrac=1.0; reset(); buildControls();
  });
  document.getElementById('btnReset').addEventListener('click',()=>{
    P.planet='earth'; P.mode='circular'; P.rR=4; P.vfrac=1; P.vescFrac=1; P.speed=1; P.showGrav=true; P.showCentrif=true; P.showGeo=true;
    zoom=1; reset(); buildControls();
  });
  // zoom con la rotellina
  simCanvas.addEventListener('wheel',e=>{ e.preventDefault(); zoom=Math.max(0.3,Math.min(5, zoom*(e.deltaY<0?1.12:0.89))); },{passive:false});

  function resize(){
    const parent=simCanvas.parentElement; if(!parent)return;
    const ga=document.getElementById('graphArea'); const rb=document.getElementById('readout');
    const gaH=ga?ga.offsetHeight:0, rbH=rb?rb.offsetHeight:0;
    const w=parent.clientWidth, h=Math.max(140,(parent.clientHeight||0)-gaH-rbH);
    if(w>0){ Lab.hidpi(simCanvas, w, h); }
    Lab.fitPanels(gCanvas);
    draw(simCanvas); drawGraphs();
  }
  resize();
  new ResizeObserver(resize).observe(simCanvas.parentElement);
  window.addEventListener('load', resize);
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(resize);

  let last=performance.now();
  function frame(now){
    let dt=(now-last)/1000; if(!Number.isFinite(dt)||dt<0) dt=0; dt=Math.min(dt,0.05);
    last=now;
    step(dt);
    T=pal();
    draw(simCanvas);
    drawGraphs();
    const op=orbitParams();
    readout.set('r', Lab.fmt(km(rNow()),0)+' km');
    readout.set('L', Lab.fmt(km(rNow()-1),0)+' km');
    readout.set('v', Lab.fmt(kms(vNow()),2)+' km/s');
    readout.set('T', isFinite(op.Tper)?fmtDur(op.Tper):'∞ (fuga)');
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
