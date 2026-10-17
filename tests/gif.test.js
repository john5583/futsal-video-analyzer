/* Encodeur GIF : aller-retour LZW (y compris remise à zéro de la table), en-tête, palette, images. */
const test = require("node:test");
const assert = require("node:assert/strict");
const GIF = require("../src/anim/gif");

function lzwDecode(bytes, minCode) {
  const clear = 1 << minCode, eoi = clear + 1, out = [];
  let size = minCode + 1, next = eoi + 1, dict = [], buf = 0, bits = 0, pos = 0, prev = null;
  const read = () => { while (bits < size) { if (pos >= bytes.length) return -1; buf |= bytes[pos++] << bits; bits += 8; } const c = buf & ((1 << size) - 1); buf >>>= size; bits -= size; return c; };
  const reset = () => { dict = []; for (let i = 0; i < clear; i++) dict[i] = [i]; size = minCode + 1; next = eoi + 1; prev = null; };
  reset();
  for (;;) {
    const c = read();
    if (c < 0 || c === eoi) break;
    if (c === clear) { reset(); continue; }
    let entry;
    if (c < next && dict[c]) entry = dict[c]; else if (c === next && prev) entry = prev.concat(prev[0]); else throw new Error("code invalide " + c);
    entry.forEach((v) => out.push(v));
    if (prev) { dict[next++] = prev.concat(entry[0]); if (next === (1 << size) && size < 12) size++; }
    prev = entry;
  }
  return out;
}

/* Lecture minimale d'un GIF : { w, h, palette, frames: [indices] }. */
function parse(g) {
  const w = g[6] | (g[7] << 8), h = g[8] | (g[9] << 8), palette = [];
  let p = 13;
  for (let i = 0; i < 256; i++, p += 3) palette.push([g[p], g[p + 1], g[p + 2]]);
  const frames = [];
  while (p < g.length) {
    const b = g[p++];
    if (b === 0x3b) break;
    if (b === 0x21) { p++; for (;;) { const n = g[p++]; if (!n) break; p += n; } continue; }
    if (b === 0x2c) {
      p += 9; const min = g[p++], data = [];
      for (;;) { const n = g[p++]; if (!n) break; for (let k = 0; k < n; k++) data.push(g[p++]); }
      frames.push(lzwDecode(data, min));
    }
  }
  return { w, h, palette, frames };
}

test("LZW : aller-retour exact sur des données aléatoires (la table est remise à zéro plusieurs fois)", () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed; };
  const ind = Array.from({ length: 120000 }, () => rnd() % 256);
  assert.deepEqual(lzwDecode(GIF.lzw(ind, 8), 8), ind);
  const flat = new Array(50000).fill(7);
  assert.deepEqual(lzwDecode(GIF.lzw(flat, 8), 8), flat);
});

test("GIF : en-tête, boucle, nombre d'images, dimensions et couleurs fidèles", () => {
  const w = 40, h = 24, frames = [];
  for (let f = 0; f < 3; f++) {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, inside = x > 5 + f * 8 && x < 15 + f * 8;
      d[i] = inside ? 230 : 20; d[i + 1] = inside ? 40 : 90; d[i + 2] = inside ? 40 : 200; d[i + 3] = 255;
    }
    frames.push(d);
  }
  const g = GIF.encodeGif({ width: w, height: h, frames, fps: 10 });
  assert.equal(String.fromCharCode(...g.slice(0, 6)), "GIF89a");
  assert.equal(g[g.length - 1], 0x3b);
  assert.ok(String.fromCharCode(...g).includes("NETSCAPE2.0"), "boucle infinie");
  const r = parse(g);
  assert.equal(r.w, w); assert.equal(r.h, h); assert.equal(r.frames.length, 3);
  r.frames.forEach((ind, f) => {
    assert.equal(ind.length, w * h);
    let bad = 0;
    for (let i = 0; i < w * h; i++) {
      const c = r.palette[ind[i]], o = frames[f].slice(i * 4, i * 4 + 3);
      if (Math.hypot(c[0] - o[0], c[1] - o[1], c[2] - o[2]) > 24) bad++;
    }
    assert.equal(bad, 0, "image " + f + " : couleurs fidèles");
  });
});

test("GIF : dimensions ou images invalides refusées", () => {
  assert.throws(() => GIF.encodeGif({ width: 0, height: 10, frames: [new Uint8ClampedArray(0)] }));
  assert.throws(() => GIF.encodeGif({ width: 10, height: 10, frames: [] }));
});
