"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../src/anim/montage");
const HG = require("../src/ai/homography");

/* Scène synthétique : sol lisse (dégradé + grandes dalles), caméra inclinée, un « joueur » (rectangle rouge debout) qui traverse le terrain. */
const W = 320, H = 180;
const groundColor = (X, Y) => { const tile = (Math.floor(X / 2) + Math.floor(Y / 2)) & 1; return [60 + tile * 25 + X * 1.2, 90 + tile * 20 + Y * 2, 140 + tile * 15]; };
function camera(shift) {   // sol (mètres) -> pixel
  const src = [[0, 0], [40, 0], [40, 20], [0, 20]], dst = [[40 + shift, 40], [280 + shift, 40], [310 + shift, 170], [10 + shift, 170]];
  return HG.solve(src, dst);
}
function render(shift, player) {
  const G = camera(shift), Gi = HG.invert(G), data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const g = HG.apply(Gi, x + 0.5, y + 0.5), c = (g[0] > -3 && g[0] < 43 && g[1] > -3 && g[1] < 23) ? groundColor(g[0], g[1]) : [20, 20, 20], o = (y * W + x) * 4;
    data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
  }
  let box = null;
  if (player) {   // rectangle rouge debout : pied en (X, Y), hauteur 28 px, largeur 12 px
    const f = HG.apply(G, player[0], player[1]); box = [Math.round(f[0] - 6), Math.round(f[1] - 28), Math.round(f[0] + 6), Math.round(f[1])];
    for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) { const o = (y * W + x) * 4; data[o] = 220; data[o + 1] = 30; data[o + 2] = 30; }
  }
  return { img: { data, width: W, height: H }, G, box };
}

test("fond propre : le sol reconstruit derrière un joueur qui bouge est (presque) le vrai sol", () => {
  const frames = []; for (let k = 0; k < 12; k++) frames.push(render(k * 1.5, [5 + k * 2.6, 6 + (k % 4)]));
  const plate = M.buildPlate(frames.map((f) => ({ data: f.img.data, width: W, height: H, G: f.G, boxes: [[f.box[0] - 4, f.box[1] - 4, f.box[2] + 4, f.box[3] + 4]] })));
  assert.ok(plate.coverage > 0.2, "couverture du sol : " + plate.coverage);
  // image 5 : on efface le joueur et on compare au vrai sol (rendu sans joueur)
  const f = frames[5], truth = render(5 * 1.5, null).img, mask = new Uint8Array(W * H);
  for (let y = f.box[1]; y <= f.box[3]; y++) for (let x = f.box[0]; x <= f.box[2]; x++) mask[y * W + x] = 1;
  const Pm = HG.invert(f.G), img = { data: new Uint8ClampedArray(f.img.data), width: W, height: H };
  const r = M.erase(img, M.dilate(mask, W, H, 2), Pm, plate);
  assert.ok(r.filled > 200 && r.missed <= r.filled * 0.05, "remplis " + r.filled + " / manqués " + r.missed);
  let err = 0, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask[y * W + x]) { const o = (y * W + x) * 4; err += Math.abs(img.data[o] - truth.data[o]) + Math.abs(img.data[o + 1] - truth.data[o + 1]) + Math.abs(img.data[o + 2] - truth.data[o + 2]); n += 3; }
  assert.ok(err / n < 12, "écart moyen au vrai sol : " + (err / n).toFixed(1) + " / 255");
  // plus aucune trace de rouge du joueur
  let rouge = 0; for (let y = f.box[1]; y <= f.box[3]; y++) for (let x = f.box[0]; x <= f.box[2]; x++) { const o = (y * W + x) * 4; if (img.data[o] > 190 && img.data[o + 1] < 80) rouge++; }
  assert.ok(rouge < 5, "pixels rouges restants : " + rouge);
});

test("fond propre : une homographie de signe opposé (même projection) donne le même fond", () => {
  const frames = []; for (let k = 0; k < 6; k++) frames.push(render(k * 2, [8 + k * 4, 8]));
  const mk = (neg) => M.buildPlate(frames.map((f) => ({ data: f.img.data, width: W, height: H, G: neg ? f.G.map((v) => -v) : f.G, boxes: [[f.box[0] - 4, f.box[1] - 4, f.box[2] + 4, f.box[3] + 4]] })));
  const a = mk(false), b = mk(true);
  assert.ok(a.coverage > 0.1 && Math.abs(a.coverage - b.coverage) < 1e-9, "couverture " + a.coverage + " / " + b.coverage);
  assert.deepStrictEqual(Array.from(a.rgba.slice(0, 4000)), Array.from(b.rgba.slice(0, 4000)));
});

test("fond propre : un point du sol toujours caché reste invalide (jamais inventé)", () => {
  const frames = []; for (let k = 0; k < 6; k++) frames.push(render(0, [20, 10]));   // le joueur ne bouge pas : son emplacement n'est jamais vu
  const plate = M.buildPlate(frames.map((f) => ({ data: f.img.data, width: W, height: H, G: f.G, boxes: [[f.box[0] - 3, f.box[1] - 3, f.box[2] + 3, f.box[3] + 3]] })));
  const f = frames[0], c = HG.apply(f.G, 20, 10), gx = Math.floor((20 - plate.gx0) * plate.ppm), gy = Math.floor((10 - plate.gy0) * plate.ppm);
  assert.strictEqual(plate.valid[gy * plate.tw + gx], 0, "le point sous le joueur ne doit pas être inventé (pixel " + c.map(Math.round) + ")");
});

test("fond propre : les points jamais vus prennent le plus proche point vu, et sont marqués comme approchés", () => {
  const frames = []; for (let k = 0; k < 6; k++) frames.push(render(0, [20, 10]));
  const mk = (fill) => M.buildPlate(frames.map((f) => ({ data: f.img.data, width: W, height: H, G: f.G, boxes: [[f.box[0] - 3, f.box[1] - 3, f.box[2] + 3, f.box[3] + 3]] })), { fill });
  const a = mk(0), b = mk(1.5), gx = Math.floor((20 - b.gx0) * b.ppm), gy = Math.floor((10 - b.gy0) * b.ppm), i = gy * b.tw + gx;
  assert.strictEqual(a.valid[i], 0);
  assert.strictEqual(b.valid[i], 1); assert.strictEqual(b.approx[i], 1, "marqué approché");
  assert.ok(b.rgba[i * 4 + 3] === 255 && b.rgba[i * 4] > 0);
  const sum = (p) => p.approx.reduce((x, y) => x + y, 0); assert.ok(sum(b) > 0 && sum(a) === 0);
});

test("échelle locale, chronologie et position corrigée", () => {
  const G = camera(0), near = M.groundScale(G, 20, 18), far = M.groundScale(G, 20, 2);
  assert.ok(near > far * 1.2, "plus grand près de la caméra : " + near.toFixed(1) + " > " + far.toFixed(1));
  const tl = M.timeline(10);
  assert.deepStrictEqual([tl.t0, tl.tEnd, tl.t1], [10, 11.4, 12.6]);
  const R = [10, 5], D = [3, -1];
  assert.deepStrictEqual(M.corrected(R, D, tl, 9), R, "avant l'erreur : rien ne change");
  assert.deepStrictEqual(M.corrected(R, D, tl, 11.4), [13, 4], "à la fin du déplacement : course réelle + décalage complet");
  const mid = M.corrected(R, D, tl, 10.7); assert.ok(mid[0] > 10 && mid[0] < 13, "déplacement progressif");
});

test("masque : translation et gonflement", () => {
  const m = { x0: 5, y0: 5, w: 2, h: 2, data: new Uint8Array([1, 1, 1, 1]) };
  const full = M.fullMask(m, 3, 2, 20, 20, 0), pts = []; for (let i = 0; i < full.length; i++) if (full[i]) pts.push([i % 20, (i / 20) | 0]);
  assert.deepStrictEqual(pts, [[8, 7], [9, 7], [8, 8], [9, 8]]);
  const big = M.fullMask(m, 3, 2, 20, 20, 1); assert.strictEqual(big.reduce((a, b) => a + b, 0), 16);
});
