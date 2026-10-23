/* Exemples d'identification accumulés par projet : instants, liste, suppression, indicateurs, contradictions, références multiples, banc. */
const test = require("node:test");
const assert = require("node:assert/strict");
const K = require("../src/ai/kit");
const X = require("../src/ai/exemples");

const lab = (r, g, b) => K.rgbToLab(r, g, b);
const feat = (rgb, shorts, socks) => K.fromParts(lab(...rgb), shorts ? lab(...shorts) : null, socks ? lab(...socks) : null, null);
const BLEU = [30, 70, 200], ROUGE = [200, 40, 40], NOIR = [20, 20, 20], JAUNE = [230, 210, 30];

test("marquer : numéro, instant arrondi, vidéo et source ; chaque numéro est unique", () => {
  const a = X.marquer(feat(BLEU), { t: 12.34, v: "m.mp4", src: "silhouette" }), b = X.marquer(feat(BLEU), { t: 40 });
  assert.equal(a.t, 12.3); assert.equal(a.v, "m.mp4"); assert.equal(a.src, "silhouette");
  assert.ok(a.id && b.id && a.id !== b.id);
  assert.equal(X.marquer(null, { t: 1 }), null);
});

test("ancien projet : échantillons sans instant ni numéro relus sans erreur, instant « inconnu »", () => {
  const kits = { A: [feat(BLEU), feat(BLEU)], B: [feat(ROUGE)] };
  const l = X.liste(kits, "A");
  assert.equal(l.length, 2); assert.equal(l[0].t, null); assert.match(l[0].id, /^legacy:A:0$/);
  assert.equal(X.etat(kits, "A").instants, 1);
  assert.match(X.etat(kits, "A").texte, /ancien projet/);
  X.assurerIds(kits);
  assert.ok(kits.A.every((f) => f.id));
  // les références se calculent comme avant
  assert.deepEqual(X.refs(kits).A.shirt, K.average(kits.A).shirt);
  assert.equal(X.refs(kits).A.alts, undefined);
});

test("indicateur : assez d'exemples seulement avec assez d'exemples ET assez d'instants différents", () => {
  const kits = { A: [X.marquer(feat(BLEU), { t: 10 }), X.marquer(feat(BLEU), { t: 12 }), X.marquer(feat(BLEU), { t: 15 })] };
  assert.equal(X.etat(kits, "A").etat, "insuffisant");     // 3 exemples mais un seul instant (écart < 20 s)
  assert.equal(X.etat(kits, "A").instants, 1);
  kits.A.push(X.marquer(feat(BLEU), { t: 90 }));
  assert.equal(X.etat(kits, "A").etat, "assez");
  assert.equal(X.etat(kits, "A").instants, 2);
  assert.equal(X.etat(kits, "A").n, 4);
});

test("catégories facultatives : aucun exemple = facultatif (pas bloquant) ; une seule vue = il en faut plus", () => {
  const kits = {};
  assert.equal(X.etat(kits, "REF").etat, "facultatif");
  assert.equal(X.etat(kits, "A").etat, "insuffisant");
  kits.REF = [X.marquer(feat(JAUNE), { t: 30 })];
  const e = X.etat(kits, "REF");
  assert.equal(e.etat, "insuffisant"); assert.match(e.texte, /il en faut plus/);
  assert.match(X.demande(kits, "REF"), /Je n'ai vu l'arbitre qu'une fois/);
  assert.equal(X.demande({ REF: [X.marquer(feat(JAUNE), { t: 30 }), X.marquer(feat(JAUNE), { t: 100 })] }, "REF"), null);
  assert.equal(X.demande({}, "GKA"), null);   // facultatif : jamais de demande
});

test("suppression d'un exemple par numéro ; la catégorie vide disparaît", () => {
  const f1 = X.marquer(feat(BLEU), { t: 1 }), f2 = X.marquer(feat(BLEU), { t: 50 });
  const kits = { A: [f1, f2] };
  assert.equal(X.retirer(kits, "A", f1.id), true);
  assert.deepEqual(kits.A.map((f) => f.id), [f2.id]);
  assert.equal(X.retirer(kits, "A", "inconnu"), false);
  assert.equal(X.retirer(kits, "A", f2.id), true);
  assert.equal(kits.A, undefined);
  // un ancien échantillon se retire par son numéro provisoire
  const k2 = { B: [feat(ROUGE), feat(ROUGE)] };
  assert.equal(X.retirer(k2, "B", "legacy:B:0"), true); assert.equal(k2.B.length, 1);
});

test("contradiction : la même tenue donnée à deux équipes est signalée, deux tenues distinctes non", () => {
  const ok = { A: [X.marquer(feat(BLEU), { t: 10 })], B: [X.marquer(feat(ROUGE), { t: 20 })] };
  assert.equal(X.contradictions(ok).length, 0);
  const ko = { A: [X.marquer(feat(BLEU), { t: 10 })], B: [X.marquer(feat(BLEU), { t: 200 })] };
  const c = X.contradictions(ko);
  assert.equal(c.length, 1); assert.equal(c[0].type, "meme_tenue");
  assert.match(c[0].texte, /« Mon équipe » \(0:10\) et à « Adversaires » \(3:20\)/);
});

test("exemple à part : très différent des autres de sa catégorie (au moins 3 exemples)", () => {
  const kits = { A: [X.marquer(feat(BLEU), { t: 1 }), X.marquer(feat(BLEU), { t: 40 }), X.marquer(feat(BLEU), { t: 80 }), X.marquer(feat(JAUNE), { t: 120 })] };
  const c = X.contradictions(kits);
  assert.ok(c.some((x) => x.type === "isole" && x.a.t === 120));
  assert.equal(X.contradictions({ A: kits.A.slice(0, 3) }).length, 0);
});

test("références : la moyenne utilise TOUS les exemples ; avec « multi », une référence par instant", () => {
  const kits = { A: [X.marquer(feat(BLEU), { t: 5 }), X.marquer(feat([60, 100, 230]), { t: 100 })] };
  const r = X.refs(kits, {});
  assert.equal(r.A.alts, undefined);
  assert.deepEqual(r.A.shirt, K.average(kits.A).shirt);
  const m = X.refs(kits, { multi: true });
  assert.equal(m.A.alts.length, 2);
  assert.deepEqual(m.A.shirt, r.A.shirt);                 // la moyenne reste la même
  const unSeul = X.refs({ A: [X.marquer(feat(BLEU), { t: 5 }), X.marquer(feat(BLEU), { t: 8 })] }, { multi: true });
  assert.equal(unSeul.A.alts, undefined);                 // un seul instant : rien de plus
});

test("classer avec une référence par instant : la plus proche gagne ; sans alts, résultat identique à avant", () => {
  const clair = feat([70, 130, 255]), fonce = feat([20, 40, 140]);
  const kits = { A: [X.marquer(clair, { t: 5 }), X.marquer(fonce, { t: 100 })], B: [X.marquer(feat(ROUGE), { t: 7 })] };
  const sombre = feat([22, 45, 150]);
  const sans = X.refs(kits, {}), avec = X.refs(kits, { multi: true });
  const dSans = K.distAlts(sombre, sans.A), dAvec = K.distAlts(sombre, avec.A);
  assert.equal(dSans, K.dist(sombre, sans.A));
  assert.ok(dAvec <= dSans);
  assert.equal(K.classify(sombre, avec, { reject: 42 }).team, "A");
  assert.equal(K.classify(sombre, sans, { reject: 42 }).team, K.classify(sombre, { A: sans.A, B: sans.B }, { reject: 42 }).team);
});

test("prochain instant : s'appuie sur l'analyse si elle a vu la catégorie, sinon un instant éloigné, jamais un instant déjà donné", () => {
  const kits = { REF: [X.marquer(feat(JAUNE), { t: 30, v: "m.mp4" })] };
  const frames = [
    { t: 28, players: [{ team: "REF", b: [0, 0, 50, 200] }] },
    { t: 200, players: [{ team: "REF", b: [0, 0, 50, 100] }] },
    { t: 120, players: [{ team: "A", b: [0, 0, 50, 300] }] }
  ];
  const p = X.prochainInstant({ kits, cat: "REF", frames, duree: 300, v: "m.mp4" });
  assert.equal(p.t, 200); assert.equal(p.probable, true);
  const q = X.prochainInstant({ kits, cat: "REF", frames: [], duree: 300, v: "m.mp4" });
  assert.equal(q.probable, false); assert.ok(Math.abs(q.t - 30) >= 20);
  assert.equal(X.prochainInstant({ kits, cat: "REF", frames: [], duree: 0 }), null);
});

test("banc : marques cohérentes, dérive signalée, second banc distinct, demande si caméra mobile et une seule marque", () => {
  const z = (x1, y1, x2, y2, t) => X.marquerBanc({ x1, y1, x2, y2 }, { t });
  const ok = X.banc([z(10, -3, 14, -1, 20), z(10.4, -3.2, 14.3, -1.1, 200)], { camera: "mobile" });
  assert.equal(ok.coherent, true); assert.equal(ok.messages.length, 0); assert.equal(ok.instants, 2); assert.equal(ok.etat, "ok");
  const derive = X.banc([z(10, -3, 14, -1, 20), z(13, -4, 17, -2, 200)], { camera: "mobile" });
  assert.equal(derive.coherent, false); assert.match(derive.messages[0], /ne s'accordent pas/);
  const deux = X.banc([z(10, -3, 14, -1, 20), z(30, 21, 34, 23, 20)], { camera: "mobile" });
  assert.equal(deux.paires.length, 0); assert.equal(deux.coherent, true);
  const seul = X.banc([z(10, -3, 14, -1, 20)], { camera: "mobile" });
  assert.equal(seul.etat, "a_completer"); assert.match(seul.messages[0], /moins fiable/);
  assert.equal(X.banc([z(10, -3, 14, -1, 20)], { camera: "fixed" }).etat, "ok");
  assert.equal(X.banc([], {}).etat, "aucune");
});

test("la mémoire reste dans le projet : le module ne garde aucun état global entre deux projets", () => {
  const k1 = { A: [X.marquer(feat(BLEU), { t: 1 })] }, k2 = {};
  assert.equal(X.liste(k2, "A").length, 0);
  assert.equal(X.liste(k1, "A").length, 1);
  assert.deepEqual(Object.keys(X.refs(k2)), []);
});
