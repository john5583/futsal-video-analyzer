/* Suivi des joueurs : associe les détections d'une image à la suivante (coordonnées terrain en mètres). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./signature"));
  else root.FutsalTracker = factory(root.FutsalSignature);
})(typeof self !== "undefined" ? self : this, function (S) {
  "use strict";

  const MAX_SPEED = 9;       // m/s, plafond réaliste d'un joueur de futsal
  const MAX_MISSED = 3;      // secondes sans détection avant d'abandonner une piste

  /* opts.soft (mètres, 0 par défaut) : tenues trop proches, l'équipe lue sur une image n'est pas fiable.
     Une piste peut alors recevoir une détection d'une autre équipe moyennant ce surcoût (au lieu d'être coupée),
     et son équipe est un vote où les images récentes pèsent davantage.
     opts.appearance (faux par défaut) : tenues proches, les détections portent une signature d'apparence (d.sig, voir signature.js) ;
     un petit surcoût borné écarte une piste d'une personne qui ne lui ressemble pas. Sans signature fiable : aucun effet. */
  function Tracker(opts) {
    this.opts = Object.assign({ maxSpeed: MAX_SPEED, maxMissed: MAX_MISSED, soft: 0, appearance: false, sig0: SIG0, sigv: SIGV, chi: CHI, sa: KF_SA, sm: KF_SM, v0: KF_V0, decay: KF_DECAY, kfChi: KF_CHI }, opts || {});
    this.tracks = [];
    this.nextId = 1;
  }

  function compatible(a, b) {
    return a === "UNK" || b === "UNK" || a === b;
  }

  /* Affectation globale à coût minimal (algorithme hongrois) : chaque piste reçoit au plus une détection et chaque détection au plus
     une piste, de façon à ce que la somme des coûts soit la plus petite possible (et non « la paire la plus proche d'abord », qui
     échange deux joueurs qui se croisent). cost[i][j] = coût de la paire (piste i, détection j), Infinity = interdit.
     cMiss : coût de laisser une piste sans détection (un nombre, ou un coût par piste) ; cNew : coût de créer une piste pour une détection sans piste.
     Renvoie [{ ti, di }] des paires retenues. */
  const BIG = 1e6;
  function assign(cost, nT, nD, cMiss, cNew) {
    const n = nT + nD;
    if (!n) return [];
    const a = [];
    for (let i = 0; i < n; i++) {
      a.push(new Array(n));
      for (let j = 0; j < n; j++) {
        if (i < nT && j < nD) a[i][j] = isFinite(cost[i][j]) ? cost[i][j] : BIG;
        else if (i < nT) a[i][j] = j - nD === i ? (Array.isArray(cMiss) ? cMiss[i] : cMiss) : BIG;
        else if (j < nD) a[i][j] = i - nT === j ? cNew : BIG;
        else a[i][j] = 0;
      }
    }
    // algorithme hongrois, potentiels (indices à partir de 1)
    const u = new Array(n + 1).fill(0), v = new Array(n + 1).fill(0), p = new Array(n + 1).fill(0), way = new Array(n + 1).fill(0);
    for (let i = 1; i <= n; i++) {
      p[0] = i;
      let j0 = 0;
      const minv = new Array(n + 1).fill(Infinity), used = new Array(n + 1).fill(false);
      do {
        used[j0] = true;
        const i0 = p[j0];
        let delta = Infinity, j1 = 0;
        for (let j = 1; j <= n; j++) {
          if (used[j]) continue;
          const cur = a[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
        for (let j = 0; j <= n; j++) {
          if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
        }
        j0 = j1;
      } while (p[j0] !== 0);
      do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
    }
    const out = [];
    for (let j = 1; j <= nD; j++) {
      const i = p[j] - 1;
      if (i >= 0 && i < nT && isFinite(cost[i][j - 1])) out.push({ ti: i, di: j - 1 });
    }
    return out;
  }

  const TAU = 1.0;            // s : la vitesse d'un joueur « s'éteint » en s'éloignant de la dernière détection (il peut changer de direction)
  const ALPHA = 0.75, BETA = 0.4, BETA_NEW = 0.7;   // filtre position-vitesse : poids de l'écart entre la détection et la position prévue
  /* Coût d'une paire = vraisemblance : (écart / incertitude)² / 2 + log(incertitude). L'incertitude de la position prévue grandit avec le temps
     écoulé depuis la dernière détection (SIG0 m de bruit + SIGV m/s de vitesse mal connue) : une piste ancienne accepte un écart plus grand,
     mais il compte moins qu'un écart d'une piste récente. */
  const SIG0 = 0.7, SIGV = 1.5;
  const CHI = 4.5;            // coût de laisser une piste sans détection et de créer une piste (écart de ~4 incertitudes : au-delà, on ne relie pas)
  const sigmaOf = (dt, o) => o.sig0 + o.sigv * dt;

  /* Position prévue d'une piste à l'instant t (la vitesse est amortie sur TAU secondes). */
  function predict(tr, t) {
    const dt = Math.max(0.05, t - tr.lastT), k = TAU * (1 - Math.exp(-dt / TAU));
    return { x: tr.x + tr.vx * k, y: tr.y + tr.vy * k, dt };
  }

  /* dets : [{x, y, team, box, conf}] ; renvoie les mêmes objets avec .id.
     opts.method : "greedy" (par défaut : « la paire la plus proche d'abord », comportement historique) ou "optimal" (prévision du mouvement,
     coût de vraisemblance, affectation globale ; activé par l'analyse quand les tenues sont proches). Essayé et écarté : refuser les paires ambiguës (sur matchs fabriqués, ça multiplie
     par 3 les pistes en trop sans réduire les échanges de joueurs). */
  Tracker.prototype.update = function (t, dets) {
    if (this.opts.method === "kalman") return updateKalman(this, t, dets);
    const live = this.tracks.filter((tr) => t - tr.lastT <= this.opts.maxMissed);
    const soft = this.opts.soft > 0 ? this.opts.soft : 0;
    const greedy = this.opts.method !== "optimal", o = this.opts;
    const cost = live.map(() => new Array(dets.length).fill(Infinity));
    const pairs = [];
    live.forEach((tr, ti) => {
      const pr = predict(tr, t), dt = pr.dt;
      const px = greedy ? tr.x + tr.vx * dt * 0.5 : pr.x, py = greedy ? tr.y + tr.vy * dt * 0.5 : pr.y;
      const gate = o.maxSpeed * dt + 1, sg = sigmaOf(dt, o);
      dets.forEach((d, di) => {
        const ok = compatible(tr.team, d.team);
        if (!ok && !soft) return;
        const dd = Math.hypot(d.x - px, d.y - py);
        if (dd > gate) return;
        const look = o.appearance ? S.penalty(tr.sig, d.sig) : 0;
        const pen = (ok ? (tr.team !== d.team ? 1.5 : 0) : soft) + look;                  // surcoûts en mètres (équipe, apparence)
        const c = greedy ? dd + pen : 0.5 * (dd / sg) * (dd / sg) + Math.log(sg / o.sig0) + pen / o.sig0;
        cost[ti][di] = c;
        pairs.push({ ti, di, cost: c });
      });
    });
    let matches;
    if (greedy) {
      pairs.sort((a, b) => a.cost - b.cost);
      const uT = new Set(), uD = new Set();
      matches = [];
      pairs.forEach((p) => { if (uT.has(p.ti) || uD.has(p.di)) return; uT.add(p.ti); uD.add(p.di); matches.push(p); });
    } else {
      matches = assign(cost, live.length, dets.length, o.chi, o.chi);
    }
    const usedD = new Set();
    matches.forEach((p) => {
      usedD.add(p.di);
      const tr = live[p.ti], d = dets[p.di];
      const dt = Math.max(0.05, t - tr.lastT);
      if (greedy) {
        tr.vx = (d.x - tr.x) / dt * 0.6 + tr.vx * 0.4;
        tr.vy = (d.y - tr.y) / dt * 0.6 + tr.vy * 0.4;
        tr.x = d.x; tr.y = d.y;
      } else {
        const pr = predict(tr, t), rx = d.x - pr.x, ry = d.y - pr.y, b = tr.n < 3 ? BETA_NEW : BETA;
        tr.x = pr.x + ALPHA * rx; tr.y = pr.y + ALPHA * ry;
        tr.vx += (b * rx) / dt; tr.vy += (b * ry) / dt;
      }
      tr.lastT = t; tr.n += 1;
      if (d.team !== "UNK") {
        if (soft) Object.keys(tr.votes).forEach((k) => { tr.votes[k] *= 0.9; });
        tr.votes[d.team] = (tr.votes[d.team] || 0) + 1;
      }
      tr.team = bestVote(tr.votes, tr.team);
      if (this.opts.appearance) tr.sig = S.blend(tr.sig, d.sig);
      d.id = tr.id;
    });
    dets.forEach((d, di) => {
      if (usedD.has(di)) return;
      const tr = { id: this.nextId++, team: d.team, x: d.x, y: d.y, vx: 0, vy: 0, lastT: t, n: 1, votes: {} };
      if (d.team !== "UNK") tr.votes[d.team] = 1;
      if (this.opts.appearance) tr.sig = S.blend(null, d.sig);
      this.tracks.push(tr);
      d.id = tr.id;
    });
    this.tracks = this.tracks.filter((tr) => t - tr.lastT <= this.opts.maxMissed || tr.n >= 3);
    return dets;
  };

  /* ---- Suivi à filtre de Kalman (analyse continue) ----
     Chaque piste garde, pour x et pour y, une position, une vitesse et leur incertitude. La prévision tient compte du temps réellement écoulé (dt) :
     le même réglage vaut à 3 images/s comme à 30 images/s (le suivi « position-vitesse » historique, réglé pour 3 images/s, se trompe quand les
     images arrivent vite : le bruit de position est alors divisé par un très petit dt). Association globale (hongroise) sur la vraisemblance. */
  const KF_SA = 3.0;          // m/s² : accélération aléatoire d'un joueur (écart-type)
  const KF_SM = 0.5;          // m : bruit de position d'une détection (pieds projetés sur le terrain)
  const KF_V0 = 3.0;          // m/s : incertitude sur la vitesse d'une piste qui naît
  const KF_DECAY = 3.0;       // s : la vitesse s'éteint doucement quand la piste n'est plus vue
  const KF_CHI = 5.0;         // coût de laisser une piste sans détection / de créer une piste
  function kfPredict(a, dt, o) {
    const q = o.sa * o.sa, f = Math.exp(-dt / o.decay);
    return {
      p: a.p + a.v * dt, v: a.v * f,
      P00: a.P00 + 2 * dt * a.P01 + dt * dt * a.P11 + (q * Math.pow(dt, 4)) / 4,
      P01: a.P01 + dt * a.P11 + (q * Math.pow(dt, 3)) / 2,
      P11: a.P11 + q * dt * dt
    };
  }
  function kfUpdate(a, z, S) {
    const k0 = a.P00 / S, k1 = a.P01 / S, y = z - a.p;
    return { p: a.p + k0 * y, v: a.v + k1 * y, P00: (1 - k0) * a.P00, P01: (1 - k0) * a.P01, P11: a.P11 - k1 * a.P01 };
  }
  function updateKalman(self, t, dets) {
    const o = self.opts, soft = o.soft > 0 ? o.soft : 0, R = o.sm * o.sm;
    const live = self.tracks.filter((tr) => t - tr.lastT <= o.maxMissed);
    const pred = live.map((tr) => { const dt = Math.max(0.01, t - tr.lastT); return { x: kfPredict(tr.kx, dt, o), y: kfPredict(tr.ky, dt, o), dt }; });
    const cost = live.map(() => new Array(dets.length).fill(Infinity));
    live.forEach((tr, i) => {
      const pr = pred[i], Sv = pr.x.P00 + R;
      dets.forEach((d, j) => {
        const ok = compatible(tr.team, d.team);
        if (!ok && !soft) return;
        const dx = d.x - pr.x.p, dy = d.y - pr.y.p;
        if (Math.hypot(dx, dy) > o.maxSpeed * pr.dt + 1.5) return;
        const look = o.appearance ? S.penalty(tr.sig, d.sig) : 0;
        const pen = ((ok ? (tr.team !== d.team ? 1.5 : 0) : soft) + look) / 0.7;                // surcoûts en mètres (équipe, apparence)
        cost[i][j] = 0.5 * ((dx * dx + dy * dy) / Sv) + 0.5 * Math.log(Sv / R) + pen;
      });
    });
    const used = new Set();
    assign(cost, live.length, dets.length, o.kfChi, o.kfChi).forEach(({ ti, di }) => {
      used.add(di);
      const tr = live[ti], d = dets[di], pr = pred[ti], Sv = pr.x.P00 + R;
      tr.kx = kfUpdate(pr.x, d.x, Sv); tr.ky = kfUpdate(pr.y, d.y, Sv);
      tr.lastT = t; tr.n += 1;
      if (d.team !== "UNK") {
        if (soft) Object.keys(tr.votes).forEach((k) => { tr.votes[k] *= 0.9; });
        tr.votes[d.team] = (tr.votes[d.team] || 0) + 1;
      }
      tr.team = bestVote(tr.votes, tr.team);
      if (o.appearance) tr.sig = S.blend(tr.sig, d.sig);
      d.id = tr.id;
    });
    dets.forEach((d, j) => {
      if (used.has(j)) return;
      const ax = (p) => ({ p, v: 0, P00: R, P01: 0, P11: o.v0 * o.v0 });
      const tr = { id: self.nextId++, team: d.team, kx: ax(d.x), ky: ax(d.y), lastT: t, n: 1, votes: {} };
      if (d.team !== "UNK") tr.votes[d.team] = 1;
      if (o.appearance) tr.sig = S.blend(null, d.sig);
      self.tracks.push(tr);
      d.id = tr.id;
    });
    self.tracks = self.tracks.filter((tr) => t - tr.lastT <= o.maxMissed || tr.n >= 3);
    return dets;
  }

  function bestVote(votes, fallback) {
    let best = fallback, bv = 0;
    Object.keys(votes).forEach((k) => { if (votes[k] > bv) { bv = votes[k]; best = k; } });
    return best;
  }

  /* Équipe finale d'une piste = vote majoritaire sur toute sa durée. */
  function finalTeams(frames) {
    const votes = {};
    frames.forEach((f) => f.players.forEach((p) => {
      if (p.team === "UNK") return;
      (votes[p.id] = votes[p.id] || {})[p.team] = (votes[p.id][p.team] || 0) + 1;
    }));
    const teams = {};
    Object.keys(votes).forEach((id) => { teams[id] = bestVote(votes[id], "UNK"); });
    return teams;
  }

  /* Coupe une piste quand le suivi est passé d'une personne à une autre : MIN_RUN détections de suite (au moins) dont
     l'équipe lue sur l'image contredit celle du morceau en cours (gardiens comptés avec leur équipe, arbitre et inconnus
     ignorés). Le morceau suivant reçoit un nouvel identifiant ; chaque morceau est ensuite voté séparément.
     Modifie les identifiants des joueurs de frames (images triées par temps). Renvoie le nombre de coupures. */
  const MIN_RUN = 3;
  // gardien reconnu sur l'image : son camp ; sinon l'équipe de champ la plus proche (f, tenues proches) ou l'équipe lue
  const sideOf = (p) => (p.team === "GKA" ? "GA" : p.team === "GKB" ? "GB" : p.f === "A" || p.f === "B" ? p.f : p.team === "A" || p.team === "B" ? p.team : null);
  function splitTracks(frames, minRun, firstFreeId) {
    const run = minRun || MIN_RUN;
    const byId = new Map();
    let maxId = (firstFreeId || 1) - 1;
    frames.forEach((f) => f.players.forEach((p) => { maxId = Math.max(maxId, p.id); if (!byId.has(p.id)) byId.set(p.id, []); byId.get(p.id).push(p); }));
    let cuts = 0;
    byId.forEach((list) => {
      let votes = {}, pending = [], id = list[0].id;
      list.forEach((p) => {
        const s = sideOf(p);
        let cur = null, best = 0;
        Object.keys(votes).forEach((k) => { if (votes[k] > best) { best = votes[k]; cur = k; } else if (votes[k] === best) cur = null; });
        if (s && cur && s !== cur) pending.push(p);
        else if (s && s === cur) { pending.forEach((q) => { q.id = id; }); pending = []; votes[s] = (votes[s] || 0) + 1; }
        if (pending.length >= run) {
          id = ++maxId; cuts++;
          pending.forEach((q) => { q.id = id; });
          votes = {}; votes[s] = pending.length; pending = [];
          return;
        }
        if (!pending.includes(p)) { p.id = id; if (s && !cur) votes[s] = (votes[s] || 0) + 1; }
      });
      pending.forEach((q) => { q.id = id; });
    });
    return cuts;
  }

  /* Recolle les morceaux de piste d'une même personne : un morceau qui commence peu après la fin d'un autre (au plus
     LINK_GAP s), de la même équipe, à une distance qu'un joueur peut parcourir (LINK_SPEED), sans chevauchement dans le
     temps (chaque fin et chaque début ne servent qu'une fois). Les liaisons les plus proches d'abord.
     teams : { id: équipe } ; linkable(équipe) : pistes concernées.
     Renvoie le nombre de liaisons. */
  const LINK_GAP = 1.0;
  const LINK_SPEED = 6;      // m/s : vitesse plausible pendant une courte disparition
  function relinkTracks(frames, teams, linkable) {
    const span = new Map();
    frames.forEach((f) => f.players.forEach((p) => {
      const s = span.get(p.id);
      if (!s) span.set(p.id, { first: { t: f.t, x: p.x, y: p.y }, last: { t: f.t, x: p.x, y: p.y } });
      else s.last = { t: f.t, x: p.x, y: p.y };
    }));
    const ids = [...span.keys()].filter((id) => linkable(teams[id]));
    const cand = [];
    ids.forEach((a) => ids.forEach((b) => {
      if (a === b || teams[a] !== teams[b]) return;
      const e = span.get(a).last, s = span.get(b).first, dt = s.t - e.t;
      if (dt <= 0 || dt > LINK_GAP) return;
      const d = Math.hypot(s.x - e.x, s.y - e.y);
      if (d > LINK_SPEED * dt + 0.5) return;
      cand.push({ a, b, cost: d + dt });
    }));
    cand.sort((x, y) => x.cost - y.cost);
    const root = new Map(), usedEnd = new Set(), usedStart = new Set();
    const find = (id) => { while (root.has(id)) id = root.get(id); return id; };
    let n = 0;
    cand.forEach(({ a, b }) => {
      if (usedEnd.has(a) || usedStart.has(b)) return;
      const ra = find(a), rb = find(b);
      if (ra === rb) return;
      usedEnd.add(a); usedStart.add(b);
      root.set(rb, ra);
      n++;
    });
    if (n) frames.forEach((f) => f.players.forEach((p) => { if (root.has(p.id)) p.id = find(p.id); }));
    return n;
  }

  return { Tracker, assign, finalTeams, splitTracks, relinkTracks, MAX_SPEED };
});
