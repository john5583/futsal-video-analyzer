"use strict";
const test = require("node:test");
const assert = require("node:assert");
const TA = require("../src/ai/terrain-auto");
const HG = require("../src/ai/homography");

const Q = [11.55, 3.88, 0.45, 0.52, 0.03];       // distance, hauteur, écart de cap, inclinaison, roulis (valeurs mesurées sur la vidéo d'essai)

/* Points d'une ellipse (image 480×270) projetée par une pose du rond, avec du bruit et des points parasites. */
function pointsDuRond(q, fov, bruit, parasites, graine) {
  const Hn = TA.poseDepuisRond(q, fov), rand = TA.rnd(graine || 5), pts = [];
  for (let i = 0; i < 200; i++) {
    const a = 2 * Math.PI * i / 200, p = TA.versPixel(Hn, 3 * Math.cos(a), 3 * Math.sin(a));
    if (p && p[0] > 0 && p[0] < 480 && p[1] > 0 && p[1] < 270) pts.push([p[0] + (rand() - 0.5) * bruit, p[1] + (rand() - 0.5) * bruit]);
  }
  for (let i = 0; i < parasites; i++) pts.push([rand() * 480, rand() * 270]);
  return pts;
}

test("ellipse : une conique ajustée sur des points bruités retrouve centre et axes", () => {
  const e0 = { cx: 200, cy: 120, A: 70, B: 22, ang: 0.3 }, rand = TA.rnd(3), P = [];
  for (let i = 0; i < 120; i++) { const t = 2 * Math.PI * i / 120, x = e0.A * Math.cos(t), y = e0.B * Math.sin(t); P.push([e0.cx + x * Math.cos(e0.ang) - y * Math.sin(e0.ang) + (rand() - 0.5) * 0.6, e0.cy + x * Math.sin(e0.ang) + y * Math.cos(e0.ang) + (rand() - 0.5) * 0.6]); }
  const e = TA.ajusterConique(P);
  assert.ok(e, "ellipse trouvée");
  assert.ok(Math.abs(e.cx - 200) < 0.5 && Math.abs(e.cy - 120) < 0.5, "centre");
  assert.ok(Math.abs(e.A - 70) < 0.7 && Math.abs(e.B - 22) < 0.7, "axes");
});

test("ellipse : le RANSAC ignore les points parasites (fausses lignes) et ne tire rien d'un nuage sans ellipse", () => {
  const pts = pointsDuRond(Q, 91, 0.6, 300, 9), d = TA.detecterEllipse(pts, { seed: 4 });
  assert.ok(d && d.n >= 100, "au moins 100 points sur l'ellipse malgré 300 parasites");
  const rand = TA.rnd(11), nuage = []; for (let i = 0; i < 200; i++) nuage.push([rand() * 480, rand() * 270]);
  const r = TA.detecterEllipse(nuage, { seed: 4 });
  assert.ok(!r || r.frac < 0.35, "un nuage de points au hasard ne donne pas d'ellipse nette");
});

test("pose : la caméra est retrouvée (distance, hauteur) à partir de l'ellipse du rond", () => {
  const d = TA.detecterEllipse(pointsDuRond(Q, 91, 0.4, 60, 2), { seed: 3 });
  const p = TA.poseDepuisEllipse(d.e, 91, { essais: 80, seed: 1 });
  assert.ok(p.residu < 0.6, "résidu faible : " + p.residu);
  assert.ok(Math.abs(p.q[0] - Q[0]) / Q[0] < 0.04, "distance " + p.q[0]);
  assert.ok(Math.abs(p.q[1] - Q[1]) / Q[1] < 0.06, "hauteur " + p.q[1]);
});

test("appui : un rond projeté sur de vrais traits est confirmé, le même rond décalé de 25 px ne l'est pas", () => {
  const Hn = TA.poseDepuisRond(Q, 91), W = 480, H = 270, dt = new Uint8Array(W * H).fill(255);
  for (const [u, v] of TA.pointsRond(720)) { const p = TA.versPixel(Hn, u, v); if (!p) continue; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const x = Math.round(p[0]) + dx, y = Math.round(p[1]) + dy; if (x >= 0 && x < W && y >= 0 && y < H) dt[y * W + x] = Math.min(dt[y * W + x], Math.round(Math.hypot(dx, dy) * 8)); } }
  const bon = TA.ajusterRond(dt, Hn);
  assert.ok(bon.s0 >= 0.95, "rond confirmé sans correction : " + bon.s0);
  const dec = TA.ajusterRond(dt, HG.mul3([1, 0, 0.05, 0, 1, 0, 0, 0, 1], Hn));
  assert.ok(dec.s0 === null || dec.s0 < 0.45, "rond décalé non confirmé tel quel");
  assert.ok(dec.s1 >= 0.8, "mais il est remis sur le rond : " + dec.s1);
  assert.ok(dec.c.tx !== 0 || dec.c.ty !== 0, "une correction est proposée");
});

test("orientation : le calibrage du coach donne l'orientation du terrain et le champ, et refuse un calibrage ambigu", () => {
  const L = 40, Wd = 20, M = [0, -1, -1, 0], fov = 62, res = { ok: true, fov: 91, q: Q };
  const Hn = TA.poseH([-Q[0], 0, Q[1], 0.85, 0.35, 0.01], fov), lm = HG.landmarks(L, Wd), f = 1920 / 480;
  const points = [];
  for (const l of lm) {
    const X = l.x - L / 2, Y = l.y - Wd / 2, p = TA.versPixel(Hn, M[0] * X + M[1] * Y, M[2] * X + M[3] * Y);
    if (p && p[0] > 5 && p[0] < 475 && p[1] > 5 && p[1] < 265 && /^(l_|circle_left|corner_tl)/.test(l.id)) points.push({ id: l.id, ix: p[0] * f, iy: p[1] * f });
  }
  assert.ok(points.length >= 8, "assez de repères visibles : " + points.length);
  const o = TA.orienterCalibrage(points, 1920, L, Wd, res, { essais: 25 });
  assert.ok(o.ok, "orientation reconnue (erreur " + o.erreur + " contre " + o.secondeErreur + ")");
  assert.deepStrictEqual(o.M, M);
  assert.strictEqual(o.fov, 62, "le champ le plus serré est retenu");
  assert.ok(o.erreur < 3, "reproduit les clics à moins de 3 px : " + o.erreur);
  assert.strictEqual(TA.orienterCalibrage(points.slice(0, 3), 1920, L, Wd, res).ok, false, "moins de 4 repères : refus");
});

test("conversion : un point du terrain du programme revient à lui-même par la projection et son inverse", () => {
  const L = 40, Wd = 20, M = [0, -1, -1, 0], vw = 1920, vh = 1080, Hn = TA.poseDepuisRond(Q, 91);
  const proj = { Hn, c: { s: 1.01, a: 0.004, tx: 6, ty: -3 }, dx: 3, dy: 2, P: TA.projecteur(Hn, { s: 1.01, a: 0.004, tx: 6, ty: -3 }, 3, 2) };
  const hp = TA.homographieProgramme(proj, M, L, Wd, vw, vh);
  assert.ok(hp && hp.every(Number.isFinite), "homographie finie");
  for (const [X, Y] of [[20, 10], [17, 10], [20, 14], [12, 8]]) {
    const uv = [M[0] * (X - L / 2) + M[1] * (Y - Wd / 2), M[2] * (X - L / 2) + M[3] * (Y - Wd / 2)], p = proj.P(uv[0], uv[1]);
    const px = [p[0] * vw / 480, p[1] * vh / 270], c = HG.apply(hp, px[0], px[1]);
    assert.ok(Math.hypot(c[0] - X, c[1] - Y) < 1e-6, "(" + X + "," + Y + ") -> (" + c[0] + "," + c[1] + ")");
  }
});

test("niveaux : vérifié seulement avec deux preuves ; une localisation directe sans le rond reste probable", () => {
  assert.strictEqual(TA.niveau("rond"), "verifie");
  assert.strictEqual(TA.niveau("mos-suivi"), "verifie");
  assert.strictEqual(TA.niveau("mos-direct", false), "probable");
  assert.strictEqual(TA.niveau("mos-direct", true), "verifie");
  assert.strictEqual(TA.niveau("probable"), "probable");
  assert.strictEqual(TA.niveau("non"), "non");
  assert.strictEqual(TA.niveau("rond-seul"), "probable", "vidéo trop courte pour la mosaïque : le rond seul reste probable");
  assert.strictEqual(TA.niveau("rond-seul", true), "verifie", "promu par le but détecté");
});

test("ponts : une brève série non vérifiée entre deux images dont les corrections s'accordent est reliée, sinon elle reste non analysée", () => {
  const Hn = () => TA.poseDepuisRond(Q, 91), mk = (genre, c) => ({ k: 0, genre, c: c || null, dx: 0, dy: 0, s: null });
  const c = { s: 1, a: 0, tx: 3, ty: 1 };
  const bon = [mk("rond-corr", c), mk("non"), mk("non"), mk("rond-corr", { s: 1, a: 0, tx: 3.5, ty: 1 })];
  assert.strictEqual(TA.poserPonts(bon, Hn, 4, 4), 2);
  assert.ok(bon[1].genre === "pont" && bon[2].genre === "pont");
  const mauvais = [mk("rond-corr", c), mk("non"), mk("non"), mk("rond-corr", { s: 1, a: 0, tx: 40, ty: 10 })];
  assert.strictEqual(TA.poserPonts(mauvais, Hn, 4, 4), 0);
  assert.ok(mauvais[1].genre === "non" && mauvais[2].genre === "non", "corrections en désaccord : non analysé");
  const long = [mk("rond"), mk("non"), mk("non"), mk("non"), mk("non"), mk("non"), mk("rond")];
  assert.strictEqual(TA.poserPonts(long, Hn, 4, 4), 0, "trop long pour être relié");
});

test("projection : une image non analysée ne donne aucune projection (rien n'est tracé)", () => {
  const G = [[1, 0, 0, 0, 1, 0, 0, 0, 1], [1, 0, 0, 0, 1, 0, 0, 0, 1], [1, 0, 0, 0, 1, 0, 0, 0, 1], [1, 0, 0, 0, 1, 0, 0, 0, 1], [1, 0, 0, 0, 1, 0, 0, 0, 1]];
  const res = { ok: true, pas: 4, kref: 0, d0: Q[0], h0: Q[1], Hr: TA.poseDepuisRond(Q, 91), echantillons: [{ k: 0, genre: "rond", c: null, dx: 0, dy: 0, ori: null, fov: null, ro: false }, { k: 4, genre: "non", c: null, dx: 0, dy: 0, ori: null, fov: null, ro: false }] };
  assert.ok(TA.projectionImage(res, G, 0), "image vérifiée : projection");
  assert.strictEqual(TA.projectionImage(res, G, 4), null, "image non analysée : aucune projection");
  assert.strictEqual(TA.projectionImage({ ok: false }, G, 0), null, "terrain non identifié : aucune projection");
});

test("troisième preuve : un but détecté là où la pose le place promeut une image probable en vérifiée, un but décalé de 40 px non", () => {
  const G = []; for (let i = 0; i < 12; i++) G.push([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const Hr = TA.poseDepuisRond(Q, 91), mk = (k, genre, s) => ({ k, genre, c: null, dx: 0, dy: 0, s, ori: null, fov: null, ro: false });
  const res = { ok: true, pas: 4, kref: 0, d0: Q[0], h0: Q[1], Hr, stats: { verifiees: 1, probables: 2, non: 0, total: 3 }, echantillons: [mk(0, "rond", 0.8), mk(4, "probable", 0.6), mk(8, "probable", 0.6)] };
  const P0 = TA.projectionImage(res, G, 0).P, hl = 20.5;
  const boite = (P, dx) => { const a = P(-1.5, hl), b = P(1.5, hl); return [{ x0: Math.min(a[0], b[0]) + dx, x1: Math.max(a[0], b[0]) + dx, y1: Math.max(a[1], b[1]) + dx, score: 0.9 }]; };
  const detections = { 0: boite(P0, 0), 1: boite(TA.projectionImage(res, G, 4).P, 0), 2: boite(TA.projectionImage(res, G, 8).P, 40) };
  const n = TA.promouvoirParButs(res, G, detections, { demiLongueur: hl });
  assert.strictEqual(n, 1, "une seule image promue");
  assert.strictEqual(TA.projectionImage(res, G, 4).niveau, "verifie");
  assert.strictEqual(TA.projectionImage(res, G, 8).niveau, "probable", "but décalé de 40 px : reste probable");
  assert.strictEqual(res.stats.verifiees, 2);
  assert.strictEqual(res.stats.probables, 1);
});

test("veto du but : une image vérifiée où le but détecté est très loin de l'endroit prévu redevient non analysée", () => {
  const G = []; for (let i = 0; i < 12; i++) G.push([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const Hr = TA.poseDepuisRond(Q, 91), mk = (k, genre) => ({ k, genre, c: null, dx: 0, dy: 0, s: 0.8, ori: null, fov: null, ro: false });
  const res = { ok: true, pas: 4, kref: 0, d0: Q[0], h0: Q[1], Hr, stats: { verifiees: 3, probables: 0, non: 0, total: 3 }, echantillons: [mk(0, "rond"), mk(4, "rond"), mk(8, "rond")] };
  const hl = 20.5, boite = (k, dx) => { const P = TA.projectionImage(res, G, k).P, a = P(-1.5, hl), b = P(1.5, hl); return [{ x0: Math.min(a[0], b[0]) + dx, x1: Math.max(a[0], b[0]) + dx, y1: Math.max(a[1], b[1]) + dx, score: 0.9 }]; };
  TA.promouvoirParButs(res, G, { 0: boite(0, 0), 1: boite(4, 0), 2: boite(8, 60) }, { demiLongueur: hl });
  assert.strictEqual(TA.projectionImage(res, G, 0) !== null, true, "but conforme : gardée");
  assert.strictEqual(TA.projectionImage(res, G, 4) !== null, true, "but conforme : gardée");
  assert.strictEqual(TA.projectionImage(res, G, 8), null, "but décalé de 60 px sur 480 : vérifiée -> non analysée");
  assert.strictEqual(res.stats.veto, 1);
  assert.strictEqual(res.stats.verifiees, 2);
});

test("garde-fou : un vrai rond (même caméra vue sous d'autres orientations) est confirmé, de fausses détections incohérentes non", () => {
  const rand = TA.rnd(17), mk = (q, psi, th) => {
    const Hn = TA.poseH([-q[0], 0, q[1], psi, th, 0.01], 91), pts = [];
    for (let i = 0; i < 160; i++) { const a = 2 * Math.PI * i / 160, p = TA.versPixel(Hn, 3 * Math.cos(a), 3 * Math.sin(a)); if (p && p[0] > 0 && p[0] < 480 && p[1] > 0 && p[1] < 270) pts.push([p[0], p[1]]); }
    return pts.length >= 60 ? TA.detecterEllipse(pts.map((p) => [p[0] + (rand() - 0.5) * 0.4, p[1] + (rand() - 0.5) * 0.4]), { seed: 2 }) : null;
  };
  const vrais = []; for (let i = 0; i < 14; i++) vrais.push(mk([11.55, 3.88], 0.2 + 0.05 * i, 0.45 + 0.01 * i));
  const bons = vrais.filter(Boolean); assert.ok(bons.length >= 10, "assez d'ellipses synthétiques : " + bons.length);
  const jRef = vrais.findIndex(Boolean), poseRef = TA.poseDepuisEllipse(vrais[jRef].e, 91, { essais: 60, seed: 1 });
  assert.ok(TA.confirmerCamera(vrais, jRef, poseRef, 91) >= 8, "caméra fixe : au moins 8 images concordantes");
  const faux = []; for (let i = 0; i < 14; i++) faux.push(mk([6 + 3.3 * i, 1.8 + 0.4 * i], 0.3 + 0.03 * i, 0.3 + 0.03 * i));
  const jF = faux.findIndex(Boolean), poseF = TA.poseDepuisEllipse(faux[jF].e, 91, { essais: 60, seed: 1 });
  assert.ok(TA.confirmerCamera(faux, jF, poseF, 91) < 8, "détections de caméras différentes : refusées");
});
