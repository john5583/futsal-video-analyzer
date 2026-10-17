/* Contrôle qualité : le programme repère lui-même les situations qui rendent l'analyse fragile. */
const test = require("node:test");
const assert = require("node:assert/strict");
const Q = require("../src/engine/quality");

const L = 40;
function build(duration, spec, dt) {
  const step = dt || 0.5, normalized = [], playStates = [];
  for (let t = 0; t <= duration + 1e-9; t += step) {
    const s = spec(Math.round(t * 100) / 100);
    const A = (s.A || []).map((x, i) => ({ id: i + 1, gk: false, x, y: 4 + i * 4 }));
    if (s.gk != null) A.push({ id: 9, gk: true, x: s.gk, y: 10 });
    normalized.push({ t: Math.round(t * 100) / 100, A, B: [], ball: null });
    playStates.push(s.state || "jeu");
  }
  return { normalized, playStates, context: { reliable: { ratio: 0.9, sec: duration, total: duration } } };
}
const ai = (o) => Object.assign({ calibrations: [{ t: 0 }], lost: [], flip: true }, o || {});
const ids = (r) => r.items.map((i) => i.id);

test("tout va bien : aucune alerte, la liste des contrôles réussis est donnée", () => {
  const r = Q.evaluate({ res: build(60, () => ({ A: [5, 8, 11, 20], gk: 3 })), ai: ai(), project: {}, L });
  assert.equal(r.level, "bon");
  assert.deepEqual(r.items.filter((i) => i.level === "attention"), []);
  assert.ok(r.good.some((g) => /Terrain repéré/.test(g)) && r.good.some((g) => /quatre joueurs de champ/.test(g)));
});

test("caméra qui suit le ballon de près : les quatre joueurs rarement visibles -> alerte avec le chiffre mesuré et le remède", () => {
  const res = build(60, (t) => ({ A: t % 4 < 1 ? [5, 8, 11, 20] : [5, 8] }));
  const r = Q.evaluate({ res, ai: ai(), project: {}, L });
  assert.ok(ids(r).includes("couverture"));
  const c = r.items.find((i) => i.id === "couverture");
  assert.match(c.detail, /\d+ %/);
  assert.match(c.fix, /trépied|tout le terrain/);
  assert.equal(r.level, "attention");
});

test("ballon peu visible, caméra perdue, terrain non repéré, banc non marqué, camp inversé, 2e période, faible résolution, questions", () => {
  const res = build(1500, () => ({ A: [5, 8, 11, 20], gk: 30 }), 5);
  res.context.reliable = { ratio: 0.3, sec: 450, total: 1500 };
  const r = Q.evaluate({ res, ai: ai({ calibrations: [], lost: [[100, 300]], benchSeen: { y0: 3, yW: 60 }, benchZones: [] }), project: { secondHalfStart: null }, L, videoWidth: 640, openQuestions: 4, kitWarnings: ["Les deux équipes portent des tenues proches."] });
  ["terrain", "ballon", "camera", "banc", "camp", "periode", "resolution", "questions", "tenues0"].forEach((id) => assert.ok(ids(r).includes(id), "manque : " + id));
  assert.ok(r.items.every((i) => i.title && i.detail && i.fix), "chaque alerte dit ce qui se passe et quoi faire");
});

test("peu d'images : pas de verdict sur la visibilité ; entrées vides ou absentes : aucune exception", () => {
  assert.ok(!ids(Q.evaluate({ res: build(2, () => ({ A: [5] })), ai: ai(), L })).includes("couverture"));
  assert.doesNotThrow(() => Q.evaluate());
  assert.doesNotThrow(() => Q.evaluate({}));
  assert.doesNotThrow(() => Q.evaluate({ res: { normalized: null, playStates: null }, ai: null, project: null }));
  assert.deepEqual(Q.evaluate({}).items.map((i) => i.id), ["terrain"].filter(Boolean), "sans calibrage, seule l'absence de terrain est signalée");
});

test("jeu arrêté : les images à l'arrêt ne comptent pas dans la visibilité", () => {
  const res = build(60, (t) => ({ A: t < 30 ? [5, 8, 11, 20] : [5], state: t < 30 ? "jeu" : "arret" }));
  assert.ok(!ids(Q.evaluate({ res, ai: ai(), L })).includes("couverture"));
});

test("avant le lancement : ce qui est prêt et ce qui manque", () => {
  const p = Q.preflight(ai({ calibrations: [], benchZones: [] }), { secondHalfStart: null }, { refs: { A: {}, B: null }, durationSec: 3000 });
  const by = (t) => p.find((x) => t.test(x.text));
  assert.equal(by(/Terrain/).ok, false);
  assert.equal(by(/Tenues/).ok, false);
  assert.equal(by(/Banc/).ok, false);
  assert.equal(by(/2e période/).ok, false);
  const ok = Q.preflight(ai({ benchZones: [{ x1: 0, y1: -5, x2: 5, y2: -1 }] }), { secondHalfStart: 1500 }, { refs: { A: {}, B: {} }, durationSec: 3000 });
  assert.ok(ok.every((x) => x.ok));
  assert.deepEqual(Q.preflight(null, null, null).length > 0, true);
});
