/* Caméra à la main : décrochage (flou + balayage violent) puis reprise. analyseVideo est joué dans un faux navigateur
   (vidéo synthétique) : on vérifie que le passage perdu est repéré, que le point de reprise (caméra redevenue stable) est donné,
   et que rien n'est inventé quand la caméra ne se stabilise jamais. */
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../src/ai/pipeline");
const HG = require("../src/ai/homography");

const W = 480, H = 270, H_ = H;
const noise = (x, y) => { const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return v - Math.floor(v); };

/* Contenu de l'image à l'instant t : scène A (panoramique lent), puis flou plat sur [blurFrom, blurTo[, puis scène B toute différente. */
/* Scène « blocs » (beaucoup de coins) : panoramique lent, puis, après le flou, un saut de 100 px et un zoom de 1,05 que le suivi image par image ne peut pas rattraper. */
const blockHash = (a, b) => { let h = Math.imul((a * 73856093) ^ (b * 19349663), 2654435761); h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
function blocks(x, y, t, sc) {
  const after = t >= sc.blurTo, z = after ? 1.05 : 1, u = x * z + 20 * t + (after ? 100 : 0), v = y * z;
  let c = 40 + 180 * blockHash(Math.floor(u / 6), Math.floor(v / 6));
  if (Math.abs(((u + 300) % 70) - 35) < 1.2) c = 250;
  return c;
}
function pixel(x, y, t, sc) {
  if (t >= sc.blurFrom && t < sc.blurTo) return 120 + noise(x, y) * 2;
  if (sc.blocks) return blocks(x, y, t, sc);
  const B = t >= sc.blurTo && sc.sceneB;
  const s = 20 * t;
  return B
    ? 128 + 50 * Math.sin((x + s + 137) * 0.052 + 1.3) * Math.cos(y * 0.071 + 0.4) + 40 * Math.sin((x + s) * 0.13 + y * 0.083) + 25 * Math.cos(x * 0.031 - y * 0.047)
    : 128 + 50 * Math.sin((x + s) * 0.045) * Math.cos(y * 0.06) + 40 * Math.sin((x + s) * 0.11 + y * 0.09) + 25 * Math.cos(x * 0.037 + y * 0.052);
}

/* Faux navigateur minimal : <video> qui « rend » les images ci-dessus, <canvas> qui garde le dernier dessin. */
function fakeBrowser(sc) {
  const listeners = {};
  const video = {
    duration: 100, currentTime: 0, seeking: false, readyState: 4, videoWidth: W, videoHeight: H, muted: true, preload: "", crossOrigin: "", onloadedmetadata: null, onerror: null,
    addEventListener(n, f) { (listeners[n] = listeners[n] || []).push(f); },
    removeEventListener(n, f) { listeners[n] = (listeners[n] || []).filter((x) => x !== f); },
    removeAttribute() {}, load() {}
  };
  let ct = 0;
  Object.defineProperty(video, "currentTime", { get: () => ct, set: (v) => { ct = v; setTimeout(() => (listeners.seeked || []).slice().forEach((f) => f()), 0); } });
  Object.defineProperty(video, "src", { set: () => setTimeout(() => video.onloadedmetadata && video.onloadedmetadata(), 0), get: () => "x" });
  const cache = new Map();   // images déjà calculées (le calcul pixel par pixel est lent)
  const render = (w, h) => {
    const key = ct.toFixed(3) + "/" + w + "x" + h;
    if (!cache.has(key)) {
      const buf = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const v = Math.max(0, Math.min(255, pixel(x, y, ct, sc))), i = (y * w + x) * 4;
        buf[i] = buf[i + 1] = buf[i + 2] = v; buf[i + 3] = 255;
      }
      cache.set(key, buf);
    }
    return cache.get(key);
  };
  const canvas = () => {
    let buf = null, bw = 0, bh = 0;
    const ctx = {
      fillRect() {}, fillStyle: "",
      drawImage(src, ...a) {
        if (src !== video) return;
        bw = a[2]; bh = a[3]; buf = render(bw, bh);
      },
      getImageData(_x, _y, w, h) { return { data: buf && w === bw && h === bh ? buf : new Uint8ClampedArray(w * h * 4) }; }
    };
    return { width: 0, height: 0, getContext: () => ctx };
  };
  global.document = { createElement: (n) => (n === "video" ? video : canvas()) };
}

const calib = () => ({ t: 0, H: HG.solve([[0, 0], [W, 0], [W, H], [0, H]], [[0, 0], [40, 0], [40, 20], [0, 20]]) });
const run = (t1) => P.analyseVideo({ url: "x", t0: 0, t1, fps: 3, tiles: 1, camera: "mobile", tol: 42, L: 40, W: 20, calibrations: [calib()], api: { aiDetect: async () => ({ dets: [] }) } });

test("caméra stable : aucun passage perdu (non-régression)", async () => {
  fakeBrowser({ blurFrom: 1e9, blurTo: 1e9, sceneB: false });
  let n = 0;
  const r = await P.analyseVideo({ url: "x", t0: 0, t1: 3, fps: 3, tiles: 1, camera: "mobile", tol: 42, L: 40, W: 20, calibrations: [calib()], api: { aiDetect: async () => { n++; return { dets: [] }; } } });
  assert.ok(n >= 9, "les images sont bien analysées (" + n + " détections)");
  assert.deepEqual(r.lost, []);
  assert.deepEqual(r.recalage, []);
});

test("flou puis balayage vers une autre partie du terrain : perdu jusqu'à la fin, point de reprise donné", async () => {
  fakeBrowser({ blurFrom: 2.0, blurTo: 2.4, sceneB: true });
  const r = await run(5);
  assert.equal(r.lost.length, 1, "un seul passage perdu");
  assert.ok(r.lost[0][0] >= 1.9 && r.lost[0][0] <= 2.7, "perdu à partir de " + r.lost[0][0]);
  assert.ok(r.lost[0][1] >= 4.9, "jamais retrouvé : perdu jusqu'à la fin");
  assert.equal(r.recalage.length, 1);
  const rc = r.recalage[0];
  assert.ok(typeof rc.reprise === "number" && rc.reprise >= 2.4 && rc.reprise <= 3.4, "reprise à " + rc.reprise);
  assert.equal(rc.de, r.lost[0][0]);
});

test("la caméra ne se stabilise jamais : aucun point de reprise inventé", async () => {
  fakeBrowser({ blurFrom: 2.0, blurTo: 1e9, sceneB: false });   // flou jusqu'à la fin
  const r = await run(4.5);
  assert.equal(r.recalage.length, 1);
  assert.equal(r.recalage[0].reprise, null);
});

test("flou puis saut de 100 px avec zoom : la caméra est retrouvée par appariement de points (perdue seulement pendant le flou)", async () => {
  fakeBrowser({ blurFrom: 2.0, blurTo: 2.4, blocks: true });
  const r = await run(5);
  assert.ok(r.lost.length <= 1 && r.lost.every((l) => l[1] <= 3), "perdu seulement pendant l'image floue, puis retrouvé : " + JSON.stringify(r.lost));
  assert.ok(r.notes.some((n) => /rattrapée automatiquement/.test(n)), "la note dit que la caméra a été rattrapée : " + r.notes.join(" | "));
});

/* Deux calibrages : à l'arrivée du second, on mesure de combien le suivi issu du premier s'écartait (jamais corrigé en douce). */
test("dérive mesurée au second calibrage : suivi exact = écart quasi nul ; second calibrage décalé de 2 m = écart d'environ 2 m, dit dans les notes", async () => {
  const c1 = calib();
  const second = (dx) => {
    const src = [[0, 0], [W, 0], [W, H], [0, H]];
    return { t: 3, H: HG.solve(src, src.map((p) => { const q = HG.apply(c1.H, p[0] + 60, p[1]); return [q[0] + dx, q[1]]; })) };      // la scène défile de 20 px/s : à 3 s, 60 px
  };
  const go = (dx) => P.analyseVideo({ url: "x", t0: 0, t1: 5, fps: 3, tiles: 1, camera: "mobile", tol: 42, L: 40, W: 20, calibrations: [c1, second(dx)], api: { aiDetect: async () => ({ dets: [] }) } });
  fakeBrowser({ blurFrom: 1e9, blurTo: 1e9, sceneB: false });
  const ok = await go(0);
  assert.equal(ok.derive.length, 1);
  assert.ok(ok.derive[0].med < 0.3, "suivi exact : écart " + ok.derive[0].med + " m");
  assert.ok(ok.notes.some((n) => /le suivi tient bien/.test(n)), ok.notes.join(" | "));
  const ko = await go(2);
  assert.ok(Math.abs(ko.derive[0].med - 2) < 0.4, "second calibrage décalé de 2 m : écart mesuré " + ko.derive[0].med + " m");
  assert.ok(ko.notes.some((n) => /s'écartait de 1,\d m/.test(n) && /le tracé a pu glisser/.test(n)), ko.notes.join(" | "));
  assert.deepEqual(ko.lost, []);
  assert.ok(!ok.notes.some((n) => /Un seul calibrage/.test(n)), "deux calibrages : pas de conseil");
});

test("un seul calibrage sur une longue vidéo : la dérive n'est pas mesurable, on propose un instant ; pas de conseil sinon", () => {
  assert.match(P.conseilCalibrage(true, 1, 17, 817), /Un seul calibrage pour 13 min.*vers 6:57/);
  assert.equal(P.conseilCalibrage(true, 2, 17, 817), null);
  assert.equal(P.conseilCalibrage(true, 1, 0, 200), null);
  assert.equal(P.conseilCalibrage(false, 1, 0, 900), null);
});

/* Suivi de la caméra seul (sans joueurs ni ballon) : même chaîne que l'analyse, réutilisable par elle. */
test("suivi de la caméra seul : caméra stable = suivie partout, position exacte (scène qui défile de 20 px/s)", async () => {
  fakeBrowser({ blurFrom: 1e9, blurTo: 1e9, sceneB: false });
  const c1 = calib();
  const s = await P.suiviCamera({ url: "x", calibrations: [c1], t0: 0, t1: 4 });
  assert.deepEqual(s.lost, []);
  assert.ok(s.frames.length >= 12, s.frames.length + " positions");
  const f = s.frames.find((q) => Math.abs(q.t - 3) < 0.05);
  assert.ok(f, "une position à 3 s");
  const Hs = HG.mul3(f.h, [1 / W, 0, 0, 0, 1 / H_, 0, 0, 0, 1]), coins = [[0, 0], [W, 0], [W, H_], [0, H_]];
  const verite = HG.solve(coins, coins.map((p) => HG.apply(c1.H, p[0] + 60, p[1])));      // la scène défile de 20 px/s : à 3 s, 60 px
  const d = P.driftAt(Hs, verite, W, H_, 40, 20);
  assert.ok(d && d.med < 0.3, "écart à la vérité " + (d && d.med) + " m");
});

test("suivi de la caméra seul : flou puis balayage vers une autre partie du terrain = perdu à partir de la coupure, jamais deviné ensuite", async () => {
  fakeBrowser({ blurFrom: 2.0, blurTo: 2.4, sceneB: true });
  const s = await P.suiviCamera({ url: "x", calibrations: [calib()], t0: 0, t1: 5 });
  assert.equal(s.lost.length, 1);
  assert.ok(s.lost[0][0] >= 1.9 && s.lost[0][0] <= 2.7, "perdu à partir de " + s.lost[0][0]);
  assert.ok(s.lost[0][1] >= 4.9, "jamais retrouvé");
  assert.ok(s.frames.every((q) => q.t < s.lost[0][0] + 0.01), "aucune position après la coupure");
});

test("l'analyse réutilise le suivi de la caméra : mêmes positions, aucune image analysée dans le passage perdu du suivi", async () => {
  fakeBrowser({ blurFrom: 2.0, blurTo: 2.4, sceneB: true });
  const sv = await P.suiviCamera({ url: "x", calibrations: [calib()], t0: 0, t1: 5 });
  let n = 0;
  const r = await P.analyseVideo({ url: "x", t0: 0, t1: 5, fps: 3, tiles: 1, camera: "mobile", tol: 42, L: 40, W: 20, calibrations: [calib()], suivi: sv.frames, api: { aiDetect: async () => { n++; return { dets: [] }; } } });
  assert.ok(r.notes.some((q) => /reprise du suivi de la caméra/.test(q)), r.notes.join(" | "));
  assert.equal(r.lost.length, 1);
  assert.ok(r.lost[0][0] >= sv.lost[0][0] - 0.4 && r.lost[0][0] <= sv.lost[0][0] + 0.4, "même passage perdu : " + JSON.stringify(r.lost) + " / " + JSON.stringify(sv.lost));
  assert.ok(n < 9, "aucune détection dans le passage perdu (" + n + ")");
  const avant = r.lost[0][0];
  assert.ok(r.recalage.length === 1 && r.recalage[0].de === avant);
});

test("empreinte du suivi : change quand un calibrage change ou quand la durée change, stable sinon", () => {
  const a = calib(), b = Object.assign({}, calib(), { t: 3 });
  const k = P.cleSuivi([a], 800);
  assert.equal(k, P.cleSuivi([calib()], 800));
  assert.notEqual(k, P.cleSuivi([a, b], 800));
  assert.notEqual(k, P.cleSuivi([a], 801));
  assert.notEqual(k, P.cleSuivi([Object.assign({}, a, { H: a.H.map((v, i) => (i === 2 ? v + 1 : v)) })], 800));
});

test("courtH : l'analyse d'abord, puis le suivi de la caméra, puis le calibrage ; le suivi sert partout où il est fiable", () => {
  const norm = (dx) => [1, 0, dx, 0, 1, 0, 0, 0, 1];
  const ana = [{ t: 1, h: norm(0.1), players: [] }, { t: 1.3, h: norm(0.11), players: [] }];
  const suivi = [0, 0.3, 0.6, 0.9, 1.2, 1.5, 1.8, 2.1].map((t) => ({ t, h: norm(0.1 + t * 0.01) }));
  const cal = [{ t: 0, H: [1, 0, 0, 0, 1, 0, 0, 0, 1] }];
  assert.equal(P.courtH(ana, cal, "mobile", 1.1, 100, 100, suivi).source, "image-interpolee");
  const a = P.courtH([], cal, "mobile", 1.8, 100, 100, suivi);
  assert.equal(a.source, "image-interpolee-suivi");
  assert.ok(Math.abs(a.H[2] - (0.1 + 1.8 * 0.01)) < 1e-9, "interpolé : " + a.H[2]);
  assert.equal(P.courtH(ana, cal, "mobile", 1.8, 100, 100, suivi).source, "image-interpolee-suivi", "hors des images de l'analyse");
  assert.equal(P.courtH([], cal, "mobile", 5, 100, 100, suivi).H, null, "ni suivi ni calibrage récent : non tracé");
  assert.equal(P.courtH([], cal, "mobile", 5, 100, 100, []).source, "calibrage-ancien");
});

test("cibleCalibrage : là où la caméra est retrouvée, sinon juste après le décrochage", () => {
  assert.deepEqual(P.cibleCalibrage({ de: 10, a: 14 }, 800), { t: 14.3, reprise: true });
  assert.deepEqual(P.cibleCalibrage({ de: 600, a: 800 }, 800), { t: 601, reprise: false });
  assert.deepEqual(P.cibleCalibrage({ de: 799.8, a: 800 }, 800), { t: 800, reprise: false });
});
