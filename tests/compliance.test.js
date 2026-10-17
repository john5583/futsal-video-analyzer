/* Conformité au plan tactique : forme, hauteur du bloc, compacité, pressing, gardien-joueur, pertes en zone défensive. */
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../src/engine/compliance");
const KB = require("../src/knowledge");

const L = 40, W = 20;
/* Images normalisées (mon équipe A attaque vers x croissant). spec(t) -> { A: [x...], gk?: x, B?: [[x, y]...], ball?: [x, y], team?: "A"|"B"|null, state? }. */
function build(duration, spec, dt) {
  const step = dt || 0.5, nf = [], possession = [], playStates = [];
  for (let t = 0; t <= duration + 1e-9; t += step) {
    const s = spec(Math.round(t * 100) / 100);
    const A = (s.A || []).map((x, i) => ({ id: i + 1, gk: false, x, y: 4 + i * 4 }));
    if (s.gk != null) A.push({ id: 9, gk: true, x: s.gk, y: W / 2 });
    nf.push({ t: Math.round(t * 100) / 100, A, B: (s.B || [[30, 8], [31, 12]]).map(([x, y], i) => ({ id: 20 + i, gk: false, x, y })), ball: s.ball ? { x: s.ball[0], y: s.ball[1] } : null });
    possession.push({ team: s.team === undefined ? "B" : s.team });
    playStates.push(s.state || "jeu");
  }
  return { normalized: nf, possession, playStates, events: [] };
}
const plan = (o) => Object.assign({ system: "3-1", defense: "libre", compact: "libre", pressing: "non", noLossOwnZone: "non", flyingGK: "libre" }, o);
const rule = (r, id) => r.rules.find((x) => x.id === id);

test("lignes : écart de 3,5 m = nouvelle ligne ; écart avec la forme voulue en rangs différents", () => {
  assert.equal(C.shapeMismatch([5, 7, 9, 20], [3, 1]).mismatch, 0);
  const m = C.shapeMismatch([5, 7, 17, 19], [3, 1]);
  assert.deepEqual(m.counts, [2, 2]);
  assert.equal(m.mismatch, 1);
  assert.equal(C.shapeMismatch([5, 7, 9], [3, 1]), null, "nombre de joueurs différent : non évalué");
  assert.deepEqual(C.shapeMismatch([5, 6, 7, 8], [4]).counts, [4]);
});

test("forme : un 3-1 voulu, joué en 2-2 pendant 20 s -> moitié du temps respectée, un moment à éviter", () => {
  const res = build(40, (t) => ({ A: t < 20 ? [5, 7, 9, 22] : [5, 7, 17, 19], team: "A" }));
  const r = C.evaluate(plan({ system: "3-1" }), res, { L, W });
  assert.ok(r.ok);
  const f = rule(r, "forme");
  assert.ok(f.share > 0.4 && f.share < 0.6, "part respectée " + f.share);
  const dev = r.deviations.filter((d) => d.rule === "forme");
  assert.equal(dev.length, 1);
  assert.equal(dev[0].type, "plan_forme");
  assert.deepEqual(dev[0].data.observed, [2, 2]);
  assert.match(dev[0].avoid, /2-2/);
  assert.match(dev[0].todo, /3-1/);
  assert.ok(dev[0].dur >= 18 && dev[0].dur <= 21);
});

test("forme : un écart de moins de 4 s n'est pas relevé ; une transition (changement de possession) n'est pas jugée", () => {
  const brief = build(40, (t) => ({ A: t >= 10 && t < 12.5 ? [5, 7, 17, 19] : [5, 7, 9, 22], team: "A" }));
  assert.equal(C.evaluate(plan(), brief, { L, W }).deviations.length, 0);
  // possession qui change toutes les 3 s : toujours en transition (< 2 s après le changement) pour une moitié des images
  const trans = build(30, (t) => ({ A: [5, 7, 17, 19], team: Math.floor(t / 1.5) % 2 ? "A" : "B" }));
  const f = rule(C.evaluate(plan(), trans, { L, W }), "forme");
  assert.ok(!f || f.evaluated < 15, "les images en transition ne sont pas évaluées");
});

test("jeu arrêté ou ballon non visible : rien n'est évalué (jamais d'écart inventé)", () => {
  const res = build(30, () => ({ A: [5, 7, 17, 19], team: "A", state: "arret" }));
  const r = C.evaluate(plan(), res, { L, W });
  assert.equal(r.deviations.length, 0);
  assert.ok(r.notEvaluated.some((n) => /système/i.test(n.label)), "dit que le système n'a pas pu être évalué");
});

test("bloc : plan « haut » mais bloc à 8 m de son but -> écart ; plan « bas » -> respecté", () => {
  const res = build(30, () => ({ A: [6, 8, 9, 10], team: "B" }));
  const haut = C.evaluate(plan({ defense: "haut" }), res, { L, W });
  assert.equal(rule(haut, "bloc").status, "ecart");
  const d = haut.deviations.find((x) => x.rule === "bloc");
  assert.equal(d.type, "plan_bloc");
  assert.match(d.avoid, /trop bas/);
  assert.ok(d.data.shift > 0, "il faut monter");
  const bas = C.evaluate(plan({ defense: "bas" }), res, { L, W });
  assert.equal(rule(bas, "bloc").status, "ok");
  assert.equal(bas.deviations.filter((x) => x.rule === "bloc").length, 0);
});

test("compacité : 15 m de profondeur pour 13 m voulus -> écart ; « pas de consigne » -> aucune règle", () => {
  const res = build(30, () => ({ A: [5, 8, 12, 20], team: "B" }));
  const r = C.evaluate(plan({ compact: "normale" }), res, { L, W });
  assert.equal(rule(r, "compact").status, "ecart");
  assert.equal(r.deviations.find((x) => x.rule === "compact").type, "plan_etire");
  assert.ok(!rule(C.evaluate(plan({ compact: "libre" }), res, { L, W }), "compact"));
});

test("pressing : perte à 10 s sans personne près du ballon pendant 6 s -> écart ; perte à 30 s pressée à 2 m -> respectée", () => {
  const res = build(45, (t) => {
    if (t < 10) return { A: [10, 12, 14, 16], team: "A", ball: [12, 8] };
    if (t < 20) return { A: [4, 5, 6, 7], team: "B", ball: [26, 10] };          // perte à 10 s, aucun joueur A à moins de 3 m
    if (t < 30) return { A: [10, 12, 14, 16], team: "A", ball: [12, 8] };
    return { A: [12, 14, 24.5, 6], team: "B", ball: [26, 10] };                    // perte à 30 s : A à 1,5 m du ballon
  });
  const r = C.evaluate(plan({ pressing: "oui", defense: "median" }), res, { L, W });
  const p = rule(r, "pressing");
  assert.equal(p.evaluated, 2);
  assert.equal(p.respected, 1);
  const dev = r.deviations.filter((d) => d.rule === "pressing");
  assert.equal(dev.length, 1);
  assert.equal(Math.round(dev[0].t), 10);
  assert.match(dev[0].avoid, /sans pressing/);
  // plan « bloc bas » : on ne demande pas de pressing
  assert.ok(!rule(C.evaluate(plan({ pressing: "oui", defense: "bas" }), res, { L, W }), "pressing"));
});

test("pressing : ballon peu visible après la perte -> non jugé", () => {
  const res = build(30, (t) => (t < 10 ? { A: [10, 12, 14, 16], team: "A", ball: [12, 8] } : { A: [4, 5, 6, 7], team: "B", ball: null }));
  const r = C.evaluate(plan({ pressing: "oui", defense: "median" }), res, { L, W });
  assert.equal(r.deviations.filter((d) => d.rule === "pressing").length, 0);
  assert.ok(r.notEvaluated.some((n) => /Pressing/.test(n.label)));
});

test("gardien-joueur : « jamais » et gardien monté 8 s -> écart ; « seulement quand on est menés » -> non évalué (score non lu)", () => {
  const res = build(30, (t) => ({ A: [10, 12, 14, 16], gk: t >= 10 && t < 18 ? 28 : 3, team: "A" }));
  const r = C.evaluate(plan({ flyingGK: "jamais" }), res, { L, W });
  const dev = r.deviations.filter((d) => d.rule === "gardien");
  assert.equal(dev.length, 1);
  assert.equal(dev[0].type, "plan_gardien");
  assert.ok(dev[0].dur >= 6);
  const d2 = C.evaluate(plan({ flyingGK: "derriere" }), res, { L, W });
  assert.equal(d2.deviations.filter((d) => d.rule === "gardien").length, 0);
  assert.ok(d2.notEvaluated.some((n) => /score/.test(n.why)), "dit que le score n'est pas lu");
});

test("pertes en zone défensive : chaque perte détectée devient un moment à éviter, avec la correction du catalogue", () => {
  const res = build(20, () => ({ A: [10, 12, 14, 16], team: "A" }));
  res.events = [{ type: "perte_zone_def", t: 5, note: "(détection automatique)" }, { type: "repli_tardif", t: 9 }];
  const r = C.evaluate(plan({ noLossOwnZone: "oui" }), res, { L, W });
  assert.equal(r.deviations.filter((d) => d.rule === "pertes").length, 1);
  assert.equal(rule(r, "pertes").count, 1);
  assert.ok(r.deviations[0].todo.length > 10);
  assert.equal(rule(C.evaluate(plan({ noLossOwnZone: "non" }), res, { L, W }), "pertes"), undefined);
});

test("sans analyse ou sans plan : réponse claire, jamais d'erreur", () => {
  assert.equal(C.evaluate(plan(), { normalized: [] }, { L, W }).ok, false);
  assert.equal(C.evaluate(null, build(5, () => ({ A: [1, 2, 3, 4] })), { L, W }).ok, false);
});

test("les consignes non vérifiables sont toujours annoncées comme telles", () => {
  const r = C.evaluate(plan(), build(10, () => ({ A: [5, 7, 9, 22], team: "A" })), { L, W });
  assert.ok(r.notEvaluated.length >= KB.PLAN_NOT_EVALUATED.length);
  assert.ok(r.notEvaluated.some((n) => /Coups de pied arrêtés/.test(n.label)));
});

test("questionnaire : valeurs par défaut selon le système (gardien-joueur : « seulement quand on est menés »)", () => {
  assert.equal(KB.planDefaults("3-1").flyingGK, "jamais");
  assert.equal(KB.planDefaults("3-2").flyingGK, "derriere");
  assert.ok(KB.PLAN_QUESTIONS.length >= 6 && KB.PLAN_QUESTIONS.every((q) => q.id && q.label && q.options));
  assert.ok(Object.keys(KB.PLAN_SHAPES).every((id) => KB.SYSTEMS.some((s) => s.id === id)), "chaque forme attendue correspond à un système connu");
});

test("peu d'images exploitables : la consigne est « indicative », jamais un écart en rouge", () => {
  const short = build(10, () => ({ A: [5, 7, 17, 19], team: "A" }));
  const f = rule(C.evaluate(plan(), short, { L, W }), "forme");
  assert.equal(f.status, "indicatif");
  assert.ok(f.evaluated < 15);
  // beaucoup d'images où seuls trois joueurs de champ sont visibles : la forme n'est jugée que sur une petite part du jeu
  const partial = build(60, (t) => ({ A: t < 8 ? [5, 7, 17, 19] : [5, 7, 17], team: "A" }));
  const p = rule(C.evaluate(plan(), partial, { L, W }), "forme");
  assert.ok(p.coverage < 0.25, "couverture " + p.coverage);
  assert.equal(p.status, "indicatif");
  // assez d'images : verdict normal
  const full = build(40, () => ({ A: [5, 7, 17, 19], team: "A" }));
  assert.equal(rule(C.evaluate(plan(), full, { L, W }), "forme").status, "ecart");
});

test("forme : part exacte et part « proche » (un seul joueur hors de sa ligne)", () => {
  const res = build(40, () => ({ A: [5, 7, 17, 19], team: "A" }));     // 2-2 pour un plan 3-1 : un seul joueur hors de sa ligne
  const f = rule(C.evaluate(plan(), res, { L, W }), "forme");
  assert.equal(f.share, 0);
  assert.equal(f.near, 1);
});

/* ---------- relecture indépendante ---------- */
test("plan : perte sans aucun joueur de champ visible -> non jugée (jamais « à Infinity m »)", () => {
  const res = build(30, (t) => (t < 10 ? { A: [10, 12, 14, 16], team: "A", ball: [12, 8] } : { A: [], team: "B", ball: [26, 10] }));
  const r = C.evaluate(plan({ pressing: "oui", defense: "median" }), res, { L, W });
  assert.equal(r.deviations.filter((d) => d.rule === "pressing").length, 0);
  assert.ok(r.deviations.every((d) => !/Infinity/.test(d.avoid)));
});

test("plan : pertes en zone défensive — sans ballon vu, « indicatif » (pas un vert trompeur) ; les pertes confirmées par le coach comptent", () => {
  const blind = build(30, () => ({ A: [10, 12, 14, 16], team: "A", ball: null }));
  assert.equal(rule(C.evaluate(plan({ noLossOwnZone: "oui" }), blind, { L, W }), "pertes").status, "indicatif");
  const seen = build(30, () => ({ A: [10, 12, 14, 16], team: "A", ball: [12, 8] }));
  assert.equal(rule(C.evaluate(plan({ noLossOwnZone: "oui" }), seen, { L, W }), "pertes").status, "ok");
  const r = C.evaluate(plan({ noLossOwnZone: "oui" }), seen, { L, W, events: [{ type: "perte_zone_def", t: 12, note: "vue par le coach" }] });
  assert.equal(rule(r, "pertes").count, 1);
  assert.match(r.deviations.find((d) => d.rule === "pertes").avoid, /confirmée par vous/);
});

test("plan : le bloc et la compacité ne sont jugés qu'avec quatre joueurs de champ visibles", () => {
  const three = build(30, () => ({ A: [5, 8, 20], team: "B" }));
  const r = C.evaluate(plan({ defense: "haut", compact: "serree" }), three, { L, W });
  assert.ok(!rule(r, "bloc") && !rule(r, "compact"));
});

test("plan : les dessins reçoivent les identifiants des joueurs mesurés", () => {
  const res = build(40, (t) => ({ A: t < 20 ? [5, 7, 9, 22] : [5, 7, 17, 19], team: "A" }));
  const d = C.evaluate(plan(), res, { L, W }).deviations.find((x) => x.rule === "forme");
  assert.deepEqual(d.data.ids.length, 4);
});
