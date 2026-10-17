/* Doute -> question -> mémoire du projet. Le programme ne tranche jamais un cas incertain : il le range dans une liste de
   questions, le coach répond (ou non), et la réponse est retenue dans le projet pour ne pas être redemandée. Une question
   sans réponse reste « non analysée » : rien n'est deviné. Chaque réponse peut être annulée (voir undoOne / removeAnswer).
   Quatre sortes de doutes :
   - « team » : une piste dont l'équipe lue sur les images est partagée, ou jamais identifiée ;
   - « event » : une erreur possible que le contexte (ballon non visible, arrêt de jeu…) n'a pas permis de confirmer ;
   - « sub » : une personne qui entre ou sort par la zone de remplacement (remplacement volant) et n'est pas comptée comme
     joueur pendant quelques secondes : remplaçant, ou joueur sur le terrain ?
   - « bench » : la zone de banc marquée a beaucoup dérivé avec le suivi de la caméra : est-elle encore sur le banc ?
   Mémoire (dans le projet) : { goalPalettes, rejected: [{ type, t }], answers: [{ kind, … }], benchFollow }. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FutsalDoubt = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MIN_DETECTIONS = 12;   // détections minimales d'une piste pour la questionner
  const MIN_VOTES = 6;         // lectures d'équipe minimales pour parler de partage
  const SHARE_OK = 0.7;        // part de lectures en accord avec l'équipe retenue en dessous de laquelle on demande
  const MIN_UNKNOWN = 25;      // détections d'une piste jamais identifiée pour demander qui c'est
  const MAX_PTS = 600;         // points gardés pour une personne jamais identifiée (réinjectée si le coach répond)
  const T_TOL = 0.6;           // s : une réponse s'applique à la personne vue à cet instant (±)
  const D_TOL = 3;             // m : …à cette distance au plus
  const SUB_TOL = 1.5;         // s : tolérance de temps d'une réponse « remplaçant »
  const REJ_TOL = 2;           // s : une erreur écartée ne revient pas dans cette fenêtre
  const OK = { A: 1, B: 1, GKA: 1, GKB: 1 };
  const SIDE = { A: "A", GKA: "A", B: "B", GKB: "B" };   // côté d'une lecture : un gardien compte pour son équipe
  const TEAM_LABEL = {
    A: "de votre équipe", B: "de l'équipe adverse", GKA: "le gardien de votre équipe", GKB: "le gardien adverse",
    NONE: "ni joueur ni gardien (arbitre, public, remplaçant)"
  };
  const r2 = (t) => Math.round(t * 100) / 100;

  /* Pistes douteuses. frames : images finales de pipeline (players: { id, team (lecture brute), x, y, b }) ; teams : équipe retenue
     par piste. Renvoie [{ kind:"team", id, t, x, y, b, n, cur, votes, why, pts? }], les plus longues d'abord.
     Une personne jamais identifiée n'est pas gardée dans les images finales : ses points (pts) sont joints à la question pour
     pouvoir la réintroduire si le coach dit qui c'est. */
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
      let why = null, unknown = false;
      if (cur === "A" || cur === "B") {
        // joueur de champ : l'équipe retenue doit être celle que les images lisent le plus souvent, nettement
        const top = Math.max(i.votes.A || 0, i.votes.B || 0), share = sum ? top / sum : 0, mine = sum ? (i.votes[cur] || 0) / sum : 0;
        if (sum >= MIN_VOTES && share < SHARE_OK) why = "équipe lue " + Math.round(mine * 100) + " % du temps seulement";
        else if (sum >= MIN_VOTES && mine < 0.5) why = "l'équipe retenue contredit les images (" + Math.round(mine * 100) + " % du temps)";
      } else if (!OK[cur] && i.n >= MIN_UNKNOWN) { why = "jamais identifié"; unknown = true; }   // gardien : rôle décidé par la position, pas questionné
      if (!why) return;
      const q = i.pts[i.pts.length >> 1];
      const first = i.pts[0], last = i.pts[i.pts.length - 1];
      const d = { kind: "team", id, t: q.t, x: q.x, y: q.y, b: q.b, n: i.n, cur: OK[cur] ? cur : null, votes: Object.assign({}, i.votes), why, t0: first.t, t1: last.t, p0: [first.x, first.y], p1: [last.x, last.y] };
      if (unknown) {
        const step = Math.max(1, Math.ceil(i.pts.length / MAX_PTS));
        d.pts = i.pts.filter((_p, k) => k % step === 0).map((p) => [r2(p.t), p.x, p.y, p.b]);
      }
      out.push(d);
    });
    return out.sort((a, b) => b.n - a.n);
  }

  const sameSpot = (a, b) => Math.abs(a.t - b.t) <= T_TOL && Math.hypot(a.x - b.x, a.y - b.y) <= D_TOL;

  /* Image la plus proche de t (images triées par temps) à moins de tol s, sinon null. */
  function nearestFrame(frames, t, tol) {
    let lo = 0, hi = frames.length - 1;
    if (hi < 0) return null;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (frames[m].t <= t) lo = m; else hi = m; }
    const f = Math.abs(frames[lo].t - t) <= Math.abs(frames[hi].t - t) ? frames[lo] : frames[hi];
    return Math.abs(f.t - t) <= tol ? f : null;
  }

  /* Identifiant de la personne vue à cet instant, à cet endroit (la plus proche), ou null. */
  function findPerson(frames, a) {
    let best = null, bd = Infinity;
    frames.forEach((f) => {
      if (Math.abs(f.t - a.t) > T_TOL) return;
      f.players.forEach((p) => { const d = Math.hypot(p.x - a.x, p.y - a.y); if (d <= D_TOL && d < bd) { bd = d; best = p.id; } });
    });
    return best;
  }

  /* Applique une réponse « team » (modifie frames). Renvoie { ok, undo } : undo décrit comment la défaire.
     - la personne trouvée prend l'équipe donnée sur toutes ses images ; « NONE » la retire ;
     - une personne jamais identifiée (absente des images finales) est réintroduite à partir de ses points (a.pts). */
  function applyOne(frames, a) {
    if (!a || a.kind !== "team" || !(OK[a.team] || a.team === "NONE")) return { ok: false };
    const id = findPerson(frames, a);
    if (id != null) {
      if (a.team === "NONE") {
        const rows = [];
        frames.forEach((f) => { f.players = f.players.filter((p) => { if (p.id !== id) return true; rows.push([f.t, p.x, p.y, p.b || null, p.team]); return false; }); });
        return { ok: true, undo: { kind: "removed", id, rows } };
      }
      let prev = null;
      frames.forEach((f) => f.players.forEach((p) => { if (p.id === id) { if (prev == null) prev = p.team; p.team = a.team; } }));
      return { ok: true, undo: { kind: "set", prev } };
    }
    if (Array.isArray(a.pts) && a.pts.length && a.team !== "NONE") {
      let nid = 1;
      frames.forEach((f) => f.players.forEach((p) => { if (typeof p.id === "number" && p.id >= nid) nid = p.id + 1; }));
      let n = 0;
      a.pts.forEach(([t, x, y, b]) => { const f = nearestFrame(frames, t, 0.06); if (f) { f.players.push({ id: nid, team: a.team, x, y, b: b || undefined }); n++; } });
      return n ? { ok: true, undo: { kind: "injected", id: nid } } : { ok: false };
    }
    return { ok: false };
  }

  /* Applique toutes les réponses « team » (nouvelle analyse du projet). Renvoie le nombre appliquées. */
  function applyAnswers(frames, answers) {
    let applied = 0;
    (answers || []).forEach((a) => { if (applyOne(frames, a).ok) applied++; });
    return applied;
  }

  /* Défait une réponse « team » déjà appliquée (a.undo). Renvoie vrai si les images ont changé. */
  function undoOne(frames, a) {
    const u = a && a.undo;
    if (!u) return false;
    if (u.kind === "set") {
      const id = findPerson(frames, a);
      if (id == null) return false;
      frames.forEach((f) => f.players.forEach((p) => { if (p.id === id) p.team = u.prev; }));
      return true;
    }
    if (u.kind === "removed") {
      u.rows.forEach(([t, x, y, b, team]) => { const f = nearestFrame(frames, t, 0.06); if (f) f.players.push({ id: u.id, team, x, y, b: b || undefined }); });
      return true;
    }
    if (u.kind === "injected") {
      frames.forEach((f) => { f.players = f.players.filter((p) => p.id !== u.id); });
      return true;
    }
    return false;
  }

  /* Questions qui concernent peut-être LA MÊME PERSONNE que q : le suivi coupe parfois une personne en plusieurs pistes. Deux pistes
     se suivent si l'une commence juste après (ou finit juste avant) l'autre, tout près de là où elle s'arrête (vitesse plausible),
     avec la même équipe retenue ; la chaîne de pistes qui se suivent est suivie de proche en proche. C'est une PROPOSITION : rien
     n'est appliqué sans que le coach l'accepte. */
  const LINK_GAP = 4, LINK_SPEED = 6;
  function sameTrackHint(q, doubts) {
    const teams = (doubts || []).filter((d) => d.kind === "team" && d.t0 != null && d.t1 != null && Array.isArray(d.p0) && Array.isArray(d.p1));
    if (q.t0 == null || !Array.isArray(q.p0)) return [];
    const follows = (a, b) => {                                  // b commence après a (ou l'inverse), au bon endroit
      const dt = b.t0 - a.t1;
      if (dt < -0.2 || dt > LINK_GAP) return false;
      return Math.hypot(b.p0[0] - a.p1[0], b.p0[1] - a.p1[1]) <= 2 + LINK_SPEED * Math.max(0, dt);
    };
    const linked = (a, b) => a.cur === b.cur && (follows(a, b) || follows(b, a));
    const group = [q], seen = new Set([q.id]);
    for (let k = 0; k < group.length; k++) {
      teams.forEach((d) => { if (!seen.has(d.id) && linked(group[k], d)) { seen.add(d.id); group.push(d); } });
    }
    return group.slice(1);
  }

  const isRejected = (mem, e) => !!(mem && Array.isArray(mem.rejected) && mem.rejected.some((r) => r.type === e.type && Math.abs(r.t - e.t) < REJ_TOL));
  const filterRejected = (list, mem) => (list || []).filter((e) => !isRejected(mem, e));
  function reject(mem, e) { if (!isRejected(mem, e)) mem.rejected.push({ type: e.type, t: Math.round(e.t * 10) / 10 }); }
  function unreject(mem, r) { mem.rejected = mem.rejected.filter((x) => !(x.type === r.type && Math.abs(x.t - r.t) < 0.05)); }

  const subMatch = (a, s) => a.kind === "sub" && Math.abs(a.t - s.t) <= SUB_TOL && Math.hypot(a.x - s.x, a.y - s.y) <= D_TOL;

  /* Questions encore ouvertes : doutes d'équipe, zone de banc, remplacements, erreurs incertaines — sans celles déjà répondues. */
  function openQuestions(src) {
    const mem = (src && src.memory) || { answers: [], rejected: [] };
    const answers = mem.answers || [];
    const qs = [];
    (src.doubts || []).forEach((d) => {
      if (d.kind === "bench") {
        if (!answers.some((a) => a.kind === "bench")) qs.push(Object.assign({ key: "bench|" + d.t }, d));
        return;
      }
      if (answers.some((a) => a.kind === "team" && sameSpot(a, d))) return;
      qs.push(Object.assign({ key: "team|" + d.t + "|" + d.x + "|" + d.y }, d));
    });
    (src.subs || []).forEach((s) => {
      if (s.answered || answers.some((a) => subMatch(a, s))) return;
      qs.push(Object.assign({ key: "sub|" + s.t + "|" + s.id, kind: "sub" }, s));
    });
    (src.uncertain || []).forEach((u) => {
      if (!u.event) return;                                       // anciennes analyses : pas de question possible
      if (isRejected(mem, u) || answers.some((a) => a.kind === "event" && a.type === u.type && Math.abs(a.t - u.t) < REJ_TOL)) return;
      qs.push({ key: "event|" + u.type + "|" + u.t, kind: "event", t: u.t, type: u.type, reason: u.reason, event: u.event });
    });
    return qs;
  }

  /* Enregistre une réponse dans la mémoire. Renvoie l'entrée retenue. */
  function answerTeam(mem, q, team, via) {
    const a = { kind: "team", t: q.t, x: q.x, y: q.y, team };
    if (via) a.via = via;
    if (Array.isArray(q.pts)) a.pts = q.pts;
    mem.answers = mem.answers.filter((o) => !(o.kind === "team" && sameSpot(o, q))).concat([a]);
    return a;
  }
  function answerEvent(mem, q, verdict) {
    const a = { kind: "event", type: q.type, t: q.t, verdict };
    mem.answers = mem.answers.filter((o) => !(o.kind === "event" && o.type === q.type && Math.abs(o.t - q.t) < REJ_TOL)).concat([a]);
    if (verdict === "non") reject(mem, q);
    return a;
  }
  /* verdict : "remplacant" (il entre ou sort : compté comme tel) ou "joueur" (il est bien sur le terrain : compté comme joueur). */
  function answerSub(mem, q, verdict) {
    const a = { kind: "sub", t: q.t, x: q.x, y: q.y, verdict };
    mem.answers = mem.answers.filter((o) => !subMatch(o, q)).concat([a]);
    return a;
  }
  /* ok = vrai : la zone de banc est bien sur le banc ; faux : elle a dérivé, le suivi de dérive est coupé aux prochaines analyses. */
  function answerBench(mem, ok) {
    const a = { kind: "bench", ok: !!ok, t: Date.now() };
    mem.answers = mem.answers.filter((o) => o.kind !== "bench").concat([a]);
    if (!ok) mem.benchFollow = false; else delete mem.benchFollow;
    return a;
  }

  /* Retire une réponse de la mémoire (l'annulation des effets sur les images se fait avec undoOne ; sur les événements par l'appelant). */
  function removeAnswer(mem, a) {
    mem.answers = mem.answers.filter((o) => o !== a);
    if (a.kind === "event" && a.verdict === "non") unreject(mem, a);
    if (a.kind === "bench" && !mem.answers.some((o) => o.kind === "bench" && o.ok === false)) delete mem.benchFollow;
  }

  /* Texte d'une réponse pour l'écran « Mes réponses ». fmt(t) -> "mm:ss" ; labelOf(type) -> libellé d'une erreur. */
  function describeAnswer(a, fmt, labelOf) {
    if (a.kind === "team") return fmt(a.t) + " — personne désignée : " + (TEAM_LABEL[a.team] || a.team) + (a.via ? " (même réponse appliquée sur votre accord : " + a.via + ")" : "");
    if (a.kind === "event") return fmt(a.t) + " — « " + labelOf(a.type) + " » : " + (a.verdict === "oui" ? "oui, c'est arrivé (ajoutée aux événements)" : "non, écartée");
    if (a.kind === "sub") return fmt(a.t) + " — passage par la zone de remplacement : " + (a.verdict === "joueur" ? "joueur sur le terrain" : "remplaçant qui entre ou sort");
    if (a.kind === "bench") return "Zone du banc : " + (a.ok ? "bien placée" : "a dérivé (suivi de dérive coupé aux prochaines analyses)");
    return "Réponse";
  }

  return { trackDoubts, sameTrackHint, applyOne, applyAnswers, undoOne, openQuestions, answerTeam, answerEvent, answerSub, answerBench, removeAnswer, describeAnswer, isRejected, filterRejected, reject, unreject, TEAM_LABEL, MIN_DETECTIONS, SHARE_OK, T_TOL, D_TOL };
});
