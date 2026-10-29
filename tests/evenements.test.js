"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const EV = require("../src/ai/evenements");

const suite = (t0, t1, f, pas) => { const o = []; for (let t = t0; t <= t1 + 1e-9; t += pas || 0.33) o.push({ t: Math.round(t * 100) / 100, ball: f(t) }); return o; };
const types = (r) => r.map((e) => e.type);

test("événements : balle qui franchit une ligne de touche = sortie de touche (une seule fois, pas à chaque image)", () => {
  const fr = suite(0, 4, (t) => (t < 2 ? { x: 20, y: 10 - t * 4 } : { x: 20, y: -2 }));
  const r = EV.evenements(fr);
  assert.deepEqual(types(r), ["sortie_touche"]);
  assert.ok(r[0].t >= 2 && r[0].t < 3);
});

test("événements : balle qui entre entre les poteaux = but, attribué à l'équipe qui attaque ce côté ; hors des poteaux = sortie de fond, jamais but", () => {
  const entre = suite(0, 3, (t) => (t < 1.5 ? { x: 36, y: 10 } : { x: 41.5, y: 10.5 }));
  assert.deepEqual(types(EV.evenements(entre, { dirAt: () => 1 })), ["but"]);
  assert.equal(EV.evenements(entre, { dirAt: () => 1 })[0].equipe, "A");
  assert.equal(EV.evenements(entre, { dirAt: () => -1 })[0].equipe, "B");
  const cote = suite(0, 3, (t) => (t < 1.5 ? { x: 36, y: 4 } : { x: 41.5, y: 4 }));
  assert.deepEqual(types(EV.evenements(cote)), ["sortie_fond"]);
});

test("événements : ballon immobile ≥ 2 s = phase arrêtée ; dans un coin après une sortie = corner ; sur le point de penalty = penalty", () => {
  assert.deepEqual(types(EV.evenements(suite(0, 4, () => ({ x: 15, y: 8 })))), ["phase_arretee"]);
  const corner = suite(0, 3, (t) => (t < 1 ? { x: 40.3, y: 2 - (t * 2) } : { x: 41.4, y: -0.7 })).concat(suite(5, 9, () => ({ x: 39.6, y: 0.4 })));
  assert.ok(types(EV.evenements(corner)).includes("corner"));
  assert.deepEqual(types(EV.evenements(suite(0, 4, () => ({ x: 34.1, y: 10.2 })))), ["penalty"]);
});

test("événements : rien n'est deviné — pas de ballon vu, trous de plus de 1,5 s, un seul point dehors, ballon en mouvement : aucun événement", () => {
  assert.deepEqual(EV.evenements(suite(0, 5, () => null)), []);
  const trou = [{ t: 0, ball: { x: 20, y: 10 } }, { t: 4, ball: { x: 20, y: -3 } }, { t: 8, ball: { x: 20, y: 10 } }];
  assert.deepEqual(EV.evenements(trou), []);
  const un = suite(0, 3, (t) => (Math.abs(t - 1.65) < 0.2 ? { x: 20, y: -1.5 } : { x: 20, y: 10 }));
  assert.deepEqual(EV.evenements(un), [], "un seul point dehors = reflet ou ballon en l'air, pas une sortie");
  assert.deepEqual(EV.evenements(suite(0, 6, (t) => ({ x: 5 + t * 4, y: 10 }))), [], "ballon en mouvement dans le jeu");
  assert.deepEqual(EV.evenements(null), []);
});

test("événements : un ballon immobile hors du terrain (après une sortie, dans le but) n'est pas une phase arrêtée", () => {
  const sortie = suite(0, 3, (t) => (t < 1 ? { x: 20, y: 10 - t * 12 } : { x: 20, y: -2 })).concat(suite(3.3, 8, () => ({ x: 20, y: -2 })));
  assert.deepEqual(types(EV.evenements(sortie)), ["sortie_touche"]);
});
