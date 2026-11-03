"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const KB = require("../src/knowledge");

const SYSTEMS = KB.SYSTEMS.map((s) => s.id);
const opt = (id) => KB.PLAN_QUESTIONS.find((q) => q.id === id).options.map((o) => o.id);
const TAGS = KB.SEANCE_TAGS;
const ids = (r) => r.seance.blocs.map((b) => b.drill.id);
const jaccard = (a, b) => { const A = new Set(a), B = new Set(b), i = [...A].filter((x) => B.has(x)).length; return i / (A.size + B.size - i); };

test("séances prêtes : plus de dix, de 45 à 120 minutes, identifiants uniques, chacune avec thème, moment conseillé et objectif", () => {
  const S = KB.SEANCES_PRETES;
  assert.ok(S.length >= 12, "séances : " + S.length);
  assert.strictEqual(new Set(S.map((s) => s.id)).size, S.length);
  assert.strictEqual(Math.min(...S.map((s) => s.duree)), 45);
  assert.strictEqual(Math.max(...S.map((s) => s.duree)), 120);
  [45, 60, 75, 90, 105, 120].forEach((d) => assert.ok(S.some((s) => s.duree === d), "aucune séance de " + d + " min"));
  S.forEach((s) => assert.ok(s.titre && s.quand.length > 15 && s.objectif.length > 15, "fiche incomplète : " + s.id));
});

test("séances prêtes : pour tous les plans, le temps est tenu, sans doublon, échauffement d'abord, une raison par exercice", () => {
  let n = 0;
  for (const system of SYSTEMS) for (const defense of opt("defense")) for (const compact of opt("compact")) for (const pressing of opt("pressing")) for (const flyingGK of opt("flyingGK")) {
    const r = KB.proposerSeancesPretes({ system, defense, compact, pressing, flyingGK }, {});
    assert.strictEqual(r.length, KB.SEANCES_PRETES.length);
    r.forEach((x) => {
      n++;
      const s = x.seance;
      assert.ok(s.total <= x.duree && s.total >= x.duree - 25, x.id + " : " + s.total + " min sur " + x.duree);
      assert.strictEqual(new Set(ids(x)).size, ids(x).length, "doublon dans " + x.id);
      assert.strictEqual(s.blocs[0].phase, "Échauffement");
      assert.ok(s.blocs.length >= 3);
      s.blocs.forEach((b) => assert.ok(b.pourquoi.length && b.pourquoi.every((p) => p.length > 10), "raison manquante : " + b.drill.id));
    });
  }
  assert.ok(n > 5000, "séances vérifiées : " + n);
});

test("séances prêtes : les séances d'un même plan sont vraiment différentes les unes des autres", () => {
  for (const system of SYSTEMS) {
    const r = KB.proposerSeancesPretes({ system, defense: "median", pressing: "oui", flyingGK: system === "3-2" || system === "1-2-2" ? "derriere" : "jamais" }, {});
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) assert.ok(jaccard(ids(r[i]), ids(r[j])) <= 0.67, system + " : " + r[i].id + " et " + r[j].id + " se ressemblent trop");
    assert.ok(new Set(r.flatMap(ids)).size >= 30, system + " : seulement " + new Set(r.flatMap(ids)).size + " exercices différents");
  }
});

test("séances prêtes : le choix de l'entraîneur est respecté (jamais de gardien-joueur refusé, coups de pied arrêtés seulement s'il les veut)", () => {
  for (const system of SYSTEMS) {
    const sans = KB.proposerSeancesPretes({ system, flyingGK: "jamais" }, { cpa: "non" });
    sans.forEach((x) => ids(x).forEach((id) => {
      assert.ok(!TAGS[id].gj, "gardien-joueur proposé à tort dans " + x.id + " : " + id);
      if (x.id !== "cpa60") assert.ok(!TAGS[id].cp, "coup de pied arrêté non voulu dans " + x.id + " : " + id);
    }));
    const avec = KB.proposerSeancesPretes({ system, flyingGK: "jamais" }, { cpa: "oui" });
    assert.ok(avec.find((x) => x.id === "complete90").seance.blocs.some((b) => TAGS[b.drill.id].cp), "coups de pied arrêtés demandés mais absents : " + system);
    assert.ok(KB.proposerSeancesPretes({ system, flyingGK: "derriere" }, {}).find((x) => x.id === "gardienjoueur75").seance.blocs.some((b) => TAGS[b.drill.id].gj), "séance gardien-joueur sans exercice de gardien-joueur : " + system);
  }
});

test("séances prêtes : même plan, même séances ; filtrer par durée garde exactement les mêmes séances ; entrées inconnues sans erreur", () => {
  const plan = { system: "2-2", defense: "bas" };
  assert.deepStrictEqual(KB.proposerSeancesPretes(plan, {}), KB.proposerSeancesPretes(plan, {}));
  const toutes = KB.proposerSeancesPretes(plan, {});
  const f60 = KB.proposerSeancesPretes(plan, {}, { duree: 60 });
  assert.ok(f60.length >= 2 && f60.every((x) => x.duree === 60));
  f60.forEach((x) => assert.deepStrictEqual(x, toutes.find((y) => y.id === x.id)));
  assert.strictEqual(KB.proposerSeancesPretes(null, null).length, KB.SEANCES_PRETES.length);
  assert.strictEqual(KB.proposerSeancesPretes({ system: "n'importe quoi", defense: "???" }, { transition: "x" }).length, KB.SEANCES_PRETES.length);
});

test("nouveaux choix du plan : chaque option est défendue par au moins un exercice, et elle oriente la séance", () => {
  ["transition", "pressDecl", "occupation", "finition", "cpaFocus"].forEach((qid) => {
    const q = KB.TRAINING_QUESTIONS.find((x) => x.id === qid), e = KB.TRAINING_EXTRA.find((x) => x.q === qid);
    assert.ok(q && e, "question absente : " + qid);
    assert.ok(KB.trainingDefaults()[qid] === "libre");
    q.options.filter((o) => o.id !== "libre").forEach((o) => {
      assert.ok(KB.DRILLS.some((d) => (TAGS[d.id][e.k] || []).indexOf(o.id) >= 0), "aucun exercice pour " + qid + " = " + o.id);
      const r = KB.proposerSeance({ system: "3-1", defense: "median" }, { duree: 90, training: { [qid]: o.id, cpa: "oui" } });
      assert.ok(r.blocs.some((b) => (TAGS[b.drill.id][e.k] || []).indexOf(o.id) >= 0), "la séance ne contient aucun exercice pour " + qid + " = " + o.id);
      assert.ok(r.resume.includes(e.lab[o.id]), "le résumé ne reprend pas le choix : " + r.resume);
    });
  });
  KB.TRAINING_QUESTIONS.find((q) => q.id === "insister").options.filter((o) => ["sortie", "finition", "gj"].indexOf(o.id) >= 0).forEach((o) => assert.ok(KB.DRILLS.some((d) => (TAGS[d.id].ins || []).indexOf(o.id) >= 0), "aucun exercice pour insister = " + o.id));
  const a = KB.proposerSeance({ system: "3-1" }, { duree: 75, training: { transition: "contre" } }), b = KB.proposerSeance({ system: "3-1" }, { duree: 75, training: { transition: "poser" } });
  assert.notDeepStrictEqual(a.blocs.map((x) => x.drill.id), b.blocs.map((x) => x.drill.id));
});
