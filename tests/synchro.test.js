"use strict";
const test = require("node:test");
const assert = require("node:assert");
const S = require("../src/ai/synchro");

const fr = (t, ps, ball) => ({ t, players: ps.map(([id, x, y]) => ({ id, team: "A", x, y, b: [100 + x * 10, 200, 150 + x * 10, 400] })), ball: ball || null });

test("synchro : à mi-chemin entre deux images d'analyse, la position est au milieu (pas l'image la plus proche)", () => {
  const f = [fr(0, [[1, 0, 0]], { x: 0, y: 0 }), fr(0.3333, [[1, 2, 1]], { x: 6, y: 2 })];
  const r = S.frameAt(f, 0.16665);
  assert.ok(Math.abs(r.players[0].x - 1) < 1e-6 && Math.abs(r.players[0].y - 0.5) < 1e-6);
  assert.ok(Math.abs(r.ball.x - 3) < 1e-6);
  assert.strictEqual(r.t, 0.16665); assert.strictEqual(r.interpolee, true);
  assert.ok(Math.abs(r.players[0].b[0] - 110) < 1e-6, "le cadre suit aussi (110 = milieu de 100 et 120)");
});

test("synchro : exactement sur une image d'analyse = ses positions ; l'ancienne méthode se trompait de jusqu'à une demi-image d'analyse", () => {
  const f = []; for (let i = 0; i < 30; i++) f.push(fr(i / 3, [[1, i, 0]]));
  assert.strictEqual(S.frameAt(f, 2).players[0].x, 6);
  let max = 0, somme = 0, n = 0;
  for (let t = 0.5; t < 9; t += 1 / 30) { const e = S.ecartAncien(f, t); max = Math.max(max, e); somme += e; n++; }
  assert.ok(max > 0.15 && max <= 1 / 6 + 1e-9, "l'ancienne méthode retarde jusqu'à " + max.toFixed(3) + " s");
  assert.ok(somme / n > 0.07, "en moyenne " + (somme / n).toFixed(3) + " s");
});

test("synchro : personne présente d'un seul côté = montrée seulement près de son image ; rien d'inventé entre deux images trop éloignées", () => {
  const f = [fr(0, [[1, 0, 0], [2, 5, 5]]), fr(0.3333, [[1, 1, 0]])];
  const tot = S.frameAt(f, 0.05).players.map((p) => p.id), tard = S.frameAt(f, 0.3).players.map((p) => p.id);
  assert.deepStrictEqual(tot.sort(), [1, 2]); assert.deepStrictEqual(tard, [1]);
  const loin = [fr(0, [[1, 0, 0]]), fr(5, [[1, 3, 0]])];
  assert.strictEqual(S.frameAt(loin, 2.5), null, "5 s sans image d'analyse : rien");
  assert.ok(S.frameAt(loin, 0.1), "tout près d'une image d'analyse : on la garde");
  assert.strictEqual(S.frameAt([], 1), null); assert.strictEqual(S.frameAt(f, NaN), null);
});

test("synchro : un saut de plus de 6 m (piste recollée) n'est pas interpolé : pas de joueur qui glisse à travers le terrain", () => {
  const f = [fr(0, [[1, 2, 2]]), fr(0.3333, [[1, 30, 10]])];
  const r = S.frameAt(f, 0.1);
  assert.strictEqual(r.players.length, 1); assert.strictEqual(r.players[0].x, 2);
  assert.strictEqual(S.frameAt(f, 0.25).players[0].x, 30);
});
