/* Appariement de points (orb.js) : retrouve le mouvement entre deux images éloignées, refuse quand les images n'ont rien en commun,
   ignore le décor fixe de la caméra (rambarde), respecte le masque des joueurs. */
const test = require("node:test");
const assert = require("node:assert/strict");
const O = require("../src/ai/orb");
const HG = require("../src/ai/homography");

const W = 480, H = 270;
const hash = (a, b, s) => { let h = Math.imul(a * 73856093 ^ b * 19349663 ^ s * 83492791, 2654435761); h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
/* Scène de blocs de 9 px de luminosités au hasard (beaucoup de coins) + quelques lignes ; (u, v) en coordonnées de la scène. */
function scene(u, v, seed) {
  let c = 40 + 180 * hash(Math.floor(u / 9), Math.floor(v / 9), seed);
  if (Math.abs(((u + 300) % 70) - 35) < 1.2) c = 250;
  if (Math.abs(((v + 90) % 55) - 27) < 1.2) c = 15;
  return c;
}
/* Image obtenue en regardant la scène avec la transformation T (image -> scène). */
function view(T, seed, still) {
  const d = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (still && y > H * 0.72) { d[y * W + x] = 60 + 140 * hash(Math.floor(x / 7), Math.floor(y / 7), 999); continue; }     // décor fixe de la caméra
    const p = HG.apply(T, x, y); d[y * W + x] = scene(p[0], p[1], seed);
  }
  return { data: d, w: W, h: H };
}
const rot = (deg, s, tx, ty) => { const a = (deg * Math.PI) / 180; return [s * Math.cos(a), -s * Math.sin(a), tx, s * Math.sin(a), s * Math.cos(a), ty, 0, 0, 1]; };
const err = (Hest, Htrue) => Math.max.apply(null, [[0, 0], [W, 0], [0, H], [W, H], [W / 2, H / 2]].map((p) => { const a = HG.apply(Hest, p[0], p[1]), b = HG.apply(Htrue, p[0], p[1]); return Math.hypot(a[0] - b[0], a[1] - b[1]); }));

test("deux vues de la même scène (décalage, zoom 0,8, rotation 4°) : la transformation est retrouvée", () => {
  const Ta = rot(0, 1, 0, 0), Tb = rot(4, 1.25, 90, 30);         // la vue B voit la scène 1,25 fois plus grosse en coordonnées scène -> image 0,8
  const a = O.describe(view(Ta, 1), null), b = O.describe(view(Tb, 1), null);
  const r = O.estimate(a, b);
  assert.ok(r.ok, "recalage accepté : " + (r.reason || "") + " (" + r.inliers + "/" + r.total + ")");
  // vrai H : A -> B = inverse(Tb) composé avec Ta
  const Htrue = HG.mul3(HG.invert(Tb), Ta);
  assert.ok(err(r.H, Htrue) < 3, "erreur de " + err(r.H, Htrue).toFixed(2) + " px aux coins");
  assert.ok(r.inliers >= 25);
});

test("deux scènes sans rien en commun : refusé (rien n'est deviné)", () => {
  const a = O.describe(view(rot(0, 1, 0, 0), 1), null), b = O.describe(view(rot(0, 1, 0, 0), 2), null);
  const r = O.estimate(a, b);
  assert.equal(r.ok, false);
});

test("le décor fixe de la caméra (rambarde) ne fait pas croire que la caméra n'a pas bougé", () => {
  const Ta = rot(0, 1, 0, 0), Tb = rot(0, 1, 70, 20);
  const a = O.describe(view(Ta, 1, true), null), b = O.describe(view(Tb, 1, true), null);
  const r = O.estimate(a, b);
  assert.ok(r.ok, r.reason);
  assert.ok(err(r.H, HG.mul3(HG.invert(Tb), Ta)) < 3, "H retrouvée malgré le décor fixe");
  assert.ok(Math.hypot(r.H[2], r.H[5]) > 40, "pas la transformation nulle");
});

test("les points du masque (joueurs) ne servent pas", () => {
  const img = view(rot(0, 1, 0, 0), 1), mask = new Uint8Array(W * H).fill(1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W / 2; x++) mask[y * W + x] = 0;
  const d = O.describe(img, mask);
  assert.ok(d.n > 40);
  for (let i = 0; i < d.n; i++) assert.ok(d.x[i] >= W / 2 - 2, "point hors masque : x = " + d.x[i]);
});

test("image sans détails : aucun point, refusé sans erreur", () => {
  const flat = { data: new Float32Array(W * H).fill(120), w: W, h: H };
  const d = O.describe(flat, null);
  assert.equal(d.n, 0);
  assert.equal(O.estimate(d, O.describe(view(rot(0, 1, 0, 0), 1), null)).ok, false);
});
