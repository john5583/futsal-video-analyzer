/* Scène synthétique pour tester le repérage du terrain : sol bleu, lignes noires, but rayé (rouge/blanc par défaut ; opts.goalColors, opts.floor), vue depuis une caméra connue. */
"use strict";
const CF = require("../../src/ai/court-fit");
const HG = require("../../src/ai/homography");
const cellHash = (a, b) => { let h = Math.imul((a * 73856093) ^ (b * 19349663), 2654435761); h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; return (h >>> 0) / 4294967296; };

function render(pose, w, h, L, W, opts) {
  const o = Object.assign({ goalAtEnd: false, lines: true, lineHalf: 0.08, floor: [70, 110, 160], goalColors: [[200, 40, 40], [235, 235, 235]] }, opts || {});
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { data[i * 4] = o.floor[0]; data[i * 4 + 1] = o.floor[1]; data[i * 4 + 2] = o.floor[2]; data[i * 4 + 3] = 255; }
  const B = CF.cameraBasis(pose), f = CF.focalPx(w, pose[5]);
  if (o.texture) {            // sol à damier irrégulier de 30 cm (comme un parquet ou un revêtement : les points de la scène bougent avec le terrain)
    const src = [], dst = [];
    for (let x = -10; x <= 50; x += 4) for (let y = -6; y <= 26; y += 4) { const q = CF.project(B, f, w, h, x, y, 0); if (q && q.u > -w && q.u < 2 * w && q.v > -h && q.v < 2 * h) { src.push([q.u, q.v]); dst.push([x, y]); } }
    if (src.length >= 8) {
      const Hi = HG.solve(src, dst);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = HG.apply(Hi, x, y), k = (cellHash(Math.floor(c[0] / 0.3), Math.floor(c[1] / 0.3)) - 0.5) * 60, i = (y * w + x) * 4;
        data[i] += k; data[i + 1] += k; data[i + 2] += k;
      }
    }
  }
  const disk = (u, v, r, c) => {
    for (let y = Math.floor(v - r); y <= Math.ceil(v + r); y++) for (let x = Math.floor(u - r); x <= Math.ceil(u + r); x++) {
      if (x < 0 || y < 0 || x >= w || y >= h || Math.hypot(x - u, y - v) > r) continue;
      const i = (y * w + x) * 4; data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2];
    }
  };
  if (o.lines) {
    CF.modelPoints(L, W, { step: 0.03 }).forEach((p) => {
      const q = CF.project(B, f, w, h, p[0], p[1], 0);
      if (q) disk(q.u, q.v, Math.max(1.1, o.lineHalf * f / q.z), [15, 15, 15]);
    });
  }
  if (o.circle) for (let a = 0; a < 360; a += 0.4) { const r = a * Math.PI / 180, q = CF.project(B, f, w, h, L / 2 + 3 * Math.cos(r), W / 2 + 3 * Math.sin(r), 0); if (q) disk(q.u, q.v, Math.max(1.1, o.lineHalf * f / q.z), [15, 15, 15]); }
  const xg = o.goalAtEnd ? L : 0, cy = W / 2;
  [cy - 1.5, cy + 1.5].forEach((y) => {
    for (let z = 0; z <= 2; z += 0.01) {
      const q = CF.project(B, f, w, h, xg, y, z);
      if (q) disk(q.u, q.v, Math.max(1.3, 0.06 * f / q.z), Math.floor(z / 0.2) % 2 ? o.goalColors[1] : o.goalColors[0]);
    }
  });
  for (let y = cy - 1.5; y <= cy + 1.5; y += 0.01) {
    const q = CF.project(B, f, w, h, xg, y, 2);
    if (q) disk(q.u, q.v, Math.max(1.3, 0.06 * f / q.z), Math.floor((y - cy + 1.5) / 0.2) % 2 ? o.goalColors[1] : o.goalColors[0]);
  }
  return { data, width: w, height: h };
}

module.exports = { render };
