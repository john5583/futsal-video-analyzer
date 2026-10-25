/* Accrochage d'un repère de calibrage sur le croisement de lignes le plus proche, et erreur de chaque repère.
   - snap : à partir du clic de John, cherche dans un petit rayon le coin / croisement net (réponse de Harris, valeur propre minimale) le plus proche.
     Si rien de net n'est trouvé (zone uniforme, une seule ligne, deux lignes parallèles), il ne bouge PAS le clic : jamais de deviné.
   - pointErrors : écart de chaque repère à la projection calculée avec TOUS LES AUTRES (nécessite au moins 5 repères). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./homography"));
  else root.FutsalAccroche = factory(root.FutsalHomography);
})(typeof self !== "undefined" ? self : this, function (HG) {
  "use strict";

  const RAYON = 6;           // rayon de recherche (pixels de la vidéo)
  const MARGE = 12;          // marge lue autour de la zone de recherche (les flous gaussiens en ont besoin)
  const ECHELLES = [1, 1.8, 3];   // largeurs de lignes cherchées : de très fines à épaisses (écart-type de dérivation, en pixels)
  const SEUIL_ABS = 12;      // réponse normalisée minimale (voir mesure dans tests/accroche.test.js)
  const RAPPORT = 4;         // le croisement doit dépasser 4 fois la réponse du 20e centile de la zone (sinon texture partout ou dégradé)
  const SEUIL_REL = 0.5;     // un autre croisement compte si sa réponse atteint 50 % du meilleur

  function noyau(s) {
    const r = Math.ceil(3 * s), k = new Float32Array(2 * r + 1);
    let t = 0;
    for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * s * s)); t += k[i + r]; }
    for (let i = 0; i < k.length; i++) k[i] /= t;
    return k;
  }
  /* flou gaussien séparable, bords prolongés */
  function flou(src, n, s) {
    const k = noyau(s), r = (k.length - 1) / 2, tmp = new Float32Array(n * n), out = new Float32Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let v = 0; for (let i = -r; i <= r; i++) v += k[i + r] * src[y * n + Math.min(n - 1, Math.max(0, x + i))];
      tmp[y * n + x] = v;
    }
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let v = 0; for (let i = -r; i <= r; i++) v += k[i + r] * tmp[Math.min(n - 1, Math.max(0, y + i)) * n + x];
      out[y * n + x] = v;
    }
    return out;
  }

  /* gray : { data, width, height } ; (x, y) : clic en pixels de gray. Rend { ok, x, y, dx, dy, score, raison }.
     Multi-échelle : une ligne épaisse a ses coins de bord à plusieurs pixels du vrai croisement ; on cherche le croisement à l'échelle de la ligne. */
  function snap(gray, x, y, opts) {
    const o = opts || {}, seuilAbs = o.seuil != null ? o.seuil : SEUIL_ABS, R = o.rayon || RAYON, W = gray.width, H = gray.height, d = gray.data;
    const non = (raison) => ({ ok: false, x, y, dx: 0, dy: 0, score: 0, raison });
    const cx = Math.round(x), cy = Math.round(y), m = R + MARGE;
    if (cx - m < 0 || cy - m < 0 || cx + m >= W || cy + m >= H) return non("trop près du bord de l'image");
    const x0 = cx - m, y0 = cy - m, n = 2 * m + 1;
    const zone = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) zone[j * n + i] = d[(y0 + j) * W + x0 + i];
    const nr = 2 * R + 1;
    let resp = null, meilleur = -1, base = 0;
    ECHELLES.forEach((sd) => {
      const rs = new Float32Array(nr * nr), large = [];      // large : réponse sur toute la zone lue (sert à estimer le niveau de fond)
      const L = flou(zone, n, sd), gx = new Float32Array(n * n), gy = new Float32Array(n * n);
      for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) { gx[j * n + i] = (L[j * n + i + 1] - L[j * n + i - 1]) / 2; gy[j * n + i] = (L[(j + 1) * n + i] - L[(j - 1) * n + i]) / 2; }
      const xx = new Float32Array(n * n), yy = new Float32Array(n * n), xy = new Float32Array(n * n);
      for (let q = 0; q < n * n; q++) { xx[q] = gx[q] * gx[q]; yy[q] = gy[q] * gy[q]; xy[q] = gx[q] * gy[q]; }
      const bxx = flou(xx, n, 1.5 * sd), byy = flou(yy, n, 1.5 * sd), bxy = flou(xy, n, 1.5 * sd), norm = sd * sd;
      for (let j = 3; j < n - 3; j++) for (let i = 3; i < n - 3; i++) {
        const q = j * n + i, tr = bxx[q] + byy[q], det = bxx[q] * byy[q] - bxy[q] * bxy[q];
        const lm = (tr / 2 - Math.sqrt(Math.max(0, tr * tr / 4 - det))) * norm;     // valeur propre minimale, normalisée par l'échelle
        large.push(lm);
        if (j >= MARGE && j < MARGE + nr && i >= MARGE && i < MARGE + nr) rs[(j - MARGE) * nr + i - MARGE] = lm;
      }
      let top = 0;
      for (let q = 0; q < rs.length; q++) if (rs[q] > top) top = rs[q];
      if (top > meilleur) { meilleur = top; resp = rs; large.sort((x, y) => x - y); base = large[Math.floor(large.length * 0.2)]; }      // une seule échelle : celle où le croisement ressort le plus (la largeur de la ligne)
    });
    const best = meilleur;
    if (best < seuilAbs || best < RAPPORT * Math.max(base, 0.5)) return non("pas de croisement net près du clic");
    // maxima locaux assez forts ; on garde le plus proche du clic
    let pick = null;
    for (let j = 1; j < nr - 1; j++) for (let i = 1; i < nr - 1; i++) {
      const v = resp[j * nr + i];
      if (v < SEUIL_REL * best || v < seuilAbs) continue;
      let max = true;
      for (let b = -1; b <= 1 && max; b++) for (let a = -1; a <= 1; a++) if ((a || b) && resp[(j + b) * nr + i + a] > v) { max = false; break; }
      if (!max) continue;
      const dist = Math.hypot(i - R - (x - cx), j - R - (y - cy));
      if (dist > R) continue;
      if (!pick || dist < pick.dist) pick = { i, j, v, dist };
    }
    if (!pick) return non("pas de croisement net près du clic");
    // le sommet est un plateau : centre = barycentre des pixels proches du maximum (pondérés), à une fraction de pixel
    let sw = 0, sx = 0, sy = 0;
    for (let j = Math.max(0, pick.j - 5); j <= Math.min(nr - 1, pick.j + 5); j++) for (let i = Math.max(0, pick.i - 5); i <= Math.min(nr - 1, pick.i + 5); i++) {
      const w = resp[j * nr + i] - 0.6 * pick.v;
      if (w > 0) { sw += w; sx += w * i; sy += w * j; }
    }
    const nx = cx - R + (sw ? sx / sw : pick.i), ny = cy - R + (sw ? sy / sw : pick.j);
    return { ok: true, x: nx, y: ny, dx: nx - x, dy: ny - y, score: pick.v, raison: "" };
  }

  /* pts : [{id, ix, iy}] ; lm : { id: {x, y} } (mètres). Rend [{id, err (m), suspect}] ; err = null s'il y a moins de 5 repères.
     err : écart du repère à la projection calculée SANS lui. Avec peu de repères, un repère faux fausse aussi les autres : « suspect » désigne donc le repère
     dont le retrait rend les autres le plus cohérents (seulement si le gain est net et à partir de 6 repères). */
  /* Un calcul sans les repères restants n'a de sens que s'ils ne sont pas presque alignés (par exemple 4 points sur la ligne de but) :
     il faut au moins 2 repères à plus de 1 m de la droite qui passe par les deux repères les plus éloignés, et à plus de 1 m l'un de l'autre. */
  function degenere(rest, lm) {
    let best = null;
    for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) {
      const d = Math.hypot(lm[rest[i].id].x - lm[rest[j].id].x, lm[rest[i].id].y - lm[rest[j].id].y);
      if (!best || d > best.d) best = { i, j, d };
    }
    if (!best || best.d < 1) return true;
    const A = lm[rest[best.i].id], B = lm[rest[best.j].id], off = [];
    rest.forEach((q, k) => { if (k === best.i || k === best.j) return; const P = lm[q.id]; if (Math.abs((B.x - A.x) * (A.y - P.y) - (A.x - P.x) * (B.y - A.y)) / best.d > 1) off.push(P); });
    return !(off.length >= 2 && off.some((p) => off.some((q) => Math.hypot(p.x - q.x, p.y - q.y) > 1)));
  }
  function pointErrors(pts, lm) {
    if (pts.length < 5) return pts.map((p) => ({ id: p.id, err: null, suspect: false }));
    const fit = (rest) => HG.solve(rest.map((q) => [q.ix, q.iy]), rest.map((q) => [lm[q.id].x, lm[q.id].y]));
    const dist = (H, p) => { const e = HG.apply(H, p.ix, p.iy); return Math.hypot(e[0] - lm[p.id].x, e[1] - lm[p.id].y); };
    const out = pts.map((p, k) => {
      const rest = pts.filter((_q, i) => i !== k);
      if (degenere(rest, lm)) return { id: p.id, err: null, rms: null, suspect: false };
      try {
        const H = fit(rest);
        const rms = rest.length > 4 ? Math.sqrt(rest.reduce((s, q) => s + dist(H, q) ** 2, 0) / rest.length) : null;
        return { id: p.id, err: dist(H, p), rms, suspect: false };
      } catch (_e) { return { id: p.id, err: null, rms: null, suspect: false }; }
    });
    if (pts.length >= 6) {
      const r = out.filter((o) => o.rms != null).sort((x, y) => x.rms - y.rms);
      if (r.length >= 2 && r[0].rms < 0.5 * r[1].rms && r[1].rms > 0.1) r[0].suspect = true;
    }
    return out.map((o) => ({ id: o.id, err: o.err, suspect: o.suspect }));
  }

  return { snap, pointErrors, RAYON, MARGE };
});
