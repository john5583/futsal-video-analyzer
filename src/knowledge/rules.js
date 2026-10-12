/* Base de connaissances — Lois du jeu du futsal (synthèse des Lois FIFA du futsal).
   Synthèse pédagogique : toujours vérifier le règlement de la compétition jouée
   (dimensions, nombre de remplaçants, carton bleu, etc.). */
(function (target) {
  target.RULES = [
    {
      id: "terrain",
      title: "Terrain et matériel",
      items: [
        { title: "Dimensions du terrain", text: "Rectangle à surface lisse et non abrasive. Règle générale : longueur 25–42 m, largeur 16–25 m. Matchs internationaux : 38–42 m × 20–25 m. Les lignes mesurent 8 cm de large." },
        { title: "But", text: "3 m de large × 2 m de haut." },
        { title: "Surface de réparation", text: "Quart de cercle de 6 m de rayon centré sur chaque poteau, relié par une ligne droite de 3,16 m devant le but. Elle est réservée au gardien : un joueur de champ qui y touche le ballon de façon illicite (défenseur) concède un penalty." },
        { title: "Points de repère", text: "Point de penalty à 6 m du but. Second point de réparation à 10 m (utilisé pour les fautes cumulées). Cercle central de 3 m de rayon. Arcs de corner de 25 cm de rayon. Marques à 5 m sur la ligne de touche et la ligne de but pour la distance réglementaire des adversaires." },
        { title: "Ballon", text: "Taille 4, circonférence 62–64 cm, poids 400–440 g, à rebond réduit (50–65 cm après une chute de 2 m)." },
        { title: "Équipement", text: "Protège-tibias obligatoires. Le gardien porte une tenue le distinguant des joueurs et des arbitres. Le gardien-joueur doit porter un maillot de gardien ou être clairement identifiable selon la compétition." }
      ]
    },
    {
      id: "joueurs",
      title: "Joueurs, remplacements, arbitres",
      items: [
        { title: "Composition", text: "5 joueurs par équipe sur le terrain dont un gardien. Un match ne peut pas débuter ni continuer si une équipe compte moins de 3 joueurs." },
        { title: "Remplacements", text: "Remplacements volants illimités (le temps de jeu ne s'arrête pas). Le joueur sortant doit quitter le terrain par sa zone de remplacement avant que le remplaçant n'entre. Entrée irrégulière = sanction disciplinaire." },
        { title: "Arbitres", text: "Deux arbitres sur le terrain (un de chaque côté), un troisième arbitre et un chronométreur, qui gère le temps et le cumul des fautes à la table." }
      ]
    },
    {
      id: "temps",
      title: "Durée du match et temps morts",
      items: [
        { title: "Durée", text: "Deux périodes égales de 20 minutes de temps effectif (chrono arrêté à chaque arrêt de jeu). Mi-temps de 15 minutes maximum." },
        { title: "Temps mort", text: "Un temps mort d'1 minute par équipe et par période, demandé par le banc lorsque l'équipe est en possession du ballon (non cumulable)." },
        { title: "Prolongation", text: "2 périodes de 5 minutes si la compétition l'exige, puis tirs au but." }
      ]
    },
    {
      id: "regles-4s",
      title: "La règle des 4 secondes",
      items: [
        { title: "Remises en jeu", text: "Touche (au pied), coup franc, corner et remise en jeu du gardien doivent être exécutés dans les 4 secondes suivant le moment où le joueur est prêt. Dépassement : l'adversaire obtient une remise en jeu (touche pour le pied, corner pour la défense, etc., selon le cas)." },
        { title: "Gardien en possession", text: "Le gardien qui contrôle le ballon dans sa propre moitié ne peut le garder plus de 4 secondes. Sanction : coup franc indirect." },
        { title: "Passe en retour", text: "Après avoir lâché le ballon dans sa moitié, le gardien ne peut le retoucher de nouveau (main ou pied) tant qu'un adversaire ne l'a pas touché ou qu'il n'a pas été joué par un coéquipier dans la moitié adverse. Cette règle impose de relancer vite et d'éviter la passe en retour inutile." }
      ]
    },
    {
      id: "fautes",
      title: "Fautes, cartons et fautes cumulées",
      items: [
        { title: "Coup franc direct", text: "Sanctionne les fautes de contact (tacler, faire trébucher, pousser, tenir, charger de façon imprudente…) et la main volontaire (hors gardien dans sa surface). Un tacle glissé est sanctionné lorsqu'il met en danger l'adversaire ; il est interdit contre le gardien dans sa surface." },
        { title: "Fautes cumulées", text: "Chaque faute sanctionnée d'un coup franc direct est comptée à la table par équipe et par période. Les 5 premières n'ont pas de conséquence particulière. À partir de la 6e faute cumulée, tout coup franc direct est tiré du second point de réparation (10 m) sans mur ; le gardien défenseur doit rester derrière le ballon, à au moins 5 m." },
        { title: "Coup franc indirect", text: "Sanctionne notamment : danger, obstruction, gardien > 4 s ou passe en retour interdite, geste dangereux sans contact, contestation par la parole." },
        { title: "Cartons", text: "Carton jaune : avertissement (2 jaunes = expulsion). Carton rouge : expulsion. L'équipe joue à 4 pendant 2 minutes ou jusqu'à ce que l'adversaire marque, puis le remplaçant peut entrer. Certaines compétitions ajoutent un carton bleu (exclusion temporaire, sans rapport avec la FIFA) : se référer au règlement." },
        { title: "Penalty", text: "Tiré depuis le point de penalty à 6 m, contre le gardien seul. Tous les autres joueurs restent derrière le ballon et hors de la surface jusqu'à la frappe. Un défenseur qui joue le ballon dans sa propre surface concède un penalty." }
      ]
    },
    {
      id: "remises",
      title: "Remises en jeu",
      items: [
        { title: "Coup d'envoi", text: "Le ballon peut être joué dans n'importe quelle direction ; les adversaires restent à 3 m. But direct possible." },
        { title: "Touche au pied", text: "Remise en jeu au pied, ballon immobile sur la ligne, adversaires à 5 m, 4 secondes. Aucun but ne peut être marqué directement depuis une touche." },
        { title: "Corner", text: "Tiré de l'arc de corner, adversaires à 5 m, 4 secondes. But direct possible." },
        { title: "Remise en jeu du gardien", text: "Faite à la main depuis la surface, le ballon doit sortir de la surface avant d'être touché par l'adversaire. 4 secondes." },
        { title: "Coup franc", text: "Direct ou indirect, ballon immobile, adversaires à 5 m (mur), 4 secondes pour l'exécuter." }
      ]
    },
    {
      id: "hors-jeu",
      title: "Pas de hors-jeu",
      items: [
        { title: "Règle", text: "Il n'y a pas de hors-jeu en futsal. Un attaquant peut donc se tenir près du but adverse ; le pivot s'appuie sur ce fait pour fixer la défense." }
      ]
    },
    {
      id: "gardien-joueur",
      title: "Gardien-joueur (power play)",
      items: [
        { title: "Définition", text: "Une équipe peut remplacer son gardien par un cinquième joueur de champ (supériorité 5 contre 4). Le gardien-joueur doit pouvoir être identifié. Risque majeur : perte de balle suivie d'un tir dans le but vide." },
        { title: "Intérêt", text: "Créer la supériorité numérique pour : marquer en fin de match, désorganiser un bloc bas, ou jouer un coup franc cumulé. Exige une organisation précise (voir Systèmes tactiques)." }
      ]
    }
  ];
})(typeof module === "object" && module.exports ? module.exports : (window.FutsalKB = window.FutsalKB || {}));
