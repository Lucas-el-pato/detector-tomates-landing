// Threshold lab: the detector's candidates (real tomatoes + leaves it
// mistakes for fruit) filtered by a confidence threshold. Every accepted
// candidate is matched across the stereo pair and triangulated to X, Y, Z.
// Scene and confidences are synthetic; the projection/triangulation is real.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildPlant, rngFrom, CLASS_UI, CLASS_LABEL } from './plant.js';
import { SENSOR_W, SENSOR_H, VFOV, BASE, toPx, triangulate, cm } from './stereo-math.js';

const canvas = document.getElementById('thr-canvas');
const tip = document.getElementById('thr-tip');
const input = document.getElementById('thr-in');
const output = document.getElementById('thr-out');
const playBtn = document.getElementById('thr-play');
const bestBtn = document.getElementById('thr-best');
const prSvg = document.getElementById('thr-pr');
const tbody = document.querySelector('#thr-table tbody');
const M = Object.fromEntries(['acc', 'tp', 'fp', 'fn', 'pr', 'f1'].map((k) => [k, document.getElementById(`m-${k}`)]));
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = (n, d = 2) => n.toLocaleString('es-PY', { minimumFractionDigits: d, maximumFractionDigits: d });

// ---------- scene ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight('#e6ecff', '#20307a', 1.6));
const sun = new THREE.DirectionalLight('#fff1dc', 2.4); sun.position.set(2, 4, 3); scene.add(sun);

const camera = new THREE.PerspectiveCamera(38, 4 / 3, 0.02, 20);
camera.position.set(1.0, 1.45, 1.8);

const grid = new THREE.GridHelper(4, 40, '#4a66d6', '#2f4cc0');
scene.add(grid);
const bed = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: '#3a2e2a', roughness: 1 }));
bed.position.y = 0.04; scene.add(bed);

const RIG_Y = 1.02, RIG_Z = 0.92;
const camL = new THREE.PerspectiveCamera(VFOV, SENSOR_W / SENSOR_H, 0.05, 3);
const camR = camL.clone();
camL.position.set(-BASE / 2, RIG_Y, RIG_Z);
camR.position.set(BASE / 2, RIG_Y, RIG_Z);
camL.updateMatrixWorld(); camR.updateMatrixWorld();

// rig
const yellow = new THREE.MeshStandardMaterial({ color: '#f5c518', roughness: 0.45 });
const dark = new THREE.MeshStandardMaterial({ color: '#141a2e', roughness: 0.5, metalness: 0.3 });
const bar = new THREE.Mesh(new THREE.BoxGeometry(BASE + 0.1, 0.03, 0.035), yellow);
bar.position.set(0, RIG_Y + 0.035, RIG_Z + 0.02); scene.add(bar);
for (const c of [camL, camR]) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.04, 0.05), dark);
  b.position.copy(c.position).add(new THREE.Vector3(0, 0, 0.03)); scene.add(b);
}
// frustums reaching the row
function frustum(cam, color) {
  const d = cam.position.z - 0.02, h = Math.tan(THREE.MathUtils.degToRad(VFOV / 2)) * d, w = h * cam.aspect, o = cam.position;
  const c = [[-w, -h], [w, -h], [w, h], [-w, h]].map(([x, y]) => new THREE.Vector3(o.x + x, o.y + y, o.z - d));
  const pts = []; c.forEach((p, i) => pts.push(o.clone(), p, p, c[(i + 1) % 4]));
  return new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.28 }));
}
scene.add(frustum(camL, '#ffffff'), frustum(camR, '#f5c518'));

// text sprites
function textSprite(text, { color = '#ffffff', bg = 'rgba(15,23,48,0.85)', size = 28 } = {}) {
  const c = document.createElement('canvas'), g = c.getContext('2d');
  const font = `600 ${size}px "Martian Mono", ui-monospace, monospace`;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 20, h = size + 14;
  c.width = w; c.height = h;
  g.fillStyle = bg; g.beginPath(); g.roundRect(0, 0, w, h, 6); g.fill();
  g.font = font; g.fillStyle = color; g.textBaseline = 'middle'; g.fillText(text, 10, h / 2 + 1);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(w / 1400, h / 1400, 1);
  s.renderOrder = 20;
  return s;
}

// axis triad at the left camera: X right, Y up, Z towards the plant (−z world)
const AX = { X: '#ffffff', Y: '#f5c518', Z: '#8fb0ff' };
const origin = camL.position.clone();
for (const [k, dir] of [['X', new THREE.Vector3(1, 0, 0)], ['Y', new THREE.Vector3(0, 1, 0)], ['Z', new THREE.Vector3(0, 0, -1)]]) {
  scene.add(new THREE.ArrowHelper(dir, origin, 0.12, AX[k], 0.025, 0.014));
  const s = textSprite(k, { color: '#0f1730', bg: AX[k], size: 26 });
  s.position.copy(origin).addScaledVector(dir, 0.15);
  scene.add(s);
}

// ---------- plants and candidates ----------
const rng = rngFrom(31337);
const gauss = () => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const PIX_NOISE = 0.7;
const candidates = [];
const tmp = new THREE.Vector3();
const tanH = Math.tan(THREE.MathUtils.degToRad(VFOV / 2));

function viewable(w, r) {
  const depth = camL.position.z - w.z;
  if (depth < 0.15) return null;
  const vL = w.clone().project(camL), vR = w.clone().project(camR);
  const rN = r / (depth * tanH);
  const ok = (v) => Math.abs(v.x) < 1 - rN * 0.5 && Math.abs(v.y) < 1 - rN * 0.5 && v.z < 1;
  return ok(vL) && ok(vR) ? { vL, vR } : null;
}

function addCandidate(truth, r, real, trueCls, conf, predCls) {
  const views = viewable(truth, r);
  if (!views) return;
  // match + triangulate with pixel noise on the box centres
  const pL = toPx(views.vL), pR = toPx(views.vR);
  const tri = triangulate(pL.u + gauss() * PIX_NOISE, pL.v + gauss() * PIX_NOISE, pR.u + gauss() * PIX_NOISE);
  if (!tri) return;
  const est = new THREE.Vector3(camL.position.x + tri.X, camL.position.y + tri.Y, camL.position.z - tri.Z);
  candidates.push({ id: candidates.length + 1, truth: truth.clone(), est, r, real, trueCls, predCls, conf, X: tri.X, Y: tri.Y, Z: tri.Z, err: est.distanceTo(truth), vis: 0 });
}

const leafSamples = [];
for (const x of [-0.54, -0.18, 0.18, 0.54]) {
  const p = buildPlant(rng, { dense: true });
  p.group.position.set(x, 0.08, 0);
  scene.add(p.group);
  p.group.updateMatrixWorld(true);
  for (const t of p.tomatoes) {
    t.mesh.getWorldPosition(tmp);
    let conf = 0.9 - (t.cls === 'pinton' ? 0.12 : 0) - (t.occl ? 0.38 : 0) - rng() * 0.16 + gauss() * 0.05;
    conf = THREE.MathUtils.clamp(conf, 0.07, 0.99);
    let pred = t.cls;
    if (t.cls === 'pinton' && rng() < 0.25) pred = rng() < 0.5 ? 'maduro' : 'verde';
    addCandidate(tmp, t.r, true, t.cls, conf, pred);
  }
  const m = p.group.matrixWorld;
  for (const s of p.samples) if (s[3] === 0) leafSamples.push(new THREE.Vector3(s[0], s[1], s[2]).applyMatrix4(m));
}
const realTotal = candidates.filter((c) => c.real).length;
// leaves the detector mistakes for fruit: mostly low confidence, a few convincing ones
for (let i = 0, tries = 0; i < 12 && tries < 400; tries++) {
  const w = leafSamples[Math.floor(rng() * leafSamples.length)];
  const before = candidates.length;
  const conf = i < 2 ? 0.56 + rng() * 0.14 : 0.04 + 0.5 * Math.pow(rng(), 1.8);
  addCandidate(w, 0.028 + rng() * 0.012, false, null, conf, rng() < 0.75 ? 'verde' : 'pinton');
  if (candidates.length > before) i++;
}
candidates.sort((a, b) => b.conf - a.conf).forEach((c, i) => { c.id = i + 1; });

// visuals per candidate
const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
const dashed = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)));
dashed.computeLineDistances();
const markGeo = new THREE.SphereGeometry(1, 12, 8);
const hitGeo = new THREE.SphereGeometry(1, 8, 6);
const hitMat = new THREE.MeshBasicMaterial({ visible: false });
for (const c of candidates) {
  const mat = c.real
    ? new THREE.LineBasicMaterial({ color: CLASS_UI[c.predCls], transparent: true, opacity: 0 })
    : new THREE.LineDashedMaterial({ color: '#ffffff', dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0 });
  c.box = new THREE.LineSegments(c.real ? edges : dashed.geometry, mat);
  c.box.position.copy(c.est);
  c.box.renderOrder = 5;
  c.mark = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ color: '#f5c518', transparent: true, opacity: 0, depthTest: false }));
  c.mark.position.copy(c.est); c.mark.scale.setScalar(0.007); c.mark.renderOrder = 6;
  c.hit = new THREE.Mesh(hitGeo, hitMat);
  c.hit.position.copy(c.est); c.hit.scale.setScalar(c.r * 1.4); c.hit.userData.c = c;
  scene.add(c.box, c.mark, c.hit);
}

// selection: X → Y → Z path from the left camera to the estimate
const pathGeo = new THREE.BufferGeometry();
pathGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(18), 3));
const cols = ['X', 'X', 'Y', 'Y', 'Z', 'Z'].flatMap((k) => new THREE.Color(AX[k]).toArray());
pathGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
const path = new THREE.LineSegments(pathGeo, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true }));
path.renderOrder = 15;
scene.add(path);
const pathLabels = [];

let selected = null;
function select(c) {
  selected = c;
  pathLabels.forEach((s) => { scene.remove(s); s.material.map.dispose(); s.material.dispose(); });
  pathLabels.length = 0;
  path.visible = !!c;
  if (c) {
    const o = origin, p1 = new THREE.Vector3(o.x + c.X, o.y, o.z), p2 = new THREE.Vector3(p1.x, o.y + c.Y, o.z), p3 = new THREE.Vector3(p2.x, p2.y, o.z - c.Z);
    const q = pathGeo.attributes.position;
    [o, p1, p1, p2, p2, p3].forEach((p, i) => q.setXYZ(i, p.x, p.y, p.z));
    q.needsUpdate = true;
    for (const [k, a, b, v] of [['X', o, p1, c.X], ['Y', p1, p2, c.Y], ['Z', p2, p3, c.Z]]) {
      const s = textSprite(`${k} ${cm(v)} cm`, { color: AX[k] });
      s.position.copy(a).lerp(b, 0.5).add(new THREE.Vector3(0, 0.025, 0));
      scene.add(s); pathLabels.push(s);
    }
  }
  [...tbody.rows].forEach((tr) => tr.classList.toggle('sel', !!c && tr.dataset.id === String(c.id)));
}

// ---------- metrics ----------
function metricsAt(t) {
  let tp = 0, fp = 0;
  for (const c of candidates) if (c.conf >= t) (c.real ? tp++ : fp++);
  const fn = realTotal - tp;
  const precision = tp + fp ? tp / (tp + fp) : null;
  const recall = realTotal ? tp / realTotal : 0;
  const f1 = precision && recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { tp, fp, fn, acc: tp + fp, precision, recall, f1 };
}
const sweep = [];
for (let t = 0.99; t >= 0.049; t -= 0.01) sweep.push({ t, ...metricsAt(t) });
const best = sweep.reduce((a, b) => (b.f1 > a.f1 ? b : a));

// PR curve
const NS = 'http://www.w3.org/2000/svg';
const PR = { l: 34, r: 312, t: 10, b: 160 };
const px = (r) => PR.l + r * (PR.r - PR.l), py = (p) => PR.b - p * (PR.b - PR.t);
function svgEl(tag, attrs, parent = prSvg) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; }
for (const v of [0, 0.5, 1]) {
  svgEl('line', { x1: PR.l, x2: PR.r, y1: py(v), y2: py(v), stroke: 'rgba(195,207,245,0.18)' });
  svgEl('text', { x: PR.l - 6, y: py(v) + 3, 'text-anchor': 'end' }).textContent = fmt(v, 1);
  svgEl('text', { x: px(v), y: PR.b + 16, 'text-anchor': 'middle' }).textContent = fmt(v, 1);
}
svgEl('text', { x: PR.r, y: PR.b + 30, 'text-anchor': 'end' }).textContent = 'exhaustividad →';
svgEl('text', { x: 0, y: PR.b + 30, 'text-anchor': 'start' }).textContent = '↑ precisión';
const prPts = sweep.filter((s) => s.precision !== null);
svgEl('path', { d: prPts.map((s, i) => `${i ? 'L' : 'M'}${px(s.recall).toFixed(1)} ${py(s.precision).toFixed(1)}`).join(''), fill: 'none', stroke: '#ffffff', 'stroke-width': 2, 'stroke-linejoin': 'round' });
svgEl('circle', { cx: px(best.recall), cy: py(best.precision), r: 4.5, fill: 'none', stroke: '#ffffff', 'stroke-width': 1.5 });
svgEl('text', { x: px(best.recall) - 10, y: py(best.precision) + 36, 'text-anchor': 'end' }).textContent = `mejor F1 · ${fmt(best.t)}`;
const cur = svgEl('circle', { r: 6.5, fill: '#f5c518', stroke: '#152c80', 'stroke-width': 2 });
const curLabel = svgEl('text', { 'text-anchor': 'start', style: 'fill:#f5c518' });

// ---------- threshold state ----------
let threshold = input.value / 100;
let lastKey = '';
function applyThreshold(t, fromInput = false) {
  threshold = t;
  if (!fromInput) input.value = Math.round(t * 100);
  input.style.setProperty('--p', `${((input.value - input.min) / (input.max - input.min)) * 100}%`);
  output.value = fmt(t);
  const m = metricsAt(t);
  M.acc.textContent = m.acc;
  M.tp.textContent = `${m.tp} de ${realTotal}`;
  M.fp.textContent = m.fp;
  M.fn.textContent = m.fn;
  M.pr.textContent = m.precision === null ? '— · 0,00' : `${fmt(m.precision)} · ${fmt(m.recall)}`;
  M.f1.textContent = fmt(m.f1);
  M.fp.classList.toggle('bad', m.fp > 0);
  M.fn.classList.toggle('bad', m.fn > realTotal * 0.25);
  if (m.precision !== null) {
    cur.setAttribute('visibility', 'visible'); curLabel.setAttribute('visibility', 'visible');
    cur.setAttribute('cx', px(m.recall)); cur.setAttribute('cy', py(m.precision));
    const lx = px(m.recall), right = lx < PR.r - 90;
    curLabel.setAttribute('x', right ? lx + 10 : lx - 10);
    curLabel.setAttribute('text-anchor', right ? 'start' : 'end');
    curLabel.setAttribute('y', py(m.precision) < PR.t + 24 ? py(m.precision) + 20 : py(m.precision) - 10);
    curLabel.textContent = `umbral ${fmt(t)}`;
  } else { cur.setAttribute('visibility', 'hidden'); curLabel.setAttribute('visibility', 'hidden'); }

  const accepted = candidates.filter((c) => c.conf >= t);
  const key = accepted.map((c) => c.id).join(',');
  if (key !== lastKey) {
    lastKey = key;
    renderTable(accepted);
    if (selected && selected.conf < t) select(accepted.find((c) => c.real) || null);
    else if (!selected && accepted.length) select(accepted.find((c) => c.real) || accepted[0]);
    else select(selected);
  }
  kick();
}

function renderTable(accepted) {
  if (!accepted.length) {
    tbody.innerHTML = '<tr class="thr-empty"><td colspan="8">Ningún candidato supera el umbral. Bajalo para ver detecciones.</td></tr>';
    return;
  }
  tbody.innerHTML = accepted.map((c) => `
    <tr data-id="${c.id}" tabindex="0">
      <td>C-${String(c.id).padStart(2, '0')}</td>
      <td><span class="chip" style="--c:${CLASS_UI[c.predCls]}"><i></i>${CLASS_LABEL[c.predCls]}</span></td>
      <td>${fmt(c.conf)}</td>
      <td>${cm(c.X)}</td><td>${cm(c.Y)}</td><td>${cm(c.Z)}</td>
      <td>${c.real ? `${cm(c.err)} cm` : '—'}</td>
      <td>${c.real ? `<span class="chip" style="--c:${CLASS_UI[c.trueCls]}"><i></i>Tomate ${CLASS_LABEL[c.trueCls].toLowerCase()}</span>` : '<span class="chip fp"><i></i>Hoja (falso positivo)</span>'}</td>
    </tr>`).join('');
}
tbody.addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-id]');
  if (tr) select(candidates.find((c) => String(c.id) === tr.dataset.id));
  kick();
});
tbody.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const tr = e.target.closest('tr[data-id]');
  if (tr) { e.preventDefault(); select(candidates.find((c) => String(c.id) === tr.dataset.id)); kick(); }
});

input.addEventListener('input', () => { stopSweep(); applyThreshold(input.value / 100, true); });

// ---------- parametrised sweep animation ----------
let sweepAnim = null;
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
function startSweep() {
  // 0.95 → 0.05 over 7 s, then settle on the best-F1 threshold
  sweepAnim = { t0: performance.now(), legs: [[threshold, 0.95, 900], [0.95, 0.05, 7000], [0.05, best.t, 1600]] };
  playBtn.setAttribute('aria-pressed', 'true');
  playBtn.querySelector('span').textContent = 'Detener';
  playBtn.querySelector('svg').innerHTML = '<path d="M4 3h3v10H4zM9 3h3v10H9z" fill="currentColor"/>';
  kick();
}
function stopSweep() {
  if (!sweepAnim) return;
  sweepAnim = null;
  playBtn.setAttribute('aria-pressed', 'false');
  playBtn.querySelector('span').textContent = 'Barrer umbral';
  playBtn.querySelector('svg').innerHTML = '<path d="M4 2.5v11l9-5.5z" fill="currentColor"/>';
}
function stepSweep(now) {
  let el = now - sweepAnim.t0;
  for (const [a, b, d] of sweepAnim.legs) {
    if (el <= d) { applyThreshold(a + (b - a) * ease(el / d)); return; }
    el -= d;
  }
  applyThreshold(best.t);
  stopSweep();
}
playBtn.addEventListener('click', () => (sweepAnim ? stopSweep() : startSweep()));
bestBtn.addEventListener('click', () => { stopSweep(); applyThreshold(best.t); });

// ---------- interaction ----------
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.0, 0.18);
controls.enableDamping = true; controls.enableZoom = false; controls.enablePan = false;
controls.minPolarAngle = 0.4; controls.maxPolarAngle = 1.75;
controls.minAzimuthAngle = -1.4; controls.maxAzimuthAngle = 1.4;
controls.addEventListener('change', kick);

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let downAt = null;
function pick(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(candidates.filter((c) => c.conf >= threshold).map((c) => c.hit));
  return { c: hits[0]?.object.userData.c || null, x: e.clientX - r.left, y: e.clientY - r.top };
}
canvas.addEventListener('pointermove', (e) => {
  const { c, x, y } = pick(e);
  if (c) {
    tip.innerHTML = `<b>C-${String(c.id).padStart(2, '0')} · ${c.real ? 'tomate' : 'hoja (FP)'}</b><br>conf ${fmt(c.conf)} · ${CLASS_LABEL[c.predCls]}<br>X ${cm(c.X)} · Y ${cm(c.Y)} · Z ${cm(c.Z)} cm`;
    tip.style.left = `${x}px`; tip.style.top = `${y}px`; tip.hidden = false;
    canvas.style.cursor = 'pointer';
  } else { tip.hidden = true; canvas.style.cursor = ''; }
});
canvas.addEventListener('pointerleave', () => { tip.hidden = true; });
canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  const { c } = pick(e);
  if (c) { select(c); kick(); }
});

// ---------- loop (runs only while something is moving) ----------
let raf = 0, visible = false, last = performance.now(), idle = 0;
function frame(now) {
  raf = 0;
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  if (sweepAnim) stepSweep(now);
  let moving = !!sweepAnim;
  const k = reduce ? 1 : 1 - Math.exp(-dt * 14);
  for (const c of candidates) {
    const target = c.conf >= threshold ? 1 : 0;
    c.vis += (target - c.vis) * k;
    if (Math.abs(target - c.vis) < 0.002) c.vis = target; else moving = true;
    const on = c.vis > 0.01;
    c.box.visible = on; c.mark.visible = on;
    c.box.material.opacity = c.vis * (c === selected ? 1 : 0.9);
    c.mark.material.opacity = c.vis;
    const s = c.r * 2.3 * (0.6 + 0.4 * c.vis) * (c === selected ? 1.12 : 1);
    c.box.scale.setScalar(s);
  }
  if (controls.update()) moving = true;
  renderer.render(scene, camera);
  idle = moving ? 0 : idle + 1;
  if (visible && idle < 3) raf = requestAnimationFrame(frame);
}
function kick() { if (!raf && visible) { last = performance.now(); idle = 0; raf = requestAnimationFrame(frame); } }

function resize() {
  const r = canvas.getBoundingClientRect();
  if (!r.width) return;
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height;
  camera.fov = r.width < 520 ? 46 : 38;
  camera.updateProjectionMatrix();
  kick();
}
new ResizeObserver(resize).observe(canvas);
new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); }, { rootMargin: '120px' }).observe(canvas);
document.fonts?.ready.then(() => select(selected));

resize();
applyThreshold(threshold, true);
