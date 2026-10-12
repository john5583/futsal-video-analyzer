/* Base de connaissances — Lois du jeu du futsal (synthèse pédagogique des Lois FIFA du futsal).
   Toujours vérifier le règlement de la compétition jouée : dimensions, nombre de remplaçants,
   carton bleu, temps morts, procédures de fin de match peuvent varier selon la fédération. */
(function (target) {
  target.RULES = [
    {
      id: "terrain",
      title: "Terrain et matériel",
      items: [
        { title: "Dimensions du terrain", text: "Rectangle à surface lisse et non abrasive. Règle générale : longueur 25–42 m, largeur 16–25 m (la longueur est toujours supérieure à la largeur). Matchs internationaux : 38–42 m × 20–25 m. Les lignes mesurent 8 cm de large et font partie des zones qu'elles délimitent." },
        { title: "But", text: "3 m de large × 2 m de haut (mesures intérieures). Les poteaux et la barre transversale sont de même largeur et blancs ; des filets sont fixés derrière le but." },
        { title: "Surface de réparation", text: "Quart de cercle de 6 m de rayon centré sur chaque poteau, relié par une ligne droite de 3,16 m devant le but. Elle est réservée au gardien : un joueur de champ peut la traverser sans toucher le ballon ; un défenseur qui y joue le ballon concède un penalty." },
        { title: "Points de repère", text: "Point de penalty à 6 m du milieu de la ligne de but. Second point de réparation à 10 m (utilisé pour les fautes cumulées). Cercle central de 3 m de rayon. Arcs de corner de 25 cm de rayon. Marques à 5 m sur la ligne de touche et la ligne de but pour la distance réglementaire des adversaires." },
        { title: "Zones de remplacement", text: "Deux zones de 5 m de long de chaque côté de la table de marque, devant les bancs. Les remplacements s'y font : le joueur sortant quitte le terrain par sa zone avant que le remplaçant entre." },
        { title: "Ballon", text: "Taille 4, circonférence 62–64 cm, poids 400–440 g, à rebond réduit (50–65 cm après une chute de 2 m depuis 2 m de haut)." },
        { title: "Équipement", text: "Protège-tibias obligatoires, maillot, short, chaussettes couvrant les protège-tibias, chaussures de salle. Le gardien porte une tenue le distinguant des autres joueurs et des arbitres. Bijoux interdits. Les deux équipes portent des couleurs bien distinctes." }
      ]
    },
    {
      id: "joueurs",
      title: "Joueurs, remplaçants, arbitres",
      items: [
        { title: "Composition", text: "5 joueurs par équipe sur le terrain dont un gardien. Un match ne peut pas débuter ni continuer si une équipe compte moins de 3 joueurs. Le nombre de remplaçants (jusqu'à 9) est fixé par le règlement de la compétition." },
        { title: "Remplacements", text: "Remplacements volants illimités (le temps de jeu ne s'arrête pas), sans prévenir les arbitres. Le joueur sortant doit être complètement sorti avant que le remplaçant entre. Entrée irrégulière = avertissement et reprise par coup franc indirect." },
        { title: "Changement de gardien", text: "Le gardien peut être remplacé comme tout joueur. Tout joueur peut aussi prendre la place du gardien (gardien-joueur) si le changement est fait en respectant la procédure de remplacement et si le joueur est identifié comme gardien." },
        { title: "Arbitres", text: "Deux arbitres sur le terrain (un de chaque côté), un troisième arbitre et un chronométreur à la table de marque. Les décisions concernant les faits de jeu sont définitives. Les arbitres peuvent laisser jouer l'avantage." },
        { title: "Chronométreur et troisième arbitre", text: "Gèrent le temps de jeu effectif, les temps morts, les remplacements à la table, le compteur de fautes cumulées et les cartons ; ils signalent les 5 fautes cumulées." }
      ]
    },
    {
      id: "temps",
      title: "Durée du match et temps morts",
      items: [
        { title: "Durée", text: "Deux périodes égales de 20 minutes de temps effectif (chrono arrêté à chaque arrêt de jeu). Mi-temps de 15 minutes maximum. Une période est prolongée pour permettre l'exécution d'un penalty ou d'un coup franc direct de faute cumulée." },
        { title: "Temps mort", text: "Un temps mort d'1 minute par équipe et par période, demandé par le banc lorsque l'équipe est en possession du ballon (non cumulable : un seul par période)." },
        { title: "Prolongation et tirs au but", text: "En cas d'égalité dans un match à élimination : 2 périodes de 5 minutes, puis tirs au but (série de 3 tireurs par équipe, puis un par un). Seuls les joueurs présents sur le terrain à la fin du match peuvent tirer." },
        { title: "Fin de match", text: "L'équipe qui a marqué le plus de buts gagne. Si les deux équipes marquent autant de buts, ou n'en marquent aucun, le match est nul sauf règlement contraire." }
      ]
    },
    {
      id: "regles-4s",
      title: "La règle des 4 secondes",
      items: [
        { title: "Remises en jeu", text: "Touche (au pied), coup franc, corner et remise en jeu du gardien doivent être exécutés dans les 4 secondes suivant le moment où le joueur est prêt. Dépassement : l'adversaire obtient une remise en jeu ou un coup franc indirect selon le cas." },
        { title: "Gardien en possession", text: "Le gardien qui contrôle le ballon dans sa propre moitié ne peut le garder plus de 4 secondes. Sanction : coup franc indirect." },
        { title: "Passe en retour", text: "Le gardien ne peut pas toucher à la main un ballon qu'un partenaire lui a volontairement passé du pied ; il ne peut pas non plus reprendre le ballon dans sa moitié après l'avoir lâché, tant qu'un adversaire ne l'a pas touché ou qu'il n'a pas été joué par un partenaire dans la moitié adverse. Sanction : coup franc indirect. Cette règle impose de relancer vite et d'éviter la passe en retour inutile." }
      ]
    },
    {
      id: "debut",
      title: "Coup d'envoi, reprise de jeu, ballon en jeu / hors jeu",
      items: [
        { title: "Coup d'envoi", text: "Tiré du centre du terrain après un but ou au début de chaque période ; le ballon peut être joué dans n'importe quelle direction ; les adversaires restent à 3 m. But direct possible. Le ballon est en jeu dès qu'il est touché et bouge clairement." },
        { title: "Balle à terre", text: "Reprise de jeu quand les arbitres arrêtent le jeu sans sanction : le ballon est lâché à l'endroit où il se trouvait (si c'était dans la surface, au point de la ligne de surface le plus proche) ; il est en jeu dès qu'il touche le sol." },
        { title: "Ballon hors jeu", text: "Le ballon est hors jeu quand il a entièrement franchi la ligne de touche ou de but, au sol ou en l'air, ou quand le jeu est arrêté par l'arbitre. S'il touche le plafond d'une salle, la remise en jeu est une touche pour l'adversaire." },
        { title: "Ballon en jeu", text: "Le ballon est en jeu dans tous les autres cas, y compris quand il rebondit sur un poteau, la barre, un arbitre ou le plafond de façon régulière." }
      ]
    },
    {
      id: "but",
      title: "But marqué",
      items: [
        { title: "Quand y a-t-il but ?", text: "Un but est marqué quand le ballon a entièrement franchi la ligne de but entre les poteaux et sous la barre, sans faute préalable de l'équipe qui marque." },
        { title: "But direct ou non", text: "But direct possible sur coup franc direct, penalty, corner (contre l'adversaire) et coup d'envoi. Aucun but ne peut être marqué directement sur une touche au pied." }
      ]
    },
    {
      id: "fautes",
      title: "Fautes et coups francs directs",
      items: [
        { title: "Fautes sanctionnées d'un coup franc direct", text: "Donner ou tenter de donner un coup de pied, faire un croche-pied, sauter sur un adversaire, le charger, le frapper, le pousser, le tenir, cracher sur lui, le tacler avec un tacle glissé qui le met en danger, ou toucher volontairement le ballon de la main (sauf le gardien dans sa surface). Commises dans sa propre surface : penalty." },
        { title: "Tacle glissé", text: "Le tacle glissé est autorisé s'il touche le ballon sans mettre en danger l'adversaire ; il est interdit contre le gardien dans sa surface qui a le ballon. Un tacle glissé dangereux est sanctionné d'un coup franc direct, et d'un carton selon la gravité." },
        { title: "Coup franc indirect", text: "Sanctionne notamment : jeu dangereux, obstruction, empêcher le gardien de relancer, contestation ou sortie du terrain sans autorisation, remplacement irrégulier, et les fautes du gardien (plus de 4 secondes, passe en retour, reprise après relance). Le but ne peut pas être marqué directement." },
        { title: "Avantage", text: "Les arbitres laissent jouer si l'équipe qui a subi la faute est avantagée. La faute est tout de même comptée dans le cumul de fautes." }
      ]
    },
    {
      id: "disciplinaire",
      title: "Sanctions disciplinaires",
      items: [
        { title: "Carton jaune", text: "Avertissement pour : comportement antisportif, désapprobation, fautes répétées, retarder la reprise, non-respect de la distance, entrée ou sortie du terrain sans autorisation. Deux jaunes = expulsion." },
        { title: "Carton rouge", text: "Expulsion directe pour : faute grossière, conduite violente, cracher, empêcher un but ou une occasion de but manifeste par une faute (avec penalty éventuel), propos injurieux, second avertissement. Le joueur expulsé ne peut pas être remplacé tout de suite : l'équipe joue à 4 pendant 2 minutes ou jusqu'à ce que l'adversaire marque, puis un remplaçant peut entrer." },
        { title: "Carton bleu", text: "Utilisé uniquement dans certaines compétitions (exclusion temporaire de 2 minutes, par exemple) ; ce n'est pas un carton des Lois FIFA. Se référer au règlement de la compétition." },
        { title: "Personnes sur le banc", text: "Les joueurs remplaçants, entraîneurs et dirigeants peuvent aussi être avertis ou exclus ; l'équipe peut alors jouer sans remplaçant sur le banc." }
      ]
    },
    {
      id: "cumul",
      title: "Fautes cumulées",
      items: [
        { title: "Principe", text: "Chaque faute sanctionnée d'un coup franc direct est comptée à la table par équipe et par période. Les 5 premières n'ont pas de conséquence particulière." },
        { title: "6e faute et suivantes", text: "À partir de la 6e faute cumulée de l'équipe dans la période, tout coup franc direct est tiré du second point de réparation (10 m) sans mur ; le gardien défenseur doit rester derrière le ballon, à au moins 5 m ; le tireur doit viser le but (pas de passe). Si la faute est commise dans la moitié de terrain de l'équipe fautive, l'équipe qui subit la faute peut choisir de tirer du second point de réparation ou de l'endroit de la faute." },
        { title: "Conséquence tactique", text: "Compter les fautes : à 5 fautes, l'équipe doit défendre sans contact (interception, placement) ; l'équipe qui a subi 5 fautes peut déclencher le gardien-joueur ou chercher le contact dans la surface." }
      ]
    },
    {
      id: "coup-franc",
      title: "Coups francs",
      items: [
        { title: "Types", text: "Direct (but possible contre l'adversaire) ou indirect (le ballon doit toucher un autre joueur avant de pouvoir être marqué). Le ballon est immobile et le tireur ne le retouche pas avant qu'un autre joueur l'ait joué." },
        { title: "Distance et temps", text: "Adversaires à au moins 5 m du ballon (sauf dans leur propre but entre les poteaux sur la ligne). Le coup franc doit être exécuté dans les 4 secondes. Les adversaires peuvent former un mur." },
        { title: "Position", text: "Le coup franc est pris à l'endroit de la faute. Une faute sanctionnée d'un coup franc direct commise par un défenseur dans sa propre surface est sanctionnée d'un penalty." }
      ]
    },
    {
      id: "penalty",
      title: "Penalty et second point de réparation",
      items: [
        { title: "Penalty", text: "Tiré depuis le point de penalty à 6 m, contre le gardien seul sur sa ligne ; tous les autres joueurs restent derrière le ballon et hors de la surface jusqu'à la frappe ; le tireur est identifié ; le but est valable même si le ballon touche d'abord le poteau ou le gardien." },
        { title: "Second point à 10 m", text: "Utilisé pour les coups francs directs à partir de la 6e faute cumulée : sans mur, le gardien reste en retrait de 5 m au moins, le tireur frappe directement vers le but." }
      ]
    },
    {
      id: "remises",
      title: "Remises en jeu : touche, remise du gardien, corner",
      items: [
        { title: "Touche au pied", text: "Remise en jeu au pied, ballon immobile sur la ligne ou 25 cm à l'extérieur, adversaires à 5 m, 4 secondes. Aucun but ne peut être marqué directement depuis une touche." },
        { title: "Remise en jeu du gardien", text: "Faite à la main depuis la surface après que le ballon est sorti derrière la ligne de but par l'adversaire. Le ballon doit sortir de la surface avant d'être joué par un partenaire à l'intérieur. 4 secondes. Les adversaires restent hors de la surface." },
        { title: "Corner", text: "Tiré de l'arc de corner, adversaires à 5 m, 4 secondes. But direct possible. Il est accordé quand le ballon franchit la ligne de but après avoir été touché en dernier par un défenseur." },
        { title: "Touche et plafond", text: "Si le ballon touche le plafond, le jeu reprend par une touche pour l'adversaire de l'équipe qui a touché le ballon en dernier, à l'endroit le plus proche sur la ligne de touche." }
      ]
    },
    {
      id: "hors-jeu",
      title: "Pas de hors-jeu",
      items: [
        { title: "Règle", text: "Il n'y a pas de hors-jeu en futsal. Un attaquant peut donc se tenir près du but adverse ; le pivot s'appuie sur ce fait pour fixer la défense et créer des appels." }
      ]
    },
    {
      id: "gardien-joueur",
      title: "Gardien-joueur (power play)",
      items: [
        { title: "Définition", text: "Une équipe peut remplacer son gardien par un cinquième joueur de champ (supériorité 5 contre 4). Le gardien-joueur doit être identifié (maillot de gardien ou chasuble selon la compétition). Risque majeur : perte de balle suivie d'un tir dans le but vide." },
        { title: "Intérêt", text: "Créer la supériorité numérique pour : marquer en fin de match, désorganiser un bloc bas, jouer après la 5e faute adverse ou après un temps mort. Exige une organisation précise (voir Systèmes tactiques)." }
      ]
    }
  ];
})(typeof module === "object" && module.exports ? module.exports : (window.FutsalKB = window.FutsalKB || {}));
