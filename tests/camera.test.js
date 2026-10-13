const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/ai/camera");
const HG = require("../src/ai/homography");

/* Image de salle synthétique : bruit multi-échelles (comme une vraie scène) + quelques lignes. */
function texture(w, h, seed) {
  let a = seed >>> 0;
  const rnd = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  const data = new Float32Array(w * h).fill(120);
  for (const cell of [6, 12, 24, 48]) {
    const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2, grid = new Float32Array(gw * gh);
    for (let i = 0; i < grid.length; i++) grid[i] = (rnd() - 0.5) * (cell < 12 ? 50 : 80);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
      data[y * w + x] += (grid[y0 * gw + x0] * (1 - fx) + grid[y0 * gw + x0 + 1] * fx) * (1 - fy) + (grid[(y0 + 1) * gw + x0] * (1 - fx) + grid[(y0 + 1) * gw + x0 + 1] * fx) * fy;
    }
  }
  for (let n = 0; n < 12; n++) {
    const x0 = rnd() * w, y0 = rnd() * h, ang = rnd() * Math.PI, len = 60 + rnd() * 160;
    for (let t = 0; t < len; t++) { const x = Math.round(x0 + Math.cos(ang) * t), y = Math.round(y0 + Math.sin(ang) * t); if (x >= 0 && x < w - 1 && y >= 0 && y < h - 1) { data[y * w + x] += 90; data[y * w + x + 1] += 60; } }
  }
  return { data, w, h };
}

/* Image courante = image de référence vue à travers l'homographie M (référence -> courante). */
function warp(src, M) {
  const Mi = HG.invert(M), out = new Float32Array(src.w * src.h);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const p = HG.apply(Mi, x, y);
    const sx = p[0], sy = p[1];
    if (sx < 0 || sy < 0 || sx > src.w - 1 || sy > src.h - 1) { out[y * src.w + x] = 60; continue; }
    const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(src.w - 1, x0 + 1), y1 = Math.min(src.h - 1, y0 + 1), fx = sx - x0, fy = sy - y0;
    out[y * src.w + x] = (src.data[y0 * src.w + x0] * (1 - fx) + src.data[y0 * src.w + x1] * fx) * (1 - fy) + (src.data[y1 * src.w + x0] * (1 - fx) + src.data[y1 * src.w + x1] * fx) * fy;
  }
  return { data: out, w: src.w, h: src.h };
}

function frame(img, boxes) {
  const mask = new Uint8Array(img.w * img.h).fill(1);
  (boxes || []).forEach((b) => { for (let y = b[1]; y < b[3]; y++) for (let x = b[0]; x < b[2]; x++) mask[y * img.w + x] = 0; });
  return { pyr: C.buildPyramid({ data: img.data, w: img.w, h: img.h }, 4), mask };
}

function motionError(H, M, w, h) {
  let worst = 0;
  for (const [x, y] of [[40, 30], [w - 40, 30], [w - 40, h - 30], [40, h - 30], [w / 2, h / 2]]) {
    const a = HG.apply(H, x, y), b = HG.apply(M, x, y);
    worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1]));
  }
  return worst;
}

const W = 400, Hh = 300;
const ref = texture(W, Hh, 7);

test("suivi : translation, rotation légère et zoom retrouvés (erreur < 1 px)", () => {
  const cases = {
    translation: [1, 0, 14, 0, 1, -9, 0, 0, 1],
    rotation: (() => { const a = 0.04, c = Math.cos(a), s = Math.sin(a); return [c, -s, 200 - c * 200 + s * 150, s, c, 150 - s * 200 - c * 150, 0, 0, 1]; })(),
    zoom: [1.06, 0, -10, 0, 1.06, -8, 0, 0, 1]
  };
  for (const [name, M] of Object.entries(cases)) {
    const r = C.estimateMotion(frame(ref), frame(warp(ref, M)), null, null);
    assert.ok(r.ok, name + " : " + r.reason);
    assert.ok(motionError(r.H, M, W, Hh) < 1, name + " erreur " + motionError(r.H, M, W, Hh).toFixed(2));
    assert.ok(r.ratio > 0.7, name + " ratio " + r.ratio);
  }
});

test("suivi : grand déplacement (40 px) grâce à la pyramide", () => {
  const M = [1, 0, 38, 0, 1, 22, 0, 0, 1];
  const r = C.estimateMotion(frame(ref), frame(warp(ref, M)), null, null);
  assert.ok(r.ok, r.reason);
  assert.ok(motionError(r.H, M, W, Hh) < 1.5);
});

test("suivi : les joueurs qui bougent sont ignorés grâce au masque", () => {
  const M = [1, 0, 10, 0, 1, 6, 0, 0, 1];
  const a = { data: ref.data.slice(), w: W, h: Hh }, b = warp(ref, M);
  const boxesA = [[100, 80, 130, 160], [200, 60, 230, 140]];
  // deux « joueurs » : rectangles sombres qui se déplacent différemment du décor
  const paint = (img, bx, dx) => { for (let y = bx[1]; y < bx[3]; y++) for (let x = bx[0] + dx; x < bx[2] + dx; x++) if (x >= 0 && x < W) img.data[y * W + x] = 15; };
  boxesA.forEach((bx) => paint(a, bx, 0));
  const boxesB = boxesA.map((bx) => [bx[0] + 10 + 25, bx[1] + 6, bx[2] + 10 + 25, bx[3] + 6]);
  boxesB.forEach((bx) => paint(b, [bx[0], bx[1], bx[2], bx[3]], 0));
  const withMask = C.estimateMotion(frame(a, boxesA), frame(b, boxesB), null, null);
  const maskPrev = frame(a, boxesA).mask, maskCur = frame(b, boxesB).mask;
  const r = C.estimateMotion(frame(a), frame(b), maskPrev, maskCur);
  assert.ok(r.ok, r.reason);
  assert.ok(motionError(r.H, M, W, Hh) < 1.5, "erreur " + motionError(r.H, M, W, Hh).toFixed(2));
  assert.ok(withMask.inliers > 0);
});

test("suivi : image sans détails ou totalement différente refusée", () => {
  const flat = { data: new Float32Array(W * Hh).fill(100), w: W, h: Hh };
  const r1 = C.estimateMotion(frame(flat), frame(flat), null, null);
  assert.equal(r1.ok, false);
  const other = texture(W, Hh, 999);
  const r2 = C.estimateMotion(frame(ref), frame(other), null, null);
  assert.equal(r2.ok, false);
});

test("composition : le terrain suit la caméra (même point du terrain avant et après un déplacement)", () => {
  // homographie image -> terrain à l'instant de référence
  const src = [[40, 30], [280, 30], [300, 220], [20, 220]], dst = [[0, 0], [40, 0], [40, 20], [0, 20]];
  const H0 = HG.solve(src, dst);
  // la caméra se déplace : point image courant p' correspond au point de référence p = M^-1 p'
  const M = [1.02, 0.01, 12, -0.01, 1.02, -7, 0, 0, 1]; // référence -> courante
  const Hcur = HG.mul3(H0, HG.invert(M));          // courante -> terrain
  const pRef = [150, 120], pCur = HG.apply(M, pRef[0], pRef[1]);
  const a = HG.apply(H0, pRef[0], pRef[1]), b = HG.apply(Hcur, pCur[0], pCur[1]);
  assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6);
});

test("conversion pixels réduits -> natifs", () => {
  const Hs = [1, 0, 5, 0, 1, 3, 0, 0, 1]; // translation de (5,3) px réduits, facteur 0,25
  const Hn = C.toNative(Hs, 0.25);
  assert.ok(Math.abs(Hn[2] - 20) < 1e-9 && Math.abs(Hn[5] - 12) < 1e-9);
  assert.equal(C.plausible([1.2, 0, 0, 0, 1.2, 0, 0, 0, 1]), true);
  assert.equal(C.plausible([0.2, 0, 0, 0, 0.2, 0, 0, 0, 1]), false);
  assert.equal(C.plausible([1, 0, 0, 0, 1, 0, 0.5, 0, 1]), false);
});

test("points caractéristiques : un objet très contrasté (tableau d'affichage) ne masque pas le reste de l'image", () => {
  const im = texture(480, 270, 11);
  // tableau d'affichage : bloc très lumineux avec un bord net
  for (let y = 20; y < 50; y++) for (let x = 200; x < 260; x++) im.data[y * im.w + x] = 255 * 20; // contraste énorme
  const gray = new Uint8ClampedArray(im.w * im.h * 4);
  for (let i = 0; i < im.w * im.h; i++) { const v = Math.max(0, Math.min(255, im.data[i] / (im.data[i] > 5000 ? 20 : 1))); gray[i * 4] = gray[i * 4 + 1] = gray[i * 4 + 2] = v; gray[i * 4 + 3] = 255; }
  const prep = C.prepare(gray, im.w, im.h, [], 4);
  const pts = C.goodFeatures(prep.pyr[0], 320, 7, prep.mask);
  assert.ok(pts.length >= 150, "points trouvés : " + pts.length);
  // répartition : chacun des quatre quarts de l'image contient des points
  const quarters = [0, 0, 0, 0];
  pts.forEach(([x, y]) => { quarters[(x >= im.w / 2 ? 1 : 0) + (y >= im.h / 2 ? 2 : 0)]++; });
  assert.ok(quarters.every((n) => n >= 20), "répartition " + quarters.join(","));
});
