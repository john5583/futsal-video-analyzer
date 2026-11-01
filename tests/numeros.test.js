"use strict";
const test = require("node:test");
const assert = require("node:assert");
const N = require("../src/ai/numeros");

const P = (id, equipe, debut, fin, pistes, statut) => ({ id, equipe, pistes, intervalles: [[debut, fin]], statut: statut || "sûre" });

test("numéros : le gardien est le 1, puis les joueurs se suivent par ordre d'apparition, par équipe", () => {
  const r = N.attribuer([
    P("P1", "A", 0, 800, [11]), P("P2", "GKA", 2, 800, [12]), P("P3", "A", 1, 800, [13]), P("P4", "A", 3, 800, [14]),
    P("P5", "B", 0, 800, [21]), P("P6", "GKB", 5, 800, [22]), P("P7", "B", 4, 800, [23])
  ]);
  assert.deepStrictEqual([r.parPiste[12], r.parPiste[11], r.parPiste[13], r.parPiste[14]], [1, 2, 3, 4], "mon équipe : gardien 1, puis ordre d'apparition (P1 à 0 s, P3 à 1 s, P4 à 3 s)");
  assert.deepStrictEqual([r.parPiste[22], r.parPiste[21], r.parPiste[23]], [1, 2, 3], "adversaires : numérotés à part, gardien 1");
});

test("numéros : un remplaçant prend le numéro suivant, il n'hérite pas du numéro de celui qui sort", () => {
  const sort = P("P8", "A", 0, 300, [31]), entre = P("P9", "A", 305, 800, [32]), autres = [P("P1", "GKA", 0, 800, [1]), P("P2", "A", 0, 800, [2]), P("P3", "A", 0, 800, [3])];
  const r = N.attribuer([sort, entre].concat(autres));
  assert.ok(r.parPiste[32] > r.parPiste[31], "le remplaçant a un numéro plus grand");
  assert.notStrictEqual(r.parPiste[32], r.parPiste[31]);
  assert.strictEqual(r.parPiste[1], 1, "gardien = 1");
});

test("numéros : toutes les pistes d'une même personne portent le même numéro tout au long de la vidéo", () => {
  const r = N.attribuer([P("P1", "GKA", 0, 800, [5]), { id: "P2", equipe: "A", pistes: [7, 19, 42], intervalles: [[0, 100], [110, 400], [410, 800]], statut: "probable" }]);
  assert.deepStrictEqual([r.parPiste[7], r.parPiste[19], r.parPiste[42]], [2, 2, 2]);
});

test("numéros : une personne non identifiée, un arbitre ou un inconnu n'ont pas de numéro (jamais une fausse étiquette)", () => {
  const r = N.attribuer([P("P1", "A", 0, 800, [1]), P("P2", "A", 0, 4, [2], "non identifiée"), P("P3", "REF", 0, 800, [3]), P("P4", "UNK", 0, 800, [4])]);
  assert.strictEqual(r.parPiste[1], 1, "sans gardien identifié, la numérotation commence à 1");
  assert.strictEqual(r.parPiste[2], undefined);
  assert.strictEqual(r.parPiste[3], undefined);
  assert.strictEqual(r.parPiste[4], undefined);
  assert.deepStrictEqual(r.effectifs, { A: 1, B: 0 });
});

test("numéros : aucune fiche, aucun numéro, aucune erreur", () => {
  assert.deepStrictEqual(N.attribuer([]).parPiste, {});
  assert.deepStrictEqual(N.attribuer(null).parPiste, {});
});

test("vue du dessus : seul le numéro de la personne identifiée est écrit, et l'erreur choisie met ses joueurs en évidence (les autres sont atténués)", () => {
  const E = require("../src/anim/engine");
  const frame = { players: [{ id: 473, team: "B", x: 5, y: 5 }, { id: 12, team: "A", x: 8, y: 8 }, { id: 99, team: "A", x: 20, y: 10 }] };
  const num = (p) => (p.id === 12 ? 2 : p.id === 99 ? null : 7);
  const sans = E.liveOps(frame, { showIds: true, numero: num });
  const textes = sans.filter((o) => o.k === "text").map((o) => o.s);
  assert.deepStrictEqual(textes.sort(), ["2", "7"], "un chiffre par personne identifiée ; rien pour la personne sans numéro (99), jamais l'identifiant de piste");
  const avec = E.liveOps(frame, { showIds: true, numero: num, focus: new Set([12]) });
  const cercles = avec.filter((o) => o.k === "circle" && o.r >= 0.7 && o.fill);
  assert.strictEqual(cercles.filter((o) => o.alpha === 0.25).length, 2, "les deux personnes non visées sont atténuées");
  assert.ok(cercles.some((o) => o.stroke === "#f97316"), "la personne visée est entourée en orange");
  assert.deepStrictEqual(avec.filter((o) => o.k === "text").map((o) => o.s), ["2"], "seul le numéro de la personne visée reste écrit");
});

test("numéros : si une équipe a trop de fiches (identité trop fragmentée), aucun numéro pour elle, et le refus est signalé", () => {
  const fiches = []; for (let i = 0; i < 12; i++) fiches.push(P("A" + i, "A", i, 800, [100 + i]));
  fiches.push(P("B0", "GKB", 0, 800, [200]), P("B1", "B", 1, 800, [201]));
  const r = N.attribuer(fiches);
  assert.strictEqual(r.parPiste[100], undefined, "12 fiches pour mon équipe : aucun numéro");
  assert.deepStrictEqual(r.refus, { A: 12 });
  assert.strictEqual(r.parPiste[200], 1, "l'autre équipe, saine, est numérotée");
  assert.strictEqual(r.parPiste[201], 2);
});
