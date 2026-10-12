/* Suivi du mouvement de la caméra (smartphone à la main) : points caractéristiques (Shi-Tomasi),
   flot optique pyramidal de Lucas-Kanade, homographie robuste (RANSAC). Fonctions pures, sans dépendance externe. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./homography"));
  else root.FutsalCamera = factory(root.FutsalHomography);
})(typeof self !== "undefined" ? self : this, function (HG) {
  "use strict";

  /* ---------- images ---------- */
  function rgbaToGray(rgba, w, h) {
    const g = new Float32Array(w * h);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
    return { data: g, w, h };
  }

  function halve(img) {
    const w = Math.max(1, img.w >> 1), h = Math.max(1, img.h >> 1);
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const x0 = Math.min(img.w - 1, x * 2), y0 = Math.min(img.h - 1, y * 2);
        const x1 = Math.min(img.w - 1, x0 + 1), y1 = Math.min(img.h - 1, y0 + 1);
        out[y * w + x] = (img.data[y0 * img.w + x0] + img.data[y0 * img.w + x1] + img.data[y1 * img.w + x0] + img.data[y1 * img.w + x1]) / 4;
      }
    }
    return { data: out, w, h };
  }

  /* Pyramide : niveau 0 = image d'origine. Chaque niveau garde ses gradients (Scharr). */
  function buildPyramid(img, levels) {
    const pyr = [img];
    for (let l = 1; l < levels; l++) {
      const prev = pyr[l - 1];
      if (prev.w < 24 || prev.h < 24) break;
      pyr.push(halve(prev));
    }
    pyr.forEach((im) => { if (!im.gx) addGradients(im); });
    return pyr;
  }

  function addGradients(im) {
    const { w, h, data } = im;
    const gx = new Float32Array(w * h), gy = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        gx[i] = (3 * (data[i - w + 1] - data[i - w - 1]) + 10 * (data[i + 1] - data[i - 1]) + 3 * (data[i + w + 1] - data[i + w - 1])) / 32;
        gy[i] = (3 * (data[i + w - 1] - data[i - w - 1]) + 10 * (data[i + w] - data[i - w]) + 3 * (data[i + w + 1] - data[i - w + 1])) / 32;
      }
    }
    im.gx = gx; im.gy = gy;
  }

  function bilinear(arr, w, h, x, y) {
    if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return NaN;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
    const fx = x - x0, fy = y - y0;
    return (arr[y0 * w + x0] * (1 - fx) + arr[y0 * w + x1] * fx) * (1 - fy) + (arr[y1 * w + x0] * (1 - fx) + arr[y1 * w + x1] * fx) * fy;
  }

  /* ---------- points caractéristiques ---------- */
  /* Shi-Tomasi : plus petite valeur propre du tenseur de structure sur une fenêtre 5x5. mask : Uint8Array (1 = autorisé). */
  function goodFeatures(im, maxCorners, minDist, mask) {
    if (!im.gx) addGradients(im);
    const { w, h, gx, gy } = im;
    const score = new Float32Array(w * h);
    let best = 0;
    const r = 2;
    for (let y = r + 1; y < h - r - 1; y++) {
      for (let x = r + 1; x < w - r - 1; x++) {
        if (mask && !mask[y * w + x]) continue;
        let a = 0, b = 0, c = 0;
        for (let j = -r; j <= r; j++) {
          for (let i = -r; i <= r; i++) {
            const k = (y + j) * w + (x + i);
            a += gx[k] * gx[k]; b += gx[k] * gy[k]; c += gy[k] * gy[k];
          }
        }
        const lam = (a + c - Math.sqrt((a - c) * (a - c) + 4 * b * b)) / 2;
        score[y * w + x] = lam;
        if (lam > best) best = lam;
      }
    }
    if (best <= 0) return [];
    const thr = best * 0.03;
    const idx = [];
    for (let i = 0; i < score.length; i++) if (score[i] > thr) idx.push(i);
    idx.sort((p, q) => score[q] - score[p]);
    const cell = Math.max(2, minDist), gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
    const occ = new Uint8Array(gw * gh);
    const pts = [];
    for (const i of idx) {
      const x = i % w, y = (i / w) | 0;
      const cx = (x / cell) | 0, cy = (y / cell) | 0;
      let free = true;
      for (let j = Math.max(0, cy - 1); j <= Math.min(gh - 1, cy + 1) && free; j++) for (let k = Math.max(0, cx - 1); k <= Math.min(gw - 1, cx + 1); k++) if (occ[j * gw + k]) { free = false; break; }
      if (!free) continue;
      occ[cy * gw + cx] = 1;
      pts.push([x, y]);
      if (pts.length >= maxCorners) break;
    }
    return pts;
  }

  /* ---------- flot optique pyramidal de Lucas-Kanade ---------- */
  function trackPoint(pyrA, pyrB, pt, winMax, iters) {
    const levels = Math.min(pyrA.length, pyrB.length);
    let gx0 = 0, gy0 = 0;
    for (let L = levels - 1; L >= 0; L--) {
      const A = pyrA[L], B = pyrB[L], sc = 1 / (1 << L);
      const win = Math.max(3, Math.min(winMax, Math.floor(Math.min(A.w, A.h) / 8)));
      const px = pt[0] * sc, py = pt[1] * sc;
      // gradients du modèle et matrice G
      let g11 = 0, g12 = 0, g22 = 0;
      const n = (2 * win + 1) * (2 * win + 1);
      const tI = new Float32Array(n), tX = new Float32Array(n), tY = new Float32Array(n);
      let k = 0;
      for (let j = -win; j <= win; j++) {
        for (let i = -win; i <= win; i++, k++) {
          const x = px + i, y = py + j;
          const v = bilinear(A.data, A.w, A.h, x, y);
          if (v !== v) return null;
          const ix = bilinear(A.gx, A.w, A.h, x, y), iy = bilinear(A.gy, A.w, A.h, x, y);
          tI[k] = v; tX[k] = ix; tY[k] = iy;
          g11 += ix * ix; g12 += ix * iy; g22 += iy * iy;
        }
      }
      const det = g11 * g22 - g12 * g12;
      if (det < 1e-3 * n) return null;
      let dx = gx0, dy = gy0;
      for (let it = 0; it < iters; it++) {
        let b1 = 0, b2 = 0;
        k = 0;
        for (let j = -win; j <= win; j++) {
          for (let i = -win; i <= win; i++, k++) {
            const v = bilinear(B.data, B.w, B.h, px + i + dx, py + j + dy);
            if (v !== v) return null;
            const e = tI[k] - v;
            b1 += e * tX[k]; b2 += e * tY[k];
          }
        }
        const ux = (g22 * b1 - g12 * b2) / det, uy = (g11 * b2 - g12 * b1) / det;
        dx += ux; dy += uy;
        if (ux * ux + uy * uy < 1e-4) break;
        if (Math.abs(dx) > 4 * win + 40 || Math.abs(dy) > 4 * win + 40) return null;
      }
      if (L > 0) { gx0 = dx * 2; gy0 = dy * 2; } else { gx0 = dx; gy0 = dy; }
    }
    return [pt[0] + gx0, pt[1] + gy0];
  }

  function trackPoints(pyrA, pyrB, pts, opts) {
    opts = opts || {};
    const win = opts.win || 7, iters = opts.iters || 20;
    return pts.map((p) => trackPoint(pyrA, pyrB, p, win, iters));
  }

  /* ---------- homographie robuste ---------- */
  function rng(seed) {
    let a = seed >>> 0;
    return function () { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  function plausible(H) {
    if (!H || H.some((v) => !isFinite(v))) return false;
    const det = H[0] * H[4] - H[1] * H[3];
    if (det < 0.4 || det > 2.5) return false;
    if (Math.abs(H[6]) > 0.01 || Math.abs(H[7]) > 0.01) return false;
    return true;
  }

  function ransacHomography(src, dst, opts) {
    opts = opts || {};
    const thr = opts.thresh || 2.5, iters = opts.iters || 300;
    const n = src.length;
    if (n < 8) return null;
    const rand = rng(opts.seed || 12345);
    let bestIn = [], bestCount = 0;
    const inliersOf = (H) => {
      const out = [];
      for (let i = 0; i < n; i++) {
        const p = HG.apply(H, src[i][0], src[i][1]);
        if (Math.hypot(p[0] - dst[i][0], p[1] - dst[i][1]) < thr) out.push(i);
      }
      return out;
    };
    for (let it = 0; it < iters; it++) {
      const pick = new Set();
      while (pick.size < 4) pick.add(Math.floor(rand() * n));
      const ids = Array.from(pick);
      let H;
      try { H = HG.solve(ids.map((i) => src[i]), ids.map((i) => dst[i])); } catch (_e) { continue; }
      if (!plausible(H)) continue;
      const inl = inliersOf(H);
      if (inl.length > bestCount) { bestCount = inl.length; bestIn = inl; if (bestCount > n * 0.9 && it > 30) break; }
    }
    if (bestCount < 8) return null;
    let H;
    try { H = HG.solve(bestIn.map((i) => src[i]), bestIn.map((i) => dst[i])); } catch (_e) { return null; }
    if (!plausible(H)) return null;
    const finalIn = inliersOf(H);
    return { H, inliers: finalIn.length, total: n };
  }

  /* ---------- mouvement entre deux images ---------- */
  /* prev, cur : { pyr } ; maskPrev / maskCur : Uint8Array (1 = zone fiable, 0 = joueur à ignorer) de la taille du niveau 0.
     Renvoie { ok, H (prev -> cur, pixels du niveau 0), inliers, total, ratio, reason }. */
  function estimateMotion(prev, cur, maskPrev, maskCur, opts) {
    opts = opts || {};
    const base = prev.pyr[0];
    const pts = goodFeatures(base, opts.maxCorners || 450, opts.minDist || 7, maskPrev);
    if (pts.length < 25) return { ok: false, reason: "Trop peu de détails dans l'image (sol uniforme ?)", inliers: 0, total: pts.length, ratio: 0 };
    const fwd = trackPoints(prev.pyr, cur.pyr, pts, opts);
    const okIdx = [];
    fwd.forEach((q, i) => {
      if (!q) return;
      const x = Math.round(q[0]), y = Math.round(q[1]);
      if (x < 0 || y < 0 || x >= base.w || y >= base.h) return;
      if (maskCur && !maskCur[y * base.w + x]) return;
      okIdx.push(i);
    });
    // contrôle aller-retour : on retient les points qui reviennent à leur place de départ
    const back = trackPoints(cur.pyr, prev.pyr, okIdx.map((i) => fwd[i]), opts);
    const src = [], dst = [];
    okIdx.forEach((i, k) => {
      const b = back[k];
      if (!b) return;
      if (Math.hypot(b[0] - pts[i][0], b[1] - pts[i][1]) > 1.2) return;
      src.push(pts[i]); dst.push(fwd[i]);
    });
    if (src.length < 15) return { ok: false, reason: "Suivi de l'image impossible (mouvement trop rapide ou flou)", inliers: 0, total: src.length, ratio: 0 };
    const r = ransacHomography(src, dst, opts);
    if (!r) return { ok: false, reason: "Mouvement de caméra non estimable", inliers: 0, total: src.length, ratio: 0 };
    const ratio = r.inliers / r.total;
    const ok = r.inliers >= 15 && ratio >= (opts.minRatio || 0.5);
    return { ok, H: r.H, inliers: r.inliers, total: r.total, ratio, reason: ok ? null : "Mouvement de caméra peu fiable" };
  }

  /* Prépare une image pour le suivi : niveau de gris réduit + pyramide + masque des joueurs. */
  function prepare(rgba, w, h, boxes, levels) {
    const img = rgbaToGray(rgba, w, h);
    const mask = new Uint8Array(w * h).fill(1);
    (boxes || []).forEach((b) => {
      const mx = (b[2] - b[0]) * 0.12, my = (b[3] - b[1]) * 0.08;
      const x0 = Math.max(0, Math.floor(b[0] - mx)), x1 = Math.min(w, Math.ceil(b[2] + mx));
      const y0 = Math.max(0, Math.floor(b[1] - my)), y1 = Math.min(h, Math.ceil(b[3] + my));
      for (let y = y0; y < y1; y++) mask.fill(0, y * w + x0, y * w + x1);
    });
    return { pyr: buildPyramid(img, levels || 4), mask, w, h };
  }

  /* Conversion d'une homographie exprimée en pixels réduits (facteur s = réduit / natif) vers les pixels natifs. */
  function toNative(Hs, s) {
    const S = [s, 0, 0, 0, s, 0, 0, 0, 1], Si = [1 / s, 0, 0, 0, 1 / s, 0, 0, 0, 1];
    return HG.mul3(Si, HG.mul3(Hs, S));
  }

  return { rgbaToGray, buildPyramid, goodFeatures, trackPoints, ransacHomography, estimateMotion, prepare, toNative, plausible };
});
