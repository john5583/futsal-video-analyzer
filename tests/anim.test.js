const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../src/anim/engine");
const SC = require("../src/anim/registry");
const KB = require("../src/knowledge");

test("chaque erreur du catalogue et chaque exercice a une animation valide", () => {
  for (const e of KB.ERRORS) {
    const s = SC.forError(e.id);
    assert.ok(s, "animation manquante pour l'erreur " + e.id);
    assert.deepEqual(E.validate(s), [], e.id);
    assert.equal(s.id, e.id);
  }
  for (const d of KB.DRILLS) {
    const s = SC.forDrill(d.id);
    assert.ok(s, "animation manquante pour l'exercice " + d.id);
    assert.deepEqual(E.validate(s), [], d.id);
  }
  assert.equal(SC.forError("inconnue"), null);
});

test("les animations d'erreur montrent l'erreur, la correction puis la consigne", () => {
  for (const e of KB.ERRORS) {
    const b = SC.forError(e.id).steps.map((s) => s.badge);
    assert.deepEqual(b, ["erreur", "correction", "consigne"], e.id);
  }
  for (const d of KB.DRILLS) {
    const b = SC.forDrill(d.id).steps.map((s) => s.badge);
    assert.ok(b.includes("exercice") && b.includes("consigne"), d.id);
  }
});

test("positions : interpolation et saut instantané", () => {
  const path = [[0, 0, 0], [2, 10, 4], [2.005, 30, 8], [4, 30, 8]];
  assert.deepEqual(E.positionAt(path, -1), [0, 0]);
  const mid = E.positionAt(path, 1);
  assert.ok(Math.abs(mid[0] - 5) < 1e-9 && Math.abs(mid[1] - 2) < 1e-9);
  assert.deepEqual(E.positionAt(path, 2.01), [30, 8]);
  assert.deepEqual(E.positionAt(path, 99), [30, 8]);
  assert.equal(E.positionAt([], 1), null);
});

test("opérations de dessin : aucune valeur invalide à aucun instant, SVG bien formé", () => {
  for (const id of ["relance_risquee", "gj_perte_balle", "cpa_off_rate"]) {
    const s = SC.forError(id);
    for (let t = 0; t <= s.duration; t += 0.7) {
      const ops = E.buildOps(s, t);
      assert.ok(ops.length > 20);
      const json = JSON.stringify(ops);
      assert.ok(!/NaN|Infinity|null,"k"/.test(json.replace(/"(alpha|rx|tag|label)":null/g, "")), id + " @" + t);
      const svg = E.opsToSVG(ops, 640);
      assert.ok(svg.startsWith("<svg") && svg.endsWith("</svg>"));
      assert.ok(!svg.includes("NaN"));
      assert.equal((svg.match(/<text/g) || []).length, (svg.match(/<\/text>/g) || []).length);
    }
  }
});

test("rendu canvas : appelle les primitives sans exception", () => {
  const calls = {};
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { calls[k] = (calls[k] || 0) + 1; }), set: (t, k, v) => { t[k] = v; return true; } });
  E.drawOps(ctx, E.buildOps(SC.forDrill("rondo_4v2"), 3), 30);
  assert.ok(calls.fillText > 3 && calls.arc > 5 && calls.stroke > 5);
});

test("séquence : titres + scènes, bornes de temps correctes", () => {
  const seq = SC.buildSequence([{ type: "title", title: "Corrections", subtitle: "Match du 12", dur: 2 }, { type: "scene", scene: SC.forError("repli_tardif") }, { type: "scene", scene: SC.forDrill("repli_3v2") }]);
  assert.equal(seq.items[0].start, 0);
  assert.equal(seq.items[1].start, 2);
  assert.ok(Math.abs(seq.duration - (2 + SC.forError("repli_tardif").duration + 0.8 + SC.forDrill("repli_3v2").duration + 0.8)) < 1e-9);
  assert.ok(SC.sequenceOps(seq, 1).length > 10);
  assert.ok(SC.sequenceOps(seq, 5).length > 10);
  assert.ok(SC.sequenceOps(seq, 9999).length > 10);
});

test("mini-carte, carte de chaleur et image fixe", () => {
  const ops = E.liveOps({ players: [{ id: 3, team: "A", x: 10, y: 5 }, { id: 9, team: "B", x: 20, y: 12 }, { id: 1, team: "GKA", x: 1, y: 10 }], ball: { x: 12, y: 6 } }, { showIds: true, heat: [[0.1, 0.2], [0.3, 0.4]], trails: { 3: Object.assign([[9, 5], [10, 5]], { team: "A" }) } });
  assert.ok(ops.length > 15);
  const svg = E.opsToSVG(ops, 500, E.COURT_VIEW);
  assert.ok(svg.includes('viewBox="-1 -1 42 22"'));
  assert.ok(SC.snapshotSVG(SC.forError("marquage_perdu"), 3, 400).includes("<svg"));
  assert.deepEqual(E.heatOps([[0, 0]]), []);
});

test("validation détecte les scènes incohérentes", () => {
  const bad = { id: "x", title: "x", duration: 5, actors: [{ id: "A1", team: "A", n: 1, x: 99, y: 5 }], moves: { Z9: [[0, 1, 1]] }, ball: [[3, 5, 5], [1, 5, 5]], arrows: [{ kind: "zzz", from: "A1", to: [1, 1], t0: 0, t1: 1 }], zones: [], steps: [] };
  const errs = E.validate(bad).join("|");
  for (const m of ["hors terrain", "acteur inconnu", "non croissants", "type de flèche inconnu", "aucune légende"]) assert.ok(errs.includes(m), m);
});
