/* Contour d'une silhouette découpée (masque 0/1) : pur, sans écran. Sert à dessiner un trait fin autour d'une personne à la place
   d'un cadre, et à savoir si un point (un clic) est DANS la silhouette. Un masque : { x0, y0, w, h, data } où data[y * w + x] vaut 1
   dans la silhouette ; x0, y0 est le coin du masque dans l'image de découpe (même échelle que l'image envoyée à MobileSAM). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FutsalContour = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const valid = (m) => !!m && m.w > 0 && m.h > 0 && m.data && m.data.length >= m.w * m.h && isFinite(m.x0) && isFinite(m.y0);

  /* Le point (x, y) de l'image de découpe est-il dans la silhouette ? Strict : un pixel hors du masque est dehors. */
  function inside(m, x, y) {
    if (!valid(m)) return false;
    const px = Math.floor(x - m.x0), py = Math.floor(y - m.y0);
    return px >= 0 && py >= 0 && px < m.w && py < m.h && m.data[py * m.w + px] === 1;
  }

  /* Contour extérieur : bord entre les pixels dedans et dehors, relié en boucle ; on garde la plus grande boucle (les trous sont ignorés).
     Renvoie une liste de points [x, y] dans le repère de l'image de découpe, ou null si le masque est vide ou inutilisable. */
  function trace(m) {
    if (!valid(m)) return null;
    const w = m.w, h = m.h, d = m.data, W1 = w + 1;
    const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[y * w + x] === 1;
    const out = new Map();                           // sommet -> sommets d'arrivée (arêtes orientées, l'intérieur à droite)
    const add = (ax, ay, bx, by) => { const k = ay * W1 + ax; const l = out.get(k); if (l) l.push(by * W1 + bx); else out.set(k, [by * W1 + bx]); };
    let any = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[y * w + x] !== 1) continue;
        any = true;
        if (!on(x, y - 1)) add(x, y, x + 1, y);
        if (!on(x + 1, y)) add(x + 1, y, x + 1, y + 1);
        if (!on(x, y + 1)) add(x + 1, y + 1, x, y + 1);
        if (!on(x - 1, y)) add(x, y + 1, x, y);
      }
    }
    if (!any) return null;
    let best = null, bestArea = 0;
    for (const start of [...out.keys()]) {
      while (out.get(start) && out.get(start).length) {
        const loop = [];
        let cur = start;
        for (let guard = 0; guard < 4 * w * h + 8; guard++) {
          const l = out.get(cur);
          if (!l || !l.length) break;
          loop.push([m.x0 + (cur % W1), m.y0 + Math.floor(cur / W1)]);
          cur = l.pop();
          if (cur === start) break;
        }
        let a = 0;
        for (let i = 0; i < loop.length; i++) { const p = loop[i], q = loop[(i + 1) % loop.length]; a += p[0] * q[1] - q[0] * p[1]; }
        a = Math.abs(a) / 2;
        if (loop.length >= 3 && a > bestArea) { best = loop; bestArea = a; }
      }
    }
    return best;
  }

  /* Allège un contour (Douglas-Peucker) : les marches d'escalier d'un pixel disparaissent, la forme reste. */
  function simplify(pts, eps) {
    if (!pts || pts.length < 4) return pts;
    const e2 = (eps || 0.8) * (eps || 0.8);
    const dist2 = (p, a, b) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
      let t = l ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l : 0;
      t = Math.max(0, Math.min(1, t));
      const x = a[0] + t * dx - p[0], y = a[1] + t * dy - p[1];
      return x * x + y * y;
    };
    // boucle fermée : on coupe en deux au point le plus éloigné du premier
    let far = 0, fd = -1;
    for (let k = 1; k < pts.length; k++) { const v = (pts[k][0] - pts[0][0]) ** 2 + (pts[k][1] - pts[0][1]) ** 2; if (v > fd) { fd = v; far = k; } }
    const a = pts.slice(0, far + 1), b = pts.slice(far).concat([pts[0]]);
    const simp = (arr) => { const kp = new Uint8Array(arr.length); kp[0] = 1; kp[arr.length - 1] = 1; const rec = (i, j) => { let md = 0, mi = -1; for (let k = i + 1; k < j; k++) { const v = dist2(arr[k], arr[i], arr[j]); if (v > md) { md = v; mi = k; } } if (md > e2 && mi > 0) { kp[mi] = 1; rec(i, mi); rec(mi, j); } }; rec(0, arr.length - 1); return arr.filter((_p, i) => kp[i]); };
    const sa = simp(a), sb = simp(b);
    return sa.concat(sb.slice(1, -1));
  }

  /* Contour prêt à dessiner. */
  function outline(m, eps) { const t = trace(m); return t ? simplify(t, eps) : null; }

  /* Parmi plusieurs silhouettes [{ id, mask }], celle qui contient le point ; si plusieurs (personnes qui se chevauchent), la plus petite. */
  function pick(items, x, y) {
    let best = null, area = Infinity;
    (items || []).forEach((it) => { if (inside(it.mask, x, y) && it.mask.w * it.mask.h < area) { area = it.mask.w * it.mask.h; best = it; } });
    return best;
  }
  return { inside, trace, simplify, outline, pick };
});
