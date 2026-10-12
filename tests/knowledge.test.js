const test = require("node:test");
const assert = require("node:assert/strict");
const KB = require("../src/knowledge");

test("les identifiants d'erreurs et d'exercices sont uniques", () => {
  const ids = KB.ERRORS.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  const dids = KB.DRILLS.map((d) => d.id);
  assert.equal(new Set(dids).size, dids.length);
});

test("chaque erreur est complète et référence des éléments existants", () => {
  const drills = new Set(KB.DRILLS.map((d) => d.id));
  const rules = new Set(KB.RULES.map((r) => r.id));
  for (const e of KB.ERRORS) {
    assert.ok(KB.PHASES[e.phase], "phase inconnue pour " + e.id);
    assert.ok(e.weight >= 1 && e.weight <= 5, "poids hors bornes " + e.id);
    for (const k of ["signs", "causes", "solutions", "cues", "drills"]) {
      assert.ok(Array.isArray(e[k]) && e[k].length > 0, k + " vide pour " + e.id);
    }
    e.drills.forEach((d) => assert.ok(drills.has(d), "exercice inconnu " + d + " dans " + e.id));
    e.rules.forEach((r) => assert.ok(rules.has(r), "règle inconnue " + r + " dans " + e.id));
  }
});

test("systèmes et rôles ne référencent que des erreurs existantes", () => {
  const errs = new Set(KB.ERRORS.map((e) => e.id));
  for (const s of KB.SYSTEMS) {
    s.weaknessErrors.forEach((id) => assert.ok(errs.has(id), "erreur inconnue " + id + " dans " + s.id));
    Object.keys(s.tips).forEach((id) => assert.ok(s.weaknessErrors.includes(id), "astuce hors faiblesse " + id + " dans " + s.id));
  }
  for (const r of KB.ROLES) r.commonErrors.forEach((id) => assert.ok(errs.has(id), "erreur inconnue " + id + " dans le rôle " + r.id));
});

test("chaque exercice est utilisé et décrit", () => {
  const used = new Set(KB.ERRORS.flatMap((e) => e.drills));
  for (const d of KB.DRILLS) {
    assert.ok(used.has(d.id), "exercice jamais recommandé : " + d.id);
    assert.ok(d.description && d.criteria.length && d.duration > 0);
  }
});

test("la base contient toutes les rubriques demandées", () => {
  assert.ok(KB.RULES.length >= 7);
  assert.ok(KB.SYSTEMS.length >= 5);
  assert.ok(KB.ROLES.length >= 5);
  assert.ok(KB.GLOSSARY.length >= 30);
  const r = JSON.stringify(KB.RULES);
  for (const w of ["4 secondes", "hors-jeu", "fautes cumulées", "gardien-joueur"]) assert.ok(r.toLowerCase().includes(w.toLowerCase()), w);
});

test("la base couvre les thèmes tactiques et les règles essentielles", () => {
  assert.ok(KB.TACTICS.length >= 8);
  assert.ok(KB.RULES.length >= 12);
  const all = JSON.stringify(KB.RULES).toLowerCase() + JSON.stringify(KB.TACTICS).toLowerCase() + JSON.stringify(KB.GLOSSARY).toLowerCase();
  for (const w of ["4 secondes", "hors-jeu", "fautes cumulées", "gardien-joueur", "second point", "penalty", "temps mort", "corner", "touche", "remise en jeu du gardien", "carton rouge", "avantage", "pressing", "transition", "contre-pressing", "rotation", "pivot", "fixo", "ala", "power play", "tirs au but", "coup franc"]) {
    assert.ok(all.includes(w), "terme absent de la base : " + w);
  }
  for (const s of KB.SYSTEMS) assert.ok(s.tips && Object.keys(s.tips).length >= 2, s.id);
  const ids = KB.TACTICS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  KB.TACTICS.concat(KB.RULES).forEach((c) => c.items.forEach((i) => assert.ok(i.title && i.text.length > 30, c.id + "/" + i.title)));
  const terms = KB.GLOSSARY.map((g) => g.term);
  assert.equal(new Set(terms).size, terms.length, "terme de vocabulaire en double");
});
