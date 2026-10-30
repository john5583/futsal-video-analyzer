"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const J = require("../src/ai/journal");

const ligne = (t, rSur, rVis, ok) => [t, rSur, rVis, 20, 40, 30, 60, ok ? 1 : 0];
const e = (t, sur, v, meta) => J.entreeTerrain(ligne(t, sur, 64, true), v, meta || { video: "essai.mp4" });

test("journal : sans réponse du coach, les seuils restent ceux de départ", () => {
  assert.deepEqual(J.calibrer([]).seuils, J.DEFAUT);
  assert.deepEqual(J.calibrer(null).seuils, J.DEFAUT);
  assert.match(J.texteSeuils(J.calibrer([])), /valeurs de départ/);
});

test("journal : une entrée garde mesures, décision et verdict (que des chiffres) ; verdict inconnu ou ligne incomplète = rien", () => {
  const x = J.entreeTerrain(ligne(12.5, 4, 64, true), "non", { video: "match.mp4" });
  assert.equal(x.type, "terrain"); assert.equal(x.decision, "verifie"); assert.equal(x.verdict, "non");
  assert.deepEqual(x.mesures.rond, [4, 64]);
  assert.equal(J.entreeTerrain(ligne(1, 1, 64, true), "peut-être"), null);
  assert.equal(J.entreeTerrain([1, 2, 3], "oui"), null);
  assert.ok(JSON.stringify(x).length < 400, "entrée courte");
});

test("journal : le programme a dit « vérifié » à tort (rond à 60 % jugé faux) -> le seuil monte au-dessus de 60 %", () => {
  const ent = [e(1, 58, "oui"), e(2, 60, "oui"), e(3, 61, "oui"), e(4, 39, "non"), e(5, 40, "non"), e(6, 36, "non")].map((x) => x);
  // « oui » = 58..61 sur 64 (90 %+), « non » = 36..40 sur 64 (56..62 %) : le défaut 50 % laisserait passer les « non »
  const cal = J.calibrer(ent);
  assert.ok(cal.seuils.rondPart > 0.62 && cal.seuils.rondPart < 0.9, "seuil rond relevé : " + cal.seuils.rondPart);
  assert.ok(cal.notes.rond.appris);
  assert.match(J.texteSeuils(cal), /rond/);
});

test("journal : trop peu d'exemples, ou une seule sorte de réponse = jamais de réglage (rien d'inventé)", () => {
  assert.deepEqual(J.calibrer([e(1, 60, "oui"), e(2, 59, "oui"), e(3, 61, "oui"), e(4, 62, "oui"), e(5, 60, "oui"), e(6, 63, "oui")]).seuils, J.DEFAUT);
  assert.deepEqual(J.calibrer([e(1, 60, "oui"), e(2, 5, "non")]).seuils, J.DEFAUT);
});

test("journal : le seuil reste dans ses bornes, et le rond non visible (moins de 30 points) n'est pas jugé", () => {
  const peuVisible = [1, 2, 3, 4, 5, 6].map((i) => J.entreeTerrain([i, 2, 10, 20, 40, 30, 60, 1], i % 2 ? "oui" : "non", {}));
  assert.deepEqual(J.calibrer(peuVisible).seuils.rondPart, J.DEFAUT.rondPart, "rond vu sur 10 points seulement : ignoré");
  const tout = [1, 2, 3].map((i) => e(i, 64, "oui")).concat([4, 5, 6].map((i) => e(i, 63, "non")));
  const s = J.calibrer(tout).seuils.rondPart;
  assert.ok(s >= J.BORNES.rondPart[0] && s <= J.BORNES.rondPart[1]);
});

test("journal : une mesure qui ne sépare pas les « oui » des « non » ne règle rien (pas de seuil absurde qui mettrait tout en « incertain »)", () => {
  // même couverture (60 %) pour les « oui » et les « non » : aucun seuil ne sépare
  const ent = [1, 2, 3].map((i) => e(i, 38, "oui")).concat([4, 5, 6].map((i) => e(i, 38, "non")));
  const cal = J.calibrer(ent);
  assert.equal(cal.seuils.rondPart, J.DEFAUT.rondPart);
  assert.equal(cal.notes.rond.appris, false);
  assert.ok(cal.notes.rond.inseparable);
});
