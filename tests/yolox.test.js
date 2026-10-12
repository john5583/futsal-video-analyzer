const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const Y = require("../src/ai/yolox");

test("rapport de redimensionnement et tenseur BGR", () => {
  assert.equal(Y.letterboxRatio(1920, 1080), 640 / 1920);
  assert.equal(Y.letterboxRatio(1080, 1920), 640 / 1920);
  const px = new Uint8ClampedArray(640 * 640 * 4);
  px[0] = 10; px[1] = 20; px[2] = 30; // R,G,B du premier pixel
  const t = Y.rgbaToTensor(px);
  assert.equal(t.length, 3 * 640 * 640);
  assert.deepEqual([t[0], t[640 * 640], t[2 * 640 * 640]], [30, 20, 10]);
  assert.throws(() => Y.rgbaToTensor(new Uint8Array(12)));
});

test("NMS : garde la meilleure boîte et sépare les classes", () => {
  const d = [
    { cls: 0, score: 0.9, x1: 0, y1: 0, x2: 100, y2: 200 },
    { cls: 0, score: 0.6, x1: 5, y1: 5, x2: 105, y2: 205 },
    { cls: 0, score: 0.7, x1: 300, y1: 0, x2: 400, y2: 200 },
    { cls: 32, score: 0.5, x1: 0, y1: 0, x2: 100, y2: 200 }
  ];
  const k = Y.nms(d, 0.45);
  assert.equal(k.length, 3);
  assert.equal(k[0].score, 0.9);
});

test("décodage d'une sortie synthétique", () => {
  const stride = 85, n = 8400, out = new Float32Array(n * stride);
  // cellule (gx=10, gy=20) du premier pas (8) : indice = 20*80 + 10
  const i = 20 * 80 + 10, o = i * stride;
  out[o] = 0.5; out[o + 1] = 0.5; out[o + 2] = Math.log(4); out[o + 3] = Math.log(8); out[o + 4] = 0.9; out[o + 5] = 0.9;
  const dets = Y.postprocess(out);
  assert.equal(dets.length, 1);
  const d = dets[0];
  assert.equal(d.cls, 0);
  assert.ok(Math.abs((d.x1 + d.x2) / 2 - 84) < 1e-6 && Math.abs((d.y1 + d.y2) / 2 - 164) < 1e-6);
  assert.ok(Math.abs(d.x2 - d.x1 - 32) < 1e-6 && Math.abs(d.y2 - d.y1 - 64) < 1e-6);
  assert.throws(() => Y.decode(new Float32Array(10)));
});

const MODEL = path.join(__dirname, "..", "models", "yolox_s.onnx");
const IMG = path.join(__dirname, "fixtures", "bus.jpg");
test("détection réelle sur une photo (modèle YOLOX-s)", { skip: !fs.existsSync(MODEL) || !fs.existsSync(IMG) }, async () => {
  const ort = require("onnxruntime-node");
  const jpeg = require("jpeg-js");
  const img = jpeg.decode(fs.readFileSync(IMG), { useTArray: true });
  const r = Y.letterboxRatio(img.width, img.height);
  const nw = Math.round(img.width * r), nh = Math.round(img.height * r);
  const rgba = new Uint8ClampedArray(640 * 640 * 4).fill(114);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    const sx = Math.min(img.width - 1, Math.floor(x / r)), sy = Math.min(img.height - 1, Math.floor(y / r));
    const si = (sy * img.width + sx) * 4, di = (y * 640 + x) * 4;
    rgba[di] = img.data[si]; rgba[di + 1] = img.data[si + 1]; rgba[di + 2] = img.data[si + 2]; rgba[di + 3] = 255;
  }
  const session = await ort.InferenceSession.create(MODEL, { executionProviders: ["cpu"] });
  const input = new ort.Tensor("float32", Y.rgbaToTensor(rgba), [1, 3, 640, 640]);
  const res = await session.run({ [session.inputNames[0]]: input });
  const out = res[session.outputNames[0]].data;
  const people = Y.postprocess(out).filter((d) => d.cls === 0);
  assert.ok(people.length >= 3 && people.length <= 6, "personnes détectées : " + people.length);
  // les personnes de la photo "bus" sont debout : boîtes plus hautes que larges
  assert.ok(people.filter((p) => (p.y2 - p.y1) > (p.x2 - p.x1)).length >= 3);
});
