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

/* ---------- analyse inutilisable (caméra perdue presque tout le temps) ---------- */
test("caméra perdue sur presque toute la plage : constat « inutilisable » en tête, pourcentage jamais au-delà de 100 %", () => {
  // images conservées : 48 s seulement ; plage analysée : 800 s ; caméra perdue de 66 s à 817 s (le cas réel mesuré)
  const res = build(48, () => ({ A: [5, 8, 11, 20], gk: 3 }));
  res.context = { reliable: { ratio: 0.01, sec: 10.7, total: 800 } };
  const r = Q.evaluate({ res, ai: ai({ lost: [[66, 817]], settings: { t0: 17, t1: 817 } }), project: {}, L });
  assert.equal(r.items[0].id, "inutilisable", "en tête de liste");
  assert.equal(r.items[0].blocking, true);
  assert.ok(/0 erreur/.test(r.items[0].detail) && /aucune erreur/.test(r.items[0].detail));
  assert.ok(r.measures.lost <= 1 && r.measures.lost > 0.9, "part perdue : " + r.measures.lost);
  assert.ok(!/\d{3,} %/.test(r.items.map((i) => i.detail).join(" ")), "aucun pourcentage à 3 chiffres");
  assert.equal(Q.unusable(r), true);
});

test("couverture fiable sous 5 % sans caméra perdue : analyse inutilisable aussi, avec un remède adapté", () => {
  const res = build(60, () => ({ A: [5, 8, 11, 20], gk: 3 }));
  res.context = { reliable: { ratio: 0.02, sec: 1.2, total: 60 } };
  const r = Q.evaluate({ res, ai: ai(), project: {}, L });
  assert.equal(r.items[0].id, "inutilisable");
  assert.ok(!/calibrage au moment/.test(r.items[0].fix));
});

test("analyse normale ou simplement fragile : jamais « inutilisable »", () => {
  const ok = Q.evaluate({ res: build(60, () => ({ A: [5, 8, 11, 20], gk: 3 })), ai: ai(), project: {}, L });
  assert.equal(Q.unusable(ok), false);
  const res = build(60, () => ({ A: [5, 8, 11, 20], gk: 3 }));
  res.context = { reliable: { ratio: 0.3, sec: 18, total: 60 } };
  const weak = Q.evaluate({ res, ai: ai({ lost: [[10, 30]], settings: { t0: 0, t1: 60 } }), project: {}, L });
  assert.equal(Q.unusable(weak), false, "30 % du temps utilisable et 33 % perdu : fragile, pas inutilisable");
  assert.equal(Q.unusable(null), false);
  assert.equal(Q.unusable({}), false);
});

test("ancien projet sans plage enregistrée : la part perdue se calcule comme avant", () => {
  const res = build(100, () => ({ A: [5, 8, 11, 20], gk: 3 }));
  const r = Q.evaluate({ res, ai: ai({ lost: [[10, 30]] }), project: {}, L });
  assert.ok(Math.abs(r.measures.lost - 0.2) < 1e-9);
});
