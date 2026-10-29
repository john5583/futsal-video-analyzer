"use strict";
const test = require("node:test");
const assert = require("node:assert");
const SB = require("../src/ai/suiviBallon");

const W = 640, H = 360;
function rnd(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/* Image grise synthétique : fond bruité (parquet), balles = disques clairs avec un bord sombre. */
function image(balles, seed) {
  const g = new Uint8Array(W * H), r = rnd(seed || 1);
  for (let i = 0; i < g.length; i++) g[i] = 90 + Math.floor(r() * 25);
  (balles || []).forEach(([bx, by]) => {
    for (let y = Math.floor(by) - 7; y <= Math.ceil(by) + 7; y++) for (let x = Math.floor(bx) - 7; x <= Math.ceil(bx) + 7; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const d = Math.hypot(x - bx, y - by);
      g[y * W + x] = d <= 4 ? 235 : d <= 5.5 ? 40 : g[y * W + x];
    }
  });
  return { w: W, h: H, g };
}

test("suivi du ballon : suit un ballon qui bouge de 12 px par image, erreur de moins de 1,5 px", () => {
  let pos = [100, 100], prev = image([pos], 1);
  for (let i = 1; i <= 25; i++) {
    const vrai = [100 + 12 * i, 100 + 5 * i], cur = image([vrai], 100 + i);        // le fond change à chaque image
    const r = SB.suivre(prev, cur, pos);
    assert.strictEqual(r.perdu, false, "perdu à l'image " + i + " : " + r.raison + " " + r.conf);
    assert.ok(Math.hypot(r.u - vrai[0], r.v - vrai[1]) < 1.5, "écart " + Math.hypot(r.u - vrai[0], r.v - vrai[1]) + " à l'image " + i);
    pos = [r.u, r.v]; prev = cur;
  }
});

test("suivi du ballon : s'arrête (perdu) quand le ballon disparaît, au lieu d'inventer une position", () => {
  const prev = image([[200, 150]], 1), cur = image([], 2);
  const r = SB.suivre(prev, cur, [200, 150]);
  assert.strictEqual(r.perdu, true); assert.ok(r.conf < SB.SEUIL);
});

test("suivi du ballon : deux ballons identiques proches = confiance réduite (ambigu)", () => {
  const prev = image([[200, 150]], 1), cur = image([[210, 150], [190, 150]], 2);
  const r = SB.suivre(prev, cur, [200, 150]);
  assert.ok(r.conf <= 0.8 * 1.0001 + 0.0001 && (r.perdu === true || r.conf < 0.8), "ambiguïté non détectée : " + JSON.stringify(r));
});

test("suivi du ballon : un modèle sans contraste ou au bord de l'image n'est pas suivi", () => {
  const plat = { w: W, h: H, g: new Uint8Array(W * H).fill(100) };
  assert.strictEqual(SB.suivre(plat, plat, [200, 150]).perdu, true);
  assert.strictEqual(SB.suivre(image([[3, 3]], 1), image([[3, 3]], 2), [3, 3]).perdu, true);
});

test("suivi du ballon : le résumé compte clics et images suivies et le temps par image", () => {
  const s = SB.resume({ secondes: 60, pts: [[0, 1, 1, 1, "clic"], [33, 2, 2, 0.9, "suivi"], [66, 3, 3, 0.9, "suivi"], [100, 4, 4, 1, "clic"]] });
  assert.deepStrictEqual(s, { images: 4, clics: 2, suivies: 2, secondes: 60, parImage: 15 });
  assert.strictEqual(SB.resume(null).parImage, null);
});

test("suivi du ballon : sur 40 images à pas fractionnaire l'erreur ne s'accumule pas (recalage sur le clic de John)", () => {
  const pas = 9.6, vrai = (n) => [100 + pas * n, 100 + 0.4 * pas * n];
  const run = (avecAncre) => {
    let pos = vrai(0), prev = image([pos], 1); const ancre = { img: prev, pos }; let pire = 0;
    for (let n = 1; n <= 40; n++) {
      const cur = image([vrai(n)], 100 + n), r = SB.suivre(prev, cur, pos, avecAncre ? { ancre } : {});
      assert.strictEqual(r.perdu, false);
      pire = Math.max(pire, Math.hypot(r.u - vrai(n)[0], r.v - vrai(n)[1])); pos = [r.u, r.v]; prev = cur;
    }
    return pire;
  };
  assert.ok(run(true) < 1, "avec recalage : pire écart " + run(true));
  assert.ok(run(false) < 6, "sans recalage l'écart reste modéré : " + run(false));
});
