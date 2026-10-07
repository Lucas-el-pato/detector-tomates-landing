// Rectified stereo pair model shared by every scene on the page.
// Frame: origin at the LEFT camera's optical centre, X to the right,
// Y up, Z forward (towards the plant). Units: metres.
export const SENSOR_W = 1280;
export const SENSOR_H = 960;
export const VFOV = 55;   // degrees
export const BASE = 0.12; // metres between optical centres
export const FOCAL = (SENSOR_H / 2) / Math.tan((VFOV / 2) * Math.PI / 180); // ≈ 922 px
export const CX = SENSOR_W / 2;
export const CY = SENSOR_H / 2;

// NDC (three.js Vector3.project output) → sensor pixels (y down)
export const toPx = (v) => ({ u: ((v.x + 1) / 2) * SENSOR_W, v: ((1 - v.y) / 2) * SENSOR_H });

// Triangulate one matched pair: left (uL, vL) and right column uR.
export function triangulate(uL, vL, uR) {
  const d = uL - uR;
  if (d <= 0) return null;
  const Z = (FOCAL * BASE) / d;
  return { X: ((uL - CX) * Z) / FOCAL, Y: ((CY - vL) * Z) / FOCAL, Z, d };
}

export const cm = (m, digits = 1) => (m * 100).toLocaleString('es-PY', { minimumFractionDigits: digits, maximumFractionDigits: digits });
