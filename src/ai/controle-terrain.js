/* Contrôle d'un recalage de caméra : les lignes du terrain, projetées dans l'image avec la position trouvée, tombent-elles sur des lignes de l'image ?
   Sert de garde-fou : un recalage dont les lignes ne tombent pas sur des lignes visibles est refusé (« caméra perdue » reste affiché), jamais deviné.
   H : image (pixels de la vidéo d'origine) -> terrain (m), comme les calibrages. gray : { data, w, h } image grise réduite ; gs : réduction (réduit / origine). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./homography"), require("./court-fit"));
  else root.FutsalControleTerrain = factory(root.FutsalHomography, root.FutsalCourtFit);
})(typeof self !== "undefined" ? self : this, function (HG, CF) {
  "use strict";

  const RIDGE_MIN = 5;          // écart (sur 255) entre un point et son voisinage pour dire « il y a une ligne ici »
  const MIN_POINTS = 40;        // en dessous, le contrôle n'est pas possible (trop peu de lignes visibles) : « non vérifiable »
  const cache = new WeakMap();

  /* Carte « ligne ici ? » : écart absolu entre l'image et sa version floue (boîte 7x7), maximum sur 3x3. */
  function ridgeMap(gray) {
    const hit = cache.get(gray);
    if (hit) return hit;
    const { w, h, data } = gray, R = 3, integ = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += data[y * w + x]; integ[(y + 1) * (w + 1) + x + 1] = integ[y * (w + 1) + x + 1] + row; } }
    const d = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - R), y1 = Math.min(h - 1, y + R);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - R), x1 = Math.min(w - 1, x + R);
        const s = integ[(y1 + 1) * (w + 1) + x1 + 1] - integ[y0 * (w + 1) + x1 + 1] - integ[(y1 + 1) * (w + 1) + x0] + integ[y0 * (w + 1) + x0];
        d[y * w + x] = Math.abs(data[y * w + x] - s / ((x1 - x0 + 1) * (y1 - y0 + 1)));
      }
    }
    const out = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      let m = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const v = d[(y + j) * w + x + i]; if (v > m) m = v; }
      out[y * w + x] = m;
    }
    const res = { w, h, d: out };
    cache.set(gray, res);
    return res;
  }

  /* Part des points des lignes pleines du terrain (visibles dans l'image) qui tombent sur une ligne de l'image.
     Renvoie { score, n } ; n = nombre de points visibles (score null si n < MIN_POINTS : non vérifiable). dx, dy : décalage d'essai en pixels réduits. */
  function score(H, gray, gs, L, W, opts) {
    const o = opts || {}, Hi = HG.invert(H), rm = ridgeMap(gray), pts = o.points || CF.modelPoints(L, W, { step: 0.3, dashed: false });
    let n = 0, on = 0;
    for (const p of pts) {
      const q = HG.apply(Hi, p[0], p[1]);
      if (!isFinite(q[0]) || !isFinite(q[1])) continue;
      const x = Math.round(q[0] * gs + (o.dx || 0)), y = Math.round(q[1] * gs + (o.dy || 0));
      if (x < 4 || y < 4 || x >= gray.w - 4 || y >= gray.h - 4) continue;
      n++;
      if (rm.d[y * rm.w + x] >= (o.ridge || RIDGE_MIN)) on++;
    }
    return { score: n >= MIN_POINTS ? on / n : null, n };
  }

  /* Verdict : les lignes du modèle doivent tomber sur des lignes nettement mieux que si l'image était décalée au hasard (mêmes lignes, décalées de 8 à 14 pixels
     réduits dans huit directions). Renvoie { ok, verifiable, score, base, lift }. */
  function verifier(H, gray, gs, L, W, opts) {
    const o = Object.assign({ minScore: 0.4, minLift: 0.15 }, opts || {}), s = score(H, gray, gs, L, W, o);
    if (s.score == null) return { ok: false, verifiable: false, score: null, base: null, lift: null, n: s.n };
    const offs = [[10, 0], [-10, 0], [0, 10], [0, -10], [8, 8], [-8, -8], [8, -8], [-8, 8], [14, 0], [-14, 0], [0, 14], [0, -14]];
    let b = 0, k = 0;
    offs.forEach(([dx, dy]) => { const r = score(H, gray, gs, L, W, Object.assign({}, o, { dx, dy })); if (r.score != null) { b += r.score; k++; } });
    const base = k ? b / k : 0, lift = s.score - base;
    return { ok: s.score >= o.minScore && lift >= o.minLift, verifiable: true, score: s.score, base, lift, n: s.n };
  }

  return { score, verifier, ridgeMap, RIDGE_MIN, MIN_POINTS };
});
