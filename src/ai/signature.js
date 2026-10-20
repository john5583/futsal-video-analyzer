/* Signature d'apparence d'un joueur : couleur (Lab) du haut, du short, des chaussettes, des chaussures et des cheveux.
   Sert au suivi (tracker.js) pour départager deux joueurs proches l'un de l'autre. Un indice mesuré ne décide jamais seul :
   il n'ajoute qu'un petit surcoût borné à l'association, et rien du tout quand la signature n'est pas fiable. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./kit"));
  else root.FutsalSignature = factory(root.FutsalKit);
})(typeof self !== "undefined" ? self : this, function (K) {
  "use strict";

  const BANDS = {
    shirt: Object.assign({}, K.BANDS.shirt, { w: 1 }),
    shorts: Object.assign({}, K.BANDS.shorts, { w: 0.7 }),
    socks: Object.assign({}, K.BANDS.socks, { w: 0.6 }),
    shoes: { x0: 0.2, x1: 0.8, y0: 0.96, y1: 1, w: 0.6 },
    hair: { x0: 0.3, x1: 0.7, y0: 0, y1: 0.07, w: 0.4 }
  };
  const PARTS = Object.keys(BANDS);
  const MIN_W = 24, MIN_H = 80;          // en dessous, trop peu de pixels pour lire autre chose que le maillot
  const SMALL_PART_H = 100;              // chaussures et cheveux : bandes très minces, boîte assez haute exigée
  const MIN_PIXELS = 12;                 // pixels minimum pour qu'une partie soit lue
  const MIN_PARTS = 3;                   // parties communes minimum (maillot compris) pour comparer deux signatures
  const SAME_DISTANCE = 14;              // en dessous : même apparence (un joueur s'écarte de ~18 de sa propre référence, voir kit.js)
  const FULL_DISTANCE = 34;              // au-dessus : surcoût maximal
  const MAX_PENALTY = 1.5;               // mètres, comme l'écart d'équipe dans tracker.js : jamais décisif seul
  const BLEND = 0.25;                    // poids de la nouvelle lecture dans la signature de la piste

  function median(arr) {
    const s = arr.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }

  function bandLab(img, box, band) {
    const bw = box[2] - box[0], bh = box[3] - box[1];
    const x0 = Math.max(0, Math.floor(box[0] + bw * band.x0)), x1 = Math.min(img.width, Math.ceil(box[0] + bw * band.x1));
    const y0 = Math.max(0, Math.floor(box[1] + bh * band.y0)), y1 = Math.min(img.height, Math.ceil(box[1] + bh * band.y1));
    const L = [], A = [], B = [];
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * img.width + x) * 4;
        const lab = K.rgbToLab(img.data[i], img.data[i + 1], img.data[i + 2]);
        L.push(lab[0]); A.push(lab[1]); B.push(lab[2]);
      }
    }
    return L.length >= MIN_PIXELS ? [median(L), median(A), median(B)] : null;
  }

  /* Signature lue sur la boîte [x1, y1, x2, y2] (pixels de img). null si la boîte est trop petite : rien n'est inventé. */
  function sample(img, box) {
    if (!img || !box) return null;
    const bh = box[3] - box[1];
    if (box[2] - box[0] < MIN_W || bh < MIN_H) return null;
    const out = {};
    PARTS.forEach((k) => {
      out[k] = (k === "shoes" || k === "hair") && bh < SMALL_PART_H ? null : bandLab(img, box, BANDS[k]);
    });
    return reliable(out) ? out : null;
  }

  function count(sig) { return PARTS.filter((k) => sig && sig[k]).length; }
  /* Fiable : le maillot et au moins deux autres parties ont été lus. */
  function reliable(sig) { return !!(sig && sig.shirt && count(sig) >= MIN_PARTS); }

  /* Distance Lab moyenne pondérée sur les parties lues des deux côtés ; null si la comparaison n'est pas fiable. */
  function distance(a, b) {
    if (!reliable(a) || !reliable(b)) return null;
    let s = 0, w = 0, n = 0;
    PARTS.forEach((k) => {
      if (!a[k] || !b[k]) return;
      s += Math.hypot(a[k][0] - b[k][0], a[k][1] - b[k][1], a[k][2] - b[k][2]) * BANDS[k].w;
      w += BANDS[k].w; n++;
    });
    return n >= MIN_PARTS && w ? s / w : null;
  }

  /* Surcoût (mètres) d'associer une détection à une piste : 0 si les apparences concordent ou si on ne peut pas comparer. */
  function penalty(trackSig, detSig) {
    const d = distance(trackSig, detSig);
    if (d == null || d <= SAME_DISTANCE) return 0;
    return Math.min(MAX_PENALTY, ((d - SAME_DISTANCE) / (FULL_DISTANCE - SAME_DISTANCE)) * MAX_PENALTY);
  }

  /* Signature de la piste mise à jour avec une nouvelle lecture (moyenne glissante partie par partie). */
  function blend(prev, cur) {
    if (!reliable(cur)) return prev || null;
    if (!prev) return cur;
    const out = {};
    PARTS.forEach((k) => {
      if (prev[k] && cur[k]) out[k] = [0, 1, 2].map((c) => prev[k][c] * (1 - BLEND) + cur[k][c] * BLEND);
      else out[k] = prev[k] || cur[k] || null;
    });
    return out;
  }

  return { BANDS, PARTS, sample, distance, penalty, blend, reliable, SAME_DISTANCE, FULL_DISTANCE, MAX_PENALTY };
});
