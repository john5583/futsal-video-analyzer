/* Exercices du plan de jeu, suite 3 (voir seance.js) : écrans, mur en escalier, sortie sous pressing (avec ou sans gardien), feintes de frappe, avec leurs variantes.
   VARIANTES : familles d'exercices qui se remplacent l'un l'autre (le coach choisit la variante dans la séance : mur à deux ou en escalier, avec ou sans gardien, sur corner ou sur coup franc…) ;
   LABELS_VARIANTE : le nom court de chaque exercice dans sa famille. Animations : anim/scenarios-drills-plan4.js.
   Contenu rédigé à partir de pratiques courantes d'entraîneurs de futsal ; durées et critères = repères à adapter, efficacité non mesurée. */
(function (target) {
  const D = (id, name, goal, players, duration, description, criteria) => ({ id, name, goal, players, duration, description, criteria });
  const T = (o) => o;
  target.DRILLS_PLAN4 = [
    D("coup_franc_mur_escalier", "Défendre un coup franc : mur en escalier", "Défendre un coup franc avec un mur décalé de trois joueurs", "5 contre 3 + gardien", 12,
      "Trois joueurs forment un mur à 5 mètres, décalés en diagonale comme les marches d'un escalier : le plus proche du ballon ferme l'angle côté but, les deux autres sont décalés derrière lui. Le gardien se place du côté que le mur laisse ouvert et commande ; le mur ne saute pas.",
      ["Mur à 5 m, décalé en diagonale", "Le gardien couvre le côté ouvert", "Le mur ne saute pas ni ne tourne le dos", "Un joueur reste en couverture sur le receveur"]),
    D("coup_franc_ecran_tireur", "Coup franc avec écran devant le gardien", "Masquer la vue du gardien sur un coup franc", "4 joueurs contre 3 + gardien", 12,
      "Un joueur se place derrière le mur, entre le mur et le gardien adverse, sans bloquer celui-ci : il masque le départ de la frappe. Le tireur frappe au ras du sol ; un deuxième joueur attend le rebond. L'écran doit rester légal, sans obstruction.",
      ["Écran placé avant la frappe", "Sans obstruction du gardien ni d'un défenseur", "Frappe au ras du sol", "Un joueur pour le rebond"]),
    D("corner_ecran_second_poteau", "Corner avec écran sur le gardien et reprise au second poteau", "Marquer sur corner grâce à un écran", "4 joueurs + gardien contre 3 + gardien", 12,
      "Un joueur se place devant le gardien adverse pour lui masquer le centre, un autre arrive en retard au second poteau et reprend. Le tireur centre tendu, au ras du sol ou à mi-hauteur. Les deux joueurs doivent rester légaux, sans obstruer le gardien.",
      ["Écran avant le centre", "Reprise au second poteau en une touche", "Centre tendu", "Jeu légal : pas d'obstruction"]),
    D("rentree_ecran", "Rentrée de touche avec écran pour libérer le receveur", "Libérer un partenaire marqué sur la rentrée", "4 joueurs contre 2", 10,
      "Le receveur est marqué de près. Un partenaire se place entre lui et son défenseur en écran pendant que le receveur démarre dans l'espace libéré ; la rentrée est jouée dans les 4 secondes, puis le receveur enchaîne.",
      ["Écran avant la rentrée", "Le receveur démarre au bon moment", "Rentrée en moins de 4 s", "Enchaînement immédiat par une passe ou un tir"]),
    D("ecran_ailier_pivot", "Écran du pivot pour libérer l'ailier", "Libérer l'ailier marqué grâce à un écran du pivot", "3 + pivot contre 3", 12,
      "Le pivot se place sur la trajectoire du défenseur qui marque l'ailier, en écran, pendant que le porteur passe à l'ailier qui part dans l'espace libéré. Le pivot reste immobile pour que le contact reste légal ; l'ailier finit ou enchaîne.",
      ["Pivot immobile au moment du contact", "L'ailier part du côté de l'écran", "Passe tendue dans l'espace", "Tir ou passe en moins de 4 s"]),
    D("defense_contre_ecran", "Défendre contre un écran : annoncer et échanger", "Ne pas se faire piéger par un écran", "3 contre 3", 10,
      "Quand un attaquant place un écran, le défenseur masqué annonce « écran », son partenaire proche échange et prend le porteur pendant que le premier prend le joueur de l'écran. On travaille aussi le passage derrière l'écran quand l'espace le permet.",
      ["Annoncer « écran » à voix haute", "Échanger les adversaires", "Ne pas lâcher le porteur", "Aucune faute en contournant l'écran"]),
    D("sortie_pression_sans_gardien", "Sortir sous pressing sans le gardien", "Sortir du pressing avec les joueurs de champ seuls", "4 contre 2 (sans le gardien)", 12,
      "Le gardien ne participe pas à la relance : quatre joueurs sortent le ballon sous la pression de deux adversaires, en gardant toujours une solution de passe à côté du porteur et une plus profonde. On utilise la largeur du terrain et les remises à un touche.",
      ["Une solution à côté et une plus profonde", "Utiliser la largeur", "Remise en une touche", "Ligne médiane franchie en moins de 8 s"]),
    D("sortie_pression_gardien_securite", "Sortir sous pressing : le gardien comme solution de sécurité", "Relancer par le gardien quand la passe courte est fermée", "Gardien + 3 contre 2", 12,
      "Sous pression d'un attaquant, le défenseur ne force pas : il remet au gardien qui change d'aile en une passe vers le défenseur libre. On répète l'enchaînement retour au gardien, changement d'aile et passe vers l'avant.",
      ["Retour au gardien sans hésiter", "Changement d'aile en une passe", "Pas de perte devant son but", "Le gardien joue en deux touches au plus"]),
    D("sortie_pression_gj", "Sortir sous pressing avec le gardien-joueur", "Sortir du pressing à cinq avec le gardien monté", "5 contre 3", 12,
      "Le gardien-joueur est un joueur de champ supplémentaire dans la relance : cinq joueurs sortent le ballon sous la pression de trois adversaires, en cherchant toujours le joueur libre créé par le surnombre. Le gardien-joueur ne reste pas collé à la surface.",
      ["Le surnombre est utilisé", "Le gardien-joueur bouge", "Aucune perte devant son but", "Progression en moins de 8 s"]),
    D("feinte_frappe_passe", "Feinte de frappe puis passe", "Tromper le défenseur par une feinte et servir un partenaire", "3 contre 1 + gardien", 10,
      "Le porteur arme sa frappe pour attirer le défenseur qui se jette, puis passe à un partenaire démarqué qui finit. La feinte doit être crédible : jambe levée, regard vers le but. On alterne feinte et frappe pour que le défenseur ne sache pas.",
      ["Feinte crédible", "Passe juste après la feinte", "Le partenaire est déjà placé", "Finition en une touche"]),
    D("feinte_frappe_dribble", "Feinte de frappe puis dribble", "Éliminer un défenseur après une feinte de frappe", "1 contre 1 + gardien", 10,
      "Le porteur arme sa frappe, le défenseur s'avance ou se jette, le porteur contourne alors du côté libre et frappe de l'autre pied. On travaille le geste lent puis à vitesse de match.",
      ["Feinte crédible", "Contournement du côté libre", "Frappe de l'autre pied", "Moins de 3 secondes pour l'ensemble"]),
    D("feinte_frappe_1v1_gardien", "Feinte de frappe face au gardien", "Faire plonger le gardien avant de conclure", "1 contre 1 face au gardien", 8,
      "L'attaquant arrive face au gardien, arme sa frappe pour le faire plonger ou s'avancer, puis conclut du côté opposé en une touche. On compte les buts sur dix duels.",
      ["Armer la frappe sans tirer", "Attendre le mouvement du gardien", "Conclure du côté opposé", "Moins de trois secondes dans la surface"]),
    D("coup_franc_feinte_frappe", "Coup franc : feinte de frappe et partenaire qui tire", "Tromper le mur et le gardien sur un coup franc", "3 contre 3 + gardien", 12,
      "Le premier joueur court vers le ballon comme pour tirer, passe au-dessus ou le laisse, et son partenaire frappe au ras du sol. Le mur saute ou se détourne sur la feinte. Le coup franc doit être joué dans les 4 secondes.",
      ["Course crédible du premier joueur", "Le partenaire frappe au ras du sol", "Coup franc joué en moins de 4 s", "Un joueur pour le rebond"]),
    D("corner_feinte_frappe", "Corner : feinte du tireur et passe courte", "Surprendre les défenseurs sur un corner", "4 joueurs contre 3 + gardien", 12,
      "Un deuxième joueur s'approche du ballon comme pour centrer, passe par-dessus sans le toucher, et le tireur sert un partenaire démarqué qui frappe. Les défenseurs adverses sont attirés vers le coin.",
      ["Mouvement crédible de la feinte", "Passe courte vers le partenaire libre", "Frappe en une touche", "Corner joué en moins de 4 s"])
  ];

  /* Choix du plan : ge = gestes (écran, feinte), sp = sortie sous pressing (gardien, sans, gj), mu = type de mur (deux, escalier). cp = phase arrêtée ; cf = off ou def. */
  target.TAGS_PLAN4 = {
    coup_franc_mur_escalier: T({ cp: true, cf: ["def"], mu: ["escalier"], ins: ["cpa", "defense"], th: "défendre un coup franc avec un mur en escalier" }),
    coup_franc_ecran_tireur: T({ cp: true, cf: ["off"], ge: ["ecran"], ins: ["cpa"], th: "coup franc avec écran devant le gardien" }),
    corner_ecran_second_poteau: T({ cp: true, cf: ["off"], ge: ["ecran"], ins: ["cpa"], th: "corner avec écran sur le gardien" }),
    rentree_ecran: T({ cp: true, cf: ["off"], ge: ["ecran"], ins: ["cpa"], th: "rentrée avec écran pour libérer le receveur" }),
    ecran_ailier_pivot: T({ ge: ["ecran"], at: ["pivot", "court"], oc: ["triangles"], ins: ["attaque"], th: "écran du pivot pour libérer l'ailier" }),
    defense_contre_ecran: T({ ge: ["ecran"], dt: ["individuelle", "mixte"], ins: ["defense"], th: "défendre contre un écran" }),
    sortie_pression_sans_gardien: T({ sp: ["sans"], nl: true, tr: ["poser"], ins: ["sortie"], th: "sortir sous pressing sans le gardien" }),
    sortie_pression_gardien_securite: T({ sp: ["gardien"], so: ["court"], nl: true, tr: ["poser"], ins: ["sortie"], th: "sortir sous pressing en passant par le gardien" }),
    sortie_pression_gj: T({ gj: true, sp: ["gj"], sys: ["3-2", "1-2-2"], nl: true, tr: ["poser"], ins: ["sortie", "gj"], th: "sortir sous pressing avec le gardien-joueur" }),
    feinte_frappe_passe: T({ ge: ["feinte"], fi: ["collectif"], at: ["court"], ins: ["attaque", "finition"], th: "feinte de frappe puis passe" }),
    feinte_frappe_dribble: T({ ge: ["feinte"], fi: ["duel"], ins: ["attaque", "finition"], th: "feinte de frappe puis dribble" }),
    feinte_frappe_1v1_gardien: T({ ge: ["feinte"], fi: ["duel"], ins: ["finition"], th: "feinte de frappe face au gardien" }),
    coup_franc_feinte_frappe: T({ cp: true, cf: ["off"], ge: ["feinte"], ins: ["cpa"], th: "coup franc avec feinte de frappe" }),
    corner_feinte_frappe: T({ cp: true, cf: ["off"], ge: ["feinte"], ins: ["cpa"], th: "corner avec feinte du tireur" })
  };

  /* Étiquettes ajoutées à des exercices existants (même sens que ci-dessus). */
  target.TAGS_PLUS4 = {
    coup_franc_defense_mur: { mu: ["deux"] },
    quatre_zero_ecran_tir: { ge: ["ecran"] },
    gj_tir_ecran: { ge: ["ecran"] },
    sortie_pression_haute: { sp: ["gardien"] },
    relance_pression: { sp: ["gardien"] },
    gj_construction_3_2: { sp: ["gj"] }
  };

  /* Familles d'exercices : le coach peut passer de l'un à l'autre dans la séance ; un exercice peut être dans plusieurs familles. */
  target.VARIANTES = [
    ["coup_franc_defense_mur", "coup_franc_mur_escalier", "sixieme_faute_gardien"],
    ["sortie_pression_haute", "sortie_pression_gardien_securite", "sortie_pression_sans_gardien", "sortie_pression_gj"],
    ["quatre_zero_ecran_tir", "ecran_ailier_pivot", "coup_franc_ecran_tireur", "corner_ecran_second_poteau", "rentree_ecran", "gj_tir_ecran"],
    ["feinte_frappe_passe", "feinte_frappe_dribble", "feinte_frappe_1v1_gardien", "coup_franc_feinte_frappe", "corner_feinte_frappe"],
    ["corner_court_triangle", "corner_second_poteau", "corner_tir_enchaine", "corner_deux_schemas", "corner_ecran_second_poteau", "corner_feinte_frappe"],
    ["corner_defense_zone", "corner_defense_individuelle"],
    ["rentree_pivot_remise", "rentree_une_deux", "rentree_ecran", "rentree_sous_4s_decompte"],
    ["coup_franc_direct_mur", "coup_franc_combinaison", "coup_franc_lateral_centre", "coup_franc_ecran_tireur", "coup_franc_feinte_frappe"],
    ["pressing_haut_4v4", "pressing_homme_haut", "pressing_zone", "piege_ligne_touche"],
    ["bloc_bas_4v4", "bloc_median_zones"]
  ];
  target.LABELS_VARIANTE = {
    coup_franc_defense_mur: "Mur à deux", coup_franc_mur_escalier: "Mur en escalier", sixieme_faute_gardien: "Sans mur : le gardien seul",
    sortie_pression_haute: "Avec le gardien, changer d'aile", sortie_pression_gardien_securite: "Gardien en solution de sécurité", sortie_pression_sans_gardien: "Sans le gardien", sortie_pression_gj: "Avec le gardien-joueur",
    quatre_zero_ecran_tir: "Écran en jeu (4-0)", ecran_ailier_pivot: "Écran du pivot pour l'ailier", coup_franc_ecran_tireur: "Écran sur coup franc", corner_ecran_second_poteau: "Écran sur corner", rentree_ecran: "Écran sur rentrée", gj_tir_ecran: "Écran avec gardien-joueur",
    feinte_frappe_passe: "Feinte puis passe", feinte_frappe_dribble: "Feinte puis dribble", feinte_frappe_1v1_gardien: "Feinte face au gardien", coup_franc_feinte_frappe: "Feinte sur coup franc", corner_feinte_frappe: "Feinte sur corner",
    corner_court_triangle: "Joué court", corner_second_poteau: "Centre au second poteau", corner_tir_enchaine: "Frappe immédiate", corner_deux_schemas: "Deux schémas",
    corner_defense_zone: "En zone", corner_defense_individuelle: "En individuelle",
    rentree_pivot_remise: "Vers le pivot", rentree_une_deux: "En une-deux", rentree_sous_4s_decompte: "Sous le compte des 4 s",
    coup_franc_direct_mur: "Tir direct", coup_franc_combinaison: "Combinaison", coup_franc_lateral_centre: "Latéral et centre",
    pressing_haut_4v4: "Sur un déclencheur", pressing_homme_haut: "Homme à homme", pressing_zone: "En zone", piege_ligne_touche: "Piège de la ligne de touche",
    bloc_bas_4v4: "Bloc bas", bloc_median_zones: "Bloc médian"
  };
})(typeof module === "object" && module.exports ? module.exports : (window.FutsalKB = window.FutsalKB || {}));
