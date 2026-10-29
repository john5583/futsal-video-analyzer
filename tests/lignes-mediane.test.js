"use strict";
/* Ligne médiane de plusieurs couleurs (noir, jaune, rouge, noir) sur une même droite : seule la médiane peut s'appuyer sur les autres couleurs ;
   le cercle central noir ancre le tracé ; une ligne jaune parallèle d'un autre sport ne doit pas l'emporter. Scène synthétique (tests/helpers/scene.js). */
const test = require("node:test");
const assert = require("node:assert/strict");
const LG = require("../src/ai/lignes");
const CF = require("../src/ai/court-fit");
const { render } = require("./helpers/scene");

const L = 40, W = 20, w = 480, h = 270;
const POSE = [20, -5, 5, 90, 20, 70, 0];
const mod = LG.modele(L, W, { pointilles: false, prio: ["cercle"] });
const bougee = (p, d) => p.map((v, i) => v + (d[i] || 0));
const COUL = { noir: [15, 15, 15], jaune: [240, 195, 0], rouge: [215, 54, 43] };

/* Scène : sol bleu, cercle central noir, ligne médiane en 4 morceaux (noir, jaune, rouge, noir) ; leurre = ligne jaune parallèle à 2,5 m (autre sport). */
function scene(pose, leurre) {
  const im = render(pose.slice(0, 6), w, h, L, W, { lines: false, circle: true, lineHalf: 0.05 });
  const B = CF.cameraBasis(pose), f = CF.focalPx(w, pose[5]);
  const disque = (u, v, r, c) => { for (let y = Math.floor(v - r); y <= Math.ceil(v + r); y++) for (let x = Math.floor(u - r); x <= Math.ceil(u + r); x++) { if (x < 0 || y < 0 || x >= w || y >= h || Math.hypot(x - u, y - v) > r) continue; const i = (y * w + x) * 4; im.data[i] = c[0]; im.data[i + 1] = c[1]; im.data[i + 2] = c[2]; } };
  const trait = (x, y0, y1, c) => { for (let y = y0; y <= y1; y += 0.03) { const q = CF.project(B, f, w, h, x, y, 0); if (q) disque(q.u, q.v, Math.max(1.1, 0.05 * f / q.z), c); } };
  trait(L / 2, 0, 3, COUL.noir); trait(L / 2, 3, 9, COUL.jaune); trait(L / 2, 9, 14, COUL.rouge); trait(L / 2, 14, 17, COUL.noir); trait(L / 2, 17, 20, COUL.jaune);
  if (leurre) trait(L / 2 + 2.5, 0, 20, COUL.jaune);
  return im;
}

test("médiane multicolore : le cap décalé est ramené sur la vraie ligne (au moins aussi bien qu'avec le noir seul ; l'avantage réel se mesure sur la vraie salle, pas ici)", () => {
  const im = scene(POSE), p0 = bougee(POSE, [0, 0, 0, 3, 0.8, 0, 0.4]), e0 = LG.ecartSol(POSE, p0, w, h);
  const seule = LG.affinerPose(LG.carte(im, "black"), p0, mod, { ref: POSE });
  const multi = LG.affinerPose(LG.carte(im, "black", null, ["yellow", "red"]), p0, mod, { ref: POSE });
  const eSeule = seule.ok && seule.changed ? LG.ecartSol(POSE, seule.pose, w, h) : e0;
  assert.ok(multi.ok && multi.changed, "recalé avec la médiane multicolore : " + multi.raison);
  const eMulti = LG.ecartSol(POSE, multi.pose, w, h);
  console.log("écart au vrai (m) : départ " + e0.toFixed(2) + " ; noir seul " + eSeule.toFixed(2) + " (" + seule.raison + ") ; médiane multicolore " + eMulti.toFixed(2));
  assert.ok(eMulti < e0 * 0.5 && eMulti < 0.8, "médiane multicolore : " + e0.toFixed(2) + " -> " + eMulti.toFixed(2) + " m");
  assert.ok(eMulti <= eSeule + 0.05, "pas moins bien qu'avec le noir seul");
});

test("médiane multicolore : une ligne jaune parallèle d'un autre sport ne tire pas le tracé loin de la vraie médiane (le cercle noir l'ancre)", () => {
  const im = scene(POSE, true), p0 = bougee(POSE, [0, 0, 0, 3, 0.8, 0, 0.4]), e0 = LG.ecartSol(POSE, p0, w, h);
  const multi = LG.affinerPose(LG.carte(im, "black", null, ["yellow", "red"]), p0, mod, { ref: POSE });
  const e1 = multi.ok && multi.changed ? LG.ecartSol(POSE, multi.pose, w, h) : e0;
  console.log("avec un leurre jaune : départ " + e0.toFixed(2) + " m -> " + e1.toFixed(2) + " m (" + multi.raison + ")");
  assert.ok(e1 <= e0 * 1.05, "jamais pire que le départ : " + e0.toFixed(2) + " -> " + e1.toFixed(2));
});

test("médiane multicolore : sans autres couleurs demandées, le comportement est inchangé (aucune seconde carte)", () => {
  const c = LG.carte(scene(POSE), "black");
  assert.equal(c.Dm, undefined);
  assert.ok(LG.carte(scene(POSE), "black", null, ["yellow"]).Dm instanceof Float32Array || LG.carte(scene(POSE), "black", null, ["yellow"]).Dm);
});
