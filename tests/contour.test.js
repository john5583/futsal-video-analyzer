/* Contour de silhouette : tracé extérieur, simplification, point dans la silhouette ; rien d'inventé sur un masque vide ou invalide. */
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/ai/contour");

function mk(x0, y0, w, h, f) { const data = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = f(x, y) ? 1 : 0; return { x0, y0, w, h, data }; }
const area = (p) => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + (a[0] * b[1] - b[0] * a[1]); }, 0)) / 2;

test("rectangle : le contour est le rectangle, dans le repère de l'image", () => {
  const m = mk(100, 50, 10, 20, () => true);
  const t = C.trace(m);
  assert.equal(area(t), 200);
  const xs = t.map((p) => p[0]), ys = t.map((p) => p[1]);
  assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [100, 110, 50, 70]);
  const s = C.outline(m);
  assert.equal(s.length, 4, "un rectangle se résume à 4 coins");
});

test("forme en L : l'aire du contour est celle du masque", () => {
  const m = mk(0, 0, 12, 12, (x, y) => x < 4 || y >= 8);
  const n = m.data.reduce((a, b) => a + b, 0);
  assert.equal(area(C.trace(m)), n);
});

test("trou intérieur (anneau) : seul le contour extérieur est gardé", () => {
  const m = mk(0, 0, 14, 14, (x, y) => !(x >= 5 && x < 9 && y >= 5 && y < 9));
  assert.equal(area(C.trace(m)), 14 * 14);
});

test("disque : le contour simplifié a bien moins de points que le contour brut et garde la même aire à 5 % près", () => {
  const m = mk(0, 0, 60, 60, (x, y) => (x - 30) ** 2 + (y - 30) ** 2 <= 25 * 25);
  const raw = C.trace(m), s = C.outline(m, 0.8);
  assert.ok(s.length < raw.length / 2, raw.length + " -> " + s.length);
  assert.ok(Math.abs(area(s) - area(raw)) / area(raw) < 0.05);
});

test("masque vide ou invalide : aucun contour inventé", () => {
  assert.equal(C.trace(mk(0, 0, 5, 5, () => false)), null);
  assert.equal(C.trace(null), null);
  assert.equal(C.trace({ x0: 0, y0: 0, w: 3, h: 3, data: new Uint8Array(2) }), null);
  assert.equal(C.trace({ x0: NaN, y0: 0, w: 3, h: 3, data: new Uint8Array(9) }), null);
  assert.equal(C.outline(null), null);
});

test("point dans la silhouette : strict, le ballon posé à côté d'un pied n'est pas dans la personne", () => {
  const person = mk(100, 100, 30, 60, () => true);               // 100..130 x 100..160
  assert.equal(C.inside(person, 115, 130), true);
  assert.equal(C.inside(person, 131, 130), false, "juste à droite");
  assert.equal(C.inside(person, 115, 99.5), false, "juste au-dessus");
  assert.equal(C.inside(null, 1, 1), false);
  const items = [{ id: 1, mask: person }, { id: 2, mask: mk(110, 120, 8, 8, () => true) }];
  assert.equal(C.pick(items, 112, 124).id, 2, "personnes qui se chevauchent : la plus petite silhouette");
  assert.equal(C.pick(items, 105, 105).id, 1);
  assert.equal(C.pick(items, 300, 300), null);
});
