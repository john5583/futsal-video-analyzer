/* Base de connaissances — Tactique détaillée : phases de jeu, coups de pied arrêtés, pressing,
   transitions, gardien-joueur, rotations, gestion de match et préparation. */
(function (target) {
  target.TACTICS = [
    {
      id: "phases",
      title: "Les quatre phases du jeu",
      items: [
        { title: "Attaque placée", text: "L'équipe a le ballon face à un bloc défensif organisé. Objectifs : conserver, créer la supériorité locale, trouver le tir. Outils : largeur, profondeur, triangles, rotations, écrans, passes et va." },
        { title: "Défense placée", text: "L'adversaire a le ballon et l'équipe est organisée derrière le ballon. Objectifs : empêcher les tirs, fermer l'axe, orienter vers les côtés, récupérer. Outils : bloc compact, coulissement, doublement, pressing organisé." },
        { title: "Transition défensive (perte)", text: "Les 3 premières secondes après la perte : contre-pressing sur le porteur ou repli immédiat derrière le ballon. Un sécurisant doit toujours être derrière le ballon." },
        { title: "Transition offensive (récupération)", text: "Après la récupération : première passe vers l'avant, courses des ailiers, finition en moins de 8 secondes si l'espace est libre ; sinon sécuriser et organiser l'attaque placée." }
      ]
    },
    {
      id: "attaque",
      title: "Principes d'attaque",
      items: [
        { title: "Largeur et profondeur", text: "Occuper les couloirs et la profondeur : au moins un joueur par couloir, un joueur en profondeur, le défenseur central en sécurité." },
        { title: "Triangles et soutien", text: "Le porteur a toujours deux solutions : une passe sûre (soutien à 3–5 m) et une passe qui avance. Le triangle évite la perte de balle sous pression." },
        { title: "Un-deux (paredes)", text: "Passe et appel immédiat : casse la ligne défensive et crée une accélération. Efficace contre un marquage individuel." },
        { title: "Écrans (bloqueos)", text: "Un attaquant se place légalement sur la trajectoire d'un défenseur pour libérer un partenaire. Utilisé surtout sur coups de pied arrêtés et en 4-0." },
        { title: "Rotations", text: "Permutation des postes (4-0, rotation en carré ou losange) pour désorganiser le marquage. Règle : jamais de rotation sous pression ; garder un joueur derrière le ballon." },
        { title: "Changement d'aile", text: "Après avoir attiré le bloc d'un côté, passer à l'aile opposée pour créer un 2 contre 1 ou un 3 contre 2." },
        { title: "Jeu avec le pivot", text: "Le pivot, dos au but, protège le ballon, remet en une touche à l'ailier qui monte ou fixe deux défenseurs. L'absence de hors-jeu permet de le placer très haut." },
        { title: "Jeu avec le gardien", text: "Le gardien participe à la construction : il offre une solution de sécurité, change l'aile et crée la supériorité numérique dans la relance." },
        { title: "Tir", text: "Frapper quand l'angle est ouvert, viser le second poteau, placer un joueur au rebond ; le tir en première est plus difficile à lire pour le gardien." }
      ]
    },
    {
      id: "defense",
      title: "Principes de défense",
      items: [
        { title: "Compacité", text: "Garder les lignes à 8–10 m maximum ; coulisser ensemble vers le ballon ; fermer l'axe en priorité." },
        { title: "Premier défenseur", text: "Le plus proche du ballon met la pression ou temporise : il oriente le porteur vers la touche et ne plonge pas." },
        { title: "Couverture et doublement", text: "Un joueur couvre derrière le premier défenseur à 3–4 m ; le doublement coupe l'avantage du dribbleur." },
        { title: "Marquage", text: "Individuel (chaque joueur suit un adversaire), en zone (secteurs) ou mixte. Les rotations adverses se suivent par transmission de marquage et communication." },
        { title: "Défense sans faute", text: "Le futsal comptabilise les fautes : défendre avec les jambes (placement) plutôt qu'avec les mains ; intercepter plutôt que charger. À la 5e faute, le coup franc suivant est à 10 m sans mur." },
        { title: "Défense contre le pivot", text: "Ne pas laisser le pivot se retourner : le défenseur reste collé, un deuxième joueur est prêt à doubler ; interdire la passe dans ses pieds." }
      ]
    },
    {
      id: "pressing",
      title: "Pressing et blocs",
      items: [
        { title: "Pressing haut / tout terrain", text: "Pression dès la relance adverse. Récupère haut et lance des contre-attaques courtes, mais exige une condition physique solide et des couvertures derrière." },
        { title: "Pressing médian", text: "L'équipe presse à partir de la ligne médiane en bloc compact : bon équilibre énergie / sécurité." },
        { title: "Bloc bas", text: "Repli à 10 m du but : réduit les espaces mais concède des tirs de loin et des fautes (compter le cumul)." },
        { title: "Déclencheurs", text: "Passe en retour, contrôle raté, passe vers le côté faible, appui dos au jeu : le pressing se déclenche ensemble, sinon on ne presse pas." },
        { title: "Pièges", text: "Orienter l'adversaire vers un côté où plusieurs joueurs ferment les lignes de passe puis presser fort." }
      ]
    },
    {
      id: "transitions",
      title: "Transitions",
      items: [
        { title: "Contre-pressing (5 secondes)", text: "Après une perte, on cherche à récupérer immédiatement le ballon : le plus proche presse, les autres ferment les lignes de passe." },
        { title: "Repli", text: "Si le contre-pressing échoue, repli rapide dans l'axe ; le premier défenseur temporise pour permettre à l'équipe de se replacer." },
        { title: "Contre-attaque", text: "Ouvrir vers un ailier, course dans l'espace libéré, passes courtes, finition rapide ; viser les situations 2 contre 1 et 3 contre 2." },
        { title: "Sécurité à l'attaque", text: "Toujours un joueur (souvent le défenseur central) en couverture, jamais plus de trois joueurs devant le ballon sans raison." }
      ]
    },
    {
      id: "cpa",
      title: "Coups de pied arrêtés",
      items: [
        { title: "Corner offensif", text: "Schémas : corner court avec appui, tir direct au premier ou second poteau, écran pour libérer un tireur, passe en retrait au point de penalty. Toujours exécuter en moins de 4 s." },
        { title: "Touche offensive", text: "Solutions : appel court + passe, appel long (pivot), touche vers l'ailier qui plonge dans le dos. L'adversaire doit être à 5 m : exploiter l'espace." },
        { title: "Coup franc direct ou indirect", text: "Mur adverse à 5 m : écrans, passes courtes pour décaler, tir direct si l'angle le permet. À partir de la 6e faute : tir de 10 m sans mur, viser le poteau ou la lucarne." },
        { title: "Défense de coup franc / corner", text: "Une mission par joueur : mur (à 5 m), gardien, second poteau, relance courte. Le gardien annonce, le mur est serré, le joueur au second poteau couvre." },
        { title: "Remise en jeu du gardien", text: "Solution courte vers l'ailier, relance longue si pressing haut, ou jeu avec le gardien-joueur ; respecter les 4 secondes." },
        { title: "Penalty et tirs au but", text: "Choisir un côté et s'y tenir, frapper fort ou piquer ; le gardien lit le pied d'appui et reste actif sur sa ligne." }
      ]
    },
    {
      id: "gj",
      title: "Gardien-joueur (5 contre 4)",
      items: [
        { title: "Quand l'utiliser ?", text: "Fin de match quand on est mené, après un temps mort, quand l'adversaire a 5 fautes, ou pour chercher un but à tout prix. À éviter si l'équipe est fatiguée ou sans plan." },
        { title: "Structures", text: "3-2 : trois joueurs de base (dont le gardien-joueur en relais), deux devant le bloc. 1-2-2 : un joueur de base, deux ailiers milieu, deux avancés. 4-1 : quatre joueurs en carré autour d'un pivot." },
        { title: "Sécurité", text: "Un joueur de sécurité reste derrière le ballon ; à la perte, le gardien-joueur est le premier à reculer. Le tir adverse dans le but vide se joue depuis l'ensemble du terrain." },
        { title: "Défendre contre le gardien-joueur", text: "À quatre : fermer l'axe, orienter vers les côtés, communiquer sur les croisements. Dès la récupération, tirer au but vide (ou passer à un coéquipier démarqué)." }
      ]
    },
    {
      id: "rotations",
      title: "Rotations, blocs et gestion des joueurs",
      items: [
        { title: "Quartets (blocs de 4)", text: "Beaucoup d'équipes font tourner des blocs de 4 joueurs de champ plus un gardien pour répartir l'effort ; les changements se font en continu pour garder l'intensité." },
        { title: "Rotations dans le jeu", text: "Le 4-0 repose sur des rotations (carré ou losange) qui permettent à chaque joueur d'occuper plusieurs postes ; indispensable pour contrer un marquage individuel." },
        { title: "Gestion de l'effort", text: "Les remplacements volants permettent de conserver une équipe fraîche : changer un joueur fatigué avant qu'il ne commette une faute ou ne perde le ballon." },
        { title: "Temps mort", text: "Utiliser le temps mort pour casser le rythme adverse, corriger une erreur répétée ou préparer un coup de pied arrêté ou le gardien-joueur." }
      ]
    },
    {
      id: "gestion",
      title: "Gestion de match",
      items: [
        { title: "Score et temps", text: "Mené : prendre des risques mesurés (pressing, gardien-joueur). Mené de peu en fin de match : gardien-joueur. Mené largement : conserver un rythme et ne pas s'exposer." },
        { title: "Fautes cumulées", text: "Suivre le compteur : à 4, changer le défenseur le plus exposé ; à 5, consigne de défendre sans contact." },
        { title: "Lecture de l'adversaire", text: "Identifier ses automatismes (touche, corner, rotations) et les neutraliser ; repérer le joueur clé et adapter le marquage." },
        { title: "Mentalité", text: "Garder le calme après un but encaissé : les 2 minutes suivantes sont les plus risquées ; communiquer et revenir à des actions simples." }
      ]
    },
    {
      id: "preparation",
      title: "Préparation et analyse vidéo",
      items: [
        { title: "Que regarder ?", text: "Pertes de balle et où elles surviennent, qualité des transitions, hauteur du bloc, distance entre les lignes, joueurs libres dans la zone de tir, efficacité des coups de pied arrêtés, usage du gardien-joueur." },
        { title: "Indicateurs utiles", text: "Possession, profondeur et largeur moyennes, zones occupées (carte de chaleur), distance parcourue par joueur, buts encaissés par phase de jeu, nombre de fautes cumulées par période." },
        { title: "Du constat à la correction", text: "Pour chaque erreur : l'observer, comprendre la cause, proposer une solution tactique, la démontrer en vue de dessus puis la travailler avec un exercice, enfin la mesurer au match suivant." }
      ]
    }
  ];
})(typeof module === "object" && module.exports ? module.exports : (window.FutsalKB = window.FutsalKB || {}));
