/* Correction animée sur la vraie vidéo : projection terrain -> image, interpolation, repli, stockage. */
const test = require("node:test");
const assert = require("node:assert/strict");
const HG = require("../src/ai/homography");
const O = require("../src/ai/overlay");
const P = require("../src/ai/pipeline");

// caméra synthétique : terrain (m) -> image normalisée
const Hc = HG.solve([[0, 0], [40, 0], [40, 20], [0, 20]], [[0.1, 0.35], [0.9, 0.35], [1.05, 0.95], [-0.05, 0.95]]);
function frame(t, pts, shift) {
  const H = shift ? HG.mul3([1, 0, shift, 0, 1, 0, 0, 0, 1], Hc) : Hc;
  return { t, players: pts.map(([x, y], i) => { const [u, v] = HG.apply(H, x, y); return { id: i + 1, team: i % 2 ? "B" : "A", x, y, b: [Math.round((u - 0.02) * 1000), Math.round((v - 0.12) * 1000), Math.round((u + 0.02) * 1000), Math.round(v * 1000)] }; }), ball: null };
}
const SIX = [[5, 5], [12, 15], [20, 8], [27, 12], [33, 4], [36, 17]];

test("projection retrouvée à partir des joueurs : terrain -> image presque exacte", () => {
  const p = O.frameProjection(frame(0, SIX));
  assert.ok(p && p.err < 0.03, JSON.stringify(p && p.err));
  const [u, v] = HG.apply(p.H, 20, 10), [u0, v0] = HG.apply(Hc, 20, 10);
  assert.ok(Math.hypot(u - u0, v - v0) < 0.003);
});

test("repli : moins de 4 joueurs, caméra perdue, aucune analyse", () => {
  assert.equal(O.frameProjection(frame(0, SIX.slice(0, 3))), null);
  const pr = new O.Projector([frame(10, SIX.slice(0, 3))], { lost: [] });
  assert.deepEqual(pr.at(10), { ok: false, reason: "trop-peu-de-joueurs" });
  const pr2 = new O.Projector([frame(10, SIX), frame(12, SIX)], { lost: [[10.5, 11.5]] });
  assert.equal(pr2.at(11).reason, "camera-perdue");
  assert.equal(new O.Projector([], {}).at(3).reason, "sans-analyse");
});

test("interpolation entre deux images analysées (caméra qui se déplace)", () => {
  const pr = new O.Projector([frame(0, SIX, 0), frame(0.2, SIX, 0.1)], { lost: [] });
  const mid = pr.at(0.1);
  assert.ok(mid.ok);
  const [u] = mid.project(20, 10), [u0] = HG.apply(Hc, 20, 10);
  assert.ok(Math.abs(u - (u0 + 0.05)) < 0.004, "à mi-chemin : moitié du déplacement");
});

test("projection enregistrée : conservée par le stockage compact, ignorée si absente (anciens projets)", () => {
  const f = frame(1, SIX);
  f.h = HG.invert(Hc).map((v) => Number(v.toPrecision(7)));
  const back = P.expandFrames(P.compactFrames([f, frame(2, SIX)]));
  assert.deepEqual(back[0].h, f.h);
  assert.equal(back[1].h, undefined);
  assert.ok(O.frameProjection(back[0]).stored);
});

test("dessins d'une perte de balle : cercles, ligne du ballon perdu, croix et correction", () => {
  const fs = [frame(4.6, SIX), frame(5, SIX)];
  fs.forEach((f) => { f.ball = { x: 21, y: 8 }; });
  const o = O.buildOverlay({ t: 5, type: "perte_zone_mediane" }, fs, { L: 40, W: 20 });
  assert.ok(o.items.some((i) => i.type === "ring" && i.label === "Perte"));
  assert.ok(o.items.some((i) => i.type === "line"));
  assert.ok(o.correction && o.correction.crosses.length === 1);
});
