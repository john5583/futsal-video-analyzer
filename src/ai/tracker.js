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
    this.opts = Object.assign({ maxSpeed: MAX_SPEED, maxMissed: MAX_MISSED, soft: 0, appearance: false }, opts || {});
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
        const look = this.opts.appearance ? S.penalty(tr.sig, d.sig) : 0;
        pairs.push({ ti, di, cost: dd + (ok ? (tr.team !== d.team ? 1.5 : 0) : soft) + look });
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

  return { Tracker, finalTeams, splitTracks, relinkTracks, MAX_SPEED };
});
