"use strict";
/* Silhouette fiable ou cercle au sol : jamais de cadre, jamais de découpe douteuse. */
const test = require("node:test");
const assert = require("node:assert/strict");
const SIL = require("../src/ai/silhouette");
const HG = require("../src/ai/homography");

/* Masque en forme de personne (tête + corps + jambes) dans la boîte b ; pleine = rectangle presque plein. */
function person(b, opt) {
  const o = Object.assign({ iou: 0.95, stab: 0.95 }, opt || {});
  const x0 = Math.floor(b[0]), y0 = Math.floor(b[1]), w = Math.ceil(b[2] - b[0]), h = Math.ceil(b[3] - b[1]);
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fy = y / h, fx = x / w;
    const on = fy < 0.15 ? Math.abs(fx - 0.5) < 0.15 : fy < 0.6 ? fx > 0.1 && fx < 0.9 : (fx > 0.2 && fx < 0.45) || (fx > 0.55 && fx < 0.8);
    if (on) data[y * w + x] = 1;
  }
  let area = 0; data.forEach((v) => { area += v; });
  return { x0, y0, w, h, data, area, iou: o.iou, stab: o.stab };
}
const B = [100, 100, 140, 220];

test("une personne bien découpée est acceptée", () => {
  const r = SIL.evaluate(person(B), B);
  assert.equal(r.ok, true, r.why);
});
test("sans qualité annoncée ou instable : refusée, avec la raison", () => {
  assert.equal(SIL.evaluate(person(B, { iou: undefined }), B).ok, false);
  assert.match(SIL.evaluate(person(B, { iou: 0.6 }), B).why, /pas assez nette/);
  assert.match(SIL.evaluate(person(B, { stab: 0.7 }), B).why, /instable/);
  assert.equal(SIL.evaluate(null, B).ok, false);
});
test("forme trop large pour une personne (banc, sac) : refusée", () => {
  const wide = [100, 100, 220, 190];
  const m = person(wide); m.data.fill(1); m.area = m.data.length;
  assert.equal(SIL.evaluate(m, wide).ok, false);
});
test("une silhouette qui recouvre le cœur d'une autre personne est refusée ; la voisine reste jugée à part", () => {
  const A = [100, 100, 140, 220], C = [110, 105, 150, 225];
  const mA = person(A); mA.data.fill(1); mA.area = mA.data.length;      // A a « mangé » la zone de C
  const mC = person(C);
  const r = SIL.evaluateAll([{ id: 1, box: A, mask: mA }, { id: 2, box: C, mask: mC }]);
  assert.equal(r[0].ok, false);
  assert.equal(r[1].ok, false, "elle aussi est collée à une autre personne");
});
test("une personne dont un voisin est collé est refusée ; isolée, elle est acceptée", () => {
  const far = [300, 100, 340, 220];
  const r = SIL.evaluateAll([{ id: 1, box: B, mask: person(B) }, { id: 2, box: far, mask: person(far) }]);
  assert.deepEqual(r.map((x) => x.ok), [true, true]);
  const near = [142, 100, 182, 220];
  const r2 = SIL.evaluateAll([{ id: 1, box: B, mask: person(B) }, { id: 2, box: near, mask: person(near) }]);
  assert.deepEqual(r2.map((x) => x.ok), [false, false]);
  assert.match(r2[0].why, /collée/);
});
test("un voisin sans découpe compte quand même (petite personne, bord de l'image)", () => {
  const near = [141, 150, 161, 220];
  const r = SIL.evaluateAll([{ id: 1, box: B, mask: person(B) }, { id: 2, box: near, mask: null }]);
  assert.equal(r[0].ok, false);
  assert.equal(r[1].ok, false);
});
test("points négatifs : torse et tête d'un voisin proche ; d'un voisin plus loin seulement la tête, hors de la bande centrale", () => {
  const me = [100, 100, 140, 220];
  const nearer = [120, 110, 160, 240];          // pieds plus bas : plus près de la caméra
  const items = [{ box: me }, { box: nearer }];
  const n1 = SIL.negativesFor(0, items);
  assert.ok(n1.length >= 1 && n1.every((p) => p[0] >= me[0] && p[0] <= me[2] && p[1] >= me[1] && p[1] <= me[3]));
  const behind = [125, 60, 160, 180];           // pieds plus haut : derrière
  const n2 = SIL.negativesFor(0, [{ box: me }, { box: behind }]);
  assert.ok(n2.length <= 1, "au plus sa tête");
  const behindCentered = [105, 60, 135, 180];   // tête dans la bande centrale : pourrait tomber sur la personne
  assert.equal(SIL.negativesFor(0, [{ box: me }, { box: behindCentered }]).length, 0);
  assert.equal(SIL.negativesFor(0, [{ box: me }, { box: [400, 100, 440, 220] }]).length, 0, "voisin loin : rien");
});
test("cercle au sol : rien si les pieds sont hors de l'image, ellipse sous les pieds sans terrain", () => {
  assert.equal(SIL.groundCircle({ b: [100, 500, 150, 995] }, 1000, 1000, null, null), null);
  assert.equal(SIL.groundCircle({ b: [100, 500, 150, 600] }, 0, 1000, null, null), null);
  const pts = SIL.groundCircle({ b: [400, 300, 440, 700], x: 5, y: 5 }, 1000, 1000, null, null);
  assert.equal(pts.length, 24);
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  assert.ok(Math.abs(cy - 700) < 30, "centrée près des pieds (y=700) : " + cy);
  assert.ok(pts.every((p) => p[0] > 380 && p[0] < 460), "largeur de l'ordre de la personne");
});
test("cercle au sol projeté avec le terrain, mais seulement s'il tombe sous les pieds détectés", () => {
  // terrain de 40 x 20 m vu de face : image 1000 x 500, 25 px par m
  const H = HG.solve([[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5], [0.25, 0.75]], [[0, 0], [40, 0], [40, 20], [0, 20], [20, 10], [10, 15]]);
  const Hi = HG.invert(H), apply = (m, x, y) => { const q = HG.apply(m, x, y); return [q[0] * 1000, q[1] * 500]; };
  const p = { x: 20, y: 10, b: [490, 400, 510, 500] };      // boîte en millièmes : bas à y = 250 px, au milieu ; pieds en (500, 250) px
  const good = SIL.groundCircle(p, 1000, 500, Hi, apply);
  assert.equal(good.length, 24);
  const wx = Math.max(...good.map((q) => q[0])) - Math.min(...good.map((q) => q[0]));
  assert.ok(Math.abs(wx - 2 * SIL.RADIUS * 25) < 3, "rayon de 0,35 m = 8,75 px ; largeur " + wx);
  const wrong = SIL.groundCircle({ x: 5, y: 5, b: p.b }, 1000, 500, Hi, apply);      // projection loin des pieds détectés : on ne la croit pas
  const cx = wrong.reduce((s, q) => s + q[0], 0) / wrong.length;
  assert.ok(Math.abs(cx - 500) < 20, "retombe sur l'ellipse sous les pieds (x = " + cx + ")");
});
test("recouvrement de deux masques", () => {
  const a = person(B), b = person([100, 100, 140, 220]);
  assert.equal(SIL.maskIoU(a, b), 1);
  assert.ok(SIL.maskIoU(a, person([110, 100, 150, 220])) < 0.9);
  assert.equal(SIL.maskIoU(a, null), 0);
});
