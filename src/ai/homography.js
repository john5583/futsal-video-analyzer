/* Calibrage du terrain : homographie image -> terrain (mètres) à partir de points repères cliqués.
   Le terrain a l'origine au coin haut-gauche, x le long de la longueur (0 = but gauche), y le long de la largeur. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FutsalHomography = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* Points repères d'un terrain de futsal de longueur L et largeur W (mètres). */
  function landmarks(L, W) {
    const cy = W / 2, post = 1.5, r = 6;
    const list = [
      ["corner_tl", "Coin haut-gauche", 0, 0],
      ["corner_tr", "Coin haut-droit", L, 0],
      ["corner_bl", "Coin bas-gauche", 0, W],
      ["corner_br", "Coin bas-droit", L, W],
      ["mid_top", "Ligne médiane / touche du haut", L / 2, 0],
      ["mid_bottom", "Ligne médiane / touche du bas", L / 2, W],
      ["center", "Point central", L / 2, cy],
      ["l_area_top", "Surface gauche : angle haut sur la ligne de but", 0, cy - post - r],
      ["l_area_bottom", "Surface gauche : angle bas sur la ligne de but", 0, cy + post + r],
      ["l_front_top", "Surface gauche : début de la ligne droite (haut)", r, cy - post],
      ["l_front_bottom", "Surface gauche : fin de la ligne droite (bas)", r, cy + post],
      ["l_penalty", "Point de penalty gauche (6 m)", r, cy],
      ["l_second", "Second point gauche (10 m)", 10, cy],
      ["r_area_top", "Surface droite : angle haut sur la ligne de but", L, cy - post - r],
      ["r_area_bottom", "Surface droite : angle bas sur la ligne de but", L, cy + post + r],
      ["r_front_top", "Surface droite : début de la ligne droite (haut)", L - r, cy - post],
      ["r_front_bottom", "Surface droite : fin de la ligne droite (bas)", L - r, cy + post],
      ["r_penalty", "Point de penalty droit (6 m)", L - r, cy],
      ["r_second", "Second point droit (10 m)", L - 10, cy],
      ["circle_top", "Cercle central : croisement avec la ligne médiane (haut)", L / 2, cy - 3],
      ["circle_bottom", "Cercle central : croisement avec la ligne médiane (bas)", L / 2, cy + 3],
      ["circle_left", "Cercle central : point à gauche du centre", L / 2 - 3, cy],
      ["circle_right", "Cercle central : point à droite du centre", L / 2 + 3, cy],
      ["l_dash_top", "Ligne pointillée 9 m gauche : début de la partie droite (haut)", 9, cy - post],
      ["l_dash_bottom", "Ligne pointillée 9 m gauche : fin de la partie droite (bas)", 9, cy + post],
      ["l_dash_mid", "Ligne pointillée 9 m gauche : milieu (face au but)", 9, cy],
      ["r_dash_top", "Ligne pointillée 9 m droite : début de la partie droite (haut)", L - 9, cy - post],
      ["r_dash_bottom", "Ligne pointillée 9 m droite : fin de la partie droite (bas)", L - 9, cy + post],
      ["r_dash_mid", "Ligne pointillée 9 m droite : milieu (face au but)", L - 9, cy],
      ["l_goal_top", "Poteau gauche haut (pied)", 0, cy - post],
      ["l_goal_bottom", "Poteau gauche bas (pied)", 0, cy + post],
      ["r_goal_top", "Poteau droit haut (pied)", L, cy - post],
      ["r_goal_bottom", "Poteau droit bas (pied)", L, cy + post]
    ];
    return list.map(([id, label, x, y]) => ({ id, label, x, y }));
  }

  /* Résolution d'un système linéaire n x n par élimination de Gauss avec pivot partiel. */
  function solveLinear(A, b) {
    const n = b.length;
    const M = A.map((row, i) => row.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-12) throw new Error("Points repères alignés ou redondants : choisissez des points mieux répartis.");
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = c + 1; r < n; r++) {
        const f = M[r][c] / M[c][c];
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    const x = new Array(n);
    for (let r = n - 1; r >= 0; r--) {
      let s = M[r][n];
      for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
      x[r] = s / M[r][r];
    }
    return x;
  }

  function normalization(pts) {
    const n = pts.length;
    let mx = 0, my = 0;
    pts.forEach((p) => { mx += p[0]; my += p[1]; });
    mx /= n; my /= n;
    let d = 0;
    pts.forEach((p) => { d += Math.hypot(p[0] - mx, p[1] - my); });
    d /= n;
    const s = d > 0 ? Math.SQRT2 / d : 1;
    return { s, mx, my };
  }

  function mul3(A, B) {
    const C = new Array(9).fill(0);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j];
    return C;
  }

  function invert(H) {
    const [a, b, c, d, e, f, g, h, i] = H;
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-14) throw new Error("Homographie non inversible.");
    return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
      B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
      C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
  }

  function apply(H, x, y) {
    const w = H[6] * x + H[7] * y + H[8];
    return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
  }

  /* Homographie src -> dst (au moins 4 correspondances, moindres carrés, points normalisés). */
  function solve(src, dst) {
    if (!Array.isArray(src) || src.length < 4 || src.length !== dst.length) throw new Error("Il faut au moins 4 points repères.");
    const ns = normalization(src), nd = normalization(dst);
    const Ts = [ns.s, 0, -ns.s * ns.mx, 0, ns.s, -ns.s * ns.my, 0, 0, 1];
    const Td = [nd.s, 0, -nd.s * nd.mx, 0, nd.s, -nd.s * nd.my, 0, 0, 1];
    const AtA = Array.from({ length: 8 }, () => new Array(8).fill(0));
    const Atb = new Array(8).fill(0);
    for (let i = 0; i < src.length; i++) {
      const x = (src[i][0] - ns.mx) * ns.s, y = (src[i][1] - ns.my) * ns.s;
      const u = (dst[i][0] - nd.mx) * nd.s, v = (dst[i][1] - nd.my) * nd.s;
      const rows = [[[x, y, 1, 0, 0, 0, -u * x, -u * y], u], [[0, 0, 0, x, y, 1, -v * x, -v * y], v]];
      rows.forEach(([r, rhs]) => {
        for (let a = 0; a < 8; a++) {
          Atb[a] += r[a] * rhs;
          for (let b = 0; b < 8; b++) AtA[a][b] += r[a] * r[b];
        }
      });
    }
    const h = solveLinear(AtA, Atb);
    const Hn = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
    const H = mul3(invert(Td), mul3(Hn, Ts));
    const k = H[8];
    return H.map((v) => v / k);
  }

  /* Erreur de reprojection moyenne, en mètres. */
  function reprojectionError(H, src, dst) {
    let s = 0;
    for (let i = 0; i < src.length; i++) {
      const p = apply(H, src[i][0], src[i][1]);
      s += Math.hypot(p[0] - dst[i][0], p[1] - dst[i][1]);
    }
    return s / src.length;
  }

  /* Aire (en pixels²) du quadrilatère formé par les points, pour vérifier qu'ils sont bien répartis. */
  function spread(pts) {
    let xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
  }

  return { landmarks, solve, apply, invert, reprojectionError, spread, solveLinear, mul3 };
});
