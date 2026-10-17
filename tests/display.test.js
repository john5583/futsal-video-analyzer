/* Affichage : terrain tracé seulement quand la projection est fiable ; petite carte placée hors du chemin des dessins. */
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../src/ai/pipeline");
const O = require("../src/ai/overlay");

const ID9 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

test("terrain : projection mesurée sur l'image analysée proche, sinon calibrage selon la caméra", () => {
  const frames = [{ t: 10, players: [], h: ID9 }];
  const cal = [{ t: 2, H: [2, 0, 0, 0, 2, 0, 0, 0, 1] }];
  const near = P.courtH(frames, cal, "mobile", 10.2, 1920, 1080);
  assert.equal(near.source, "image");
  assert.ok(Math.abs(near.H[0] - 1 / 1920) < 1e-9, "pixels -> terrain (échelle de l'image)");
  // caméra à la main, calibrage ancien, pas d'image analysée proche : rien n'est tracé (et on le dit)
  const old = P.courtH(frames, cal, "mobile", 60, 1920, 1080);
  assert.equal(old.H, null);
  assert.equal(old.source, "calibrage-ancien");
  // calibrage récent : tracé ; caméra fixe : tracé quel que soit l'instant
  assert.equal(P.courtH([], cal, "mobile", 2.3, 1920, 1080).source, "calibrage");
  assert.equal(P.courtH([], cal, "fixed", 600, 1920, 1080).source, "calibrage");
  assert.equal(P.courtH([], [], "mobile", 5, 1920, 1080), null);
});

const AREA = { w: 1000, h: 600 }, SIZE = { w: 300, h: 160 };
test("petite carte : coin libre choisi ; marges noires d'une vidéo verticale = idéales", () => {
  // joueurs au centre, dessins dans le coin bas droit
  const occ = [[700, 400, 980, 580], [400, 200, 600, 400]];
  assert.notEqual(O.chooseCorner(AREA, SIZE, occ, "br"), "br");
  // image verticale au centre (marges noires de 300 px de chaque côté) : un coin des marges est libre
  const image = [[300, 0, 700, 600]];
  assert.ok(["bl", "tl", "br", "tr"].includes(O.chooseCorner(AREA, SIZE, image, null)));
  assert.equal(O.chooseCorner(AREA, SIZE, [], null), "br", "rien ne gêne : coin par défaut");
});

test("petite carte : pas de sautillement (le coin actuel est gardé s'il est presque aussi bon)", () => {
  const small = [[720, 420, 760, 460]];               // léger recouvrement du coin bas droit
  assert.equal(O.chooseCorner(AREA, SIZE, small, "br"), "br");
  const big = [[700, 400, 990, 590]];                  // recouvrement net
  assert.notEqual(O.chooseCorner(AREA, SIZE, big, "br"), "br");
});
