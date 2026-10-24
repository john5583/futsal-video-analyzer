/* Appariement de points caractéristiques (type ORB) entre deux images éloignées : coins FAST sur plusieurs échelles, orientation, descripteur
   binaire de 256 bits, appariement par distance de Hamming, homographie robuste. Sert quand le suivi image par image (Lucas-Kanade) décroche
   (flou, zoom, balayage rapide) : il retrouve le mouvement de la caméra entre deux images qui ne se ressemblent plus point à point.
   Fonctions pures, sans dépendance externe hormis camera.js (homographie robuste). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./camera"), require("./homography"));
  else root.FutsalOrb = factory(root.FutsalCamera, root.FutsalHomography);
})(typeof self !== "undefined" ? self : this, function (Cam, HG) {
  "use strict";

  const SCALE = Math.SQRT2;          // facteur entre deux échelles
  const LEVELS = 6;
  const FAST_T = 9;                  // contraste minimal d'un coin (sur 255)
  const BORDER = 20;                 // marge pour lire le descripteur
  const CELL = 24;                   // un seul meilleur coin par cellule de CELL px (répartition régulière)
  const MAX_PTS = 1000;
  const PATCH_R = 15;
  const PAIRS = (() => {
    // 256 paires de décalages pseudo-aléatoires (gaussiennes), toujours les mêmes
    let a = 0x9e3779b9;
    const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const g = () => { const u = Math.max(1e-9, rnd()), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const clamp = (v) => Math.max(-PATCH_R, Math.min(PATCH_R, Math.round(v * 5.5)));
    const out = new Int8Array(256 * 4);
    for (let i = 0; i < 256; i++) { out[i * 4] = clamp(g()); out[i * 4 + 1] = clamp(g()); out[i * 4 + 2] = clamp(g()); out[i * 4 + 3] = clamp(g()); }
    return out;
  })();
  const CIRCLE = [[0, -3], [1, -3], [2, -2], [3, -1], [3, 0], [3, 1], [2, 2], [1, 3], [0, 3], [-1, 3], [-2, 2], [-3, 1], [-3, 0], [-3, -1], [-2, -2], [-1, -3]];

  function blur3(img) {
    const { w, h, data } = img, out = new Float32Array(w * h), tmp = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x, l = x > 0 ? data[i - 1] : data[i], r = x < w - 1 ? data[i + 1] : data[i]; tmp[i] = (l + 2 * data[i] + r) / 4; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x, u = y > 0 ? tmp[i - w] : tmp[i], d = y < h - 1 ? tmp[i + w] : tmp[i]; out[i] = (u + 2 * tmp[i] + d) / 4; }
    return { data: out, w, h };
  }

  /* Image réduite d'un facteur s (échantillonnage bilinéaire sur l'image déjà adoucie). */
  function resample(img, s) {
    const w = Math.max(8, Math.floor(img.w / s)), h = Math.max(8, Math.floor(img.h / s)), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const sy = Math.min(img.h - 1.001, y * s), y0 = Math.floor(sy), fy = sy - y0;
      for (let x = 0; x < w; x++) {
        const sx = Math.min(img.w - 1.001, x * s), x0 = Math.floor(sx), fx = sx - x0, i = y0 * img.w + x0;
        out[y * w + x] = (img.data[i] * (1 - fx) + img.data[i + 1] * fx) * (1 - fy) + (img.data[i + img.w] * (1 - fx) + img.data[i + img.w + 1] * fx) * fy;
      }
    }
    return { data: out, w, h };
  }

  /* Coins FAST-9 d'une image : score = somme des écarts sur les points du cercle qui dépassent le seuil. */
  function fastCorners(img, t) {
    const { w, h, data } = img, out = [];
    const off = CIRCLE.map(([dx, dy]) => dy * w + dx);
    for (let y = BORDER; y < h - BORDER; y++) {
      for (let x = BORDER; x < w - BORDER; x++) {
        const i = y * w + x, p = data[i];
        // test rapide : parmi les points 0, 4, 8, 12 au moins 3 doivent être plus clairs ou plus sombres
        let br = 0, dk = 0;
        for (let k = 0; k < 16; k += 4) { const v = data[i + off[k]]; if (v > p + t) br++; else if (v < p - t) dk++; }
        if (br < 3 && dk < 3) continue;
        let run = 0, best = 0, score = 0, sign = 0;
        // 9 points consécutifs plus clairs (sign 1) ou plus sombres (sign -1)
        for (let s = 1; s >= -1; s -= 2) {
          run = 0; let sc = 0, bestRun = 0, runSc = 0;
          for (let k = 0; k < 32; k++) {
            const v = data[i + off[k & 15]], d = s * (v - p) - t;
            if (d > 0) { run++; runSc += d; if (run > bestRun) { bestRun = run; sc = runSc; } } else { run = 0; runSc = 0; }
          }
          if (bestRun >= 9 && sc > score) { score = sc; sign = s; best = bestRun; }
        }
        if (best >= 9) out.push({ x, y, score });
      }
    }
    return out;
  }

  function orientation(img, x, y) {
    let m01 = 0, m10 = 0;
    for (let dy = -12; dy <= 12; dy++) {
      const span = Math.floor(Math.sqrt(144 - dy * dy));
      for (let dx = -span; dx <= span; dx++) { const v = img.data[(y + dy) * img.w + x + dx]; m10 += dx * v; m01 += dy * v; }
    }
    return Math.atan2(m01, m10);
  }

  function popcount(v) { v -= (v >>> 1) & 0x55555555; v = (v & 0x33333333) + ((v >>> 2) & 0x33333333); return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; }

  /* Points et descripteurs d'une image grise { data (Float32Array), w, h }. mask : Uint8Array (1 = zone fiable) de la même taille, ou null.
     Renvoie { n, x, y, desc (Uint32Array, 8 mots par point), w, h }. Coordonnées dans l'image d'origine. */
  function describe(gray, mask, opts) {
    const o = opts || {}, t = o.threshold || FAST_T, maxPts = o.maxPoints || MAX_PTS;
    const base = { data: gray.data, w: gray.w, h: gray.h }, picks = [];
    for (let l = 0; l < LEVELS; l++) {
      const s = Math.pow(SCALE, l), img = l === 0 ? base : resample(base, s);
      if (img.w < 2 * BORDER + 10 || img.h < 2 * BORDER + 10) break;
      const sm = blur3(img);
      const cs = fastCorners(img, t);   // détection sur l'image non adoucie (les lignes fines du terrain sont peu contrastées)
      // un seul coin par cellule (le plus fort) pour répartir les points sur toute l'image
      const cell = new Map();
      cs.forEach((c) => {
        const ox = c.x * s, oy = c.y * s;
        if (mask) { const mx = Math.min(gray.w - 1, Math.round(ox)), my = Math.min(gray.h - 1, Math.round(oy)); if (!mask[my * gray.w + mx]) return; }
        const key = Math.floor(c.x / (CELL / 2)) + "," + Math.floor(c.y / (CELL / 2));
        const old = cell.get(key);
        if (!old || c.score > old.score) cell.set(key, c);
      });
      cell.forEach((c) => picks.push({ c, l, s, img: sm }));
    }
    picks.sort((a, b) => b.c.score * (1 + 0.05 * (LEVELS - b.l)) - a.c.score * (1 + 0.05 * (LEVELS - a.l)));
    const sel = picks.slice(0, maxPts), n = sel.length;
    const X = new Float32Array(n), Y = new Float32Array(n), D = new Uint32Array(n * 8);
    let m = 0;
    sel.forEach((p) => {
      const { c, s, img } = p, ang = orientation(img, c.x, c.y), ca = Math.cos(ang), sa = Math.sin(ang);
      const at = (dx, dy) => {
        const rx = Math.round(c.x + ca * dx - sa * dy), ry = Math.round(c.y + sa * dx + ca * dy);
        return img.data[ry * img.w + rx];
      };
      if (c.x < PATCH_R * 1.5 + 2 || c.y < PATCH_R * 1.5 + 2 || c.x > img.w - PATCH_R * 1.5 - 2 || c.y > img.h - PATCH_R * 1.5 - 2) return;
      for (let b = 0; b < 256; b++) {
        const v = at(PAIRS[b * 4], PAIRS[b * 4 + 1]) < at(PAIRS[b * 4 + 2], PAIRS[b * 4 + 3]) ? 1 : 0;
        if (v) D[m * 8 + (b >> 5)] |= (1 << (b & 31));
      }
      X[m] = c.x * s; Y[m] = c.y * s; m++;
    });
    return { n: m, x: X.subarray(0, m), y: Y.subarray(0, m), desc: D.subarray(0, m * 8), w: gray.w, h: gray.h };
  }

  /* Appariements A -> B : meilleur voisin à moins de 64 bits d'écart, nettement meilleur que le deuxième (ratio) et réciproque. */
  function matches(A, B, opts) {
    const ratio = (opts && opts.ratio) || 0.8, maxD = (opts && opts.maxDistance) || 64;
    const best = (P, Q, i) => {
      let b1 = 999, b2 = 999, bj = -1;
      for (let j = 0; j < Q.n; j++) {
        let d = 0;
        for (let k = 0; k < 8; k++) d += popcount((P.desc[i * 8 + k] ^ Q.desc[j * 8 + k]) >>> 0);
        if (d < b1) { b2 = b1; b1 = d; bj = j; } else if (d < b2) b2 = d;
      }
      return { j: bj, d: b1, d2: b2 };
    };
    const back = new Int32Array(B.n).fill(-1), backD = new Int32Array(B.n).fill(999);
    for (let j = 0; j < B.n; j++) { const r = best(B, A, j); back[j] = r.j; backD[j] = r.d; }
    const out = [];
    for (let i = 0; i < A.n; i++) {
      const r = best(A, B, i);
      if (r.j < 0 || r.d > maxD || r.d >= ratio * r.d2) continue;
      if (back[r.j] !== i) continue;
      out.push([i, r.j]);
    }
    return out;
  }

  /* Mouvement entre deux images décrites : { ok, H (A -> B, pixels de l'image d'origine), inliers, total, ratio, reason }.
     Accepté seulement avec assez d'appariements concordants, répartis sur l'image, et qui ne sont pas le décor fixe de la caméra
     (rambarde, cadre : points qui ne bougent pas d'une image à l'autre). */
  function estimate(A, B, opts) {
    const o = Object.assign({ minInliers: 25, minRatio: 0.35, thresh: 3, iters: 600 }, opts || {});
    if (A.n < 40 || B.n < 40) return { ok: false, inliers: 0, total: 0, ratio: 0, reason: "Trop peu de points caractéristiques" };
    const ms = matches(A, B, o);
    if (ms.length < o.minInliers) return { ok: false, inliers: 0, total: ms.length, ratio: 0, reason: "Trop peu d'appariements entre les deux images" };
    let src = ms.map(([i]) => [A.x[i], A.y[i]]), dst = ms.map(([, j]) => [B.x[j], B.y[j]]);
    // le décor fixe de la caméra (rambarde, bord de l'écran) donne des appariements immobiles : écartés quand ils sont nombreux
    const still = src.map((p, k) => Math.hypot(p[0] - dst[k][0], p[1] - dst[k][1]) < 1.5);
    const nStill = still.filter(Boolean).length;
    if (!o.keepStill && nStill >= 0.25 * src.length && nStill >= 8) { src = src.filter((_, k) => !still[k]); dst = dst.filter((_, k) => !still[k]); }
    if (src.length < o.minInliers) return { ok: false, inliers: 0, total: src.length, ratio: 0, reason: "Trop peu d'appariements mobiles" };
    const r = Cam.ransacHomography(src, dst, { thresh: o.thresh, iters: o.iters, seed: o.seed || 777 });
    if (!r) return { ok: false, inliers: 0, total: src.length, ratio: 0, reason: "Mouvement de caméra non estimable" };
    const ratio = r.inliers / r.total;
    // répartition : les concordants ne doivent pas tous être au même endroit
    const inl = src.filter((p, k) => { const q = HG.apply(r.H, p[0], p[1]); return Math.hypot(q[0] - dst[k][0], q[1] - dst[k][1]) < o.thresh; });
    const cells = new Set(inl.map((p) => Math.floor((p[0] / A.w) * 3) + 3 * Math.floor((p[1] / A.h) * 3)));
    const ok = r.inliers >= o.minInliers && ratio >= o.minRatio && cells.size >= 3;
    return { ok, H: r.H, inliers: r.inliers, total: r.total, ratio, cells: cells.size, reason: ok ? null : "Appariement peu fiable" };
  }

  /* Pour une image préparée par camera.prepare (pyr[0] = image grise, mask = zone hors joueurs) : points décrits une seule fois puis gardés. */
  function describePrepared(p) { if (!p.orb) p.orb = describe(p.pyr[0], p.mask); return p.orb; }
  function estimateBetween(a, b, opts) { return estimate(describePrepared(a), describePrepared(b), opts); }

  return { describe, describePrepared, matches, estimate, estimateBetween, fastCorners, LEVELS };
});
