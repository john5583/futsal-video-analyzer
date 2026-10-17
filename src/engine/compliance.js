/* Conformité au plan tactique : compare ce que le programme a MESURÉ sur le match au plan voulu par l'entraîneur.
   Entrée : le plan (réponses du questionnaire) et le résultat de FutsalMatch.analyze (images normalisées « mon équipe A attaque vers
   x croissant », possession, état du jeu). Sortie : pour chaque consigne vérifiable, la part du temps analysé où elle est respectée,
   et la liste des moments où elle ne l'est pas (« à éviter ») avec ce qu'il faudrait faire (« à faire »).
   Rien n'est évalué quand le jeu est arrêté ou que le ballon n'est pas visible ; une consigne que le programme ne peut pas vérifier
   (score, sortie de balle, rôles individuels) est dite « non évaluée », jamais devinée. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../knowledge"));
  else root.FutsalCompliance = factory(root.FutsalKB);
})(typeof self !== "undefined" ? self : this, function (KB) {
  "use strict";

  const GAP = 3.5;                   // m : deux joueurs consécutifs (triés par x) séparés d'au moins cet écart sont dans deux lignes
  const MIN_RUN = 4;                 // s : un écart ne compte que s'il dure au moins ce temps (les formes changent sans cesse)
  const GK_RUN = 3;                  // s : gardien monté
  const TRANS = 2;                   // s : après un changement de possession, la structure n'est pas jugée (transition naturelle)
  const BLOC = { haut: [0.45, 1], median: [0.30, 0.55], bas: [0, 0.38] };   // hauteur du bloc, en part de la longueur du terrain
  const BLOC_TOL = 1.5;              // m de tolérance
  const COMPACT_MAX = { serree: 9, normale: 13 };   // m : profondeur maximale (joueur le plus haut - le plus bas)
  const PRESS_DIST = 3, PRESS_WINDOW = 5;           // m, s : un joueur à 3 m du porteur dans les 5 s qui suivent une perte
  const GK_LINE = 0.55;              // part de la longueur au-delà de laquelle le gardien est « monté »
  const LABEL = {
    forme: "Respect du système de jeu", bloc: "Hauteur du bloc quand l'adversaire a le ballon", compact: "Compacité du bloc",
    pressing: "Pressing après une perte de balle", pertes: "Pertes de balle en zone défensive", gardien: "Gardien-joueur"
  };

  const fmt = (t) => { const s = Math.max(0, Math.round(t)); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };
  const r1 = (v) => String(Math.round(v * 10) / 10).replace(".", ",");
  const systemOf = (id) => (KB.SYSTEMS || []).find((s) => s.id === id) || { id, name: id, structure: "" };

  /* Indice de ligne attendu pour chaque rang (joueur trié par x croissant) : [3, 1] -> [0, 0, 0, 1]. */
  const expectedIdx = (counts) => counts.reduce((a, c, i) => a.concat(new Array(c).fill(i)), []);
  /* Lignes observées : nombre de joueurs par ligne (triés par x, séparation à partir de GAP m) et indice de ligne de chaque rang. */
  function observed(sortedX) {
    const idx = [];
    let line = 0;
    sortedX.forEach((x, i) => { if (i && x - sortedX[i - 1] >= GAP) line++; idx.push(line); });
    const counts = new Array(line + 1).fill(0);
    idx.forEach((l) => counts[l]++);
    return { idx, counts };
  }
  /* Nombre de rangs dont la ligne observée n'est pas celle attendue ; null si le nombre de joueurs ne correspond pas. */
  function shapeMismatch(sortedX, expected) {
    const e = expectedIdx(expected);
    if (e.length !== sortedX.length) return null;
    const o = observed(sortedX);
    return { mismatch: o.idx.reduce((n, l, i) => n + (l !== e[i] ? 1 : 0), 0), counts: o.counts };
  }

  /* Suites d'images consécutives où ok === false, de durée >= minDur : [{ i0, i1, dur, worst }]. */
  function badRuns(series, minDur) {
    const out = [];
    let cur = null;
    series.forEach((s) => {
      if (s.ok === false) {
        if (cur && s.t - cur.t1 <= 1.5) { cur.t1 = s.t; cur.dur += s.dt; cur.n.push(s); }
        else { cur = { t0: s.t, t1: s.t, dur: s.dt, n: [s] }; out.push(cur); }
      } else if (s.ok === true) cur = null;
    });
    return out.filter((r) => r.dur >= minDur).map((r) => {
      const worst = r.n.reduce((b, s) => (s.badness > b.badness ? s : b), r.n[0]);
      return { t0: r.t0, t1: r.t1, dur: r.dur, worst };
    });
  }

  function statusOf(share) { return share >= 0.8 ? "ok" : share >= 0.6 ? "attention" : "ecart"; }
  /* Trop peu d'images exploitables pour conclure : la consigne est jugée « indicative », jamais « écart » en rouge sur quelques secondes
     (la caméra suit le ballon : souvent, les quatre joueurs de champ ne sont pas tous visibles en même temps). */
  const MIN_EVAL = 15, MIN_COVER = 0.25;
  const severity = (dur) => (dur >= 8 ? 3 : dur >= 5 ? 2 : 1);

  /* plan : { system, defense, compact, pressing, noLossOwnZone, flyingGK } ; res : résultat de FutsalMatch.analyze ;
     opts : { L, W }. */
  function evaluate(plan, res, opts) {
    const L = (opts && opts.L) || 40;
    const nf = (res && res.normalized) || [];
    if (!plan || !nf.length) return { ok: false, reason: nf.length ? "Pas de plan" : "Pas d'analyse vidéo", rules: [], deviations: [], notEvaluated: [] };
    const poss = res.possession || [], states = res.playStates || [];
    const steps = []; for (let i = 1; i < nf.length; i++) steps.push(nf[i].t - nf[i - 1].t);
    const step = steps.length ? steps.slice().sort((a, b) => a - b)[steps.length >> 1] : 0.5;
    const dtOf = (i) => (i + 1 < nf.length ? Math.min(Math.max(0, nf[i + 1].t - nf[i].t), 1.0) : step);
    const sys = systemOf(plan.system), shape = KB.PLAN_SHAPES && KB.PLAN_SHAPES[plan.system], gkSys = !!(KB.PLAN_GK_SYSTEMS && KB.PLAN_GK_SYSTEMS[plan.system]);

    // transition : instant depuis lequel la possession a changé d'équipe
    const sinceChange = new Array(nf.length).fill(Infinity);
    let cur = null, lastChange = -Infinity;
    nf.forEach((f, i) => {
      const t = poss[i] ? poss[i].team : null;
      if (t && cur && t !== cur) lastChange = f.t;
      if (t) cur = t;
      sinceChange[i] = f.t - lastChange;
    });

    const series = { forme: [], bloc: [], compact: [], gardien: [] };
    let inPlaySec = 0;
    nf.forEach((f, i) => {
      if ((states[i] || "jeu") !== "jeu") return;
      const dt = dtOf(i);
      inPlaySec += dt;
      const field = f.A.filter((p) => !p.gk && !p.sub), gk = f.A.find((p) => p.gk), opp = poss[i] && poss[i].team === "B";
      const settled = sinceChange[i] >= TRANS;
      // forme : à quatre joueurs de champ (ou cinq avec le gardien monté pour les systèmes « gardien-joueur »)
      if (shape && settled) {
        let xs = null;
        if (gkSys) { if (gk && gk.x > 0.4 * L && field.length === 4) xs = field.concat([gk]).map((p) => p.x).sort((a, b) => a - b); }
        else if (field.length === 4) xs = field.map((p) => p.x).sort((a, b) => a - b);
        const m = xs ? shapeMismatch(xs, shape) : null;
        if (m) series.forme.push({ t: f.t, dt, ok: m.mismatch === 0, badness: m.mismatch, info: { counts: m.counts } });
      }
      if (field.length >= 3 && opp && settled) {
        const xs = field.map((p) => p.x), mean = xs.reduce((a, b) => a + b, 0) / xs.length;
        const r = BLOC[plan.defense];
        if (r) {
          const lo = r[0] * L - BLOC_TOL, hi = r[1] * L + BLOC_TOL, off = mean < lo ? lo - mean : mean > hi ? mean - hi : 0;
          series.bloc.push({ t: f.t, dt, ok: off === 0, badness: off, info: { mean, dir: mean < lo ? "bas" : "haut", target: r } });
        }
        const maxD = COMPACT_MAX[plan.compact];
        if (maxD) {
          const depth = Math.max(...xs) - Math.min(...xs);
          series.compact.push({ t: f.t, dt, ok: depth <= maxD, badness: depth - maxD, info: { depth, maxD } });
        }
      }
      if (gk && plan.flyingGK === "jamais") series.gardien.push({ t: f.t, dt, ok: gk.x <= GK_LINE * L, badness: gk.x - GK_LINE * L, info: { x: gk.x } });
    });

    const rules = [], deviations = [], notEvaluated = [];
    const sumOk = (s) => ({ ev: s.reduce((a, x) => a + x.dt, 0), ok: s.filter((x) => x.ok).reduce((a, x) => a + x.dt, 0) });
    const addRule = (id, planText, s, extra) => {
      const t = sumOk(s);
      if (t.ev <= 0) { notEvaluated.push({ label: LABEL[id], why: "aucune image exploitable (jeu arrêté, ballon non visible ou trop peu de joueurs)" }); return; }
      const share = t.ok / t.ev, coverage = inPlaySec > 0 ? t.ev / inPlaySec : 0, weak = t.ev < MIN_EVAL || coverage < MIN_COVER;
      rules.push(Object.assign({ id, label: LABEL[id], plan: planText, evaluated: Math.round(t.ev * 10) / 10, respected: Math.round(t.ok * 10) / 10, share: Math.round(share * 100) / 100, coverage: Math.round(coverage * 100) / 100, status: weak ? "indicatif" : statusOf(share) }, extra || {}));
    };

    // 1. forme
    if (shape) {
      const nearEv = series.forme.reduce((a, x) => a + x.dt, 0), nearOk = series.forme.filter((x) => x.badness <= 1).reduce((a, x) => a + x.dt, 0);
      addRule("forme", "Système " + sys.name + " (lignes séparées à partir de " + r1(GAP) + " m d'écart)", series.forme, { near: nearEv ? Math.round((nearOk / nearEv) * 100) / 100 : 0 });
      badRuns(series.forme, MIN_RUN).forEach((r) => {
        const o = r.worst.info.counts.join("-"), want = shape.join("-");
        deviations.push({
          rule: "forme", type: "plan_forme", t: r.worst.t, t0: r.t0, t1: r.t1, dur: r.dur, severity: severity(r.dur),
          avoid: "Forme " + o + " pendant " + Math.round(r.dur) + " s (de " + fmt(r.t0) + " à " + fmt(r.t1) + ") au lieu du " + want + " voulu.",
          todo: "Reprendre la structure " + want + (sys.structure ? " : " + sys.structure : "") + ". Un joueur doit changer de ligne pour retrouver " + want + ".",
          data: { expected: shape, observed: r.worst.info.counts }
        });
      });
    }
    // 2. hauteur du bloc
    if (BLOC[plan.defense]) {
      const names = { haut: "haut", median: "médian", bas: "bas" }, r = BLOC[plan.defense];
      addRule("bloc", "Bloc " + names[plan.defense] + " (entre " + r1(r[0] * L) + " et " + r1(r[1] * L) + " m de ton but)", series.bloc);
      badRuns(series.bloc, MIN_RUN).forEach((run) => {
        const w = run.worst.info, tooLow = w.dir === "bas", move = Math.max(1, Math.round(run.worst.badness));
        deviations.push({
          rule: "bloc", type: "plan_bloc", t: run.worst.t, t0: run.t0, t1: run.t1, dur: run.dur, severity: severity(run.dur),
          avoid: "Bloc " + (tooLow ? "trop bas" : "trop haut") + " pendant " + Math.round(run.dur) + " s (de " + fmt(run.t0) + " à " + fmt(run.t1) + ") : " + r1(w.mean) + " m de ton but en moyenne, alors que ton plan demande un bloc " + names[plan.defense] + ".",
          todo: (tooLow ? "Faire monter" : "Faire reculer") + " tout le bloc d'environ " + move + " m dès que l'adversaire a le ballon, en gardant les distances entre joueurs.",
          data: { mean: w.mean, target: w.target, dir: w.dir, shift: tooLow ? move : -move }
        });
      });
    }
    // 3. compacité
    if (COMPACT_MAX[plan.compact]) {
      addRule("compact", "Profondeur de " + COMPACT_MAX[plan.compact] + " m au plus entre le joueur le plus haut et le plus bas", series.compact);
      badRuns(series.compact, MIN_RUN).forEach((run) => {
        const w = run.worst.info;
        deviations.push({
          rule: "compact", type: "plan_etire", t: run.worst.t, t0: run.t0, t1: run.t1, dur: run.dur, severity: severity(run.dur),
          avoid: "Bloc étiré : " + r1(w.depth) + " m entre le joueur le plus haut et le plus bas pendant " + Math.round(run.dur) + " s (de " + fmt(run.t0) + " à " + fmt(run.t1) + "), pour " + w.maxD + " m voulus.",
          todo: "Resserrer les lignes : le joueur le plus haut redescend (ou le plus bas remonte) pour tenir " + w.maxD + " m au plus entre eux.",
          data: { depth: w.depth, max: w.maxD }
        });
      });
    }
    // 4. pressing après une perte
    if (plan.pressing === "oui" && plan.defense !== "bas") {
      const losses = [];
      for (let i = 1; i < nf.length; i++) {
        if (!(poss[i - 1] && poss[i] && poss[i - 1].team === "A" && poss[i].team === "B")) continue;
        if ((states[i] || "jeu") !== "jeu") continue;
        let pressed = false, withBall = 0, total = 0, stopped = false, last = i, bestD = Infinity, bestF = null;
        for (let j = i; j < nf.length && nf[j].t - nf[i].t <= PRESS_WINDOW; j++) {
          last = j; total++;
          if ((states[j] || "jeu") === "arret") { stopped = true; break; }
          const b = nf[j].ball;
          if (!b) continue;
          withBall++;
          nf[j].A.filter((p) => !p.gk && !p.sub).forEach((p) => { const d = Math.hypot(p.x - b.x, p.y - b.y); if (d < bestD) { bestD = d; bestF = nf[j]; } if (d <= PRESS_DIST) pressed = true; });
        }
        if (stopped || nf[last].t - nf[i].t < PRESS_WINDOW - 1 || withBall < total * 0.5) continue;       // fenêtre incomplète ou ballon peu visible : non jugé
        losses.push({ t: nf[i].t, pressed, bestD, frame: nf[i] });
      }
      const ev = losses.length, okN = losses.filter((l) => l.pressed).length;
      if (ev) {
        rules.push({ id: "pressing", label: LABEL.pressing, plan: "Un joueur à " + PRESS_DIST + " m du porteur dans les " + PRESS_WINDOW + " s après la perte", evaluated: ev, respected: okN, share: Math.round((okN / ev) * 100) / 100, status: ev < 3 ? "indicatif" : statusOf(okN / ev), unit: "pertes" });
        losses.filter((l) => !l.pressed).forEach((l) => {
          deviations.push({
            rule: "pressing", type: "plan_pressing", t: l.t, t0: l.t, t1: l.t + PRESS_WINDOW, dur: PRESS_WINDOW, severity: 2,
            avoid: "Perte de balle à " + fmt(l.t) + " sans pressing : le joueur le plus proche reste à " + r1(l.bestD) + " m du ballon pendant les " + PRESS_WINDOW + " s qui suivent (voulu : " + PRESS_DIST + " m).",
            todo: "Dès la perte, le joueur le plus proche ferme le porteur à moins de " + PRESS_DIST + " m pendant que les autres se resserrent derrière lui.",
            data: {}
          });
        });
      } else notEvaluated.push({ label: LABEL.pressing, why: "aucune perte de balle exploitable (ballon peu visible ou jeu arrêté après la perte)" });
    }
    // 5. pertes de balle en zone défensive (erreurs déjà mesurées, hors ballon non fiable)
    if (plan.noLossOwnZone === "oui") {
      const losses = (res.events || []).filter((e) => e.type === "perte_zone_def");
      const err = (KB.ERRORS || []).find((e) => e.id === "perte_zone_def");
      rules.push({ id: "pertes", label: LABEL.pertes, plan: "Aucune perte de balle près de ton but", evaluated: losses.length, respected: 0, count: losses.length, share: losses.length ? 0 : 1, status: losses.length === 0 ? "ok" : losses.length < 3 ? "attention" : "ecart", unit: "pertes" });
      losses.forEach((e) => {
        deviations.push({
          rule: "pertes", type: "perte_zone_def", t: e.t, t0: e.t, t1: e.t + 3, dur: 3, severity: 3,
          avoid: "Perte de balle dans ta zone défensive à " + fmt(e.t) + ". " + (e.note || ""),
          todo: (err && err.solutions && err.solutions[0]) || "Sécuriser la première passe et soutenir le porteur.",
          data: { event: e }
        });
      });
    }
    // 6. gardien-joueur
    if (plan.flyingGK === "jamais") {
      addRule("gardien", "Gardien dans sa zone (jamais au-delà de " + r1(GK_LINE * L) + " m)", series.gardien);
      badRuns(series.gardien, GK_RUN).forEach((run) => {
        deviations.push({
          rule: "gardien", type: "plan_gardien", t: run.worst.t, t0: run.t0, t1: run.t1, dur: run.dur, severity: severity(run.dur),
          avoid: "Gardien monté pendant " + Math.round(run.dur) + " s (de " + fmt(run.t0) + " à " + fmt(run.t1) + ") alors que ton plan l'interdit.",
          todo: "Le gardien reste dans sa zone et relance de là ; un joueur de champ fait le surnombre à sa place.",
          data: { x: run.worst.info.x }
        });
      });
    } else if (plan.flyingGK === "derriere") {
      notEvaluated.push({ label: LABEL.gardien, why: "ton plan dit « seulement quand on est menés » : le programme ne lit pas le score, il ne peut donc pas juger si une montée du gardien était justifiée" });
    }

    deviations.sort((a, b) => b.severity - a.severity || a.t - b.t);
    (KB.PLAN_NOT_EVALUATED || []).forEach((n) => notEvaluated.push(n));
    const total = Math.max(0, nf[nf.length - 1].t - nf[0].t);
    return { ok: true, plan, system: sys, analysed: { sec: Math.round(inPlaySec * 10) / 10, total: Math.round(total * 10) / 10, ratio: total ? Math.round((inPlaySec / total) * 100) / 100 : 0 }, rules, deviations, notEvaluated };
  }

  return { evaluate, shapeMismatch, observed, expectedIdx, badRuns, GAP, MIN_RUN, BLOC, COMPACT_MAX, PRESS_DIST, PRESS_WINDOW, GK_LINE, LABEL };
});
