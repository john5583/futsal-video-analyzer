/* Suivi des joueurs : associe les détections d'une image à la suivante (coordonnées terrain en mètres). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FutsalTracker = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MAX_SPEED = 9;       // m/s, plafond réaliste d'un joueur de futsal
  const MAX_MISSED = 3;      // secondes sans détection avant d'abandonner une piste

  /* opts.soft (mètres, 0 par défaut) : tenues trop proches, l'équipe lue sur une image n'est pas fiable.
     Une piste peut alors recevoir une détection d'une autre équipe moyennant ce surcoût (au lieu d'être coupée),
     et son équipe est un vote où les images récentes pèsent davantage. */
  function Tracker(opts) {
    this.opts = Object.assign({ maxSpeed: MAX_SPEED, maxMissed: MAX_MISSED, soft: 0 }, opts || {});
    this.tracks = [];
    this.nextId = 1;
  }

  function compatible(a, b) {
    return a === "UNK" || b === "UNK" || a === b;
  }

  /* dets : [{x, y, team, box, conf}] ; renvoie les mêmes objets avec .id. */
  Tracker.prototype.update = function (t, dets) {
    const live = this.tracks.filter((tr) => t - tr.lastT <= this.opts.maxMissed);
    const soft = this.opts.soft > 0 ? this.opts.soft : 0;
    const pairs = [];
    live.forEach((tr, ti) => {
      const dt = Math.max(0.05, t - tr.lastT);
      const px = tr.x + tr.vx * dt * 0.5, py = tr.y + tr.vy * dt * 0.5;
      const gate = this.opts.maxSpeed * dt + 1;
      dets.forEach((d, di) => {
        const ok = compatible(tr.team, d.team);
        if (!ok && !soft) return;
        const dd = Math.hypot(d.x - px, d.y - py);
        if (dd > gate) return;
        pairs.push({ ti, di, cost: dd + (ok ? (tr.team !== d.team ? 1.5 : 0) : soft) });
      });
    });
    pairs.sort((a, b) => a.cost - b.cost);
    const usedT = new Set(), usedD = new Set();
    pairs.forEach((p) => {
      if (usedT.has(p.ti) || usedD.has(p.di)) return;
      usedT.add(p.ti); usedD.add(p.di);
      const tr = live[p.ti], d = dets[p.di];
      const dt = Math.max(0.05, t - tr.lastT);
      tr.vx = (d.x - tr.x) / dt * 0.6 + tr.vx * 0.4;
      tr.vy = (d.y - tr.y) / dt * 0.6 + tr.vy * 0.4;
      tr.x = d.x; tr.y = d.y; tr.lastT = t; tr.n += 1;
      if (d.team !== "UNK") {
        if (soft) Object.keys(tr.votes).forEach((k) => { tr.votes[k] *= 0.9; });
        tr.votes[d.team] = (tr.votes[d.team] || 0) + 1;
      }
      tr.team = bestVote(tr.votes, tr.team);
      d.id = tr.id;
    });
    dets.forEach((d, di) => {
      if (usedD.has(di)) return;
      const tr = { id: this.nextId++, team: d.team, x: d.x, y: d.y, vx: 0, vy: 0, lastT: t, n: 1, votes: {} };
      if (d.team !== "UNK") tr.votes[d.team] = 1;
      this.tracks.push(tr);
      d.id = tr.id;
    });
    this.tracks = this.tracks.filter((tr) => t - tr.lastT <= this.opts.maxMissed || tr.n >= 3);
    return dets;
  };

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

  return { Tracker, finalTeams, MAX_SPEED };
});
