/* Règles de conception : ce que le programme ne doit JAMAIS faire (inventer, deviner, combler, généraliser). Chaque règle est verrouillée par un test :
   si un changement futur la viole, la suite de tests échoue. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const P = require("../src/ai/pipeline");
const M = require("../src/ai/match");
const D = require("../src/ai/doubt");
const C = require("../src/engine/compliance");
const G = require("../src/ai/goal");
const KB = require("../src/knowledge");

const B = [100, 200, 160, 500];
const clone = (x) => JSON.parse(JSON.stringify(x));
function rawFrames(n, lg) {
  return Array.from({ length: n }, (_v, i) => ({
    t: i * 0.2,
    players: [1, 2, 3, 4].map((id) => ({ id, team: "A", x: 10 + id * 3, y: 4 + id * 3, b: B, lg })).concat([5, 6, 7, 8].map((id) => ({ id, team: "B", x: 26 + (id - 5) * 2, y: 4 + (id - 5) * 4, b: B, lg: id === 8 ? 0 : lg }))),
    ball: { x: 26, y: 5 }
  }));
}
const strip = (frames) => JSON.stringify(frames, (k, v) => (k === "lg" ? undefined : v));

test("1. Un indice mesuré (jambes) ne décide jamais seul : l'équipe retenue ne dépend pas de lui", () => {
  const withLeg = P.finalizeFrames(rawFrames(40, 0.0), { doubts: [] }), without = P.finalizeFrames(rawFrames(40, undefined), { doubts: [] });
  assert.equal(strip(withLeg), strip(without), "les équipes sont identiques avec ou sans la mesure des jambes");
});

test("2. Poser une question ne modifie rien : les doutes et les propositions n'écrivent jamais dans les images", () => {
  const frames = rawFrames(40, 0.3), before = clone(frames), teams = { 1: "A", 2: "A", 3: "A", 4: "A", 5: "B", 6: "B", 7: "B", 8: "B" };
  const doubts = D.trackDoubts(frames, teams);
  D.sameTrackHint(doubts[0] || {}, doubts); D.sameLookHint(doubts[0] || {}, doubts);
  D.openQuestions({ doubts, subs: [], uncertain: [], memory: { answers: [], rejected: [] } });
  assert.deepEqual(frames, before);
  const same = clone(frames);
  assert.equal(D.applyAnswers(same, []), 0);
  assert.deepEqual(same, frames, "sans réponse du coach, rien n'est appliqué");
});

test("3. Un trou n'est jamais comblé : sans ballon, ni possession, ni erreur, ni statistique de possession inventés", () => {
  const frames = Array.from({ length: 80 }, (_v, i) => ({ t: i * 0.3, ball: null, players: [1, 2, 3, 4].map((id) => ({ id, team: "A", x: 10 + id, y: 3 + id * 3, b: B })).concat([5, 6, 7, 8].map((id) => ({ id, team: "B", x: 22 + id, y: 3 + (id - 4) * 3, b: B }))) }));
  const res = M.analyze(frames, { L: 40, W: 20 });
  assert.equal(res.events.length, 0, "aucune erreur liée au ballon sans ballon");
  assert.ok(res.possession.every((p) => !p.team), "aucune possession inventée");
  assert.ok(!res.stats.possession.known, "la possession est annoncée inconnue, pas estimée");
});

test("4. Pas de ballon fiable = pas d'erreur liée au ballon (ballon vu sur trop peu d'images : erreur écartée, pas déclarée)", () => {
  // le ballon n'est vu que sur 1 image sur 8 : quoi qu'il arrive, aucune erreur ne passe dans la liste « sûre »
  const frames = Array.from({ length: 120 }, (_v, i) => ({ t: i * 0.25, ball: i % 8 === 0 ? { x: 5 + (i % 40) * 0.2, y: 8 } : null, players: [1, 2, 3, 4].map((id) => ({ id, team: "A", x: 6 + id, y: 3 + id * 3, b: B })).concat([5, 6, 7, 8].map((id) => ({ id, team: "B", x: 8 + id, y: 3 + (id - 4) * 3, b: B }))) }));
  const res = M.analyze(frames, { L: 40, W: 20 });
  assert.ok(res.events.every((e) => e.ballConf >= M.BALL_CONF_MIN), "toute erreur déclarée a un ballon vu assez souvent autour d'elle");
});

test("5. Une déduction est toujours étiquetée comme telle, et séparée des mesures", () => {
  const res = M.analyze(Array.from({ length: 40 }, (_v, i) => ({ t: i * 0.3, ball: null, players: [{ id: 1, team: "A", x: 10, y: 8, b: B }, { id: 2, team: "B", x: 30, y: 8, b: B }] })), { L: 40, W: 20 });
  assert.ok("deduced" in res.stats.possession || !res.stats.possession.known, "la part de possession déduite est publiée à part");
  res.possession.forEach((p) => { if (p.held) assert.ok(p.held.conf >= 0 && p.held.team, "un ballon tenu déduit porte sa confiance et son équipe"); });
});

test("6. Trop peu d'images = « indicatif », jamais un verdict ; le score n'est jamais lu", () => {
  const nf = Array.from({ length: 20 }, (_v, i) => ({ t: i * 0.5, A: [5, 7, 17, 19].map((x, k) => ({ id: k + 1, gk: false, x, y: 4 + k * 4 })), B: [], ball: null }));
  const res = { normalized: nf, possession: nf.map(() => ({ team: "A" })), playStates: nf.map(() => "jeu"), events: [] };
  const r = C.evaluate(Object.assign(KB.planDefaults("3-1"), { defense: "libre", compact: "libre", pressing: "non", noLossOwnZone: "non", flyingGK: "derriere" }), res, { L: 40, W: 20 });
  assert.ok(r.rules.every((x) => x.status === "indicatif" || x.evaluated >= 15), "peu d'images : indicatif");
  assert.ok(r.notEvaluated.some((n) => /score/.test(n.why)), "le programme dit qu'il ne lit pas le score");
  assert.equal(r.deviations.filter((d) => d.rule === "gardien").length, 0, "aucun écart n'est inventé sur une consigne qui dépend du score");
});

test("7. Une réponse ambiguë n'est appliquée à personne ; une réponse sans cible n'invente pas de cible", () => {
  const frames = rawFrames(20, 0.3);
  frames.forEach((f) => { f.players[0].x = 20; f.players[0].y = 8; f.players[1].x = 20.2; f.players[1].y = 8.1; });
  const before = clone(frames);
  assert.equal(D.applyOne(frames, { kind: "team", t: 1, x: 20.1, y: 8.05, team: "B" }).ok, false);
  assert.equal(D.applyOne(frames, { kind: "team", t: 1, x: 3, y: 18, team: "B" }).ok, false);
  assert.deepEqual(frames, before);
});

test("8. La mémoire est celle d'un seul projet : deux mémoires ne partagent rien", () => {
  const a = { goalPalettes: [], rejected: [], answers: [] }, b = { goalPalettes: [], rejected: [], answers: [] };
  D.answerTeam(a, { t: 1, x: 5, y: 5 }, "B"); D.reject(a, { type: "x", t: 3 });
  assert.equal(b.answers.length, 0); assert.equal(b.rejected.length, 0);
});

test("9. Aucune couleur de but n'est inventée : un but blanc ou de couleur inconnue ne donne ni détection ni couleur apprise", () => {
  const w = 200, h = 120, L = new Float32Array(w * h).fill(80), A = new Float32Array(w * h).fill(0), Bb = new Float32Array(w * h).fill(0);
  const work = { w, h, L, A, B: Bb };      // image uniformément blanche
  assert.equal(G.detect(work).goals.length, 0);
  assert.equal(G.learnPalette(work, { left: { u: 50, v0: 20, v1: 80 }, right: { u: 120, v0: 20, v1: 80 } }), null);
  assert.ok(G.candidates(work).every((c) => c.candidate === true), "un cadre clair n'est jamais qu'un candidat à confirmer");
});

test("10. Le programme n'utilise aucun réseau : la vidéo ne quitte jamais l'ordinateur", () => {
  const root = path.join(__dirname, "..", "src"), hits = [];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "vendor") walk(p); return; }
      if (!/\.js$/.test(e.name)) return;
      const code = fs.readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      if (/\bfetch\s*\(|XMLHttpRequest|new WebSocket|sendBeacon|require\(["'](?:https?|net|dgram)["']\)/.test(code)) hits.push(path.relative(root, p));
    });
  })(root);
  assert.deepEqual(hits, [], "appel réseau trouvé dans : " + hits.join(", "));
});

test("11. Aucune promesse de « 100 % » dans les textes du programme (hors statistiques mesurées)", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "src", "index.html"), "utf8");
  assert.ok(!/(garanti|garantit|à 100 ?%|infaillible|sans aucune erreur)/i.test(html.replace(/<script[\s\S]*?<\/script>/g, "")), "le guide ne promet pas de résultat parfait");
});
