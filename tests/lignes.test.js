const test = require("node:test");
const assert = require("node:assert/strict");
const LG = require("../src/ai/lignes");
const CF = require("../src/ai/court-fit");
const HG = require("../src/ai/homography");
const { render } = require("./helpers/scene");

const L = 40, W = 20, w = 480, h = 270;
const POSE = [20, -5, 5, 90, 20, 70, 0];                  // caméra à 5 m de haut, 5 m derrière la touche, face au terrain
const POSE_SALLE = [19.4, -1.85, 3.6, 139.5, 13.3, 62.5, 0];   // caméra du calibrage de la vraie salle de test (près de la touche, 3,6 m de haut)
const mod = LG.modele(L, W, { pointilles: false });
const img = (pose, o) => render(pose.slice(0, 6), w, h, L, W, Object.assign({ lineHalf: 0.05, circle: true }, o || {}));
const bougee = (p, d) => p.map((v, i) => v + (d[i] || 0));

test("la couleur donnée est celle qui est cherchée : lignes noires trouvées, lignes blanches ignorées", () => {
  const im = img(POSE);
  // une ligne blanche large (comme les lignes d'un autre sport) en travers de l'image
  for (let y = 200; y < 204; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = 240; }
  const noire = LG.carte(im, "black"), blanche = LG.carte(im, "white");
  const part = (c, y0, y1) => { let n = 0; for (let y = y0; y < y1; y++) for (let x = 0; x < w; x++) n += c.mask[y * w + x]; return n; };
  assert.ok(part(blanche, 198, 206) > w * 0.8, "la ligne blanche est vue en blanc");
  assert.ok(part(noire, 198, 206) < w * 0.05, "et pas en noir");
  assert.ok(part(noire, 0, h) > 200, "les lignes noires du terrain sont vues en noir");
  assert.throws(() => LG.carte(im, "violet"), /inconnue/);
});

test("pose -> projection -> pose : la caméra est retrouvée à partir d'une projection du terrain", () => {
  const Hw = LG.hDepuisPose(POSE, w, h, L, W);
  assert.ok(Hw);
  const r = LG.poseDepuisH(Hw, w, h, L, W, null);
  assert.ok(r.err < 1.5, "écart de reprojection " + r.err);
  assert.ok(LG.ecartSol(POSE, r.pose, w, h) < 0.4, "même vue du sol : " + LG.ecartSol(POSE, r.pose, w, h));
});

test("mouvement d'image -> nouvelle pose : un panoramique de 3° est retrouvé", () => {
  const p2 = bougee(POSE, [0, 0, 0, 3, -1, 0, 0]);
  // mouvement d'image (pixels de l'image 1 -> pixels de l'image 2) des points du sol
  const src = [], dst = [];
  for (let i = 1; i < 10; i++) for (let j = 4; j < 9; j++) {
    const u = (w * i) / 10, v = (h * j) / 10, g = LG.solSous(POSE, w, h, u, v);
    const q = g && LG.poseVersImage(p2, w, h, g[0], g[1], 0);
    if (q) { src.push([u, v]); dst.push(q); }
  }
  const Hm = HG.solve(src, dst);
  const r = LG.poseApres(POSE, Hm, w, h);
  assert.ok(r.err < 0.8, "écart " + r.err);
  assert.ok(Math.abs(r.pose[3] - p2[3]) < 0.1 && Math.abs(r.pose[4] - p2[4]) < 0.1, r.pose.join(", "));
});

test("recalage : une pose décalée (cap +2°, inclinaison +1°, champ +3 %) est ramenée sur les lignes", () => {
  const c = LG.carte(img(POSE), "black");
  const p0 = bougee(POSE, [0, 0, 0, 2, 1, POSE[5] * 0.03, 0.5]);
  const e0 = LG.ecartSol(POSE, p0, w, h);
  const r = LG.affinerPose(c, p0, mod, { ref: POSE });
  assert.ok(r.ok && r.changed, "recalé : " + r.raison);
  const e1 = LG.ecartSol(POSE, r.pose, w, h);
  assert.ok(e1 < e0 * 0.4 && e1 < 0.6, "écart au vrai : " + e0.toFixed(2) + " m -> " + e1.toFixed(2) + " m");
});

test("recalage : tracé déjà sur les lignes = rien ne bouge ; image sans lignes de la couleur = refus, jamais de déplacement", () => {
  const c = LG.carte(img(POSE), "black");
  const r = LG.affinerPose(c, POSE, mod, { ref: POSE });
  assert.ok(r.ok && !r.changed, r.raison);
  const sans = LG.carte(render(POSE.slice(0, 6), w, h, L, W, { lines: false }), "black");
  const r2 = LG.affinerPose(sans, bougee(POSE, [0, 0, 0, 2, 1, 0, 0]), mod, { ref: POSE });
  assert.equal(r2.ok, false);
  assert.ok(/trop peu|amélioration/.test(r2.raison), r2.raison);
});

test("lignes vues dans une seule direction : le recalage refuse (le glissement le long des lignes n'est pas déterminé)", () => {
  const c = LG.carte(render(POSE_SALLE.slice(0, 6), w, h, L, W, { lineHalf: 0.05, circle: true }), "black");
  const r = LG.affinerPose(c, bougee(POSE_SALLE, [0, 0, 0, 2, 1, 0, 0]), mod, { ref: POSE_SALLE });
  assert.equal(r.ok, false);
  assert.match(r.raison, /une seule direction/);
});

test("des traits parasites denses près de l'horizon (murs, gradins) n'attirent pas le terrain : il reste sur les vraies lignes ou le recalage refuse", () => {
  const im = img(POSE);
  for (let y = 40; y < 70; y++) for (let x = 0; x < w; x++) if ((x + y) % 3 === 0) { const i = (y * w + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = 12; }
  const c = LG.carte(im, "black");
  const r = LG.affinerPose(c, bougee(POSE, [0, 0, 0, 1.5, 0.8, 0, 0]), mod, { ref: POSE });
  const fin = r.ok && r.changed ? r.pose : bougee(POSE, [0, 0, 0, 1.5, 0.8, 0, 0]);
  assert.ok(LG.ecartSol(POSE, fin, w, h) < 0.8, "écart au vrai " + LG.ecartSol(POSE, fin, w, h).toFixed(2) + " m (" + r.raison + ")");
});

test("éléments choisis au calibrage : le cercle central est prioritaire, les autres groupes selon les repères", () => {
  assert.deepEqual(LG.groupesDepuisRepères(["circle_top", "l_penalty", "corner_tl"]).sort(), ["cercle", "gauche", "touches"]);
  const m = LG.modele(L, W, { pointilles: false, prio: ["cercle"] });
  assert.equal(m.pts.find((p) => p.g === "cercle").w, 2);
  assert.equal(m.pts.find((p) => p.g === "mediane").w, 1);
});
