/* Effectif d'un exercice : combien de JOUEURS DE CHAMP il demande (sans les gardiens) et combien de GARDIENS il utilise, pour que la séance proposée tienne compte de
   combien tu es à l'entraînement. Table relue exercice par exercice d'après sa fiche (champ « players »).
   [f, K]        : f joueurs de champ au minimum, K gardiens utilisés ; au-delà de f + 2 joueurs en plus, les autres tournent (rotation).
   [fmin, fmax, K] : l'exercice se joue de fmin à fmax joueurs de champ.
   Les gardiens sont facultatifs : s'il en manque, un joueur de champ tient le but ou on joue vers des buts à cônes (dit dans la séance). Un gardien qui joue dans le champ compte comme joueur de champ. */
(function (target) {
  const E = {
    relance_pression: [5, 1], rondo_4v2: [6, 8, 0], contre_pressing_5s: [8, 2], repli_3v2: [5, 7, 0], superiorite_2v1: [5, 0], pressing_zone: [8, 2], marquage_cpa: [10, 1], cpa_off: [9, 0],
    pivot_appui: [7, 0], rotation_4_0: [5, 9, 0], passe_et_va: [4, 6, 0], finition_cadence: [6, 1], gardien_jeu_pied: [3, 1], gj_5v4: [9, 0], def_5v4: [9, 0], duel_1v1_def: [2, 0],
    regle_4s: [6, 14, 0], jeu_de_position: [9, 0], duel_propre: [4, 0], transition_off: [7, 0], largeur_profondeur: [7, 0], pressing_haut_4v4: [8, 2], bloc_bas_4v4: [8, 1], compacite_9m: [7, 0],
    sortie_3_1_pivot: [6, 1], losange_triangles: [6, 0], carre_diagonales: [6, 0], gj_perte_retour: [9, 0], zero_perte_zone_def: [6, 1], pressing_relance_gardien: [6, 1], transition_def_3s: [7, 1],
    bloc_median_zones: [10, 0], marquage_individuel_4v4: [8, 2], zone_4v4_glissement: [8, 2], defense_mixte_2_zones: [8, 2], defense_losange_aide: [8, 0], aide_permutation: [6, 0],
    fermer_lignes_passe_3v4: [7, 1], quatre_zero_fixation_appel: [6, 7, 0], trois_un_combinaison: [6, 0], pivot_remise_tir: [4, 0], jeu_direct_long: [5, 1], parede_triangle: [3, 4, 0],
    contre_attaque_2v1_3v2: [3, 5, 0], finition_1v1_gardien: [2, 1], gardien_main_relance_ailier: [5, 1], gardien_long_pivot: [4, 1], sortie_pression_haute: [5, 1], transition_att_def_att: [7, 2],
    corner_deux_schemas: [4, 1], rentree_touche_4s: [4, 0], kick_in_haut_milieu_bas: [7, 1], gj_construction_3_2: [9, 0], def_gj_pressing_5v4: [9, 0], activation_ballon_pieds: [4, 0],
    jeu_reduit_3v3_gb: [6, 2], match_conditionne_theme: [8, 2], corner_court_triangle: [7, 2], corner_second_poteau: [7, 2], corner_tir_enchaine: [6, 2], corner_defense_zone: [8, 2],
    corner_defense_individuelle: [8, 2], corner_contre_attaque: [10, 2], rentree_pivot_remise: [7, 1], rentree_une_deux: [4, 0], rentree_sortie_securite: [6, 0], rentree_fermer_ligne: [6, 0],
    rentree_sous_4s_decompte: [6, 0], coup_franc_direct_mur: [4, 1], coup_franc_combinaison: [6, 1], coup_franc_defense_mur: [7, 1], coup_franc_lateral_centre: [7, 1],
    sixieme_faute_10m: [1, 4, 1], sixieme_faute_gardien: [3, 1], penalty_6m: [1, 4, 1], coup_envoi_pivot: [9, 1], remise_gardien_4s: [5, 1], cpa_gj_fin_match: [9, 0], corner_contre_gj: [9, 0],
    trois_un_ailier_diagonale: [7, 0], trois_un_pivot_decroche: [7, 0], trois_un_defense_pivot_adverse: [8, 0], losange_apex_rotation: [7, 0], losange_pressing_axe: [8, 0],
    carre_pressing_alterne: [8, 0], carre_permutation_croisee: [6, 0], quatre_zero_boucle: [8, 0], quatre_zero_ecran_tir: [8, 1], quatre_zero_pression_individuelle: [8, 0],
    gj_sortie_rapide_aile: [9, 0], gj_tir_ecran: [9, 0], gj_montee_declencheur: [8, 9, 0], gj_cote_faible: [9, 0], pressing_homme_haut: [8, 2], piege_ligne_touche: [7, 0],
    defense_pivot_dos_but: [6, 0], defense_2v1_retarder: [3, 1], defense_couverture_croisee: [6, 0], attaque_3v2_largeur: [5, 1], attaque_bloc_bas_patience: [8, 1], attaque_une_touche_reduit: [6, 0],
    contre_attaque_relance_gardien: [5, 1], recuperation_haute_tir: [8, 1], finition_centre_second_poteau: [3, 1], gardien_duel_1v1: [1, 1], coup_franc_mur_escalier: [8, 1],
    coup_franc_ecran_tireur: [7, 1], corner_ecran_second_poteau: [7, 2], rentree_ecran: [6, 0], ecran_ailier_pivot: [7, 0], defense_contre_ecran: [6, 0], sortie_pression_sans_gardien: [6, 0],
    sortie_pression_gardien_securite: [5, 1], sortie_pression_gj: [8, 0], feinte_frappe_passe: [4, 1], feinte_frappe_dribble: [2, 1], feinte_frappe_1v1_gardien: [1, 1],
    coup_franc_feinte_frappe: [6, 1], corner_feinte_frappe: [7, 1]
  };
  const parse = (id) => { const e = E[id]; if (!e) return null; return e.length === 2 ? { fmin: e[0], fmax: e[0] + 2, k: e[1] } : { fmin: e[0], fmax: e[1], k: e[2] }; };
  target.EFFECTIF_EXERCICES = E;
  target.effectifExercice = parse;

  /* Effectif du jour : { total : joueurs présents, gardiens compris ; gk : dont gardiens }.
     Rend { ok, statut : "ok" | "gardien" | "rotation" | "trop-peu", note, actifs, attente, fmin, fmax, k } pour l'exercice id ; ok = faisable.
     - trop-peu : moins de joueurs que l'exercice n'en demande (jamais proposé) ;
     - gardien : faisable, mais tous les gardiens voulus ne sont pas disponibles : un joueur de champ au but ou des buts à cônes ;
     - rotation : plus de joueurs que l'exercice n'en occupe : les autres tournent ou attendent leur tour ;
     - ok : tout le monde joue et chaque gardien voulu est là. */
  target.effectifPour = function (id, eff) {
    const x = parse(id);
    if (!x || !eff || !(eff.total >= 1)) return { ok: true, statut: "ok", note: "", actifs: null, attente: 0, fmin: x ? x.fmin : null, fmax: x ? x.fmax : null, k: x ? x.k : null };
    const total = Math.round(eff.total), gk = Math.max(0, Math.min(total, Math.round(eff.gk || 0)));
    const reste = total - x.fmin, voulus = x.k;
    if (total < x.fmin) return { ok: false, statut: "trop-peu", note: "demande au moins " + x.fmin + " joueur(s) de champ, vous êtes " + total, actifs: 0, attente: 0, fmin: x.fmin, fmax: x.fmax, k: x.k };
    const gkDispo = Math.min(gk, voulus), manque = Math.max(0, voulus - Math.min(gk, Math.max(0, reste)));
    const dessus = total - (x.fmax + voulus);
    if (voulus > 0 && manque > 0) return { ok: true, statut: "gardien", note: (gk === 0 ? "pas de gardien" : "il manque " + manque + " gardien(s)") + " : un joueur de champ tient le but (ou jouez vers des buts à cônes)", actifs: Math.min(total, x.fmax + voulus), attente: Math.max(0, dessus), fmin: x.fmin, fmax: x.fmax, k: x.k };
    if (dessus > 0) return { ok: true, statut: "rotation", note: dessus + " joueur(s) en plus : faites tourner (les autres attendent leur tour ou jouent les rôles libres)", actifs: x.fmax + voulus, attente: dessus, fmin: x.fmin, fmax: x.fmax, k: x.k };
    return { ok: true, statut: "ok", note: "", actifs: Math.min(total, x.fmax + voulus), attente: 0, fmin: x.fmin, fmax: x.fmax, k: x.k };
  };
})(typeof module === "object" && module.exports ? module.exports : (window.FutsalKB = window.FutsalKB || {}));
