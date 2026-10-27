/* Shared UI component builders for all Galileo Lab simulations */

const Lab = {};

// format(v), facoltativo: testo mostrato al posto di valore + unità (es. scale logaritmiche)
Lab.Slider = function ({ label, min, max, value, step = 1, unit = '', onChange, format }) {
  const group = document.createElement('div');
  group.className = 'ctrl-group';

  const row = document.createElement('div');
  row.className = 'ctrl-label-row';

  const lbl = document.createElement('span');
  lbl.className = 'ctrl-label';
  lbl.textContent = label;

  const val = document.createElement('span');
  val.className = 'ctrl-value';
  const show = v => (format ? format(v) : formatVal(v) + unit);
  val.textContent = show(value);

  row.append(lbl, val);

  const input = document.createElement('input');
  input.type = 'range';
  input.min = min;
  input.max = max;
  input.value = value;
  input.step = step;
  input.className = 'ctrl-slider';

  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    val.textContent = show(v);
    onChange(v);
  });

  group.append(row, input);

  function formatVal(v) {
    return step < 1 ? v.toFixed(String(step).split('.')[1]?.length || 1) : String(Number.isInteger(v) ? v : +v.toFixed(1));
  }

  return {
    el: group,
    setValue(v) {
      input.value = v;
      val.textContent = show(v);
    },
    getValue() { return parseFloat(input.value); },
  };
};

Lab.Toggle = function ({ label, value = false, onChange }) {
  const row = document.createElement('div');
  row.className = 'ctrl-toggle-row';

  const lbl = document.createElement('span');
  lbl.className = 'ctrl-label';
  lbl.textContent = label;

  const btn = document.createElement('button');
  btn.className = 'ctrl-toggle' + (value ? ' active' : '');
  btn.setAttribute('role', 'switch');
  btn.setAttribute('aria-checked', String(value));
  btn.setAttribute('aria-label', label);

  const knob = document.createElement('span');
  knob.className = 'toggle-knob';
  btn.appendChild(knob);

  let state = value;
  btn.addEventListener('click', () => {
    state = !state;
    btn.classList.toggle('active', state);
    btn.setAttribute('aria-checked', String(state));
    onChange(state);
  });

  row.append(lbl, btn);
  return {
    el: row,
    getValue() { return state; },
    setValue(v) {
      state = v;
      btn.classList.toggle('active', v);
      btn.setAttribute('aria-checked', String(v));
    },
  };
};

Lab.RadioGroup = function ({ label, options, value, onChange }) {
  const group = document.createElement('div');
  group.className = 'ctrl-group';

  const lbl = document.createElement('div');
  lbl.className = 'ctrl-label';
  lbl.style.marginBottom = '8px';
  lbl.textContent = label;

  const list = document.createElement('div');
  list.className = 'ctrl-radio-list';

  let currentValue = value;

  options.forEach(opt => {
    const row = document.createElement('label');
    row.className = 'ctrl-radio-row' + (opt.value === value ? ' checked' : '');

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.className = 'ctrl-radio';
    radio.name = 'radio-' + label.replace(/\s/g, '_');
    radio.value = opt.value;
    radio.checked = opt.value === value;

    const dot = document.createElement('span');
    dot.className = 'ctrl-radio-dot';

    const optLbl = document.createElement('span');
    optLbl.className = 'ctrl-radio-label';
    optLbl.textContent = opt.label;

    const hint = document.createElement('span');
    hint.className = 'ctrl-radio-hint';
    hint.textContent = opt.hint || '';

    row.append(radio, dot, optLbl, hint);

    radio.addEventListener('change', () => {
      if (radio.checked) {
        list.querySelectorAll('.ctrl-radio-row').forEach(r => r.classList.remove('checked'));
        row.classList.add('checked');
        currentValue = opt.value;
        onChange(opt.value, opt);
      }
    });

    list.appendChild(row);
  });

  group.append(lbl, list);
  return {
    el: group,
    getValue() { return currentValue; },
    setValue(v) {
      currentValue = v;
      const rows = list.querySelectorAll('.ctrl-radio-row');
      rows.forEach(r => r.classList.remove('checked'));
      const inputs = list.querySelectorAll('input.ctrl-radio');
      inputs.forEach(inp => {
        const on = inp.value === String(v);
        inp.checked = on;
        if (on && inp.closest) inp.closest('.ctrl-radio-row').classList.add('checked');
      });
    },
  };
};

Lab.Section = function (title) {
  const sec = document.createElement('div');
  sec.className = 'panel-section';

  const h = document.createElement('div');
  h.className = 'panel-section-title';
  h.textContent = title;

  sec.appendChild(h);
  return {
    el: sec,
    add(component) {
      sec.appendChild(component.el || component);
      return this;
    },
  };
};

Lab.SubPanel = function () {
  const el = document.createElement('div');
  el.className = 'ctrl-sub';
  return {
    el,
    add(component) { el.appendChild(component.el || component); return this; },
    show() { el.style.display = ''; },
    hide() { el.style.display = 'none'; },
  };
};

Lab.Readout = class {
  constructor(container, fields) {
    this._cells = {};
    fields.forEach(f => {
      const cell = document.createElement('div');
      cell.className = 'readout-cell';

      const lbl = document.createElement('span');
      lbl.className = 'readout-label';
      lbl.textContent = f.label;

      const val = document.createElement('span');
      val.className = 'readout-value';
      val.textContent = '—';

      cell.append(lbl, val);
      container.appendChild(cell);
      this._cells[f.key] = val;
    });
  }

  set(key, value) {
    if (this._cells[key]) this._cells[key].textContent = value;
  }

  reset() {
    Object.values(this._cells).forEach(v => { v.textContent = '—'; });
  }
};

/* Slider + editable number input, synced */
Lab.SliderInput = function ({ label, min, max, value, step = 1, unit = '', hint = '', onChange }) {
  const group = document.createElement('div');
  group.className = 'ctrl-group';

  const labelRow = document.createElement('div');
  labelRow.className = 'ctrl-label-row';

  const lbl = document.createElement('span');
  lbl.className = 'ctrl-label';
  lbl.textContent = label;
  labelRow.appendChild(lbl);

  if (hint) {
    const h = document.createElement('span');
    h.className = 'ctrl-hint';
    h.textContent = hint;
    labelRow.appendChild(h);
  }

  const inputRow = document.createElement('div');
  inputRow.className = 'ctrl-slider-input-row';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = min; slider.max = max; slider.value = value; slider.step = step;
  slider.className = 'ctrl-slider';

  const num = document.createElement('input');
  num.type = 'number';
  num.min = min; num.max = max; num.value = value; num.step = step;
  num.className = 'ctrl-number';
  if (unit) num.title = unit;

  let current = Number(value);

  function fmt(v) {
    const decimals = step < 1 ? String(step).split('.')[1]?.length || 1 : 0;
    return Number(v).toFixed(decimals);
  }

  slider.addEventListener('input', () => {
    current = parseFloat(slider.value);
    num.value = fmt(current);
    onChange(current);
  });

  num.addEventListener('input', () => {
    const v = parseFloat(num.value);
    if (!isNaN(v) && v >= min && v <= max) {
      current = v;
      slider.value = v;
      onChange(current);
    }
  });

  num.addEventListener('change', () => {
    let v = parseFloat(num.value);
    if (isNaN(v)) v = current;
    v = Math.max(min, Math.min(max, v));
    current = v;
    slider.value = v;
    num.value = fmt(v);
    onChange(current);
  });

  inputRow.append(slider, num);
  if (unit) {
    const u = document.createElement('span');
    u.className = 'ctrl-unit';
    u.textContent = unit;
    inputRow.appendChild(u);
  }

  group.append(labelRow, inputRow);

  return {
    el: group,
    getValue() { return current; },
    setValue(v) {
      current = v;
      slider.value = v;
      num.value = fmt(v);
    },
  };
};

Lab.initTheme = function (toggleBtnId = 'themeToggle') {
  const stored = localStorage.getItem('gl-theme') || 'dark';
  document.documentElement.dataset.theme = stored;
  const btn = document.getElementById(toggleBtnId);
  if (btn) {
    btn.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      localStorage.setItem('gl-theme', next);
    });
  }
};

/* ── Numeri all'italiana ───────────────────────────────────────────────────
   Lab.fmt(1.5, 2) → "1,50"
   Lab.sci(2.21e-4, 3) → "2,21·10⁻⁴"   (notazione scientifica solo fuori da 10⁻³…10⁵) */
Lab.fmt = function (v, d = 1) {
  if (!Number.isFinite(v)) return v > 0 ? '∞' : v < 0 ? '−∞' : '—';
  const s = v.toFixed(d);
  return (Number(s) === 0 ? s.replace('-', '') : s.replace('-', '−')).replace('.', ',');
};
Lab.sci = function (v, sig = 3) {
  if (!Number.isFinite(v)) return Lab.fmt(v);
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e-3 && a < 1e5) {
    const d = Math.max(0, sig - 1 - Math.floor(Math.log10(a)));
    return Lab.fmt(v, d);
  }
  let e = Math.floor(Math.log10(a)), m = v / 10 ** e;
  if (Math.abs(Number(m.toFixed(sig - 1))) >= 10) { m /= 10; e += 1; }
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  return Lab.fmt(m, sig - 1) + '·10' + String(e).split('').map(c => SUP[c]).join('');
};

/* ── Canvas ad alta risoluzione ─────────────────────────────────────────────
   Dimensiona il canvas sui pixel reali dello schermo; chi disegna lavora in pixel CSS. */
Lab.hidpi = function (canvas, cssW, cssH) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(cssW * dpr));
  canvas.height = Math.max(1, Math.round(cssH * dpr));
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas._dpr = dpr;
  return { W: cssW, H: cssH, dpr };
};
// contesto già scalato per disegnare in pixel CSS: restituisce [ctx, W, H]
Lab.ctx2d = function (canvas) {
  const ctx = canvas.getContext('2d'), dpr = canvas._dpr || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return [ctx, canvas.width / dpr, canvas.height / dpr];
};

/* ── Assi dei grafici ───────────────────────────────────────────────────────
   Tacche con valori "tondi", griglia leggera, etichette numeriche. Gli intervalli si passano
   fissi: un asse che si riscala da solo nasconde l'effetto dei parametri che si stanno variando. */
Lab.niceStep = function (span, n = 4) {
  const raw = Math.abs(span) / n, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p;
  return (m < 1.5 ? 1 : m < 3 ? 2 : m < 3.5 ? 2.5 : m < 7.5 ? 5 : 10) * p;
};
Lab.niceMax = function (v) {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v)), m = v / p;
  return (m <= 1 ? 1 : m <= 1.2 ? 1.2 : m <= 1.5 ? 1.5 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 3 ? 3 : m <= 4 ? 4 : m <= 5 ? 5 : m <= 6 ? 6 : m <= 8 ? 8 : 10) * p;
};
Lab.graphColors = function () {
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const light = document.documentElement.dataset.theme === 'light';
  return {
    bg: css('--bg2') || '#0b1018', text: css('--text-secondary') || '#6b8099', title: css('--text-primary') || '#ddeeff',
    grid: light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.07)', axis: light ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.3)',
    accent: css('--accent') || '#00d4ff', amber: css('--accent-amber') || '#ffb400', red: css('--accent-red') || '#ff4757',
    green: css('--accent-green') || '#2ecc71', blue: css('--accent-blue') || '#4d9fff', violet: css('--accent-violet') || '#8b7fff',
    light,
  };
};
/* Lab.axes(ctx, { x, y, w, h, xr:[a,b], yr:[a,b], title, xLabel, xStep, yStep, xFmt, yFmt, xLog, yLog })
   Disegna sfondo, griglia ed etichette; restituisce { X, Y, L, R, T, B, C } per tracciare le curve. */
Lab.axes = function (ctx, o) {
  const C = Lab.graphColors();
  // decimali sufficienti a scrivere esattamente il passo (2,5 → 1 decimale; 0,05 → 2)
  const fmtFor = step => { let d = 0; while (d < 6 && Math.abs(Math.round(step * 10 ** d) - step * 10 ** d) > 1e-6) d++; return v => Lab.fmt(v, d); };
  const { x, y, w, h } = o;
  if (o.bg !== false) { ctx.fillStyle = C.bg; ctx.fillRect(x, y, w, h); }
  const L = x + (o.padL ?? 46), R = x + w - (o.padR ?? 10), T = y + (o.title ? 24 : 10), B = y + h - (o.xLabel ? 30 : 20);
  const [x0, x1] = o.xr, [y0, y1] = o.yr;
  const tx = v => o.xLog ? Math.log10(v) : v, ty = v => o.yLog ? Math.log10(v) : v;
  const X = v => L + (tx(v) - tx(x0)) / (tx(x1) - tx(x0)) * (R - L);
  const Y = v => B - (ty(v) - ty(y0)) / (ty(y1) - ty(y0)) * (B - T);
  const ticks = (a, b, log, step) => {
    const out = [];
    if (log) { for (let e = Math.ceil(Math.log10(a) - 1e-9); e <= Math.log10(b) + 1e-9; e++) out.push(10 ** e); }
    else for (let v = Math.ceil(a / step - 1e-9) * step; v <= b + step * 1e-6; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return out;
  };
  ctx.save();
  ctx.lineWidth = 1; ctx.textBaseline = 'middle'; ctx.setLineDash([]);
  const ys = o.yStep || Lab.niceStep(y1 - y0), yFmt = o.yFmt || (o.yLog ? (v => Lab.sci(v, 1)) : fmtFor(ys));
  ctx.font = '9px "Space Mono", monospace'; ctx.textAlign = 'right';
  // su scala log, se le decadi sono fitte si etichetta una tacca ogni due (o più)
  const every = (n, px) => Math.max(1, Math.ceil(px / Math.max(1, n)));
  const yT = ticks(y0, y1, o.yLog, ys), yEvery = o.yLog ? every((B - T) / Math.max(1, yT.length - 1), 14) : 1;
  yT.forEach((v, i) => {
    const py = Y(v);
    ctx.strokeStyle = v === 0 && !o.yLog ? C.axis : C.grid;
    ctx.beginPath(); ctx.moveTo(L, py); ctx.lineTo(R, py); ctx.stroke();
    if ((yT.length - 1 - i) % yEvery === 0) { ctx.fillStyle = C.text; ctx.fillText(yFmt(v), L - 5, py); }
  });
  const xs = o.xStep || Lab.niceStep(x1 - x0, 5), xFmt = o.xFmt || (o.xLog ? (v => Lab.sci(v, 1)) : fmtFor(xs));
  ctx.textAlign = 'center';
  const xT = ticks(x0, x1, o.xLog, xs);
  ctx.font = '9px "Space Mono", monospace';
  const xW = Math.max(...xT.map(v => ctx.measureText(xFmt(v)).width)) + 8;
  const xEvery = every((R - L) / Math.max(1, xT.length - 1), xW);
  xT.forEach((v, i) => {
    const px = X(v);
    ctx.strokeStyle = v === 0 && !o.xLog ? C.axis : C.grid;
    ctx.beginPath(); ctx.moveTo(px, T); ctx.lineTo(px, B); ctx.stroke();
    if (i % xEvery === 0) { ctx.fillStyle = C.text; ctx.fillText(xFmt(v), px, B + 10); }
  });
  ctx.strokeStyle = C.axis;
  ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, B); ctx.lineTo(R, B); ctx.stroke();
  ctx.font = '10.5px "DM Sans", sans-serif'; ctx.fillStyle = C.text;
  if (o.title) { ctx.textAlign = 'left'; ctx.fillText(o.title, x + 8, y + 11); }
  if (o.xLabel) { ctx.textAlign = 'right'; ctx.fillText(o.xLabel, R, B + 22); }
  ctx.restore();
  return { X, Y, L, R, T, B, C };
};
// curva y = fn(x) dentro un riquadro di Lab.axes (si interrompe dove fn non è finita)
Lab.plot = function (ctx, f, fn, xr, color, width = 1.8, dash = [], n = 300) {
  ctx.save();
  ctx.beginPath(); ctx.rect(f.L, f.T - 1, f.R - f.L, f.B - f.T + 2); ctx.clip();
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.lineJoin = 'round';
  ctx.beginPath();
  let pen = false;
  for (let i = 0; i <= n; i++) {
    const xv = xr[0] + (xr[1] - xr[0]) * i / n, yv = fn(xv);
    if (!Number.isFinite(yv)) { pen = false; continue; }
    const px = f.X(xv), py = f.Y(yv);
    pen ? ctx.lineTo(px, py) : ctx.moveTo(px, py); pen = true;
  }
  ctx.stroke(); ctx.restore();
};
// serie di punti [x, y] (storia temporale, dati discreti)
Lab.plotPts = function (ctx, f, pts, color, width = 1.8) {
  ctx.save();
  ctx.beginPath(); ctx.rect(f.L, f.T - 1, f.R - f.L, f.B - f.T + 2); ctx.clip();
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach(([xv, yv], i) => { const px = f.X(xv), py = f.Y(yv); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
  ctx.stroke(); ctx.restore();
};
// punto evidenziato
Lab.dot = function (ctx, f, xv, yv, color, r = 3.5) {
  const px = f.X(xv), py = f.Y(yv);
  if (!(px >= f.L - 1 && px <= f.R + 1 && py >= f.T - 1 && py <= f.B + 1)) return;
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(px, py, r, 0, 2 * Math.PI); ctx.fill();
};
// legenda in riga: [[colore, testo, tratteggio?], ...]
Lab.legend = function (ctx, x, y, items) {
  const C = Lab.graphColors();
  ctx.save();
  ctx.font = '9.5px "DM Sans", sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  // fondo semitrasparente: la legenda resta leggibile anche sopra le curve
  const wTot = items.reduce((acc, it) => acc + 28 + ctx.measureText(it[1]).width, 0) - 10;
  ctx.globalAlpha = 0.82; ctx.fillStyle = C.bg;
  ctx.fillRect(x - 4, y - 7, wTot + 8, 14);
  ctx.globalAlpha = 1;
  let cx = x;
  for (const [col, lbl, dash] of items) {
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash(dash || []);
    ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx + 14, y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = C.text; ctx.fillText(lbl, cx + 18, y);
    cx += 28 + ctx.measureText(lbl).width;
  }
  ctx.restore();
};

/* Riga di grafici affiancati nell'area grafici: restituisce i canvas (da dimensionare con Lab.hidpi). */
Lab.graphPanels = function (area, n, height = 170) {
  area.innerHTML = '';
  area.classList.add('g-row');
  area.style.display = '';
  area.style.height = height + 'px';
  const out = [];
  for (let i = 0; i < n; i++) {
    const panel = document.createElement('div');
    panel.className = 'g-panel';
    const cv = document.createElement('canvas');
    panel.appendChild(cv); area.appendChild(panel); out.push(cv);
  }
  return out;
};
// ridimensiona tutti i canvas di Lab.graphPanels sui loro riquadri
Lab.fitPanels = function (canvases) {
  for (const cv of canvases) if (cv) Lab.hidpi(cv, cv.parentElement.clientWidth, cv.parentElement.clientHeight);
};
// riquadro completo su un canvas: assi occupano tutto il canvas; restituisce [ctx, f] oppure null
Lab.panel = function (canvas, o) {
  if (!canvas || !canvas.width || !canvas._dpr) return null;
  const [ctx, W, H] = Lab.ctx2d(canvas);
  return [ctx, Lab.axes(ctx, { x: 0, y: 0, w: W, h: H, ...o })];
};

// prefissi SI per etichette compatte: Lab.eng(1e5, 'Hz') → "100 kHz", Lab.eng(1e-6, 'm') → "1 µm"
Lab.eng = function (v, unit = '', d = 0) {
  if (v === 0) return '0' + (unit ? ' ' + unit : '');
  const P = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
  const a = Math.abs(v);
  const [m, s] = P.find(([m]) => a >= m * 0.9995) || P[P.length - 1];
  return Lab.fmt(v / m, d) + (unit || s ? ' ' + s + unit : '');
};

/* Elenco di oggetti (fili, cariche…) con pulsante per rimuoverli e pulsanti per aggiungerne.
   items: array; text(item,i) e color(item,i) per l'etichetta; onRemove(i); add: [{label, color, onClick}] */
Lab.ItemList = function ({ items, text, color, onRemove, add = [], max = Infinity }) {
  const el = document.createElement('div');
  el.className = 'item-list';
  items.forEach((it, i) => {
    const row = document.createElement('div');
    row.className = 'item-row';
    const lbl = document.createElement('span');
    lbl.className = 'item-label';
    lbl.textContent = text(it, i);
    if (color) lbl.style.color = color(it, i);
    const rm = document.createElement('button');
    rm.className = 'btn-remove-scenario';
    rm.title = 'Rimuovi';
    rm.textContent = '×';
    rm.onclick = () => onRemove(i);
    row.append(lbl, rm);
    el.appendChild(row);
  });
  if (items.length < max && add.length) {
    const bar = document.createElement('div');
    bar.className = 'item-add';
    for (const a of add) {
      const b = document.createElement('button');
      b.className = 'ctrl-btn';
      b.textContent = a.label;
      if (a.color) b.style.color = a.color;
      b.onclick = a.onClick;
      bar.appendChild(b);
    }
    el.appendChild(bar);
  }
  return { el };
};
