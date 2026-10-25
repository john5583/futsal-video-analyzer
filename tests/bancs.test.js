const test = require("node:test");
const assert = require("node:assert/strict");
const BC = require("../src/ai/bancs");

const L = 40, W = 20;
// signatures (maillot, short, chaussettes) bien distinctes
const SIG = {
  rouge: [55, 60, 40, 20, 0, 0, 55, 60, 40],
  vert: [60, -50, 40, 20, 0, 0, 60, -50, 40],
  bleu: [35, 20, -60, 20, 0, 0, 35, 20, -60],
  vertMoyen: [77, -50, 40, 20, 0, 0, 77, -50, 40],      // ressemble à « vert » sans être confondu (écart ~12)
  entreDeux: [68.5, -50, 40, 20, 0, 0, 68.5, -50, 40]   // à égale distance des deux
};
const jit = (sig, k) => sig.map((v) => (v == null ? v : v + ((k % 3) - 1)));

/* Images de 0 à 300 s toutes les 0,3 s. `assis` : personnes assises au banc [{ x, sig }] ; fn(f, t) pour ajouter des joueurs / entrées. */
function scene(assis, opts) {
  const o = Object.assign({ y: -2.5, dx: () => 0, extra: null }, opts || {});
  const frames = [];
  for (let i = 0; i <= 1000; i++) {
    const t = Math.round(i * 0.3 * 10) / 10, f = { t, players: [], bn: [] };
    assis.forEach((p, k) => f.bn.push([0, Math.round((p.x + o.dx(t)) * 100) / 100, o.y + 0.1 * ((i + k) % 3), 1, jit(p.sig, i + k)]));
    if (o.extra) o.extra(f, t);
    frames.push(f);
  }
  return frames;
}

test("trois personnes assises au même endroit, tout le temps : un banc reconnu, trois fiches", () => {
  const fr = scene([{ x: 18, sig: SIG.rouge }, { x: 19.3, sig: SIG.vert }, { x: 20.6, sig: SIG.bleu }]);
  const r = BC.analyser(fr, { L, W });
  assert.equal(r.bancs.length, 1);
  const b = r.bancs[0];
  assert.equal(b.cote, "y0");
  assert.ok(b.sur, "banc sûr : " + b.raison);
  assert.ok(b.x0 <= 18 && b.x1 >= 20.6 && b.x1 - b.x0 <= 7, b.x0 + " à " + b.x1);
  assert.equal(r.fiches.length, 3);
  assert.deepEqual(r.fiches.map((f) => f.libelle).sort(), ["remplaçant A", "remplaçant B", "remplaçant C"]);
  assert.ok(r.fiches.every((f) => f.proches.length === 0), "aucune ressemblance trop forte");
});

test("des gens debout (spectateurs, entraîneur) ne font pas un banc ; peu de personnes assises non plus", () => {
  const debout = scene([], { extra: (f, t) => { f.bn.push([0, 5 + ((t * 3) % 30), -4, 0, SIG.rouge]); } });
  assert.equal(BC.analyser(debout, { L, W }).bancs.length, 0);
  const court = scene([{ x: 18, sig: SIG.rouge }]).slice(0, 15);
  assert.equal(BC.analyser(court, { L, W }).bancs.length, 0);
});

test("la position du banc change de 6 m d'un moment à l'autre : banc non sûr, la raison est dite, rien n'est affirmé", () => {
  const fr = scene([{ x: 18, sig: SIG.rouge }, { x: 19.3, sig: SIG.vert }], { dx: (t) => (t > 150 ? 6 : 0) });
  const r = BC.analyser(fr, { L, W });
  assert.ok(r.bancs.length >= 1);
  assert.ok(r.bancs.every((b) => !b.sur), "pas sûr");
  assert.ok(r.bancs.some((b) => /change|trop large|d.autres moments/.test(b.raison)), r.bancs.map((b) => b.raison).join(" | "));
  assert.equal(r.changements.length, 0, "pas d'entrée déduite d'un banc non confirmé");
});

test("deux bancs (un de chaque côté) : les deux sont reconnus", () => {
  const fr = scene([{ x: 12, sig: SIG.rouge }, { x: 13.3, sig: SIG.vert }]);
  fr.forEach((f) => { f.bn.push([0, 28, 22.6, 1, jit(SIG.bleu, 1)], [0, 29.4, 22.6, 1, jit(SIG.bleu, 2)]); });
  const r = BC.analyser(fr, { L, W });
  assert.equal(r.bancs.length, 2);
  assert.deepEqual(r.bancs.map((b) => b.cote).sort(), ["y0", "yW"]);
});

/* Entrée : le joueur 99 (équipe A) apparaît à 150 s près du banc avec la signature de la 2e personne ; le joueur 5 (A) sort à 147 s au même endroit. */
const entree = (sig, avecSortie) => (f, t) => {
  const edge = (x, y, id, s) => { f.players.push({ id, team: "A", x, y, b: [0, 0, 1, 1] }); f.bn.push([1, x, y, 0, jit(s, Math.round(t * 10))]); };
  if (t < 147) edge(30, 5, 5, SIG.rouge);               // le joueur 5 reste sur le terrain
  if (avecSortie && t >= 140 && t < 147) edge(21, 0.7, 5, SIG.bleu);
  if (t >= 150) edge(t < 153 ? 19.5 : 25, t < 153 ? 0.6 : 5, 99, sig);
};

test("un remplaçant entre : il est reconnu par sa fiche, la sortie du remplacé est observée", () => {
  const fr = scene([{ x: 18, sig: SIG.rouge }, { x: 19.3, sig: SIG.vert }, { x: 20.6, sig: SIG.bleu }], { extra: entree(SIG.vert, true) });
  // le joueur 5 sort : il ne sera plus vu après 147 s près du banc
  fr.forEach((f) => { f.players = f.players.filter((p) => !(p.id === 5 && f.t >= 147)); });
  const r = BC.analyser(fr, { L, W });
  const ch = r.changements.find((c) => c.entrant.piste === 99);
  assert.ok(ch, "entrée repérée : " + JSON.stringify(r.changements));
  assert.equal(ch.entrant.statut, "reconnu");
  const fVert = r.fiches.find((f) => BC.distance(f.sig, SIG.vert) < 3);
  assert.equal(ch.entrant.fiche, fVert.id);
  assert.equal(ch.sortant.statut, "observée");
  assert.equal(ch.sortant.piste, 5);
  assert.equal(r.questions.length, 0);
});

test("personne inconnue du banc ou fiches qui se ressemblent trop : question, pas de décision ; sortie non vue dite telle quelle", () => {
  // inconnu : une signature qu'aucune fiche ne porte
  const inconnu = scene([{ x: 18, sig: SIG.rouge }, { x: 19.3, sig: SIG.vert }, { x: 20.6, sig: SIG.bleu }], { extra: entree([20, 40, 60, 20, 0, 0, 20, 40, 60], false) });
  const r1 = BC.analyser(inconnu, { L, W });
  const c1 = r1.changements.find((c) => c.entrant.piste === 99);
  assert.equal(c1.entrant.statut, "inconnu");
  assert.equal(c1.sortant.statut, "non vue", "aucune sortie vue : jamais inventée");
  assert.ok(r1.questions.some((q) => q.kind === "qui"));
  // fiches proches : deux personnes en vert qui se ressemblent, un entrant à égale distance des deux
  const proche = scene([{ x: 18, sig: SIG.rouge }, { x: 19.3, sig: SIG.vert }, { x: 20.6, sig: SIG.vertMoyen }], { extra: entree(SIG.entreDeux, false) });
  const r2 = BC.analyser(proche, { L, W });
  assert.equal(r2.fiches.length, 3);
  assert.equal(r2.fiches.filter((f) => f.proches.length).length, 2, "les deux fiches qui se ressemblent sont signalées");
  const c2 = r2.changements.find((c) => c.entrant.piste === 99);
  assert.equal(c2.entrant.statut, "ambigu");
  assert.equal(c2.entrant.fiche, null, "aucune fiche choisie");
  assert.ok(r2.questions.some((q) => q.kind === "qui" && q.candidats.length === 2));
  // deux personnes quasi identiques (écart 2,5) : indiscernables, rangées dans une même fiche — le programme ne peut pas savoir qu'elles sont deux
  const jumeaux = scene([{ x: 19.3, sig: SIG.vert }, { x: 20.6, sig: [62, -48, 38, 20, 0, 0, 62, -48, 38] }]);
  assert.equal(BC.analyser(jumeaux, { L, W }).fiches.length, 1);
});

test("décision de John : « ce n'est pas un banc » écarte la zone ; « c'est un banc » valide une zone douteuse", () => {
  const fr = scene([{ x: 18, sig: SIG.rouge }, { x: 19.3, sig: SIG.vert }], { dx: (t) => (t > 150 ? 6 : 0) });
  const r0 = BC.analyser(fr, { L, W });
  const x = (r0.bancs[0].x0 + r0.bancs[0].x1) / 2;
  assert.equal(BC.analyser(fr, { L, W, decisions: [{ cote: "y0", x, oui: false }] }).bancs.filter((b) => Math.abs((b.x0 + b.x1) / 2 - x) <= 3).length, 0);
  assert.ok(BC.analyser(fr, { L, W, decisions: [{ cote: "y0", x, oui: true }] }).bancs.some((b) => b.confirme));
});

test("les fiches déjà dans le projet gardent leur nom et leur numéro d'une analyse à l'autre", () => {
  const fr = scene([{ x: 18, sig: SIG.rouge }, { x: 19.3, sig: SIG.vert }, { x: 20.6, sig: SIG.bleu }]);
  const a = BC.analyser(fr, { L, W });
  const vert = a.fiches.find((f) => BC.distance(f.sig, SIG.vert) < 3);
  const b = BC.analyser(fr, { L, W, anciennes: [Object.assign({}, vert, { nom: "Léo" })] });
  const f = b.fiches.find((q) => q.id === vert.id);
  assert.equal(f.nom, "Léo");
  assert.equal(f.libelle, "Léo");
  assert.equal(new Set(b.fiches.map((q) => q.id)).size, 3, "numéros distincts");
});

test("signature : écart nul entre lectures identiques, null si une seule partie en commun", () => {
  assert.equal(BC.distance(SIG.rouge, SIG.rouge), 0);
  assert.equal(BC.distance([50, 0, 0, null, null, null, null, null, null], SIG.rouge), null);
  assert.deepEqual(BC.aplatir({ shirt: [1, 2, 3], shorts: null, socks: null }), null);
  assert.deepEqual(BC.aplatir({ shirt: [1, 2, 3], shorts: [4, 5, 6], socks: null }), [1, 2, 3, 4, 5, 6, null, null, null]);
});
