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

test("projection de chaque image : conservée par le nettoyage final de l'analyse", () => {
  const f = frame(1, SIX); f.h = HG.invert(Hc);
  const frames = [0, 1, 2, 3].map((i) => Object.assign({}, f, { t: i * 0.2 }));
  const out = P.finalizeFrames(frames);
  assert.ok(out.every((x) => Array.isArray(x.h) && x.h.length === 9));
  const plain = P.finalizeFrames(frames.map((x) => ({ t: x.t, players: x.players, ball: null })));
  assert.ok(plain.every((x) => !("h" in x)), "anciennes analyses : rien n'est ajouté");
});

test("perte de balle sans coéquipier visible : le joueur est guidé vers le côté le plus proche", () => {
  const two = [[10, 6], [11, 7]];   // le joueur qui perd le ballon (A) et l'adversaire (B), seuls à l'image
  const fs = [frame(4.6, two), frame(5, two)];
  fs.forEach((f) => { f.ball = { x: 10.5, y: 6.5 }; });
  const o = O.buildOverlay({ t: 5, type: "perte_zone_def" }, fs, { L: 40, W: 20 });
  assert.ok(o.correction && o.correction.ghost, "une correction animée existe");
  assert.equal(o.correction.ghost.id, 1);
  assert.equal(o.correction.ghost.to[1], 1.5, "vers la ligne de touche la plus proche");
  assert.equal(o.correction.ghost.label, "Jouer vers l'extérieur");
});

/* ---------- écarts au plan tactique ---------- */
const mkPlanFrames = (A, extra) => [0, 0.2, 0.4].map((t) => ({ t, players: A.map((x, i) => ({ id: i + 1, team: "A", x, y: 4 + i * 4, b: [100 * i, 200, 100 * i + 40, 400] })).concat((extra && extra.players) || []), ball: (extra && extra.ball) || { x: 20, y: 10 } }));

test("plan : forme 2-2 au lieu de 3-1 -> cercles, joueur à déplacer vers la ligne attendue", () => {
  const fr = mkPlanFrames([5, 7, 17, 19]);
  const o = O.buildOverlay({ t: 0.2, type: "plan_forme", expected: [3, 1], observed: [2, 2] }, fr, { L: 40, W: 20 });
  assert.equal(o.ok, true);
  assert.equal(o.items.filter((i) => i.type === "ring").length, 4);
  assert.match(o.items.find((i) => i.label).label, /2-2 au lieu de 3-1/);
  assert.ok(o.correction && o.correction.ghost, "un joueur est déplacé");
  assert.equal(o.correction.ghost.id, 3, "le premier joueur dont la ligne diffère (rang 3)");
  assert.ok(o.correction.ghost.to[0] < 17, "il redescend vers la ligne de trois");
  assert.equal(O.shapeFix([{ x: 5, y: 1 }, { x: 7, y: 2 }, { x: 9, y: 3 }, { x: 22, y: 4 }], [3, 1]), null, "forme déjà respectée : rien à corriger");
});

test("plan : bloc trop bas -> zone visée et flèches vers le haut ; bloc trop haut -> flèches vers le bas", () => {
  const low = O.buildOverlay({ t: 0.2, type: "plan_bloc", target: [0.45, 1], shift: 6 }, mkPlanFrames([6, 8, 9, 10]), { L: 40, W: 20 });
  assert.ok(low.items.some((i) => i.type === "zone" && i.label === "Bloc visé"));
  assert.equal(low.correction.arrows.length, 4);
  assert.ok(low.correction.arrows.every((a) => a.pts[1][0] > a.pts[0][0]));
  assert.match(low.items.find((i) => i.type === "ring" && i.label).label, /trop bas/);
  const high = O.buildOverlay({ t: 0.2, type: "plan_bloc", target: [0, 0.38], shift: -6 }, mkPlanFrames([26, 28, 29, 30]), { L: 40, W: 20 });
  assert.ok(high.correction.arrows.every((a) => a.pts[1][0] < a.pts[0][0]));
});

test("plan : pressing manquant -> porteur et joueur le plus proche, correction près du porteur", () => {
  const fr = mkPlanFrames([4, 5, 6, 7], { players: [{ id: 20, team: "B", x: 26, y: 10 }], ball: { x: 26, y: 10 } });
  const o = O.buildOverlay({ t: 0.2, type: "plan_pressing" }, fr, { L: 40, W: 20 });
  assert.ok(o.items.some((i) => i.label === "Porte le ballon"));
  assert.ok(o.items.some((i) => i.label === "Ne presse pas"));
  assert.ok(o.correction.ghost && Math.abs(o.correction.ghost.to[0] - 24.5) < 0.1 && Math.abs(o.correction.ghost.to[1] - 10) < 0.1);
});

test("plan : gardien monté -> cercle sur le gardien et retour dans sa zone ; bloc étiré = dessin de l'erreur du catalogue", () => {
  const fr = mkPlanFrames([10, 12, 14, 16], { players: [{ id: 9, team: "GKA", x: 28, y: 10 }] });
  const g = O.buildOverlay({ t: 0.2, type: "plan_gardien" }, fr, { L: 40, W: 20 });
  assert.ok(g.items.some((i) => i.label === "Gardien trop haut" && i.id === 9));
  assert.deepEqual(g.correction.ghost.to, [3, 10]);
  const e = O.buildOverlay({ t: 0.2, type: "plan_etire" }, mkPlanFrames([2, 8, 14, 22]), { L: 40, W: 20 });
  assert.equal(e.kind, "bloc", "même dessin que « équipe étirée »");
});

test("plan : repère inversé à la 2e période (mon équipe attaque vers x décroissant) : les positions restent justes", () => {
  const fr = mkPlanFrames([35, 33, 23, 21]);
  const o = O.buildOverlay({ t: 0.2, type: "plan_forme", expected: [3, 1], observed: [2, 2] }, fr, { L: 40, W: 20, dirAt: () => -1 });
  assert.equal(o.items.filter((i) => i.type === "ring").length, 4);
  assert.ok(o.correction.ghost.to[0] > 23, "dans le repère réel, le joueur se rapproche de sa ligne");
});
