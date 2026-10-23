"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const LS = require("../src/ai/labelStore");
const LF = require("../labelsFs");

const vid = () => LS.create({ name: "m.mp4", size: 1000, duration: 60, vw: 1920, vh: 1080 });

test("ballon : trois états, clic hors image refusé, remplacement sur la même image", () => {
  const d = vid();
  assert.equal(LS.setBall(d, 1000, "vu", 500.4, 300.6), true);
  assert.deepEqual(d.frames["1000"].ball, { state: "vu", u: 500, v: 301 });
  assert.equal(LS.setBall(d, 1000, "vu", 2000, 10), false, "hors image");
  assert.equal(LS.setBall(d, 1000, "vu", NaN, 10), false);
  assert.equal(LS.setBall(d, 1000, "n'importe quoi"), false);
  LS.setBall(d, 1000, "aucun");
  assert.deepEqual(d.frames["1000"].ball, { state: "aucun" });
  LS.setBall(d, 1333, "incertain");
  assert.deepEqual(LS.counts(d), { vu: 0, aucun: 1, incertain: 1, imagesJoueurs: 0, cadres: 0, changements: 0 });
  LS.clearBall(d, 1000);
  assert.equal(d.frames["1000"], undefined, "image vide supprimée");
});
test("« incertain » n'entre jamais dans les données d'entraînement", () => {
  const d = vid();
  LS.setBall(d, 0, "vu", 10, 10); LS.setBall(d, 333, "aucun"); LS.setBall(d, 667, "incertain");
  assert.deepEqual(LS.trainingBalls(d).map((b) => b.ms), [0, 333]);
});
test("cadres : coins remis dans l'ordre et dans l'image, trop petit refusé, type obligatoire", () => {
  const d = vid();
  const b = LS.addBox(d, 0, { x1: 300, y1: 500, x2: 100, y2: 200, team: "A" });
  assert.deepEqual([b.x1, b.y1, b.x2, b.y2], [100, 200, 300, 500]);
  assert.equal(LS.addBox(d, 0, { x1: 10, y1: 10, x2: 13, y2: 40, team: "A" }), null, "3 px de large");
  assert.equal(LS.addBox(d, 0, { x1: 10, y1: 10, x2: 100, y2: 100, team: "ROUGE" }), null);
  const c = LS.addBox(d, 0, { x1: -50, y1: 0, x2: 5000, y2: 2000, team: "B" });
  assert.deepEqual([c.x1, c.x2, c.y2], [0, 1920, 1080], "recadré dans l'image");
  assert.notEqual(b.id, c.id);
  assert.equal(LS.removeBox(d, 0, b.id), true);
  assert.equal(LS.boxes(d, 0).length, 1);
});
test("fiches : une personne retirée détache ses cadres, identité inconnue refusée", () => {
  const d = vid();
  const p = LS.addPerson(d, { nom: "Karim 7", team: "A", role: "ala" });
  const b = LS.addBox(d, 0, { x1: 10, y1: 10, x2: 100, y2: 100, team: "A", who: p.id });
  assert.equal(b.who, p.id);
  assert.equal(LS.setBoxWho(d, 0, b.id, "p99"), false, "fiche inexistante");
  LS.removePerson(d, p.id);
  assert.equal(LS.boxes(d, 0)[0].who, undefined);
  assert.equal(LS.addPerson(d, { nom: "x", team: "ZZ" }), null);
});
test("image terminée (joueurs) et comptes", () => {
  const d = vid();
  LS.addBox(d, 0, { x1: 10, y1: 10, x2: 100, y2: 100, team: "BANC" });
  LS.setPlayersDone(d, 0, true);
  assert.equal(LS.counts(d).imagesJoueurs, 1); assert.equal(LS.counts(d).cadres, 1);
  LS.setPlayersDone(d, 0, false);
  assert.equal(LS.counts(d).imagesJoueurs, 0);
});
test("prochaine image à faire : pas, sens, images déjà faites sautées, fin de vidéo", () => {
  const d = vid();
  assert.equal(LS.nextTodo(d, "ballon", -1, 1, 1), 0);
  LS.setBall(d, 0, "aucun"); LS.setBall(d, 333, "aucun");
  assert.equal(LS.nextTodo(d, "ballon", 0, 1, 1), 667);
  assert.equal(LS.nextTodo(d, "ballon", 667, 1, -1), null, "tout avant est fait");
  assert.equal(LS.nextTodo(d, "ballon", 0, 30, 1), 10000, "1 image sur 30 = toutes les 10 s");
  assert.equal(LS.nextTodo(d, "joueurs", 0, 60, 1), 20000);
  LS.setPlayersDone(d, 20000, true);
  assert.equal(LS.nextTodo(d, "joueurs", 0, 60, 1), 40000);
  assert.equal(LS.nextTodo(d, "joueurs", 40000, 60, 1), null, "la dernière image de la grille est à 59,67 s : rien au-delà");
});
test("relecture d'un fichier : ce qui est invalide est écarté sans erreur", () => {
  assert.equal(LS.normalize(null), null);
  assert.equal(LS.normalize({ version: 2, video: {} }), null);
  const d = LS.normalize({ version: 1, video: { name: "a", vw: 100, vh: 100, duration: 5 }, persons: [{ id: "p1", nom: "x", team: "A" }, { id: "p2", team: "ZZ" }],
    frames: { "100": { ball: { state: "vu", u: "x", v: 3 } }, "200": { ball: { state: "aucun" }, boxes: [{ id: "c1", x1: 1, y1: 1, x2: 20, y2: 20, team: "A" }, { id: "c2", x1: 5, y1: 5, x2: 5, y2: 5, team: "A" }] }, "abc": {} } });
  assert.equal(d.persons.length, 1);
  assert.equal(d.frames["100"], undefined, "clic illisible écarté");
  assert.equal(d.frames["200"].boxes.length, 1);
  assert.equal(d.frames.abc, undefined);
});

test("disque : enregistrement, relecture, copie de secours, clé sûre, image écrite une fois", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-lab-"));
  try {
    const key = LF.videoKey("20261019_211208.mp4", 123456);
    assert.equal(key, "20261019_211208-123456");
    assert.equal(LF.okKey("../x"), false); assert.equal(LF.okKey("a/b"), false); assert.equal(LF.okKey(".."), false);
    assert.throws(() => LF.dirFor(home, "../dehors"));
    const d = vid(); LS.setBall(d, 0, "vu", 10, 20);
    assert.ok(LF.save(home, key, d).ok);
    assert.deepEqual(LF.load(home, key).data.frames["0"].ball, { state: "vu", u: 10, v: 20 });
    LS.setBall(d, 333, "aucun"); LF.save(home, key, d);
    fs.writeFileSync(path.join(LF.dirFor(home, key), "etiquettes.json"), "{ abîmé");
    const r = LF.load(home, key);
    assert.ok(r.fromBackup && r.data.frames["0"], "la copie de secours est relue");
    assert.equal(LF.load(home, "inconnu-1").data, null);
    assert.equal(LF.save(home, key, { n: 1 }).error !== undefined, true, "données invalides refusées");
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    assert.ok(LF.saveImage(home, key, 333, jpg).ok); assert.equal(LF.saveImage(home, key, 333, jpg).existed, true);
    assert.ok(fs.existsSync(path.join(LF.dirFor(home, key), "images", "000000333.jpg")));
    assert.ok(LF.saveImage(home, key, -1, jpg).error); assert.ok(LF.saveImage(home, key, 1.5, jpg).error); assert.ok(LF.saveImage(home, key, 1, Buffer.alloc(0)).error);
    assert.ok(!fs.existsSync(path.join(LF.dirFor(home, key), "etiquettes.json.tmp")), "aucun fichier temporaire oublié");
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
test("la dernière image regardée est gardée dans le fichier (reprise au même endroit)", () => {
  const d = vid(); d.pos = 12000;
  assert.equal(LS.normalize(JSON.parse(JSON.stringify(d))).pos, 12000);
  d.pos = -5; assert.equal(LS.normalize(JSON.parse(JSON.stringify(d))).pos, undefined);
});

test("changements : une personne entre ou sort à un instant ; personne inconnue ou sens inventé refusés ; remplacés par instant", () => {
  const d = vid(); const p = LS.addPerson(d, { nom: "Sami 9", team: "BANC" });
  assert.equal(LS.addSub(d, 5000, "p99", "entre"), null);
  assert.equal(LS.addSub(d, 5000, p.id, "saute"), null);
  assert.equal(LS.addSub(d, -1, p.id, "entre"), null);
  assert.deepEqual(LS.addSub(d, 5000, p.id, "entre"), { ms: 5000, who: p.id, sens: "entre" });
  LS.addSub(d, 5000, p.id, "sort");
  assert.deepEqual(d.subs, [{ ms: 5000, who: p.id, sens: "sort" }], "un seul par personne et par instant");
  LS.addSub(d, 2000, p.id, "entre");
  assert.deepEqual(d.subs.map((x) => x.ms), [2000, 5000], "triés par instant");
  assert.equal(LS.counts(d).changements, 2);
  const back = LS.normalize(JSON.parse(JSON.stringify(d)));
  assert.deepEqual(back.subs, d.subs, "relus à l'identique");
  assert.equal(LS.removeSub(d, 2000, p.id), true);
  LS.removePerson(d, p.id);
  assert.deepEqual(d.subs, [], "retirer la fiche retire ses changements");
});
test("changements illisibles dans un fichier : écartés sans erreur", () => {
  const d = LS.normalize({ version: 1, video: { name: "a", vw: 10, vh: 10, duration: 5 }, persons: [{ id: "p1", nom: "x", team: "A" }], subs: [{ ms: 1000, who: "p1", sens: "entre" }, { ms: "x", who: "p1", sens: "entre" }, { ms: 5, who: "p2", sens: "sort" }, { ms: 7, who: "p1", sens: "autre" }] });
  assert.deepEqual(d.subs, [{ ms: 1000, who: "p1", sens: "entre" }]);
});
test("import de plusieurs fiches : « nom ; type », types par code ou nom complet, lignes non comprises renvoyées", () => {
  const d = vid();
  const r = LS.importPersons(d, "Karim 7 ; A ; ala\nSami 9 ; Adversaire\r\n\nArbitre ; ARB\nInconnu ; XYZ\nsans type\n;A\nLéo ; gardien adverse");
  assert.deepEqual(d.persons.map((p) => [p.nom, p.team, p.role]), [["Karim 7", "A", "ala"], ["Sami 9", "B", ""], ["Arbitre", "ARB", ""], ["Léo", "GKB", ""]]);
  assert.deepEqual(r.refused, ["Inconnu ; XYZ", "sans type", ";A"]);
  assert.equal(r.added.length, 4);
});
