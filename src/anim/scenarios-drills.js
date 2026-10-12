/* Animations des exercices recommandés : mise en place, déroulement, critères de réussite. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./builder.js"));
  else root.FutsalScenesDrills = factory(root.FutsalSceneBuilder);
})(typeof self !== "undefined" ? self : this, function (SB) {
  "use strict";
  const D = {};
  const mk = (id, title) => SB.Scene(id, title, 13);
  const steps = (s, setup, run, crit) => s.step(0, 3.5, "exercice", setup).step(3.5, 10, "exercice", run).step(10, 13, "consigne", crit);
  const square = (s, k, x, y, w, h) => s.cone(k + "a", x, y).cone(k + "b", x + w, y).cone(k + "c", x + w, y + h).cone(k + "d", x, y + h);

  D.relance_pression = () => {
    const s = mk("relance_pression", "Relance sous pression gardien + fixo");
    s.gka(2, 10).a(5, 9, 10, "Fixo").a(2, 8, 3, "Ala").a(3, 8, 17, "Ala").b(9, 14, 8).b(7, 14, 12).cone(1, 20, 0.5).cone(2, 20, 19.5);
    s.ball(0.5, 2.6, 10).pass("good", "GKA", "A2", 1, 2, "Côté faible").go("B9", [1, 14, 8], [2.6, 9, 5]).go("B7", [1, 14, 12], [2.6, 12, 9]).pass("good", "A2", "A5", 2.8, 3.6).pass("good", "A5", "A3", 4.4, 5.4, "Changement d'aile");
    s.go("A3", [5.4, 8, 17], [8, 19, 14]).carry("A3", 5.4, 8).arrow("goodrun", "A3", [19, 14], 5.4, 8, "Sortie").zone("target", [20, 0, 2, 20], 5, 12, "Ligne médiane en < 8 s");
    return steps(s, "Le gardien relance contre deux attaquants qui pressent ; 3 joueurs offrent des solutions.", "Passe d'abord vers le côté faible, puis changement d'aile et conduite pour franchir la ligne médiane.", "Pas de passe dans l'axe sous pression ; appel de dégagement à chaque relance ; relance en 4 s maximum.").done();
  };

  D.rondo_4v2 = () => {
    const s = mk("rondo_4v2", "Rondo 4 contre 2");
    square(s, "q", 16, 6, 8, 8).a(1, 16, 6).a(2, 24, 6).a(3, 24, 14).a(4, 16, 14).b(1, 19, 9).b(2, 21, 11);
    s.ball(0.3, 16.5, 6).pass("good", "A1", "A2", 0.6, 1.3).go("B1", [0.6, 19, 9], [1.4, 21, 7.5]).go("B2", [0.6, 21, 11], [1.4, 22, 8]).pass("good", "A2", "A3", 2, 2.7).go("B1", [2, 21, 7.5], [2.8, 22, 11.5]).go("B2", [2, 22, 8], [2.8, 19, 12]);
    s.pass("good", "A3", "A1", 3.4, 4.4, "Diagonale").go("B1", [3.4, 22, 11.5], [4.6, 18, 8.5]).go("B2", [3.4, 19, 12], [4.6, 19, 9]).pass("good", "A1", "A4", 5.2, 5.9).pass("good", "A4", "A3", 6.6, 7.6).go("B1", [5.2, 18, 8.5], [8, 21, 12]).go("B2", [5.2, 19, 9], [8, 23, 9]);
    s.label(20, 3.5, "Perte → le perdant devient défenseur", 8, 12, "#ffb020", 0.85);
    return steps(s, "Carré 8 × 8 m : quatre joueurs conservent le ballon contre deux défenseurs.", "Circulation rapide, jeu en diagonale, les défenseurs se déplacent ensemble.", "Deux touches maximum, passes tendues, appel avant la passe, corps ouvert.").done();
  };

  D.contre_pressing_5s = () => {
    const s = mk("contre_pressing_5s", "Contre-pressing 5 secondes");
    s.gka(2, 10).a(5, 14, 10).a(2, 16, 5).a(3, 16, 15).a(4, 22, 10).b(9, 18, 10).b(7, 20, 6).b(8, 20, 14).b(6, 26, 10).gkb(38, 10);
    s.ball(0.3, 14.6, 10).pass("bad", "A5", "B9", 0.4, 1, "Balle perdue").label(20, 2.6, "5 s", 1, 2, "#ffb020", 1.2).label(20, 2.6, "4 s", 2, 3, "#ffb020", 1.2).label(20, 2.6, "3 s", 3, 4, "#ff8a3d", 1.2).label(20, 2.6, "2 s", 4, 5, "#ff5a5f", 1.2);
    s.go("A5", [1, 14, 10], [2.4, 17.5, 10]).go("A2", [1, 16, 5], [2.6, 19, 7.5]).go("A3", [1, 16, 15], [2.6, 19, 12.5]).go("A4", [1, 22, 10], [2.8, 20.5, 10]).arrow("press", "A5", "B9", 1.1, 2.4).arrow("press", "A2", "B9", 1.1, 2.6).arrow("press", "A3", "B9", 1.1, 2.6);
    s.go("B9", [1, 18, 10], [3.2, 18.4, 10]).ball(3.2, 18.4, 10).ball(4.2, 17.8, 10).mark("check", 17.8, 10, 4.4, 9).label(20, 17, "Récupéré en 4 s", 4.4, 9, "#3ddc84", 0.95);
    return steps(s, "À 4 contre 4, dès qu'une équipe perd le ballon elle a 5 secondes pour le reprendre.", "Le plus proche presse, les autres ferment les lignes de passe : le ballon est récupéré.", "Pressing immédiat ; si la récupération échoue, repli instantané.").done();
  };

  D.repli_3v2 = () => {
    const s = mk("repli_3v2", "Repli défensif 4 contre 3");
    s.gka(2, 10).a(5, 12, 10).a(2, 10, 5).a(3, 24, 16).b(9, 26, 10).b(7, 24, 5).b(8, 24, 15).b(6, 30, 10);
    s.go("B9", [0.5, 26, 10], [4, 14, 10]).carry("B9", 0.5, 4).go("B7", [0.5, 24, 5], [4, 12, 6]).go("B8", [0.5, 24, 15], [4, 12, 14]).arrow("bad", "B9", [14, 10], 0.5, 3.8, "Attaque 3 contre 2");
    s.go("A3", [0.5, 24, 16], [4, 14, 14]).arrow("goodrun", "A3", [14, 14], 0.5, 4, "Repli").go("A5", [0.5, 12, 10], [3, 11, 10]).arrow("press", "A5", "B9", 3, 4.2, "Temporise").zone("target", [8, 6, 8, 8], 3, 9, "Fermer l'axe");
    s.ball(4.6, 14, 10).pass("bad", "B9", "B7", 5, 5.7).go("A2", [5, 10, 5], [6, 11, 7]).mark("check", 12, 7, 7, 12);
    return steps(s, "Une attaque 3 contre 2 démarre ; un défenseur revient de loin.", "Le premier défenseur temporise, les autres replient dans l'axe à hauteur du ballon.", "Communication continue ; ne plonge pas ; protège l'axe avant la largeur.").done();
  };

  D.superiorite_2v1 = () => {
    const s = mk("superiorite_2v1", "Supériorité 2 contre 1 / 3 contre 2");
    s.a(2, 22, 6).a(4, 22, 14).b(7, 30, 10).gkb(38, 10);
    s.go("A2", [0.3, 22, 6], [2.2, 28, 8]).carry("A2", 0.3, 2.2).go("B7", [0.3, 30, 10], [2.2, 29.6, 8.8]).arrow("goodrun", "A2", [28, 8], 0.3, 2.2, "Attire le défenseur");
    s.pass("good", "A2", "A4", 2.5, 3.3, "Passe").go("A4", [0.3, 22, 14], [2.5, 27, 13]).pass("good", "A4", [40, 9.2], 4.4, 5.2, "Tir").go("GKB", [4.4, 38, 10], [5.2, 39, 8.8]);
    s.zone("target", [26, 11, 6, 6], 2.5, 9, "Distance entre attaquants");
    return steps(s, "Deux attaquants contre un défenseur et le gardien, départ à mi-terrain.", "Le porteur attire le défenseur puis passe : le partenaire conclut seul.", "Attire avant la passe, reste en mouvement, tir ou passe en 4 secondes maximum.").done();
  };

  D.pressing_zone = () => {
    const s = mk("pressing_zone", "Pressing coordonné en 4 contre 4");
    s.gka(2, 10).a(5, 14, 10).a(2, 20, 5).a(3, 20, 15).a(4, 24, 10).b(9, 12, 12).b(7, 14, 4).b(8, 16, 16).b(6, 22, 10).gkb(38, 10);
    s.ball(0.3, 12.6, 12).label(20, 18.5, "Déclencheur : passe en retour", 0.5, 4, "#ffb020", 0.9).pass("bad", "B9", "B6", 0.8, 1.8, "Passe en retour");
    s.go("A2", [1.8, 20, 5], [3.6, 17, 9]).go("A3", [1.8, 20, 15], [3.6, 19, 13]).go("A4", [1.8, 24, 10], [3.6, 21, 10]).go("A5", [1.8, 14, 10], [3.6, 17, 10]);
    s.arrow("press", "A2", "B6", 1.9, 3.6).arrow("press", "A3", "B8", 1.9, 3.6).arrow("press", "A4", [21, 10], 1.9, 3.6).zone("press", [14, 6, 10, 8], 2, 9, "Bloc qui avance ensemble");
    s.pass("bad", "B6", "B7", 4.2, 4.9).ball(5.6, 22.6, 10).mark("check", 22, 10, 5.8, 10);
    return steps(s, "Le groupe qui défend définit des déclencheurs de pressing communs.", "Dès le signal, tout le bloc avance, ferme l'axe et oriente vers l'extérieur.", "Pressing à la même seconde ; si le pressing est battu, repli immédiat.").done();
  };

  D.marquage_cpa = () => {
    const s = mk("marquage_cpa", "Organisation défensive sur coup franc");
    s.gka(1.8, 10).a(2, 9, 8.6).a(3, 9, 9.8).a(5, 8, 12.5).a(4, 7, 5).b(9, 14, 6).b(7, 7, 15).b(8, 12, 15).b(6, 11, 3);
    s.ball(0.3, 14.4, 6.2).line([14, 6], [9, 8.6], 0.3, 10, "Mur à 5 m", "#3ddc84", "left").label(3.5, 3.4, "Annonce du gardien", 0.5, 10, "#3ddc84", 0.8).arrow("press", "A5", "B7", 1, 2.4, "Second poteau").go("A5", [1, 8, 12.5], [2.4, 7.4, 14]);
    s.arrow("press", "A4", "B6", 1, 2.4, "Marque B6").go("A4", [1, 7, 5], [2.4, 10.4, 3.6]).pass("bad", "B9", [9.3, 9.2], 3.6, 4.4, "Frappe dans le mur").mark("check", 9.2, 9.2, 4.4, 9);
    return steps(s, "Chaque joueur reçoit une mission : mur, second poteau, marquage, relance.", "Le mur se place à 5 m, le gardien annonce ; la frappe est bloquée.", "Mur serré, un joueur à la relance courte, communication gardien–mur.").done();
  };

  D.cpa_off = () => {
    const s = mk("cpa_off", "Schémas de coups de pied arrêtés offensifs");
    s.a(2, 39.4, 0.6).a(3, 35, 3).a(4, 36, 9).a(5, 30, 10).b(6, 37, 6).b(7, 35, 11).gkb(38.5, 10);
    s.ball(0.3, 39.4, 0.8).pass("good", "A2", "A3", 1, 1.8, "Corner court").go("A4", [1, 36, 9], [2.4, 36, 5.6]).label(36, 3.8, "Écran", 1.4, 6, "#3ddc84", 0.8);
    s.go("A5", [1, 30, 10], [3, 34, 8]).arrow("goodrun", "A5", [34, 8], 1.2, 3, "Appel").pass("good", "A3", "A5", 3, 3.9).pass("good", "A5", [40, 9.3], 4.6, 5.4, "Tir");
    return steps(s, "Un schéma répété pour le corner : corner court, écran, appel, tir.", "Exécution en moins de 4 secondes avec une option de tir et une option de remise.", "Un schéma = un signal ; écran sans faute ; option B prévue.").done();
  };

  D.pivot_appui = () => {
    const s = mk("pivot_appui", "Pivot : jeu de dos et soutien");
    s.a(5, 16, 10, "Fixo").a(4, 28, 10, "Pivot").a(2, 22, 4, "Ala").a(3, 22, 16, "Ala").b(6, 30, 10).b(9, 18, 10);
    s.ball(0.3, 16.6, 10).pass("good", "A5", "A4", 0.8, 1.8, "Pivot reçoit dos au but").go("A2", [1.5, 22, 4], [3, 25, 6]).arrow("goodrun", "A2", [25, 6], 1.5, 3, "Soutien à 3–4 m").zone("free", [24, 4, 8, 8], 1.5, 5, "Protéger le ballon");
    s.pass("good", "A4", "A2", 3.4, 4.2, "Remise de première").go("A4", [4.2, 28, 10], [5.4, 31, 11]).arrow("goodrun", "A4", [31, 11], 4.2, 5.4, "Appel dans le dos").pass("good", "A2", "A4", 5.8, 6.6);
    return steps(s, "Le pivot reçoit dos au but, un ala vient en soutien.", "Protection du ballon, remise immédiate à l'ala qui monte, puis passe et va dans le dos du défenseur.", "Protège avec le corps, remise en une touche, soutien à 3–4 m.").done();
  };

  D.rotation_4_0 = () => {
    const s = mk("rotation_4_0", "Circulation et rotations");
    s.a(1, 18, 10).a(2, 24, 5).a(3, 30, 10).a(4, 24, 15).b(6, 28, 7).b(7, 28, 13);
    s.ball(0.3, 18.6, 10).pass("good", "A1", "A2", 0.6, 1.4).go("A1", [1.4, 18, 10], [3.4, 24, 5]).arrow("goodrun", "A1", [24, 5], 1.4, 3.4, "Prend la place").go("A2", [1.4, 24, 5], [3.4, 30, 10]);
    s.pass("good", "A2", "A3", 3.6, 4.4).go("A3", [4.4, 30, 10], [6.4, 24, 15]).arrow("goodrun", "A3", [24, 15], 4.4, 6.4).go("A4", [4.4, 24, 15], [6.4, 18, 10]).pass("good", "A3", "A4", 6.6, 7.4);
    s.label(21, 2.4, "Un joueur reste toujours derrière le ballon", 1, 11, "#ffb020", 0.85);
    return steps(s, "Quatre joueurs en losange mobile, d'abord sans opposition.", "Le passeur prend la place du receveur : la rotation tourne en continu.", "Rotation seulement ballon sécurisé ; un joueur derrière le ballon ; appel avant la passe.").done();
  };

  D.passe_et_va = () => {
    const s = mk("passe_et_va", "Passe et va, croisements, paredes");
    s.a(1, 16, 16).a(2, 22, 10).b(6, 27, 10).cone(1, 28, 12);
    s.ball(0.3, 16.6, 16).pass("good", "A1", "A2", 0.6, 1.4, "Passe").go("A1", [1.4, 16, 16], [3.2, 26, 12]).arrow("goodrun", "A1", [26, 12], 1.4, 3.2, "Appel").pass("good", "A2", [26, 12], 2.4, 3.4, "Remise").go("B6", [1, 27, 10], [2.6, 25, 9]);
    s.go("A1", [3.4, 26, 12], [5, 31, 11]).carry("A1", 3.4, 5).pass("good", "A1", [40, 9.4], 5.4, 6.1, "Tir");
    return steps(s, "Deux joueurs et un défenseur passif : passe, appel, remise immédiate.", "Le un-deux casse la ligne défensive et crée l'accélération.", "Aucun joueur statique ; passe tendue au pied avant ; changement de rythme.").done();
  };

  D.finition_cadence = () => {
    const s = mk("finition_cadence", "Finition sous pression temporelle");
    s.a(1, 22, 6).a(2, 26, 14).a(3, 30, 10).b(7, 31, 6).b(8, 31, 14).gkb(38.5, 10);
    s.label(20, 3, "8 s", 0.3, 1.5, "#ffb020", 1.2).label(20, 3, "5 s", 3, 4, "#ff8a3d", 1.2).label(20, 3, "2 s", 6, 7, "#ff5a5f", 1.2);
    s.ball(0.3, 22.6, 6).pass("good", "A1", "A2", 0.6, 1.6).pass("good", "A2", "A3", 2.4, 3.2).go("A1", [1.6, 22, 6], [4.6, 32, 4]).arrow("goodrun", "A1", [32, 4], 1.6, 4.6, "Rebond");
    s.pass("good", "A3", [40, 8.6], 4, 4.8, "Tir cadré").go("GKB", [4, 38.5, 10], [4.8, 39, 9]).label(36, 12.8, "Points doubles : cadré après 3 passes", 5, 12, "#3ddc84", 0.85);
    return steps(s, "Quatre attaquants et un gardien : 8 secondes pour tirer après la récupération.", "Trois passes puis tir : le second attaquant suit au rebond.", "Tir après préparation du corps, choix du poteau, rebond suivi.").done();
  };

  D.gardien_jeu_pied = () => {
    const s = mk("gardien_jeu_pied", "Gardien : jeu au pied et relance");
    s.gka(2, 10).a(5, 10, 10).a(2, 9, 3).a(3, 9, 17);
    s.ball(0.3, 2.5, 10).label(5, 6.2, "≤ 4 s", 0.4, 1.4, "#ffb020", 1).pass("good", "GKA", "A2", 1, 1.8, "Lancer rasant").pass("good", "A2", "A5", 2.6, 3.4).pass("good", "A5", "GKA", 4.2, 5, "Passe au gardien").pass("good", "GKA", "A3", 5.8, 6.7, "Passe tendue");
    return steps(s, "Le gardien fait circuler le ballon avec trois joueurs.", "Relance à la main puis au pied, redonne au gardien, change de côté.", "Relance en 4 secondes, passe dans le pied intérieur, communique avant la relance.").done();
  };

  D.gj_5v4 = () => {
    const s = mk("gj_5v4", "Power play 5 contre 4");
    s.gka(14, 10).a(5, 20, 14).a(2, 28, 4).a(3, 28, 16).a(4, 31, 10).b(6, 30, 7).b(7, 30, 13).b(8, 34, 9).b(9, 34, 11).cone(1, 18, 10);
    s.ball(0.3, 14.6, 10).pass("good", "GKA", "A5", 0.6, 1.4, "Relais").pass("good", "A5", "A2", 2, 2.8).go("B6", [2, 30, 7], [3, 29, 5]).go("B7", [2, 30, 13], [3, 29, 12]).pass("good", "A2", "A4", 3.6, 4.4).pass("good", "A4", "A3", 5, 5.8).pass("good", "A3", [40, 9.4], 6.4, 7.2, "Tir");
    s.label(10, 17, "Joueur de sécurité", 0.5, 12, "#3ddc84", 0.85).label(20, 2.4, "Pas de passe risquée au centre", 0.5, 12, "#ffb020", 0.85);
    return steps(s, "Attaque avec gardien-joueur contre quatre défenseurs, 20 secondes maximum.", "Le ballon circule par le relais arrière et les côtés jusqu'à l'ouverture.", "Gardien-joueur comme relais, joueur de sécurité désigné, repli immédiat à la perte.").done();
  };

  D.def_5v4 = () => {
    const s = mk("def_5v4", "Défense contre gardien-joueur");
    s.gka(2, 10).a(5, 10, 6).a(2, 10, 14).a(3, 6, 10).a(4, 14, 10).b(6, 20, 4).b(7, 20, 16).b(8, 26, 10).b(9, 16, 10).b(1, 20, 10);
    s.zone("target", [4, 6, 12, 8], 0.5, 12, "Fermer l'axe").go("A5", [1, 10, 6], [3, 12, 7]).go("A2", [1, 10, 14], [3, 12, 13]).go("A4", [1, 14, 10], [3, 16, 9.5]).arrow("press", "A4", "B9", 1.2, 3).ball(0.3, 16.6, 10).pass("bad", "B9", "B6", 3.4, 4.2).go("A5", [4.2, 12, 7], [5.4, 14, 5]).arrow("press", "A5", [14, 5], 4.2, 5.4, "Oriente vers le côté");
    s.ball(6.2, 20.5, 4).pass("good", "A5", [0.5, 10], 7.4, 8.6, "Dès la récupération : tir dans le but vide").mark("check", 14, 5, 6.2, 12);
    return steps(s, "Quatre défenseurs contre cinq attaquants, le but adverse est vide.", "Fermer l'axe, orienter vers les côtés, communiquer sur les croisements.", "Récupération puis tir immédiat ; fermer les lignes de passe centrales.").done();
  };

  D.duel_1v1_def = () => {
    const s = mk("duel_1v1_def", "Jockey et 1 contre 1 défensif");
    s.cone(1, 14, 7).cone(2, 14, 13).cone(3, 26, 7).cone(4, 26, 13).a(1, 16, 10).b(1, 24, 10);
    s.go("B1", [0.5, 24, 10], [4, 17, 11.5]).carry("B1", 0.5, 4).go("A1", [0.5, 16, 10], [4, 21, 11]);
    s.arrow("press", "A1", [21, 11], 0.5, 4, "Jockey, oriente vers la touche").zone("target", [14, 11, 12, 2], 1, 9, "Vers la touche").mark("check", 19, 11.4, 4.6, 9);
    return steps(s, "Défenseur et attaquant dans un couloir de 4 × 10 m.", "Le défenseur recule en jockey, oriente vers la touche, attend le ballon dégagé.", "Appuis bas, oriente vers la ligne, ne tacle que sur ballon dégagé.").done();
  };

  D.regle_4s = () => {
    const s = mk("regle_4s", "Rythme des 4 secondes");
    s.a(2, 14, 0.4).a(5, 10, 8).a(3, 18, 6).b(9, 16, 4).cone(1, 14, 2);
    s.ball(0.3, 14.4, 0.5).label(14, 3.2, "1", 0.5, 1.4, "#ffb020", 1.4).label(14, 3.2, "2", 1.4, 2.3, "#ffb020", 1.4).label(14, 3.2, "3", 2.3, 3.2, "#ff8a3d", 1.4).label(14, 3.2, "4", 3.2, 4.1, "#ff5a5f", 1.4);
    s.go("A5", [0.5, 10, 8], [1.6, 11, 5]).arrow("goodrun", "A5", [11, 5], 0.5, 1.6, "Appel").pass("good", "A2", "A5", 2.3, 3, "Remise avant 4 s").label(22, 16, "Dépassement = point pour l'adversaire", 4.5, 12, "#ffb020", 0.85);
    return steps(s, "Un chronométreur compte 4 secondes à chaque remise en jeu.", "Le joueur remet avant la fin du décompte, grâce à l'appel préparé.", "Décision avant la remise ; partenaires déjà placés ; rapide mais sûr.").done();
  };

  D.jeu_de_position = () => {
    const s = mk("jeu_de_position", "Jeu de position : largeur et profondeur");
    s.a(5, 14, 10).a(2, 24, 2).a(3, 24, 18).a(4, 32, 10).b(6, 28, 7).b(7, 28, 13);
    s.zone("free", [20, 0, 10, 5], 0.5, 12, "Couloir").zone("free", [20, 15, 10, 5], 0.5, 12, "Couloir");
    s.ball(0.3, 14.6, 10).pass("good", "A5", "A2", 0.8, 1.8).go("B6", [1.8, 28, 7], [3, 26, 4]).pass("good", "A2", "A4", 2.4, 3.3, "Profondeur").pass("good", "A4", "A3", 4, 4.9).go("B7", [1.8, 28, 13], [3.4, 27, 15]).label(26, 10, "3 passes : changement d'aile", 5, 12, "#ffb020", 0.85);
    return steps(s, "Un joueur toujours dans chaque couloir, un autre en profondeur.", "Après trois passes, changement d'aile obligatoire.", "Largeur tenue, profondeur sans se placer sur la même ligne, changement d'aile rapide.").done();
  };

  D.duel_propre = () => {
    const s = mk("duel_propre", "Duels sans faute");
    s.a(1, 18, 8).a(2, 24, 14).b(1, 21, 11).b(2, 26, 7);
    s.label(20, 2.6, "Fautes : 0", 0.3, 4, "#3ddc84", 1).label(20, 2.6, "Fautes : 0 — interception !", 4, 12, "#3ddc84", 1);
    s.ball(0.3, 21.6, 11).go("A1", [0.5, 18, 8], [3, 20.6, 10.4]).arrow("press", "A1", [20.6, 10.4], 0.5, 3, "Se placer avant d'engager").go("B1", [1, 21, 11], [3.4, 22, 12]).carry("B1", 1, 3.4).ball(4.2, 21.4, 11.4).mark("check", 21, 11, 4.4, 12);
    return steps(s, "Deux contre deux : toute faute donne un coup franc direct à l'adversaire.", "Placement du pied, interception plutôt que charge, arrêt du porteur avec le corps.", "Pas de tacle par derrière, intercepter plutôt que charger, pas de bras.").done();
  };

  D.transition_off = () => {
    const s = mk("transition_off", "Contre-attaque 3 contre 2");
    s.gka(2, 10).a(5, 12, 10).a(2, 14, 4).a(3, 14, 16).b(6, 20, 8).b(7, 22, 12).gkb(38, 10);
    s.ball(0.3, 2.5, 10).label(14, 18.6, "Ballon récupéré", 0.3, 2, "#ffb020", 0.9).pass("good", "GKA", "A2", 0.8, 1.6, "Vers l'avant").go("A2", [1.6, 14, 4], [3.2, 26, 4]).carry("A2", 1.6, 3.2).arrow("goodrun", "A5", [24, 10], 1, 3.2, "Course dans l'axe").go("A5", [1, 12, 10], [3.2, 24, 10]).go("A3", [1, 14, 16], [3.2, 24, 16]);
    s.go("B6", [0.5, 20, 8], [3, 30, 8]).go("B7", [0.5, 22, 12], [3, 31, 12]).pass("good", "A2", "A5", 3.4, 4.1).pass("good", "A5", "A3", 4.6, 5.4).pass("good", "A3", [40, 9.4], 6, 6.8, "Finition en ≤ 8 s");
    return steps(s, "Récupération du ballon par le gardien, 3 attaquants contre 2 défenseurs.", "Ouverture vers l'ala, course dans l'axe, passes décisives et finition.", "Première passe vers l'avant, course dans l'espace libéré, soutien à 5 m maximum.").done();
  };

  D.largeur_profondeur = () => {
    const s = mk("largeur_profondeur", "Jeu à 4 contre 3 : changements d'aile");
    s.a(5, 16, 10).a(2, 24, 3).a(3, 24, 17).a(4, 30, 10).b(6, 28, 7).b(7, 28, 13).b(8, 32, 10);
    s.zone("target", [22, 0, 12, 5], 0.5, 6, "Passer par ce couloir").zone("target", [22, 15, 12, 5], 6, 12, "Puis par celui-ci");
    s.ball(0.3, 16.6, 10).pass("good", "A5", "A2", 0.8, 1.7).go("B6", [1.7, 28, 7], [3, 26, 5]).go("B7", [1.7, 28, 13], [3, 27, 11]).pass("good", "A2", "A5", 3.4, 4.3, "Appel à contre-courant").pass("good", "A5", "A3", 5, 6, "Changement").pass("good", "A3", "A4", 6.8, 7.7).pass("good", "A4", [40, 9.3], 8.4, 9.2, "Tir");
    return steps(s, "Quatre attaquants contre trois défenseurs, obligation de passer par chaque couloir.", "Passes diagonales, appel à contre-courant, tir quand la défense est étirée.", "Passes diagonales, appel à contre-courant, tir quand la défense est étirée.").done();
  };

  return D;
});
