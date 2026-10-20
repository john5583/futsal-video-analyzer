/* Caméra à la main : décrochage (flou + balayage violent) puis reprise. analyseVideo est joué dans un faux navigateur
   (vidéo synthétique) : on vérifie que le passage perdu est repéré, que le point de reprise (caméra redevenue stable) est donné,
   et que rien n'est inventé quand la caméra ne se stabilise jamais. */
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../src/ai/pipeline");
const HG = require("../src/ai/homography");

const W = 480, H = 270;
const noise = (x, y) => { const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return v - Math.floor(v); };

/* Contenu de l'image à l'instant t : scène A (panoramique lent), puis flou plat sur [blurFrom, blurTo[, puis scène B toute différente. */
function pixel(x, y, t, sc) {
  if (t >= sc.blurFrom && t < sc.blurTo) return 120 + noise(x, y) * 2;
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
