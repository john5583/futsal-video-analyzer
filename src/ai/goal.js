/* Détection des buts dans une image : poteaux à bandes alternées « couleur vive / blanc » (rouge, bleu, vert, ou une couleur
   apprise sur ce but par le coach). Donne les pieds et le haut de chaque poteau. Aucune couleur n'est imposée : un but dont
   la couleur n'est pas connue n'est pas deviné, la détection ne renvoie rien et l'assistant demande au coach de le montrer. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./kit"));
  else root.FutsalGoal = factory(root.FutsalKit);
})(typeof self !== "undefined" ? self : this, function (K) {
  "use strict";

  /* Couleurs vives reconnues d'office (espace Lab : L clarté, A vert-rouge, B bleu-jaune). Le jaune et l'orange sont exclus :
     ils se confondent avec le parquet. Une autre couleur s'apprend à partir d'un but montré par le coach (learnPalette). */
  const PALETTES = {
    rouge: (L, A, B) => A > 13 && L > 14 && L < 62 && B > 6 && A > B * 0.45,
    bleu: (L, A, B) => B < -22 && L > 14 && L < 72 && A > -30 && A < 45,
    vert: (L, A, B) => A < -22 && B > 8 && L > 25 && L < 75
  };
  const isWhite = (L, A, B) => L > 63 && Math.hypot(A, B) < 26;

  /* Fonction de test d'un pixel « couleur vive » : palette nommée, ou { lab: [L, a, b], tol } apprise. */
  function accentTest(pal) {
    if (typeof pal === "string") return PALETTES[pal];
    if (pal && typeof pal === "object" && Array.isArray(pal.lab)) {
      const [l0, a0, b0] = pal.lab, tol = pal.tol || 16;
      return (L, A, B) => Math.hypot(L - l0, A - a0, B - b0) < tol && !isWhite(L, A, B);
    }
    return null;
  }

  /* Classe chaque pixel : 1 = couleur vive de la palette, 2 = blanc, 0 = autre. work = { w, h, L, A, B } (images de travail Lab). */
  function classify(work, pal) {
    const { w, h, L, A, B } = work, c = new Uint8Array(w * h), acc = accentTest(pal == null ? "rouge" : pal);
    if (!acc) return c;
    for (let i = 0; i < w * h; i++) {
      if (acc(L[i], A[i], B[i])) c[i] = 1;
      else if (isWhite(L[i], A[i], B[i])) c[i] = 2;
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

  /* Un but dans une palette : deux poteaux de hauteurs voisines. */
  function goalsOf(work, pal) {
    const cls = classify(work, pal), posts = groupPosts(verticalStripes(cls, work.w, work.h));
    const goals = [];
    for (let i = 0; i < posts.length; i++) for (let j = 0; j < posts.length; j++) {
      const a = posts[i], b = posts[j];
      if (a.u >= b.u - 6) continue;
      const ha = a.v1 - a.v0, hb = b.v1 - b.v0, sep = b.u - a.u;
      if (Math.max(ha, hb) / Math.min(ha, hb) > 1.6) continue;
      if (sep < 0.5 * Math.max(ha, hb) || sep > 5 * Math.max(ha, hb)) continue;   // largeur 3 m pour 2 m de haut : environ 1,5 fois (en vue de face)
      if (Math.abs(a.v1 - b.v1) > 0.9 * Math.max(ha, hb)) continue;
      goals.push({ left: a, right: b, score: Math.min(ha, hb) - Math.abs(a.v1 - b.v1) * 0.2, palette: typeof pal === "string" ? pal : (pal && pal.name) || "appris" });
    }
    return { posts, goals };
  }

  /* Détecte un but, toutes palettes confondues (celles d'office + opts.palettes apprises). Retourne { posts, goals } (pixels de
     l'image de travail), meilleurs buts d'abord ; chaque but indique la palette qui l'a trouvé. */
  function detect(work, opts) {
    const pals = Object.keys(PALETTES).concat((opts && opts.palettes) || []);
    const posts = [], goals = [];
    pals.forEach((p) => { const r = goalsOf(work, p); r.posts.forEach((x) => posts.push(x)); r.goals.forEach((x) => goals.push(x)); });
    goals.sort((x, y) => y.score - x.score);
    return { posts, goals };
  }

  /* Apprend la couleur vive d'un but montré par le coach : moyenne Lab des pixels colorés le long des deux poteaux, en écartant
     le blanc, les pixels neutres et tout ce qui ressemble au fond (mesuré de part et d'autre de chaque poteau). Renvoie
     { name, lab, tol, n } ou null s'il n'y en a pas assez (but blanc uni, image trop floue) : aucune couleur n'est alors inventée. */
  function learnPalette(work, goal) {
    const { w, h, L, A, B } = work, px = [];
    [goal.left, goal.right].forEach((p) => {
      const y0 = Math.max(0, Math.floor(p.v0)), y1 = Math.min(h - 1, Math.ceil(p.v1));
      const bg = [];
      for (let y = y0; y <= y1; y++) [-12, -9, 9, 12].forEach((dx) => {
        const x = Math.round(p.u + dx);
        if (x >= 0 && x < w) bg.push([L[y * w + x], A[y * w + x], B[y * w + x]]);
      });
      const med = [0, 1, 2].map((k) => { const v = bg.map((q) => q[k]).sort((m, n) => m - n); return v.length ? v[v.length >> 1] : 0; });
      for (let y = y0; y <= y1; y++) {
        for (let x = Math.max(0, Math.round(p.u - 3)); x <= Math.min(w - 1, Math.round(p.u + 3)); x++) {
          const i = y * w + x;
          if (Math.hypot(A[i], B[i]) > 22 && !isWhite(L[i], A[i], B[i]) && bg.length && Math.hypot(L[i] - med[0], A[i] - med[1], B[i] - med[2]) > 20) px.push([L[i], A[i], B[i]]);
        }
      }
    });
    if (px.length < 12) return null;
    const m = [0, 1, 2].map((k) => px.reduce((s, q) => s + q[k], 0) / px.length);
    const sd = Math.sqrt(px.reduce((s, q) => s + (q[0] - m[0]) ** 2 + (q[1] - m[1]) ** 2 + (q[2] - m[2]) ** 2, 0) / px.length);
    return { name: "appris", lab: m.map((v) => Math.round(v * 10) / 10), tol: Math.round(Math.max(14, Math.min(34, 2 * sd + 8)) * 10) / 10, n: px.length };
  }

  return { classify, verticalStripes, groupPosts, detect, goalsOf, learnPalette, PALETTES };
});
