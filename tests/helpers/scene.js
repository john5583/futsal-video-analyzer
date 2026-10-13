/* Scène synthétique pour tester le repérage du terrain : sol bleu, lignes noires, but rayé rouge/blanc, vue depuis une caméra connue. */
"use strict";
const CF = require("../../src/ai/court-fit");

function render(pose, w, h, L, W, opts) {
  const o = Object.assign({ goalAtEnd: false, lines: true }, opts || {});
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { data[i * 4] = 70; data[i * 4 + 1] = 110; data[i * 4 + 2] = 160; data[i * 4 + 3] = 255; }
  const B = CF.cameraBasis(pose), f = CF.focalPx(w, pose[5]);
  const disk = (u, v, r, c) => {
    for (let y = Math.floor(v - r); y <= Math.ceil(v + r); y++) for (let x = Math.floor(u - r); x <= Math.ceil(u + r); x++) {
      if (x < 0 || y < 0 || x >= w || y >= h || Math.hypot(x - u, y - v) > r) continue;
      const i = (y * w + x) * 4; data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2];
    }
  };
  if (o.lines) {
    CF.modelPoints(L, W, { step: 0.03 }).forEach((p) => {
      const q = CF.project(B, f, w, h, p[0], p[1], 0);
      if (q) disk(q.u, q.v, Math.max(1.1, 0.08 * f / q.z), [15, 15, 15]);
    });
  }
  const xg = o.goalAtEnd ? L : 0, cy = W / 2;
  [cy - 1.5, cy + 1.5].forEach((y) => {
    for (let z = 0; z <= 2; z += 0.01) {
      const q = CF.project(B, f, w, h, xg, y, z);
      if (q) disk(q.u, q.v, Math.max(1.3, 0.06 * f / q.z), Math.floor(z / 0.2) % 2 ? [235, 235, 235] : [200, 40, 40]);
    }
  });
  for (let y = cy - 1.5; y <= cy + 1.5; y += 0.01) {
    const q = CF.project(B, f, w, h, xg, y, 2);
    if (q) disk(q.u, q.v, Math.max(1.3, 0.06 * f / q.z), Math.floor((y - cy + 1.5) / 0.2) % 2 ? [235, 235, 235] : [200, 40, 40]);
  }
  return { data, width: w, height: h };
}

module.exports = { render };
