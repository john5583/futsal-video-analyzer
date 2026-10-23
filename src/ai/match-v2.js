/* Analyse tactique « v2 (bêta) » : les 32 règles du catalogue (src/engine/regles.js), validées une à une par le coach.
   Part de l'analyse habituelle (match.js : les dix règles déjà codées, mêmes seuils), y ajoute les règles mesurables supplémentaires
   (R03 perte inutile, R04 relance risquée, R06 dribble excessif, R10 absence de mouvement, R13 transition lente, R14 supériorité non
   convertie, R27 règle des 4 secondes), puis :
   - tout évènement passe par la règle d'or (ballon vu sur assez d'images, statut, jamais d'erreur sur un ballon inconnu) ;
   - tout évènement porte sa règle (regle, regleEtat) ; une règle rejetée n'affiche rien ;
   - le rapport de couverture dit, pour chaque règle, « évaluée » ou « non évalué » + la raison.
   Les seuils des règles supplémentaires sont des PROPOSITIONS : elles s'affichent « règle non validée » tant que le coach n'a pas tranché.
   Rien n'est inventé : aucune position n'est comblée, aucune erreur n'est affichée sans ballon fiable. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./match"), require("../engine/regles"), require("../engine/regle-or"), require("./bidirectionnel"));
  else root.FutsalMatchV2 = factory(root.FutsalMatch, root.FutsalRegles, root.FutsalRegleOr, root.FutsalBidirectionnel);
})(typeof self !== "undefined" ? self : this, function (M, RG, RO, BD) {
  "use strict";

  const COOLDOWN = 8;                  // s entre deux évènements du même type
  const FREE_DIST = 3;                 // m : un joueur est « libre » si aucun adversaire à moins de cette distance
  const PASS_MIN = 3, PASS_MAX = 12;   // m : portée d'une passe vers un coéquipier libre (R03)
  const PRESS_DIST = 3;                // m : adversaire qui presse le porteur
  const DRIBBLE_MAX = 6;               // s : conservation individuelle trop longue (R06, proposé)
  const STILL_SPEED = 0.3, STILL_DUR = 5;   // m/s, s : R10
  const SLOW_DUR = 4, SLOW_GAIN = 4, AHEAD = 5;   // R13 : durée (s), avancée du ballon (m), avance des coéquipiers (m)
  const OVERLOAD_R = 8, OVERLOAD_MIN = 2, OVERLOAD_DUR = 3, OVERLOAD_GAIN = 3;   // R14
  const GK_HOLD = 4;                   // s : R27

  const field = (list) => list.filter((p) => !p.gk && !p.sub);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const hasId = (p) => p && p.id != null;

  /* Un joueur de champ de mon équipe est « libre » si aucun adversaire (de champ ou gardien) n'est à moins de FREE_DIST. */
  const isFree = (p, B) => !B.some((o) => dist(o, p) < FREE_DIST);

  function detectExtra(nf, poss, base, L, W) {
    const out = [], last = {};
    const accept = (type, t) => { if (last[type] != null && t - last[type] < COOLDOWN) return false; last[type] = t; return true; };
    const mk = (type, i, extra) => {
      const f = nf[i], ref = poss[i].ball || f.A[0] || { x: L / 2, y: W / 2 };
      return Object.assign({ t: f.t, type, zone: M.zoneOf(ref.x, L), side: M.sideOf(ref.y, W), outcome: "AUCUN", auto: true }, extra);
    };
    const ts = nf.map((f) => f.t);

    // R03 et R04 : à partir des pertes déjà trouvées (R01/R02), on qualifie la perte
    base.events.concat(base.uncertain.map((u) => u.event).filter(Boolean)).filter((e) => e.type === "perte_zone_def" || e.type === "perte_zone_mediane").forEach((e) => {
      const i = nf.findIndex((f) => Math.abs(f.t - e.t) < 1e-6);
      if (i < 1) return;
      // la possession confirmée a une image de retard : le porteur est celui de la dernière image où le ballon était brut chez mon équipe
      let k = i - 1; while (k > 0 && poss[k].raw !== "A") k--;
      const h = poss[k].holder, prev = nf[k];
      if (!hasId(h) || poss[k].raw !== "A") return;
      const pressers = field(prev.B).filter((p) => dist(p, h) < PRESS_DIST).length;
      if (pressers < 2) {
        // R03 : perte sans pression, alors qu'un coéquipier libre était à portée de passe
        const mate = field(prev.A).find((p) => p.id !== h.id && dist(p, h) >= PASS_MIN && dist(p, h) <= PASS_MAX && isFree(p, prev.B));
        if (mate && accept("perte_inutile", e.t)) out.push(mk("perte_inutile", i, { outcome: "PERTE", phase: "transition", note: "Perte sans pression (" + pressers + " adversaire à moins de 3 m) alors que le joueur n° " + mate.id + " était libre à " + dist(mate, h).toFixed(1) + " m (détection automatique)", conf: 0.5, blocked: e.blocked }));
      } else if (e.type === "perte_zone_def") {
        // R04 : perte sous pressing par le gardien ou le dernier défenseur de champ
        const back = field(prev.A).slice().sort((a, b) => a.x - b.x)[0];
        if ((h.gk || (back && back.id === h.id)) && accept("relance_risquee", e.t)) out.push(mk("relance_risquee", i, { outcome: "PERTE", phase: "pressing", note: (h.gk ? "Le gardien" : "Le dernier défenseur") + " perd le ballon sous pressing (" + pressers + " adversaires à moins de 3 m) (détection automatique)", conf: 0.55, blocked: e.blocked }));
      }
    });

    // R06 : conservation individuelle trop longue alors qu'un coéquipier est libre
    for (let i = 0; i < nf.length;) {
      const h = poss[i].team === "A" ? poss[i].holder : null;
      if (!hasId(h)) { i++; continue; }
      let j = i;
      while (j + 1 < nf.length && poss[j + 1].team === "A" && hasId(poss[j + 1].holder) && poss[j + 1].holder.id === h.id && nf[j + 1].t - nf[j].t <= 1) j++;
      if (nf[j].t - nf[i].t >= DRIBBLE_MAX) {
        let freeN = 0, n = 0, mate = null;
        for (let k = i; k <= j; k++) {
          n++;
          const hk = poss[k].holder, m = field(nf[k].A).find((p) => p.id !== h.id && dist(p, hk) <= PASS_MAX && isFree(p, nf[k].B));
          if (m) { freeN++; mate = m; }
        }
        let idx = nf.findIndex((f, k) => k >= i && f.t >= nf[i].t + DRIBBLE_MAX - 1e-6);
        if (idx < 0 || idx > j) idx = j;
        if (freeN >= n / 2 && accept("dribble_excessif", nf[idx].t)) out.push(mk("dribble_excessif", idx, { note: "Le joueur n° " + h.id + " garde le ballon " + (nf[j].t - nf[i].t).toFixed(1) + " s alors qu'un coéquipier libre est à portée (détection automatique)", conf: 0.5 }));
      }
      i = j + 1;
    }

    // R10 : joueur de champ sans ballon quasi immobile alors que mon équipe attaque (vitesses lissées dans les deux sens du temps)
    const tracks = new Map();
    nf.forEach((f, i) => field(f.A).forEach((p) => { if (!tracks.has(p.id)) tracks.set(p.id, []); tracks.get(p.id).push({ i, t: f.t, x: p.x, y: p.y }); }));
    tracks.forEach((pts, id) => {
      if (pts.length < 6) return;
      const sp = BD.vitesses(pts, { alpha: 0.5, maxGap: 0.8 });
      const flags = pts.map((p, k) => sp[k] != null && sp[k] < STILL_SPEED && poss[p.i].team === "A" && !(poss[p.i].holder && poss[p.i].holder.id === id));
      BD.series(flags, pts.map((p) => p.t), STILL_DUR).forEach(([s, e]) => {
        // série continue : aucun trou de plus de 0,8 s entre deux positions
        for (let k = s + 1; k <= e; k++) if (pts[k].t - pts[k - 1].t > 0.8 + 1e-9) return;
        const i = pts[s].i;
        if (accept("absence_mouvement", pts[s].t)) out.push(mk("absence_mouvement", i, { note: "Le joueur n° " + id + " reste quasi immobile pendant " + (pts[e].t - pts[s].t).toFixed(1) + " s alors que l'équipe attaque (détection automatique)", conf: 0.45 }));
      });
    });

    // R13 : récupération puis progression trop lente alors que des coéquipiers sont démarqués devant
    for (let i = 1; i < nf.length; i++) {
      if (!(poss[i - 1].team === "B" && poss[i].team === "A") || !poss[i].ball) continue;
      if (poss[i].ball.x >= (2 * L) / 3) continue;
      let j = i; while (j + 1 < nf.length && nf[j + 1].t - nf[i].t <= SLOW_DUR + 1e-6) j++;
      if (nf[j].t - nf[i].t < SLOW_DUR - 0.34) continue;
      let ok = true; for (let k = i; k <= j; k++) if (poss[k].team !== "A" || !poss[k].ball) { ok = false; break; }
      if (!ok) continue;
      let maxX = -Infinity; for (let k = i; k <= j; k++) maxX = Math.max(maxX, poss[k].ball.x);
      const gain = maxX - poss[i].ball.x, ahead = field(nf[j].A).filter((p) => p.x > poss[j].ball.x + AHEAD).length;
      if (gain < SLOW_GAIN && ahead >= 2 && accept("transition_off_lente", nf[j].t)) out.push(mk("transition_off_lente", j, { phase: "transition", note: "Après la récupération, le ballon avance de " + gain.toFixed(1) + " m en " + SLOW_DUR + " s alors que " + ahead + " coéquipiers sont à plus de " + AHEAD + " m devant (détection automatique)", conf: 0.45 }));
    }

    // R14 : supériorité numérique autour du ballon, non convertie
    const sup = nf.map((f, i) => {
      if (poss[i].team !== "A" || !poss[i].ball) return false;
      const b = poss[i].ball, a = field(f.A).filter((p) => dist(p, b) <= OVERLOAD_R).length, o = field(f.B).filter((p) => dist(p, b) <= OVERLOAD_R).length;
      return a - o >= OVERLOAD_MIN;
    });
    BD.series(sup, ts, OVERLOAD_DUR).forEach(([s, e]) => {
      const gain = Math.max(...poss.slice(s, e + 1).map((r) => r.ball.x)) - poss[s].ball.x;
      if (gain < OVERLOAD_GAIN && accept("superiorite_non_convertie", nf[e].t)) out.push(mk("superiorite_non_convertie", e, { phase: "transition", note: "Supériorité de " + OVERLOAD_MIN + " joueurs ou plus autour du ballon pendant " + (nf[e].t - nf[s].t).toFixed(1) + " s sans faire avancer le ballon (+" + gain.toFixed(1) + " m) (détection automatique)", conf: 0.45 }));
    });

    // R27 : le gardien garde le ballon au moins 4 s dans sa moitié
    const gk = nf.map((f, i) => poss[i].team === "A" && poss[i].holder && poss[i].holder.gk === true && poss[i].ball.x < L / 2 && !!f.ball);
    BD.series(gk, ts, GK_HOLD).forEach(([s]) => {
      const k = nf.findIndex((f, q) => q >= s && f.t >= nf[s].t + GK_HOLD - 1e-6);
      if (k >= 0 && accept("regle_4s", nf[k].t)) out.push(mk("regle_4s", k, { note: "Le gardien garde le ballon plus de " + GK_HOLD + " s dans sa moitié (détection automatique)", conf: 0.5 }));
    });

    return out.sort((a, b) => a.t - b.t);
  }

  /* validations : { R01: "validee" | "rejetee" } (voir regles.js). Renvoie le résultat de match.analyze enrichi :
     events (statut + regle + regleEtat), uncertain, couverture (une ligne par règle), resumeCouverture. */
  function analyze(frames, opts) {
    const o = opts || {}, L = o.L || 40, W = o.W || 20;
    const base = M.analyze(frames, o), nf = base.normalized;
    const poss = M.possessionSeries(nf);
    const states = base.playStates || [];
    const extra = detectExtra(nf, poss, base, L, W);
    // évènements supplémentaires : même filtre que l'analyse habituelle (contexte, ballon fiable), puis règle d'or
    const ev = [], unc = [];
    extra.forEach((e) => {
      e.ballConf = M.ballConfidence(nf, e.t);
      let blocked = e.blocked || null;
      delete e.blocked;
      for (let i = 0; i < nf.length && !blocked; i++) {
        if (nf[i].t < e.t - 1 - 1e-6 || nf[i].t > e.t + 1e-6) continue;
        if (states[i] === "arret") blocked = "arrêt de jeu probable"; else if (states[i] === "incertain") blocked = "ballon non visible";
      }
      if (blocked) unc.push({ t: e.t, type: e.type, ballConf: e.ballConf, reason: blocked, event: Object.assign({}, e) });
      else if (e.ballConf >= M.BALL_CONF_MIN) ev.push(e);
      else unc.push({ t: e.t, type: e.type, ballConf: e.ballConf, reason: "ballon pas assez visible", event: Object.assign({}, e) });
    });
    const guarded = RO.guardResult({ events: ev, uncertain: unc });
    const all = base.events.concat(guarded.events).sort((a, b) => a.t - b.t);
    const uncertain = base.uncertain.concat(guarded.uncertain).sort((a, b) => a.t - b.t);
    const val = o.validations || {};
    const tag = (e) => { const r = RG.PAR_TYPE[e.type]; return Object.assign({}, e, { regle: r ? r.id : null, regleEtat: r ? RG.etat(r.id, val) : RG.ETAT.NON_VALIDEE }); };
    const tagged = all.map(tag), tu = uncertain.map((u) => Object.assign({}, u, { regle: RG.PAR_TYPE[u.type] ? RG.PAR_TYPE[u.type].id : null }));
    const shown = tagged.filter((e) => e.regleEtat !== RG.ETAT.REJETEE);
    const fiab = base.context && base.context.reliable ? { ballon: base.context.reliable.ratio } : null;
    const couv = RG.couverture({ validations: val, events: tagged, fiabilite: fiab });
    // une règle « non évaluée » (ballon fiable trop rarement) n'affiche aucune erreur
    const off = new Set(couv.filter((r) => r.statut === "non_evalue").map((r) => r.id));
    const events = shown.filter((e) => !off.has(e.regle));
    return Object.assign({}, base, { events, uncertain: tu, couverture: couv, resumeCouverture: RG.resumeCouverture(couv), v2: { regles: Object.keys(val).length, supplementaires: guarded.events.length + guarded.uncertain.length } });
  }

  return { analyze, detectExtra, LIM: { FREE_DIST, PASS_MIN, PASS_MAX, PRESS_DIST, DRIBBLE_MAX, STILL_SPEED, STILL_DUR, SLOW_DUR, SLOW_GAIN, AHEAD, OVERLOAD_R, OVERLOAD_MIN, OVERLOAD_DUR, OVERLOAD_GAIN, GK_HOLD } };
});
