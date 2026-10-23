"use strict";
/* Corrections animées des règles de l'analyse v2 : chaque nouvelle règle dessine le joueur concerné et, quand c'est possible, une correction. */
const test = require("node:test");
const assert = require("node:assert/strict");
const O = require("../src/ai/overlay");

const P = (id, team, x, y) => ({ id, team, x, y });
const fr = (t) => ({ t, players: [P(1, "GKA", 1.5, 10), P(2, "A", 10, 6), P(3, "A", 12, 14), P(4, "A", 18, 10), P(5, "A", 22, 10), P(12, "B", 28, 6), P(14, "B", 26, 10)], ball: { x: 10.4, y: 6 } });
const frames = [fr(0), fr(0.4), fr(0.8), fr(1.2), fr(1.6), fr(2)];

test("perte inutile et relance risquée : même dessin que la perte (joueur, ballon perdu, passe sûre)", () => {
  ["perte_inutile", "relance_risquee"].forEach((type) => {
    const o = O.buildOverlay({ t: 1, type, joueur: 2 }, frames, { L: 40, W: 20 });
    assert.ok(o.ok && o.kind === "perte", type + " : " + o.kind);
    assert.ok(o.correction && o.correction.lines.length >= 1, type + " : une passe sûre est proposée");
  });
});
test("dribble excessif : le joueur concerné est marqué, le partenaire libre est montré avec la passe", () => {
  const o = O.buildOverlay({ t: 1, type: "dribble_excessif", joueur: 2 }, frames, { L: 40, W: 20 });
  assert.ok(o.ok && o.items.some((i) => i.id === 2 && /trop longtemps/.test(i.label)));
  assert.ok(o.items.some((i) => i.label === "Libre") && o.correction.lines.length === 1);
});
test("absence de mouvement : le joueur immobile est marqué et un appel est proposé", () => {
  const o = O.buildOverlay({ t: 1, type: "absence_mouvement", joueur: 5 }, frames, { L: 40, W: 20 });
  assert.ok(o.items.some((i) => i.id === 5 && i.label === "Immobile"));
  assert.ok(o.correction && o.correction.ghost && o.correction.ghost.id === 5);
});
test("transition lente et supériorité : solutions devant / partenaires à combiner", () => {
  const a = O.buildOverlay({ t: 1, type: "transition_off_lente" }, frames, { L: 40, W: 20 });
  assert.ok(a.ok && a.items.some((i) => i.label === "Libre devant") && a.correction.lines.length >= 1);
  const b = O.buildOverlay({ t: 1, type: "superiorite_non_convertie" }, frames, { L: 40, W: 20 });
  assert.ok(b.ok && b.items.some((i) => i.label === "Supériorité"));
});
test("règle des 4 secondes : le gardien est marqué", () => {
  const o = O.buildOverlay({ t: 1, type: "regle_4s", joueur: 1 }, frames, { L: 40, W: 20 });
  assert.ok(o.ok && o.kind === "gardien" && o.items.some((i) => i.id === 1 && /4 s/.test(i.label)));
});
test("jamais de dessin inventé : joueur concerné absent -> rien n'est dessiné pour lui, pas d'erreur", () => {
  const o = O.buildOverlay({ t: 1, type: "absence_mouvement", joueur: 99 }, frames, { L: 40, W: 20 });
  assert.ok(!o.items.some((i) => i.id === 99));
});
