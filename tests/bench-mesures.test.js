/* Banc d'essai : les mesures sont justes sur des jeux d'images fabriqués (valeurs connues d'avance) et ne plantent jamais. */
const test = require("node:test");
const assert = require("node:assert/strict");
const B = require("./bench/mesures");

const H = [40, 0, 0, 0, 20, 0, 0, 0, 1];      // image normalisée (u, v) -> terrain : x = 40 u, y = 20 v
/* n images toutes les dt s ; 5 joueurs A et 5 joueurs B, chacun à vitesse constante (m/s) sur x ; ballon facultatif. */
function match(n, dt, opts) {
  const o = Object.assign({ speed: 4, newIds: false, ball: true }, opts || {});
  return Array.from({ length: n }, (_v, i) => {
    const t = Math.round(i * dt * 100) / 100, players = [];
    for (let k = 0; k < 5; k++) {
      const gen = o.newIds ? Math.floor(i / 6) : 0;                  // newIds : tous les identifiants changent toutes les 6 images (joueurs « perdus » puis recréés)
      players.push({ id: 100 + k + gen * 20, team: "A", x: 5 + k * 3 + o.speed * t, y: 4 + k * 3 });
      players.push({ id: 200 + k + gen * 20, team: "B", x: 25 + k * 3 + o.speed * t, y: 4 + k * 3 });
    }
    return { t, players, ball: o.ball ? { x: 10 + 6 * t, y: 8 } : null, h: H };
  });
}

test("pistes : 5 joueurs stables = 5 identifiants, aucune naissance tardive", () => {
  const s = B.trackStats(match(60, 0.33), "A", 5);
  assert.equal(s.ids, 5);
  assert.equal(s.idsPerExpected, 1);
  assert.equal(s.meanVisible, 5);
  assert.equal(s.birthsPerMin, 0);
  assert.equal(s.shortShare, 0);
});

test("pistes : des identifiants recréés sans cesse font monter le rapport et les pistes courtes", () => {
  const s = B.trackStats(match(60, 0.33, { newIds: true }), "A", 5);
  assert.ok(s.ids >= 50 && s.idsPerExpected >= 10, "identifiants : " + s.ids);
  assert.ok(s.shortShare > 0.8, "pistes courtes : " + s.shortShare);
  assert.ok(s.birthsPerMin > 100);
});

test("déplacements : une vitesse constante connue est retrouvée, aucun dépassement", () => {
  const p = B.physics(match(30, 0.33, { speed: 4 }));
  assert.ok(Math.abs(p.speedP50 - 4) < 0.05 && Math.abs(p.speedMax - 4) < 0.05, JSON.stringify(p));
  assert.equal(p.overSpeedRef, 0);
  assert.ok(p.accelP95 < 0.05);
  const fast = B.physics(match(30, 0.33, { speed: 12 }));
  assert.equal(fast.overSpeedRef, 1, "12 m/s dépasse toujours le repère de 9 m/s");
});

test("déplacements : les trous de plus d'une seconde ne fabriquent pas de vitesse", () => {
  const fr = match(10, 2, { speed: 4 });            // images espacées de 2 s : aucune paire exploitable
  assert.equal(B.physics(fr).samples, 0);
});

test("ballon retenu : part des images et vitesse connue (6 m/s)", () => {
  const b = B.ballStats(match(30, 0.33));
  assert.equal(b.withBallRatio, 1);
  assert.ok(Math.abs(b.speedP50 - 6) < 0.05);
  const none = B.ballStats(match(30, 0.33, { ball: false }));
  assert.equal(none.withBallRatio, 0);
  assert.equal(none.speedP50, null);
});

test("ballon sur étiquettes : retrouvé, trop loin, non retenu, fausse détection, sans image", () => {
  const fr = match(30, 1 / 3);                      // ballon en (10 + 6 t, 8) m ; t = 3 s -> x = 28
  const at = (t) => { const x = 10 + 6 * t; return { u: x / 40, v: 8 / 20 }; };
  const labels = [
    { t: 3, ball: at(3) },                          // pile sur le ballon retenu : retrouvé
    { t: 4, ball: { u: at(4).u + 5 / 40, v: at(4).v } },   // à 5 m : ballon retenu mais trop loin
    { t: 5, ball: null },                           // « aucun ballon » alors qu'un ballon est retenu : fausse détection
    { t: 500, ball: at(3) }                         // aucune image analysée près de cet instant : ni pour ni contre
  ];
  const r = B.ballRecall(fr, labels);
  assert.equal(r.found, 1);
  assert.equal(r.nearMiss, 1);
  assert.equal(r.falsePositives, 1);
  assert.equal(r.skipped, 1);
  assert.equal(r.recall, 0.5);
  const noBall = B.ballRecall(match(30, 1 / 3, { ball: false }), [{ t: 3, ball: at(3) }]);
  assert.equal(noBall.missed, 1);
  assert.equal(noBall.recall, 0);
});

test("ballon sur étiquettes : image sans homographie ignorée, jamais comptée comme échec", () => {
  const fr = match(10, 1 / 3).map((f) => ({ t: f.t, players: f.players, ball: f.ball }));
  const r = B.ballRecall(fr, [{ t: 1, ball: { u: 0.5, v: 0.5 } }]);
  assert.equal(r.skipped, 1);
  assert.equal(r.withBall, 0);
  assert.equal(r.recall, null);
});

test("étiquettes YOLO : temps lu dans le nom du fichier, fichier vide = aucun ballon", () => {
  const l = B.parseYoloLabels([
    { name: "balle_00000670.txt", text: "0 0.546875 0.366667 0.004167 0.007407\n" },
    { name: "balle_00008000.txt", text: "" },
    { name: "n'importe quoi.txt", text: "0 0.5 0.5 0.1 0.1" },
    null
  ]);
  assert.equal(l.length, 2);
  assert.deepEqual(l[0], { t: 0.67, ball: { u: 0.546875, v: 0.366667 } });
  assert.deepEqual(l[1], { t: 8, ball: null });
});

test("couverture : calculée sur la plage, jamais au-delà de 100 %", () => {
  const ai = { lost: [[66, 817]], settings: { t0: 17, t1: 817, fps: 3 }, context: { reliable: { ratio: 0.01, sec: 10.7, total: 800 } } };
  const c = B.coverage(ai, match(147, 0.33));
  assert.equal(c.rangeSec, 800);
  assert.ok(c.lostRatio > 0.9 && c.lostRatio <= 1, "part perdue : " + c.lostRatio);
  assert.equal(c.reliableRatio, 0.01);
  assert.equal(c.imagesExpected, 2400);
  assert.ok(c.keptRatio < 0.1);
});

test("entrées vides ou absentes : aucune exception, mesures vides", () => {
  [undefined, null, [], [{}], [{ t: 1 }]].forEach((x) => {
    const s = B.summarize(null, x);
    assert.equal(s.tracksA.ids, 0);
    assert.equal(s.physics.samples, 0);
    assert.equal(s.ball.withBall, 0);
    assert.ok(typeof B.table("vide", s) === "string");
  });
  assert.deepEqual(B.ballRecall([], undefined).labelled, 0);
  assert.deepEqual(B.parseYoloLabels(undefined), []);
});

test("tableau lisible : en français, avec les chiffres mesurés", () => {
  const s = B.summarize({ lost: [], settings: { t0: 0, t1: 10, fps: 3 }, context: { reliable: { ratio: 0.9, sec: 9, total: 10 } } }, match(30, 1 / 3), { labels: [{ t: 3, ball: { u: 28 / 40, v: 0.4 } }] });
  const t = B.table("essai", s);
  assert.match(t, /Couverture/);
  assert.match(t, /Pistes équipe A : 5 identifiants pour 5 joueurs attendus/);
  assert.match(t, /Ballon sur étiquettes : 1 retrouvés sur 1/);
});

test("comparaison avant / après : mieux, moins bien, identique, non comparable", () => {
  const a = B.summarize(null, match(60, 0.33, { newIds: true })), b = B.summarize(null, match(60, 0.33));
  const r = Object.fromEntries(B.compare(a, b).map((x) => [x.mesure, x.verdict]));
  assert.equal(r["Identifiants / joueurs, équipe A"], "mieux");
  assert.equal(r["Piste médiane, équipe A (s)"], "mieux");
  assert.equal(r["Ballon retenu (part des images)"], "identique");
  assert.equal(r["Rappel du ballon sur étiquettes"], "non comparable");
  const back = Object.fromEntries(B.compare(b, a).map((x) => [x.mesure, x.verdict]));
  assert.equal(back["Identifiants / joueurs, équipe A"], "moins bien");
  assert.match(B.compareTable(a, b), /équipe A : .* -> 1 \(mieux\)/);
});
