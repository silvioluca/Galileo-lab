const TOPICS = [
  { id: 'all',           label: 'Tutti' },
  { id: 'cinematica',    label: 'Cinematica' },
  { id: 'dinamica',      label: 'Dinamica' },
  { id: 'fluidi',        label: 'Fluidi' },
  { id: 'termodinamica', label: 'Termodinamica' },
  { id: 'ottica',        label: 'Ottica' },
  { id: 'onde',          label: 'Onde' },
  { id: 'astronomia',        label: 'Astronomia' },
  { id: 'elettromagnetismo', label: 'Elettromagnetismo' },
  { id: 'nucleare',          label: 'Nucleare' },
  { id: 'relativita',        label: 'Relatività' },
];

const LABS = [
  {
    id: 'rectilinear-motion',
    name: 'Moti Rettilinei',
    desc: 'Studia il moto rettilineo uniforme (MRU) e uniformemente accelerato (MRUA) su una pista. Regola posizione, velocità e accelerazione iniziali, osserva i vettori v e a, la scia stroboscopica e i diagrammi x(t), v(t), a(t) con le relative equazioni orarie.',
    topic: 'cinematica',
    status: 'beta',
    icon: '🏁',
    url: 'labs/rectilinear-motion/',
  },
  {
    id: 'free-fall',
    name: 'Caduta Libera',
    desc: 'Studia il moto di un corpo in caduta, con o senza resistenza dell\'aria. Confronta gravità su pianeti diversi.',
    topic: 'cinematica',
    status: 'stable',
    icon: '🪨',
    url: 'labs/free-fall/',
  },
  {
    id: 'projectile',
    name: 'Moto del Proiettile',
    desc: 'Analizza la traiettoria parabolica di un proiettile al variare di angolo, velocità iniziale e gravità.',
    topic: 'cinematica',
    status: 'stable',
    icon: '🎯',
    url: 'labs/projectile/',
  },
  {
    id: 'circular-shm',
    name: 'Moto Circolare e Armonico',
    desc: 'Mostra come la proiezione del moto circolare uniforme sia un moto armonico: x = A·cos(ωt+φ). Visualizza il fasore sul cerchio, il punto oscillante, i vettori velocità e accelerazione (centripeta e armonica). Modalità confronto tra due oscillatori con diagrammi x(t), spazio delle fasi e figure di Lissajous.',
    topic: 'cinematica',
    status: 'beta',
    icon: '🌀',
    url: 'labs/circular-shm/',
  },
  {
    id: 'pendulum',
    name: 'Pendolo Semplice',
    desc: 'Osserva il moto oscillatorio di un pendolo e misura il periodo in funzione della lunghezza e dell\'angolo.',
    topic: 'dinamica',
    status: 'stable',
    icon: '⚖️',
    url: 'labs/pendulum/',
  },
  {
    id: 'double-pendulum',
    name: 'Pendolo Doppio',
    desc: 'Esplora il caos deterministico del pendolo doppio. Regola lunghezze, masse e angoli e osserva la traiettoria dei due estremi.',
    topic: 'dinamica',
    status: 'stable',
    icon: '🎡',
    url: 'labs/double-pendulum/',
  },
  {
    id: 'atwood',
    name: 'Macchina di Atwood',
    desc: 'Studia la macchina di Atwood in quattro configurazioni: un solo peso che fa girare la carrucola, due pesi contrapposti (Atwood classica, a = (m₁−m₂)g/(m₁+m₂+½M)), un peso appeso che trascina una massa su un piano orizzontale con attrito, e un sistema di carrucole multiple (paranco) con vantaggio meccanico n. La carrucola ha massa e raggio, quindi momento d\'inerzia I = ½·M·r² che riduce l\'accelerazione e rende diverse le due tensioni della fune. Varia massa e raggio della carrucola, le masse dei pesi, l\'attrito dinamico sul piano e il numero di carrucole. Grafici di posizione s(t), velocità v(t) e tensioni/forze.',
    topic: 'dinamica',
    status: 'beta',
    icon: '🛞',
    url: 'labs/atwood/',
  },
  {
    id: 'cavendish',
    name: 'Bilancia di Cavendish',
    desc: 'Ricostruisci l\'esperimento che pesò la Terra: una bilancia di torsione con due masse piccole sospese a un filo e due masse grandi fisse che le attraggono, F=G·M·m/d². Regola le masse, il braccio, la distanza e la costante di torsione del filo e osserva l\'asta ruotare fino all\'equilibrio. Novità: le masse possono anche essere caricate elettricamente, per confrontare in diretta quanto la forza di Coulomb sovrasti la gravità a parità di distanza.',
    topic: 'dinamica',
    status: 'beta',
    icon: '⚖️',
    url: 'labs/cavendish/',
  },
  {
    id: 'millikan',
    name: 'Esperimento di Millikan',
    desc: 'Rivivi la misura storica della carica elementare: una goccia d\'olio carica cade tra due piastre di un condensatore, in equilibrio tra peso efficace, resistenza viscosa dell\'aria e forza elettrica qE. Regola raggio della goccia, numero di cariche e tensione applicata per bilanciarla in sospensione e leggere la velocità limite. Grafici di v(t), retta v(V) e pettine di quantizzazione q=n·e a dimostrare che la carica elettrica non è continua ma multipla discreta di e.',
    topic: 'nucleare',
    status: 'beta',
    icon: '💧',
    url: 'labs/millikan/',
  },
  {
    id: 'quantum-well',
    name: 'Buca di Potenziale',
    desc: 'Una particella intrappolata in una buca di potenziale infinita: solo alcune energie E_n=n²π²ℏ²/(2mL²) sono permesse, ciascuna con la propria funzione d\'onda a n−1 nodi. Un autostato puro è uno stato stazionario — la densità di probabilità |Ψ|² non cambia nel tempo, solo la fase ruota. Passa alla modalità sovrapposizione di due autostati per vedere il pacchetto di probabilità "sloscare" avanti e indietro nella buca con un periodo di battimento T=h/(E₂−E₁): regola larghezza del pozzo e massa della particella (elettrone o protone) per vedere come cambiano energie e velocità di oscillazione.',
    topic: 'nucleare',
    status: 'beta',
    icon: '📦',
    url: 'labs/quantum-well/',
  },
  {
    id: 'quantum-tunnel',
    name: 'Effetto Tunnel',
    desc: 'Un pacchetto d\'onda quantistico lanciato contro una barriera di potenziale: risolvendo numericamente l\'equazione di Schrödinger dipendente dal tempo (Crank-Nicolson), osserva la probabilità dividersi fra riflessione e trasmissione — anche quando l\'energia della particella è INFERIORE all\'altezza della barriera, classicamente proibito. Regola altezza e larghezza della barriera, energia e massa della particella (elettrone o protone: il protone tunnela molto meno, a parità di barriera) e confronta la trasmissione simulata con la formula teorica esatta.',
    topic: 'nucleare',
    status: 'beta',
    icon: '🚇',
    url: 'labs/quantum-tunnel/',
  },
  {
    id: 'foucault-pendulum',
    name: 'Pendolo di Foucault',
    desc: 'La dimostrazione con cui Foucault provò nel 1851, senza guardare il cielo, che la Terra ruota: il piano di oscillazione di un pendolo libero precede rispetto al suolo per effetto Coriolis, con verso e velocità che dipendono dalla latitudine (orario nell\'emisfero Nord, antiorario nel Sud, nullo all\'equatore). Regola latitudine, lunghezza del filo ed ellitticità del rilascio iniziale e osserva la rosetta tracciata dal pendolo — la precessione reale richiederebbe ore, qui è volutamente esagerata (dichiarato in readout) per restare osservabile.',
    topic: 'dinamica',
    status: 'beta',
    icon: '🧭',
    url: 'labs/foucault-pendulum/',
  },
  {
    id: 'resonance',
    name: 'Risonanza',
    desc: 'Studia l\'oscillatore armonico forzato e smorzato: m·x″ + c·x′ + k·x = F₀·cos(ωt). Regola massa, costante elastica, smorzamento c e la pulsazione forzante ω per avvicinarti alla frequenza propria ω₀ e osservare l\'ampiezza crescere. Curve di risonanza A(ω) e sfasamento φ(ω), fattore di qualità Q. Modalità confronto tra due smorzamenti diversi per vedere come Q determina la nitidezza del picco. Modalità Ponte: la stessa fisica applicata alla torsione dell\'impalcato, per rivivere il collasso del Tacoma Narrows Bridge (1940).',
    topic: 'dinamica',
    status: 'beta',
    icon: '🔔',
    url: 'labs/resonance/',
  },
  {
    id: 'satellite-orbit',
    name: 'Orbite dei Satelliti',
    desc: 'Simula il moto orbitale di un satellite attorno a diversi pianeti (Terra, Marte, Giove, Luna). Visualizza i vettori forza di gravità e centrifuga, orbite circolari ed ellittiche, momento angolare L conservato, e l\'orbita geostazionaria. Regola distanza r e velocità (in frazioni di v_circolare).',
    topic: 'astronomia',
    status: 'beta',
    icon: '🛰️',
    url: 'labs/satellite-orbit/',
  },
  {
    id: 'universe-expansion',
    name: "Espansione dell'Universo",
    desc: 'Esplora la storia dell\'universo con l\'equazione di Friedmann (modello ΛCDM): dal Big Bang a oggi, attraverso ricombinazione, età oscura, prime stelle ed espansione accelerata. Due visualizzazioni: la cronologia a "cono" con le epoche cosmiche, e una mappa del fondo cosmico a microonde (CMB) generata proceduralmente. Regola Ωm, ΩΛ e H₀ e osserva come cambiano il fattore di scala a(t), il redshift e la temperatura.',
    topic: 'astronomia',
    status: 'beta',
    icon: '⏳',
    url: 'labs/universe-expansion/',
  },
  {
    id: 'celestial',
    name: 'Moti Celesti',
    desc: 'Simula il problema dei due corpi con la gravità newtoniana. Scegli masse, velocità e direzione per ottenere orbite circolari, ellittiche, paraboliche o iperboliche.',
    topic: 'dinamica',
    status: 'stable',
    icon: '🪐',
    url: 'labs/celestial/',
  },
  {
    id: 'three-body',
    name: 'Problema dei Tre Corpi',
    desc: 'Esplora la dinamica caotica di tre masse che interagiscono gravitazionalmente. Preset: orbita a figura-8, triangolo equilatero di Lagrange, sistema gerarchico stella-pianeta-luna e traiettorie caotiche.',
    topic: 'astronomia',
    status: 'stable',
    icon: '🌌',
    url: 'labs/three-body/',
  },
  {
    id: 'solar-system',
    name: 'Sistema Solare',
    desc: 'Esplora i dati di pianeti, satelliti e pianeti nani. Confronta dimensioni in scala e distanze orbitali.',
    topic: 'astronomia',
    status: 'beta',
    icon: '🌍',
    url: 'labs/solar-system/',
  },
  {
    id: 'black-hole',
    name: 'Buco Nero',
    desc: 'Esplora la fisica dei buchi neri di Schwarzschild in due modalità: lente gravitazionale con ray tracing dei fotoni e geodetiche relativistiche con potenziale effettivo.',
    topic: 'astronomia',
    status: 'stable',
    icon: '🕳️',
    url: 'labs/black-hole/',
  },
  {
    id: 'inclined-plane',
    name: 'Piano Inclinato',
    desc: 'Esplora equilibrio e moto su piano inclinato. Varia l\'angolo, la massa e il coefficiente di attrito. Visualizza le forze in gioco.',
    topic: 'dinamica',
    status: 'stable',
    icon: '📐',
    url: 'labs/inclined-plane/',
  },
  {
    id: 'spring',
    name: 'Forza Elastica',
    desc: 'Studia il moto oscillatorio di una massa appesa a una molla. Regola costante elastica, lunghezza naturale e massa. Visualizza i vettori forza e i grafici x(t) e v(t).',
    topic: 'dinamica',
    status: 'stable',
    icon: '🌀',
    url: 'labs/spring/',
  },
  {
    id: 'ballistic-pendulum',
    name: 'Pendolo Balistico',
    desc: 'Studia la conservazione della quantità di moto: un proiettile si conficca in un pendolo balistico e ne misura la velocità dall\'angolo di oscillazione. Confronta l\'energia cinetica prima e dopo l\'urto.',
    topic: 'dinamica',
    status: 'stable',
    icon: '🎯',
    url: 'labs/ballistic-pendulum/',
  },
  {
    id: 'collisions',
    name: 'Urti',
    desc: 'Studia gli urti rettilinei e obliqui tra due corpi. Scegli urto elastico, anelastico o perfettamente anelastico. Varia masse, velocità iniziali e angolo di impatto. Confronta energia cinetica e quantità di moto prima e dopo l\'urto.',
    topic: 'dinamica',
    status: 'stable',
    icon: '🎱',
    url: 'labs/collisions/',
  },
  {
    id: 'wind-tunnel',
    name: 'Galleria del Vento',
    desc: 'Simula il flusso di un fluido intorno a un profilo alare con il metodo Lattice Boltzmann D2Q9. Posiziona e ruota il profilo, varia la velocità e la viscosità, osserva vorticità, scia di von Kármán e la distribuzione del coefficiente di pressione Cp.',
    topic: 'fluidi',
    status: 'beta',
    icon: '🌬️',
    url: 'labs/wind-tunnel/',
  },
  {
    id: 'venturi',
    name: 'Effetto Venturi',
    desc: 'Esplora la relazione tra velocità e pressione in un fluido in moto attraverso un tubo di Venturi. Osserva la caduta di pressione nella strozzatura e verifica che P + ½ρv² rimanga costante.',
    topic: 'fluidi',
    status: 'stable',
    icon: '💨',
    url: 'labs/venturi/',
  },
  {
    id: 'bernoulli',
    name: 'Equazione di Bernoulli',
    desc: 'Studia l\'equazione di Bernoulli in un tubo con due sezioni a quote diverse. Varia raggi, altezze, velocità e pressione e osserva come la conservazione dell\'energia governa il flusso.',
    topic: 'fluidi',
    status: 'stable',
    icon: '🌊',
    url: 'labs/bernoulli/',
  },
  {
    id: 'gas',
    name: 'Leggi dei Gas',
    desc: 'Esplora le trasformazioni isobare, isocore e isoterme di un gas ideale. Visualizza P-V, V-T e P-T e calcola lavoro, calore e variazione di energia interna.',
    topic: 'termodinamica',
    status: 'stable',
    icon: '⚗️',
    url: 'labs/gas/',
  },
  {
    id: 'cammino-libero',
    name: 'Cammino Libero Medio',
    desc: 'Simula un gas molecolare 2D con collisioni elastiche. Misura la distribuzione dei cammini liberi e confrontala con la legge esponenziale teorica. Osserva la distribuzione di Maxwell-Boltzmann delle velocità emergere dalle collisioni.',
    topic: 'termodinamica',
    status: 'stable',
    icon: '⚛️',
    url: 'labs/cammino-libero/',
  },
  {
    id: 'carnot',
    name: 'Ciclo di Carnot',
    desc: 'Visualizza il ciclo termodinamico di Carnot su un diagramma P-V e calcola l\'efficienza della macchina.',
    topic: 'termodinamica',
    status: 'stable',
    icon: '🌡️',
    url: 'labs/carnot/',
  },
  {
    id: 'heat-engines',
    name: 'Macchine Termiche',
    desc: 'Simula i cicli termodinamici dei principali motori: Otto (benzina), Diesel, Brayton (turbina), Stirling, Ericsson e Carnot. Visualizza il sistema pistone-cilindro animato con il gas colorato per temperatura e il diagramma P-V affiancato, con rendimento, lavoro netto e bilancio energetico Q_in/W/Q_out.',
    topic: 'termodinamica',
    status: 'beta',
    icon: '⚙️',
    url: 'labs/heat-engines/',
  },
  {
    id: 'refrigerator',
    name: 'Macchina Frigorifera',
    desc: 'Schema completo di un frigorifero a compressione di vapore: camera fredda, evaporatore (serpentina fredda) interno, condensatore (serpentina calda) esterno, compressore e valvola di espansione, con il refrigerante che circola colorato per fase. Termostato con isteresi, raffreddamento della camera nel tempo, COP confrontato col limite di Carnot e bilancio energetico Q_caldo = Q_freddo + W.',
    topic: 'termodinamica',
    status: 'beta',
    icon: '🧊',
    url: 'labs/refrigerator/',
  },
  {
    id: 'hall-effect',
    name: 'Effetto Hall',
    desc: 'Studia l\'effetto Hall su una lamina conduttrice rappresentata in 3D: corrente I lungo x, campo B lungo z e tensione di Hall V_H = I·B/(n·e·t) misurata lungo y. Confronta le due ipotesi sui portatori di carica (positivi/lacune vs negativi/elettroni): vengono deflessi dallo stesso lato ma producono un segno di V_H opposto, ed è così che l\'effetto Hall rivela il segno dei portatori. Grafici di V_H in funzione di B, I e n.',
    topic: 'elettromagnetismo',
    status: 'beta',
    icon: '🧲',
    url: 'labs/hall-effect/',
  },
  {
    id: 'photoelectric',
    name: 'Effetto Fotoelettrico',
    desc: 'Illumina un catodo metallico e osserva l\'emissione di elettroni: varia la frequenza della radiazione, l\'intensità, il materiale (lavoro di estrazione φ) e la tensione anodica. Verifica K_max = hν − φ, la frequenza di soglia ν₀ (sotto cui non c\'è emissione a qualsiasi intensità), la tensione d\'arresto V₀ e il fatto che la corrente dipende dall\'intensità mentre l\'energia dipende dalla frequenza. Grafici I–V, K_max(ν) e I–intensità con diagramma energetico hν = φ + K_max.',
    topic: 'nucleare',
    status: 'beta',
    icon: '🔆',
    url: 'labs/photoelectric/',
  },
  {
    id: 'drift-velocity',
    name: 'Velocità di Deriva',
    desc: 'Simula il moto degli elettroni di conduzione in un metallo: agitazione casuale velocissima (~10⁶ m/s, velocità di Fermi) con collisioni sul reticolo di ioni, e lenta deriva netta (~10⁻⁴ m/s) quando scorre corrente. Visualizza un elettrone tracciante a zig-zag, il centro di massa che deriva, e calcola v_d = I/(n·e·A) = μ·E. Varia corrente, sezione, lunghezza, temperatura e materiale (Cu, Al, Ag, Au). Grafici v_d–I, legge di Ohm e confronto Fermi/deriva.',
    topic: 'elettromagnetismo',
    status: 'beta',
    icon: '🔌',
    url: 'labs/drift-velocity/',
  },
  {
    id: 'volta-thermionic',
    name: 'Effetto Volta e Termoionico',
    desc: 'Due fenomeni legati al lavoro di estrazione dei metalli. Effetto Volta: due metalli diversi a contatto allineano i livelli di Fermi e generano una d.d.p. di contatto V = (φ_B − φ_A)/e, con il metallo a φ minore che si carica positivamente; diagramma a bande energetiche e serie di Volta. Effetto termoionico: un catodo riscaldato emette elettroni secondo la legge di Richardson-Dushman J = A·T²·e^(−φ/kT); varia temperatura e materiale e osserva il diodo termoionico, con grafici J(T), J(φ) e il diagramma di Richardson.',
    topic: 'elettromagnetismo',
    status: 'beta',
    icon: '🔋',
    url: 'labs/volta-thermionic/',
  },
  {
    id: 'band-model',
    name: 'Modello a Bande',
    desc: 'Teoria delle bande di conduttori, semiconduttori e isolanti. Visualizza la banda di valenza e di conduzione separate dal gap energetico E_g, l\'eccitazione termica degli elettroni attraverso il gap (∝ e^(−E_g/2kT)) con le lacune lasciate in valenza, e la classificazione automatica (gap nullo → conduttore, piccolo → semiconduttore, grande → isolante). Varia E_g, temperatura e drogaggio (intrinseco, tipo n, tipo p). Grafici σ(T), distribuzione di Fermi-Dirac e diagramma di Arrhenius.',
    topic: 'nucleare',
    status: 'beta',
    icon: '📊',
    url: 'labs/band-model/',
  },
  {
    id: 'pn-transistor',
    name: 'Giunzione pn e Transistor',
    desc: 'Tre dispositivi a semiconduttore in un\'unica app. Semiconduttore drogato: ioni droganti fissi (donatori + / accettori −) e portatori maggioritari mobili (elettroni o lacune). Giunzione p-n: zona di svuotamento, campo di built-in, e polarizzazione diretta (conduce) o inversa (blocca) con la caratteristica I–V del diodo e la larghezza di svuotamento W(V). Transistor BJT (npn/pnp): iniezione di portatori emettitore→base→collettore, corrente di base che controlla quella di collettore con guadagno I_C = β·I_B e le caratteristiche di transfer e di uscita.',
    topic: 'nucleare',
    status: 'beta',
    icon: '🔀',
    url: 'labs/pn-transistor/',
  },
  {
    id: 'color-synthesis',
    name: 'Sintesi del Colore',
    desc: 'Esplora la sintesi additiva (RGB, luce) e sottrattiva (CMY, pigmenti) del colore. Varia l\'intensità di ciascun primario e osserva i colori misti nelle zone di sovrapposizione.',
    topic: 'ottica',
    status: 'stable',
    icon: '🎨',
    url: 'labs/color-synthesis/',
  },
  {
    id: 'geometric-optics',
    name: 'Ottica Geometrica — Lenti',
    desc: 'Esplora la formazione delle immagini attraverso lenti convergenti e divergenti. Studia i sei tipi di lente con ray tracing paraxiale, regola curvature, indice di rifrazione e posizione dell\'oggetto.',
    topic: 'ottica',
    status: 'stable',
    icon: '🔭',
    url: 'labs/geometric-optics/',
  },
  {
    id: 'eye',
    name: 'L\'Occhio Umano',
    desc: 'Esplora la formazione delle immagini nell\'occhio. Simula miopia, ipermetropia e astigmatismo, varia le diottrie del difetto e posiziona una lente correttiva per simulare occhiali o lenti a contatto.',
    topic: 'ottica',
    status: 'stable',
    icon: '👁️',
    url: 'labs/eye/',
  },
  {
    id: 'refraction',
    name: 'Rifrazione della Luce',
    desc: 'Esplora la legge di Snell al variare degli indici di rifrazione e dell\'angolo di incidenza. Visualizza la dispersione cromatica con la legge di Cauchy.',
    topic: 'ottica',
    status: 'stable',
    icon: '🔬',
    url: 'labs/refraction/',
  },
  {
    id: 'prism',
    name: 'Prisma Ottico',
    desc: 'Studia la rifrazione e la dispersione della luce attraverso prismi di diversa forma. Osserva la separazione spettrale con la legge di Cauchy.',
    topic: 'ottica',
    status: 'stable',
    icon: '🔷',
    url: 'labs/prism/',
  },
  {
    id: 'spectra',
    name: 'Spettri Atomici',
    desc: 'Confronta lo spettro di emissione (righe luminose) e di assorbimento (righe scure su continuo) di diversi elementi: idrogeno, elio, sodio, neon, mercurio e altri. Righe spettrali reali nel visibile, energia dei fotoni E=hc/λ e serie spettrali dell\'idrogeno. Passa il mouse per leggere la lunghezza d\'onda.',
    topic: 'ottica',
    status: 'beta',
    icon: '🎆',
    url: 'labs/spectra/',
  },
  {
    id: 'polarization',
    name: 'Polarizzazione',
    desc: 'Esplora la polarizzazione della luce con fino a tre filtri polaroid orientabili (trascinabili). Verifica la legge di Malus I = I₀·cos²(θ), il caso dei polarizzatori incrociati e il terzo filtro che "riapre" il fascio. Visualizza il campo E, il vettore di Poynting, lo schermo e i grafici di intensità per stadio.',
    topic: 'ottica',
    status: 'beta',
    icon: '🕶️',
    url: 'labs/polarization/',
  },
  {
    id: 'hydrogen-series',
    name: 'Serie dell\'Idrogeno',
    desc: 'Visualizza il diagramma dei livelli energetici dell\'idrogeno e tutte le serie spettrali di emissione: Lyman (UV), Balmer (visibile), Paschen, Brackett e Pfund (IR). Le frecce mostrano le transizioni n_i → n_f. Toggle per regione spettrale (UV/visibile/IR), formula di Rydberg e energie dei livelli.',
    topic: 'ottica',
    status: 'beta',
    icon: '🪜',
    url: 'labs/hydrogen-series/',
  },
  {
    id: 'de-broglie',
    name: 'Dualismo di De Broglie',
    desc: 'Esplora il dualismo onda-particella: λ = h/p. Visualizza il pacchetto d\'onda di una particella, l\'esperimento della doppia fenditura con il build-up statistico delle frange d\'interferenza, e il confronto della lunghezza d\'onda di de Broglie tra elettroni, protoni, C₆₀ e oggetti macroscopici.',
    topic: 'onde',
    status: 'beta',
    icon: '🫧',
    url: 'labs/de-broglie/',
  },
  {
    id: 'relativity',
    name: 'Relatività Speciale',
    desc: 'Esplora gli effetti della relatività speciale di Einstein: diagramma spazio-temporale di Minkowski, cono di luce, dilatazione del tempo, contrazione delle lunghezze e fattore di Lorentz γ. Regola la velocità β = v/c e osserva come cambiano gli assi del sistema in moto.',
    topic: 'relativita',
    status: 'beta',
    icon: '🌌',
    url: 'labs/relativity/',
  },
  {
    id: 'doppler-rel',
    name: 'Doppler Relativistico',
    desc: 'Simula l\'effetto Doppler relativistico: fronti d\'onda in espansione, spettro spostato e confronto con il Doppler classico. Regola β e la lunghezza d\'onda sorgente, scegli il modo avvicinamento, allontanamento o trasversale.',
    topic: 'relativita',
    status: 'beta',
    icon: '🌈',
    url: 'labs/doppler-rel/',
  },
  {
    id: 'gr',
    name: 'Relativita Generale',
    desc: 'Esplora la curvatura dello spaziotempo nella metrica di Schwarzschild: griglia spaziale deformata, traiettorie dei fotoni e dilatazione gravitazionale del tempo. Regola il raggio di Schwarzschild e osserva il paraboloide di Flamm.',
    topic: 'relativita',
    status: 'beta',
    icon: '⚫',
    url: 'labs/gr/',
  },
  {
    id: 'einstein-elevator',
    name: 'Ascensore di Einstein',
    desc: 'Esplora il principio di equivalenza di Einstein: caduta libera in un campo gravitazionale è localmente indistinguibile dalla deriva nello spazio; essere in sospensione è identico a un razzo in accelerazione. Visualizza oggetti in imponderabilità, la curvatura della luce e la dilatazione degli orologi.',
    topic: 'relativita',
    status: 'beta',
    icon: '🛗',
    url: 'labs/einstein-elevator/',
  },
  {
    id: 'doppler',
    name: 'Effetto Doppler',
    desc: 'Visualizza i fronti d\'onda di una sorgente in moto e ascolta la variazione di frequenza percepita dall\'osservatore. Regola velocità di sorgente e osservatore, supera la velocità del suono e osserva il cono di Mach (effetto Cherenkov acustico).',
    topic: 'onde',
    status: 'beta',
    icon: '📡',
    url: 'labs/doppler/',
  },
  {
    id: 'diffraction',
    name: 'Interferenza e Diffrazione',
    desc: 'Studia la diffrazione di Fraunhofer con fenditura singola, doppia, tripla e reticolo. Visualizza lo schema ottico e il pattern sullo schermo con luce monocromatica o bianca.',
    topic: 'onde',
    status: 'stable',
    icon: '〰️',
    url: 'labs/diffraction/',
  },
  {
    id: 'wave-function',
    name: "Funzione d'Onda",
    desc: 'Esplora la funzione d\'onda armonica y(x,t) = A·sin(kx − ωt + φ). Regola ampiezza, periodo, lunghezza d\'onda, fase iniziale e direzione di propagazione, trascina la sonda per leggere l\'oscillazione nel tempo in un punto. Modalità confronto tra due onde con somma y₁+y₂ e diagramma di fase.',
    topic: 'onde',
    status: 'beta',
    icon: '📈',
    url: 'labs/wave-function/',
  },
  {
    id: 'standing-waves',
    name: 'Onde Stazionarie',
    desc: 'Visualizza onde stazionarie su corda fissata o tubo risonante. Esplora armoniche, nodi e ventri al variare di frequenza, lunghezza e tensione.',
    topic: 'onde',
    status: 'stable',
    icon: '〰️',
    url: 'labs/standing-waves/',
  },
  {
    id: 'waves',
    name: 'Onde e Fronti d\'Onda',
    desc: 'Esplora la propagazione delle onde scegliendo la direzione di oscillazione (trasversale o longitudinale) e la geometria del fronte d\'onda: piana, circolare, cilindrica (sorgente lineare) o sferica, con il corretto decadimento dell\'ampiezza (1/√r per circolari e cilindriche, 1/r per sferiche). Regola velocità v e lunghezza d\'onda λ e osserva f = v/λ, i fronti d\'onda che si espandono e le particelle del mezzo che oscillano. Include la modalità onda stazionaria su corda fissata agli estremi, dove la velocità v = √(T/μ) dipende dalla tensione e dalla densità lineare, con armoniche selezionabili, nodi e ventri e f_n = n·v/2L. Grafici di profilo d\'onda, relazione f(λ) o v(T) e armoniche.',
    topic: 'onde',
    status: 'beta',
    icon: '🌐',
    url: 'labs/waves/',
  },
  {
    id: 'faraday',
    name: 'Induzione di Faraday',
    desc: 'Simula l\'esperimento di Faraday (1831): un magnete che si avvicina a una bobina induce una corrente. Visualizza il flusso magnetico, la FEM indotta e la legge di Lenz. Trascina il magnete manualmente oppure avvia l\'oscillazione automatica.',
    topic: 'elettromagnetismo',
    status: 'beta',
    icon: '🔄',
    url: 'labs/faraday/',
  },
  {
    id: 'em-field',
    name: 'Campo Elettrico',
    desc: 'Visualizza il campo elettrico e il potenziale di monopoli, dipoli, quadrupoli e multipoli superiori. Trascina la sonda per misurare V ed E in ogni punto, e le cariche per riposizionarle.',
    topic: 'elettromagnetismo',
    status: 'stable',
    icon: '⚡',
    url: 'labs/em-field/',
  },
  {
    id: 'ondoscopio',
    name: 'Ondoscopio',
    desc: 'Simula onde su una vasca con equazione delle onde 2D. Varia frequenza e ampiezza, posiziona sorgenti singole o doppie, aggiungi ostacoli e fenditure, osserva diffrazione e interferenza con oggetti flottanti.',
    topic: 'onde',
    status: 'beta',
    icon: '🌊',
    url: 'labs/ondoscopio/',
  },
  {
    id: 'correnti',
    name: 'Campi da Correnti',
    desc: 'Visualizza il campo magnetico di filo infinito, spira circolare/quadrata, solenoide e toroide. Biot-Savart in 3D con piano di taglio colorato e linee di campo interattive.',
    topic: 'elettromagnetismo',
    status: 'beta',
    icon: '🔌',
    url: 'labs/correnti/',
  },
  {
    id: 'ampere-wires',
    name: 'Esperienza di Ampère',
    desc: 'Due fili paralleli percorsi da corrente si attraggono (correnti concordi) o si respingono (discordi). Forza per unità di lunghezza F/L = μ₀·I₁·I₂/(2πd), visualizzazione 2D (sezione) e 3D, campo magnetico e vettori forza attivabili. La tensione dei fili regola lo spostamento.',
    topic: 'elettromagnetismo',
    status: 'beta',
    icon: '🔗',
    url: 'labs/ampere-wires/',
  },
  {
    id: 'rc-circuit',
    name: 'Circuito RC',
    desc: 'Simula la carica e la scarica di un condensatore attraverso un resistore. Visualizza V_C(t)=V₀(1−e^(−t/τ)), la corrente esponenziale, la costante di tempo τ=RC, il flusso di corrente animato e l\'accumulo di carica sulle armature. Regola R, C e V₀.',
    topic: 'elettromagnetismo',
    status: 'beta',
    icon: '🔋',
    url: 'labs/rc-circuit/',
  },
  {
    id: 'rlc-ac',
    name: 'Circuito RLC in AC',
    desc: 'Simula un circuito RLC serie alimentato in corrente alternata. Visualizza il diagramma dei fasori rotanti (V_R, V_L, V_C, f.e.m. e corrente), reattanze X_L e X_C, impedenza Z, sfasamento φ e la risonanza f₀ = 1/(2π√(LC)). Diagrammi delle forme d\'onda, curva di risonanza e impedenza in frequenza.',
    topic: 'elettromagnetismo',
    status: 'beta',
    icon: '🎛️',
    url: 'labs/rlc-ac/',
  },
  {
    id: 'mag-field',
    name: 'Campo Magnetico',
    desc: 'Visualizza il campo magnetico generato da magneti permanenti. Trascina i magneti, ruotali con lo scroll del mouse. Osserva linee di campo, mappa di calore e pattern di limatura di ferro.',
    topic: 'elettromagnetismo',
    status: 'stable',
    icon: '🧲',
    url: 'labs/mag-field/',
  },
  {
    id: 'michelson',
    name: 'Interferometro di Michelson-Morley',
    desc: 'Simula l\'interferometro di Michelson-Morley (1887). Visualizza l\'apparato con i due bracci, il divisore di fascio e il rivelatore. Mostra lo spostamento di frangia classico atteso (in funzione del "vento d\'etere") e il risultato nullo osservato, che aprì la strada alla relatività.',
    topic: 'onde',
    status: 'stable',
    icon: '🔬',
    url: 'labs/michelson/',
  },
  {
    id: 'battimenti',
    name: 'Battimenti',
    desc: 'Sovrapponi due onde sinusoidali di frequenze vicine e osserva i battimenti. Varia ampiezze e frequenze, ascolta il suono risultante e studia inviluppo e frequenza di battimento.',
    topic: 'onde',
    status: 'stable',
    icon: '🎵',
    url: 'labs/battimenti/',
  },
  {
    id: 'velocity-selector',
    name: 'Selettore di Velocità',
    desc: 'Studia il selettore di velocità di Thomson: una particella carica attraversa un condensatore piano con campi E e B incrociati. Solo le particelle con v = E/B passano indisturbate. Varia campi, carica, altezza e geometria; osserva traiettoria e condizione di selezione.',
    topic: 'elettromagnetismo',
    status: 'stable',
    icon: '⇌',
    url: 'labs/velocity-selector/',
  },
  {
    id: 'mass-spectrometer',
    name: 'Spettrometro di Massa',
    desc: 'Simula lo spettrometro di massa: ioni con velocità nota entrano in un campo magnetico e descrivono semicerchi di raggio r = mv/(qB). Varia campo B, velocità, carica e masse di due isotopi e osserva la separazione sul rilevatore.',
    topic: 'elettromagnetismo',
    status: 'stable',
    icon: '⚛',
    url: 'labs/mass-spectrometer/',
  },
  {
    id: 'transformer',
    name: 'Trasformatore',
    desc: 'Simula un trasformatore ideale: V₂/V₁ = N₂/N₁. Varia il voltaggio di ingresso, il numero di spire primario e secondario, il nucleo magnetico (aria/ferrite/ferro) e la modalità AC/DC. Osserva V₁ e V₂ sullo stesso grafico.',
    topic: 'elettromagnetismo',
    status: 'stable',
    icon: '⚡',
    url: 'labs/transformer/',
  },
  {
    id: 'displacement',
    name: 'Corrente di Spostamento',
    desc: 'Osserva la legge di Ampere-Maxwell con un condensatore in carica AC. Trascina il percorso amperiano dal filo (I_c) al gap (I_d): ∮ B·dl resta invariato. Il campo B esiste anche nel gap dove non c\'è filo.',
    topic: 'elettromagnetismo',
    status: 'stable',
    icon: '⚡',
    url: 'labs/displacement/',
  },
  {
    id: 'ampere',
    name: 'Teorema di Ampere',
    desc: 'Esplora il teorema di Ampere (∮ B·dl = μ₀·I_enc). Sposta fili percorsi da corrente, varia il percorso amperiano (circolare, rettangolare, amorfo) e osserva l\'integrale di linea cumulativo confrontato con il valore teorico.',
    topic: 'elettromagnetismo',
    status: 'stable',
    icon: '🌀',
    url: 'labs/ampere/',
  },
  {
    id: 'gauss',
    name: 'Teorema di Gauss',
    desc: 'Esplora il teorema di Gauss per il campo elettrico (∮ E·dA = Q_enc/ε₀) e magnetico (∮ B·dA = 0). Sposta cariche o dipoli, varia la superficie di Gauss (sferica, cubica, amorfa) e osserva il flusso numerico confrontato con il valore teorico.',
    topic: 'elettromagnetismo',
    status: 'stable',
    icon: '🔮',
    url: 'labs/gauss/',
  },
  {
    id: 'atomic-models',
    name: 'Modelli Atomici',
    desc: 'Esplora l\'evoluzione dei modelli atomici: Thomson (panettone, 1904), Rutherford (planetario, 1911), Bohr (orbite quantizzate, 1913) e Schrödinger (orbitali, 1926). Per ogni modello: fisico, anno, energie degli elettroni e limiti. Eccita l\'elettrone di Bohr e visualizza gli orbitali quantistici.',
    topic: 'nucleare',
    status: 'beta',
    icon: '⚛',
    url: 'labs/atomic-models/',
  },
  {
    id: 'orbitals',
    name: 'Orbitali Atomici',
    desc: 'Visualizza tutti gli orbitali atomici in 3D (nuvola di probabilità ruotabile) e 2D (sezione |ψ|²) per ogni elemento (Z=1–118). Seleziona l\'elemento, la subshell occupata e i numeri quantici n, l, mₗ, mₛ. Funzioni d\'onda idrogenoidi esatte (Laguerre + armoniche sferiche reali) con nodi radiali e angolari corretti.',
    topic: 'nucleare',
    status: 'beta',
    icon: '🌐',
    url: 'labs/orbitals/',
  },
  {
    id: 'rutherford',
    name: 'Esperimento di Rutherford',
    desc: 'Simula lo scattering di particelle α su un foglio d\'oro (Z=79). Visualizza le traiettorie iperboliche, il parametro d\'impatto b, la formula di Rutherford dσ/dΩ e l\'istogramma angolare in modalità fascio continuo.',
    topic: 'nucleare',
    status: 'stable',
    icon: '⚛️',
    url: 'labs/rutherford/',
  },
  {
    id: 'compton',
    name: 'Effetto Compton',
    desc: 'Simula lo scattering Compton fotone-elettrone. Visualizza il pacchetto d\'onda incidente e diffuso, il rinculo dell\'elettrone, gli angoli θ e φ, e il diagramma polare Klein-Nishina. Modalità continua con distribuzione statistica.',
    topic: 'nucleare',
    status: 'stable',
    icon: '💫',
    url: 'labs/compton/',
  },
  {
    id: 'fission',
    name: 'Fissione Nucleare',
    desc: 'Simula la reazione a catena in un materiale fissile. Scegli elemento (U-235, Pu-239, U-233, U-238), arricchimento, densità e moderatore. Regola le barre di controllo e osserva il regime sub/super/critico con il fattore k_eff in tempo reale.',
    topic: 'nucleare',
    status: 'stable',
    icon: '💥',
    url: 'labs/fission/',
  },
  {
    id: 'radioactive',
    name: 'Decadimento Radioattivo',
    desc: 'Osserva il decadimento stocastico di un insieme di atomi. Confronta la curva N(t) con l\'esponenziale teorico N₀·e^(−λt). Attiva la catena A→B→stabile e studia le equazioni di Bateman. Scegli tra decadimento α, β e γ.',
    topic: 'nucleare',
    status: 'stable',
    icon: '☢️',
    url: 'labs/radioactive/',
  },
  {
    id: 'cloud-chamber',
    name: 'Camera a Nebbia',
    desc: 'Simula una camera a nebbia a diffusione. Scegli la sorgente radioattiva (α, β o Radon-222), regola l\'attività e applica un campo magnetico perpendicolare per osservare la curvatura delle tracce. Trascina la sorgente nel piano.',
    topic: 'nucleare',
    status: 'beta',
    icon: '☁️',
    url: 'labs/cloud-chamber/',
  },
  {
    id: 'lorentz',
    name: 'Forza di Lorentz',
    desc: 'Studia il moto di una carica in campi elettrici e magnetici. Osserva orbite circolari, il raggio di Larmor al variare di q e m, e la deriva E×B in campi incrociati.',
    topic: 'elettromagnetismo',
    status: 'stable',
    icon: '🧲',
    url: 'labs/lorentz/',
  },
  {
    id: 'skin-effect',
    name: 'Effetto Pelle',
    desc: 'Simula l\'effetto pelle nei conduttori percorsi da corrente alternata: la densità di corrente si addensa verso la superficie e la profondità di penetrazione δ = 1/√(π·f·μ·σ) diminuisce con la frequenza. Visualizza la sezione del filo colorata per densità di corrente con l\'anello di δ, la vista longitudinale, e calcola l\'aumento di resistenza R_ac/R_dc. Varia frequenza, materiale (Cu, Al, Ag, Au, Fe ferromagnetico) e raggio. Grafici J(r), δ(f) e R_ac/R_dc(f).',
    topic: 'elettromagnetismo',
    status: 'beta',
    icon: '📡',
    url: 'labs/skin-effect/',
  },
  {
    id: 'communicating-vessels',
    name: 'Vasi Comunicanti',
    desc: 'Un liquido versato in recipienti di forma diversa connessi alla base raggiunge lo stesso livello in tutti, indipendentemente dalla forma e dalla sezione (legge di Stevino, p = ρgh). Modalità tubo a U con due liquidi immiscibili: all\'equilibrio ρ_A·h_A = ρ_B·h_B e il liquido meno denso forma la colonna più alta (principio del manometro). Varia liquido, quantità e densità; grafici di pressione, volume per vaso e bilancio ρ·h.',
    topic: 'fluidi',
    status: 'beta',
    icon: '🚰',
    url: 'labs/communicating-vessels/',
  },
  {
    id: 'torricelli',
    name: 'Esperimento di Torricelli',
    desc: 'Il barometro a mercurio di Torricelli: un tubo chiuso in alto (vuoto torricelliano) capovolto in una bacinella, in cui la colonna di liquido sale finché la pressione atmosferica eguaglia quella della colonna: p₀ = ρ·g·h, da cui h = p₀/(ρg) ≈ 76 cm di mercurio a 1 atm. Varia la pressione atmosferica e il liquido (mercurio, acqua, glicerina, olio) e osserva la colonna, la scala graduata e le frecce di pressione. Grafici h(p₀), altezza per liquido e pressione in funzione della quota.',
    topic: 'fluidi',
    status: 'beta',
    icon: '📏',
    url: 'labs/torricelli/',
  },
  {
    id: 'efflux',
    name: 'Teorema di Torricelli',
    desc: 'Efflusso di un liquido da un foro sulla parete laterale di un recipiente: la velocità di uscita vale v = √(2·g·h), come quella di un grave caduto dall\'altezza h del pelo libero sul foro. Il getto descrive una parabola e la gittata 2·√(h·y) è massima per un foro a metà altezza; due fori simmetrici rispetto al centro arrivano alla stessa distanza. Varia la forma della sezione (rettangolo, trapezio, trapezio rovesciato), la quantità d\'acqua, la posizione e l\'apertura del foro, con rifornimento continuo o svuotamento nel tempo. Modalità confronto con un secondo foro. Grafici v(h), gittata(y) e svuotamento livello(t).',
    topic: 'fluidi',
    status: 'beta',
    icon: '⛲',
    url: 'labs/efflux/',
  },
  {
    id: 'pascal',
    name: 'Principio di Pascal',
    desc: 'La pressione applicata a un fluido confinato si trasmette inalterata in ogni punto e in ogni direzione. Tre apparecchi storici: la sfera forata (l\'acqua spruzza con la stessa intensità da tutti i fori), il martinetto idraulico (p = F₁/A₁ = F₂/A₂, con moltiplicazione della forza F₂ = F₁·A₂/A₁ a spese dello spostamento e conservazione del lavoro), e la botte di Pascal (una colonna d\'acqua alta e sottile genera p = ρ·g·h sufficiente a far scoppiare la botte, indipendentemente dalla poca acqua usata). Varia pressione, numero di fori, forza, raggi dei pistoni, altezza e sezione del tubo, soglia di rottura. Grafici dedicati per ciascuna modalità.',
    topic: 'fluidi',
    status: 'beta',
    icon: '🛢️',
    url: 'labs/pascal/',
  },
  {
    id: 'archimede',
    name: 'Principio di Archimede',
    desc: 'Un corpo immerso in un fluido riceve una spinta verso l\'alto pari al peso del fluido spostato: S = ρ_fluido·g·V_immerso. Confronta peso e spinta con frecce proporzionali e scopri la condizione di galleggiamento: il corpo galleggia se ρ_oggetto < ρ_fluido, immergendosi della frazione ρ_oggetto/ρ_fluido, affonda se è più denso, resta in equilibrio indifferente se uguale. Scegli la forma — cubo, sfera, iceberg (di cui emerge solo la punta) o pallone a pareti elastiche, che la pressione comprime via via che scende in profondità riducendone il volume e la spinta (instabilità del sommozzatore cartesiano). Varia densità e dimensione dell\'oggetto e il fluido (acqua, acqua salata, alcol, olio, glicerina, mercurio: il ferro galleggia sul mercurio!). Rilascia o trascina l\'oggetto per vederlo oscillare e assestarsi. Grafici di spinta/peso, densità a confronto e dinamica.',
    topic: 'fluidi',
    status: 'beta',
    icon: '🛟',
    url: 'labs/archimede/',
  },
];

let activeFilter = 'all';
let searchQuery = '';

function renderFilters() {
  const container = document.getElementById('filters');
  TOPICS.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'filter-pill' + (t.id === activeFilter ? ' active' : '');
    btn.textContent = t.label;
    btn.dataset.filter = t.id;
    btn.addEventListener('click', () => {
      activeFilter = t.id;
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      applyFilter();
    });
    container.appendChild(btn);
  });
}

function makeCard(lab) {
  const card = document.createElement(lab.url ? 'a' : 'div');
  if (lab.url) card.href = lab.url;
  card.className = 'app-card';
  card.dataset.topic = lab.topic;
  card.dataset.status = lab.status;
  const topicLabel = TOPICS.find(t => t.id === lab.topic)?.label || '';
  card.dataset.search = (lab.name + ' ' + lab.desc + ' ' + topicLabel).toLowerCase();

  const statusLabel = { stable: 'Stabile', beta: 'Beta', soon: 'Presto' }[lab.status];
  const statusDot = lab.status !== 'soon' ? `<span class="status-dot"></span>` : '';

  card.innerHTML = `
    <div class="card-top">
      <div class="app-icon"><span class="icon-emoji">${lab.icon}</span></div>
      <div class="card-badges">
        <span class="tag tag-${lab.topic}">${topicLabel}</span>
        <span class="tag tag-${lab.status}">${statusDot}${statusLabel}</span>
      </div>
    </div>
    <div class="app-name">${lab.name}</div>
    <div class="app-desc">${lab.desc}</div>
    <div class="card-footer">
      <span class="app-url">${lab.url ? 'labs/' + lab.id + '/' : '— prossimamente'}</span>
      ${lab.url ? '<span class="card-arrow">→</span>' : ''}
    </div>
  `;
  return card;
}

// Raggruppa le card per argomento (una sezione per topic, nell'ordine di TOPICS)
function renderGroups() {
  const root = document.getElementById('appGroups');
  root.innerHTML = '';
  TOPICS.filter(t => t.id !== 'all').forEach(t => {
    const labs = LABS.filter(l => l.topic === t.id);
    if (!labs.length) return;
    const sec = document.createElement('section');
    sec.className = 'topic-group';
    sec.dataset.topic = t.id;
    const head = document.createElement('div');
    head.className = 'group-head';
    head.innerHTML = `<span class="group-title">${t.label}</span><span class="group-count">${labs.length}</span>`;
    sec.appendChild(head);
    const grid = document.createElement('div');
    grid.className = 'app-grid';
    labs.forEach(lab => grid.appendChild(makeCard(lab)));
    sec.appendChild(grid);
    root.appendChild(sec);
  });
}

function applyFilter() {
  const q = searchQuery.trim().toLowerCase();
  let totalVisible = 0;
  document.querySelectorAll('.topic-group').forEach(group => {
    let visible = 0;
    group.querySelectorAll('.app-card').forEach(card => {
      const topicMatch = activeFilter === 'all' || card.dataset.topic === activeFilter;
      const qMatch = !q || (card.dataset.search || '').includes(q);
      const show = topicMatch && qMatch;
      card.classList.toggle('hidden', !show);
      if (show) visible++;
    });
    group.classList.toggle('hidden', visible === 0);
    totalVisible += visible;
  });

  const root = document.getElementById('appGroups');
  let empty = root.querySelector('.empty-state');
  if (totalVisible === 0) {
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'empty-state';
      root.appendChild(empty);
    }
    empty.textContent = q ? `Nessun esperimento per “${searchQuery.trim()}”.` : 'Nessun esperimento in questa categoria.';
  } else if (empty) {
    empty.remove();
  }
}

function initSearch() {
  const input = document.getElementById('searchInput');
  if (!input) return;
  input.addEventListener('input', () => { searchQuery = input.value; applyFilter(); });
}

function initTheme() {
  const stored = localStorage.getItem('gl-theme') || 'dark';
  document.documentElement.dataset.theme = stored;
  document.getElementById('themeToggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('gl-theme', next);
  });
}

renderFilters();
renderGroups();
initSearch();
initTheme();
