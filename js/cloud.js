// Point cloud reconstructed "from disparity": samples of a procedural plant,
// with depth noise that grows with Z² like a real stereo pair.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildPlant, rngFrom, CLASS_UI } from './plant.js';

const canvas = document.getElementById('cloud-canvas');
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 30);
camera.position.set(1.25, 1.3, 1.6);

const CAM_Z = 0.78, CAM_Y = 1.02, F = 922, B = 0.12;
const rng = rngFrom(4242);
const gauss = () => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

const near = new THREE.Color('#e9eefc'), mid = new THREE.Color('#7f9bf0'), far = new THREE.Color('#2b4cc4');
const depthColor = (t) => (t < 0.5 ? near.clone().lerp(mid, t * 2) : mid.clone().lerp(far, (t - 0.5) * 2));

const positions = [], colors = [];
const fruit = [];
for (const x of [-0.5, 0, 0.5]) {
  const p = buildPlant(rng, { dense: true });
  p.group.position.set(x, 0.08, 0);
  p.group.updateMatrixWorld(true);
  const m = p.group.matrixWorld;
  const v = new THREE.Vector3();
  for (const s of p.samples) {
    v.set(s[0], s[1], s[2]).applyMatrix4(m);
    const Z = CAM_Z - v.z;
    if (Math.abs(v.x) > 0.75 || v.y < 0.3) continue;
    const sigma = (Z * Z) / (F * B) * 0.5;
    const n = gauss() * sigma;
    positions.push(v.x, v.y, v.z - n);
    if (s[3] === 2) colors.push(...new THREE.Color(CLASS_UI[s[4]]).toArray());
    else colors.push(...depthColor(THREE.MathUtils.clamp((Z - 0.6) / 0.45, 0, 1)).toArray());
  }
  for (const t of p.tomatoes) {
    const w = new THREE.Vector3(); t.mesh.getWorldPosition(w);
    if (Math.abs(w.x) < 0.7) fruit.push({ w, r: t.r, cls: t.cls });
  }
  p.dispose();
}
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
const cloud = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.014, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false }));
scene.add(cloud);

// detected fruit as wire spheres
const sphere = new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1, 0));
for (const f of fruit) {
  const s = new THREE.LineSegments(sphere, new THREE.LineBasicMaterial({ color: CLASS_UI[f.cls], transparent: true, opacity: 0.55 }));
  s.position.copy(f.w); s.scale.setScalar(f.r * 1.35);
  scene.add(s);
}

// the stereo pair and its frustum
const rigMat = new THREE.LineBasicMaterial({ color: '#f5c518', transparent: true, opacity: 0.6 });
const hh = Math.tan(THREE.MathUtils.degToRad(27.5)) * 0.8, hw = hh * 4 / 3;
const fpts = [];
for (const ox of [-B / 2, B / 2]) {
  const o = new THREE.Vector3(ox, CAM_Y, CAM_Z);
  const c = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => new THREE.Vector3(ox + x, CAM_Y + y, CAM_Z - 0.8));
  c.forEach((p, i) => fpts.push(o, p, p, c[(i + 1) % 4]));
}
scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(fpts), rigMat));
const camDot = new THREE.Mesh(new THREE.BoxGeometry(B + 0.08, 0.03, 0.03), new THREE.MeshBasicMaterial({ color: '#f5c518' }));
camDot.position.set(0, CAM_Y, CAM_Z);
scene.add(camDot);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.98, 0.1);
controls.enableDamping = true;
controls.enableZoom = false;
controls.enablePan = false;
controls.autoRotate = !reduce;
controls.autoRotateSpeed = 0.8;
controls.minPolarAngle = 0.5; controls.maxPolarAngle = 1.9;

function resize() {
  const r = canvas.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height;
  camera.fov = r.width < 520 ? 44 : 34;
  camera.updateProjectionMatrix();
}
let running = false, raf = 0;
function loop() { raf = requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); }
new ResizeObserver(() => { resize(); renderer.render(scene, camera); }).observe(canvas);
new IntersectionObserver(([e]) => {
  if (e.isIntersecting && !running) { running = true; loop(); }
  else if (!e.isIntersecting && running) { running = false; cancelAnimationFrame(raf); }
}, { rootMargin: '100px' }).observe(canvas);
resize();
