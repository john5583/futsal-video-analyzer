/* Génération du rapport d'analyse en HTML autonome (affichage, export HTML et PDF). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./knowledge"), require("./engine/analyzer"), require("./anim/registry"), require("./anim/engine"));
  } else {
    root.FutsalReport = factory(root.FutsalKB, root.FutsalAnalyzer, root.FutsalScenes, root.FutsalAnim);
  }
})(typeof self !== "undefined" ? self : this, function (KB, A, SC, E) {
  "use strict";

  const esc = (v) => String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const SEV = { CRITIQUE: "Critique", MAJEUR: "Majeur", MINEUR: "Mineur" };
  const list = (items) => "<ul>" + items.map((i) => "<li>" + esc(i) + "</li>").join("") + "</ul>";


  /* Trois images de la correction animée : erreur, correction, consigne. */
  function correctionFrames(errorId) {
    const sc = SC && SC.forError(errorId);
    if (!sc) return "";
    const titles = { erreur: "Erreur observée", correction: "Correction", consigne: "Consigne" };
    return "<div class=\"snaps\">" + sc.steps.map((st) =>
      "<figure class=\"snap\">" + SC.snapshotSVG(sc, Math.max(st.t0, st.t1 - 0.1), 420) + "<figcaption>" + esc(titles[st.badge] || st.badge) + "</figcaption></figure>").join("") + "</div>";
  }

  function drillFrame(drillId) {
    const sc = SC && SC.forDrill(drillId);
    return sc ? "<div class=\"snap\">" + SC.snapshotSVG(sc, Math.min(sc.duration - 0.2, 5.5), 380) + "</div>" : "";
  }

  function aiSection(project) {
    const ai = project.ai;
    if (!ai || !ai.stats) return "";
    const st = ai.stats;
    let h = "<h2>Analyse vidéo par IA</h2>";
    h += "<div class=\"cards\">" +
      (st.possession && st.possession.known ? card("Possession (mon équipe)", st.possession.A + " %") + card("Possession (adversaire)", st.possession.B + " %") + (st.possession.deduced ? card("Dont ballon tenu déduit (non vu)", st.possession.deduced + " %") : "") : "") +
      (st.shape ? card("Profondeur moyenne", st.shape.depth + " m") + card("Largeur moyenne", st.shape.width + " m") : "") +
      card("Erreurs suggérées (à valider)", (ai.suggestedEvents || []).length) + "</div>";
    if ((ai.suggestedEvents || []).length) h += "<p class=\"note\"><b>" + ai.suggestedEvents.length + " erreur(s) détectée(s) par l'IA attendent votre validation</b> : elles ne sont pas encore comptées dans le diagnostic ni dans les corrections. Retournez dans « Analyse vidéo → 4. Résultats » et cliquez sur « Tout accepter » (ou validez-les une par une).</p>";
    if (!(st.possession && st.possession.known)) h += "<p class=\"empty\">Le ballon n'a pas été détecté de façon fiable : la possession et les pertes de balle ne sont pas calculées.</p>";
    if (st.heat && E) {
      h += "<h3>Zones occupées par mon équipe (joueurs de champ)</h3><div class=\"snap wide\">" + E.opsToSVG(E.liveOps(null, { heat: st.heat }), 760, E.COURT_VIEW) + "</div><p class=\"meta\">Mon équipe attaque vers la droite. Rouge : zone très fréquentée ; bleu : peu fréquentée.</p>";
    }
    const mine = (st.players || []).filter((p) => p.team === "A" || p.team === "B");
    if (mine.length) {
      h += "<table><thead><tr><th>Joueur (piste)</th><th>Équipe</th><th>Distance</th><th>Position moyenne</th><th>Présence</th></tr></thead><tbody>" +
        mine.sort((a, b) => (a.team + a.id).localeCompare(b.team + b.id)).map((p) => "<tr><td>#" + esc(p.id) + (p.gk ? " (gardien)" : "") + "</td><td>" + (p.team === "A" ? "Mon équipe" : "Adversaire") + "</td><td>" + p.distance + " m</td><td>" + p.avgX + " m / " + p.avgY + " m</td><td>" + Math.round(p.presence * 100) + " %</td></tr>").join("") + "</tbody></table>";
    }
    return h;
  }

  function actionPlan(analysis) {
    if (!analysis.findings.length) return "";
    let h = "<h2>Plan d'action pour les prochains matchs</h2><table><thead><tr><th>À corriger</th><th>Comment</th><th>Exercice</th><th>Objectif au prochain match</th></tr></thead><tbody>";
    analysis.findings.slice(0, 8).forEach((f) => {
      const goal = f.severity === "CRITIQUE" ? 0 : Math.max(0, Math.floor(f.count / 2));
      h += "<tr><td><strong>" + esc(f.label) + "</strong><br><span class=\"badge " + f.severity + "\">" + SEV[f.severity] + "</span> " + f.count + " fois</td><td>" + esc(f.solutions[0]) + "</td><td>" + esc(f.drills[0] ? f.drills[0].name : "") + "</td><td>" + (goal === 0 ? "Aucune occurrence" : "Au plus " + goal + " occurrence(s)") + "</td></tr>";
    });
    return h + "</tbody></table>";
  }

  function body(project, analysis) {
    const s = analysis.summary;
    const title = project.name || "Analyse de match";
    const vs = [project.teamName, project.opponentName].filter(Boolean).map(esc).join(" — ");
    let h = "";
    h += "<header class=\"rep-head\"><h1>" + esc(title) + "</h1>" + (vs ? "<p class=\"sub\">" + vs + "</p>" : "") +
      (project.defaultSystem ? "<p class=\"sub\">Système de jeu : " + esc(project.defaultSystem) + "</p>" : "") + "</header>";

    // analyse IA inutilisable (presque rien analysé) : un « 0 » plus bas ne doit pas se lire comme « aucune erreur »
    const qual = project.ai && project.ai.quality, blocking = qual && Array.isArray(qual.items) ? qual.items.find((i) => i && i.blocking) : null;
    if (blocking) h += "<p class=\"empty\"><strong>" + esc(blocking.title) + "</strong> — " + esc(blocking.detail) + "</p>";

    h += "<section class=\"cards\">" +
      card("Erreurs relevées", s.totalErrors) + card("Buts encaissés", s.goalsAgainst) + card("Buts marqués", s.goalsFor) +
      card("Critiques", s.critical, "crit") + card("Majeures", s.major, "maj") + card("Mineures", s.minor) + "</section>";

    if (!s.totalErrors && !s.goalsAgainst) {
      h += "<p class=\"empty\">Aucun événement marqué. Ajoutez des événements sur la vidéo ou lancez l'analyse IA pour générer un diagnostic.</p>";
      return h + aiSection(project);
    }

    h += "<h2>Priorités de travail</h2>";
    if (analysis.priorities.length) {
      h += "<ol class=\"prio\">" + analysis.priorities.map((p) =>
        "<li><strong>" + esc(p.label) + "</strong> <span class=\"badge " + p.severity + "\">" + SEV[p.severity] + "</span> — " + p.count + " occurrence(s)<br><em>Action : " + esc(p.action) + "</em>" +
        (p.drill ? "<br>Exercice : " + esc(p.drill) : "") + "</li>").join("") + "</ol>";
    } else h += "<p class=\"empty\">Aucune erreur relevée.</p>";

    if (analysis.patterns.length) {
      h += "<h2>Schémas récurrents détectés</h2>";
      analysis.patterns.forEach((p) => {
        h += "<div class=\"pattern " + p.severity + "\"><h3>" + esc(p.title) + " <span class=\"badge " + p.severity + "\">" + SEV[p.severity] + "</span></h3><p>" + esc(p.text) + "</p><p><strong>Solution :</strong> " + esc(p.advice) + "</p><p class=\"times\">Minutages : " + p.times.map((t) => A.fmtTime(t)).join(", ") + "</p></div>";
      });
    }

    if (analysis.goals.length) {
      h += "<h2>Analyse des buts encaissés</h2>";
      analysis.goals.forEach((g) => {
        h += "<div class=\"goal\"><h3>But à " + A.fmtTime(g.t) + " (période " + g.period + ")</h3>";
        if (g.chain.length) {
          h += "<ol class=\"chain\">" + g.chain.map((c) => "<li>" + A.fmtTime(c.t) + " — " + esc(c.label) + "</li>").join("") + "</ol>";
          if (g.probableCause) h += "<p><strong>Cause probable :</strong> " + esc(g.probableCause.label) + " (" + esc(KB.PHASES[g.probableCause.phase].label) + ")</p>";
        } else h += "<p class=\"empty\">Aucune erreur marquée dans les " + 12 + " secondes précédentes : ajouter les erreurs manquantes pour identifier la cause.</p>";
        h += "</div>";
      });
    }

    h += actionPlan(analysis);
    h += aiSection(project);
    h += "<h2>Erreurs tactiques et solutions</h2>";
    analysis.findings.forEach((f) => {
      h += "<article class=\"finding\"><h3>" + esc(f.label) + " <span class=\"badge " + f.severity + "\">" + SEV[f.severity] + "</span>" +
        (f.recurrent ? " <span class=\"badge REC\">Récurrent</span>" : "") + "</h3>" +
        "<p class=\"meta\">" + esc(KB.PHASES[f.phase].label) + " — " + f.count + " occurrence(s) — score " + f.score + "</p>" +
        "<p>" + esc(f.description) + "</p>" +
        "<div class=\"cols\"><div><h4>Causes probables</h4>" + list(f.causes) + "</div><div><h4>Solutions à mettre en place</h4>" + list(f.solutions) + "</div></div>" +
        "<h4>Consignes à donner aux joueurs</h4>" + list(f.cues) +
        "<h4>Exercices recommandés</h4>" + list(f.drills.map((d) => d.name + " (" + d.duration + " min) — " + d.goal)) +
        "<h4>La correction en vue de dessus</h4>" + correctionFrames(f.type) +
        "<h4>Occurrences</h4><div class=\"occ\">" + f.occurrences.map((o) =>
          "<figure>" + (o.thumb ? "<img alt=\"\" src=\"" + esc(o.thumb) + "\">" : "") + "<figcaption><strong>" + A.fmtTime(o.t) + "</strong>" +
          (o.zone ? " · " + esc((KB.ZONES[o.zone] || {}).label || o.zone) : "") + (o.outcome && o.outcome !== "AUCUN" ? " · " + esc((KB.OUTCOMES[o.outcome] || {}).label || o.outcome) : "") +
          (o.note ? "<br>" + esc(o.note) : "") + "</figcaption></figure>").join("") + "</div></article>";
    });

    if (analysis.systemAdvice.length) {
      h += "<h2>Conseils liés au système de jeu</h2>" + list(analysis.systemAdvice.map((a) => a.systemName + " — " + a.label + " : " + a.tip));
    }
    if (analysis.trainingPlan.length) {
      h += "<h2>Plan d'entraînement proposé</h2><table><thead><tr><th>Exercice</th><th>Objectif</th><th>Durée</th><th>Joueurs</th><th>Corrige</th></tr></thead><tbody>" +
        analysis.trainingPlan.map((d) => "<tr><td><strong>" + esc(d.name) + "</strong><br><small>" + esc(d.description) + "</small>" + drillFrame(d.id) + "</td><td>" + esc(d.goal) + "</td><td>" + d.duration + " min</td><td>" + esc(d.players) + "</td><td>" + esc(d.for) + "</td></tr>").join("") + "</tbody></table>";
    }
    return h;
  }

  function card(label, value, cls) {
    return "<div class=\"card " + (cls || "") + "\"><div class=\"v\">" + esc(value) + "</div><div class=\"l\">" + esc(label) + "</div></div>";
  }

  const CSS = "body{font-family:Segoe UI,Arial,sans-serif;color:#0f172a;margin:0;padding:24px;line-height:1.45;background:#fff}h1{margin:0 0 4px;font-size:26px}h2{border-bottom:2px solid #2563eb;padding-bottom:4px;margin-top:28px;font-size:19px}h3{margin:0 0 6px;font-size:16px}h4{margin:12px 0 4px;font-size:13px;text-transform:uppercase;color:#475569}.sub{margin:0;color:#475569}.cards{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0}.card{border:1px solid #cbd5e1;border-radius:8px;padding:10px 14px;min-width:100px}.card .v{font-size:24px;font-weight:700}.card .l{font-size:12px;color:#475569}.card.crit .v{color:#b91c1c}.card.maj .v{color:#b45309}.badge{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;color:#fff;vertical-align:middle}.badge.CRITIQUE{background:#b91c1c}.badge.MAJEUR{background:#d97706}.badge.MINEUR{background:#64748b}.badge.REC{background:#4f46e5}.pattern,.goal,.finding{border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;margin:10px 0;break-inside:avoid}.pattern.CRITIQUE{border-left:5px solid #b91c1c}.pattern.MAJEUR{border-left:5px solid #d97706}.meta,.times{color:#64748b;font-size:12px}.cols{display:flex;gap:20px}.cols>div{flex:1}ul,ol{margin:4px 0 4px 18px;padding:0}.occ{display:flex;flex-wrap:wrap;gap:8px}figure{margin:0;width:170px;font-size:11px}figure img{width:100%;border-radius:4px;display:block}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f1f5f9}.empty{color:#64748b;font-style:italic}footer{margin-top:30px;font-size:11px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:8px}.snaps{display:flex;flex-wrap:wrap;gap:8px}.snap{margin:6px 0}.snap svg{width:100%;height:auto;display:block;border-radius:6px}.snaps .snap{flex:1;min-width:210px;max-width:33%}.snap.wide{max-width:760px}figcaption{font-size:11px;color:#475569;margin-top:2px}@media print{body{padding:0}.finding{page-break-inside:avoid}}";

  function build(project, analysis, opts) {
    opts = opts || {};
    const date = opts.date || "";
    return "<!doctype html><html lang=\"fr\"><head><meta charset=\"utf-8\"><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data:; style-src 'unsafe-inline'\"><title>" +
      esc((project && project.name) || "Rapport d'analyse futsal") + "</title><style>" + CSS + "</style></head><body>" +
      body(project || {}, analysis) + "<footer>Rapport généré par Futsal Analyzer" + (date ? " le " + esc(date) : "") + ". Les propositions sont des pistes issues d'une base de connaissances ; le coach reste seul juge.</footer></body></html>";
  }

  function fragment(project, analysis) {
    return body(project || {}, analysis);
  }

  return { build, fragment, esc, CSS };
});
