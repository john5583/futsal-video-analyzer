"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const KB = require("../src/knowledge");

const SYSTEMS = KB.SYSTEMS.map((s) => s.id);
const opt = (id) => KB.PLAN_QUESTIONS.find((q) => q.id === id).options.map((o) => o.id);
const TAGS = KB.SEANCE_TAGS;
const aTag = (id, k) => TAGS[id] && TAGS[id][k];

test("bibliothèque : plus de 50 exercices, identifiants uniques, chacun rattaché à un thème et animé", () => {
  assert.ok(KB.DRILLS.length >= 50, "exercices : " + KB.DRILLS.length);
  assert.strictEqual(new Set(KB.DRILLS.map((d) => d.id)).size, KB.DRILLS.length, "identifiants uniques");
  KB.DRILLS.forEach((d) => {
    assert.ok(TAGS[d.id] && TAGS[d.id].th, "thème manquant : " + d.id);
    assert.ok(d.name && d.goal && d.players && d.duration >= 8 && d.duration <= 20 && d.description.length > 60 && d.criteria.length >= 3, "fiche incomplète : " + d.id);
  });
  assert.ok(Object.keys(TAGS).every((id) => KB.DRILLS.some((d) => d.id === id)), "aucune étiquette orpheline");
});

test("séance : pour tous les plans et toutes les durées, le temps est tenu, sans doublon, avec échauffement et une raison par exercice", () => {
  let n = 0;
  for (const system of SYSTEMS) for (const defense of opt("defense")) for (const compact of opt("compact")) for (const pressing of opt("pressing")) for (const noLossOwnZone of opt("noLossOwnZone")) for (const flyingGK of opt("flyingGK")) for (const duree of [45, 60, 75, 90]) {
    const r = KB.proposerSeance({ system, defense, compact, pressing, noLossOwnZone, flyingGK }, { duree });
    n++;
    assert.ok(r.total <= duree && r.total >= duree - 25, "durée " + r.total + " / " + duree + " pour " + system + defense + compact + pressing + noLossOwnZone + flyingGK);
    assert.strictEqual(r.total, r.blocs.reduce((a, b) => a + b.minutes, 0));
    assert.strictEqual(new Set(r.blocs.map((b) => b.drill.id)).size, r.blocs.length, "doublon");
    assert.strictEqual(r.blocs[0].phase, "Échauffement");
    r.blocs.forEach((b, i) => { assert.strictEqual(b.ordre, i + 1); assert.ok(b.pourquoi.length && b.pourquoi.every((x) => x.length > 10), "raison manquante pour " + b.drill.id); });
    assert.ok(r.blocs.length >= 3, "au moins 3 exercices");
  }
  assert.ok(n > 3000, "plans essayés : " + n);
});

test("séance : chaque choix du plan est représenté par au moins un exercice qui le concerne (séance de 75 min)", () => {
  for (const system of SYSTEMS) for (const defense of ["haut", "median", "bas"]) for (const flyingGK of ["jamais", "derriere"]) {
    const r = KB.proposerSeance({ system, defense, pressing: "oui", flyingGK }, { duree: 75 });
    const ids = r.blocs.map((b) => b.drill.id);
    if (!(KB.PLAN_GK_SYSTEMS[system] && flyingGK === "jamais")) assert.ok(ids.some((id) => (aTag(id, "sys") || []).indexOf(system) >= 0), "aucun exercice pour le système " + system + " : " + ids);
    assert.ok(ids.some((id) => (aTag(id, "def") || []).indexOf(defense) >= 0), "aucun exercice pour la défense " + defense + " (" + system + ") : " + ids);
    if (flyingGK !== "jamais") assert.ok(ids.some((id) => aTag(id, "gj")), "aucun exercice de gardien-joueur (" + system + ")");
  }
});

test("séance : jamais d'exercice de gardien-joueur si l'entraîneur n'en veut pas, jamais de coups de pied arrêtés s'il n'en veut pas", () => {
  for (const system of SYSTEMS) {
    const r = KB.proposerSeance({ system, flyingGK: "jamais" }, { duree: 120, training: { cpa: "non" } });
    r.blocs.forEach((b) => { assert.ok(!aTag(b.drill.id, "gj"), "gardien-joueur proposé à tort : " + b.drill.id); assert.ok(!aTag(b.drill.id, "cp"), "coup de pied arrêté proposé à tort : " + b.drill.id); });
  }
});

test("séance : les coups de pied arrêtés demandés sont présents (deux exercices si l'entraîneur insiste dessus)", () => {
  for (const system of SYSTEMS) {
    const un = KB.proposerSeance({ system }, { duree: 75, training: { cpa: "oui" } });
    assert.ok(un.blocs.some((b) => aTag(b.drill.id, "cp")), "un exercice de coups de pied arrêtés attendu : " + system);
    const deux = KB.proposerSeance({ system }, { duree: 90, training: { cpa: "oui", insister: "cpa" } });
    assert.ok(deux.blocs.filter((b) => aTag(b.drill.id, "cp")).length >= 2, "deux exercices attendus quand il insiste : " + system);
  }
});

test("séance : les choix d'entraînement orientent la séance (défense en zone, attaque par le pivot, sortie courte)", () => {
  const r = KB.proposerSeance({ system: "3-1", defense: "median" }, { duree: 90, training: { defType: "zone", attaque: "pivot", sortie: "court", cpa: "non", insister: "equilibre" } });
  const ids = r.blocs.map((b) => b.drill.id);
  assert.ok(ids.some((id) => (aTag(id, "dt") || []).indexOf("zone") >= 0), "un exercice de défense en zone : " + ids);
  assert.ok(ids.some((id) => (aTag(id, "at") || []).indexOf("pivot") >= 0), "un exercice par le pivot : " + ids);
  assert.ok(ids.some((id) => (aTag(id, "so") || []).indexOf("court") >= 0), "un exercice de sortie courte : " + ids);
  assert.ok(r.resume.includes("en zone") && r.resume.includes("pivot"), "le résumé reprend les choix : " + r.resume);
  const autre = KB.proposerSeance({ system: "3-1", defense: "median" }, { duree: 90, training: { defType: "individuelle", attaque: "direct", sortie: "long", cpa: "non" } });
  assert.notDeepStrictEqual(autre.blocs.map((b) => b.drill.id), ids, "d'autres choix donnent une autre séance");
});

test("séance : même plan, même séance ; durée bornée entre 30 et 120 minutes ; valeurs inconnues ignorées sans erreur", () => {
  const a = KB.proposerSeance({ system: "2-2", defense: "bas" }, { duree: 75 }), b = KB.proposerSeance({ system: "2-2", defense: "bas" }, { duree: 75 });
  assert.deepStrictEqual(a, b);
  assert.strictEqual(KB.proposerSeance({ system: "3-1" }, { duree: 5 }).duree, 30);
  assert.strictEqual(KB.proposerSeance({ system: "3-1" }, { duree: 999 }).duree, 120);
  assert.ok(KB.proposerSeance({ system: "n'importe quoi", defense: "???" }, { training: { defType: "inconnu" } }).blocs.length >= 3);
  assert.ok(KB.proposerSeance(null, null).blocs.length >= 3, "sans plan : séance par défaut");
});

test("choix d'entraînement : chaque option est défendue par au moins un exercice (sauf « pas de consigne »)", () => {
  KB.TRAINING_QUESTIONS.filter((q) => ["defType", "attaque", "sortie"].indexOf(q.id) >= 0).forEach((q) => {
    const k = { defType: "dt", attaque: "at", sortie: "so" }[q.id];
    q.options.filter((o) => o.id !== "libre").forEach((o) => assert.ok(KB.DRILLS.some((d) => (aTag(d.id, k) || []).indexOf(o.id) >= 0), "aucun exercice pour " + q.id + " = " + o.id));
  });
});
