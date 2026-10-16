/* Doute -> question -> mémoire : pistes douteuses, réponses appliquées, erreurs écartées qui ne reviennent pas. */
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../src/ai/doubt");
const P = require("../src/ai/pipeline");
const M = require("../src/ai/match");

const B = [100, 200, 160, 500];
// piste id : n images, lectures d'équipe données (cycle), position fixe
const track = (id, n, reads, x, y, t0) => Array.from({ length: n }, (_v, i) => ({ t: (t0 || 0) + i * 0.2, p: { id, team: reads[i % reads.length], x: x + i * 0.05, y, b: B } }));
const toFrames = (...tracks) => {
  const by = new Map();
  tracks.flat().forEach(({ t, p }) => { const k = t.toFixed(2); if (!by.has(k)) by.set(k, { t, players: [] }); by.get(k).players.push(Object.assign({}, p)); });
  return [...by.values()].sort((a, b) => a.t - b.t);
};

test("piste nette : aucune question ; piste partagée entre deux équipes : une question", () => {
  const frames = toFrames(track(1, 30, ["A"], 10, 5), track(2, 30, ["A", "B"], 20, 8));
  const q = D.trackDoubts(frames, { 1: "A", 2: "A" });
  assert.equal(q.length, 1);
  assert.equal(q[0].id, 2);
  assert.equal(q[0].kind, "team");
  assert.match(q[0].why, /équipe lue/);
});

test("piste jamais identifiée : question ; piste trop courte ou écartée par la position : aucune", () => {
  const frames = toFrames(track(3, 40, ["UNK"], 5, 5), track(4, 5, ["A", "B"], 9, 9), track(5, 30, ["A", "B"], 15, 15));
  const q = D.trackDoubts(frames, { 3: "UNK", 4: "A", 5: "REF" });
  assert.deepEqual(q.map((x) => x.id), [3]);
  assert.match(q[0].why, /jamais identifié/);
});

test("réponse « team » : la personne vue à cet instant, à cet endroit, change d'équipe sur toutes ses images", () => {
  const frames = toFrames(track(2, 30, ["A", "B"], 20, 8), track(1, 30, ["A"], 10, 5));
  const n = D.applyAnswers(frames, [{ kind: "team", t: 2, x: 20.5, y: 8, team: "B" }]);
  assert.equal(n, 1);
  assert.ok(frames.every((f) => f.players.filter((p) => p.id === 2).every((p) => p.team === "B")));
  assert.ok(frames.every((f) => f.players.filter((p) => p.id === 1).every((p) => p.team === "A")), "l'autre piste n'est pas touchée");
});

test("réponse « NONE » : la personne est retirée ; réponse sans personne à cet endroit : ignorée", () => {
  const frames = toFrames(track(2, 20, ["A"], 20, 8));
  assert.equal(D.applyAnswers(frames, [{ kind: "team", t: 1, x: 60, y: 60, team: "A" }]), 0);
  assert.equal(D.applyAnswers(frames, [{ kind: "team", t: 1, x: 20.2, y: 8, team: "NONE" }]), 1);
  assert.ok(frames.every((f) => f.players.length === 0));
});

test("questions ouvertes : une réponse enregistrée retire la question ; « non » écarte l'erreur pour de bon", () => {
  const mem = { goalPalettes: [], rejected: [], answers: [] };
  const doubts = [{ kind: "team", id: 2, t: 5, x: 20, y: 8, n: 30, why: "x" }];
  const uncertain = [{ t: 15, type: "perte_zone_def", reason: "ballon non visible", event: { t: 15, type: "perte_zone_def" } }, { t: 40, type: "repli_tardif", reason: "x" }];
  let qs = D.openQuestions({ doubts, uncertain, memory: mem });
  assert.equal(qs.length, 2, "la situation sans événement attaché (ancienne analyse) n'est pas questionnée");
  D.answerTeam(mem, qs[0], "B");
  D.answerEvent(mem, qs[1], "non");
  assert.equal(D.openQuestions({ doubts, uncertain, memory: mem }).length, 0);
  assert.ok(D.isRejected(mem, { type: "perte_zone_def", t: 15.5 }));
  assert.ok(!D.isRejected(mem, { type: "perte_zone_def", t: 30 }));
  assert.equal(D.filterRejected([{ type: "perte_zone_def", t: 15.2 }, { type: "perte_zone_def", t: 50 }], mem).length, 1);
});

test("erreur écartée (✖) retenue une seule fois", () => {
  const mem = { rejected: [], answers: [] };
  D.reject(mem, { type: "a", t: 3 }); D.reject(mem, { type: "a", t: 3.4 });
  assert.equal(mem.rejected.length, 1);
});

test("fin d'analyse : opts.doubts reçoit les pistes douteuses, les résultats restent ceux du vote", () => {
  const frames = toFrames(track(7, 30, ["A", "A", "A", "B", "B"], 12, 6), track(8, 30, ["A"], 25, 12));
  const doubts = [];
  const out = P.finalizeFrames(frames, { doubts });
  assert.ok(doubts.some((d) => d.id === 7), "la piste 7 est questionnée");
  assert.ok(out.length > 0 && out.every((f) => f.players.every((p) => p.team === "A" || p.team === "B")));
  const none = P.finalizeFrames(toFrames(track(7, 30, ["A", "A", "A", "B", "B"], 12, 6)), {});
  assert.ok(none.length > 0, "sans opts.doubts, comportement inchangé");
});

test("match : une erreur incertaine garde l'événement pour pouvoir être confirmée par le coach", () => {
  // ballon jamais vu : toute erreur éventuelle est « non confirmée » ; on vérifie seulement la forme de la sortie
  const frames = Array.from({ length: 40 }, (_v, i) => ({ t: i * 0.2, ball: null, players: [{ id: 1, team: "A", x: 10, y: 10 }, { id: 2, team: "B", x: 12, y: 10 }] }));
  const r = M.analyze(frames, { L: 40, W: 20 });
  r.uncertain.forEach((u) => assert.ok(u.event && u.event.type === u.type));
});
