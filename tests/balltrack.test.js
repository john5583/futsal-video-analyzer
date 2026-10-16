/* Choix du ballon dans le temps : trajectoire cohérente parmi plusieurs candidats par image. */
const test = require("node:test");
const assert = require("node:assert/strict");
const BT = require("../src/ai/balltrack");
const P = require("../src/ai/pipeline");

// ballon qui roule à 5 m/s le long de x, une image toutes les 0,2 s
const roll = (n, extra) => Array.from({ length: n }, (_v, i) => ({ t: i * 0.2, bc: [[10 + i, 8, 0.7]].concat(extra ? extra(i) : []) }));

test("trajectoire nette : chaque image garde sa détection", () => {
  const pick = BT.select(roll(10));
  assert.ok(pick.every((p, i) => p && p[0] === 10 + i));
});

test("faux ballon isolé loin de la trajectoire (téléportation) : écarté, même avec un bon score", () => {
  const fr = roll(10);
  fr[5].bc = [[30, 2, 0.85]];                                  // à 20 m en 0,2 s : impossible
  const pick = BT.select(fr);
  assert.equal(pick[5], null);
  assert.ok(pick.filter(Boolean).length === 9);
});

test("faux ballon plus sûr que le vrai sur une image : le candidat cohérent est choisi", () => {
  const fr = roll(10);
  fr[4].bc = [[35, 18, 0.8], [14.1, 8, 0.3]];
  assert.deepEqual(BT.select(fr)[4], [14.1, 8, 0.3]);
});

test("détection faible : gardée si elle prolonge la trajectoire, écartée si elle est isolée", () => {
  const fr = roll(10);
  fr[5].bc = [[15, 8, 0.08]];
  assert.deepEqual(BT.select(fr)[5], [15, 8, 0.08]);
  const lone = [{ t: 0, bc: [] }, { t: 0.2, bc: [[20, 10, 0.08]] }, { t: 0.4, bc: [] }];
  assert.equal(BT.select(lone)[1], null);
});

test("ballon caché : aucune position inventée ; reprise ailleurs après un long trou", () => {
  const fr = roll(5).concat(Array.from({ length: 10 }, (_v, i) => ({ t: 1 + i * 0.2, bc: [] })))
    .concat(Array.from({ length: 5 }, (_v, i) => ({ t: 3 + i * 0.2, bc: [[30 - i, 15, 0.6]] })));
  const pick = BT.select(fr);
  assert.ok(pick.slice(5, 15).every((p) => p === null));
  assert.ok(pick.slice(15).every(Boolean), "la nouvelle trajectoire est reprise");
});

test("fin d'analyse : le ballon vient du choix cohérent ; anciennes analyses (sans candidats) inchangées", () => {
  const players = [1, 2, 3].map((id) => ({ id, team: "A", x: id * 5, y: 5, b: [0, 0, 1, 1] }));
  const fr = roll(6).map((f) => ({ t: f.t, players, ball: { x: 0, y: 0 }, bc: f.bc }));
  fr[3].bc = [[39, 19, 0.9]];
  const out = P.finalizeFrames(fr);
  assert.equal(out[3].ball, null);
  assert.deepEqual(out[2].ball, { x: 12, y: 8 });
  assert.ok(out.every((f) => !("bc" in f)));
  const old = P.finalizeFrames([0, 1, 2].map((i) => ({ t: i, players, ball: { x: 3, y: 4 } })));
  assert.ok(old.every((f) => f.ball && f.ball.x === 3));
});

test("faux ballon fixe et faible (score 0,06 à 0,1) sur 60 images : jamais retenu", () => {
  for (const score of [0.06, 0.08, 0.1]) {
    const fr = Array.from({ length: 60 }, (_v, i) => ({ t: i * 0.2, bc: [[30, 5, score]] }));
    assert.equal(BT.select(fr).filter(Boolean).length, 0, "score " + score);
  }
  // à côté d'un vrai ballon fiable : le vrai est gardé, le faux fixe toujours écarté
  const fr = Array.from({ length: 60 }, (_v, i) => ({ t: i * 0.2, bc: [[30, 5, 0.08], [10 + i * 0.4, 8, 0.6]] }));
  const pick = BT.select(fr);
  assert.ok(pick.every((p) => p && p[2] === 0.6));
});

test("détections faibles : gardées quand elles prolongent une détection fiable, avant comme après", () => {
  const fr = Array.from({ length: 10 }, (_v, i) => ({ t: i * 0.2, bc: [[10 + i, 8, i === 5 ? 0.5 : 0.08]] }));
  const pick = BT.select(fr);
  assert.ok(pick.every(Boolean), pick.map((p) => (p ? p[2] : "-")).join());
});
