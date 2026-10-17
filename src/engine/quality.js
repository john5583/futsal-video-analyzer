/* Contrôle qualité : le programme repère lui-même les situations qui rendent son analyse fragile (ce qu'il ne faut pas faire en filmant ou en
   utilisant le programme) et le dit, chiffres à l'appui, avec ce qu'il faut faire. Il ne corrige rien en cachette : il prévient.
   evaluate : après une analyse. preflight : avant de la lancer. Aucune exception : une entrée vide donne une liste vide. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FutsalQuality = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MIN_FRAMES = 15;          // en dessous, trop peu d'images en jeu pour juger la visibilité
  const COVER_MIN = 0.4;          // part du jeu où les quatre joueurs de champ sont visibles (sinon : terrain mal montré)
  const RELIABLE_MIN = 0.5;       // part du temps où le jeu est en cours ET le ballon visible
  const LOST_MAX = 0.08;          // part du temps où la caméra est perdue
  const BENCH_SEEN_MIN = 20;      // personnes vues le long des lignes de touche à partir de laquelle on parle de banc
  const GK_SIDE = 0.6;            // part des images où le gardien est vu du mauvais côté au-delà de laquelle on soupçonne un camp inversé
  const SECOND_HALF_MIN = 1200;   // s : une analyse de 20 min ou plus couvre probablement les deux mi-temps
  const LOW_RES = 960;            // px de large

  const pct = (v) => Math.round(v * 100) + " %";
  const num = (v) => (typeof v === "number" && isFinite(v) ? v : 0);

  /* opts : { res (FutsalMatch.analyze), ai (project.ai), project, L, videoWidth, openQuestions (nombre), kitWarnings ([texte]) }. */
  function evaluate(opts) {
    const o = opts || {}, res = o.res || {}, ai = o.ai || {}, project = o.project || {}, L = o.L || ai.L || 40;
    const nf = Array.isArray(res.normalized) ? res.normalized : [], states = Array.isArray(res.playStates) ? res.playStates : [];
    const items = [], good = [], m = {};

    // terrain repéré
    if (!Array.isArray(ai.calibrations) || !ai.calibrations.length) items.push({ id: "terrain", level: "attention", title: "Terrain non repéré", detail: "Aucun calibrage : les positions des joueurs ne peuvent pas être placées sur le terrain.", fix: "Repère le but et les lignes dans l'assistant (étape « Terrain »)." });
    else good.push("Terrain repéré");

    // visibilité des quatre joueurs de champ pendant le jeu
    let inPlay = 0, four = 0;
    nf.forEach((f, i) => {
      if ((states[i] || "jeu") !== "jeu") return;
      inPlay++;
      if (f.A.filter((p) => !p.gk && !p.sub).length === 4) four++;
    });
    if (inPlay >= MIN_FRAMES) {
      m.coverage = four / inPlay;
      if (m.coverage < COVER_MIN) items.push({ id: "couverture", level: "attention", title: "Le terrain n'est pas assez visible", detail: "Les quatre joueurs de champ de ton équipe ne sont visibles ensemble que " + pct(m.coverage) + " du temps de jeu (la caméra suit le ballon de près ou coupe le terrain). La forme de l'équipe, la hauteur du bloc et la compacité ne peuvent pas être jugées sérieusement.", fix: "Filme depuis un point haut qui montre tout le terrain (trépied). Sans cela, les consignes de « Mon plan tactique » resteront « indicatives »." });
      else good.push("Les quatre joueurs de champ sont visibles " + pct(m.coverage) + " du temps de jeu");
    }

    // jeu en cours et ballon visible
    const rel = res.context && res.context.reliable;
    if (rel && num(rel.total) > 0) {
      m.reliable = num(rel.ratio);
      if (m.reliable < RELIABLE_MIN) items.push({ id: "ballon", level: "attention", title: "Ballon peu visible ou jeu arrêté", detail: "Seulement " + pct(m.reliable) + " du temps analysé est utilisable (jeu en cours et ballon visible). Le reste est « non analysé » : aucune erreur n'y est cherchée.", fix: "Une caméra plus haute et plus large, sans zoom, aide à voir le ballon ; les questions du programme couvrent les cas incertains." });
      else good.push("Jeu en cours et ballon visible " + pct(m.reliable) + " du temps");
    }

    // caméra perdue
    const span = nf.length > 1 ? nf[nf.length - 1].t - nf[0].t : 0;
    const lostSec = (Array.isArray(ai.lost) ? ai.lost : []).reduce((s, r) => s + (Array.isArray(r) ? Math.max(0, num(r[1]) - num(r[0])) : 0), 0);
    if (span > 0) {
      m.lost = lostSec / span;
      if (m.lost > LOST_MAX) items.push({ id: "camera", level: "attention", title: "Caméra souvent perdue", detail: "Le suivi de la caméra est perdu sur " + Math.round(lostSec) + " s (" + pct(m.lost) + " de l'analyse) : ces images sont ignorées.", fix: "Évite zoom, mouvements brusques et flou ; ajoute un calibrage dans les passages concernés." });
    }

    // banc
    const seen = ai.benchSeen ? num(ai.benchSeen.y0) + num(ai.benchSeen.yW) : 0;
    if (seen >= BENCH_SEEN_MIN && !(Array.isArray(ai.benchZones) && ai.benchZones.length)) items.push({ id: "banc", level: "attention", title: "Remplaçants visibles, banc non marqué", detail: seen + " personnes ont été vues le long des lignes de touche et aucune zone de banc n'est marquée : des remplaçants risquent d'être comptés comme joueurs.", fix: "Marque la zone du banc en 2 clics (réglages avancés) et vérifie le côté des bancs." });

    // gardien vu du mauvais côté : « but défendu » ou 2e période inversés
    let gkN = 0, gkFar = 0;
    nf.forEach((f) => f.A.forEach((p) => { if (p.gk) { gkN++; if (p.x > L / 2) gkFar++; } }));
    if (gkN >= 20) {
      m.gkFar = gkFar / gkN;
      if (m.gkFar > GK_SIDE) items.push({ id: "camp", level: "attention", title: "Ton gardien est vu du mauvais côté", detail: "Ton gardien est vu dans la moitié opposée à celle que tu défends sur " + pct(m.gkFar) + " de ses images : le but défendu, ou le début de la 2e période, est peut-être inversé.", fix: "Revérifie « je défends / j'attaque » à l'étape Terrain et marque le début de la 2e période." });
    }

    // 2e période
    if (span >= SECOND_HALF_MIN && ai.flip && project && typeof project.secondHalfStart !== "number") items.push({ id: "periode", level: "info", title: "Début de la 2e période non marqué", detail: "L'analyse couvre plus de 20 minutes et les camps ne sont pas inversés à la 2e période.", fix: "Clique « Début 2e période » au bon moment." });

    // résolution
    if (num(o.videoWidth) > 0 && o.videoWidth < LOW_RES) items.push({ id: "resolution", level: "info", title: "Vidéo de faible résolution", detail: "La vidéo fait " + Math.round(o.videoWidth) + " px de large : les joueurs lointains et le ballon sont plus difficiles à détecter.", fix: "Filme en 1080p au moins." });

    // tenues
    (Array.isArray(o.kitWarnings) ? o.kitWarnings : []).forEach((w, k) => items.push({ id: "tenues" + k, level: "attention", title: "Tenues difficiles à distinguer", detail: String(w), fix: "Réponds aux questions du programme ; des tenues distinctes aideraient." }));

    // questions en attente
    const q = num(o.openQuestions);
    if (q > 0) items.push({ id: "questions", level: "info", title: q + " question(s) en attente", detail: "Le programme a des doutes qu'il ne tranche pas seul ; sans réponse, ces cas restent « non analysés ».", fix: "Réponds-y dans « Questions du programme » (avec « ▶ Voir dans la vidéo »)." });
    else good.push("Aucune question en attente");

    const level = items.some((i) => i.level === "attention") ? "attention" : "bon";
    return { level, items, good, measures: m };
  }

  /* Avant de lancer l'analyse : ce qui est prêt, ce qui manque. ai : project.ai ; project ; opts : { refs ({A,B}), durationSec }. */
  function preflight(ai, project, opts) {
    const a = ai || {}, o = opts || {}, out = [];
    out.push({ ok: Array.isArray(a.calibrations) && a.calibrations.length > 0, text: "Terrain repéré (but et lignes)", fix: "Repère le terrain à l'étape précédente." });
    out.push({ ok: !!(o.refs && o.refs.A && o.refs.B), text: "Tenues apprises (mon équipe et adversaires)", fix: "Choisis la silhouette de tes joueurs et des adversaires." });
    const benchOk = (Array.isArray(a.benchZones) && a.benchZones.length > 0) || (a.settings && (a.settings.bench === "left" || a.settings.bench === "right"));
    out.push({ ok: !!benchOk, soft: true, text: "Banc des remplaçants marqué ou côté choisi", fix: "Sans cela, le programme déduit le côté des bancs seulement s'il voit assez de remplaçants." });
    const long = num(o.durationSec) >= SECOND_HALF_MIN;
    if (long && a.flip) out.push({ ok: !!(project && typeof project.secondHalfStart === "number"), soft: true, text: "Début de la 2e période marqué", fix: "Clique « Début 2e période » sous la vidéo." });
    return out;
  }

  return { evaluate, preflight, COVER_MIN, RELIABLE_MIN, LOST_MAX, BENCH_SEEN_MIN, GK_SIDE };
});
