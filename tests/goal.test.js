/* Détection d'un but sans couleur imposée : bleu/blanc, vert/blanc, couleur apprise, parquet sans faux but. */
const test = require("node:test");
const assert = require("node:assert/strict");
const CF = require("../src/ai/court-fit");
const G = require("../src/ai/goal");
const { render } = require("./helpers/scene");

const L = 40, W = 20, w = 960, h = 540;
const TRUE = [24, 13, 5.5, 188, 24, 70];
const WHITE = [235, 235, 235];
const work = (opts) => CF.prepare(render(TRUE, w, h, L, W, opts), 640);

test("but rouge et blanc : toujours trouvé (palette rouge)", () => {
  const g = G.detect(work()).goals[0];
  assert.ok(g);
  assert.equal(g.palette, "rouge");
});

test("but bleu et blanc sur parquet : trouvé sans réglage", () => {
  const g = G.detect(work({ floor: [196, 150, 96], goalColors: [[30, 80, 200], WHITE] })).goals[0];
  assert.ok(g, "but bleu trouvé");
  assert.equal(g.palette, "bleu");
});

test("but vert et blanc : trouvé", () => {
  const g = G.detect(work({ floor: [196, 150, 96], goalColors: [[30, 150, 60], WHITE] })).goals[0];
  assert.ok(g, "but vert trouvé");
});

test("parquet et lignes noires sans but : aucun faux but (toutes palettes)", () => {
  const wk = work({ floor: [196, 150, 96], goalColors: [[196, 150, 96], [196, 150, 96]] });
  assert.equal(G.detect(wk).goals.length, 0);
});

test("sol bleu sans poteaux : aucun faux but", () => {
  const wk = work({ goalColors: [[70, 110, 160], [70, 110, 160]] });
  assert.equal(G.detect(wk).goals.length, 0);
});

test("couleur inconnue (orange vif) : non trouvée d'office ; apprise sur le but montré, elle est retrouvée", () => {
  const opts = { floor: [70, 110, 160], goalColors: [[255, 140, 0], WHITE] };
  const wk = work(opts);
  assert.equal(G.detect(wk).goals.length, 0, "aucune couleur devinée");
  // le coach montre le but (pieds et haut des poteaux, en pixels de l'image de travail)
  const B = CF.cameraBasis(TRUE), f = CF.focalPx(wk.w, TRUE[5]);
  const post = (y) => { const a = CF.project(B, f, wk.w, wk.h, 0, y, 0), b = CF.project(B, f, wk.w, wk.h, 0, y, 2); return { u: a.u, v0: b.v, v1: a.v, width: 5, score: a.v - b.v }; };
  const shown = { left: post(W / 2 - 1.5), right: post(W / 2 + 1.5) };
  const pal = G.learnPalette(wk, shown);
  assert.ok(pal && pal.n >= 12, "couleur apprise");
  const g = G.detect(wk, { palettes: [pal] }).goals[0];
  assert.ok(g, "but retrouvé avec la couleur apprise");
  assert.ok(Math.abs(g.left.u - shown.left.u) < 5);
});

test("but blanc uni : rien n'est appris (aucune couleur inventée)", () => {
  const wk = work({ goalColors: [WHITE, WHITE] });
  const B = CF.cameraBasis(TRUE), f = CF.focalPx(wk.w, TRUE[5]);
  const post = (y) => { const a = CF.project(B, f, wk.w, wk.h, 0, y, 0), b = CF.project(B, f, wk.w, wk.h, 0, y, 2); return { u: a.u, v0: b.v, v1: a.v, width: 5, score: a.v - b.v }; };
  assert.equal(G.learnPalette(wk, { left: post(W / 2 - 1.5), right: post(W / 2 + 1.5) }), null);
});
