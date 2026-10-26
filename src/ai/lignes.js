/* Recalage du terrain sur les vraies lignes de l'image.
   Le suivi de la caméra donne une projection (pixels -> terrain) qui dérive peu à peu. Ici, on cherche dans l'image les traits de la couleur de lignes
   donnée par l'utilisateur (jamais une couleur devinée), et on déplace légèrement la projection pour que le modèle du terrain (cercle central, ligne
   médiane, touches, surfaces) tombe sur ces traits.
   - La correction est une petite similitude de l'image (translation, rotation, échelle) : elle ne déforme pas le terrain.
   - Elle n'est APPLIQUÉE que si le score s'améliore nettement, si le déplacement reste plausible, si assez de lignes sont vues dans des directions
     différentes et si la solution est unique (une seconde solution aussi bonne ailleurs = doute, on garde le suivi).
   - Tout est en pixels de l'image de travail (largeur ~480) ; Hw : pixels de travail -> terrain (mètres). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./homography"), require("./court-fit"));
  else root.FutsalLignes = factory(root.FutsalHomography, root.FutsalCourtFit);
})(typeof self !== "undefined" ? self : this, function (HG, CF) {
  "use strict";

    const PROCHE = 2.5;
  const LONG_MAX = 6;        // px : longueur de trait représentée par un point du modèle (plafonnée) : un modèle écrasé près de l horizon pèse très peu
  const LIM = {              // limites de la correction (plausibilité)
    local: { t: 28, rot: 4, ech: 0.08 },       // px (largeur 480), degrés, part
    global: { tx: 0.42, ty: 0.3, rot: 6, ech: 0.15 }
  };
  const SEUILS = {
    gain: 40,                // le vote (longueur de trait retrouvée, en px) doit gagner au moins ça…
    gainRel: 0.3,            // …et 30 %
    pointsMin: 120,          // longueur de traits retrouvés (px de l image de travail) : au moins ça
    observ: 0.12,            // valeur propre mini normalisée des directions des traits vus (sinon on ne sait pas dans quel sens glisser)
    unique: 0.85,            // une autre solution éloignée doit avoir un vote inférieur à 85 % du meilleur
    uniqueGlobal: 0.75
  };

  /* ---------- carte des traits ---------- */
  /* rgba : { data (RGBA), width, height } ; couleur : clé de CF.COLORS. Rend { w, h, mask, D } (D : distance au trait le plus proche, en pixels). */
  function carte(rgba, couleur, profil) {
    if (couleur === "custom" ? !(profil && profil.tol > 0) : !CF.COLORS[couleur]) throw new Error("Couleur de lignes inconnue");
    const work = CF.prepare(rgba, rgba.width), rm = CF.ridgeMap(work, couleur, couleur === "custom" ? profil : null);
    return { w: rm.w, h: rm.h, mask: rm.mask, D: CF.distanceTransform(rm.mask, rm.w, rm.h) };
  }

  /* ---------- modèle du terrain : polylignes (mètres) ---------- */
  function arc(cx, cy, r, a0, a1, step) {
    const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * Math.PI / 180 * r) / step)), out = [];
    for (let i = 0; i <= n; i++) { const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return out;
  }
  const seg = (x0, y0, x1, y1, step) => { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step)), o = []; for (let i = 0; i <= n; i++) o.push([x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]); return o; };
  /* Groupes d'éléments du terrain (pour donner la priorité à ceux que l'utilisateur a choisis au calibrage). */
  const GROUPES = ["cercle", "mediane", "touches", "buts", "gauche", "droite"];
  /* Éléments choisis au calibrage (identifiants de HG.landmarks) -> groupes prioritaires. */
  function groupesDepuisRepères(ids) {
    const s = new Set();
    (ids || []).forEach((id) => {
      if (/^circle|^center/.test(id)) s.add("cercle");
      else if (/^mid_/.test(id)) { s.add("mediane"); s.add("touches"); }
      else if (/^corner/.test(id)) s.add("touches");
      else if (/^l_/.test(id)) s.add("gauche");
      else if (/^r_/.test(id)) s.add("droite");
    });
    return [...s];
  }
  /* Rend { pts: [{ x, y, tx, ty, w, g }] } : points du modèle (mètres), tangente unitaire, poids (1 = trait plein, 0,5 = pointillés), groupe. */
  function modele(L, W, opts) {
    const o = Object.assign({ step: 0.3, prio: [], rayon: 3, pointilles: true }, opts || {}), pts = [], cy = W / 2, post = 1.5;
    const add = (poly, w, g) => {
      const boost = o.prio.indexOf(g) >= 0 ? 2 : 1;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[Math.max(0, i - 1)], b = poly[Math.min(poly.length - 1, i + 1)], d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        pts.push({ x: poly[i][0], y: poly[i][1], tx: (b[0] - a[0]) / d, ty: (b[1] - a[1]) / d, w: w * boost, g });
      }
    };
    add(seg(0, 0, L, 0, o.step), 1, "touches"); add(seg(0, W, L, W, o.step), 1, "touches");
    add(seg(0, 0, 0, W, o.step), 1, "buts"); add(seg(L, 0, L, W, o.step), 1, "buts");
    add(seg(L / 2, 0, L / 2, W, o.step), 1, "mediane");
    add(arc(L / 2, cy, o.rayon, 0, 360, o.step), 1, "cercle");
    [0, 1].forEach((end) => {
      const sg = end ? -1 : 1, x0 = end ? L : 0, g = end ? "droite" : "gauche";
      add(arc(0, 0, 6, 0, 90, o.step).map((p) => [x0 + sg * p[0], cy + post + p[1]]), 1, g);
      add(arc(0, 0, 6, 0, -90, o.step).map((p) => [x0 + sg * p[0], cy - post + p[1]]), 1, g);
      add(seg(x0 + sg * 6, cy - post, x0 + sg * 6, cy + post, o.step), 1, g);
      if (o.pointilles) {
        add(arc(0, 0, 9, 0, 90, o.step).map((p) => [x0 + sg * p[0], cy + post + p[1]]), 0.5, g);
        add(arc(0, 0, 9, 0, -90, o.step).map((p) => [x0 + sg * p[0], cy - post + p[1]]), 0.5, g);
        add(seg(x0 + sg * 9, cy - post, x0 + sg * 9, cy + post, o.step), 0.5, g);
      }
    });
    return { pts, L, W };
  }

  /* ---------- projection du modèle et score ---------- */
  /* Points du modèle visibles dans l'image selon Hw (pixels -> terrain) : { q: Float32Array [u, v, ...], w, tx, ty (tangente en pixels), n }. */
  function projeter(mod, Hw, w, h, marge) {
    const Hi = HG.invert(Hw), m = marge == null ? 0 : marge, q = [], ws = [], tg = [];
    mod.pts.forEach((p) => {
      const a = HG.apply(Hi, p.x, p.y), b = HG.apply(Hi, p.x + p.tx * 0.2, p.y + p.ty * 0.2);
      if (!isFinite(a[0]) || !isFinite(a[1]) || !isFinite(b[0]) || !isFinite(b[1])) return;
      if (a[0] < -m || a[1] < -m || a[0] > w + m || a[1] > h + m) return;
      const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
      q.push(a[0], a[1]); ws.push(p.w * Math.min(LONG_MAX, d * 1.5)); tg.push(dx / d, dy / d);
    });
    return { q: Float32Array.from(q), w: Float32Array.from(ws), tg: Float32Array.from(tg), n: ws.length };
  }
  /* Correction c = [tx, ty, rot (rad), ln(échelle)] autour du centre de l'image : p = centre + s R (q - centre) + t. */
  /* Vote : longueur de ligne (en nombre de points pondérés) qui tombe sur un trait ; un point sans trait ne coûte rien (dans cette salle seules
     quelques lignes du modèle sont de la couleur choisie). large : largeur du noyau (px), grande au début de la recherche pour attirer de loin. */
  function vote(P, c, D, w, h, large, pas) {
    const cs = Math.cos(c[2]), sn = Math.sin(c[2]), s = Math.exp(c[3]), cx = w / 2, cy = h / 2, st = pas || 1, l2 = large * large;
    let somme = 0;
    for (let i = 0; i < P.n; i += st) {
      const x = P.q[2 * i] - cx, y = P.q[2 * i + 1] - cy;
      const u = cx + s * (cs * x - sn * y) + c[0], v = cy + s * (sn * x + cs * y) + c[1];
      if (u < 1 || v < 1 || u >= w - 2 || v >= h - 2) continue;       // sorti de l'image : ne compte pas
      const d = D[(v | 0) * w + (u | 0)];
      if (d < large) somme += P.w[i] * (1 - (d * d) / l2);
    }
    return somme * st;
  }
  /* Détails d'une correction : nombre de points (pondéré) sur un trait, écart moyen (px) de ces points, observabilité des directions des traits vus. */
  function detail(P, c, D, w, h) {
    const cs = Math.cos(c[2]), sn = Math.sin(c[2]), s = Math.exp(c[3]), cx = w / 2, cy = h / 2;
    let tot = 0, sur = 0, dm = 0, nm = 0, sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < P.n; i++) {
      const x = P.q[2 * i] - cx, y = P.q[2 * i + 1] - cy;
      const u = cx + s * (cs * x - sn * y) + c[0], v = cy + s * (sn * x + cs * y) + c[1];
      if (u < 1 || v < 1 || u >= w - 2 || v >= h - 2) continue;
      const d = D[(v | 0) * w + (u | 0)];
      tot += P.w[i];
      if (d <= PROCHE) {
        sur += P.w[i]; dm += d; nm++;
        const tx = cs * P.tg[2 * i] - sn * P.tg[2 * i + 1], ty = sn * P.tg[2 * i] + cs * P.tg[2 * i + 1], nx = -ty, ny = tx;   // normale au trait
        sxx += nx * nx; sxy += nx * ny; syy += ny * ny;
      }
    }
    const tr = sxx + syy, det = sxx * syy - sxy * sxy, mini = nm ? (tr / 2 - Math.sqrt(Math.max(0, (tr * tr) / 4 - det))) / nm : 0;
    return { sur, n: nm, ecart: nm ? dm / nm : null, observ: mini, vis: tot };
  }

  /* Recherche locale (pattern search) de la meilleure correction à partir de c0, dans les limites lim ; le noyau du vote se resserre peu à peu. */
  function raffiner(P, c0, D, w, h, lim) {
    let c = c0.slice();
    const pas = [5, 5, 1.5 * Math.PI / 180, 0.025], noyaux = [12, 7, 4, 3, 3, 3];
    const borne = (k, v) => k === 0 ? Math.max(-lim.tx, Math.min(lim.tx, v)) : k === 1 ? Math.max(-lim.ty, Math.min(lim.ty, v)) : k === 2 ? Math.max(-lim.rot, Math.min(lim.rot, v)) : Math.max(-lim.ln, Math.min(lim.ln, v));
    for (let it = 0; it < noyaux.length; it++) {
      let f = vote(P, c, D, w, h, noyaux[it], 1), mieux = true, garde = 0;
      while (mieux && garde++ < 40) {
        mieux = false;
        for (let k = 0; k < 4; k++) for (const sg of [1, -1]) {
          const t = c.slice(); t[k] = borne(k, t[k] + sg * pas[k]);
          const r = vote(P, t, D, w, h, noyaux[it], 1);
          if (r > f + 1e-6) { c = t; f = r; mieux = true; }
        }
      }
      for (let k = 0; k < 4; k++) pas[k] /= 1.7;
    }
    return { c, f: vote(P, c, D, w, h, 3, 1) };
  }

  /* Cherche la correction de Hw. ouvert = true : recherche sur toute l'image (grande dérive), sinon recherche locale.
     Rend { ok, changed, Hw (corrigé, ou Hw si rien n'est changé), c, vote0, vote1, detail0, detail1, deplacement (px), raison }. */
  function affiner(carteL, Hw, mod, opts) {
    const o = Object.assign({ ouvert: false, depart: null }, opts || {}), { w, h, D } = carteL;
    const lim = o.ouvert ? { tx: LIM.global.tx * w, ty: LIM.global.ty * h, rot: LIM.global.rot * Math.PI / 180, ln: Math.log(1 + LIM.global.ech) }
      : { tx: LIM.local.t, ty: LIM.local.t, rot: LIM.local.rot * Math.PI / 180, ln: Math.log(1 + LIM.local.ech) };
    const P = projeter(mod, Hw, w, h, 0);
    const refus = (raison, extra) => Object.assign({ ok: false, changed: false, Hw, raison }, extra || {});
    if (P.n < 80) return refus("trop peu de terrain visible");
    const c0 = [0, 0, 0, 0], v0 = vote(P, c0, D, w, h, 3, 1), d0 = detail(P, c0, D, w, h);
    // départs : la correction courante, plus (recherche ouverte) les meilleures translations d'une grille
    const departs = [(o.depart || c0).slice()];
    if (o.ouvert) {
      const pas = 8, cand = [];
      for (let ty = -lim.ty; ty <= lim.ty; ty += pas) for (let tx = -lim.tx; tx <= lim.tx; tx += pas) cand.push([vote(P, [tx, ty, 0, 0], D, w, h, 10, 2), tx, ty]);
      cand.sort((a, b) => b[0] - a[0]);
      for (const k of cand) { if (departs.length >= 7) break; if (departs.every((d) => Math.hypot(d[0] - k[1], d[1] - k[2]) > 14)) departs.push([k[1], k[2], 0, 0]); }
    }
    const sols = departs.map((d) => raffiner(P, d, D, w, h, lim)).sort((a, b) => b.f - a.f);
    const best = sols[0], deplacement = Math.hypot(best.c[0], best.c[1]);
    const autre = sols.find((s) => Math.hypot(s.c[0] - best.c[0], s.c[1] - best.c[1]) > 10 || Math.abs(s.c[2] - best.c[2]) > 0.03 || Math.abs(s.c[3] - best.c[3]) > 0.06);
    const d1 = detail(P, best.c, D, w, h);
    const info = { vote0: v0, vote1: best.f, detail0: d0, detail1: d1, deplacement, c: best.c };
    const cale0 = d0.sur >= SEUILS.pointsMin && d0.observ >= SEUILS.observ && best.f <= v0 * (1 + SEUILS.gainRel);
    if (cale0) return Object.assign({ ok: true, changed: false, Hw, raison: "déjà sur les lignes" }, info);
    if (d1.sur < SEUILS.pointsMin) return refus("trop peu de lignes retrouvées", info);
    if (d1.observ < SEUILS.observ) return refus("lignes vues dans une seule direction : le glissement le long d'elles n'est pas déterminé", info);
    if (!(best.f >= v0 * (1 + SEUILS.gainRel) && best.f - v0 >= SEUILS.gain)) return refus("amélioration trop faible", info);
    if (autre && autre.f > best.f * (o.ouvert ? SEUILS.uniqueGlobal : SEUILS.unique)) return refus("deux positions possibles presque aussi bonnes", info);
    const G = matG(best.c, w, h), Hn = HG.mul3(Hw, HG.invert(G));
    return Object.assign({ ok: true, changed: true, Hw: Hn, raison: "recalé sur les lignes" }, info);
  }
  /* ---------- pose de la caméra ----------
     La projection du suivi peut se déformer peu à peu (perspective impossible). On la ramène à une vraie caméra : pose = [x, y, hauteur (m), cap°,
     inclinaison°, champ horizontal°, roulis°] ; la perspective reste alors celle d'une caméra réelle. Repère : celui de court-fit (y vers le haut) ;
     le modèle du terrain est symétrique, il sert tel quel. */
  const PLAGE = { lo: [-60, -60, 1.5, -720, 2, 40, -15], hi: [100, 80, 16, 720, 80, 110, 15] };
  const poseVersImage = (pose, w, h, x, y, z) => {
    const B = CF.cameraBasis(pose), p = CF.project(B, CF.focalPx(w, pose[5]), w, h, x, y, z || 0);
    if (!p) return null;
    const r = (pose[6] || 0) * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r), dx = p.u - w / 2, dy = p.v - h / 2;
    return [w / 2 + cs * dx - sn * dy, h / 2 + sn * dx + cs * dy];
  };
  /* Levenberg-Marquardt (jacobienne numérique) borné. */
  function lm(pose, resid, free, lo, hi, iters) {
    let p = pose.slice(), r = resid(p), cost = r.reduce((s, v) => s + v * v, 0), lambda = 1e-2;
    const eps = [1e-3, 1e-3, 1e-3, 2e-3, 2e-3, 2e-3, 2e-3];
    for (let it = 0; it < iters; it++) {
      const J = free.map((d) => { const q = p.slice(); q[d] += eps[d]; const r2 = resid(q); return r2.map((v, i) => (v - r[i]) / eps[d]); });
      const n = free.length, A = Array.from({ length: n }, () => new Array(n).fill(0)), g = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) { let s = 0; for (let k = 0; k < r.length; k++) s += J[i][k] * J[j][k]; A[i][j] = s; }
        let s = 0; for (let k = 0; k < r.length; k++) s += J[i][k] * r[k]; g[i] = -s;
      }
      let improved = false;
      for (let tries = 0; tries < 8; tries++) {
        const Ad = A.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lambda) + 1e-9 : v)));
        const dx = CF.solveSmall(Ad, g);
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
  /* Pose qui reproduit au mieux la projection Hw (pixels de travail -> terrain, y vers le bas). depart : pose de départ (sinon plusieurs départs).
     Rend { pose, err (px, écart moyen sur une grille de l'image) } ou null. */
  function poseDepuisH(Hw, w, h, L, W, depart) {
    const world = [], img = [];
    for (let i = 1; i < 14; i++) for (let j = 1; j < 10; j++) {
      const u = (w * i) / 14, v = (h * j) / 10, g = HG.apply(Hw, u, v);
      if (!isFinite(g[0]) || !isFinite(g[1]) || g[0] < -25 || g[0] > L + 25 || g[1] < -25 || g[1] > W + 25) continue;
      world.push([g[0], W - g[1]]); img.push([u, v]);
    }
    if (world.length < 20) return null;
    const resid = (pose) => {
      const out = [];
      for (let i = 0; i < world.length; i++) { const p = poseVersImage(pose, w, h, world[i][0], world[i][1], 0); if (!p) out.push(400, 400); else out.push(p[0] - img[i][0], p[1] - img[i][1]); }
      return out;
    };
    const cout2 = (pose) => resid(pose).reduce((s, v) => s + v * v, 0);
    const free = [0, 1, 2, 3, 4, 5, 6];
    let starts = [];
    if (depart) starts.push(depart.slice());
    else {
      const cx0 = L / 2, cy0 = W / 2;
      for (let x = -4; x <= L + 4; x += 8) for (const y of [-16, -10, -5, 3, 10, 17, W + 5, W + 10, W + 16]) for (const hh of [4, 7, 11]) for (const pitch of [15, 28, 42]) for (const fov of [62, 80, 98]) for (const dyaw of [-70, 0, 70]) {
        const yaw = Math.atan2(cy0 - y, cx0 - x) * 180 / Math.PI + dyaw;
        starts.push([x, y, hh, yaw, pitch, fov, 0]);
      }
      starts = starts.map((p) => ({ p, c: cout2(p) })).sort((a, b) => a.c - b.c).slice(0, 20).map((t) => t.p);
    }
    let best = null;
    starts.forEach((p0) => { const r = lm(p0, resid, free, PLAGE.lo, PLAGE.hi, 70); if (!best || r.cost < best.cost) best = r; });
    if (!best) return null;
    const r = resid(best.pose);
    let e = 0; for (let i = 0; i < r.length; i += 2) e += Math.hypot(r[i], r[i + 1]);
    return { pose: best.pose, err: e / (r.length / 2) };
  }
  /* Projection pixels de travail -> terrain (y vers le bas, comme les calibrages) d'une pose, ajustée sur une grille de points du sol. */
  function hDepuisPose(pose, w, h, L, W) {
    const src = [], dst = [], B = CF.cameraBasis(pose), f = CF.focalPx(w, pose[5]), r = (pose[6] || 0) * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
    for (let i = 1; i <= 12; i++) for (let j = 1; j <= 10; j++) {
      const u = (w * i) / 13, v = (h * j) / 11, dx = u - w / 2, dy = v - h / 2;
      const ur = w / 2 + cs * dx + sn * dy, vr = h / 2 - sn * dx + cs * dy;     // annule le roulis
      const g = CF.groundAt(B, f, w, h, ur, vr);
      if (!g || g[0] < -40 || g[0] > L + 40 || g[1] < -40 || g[1] > W + 40) continue;
      src.push([u, v]); dst.push([g[0], W - g[1]]);
    }
    if (src.length < 12) return null;
    try { return HG.solve(src, dst); } catch (_e) { return null; }
  }
  /* Points du modèle vus par la pose : même forme que projeter(). */
  function projeterPose(mod, pose, w, h) {
    const q = [], ws = [], tg = [];
    mod.pts.forEach((p) => {
      const a = poseVersImage(pose, w, h, p.x, p.y, 0), b = poseVersImage(pose, w, h, p.x + p.tx * 0.2, p.y + p.ty * 0.2, 0);
      if (!a || !b || a[0] < 0 || a[1] < 0 || a[0] > w || a[1] > h) return;
      const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
      q.push(a[0], a[1]); ws.push(p.w * Math.min(LONG_MAX, d * 1.5)); tg.push(dx / d, dy / d);
    });
    return { q: Float32Array.from(q), w: Float32Array.from(ws), tg: Float32Array.from(tg), n: ws.length };
  }
  const SANS = [0, 0, 0, 0];
  /* Recherche locale de la pose (cap, inclinaison, champ, roulis ; position bornée près de pose0) qui met le plus de lignes du modèle sur les traits. */
  function affinerPose(carteL, pose0, mod, opts) {
    const o = Object.assign({ ouvert: false, posRange: [1.5, 1.5, 0.6] }, opts || {}), { w, h, D } = carteL;
    const marge = o.ouvert ? [14, 9, 18, 6] : [4, 2.5, 7, 3];         // cap°, inclinaison°, champ (%), roulis° : limites autour de la pose de départ
    const lo = pose0.slice(), hi = pose0.slice();
    for (let k = 0; k < 3; k++) { lo[k] = pose0[k] - o.posRange[k]; hi[k] = pose0[k] + o.posRange[k]; }
    lo[2] = Math.max(PLAGE.lo[2], lo[2]);
    lo[3] = pose0[3] - marge[0]; hi[3] = pose0[3] + marge[0]; lo[4] = Math.max(PLAGE.lo[4], pose0[4] - marge[1]); hi[4] = Math.min(PLAGE.hi[4], pose0[4] + marge[1]);
    lo[5] = pose0[5] * (1 - marge[2] / 100); hi[5] = pose0[5] * (1 + marge[2] / 100); lo[6] = Math.max(PLAGE.lo[6], pose0[6] - marge[3]); hi[6] = Math.min(PLAGE.hi[6], pose0[6] + marge[3]);
    if (o.ref) {      // bornes physiques autour de la pose du calibrage : la caméra ne change pas de place ni de zoom au point de devenir autre chose
      for (let k = 0; k < 3; k++) { lo[k] = Math.max(lo[k], o.ref[k] - 3); hi[k] = Math.min(hi[k], o.ref[k] + 3); }
      lo[4] = Math.max(lo[4], 5); lo[5] = Math.max(lo[5], o.ref[5] * 0.7); hi[5] = Math.min(hi[5], o.ref[5] * 1.4);
    }
    const fv = (pose, large) => vote(projeterPose(mod, pose, w, h), SANS, D, w, h, large, 1);
    const raf = (start) => {
      let p = start.slice();
      const pas = [0.3, 0.3, 0.12, 0.8, 0.5, 1.2, 0.4], noyaux = [12, 7, 4, 3, 3];
      for (let it = 0; it < noyaux.length; it++) {
        let f = fv(p, noyaux[it]), mieux = true, garde = 0;
        while (mieux && garde++ < 40) {
          mieux = false;
          for (let k = 0; k < 7; k++) for (const sg of [1, -1]) {
            const q = p.slice(); q[k] = Math.max(lo[k], Math.min(hi[k], q[k] + sg * pas[k]));
            if (q[k] === p[k]) continue;
            const r = fv(q, noyaux[it]);
            if (r > f + 1e-6) { p = q; f = r; mieux = true; }
          }
        }
        for (let k = 0; k < 7; k++) pas[k] /= 1.7;
      }
      return { p, f: fv(p, 3) };
    };
    const P0 = projeterPose(mod, pose0, w, h);
    if (P0.n < 60) return { ok: false, changed: false, raison: "trop peu de terrain visible" };
    const v0 = vote(P0, SANS, D, w, h, 3, 1), d0 = detail(P0, SANS, D, w, h);
    const starts = [pose0.slice()];
    if (o.ouvert) {                                  // plusieurs départs sur la plage de cap / inclinaison
      for (const dy of [-0.6, 0, 0.6]) for (const dp of [-0.6, 0, 0.6]) if (dy || dp) { const p = pose0.slice(); p[3] += dy * marge[0]; p[4] += dp * marge[1]; starts.push(p); }
    }
    const sols = starts.map(raf).sort((a, b) => b.f - a.f);
    const best = sols[0], P1 = projeterPose(mod, best.p, w, h), d1 = detail(P1, SANS, D, w, h);
    const autre = sols.find((s) => Math.abs(s.p[3] - best.p[3]) > 1.5 || Math.abs(s.p[4] - best.p[4]) > 1 || Math.abs(s.p[5] / best.p[5] - 1) > 0.05);
    const info = { vote0: v0, vote1: best.f, detail0: d0, detail1: d1, pose: best.p };
    const cale0 = d0.sur >= SEUILS.pointsMin && d0.observ >= SEUILS.observ && best.f <= v0 * (1 + SEUILS.gainRel);
    if (cale0) return Object.assign({ ok: true, changed: false, raison: "déjà sur les lignes" }, info);
    if (d1.sur < SEUILS.pointsMin) return Object.assign({ ok: false, changed: false, raison: "trop peu de lignes retrouvées" }, info);
    if (d1.observ < SEUILS.observ) return Object.assign({ ok: false, changed: false, raison: "lignes vues dans une seule direction" }, info);
    if (!(best.f >= v0 * (1 + SEUILS.gainRel) && best.f - v0 >= SEUILS.gain)) return Object.assign({ ok: false, changed: false, raison: "amélioration trop faible" }, info);
    if (autre && autre.f > best.f * (o.ouvert ? SEUILS.uniqueGlobal : SEUILS.unique)) return Object.assign({ ok: false, changed: false, raison: "deux positions possibles presque aussi bonnes" }, info);
    return Object.assign({ ok: true, changed: true, raison: "recalé sur les lignes" }, info);
  }

  /* Point du sol vu par le pixel (u, v) de la pose (roulis retiré), ou null au-dessus de l'horizon. */
  function solSous(pose, w, h, u, v) {
    const r = (pose[6] || 0) * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r), dx = u - w / 2, dy = v - h / 2;
    return CF.groundAt(CF.cameraBasis(pose), CF.focalPx(w, pose[5]), w, h, w / 2 + cs * dx + sn * dy, h / 2 - sn * dx + cs * dy);
  }
  /* Nouvelle pose après un mouvement d'image Hm (pixels de l'image précédente -> pixels de l'image courante, comme Cam.estimateMotion) :
     la caméra tourne (cap, inclinaison, roulis) et zoome (champ), sa position ne change pas. La perspective reste donc celle d'une vraie caméra.
     Rend { pose, err (px) } ou null. */
  function poseApres(pose1, Hm, w, h) {
    const g = [], t = [];
    for (let i = 1; i < 12; i++) for (let j = 1; j < 9; j++) {
      const u = (w * i) / 12, v = (h * j) / 9, s = solSous(pose1, w, h, u, v);
      if (!s || Math.hypot(s[0] - pose1[0], s[1] - pose1[1]) > 120) continue;
      const q = HG.apply(Hm, u, v);
      if (!isFinite(q[0]) || !isFinite(q[1])) continue;
      g.push(s); t.push(q);
    }
    if (g.length < 20) return null;
    const resid = (p) => {
      const out = [];
      for (let i = 0; i < g.length; i++) { const q = poseVersImage(p, w, h, g[i][0], g[i][1], 0); if (!q) out.push(300, 300); else out.push(q[0] - t[i][0], q[1] - t[i][1]); }
      return out;
    };
    const lo = PLAGE.lo.slice(), hi = PLAGE.hi.slice();
    const r = lm(pose1, resid, [3, 4, 5, 6], lo, hi, 25), e = resid(r.pose);
    let s = 0; for (let i = 0; i < e.length; i += 2) s += Math.hypot(e[i], e[i + 1]);
    return { pose: r.pose, err: s / (e.length / 2) };
  }
  /* Écart moyen (m) entre les points du sol que voient deux poses, sur une grille de pixels. */
  function ecartSol(p1, p2, w, h) {
    let s = 0, n = 0;
    for (let i = 1; i < 8; i++) for (let j = 4; j < 8; j++) {
      const u = (w * i) / 8, v = (h * j) / 8, a = solSous(p1, w, h, u, v), b = solSous(p2, w, h, u, v);
      if (a && b) { s += Math.hypot(a[0] - b[0], a[1] - b[1]); n++; }
    }
    return n ? s / n : Infinity;
  }
  /* ---------- couleur montrée par un clic, confusion, dimensions ---------- */
  /* Apprend la nuance d'une ligne à partir d'un clic de l'utilisateur dessus. rgba : { data, width, height } (image entière ou morceau), (cx, cy) : clic en pixels de rgba.
     Rend { ok: true, profil: { L, a, b, bg: [L, a, b], tol, tolL, spread, n } } ou { ok: false, raison }. Jamais de couleur devinée : si aucune ligne nette n'est vue, on le dit. */
  function profilDepuisClic(rgba, cx, cy) {
    const lab = (x, y) => { const i = (y * rgba.width + x) * 4; return CF.rgbToLab(rgba.data[i], rgba.data[i + 1], rgba.data[i + 2]); };
    const inside = (x, y) => x >= 0 && y >= 0 && x < rgba.width && y < rgba.height;
    const med = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };
    const x0 = Math.round(cx), y0 = Math.round(cy), ring = [], near = [];
    for (let dy = -18; dy <= 18; dy++) for (let dx = -18; dx <= 18; dx++) {
      const r = Math.hypot(dx, dy), x = x0 + dx, y = y0 + dy;
      if (!inside(x, y)) continue;
      if (r >= 11 && r <= 18) ring.push(lab(x, y)); else if (r <= 5) near.push(lab(x, y));
    }
    if (ring.length < 40 || near.length < 20) return { ok: false, raison: "trop près du bord de l'image" };
    const bg = [med(ring.map((p) => p[0])), med(ring.map((p) => p[1])), med(ring.map((p) => p[2]))];
    const de = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    const sorted = near.map((p) => ({ p, d: de(p, bg) })).sort((a, b) => b.d - a.d).slice(0, 12);
    if (sorted[sorted.length >> 1].d < 12) return { ok: false, raison: "je ne vois pas de ligne nette à cet endroit" };
    const line = [med(sorted.map((s) => s.p[0])), med(sorted.map((s) => s.p[1])), med(sorted.map((s) => s.p[2]))];
    const spread = med(sorted.map((s) => de(s.p, line))), gap = de(line, bg);
    const floorL = med(ring.map((p) => Math.abs(p[0] - bg[0])));       // variation de luminosité du sol alentour : reflets, ombres
    const gapL = Math.abs(line[0] - bg[0]), tol = Math.max(8, Math.min(0.6 * gap, 2.5 * spread + 6));
    // reflets : la luminosité peut s écarter jusqu à 40 % de l écart ligne / sol (au moins 6 + 2 fois la variation du sol), sans jamais atteindre la luminosité du sol (tolL + tol < écart)
    const tolL = Math.max(0, Math.min(Math.max(6 + 2 * floorL, 0.4 * gapL), 0.95 * gapL - tol));
    const r1 = (v) => Math.round(v * 10) / 10;
    return { ok: true, profil: { L: r1(line[0]), a: r1(line[1]), b: r1(line[2]), bg: bg.map(r1), tol: r1(tol), tolL: r1(tolL), spread: r1(spread), n: sorted.length } };
  }
  /* Confusion mesurée : part des pixels de la couleur choisie, vus sur le terrain, qui ne sont sur AUCUNE ligne attendue du modèle (à plus de 6 px) : joueurs, autres marquages
     de la salle, reflets. null s'il y a trop peu de pixels. Ces pixels ne servent pas au recalage (seules les lignes attendues comptent), mais la mesure dit à quel point la couleur est « polluée ». */
  function confusion(carteL, pose, mod, L, W) {
    const { w, h, mask } = carteL, m = new Uint8Array(w * h), P = projeterPose(mod, pose, w, h);
    for (let i = 0; i < P.n; i++) { const x = Math.round(P.q[2 * i]), y = Math.round(P.q[2 * i + 1]); if (x >= 0 && y >= 0 && x < w && y < h) m[y * w + x] = 1; }
    const Dm = CF.distanceTransform(m, w, h), B = CF.cameraBasis(pose), f = CF.focalPx(w, pose[5]), r = (pose[6] || 0) * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
    let total = 0; for (let i = 0; i < w * h; i++) total += mask[i];
    const step = Math.max(1, Math.floor(total / 500));
    let k = 0, n = 0, hors = 0;
    for (let i = 0; i < w * h; i++) {
      if (!mask[i]) continue;
      if ((k++ % step) !== 0) continue;
      const x = i % w, y = (i / w) | 0, dx = x - w / 2, dy = y - h / 2, g = CF.groundAt(B, f, w, h, w / 2 + cs * dx + sn * dy, h / 2 - sn * dx + cs * dy);
      if (!g || g[0] < -1.5 || g[0] > L + 1.5 || g[1] < -1.5 || g[1] > W + 1.5) continue;
      n++; if (Dm[i] > 6) hors++;
    }
    return n >= 30 ? hors / n : null;
  }
  /* Dimensions du terrain que les lignes de la couleur choisie suggèrent : pour chaque (L, W) d'une grille autour des dimensions courantes, la pose de chaque image est recalée
     localement et les votes s'additionnent. items : [{ carte, pose }] (images où les lignes sont nettes). Rend { L, W, gain (meilleur / courant - 1), propose } ;
     propose = le meilleur dépasse le courant d'au moins 4 % : sinon les lignes ne permettent pas de trancher et les dimensions courantes sont gardées. */
  const DIM_OPTS = { prio: ["cercle"], dL: 6, dW: 4, pas: 2, seuil: 0.15 };
  /* Vote des images pour un terrain (L, W) : la pose de chaque image est recalée localement. Rend [total, images paires, images impaires] : la proposition n'est faite que si
     les deux moitiés des images donnent la même réponse (mesuré : sur 4 vidéos de la même salle, une seule moitié donnait des dimensions différentes d'une vidéo à l'autre). */
  function voteDimensions(items, L, W, prio) {
    const mod = modele(L, W, { pointilles: false, prio: prio || DIM_OPTS.prio }), v = [0, 0, 0];
    items.forEach((it, i) => { const r = affinerPose(it.carte, it.pose, mod, { ouvert: false, posRange: [3, 3, 1.2] }), x = r.vote1 || r.vote0 || 0; v[0] += x; v[1 + (i % 2)] += x; });
    return v;
  }
  /* Grille des (L, W) essayés autour des dimensions courantes. */
  const grilleDimensions = (L0, W0, o) => { const g = []; for (let L = L0 - o.dL; L <= L0 + o.dL + 1e-6; L += o.pas) for (let W = W0 - o.dW; W <= W0 + o.dW + 1e-6; W += o.pas) g.push([L, W]); return g; };
  function choisirDimensions(tot, L0, W0, nImages, seuil) {
    const meilleur = (k) => Object.entries(tot).sort((a, b) => b[1][k] - a[1][k])[0][0];
    const cur = tot[L0 + "x" + W0][0], best = meilleur(0), [bl, bw] = best.split("x").map(Number), gain = cur > 0 ? tot[best][0] / cur - 1 : 0;
    const accord = meilleur(1) === best && meilleur(2) === best;
    return { L: bl, W: bw, gain: Math.round(gain * 1000) / 1000, accord, propose: accord && gain >= (seuil == null ? DIM_OPTS.seuil : seuil) && (bl !== L0 || bw !== W0), images: nImages };
  }
  function proposerDimensions(items, L0, W0, opts) {
    const o = Object.assign({}, DIM_OPTS, opts || {}), tot = {};
    if (!items || items.length < 3) return null;
    grilleDimensions(L0, W0, o).forEach(([L, W]) => { tot[L + "x" + W] = voteDimensions(items, L, W, o.prio); });
    return choisirDimensions(tot, L0, W0, items.length, o.seuil);
  }
  /* Matrice 3x3 (pixels -> pixels) de la correction c. */
  function matG(c, w, h) {
    const cs = Math.cos(c[2]), sn = Math.sin(c[2]), s = Math.exp(c[3]), cx = w / 2, cy = h / 2;
    // p = centre + s R (q - centre) + t
    return [s * cs, -s * sn, cx - s * (cs * cx - sn * cy) + c[0], s * sn, s * cs, cy - s * (sn * cx + cs * cy) + c[1], 0, 0, 1];
  }
  /* Correction c mise à l'échelle k (0 = aucune, 1 = entière) : répartition linéaire de la dérive entre deux recalages réussis. */
  const partie = (c, k) => [c[0] * k, c[1] * k, c[2] * k, c[3] * k];

  /* Mesure d'un tracé (sans le modifier) : { vote, n, ecart, observ }. */
  function mesure(carteL, Hw, mod) {
    const P = projeter(mod, Hw, carteL.w, carteL.h, 0), c0 = [0, 0, 0, 0];
    if (P.n < 20) return null;
    const d = detail(P, c0, carteL.D, carteL.w, carteL.h);
    return { vote: vote(P, c0, carteL.D, carteL.w, carteL.h, 3, 1), n: d.n, ecart: d.ecart, observ: d.observ, vis: d.vis };
  }

  return { profilDepuisClic, confusion, proposerDimensions, voteDimensions, grilleDimensions, choisirDimensions, DIM_OPTS, ecartSol, solSous, poseApres, poseDepuisH, hDepuisPose, projeterPose, affinerPose, poseVersImage, PLAGE, PROCHE, LIM, SEUILS, GROUPES, carte, modele, groupesDepuisRepères, projeter, vote, detail, raffiner, affiner, matG, partie, mesure };
});
