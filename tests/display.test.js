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

test("terrain interpolé entre deux images voisines : suit la vidéo sans saut ; pas d'interpolation à travers un saut de caméra ou un trou", () => {
  const sc = (s, tx) => [s, 0, tx, 0, s, 0, 0, 0, 1];
  const frames = [{ t: 10, players: [], h: sc(40, 0) }, { t: 10.3, players: [], h: sc(40, 3) }, { t: 10.6, players: [], h: sc(40, 90) }, { t: 12, players: [], h: sc(40, 100) }];
  const cal = [{ t: 2, H: sc(2, 0) }];
  const mid = P.courtH(frames, cal, "mobile", 10.15, 1920, 1080);
  assert.equal(mid.source, "image-interpolee");
  assert.ok(Math.abs(mid.H[2] - 1.5) < 1e-9, "à mi-chemin entre 0 et 3 : " + mid.H[2]);
  const x = (t) => P.courtH(frames, cal, "mobile", t, 1920, 1080).H[2];
  assert.ok(x(10.05) < x(10.1) && x(10.1) < x(10.2), "croissant, sans marche d'escalier");
  // saut de caméra de 87 m entre 10,3 s et 10,6 s : pas d'interpolation, image la plus proche
  const saut = P.courtH(frames, cal, "mobile", 10.4, 1920, 1080);
  assert.equal(saut.source, "image"); assert.equal(saut.H[2], 3);
  // trou de plus de 0,8 s : image la plus proche seulement à 0,3 s, sinon calibrage ancien
  assert.equal(P.courtH(frames, cal, "mobile", 11.3, 1920, 1080).H, null);
  // temps exactement sur une image
  assert.equal(P.courtH(frames, cal, "mobile", 10.3, 1920, 1080).H[2], 3);
});

test("dérive du suivi à un nouveau calibrage : écart en mètres sur le terrain visible, null s'il y a trop peu de points", () => {
  // pixels (1920 x 1080) -> terrain 40 x 20 m : 50 px/m
  const Hcal = [1 / 48, 0, 0, 0, 1 / 54, 0, 0, 0, 1];
  assert.deepEqual(P.driftAt(Hcal, Hcal, 1920, 1080, 40, 20), { med: 0, max: 0, n: P.driftAt(Hcal, Hcal, 1920, 1080, 40, 20).n });
  const decale = [1 / 48, 0, 1, 0, 1 / 54, 0, 0, 0, 1];            // le suivi a glissé de 1 m en x
  const d = P.driftAt(decale, Hcal, 1920, 1080, 40, 20);
  assert.equal(d.med, 1); assert.equal(d.max, 1); assert.ok(d.n >= 8);
  const loin = [1 / 48, 0, 1000, 0, 1 / 54, 0, 0, 0, 1];
  assert.ok(P.driftAt(loin, Hcal, 1920, 1080, 40, 20).med >= 999);
  assert.equal(P.driftAt([0, 0, 0, 0, 0, 0, 0, 0, 1], Hcal, 1920, 1080, 40, 20).n >= 8, true);
  assert.equal(P.driftAt(Hcal, [1 / 4800, 0, 500, 0, 1 / 5400, 500, 0, 0, 1], 1920, 1080, 40, 20), null);      // calibrage dont le terrain n'est presque pas visible
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
