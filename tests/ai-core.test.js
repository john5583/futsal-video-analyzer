const test = require("node:test");
const assert = require("node:assert/strict");
const H = require("../src/ai/homography");
const K = require("../src/ai/kit");
const T = require("../src/ai/tracker");

/* ---- homographie ---- */
const TRUE_H = [0.08, 0.01, -5, 0.002, 0.11, -2, 0.0004, 0.0009, 1]; // image -> terrain
const inv = H.invert(TRUE_H);

test("homographie : 4 points exacts retrouvent la transformation", () => {
  const court = [[0, 0], [40, 0], [40, 20], [0, 20]];
  const img = court.map(([x, y]) => H.apply(inv, x, y));
  const est = H.solve(img, court);
  const probe = H.apply(inv, 13, 7);
  const back = H.apply(est, probe[0], probe[1]);
  assert.ok(Math.hypot(back[0] - 13, back[1] - 7) < 1e-6);
  assert.ok(H.reprojectionError(est, img, court) < 1e-6);
});

test("homographie : 8 points légèrement bruités restent précis (< 0,25 m)", () => {
  const lm = H.landmarks(40, 20).filter((p) => ["corner_tl", "corner_tr", "corner_bl", "corner_br", "center", "l_penalty", "r_penalty", "mid_top"].includes(p.id));
  assert.equal(lm.length, 8);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
  const img = lm.map((p) => { const q = H.apply(inv, p.x, p.y); return [q[0] + rnd() * 2, q[1] + rnd() * 2]; });
  const est = H.solve(img, lm.map((p) => [p.x, p.y]));
  const probe = H.apply(inv, 25, 12), back = H.apply(est, probe[0], probe[1]);
  assert.ok(Math.hypot(back[0] - 25, back[1] - 12) < 0.25);
});

test("homographie : points alignés ou insuffisants refusés", () => {
  assert.throws(() => H.solve([[0, 0], [1, 1], [2, 2], [3, 3]], [[0, 0], [1, 0], [2, 0], [3, 0]]));
  assert.throws(() => H.solve([[0, 0], [1, 1]], [[0, 0], [1, 0]]));
});

test("repères du terrain : cohérence des dimensions", () => {
  const lm = Object.fromEntries(H.landmarks(40, 20).map((p) => [p.id, p]));
  assert.equal(lm.center.x, 20); assert.equal(lm.l_penalty.x, 6); assert.equal(lm.r_second.x, 30);
  assert.equal(lm.l_goal_bottom.y - lm.l_goal_top.y, 3);
  assert.equal(lm.l_area_bottom.y - lm.l_area_top.y, 15);
});

/* ---- tenues ---- */
function img(w, h, bands) { // bands : [y0, y1, [r,g,b]] en fraction de la hauteur
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c = [40, 120, 60]; // pelouse
    for (const [a, b, col] of bands) if (y >= h * a && y < h * b) c = col;
    const i = (y * w + x) * 4; data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
  }
  return { data, width: w, height: h };
}
const kitA = [[0.15, 0.5, [30, 90, 220]], [0.5, 0.68, [245, 245, 245]], [0.68, 0.98, [15, 40, 110]]];
const kitB = [[0.15, 0.5, [215, 50, 50]], [0.5, 0.68, [30, 30, 30]], [0.68, 0.98, [30, 30, 30]]];
const kitGK = [[0.15, 0.5, [235, 190, 20]], [0.5, 0.68, [30, 30, 30]], [0.68, 0.98, [30, 30, 30]]];

test("tenues : classification équipe / adversaire / gardien", () => {
  const box = [10, 10, 50, 110];
  const refs = {
    A: K.average([K.sample(img(60, 120, kitA), box)]),
    B: K.average([K.sample(img(60, 120, kitB), box)]),
    GKA: K.average([K.sample(img(60, 120, kitGK), box)])
  };
  assert.equal(K.classify(K.sample(img(60, 120, kitA), box), refs).team, "A");
  assert.equal(K.classify(K.sample(img(60, 120, kitB), box), refs).team, "B");
  assert.equal(K.classify(K.sample(img(60, 120, kitGK), box), refs).team, "GKA");
  // un arbitre tout en rose clair n'est ni A ni B : rejeté
  const ref = [[0.15, 0.5, [255, 150, 200]], [0.5, 0.98, [255, 150, 200]]];
  assert.equal(K.classify(K.sample(img(60, 120, ref), box), refs).team, "UNK");
  assert.equal(K.classify(null, refs).team, "UNK");
  assert.equal(K.sample(img(60, 120, kitA), [0, 0, 4, 10]), null);
});

test("tenues : tolère un peu de bruit et un fond parasite", () => {
  const noisy = img(60, 120, kitA);
  for (let i = 0; i < noisy.data.length; i += 4) { const n = (i * 37) % 21 - 10; noisy.data[i] = Math.max(0, Math.min(255, noisy.data[i] + n)); }
  const refs = { A: K.average([K.sample(img(60, 120, kitA), [10, 10, 50, 110])]), B: K.average([K.sample(img(60, 120, kitB), [10, 10, 50, 110])]) };
  assert.equal(K.classify(K.sample(noisy, [5, 5, 55, 115]), refs).team, "A");
  const sw = K.swatches(refs.A);
  assert.match(sw.shirt, /^#[0-9a-f]{6}$/);
});

/* ---- suivi ---- */
test("suivi : conserve les identités, sépare deux joueurs proches, crée de nouvelles pistes", () => {
  const tr = new T.Tracker();
  const frames = [];
  for (let i = 0; i < 20; i++) {
    const t = i * 0.2;
    const dets = [
      { x: 5 + i * 0.4, y: 5, team: "A" },
      { x: 6 + i * 0.4, y: 7, team: "B" },
      { x: 30, y: 10 - i * 0.2, team: "UNK" }
    ];
    frames.push({ t, players: tr.update(t, dets) });
  }
  const ids = [0, 1, 2].map((k) => new Set(frames.map((f) => f.players[k].id)).size);
  assert.deepEqual(ids, [1, 1, 1]);
  assert.notEqual(frames[0].players[0].id, frames[0].players[1].id);
  // un nouveau joueur apparaît loin : nouvelle piste
  const t2 = 4.2, d = tr.update(t2, [{ x: 12, y: 18, team: "A" }]);
  assert.ok(d[0].id > 3);
});

test("suivi : refuse les sauts impossibles et les croisements d'équipes", () => {
  const tr = new T.Tracker();
  const a = tr.update(0, [{ x: 5, y: 5, team: "A" }])[0].id;
  const b = tr.update(0.2, [{ x: 25, y: 15, team: "A" }])[0].id; // 28 m en 0,2 s : autre joueur
  assert.notEqual(a, b);
  const c = tr.update(0.4, [{ x: 25.2, y: 15, team: "B" }])[0].id; // même endroit mais autre équipe
  assert.notEqual(b, c);
});

test("suivi : équipe finale par vote majoritaire", () => {
  const frames = [0, 1, 2, 3, 4].map((i) => ({ t: i, players: [{ id: 1, team: i === 2 ? "B" : "A" }, { id: 2, team: "UNK" }] }));
  const teams = T.finalTeams(frames);
  assert.equal(teams[1], "A");
  assert.equal(teams[2], undefined);
});

/* ---- pipette et parties facultatives ---- */
test("pipette : couleur médiane d'un petit carré, insensible à un pixel parasite", () => {
  const im = img(60, 120, kitA);
  im.data[(30 * 60 + 30) * 4] = 255; im.data[(30 * 60 + 30) * 4 + 1] = 0; im.data[(30 * 60 + 30) * 4 + 2] = 0; // un pixel rouge parasite dans la zone du maillot
  const lab = K.pipette(im, 30, 30, 3);
  const hex = K.toHex(lab);
  assert.ok(Math.abs(parseInt(hex.slice(1, 3), 16) - 30) < 8 && Math.abs(parseInt(hex.slice(5, 7), 16) - 220) < 8, hex);
  assert.equal(K.pipette({ data: new Uint8ClampedArray(0), width: 0, height: 0 }, 5, 5, 2), null);
  assert.equal(K.fromParts(null, lab, lab), null);
  assert.deepEqual(K.fromParts(lab, null, undefined), { shirt: lab, shorts: null, socks: null, trim: null });
});

test("classification avec maillot seul : short et chaussettes ignorés, tolérance réglable", () => {
  const box = [10, 10, 50, 110];
  const shirtOnly = (kit) => { const f = K.sample(img(60, 120, kit), box); return K.fromParts(f.shirt, null, null); };
  const refs = { A: shirtOnly(kitA), B: shirtOnly(kitB) };
  // même maillot que A mais short et chaussettes de l'adversaire : reconnu comme A grâce au maillot
  const mixed = [[0.15, 0.5, [30, 90, 220]], [0.5, 0.68, [30, 30, 30]], [0.68, 0.98, [30, 30, 30]]];
  assert.equal(K.classify(K.sample(img(60, 120, mixed), box), refs).team, "A");
  // maillot légèrement différent : refusé avec une tolérance serrée, accepté avec une tolérance large
  const close = [[0.15, 0.5, [70, 120, 200]], [0.5, 0.98, [245, 245, 245]]];
  const f = K.sample(img(60, 120, close), box);
  assert.equal(K.classify(f, refs, { reject: 3 }).team, "UNK");
  assert.equal(K.classify(f, refs, { reject: 60 }).team, "A");
  // empreinte sans partie commune : distance infinie
  assert.equal(K.dist({ shirt: null, shorts: [1, 1, 1], socks: null }, { shirt: [1, 1, 1], shorts: null, socks: null }), Infinity);
  const avg = K.average([{ shirt: [10, 0, 0], shorts: null, socks: null }, { shirt: [20, 0, 0], shorts: [5, 5, 5], socks: null }]);
  assert.deepEqual(avg.shirt, [15, 0, 0]); assert.deepEqual(avg.shorts, [5, 5, 5]); assert.equal(avg.socks, null);
  const sw = K.swatches(avg);
  assert.match(sw.shirt, /^#[0-9a-f]{6}$/); assert.equal(sw.socks, null);
});

/* ---- liseré / manches ---- */
function sleeveImg(shirt, withLime) { // 60x120, buste gris ou noir, manches (bords) vert citron si demandé
  const w = 60, h = 120, d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c = [40, 120, 60];
    if (y >= h * 0.15 && y < h * 0.5) {
      c = shirt;
      if (withLime && (x < 20 || x >= 40)) c = [170, 220, 40];
    } else if (y >= h * 0.5 && y < h * 0.98) c = [20, 20, 20];
    const i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  return { data: d, width: w, height: h };
}
test("liseré : détecté sur des manches vert citron, absent sur un maillot noir", () => {
  const box = [10, 10, 50, 110];
  const withLime = K.sample(sleeveImg([120, 120, 120], true), box);
  const black = K.sample(sleeveImg([15, 15, 15], false), box);
  assert.ok(withLime.trim, "liseré trouvé");
  assert.equal(black.trim, null);
  assert.ok(K.accentFraction(sleeveImg([120, 120, 120], true), box, withLime.trim) > 0.1);
  assert.equal(K.accentFraction(sleeveImg([15, 15, 15], false), box, withLime.trim), 0);
});

test("liseré : sépare une équipe grise à manches vertes d'une équipe noire", () => {
  const box = [10, 10, 50, 110];
  const imgA = sleeveImg([35, 35, 35], true), imgB = sleeveImg([22, 22, 22], false);
  const refs = { A: K.average([K.sample(imgA, box)]), B: K.average([K.sample(imgB, box)]) };
  const fa = K.addAccents(K.sample(imgA, box), imgA, box, refs);
  const fb = K.addAccents(K.sample(imgB, box), imgB, box, refs);
  assert.equal(K.classify(fa, refs).team, "A");
  assert.equal(K.classify(fb, refs).team, "B");
});
