'use strict';

/* ── Dati ───────────────────────────────────────────────────────────────── */
const OBJECTS = [
  { id:'sun',      name:'Sole',      type:'star',  symbol:'☉',
    radius:695700, mass:1.989e30, density:1408,
    rotPeriod:25.38, orbPeriod:null, synPeriod:null,
    sma:null, perihelion:null, aphelion:null, ecc:null, orbV:null, incl:null,
    color:'#FFD028', parent:null },

  { id:'mercury',  name:'Mercurio',  type:'planet', symbol:'☿',
    radius:2439.7, mass:3.301e23, density:5427,
    rotPeriod:58.65, orbPeriod:0.2408, synPeriod:115.88,
    sma:0.387, perihelion:0.307, aphelion:0.467, ecc:0.206, orbV:47.36, incl:7.00,
    color:'#9A9090', parent:'sun' },

  { id:'venus',    name:'Venere',    type:'planet', symbol:'♀',
    radius:6051.8, mass:4.867e24, density:5243,
    rotPeriod:-243.02, orbPeriod:0.6152, synPeriod:583.92,
    sma:0.723, perihelion:0.718, aphelion:0.728, ecc:0.007, orbV:35.02, incl:3.39,
    color:'#E8C87A', parent:'sun' },

  { id:'earth',    name:'Terra',     type:'planet', symbol:'⊕',
    radius:6371,   mass:5.972e24, density:5514,
    rotPeriod:0.997, orbPeriod:1.000, synPeriod:null,
    sma:1.000, perihelion:0.983, aphelion:1.017, ecc:0.017, orbV:29.78, incl:0.00,
    color:'#4B8FCC', parent:'sun' },

  { id:'mars',     name:'Marte',     type:'planet', symbol:'♂',
    radius:3389.5, mass:6.417e23, density:3933,
    rotPeriod:1.026, orbPeriod:1.881, synPeriod:779.94,
    sma:1.524, perihelion:1.381, aphelion:1.666, ecc:0.094, orbV:24.07, incl:1.85,
    color:'#CC5533', parent:'sun' },

  { id:'jupiter',  name:'Giove',     type:'planet', symbol:'♃',
    radius:71492,  mass:1.898e27, density:1326,
    rotPeriod:0.413, orbPeriod:11.862, synPeriod:398.88,
    sma:5.203, perihelion:4.950, aphelion:5.457, ecc:0.049, orbV:13.07, incl:1.30,
    color:'#C88B3A', parent:'sun' },

  { id:'saturn',   name:'Saturno',   type:'planet', symbol:'♄',
    radius:60268,  mass:5.683e26, density:687,
    rotPeriod:0.444, orbPeriod:29.457, synPeriod:378.09,
    sma:9.537, perihelion:9.041, aphelion:10.124, ecc:0.057, orbV:9.69, incl:2.49,
    color:'#E8D5A3', hasRings:true, parent:'sun' },

  { id:'uranus',   name:'Urano',     type:'planet', symbol:'⛢',
    radius:25559,  mass:8.681e25, density:1271,
    rotPeriod:-0.718, orbPeriod:84.011, synPeriod:369.66,
    sma:19.189, perihelion:18.286, aphelion:20.096, ecc:0.047, orbV:6.81, incl:0.77,
    color:'#7FCED8', parent:'sun' },

  { id:'neptune',  name:'Nettuno',   type:'planet', symbol:'♆',
    radius:24622,  mass:1.024e26, density:1638,
    rotPeriod:0.671, orbPeriod:164.79, synPeriod:367.49,
    sma:30.070, perihelion:29.810, aphelion:30.327, ecc:0.010, orbV:5.43, incl:1.77,
    color:'#3D60CC', parent:'sun' },

  { id:'ceres',    name:'Cerere',    type:'dwarf', symbol:'⚳',
    radius:469.7,  mass:9.393e20, density:2162,
    rotPeriod:0.378, orbPeriod:4.599, synPeriod:466.66,
    sma:2.769, perihelion:2.553, aphelion:2.984, ecc:0.076, orbV:17.88, incl:10.59,
    color:'#A0A080', parent:'sun' },

  { id:'pluto',    name:'Plutone',   type:'dwarf', symbol:'♇',
    radius:1188.3, mass:1.303e22, density:1854,
    rotPeriod:-6.387, orbPeriod:247.94, synPeriod:366.72,
    sma:39.482, perihelion:29.658, aphelion:49.305, ecc:0.249, orbV:4.74, incl:17.14,
    color:'#C8A882', parent:'sun' },

  { id:'haumea',   name:'Haumea',    type:'dwarf', symbol:'',
    radius:816,    mass:4.006e21, density:2018,
    rotPeriod:0.163, orbPeriod:283.84, synPeriod:null,
    sma:43.13, perihelion:34.72, aphelion:51.54, ecc:0.195, orbV:4.53, incl:28.19,
    color:'#D0C8B0', parent:'sun' },

  { id:'makemake', name:'Makemake',  type:'dwarf', symbol:'',
    radius:715,    mass:3.1e21, density:1700,
    rotPeriod:0.324, orbPeriod:305.34, synPeriod:null,
    sma:45.79, perihelion:38.59, aphelion:52.84, ecc:0.159, orbV:4.42, incl:28.96,
    color:'#C8A0A0', parent:'sun' },

  { id:'eris',     name:'Eris',      type:'dwarf', symbol:'',
    radius:1163,   mass:1.66e22, density:2520,
    rotPeriod:15.79, orbPeriod:558.97, synPeriod:null,
    sma:67.8, perihelion:38.3, aphelion:97.7, ecc:0.436, orbV:3.44, incl:44.04,
    color:'#D0D0C8', parent:'sun' },

  /* Lune */
  { id:'moon',     name:'Luna',      type:'moon', symbol:'☽',
    radius:1737.4, mass:7.342e22, density:3346,
    rotPeriod:27.32, orbPeriod:27.32/365.25, synPeriod:29.53,
    smaKm:384400, periKm:362600, aphKm:405500, ecc:0.055, orbV:1.022, incl:5.14,
    color:'#B8B8B0', parent:'earth' },

  { id:'io',       name:'Io',        type:'moon', symbol:'',
    radius:1821.6, mass:8.932e22, density:3528,
    rotPeriod:1.769, orbPeriod:1.769/365.25, synPeriod:null,
    smaKm:421700, ecc:0.004, orbV:17.33, incl:0.04,
    color:'#E8D060', parent:'jupiter' },

  { id:'europa',   name:'Europa',    type:'moon', symbol:'',
    radius:1560.8, mass:4.800e22, density:3013,
    rotPeriod:3.551, orbPeriod:3.551/365.25, synPeriod:null,
    smaKm:671100, ecc:0.009, orbV:13.74, incl:0.47,
    color:'#C8B090', parent:'jupiter' },

  { id:'ganymede', name:'Ganimede',  type:'moon', symbol:'',
    radius:2634.1, mass:1.482e23, density:1936,
    rotPeriod:7.155, orbPeriod:7.155/365.25, synPeriod:null,
    smaKm:1070400, ecc:0.001, orbV:10.88, incl:0.20,
    color:'#A0A098', parent:'jupiter' },

  { id:'callisto', name:'Callisto',  type:'moon', symbol:'',
    radius:2410.3, mass:1.076e23, density:1834,
    rotPeriod:16.69, orbPeriod:16.69/365.25, synPeriod:null,
    smaKm:1882700, ecc:0.007, orbV:8.20, incl:0.19,
    color:'#706860', parent:'jupiter' },

  { id:'titan',    name:'Titano',    type:'moon', symbol:'',
    radius:2574.7, mass:1.345e23, density:1882,
    rotPeriod:15.945, orbPeriod:15.945/365.25, synPeriod:null,
    smaKm:1221870, ecc:0.029, orbV:5.57, incl:0.33,
    color:'#D0A040', parent:'saturn' },

  { id:'enceladus',name:'Encelado',  type:'moon', symbol:'',
    radius:252.1,  mass:1.08e20, density:1609,
    rotPeriod:1.370, orbPeriod:1.370/365.25, synPeriod:null,
    smaKm:237948, ecc:0.047, orbV:12.64, incl:0.02,
    color:'#F0F4F8', parent:'saturn' },

  { id:'rhea',     name:'Rea',       type:'moon', symbol:'',
    radius:763.8,  mass:2.307e21, density:1236,
    rotPeriod:4.518, orbPeriod:4.518/365.25, synPeriod:null,
    smaKm:527108, ecc:0.001, orbV:8.48, incl:0.35,
    color:'#B0A898', parent:'saturn' },

  { id:'triton',   name:'Tritone',   type:'moon', symbol:'',
    radius:1353.4, mass:2.139e22, density:2061,
    rotPeriod:-5.877, orbPeriod:5.877/365.25, synPeriod:null,
    smaKm:354759, ecc:0.000016, orbV:4.39, incl:156.87,
    color:'#A0B8C0', parent:'neptune' },

  { id:'charon',   name:'Caronte',   type:'moon', symbol:'',
    radius:606,    mass:1.586e21, density:1702,
    rotPeriod:6.387, orbPeriod:6.387/365.25, synPeriod:null,
    smaKm:19591, ecc:0.0002, orbV:0.226, incl:0.001,
    color:'#C0B8B0', parent:'pluto' },
];

const BY_ID = Object.fromEntries(OBJECTS.map(o=>[o.id,o]));

const TYPE_LABEL = {star:'Stella', planet:'Pianeta', dwarf:'Pianeta nano', moon:'Satellite'};
const TYPE_COLOR = {star:'rgba(255,200,50,0.2)',planet:'rgba(0,212,255,0.12)',dwarf:'rgba(160,100,255,0.12)',moon:'rgba(80,200,80,0.12)'};
const TYPE_TEXT  = {star:'#FFD028',planet:'#00d4ff',dwarf:'#b080ff',moon:'#70c870'};

function isDark() { return document.documentElement.dataset.theme !== 'light'; }

/* ── Corpo realistico ───────────────────────────────────────────────────── */
function drawRealisticBody(ctx, cx, cy, r, obj) {
  if (r < 1) {
    ctx.beginPath(); ctx.arc(cx,cy,Math.max(1,r),0,Math.PI*2);
    ctx.fillStyle=obj.color; ctx.fill(); return;
  }

  /* Glow per stelle: larghezza della corona limitata (non r*fattore) — a scala reale (tab
     Dimensioni, "Con Sole") r può arrivare a centinaia di px, e un raggio esterno proporzionale
     (es. r*1.6) supera facilmente le dimensioni del canvas: la sfumatura non fa in tempo a
     raggiungere alpha 0 prima del bordo del canvas, che la ritaglia di netto mostrando un
     "quadrato" (i tre lati non curvi del rettangolo canvas) invece di un alone morbido */
  if (obj.type==='star') {
    const glowW=Math.min(r*0.6, 60);
    const gg=ctx.createRadialGradient(cx,cy,r,cx,cy,r+glowW);
    gg.addColorStop(0,'rgba(255,200,50,0.35)'); gg.addColorStop(1,'rgba(255,140,10,0)');
    ctx.beginPath(); ctx.arc(cx,cy,r+glowW,0,Math.PI*2); ctx.fillStyle=gg; ctx.fill();
  }

  /* Atmosfera per pianeti con aria */
  if (['venus','earth','uranus','neptune'].includes(obj.id) && r>4) {
    const atm=obj.id==='earth'?'rgba(80,140,255,0.20)':obj.id==='venus'?'rgba(220,180,80,0.15)':'rgba(100,200,230,0.12)';
    const ag=ctx.createRadialGradient(cx,cy,r,cx,cy,r*1.12);
    ag.addColorStop(0,atm); ag.addColorStop(1,'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.arc(cx,cy,r*1.12,0,Math.PI*2); ctx.fillStyle=ag; ctx.fill();
  }

  ctx.save();
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.clip();

  const id=obj.id;

  if (id==='sun') {
    const g=ctx.createRadialGradient(cx-r*0.22,cy-r*0.28,0,cx,cy,r);
    g.addColorStop(0,'#FFFEF8'); g.addColorStop(0.15,'#FFF380');
    g.addColorStop(0.38,'#FFCC00'); g.addColorStop(0.62,'#FF8800');
    g.addColorStop(0.82,'#EE4400'); g.addColorStop(1,'#C02800');
    ctx.fillStyle=g; ctx.fillRect(cx-r,cy-r,r*2,r*2);

  } else if (id==='mercury') {
    const g=ctx.createRadialGradient(cx-r*0.3,cy-r*0.3,0,cx,cy,r);
    g.addColorStop(0,'#D0C8B8'); g.addColorStop(0.5,'#A09080'); g.addColorStop(1,'#585048');
    ctx.fillStyle=g; ctx.fillRect(cx-r,cy-r,r*2,r*2);
    if (r>10) {
      [[0.3,0.1,0.12],[-0.2,0.3,0.09],[0.45,-0.3,0.08],[-0.4,-0.1,0.07],[0.1,-0.4,0.06]].forEach(([dx,dy,cr])=>{
        ctx.beginPath(); ctx.arc(cx+dx*r,cy+dy*r,cr*r,0,Math.PI*2);
        ctx.fillStyle='rgba(60,50,40,0.30)'; ctx.fill();
      });
    }

  } else if (id==='venus') {
    const g=ctx.createRadialGradient(cx-r*0.2,cy-r*0.3,0,cx,cy,r);
    g.addColorStop(0,'#FFF8C0'); g.addColorStop(0.35,'#F0D870');
    g.addColorStop(0.7,'#C8A830'); g.addColorStop(1,'#907018');
    ctx.fillStyle=g; ctx.fillRect(cx-r,cy-r,r*2,r*2);
    /* cloud bands */
    if (r>8) {
      [0.25,-0.15,0.5,-0.45].forEach(y=>{
        ctx.fillStyle='rgba(255,248,200,0.20)';
        ctx.fillRect(cx-r,cy+y*r,r*2,r*0.12);
      });
    }

  } else if (id==='earth') {
    /* Ocean */
    const g=ctx.createRadialGradient(cx-r*0.2,cy-r*0.25,0,cx,cy,r);
    g.addColorStop(0,'#90C8FF'); g.addColorStop(0.5,'#2870D8'); g.addColorStop(1,'#0820A0');
    ctx.fillStyle=g; ctx.fillRect(cx-r,cy-r,r*2,r*2);
    /* Continents */
    if (r>6) {
      const conts=[
        [0.20,-0.10,0.30,0.40,0.2],[-0.28, 0.05,0.22,0.48,0.1],
        [0.05, 0.30,0.35,0.28,0.4],[0.38, 0.18,0.18,0.26,0.0],
        [-0.10,-0.35,0.28,0.25,0.3],
      ];
      conts.forEach(([dx,dy,w,h,rot])=>{
        ctx.save(); ctx.translate(cx+dx*r,cy+dy*r); ctx.rotate(rot);
        ctx.fillStyle='rgba(55,130,55,0.70)';
        ctx.beginPath(); ctx.ellipse(0,0,w*r,h*r,0,0,Math.PI*2); ctx.fill();
        ctx.restore();
      });
      /* Polar ice */
      ctx.fillStyle='rgba(235,248,255,0.82)';
      ctx.beginPath(); ctx.ellipse(cx,cy-r,r*0.62,r*0.16,0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx,cy+r,r*0.45,r*0.10,0,0,Math.PI*2); ctx.fill();
    }

  } else if (id==='mars') {
    const g=ctx.createRadialGradient(cx-r*0.2,cy-r*0.3,0,cx,cy,r);
    g.addColorStop(0,'#F09070'); g.addColorStop(0.5,'#B84030'); g.addColorStop(1,'#702018');
    ctx.fillStyle=g; ctx.fillRect(cx-r,cy-r,r*2,r*2);
    /* Dark regions */
    if (r>8) {
      ctx.fillStyle='rgba(90,30,20,0.30)';
      ctx.beginPath(); ctx.ellipse(cx-r*0.1,cy+r*0.15,r*0.55,r*0.28,0.4,0,Math.PI*2); ctx.fill();
    }
    /* Polar ice */
    if (r>5) {
      ctx.fillStyle='rgba(248,245,242,0.78)';
      ctx.beginPath(); ctx.ellipse(cx,cy-r,r*0.38,r*0.10,0,0,Math.PI*2); ctx.fill();
    }

  } else if (id==='jupiter') {
    ctx.fillStyle='#D8B880'; ctx.fillRect(cx-r,cy-r,r*2,r*2);
    /* Bands */
    const jBands=[
      [0.00,0.09,'rgba(160,105,65,0.60)'],[0.11,0.07,'rgba(180,120,75,0.50)'],
      [0.21,0.10,'rgba(200,155,100,0.40)'],[0.34,0.08,'rgba(155,95,55,0.55)'],
      [0.45,0.09,'rgba(180,130,85,0.45)'],
      [-0.10,0.09,'rgba(160,105,65,0.55)'],[-0.22,0.08,'rgba(185,125,78,0.48)'],
      [-0.33,0.10,'rgba(155,98,60,0.52)'],[-0.46,0.09,'rgba(180,128,80,0.42)'],
    ];
    jBands.forEach(([yf,hf,c])=>{
      ctx.fillStyle=c; ctx.fillRect(cx-r,cy+(yf-hf/2)*r*2,r*2,hf*r*2);
    });
    /* GRS */
    if (r>14) {
      ctx.fillStyle='rgba(185,70,55,0.55)';
      ctx.beginPath(); ctx.ellipse(cx+r*0.22,cy+r*0.22,r*0.24,r*0.14,0,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle='rgba(140,50,40,0.40)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.ellipse(cx+r*0.22,cy+r*0.22,r*0.28,r*0.18,0,0,Math.PI*2); ctx.stroke();
    }

  } else if (id==='saturn') {
    ctx.fillStyle='#E0CFA0'; ctx.fillRect(cx-r,cy-r,r*2,r*2);
    const sBands=[
      [0.00,0.07,'rgba(185,155,90,0.40)'],[0.09,0.06,'rgba(175,145,80,0.35)'],
      [0.18,0.08,'rgba(195,165,100,0.30)'],[-0.10,0.07,'rgba(185,155,90,0.38)'],
      [-0.20,0.08,'rgba(175,145,80,0.33)'],[-0.31,0.07,'rgba(190,160,95,0.30)'],
    ];
    sBands.forEach(([yf,hf,c])=>{
      ctx.fillStyle=c; ctx.fillRect(cx-r,cy+(yf-hf/2)*r*2,r*2,hf*r*2);
    });

  } else if (id==='uranus') {
    const g=ctx.createRadialGradient(cx-r*0.1,cy-r*0.2,0,cx,cy,r);
    g.addColorStop(0,'#C8F4F4'); g.addColorStop(0.55,'#58C0CC'); g.addColorStop(1,'#20809A');
    ctx.fillStyle=g; ctx.fillRect(cx-r,cy-r,r*2,r*2);
    if(r>8){
      /* Subtle rings hint in bands */
      ctx.fillStyle='rgba(180,240,240,0.12)';
      [-0.12,0.12].forEach(y=>ctx.fillRect(cx-r,cy+y*r,r*2,r*0.06));
    }

  } else if (id==='neptune') {
    const g=ctx.createRadialGradient(cx-r*0.2,cy-r*0.3,0,cx,cy,r);
    g.addColorStop(0,'#7090FF'); g.addColorStop(0.5,'#2040C0'); g.addColorStop(1,'#080880');
    ctx.fillStyle=g; ctx.fillRect(cx-r,cy-r,r*2,r*2);
    /* Great Dark Spot */
    if (r>12) {
      ctx.fillStyle='rgba(10,20,100,0.45)';
      ctx.beginPath(); ctx.ellipse(cx-r*0.2,cy+r*0.15,r*0.32,r*0.18,0.3,0,Math.PI*2); ctx.fill();
      /* Bright cloud */
      ctx.fillStyle='rgba(180,200,255,0.35)';
      ctx.beginPath(); ctx.ellipse(cx+r*0.05,cy-r*0.2,r*0.22,r*0.08,-0.2,0,Math.PI*2); ctx.fill();
    }

  } else if (id==='moon') {
    const g=ctx.createRadialGradient(cx-r*0.2,cy-r*0.25,0,cx,cy,r);
    g.addColorStop(0,'#D8D8D0'); g.addColorStop(0.6,'#A8A8A0'); g.addColorStop(1,'#686860');
    ctx.fillStyle=g; ctx.fillRect(cx-r,cy-r,r*2,r*2);
    if (r>8) {
      /* Mare (dark patches) */
      [[0.1,-0.15,0.30],[-0.25,0.2,0.22],[0.35,0.1,0.18]].forEach(([dx,dy,cr])=>{
        ctx.beginPath(); ctx.arc(cx+dx*r,cy+dy*r,cr*r,0,Math.PI*2);
        ctx.fillStyle='rgba(70,70,65,0.35)'; ctx.fill();
      });
    }

  } else if (id==='io') {
    const g=ctx.createRadialGradient(cx-r*0.2,cy-r*0.2,0,cx,cy,r);
    g.addColorStop(0,'#FFF060'); g.addColorStop(0.5,'#D0A020'); g.addColorStop(1,'#A06010');
    ctx.fillStyle=g; ctx.fillRect(cx-r,cy-r,r*2,r*2);
    if(r>8){
      /* Volcanic patches */
      [[0.2,0.3,0.15],[-0.3,-0.2,0.12],[0.4,-0.25,0.10]].forEach(([dx,dy,cr])=>{
        ctx.beginPath(); ctx.arc(cx+dx*r,cy+dy*r,cr*r,0,Math.PI*2);
        ctx.fillStyle='rgba(180,60,20,0.45)'; ctx.fill();
      });
    }

  } else if (id==='titan') {
    const g=ctx.createRadialGradient(cx-r*0.1,cy-r*0.2,0,cx,cy,r);
    g.addColorStop(0,'#E8B060'); g.addColorStop(0.6,'#C07820'); g.addColorStop(1,'#804010');
    ctx.fillStyle=g; ctx.fillRect(cx-r,cy-r,r*2,r*2);

  } else {
    /* Default gradient from obj.color */
    const hex=obj.color||'#808080';
    const r1=parseInt(hex.slice(1,3),16), g1=parseInt(hex.slice(3,5),16), b1=parseInt(hex.slice(5,7),16);
    const lg=ctx.createRadialGradient(cx-r*0.3,cy-r*0.3,0,cx,cy,r);
    lg.addColorStop(0,`rgba(${Math.min(255,r1+70)},${Math.min(255,g1+70)},${Math.min(255,b1+70)},1)`);
    lg.addColorStop(1,`rgba(${Math.max(0,r1-40)},${Math.max(0,g1-40)},${Math.max(0,b1-40)},1)`);
    ctx.fillStyle=lg; ctx.fillRect(cx-r,cy-r,r*2,r*2);
  }

  /* Terminator (day/night) */
  if (obj.type!=='star' && r>4) {
    const tg=ctx.createLinearGradient(cx-r,cy,cx+r,cy);
    tg.addColorStop(0,'rgba(0,0,0,0)'); tg.addColorStop(0.52,'rgba(0,0,0,0)');
    tg.addColorStop(0.82,'rgba(0,0,0,0.32)'); tg.addColorStop(1,'rgba(0,0,0,0.60)');
    ctx.fillStyle=tg; ctx.fillRect(cx-r,cy-r,r*2,r*2);
  }

  ctx.restore();

  /* Specular highlight */
  if (obj.type!=='star' && r>3) {
    const sg=ctx.createRadialGradient(cx-r*0.32,cy-r*0.38,0,cx-r*0.1,cy-r*0.1,r*0.72);
    sg.addColorStop(0,'rgba(255,255,255,0.20)'); sg.addColorStop(1,'rgba(255,255,255,0)');
    ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.clip();
    ctx.fillStyle=sg; ctx.fillRect(cx-r,cy-r,r*2,r*2);
    ctx.restore();
  }
}

function drawSaturnRings2D(ctx,cx,cy,r) {
  ctx.save(); ctx.translate(cx,cy); ctx.rotate(-0.32);
  /* Outer ring */
  ctx.beginPath(); ctx.ellipse(0,0,r*2.20,r*0.38,0,0,Math.PI*2);
  ctx.strokeStyle='rgba(220,200,140,0.50)'; ctx.lineWidth=Math.max(1.5,r*0.18); ctx.stroke();
  /* Cassini div / inner */
  ctx.beginPath(); ctx.ellipse(0,0,r*1.60,r*0.27,0,0,Math.PI*2);
  ctx.strokeStyle='rgba(200,175,120,0.55)'; ctx.lineWidth=Math.max(1,r*0.20); ctx.stroke();
  ctx.restore();
}

/* ── Grid Dati ──────────────────────────────────────────────────────────── */
const GROUPS = [
  { label:'Stella',          ids:['sun'] },
  { label:'Pianeti interni', ids:['mercury','venus','earth','mars'] },
  { label:'Pianeti giganti', ids:['jupiter','saturn','uranus','neptune'] },
  { label:'Pianeti nani',    ids:['ceres','pluto','haumea','makemake','eris'] },
  { label:'Lune principali', ids:['moon','io','europa','ganymede','callisto','titan','enceladus','rhea','triton','charon'] },
];

function buildGrid() {
  const grid = document.getElementById('objectGrid');
  grid.style.cssText='display:flex;flex-wrap:wrap;gap:14px;padding:20px 22px;align-content:flex-start;overflow-y:auto;width:100%';

  GROUPS.forEach(g => {
    const lbl = document.createElement('div');
    lbl.className='grid-group-label'; lbl.textContent=g.label;
    grid.appendChild(lbl);

    g.ids.forEach(id => {
      const obj=BY_ID[id]; if(!obj) return;
      const card=document.createElement('div');
      card.className='obj-card';

      /* Visual circle — il Sole ha bisogno di più margine del semplice +4px riservato alle
         altre card (pensato per il bordo degli anelli di Saturno), altrimenti l'alone della
         stella viene ritagliato di netto dal bordo del canvas (lo stesso bug "quadrato" visto
         nella tab Dimensioni, qui riproposto in miniatura) */
      const VIS_R=28;
      const isStar=obj.type==='star';
      const PAD=isStar?22:4;
      const boxSize=VIS_R*2+PAD*2;
      const canvas2=document.createElement('canvas');
      const dpr=window.devicePixelRatio||1;
      canvas2.width=boxSize*dpr; canvas2.height=boxSize*dpr;
      canvas2.style.width=boxSize+'px'; canvas2.style.height=boxSize+'px';
      const c2=canvas2.getContext('2d'); c2.scale(dpr,dpr);
      const ccx=VIS_R+PAD, ccy=VIS_R+PAD;
      if (obj.hasRings && VIS_R>10) drawSaturnRings2D(c2,ccx,ccy,VIS_R*0.75);
      drawRealisticBody(c2,ccx,ccy,VIS_R,obj);
      if (obj.hasRings) {
        /* redraw front half of rings over planet */
        c2.save(); c2.translate(ccx,ccy); c2.rotate(-0.32);
        c2.save(); c2.beginPath(); c2.ellipse(0,0,VIS_R*2.20,VIS_R*0.38,0,0,Math.PI*2); c2.clip();
        c2.clearRect(-VIS_R*3,-VIS_R*3,VIS_R*6,VIS_R*3.2);
        c2.restore();
        c2.restore();
      }

      const isMoon=obj.type==='moon';
      const smaStr=isMoon?(obj.smaKm?`${Lab.fmt((obj.smaKm/1000),0)}k km`:'—')
                         :(obj.sma?`${Lab.fmt(obj.sma,2)} AU`:'—');
      const radStr=`${obj.radius.toLocaleString('it')} km`;
      const orbStr=obj.orbPeriod?(obj.orbPeriod<1?`${Lab.fmt((obj.orbPeriod*365.25),1)} d`:`${Lab.fmt(obj.orbPeriod,1)} a`):'—';

      card.innerHTML=`
        <div style="position:relative;display:flex;align-items:center;justify-content:center;width:${boxSize}px;height:${boxSize}px"></div>
        <div class="obj-card-name">${obj.name}</div>
        <span class="ss-badge obj-card-badge" style="background:${TYPE_COLOR[obj.type]};color:${TYPE_TEXT[obj.type]};border:1px solid ${TYPE_TEXT[obj.type]}44">${TYPE_LABEL[obj.type]}</span>
        <div class="obj-card-stats">
          <div class="obj-card-stat"><span>Raggio</span><span class="obj-card-stat-val">${radStr}</span></div>
          ${obj.sma||obj.smaKm?`<div class="obj-card-stat"><span>Dist.</span><span class="obj-card-stat-val">${smaStr}</span></div>`:''}
          ${obj.orbPeriod?`<div class="obj-card-stat"><span>Periodo</span><span class="obj-card-stat-val">${orbStr}</span></div>`:''}
        </div>
      `;
      card.querySelector('div').appendChild(canvas2);
      card.addEventListener('click',()=>showModal(id));
      grid.appendChild(card);
    });
  });
}

function showModal(id) {
  const obj=BY_ID[id]; if(!obj) return;
  const overlay=document.getElementById('modalOverlay');
  const earthR=6371;
  const isMoon=obj.type==='moon';
  const parentName=obj.parent?BY_ID[obj.parent]?.name:null;

  const smaLabel=isMoon?(obj.smaKm?`${obj.smaKm.toLocaleString('it')} km`:'—'):(obj.sma?`${Lab.fmt(obj.sma,4)} AU`:'—');
  const periLabel=isMoon?(obj.periKm?`${obj.periKm.toLocaleString('it')} km`:'—'):(obj.perihelion?`${Lab.fmt(obj.perihelion,4)} AU`:'—');
  const aphLabel =isMoon?(obj.aphKm?`${obj.aphKm.toLocaleString('it')} km`:'—'):(obj.aphelion?`${Lab.fmt(obj.aphelion,4)} AU`:'—');
  const orbPLabel=obj.orbPeriod?(obj.orbPeriod<1?`${Lab.fmt((obj.orbPeriod*365.25),2)} d`:`${Lab.fmt(obj.orbPeriod,4)} a`):'—';
  const rotLabel=obj.rotPeriod!=null?`${Lab.fmt(Math.abs(obj.rotPeriod),3)} d${obj.rotPeriod<0?' (retrogrado)':''}`:'—';
  const fmtN=(v,d,u)=>v!=null?`<span class="ss-param-value">${typeof v==='number'?Lab.fmt(v,d):v}</span>${u?`<span style="font-size:10px;color:var(--text-hint);margin-left:3px">${u}</span>`:''}`:'<span class="ss-param-value">—</span>';
  const fmtSci=v=>{if(v==null)return'<span class="ss-param-value">—</span>';const e=Math.floor(Math.log10(Math.abs(v)));return`<span class="ss-param-value">${Lab.fmt((v/Math.pow(10,e)),4)} × 10<sup>${e}</sup></span>`;};

  document.getElementById('modalContent').innerHTML=`
    <div class="ss-modal-header">
      <div>
        <div class="ss-modal-name">${obj.name} ${obj.symbol||''}</div>
        <div class="ss-modal-meta">
          <span class="ss-badge" style="background:${TYPE_COLOR[obj.type]};color:${TYPE_TEXT[obj.type]};border:1px solid ${TYPE_TEXT[obj.type]}44">${TYPE_LABEL[obj.type]}</span>
          ${parentName?`<span style="color:var(--text-hint);font-size:12px">↳ ${parentName}</span>`:''}
        </div>
      </div>
    </div>
    <div class="ss-param-group"><div class="ss-param-group-title">Fisica</div>
      <div class="ss-param-row"><span class="ss-param-label">Raggio equatoriale</span>${fmtN(obj.radius,1,'km')}</div>
      <div class="ss-param-row"><span class="ss-param-label">Raggio relativo (⊕=1)</span>${fmtN(obj.radius/earthR,4,'R⊕')}</div>
      <div class="ss-param-row"><span class="ss-param-label">Massa</span>${fmtSci(obj.mass)} <span style="font-size:10px;color:var(--text-hint);margin-left:2px">kg</span></div>
      <div class="ss-param-row"><span class="ss-param-label">Massa relativa (⊕=1)</span>${fmtN(obj.mass/5.972e24,4,'M⊕')}</div>
      <div class="ss-param-row"><span class="ss-param-label">Densità media</span>${fmtN(obj.density,0,'kg/m³')}</div>
    </div>
    <div class="ss-param-group"><div class="ss-param-group-title">Rotazione</div>
      <div class="ss-param-row"><span class="ss-param-label">Periodo di rotazione</span><span class="ss-param-value">${rotLabel}</span></div>
    </div>
    <div class="ss-param-group"><div class="ss-param-group-title">Orbita</div>
      <div class="ss-param-row"><span class="ss-param-label">Semiasse maggiore</span><span class="ss-param-value">${smaLabel}</span></div>
      <div class="ss-param-row"><span class="ss-param-label">Perielio</span><span class="ss-param-value">${periLabel}</span></div>
      <div class="ss-param-row"><span class="ss-param-label">Afelio</span><span class="ss-param-value">${aphLabel}</span></div>
      <div class="ss-param-row"><span class="ss-param-label">Eccentricità</span>${fmtN(obj.ecc,4,'')}</div>
      <div class="ss-param-row"><span class="ss-param-label">Periodo orbitale</span><span class="ss-param-value">${orbPLabel}</span></div>
      <div class="ss-param-row"><span class="ss-param-label">Periodo sinodico</span><span class="ss-param-value">${obj.synPeriod?Lab.fmt(obj.synPeriod,2)+' d':'—'}</span></div>
      <div class="ss-param-row"><span class="ss-param-label">Velocità orbitale</span>${fmtN(obj.orbV,2,'km/s')}</div>
      <div class="ss-param-row"><span class="ss-param-label">Inclinazione</span>${fmtN(obj.incl,2,'°')}</div>
    </div>
  `;
  overlay.classList.remove('hidden');
}

document.getElementById('modalClose').addEventListener('click',()=>{
  document.getElementById('modalOverlay').classList.add('hidden');
});
document.getElementById('modalOverlay').addEventListener('click',e=>{
  if(e.target===document.getElementById('modalOverlay'))
    document.getElementById('modalOverlay').classList.add('hidden');
});

/* ── Dimensioni ─────────────────────────────────────────────────────────── */
const sizeCanvas=document.getElementById('sizeCanvas');
const sizeWrap  =document.getElementById('sizeWrap');
const sizeTip   =document.getElementById('sizeTip');
let szScale='noSun', szDist='compact', szMoons=false, sizeHover=null;
const SZ_MIN_VIS=7, SZ_MIN_GAP=18, MOON_MIN_VIS=4;
const MAJOR_MOON_IDS=['moon','io','europa','ganymede','callisto','titan','enceladus','rhea','triton'];
function moonsOfPlanet(planetId) {
  return MAJOR_MOON_IDS.map(id=>BY_ID[id]).filter(m=>m.parent===planetId).sort((a,b)=>a.smaKm-b.smaKm);
}

function getSizeBodies() {
  const pl=['mercury','venus','earth','mars','jupiter','saturn','uranus','neptune'];
  const list=pl.map(id=>BY_ID[id]);
  if (szScale==='sun') list.unshift(BY_ID['sun']);
  return list;
}

/* Layout condiviso fra rendering (drawSizes) e hit-testing (getSizePositions). Due assi indipendenti:
   - szDist='compact': i pianeti (tranne il Sole "parziale", posizione fissa fuori-canvas) vengono
     distribuiti con un gap UNIFORME calcolato per riempire tutta la larghezza disponibile — prima
     il gap era un valore fisso di 18px indipendente dallo spazio disponibile, quindi tutto restava
     ammassato a sinistra ("tutti attaccati");
   - szDist='log'|'linear': la posizione X riflette la distanza orbitale REALE (sma in UA) dal Sole,
     mappata logaritmicamente o linearmente sulla larghezza disponibile — stessa idea della scala
     Log/Lineare già presente nella tab Distanze 3D, qui applicata a una fascia 1D.
   Se szMoons è attivo, le lune principali vengono aggiunte accanto al proprio pianeta (non al posto
   dei pianeti), con una scala locale propria (log/lineare sulla loro smaKm) per restare in un raggio
   ragionevole invece di essere spinte a distanze assurde dalla scala globale in UA. */
function computeSizeLayout(H, Ww) {
  const bodies=getSizeBodies();
  const maxR=Math.max(...bodies.map(o=>o.radius));
  const maxVisR=szScale==='sun'?H*0.40:Math.min(H*0.40,Ww/(bodies.length*2.4));
  const scale=maxVisR/maxR;
  const MARGIN=40;

  const items=bodies.map(obj=>{
    const trueR=obj.radius*scale;
    const visR=Math.max(SZ_MIN_VIS, trueR);
    return {obj,trueR,visR,isSunPartial:(obj.type==='star'&&szScale==='sun')};
  });
  const sunItem=items.find(it=>it.isSunPartial);
  const flowItems=items.filter(it=>!it.isSunPartial);
  // il Sole a scala reale è enorme (trueR arriva a centinaia di px): prima il centro era fissato
  // a cx:0 (metà del disco sempre visibile) e solo lo spazio riservato al primo pianeta veniva
  // ridotto con un fattore arbitrario (0.18·trueR) scollegato dal raggio VERO disegnato, quindi
  // Mercurio/Venere finivano comunque disegnati sopra il bordo del Sole. Fix: il centro del Sole
  // va molto più a sinistra, fuori canvas, così ne resta visibile solo una fetta di larghezza
  // fissa SUN_SLIVER indipendente da quanto è grande trueR — "basta veramente un pezzo".
  const SUN_SLIVER=60;
  const reserved=sunItem?SUN_SLIVER+SZ_MIN_GAP:0;
  const availX0=MARGIN+reserved;
  const availableW=Ww-MARGIN*2-reserved;

  const positions=[];
  if (sunItem) positions.push({obj:sunItem.obj,cx:-(sunItem.trueR-SUN_SLIVER),cy:H/2,r:sunItem.trueR,visR:sunItem.visR,partial:true});

  const planetPos=[];
  if (szDist==='compact') {
    const sumDiam=flowItems.reduce((s,it)=>s+it.visR*2,0);
    const n=flowItems.length;
    const gap=n>1?Math.max(SZ_MIN_GAP,(availableW-sumDiam)/(n-1)):SZ_MIN_GAP;
    let x=availX0;
    flowItems.forEach(it=>{
      planetPos.push({it,cx:x+it.visR});
      x+=it.visR*2+gap;
    });
  } else {
    const smas=flowItems.map(it=>it.obj.sma);
    const minSma=Math.min(...smas), maxSma=Math.max(...smas);
    flowItems.forEach(it=>{
      const f=szDist==='log'
        ? (Math.log(it.obj.sma)-Math.log(minSma))/(Math.log(maxSma)-Math.log(minSma))
        : (it.obj.sma-minSma)/(maxSma-minSma);
      planetPos.push({it,cx:availX0+f*availableW});
    });
  }

  planetPos.forEach(({it,cx},idx)=>{
    positions.push({obj:it.obj,cx,cy:H/2,r:it.trueR,visR:it.visR,partial:false});
    if (!szMoons) return;
    const moons=moonsOfPlanet(it.obj.id);
    if (!moons.length) return;
    const nextCx=idx<planetPos.length-1?planetPos[idx+1].cx-planetPos[idx+1].it.visR:Ww-MARGIN;
    const maxSpan=Math.max(24,Math.min(90,(nextCx-cx-it.visR)*0.7));
    const minSma2=moons[0].smaKm, maxSma2=moons[moons.length-1].smaKm;
    moons.forEach(mo=>{
      const moonVisR=Math.max(MOON_MIN_VIS, mo.radius*scale);
      let off;
      if (moons.length===1) off=it.visR+16;
      else {
        const f2=szDist==='linear'
          ? (mo.smaKm-minSma2)/((maxSma2-minSma2)||1)
          : (Math.log(mo.smaKm)-Math.log(minSma2))/((Math.log(maxSma2)-Math.log(minSma2))||1);
        off=it.visR+14+f2*maxSpan;
      }
      positions.push({obj:mo,cx:cx+off,cy:H/2,r:moonVisR,visR:moonVisR,partial:false,isMoon:true});
    });
  });

  const lastX=positions.filter(p=>!p.partial).reduce((m,p)=>Math.max(m,p.cx+p.visR),0);
  return {positions, W:Math.max(Ww, lastX+MARGIN)};
}

/* Le etichette dei nomi si accavallano quando più corpi (pianeti piccoli ravvicinati, o lune
   ammassate attorno a un pianeta) hanno il centro troppo vicino perché il testo, sempre
   centrato appena sotto il corpo, ci stia senza sovrapporsi al vicino. Risolto con un semplice
   "shelf packing" orizzontale su livelli via via più lontani dal corpo: ogni corpo viene
   assegnato al primo livello dove il proprio testo non tocca l'ultimo testo già piazzato a
   quel livello; dal secondo livello in su l'etichetta riceve anche un piccolo scarto laterale
   alternato (sinistra/destra) e viene disegnata con un connettore "a gomito" (verticale poi
   orizzontale) che la ricollega al corpo, così resta chiaro a chi appartiene anche se non è più
   direttamente sotto di esso. */
function computeLabelPlacements(positions, ctx) {
  const items=positions.filter(p=>!p.partial).slice().sort((a,b)=>a.cx-b.cx);
  const tierRightEdge=[];
  items.forEach(p=>{
    ctx.font=p.isMoon?`7px 'Space Mono',monospace`:`bold ${Math.min(12,Math.max(9,p.visR*0.35+8))}px 'DM Sans',sans-serif`;
    const w=ctx.measureText(p.obj.name).width;
    let tier=0;
    while(tierRightEdge[tier]!==undefined && p.cx-w/2<tierRightEdge[tier]+8) tier++;
    tierRightEdge[tier]=p.cx+w/2;
    p._labelTier=tier;
  });
}

function drawSizes() {
  const dpr=window.devicePixelRatio||1;
  const H=Math.max(200,sizeWrap.clientHeight);
  const ctx=sizeCanvas.getContext('2d');

  const Ww=sizeWrap.clientWidth||900;
  const {positions, W}=computeSizeLayout(H, Ww);

  sizeCanvas.width=W*dpr; sizeCanvas.height=H*dpr;
  sizeCanvas.style.width=W+'px'; sizeCanvas.style.height=H+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);

  const dk=isDark();
  ctx.fillStyle=dk?'#060a10':'#f0f2f5';
  ctx.fillRect(0,0,W,H);

  /* Baseline */
  ctx.strokeStyle=dk?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.06)';
  ctx.lineWidth=1; ctx.setLineDash([3,5]);
  ctx.beginPath(); ctx.moveTo(0,H/2); ctx.lineTo(W,H/2); ctx.stroke();
  ctx.setLineDash([]);

  computeLabelPlacements(positions, ctx);

  for (const pos of positions) {
    const {obj,cx,cy,r,visR,partial,isMoon}=pos;

    ctx.save();
    if (partial) {
      /* Clip sun to canvas */
      ctx.beginPath(); ctx.rect(0,0,W,H); ctx.clip();
    }

    /* Rings behind planet (upper half only) */
    if (obj.hasRings) {
      ctx.save();
      ctx.beginPath(); ctx.rect(cx-visR*3, cy-visR*2, visR*6, visR*2); ctx.clip();
      drawSaturnRings2D(ctx,cx,cy,visR);
      ctx.restore();
    }

    /* Body */
    drawRealisticBody(ctx,cx,cy,visR,obj);

    /* Rings in front of planet (lower half only) */
    if (obj.hasRings) {
      ctx.save();
      ctx.beginPath(); ctx.rect(cx-visR*3, cy, visR*6, visR*2); ctx.clip();
      drawSaturnRings2D(ctx,cx,cy,visR);
      ctx.restore();
    }

    /* Hover ring */
    if (sizeHover===obj.id) {
      ctx.beginPath(); ctx.arc(cx,cy,visR+3,0,Math.PI*2);
      ctx.strokeStyle='rgba(0,212,255,0.75)'; ctx.lineWidth=2; ctx.stroke();
    }

    /* Name label — le lune hanno un'etichetta più piccola/discreta per non affollare la vista.
       Dal secondo livello di sovrapposizione (_labelTier>0) l'etichetta scende di livello e
       riceve uno scarto laterale alternato, ricollegata al corpo da un connettore a gomito. */
    const tier=pos._labelTier||0;
    const baseGap=isMoon?11:16, tierH=isMoon?10:14;
    const lblY=cy+visR+baseGap+tier*tierH;
    const nudgeX=tier>0?((tier%2===0?-1:1)*(8+tier*4)):0;
    const lblCx=cx+nudgeX;
    if (tier>0) {
      const stubY=cy+visR+3, midY=lblY-6;
      ctx.strokeStyle=isMoon?'rgba(150,180,220,0.35)':'rgba(0,212,255,0.32)';
      ctx.lineWidth=0.8;
      ctx.beginPath();
      ctx.moveTo(cx,stubY); ctx.lineTo(cx,midY); ctx.lineTo(lblCx,midY); ctx.lineTo(lblCx,lblY-2);
      ctx.stroke();
    }
    ctx.fillStyle=isMoon?(dk?'rgba(140,170,210,0.65)':'rgba(50,70,100,0.65)'):(dk?'rgba(180,210,255,0.85)':'rgba(20,40,80,0.80)');
    ctx.font=isMoon?`7px 'Space Mono',monospace`:`bold ${Math.min(12,Math.max(9,visR*0.35+8))}px 'DM Sans',sans-serif`;
    ctx.textAlign='center';
    ctx.fillText(obj.name, lblCx, lblY);

    /* Radius dimension line (non per le lune: con più corpi per pianeta diventerebbe illeggibile) */
    if (!isMoon && visR >= SZ_MIN_VIS) {
      const lineY=cy-visR-8;
      ctx.strokeStyle=dk?'rgba(0,212,255,0.28)':'rgba(0,100,180,0.25)';
      ctx.lineWidth=1; ctx.setLineDash([2,3]);
      ctx.beginPath(); ctx.moveTo(cx-visR,lineY); ctx.lineTo(cx+visR,lineY); ctx.stroke();
      [cx-visR,cx+visR].forEach(xx=>{
        ctx.beginPath(); ctx.moveTo(xx,lineY-3); ctx.lineTo(xx,lineY+3); ctx.stroke();
      });
      ctx.setLineDash([]);
      const rkm=obj.radius.toLocaleString('it')+' km';
      ctx.fillStyle=dk?'rgba(100,170,230,0.65)':'rgba(20,80,150,0.60)';
      ctx.font=`9px 'Space Mono',monospace`;
      ctx.fillText(rkm,cx,lineY-6);

      /* If visR >> trueR, add "enlarged" note */
      if (r<SZ_MIN_VIS-0.5 && obj.type!=='star') {
        ctx.fillStyle=dk?'rgba(255,180,80,0.55)':'rgba(180,90,0,0.50)';
        ctx.font=`8px 'Space Mono',monospace`;
        ctx.fillText('(ingrandito)',cx,lblY+11);
      }
    }

    ctx.restore();
  }

  /* Scale note */
  if (szScale==='sun') {
    ctx.fillStyle=dk?'rgba(100,160,220,0.45)':'rgba(20,60,120,0.40)';
    ctx.font=`9px 'Space Mono',monospace`; ctx.textAlign='right';
    ctx.fillText('Scala reale · ⊙ = 109× ⊕', W-12, H-10);
  }
}

/* Hover/click */
function getSizePositions() {
  const H=sizeWrap.clientHeight||400;
  const Ww=sizeWrap.clientWidth||900;
  return computeSizeLayout(H, Ww).positions;
}
sizeCanvas.addEventListener('mousemove',e=>{
  const rect=sizeCanvas.getBoundingClientRect();
  const mx=e.clientX-rect.left, my=e.clientY-rect.top;
  const pos=getSizePositions();
  const found=pos.find(p=>Math.hypot(mx-p.cx,my-p.cy)<p.visR+8)||null;
  if((found?found.obj.id:null)!==sizeHover){sizeHover=found?found.obj.id:null;drawSizes();}
  if(found){
    sizeTip.style.display='block';
    sizeTip.style.left=(mx+12)+'px'; sizeTip.style.top=(my-6)+'px';
    sizeTip.textContent=`${found.obj.name} — r: ${found.obj.radius.toLocaleString('it')} km`;
    sizeCanvas.style.cursor='pointer';
  }else{sizeTip.style.display='none';sizeCanvas.style.cursor='default';}
});
sizeCanvas.addEventListener('mouseleave',()=>{sizeTip.style.display='none';sizeHover=null;drawSizes();});
sizeCanvas.addEventListener('click',()=>{if(sizeHover)showModal(sizeHover);});

/* ── Distanze 3D ────────────────────────────────────────────────────────── */
const distCanvas=document.getElementById('distCanvas');
const distWrap  =document.getElementById('distWrap');
const distTip   =document.getElementById('distTip');

let dstScale='log', dstFilter='planets', dstMoons=false, dist3DSpeedMult=1;
let dist3DRunning=false, dist3DRaf=null, dist3DTime=0;
const DIST3D_SPEED=0.3; // anni/s (base, moltiplicata dal controllo VELOCITÀ dell'utente)
const cam={theta:Math.PI*0.55, phi:0.42, zoom:1, panX:0, panY:0};
let camDrag=null; // {mode:'rotate'|'pan', sx,sy,t0,p0,px0,py0}
let distHover=null;

function startDist3D(){
  if(dist3DRunning)return;
  dist3DRunning=true;
  let last=performance.now();
  function loop(now){
    const dt=Math.min((now-last)/1000,0.05); last=now;
    dist3DTime+=dt*DIST3D_SPEED*dist3DSpeedMult;
    drawDist3D();
    if(dist3DRunning) dist3DRaf=requestAnimationFrame(loop);
  }
  dist3DRaf=requestAnimationFrame(loop);
  const btn=document.getElementById('btnDistPlay');
  if(btn){btn.textContent='⏸ PAUSA';}
}
function stopDist3D(){
  dist3DRunning=false;
  if(dist3DRaf){cancelAnimationFrame(dist3DRaf);dist3DRaf=null;}
  const btn=document.getElementById('btnDistPlay');
  if(btn){btn.textContent='▶ AVVIA';}
}

function getDistBodies(){
  const pl=['mercury','venus','earth','mars','jupiter','saturn','uranus','neptune'];
  if(dstFilter==='all') return OBJECTS.filter(o=>(o.type==='planet'||o.type==='dwarf')&&o.sma);
  return pl.map(id=>BY_ID[id]);
}

function project3D(wx,wy,wz){
  const W=distWrap.clientWidth||600, H=distWrap.clientHeight||400;
  const bodies=getDistBodies();
  const maxAU=bodies.reduce((m,o)=>Math.max(m,o.sma||0),0)*1.10;
  const R=Math.min(W,H)*0.42*cam.zoom;
  const scale=R/Math.max(maxAU,1);

  /* Apply log scale to distances from Sun, keeping direction */
  let wx2=wx,wy2=wy,wz2=wz;
  if(dstScale==='log'){
    const d=Math.sqrt(wx*wx+wy*wy+wz*wz);
    if(d>1e-6){
      const dlog=Math.log1p(d)/Math.log1p(maxAU)*maxAU;
      const f=dlog/d;
      wx2=wx*f; wy2=wy*f; wz2=wz*f;
    }
  }

  const ct=Math.cos(cam.theta),st=Math.sin(cam.theta);
  const cp=Math.cos(cam.phi),  sp=Math.sin(cam.phi);
  const x1=wx2*ct-wy2*st, y1=wx2*st+wy2*ct, z1=wz2;
  const x2=x1, y2=y1*cp-z1*sp, depth=y1*sp+z1*cp;
  return {sx:W/2+cam.panX+x2*scale, sy:H/2+cam.panY-y2*scale, depth};
}

function getOrbitPoints3D(obj,N=240){
  if(!obj.sma)return[];
  const a=obj.sma, e=obj.ecc||0, i=(obj.incl||0)*Math.PI/180;
  const pts=[];
  for(let j=0;j<=N;j++){
    const nu=j/N*2*Math.PI;
    const p=a*(1-e*e), r=p/(1+e*Math.cos(nu));
    const xo=r*Math.cos(nu), yo=r*Math.sin(nu);
    pts.push(project3D(xo, yo*Math.cos(i), yo*Math.sin(i)));
  }
  return pts;
}

function getPlanetPos3D(obj){
  if(!obj.sma||!obj.orbPeriod)return null;
  const a=obj.sma,e=obj.ecc||0,T=obj.orbPeriod,i=(obj.incl||0)*Math.PI/180;
  const M=((dist3DTime/T)%1)*2*Math.PI;
  let E=M; for(let k=0;k<6;k++) E=M+e*Math.sin(E);
  const nu=2*Math.atan2(Math.sqrt(1+e)*Math.sin(E/2),Math.sqrt(1-e)*Math.cos(E/2));
  const r=a*(1-e*Math.cos(E));
  const xo=r*Math.cos(nu), yo=r*Math.sin(nu);
  return project3D(xo, yo*Math.cos(i), yo*Math.sin(i));
}

/* Posizione di una luna in una mini-orbita attorno alla posizione GIÀ proiettata del proprio
   pianeta (`parentP.sx/sy`): la vera distanza orbitale (poche centinaia di migliaia di km) è
   invisibile alla scala del sistema solare in UA, quindi il raggio dell'orbitina è puramente
   visivo (cresce con l'indice per non sovrapporre lune diverse) — ma la FASE (angolo) usa il
   periodo orbitale reale della luna (`orbPeriod`, in anni, stessa unità di dist3DTime), quindi
   la velocità di rivoluzione relativa fra le lune di uno stesso pianeta è quella vera */
function getMoonPos3D(moon, parentP, dotR, idx) {
  const orbR=dotR*2.6+idx*dotR*1.7;
  const period=moon.orbPeriod||0.02;
  const ang=((dist3DTime/period)%1)*Math.PI*2;
  return {sx:parentP.sx+Math.cos(ang)*orbR, sy:parentP.sy+Math.sin(ang)*orbR*0.5, orbR};
}

function drawDist3D(){
  const W=distWrap.clientWidth||600, H=distWrap.clientHeight||400;
  const dpr=window.devicePixelRatio||1;
  distCanvas.width=W*dpr; distCanvas.height=H*dpr;
  distCanvas.style.width=W+'px'; distCanvas.style.height=H+'px';
  const ctx=distCanvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);

  const dk=isDark();
  ctx.fillStyle=dk?'#060a10':'#f0f2f5';
  ctx.fillRect(0,0,W,H);

  /* Ecliptic plane grid lines (faint) */
  const gridAU=[0.5,1,2,5,10,20,30,50,70];
  const bodies=getDistBodies();
  const maxAU=bodies.reduce((m,o)=>Math.max(m,o.sma||0),0)*1.10;
  gridAU.filter(a=>a<=maxAU*1.05).forEach(au=>{
    const N=80;
    ctx.beginPath();
    for(let j=0;j<=N;j++){
      const th=j/N*2*Math.PI;
      const p=project3D(au*Math.cos(th),au*Math.sin(th),0);
      j===0?ctx.moveTo(p.sx,p.sy):ctx.lineTo(p.sx,p.sy);
    }
    ctx.closePath();
    ctx.strokeStyle=dk?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.05)';
    ctx.lineWidth=1; ctx.stroke();
    /* AU label */
    const lp=project3D(au,0,0);
    ctx.fillStyle=dk?'rgba(100,160,220,0.30)':'rgba(20,60,120,0.28)';
    ctx.font=`8px 'Space Mono',monospace`; ctx.textAlign='left';
    ctx.fillText(`${au<1?Lab.fmt(au,1):Math.round(au)} AU`,lp.sx+3,lp.sy+3);
  });

  /* Sun */
  const sunP=project3D(0,0,0);
  const sunR=dk?12:10;
  const sunGlow=ctx.createRadialGradient(sunP.sx,sunP.sy,sunR*0.5,sunP.sx,sunP.sy,sunR*3);
  sunGlow.addColorStop(0,'rgba(255,210,60,0.45)'); sunGlow.addColorStop(1,'rgba(255,150,20,0)');
  ctx.beginPath(); ctx.arc(sunP.sx,sunP.sy,sunR*3,0,Math.PI*2); ctx.fillStyle=sunGlow; ctx.fill();
  drawRealisticBody(ctx,sunP.sx,sunP.sy,sunR,BY_ID['sun']);

  /* Collect planet positions for depth sorting */
  const renderList=[];

  /* Orbit rings (draw first, behind) */
  bodies.forEach(obj=>{
    const pts=getOrbitPoints3D(obj);
    if(!pts.length)return;
    /* Draw ring with slight depth shading: front brighter, back dimmer */
    for(let j=0;j<pts.length-1;j++){
      const p0=pts[j],p1=pts[j+1];
      /* depth in [-1,1] range approximately */
      const depthFac=Math.max(0,Math.min(1,(p0.depth+maxAU)/(2*maxAU)));
      const alpha=dk?(0.18+depthFac*0.35):(0.12+depthFac*0.28);
      const hex=obj.color;
      ctx.strokeStyle=hex+(Math.round(alpha*255).toString(16).padStart(2,'0'));
      ctx.lineWidth=obj.type==='dwarf'?0.7:0.9;
      ctx.beginPath(); ctx.moveTo(p0.sx,p0.sy); ctx.lineTo(p1.sx,p1.sy); ctx.stroke();
    }

    /* Planet position */
    const pp=getPlanetPos3D(obj);
    if(pp) renderList.push({obj,p:pp});
  });

  /* Sort by depth (back to front) */
  renderList.sort((a,b)=>b.p.depth-a.p.depth);

  renderList.forEach(({obj,p})=>{
    const dotR=obj.type==='dwarf'?2:Math.max(3,Math.min(5,Math.log10(obj.radius)-0.5));

    /* Saturn rings behind planet */
    if(obj.hasRings){
      ctx.save(); ctx.translate(p.sx,p.sy); ctx.rotate(-0.32);
      ctx.beginPath(); ctx.ellipse(0,0,dotR*2.2,dotR*0.38,0,Math.PI,0,true);
      ctx.strokeStyle='rgba(220,200,140,0.55)'; ctx.lineWidth=Math.max(1,dotR*0.25); ctx.stroke();
      ctx.restore();
    }

    drawRealisticBody(ctx,p.sx,p.sy,dotR,obj);

    /* Saturn rings front */
    if(obj.hasRings){
      ctx.save(); ctx.translate(p.sx,p.sy); ctx.rotate(-0.32);
      ctx.beginPath(); ctx.ellipse(0,0,dotR*2.2,dotR*0.38,0,0,Math.PI);
      ctx.strokeStyle='rgba(220,200,140,0.55)'; ctx.lineWidth=Math.max(1,dotR*0.25); ctx.stroke();
      ctx.restore();
    }

    /* Hover */
    if(distHover===obj.id){
      ctx.beginPath(); ctx.arc(p.sx,p.sy,dotR+3,0,Math.PI*2);
      ctx.strokeStyle='rgba(0,212,255,0.75)'; ctx.lineWidth=2; ctx.stroke();
    }

    /* Label */
    ctx.fillStyle=dk?'rgba(180,210,255,0.80)':'rgba(20,40,80,0.75)';
    ctx.font=`${Math.min(11,Math.max(8,dotR+3))}px 'DM Sans',sans-serif`;
    ctx.textAlign='center';
    ctx.fillText(obj.name, p.sx, p.sy-dotR-4);

    /* Lune principali: mini-orbita attorno al pianeta, fase = periodo orbitale reale */
    if (dstMoons) {
      const moons=moonsOfPlanet(obj.id);
      moons.forEach((moon,idx)=>{
        const mp=getMoonPos3D(moon,p,dotR,idx);
        ctx.beginPath(); ctx.ellipse(p.sx,p.sy,mp.orbR,mp.orbR*0.5,0,0,Math.PI*2);
        ctx.strokeStyle=dk?'rgba(150,180,220,0.16)':'rgba(30,60,110,0.16)';
        ctx.lineWidth=0.7; ctx.stroke();
        const moonR=1.6;
        ctx.beginPath(); ctx.arc(mp.sx,mp.sy,moonR,0,Math.PI*2);
        ctx.fillStyle=moon.color||'#c8c8c0';
        ctx.fill();
        if (distHover===moon.id) {
          ctx.beginPath(); ctx.arc(mp.sx,mp.sy,moonR+2.5,0,Math.PI*2);
          ctx.strokeStyle='rgba(0,212,255,0.8)'; ctx.lineWidth=1.4; ctx.stroke();
          ctx.fillStyle=dk?'rgba(180,210,255,0.85)':'rgba(20,40,80,0.8)';
          ctx.font=`8px 'DM Sans',sans-serif`; ctx.textAlign='center';
          ctx.fillText(moon.name, mp.sx, mp.sy-moonR-4);
        }
      });
    }
  });

  /* Scale + time info */
  ctx.fillStyle=dk?'rgba(100,150,200,0.38)':'rgba(30,60,120,0.35)';
  ctx.font=`9px 'Space Mono',monospace`; ctx.textAlign='left';
  ctx.fillText(`t = ${Lab.fmt(dist3DTime,1)} a  ·  scala ${dstScale}`,10,H-10);
}

/* Mouse camera controls */
distCanvas.addEventListener('mousedown',e=>{
  e.preventDefault();
  camDrag={
    mode: e.button===2?'pan':'rotate',
    sx:e.clientX, sy:e.clientY,
    t0:cam.theta, p0:cam.phi, px0:cam.panX, py0:cam.panY
  };
  distCanvas.style.cursor='grabbing';
});
distCanvas.addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('mousemove',e=>{
  if(!camDrag)return;
  const dx=e.clientX-camDrag.sx, dy=e.clientY-camDrag.sy;
  if(camDrag.mode==='rotate'){
    cam.theta=camDrag.t0-dx*0.007;
    cam.phi  =Math.max(-Math.PI/2+0.05,Math.min(Math.PI/2-0.05,camDrag.p0+dy*0.007));
  } else {
    cam.panX=camDrag.px0+dx;
    cam.panY=camDrag.py0+dy;
  }
  if(!dist3DRunning) drawDist3D();
});
document.addEventListener('mouseup',()=>{
  if(camDrag){camDrag=null; distCanvas.style.cursor='grab';}
});

distCanvas.addEventListener('wheel',e=>{
  e.preventDefault();
  cam.zoom=Math.max(0.3,Math.min(8,cam.zoom*(e.deltaY<0?1.12:1/1.12)));
  if(!dist3DRunning) drawDist3D();
},{passive:false});

/* Hover planets (e, se attive, le loro lune principali) */
distCanvas.addEventListener('mousemove',e=>{
  if(camDrag)return;
  const rect=distCanvas.getBoundingClientRect();
  const mx=e.clientX-rect.left, my=e.clientY-rect.top;
  const bodies=getDistBodies();
  let found=null;
  for(const obj of bodies){
    const pp=getPlanetPos3D(obj); if(!pp) continue;
    const dotR=Math.max(3,Math.min(5,Math.log10(obj.radius)-0.5));
    if(dstMoons){
      const moons=moonsOfPlanet(obj.id);
      for(let idx=0;idx<moons.length;idx++){
        const mp=getMoonPos3D(moons[idx],pp,dotR,idx);
        if(Math.hypot(mx-mp.sx,my-mp.sy)<1.6+6){found=moons[idx];break;}
      }
      if(found)break;
    }
    if(Math.hypot(mx-pp.sx,my-pp.sy)<dotR+8){found=obj;break;}
  }
  const newId=found?found.id:null;
  if(newId!==distHover){distHover=newId; if(!dist3DRunning)drawDist3D();}
  if(found){
    distTip.style.display='block';
    distTip.style.left=(mx+12)+'px'; distTip.style.top=(my-6)+'px';
    const isMoon=found.type==='moon';
    distTip.textContent=isMoon
      ?`${found.name} — ${found.smaKm.toLocaleString('it')} km · T=${Lab.fmt((found.orbPeriod*365.25),2)} d`
      :`${found.name} — ${Lab.fmt(found.sma, 3)} AU · T = ${found.orbPeriod != null ? Lab.fmt(found.orbPeriod, 2) : "—"} anni`;
    distCanvas.style.cursor='pointer';
  } else {
    distTip.style.display='none';
    if(!camDrag) distCanvas.style.cursor='grab';
  }
});
distCanvas.addEventListener('mouseleave',()=>{
  distTip.style.display='none'; distHover=null; if(!dist3DRunning)drawDist3D();
});
distCanvas.addEventListener('click',e=>{
  if(distHover&&!camDrag) showModal(distHover);
});

/* ── Tab setup ── */
function setupTabs(){
  document.querySelectorAll('.ss-tab').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const tab=btn.dataset.tab;
      document.querySelectorAll('.ss-tab').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.ss-view').forEach(v=>v.classList.add('hidden'));
      document.getElementById('view-'+tab).classList.remove('hidden');
      if(tab==='sizes'){sizeHover=null;drawSizes();}
      if(tab==='distances'){distHover=null;drawDist3D();}
    });
  });
}

function setupToolbars(){
  /* Sizes */
  document.querySelectorAll('.sz-scale').forEach(btn=>btn.addEventListener('click',()=>{
    szScale=btn.dataset.s;
    document.querySelectorAll('.sz-scale').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); sizeHover=null; drawSizes();
  }));
  document.querySelectorAll('.sz-dist').forEach(btn=>btn.addEventListener('click',()=>{
    szDist=btn.dataset.d;
    document.querySelectorAll('.sz-dist').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); sizeHover=null; drawSizes();
  }));
  document.querySelector('.sz-moons').addEventListener('click',btn=>{
    szMoons=!szMoons;
    btn.currentTarget.classList.toggle('active',szMoons);
    sizeHover=null; drawSizes();
  });

  /* Distances */
  document.querySelectorAll('.dst-speed').forEach(btn=>btn.addEventListener('click',()=>{
    dist3DSpeedMult=parseFloat(btn.dataset.v);
    document.querySelectorAll('.dst-speed').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
  }));
  document.querySelectorAll('.dst-scale').forEach(btn=>btn.addEventListener('click',()=>{
    dstScale=btn.dataset.s;
    document.querySelectorAll('.dst-scale').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); if(!dist3DRunning) drawDist3D();
  }));
  document.querySelectorAll('.dst-filter').forEach(btn=>btn.addEventListener('click',()=>{
    dstFilter=btn.dataset.f;
    document.querySelectorAll('.dst-filter').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); if(!dist3DRunning) drawDist3D();
  }));
  document.querySelector('.dst-moons').addEventListener('click',e=>{
    dstMoons=!dstMoons;
    e.currentTarget.classList.toggle('active',dstMoons);
    if(!dist3DRunning) drawDist3D();
  });

  document.getElementById('btnDistPlay').addEventListener('click',()=>{
    dist3DRunning?stopDist3D():startDist3D();
  });
  document.getElementById('btnDistReset').addEventListener('click',()=>{
    cam.theta=Math.PI*0.55; cam.phi=0.42; cam.zoom=1; cam.panX=0; cam.panY=0;
    if(!dist3DRunning) drawDist3D();
  });
}

new MutationObserver(()=>{
  if(!document.getElementById('view-sizes').classList.contains('hidden')) drawSizes();
  if(!document.getElementById('view-distances').classList.contains('hidden')&&!dist3DRunning) drawDist3D();
}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});

new ResizeObserver(()=>{
  if(!document.getElementById('view-sizes').classList.contains('hidden')) drawSizes();
  if(!document.getElementById('view-distances').classList.contains('hidden')&&!dist3DRunning) drawDist3D();
}).observe(document.body);

distCanvas.style.cursor='grab';

/* ── Init ── */
function init(){
  Lab.initTheme();
  setupTabs();
  setupToolbars();
  buildGrid();
  drawDist3D();
  startDist3D();                      // la vista di apertura (Distanze 3D) parte già animata
}

init();
