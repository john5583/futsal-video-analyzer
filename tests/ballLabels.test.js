/* Étiquettes du ballon : clic exact, image sans ballon, doublons, format d'export, aucune donnée inventée. */
const test = require("node:test");
const assert = require("node:assert/strict");
const BL = require("../src/ai/ballLabels");
const HG = require("../src/ai/homography");

test("étiquette valide : centre en pixels, remplace une étiquette de la même image", () => {
  const mem = {};
  BL.add(mem, { t: 10, u: 500.4, v: 300, w: 12, h: 12, vw: 1920, vh: 1080 });
  BL.add(mem, { t: 10.1, u: 510, v: 310, w: 12, h: 12, vw: 1920, vh: 1080 });
  assert.equal(mem.ballLabels.length, 1);
  assert.equal(mem.ballLabels[0].u, 510);
  BL.add(mem, { t: 12, none: true, vw: 1920, vh: 1080 });
  assert.deepEqual(BL.counts(mem), { total: 2, positives: 1, negatives: 1 });
});

test("étiquette refusée : hors de l'image, valeurs absentes ou non numériques", () => {
  const mem = {};
  assert.equal(BL.add(mem, { t: 1, u: -5, v: 10, w: 10, h: 10, vw: 1920, vh: 1080 }), null);
  assert.equal(BL.add(mem, { t: 1, u: 2000, v: 10, w: 10, h: 10, vw: 1920, vh: 1080 }), null);
  assert.equal(BL.add(mem, { t: NaN, u: 10, v: 10, vw: 1920, vh: 1080 }), null);
  assert.equal(BL.add(mem, { t: 1, u: NaN, v: 10, vw: 1920, vh: 1080 }), null);
  assert.equal(BL.add(mem, { t: 1, u: 10, v: 10 }), null);
  assert.equal(BL.list(mem).length, 0);
});

test("export YOLO : coordonnées normalisées, fichier vide pour une image sans ballon", () => {
  assert.equal(BL.yoloLine({ t: 1, u: 960, v: 540, w: 20, h: 20, vw: 1920, vh: 1080 }), "0 0.500000 0.500000 0.010417 0.018519\n");
  assert.equal(BL.yoloLine({ t: 1, none: true, vw: 1920, vh: 1080 }), "");
});

test("taille du ballon : issue de la projection quand elle est exploitable, sinon repli signalé comme estimé", () => {
  // terrain 40 x 20 m : 1 m = 40 pixels (image 1600 x 800), sans perspective
  const Hpx = [1 / 40, 0, 0, 0, 1 / 40, 0, 0, 0, 1];
  const s = BL.ballSize(800, 400, 1600, Hpx, HG);
  assert.ok(Math.abs(s.w - 8) <= 1 && s.est === true, "taille " + s.w);
  const nul = BL.ballSize(800, 400, 1920, null, HG);
  assert.equal(nul.w, Math.round(1920 * 0.012));
  assert.equal(nul.est, true);
});

test("état « incertain » et origine : ni positif ni négatif, jamais exporté, origine gardée seulement si connue", () => {
  const mem = {};
  BL.add(mem, { t: 1, u: 100, v: 100, w: 10, h: 10, vw: 1920, vh: 1080, src: "propose" });
  BL.add(mem, { t: 2, none: true, vw: 1920, vh: 1080, src: "aveugle" });
  const u = BL.add(mem, { t: 3, unsure: true, vw: 1920, vh: 1080, src: "clic" });
  BL.add(mem, { t: 4, u: 200, v: 200, w: 10, h: 10, vw: 1920, vh: 1080, src: "inconnue" });
  assert.deepEqual(BL.counts(mem), { total: 3, positives: 2, negatives: 1 });
  assert.equal(BL.unsureCount(mem), 1);
  assert.equal(BL.exportable(u), false);
  assert.equal(BL.yoloLine(u), "");
  assert.equal(mem.ballLabels[0].src, "propose");
  assert.equal(mem.ballLabels[1].src, "aveugle");
  assert.equal(mem.ballLabels[3].src, undefined);
  // un « incertain » remplace une étiquette de la même image, et inversement
  BL.add(mem, { t: 1.05, unsure: true, vw: 1920, vh: 1080 });
  assert.equal(BL.list(mem).find((o) => Math.abs(o.t - 1) < 0.1).unsure, true);
  assert.deepEqual(BL.counts(mem), { total: 2, positives: 1, negatives: 1 });
});
