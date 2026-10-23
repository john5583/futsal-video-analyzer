"use strict";
/* RÈGLE D'OR : ces tests échouent si le programme affiche
   - une erreur liée au ballon sans ballon fiable,
   - une identité sous le seuil de confiance,
   - une position comblée à travers un trou trop long,
   - un résultat sans statut (ou avec un statut incomplet).
   Ils tournent avec tous les autres avant chaque push. */
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../src/engine/regle-or");
const M = require("../src/ai/match");
const O = require("../src/ai/overlay");
const BT = require("../src/ai/balltrack");

const L = 40, W = 20;
const P = (id, team, x, y) => ({ id, team, x, y });
const base = () => [P(1, "GKA", 1.5, 10), P(2, "A", 10, 6), P(3, "A", 12, 14), P(4, "A", 18, 10), P(5, "A", 22, 10),
  P(11, "GKB", 38.5, 10), P(12, "B", 28, 6), P(13, "B", 30, 14), P(14, "B", 26, 10), P(15, "B", 32, 10)];
/* Perte en zone défensive suivie d'une contre-attaque (voir match.test.js). hideBall(t) : le ballon n'est pas vu à cet instant. */
function loss(hideBall) {
  const fr = [];
  for (let i = 0; i < 40; i++) {
    const t = i * 0.2, pl = base();
    let ball;
    if (t < 2) ball = { x: 9.5, y: 6 };
    else { const bx = Math.max(3, 9 - (t - 2) * 3); pl[8] = P(14, "B", bx - 0.5, 8); pl[7] = P(13, "B", bx + 1, 12); pl[6] = P(12, "B", bx + 2, 5); ball = { x: bx, y: 8 }; }
    fr.push({ t, players: pl, ball: hideBall && hideBall(t) ? null : ball });
  }
  return fr;
}
const shown = (r) => ({ events: r.events, uncertain: r.uncertain });

// ---------- 1. les statuts ne peuvent pas être incomplets ----------
test("statuts : une preuve, une raison ou une source est obligatoire", () => {
  assert.throws(() => R.deduit(""), /preuve/);
  assert.throws(() => R.deduit({}), /preuve/);
  assert.throws(() => R.nonEvalue("  "), /raison/);
  assert.throws(() => R.mesure(undefined), /source/);
  assert.equal(R.deduit({ a: 1 }).valeur, "deduit");
  assert.equal(R.inconnu().valeur, "inconnu");
  assert.ok(R.inconnu().raison, "« inconnu » dit toujours pourquoi");
  assert.deepEqual(Object.keys(R.TEXTE).sort(), ["deduit", "inconnu", "mesure", "non_evalue"]);
});
test("un statut incomplet ou absent est détecté", () => {
  assert.ok(R.statutProblemes(undefined).length);
  assert.ok(R.statutProblemes({ valeur: "certain" }).length, "statut inventé");
  assert.ok(R.statutProblemes({ valeur: "deduit" }).length, "déduit sans preuve");
  assert.ok(R.statutProblemes({ valeur: "non_evalue" }).length, "non évalué sans raison");
  assert.deepEqual(R.statutProblemes({ valeur: "mesure", source: "détection" }), []);
});

// ---------- 2. l'audit détecte chaque violation (il faut qu'il détecte, sinon les tests suivants ne prouveraient rien) ----------
test("audit : résultat sans statut", () => {
  const v = R.audit({ events: [{ t: 3, type: "perte_zone_def", ballConf: 0.9 }] });
  assert.ok(v.some((x) => x.regle === "statut"));
});
test("audit : erreur liée au ballon sans ballon fiable", () => {
  const e = { t: 3, type: "perte_zone_def", ballConf: 0.3, statut: R.deduit("x") };
  assert.ok(R.audit({ events: [e] }).some((x) => x.regle === "ballon"));
  assert.ok(R.audit({ events: [Object.assign({}, e, { ballConf: undefined })] }).some((x) => x.regle === "ballon"), "ballon inconnu");
  assert.deepEqual(R.audit({ events: [Object.assign({}, e, { ballConf: 0.6 })] }), [], "au seuil : accepté");
  assert.deepEqual(R.audit({ events: [Object.assign({}, e, { ballFree: true })] }), [], "une erreur sans lien avec le ballon n'est pas concernée");
  assert.ok(R.audit({ events: [Object.assign({}, e, { ballConf: 0.9, statut: R.inconnu() })] }).length, "statut inconnu mais affiché");
});
test("audit : identité sous le seuil de confiance", () => {
  const ok = { id: 7, label: "Karim", conf: 0.96, statut: R.deduit("signature des parties du corps") };
  assert.deepEqual(R.audit({ identities: [ok] }), []);
  assert.ok(R.audit({ identities: [Object.assign({}, ok, { conf: 0.94 })] }).some((x) => x.regle === "identite"));
  assert.ok(R.audit({ identities: [Object.assign({}, ok, { conf: undefined })] }).some((x) => x.regle === "identite"));
  assert.deepEqual(R.audit({ identities: [{ id: 7, label: null, conf: 0.4, statut: R.inconnu("marge faible") }] }), [], "« inconnu » est toujours permis");
  assert.ok(R.audit({ identities: [{ id: 7, label: null, conf: 0.4, statut: R.deduit("x") }] }).length, "non affichée mais statut déduit : incohérent");
});
test("audit : position comblée à travers un trou trop long", () => {
  const f = (kind, from, to) => ({ kind, from, to, statut: R.deduit("interpolation") });
  assert.deepEqual(R.audit({ fills: [f("joueur", 0, 1.2), f("ballon", 0, 0.6), f("lien-ballon", 0, 1.0)] }), []);
  assert.ok(R.audit({ fills: [f("joueur", 0, 1.5)] }).some((x) => x.regle === "trou"));
  assert.ok(R.audit({ fills: [f("ballon", 0, 0.8)] }).some((x) => x.regle === "trou"));
  assert.ok(R.audit({ fills: [f("lien-ballon", 0, 1.3)] }).some((x) => x.regle === "trou"));
  assert.ok(R.audit({ fills: [f("autre", 0, 0.1)] }).some((x) => x.regle === "trou"), "sorte inconnue refusée");
});

// ---------- 3. le programme réel respecte la règle ----------
test("ballon bien vu : l'erreur est affichée, avec son statut « déduit » et sa preuve", () => {
  const r = M.analyze(loss(null), { L, W });
  assert.ok(r.events.some((e) => e.type === "perte_zone_def"), "l'erreur attendue est bien trouvée");
  r.events.forEach((e) => { assert.equal(e.statut.valeur, "deduit"); assert.ok(e.statut.preuve.ballon_vu_sur >= R.LIMITES.BALL_CONF_MIN); });
  assert.deepEqual(R.audit(shown(r)), []);
});
test("ballon jamais vu : aucune erreur liée au ballon n'est affichée, et le silence est expliqué", () => {
  const r = M.analyze(loss(() => true), { L, W });
  assert.deepEqual(r.events, [], "aucune erreur sans ballon");
  assert.deepEqual(R.audit(shown(r)), []);
  r.uncertain.forEach((u) => { assert.equal(u.statut.valeur, "non_evalue"); assert.ok(u.statut.raison); });
});
test("ballon vu une image sur deux : pas d'erreur affichée (sous le seuil), et chaque erreur écartée est « non évaluée » avec sa raison", () => {
  let n = 0;
  const r = M.analyze(loss(() => (n++ % 2 === 0)), { L, W });
  assert.deepEqual(r.events.filter((e) => e.ballConf < R.LIMITES.BALL_CONF_MIN), []);
  assert.deepEqual(R.audit(shown(r)), []);
  assert.ok(r.uncertain.length >= 1, "l'erreur écartée reste visible comme question, pas en silence");
  r.uncertain.forEach((u) => assert.ok(u.statut.raison));
});
test("trou du ballon pendant la perte : pas d'erreur sûre ; sur 30 scénarios aléatoires, jamais de violation", () => {
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let k = 0; k < 30; k++) {
    const a = rnd() * 6, b = a + rnd() * 3, miss = rnd() * 0.9;
    const r = M.analyze(loss((t) => (t >= a && t <= b ? true : rnd() < miss * 0.3)), { L, W });
    assert.deepEqual(R.audit(shown(r)), [], "scénario " + k + " : " + JSON.stringify(R.audit(shown(r))));
  }
});
test("garde : un évènement qui violerait la règle du ballon passe en « non évalué », jamais affiché comme sûr", () => {
  const res = R.guardResult({ events: [{ t: 5, type: "perte_zone_def", ballConf: 0.2 }, { t: 9, type: "perte_zone_def", ballConf: 0.9 }], uncertain: [{ t: 1, type: "x", reason: "arrêt de jeu" }] });
  assert.deepEqual(res.events.map((e) => e.t), [9]);
  assert.deepEqual(res.uncertain.map((u) => u.t).sort((a, b) => a - b), [1, 5]);
  assert.equal(res.regleOr.dropped.length, 1);
  assert.deepEqual(R.audit({ events: res.events, uncertain: res.uncertain }), []);
});
test("garde des identités : sous le seuil, « inconnu » à la place", () => {
  const out = R.guardIdentities([{ id: 1, label: "Karim", conf: 0.8, statut: R.deduit("x") }, { id: 2, label: "Sami", conf: 0.97, statut: R.deduit("x") }, { id: 3, label: null, conf: 0.1, statut: R.inconnu("x") }]);
  assert.equal(out[0].label, null); assert.equal(out[0].statut.valeur, "inconnu");
  assert.equal(out[1].label, "Sami");
  assert.deepEqual(R.audit({ identities: out }), []);
});

// ---------- 4. aucun comblement à travers un trou trop long ----------
test("seuils figés : on ne les relâche pas sans décision de John et sans mesure", () => {
  assert.equal(R.LIMITES.BALL_CONF_MIN, 0.6);
  assert.equal(R.LIMITES.ID_CONF_MIN, 0.95);
  assert.equal(R.LIMITES.FILL_GAP_MAX_S, 1.2);
  assert.equal(R.LIMITES.BALL_HOLD_MAX_S, 0.6);
  assert.equal(R.LIMITES.BALL_LINK_MAX_S, 1.0);
  assert.equal(M.BALL_CONF_MIN, R.LIMITES.BALL_CONF_MIN, "même seuil dans l'analyse et dans la règle d'or");
  assert.ok(2 * O.MAX_GAP <= R.LIMITES.FILL_GAP_MAX_S + 1e-9, "l'interpolation des joueurs reste dans la limite");
  assert.ok(O.BALL_HOLD_MAX <= R.LIMITES.BALL_HOLD_MAX_S && O.BALL_LINK_MAX <= R.LIMITES.BALL_LINK_MAX_S, "limites du ballon");
});
test("affichage : sur des images à trous aléatoires, chaque position comblée respecte la limite", () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let k = 0; k < 60; k++) {
    const frames = []; let t = 0;
    for (let i = 0; i < 8; i++) { t += 0.2 + rnd() * 2.5; frames.push({ t, players: [P(1, "A", 10 + t, 8)], ball: rnd() < 0.7 ? { x: 12 + t, y: 8 } : null }); }
    for (let q = 0; q < 25; q++) {
      const at = rnd() * (t + 1), s = O.stateAt(frames, at);
      const v = R.audit({ fills: s.fills.map((f) => Object.assign({}, f, { statut: R.deduit("interpolation") })) });
      assert.deepEqual(v, [], "t = " + at.toFixed(2) + " : " + JSON.stringify(v));
      if (s.players.length) assert.ok(Math.min(...frames.map((f) => Math.abs(f.t - at))) <= O.MAX_GAP + 1e-9, "joueur affiché à plus de " + O.MAX_GAP + " s d'une image analysée");
      if (s.ball) assert.ok(Math.min(...frames.filter((f) => f.ball).map((f) => Math.abs(f.t - at))) <= R.LIMITES.BALL_HOLD_MAX_S + 1e-9 || s.fills.some((f) => f.kind === "lien-ballon"), "ballon repris trop loin d'une détection");
    }
  }
});
test("ballon : deux détections à plus d'1 s ne sont pas reliées (pas de trajectoire à travers un trou long)", () => {
  // ballon sûr à t = 0, candidat faible à t = 1,6 s : trop loin pour être relié, donc pas retenu (un faible seul ne l'est jamais)
  const far = [{ t: 0, bc: [[10, 8, 0.8]] }, { t: 0.2, bc: [] }, { t: 0.4, bc: [] }, { t: 1.6, bc: [[11, 8, 0.15]] }];
  assert.equal(BT.select(far)[3], null);
  // même ballon faible à 0,8 s : relié
  const near = [{ t: 0, bc: [[10, 8, 0.8]] }, { t: 0.4, bc: [] }, { t: 0.8, bc: [[11, 8, 0.15]] }];
  assert.ok(BT.select(near)[2], "relié à 0,8 s");
});
