/* Reconnaissance des équipes : adaptations réservées aux tenues ambiguës, et non-régression pour les équipes bien distinctes. */
const test = require("node:test");
const assert = require("node:assert/strict");
const K = require("../src/ai/kit");
const T = require("../src/ai/tracker");
const P = require("../src/ai/pipeline");

/* Joueur synthétique 60x120 : buste (maillot) avec, en option, des manches d'une autre couleur et un numéro (lettrage),
   short, chaussettes ; fond = parquet bleu. */
function player(o) {
  const w = 60, h = 120, d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c = [60, 110, 160];
    if (y >= h * 0.15 && y < h * 0.5) {
      c = o.shirt;
      if (o.sleeves && (x < 18 || x >= 42)) c = o.sleeves;
      if (o.number && x >= 24 && x < 36 && y >= h * 0.24 && y < h * 0.42) c = o.number;
    } else if (y >= h * 0.5 && y < h * 0.68) c = o.shorts || o.shirt;
    else if (y >= h * 0.68 && y < h * 0.98) c = o.socks || o.shorts || o.shirt;
    const i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  return { data: d, width: w, height: h };
}
const BOX = [10, 10, 50, 110];
const ref = (o) => K.average([K.sample(player(o), BOX)]);
const feat = (o, refs, close) => { const im = player(o); return K.addAccents(K.sample(im, BOX), im, BOX, refs, close ? { close } : undefined); };

const RED = { shirt: [215, 50, 50], shorts: [240, 240, 240], socks: [215, 50, 50] };
const BLUE = { shirt: [30, 90, 220], shorts: [20, 30, 80], socks: [30, 90, 220] };
const WHITE = { shirt: [240, 240, 240], shorts: [240, 240, 240], socks: [240, 240, 240] };
const BLACK = { shirt: [20, 20, 20], shorts: [20, 20, 20], socks: [20, 20, 20] };
const ORANGE = { shirt: [235, 120, 30], shorts: [240, 240, 240], socks: [235, 120, 30] };
const SKY = { shirt: [90, 160, 235], shorts: [20, 30, 80], socks: [90, 160, 235] };
const YELLOW = { shirt: [240, 210, 40], shorts: [240, 240, 240], socks: [240, 210, 40] };
const GK_GREEN = { shirt: [40, 170, 70], shorts: [20, 20, 20], socks: [40, 170, 70] };
// le cas réel des vidéos de test : gris foncé à manches citron contre noir à lettrage doré
const GREY_LIME = { shirt: [38, 38, 40], sleeves: [175, 225, 45], shorts: [25, 25, 25], socks: [30, 30, 30] };
const BLACK_GOLD = { shirt: [16, 14, 14], number: [225, 170, 40], shorts: [14, 12, 12], socks: [20, 20, 20] };

/* ---------- non-régression : équipes bien distinctes, comportement identique à la 1.1.7 ---------- */
test("non-régression : équipes de couleurs distinctes ou voisines, aucune adaptation ne s'active", () => {
  const cases = [
    ["rouge contre bleu", RED, BLUE],
    ["sans liseré : blanc contre noir", WHITE, BLACK],
    ["couleurs voisines : rouge contre orange", RED, ORANGE],
    ["couleurs voisines : bleu roi contre bleu ciel", BLUE, SKY],
    ["couleurs voisines : blanc contre jaune", WHITE, YELLOW]
  ];
  for (const [name, a, b] of cases) {
    const refs = { A: ref(a), B: ref(b), GKA: ref(GK_GREEN) };
    const amb = K.ambiguity(refs);
    assert.equal(amb.close, false, name + " : écart " + K.dist(refs.A, refs.B).toFixed(1));
    assert.equal(amb.roles, false, name);
    assert.deepEqual(K.ambiguityMessages(refs), [], name);
    // chaque joueur reconnu, et exactement le même résultat qu'avant (options identiques à la 1.1.7)
    for (const [o, want] of [[a, "A"], [b, "B"], [GK_GREEN, "GKA"]]) {
      const old = K.classify(feat(o, refs), refs, { reject: 42 });
      assert.equal(old.team, want, name + " -> " + want);
    }
  }
});

test("non-régression : sans ambiguïté, le nettoyage final est le simple vote d'avant", () => {
  // un gardien qui sort de sa surface et un joueur dans la surface : rien n'est reclassé sans ambiguïté
  const frames = [];
  for (let i = 0; i < 20; i++) frames.push({ t: i * 0.2, players: [
    { id: 1, team: "GKA", x: 20, y: 10 }, { id: 2, team: "A", x: 2, y: 10 }, { id: 3, team: "REF", x: 3, y: 9 }, { id: 4, team: "B", x: 30, y: 4 }
  ] });
  const before = P.finalizeFrames(frames);
  const after = P.finalizeFrames(frames, { L: 40, W: 20, dirAt: () => 1, roles: false });
  assert.deepEqual(after, before);
  assert.deepEqual(after[0].players.map((p) => p.id + p.team), ["1GKA", "2A", "4B"]);
});

test("non-régression : le suivi adapté ne mélange pas deux équipes distinctes qui se croisent", () => {
  for (const opts of [undefined, { soft: 2 }]) {
    const tr = new T.Tracker(opts), seen = { 1: new Set(), 2: new Set() };
    for (let i = 0; i <= 20; i++) {
      const t = i * 0.2, dets = [{ x: 10 + i * 0.5, y: 10, team: "A", who: 1 }, { x: 20 - i * 0.5, y: 10.4, team: "B", who: 2 }];
      tr.update(t, dets).forEach((d) => seen[d.who].add(d.id));
    }
    assert.equal(seen[1].size, 1, JSON.stringify(opts)); assert.equal(seen[2].size, 1);
    assert.notDeepEqual([...seen[1]], [...seen[2]]);
  }
});

/* ---------- tenues ambiguës : adaptations ---------- */
test("tenues presque identiques : détectées, avertissement clair, liseré mesuré sur sa teinte", () => {
  const refs = { A: ref(GREY_LIME), B: ref(BLACK_GOLD) };
  const amb = K.ambiguity(refs);
  assert.equal(amb.close, true, "écart " + K.dist(refs.A, refs.B).toFixed(1));
  const msg = K.ambiguityMessages(refs, { A: "Mon équipe", B: "Adversaire" });
  assert.equal(msg.length, 1);
  assert.match(msg[0], /« Mon équipe » et « Adversaire » ont des tenues presque identiques/);
  assert.match(msg[0], /liseré/);
  // le lettrage doré n'est pas un liseré fluo : mesure par la teinte
  const im = player(BLACK_GOLD);
  assert.ok(K.trimHueFraction(im, BOX, refs.A.trim) < K.ACC_MIN_CLOSE);
  assert.ok(K.trimHueFraction(player(GREY_LIME), BOX, refs.A.trim) > 0.1);
  // classification adaptée : chacun dans son équipe
  assert.equal(K.classify(feat(GREY_LIME, refs, true), refs, { reject: 42, close: true }).team, "A");
  assert.equal(K.classify(feat(BLACK_GOLD, refs, true), refs, { reject: 42, close: true }).team, "B");
  // sans liseré du tout, l'avertissement le dit
  const plain = { A: ref({ shirt: [30, 30, 30] }), B: ref({ shirt: [20, 20, 20] }) };
  assert.match(K.ambiguityMessages(plain)[0], /Aucun liseré/);
});

test("tenues proches : le liseré de l'arbitre n'attire plus les autres personnes", () => {
  const REFEREE = { shirt: [235, 200, 30], sleeves: [150, 140, 70], shorts: [15, 15, 15], socks: [235, 200, 30] };
  const refs = { A: ref(GREY_LIME), B: ref(BLACK_GOLD), REF: ref(REFEREE) };
  const bench = { shirt: [60, 50, 40], sleeves: [150, 140, 70], shorts: [40, 40, 40], socks: [40, 40, 40] };   // remplaçant en survêtement sombre
  const f = feat(bench, refs, true);
  assert.notEqual(K.classify(f, refs, { reject: 42, close: true }).team, "REF");
  assert.equal(K.classify(feat(REFEREE, refs, true), refs, { reject: 42, close: true }).team, "REF");
});

test("gardien jaune et arbitre jaune : avertissement, puis rôle décidé par la position", () => {
  const GKY = { shirt: [240, 205, 30], shorts: [15, 15, 15], socks: [230, 195, 40] };
  const REFEREE = { shirt: [235, 200, 35], shorts: [15, 15, 15], socks: [235, 200, 35] };
  const refs = { A: ref(RED), B: ref(BLUE), GKB: ref(GKY), REF: ref(REFEREE) };
  const amb = K.ambiguity(refs);
  assert.equal(amb.close, false); assert.equal(amb.roles, true);
  assert.match(K.ambiguityMessages(refs, { GKB: "Gardien adverse", REF: "Arbitre" })[0], /« Gardien adverse » et « Arbitre »/);
  // pistes : 1 = « arbitre » qui reste dans la surface de droite (le gardien), 2 = vrai arbitre le long de la ligne de touche,
  // 3 = « gardien » qui joue au milieu (un joueur de champ, équipe f = B)
  const frames = [];
  for (let i = 0; i < 30; i++) frames.push({ t: i * 0.2, players: [
    { id: 1, team: "REF", x: 38 - (i % 3), y: 10 + (i % 4) * 0.5 },
    { id: 2, team: "REF", x: 10 + i * 0.5, y: 0.5 },
    { id: 3, team: "GKB", x: 15 + (i % 5), y: 8, f: "B" }
  ] });
  const out = P.finalizeFrames(frames, { L: 40, W: 20, dirAt: () => 1, roles: amb.roles });
  const team = (id) => (out[0].players.find((p) => p.id === id) || {}).team;
  assert.equal(team(1), "GKB", "l'équipe A attaque vers la droite : le but de droite est défendu par B");
  assert.equal(team(2), undefined, "l'arbitre reste écarté");
  assert.equal(team(3), "B");
  assert.ok(out.every((f) => f.players.every((p) => !("f" in p))), "l'information interne f n'est pas conservée");
  // au retour des vestiaires (dirAt = -1), le même but est défendu par A
  assert.equal(P.finalizeFrames(frames, { L: 40, W: 20, dirAt: () => -1, roles: true })[0].players.find((p) => p.id === 1).team, "GKA");
});

test("ambiguïté révélée en cours d'analyse : deux « gardiens » de la même équipe en même temps", () => {
  const frames = [];
  for (let i = 0; i < 20; i++) frames.push({ t: i * 0.2, players: [
    { id: 1, team: "GKB", x: 39, y: 10 },                 // le vrai gardien, dans son but
    { id: 2, team: "GKB", x: 12 + i * 0.3, y: 19.5 }      // l'arbitre (sans tenue de référence), pris pour un gardien
  ] });
  const out = P.finalizeFrames(frames, { L: 40, W: 20, dirAt: () => 1, roles: false });
  assert.equal(out[0].players.find((p) => p.id === 1).team, "GKB");
  assert.equal(out[0].players.find((p) => p.id === 2), undefined, "plus de deuxième gardien (pas d'équipe de champ connue : écarté)");
});

test("suivi adapté : une erreur d'équipe sur une image ne coupe plus la piste", () => {
  const run = (opts) => {
    const tr = new T.Tracker(opts), ids = new Set();
    for (let i = 0; i < 20; i++) ids.add(tr.update(i * 0.2, [{ x: 5 + i * 0.3, y: 5, team: i % 4 === 2 ? "B" : "A" }])[0].id);
    return ids.size;
  };
  assert.ok(run(undefined) > 1, "comportement d'avant : nouvelle piste à chaque erreur");
  assert.equal(run({ soft: 2 }), 1);
});

test("projet enregistré avec l'ancienne mesure des tenues : lu et analysé sans erreur", () => {
  // échantillons tels qu'enregistrés par les versions précédentes (couleurs Lab, liseré facultatif ou absent)
  const kits = {
    A: [{ shirt: [10, 3, 4], shorts: [8, 2, 2], socks: [30, 1, 3], trim: [78, -12, 51] }, { shirt: [7, 3, 3], shorts: [9, 1, 2], socks: [33, 0, 2], trim: [73, -11, 42] }],
    B: [{ shirt: [3, 3, 2], shorts: [2, 1, 1], socks: [25, 2, 3], trim: null }, { shirt: [3, 2, 2], shorts: [2, 1, 1], socks: [24, 2, 3] }],
    GKA: [{ shirt: [3, 2, 1], shorts: [2, 1, 1], socks: [17, 0, 1] }],
    REF: [{ shirt: [58, 3, 61], shorts: [3, 1, 1], socks: [40, 3, 18], trim: [57, -4, 35] }]
  };
  const refs = {}; Object.keys(kits).forEach((k) => { refs[k] = K.average(kits[k]); });
  const amb = K.ambiguity(refs);
  assert.equal(amb.close, true); assert.equal(amb.roles, true);
  const msgs = K.ambiguityMessages(refs);
  assert.ok(msgs.length >= 2 && msgs.every((m) => typeof m === "string" && m.length > 20));
  const im = player(GREY_LIME);
  const f = K.addAccents(K.sample(im, BOX), im, BOX, refs, { close: true });
  assert.ok(["A", "B", "GKA", "REF", "UNK"].includes(K.classify(f, refs, { reject: 42, close: true }).team));
});

test("rôles (cas ambigu) : remplaçant immobile écarté, gardien reconnu par la surface, un seul gardien par équipe", () => {
  const frames = [];
  for (let i = 0; i < 60; i++) frames.push({ t: i * 0.2, players: [
    { id: 1, team: "B", x: 26 + (i % 2) * 0.1, y: 17, f: "B" },                    // remplaçant assis : immobile 12 s
    { id: 2, team: "A", x: 2 + (i % 4) * 0.5, y: 9 + (i % 3) * 0.5, f: "A" },       // étiqueté joueur, mais toujours dans la surface de gauche
    { id: 3, team: "GKA", x: 3 + (i % 5) * 0.4, y: 11, f: "A" },                     // second « gardien » de gauche, moins présent
    { id: 4, team: "A", x: 12 + i * 0.3, y: 6, f: "A" }                              // joueur de champ qui court
  ].filter((p) => p.id !== 3 || i % 3 === 0) });
  const out = P.finalizeFrames(frames, { L: 40, W: 20, dirAt: () => 1, roles: true });
  const team = (id) => { const f = out.find((fr) => fr.players.some((p) => p.id === id)); return f ? f.players.find((p) => p.id === id).team : undefined; };
  assert.equal(team(1), undefined, "remplaçant immobile écarté");
  assert.equal(team(2), "GKA", "gardien reconnu par la surface (A défend à gauche)");
  assert.equal(team(3), "A", "second gardien redevenu joueur de champ");
  assert.equal(team(4), "A");
  assert.ok(out.every((fr) => fr.players.filter((p) => p.team === "GKA").length <= 1));
  // sans ambiguïté, rien de tout cela : simple vote, comme avant
  const plain = P.finalizeFrames(frames.map((f) => ({ t: f.t, players: f.players.filter((p) => p.id !== 3) })), { L: 40, W: 20, dirAt: () => 1, roles: false });
  assert.deepEqual(plain[0].players.map((p) => p.id + p.team), ["1B", "2A", "4A"]);
});
