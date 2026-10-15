/* Contexte du match : jeu en cours, ballon sorti, arrêt probable, ballon tenu, passages non analysés, part fiable. */
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/ai/context");
const M = require("../src/ai/match");

const L = 40, W = 20;
// images normalisées : A = mon équipe ; gk = gardien
const pl = (id, x, y, gk) => ({ id, x, y, gk: !!gk });
// joueurs de champ en mouvement (jeu en cours) ; les gardiens restent dans leur but
const run = (t) => 5 * Math.sin(t);
const frame = (t, ball, A, B) => ({ t, ball, A: A || [pl(1, 2, 10, true), pl(2, 12 + run(t), 8), pl(3, 15, 12 + run(t))], B: B || [pl(11, 38, 10, true), pl(12, 25 + run(t), 8), pl(13, 28, 12 - run(t))] });
const range = (t0, t1, fn) => { const out = []; for (let t = t0; t <= t1 + 1e-9; t += 0.2) out.push(fn(Math.round(t * 10) / 10)); return out; };

test("jeu continu avec ballon vu : tout est fiable, aucun passage", () => {
  const nf = range(0, 10, (t) => frame(t, { x: 12 + t, y: 8 }));
  const c = C.analyzeContext(nf, { L, W });
  assert.ok(c.states.every((s) => s.play === "jeu"));
  assert.deepEqual(c.passages, []);
  assert.equal(c.reliable.ratio, 1);
});

test("ballon vu hors du terrain : arrêt jusqu'à sa reprise à l'intérieur (rentrée de touche)", () => {
  const nf = range(0, 8, (t) => frame(t, t < 2 ? { x: 20, y: 10 - t * 4 } : t < 5 ? (t < 2.6 ? { x: 20, y: -0.8 } : null) : { x: 20, y: 1.5 }));
  const c = C.analyzeContext(nf, { L, W });
  const out = nf.findIndex((f) => f.ball && f.ball.y < 0);
  assert.equal(c.states[out].play, "arret");
  assert.equal(c.states[nf.findIndex((f) => f.t === 4)].play, "arret");
  assert.equal(c.states[nf.length - 1].play, "jeu");
  assert.ok(c.passages.some((p) => p.kind === "arret" && /ligne de touche/.test(p.text)));
});

test("ballon caché longtemps pendant le jeu : « non visible, non analysé », jamais inventé", () => {
  const nf = range(0, 8, (t) => frame(t, t > 2 && t < 5 ? null : { x: 12 + t, y: 8 }));
  const c = C.analyzeContext(nf, { L, W });
  const p = c.passages.find((x) => x.kind === "incertain");
  assert.ok(p && /Ballon non visible entre 00:02 et 00:05 : non analysé/.test(p.text), JSON.stringify(c.passages));
  assert.ok(c.reliable.ratio < 0.75 && c.reliable.ratio > 0.5);
});

test("gardien qui tient le ballon dans sa surface : « tenu par le gardien », confiance suffisante", () => {
  const nf = range(0, 6, (t) => frame(t, t < 1 || t > 4 ? { x: 2.4, y: 10 } : null));
  const c = C.analyzeContext(nf, { L, W });
  const s = c.states[nf.findIndex((f) => f.t === 2)];
  assert.equal(s.play, "jeu");
  assert.ok(s.held && s.held.gk && s.held.team === "A" && s.held.conf >= C.CONF_MIN, JSON.stringify(s));
});

test("ballon disparu près d'un joueur qui court et jamais revu près de lui : pas déduit comme tenu", () => {
  const nf = range(0, 6, (t) => frame(t, t < 1 ? { x: 12.3, y: 8 } : t > 4 ? { x: 30, y: 3 } : null, [pl(1, 2, 10, true), pl(2, 12 + Math.max(0, t - 1) * 5, 8), pl(3, 15, 12)]));
  const c = C.analyzeContext(nf, { L, W });
  assert.equal(c.states[nf.findIndex((f) => f.t === 2)].held, null);
  assert.equal(c.states[nf.findIndex((f) => f.t === 2)].play, "incertain");
});

test("caméra perdue : passage « non analysé » et temps non compté comme fiable", () => {
  const nf = range(0, 4, (t) => frame(t, { x: 12, y: 8 })).concat(range(8, 10, (t) => frame(t, { x: 12, y: 8 })));
  const c = C.analyzeContext(nf, { L, W, lost: [[4.2, 8]], span: [0, 10] });
  assert.ok(c.passages.some((p) => p.kind === "camera" && /Caméra perdue entre 00:04 et 00:08/.test(p.text)));
  assert.ok(c.reliable.ratio <= 0.65, JSON.stringify(c.reliable));
});

test("analyse : une perte pendant un arrêt de jeu n'est pas suggérée, elle est notée « non signalée »", () => {
  // perte franche, mais le ballon a été vu hors du terrain juste avant (jeu arrêté) : aucune erreur de possession
  const P = (id, team, x, y) => ({ id, team, x, y });
  const fr = [];
  for (let i = 0; i < 40; i++) {
    const t = i * 0.2;
    const players = [P(1, "GKA", 1.5, 10), P(2, "A", t < 2 ? 10 : 14, 6), P(3, "A", 12, 14), P(14, "B", t < 2 ? 26 : 9.4, t < 2 ? 10 : 6.4), P(11, "GKB", 38.5, 10)];
    fr.push({ t, players, ball: t < 1.6 ? { x: 9.5, y: 6 } : t < 2 ? { x: 9.5, y: -1 } : t < 2.2 ? null : { x: 9.5, y: 6 } });
  }
  const r = M.analyze(fr, { L, W });
  assert.ok(!r.events.some((e) => /perte/.test(e.type)), r.events.map((e) => e.type).join());
  assert.ok(r.uncertain.some((u) => /perte/.test(u.type) && /sorti/.test(u.reason)), JSON.stringify(r.uncertain));
  assert.ok(r.context && r.context.reliable.ratio < 1);
});
