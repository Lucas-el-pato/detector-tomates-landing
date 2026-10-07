// Results charts — hand-built SVG, re-rendered at the container's real width.
// All data here is SYNTHETIC demonstration data (seeded), to be replaced.
import { rngFrom, CLASS_UI, CLASS_LABEL } from './plant.js';

const NS = 'http://www.w3.org/2000/svg';
const ENAMEL = '#1d3aa6', INK = '#0f1730', SURFACE = '#ffffff';
const fmt = (n, d = 2) => n.toLocaleString('es-PY', { minimumFractionDigits: d, maximumFractionDigits: d });
const rng = rngFrom(77);
const noise = (a) => (rng() - 0.5) * 2 * a;
const gauss = () => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// ---------- synthetic data ----------
const EPOCHS = 100;
const train = [], val = [], map = [];
for (let e = 1; e <= EPOCHS; e++) {
  train.push([e, 1.55 * Math.exp(-e / 17) + 0.52 + noise(0.025) * Math.exp(-e / 60)]);
  val.push([e, 1.62 * Math.exp(-e / 15) + 0.66 + (e > 72 ? (e - 72) * 0.0016 : 0) + noise(0.03) * Math.exp(-e / 80)]);
  map.push([e, Math.min(0.9, 0.886 * (1 - Math.exp(-e / 13)) + noise(0.012) - (e > 75 ? (e - 75) * 0.0004 : 0))]);
}
map[71][1] = 0.891; // best checkpoint
const best = map.reduce((a, b) => (b[1] > a[1] ? b : a));

const perClass = [
  { metric: 'Precisión', v: { verde: 0.95, pinton: 0.86, maduro: 0.95 } },
  { metric: 'Exhaustividad', v: { verde: 0.86, pinton: 0.75, maduro: 0.92 } },
  { metric: 'AP@0,5', v: { verde: 0.9, pinton: 0.81, maduro: 0.96 } },
];

const F = 922, B = 0.12, DD = 2;
const theory = [];
for (let z = 0.3; z <= 1.701; z += 0.02) theory.push([z, ((z * z) / (F * B)) * DD * 100]);
const measured = [];
for (let i = 0; i < 60; i++) {
  const z = 0.35 + rng() * 1.25;
  measured.push([z, Math.abs(gauss()) * ((z * z) / (F * B)) * DD * 100 * 0.95 + rng() * 0.15]);
}

// ---------- helpers ----------
function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
const scale = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
function ticks(min, max, n) {
  const step = (max - min) / n;
  return Array.from({ length: n + 1 }, (_, i) => min + i * step);
}
function tipFor(host) {
  let t = host.querySelector('.tip');
  if (!t) { t = document.createElement('div'); t.className = 'tip'; host.appendChild(t); }
  return t;
}
function legend(host, items) {
  const row = document.createElement('div');
  row.className = 'legend-row';
  for (const it of items) {
    const k = document.createElement('span');
    k.className = 'key';
    k.innerHTML = `<svg viewBox="0 0 26 10"><line x1="1" y1="5" x2="25" y2="5" stroke="${it.color}" stroke-width="2.5" ${it.dash ? 'stroke-dasharray="5 4"' : ''} stroke-linecap="round"/></svg>${it.name}`;
    row.appendChild(k);
  }
  host.appendChild(row);
}

function frame(host, { height, xd, yd, xt, yt, xfmt, yfmt, xlab, ylab }) {
  const w = host.clientWidth;
  const m = { t: 30, r: 16, b: 40, l: 52 };
  const svg = el('svg', { viewBox: `0 0 ${w} ${height}`, width: w, height });
  const x = scale(xd[0], xd[1], m.l, w - m.r);
  const y = scale(yd[0], yd[1], height - m.b, m.t);
  const gGrid = el('g', { class: 'grid' }, svg);
  const gAx = el('g', { class: 'axis' }, svg);
  for (const v of yt) {
    el('line', { x1: m.l, x2: w - m.r, y1: y(v), y2: y(v) }, gGrid);
    el('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, gAx).textContent = yfmt(v);
  }
  for (const v of xt) el('text', { x: x(v), y: height - m.b + 18, 'text-anchor': 'middle' }, gAx).textContent = xfmt(v);
  el('line', { class: 'baseline', x1: m.l, x2: w - m.r, y1: height - m.b, y2: height - m.b }, svg);
  el('text', { class: 'lbl', x: w - m.r, y: height - 4, 'text-anchor': 'end' }, svg).textContent = xlab;
  el('text', { class: 'lbl', x: 0, y: 12, 'text-anchor': 'start' }, svg).textContent = `↑ ${ylab}`;
  return { svg, x, y, m, w, height };
}
const path = (pts, x, y) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join('');

function crosshair(host, f, series, label) {
  const tip = tipFor(host);
  const guide = el('line', { y1: f.m.t, y2: f.height - f.m.b, stroke: INK, 'stroke-opacity': 0.25, visibility: 'hidden' }, f.svg);
  const dots = series.map((s) => el('circle', { r: 4.5, fill: s.color, stroke: SURFACE, 'stroke-width': 2, visibility: 'hidden' }, f.svg));
  const hit = el('rect', { x: f.m.l, y: f.m.t, width: f.w - f.m.l - f.m.r, height: f.height - f.m.t - f.m.b, fill: 'transparent' }, f.svg);
  const move = (ev) => {
    const r = f.svg.getBoundingClientRect();
    const px = ev.clientX - r.left;
    const n = series[0].values.length;
    const xs = series[0].values;
    let i = 0, bestD = Infinity;
    for (let k = 0; k < n; k++) { const d = Math.abs(f.x(xs[k][0]) - px); if (d < bestD) { bestD = d; i = k; } }
    const X = f.x(xs[i][0]);
    guide.setAttribute('x1', X); guide.setAttribute('x2', X); guide.setAttribute('visibility', 'visible');
    series.forEach((s, j) => { dots[j].setAttribute('cx', X); dots[j].setAttribute('cy', f.y(s.values[i][1])); dots[j].setAttribute('visibility', 'visible'); });
    tip.innerHTML = label(i);
    tip.style.left = `${X}px`;
    tip.style.top = `${Math.min(...series.map((s) => f.y(s.values[i][1]))) + host.querySelector('svg').offsetTop}px`;
    tip.classList.add('on');
  };
  const leave = () => { guide.setAttribute('visibility', 'hidden'); dots.forEach((d) => d.setAttribute('visibility', 'hidden')); tip.classList.remove('on'); };
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerleave', leave);
}

// ---------- charts ----------
function lossChart(host) {
  host.replaceChildren();
  const series = [
    { name: 'Entrenamiento', color: ENAMEL, values: train },
    { name: 'Validación', color: INK, dash: true, values: val },
  ];
  legend(host, series);
  const f = frame(host, {
    height: host.clientWidth < 500 ? 240 : 280, xd: [1, EPOCHS], yd: [0.4, 2.2],
    xt: [1, 20, 40, 60, 80, 100], yt: ticks(0.4, 2.2, 4), xfmt: (v) => v, yfmt: (v) => fmt(v, 1), xlab: 'época', ylab: 'pérdida de caja',
  });
  for (const s of series) el('path', { d: path(s.values, f.x, f.y), fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-dasharray': s.dash ? '6 5' : 'none', 'stroke-linejoin': 'round' }, f.svg);
  el('line', { x1: f.x(72), x2: f.x(72), y1: f.m.t, y2: f.height - f.m.b, stroke: '#f5c518', 'stroke-width': 2 }, f.svg);
  el('text', { class: 'dlabel', x: f.x(72) - 6, y: f.m.t + 12, 'text-anchor': 'end' }, f.svg).textContent = 'checkpoint elegido';
  host.appendChild(f.svg);
  crosshair(host, f, series, (i) => `<b>Época ${train[i][0]}</b><br>entrenamiento ${fmt(train[i][1], 3)}<br>validación ${fmt(val[i][1], 3)}`);
}

function mapChart(host) {
  host.replaceChildren();
  const s = { name: 'mAP@0,5', color: ENAMEL, values: map };
  const f = frame(host, {
    height: 240, xd: [1, EPOCHS], yd: [0, 1], xt: [1, 25, 50, 75, 100], yt: ticks(0, 1, 4),
    xfmt: (v) => v, yfmt: (v) => fmt(v, 2), xlab: 'época', ylab: 'mAP@0,5',
  });
  el('path', { d: path(map, f.x, f.y), fill: 'none', stroke: ENAMEL, 'stroke-width': 2, 'stroke-linejoin': 'round' }, f.svg);
  el('circle', { cx: f.x(best[0]), cy: f.y(best[1]), r: 6, fill: '#f5c518', stroke: INK, 'stroke-width': 2 }, f.svg);
  el('text', { class: 'dlabel', x: f.x(best[0]), y: f.y(best[1]) + 24, 'text-anchor': 'middle' }, f.svg).textContent = `mejor: ${fmt(best[1], 3)}`;
  host.appendChild(f.svg);
  crosshair(host, f, [s], (i) => `<b>Época ${map[i][0]}</b><br>mAP@0,5 ${fmt(map[i][1], 3)}`);
}

function classChart(host) {
  host.replaceChildren();
  const w = host.clientWidth;
  const classes = ['verde', 'pinton', 'maduro'];
  const rowH = 18, gap = 4, groupGap = 22, top = 4;
  const labelW = 104, valW = 44;
  const height = top + perClass.length * (classes.length * (rowH + gap) + groupGap);
  const svg = el('svg', { viewBox: `0 0 ${w} ${height}`, width: w, height });
  const x = scale(0, 1, labelW, w - valW);
  const tip = tipFor(host);
  let yy = top;
  perClass.forEach((g) => {
    el('text', { class: 'dlabel', x: 0, y: yy + rowH - 4 }, svg).textContent = g.metric;
    classes.forEach((c, i) => {
      const y0 = yy + i * (rowH + gap);
      const v = g.v[c];
      el('rect', { x: labelW, y: y0, width: x(1) - labelW, height: rowH, fill: '#eef1f4', rx: 2 }, svg);
      const bar = el('rect', { x: labelW, y: y0, width: x(v) - labelW, height: rowH, fill: CLASS_UI[c], rx: 3 }, svg);
      el('text', { class: 'lbl', x: labelW - 8, y: y0 + rowH - 5, 'text-anchor': 'end', style: 'fill:#47526d' }, svg).textContent = CLASS_LABEL[c];
      el('text', { class: 'lbl', x: x(v) + 8, y: y0 + rowH - 5, style: 'fill:#0f1730' }, svg).textContent = fmt(v, 2);
      const hit = el('rect', { x: 0, y: y0 - gap / 2, width: w, height: rowH + gap, fill: 'transparent' }, svg);
      hit.addEventListener('pointermove', () => {
        tip.innerHTML = `<b>${CLASS_LABEL[c]}</b> · ${g.metric}<br>${fmt(v, 3)}`;
        tip.style.left = `${x(v)}px`; tip.style.top = `${y0 + host.querySelector('svg').offsetTop}px`;
        tip.classList.add('on'); bar.setAttribute('opacity', 0.85);
      });
      hit.addEventListener('pointerleave', () => { tip.classList.remove('on'); bar.removeAttribute('opacity'); });
    });
    yy += classes.length * (rowH + gap) + groupGap;
  });
  host.appendChild(svg);
}

function depthChart(host) {
  host.replaceChildren();
  legend(host, [{ name: 'Teórico (±2 px)', color: ENAMEL }, { name: 'Medido', color: INK }]);
  host.querySelector('.legend-row .key:last-child svg').outerHTML = `<svg viewBox="0 0 26 10"><circle cx="13" cy="5" r="4" fill="${INK}"/></svg>`;
  const f = frame(host, {
    height: host.clientWidth < 500 ? 240 : 280, xd: [0.3, 1.7], yd: [0, 6], xt: [0.3, 0.6, 0.9, 1.2, 1.5], yt: ticks(0, 6, 3),
    xfmt: (v) => `${fmt(v, 1)} m`, yfmt: (v) => `${v} cm`, xlab: 'distancia al tomate', ylab: 'error absoluto',
  });
  // the working range of the arm
  el('rect', { x: f.x(0.4), y: f.m.t, width: f.x(1.0) - f.x(0.4), height: f.height - f.m.t - f.m.b, fill: '#f5c518', 'fill-opacity': 0.14 }, f.svg);
  el('text', { class: 'dlabel', x: f.x(0.7), y: f.m.t + 14, 'text-anchor': 'middle' }, f.svg).textContent = 'alcance del brazo';
  el('path', { d: path(theory, f.x, f.y), fill: 'none', stroke: ENAMEL, 'stroke-width': 2 }, f.svg);
  const tip = tipFor(host);
  for (const [z, e] of measured) {
    const c = el('circle', { cx: f.x(z), cy: f.y(e), r: 4, fill: INK, stroke: SURFACE, 'stroke-width': 2 }, f.svg);
    const hit = el('circle', { cx: f.x(z), cy: f.y(e), r: 10, fill: 'transparent' }, f.svg);
    hit.addEventListener('pointerenter', () => {
      c.setAttribute('r', 6);
      tip.innerHTML = `<b>Tomate a ${fmt(z, 2)} m</b><br>error ${fmt(e, 2)} cm<br>teórico ${fmt(((z * z) / (F * B)) * DD * 100, 2)} cm`;
      tip.style.left = `${f.x(z)}px`; tip.style.top = `${f.y(e) + host.querySelector('svg').offsetTop}px`;
      tip.classList.add('on');
    });
    hit.addEventListener('pointerleave', () => { c.setAttribute('r', 4); tip.classList.remove('on'); });
  }
  host.appendChild(f.svg);
}

const charts = [
  [document.getElementById('chart-loss'), lossChart],
  [document.getElementById('chart-map'), mapChart],
  [document.getElementById('chart-class'), classChart],
  [document.getElementById('chart-depth'), depthChart],
];
for (const [host, draw] of charts) {
  let lastW = 0;
  new ResizeObserver(() => { const w = host.clientWidth; if (Math.abs(w - lastW) > 2) { lastW = w; draw(host); } }).observe(host);
}
