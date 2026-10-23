"use strict";
/* Analyse v2 (bêta) : règles supplémentaires, validation par règle, couverture, règle d'or. Chaque règle a un cas qui la déclenche et un cas témoin. */
const test = require("node:test");
const assert = require("node:assert/strict");
const V2 = require("../src/ai/match-v2");
const RG = require("../src/engine/regles");
const RO = require("../src/engine/regle-or");
const BD = require("../src/ai/bidirectionnel");

const L = 40, W = 20;
const P = (id, team, x, y) => ({ id, team, x, y });
const base = () => [P(1, "GKA", 1.5, 10), P(2, "A", 10, 6), P(3, "A", 12, 14), P(4, "A", 18, 10), P(5, "A", 22, 10),
  P(11, "GKB", 38.5, 10), P(12, "B", 28, 6), P(13, "B", 30, 14), P(14, "B", 26, 10), P(15, "B", 32, 10)];
const seq = (n, fn, dt) => Array.from({ length: n }, (_v, i) => Object.assign({ t: i * (dt || 0.2) }, fn(i, i * (dt || 0.2))));
const types = (r) => r.events.map((e) => e.type);
const noViolation = (r) => assert.deepEqual(RO.audit({ events: r.events, uncertain: r.uncertain }), []);

test("catalogue : 32 règles, identifiants uniques, chaque règle non codée a une raison, chaque règle codée une mesure", () => {
  assert.equal(RG.REGLES.length, 32);
  assert.equal(new Set(RG.REGLES.map((r) => r.id)).size, 32);
  RG.REGLES.forEach((r) => { if (r.codee) assert.ok(r.mesure && !r.raison, r.id); else assert.ok(r.raison && !r.mesure, r.id); });
  assert.equal(RG.REGLES.filter((r) => r.codee).length, 17, "dix règles d'origine + sept nouvelles");
});

test("R03 perte inutile : perte sans pression avec un coéquipier libre", () => {
  const fr = seq(40, (i, t) => {
    const pl = base(); let ball;
    if (t < 2) ball = { x: 9.5, y: 6 };
    else { const bx = Math.max(3, 9 - (t - 2) * 3); pl[8] = P(14, "B", bx - 0.5, 8); pl[7] = P(13, "B", bx + 1, 12); pl[6] = P(12, "B", bx + 2, 5); ball = { x: bx, y: 8 }; }
    return { players: pl, ball };
  });
  const r = V2.analyze(fr, { L, W });
  assert.ok(types(r).includes("perte_zone_def"), "la perte d'origine est toujours là : " + types(r));
  const e = r.events.find((x) => x.type === "perte_inutile");
  assert.ok(e, "perte inutile trouvée : " + types(r));
  assert.equal(e.regle, "R03"); assert.equal(e.regleEtat, "non_validee"); assert.equal(e.statut.valeur, "deduit");
  noViolation(r);
});
test("R03 témoin : perte sous pression forte, aucune perte inutile", () => {
  const fr = seq(40, (i, t) => {
    const pl = base(); let ball;
    pl[8] = P(14, "B", 8.5, 7.5); pl[7] = P(13, "B", 11.5, 7);      // deux adversaires collés au porteur dès le début
    if (t < 2) ball = { x: 9.5, y: 6 };
    else { const bx = Math.max(3, 9 - (t - 2) * 3); pl[8] = P(14, "B", bx - 0.5, 8); pl[7] = P(13, "B", bx + 1.5, 7); ball = { x: bx, y: 8 }; }
    return { players: pl, ball };
  });
  const r = V2.analyze(fr, { L, W });
  assert.ok(!types(r).includes("perte_inutile"), types(r).join());
});

test("R04 relance risquée : le gardien perd le ballon sous pressing", () => {
  const fr = seq(40, (i, t) => {
    const pl = base();
    pl[6] = P(12, "B", 3.4, 9); pl[7] = P(13, "B", 3.4, 11);        // deux adversaires à moins de 3 m du gardien
    const ball = t < 2 ? { x: 2.0, y: 10 } : { x: 3.2, y: 9.5 };
    return { players: pl, ball };
  });
  const r = V2.analyze(fr, { L, W });
  const e = r.events.find((x) => x.type === "relance_risquee");
  assert.ok(e, "relance risquée trouvée : " + types(r));
  assert.equal(e.regle, "R04");
  noViolation(r);
});

test("R06 dribble excessif : 8 s de conservation avec un coéquipier libre ; témoin : conservation courte", () => {
  const long = seq(60, (i, t) => { const pl = base(); const x = 10 + t * 0.2; pl[1] = P(2, "A", x, 6); return { players: pl, ball: { x: x + 0.4, y: 6 } }; });
  const r = V2.analyze(long, { L, W });
  const e = r.events.find((x) => x.type === "dribble_excessif");
  assert.ok(e && e.regle === "R06", types(r).join());
  assert.ok(e.t >= 5.9 && e.t <= 6.5, "signalé au bout de 6 s : " + e.t);
  const short = seq(20, (i, t) => { const pl = base(); pl[1] = P(2, "A", 10 + t * 0.2, 6); return { players: pl, ball: { x: 10.4 + t * 0.2, y: 6 } }; });
  assert.ok(!types(V2.analyze(short, { L, W })).includes("dribble_excessif"));
});

test("R10 absence de mouvement : un joueur immobile 8 s pendant l'attaque ; témoin : tout le monde bouge", () => {
  const still = seq(50, (i, t) => {
    const pl = base(); pl[3] = P(4, "A", 18 + Math.sin(t) * 3, 10 + Math.cos(t) * 2); pl[1] = P(2, "A", 10 + Math.sin(t * 1.3) * 3, 6 + Math.cos(t * 1.1) * 2); pl[2] = P(3, "A", 12 + Math.cos(t) * 3, 14 + Math.sin(t) * 2);
    return { players: pl, ball: { x: pl[3].x + 0.4, y: pl[3].y } };       // le joueur 5 (22, 10) ne bouge pas
  });
  const r = V2.analyze(still, { L, W });
  const e = r.events.find((x) => x.type === "absence_mouvement");
  assert.ok(e && e.regle === "R10" && /n° 5/.test(e.note), types(r).join() + " " + (e && e.note));
  const moving = seq(50, (i, t) => { const pl = base().map((p, k) => ({ ...p, x: p.x + Math.sin(t * 1.2 + k) * 3, y: p.y + Math.cos(t * 1.1 + k) * 2 })); return { players: pl, ball: { x: pl[3].x + 0.4, y: pl[3].y } }; });
  assert.ok(!types(V2.analyze(moving, { L, W })).includes("absence_mouvement"));
});

test("R13 transition offensive lente ; témoin : la récupération est suivie d'une vraie progression", () => {
  const slow = seq(60, (i, t) => {
    const pl = base(); pl[4] = P(5, "A", 27, 10); pl[3] = P(4, "A", 25, 6);
    if (t < 1.4) { pl[8] = P(14, "B", 14.5, 10); return { players: pl, ball: { x: 14.2, y: 10 } }; }
    pl[1] = P(2, "A", 14.5, 10); pl[8] = P(14, "B", 20, 12);
    return { players: pl, ball: { x: 14.6, y: 10 } };
  });
  const r = V2.analyze(slow, { L, W });
  assert.ok(types(r).includes("transition_off_lente"), types(r).join());
  const fast = seq(60, (i, t) => {
    const pl = base(); pl[4] = P(5, "A", 27, 10); pl[3] = P(4, "A", 25, 6);
    if (t < 1.4) { pl[8] = P(14, "B", 14.5, 10); return { players: pl, ball: { x: 14.2, y: 10 } }; }
    const x = 14.5 + (t - 1.4) * 3; pl[1] = P(2, "A", x, 10); pl[8] = P(14, "B", 30, 12);
    return { players: pl, ball: { x: x + 0.1, y: 10 } };
  });
  assert.ok(!types(V2.analyze(fast, { L, W })).includes("transition_off_lente"));
});

test("R14 supériorité non convertie : 3 contre 1 autour du ballon pendant 4 s sans avancer", () => {
  const fr = seq(50, () => {
    const pl = base(); pl[1] = P(2, "A", 20, 10); pl[2] = P(3, "A", 22, 12); pl[3] = P(4, "A", 21, 8); pl[8] = P(14, "B", 24, 10);
    return { players: pl, ball: { x: 20.3, y: 10 } };
  });
  const e = V2.analyze(fr, { L, W }).events.find((x) => x.type === "superiorite_non_convertie");
  assert.ok(e && e.regle === "R14", "supériorité trouvée");
});

test("R27 règle des 4 secondes : le gardien garde le ballon 6 s dans sa moitié ; témoin : 2 s", () => {
  const six = seq(50, () => ({ players: base(), ball: { x: 1.9, y: 10 } }));
  const e = V2.analyze(six, { L, W }).events.find((x) => x.type === "regle_4s");
  assert.ok(e && e.regle === "R27" && e.t >= 3.9 && e.t <= 4.5, "signalée à 4 s : " + (e && e.t));
  const two = seq(50, (i, t) => { const pl = base(); return { players: pl, ball: t < 2 ? { x: 1.9, y: 10 } : { x: 10.3, y: 6 } }; });
  assert.ok(!types(V2.analyze(two, { L, W })).includes("regle_4s"));
});

test("règle d'or : ballon jamais vu, aucune erreur liée au ballon (même pour les nouvelles règles)", () => {
  const fr = seq(60, (i, t) => { const pl = base(); const x = 10 + t * 0.2; pl[1] = P(2, "A", x, 6); return { players: pl, ball: null }; });
  const r = V2.analyze(fr, { L, W });
  assert.deepEqual(r.events, [], "aucune erreur sans ballon : " + types(r));
  noViolation(r);
  assert.ok(r.couverture.every((c) => c.statut === "evaluee" || c.raison), "chaque règle non évaluée dit pourquoi");
});

test("validation : une règle rejetée n'affiche plus rien ; validée = marquée validée ; couverture à jour", () => {
  const fr = seq(60, (i, t) => { const pl = base(); const x = 10 + t * 0.2; pl[1] = P(2, "A", x, 6); return { players: pl, ball: { x: x + 0.4, y: 6 } }; });
  const r0 = V2.analyze(fr, { L, W });
  assert.ok(r0.events.some((e) => e.regle === "R06" && e.regleEtat === "non_validee"));
  const r1 = V2.analyze(fr, { L, W, validations: { R06: "validee" } });
  assert.ok(r1.events.some((e) => e.regle === "R06" && e.regleEtat === "validee"));
  const r2 = V2.analyze(fr, { L, W, validations: { R06: "rejetee" } });
  assert.ok(!r2.events.some((e) => e.regle === "R06"));
  const row = r2.couverture.find((c) => c.id === "R06");
  assert.equal(row.statut, "non_evalue"); assert.match(row.raison, /rejetée/);
  assert.equal(r0.couverture.length, 32);
  assert.deepEqual(RG.valider({ R01: "validee" }, "R01", "x"), {}, "décision inconnue : la validation est retirée");
  assert.deepEqual(RG.valider({}, "R99", "validee"), {}, "règle inconnue : ignorée");
});

test("couverture : ballon fiable trop rarement -> règles du ballon « non évaluées » avec la part exacte ; les autres inchangées", () => {
  const rows = RG.couverture({ validations: {}, events: [], fiabilite: { ballon: 0.1 } });
  const r01 = rows.find((r) => r.id === "R01"), r22 = rows.find((r) => r.id === "R22");
  assert.equal(r01.statut, "non_evalue"); assert.match(r01.raison, /10 %/);
  assert.equal(r22.statut, "non_evalue"); assert.match(r22.raison, /sons? ni geste|fautes/);
  const ok = RG.couverture({ validations: {}, events: [{ regle: "R01" }, { regle: "R01" }], fiabilite: { ballon: 0.8 } });
  assert.equal(ok.find((r) => r.id === "R01").nb, 2);
  assert.equal(RG.resumeCouverture(ok).evaluees, 17);
});

test("deux sens du temps : lissage sans retard, vitesses sans trou enjambé, confirmation dans les deux sens", () => {
  const pts = Array.from({ length: 20 }, (_v, i) => ({ t: i * 0.33, x: i * 0.66, y: 5 }));      // 2 m/s
  const sp = BD.vitesses(pts);
  sp.slice(5, -5).forEach((v) => assert.ok(Math.abs(v - 2) < 0.2, "vitesse " + v));
  const noisy = pts.map((p, i) => ({ ...p, x: p.x + (i % 2 ? 0.4 : -0.4) }));
  const sm = BD.lisser(noisy, 0.4);
  const err = (a) => a.slice(2, -2).reduce((s, p, i) => s + Math.abs(p.x - pts[i + 2].x), 0);
  assert.ok(err(sm) < err(noisy), "le bruit diminue");
  const gap = [{ t: 0, x: 0, y: 0 }, { t: 0.3, x: 0.6, y: 0 }, { t: 3, x: 6, y: 0 }, { t: 3.3, x: 6.6, y: 0 }];
  const g = BD.vitesses(gap);
  assert.ok(g[1] === null || Math.abs(g[1] - 2) < 0.3, "aucune vitesse inventée à travers un trou de 2,7 s : " + g[1]);
  assert.deepEqual(BD.confirmer([false, true, true, true, false, true, false], 3), [false, true, true, true, false, false, false]);
  assert.deepEqual(BD.series([true, true, false, true, true, true], [0, 1, 2, 3, 4, 5], 2), [[3, 5]], "la série de 2 images (1 s) est trop courte, celle de 3 images (2 s) suffit");
});

test("rapport : la couverture est dans le rapport exporté seulement en analyse v2, avec les raisons et l'état des règles", () => {
  const R = require("../src/report"), A = require("../src/engine/analyzer");
  const cov = RG.couverture({ validations: { R01: "validee" }, events: [{ regle: "R01" }], fiabilite: { ballon: 0.7 } });
  const mk = (v2) => ({ name: "M", events: [], ai: { v2, suggested: 0, stats: { possession: { A: 50, B: 50, known: true }, players: [] }, couverture: cov, suggestedEvents: [] } });
  const html = R.build(mk(true), A.analyze(mk(true)), { date: "01/01/2026" });
  assert.ok(html.includes("Couverture des erreurs (analyse v2, bêta)"));
  assert.ok(html.includes("règle validée") && html.includes("règle non validée") && html.includes("Non évalué"));
  assert.ok(html.includes("Les fautes ne sont pas détectées") || html.includes("fautes ne sont pas détectées"), "la raison d'une règle non évaluée est écrite");
  assert.ok(!R.build(mk(false), A.analyze(mk(false)), { date: "01/01/2026" }).includes("Couverture des erreurs"), "analyse habituelle : rapport inchangé");
});
