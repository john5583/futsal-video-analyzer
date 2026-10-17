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
  const r2 = M.analyze(frames, Object.assign({ subAnswers: mem.answers }, base));
  assert.equal(D.openQuestions({ subs: r2.subs, memory: mem }).filter((q) => q.kind === "sub" && q.id === 5).length, 0, "la question est répondue une fois l'analyse refaite avec la réponse");
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

test("remplaçants : une question par personne (entrée et sortie), seulement si suivie assez longtemps ; la réponse vaut pour les deux", () => {
  const mk = (id, t0, t1, x, y) => Array.from({ length: Math.round((t1 - t0) / 0.2) }, (_v, i) => ({ t: t0 + i * 0.2, p: { id, team: "A", x, y, b: B } }));
  // 5 : entre à 5 s par la zone et ressort à 12 s par la zone (7 s) ; 6 : ne fait que passer 2 s ; 1 et 2 : joueurs
  const frames = toFrames(mk(1, 0, 30, 10, 10), mk(2, 0, 30, 30, 12), mk(5, 5, 12, 20, 0.5), mk(6, 8, 10, 25, 0.5));
  const r0 = M.analyze(frames, { L: 40, W: 20, bench: "left" });
  assert.deepEqual(r0.subs.map((s) => s.id), [5], "une seule question (id 5) : la silhouette de 2 s n'est pas questionnée");
  const rJ = M.analyze(frames, { L: 40, W: 20, bench: "left", subAnswers: [{ kind: "sub", t: r0.subs[0].t, x: r0.subs[0].x, y: r0.subs[0].y, verdict: "joueur" }] });
  assert.ok(rJ.normalized.every((f) => f.A.every((p) => p.id !== 5 || !p.sub)), "joueur : ni l'entrée ni la sortie ne sont écartées");
});

/* ---------- audit : une réponse ne s'applique qu'à la bonne personne ---------- */
test("deux personnes presque aussi proches du point : on ne devine pas laquelle (réponse non appliquée)", () => {
  const frames = toFrames(track(1, 20, ["A"], 20, 8), track(2, 20, ["A"], 20.3, 8.2));      // 0,3 m l'une de l'autre
  const before = snap(frames);
  const r = D.applyOne(frames, { kind: "team", t: 1, x: 20.1, y: 8.1, team: "B" });
  assert.equal(r.ok, false, "ambigu : rien n'est appliqué");
  assert.equal(snap(frames), before, "aucune image modifiée");
});

test("une personne plus loin que 1,5 m du point n'est pas touchée (autre joueur proche, pas le bon)", () => {
  const frames = toFrames(track(1, 20, ["A"], 20, 8));
  assert.equal(D.applyOne(frames, { kind: "team", t: 1, x: 22.5, y: 8, team: "B" }).ok, false);
  assert.equal(D.applyOne(frames, { kind: "team", t: 1, x: 20.4, y: 8, team: "B" }).ok, true);
});

test("personne jamais identifiée debout à côté d'un autre joueur : elle est réintroduite, l'autre joueur n'est pas modifié", () => {
  const all = toFrames(track(3, 40, ["UNK"], 20.2, 8), track(1, 40, ["A"], 20, 8));          // l'inconnu 3 est collé au joueur 1
  const doubts = D.trackDoubts(all, { 3: "UNK", 1: "A" });
  assert.equal(doubts.length, 1);
  const finals = all.map((f) => ({ t: f.t, players: f.players.filter((p) => p.id !== 3) }));
  const mem = { answers: [], rejected: [] };
  const ans = D.answerTeam(mem, doubts[0], "B");
  const r = D.applyOne(finals, ans);
  assert.ok(r.ok && r.undo.kind === "injected", "réintroduite, pas appliquée au voisin");
  assert.ok(finals.every((f) => f.players.filter((p) => p.id === 1).every((p) => p.team === "A")), "le joueur 1 reste « mon équipe »");
  // la même réponse rejouée sur une analyse où l'inconnu est maintenant identifié : appliquée à lui, sans doublon
  const second = all.map((f) => ({ t: f.t, players: f.players.map((p) => Object.assign({}, p, p.id === 3 ? { team: "A" } : {})) }));
  const r2 = D.applyOne(second, ans);
  assert.ok(r2.ok && r2.undo.kind === "set", "retrouvée aux mêmes points : pas de doublon");
  assert.equal(second.filter((f) => f.players.filter((p) => p.id === 3).length > 1).length, 0);
});

test("annuler utilise l'identifiant de la personne modifiée (même si une autre est maintenant plus proche du point)", () => {
  const frames = toFrames(track(2, 30, ["A", "B"], 20, 8));
  frames.forEach((f) => f.players.forEach((p) => { p.team = "A"; }));
  const ans = { kind: "team", t: 2, x: 20.5, y: 8, team: "B" };
  const r = D.applyOne(frames, ans); ans.undo = r.undo;
  assert.equal(ans.undo.id, 2);
  frames.forEach((f) => f.players.push({ id: 77, team: "A", x: 20.5, y: 8, b: B }));          // un nouvel arrivant se place exactement sur le point
  assert.ok(D.undoOne(frames, ans));
  assert.ok(frames.every((f) => f.players.filter((p) => p.id === 2).every((p) => p.team === "A")), "la personne 2 est rétablie");
});

test("rétablir une erreur écartée marche quel que soit l'arrondi du temps (12,25 s)", () => {
  const mem = { goalPalettes: [], rejected: [], answers: [] };
  const a = D.answerEvent(mem, { type: "perte_zone_def", t: 12.25 }, "non");
  assert.equal(mem.rejected.length, 1);
  D.removeAnswer(mem, a);
  assert.equal(mem.rejected.length, 0, "plus écartée");
});

test("nouvelle analyse : l'annulation (undo) est celle de la nouvelle analyse, jamais l'ancienne", () => {
  const frames1 = toFrames(track(7, 30, ["A"], 20, 8));
  const ans = { kind: "team", t: 2, x: 20.5, y: 8, team: "B" };
  assert.equal(D.applyAnswers(frames1, [ans]), 1);
  const undo1 = ans.undo;
  assert.equal(undo1.id, 7);
  // 2e analyse : la même personne porte maintenant l'identifiant 3
  const frames2 = toFrames(track(3, 30, ["A"], 20, 8));
  assert.equal(D.applyAnswers(frames2, [ans]), 1);
  assert.equal(ans.undo.id, 3, "undo remis à jour");
  // 3e analyse : plus personne à cet endroit -> pas d'annulation à garder
  assert.equal(D.applyAnswers(toFrames(track(4, 30, ["A"], 5, 5)), [ans]), 0);
  assert.equal(ans.undo, undefined);
});

test("remplaçants : une réponse qui correspond à deux personnes (l'entrant et le sortant d'un échange) n'est appliquée à aucune", () => {
  const mk = (id, t0, t1, x, y) => Array.from({ length: Math.round((t1 - t0) / 0.2) }, (_v, i) => ({ t: t0 + i * 0.2, p: { id, team: "A", x, y, b: B } }));
  // 5 entre à 5 s au même endroit où 6 sort à 5,2 s ; les deux restent longtemps suivis
  const frames = toFrames(mk(1, 0, 40, 10, 10), mk(2, 0, 40, 30, 12), mk(5, 5, 25, 20, 0.5), mk(6, 0, 5.2, 20.3, 0.6));
  const base = { L: 40, W: 20, bench: "left" };
  const r0 = M.analyze(frames, base);
  assert.ok(r0.subs.some((s) => s.id === 5), "l'entrée de 5 est questionnée");
  const q = r0.subs.find((s) => s.id === 5);
  const r1 = M.analyze(frames, Object.assign({ subAnswers: [{ kind: "sub", t: q.t, x: q.x, y: q.y, verdict: "joueur" }] }, base));
  assert.equal(r1.subs.find((s) => s.id === 5).answered, false, "réponse ambiguë entre deux personnes : non appliquée, la question reste ouverte");
});

/* ---------- gardien en pantalon : tenue différente, cinq joueurs, ballon désigné, clic sur un cadre ---------- */
const K = require("../src/ai/kit");
const withLeg = (tr, lg) => tr.map((q) => { q.p.lg = lg; return q; });

test("jambes : un short laisse voir la peau, un pantalon noir non ; boîte trop petite -> non mesurée", () => {
  const w = 100, h = 200, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, legs = y > h * 0.66 && y < h * 0.84;
    const c = legs ? [205, 150, 120] : [30, 30, 35];            // peau sur les jambes, tenue sombre ailleurs
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
  }
  const short = K.legSkin({ data, width: w, height: h }, [0, 0, 100, 200]);
  assert.ok(short > 0.8, "short : peau visible " + short);
  const pants = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) { pants[i * 4] = 20; pants[i * 4 + 1] = 20; pants[i * 4 + 2] = 25; pants[i * 4 + 3] = 255; }
  assert.ok(K.legSkin({ data: pants, width: w, height: h }, [0, 0, 100, 200]) < 0.02, "pantalon noir : pas de peau");
  assert.equal(K.legSkin({ data, width: w, height: h }, [0, 0, 4, 30]), null, "boîte trop petite : non mesurée");
});

test("tenue différente : un joueur en pantalon dans une équipe en short est questionné (jamais décidé)", () => {
  const frames = toFrames(
    withLeg(track(1, 30, ["A"], 8, 4), 0.3), withLeg(track(2, 30, ["A"], 10, 8), 0.28), withLeg(track(3, 30, ["A"], 12, 12), 0.33),
    withLeg(track(4, 30, ["B"], 26, 4), 0.25), withLeg(track(5, 30, ["B"], 28, 8), 0.3), withLeg(track(6, 30, ["B"], 30, 12), 0.22),
    withLeg(track(7, 30, ["B"], 33, 16), 0.0));
  const teams = { 1: "A", 2: "A", 3: "A", 4: "B", 5: "B", 6: "B", 7: "B" };
  const ds = D.trackDoubts(frames, teams);
  assert.deepEqual(ds.map((d) => d.id), [7]);
  assert.match(ds[0].why, /pantalon ou un survêtement/);
  assert.match(ds[0].why, /gardien, arbitre ou joueur/);
  assert.equal(ds[0].leg, 0);
});

test("tenue différente : si toute l'équipe porte un pantalon (hiver), aucune question ; sans mesure (anciennes analyses), aucune question", () => {
  const winter = toFrames(...[1, 2, 3, 4, 5, 6].map((id) => withLeg(track(id, 30, [id < 4 ? "A" : "B"], 8 + id * 3, 4 + id), 0.0)));
  assert.equal(D.trackDoubts(winter, { 1: "A", 2: "A", 3: "A", 4: "B", 5: "B", 6: "B" }).length, 0);
  const noLeg = toFrames(...[1, 2, 3, 4].map((id) => track(id, 30, ["B"], 8 + id * 3, 4 + id)));
  assert.equal(D.trackDoubts(noLeg, { 1: "B", 2: "B", 3: "B", 4: "B" }).length, 0);
});

test("cinq joueurs d'une même équipe en même temps : question sur celui qui s'habille autrement (sinon la piste la plus courte)", () => {
  const frames = toFrames(
    withLeg(track(1, 40, ["B"], 20, 3), 0.3), withLeg(track(2, 40, ["B"], 22, 7), 0.3), withLeg(track(3, 40, ["B"], 24, 11), 0.3),
    withLeg(track(4, 40, ["B"], 26, 15), 0.3), withLeg(track(5, 40, ["B"], 28, 18), 0.1), track(6, 40, ["A"], 10, 8), track(7, 40, ["A"], 12, 12));
  const teams = { 1: "B", 2: "B", 3: "B", 4: "B", 5: "B", 6: "A", 7: "A" };
  const ds = D.trackDoubts(frames, teams);
  const crowd = ds.filter((d) => /cinq/.test(d.why));
  assert.equal(crowd.length, 1);
  assert.equal(crowd[0].id, 5, "celui dont les jambes diffèrent");
  assert.match(crowd[0].why, /il n'y en a que quatre/);
  // si l'un des cinq est déjà questionné pour son pantalon, pas de seconde question sur la foule
  const f2 = toFrames(withLeg(track(1, 40, ["B"], 20, 3), 0.3), withLeg(track(2, 40, ["B"], 22, 7), 0.3), withLeg(track(3, 40, ["B"], 24, 11), 0.3), withLeg(track(4, 40, ["B"], 26, 15), 0.3), withLeg(track(5, 40, ["B"], 28, 18), 0.0));
  const d2 = D.trackDoubts(f2, { 1: "B", 2: "B", 3: "B", 4: "B", 5: "B" });
  assert.deepEqual(d2.map((d) => d.id), [5]);
  assert.match(d2[0].why, /pantalon/);
  // quatre joueurs seulement : rien
  assert.equal(D.trackDoubts(toFrames(...[1, 2, 3, 4].map((id) => track(id, 40, ["B"], 20 + id * 2, 3 + id * 4))), { 1: "B", 2: "B", 3: "B", 4: "B" }).filter((d) => /cinq/.test(d.why)).length, 0);
});

test("même allure : proposition seulement pour les jambes sans peau et la même équipe lue", () => {
  const q = { id: 7, leg: 0.0, cur: "B" };
  const doubts = [{ kind: "team", id: 8, leg: 0.02, cur: "B" }, { kind: "team", id: 9, leg: 0.3, cur: "B" }, { kind: "team", id: 10, leg: 0.01, cur: "A" }, { kind: "team", id: 7, leg: 0, cur: "B" }];
  assert.deepEqual(D.sameLookHint(q, doubts).map((d) => d.id), [8]);
  assert.deepEqual(D.sameLookHint({ id: 7, leg: 0.3, cur: "B" }, doubts), [], "un joueur en short n'a pas d'allure de gardien");
});

test("ballon désigné par le coach : posé sur l'image la plus proche, annulable, vérifié par lui", () => {
  const frames = toFrames(track(1, 20, ["A"], 10, 8));
  frames.forEach((f) => { f.ball = { x: 1, y: 1 }; });
  const mem = { goalPalettes: [], rejected: [], answers: [] };
  const ans = D.answerBall(mem, { t: 2.0, x: 12.5, y: 7.5 });
  const r = D.applyOne(frames, ans);
  assert.ok(r.ok);
  ans.undo = r.undo;
  const f = frames.find((x) => Math.abs(x.t - 2.0) < 0.01);
  assert.deepEqual(f.ball, { x: 12.5, y: 7.5 });
  assert.deepEqual(frames.find((x) => Math.abs(x.t - 2.4) < 0.01).ball, { x: 1, y: 1 }, "les autres images ne changent pas");
  assert.ok(D.undoOne(frames, ans));
  assert.deepEqual(f.ball, { x: 1, y: 1 }, "annulé : l'ancienne position revient");
  assert.equal(D.applyOne(frames, { kind: "ball", t: 50, x: 1, y: 1 }).ok, false, "aucune image analysée proche : non appliquée");
  assert.match(D.describeAnswer(ans, (t) => "t" + t, (x) => x), /le ballon est ici/);
  // rejouée sur une nouvelle analyse
  assert.equal(D.applyAnswers(toFrames(track(1, 20, ["A"], 10, 8)), [ans]), 1);
});

test("clic sur un cadre : l'identifiant exact évite l'ambiguïté entre deux joueurs collés", () => {
  const frames = toFrames(track(1, 20, ["A"], 20, 8), track(2, 20, ["A"], 20.3, 8.2));
  const ans = { kind: "team", t: 1, x: 20.1, y: 8.1, team: "GKA" };
  assert.equal(D.applyOne(frames, ans).ok, false, "sans identifiant : ambigu, on ne devine pas");
  const r = D.applyOne(frames, ans, { id: 2 });
  assert.ok(r.ok);
  assert.ok(frames.every((f) => f.players.filter((p) => p.id === 2).every((p) => p.team === "GKA") && f.players.filter((p) => p.id === 1).every((p) => p.team === "A")));
});
