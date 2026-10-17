/* Étiquettes du ballon désignées par le coach sur l'image vidéo (clic exact) : servent uniquement à mesurer puis, plus tard,
   à entraîner le détecteur. Rien n'est deviné : une étiquette est soit « le ballon est ici » (centre en pixels de l'image),
   soit « aucun ballon visible » (image négative). Taille de la boîte : estimée à partir du diamètre réel d'un ballon de futsal
   (≈ 0,20 m) quand la projection du terrain est connue, sinon valeur par défaut ; l'étiquette le note (« est »).
   Mémoire : mem.ballLabels = [{ t, u, v, w, h, est, vw, vh } | { t, none: true, vw, vh }], u et v en pixels vidéo. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FutsalBallLabels = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const T_SAME = 0.2;          // deux étiquettes à moins de 0,2 s sont la même image : la dernière remplace l'autre
  const BALL_M = 0.2;          // diamètre d'un ballon de futsal (m)

  function list(mem) { if (!Array.isArray(mem.ballLabels)) mem.ballLabels = []; return mem.ballLabels; }

  /* Taille en pixels d'un ballon placé en (u, v) : la projection image -> terrain H (pixels vidéo -> mètres) est inversée
     localement. Valeur hors plage ou projection absente -> repli sur 1,2 % de la largeur (marqué estimé). */
  function ballSize(u, v, vw, H, inv) {
    const fallback = Math.max(8, Math.round(vw * 0.012));
    if (!Array.isArray(H) || H.length !== 9 || !inv || typeof inv.apply !== "function" || typeof inv.invert !== "function") return { w: fallback, h: fallback, est: true };
    try {
      const c = inv.apply(H, u, v);
      if (!isFinite(c[0]) || !isFinite(c[1])) return { w: fallback, h: fallback, est: true };
      const Hi = inv.invert(H), a = inv.apply(Hi, c[0] - BALL_M / 2, c[1]), b = inv.apply(Hi, c[0] + BALL_M / 2, c[1]);
      const c2 = inv.apply(Hi, c[0], c[1] - BALL_M / 2), d = inv.apply(Hi, c[0], c[1] + BALL_M / 2);
      const s = (Math.hypot(a[0] - b[0], a[1] - b[1]) + Math.hypot(c2[0] - d[0], c2[1] - d[1])) / 2;
      if (!isFinite(s) || s < 4 || s > vw * 0.1) return { w: fallback, h: fallback, est: true };
      return { w: Math.round(s), h: Math.round(s), est: true };
    } catch (_e) { return { w: fallback, h: fallback, est: true }; }
  }

  function add(mem, lab) {
    if (!lab || !isFinite(lab.t) || !(lab.vw > 0) || !(lab.vh > 0)) return null;
    if (!lab.none && !(isFinite(lab.u) && isFinite(lab.v) && lab.u >= 0 && lab.v >= 0 && lab.u <= lab.vw && lab.v <= lab.vh)) return null;
    const l = list(mem).filter((o) => Math.abs(o.t - lab.t) >= T_SAME);
    l.push(lab.none ? { t: lab.t, none: true, vw: lab.vw, vh: lab.vh } : { t: lab.t, u: Math.round(lab.u), v: Math.round(lab.v), w: lab.w, h: lab.h, est: lab.est !== false, vw: lab.vw, vh: lab.vh });
    mem.ballLabels = l.sort((a, b) => a.t - b.t);
    return mem.ballLabels.find((o) => Math.abs(o.t - lab.t) < 1e-9);
  }
  function clear(mem) { mem.ballLabels = []; }

  /* Ligne au format YOLO (« 0 cx cy w h » normalisés) ; fichier vide pour une image sans ballon. */
  function yoloLine(l) {
    if (l.none) return "";
    const cl = (x) => Math.min(1, Math.max(0, x));
    const f = (x) => cl(x).toFixed(6);
    return "0 " + f(l.u / l.vw) + " " + f(l.v / l.vh) + " " + f(l.w / l.vw) + " " + f(l.h / l.vh) + "\n";
  }
  function counts(mem) {
    const l = list(mem), pos = l.filter((o) => !o.none).length;
    return { total: l.length, positives: pos, negatives: l.length - pos };
  }
  return { add, clear, list, counts, yoloLine, ballSize, T_SAME, BALL_M };
});
