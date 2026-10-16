/* Analyse tactique automatique à partir des trajectoires (coordonnées terrain en mètres).
   Entrée : frames = [{ t, players: [{ id, team: "A"|"B"|"GKA"|"GKB", x, y }], ball: {x, y} | null }]
   A = mon équipe. Le moteur remet toujours le terrain « de mon équipe qui attaque vers x croissant ».
   Sortie : événements suggérés (à valider par le coach) et statistiques de match. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./context"));
  else root.FutsalMatch = factory(root.FutsalContext);
})(typeof self !== "undefined" ? self : this, function (C) {
  "use strict";

  const POSSESSION_RADIUS = 2.2;     // m : le ballon est « au pied » du joueur le plus proche
  const BALL_HOLD = 0.8;             // s : on garde la dernière position connue du ballon
  const MIN_POSSESSION_FRAMES = 2;   // images consécutives pour confirmer un changement
  const COOLDOWN = 8;                // s entre deux événements du même type
  const MAX_STEP_SPEED = 9;          // m/s : au-delà, saut de suivi ignoré dans les distances

  const isGK = (p) => p.team === "GKA" || p.team === "GKB";
  const side = (p) => (p.team === "A" || p.team === "GKA" ? "A" : "B");
  const PLAYING = { A: 1, B: 1, GKA: 1, GKB: 1 };   // arbitres, public et joueurs non identifiés sont ignorés

  /* Remet les coordonnées dans le repère « mon équipe attaque vers x croissant ». */
  function normalize(frames, L, W, dirAt, subs) {
    return frames.map((f) => {
      const flip = (typeof dirAt === "function" ? dirAt(f.t) : 1) < 0;
      const tf = (o) => (flip ? { x: L - o.x, y: W - o.y } : { x: o.x, y: o.y });
      const A = [], B = [];
      f.players.forEach((p) => {
        if (!PLAYING[p.team]) return;
        const q = Object.assign({ id: p.id, gk: isGK(p) }, tf(p));
        if (subs && subs.has(p.id) && subs.get(p.id).some(([a, b]) => f.t >= a - 1e-6 && f.t <= b + 1e-6)) q.sub = true;
        (side(p) === "A" ? A : B).push(q);
      });
      return { t: f.t, A, B, ball: f.ball ? tf(f.ball) : null };
    });
  }

  function zoneOf(x, L) { return x < L / 3 ? "DEF" : x < (2 * L) / 3 ? "MED" : "ATT"; }
  function sideOf(y, W) { return y < W / 3 ? "G" : y > (2 * W) / 3 ? "D" : "C"; }

  const DUEL_MARGIN = 0.6;           // m : dans un duel, l'adversaire doit être nettement plus près pour prendre le ballon
  const MIN_LOSS_DURATION = 1.0;     // s : une possession adverse plus courte est un duel gagné, pas une perte
  const BALL_CONF_MIN = 0.6;         // part minimale d'images avec ballon détecté autour d'une erreur pour la suggérer
  const CONF_BEFORE = 1.5, CONF_AFTER = 0.5;   // s : fenêtre de cette mesure autour de l'erreur
  const BENCH_MIN_SEEN = 20;         // remplaçants vus au minimum pour déduire le côté des bancs…
  const BENCH_RATIO = 3;             // …et au moins 3 fois plus d'un côté que de l'autre
  const SUB_LINE = 3;                // m : zone de remplacement le long de la ligne de touche des bancs
  const SUB_ZONE = 10;               // m : de part et d'autre de la ligne médiane
  const SUB_WINDOW = 3;              // s : durée pendant laquelle le joueur qui entre ou sort n'est pas compté
  const PRESS_DIST = 3;              // m : adversaire qui presse le porteur
  const LONG_POSSESSION = 8;         // s : au-delà, attaque placée
  const MIN_PROGRESS = 4;            // m : avancée adverse minimale pour parler de repli tardif
  const LOSS_NOTE = {
    pressing: (n) => "Perte sous le pressing adverse (" + n + " adversaires à moins de 3 m) : chercher une solution courte, un appui ou jouer en un temps",
    attaque_placee: (_n, d) => "Perte en attaque placée après " + Math.round(d) + " s de possession : garder l'équilibre défensif derrière le ballon (couverture du fixo)",
    transition: () => "Perte en transition : sécuriser la première passe et soutenir le porteur"
  };
  const CONF_CTX = 1.0;              // s : l'erreur est écartée si le jeu est arrêté ou incertain dans la seconde qui précède

  /* Possession image par image : "A", "B" ou null (ballon libre ou inconnu).
     Seules les images où le ballon est réellement détecté peuvent confirmer un changement : une position recopiée
     (ballon gardé BALL_HOLD secondes) est neutre. Dans un duel, l'équipe en possession garde le ballon tant qu'un
     de ses joueurs est à moins de POSSESSION_RADIUS et que l'adversaire n'est pas plus proche d'au moins DUEL_MARGIN. */
  function possessionSeries(nf) {
    const raw = [];
    let lastBall = null, lastBallT = -Infinity;
    nf.forEach((f) => {
      let ball = f.ball;
      if (ball) { lastBall = ball; lastBallT = f.t; }
      else if (lastBall && f.t - lastBallT <= BALL_HOLD) ball = lastBall;
      if (!ball) { raw.push({ team: null, ball: null, holder: null, fresh: false }); return; }
      const near = (list) => {
        let p = null, d = Infinity;
        list.forEach((q) => { const x = Math.hypot(q.x - ball.x, q.y - ball.y); if (x < d) { d = x; p = q; } });
        return { p, d };
      };
      const nA = near(f.A), nB = near(f.B);
      const best = nA.d <= nB.d ? { team: "A", n: nA } : { team: "B", n: nB };
      raw.push(best.n.d < POSSESSION_RADIUS
        ? { team: best.team, ball, holder: best.n.p, fresh: !!f.ball, dA: nA.d, dB: nB.d }
        : { team: null, ball, holder: null, fresh: !!f.ball });
    });
    // confirmation : un changement doit durer MIN_POSSESSION_FRAMES images où le ballon est détecté
    const out = [];
    let cur = null, cand = null, count = 0;
    raw.forEach((r) => {
      // image sans ballon détecté : ne confirme rien ; possession reportée seulement si une position récente est gardée
      if (!r.fresh && cur) { out.push({ team: r.ball ? cur : null, ball: r.ball, holder: r.holder, raw: r.team }); return; }
      let team = r.team;
      if (team && cur && team !== cur) {
        const dCur = cur === "A" ? r.dA : r.dB, dNew = cur === "A" ? r.dB : r.dA;
        if (dCur < POSSESSION_RADIUS && dCur - dNew < DUEL_MARGIN) team = cur;   // duel non tranché
      }
      if (team && team !== cur) {
        if (cand === team) count += 1; else { cand = team; count = 1; }
        if (count >= MIN_POSSESSION_FRAMES || cur === null) { cur = team; cand = null; count = 0; }
      } else if (team === cur) { cand = null; count = 0; }
      out.push({ team: team ? cur : (cur && r.ball ? cur : null), ball: r.ball, holder: r.holder, raw: r.team });
    });
    return out;
  }

  /* Intervalles où la condition reste vraie au moins minDur secondes. */
  function sustained(nf, test, minDur) {
    const res = [];
    let start = -1;
    for (let i = 0; i <= nf.length; i++) {
      const ok = i < nf.length && test(i);
      if (ok && start < 0) start = i;
      if (!ok && start >= 0) {
        const end = i - 1;
        if (nf[end].t - nf[start].t >= minDur) res.push([start, end]);
        start = -1;
      }
    }
    return res;
  }

  // joueurs de champ ; un joueur qui entre ou sort par la zone de remplacement n'est pas compté (remplacement volant)
  function fieldOf(list) { return list.filter((p) => !p.gk && !p.sub); }

  /* Côté des bancs, en coordonnées terrain brutes (y = 0 ou y = W) : réglage « left » / « right » (en regardant le but que
     mon équipe attaque en première mi-temps), sinon déduit des remplaçants vus le long des lignes de touche
     (seen = { y0, yW }) s'ils sont assez nombreux et nettement d'un seul côté. Renvoie { y, side, source } ou null. */
  function benchSide(opts, t0) {
    const W = opts.W || 20, d0 = typeof opts.dirAt === "function" ? opts.dirAt(t0) : 1;
    const toRaw = (side) => ((side === "left") === (d0 >= 0) ? 0 : W);   // à gauche = petits y une fois normalisé
    if (opts.bench === "left" || opts.bench === "right") return { y: toRaw(opts.bench), side: opts.bench, source: "réglage" };
    const s = opts.benchSeen;
    if (!s) return null;
    const hi = Math.max(s.y0, s.yW), lo = Math.min(s.y0, s.yW);
    if (hi < BENCH_MIN_SEEN || hi < BENCH_RATIO * lo) return null;
    const y = s.yW > s.y0 ? W : 0;
    return { y, side: (y === 0) === (d0 >= 0) ? "left" : "right", source: "déduit" };
  }

  /* Remplacements volants : piste qui commence ou finit dans la zone de remplacement (près de la ligne de touche des bancs,
     à moins de SUB_ZONE m de la ligne médiane) -> écartée des erreurs de placement pendant SUB_WINDOW s. */
  function substitutions(frames, L, bench, span) {
    const subs = new Map();
    if (!bench || !frames.length) return subs;
    const first = new Map(), last = new Map();
    frames.forEach((f) => f.players.forEach((p) => { if (!first.has(p.id)) first.set(p.id, [f.t, p]); last.set(p.id, [f.t, p]); }));
    const inZone = (p) => Math.abs(p.y - bench.y) <= SUB_LINE && Math.abs(p.x - L / 2) <= SUB_ZONE;
    const add = (id, a, b) => { if (!subs.has(id)) subs.set(id, []); subs.get(id).push([a, b]); };
    first.forEach(([t, p], id) => { if (t > span[0] + 1 && inZone(p)) add(id, t, t + SUB_WINDOW); });
    last.forEach(([t, p], id) => { if (t < span[1] - 1 && inZone(p)) add(id, t - SUB_WINDOW, t); });
    return subs;
  }

  function detectEvents(nf, poss, L, W) {
    const events = [];
    const push = (e) => events.push(e);
    const lastAt = {};
    const accept = (type, t) => {
      if (lastAt[type] != null && t - lastAt[type] < COOLDOWN) return false;
      lastAt[type] = t; return true;
    };
    const mk = (type, i, extra) => {
      const f = nf[i];
      const ref = (poss[i].ball) || (f.A[0] || { x: L / 2, y: W / 2 });
      return Object.assign({ t: f.t, type, zone: zoneOf(ref.x, L), side: sideOf(ref.y, W), outcome: "AUCUN", auto: true }, extra);
    };

    // 1. Pertes de balle et transitions défensives
    for (let i = 1; i < nf.length; i++) {
      if (!(poss[i - 1].team === "A" && poss[i].team === "B")) continue;
      // une perte exige que l'adversaire garde le ballon au moins MIN_LOSS_DURATION (sinon duel gagné ou passe ratée reprise)
      let k = i;
      while (k + 1 < nf.length && poss[k + 1].team === "B") k++;
      if (nf[k].t - nf[i].t < MIN_LOSS_DURATION) continue;
      // …et que mon équipe ait vraiment eu le ballon avant (sinon c'est un duel, pas une perte de possession)
      let s = i - 1;
      while (s > 0 && poss[s - 1].team === "A") s--;
      const ownDur = nf[i - 1].t - nf[s].t;
      const unknownStart = s === 0;                              // possession commencée avant le début de l'analyse
      if (ownDur < MIN_LOSS_DURATION && !unknownStart) continue;
      const b0 = poss[i].ball || poss[i - 1].ball;
      if (!b0) continue;
      // rythme au moment de la perte : pressing adverse, attaque placée (possession longue) ou transition
      const h = poss[i - 1].holder;
      const pressers = h ? fieldOf(nf[i - 1].B).filter((p) => Math.hypot(p.x - h.x, p.y - h.y) < PRESS_DIST).length : 0;
      const phase = pressers >= 2 ? "pressing" : ownDur >= LONG_POSSESSION ? "attaque_placee" : "transition";
      const zone = zoneOf(b0.x, L);
      if (zone !== "ATT" && accept(zone === "DEF" ? "perte_zone_def" : "perte_zone_mediane", nf[i].t)) {
        const e = mk(zone === "DEF" ? "perte_zone_def" : "perte_zone_mediane", i, { outcome: "PERTE", phase, note: LOSS_NOTE[phase](pressers, ownDur) + " (détection automatique)", conf: 0.6 });
        if (ownDur < MIN_LOSS_DURATION) e.blocked = "possession précédente inconnue (début de l'analyse)";
        push(e);
      }
      // fenêtre d'observation de 4 s
      let j = i;
      while (j + 1 < nf.length && nf[j + 1].t - nf[i].t <= 4) j++;
      const mid = Math.min(j, i + Math.max(1, Math.round((j - i) / 2)));
      const bm = poss[mid].ball;
      if (!bm || poss[mid].team !== "B") continue;
      const fa = fieldOf(nf[mid].A), fb = fieldOf(nf[mid].B);
      const goalSide = fa.filter((p) => p.x <= bm.x + 1).length;
      const attackers = fb.filter((p) => p.x <= bm.x + 4 && p.x < 0.6 * L).length;
      let maxProgress = 0, minX = Infinity;
      for (let k = i; k <= j; k++) { if (poss[k].team === "B" && poss[k].ball) { maxProgress = Math.max(maxProgress, b0.x - poss[k].ball.x); minX = Math.min(minX, poss[k].ball.x); } }
      const dangerous = minX < 0.25 * L;
      if (maxProgress >= 0.2 * L && attackers >= goalSide + 1 && accept("contre_attaque_subie", nf[i].t)) {
        push(mk("contre_attaque_subie", mid, { outcome: dangerous ? "OCC_CONTRE" : "PERTE", note: attackers + " attaquants contre " + goalSide + " défenseur(s) côté but (détection automatique)", conf: 0.65 }));
      } else if (goalSide <= 1 && bm.x < 0.55 * L && maxProgress >= MIN_PROGRESS && accept("repli_tardif", nf[i].t)) {
        // un repli n'a de sens que si l'adversaire avance vraiment après la perte (transition en cours)
        push(mk("repli_tardif", mid, { outcome: dangerous ? "OCC_CONTRE" : "PERTE", phase: "transition", note: "Transition adverse après la perte (+" + Math.round(maxProgress) + " m) : seulement " + goalSide + " joueur(s) de champ entre le ballon et notre but, repli à accélérer (détection automatique)", conf: 0.6 }));
      }
    }

    // 2. Équipe étirée en défense
    sustained(nf, (i) => {
      if (poss[i].team !== "B") return false;
      const fa = fieldOf(nf[i].A);
      if (fa.length < 3) return false;
      const xs = fa.map((p) => p.x);
      return Math.max(...xs) - Math.min(...xs) > 0.5 * L;
    }, 2).forEach(([s, e]) => {
      if (!accept("equipe_etiree", nf[s].t)) return;
      const xs = fieldOf(nf[s].A).map((p) => p.x);
      push(mk("equipe_etiree", s, { note: "Profondeur de l'équipe : " + (Math.max(...xs) - Math.min(...xs)).toFixed(1) + " m pendant " + (nf[e].t - nf[s].t).toFixed(1) + " s", conf: 0.55 }));
    });

    // 3. Espace dans le dos du dernier défenseur
    sustained(nf, (i) => {
      if (poss[i].team !== "B" || !poss[i].ball || poss[i].ball.x > 0.7 * L) return false;
      const fa = fieldOf(nf[i].A);
      if (!fa.length) return false;
      const last = Math.min(...fa.map((p) => p.x));
      return fieldOf(nf[i].B).some((p) => p.x < last - 1.5 && p.x < 0.45 * L &&
        Math.min(...nf[i].A.map((a) => Math.hypot(a.x - p.x, a.y - p.y))) > 3);
    }, 1.2).forEach(([s]) => {
      if (accept("espace_dos_fixo", nf[s].t)) push(mk("espace_dos_fixo", s, { outcome: "OCC_CONTRE", note: "Un adversaire libre derrière notre dernier défenseur (détection automatique)", conf: 0.6 }));
    });

    // 4. Joueur adverse libre près de notre but
    sustained(nf, (i) => {
      const ball = poss[i].ball;
      if (!ball || poss[i].team !== "B") return false;
      return fieldOf(nf[i].B).some((p) => p.x < 0.3 * L && Math.abs(p.y - W / 2) < 0.4 * W &&
        Math.hypot(p.x - ball.x, p.y - ball.y) < 12 &&
        Math.min(...nf[i].A.map((a) => Math.hypot(a.x - p.x, a.y - p.y))) > 3.5);
    }, 1.5).forEach(([s]) => {
      if (accept("marquage_perdu", nf[s].t)) push(mk("marquage_perdu", s, { outcome: "OCC_CONTRE", note: "Adversaire seul à plus de 3,5 m du plus proche défenseur dans notre zone de tir (détection automatique)", conf: 0.6 }));
    });

    // 5. Largeur mal occupée en attaque placée
    sustained(nf, (i) => {
      if (poss[i].team !== "A" || !poss[i].ball || poss[i].ball.x < 0.5 * L) return false;
      const fa = fieldOf(nf[i].A);
      if (fa.length < 3) return false;
      const ys = fa.map((p) => p.y);
      return Math.max(...ys) - Math.min(...ys) < 0.4 * W;
    }, 3).forEach(([s]) => {
      if (accept("largeur_mal_occupee", nf[s].t)) push(mk("largeur_mal_occupee", s, { note: "Les joueurs de champ occupent moins de 40 % de la largeur (détection automatique)", conf: 0.5 }));
    });

    // 6. Attaque statique
    sustained(nf, (i) => {
      if (i === 0 || poss[i].team !== "A") return false;
      const dt = nf[i].t - nf[i - 1].t;
      if (dt <= 0 || dt > 1) return false;
      const prev = new Map(nf[i - 1].A.map((p) => [p.id, p]));
      const sp = fieldOf(nf[i].A).filter((p) => prev.has(p.id)).map((p) => Math.hypot(p.x - prev.get(p.id).x, p.y - prev.get(p.id).y) / dt);
      return sp.length >= 3 && sp.reduce((a, b) => a + b, 0) / sp.length < 0.5;
    }, 4).forEach(([s]) => {
      if (accept("attaque_statique", nf[s].t)) push(mk("attaque_statique", s, { note: "Les joueurs bougent très peu pendant la possession (détection automatique)", conf: 0.5 }));
    });

    // 7. Porteur isolé en zone offensive
    sustained(nf, (i) => {
      const h = poss[i].holder;
      if (poss[i].team !== "A" || !h || h.x < 0.6 * L) return false;
      return !fieldOf(nf[i].A).some((p) => p.id !== h.id && Math.hypot(p.x - h.x, p.y - h.y) < 6);
    }, 1.5).forEach(([s]) => {
      if (accept("pivot_isole", nf[s].t)) push(mk("pivot_isole", s, { outcome: "PERTE", note: "Porteur sans soutien à moins de 6 m en zone offensive (détection automatique)", conf: 0.55 }));
    });

    events.sort((a, b) => a.t - b.t);
    return events;
  }

  function stats(nf, poss, L, W) {
    const dt = nf.length > 1 ? (nf[nf.length - 1].t - nf[0].t) / (nf.length - 1) : 0.2;
    let a = 0, b = 0, held = 0;
    poss.forEach((p) => { if (p.team === "A") a++; else if (p.team === "B") b++; if (p.held && (p.team === "A" || p.team === "B")) held++; });
    const known = a + b;
    // distances et vitesses par joueur
    const players = {};
    const last = {};
    nf.forEach((f) => {
      f.A.concat(f.B).forEach((p) => {
        const team = f.A.includes(p) ? "A" : "B";
        const s = players[p.id] || (players[p.id] = { id: p.id, team, gk: p.gk, frames: 0, dist: 0, sx: 0, sy: 0 });
        s.frames += 1; s.sx += p.x; s.sy += p.y;
        const l = last[p.id];
        if (l && f.t - l.t > 0 && f.t - l.t < 1.5) {
          const d = Math.hypot(p.x - l.x, p.y - l.y);
          if (d / (f.t - l.t) <= MAX_STEP_SPEED) s.dist += d;
        }
        last[p.id] = { x: p.x, y: p.y, t: f.t };
      });
    });
    const minFrames = Math.max(5, nf.length * 0.1);
    const list = Object.values(players).filter((p) => p.frames >= minFrames).map((p) => ({
      id: p.id, team: p.team, gk: p.gk, distance: Math.round(p.dist), avgX: +(p.sx / p.frames).toFixed(1), avgY: +(p.sy / p.frames).toFixed(1), presence: +(p.frames / nf.length).toFixed(2)
    }));
    // carte de chaleur de mon équipe (joueurs de champ), 10 colonnes x 5 lignes
    const cols = 10, rows = 5, heat = Array.from({ length: rows }, () => new Array(cols).fill(0));
    let hn = 0;
    nf.forEach((f) => fieldOf(f.A).forEach((p) => {
      const c = Math.min(cols - 1, Math.max(0, Math.floor((p.x / L) * cols)));
      const r = Math.min(rows - 1, Math.max(0, Math.floor((p.y / W) * rows)));
      heat[r][c] += 1; hn += 1;
    }));
    const heatPct = heat.map((row) => row.map((v) => (hn ? +(v / hn).toFixed(4) : 0)));
    // forme moyenne de l'équipe
    let w = 0, d = 0, n = 0;
    nf.forEach((f) => {
      const fa = fieldOf(f.A);
      if (fa.length < 3) return;
      const xs = fa.map((p) => p.x), ys = fa.map((p) => p.y);
      d += Math.max(...xs) - Math.min(...xs); w += Math.max(...ys) - Math.min(...ys); n += 1;
    });
    return {
      duration: nf.length ? +(nf[nf.length - 1].t - nf[0].t).toFixed(1) : 0,
      sampleStep: +dt.toFixed(3),
      // deduced : part (%) de la possession connue qui vient d'un ballon tenu déduit (non vu), à signaler à l'utilisateur
      possession: { A: known ? Math.round((a / known) * 100) : null, B: known ? Math.round((b / known) * 100) : null, known: known > 0, deduced: known ? Math.round((held / known) * 100) : 0 },
      players: list, heat: heatPct,
      shape: n ? { width: +(w / n).toFixed(1), depth: +(d / n).toFixed(1) } : null
    };
  }

  /* L, W : dimensions du terrain ; dirAt(t) : +1 si mon équipe attaque vers x croissant à l'instant t, -1 sinon ;
     lost : passages où la caméra est perdue ; span : [t0, t1] plage analysée (pour la part du temps analysée). */
  function analyze(frames, opts) {
    opts = opts || {};
    const L = opts.L || 40, W = opts.W || 20;
    const sorted = (frames || []).filter((f) => f && isFinite(f.t)).slice().sort((a, b) => a.t - b.t);
    const span = opts.span || (sorted.length ? [sorted[0].t, sorted[sorted.length - 1].t] : [0, 0]);
    const bench = sorted.length ? benchSide(Object.assign({}, opts, { W }), sorted[0].t) : null;
    const nf = normalize(sorted, L, W, opts.dirAt, substitutions(sorted, L, bench, span));
    const poss = possessionSeries(nf);
    const ctx = C.analyzeContext(nf, { L, W, lost: opts.lost, span: opts.span });
    // toutes les erreurs reposent sur la possession, donc sur le ballon : sans ballon fiable, ou hors du jeu en cours
    // (arrêt de jeu probable, ballon non visible), pas d'erreur suggérée
    const events = [], uncertain = [];
    detectEvents(nf, poss, L, W).forEach((e) => {
      e.ballConf = ballConfidence(nf, e.t);
      const blocked = e.blocked || contextAt(nf, ctx.states, e.t);
      delete e.blocked;
      if (blocked) uncertain.push({ t: e.t, type: e.type, ballConf: e.ballConf, reason: blocked });
      else if (e.ballConf >= BALL_CONF_MIN) events.push(e);
      else uncertain.push({ t: e.t, type: e.type, ballConf: e.ballConf, reason: "ballon pas assez visible" });
    });
    // possession affichée : un ballon tenu (déduit, confiance suffisante) compte pour l'équipe du joueur qui le tient ;
    // cette déduction ne sert jamais à déclarer une perte (les erreurs ci-dessus reposent sur le ballon vu)
    const shown = poss.map((r, i) => {
      const h = ctx.states[i] && ctx.states[i].held;
      return !r.team && h && h.conf >= C.CONF_MIN ? Object.assign({}, r, { team: h.team, held: h }) : r;
    });
    return { events, uncertain, possession: shown, context: { passages: ctx.passages, reliable: ctx.reliable, bench: bench ? { side: bench.side, source: bench.source } : null }, stats: stats(nf, shown, L, W), normalized: nf };
  }

  /* Raison de ne pas suggérer une erreur à l'instant t : arrêt de jeu ou ballon non visible dans la seconde qui précède. */
  function contextAt(nf, states, t) {
    for (let i = 0; i < nf.length; i++) {
      if (nf[i].t < t - CONF_CTX - 1e-6 || nf[i].t > t + 1e-6) continue;
      if (states[i].play === "arret") return states[i].why;
      if (states[i].play === "incertain") return "ballon non visible";
    }
    return null;
  }

  /* Part des images où le ballon est réellement détecté juste avant et pendant l'instant t (0 à 1, arrondi à 0,01). */
  function ballConfidence(nf, t) {
    const win = nf.filter((f) => f.t >= t - CONF_BEFORE - 1e-6 && f.t <= t + CONF_AFTER + 1e-6);
    return win.length ? Math.round((win.filter((f) => f.ball).length / win.length) * 100) / 100 : 0;
  }

  return { analyze, normalize, possessionSeries, ballConfidence, benchSide, zoneOf, sideOf, POSSESSION_RADIUS, BALL_CONF_MIN };
});
