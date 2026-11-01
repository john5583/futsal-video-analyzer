/* Animations des exercices du plan de jeu, suite (voir knowledge/seance.js et scenarios-drills-plan.js).
   Mon équipe A (bleu) attaque vers la droite (but adverse en x = 40), adversaire B (rouge), terrain 40 × 20 m. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./builder.js"));
  else root.FutsalScenesDrillsPlan2 = factory(root.FutsalSceneBuilder);
})(typeof self !== "undefined" ? self : this, function (SB) {
  "use strict";
  const D = {};
  const mk = (id, title) => SB.Scene(id, title, 13);
  const steps = (s, setup, run, crit) => s.step(0, 3.5, "exercice", setup).step(3.5, 10, "exercice", run).step(10, 13, "consigne", crit).done();

  D.marquage_individuel_4v4 = () => {
    const s = mk("marquage_individuel_4v4", "Défense individuelle : un joueur, un adversaire");
    s.gka(2, 10).a(5, 14, 10).a(2, 14, 5).a(3, 14, 15).a(4, 18, 10).b(9, 18, 12).b(7, 20, 6).b(8, 20, 14).b(6, 24, 10);
    s.ball(0.3, 18.4, 12).pass("pass", "B9", "B7", 0.6, 1.4, "Je suis mon joueur").go("A2", [1.4, 14, 5], [2.6, 18, 6]).go("A5", [1.4, 14, 10], [2.6, 18.6, 12]).go("A3", [1.4, 14, 15], [2.6, 18, 14.4]).go("A4", [1.4, 18, 10], [2.6, 22, 10.4]);
    s.arrow("press", "A2", "B7", 1.5, 2.6, "Entre son joueur et le but").pass("pass", "B7", "B8", 3.4, 4.2).go("A3", [3.4, 18, 14.4], [4.4, 19, 14]).go("A2", [3.4, 18, 6], [4.4, 19, 7]).mark("check", 19, 14, 4.4, 9);
    return steps(s, "Quatre défenseurs, chacun responsable d'un attaquant précis.", "Le défenseur reste entre son joueur et le but, côté ballon ; il change de marquage seulement si un partenaire l'annonce.", "Jamais dos à son joueur et au ballon ; annoncer chaque changement de marquage ; pas de faute dans les duels.");
  };

  D.zone_4v4_glissement = () => {
    const s = mk("zone_4v4_glissement", "Défense en zone : zones attribuées et glissements");
    s.gka(2, 10).a(5, 12, 10).a(2, 11, 4).a(3, 11, 16).a(4, 16, 10).b(9, 20, 10).b(7, 21, 4).b(8, 21, 16).b(6, 26, 10);
    s.zone("target", [8, 0, 10, 8], 0.5, 12, "Zone gauche").zone("target", [8, 12, 10, 8], 0.5, 12, "Zone droite");
    s.ball(0.3, 20.4, 10).pass("pass", "B9", "B7", 0.6, 1.5, "Jeu vers la gauche").go("A2", [1.5, 11, 4], [2.8, 14, 5]).go("A5", [1.5, 12, 10], [2.8, 13, 7]).go("A4", [1.5, 16, 10], [2.8, 15, 9]).go("A3", [1.5, 11, 16], [2.8, 12, 12.5]);
    s.pass("pass", "B7", "B6", 3.6, 4.4, "Changement : le bloc glisse").go("A2", [3.6, 14, 5], [5, 12, 8]).go("A3", [4.4, 12, 12.5], [5.6, 14, 15]).go("A5", [3.6, 13, 7], [5, 13, 10]).go("A4", [3.6, 15, 9], [5, 15, 12]);
    return steps(s, "Chaque défenseur couvre une zone ; le ballon est joué d'un côté puis de l'autre.", "Le bloc glisse ensemble vers le ballon ; le joueur de la zone du ballon presse, les autres ferment les lignes de passe.", "Un seul presseur ; les autres compactent ; changer de zone à chaque changement d'aile.");
  };

  D.defense_mixte_2_zones = () => {
    const s = mk("defense_mixte_2_zones", "Défense mixte : individuelle haut, en zone chez soi");
    s.gka(2, 10).a(5, 16, 10).a(2, 16, 4).a(3, 16, 16).a(4, 10, 10).b(9, 24, 10).b(7, 24, 5).b(8, 24, 15).b(6, 18, 10);
    s.zone("free", [20, 0, 20, 20], 0.5, 6, "Moitié adverse : marquage individuel").zone("target", [0, 0, 20, 20], 6, 12, "Chez nous : zone");
    s.ball(0.3, 24.4, 10).pass("pass", "B9", "B7", 0.6, 1.5).go("A2", [1.5, 16, 4], [2.8, 22, 5.4]).go("A5", [1.5, 16, 10], [2.8, 23, 10.6]).go("A3", [1.5, 16, 16], [2.8, 22, 14.6]);
    s.pass("pass", "B7", "B6", 4, 4.8, "Le ballon passe chez nous").go("A5", [4, 23, 10.6], [6, 14, 10]).go("A2", [4, 22, 5.4], [6, 12, 6]).go("A3", [4, 22, 14.6], [6, 12, 14]).label(10, 18, "On passe en zone", 6, 12, "#ffb020", 0.9);
    return steps(s, "Marquage individuel dans la moitié adverse, défense en zone dans notre moitié.", "Dès que le ballon franchit la médiane vers nous, chacun lâche son joueur et reprend sa zone.", "Le signal est la ligne médiane ; annoncer « zone » ; ne pas courir derrière son joueur dans notre moitié.");
  };

  D.defense_losange_aide = () => {
    const s = mk("defense_losange_aide", "Défense en losange : couper les lignes de passe");
    s.gka(2, 10).a(5, 20, 10, "Haut").a(2, 16, 5).a(3, 16, 15).a(4, 10, 10, "Bas").b(9, 24, 10).b(7, 22, 4).b(8, 22, 16).b(6, 28, 10);
    s.ball(0.3, 24.4, 10).go("A5", [0.5, 20, 10], [1.6, 23, 10]).arrow("press", "A5", "B9", 0.6, 1.6, "Le haut ferme le porteur").pass("pass", "B9", "B7", 1.8, 2.6, "Passe vers l'aile").go("A2", [2.6, 16, 5], [3.6, 21, 5]).go("A5", [2.6, 23, 10], [3.6, 20, 8]).go("A4", [2.6, 10, 10], [3.6, 14, 9]).go("A3", [2.6, 16, 15], [3.6, 17, 12]);
    s.label(16, 18, "Le losange pivote vers le ballon", 3.6, 12, "#ffb020", 0.9);
    return steps(s, "Défense en 1-2-1 : un joueur haut, deux sur les côtés, un en couverture derrière.", "Le joueur haut ferme le porteur ; les ailiers coupent les passes latérales ; le bas couvre l'axe.", "Le losange pivote ensemble ; le joueur bas annonce les placements ; aucune passe dans l'axe.");
  };

  D.aide_permutation = () => {
    const s = mk("aide_permutation", "Aide et permutation défensive");
    s.gka(2, 10).a(5, 14, 8).a(2, 15, 14).a(3, 8, 10).b(9, 18, 8).b(7, 19, 14).b(8, 22, 11);
    s.ball(0.3, 18.4, 8).go("B9", [0.5, 18, 8], [2, 14.8, 6]).carry("B9", 0.5, 2).go("A5", [0.5, 14, 8], [2, 13.4, 7.6]).arrow("press", "A5", "B9", 0.6, 2, "Dribble : je suis battu");
    s.go("A2", [2, 15, 14], [3.4, 13.6, 9]).arrow("goodrun", "A2", [13.6, 9], 2, 3.4, "J'aide et je prends le porteur").go("A5", [2, 13.4, 7.6], [3.6, 15, 13]).arrow("goodrun", "A5", [15, 13], 2.4, 3.6, "Je permute sur son joueur").mark("check", 13.6, 9, 3.6, 9);
    return steps(s, "Trois défenseurs contre trois attaquants : un attaquant élimine son défenseur.", "Le partenaire proche aide, prend le porteur ; le battu permute et reprend le joueur libéré.", "Annoncer « aide » et « permute » ; pas de faute dans l'aide ; l'équipe retrouve son équilibre en moins de 3 s.");
  };

  D.fermer_lignes_passe_3v4 = () => {
    const s = mk("fermer_lignes_passe_3v4", "Fermer les lignes de passe en infériorité (3 contre 4)");
    s.gka(2, 10).a(5, 14, 10).a(2, 12, 5).a(3, 12, 15).b(9, 20, 10).b(7, 19, 4).b(8, 19, 16).b(6, 24, 10);
    s.ball(0.3, 20.4, 10).pass("pass", "B9", "B7", 0.6, 1.4).go("A2", [1.4, 12, 5], [2.6, 17, 5.4]).go("A5", [1.4, 14, 10], [2.6, 16, 8]).go("A3", [1.4, 12, 15], [2.6, 14.5, 13]).arrow("press", "A2", "B7", 1.5, 2.6, "Je ferme la passe vers l'aile");
    s.pass("pass", "B7", "B9", 3.2, 4, "Retour : on a gagné du temps").label(14, 17.5, "Lignes de passe fermées = temps gagné", 4, 12, "#ffb020", 0.9);
    return steps(s, "Trois défenseurs contre quatre attaquants : on ne cherche pas à récupérer tout de suite.", "Se placer entre le porteur et ses partenaires pour fermer les passes dangereuses et forcer le jeu vers l'extérieur.", "Placement avant l'engagement ; jamais deux défenseurs sur le porteur ; voir ballon et joueur en même temps.");
  };

  D.quatre_zero_fixation_appel = () => {
    const s = mk("quatre_zero_fixation_appel", "4-0 : fixer un défenseur puis appel dans son dos");
    s.a(5, 16, 10).a(2, 20, 4).a(3, 20, 16).a(4, 24, 10).b(6, 22, 10).b(7, 26, 12);
    s.ball(0.3, 16.4, 10).pass("good", "A5", "A2", 0.6, 1.4, "Je fixe").go("B6", [1.4, 22, 10], [2.6, 21, 7]).go("A4", [1.4, 24, 10], [2.8, 28, 7]).arrow("goodrun", "A4", [28, 7], 1.5, 2.8, "Appel dans le dos").pass("good", "A2", "A4", 3, 3.9, "Passe dans l'espace");
    s.go("A5", [3.9, 16, 10], [5.4, 24, 10]).go("A3", [3.9, 20, 16], [5.4, 16, 10]).label(20, 18, "On tourne : 4-0, pas de poste fixe", 5.4, 12, "#ffb020", 0.9).pass("good", "A4", [40, 9.6], 6.2, 7, "Tir");
    return steps(s, "Quatre joueurs sans pivot fixe contre deux défenseurs.", "Un joueur fixe un défenseur, un autre fait un appel dans son dos ; après l'action, les joueurs tournent de poste.", "Appel au moment où le défenseur regarde le ballon ; passe dans l'espace, pas dans les pieds ; rotation immédiate.");
  };

  D.trois_un_combinaison = () => {
    const s = mk("trois_un_combinaison", "3-1 : combinaison à trois autour du pivot");
    s.a(5, 28, 10, "Pivot").a(2, 20, 4).a(3, 20, 16).a(4, 16, 10).b(6, 26, 8).b(7, 26, 12);
    s.ball(0.3, 16.4, 10).pass("good", "A4", "A2", 0.6, 1.4).pass("good", "A2", "A5", 2, 2.9, "Pivot, dos au but").go("A2", [2.9, 20, 4], [4.2, 27, 4]).arrow("goodrun", "A2", [27, 4], 3, 4.2, "Je démarre derrière").pass("good", "A5", "A2", 3.8, 4.6, "Remise de première");
    s.go("A3", [4.6, 20, 16], [6, 30, 14]).pass("good", "A2", "A3", 5.2, 6.1, "Décalage").pass("good", "A3", [40, 9.4], 6.6, 7.4, "Tir");
    return steps(s, "Trois joueurs et un pivot contre deux défenseurs.", "Le pivot reçoit dos au but et remet de première ; le passeur démarre dans le dos ; troisième homme en finition.", "Pivot protège et remet en une touche ; démarrage après la passe ; le troisième homme arrive lancé.");
  };

  D.pivot_remise_tir = () => {
    const s = mk("pivot_remise_tir", "Pivot : contrôle orienté, remise ou tir");
    s.a(5, 30, 10, "Pivot").a(2, 22, 5).a(3, 22, 15).b(6, 31.5, 10).gkb(38, 10);
    s.ball(0.3, 22.4, 5).pass("good", "A2", "A5", 0.6, 1.5, "Passe tendue dans les pieds").go("A5", [1.5, 30, 10], [2.4, 30, 9.4]).go("B6", [1.5, 31.5, 10], [2.4, 31, 10.4]).arrow("goodrun", "A5", [30, 9.4], 1.5, 2.4, "Contrôle orienté");
    s.pass("good", "A5", "A3", 3, 3.8, "Remise").go("A3", [3.8, 22, 15], [5, 31, 14]).pass("good", "A3", [40, 8.8], 5.4, 6.2, "Tir en première").label(20, 2.5, "Ou tir direct si le défenseur est battu", 6.4, 12, "#ffb020", 0.85);
    return steps(s, "Le pivot reçoit dos à un défenseur près du but adverse.", "Contrôle orienté, protection du ballon, puis remise à un partenaire lancé ou demi-tour et tir.", "Corps entre le défenseur et le ballon ; décision en deux touches ; remise vers le joueur le mieux placé.");
  };

  D.jeu_direct_long = () => {
    const s = mk("jeu_direct_long", "Jeu direct : passe longue du gardien vers le pivot");
    s.gka(2, 10).a(5, 26, 10, "Pivot").a(2, 22, 4).a(3, 22, 16).b(6, 28, 10).b(7, 24, 12);
    s.zone("target", [22, 4, 12, 12], 0.5, 12, "Zone de réception");
    s.ball(0.3, 2.6, 10).go("A5", [0.5, 26, 10], [1.5, 27, 9]).pass("good", "GKA", "A5", 0.6, 2, "Passe longue (main)").go("A2", [1.8, 22, 4], [3.4, 30, 5]).pass("good", "A5", "A2", 2.8, 3.6, "Remise en profondeur").pass("good", "A2", [40, 9.6], 4.4, 5.2, "Tir");
    return steps(s, "Le gardien lance long vers le pivot ; les deux ailiers se préparent à partir.", "Le pivot contrôle sous pression, remet à l'ailier qui démarre ; finition rapide avant le replacement adverse.", "Précision de la passe longue ; pivot dos au but ; ailiers qui partent à la remise ; tir en moins de 8 s.");
  };

  D.parede_triangle = () => {
    const s = mk("parede_triangle", "Parede : une-deux en triangle");
    s.a(5, 18, 10).a(2, 22, 6).a(3, 24, 14).b(6, 21, 9);
    s.ball(0.3, 18.4, 10).pass("good", "A5", "A2", 0.6, 1.3, "Passe").go("A5", [1.3, 18, 10], [2.5, 24, 8]).arrow("goodrun", "A5", [24, 8], 1.3, 2.5, "Je démarre").pass("good", "A2", "A5", 1.9, 2.7, "Une-deux").go("B6", [1, 21, 9], [2.4, 22, 8]);
    s.pass("good", "A5", "A3", 3.4, 4.2, "Ouverture").go("A3", [4.2, 24, 14], [5.2, 30, 12]).pass("good", "A3", [40, 9.6], 5.6, 6.4, "Tir");
    return steps(s, "Triangle de trois joueurs contre un défenseur.", "Passe, démarrage derrière le défenseur, remise de première, puis ouverture vers le troisième joueur.", "Passe tendue et immédiate ; départ après la passe ; une touche sur la remise.");
  };

  D.contre_attaque_2v1_3v2 = () => {
    const s = mk("contre_attaque_2v1_3v2", "Contre-attaque : 2 contre 1 puis 3 contre 2 enchaînés");
    s.gka(2, 10).a(5, 14, 10).a(2, 16, 5).a(3, 12, 15).b(6, 26, 9).b(7, 30, 11).gkb(38, 10);
    s.ball(0.3, 14.4, 10).pass("good", "A5", "A2", 0.6, 1.3, "Vers l'avant").go("A2", [1.3, 16, 5], [3, 28, 5]).carry("A2", 1.3, 3).go("A5", [1.3, 14, 10], [3, 26, 11]).go("B6", [1.3, 26, 9], [2.8, 24, 8]);
    s.pass("good", "A2", "A5", 3.2, 4, "Dernière passe au 2e joueur").go("A3", [3.2, 12, 15], [5, 28, 15]).pass("good", "A5", "A3", 4.6, 5.4, "Troisième homme").pass("good", "A3", [40, 9.4], 5.8, 6.6, "Finition");
    return steps(s, "Deux attaquants contre un défenseur, un troisième attaquant arrive en renfort.", "Vitesse dès la récupération, passe au meilleur placé, troisième homme en finition avant le retour adverse.", "Première passe vers l'avant ; courir loin du défenseur ; finir en moins de 8 s.");
  };

  D.finition_1v1_gardien = () => {
    const s = mk("finition_1v1_gardien", "Finition : 1 contre 1 face au gardien");
    s.a(5, 26, 10).a(2, 20, 4).b(6, 28, 12).gkb(38, 10);
    s.ball(0.3, 20.4, 4).pass("good", "A2", "A5", 0.6, 1.4, "Passe en profondeur").go("A5", [1.4, 26, 10], [2.6, 33, 9]).carry("A5", 1.4, 2.6).go("B6", [1.4, 28, 12], [2.6, 31, 11]).pass("good", "A5", [40, 7], 3, 3.8, "Frappe croisée au sol").label(20, 2.5, "Lire le gardien avant la frappe", 3.8, 12, "#ffb020", 0.9);
    return steps(s, "Attaquant lancé en profondeur face au gardien, avec un défenseur dans son dos.", "Conduite, lecture du gardien, frappe croisée au ras du poteau ou petit piqué.", "Frappe avant la sortie du gardien ; viser le petit côté ; ne pas ralentir.");
  };

  D.gardien_main_relance_ailier = () => {
    const s = mk("gardien_main_relance_ailier", "Relance à la main vers l'ailier démarqué");
    s.gka(2, 10).a(2, 8, 3).a(3, 8, 17).a(4, 12, 10).b(9, 14, 6).b(7, 14, 14);
    s.ball(0.3, 2.6, 10).go("A3", [0.5, 8, 17], [1.5, 10, 18]).pass("good", "GKA", "A3", 0.8, 1.7, "Lancer main au sol vers le côté libre").go("B7", [1.7, 14, 14], [2.8, 11, 16]).go("A3", [1.7, 10, 18], [3.4, 22, 17]).carry("A3", 1.7, 3.4);
    s.pass("good", "A3", "A4", 4, 4.8, "Remise vers l'axe").label(20, 2.2, "Ligne médiane franchie", 5, 12, "#3ddc84", 0.9);
    return steps(s, "Gardien et trois joueurs contre deux attaquants qui pressent la relance.", "Le gardien lance à la main au sol vers le côté libre ; l'ailier démarque, reçoit et conduit.", "Lire le pressing avant de relancer ; lancer en moins de 4 s ; l'ailier s'écarte avant d'appeler.");
  };

  D.gardien_long_pivot = () => {
    const s = mk("gardien_long_pivot", "Relance longue du gardien vers le pivot");
    s.gka(2, 10).a(5, 24, 10, "Pivot").a(2, 18, 4).a(3, 18, 16).b(6, 26, 10).b(7, 20, 12);
    s.zone("target", [20, 6, 10, 8], 0.5, 12, "Cible du pivot");
    s.ball(0.3, 2.6, 10).pass("good", "GKA", "A5", 0.8, 2.2, "Rengaine longue à la main").go("A5", [1.5, 24, 10], [2.2, 24, 10]).pass("good", "A5", "A2", 3, 3.8, "Remise").go("A2", [3.8, 18, 4], [5, 28, 5]).carry("A2", 3.8, 5).label(20, 2.2, "Les ailiers démarrent à la remise", 5, 12, "#ffb020", 0.9);
    return steps(s, "Le gardien dispose d'une solution longue vers le pivot, dos au but adverse.", "Rengaine longue, le pivot protège, remise courte, les ailiers démarrent derrière.", "À utiliser quand le pressing est très haut ; passe tendue au sol ou sous la hauteur de tête ; pivot orienté.");
  };

  D.sortie_pression_haute = () => {
    const s = mk("sortie_pression_haute", "Sortir sous pression haute : changer d'aile");
    s.gka(2, 10).a(2, 8, 4).a(3, 8, 16).a(4, 12, 10).b(9, 14, 8).b(7, 14, 12).b(6, 22, 10);
    s.ball(0.3, 2.6, 10).pass("good", "GKA", "A2", 0.6, 1.4, "Côté libre").go("B9", [1.4, 14, 8], [2.4, 9, 5]).go("B7", [1.4, 14, 12], [2.4, 11, 11]).pass("good", "A2", "A4", 2, 2.7, "Appui").pass("good", "A4", "A3", 3.2, 4, "Changement d'aile").go("A3", [4, 8, 16], [5.4, 18, 15]).carry("A3", 4, 5.4);
    return steps(s, "Le gardien et trois joueurs sortent sous un pressing à deux attaquants.", "Première passe côté libre, appui à l'axe, changement d'aile pour casser le pressing.", "Pas de passe dans l'axe sous pression ; appui avant la passe ; changer d'aile en moins de trois passes.");
  };

  D.transition_att_def_att = () => {
    const s = mk("transition_att_def_att", "Enchaîner attaque, défense, attaque");
    s.gka(2, 10).a(5, 24, 10).a(2, 22, 5).a(3, 22, 15).a(4, 14, 10).b(9, 28, 10).b(7, 30, 6).b(8, 30, 14).gkb(38, 10);
    s.ball(0.3, 24.4, 10).pass("bad", "A5", "B9", 0.6, 1.3, "Perte").go("B9", [1.3, 28, 10], [2.8, 22, 10]).go("A5", [1.3, 24, 10], [2.8, 22.6, 10]).go("A4", [1.3, 14, 10], [2.8, 14, 10]).arrow("press", "A5", "B9", 1.4, 2.8, "Retarder");
    s.ball(3, 22, 10).pass("good", "A4", "A2", 3.6, 4.3, "Récupéré : on repart").go("A2", [4.3, 22, 5], [5.8, 32, 5]).carry("A2", 4.3, 5.8).pass("good", "A2", [40, 9.4], 6.2, 7, "Tir");
    return steps(s, "Séquence continue : on attaque, on perd le ballon, on se replace, on récupère et on repart.", "Deux ou trois secondes pour se replacer ; à la récupération, première passe vers l'avant et finition rapide.", "Aucun temps mort entre les phases ; retard du porteur dès la perte ; récupération suivie d'une passe vers l'avant.");
  };

  D.corner_deux_schemas = () => {
    const s = mk("corner_deux_schemas", "Corner : deux schémas, passe courte ou centre au sol");
    s.a(5, 39.4, 0.6).a(2, 36, 5).a(3, 34, 11).a(4, 37, 16).b(6, 37, 8).b(7, 35, 12).gkb(38.5, 10);
    s.ball(0.3, 39.4, 0.8).pass("good", "A5", "A2", 0.8, 1.5, "Option 1 : passe courte").go("A2", [1.5, 36, 5], [2.5, 38, 6]).pass("good", "A2", "A5", 2.4, 3.1, "Une-deux").pass("good", "A5", "A3", 3.8, 4.7, "Centre au sol (option 2)").go("A3", [3.8, 34, 11], [4.6, 37, 10]).pass("good", "A3", [40, 9.8], 5, 5.8, "Tir");
    return steps(s, "Corner offensif à quatre joueurs : deux options préparées.", "Premier signal : passe courte et une-deux ; second signal : centre rasant vers un joueur qui coupe.", "Corner en moins de 4 s ; signal préparé ; un joueur reste en couverture ; changer de schéma toutes les cinq répétitions.");
  };

  D.rentree_touche_4s = () => {
    const s = mk("rentree_touche_4s", "Rentrée de touche (kick-in) : schémas dans les 4 secondes");
    s.a(5, 20, 0.6).a(2, 24, 6).a(3, 28, 11).a(4, 22, 14).b(6, 25, 5).b(7, 27, 10);
    s.ball(0.3, 20.4, 0.8).label(20, 2.2, "4 s", 0.4, 1.4, "#ffb020", 1.2).pass("good", "A5", "A2", 0.6, 1.3, "Option courte").go("A2", [1.3, 24, 6], [2.2, 26, 5]).pass("good", "A2", "A4", 2, 2.8, "Remise").go("A3", [2.8, 28, 11], [4.2, 33, 9]).pass("good", "A4", "A3", 3.4, 4.2, "Démarrage derrière").pass("good", "A3", [40, 9.6], 4.8, 5.6, "Tir");
    return steps(s, "Rentrée de touche offensive : trois options préparées.", "Passe courte, remise, démarrage derrière ; le jeu doit reprendre avant la fin des quatre secondes.", "Rentrée en moins de 4 s ; un joueur toujours démarqué ; ne pas sortir le ballon deux fois de suite.");
  };

  D.kick_in_haut_milieu_bas = () => {
    const s = mk("kick_in_haut_milieu_bas", "Défendre une rentrée : haut, milieu ou bas");
    s.gka(2, 10).a(5, 20, 8).a(2, 22, 13).a(3, 16, 10).a(4, 12, 10).b(6, 21, 0.6).b(7, 24, 6).b(8, 26, 12);
    s.zone("target", [14, 0, 14, 20], 0.5, 12, "Zone de la rentrée");
    s.ball(0.3, 21.4, 0.8).go("A5", [0.5, 20, 8], [1.6, 22, 3]).arrow("press", "A5", "B6", 0.6, 1.6, "Presser le porteur").pass("pass", "B6", "B7", 1.8, 2.6, "Passe courte").go("A2", [1.6, 22, 13], [2.8, 25, 8]).go("A3", [1.6, 16, 10], [2.8, 20, 9]).arrow("press", "A2", "B7", 2.2, 2.8, "Couvrir la passe");
    return steps(s, "Rentrée adverse : l'équipe choisit un bloc haut, milieu ou bas avant la remise en jeu.", "Chacun connaît son marquage ou sa zone ; le plus proche presse le porteur, les autres ferment les passes.", "Choix annoncé avant la rentrée ; pas de joueur oublié ; le même signal pour tout le monde.");
  };

  D.gj_construction_3_2 = () => {
    const s = mk("gj_construction_3_2", "Gardien-joueur : construction en 3-2 contre 4");
    s.a(1, 12, 10, "Gardien-joueur").a(5, 18, 6).a(2, 18, 14).a(3, 26, 6).a(4, 26, 14).b(9, 20, 8).b(7, 20, 12).b(6, 28, 8).b(8, 28, 12);
    s.ball(0.3, 12.4, 10).pass("good", "A1", "A5", 0.6, 1.4, "Le gardien-joueur est le 5e").go("B9", [1.4, 20, 8], [2.6, 18, 7]).pass("good", "A5", "A2", 2, 2.8, "Changement d'aile").go("B7", [2.8, 20, 12], [3.8, 19, 13]).pass("good", "A2", "A4", 3.4, 4.2, "Passe entre les lignes").pass("good", "A4", [40, 9.6], 5, 5.8, "Tir");
    return steps(s, "Cinq contre quatre : le gardien-joueur sort le ballon et participe à la circulation.", "Circulation rapide, changements d'aile pour déséquilibrer les quatre défenseurs, passe entre les lignes puis tir.", "Une ligne de passe toujours ouverte ; ne pas garder le ballon plus de 4 s ; tir dès qu'un défenseur est battu.");
  };

  D.def_gj_pressing_5v4 = () => {
    const s = mk("def_gj_pressing_5v4", "Défendre le gardien-joueur : fermer l'axe, récupérer, tirer au but vide");
    s.gka(2, 10).a(5, 24, 10).a(2, 22, 5).a(3, 22, 15).a(4, 28, 10).b(1, 28, 10).b(9, 26, 6).b(7, 26, 14).b(6, 32, 8).b(8, 32, 12);
    s.ball(0.3, 26.4, 6).pass("pass", "B9", "B7", 0.6, 1.4).go("A5", [1.4, 24, 10], [2.6, 25, 11]).go("A2", [1.4, 22, 5], [2.6, 25, 6.4]).go("A3", [1.4, 22, 15], [2.6, 25, 13.6]).arrow("press", "A3", "B7", 1.5, 2.6, "Fermer l'axe, forcer sur l'aile");
    s.pass("bad", "B7", "B1", 3, 3.8, "Passe de sécurité coupée").ball(4, 28, 10).pass("good", "A4", [0.2, 10], 4.4, 6, "Tir sur but vide").label(20, 2.2, "Récupérer = tir immédiat", 6, 12, "#3ddc84", 0.9);
    return steps(s, "L'adversaire joue avec cinq joueurs de champ ; notre équipe défend à quatre en bloc.", "Fermer l'axe, forcer les passes latérales, intercepter et tirer immédiatement sur le but vide.", "Ne jamais courir derrière le ballon ; anticiper la passe vers le gardien-joueur ; tir sans contrôle inutile.");
  };

  D.activation_ballon_pieds = () => {
    const s = mk("activation_ballon_pieds", "Activation ballon aux pieds : passes et appuis");
    s.a(5, 14, 6).a(2, 14, 14).a(3, 24, 6).a(4, 24, 14);
    s.ball(0.3, 14.4, 6).pass("good", "A5", "A3", 0.6, 1.4, "Passe").go("A5", [1.4, 14, 6], [2.4, 14, 14]).pass("good", "A3", "A4", 2.2, 3, "Passe").go("A3", [3, 24, 6], [4, 14, 6]).pass("good", "A4", "A5", 3.8, 4.6).go("A4", [4.6, 24, 14], [5.6, 24, 6]).label(19, 10, "Passe et suis : on prend la place du partenaire", 5.6, 12, "#ffb020", 0.9);
    return steps(s, "Quatre joueurs échauffent leurs appuis en circulant autour d'un carré.", "Chaque passe est suivie d'un déplacement vers la place du partenaire ; le rythme augmente progressivement.", "Deux touches maximum ; regard levé ; passes tendues ; intensité progressive.");
  };

  D.jeu_reduit_3v3_gb = () => {
    const s = mk("jeu_reduit_3v3_gb", "Jeu réduit 3 contre 3 avec gardiens");
    s.gka(2, 10).a(5, 14, 10).a(2, 18, 5).a(3, 18, 15).b(9, 22, 10).b(7, 26, 6).b(8, 26, 14).gkb(38, 10);
    s.ball(0.3, 14.4, 10).pass("good", "A5", "A2", 0.6, 1.4).go("A2", [1.4, 18, 5], [2.6, 24, 6]).pass("good", "A2", "A3", 3, 3.8, "Jeu en triangle").go("A3", [3.8, 18, 15], [5, 30, 13]).pass("good", "A3", [40, 9.6], 5.4, 6.2, "Tir").label(20, 2.4, "Match : les thèmes de la séance rapportent des points", 6.4, 12, "#ffb020", 0.85);
    return steps(s, "Match réduit 3 contre 3 avec gardiens : on applique les thèmes travaillés.", "Jeu libre avec un bonus quand le thème est respecté (pressing, sortie courte, appel du pivot).", "Chaque but vaut un point ; un bonus pour le thème du jour ; arbitrage sans faute tolérée.");
  };

  D.match_conditionne_theme = () => {
    const s = mk("match_conditionne_theme", "Match conditionné : points bonus selon le thème");
    s.gka(2, 10).a(5, 16, 10).a(2, 14, 4).a(3, 14, 16).a(4, 10, 10).b(9, 22, 10).b(7, 24, 5).b(8, 24, 15).b(6, 28, 10).gkb(38, 10);
    s.ball(0.3, 2.6, 10).pass("good", "GKA", "A4", 0.8, 1.5, "Sortie courte = +1").pass("good", "A4", "A2", 2, 2.7).pass("good", "A2", "A5", 3.2, 4).go("A3", [4, 14, 16], [5.4, 28, 14]).pass("good", "A5", "A3", 4.6, 5.4).pass("good", "A3", [40, 9.6], 5.8, 6.6, "But");
    return steps(s, "Match 4 contre 4 avec gardiens : le thème de la séance est récompensé par des points bonus.", "Jeu libre, mais chaque action qui respecte le thème (sortie courte, pressing déclenché, appel du pivot) rapporte un point.", "Le coach compte les points du thème ; arrêt du jeu pour corriger une erreur répétée ; terminer par un match libre.");
  };

  return D;
});
