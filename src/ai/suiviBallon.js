/* Suivi du ballon d'une image à la suivante, pour ÉTIQUETER vite : John clique le ballon une fois, le programme le suit sur les images consécutives
   (30 par seconde) et s'arrête quand il n'est plus sûr ; John corrige alors d'un clic. Ce n'est PAS le détecteur de l'analyse : il ne sert qu'à fabriquer
   des étiquettes sur des images consécutives (entraînement d'un modèle multi-images). Méthode : corrélation normalisée (NCC) d'un petit modèle
   du ballon pris sur l'image précédente, cherché autour de la dernière position. Rien n'est deviné : sous le seuil de confiance, le suivi s'arrête. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FutsalSuiviBallon = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const SEUIL = 0.6;            // confiance minimale (corrélation) pour continuer sans John
  const AMBIGU = 0.92;          // un second pic aussi bon que le premier (>= 92 %) = ambigu : confiance réduite

  /* Image en niveaux de gris : { w, h, g } à partir d'un ImageData (RGBA). */
  function gris(img) {
    const w = img.width, h = img.height, d = img.data, g = new Uint8Array(w * h);
    for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
    return { w, h, g };
  }
  /* Réglages selon la taille de la vidéo (grand côté 1920 px = référence). */
  function reglages(w, h, o) {
    const s = Math.max(w, h) / 1920;
    return Object.assign({ r: Math.max(5, Math.round(14 * s)), S: Math.max(14, Math.round(56 * s)), seuil: SEUIL }, o || {});
  }

  /* Modèle (petite image centrée sur un pixel entier) : valeurs sans leur moyenne + énergie. null si la zone est plate ou sort de l'image. */
  function modele(img, cx, cy, r) {
    const w = img.w, h = img.h;
    if (cx - r < 0 || cy - r < 0 || cx + r >= w || cy + r >= h) return null;
    const n = (2 * r + 1) * (2 * r + 1), T = new Float32Array(n);
    let mt = 0, k = 0;
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) { const v = img.g[y * w + x]; T[k++] = v; mt += v; }
    mt /= n; let st = 0;
    for (let i = 0; i < n; i++) { T[i] -= mt; st += T[i] * T[i]; }
    return st < n * 4 ? null : { T, st, n, r };
  }
  /* Corrélation normalisée du modèle placé en (x, y) de l'image cur. */
  function ncc(m, cur, x, y) {
    const r = m.r, w = cur.w;
    let sw = 0, sww = 0, swt = 0, q = 0;
    for (let yy = y - r; yy <= y + r; yy++) { const row = yy * w + x - r; for (let xx = 0; xx <= 2 * r; xx++) { const v = cur.g[row + xx]; sw += v; sww += v * v; swt += v * m.T[q++]; } }
    const vw = sww - sw * sw / m.n;
    return vw > m.n * 4 ? swt / Math.sqrt(vw * m.st) : 0;
  }
  /* Meilleure position du modèle dans la fenêtre [x0..x1] × [y0..y1] : { x, y, u, v (sous-pixel), conf, second (meilleur autre pic loin du premier) }. */
  function cherche(m, cur, x0, x1, y0, y1) {
    const W = x1 - x0 + 1, sc = new Float32Array(W * (y1 - y0 + 1));
    let best = -2, bx = x0, by = y0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const c = ncc(m, cur, x, y); sc[(y - y0) * W + (x - x0)] = c; if (c > best) { best = c; bx = x; by = y; } }
    let second = -2;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (Math.hypot(x - bx, y - by) > m.r) { const c = sc[(y - y0) * W + (x - x0)]; if (c > second) second = c; }
    let u = bx, v = by;
    if (bx > x0 && bx < x1) { const a = sc[(by - y0) * W + (bx - 1 - x0)], b = sc[(by - y0) * W + (bx - x0)], c = sc[(by - y0) * W + (bx + 1 - x0)], d = a - 2 * b + c; if (d < 0) u = bx + 0.5 * (a - c) / d; }
    if (by > y0 && by < y1) { const a = sc[(by - 1 - y0) * W + (bx - x0)], b = sc[(by - y0) * W + (bx - x0)], c = sc[(by + 1 - y0) * W + (bx - x0)], d = a - 2 * b + c; if (d < 0) v = by + 0.5 * (a - c) / d; }
    return { x: bx, y: by, u, v, conf: best, second };
  }

  /* Suit le ballon de `prev` (position connue pos = [u, v]) vers `cur`. Rend { u, v, conf, perdu, raison }.
     opt.ancre = { img, pos } : image et position du dernier clic de John. Le suivi d'une image à la suivante accumule une petite erreur
     (≈ 0,1 px par image) ; quand le ballon ressemble encore à ce que John a cliqué (corrélation ≥ 0,85), la position est recalée dessus : l'erreur reste bornée. */
  function suivre(prev, cur, pos, opt) {
    const o = reglages(prev.w, prev.h, opt), r = o.r, S = o.S, w = prev.w, h = prev.h;
    const cx = Math.round(pos[0]), cy = Math.round(pos[1]);
    const m = modele(prev, cx, cy, r);
    if (!m) return { u: pos[0], v: pos[1], conf: 0, perdu: true, raison: cx - r < 0 || cy - r < 0 || cx + r >= w || cy + r >= h ? "bord de l'image" : "modèle sans contraste" };
    const f = cherche(m, cur, Math.max(r, cx - S), Math.min(w - r - 1, cx + S), Math.max(r, cy - S), Math.min(h - r - 1, cy + S));
    let conf = f.conf;
    if (f.second > 0 && f.second >= AMBIGU * f.conf) conf = f.conf * 0.8;
    // le modèle a été pris autour d'un pixel entier : on remet la partie fractionnaire de la position connue (sinon l'erreur s'accumule)
    let u = f.u + pos[0] - cx, v = f.v + pos[1] - cy;
    const perdu = !(conf >= o.seuil);
    if (!perdu && o.ancre && o.ancre.img && o.ancre.pos) {
      const ax = Math.round(o.ancre.pos[0]), ay = Math.round(o.ancre.pos[1]), ma = modele(o.ancre.img, ax, ay, r);
      const ux = Math.round(u), uy = Math.round(v);
      if (ma && ux - r - 3 >= 0 && uy - r - 3 >= 0 && ux + r + 3 < w && uy + r + 3 < h) {
        const g = cherche(ma, cur, ux - 3, ux + 3, uy - 3, uy + 3);
        if (g.conf >= 0.85 && g.second < AMBIGU * g.conf) { u = g.u + o.ancre.pos[0] - ax; v = g.v + o.ancre.pos[1] - ay; }
      }
    }
    return { u, v, conf: Math.round(conf * 1000) / 1000, perdu, raison: perdu ? (f.second >= AMBIGU * f.conf ? "plusieurs candidats" : "ressemblance trop faible") : null };
  }

  /* Résumé d'une séquence : { images, clics, suivies, secondes, parImage } — le temps réellement passé par John. */
  function resume(seq) {
    const pts = (seq && seq.pts) || [], clics = pts.filter((p) => p[4] === "clic").length;
    const s = (seq && seq.secondes) || 0;
    return { images: pts.length, clics, suivies: pts.length - clics, secondes: s, parImage: pts.length ? Math.round((s / pts.length) * 100) / 100 : null };
  }
  return { gris, reglages, suivre, resume, SEUIL };
});
