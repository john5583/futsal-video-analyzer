const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const S = require("../src/ai/sam");
const K = require("../src/ai/kit");

test("découpe : tailles d'image et conversion HWC", () => {
  assert.deepEqual(S.fitSize(1920, 1080), { s: 1024 / 1920, w: 1024, h: 576 });
  assert.equal(S.fitSize(1080, 1920).h, 1024);
  const t = S.toHWC(Uint8ClampedArray.from([1, 2, 3, 255, 4, 5, 6, 255]), 2, 1);
  assert.deepEqual(Array.from(t), [1, 2, 3, 4, 5, 6]);
});

test("découpe : on ne garde que la plus grande zone connexe", () => {
  const w = 8, h = 4, d = new Uint8Array(w * h);
  [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1]].forEach(([x, y]) => { d[y * w + x] = 1; }); // zone de 5
  d[3 * w + 7] = 1; // pixel isolé
  const r = S.largestComponent(d, w, h);
  assert.equal(r.count, 5);
  assert.equal(r.data[3 * w + 7], 0);
});

test("découpe : le masque est recadré autour de la boîte", () => {
  const W = 100, H = 100, logits = new Float32Array(W * H).fill(-1);
  for (let y = 20; y < 60; y++) for (let x = 30; x < 50; x++) logits[y * W + x] = 2;
  const m = S.cropMask(logits, W, H, [30, 20, 50, 60]);
  assert.equal(m.area, 20 * 40);
  assert.ok(m.x0 <= 30 && m.y0 <= 20 && m.x0 + m.w >= 50 && m.y0 + m.h >= 60);
  assert.equal(m.data[(25 - m.y0) * m.w + (35 - m.x0)], 1);
});

function paint(w, h, f) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = f(x, y), i = (y * w + x) * 4;
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
  }
  return { data, width: w, height: h };
}

test("tenue depuis la silhouette : ignore le décor derrière le joueur", () => {
  // joueur 40×120 (maillot gris, manches citron, short noir) sur un sol orange très différent
  const box = [30, 10, 70, 130];
  const inBody = (x, y) => x >= 38 && x < 62;
  const img = paint(100, 140, (x, y) => {
    if (!inBody(x, y) && x >= 30 && x < 70) return [220, 120, 40]; // décor orange à l'intérieur de la boîte
    if (y < 10 || y > 130 || x < 30 || x >= 70) return [220, 120, 40];
    const rel = (y - 10) / 120;
    if (rel < 0.5) return (x < 42 || x >= 58) ? [170, 220, 40] : [120, 120, 120];
    return [20, 20, 20];
  });
  const mask = { x0: 30, y0: 10, w: 40, h: 120, data: new Uint8Array(40 * 120) };
  for (let y = 0; y < 120; y++) for (let x = 0; x < 40; x++) mask.data[y * 40 + x] = inBody(x + 30, y + 10) ? 1 : 0;
  const withMask = K.fromMask(img, box, mask);
  assert.ok(withMask, "empreinte lue");
  const [L, a, b] = withMask.shirt;
  assert.ok(Math.abs(a) < 6 && Math.abs(b) < 6, "maillot gris, pas orange (a=" + a.toFixed(1) + ", b=" + b.toFixed(1) + ")");
  assert.ok(L > 40 && L < 65);
  assert.ok(withMask.shorts && withMask.shorts[0] < 15, "short noir");
  assert.ok(withMask.trim, "manches citron détectées");
  assert.equal(K.fromMask(img, box, { x0: 0, y0: 0, w: 0, h: 0, data: new Uint8Array(0) }), null);
});

/* Test avec le vrai modèle : exécuté seulement si les fichiers sont présents (ils sont téléchargés par « npm test »). */
const MODELS = path.join(__dirname, "..", "models");
const have = ["yolox_s.onnx", "mobile_sam_encoder.onnx", "mobile_sam_decoder.onnx"].every((f) => fs.existsSync(path.join(MODELS, f)));
const fixture = path.join(__dirname, "fixtures", "bus.jpg");

test("découpe réelle : chaque personne détectée donne une silhouette cohérente", { skip: !have || !fs.existsSync(fixture) ? "modèles absents (téléchargés par npm test)" : false }, async () => {
  const ort = require("onnxruntime-node"), jpeg = require("jpeg-js"), Y = require("../src/ai/yolox");
  const img = jpeg.decode(fs.readFileSync(fixture), { useTArray: true });
  // 1) détection des personnes (comme dans yolox.test.js)
  const r = Y.letterboxRatio(img.width, img.height);
  const nw = Math.round(img.width * r), nh = Math.round(img.height * r);
  const lb = new Uint8ClampedArray(640 * 640 * 4).fill(114);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    const sx = Math.min(img.width - 1, Math.floor(x / r)), sy = Math.min(img.height - 1, Math.floor(y / r));
    const si = (sy * img.width + sx) * 4, di = (y * 640 + x) * 4;
    lb[di] = img.data[si]; lb[di + 1] = img.data[si + 1]; lb[di + 2] = img.data[si + 2]; lb[di + 3] = 255;
  }
  const ys = await ort.InferenceSession.create(path.join(MODELS, "yolox_s.onnx"), { executionProviders: ["cpu"] });
  const res = await ys.run({ [ys.inputNames[0]]: new ort.Tensor("float32", Y.rgbaToTensor(lb), [1, 3, 640, 640]) });
  const people = Y.postprocess(res[ys.outputNames[0]].data).filter((d) => d.cls === 0);
  assert.ok(people.length >= 3, "personnes détectées : " + people.length);
  // 2) image pour l'encodeur (plus grand côté = 1024)
  const fit = S.fitSize(img.width, img.height);
  const small = new Uint8ClampedArray(fit.w * fit.h * 4);
  for (let y = 0; y < fit.h; y++) for (let x = 0; x < fit.w; x++) {
    const sx = Math.min(img.width - 1, Math.floor(x / fit.s)), sy = Math.min(img.height - 1, Math.floor(y / fit.s));
    const i = (sy * img.width + sx) * 4, j = (y * fit.w + x) * 4;
    small[j] = img.data[i]; small[j + 1] = img.data[i + 1]; small[j + 2] = img.data[i + 2]; small[j + 3] = 255;
  }
  const sam = await S.create(ort, path.join(MODELS, "mobile_sam_encoder.onnx"), path.join(MODELS, "mobile_sam_decoder.onnx"), 2);
  await sam.embed("bus", small, fit.w, fit.h);
  // 3) une silhouette par personne ; boîtes en pixels de l'image encodée
  for (const d of people) {
    const b = [d.x1 / r * fit.s, d.y1 / r * fit.s, d.x2 / r * fit.s, d.y2 / r * fit.s];
    const m = await sam.segmentBox(b);
    const boxArea = (b[2] - b[0]) * (b[3] - b[1]);
    assert.ok(m.area > boxArea * 0.2 && m.area <= boxArea * 1.1, "aire plausible : " + m.area + " / " + Math.round(boxArea));
    assert.ok(m.iou > 0.5, "qualité annoncée par le modèle : " + m.iou);
    // la silhouette doit rester dans la boîte (à la marge près)
    let out = 0;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.data[y * m.w + x]) { const px = m.x0 + x, py = m.y0 + y; if (px < b[0] - 20 || px > b[2] + 20 || py < b[1] - 20 || py > b[3] + 20) out++; }
    assert.ok(out < m.area * 0.15, "silhouette débordant de la boîte : " + out);
  }
  await ys.release();
});
