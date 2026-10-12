const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../src/engine/analyzer");
const R = require("../src/report");

const ev = (id, t, type, extra) => Object.assign({ id, t, type }, extra || {});

test("projet vide : aucun résultat, aucune exception", () => {
  for (const p of [undefined, {}, { events: [] }, { events: null }]) {
    const r = A.analyze(p);
    assert.equal(r.summary.totalErrors, 0);
    assert.deepEqual(r.findings, []);
    assert.deepEqual(r.priorities, []);
  }
});

test("événements invalides, inconnus ou en double sont ignorés avec avertissement", () => {
  const r = A.analyze({ events: [null, ev(1, -3, "repli_tardif"), ev(2, "x", "repli_tardif"), ev(3, 5, "inconnu"), ev(4, 6, "repli_tardif"), ev(4, 7, "repli_tardif")] });
  assert.equal(r.summary.totalErrors, 1);
  assert.equal(r.warnings.length, 5);
});

test("la gravité augmente avec la conséquence, la zone et la récurrence", () => {
  const low = A.analyze({ events: [ev(1, 10, "perte_zone_mediane", { zone: "MED", outcome: "AUCUN" })] }).findings[0];
  const high = A.analyze({ events: [ev(1, 10, "perte_zone_mediane", { zone: "DEF", outcome: "BUT_CONTRE" })] }).findings[0];
  assert.ok(high.score > low.score);
  assert.equal(low.severity, "MINEUR");
  const rec = A.analyze({ events: [1, 2, 3].map((i) => ev(i, i * 50, "marquage_perdu", { outcome: "OCC_CONTRE" })) }).findings[0];
  assert.ok(rec.recurrent);
  assert.ok(rec.score > 3 * 4 * 1.6);
});

test("un but encaissé remonte la chaîne et désigne la cause probable", () => {
  const r = A.analyze({ events: [
    ev(1, 100, "perte_zone_def", { zone: "DEF" }),
    ev(2, 104, "repli_tardif", { zone: "DEF" }),
    ev(3, 105, "but_encaisse"),
    ev(4, 300, "marquage_perdu") // trop loin du but : exclu de la chaîne
  ] });
  assert.equal(r.goals.length, 1);
  assert.equal(r.goals[0].chain.length, 2);
  assert.equal(r.goals[0].probableCause.type, "repli_tardif");
  assert.equal(r.summary.goalsAgainst, 1);
});

test("un but encaissé sans erreur marquée est signalé sans cause", () => {
  const r = A.analyze({ events: [ev(1, 50, "but_encaisse")] });
  assert.equal(r.goals[0].probableCause, null);
  assert.equal(r.summary.goalsAgainst, 1);
});

test("l'issue BUT_CONTRE et le marqueur de but ne sont pas comptés deux fois", () => {
  const both = A.analyze({ events: [ev(1, 100, "repli_tardif", { outcome: "BUT_CONTRE" }), ev(2, 103, "but_encaisse")] });
  assert.equal(both.summary.goalsAgainst, 1);
  const only = A.analyze({ events: [ev(1, 100, "repli_tardif", { outcome: "BUT_CONTRE" })] });
  assert.equal(only.summary.goalsAgainst, 1);
  assert.equal(only.goals[0].probableCause.type, "repli_tardif");
  const far = A.analyze({ events: [ev(1, 100, "repli_tardif", { outcome: "BUT_CONTRE" }), ev(2, 400, "but_encaisse")] });
  assert.equal(far.summary.goalsAgainst, 2);
});

test("buts marqués", () => {
  const r = A.analyze({ events: [ev(1, 10, "but_marque"), ev(2, 80, "tir_precipite", { outcome: "BUT_POUR" }), ev(3, 11, "tir_precipite", { outcome: "BUT_POUR" })] });
  assert.equal(r.summary.goalsFor, 2);
});

test("période : séparation selon le début de la 2e mi-temps", () => {
  const p = { secondHalfStart: 1200, events: [ev(1, 1199, "duel_perdu"), ev(2, 1200, "duel_perdu")] };
  assert.equal(A.periodOf(p, 1199), 1);
  assert.equal(A.periodOf(p, 1200), 2);
  assert.equal(A.periodOf({}, 5000), 1);
  const r = A.analyze(p);
  assert.deepEqual(r.summary.byPeriod, { 1: 1, 2: 1 });
});

test("schémas : pertes suivies de contre-attaques, pressing battu, fautes, côté, CPA, power play", () => {
  const events = [
    ev(1, 10, "perte_zone_def", { zone: "DEF" }), ev(2, 13, "contre_attaque_subie", { zone: "DEF", side: "G" }),
    ev(3, 100, "relance_risquee", { zone: "DEF" }), ev(4, 105, "repli_tardif", { side: "G" }),
    ev(5, 200, "pressing_desorganise"), ev(6, 204, "espace_dos_fixo", { side: "G" }),
    ev(7, 300, "equipe_etiree"), ev(8, 305, "espace_dos_fixo", { side: "G" }),
    ev(9, 400, "cpa_def_desorganise"), ev(10, 450, "cpa_def_desorganise"),
    ev(11, 500, "gj_perte_balle", { outcome: "BUT_CONTRE" })
  ];
  [20, 40, 60, 80, 90, 95].forEach((t, i) => events.push(ev(20 + i, 600 + t, "faute_evitable")));
  const ids = A.analyze({ events }).patterns.map((p) => p.id);
  for (const id of ["perte_puis_contre", "pressing_battu", "cote_faible", "cpa_recurrent", "power_play", "cumul_fautes_p1"]) assert.ok(ids.includes(id), id);
  // les schémas critiques sont classés en premier
  const sev = A.analyze({ events }).patterns.map((p) => p.severity);
  assert.equal(sev[0], "CRITIQUE");
});

test("baisse de rendement en 2e période", () => {
  const events = [ev(1, 100, "duel_perdu")];
  for (let i = 0; i < 5; i++) events.push(ev(10 + i, 1300 + i * 30, "duel_perdu"));
  const ids = A.analyze({ secondHalfStart: 1200, events }).patterns.map((p) => p.id);
  assert.ok(ids.includes("baisse_2e_periode"));
  assert.ok(!A.analyze({ events }).patterns.some((p) => p.id === "baisse_2e_periode"));
});

test("priorités, plan d'entraînement et conseils par système", () => {
  const r = A.analyze({ defaultSystem: "1-2-1", events: [ev(1, 10, "espace_dos_fixo", { outcome: "OCC_CONTRE", zone: "DEF" }), ev(2, 90, "perte_zone_def", { zone: "DEF" })] });
  assert.equal(r.priorities[0].type, "espace_dos_fixo");
  assert.ok(r.priorities[0].action);
  assert.ok(r.trainingPlan.length > 0 && r.trainingPlan.length <= 6);
  assert.equal(new Set(r.trainingPlan.map((d) => d.id)).size, r.trainingPlan.length);
  assert.ok(r.systemAdvice.some((a) => a.system === "1-2-1" && a.type === "espace_dos_fixo"));
});

test("le rapport HTML échappe les saisies utilisateur et reste autonome", () => {
  const p = { name: "<img src=x onerror=alert(1)>", events: [ev(1, 5, "perte_zone_def", { note: "<script>alert(1)</script>", outcome: "BUT_CONTRE", thumb: "data:image/jpeg;base64,AAAA" })] };
  const html = R.build(p, A.analyze(p), { date: "01/01/2026" });
  assert.ok(!html.includes("<script>alert"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("data:image/jpeg;base64,AAAA"));
  assert.ok(html.includes("Content-Security-Policy"));
  const empty = R.build({}, A.analyze({}));
  assert.ok(empty.includes("Aucun événement marqué"));
});

test("fmtTime", () => {
  assert.equal(A.fmtTime(0), "00:00");
  assert.equal(A.fmtTime(75.4), "01:15");
  assert.equal(A.fmtTime(-5), "00:00");
  assert.equal(A.fmtTime(NaN), "00:00");
  assert.equal(A.fmtTime(3725), "62:05");
});

test("le rapport inclut le plan d'action, les corrections animées en images et la section IA", () => {
  const p = {
    name: "Match test", defaultSystem: "1-2-1",
    events: [{ id: 1, t: 10, type: "repli_tardif", zone: "DEF", outcome: "BUT_CONTRE" }, { id: 2, t: 90, type: "marquage_perdu" }],
    ai: { suggested: 2, stats: { possession: { A: 55, B: 45, known: true }, shape: { width: 9.5, depth: 13.2 }, heat: [[0.1, 0.2], [0.3, 0.4]], players: [{ id: 3, team: "A", gk: false, distance: 812, avgX: 14.2, avgY: 9.8, presence: 0.9 }] } }
  };
  const html = R.build(p, A.analyze(p), { date: "01/01/2026" });
  for (const s of ["Plan d'action pour les prochains matchs", "La correction en vue de dessus", "Analyse vidéo par IA", "Zones occupées par mon équipe", "Erreur observée", "Correction", "Consigne", "Possession (mon équipe)"]) assert.ok(html.includes(s), s);
  assert.ok((html.match(/<svg/g) || []).length >= 7);
  assert.ok(!html.includes("NaN"));
  const noAi = R.build({ events: [] }, A.analyze({ events: [] }));
  assert.ok(!noAi.includes("Analyse vidéo par IA"));
});
