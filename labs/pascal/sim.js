'use strict';

// ═══ Stato ════════════════════════════════════════════════════════════════════
const P = {
  mode:'sfera',           // 'sfera' | 'martinetto' | 'botte'
  // sfera forata
  sfP:80,                 // pressione applicata (kPa)
  sfN:10,                 // numero di fori
  // martinetto idraulico
  mtF1:50,                // forza in ingresso (N)
  mtR1:2,                 // raggio pistone piccolo (cm)
  mtR2:8,                 // raggio pistone grande (cm)
  mtStroke:4,             // corsa del pistone piccolo (cm)
  // botte di Pascal
  btH:4,                  // altezza del tubo (m)
  btR:1.0,                // raggio del tubo (cm)
  btBurst:60,             // soglia di rottura (kPa)
  paused:false,
};
const RHO=1000, Gacc=9.81;     // acqua

let tAnim=0, last=0, sfWater=1;       // sfWater: frazione d'acqua nella sfera
let gCanvas=[null,null,null], gCtx=[null,null,null], gTitle=[null,null,null];
let readout, readoutKeys=[];

const TITLES={
  sfera:     ['Pressione ai fori','v = √(2P/ρ)','Trasmissione radiale'],
  martinetto:['F₂ vs rapporto A₂/A₁','Spostamenti  d₁ , d₂','Lavoro  W₁ = W₂'],
  botte:     ['p = ρ·g·h','Acqua nel tubo (mL)','Pressione vs soglia'],
};

// ═══ Palette ══════════════════════════════════════════════════════════════════
function dk(){ return document.documentElement.dataset.theme !== 'light'; }
function pal(){
  const d=dk();
  return {
    bg:    d?'#06090f':'#e7edf4',
    txt:   d?'rgba(225,238,250,0.96)':'rgba(20,40,70,0.95)',
    sub:   d?'rgba(165,195,220,0.82)':'rgba(60,90,125,0.9)',
    accent:d?'#00d4ff':'#0a78b0',
    glass: d?'rgba(200,218,238,0.78)':'rgba(80,110,150,0.72)',
    water: [70,140,235],
    oil:   [210,160,60],
    metal: d?[150,165,185]:[110,130,155],
    wood:  [150,95,55],
    press: [230,70,60],
    grid:  d?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.04)',
    gBg:   d?'rgb(3,9,22)':'#eef2f7',
    gAxis: d?'rgba(100,155,210,0.3)':'rgba(40,80,130,0.32)',
    gText: d?'rgba(150,205,225,0.88)':'rgba(25,65,105,0.92)',
  };
}
let T=pal();
const rgb=(a)=>`rgb(${a[0]},${a[1]},${a[2]})`;
const rgba=(a,al)=>`rgba(${a[0]},${a[1]},${a[2]},${al})`;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

// ═══ Helpers ══════════════════════════════════════════════════════════════════
function drawGrid(ctx,W,H){ ctx.strokeStyle=T.grid; ctx.lineWidth=1;
  for(let x=0;x<=W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=0;y<=H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();} }
function arrow(ctx,x1,y1,x2,y2,col,lw,lbl){
  ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=lw||2.5; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  const a=Math.atan2(y2-y1,x2-x1), s=6+(lw||2.5);
  ctx.beginPath(); ctx.moveTo(x2,y2); ctx.lineTo(x2-s*Math.cos(a-0.42),y2-s*Math.sin(a-0.42)); ctx.lineTo(x2-s*Math.cos(a+0.42),y2-s*Math.sin(a+0.42)); ctx.closePath(); ctx.fill();
  if(lbl){ ctx.font='bold 11px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText(lbl,(x1+x2)/2,Math.min(y1,y2)-6); }
}
function dimV(ctx,x,ya,yb,col,label,labSide){
  ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=1.2;
  ctx.beginPath(); ctx.moveTo(x,ya); ctx.lineTo(x,yb);
  ctx.moveTo(x-4,ya); ctx.lineTo(x+4,ya); ctx.moveTo(x-4,yb); ctx.lineTo(x+4,yb); ctx.stroke();
  const side=labSide||-1;
  ctx.font='9px "Space Mono",monospace'; ctx.textAlign=side<0?'right':'left';
  ctx.fillText(label, x+side*6, (ya+yb)/2+3);    // etichetta orizzontale
}
function crackLine(ctx,x0,y0,x1,y1){          // crepa a zig-zag deterministica
  ctx.beginPath(); ctx.moveTo(x0,y0); const n=5;
  for(let i=1;i<=n;i++){ const tt=i/n, zz=(i%2?1:-1)*5; ctx.lineTo(x0+(x1-x0)*tt+zz, y0+(y1-y0)*tt); }
  ctx.stroke();
}
function header(ctx,t1,t2){
  ctx.textAlign='left'; ctx.fillStyle=T.accent; ctx.font='bold 14px "Space Mono",monospace';
  ctx.fillText(t1,14,22);
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace'; ctx.fillText(t2,14,38);
}

// ═══ Modalità 1 — Sfera forata ════════════════════════════════════════════════
function vEffSfera(){ return Math.sqrt(2*P.sfP*1000/RHO); }
function drawSfera(ctx,W,H){
  const cx=W*0.38, cy=H*0.52, R=Math.min(W,H)*0.15;
  const KV=18, GPX=9.81*KV;                          // scala visiva: i getti raggiungono i margini
  const lw=clamp(2+P.sfP/40,2,6.5);                  // maggiore portata → getto più spesso
  const N=P.sfN;
  const waterTop=cy+R-2*R*sfWater;                    // pelo libero interno (cala col tempo)
  const nw=R*0.46, joinY=cy-Math.sqrt(Math.max(0,R*R-(nw/2)*(nw/2))), neckTop=cy-R-R*0.95;
  const headM=3*sfWater;                              // testa idrostatica (uguale per tutti i fori, cala col livello)
  const vh=Math.sqrt(2*(P.sfP*1000 + RHO*Gacc*headM)/RHO);

  // ── sfera (vetro) + acqua interna che diminuisce ──
  ctx.fillStyle=rgba(T.water,0.06); ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.fill();
  if(sfWater>0.001){ ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.clip();
    ctx.fillStyle=rgba(T.water,0.5); ctx.fillRect(cx-R, waterTop, 2*R, (cy+R)-waterTop);
    ctx.strokeStyle=rgba(T.water,0.85); ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(cx-R,waterTop); ctx.lineTo(cx+R,waterTop); ctx.stroke();
    ctx.restore(); }
  ctx.fillStyle='rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.arc(cx-R*0.32,cy-R*0.3,R*0.3,0,Math.PI*2); ctx.fill();
  // bordo della sfera con APERTURA in corrispondenza dell'imboccatura
  const aR=Math.atan2(joinY-cy, nw/2), aL=Math.atan2(joinY-cy,-nw/2);
  ctx.strokeStyle=T.glass; ctx.lineWidth=2.5; ctx.beginPath(); ctx.arc(cx,cy,R, aR, aL+Math.PI*2, false); ctx.stroke();

  // ── collo incastrato sull'apertura superiore ──
  ctx.fillStyle=rgba(T.metal,0.16); ctx.fillRect(cx-nw/2, neckTop, nw, joinY-neckTop);
  ctx.strokeStyle=T.glass; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(cx-nw/2,joinY); ctx.lineTo(cx-nw/2,neckTop);
  ctx.moveTo(cx+nw/2,joinY); ctx.lineTo(cx+nw/2,neckTop); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-nw/2-5,joinY); ctx.lineTo(cx-nw/2,joinY); ctx.moveTo(cx+nw/2,joinY); ctx.lineTo(cx+nw/2+5,joinY); ctx.stroke();   // flangia
  // pistone proporzionale alla pressione (statico, lo regola l'utente)
  const ply=neckTop + (joinY-neckTop-16)*clamp(P.sfP/200,0,1);
  ctx.fillStyle=rgb(T.metal); ctx.fillRect(cx-nw/2, ply, nw, 12); ctx.fillRect(cx-4, ply-30, 8, 30);
  arrow(ctx, cx, ply-50, cx, ply-34, rgb(T.press), 3, 'F');

  // ── getti parabolici dai fori sommersi (gravità; raggiungono i margini) ──
  for(let i=0;i<N;i++){
    const ang=-Math.PI/2 + Math.PI*2*(i+0.5)/N;
    const c=Math.cos(ang), s=Math.sin(ang);
    const ox=cx+c*R, oy=cy+s*R;
    ctx.fillStyle=T.bg; ctx.beginPath(); ctx.arc(ox,oy,3,0,Math.PI*2); ctx.fill();   // foro
    if(sfWater<=0.001 || oy<waterTop-1) continue;                                    // sopra il pelo: niente getto
    const vx=c*vh*KV, vy=s*vh*KV;                                                     // stessa velocità da ogni foro
    ctx.strokeStyle=rgba(T.water,0.85); ctx.lineWidth=lw; ctx.lineCap='round'; ctx.lineJoin='round';
    ctx.beginPath(); ctx.moveTo(ox,oy); let tend=0;
    for(let t=0.01;t<8;t+=0.02){ const xx=ox+vx*t, yy=oy+vy*t+0.5*GPX*t*t; ctx.lineTo(xx,yy); tend=t;
      if(xx<-4||xx>W+4||yy>H+4) break; }
    ctx.stroke();
    for(let k=0;k<4;k++){ const ph=((tAnim*0.7+k/4)%1)*tend; const xx=ox+vx*ph, yy=oy+vy*ph+0.5*GPX*ph*ph;
      if(xx<0||xx>W||yy>H) continue; ctx.fillStyle=rgba(T.water,0.95); ctx.beginPath(); ctx.arc(xx,yy,lw*0.72,0,Math.PI*2); ctx.fill(); }
  }

  header(ctx,'Sfera forata di Pascal:  p uguale in tutte le direzioni',
    'getti uguali in ogni direzione (anche verso l\'alto) · il livello cala e li accorcia · acqua: '+(sfWater*100).toFixed(0)+'%');
}

// ═══ Modalità 2 — Martinetto idraulico ════════════════════════════════════════
function mtCalc(){
  const A1=Math.PI*Math.pow(P.mtR1/100,2), A2=Math.PI*Math.pow(P.mtR2/100,2);
  const p=P.mtF1/A1, F2=p*A2;
  return {A1,A2,p,F2,gain:A2/A1};
}
function drawMartinetto(ctx,W,H){
  const {A1,A2,p,F2,gain}=mtCalc();
  const scale=6;                                       // px per cm
  const topY=H*0.30, baseY=H*0.74, chH=Math.max(14,H*0.05);
  const x1=W*0.34, x2=W*0.66;
  const w1=Math.max(14,P.mtR1*2*scale), w2=Math.max(22,P.mtR2*2*scale);
  const d1=P.mtStroke, d2=d1*(A1/A2);                  // spostamento impostato dall'utente
  const rest=topY+(baseY-topY)*0.42, ph=11;
  const ps1=clamp(rest+d1*scale, topY+18, baseY-6);    // pistone piccolo: lo abbassa l'utente
  const ps2=clamp(rest-d2*scale, topY+18, baseY-6);    // pistone grande: sale (poco)

  // ── fluido (entro le pareti) ──
  ctx.fillStyle=rgba(T.oil,0.5);
  ctx.fillRect(x1-w1/2, ps1, w1, baseY-ps1);                       // colonna piccola
  ctx.fillRect(x2-w2/2, ps2, w2, baseY-ps2);                       // colonna grande
  ctx.fillRect(x1-w1/2, baseY, (x2+w2/2)-(x1-w1/2), chH);          // canale di fondo

  // ── pareti: tubo a U con due diametri (cime aperte per i pistoni) ──
  ctx.strokeStyle=T.glass; ctx.lineWidth=2.5; ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.beginPath();
  ctx.moveTo(x1-w1/2,topY); ctx.lineTo(x1-w1/2,baseY+chH); ctx.lineTo(x2+w2/2,baseY+chH); ctx.lineTo(x2+w2/2,topY);  // esterne + fondo
  ctx.moveTo(x1+w1/2,topY); ctx.lineTo(x1+w1/2,baseY); ctx.lineTo(x2-w2/2,baseY); ctx.lineTo(x2-w2/2,topY);          // interne + soffitto canale
  ctx.stroke();

  // ── livello di riposo + quote di spostamento delle piattaforme ──
  ctx.strokeStyle=T.sub; ctx.setLineDash([4,3]); ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(x1-w1/2,rest); ctx.lineTo(x1+w1/2,rest);
  ctx.moveTo(x2-w2/2,rest); ctx.lineTo(x2+w2/2,rest); ctx.stroke(); ctx.setLineDash([]);
  dimV(ctx, x1-w1/2-16, rest, ps1, T.sub, 'd₁='+d1.toFixed(1)+' cm', -1);
  dimV(ctx, x2+w2/2+16, ps2, rest, T.sub, 'd₂='+d2.toFixed(2)+' cm', +1);

  // ── pistoni (larghi quanto il cilindro) ──
  ctx.fillStyle=rgb(T.metal);
  ctx.fillRect(x1-w1/2, ps1-ph, w1, ph); ctx.fillRect(x1-4, ps1-ph-22, 8, 22);   // piccolo + stelo
  ctx.fillRect(x2-w2/2, ps2-ph, w2, ph);
  const loadTop=ps2-ph-26; ctx.fillStyle=rgba(T.metal,0.85); ctx.fillRect(x2-w2*0.3, loadTop, w2*0.6, 26);   // carico

  // ── forze: lunghezza proporzionale al valore (contenuta nel cilindro), etichette FUORI dai cilindri ──
  const maxLen=64, fs=maxLen/Math.max(P.mtF1,F2,1);
  const l1=clamp(P.mtF1*fs, 14, Math.max(14, ps1-ph-12-topY));
  const l2=clamp(F2*fs,     14, Math.max(14, loadTop-12-topY));
  arrow(ctx, x1, ps1-ph-8-l1, x1, ps1-ph-8, rgb(T.press), 3);     // F₁ verso il basso sul pistone
  arrow(ctx, x2, loadTop-8, x2, loadTop-8-l2, T.accent, 3);       // F₂ verso l'alto (solleva il carico)
  ctx.font='bold 11px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillStyle=rgb(T.press); ctx.fillText('F₁ = '+P.mtF1.toFixed(0)+' N', x1, topY-9);   // sopra il cilindro
  ctx.fillStyle=T.accent;     ctx.fillText('F₂ = '+F2.toFixed(0)+' N', x2, topY-9);

  // ── aree (sotto la struttura) ──
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace'; ctx.textAlign='center';
  ctx.fillText('A₁ = '+Lab.fmt((A1*1e4),1)+' cm²', x1, baseY+chH+16);
  ctx.fillText('A₂ = '+Lab.fmt((A2*1e4),1)+' cm²', x2, baseY+chH+16);

  header(ctx,'Martinetto idraulico:  p = F₁/A₁ = F₂/A₂',
    'F₂ = F₁·(A₂/A₁) = '+gain.toFixed(1)+'×F₁   ·   carico max ≈ '+(F2/Gacc).toFixed(1)+' kg   ·   p = '+(p/1000).toFixed(1)+' kPa');
}

// ═══ Modalità 3 — Botte di Pascal ═════════════════════════════════════════════
function btCalc(){
  const Hb=0.9;                                     // altezza botte (m)
  const p=RHO*Gacc*(P.btH+Hb);                      // pressione (gauge) alla base
  const vol=Math.PI*Math.pow(P.btR/100,2)*P.btH*1e6;// mL nel tubo
  return {Hb,p,vol,burst:p>P.btBurst*1000};
}
function drawBotte(ctx,W,H){
  const {Hb,p,vol,burst}=btCalc();
  const topY=H*0.07, groundY=H*0.88, cx=W*0.46;
  const bh=clamp(0.42*(groundY-topY),130,210), bw=clamp(bh*0.82,90,W*0.34), by0=groundY-bh;   // botte FISSA, più alta che larga
  const halfAt=f=> bw/2*(0.80+0.20*Math.sin(Math.PI*clamp(f,0,1)));   // pancia centrale
  const yAt=f=> by0 + clamp(f,0,1)*bh;
  const availTube=by0-topY-6, pxTube=availTube/10;                    // il tubo si allunga SENZA schiacciare la botte
  const th=clamp(P.btH*pxTube, 8, availTube), tw=clamp(P.btR*2*5,6,30), tx=cx, tyTop=by0-th;

  // ── acqua interna ──
  ctx.save(); ctx.beginPath();
  ctx.moveTo(cx-halfAt(0),by0);
  for(let f=0;f<=1.0001;f+=0.1) ctx.lineTo(cx-halfAt(f),yAt(f));
  for(let f=1;f>=-0.0001;f-=0.1) ctx.lineTo(cx+halfAt(f),yAt(f));
  ctx.closePath(); ctx.clip();
  const wg=ctx.createLinearGradient(0,by0,0,groundY); wg.addColorStop(0,rgba(T.water,0.42)); wg.addColorStop(1,rgba([40,95,180],0.6));
  ctx.fillStyle=wg; ctx.fillRect(cx-bw,by0-2,2*bw,bh+4); ctx.restore();

  // ── doghe ──
  ctx.strokeStyle=rgba(T.wood,0.5); ctx.lineWidth=1.4;
  for(let k=-3;k<=3;k++){ const fx=k/3.6; ctx.beginPath();
    for(let f=0;f<=1.0001;f+=0.1){ const x=cx+fx*halfAt(f), y=yAt(f); f===0?ctx.moveTo(x,y):ctx.lineTo(x,y);} ctx.stroke(); }
  // ── profilo ──
  ctx.strokeStyle=rgb(T.wood); ctx.lineWidth=3; ctx.lineJoin='round'; ctx.beginPath();
  for(let f=0;f<=1.0001;f+=0.05){ const x=cx-halfAt(f), y=yAt(f); f===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}
  for(let f=1;f>=-0.0001;f-=0.05){ ctx.lineTo(cx+halfAt(f),yAt(f)); } ctx.closePath(); ctx.stroke();
  // ── cerchiature ──
  ctx.strokeStyle=rgba(T.metal,0.95); ctx.lineWidth=5;
  for(const f of [0.07,0.5,0.93]){ const hw=halfAt(f), y=yAt(f); ctx.beginPath(); ctx.moveTo(cx-hw-2,y); ctx.lineTo(cx+hw+2,y); ctx.stroke(); }

  // ── tubo di vetro (gradiente, riflesso, imbuto, menisco) incastrato nel coperchio ──
  const tg=ctx.createLinearGradient(tx-tw/2,0,tx+tw/2,0);
  tg.addColorStop(0,rgba([40,95,180],0.75)); tg.addColorStop(0.45,rgba(T.water,0.6)); tg.addColorStop(1,rgba([40,95,180],0.7));
  ctx.fillStyle=tg; ctx.fillRect(tx-tw/2, tyTop, tw, (by0+3)-tyTop);
  ctx.strokeStyle=T.glass; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(tx-tw/2,tyTop); ctx.lineTo(tx-tw/2,by0+3); ctx.moveTo(tx+tw/2,tyTop); ctx.lineTo(tx+tw/2,by0+3); ctx.stroke();
  ctx.strokeStyle='rgba(255,255,255,0.25)'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(tx-tw/2+2,tyTop+5); ctx.lineTo(tx-tw/2+2,by0); ctx.stroke();
  ctx.fillStyle=rgba(T.water,0.5); ctx.beginPath(); ctx.moveTo(tx-tw/2-9,tyTop-10); ctx.lineTo(tx+tw/2+9,tyTop-10); ctx.lineTo(tx+tw/2,tyTop); ctx.lineTo(tx-tw/2,tyTop); ctx.closePath(); ctx.fill();
  ctx.strokeStyle=T.glass; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(tx-tw/2-9,tyTop-10); ctx.lineTo(tx-tw/2,tyTop); ctx.moveTo(tx+tw/2+9,tyTop-10); ctx.lineTo(tx+tw/2,tyTop); ctx.stroke();
  ctx.strokeStyle=rgba(T.water,0.9); ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(tx-tw/2,tyTop+1); ctx.lineTo(tx+tw/2,tyTop+1); ctx.stroke();
  // ── coperchio ──
  ctx.fillStyle=rgb(T.wood); ctx.beginPath(); ctx.ellipse(cx,by0,halfAt(0),7,0,0,Math.PI*2); ctx.fill();

  // quota altezza colonna
  ctx.strokeStyle=rgba(T.press,0.5); ctx.setLineDash([4,3]); ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(tx+tw/2+9, tyTop); ctx.lineTo(tx+tw/2+38, tyTop);
  ctx.moveTo(cx+halfAt(0.5), groundY); ctx.lineTo(tx+tw/2+38, groundY); ctx.stroke(); ctx.setLineDash([]);
  ctx.save(); ctx.translate(tx+tw/2+30,(tyTop+groundY)/2); ctx.rotate(-Math.PI/2);
  ctx.fillStyle=T.sub; ctx.font='10px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText('h = '+(P.btH+Hb).toFixed(2)+' m',0,0); ctx.restore();

  // ── rottura migliorata: getti potenti, crepe, pozza ──
  if(burst){
    const over=clamp(p/(P.btBurst*1000),1,2.4);
    for(let i=0;i<6;i++){ const f=0.30+0.45*(i/5), side=i%2?1:-1, ex=cx+side*halfAt(f), ey=yAt(f), vx=side*(7+5*over);
      ctx.strokeStyle=rgba(T.water,0.8); ctx.lineWidth=3+over*0.8; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(ex,ey);
      for(let t=0.02;t<2.4;t+=0.04){ const xx=ex+vx*26*t, yy=ey-8*t+0.5*150*t*t; ctx.lineTo(xx,yy); if(yy>H||xx<0||xx>W)break; } ctx.stroke();
      const ph=((tAnim*0.9+i/6)%1)*2.0, gx=ex+vx*26*ph, gy=ey-8*ph+0.5*150*ph*ph;
      if(gx>0&&gx<W&&gy<H){ ctx.fillStyle=rgba(T.water,0.92); ctx.beginPath(); ctx.arc(gx,gy,2.6,0,Math.PI*2); ctx.fill(); }
    }
    ctx.strokeStyle=rgb(T.press); ctx.lineWidth=2;
    crackLine(ctx, cx-halfAt(0.5)*0.25, yAt(0.22), cx-halfAt(0.75), yAt(0.8));
    crackLine(ctx, cx+halfAt(0.4)*0.35, yAt(0.28), cx+halfAt(0.7), yAt(0.82));
    ctx.fillStyle=rgba(T.water,0.28); ctx.beginPath(); ctx.ellipse(cx,groundY+5,bw*0.85,7,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=rgb(T.press); ctx.font='bold 13px "Space Mono",monospace'; ctx.textAlign='center'; ctx.fillText('💥 LA BOTTE SI ROMPE!', cx, groundY+24);
  }

  header(ctx,'Botte di Pascal (1646):  p = ρ·g·h',
    'p alla base = '+(p/1000).toFixed(1)+' kPa  ·  soglia '+P.btBurst+' kPa  ·  acqua nel tubo solo '+vol.toFixed(0)+' mL');
}

// ═══ Draw ═════════════════════════════════════════════════════════════════════
function draw(canvas){
  const [ctx, W, H] = Lab.ctx2d(canvas);
  T=pal(); ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
  drawGrid(ctx,W,H);
  if(P.mode==='sfera') drawSfera(ctx,W,H);
  else if(P.mode==='martinetto') drawMartinetto(ctx,W,H);
  else drawBotte(ctx,W,H);
}

// ═══ Grafici ══════════════════════════════════════════════════════════════════
// istogramma con asse numerato
function bars(i,title,vals,cols,labels,unitFmt){
  const max=Lab.niceMax(Math.max(...vals,1e-6)*1.15);
  const g=Lab.panel(gCanvas[i],{ title, xr:[0,vals.length], xStep:1e9, xFmt:()=> '', yr:[0,max] });
  if(!g) return; const [ctx,f]=g, gap=(f.R-f.L)/vals.length, bw=gap*0.6;
  vals.forEach((v,k)=>{ const x=f.L+gap*k+(gap-bw)/2, y=f.Y(v);
    ctx.fillStyle=cols[k]; ctx.fillRect(x,y,bw,f.B-y);
    ctx.font='9.5px "Space Mono",monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
    if(unitFmt && vals.length<=4){ ctx.fillStyle=f.C.title; ctx.fillText(unitFmt(v),x+bw/2,y-8); }
    ctx.fillStyle=f.C.text; ctx.fillText(labels[k],x+bw/2,f.B+10); });
}
function drawGraphs(){
  if(P.mode==='sfera'){
    // 1: la pressione è la stessa a ogni foro
    const N=Math.min(P.sfN,10), v=Array.from({length:N},()=>P.sfP);
    bars(0,'Pressione a ogni foro (kPa): tutte uguali',v,v.map(()=>rgb(T.water)),v.map((_,i)=>String(i+1)));
    // 2: velocità dei getti v = √(2p/ρ)
    const g=Lab.panel(gCanvas[1],{ title:'Velocità dei getti v = √(2p/ρ) (m/s)', xr:[0,200], yr:[0,Lab.niceMax(Math.sqrt(2*200e3/RHO))], xLabel:'pressione applicata (kPa)' });
    if(g){ const [ctx,f]=g; Lab.plot(ctx,f,pp=>Math.sqrt(2*pp*1000/RHO),[0,200],T.accent,2); Lab.dot(ctx,f,P.sfP,vEffSfera(),rgb(T.water),4.5); }
    // 3: schema della trasmissione in tutte le direzioni (non è un grafico)
    if(gCanvas[2]._dpr){ const [ctx,W,H]=Lab.ctx2d(gCanvas[2]), C=Lab.graphColors();
      ctx.fillStyle=C.bg; ctx.fillRect(0,0,W,H);
      ctx.fillStyle=C.text; ctx.font='10.5px "DM Sans",sans-serif'; ctx.textAlign='left'; ctx.textBaseline='middle';
      ctx.fillText('La pressione si trasmette ugualmente in ogni direzione',8,11);
      const cx=W/2, cy=H/2+8, r=Math.min(W,H)*0.15, N2=P.sfN;
      for(let i=0;i<N2;i++){ const a=Math.PI*2*i/N2; arrow(ctx,cx+Math.cos(a)*r,cy+Math.sin(a)*r,cx+Math.cos(a)*r*2.1,cy+Math.sin(a)*r*2.1,rgb(T.water),1.6); }
      ctx.fillStyle=rgba(T.water,0.4); ctx.beginPath(); ctx.arc(cx,cy,r*0.7,0,7); ctx.fill(); }
  }
  else if(P.mode==='martinetto'){
    const {A1,A2,F2,gain}=mtCalc();
    // 1: forza in uscita F₂ = F₁·A₂/A₁
    const g=Lab.panel(gCanvas[0],{ title:'Forza in uscita F₂ = F₁·A₂/A₁ (N)', xr:[0,40], yr:[0,Lab.niceMax(P.mtF1*40)], xLabel:'rapporto delle aree A₂/A₁' });
    if(g){ const [ctx,f]=g; Lab.plot(ctx,f,r=>P.mtF1*r,[0,40],T.accent,2); Lab.dot(ctx,f,gain,F2,T.accent,4.5); }
    // 2: spostamenti: il pistone grande si muove molto meno
    const d1=P.mtStroke, d2=P.mtStroke*(A1/A2);
    bars(1,'Spostamento dei pistoni (cm)',[d1,d2],[rgb(T.press),T.accent],['piccolo d₁','grande d₂'],v=>Lab.fmt(v,2));
    // 3: il lavoro si conserva: nessuna energia "gratis"
    const W1=P.mtF1*(P.mtStroke/100), W2=F2*(d2/100);
    bars(2,'Lavoro compiuto (J): W₁ = W₂',[W1,W2],[rgb(T.press),T.accent],['in ingresso W₁','in uscita W₂'],v=>Lab.fmt(v,2));
  }
  else {
    const {Hb,p}=btCalc();
    // 1: pressione sul fondo p = ρ·g·h (sopra quella atmosferica) e soglia di rottura
    const hmax=10+Hb, pm=Lab.niceMax(Math.max(RHO*Gacc*hmax/1000,P.btBurst));
    let g=Lab.panel(gCanvas[0],{ title:'Pressione sul fondo p = ρ·g·h (kPa)', xr:[0,hmax], yr:[0,pm], xLabel:'altezza dell’acqua (m)' });
    if(g){ const [ctx,f]=g;
      ctx.save(); ctx.setLineDash([3,3]); ctx.strokeStyle=rgb(T.press); ctx.beginPath(); ctx.moveTo(f.L,f.Y(P.btBurst)); ctx.lineTo(f.R,f.Y(P.btBurst)); ctx.stroke(); ctx.restore();
      Lab.plot(ctx,f,h=>RHO*Gacc*h/1000,[0,hmax],T.accent,2);
      Lab.dot(ctx,f,P.btH+Hb,p/1000,rgb(p>P.btBurst*1000?T.press:T.water),4.5);
      Lab.legend(ctx,f.L+8,f.T+8,[[rgb(T.press),'soglia di rottura',[3,3]]]); }
    // 2: l'acqua nel tubo è pochissima, eppure basta a rompere la botte
    const vm=Lab.niceMax(Math.PI*Math.pow(P.btR/100,2)*10*1e6);
    g=Lab.panel(gCanvas[1],{ title:'Acqua nel tubo (mL)', xr:[0,10], yr:[0,vm], xLabel:'altezza del tubo (m)' });
    if(g){ const [ctx,f]=g; const V=h=>Math.PI*Math.pow(P.btR/100,2)*h*1e6;
      Lab.plot(ctx,f,V,[0,10],rgb(T.water),2); Lab.dot(ctx,f,P.btH,V(P.btH),rgb(T.water),4.5); }
    // 3: pressione raggiunta e soglia
    bars(2,'Pressione sul fondo e soglia (kPa)',[p/1000,P.btBurst],[rgb(p>P.btBurst*1000?T.press:T.water),rgb(T.press)],['pressione','soglia'],v=>Lab.fmt(v,1));
  }
}

// ═══ Controlli ════════════════════════════════════════════════════════════════
function reControls(){ setTimeout(()=>{ buildControls(); buildReadout(); },0); }
function buildControls(){
  const cont=document.getElementById('controls'); cont.innerHTML='';
  const secM=Lab.Section('Modalità'); cont.appendChild(secM.el);
  secM.add(Lab.RadioGroup({ label:'Apparecchio', value:P.mode, options:[
    {value:'sfera',label:'Sfera forata'},
    {value:'martinetto',label:'Martinetto idraulico'},
    {value:'botte',label:'Botte di Pascal'},
  ], onChange(v){ P.mode=v; reControls(); } }));

  if(P.mode==='sfera'){
    const s=Lab.Section('Sfera forata'); cont.appendChild(s.el);
    s.add(Lab.Slider({ label:'Pressione applicata', min:0, max:200, step:5, value:P.sfP, unit:' kPa', onChange(v){P.sfP=v; sfWater=1;} }));
    s.add(Lab.Slider({ label:'Numero di fori', min:4, max:16, step:1, value:P.sfN, unit:'', onChange(v){P.sfN=v;} }));
  } else if(P.mode==='martinetto'){
    const s=Lab.Section('Martinetto idraulico'); cont.appendChild(s.el);
    s.add(Lab.Slider({ label:'Forza in ingresso F₁', min:5, max:200, step:5, value:P.mtF1, unit:' N', onChange(v){P.mtF1=v;} }));
    s.add(Lab.Slider({ label:'Raggio pistone piccolo', min:1, max:5, step:0.5, value:P.mtR1, unit:' cm', onChange(v){P.mtR1=v;} }));
    s.add(Lab.Slider({ label:'Raggio pistone grande', min:4, max:14, step:0.5, value:P.mtR2, unit:' cm', onChange(v){P.mtR2=v;} }));
    s.add(Lab.Slider({ label:'Spostamento pistone piccolo d₁', min:0, max:8, step:0.5, value:P.mtStroke, unit:' cm', onChange(v){P.mtStroke=v;} }));
  } else {
    const s=Lab.Section('Botte di Pascal'); cont.appendChild(s.el);
    s.add(Lab.Slider({ label:'Altezza del tubo', min:0.5, max:10, step:0.1, value:P.btH, unit:' m', onChange(v){P.btH=v;} }));
    s.add(Lab.Slider({ label:'Raggio del tubo', min:0.2, max:3, step:0.1, value:P.btR, unit:' cm', onChange(v){P.btR=v;} }));
    s.add(Lab.Slider({ label:'Soglia di rottura', min:20, max:120, step:5, value:P.btBurst, unit:' kPa', onChange(v){P.btBurst=v;} }));
  }
}

function buildReadout(){
  const cont=document.getElementById('readout'); cont.innerHTML='';
  let fields;
  if(P.mode==='sfera') fields=[{key:'p',label:'Pressione applicata'},{key:'v',label:'v efflusso'},{key:'n',label:'Numero fori'},{key:'w',label:'Acqua nella sfera'}];
  else if(P.mode==='martinetto') fields=[{key:'P',label:'Pressione fluido'},{key:'F2',label:'Forza in uscita F₂'},{key:'gain',label:'Guadagno F₂/F₁'},{key:'disp',label:'Spostamenti d₁ → d₂'}];
  else fields=[{key:'h',label:'Altezza colonna'},{key:'pb',label:'Pressione alla base'},{key:'vol',label:'Acqua nel tubo'},{key:'st',label:'Stato botte'}];
  readout=new Lab.Readout(cont,fields); readoutKeys=fields.map(f=>f.key);
}

function initGraphs(){
  // riga di grafici standard (Lab.graphPanels); i titoli sono disegnati dentro i grafici
  gCanvas = Lab.graphPanels(document.getElementById('graphArea'), 3);
  gCtx = gCanvas.map(c => c.getContext('2d'));
  gTitle = gCanvas.map(() => ({ textContent: '' }));
}

// ═══ Init ═════════════════════════════════════════════════════════════════════
function init(){
  Lab.initTheme();
  buildControls(); initGraphs(); buildReadout();
  const simCanvas=document.getElementById('simCanvas');

  const btnPlay=document.getElementById('btnPlay');
  function syncPlay(){ btnPlay.textContent = P.paused ? '▶  AVVIA' : '⏸  PAUSA'; }
  syncPlay();
  btnPlay.addEventListener('click',()=>{ P.paused=!P.paused; syncPlay(); });
  document.getElementById('btnReset').addEventListener('click',()=>{
    P.mode='sfera'; P.sfP=80; P.sfN=10; P.mtF1=50; P.mtR1=2; P.mtR2=8; P.mtStroke=4;
    P.btH=4; P.btR=1.0; P.btBurst=60; P.paused=false; sfWater=1;
    buildControls(); buildReadout(); syncPlay();
  });

  function resize(){
    const area=document.querySelector('.lab-canvas-area'); if(!area)return;
    const ar=area.getBoundingClientRect();
    const rb=document.getElementById('readout').getBoundingClientRect();
    const ga=document.getElementById('graphArea'); const gaH=ga?ga.offsetHeight:0;
    const h=Math.max(240,Math.floor(ar.height-rb.height-gaH-4));
    Lab.hidpi(simCanvas, Math.floor(ar.width), h);
    Lab.fitPanels(gCanvas);
  }
  resize();
  new ResizeObserver(resize).observe(document.querySelector('.lab-canvas-area'));
  window.addEventListener('load', resize);
  if(document.fonts&&document.fonts.ready) document.fonts.ready.then(resize);

  last=performance.now();
  function frame(now){
    let dt=(now-last)/1000; last=now;
    if(!Number.isFinite(dt)||dt<0) dt=0; dt=Math.min(dt,0.05);
    if(!P.paused){ tAnim+=dt;
      if(P.mode==='sfera' && sfWater>0) sfWater=clamp(sfWater - clamp(vEffSfera()*0.006,0,0.4)*dt, 0, 1);   // l'acqua cala col tempo
    }
    try{
      draw(simCanvas); drawGraphs();
      if(P.mode==='sfera'){
        readout.set('p', Lab.fmt(P.sfP,0)+' kPa'); readout.set('v', Lab.fmt(vEffSfera(),1)+' m/s');
        readout.set('n', String(P.sfN)); readout.set('w', Lab.fmt((sfWater*100),0)+'%');
      } else if(P.mode==='martinetto'){
        const {A1,A2,p,F2,gain}=mtCalc(); const d2=P.mtStroke*(A1/A2);
        readout.set('P',Lab.fmt((p/1000),1)+' kPa'); readout.set('F2',Lab.fmt(F2,0)+' N');
        readout.set('gain',Lab.fmt(gain,1)+'×'); readout.set('disp',Lab.fmt(P.mtStroke,1)+' → '+Lab.fmt(d2,2)+' cm');
      } else {
        const {p,vol,burst}=btCalc();
        readout.set('h',Lab.fmt((P.btH+0.9),2)+' m'); readout.set('pb',Lab.fmt((p/1000),1)+' kPa');
        readout.set('vol',Lab.fmt(vol,0)+' mL'); readout.set('st', burst?'ROTTA 💥':'integra');
      }
    }catch(err){ console.error(err); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
else init();
