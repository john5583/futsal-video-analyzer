/* Encodeur GIF animé (GIF89a), sans bibliothèque : palette adaptée à l'extrait (coupe médiane), compression LZW, boucle infinie.
   Sert à exporter une correction sur la vraie vidéo en petit fichier partageable. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FutsalGif = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* Palette de 256 couleurs (au plus) pour un ensemble d'images RGBA : coupe médiane sur un échantillon de pixels. */
  function buildPalette(frames, maxColors) {
    const max = maxColors || 256, px = [];
    const per = Math.max(1, Math.floor(60000 / Math.max(1, frames.length)));      // ~60 000 pixels au total
    frames.forEach((f) => {
      const n = f.length / 4, step = Math.max(1, Math.floor(n / per));
      for (let i = 0; i < n; i += step) px.push([f[i * 4], f[i * 4 + 1], f[i * 4 + 2]]);
    });
    if (!px.length) return [[0, 0, 0]];
    const range = (box) => {
      const mn = [255, 255, 255], mx = [0, 0, 0];
      box.forEach((p) => { for (let c = 0; c < 3; c++) { if (p[c] < mn[c]) mn[c] = p[c]; if (p[c] > mx[c]) mx[c] = p[c]; } });
      return [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
    };
    const boxes = [px];
    while (boxes.length < max) {
      let bi = -1, bs = 0, bc = 0;
      boxes.forEach((b, i) => {
        if (b.length < 2) return;
        const r = range(b), c = r[0] >= r[1] && r[0] >= r[2] ? 0 : r[1] >= r[2] ? 1 : 2;
        if (r[c] > bs) { bs = r[c]; bi = i; bc = c; }
      });
      if (bi < 0 || bs === 0) break;                                               // plus rien à couper : moins de 256 couleurs
      const b = boxes[bi].slice().sort((p, q) => p[bc] - q[bc]), m = b.length >> 1;
      boxes.splice(bi, 1, b.slice(0, m), b.slice(m));
    }
    return boxes.map((b) => [0, 1, 2].map((c) => Math.round(b.reduce((s, p) => s + p[c], 0) / b.length)));
  }

  /* Correspondance couleur -> indice de palette (plus proche, mémorisée sur 5 bits par canal). */
  function indexer(palette) {
    const cache = new Map();
    return (r, g, b) => {
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      let v = cache.get(key);
      if (v === undefined) {
        const R = (r & 0xf8) | 4, G = (g & 0xf8) | 4, B = (b & 0xf8) | 4;
        let best = 0, bd = Infinity;
        for (let i = 0; i < palette.length; i++) {
          const dr = palette[i][0] - R, dg = palette[i][1] - G, db = palette[i][2] - B, d = dr * dr + dg * dg + db * db;
          if (d < bd) { bd = d; best = i; }
        }
        v = best; cache.set(key, v);
      }
      return v;
    };
  }

  /* LZW des indices (taille de code minimale 8). Renvoie les octets du flux. */
  function lzw(indices, minCode) {
    const clear = 1 << minCode, eoi = clear + 1, out = [];
    let size = minCode + 1, next = eoi + 1, cur = 0, bits = 0;
    const dict = new Map();
    const emit = (code) => { cur |= code << bits; bits += size; while (bits >= 8) { out.push(cur & 255); cur >>>= 8; bits -= 8; } };
    emit(clear);
    if (!indices.length) { emit(eoi); if (bits > 0) out.push(cur & 255); return out; }
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i], key = (prefix << 8) | k, hit = dict.get(key);
      if (hit !== undefined) { prefix = hit; continue; }
      emit(prefix);
      if (next === 4096) { emit(clear); dict.clear(); size = minCode + 1; next = eoi + 1; }
      else { if (next >= (1 << size)) size++; dict.set(key, next++); }
      prefix = k;
    }
    emit(prefix); emit(eoi);
    if (bits > 0) out.push(cur & 255);
    return out;
  }

  /* frames : tableaux RGBA (Uint8ClampedArray, width*height*4) ; fps : images par seconde. Renvoie un Uint8Array (fichier .gif). */
  function encodeGif(opts) {
    const w = opts.width, h = opts.height, frames = opts.frames || [], fps = opts.fps || 10;
    if (!(w > 0 && h > 0) || w > 65535 || h > 65535 || !frames.length) throw new Error("GIF : dimensions ou images invalides");
    const pal = buildPalette(frames, 256), idx = indexer(pal), delay = Math.max(2, Math.round(100 / fps));
    const out = [];
    const u16 = (v) => { out.push(v & 255, (v >> 8) & 255); };
    "GIF89a".split("").forEach((c) => out.push(c.charCodeAt(0)));
    u16(w); u16(h); out.push(0xf7, 0, 0);                                       // table de couleurs globale de 256 entrées
    for (let i = 0; i < 256; i++) { const c = pal[i] || [0, 0, 0]; out.push(c[0], c[1], c[2]); }
    out.push(0x21, 0xff, 0x0b); "NETSCAPE2.0".split("").forEach((c) => out.push(c.charCodeAt(0))); out.push(3, 1, 0, 0, 0);   // boucle infinie
    frames.forEach((f) => {
      out.push(0x21, 0xf9, 4, 0x04, delay & 255, (delay >> 8) & 255, 0, 0);       // délai, pas de transparence, on laisse l'image
      out.push(0x2c); u16(0); u16(0); u16(w); u16(h); out.push(0);
      const ind = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) ind[i] = idx(f[i * 4], f[i * 4 + 1], f[i * 4 + 2]);
      out.push(8);
      const data = lzw(ind, 8);
      for (let i = 0; i < data.length; i += 255) { const n = Math.min(255, data.length - i); out.push(n); for (let k = 0; k < n; k++) out.push(data[i + k]); }
      out.push(0);
    });
    out.push(0x3b);
    return Uint8Array.from(out);
  }

  return { encodeGif, buildPalette, lzw };
});
