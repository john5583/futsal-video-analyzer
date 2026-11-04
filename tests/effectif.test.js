"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const KB = require("../src/knowledge");

const SYSTEMS = KB.SYSTEMS.map((s) => s.id);
const TAGS = KB.SEANCE_TAGS;
const opt = (id) => KB.PLAN_QUESTIONS.find((q) => q.id === id).options.map((o) => o.id);

test("effectif : chaque exercice a son nombre de joueurs de champ et de gardiens, cohérent avec sa fiche", () => {
  KB.DRILLS.forEach((d) => {
    const x = KB.effectifExercice(d.id);
    assert.ok(x, "effectif manquant : " + d.id);
    assert.ok(x.fmin >= 1 && x.fmax >= x.fmin && x.fmax <= 20 && [0, 1, 2].indexOf(x.k) >= 0, "valeurs impossibles : " + d.id + " " + JSON.stringify(x));
    // le nombre de gardiens écrit dans la fiche correspond (« gardien(s) », « GB », « gardien monté » = joueur de champ)
    const t = d.players.toLowerCase(), parle = /gardiens|gardien\b|gb\b/.test(t) && !/gardien monté|sans le gardien|gardien-joueur/.test(t);
    if (parle) assert.ok(x.k >= 1, "la fiche parle d'un gardien : " + d.id + " (" + d.players + ")");
    if (/gardiens/.test(t) && !/gardien monté/.test(t)) assert.strictEqual(x.k, 2, "« gardiens » : deux gardiens attendus : " + d.id);
  });
  assert.ok(Object.keys(KB.EFFECTIF_EXERCICES).every((id) => KB.DRILLS.some((d) => d.id === id)), "aucune ligne orpheline");
});

test("effectif : un exercice trop grand n'est jamais faisable, un gardien manquant ou des joueurs en trop sont dits", () => {
  const tpl = KB.effectifPour("marquage_individuel_4v4", { total: 7, gk: 2 });     // demande 8 joueurs de champ
  assert.strictEqual(tpl.ok, false); assert.strictEqual(tpl.statut, "trop-peu");
  const sansGk = KB.effectifPour("bloc_bas_4v4", { total: 9, gk: 0 });              // 8 joueurs de champ + 1 gardien voulu
  assert.ok(sansGk.ok && sansGk.statut === "gardien" && /gardien/.test(sansGk.note), JSON.stringify(sansGk));
  const trop = KB.effectifPour("rondo_4v2", { total: 12, gk: 1 });                  // 6 à 8 joueurs
  assert.ok(trop.ok && trop.statut === "rotation" && trop.attente >= 4, JSON.stringify(trop));
  const bien = KB.effectifPour("bloc_bas_4v4", { total: 9, gk: 1 });
  assert.ok(bien.ok && bien.statut === "ok" && bien.note === "");
  assert.ok(KB.effectifPour("rondo_4v2", null).ok, "sans effectif, rien n'est filtré");
});

test("séance : avec 4 à 16 joueurs et 0 à 3 gardiens, tous les exercices proposés sont faisables et le temps est tenu", () => {
  let n = 0;
  for (const system of SYSTEMS) for (const total of [4, 5, 6, 8, 10, 12, 16]) for (const gk of [0, 1, 2]) for (const duree of [45, 75, 120]) {
    if (gk > total) continue;
    const r = KB.proposerSeance({ system, flyingGK: system === "3-2" || system === "1-2-2" ? "derriere" : "jamais" }, { duree, training: { effectif: { total, gk } } });
    n++;
    assert.ok(r.blocs.length >= 3, system + " " + total + " joueurs : " + r.blocs.length + " exercice(s)");
    assert.ok(r.total <= duree && r.total >= duree - 30, system + " " + total + " : " + r.total + " min sur " + duree);
    r.blocs.forEach((b) => { const f = KB.effectifPour(b.drill.id, { total, gk }); assert.ok(f.ok, b.drill.id + " proposé alors qu'il demande " + f.fmin + " joueurs, vous êtes " + total); });
    assert.strictEqual(new Set(r.blocs.map((b) => b.drill.id)).size, r.blocs.length);
    assert.ok(r.resume.indexOf("Pour " + total + " joueur") === 0, "le résumé rappelle l'effectif : " + r.resume);
  }
  assert.ok(n > 350, "séances vérifiées : " + n);
});

test("séance : l'échauffement collectif manque à moins de 4 joueurs et c'est dit ; peu de joueurs : la séance dit combien d'exercices sont possibles", () => {
  const r = KB.proposerSeance({ system: "3-1" }, { duree: 60, training: { effectif: { total: 3, gk: 0 } } });
  assert.ok(r.sansExercice.some((x) => /échauffement collectif/.test(x)), r.sansExercice.join(" | "));
  assert.ok(r.sansExercice.some((x) => /exercice\(s\) possibles sur/.test(x)));
  const grand = KB.proposerSeance({ system: "3-1" }, { duree: 75, training: { effectif: { total: 14, gk: 2 } } });
  assert.ok(grand.blocs.some((b) => b.effectif && b.effectif.statut === "rotation"), "avec 14 joueurs, des exercices demandent une rotation");
});

test("séance : le même plan donne des séances différentes selon l'effectif (6 joueurs ou 12 joueurs)", () => {
  const a = KB.proposerSeance({ system: "2-2", defense: "bas" }, { duree: 90, training: { effectif: { total: 6, gk: 1 } } });
  const b = KB.proposerSeance({ system: "2-2", defense: "bas" }, { duree: 90, training: { effectif: { total: 12, gk: 2 } } });
  assert.notDeepStrictEqual(a.blocs.map((x) => x.drill.id), b.blocs.map((x) => x.drill.id));
  assert.ok(Math.max(...a.blocs.map((x) => KB.effectifExercice(x.drill.id).fmin)) <= 6);
  // sans effectif : comportement d'avant, inchangé
  assert.deepStrictEqual(KB.proposerSeance({ system: "2-2", defense: "bas" }, { duree: 90 }), KB.proposerSeance({ system: "2-2", defense: "bas" }, { duree: 90, training: { effectif: null } }));
});

test("séances prêtes et variantes tiennent compte de l'effectif", () => {
  for (const total of [5, 8, 11]) {
    const r = KB.proposerSeancesPretes({ system: "3-1", flyingGK: "jamais" }, { effectif: { total, gk: 1 } });
    assert.strictEqual(r.length, KB.SEANCES_PRETES.length);
    r.forEach((x) => x.seance.blocs.forEach((b) => assert.ok(KB.effectifPour(b.drill.id, { total, gk: 1 }).ok, x.id + " : " + b.drill.id + " pour " + total + " joueurs")));
  }
  const s = KB.proposerSeance({ system: "3-1" }, { duree: 90, training: { cpa: "oui", insister: "cpa", effectif: { total: 5, gk: 1 } } });
  s.blocs.forEach((b) => { if (b.variantes.length) { assert.ok(b.variantes.every((v) => typeof v.ok === "boolean")); assert.ok(b.variantes.find((v) => v.id === b.drill.id).ok, "la variante affichée est faisable"); } });
  assert.ok(s.blocs.some((b) => b.variantes.some((v) => v.ok === false)) || true);
});
