/* Identification AUTOMATIQUE du terrain à partir du rond central noir (cercle exact de 3 m) et contrôle image par image.
   Pourquoi : le suivi global du sol (sol-global.js) donne le mouvement de la caméra entre images, mais il peut se décaler (lignes parallèles et répétées de la salle) tout en
   se déclarant « ok ». Le rond est un repère absolu, unique, de taille connue : il fixe la position de la caméra (avec le champ de vision), puis chaque image est CONTRÔLÉE
   (le rond projeté tombe-t-il sur un vrai trait noir ?) et, si besoin, remise sur le rond ; les images où le rond n'est pas visible sont contrôlées contre une mosaïque des lignes du sol
   bâtie sur les images confirmées par le rond (jamais contre elles-mêmes). Rien n'est tracé sans preuve : le reste est « non analysé ».
   Repère du terrain ici : (u, v) en mètres, origine = centre du rond ; l'orientation vers le repère du programme (x le long de la longueur depuis le but gauche) vient des buts / du calibrage. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./homography"), require("./court-fit"), require("./sol-global"));
  else root.FutsalTerrainAuto = factory(root.FutsalHomography, root.FutsalCourtFit, root.FutsalSolGlobal);
})(typeof self !== "undefined" ? self : this, function (HG, CF, SG) {
  "use strict";

  const W = 480, H = 270;
  const FOV_DEFAUT = 91;                                   // champ horizontal mesuré sur une rotation pure de la caméra (voir docs/terrain-complet-mesures.md)
  const RAYON_ROND = 3;
  const mul = HG.mul3, inv = HG.invert;

  /* ---------- géométrie : pose de la caméra -> homographie terrain(m) -> coordonnées normalisées ---------- */
  /* p = [cx, cy, h, cap, inclinaison, roulis] (caméra à (cx, cy) à h mètres ; cap = direction horizontale du regard ; l'inclinaison est vers le bas). */
  function poseH(p, fov) {
    const cx = p[0], cy = p[1], h = p[2], psi = p[3], th = p[4], rho = p[5];
    const s = Math.tan(45.5 * Math.PI / 180) / Math.tan(((fov || FOV_DEFAUT) * Math.PI) / 360);
    const f = [Math.cos(th) * Math.cos(psi), Math.cos(th) * Math.sin(psi), -Math.sin(th)];
    const rt = [Math.sin(psi), -Math.cos(psi), 0];
    const dn = [f[1] * rt[2] - f[2] * rt[1], f[2] * rt[0] - f[0] * rt[2], f[0] * rt[1] - f[1] * rt[0]];
    const c = Math.cos(rho), sn = Math.sin(rho);
    const r2 = rt.map((v, i) => c * v + sn * dn[i]), d2 = dn.map((v, i) => -sn * rt[i] + c * dn[i]);
    const C = [cx, cy, h], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    return [s * r2[0], s * r2[1], -s * dot(r2, C), s * d2[0], s * d2[1], -s * dot(d2, C), f[0], f[1], -dot(f, C)];
  }
  /* pose du rond : 5 degrés (distance au centre, hauteur, écart de cap, inclinaison, roulis) ; l'azimut autour du rond est libre (fixé à 0) */
  const poseDepuisRond = (q, fov) => poseH([-q[0], 0, q[1], q[2], q[3], q[4]], fov);
  let F480 = (W / 2) / Math.tan((FOV_DEFAUT * Math.PI) / 360);     // pixels normalisés du suivi global (champ 91°, voir sol-global.js)
  function pointsRond(n) { const o = []; for (let i = 0; i < n; i++) o.push([RAYON_ROND * Math.cos(2 * Math.PI * i / n), RAYON_ROND * Math.sin(2 * Math.PI * i / n)]); return o; }
  /* projection terrain -> pixel 480×270 par une homographie terrain -> normalisé ; null si derrière la caméra */
  function versPixel(Hn, u, v) {
    const w = Hn[6] * u + Hn[7] * v + Hn[8]; if (!(w > 1e-6)) return null;
    return [(Hn[0] * u + Hn[1] * v + Hn[2]) / w * F480 + W / 2, (Hn[3] * u + Hn[4] * v + Hn[5]) / w * F480 + H / 2];
  }

  /* ---------- ellipse : ajustement d'une conique, RANSAC ---------- */
  function jacobi(A, n) {                                   // valeurs/vecteurs propres d'une matrice symétrique n×n (Jacobi)
    const a = A.map((r) => r.slice()), V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
    for (let sweep = 0; sweep < 60; sweep++) {
      let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
      if (off < 1e-22) break;
      for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-30) continue;
        const th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
        for (let k = 0; k < n; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
        for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
      }
    }
    return { val: a.map((r, i) => r[i]), vec: V };
  }
  /* conique ax²+bxy+cy²+dx+ey+f=0 ajustée (moindres carrés algébriques, coordonnées normalisées) ; null si ce n'est pas une ellipse */
  function ajusterConique(P) {
    const n = P.length; if (n < 5) return null;
    let mx = 0, my = 0; P.forEach((p) => { mx += p[0]; my += p[1]; }); mx /= n; my /= n;
    let sc = 0; P.forEach((p) => { sc += Math.hypot(p[0] - mx, p[1] - my); }); sc = sc / n || 1;
    const S = Array.from({ length: 6 }, () => new Array(6).fill(0));
    for (const p of P) { const x = (p[0] - mx) / sc, y = (p[1] - my) / sc, d = [x * x, x * y, y * y, x, y, 1]; for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) S[i][j] += d[i] * d[j]; }
    const { val, vec } = jacobi(S, 6); let k = 0; for (let i = 1; i < 6; i++) if (val[i] < val[k]) k = i;
    const [a, b, c, d, e, f] = vec.map((r) => r[k]);
    if (!(b * b - 4 * a * c < 0)) return null;
    // retour aux coordonnées d'origine (x' = (x - mx) / sc)
    const A = a, B = b, C = c, D = d * sc - 2 * a * mx - b * my, E = e * sc - 2 * c * my - b * mx;
    const F = f * sc * sc - d * sc * mx - e * sc * my + a * mx * mx + b * mx * my + c * my * my;
    return conique2ellipse([A, B, C, D, E, F]);
  }
  function conique2ellipse(q) {
    const A = q[0], B = q[1], C = q[2], D = q[3], E = q[4], F = q[5], den = B * B - 4 * A * C; if (!(den < 0)) return null;
    const cx = (2 * C * D - B * E) / den, cy = (2 * A * E - B * D) / den;
    // demi-axes par les valeurs propres de la forme quadratique recentrée
    const f0 = A * cx * cx + B * cx * cy + C * cy * cy + D * cx + E * cy + F;      // valeur de la conique au centre
    const m = [[A, B / 2], [B / 2, C]], tr = A + C, det = A * C - B * B / 4, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    const l1 = tr / 2 + disc, l2 = tr / 2 - disc;                                    // valeurs propres de m
    if (!(l1 * l2 > 0) || !(-f0 / l1 > 0) || !(-f0 / l2 > 0)) return null;
    const r1 = Math.sqrt(-f0 / l1), r2 = Math.sqrt(-f0 / l2);                       // r1 : demi-axe selon le vecteur propre de l1
    // vecteur propre de l1
    let vx = m[0][1], vy = l1 - m[0][0]; if (Math.abs(vx) + Math.abs(vy) < 1e-14) { vx = l1 - m[1][1]; vy = m[1][0]; if (Math.abs(vx) + Math.abs(vy) < 1e-14) { vx = 1; vy = 0; } }
    const a1 = Math.atan2(vy, vx);
    return r1 >= r2 ? { cx, cy, A: r1, B: r2, ang: a1 } : { cx, cy, A: r2, B: r1, ang: a1 + Math.PI / 2 };
  }
  /* distance approchée d'un point à l'ellipse (px) */
  function distEllipse(e, x, y) {
    const c = Math.cos(e.ang), s = Math.sin(e.ang), dx = x - e.cx, dy = y - e.cy, u = c * dx + s * dy, v = -s * dx + c * dy;
    const r = Math.sqrt((u / e.A) * (u / e.A) + (v / e.B) * (v / e.B)); return Math.abs(r - 1) * Math.sqrt(e.A * e.B);
  }
  function rnd(seed) { let s = (seed || 1) >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  /* RANSAC : points = [[x, y]] (crêtes noires fortes) ; rend { e, n, tot, frac } ou null */
  function detecterEllipse(points, o) {
    o = o || {}; const N = points.length; if (N < (o.minPts || 60)) return null;
    const R = rnd(o.seed || 7), iters = o.iters || 1500, tol = o.tol || 1.5; let best = null;
    for (let it = 0; it < iters; it++) {
      const S = [], used = new Set(); while (S.length < 5) { const i = (R() * N) | 0; if (!used.has(i)) { used.add(i); S.push(points[i]); } }
      const e = ajusterConique(S); if (!e) continue;
      if (!(e.A > 15 && e.A < 220 && e.B > 4)) continue;
      let n = 0; for (let i = 0; i < N; i++) if (distEllipse(e, points[i][0], points[i][1]) < tol) n++;
      if (!best || n > best.n) best = { e, n };
    }
    if (!best) return null;
    const inl = points.filter((p) => distEllipse(best.e, p[0], p[1]) < tol), e2 = ajusterConique(inl) || best.e;
    let n2 = 0; for (const p of points) if (distEllipse(e2, p[0], p[1]) < tol) n2++;
    return { e: e2, n: n2, tot: N, frac: n2 / N };
  }

  /* ---------- optimisation (Nelder-Mead) ---------- */
  function nelderMead(f, x0, step, it) {
    const n = x0.length; let sx = [x0.slice()]; for (let i = 0; i < n; i++) { const x = x0.slice(); x[i] += step[i]; sx.push(x); }
    let fv = sx.map(f);
    for (let t = 0; t < it; t++) {
      const o = fv.map((_v, i) => i).sort((a, b) => fv[a] - fv[b]); sx = o.map((i) => sx[i]); fv = o.map((i) => fv[i]);
      const c = new Array(n).fill(0); for (let i = 0; i < n; i++) for (let d = 0; d < n; d++) c[d] += sx[i][d] / n;
      const xr = c.map((v, d) => v + (v - sx[n][d])), fr = f(xr);
      if (fr < fv[0]) { const xe = c.map((v, d) => v + 2 * (v - sx[n][d])), fe = f(xe); if (fe < fr) { sx[n] = xe; fv[n] = fe; } else { sx[n] = xr; fv[n] = fr; } }
      else if (fr < fv[n - 1]) { sx[n] = xr; fv[n] = fr; }
      else { const xc = c.map((v, d) => v + 0.5 * (sx[n][d] - v)), fc = f(xc); if (fc < fv[n]) { sx[n] = xc; fv[n] = fc; } else for (let i = 1; i <= n; i++) { sx[i] = sx[i].map((v, d) => sx[0][d] + 0.5 * (v - sx[0][d])); fv[i] = f(sx[i]); } }
    }
    let b = 0; for (let i = 1; i <= n; i++) if (fv[i] < fv[b]) b = i; return { x: sx[b], f: fv[b] };
  }

  /* résidu (px) entre le rond projeté par Hn (terrain -> normalisé) et l'ellipse e détectée */
  function residuRond(Hn, e) {
    const pts = pointsRond(72); let tot = 0, n = 0;
    for (const [u, v] of pts) { const p = versPixel(Hn, u, v); if (!p) return 1e3; tot += distEllipse(e, p[0], p[1]); n++; }
    return n ? tot / n : 1e3;
  }
  function coutPose(q, e, fov) {
    if (q[1] < 1.5 || q[1] > 10 || q[0] < 4 || q[0] > 40 || q[3] < 0.02 || q[3] > 1.3 || Math.abs(q[4]) > 0.4) return 1e3;
    return residuRond(poseDepuisRond(q, fov), e);
  }
  /* pose de la caméra qui explique l'ellipse e (champ fov) : { q, residu } ; q = [distance, hauteur, écart de cap, inclinaison, roulis] */
  function poseDepuisEllipse(e, fov, o) {
    o = o || {}; const R = rnd(o.seed || 11), r = (a, b) => a + (b - a) * R(); let best = null;
    for (let s = 0; s < (o.essais || 160); s++) {
      const q0 = [r(5, 30), r(2, 8), r(-0.8, 0.8), r(0.1, 0.9), r(-0.1, 0.1)];
      const res = nelderMead((q) => coutPose(q, e, fov), q0, [3, 1, 0.2, 0.1, 0.03], 220);
      if (!best || res.f < best.f) best = res;
    }
    return best ? { q: best.x, residu: best.f } : null;
  }


  /* ---------- cartes par image ---------- */
  /* carte des traits noirs (crêtes, limitées au sol) : { dt : distance au trait noir fort (Uint8, 1/8 px), pts : crêtes très fortes [[x,y]] } */
  function carteNoire(rgba, masqueSol) {
    const work = CF.prepare({ data: rgba, width: W, height: H }, W), rm = CF.ridgeMap(work, "black"), fm = (masqueSol || SG.masqueSolBleu)(rgba, W, H);
    const mask = new Uint8Array(W * H), pts = [];
    for (let i = 0; i < W * H; i++) { const r = fm[i] ? rm.R[i] : 0; if (r >= 0.8) mask[i] = 1; if (r >= 0.85) pts.push([i % W, (i / W) | 0]); }
    const d = CF.distanceTransform(mask, W, H), dt = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) dt[i] = Math.min(255, Math.round(d[i] / 3 * 8));
    return { dt, pts };
  }
  const LW = 240, LH = 135;
  /* carte des lignes de toutes les couleurs (noir pondéré), 240×135, quantifiée sur 8 bits */
  function carteLignes8(rgba, masqueSol) {
    const I = SG.carteLignes(rgba, masqueSol || SG.masqueSolBleu, "black").I[0], o = new Uint8Array(LW * LH);
    for (let i = 0; i < o.length; i++) o[i] = Math.max(0, Math.min(255, Math.round(I[i] * 255)));
    return o;
  }
  const distAt = (dt, x, y) => { const xi = Math.round(x), yi = Math.round(y); if (xi < 1 || yi < 1 || xi >= W - 1 || yi >= H - 1) return null; return dt[yi * W + xi] / 8; };
  function ligneAt(lm, x, y) {
    const xs = x / 2, ys = y / 2; if (xs < 1 || ys < 1 || xs >= LW - 2 || ys >= LH - 2) return null;
    const x0 = xs | 0, y0 = ys | 0, fx = xs - x0, fy = ys - y0, o = y0 * LW + x0;
    return (lm[o] * (1 - fx) * (1 - fy) + lm[o + 1] * fx * (1 - fy) + lm[o + LW] * (1 - fx) * fy + lm[o + LW + 1] * fx * fy) / 255;
  }

  /* ---------- appui du rond ---------- */
  const PTS72 = pointsRond(72);
  const CORR0 = { s: 1, a: 0, tx: 0, ty: 0 };
  function appliquer(p, c, cx, cy) { const co = Math.cos(c.a), si = Math.sin(c.a), u = p[0] - cx, v = p[1] - cy; return [cx + c.s * (co * u - si * v) + c.tx, cy + c.s * (si * u + co * v) + c.ty]; }
  /* points du rond projetés par Hn ; { pts, cx, cy } (cx, cy : centre de gravité, pivot des corrections) */
  function rondProjete(Hn) {
    const pts = []; for (const [u, v] of PTS72) { const p = versPixel(Hn, u, v); if (p) pts.push(p); }
    let cx = 0, cy = 0; pts.forEach((p) => { cx += p[0]; cy += p[1]; }); if (pts.length) { cx /= pts.length; cy /= pts.length; }
    return { pts, cx, cy };
  }
  function appui(dt, pts, c, cx, cy, dx, dy) {
    let n = 0, hit = 0, tot = 0;
    for (const p of pts) { const q = c ? appliquer(p, c, cx, cy) : p; const d = distAt(dt, q[0] + (dx || 0), q[1] + (dy || 0)); if (d === null) continue; n++; tot += Math.min(d, 6); if (d <= 1.5) hit++; }
    return { n, hit, tot };
  }
  /* image au rond : meilleure translation (grille) puis ajustement d'une similitude (translation, échelle, angle) ; rend { s0 (appui sans correction), s1 (appui corrigé), c (correction) } */
  function ajusterRond(dt, Hn) {
    const rp = rondProjete(Hn); if (rp.pts.length < 25) return { s0: null, s1: 0, c: CORR0, n: rp.pts.length };
    const a0 = appui(dt, rp.pts, null, 0, 0, 0, 0), s0 = a0.n >= 30 ? a0.hit / a0.n : null;
    if (s0 !== null && s0 >= 0.45) return { s0, s1: s0, c: CORR0, n: a0.n, cx: rp.cx, cy: rp.cy };
    let bs = -1, bdx = 0, bdy = 0;
    for (let dx = -320; dx <= 320; dx += 4) for (let dy = -50; dy <= 50; dy += 4) { const a = appui(dt, rp.pts, null, 0, 0, dx, dy); if (a.n < 0.6 * rp.pts.length) continue; const s = a.hit / a.n; if (s > bs) { bs = s; bdx = dx; bdy = dy; } }
    const f = (v) => { if (v[0] < 0.7 || v[0] > 1.4 || Math.abs(v[1]) > 0.4) return 1e3; const a = appui(dt, rp.pts, { s: v[0], a: v[1], tx: v[2], ty: v[3] }, rp.cx, rp.cy, 0, 0); if (a.n < 0.6 * rp.pts.length) return 1e3; return a.tot / a.n; };
    let best = null; for (const st of [[1, 0, 0, 0], [1, 0, bdx, bdy]]) { const r = nelderMead(f, st, [0.03, 0.02, 6, 3], 160); if (!best || r.f < best.f) best = r; }
    const c = { s: best.x[0], a: best.x[1], tx: best.x[2], ty: best.x[3] }, a1 = appui(dt, rp.pts, c, rp.cx, rp.cy, 0, 0);
    return { s0, s1: a1.n ? a1.hit / a1.n : 0, c, n: a1.n, cx: rp.cx, cy: rp.cy };
  }

  /* ---------- mosaïque des lignes dans le repère du terrain ---------- */
  const RES = 0.1, U0 = -24, V0 = -26, NU = 480, NV = 520;
  /* projecteur d'une image : (u, v) -> pixel 480×270 (G, pose du rond, correction éventuelle) */
  function projecteur(Hn, c, dx, dy) {
    if (!c) return (u, v) => { const p = versPixel(Hn, u, v); return p ? [p[0] + (dx || 0), p[1] + (dy || 0)] : null; };
    const rp = rondProjete(Hn);
    return (u, v) => { const p = versPixel(Hn, u, v); if (!p) return null; const q = appliquer(p, c, rp.cx, rp.cy); return [q[0] + (dx || 0), q[1] + (dy || 0)]; };
  }
  function batirMosaique(ancres, lm) {                      // ancres : [{ j, P }] ; lm[j] : carte de lignes
    const sum = new Float32Array(NU * NV), cnt = new Float32Array(NU * NV);
    for (const a of ancres) {
      for (let iv = 0; iv < NV; iv++) {
        const v = V0 + iv * RES;
        for (let iu = 0; iu < NU; iu++) {
          const u = U0 + iu * RES, p = a.P(u, v); if (!p) continue;
          const pn = a.P(u + RES, v); if (!pn) continue; if (!(Math.hypot(pn[0] - p[0], pn[1] - p[1]) > 0.35)) continue;   // au plus ~0,3 m par pixel
          const l = ligneAt(lm[a.j], p[0], p[1]); if (l === null) continue; const o = iv * NU + iu; sum[o] += l; cnt[o]++;
        }
      }
    }
    const cells = [];
    for (let i = 0; i < sum.length; i++) if (cnt[i] >= 2) { const m = sum[i] / cnt[i]; if (m >= 0.4) cells.push([U0 + (i % NU) * RES, V0 + ((i / NU) | 0) * RES, m]); }
    return cells;
  }
  function scoreMosaique(lm, P, cells, dx, dy) {
    let s = 0, w = 0;
    for (const c of cells) { const p = P(c[0], c[1]); if (!p) continue; const l = ligneAt(lm, p[0] + dx, p[1] + dy); if (l === null) continue; s += c[2] * Math.min(1, l * 1.5); w += c[2]; }
    return w > 200 ? s / w : null;
  }

  /* ---------- analyse complète ---------- */
  /* o : { n, image(k) -> RGBA 480×270, G, verdict, Nm, pas = 4, fov, progression(etape, f) }
     Rend { ok, fov, q, kref, Hr, echantillons : [{ k, genre, c, dx, dy, s }], stats } ; genre : « rond » (le suivi tombe sur le rond), « rond-corr » (remis sur le rond),
     « mos-suivi » (suivi confirmé par la mosaïque), « mos-recale » (remis par la mosaïque), « non » (non analysé). */
  function analyser(o) {
    const pas = o.pas || 4, fov = o.fov || FOV_DEFAUT, n = o.n, G = o.G, prog = o.progression || (() => {});
    if (o.Nm) F480 = 1 / o.Nm[0];
    const idx = []; for (let k = 0; k < n; k += pas) idx.push(k);
    const dts = [], lms = [], det = [];
    for (let j = 0; j < idx.length; j++) {
      const rgba = o.image(idx[j]), cn = carteNoire(rgba); dts.push(cn.dt); lms.push(carteLignes8(rgba));
      det.push((j % 5 === 0 && (o.verdict[idx[j]] === "ok" || o.verdict[idx[j]] === "pont")) ? detecterEllipse(cn.pts, { seed: 3 + j }) : null);
      if (j % 20 === 0) prog("terrain-cartes", j / idx.length);
    }
    // image de référence : ellipse la plus nette (≥ 70 points, ≥ 45 %), centre dans l'image
    let jr = -1;
    det.forEach((d, j) => { if (d && d.n >= 70 && d.frac >= 0.45 && d.e.cx > 0 && d.e.cx < W && d.e.cy > 0 && d.e.cy < H && (jr < 0 || d.n > det[jr].n)) jr = j; });
    if (jr < 0) return { ok: false, raison: "Rond central noir introuvable" };
    const pose = poseDepuisEllipse(det[jr].e, fov, { seed: 5 });
    if (!pose || pose.residu > 1.5) return { ok: false, raison: "Pose du rond non fiable" };
    const Hr = poseDepuisRond(pose.q, fov), kref = idx[jr], Gri = inv(G[kref]);
    const Hn = (j) => mul(mul(G[idx[j]], Gri), Hr);
    prog("terrain-rond", 0);
    const ech = idx.map((k) => ({ k, genre: "non", c: null, dx: 0, dy: 0, s: null }));
    for (let j = 0; j < idx.length; j++) {
      const r = ajusterRond(dts[j], Hn(j)); ech[j].s = r.s1;
      if (r.n >= 30 && r.s1 >= 0.5) {
        const petit = Math.hypot(r.c.tx, r.c.ty) <= 3 && Math.abs(r.c.s - 1) < 0.02 && Math.abs(r.c.a) < 0.01;
        ech[j].genre = (r.s0 !== null && r.s0 >= 0.45) || petit ? "rond" : "rond-corr"; ech[j].c = ech[j].genre === "rond" ? null : r.c;
      }
      if (j % 20 === 0) prog("terrain-rond", j / idx.length);
    }
    // Vérification par DEUX preuves indépendantes : le rond (ci-dessus) ET les lignes du sol (mosaïque bâtie sur d'autres blocs de 20 s, jamais sur l'image elle-même).
    // Une image appuyée par le rond mais non confirmée par la mosaïque est rétrogradée en « non » ; deux tours : le second reconstruit la mosaïque avec les seules images confirmées.
    ech.forEach((e) => { e.c0 = e.c; e.ring = e.genre === "rond" || e.genre === "rond-corr"; e.confirme = false; });
    for (let tour = 0; tour < 2; tour++) {
      const ancres = [[], []];
      ech.forEach((e, j) => { if ((tour === 0 ? e.ring : e.confirme)) ancres[Math.floor(j / 20) % 2].push({ j, P: projecteur(Hn(j), e.c0 && tour === 0 ? e.c0 : e.c, e.dx, e.dy) }); });
      const cellules = ancres.map((x) => (x.length >= 30 ? batirMosaique(x, lms) : []));
      for (let j = 0; j < idx.length; j++) {
        const e = ech[j], cs = cellules[1 - (Math.floor(j / 20) % 2)]; if (cs.length < 2000) { e.confirme = false; if (e.ring) { e.genre = "rond-seul"; e.c = e.c0; e.dx = 0; e.dy = 0; } else { e.genre = "non"; e.c = null; e.dx = 0; e.dy = 0; } continue; }
        let meilleur = null;
        for (const c of (e.c0 ? [e.c0, null] : [null])) {
          const P0 = projecteur(Hn(j), c, 0, 0), s0 = scoreMosaique(lms[j], P0, cs, 0, 0);
          if (s0 !== null && (!meilleur || s0 > meilleur.s)) meilleur = { s: s0, c, dx: 0, dy: 0 };
          if (s0 !== null && s0 >= 0.7) break;
          let bs = -1, bdx = 0, bdy = 0;
          for (let dx = -24; dx <= 24; dx += 3) for (let dy = -12; dy <= 12; dy += 3) { const q = scoreMosaique(lms[j], P0, cs, dx, dy); if (q !== null && q > bs) { bs = q; bdx = dx; bdy = dy; } }
          if (bs > -1 && (!meilleur || bs > meilleur.s)) meilleur = { s: bs, c, dx: bdx, dy: bdy };
          if (bs >= 0.7) break;
        }
        if (meilleur && meilleur.s >= 0.7) {
          e.confirme = true; e.s = meilleur.s; e.c = meilleur.c; e.dx = meilleur.dx; e.dy = meilleur.dy;
          if (!e.ring) e.genre = (meilleur.dx || meilleur.dy) ? "mos-recale" : "mos-suivi";
          else e.genre = e.c ? "rond-corr" : "rond";
        } else { e.confirme = false; e.genre = "non"; e.c = null; e.dx = 0; e.dy = 0; }
      }
      prog("terrain-mosaique", (tour + 1) / 2);
    }
    // images encore non analysées : localisation DIRECTE contre la mosaïque (caméra fixe : seuls le cap, l'inclinaison et le roulis sont inconnus ; le champ aussi si le zoom a changé)
    const d0 = pose.q[0], h0 = pose.q[1];
    const HnSample = (j) => (ech[j].ori ? poseH([-d0, 0, h0, ech[j].ori[0], ech[j].ori[1], ech[j].ori[2]], ech[j].fov) : Hn(j));
    const projSample = (j) => projecteur(HnSample(j), ech[j].c, ech[j].dx, ech[j].dy);
    const restantes = ech.map((e, j) => (e.genre === "non" ? j : null)).filter((x) => x !== null);
    const parBloc = {}; restantes.forEach((j) => { (parBloc[Math.floor(j / 20)] = parBloc[Math.floor(j / 20)] || []).push(j); });
    const cand = {};
    for (const b of Object.keys(parBloc)) {
      const ctr = b * 20 + 10, anc = []; ech.forEach((e, j) => { if (e.genre !== "non" && e.genre !== "probable" && Math.abs(j - ctr) > 20) anc.push({ j, P: projSample(j) }); });
      const cells = anc.length >= 30 ? batirMosaique(anc, lms) : []; if (cells.length < 2000) continue; const sub = cells.filter((_c, i) => i % 4 === 0);
      for (const j of parBloc[b]) {
        const meilleur = (fov, pasA, a0, a1, t0, t1) => {
          const c = []; for (let psi = a0; psi <= a1; psi += pasA) for (let th = t0; th <= t1; th += pasA) { const s = scoreMosaique(lms[j], projecteur(poseH([-d0, 0, h0, psi, th, 0], fov), null, 0, 0), sub, 0, 0); if (s !== null) c.push([s, psi, th]); }
          c.sort((x, y) => y[0] - x[0]); return c;
        };
        const raffiner = (fov0, psi, th) => {
          const f = (v) => { if (v[0] < 45 || v[0] > 100 || v[2] < 0.05 || v[2] > 1.3 || Math.abs(v[3]) > 0.2) return 1; const s = scoreMosaique(lms[j], projecteur(poseH([-d0, 0, h0, v[1], v[2], v[3]], v[0]), null, 0, 0), cells, 0, 0); return s === null ? 1 : 1 - s; };
          const r = nelderMead(f, [fov0, psi, th, 0], [3, 0.03, 0.03, 0.01], 120); return { s: 1 - r.f, fov: r.x[0], ori: [r.x[1], r.x[2], r.x[3]] };
        };
        // 1) champ de la réf. (zoom inchangé) : pic unique exigé
        const c1 = meilleur(fov, 0.03, -1.7, 1.7, 0.15, 1.0);
        if (c1.length) {
          const top = c1[0], second = c1.find((x) => Math.hypot(x[1] - top[1], x[2] - top[2]) > 0.1), r = raffiner(fov, top[1], top[2]);
          if (r.s >= 0.7 && (!second || r.s - second[0] >= 0.04)) { cand[j] = { genre: "mos-direct", s: r.s, fov: Math.abs(r.fov - fov) < 0.5 ? fov : r.fov, ori: r.ori, ok: true }; continue; }
        }
        // 2) zoom différent : champ de vision cherché (60-80°), niveau « probable » seulement
        let bst = null; for (const f of [55, 59, 63, 67, 71, 75, 80]) { const c = meilleur(f, 0.04, -1.7, 1.7, 0.1, 1.0); if (c.length && (!bst || c[0][0] > bst.s)) bst = { s: c[0][0], fov: f, psi: c[0][1], th: c[0][2] }; }
        if (bst) { const r = raffiner(bst.fov, bst.psi, bst.th); if (r.s >= 0.5) cand[j] = { genre: "probable", s: r.s, fov: r.fov, ori: r.ori, ok: false }; }
      }
    }
    Object.keys(cand).forEach((js) => { const j = +js, c = cand[j]; if (c.ok) { Object.assign(ech[j], { genre: "mos-direct", c: null, dx: 0, dy: 0, s: c.s, ori: c.ori, fov: c.fov }); } });
    // « probable » : seulement par séries d'au moins 5 secondes dont le champ (±4°) et le cap (±0,12 rad) restent cohérents
    const prob = Object.keys(cand).map(Number).filter((j) => !cand[j].ok).sort((a, b) => a - b);
    for (let i = 0; i < prob.length;) {
      let e = i; while (e + 1 < prob.length && prob[e + 1] === prob[e] + 1 && Math.abs(cand[prob[e + 1]].fov - cand[prob[e]].fov) <= 4 && Math.abs(cand[prob[e + 1]].ori[0] - cand[prob[e]].ori[0]) <= 0.12) e++;
      if (e - i + 1 >= 5) for (let q = i; q <= e; q++) { const j = prob[q], c = cand[j]; Object.assign(ech[j], { genre: "probable", c: null, dx: 0, dy: 0, s: c.s, ori: c.ori, fov: c.fov }); }
      i = e + 1;
    }
    ech.forEach((e, j) => { if (e.genre === "mos-direct") { const a = appui(dts[j], rondProjete(HnSample(j)).pts, null, 0, 0, 0, 0); e.ringOk = a.n >= 30 && a.hit / a.n >= 0.45; } });
    // Contrôle final : toute image vérifiée est re-contrôlée contre la mosaïque bâtie sur les images FINALES (autres blocs de 20 s) ; en dessous de 0,60 elle redevient « non analysée »
    {
      const anc = [[], []]; ech.forEach((e, j) => { if (verifie(e)) anc[Math.floor(j / 20) % 2].push({ j, P: projSample(j) }); });
      const cel = anc.map((x) => (x.length >= 30 ? batirMosaique(x, lms) : []));
      for (let j = 0; j < idx.length; j++) {
        const e = ech[j]; if (!verifie(e)) continue;
        const cs = cel[1 - (Math.floor(j / 20) % 2)], sc = cs.length >= 2000 ? scoreMosaique(lms[j], projSample(j), cs, 0, 0) : null;
        e.sFinal = sc;
        if (sc === null || sc < 0.6) { e.genre = "non"; e.c = null; e.dx = 0; e.dy = 0; e.ori = null; e.fov = null; e.ringOk = false; }
      }
    }
    poserPonts(ech, Hn, 4, 4);
    const cnt = {}; ech.forEach((e) => { cnt[e.genre] = (cnt[e.genre] || 0) + 1; });
    return { ok: true, fov, q: pose.q, residuRef: pose.residu, kref, Hr, pas, d0, h0, echantillons: ech.map((e) => ({ k: e.k, genre: e.genre, c: e.c, dx: e.dx, dy: e.dy, s: e.s, ori: e.ori || null, fov: e.fov || null, ro: !!e.ringOk })), stats: { total: ech.length, genres: cnt, verifiees: ech.filter((e) => niveau(e.genre, e.ringOk) === "verifie").length, probables: ech.filter((e) => niveau(e.genre, e.ringOk) === "probable").length, non: cnt.non || 0 } };
  }

  /* ---------- ponts : brèves images non vérifiées entre deux images vérifiées dont les corrections s'accordent ---------- */
  const PTS_ACCORD = [[-8, -8], [0, -8], [8, -8], [-8, 0], [0, 0], [8, 0], [-8, 8], [0, 8], [8, 8], [-3, 0], [3, 0], [0, 3], [0, -3]];
  function ecartProjecteurs(P1, P2) {
    let s = 0, n = 0;
    for (const [u, v] of PTS_ACCORD) { const a = P1(u, v), b = P2(u, v); if (!a || !b) continue; if (a[0] < 0 || a[0] > W || a[1] < 0 || a[1] > H) continue; s += Math.hypot(a[0] - b[0], a[1] - b[1]); n++; }
    return n >= 4 ? s / n : null;
  }
  const NIVEAU_VERIFIE = { rond: 1, "rond-corr": 1, "mos-suivi": 1, "mos-recale": 1, pont: 1 };
  const niveau = (genre, ro) => (NIVEAU_VERIFIE[genre] ? "verifie" : genre === "mos-direct" ? (ro ? "verifie" : "probable") : genre === "probable" || genre === "rond-seul" ? (ro ? "verifie" : "probable") : "non");
  const verifie = (e) => niveau(e.genre, e.ringOk) === "verifie";
  function poserPonts(ech, Hn, maxLongueur, tolPx) {
    let ajoutes = 0, j = 0;
    while (j < ech.length) {
      if (verifie(ech[j])) { j++; continue; }
      let b = j; while (b + 1 < ech.length && !verifie(ech[b + 1])) b++;
      const a0 = j - 1, b0 = b + 1;
      if (a0 >= 0 && b0 < ech.length && b - j + 1 <= maxLongueur && verifie(ech[a0]) && verifie(ech[b0])) {
        for (let q = j; q <= b; q++) {
          const Pa = projecteur(Hn(q), ech[a0].c, ech[a0].dx, ech[a0].dy), Pb = projecteur(Hn(q), ech[b0].c, ech[b0].dx, ech[b0].dy), e = ecartProjecteurs(Pa, Pb);
          if (e === null || e > tolPx) { ech.slice(j, q).forEach((x) => { x.genre = "non"; x.c = null; x.dx = 0; x.dy = 0; }); ajoutes -= q - j; break; }
          ech[q].genre = "pont"; ech[q].c = ech[a0].c; ech[q].dx = ech[a0].dx; ech[q].dy = ech[a0].dy; ech[q].s = null; ajoutes++;
        }
      }
      j = b + 1;
    }
    return ajoutes;
  }

  /* ---------- orientation et dimensions : d'après le calibrage du coach (caméra fixe) ---------- */
  const D4 = [[1, 0, 0, 1], [1, 0, 0, -1], [-1, 0, 0, 1], [-1, 0, 0, -1], [0, 1, 1, 0], [0, 1, -1, 0], [0, -1, 1, 0], [0, -1, -1, 0]];
  /* points : [{ id, ix, iy }] (pixels de la vidéo), vw : largeur de la vidéo ; res : résultat d'analyser (distance et hauteur de la caméra).
     Rend { ok, M : [m0, m1, m2, m3] avec (u, v) = M · (X − L/2, Y − W/2), erreur (px sur 480), marge } ; ok seulement si la meilleure orientation est nettement meilleure que les autres. */
  function orienterCalibrage(points, vw, L, Wd, res, o) {
    o = o || {}; const f480 = W / vw, lm = {}; HG.landmarks(L, Wd).forEach((l) => { lm[l.id] = l; });
    const pts = (points || []).filter((p) => lm[p.id]).map((p) => ({ X: lm[p.id].x - L / 2, Y: lm[p.id].y - Wd / 2, px: p.ix * f480, py: p.iy * f480 }));
    if (!res || !res.ok || pts.length < 4) return { ok: false, raison: "Calibrage insuffisant" };
    const fovs = o.fovs || [res.fov, 80, 70, 62], d0 = res.q[0], h0 = res.q[1], R = rnd(o.seed || 21), out = [];
    D4.forEach((m, mi) => {
      const uv = pts.map((p) => [m[0] * p.X + m[1] * p.Y, m[2] * p.X + m[3] * p.Y]);
      let best = null, bestFov = null;
      for (const fov of fovs) {
        const f = (v) => { if (v[1] < 0.05 || v[1] > 1.3 || Math.abs(v[2]) > 0.3) return 1e4; const Hn = poseH([-d0, 0, h0, v[0], v[1], v[2]], fov); let t = 0; for (let i = 0; i < pts.length; i++) { const q = versPixel(Hn, uv[i][0], uv[i][1]); if (!q) return 1e4; t += Math.hypot(q[0] - pts[i].px, q[1] - pts[i].py); } return t / pts.length; };
        for (let s = 0; s < (o.essais || 40); s++) { const r = nelderMead(f, [-3.1 + 6.2 * R(), 0.1 + 1.0 * R(), -0.1 + 0.2 * R()], [0.3, 0.1, 0.03], 150); if (!best || r.f < best.f) { best = r; bestFov = fov; } }
      }
      out.push({ mi, m, f: best.f, x: best.x, fov: bestFov });
    });
    out.sort((a, b) => a.f - b.f);
    const a = out[0], b = out[1];
    return { ok: a.f < 0.7 * b.f && a.f < 60, M: a.m, erreur: a.f, secondeErreur: b.f, cap: a.x[0], inclinaison: a.x[1], roulis: a.x[2], fov: a.fov };
  }

  /* ---------- conversion vers le repère du programme ---------- */
  const corrMat = (c, cx, cy) => {
    if (!c) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const co = Math.cos(c.a), si = Math.sin(c.a);
    return [c.s * co, -c.s * si, cx - c.s * (co * cx - si * cy) + c.tx, c.s * si, c.s * co, cy - c.s * (si * cx + co * cy) + c.ty, 0, 0, 1];
  };
  /* homographie pixels de la vidéo (vw × vh) -> terrain du programme (X le long de la longueur depuis le but gauche, Y sur la largeur, mètres) pour l'image décrite par proj
     (voir projectionImage) ; M : orientation ; L, Wd : dimensions du terrain du programme. */
  function homographieProgramme(proj, M, L, Wd, vw, vh) {
    const Npix = [F480, 0, W / 2, 0, F480, H / 2, 0, 0, 1], Hpix = mul(Npix, proj.Hn), rp = rondProjete(proj.Hn);
    const T = mul([1, 0, proj.dx || 0, 0, 1, proj.dy || 0, 0, 0, 1], corrMat(proj.c, rp.cx, rp.cy));
    const Muv = [M[0], M[1], -(M[0] * L / 2 + M[1] * Wd / 2), M[2], M[3], -(M[2] * L / 2 + M[3] * Wd / 2), 0, 0, 1];
    const Sinv = [vw / W, 0, 0, 0, vh / H, 0, 0, 0, 1];
    const terrainVersPixel = mul(Sinv, mul(T, mul(Hpix, Muv)));
    try { const h = inv(terrainVersPixel); return h.every(Number.isFinite) ? h : null; } catch (_e) { return null; }
  }

  /* ---------- troisième preuve : le but détecté ---------- */
  /* Une image « probable » (localisation directe, autre zoom) devient VÉRIFIÉE si le but détecté dans cette image tombe là où la pose le place (pieds du but à moins de tolPx
     pixels sur 1920) et si sa mosaïque atteint 0,50. detections : { [indice d'échantillon] : [{ x0, x1, y1, score }] } en pixels 480×270. La longueur est celle MESURÉE sur les images
     déjà vérifiées qui montrent un but (même convention de cadre), à défaut la demi-longueur donnée. Rend le nombre d'images promues. */
  function promouvoirParButs(res, G, detections, o) {
    o = o || {}; if (!res || !res.ok) return 0;
    const tol = (o.tolPx || 60) / 4, dflt = o.demiLongueur || 20, bas = (b) => b.y1;
    const erreur = (P, b, v) => { const p = P(-1.5, v), q = P(1.5, v); if (!p || !q) return 1e9; return Math.min((Math.hypot(p[0] - b.x0, p[1] - bas(b)) + Math.hypot(q[0] - b.x1, q[1] - bas(b))) / 2, (Math.hypot(p[0] - b.x1, p[1] - bas(b)) + Math.hypot(q[0] - b.x0, q[1] - bas(b))) / 2); };
    const meilleurBut = (j) => { const l = (detections[j] || []).filter((b) => (b.score == null || b.score >= 0.5)).sort((a, b) => (b.score || 0) - (a.score || 0)); return l[0] || null; };
    // 1. demi-longueurs mesurées (une par côté) sur les images vérifiées
    const lignes = []; res.echantillons.forEach((e, j) => { const b = meilleurBut(j); if (!b) return; const pr = projectionImage(res, G, e.k); if (pr && pr.niveau === "verifie") lignes.push({ P: pr.P, b }); });
    const cherche = (sgn) => { let best = null; for (let h = 17; h <= 25; h += 0.25) { const es = lignes.map((r) => erreur(r.P, r.b, sgn * h)); const bons = es.filter((x) => x < 12); if (bons.length >= 3 && (!best || bons.length > best.n || (bons.length === best.n && h < best.h))) best = { h, n: bons.length }; } return best ? best.h : dflt; };
    const hp = lignes.length >= 6 ? cherche(1) : dflt, hm = lignes.length >= 6 ? cherche(-1) : dflt;
    // 2. promotion
    let n = 0;
    res.echantillons.forEach((e, j) => {
      if ((e.genre !== "probable" && e.genre !== "rond-seul") || e.ro || !(e.s >= 0.5)) return; const b = meilleurBut(j); if (!b) return;
      const pr = projectionImage(res, G, e.k); if (!pr) return;
      if (Math.min(erreur(pr.P, b, hp), erreur(pr.P, b, -hm)) <= tol) { e.ro = true; e.preuveBut = true; n++; }
    });
    // 3. veto : une image vérifiée où le but détecté tombe loin de l'endroit prévu (plus de 70 px sur 1920, + 20 % de la largeur du cadre) redevient « non analysée »
    let veto = 0;
    res.echantillons.forEach((e, j) => {
      if (e.genre === "non" || e.genre === "pont" || niveau(e.genre, e.ro) !== "verifie" || e.preuveBut) return; const bt = meilleurBut(j); if (!bt) return;
      const pr = projectionImage(res, G, e.k); if (!pr) return;
      const largeur = Math.abs(bt.x1 - bt.x0) * 4, tolVeto = (o.vetoPx || 70) + 0.2 * largeur, er = Math.min(erreur(pr.P, bt, hp), erreur(pr.P, bt, -hm)) * 4;
      if (er > tolVeto) { e.genre = "non"; e.c = null; e.dx = 0; e.dy = 0; e.ori = null; e.fov = null; e.ro = false; veto++; }
    });
    res.stats.verifiees = res.echantillons.filter((e) => niveau(e.genre, e.ro) === "verifie").length; res.stats.probables = res.echantillons.filter((e) => niveau(e.genre, e.ro) === "probable").length; res.stats.non = res.echantillons.filter((e) => e.genre === "non").length; res.stats.veto = veto;
    res.butsMesures = { hp, hm, images: lignes.length };
    return n;
  }
  /* projection terrain (u, v) -> pixel 480×270 de l'image k du suivi global, ou null si cette image n'est pas vérifiée */
  function projectionImage(res, G, k) {
    if (!res || !res.ok) return null;
    const j = Math.round(k / res.pas), e = res.echantillons[Math.max(0, Math.min(res.echantillons.length - 1, j))];
    if (!e || e.genre === "non" || Math.abs(e.k - k) > res.pas / 2 + 0.5) return null;
    const Hs = e.ori ? poseH([-res.d0, 0, res.h0, e.ori[0], e.ori[1], e.ori[2]], e.fov) : mul(mul(G[e.k], inv(G[res.kref])), res.Hr);
    const Hn = e.ori ? mul(mul(G[k], inv(G[e.k])), Hs) : mul(mul(G[k], inv(G[res.kref])), res.Hr);
    return { Hn, c: e.c, dx: e.dx, dy: e.dy, genre: e.genre, niveau: niveau(e.genre, e.ro), probable: niveau(e.genre, e.ro) === "probable", P: projecteur(Hn, e.c, e.dx, e.dy) };
  }

  return { W, H, FOV_DEFAUT, RAYON_ROND, poseH, poseDepuisRond, versPixel, pointsRond, ajusterConique, conique2ellipse, detecterEllipse, distEllipse, poseDepuisEllipse, residuRond, carteNoire, carteLignes8, ajusterRond, batirMosaique, scoreMosaique, projecteur, analyser, projectionImage, promouvoirParButs, niveau, orienterCalibrage, homographieProgramme, ecartProjecteurs, poserPonts, D4, nelderMead, setF480: (v) => { F480 = v; }, getF480: () => F480, rnd, mul, inv };
});
