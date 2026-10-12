const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../src/ai/match");

const L = 40, W = 20;
/* Fabrique une séquence : chaque pas décrit la position des joueurs et du ballon. */
function seq(n, fn, dt) {
  const frames = [];
  for (let i = 0; i < n; i++) frames.push(Object.assign({ t: i * (dt || 0.2) }, fn(i, i * (dt || 0.2))));
  return frames;
}
const P = (id, team, x, y) => ({ id, team, x, y });
const base = () => [P(1, "GKA", 1.5, 10), P(2, "A", 10, 6), P(3, "A", 12, 14), P(4, "A", 18, 10), P(5, "A", 22, 10),
  P(11, "GKB", 38.5, 10), P(12, "B", 28, 6), P(13, "B", 30, 14), P(14, "B", 26, 10), P(15, "B", 32, 10)];

test("rien de suspect sur un jeu équilibré", () => {
  // les joueurs bougent (oscillation) et le ballon suit le porteur
  const fr = seq(50, (i, t) => {
    const pl = base().map((p, k) => ({ ...p, x: p.x + Math.sin(t * 1.5 + k) * 1.2, y: p.y + Math.cos(t * 1.3 + k) * 1.2 }));
    return { players: pl, ball: { x: pl[4].x + 0.4, y: pl[4].y } };
  });
  const r = M.analyze(fr, { L, W });
  assert.deepEqual(r.events.map((e) => e.type), []);
  assert.equal(r.stats.possession.A, 100);
});

test("perte en zone défensive puis contre-attaque : événements détectés", () => {
  // 0-2 s : A (n°2) a le ballon dans sa zone ; ensuite B (n°14) le récupère et fonce vers le but
  const fr = seq(40, (i, t) => {
    const pl = base();
    let ball;
    if (t < 2) { ball = { x: 9.5, y: 6 }; }
    else {
      const bx = Math.max(3, 9 - (t - 2) * 3);
      pl[8] = P(14, "B", bx - 0.5, 8);                    // porteur adverse
      pl[7] = P(13, "B", bx + 1, 12);                    // soutien
      pl[6] = P(12, "B", bx + 2, 5);
      ball = { x: bx, y: 8 };
    }
    return { players: pl, ball };
  });
  const r = M.analyze(fr, { L, W });
  const types = r.events.map((e) => e.type);
  assert.ok(types.includes("perte_zone_def"), types.join());
  assert.ok(types.includes("contre_attaque_subie") || types.includes("repli_tardif"), types.join());
  const loss = r.events.find((e) => e.type === "perte_zone_def");
  assert.equal(loss.zone, "DEF"); assert.equal(loss.outcome, "PERTE"); assert.ok(loss.auto);
});

test("sens du jeu inversé : mêmes résultats avec dirAt négatif", () => {
  const fr = seq(40, (i, t) => {
    const pl = base().map((p) => ({ ...p, x: L - p.x, y: W - p.y }));
    let ball;
    if (t < 2) ball = { x: L - 9.5, y: W - 6 };
    else { const bx = Math.max(3, 9 - (t - 2) * 3); pl[8] = P(14, "B", L - bx + 0.5, W - 8); pl[7] = P(13, "B", L - bx - 1, W - 12); pl[6] = P(12, "B", L - bx - 2, W - 5); ball = { x: L - bx, y: W - 8 }; }
    return { players: pl, ball };
  });
  const r = M.analyze(fr, { L, W, dirAt: () => -1 });
  assert.ok(r.events.some((e) => e.type === "perte_zone_def"));
});

test("équipe étirée, joueur libre et espace dans le dos", () => {
  const fr = seq(40, () => {
    const pl = base();
    pl[2] = P(3, "A", 31, 14);          // un joueur très haut : profondeur 22 m avec le n°2 à 9 m
    pl[1] = P(2, "A", 9, 6);
    pl[7] = P(13, "B", 5, 10);          // adverse libre derrière notre dernier défenseur
    pl[8] = P(14, "B", 14, 10);
    return { players: pl, ball: { x: 14.5, y: 10 } };
  });
  const types = M.analyze(fr, { L, W }).events.map((e) => e.type);
  assert.ok(types.includes("equipe_etiree"), types.join());
  assert.ok(types.includes("espace_dos_fixo"), types.join());
});

test("marquage perdu : adversaire seul devant notre but", () => {
  const fr = seq(30, () => {
    const pl = base();
    pl[1] = P(2, "A", 12, 3); pl[2] = P(3, "A", 12, 17); pl[3] = P(4, "A", 17, 10);
    pl[7] = P(13, "B", 7, 11);            // seul à 7 m du but, plus de 3,5 m des défenseurs
    pl[8] = P(14, "B", 14.5, 10);         // porteur
    return { players: pl, ball: { x: 14, y: 10 } };
  });
  const types = M.analyze(fr, { L, W }).events.map((e) => e.type);
  assert.ok(types.includes("marquage_perdu"), types.join());
});

test("largeur mal occupée et attaque statique en attaque placée", () => {
  const fr = seq(60, () => ({ players: [P(1, "GKA", 1.5, 10), P(2, "A", 24, 8), P(3, "A", 26, 11), P(4, "A", 28, 9), P(5, "A", 25, 10),
    P(11, "GKB", 38.5, 10), P(12, "B", 34, 7), P(13, "B", 34, 13), P(14, "B", 31, 10), P(15, "B", 36, 10)], ball: { x: 25.5, y: 10 } }));
  const types = M.analyze(fr, { L, W }).events.map((e) => e.type);
  assert.ok(types.includes("largeur_mal_occupee"), types.join());
  assert.ok(types.includes("attaque_statique"), types.join());
});

test("porteur isolé en zone offensive", () => {
  const fr = seq(30, () => ({ players: [P(1, "GKA", 1.5, 10), P(2, "A", 30, 10), P(3, "A", 10, 5), P(4, "A", 12, 15), P(5, "A", 14, 10),
    P(11, "GKB", 38.5, 10), P(12, "B", 33, 8), P(13, "B", 33, 12), P(14, "B", 28, 10), P(15, "B", 35, 10)], ball: { x: 30.5, y: 10 } }));
  const types = M.analyze(fr, { L, W }).events.map((e) => e.type);
  assert.ok(types.includes("pivot_isole"), types.join());
});

test("délai minimal entre deux événements du même type", () => {
  // 5 s de jeu resserré puis 1 s de jeu large, en boucle : l'événement ne peut se répéter qu'après 8 s
  const fr = seq(200, (i, t) => {
    const wide = Math.floor(t) % 6 === 5;
    const ys = wide ? [2, 18, 5, 15] : [8, 11, 9, 10];
    return { players: [P(1, "GKA", 1.5, 10), P(2, "A", 24, ys[0]), P(3, "A", 26, ys[1]), P(4, "A", 28, ys[2]), P(5, "A", 25, ys[3]),
      P(11, "GKB", 38.5, 10), P(12, "B", 34, 7), P(13, "B", 34, 13), P(14, "B", 31, 10), P(15, "B", 36, 10)], ball: { x: 25.5, y: ys[3] } };
  });
  const ev = M.analyze(fr, { L, W }).events.filter((e) => e.type === "largeur_mal_occupee");
  assert.ok(ev.length >= 2);
  for (let i = 1; i < ev.length; i++) assert.ok(ev[i].t - ev[i - 1].t >= 8);
});

test("statistiques : possession, distances, carte de chaleur, forme", () => {
  const fr = seq(100, (i, t) => {
    const pl = base(); pl[1] = P(2, "A", 10 + t * 1.0, 6);
    return { players: pl, ball: i < 60 ? { x: 10 + t, y: 6.5 } : { x: 28.4, y: 6.4 } };
  });
  const s = M.analyze(fr, { L, W }).stats;
  assert.equal(s.possession.A + s.possession.B, 100);
  assert.ok(s.possession.A > 50);
  const p2 = s.players.find((p) => p.id === 2);
  assert.ok(Math.abs(p2.distance - 20) <= 2, "distance " + p2.distance);
  assert.equal(s.heat.length, 5); assert.equal(s.heat[0].length, 10);
  const total = s.heat.flat().reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 0.02);
  assert.ok(s.shape.depth > 0);
});

test("entrées vides ou invalides sans exception", () => {
  for (const f of [undefined, [], [{ t: NaN, players: [] }]]) {
    const r = M.analyze(f, { L, W });
    assert.deepEqual(r.events, []);
    assert.equal(r.stats.possession.known, false);
  }
  const noBall = M.analyze(seq(20, () => ({ players: base(), ball: null })), { L, W });
  assert.equal(noBall.events.length, 0);
});
