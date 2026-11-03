/* Animations des exercices d'écrans, de mur en escalier, de sortie sous pressing et de feintes de frappe (voir knowledge/seance-drills3.js).
   Mon équipe A (bleu) attaque vers la droite (but adverse en x = 40), adversaire B (rouge), terrain 40 × 20 m. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./builder.js"));
  else root.FutsalScenesDrillsPlan4 = factory(root.FutsalSceneBuilder);
})(typeof self !== "undefined" ? self : this, function (SB) {
  "use strict";
  const D = {};
  const mk = (id, title) => SB.Scene(id, title, 13);
  const steps = (s, setup, run, crit) => s.step(0, 3.5, "exercice", setup).step(3.5, 10, "exercice", run).step(10, 13, "consigne", crit).done();

  D.coup_franc_mur_escalier = () => {
    const s = mk("coup_franc_mur_escalier", "Défendre un coup franc : mur en escalier");
    s.gka(2, 10).a(5, 6, 12.2, "Mur").a(2, 6.6, 10.9, "Mur").a(3, 7.2, 9.6, "Mur").a(4, 13, 15, "Couverture").b(9, 11, 11, "Tireur").b(7, 12, 14).b(8, 14, 6);
    s.ball(0.3, 11, 11).zone("free", [5, 8.8, 3.4, 4.6], 0.5, 12, "Mur en escalier à 5 m").label(9, 17.5, "Le mur ne saute pas", 0.5, 7, "#ffb020", 0.9);
    s.go("GKA", [2.0, 2, 10], [2.8, 2, 9.0]).pass("bad", "B9", [0, 8.6], 2.4, 3.1, "Frappe vers le côté ouvert").pass("good", "GKA", [8, 15], 3.5, 4.2, "Le gardien couvre le côté ouvert").mark("check", 2, 9.0, 3.2, 9);
    return steps(s, "Trois joueurs forment un mur décalé en diagonale à 5 m ; le gardien se place du côté laissé ouvert.", "Le mur ne saute pas ; la frappe part vers le côté ouvert où le gardien l'attend.", "Mur à 5 m en diagonale ; le gardien couvre le côté ouvert ; le mur ne tourne pas le dos ; un joueur en couverture.");
  };

  D.coup_franc_ecran_tireur = () => {
    const s = mk("coup_franc_ecran_tireur", "Coup franc avec écran devant le gardien");
    s.gka(2, 10).a(2, 27, 12, "Tireur").a(3, 31, 6, "Écran").a(4, 31, 15, "Rebond").b(6, 33, 10.8).b(7, 33, 9.2).gkb(39, 10);
    s.ball(0.3, 27, 12).zone("free", [32, 8.2, 2, 3.6], 0.5, 12, "Mur à 5 m").go("A3", [0.8, 31, 6], [1.8, 35, 8.4]).arrow("goodrun", "A3", [35, 8.4], 0.8, 1.8, "L'écran se place derrière le mur").go("A4", [2.0, 31, 15], [3.2, 36, 13]);
    s.pass("good", "A2", [40, 8.8], 2.4, 3.1, "Frappe au ras du sol derrière l'écran").pass("good", "GKB", [35, 13], 3.5, 4.1, "Rebond").pass("good", "A4", [40, 10.4], 4.6, 5.2, "Reprise du rebond").mark("check", 35, 8.4, 3.0, 9);
    return steps(s, "Un écran derrière le mur masque le départ de la frappe au gardien ; un partenaire attend le rebond.", "Le tireur frappe au ras du sol derrière l'écran.", "Écran avant la frappe ; sans obstruction ; frappe au ras du sol ; un joueur pour le rebond.");
  };

  D.corner_ecran_second_poteau = () => {
    const s = mk("corner_ecran_second_poteau", "Corner avec écran sur le gardien et reprise au second poteau");
    s.gka(2, 10).a(5, 30, 10, "Couverture").a(2, 39.6, 0.5, "Tireur").a(3, 36, 5, "Écran").a(4, 34, 14, "Reprise").b(6, 38, 7).b(7, 37, 11).gkb(38.6, 10);
    s.ball(0.3, 39.7, 0.3).go("A3", [0.6, 36, 5], [1.8, 38.2, 8.8]).arrow("goodrun", "A3", [38.2, 8.8], 0.6, 1.8, "L'écran se place devant le gardien").go("A4", [1.4, 34, 14], [2.6, 37.6, 14]).arrow("goodrun", "A4", [37.6, 14], 1.4, 2.6, "Arrivée en retard au second poteau");
    s.pass("good", "A2", [37.6, 14], 2.6, 3.4, "Centre tendu").pass("good", "A4", [40, 10.4], 3.8, 4.5, "Reprise en une touche").mark("check", 37.6, 14, 3.4, 9);
    return steps(s, "Un écran devant le gardien adverse ; un joueur arrive en retard au second poteau.", "Le centre passe derrière l'écran jusqu'au joueur qui reprend.", "Écran avant le centre ; reprise en une touche ; centre tendu ; jeu légal, sans obstruction.");
  };

  D.rentree_ecran = () => {
    const s = mk("rentree_ecran", "Rentrée de touche avec écran pour libérer le receveur");
    s.gka(2, 10).a(2, 24, 19.8, "Rentrée").a(3, 28, 14, "Receveur").a(4, 27, 17, "Écran").b(6, 29.4, 15.2).b(7, 33, 10).gkb(38, 10);
    s.ball(0.3, 24, 19.8).go("A4", [0.6, 27, 17], [1.6, 28.4, 16.2]).arrow("goodrun", "A4", [28.4, 16.2], 0.6, 1.6, "L'écran se place sur le défenseur").go("A3", [1.2, 28, 14], [2.4, 31, 11]).arrow("goodrun", "A3", [31, 11], 1.2, 2.4, "Départ dans l'espace libéré");
    s.pass("good", "A2", [31, 11], 2.6, 3.3, "Rentrée jouée en moins de 4 s").pass("good", "A3", [40, 9.6], 3.9, 4.7, "Enchaînement : tir").mark("check", 31, 11, 3.3, 9);
    return steps(s, "Le receveur est marqué de près : un partenaire se place en écran sur son défenseur.", "Le receveur démarre dans l'espace libéré, la rentrée est jouée dans les 4 secondes.", "Écran avant la rentrée ; départ au bon moment ; rentrée en moins de 4 s ; enchaînement immédiat.");
  };

  D.ecran_ailier_pivot = () => {
    const s = mk("ecran_ailier_pivot", "Écran du pivot pour libérer l'ailier");
    s.gka(2, 10).a(5, 14, 10, "Passeur").a(2, 24, 4, "Ailier").a(4, 28, 10, "Pivot").a(3, 20, 16).b(7, 26, 6).b(6, 31, 10).b(8, 24, 14).gkb(38, 10);
    s.ball(0.3, 14, 10).go("A4", [0.6, 28, 10], [1.8, 26.4, 7.4]).arrow("goodrun", "A4", [26.4, 7.4], 0.6, 1.8, "Le pivot s'immobilise en écran").go("B7", [1.4, 26, 6], [2.2, 26, 7.2]).go("A2", [1.8, 24, 4], [3.2, 31, 8]).arrow("goodrun", "A2", [31, 8], 1.8, 3.2, "L'ailier part de l'autre côté de l'écran");
    s.pass("good", "A5", [31, 8], 2.4, 3.4, "Passe tendue dans l'espace").pass("good", "A2", [40, 9.4], 4.2, 5.0, "Tir").mark("check", 31, 8, 3.4, 9);
    return steps(s, "Le pivot se place sur la trajectoire du défenseur de l'ailier.", "L'ailier part de l'autre côté de l'écran, le porteur lui passe dans l'espace libéré.", "Pivot immobile au contact ; l'ailier part du côté de l'écran ; passe tendue ; tir ou passe en moins de 4 s.");
  };

  D.defense_contre_ecran = () => {
    const s = mk("defense_contre_ecran", "Défendre contre un écran : annoncer et échanger");
    s.gka(2, 10).a(5, 21, 9, "Marque le porteur").a(2, 24, 12, "Marque l'écran").a(3, 14, 12).b(9, 22, 8, "Porteur").b(8, 23, 10, "Écran").b(7, 28, 6).gkb(38, 10);
    s.ball(0.3, 22, 8).go("B9", [0.8, 22, 8], [2.2, 26, 12]).carry("B9", 0.8, 2.2).label(21, 4.8, "Écran !", 1.2, 3.4, "#ffb020", 1.3);
    s.go("A2", [2.0, 24, 12], [3.0, 26.4, 12.8]).arrow("press", "A2", "B9", 2.0, 3.0, "J'échange : je prends le porteur").go("A5", [2.0, 21, 9], [3.0, 23.6, 10.6]).arrow("press", "A5", "B8", 2.0, 3.0, "Je prends le joueur de l'écran");
    s.pass("bad", "B9", "B7", 3.4, 4.2, "Passe forcée").pass("good", "A2", "A3", 4.8, 5.6, "Ballon récupéré").mark("check", 26.4, 12.8, 3.2, 9);
    return steps(s, "Un attaquant place un écran sur le défenseur qui marque le porteur.", "Le défenseur masqué annonce « écran », son partenaire échange et prend le porteur.", "Annoncer à voix haute ; échanger les adversaires ; ne pas lâcher le porteur ; aucune faute en contournant l'écran.");
  };

  D.sortie_pression_sans_gardien = () => {
    const s = mk("sortie_pression_sans_gardien", "Sortir sous pressing sans le gardien");
    s.gka(2, 10, "Gardien").a(5, 7, 6).a(2, 7, 14).a(3, 14, 10).a(4, 22, 10).b(6, 10, 8).b(7, 10, 12);
    s.ball(0.3, 7, 6).label(8, 18, "Le gardien ne participe pas", 0.4, 6, "#ffb020", 0.9).go("B6", [0.6, 10, 8], [1.4, 8, 7]).arrow("press", "B6", "A5", 0.6, 1.4, "Pressing sur le porteur");
    s.pass("good", "A5", "A2", 1.8, 2.6, "Changement d'aile : solution à côté").go("A3", [2.2, 14, 10], [3.0, 13, 12.6]).pass("good", "A2", "A3", 3.4, 4.2, "Remise en une touche").pass("good", "A3", "A4", 4.8, 5.6, "Solution plus profonde").mark("check", 22, 10, 5.6, 9);
    return steps(s, "Quatre joueurs sortent le ballon contre deux pressants, sans utiliser le gardien.", "Une solution à côté du porteur, une plus profonde ; on change d'aile puis on joue vers l'avant.", "Une solution à côté et une plus profonde ; utiliser la largeur ; remise en une touche ; ligne médiane franchie en moins de 8 s.");
  };

  D.sortie_pression_gardien_securite = () => {
    const s = mk("sortie_pression_gardien_securite", "Sortir sous pressing : le gardien comme solution de sécurité");
    s.gka(2, 10, "Gardien").a(5, 8, 6).a(2, 8, 14).a(4, 22, 10).b(6, 10, 7).b(7, 12, 12);
    s.ball(0.3, 8, 6).go("B6", [0.6, 10, 7], [1.4, 8.6, 6.4]).arrow("press", "B6", "A5", 0.6, 1.4, "Passe courte fermée");
    s.pass("good", "A5", "GKA", 1.8, 2.5, "Retour au gardien sans hésiter").pass("good", "GKA", "A2", 3.0, 3.8, "Changement d'aile en une passe").go("A2", [3.8, 8, 14], [4.4, 11, 13]).pass("good", "A2", "A4", 4.8, 5.6, "Passe vers l'avant").mark("check", 8, 14, 3.8, 9);
    return steps(s, "Le défenseur est pressé et la passe courte est fermée.", "Retour au gardien, changement d'aile, passe vers l'avant.", "Retour au gardien sans hésiter ; changement d'aile en une passe ; pas de perte devant son but.");
  };

  D.sortie_pression_gj = () => {
    const s = mk("sortie_pression_gj", "Sortir sous pressing avec le gardien-joueur");
    s.a(5, 5, 5).a(2, 5, 15).a(3, 8, 10, "Gardien-joueur").a(4, 18, 5).a(6, 18, 15).b(7, 9, 6).b(8, 9, 14).b(9, 15, 10);
    s.ball(0.3, 5, 5).go("B7", [0.6, 9, 6], [1.4, 6.4, 5.4]).arrow("press", "B7", "A5", 0.6, 1.4, "Pressing").pass("good", "A5", "A3", 1.8, 2.5, "Vers le gardien-joueur libre");
    s.go("B9", [2.4, 15, 10], [3.0, 11, 10]).pass("good", "A3", "A2", 3.2, 4.0, "Changement d'aile : surnombre utilisé").pass("good", "A2", "A6", 4.6, 5.4, "Passe vers l'avant").mark("check", 8, 10, 2.6, 9).label(20, 18.5, "Son but est vide : pas de perte", 0.4, 6, "#ffb020", 0.8);
    return steps(s, "Cinq joueurs, gardien-joueur compris, contre trois pressants.", "Le gardien-joueur est un joueur libre de plus ; on l'utilise pour changer d'aile.", "Le surnombre est utilisé ; le gardien-joueur bouge ; aucune perte devant son but ; progression en moins de 8 s.");
  };

  D.feinte_frappe_passe = () => {
    const s = mk("feinte_frappe_passe", "Feinte de frappe puis passe");
    s.gka(2, 10).a(4, 30, 10, "Porteur").a(2, 31, 4, "Partenaire").a(3, 26, 15).b(6, 33, 9.4).gkb(38.6, 10);
    s.ball(0.3, 30, 10).label(30, 13, "Feinte de frappe", 0.8, 2.6, "#ffb020", 1.0).go("A4", [1.0, 30, 10], [1.6, 30.8, 10]).go("B6", [1.6, 33, 9.4], [2.4, 31.6, 9.8]).mark("x", 31.6, 9.8, 2.4, 9);
    s.pass("good", "A4", "A2", 2.8, 3.5, "Passe juste après la feinte").go("A2", [3.5, 31, 4], [4.0, 34, 5]).pass("good", "A2", [40, 9.6], 4.6, 5.4, "Finition en une touche").mark("check", 34, 5, 3.6, 9);
    return steps(s, "Le porteur arme sa frappe devant un défenseur ; un partenaire est démarqué sur le côté.", "Le défenseur se jette sur la feinte, le porteur sert le partenaire qui finit.", "Feinte crédible ; passe juste après la feinte ; le partenaire est déjà placé ; finition en une touche.");
  };

  D.feinte_frappe_dribble = () => {
    const s = mk("feinte_frappe_dribble", "Feinte de frappe puis dribble");
    s.gka(2, 10).a(4, 29, 10, "Porteur").b(6, 33, 10).gkb(38.6, 10);
    s.ball(0.3, 29, 10).label(29, 13, "Feinte de frappe", 0.8, 2.4, "#ffb020", 1.0).go("A4", [1.0, 29, 10], [1.6, 30.2, 10]).go("B6", [1.6, 33, 10], [2.4, 31.4, 10]).mark("x", 31.4, 10, 2.4, 9);
    s.go("A4", [2.4, 30.2, 10], [3.8, 33.6, 6.6]).carry("A4", 2.4, 3.8).arrow("goodrun", "A4", [33.6, 6.6], 2.4, 3.8, "Contournement du côté libre").pass("good", "A4", [40, 9.4], 4.4, 5.2, "Frappe de l'autre pied").mark("check", 33.6, 6.6, 3.9, 9);
    return steps(s, "Un porteur face à un défenseur et un gardien.", "Feinte de frappe, le défenseur s'avance, le porteur contourne et frappe de l'autre pied.", "Feinte crédible ; contournement du côté libre ; frappe de l'autre pied ; moins de 3 secondes pour l'ensemble.");
  };

  D.feinte_frappe_1v1_gardien = () => {
    const s = mk("feinte_frappe_1v1_gardien", "Feinte de frappe face au gardien");
    s.gka(2, 10).a(4, 32, 10, "Attaquant").gkb(38.6, 10);
    s.ball(0.3, 32, 10).go("A4", [0.6, 32, 10], [2.4, 35.4, 10]).carry("A4", 0.6, 2.4).label(33, 13.6, "J'arme la frappe", 2.0, 3.8, "#ffb020", 1.0).go("GKB", [2.6, 38.6, 10], [3.2, 38.6, 8.4]).arrow("press", "GKB", "A4", 2.6, 3.2, "Le gardien plonge sur la feinte");
    s.go("A4", [2.6, 35.4, 10], [3.6, 37, 11.6]).carry("A4", 2.6, 3.6).pass("good", "A4", [40, 11], 3.9, 4.5, "Je conclus du côté opposé").mark("check", 37, 11.6, 3.6, 9);
    return steps(s, "L'attaquant arrive face au gardien.", "Il arme sa frappe pour faire plonger le gardien puis conclut du côté opposé.", "Armer la frappe sans tirer ; attendre le mouvement du gardien ; conclure du côté opposé ; moins de trois secondes dans la surface.");
  };

  D.coup_franc_feinte_frappe = () => {
    const s = mk("coup_franc_feinte_frappe", "Coup franc : feinte de frappe et partenaire qui tire");
    s.gka(2, 10).a(2, 27, 12, "Feinte").a(3, 28.6, 10.6, "Tireur").a(4, 31, 15).b(6, 33, 10.8).b(7, 33, 9.2).gkb(39, 10);
    s.ball(0.3, 28, 11.4).go("A2", [0.8, 27, 12], [1.8, 28.4, 11.6]).arrow("goodrun", "A2", [28.4, 11.6], 0.8, 1.8, "Course comme pour tirer").go("B6", [1.6, 33, 10.8], [2.3, 33, 10.2]).go("B7", [1.6, 33, 9.2], [2.3, 33, 8.6]);
    s.pass("good", "A3", [40, 9], 2.8, 3.5, "Le partenaire frappe au ras du sol").pass("good", "GKB", [35, 13], 3.9, 4.5, "Rebond").pass("good", "A4", [40, 10.4], 4.9, 5.5, "Reprise").mark("check", 28.6, 10.6, 2.8, 9);
    return steps(s, "Le premier joueur s'élance comme pour tirer, son partenaire est à côté du ballon.", "Le premier laisse le ballon, le partenaire frappe au ras du sol.", "Course crédible ; le partenaire frappe au ras du sol ; coup franc joué en moins de 4 s ; un joueur pour le rebond.");
  };

  D.corner_feinte_frappe = () => {
    const s = mk("corner_feinte_frappe", "Corner : feinte du tireur et passe courte");
    s.gka(2, 10).a(5, 30, 10).a(2, 39.6, 0.5, "Tireur").a(3, 36.4, 3, "Feinte").a(4, 35, 8, "Frappeur").b(6, 38, 8).b(7, 36, 5).b(8, 36, 12).gkb(38.6, 10);
    s.ball(0.3, 39.7, 0.3).go("A3", [0.6, 36.4, 3], [1.4, 39, 1.2]).arrow("goodrun", "A3", [39, 1.2], 0.6, 1.4, "Il s'approche comme pour centrer").go("B7", [1.2, 36, 5], [2.0, 37.6, 3]).arrow("press", "B7", "A3", 1.2, 2.0, "Les défenseurs suivent");
    s.go("A4", [1.6, 35, 8], [2.4, 35.4, 9]).pass("good", "A2", "A4", 2.2, 3.0, "Passe vers le partenaire démarqué").pass("good", "A4", [40, 9.8], 3.4, 4.1, "Frappe en une touche").mark("check", 35.4, 9, 3.0, 9);
    return steps(s, "Un deuxième joueur s'approche du ballon comme pour centrer.", "Il passe par-dessus sans le toucher, le tireur sert le partenaire démarqué qui frappe.", "Mouvement crédible ; passe courte vers le partenaire libre ; frappe en une touche ; corner joué en moins de 4 s.");
  };

  return D;
});
