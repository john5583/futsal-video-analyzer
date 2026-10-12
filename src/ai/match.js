/* Analyse tactique automatique à partir des trajectoires (coordonnées terrain en mètres).
   Entrée : frames = [{ t, players: [{ id, team: "A"|"B"|"GKA"|"GKB", x, y }], ball: {x, y} | null }]
   A = mon équipe. Le moteur remet toujours le terrain « de mon équipe qui attaque vers x croissant ».
   Sortie : événements suggérés (à valider par le coach) et statistiques de match. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FutsalMatch = factory();
})(typeof self !== "undefined" ? self : this, function () {
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
  function normalize(frames, L, W, dirAt) {
    return frames.map((f) => {
      const flip = (typeof dirAt === "function" ? dirAt(f.t) : 1) < 0;
      const tf = (o) => (flip ? { x: L - o.x, y: W - o.y } : { x: o.x, y: o.y });
      const A = [], B = [];
      f.players.forEach((p) => {
        if (!PLAYING[p.team]) return;
        const q = Object.assign({ id: p.id, gk: isGK(p) }, tf(p));
        (side(p) === "A" ? A : B).push(q);
      });
      return { t: f.t, A, B, ball: f.ball ? tf(f.ball) : null };
    });
  }

  function zoneOf(x, L) { return x < L / 3 ? "DEF" : x < (2 * L) / 3 ? "MED" : "ATT"; }
  function sideOf(y, W) { return y < W / 3 ? "G" : y > (2 * W) / 3 ? "D" : "C"; }

  /* Possession image par image : "A", "B" ou null (ballon libre ou inconnu). */
  function possessionSeries(nf) {
    const raw = [];
    let lastBall = null, lastBallT = -Infinity;
    nf.forEach((f) => {
      let ball = f.ball;
      if (ball) { lastBall = ball; lastBallT = f.t; }
      else if (lastBall && f.t - lastBallT <= BALL_HOLD) ball = lastBall;
      let best = null, bd = POSSESSION_RADIUS;
      if (ball) {
        f.A.concat(f.B).forEach((p) => {
          const d = Math.hypot(p.x - ball.x, p.y - ball.y);
          if (d < bd) { bd = d; best = p; }
        });
      }
      raw.push(best ? { team: f.A.includes(best) ? "A" : "B", ball, holder: best } : { team: null, ball, holder: null });
    });
    // confirmation : un changement doit durer MIN_POSSESSION_FRAMES images
    const out = [];
    let cur = null, cand = null, count = 0;
    raw.forEach((r) => {
      if (r.team && r.team !== cur) {
        if (cand === r.team) count += 1; else { cand = r.team; count = 1; }
        if (count >= MIN_POSSESSION_FRAMES || cur === null) { cur = r.team; cand = null; count = 0; }
      } else if (r.team === cur) { cand = null; count = 0; }
      out.push({ team: r.team ? cur : (cur && r.ball ? cur : null), ball: r.ball, holder: r.holder, raw: r.team });
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

  function fieldOf(list) { return list.filter((p) => !p.gk); }

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
      const b0 = poss[i].ball || poss[i - 1].ball;
      if (!b0) continue;
      const zone = zoneOf(b0.x, L);
      if (zone !== "ATT" && accept(zone === "DEF" ? "perte_zone_def" : "perte_zone_mediane", nf[i].t)) {
        push(mk(zone === "DEF" ? "perte_zone_def" : "perte_zone_mediane", i, { outcome: "PERTE", note: "Possession perdue (détection automatique)", conf: 0.6 }));
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
      } else if (goalSide <= 1 && bm.x < 0.55 * L && accept("repli_tardif", nf[i].t)) {
        push(mk("repli_tardif", mid, { outcome: dangerous ? "OCC_CONTRE" : "PERTE", note: "Seulement " + goalSide + " joueur(s) de champ entre le ballon et notre but (détection automatique)", conf: 0.6 }));
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
    let a = 0, b = 0;
    poss.forEach((p) => { if (p.team === "A") a++; else if (p.team === "B") b++; });
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
      possession: { A: known ? Math.round((a / known) * 100) : null, B: known ? Math.round((b / known) * 100) : null, known: known > 0 },
      players: list, heat: heatPct,
      shape: n ? { width: +(w / n).toFixed(1), depth: +(d / n).toFixed(1) } : null
    };
  }

  /* L, W : dimensions du terrain ; dirAt(t) : +1 si mon équipe attaque vers x croissant à l'instant t, -1 sinon. */
  function analyze(frames, opts) {
    opts = opts || {};
    const L = opts.L || 40, W = opts.W || 20;
    const sorted = (frames || []).filter((f) => f && isFinite(f.t)).slice().sort((a, b) => a.t - b.t);
    const nf = normalize(sorted, L, W, opts.dirAt);
    const poss = possessionSeries(nf);
    return { events: detectEvents(nf, poss, L, W), stats: stats(nf, poss, L, W), normalized: nf };
  }

  return { analyze, normalize, possessionSeries, zoneOf, sideOf, POSSESSION_RADIUS };
});
