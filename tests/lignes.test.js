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

/* ---------- couleur montrée par un clic, salle multi-lignes, confusion, dimensions ---------- */
const lignesImg = (opts) => {
  const o = Object.assign({ w: 200, h: 120, floor: [70, 110, 160], glare: 0 }, opts || {}), data = new Uint8ClampedArray(o.w * o.h * 4);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
    const i = (y * o.w + x) * 4, g = o.glare * (x / o.w);      // éclairage qui varie : reflet de plus en plus fort vers la droite
    data[i] = Math.min(255, o.floor[0] + g); data[i + 1] = Math.min(255, o.floor[1] + g); data[i + 2] = Math.min(255, o.floor[2] + g); data[i + 3] = 255;
  }
  const bande = (y0, y1, c, glare) => { for (let y = y0; y < y1; y++) for (let x = 0; x < o.w; x++) { const i = (y * o.w + x) * 4, g = glare ? o.glare * (x / o.w) * 0.6 : 0; data[i] = Math.min(255, c[0] + g); data[i + 1] = Math.min(255, c[1] + g); data[i + 2] = Math.min(255, c[2] + g); } };
  bande(30, 33, [25, 25, 28], true);          // ligne noire
  bande(60, 63, [120, 30, 30], true);         // ligne rouge foncé d'un autre sport
  bande(90, 93, [235, 235, 235], true);       // ligne blanche
  return { data, width: o.w, height: o.h };
};
/* part des colonnes où la bande contient un trait détecté */
const part = (c, y0, y1) => { let n = 0; for (let x = 0; x < c.w; x++) { let any = 0; for (let y = y0; y < y1; y++) any |= c.mask[y * c.w + x]; n += any; } return n / c.w; };

test("clic sur une ligne : la nuance est apprise, seules ces lignes sont cherchées (la rouge foncé et la blanche de la même salle sont ignorées)", () => {
  const im = lignesImg(), r = LG.profilDepuisClic(im, 100, 31);
  assert.ok(r.ok, r.raison);
  assert.ok(r.profil.L < 40 && r.profil.tol >= 8 && r.profil.tol <= 0.6 * Math.hypot(r.profil.L - r.profil.bg[0], r.profil.a - r.profil.bg[1], r.profil.b - r.profil.bg[2]) + 1e-6, JSON.stringify(r.profil));
  const c = LG.carte(im, "custom", r.profil);
  assert.ok(part(c, 28, 36) > 0.8, "la ligne montrée est trouvée : " + part(c, 28, 36));
  assert.ok(part(c, 58, 66) < 0.05, "la ligne rouge foncé n'est pas confondue : " + part(c, 58, 66));
  assert.ok(part(c, 88, 96) < 0.05, "la ligne blanche non plus : " + part(c, 88, 96));
  assert.throws(() => LG.carte(im, "custom"), /inconnue/, "pas de profil, pas de couleur devinée");
});

test("éclairage qui varie : la ligne montrée reste trouvée sous un reflet fort", () => {
  const im = lignesImg({ glare: 70 }), r = LG.profilDepuisClic(im, 20, 31);
  assert.ok(r.ok, r.raison);
  assert.ok(r.profil.tolL > 6, "tolérance de luminosité apprise sur ce projet : " + r.profil.tolL);
  const c = LG.carte(im, "custom", r.profil);
  assert.ok(part(c, 28, 36) > 0.7, "ligne noire sous reflet : " + part(c, 28, 36));
  assert.ok(part(c, 88, 96) < 0.1 && part(c, 58, 66) < 0.1);
});

test("clic sur le sol (aucune ligne) : on le dit, aucune couleur inventée", () => {
  const r = LG.profilDepuisClic(lignesImg(), 100, 12);
  assert.equal(r.ok, false);
  assert.match(r.raison, /pas de ligne nette/);
});

test("confusion : une salle propre donne peu de pixels hors lignes attendues, des joueurs / autres marquages sombres en donnent beaucoup", () => {
  const w = 480, h = 270, pose = [20, -5, 5, 90, 20, 70, 0];
  const propre = render(pose.slice(0, 6), w, h, L, W, { lineHalf: 0.05, circle: true }), sale = render(pose.slice(0, 6), w, h, L, W, { lineHalf: 0.05, circle: true });
  for (const y0 of [150, 165, 180, 195, 210, 225]) for (let y = y0; y < y0 + 3; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; sale.data[i] = sale.data[i + 1] = sale.data[i + 2] = 15; }       // autres marquages sombres de la salle
  const cp = LG.confusion(LG.carte(propre, "black"), pose, mod, L, W), cs = LG.confusion(LG.carte(sale, "black"), pose, mod, L, W);
  assert.ok(cp != null && cs != null);
  assert.ok(cp < 0.2, "salle propre : " + cp);
  assert.ok(cs > cp + 0.2, "avec des pixels sombres parasites : " + cs + " contre " + cp);
});

test("dimensions : un terrain de 36 × 18 m est proposé quand le projet dit 40 × 20 ; rien n'est proposé quand les dimensions sont déjà justes", () => {
  const TL = 36, TW = 18, w = 480, h = 270;
  const poses = [[18, -5, 5, 90, 20, 70, 0], [14, -4, 5, 75, 22, 70, 0], [22, -4, 5, 105, 22, 70, 0], [18, -6, 6, 90, 25, 75, 0], [17, -5, 5.5, 92, 21, 72, 0], [20, -5, 5, 100, 22, 70, 0]];
  const items = poses.map((p) => ({ carte: LG.carte(render(p.slice(0, 6), w, h, TL, TW, { lineHalf: 0.05, circle: true }), "black"), pose: p }));
  const r = LG.proposerDimensions(items, 40, 20);
  assert.ok(r.propose && r.L === 36 && r.W === 18 && r.accord, JSON.stringify(r));
  const r2 = LG.proposerDimensions(items, 36, 18);
  assert.equal(r2.propose, false, JSON.stringify(r2));
  assert.equal(LG.proposerDimensions(items.slice(0, 2), 40, 20), null, "trop peu d'images : pas de proposition");
});
