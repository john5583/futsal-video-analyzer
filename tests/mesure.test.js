"use strict";
const test = require("node:test");
const assert = require("node:assert");
const M = require("../scripts/mesure/lib");
const { noter } = require("../scripts/mesure/score");
const P = require("../src/ai/pipeline");

const VIDEO = { vw: 1920, vh: 1080 };
const H = [40, 0, 0, 0, 20, 0, 0, 0, 1];          // pixels normalisés -> mètres
const meters = (u, v) => ({ x: u * 40, y: v * 20 });
const box = (x1, y1, x2, y2) => [x1, y1, x2, y2];   // pour-mille
const frame = (t, ballUV, players) => ({ t, h: H, ball: ballUV ? meters(ballUV[0], ballUV[1]) : null, players: players || [] });
const px = (u, v) => [Math.round(u * VIDEO.vw), Math.round(v * VIDEO.vh)];
const etiq = (frames, extra) => Object.assign({ version: 1, video: { name: "t.mp4", size: 1, duration: 10, vw: 1920, vh: 1080 }, persons: [], subs: [], frames }, extra || {});

test("Wilson : 95 sur 100 donne une borne basse autour de 88,8 %, effectif nul = pas de chiffre", () => {
  const w = M.wilson(95, 100);
  assert.ok(w.bas > 0.88 && w.bas < 0.90 && w.haut > 0.97 && w.haut < 0.99);
  assert.strictEqual(M.wilson(0, 0).p, null);
});

test("ballon : trouvé à 20 px, manqué à 40 px ou absent, faux ballon sur une image sans ballon", () => {
  const [u1, v1] = px(0.5, 0.5), [u2, v2] = px(0.3, 0.3);
  const e = etiq({
    1000: { ball: { state: "vu", u: u1 + 10, v: v1 } },          // à 10 px : trouvé
    2000: { ball: { state: "vu", u: u2, v: v2 } },               // l'analyse met le ballon ailleurs : manqué (et faux)
    3000: { ball: { state: "vu", u: 400, v: 400 } },             // rien affiché : manqué
    4000: { ball: { state: "aucun" } },                          // l'analyse affiche un ballon : faux sur image sans ballon
    5000: { ball: { state: "incertain" } }
  });
  const fr = [frame(1, [0.5, 0.5]), frame(2, [0.8, 0.8]), frame(3, null), frame(4, [0.6, 0.6]), frame(5, [0.5, 0.5])];
  const r = M.mesureBallon(e, fr, VIDEO, [], {});
  assert.strictEqual(r.rappel.k, 1); assert.strictEqual(r.rappel.n, 3);
  assert.strictEqual(r.fauxParmiAffiches.k, 2); assert.strictEqual(r.fauxParmiAffiches.n, 3);
  assert.strictEqual(r.fauxSurImagesSansBallon.k, 1);
  assert.strictEqual(r.incertains, 1);
  assert.strictEqual(r.limitesFauxBallons3pc, false);
  assert.strictEqual(r.atteint, false);
  assert.ok(/effectif insuffisant/.test(r.reserve));
});

test("ballon : sans étiquette « vu », la mesure est « non évaluée », pas 0 %", () => {
  const r = M.mesureBallon(etiq({ 1000: { ball: { state: "aucun" } } }), [frame(1, null)], VIDEO, [], {});
  assert.strictEqual(r.evalue, false); assert.strictEqual(r.score, null);
});

test("joueurs : trouvés, manqués, équipe juste / fausse / inconnue, fausse détection classée (remplaçant)", () => {
  const e = etiq({
    1000: { playersDone: true, boxes: [
      { id: "c1", x1: 100, y1: 300, x2: 200, y2: 600, team: "A", who: "p1" },
      { id: "c2", x1: 500, y1: 300, x2: 600, y2: 600, team: "B", who: "p2" },
      { id: "c3", x1: 900, y1: 300, x2: 1000, y2: 600, team: "GKA" },
      { id: "c4", x1: 1300, y1: 300, x2: 1400, y2: 600, team: "BANC" }] }
  });
  const ps = [
    { id: 7, team: "A", b: box(52, 278, 104, 556) },          // = c1 (en pour-mille), équipe juste
    { id: 8, team: "A", b: box(260, 278, 312, 556) },         // = c2 mais lu A au lieu de B : équipe fausse
    { id: 9, team: null, b: box(468, 278, 520, 556) },        // = c3 mais équipe inconnue
    { id: 10, team: "B", b: box(677, 278, 729, 556) }         // = c4 (remplaçant) : fausse détection « BANC »
  ];
  const r = M.mesureJoueurs(e, [frame(1, null, ps)], VIDEO);
  assert.strictEqual(r.detection.personnesEtiquetees, 3);
  assert.strictEqual(r.detection.rappel.k, 3);
  assert.strictEqual(r.detection.fausses.BANC, 1);
  assert.strictEqual(r.equipes.justes, 1); assert.strictEqual(r.equipes.fausses, 1); assert.strictEqual(r.equipes.inconnues, 1);
  assert.strictEqual(r.equipes.justesParmiAffichees.n, 2);
});

test("joueurs : une personne manquée n'est pas comptée trouvée ; un cadre trop petit n'est ni trouvé ni manqué", () => {
  const e = etiq({ 1000: { playersDone: true, boxes: [{ id: "c1", x1: 100, y1: 300, x2: 200, y2: 600, team: "A" }, { id: "c2", x1: 800, y1: 100, x2: 810, y2: 120, team: "B" }] } });
  const r = M.mesureJoueurs(e, [frame(1, null, [])], VIDEO);
  assert.strictEqual(r.detection.personnesEtiquetees, 1); assert.strictEqual(r.detection.rappel.k, 0);
});

test("identités : changement de piste et fusion comptés", () => {
  const mk = (ms, who, x) => ({ playersDone: true, boxes: [{ id: "c1", x1: x, y1: 300, x2: x + 100, y2: 600, team: "A", who }] });
  const e = etiq({ 1000: mk(1000, "p1", 100), 2000: mk(2000, "p1", 100), 3000: mk(3000, "p1", 100), 4000: mk(4000, "p2", 100) });
  const pj = (id) => [{ id, team: "A", b: box(52, 278, 104, 556) }];
  const fr = [frame(1, null, pj(5)), frame(2, null, pj(5)), frame(3, null, pj(6)), frame(4, null, pj(6))];
  const r = M.mesureJoueurs(e, fr, VIDEO).identites;
  assert.strictEqual(r.changementsDePiste, 1);          // p1 passe de la piste 5 à la piste 6 ; p2 n'a qu'une image
  assert.strictEqual(r.fusions, 1);                     // la piste 6 sert à p1 et p2
  assert.strictEqual(r.continuite.k, 2 + 1);            // p1 : piste principale 5 sur 2 images, p2 : 1 sur 1
});

test("entrées : reconnue seulement avec le bon cadre ET la bonne équipe 3 s après", () => {
  const e = etiq({ 5000: { playersDone: true, boxes: [{ id: "c1", x1: 100, y1: 300, x2: 200, y2: 600, team: "A", who: "p1" }] } },
    { persons: [{ id: "p1", nom: "Léo", team: "A", role: "" }], subs: [{ ms: 1000, who: "p1", sens: "entre" }] });
  assert.strictEqual(M.mesureEntrees(e, [frame(5, null, [{ id: 1, team: "A", b: box(52, 278, 104, 556) }])], VIDEO).reconnues.k, 1);
  assert.strictEqual(M.mesureEntrees(e, [frame(5, null, [{ id: 1, team: "B", b: box(52, 278, 104, 556) }])], VIDEO).reconnues.k, 0);
  assert.strictEqual(M.mesureEntrees(etiq({}, { subs: [] }), [], VIDEO).evalue, false);
});

test("contrôle rapide : oui / non / incertain, borne basse et « atteint » seulement avec 100 verdicts", () => {
  const c = [];
  for (let i = 0; i < 120; i++) c.push({ t: i, comp: "ballon", v: i < 117 ? "oui" : "non" });
  c.push({ t: 999, comp: "ballon", v: "incertain" });
  const r = M.mesureControle(c).ballon;
  assert.strictEqual(r.oui, 117); assert.strictEqual(r.non, 3); assert.strictEqual(r.incertains, 1);
  assert.ok(r.justes.bas >= 92 && r.justes.bas < 96);
  assert.strictEqual(M.mesureControle([{ t: 1, comp: "x", v: "oui" }]).x.atteint, false);
});

test("noter : rend les composants non mesurables en « non évalué » avec leur raison, sans inventer de note", () => {
  const e = etiq({ 1000: { ball: { state: "vu", u: 960, v: 540 } } });
  const projet = { ai: { frames: P.compactFrames([frame(1, [0.5, 0.5])]), calibrations: [] } };
  const r = noter(e, projet, null, null);
  const nom = (s) => r.composants.find((c) => c.composant.indexOf(s) >= 0);
  assert.strictEqual(nom("ballon").score, 100);
  assert.strictEqual(nom("terrain").score, null); assert.ok(nom("terrain").raison);
  assert.strictEqual(nom("silhouettes").score, null); assert.strictEqual(nom("synchro").score, null);
  assert.strictEqual(nom("ballon").atteint, false);      // 1 image : jamais « 95 prouvé »
});
