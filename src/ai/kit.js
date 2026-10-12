/* Reconnaissance des équipes par les couleurs des tenues (maillot, short, chaussettes).
   Les couleurs sont mesurées dans l'espace Lab sur trois bandes de la boîte du joueur. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FutsalKit = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const BANDS = {
    shirt: { x0: 0.22, x1: 0.78, y0: 0.2, y1: 0.46, w: 1 },
    shorts: { x0: 0.22, x1: 0.78, y0: 0.5, y1: 0.66, w: 0.7 },
    socks: { x0: 0.25, x1: 0.75, y0: 0.82, y1: 0.96, w: 0.4 }
  };
  const REJECT_DISTANCE = 42;

  function srgbToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function rgbToLab(r, g, b) {
    const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
    let x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
    let y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
    let z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    x = f(x); y = f(y); z = f(z);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }
  function labToRgb(L, a, b) {
    let y = (L + 16) / 116, x = a / 500 + y, z = y - b / 200;
    const f = (t) => (t * t * t > 0.008856 ? t * t * t : (t - 16 / 116) / 7.787);
    x = f(x) * 0.95047; y = f(y); z = f(z) * 1.08883;
    const lin = [3.2404542 * x - 1.5371385 * y - 0.4985314 * z, -0.969266 * x + 1.8760108 * y + 0.041556 * z, 0.0556434 * x - 0.2040259 * y + 1.0572252 * z];
    return lin.map((c) => {
      c = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
      return Math.max(0, Math.min(255, Math.round(c * 255)));
    });
  }
  function toHex(lab) {
    return "#" + labToRgb(lab[0], lab[1], lab[2]).map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  function median(arr) {
    if (!arr.length) return 0;
    const s = arr.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }

  /* Couleur médiane (Lab) d'une bande de la boîte. img = {data (RGBA), width, height}; box = [x1,y1,x2,y2] en pixels. */
  function bandColor(img, box, band) {
    const bw = box[2] - box[0], bh = box[3] - box[1];
    const x0 = Math.max(0, Math.floor(box[0] + bw * band.x0)), x1 = Math.min(img.width, Math.ceil(box[0] + bw * band.x1));
    const y0 = Math.max(0, Math.floor(box[1] + bh * band.y0)), y1 = Math.min(img.height, Math.ceil(box[1] + bh * band.y1));
    const L = [], A = [], B = [];
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * img.width + x) * 4;
        const lab = rgbToLab(img.data[i], img.data[i + 1], img.data[i + 2]);
        L.push(lab[0]); A.push(lab[1]); B.push(lab[2]);
      }
    }
    if (!L.length) return null;
    return [median(L), median(A), median(B)];
  }

  /* Empreinte de tenue d'un joueur : trois couleurs Lab (ou null si la boîte est trop petite). */
  function sample(img, box) {
    if (box[2] - box[0] < 6 || box[3] - box[1] < 14) return null;
    const out = {};
    for (const k of Object.keys(BANDS)) {
      out[k] = bandColor(img, box, BANDS[k]);
      if (!out[k]) return null;
    }
    return out;
  }

  function dist(a, b) {
    let s = 0, w = 0;
    for (const k of Object.keys(BANDS)) {
      const d = Math.hypot(a[k][0] - b[k][0], a[k][1] - b[k][1], a[k][2] - b[k][2]);
      s += d * BANDS[k].w; w += BANDS[k].w;
    }
    return s / w;
  }

  /* Moyenne de plusieurs empreintes. */
  function average(samples) {
    const out = {};
    for (const k of Object.keys(BANDS)) {
      out[k] = [0, 1, 2].map((c) => samples.reduce((s, x) => s + x[k][c], 0) / samples.length);
    }
    return out;
  }

  /* refs : { A: empreinte, B: ..., GKA: ..., GKB: ..., REF: ... } (au moins A et B). */
  function classify(feat, refs) {
    if (!feat) return { team: "UNK", distance: Infinity };
    let best = "UNK", bd = Infinity;
    for (const k of Object.keys(refs)) {
      if (!refs[k]) continue;
      const d = dist(feat, refs[k]);
      if (d < bd) { bd = d; best = k; }
    }
    if (bd > REJECT_DISTANCE) return { team: "UNK", distance: bd };
    return { team: best, distance: bd };
  }

  function swatches(ref) {
    return ref ? { shirt: toHex(ref.shirt), shorts: toHex(ref.shorts), socks: toHex(ref.socks) } : null;
  }

  return { BANDS, REJECT_DISTANCE, rgbToLab, labToRgb, sample, average, classify, dist, swatches, toHex };
});
