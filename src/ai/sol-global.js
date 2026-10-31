/* Position de la caméra par rapport au SOL, image par image, sur toute la vidéo (analyse hors ligne).
   Pourquoi : le suivi image par image dérive, et le suivi « en direct » perd le terrain après un balayage rapide ou un long passage sans lignes.
   Ici on garde le suivi image par image (très précis à courte distance) comme squelette, puis on le « boucle » :
   des images clés tous les `pasCle` images sont raccordées entre elles (a) par un recalage direct sur les LIGNES du sol (toutes couleurs),
   (b) par des liens ORB cherchés à l'aveugle entre images éloignées (la caméra revoit les mêmes lignes), chaque lien n'étant gardé que si
   les lignes d'une image retombent sur les lignes de l'autre. Un ajustement robuste donne la position de chaque clé, les autres images sont
   recalées sur leurs clés voisines, puis un filtre temporel appuyé sur le suivi écarte les positions isolées.
   Chaque image reçoit enfin un VERDICT : « ok » seulement si ses lignes, reportées dans au moins 2 images éloignées dans le temps, retombent
   sur des lignes (≥ seuil) ; sinon « incertain » : le programme ne doit alors rien tracer (jamais inventer).
   Images attendues : 480×270 RGBA. G[k] = homographie (coordonnées normalisées) de l'image 0 vers l'image k : n_k ~ G[k] · n_0. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./homography"), require("./camera"), require("./orb"), require("./court-fit"));
  else root.FutsalSolGlobal = factory(root.FutsalHomography, root.FutsalCamera, root.FutsalOrb, root.FutsalCourtFit);
})(typeof self !== "undefined" ? self : this, function (HG, Cam, Orb, CF) {
  "use strict";

  const mul = HG.mul3, inv = HG.invert, ap = HG.apply;
  const W0 = 480, H0 = 270, W = 240, HH = 135, NIV = 3;          // image d'entrée, carte de lignes de travail, niveaux de pyramide
  const FOV = 91;                                                 // sert seulement à normaliser les coordonnées (conditionnement), pas à la géométrie
  const F480 = (W0 / 2) / Math.tan((FOV * Math.PI) / 360), F0 = (W / 2) / Math.tan((FOV * Math.PI) / 360);
  const Nm = [1 / F480, 0, -W0 / 2 / F480, 0, 1 / F480, -H0 / 2 / F480, 0, 0, 1], Ni = inv(Nm);
  const COINS = [[0, 0], [0.5, 0.25], [-0.5, 0.25], [0.5, -0.25], [-0.5, -0.25]];
  const IDENT = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const norm9 = (M) => M.map((v) => v / M[8]);
  const versNorm = (H) => norm9(mul(mul(Nm, H), Ni));

  /* ---------- masque du sol (zone bleue refermée sur les traits) ---------- */
  function boite(m, w, h, r, mode) {
    const o = new Uint8Array(w * h), I = new Int32Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) { let s = 0; for (let x = 0; x < w; x++) { s += m[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + s; } }
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
        const n = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
        o[y * w + x] = mode === "dil" ? (n > 0 ? 1 : 0) : (n === (x1 - x0) * (y1 - y0) ? 1 : 0);
      }
    }
    return o;
  }
  /* Sol « bleu » (b − r > 8, assez clair). Pour un autre sol, passer `masqueSol` dans les options. */
  function masqueSolBleu(rgba, w, h) {
    const m = new Uint8Array(w * h);
    for (let k = 0; k < w * h; k++) { const r = rgba[4 * k], g = rgba[4 * k + 1], b = rgba[4 * k + 2]; m[k] = (b - r > 8 && 0.3 * r + 0.59 * g + 0.11 * b > 45) ? 1 : 0; }
    return boite(boite(boite(m, w, h, 5, "dil"), w, h, 5, "ero"), w, h, 3, "ero");
  }

  /* ---------- cartes de lignes (toutes couleurs) et recalage direct ---------- */
  function reduire(a, w, h) {
    const nw = w >> 1, nh = h >> 1, o = new Float32Array(nw * nh);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) o[y * nw + x] = (a[2 * y * w + 2 * x] + a[2 * y * w + 2 * x + 1] + a[(2 * y + 1) * w + 2 * x] + a[(2 * y + 1) * w + 2 * x + 1]) / 4;
    return o;
  }
  function flou(g, w, h) {
    const o = new Float32Array(w * h), t = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) t[y * w + x] = (g[y * w + Math.max(0, x - 1)] + 2 * g[y * w + x] + g[y * w + Math.min(w - 1, x + 1)]) / 4;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o[y * w + x] = (t[Math.max(0, y - 1) * w + x] + 2 * t[y * w + x] + t[Math.min(h - 1, y + 1) * w + x]) / 4;
    return o;
  }
  function gradients(I, w, h) {
    const gx = new Float32Array(w * h), gy = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { gx[y * w + x] = (I[y * w + x + 1] - I[y * w + x - 1]) / 2; gy[y * w + x] = (I[(y + 1) * w + x] - I[(y - 1) * w + x]) / 2; }
    return [gx, gy];
  }
  /* carte de lignes d'une image : crêtes des 4 couleurs, limitées au sol, réduites à 240×135, pyramide + gradients + masques de sol */
  function carteLignes(rgba, masqueSol) {
    const work = CF.prepare({ data: rgba, width: W0, height: H0 }, W0);
    const R = new Float32Array(W0 * H0);
    for (const key of ["white", "yellow", "red", "black"]) { const rm = CF.ridgeMap(work, key); for (let k = 0; k < R.length; k++) if (rm.R[k] > R[k]) R[k] = rm.R[k]; }
    const fm = masqueSol(rgba, W0, H0);
    for (let k = 0; k < R.length; k++) if (!fm[k]) R[k] = 0;
    let a = flou(reduire(R, W0, H0), W, HH), cw = W, ch = HH, cur = a;
    const I = [a], M = [];
    for (let l = 1; l < NIV; l++) { cur = reduire(cur, cw, ch); cw >>= 1; ch >>= 1; I.push(flou(cur, cw, ch)); }
    const fd = reduire(Float32Array.from(fm), W0, H0), M0 = new Uint8Array(W * HH);
    for (let k = 0; k < M0.length; k++) M0[k] = fd[k] > 0.9 ? 1 : 0;
    M.push(M0); cw = W; ch = HH;
    for (let l = 1; l < NIV; l++) {
      const nw = cw >> 1, nh = ch >> 1, n = new Uint8Array(nw * nh);
      for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) n[y * nw + x] = M[l - 1][2 * y * cw + 2 * x] & M[l - 1][2 * y * cw + 2 * x + 1] & M[l - 1][(2 * y + 1) * cw + 2 * x] & M[l - 1][(2 * y + 1) * cw + 2 * x + 1];
      M.push(n); cw = nw; ch = nh;
    }
    return { I, G: I.map((x, l) => gradients(x, W >> l, HH >> l)), M };
  }
  const bil = (A, w, x, y) => { const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0; return A[i] * (1 - fx) * (1 - fy) + A[i + 1] * fx * (1 - fy) + A[i + w] * (1 - fx) * fy + A[i + w + 1] * fx * fy; };
  function resoudre(A, b, n) {
    const M = A.map((r, i) => r.concat([b[i]]));
    for (let i = 0; i < n; i++) {
      let mx = i; for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[mx][i])) mx = r;
      if (Math.abs(M[mx][i]) < 1e-12) return null;
      [M[i], M[mx]] = [M[mx], M[i]];
      for (let r = 0; r < n; r++) { if (r === i) continue; const f = M[r][i] / M[i][i]; for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c]; }
    }
    return M.map((r, i) => r[n] / r[i]);
  }
  /* aligne la carte C (image courante) sur la carte P (image précédente) : n_P ~ H n_C, 8 degrés, gaussienne-newton robuste */
  function alignerCartes(P, C, Hinit) {
    const h = norm9(Hinit).slice(0, 8); let stat = null;
    for (let l = NIV - 1; l >= 0; l--) {
      const w = W >> l, hh = HH >> l, f = F0 / (1 << l), cx = w / 2, cy = hh / 2, Ij = P.I[l], gx = P.G[l][0], gy = P.G[l][1], Ii = C.I[l], Mi = C.M[l], Mj = P.M[l];
      for (let it = 0; it < (l === NIV - 1 ? 14 : 8); it++) {
        const rs = [], rows = [];
        for (let y = 3; y < hh - 3; y++) for (let x = 3; x < w - 3; x++) {
          if (!Mi[y * w + x]) continue;
          const xn = (x - cx) / f, yn = (y - cy) / f, a = h[0] * xn + h[1] * yn + h[2], b = h[3] * xn + h[4] * yn + h[5], c = h[6] * xn + h[7] * yn + 1;
          if (c < 0.2) continue;
          const px = cx + f * a / c, py = cy + f * b / c;
          if (px < 2 || py < 2 || px >= w - 3 || py >= hh - 3) continue;
          if (!Mj[(py | 0) * w + (px | 0)]) continue;
          const vj = bil(Ij, w, px, py), vi = Ii[y * w + x];
          if (vj < 0.04 && vi < 0.04) continue;
          const r = vj - vi, Gx = bil(gx, w, px, py), Gy = bil(gy, w, px, py), ic = 1 / c;
          const dax = [xn * ic, yn * ic, ic, 0, 0, 0, -xn * a * ic * ic, -yn * a * ic * ic], day = [0, 0, 0, xn * ic, yn * ic, ic, -xn * b * ic * ic, -yn * b * ic * ic];
          const row = new Array(8); for (let k = 0; k < 8; k++) row[k] = f * (Gx * dax[k] + Gy * day[k]);
          rs.push(r); rows.push(row);
        }
        const n = rs.length; if (n < 80) return { ok: false };
        const abs = Float32Array.from(rs, Math.abs).sort(), sc = Math.max(0.03, 1.4826 * abs[n >> 1]);
        const A = Array.from({ length: 8 }, () => new Array(8).fill(0)), bb = new Array(8).fill(0); let inl = 0;
        for (let q = 0; q < n; q++) {
          const r = rs[q], u = r / (3.5 * sc); if (Math.abs(u) >= 1) continue;
          const wt = (1 - u * u) * (1 - u * u); inl++; const J = rows[q];
          for (let p = 0; p < 8; p++) { bb[p] -= wt * J[p] * r; for (let k = 0; k < 8; k++) A[p][k] += wt * J[p] * J[k]; }
        }
        for (let p = 0; p < 8; p++) A[p][p] += 1e-3 * (1 + A[p][p]);
        const d = resoudre(A, bb, 8); if (!d) return { ok: false };
        for (let p = 0; p < 8; p++) h[p] += d[p];
        stat = { inl: inl / n, sc, n };
        if (Math.hypot(...d) < 1e-7) break;
      }
    }
    return Object.assign({ H: [...h, 1], ok: true }, stat);
  }
  /* part des traits de l'image a qui, reportés par Hn (a → b, normalisé), retombent sur un trait de b (≈ ±3 px sur 480) ; null si trop peu de recouvrement */
  function tauxTraits(ca, cb, Hn) {
    let n = 0, hit = 0;
    for (let y = 4; y < HH - 4; y++) for (let x = 4; x < W - 4; x++) {
      if (!ca.M[0][y * W + x] || ca.I[0][y * W + x] < 0.12) continue;
      const q = ap(Hn, (x - W / 2) / F0, (y - HH / 2) / F0), u = W / 2 + F0 * q[0], v = HH / 2 + F0 * q[1];
      if (!(u >= 3 && v >= 3 && u < W - 4 && v < HH - 4) || !cb.M[0][(v | 0) * W + (u | 0)]) continue;
      n++; let m = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const vv = cb.I[0][((v | 0) + dy) * W + ((u | 0) + dx)]; if (vv > m) m = vv; }
      if (m > 0.12) hit++;
    }
    return n < 300 ? null : hit / n;
  }
  const vecteur = (M) => { const v = []; for (const p of COINS) { const q = ap(M, p[0], p[1]); v.push(q[0] * F480, q[1] * F480); } return v; };
  const ecart = (a, b) => { let m = 0; for (let q = 0; q < 10; q += 2) m = Math.max(m, Math.hypot(a[q] - b[q], a[q + 1] - b[q + 1])); return m; };
  /* deux images se recouvrent-elles (d'après G) ? */
  function serecouvrent(G, a, b) {
    const M = mul(G[b], inv(G[a])); if (!M.every(isFinite)) return false;
    const sc = [[-0.4, -0.2], [0, 0], [0.4, -0.2], [-0.4, 0.2], [0.4, 0.2], [0, 0.2]].map((p) => ap(M, p[0], p[1]));
    let inn = 0; sc.forEach((q) => { const x = q[0] * F480 + W0 / 2, y = q[1] * F480 + H0 / 2; if (x > 0 && x < W0 && y > 0 && y < H0) inn++; });
    const c = ap(M, 0, 0), area = Math.abs((ap(M, 0.5, 0)[0] - ap(M, -0.5, 0)[0]) * (ap(M, 0, 0.3)[1] - ap(M, 0, -0.3)[1]));
    return inn >= 4 && isFinite(c[0]) && area > 0.4 && area < 2.5;
  }

  /* ---------- construction ---------- */
  /* opts : { n, image(k) → RGBA 480×270, masqueSol?, pasCle=20, pasVerdict=4, seuil=0.85, progression?(étape, fraction) } */
  function construire(opts) {
    const n = opts.n, masqueSol = opts.masqueSol || masqueSolBleu, KS = opts.pasCle || 20, TH = opts.seuil || 0.85;
    const prog = opts.progression || (() => {});
    const cacheC = new Map(), cacheD = new Map(), cachePrep = new Map();
    const rgba = (k) => opts.image(k);
    const carte = (k) => { let c = cacheC.get(k); if (!c) { c = carteLignes(rgba(k), masqueSol); cacheC.set(k, c); if (cacheC.size > 300) cacheC.delete(cacheC.keys().next().value); } return c; };
    const prep = (k, avecMasque) => {
      const key = k * 2 + avecMasque; let p = cachePrep.get(key);
      if (!p) { const px = rgba(k); p = Cam.prepare(px, W0, H0, [], 4); p.mask = avecMasque ? masqueSol(px, W0, H0) : new Uint8Array(W0 * H0).fill(1); cachePrep.set(key, p); if (cachePrep.size > 60) cachePrep.delete(cachePrep.keys().next().value); }
      return p;
    };
    const descr = (k, am) => { const key = k * 2 + am; let d = cacheD.get(key); if (!d) { d = Orb.describePrepared(prep(k, am)); cacheD.set(key, d); if (cacheD.size > 800) cacheD.delete(cacheD.keys().next().value); } return d; };

    /* 1. suivi image à image (squelette) */
    const E = new Array(n).fill(null), seg = new Int32Array(n); let sg = 0, ruptures = 0;
    for (let k = 1; k < n; k++) {
      const a = prep(k - 1, 1), b = prep(k, 1);
      let r = Cam.estimateMotion(a, b, a.mask, b.mask, { maxCorners: 600 });
      if (!r.ok) { try { r = Orb.estimateBetween(a, b, {}); } catch (e) { r = { ok: false }; } }
      if (r.ok) E[k] = versNorm(Array.from(r.H)); else { sg++; ruptures++; }
      seg[k] = sg;
      if (k % 100 === 0) prog("suivi", k / n);
    }
    cachePrep.clear();
    const C = new Array(n); C[0] = IDENT;
    for (let k = 1; k < n; k++) C[k] = E[k] ? norm9(mul(E[k], C[k - 1])) : IDENT;
    const Ci = C.map((c) => inv(c));
    const relChaine = (j, k) => (seg[j] === seg[k]) ? norm9(mul(C[k], Ci[j])) : null;       // image j → image k par le suivi
    const G0 = new Array(n); G0[0] = IDENT;
    for (let k = 1; k < n; k++) G0[k] = E[k] ? norm9(mul(E[k], G0[k - 1])) : G0[k - 1];

    /* 2. images clés et arêtes */
    const cles = []; for (let k = 0; k < n; k += KS) cles.push(k);
    const aretes = [];
    const ajoute = (a, b, H, w) => aretes.push({ a, b, H, Hi: inv(H), w, keep: 1 });
    for (let i = 0; i + 1 < cles.length; i++) { const H = relChaine(cles[i], cles[i + 1]); if (H) ajoute(cles[i], cles[i + 1], H, 1); }
    let essais = 0;
    for (let ia = 0; ia < cles.length; ia++) {
      for (let ib = ia + 2; ib < cles.length; ib++) {
        const a = cles[ia], b = cles[ib]; if (!serecouvrent(G0, a, b)) continue;
        const H0 = norm9(mul(G0[b], inv(G0[a]))); let r; try { r = alignerCartes(carte(b), carte(a), H0); } catch (e) { r = { ok: false }; }
        if (r.ok && r.inl > 0.5) { const Hr = norm9(r.H); const t = tauxTraits(carte(a), carte(b), Hr); if (t !== null && t >= TH) ajoute(a, b, Hr, Math.min(2, r.inl * 2)); }
        essais++;
      }
      prog("cles", ia / cles.length);
    }
    /* liens à l'aveugle : ORB entre clés éloignées dans le temps, sans s'appuyer sur la prédiction du suivi */
    let nAveugle = 0;
    for (let ia = 0; ia < cles.length; ia++) {
      for (let ib = ia + 5; ib < cles.length; ib++) {
        const a = cles[ia], b = cles[ib]; let meilleur = null;
        for (const am of [1, 0]) {
          let r; try { r = Orb.estimate(descr(a, am), descr(b, am), { minInliers: 12, minRatio: 0.62 }); } catch (e) { r = { ok: false }; }
          if (!(r && r.ok)) continue;
          const H0m = versNorm(Array.from(r.H)); let rr; try { rr = alignerCartes(carte(b), carte(a), H0m); } catch (e) { rr = { ok: false }; }
          const cands = [H0m]; if (rr.ok) cands.push(norm9(rr.H));
          for (const H of cands) { const t = tauxTraits(carte(a), carte(b), H); if (t !== null && t >= 0.9 && (!meilleur || t > meilleur.t)) meilleur = { H, t }; }
        }
        if (meilleur) { ajoute(a, b, meilleur.H, 2); nAveugle++; }
      }
      prog("aveugle", ia / cles.length);
    }

    /* 3. ajustement robuste des clés (G_b = H · G_a), seuils décroissants */
    const G = G0.slice(); const Gc = new Map(); cles.forEach((k) => Gc.set(k, G0[k]));
    const voisins = new Map(); cles.forEach((k) => voisins.set(k, []));
    aretes.forEach((e) => { voisins.get(e.a).push(e); voisins.get(e.b).push(e); });
    // départ : chaîne ; puis points fixes par moyenne des prédictions des voisins
    const Gk = (k) => Gc.get(k);
    const ecartArete = (e) => { const P = mul(e.H, Gk(e.a)), Q = Gk(e.b); let m = 0; COINS.forEach((p) => { const x = ap(P, p[0], p[1]), y = ap(Q, p[0], p[1]); m = Math.max(m, Math.hypot(x[0] - y[0], x[1] - y[1]) * F480); }); return m; };
    const tours = (nt) => { for (let s = 0; s < nt; s++) for (const k of cles) { if (k === 0) continue; const M = new Array(9).fill(0); let sw = 0; for (const e of voisins.get(k)) { if (!e.keep) continue; const T = e.b === k ? mul(e.H, Gk(e.a)) : mul(e.Hi, Gk(e.b)); const t = norm9(T); if (!t.every(isFinite)) continue; for (let q = 0; q < 9; q++) M[q] += e.w * t[q]; sw += e.w; } if (sw) Gc.set(k, norm9(M)); } };
    tours(80);
    let rejetees = 0;
    for (const th of [80, 50, 30, 20, 10, 6, 4, 3]) { rejetees = 0; aretes.forEach((e) => { e.keep = ecartArete(e) < th ? 1 : 0; if (!e.keep) rejetees++; }); tours(60); }
    const res = aretes.filter((e) => e.keep).map(ecartArete).sort((x, y) => x - y);
    prog("ajuste", 1);

    /* 4. images intermédiaires : recalage direct sur les deux clés voisines, point de départ = suivi image à image */
    const Gf = new Array(n); const estCle = new Set(cles);
    cles.forEach((k) => { Gf[k] = Gk(k); });
    let nRepli = 0;
    for (let k = 0; k < n; k++) {
      if (estCle.has(k)) continue;
      const ka = Math.floor(k / KS) * KS, kb = ka + KS, est = [];
      for (const K of [ka, kb]) {
        if (K >= n) continue; const Hc = relChaine(k, K); if (!Hc) continue;
        let r; try { r = alignerCartes(carte(K), carte(k), Hc); } catch (e) { r = { ok: false }; }
        if (r.ok && r.inl > 0.5) { const Hr = norm9(r.H); if (ecart(vecteur(Hc), vecteur(Hr)) < 12) { est.push(norm9(mul(inv(Hr), Gk(K)))); continue; } }
        est.push(norm9(mul(inv(Hc), Gk(K))));          // repli : suivi image à image depuis la clé
        nRepli++;
      }
      if (est.length) { const M = new Array(9).fill(0); est.forEach((t) => t.forEach((v, q) => { M[q] += v / est.length; })); Gf[k] = norm9(M); } else Gf[k] = G0[k];
      if (k % 200 === 1) prog("images", k / n);
    }

    /* 5. filtre temporel appuyé sur le suivi : écarte les positions isolées */
    let Gs = Gf.map((g) => g.slice());
    const FEN = 10, TOL = 2.5;
    for (let it = 0; it < 3; it++) {
      const Gn = Gs.map((g) => g.slice());
      for (let k = 0; k < n; k++) {
        const cand = [];
        for (let d = -FEN; d <= FEN; d++) { const j = k + d; if (j < 0 || j >= n || seg[j] !== seg[k]) continue; const M = mul(mul(C[k], Ci[j]), Gs[j]); if (!M.every(isFinite)) continue; const Mn = norm9(M); cand.push({ M: Mn, v: vecteur(Mn) }); }
        if (cand.length < 4) continue;
        const med = []; for (let q = 0; q < 10; q++) { const a = cand.map((c) => c.v[q]).sort((x, y) => x - y); med.push(a[a.length >> 1]); }
        const keep = cand.filter((c) => ecart(c.v, med) <= TOL); if (keep.length < 3) continue;
        const A = new Array(9).fill(0); keep.forEach((c) => c.M.forEach((v, q) => { A[q] += v / keep.length; })); Gn[k] = norm9(A);
      }
      Gs = Gn;
    }
    prog("filtre", 1);

    /* 6. verdict par image */
    const verdict = new Array(n).fill("incertain"), score = new Array(n).fill(null);
    const Gi = Gs.map((g) => inv(g)); let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const PV = opts.pasVerdict || 4, MINGAP = opts.ecartVerdict || 80, NREF = 5;
    const evalues = [];
    for (let k = 0; k < n; k += PV) {
      const cand = []; for (let j = 0; j < n; j += 3) if (Math.abs(j - k) >= MINGAP && serecouvrent(Gs, k, j)) cand.push(j);
      const refs = []; while (refs.length < NREF && cand.length) { const j = cand.splice((rnd() * cand.length) | 0, 1)[0]; if (refs.every((r) => Math.abs(r - j) >= Math.min(30, MINGAP / 2))) refs.push(j); }
      const hs = []; for (const j of refs) { const t = tauxTraits(carte(k), carte(j), norm9(mul(Gs[j], Gi[k]))); if (t !== null) hs.push(t); }
      hs.sort((x, y) => x - y); const med = hs.length ? hs[hs.length >> 1] : null, bons = hs.filter((v) => v >= TH).length;
      evalues.push(k); score[k] = med; verdict[k] = (hs.length >= 2 && bons >= 2 && med >= TH) ? "ok" : "incertain";
      if ((k / PV) % 50 === 0) prog("verdict", k / n);
    }
    // une image prend le verdict le plus prudent des deux images évaluées qui l'encadrent
    for (let k = 0; k < n; k++) { if (score[k] !== null || (k % PV) === 0) continue; const a = Math.floor(k / PV) * PV, b = Math.min(a + PV, evalues[evalues.length - 1]); verdict[k] = (verdict[a] === "ok" && verdict[b] === "ok") ? "ok" : "incertain"; }
    for (let k = 0; k < n; k++) if (!Gs[k] || !Gs[k].every(isFinite)) verdict[k] = "incertain";

    const nOk = verdict.filter((v) => v === "ok").length;
    return { G: Gs, verdict, score, stats: { n, cles: cles.length, aretes: aretes.length, aveugles: nAveugle, rejetees, ecartMedian: res.length ? res[res.length >> 1] : null, ruptures, repli: nRepli, ok: nOk, partOk: n ? nOk / n : 0 } };
  }

  return { construire, masqueSolBleu, carteLignes, alignerCartes, tauxTraits, serecouvrent, versNorm, Nm, F480 };
});
