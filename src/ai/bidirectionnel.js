/* Raisonnement dans les DEUX sens du temps (pur, sans écran).
   Une estimation faite seulement « du passé vers l'avenir » traîne un retard et garde le bruit de la dernière image. Ici, chaque grandeur est
   calculée une fois vers l'avant, une fois vers l'arrière, et on ne garde que ce sur quoi les deux s'accordent.
   - lisser : filtre exponentiel avant puis arrière, moyenné (sans retard, ne décale pas les instants).
   - vitesses : vitesse d'une piste par différences centrées sur des points lissés, avec trou maximal toléré.
   - confirmer : un état (par ex. « le ballon est au pied de A ») n'est confirmé que si le sens avant ET le sens arrière le voient. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FutsalBidirectionnel = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* pts : [{ t, x, y }] triés. alpha : poids de la mesure (0 à 1). Renvoie de nouveaux points, mêmes instants. */
  function lisser(pts, alpha, maxGap) {
    const a = alpha > 0 && alpha <= 1 ? alpha : 0.5, n = pts.length;
    if (n < 2) return pts.map((p) => ({ t: p.t, x: p.x, y: p.y }));
    // un trou de plus de maxGap s coupe la piste en morceaux lissés séparément : jamais de mélange à travers un trou
    if (maxGap > 0) {
      const out = []; let s = 0;
      for (let i = 1; i <= n; i++) if (i === n || pts[i].t - pts[i - 1].t > maxGap + 1e-9) { out.push(...lisser(pts.slice(s, i), a)); s = i; }
      return out;
    }
    const fw = new Array(n), bw = new Array(n);
    fw[0] = { x: pts[0].x, y: pts[0].y };
    for (let i = 1; i < n; i++) fw[i] = { x: fw[i - 1].x + a * (pts[i].x - fw[i - 1].x), y: fw[i - 1].y + a * (pts[i].y - fw[i - 1].y) };
    bw[n - 1] = { x: pts[n - 1].x, y: pts[n - 1].y };
    for (let i = n - 2; i >= 0; i--) bw[i] = { x: bw[i + 1].x + a * (pts[i].x - bw[i + 1].x), y: bw[i + 1].y + a * (pts[i].y - bw[i + 1].y) };
    return pts.map((p, i) => ({ t: p.t, x: (fw[i].x + bw[i].x) / 2, y: (fw[i].y + bw[i].y) / 2 }));
  }

  /* Vitesses (m/s) d'une piste : différences centrées sur les points lissés. Un trou de plus de maxGap s n'est jamais enjambé :
     le point voisin d'un trou n'a pas de vitesse (null), jamais une vitesse inventée à travers le trou. */
  function vitesses(pts, opt) {
    const o = Object.assign({ alpha: 0.5, maxGap: 0.8 }, opt), s = lisser(pts, o.alpha, o.maxGap), out = new Array(s.length).fill(null);
    // les deux premiers et les deux derniers points de chaque morceau continu n'ont pas de vitesse : le lissage y est biaisé vers le bas,
    // ce qui ferait croire à tort qu'un joueur est immobile
    const seg = []; let sid = 0;
    for (let i = 0; i < s.length; i++) { if (i > 0 && s[i].t - s[i - 1].t > o.maxGap + 1e-9) sid++; seg.push(sid); }
    const first = {}, lastI = {};
    seg.forEach((g, i) => { if (first[g] == null) first[g] = i; lastI[g] = i; });
    for (let i = 0; i < s.length; i++) {
      if (i - first[seg[i]] < 2 || lastI[seg[i]] - i < 2) continue;
      const a = i > 0 ? s[i - 1] : null, b = i < s.length - 1 ? s[i + 1] : null;
      const okA = a && s[i].t - a.t <= o.maxGap + 1e-9, okB = b && b.t - s[i].t <= o.maxGap + 1e-9;
      const p = okA ? a : s[i], q = okB ? b : s[i], dt = q.t - p.t;
      if ((okA || okB) && dt > 0) out[i] = Math.hypot(q.x - p.x, q.y - p.y) / dt;
    }
    return out;
  }

  /* flags : tableau de booléens (un par image). Confirmé à l'image i si vrai dans au moins `min` images consécutives qui la contiennent,
     comptées en avant (i, i+1, …) ET en arrière (i, i-1, …). Un seul sens ne suffit pas. */
  function confirmer(flags, min) {
    const m = Math.max(1, min | 0), n = flags.length, fwd = new Array(n).fill(0), bwd = new Array(n).fill(0);
    for (let i = 0; i < n; i++) fwd[i] = flags[i] ? (i > 0 ? fwd[i - 1] : 0) + 1 : 0;      // longueur de la série qui se termine en i
    for (let i = n - 1; i >= 0; i--) bwd[i] = flags[i] ? (i < n - 1 ? bwd[i + 1] : 0) + 1 : 0;   // longueur de la série qui commence en i
    return flags.map((f, i) => !!f && fwd[i] + bwd[i] - 1 >= m);
  }

  /* Intervalles [début, fin] (indices) des séries vraies d'au moins minDur secondes ; deux sens : la série est bornée par la première
     image fausse avant et après. ts : instants des images. */
  function series(flags, ts, minDur) {
    const res = []; let s = -1;
    for (let i = 0; i <= flags.length; i++) {
      const ok = i < flags.length && flags[i];
      if (ok && s < 0) s = i;
      if (!ok && s >= 0) { if (ts[i - 1] - ts[s] >= minDur - 1e-9) res.push([s, i - 1]); s = -1; }
    }
    return res;
  }

  return { lisser, vitesses, confirmer, series };
});
