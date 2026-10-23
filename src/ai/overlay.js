/* Correction animée sur la vraie vidéo : projection terrain -> image image par image, interpolation, repli,
   et dessins d'une erreur (cercles, flèches, zones, lignes, étiquettes) avec sa correction conseillée.
   Coordonnées : terrain en mètres (comme les images analysées) ; image en unités normalisées 0..1 (u vers la droite, v vers le bas). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./homography"));
  else root.FutsalOverlay = factory(root.FutsalHomography);
})(typeof self !== "undefined" ? self : this, function (HG) {
  "use strict";

  const MIN_PLAYERS = 4;       // paires position au sol / pied de la boîte nécessaires pour retrouver la projection
  const MAX_ERR = 0.03;        // erreur de reprojection tolérée, en part de la hauteur d'un joueur (au-delà : pas de dessin)
  const BALL_HOLD_MAX = 0.6;   // s : le ballon n'est jamais repris d'une détection plus éloignée que cela
  const BALL_LINK_MAX = 1.0;   // s : le ballon n'est interpolé qu'entre deux détections au plus distantes de ce délai
  const MAX_GAP = 0.6;         // écart maximal (s) entre l'instant affiché et une image analysée utilisable
  const MIN_SPREAD = 12;       // m² : joueurs trop groupés (presque alignés) -> projection instable

  /* ---------- projection d'une image analysée ---------- */
  const footOf = (b) => [(b[0] + b[2]) / 2000, b[3] / 1000];

  /* f : { t, players: [{ x, y, b: [x1, y1, x2, y2] en millièmes de l'image ] }], h (facultatif : image -> terrain enregistrée) }
     -> { H (terrain -> image normalisée), err, n } ou null. */
  function frameProjection(f) {
    if (!f) return null;
    if (Array.isArray(f.h) && f.h.length === 9) {
      try { return { H: HG.invert(f.h), err: 0, n: f.players ? f.players.length : 0, stored: true }; } catch (_e) { /* projection enregistrée inutilisable : on la recalcule */ }
    }
    const pts = (f.players || []).filter((p) => Array.isArray(p.b) && p.b.length === 4 && p.b[3] > p.b[1] && isFinite(p.x) && isFinite(p.y));
    if (pts.length < MIN_PLAYERS) return null;
    const src = pts.map((p) => [p.x, p.y]), dst = pts.map((p) => footOf(p.b));
    if (HG.spread(src) < MIN_SPREAD) return null;
    let H;
    try { H = HG.solve(src, dst); } catch (_e) { return null; }
    if (!H.every(Number.isFinite)) return null;
    const hMed = pts.map((p) => (p.b[3] - p.b[1]) / 1000).sort((a, b) => a - b)[pts.length >> 1];
    let worst = 0;
    for (let i = 0; i < src.length; i++) {
      const q = HG.apply(H, src[i][0], src[i][1]);
      if (!isFinite(q[0]) || !isFinite(q[1])) return null;
      worst = Math.max(worst, Math.hypot(q[0] - dst[i][0], q[1] - dst[i][1]));
    }
    const err = worst / Math.max(1e-3, hMed);
    if (err > MAX_ERR) return null;
    return { H, err, n: pts.length };
  }

  /* ---------- outils sur la suite d'images analysées ---------- */
  function bracket(frames, t) {
    let lo = 0, hi = frames.length - 1;
    if (!frames.length) return [-1, -1];
    if (t <= frames[0].t) return [-1, 0];
    if (t >= frames[hi].t) return [hi, -1];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (frames[m].t <= t) lo = m; else hi = m; }
    return [lo, hi];
  }
  const inLost = (lost, t) => (lost || []).some((r) => Array.isArray(r) && t >= r[0] && t <= r[1]);

  /* Contexte de projection : met en cache la projection de chaque image analysée. */
  function Projector(frames, opts) {
    this.frames = (frames || []).filter((f) => f && isFinite(f.t)).slice().sort((a, b) => a.t - b.t);
    this.lost = (opts && opts.lost) || [];
    this.cache = new Map();
  }
  Projector.prototype.proj = function (i) {
    if (i < 0 || i >= this.frames.length) return null;
    if (!this.cache.has(i)) this.cache.set(i, frameProjection(this.frames[i]));
    return this.cache.get(i);
  };
  /* Projection à l'instant t : { ok, reason, project(x, y) -> [u, v] } ; reason : "sans-analyse" | "camera-perdue" | "trop-peu-de-joueurs". */
  Projector.prototype.at = function (t) {
    if (!this.frames.length) return { ok: false, reason: "sans-analyse" };
    if (inLost(this.lost, t)) return { ok: false, reason: "camera-perdue" };
    // image analysée utilisable la plus proche de chaque côté (à moins de MAX_GAP)
    const [lo, hi] = bracket(this.frames, t);
    let a = null, b = null;
    for (let i = lo; i >= 0 && t - this.frames[i].t <= MAX_GAP; i--) { const p = this.proj(i); if (p) { a = { t: this.frames[i].t, p }; break; } }
    for (let i = hi; i >= 0 && i < this.frames.length && this.frames[i].t - t <= MAX_GAP; i++) { const p = this.proj(i); if (p) { b = { t: this.frames[i].t, p }; break; } }
    if (!a && !b) return { ok: false, reason: inLost(this.lost, t - MAX_GAP) || inLost(this.lost, t + MAX_GAP) ? "camera-perdue" : "trop-peu-de-joueurs" };
    // pas d'interpolation à travers un passage où la caméra est perdue
    if (a && b && (inLost(this.lost, (a.t + b.t) / 2) || this.lost.some((r) => r[0] > a.t && r[1] < b.t))) b = null;
    const w = a && b && b.t > a.t ? (t - a.t) / (b.t - a.t) : (a ? 0 : 1);
    const Ha = a ? a.p.H : null, Hb = b ? b.p.H : null;
    return {
      ok: true, reason: null, err: Math.max(a ? a.p.err : 0, b ? b.p.err : 0), H: Ha && Hb ? (w < 0.5 ? Ha : Hb) : (Ha || Hb),       // projection la plus proche (terrain -> image normalisée)
      project(x, y) {
        // interpolation des points projetés (et non des matrices) : stable même si la caméra tourne vite
        const pa = Ha ? HG.apply(Ha, x, y) : null, pb = Hb ? HG.apply(Hb, x, y) : null;
        if (pa && pb) return [pa[0] + (pb[0] - pa[0]) * w, pa[1] + (pb[1] - pa[1]) * w];
        return pa || pb;
      }
    };
  };

  /* Zone du terrain réellement vue par la caméra : polygone convexe (en mètres) des points du terrain qui tombent DANS l'image et DEVANT la caméra.
     H : terrain -> image normalisée (0..1). Renvoie null si la projection est inutilisable ou si rien du terrain n'est visible : aucune zone n'est inventée. */
  function visibleZone(H, L, W, step) {
    if (!Array.isArray(H) || H.length !== 9 || !H.every(Number.isFinite) || !(L > 0) || !(W > 0)) return null;
    let Hi;
    try { Hi = HG.invert(H); } catch (_e) { return null; }
    const c = HG.apply(Hi, 0.5, 0.5);
    if (!isFinite(c[0]) || !isFinite(c[1])) return null;
    const sgn = Math.sign(H[6] * c[0] + H[7] * c[1] + H[8]);            // côté « devant la caméra » : celui du centre de l'image
    if (!sgn) return null;
    const st = step || 0.5, nx = Math.max(1, Math.ceil(L / st)), ny = Math.max(1, Math.ceil(W / st)), pts = [];
    for (let i = 0; i <= nx; i++) {
      for (let j = 0; j <= ny; j++) {
        const x = (L * i) / nx, y = (W * j) / ny, w = H[6] * x + H[7] * y + H[8];
        if (w * sgn <= 1e-9) continue;
        const u = (H[0] * x + H[1] * y + H[2]) / w, v = (H[3] * x + H[4] * y + H[5]) / w;
        if (u >= 0 && u <= 1 && v >= 0 && v <= 1) pts.push([x, y]);
      }
    }
    if (pts.length < 3) return null;
    pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
    pts.forEach((p) => { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); });
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    const hull = lo.slice(0, -1).concat(up.slice(0, -1));
    return hull.length >= 3 ? hull : null;
  }

  /* Joueurs (et ballon) à l'instant t, interpolés entre les deux images analysées voisines. */
  function stateAt(frames, t) {
    const fs = (frames || []).filter((f) => f && isFinite(f.t));
    if (!fs.length) return { players: [], ball: null, fills: [] };
    const [lo, hi] = bracket(fs, t);
    const A = lo >= 0 ? fs[lo] : null, B = hi >= 0 ? fs[hi] : null;
    if (!A || !B || B.t - A.t > 2 * MAX_GAP) {
      const n = !A ? B : !B ? A : (t - A.t <= B.t - t ? A : B);
      if (Math.abs(n.t - t) > MAX_GAP) return { players: [], ball: null, fills: [] };
      return { players: n.players.map((p) => Object.assign({}, p)), ball: n.ball ? Object.assign({}, n.ball) : null, fills: n.ball ? [{ kind: "ballon", from: Math.min(t, n.t), to: Math.max(t, n.t) }] : [] };
    }
    const w = (t - A.t) / (B.t - A.t), byId = new Map(B.players.map((p) => [p.id, p]));
    const lerp = (a, b) => a + (b - a) * w;
    const players = A.players.map((p) => {
      const q = byId.get(p.id);
      if (!q) return w < 0.5 ? Object.assign({}, p) : null;
      return Object.assign({}, p, { x: lerp(p.x, q.x), y: lerp(p.y, q.y), b: p.b && q.b ? p.b.map((v, k) => lerp(v, q.b[k])) : p.b || q.b });
    }).filter(Boolean);
    B.players.forEach((q) => { if (w >= 0.5 && !players.some((p) => p.id === q.id)) players.push(Object.assign({}, q)); });
    // le ballon n'est interpolé qu'entre deux détections distantes de 1 s au plus (il va jusqu'à 25 m/s) ; sinon on reprend l'image la plus proche (0,6 s au plus)
    const near = w < 0.5 ? A : B, both = A.ball && B.ball && B.t - A.t <= BALL_LINK_MAX + 1e-9;
    const ball = both ? { x: lerp(A.ball.x, B.ball.x), y: lerp(A.ball.y, B.ball.y) } : near.ball ? Object.assign({}, near.ball) : null;
    // comblements effectués (règle d'or : jamais à travers un trou trop long)
    const fills = [{ kind: "joueur", from: A.t, to: B.t }];
    if (both) fills.push({ kind: "lien-ballon", from: A.t, to: B.t });
    else if (near.ball) fills.push({ kind: "ballon", from: Math.min(t, near.t), to: Math.max(t, near.t) });
    return { players, ball, fills };
  }

  /* ---------- dessins d'une erreur et correction conseillée ---------- */
  const FIELD = { A: true, B: true };
  const d2 = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  const clampIn = (x, y, L, W) => [Math.max(0.5, Math.min(L - 0.5, x)), Math.max(0.5, Math.min(W - 0.5, y))];
  function segDist(p, a, b) {
    const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy || 1;
    const k = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2));
    return Math.hypot(p.x - (a.x + k * vx), p.y - (a.y + k * vy));
  }

  /* Trajectoire réelle d'un joueur entre t0 et t1 (positions des images analysées). */
  function track(frames, id, t0, t1) {
    const pts = [];
    frames.forEach((f) => { if (f.t >= t0 - 1e-6 && f.t <= t1 + 1e-6) { const p = f.players.find((q) => q.id === id); if (p) pts.push([p.x, p.y]); } });
    return pts;
  }

  /* Lignes observées (joueurs triés par x ; nouvelle ligne à partir de 3,5 m d'écart) et correction d'un joueur pour retrouver la forme voulue :
     { player, x } = le premier joueur dont la ligne diffère, et l'abscisse de la ligne qu'il devrait occuper ; null si rien à corriger. */
  function shapeFix(sorted, expected) {
    const e = expected.reduce((a, c, i) => a.concat(new Array(c).fill(i)), []);
    if (!sorted.length || e.length !== sorted.length) return null;
    const o = []; let line = 0;
    sorted.forEach((p, i) => { if (i && p.x - sorted[i - 1].x >= 3.5) line++; o.push(line); });
    const k = o.findIndex((l, i) => l !== e[i]);
    if (k < 0) return null;
    const mates = sorted.filter((_p, i) => e[i] === e[k] && i !== k);
    const x = mates.length ? mates.reduce((a, p) => a + p.x, 0) / mates.length : sorted[k].x + (e[k] > o[k] ? 4 : -4);
    return { player: sorted[k], x };
  }

  /* event : { t, type } ; frames : images analysées (format développé) ; opts : { L, W, dirAt(t) }.
     Renvoie { t, ok, items: [...], correction: { ghost, arrows, lines, crosses } | null, involved: [ids], kind }.
     items / correction sont en coordonnées terrain réelles ; les éléments liés à un joueur portent son id (ils le suivent). */
  function buildOverlay(event, frames, opts) {
    const L = (opts && opts.L) || 40, W = (opts && opts.W) || 20;
    const fs = (frames || []).filter((f) => f && isFinite(f.t)).slice().sort((a, b) => a.t - b.t);
    const t = event.t;
    const flip = opts && typeof opts.dirAt === "function" && opts.dirAt(t) < 0;
    // repère « normalisé » : mon équipe (A) attaque vers x croissant, notre but est en x = 0
    const N = (x, y) => (flip ? [L - x, W - y] : [x, y]);
    const st = stateAt(fs, t);
    const players = st.players.map((p) => { const [x, y] = N(p.x, p.y); return { id: p.id, team: p.team, x, y }; });
    let ball = st.ball ? (() => { const [x, y] = N(st.ball.x, st.ball.y); return { x, y }; })() : null;
    if (!ball) { for (const dt of [0.2, -0.2, 0.4, -0.4, 0.6, -0.6]) { const s = stateAt(fs, t + dt), hold = (s.fills || []).filter((f) => f.kind === "ballon").reduce((m, f) => Math.max(m, f.to - f.from), 0); if (s.ball && Math.abs(dt) + hold <= BALL_HOLD_MAX + 1e-9) { const [x, y] = N(s.ball.x, s.ball.y); ball = { x, y }; break; } } }
    const A = players.filter((p) => p.team === "A"), Bp = players.filter((p) => p.team === "B");
    const items = [], corr = { ghost: null, arrows: [], lines: [], crosses: [] };
    const R = (x, y) => N(x, y);                       // retour au repère réel (la symétrie est sa propre inverse)
    const ring = (p, color, label) => items.push({ type: "ring", id: p.id, x: R(p.x, p.y)[0], y: R(p.x, p.y)[1], color, label: label || null });
    const realTrack = (id, t0, t1) => track(fs, id, t0, t1);
    const out = (kind) => ({ t, ok: items.length > 0, kind, items, correction: corr.ghost || corr.arrows.length || corr.lines.length || corr.crosses.length ? corr : null, involved: items.filter((i) => i.id != null).map((i) => i.id) });
    const ghost = (p, tx, ty, label) => {
      const [x, y] = clampIn(tx, ty, L, W);
      corr.ghost = { id: p.id, from: R(p.x, p.y), to: R(x, y), label: label || null };
      corr.arrows.push({ pts: [R(p.x, p.y), R(x, y)], label: label || null });
    };
    if (!players.length) return out("vide");
    const ref = ball || { x: players.reduce((s, p) => s + p.x, 0) / players.length, y: players.reduce((s, p) => s + p.y, 0) / players.length };
    const nearest = (list, q) => list.slice().sort((a, b) => d2(a, q) - d2(b, q))[0] || null;
    const type = event.type === "plan_etire" ? "equipe_etiree" : event.type;      // bloc étiré du plan = même dessin que l'erreur du catalogue

    // ----- écarts au plan tactique (event : { t, type: "plan_…", expected, observed, target, shift, … }) -----
    if (type === "plan_forme") {
      const pool = Array.isArray(event.ids) ? players.filter((p) => event.ids.includes(p.id)) : A;       // les joueurs mesurés (gardien monté compris, remplaçants exclus)
      const sorted = pool.slice().sort((a, b) => a.x - b.x), want = (event.expected || []).join("-"), got = (event.observed || []).join("-");
      sorted.forEach((p, i) => ring(p, "err", i === 0 && got ? "Forme " + got + " au lieu de " + want : null));
      const fix = shapeFix(sorted, event.expected || []);
      if (fix) ghost(fix.player, fix.x, fix.player.y, "Reprendre le " + want);
      return out("plan");
    }
    if (type === "plan_bloc") {
      const lo = ((event.target || [0, 1])[0]) * L, hi = ((event.target || [0, 1])[1]) * L, shift = event.shift || 0;
      items.push({ type: "zone", pts: [R(lo, 0), R(hi, 0), R(hi, W), R(lo, W)], color: "opp", label: "Bloc visé" });
      const blocPool = Array.isArray(event.ids) ? players.filter((p) => event.ids.includes(p.id)) : A;
      blocPool.forEach((p, i) => ring(p, "err", i === 0 ? (shift > 0 ? "Bloc trop bas" : "Bloc trop haut") : null));
      blocPool.forEach((p) => { const nx = Math.max(0.5, Math.min(L - 0.5, p.x + shift)); corr.arrows.push({ pts: [R(p.x, p.y), R(nx, p.y)], label: null }); });
      return out("plan");
    }
    if (type === "plan_pressing") {
      const holder = nearest(Bp, ref), presser = nearest(A, ref);
      if (holder) ring(holder, "opp", "Porte le ballon");
      if (presser) {
        ring(presser, "err", "Ne presse pas");
        if (holder) ghost(presser, holder.x - 1.5, holder.y, "Presser le porteur");
      }
      return out("plan");
    }
    if (type === "plan_gardien") {
      const gk = players.find((p) => p.team === "GKA");
      if (gk) { ring(gk, "err", "Gardien trop haut"); ghost(gk, 3, W / 2, "Retour dans sa zone"); }
      else A.forEach((p) => ring(p, "err", null));
      return out("plan");
    }

    if (type === "perte_zone_mediane" || type === "perte_zone_def") {
      const before = stateAt(fs, t - 0.4);
      const loserRaw = nearest(before.players.filter((p) => p.team === "A"), before.ball ? (() => { const [x, y] = N(before.ball.x, before.ball.y); return { x, y }; })() : ref);
      const loser = loserRaw ? (players.find((p) => p.id === loserRaw.id) || (() => { const [x, y] = N(loserRaw.x, loserRaw.y); return { id: loserRaw.id, team: "A", x, y }; })()) : nearest(A, ref);
      const winner = nearest(Bp, ref);
      if (loser) ring(loser, "err", "Perte");
      if (winner) {
        ring(winner, "opp", "Récupère");
        const tr = realTrack(winner.id, t, t + 2);
        if (tr.length >= 2) items.push({ type: "arrow", id: winner.id, pts: tr, color: "opp", label: "Contre-attaque" });
      }
      if (loser) {
        const lost = R(ref.x, ref.y);
        items.push({ type: "line", from: R(loser.x, loser.y), to: lost, color: "err", dashed: true, label: "Ballon perdu" });
        corr.crosses.push({ x: (R(loser.x, loser.y)[0] + lost[0]) / 2, y: (R(loser.x, loser.y)[1] + lost[1]) / 2 });
        // passe sûre : coéquipier dont la ligne de passe est la plus dégagée
        let best = null, bestC = -1;
        A.filter((p) => p.id !== loser.id).forEach((p) => {
          const c = Math.min(...Bp.map((b) => segDist(b, loser, p)).concat([9]));
          if (c > bestC) { bestC = c; best = p; }
        });
        if (best) corr.lines.push({ from: R(loser.x, loser.y), to: R(best.x, best.y), label: "Passe sûre" });
        // soutien : le coéquipier le plus proche se rend disponible, loin de l'adversaire et côté de notre but
        const mate = nearest(A.filter((p) => p.id !== loser.id), loser);
        if (mate) {
          const away = winner ? [loser.x - winner.x, loser.y - winner.y] : [-1, 0];
          const n = Math.hypot(away[0], away[1]) || 1;
          const back = type === "perte_zone_def" ? -1.5 : -0.5;
          ghost(mate, loser.x + (4 * away[0]) / n + back, loser.y + (4 * away[1]) / n, "Soutien");
        } else {
          // aucun coéquipier visible : le joueur sort le ballon vers le côté le plus proche (jouer simple et vers l'extérieur)
          ghost(loser, loser.x - 1, loser.y < W / 2 ? 1.5 : W - 1.5, "Jouer vers l'extérieur");
        }
      }
      return out("perte");
    }

    if (type === "repli_tardif" || type === "contre_attaque_subie") {
      const late = A.filter((p) => p.x > ref.x + 1);
      const list = late.length ? late : A.slice().sort((a, b) => b.x - a.x).slice(0, 1);
      list.forEach((p) => {
        ring(p, "err", late.length ? "Trop loin" : null);
        const tr = realTrack(p.id, t, t + 2);
        if (tr.length >= 2) items.push({ type: "arrow", id: p.id, pts: tr, color: "err", dashed: true, label: null });
      });
      Bp.filter((p) => d2(p, ref) < 8).forEach((p) => ring(p, "opp", null));
      const y0 = Math.max(0, ref.y - 5), y1 = Math.min(W, ref.y + 5), x1 = Math.max(1, ref.x);
      items.push({ type: "zone", pts: [R(0, y0), R(x1, y0), R(x1, y1), R(0, y1)], color: "opp", label: "Espace libre" });
      const g = list.slice().sort((a, b) => d2(a, { x: 0, y: W / 2 }) - d2(b, { x: 0, y: W / 2 }))[0];
      if (g) ghost(g, Math.max(1.5, ref.x - 3), (ref.y + W / 2) / 2, "Repli entre ballon et but");
      return out("repli");
    }

    if (type === "marquage_perdu" || type === "espace_dos_fixo") {
      const last = A.slice().sort((a, b) => a.x - b.x)[0];
      const free = type === "marquage_perdu"
        ? Bp.filter((p) => p.x < 0.3 * L).sort((a, b) => Math.min(...A.map((q) => d2(q, b))) - Math.min(...A.map((q) => d2(q, a))))[0]
        : Bp.filter((p) => last && p.x < last.x - 1.5).sort((a, b) => a.x - b.x)[0];
      if (!free) return out("vide");
      const def = type === "marquage_perdu" ? nearest(A, free) : last;
      ring(free, "opp", "Libre");
      if (def) {
        ring(def, "err", null);
        items.push({ type: "line", from: R(def.x, def.y), to: R(free.x, free.y), color: "err", dashed: true, label: Math.round(d2(def, free)) + " m" });
        const gx = 0, gy = W / 2, n = Math.hypot(gx - free.x, gy - free.y) || 1;
        ghost(def, free.x + (1.2 * (gx - free.x)) / n, free.y + (1.2 * (gy - free.y)) / n, "Marquer côté but");
      }
      return out("marquage");
    }

    if (type === "equipe_etiree" && A.length >= 2) {
      const s = A.slice().sort((a, b) => a.x - b.x), back = s[0], front = s[s.length - 1];
      ring(back, "err", null); ring(front, "err", null);
      items.push({ type: "line", from: R(back.x, back.y), to: R(front.x, front.y), color: "err", label: Math.round(front.x - back.x) + " m" });
      const cx = A.reduce((q, p) => q + p.x, 0) / A.length;
      ghost(front, Math.max(back.x + 6, cx + 4), front.y, "Resserrer le bloc");
      corr.arrows.push({ pts: [R(back.x, back.y), R(Math.min(front.x - 6, cx - 3), back.y)], label: null });
      return out("bloc");
    }

    if (type === "largeur_mal_occupee" && A.length >= 2) {
      const s = A.slice().sort((a, b) => a.y - b.y), lo = s[0], hi = s[s.length - 1];
      ring(lo, "err", null); ring(hi, "err", null);
      items.push({ type: "zone", pts: [R(ref.x - 6, 0), R(ref.x + 6, 0), R(ref.x + 6, lo.y), R(ref.x - 6, lo.y)], color: "opp", label: "Couloir vide" });
      ghost(lo, lo.x, 1.5, "Écarter");
      corr.arrows.push({ pts: [R(hi.x, hi.y), R(hi.x, W - 1.5)], label: null });
      return out("largeur");
    }

    if ((type === "attaque_statique" || type === "pivot_isole") && A.length) {
      const holder = nearest(A, ref);
      if (type === "attaque_statique") A.forEach((p) => ring(p, "err", null)); else ring(holder, "err", "Isolé");
      const mate = nearest(A.filter((p) => p.id !== holder.id), holder);
      if (type === "attaque_statique") {
        const front = A.slice().sort((a, b) => b.x - a.x)[0];
        ghost(front, front.x + 4, front.y, "Appel en profondeur");
      } else if (mate) {
        const n = d2(mate, holder) || 1;
        ghost(mate, holder.x + ((mate.x - holder.x) * 4) / n, holder.y + ((mate.y - holder.y) * 4) / n, "Soutien à 4 m");
      }
      return out("attaque");
    }

    // erreur marquée à la main ou sans règle : les joueurs les plus proches du ballon, sans correction sur l'image
    players.filter((p) => FIELD[p.team]).sort((a, b) => d2(a, ref) - d2(b, ref)).slice(0, 3).forEach((p) => ring(p, p.team === "A" ? "err" : "opp", null));
    return out("generique");
  }

  /* Coin où poser la petite carte pour gêner le moins possible : area { w, h }, size { w, h } de la carte, occ = rectangles
     [x1, y1, x2, y2] à ne pas couvrir (joueurs, dessins), current = coin actuel (gardé s'il est presque aussi bon : pas de
     sautillement). Renvoie "br" | "bl" | "tr" | "tl". */
  function chooseCorner(area, size, occ, current, margin) {
    const m = margin == null ? 10 : margin;
    const pos = { br: [area.w - size.w - m, area.h - size.h - m], bl: [m, area.h - size.h - m], tr: [area.w - size.w - m, m], tl: [m, m] };
    const cost = (k) => {
      const r = [pos[k][0], pos[k][1], pos[k][0] + size.w, pos[k][1] + size.h];
      let c = 0;
      (occ || []).forEach((o) => {
        const iw = Math.min(r[2], o[2]) - Math.max(r[0], o[0]), ih = Math.min(r[3], o[3]) - Math.max(r[1], o[1]);
        if (iw > 0 && ih > 0) c += iw * ih;
      });
      return c / Math.max(1, size.w * size.h);
    };
    const order = ["br", "bl", "tr", "tl"];
    let best = order[0], bc = Infinity;
    order.forEach((k) => { const c = cost(k); if (c < bc - 1e-9) { bc = c; best = k; } });
    if (current && pos[current] && cost(current) <= bc + 0.03) return current;
    return best;
  }

  /* Fenêtre de l'action (en mètres) : le rectangle qui contient les joueurs détectés, élargi d'une marge, borné au terrain. Le terrain estimé n'est
     tracé que là : près de l'action, l'estimation de la caméra est fiable ; au fond de la salle, une petite erreur d'angle devient une grosse erreur. */
  function actionWindow(players, L, W, margin) {
    const ps = (players || []).filter((p) => p && isFinite(p.x) && isFinite(p.y));
    if (ps.length < 2 || !(L > 0) || !(W > 0)) return null;
    const m = margin == null ? 5 : margin;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    ps.forEach((p) => { x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y); });
    return { x1: Math.max(0, x1 - m), y1: Math.max(0, y1 - m), x2: Math.min(L, x2 + m), y2: Math.min(W, y2 + m) };
  }
  /* Une ligne du terrain (points en mètres) découpée à la fenêtre : renvoie les morceaux qui restent dedans (la ligne est d'abord réduite en pas de 'step' m). */
  function clipLine(pl, win, step) {
    if (!win || !pl || pl.length < 2) return [];
    const st = step || 0.5, pts = [pl[0]];
    for (let i = 1; i < pl.length; i++) {
      const a = pl[i - 1], b = pl[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / st));
      for (let k = 1; k <= n; k++) pts.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
    const out = [];
    let cur = [];
    pts.forEach((p) => {
      if (p[0] >= win.x1 && p[0] <= win.x2 && p[1] >= win.y1 && p[1] <= win.y2) cur.push(p);
      else if (cur.length) { out.push(cur); cur = []; }
    });
    if (cur.length) out.push(cur);
    return out.filter((c) => c.length >= 2);
  }

  return { actionWindow, clipLine, visibleZone, shapeFix, chooseCorner, frameProjection, Projector, stateAt, buildOverlay, footOf, MIN_PLAYERS, MAX_ERR, MAX_GAP, BALL_HOLD_MAX, BALL_LINK_MAX };
});
