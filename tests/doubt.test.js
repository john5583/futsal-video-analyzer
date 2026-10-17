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

test("lecture fine (f) utilisée d'abord : une piste bien lue par f n'est pas questionnée malgré des lectures brutes bruitées", () => {
  const noisy = track(9, 30, ["B"], 12, 6).map((q) => { q.p.f = "A"; return q; });          // brut B, mais f = A partout
  assert.equal(D.trackDoubts(toFrames(noisy), { 9: "A" }).length, 0);
});

test("gardien compté pour son équipe ; gardien retenu : rôle décidé par la position, pas questionné", () => {
  const gkReads = track(10, 30, ["GKA", "A"], 3, 10);
  assert.equal(D.trackDoubts(toFrames(gkReads), { 10: "A" }).length, 0, "GKA et A sont du même côté");
  assert.equal(D.trackDoubts(toFrames(track(11, 30, ["B", "A"], 3, 10)), { 11: "GKA" }).length, 0);
});

test("équipe retenue contredite par les images : question avec la raison", () => {
  const q = D.trackDoubts(toFrames(track(12, 30, ["B", "B", "B", "B", "B", "B", "B", "A"], 20, 5)), { 12: "A" });
  assert.equal(q.length, 1);
  assert.match(q[0].why, /contredit|équipe lue/);
});

/* ---------- annulation, personnes jamais identifiées, remplaçants, zone du banc ---------- */
const snap = (frames) => JSON.stringify(frames.map((f) => [f.t, f.players.map((p) => [p.id, p.team, p.x, p.y])]));

test("annuler une réponse « équipe » remet l'équipe d'avant", () => {
  const frames = toFrames(track(2, 30, ["A", "B"], 20, 8));
  frames.forEach((f) => f.players.forEach((p) => { p.team = "A"; }));
  const before = snap(frames);
  const ans = { kind: "team", t: 2, x: 20.5, y: 8, team: "B" };
  const r = D.applyOne(frames, ans);
  assert.ok(r.ok);
  ans.undo = r.undo;
  assert.ok(frames.every((f) => f.players.every((p) => p.team === "B")));
  assert.ok(D.undoOne(frames, ans));
  assert.equal(snap(frames), before);
});

test("annuler « ni joueur ni gardien » réintroduit la personne avec ses images", () => {
  const frames = toFrames(track(2, 20, ["A"], 20, 8));
  const before = snap(frames);
  const ans = { kind: "team", t: 1, x: 20.2, y: 8, team: "NONE" };
  const r = D.applyOne(frames, ans);
  ans.undo = r.undo;
  assert.ok(frames.every((f) => f.players.length === 0));
  D.undoOne(frames, ans);
  assert.equal(snap(frames), before);
});

test("personne jamais identifiée : sa question porte ses points, la réponse la réintroduit, l'annulation la retire", () => {
  const all = toFrames(track(3, 40, ["UNK"], 5, 5), track(1, 40, ["A"], 30, 12));
  const doubts = D.trackDoubts(all, { 3: "UNK", 1: "A" });
  assert.equal(doubts.length, 1);
  assert.ok(Array.isArray(doubts[0].pts) && doubts[0].pts.length >= 25);
  // images finales : la piste 3 n'y est pas (jamais identifiée)
  const finals = all.map((f) => ({ t: f.t, players: f.players.filter((p) => p.id !== 3) }));
  const mem = { answers: [], rejected: [] };
  const ans = D.answerTeam(mem, doubts[0], "B");
  const r = D.applyOne(finals, ans);
  assert.ok(r.ok && r.undo.kind === "injected");
  assert.equal(finals.filter((f) => f.players.some((p) => p.id === r.undo.id && p.team === "B")).length, doubts[0].pts.length);
  ans.undo = r.undo;
  D.undoOne(finals, ans);
  assert.ok(finals.every((f) => f.players.every((p) => p.id !== r.undo.id)));
});

test("réponses : « Mes réponses » les décrit, annuler retire la réponse et rétablit l'erreur écartée", () => {
  const mem = { goalPalettes: [], rejected: [], answers: [] };
  const a = D.answerEvent(mem, { type: "perte_zone_def", t: 15 }, "non");
  assert.ok(D.isRejected(mem, { type: "perte_zone_def", t: 15 }));
  assert.match(D.describeAnswer(a, (t) => "00:" + t, (x) => x), /écartée/);
  D.removeAnswer(mem, a);
  assert.equal(mem.answers.length, 0);
  assert.ok(!D.isRejected(mem, { type: "perte_zone_def", t: 15 }), "l'erreur n'est plus écartée");
  // ✖ simple : rétablissement par unreject
  D.reject(mem, { type: "x", t: 4 });
  D.unreject(mem, mem.rejected[0]);
  assert.equal(mem.rejected.length, 0);
});

test("zone de banc : question une seule fois ; « non » coupe le suivi de dérive, annuler le rétablit", () => {
  const mem = { goalPalettes: [], rejected: [], answers: [] };
  const doubts = [{ kind: "bench", t: 80, d: 4.2, zones: [{ x1: 10, y1: -5, x2: 18, y2: -1 }] }];
  assert.equal(D.openQuestions({ doubts, memory: mem }).length, 1);
  const a = D.answerBench(mem, false);
  assert.equal(mem.benchFollow, false);
  assert.equal(D.openQuestions({ doubts, memory: mem }).length, 0);
  D.removeAnswer(mem, a);
  assert.equal(mem.benchFollow, undefined);
  assert.equal(D.openQuestions({ doubts, memory: mem }).length, 1, "la question revient après annulation");
});

test("pipeline : la dérive maximale d'un banc est retenue avec l'instant et les zones décalées", () => {
  const bench = { y0: 0, yW: 0 };
  const zones = [{ x1: 10, y1: -5, x2: 18, y2: -1 }];
  P.trackDrift(bench, [{ dx: 1, dy: 0 }], zones, 10);
  P.trackDrift(bench, [{ dx: 3, dy: 4 }], zones, 20);
  P.trackDrift(bench, [{ dx: 2, dy: 0 }], zones, 30);
  assert.equal(bench.drift.d, 5);
  assert.equal(bench.drift.t, 20);
  assert.equal(bench.drift.zones[0].x1, 13);
});

test("remplaçants : une personne qui entre par la zone de remplacement est questionnée ; « joueur » la compte, « remplaçant » l'écarte", () => {
  const mk = (id, t0, t1, x, y) => Array.from({ length: Math.round((t1 - t0) / 0.2) }, (_v, i) => ({ t: t0 + i * 0.2, p: { id, team: "A", x, y, b: B } }));
  const frames = toFrames(mk(1, 0, 20, 10, 10), mk(2, 0, 20, 30, 12), mk(5, 5, 20, 20, 0.5));
  const base = { L: 40, W: 20, bench: "left" };
  const r0 = M.analyze(frames, base);
  const s = r0.subs.find((x) => x.id === 5);
  assert.ok(s && !s.answered, "l'entrée de la piste 5 est un passage par la zone de remplacement");
  assert.ok(r0.normalized.some((f) => f.t >= 5 && f.t <= 8 && f.A.some((p) => p.id === 5 && p.sub)), "écartée comme remplaçant par défaut");
  const rJ = M.analyze(frames, Object.assign({ subAnswers: [{ kind: "sub", t: s.t, x: s.x, y: s.y, verdict: "joueur" }] }, base));
  assert.ok(rJ.subs.find((x) => x.id === 5).answered);
  assert.ok(rJ.normalized.every((f) => f.A.every((p) => !p.sub)), "joueur : compté comme joueur");
  const rR = M.analyze(frames, Object.assign({ subAnswers: [{ kind: "sub", t: s.t, x: s.x, y: s.y, verdict: "remplacant" }] }, base));
  assert.ok(rR.normalized.some((f) => f.A.some((p) => p.id === 5 && p.sub)), "remplaçant : écarté comme avant");
  // questions ouvertes
  const mem = { answers: [], rejected: [] };
  assert.equal(D.openQuestions({ subs: r0.subs, memory: mem }).filter((q) => q.kind === "sub").length >= 1, true);
  const ans = D.answerSub(mem, s, "joueur");
  assert.equal(D.openQuestions({ subs: r0.subs, memory: mem }).filter((q) => q.kind === "sub" && q.id === 5).length, 0);
  assert.equal(ans.verdict, "joueur");
});

test("même personne coupée en pistes : la question voisine est proposée (jamais appliquée d'office)", () => {
  const mk = (id, t0, n, x, y) => track(id, n, ["A", "B"], x, y, t0);
  // piste 2 : 0..6 s à x≈20 ; piste 3 : commence juste après, au même endroit ; piste 4 : même moment mais très loin ; piste 5 : bien plus tard
  const frames = toFrames(mk(2, 0, 30, 20, 8), mk(3, 6.4, 30, 21.6, 8.2), mk(4, 6.4, 30, 5, 18), mk(5, 40, 30, 21.6, 8.2));
  const teams = { 2: "A", 3: "A", 4: "A", 5: "A" };
  const ds = D.trackDoubts(frames, teams);
  assert.equal(ds.length, 4);
  const q2 = ds.find((d) => d.id === 2), group = D.sameTrackHint(q2, ds);
  assert.deepEqual(group.map((d) => d.id), [3], "seule la piste qui suit, au bon endroit, est proposée");
  // chaîne : 3 -> 5 n'est pas liée (trop tard), donc 5 reste seule
  assert.deepEqual(D.sameTrackHint(ds.find((d) => d.id === 5), ds), []);
  // autre équipe retenue : jamais liée
  const teams2 = { 2: "A", 3: "B", 4: "A", 5: "A" };
  const ds2 = D.trackDoubts(frames, teams2);
  assert.deepEqual(D.sameTrackHint(ds2.find((d) => d.id === 2), ds2), []);
});

test("réponse appliquée à un groupe : chaque réponse est distincte et indique son origine", () => {
  const mem = { goalPalettes: [], rejected: [], answers: [] };
  const a = D.answerTeam(mem, { t: 9, x: 21, y: 8 }, "B", "00:35");
  assert.equal(a.via, "00:35");
  assert.match(D.describeAnswer(a, (t) => "t" + t, (x) => x), /même réponse appliquée sur votre accord/);
});
