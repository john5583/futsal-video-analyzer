/* Base de connaissances — Rôles et postes. */
(function (target) {
  target.ROLES = [
    {
      id: "gardien",
      name: "Gardien",
      aka: "Protège le but, premier relanceur",
      summary: "Dernier défenseur et premier relanceur. Dans le futsal moderne, il participe au jeu comme un joueur de champ.",
      attack: ["Relance à la main rapide (≤ 4 s) vers un partenaire démarqué", "Participe à la circulation (jeu au pied) pour créer la supériorité", "Lance les contre-attaques par une relance précise"],
      defense: ["Placement sur la ligne de tir, angle fermé", "Communication avec le défenseur central (couverture, marquage)", "Sorties sur les 1c1 et sur les balles dans le dos", "Parades de réflexe, plongeons, arrêts au pied"],
      qualities: ["Réflexes", "Jeu au pied", "Lecture du jeu", "Voix (communication)"],
      commonErrors: ["erreur_gardien", "sortie_gardien", "regle_4s", "relance_risquee"]
    },
    {
      id: "fixo",
      name: "Défenseur central",
      aka: "Dernier défenseur (appelé « fixo » en futsal)",
      summary: "Joueur le plus reculé, il dirige la défense et lance les attaques.",
      attack: ["Distribue le jeu, change l'aile", "Ouvre le jeu vers les ailiers, relance sur le pivot", "Monte en soutien quand le ballon est sécurisé"],
      defense: ["Protège l'axe central, contient le pivot adverse", "Organise le repli et la couverture", "Guide ses coéquipiers par la parole"],
      qualities: ["Lecture du jeu", "Passe précise", "Leadership", "Calme sous pression"],
      commonErrors: ["relance_risquee", "perte_zone_def", "espace_dos_fixo"]
    },
    {
      id: "ala",
      name: "Ailier",
      aka: "Joueur de couloir, gauche ou droit (appelé « ala » en futsal)",
      summary: "Joueur de couloir : il apporte la largeur, la vitesse et le travail aller-retour.",
      attack: ["Tient la largeur, étire la défense", "Dribble et centre ; passe-et-va avec le pivot", "Croise avec l'autre ailier (rotation)"],
      defense: ["Presse le porteur côté ballon, ferme les couloirs", "Repli rapide pour couvrir le défenseur central", "Double sur le pivot adverse"],
      qualities: ["Vitesse et endurance", "1c1 offensif et défensif", "Intelligence de placement"],
      commonErrors: ["largeur_mal_occupee", "repli_tardif", "absence_mouvement"]
    },
    {
      id: "pivot",
      name: "Pivot",
      aka: "Point d'appui offensif",
      summary: "Joueur le plus avancé, dos au but, il fixe la défense et distribue ou finit.",
      attack: ["Protège le ballon dos au but, remise pour l'ailier ou le défenseur central", "Pivote et frappe (pas de hors-jeu)", "Crée des écrans et des appels pour libérer ses coéquipiers"],
      defense: ["Pressing sur le défenseur central adverse à la perte", "Bloque la relance et empêche le jeu vers l'avant"],
      qualities: ["Jeu de dos", "Force physique", "Finition", "Relais technique"],
      commonErrors: ["pivot_isole", "attaque_statique", "occasion_manquee"]
    },
    {
      id: "universel",
      name: "Universel",
      aka: "Joueur polyvalent",
      summary: "Joue à plusieurs postes ; très utile dans les systèmes à rotation (4-0) et pour ajuster en cours de match.",
      attack: ["Alterne soutien et profondeur", "Comble les espaces et assure les permutations"],
      defense: ["Coupe les lignes de passe", "Couvre le poste défaillant"],
      qualities: ["Polyvalence", "Intelligence tactique", "Endurance"],
      commonErrors: ["absence_mouvement", "equipe_etiree"]
    },
    {
      id: "gardien-joueur",
      name: "Gardien-joueur",
      aka: "Gardien volant",
      summary: "Gardien ou joueur de champ qui entre à la place du gardien pour créer une supériorité.",
      attack: ["Relais arrière et changement d'aile", "Tir lointain quand l'angle est ouvert"],
      defense: ["Retour immédiat dans le but à la perte (si gardien) ou couverture", "Communication avec le joueur de sécurité"],
      qualities: ["Technique", "Décision rapide", "Sang-froid"],
      commonErrors: ["gj_perte_balle", "gj_timing", "gj_repli_non_assure"]
    }
  ];
})(typeof module === "object" && module.exports ? module.exports : (window.FutsalKB = window.FutsalKB || {}));
