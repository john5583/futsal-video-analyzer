/* Animations des exercices de phases arrêtées et des exercices par plan de jeu (voir knowledge/seance-drills2.js).
   Mon équipe A (bleu) attaque vers la droite (but adverse en x = 40), adversaire B (rouge), terrain 40 × 20 m. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./builder.js"));
  else root.FutsalScenesDrillsPlan3 = factory(root.FutsalSceneBuilder);
})(typeof self !== "undefined" ? self : this, function (SB) {
  "use strict";
  const D = {};
  const mk = (id, title) => SB.Scene(id, title, 13);
  const steps = (s, setup, run, crit) => s.step(0, 3.5, "exercice", setup).step(3.5, 10, "exercice", run).step(10, 13, "consigne", crit).done();

  /* ================= phases arrêtées : corners (corner en haut à droite, ballon en (39.7 ; 0.3)) ================= */
  D.corner_court_triangle = () => {
    const s = mk("corner_court_triangle", "Corner joué court : triangle et tir");
    s.gka(2, 10).a(5, 31, 10, "Couverture").a(2, 39.6, 0.5, "Tireur").a(3, 35.5, 3, "Relais").a(4, 35, 10, "Tireur final").b(6, 38, 8).b(7, 36.5, 5).b(8, 36, 13).gkb(38.6, 10);
    s.ball(0.3, 39.7, 0.3).pass("good", "A2", "A3", 0.8, 1.6, "Passe courte au relais");
    s.go("A2", [1.6, 39.6, 0.5], [2.8, 37.6, 1.8]).go("B7", [1.6, 36.5, 5], [2.6, 36.6, 3.4]).arrow("press", "B7", "A3", 1.7, 2.6, "Un défenseur sort");
    s.pass("good", "A3", "A2", 3.0, 3.7, "Remise").go("A4", [3.7, 35, 10], [4.6, 38.4, 9.2]).pass("good", "A2", "A4", 4.2, 4.9, "Passe au premier poteau");
    s.pass("good", "A4", [40, 9.8], 5.3, 6.0, "Tir immédiat").mark("check", 38.4, 9.2, 5.2, 9).label(30, 17, "Corner joué en moins de 4 s", 0.4, 6, "#ffb020", 0.9);
    return steps(s, "Corner joué court : un tireur, un relais proche et un joueur qui prépare le tir au premier poteau.", "Passe courte, remise, passe vers le premier poteau et tir sans contrôle.", "Corner joué en moins de 4 secondes ; le relais attire un défenseur ; tir à une touche.");
  };

  D.corner_second_poteau = () => {
    const s = mk("corner_second_poteau", "Corner : centre au second poteau avec appel");
    s.gka(2, 10).a(5, 30, 10, "Couverture").a(2, 39.6, 0.5, "Tireur").a(3, 36, 5, "Appel court").a(4, 35, 13, "Reprise").b(6, 38, 7).b(7, 37, 11).b(8, 36, 15).gkb(38.6, 10);
    s.go("A3", [0.6, 36, 5], [1.6, 38.4, 7.4]).go("A4", [1.2, 35, 13], [2.2, 37.6, 14.2]).arrow("goodrun", "A3", [38.4, 7.4], 0.7, 1.6, "Appel au premier poteau").arrow("goodrun", "A4", [37.6, 14.2], 1.3, 2.2, "Appel décalé au second poteau");
    s.ball(0.3, 39.7, 0.3).pass("good", "A2", [37.6, 14], 2.3, 3.2, "Centre tendu vers le second poteau");
    s.pass("good", "A4", [40, 10.6], 3.7, 4.4, "Reprise sans contrôle").mark("check", 37.6, 14.2, 3.4, 9).mark("x", 38.4, 7.4, 3.2, 9);
    return steps(s, "Quatre joueurs : un tireur, deux appels qui se croisent et un joueur en couverture.", "Le premier appel attire les défenseurs, le second arrive décalé pour reprendre le centre.", "Deux appels décalés dans le temps ; centre tendu ; reprise à une touche ; un joueur reste en couverture.");
  };

  D.corner_tir_enchaine = () => {
    const s = mk("corner_tir_enchaine", "Corner : passe courte et frappe immédiate");
    s.gka(2, 10).a(5, 28, 10).a(2, 39.6, 0.5, "Tireur").a(3, 33, 6, "Frappeur").a(4, 36, 12, "Deuxième balle").b(6, 38, 8).b(7, 36, 4).b(8, 35, 11).gkb(38.6, 10);
    s.ball(0.3, 39.7, 0.3).pass("good", "A2", "A3", 0.8, 1.7, "Passe courte à la limite de la surface").go("A3", [1.7, 33, 6], [2.0, 33, 6]);
    s.pass("good", "A3", [40, 10.4], 2.4, 3.1, "Frappe immédiate").go("A4", [2.4, 36, 12], [3.4, 38.2, 11.4]).arrow("goodrun", "A4", [38.2, 11.4], 2.5, 3.4, "Deuxième balle").mark("check", 33, 6, 2.2, 9);
    return steps(s, "Corner joué court vers un frappeur placé à la limite de la surface ; un autre joueur se place pour le rebond.", "Passe courte et frappe de volée ou au sol sans contrôle.", "Frappe en une touche ; deux joueurs pour la deuxième balle ; corner joué en moins de 4 s.");
  };

  D.corner_defense_zone = () => {
    const s = mk("corner_defense_zone", "Défendre un corner en zone");
    s.gka(2, 10).gkb(38.6, 10).a(5, 38.2, 8.6, "Premier poteau").a(2, 37, 12, "Second poteau").a(3, 34, 7, "Zone devant").a(4, 33, 13, "Zone devant");
    s.b(9, 39.6, 0.5).b(7, 38, 6).b(8, 36, 10).b(6, 36, 15);
    s.zone("target", [32, 3, 8, 8], 0.5, 12, "Zone 1").zone("target", [32, 10, 8, 8], 0.5, 12, "Zone 2");
    s.ball(0.3, 39.7, 0.3).pass("pass", "B9", [35, 14], 1.0, 2.0, "Centre").go("A4", [2.0, 33, 13], [2.8, 34.6, 14]).arrow("press", "A4", [35, 14], 2.1, 2.8, "La zone intercepte");
    s.pass("good", "A4", "A3", 3.4, 4.2, "Dégagement vers le partenaire").go("A3", [3.4, 34, 7], [5, 28, 7]).pass("good", "A3", [24, 6], 4.6, 5.4, "Sortie rapide").mark("check", 34.6, 14, 3.2, 9);
    return steps(s, "Deux défenseurs gardent le premier et le second poteau, deux autres les zones devant le but.", "Chacun défend son espace, le gardien commande ; après le dégagement la sortie est rapide.", "Chacun connaît sa zone ; le gardien annonce ; une couverture garde le ballon en vue ; sortie rapide.");
  };

  D.corner_defense_individuelle = () => {
    const s = mk("corner_defense_individuelle", "Défendre un corner en individuelle");
    s.gka(2, 10).gkb(38.6, 10).a(5, 38, 7.4, "Marque B7").a(2, 36.6, 11, "Marque B8").a(3, 35.4, 14.6, "Marque B6").a(4, 33, 9, "Marque B9");
    s.b(9, 39.6, 0.5).b(7, 38.4, 6.6).b(8, 36.4, 10.4).b(6, 35, 14);
    s.ball(0.3, 39.7, 0.3).go("B7", [1.2, 38.4, 6.6], [2.2, 36.4, 12]).go("A5", [1.2, 38, 7.4], [2.2, 36.2, 12.4]).arrow("goodrun", "A5", [36.2, 12.4], 1.2, 2.2, "Je suis mon joueur dans le croisement");
    s.pass("pass", "B9", [36.4, 12], 1.4, 2.4, "Centre").go("A2", [2.3, 36.6, 11], [3.0, 38, 7.6]).arrow("goodrun", "A2", [38, 7.6], 2.3, 3.0, "J'échange l'adversaire annoncé");
    s.pass("good", "A5", [30, 12], 3.2, 4.2, "Dégagement").mark("check", 36.2, 12.4, 3.0, 9);
    return steps(s, "Chaque défenseur prend un attaquant avant le corner et le garde.", "Les attaquants croisent leurs courses : les défenseurs annoncent et échangent sans lâcher personne.", "Un adversaire pour chacun ; croisements annoncés ; le corps entre l'attaquant et le ballon ; pas de faute.");
  };

  D.corner_contre_attaque = () => {
    const s = mk("corner_contre_attaque", "Corner défendu puis contre-attaque");
    s.gka(2, 10).gkb(38.6, 10).a(5, 38.4, 9, "Premier poteau").a(2, 36, 5).a(3, 36, 14).a(4, 33, 10, "Reste en retrait");
    s.b(9, 39.6, 0.5).b(7, 38, 6).b(8, 36, 10).b(6, 35, 15);
    s.ball(0.3, 39.7, 0.3).pass("pass", "B9", [37, 8], 1.0, 1.9, "Corner adverse").go("A5", [1.9, 38.4, 9], [2.6, 37.6, 8]).pass("good", "A5", "A2", 2.8, 3.5, "Récupération puis passe");
    s.go("A2", [3.5, 36, 5], [5.0, 24, 5]).go("A3", [3.5, 36, 14], [5.4, 26, 13]).go("A4", [3.5, 33, 10], [5.0, 28, 10]);
    s.pass("good", "A2", "A3", 5.0, 5.8, "Contre-attaque à deux").pass("good", "A3", [4, 9.6], 6.4, 7.6, "Tir en moins de 6 s").mark("check", 28, 10, 5.0, 9);
    return steps(s, "On défend un corner adverse ; un joueur reste en retrait pour couvrir.", "Dès que le ballon est récupéré, deux joueurs partent en contre-attaque.", "Un joueur reste en couverture ; premier appel dès la récupération ; tir en moins de 6 s.");
  };

  /* ================= phases arrêtées : rentrées de touche (ballon sur la ligne en bas, y = 20) ================= */
  D.rentree_pivot_remise = () => {
    const s = mk("rentree_pivot_remise", "Rentrée de touche vers le pivot en remise");
    s.gka(2, 10).a(2, 24, 19.8, "Rentrée").a(3, 28, 14, "Ailier").a(5, 22, 10, "Défenseur").a(4, 31, 9, "Pivot").b(6, 33, 10).b(7, 27, 12).b(8, 22, 14).gkb(38, 10);
    s.ball(0.3, 24, 19.8).go("A4", [0.6, 31, 9], [1.6, 30, 11]).go("A3", [2.0, 28, 14], [3.6, 34, 12]).pass("good", "A2", "A4", 1.8, 2.5, "Rentrée jouée en moins de 4 s");
    s.pass("good", "A4", "A3", 2.9, 3.6, "Remise en une touche").pass("good", "A3", [40, 9.4], 4.6, 5.4, "Tir ou passe décisive").mark("check", 30, 11, 2.8, 9).label(14, 17, "Pas de tir direct sur la rentrée", 0.4, 6, "#ffb020", 0.9);
    return steps(s, "Rentrée de touche : le joueur à la touche, un pivot dos au but et un ailier qui prépare l'appel.", "Passe au pivot qui remet en une touche à l'ailier lancé.", "Rentrée jouée en 4 secondes ; le pivot protège le ballon ; remise en une touche ; appel dans le dos.");
  };

  D.rentree_une_deux = () => {
    const s = mk("rentree_une_deux", "Rentrée de touche en une-deux");
    s.gka(2, 10).a(2, 22, 19.8, "Rentrée").a(3, 25, 14, "Partenaire").a(4, 31, 8, "Soutien").b(6, 24, 17).b(7, 28, 11).gkb(38, 10);
    s.ball(0.3, 22, 19.8).pass("good", "A2", "A3", 0.8, 1.5, "Passe courte").go("A2", [1.5, 22, 19.8], [3.0, 26, 13]).arrow("goodrun", "A2", [26, 13], 1.5, 3.0, "Je rentre sur le terrain");
    s.pass("good", "A3", [26, 13], 2.4, 3.1, "Remise dans l'espace libre").pass("good", "A2", "A4", 3.6, 4.4, "Passe vers l'avant");
    s.go("A4", [4.4, 31, 8], [5.6, 36, 9]).pass("good", "A4", [40, 9.4], 5.8, 6.5, "Tir").mark("check", 26, 13, 3.0, 9);
    return steps(s, "Rentrée de touche : le joueur à la touche et un partenaire proche, un défenseur à 5 mètres.", "Passe courte, remise dans l'espace, puis passe vers l'avant.", "Passe courte et mouvement ; remise dans l'espace libre ; rentrée jouée en moins de 4 s.");
  };

  D.rentree_sortie_securite = () => {
    const s = mk("rentree_sortie_securite", "Rentrée dans sa moitié : sortie sécurisée");
    s.gka(2, 10).a(2, 10, 19.8, "Rentrée").a(3, 14, 15, "Solution courte").a(5, 10, 11, "Solution profonde").a(4, 20, 8, "Relais").b(6, 16, 16).b(7, 12, 13).gkb(38, 10);
    s.ball(0.3, 10, 19.8).go("A5", [0.6, 10, 11], [1.4, 12, 13.6]).pass("good", "A2", "A5", 1.6, 2.3, "Solution courte sécurisée").go("A4", [2.0, 20, 8], [3.2, 18, 9]);
    s.pass("good", "A5", "GKA", 2.8, 3.6, "Retour au gardien en cas de doute").pass("good", "GKA", "A4", 4.2, 5.0, "Changement d'aile").mark("check", 12, 13.6, 2.4, 9);
    return steps(s, "Rentrée dans sa moitié sous la pression de deux adversaires.", "Deux solutions proposées avant la rentrée ; en cas de doute retour vers le gardien.", "Deux solutions avant de jouer ; aucune perte devant son but ; retour au gardien autorisé.");
  };

  D.rentree_fermer_ligne = () => {
    const s = mk("rentree_fermer_ligne", "Défendre une rentrée : fermer la ligne de passe");
    s.gka(2, 10).a(5, 20, 15, "Ferme la passe courte").a(2, 25, 10, "Ferme la passe longue").a(3, 17, 7, "Couverture").b(9, 21, 19.8).b(7, 24, 15).b(8, 29, 10).gkb(38, 10);
    s.ball(0.3, 21, 19.8).zone("free", [14, 12, 12, 8], 0.5, 12, "5 m autour de la rentrée").arrow("press", "A5", "B7", 0.8, 3.0, "Passe courte fermée").arrow("press", "A2", "B8", 0.8, 3.0, "Passe longue fermée");
    s.pass("bad", "B9", "B7", 1.8, 2.6, "Passe forcée").go("A5", [2.6, 20, 15], [3.4, 23, 15.4]).pass("good", "A5", "A3", 4.0, 4.8, "Ballon récupéré").mark("check", 23, 15.4, 3.4, 9);
    return steps(s, "Rentrée adverse : le défenseur le plus proche se place à 5 m et ferme la passe courte, un autre ferme la passe longue.", "Le troisième défenseur garde la couverture ; la passe forcée est interceptée.", "Distance de 5 m respectée ; deux passes fermées en même temps ; un joueur en couverture.");
  };

  D.rentree_sous_4s_decompte = () => {
    const s = mk("rentree_sous_4s_decompte", "Rentrée de touche sous le compte des 4 secondes");
    s.gka(2, 10).a(2, 20, 19.8, "Rentrée").a(3, 24, 14, "Solution").a(4, 28, 8, "Solution profonde").b(6, 26, 14).gkb(38, 10);
    s.ball(0.3, 20, 19.8).label(20, 16.5, "1", 0.4, 1.4, "#ffb020", 1.6).label(20, 16.5, "2", 1.4, 2.4, "#ffb020", 1.6).label(20, 16.5, "3", 2.4, 3.4, "#ffb020", 1.6).label(20, 16.5, "4", 3.4, 4.4, "#ff5a5f", 1.6);
    s.go("A3", [0.6, 24, 14], [2.0, 23, 12]).pass("good", "A2", "A3", 3.0, 3.6, "Rentrée avant la 4e seconde").pass("good", "A3", "A4", 4.2, 5.0, "Passe utile").mark("check", 23, 12, 3.4, 9);
    return steps(s, "Un entraîneur compte les 4 secondes à voix haute pendant la rentrée.", "L'équipe doit remettre en jeu avant le quatrième temps avec une passe utile.", "Rentrée avant la 4e seconde ; passe utile et non précipitée ; moins de deux rentrées perdues sur dix.");
  };

  /* ================= phases arrêtées : coups francs ================= */
  D.coup_franc_direct_mur = () => {
    const s = mk("coup_franc_direct_mur", "Coup franc direct avec mur de deux joueurs");
    s.gka(2, 10).a(2, 28, 12, "Tireur").a(3, 29, 9, "Deuxième balle").a(4, 31, 14).b(6, 33, 10.8).b(7, 33, 9.2).gkb(39, 10);
    s.ball(0.3, 28, 12).zone("free", [33, 8.2, 2, 3.6], 0.5, 12, "Mur à 5 m").go("A2", [0.8, 28, 12], [1.4, 29.2, 11.4]).go("A3", [2.0, 29, 9], [3.0, 35, 8]);
    s.pass("good", "A2", [40, 10.4], 2.2, 3.0, "Frappe de côté du mur").pass("good", "GKB", [34, 6], 3.4, 4.0, "Le gardien repousse");
    s.pass("good", "A3", [40, 9.4], 4.4, 5.0, "Reprise sur la deuxième balle").mark("check", 35, 8, 4.0, 9);
    return steps(s, "Un mur de deux joueurs à 5 mètres devant le tireur et un gardien.", "Le tireur frappe de côté, un partenaire se place pour la deuxième balle.", "Mur à 5 m minimum ; frappe rapide si le gardien est mal placé ; coup franc joué en moins de 4 s.");
  };

  D.coup_franc_combinaison = () => {
    const s = mk("coup_franc_combinaison", "Coup franc indirect : combinaison à trois");
    s.gka(2, 10).a(2, 27, 12, "Passeur").a(3, 29, 8, "Appel").a(4, 30, 14, "Tireur").a(5, 22, 10, "Couverture").b(6, 33, 11).b(7, 33, 9).b(8, 33, 14).gkb(39, 10);
    s.ball(0.3, 27, 12).pass("good", "A2", "A4", 0.8, 1.6, "Passe courte").go("A3", [1.2, 29, 8], [2.6, 34.6, 7.4]).arrow("goodrun", "A3", [34.6, 7.4], 1.2, 2.6, "Appel croisé");
    s.go("A4", [1.6, 30, 14], [2.6, 31, 13]).pass("good", "A4", [34.6, 7.6], 3.0, 3.8, "Passe dans le dos du mur").pass("good", "A3", [40, 9.4], 4.2, 4.9, "Tir en une touche").mark("check", 34.6, 7.4, 3.8, 9);
    return steps(s, "Schéma à trois : un passeur, un joueur qui appelle, un tireur ; un quatrième reste en couverture.", "Passe courte, appel croisé, passe dans le dos du mur puis tir.", "Schéma connu de tous ; appel croisé avant la passe ; tir en une touche ; un joueur en couverture.");
  };

  D.coup_franc_defense_mur = () => {
    const s = mk("coup_franc_defense_mur", "Défendre un coup franc : mur et gardien");
    s.gka(2, 10).a(5, 6, 10.8, "Mur").a(2, 6, 9.2, "Mur").a(3, 11, 14, "Sur le receveur").a(4, 14, 8, "Couverture").b(9, 11, 11).b(7, 12, 14).b(8, 14, 6);
    s.ball(0.3, 11, 11).zone("free", [5, 8.2, 2, 3.6], 0.5, 12, "Mur placé par le gardien").arrow("press", "A3", "B7", 0.8, 2.4, "Marquer le receveur probable");
    s.pass("bad", "B9", "B7", 2.2, 3.0, "Passe courte").go("A3", [3.0, 11, 14], [3.8, 12, 13.6]).arrow("press", "A3", "B7", 3.0, 3.8, "Je ferme tout de suite").pass("good", "A3", "A4", 4.4, 5.2, "Ballon récupéré").mark("check", 12, 13.6, 3.8, 9);
    return steps(s, "Un mur de deux joueurs placé par le gardien, un joueur sur le receveur probable, un en couverture.", "Après la frappe ou la passe, le mur ne tourne pas le dos ; le gardien commande.", "Mur placé par le gardien ; un joueur sur le receveur ; pas de bond avant la frappe ; sortie rapide.");
  };

  D.coup_franc_lateral_centre = () => {
    const s = mk("coup_franc_lateral_centre", "Coup franc latéral : centre et reprise");
    s.gka(2, 10).a(2, 30, 18, "Tireur").a(3, 33, 12, "Appel").a(4, 34, 14, "Appel").a(5, 26, 10, "Couverture").b(6, 36, 9).b(7, 35, 12).gkb(38.8, 10);
    s.ball(0.3, 30, 18).go("A3", [0.8, 33, 12], [2.0, 36.6, 7.6]).go("A4", [1.2, 34, 14], [2.4, 38, 11.6]).arrow("goodrun", "A3", [36.6, 7.6], 0.8, 2.0, "Appel devant").arrow("goodrun", "A4", [38, 11.6], 1.2, 2.4, "Appel au second poteau");
    s.pass("good", "A2", [38, 11.6], 2.4, 3.3, "Centre tendu").pass("good", "A4", [40, 9.8], 3.6, 4.3, "Reprise à une touche").mark("check", 38, 11.6, 3.3, 9);
    return steps(s, "Coup franc sur le côté : un tireur, deux joueurs pour les appels croisés, un en couverture.", "Le centre est tendu vers le second poteau, la reprise se fait sans contrôle.", "Centre tendu ; deux appels croisés ; reprise à une touche ; un joueur en couverture.");
  };

  D.sixieme_faute_10m = () => {
    const s = mk("sixieme_faute_10m", "Sixième faute : coup franc direct de la marque des 10 m");
    s.gka(2, 10).a(2, 30, 10, "Tireur").a(3, 31, 5, "Rebond").gkb(39.2, 10);
    s.ball(0.3, 30, 10).label(30, 13.2, "Marque des 10 m, sans mur", 0.3, 6, "#ffb020", 0.9).go("A2", [1.0, 30, 10], [2.0, 29.2, 10]).go("A2", [2.4, 30, 10]);
    s.pass("good", "A2", [40, 8.8], 2.4, 3.1, "Frappe placée au second poteau").go("GKB", [2.4, 39.2, 10], [3.2, 39.2, 9.2]).pass("good", "GKB", [34, 6], 3.4, 4.0, "Rebond").go("A3", [3.0, 31, 5], [3.8, 36, 6.4]).pass("good", "A3", [40, 10.4], 4.6, 5.2, "Reprise du rebond").mark("check", 36, 6.4, 4.0, 9);
    return steps(s, "Sixième faute cumulée : le tireur est à 10 m du but, sans mur ; un partenaire attend le rebond.", "Le tireur décide son geste avant la course : frappe puissante au ras du sol ou placée au second poteau.", "Geste décidé avant la course ; frappe cadrée ; rebond suivi ; au moins sept tirs cadrés sur dix.");
  };

  D.sixieme_faute_gardien = () => {
    const s = mk("sixieme_faute_gardien", "Sixième faute : le gardien face au tir de 10 m");
    s.b(9, 10, 10, "Tireur").b(7, 11, 15, "Rebond").gka(2, 10);
    s.ball(0.3, 10, 10).go("GKA", [0.6, 2, 10], [1.8, 2, 9.4]).label(6, 13.5, "Je lis la course du tireur", 0.4, 3, "#4aa3ff", 0.9).go("B9", [1.2, 10, 10], [2.0, 9.4, 10]).go("B9", [2.4, 10, 10]);
    s.pass("pass", "B9", [0, 8.8], 2.4, 3.1, "Frappe").go("GKA", [2.4, 2, 9.4], [3.2, 2, 8.6]).pass("good", "GKA", [8, 4], 3.6, 4.2, "Rebond dégagé loin de l'axe").mark("check", 2, 8.6, 3.3, 9);
    return steps(s, "Le gardien face à un tireur à 10 m, sans mur ; un partenaire récupère les rebonds.", "Position stable avant la frappe, pas de plongeon anticipé, réaction à la frappe.", "Position stable ; pas de plongeon anticipé ; rebond dégagé loin de l'axe ; relance rapide.");
  };

  D.penalty_6m = () => {
    const s = mk("penalty_6m", "Penalty : tireur et gardien");
    s.gka(2, 10).a(2, 33, 10, "Tireur").a(3, 34, 5, "Rebond").gkb(39.2, 10);
    s.ball(0.3, 34, 10).label(34, 13.2, "Penalty à 6 m", 0.3, 6, "#ffb020", 0.9).go("A2", [1.2, 33, 10], [2.2, 33.6, 10]);
    s.pass("good", "A2", [40, 8.8], 2.4, 3.0, "Frappe placée").go("GKB", [2.4, 39.2, 10], [3.2, 39.2, 9.0]).go("A3", [2.6, 34, 5], [3.6, 37.4, 6.6]).pass("good", "GKB", [37, 5.4], 3.4, 4.0, "Rebond").pass("good", "A3", [40, 10.4], 4.4, 5.0, "Le partenaire suit").mark("check", 37.4, 6.6, 4.0, 9);
    return steps(s, "Penalty tiré à 6 m ; un joueur suit pour le rebond.", "Le tireur choisit son côté avant de courir ; le gardien reste sur sa ligne jusqu'à la frappe.", "Côté choisi avant la course ; frappe placée ; gardien sur la ligne ; rebond suivi.");
  };

  D.coup_envoi_pivot = () => {
    const s = mk("coup_envoi_pivot", "Coup d'envoi : schéma vers le pivot");
    s.gka(2, 10).a(2, 20, 10, "Engage").a(4, 26, 10, "Pivot").a(3, 22, 4, "Ailier").a(5, 18, 14).b(6, 29, 10).b(7, 25, 6).b(8, 25, 14).gkb(38, 10);
    s.ball(0.3, 20, 10).go("A3", [1.0, 22, 4], [3.0, 32, 5]).pass("good", "A2", "A4", 0.8, 1.5, "Coup d'envoi vers le pivot").pass("good", "A4", "A3", 2.2, 3.0, "Remise à l'ailier lancé");
    s.pass("good", "A3", [40, 9.4], 4.0, 4.8, "Tir").arrow("goodrun", "A3", [32, 5], 1.0, 3.0, "Appel en profondeur").mark("check", 26, 10, 2.0, 9);
    return steps(s, "Coup d'envoi : un pivot dos au but, un ailier qui prépare l'appel, deux joueurs en soutien.", "Passe au pivot, remise à l'ailier lancé, tir.", "Schéma connu de tous ; premier appel avant la passe ; le pivot protège le ballon ; tir ou passe décisive.");
  };

  D.remise_gardien_4s = () => {
    const s = mk("remise_gardien_4s", "Remise en jeu du gardien : 4 secondes et solutions");
    s.gka(2, 10, "Gardien").a(5, 8, 5, "Solution courte").a(3, 8, 15, "Solution courte").a(4, 18, 10, "Solution profonde").b(7, 12, 8).b(8, 12, 12);
    s.ball(0.3, 2, 10).label(5, 18, "4 secondes", 0.3, 4, "#ffb020", 1.2).go("A5", [0.6, 8, 5], [1.6, 7, 4.4]).go("A3", [0.6, 8, 15], [1.6, 8, 16]).go("B7", [1.0, 12, 8], [2.0, 9, 5.6]).arrow("press", "B7", "A5", 1.0, 2.0, "Pressant sur un côté");
    s.pass("good", "GKA", "A3", 2.4, 3.2, "Relance du côté libre").pass("good", "A3", "A4", 3.8, 4.6, "Passe vers l'avant").mark("check", 8, 16, 3.0, 9);
    return steps(s, "Le gardien a 4 secondes pour relancer à la main ; trois joueurs lui proposent des solutions.", "Il choisit selon le placement des pressants et relance sans précipitation.", "Relance en moins de 4 s ; deux solutions proposées ; choix selon le pressing ; aucune perte devant son but.");
  };

  D.cpa_gj_fin_match = () => {
    const s = mk("cpa_gj_fin_match", "Phase arrêtée avec gardien-joueur en fin de match");
    s.a(2, 39.6, 0.5, "Tireur").a(3, 35, 5).a(4, 36, 12).a(5, 30, 8, "Gardien-joueur").a(6, 28, 15, "Garde le but vide en vue").b(6, 38, 8).b(7, 36, 11).b(8, 35, 15).b(9, 33, 6).gkb(38.6, 10);
    s.ball(0.3, 39.7, 0.3).go("A3", [0.8, 35, 5], [1.8, 38.2, 7.4]).go("A4", [1.0, 36, 12], [2.2, 37.2, 13.4]).pass("good", "A2", "A5", 1.2, 2.0, "Corner court au gardien monté");
    s.pass("good", "A5", "A4", 2.6, 3.4, "Passe vers le second poteau").pass("good", "A4", [40, 10.4], 3.8, 4.5, "Tir").mark("check", 37.2, 13.4, 3.4, 9).label(10, 4, "Son but est vide : un joueur reste en retrait", 0.4, 6, "#ffb020", 0.8);
    return steps(s, "Phase arrêtée à cinq contre quatre : cinq joueurs d'attaque, le gardien est monté.", "Schéma annoncé avant la remise en jeu ; un joueur garde son but vide en vue.", "Schéma annoncé ; un joueur garde le but vide en vue ; tir en moins de 4 s ; retour immédiat en cas de perte.");
  };

  D.corner_contre_gj = () => {
    const s = mk("corner_contre_gj", "Défendre un corner contre un gardien-joueur");
    s.gka(2, 10).gkb(38.6, 10).a(5, 38.4, 8.4, "Sur le tireur").a(2, 36.6, 12, "Garde le plus dangereux").a(3, 34, 7, "Ferme la passe").a(4, 30, 10, "Voit le but vide");
    s.b(9, 39.6, 0.5).b(7, 38, 6).b(8, 36, 14).b(6, 33, 11).b(5, 31, 8, "Gardien monté");
    s.ball(0.3, 39.7, 0.3).pass("pass", "B9", "B6", 1.0, 1.9, "Corner court").go("A3", [1.9, 34, 7], [2.8, 33.4, 10.4]).arrow("press", "A3", "B6", 2.0, 2.8, "Je ferme la passe");
    s.pass("good", "A4", [14, 10], 3.4, 4.4, "Dégagement long vers le but vide").mark("check", 33.4, 10.4, 2.8, 9);
    return steps(s, "L'adversaire joue le corner avec le gardien monté : on défend à quatre.", "Un joueur marque le plus dangereux, le plus proche ferme la passe, le dernier regarde le but vide.", "Un joueur dédié au tireur ; le but vide repéré ; dégagement long si on récupère ; pas de faute près du but.");
  };

  /* ================= système 3-1 ================= */
  D.trois_un_ailier_diagonale = () => {
    const s = mk("trois_un_ailier_diagonale", "3-1 : l'ailier diagonale vers le pivot");
    s.gka(2, 10).a(5, 14, 10).a(2, 20, 4, "Ailier").a(3, 20, 16, "Ailier").a(4, 28, 10, "Pivot").b(6, 30, 10).b(7, 24, 7).b(8, 24, 13).gkb(38, 10);
    s.ball(0.3, 14, 10).pass("good", "A5", "A3", 0.6, 1.4, "Passe à l'ailier").go("A2", [1.4, 20, 4], [3.4, 27, 11]).arrow("goodrun", "A2", [27, 11], 1.4, 3.4, "Appel en diagonale").go("A4", [1.6, 28, 10], [2.6, 25, 8]);
    s.pass("good", "A3", "A4", 2.0, 2.8, "Passe au pivot").pass("good", "A4", "A2", 3.4, 4.2, "Remise en une touche").pass("good", "A2", [40, 9.6], 4.8, 5.6, "Tir").mark("check", 27, 11, 4.2, 9);
    return steps(s, "3-1 : trois joueurs derrière, un pivot ; un ailier s'apprête à faire un appel en diagonale.", "Passe à l'ailier puis au pivot qui décroche ; l'autre ailier arrive en diagonale.", "Appel en diagonale ; le pivot décroche au bon moment ; remise en une touche ; tir à la troisième passe.");
  };

  D.trois_un_pivot_decroche = () => {
    const s = mk("trois_un_pivot_decroche", "3-1 : pivot qui décroche et appel dans son dos");
    s.gka(2, 10).a(5, 14, 10).a(2, 20, 4, "Ailier").a(3, 20, 16, "Ailier").a(4, 30, 10, "Pivot").b(6, 31, 10).b(7, 26, 7).b(8, 26, 13).gkb(38, 10);
    s.ball(0.3, 14, 10).go("A4", [0.6, 30, 10], [1.6, 24, 10]).go("B6", [0.8, 31, 10], [1.8, 26, 10]).go("A2", [1.0, 20, 4], [3.0, 34, 6]).arrow("goodrun", "A2", [34, 6], 1.0, 3.0, "Appel dans le dos du défenseur");
    s.pass("good", "A5", "A4", 1.8, 2.5, "Passe au pivot qui est venu chercher le ballon").pass("good", "A4", [34, 6], 3.0, 3.9, "Remise en profondeur").pass("good", "A2", [40, 9.4], 4.4, 5.2, "Finition").mark("check", 34, 6, 3.9, 9);
    return steps(s, "Le pivot descend chercher le ballon, un défenseur adverse le suit.", "Un ailier s'engage dans l'espace libéré derrière lui ; passe au pivot puis remise en profondeur.", "Le pivot attire le défenseur ; appel dans le dos ; passe tendue ; finition en moins de 6 s.");
  };

  D.trois_un_defense_pivot_adverse = () => {
    const s = mk("trois_un_defense_pivot_adverse", "Défendre contre un pivot adverse");
    s.gka(2, 10).a(5, 10, 10, "Central").a(2, 12, 5, "Ailier").a(3, 12, 15, "Ailier").a(4, 16, 10).b(9, 14, 10, "Pivot").b(7, 20, 5).b(8, 20, 15).b(6, 22, 10);
    s.ball(0.3, 20, 10).pass("pass", "B6", "B9", 0.8, 1.6, "Passe vers le pivot").go("A5", [0.6, 10, 10], [1.4, 12.6, 10]).arrow("press", "A5", "B9", 0.8, 1.8, "Je me place derrière le pivot").go("A2", [1.8, 12, 5], [2.8, 13.6, 8]).arrow("press", "A2", "B9", 1.8, 2.8, "L'ailier aide");
    s.go("A5", [1.8, 12.6, 10], [2.6, 13.4, 9.8]).pass("good", "A5", "A4", 3.2, 4.0, "Le pivot perd le ballon").mark("check", 13.4, 9.8, 2.8, 9);
    return steps(s, "Quatre défenseurs contre un pivot adverse dos au but.", "Le central se place derrière le pivot pour couper la remise, l'ailier le plus proche aide sur le côté.", "Se placer entre le pivot et le but ; l'aide arrive au bon moment ; pas de faute dans le dos.");
  };

  /* ================= système 1-2-1 ================= */
  D.losange_apex_rotation = () => {
    const s = mk("losange_apex_rotation", "1-2-1 : rotation du joueur haut");
    s.gka(2, 10).a(5, 12, 10, "Bas").a(2, 18, 5, "Ailier").a(3, 18, 15, "Ailier").a(4, 24, 10, "Haut").b(6, 20, 10).b(7, 24, 6).b(8, 24, 14).gkb(38, 10);
    s.ball(0.3, 12, 10).pass("good", "A5", "A2", 0.6, 1.4, "Passe à l'ailier").go("A4", [1.2, 24, 10], [2.6, 18, 10]).go("A2", [1.2, 18, 5], [2.6, 24, 7]).go("A5", [1.2, 12, 10], [2.6, 12, 10]);
    s.arrow("goodrun", "A4", [18, 10], 1.2, 2.6, "Le joueur haut descend").arrow("goodrun", "A2", [24, 7], 1.2, 2.6, "L'ailier prend sa place");
    s.pass("good", "A2", "A4", 2.9, 3.6, "La passe pendant la rotation").pass("good", "A4", "A3", 4.0, 4.8).pass("good", "A3", [40, 9.4], 5.4, 6.2, "Tir").mark("check", 24, 7, 2.8, 9);
    return steps(s, "1-2-1 : un joueur bas, deux ailiers, un joueur haut.", "Le joueur haut descend, un ailier prend sa place ; le ballon circule pendant le changement.", "Rotation annoncée ; le losange garde sa forme ; une passe pendant la rotation ; jamais deux joueurs au même poste.");
  };

  D.losange_pressing_axe = () => {
    const s = mk("losange_pressing_axe", "1-2-1 : pressing qui ferme l'axe");
    s.gka(2, 10).a(5, 18, 10, "Bas").a(2, 22, 5, "Ailier").a(3, 22, 15, "Ailier").a(4, 26, 10, "Haut").b(6, 30, 10).b(7, 28, 5).b(8, 28, 15).gkb(38, 10);
    s.zone("press", [24, 4, 12, 12], 0.5, 12, "Axe fermé").ball(0.3, 30, 10).pass("bad", "B6", "B7", 0.6, 1.4, "Passe vers le côté");
    s.go("A4", [1.2, 26, 10], [2.4, 29, 7]).arrow("press", "A4", "B7", 1.2, 2.4, "Le haut presse côté axe").go("A2", [1.2, 22, 5], [2.4, 27, 5.6]).go("A3", [1.2, 22, 15], [2.4, 27, 13.6]).go("A5", [1.2, 18, 10], [2.4, 24, 10]);
    s.pass("good", "A4", "A2", 3.0, 3.8, "Récupération").pass("good", "A2", [40, 9.6], 4.4, 5.2, "Tir").mark("check", 29, 7, 2.6, 9);
    return steps(s, "1-2-1 : le joueur haut presse, les ailiers ferment les passes latérales, le joueur bas couvre.", "On force le jeu vers un côté puis on presse la passe suivante.", "Fermer l'axe d'abord ; presser sur la passe suivante ; le joueur bas couvre ; récupération en moins de 8 s.");
  };

  /* ================= système 2-2 ================= */
  D.carre_pressing_alterne = () => {
    const s = mk("carre_pressing_alterne", "2-2 : pressing alterné des deux lignes");
    s.gka(2, 10).a(5, 16, 5, "Bas").a(2, 16, 15, "Bas").a(3, 24, 5, "Haut").a(4, 24, 15, "Haut").b(9, 30, 10).b(7, 28, 6).b(8, 28, 14).b(6, 32, 10).gkb(38, 10);
    s.ball(0.3, 30, 10).pass("pass", "B9", "B7", 0.6, 1.4, "Passe latérale").go("A3", [1.4, 24, 5], [2.6, 28.4, 6.4]).arrow("press", "A3", "B7", 1.4, 2.6, "Les hauts pressent").go("A5", [1.4, 16, 5], [2.6, 22, 7]).go("A2", [1.4, 16, 15], [2.6, 22, 13]).go("A4", [1.4, 24, 15], [2.6, 25, 12]);
    s.label(20, 18.5, "Une ligne presse, l'autre couvre", 2.0, 8, "#ffb020", 0.9).pass("good", "A3", "A4", 3.2, 4.0, "Ballon récupéré").pass("good", "A4", [40, 9.6], 4.6, 5.4, "Tir").mark("check", 28.4, 6.4, 3.0, 9);
    return steps(s, "2-2 : deux joueurs hauts, deux bas.", "Les deux hauts pressent pendant que les deux bas couvrent la profondeur, puis on alterne.", "Une ligne presse, l'autre couvre ; alternance annoncée ; pas de trou entre les lignes.");
  };

  D.carre_permutation_croisee = () => {
    const s = mk("carre_permutation_croisee", "2-2 : permutation croisée des diagonales");
    s.gka(2, 10).a(5, 16, 5, "Bas").a(2, 16, 15, "Bas").a(3, 24, 5, "Haut").a(4, 24, 15, "Haut").b(6, 26, 10).b(7, 22, 10).gkb(38, 10);
    s.ball(0.3, 16, 5).pass("good", "A5", "A3", 0.6, 1.3, "Passe au haut").go("A3", [1.3, 24, 5], [3.0, 26, 15]).go("A4", [1.3, 24, 15], [3.0, 26, 5]).arrow("goodrun", "A3", [26, 15], 1.3, 3.0, "Croisement").arrow("goodrun", "A4", [26, 5], 1.3, 3.0, "Croisement");
    s.pass("good", "A3", "A4", 3.2, 4.0, "Passe dans l'espace libéré").pass("good", "A4", [40, 9.6], 4.6, 5.4, "Tir").mark("check", 26, 5, 4.0, 9);
    return steps(s, "2-2 : deux hauts qui vont croiser leurs courses pendant que les deux bas restent en soutien.", "Le croisement attire les deux défenseurs et libère un tir ou une passe dans l'axe.", "Croisement après une passe ; les bas gardent la profondeur ; passe dans l'espace libéré.");
  };

  /* ================= système 4-0 ================= */
  D.quatre_zero_boucle = () => {
    const s = mk("quatre_zero_boucle", "4-0 : la boucle autour du bloc");
    s.gka(2, 10).a(5, 20, 5).a(2, 20, 15).a(3, 26, 5).a(4, 26, 15).b(6, 28, 10).b(7, 24, 10).b(8, 32, 10).b(9, 22, 12).gkb(38, 10);
    s.ball(0.3, 20, 5).pass("good", "A5", "A3", 0.6, 1.3, "Passe").go("A5", [1.3, 20, 5], [3.0, 28, 4]).arrow("goodrun", "A5", [28, 4], 1.3, 3.0, "Le passeur contourne le bloc");
    s.pass("good", "A3", "A4", 2.0, 2.8, "Changement d'axe").pass("good", "A4", "A5", 3.4, 4.2, "Passe à celui qui a bouclé").pass("good", "A5", [40, 9.4], 4.8, 5.6, "Tir").mark("check", 28, 4, 4.2, 9);
    return steps(s, "4-0 : quatre joueurs sans poste fixe.", "À chaque passe, le passeur contourne le bloc et se replace derrière le receveur.", "Le passeur contourne le bloc ; les rôles tournent à chaque passe ; une ou deux touches ; un tir quand un espace s'ouvre.");
  };

  D.quatre_zero_ecran_tir = () => {
    const s = mk("quatre_zero_ecran_tir", "4-0 : l'écran pour libérer un tir");
    s.gka(2, 10).a(5, 20, 10, "Passeur").a(2, 27, 12, "Écran").a(3, 29, 6, "Tireur").a(4, 22, 16).b(6, 30, 10).b(7, 28, 8).b(8, 25, 14).gkb(38, 10);
    s.ball(0.3, 20, 10).go("A2", [0.8, 27, 12], [1.8, 29.6, 8.2]).arrow("goodrun", "A2", [29.6, 8.2], 0.8, 1.8, "L'écran se place entre le défenseur et le tireur").go("A4", [0.8, 22, 16], [2.0, 27, 17]);
    s.pass("good", "A5", "A3", 2.2, 3.0, "Passe au tireur").pass("good", "A3", [40, 9.6], 3.4, 4.2, "Frappe en une touche").mark("check", 29, 6, 3.0, 9);
    return steps(s, "4-0 : un passeur, un joueur écran, un tireur, un joueur qui change d'axe.", "L'écran se place avant la passe ; le tireur reçoit et frappe en une touche.", "Écran avant la passe ; tireur en une touche ; les autres changent d'axe ; pas de faute d'obstruction.");
  };

  D.quatre_zero_pression_individuelle = () => {
    const s = mk("quatre_zero_pression_individuelle", "4-0 : pression individuelle haute");
    s.gka(2, 10).a(5, 24, 4).a(2, 24, 8).a(3, 24, 12).a(4, 24, 16).b(6, 30, 4).b(7, 30, 8).b(8, 30, 12).b(9, 30, 16).gkb(38, 10);
    s.ball(0.3, 30, 4).go("A5", [0.6, 24, 4], [1.6, 29.4, 4.2]).arrow("press", "A5", "B6", 0.6, 1.6, "Je presse mon joueur").pass("bad", "B6", "B7", 1.8, 2.6, "Passe vers le voisin").go("A2", [1.8, 24, 8], [2.6, 29.4, 8.2]).arrow("press", "A2", "B7", 1.8, 2.6, "Mon voisin presse le receveur");
    s.pass("good", "A2", "A5", 3.2, 4.0, "Ballon récupéré").pass("good", "A5", [40, 9.6], 4.6, 5.4, "Tir").mark("check", 29.4, 8.2, 2.8, 9);
    return steps(s, "4-0 : chaque joueur presse un adversaire dès la relance.", "Quand un attaquant est battu, le voisin ferme l'axe et prend le porteur ; on reprend son marquage ensuite.", "Un joueur pour un joueur ; l'aide ferme l'axe ; permutation annoncée ; récupération en moins de 8 s.");
  };

  /* ================= gardien-joueur ================= */
  D.gj_sortie_rapide_aile = () => {
    const s = mk("gj_sortie_rapide_aile", "Gardien-joueur : sortie rapide vers l'aile");
    s.a(5, 24, 10, "Gardien-joueur").a(2, 22, 3, "Ailier").a(3, 22, 17, "Ailier").a(4, 30, 10, "Pivot").a(6, 12, 10, "Garde le but vide").b(6, 30, 8).b(7, 28, 13).b(8, 34, 10).b(9, 20, 8).gkb(38.6, 10);
    s.ball(0.3, 24, 10).go("A2", [0.6, 22, 3], [2.4, 32, 3]).arrow("goodrun", "A2", [32, 3], 0.6, 2.4, "Appel vers l'aile libre").pass("good", "A5", "A2", 0.8, 1.6, "Première passe vers l'aile libre").pass("good", "A2", [40, 9.6], 3.2, 4.0, "Tir ou centre");
    s.go("A5", [1.6, 24, 10], [4.0, 14, 10]).mark("check", 32, 3, 2.4, 9).label(14, 16, "Le gardien surveille son but", 0.4, 6, "#ffb020", 0.8);
    return steps(s, "Cinq contre quatre avec le gardien monté : on vient de récupérer le ballon.", "Première passe vers l'aile libre, l'ailier conduit puis centre ou tire.", "Première passe vers l'aile libre ; tir ou centre en moins de 6 s ; le gardien surveille son but ; retour si le ballon est perdu.");
  };

  D.gj_tir_ecran = () => {
    const s = mk("gj_tir_ecran", "Gardien-joueur : tir de loin avec écran");
    s.a(5, 24, 10, "Gardien-joueur").a(2, 28, 5, "Tireur").a(3, 33, 9, "Écran").a(4, 33, 14, "Rebond").a(6, 12, 10).b(6, 30, 9).b(7, 29, 13).b(8, 34, 11).b(9, 26, 7).gkb(38.6, 10);
    s.ball(0.3, 24, 10).go("A3", [0.6, 33, 9], [1.8, 36, 9.4]).arrow("goodrun", "A3", [36, 9.4], 0.6, 1.8, "Écran devant le gardien adverse").pass("good", "A5", "A2", 1.4, 2.2, "Passe au tireur").pass("good", "A2", [40, 10.4], 2.6, 3.3, "Frappe de loin");
    s.go("A4", [2.4, 33, 14], [3.6, 37.6, 12]).pass("good", "A4", [40, 9.4], 4.2, 4.9, "Reprise du rebond").mark("check", 28, 5, 2.4, 9);
    return steps(s, "Cinq contre quatre : un joueur se place en écran devant le gardien adverse pendant que le tireur frappe de loin.", "Deux autres joueurs s'approchent pour le rebond.", "Écran avant la frappe ; tireur en une touche ; deux joueurs pour le rebond ; aucune perte inutile.");
  };

  D.gj_montee_declencheur = () => {
    const s = mk("gj_montee_declencheur", "Gardien-joueur : quand monter ?");
    s.gka(2, 10).a(5, 14, 10).a(2, 18, 5).a(3, 18, 15).a(4, 24, 10).b(6, 28, 10).b(7, 26, 6).b(8, 26, 14).b(9, 22, 10).gkb(38.6, 10);
    s.ball(0.3, 14, 10).label(20, 3, "Ballon sous contrôle : je monte", 0.4, 4, "#35d07f", 0.9).go("GKA", [1.0, 2, 10], [3.5, 14, 10]).arrow("goodrun", "GKA", [14, 10], 1.0, 3.5, "Le gardien monte").mark("check", 14, 10, 3.5, 9);
    s.label(20, 17, "Adversaire lancé vers l'avant : je reste", 5, 12, "#ff5a5f", 0.9).go("B9", [5.4, 22, 10], [7, 12, 10]).mark("x", 4, 10, 6, 9).arrow("bad", "B9", "GKA", 5.4, 7, "Danger : le but est vide");
    return steps(s, "Trois situations : ballon récupéré en zone haute, adversaire lancé vers l'avant, jeu arrêté.", "Le gardien monte seulement ballon sous contrôle ou jeu arrêté ; il reste en place si l'adversaire est lancé.", "Monter seulement ballon sous contrôle ; ne pas monter si l'adversaire est lancé ; un joueur remplace le gardien derrière.");
  };

  D.gj_cote_faible = () => {
    const s = mk("gj_cote_faible", "Gardien-joueur : jouer du côté faible");
    s.a(5, 24, 10, "Gardien-joueur").a(2, 28, 4, "Côté fort").a(3, 28, 16, "Côté faible").a(4, 32, 10).a(6, 12, 10).b(6, 30, 6).b(7, 30, 10).b(8, 33, 4).b(9, 34, 14).gkb(38.6, 10);
    s.ball(0.3, 24, 10).pass("good", "A5", "A2", 0.6, 1.4, "Le jeu lent côté fort attire le bloc").pass("good", "A2", "A4", 2.0, 2.8).go("A3", [2.8, 28, 16], [4.4, 34, 17]).pass("good", "A4", "A3", 3.4, 4.2, "Changement d'aile en une passe");
    s.pass("good", "A3", [40, 9.6], 5.0, 5.8, "Tir").mark("check", 34, 17, 4.4, 9);
    return steps(s, "Cinq contre quatre : le bloc adverse est attiré d'un côté.", "Un changement d'aile rapide libère le joueur du côté faible.", "Attirer le bloc d'un côté ; changement d'aile en une passe ; tir en moins de 3 s après le changement.");
  };

  /* ================= défense ================= */
  D.pressing_homme_haut = () => {
    const s = mk("pressing_homme_haut", "Pressing haut homme à homme");
    s.gka(2, 10).a(5, 22, 4).a(2, 22, 8).a(3, 22, 12).a(4, 22, 16).b(6, 30, 4).b(7, 30, 8).b(8, 30, 12).b(9, 30, 16).gkb(38, 10);
    s.ball(0.3, 38, 10).pass("bad", "GKB", "B7", 0.6, 1.4, "Relance du gardien").go("A2", [1.4, 22, 8], [2.4, 29.4, 8.2]).arrow("press", "A2", "B7", 1.4, 2.4, "Je presse mon joueur").go("A5", [1.4, 22, 4], [2.6, 29.4, 4.4]).go("A3", [1.4, 22, 12], [2.6, 29.4, 12.2]).go("A4", [1.4, 22, 16], [2.6, 29.4, 16.2]);
    s.pass("bad", "B7", "B6", 3.0, 3.8).go("A5", [3.0, 29.4, 4.4], [3.8, 30.4, 4.6]).pass("good", "A5", [40, 9.6], 4.4, 5.2, "Ballon récupéré : tir").mark("check", 29.4, 8.2, 3.0, 9);
    return steps(s, "Chaque joueur prend un adversaire dès la relance du gardien adverse.", "Le plus proche du porteur presse, les autres coupent la passe à leur adversaire ; on revient vite à l'homme.", "Marquage pris dès la relance ; couper la passe avant de presser ; communication à voix haute ; récupération en moins de 6 s.");
  };

  D.piege_ligne_touche = () => {
    const s = mk("piege_ligne_touche", "Piège de la ligne de touche");
    s.gka(2, 10).a(5, 24, 12, "Coupe l'axe").a(2, 27, 17, "Ferme la passe en retrait").a(3, 22, 6, "Couvre la profondeur").b(9, 28, 15).b(7, 24, 18).b(8, 33, 8).gkb(38, 10);
    s.ball(0.3, 28, 15).go("B9", [0.6, 28, 15], [2.4, 28, 18.6]).go("A5", [0.6, 24, 12], [2.2, 27.4, 16]).arrow("press", "A5", "B9", 0.6, 2.2, "Je coupe l'axe : il va vers la ligne").go("A2", [1.0, 27, 17], [2.4, 26.4, 18]).arrow("press", "A2", "B7", 1.0, 2.4, "Je ferme la passe en retrait");
    s.pass("bad", "B9", "B8", 2.8, 3.6, "Passe forcée").go("A3", [3.0, 22, 6], [3.8, 31, 8]).pass("good", "A3", "A5", 4.6, 5.4, "Récupération").mark("check", 31, 8, 3.8, 9);
    return steps(s, "Le porteur est amené vers la ligne de touche.", "Le premier défenseur coupe l'axe, le second ferme la passe en retrait, le troisième couvre la profondeur.", "Le porteur est dirigé vers la ligne ; passes en retrait fermées ; aucun joueur battu ; récupération en moins de 5 s.");
  };

  D.defense_pivot_dos_but = () => {
    const s = mk("defense_pivot_dos_but", "Défendre un pivot dos au but");
    s.gka(2, 10).a(5, 10, 10, "Derrière le pivot").a(2, 12, 6, "Surveille l'appel").a(3, 14, 15).b(9, 12, 10, "Pivot").b(7, 18, 6).b(8, 20, 14).gkb(38, 10);
    s.ball(0.3, 20, 14).pass("pass", "B8", "B9", 0.8, 1.6, "Passe vers le pivot").go("A5", [0.6, 10, 10], [1.4, 11.4, 10]).arrow("press", "A5", "B9", 0.6, 1.4, "Je me place derrière").go("A3", [1.4, 14, 15], [2.6, 15, 11]);
    s.go("A5", [1.8, 11.4, 10], [2.4, 12, 10]).pass("good", "A3", "A2", 3.4, 4.2, "Interception de la remise").mark("check", 14, 12, 3.0, 9);
    return steps(s, "Trois défenseurs contre un pivot qui joue dos au but.", "Le défenseur se place derrière le pivot et anticipe la remise ; un autre surveille l'appel.", "Placement derrière le pivot ; contact légal ; intercepter la passe vers lui ; un second défenseur sur l'appel.");
  };

  D.defense_2v1_retarder = () => {
    const s = mk("defense_2v1_retarder", "Défendre à deux contre un : retarder et attendre");
    s.gka(2, 10).a(5, 12, 10, "Défenseur seul").a(2, 24, 8, "Revient").b(9, 22, 9).b(7, 22, 13).gkb(38, 10);
    s.ball(0.3, 22, 9).go("B9", [0.6, 22, 9], [3.0, 17, 9]).go("A5", [0.6, 12, 10], [3.0, 10, 10]).arrow("press", "A5", "B9", 0.6, 3.0, "Je recule sans me jeter").go("A2", [1.0, 24, 8], [3.4, 14, 9]).arrow("goodrun", "A2", [14, 9], 1.0, 3.4, "Mon partenaire revient");
    s.pass("good", "A5", "A2", 4.0, 4.8, "Ballon récupéré").mark("check", 10, 10, 3.2, 9);
    return steps(s, "Un défenseur seul contre deux attaquants.", "Il recule en gardant l'axe, force le porteur à ralentir et attend son partenaire.", "Reculer sans se jeter ; garder l'axe ; obliger l'attaquant à ralentir ; le partenaire revient en moins de 5 s.");
  };

  D.defense_couverture_croisee = () => {
    const s = mk("defense_couverture_croisee", "Couverture croisée : l'aide change de côté");
    s.gka(2, 10).a(5, 18, 6, "Presse").a(2, 16, 12, "Couverture").a(3, 12, 8, "Ferme le dos").b(9, 22, 6).b(7, 20, 12).b(8, 26, 10).gkb(38, 10);
    s.ball(0.3, 22, 6).go("A5", [0.6, 18, 6], [1.6, 21, 6]).arrow("press", "A5", "B9", 0.6, 1.6, "Je presse").go("A2", [0.6, 16, 12], [1.8, 18.6, 8.4]).go("A3", [0.6, 12, 8], [1.8, 15, 9]);
    s.go("B9", [2.0, 22, 6], [2.8, 20, 8]).go("A2", [2.2, 18.6, 8.4], [3.0, 20, 8.6]).arrow("press", "A2", "B9", 2.2, 3.0, "L'aide devient le presseur").go("A5", [2.2, 21, 6], [3.0, 19, 9.6]).pass("good", "A2", "A5", 3.6, 4.4, "Ballon récupéré").mark("check", 20, 8.6, 3.0, 9);
    return steps(s, "Trois défenseurs : un presse, un couvre en diagonale, un ferme le dos.", "Quand le pressing est battu, l'aide prend le porteur et le premier presseur couvre.", "La couverture est en diagonale ; l'aide change de rôle sans arrêt ; le dernier ferme le dos ; aucun trou dans l'axe.");
  };

  /* ================= attaque, transitions, finition, gardien ================= */
  D.attaque_3v2_largeur = () => {
    const s = mk("attaque_3v2_largeur", "Attaque 3 contre 2 : la largeur avant le centre");
    s.gka(2, 10).a(2, 24, 2, "Ailier").a(3, 24, 18, "Ailier").a(4, 22, 10, "Centre").b(6, 32, 8).b(7, 32, 12).gkb(38.6, 10);
    s.ball(0.3, 22, 10).pass("good", "A4", "A2", 0.6, 1.4, "Passe à l'aile").go("A2", [1.4, 24, 2], [3.0, 32, 2]).go("A4", [1.4, 22, 10], [3.2, 30, 10]).arrow("goodrun", "A4", [30, 10], 1.4, 3.2, "Appel du centre");
    s.pass("good", "A2", "A4", 3.4, 4.2, "Passe dans l'espace").pass("good", "A4", [40, 9.6], 4.8, 5.6, "Tir en une touche").mark("check", 30, 10, 4.2, 9);
    return steps(s, "Trois attaquants contre deux défenseurs : les ailiers restent larges.", "Passe à l'aile, appel du centre, passe dans l'espace puis tir.", "Ailes larges ; appel du centre au bon moment ; passe tendue dans l'espace ; tir en une touche.");
  };

  D.attaque_bloc_bas_patience = () => {
    const s = mk("attaque_bloc_bas_patience", "Attaquer un bloc bas avec patience");
    s.gka(2, 10).a(5, 24, 10, "Passeur").a(2, 26, 3, "Ailier").a(3, 26, 17, "Ailier").a(4, 30, 10, "Pivot").b(6, 34, 10).b(7, 34, 6).b(8, 34, 14).b(9, 36, 10).gkb(39, 10);
    s.ball(0.3, 24, 10).pass("good", "A5", "A2", 0.6, 1.3, "1").pass("good", "A2", "A4", 1.8, 2.5, "2").pass("good", "A4", "A3", 3.0, 3.7, "3").pass("good", "A3", "A5", 4.2, 4.9, "4").pass("good", "A5", "A2", 5.4, 6.1, "5");
    s.go("B7", [3.0, 34, 6], [4.4, 33, 3]).go("A2", [5.0, 26, 3], [6.1, 33, 4]).pass("good", "A2", [40, 9.6], 6.5, 7.2, "Tir quand un défenseur est attiré").mark("check", 33, 4, 6.1, 9);
    return steps(s, "Quatre attaquants contre un bloc bas.", "Le ballon circule, on attend qu'un défenseur sorte puis on tire.", "Au moins cinq passes avant le tir ; changer d'aile pour étirer ; tir quand un défenseur est attiré ; pas de tir forcé.");
  };

  D.attaque_une_touche_reduit = () => {
    const s = mk("attaque_une_touche_reduit", "Jeu à une touche en espace réduit");
    s.a(2, 14, 6).a(3, 22, 6).a(4, 22, 14).a(5, 14, 14).b(6, 18, 10).b(7, 18, 9).gka(2, 10).gkb(38, 10);
    s.zone("free", [12, 4, 12, 12], 0.5, 12, "Carré de 8 m").ball(0.3, 14, 6).pass("good", "A2", "A3", 0.6, 1.2, "Une touche").pass("good", "A3", "A4", 1.8, 2.4).pass("good", "A4", "A5", 3.0, 3.6).pass("good", "A5", "A2", 4.2, 4.8).pass("good", "A2", "A4", 5.4, 6.0, "Diagonale");
    s.go("B6", [1.0, 18, 10], [2.0, 20, 8]).go("B7", [1.0, 18, 9], [3.0, 15, 11]).mark("check", 22, 14, 6.0, 9);
    return steps(s, "Quatre joueurs en carré contre deux défenseurs.", "Une seule touche de balle, puis on passe et on bouge.", "Une touche de balle ; mouvement après la passe ; toujours deux solutions ; au moins dix passes d'affilée.");
  };

  D.contre_attaque_relance_gardien = () => {
    const s = mk("contre_attaque_relance_gardien", "Contre-attaque après l'arrêt du gardien");
    s.gka(2, 10, "Gardien").a(5, 12, 10).a(2, 14, 4, "Appel").a(3, 14, 16, "Appel").b(6, 30, 10).b(7, 28, 6).gkb(38, 10);
    s.ball(0.3, 2, 10).go("A2", [0.8, 14, 4], [2.6, 28, 4]).go("A3", [0.8, 14, 16], [3.0, 26, 16]).arrow("goodrun", "A2", [28, 4], 0.8, 2.6, "Premier appel").arrow("goodrun", "A3", [26, 16], 0.8, 3.0, "Deuxième appel");
    s.pass("good", "GKA", "A2", 1.2, 2.2, "Relance en moins de 3 s").go("A2", [2.6, 28, 4], [3.4, 32, 6]).pass("good", "A2", "A3", 3.8, 4.6, "Soutien").pass("good", "A3", [40, 9.6], 5.2, 6.0, "Tir en moins de 6 s").mark("check", 28, 4, 2.4, 9);
    return steps(s, "Le gardien vient d'arrêter un tir : deux joueurs démarrent déjà.", "Relance rapide vers l'attaquant lancé, un troisième joueur arrive en soutien.", "Relance en moins de 3 s ; deux appels dès l'arrêt ; un joueur en soutien ; tir en moins de 6 s.");
  };

  D.recuperation_haute_tir = () => {
    const s = mk("recuperation_haute_tir", "Récupération haute et tir rapide");
    s.gka(2, 10).a(5, 22, 10).a(2, 28, 4).a(3, 28, 16).a(4, 20, 10, "Couverture").b(6, 33, 10).b(7, 31, 6).b(8, 31, 14).gkb(38.6, 10);
    s.ball(0.3, 33, 10).pass("bad", "B6", "B7", 0.6, 1.3, "Passe adverse").go("A2", [1.3, 28, 4], [2.2, 31, 6]).arrow("press", "A2", "B7", 1.3, 2.2, "Pressing haut").go("A3", [1.3, 28, 16], [2.6, 33, 12]);
    s.pass("good", "A2", "A3", 2.4, 3.2, "Récupération puis passe").pass("good", "A3", [40, 10.4], 3.6, 4.4, "Tir en moins de 6 s").mark("check", 31, 6, 2.4, 9).label(20, 3, "Un joueur reste en couverture", 0.4, 7, "#ffb020", 0.8);
    return steps(s, "Pressing haut sur la relance adverse : un joueur reste en couverture.", "À la récupération on tire avant que le bloc se replace.", "Récupération dans la moitié adverse ; tir en moins de 6 s ; un joueur en couverture ; deuxième balle suivie.");
  };

  D.finition_centre_second_poteau = () => {
    const s = mk("finition_centre_second_poteau", "Finition : centre et reprise au second poteau");
    s.gka(2, 10).a(2, 28, 1.5, "Centreur").a(3, 30, 8, "Premier poteau").a(4, 29, 14, "Second poteau").gkb(38.8, 10).b(6, 36, 9);
    s.ball(0.3, 28, 1.5).go("A3", [0.8, 30, 8], [2.2, 37.4, 8]).go("A4", [1.2, 29, 14], [2.6, 36.8, 13]).arrow("goodrun", "A3", [37.4, 8], 0.8, 2.2, "Appel devant").arrow("goodrun", "A4", [36.8, 13], 1.2, 2.6, "Appel décalé derrière");
    s.go("A2", [0.8, 28, 1.5], [1.6, 33, 1.5]).pass("good", "A2", [36.8, 13], 2.2, 3.1, "Centre tendu").pass("good", "A4", [40, 9.8], 3.5, 4.2, "Reprise sans contrôle").mark("check", 36.8, 13, 3.2, 9);
    return steps(s, "Un ailier centre ; deux attaquants arrivent par des courses croisées.", "Le premier appelle devant, le second reprend derrière.", "Courses croisées ; reprise sans contrôle ; centre tendu ; un joueur attaque le premier poteau.");
  };

  D.gardien_duel_1v1 = () => {
    const s = mk("gardien_duel_1v1", "Gardien : sortir dans le duel un contre un");
    s.gka(2, 10, "Gardien").b(9, 14, 10, "Attaquant").a(5, 22, 12);
    s.ball(0.3, 14, 10).go("B9", [0.6, 14, 10], [3.0, 7, 10]).carry("B9", 0.6, 3.0).go("GKA", [1.0, 2, 10], [2.8, 4.4, 10]).arrow("press", "GKA", "B9", 1.0, 2.8, "J'avance pour réduire l'angle").label(10, 3, "Je reste debout", 1.4, 4, "#4aa3ff", 0.9);
    s.pass("bad", "B9", [0, 8.8], 3.0, 3.5, "Frappe").pass("good", "GKA", "A5", 3.9, 4.8, "Arrêt puis relance rapide").mark("check", 4.4, 10, 3.6, 9);
    return steps(s, "L'attaquant arrive lancé face au gardien.", "Le gardien avance pour réduire l'angle sans s'engager trop tôt.", "Avancer pour réduire l'angle ; rester debout ; réagir à la frappe et non au dribble ; relance rapide après l'arrêt.");
  };

  return D;
});
