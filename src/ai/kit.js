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
  const TORSO = { x0: 0, x1: 1, y0: 0.16, y1: 0.5 };   // buste sur toute la largeur (manches comprises)
  const ACC_MIN = 0.045;                               // part minimale de pixels « liseré » pour considérer qu'il est présent
  const ACC_BONUS = 14;                                // correction de distance quand le liseré est (ou n'est pas) là

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

  function torsoPixels(img, box) {
    const bw = box[2] - box[0], bh = box[3] - box[1];
    const x0 = Math.max(0, Math.floor(box[0] + bw * TORSO.x0)), x1 = Math.min(img.width, Math.ceil(box[0] + bw * TORSO.x1));
    const y0 = Math.max(0, Math.floor(box[1] + bh * TORSO.y0)), y1 = Math.min(img.height, Math.ceil(box[1] + bh * TORSO.y1));
    const out = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * img.width + x) * 4; out.push(rgbToLab(img.data[i], img.data[i + 1], img.data[i + 2])); }
    return out;
  }

  /* Liseré / manches de couleur vive : couleur médiane des pixels très colorés (jaune-vert à vert) du buste, ou null. */
  function detectTrim(img, box) {
    const px = torsoPixels(img, box);
    const sel = px.filter(([l, a, b]) => {
      const c = Math.hypot(a, b), h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
      return c > 28 && l > 35 && a < -3 && h >= 95 && h <= 170;
    });
    if (sel.length < Math.max(6, px.length * 0.002)) return null;
    return [median(sel.map((p) => p[0])), median(sel.map((p) => p[1])), median(sel.map((p) => p[2]))];
  }

  /* Part de pixels du buste proches de la couleur de liseré donnée (on compare surtout la teinte : a* et b*). */
  function accentFraction(img, box, lab) {
    const px = torsoPixels(img, box);
    if (!px.length || !lab) return 0;
    let n = 0;
    for (const p of px) if (Math.hypot(p[1] - lab[1], p[2] - lab[2]) <= 22 && p[0] > 30 && Math.abs(p[0] - lab[0]) <= 40) n++;
    return n / px.length;
  }

  /* Calcule, pour chaque référence qui a un liseré, la part de pixels de ce liseré chez ce joueur (feat.acc[clé]). */
  function addAccents(feat, img, box, refs) {
    if (!feat) return feat;
    feat.acc = {};
    Object.keys(refs || {}).forEach((k) => { if (refs[k] && refs[k].trim) feat.acc[k] = accentFraction(img, box, refs[k].trim); });
    return feat;
  }

  /* Empreinte de tenue d'un joueur : trois couleurs Lab (ou null si la boîte est trop petite). */
  function sample(img, box) {
    if (box[2] - box[0] < 6 || box[3] - box[1] < 14) return null;
    const out = {};
    for (const k of Object.keys(BANDS)) {
      out[k] = bandColor(img, box, BANDS[k]);
      if (!out[k]) return null;
    }
    out.trim = detectTrim(img, box);
    return out;
  }

  /* Distance entre deux empreintes : seules les parties présentes des deux côtés comptent (le maillot pèse le plus). */
  function dist(a, b) {
    let s = 0, w = 0;
    for (const k of Object.keys(BANDS)) {
      if (!a[k] || !b[k]) continue;
      const d = Math.hypot(a[k][0] - b[k][0], a[k][1] - b[k][1], a[k][2] - b[k][2]);
      s += d * BANDS[k].w; w += BANDS[k].w;
    }
    return w ? s / w : Infinity;
  }

  /* Moyenne de plusieurs empreintes (chaque partie est moyennée sur les empreintes qui la contiennent). */
  function average(samples) {
    const out = {};
    for (const k of Object.keys(BANDS)) {
      const have = samples.filter((x) => x && x[k]);
      out[k] = have.length ? [0, 1, 2].map((c) => have.reduce((s, x) => s + x[k][c], 0) / have.length) : null;
    }
    const withTrim = samples.filter((x) => x && x.trim);
    out.trim = withTrim.length ? [0, 1, 2].map((c) => withTrim.reduce((s, x) => s + x.trim[c], 0) / withTrim.length) : null;
    return out;
  }

  /* Pipette : couleur médiane (Lab) d'un petit carré de (2r+1) pixels de côté centré sur (cx, cy). */
  function pipette(img, cx, cy, r) {
    r = Math.max(1, Math.round(r || 2));
    const x0 = Math.max(0, Math.round(cx) - r), x1 = Math.min(img.width - 1, Math.round(cx) + r);
    const y0 = Math.max(0, Math.round(cy) - r), y1 = Math.min(img.height - 1, Math.round(cy) + r);
    const L = [], A = [], B = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = (y * img.width + x) * 4;
        const lab = rgbToLab(img.data[i], img.data[i + 1], img.data[i + 2]);
        L.push(lab[0]); A.push(lab[1]); B.push(lab[2]);
      }
    }
    return L.length ? [median(L), median(A), median(B)] : null;
  }

  /* Empreinte construite à la pipette : le maillot est obligatoire, short et chaussettes facultatifs. */
  function fromParts(shirt, shorts, socks, trim) {
    if (!shirt) return null;
    return { shirt, shorts: shorts || null, socks: socks || null, trim: trim || null };
  }

  /* refs : { A: empreinte, B: ..., GKA: ..., GKB: ..., REF: ... } (au moins A et B). */
  /* opts.reject : distance maximale acceptée (tolérance, 42 par défaut).
     Si une référence a un liseré (manches de couleur), sa présence chez le joueur (feat.acc) rapproche de cette équipe,
     son absence l'éloigne ; les équipes sans liseré sont éloignées quand le liseré est présent. */
  function classify(feat, refs, opts) {
    if (!feat) return { team: "UNK", distance: Infinity };
    const reject = (opts && opts.reject) || REJECT_DISTANCE;
    const keys = Object.keys(refs).filter((k) => refs[k]);
    const d = {};
    keys.forEach((k) => { d[k] = dist(feat, refs[k]); });
    const accKeys = keys.filter((k) => refs[k].trim);
    if (accKeys.length && feat.acc) {
      const present = accKeys.some((k) => (feat.acc[k] || 0) >= ACC_MIN);
      keys.forEach((k) => {
        if (!isFinite(d[k])) return;
        if (refs[k].trim) d[k] += (feat.acc[k] || 0) >= ACC_MIN ? -ACC_BONUS : ACC_BONUS;
        else if (present) d[k] += ACC_BONUS;
        if (d[k] < 0) d[k] = 0;
      });
    }
    let best = "UNK", bd = Infinity;
    keys.forEach((k) => { if (d[k] < bd) { bd = d[k]; best = k; } });
    if (bd > reject) return { team: "UNK", distance: bd };
    return { team: best, distance: bd };
  }

  function swatches(ref) {
    return ref ? { shirt: ref.shirt ? toHex(ref.shirt) : null, shorts: ref.shorts ? toHex(ref.shorts) : null, socks: ref.socks ? toHex(ref.socks) : null, trim: ref.trim ? toHex(ref.trim) : null } : null;
  }

  return { BANDS, REJECT_DISTANCE, rgbToLab, labToRgb, sample, average, classify, dist, swatches, toHex, pipette, fromParts, detectTrim, accentFraction, addAccents, ACC_MIN };
});
