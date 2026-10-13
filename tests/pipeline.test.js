const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../src/ai/pipeline");
const HG = require("../src/ai/homography");
const K = require("../src/ai/kit");
const T = require("../src/ai/tracker");

test("vignettes : image entière ou deux moitiés qui se recouvrent", () => {
  assert.deepEqual(P.tileRects(1920, 1080, 1), [{ x: 0, y: 0, w: 1920, h: 1080 }]);
  const two = P.tileRects(1920, 1080, 2);
  assert.equal(two.length, 2);
  assert.equal(two[0].x, 0); assert.equal(two[1].x + two[1].w, 1920);
  assert.ok(two[0].x + two[0].w > two[1].x, "recouvrement");
  const portrait = P.tileRects(1080, 1920, 2);
  assert.equal(portrait[0].h, Math.round(1920 * 0.6));
  assert.equal(portrait[1].y + portrait[1].h, 1920);
});

test("fusion des vignettes : boîtes remises dans l'image et doublons supprimés", () => {
  const rects = P.tileRects(1280, 720, 2);
  // même joueur vu dans la zone de recouvrement par les deux vignettes
  const r = 640 / rects[0].w;
  const person = { x1: 520, y1: 200, x2: 560, y2: 300 };
  const inTile = (rect) => ({ rect, dets: [{ cls: 0, score: 0.8, x1: (person.x1 - rect.x) * r, y1: (person.y1 - rect.y) * r, x2: (person.x2 - rect.x) * r, y2: (person.y2 - rect.y) * r }] });
  const merged = P.mergeTiles([inTile(rects[0]), inTile(rects[1])]);
  assert.equal(merged.length, 1);
  assert.ok(Math.abs(merged[0].x1 - 520) < 1 && Math.abs(merged[0].y2 - 300) < 1);
});

test("étalonnage en vigueur à un instant donné", () => {
  const c = [{ t: 0, id: "a" }, { t: 600, id: "b" }];
  assert.equal(P.calibrationAt(c, 10).id, "a");
  assert.equal(P.calibrationAt(c, 600).id, "b");
  assert.equal(P.calibrationAt(c, 9999).id, "b");
  assert.equal(P.calibrationAt([], 5), null);
});

function solidImg(w, h, rgb) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255; }
  return { data, width: w, height: h };
}

test("détections -> joueurs sur le terrain : projection, filtres, équipes, ballon", () => {
  // image 1000 x 500 px ; homographie simple : terrain = pixel / 25 en x, pixel / 25 en y (40 m x 20 m)
  const src = [[0, 0], [1000, 0], [1000, 500], [0, 500]], dst = [[0, 0], [40, 0], [40, 20], [0, 20]];
  const H = HG.solve(src, dst);
  const bandImg = (c) => { // maillot / short / chaussettes
    const im = solidImg(1000, 500, [40, 120, 60]);
    const paint = (y0, y1, rgb) => { for (let y = y0; y < y1; y++) for (let x = 100; x < 160; x++) { const i = (y * 1000 + x) * 4; im.data[i] = rgb[0]; im.data[i + 1] = rgb[1]; im.data[i + 2] = rgb[2]; } };
    paint(220, 290, c[0]); paint(290, 330, c[1]); paint(360, 400, c[2]);
    return im;
  };
  const img = bandImg([[30, 90, 220], [245, 245, 245], [15, 40, 110]].map((x) => x));
  const box = [100, 200, 160, 400];
  const refs = { A: K.average([K.sample(img, box)]), B: K.average([K.sample(bandImg([[215, 50, 50], [30, 30, 30], [30, 30, 30]]), box)]) };
  const dets = [
    { cls: 0, score: 0.9, x1: 100, y1: 200, x2: 160, y2: 400 },     // joueur A, pieds en (130, 400) -> (5.2 m, 16 m)
    { cls: 0, score: 0.9, x1: 500, y1: 210, x2: 506, y2: 222 },     // trop petit : ignoré
    { cls: 0, score: 0.9, x1: 300, y1: 480, x2: 360, y2: 700 },     // pieds hors terrain : ignoré
    { cls: 0, score: 0.9, x1: 600, y1: 300, x2: 760, y2: 340 },     // trop large (couché/artefact) : ignoré
    { cls: 32, score: 0.9, x1: 100, y1: 300, x2: 160, y2: 306 },    // « ballon » très allongé (marquage au sol) : ignoré
    { cls: 32, score: 0.15, x1: 700, y1: 300, x2: 710, y2: 310 },   // confiance trop faible : ignoré
    { cls: 32, score: 0.5, x1: 495, y1: 245, x2: 505, y2: 255 },    // ballon en (500, 250) -> (20, 10)
    { cls: 32, score: 0.2, x1: 10000, y1: 10000, x2: 10010, y2: 10010 } // ballon hors champ
  ];
  const tracker = new T.Tracker();
  const f = P.processDetections(dets, { frameW: 1000, frameH: 500, scale: 1, img, H, L: 40, W: 20, refs, tracker, t: 1.5 });
  assert.equal(f.players.length, 1);
  const p = f.players[0];
  assert.equal(p.team, "A");
  assert.ok(Math.abs(p.x - 5.2) < 0.05 && Math.abs(p.y - 16) < 0.05, p.x + "," + p.y);
  assert.deepEqual(p.b, [100, 400, 160, 800]);
  assert.ok(Math.abs(f.ball.x - 20) < 0.1 && Math.abs(f.ball.y - 10) < 0.1);
});

test("finalisation : vote d'équipe, pistes éphémères et joueurs non identifiés retirés", () => {
  const mk = (t, players) => ({ t, ball: null, players });
  const frames = [];
  for (let i = 0; i < 6; i++) frames.push(mk(i, [{ id: 1, team: i === 3 ? "B" : "A", x: 5, y: 5, b: [0, 0, 1, 1] }, { id: 2, team: "UNK", x: 9, y: 9, b: [0, 0, 1, 1] }, { id: 3, team: "B", x: 7, y: 7, b: [0, 0, 1, 1] }].slice(0, i < 2 ? 3 : 2)));
  const out = P.finalizeFrames(frames);
  const ids = new Set(); out.forEach((f) => f.players.forEach((p) => ids.add(p.id + p.team)));
  assert.ok(ids.has("1A"));
  assert.ok(![...ids].some((s) => s.startsWith("2")), "non identifié retiré");
  assert.ok(![...ids].some((s) => s.startsWith("3")), "piste de 2 images retirée");
});

test("stockage compact : aller-retour sans perte utile", () => {
  const frames = [{ t: 1.234, ball: { x: 5.5, y: 6.5 }, players: [{ id: 4, team: "GKA", x: 1.2, y: 10, b: [1, 2, 3, 4] }, { id: 7, team: "B", x: 20.25, y: 3, b: [10, 20, 30, 40] }] }, { t: 2, ball: null, players: [] }];
  const back = P.expandFrames(P.compactFrames(frames));
  assert.equal(back.length, 2);
  assert.equal(back[0].players[0].team, "GKA");
  assert.deepEqual(back[0].players[1].b, [10, 20, 30, 40]);
  assert.equal(back[1].ball, null);
  assert.deepEqual(P.expandFrames(null), []);
  assert.ok(JSON.stringify(P.compactFrames(frames)).length < JSON.stringify(frames).length);
});

test("image la plus proche d'un instant et échantillonnage", () => {
  const fr = [0, 0.2, 0.4, 5].map((t) => ({ t, players: [] }));
  assert.equal(P.frameNear(fr, 0.31, 0.5).t, 0.4);
  assert.equal(P.frameNear(fr, 2, 0.5), null);
  assert.equal(P.frameNear([], 1), null);
  assert.deepEqual(P.sampleTimes(0, 1, 2), [0, 0.5, 1]);
  assert.equal(P.sampleTimes(10, 70, 5).length, 301);
});

test("fusion des vignettes : un joueur coupé par la limite d'une vignette est ignoré s'il est vu en entier", () => {
  const rects = P.tileRects(1000, 1600, 2); // vignettes verticales qui se recouvrent
  const ratio = (rc) => Math.min(640 / rc.w, 640 / rc.h);
  const r1 = ratio(rects[0]), r2 = ratio(rects[1]);
  const rect0 = rects[0], rect1 = rects[1];
  // joueur entier : y 700..1000 (visible dans la vignette 0 sans toucher sa limite basse 960 ? -> on le place à 760..940)
  const full = { x1: 400, y1: 760, x2: 460, y2: 940 };
  const inTile = (rect, r, b, clipY2) => ({ rect, dets: [{ cls: 0, score: 0.8, x1: (b.x1 - rect.x) * r, y1: (b.y1 - rect.y) * r, x2: (b.x2 - rect.x) * r, y2: ((clipY2 != null ? clipY2 : b.y2) - rect.y) * r }] });
  // un autre joueur coupé en bas de la vignette 0 (limite à y = 960) et entier dans la vignette 1
  const cutBottom = { x1: 600, y1: 800, x2: 660, y2: 1000 };
  const tile0 = { rect: rect0, dets: inTile(rect0, r1, full).dets.concat(inTile(rect0, r1, cutBottom, rect0.y + rect0.h).dets) };
  const tile1 = { rect: rect1, dets: inTile(rect1, r2, cutBottom).dets };
  const merged = P.mergeTiles([tile0, tile1], 1000, 1600).filter((d) => d.cls === 0);
  const nearCut = merged.filter((d) => Math.abs((d.x1 + d.x2) / 2 - 630) < 20);
  assert.equal(nearCut.length, 1, "un seul exemplaire du joueur coupé");
  assert.ok(nearCut[0].y2 >= 990, "on garde la boîte complète");
  assert.equal(merged.filter((d) => Math.abs((d.x1 + d.x2) / 2 - 430) < 20).length, 1);
  // sans dimensions de l'image : comportement précédent (aucun marquage)
  assert.ok(P.mergeTiles([tile0, tile1]).length >= 2);
});

test("zoom automatique : zone du terrain et vignettes qui la recouvrent", () => {
  const H = [0.05, 0, 0, 0, 0.05, 0, 0, 0, 1]; // 20 px par mètre : terrain 40×20 m = 800×400 px
  const r = P.courtRegion(H, 40, 20, 1, 1000, 600);
  assert.ok(r && r.x === 0 && r.y === 0 && r.w > 800 && r.w <= 1000 && r.h > 400 && r.h <= 600, JSON.stringify(r));
  const rects = P.zoomRects({ x: 0, y: 100, w: 1900, h: 700 });
  assert.ok(rects.length >= 2 && rects.length <= 4);
  assert.equal(rects[0].x, 0);
  assert.equal(rects[rects.length - 1].x + rects[rects.length - 1].w, 1900);
  for (let i = 1; i < rects.length; i++) assert.ok(rects[i].x < rects[i - 1].x + rects[i - 1].w, "recouvrement");
  rects.forEach((q) => assert.ok(q.y === 100 && q.h === 700));
  // vertical (vidéo portrait)
  const v = P.zoomRects({ x: 10, y: 0, w: 600, h: 1700 });
  assert.ok(v.length >= 2 && v.every((q) => q.x === 10 && q.w === 600));
  // zone inutilisable : le terrain passe derrière la caméra -> pas de zoom (retour à l'image entière)
  assert.equal(P.courtRegion([1, 0, 0, 0, 1, 0, 0.1, 0, -1], 40, 20, 1, 1000, 600), null);
});
