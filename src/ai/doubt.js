/* Doute -> question -> mémoire du projet. Le programme ne tranche jamais un cas incertain : il le range dans une liste de
   questions, le coach répond (ou non), et la réponse est retenue dans le projet pour ne pas être redemandée. Une question
   sans réponse reste « non analysée » : rien n'est deviné.
   Deux sortes de doutes :
   - « team » : une piste dont l'équipe lue sur les images est partagée, ou jamais identifiée ;
   - « event » : une erreur possible que le contexte (ballon non visible, arrêt de jeu…) n'a pas permis de confirmer.
   Mémoire (dans le projet) : { goalPalettes, rejected: [{ type, t }], answers: [{ kind, … }] }. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FutsalDoubt = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MIN_DETECTIONS = 12;   // détections minimales d'une piste pour la questionner
  const MIN_VOTES = 6;         // lectures d'équipe minimales pour parler de partage
  const SHARE_OK = 0.7;        // part de lectures en accord avec l'équipe retenue en dessous de laquelle on demande
  const MIN_UNKNOWN = 25;      // détections d'une piste jamais identifiée pour demander qui c'est
  const T_TOL = 0.6;           // s : une réponse s'applique à la personne vue à cet instant (±)
  const D_TOL = 3;             // m : …à cette distance au plus
  const REJ_TOL = 2;           // s : une erreur écartée ne revient pas dans cette fenêtre
  const OK = { A: 1, B: 1, GKA: 1, GKB: 1 };
  const SIDE = { A: "A", GKA: "A", B: "B", GKB: "B" };   // côté d'une lecture : un gardien compte pour son équipe
  const TEAM_LABEL = {
    A: "de votre équipe", B: "de l'équipe adverse", GKA: "le gardien de votre équipe", GKB: "le gardien adverse",
    NONE: "ni joueur ni gardien (arbitre, public, remplaçant)"
  };

  /* Pistes douteuses. frames : images finales de pipeline (players: { id, team (lecture brute), x, y, b }) ; teams : équipe retenue
     par piste. Renvoie [{ kind:"team", id, t, x, y, b, n, cur, votes, why }], les plus longues d'abord. */
  function trackDoubts(frames, teams) {
    const info = new Map();
    frames.forEach((f) => f.players.forEach((p) => {
      let i = info.get(p.id);
      if (!i) { i = { n: 0, votes: {}, pts: [] }; info.set(p.id, i); }
      i.n++;
      // lecture la plus fine d'abord (équipe de champ la plus proche, `f`), comme pour la coupure des pistes ; sinon l'équipe lue
      const read = p.f === "A" || p.f === "B" ? p.f : p.team;
      if (SIDE[read]) i.votes[SIDE[read]] = (i.votes[SIDE[read]] || 0) + 1;
      if (Array.isArray(p.b) && p.b.length === 4) i.pts.push({ t: f.t, x: p.x, y: p.y, b: p.b });
    }));
    const out = [];
    info.forEach((i, id) => {
      if (i.n < MIN_DETECTIONS || !i.pts.length) return;
      const cur = teams[id] || "UNK";
      if (cur === "REF") return;                                  // écarté par la position (immobile, arbitre) : décision mesurée
      const sum = Object.keys(i.votes).reduce((s, k) => s + i.votes[k], 0);
      let why = null;
      if (cur === "A" || cur === "B") {
        // joueur de champ : l'équipe retenue doit être celle que les images lisent le plus souvent, nettement
        const top = Math.max(i.votes.A || 0, i.votes.B || 0), share = sum ? top / sum : 0, mine = sum ? (i.votes[cur] || 0) / sum : 0;
        if (sum >= MIN_VOTES && share < SHARE_OK) why = "équipe lue " + Math.round(mine * 100) + " % du temps seulement";
        else if (sum >= MIN_VOTES && mine < 0.5) why = "l'équipe retenue contredit les images (" + Math.round(mine * 100) + " % du temps)";
      } else if (!OK[cur] && i.n >= MIN_UNKNOWN) why = "jamais identifié";   // gardien : rôle décidé par la position, pas questionné
      if (!why) return;
      const q = i.pts[i.pts.length >> 1];
      out.push({ kind: "team", id, t: q.t, x: q.x, y: q.y, b: q.b, n: i.n, cur: OK[cur] ? cur : null, votes: Object.assign({}, i.votes), why });
    });
    return out.sort((a, b) => b.n - a.n);
  }

  const sameSpot = (a, b) => Math.abs(a.t - b.t) <= T_TOL && Math.hypot(a.x - b.x, a.y - b.y) <= D_TOL;

  /* Applique les réponses « team » aux images (modifie frames) : la personne vue à cet instant, à cet endroit, prend l'équipe
     donnée sur toutes ses images ; « NONE » la retire. Renvoie le nombre de réponses appliquées. */
  function applyAnswers(frames, answers) {
    let applied = 0;
    (answers || []).filter((a) => a && a.kind === "team" && (OK[a.team] || a.team === "NONE")).forEach((a) => {
      let best = null, bd = Infinity;
      frames.forEach((f) => {
        if (Math.abs(f.t - a.t) > T_TOL) return;
        f.players.forEach((p) => { const d = Math.hypot(p.x - a.x, p.y - a.y); if (d <= D_TOL && d < bd) { bd = d; best = p.id; } });
      });
      if (best == null) return;
      frames.forEach((f) => {
        if (a.team === "NONE") f.players = f.players.filter((p) => p.id !== best);
        else f.players.forEach((p) => { if (p.id === best) p.team = a.team; });
      });
      applied++;
    });
    return applied;
  }

  const isRejected = (mem, e) => !!(mem && Array.isArray(mem.rejected) && mem.rejected.some((r) => r.type === e.type && Math.abs(r.t - e.t) < REJ_TOL));
  const filterRejected = (list, mem) => (list || []).filter((e) => !isRejected(mem, e));
  function reject(mem, e) { if (!isRejected(mem, e)) mem.rejected.push({ type: e.type, t: Math.round(e.t * 10) / 10 }); }

  /* Questions encore ouvertes : doutes d'équipe + erreurs incertaines, sans celles déjà répondues. */
  function openQuestions(src) {
    const mem = (src && src.memory) || { answers: [], rejected: [] };
    const answers = mem.answers || [];
    const qs = [];
    (src.doubts || []).forEach((d) => {
      if (answers.some((a) => a.kind === "team" && sameSpot(a, d))) return;
      qs.push(Object.assign({ key: "team|" + d.t + "|" + d.x + "|" + d.y }, d));
    });
    (src.uncertain || []).forEach((u) => {
      if (!u.event) return;                                       // anciennes analyses : pas de question possible
      if (isRejected(mem, u) || answers.some((a) => a.kind === "event" && a.type === u.type && Math.abs(a.t - u.t) < REJ_TOL)) return;
      qs.push({ key: "event|" + u.type + "|" + u.t, kind: "event", t: u.t, type: u.type, reason: u.reason, event: u.event });
    });
    return qs;
  }

  /* Enregistre une réponse dans la mémoire. Renvoie l'entrée retenue. */
  function answerTeam(mem, q, team) {
    const a = { kind: "team", t: q.t, x: q.x, y: q.y, team };
    mem.answers = mem.answers.filter((o) => !(o.kind === "team" && sameSpot(o, q))).concat([a]);
    return a;
  }
  function answerEvent(mem, q, verdict) {
    const a = { kind: "event", type: q.type, t: q.t, verdict };
    mem.answers = mem.answers.filter((o) => !(o.kind === "event" && o.type === q.type && Math.abs(o.t - q.t) < REJ_TOL)).concat([a]);
    if (verdict === "non") reject(mem, q);
    return a;
  }

  return { trackDoubts, applyAnswers, openQuestions, answerTeam, answerEvent, isRejected, filterRejected, reject, TEAM_LABEL, MIN_DETECTIONS, SHARE_OK, T_TOL, D_TOL };
});
