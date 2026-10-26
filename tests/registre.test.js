"use strict";
const test = require("node:test");
const assert = require("node:assert");
const R = require("../src/ai/registre");

/* Piste synthétique : une personne qui marche de (x0,y0) à (x1,y1) entre t0 et t1, vue 3 fois par seconde. */
function piste(id, team, t0, t1, p0, p1) {
  const fr = [];
  for (let t = t0; t <= t1 + 1e-9; t += 1 / 3) { const k = (t - t0) / Math.max(1e-9, t1 - t0); fr.push({ t: Math.round(t * 1000) / 1000, p: { id, team, x: p0[0] + (p1[0] - p0[0]) * k, y: p0[1] + (p1[1] - p0[1]) * k, b: [100, 200, 140, 200 + 120 + (id % 3)] } }); }
  return fr;
}
function frames(...pistes) {
  const m = new Map();
  pistes.forEach((l) => l.forEach(({ t, p }) => { (m.get(t) || m.set(t, []).get(t)).push(p); }));
  return [...m.keys()].sort((a, b) => a - b).map((t) => ({ t, players: m.get(t) }));
}

test("registre : une piste longue = une personne « sûre » avec son historique", () => {
  const r = R.construire(frames(piste(1, "A", 0, 20, [5, 5], [15, 8])), { L: 40, W: 20 });
  assert.strictEqual(r.personnes.length, 1);
  const p = r.personnes[0];
  assert.strictEqual(p.statut, "sûre"); assert.strictEqual(p.equipe, "A"); assert.deepStrictEqual(p.pistes, [1]);
  assert.strictEqual(p.historique[0].evt, "apparait"); assert.ok(p.presenceS >= 19.9);
  assert.strictEqual(p.tenue, null); assert.strictEqual(p.numero, null);          // rien d'inventé : non lu
});

test("registre : deux morceaux sans ambiguïté sont rattachés (« probable »), l'écart et la distance sont gardés", () => {
  const r = R.construire(frames(piste(1, "A", 0, 10, [5, 5], [10, 5]), piste(2, "A", 14, 25, [11, 5], [20, 9])), { L: 40, W: 20 });
  assert.strictEqual(r.personnes.length, 1);
  assert.deepStrictEqual(r.personnes[0].pistes, [1, 2]); assert.strictEqual(r.personnes[0].statut, "probable");
  assert.ok(r.personnes[0].historique.some((h) => h.evt === "reapparait" && /piste 1/.test(h.source)));
  assert.strictEqual(r.liens.length, 1); assert.ok(r.liens[0].ecartS > 3 && r.liens[0].ecartS < 4.5);
});

test("registre : DEUX débuts possibles pour une fin = aucun rattachement, personnes « non identifiées » (jamais une fausse étiquette)", () => {
  const r = R.construire(frames(piste(1, "A", 0, 10, [5, 5], [10, 5]), piste(2, "A", 13, 25, [11, 6], [20, 9]), piste(3, "A", 13, 25, [11, 4], [20, 2])), { L: 40, W: 20 });
  assert.strictEqual(r.personnes.length, 3);
  assert.strictEqual(r.liens.length, 0); assert.ok(r.ambigus.length >= 2);
  r.personnes.filter((p) => p.pistes[0] !== 1 || true).forEach((p) => assert.strictEqual(p.statut, "non identifiée", p.id));
  assert.ok(r.personnes.every((p) => /plusieurs rattachements/.test(p.raison)));
});

test("registre : jamais d'équipes mélangées, de chevauchement dans le temps, de vitesse impossible ou de bribe", () => {
  const eq = R.construire(frames(piste(1, "A", 0, 10, [5, 5], [10, 5]), piste(2, "B", 12, 25, [11, 5], [20, 9])), {});
  assert.strictEqual(eq.personnes.length, 2); assert.strictEqual(eq.liens.length, 0);
  const chev = R.construire(frames(piste(1, "A", 0, 10, [5, 5], [10, 5]), piste(2, "A", 8, 25, [10, 5], [20, 9])), {});
  assert.strictEqual(chev.liens.length, 0);
  const loin = R.construire(frames(piste(1, "A", 0, 10, [2, 5], [3, 5]), piste(2, "A", 12, 25, [35, 5], [36, 9])), {});
  assert.strictEqual(loin.liens.length, 0);        // 32 m en 2 s
  const bribe = R.construire(frames(piste(1, "A", 0, 10, [5, 5], [10, 5]), piste(2, "A", 11, 11.9, [10, 5], [10, 6])), {});
  assert.strictEqual(bribe.personnes.length, 1);
});

test("registre : une personne vue moins de 6 s est « non identifiée » ; le bord du terrain est noté comme entrée / sortie", () => {
  const r = R.construire(frames(piste(1, "A", 0, 5, [0.4, 5], [8, 5]), piste(2, "B", 0, 30, [10, 10], [12, 10])), { L: 40, W: 20 });
  const court = r.personnes.find((p) => p.equipe === "A");
  assert.strictEqual(court.statut, "non identifiée"); assert.ok(/moins de 6 s/.test(court.raison));
  assert.strictEqual(court.historique[0].source, "bord du terrain");
  const long = r.personnes.find((p) => p.equipe === "B");
  assert.strictEqual(long.historique[0].source, "au milieu du terrain");
});

test("registre : taille relative = hauteur du cadre / hauteur médiane de l'équipe, résumé compté", () => {
  const r = R.construire(frames(piste(1, "A", 0, 20, [5, 5], [6, 5]), piste(2, "A", 0, 20, [8, 10], [9, 10]), piste(3, "A", 0, 20, [8, 15], [9, 15])), {});
  r.personnes.forEach((p) => assert.ok(p.tailleRelative > 0.9 && p.tailleRelative < 1.1));
  assert.deepStrictEqual(r.resume, { total: 3, sures: 3, probables: 0, nonIdentifiees: 0 });
});
