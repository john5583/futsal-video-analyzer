/* Zoom de la vidéo : le point sous le curseur ne bouge pas, jamais de bord vide, le clic reste exact à tout zoom. */
const test = require("node:test");
const assert = require("node:assert/strict");
const Z = require("../src/ai/zoom");

const W = 800, H = 450, base = { s: 0.5, x: 0, y: 0, vw: 1600, vh: 900 };
const view = (r, u, v) => [u * r.s + r.x, v * r.s + r.y];
const back = (r, ox, oy) => [(ox - r.x) / r.s, (oy - r.y) / r.s];
const near = (a, b, e) => Math.abs(a - b) <= (e || 1e-6);

test("zoom : le point de la vidéo sous le curseur reste sous le curseur", () => {
  let z = { k: 1, tx: 0, ty: 0 };
  const m = [300, 200];
  const u0 = back(Z.apply(base, z), m[0], m[1]);
  z = Z.zoomAt(z, m[0], m[1], 2, W, H);
  assert.equal(z.k, 2);
  const u1 = back(Z.apply(base, z), m[0], m[1]);
  assert.ok(near(u0[0], u1[0]) && near(u0[1], u1[1]), "avant " + u0 + " après " + u1);
});

test("zoom : bornes (1 à 8) et retour à 1 = vue d'origine", () => {
  let z = { k: 1, tx: 0, ty: 0 };
  for (let i = 0; i < 10; i++) z = Z.zoomAt(z, 400, 225, 2, W, H);
  assert.equal(z.k, Z.K_MAX);
  for (let i = 0; i < 10; i++) z = Z.zoomAt(z, 400, 225, 0.5, W, H);
  assert.deepEqual(z, { k: 1, tx: 0, ty: 0 });
  assert.equal(Z.clampK(NaN), 1);
  assert.equal(Z.clampK(99), Z.K_MAX);
  assert.equal(Z.clampK(0.2), 1);
});

test("déplacement : la vidéo agrandie couvre toujours la boîte, même avec une valeur absurde", () => {
  const a = Z.clampPan(4, 500, 500, W, H);
  assert.deepEqual([a.tx, a.ty], [0, 0], "pas de bord vide en haut à gauche");
  const b = Z.clampPan(4, -99999, -99999, W, H);
  assert.deepEqual([b.tx, b.ty], [W - 4 * W, H - 4 * H], "pas de bord vide en bas à droite");
  const c = Z.clampPan(4, NaN, undefined, W, H);
  assert.ok(isFinite(c.tx) && isFinite(c.ty));
});

test("centrer : le point demandé est au milieu de la boîte et l'aller-retour écran <-> vidéo est exact", () => {
  const u = 700, v = 400;
  const z = Z.centerOn(base, u, v, 4, W, H), r = Z.apply(base, z);
  const p = view(r, u, v);
  assert.ok(near(p[0], W / 2, 1e-6) && near(p[1], H / 2, 1e-6), "point au centre : " + p);
  const q = back(r, p[0], p[1]);
  assert.ok(near(q[0], u) && near(q[1], v), "retour exact");
  // près d'un bord : la vue est contrainte, le point reste visible dans la boîte
  const edge = Z.centerOn(base, 5, 5, 4, W, H), pe = view(Z.apply(base, edge), 5, 5);
  assert.ok(pe[0] >= 0 && pe[0] <= W && pe[1] >= 0 && pe[1] <= H);
});

test("zoom : un clic reste exact à tout zoom (écran -> vidéo -> écran)", () => {
  let z = { k: 1, tx: 0, ty: 0 };
  [[100, 80, 2], [650, 400, 1.5], [20, 30, 2], [790, 440, 0.5]].forEach(([mx, my, f]) => {
    z = Z.zoomAt(z, mx, my, f, W, H);
    const r = Z.apply(base, z), uv = back(r, 333, 222), s = view(r, uv[0], uv[1]);
    assert.ok(near(s[0], 333) && near(s[1], 222), "k=" + z.k);
  });
});
