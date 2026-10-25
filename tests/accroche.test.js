/* Accrochage des repères de calibrage sur le croisement de lignes, et erreur de chaque repère. */
const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../src/ai/accroche");
const HG = require("../src/ai/homography");

let seed = 11;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += rnd(); return (s - 3) * 1.4; };
function img(W, H, f, bruit) {
  const d = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) d[y * W + x] = Math.max(0, Math.min(255, f(x, y) + gauss() * bruit));
  return { data: d, width: W, height: H };
}
const croix = (cx, cy, ang, contraste) => (x, y) => {
  const c = Math.cos(ang), s = Math.sin(ang), u = (x - cx) * c + (y - cy) * s, v = -(x - cx) * s + (y - cy) * c;
  return 60 + contraste * ((Math.abs(u) < 1.5 || Math.abs(v) < 1.5) ? 1 : 0);
};

test("un clic décalé de quelques pixels est ramené sur le croisement (précision sous le pixel à 1 pixel près en médiane)", () => {
  const avant = [], apres = [];
  for (let k = 0; k < 100; k++) {
    const cx = 100 + rnd() * 2 - 1, cy = 80 + rnd() * 2 - 1, im = img(200, 160, croix(cx, cy, 0.3 + rnd() * 0.5, 80), 4);
    const px = cx + (rnd() - 0.5) * 7, py = cy + (rnd() - 0.5) * 7, r = A.snap(im, px, py);
    if (!r.ok) continue;
    avant.push(Math.hypot(px - cx, py - cy)); apres.push(Math.hypot(r.x - cx, r.y - cy));
  }
  assert.ok(apres.length >= 90, "croisements nets retrouvés : " + apres.length + " / 100");
  const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
  assert.ok(med(apres) < 1.2, "médiane après " + med(apres));
  assert.ok(med(apres) < med(avant) / 2, "avant " + med(avant) + " après " + med(apres));
});

test("jamais deviné : zone uniforme, bruit, une seule ligne, deux lignes parallèles, bord de l'image = le clic n'est pas déplacé", () => {
  const cas = [
    ["uniforme", img(200, 160, () => 90, 5)],
    ["bruit fort", img(200, 160, () => 90, 12)],
    ["une ligne", img(200, 160, (x, y) => 60 + 80 * (Math.abs(y - 80) < 1.5 ? 1 : 0), 4)],
    ["deux lignes parallèles", img(200, 160, (x, y) => 60 + 80 * ((Math.abs(y - 75) < 1.5 || Math.abs(y - 87) < 1.5) ? 1 : 0), 4)]
  ];
  cas.forEach(([nom, im]) => {
    for (let k = 0; k < 20; k++) {
      const x = 95 + rnd() * 10, y = 76 + rnd() * 8, r = A.snap(im, x, y);
      assert.equal(r.ok, false, nom); assert.equal(r.x, x); assert.equal(r.y, y);
    }
  });
  const r = A.snap(img(200, 160, croix(5, 5, 0.3, 80), 2), 6, 6);
  assert.equal(r.ok, false); assert.match(r.raison, /bord/);
});

test("deux croisements voisins : le plus proche du clic est choisi", () => {
  const f = (x, y) => Math.max(croix(90, 80, 0, 90)(x, y), croix(112, 80, 0, 90)(x, y));
  const im = img(200, 160, f, 3);
  assert.ok(Math.abs(A.snap(im, 93, 82).x - 90) < 2);
  assert.ok(Math.abs(A.snap(im, 109, 78).x - 112) < 2);
});

test("erreur de chaque repère : pas de valeur quand les autres repères sont presque alignés (4 points sur la ligne de but)", () => {
  const lm = Object.fromEntries(HG.landmarks(40, 20).map((l) => [l.id, l]));
  const ids = ["corner_tl", "corner_bl", "l_area_top", "l_area_bottom", "l_front_top", "l_front_bottom"];
  const inv = HG.invert([0.02, 0.003, 0.1, 0.001, 0.025, 0.2, 0.00001, 0.00002, 1]);
  const pts = ids.map((id) => { const q = HG.apply(inv, lm[id].x, lm[id].y); return { id, ix: q[0], iy: q[1] }; });
  const e = A.pointErrors(pts, lm);
  assert.equal(e.find((x) => x.id === "l_front_top").err, null);       // reste : 4 points alignés + 1
  assert.equal(e.find((x) => x.id === "corner_tl").err !== null, true);
});

test("erreur de chaque repère : un repère déplacé de 0,8 m ressort nettement ; moins de 5 repères = non mesurable", () => {
  const lm = Object.fromEntries(HG.landmarks(40, 20).map((l) => [l.id, l]));
  const ids = ["corner_tl", "corner_tr", "corner_bl", "corner_br", "center", "mid_top"];
  const Htrue = [0.02, 0.003, 0.1, 0.001, 0.025, 0.2, 0.00001, 0.00002, 1];
  const inv = HG.invert(Htrue);
  const pts = ids.map((id) => { const q = HG.apply(inv, lm[id].x, lm[id].y); return { id, ix: q[0], iy: q[1] }; });
  const ok = A.pointErrors(pts, lm);
  assert.ok(ok.every((e) => e.err < 0.01), JSON.stringify(ok));
  const faux = pts.map((p) => (p.id === "center" ? { id: p.id, ix: p.ix + 40, iy: p.iy } : p));
  const e = A.pointErrors(faux, lm);
  assert.ok(e.find((x) => x.id === "center").err > 0.2);
  assert.deepEqual(e.filter((x) => x.suspect).map((x) => x.id), ["center"]);        // le repère fautif est désigné, pas les coins qu'il fausse
  assert.ok(ok.every((x) => !x.suspect));
  assert.ok(A.pointErrors(pts.slice(0, 4), lm).every((x) => x.err === null));
});
