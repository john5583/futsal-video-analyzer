"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const LG = require("../src/ai/lignes");
const { render } = require("./helpers/scene");

const L = 40, W = 20, w = 480, h = 270, POSE = [20, -5, 5, 90, 20, 70, 0];
const mod = LG.modele(L, W, { pointilles: false, prio: ["cercle"] });

test("rond central : sur un tracé juste il colle à un trait du sol ; décalé, il ne colle plus (le tracé faux est détecté)", () => {
  const img = render(POSE, w, h, L, W, { circle: true });
  const c = LG.carte({ data: img.data, width: w, height: h }, "black", null, null);
  const juste = LG.couvertureRond(mod, POSE, c, img);
  assert.ok(juste.vis >= 30, "le rond est visible dans la scène d'essai : " + juste.vis);
  assert.ok(juste.sur / juste.vis >= 0.5, "tracé juste : le rond est sur un trait (" + juste.sur + "/" + juste.vis + ")");
  const faux = POSE.slice(); faux[4] += 6; faux[1] -= 3;           // inclinaison et position fausses : le rond tombe ailleurs
  const rf = LG.couvertureRond(mod, faux, c, img);
  assert.ok(rf.vis === 0 || rf.sur / rf.vis < 0.3, "tracé faux : le rond ne colle pas (" + rf.sur + "/" + rf.vis + ")");
});

test("rond central : image de taille différente de la carte -> rien n'est compté (jamais de fausse certitude)", () => {
  const img = render(POSE, w, h, L, W, { circle: true });
  const c = LG.carte({ data: img.data, width: w, height: h }, "black", null, null);
  assert.deepEqual(LG.couvertureRond(mod, POSE, c, null), { vis: 0, sur: 0, tVis: 0, tSur: 0 });
});
