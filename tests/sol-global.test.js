const test = require("node:test");
const assert = require("node:assert/strict");
const SG = require("../src/ai/sol-global");
const HG = require("../src/ai/homography");

/* Salle synthétique : sol bleu, rectangle blanc, ligne jaune, ligne rouge, rond noir ; la caméra va et vient (la même zone est revue : boucle). */
const W = 480, H = 270, PPM = 20;                                  // pixels du plan par mètre
function couleurPlan(u, v) {                                        // (u,v) en mètres
  const l = 0.14;                                                   // épaisseur des traits
  const rect = (Math.abs(u - 0) < l || Math.abs(u - 40) < l) && v > -l && v < 20 + l || (Math.abs(v - 0) < l || Math.abs(v - 20) < l) && u > -l && u < 40 + l;
  if (rect) return [235, 235, 235];
  if (Math.abs(u - 20) < l && v > 0 && v < 20) return [230, 190, 20];
  if (Math.abs(v - 14) < l && u > 0 && u < 40) return [215, 54, 43];
  const r = Math.hypot(u - 20, v - 10);
  if (Math.abs(r - 3) < l) return [15, 15, 15];
  if (Math.abs(Math.hypot(u - 6, v - 10) - 4) < l && u > 6) return [235, 235, 235];
  if (Math.abs(Math.hypot(u - 34, v - 10) - 4) < l && u < 34) return [235, 235, 235];
  const bruit = (((Math.floor(u * 4) * 73856093) ^ (Math.floor(v * 4) * 19349663)) >>> 0) % 24 - 12;   // reflets et usure du sol : texture fixe
  return [58 + bruit, 104 + bruit, 170 + bruit];
}
const base = HG.solve([[0, 0], [40, 0], [40, 20], [0, 20]], [[70, 70], [410, 62], [520, 250], [-60, 262]]);  // plan (m) → image (px)
function homographie(k, n) {
  const ph = (k / n) * 2 * Math.PI, dx = 9 * (1 - Math.cos(ph)) / 2, dy = 1.2 * Math.sin(ph), th = 0.05 * Math.sin(ph);
  const c = Math.cos(th), s = Math.sin(th);
  const T = [c, -s, dx - 0, s, c, dy, 0, 0, 1];                      // décalage du plan vu (équivaut à un mouvement de caméra)
  return HG.mul3(base, T);
}
function rendre(Hk) {
  const Hi = HG.invert(Hk), d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = HG.apply(Hi, x + 0.5, y + 0.5), o = (y * W + x) * 4;
    let col = [170, 175, 180];                                       // mur : gris-beige, hors du sol
    if (isFinite(p[0]) && p[0] > -4 && p[0] < 44 && p[1] > -4 && p[1] < 24) col = couleurPlan(p[0], p[1]);
    d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
  }
  return d;
}

test("sol-global : retrouve la position de la caméra sur un aller-retour et donne un verdict", { timeout: 300000 }, () => {
  const n = 100, imgs = [], Hs = [];
  for (let k = 0; k < n; k++) { const Hk = homographie(k, n); Hs.push(Hk); imgs.push(rendre(Hk)); }
  const r = SG.construire({ n, image: (k) => imgs[k], pasCle: 20, pasVerdict: 4, ecartVerdict: 30 });
  assert.equal(r.G.length, n);
  // vérité : n_k ~ N · Hk · H0⁻¹ · N⁻¹
  const Ni = HG.invert(SG.Nm);
  let bons = 0, pire = 0;
  for (let k = 0; k < n; k++) {
    const vrai = HG.mul3(HG.mul3(SG.Nm, HG.mul3(Hs[k], HG.invert(Hs[0]))), Ni);
    let m = 0;
    for (const p of [[0, 0], [0.4, 0.2], [-0.4, 0.2], [0.4, -0.2], [-0.4, -0.2]]) { const a = HG.apply(vrai, p[0], p[1]), b = HG.apply(r.G[k], p[0], p[1]); m = Math.max(m, Math.hypot(a[0] - b[0], a[1] - b[1]) * SG.F480); }
    if (m <= 3) bons++; pire = Math.max(pire, m);
  }
  assert.ok(bons / n >= 0.9, `positions à ≤ 3 px : ${bons}/${n} (pire ${pire.toFixed(1)} px)`);
  assert.ok(r.stats.partOk >= 0.6, `part de verdicts « ok » : ${r.stats.partOk}`);
});

test("sol-global : une image sans aucune ligne n'obtient jamais le verdict « ok »", { timeout: 300000 }, () => {
  const n = 40, vide = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { vide[4 * i] = 58; vide[4 * i + 1] = 104; vide[4 * i + 2] = 170; vide[4 * i + 3] = 255; }
  const r = SG.construire({ n, image: () => vide, pasCle: 20, pasVerdict: 4 });
  assert.equal(r.verdict.filter((v) => v === "ok").length, 0);
});

test("sol-global : masque du sol et recouvrement", () => {
  const d = new Uint8ClampedArray(W * H * 4); for (let i = 0; i < W * H; i++) { d[4 * i] = 58; d[4 * i + 1] = 104; d[4 * i + 2] = 170; d[4 * i + 3] = 255; }
  const m = SG.masqueSolBleu(d, W, H);
  assert.equal(m[(H >> 1) * W + (W >> 1)], 1);
  const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  assert.equal(SG.serecouvrent([I, I], 0, 1), true);
  assert.equal(SG.serecouvrent([I, [1, 0, 5, 0, 1, 0, 0, 0, 1]], 0, 1), false);
});
