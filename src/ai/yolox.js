/* Détecteur YOLOX (Apache-2.0) : pré- et post-traitement purs, utilisables dans Node et le navigateur.
   Entrée du réseau : image BGR 0-255, 640x640, redimensionnée à gauche/haut avec remplissage gris (114).
   Sortie brute : [1, 8400, 85] = (cx, cy, w, h, objectness, 80 classes) non décodés (grilles de pas 8/16/32). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FutsalYolox = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SIZE = 640;
  const STRIDES = [8, 16, 32];
  const CLASS_PERSON = 0;
  const CLASS_BALL = 32;
  const NUM_CLASSES = 80;

  /* Rapport de réduction pour faire tenir une image w x h dans SIZE x SIZE. */
  function letterboxRatio(w, h, size) {
    size = size || SIZE;
    return Math.min(size / w, size / h);
  }

  /* RGBA (SIZE x SIZE, déjà redimensionné et rempli de gris) -> tenseur float32 NCHW en BGR. */
  function rgbaToTensor(rgba, size) {
    size = size || SIZE;
    const n = size * size;
    if (rgba.length !== n * 4) throw new Error("Image de taille inattendue : " + rgba.length);
    const out = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) {
      out[i] = rgba[i * 4 + 2];          // B
      out[n + i] = rgba[i * 4 + 1];      // G
      out[2 * n + i] = rgba[i * 4];      // R
    }
    return out;
  }

  function iou(a, b) {
    const x1 = Math.max(a.x1, b.x1), y1 = Math.max(a.y1, b.y1);
    const x2 = Math.min(a.x2, b.x2), y2 = Math.min(a.y2, b.y2);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const ua = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter;
    return ua > 0 ? inter / ua : 0;
  }

  /* Suppression des doublons, par classe, en gardant la meilleure confiance. */
  function nms(dets, iouThreshold) {
    const sorted = dets.slice().sort((a, b) => b.score - a.score);
    const kept = [];
    for (const d of sorted) {
      if (!kept.some((k) => k.cls === d.cls && iou(k, d) > iouThreshold)) kept.push(d);
    }
    return kept;
  }

  /* Décode la sortie brute en boîtes (coordonnées dans l'espace SIZE x SIZE). */
  function decode(output, opts) {
    opts = opts || {};
    const size = opts.size || SIZE;
    const minPerson = opts.minPerson != null ? opts.minPerson : 0.35;
    const minBall = opts.minBall != null ? opts.minBall : 0.12;
    const stride = NUM_CLASSES + 5;
    let expected = 0;
    for (const s of STRIDES) expected += (size / s) * (size / s);
    if (output.length !== expected * stride) throw new Error("Sortie du modèle inattendue (" + output.length + ")");
    const dets = [];
    let idx = 0;
    for (const s of STRIDES) {
      const g = size / s;
      for (let gy = 0; gy < g; gy++) {
        for (let gx = 0; gx < g; gx++, idx++) {
          const o = idx * stride;
          const obj = output[o + 4];
          if (obj < 0.05) continue;
          const sp = obj * output[o + 5 + CLASS_PERSON];
          const sb = obj * output[o + 5 + CLASS_BALL];
          const cls = sp >= sb ? CLASS_PERSON : CLASS_BALL;
          const score = cls === CLASS_PERSON ? sp : sb;
          if (score < (cls === CLASS_PERSON ? minPerson : minBall)) continue;
          const cx = (output[o] + gx) * s, cy = (output[o + 1] + gy) * s;
          const w = Math.exp(output[o + 2]) * s, h = Math.exp(output[o + 3]) * s;
          dets.push({ cls, score, x1: cx - w / 2, y1: cy - h / 2, x2: cx + w / 2, y2: cy + h / 2 });
        }
      }
    }
    return dets;
  }

  function postprocess(output, opts) {
    opts = opts || {};
    return nms(decode(output, opts), opts.iou != null ? opts.iou : 0.45);
  }

  return { SIZE, CLASS_PERSON, CLASS_BALL, letterboxRatio, rgbaToTensor, iou, nms, decode, postprocess };
});
