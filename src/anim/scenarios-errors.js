/* Animations de correction : une scène « erreur observée -> correction -> consigne » pour chaque erreur du catalogue.
   Mon équipe A (bleu) attaque vers la droite ; notre but est à gauche (x = 0). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./builder.js"));
  else root.FutsalScenesErrors = factory(root.FutsalSceneBuilder);
})(typeof self !== "undefined" ? self : this, function (SB) {
  "use strict";
  const { std, JT } = SB;
  const S = {};
  const P2 = JT + 0.3; // début de la correction
  const steps = (s, err, fix, tip) => s.step(0, JT + 0.1, "erreur", err).step(JT + 0.1, 11, "correction", fix).step(11, 14.5, "consigne", tip);

  S.relance_risquee = () => {
    const s = std("relance_risquee", "Relance risquée sous pression");
    s.set("A5", 8, 10).set("A2", 14, 4).set("A3", 14, 16).set("A4", 25, 10).set("B9", 13, 10).set("B7", 17, 6).set("B8", 17, 14).set("B6", 28, 10);
    s.ball(0, 2.7, 10).pass("bad", "GKA", "A5", 0.5, 1.5, "Passe dans l'axe");
    s.go("B9", [0.5, 13, 10], [2.2, 8.6, 10]).ball(2.2, 8.6, 10).pass("bad", "B9", [0.4, 10], 2.9, 3.8);
    s.mark("x", 8.2, 10, 2.2, 6.4).zone("danger", [0, 6.5, 7, 7], 3.4, 6.4, "But encaissé");
    s.jumpAll(JT, { A5: [9, 12], A2: [7, 4], A3: [14, 16], A4: [25, 10], B9: [13, 10], B7: [17, 6], B8: [17, 14], B6: [28, 10] }).ballJump(JT, 2.7, 10);
    s.pass("good", "GKA", "A2", 7.2, 8.2, "Côté faible").go("B9", [7.2, 13, 10], [8.6, 10, 6]);
    s.go("A4", [8.5, 25, 10], [9.5, 21, 10]).pass("good", "A2", "A4", 9.0, 10.4);
    s.zone("free", [2, 0, 10, 7], 7.2, 10.6, "Passe sûre");
    return steps(s, "Relance courte dans l'axe sous pression : le ballon est perdu à 8 m du but.", "Jouer d'abord sur le côté faible : l'ala redescend, la passe est sûre et sort du pressing.", "Ensuite seulement la passe vers le pivot. En cas de doute : relance longue.").done();
  };

  S.perte_zone_def = () => {
    const s = std("perte_zone_def", "Perte de balle en zone défensive");
    s.set("A5", 9, 10).set("A2", 12, 5).set("A3", 12, 15).set("B9", 16, 10).set("B7", 20, 6).set("B8", 20, 14);
    s.go("A5", [0, 9, 10], [2, 12, 10]).carry("A5", 0, 2).arrow("bad", "A5", [14, 10], 0.2, 1.8, "Dribble");
    s.go("B9", [1, 16, 10], [2.3, 12.6, 10]).ball(2.3, 12.6, 10).pass("bad", "B9", [0.4, 10], 3.2, 4.2);
    s.mark("x", 12, 10, 2.3, 6.4).zone("danger", [0, 6, 8, 8], 3.6, 6.4, "But en vue");
    s.jumpAll(JT, { A5: [9, 10], A2: [12, 5], A3: [12, 15], B9: [16, 10], B7: [20, 6], B8: [20, 14] }).ballJump(JT, 9.6, 10);
    s.pass("good", "A5", "A2", 7.3, 8.1, "Passe simple").go("A3", [7, 12, 15], [8, 10.5, 13]).pass("good", "A2", "A3", 8.8, 9.6, "Changement");
    s.zone("target", [8, 8, 7, 8], 7.2, 11, "Triangle de sécurité");
    return steps(s, "Dribble devant sa surface : le ballon est perdu, tir immédiat.", "Jeu simple dans son tiers : passe vers l'extérieur, triangle de sécurité autour du porteur.", "Jamais de dribble risqué devant son but : dégage ou passe latérale.").done();
  };

  S.perte_zone_mediane = () => {
    const s = std("perte_zone_mediane", "Perte de balle en zone médiane");
    s.set("A5", 14, 10).set("A4", 22, 10).set("A2", 14, 4).set("A3", 14, 16).set("B9", 19, 13).set("B6", 25, 9).set("B7", 26, 4).set("B8", 25, 16);
    s.ball(0, 14.6, 10).pass("bad", "A5", "A4", 0.5, 1.5, "Passe verticale").go("B9", [0.5, 19, 13], [1.5, 22, 10.6]).ball(2.1, 22.2, 10.6);
    s.pass("bad", "B9", "B8", 2.6, 3.4).mark("x", 22, 10, 1.7, 6.4);
    s.jumpAll(JT, { A5: [14, 10], A4: [22, 10], A2: [14, 4], A3: [14, 16], B9: [19, 13], B6: [25, 9], B7: [26, 4], B8: [25, 16] }).ballJump(JT, 14.6, 10);
    s.pass("good", "A5", "A3", 7.3, 8.1, "Passe tendue").go("A4", [8, 22, 10], [8.9, 21, 12]).pass("good", "A3", "A4", 8.9, 9.8);
    s.zone("target", [10, 6, 8, 8], 7.2, 11, "Un joueur derrière le ballon");
    return steps(s, "Passe verticale dans l'axe interceptée : la transition adverse démarre.", "Passes tendues vers l'ala, appel du pivot, un joueur reste derrière le ballon.", "Contrôle orienté, passe tendue, la rotation se fait ballon sécurisé.").done();
  };

  S.passe_imprecise = () => {
    const s = std("passe_imprecise", "Passe imprécise ou mal rythmée");
    s.set("A2", 14, 5).set("A4", 25, 10).set("B6", 27, 11).set("A5", 10, 10);
    s.go("A4", [0, 25, 10], [2, 30, 5]).ball(0, 14.6, 5).pass("bad", "A2", [25, 10], 0.5, 1.6, "Passe sans appel").go("B6", [1, 27, 11], [2, 25.5, 10]).ball(2, 25.5, 10);
    s.mark("x", 25, 10, 1.7, 6.4);
    s.jumpAll(JT, { A4: [25, 10], B6: [27, 11] }).ballJump(JT, 14.6, 5);
    s.go("A4", [7.2, 25, 10], [8, 22, 8]).arrow("goodrun", "A4", [22, 8], 7.2, 8, "Appel").pass("good", "A2", "A4", 8.2, 9.1, "Dans le pied");
    return steps(s, "Passe envoyée là où le partenaire était : il part dans l'autre sens, l'adversaire intercepte.", "Le receveur s'offre (appel), le passeur attend, puis passe tendue dans le pied.", "Regarde ton partenaire avant de passer ; le receveur se montre d'abord.").done();
  };

  S.absence_mouvement = () => {
    const s = std("absence_mouvement", "Absence de mouvement sans ballon");
    s.set("A5", 12, 10).set("A3", 17, 16).set("A2", 17, 4).set("A4", 25, 10).set("B9", 21, 10);
    s.ball(0, 12.6, 10).pass("bad", "A5", "A3", 0.5, 1.3).go("B9", [1.5, 21, 10], [3, 18.5, 13.5]);
    s.label(21, 10, "Personne ne bouge", 2, 6.4, "#ff5a5f", 1.1).mark("x", 17, 16, 2.5, 6.4);
    s.jumpAll(JT, { A5: [12, 10], A3: [17, 16], A2: [17, 4], A4: [25, 10], B9: [21, 10] }).ballJump(JT, 12.6, 10);
    s.pass("good", "A5", "A3", 7.3, 8.1).go("A5", [8.1, 12, 10], [9.4, 18, 12]).arrow("goodrun", "A5", [18, 12], 8.1, 9.4, "Passe et va");
    s.pass("good", "A3", [18, 12], 9.4, 10.2).go("A4", [10, 25, 10], [10.8, 28, 7]).pass("good", "A5", "A4", 10.8, 11.8);
    return steps(s, "Après sa passe, chaque joueur reste sur place : le porteur n'a aucune solution.", "Passe + mouvement : passe et va, l'appel crée la ligne de passe.", "Après la passe, bouge : un appel d'appui ou un appel de rupture.").done();
  };

  S.pivot_isole = () => {
    const s = std("pivot_isole", "Pivot isolé / non soutenu");
    s.set("A5", 10, 10).set("A4", 26, 10).set("A2", 13, 4).set("A3", 13, 16).set("B6", 28.5, 10).set("B9", 22.5, 10).set("B7", 20, 5).set("B8", 20, 15);
    s.ball(0, 10.6, 10).pass("bad", "A5", "A4", 0.5, 1.7, "Longue balle").go("B6", [1.5, 28.5, 10], [2.2, 27.2, 10]).ball(2.2, 27.2, 10);
    s.zone("danger", [22.5, 6.5, 7, 7], 1.7, 6.4, "Pivot seul").mark("x", 26, 10, 2.2, 6.4);
    s.jumpAll(JT, { A5: [10, 10], A4: [26, 10], A2: [21, 5], A3: [21, 15], B6: [28.5, 10], B9: [22.5, 10], B7: [20, 5], B8: [20, 15] }).ballJump(JT, 10.6, 10);
    s.pass("good", "A5", "A4", 7.4, 8.4).pass("good", "A4", "A2", 8.8, 9.6, "Remise").go("A2", [9.6, 21, 5], [10.6, 28, 4]).arrow("goodrun", "A2", [28, 4], 9.6, 10.6);
    s.zone("free", [22, 6, 8, 8], 7.2, 9.6, "Soutien à 4 m");
    return steps(s, "Balle longue vers le pivot sans soutien : il est pris à deux et perd le ballon.", "Un ala monte en soutien à 3–4 m ; le pivot remet en une touche.", "Pivot : protège avec le corps ; ala : viens en soutien.").done();
  };

  S.attaque_statique = () => {
    const s = std("attaque_statique", "Attaque prévisible / sans rotation");
    s.set("A5", 17, 10).set("A2", 20, 4).set("A3", 20, 16).set("A4", 28, 10).set("B6", 30, 10).set("B7", 27, 6).set("B8", 27, 14).set("B9", 24, 10);
    s.ball(0, 17.6, 10).pass("bad", "A5", "A2", 0.5, 1.3, "Même circuit").pass("bad", "A2", "A5", 2.1, 2.9).pass("bad", "A5", "A2", 3.7, 4.5);
    s.mark("x", 26, 10, 4.7, 6.4).label(23, 18.2, "Prévisible : le bloc ne bouge pas", 1.5, 6.4, "#ff5a5f", 0.9);
    s.jumpAll(JT, { A5: [17, 10], A2: [20, 4], A3: [20, 16], A4: [28, 10], B6: [30, 10], B7: [27, 6], B8: [27, 14], B9: [24, 10] }).ballJump(JT, 17.6, 10);
    s.go("A4", [8, 28, 10], [9, 21, 10]).arrow("goodrun", "A4", [21, 10], 7.6, 9, "Décroche").go("A2", [8.4, 20, 4], [10.4, 29, 6]).arrow("goodrun", "A2", [29, 6], 8.4, 10.4, "Plonge");
    s.pass("good", "A5", "A4", 7.4, 8.4).pass("good", "A4", "A2", 9.4, 10.6).zone("target", [27, 2, 8, 8], 9, 11.4, "Espace libéré");
    return steps(s, "Toujours le même circuit vers le même côté : la défense anticipe sans effort.", "Permutation ala–pivot : le pivot décroche, l'ala plonge dans son dos.", "Change de rythme, permute après la passe, fais bouger le bloc adverse.").done();
  };

  S.tir_precipite = () => {
    const s = std("tir_precipite", "Tir précipité ou mal préparé");
    s.set("A2", 16, 6).set("A4", 25, 10).set("A3", 20, 16).set("B7", 23, 5.5).set("B6", 28, 10);
    s.ball(0, 16.6, 6).pass("bad", "A2", [23, 5.6], 0.6, 1.4, "Tir à 24 m").mark("x", 23, 5.6, 1.4, 6.4);
    s.jumpAll(JT, { A2: [16, 6], A4: [25, 10], A3: [20, 16], B7: [23, 5.5], B6: [28, 10] }).ballJump(JT, 16.6, 6);
    s.pass("good", "A2", "A4", 7.4, 8.3).go("A3", [8, 20, 16], [9.2, 28, 14]).arrow("goodrun", "A3", [28, 14], 8, 9.2).pass("good", "A4", "A3", 9.2, 10.1);
    s.pass("good", "A3", [40, 9.3], 10.5, 11.3, "Tir cadré").go("A2", [10.5, 16, 6], [11.3, 34, 8]).arrow("goodrun", "A2", [34, 8], 10.5, 11.3, "Au rebond");
    return steps(s, "Frappe de loin dans le bloc adverse, sans construction : aucun danger.", "Une passe de plus, appel du second attaquant, frappe depuis un angle ouvert.", "Si l'angle est fermé, prends une touche de plus ; un joueur au rebond.").done();
  };

  S.occasion_manquee = () => {
    const s = std("occasion_manquee", "Occasion franche manquée");
    s.set("A3", 30, 12).set("A2", 24, 6).set("B6", 33, 10).set("GKB", 38.5, 10);
    s.ball(0, 30.6, 12).pass("bad", "A3", [40.5, 4], 0.6, 1.5, "Tir à côté").mark("x", 36, 8, 1.5, 6.4);
    s.jumpAll(JT, { A3: [30, 12], A2: [24, 6], B6: [33, 10], GKB: [38.5, 10] }).ballJump(JT, 30.6, 12);
    s.pass("good", "A3", [40, 8.4], 7.4, 8.2, "Frappe croisée").go("GKB", [7.4, 38.5, 10], [8.2, 39, 11.6]).go("A2", [7, 24, 6], [8.6, 34, 8]).arrow("goodrun", "A2", [34, 8], 7.2, 8.6, "Second poteau");
    return steps(s, "Face au gardien : tir précipité à côté du but.", "Regarde le gardien, frappe croisée côté opposé, un partenaire au second poteau.", "Reste lucide : le gardien décide, tu finis. Travaille la finition sous fatigue.").done();
  };

  S.dribble_excessif = () => {
    const s = std("dribble_excessif", "Dribble excessif ou conservation trop longue");
    s.set("A3", 20, 16).set("A4", 27, 8).set("B8", 24, 15).set("B7", 23, 5).set("A2", 21, 3);
    s.go("A3", [0, 20, 16], [2, 24, 12]).carry("A3", 0, 2).go("B8", [0, 24, 15], [1.8, 23, 13.5]).go("B7", [0, 23, 5], [1.6, 24, 10]);
    s.arrow("bad", "A3", [25, 11], 0.2, 1.8, "Encore un dribble").ball(2.4, 23.5, 12).mark("x", 24, 12, 2.4, 6.4);
    s.jumpAll(JT, { A3: [20, 16], A4: [27, 8], B8: [24, 15], B7: [23, 5], A2: [21, 3] }).ballJump(JT, 20.6, 16);
    s.pass("good", "A3", "A4", 7.4, 8.4, "Passe plutôt que dribble").pass("good", "A4", [40, 9.4], 9, 9.8, "Tir").go("A2", [8.6, 21, 3], [10, 30, 6]).arrow("goodrun", "A2", [30, 6], 8.6, 10);
    return steps(s, "Le porteur insiste en dribble contre deux défenseurs et perd le ballon.", "Un partenaire est libre : passe immédiate, il conclut.", "Deux touches maximum en zone dangereuse ; dribble seulement en 1c1 avec espace derrière.").done();
  };

  S.largeur_mal_occupee = () => {
    const s = std("largeur_mal_occupee", "Largeur mal occupée");
    s.set("A5", 21, 10).set("A2", 24, 8).set("A3", 24, 12).set("A4", 27, 10).set("B6", 31, 10).set("B7", 30, 6.5).set("B8", 30, 13.5).set("B9", 28.5, 9);
    s.ball(0, 21.6, 10).pass("bad", "A5", "A2", 0.5, 1.3).pass("bad", "A2", "A3", 2.0, 2.8).zone("danger", [20, 6, 9, 8], 0.5, 6.4, "Tout le monde dans l'axe").mark("x", 28, 10, 3.2, 6.4);
    s.jumpAll(JT, { A5: [20, 10], A2: [28, 2], A3: [28, 18], A4: [30, 10], B6: [31, 10], B7: [30, 6.5], B8: [30, 13.5], B9: [28.5, 9] }).ballJump(JT, 20.6, 10);
    s.pass("good", "A5", "A2", 7.4, 8.4).go("B7", [8, 30, 6.5], [9, 30, 3.5]).go("B8", [8, 30, 13.5], [9, 30, 10.5]).pass("good", "A2", "A3", 9.0, 10.2, "Changement d'aile");
    s.zone("free", [26, 0, 10, 5], 7.4, 9.4, "Largeur").zone("free", [26, 15, 10, 5], 9.4, 11.4, "Largeur");
    return steps(s, "Les alas se resserrent vers l'axe : la défense se compacte et bloque tout.", "Un joueur par couloir, un en profondeur : on étire puis on change d'aile.", "Largeur tenue, profondeur sans se placer sur la même ligne.").done();
  };

  S.contre_attaque_subie = () => {
    const s = std("contre_attaque_subie", "Contre-attaque adverse concédée");
    s.set("A5", 22, 10).set("A2", 28, 4).set("A3", 28, 16).set("A4", 31, 10).set("B9", 24, 10).set("B7", 23, 5).set("B8", 23, 15).set("B6", 30, 10);
    s.ball(0, 22.6, 10).pass("bad", "A5", "A4", 0.4, 1.2, "Passe risquée").go("B6", [0.4, 30, 10], [1.2, 30.8, 10]).ball(1.6, 30.8, 10).go("B6", [1.6, 30.8, 10], [4.8, 8, 10]).carry("B6", 1.6, 4.8);
    s.go("B7", [1.6, 23, 5], [4.8, 8, 6]).go("B8", [1.6, 23, 15], [4.8, 8, 14]).arrow("bad", "B6", [8, 10], 1.8, 4.6, "3 attaquants").label(14, 18.5, "Un seul défenseur : le gardien", 2.5, 6.4, "#ff5a5f", 0.95);
    s.jumpAll(JT, { A5: [14, 10], A2: [27, 4], A3: [27, 16], A4: [31, 10], B6: [30, 10], B7: [23, 5], B8: [23, 15], B9: [24, 10] }).ballJump(JT, 22.6, 10);
    s.pass("good", [22.6, 10], "A4", 7.2, 8, "Même attaque").go("B6", [7.4, 30, 10], [8, 30.8, 10]).ball(8.5, 30.8, 10).go("B6", [8.5, 30.8, 10], [10.8, 20, 10]).carry("B6", 8.5, 10.8);
    s.go("A2", [8.5, 27, 4], [10.8, 16, 6]).arrow("goodrun", "A2", [16, 6], 8.5, 10.8, "Repli").go("A3", [8.5, 27, 16], [10.8, 16, 14]).arrow("goodrun", "A3", [16, 14], 8.5, 10.8).go("A5", [8.5, 14, 10], [10.8, 17, 10]);
    s.mark("check", 17.8, 10, 11, 14.2).label(14, 12, "Sécurisant", 7.2, 14.2, "#3ddc84", 0.8);
    return steps(s, "Tous les joueurs sont en attaque : à la perte, trois adversaires lancés contre un défenseur.", "Un sécurisant reste derrière le ballon et temporise ; les autres replient dès la perte.", "Perte = repli immédiat ; le premier défenseur temporise, il n'engage pas.").done();
  };

  S.repli_tardif = () => {
    const s = std("repli_tardif", "Repli défensif tardif");
    s.set("A4", 24, 10).set("A2", 28, 4).set("A3", 28, 16).set("A5", 14, 10).set("B6", 26, 10).set("B7", 22, 6).set("B8", 22, 14).set("B9", 18, 10);
    s.ball(0, 24.6, 10).pass("bad", "A4", "B6", 0.4, 1.0).go("B6", [1, 26, 10], [4.4, 8, 10]).carry("B6", 1, 4.4);
    s.label(28, 10, "Les alas restent hauts", 1, 6.4, "#ff5a5f", 0.95).mark("x", 14, 10, 4.4, 6.4).arrow("bad", "B6", [8, 10], 1.2, 4.2);
    s.jumpAll(JT, { A4: [24, 10], A2: [28, 4], A3: [28, 16], A5: [14, 10], B6: [26, 10], B7: [22, 6], B8: [22, 14], B9: [18, 10] }).ballJump(JT, 24.6, 10);
    s.pass("good", "A4", "B6", 7.1, 7.7).go("B6", [7.7, 26, 10], [11, 14, 10]).carry("B6", 7.7, 11);
    s.go("A2", [7.7, 28, 4], [10.2, 15, 5]).arrow("goodrun", "A2", [15, 5], 7.7, 10.2, "Repli immédiat").go("A3", [7.7, 28, 16], [10.2, 15, 15]).arrow("goodrun", "A3", [15, 15], 7.7, 10.2);
    s.go("A5", [7.7, 14, 10], [11, 16, 10]).mark("check", 17, 10, 11.2, 14.2);
    return steps(s, "Après la perte, les alas restent en haut : le défenseur est seul face à l'attaque.", "Repli immédiat dès la perte ; un joueur temporise pendant que les autres reviennent.", "Perte → repli immédiat, reviens dans l'axe.").done();
  };

  S.transition_off_lente = () => {
    const s = std("transition_off_lente", "Transition offensive trop lente");
    s.set("A5", 10, 10).set("A2", 16, 4).set("A3", 16, 16).set("A4", 26, 10).set("B6", 28, 10).set("B7", 26, 5).set("B8", 26, 15).set("B9", 20, 10);
    s.ball(0, 2.8, 10).pass("bad", "GKA", "A5", 0.4, 1.4, "Récupération").pass("bad", "A5", "GKA", 2.2, 3.2, "On redonne").pass("bad", "GKA", "A5", 4, 5, "Circulation lente");
    s.go("B6", [2, 28, 10], [6, 31, 10]).go("B7", [2, 26, 5], [6, 33, 6]).go("B8", [2, 26, 15], [6, 33, 14]).label(24, 18.5, "Le bloc adverse a eu le temps de se replacer", 4.2, 6.4, "#ff5a5f", 0.9);
    s.jumpAll(JT, { A5: [10, 10], A2: [16, 4], A3: [16, 16], A4: [26, 10], B6: [28, 10], B7: [26, 5], B8: [26, 15], B9: [20, 10] }).ballJump(JT, 2.8, 10);
    s.pass("good", "GKA", "A2", 7.3, 8.1, "Vers l'avant").go("A2", [7.3, 16, 4], [8.8, 25, 4]).arrow("goodrun", "A2", [25, 4], 7.3, 8.8).go("B6", [7, 28, 10], [9.5, 31, 10]).go("B7", [7, 26, 5], [9.5, 33, 6]).go("B8", [7, 26, 15], [9.5, 33, 14]);
    s.pass("good", "A2", "A4", 8.8, 9.6).pass("good", "A4", [40, 9.4], 10.2, 11, "Tir en 8 s");
    return steps(s, "Ballon récupéré mais circulation lente : l'adversaire a le temps de se replacer.", "Première passe vers l'avant, l'ala est lancé en profondeur : attaque en 3 contre 2.", "Ballon récupéré = regarde devant, cours dans l'espace.").done();
  };

  S.superiorite_non_convertie = () => {
    const s = std("superiorite_non_convertie", "Supériorité numérique mal exploitée");
    s.set("A2", 24, 6).set("A4", 24, 14).set("B7", 31, 10).set("B9", 40, 0).set("B6", 40, 20).set("B8", 40, 0).set("A5", 10, 10).set("A3", 12, 16);
    s.go("A2", [0, 24, 6], [2, 30, 9]).carry("A2", 0, 2).go("B7", [0, 31, 10], [2, 30.4, 9.4]).arrow("bad", "A2", [30.5, 9.5], 0.2, 1.8, "Seul contre le défenseur").ball(2.4, 30.4, 9.4).mark("x", 30.4, 9.4, 2.4, 6.4);
    s.jumpAll(JT, { A2: [24, 6], A4: [24, 14], B7: [31, 10] }).ballJump(JT, 24.6, 6);
    s.go("A2", [7.2, 24, 6], [8.3, 29, 8]).go("B7", [7.2, 31, 10], [8.3, 30, 8.4]).carry("A2", 7.2, 8.3).arrow("goodrun", "A2", [29, 8], 7.2, 8.3, "Attire");
    s.pass("good", "A2", "A4", 8.4, 9.2, "Puis passe").pass("good", "A4", [40, 9.5], 9.8, 10.5, "But");
    return steps(s, "2 contre 1 : le porteur tente seul et le défenseur récupère.", "Attirer le défenseur avant la passe, écarter les attaquants, décider vite.", "Attire puis passe ; décide en moins de 4 secondes.").done();
  };

  S.pressing_desorganise = () => {
    const s = std("pressing_desorganise", "Pressing non coordonné");
    s.set("B9", 14, 12).set("B7", 16, 4).set("B8", 18, 16).set("B6", 24, 10).set("A2", 19, 8).set("A3", 22, 16).set("A4", 25, 10).set("A5", 10, 10);
    s.ball(0, 14.5, 12).go("A2", [0.3, 19, 8], [2, 14.8, 11]).arrow("badrun", "A2", [15, 11], 0.3, 1.9, "Un seul presse").pass("bad", "B9", "B7", 1.8, 2.6, "Sortie libre").pass("bad", "B7", "B6", 3.3, 4.2);
    s.mark("x", 15, 11, 2.2, 6.4);
    s.jumpAll(JT, { B9: [14, 12], B7: [16, 4], B8: [18, 16], B6: [24, 10], A2: [19, 8], A3: [22, 16], A4: [25, 10], A5: [10, 10] }).ballJump(JT, 14.5, 12);
    s.go("A2", [7.2, 19, 8], [8.2, 15, 11]).go("A3", [7.2, 22, 16], [8.2, 18, 14.5]).go("A4", [7.2, 25, 10], [8.2, 19, 9]).go("A5", [7.2, 10, 10], [8.2, 12, 9]);
    s.arrow("press", "A2", "B9", 7.3, 8.1).arrow("press", "A3", "B8", 7.3, 8.1).arrow("press", "A4", [19, 9], 7.3, 8.1).zone("press", [11, 6, 8, 10], 7.4, 10, "Pressing groupé");
    s.ball(8.5, 14.5, 12).ball(9.2, 14.6, 11.6);
    s.mark("check", 15, 11.3, 9.2, 14.2);
    return steps(s, "Un seul joueur presse : le ballon sort facilement, les lignes de passe restent ouvertes.", "Déclencheur commun : tout le bloc avance ensemble, ferme l'axe et la ligne de passe.", "On presse ensemble ou on ne presse pas : ferme l'axe, pousse vers l'extérieur.").done();
  };

  S.marquage_perdu = () => {
    const s = std("marquage_perdu", "Marquage perdu / joueur oublié");
    s.set("B9", 20, 10).set("B7", 7, 15).set("A5", 8, 9).set("A2", 10, 5).set("A3", 12, 13).set("A4", 25, 10).set("B8", 22, 15).set("B6", 28, 10);
    s.ball(0, 20.5, 10).pass("bad", "B9", "B7", 0.6, 1.8, "Passe au second poteau").pass("bad", "B7", [0.3, 9.5], 2.6, 3.4, "Tir").zone("danger", [4.5, 12.5, 5, 5], 1.8, 6.4, "Joueur libre").mark("x", 7, 15, 1.8, 6.4);
    s.jumpAll(JT, { B9: [20, 10], B7: [7, 15], A5: [8, 9], A2: [10, 5], A3: [12, 13], A4: [25, 10], B8: [22, 15], B6: [28, 10] }).ballJump(JT, 20.5, 10);
    s.go("A3", [7.2, 12, 13], [8, 8.4, 14.6]).arrow("press", "A3", "B7", 7.3, 8).go("A5", [7.2, 8, 9], [8, 9, 10.5]).go("A2", [7.2, 10, 5], [8, 15, 8]).arrow("press", "A2", "B9", 7.3, 8);
    s.label(8.4, 17, "A3 prend B7", 7.4, 12, "#3ddc84", 0.8).label(15, 5, "A2 prend B9", 7.4, 12, "#3ddc84", 0.8).mark("check", 8, 12.5, 8.4, 14.2);
    return steps(s, "Un adversaire est oublié au second poteau : passe, tir, but.", "Chaque joueur a une mission annoncée à voix haute : qui prend qui.", "Regarde ton joueur et le ballon ; transmets en cas de croisement.").done();
  };

  S.espace_dos_fixo = () => {
    const s = std("espace_dos_fixo", "Espace dans le dos du dernier défenseur");
    s.set("A5", 20, 10).set("A2", 22, 5).set("A3", 22, 15).set("A4", 26, 10).set("B9", 12, 10).set("B8", 24, 14).set("B7", 26, 6).set("B6", 30, 10);
    s.line([20, 0], [20, 20], 0.3, 6.4, "Ligne trop haute", "#ff5a5f").ball(0, 24.5, 14).pass("bad", "B8", "B9", 0.8, 2.0, "Balle dans le dos").go("B9", [2, 12, 10], [3, 7, 10]).pass("bad", "B9", [0.3, 10], 2.8, 3.6).zone("danger", [4, 4, 12, 12], 1.4, 6.4, "Espace dans le dos").mark("x", 12, 10, 2, 6.4);
    s.jumpAll(JT, { A5: [20, 10], A2: [22, 5], A3: [22, 15], A4: [26, 10], B9: [12, 10], B8: [24, 14], B7: [26, 6], B6: [30, 10] }).ballJump(JT, 24.5, 14);
    s.go("A5", [7.2, 20, 10], [8.2, 14, 10]).go("A2", [7.2, 22, 5], [8.5, 15, 4]).line([14, 0], [14, 20], 7.3, 12, "Ligne à 14 m", "#3ddc84");
    s.pass("bad", "B8", [12, 10], 8.4, 9.4, "Même balle").ball(10, 13.4, 10).go("A5", [9.4, 14, 10], [10, 13.5, 10]).label(4, 2.5, "Monte / reste !", 7.4, 12, "#3ddc84", 0.9).mark("check", 13.5, 10, 10, 14.2);
    return steps(s, "Ligne défensive trop haute : une balle dans le dos lance l'attaquant seul vers le gardien.", "Le fixo se cale à 14 m, un ala couvre son dos, le gardien dirige : la même balle est interceptée.", "Garde le ballon et l'espace dans ton champ de vision ; pressing haut seulement si la couverture suit.").done();
  };

  S.equipe_etiree = () => {
    const s = std("equipe_etiree", "Équipe trop étirée");
    s.set("A5", 8, 10).set("A2", 22, 4).set("A3", 22, 16).set("A4", 30, 10).set("B9", 15, 10).set("B7", 20, 8).set("B8", 20, 12).set("B6", 26, 10);
    s.line([8, 0], [8, 20], 0.3, 6.4, "22 m d'écart", "#ff5a5f", "left").line([30, 0], [30, 20], 0.3, 6.4, null, "#ff5a5f").zone("danger", [10, 6, 10, 8], 0.5, 6.4, "Espace entre les lignes");
    s.ball(0, 20.5, 8).pass("bad", "B7", "B9", 1.4, 2.4, "Passe entre les lignes").pass("bad", "B9", "B8", 3, 3.8).mark("x", 15, 10, 2.4, 6.4);
    s.jumpAll(JT, { A5: [13, 10], A2: [19, 5], A3: [19, 15], A4: [23, 10], B9: [15, 10], B7: [20, 8], B8: [20, 12], B6: [26, 10] }).ballJump(JT, 20.5, 8);
    s.line([13, 0], [13, 20], 7.3, 12, "10 m", "#3ddc84", "left").line([23, 0], [23, 20], 7.3, 12, null, "#3ddc84").zone("target", [12, 4, 12, 12], 7.3, 12, "Bloc compact");
    s.go("A2", [8.4, 19, 5], [10, 19, 8]).go("A3", [8.4, 19, 15], [10, 19, 12]).pass("bad", "B7", "B9", 8.6, 9.4).mark("check", 15, 10, 9.4, 14.2);
    return steps(s, "Les lignes sont à 22 m : l'adversaire s'engouffre entre les joueurs.", "Resserrer à 8–10 m et faire coulisser tout le bloc vers le ballon.", "Reste compact, coulisse ensemble, ferme l'axe.").done();
  };

  S.aide_defensive_absente = () => {
    const s = std("aide_defensive_absente", "Aide défensive absente");
    s.set("B8", 14, 14).set("A3", 14, 11.5).set("A5", 20, 8).set("A2", 20, 4).set("A4", 26, 10).set("B9", 22, 10).set("B7", 20, 16).set("B6", 28, 10);
    s.go("B8", [0, 14, 14], [2, 9, 10]).carry("B8", 0, 2).go("A3", [0, 14, 11.5], [1.4, 12, 11.5]).arrow("bad", "B8", [9, 10], 0.3, 1.8, "A3 est battu").label(20, 12.8, "Personne ne couvre", 1.5, 6.4, "#ff5a5f", 0.95);
    s.ball(2.2, 9, 10).pass("bad", "B8", [0.3, 10], 2.6, 3.4).mark("x", 12, 11.5, 1.5, 6.4);
    s.jumpAll(JT, { B8: [14, 14], A3: [14, 11.5], A5: [11, 9.5], A2: [20, 4], A4: [26, 10], B9: [22, 10], B7: [20, 16], B6: [28, 10] }).ballJump(JT, 14.5, 14);
    s.go("A5", [7.2, 11, 9.5], [8.2, 11.5, 12.2]).arrow("press", "A5", [11.5, 12.2], 7.3, 8).go("B8", [7.2, 14, 14], [8.4, 12.5, 13]).carry("B8", 7.2, 8.4).ball(9.2, 12.8, 12.8).mark("check", 12.5, 12.5, 9.2, 14.2);
    s.label(12, 17, "Doublement", 7.5, 12, "#3ddc84", 0.9);
    return steps(s, "Le défenseur est battu en 1 contre 1 et aucun partenaire ne couvre : tir.", "Le fixo se rapproche à 3–4 m et double : le dribbleur est stoppé.", "Couvre ton partenaire, prépare-toi à aider, parle !").done();
  };

  S.faute_evitable = () => {
    const s = std("faute_evitable", "Faute évitable");
    s.set("B9", 26, 10).set("A3", 22, 6).set("A5", 14, 10).set("A2", 20, 4).set("A4", 30, 10).set("B7", 28, 5).set("B8", 28, 15).set("B6", 34, 10);
    s.go("B9", [0, 26, 10], [2, 24, 10]).carry("B9", 0, 2).go("A3", [0, 22, 6], [2, 24.5, 9.6]).arrow("bad", "A3", [24.5, 9.6], 0.2, 1.8, "Tacle par derrière").mark("x", 24.3, 9.8, 2, 6.4);
    s.label(20, 2.5, "Fautes cumulées : 5 / 5 — la 6e = coup franc à 10 m sans mur", 2, 6.4, "#ff5a5f", 0.9);
    s.jumpAll(JT, { B9: [26, 10], A3: [22, 6], A5: [14, 10], A2: [20, 4], A4: [30, 10], B7: [28, 5], B8: [28, 15], B6: [34, 10] }).ballJump(JT, 26.6, 10);
    s.go("B9", [7, 26, 10], [9, 24, 9]).carry("B9", 7, 9).go("A3", [7, 22, 6], [8.6, 23.4, 8]).arrow("press", "A3", [23.4, 8], 7.3, 8.6, "Placement").ball(9.4, 23.8, 9).mark("check", 24, 9, 9.4, 14.2);
    s.label(20, 2.5, "Fautes cumulées : 3 / 5", 7.3, 14.4, "#3ddc84", 0.9);
    return steps(s, "Tacle par derrière loin du but : faute inutile, compteur à 5.", "Se placer avant d'engager, jockey, puis intercepter plutôt que charger.", "Intercepte au lieu de charger ; surveille le compteur de fautes.").done();
  };

  S.duel_perdu = () => {
    const s = std("duel_perdu", "Duel 1 contre 1 perdu");
    s.set("A3", 20, 12).set("B8", 24, 14).set("A5", 12, 10).set("A2", 20, 4).set("A4", 28, 10).set("B9", 25, 8).set("B7", 28, 4).set("B6", 30, 10);
    s.go("A3", [0, 20, 12], [1.2, 22.4, 13.4]).go("B8", [0, 24, 14], [2, 19, 11]).carry("B8", 0, 2).arrow("bad", "A3", [23, 13.8], 0.2, 1.2, "Il plonge").mark("x", 22.4, 13.4, 1.4, 6.4);
    s.arrow("bad", "B8", [12, 10], 2, 4.6, "Battu").go("B8", [2, 19, 11], [4.6, 12, 10]).carry("B8", 2, 4.6);
    s.jumpAll(JT, { A3: [20, 12], B8: [24, 14], A5: [12, 10], A2: [20, 4], A4: [28, 10], B9: [25, 8], B7: [28, 4], B6: [30, 10] }).ballJump(JT, 24.6, 14);
    s.go("B8", [7, 24, 14], [9, 22, 16.5]).carry("B8", 7, 9).go("A3", [7, 20, 12], [9, 21.5, 14.2]).arrow("press", "A3", [22.5, 15.5], 7.2, 9, "Jockey").zone("target", [14, 17, 12, 3], 7.4, 11, "Vers la touche").mark("check", 22, 16.5, 9.4, 14.2);
    return steps(s, "Le défenseur plonge : l'attaquant le dribble et file vers le but.", "Jockey : appuis bas, on recule en orientant le porteur vers la touche, sans plonger.", "Ne tacle que sur ballon dégagé ; demande la couverture du partenaire.").done();
  };

  S.erreur_gardien = () => {
    const s = std("erreur_gardien", "Erreur de placement ou d'arrêt du gardien");
    s.set("GKA", 3.5, 13).set("B7", 12, 6).set("A5", 9, 12).set("A2", 14, 14).set("A3", 18, 16).set("A4", 26, 10).set("B9", 17, 10).set("B8", 22, 15).set("B6", 28, 10);
    s.ball(0, 12.4, 6).line([12, 6], [0, 10], 0.4, 6.4, "Ligne ballon → but", "#ffb020", "left").pass("bad", "B7", [0.2, 8.7], 0.8, 1.6, "Tir près du poteau").mark("x", 0.5, 8.7, 1.6, 6.4);
    s.label(6.5, 16, "Gardien trop décalé", 0.5, 6.4, "#ff5a5f", 0.9);
    s.jumpAll(JT, { GKA: [3.5, 13], B7: [12, 6] }).ballJump(JT, 12.4, 6);
    s.go("GKA", [7.1, 3.5, 13], [8.1, 1, 8.7]).line([12, 6], [0, 10], 7.2, 11, "Sur la ligne ballon → but", "#3ddc84", "left").pass("bad", "B7", [0.9, 8.8], 8.4, 9.2, "Même tir").mark("check", 1, 8.8, 9.2, 14.2);
    return steps(s, "Gardien mal placé : le tir passe près du poteau.", "Se placer sur la ligne ballon–but, sur les appuis, angle fermé : arrêt.", "Place-toi sur la ligne ballon–but, reste sur tes appuis, lis le tireur.").done();
  };

  S.sortie_gardien = () => {
    const s = std("sortie_gardien", "Sortie du gardien mal timée");
    s.set("B9", 14, 10).set("GKA", 1.5, 10).set("A5", 20, 12).set("A2", 20, 4).set("A3", 22, 16).set("A4", 28, 10).set("B7", 24, 5).set("B8", 24, 15).set("B6", 30, 10);
    s.go("B9", [0, 14, 10], [3, 6.5, 10]).carry("B9", 0, 3).go("GKA", [2, 1.5, 10], [3.1, 3.8, 10]).arrow("bad", "GKA", [3.8, 10], 2, 3, "Sort trop tard").pass("bad", "B9", [0.2, 10], 3.2, 4.2, "Lob").mark("x", 2, 10, 4.2, 6.4);
    s.jumpAll(JT, { B9: [14, 10], GKA: [1.5, 10], A5: [20, 12], A2: [20, 4], A3: [22, 16], A4: [28, 10] }).ballJump(JT, 14.5, 10);
    s.go("B9", [7, 14, 10], [9.2, 7.5, 10]).carry("B9", 7, 9.2).go("GKA", [7.3, 1.5, 10], [8.4, 5.6, 10]).arrow("press", "GKA", [5.6, 10], 7.4, 8.4, "Sort tôt").zone("target", [3, 7, 4, 6], 7.6, 11, "Angle fermé").ball(9.8, 5.8, 10).mark("check", 5.7, 10, 9.8, 14.2);
    return steps(s, "Le gardien sort trop tard : lob au-dessus de lui.", "Sortir tôt, rester bas, réduire l'angle : l'attaquant ne trouve plus de solution.", "Sors vite ou reste ; ne sors que si le ballon est atteignable.").done();
  };

  S.regle_4s = () => {
    const s = std("regle_4s", "Violation de la règle des 4 secondes");
    s.set("A2", 14, 0.3).set("A5", 10, 8).set("A3", 18, 6).set("A4", 24, 8).set("B9", 14, 4).set("B7", 20, 2).set("B8", 22, 12).set("B6", 26, 10);
    s.ball(0, 14.4, 0.4).label(14, 2.8, "1 s", 0.5, 1.5, "#ffb020", 1.1).label(14, 2.8, "2 s", 1.5, 2.5, "#ffb020", 1.1).label(14, 2.8, "3 s", 2.5, 3.5, "#ff8a3d", 1.1).label(14, 2.8, "4 s", 3.5, 4.5, "#ff5a5f", 1.1);
    s.mark("x", 14.4, 0.4, 4.5, 6.4).label(22, 16, "Touche perdue : remise pour l'adversaire", 4.5, 6.4, "#ff5a5f", 0.9);
    s.jumpAll(JT, { A2: [14, 0.3], A5: [10, 8], A3: [18, 6], A4: [24, 8], B9: [14, 4], B7: [20, 2], B8: [22, 12], B6: [26, 10] }).ballJump(JT, 14.4, 0.4);
    s.label(14, 2.8, "1 s", 7.2, 8, "#3ddc84", 1.1).go("A5", [7.2, 10, 8], [8, 11, 5]).arrow("goodrun", "A5", [11, 5], 7.2, 8, "Appel").pass("good", "A2", "A5", 8.4, 9.2, "Remise avant 4 s").label(14, 2.8, "2 s", 8.2, 9.2, "#3ddc84", 1.1);
    return steps(s, "Le joueur hésite sur la touche : 4 secondes passent, la balle est perdue.", "Décider avant d'avoir le ballon, appel du partenaire, remise en 2 secondes.", "4 secondes = vite : prévois la solution avant la remise.").done();
  };

  S.gj_perte_balle = () => {
    const s = std("gj_perte_balle", "Perte de balle en power play");
    s.set("GKA", 14, 10).set("A5", 22, 10).set("A2", 26, 4).set("A3", 26, 16).set("A4", 30, 8).set("B9", 27, 9.5).set("B7", 33, 5).set("B8", 33, 15).set("B6", 35, 10).set("GKB", 39, 10);
    s.ball(0, 22.5, 10).pass("bad", "A5", "A4", 0.5, 1.5, "Passe dans l'axe").go("B9", [0.5, 27, 9.5], [1.5, 28, 9]).ball(2, 28, 9).pass("bad", "B9", [0.3, 10], 2.5, 4.2, "But dans la cage vide").mark("x", 28, 9, 2, 6.4);
    s.label(7, 18, "Cage vide : le gardien-joueur est monté", 1.5, 6.4, "#ff5a5f", 0.9);
    s.jumpAll(JT, { GKA: [14, 10], A5: [22, 10], A2: [26, 4], A3: [26, 16], A4: [30, 8], B9: [27, 9.5], B7: [33, 5], B8: [33, 15], B6: [35, 10] }).ballJump(JT, 22.5, 10);
    s.pass("good", "A5", "GKA", 7.4, 8.2, "Relais arrière").pass("good", "GKA", "A2", 8.9, 9.8, "Changement d'aile").pass("good", "A2", "A4", 10.4, 11.2);
    s.label(16, 15, "Joueur de sécurité", 7.4, 14, "#3ddc84", 0.85).arrow("goodrun", "A3", [20, 15], 7.6, 9, "Sécurité").go("A3", [7.6, 26, 16], [9, 20, 15]);
    return steps(s, "Passe risquée dans l'axe à 5 contre 4 : interceptée, tir dans le but vide.", "On passe par le relais arrière et les côtés, un joueur de sécurité reste derrière le ballon.", "Pas de risque au centre ; ballon sécurisé avant d'attaquer.").done();
  };

  S.gj_timing = () => {
    const s = std("gj_timing", "Timing du gardien-joueur inadapté");
    s.set("GKA", 2, 10).set("A5", 12, 6).set("A2", 18, 14).set("A3", 20, 4).set("A4", 24, 10).set("B9", 22, 9).set("B7", 26, 5).set("B8", 26, 15).set("B6", 30, 10);
    s.go("GKA", [0.5, 2, 10], [2.2, 14, 10]).label(20, 18, "Gardien-joueur lancé sans plan", 0.5, 6.4, "#ff5a5f", 0.9).ball(0, 12.6, 6).pass("bad", "A5", "A2", 1.2, 2.2).go("B9", [2.2, 22, 9], [3, 18.5, 13]).ball(3, 18.5, 13).pass("bad", "B9", [0.3, 10], 3.4, 5.4, "But").mark("x", 18, 14, 3, 6.4);
    s.jumpAll(JT, { GKA: [2, 10], A5: [12, 6], A2: [18, 14], A3: [20, 4], A4: [24, 10], B9: [22, 9] }).ballJump(JT, 12.6, 6);
    s.label(20, 18, "Temps mort : structure 3-2 posée", 7.1, 9.6, "#3ddc84", 0.9).go("GKA", [8.5, 2, 10], [10.6, 12, 10]).go("A5", [8.5, 12, 6], [10.6, 16, 6]).go("A2", [8.5, 18, 14], [10.6, 28, 4]).go("A3", [8.5, 20, 4], [10.6, 16, 14]).go("A4", [8.5, 24, 10], [10.6, 28, 16]);
    s.label(20, 18, "Signal : 5e faute adverse", 10.8, 14.4, "#3ddc84", 0.9);
    return steps(s, "Le gardien-joueur est lancé au hasard, l'équipe n'est pas en place : but encaissé.", "Moment choisi (temps mort, 5e faute adverse, fin de match) puis structure posée avant de jouer.", "Moment choisi, pas subi : un signal clair pour toute l'équipe.").done();
  };

  S.gj_repli_non_assure = () => {
    const s = std("gj_repli_non_assure", "Retour au but non assuré après perte");
    s.set("GKA", 20, 10).set("A5", 24, 10).set("A2", 28, 4).set("A3", 28, 16).set("A4", 31, 10).set("B9", 26, 9).set("B7", 33, 5).set("B8", 33, 15).set("B6", 36, 10);
    s.ball(0, 24.5, 10).pass("bad", "A5", "B9", 0.4, 1.0).go("B9", [1, 26, 9], [1.1, 26, 9]).pass("bad", "B9", [0.2, 10], 1.6, 4.4, "Tir dans la cage vide").go("GKA", [1.5, 20, 10], [3, 17, 10]).label(20, 18, "Le gardien-joueur ne revient pas", 1.5, 6.4, "#ff5a5f", 0.9).mark("x", 14, 10, 4, 6.4);
    s.jumpAll(JT, { GKA: [14, 10], A5: [24, 10], A2: [28, 4], A3: [28, 16], A4: [31, 10], B9: [26, 9], B7: [33, 5], B8: [33, 15], B6: [36, 10] }).ballJump(JT, 24.5, 10);
    s.pass("good", "A5", "B9", 7.1, 7.6).pass("good", "B9", [0.9, 10], 8, 10.4, "Tir").go("GKA", [7.7, 14, 10], [10, 1.4, 10]).arrow("goodrun", "GKA", [3, 10], 7.7, 9.6, "Retour immédiat").mark("check", 1.5, 10, 10.4, 14.2);
    return steps(s, "Ballon perdu : le gardien-joueur reste en avant, tir dans la cage vide.", "À la perte, le gardien-joueur est le premier à reculer ; un joueur de sécurité gêne le tireur.", "Perte = retour immédiat ; sécurité toujours derrière la ligne médiane.").done();
  };

  S.cpa_def_desorganise = () => {
    const s = std("cpa_def_desorganise", "Coup franc défendu de façon désorganisée");
    s.set("B9", 14, 6).set("A2", 11.4, 7.2).set("A3", 11.4, 8.4).set("A5", 8, 12).set("A4", 20, 10).set("B7", 7, 15).set("B8", 20, 4).set("B6", 24, 10).set("GKA", 1.8, 10);
    s.ball(0, 14.4, 6.2).line([14, 6], [11.4, 7.2], 0.2, 6.4, "Mur à 3 m", "#ff5a5f", "left").pass("bad", "B9", "B7", 1.5, 2.6, "Passe au second poteau").pass("bad", "B7", [0.2, 9.5], 3.2, 4, "Tir").zone("danger", [4.5, 12.5, 5, 5], 2.6, 6.4, "Joueur libre").mark("x", 7, 15, 2.6, 6.4);
    s.jumpAll(JT, { B9: [14, 6], A2: [9, 8.6], A3: [9, 9.8], A5: [8, 12], A4: [20, 10], B7: [7, 15] }).ballJump(JT, 14.4, 6.2);
    s.go("A5", [7.3, 8, 12], [8.4, 7.4, 14.2]).arrow("press", "A5", "B7", 7.4, 8.4).line([14, 6], [9, 8.6], 7.3, 12, "Mur à 5 m, serré", "#3ddc84", "left").label(3, 4, "Annonce du gardien", 7.4, 12, "#3ddc84", 0.8);
    s.pass("bad", "B9", [9.3, 9.2], 8.6, 9.4, "Frappe dans le mur").mark("check", 9.2, 9.2, 9.4, 14.2);
    return steps(s, "Mur trop proche, un adversaire libre au second poteau : passe, tir.", "Mur serré à 5 m, un joueur désigné au second poteau, gardien qui annonce.", "Chaque joueur a une mission ; mur serré, gardien avancé.").done();
  };

  S.cpa_off_rate = () => {
    const s = std("cpa_off_rate", "Coup de pied arrêté offensif raté");
    s.set("A2", 24, 0.3).set("A4", 28, 8).set("A3", 22, 14).set("A5", 16, 10).set("B6", 30, 9).set("B7", 27, 5).set("B8", 26, 13).set("B9", 22, 8);
    s.ball(0, 24.4, 0.4).pass("bad", "A2", "A4", 0.8, 1.8, "Toujours la même touche").go("B6", [1, 30, 9], [1.8, 28.4, 8.6]).ball(2.2, 28.4, 8.6).mark("x", 28, 8, 2.2, 6.4);
    s.jumpAll(JT, { A2: [24, 0.3], A4: [28, 8], A3: [22, 14], A5: [16, 10], B6: [30, 9], B7: [27, 5], B8: [26, 13], B9: [22, 8] }).ballJump(JT, 24.4, 0.4);
    s.go("A4", [7.2, 28, 8], [8.2, 28, 7]).label(28, 4.6, "Écran", 7.4, 10, "#3ddc84", 0.8).go("A3", [7.4, 22, 14], [9.2, 28, 11]).arrow("goodrun", "A3", [28, 11], 7.4, 9.2, "Appel dans le dos").pass("good", "A2", "A4", 8.2, 9, "Remise").pass("good", "A4", "A3", 9.4, 10.2).pass("good", "A3", [40, 9.4], 10.7, 11.5, "Tir");
    return steps(s, "Touche toujours identique vers le même joueur : l'adversaire anticipe et récupère.", "Schéma répété : un écran du pivot, appel dans son dos, remise puis tir.", "Un schéma = un appel = un signal ; pense à l'option B.").done();
  };

  return S;
});
