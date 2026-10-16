/* Repérage assisté du terrain : le but (poteaux à bandes de couleur, ou couleur montrée par le coach) est détecté automatiquement, l'utilisateur désigne la ligne des 6 m
   en face du but, et on en déduit la position de la caméra (hauteur, inclinaison, zoom, cap) puis la transformation image → terrain. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./kit"), require("./homography"));
  else root.FutsalCourtFit = factory(root.FutsalKit, root.FutsalHomography);
})(typeof self !== "undefined" ? self : this, function (K, HG) {
  "use strict";

  const WORK_W = 640;
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  /* ---------- image de travail (réduite, en Lab) ---------- */
  function prepare(img, targetW) {
    const tw = Math.min(targetW || WORK_W, img.width), s = tw / img.width;
    const w = tw, h = Math.max(2, Math.round(img.height * s));
    const acc = new Float32Array(w * h * 3), cnt = new Float32Array(w * h);
    for (let y = 0; y < img.height; y++) {
      const ty = Math.min(h - 1, Math.floor(y * s));
      for (let x = 0; x < img.width; x++) {
        const tx = Math.min(w - 1, Math.floor(x * s)), i = (y * img.width + x) * 4, o = ty * w + tx;
        acc[o * 3] += img.data[i]; acc[o * 3 + 1] += img.data[i + 1]; acc[o * 3 + 2] += img.data[i + 2]; cnt[o]++;
      }
    }
    const L = new Float32Array(w * h), A = new Float32Array(w * h), B = new Float32Array(w * h);
    for (let o = 0; o < w * h; o++) {
      const n = cnt[o] || 1, lab = K.rgbToLab(acc[o * 3] / n, acc[o * 3 + 1] / n, acc[o * 3 + 2] / n);
      L[o] = lab[0]; A[o] = lab[1]; B[o] = lab[2];
    }
    return { w, h, L, A, B, scale: s };
  }

  /* ---------- couleurs de lignes ---------- */
  const COLORS = {
    black: { name: "Noir", hex: "#111111", sim: (L, a, b) => clamp01((55 - L) / 30) * (Math.hypot(a, b) < 30 ? 1 : 0.5) },
    white: { name: "Blanc", hex: "#f2f2f2", sim: (L, a, b) => clamp01((L - 55) / 30) * (Math.hypot(a, b) < 30 ? 1 : 0.5) },
    yellow: { name: "Jaune", hex: "#f2c200", sim: (L, a, b) => clamp01((b - 25) / 40) * (L > 50 ? 1 : 0.4) },
    red: { name: "Rouge", hex: "#d9362b", sim: (L, a, b) => clamp01((a - 20) / 35) * (L > 25 ? 1 : 0.4) }
  };

  function gauss(src, w, h, sigma) {
    const r = Math.max(1, Math.ceil(sigma * 3)), k = [];
    let sum = 0;
    for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); sum += v; }
    for (let i = 0; i < k.length; i++) k[i] /= sum;
    const t = new Float32Array(w * h), o = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let a = 0;
      for (let d = -r; d <= r; d++) a += src[y * w + Math.min(w - 1, Math.max(0, x + d))] * k[d + r];
      t[y * w + x] = a;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let a = 0;
      for (let d = -r; d <= r; d++) a += t[Math.min(h - 1, Math.max(0, y + d)) * w + x] * k[d + r];
      o[y * w + x] = a;
    }
    return o;
  }

  /* Carte des traits fins de la couleur choisie : { w, h, R (0..1), mask (1 = trait net) }. */
  function ridgeMap(work, colorKey) {
    const { w, h, L, A, B } = work, f = COLORS[colorKey].sim;
    const s = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) s[i] = f(L[i], A[i], B[i]);
    const g = gauss(s, w, h, 1.5 * (w / 960));
    const R = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const ixx = g[i + 1] - 2 * g[i] + g[i - 1], iyy = g[i + w] - 2 * g[i] + g[i - w], ixy = (g[i + w + 1] - g[i + w - 1] - g[i - w + 1] + g[i - w - 1]) / 4;
      const tr = ixx + iyy, det = ixx * iyy - ixy * ixy, disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
      R[i] = Math.max(0, -(tr / 2 - disc));
    }
    const sorted = Float32Array.from(R).sort();
    const p99 = Math.max(1e-6, sorted[Math.floor(sorted.length * 0.99)]);
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < R.length; i++) { const v = Math.min(1, R[i] / (p99 * 1.2)); R[i] = v; mask[i] = v >= 0.6 ? 1 : 0; }
    return { w, h, R, mask };
  }

  /* Couleurs de traits présentes dans la partie basse de l'image : [{ key, name, hex, share }], les plus présentes d'abord. */
  function colorCandidates(work) {
    const y0 = Math.floor(work.h * 0.3), area = work.w * (work.h - y0), out = [];
    Object.keys(COLORS).forEach((key) => {
      const m = ridgeMap(work, key).mask;
      let n = 0;
      for (let y = y0; y < work.h; y++) for (let x = 0; x < work.w; x++) n += m[y * work.w + x];
      out.push({ key, name: COLORS[key].name, hex: COLORS[key].hex, share: n / area });
    });
    return out.filter((c) => c.share >= 0.004).sort((a, b) => b.share - a.share);
  }

  /* Ramène un clic sur le trait le plus proche (dans un rayon donné) ; sinon renvoie le clic tel quel. */
  function snapToRidge(rm, u, v, radius) {
    let best = null;
    const r = radius || 10;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = Math.round(u + dx), y = Math.round(v + dy);
      if (x < 1 || y < 1 || x >= rm.w - 1 || y >= rm.h - 1) continue;
      const d = Math.hypot(dx, dy);
      if (d > r) continue;
      const sc = rm.R[y * rm.w + x] - d * 0.02;
      if (rm.mask[y * rm.w + x] && (!best || sc > best.sc)) best = { u: x, v: y, sc };
    }
    return best ? { u: best.u, v: best.v, snapped: true } : { u, v, snapped: false };
  }

  /* ---------- modèle du terrain ---------- */
  function arcPts(cx, cy, r, a0, a1, step) {
    const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * Math.PI / 180 * r) / step)), out = [];
    for (let i = 0; i <= n; i++) { const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return out;
  }
  function segPts(x0, y0, x1, y1, step) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step)), out = [];
    for (let i = 0; i <= n; i++) out.push([x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
    return out;
  }
  /* Lignes du terrain L×W (mètres, repère à y vers le haut) : [x, y, poids]. Poids 1 = ligne pleine, 0,5 = pointillés (9 m). */
  function modelPoints(L, W, opts) {
    const step = (opts && opts.step) || 0.35, cy = W / 2, post = 1.5, pts = [];
    const add = (list, w) => list.forEach((p) => pts.push([p[0], p[1], w]));
    add(segPts(0, 0, L, 0, step), 1); add(segPts(L, 0, L, W, step), 1); add(segPts(L, W, 0, W, step), 1); add(segPts(0, W, 0, 0, step), 1);
    add(segPts(L / 2, 0, L / 2, W, step), 1);
    [0, 1].forEach((end) => {
      const sgn = end ? -1 : 1, x0 = end ? L : 0;
      add(arcPts(0, 0, 6, 0, 90, step).map((p) => [x0 + sgn * p[0], cy + post + p[1]]), 1);
      add(arcPts(0, 0, 6, 0, -90, step).map((p) => [x0 + sgn * p[0], cy - post + p[1]]), 1);
      add(segPts(x0 + sgn * 6, cy - post, x0 + sgn * 6, cy + post, step), 1);
      if (!opts || opts.dashed !== false) {
        add(arcPts(0, 0, 9, 0, 90, step).map((p) => [x0 + sgn * p[0], cy + post + p[1]]), 0.5);
        add(arcPts(0, 0, 9, 0, -90, step).map((p) => [x0 + sgn * p[0], cy - post + p[1]]), 0.5);
        add(segPts(x0 + sgn * 9, cy - post, x0 + sgn * 9, cy + post, step), 0.5);
      }
    });
    return pts;
  }

  /* ---------- caméra ---------- */
  /* pose = [cx, cy, h, cap°, inclinaison°, champ horizontal°] : caméra en (cx,cy,h), cap = direction horizontale visée (0° = vers +x,
     90° = vers +y), inclinaison = angle vers le bas, sans roulis. Repère du sol : x vers la droite du terrain, y vers le haut (droit). */
  function cameraBasis(pose) {
    const [cx, cy, h, yaw, pitch] = pose, ya = (yaw * Math.PI) / 180, pa = (pitch * Math.PI) / 180;
    const fx = Math.cos(pa) * Math.cos(ya), fy = Math.cos(pa) * Math.sin(ya), fz = -Math.sin(pa);
    const rx = Math.sin(ya), ry = -Math.cos(ya), rz = 0;
    const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
    return { c: [cx, cy, h], f: [fx, fy, fz], r: [rx, ry, rz], u: [ux, uy, uz] };
  }
  function focalPx(w, hfovDeg) { return (w / 2) / Math.tan((hfovDeg * Math.PI) / 360); }

  /* Projette un point (x, y, z) du monde : { u, v, z } en pixels de l'image de travail (z = profondeur). null si derrière la caméra. */
  function project(B, f, w, h, x, y, z) {
    const dx = x - B.c[0], dy = y - B.c[1], dz = (z || 0) - B.c[2];
    const zc = dx * B.f[0] + dy * B.f[1] + dz * B.f[2];
    if (zc < 0.3) return null;
    const xc = dx * B.r[0] + dy * B.r[1] + dz * B.r[2], yc = dx * B.u[0] + dy * B.u[1] + dz * B.u[2];
    return { u: w / 2 + (f * xc) / zc, v: h / 2 - (f * yc) / zc, z: zc };
  }

  /* Point du sol vu par le pixel (u, v) : [x, y] ou null (au-dessus de l'horizon). */
  function groundAt(B, f, w, h, u, v) {
    const xn = (u - w / 2) / f, yn = -(v - h / 2) / f;
    const dx = B.f[0] + xn * B.r[0] + yn * B.u[0], dy = B.f[1] + xn * B.r[1] + yn * B.u[1], dz = B.f[2] + xn * B.r[2] + yn * B.u[2];
    if (dz >= -0.02) return null;
    const t = B.c[2] / -dz;
    return t > 400 ? null : [B.c[0] + dx * t, B.c[1] + dy * t];
  }

  /* Recherche par motifs générique : maximise fn(pose) sous les bornes lo/hi. */
  function patternSearch(pose, fn, lo, hi, steps0, iters) {
    let best = pose.slice(), bs = fn(best);
    const steps = steps0.slice();
    for (let it = 0; it < iters; it++) {
      let improved = false;
      for (let d = 0; d < best.length; d++) for (const sg of [1, -1]) {
        if (!steps[d]) continue;
        const c = best.slice(); c[d] += sg * steps[d];
        if (c[d] < lo[d] || c[d] > hi[d]) continue;
        const sc = fn(c);
        if (sc > bs + 1e-12) { bs = sc; best = c; improved = true; }
      }
      if (!improved) { for (let d = 0; d < steps.length; d++) steps[d] *= 0.6; if (Math.max(...steps) < 1e-3) break; }
    }
    return { pose: best, score: bs };
  }

  /* Erreur relative entre tête observée et tête prédite (1,75 m au-dessus des pieds), médiane sur les joueurs. people : [{ fu, fv, hu, hv }]. */
  function peopleError(pose, people, w, h) {
    if (!people || !people.length) return 0;
    const B = cameraBasis(pose), f = focalPx(w, pose[5]), errs = [];
    for (const p of people) {
      const g = groundAt(B, f, w, h, p.fu, p.fv);
      if (!g) { errs.push(1); continue; }
      const q = project(B, f, w, h, g[0], g[1], 1.75), size = Math.max(8, p.fv - p.hv);
      errs.push(q ? Math.min(1, Math.hypot(q.u - p.hu, q.v - p.hv) / size) : 1);
    }
    errs.sort((a, b) => a - b);
    return errs[Math.floor(errs.length / 2)];
  }

  /* Résolution d'un petit système linéaire (Gauss, pivot partiel). */
  function solveSmall(A, b) {
    const n = b.length, M = A.map((r, i) => r.concat([b[i]]));
    for (let i = 0; i < n; i++) {
      let p = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
      if (Math.abs(M[p][i]) < 1e-12) return null;
      [M[i], M[p]] = [M[p], M[i]];
      for (let r = i + 1; r < n; r++) { const f = M[r][i] / M[i][i]; for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c]; }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) { let v = M[i][n]; for (let c = i + 1; c < n; c++) v -= M[i][c] * x[c]; x[i] = v / M[i][i]; }
    return x;
  }

  /* Moindres carrés non linéaires (Levenberg–Marquardt, jacobien numérique) sur la pose [cx,cy,h,cap,inclinaison,champ].
     resid(pose) -> tableau de résidus ; free : indices des paramètres libres ; lo/hi : bornes. */
  function levenberg(pose, resid, free, lo, hi, iters) {
    let p = pose.slice(), r = resid(p), cost = r.reduce((s, v) => s + v * v, 0), lambda = 1e-2;
    const eps = [1e-3, 1e-3, 1e-3, 1e-3, 1e-3, 1e-3];
    for (let it = 0; it < (iters || 60); it++) {
      const J = free.map((d) => { const q = p.slice(); q[d] += eps[d]; const r2 = resid(q); return r2.map((v, i) => (v - r[i]) / eps[d]); });
      const n = free.length, A = Array.from({ length: n }, () => new Array(n).fill(0)), g = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) { let s = 0; for (let k = 0; k < r.length; k++) s += J[i][k] * J[j][k]; A[i][j] = s; }
        let s = 0; for (let k = 0; k < r.length; k++) s += J[i][k] * r[k]; g[i] = -s;
      }
      let improved = false;
      for (let tries = 0; tries < 8; tries++) {
        const Ad = A.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lambda) + 1e-9 : v)));
        const dx = solveSmall(Ad, g);
        if (!dx) { lambda *= 10; continue; }
        const q = p.slice();
        free.forEach((d, i) => { q[d] = Math.max(lo[d], Math.min(hi[d], q[d] + dx[i])); });
        const r2 = resid(q), c2 = r2.reduce((s, v) => s + v * v, 0);
        if (c2 < cost) { p = q; r = r2; cost = c2; lambda = Math.max(1e-6, lambda / 3); improved = true; break; }
        lambda *= 5;
      }
      if (!improved) break;
    }
    return { pose: p, cost };
  }

  /* ---------- pose à partir du but et de points de la ligne des 6 m ---------- */
  /* goal = { left: {u, v0, v1}, right: {...} } (pixels de l'image de travail). Le but est sur la ligne x = 0 (x = L si atEnd).
     extra = [{ x, y, u, v }] : points du sol connus (x = distance à la ligne de but, y = position latérale ; y = W/2 : face au but).
     Retourne { pose, err (px), peopleErr }. */
  function poseFromGoal(goal, w, h, L, W, atEnd, people, extra, fixedFov) {
    const cy = W / 2, xg = atEnd ? L : 0;
    const gy = atEnd ? [cy + 1.5, cy - 1.5] : [cy - 1.5, cy + 1.5];
    const world = [[xg, gy[0], 0], [xg, gy[1], 0], [xg, gy[0], 2], [xg, gy[1], 2]];
    const img = [[goal.left.u, goal.left.v1], [goal.right.u, goal.right.v1], [goal.left.u, goal.left.v0], [goal.right.u, goal.right.v0]];
    (extra || []).forEach((e) => { world.push([atEnd ? L - e.x : e.x, atEnd ? W - e.y : e.y, 0]); img.push([e.u, e.v]); });
    const scale = Math.max(10, ((goal.left.v1 - goal.left.v0) + (goal.right.v1 - goal.right.v0)) / 2);
    const resid = (pose) => {
      const B = cameraBasis(pose), f = focalPx(w, pose[5]), out = [];
      for (let i = 0; i < world.length; i++) {
        const p = project(B, f, w, h, world[i][0], world[i][1], world[i][2]);
        if (!p) { out.push(500, 500); continue; }
        out.push(p.u - img[i][0], p.v - img[i][1]);
      }
      // a priori faible : champ horizontal courant des smartphones (60–85°), hauteur 2–12 m
      const f0 = pose[5];
      out.push(f0 < 58 ? (58 - f0) * 0.5 : f0 > 88 ? (f0 - 88) * 0.5 : 0);
      return out;
    };
    const rms = (pose) => { const B = cameraBasis(pose), f = focalPx(w, pose[5]); let e = 0; for (let i = 0; i < world.length; i++) { const p = project(B, f, w, h, world[i][0], world[i][1], world[i][2]); e += p ? Math.hypot(p.u - img[i][0], p.v - img[i][1]) : 500; } return e / world.length; };
    const lo = [-40, -40, 1.5, -720, 3, fixedFov || 45], hi = [L + 40, W + 40, 14, 720, 85, fixedFov || 100];
    const free = fixedFov ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5];
    const dir0 = atEnd ? 0 : 180, starts = [];
    for (const yaw of [-30, -15, 0, 15, 30]) for (let dist = 5; dist <= 45; dist += 5) for (const lat of [-12, -6, 0, 6, 12]) for (const hh of [3, 5, 8]) for (const pitch of [10, 25, 40]) for (const fov of fixedFov ? [fixedFov] : [62, 75, 90]) {
      starts.push([atEnd ? xg - dist : xg + dist, cy + lat, hh, dir0 + yaw, pitch, fov]);
    }
    const objective = (p) => { const r = resid(p); return r.reduce((s, v) => s + v * v, 0); };
    const scored = starts.map((p) => ({ p, c: objective(p) })).sort((a, b) => a.c - b.c).slice(0, 16);
    let best = null;
    scored.forEach((t) => {
      const r = levenberg(t.p, resid, free, lo, hi, 80);
      if (!best || r.cost < best.cost) best = r;
    });
    return { pose: best.pose, err: rms(best.pose), peopleErr: peopleError(best.pose, people, w, h), scale, errFn: (p) => rms(p) / scale };
  }

  /* ---------- affinage par les lignes ---------- */
  /* Transformée en distance : distance (px) au trait le plus proche, chanfrein 3-4. */
  function distanceTransform(mask, w, h) {
    const INF = 1e9, d = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) d[i] = mask[i] ? 0 : INF;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 3);
      if (y > 0) { v = Math.min(v, d[i - w] + 3); if (x > 0) v = Math.min(v, d[i - w - 1] + 4); if (x < w - 1) v = Math.min(v, d[i - w + 1] + 4); }
      d[i] = v;
    }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x; let v = d[i];
      if (x < w - 1) v = Math.min(v, d[i + 1] + 3);
      if (y < h - 1) { v = Math.min(v, d[i + w] + 3); if (x < w - 1) v = Math.min(v, d[i + w + 1] + 4); if (x > 0) v = Math.min(v, d[i + w - 1] + 4); }
      d[i] = v;
    }
    for (let i = 0; i < w * h; i++) d[i] = Math.min(d[i] / 3, 80);
    return d;
  }

  /* Part (pondérée) des points du modèle visibles qui tombent près d'un trait ; 0 si trop peu de points visibles. */
  function lineScore(pose, D, w, h, pts, totalW, cap) {
    const B = cameraBasis(pose), f = focalPx(w, pose[5]);
    let s = 0, vis = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = project(B, f, w, h, pts[i][0], pts[i][1], 0);
      if (!p || p.u < 0 || p.v < 0 || p.u >= w - 1 || p.v >= h - 1) continue;
      s += pts[i][2] * (1 - Math.min(D[(p.v | 0) * w + (p.u | 0)], cap) / cap); vis += pts[i][2];
    }
    return vis < totalW * 0.2 ? 0 : s / totalW;
  }

  /* ---------- calibrage prêt à l'emploi ---------- */
  /* Repères du terrain (identifiants de HG.landmarks) visibles dans l'image, d'après H (pixels vidéo -> terrain). */
  function pointsFromH(H, L, W, vw, vh) {
    const Hi = HG.invert(H), out = [];
    HG.landmarks(L, W).forEach((lm) => {
      const p = HG.apply(Hi, lm.x, lm.y);
      if (isFinite(p[0]) && isFinite(p[1]) && p[0] >= 4 && p[1] >= 4 && p[0] <= vw - 4 && p[1] <= vh - 4) out.push({ id: lm.id, ix: p[0], iy: p[1] });
    });
    return out;
  }

  /* Transforme une pose en calibrage de l'application : { H (pixels vidéo -> terrain, y vers le bas), points, err (m) }.
     vw/vh : taille réelle de la vidéo ; w/h : taille de l'image de travail. Le but repéré est sur la ligne x = 0. */
  function calibrationFromPose(pose, w, h, vw, vh, L, W, errPx, sepPx) {
    const B = cameraBasis(pose), f = focalPx(w, pose[5]), k = vw / w;
    const src = [], dst = [];
    for (let i = 1; i <= 9; i++) for (let j = 1; j <= 9; j++) {
      const u = (w * i) / 10, v = (h * j) / 10, g = groundAt(B, f, w, h, u, v);
      if (!g || g[0] < -15 || g[0] > L + 15 || g[1] < -15 || g[1] > W + 15) continue;
      src.push([u * k, v * k]); dst.push([g[0], W - g[1]]);
    }
    if (src.length < 8) throw new Error("Le terrain n'est pas assez visible dans cette image.");
    const H = HG.solve(src, dst);
    return { H, points: pointsFromH(H, L, W, vw, vh), err: Math.max(0.05, Math.min(1.4, (errPx * 3) / Math.max(10, sepPx))) };
  }

  /* Le but repéré est celui que l'équipe attaque (x = L) : on fait tourner le terrain d'un demi-tour (x -> L-x, y -> W-y). */
  function rotateCalibration(cal, L, W, vw, vh) {
    const H = HG.mul3([-1, 0, L, 0, -1, W, 0, 0, 1], cal.H);
    return { H, points: pointsFromH(H, L, W, vw, vh), err: cal.err };
  }

  return { WORK_W, COLORS, prepare, ridgeMap, colorCandidates, snapToRidge, modelPoints, cameraBasis, focalPx, project, groundAt, patternSearch, peopleError, poseFromGoal, distanceTransform, lineScore, calibrationFromPose, rotateCalibration, pointsFromH };
});
