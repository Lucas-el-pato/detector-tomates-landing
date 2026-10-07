// 3D confusion matrix (synthetic demo data) + accessible table twin.
import * as THREE from 'three';
import { CLASS_UI, CLASS_LABEL } from './plant.js';

const ROWS = ['verde', 'pinton', 'maduro'];
const COLS = ['verde', 'pinton', 'maduro', 'none'];
const COL_LABEL = { ...CLASS_LABEL, none: 'Sin detectar' };
const DATA = [
  [512, 31, 2, 48],
  [27, 318, 36, 41],
  [1, 22, 689, 39],
];
const fmt = (n, d = 1) => n.toLocaleString('es-PY', { minimumFractionDigits: d, maximumFractionDigits: d });

// ---- table ----
const table = document.getElementById('cm-table');
const thead = document.createElement('thead');
thead.innerHTML = `<tr><th scope="col">Real \\ Predicho</th>${COLS.map((c) => `<th scope="col">${COL_LABEL[c]}</th>`).join('')}<th scope="col">Exhaustividad</th></tr>`;
const tbody = document.createElement('tbody');
DATA.forEach((row, i) => {
  const total = row.reduce((a, b) => a + b, 0);
  tbody.insertAdjacentHTML('beforeend', `<tr><th scope="row">${CLASS_LABEL[ROWS[i]]}</th>${row.map((v, j) => `<td class="${i === j ? 'diag' : ''}">${v}</td>`).join('')}<td>${fmt((row[i] / total) * 100)} %</td></tr>`);
});
table.append(thead, tbody);

// ---- 3D ----
const canvas = document.getElementById('cm-canvas');
const tip = document.getElementById('cm-tip');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 2, 0.1, 100);
scene.add(new THREE.HemisphereLight('#ffffff', '#c9d2e0', 2.2));
const key = new THREE.DirectionalLight('#ffffff', 1.6);
key.position.set(-4, 8, 6);
scene.add(key);

const CELL = 1.5, MAXH = 2.6;
const maxV = Math.max(...DATA.flat());
const group = new THREE.Group();
scene.add(group);
const ox = -((COLS.length - 1) * CELL) / 2, oz = -((ROWS.length - 1) * CELL) / 2;

const plate = new THREE.Mesh(new THREE.BoxGeometry(COLS.length * CELL + 0.3, 0.06, ROWS.length * CELL + 0.3), new THREE.MeshStandardMaterial({ color: '#e1e6ec', roughness: 0.9 }));
plate.position.y = -0.03;
group.add(plate);
const lines = [];
for (let i = 0; i <= COLS.length; i++) lines.push(new THREE.Vector3(ox - CELL / 2 + i * CELL, 0.002, oz - CELL / 2), new THREE.Vector3(ox - CELL / 2 + i * CELL, 0.002, oz + (ROWS.length - 0.5) * CELL));
for (let j = 0; j <= ROWS.length; j++) lines.push(new THREE.Vector3(ox - CELL / 2, 0.002, oz - CELL / 2 + j * CELL), new THREE.Vector3(ox + (COLS.length - 0.5) * CELL, 0.002, oz - CELL / 2 + j * CELL));
group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), new THREE.LineBasicMaterial({ color: '#c8cfda' })));

const bars = [];
const geo = new THREE.BoxGeometry(1, 1, 1);
geo.translate(0, 0.5, 0);
DATA.forEach((row, i) => row.forEach((v, j) => {
  const diag = i === j;
  const color = diag ? CLASS_UI[ROWS[i]] : COLS[j] === 'none' ? '#b3bccb' : '#7d889e';
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, emissive: '#f5c518', emissiveIntensity: 0 });
  const bar = new THREE.Mesh(geo, mat);
  const h = Math.max(0.03, (v / maxV) * MAXH);
  bar.scale.set(CELL * 0.62, h, CELL * 0.62);
  bar.position.set(ox + j * CELL, 0, oz + i * CELL);
  bar.userData = { i, j, v, h };
  group.add(bar);
  bars.push(bar);
}));

function label(text, { size = 30, color = '#47526d', weight = 600 } = {}) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = `${weight} ${size}px Archivo, system-ui, sans-serif`;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 8;
  c.width = w; c.height = size + 12;
  g.font = font; g.fillStyle = color; g.textBaseline = 'middle';
  g.fillText(text, 4, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w / 110, c.height / 110), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  return m;
}
const labels = [];
function addLabels() {
  labels.forEach((l) => group.remove(l));
  labels.length = 0;
  COLS.forEach((c, j) => {
    const l = label(COL_LABEL[c]);
    l.position.set(ox + j * CELL, 0.01, oz - CELL * 0.95);
    group.add(l); labels.push(l);
  });
  ROWS.forEach((r, i) => {
    const l = label(CLASS_LABEL[r]);
    l.geometry.translate(-l.geometry.parameters.width / 2, 0, 0);
    l.position.set(ox - CELL * 0.7, 0.01, oz + i * CELL);
    group.add(l); labels.push(l);
  });
  const p = label('predicho →', { size: 28, color: '#6b7590', weight: 500 });
  p.position.set(ox + (COLS.length - 1) * CELL * 0.5, 0.01, oz - CELL * 1.45);
  const r = label('real ↓', { size: 28, color: '#6b7590', weight: 500 });
  r.geometry.translate(-r.geometry.parameters.width / 2, 0, 0);
  r.position.set(ox - CELL * 0.7, 0.01, oz - CELL * 0.95);
  group.add(p, r); labels.push(p, r);
}
addLabels();
document.fonts?.ready.then(() => { addLabels(); render(); });

const target = new THREE.Vector3(0.25, 0.4, 0.35);
let mx = 0, my = 0;
function placeCamera() {
  const narrow = canvas.clientWidth < 560;
  const d = narrow ? 14 : 11;
  camera.position.set(target.x + d * 0.3 + mx * 0.8, target.y + d * 0.68 + my * 0.5, target.z + d * 0.67);
  camera.lookAt(target);
}

function resize() {
  const r = canvas.getBoundingClientRect();
  if (!r.width) return;
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height;
  camera.updateProjectionMatrix();
  render();
}
function render() { placeCamera(); renderer.render(scene, camera); }

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let hovered = null;
canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  mx = ndc.x; my = ndc.y * 0.5;
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(bars)[0]?.object || null;
  if (hovered !== hit) {
    if (hovered) hovered.material.emissiveIntensity = 0;
    hovered = hit;
    if (hovered) hovered.material.emissiveIntensity = 0.35;
  }
  if (hovered) {
    const { i, j, v } = hovered.userData;
    const total = DATA[i].reduce((a, b) => a + b, 0);
    tip.innerHTML = `<b>Real: ${CLASS_LABEL[ROWS[i]]}</b><br>${COLS[j] === 'none' ? 'no detectado' : `predicho: ${COL_LABEL[COLS[j]]}`}<br>${v} tomates · ${fmt((v / total) * 100)} % de la fila`;
    tip.style.left = `${e.clientX - r.left}px`;
    tip.style.top = `${e.clientY - r.top}px`;
    tip.hidden = false;
  } else tip.hidden = true;
  render();
});
canvas.addEventListener('pointerleave', () => {
  if (hovered) hovered.material.emissiveIntensity = 0;
  hovered = null; tip.hidden = true; mx = 0; my = 0; render();
});

new ResizeObserver(resize).observe(canvas);
resize();
