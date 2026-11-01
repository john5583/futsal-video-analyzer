/* Animations des exercices rattachés au plan de jeu (voir knowledge/seance.js) : mise en place, déroulement, critères de réussite.
   Mon équipe A (bleu) attaque vers la droite (but adverse en x = 40), adversaire B (rouge), terrain 40 × 20 m. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./builder.js"));
  else root.FutsalScenesDrillsPlan = factory(root.FutsalSceneBuilder);
})(typeof self !== "undefined" ? self : this, function (SB) {
  "use strict";
  const D = {};
  const mk = (id, title) => SB.Scene(id, title, 13);
  const steps = (s, setup, run, crit) => s.step(0, 3.5, "exercice", setup).step(3.5, 10, "exercice", run).step(10, 13, "consigne", crit);

  D.pressing_haut_4v4 = () => {
    const s = mk("pressing_haut_4v4", "Pressing haut : déclencheur et fermeture");
    s.gka(2, 10).a(5, 24, 10, "Pivot").a(2, 22, 5).a(3, 22, 15).a(4, 16, 10).b(9, 31, 10).b(7, 29, 6).b(8, 29, 14).b(6, 33, 10).gkb(38, 10);
    s.zone("target", [26, 0, 14, 20], 0.5, 12, "Zone de pressing haut");
    s.ball(0.3, 31, 10).pass("bad", "B9", "B6", 0.5, 1.2, "Passe en retrait = déclencheur");
    s.go("A5", [1.2, 24, 10], [2.6, 31.4, 10]).arrow("press", "A5", "B6", 1.3, 2.6, "Je presse le porteur").go("A2", [1.2, 22, 5], [2.6, 29, 6.6]).go("A3", [1.2, 22, 15], [2.6, 29, 13.4]).go("A4", [1.2, 16, 10], [2.8, 26, 10]);
    s.ball(3, 33, 10).ball(3.4, 32, 10).pass("good", "A5", [40, 9.4], 3.6, 4.4, "Tir en moins de 6 s").mark("check", 31.4, 10, 3.4, 9);
    return steps(s, "Quatre joueurs pressent dans la moitié adverse ; le déclencheur est une passe en retrait.", "Le plus proche presse le porteur, les autres ferment les lignes de passe et se rapprochent.", "Récupération haute en moins de 6 s ; fermer l'axe avant les côtés ; ne jamais presser seul.").done();
  };

  D.bloc_bas_4v4 = () => {
    const s = mk("bloc_bas_4v4", "Bloc bas : fermer l'axe et protéger la zone de tir");
    s.gka(2, 10).a(5, 9, 10).a(2, 8, 5).a(3, 8, 15).a(4, 13, 10).b(9, 18, 10).b(7, 17, 4).b(8, 17, 16).b(6, 22, 10);
    s.zone("target", [0, 5, 10, 10], 0.5, 12, "Axe à protéger");
    s.ball(0.3, 18, 10).pass("pass", "B9", "B7", 0.6, 1.4, "Jeu vers l'aile");
    s.go("A2", [1.4, 8, 5], [2.8, 10, 4.6]).go("A5", [1.4, 9, 10], [2.8, 9.6, 7.4]).go("A3", [1.4, 8, 15], [2.8, 8.4, 12.2]).go("A4", [1.4, 13, 10], [2.8, 11.6, 8.4]).arrow("press", "A2", "B7", 1.5, 2.8, "Je glisse, je couvre l'axe");
    s.ball(2.2, 17, 4).pass("pass", "B7", "B6", 3.6, 4.4, "Pas de tir : l'axe est fermé").mark("check", 9.6, 8, 3.6, 9);
    return steps(s, "Quatre défenseurs en bloc bas contre quatre attaquants ; l'axe devant le but est la zone à protéger.", "Le bloc glisse vers le ballon sans ouvrir l'axe ; le joueur le plus proche ferme l'angle de tir.", "Distances courtes entre les lignes ; aucun tir dans l'axe ; sortie rapide dès la récupération.").done();
  };

  D.compacite_9m = () => {
    const s = mk("compacite_9m", "Compacité : bloc de 9 mètres");
    s.a(5, 20, 4).a(2, 20, 12).a(3, 26, 6).a(4, 26, 14).b(9, 30, 10).b(7, 34, 7).b(8, 34, 13);
    s.zone("free", [18, 3, 9, 9], 0.5, 12, "9 m au plus entre le plus haut et le plus bas");
    s.ball(0.3, 30, 10).pass("pass", "B9", "B7", 0.6, 1.4).go("A5", [1.4, 20, 4], [2.8, 22, 6]).go("A2", [1.4, 20, 12], [2.8, 22, 11]).go("A3", [1.4, 26, 6], [2.8, 27, 8]).go("A4", [1.4, 26, 14], [2.8, 27, 13]);
    s.pass("pass", "B7", "B8", 3.4, 4.2).go("A5", [3.4, 22, 6], [4.6, 22, 9]).go("A2", [3.4, 22, 11], [4.6, 22, 13]).go("A3", [3.4, 27, 8], [4.6, 27, 11]).go("A4", [3.4, 27, 13], [4.6, 27, 15]).label(22, 18.5, "Le bloc se déplace ensemble", 4.6, 12, "#ffb020", 0.9);
    return steps(s, "Quatre joueurs gardent leurs distances pendant que l'adversaire fait circuler le ballon.", "À chaque passe, tout le bloc glisse : la ligne la plus haute et la plus basse restent à 9 m au plus.", "Mesurer l'écart à chaque arrêt : au-delà de 9 m, le groupe recommence ; variante à 13 m pour la compacité normale.").done();
  };

  D.sortie_3_1_pivot = () => {
    const s = mk("sortie_3_1_pivot", "Sortie de balle en 3-1 : trouver le pivot");
    s.gka(2, 10).a(2, 8, 4).a(3, 8, 16).a(4, 10, 10).a(5, 22, 10, "Pivot").b(9, 14, 7).b(7, 14, 13);
    s.ball(0.3, 2.6, 10).pass("good", "GKA", "A4", 0.6, 1.3).go("B9", [1.3, 14, 7], [2.4, 11.5, 8]).go("B7", [1.3, 14, 13], [2.4, 11.5, 12]).pass("good", "A4", "A2", 1.9, 2.6, "Côté libre");
    s.go("A5", [2.6, 22, 10], [3.8, 20, 10]).arrow("goodrun", "A5", [20, 10], 2.6, 3.8, "Appel du pivot").pass("good", "A2", "A5", 3.2, 4.1, "Passe au pivot, dos au but");
    s.pass("good", "A5", "A3", 4.7, 5.5, "Remise").go("A3", [4.7, 8, 16], [6.2, 24, 15]).carry("A3", 5.5, 6.2).label(20, 2.2, "Ligne médiane franchie", 6.4, 12, "#3ddc84", 0.9);
    return steps(s, "Gardien et trois défenseurs contre deux attaquants qui pressent ; le pivot reste devant.", "Sortie par le côté libre, le pivot appelle, reçoit dos au but et remet à un partenaire lancé.", "Le pivot protège le ballon avec le corps ; remise en une touche ; au moins une sortie sur trois par le pivot.").done();
  };

  D.losange_triangles = () => {
    const s = mk("losange_triangles", "Losange 1-2-1 : triangles et lignes de passes");
    s.a(5, 16, 10, "Base").a(2, 22, 4, "Ailier").a(3, 22, 16, "Ailier").a(4, 28, 10, "Pivot").b(9, 21, 10).b(7, 25, 10);
    s.ball(0.3, 16.4, 10).pass("good", "A5", "A2", 0.6, 1.4).go("A5", [1.4, 16, 10], [2.8, 22, 10]).pass("good", "A2", "A4", 2.4, 3.2).go("A2", [3.2, 22, 4], [4.6, 16, 10]);
    s.pass("good", "A4", "A3", 4, 4.8).go("A3", [4.8, 22, 16], [6.4, 26, 10]).arrow("goodrun", "A3", [26, 10], 4.8, 6.4, "Je prends la place libre").pass("good", "A3", "A5", 6.8, 7.6, "Passe et suis");
    return steps(s, "Quatre joueurs en losange dans une zone de 20 m ; deux défenseurs au milieu.", "Chaque passe est suivie d'un déplacement : on prend la place laissée libre pour garder le losange.", "Toujours deux solutions de passe en triangle ; passes en une ou deux touches ; le losange ne s'aplatit jamais.").done();
  };

  D.carre_diagonales = () => {
    const s = mk("carre_diagonales", "Carré 2-2 : diagonales et changements d'axe");
    s.a(5, 16, 6).a(2, 16, 14).a(3, 24, 6).a(4, 24, 14).b(6, 20, 10).b(7, 21, 8);
    s.ball(0.3, 16.5, 6).pass("good", "A5", "A4", 0.6, 1.5, "Diagonale").go("B6", [1.5, 20, 10], [2.7, 22, 12]).go("B7", [1.5, 21, 8], [2.7, 22, 11]).pass("good", "A4", "A3", 3.1, 3.9, "Changement d'axe");
    s.go("A2", [3.9, 16, 14], [5.2, 22, 14]).pass("good", "A3", "A2", 4.6, 5.4).pass("good", "A2", "A5", 6, 6.9, "Diagonale inverse").label(20, 2.6, "Le défenseur ne peut pas suivre deux diagonales", 6.9, 12, "#ffb020", 0.85);
    return steps(s, "Quatre joueurs aux coins d'un carré de 8 m ; deux défenseurs au centre.", "Passes en diagonale puis changement d'axe : le carré tourne pour étirer les deux défenseurs.", "Aucune passe dans l'axe sous pression ; changement d'axe en moins de 2 passes ; deux touches maximum.").done();
  };

  D.gj_perte_retour = () => {
    const s = mk("gj_perte_retour", "Gardien-joueur : perte de balle et retour au but");
    s.a(1, 24, 10, "Gardien-joueur").a(5, 26, 6).a(2, 28, 14).a(3, 32, 10).b(9, 26, 12);
    s.zone("target", [0, 6, 3, 8], 0.5, 12, "But vide : retour obligatoire");
    s.ball(0.3, 26, 6).pass("bad", "A5", "B9", 0.6, 1.4, "Perte de balle").pass("bad", "B9", [1, 10], 2, 3.6, "Tir vers le but vide");
    s.go("A1", [1.4, 24, 10], [3.6, 2.4, 10]).arrow("goodrun", "A1", [2.4, 10], 1.5, 3.6, "Retour immédiat au but").mark("check", 2.4, 10, 3.6, 9);
    return steps(s, "Cinq contre quatre avec le gardien monté : à la perte, le but est vide.", "Dès la perte, le gardien-joueur sprinte vers son but pendant que le plus proche retarde le porteur.", "Retour au but en moins de 4 s ; le plus proche ralentit le tir ; ne monter que ballon sous contrôle.").done();
  };

  D.zero_perte_zone_def = () => {
    const s = mk("zero_perte_zone_def", "Zéro perte dans sa zone : toujours une solution de sécurité");
    s.gka(2, 10).a(5, 8, 10).a(2, 6, 4).a(3, 6, 16).a(4, 13, 10).b(9, 10, 10).b(7, 12, 7);
    s.zone("target", [0, 0, 14, 20], 0.5, 12, "Zone où aucune perte n'est permise");
    s.ball(0.3, 8.4, 10).pass("good", "A5", "A2", 0.6, 1.4, "Solution de sécurité").go("B9", [1.4, 10, 10], [2.6, 8, 6]).go("B7", [1.4, 12, 7], [2.6, 8, 8]);
    s.pass("good", "A2", "GKA", 2.2, 3, "Retour au gardien").pass("good", "GKA", "A3", 3.6, 4.4, "Changement d'aile").go("A3", [3.6, 6, 16], [5, 14, 15]).carry("A3", 4.4, 5);
    return steps(s, "Quatre joueurs et le gardien sortent le ballon sous la pression de deux attaquants.", "Avant de recevoir, chacun repère sa solution de sécurité ; en cas de doute, retour au gardien ou jeu long côté libre.", "Aucune perte dans la zone : un point par sortie réussie ; en cas de perte le groupe recommence.").done();
  };

  D.pressing_relance_gardien = () => {
    const s = mk("pressing_relance_gardien", "Presser la relance du gardien adverse");
    s.a(5, 28, 10).a(2, 29, 6).a(3, 29, 14).a(4, 22, 10).b(9, 33, 10).b(7, 33, 5).gkb(38, 10);
    s.ball(0.3, 37.4, 10).pass("pass", "GKB", "B9", 0.6, 1.3, "Relance courte");
    s.go("A5", [1.3, 28, 10], [2.5, 32, 10]).arrow("press", "A5", "B9", 1.4, 2.5, "Fermer la passe dans l'axe").go("A2", [1.3, 29, 6], [2.5, 33, 6.4]).go("A3", [1.3, 29, 14], [2.5, 34, 12]);
    s.pass("bad", "B9", "B7", 2.9, 3.6, "Passe forcée vers l'aile").go("A2", [3.6, 33, 6.4], [4.2, 33.4, 5.6]).ball(4.4, 33.4, 5.6).pass("good", "A2", [40, 9.6], 4.8, 5.6, "Tir").mark("check", 33.4, 5.6, 4.6, 10);
    return steps(s, "Le gardien adverse relance à la main ; trois joueurs pressent dans sa moitié.", "Le premier ferme la passe dans l'axe, les deux autres couvrent l'aile : la relance est forcée.", "Récupération haute en moins de 5 s ; couvrir la passe de sécurité avant de presser le porteur.").done();
  };

  D.transition_def_3s = () => {
    const s = mk("transition_def_3s", "Transition défensive : les 3 premières secondes");
    s.gka(2, 10).a(5, 24, 10).a(2, 22, 5).a(3, 22, 15).a(4, 14, 10).b(9, 28, 10).b(7, 30, 6).b(8, 30, 14);
    s.zone("target", [14, 4, 12, 12], 0.5, 12, "Zone à fermer en premier");
    s.ball(0.3, 24.4, 10).pass("bad", "A5", "B9", 0.6, 1.3, "Balle perdue").label(20, 2.2, "3 s", 1.3, 2.3, "#ffb020", 1.2).label(20, 2.2, "2 s", 2.3, 3.3, "#ff8a3d", 1.2);
    s.go("B9", [1.3, 28, 10], [3.6, 22, 10]).carry("B9", 1.3, 3.6).go("A5", [1.3, 24, 10], [3.2, 22.6, 10]).arrow("press", "A5", "B9", 1.4, 3.2, "Je retarde le porteur");
    s.go("A2", [1.3, 22, 5], [3.2, 16, 7]).go("A3", [1.3, 22, 15], [3.2, 16, 13]).go("A4", [1.3, 14, 10], [3.2, 13, 10]).mark("check", 22.6, 10, 3.6, 9);
    return steps(s, "À la perte du ballon, l'équipe a trois secondes pour se replacer devant son but.", "Le plus proche retarde le porteur sans se faire éliminer, les autres reviennent vers l'axe et ferment les lignes.", "Porteur ralenti dès la première seconde ; deux défenseurs dans l'axe avant la 3e seconde ; pas de faute.").done();
  };

  return D;
});
