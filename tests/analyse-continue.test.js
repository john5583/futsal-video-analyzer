/* Analyse continue (analyseVideoContinuous) jouée dans un faux navigateur : vidéo synthétique à 30 images/s avec un panoramique lent, deux joueurs
   (un rouge, un bleu) qui se croisent, et des accidents de caméra (une image floue isolée, un balayage violent). On vérifie la cadence, les identités
   qui tiennent au croisement, les positions sur le terrain (la caméra est bien compensée), et que rien n'est inventé quand la caméra est perdue. */
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../src/ai/pipeline");
const HG = require("../src/ai/homography");
const K = require("../src/ai/kit");

const W = 480, H = 270, FPS = 30;
const noise = (x, y) => { const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return v - Math.floor(v); };

/* Décor : panoramique de 20 px/s ; sc.jumpAt : à cet instant, une autre partie du terrain apparaît et la caméra file à 200 px/s (balayage violent, jumpSpeed px/s) ;
   sc.blur : liste d'instants (début, fin) d'images floues (motif plat). */
function offset(t, sc) { return sc.jumpAt != null && t >= sc.jumpAt ? 20 * sc.jumpAt + sc.jumpSpeed * (t - sc.jumpAt) + 137 : 20 * t; }
function bg(x, y, t, sc) {
  if ((sc.blur || []).some(([a, b]) => t >= a && t < b)) return 120 + noise(x, y) * 2;
  const s = offset(t, sc), after = sc.jumpAt != null && t >= sc.jumpAt;
  return after
    ? 128 + 50 * Math.sin((x + s) * 0.052 + 1.3) * Math.cos(y * 0.071 + 0.4) + 40 * Math.sin((x + s) * 0.13 + y * 0.083) + 25 * Math.cos(x * 0.031 - y * 0.047)
    : 128 + 50 * Math.sin((x + s) * 0.045) * Math.cos(y * 0.06) + 40 * Math.sin((x + s) * 0.11 + y * 0.09) + 25 * Math.cos(x * 0.037 + y * 0.052);
}
/* Deux joueurs dans le « monde » (px de l'image à t = 0) : A rouge vers la droite, B bleu vers la gauche ; ils se croisent à t = 3,33 s à 0,8 m l'un de l'autre. */
const world = (t) => [{ team: "A", x: 100 + 30 * t, y: 150, rgb: [215, 50, 50] }, { team: "B", x: 300 - 30 * t, y: 160, rgb: [30, 90, 220] }];
const persons = (t, sc) => world(t).map((p) => ({ team: p.team, rgb: p.rgb, fx: p.x - offset(t, sc), fy: p.y }));

function fakeBrowser(sc) {
  const listeners = {};
  let ct = 0, shown = 0, cbs = [], lastShown = null;
  const fpsReal = sc.frameFps || 30;
  const video = {
    duration: 100, seeking: false, readyState: 4, videoWidth: W, videoHeight: H, muted: true, preload: "", crossOrigin: "", onloadedmetadata: null, onerror: null,
    addEventListener(n, f) { (listeners[n] = listeners[n] || []).push(f); },
    removeEventListener(n, f) { listeners[n] = (listeners[n] || []).filter((x) => x !== f); },
    removeAttribute() {}, load() {}
  };
  if (sc.rvfc) video.requestVideoFrameCallback = (cb) => { cbs.push(cb); };
  Object.defineProperty(video, "currentTime", { get: () => ct, set: (v) => {
    ct = v;
    let t = Math.floor(v * fpsReal + 1e-9) / fpsReal;                        // image affichée : celle qui contient l'instant demandé
    (sc.glitches || []).forEach((g) => { if (!g.done && v >= g.at) { g.done = true; t = g.kind === "dup" ? (lastShown != null ? lastShown : t) : t + 2 / fpsReal; } });
    shown = sc.rvfc ? t : v; lastShown = t;
    setTimeout(() => { (listeners.seeked || []).slice().forEach((f) => f()); const c = cbs; cbs = []; c.forEach((cb) => cb(0, { mediaTime: t })); }, 0);
  } });
  Object.defineProperty(video, "src", { set: () => setTimeout(() => video.onloadedmetadata && video.onloadedmetadata(), 0), get: () => "x" });
  const cache = new Map();
  const render = (w, h) => {
    const key = shown.toFixed(4) + "/" + w + "x" + h;
    if (!cache.has(key)) {
      const buf = new Uint8ClampedArray(w * h * 4), ps = persons(shown, sc);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const v = Math.max(0, Math.min(255, bg(x, y, shown, sc))), i = (y * w + x) * 4;
        let c = [v, v, v];
        for (const p of ps) if (x >= p.fx - 6 && x <= p.fx + 6 && y >= p.fy - 30 && y <= p.fy) { c = p.rgb; break; }
        buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;
      }
      cache.set(key, buf);
    }
    return cache.get(key);
  };
  const canvas = () => {
    let buf = null, bw = 0, bh = 0;
    const ctx = {
      fillRect() {}, fillStyle: "",
      drawImage(src, ...a) { if (src === video) { bw = a[2]; bh = a[3]; buf = render(bw, bh); } },
      getImageData(_x, _y, w, h) { return { data: buf && w === bw && h === bh ? buf : new Uint8ClampedArray(w * h * 4), width: w, height: h }; }
    };
    return { width: 0, height: 0, getContext: () => ctx };
  };
  global.document = { createElement: (n) => (n === "video" ? video : canvas()) };
  // détecteur factice : renvoie les deux joueurs de l'image affichée (coordonnées de la vignette 640 x 640, comme le vrai détecteur)
  const r = 640 / Math.max(W, H);
  return {
    aiDetect: async () => ({ dets: persons(shown, sc).filter((p) => p.fx > 8 && p.fx < W - 8).map((p) => ({ cls: 0, score: 0.9, x1: (p.fx - 6) * r, y1: (p.fy - 30) * r, x2: (p.fx + 6) * r, y2: p.fy * r })) })
  };
}

const calib = () => ({ t: 0, H: HG.solve([[0, 0], [W, 0], [W, H], [0, H]], [[0, 0], [40, 0], [40, 20], [0, 20]]) });
const solid = (rgb) => { const w = 40, h = 100, d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < d.length; i += 4) { d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255; } return { data: d, width: w, height: h }; };
const refs = () => ({ A: K.average([K.sample(solid([215, 50, 50]), [0, 0, 40, 100])]), B: K.average([K.sample(solid([30, 90, 220]), [0, 0, 40, 100])]) });
const run = (sc, t1, extra) => { const api = fakeBrowser(sc); return P.analyseVideoContinuous(Object.assign({ url: "x", t0: 0, t1, tiles: 1, camera: "mobile", videoFps: FPS, tol: 42, L: 40, W: 20, calibrations: [calib()], refs: refs(), floorMarks: true, api }, extra || {})); };
const worldM = (t, team) => { const p = world(t).find((q) => q.team === team); return [(p.x * 40) / W, (p.y * 20) / H]; };      // position réelle en mètres

test("analyse continue : cadence, deux sorties (continue et historique), identités stables au croisement, positions justes", async () => {
  const r = await run({}, 4);
  assert.equal(r.continuous.images, 121, "toutes les images lues");
  assert.deepEqual(r.lost, []);
  const dt = r.trace.slice(1).map((f, i) => f.t - r.trace[i].t);
  assert.ok(dt.every((d) => Math.abs(d - 0.1) < 0.011), "trace à 10 images/s");
  const dl = r.frames.slice(1).map((f, i) => f.t - r.frames[i].t);
  assert.ok(dl.every((d) => Math.abs(d - 0.3) < 0.011), "analyse historique à ~3,3 images/s");
  ["A", "B"].forEach((team) => {
    const ids = new Set(), errs = [];
    r.trace.forEach((f) => f.players.filter((p) => p.team === team).forEach((p) => {
      ids.add(p.id);
      const w = worldM(f.t, team);
      errs.push(Math.hypot(p.x - w[0], p.y - w[1]));
    }));
    assert.equal(ids.size, 1, "équipe " + team + " : un seul identifiant sur toute la trace (même au croisement), obtenu " + ids.size);
    assert.ok(errs.length >= 36, "joueur " + team + " vu sur presque toute la trace (" + errs.length + ")");
    const sorted = errs.slice().sort((a, b) => a - b);
    assert.ok(sorted[Math.floor(sorted.length * 0.9)] < 0.5, "équipe " + team + " : erreur de position (p90) " + sorted[Math.floor(sorted.length * 0.9)].toFixed(2) + " m");
  });
  // les identités de la trace sont celles de l'analyse historique
  const hist = new Set(); r.frames.forEach((f) => f.players.forEach((p) => hist.add(p.id)));
  const tr = new Set(); r.trace.forEach((f) => f.players.forEach((p) => tr.add(p.id)));
  assert.deepEqual([...tr].sort(), [...hist].sort());
});

test("enjambement d'une image floue : écart entre deux pas de caméra et pas moyen", () => {
  const shift = (dx, dy) => [1, 0, dx, 0, 1, dy, 0, 0, 1];
  assert.equal(P.stepGap(shift(1, 0), shift(1, 0), 480, 270), 0);
  assert.ok(Math.abs(P.stepGap(shift(1, 0), shift(3, 0), 480, 270) - 2) < 1e-9, "2 px d'écart");
  assert.ok(P.stepGap(shift(1, 0), shift(20, 0), 480, 270) > 10, "pas très différents : pas d'enjambement");
  const m = P.avgStep(shift(1, 2), shift(3, 4));
  assert.ok(Math.abs(m[2] - 2) < 1e-9 && Math.abs(m[5] - 3) < 1e-9 && m[8] === 1);
  const l = P.lerpM(shift(0, 0), shift(10, 20), 0.25);
  assert.ok(Math.abs(l[2] - 2.5) < 1e-9 && Math.abs(l[5] - 5) < 1e-9);
});

test("analyse continue : balayage violent (vitesse très différente avant et après) : perdu, jamais deviné, point de reprise donné", async () => {
  const r = await run({ jumpAt: 1.5, jumpSpeed: 100, blur: [[1.5, 1.5 + 2 / FPS]] }, 4);
  assert.ok(r.continuous.bridged === 0, "aucune image enjambée à tort : " + r.continuous.bridged);
  assert.equal(r.lost.length, 1);
  assert.ok(r.lost[0][0] >= 1.4 && r.lost[0][0] <= 1.8, "perdu à partir de " + r.lost[0][0]);
  assert.ok(r.lost[0][1] >= 3.8, "perdu jusqu'à la fin : aucun calibrage ni image clé ne permet de retrouver la position");
  const rc = r.recalage[0];
  assert.ok(typeof rc.reprise === "number" && rc.reprise >= 1.5 && rc.reprise <= 2.6, "reprise à " + rc.reprise);
  // pas de position après la perte
  assert.ok(r.trace.every((f) => f.t < 1.8), "aucune position inventée après la perte de la caméra : dernière image " + r.trace[r.trace.length - 1].t);
});

test("analyse continue : un nouveau calibrage redonne le terrain après la perte (la position n'est jamais devinée avant)", async () => {
  const r = await run({ jumpAt: 1.5, jumpSpeed: 100, blur: [[1.5, 1.5 + 2 / FPS]] }, 4, { calibrations: [calib(), Object.assign(calib(), { t: 2.5 })] });
  assert.ok(r.trace.some((f) => f.t >= 2.5), "analyse reprise à partir du deuxième calibrage");
  assert.ok(r.trace.every((f) => f.t < 1.8 || f.t >= 2.5), "rien entre la perte et le nouveau calibrage");
});

test("analyse continue : caméra fixe, toutes les images sont traitées sans suivi de caméra", async () => {
  const r = await run({}, 2, { camera: "fixed" });
  assert.equal(r.continuous.images, 61);
  assert.deepEqual(r.lost, []);
  assert.ok(r.trace.length >= 20);
});

test("analyse continue : le zoom automatique n'existe pas dans ce mode (repli annoncé), annulation propre", async () => {
  const z = await run({}, 1, { tiles: 3, camera: "fixed" });
  assert.ok(z.notes.some((n) => /zoom automatique/.test(n)));
  const ac = new AbortController(); ac.abort();
  await assert.rejects(() => run({}, 2, { signal: ac.signal }), /interrompue/);
});

/* ---------- lecture image par image : instant réel de chaque image (rappel d'image de la vidéo) ---------- */
test("lecture : instants réels des images, aucune image dupliquée ni sautée, même à 29,97 images/s", async () => {
  for (const frameFps of [30, 29.97]) {
    const r = await run({ rvfc: true, frameFps }, 3);
    assert.equal(r.continuous.duplicated, 0, frameFps + " im/s : doublons");
    assert.equal(r.continuous.skipped, 0, frameFps + " im/s : sauts");
    assert.equal(r.continuous.withoutFrameTime, 0);
    assert.ok(Math.abs(r.continuous.videoFps - frameFps) < 0.3, "cadence réelle estimée " + r.continuous.videoFps);
    assert.ok(r.continuous.images >= 88 && r.continuous.images <= 92, frameFps + " im/s : images lues " + r.continuous.images);
    const dt = r.trace.slice(1).map((f, i) => f.t - r.trace[i].t);
    assert.ok(dt.every((d) => Math.abs(d - 3 / frameFps) < 0.012), "trace à ~10 images/s sans trou");
  }
});

test("lecture : une image dupliquée par un à-coup du décodeur est relue (rien n'est analysé deux fois) ; une image sautée est comptée", async () => {
  const dup = await run({ rvfc: true, glitches: [{ at: 1.0, kind: "dup" }] }, 3);
  assert.equal(dup.continuous.skipped, 0, "après un doublon, l'image est relue : aucun saut");
  assert.equal(dup.continuous.images, 91, "autant d'images analysées que sans accident");
  const sk = await run({ rvfc: true, glitches: [{ at: 1.0, kind: "skip" }] }, 3);
  assert.ok(sk.continuous.skipped >= 1, "sauts comptés : " + sk.continuous.skipped);
  assert.equal(sk.continuous.duplicated, 0);
});
