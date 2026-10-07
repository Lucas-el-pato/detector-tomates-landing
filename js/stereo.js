// Interactive top view of a rectified stereo pair. Real formula, no fake data:
// d = f·B / Z, and depth uncertainty ΔZ ≈ Z² / (f·B) · Δd.
const svg = document.getElementById('stereo-svg');
const inZ = document.getElementById('in-z');
const inB = document.getElementById('in-b');
const outZ = document.getElementById('out-z');
const outB = document.getElementById('out-b');
const calcD = document.getElementById('calc-d');
const calcErr = document.getElementById('calc-err');

const F = 922;          // px, same sensor model as the hero rig
const DD = 0.5;         // px of disparity error
const NS = 'http://www.w3.org/2000/svg';
const CX = 320, CAM_Y = 352, PLANE = 34, ZS = 135, BS = 1100; // px per metre (depth, baseline)
const fmt = (n, d = 2) => n.toLocaleString('es-PY', { minimumFractionDigits: d, maximumFractionDigits: d });

function el(tag, attrs = {}, parent = svg) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  parent.appendChild(e);
  return e;
}

// static furniture
const defs = el('defs');
const pat = el('pattern', { id: 'grid', width: 20, height: 20, patternUnits: 'userSpaceOnUse' }, defs);
el('path', { d: 'M20 0H0V20', fill: 'none', stroke: 'rgba(195,207,245,0.10)', 'stroke-width': 1 }, pat);
el('rect', { x: 0, y: 0, width: 640, height: 420, fill: 'url(#grid)' });

const g = el('g');
const T = { fill: '#c3cff5', 'font-family': 'Martian Mono, monospace', 'font-size': 11 };

function draw() {
  const Z = inZ.value / 100, B = inB.value / 100;
  const p = (i) => ((i.value - i.min) / (i.max - i.min)) * 100 + '%';
  inZ.style.setProperty('--p', p(inZ));
  inB.style.setProperty('--p', p(inB));
  outZ.value = `${fmt(Z)} m`;
  outB.value = `${inB.value} cm`;
  const d = (F * B) / Z;
  const err = (Z * Z) / (F * B) * DD;
  calcD.textContent = `${fmt(d, 1)} px`;
  calcErr.textContent = `± ${fmt(err * 100, 1)} cm`;

  g.replaceChildren();
  const xL = CX - (B * BS) / 2, xR = CX + (B * BS) / 2;
  const px = CX - 24, py = CAM_Y - Z * ZS;

  // depth uncertainty band (to scale)
  const band = Math.max(2, err * ZS);
  el('rect', { x: px - 60, y: py - band, width: 120, height: band * 2, fill: 'rgba(245,197,24,0.18)', stroke: 'rgba(245,197,24,0.5)', 'stroke-dasharray': '3 3' }, g);

  // rays
  el('line', { x1: xL, y1: CAM_Y, x2: px, y2: py, stroke: '#ffffff', 'stroke-width': 1.5 }, g);
  el('line', { x1: xR, y1: CAM_Y, x2: px, y2: py, stroke: '#f5c518', 'stroke-width': 1.5 }, g);

  // image planes and projections
  const planeY = CAM_Y - PLANE;
  const proj = (xc) => xc + ((px - xc) * PLANE) / (CAM_Y - py);
  for (const [xc, col, name] of [[xL, '#ffffff', 'IZQ'], [xR, '#f5c518', 'DER']]) {
    el('line', { x1: xc - 46, y1: planeY, x2: xc + 46, y2: planeY, stroke: 'rgba(195,207,245,0.6)', 'stroke-width': 2 }, g);
    el('line', { x1: xc, y1: planeY - 5, x2: xc, y2: planeY + 5, stroke: 'rgba(195,207,245,0.6)' }, g);
    el('circle', { cx: proj(xc), cy: planeY, r: 4, fill: col }, g);
    el('path', { d: `M${xc - 16} ${CAM_Y + 18}h32v-18l-8 -8h-16l-8 8z`, fill: '#0f1730', stroke: col, 'stroke-width': 1.5 }, g);
    el('circle', { cx: xc, cy: CAM_Y, r: 3, fill: col }, g);
    el('text', { ...T, x: xc, y: CAM_Y + 36, 'text-anchor': 'middle', fill: col }, g).textContent = name;
  }

  // baseline dimension
  const by = CAM_Y + 52;
  el('line', { x1: xL, y1: by, x2: xR, y2: by, stroke: '#c3cff5' }, g);
  el('line', { x1: xL, y1: by - 5, x2: xL, y2: by + 5, stroke: '#c3cff5' }, g);
  el('line', { x1: xR, y1: by - 5, x2: xR, y2: by + 5, stroke: '#c3cff5' }, g);
  el('text', { ...T, x: CX, y: by + 4, 'text-anchor': 'middle', fill: '#fff', 'paint-order': 'stroke', stroke: '#152c80', 'stroke-width': 6 }, g).textContent = `B = ${inB.value} cm`;

  // depth dimension
  const zx = 560;
  el('line', { x1: zx, y1: CAM_Y, x2: zx, y2: py, stroke: '#c3cff5' }, g);
  el('line', { x1: zx - 5, y1: CAM_Y, x2: zx + 5, y2: CAM_Y, stroke: '#c3cff5' }, g);
  el('line', { x1: zx - 5, y1: py, x2: zx + 5, y2: py, stroke: '#c3cff5' }, g);
  el('line', { x1: px + 20, y1: py, x2: zx - 8, y2: py, stroke: 'rgba(195,207,245,0.35)', 'stroke-dasharray': '2 4' }, g);
  el('text', { ...T, x: zx + 10, y: (CAM_Y + py) / 2 + 4, fill: '#fff' }, g).textContent = `Z = ${fmt(Z)} m`;

  // tomato
  el('circle', { cx: px, cy: py, r: 13, fill: '#c92a1c' }, g);
  el('circle', { cx: px - 4, cy: py - 4, r: 4, fill: 'rgba(255,255,255,0.35)' }, g);
  el('path', { d: `M${px} ${py - 13}l-6 -5M${px} ${py - 13}l6 -5M${px} ${py - 13}v-7`, stroke: '#5f9a3a', 'stroke-width': 2.5, 'stroke-linecap': 'round' }, g);

  // superimposed sensor strip showing the disparity
  const sy = 26, sx0 = 40, sw = 220;
  el('text', { ...T, x: sx0, y: sy - 8 }, g).textContent = 'Ambas imágenes superpuestas';
  el('rect', { x: sx0, y: sy, width: sw, height: 26, fill: '#0f1730', stroke: 'rgba(195,207,245,0.3)' }, g);
  const toStrip = (u) => sx0 + sw / 2 + Math.max(-1, Math.min(1, u / 640)) * (sw / 2); // u: px offset from image centre
  // horizontal pixel positions relative to each optical centre (metres → px)
  const X = ((px - CX) / BS); // tomato lateral offset in metres from rig centre
  const pL = (F * (X + B / 2)) / Z, pR = (F * (X - B / 2)) / Z;
  const aL = toStrip(pL), aR = toStrip(pR);
  el('line', { x1: aL, y1: sy + 3, x2: aL, y2: sy + 23, stroke: '#fff', 'stroke-width': 2 }, g);
  el('line', { x1: aR, y1: sy + 3, x2: aR, y2: sy + 23, stroke: '#f5c518', 'stroke-width': 2 }, g);
  const lo = Math.min(aL, aR), hi = Math.max(aL, aR);
  el('path', { d: `M${lo} ${sy + 34}v4h${hi - lo}v-4`, fill: 'none', stroke: '#f5c518' }, g);
  el('text', { ...T, x: (lo + hi) / 2, y: sy + 52, 'text-anchor': 'middle', fill: '#f5c518' }, g).textContent = `d = ${fmt(d, 1)} px`;
}

inZ.addEventListener('input', draw);
inB.addEventListener('input', draw);
draw();
