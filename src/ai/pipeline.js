/* Chaîne d'analyse vidéo : découpage en vignettes, fusion des détections, projection sur le terrain,
   reconnaissance des équipes, suivi, et lecture de la vidéo image par image (navigateur). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./yolox"), require("./homography"), require("./kit"), require("./tracker"), require("./camera"), require("./balltrack"), require("./doubt"), require("./signature"), require("./orb"));
  } else {
    root.FutsalPipeline = factory(root.FutsalYolox, root.FutsalHomography, root.FutsalKit, root.FutsalTracker, root.FutsalCamera, root.FutsalBallTrack, root.FutsalDoubt, root.FutsalSignature, root.FutsalOrb);
  }
})(typeof self !== "undefined" ? self : this, function (Y, HG, K, T, Cam, BT, D, S, Orb) {
  "use strict";

  const TEAM_CODE = { A: "A", B: "B", GKA: "a", GKB: "b" };
  const BALL_CAND = 0.05;      // score minimal d'un candidat ballon
  const BALL_STRONG = 0.2;     // score d'une détection de ballon fiable seule
  const RESUME_RUN = 0.5;      // s de suivi de la caméra sans échec pour dire qu'elle est redevenue stable après un décrochage
  const MAX_BALL_CANDS = 4;    // candidats gardés par image
  const BENCH_HALF_LEN = 12;   // m : zone des bancs de part et d'autre de la ligne médiane
  const BENCH_DEPTH = 6;       // m : profondeur de la zone des bancs derrière la ligne de touche
  const BENCH_SEATED = 2;      // silhouette assise : moins de 2 fois plus haute que large
  const BENCH_MARGIN = 0.5;    // m autour d'une zone de banc marquée
  const BENCH_FOLLOW = 2.5;    // m : personnes assises prises en compte autour de la zone pour suivre la dérive
  const BENCH_FOLLOW_RATE = 0.15;   // part de l'écart rattrapée à chaque image (lissage)
  const BENCH_MAX_DRIFT = 6;   // m : décalage maximal d'une zone
  const CODE_TEAM = { A: "A", B: "B", a: "GKA", b: "GKB" };

  /* Rectangles de détection : 1 = image entière ; 2 = deux moitiés qui se recouvrent (joueurs lointains plus nets). */
  function tileRects(w, h, mode) {
    if (mode !== 2) return [{ x: 0, y: 0, w, h }];
    if (w >= h) {
      const tw = Math.round(w * 0.6);
      return [{ x: 0, y: 0, w: tw, h }, { x: w - tw, y: 0, w: tw, h }];
    }
    const th = Math.round(h * 0.6);
    return [{ x: 0, y: 0, w, h: th }, { x: 0, y: h - th, w, h: th }];
  }

  /* Zone de l'image occupée par le terrain (en pixels de l'image analysée), à partir de H (pixels vidéo -> terrain).
     Marge de 12 %. null si le calcul n'est pas fiable (le terrain déborde derrière la caméra, zone trop petite). */
  function courtRegion(H, L, W, scale, cw, ch) {
    let Hi;
    try { Hi = HG.invert(H); } catch (_e) { return null; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const m = 1.5;
    const pts = [[-m, -m], [L + m, -m], [L + m, W + m], [-m, W + m], [L / 2, -m], [L / 2, W + m]];
    for (const p of pts) {
      const den = Hi[6] * p[0] + Hi[7] * p[1] + Hi[8];
      if (!(den > 1e-9)) return null;
      const q = HG.apply(Hi, p[0], p[1]);
      if (!isFinite(q[0]) || !isFinite(q[1])) return null;
      x0 = Math.min(x0, q[0] * scale); x1 = Math.max(x1, q[0] * scale); y0 = Math.min(y0, q[1] * scale); y1 = Math.max(y1, q[1] * scale);
    }
    const px = (x1 - x0) * 0.12, py = (y1 - y0) * 0.12;
    x0 = Math.max(0, x0 - px); y0 = Math.max(0, y0 - py); x1 = Math.min(cw, x1 + px); y1 = Math.min(ch, y1 + py);
    const w = x1 - x0, h = y1 - y0;
    if (w < cw * 0.3 || h < ch * 0.2) return null;
    return { x: Math.round(x0), y: Math.round(y0), w: Math.round(w), h: Math.round(h) };
  }

  /* Vignettes « zoom automatique » : on découpe la zone du terrain (au plus 4 morceaux qui se recouvrent) pour garder le détail d'origine. */
  function zoomRects(crop) {
    const horizontal = crop.w >= crop.h;
    const along = horizontal ? crop.w : crop.h, across = horizontal ? crop.h : crop.w;
    const tile = Math.min(along, Math.round(across * 1.15));
    const n = Math.max(1, Math.min(4, Math.ceil((along - tile) / (tile * 0.7)) + 1));
    const out = [];
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : Math.round(((along - tile) * i) / (n - 1));
      out.push(horizontal ? { x: crop.x + off, y: crop.y, w: tile, h: crop.h } : { x: crop.x, y: crop.y + off, w: crop.w, h: tile });
    }
    return out;
  }

  /* Boîtes d'une vignette (espace 640x640 « letterbox ») -> espace de l'image.
     Une boîte collée à une limite intérieure de la vignette (pas au bord de l'image) est marquée « coupée » :
     le joueur y est partiel, il est ignoré s'il est déjà vu en entier ailleurs. */
  function tileToFrame(dets, rect, frameW, frameH) {
    const r = Y.letterboxRatio(rect.w, rect.h, Y.SIZE), eps = 6 / r;
    return dets.map((d) => {
      const o = { cls: d.cls, score: d.score, x1: d.x1 / r + rect.x, y1: d.y1 / r + rect.y, x2: d.x2 / r + rect.x, y2: d.y2 / r + rect.y };
      if (frameW != null) {
        o.cut = (rect.x > 0 && o.x1 <= rect.x + eps) || (rect.x + rect.w < frameW && o.x2 >= rect.x + rect.w - eps) ||
          (rect.y > 0 && o.y1 <= rect.y + eps) || (rect.y + rect.h < frameH && o.y2 >= rect.y + rect.h - eps);
      }
      return o;
    });
  }

  function overlapShare(a, b) {
    const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1), h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
    if (w <= 0 || h <= 0) return 0;
    return (w * h) / Math.max(1, (a.x2 - a.x1) * (a.y2 - a.y1));
  }

  function mergeTiles(perTile, frameW, frameH) {
    const all = [];
    perTile.forEach((t) => tileToFrame(t.dets, t.rect, frameW, frameH).forEach((d) => all.push(d)));
    // 1) un joueur partiel (coupé par une limite de vignette) disparaît s'il est contenu dans une autre boîte
    const whole = all.filter((d) => !(d.cut && d.cls === Y.CLASS_PERSON && all.some((e) => e !== d && e.cls === Y.CLASS_PERSON && e.score >= 0.3 && overlapShare(d, e) >= 0.6 && (e.x2 - e.x1) * (e.y2 - e.y1) >= (d.x2 - d.x1) * (d.y2 - d.y1))));
    // 2) suppression des doublons classiques
    return Y.nms(whole, 0.5).map((d) => { const o = Object.assign({}, d); delete o.cut; return o; });
  }

  /* Faux ballon : marquage jaune au sol (tirets) ou brassard fluo. Mesuré sur des matchs réels : ces boîtes
     contiennent ~38 % de pixels jaunes et aucun blanc, un vrai ballon ~0 % de jaune.
     Sur un sol lui-même jaune ou orangé (parquet sous une lumière chaude), tout est « jaune » : le filtre supprimait alors la moitié des vrais ballons.
     Il ne s'applique donc que si le pourtour de la boîte n'est PAS jaune (un marquage jaune se détache d'un sol d'une autre couleur).
     img : { data (RGBA), width, height } ; box en pixels de img. */
  function isYellow(r, g, b) { return r > 140 && g > 120 && b < 0.6 * g && r - b > 70; }
  function isFloorMark(img, box) {
    const x0 = Math.max(0, Math.floor(box.x1)), y0 = Math.max(0, Math.floor(box.y1));
    const x1 = Math.min(img.width, Math.ceil(box.x2)), y1 = Math.min(img.height, Math.ceil(box.y2));
    const step = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 24));
    let n = 0, yellow = 0, white = 0;
    for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) {
      const o = (y * img.width + x) * 4, r = img.data[o], g = img.data[o + 1], b = img.data[o + 2];
      n++;
      if (isYellow(r, g, b)) yellow++;
      if (Math.min(r, g, b) > 170 && Math.max(r, g, b) - Math.min(r, g, b) < 45) white++;
    }
    if (!(n > 0 && yellow / n >= 0.25 && white / n < 0.08)) return false;
    // pourtour : anneau autour de la boîte (une boîte de large autour) ; s'il est aussi jaune, le sol est jaune et la boîte n'est pas une marque
    const bw = Math.max(4, x1 - x0), bh = Math.max(4, y1 - y0);
    const rx0 = Math.max(0, x0 - bw), ry0 = Math.max(0, y0 - bh), rx1 = Math.min(img.width, x1 + bw), ry1 = Math.min(img.height, y1 + bh);
    const rstep = Math.max(1, Math.floor(Math.min(rx1 - rx0, ry1 - ry0) / 36));
    let rn = 0, ry = 0;
    for (let y = ry0; y < ry1; y += rstep) for (let x = rx0; x < rx1; x += rstep) {
      if (x >= x0 && x < x1 && y >= y0 && y < y1) continue;
      const o = (y * img.width + x) * 4;
      rn++;
      if (isYellow(img.data[o], img.data[o + 1], img.data[o + 2])) ry++;
    }
    return !(rn > 0 && ry / rn >= 0.25);
  }

  /* enabled === false : filtre désactivé (match joué avec un ballon jaune). */
  function dropFloorMarks(dets, img, enabled) {
    return img && enabled !== false ? dets.filter((d) => d.cls !== Y.CLASS_BALL || !isFloorMark(img, d)) : dets;
  }

  /* Étalonnage en vigueur à l'instant t (le plus récent déjà posé, sinon le premier). */
  function calibrationAt(calibs, t) {
    if (!calibs || !calibs.length) return null;
    const sorted = calibs.slice().sort((a, b) => a.t - b.t);
    let cur = sorted[0];
    sorted.forEach((c) => { if (c.t <= t) cur = c; });
    return cur;
  }

  /* Projection (pixels vidéo -> terrain) à utiliser pour tracer le terrain à l'instant t, ou null si elle n'est pas fiable :
     1. la projection mesurée sur l'image analysée la plus proche (à 0,3 s), qui suit la caméra ;
     2. sinon le calibrage, mais seulement si la caméra est fixe ou si le calibrage date de moins de 0,5 s (une caméra à la main
        a bougé depuis : tracer le terrain avec un vieux calibrage donnerait des lignes dans tous les sens). */
  const goodH = (f) => !!(f && Array.isArray(f.h) && f.h.length === 9 && f.h.every(Number.isFinite) && Math.abs(f.h[8]) > 1e-12);
  const COURT_GAP_M = 4;        // m : écart maximal, sur le terrain, entre deux images voisines pour tracer entre les deux (sinon : saut de caméra, pas d'interpolation)
  const INTERP_MAX_S = 0.8;     // s : écart maximal entre deux images voisines pour interpoler
  /* Projection interpolée entre l'image analysée juste avant t et celle juste après (le tracé suit la vidéo en lecture sans saut).
     Rend null si l'une manque, si elles sont trop éloignées dans le temps, ou si la caméra a sauté entre les deux. */
  function courtHBetween(frames, t, vw, vh) {
    let lo = 0, hi = frames.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (frames[m].t < t) lo = m + 1; else hi = m; }
    const b = frames[lo], a = lo > 0 ? frames[lo - 1] : null;
    if (!a || !b || a.t > t || b.t < t || !goodH(a) || !goodH(b) || b.t - a.t > INTERP_MAX_S || b.t - a.t < 1e-6) return null;
    const Ha = a.h.map((v) => v / a.h[8]), Hb = b.h.map((v) => v / b.h[8]), al = (t - a.t) / (b.t - a.t);
    let gap = 0;
    [[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5]].forEach(([x, y]) => { const pa = HG.apply(Ha, x, y), pb = HG.apply(Hb, x, y); gap = Math.max(gap, Math.hypot(pa[0] - pb[0], pa[1] - pb[1])); });
    if (!(gap <= COURT_GAP_M)) return null;
    return HG.mul3(Ha.map((v, i) => v + (Hb[i] - v) * al), [1 / vw, 0, 0, 0, 1 / vh, 0, 0, 0, 1]);
  }
  function courtH(frames, calibs, camera, t, vw, vh) {
    if (frames && frames.length > 1 && vw > 0 && vh > 0) {
      try { const H = courtHBetween(frames, t, vw, vh); if (H) return { H, source: "image-interpolee" }; } catch (_e) { /* retour à l'image la plus proche */ }
    }
    const f = frames && frames.length ? frameNear(frames, t, 0.3) : null;
    if (goodH(f) && vw > 0 && vh > 0) {
      try { return { H: HG.mul3(f.h, [1 / vw, 0, 0, 0, 1 / vh, 0, 0, 0, 1]), source: "image" }; } catch (_e) { /* projection inutilisable */ }
    }
    const cal = calibrationAt(calibs, t);
    if (!cal) return null;
    if (camera !== "fixed" && Math.abs(cal.t - t) > 0.5) return { H: null, source: "calibrage-ancien" };
    return { H: cal.H, source: "calibrage" };
  }

  /* Dérive du suivi de la caméra mesurée quand un nouveau calibrage est atteint : écart (m, sur le terrain) entre la projection que le suivi
     avait calculée à partir du calibrage précédent (Hpred) et celle du nouveau calibrage (Hcal), sur une grille de points de l'image qui tombent
     sur le terrain (à 2 m près). Rend { med, max, n } ou null s'il y a trop peu de points. Les deux projections vont des pixels vidéo au terrain. */
  function driftAt(Hpred, Hcal, vw, vh, L, W) {
    const e = [];
    try {
      for (let gx = 0.1; gx < 0.95; gx += 0.1) for (let gy = 0.2; gy < 0.95; gy += 0.1) {
        const c = HG.apply(Hcal, gx * vw, gy * vh), q = HG.apply(Hpred, gx * vw, gy * vh);
        if (![c[0], c[1], q[0], q[1]].every(Number.isFinite) || c[0] < -2 || c[0] > L + 2 || c[1] < -2 || c[1] > W + 2) continue;
        e.push(Math.hypot(c[0] - q[0], c[1] - q[1]));
      }
    } catch (_e) { return null; }
    if (e.length < 8) return null;
    e.sort((a, b) => a - b);
    return { med: Math.round(e[e.length >> 1] * 100) / 100, max: Math.round(e[e.length - 1] * 100) / 100, n: e.length };
  }

  /* Détections d'une image -> joueurs sur le terrain + ballon.
     ctx : { frameW, frameH, scale (px analysés / px vidéo), img ({data,width,height}), H, L, W, refs, tracker, t,
             close (tenues A et B trop proches : reconnaissance adaptée) }
     Avec des tenues proches, chaque joueur garde aussi f = son équipe de champ la plus probable (A ou B), utilisée en fin
     d'analyse pour décider gardien / joueur de champ par la position ; f est retiré par finalizeFrames. */
  function processDetections(dets, ctx) {
    const persons = [], balls = [];
    dets.forEach((d) => {
      const w = d.x2 - d.x1, h = d.y2 - d.y1;
      if (d.cls === Y.CLASS_PERSON) {
        if (h < ctx.frameH * 0.035 || w < ctx.frameW * 0.008) return;
        const ar = h / Math.max(1, w);
        if (ar < 0.8 || ar > 6) return;
        persons.push(d);
      } else if (d.cls === Y.CLASS_BALL) {
        // un vrai ballon est à peu près carré et petit (évite les marquages au sol) ; les détections faibles (dès BALL_CAND)
        // restent candidates : le choix final se fait sur la trajectoire (balltrack.js)
        const ar = w / Math.max(1, h);
        if (d.score >= BALL_CAND && ar >= 0.5 && ar <= 2 && h >= ctx.frameH * 0.004 && h <= ctx.frameH * 0.06) balls.push(d);
      }
    });
    const margin = 1.5;
    const stats = !!ctx.bench && !ctx.noBenchStats;        // analyse continue : les compteurs de bancs ne comptent que les images « historiques » (cadence d'origine)
    const list = [];
    // zones des bancs, décalées pour suivre la dérive du suivi de la caméra (voir followBenches)
    const zones = shiftedZones(ctx.benchZones, ctx.benchDrift);
    const seatedIn = zones ? zones.map(() => []) : null;
    persons.forEach((d) => {
      const fx = (d.x1 + d.x2) / 2 / ctx.scale, fy = d.y2 / ctx.scale;
      const p = HG.apply(ctx.H, fx, fy);
      if (!isFinite(p[0]) || !isFinite(p[1])) return;
      // personne assise dans une zone de banc marquée : remplaçant, pas un joueur
      const seated = (d.y2 - d.y1) < BENCH_SEATED * (d.x2 - d.x1);
      if (seated && zones) zones.forEach((z, i) => { if (inBenchZone(p, [z], BENCH_FOLLOW)) seatedIn[i].push(p); });
      if (seated && inBenchZone(p, zones)) { if (stats) ctx.bench.zone = (ctx.bench.zone || 0) + 1; return; }
      if (p[0] < -margin || p[0] > ctx.L + margin || p[1] < -margin || p[1] > ctx.W + margin) {
        // personne assise ou debout le long d'une ligne de touche, près du milieu : remplaçants (côté des bancs)
        if (stats && Math.abs(p[0] - ctx.L / 2) <= BENCH_HALF_LEN) {
          if (p[1] < -margin && p[1] >= -BENCH_DEPTH) ctx.bench.y0++;
          else if (p[1] > ctx.W + margin && p[1] <= ctx.W + BENCH_DEPTH) ctx.bench.yW++;
        }
        return;
      }
      const feat = ctx.img ? K.sample(ctx.img, [d.x1, d.y1, d.x2, d.y2]) : null;
      const close = !!ctx.close;
      if (feat && ctx.refs) K.addAccents(feat, ctx.img, [d.x1, d.y1, d.x2, d.y2], ctx.refs, close ? { close } : undefined);
      const cls = ctx.refs ? K.classify(feat, ctx.refs, close ? { reject: ctx.reject, close } : { reject: ctx.reject }) : { team: "UNK" };
      const item = { x: Math.round(p[0] * 100) / 100, y: Math.round(p[1] * 100) / 100, team: cls.team, box: [d.x1, d.y1, d.x2, d.y2], conf: d.score };
      const leg = ctx.img ? K.legSkin(ctx.img, [d.x1, d.y1, d.x2, d.y2]) : null;      // peau visible aux jambes (pantalon ou short)
      if (leg != null) item.leg = leg;
      // signature d'apparence, lue seulement quand les tenues de référence sont proches (aide le suivi, jamais enregistrée dans les images)
      if (ctx.appearance && ctx.img) { const sig = S.sample(ctx.img, [d.x1, d.y1, d.x2, d.y2]); if (sig) item.sig = sig; }
      // équipe de champ la plus proche (UNK si la tenue ne ressemble à aucune : arbitre, gardien d'une autre couleur…) ;
      // ne sert qu'à revoir les rôles en fin d'analyse quand le cas est ambigu
      if (ctx.refs && ctx.refs.A && ctx.refs.B) item.f = K.classify(feat, { A: ctx.refs.A, B: ctx.refs.B }, close ? { reject: ctx.reject, close } : { reject: ctx.reject }).team;
      list.push(item);
    });
    if (zones && ctx.benchDrift && !ctx.noBenchStats) { followBenches(ctx.benchDrift, seatedIn, ctx.benchRate); if (ctx.bench) trackDrift(ctx.bench, ctx.benchDrift, ctx.benchZones, ctx.t); }
    ctx.tracker.update(ctx.t, list);
    const bc = [];
    balls.sort((a, b) => b.score - a.score).forEach((d) => {
      if (bc.length >= MAX_BALL_CANDS) return;
      const p = HG.apply(ctx.H, ((d.x1 + d.x2) / 2) / ctx.scale, ((d.y1 + d.y2) / 2) / ctx.scale);
      const bm = ctx.ballMargin != null ? ctx.ballMargin : 2;      // marge autour du terrain (m) : un ballon en l'air se projette plus loin que sa vraie place
      if (!isFinite(p[0]) || !isFinite(p[1]) || p[0] < -bm || p[0] > ctx.L + bm || p[1] < -bm || p[1] > ctx.W + bm) return;
      bc.push([Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100, Math.round(d.score * 1000) / 1000]);
    });
    // aperçu en direct : meilleure détection fiable ; le ballon définitif est choisi en fin d'analyse
    const ball = bc.length && bc[0][2] >= BALL_STRONG ? { x: bc[0][0], y: bc[0][1] } : null;
    const out = {
      t: ctx.t,
      players: list.map((p) => {
        const o = {
          id: p.id, team: p.team, x: p.x, y: p.y,
          b: [Math.round((p.box[0] / ctx.frameW) * 1000), Math.round((p.box[1] / ctx.frameH) * 1000), Math.round((p.box[2] / ctx.frameW) * 1000), Math.round((p.box[3] / ctx.frameH) * 1000)]
        };
        if (p.f) o.f = p.f;
        if (p.leg != null) o.lg = Math.round(p.leg * 100) / 100;
        return o;
      }),
      ball,
      bc
    };
    const h = normalizedProjection(ctx.H, ctx.frameW / ctx.scale, ctx.frameH / ctx.scale);
    if (h) out.h = h;
    return out;
  }

  /* Pieds p = [x, y] (terrain) dans une des zones de banc (marge BENCH_MARGIN m par défaut) ? */
  function inBenchZone(p, zones, margin) {
    const m = margin == null ? BENCH_MARGIN : margin;
    return Array.isArray(zones) && zones.some((z) => p[0] >= z.x1 - m && p[0] <= z.x2 + m && p[1] >= z.y1 - m && p[1] <= z.y2 + m);
  }

  /* Le suivi de la caméra dérive lentement (plusieurs mètres sur un match) : une zone de banc fixe sur le terrain finit par
     ne plus couvrir le banc. drift = [{ ref, dx, dy }] par zone : ref = position moyenne des personnes assises la première
     fois qu'elles sont vues dans la zone ; ensuite la zone suit doucement leur position moyenne (au plus BENCH_MAX_DRIFT m). */
  function shiftedZones(zones, drift) {
    if (!Array.isArray(zones) || !zones.length) return null;
    return zones.map((z, i) => { const d = drift && drift[i] ? drift[i] : { dx: 0, dy: 0 }; return { x1: z.x1 + d.dx, y1: z.y1 + d.dy, x2: z.x2 + d.dx, y2: z.y2 + d.dy }; });
  }
  /* Plus forte dérive vue sur un banc (en m) et l'instant où elle a eu lieu, avec les zones décalées à cet instant : sert à demander
     au coach si la zone est encore sur le banc (dérive >= BENCH_ASK). */
  const BENCH_ASK = 3;
  function trackDrift(bench, drift, zones, t) {
    let d = 0;
    drift.forEach((z) => { if (z) d = Math.max(d, Math.hypot(z.dx, z.dy)); });
    if (d > (bench.drift ? bench.drift.d : 0) + 1e-9) bench.drift = { d: Math.round(d * 10) / 10, t, zones: shiftedZones(zones, drift) };
  }
  function followBenches(drift, seatedIn, rate) {
    const k = rate > 0 ? rate : BENCH_FOLLOW_RATE;
    seatedIn.forEach((list, i) => {
      if (!list.length) return;
      const d = drift[i] || (drift[i] = { ref: null, dx: 0, dy: 0 });
      const mx = list.reduce((s, p) => s + p[0], 0) / list.length, my = list.reduce((s, p) => s + p[1], 0) / list.length;
      if (!d.ref) { d.ref = [mx - d.dx, my - d.dy]; return; }
      const clamp = (v) => Math.max(-BENCH_MAX_DRIFT, Math.min(BENCH_MAX_DRIFT, v));
      d.dx = clamp(d.dx + k * (mx - d.ref[0] - d.dx));
      d.dy = clamp(d.dy + k * (my - d.ref[1] - d.dy));
    });
  }

  /* Projection image -> terrain de cette image, en coordonnées d'image normalisées (0..1), pour redessiner sur la vidéo
     (correction animée). H : pixels vidéo -> terrain ; vw, vh : taille de la vidéo. */
  function normalizedProjection(H, vw, vh) {
    if (!Array.isArray(H) || H.length !== 9 || !(vw > 0) || !(vh > 0)) return null;
    const h = HG.mul3(H, [vw, 0, 0, 0, vh, 0, 0, 0, 1]);
    if (!h.every(Number.isFinite) || Math.abs(h[8]) < 1e-12) return null;
    return h.map((v) => Number((v / h[8]).toPrecision(7)));
  }

  /* Fin d'analyse : équipe de chaque piste par vote, suppression des pistes éphémères et des joueurs non identifiés.
     opts (facultatif) : { L, W, dirAt(t) (+1 si l'équipe A attaque vers x croissant), roles (tenues de gardien / arbitre
     confondables) }. Les rôles ne sont revus par la position que si le cas est ambigu (opts.roles, ou une même équipe
     a souvent deux gardiens à la fois) ; sinon le résultat est celui du simple vote. */
  function finalizeFrames(frames, opts) {
    if (BT) BT.apply(frames);
    let teams = T.finalTeams(frames);
    if (opts && opts.L && opts.W && (opts.roles || goalkeeperConflict(frames, teams))) teams = resolveRoles(frames, teams, opts);
    // pistes de joueurs de champ passées d'une personne à une autre : coupées, puis chaque morceau est voté (A ou B) ;
    // gardiens et arbitres (rôles décidés sur la piste entière) ne sont pas coupés
    if (!opts || opts.split !== false) {
      const field = new Set(Object.keys(teams).filter((id) => teams[id] === "A" || teams[id] === "B").map(Number));
      const before = new Map();
      frames.forEach((f) => f.players.forEach((p) => { if (field.has(p.id)) before.set(p, p.id); }));
      const fieldFrames = frames.map((f) => ({ t: f.t, players: f.players.filter((p) => field.has(p.id)) }));
      let maxId = 0;
      frames.forEach((f) => f.players.forEach((p) => { if (p.id > maxId) maxId = p.id; }));
      if (T.splitTracks(fieldFrames, null, maxId + 1)) {
        const v = {};
        before.forEach((_old, p) => { const s = p.f === "A" || p.f === "B" ? p.f : p.team === "A" || p.team === "B" ? p.team : null; if (s) (v[p.id] = v[p.id] || {})[s] = (v[p.id][s] || 0) + 1; });
        before.forEach((old, p) => { if (p.id !== old && !(p.id in teams)) teams[p.id] = v[p.id] ? ((v[p.id].A || 0) >= (v[p.id].B || 0) ? "A" : "B") : teams[old]; });
      }
      // morceaux d'un même joueur séparés par une courte disparition ou une coupure : recollés (même équipe, vitesse plausible)
      T.relinkTracks(frames, teams, (tm) => tm === "A" || tm === "B");
    }
    if (opts && Array.isArray(opts.doubts) && D) D.trackDoubts(frames, teams).forEach((q) => opts.doubts.push(q));
    const counts = {};
    frames.forEach((f) => f.players.forEach((p) => { counts[p.id] = (counts[p.id] || 0) + 1; }));
    return frames.map((f) => {
      const o = {
        t: f.t, ball: f.ball,
        players: f.players.filter((p) => counts[p.id] >= 3 && CODE_TEAM_OK(teams[p.id])).map((p) => {
          const q = Object.assign({}, p, { team: teams[p.id] });
          delete q.f;
          return q;
        })
      };
      if (f.h) o.h = f.h;
      return o;
    });
  }

  /* Ambiguïté révélée par l'analyse : sur au moins 10 % des images, une même équipe a deux « gardiens » (ou plus). */
  function goalkeeperConflict(frames, teams) {
    if (!frames.length) return false;
    let n = 0;
    frames.forEach((f) => {
      const c = {};
      f.players.forEach((p) => { const k = teams[p.id]; if (k === "GKA" || k === "GKB") c[k] = (c[k] || 0) + 1; });
      if ((c.GKA || 0) > 1 || (c.GKB || 0) > 1) n++;
    });
    return n >= frames.length * 0.1;
  }

  /* Rôles par la position, piste par piste :
     - une personne quasi immobile longtemps (remplaçant assis, spectateur) n'est pas un joueur : écartée ;
     - une piste présente au moins 70 % du temps dans une même surface de réparation, sans s'en éloigner, est le gardien ;
       une piste « gardien » ou « arbitre » l'est dès 60 % ; c'est le gardien de l'équipe qui défend ce but (dirAt),
       ou il garde son code de gardien si l'on ne sait pas qui défend ;
     - une piste « gardien » présente moins de 40 % du temps dans une surface est un joueur de champ (équipe f la plus votée),
       ou l'arbitre si sa tenue ne ressemble à aucune équipe ;
     - les autres pistes gardent leur équipe. */
  const GOAL_DEPTH = 6.5, GOAL_HALF_WIDTH = 6, STILL_SPREAD = 1, STILL_SECONDS = 8;
  function resolveRoles(frames, teams, opts) {
    const L = opts.L, W = opts.W, out = Object.assign({}, teams), pos = {};
    frames.forEach((f) => f.players.forEach((p) => { (pos[p.id] = pos[p.id] || []).push({ t: f.t, x: p.x, y: p.y, f: p.f }); }));
    const inGoal = (q) => (q.x <= GOAL_DEPTH || q.x >= L - GOAL_DEPTH) && Math.abs(q.y - W / 2) <= GOAL_HALF_WIDTH;
    Object.keys(pos).forEach((id) => {
      const team = teams[id], ps = pos[id];
      if (ps.length < 5) return;
      const mx = ps.reduce((s, q) => s + q.x, 0) / ps.length, my = ps.reduce((s, q) => s + q.y, 0) / ps.length;
      const spread = Math.sqrt(ps.reduce((s, q) => s + (q.x - mx) ** 2 + (q.y - my) ** 2, 0) / ps.length);
      const share = ps.filter(inGoal).length / ps.length;
      // immobile longtemps hors des surfaces (un gardien peut rester immobile dans la sienne) : écarté du jeu
      if (spread < STILL_SPREAD && share < 0.5 && ps[ps.length - 1].t - ps[0].t >= STILL_SECONDS) { out[id] = "REF"; return; }
      const special = team === "GKA" || team === "GKB" || team === "REF";
      if (!special && !(share >= 0.7 && spread <= 4)) return;
      if (share >= 0.6) {
        const mid = ps[ps.length >> 1], left = ps.filter((q) => q.x <= L / 2).length >= ps.length / 2;
        if (typeof opts.dirAt === "function") {
          const aDefendsLeft = opts.dirAt(mid.t) > 0;
          out[id] = left === aDefendsLeft ? "GKA" : "GKB";
        } else if (team === "REF") out[id] = left ? "GKA" : "GKB";
      } else if (share < 0.4 && team !== "REF") {
        // « gardien » qui joue hors de la surface : joueur de champ si sa tenue ressemble à une équipe, sinon arbitre (écarté)
        const v = {}; ps.forEach((q) => { if (q.f === "A" || q.f === "B") v[q.f] = (v[q.f] || 0) + 1; });
        const best = (v.A || 0) >= (v.B || 0) ? "A" : "B";
        out[id] = v[best] >= ps.length * 0.3 ? best : "REF";
      }
    });
    // un seul gardien par équipe : deux pistes « gardien » de la même équipe présentes ensemble (au moins 5 images),
    // on garde celle qui est le plus souvent dans la surface ; l'autre redevient joueur de champ (f) ou est écartée
    const shareOf = {}, framesOf = {};
    Object.keys(pos).forEach((id) => { shareOf[id] = pos[id].filter(inGoal).length / pos[id].length; framesOf[id] = new Set(pos[id].map((q) => q.t)); });
    ["GKA", "GKB"].forEach((gk) => {
      const ids = Object.keys(out).filter((id) => out[id] === gk && pos[id]).sort((a, b) => shareOf[b] * pos[b].length - shareOf[a] * pos[a].length);
      const kept = [];
      ids.forEach((id) => {
        const clash = kept.some((k) => { let n = 0; framesOf[id].forEach((t) => { if (framesOf[k].has(t)) n++; }); return n >= 5; });
        if (!clash) { kept.push(id); return; }
        const v = {}; pos[id].forEach((q) => { if (q.f === "A" || q.f === "B") v[q.f] = (v[q.f] || 0) + 1; });
        const best = (v.A || 0) >= (v.B || 0) ? "A" : "B";
        out[id] = v[best] >= pos[id].length * 0.3 ? best : "REF";
      });
    });
    return out;
  }
  function CODE_TEAM_OK(team) { return team === "A" || team === "B" || team === "GKA" || team === "GKB"; }

  /* Stockage compact (projet / sauvegarde) et retour au format d'analyse. */
  /* 4e élément facultatif : projection de l'image (h), absente des analyses faites avant la 1.2.0. */
  function compactFrames(frames) {
    return frames.map((f) => {
      const c = [Math.round(f.t * 100) / 100, f.players.map((p) => [p.id, TEAM_CODE[p.team], p.x, p.y].concat(p.b || [])), f.ball ? [f.ball.x, f.ball.y] : null];
      if (Array.isArray(f.h) && f.h.length === 9) c.push(f.h);
      return c;
    });
  }
  function expandFrames(compact) {
    if (!Array.isArray(compact)) return [];
    return compact.map((c) => {
      const f = {
        t: c[0], ball: c[2] ? { x: c[2][0], y: c[2][1] } : null,
        players: c[1].map((p) => ({ id: p[0], team: CODE_TEAM[p[1]], x: p[2], y: p[3], b: p.slice(4, 8) }))
      };
      if (Array.isArray(c[3]) && c[3].length === 9 && c[3].every(Number.isFinite)) f.h = c[3];
      return f;
    });
  }

  /* Image la plus proche d'un instant (recherche dichotomique) ; null si trop éloignée. */
  function frameNear(frames, t, maxGap) {
    if (!frames.length) return null;
    let lo = 0, hi = frames.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (frames[m].t < t) lo = m + 1; else hi = m; }
    let best = lo;
    if (lo > 0 && Math.abs(frames[lo - 1].t - t) < Math.abs(frames[lo].t - t)) best = lo - 1;
    return Math.abs(frames[best].t - t) <= (maxGap == null ? 1 : maxGap) ? frames[best] : null;
  }

  /* Instants d'échantillonnage. */
  function sampleTimes(t0, t1, fps) {
    const out = [];
    const step = 1 / fps;
    for (let t = t0; t <= t1 + 1e-9; t += step) out.push(Math.round(t * 1000) / 1000);
    return out;
  }

  /* Début réel de l'analyse : caméra mobile, on part d'un calibrage pour pouvoir suivre la caméra. */
  function startTime(t0, calibs, mobile) {
    const c = (calibs || []).slice().sort((a, b) => a.t - b.t);
    if (!mobile || !c.length) return { t0, note: null };
    if (t0 < c[0].t - 0.01) return { t0: c[0].t, note: "L'analyse commence au premier calibrage (le terrain n'est pas connu avant)." };
    const prior = c.filter((x) => x.t <= t0 + 0.01).pop();
    if (prior && t0 - prior.t > 1.5) return { t0: prior.t, note: "L'analyse commence au dernier calibrage avant la plage choisie, pour suivre la caméra sans interruption." };
    return { t0, note: null };
  }

  /* Durée d'analyse attendue, en secondes par image analysée, mesurée sur une vidéo 1920x1080 réelle
     (i5-12450H + RTX 4050 : carte graphique avec le modèle précis, processeur avec le modèle standard).
     Caméra mobile : suivi du mouvement entre les images (coût M + F / images par seconde ; invisible sur processeur,
     où il se fait pendant les calculs du détecteur). Le facteur appris sur l'ordinateur de l'utilisateur corrige le reste. */
  const EST = {
    dml: { 1: 0.098, 2: 0.121, 3: 0.252, M: 0.2, F: 0.561 },
    cpu: { 1: 0.515, 2: 1.127, 3: 1.524, M: 0, F: 0 }
  };
  const EST_START = 3;   // ouverture de la vidéo et du détecteur
  /* Correction apprise bornée : jusqu'à 4 fois plus rapide (le processeur d'un portable peut aller ~3 fois plus vite
     qu'au moment des mesures, qui restent prudentes) et 3 fois plus lent. */
  const FACTOR_MIN = 0.25, FACTOR_MAX = 3;
  const clampFactor = (f) => Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, f));
  /* o : { t0, t1, fps, tiles, camera, calibrations, kind ("dml" | "cpu"), factor } -> { images, seconds, t0 } */
  function estimateDuration(o) {
    const k = EST[o.kind === "dml" ? "dml" : "cpu"];
    const t0 = startTime(o.t0, o.calibrations, o.camera === "mobile").t0;
    const images = o.t1 > t0 ? sampleTimes(t0, o.t1, o.fps).length : 0;
    const perImage = (k[o.tiles] || k[1]) + (o.camera === "mobile" ? k.M + k.F / o.fps : 0);
    const factor = o.factor > 0 ? clampFactor(o.factor) : 1;
    return { images, seconds: images ? (images * perImage + EST_START) * factor : 0, t0 };
  }
  /* Nouvelle correction après une analyse : moyenne avec l'ancienne (prev ; absente ou 1 = première analyse). */
  function learnFactor(prev, plannedSeconds, realSeconds) {
    if (!(plannedSeconds > 0) || !(realSeconds > 0)) return prev > 0 ? clampFactor(prev) : 1;
    const ratio = clampFactor(realSeconds / plannedSeconds);
    return !(prev > 0) || prev === 1 ? ratio : clampFactor(prev * 0.5 + ratio * 0.5);
  }

  /* ---- Lecture de la vidéo (navigateur uniquement) ---- */
  function seekTo(video, t) {
    return new Promise((resolve, reject) => {
      if (Math.abs(video.currentTime - t) < 0.001 && !video.seeking && video.readyState >= 2) return resolve();
      const done = () => { clearTimeout(to); video.removeEventListener("seeked", done); video.removeEventListener("error", fail); resolve(); };
      const fail = () => { clearTimeout(to); video.removeEventListener("seeked", done); video.removeEventListener("error", fail); reject(new Error("Lecture de la vidéo impossible")); };
      const to = setTimeout(() => { video.removeEventListener("seeked", done); video.removeEventListener("error", fail); reject(new Error("Délai dépassé pendant le positionnement dans la vidéo")); }, 15000);
      video.addEventListener("seeked", done);
      video.addEventListener("error", fail);
      video.currentTime = t;
    });
  }

  /* Saut à l'instant t et lecture de l'instant EXACT de l'image affichée (rappel d'image de la vidéo, juste après « seeked ») : on peut ainsi
     prouver, image après image, qu'aucune image n'est dupliquée ni sautée. Renvoie mediaTime (s), ou null si le navigateur ne le fournit pas. */
  function seekFrame(video, t) {
    return new Promise((resolve, reject) => {
      const hasCb = typeof video.requestVideoFrameCallback === "function";
      let mt = null, seeked = false, fin = false, late = null;
      const finish = (err) => {
        if (fin) return; fin = true;
        clearTimeout(to); clearTimeout(late);
        video.removeEventListener("seeked", onSeeked); video.removeEventListener("error", onErr);
        if (err) reject(err); else resolve(mt);
      };
      const to = setTimeout(() => finish(new Error("Délai dépassé pendant le positionnement dans la vidéo")), 15000);
      const onSeeked = () => { seeked = true; if (!hasCb || mt != null) finish(); else late = setTimeout(() => finish(), 400); };   // le rappel arrive juste après « seeked »
      const onErr = () => finish(new Error("Lecture de la vidéo impossible"));
      video.addEventListener("seeked", onSeeked); video.addEventListener("error", onErr);
      if (hasCb) video.requestVideoFrameCallback((_now, md) => { mt = md.mediaTime; if (seeked) finish(); });
      video.currentTime = t;
    });
  }

  /* Détecte les personnes et le ballon sur une image déjà dessinée dans frameCanvas. */
  async function detectCanvas(frameCanvas, tilesMode, api, thresholds, customRects) {
    const w = frameCanvas.width, h = frameCanvas.height;
    const rects = customRects || tileRects(w, h, tilesMode);
    const work = document.createElement("canvas");
    work.width = Y.SIZE; work.height = Y.SIZE;
    const wctx = work.getContext("2d", { willReadFrequently: true });
    const perTile = [];
    for (const rect of rects) {
      const r = Y.letterboxRatio(rect.w, rect.h, Y.SIZE);
      wctx.fillStyle = "rgb(114,114,114)";
      wctx.fillRect(0, 0, Y.SIZE, Y.SIZE);
      wctx.drawImage(frameCanvas, rect.x, rect.y, rect.w, rect.h, 0, 0, Math.round(rect.w * r), Math.round(rect.h * r));
      const data = wctx.getImageData(0, 0, Y.SIZE, Y.SIZE).data;
      const res = await api.aiDetect(data.buffer.slice(0), thresholds || {});
      if (res.error) throw new Error(res.error);
      perTile.push({ rect, dets: res.dets });
    }
    return mergeTiles(perTile, w, h);
  }

  const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  /* Recalage de la caméra par appariement de points (voir orb.js) quand le suivi image par image décroche (flou, zoom, balayage rapide).
     STEP : deux images voisines ; WIDE : image courante contre une image clé plus ancienne (plus strict). Jamais deviné : sans assez d'appariements
     concordants, la caméra reste « perdue ». */
  const ORB_STEP = { minInliers: 25, minRatio: 0.35 };
  const ORB_WIDE = { minInliers: 30, minRatio: 0.45 };
  const ORB_AGREE_PX = 40;        // px d'origine : deux images clés doivent donner la même position (à ce nombre de pixels près)
  /* Appariement de points entre deux images voisines (après un échec du suivi de points). stats.orb compte les pas rattrapés. */
  function orbStep(from, cur, stats) {
    if (!Orb) return { ok: false };
    const o = Orb.estimateBetween(from, cur, ORB_STEP);
    if (o.ok && stats) stats.orb++;
    return o;
  }
  /* Mouvement entre deux images préparées : suivi de points ; en cas d'échec seulement, appariement de points. */
  function motionRobust(from, cur, stats) {
    const r = Cam.estimateMotion(from, cur, from.mask, cur.mask, { maxCorners: 320 });
    if (r.ok || !Orb) return r;
    const o = orbStep(from, cur, stats);
    return o.ok ? o : r;
  }
  /* Retrouve la position de la caméra à partir des images clés déjà suivies. Suivi de points d'abord (comme avant) ; sinon appariement de points,
     accepté seulement si DEUX images clés différentes donnent la même position (garde-fou contre un faux appariement). Renvoie la matrice M ou null. */
  function relocateKeys(keys, cur, gs, vw, vh, stats) {
    for (let i = keys.length - 1; i >= 0; i--) {
      const k = keys[i], r = Cam.estimateMotion(k.prev, cur, k.prev.mask, cur.mask, { maxCorners: 320 });
      if (r.ok) return HG.mul3(k.M, HG.invert(Cam.toNative(r.H, gs)));
    }
    if (!Orb) return null;
    const cands = [], pts = [[0, 0], [vw, 0], [0, vh], [vw, vh], [vw / 2, vh / 2]];
    for (let i = keys.length - 1; i >= 0; i--) {
      const k = keys[i], r = Orb.estimateBetween(k.prev, cur, ORB_WIDE);
      if (!r.ok) continue;
      const M = HG.mul3(k.M, HG.invert(Cam.toNative(r.H, gs)));
      for (const c of cands) {
        const d = Math.max.apply(null, pts.map((p) => { const a = HG.apply(c, p[0], p[1]), b = HG.apply(M, p[0], p[1]); return Math.hypot(a[0] - b[0], a[1] - b[1]); }));
        if (d <= ORB_AGREE_PX) { if (stats) stats.reloc++; return M; }
      }
      cands.push(M);
    }
    return null;
  }

  /* Analyse complète d'une plage de la vidéo.
     opts : { url, t0, t1, fps, tiles, camera ("fixed" | "mobile"), tol, L, W, calibrations, refs, floorMarks (false = garder les ballons jaunes),
              dirAt (sens de jeu de l'équipe A, pour savoir quel gardien défend quel but), signal, onProgress, api }
     Caméra mobile : à chaque calibrage, le terrain est recalé ; entre deux calibrages, le mouvement de la caméra est suivi.
     Renvoie { frames, lost: [[t0, t1], ...], notes: [texte, ...] }. */
  async function analyseVideo(opts) {
    const video = document.createElement("video");
    video.muted = true; video.preload = "auto"; video.crossOrigin = "anonymous";
    video.src = opts.url;
    await new Promise((res, rej) => { video.onloadedmetadata = res; video.onerror = () => rej(new Error("Vidéo illisible")); });
    const vw = video.videoWidth, vh = video.videoHeight;
    const zoom = opts.tiles === 3;       // « zoom automatique » : résolution d'origine, zone du terrain découpée, recherche du ballon en gros plan
    const maxW = zoom ? 1920 : 1280;
    // fullRes (option cachée, zoom automatique) : plein détail aussi pour les vidéos verticales (sinon réduites à 56 %)
    const scale = zoom && opts.fullRes ? Math.min(1, 1920 / Math.max(vw, vh)) : Math.min(1, maxW / Math.max(vw, vh * (16 / 9)));
    const cw = Math.max(2, Math.round(vw * scale)), ch = Math.max(2, Math.round(vh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const mobile = opts.camera === "mobile";
    const notes = [];
    const calibs = (opts.calibrations || []).slice().sort((a, b) => a.t - b.t);
    if (!calibs.length) throw new Error("Aucun calibrage du terrain");
    const start = startTime(opts.t0, calibs, mobile);
    const t0 = start.t0;
    if (start.note) notes.push(start.note);
    const times = sampleTimes(t0, Math.min(opts.t1, video.duration - 0.05), opts.fps);
    // images réduites pour le suivi de la caméra
    const gw = Math.min(480, cw), gh = Math.max(2, Math.round((ch * gw) / cw)), gs = gw / vw;
    const gcanvas = document.createElement("canvas");
    gcanvas.width = gw; gcanvas.height = gh;
    const gctx = gcanvas.getContext("2d", { willReadFrequently: true });
    // tenues de référence trop proches (voir K.ambiguity) : reconnaissance, suivi et rôles adaptés ; sinon comportement inchangé
    const amb = opts.refs ? K.ambiguity(opts.refs) : { close: false, roles: false };
    const tracker = new T.Tracker(amb.close ? { soft: 2, appearance: true, method: "optimal" } : undefined);
    const derive = [];                   // dérive du suivi mesurée à chaque nouveau calibrage atteint : [{ t, de, med, max }]
    const frames = [], lost = [], recalage = [];   // recalage : [{ de, a, reprise }] ; reprise = instant où la caméra redevient stable (null si jamais)
    let lostStart = null, lastBall = null, curLost = null;
    const doubts = [];                   // pistes dont l'équipe est douteuse (questions au coach)
    const bench = { y0: 0, yW: 0 };      // personnes vues le long de chaque ligne de touche (côté des bancs)
    const benchDrift = opts.benchFollow === false ? null : [];   // décalage de chaque zone de banc (suivi de la dérive de la caméra) ; null = coupé par le coach
    const trk = { anchor: null, M: IDENTITY, prev: null, t: 0, boxes: [], keys: [], failCount: 0 };
    const STEP = 0.1;
    const grabSmall = (boxes) => { gctx.drawImage(video, 0, 0, gw, gh); return Cam.prepare(gctx.getImageData(0, 0, gw, gh).data, gw, gh, boxes, 4); };
    const motion = (from, cur) => Cam.estimateMotion(from, cur, from.mask, cur.mask, { maxCorners: 320 });
    const addKey = (st) => { const last = st.keys[st.keys.length - 1]; if (!last || st.t - last.t >= 1) { st.keys.push({ prev: st.prev, M: st.M, t: st.t }); if (st.keys.length > 14) st.keys.splice(1, 1); } };
    /* Avance le suivi de st.t jusqu'à toT par pas courts ; en cas d'échec, on retente avec un pas deux fois plus court. */
    async function advanceMotion(st, toT) {
      let guard = 0;
      while (st.t < toT - 1e-3 && guard++ < 400) {
        let nt = Math.min(toT, st.t + STEP), r = null, cur = null, curT = nt;
        for (let attempt = 0; attempt < 2; attempt++) {
          await seekTo(video, nt);
          cur = grabSmall(st.boxes); curT = nt;
          r = motion(st.prev, cur);
          if (r.ok) break;
          nt = st.t + (nt - st.t) / 2;
          if (nt - st.t < 0.02) break;
        }
        // dernier recours avant « perdu » : appariement de points entre l'image de départ et la plus proche image lue (flou, zoom, balayage rapide)
        if (cur && !(r && r.ok)) { const o = orbStep(st.prev, cur, camStats); if (o.ok) { r = o; nt = curT; } }
        if (!r || !r.ok) { await seekTo(video, toT); return false; }
        st.M = HG.mul3(st.M, HG.invert(Cam.toNative(r.H, gs)));
        st.prev = cur; st.t = nt; addKey(st);
      }
      return st.t >= toT - 1e-3;
    }
    /* Caméra perdue : après un balayage ou un flou, la position n'est pas retrouvable par comparaison avec l'avant (la vue a changé).
       On cherche donc le moment où la caméra redevient stable (RESUME_RUN secondes de suivi sans échec) : c'est là qu'un calibrage
       permettra de reprendre. Ce suivi à part ne place rien sur le terrain : il ne sert qu'à indiquer le point de reprise. */
    const probe = { prev: null, t: 0, M: IDENTITY, keys: [], boxes: [], run: 0, from: 0 };
    const restartProbe = async (t) => { await seekTo(video, t); probe.prev = grabSmall([]); probe.t = t; probe.from = t; probe.run = 0; probe.keys = []; };
    async function watchResume(cl, t) {
      if (cl.reprise != null) return;
      if (!probe.prev || probe.t > t) { await restartProbe(t); return; }
      const before = probe.t;
      if (await advanceMotion(probe, t)) {
        probe.run += t - before;
        if (probe.run >= RESUME_RUN) cl.reprise = Math.round(probe.from * 100) / 100;
      } else await restartProbe(t);
    }
    function relocalize(st, cur, t) {
      const M = relocateKeys(st.keys, cur, gs, vw, vh, camStats);
      if (M) { st.M = M; st.prev = cur; st.t = t; addKey(st); st.failCount = 0; return true; }
      st.failCount++;
      return false;
    }
    const camStats = { orb: 0, reloc: 0 };
    const started = Date.now();
    for (let i = 0; i < times.length; i++) {
      if (opts.signal && opts.signal.aborted) throw new Error("Analyse interrompue");
      const t = times[i];
      const calib = calibrationAt(calibs, t);
      // Caméra mobile : le mouvement est suivi par petits pas (≤ 0,1 s), même si les images analysées sont plus espacées
      let trackOk = true;
      if (mobile && trk.anchor && trk.anchor === calib && trk.prev) trackOk = await advanceMotion(trk, t);
      else await seekTo(video, t);
      ctx.drawImage(video, 0, 0, cw, ch);
      const img = ctx.getImageData(0, 0, cw, ch);
      let dets;
      if (zoom) {
        const Hprev = mobile && trk.anchor === calib ? HG.mul3(trk.anchor.H, trk.M) : calib.H;
        const crop = courtRegion(Hprev, opts.L, opts.W, scale, cw, ch);
        dets = dropFloorMarks(await detectCanvas(canvas, 1, opts.api, { minPerson: 0.35, minBall: BALL_CAND }, crop ? zoomRects(crop) : tileRects(cw, ch, 2)), img, opts.floorMarks);
        // ballon non vu : recherche en gros plan autour de sa dernière position connue
        if (!dets.some((d) => d.cls === Y.CLASS_BALL && d.score >= BALL_STRONG) && lastBall && t - lastBall.t <= 1.0) {
          const half = Math.round(Math.max(90, Math.min(cw, ch) * 0.17));
          const rx = Math.max(0, Math.min(cw - 2 * half, Math.round(lastBall.x - half))), ry = Math.max(0, Math.min(ch - 2 * half, Math.round(lastBall.y - half)));
          const roi = dropFloorMarks(await detectCanvas(canvas, 1, opts.api, { minPerson: 2, minBall: BALL_CAND }, [{ x: rx, y: ry, w: Math.min(cw, 2 * half), h: Math.min(ch, 2 * half) }]), img, opts.floorMarks);
          const best = roi.filter((d) => d.cls === Y.CLASS_BALL).sort((a, b) => b.score - a.score)[0];
          if (best) dets.push(best);
        }
        const bd = dets.filter((d) => d.cls === Y.CLASS_BALL && d.score >= BALL_STRONG).sort((a, b) => b.score - a.score)[0];
        if (bd) lastBall = { x: (bd.x1 + bd.x2) / 2, y: (bd.y1 + bd.y2) / 2, t };
      } else dets = dropFloorMarks(await detectCanvas(canvas, opts.tiles, opts.api, { minPerson: 0.35, minBall: BALL_CAND }), img, opts.floorMarks);
      let H = calib.H, reliable = true;
      if (mobile) {
        const boxes = dets.filter((d) => d.cls === Y.CLASS_PERSON).map((d) => [d.x1 * (gw / cw), d.y1 * (gh / ch), d.x2 * (gw / cw), d.y2 * (gh / ch)]);
        trk.boxes = boxes;
        if (calib !== trk.anchor || !trk.prev) {
          // un nouveau calibrage est atteint : on mesure d'abord de combien le suivi issu du calibrage précédent s'écartait de lui (jamais corrigé en douce)
          if (trk.anchor && trk.prev && calib.t > trk.t) {
            const old = trk.anchor;
            if (await advanceMotion(trk, calib.t)) {
              const dr = driftAt(HG.mul3(old.H, trk.M), calib.H, vw, vh, opts.L, opts.W);
              if (dr) derive.push({ t: calib.t, de: old.t, med: dr.med, max: dr.max });
            }
            await seekTo(video, t);
          }
          gctx.drawImage(video, 0, 0, gw, gh);
          const cur = Cam.prepare(gctx.getImageData(0, 0, gw, gh).data, gw, gh, boxes, 4);
          trk.anchor = calib; trk.M = IDENTITY; trk.prev = cur; trk.t = t; trk.keys = [{ prev: cur, M: IDENTITY, t }]; trk.failCount = 0;
        } else if (!trackOk) {
          // dernier recours : retrouver la position en comparant l'image à des images clés déjà suivies
          gctx.drawImage(video, 0, 0, gw, gh);
          const cur = Cam.prepare(gctx.getImageData(0, 0, gw, gh).data, gw, gh, boxes, 4);
          reliable = relocalize(trk, cur, t);
        }
        H = HG.mul3(trk.anchor.H, trk.M);
      }
      if (!reliable) {
        if (lostStart == null) { lostStart = t; curLost = { de: t, reprise: null }; probe.prev = null; }
        if (mobile) await watchResume(curLost, t);
        if (opts.onProgress) opts.onProgress({ done: i + 1, total: times.length, eta: ((Date.now() - started) / 1000 / (i + 1)) * (times.length - i - 1), frame: null, lost: true });
        continue;
      }
      if (lostStart != null) { lost.push([lostStart, t]); recalage.push({ de: curLost.de, a: t, reprise: curLost.reprise }); lostStart = null; curLost = null; }
      frames.push(processDetections(dets, { frameW: cw, frameH: ch, scale, img, H, L: opts.L, W: opts.W, refs: opts.refs, reject: opts.tol, tracker, t, close: amb.close, appearance: amb.close, bench, benchZones: opts.benchZones, benchDrift, ballMargin: opts.ballMargin }));
      if (opts.onProgress) {
        const elapsed = (Date.now() - started) / 1000;
        opts.onProgress({ done: i + 1, total: times.length, eta: (elapsed / (i + 1)) * (times.length - i - 1), frame: frames[frames.length - 1] });
      }
    }
    if (lostStart != null) { lost.push([lostStart, times[times.length - 1]]); recalage.push({ de: curLost.de, a: times[times.length - 1], reprise: curLost.reprise }); }
    video.removeAttribute("src"); video.load();
    if (lost.length) notes.push("Suivi de la caméra perdu sur " + lost.length + " passage(s) : ces images sont ignorées. Ajoutez un calibrage dans ces passages (flou, caméra trop rapide ou sol sans détails).");
    if (camStats.orb + camStats.reloc) notes.push("Caméra rattrapée automatiquement " + (camStats.orb + camStats.reloc) + " fois (flou, zoom ou balayage rapide) en appariant les points du terrain.");
    derive.forEach((d) => notes.push("Au calibrage de " + fmtMin(d.t) + ", le suivi issu du calibrage de " + fmtMin(d.de) + " s'écartait de " + d.med.toFixed(1).replace(".", ",") + " m (médiane sur le terrain visible, " + d.max.toFixed(1).replace(".", ",") + " m au plus)" + (d.med >= 1 ? " : le tracé a pu glisser avant cet instant ; ajouter des calibrages plus rapprochés le limite." : " : le suivi tient bien.")));
    const finalFrames = finalizeFrames(frames, { L: opts.L, W: opts.W, dirAt: opts.dirAt, roles: amb.close || amb.roles, doubts });
    if (bench.drift && bench.drift.d >= BENCH_ASK) doubts.push({ kind: "bench", t: bench.drift.t, d: bench.drift.d, zones: bench.drift.zones });
    return { frames: finalFrames, lost, notes, bench, doubts, recalage, derive };
  }

  /* ---- Analyse continue ----
     Chaque image de la vidéo est lue et analysée, au lieu d'une image sur dix : lecture par saut exact au milieu de l'image (mesuré sur une vraie
     vidéo : aucune image perdue, contrairement à la lecture continue d'un lecteur vidéo), détection de l'image k pendant la lecture de l'image k+1
     et pendant le suivi de la caméra. Le suivi de la caméra se fait toutes les CAM_EVERY images (0,1 s à 30 images/s) ; la matrice des images
     intermédiaires est interpolée. Le suivi des joueurs (filtre de Kalman) voit toutes les images.
     Deux sorties :
       frames : ancienne cadence (~3,3 images/s), pour tout ce qui a été écrit pour elle (erreurs, doutes, plan tactique) ;
       trace  : trajectoires continues (~10 images/s), mêmes identités.
     opts : comme analyseVideo, plus videoFps (30 par défaut). Le zoom automatique (tiles 3) n'est pas disponible : repli sur « Renforcé ». */
  const CAM_EVERY = 3;            // images entre deux mesures du mouvement de la caméra
  const LEGACY_EVERY = 3;         // une image de la trace sur 3 est aussi une image de l'analyse historique
  const BRIDGE_TOL = 2;           // px (image de 480 px de large) : écart maximal entre le pas précédent et le pas suivant pour enjamber une image floue
  const BRIDGE_MAX = 2;           // images floues de suite qu'on accepte d'enjamber
  const MAP_WINDOW = 1.2;         // s : fenêtre de recherche de l'identité finale d'une piste pour les images de la trace

  /* Écart maximal (px) entre deux pas de caméra (matrices image précédente -> image suivante) sur les coins et le centre d'une image w x h. */
  function stepGap(Ha, Hb, w, h) {
    let m = 0;
    [[0, 0], [w, 0], [w, h], [0, h], [w / 2, h / 2]].forEach(([x, y]) => {
      const a = HG.apply(Ha, x, y), b = HG.apply(Hb, x, y);
      m = Math.max(m, Math.hypot(a[0] - b[0], a[1] - b[1]));
    });
    return m;
  }
  const avgStep = (a, b) => a.map((v, i) => (v / a[8] + b[i] / b[8]) / 2);
  const fmtMin = (t) => Math.floor(t / 60) + ":" + String(Math.floor(t % 60)).padStart(2, "0");
  const lerpM = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

  async function analyseVideoContinuous(opts) {
    const video = document.createElement("video");
    video.muted = true; video.preload = "auto"; video.crossOrigin = "anonymous";
    video.src = opts.url;
    await new Promise((res, rej) => { video.onloadedmetadata = res; video.onerror = () => rej(new Error("Vidéo illisible")); });
    const vw = video.videoWidth, vh = video.videoHeight, notes = [];
    let tilesMode = opts.tiles;
    if (tilesMode === 3) { tilesMode = 2; notes.push("Le zoom automatique n'est pas disponible en analyse continue : précision « Renforcée » utilisée."); }
    const scale = Math.min(1, 1280 / Math.max(vw, vh * (16 / 9)));
    const cw = Math.max(2, Math.round(vw * scale)), ch = Math.max(2, Math.round(vh * scale));
    const mkCanvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
    const cvs = Array.from({ length: CAM_EVERY + 2 }, () => mkCanvas(cw, ch));      // une toile par image en attente : la détection lit sa toile après la lecture de l'image suivante
    const ctxs = cvs.map((c) => c.getContext("2d", { willReadFrequently: true }));
    const gw = Math.min(480, cw), gh = Math.max(2, Math.round((ch * gw) / cw)), gs = gw / vw;
    const gctx = mkCanvas(gw, gh).getContext("2d", { willReadFrequently: true });
    const mobile = opts.camera === "mobile";
    const calibs = (opts.calibrations || []).slice().sort((a, b) => a.t - b.t);
    if (!calibs.length) throw new Error("Aucun calibrage du terrain");
    const start = startTime(opts.t0, calibs, mobile);
    const t0 = start.t0;
    if (start.note) notes.push(start.note);
    const vfps = opts.videoFps > 0 ? opts.videoFps : 30, dtF = 1 / vfps;
    const tEnd = Math.min(opts.t1, video.duration - 0.05);
    const nFrames = tEnd > t0 ? Math.floor((tEnd - t0) / dtF + 1e-6) + 1 : 0;
    const amb = opts.refs ? K.ambiguity(opts.refs) : { close: false, roles: false };
    const tracker = new T.Tracker({ method: "kalman", soft: amb.close ? 2 : 0, appearance: amb.close });
    const frames = [], trace = [], lost = [], recalage = [], doubts = [];
    const bench = { y0: 0, yW: 0 };
    const benchDrift = opts.benchFollow === false ? null : [];
    let lostStart = null, curLost = null, lastBoxes = [], analysed = 0, skipDetect = false;   // skipDetect : caméra perdue, détecter ne servirait à rien

    /* ---- caméra ---- */
    const trk = { anchor: null, M: IDENTITY, prev: null, keys: [], lastStep: null, bridge: null, Mprev: IDENTITY, anchorPrev: null, kPrev: -1, bridged: 0 };
    const camStats = { orb: 0, reloc: 0 };
    const motion = (from, cur) => Cam.estimateMotion(from, cur, from.mask, cur.mask, { maxCorners: 320 });
    const prep = (fr) => fr.prep || (fr.prep = Cam.prepare(fr.small.data, gw, gh, lastBoxes, 4));
    const addKey = (t) => { const last = trk.keys[trk.keys.length - 1]; if (!last || t - last.t >= 1) { trk.keys.push({ prev: trk.prev, M: trk.M, t }); if (trk.keys.length > 14) trk.keys.splice(1, 1); } };
    /* Un pas mesuré avec succès. Si une image floue vient d'être sautée : on n'enjambe que si le pas précédent et le pas suivant se ressemblent
       (sinon la position de la caméra est inconnue : perdu). Renvoie "ok" ou "fail". */
    function stepOk(r, cur, t) {
      if (trk.bridge) {
        const b = trk.bridge; trk.bridge = null;
        if (!b.stepPrev || stepGap(b.stepPrev, r.H, gw, gh) > BRIDGE_TOL) return "fail";
        trk.M = HG.mul3(HG.mul3(b.M0, HG.invert(Cam.toNative(avgStep(b.stepPrev, r.H), gs))), HG.invert(Cam.toNative(r.H, gs)));
        trk.bridged++;
      } else trk.M = HG.mul3(trk.M, HG.invert(Cam.toNative(r.H, gs)));
      trk.prev = cur; trk.lastStep = r.H; addKey(t);
      return "ok";
    }
    /* Un pas échoué : si le pas précédent est connu, l'image floue sert de nouvelle référence et on attend le pas suivant pour décider. */
    function stepFail(cur) {
      if (trk.bridge) { trk.bridge.n++; if (trk.bridge.n > BRIDGE_MAX) { trk.bridge = null; return "fail"; } trk.prev = cur; return "pending"; }
      if (!trk.lastStep) return "fail";
      trk.bridge = { M0: trk.M, stepPrev: trk.lastStep, n: 1 };
      trk.prev = cur;
      return "pending";
    }
    function relocalize(cur, t) {
      const M = relocateKeys(trk.keys, cur, gs, vw, vh, camStats);
      if (!M) return false;
      trk.M = M; trk.prev = cur; trk.lastStep = null; trk.bridge = null; addKey(t);
      return true;
    }
    /* Mesure du mouvement jusqu'à l'image fr (between : images intermédiaires, en cas d'échec on refait le chemin image par image).
       Renvoie { reliable, anchor, M, Mprev, anchorPrev, kPrev }. */
    function cameraStep(fr, between) {
      const calib = calibrationAt(calibs, fr.t);
      const base = { anchor: calib };
      if (!mobile) return { reliable: true, anchor: calib, fixed: true };
      if (calib !== trk.anchor || !trk.prev) {
        trk.anchor = calib; trk.M = IDENTITY; trk.prev = prep(fr); trk.keys = [{ prev: trk.prev, M: IDENTITY, t: fr.t }]; trk.lastStep = null; trk.bridge = null;
        trk.anchorPrev = null; trk.kPrev = fr.k; trk.Mprev = IDENTITY; trk.prevOk = true; trk.broken = false;
        return Object.assign(base, { reliable: true, M: trk.M, Mprev: trk.M, anchorPrev: calib, kPrev: fr.k });
      }
      if (trk.broken) {                                              // position inconnue (échec définitif) : seules les images clés ou un nouveau calibrage la redonnent, jamais une chaîne repartie d'une position périmée
        if (!relocalize(prep(fr), fr.t)) { trk.prevOk = false; return Object.assign(base, { reliable: false }); }
        trk.broken = false; trk.Mprev = trk.M; trk.anchorPrev = trk.anchor; trk.kPrev = fr.k; trk.prevOk = true;
        return Object.assign(base, { reliable: true, M: trk.M, Mprev: trk.M, anchorPrev: trk.anchor, kPrev: fr.k });
      }
      const prevOk = trk.prevOk !== false;                         // pas d'interpolation vers une mesure ancienne (après un passage perdu)
      const Mprev = trk.Mprev, anchorPrev = trk.anchorPrev || trk.anchor, kPrev = trk.kPrev;
      let status;
      const direct = prep(fr), r = motion(trk.prev, direct);
      if (r.ok) status = stepOk(r, direct, fr.t);
      else {
        status = "ok";
        const chain = between.concat([fr]);
        for (let j = 0; j < chain.length && status !== "fail"; j++) {
          const cur = prep(chain[j]), rr = motionRobust(trk.prev, cur, camStats);
          status = rr.ok ? stepOk(rr, cur, chain[j].t) : stepFail(cur);
          if (status === "pending") status = "ok-pending";
        }
        if (trk.bridge) status = "pending";                      // image floue en fin de pas : on attend le pas suivant
        else if (status === "ok-pending") status = "ok";
      }
      if (status === "fail") {
        const ok = relocalize(prep(fr), fr.t);                    // dernier recours : retrouver la position par les images clés déjà suivies
        status = ok ? "ok" : "fail";
        if (!ok) trk.broken = true;
      }
      if (status !== "ok") { trk.prevOk = false; return Object.assign(base, { reliable: false, pending: status === "pending" }); }
      trk.Mprev = trk.M; trk.anchorPrev = trk.anchor; trk.kPrev = fr.k; trk.prevOk = true;
      return Object.assign(base, { reliable: true, M: trk.M, Mprev: prevOk ? Mprev : trk.M, anchorPrev: prevOk ? anchorPrev : trk.anchor, kPrev: prevOk ? kPrev : fr.k });
    }

    /* ---- recherche du point de reprise pendant un passage perdu (comme analyseVideo) ---- */
    let probe = { prev: null, from: 0, run: 0, t: 0 };
    function watchResume(cl, fr) {
      if (cl.reprise != null) return;
      const cur = prep(fr);
      if (!probe.prev) { probe = { prev: cur, from: fr.t, run: 0, t: fr.t }; return; }
      const r = motion(probe.prev, cur);
      if (r.ok) { probe.run += fr.t - probe.t; probe.prev = cur; probe.t = fr.t; if (probe.run >= RESUME_RUN) cl.reprise = Math.round(probe.from * 100) / 100; }
      else probe = { prev: cur, from: fr.t, run: 0, t: fr.t };
    }

    /* ---- lecture et détection d'une image ---- */
    let seq = 0;
    async function acquire(target) {
      const mt = await seekFrame(video, target);
      const ci = seq++ % cvs.length;
      ctxs[ci].drawImage(video, 0, 0, cw, ch);
      const img = ctxs[ci].getImageData(0, 0, cw, ch);
      gctx.drawImage(video, 0, 0, gw, gh);
      const small = gctx.getImageData(0, 0, gw, gh);
      let detP = null;
      if (!skipDetect) { detP = detectCanvas(cvs[ci], tilesMode, opts.api, { minPerson: 0.35, minBall: BALL_CAND }); detP.catch(() => {}); }   // la détection d'une image ignorée sera simplement jetée
      const raw = mt != null ? mt : target - dtEst / 2;               // instant exact (non arrondi : sert à programmer l'image suivante sans dérive)
      return { mt, target, raw, t: Math.round(raw * 1000) / 1000, img, small, detP };
    }

    /* ---- images en attente de leur matrice de caméra ---- */
    async function flush(batch, cam, started, onProgress) {
      for (const fr of batch) {
        let reliable = cam.reliable && !!fr.detP, H = null;
        if (reliable) {
          if (cam.fixed) H = cam.anchor.H;
          else {
            const useNew = calibrationAt(calibs, fr.t) === cam.anchor;
            const M = useNew ? (cam.anchorPrev === cam.anchor && fr.k > cam.kPrev ? lerpM(cam.Mprev, cam.M, Math.min(1, (fr.k - cam.kPrev) / Math.max(1, batch[batch.length - 1].k - cam.kPrev))) : cam.M) : cam.Mprev;
            H = HG.mul3((useNew ? cam.anchor : cam.anchorPrev).H, M);
          }
        }
        if (!reliable) {
          if (lostStart == null) { lostStart = fr.t; curLost = { de: fr.t, reprise: null }; probe = { prev: null, from: 0, run: 0, t: 0 }; }
          continue;
        }
        if (lostStart != null) { lost.push([lostStart, fr.t]); recalage.push({ de: curLost.de, a: fr.t, reprise: curLost.reprise }); lostStart = null; curLost = null; }
        const dets = dropFloorMarks(await fr.detP, fr.img, opts.floorMarks);
        lastBoxes = dets.filter((d) => d.cls === Y.CLASS_PERSON).map((d) => [d.x1 * (gw / cw), d.y1 * (gh / ch), d.x2 * (gw / cw), d.y2 * (gh / ch)]);
        const legacy = fr.k % (CAM_EVERY * LEGACY_EVERY) === 0;
        const o = processDetections(dets, { frameW: cw, frameH: ch, scale, img: fr.img, H, L: opts.L, W: opts.W, refs: opts.refs, reject: opts.tol, tracker, t: fr.t, close: amb.close, appearance: amb.close, bench, benchZones: opts.benchZones, benchDrift, noBenchStats: !legacy });
        analysed++;
        if (fr.k % CAM_EVERY === 0) trace.push(o);
        if (legacy) frames.push(o);
        if (onProgress && fr.k % CAM_EVERY === 0) {
          const elapsed = (Date.now() - started) / 1000;
          onProgress({ done: fr.k + 1, total: nFrames, eta: (elapsed / (fr.k + 1)) * (nFrames - fr.k - 1), frame: legacy ? o : null });
        }
      }
    }

    /* ---- boucle ----
       Chaque saut vise le MILIEU de l'image suivante, calculé à partir de l'instant réel de l'image précédente (et non d'une cadence supposée) :
       une vidéo à 29,97 images/s ou à cadence légèrement variable reste suivie sans doublon ni saut. Une image dupliquée est écartée et comptée,
       une image sautée est comptée : le résultat les indique. */
    const started = Date.now();
    let dtEst = dtF, prevMt = null, n = 0, dup = 0, skipped = 0, noMt = 0, lastFrameT = t0, batch = [], retry = 0;
    let nextAcq = nFrames ? acquire(t0 + dtF / 2) : null;
    try {
      while (nextAcq) {
        if (opts.signal && opts.signal.aborted) throw new Error("Analyse interrompue");
        const fr = await nextAcq;
        let drop = false;
        if (fr.mt != null) {
          if (prevMt != null) {
            const d = fr.mt - prevMt;
            if (d < 0.5 * dtEst) { drop = true; if (retry < 2) retry++; else { dup++; retry = 0; } }       // même image qu'avant : on relit la même image (jusqu'à 2 fois), sinon on la compte et on avance
            else if (d > 1.5 * dtEst) { skipped += Math.round(d / dtEst) - 1; }
            else dtEst = 0.98 * dtEst + 0.02 * d;                         // la durée d'une image s'affine
          }
          if (!drop) prevMt = fr.mt;
        } else noMt++;
        // image suivante : milieu de l'image qui suit l'image réellement lue ; fin si elle dépasse la plage
        const next = drop ? fr.target + (retry > 0 ? 0.25 * dtEst : dtEst) : (prevMt != null ? prevMt : fr.raw) + 1.5 * dtEst;
        const more = fr.raw + dtEst <= tEnd + 0.002 && n < nFrames * 1.05 + 10;
        nextAcq = more ? acquire(next) : null;                           // lecture de l'image suivante pendant le traitement de celle-ci
        if (nextAcq) nextAcq.catch(() => {});
        if (drop) continue;
        retry = 0; fr.k = n++; lastFrameT = fr.t;
        batch.push(fr);
        const isLast = !nextAcq;
        if (mobile && fr.k % CAM_EVERY !== 0 && !isLast) continue;
        const cam = cameraStep(fr, batch.slice(0, -1));
        skipDetect = !cam.reliable;                                       // reprend dès que la caméra est retrouvée (les 1 à 3 images lues entre-temps restent « non analysées »)
        if (!cam.reliable && lostStart != null) watchResume(curLost, fr);
        else if (!cam.reliable && opts.onProgress) opts.onProgress({ done: fr.k + 1, total: nFrames, eta: 0, frame: null, lost: true });
        await flush(batch, cam, started, opts.onProgress);
        batch = [];
      }
    } finally {
      video.removeAttribute("src"); video.load();
    }
    const lastT = lastFrameT;
    if (lostStart != null) { lost.push([lostStart, lastT]); recalage.push({ de: curLost.de, a: lastT, reprise: curLost.reprise }); }
    if (lost.length) notes.push("Suivi de la caméra perdu sur " + lost.length + " passage(s) : ces images sont ignorées. Ajoutez un calibrage dans ces passages (flou, caméra trop rapide ou sol sans détails).");
    if (camStats.orb + camStats.reloc) notes.push("Caméra rattrapée automatiquement " + (camStats.orb + camStats.reloc) + " fois (flou, zoom ou balayage rapide) en appariant les points du terrain.");
    if (trk.bridged) notes.push("Caméra : " + trk.bridged + " image(s) floue(s) enjambée(s) par estimation (écart de moins de " + BRIDGE_TOL + " px avec les pas voisins).");

    // ballon : choix cohérent sur la trace (cadence plus fine), sans toucher aux candidats de l'analyse historique
    const withC = trace.filter((f) => Array.isArray(f.bc)), picks = BT && withC.length ? BT.select(withC) : [], pickOf = new Map();
    withC.forEach((f, i) => { if (picks[i]) pickOf.set(f, { x: picks[i][0], y: picks[i][1] }); });
    trace.forEach((f) => f.players.forEach((p) => { p.oid = p.id; }));
    const finalFrames = finalizeFrames(frames, { L: opts.L, W: opts.W, dirAt: opts.dirAt, roles: amb.close || amb.roles, doubts });
    if (bench.drift && bench.drift.d >= BENCH_ASK) doubts.push({ kind: "bench", t: bench.drift.t, d: bench.drift.d, zones: bench.drift.zones });
    // identités finales (équipes, coupures, recollages décidés sur l'analyse historique) reportées sur la trace : échantillon de la même piste le plus proche dans le temps
    const byOid = new Map();
    finalFrames.forEach((f) => f.players.forEach((p) => { (byOid.get(p.oid) || byOid.set(p.oid, []).get(p.oid)).push({ t: f.t, id: p.id, team: p.team }); }));
    const traceOut = trace.map((f) => {
      const players = [];
      f.players.forEach((p) => {
        const list = byOid.get(p.oid);
        if (!list) return;
        let best = null, bd = Infinity;
        list.forEach((s) => { const d = Math.abs(s.t - f.t); if (d < bd) { bd = d; best = s; } });
        if (best && bd <= MAP_WINDOW) players.push({ id: best.id, team: best.team, x: p.x, y: p.y, b: p.b });
      });
      const o = { t: f.t, players, ball: pickOf.get(f) || null };
      if (f.h) o.h = f.h;
      return o;
    });
    return { frames: finalFrames, trace: traceOut, lost, notes, bench, doubts, recalage, continuous: { videoFps: Math.round((1 / dtEst) * 100) / 100, images: n, analysed, duplicated: dup, skipped, withoutFrameTime: noMt, bridged: trk.bridged } };
  }

  /* Vignettes JPEG de la vidéo à des instants donnés (illustrations des erreurs acceptées). */
  async function captureFrames(url, times, width) {
    const video = document.createElement("video");
    video.muted = true; video.preload = "auto"; video.crossOrigin = "anonymous"; video.src = url;
    await new Promise((res, rej) => { video.onloadedmetadata = res; video.onerror = () => rej(new Error("Vidéo illisible")); });
    const w = width || 320, h = Math.max(2, Math.round((w * video.videoHeight) / video.videoWidth));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    const out = [];
    for (const t of times) {
      try {
        await seekTo(video, Math.max(0, Math.min(video.duration - 0.05, t)));
        ctx.drawImage(video, 0, 0, w, h);
        out.push(canvas.toDataURL("image/jpeg", 0.6));
      } catch (_e) { out.push(null); }
    }
    video.removeAttribute("src"); video.load();
    return out;
  }

  /* Détection ponctuelle sur l'image affichée (choix des tenues). Renvoie les personnes en pixels vidéo. */
  async function detectAt(video, api, tilesMode) {
    const vw = video.videoWidth, vh = video.videoHeight;
    const scale = Math.min(1, 1280 / Math.max(vw, vh * (16 / 9)));
    const cw = Math.max(2, Math.round(vw * scale)), ch = Math.max(2, Math.round(vh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, cw, ch);
    const dets = await detectCanvas(canvas, tilesMode || 1, api, { minPerson: 0.3, minBall: 0.12 });
    return { dets, scale, img: ctx.getImageData(0, 0, cw, ch), width: cw, height: ch };
  }

  return { isFloorMark, courtH, driftAt, trackDrift, inBenchZone, shiftedZones, followBenches, tileRects, courtRegion, zoomRects, tileToFrame, mergeTiles, isFloorMark, dropFloorMarks, calibrationAt, processDetections, finalizeFrames, compactFrames, expandFrames, frameNear, sampleTimes, startTime, estimateDuration, learnFactor, FACTOR_MIN, FACTOR_MAX, analyseVideo, analyseVideoContinuous, stepGap, avgStep, lerpM, detectAt, detectCanvas, captureFrames, TEAM_CODE };
});
