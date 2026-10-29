"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const B = require("../src/ai/bilan");

test("bilan : part du terrain sûr, plages non confirmées et caméra perdue signalées", () => {
  const sv = []; for (let t = 0; t < 100; t += 0.3) sv.push([Math.round(t * 10) / 10, [], t >= 40 && t < 60 ? 0 : 2]);
  const r = B.bilan({ camSuivi: { frames: sv, lost: [[80, 95]], t0: 0, t1: 100 }, frames: [] });
  const te = r.find((l) => l.sujet === "terrain");
  assert.ok(te.sure > 0.78 && te.sure < 0.82, "environ 80 % sûr : " + te.sure);
  assert.match(te.texte, /00:40–01:00 \(tracé non confirmé\)/);
  assert.match(te.texte, /01:20–01:35 \(caméra perdue\)/);
});

test("bilan : ballon vu = part des images avec ballon, dit que ce n'est pas une justesse ; sans analyse ou sans suivi : « non évalué », rien d'inventé", () => {
  const fr = []; for (let t = 0; t < 60; t += 0.33) fr.push({ t, ball: t > 20 && t < 40 ? null : { x: 1, y: 1 } });
  const r = B.bilan({ frames: fr });
  const ba = r.find((l) => l.sujet === "ballon");
  assert.ok(ba.vu > 0.6 && ba.vu < 0.72);
  assert.match(ba.texte, /PAS une justesse/);
  assert.match(ba.texte, /00:20–00:40/);
  assert.match(r.find((l) => l.sujet === "terrain").texte, /non évalué/);
  assert.match(B.bilan({}).find((l) => l.sujet === "ballon").texte, /non évalué/);
  assert.match(r.find((l) => l.sujet === "personnes").texte, /non évalué/);
});
