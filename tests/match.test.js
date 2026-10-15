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

/* Scène réelle (vidéo 1, 21-24 s, analyse 1.1.8) : relance du gardien vers le n°4, duel serré à 22,0 s puis ballon
   non détecté (null) ; le n°4 garde le ballon. Distances relevées image par image. */
test("duel serré et ballon non détecté : pas de fausse perte (scène réelle 21-24 s)", () => {
  // [t, ballon détecté ?, distance du n°4 (A), distance du n°2 (B)]
  const rows = [[20.8, 1, 3.0, 0.7], [21.0, 0, 3.0, 0.2], [21.2, 1, 1.5, 2.9], [21.4, 0, 1.3, 3.1], [21.6, 0, 1.2, 3.1],
    [21.8, 1, 1.0, 3.1], [22.0, 1, 0.9, 0.7], [22.2, 0, 0.9, 0.4], [22.4, 0, 1.0, 0.3], [22.6, 1, 1.3, 1.9]];
  for (let t = 22.8; t <= 24.01; t += 0.2) rows.push([Math.round(t * 10) / 10, 1, 0.8, 2.5]);
  const fr = rows.map(([t, seen, dA, dB]) => {
    const b = { x: 16, y: 4 };
    return { t, ball: seen ? b : null, players: [P(5, "GKA", 2, 10), P(4, "A", b.x - dA, b.y), P(6, "A", 20, 8), P(2, "B", b.x + dB, b.y), P(3, "B", 24, 12)] };
  });
  const r = M.analyze(fr, { L, W });
  assert.deepEqual(r.events.filter((e) => /perte/.test(e.type)), []);
  const poss = M.possessionSeries(M.normalize(fr, L, W));
  assert.ok(poss.filter((p, i) => fr[i].t >= 21.8).every((p) => p.team === "A"), "le n°4 garde le ballon de 21,8 à 24 s");
});

test("ballon repris par l'adversaire moins de 1 s puis récupéré : pas de perte", () => {
  const fr = seq(30, (i, t) => {
    const pl = base();
    const bx = 12, by = 10;
    pl[2] = P(3, "A", t >= 2 && t < 2.6 ? bx - 3 : bx - 0.5, by);   // le n°3 perd le contact 0,6 s
    pl[7] = P(13, "B", t >= 2 && t < 2.6 ? bx + 0.4 : bx + 4, by);
    return { players: pl, ball: { x: bx, y: by } };
  });
  const r = M.analyze(fr, { L, W });
  assert.deepEqual(r.events.filter((e) => /perte/.test(e.type)).map((e) => e.t), []);
});

test("une image où le ballon n'est pas détecté ne confirme jamais un changement de possession", () => {
  const fr = seq(20, (i, t) => {
    const pl = base();
    pl[7] = P(13, "B", 10.6, 6);                                   // adversaire collé au ballon dès 1 s
    const seen = t < 1 || t === 1.2 || t >= 3;                     // détecté une seule fois près de lui, puis plus rien
    if (t >= 1) pl[1] = P(2, "A", 13, 6);
    return { players: pl, ball: seen ? { x: 10.2, y: 6 } : null };
  });
  const poss = M.possessionSeries(M.normalize(fr, L, W));
  assert.ok(poss.slice(0, 15).every((p) => p.team === "A"), poss.slice(0, 15).map((p) => p.team).join());
});

test("pas de ballon fiable, pas d'erreur : la situation est seulement notée comme incertaine", () => {
  // même perte franche qu'au-dessus, mais le ballon n'est détecté que sur 1 image sur 3 autour de la perte
  const make = (sparse) => seq(40, (i, t) => {
    const pl = base();
    let ball;
    if (t < 2) ball = { x: 9.5, y: 6 };
    else { const bx = Math.max(3, 9 - (t - 2) * 3); pl[8] = P(14, "B", bx - 0.5, 8); ball = { x: bx, y: 8 }; }
    return { players: pl, ball: sparse && t > 0.6 && t < 3 && i % 3 ? null : ball };
  });
  const ok = M.analyze(make(false), { L, W });
  assert.ok(ok.events.some((e) => e.type === "perte_zone_def" && e.ballConf === 1));
  const r = M.analyze(make(true), { L, W });
  assert.ok(!r.events.some((e) => e.type === "perte_zone_def"), r.events.map((e) => e.type).join());
  const u = r.uncertain.find((x) => x.type === "perte_zone_def");
  assert.ok(u && u.ballConf < M.BALL_CONF_MIN && u.reason === "ballon pas assez visible");
});

test("rythme : perte sous pressing -> conseil adapté ; ballon touché moins de 1 s -> duel, pas une perte", () => {
  const make = (aFrom, pressing) => seq(40, (i, t) => {
    const pl = base();
    pl[6] = P(12, "B", pressing ? 11.5 : 28, pressing ? 6.5 : 6);   // deux adversaires collés au porteur (n°2)
    pl[7] = P(13, "B", pressing ? 9.5 : 30, pressing ? 7 : 14);
    let ball = null;
    if (t >= aFrom && t < 3) ball = { x: 10.3, y: 6 };              // n°2 (A) a le ballon
    else if (t >= 3) { pl[8] = P(14, "B", 9, 8); pl[1] = P(2, "A", 13, 4); ball = { x: 9.4, y: 8 }; }
    else { pl[8] = P(14, "B", 20.5, 10); ball = { x: 20.2, y: 10 }; }
    return { players: pl, ball };
  });
  const r = M.analyze(make(1, true), { L, W });
  const loss = r.events.find((e) => /perte/.test(e.type));
  assert.ok(loss && loss.phase === "pressing" && /pressing adverse/.test(loss.note), JSON.stringify(r.events));
  const duel = M.analyze(make(2.4, false), { L, W });
  assert.ok(!duel.events.some((e) => /perte/.test(e.type)) && !duel.uncertain.some((e) => /perte/.test(e.type)), JSON.stringify(duel.events));
});
