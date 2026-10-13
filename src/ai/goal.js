/* Détection des buts (poteaux rayés rouge et blanc) dans une image : donne les pieds et le haut de chaque poteau. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./kit"));
  else root.FutsalGoal = factory(root.FutsalKit);
})(typeof self !== "undefined" ? self : this, function (K) {
  "use strict";

  /* Classe chaque pixel : 1 = rouge, 2 = blanc, 0 = autre. work = { w, h, L, A, B } (images de travail Lab). */
  function classify(work) {
    const { w, h, L, A, B } = work, c = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      if (A[i] > 13 && L[i] > 14 && L[i] < 62 && B[i] > 6 && A[i] > B[i] * 0.45) c[i] = 1;
      else if (L[i] > 63 && Math.hypot(A[i], B[i]) < 26) c[i] = 2;
    }
    return c;
  }

  /* Cherche des suites verticales rouge/blanc/rouge/blanc… : retourne des colonnes candidates { x, y0, y1, runs }. */
  function verticalStripes(cls, w, h) {
    const out = [];
    for (let x = 0; x < w; x++) {
      let runs = [], cur = 0, start = 0;
      for (let y = 0; y <= h; y++) {
        const v = y < h ? cls[y * w + x] : -1;
        if (v !== cur) {
          if (cur && y - start >= 2) runs.push({ c: cur, y0: start, y1: y - 1 });
          else if (cur) runs.push({ c: 0, y0: start, y1: y - 1 }); // trop court : coupure
          cur = v; start = y;
        }
      }
      // enchaînements alternés
      let i = 0;
      while (i < runs.length) {
        let j = i;
        const seq = [runs[i]];
        while (j + 1 < runs.length && runs[j + 1].c && runs[j].c && runs[j + 1].c !== runs[j].c && runs[j + 1].y0 - runs[j].y1 <= 2) {
          const a = runs[j].y1 - runs[j].y0 + 1, b = runs[j + 1].y1 - runs[j + 1].y0 + 1;
          if (Math.max(a, b) / Math.min(a, b) > 3) break;
          seq.push(runs[j + 1]); j++;
        }
        if (seq.length >= 4 && seq[0].c) out.push({ x, y0: seq[0].y0, y1: seq[seq.length - 1].y1, n: seq.length });
        i = j + 1;
      }
    }
    return out;
  }

  /* Regroupe les colonnes voisines en poteaux : { u, v0, v1, width, score }. Les colonnes proches (±3 px) dont les étendues se recoupent sont fusionnées. */
  function groupPosts(cols) {
    const groups = [];
    cols.forEach((c) => {
      const g = groups.find((q) => c.x - q.x1 <= 3 && c.y0 <= q.y1 + 4 && c.y1 >= q.y0 - 4);
      if (g) { g.x1 = c.x; g.y0 = Math.min(g.y0, c.y0); g.y1 = Math.max(g.y1, c.y1); g.cols++; }
      else groups.push({ x0: c.x, x1: c.x, y0: c.y0, y1: c.y1, cols: 1 });
    });
    return groups.filter((g) => g.x1 - g.x0 + 1 <= 16 && g.y1 - g.y0 >= 14)
      .map((g) => ({ u: (g.x0 + g.x1) / 2, v0: g.y0, v1: g.y1, width: g.x1 - g.x0 + 1, score: g.y1 - g.y0 }));
  }

  /* Détecte un but : deux poteaux de hauteurs voisines. Retourne [{ left, right }] (pixels de l'image de travail), meilleurs d'abord. */
  function detect(work) {
    const cls = classify(work), posts = groupPosts(verticalStripes(cls, work.w, work.h));
    const goals = [];
    for (let i = 0; i < posts.length; i++) for (let j = 0; j < posts.length; j++) {
      const a = posts[i], b = posts[j];
      if (a.u >= b.u - 6) continue;
      const ha = a.v1 - a.v0, hb = b.v1 - b.v0, sep = b.u - a.u;
      if (Math.max(ha, hb) / Math.min(ha, hb) > 1.6) continue;
      if (sep < 0.5 * Math.max(ha, hb) || sep > 5 * Math.max(ha, hb)) continue;   // largeur 3 m pour 2 m de haut : environ 1,5 fois (en vue de face)
      if (Math.abs(a.v1 - b.v1) > 0.9 * Math.max(ha, hb)) continue;
      goals.push({ left: a, right: b, score: Math.min(ha, hb) - Math.abs(a.v1 - b.v1) * 0.2 });
    }
    goals.sort((x, y) => y.score - x.score);
    return { posts, goals };
  }

  return { classify, verticalStripes, groupPosts, detect };
});
