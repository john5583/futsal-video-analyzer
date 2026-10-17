/* Moteur d'analyse tactique : transforme les événements marqués sur la vidéo
   en diagnostic (erreurs hiérarchisées, enchaînements menant aux buts,
   schémas récurrents, solutions et plan d'entraînement).
   Fonctionne dans Node (tests) et dans le navigateur (window.FutsalAnalyzer). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("../knowledge"));
  } else {
    root.FutsalAnalyzer = factory(root.FutsalKB);
  }
})(typeof self !== "undefined" ? self : this, function (KB) {
  "use strict";

  const GOAL_AGAINST = "but_encaisse";
  const GOAL_FOR = "but_marque";
  const CHAIN_WINDOW = 12; // secondes avant un but dans lesquelles on cherche la cause
  const DEDUP_WINDOW = 15; // secondes : un événement BUT_CONTRE et un marqueur de but proches sont le même but

  const errorById = Object.fromEntries(KB.ERRORS.map((e) => [e.id, e]));
  const drillById = Object.fromEntries(KB.DRILLS.map((d) => [d.id, d]));
  const systemById = Object.fromEntries(KB.SYSTEMS.map((s) => [s.id, s]));

  function fmtTime(sec) {
    sec = Math.max(0, Math.round(Number(sec) || 0));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  function periodOf(project, t) {
    const sh = project.secondHalfStart;
    return typeof sh === "number" && isFinite(sh) && t >= sh ? 2 : 1;
  }

  function severityOf(score) {
    if (score >= 15) return "CRITIQUE";
    if (score >= 8) return "MAJEUR";
    return "MINEUR";
  }

  function eventScore(ev, err) {
    const outcome = KB.OUTCOMES[ev.outcome] || KB.OUTCOMES.AUCUN;
    const zone = err.zoneSensitive ? (KB.ZONES[ev.zone] || KB.ZONES.MED).multiplier : 1;
    return err.weight * outcome.multiplier * zone;
  }

  function recurrenceFactor(count) {
    if (count >= 5) return 1.5;
    if (count >= 3) return 1.25;
    return 1;
  }

  function normalise(project) {
    const warnings = [];
    const errors = [];
    const goalsAgainst = [];
    const goalsFor = [];
    const seen = new Set();
    const raw = Array.isArray(project && project.events) ? project.events : [];
    raw.forEach((ev, i) => {
      if (!ev || typeof ev.type !== "string" || !isFinite(Number(ev.t)) || Number(ev.t) < 0) {
        warnings.push("Événement #" + (i + 1) + " ignoré (données invalides).");
        return;
      }
      const e = Object.assign({}, ev, { t: Number(ev.t) });
      if (e.id != null) {
        if (seen.has(e.id)) {
          warnings.push("Événement en double ignoré (" + e.id + ").");
          return;
        }
        seen.add(e.id);
      }
      if (e.type === GOAL_AGAINST) goalsAgainst.push(e);
      else if (e.type === GOAL_FOR) goalsFor.push(e);
      else if (errorById[e.type]) errors.push(e);
      else warnings.push("Type d'événement inconnu ignoré : " + e.type);
    });
    errors.sort((a, b) => a.t - b.t);
    goalsAgainst.sort((a, b) => a.t - b.t);
    goalsFor.sort((a, b) => a.t - b.t);
    return { errors, goalsAgainst, goalsFor, warnings };
  }

  function buildGoals(project, errors, goalsAgainst, goalsFor) {
    const against = goalsAgainst.map((g) => ({ t: g.t, explicit: true, source: g }));
    errors.forEach((e) => {
      if (e.outcome !== "BUT_CONTRE") return;
      const covered = goalsAgainst.some((g) => g.t >= e.t - 1 && g.t <= e.t + DEDUP_WINDOW);
      if (!covered) against.push({ t: e.t, explicit: false, source: e });
    });
    against.sort((a, b) => a.t - b.t);

    let forCount = goalsFor.length;
    errors.forEach((e) => {
      if (e.outcome !== "BUT_POUR") return;
      if (!goalsFor.some((g) => g.t >= e.t - 1 && g.t <= e.t + DEDUP_WINDOW)) forCount += 1;
    });

    const goals = against.map((g) => {
      let candidates;
      if (g.explicit) {
        candidates = errors.filter((e) => e.t <= g.t && g.t - e.t <= CHAIN_WINDOW);
      } else {
        candidates = errors.filter((e) => e.t <= g.t && g.t - e.t <= CHAIN_WINDOW && (e === g.source || e.t < g.t));
      }
      const chain = candidates
        .map((e) => {
          const err = errorById[e.type];
          return { event: e, err, rank: err.weight * (1 - (g.t - e.t) / (CHAIN_WINDOW + 3)) };
        })
        .sort((a, b) => a.event.t - b.event.t);
      let probable = null;
      chain.forEach((c) => {
        if (!probable || c.rank > probable.rank) probable = c;
      });
      return {
        t: g.t,
        period: periodOf(project, g.t),
        explicit: g.explicit,
        chain: chain.map((c) => ({ t: c.event.t, type: c.event.type, label: c.err.label, phase: c.err.phase })),
        probableCause: probable
          ? { type: probable.event.type, label: probable.err.label, phase: probable.err.phase, t: probable.event.t }
          : null
      };
    });
    return { goals, goalsAgainst: against.length, goalsFor: forCount };
  }

  function buildFindings(errors) {
    const groups = {};
    errors.forEach((e) => {
      (groups[e.type] = groups[e.type] || []).push(e);
    });
    return Object.keys(groups)
      .map((type) => {
        const err = errorById[type];
        const evs = groups[type];
        const base = evs.reduce((sum, e) => sum + eventScore(e, err), 0);
        const score = Math.round(base * recurrenceFactor(evs.length) * 10) / 10;
        const worst = evs.reduce((m, e) => Math.max(m, (KB.OUTCOMES[e.outcome] || KB.OUTCOMES.AUCUN).multiplier), 0);
        return {
          type,
          label: err.label,
          phase: err.phase,
          description: err.description,
          count: evs.length,
          score,
          severity: severityOf(score),
          recurrent: evs.length >= 3,
          worstOutcome: Object.keys(KB.OUTCOMES).find((k) => KB.OUTCOMES[k].multiplier === worst) || "AUCUN",
          occurrences: evs.map((e) => ({
            id: e.id, t: e.t, zone: e.zone || null, side: e.side || null, outcome: e.outcome || "AUCUN",
            system: e.system || null, note: e.note || "", thumb: e.thumb || null
          })),
          signs: err.signs,
          causes: err.causes,
          solutions: err.solutions,
          cues: err.cues,
          drills: err.drills.map((id) => drillById[id]).filter(Boolean),
          rules: err.rules
        };
      })
      .sort((a, b) => b.score - a.score || b.count - a.count);
  }

  function pairs(errors, fromTypes, toTypes, window) {
    const out = [];
    errors.forEach((a) => {
      if (!fromTypes.includes(a.type)) return;
      const b = errors.find((x) => x !== a && toTypes.includes(x.type) && x.t >= a.t && x.t - a.t <= window);
      if (b) out.push([a, b]);
    });
    return out;
  }

  function buildPatterns(project, errors, goalsInfo) {
    const patterns = [];
    const add = (p) => patterns.push(p);
    const times = (evs) => evs.map((e) => e.t);

    // 1. Perte de balle puis contre-attaque / repli tardif
    const lossToCounter = pairs(
      errors,
      ["perte_zone_def", "perte_zone_mediane", "relance_risquee", "passe_imprecise", "dribble_excessif"],
      ["contre_attaque_subie", "repli_tardif"],
      10
    );
    if (lossToCounter.length >= 2) {
      add({
        id: "perte_puis_contre", severity: "MAJEUR",
        title: "Pertes de balle suivies d'une contre-attaque",
        text: lossToCounter.length + " pertes de balle ont été suivies, en moins de 10 secondes, d'une contre-attaque ou d'un repli tardif. La sécurité à la perte est le problème central.",
        advice: "Désigner un joueur « sécurisant » à chaque attaque, interdire la passe verticale risquée dans l'axe et travailler le contre-pressing de 5 secondes.",
        times: lossToCounter.map(([a]) => a.t)
      });
    }

    // 2. Pressing battu → espace dans le dos
    const pressBeaten = pairs(errors, ["pressing_desorganise", "equipe_etiree"], ["espace_dos_fixo"], 10);
    if (pressBeaten.length >= 2) {
      add({
        id: "pressing_battu", severity: "MAJEUR",
        title: "Pressing battu puis espace dans le dos de la défense",
        text: pressBeaten.length + " fois, un pressing non coordonné ou une équipe étirée a ouvert l'espace derrière le dernier défenseur.",
        advice: "Fixer des déclencheurs communs de pressing, resserrer les lignes à 8–10 m et faire couvrir le dos du défenseur central par un ailier.",
        times: pressBeaten.map(([a]) => a.t)
      });
    }

    // 3. Baisse de rendement en 2e période
    if (typeof project.secondHalfStart === "number") {
      const p1 = errors.filter((e) => periodOf(project, e.t) === 1);
      const p2 = errors.filter((e) => periodOf(project, e.t) === 2);
      if (p2.length >= 4 && p2.length >= 1.5 * Math.max(1, p1.length)) {
        add({
          id: "baisse_2e_periode", severity: "MAJEUR",
          title: "Baisse de rendement en seconde période",
          text: p2.length + " erreurs en 2e période contre " + p1.length + " en 1re : la concentration ou la condition physique baisse.",
          advice: "Planifier des rotations plus fréquentes, un temps mort stratégique, simplifier le jeu en fin de match et renforcer la condition physique spécifique.",
          times: times(p2)
        });
      }
    }

    // 4. Cumul de fautes
    [1, 2].forEach((p) => {
      const fouls = errors.filter((e) => e.type === "faute_evitable" && periodOf(project, e.t) === p);
      if (fouls.length >= 4) {
        const over = fouls.length >= 6;
        add({
          id: "cumul_fautes_p" + p, severity: over ? "CRITIQUE" : "MAJEUR",
          title: "Cumul de fautes — période " + p,
          text: fouls.length + " fautes évitables en période " + p + (over ? " : au-delà de la 5e faute, chaque coup franc direct est tiré à 10 m sans mur." : " : l'équipe approche du seuil de la 6e faute."),
          advice: "Compter les fautes pendant le match, changer le défenseur qui accumule et jouer sur l'interception plutôt que sur le contact.",
          times: times(fouls)
        });
      }
    });

    // 5. Côté faible
    const sided = errors.filter((e) => ["DEF", "TRANS"].includes(errorById[e.type].phase) && (e.side === "G" || e.side === "D"));
    if (sided.length >= 3) {
      const g = sided.filter((e) => e.side === "G").length;
      const d = sided.length - g;
      const worst = g >= d ? "G" : "D";
      const share = Math.max(g, d) / sided.length;
      if (share >= 0.6) {
        add({
          id: "cote_faible", severity: "MAJEUR",
          title: "Côté faible : " + KB.SIDES[worst].toLowerCase(),
          text: Math.round(share * 100) + " % des erreurs défensives localisées se situent sur le " + KB.SIDES[worst].toLowerCase() + " (" + Math.max(g, d) + " sur " + sided.length + ").",
          advice: "Renforcer ce côté : couverture permanente de l'ailier ou du défenseur central, changement de joueur ou d'organisation sur ce couloir.",
          times: times(sided.filter((e) => e.side === worst))
        });
      }
    }

    // 6. Concentration en zone défensive
    if (errors.length >= 5) {
      const inDef = errors.filter((e) => e.zone === "DEF");
      if (inDef.length / errors.length >= 0.6) {
        add({
          id: "zone_def", severity: "MAJEUR",
          title: "Erreurs concentrées devant son propre but",
          text: inDef.length + " erreurs sur " + errors.length + " (" + Math.round((inDef.length / errors.length) * 100) + " %) surviennent dans le tiers défensif.",
          advice: "Simplifier le jeu dans son tiers (passes latérales, dégagements), sortir proprement avec un triangle de sécurité et s'entraîner à sortir sous pression.",
          times: times(inDef)
        });
      }
    }

    // 7. CPA
    const cpa = errors.filter((e) => errorById[e.type].phase === "CPA");
    if (cpa.length >= 2) {
      add({
        id: "cpa_recurrent", severity: "MAJEUR",
        title: "Coups de pied arrêtés : source récurrente de danger",
        text: cpa.length + " erreurs sur coups de pied arrêtés.",
        advice: "Écrire un schéma par situation (corner, coup franc latéral/central, touche), attribuer les missions et les répéter à chaque séance.",
        times: times(cpa)
      });
    }

    // 8. Gardien-joueur
    const gj = errors.filter((e) => errorById[e.type].phase === "GJ");
    if (gj.length >= 1) {
      add({
        id: "power_play", severity: gj.some((e) => e.outcome === "BUT_CONTRE") ? "CRITIQUE" : "MAJEUR",
        title: "Power play (gardien-joueur) à risque",
        text: gj.length + " erreur(s) en jeu à cinq joueurs de champ" + (gj.some((e) => e.outcome === "BUT_CONTRE") ? ", dont au moins un but encaissé dans la cage vide" : "") + ".",
        advice: "Ne déclencher le power play qu'à des moments prédéfinis, avec un joueur de sécurité désigné et un repli immédiat du gardien à la perte.",
        times: times(gj)
      });
    }

    // 9. Origine dominante des buts encaissés
    const caused = goalsInfo.goals.filter((g) => g.probableCause);
    if (caused.length >= 3) {
      const byPhase = {};
      caused.forEach((g) => { byPhase[g.probableCause.phase] = (byPhase[g.probableCause.phase] || 0) + 1; });
      const top = Object.keys(byPhase).sort((a, b) => byPhase[b] - byPhase[a])[0];
      if (byPhase[top] / caused.length >= 0.5) {
        add({
          id: "origine_buts", severity: "MAJEUR",
          title: "Origine dominante des buts encaissés : " + KB.PHASES[top].label,
          text: byPhase[top] + " buts sur " + caused.length + " (cause identifiée) viennent de cette phase de jeu.",
          advice: "Prioriser le travail à l'entraînement sur cette phase avant toute autre correction.",
          times: caused.filter((g) => g.probableCause.phase === top).map((g) => g.t)
        });
      }
    }

    const rank = { CRITIQUE: 0, MAJEUR: 1, MINEUR: 2 };
    return patterns.sort((a, b) => rank[a.severity] - rank[b.severity]);
  }

  function buildSystemAdvice(project, errors, findings) {
    const used = new Set();
    if (project.defaultSystem && systemById[project.defaultSystem]) used.add(project.defaultSystem);
    errors.forEach((e) => { if (e.system && systemById[e.system]) used.add(e.system); });
    const out = [];
    used.forEach((sid) => {
      const sys = systemById[sid];
      findings.forEach((f) => {
        const relevant = errors.some((e) => e.type === f.type && (e.system || project.defaultSystem) === sid);
        if (relevant && sys.weaknessErrors.includes(f.type) && sys.tips[f.type]) {
          out.push({ system: sid, systemName: sys.name, type: f.type, label: f.label, tip: sys.tips[f.type] });
        }
      });
    });
    return out;
  }

  function buildTrainingPlan(findings) {
    const seen = new Set();
    const plan = [];
    findings.slice(0, 5).forEach((f) => {
      f.drills.forEach((d) => {
        if (seen.has(d.id) || plan.length >= 6) return;
        seen.add(d.id);
        plan.push(Object.assign({}, d, { for: f.label }));
      });
    });
    return plan;
  }

  function analyze(project) {
    project = project || {};
    const { errors, goalsAgainst, goalsFor, warnings } = normalise(project);
    const goalsInfo = buildGoals(project, errors, goalsAgainst, goalsFor);
    const findings = buildFindings(errors);
    const patterns = buildPatterns(project, errors, goalsInfo);

    const byPhase = {};
    Object.keys(KB.PHASES).forEach((p) => { byPhase[p] = 0; });
    errors.forEach((e) => { byPhase[errorById[e.type].phase] += 1; });
    const byPeriod = { 1: 0, 2: 0 };
    errors.forEach((e) => { byPeriod[periodOf(project, e.t)] += 1; });

    const priorities = findings.slice(0, 3).map((f, i) => ({
      rank: i + 1, type: f.type, label: f.label, severity: f.severity, count: f.count,
      action: f.solutions[0], drill: f.drills[0] ? f.drills[0].name : null
    }));

    return {
      summary: {
        totalErrors: errors.length,
        goalsAgainst: goalsInfo.goalsAgainst,
        goalsFor: goalsInfo.goalsFor,
        byPhase,
        byPeriod,
        critical: findings.filter((f) => f.severity === "CRITIQUE").length,
        major: findings.filter((f) => f.severity === "MAJEUR").length,
        minor: findings.filter((f) => f.severity === "MINEUR").length
      },
      findings,
      goals: goalsInfo.goals,
      patterns,
      priorities,
      systemAdvice: buildSystemAdvice(project, errors, findings),
      trainingPlan: buildTrainingPlan(findings),
      warnings
    };
  }

  return { analyze, fmtTime, periodOf, severityOf, GOAL_AGAINST, GOAL_FOR };
});
