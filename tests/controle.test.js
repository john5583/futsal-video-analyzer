"use strict";
const test = require("node:test");
const assert = require("node:assert");
const C = require("../src/ai/controle");

const frames = (n, ball) => Array.from({ length: n }, (_v, i) => ({ t: i / 3, ball: ball && i % 2 === 0 ? { x: 1, y: 1 } : null, players: [{}, {}, {}] }));

test("contrôle rapide : les mêmes instants à chaque fois pour une vidéo, d'autres pour une autre vidéo", () => {
  const f = frames(600, true);
  const a = C.echantillon(f, "ballon", "match.mp4", { n: 50 }), b = C.echantillon(f, "ballon", "match.mp4", { n: 50 }), c = C.echantillon(f, "ballon", "autre.mp4", { n: 50 });
  assert.deepStrictEqual(a, b);
  assert.notDeepStrictEqual(a, c);
  assert.strictEqual(a.length, 50);
});

test("contrôle rapide : seulement des images où le programme affiche un ballon, au moins 2 s d'écart, jamais plus que demandé", () => {
  const f = frames(300, true);
  const t = C.echantillon(f, "ballon", "m", { n: 20, ecart: 2 });
  assert.ok(t.length > 0 && t.length <= 20);
  t.forEach((x) => assert.ok(f.find((y) => y.t === x).ball));
  for (let i = 1; i < t.length; i++) assert.ok(t[i] - t[i - 1] >= 2 - 1e-9);
  assert.deepStrictEqual(C.echantillon(frames(30, false), "ballon", "m"), []);        // aucun ballon affiché : rien à contrôler
  assert.deepStrictEqual(C.echantillon(f, "inconnu", "m"), []);
});

test("contrôle rapide : un verdict remplace le précédent du même instant, un verdict inconnu est refusé", () => {
  const l = [];
  assert.ok(C.repondre(l, 12.3, "ballon", "oui")); assert.ok(C.repondre(l, 12.3, "ballon", "non"));
  assert.strictEqual(l.length, 1); assert.strictEqual(C.verdictDe(l, 12.3, "ballon"), "non");
  assert.strictEqual(C.repondre(l, 5, "ballon", "peut-être"), false); assert.strictEqual(C.repondre(l, 5, "zzz", "oui"), false); assert.strictEqual(C.repondre(l, NaN, "ballon", "oui"), false);
  assert.strictEqual(l.length, 1);
});

test("contrôle rapide : le résumé compte oui / non / incertain, l'incertain ne compte ni pour ni contre", () => {
  const l = []; for (let i = 0; i < 10; i++) C.repondre(l, i * 3, "equipes", i < 9 ? "oui" : "non"); C.repondre(l, 99, "equipes", "incertain"); C.repondre(l, 1, "ballon", "oui");
  const r = C.resume(l, "equipes");
  assert.strictEqual(r.oui, 9); assert.strictEqual(r.non, 1); assert.strictEqual(r.incertain, 1); assert.strictEqual(r.n, 10);
  assert.ok(r.wilson.bas < 0.9 && r.wilson.haut > 0.95);
  assert.strictEqual(C.resume([], "ballon").wilson, null);
});
