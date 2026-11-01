const test = require("node:test");
const assert = require("node:assert/strict");
const B = require("../src/ai/but-ia");

/* Sortie brute factice : un seul but à (cx, cy, w, h) en pixels du réseau, sur la grille de pas 16. */
function sortieAvecBut(cx, cy, w, h, score) {
  const n = (B.IW / 8) * (B.IH / 8) + (B.IW / 16) * (B.IH / 16) + (B.IW / 32) * (B.IH / 32), out = new Float32Array(n * 6);
  const s = 16, base = (B.IW / 8) * (B.IH / 8), gx = Math.floor(cx / s), gy = Math.floor(cy / s), i = base + gy * (B.IW / s) + gx, o = i * 6;
  out[o] = cx / s - gx; out[o + 1] = cy / s - gy; out[o + 2] = Math.log(w / s); out[o + 3] = Math.log(h / s); out[o + 4] = Math.sqrt(score); out[o + 5] = Math.sqrt(score);
  return out;
}

test("but-ia : une image horizontale = une seule fenêtre ; une image verticale = des fenêtres 16:9 qui couvrent tout", () => {
  assert.deepEqual(B.fenetres(1920, 1080), [{ x: 0, y: 0, w: 1920, h: 1080 }]);
  const f = B.fenetres(1080, 1920);
  assert.ok(f.length >= 3);
  assert.equal(f[0].y, 0); assert.equal(f[f.length - 1].y + f[f.length - 1].h, 1920);
  f.forEach((w) => assert.equal(w.w, 1080));
});

test("but-ia : le prétraitement réduit en moyennant (BGR, gris 114 au-delà de l'image)", () => {
  const W = 200, H = 112, rgba = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { rgba[i * 4] = 200; rgba[i * 4 + 1] = 100; rgba[i * 4 + 2] = 50; rgba[i * 4 + 3] = 255; }
  const { tensor, k } = B.versTenseur(rgba, W, H, { x: 0, y: 0, w: W, h: H });
  const n = B.IW * B.IH;
  assert.ok(Math.abs(k - Math.min(B.IW / W, B.IH / H)) < 1e-9);
  assert.ok(Math.abs(tensor[0] - 50) < 1e-3 && Math.abs(tensor[n] - 100) < 1e-3 && Math.abs(tensor[2 * n] - 200) < 1e-3);      // B, G, R
  assert.equal(tensor[B.IW * B.IH - 1], 114);                                                                                  // coin rempli de gris
});

test("but-ia : décodage, retrait des doublons et retour dans les pixels de l'image d'origine", async () => {
  const W = 1920, H = 1080, rgba = new Uint8ClampedArray(W * H * 4);
  const k = B.IW / W;
  // un but en (800..1000, 300..450) dans l'image d'origine
  const brut = sortieAvecBut(((800 + 1000) / 2) * k, ((300 + 450) / 2) * k, 200 * k, 150 * k, 0.9);
  const res = await B.detecter(async () => brut, rgba, W, H);
  assert.equal(res.length, 1);
  assert.ok(Math.abs(res[0].x0 - 800) < 20 && Math.abs(res[0].x1 - 1000) < 20 && Math.abs(res[0].y0 - 300) < 20 && Math.abs(res[0].y1 - 450) < 20, JSON.stringify(res[0]));
  assert.ok(res[0].score > 0.8);
  const rien = await B.detecter(async () => new Float32Array(brut.length), rgba, W, H);
  assert.equal(rien.length, 0);
});

test("but-ia : une sortie de mauvaise taille est refusée (jamais deviner)", async () => {
  await assert.rejects(() => B.detecter(async () => new Float32Array(10), new Uint8ClampedArray(64 * 36 * 4), 64, 36));
});

test("but-ia : un cadre devient un but pour l'assistant (poteaux = côtés du cadre)", () => {
  const g = B.versBut({ x0: 100, y0: 40, x1: 220, y1: 130, score: 0.8 }, 0.5);
  assert.equal(g.left.u, 50); assert.equal(g.right.u, 110); assert.equal(g.left.v0, 20); assert.equal(g.left.v1, 65);
  assert.equal(g.ia, true);
});
