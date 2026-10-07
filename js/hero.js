// Hero: a stereo rig scans a moving row of tomato plants. The two camera
// feeds are real renders from the two virtual cameras; boxes are matched
// across views and triangulated to X, Y, Z every frame.
import * as THREE from 'three';
import { buildPlant, rngFrom, CLASS_UI, CLASS_LABEL } from './plant.js';
import { SENSOR_W, SENSOR_H, VFOV, BASE, toPx, triangulate, cm } from './stereo-math.js';

const stage = document.getElementById('hero-stage');
const canvas = document.getElementById('hero-canvas');
const overlay = document.getElementById('hero-overlay');
const ctx = overlay.getContext('2d');
const feedEls = { L: document.getElementById('feed-L'), R: document.getElementById('feed-R') };
const feedCount = { L: document.getElementById('feed-L-n'), R: document.getElementById('feed-R-n') };
const ro = {
  id: document.getElementById('ro-id'), cls: document.getElementById('ro-class'),
  conf: document.getElementById('ro-conf'), disp: document.getElementById('ro-disp'),
  x: document.getElementById('ro-x'), y: document.getElementById('ro-y'), z: document.getElementById('ro-z'),
};
const HERO_THRESHOLD = 0.5;
const tallyEls = { verde: document.getElementById('t-verde'), pinton: document.getElementById('t-pinton'), maduro: document.getElementById('t-maduro') };
const copyEl = document.querySelector('.hero-copy');
const instEl = document.querySelector('.hero-instruments');
const navEl = document.querySelector('.plate-nav');

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ENAMEL = new THREE.Color('#1d3aa6');
const FEED_BG = new THREE.Color('#26332c');


const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = ENAMEL;
const fog = new THREE.Fog(ENAMEL, 3.2, 7.5);
scene.fog = fog;

scene.add(new THREE.HemisphereLight('#e6ecff', '#20307a', 1.5));
const sun = new THREE.DirectionalLight('#fff1dc', 2.6);
sun.position.set(2, 4, 3);
scene.add(sun);
const fill = new THREE.DirectionalLight('#9fb4ff', 0.6);
fill.position.set(-3, 1.5, -2);
scene.add(fill);

// ground: measurement floor + soil bed
const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: '#18319a', roughness: 1 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const grid = new THREE.GridHelper(30, 60, '#3c5ad0', '#2a46b8');
grid.position.y = 0.002;
scene.add(grid);
const bed = new THREE.Mesh(new THREE.BoxGeometry(30, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: '#3a2e2a', roughness: 1 }));
bed.position.set(0, 0.04, 0);
scene.add(bed);
const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 30, 6), new THREE.MeshStandardMaterial({ color: '#c8d0dc', metalness: 0.6, roughness: 0.3 }));
wire.rotation.z = Math.PI / 2;
wire.position.set(0, 2.25, 0);
scene.add(wire);

// plants on a treadmill: they move -x, the rig stays still
const rng = rngFrom(20261007);
const SPACING = 0.5, N_PLANTS = 16, SPAN = SPACING * N_PLANTS;
const plants = [];
const stringMat = new THREE.MeshStandardMaterial({ color: '#d9dee6', roughness: 0.6 });
function spawnPlant(x) {
  const p = buildPlant(rng);
  p.group.position.set(x, 0.08, (rng() - 0.5) * 0.06);
  const str = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 2.25 - 0.08 - p.height, 4), stringMat);
  str.position.set(0, p.height + (2.25 - 0.08 - p.height) / 2, 0);
  p.group.add(str);
  p.str = str;
  scene.add(p.group);
  return p;
}
for (let i = 0; i < N_PLANTS; i++) plants.push(spawnPlant(-SPAN / 2 + i * SPACING));

// ---- stereo rig (layer 1: visible in the main view, not to itself) ----
const RIG_Z = 0.78, RIG_Y = 1.02;
const rig = new THREE.Group();
const yellow = new THREE.MeshStandardMaterial({ color: '#f5c518', roughness: 0.45, metalness: 0.1 });
const dark = new THREE.MeshStandardMaterial({ color: '#141a2e', roughness: 0.5, metalness: 0.3 });
const glass = new THREE.MeshStandardMaterial({ color: '#0b0f1c', roughness: 0.05, metalness: 0.9 });
const cart = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.18, 0.5), yellow); cart.position.set(0, 0.17, RIG_Z + 0.32); rig.add(cart);
for (const sx of [-0.24, 0.24]) for (const sz of [0.12, 0.52]) {
  const w = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 18), dark);
  w.rotation.z = Math.PI / 2; w.position.set(sx + Math.sign(sx) * 0.07, 0.08, RIG_Z + sz); rig.add(w);
}
const mast = new THREE.Mesh(new THREE.BoxGeometry(0.06, RIG_Y - 0.18, 0.06), yellow); mast.position.set(0, 0.26 + (RIG_Y - 0.26) / 2, RIG_Z + 0.3); rig.add(mast);
const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.3), yellow); arm.position.set(0, RIG_Y + 0.06, RIG_Z + 0.15); rig.add(arm);
const bar = new THREE.Mesh(new THREE.BoxGeometry(BASE + 0.12, 0.035, 0.04), dark); bar.position.set(0, RIG_Y + 0.04, RIG_Z + 0.02); rig.add(bar);
for (const sx of [-BASE / 2, BASE / 2]) {
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.045, 0.06), dark); body.position.set(sx, RIG_Y, RIG_Z + 0.02); rig.add(body);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.03, 20), glass); lens.rotation.x = Math.PI / 2; lens.position.set(sx, RIG_Y, RIG_Z - 0.02); rig.add(lens);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.003, 6, 24), yellow); ring.position.set(sx, RIG_Y, RIG_Z - 0.036); rig.add(ring);
}
scene.add(rig);

const camL = new THREE.PerspectiveCamera(VFOV, SENSOR_W / SENSOR_H, 0.05, 3);
const camR = camL.clone();
camL.position.set(-BASE / 2, RIG_Y, RIG_Z - 0.04);
camR.position.set(BASE / 2, RIG_Y, RIG_Z - 0.04);
scene.add(camL, camR);

// frustum outlines reaching the plant row
function frustumLines(cam, color) {
  const d = cam.position.z - 0.02;
  const h = Math.tan(THREE.MathUtils.degToRad(VFOV / 2)) * d, w = h * cam.aspect;
  const o = cam.position;
  const c = [[-w, -h], [w, -h], [w, h], [-w, h]].map(([x, y]) => new THREE.Vector3(o.x + x, o.y + y, o.z - d));
  const pts = [];
  c.forEach((p, i) => { pts.push(o.clone(), p, p, c[(i + 1) % 4]); });
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false }));
}
const frL = frustumLines(camL, '#ffffff');
const frR = frustumLines(camR, '#f5c518');
scene.add(frL, frR);

// rays to the focused tomato
const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
const rays = new THREE.LineSegments(rayGeo, new THREE.LineBasicMaterial({ color: '#f5c518', depthTest: false, transparent: true }));
rays.renderOrder = 10;
scene.add(rays);

// X → Y → Z path from the left camera to the triangulated estimate
const AXIS = { x: new THREE.Color('#ffffff'), y: new THREE.Color('#f5c518'), z: new THREE.Color('#8fb0ff') };
const pathGeo = new THREE.BufferGeometry();
pathGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(18), 3));
pathGeo.setAttribute('color', new THREE.Float32BufferAttribute([...AXIS.x.toArray(), ...AXIS.x.toArray(), ...AXIS.y.toArray(), ...AXIS.y.toArray(), ...AXIS.z.toArray(), ...AXIS.z.toArray()], 3));
const coordPath = new THREE.LineSegments(pathGeo, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true }));
coordPath.renderOrder = 11;
scene.add(coordPath);

// 3D detection boxes pool
const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
const boxMats = Object.fromEntries(Object.entries(CLASS_UI).map(([k, c]) => [k, new THREE.LineBasicMaterial({ color: c })]));
const focusMat = new THREE.LineBasicMaterial({ color: '#f5c518' });
const boxPool = [];
function boxAt(i) {
  if (!boxPool[i]) { const b = new THREE.LineSegments(edges, boxMats.verde); b.layers.set(1); scene.add(b); boxPool.push(b); }
  return boxPool[i];
}
[rig, frL, frR, rays, coordPath, floor, grid].forEach((o) => o.traverse((c) => c.layers.set(1)));

const mainCam = new THREE.PerspectiveCamera(32, 1, 0.05, 40);
mainCam.layers.enable(1);

// ---- layout ----
let W = 0, H = 0, dpr = 1;
const feedRect = { L: null, R: null };
function layout() {
  const r = stage.getBoundingClientRect();
  W = r.width; H = r.height;
  dpr = renderer.getPixelRatio();
  renderer.setSize(W, H, false);
  overlay.width = Math.round(W * dpr); overlay.height = Math.round(H * dpr);
  for (const k of ['L', 'R']) {
    const fr = feedEls[k].getBoundingClientRect();
    feedRect[k] = { x: fr.left - r.left, y: fr.top - r.top, w: fr.width, h: fr.height };
  }
  const mobile = W < 900;
  mainCam.aspect = W / H;
  let cx, cy;
  if (mobile) {
    const cb = copyEl.getBoundingClientRect(), ib = instEl.getBoundingClientRect();
    cx = W / 2; cy = (cb.bottom - r.top + ib.top - r.top) / 2;
    mainCam.fov = 38;
    mainCam.position.set(1.5, 1.7, 3.9);
  } else {
    cx = W * 0.7; cy = H * 0.44;
    mainCam.fov = 27;
    mainCam.position.set(2.1, 1.75, 4.3);
  }
  mainCam.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
  mainCam.updateProjectionMatrix();
  baseCamPos.copy(mainCam.position);
}
const baseCamPos = new THREE.Vector3();
const lookTarget = new THREE.Vector3(-0.08, 0.98, 0.1);

// ---- detection ----
const tmp = new THREE.Vector3();
const tally = { verde: 0, pinton: 0, maduro: 0 };
const seen = new Set();
let detections = [];
let focusId = null, focusSince = 0;

function hash01(n) { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); }

function detect(time) {
  const out = [];
  const tanH = Math.tan(THREE.MathUtils.degToRad(VFOV / 2));
  for (const p of plants) {
    for (const t of p.tomatoes) {
      t.mesh.getWorldPosition(tmp);
      const depth = camL.position.z - tmp.z;
      if (depth < 0.2) continue;
      const vL = tmp.clone().project(camL);
      const vR = tmp.clone().project(camR);
      const rN = t.r / (depth * tanH);
      const inside = (v) => Math.abs(v.x) < 1 - rN * 0.6 && Math.abs(v.y) < 1 - rN && v.z < 1;
      if (!inside(vL) || !inside(vR)) continue;
      // heavily occluded fruit: the pair is lost in roughly half of them
      if (t.occl && t.seed < 0.5) continue;
      const jitter = (hash01(t.id + Math.floor(time * 3)) - 0.5) * 0.02;
      let conf = 0.95 - (t.cls === 'pinton' ? 0.1 : 0) - (t.occl ? 0.22 : 0) - t.seed * 0.06 + jitter;
      conf = Math.min(0.99, Math.max(0.41, conf));
      if (conf < HERO_THRESHOLD) continue;
      // match the pair and triangulate the box centres → X, Y, Z (left camera frame)
      const pL = toPx(vL), pR = toPx(vR);
      const tri = triangulate(pL.u, pL.v, pR.u);
      if (!tri) continue;
      // back to world space to draw the estimate (camera looks down −z)
      const est = new THREE.Vector3(camL.position.x + tri.X, camL.position.y + tri.Y, camL.position.z - tri.Z);
      out.push({ t, vL, vR, rN, conf, disp: tri.d, X: tri.X, Y: tri.Y, Z: tri.Z, world: tmp.clone(), est });
      if (!seen.has(t.id)) { seen.add(t.id); tally[t.cls]++; }
    }
  }
  return out;
}

// ---- overlay drawing ----
const MONO = '500 10px "Martian Mono", ui-monospace, monospace';
function drawFeed(k, dets, focus, time) {
  const f = feedRect[k];
  if (!f) return;
  const sx = (v) => f.x + ((v.x + 1) / 2) * f.w;
  const sy = (v) => f.y + ((1 - v.y) / 2) * f.h;
  ctx.save();
  ctx.beginPath(); ctx.rect(f.x, f.y, f.w, f.h); ctx.clip();
  // vignette
  const g = ctx.createRadialGradient(f.x + f.w / 2, f.y + f.h / 2, f.h * 0.3, f.x + f.w / 2, f.y + f.h / 2, f.w * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = g; ctx.fillRect(f.x, f.y, f.w, f.h);
  // epipolar line through the focused fruit (rectified pair: same row)
  if (focus) {
    const y = sy(k === 'L' ? focus.vL : focus.vR);
    ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(245,197,24,0.8)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(f.x, y); ctx.lineTo(f.x + f.w, y); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.font = MONO; ctx.textBaseline = 'top';
  for (const d of dets) {
    const v = k === 'L' ? d.vL : d.vR;
    const cx = sx(v), cy = sy(v);
    const rh = d.rN * f.h / 2 * 1.12;
    const isF = focus && d.t.id === focus.t.id;
    ctx.strokeStyle = isF ? '#f5c518' : CLASS_UI[d.t.cls];
    ctx.lineWidth = isF ? 2 : 1.5;
    ctx.strokeRect(cx - rh, cy - rh, rh * 2, rh * 2);
    if (isF) {
      const label = `${CLASS_LABEL[d.t.cls].toLowerCase()} ${d.conf.toFixed(2)}`;
      const tw = ctx.measureText(label).width + 6;
      const ly = cy - rh - 13 < f.y ? cy + rh : cy - rh - 13;
      ctx.fillStyle = isF ? '#f5c518' : CLASS_UI[d.t.cls];
      ctx.fillRect(cx - rh - (ctx.lineWidth / 2), ly, tw, 13);
      ctx.fillStyle = isF ? '#1a1400' : '#fff';
      ctx.fillText(label, cx - rh + 2, ly + 2);
    }
  }
  // HUD
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  const secs = Math.floor(time);
  const stamp = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  ctx.fillText(`${k === 'L' ? 'IZQ' : 'DER'}  ${stamp}  umbral ${HERO_THRESHOLD.toFixed(2)}`, f.x + 8, f.y + f.h - 16);
  ctx.fillStyle = '#d6402e';
  ctx.beginPath(); ctx.arc(f.x + f.w - 12, f.y + 12, 3.5, 0, Math.PI * 2);
  if (reduce || Math.floor(time * 2) % 2 === 0) ctx.fill();
  ctx.restore();
}

function setReadout(d) {
  if (!d) { ro.id.textContent = 'buscando…'; ro.cls.textContent = '—'; ro.conf.textContent = '—'; ro.disp.textContent = '—'; ro.x.textContent = ro.y.textContent = ro.z.textContent = '—'; return; }
  ro.id.textContent = `T-${String(d.t.id).padStart(4, '0')}`;
  ro.cls.innerHTML = `<i style="background:${CLASS_UI[d.t.cls]}"></i>${CLASS_LABEL[d.t.cls]}`;
  ro.conf.textContent = d.conf.toFixed(2);
  ro.disp.textContent = `${d.disp.toFixed(1)} px`;
  ro.x.textContent = cm(d.X);
  ro.y.textContent = cm(d.Y);
  ro.z.textContent = cm(d.Z);
}

// ---- loop ----
const clock = new THREE.Clock();
let elapsed = 0, running = false, lastUi = 0, raf = 0;
const SPEED = reduce ? 0 : 0.075;

function frame() {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  for (const p of plants) {
    p.group.position.x -= SPEED * dt;
    if (p.group.position.x < -SPAN / 2) {
      const x = p.group.position.x + SPAN;
      scene.remove(p.group); p.dispose();
      Object.assign(p, spawnPlant(x));
    }
  }

  if (!reduce) {
    mainCam.position.x = baseCamPos.x + Math.sin(elapsed * 0.17) * 0.12;
    mainCam.position.y = baseCamPos.y + Math.sin(elapsed * 0.11) * 0.04;
  }
  mainCam.lookAt(lookTarget);

  detections = detect(elapsed);
  // pick a new focus every ~1.8 s, preferring fruit near the image centre
  let focus = detections.find((d) => d.t.id === focusId);
  if (!focus || elapsed - focusSince > 1.8) {
    const sorted = detections.slice().sort((a, b) => Math.abs(a.vL.x + 0.1) + Math.abs(a.vL.y) - (Math.abs(b.vL.x + 0.1) + Math.abs(b.vL.y)));
    const cand = sorted.slice(0, 4).filter((d) => d.t.id !== focusId);
    focus = cand[0] || sorted[0] || null;
    focusId = focus ? focus.t.id : null;
    focusSince = elapsed;
  }

  detections.forEach((d, i) => {
    const b = boxAt(i);
    b.visible = true;
    b.material = d === focus ? focusMat : boxMats[d.t.cls];
    b.position.copy(d.world);
    b.scale.setScalar(d.t.r * 2.3);
  });
  for (let i = detections.length; i < boxPool.length; i++) boxPool[i].visible = false;

  rays.visible = !!focus;
  if (focus) {
    const a = rayGeo.attributes.position;
    a.setXYZ(0, camL.position.x, camL.position.y, camL.position.z);
    a.setXYZ(1, focus.world.x, focus.world.y, focus.world.z);
    a.setXYZ(2, camR.position.x, camR.position.y, camR.position.z);
    a.setXYZ(3, focus.world.x, focus.world.y, focus.world.z);
    a.needsUpdate = true;
    const o = camL.position, q = pathGeo.attributes.position;
    const p1 = [o.x + focus.X, o.y, o.z], p2 = [p1[0], o.y + focus.Y, o.z], p3 = [p2[0], p2[1], o.z - focus.Z];
    [[o.x, o.y, o.z], p1, p1, p2, p2, p3].forEach((p, i) => q.setXYZ(i, ...p));
    q.needsUpdate = true;
  }
  coordPath.visible = rays.visible;

  // main view
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, W, H);
  scene.background = ENAMEL; scene.fog = fog;
  renderer.render(scene, mainCam);
  // camera feeds
  scene.background = FEED_BG; scene.fog = null;
  renderer.setScissorTest(true);
  for (const [k, cam] of [['L', camL], ['R', camR]]) {
    const f = feedRect[k];
    if (!f) continue;
    const y = H - f.y - f.h;
    renderer.setViewport(f.x, y, f.w, f.h);
    renderer.setScissor(f.x, y, f.w, f.h);
    renderer.render(scene, cam);
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  drawFeed('L', detections, focus, elapsed);
  drawFeed('R', detections, focus, elapsed);

  if (reduce || elapsed - lastUi > 0.25) {
    lastUi = elapsed;
    setReadout(focus);
    feedCount.L.textContent = feedCount.R.textContent = `${detections.length} det.`;
    for (const k in tally) tallyEls[k].textContent = tally[k];
  }
  if (reduce) stop();
}

function start() { if (running) return; running = true; clock.getDelta(); raf = requestAnimationFrame(frame); }
function stop() { running = false; cancelAnimationFrame(raf); }

new ResizeObserver(() => { layout(); if (!running) { start(); } }).observe(stage);
new IntersectionObserver(([e]) => { if (e.isIntersecting) start(); else stop(); }).observe(stage);
document.fonts?.ready.then(layout);

// nav plate gets its own background once the hero scrolls away
const onScroll = () => navEl.classList.toggle('scrolled', window.scrollY > 40);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

layout();
start();
