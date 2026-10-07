// Procedural tomato plant shared by the hero scene and the point cloud.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const CLASSES = ['verde', 'pinton', 'maduro'];
export const CLASS_LABEL = { verde: 'Verde', pinton: 'Pintón', maduro: 'Maduro' };
// UI palette (validated for CVD with direct labels) — used for boxes and legends
export const CLASS_UI = { verde: '#2a7d6a', pinton: '#c9921c', maduro: '#d6402e' };
// Fruit surface colors — what the camera would see
export const CLASS_FRUIT = { verde: '#7fa346', pinton: '#e4892c', maduro: '#c92a1c' };

export function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickClass(rng, level) {
  // level 0 = lowest truss (oldest fruit, riper) … 1 = top
  const r = rng();
  const pMaduro = 0.7 - level * 0.65;
  const pPinton = 0.25 + (1 - Math.abs(level - 0.45) * 2) * 0.2;
  if (r < pMaduro) return 'maduro';
  if (r < pMaduro + pPinton) return 'pinton';
  return 'verde';
}

// ---- shared geometries ----
let shared = null;
function sharedGeo() {
  if (shared) return shared;
  const fruit = new THREE.SphereGeometry(1, 36, 24);
  const p = fruit.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const phi = Math.atan2(v.z, v.x);
    const lobes = 1 + 0.045 * Math.cos(phi * 5) * (1 - Math.abs(v.y));
    v.x *= lobes; v.z *= lobes;
    v.y *= 0.84;
    if (v.y > 0.6) v.y -= (v.y - 0.6) * 0.5; // flattened shoulder
    p.setXYZ(i, v.x, v.y, v.z);
  }
  fruit.computeVertexNormals();

  const sepals = [];
  for (let i = 0; i < 5; i++) {
    const c = new THREE.ConeGeometry(0.14, 0.75, 4);
    c.translate(0, 0.375, 0);
    c.rotateZ(-1.25);
    c.rotateY((i / 5) * Math.PI * 2);
    sepals.push(c);
  }
  const stub = new THREE.CylinderGeometry(0.06, 0.08, 0.3, 6);
  stub.translate(0, 0.12, 0);
  sepals.push(stub);
  const calyx = mergeGeometries(sepals.map((g) => g.toNonIndexed()));
  calyx.translate(0, 0.78, 0);

  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.25, 0.28, 0.7, 0.24, 1, 0);
  s.bezierCurveTo(0.7, -0.24, 0.25, -0.28, 0, 0);
  const leaflet = new THREE.ShapeGeometry(s, 8);
  leaflet.rotateX(-Math.PI / 2);
  const lp = leaflet.attributes.position;
  for (let i = 0; i < lp.count; i++) {
    const x = lp.getX(i), z = lp.getZ(i);
    lp.setY(i, -0.22 * x * x + Math.abs(z) * 0.35);
  }
  leaflet.computeVertexNormals();
  shared = { fruit, calyx, leaflet };
  return shared;
}

const mats = {};
export function materials() {
  if (mats.stem) return mats;
  mats.stem = new THREE.MeshStandardMaterial({ color: '#557535', roughness: 0.8 });
  mats.leaf = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.75, side: THREE.DoubleSide });
  mats.calyx = new THREE.MeshStandardMaterial({ color: '#3f6e2a', roughness: 0.7 });
  for (const k of CLASSES) {
    mats[k] = new THREE.MeshStandardMaterial({ color: CLASS_FRUIT[k], roughness: 0.32, metalness: 0.0 });
  }
  return mats;
}

let nextId = 1;

export function buildPlant(rng, opts = {}) {
  const { fruit, calyx, leaflet } = sharedGeo();
  const m = materials();
  const group = new THREE.Group();
  const H = 1.7 + rng() * 0.3;
  const phase = rng() * 10;

  const stemPts = [];
  for (let i = 0; i <= 7; i++) {
    const y = (H * i) / 7;
    stemPts.push(new THREE.Vector3(Math.sin(i * 1.3 + phase) * 0.025, y, Math.cos(i * 0.9 + phase) * 0.02));
  }
  const stem = new THREE.CatmullRomCurve3(stemPts);
  const stemAt = (y) => stem.getPointAt(Math.min(Math.max(y / H, 0), 1));

  const tubes = [new THREE.TubeGeometry(stem, 48, 0.011, 6, false)];
  const leafMatrices = [];
  const leafColors = [];
  const dummy = new THREE.Object3D();
  dummy.rotation.order = 'YZX';
  const leafBase = new THREE.Color('#4d7c36');
  const samples = []; // for point clouds: [x,y,z,kind]

  const nLeaves = Math.floor((H - 0.25) / 0.15);
  for (let k = 0; k < nLeaves; k++) {
    const y = 0.25 + k * 0.15 + rng() * 0.04;
    const a = k * 2.399 + phase;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const L = 0.2 + rng() * 0.14 - (y / H) * 0.06;
    const p0 = stemAt(y);
    const p1 = p0.clone().addScaledVector(dir, L * 0.5).add(new THREE.Vector3(0, 0.05, 0));
    const p2 = p0.clone().addScaledVector(dir, L).add(new THREE.Vector3(0, -0.04, 0));
    const branch = new THREE.QuadraticBezierCurve3(p0, p1, p2);
    tubes.push(new THREE.TubeGeometry(branch, 8, 0.0045, 5, false));
    const ts = [0.32, 0.55, 0.78];
    const yaw = -a;
    const place = (pt, yawOff, size) => {
      dummy.position.copy(pt);
      dummy.rotation.set((rng() - 0.5) * 0.9, yaw + yawOff, -0.25 - rng() * 0.35);
      dummy.scale.setScalar(size);
      dummy.updateMatrix();
      leafMatrices.push(dummy.matrix.clone());
      const c = leafBase.clone().offsetHSL((rng() - 0.5) * 0.03, (rng() - 0.5) * 0.1, (rng() - 0.5) * 0.08);
      leafColors.push(c);
      // sample points over the leaflet surface for the cloud
      for (let s = 0; s < (opts.dense ? 46 : 0); s++) {
        const u = 0.1 + rng() * 0.85, w = (rng() - 0.5) * 0.4 * Math.sin(Math.PI * u);
        const local = new THREE.Vector3(u, -0.22 * u * u, w).applyMatrix4(dummy.matrix);
        samples.push([local.x, local.y, local.z, 0]);
      }
    };
    for (const t of ts) {
      const pt = branch.getPoint(t);
      const s = 0.06 + rng() * 0.03;
      place(pt, 0.95, s);
      place(pt, -0.95, s);
    }
    place(branch.getPoint(1), 0, 0.085);
  }
  for (let y = 0; opts.dense && y < H; y += 0.006) {
    const p = stemAt(y);
    samples.push([p.x, p.y, p.z, 1]);
  }

  const stemMesh = new THREE.Mesh(mergeGeometries(tubes.map((g) => g.toNonIndexed())), m.stem);
  tubes.forEach((g) => g.dispose());
  group.add(stemMesh);

  const leaves = new THREE.InstancedMesh(leaflet, m.leaf, leafMatrices.length);
  leafMatrices.forEach((mx, i) => { leaves.setMatrixAt(i, mx); leaves.setColorAt(i, leafColors[i]); });
  group.add(leaves);

  // trusses of fruit, lower = riper
  const tomatoes = [];
  const nTruss = 3 + (rng() < 0.5 ? 1 : 0);
  for (let t = 0; t < nTruss; t++) {
    const level = t / Math.max(1, nTruss - 1);
    const y = 0.62 + level * 0.72 + (rng() - 0.5) * 0.08;
    const facing = opts.facing ?? Math.PI / 2;
    const a = facing + (rng() - 0.5) * 1.6;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const p0 = stemAt(y);
    const end = p0.clone().addScaledVector(dir, 0.07).add(new THREE.Vector3(0, -0.02, 0));
    const ped = new THREE.QuadraticBezierCurve3(p0, p0.clone().addScaledVector(dir, 0.05).add(new THREE.Vector3(0, 0.02, 0)), end);
    const pedMesh = new THREE.Mesh(new THREE.TubeGeometry(ped, 6, 0.004, 4, false), m.stem);
    group.add(pedMesh);
    const n = 2 + Math.floor(rng() * 4);
    const trussCls = pickClass(rng, level);
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    for (let i = 0; i < n; i++) {
      const r = 0.03 + rng() * 0.012;
      const cls = rng() < 0.75 ? trussCls : pickClass(rng, level);
      const pos = end.clone()
        .addScaledVector(side, (i - (n - 1) / 2) * 0.072 + (rng() - 0.5) * 0.01)
        .addScaledVector(dir, 0.03 + (i % 2) * 0.035)
        .add(new THREE.Vector3(0, -0.05 - (i % 2) * 0.05 - rng() * 0.02, 0));
      const mesh = new THREE.Mesh(fruit, m[cls]);
      mesh.position.copy(pos);
      mesh.scale.setScalar(r);
      mesh.rotation.set((rng() - 0.5) * 0.4, rng() * 6, (rng() - 0.5) * 0.4);
      const cal = new THREE.Mesh(calyx, m.calyx);
      mesh.add(cal);
      group.add(mesh);
      tomatoes.push({ id: nextId++, mesh, cls, r, occl: rng() < 0.2, seed: rng() });
      for (let s = 0; s < (opts.dense ? 40 : 0); s++) {
        const u = rng() * 2 - 1, th = rng() * Math.PI * 2, q = Math.sqrt(1 - u * u);
        samples.push([pos.x + q * Math.cos(th) * r, pos.y + u * r * 0.84, pos.z + q * Math.sin(th) * r, 2, cls]);
      }
    }
  }

  return {
    group, tomatoes, samples, height: H,
    dispose() {
      stemMesh.geometry.dispose();
      group.traverse((o) => { if (o.isMesh && o.geometry !== fruit && o.geometry !== calyx && o.geometry !== leaflet && o !== stemMesh) o.geometry.dispose(); });
      leaves.dispose();
    },
  };
}
