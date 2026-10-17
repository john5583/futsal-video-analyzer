/* Zoom et déplacement de la vidéo : calcul pur, sans écran. L'image affichée est la vidéo « ajustée » à la boîte (échelle s, décalage x, y),
   agrandie d'un facteur k puis translatée de (tx, ty) : un point p de l'affichage ajusté apparaît en k * p + t.
   Le zoom ne change rien aux coordonnées en pixels de la vidéo : les clics et les repères restent exacts à n'importe quel zoom. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FutsalZoom = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const K_MIN = 1, K_MAX = 8;

  const clampK = (k) => (isFinite(k) ? Math.min(K_MAX, Math.max(K_MIN, k)) : 1);
  /* La vidéo agrandie couvre toujours toute la boîte : jamais de bord vide qui dériverait hors de l'image. */
  function clampPan(k, tx, ty, w, h) {
    const kk = clampK(k);
    if (kk === 1) return { k: 1, tx: 0, ty: 0 };
    const ok = (v, size) => Math.min(0, Math.max(size - kk * size, isFinite(v) ? v : 0));
    return { k: kk, tx: ok(tx, w), ty: ok(ty, h) };
  }
  /* Zoom autour d'un point de la boîte (curseur) : le point sous le curseur ne bouge pas. */
  function zoomAt(z, mx, my, factor, w, h) {
    const k2 = clampK(z.k * factor);
    if (k2 === z.k) return clampPan(z.k, z.tx, z.ty, w, h);
    return clampPan(k2, mx - (mx - z.tx) * (k2 / z.k), my - (my - z.ty) * (k2 / z.k), w, h);
  }
  /* Centre la vue sur le point (u, v) en pixels de la vidéo, au facteur k. base = { s, x, y } : affichage ajusté sans zoom. */
  function centerOn(base, u, v, k, w, h) {
    const kk = clampK(k);
    return clampPan(kk, w / 2 - kk * (u * base.s + base.x), h / 2 - kk * (v * base.s + base.y), w, h);
  }
  /* Rectangle d'affichage avec zoom : même forme que le rectangle ajusté, utilisable pour passer de la vidéo à l'écran et inversement. */
  function apply(base, z) {
    return { s: base.s * z.k, x: z.k * base.x + z.tx, y: z.k * base.y + z.ty, vw: base.vw, vh: base.vh };
  }
  return { K_MIN, K_MAX, clampK, clampPan, zoomAt, centerOn, apply };
});
