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
  function trimFromPixels(px) {
    const sel = px.filter(([l, a, b]) => {
      const c = Math.hypot(a, b), h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
      return c > 28 && l > 35 && a < -3 && h >= 95 && h <= 170;
    });
    if (sel.length < Math.max(6, px.length * 0.002)) return null;
    return [median(sel.map((p) => p[0])), median(sel.map((p) => p[1])), median(sel.map((p) => p[2]))];
  }
  function detectTrim(img, box) { return trimFromPixels(torsoPixels(img, box)); }

  /* Part de pixels du buste proches de la couleur de liseré donnée (on compare surtout la teinte : a* et b*). */
  function accentFraction(img, box, lab) {
    const px = torsoPixels(img, box);
    if (!px.length || !lab) return 0;
    let n = 0;
    for (const p of px) if (Math.hypot(p[1] - lab[1], p[2] - lab[2]) <= 22 && p[0] > 30 && Math.abs(p[0] - lab[0]) <= 40) n++;
    return n / px.length;
  }

  /* Mode « tenues proches » : part du buste en couleur de liseré (même critère que trimFromPixels : jaune-vert à vert),
     à moins de 20° de teinte du liseré de référence. Contrairement à accentFraction, le jaune doré d'un lettrage
     ne compte pas, et le seuil est bas (ACC_MIN_CLOSE) pour les joueurs lointains. */
  const ACC_MIN_CLOSE = 0.006;
  function hueOf(a, b) { return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360; }
  function isTrimColor(l, a, b) { const h = hueOf(a, b); return Math.hypot(a, b) > 28 && l > 35 && a < -3 && h >= 95 && h <= 170; }
  function trimHueFraction(img, box, lab) {
    const px = torsoPixels(img, box);
    if (!px.length || !lab) return 0;
    const h0 = hueOf(lab[1], lab[2]), cMin = Math.max(25, Math.hypot(lab[1], lab[2]) * 0.55);
    let n = 0;
    for (const [l, a, b] of px) {
      if (Math.hypot(a, b) < cMin || !isTrimColor(l, a, b)) continue;
      if (Math.abs(((hueOf(a, b) - h0 + 540) % 360) - 180) <= 20) n++;
    }
    return n / px.length;
  }

  /* Calcule, pour chaque référence qui a un liseré, la part de pixels de ce liseré chez ce joueur (feat.acc[clé]).
     opts.close (tenues de référence trop proches) : mesure par la teinte (trimHueFraction). */
  function addAccents(feat, img, box, refs, opts) {
    if (!feat) return feat;
    const close = !!(opts && opts.close);
    feat.acc = {};
    Object.keys(refs || {}).forEach((k) => { if (refs[k] && refs[k].trim) feat.acc[k] = close ? trimHueFraction(img, box, refs[k].trim) : accentFraction(img, box, refs[k].trim); });
    return feat;
  }

  /* Pixels (Lab) d'une zone relative à la boîte, limités à la silhouette. mask = { x0, y0, w, h, data (0/1) } en pixels de img. */
  function maskPixels(img, box, band, mask) {
    const bw = box[2] - box[0], bh = box[3] - box[1];
    const x0 = Math.max(mask.x0, Math.floor(box[0] + bw * band.x0)), x1 = Math.min(mask.x0 + mask.w, img.width, Math.ceil(box[0] + bw * band.x1));
    const y0 = Math.max(mask.y0, Math.floor(box[1] + bh * band.y0)), y1 = Math.min(mask.y0 + mask.h, img.height, Math.ceil(box[1] + bh * band.y1));
    const out = [];
    for (let y = Math.max(0, y0); y < y1; y++) for (let x = Math.max(0, x0); x < x1; x++) {
      if (!mask.data[(y - mask.y0) * mask.w + (x - mask.x0)]) continue;
      const i = (y * img.width + x) * 4;
      out.push(rgbToLab(img.data[i], img.data[i + 1], img.data[i + 2]));
    }
    return out;
  }

  /* Empreinte de tenue lue uniquement sur les pixels de la silhouette (sans le sol ni le décor). null si trop peu de pixels. */
  function fromMask(img, box, mask) {
    if (!img || !mask || !mask.w || !mask.h) return null;
    const out = {};
    Object.keys(BANDS).forEach((k) => {
      const px = maskPixels(img, box, BANDS[k], mask);
      out[k] = px.length >= 12 ? [median(px.map((p) => p[0])), median(px.map((p) => p[1])), median(px.map((p) => p[2]))] : null;
    });
    if (!out.shirt) return null;
    out.trim = trimFromPixels(maskPixels(img, box, TORSO, mask));
    return out;
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

  /* Part de peau visible entre le short et les chaussettes (0 à 1) : un short laisse voir les cuisses, un pantalon ou un survêtement non.
     Mesuré sur des images étiquetées : médiane 0 % pour un gardien en survêtement, 22 à 34 % pour des joueurs en short.
     Sert à repérer une personne qui s'habille autrement que son équipe (pour poser une question), jamais à décider seul. */
  const LEG_BAND = { x0: 0.3, x1: 0.7, y0: 0.68, y1: 0.82 };
  function legSkin(img, box) {
    const bw = box[2] - box[0], bh = box[3] - box[1];
    if (!img || bw < 6 || bh < 40) return null;
    const x0 = Math.max(0, Math.round(box[0] + bw * LEG_BAND.x0)), x1 = Math.min(img.width, Math.round(box[0] + bw * LEG_BAND.x1));
    const y0 = Math.max(0, Math.round(box[1] + bh * LEG_BAND.y0)), y1 = Math.min(img.height, Math.round(box[1] + bh * LEG_BAND.y1));
    let n = 0, skin = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * img.width + x) * 4, r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
        const Y = 0.299 * r + 0.587 * g + 0.114 * b, Cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b, Cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
        n++;
        // peau : teinte chaude et pas trop sombre (un pantalon noir est sombre et sans teinte)
        if (Y > 38 && Cr > 134 && Cr < 185 && Cb > 80 && Cb < 128 && r > g && g >= b - 6) skin++;
      }
    }
    return n >= 20 ? skin / n : null;
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

  /* Distance à une référence qui peut porter des références par instant (alts, voir exemples.js) : la plus petite des distances.
     Sans alts, c'est exactement dist(). */
  function distAlts(a, ref) {
    let d = dist(a, ref);
    if (ref && Array.isArray(ref.alts)) for (const x of ref.alts) { const e = dist(a, x); if (e < d) d = e; }
    return d;
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
  /* opts.close (tenues de référence trop proches, voir ambiguity) : le liseré ne départage que les deux équipes de champ
     (A, B) — pas l'arbitre ni les gardiens, dont la tenue se reconnaît à sa couleur principale — avec le seuil ACC_MIN_CLOSE. */
  const FIELD = { A: 1, B: 1 };
  function classify(feat, refs, opts) {
    if (!feat) return { team: "UNK", distance: Infinity };
    const reject = (opts && opts.reject) || REJECT_DISTANCE;
    const close = !!(opts && opts.close);
    const minAcc = close ? ACC_MIN_CLOSE : ACC_MIN;
    const keys = Object.keys(refs).filter((k) => refs[k]);
    const d = {};
    keys.forEach((k) => { d[k] = distAlts(feat, refs[k]); });
    const accKeys = keys.filter((k) => refs[k].trim && (!close || FIELD[k]));
    if (accKeys.length && feat.acc) {
      const present = accKeys.some((k) => (feat.acc[k] || 0) >= minAcc);
      keys.forEach((k) => {
        if (!isFinite(d[k]) || (close && !FIELD[k])) return;
        if (refs[k].trim) d[k] += (feat.acc[k] || 0) >= minAcc ? -ACC_BONUS : ACC_BONUS;
        else if (present) d[k] += ACC_BONUS;
        if (d[k] < 0) d[k] = 0;
      });
    }
    let best = "UNK", bd = Infinity;
    keys.forEach((k) => { if (d[k] < bd) { bd = d[k]; best = k; } });
    if (bd > reject) return { team: "UNK", distance: bd };
    return { team: best, distance: bd };
  }

  /* Tenues de référence trop proches pour être distinguées par leurs seules couleurs.
     Repère mesuré sur des matchs réels : un joueur s'écarte en moyenne de ~18 de sa propre tenue de référence ;
     deux tenues à moins de CLOSE_DISTANCE l'une de l'autre se confondent donc d'une image à l'autre.
     Renvoie { close (A et B proches), roles (un gardien proche de l'arbitre ou d'une équipe), pairs: [{ a, b, d }] }. */
  const PLAYER_SPREAD = 18;
  const CLOSE_DISTANCE = 15;
  function ambiguity(refs) {
    const r = refs || {}, pairs = [];
    const check = (a, b) => { if (r[a] && r[b]) { const d = dist(r[a], r[b]); if (d < CLOSE_DISTANCE) pairs.push({ a, b, d: Math.round(d * 10) / 10 }); } };
    check("A", "B");
    ["GKA", "GKB"].forEach((g) => { check(g, "REF"); check(g, "A"); check(g, "B"); });
    check("GKA", "GKB");
    const close = pairs.some((p) => p.a === "A" && p.b === "B");
    return { close, roles: pairs.some((p) => p.a !== "A"), pairs };
  }

  /* Avertissements en français pour l'utilisateur (vide si les tenues se distinguent bien). names : { A: "Mon équipe", ... }. */
  const DEFAULT_NAMES = { A: "Mon équipe", B: "Adversaire", GKA: "Mon gardien", GKB: "Gardien adverse", REF: "Arbitre" };
  function ambiguityMessages(refs, names) {
    const n = Object.assign({}, DEFAULT_NAMES, names || {}), r = refs || {}, out = [];
    ambiguity(r).pairs.forEach(({ a, b, d }) => {
      const ecart = "écart " + Math.round(d) + ", alors qu'un joueur s'écarte en moyenne de " + PLAYER_SPREAD + " de sa propre tenue";
      if (a === "A" && b === "B") {
        const trim = r.A.trim || r.B.trim;
        out.push("« " + n.A + " » et « " + n.B + " » ont des tenues presque identiques (" + ecart + "). " +
          (trim ? "L'analyse s'appuiera sur le liseré de couleur (manches, col) et sur la position des gardiens. "
            : "Aucun liseré de couleur n'a été repéré : les deux équipes risquent d'être confondues. ") +
          "Pour plus de fiabilité, ajoutez des échantillons pris sur des joueurs proches de la caméra, liseré bien visible.");
      } else if (b === "REF") {
        out.push("« " + n[a] + " » et « " + n.REF + " » ont des tenues très proches (" + ecart + ") : ils seront distingués par leur position (le gardien reste près de son but).");
      } else {
        out.push("« " + n[a] + " » ressemble beaucoup à « " + n[b] + " » (" + ecart + ") : le gardien sera reconnu surtout par sa position dans la surface de réparation.");
      }
    });
    return out;
  }

  function swatches(ref) {
    return ref ? { shirt: ref.shirt ? toHex(ref.shirt) : null, shorts: ref.shorts ? toHex(ref.shorts) : null, socks: ref.socks ? toHex(ref.socks) : null, trim: ref.trim ? toHex(ref.trim) : null } : null;
  }

  return { BANDS, REJECT_DISTANCE, rgbToLab, labToRgb, sample, average, classify, dist, distAlts, swatches, toHex, pipette, fromParts, fromMask, detectTrim, accentFraction, trimHueFraction, addAccents, ambiguity, ambiguityMessages, ACC_MIN, ACC_MIN_CLOSE, PLAYER_SPREAD, CLOSE_DISTANCE, legSkin };
});
