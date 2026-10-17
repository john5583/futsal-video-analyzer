/* Doute -> question -> mémoire du projet. Le programme ne tranche jamais un cas incertain : il le range dans une liste de
   questions, le coach répond (ou non), et la réponse est retenue dans le projet pour ne pas être redemandée. Une question
   sans réponse reste « non analysée » : rien n'est deviné. Chaque réponse peut être annulée (voir undoOne / removeAnswer).
   Cinq sortes de doutes (la tenue différente et les cinq joueurs de champ s'ajoutent au doute d'équipe) :
   - « team » : une piste dont l'équipe lue sur les images est partagée, jamais identifiée, qui s'habille autrement que son équipe
     (pantalon alors que les autres portent un short), ou qui fait cinq joueurs de champ en même temps (il n'y en a que quatre) ;
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
  const LEG_PANTS = 0.05;      // peau visible aux jambes en dessous de laquelle on parle de pantalon / survêtement (mesuré : gardien en survêtement = 0 %)
  const LEG_REF_MIN = 0.12;    // les autres joueurs de l'équipe doivent, eux, montrer au moins cette part de peau (short)
  const LEG_NEAR = 0.08;       // « même allure » : jambes sans peau, pour proposer le même gardien
  const CROWD_MIN = 3;         // s : cinq joueurs de champ d'une même équipe en même temps pendant au moins ce temps
  const MAX_PTS = 600;         // points gardés pour une personne jamais identifiée (réinjectée si le coach répond)
  const T_TOL = 0.6;           // s : une réponse s'applique à la personne vue à cet instant (±)
  const D_TOL = 3;             // m : une question répondue est retrouvée à cette distance au plus
  const D_APPLY = 1.5;         // m : une réponse ne s'applique qu'à la personne trouvée à cette distance au plus (les joueurs se touchent souvent)
  const D_AMBIG = 0.6;         // m : si deux personnes sont presque aussi proches, on ne devine pas laquelle
  const SUB_TOL = 1.0;         // s : tolérance de temps d'une réponse « remplaçant »
  const REJ_TOL = 2;           // s : une erreur écartée ne revient pas dans cette fenêtre
  const OK = { A: 1, B: 1, GKA: 1, GKB: 1 };
  const SIDE = { A: "A", GKA: "A", B: "B", GKB: "B" };   // côté d'une lecture : un gardien compte pour son équipe
  const TEAM_LABEL = {
    A: "de votre équipe", B: "de l'équipe adverse", GKA: "le gardien de votre équipe", GKB: "le gardien adverse",
    NONE: "ni joueur ni gardien (arbitre, public, remplaçant)"
  };
  const r2 = (t) => Math.round(t * 100) / 100;

  const median = (v) => { const a = v.slice().sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null; };

  /* Pistes douteuses. frames : images finales de pipeline (players: { id, team (lecture brute), x, y, b, lg (peau visible aux jambes) }) ; teams : équipe retenue
     par piste. Renvoie [{ kind:"team", id, t, x, y, b, n, cur, votes, why, leg, pts? }], les plus longues d'abord.
     Une personne jamais identifiée n'est pas gardée dans les images finales : ses points (pts) sont joints à la question pour
     pouvoir la réintroduire si le coach dit qui c'est. Trois raisons de douter d'une piste que les lectures d'équipe ne contredisent pas :
     elle porte un pantalon alors que son équipe porte un short, ou elle fait partie de cinq joueurs de champ d'une même équipe en même temps. */
  function trackDoubts(frames, teams) {
    const info = new Map();
    frames.forEach((f) => f.players.forEach((p) => {
      let i = info.get(p.id);
      if (!i) { i = { n: 0, votes: {}, pts: [], lgs: [] }; info.set(p.id, i); }
      i.n++;
      // lecture la plus fine d'abord (équipe de champ la plus proche, `f`), comme pour la coupure des pistes ; sinon l'équipe lue
      const read = p.f === "A" || p.f === "B" ? p.f : p.team;
      if (SIDE[read]) i.votes[SIDE[read]] = (i.votes[SIDE[read]] || 0) + 1;
      if (typeof p.lg === "number") i.lgs.push(p.lg);
      if (Array.isArray(p.b) && p.b.length === 4) i.pts.push({ t: f.t, x: p.x, y: p.y, b: p.b });
    }));
    info.forEach((i) => { i.leg = i.lgs.length >= 6 ? median(i.lgs) : null; });
    // jambes de référence : médiane des joueurs de champ de chaque équipe (à défaut, des deux équipes)
    const legsOf = (side) => { const v = []; info.forEach((i, id) => { if (teams[id] === side && i.n >= MIN_DETECTIONS && i.leg != null) v.push(i.leg); }); return v; };
    const all = legsOf("A").concat(legsOf("B"));
    const ref = (side) => { const v = legsOf(side); return v.length >= 3 ? median(v) : median(all); };

    const out = [], doubted = new Set();
    const make = (id, i, cur, why, unknown, pt) => {
      const q = pt || i.pts[i.pts.length >> 1], first = i.pts[0], last = i.pts[i.pts.length - 1];
      const d = { kind: "team", id, t: q.t, x: q.x, y: q.y, b: q.b, n: i.n, cur: OK[cur] ? cur : null, votes: Object.assign({}, i.votes), why, leg: i.leg, t0: first.t, t1: last.t, p0: [first.x, first.y], p1: [last.x, last.y] };
      if (unknown) {
        const step = Math.max(1, Math.ceil(i.pts.length / MAX_PTS));
        d.pts = i.pts.filter((_p, k) => k % step === 0).map((p) => [r2(p.t), p.x, p.y, p.b]);
      }
      doubted.add(id); out.push(d);
    };
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
        else if (i.leg != null && i.leg < LEG_PANTS && (ref(cur) || 0) >= LEG_REF_MIN) why = "porte un pantalon ou un survêtement (" + Math.round(i.leg * 100) + " % de peau visible aux jambes) alors que les autres " + (cur === "B" ? "adversaires" : "joueurs de ton équipe") + " portent un short : gardien, arbitre ou joueur ?";
      } else if (!OK[cur] && i.n >= MIN_UNKNOWN) { why = "jamais identifié"; unknown = true; }   // gardien : rôle décidé par la position, pas questionné
      if (why) make(id, i, cur, why, unknown);
    });

    // cinq joueurs de champ d'une même équipe en même temps : l'un d'eux est peut-être un gardien, un arbitre ou un remplaçant
    ["A", "B"].forEach((side) => {
      const runs = [];
      let run = null;
      frames.forEach((f) => {
        const ids = [...new Set(f.players.filter((p) => teams[p.id] === side).map((p) => p.id))];
        if (ids.length < 5) return;
        if (run && f.t - run.t1 <= 1.5) { run.t1 = f.t; run.frames.push({ t: f.t, ids }); }
        else { run = { t0: f.t, t1: f.t, frames: [{ t: f.t, ids }] }; runs.push(run); }
      });
      runs.filter((r) => r.t1 - r.t0 >= CROWD_MIN).forEach((r) => {
        const seen = new Map();
        r.frames.forEach((fr) => fr.ids.forEach((id) => seen.set(id, (seen.get(id) || 0) + 1)));
        // les personnes présentes pendant la moitié de l'épisode ; on questionne celle dont les jambes sont le plus différentes (pantalon), sinon la piste la plus courte
        const present = [...seen.entries()].filter(([, c]) => c >= r.frames.length * 0.5).map(([id]) => id).filter((id) => info.has(id) && info.get(id).pts.length);
        if (present.some((id) => doubted.has(id))) return;                 // l'un d'eux est déjà questionné (pantalon, équipe douteuse) : la foule est expliquée
        const cands = present;
        if (!cands.length) return;
        cands.sort((x, y) => { const lx = info.get(x).leg == null ? 1 : info.get(x).leg, ly = info.get(y).leg == null ? 1 : info.get(y).leg; return lx - ly || info.get(x).n - info.get(y).n; });
        const id = cands[0], i = info.get(id), mid = (r.t0 + r.t1) / 2;
        const pt = i.pts.reduce((bst, p) => (Math.abs(p.t - mid) < Math.abs(bst.t - mid) ? p : bst), i.pts[0]);
        make(id, i, teams[id], "cinq " + (side === "B" ? "joueurs adverses" : "joueurs de ton équipe") + " de champ en même temps pendant " + Math.round(r.t1 - r.t0) + " s (il n'y en a que quatre en futsal) : l'un d'eux est peut-être un gardien, un arbitre ou un remplaçant", false, pt);
      });
    });
    return out.sort((a, b) => b.n - a.n);
  }

  /* Personnes qui ont la même allure (jambes sans peau, même équipe lue) que celle qu'on vient de désigner : PROPOSITION de la même réponse,
     jamais appliquée sans l'accord du coach. La tenue seule ne suffit pas à reconnaître un gardien (mesuré : presque tous les joueurs lui ressemblent). */
  function sameLookHint(q, doubts) {
    if (typeof q.leg !== "number" || q.leg >= LEG_NEAR) return [];
    return (doubts || []).filter((d) => d.kind === "team" && d.id !== q.id && typeof d.leg === "number" && d.leg < LEG_NEAR && d.cur === q.cur);
  }

  const sameSpot = (a, b) => Math.abs(a.t - b.t) <= T_TOL && Math.hypot(a.x - b.x, a.y - b.y) <= D_APPLY;

  /* Image la plus proche de t (images triées par temps) à moins de tol s, sinon null. */
  function nearestFrame(frames, t, tol) {
    let lo = 0, hi = frames.length - 1;
    if (hi < 0) return null;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (frames[m].t <= t) lo = m; else hi = m; }
    const f = Math.abs(frames[lo].t - t) <= Math.abs(frames[hi].t - t) ? frames[lo] : frames[hi];
    return Math.abs(f.t - t) <= tol ? f : null;
  }

  /* Identifiant de la personne vue à cet instant, à cet endroit, ou null. Rayon serré (D_APPLY) et aucune réponse en cas d'ambiguïté :
     deux personnes presque aussi proches du point -> on ne devine pas laquelle (la réponse reste enregistrée mais n'est pas appliquée). */
  function findPerson(frames, a) {
    const best = new Map();
    frames.forEach((f) => {
      if (Math.abs(f.t - a.t) > T_TOL) return;
      f.players.forEach((p) => { const d = Math.hypot(p.x - a.x, p.y - a.y); if (d <= D_APPLY && d < (best.has(p.id) ? best.get(p.id) : Infinity)) best.set(p.id, d); });
    });
    const list = [...best.entries()].sort((x, y) => x[1] - y[1]);
    if (!list.length) return null;
    if (list.length > 1 && list[1][1] - list[0][1] < D_AMBIG) return null;
    return list[0][0];
  }

  /* Personne jamais identifiée : retrouvée dans les images seulement si elle existe maintenant, aux mêmes points (à 15 cm près : ce sont les mêmes détections). */
  function personAtPoints(frames, pts) {
    const votes = new Map(), step = Math.max(1, Math.floor(pts.length / 7));
    for (let k = 0; k < pts.length; k += step) {
      const [t, x, y] = pts[k], f = nearestFrame(frames, t, 0.06);
      if (!f) continue;
      f.players.forEach((p) => { if (Math.hypot(p.x - x, p.y - y) <= 0.15) votes.set(p.id, (votes.get(p.id) || 0) + 1); });
    }
    const top = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
    return top && top[1] >= 2 ? top[0] : null;
  }

  /* Applique une réponse « team » (modifie frames). Renvoie { ok, undo } : undo décrit comment la défaire.
     - la personne trouvée prend l'équipe donnée sur toutes ses images ; « NONE » la retire ;
     - une personne jamais identifiée (absente des images finales) est réintroduite à partir de ses points (a.pts). */
  function applyOne(frames, a, hint) {
    if (a && a.kind === "ball") {
      // « le ballon est ici » : posé sur l'image analysée la plus proche (à 0,5 s près), vérifié par le coach ; l'ancienne position est gardée pour annuler
      const f = nearestFrame(frames, a.t, 0.5);
      if (!f || !isFinite(a.x) || !isFinite(a.y)) return { ok: false };
      const prev = f.ball ? { x: f.ball.x, y: f.ball.y } : null;
      f.ball = { x: a.x, y: a.y };
      return { ok: true, undo: { kind: "ball", t: f.t, prev } };
    }
    if (!a || a.kind !== "team" || !(OK[a.team] || a.team === "NONE")) return { ok: false };
    // identifiant exact connu à l'instant de la réponse (clic sur un cadre, question de cette analyse) : pas de recherche par la position
    const exact = hint && hint.id != null && frames.some((f) => f.players.some((p) => p.id === hint.id)) ? hint.id : null;
    const id = exact != null ? exact : Array.isArray(a.pts) && a.pts.length ? personAtPoints(frames, a.pts) : findPerson(frames, a);
    if (id != null) {
      if (a.team === "NONE") {
        const rows = [];
        frames.forEach((f) => { f.players = f.players.filter((p) => { if (p.id !== id) return true; rows.push([f.t, p.x, p.y, p.b || null, p.team]); return false; }); });
        return { ok: true, undo: { kind: "removed", id, rows } };
      }
      let prev = null;
      frames.forEach((f) => f.players.forEach((p) => { if (p.id === id) { if (prev == null) prev = p.team; p.team = a.team; } }));
      return { ok: true, undo: { kind: "set", id, prev } };
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
    (answers || []).forEach((a) => {
      if (!a || (a.kind !== "team" && a.kind !== "ball")) return;
      const r = applyOne(frames, a);
      if (r.ok) { a.undo = r.undo; applied++; } else delete a.undo;           // non appliquée cette fois : rien à annuler
    });
    return applied;
  }

  /* Défait une réponse « team » déjà appliquée (a.undo). Renvoie vrai si les images ont changé. */
  function undoOne(frames, a) {
    const u = a && a.undo;
    if (!u) return false;
    if (u.kind === "ball") {
      const f = nearestFrame(frames, u.t, 0.06);
      if (!f) return false;
      f.ball = u.prev ? { x: u.prev.x, y: u.prev.y } : null;
      return true;
    }
    if (u.kind === "set") {
      const id = u.id != null && frames.some((f) => f.players.some((p) => p.id === u.id)) ? u.id : findPerson(frames, a);
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
  function unreject(mem, r) { mem.rejected = mem.rejected.filter((x) => !(x.type === r.type && Math.abs(x.t - r.t) <= 0.051)); }

  const subMatch = (a, s) => a.kind === "sub" && Math.abs(a.t - s.t) <= SUB_TOL && Math.hypot(a.x - s.x, a.y - s.y) <= D_APPLY;

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
      if (s.answered) return;                                    // « répondue » est décidé par l'analyse (une réponse ambiguë entre deux personnes n'est pas comptée)
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
    if (q.event) { a.event = q.event; a.reason = q.reason; }          // gardés pour pouvoir rétablir la question en annulant
    mem.answers = mem.answers.filter((o) => !(o.kind === "event" && o.type === q.type && Math.abs(o.t - q.t) < REJ_TOL)).concat([a]);
    if (verdict === "non") reject(mem, q);
    return a;
  }
  /* « Le ballon est ici » : désigné par le coach sur une image (coordonnées du terrain). */
  function answerBall(mem, pt) {
    const a = { kind: "ball", t: pt.t, x: pt.x, y: pt.y };
    mem.answers = mem.answers.filter((o) => !(o.kind === "ball" && Math.abs(o.t - a.t) < 0.4)).concat([a]);
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
    if (a.kind === "ball") return fmt(a.t) + " — le ballon est ici (position confirmée par vous sur cette image)";
    if (a.kind === "event") return fmt(a.t) + " — « " + labelOf(a.type) + " » : " + (a.verdict === "oui" ? "oui, c'est arrivé (ajoutée aux événements)" : "non, écartée");
    if (a.kind === "sub") return fmt(a.t) + " — passage par la zone de remplacement : " + (a.verdict === "joueur" ? "joueur sur le terrain" : "remplaçant qui entre ou sort");
    if (a.kind === "bench") return "Zone du banc : " + (a.ok ? "bien placée" : "a dérivé (suivi de dérive coupé aux prochaines analyses)");
    return "Réponse";
  }

  return { trackDoubts, sameTrackHint, sameLookHint, answerBall, applyOne, applyAnswers, undoOne, openQuestions, answerTeam, answerEvent, answerSub, answerBench, removeAnswer, describeAnswer, isRejected, filterRejected, reject, unreject, TEAM_LABEL, MIN_DETECTIONS, SHARE_OK, T_TOL, D_TOL };
});
