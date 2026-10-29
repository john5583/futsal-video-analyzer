/* Vue du dessus et vidéo toujours au MÊME instant (cahier des charges §4) : l'analyse garde environ 3 images par seconde, la vidéo en montre 30 ou plus.
   Au lieu d'afficher l'image d'analyse la plus proche (qui saute et peut retarder jusqu'à une demi-image d'analyse), on calcule la position de chaque
   personne à l'instant EXACT de l'image affichée, entre les deux images d'analyse qui l'entourent. Rien n'est inventé : une personne présente d'un seul côté
   n'est montrée que près de son image ; si les deux images sont trop éloignées (caméra perdue, analyse absente), on ne montre rien. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FutsalSynchro = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const GAP_MAX = 1.0;       // s : au-delà, deux images d'analyse ne sont pas « voisines » : pas d'interpolation
  const TENIR = 0.2;         // s : une personne vue d'un seul côté reste affichée jusqu'à cette distance de son image
  const SAUT_MAX = 6;        // m : une personne qui a bougé de plus = autre personne ou piste recollée : pas d'interpolation, position de l'image la plus proche
  const SAUT_BALLON = 9;     // m : le ballon va plus vite qu'une personne
  const lerp = (a, b, k) => a + (b - a) * k;

  /* Recherche du dernier indice i tel que frames[i].t <= t (dichotomie). */
  function avant(frames, t) {
    let lo = 0, hi = frames.length - 1;
    if (!frames.length || frames[0].t > t) return -1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (frames[m].t <= t) lo = m; else hi = m - 1; }
    return lo;
  }
  function plusProche(frames, t, maxGap) {
    const i = avant(frames, t), c = [frames[i], frames[i + 1]].filter(Boolean);
    if (!c.length) return null;
    const f = c.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a));
    return Math.abs(f.t - t) <= maxGap ? f : null;
  }

  /* Image d'analyse à l'instant t (secondes). Rend { t, players, ball, h?, bn?, interpolee } ou null. */
  function frameAt(frames, t, opts) {
    const o = opts || {}, gapMax = o.gapMax != null ? o.gapMax : GAP_MAX, tenir = o.tenir != null ? o.tenir : TENIR;
    if (!frames || !frames.length || !isFinite(t)) return null;
    const i = avant(frames, t), f0 = frames[i], f1 = frames[i + 1];
    if (!f0 || !f1 || f1.t - f0.t > gapMax || f1.t <= f0.t) {
      const f = plusProche(frames, t, tenir);
      return f ? Object.assign({}, f, { t, interpolee: false }) : null;
    }
    const k = (t - f0.t) / (f1.t - f0.t), second = new Map();
    f1.players.forEach((p) => second.set(p.id, p));
    const players = [], vus = new Set();
    f0.players.forEach((p) => {
      const q = second.get(p.id); vus.add(p.id);
      if (q && Math.hypot(q.x - p.x, q.y - p.y) <= SAUT_MAX) {
        const o2 = Object.assign({}, p, { x: lerp(p.x, q.x, k), y: lerp(p.y, q.y, k) });
        if (Array.isArray(p.b) && p.b.length === 4 && Array.isArray(q.b) && q.b.length === 4) o2.b = p.b.map((v, j) => lerp(v, q.b[j], k));
        players.push(o2);
      } else if (q) players.push(k < 0.5 ? p : q);          // trop loin (piste recollée) : la plus proche des deux, sans glisser
      else if (t - f0.t <= tenir) players.push(p);
    });
    f1.players.forEach((q) => { if (!vus.has(q.id) && f1.t - t <= tenir) players.push(q); });
    let ball = null;
    if (f0.ball && f1.ball && Math.hypot(f1.ball.x - f0.ball.x, f1.ball.y - f0.ball.y) <= SAUT_BALLON) ball = { x: lerp(f0.ball.x, f1.ball.x, k), y: lerp(f0.ball.y, f1.ball.y, k) };
    else if (f0.ball && t - f0.t <= tenir) ball = f0.ball;
    else if (f1.ball && f1.t - t <= tenir) ball = f1.ball;
    const pres = k < 0.5 ? f0 : f1, r = { t, players, ball, interpolee: true };
    if (pres.h) r.h = pres.h;
    if (pres.bn) r.bn = pres.bn;
    return r;
  }
  /* Écart d'instant de l'ancienne méthode (image d'analyse la plus proche) : pour comparer avant / après. */
  const ecartAncien = (frames, t, maxGap) => { const f = plusProche(frames, t, maxGap == null ? 1.2 : maxGap); return f ? Math.abs(f.t - t) : null; };
  return { frameAt, plusProche, ecartAncien, GAP_MAX, TENIR };
});
