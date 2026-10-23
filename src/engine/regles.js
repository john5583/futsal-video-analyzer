/* Catalogue des 32 règles d'erreurs de coach (voir docs/connaissances-tactiques.md), état de validation et rapport de couverture.
   Pur, sans écran. Une règle est :
   - « codée »     : le programme sait la mesurer (avec ses seuils, écrits ici en clair) ;
   - « non codée » : affichée « non évalué » avec sa RAISON, jamais passée sous silence.
   Validation par le coach (état enregistré dans le projet) : « validée » (utilisée), « rejetée » (jamais utilisée), « non validée »
   (utilisée mais toujours marquée « règle non validée » tant que le coach n'a pas tranché). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FutsalRegles = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const ETAT = { VALIDEE: "validee", REJETEE: "rejetee", NON_VALIDEE: "non_validee" };
  const FIABLE_MIN = 0.25;      // en dessous, une règle qui dépend du ballon est « non évaluée » (ballon fiable sur moins du quart du temps de jeu)

  /* [id, type d'évènement (id du catalogue d'erreurs), titre, phase, codée, exige, seuils ou raison]
     exige : « ballon » = exige un ballon fiable ; « positions » = positions des joueurs ; « gardien » = gardien identifié. */
  const L = [
    ["R01", "perte_zone_def", "Perte de balle en zone défensive", "OFF", true, ["ballon", "positions"], "L'adversaire garde le ballon au moins 1,0 s ; mon équipe l'avait au moins 1,0 s ; ballon dans le tiers défensif."],
    ["R02", "perte_zone_mediane", "Perte de balle en zone médiane", "OFF", true, ["ballon", "positions"], "Même mesure que R01, ballon dans le tiers médian."],
    ["R03", "perte_inutile", "Perte de balle inutile", "OFF", true, ["ballon", "positions"], "Perte R01/R02 sans pression (moins de 2 adversaires à moins de 3 m du porteur) alors qu'un coéquipier de champ libre (aucun adversaire à moins de 3 m) était à 3 à 12 m du porteur."],
    ["R04", "relance_risquee", "Relance risquée sous pression", "OFF", true, ["ballon", "positions", "gardien"], "Perte en zone défensive sous pressing (au moins 2 adversaires à moins de 3 m) dont le porteur est le gardien ou le dernier défenseur de champ."],
    ["R05", "passe_imprecise", "Passe imprécise ou mal rythmée", "OFF", false, ["ballon"], "La précision d'une passe demande le ballon image par image : à 3,3 images par seconde, le ballon n'est pas assez suivi pour juger une passe."],
    ["R06", "dribble_excessif", "Dribble excessif ou conservation trop longue", "OFF", true, ["ballon", "positions"], "Le même joueur garde le ballon au moins 6 s (seuil proposé, à valider) alors qu'un coéquipier de champ libre (aucun adversaire à moins de 3 m) est à 12 m ou moins pendant au moins la moitié du temps."],
    ["R07", "largeur_mal_occupee", "Largeur mal occupée", "OFF", true, ["ballon", "positions"], "Mon équipe a le ballon dans la moitié offensive ; au moins 3 joueurs de champ occupent moins de 40 % de la largeur pendant au moins 3 s."],
    ["R08", "attaque_statique", "Attaque prévisible / sans rotation", "OFF", true, ["ballon", "positions"], "Mon équipe a le ballon ; vitesse moyenne des joueurs de champ inférieure à 0,5 m/s pendant au moins 4 s."],
    ["R09", "pivot_isole", "Pivot isolé / non soutenu", "OFF", true, ["ballon", "positions"], "Le porteur est dans les 40 % offensifs, aucun coéquipier de champ à moins de 6 m, pendant au moins 1,5 s."],
    ["R10", "absence_mouvement", "Absence de mouvement sans ballon", "OFF", true, ["ballon", "positions"], "Un joueur de champ de mon équipe, sans le ballon, bouge à moins de 0,3 m/s (vitesse lissée dans les deux sens du temps) pendant au moins 5 s alors que mon équipe a le ballon."],
    ["R11", "tir_precipite", "Tir précipité ou mal préparé", "OFF", false, ["ballon"], "Les tirs ne sont pas détectés (un tir demande la vitesse et la direction du ballon image par image)."],
    ["R12", "occasion_manquee", "Occasion franche manquée", "OFF", false, ["ballon"], "Les tirs ne sont pas détectés ; le caractère « franc » d'une occasion est un jugement."],
    ["R13", "transition_off_lente", "Transition offensive trop lente", "TRANS", true, ["ballon", "positions"], "Mon équipe récupère le ballon dans les deux premiers tiers, le garde 4 s sans le faire avancer de plus de 4 m, alors qu'au moins 2 coéquipiers de champ sont à plus de 5 m devant le ballon."],
    ["R14", "superiorite_non_convertie", "Supériorité numérique mal exploitée", "TRANS", true, ["ballon", "positions"], "Mon équipe a le ballon avec au moins 2 joueurs de champ de plus que l'adversaire à moins de 8 m du ballon pendant au moins 3 s, sans faire avancer le ballon de plus de 3 m."],
    ["R15", "contre_attaque_subie", "Contre-attaque adverse concédée", "TRANS", true, ["ballon", "positions"], "Après une perte, l'adversaire avance d'au moins 20 % de la longueur avec plus d'attaquants que mon équipe n'a de défenseurs côté but."],
    ["R16", "repli_tardif", "Repli défensif tardif", "TRANS", true, ["ballon", "positions"], "Après une perte, l'adversaire avance d'au moins 4 m et au plus 1 joueur de champ est entre le ballon et mon but."],
    ["R17", "equipe_etiree", "Équipe trop étirée", "DEF", true, ["ballon", "positions"], "L'adversaire a le ballon ; profondeur de mes joueurs de champ supérieure à 50 % de la longueur pendant au moins 2 s."],
    ["R18", "espace_dos_fixo", "Espace dans le dos du dernier défenseur", "DEF", true, ["ballon", "positions"], "Un adversaire libre à plus de 1,5 m derrière mon dernier défenseur, à plus de 3 m de tout joueur de mon équipe, pendant au moins 1,2 s."],
    ["R19", "marquage_perdu", "Marquage perdu / joueur oublié", "DEF", true, ["ballon", "positions"], "Un adversaire seul à plus de 3,5 m du plus proche défenseur, dans ma zone de tir, à moins de 12 m du ballon, pendant au moins 1,5 s."],
    ["R20", "pressing_desorganise", "Pressing non coordonné", "DEF", false, ["positions"], "La coordination d'un pressing demande des positions précises à 1 m près et des identités stables ; la précision actuelle ne permet pas de la juger."],
    ["R21", "aide_defensive_absente", "Aide défensive absente (pas de doublement)", "DEF", false, ["positions"], "Même raison que R20 : la couverture derrière le presseur demande des positions précises à 1 m près."],
    ["R22", "faute_evitable", "Faute évitable", "DEF", false, [], "Les fautes ne sont pas détectées : aucun son ni geste d'arbitre n'est analysé."],
    ["R23", "duel_perdu", "Duel 1 contre 1 perdu", "DEF", false, ["positions"], "Un duel individuel demande un suivi individuel fiable image par image ; il n'est pas assez stable."],
    ["R24", null, "Maîtrise technique (contrôle raté)", "OFF", false, ["ballon"], "Un contrôle raté demande au moins 15 images par seconde autour de la réception ; la cadence d'analyse est de 3,3 images par seconde."],
    ["R25", "erreur_gardien", "Erreur de placement ou d'arrêt du gardien", "GK", false, ["ballon", "gardien"], "Les tirs et les arrêts ne sont pas détectés."],
    ["R26", "sortie_gardien", "Sortie du gardien mal timée", "GK", false, ["ballon", "gardien"], "Les tirs et les sorties sur le tireur ne sont pas détectés."],
    ["R27", "regle_4s", "Violation de la règle des 4 secondes", "GK", true, ["ballon", "gardien"], "Le gardien de mon équipe garde le ballon (à 2,2 m ou moins) au moins 4,0 s dans sa moitié de terrain, le ballon étant vu sans trou."],
    ["R28", "gj_perte_balle", "Perte de balle en power play", "GJ", false, ["ballon", "gardien"], "Le gardien-joueur n'est pas détecté (but vide, 5 joueurs de champ)."],
    ["R29", "gj_timing", "Timing du gardien-joueur inadapté", "GJ", false, ["ballon", "gardien"], "Le gardien-joueur n'est pas détecté."],
    ["R30", "gj_repli_non_assure", "Retour au but non assuré après perte (cage vide)", "GJ", false, ["ballon", "gardien"], "Le gardien-joueur n'est pas détecté."],
    ["R31", "cpa_def_desorganise", "Coup de pied arrêté défendu de façon désorganisée", "CPA", false, ["ballon", "positions"], "Les coups de pied arrêtés ne sont pas détectés (arrêt de jeu, ballon posé, joueurs placés)."],
    ["R32", "cpa_off_rate", "Coup de pied arrêté offensif raté", "CPA", false, ["ballon", "positions"], "Les coups de pied arrêtés ne sont pas détectés."]
  ];

  const REGLES = L.map(([id, type, titre, phase, codee, exige, texte]) => ({
    id, type, titre, phase, codee, exige, ballon: exige.indexOf("ballon") >= 0,
    mesure: codee ? texte : null, raison: codee ? null : texte
  }));
  const PAR_ID = Object.fromEntries(REGLES.map((r) => [r.id, r]));
  const PAR_TYPE = Object.fromEntries(REGLES.filter((r) => r.type).map((r) => [r.type, r]));

  /* Validations : { R01: "validee" | "rejetee" } ; tout le reste = non validée. Les valeurs inconnues sont ignorées. */
  function etat(id, validations) {
    const v = validations && validations[id];
    return v === ETAT.VALIDEE ? ETAT.VALIDEE : v === ETAT.REJETEE ? ETAT.REJETEE : ETAT.NON_VALIDEE;
  }
  function valider(validations, id, decision) {
    const o = Object.assign({}, validations || {});
    if (!PAR_ID[id]) return o;
    if (decision === ETAT.VALIDEE || decision === ETAT.REJETEE) o[id] = decision; else delete o[id];
    return o;
  }
  /* Une règle non codée ne se valide pas : il n'y a rien à utiliser. */
  const validable = (id) => !!(PAR_ID[id] && PAR_ID[id].codee);

  /* Rapport de couverture : une ligne par règle, jamais de silence.
     ctx : { validations, events (évènements affichés ou écartés avec .regle), fiabilite: { ballon: 0..1 } | null }.
     statut : « evaluee » (codée, utilisable) ou « non_evalue » (avec raison). */
  function couverture(ctx) {
    const c = ctx || {}, ev = c.events || [], fb = c.fiabilite && typeof c.fiabilite.ballon === "number" ? c.fiabilite.ballon : null;
    return REGLES.map((r) => {
      const e = etat(r.id, c.validations), n = ev.filter((x) => x.regle === r.id).length;
      const base = { id: r.id, type: r.type, titre: r.titre, phase: r.phase, etatRegle: e, nb: 0 };
      if (!r.codee) return Object.assign(base, { statut: "non_evalue", raison: r.raison });
      if (e === ETAT.REJETEE) return Object.assign(base, { statut: "non_evalue", raison: "règle rejetée par le coach" });
      if (r.ballon && fb != null && fb < FIABLE_MIN) return Object.assign(base, { statut: "non_evalue", raison: "ballon fiable sur " + Math.round(fb * 100) + " % seulement du temps de jeu (moins de " + Math.round(FIABLE_MIN * 100) + " %)" });
      return Object.assign(base, { statut: "evaluee", nb: n, mesure: r.mesure, sur: r.ballon && fb != null ? Math.round(fb * 100) : null });
    });
  }
  function resumeCouverture(rows) {
    const t = rows.length, ev = rows.filter((r) => r.statut === "evaluee").length;
    return { total: t, evaluees: ev, nonEvaluees: t - ev, nonValidees: rows.filter((r) => r.statut === "evaluee" && r.etatRegle === ETAT.NON_VALIDEE).length };
  }

  return { ETAT, FIABLE_MIN, REGLES, PAR_ID, PAR_TYPE, etat, valider, validable, couverture, resumeCouverture };
});
