/* Signature d'apparence (haut, short, chaussettes, chaussures, cheveux) et son usage dans le suivi : un indice borné, jamais décisif seul. */
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../src/ai/signature");
const T = require("../src/ai/tracker");
const P = require("../src/ai/pipeline");
const HG = require("../src/ai/homography");

/* Joueur synthétique 60x120 : cheveux, maillot, short, chaussettes, chaussures ; fond = parquet bleu. */
function player(o) {
  const w = 60, h = 120, d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c = [60, 110, 160];
    const f = y / h;
    if (f < 0.07) c = o.hair || c;
    else if (f >= 0.15 && f < 0.5) c = o.shirt;
    else if (f >= 0.5 && f < 0.68) c = o.shorts;
    else if (f >= 0.68 && f < 0.96) c = o.socks;
    else if (f >= 0.96) c = o.shoes || c;
    const i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  return { data: d, width: w, height: h };
}
const BOX = [0, 0, 60, 120];
const BLACK = { shirt: [20, 20, 20], shorts: [20, 20, 20], socks: [20, 20, 20], hair: [25, 20, 15], shoes: [245, 245, 245] };
const BLACK_BLUE_SHOES = Object.assign({}, BLACK, { shoes: [30, 70, 220] });
const BLACK_WHITE_SOCKS = Object.assign({}, BLACK, { socks: [245, 245, 245] });

test("signature : les cinq parties sont lues sur une boîte assez grande", () => {
  const s = S.sample(player(BLACK), BOX);
  assert.ok(s && S.PARTS.every((k) => s[k]), "haut, short, chaussettes, chaussures, cheveux");
  assert.ok(s.shoes[0] > 80 && s.shirt[0] < 20, "chaussures claires, maillot sombre");
});

test("signature : boîte trop petite ou image absente → rien n'est inventé", () => {
  assert.equal(S.sample(player(BLACK), [0, 0, 20, 120]), null);
  assert.equal(S.sample(player(BLACK), [0, 0, 60, 60]), null);
  assert.equal(S.sample(null, BOX), null);
  // boîte moyenne : pas de chaussures ni de cheveux lus, le haut + short + chaussettes suffisent
  const mid = S.sample(player(BLACK), [0, 0, 60, 90]);
  assert.ok(mid && !mid.shoes && !mid.hair);
});

test("signature : un même joueur reste proche, deux joueurs aux détails différents s'éloignent", () => {
  const a = S.sample(player(BLACK), BOX), same = S.sample(player(BLACK), BOX);
  assert.equal(S.distance(a, same), 0);
  const shoes = S.sample(player(BLACK_BLUE_SHOES), BOX), socks = S.sample(player(BLACK_WHITE_SOCKS), BOX);
  assert.ok(S.distance(a, shoes) > 5, "chaussures différentes : " + S.distance(a, shoes));
  assert.ok(S.distance(a, socks) > 5, "chaussettes différentes : " + S.distance(a, socks));
});

test("signature : comparaison impossible sans signature fiable → distance nulle (null) et surcoût 0", () => {
  const a = S.sample(player(BLACK), BOX);
  assert.equal(S.distance(a, null), null);
  assert.equal(S.penalty(null, a), 0);
  assert.equal(S.penalty(a, undefined), 0);
  assert.equal(S.penalty({ shirt: [1, 1, 1] }, a), 0, "un maillot seul n'est pas fiable");
});

test("signature : le surcoût est borné et nul pour la même apparence", () => {
  const a = S.sample(player(BLACK), BOX);
  assert.equal(S.penalty(a, S.sample(player(BLACK), BOX)), 0);
  const far = S.sample(player({ shirt: [240, 240, 240], shorts: [240, 240, 240], socks: [240, 240, 240], hair: [240, 240, 240], shoes: [10, 10, 10] }), BOX);
  const p = S.penalty(a, far);
  assert.ok(p > 0 && p <= S.MAX_PENALTY + 1e-9, "surcoût " + p);
});

test("signature : la signature de la piste glisse doucement et ignore une lecture non fiable", () => {
  const a = S.sample(player(BLACK), BOX), b = S.sample(player(BLACK_BLUE_SHOES), BOX);
  assert.equal(S.blend(null, null), null);
  assert.equal(S.blend(a, null), a);
  const m = S.blend(a, b);
  assert.ok(m.shoes[0] < a.shoes[0] && m.shoes[0] > b.shoes[0]);
});

/* ---------- suivi ---------- */
const sigA = S.sample(player(BLACK), BOX), sigB = S.sample(player(BLACK_BLUE_SHOES), BOX);
const det = (x, y, sig) => { const d = { x, y, team: "A", box: [0, 0, 60, 120], conf: 0.9 }; if (sig) d.sig = sig; return d; };
/* Deux joueurs de la même équipe, immobiles à 0,6 m l'un de l'autre (A en 10, B en 10,6). Puis ils se croisent : A est lu en 10,5
   et B en 10,1. La distance seule rattache chaque détection à la piste la plus proche, donc A↔B échangés ; l'apparence les remet d'aplomb. */
function cross(tracker, withSig) {
  const s = (sig) => (withSig ? sig : null);
  const ids = [];
  const frames = [
    [det(10, 10, s(sigA)), det(10.6, 10, s(sigB))],
    [det(10, 10, s(sigA)), det(10.6, 10, s(sigB))],
    [det(10.5, 10, s(sigA)), det(10.1, 10, s(sigB))]
  ];
  frames.forEach((dets, i) => { tracker.update(i * 0.5, dets); ids.push(dets.map((d) => d.id)); });
  return ids;
}

test("suivi : sans apparence, la distance seule échange les deux joueurs (cas témoin)", () => {
  const ids = cross(new T.Tracker(), true);
  assert.equal(ids[2][0], ids[0][1], "A reçoit l'identité de B : c'est l'erreur que l'apparence doit corriger");
});

test("suivi : avec l'apparence (tenues proches), les identités ne s'échangent pas au croisement", () => {
  const ids = cross(new T.Tracker({ appearance: true }), true);
  assert.equal(ids[2][0], ids[0][0], "joueur A retrouvé");
  assert.equal(ids[2][1], ids[0][1], "joueur B retrouvé");
});

test("suivi : sans l'option, la signature est ignorée (comportement identique à avant)", () => {
  assert.deepEqual(cross(new T.Tracker(), true), cross(new T.Tracker(), false), "mêmes identités avec ou sans signature quand l'option est fausse");
});

test("suivi : le surcoût d'apparence ne coupe jamais une piste (il ne rend pas l'association impossible)", () => {
  const tr = new T.Tracker({ appearance: true });
  tr.update(0, [det(10, 10, sigA)]);
  const d = det(10.3, 10, sigB);
  tr.update(0.5, [d]);
  assert.equal(d.id, 1, "seule détection plausible : elle garde la piste malgré une apparence différente");
});

test("suivi : aucune signature → même résultat que sans option", () => {
  const a = new T.Tracker({ appearance: true }), b = new T.Tracker();
  const seq = [[[10, 10], [13, 10]], [[11, 10], [12.6, 10]], [[12.4, 10], [12.8, 10]]];
  const run = (t) => seq.map((pts, i) => { const dets = pts.map(([x, y]) => det(x, y)); t.update(i * 0.5, dets); return dets.map((d) => d.id); });
  assert.deepEqual(run(a), run(b));
});

/* ---------- pipeline : la signature n'est lue que si les tenues sont proches, et n'est jamais écrite dans les images ---------- */
test("pipeline : la signature n'apparaît pas dans les images, et n'est lue que sur demande", () => {
  const H = HG.solve([[0, 0], [1000, 0], [1000, 500], [0, 500]], [[0, 0], [40, 0], [40, 20], [0, 20]]);
  const im = player(BLACK);
  const w = 1000, h = 500, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; data[i] = 60; data[i + 1] = 110; data[i + 2] = 160; data[i + 3] = 255; }
  // joueur 60x120 collé en (100, 200)
  for (let y = 0; y < 120; y++) for (let x = 0; x < 60; x++) { const s = (y * 60 + x) * 4, i = ((200 + y) * w + 100 + x) * 4; data[i] = im.data[s]; data[i + 1] = im.data[s + 1]; data[i + 2] = im.data[s + 2]; }
  const img = { data, width: w, height: h };
  const dets = [{ cls: 0, score: 0.9, x1: 100, y1: 200, x2: 160, y2: 320 }];
  const run = (appearance) => P.processDetections(dets.map((d) => Object.assign({}, d)), { frameW: w, frameH: h, scale: 1, img, H, L: 40, W: 20, tracker: new T.Tracker({ appearance }), t: 1, appearance });
  const on = run(true), off = run(false);
  assert.equal(JSON.stringify(on), JSON.stringify(off), "images identiques : la signature n'est jamais enregistrée");
  assert.ok(!JSON.stringify(on).includes("sig"));
});
