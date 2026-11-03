/* Séance d'entraînement proposée d'après LE JEU QUE L'ENTRAÎNEUR VEUT JOUER (son plan tactique : système, hauteur de défense, compacité, pressing, pertes en zone défensive,
   gardien-joueur). Ajoute dix exercices à la bibliothèque (chacun a son animation : anim/scenarios-drills-plan.js), rattache chaque exercice aux choix du plan,
   puis compose une séance : échauffement, thèmes liés au plan, finition. Chaque exercice proposé dit POURQUOI (le choix du plan qui le justifie).
   Ce que cette base ne fait PAS (dit franchement) : elle ne mesure pas l'efficacité des exercices ; les durées et les critères sont des repères d'entraîneur, à adapter. */
(function (target) {
  const base = typeof module === "object" && module.exports ? require("./drills.js").DRILLS : target.DRILLS;
  const planBase = typeof module === "object" && module.exports ? require("./plan.js") : target;
  const plan2 = typeof module === "object" && module.exports ? require("./seance-drills.js").DRILLS_PLAN2 : target.DRILLS_PLAN2;
  const D = (id, name, goal, players, duration, description, criteria) => ({ id, name, goal, players, duration, description, criteria });

  const NOUVEAUX = [
    D("pressing_haut_4v4", "Pressing haut : déclencheur et fermeture", "Récupérer le ballon haut sur un déclencheur", "4 contre 4 + gardiens", 15,
      "Quatre joueurs pressent dans la moitié adverse. Le déclencheur est une passe en retrait ou un mauvais contrôle : le plus proche presse le porteur, les autres ferment les lignes de passe et se rapprochent. Si le ballon est récupéré en moins de 6 s, tir immédiat.",
      ["Presser seulement sur un déclencheur", "Fermer l'axe avant les côtés", "Ne jamais presser seul", "Récupération et tir en moins de 6 s"]),
    D("bloc_bas_4v4", "Bloc bas : fermer l'axe et protéger la zone de tir", "Défendre bas sans ouvrir l'axe", "4 contre 4 + gardien", 15,
      "Quatre défenseurs en bloc bas devant leur but contre quatre attaquants. Le bloc glisse vers le ballon sans ouvrir l'axe ; le plus proche ferme l'angle de tir. À la récupération, sortie rapide vers l'avant.",
      ["Axe toujours fermé", "Distances courtes entre les joueurs", "Aucun tir dans l'axe", "Sortie rapide à la récupération"]),
    D("compacite_9m", "Compacité : bloc de 9 mètres", "Garder le bloc serré quand l'adversaire a le ballon", "4 contre 3", 12,
      "Quatre joueurs gardent leurs distances pendant que l'adversaire fait circuler le ballon : à chaque passe tout le bloc glisse, l'écart entre le joueur le plus haut et le plus bas ne dépasse pas 9 m (13 m en compacité normale). Un entraîneur mesure l'écart à chaque arrêt.",
      ["Écart ≤ 9 m (ou 13 m)", "Tout le bloc se déplace ensemble", "Pas de joueur isolé"]),
    D("sortie_3_1_pivot", "Sortie de balle en 3-1 : trouver le pivot", "Sortir proprement par le pivot", "GB + 3 + pivot contre 2 pressants", 15,
      "Gardien et trois défenseurs sortent le ballon contre deux attaquants qui pressent ; le pivot reste devant, appelle, reçoit dos au but et remet à un partenaire lancé. Au moins une sortie sur trois passe par le pivot.",
      ["Sortie par le côté libre", "Pivot protège le ballon avec le corps", "Remise en une touche", "Ligne médiane franchie en moins de 8 s"]),
    D("losange_triangles", "Losange 1-2-1 : triangles et lignes de passes", "Garder le losange en circulant", "4 contre 2", 15,
      "Quatre joueurs en losange dans une zone de 20 m, deux défenseurs au milieu. Chaque passe est suivie d'un déplacement : on prend la place laissée libre pour que le losange ne s'aplatisse jamais.",
      ["Deux solutions de passe en triangle", "Une ou deux touches", "Passe et suis", "Le losange garde sa forme"]),
    D("carre_diagonales", "Carré 2-2 : diagonales et changements d'axe", "Étirer les deux défenseurs avec des diagonales", "4 contre 2", 12,
      "Quatre joueurs aux coins d'un carré de 8 m, deux défenseurs au centre. Passes en diagonale puis changement d'axe : le carré tourne pour étirer la défense. Aucun défenseur ne peut suivre deux diagonales de suite.",
      ["Aucune passe dans l'axe sous pression", "Changement d'axe en moins de 2 passes", "Deux touches maximum"]),
    D("gj_perte_retour", "Gardien-joueur : perte de balle et retour au but", "Ne pas se faire piéger par le but vide", "5 contre 4 (gardien monté)", 12,
      "Cinq contre quatre avec le gardien monté. À la perte, le but est vide : le gardien-joueur sprinte vers son but pendant que le plus proche retarde le porteur. On répète jusqu'à ce que le retour soit automatique.",
      ["Retour au but en moins de 4 s", "Le plus proche ralentit le tir", "Ne monter que ballon sous contrôle"]),
    D("zero_perte_zone_def", "Zéro perte dans sa zone : toujours une solution de sécurité", "Ne jamais perdre le ballon devant son but", "GB + 4 contre 2", 12,
      "Le gardien et quatre joueurs sortent le ballon sous la pression de deux attaquants dans leur zone défensive. Avant de recevoir, chacun repère sa solution de sécurité ; en cas de doute, retour au gardien ou jeu long côté libre. Une perte dans la zone arrête l'exercice.",
      ["Solution de sécurité avant la passe", "Aucune perte dans la zone", "Retour au gardien autorisé", "Changement d'aile après le retour"]),
    D("pressing_relance_gardien", "Presser la relance du gardien adverse", "Forcer l'erreur sur la relance", "3 + pivot contre GB + 2", 12,
      "Le gardien adverse relance à la main ; trois joueurs pressent dans sa moitié : le premier ferme la passe dans l'axe, les deux autres couvrent l'aile, la relance est forcée vers un côté où elle est perdue.",
      ["Fermer la passe de sécurité d'abord", "Presser en cascade, pas ensemble", "Récupération en moins de 5 s"]),
    D("transition_def_3s", "Transition défensive : les 3 premières secondes", "Se replacer après une perte", "4 + gardien contre 3", 12,
      "À la perte du ballon, l'équipe a trois secondes pour se replacer devant son but : le plus proche retarde le porteur sans se faire éliminer, les autres reviennent vers l'axe et ferment les lignes de passe.",
      ["Porteur ralenti dès la première seconde", "Deux défenseurs dans l'axe avant la 3e seconde", "Pas de faute"])
  ];
  target.DRILLS = base.concat(NOUVEAUX.concat(plan2).filter((n) => !base.some((b) => b.id === n.id)));

  /* Rattachement des exercices aux choix du plan.
     Plan tactique : sys = systèmes, def = hauteurs de défense, cmp = compacités, pr = pressing, nl = pas de perte en zone, gj = gardien-joueur.
     Choix d'entraînement : dt = type de défense, at = manière d'attaquer, so = sortie de balle du gardien, cp = coups de pied arrêtés, ins = thèmes d'insistance.
     role = place dans la séance (ech = échauffement, fin = finition), th = thème en clair (sert d'explication). */
  const T = (o) => o;
  target.SEANCE_TAGS = {
    rondo_4v2: T({ role: "ech", pr: true, nl: true, th: "conserver le ballon sous pression" }),
    passe_et_va: T({ role: "ech", at: ["court"], th: "jeu court et mouvement après la passe" }),
    regle_4s: T({ role: "ech", th: "rythme de jeu et règle des 4 secondes" }),
    activation_ballon_pieds: T({ role: "ech", th: "échauffement des appuis et du jeu court" }),
    contre_pressing_5s: T({ pr: true, ins: ["transitions", "defense"], th: "récupérer le ballon tout de suite après une perte" }),
    pressing_zone: T({ def: ["haut"], pr: true, dt: ["zone", "mixte"], ins: ["defense"], th: "pressing coordonné" }),
    pressing_haut_4v4: T({ def: ["haut"], pr: true, dt: ["individuelle", "mixte"], ins: ["defense"], th: "pressing haut sur un déclencheur" }),
    pressing_relance_gardien: T({ def: ["haut"], pr: true, ins: ["defense"], th: "presser la relance du gardien adverse" }),
    bloc_median_zones: T({ def: ["median"], dt: ["individuelle", "mixte"], ins: ["defense"], th: "défendre en bloc médian" }),
    bloc_bas_4v4: T({ def: ["bas"], cmp: ["serree"], dt: ["zone"], ins: ["defense"], th: "défendre bas sans ouvrir l'axe" }),
    compacite_9m: T({ cmp: ["serree", "normale"], def: ["bas", "median"], dt: ["zone"], ins: ["defense"], th: "garder le bloc compact" }),
    marquage_individuel_4v4: T({ dt: ["individuelle"], ins: ["defense"], th: "défendre homme à homme" }),
    zone_4v4_glissement: T({ dt: ["zone"], cmp: ["serree", "normale"], ins: ["defense"], th: "défendre en zone et glisser" }),
    defense_mixte_2_zones: T({ dt: ["mixte"], ins: ["defense"], th: "alterner individuelle et zone" }),
    defense_losange_aide: T({ sys: ["1-2-1"], dt: ["zone", "mixte"], ins: ["defense"], th: "défendre en losange" }),
    aide_permutation: T({ dt: ["individuelle", "mixte"], ins: ["defense"], th: "aide et permutation" }),
    fermer_lignes_passe_3v4: T({ dt: ["zone"], def: ["bas", "median"], ins: ["defense"], th: "gagner du temps en infériorité" }),
    repli_3v2: T({ def: ["median", "bas"], ins: ["defense", "transitions"], th: "se replacer vite devant son but" }),
    duel_1v1_def: T({ def: ["median", "bas"], dt: ["individuelle"], ins: ["defense"], th: "défendre en 1 contre 1" }),
    duel_propre: T({ def: ["median", "bas", "haut"], dt: ["individuelle"], th: "défendre sans faute" }),
    transition_def_3s: T({ pr: true, nl: true, ins: ["transitions", "defense"], th: "se replacer dans les 3 premières secondes" }),
    transition_att_def_att: T({ ins: ["transitions"], th: "enchaîner les transitions" }),
    relance_pression: T({ nl: true, so: ["court"], th: "sortir le ballon sous pression" }),
    gardien_jeu_pied: T({ nl: true, so: ["court", "long"], th: "relance et jeu au pied du gardien" }),
    gardien_main_relance_ailier: T({ so: ["court"], nl: true, th: "relance courte à la main" }),
    gardien_long_pivot: T({ so: ["long"], at: ["direct", "pivot"], th: "relance longue vers le pivot" }),
    sortie_pression_haute: T({ so: ["court"], nl: true, th: "sortir sous pressing haut" }),
    zero_perte_zone_def: T({ nl: true, th: "ne jamais perdre le ballon devant son but" }),
    pivot_appui: T({ sys: ["3-1"], at: ["pivot"], th: "jeu de pivot" }),
    sortie_3_1_pivot: T({ sys: ["3-1"], nl: true, at: ["pivot"], so: ["court"], th: "sortie de balle par le pivot" }),
    trois_un_combinaison: T({ sys: ["3-1"], at: ["pivot", "court"], ins: ["attaque"], th: "combinaison autour du pivot" }),
    pivot_remise_tir: T({ at: ["pivot"], ins: ["attaque"], th: "jouer dos au but" }),
    losange_triangles: T({ sys: ["1-2-1"], at: ["court"], th: "triangles et losange" }),
    carre_diagonales: T({ sys: ["2-2"], at: ["court", "rotations"], th: "diagonales et changements d'axe du carré" }),
    rotation_4_0: T({ sys: ["4-0"], at: ["rotations"], ins: ["attaque"], th: "circulation et rotations sans pivot fixe" }),
    quatre_zero_fixation_appel: T({ sys: ["4-0"], at: ["rotations"], ins: ["attaque"], th: "fixer puis appeler dans le dos" }),
    jeu_de_position: T({ sys: ["1-2-1", "2-2", "4-0"], at: ["rotations", "court"], th: "largeur et profondeur" }),
    largeur_profondeur: T({ sys: ["2-2", "1-2-1", "4-0"], at: ["rotations", "court"], ins: ["attaque"], th: "étirer la défense" }),
    jeu_direct_long: T({ at: ["direct"], so: ["long"], ins: ["attaque", "transitions"], th: "jouer vite vers l'avant" }),
    parede_triangle: T({ at: ["court"], ins: ["attaque"], th: "une-deux en triangle" }),
    contre_attaque_2v1_3v2: T({ at: ["direct"], pr: true, ins: ["transitions", "attaque"], th: "contre-attaque rapide" }),
    superiorite_2v1: T({ at: ["court", "direct"], ins: ["attaque"], th: "créer et finir une supériorité" }),
    finition_1v1_gardien: T({ role: "fin", ins: ["attaque"], th: "conclure face au gardien" }),
    gj_5v4: T({ gj: true, sys: ["3-2", "1-2-2"], ins: ["attaque"], th: "supériorité avec le gardien-joueur" }),
    gj_perte_retour: T({ gj: true, sys: ["3-2", "1-2-2"], th: "retour au but après une perte avec le gardien monté" }),
    gj_construction_3_2: T({ gj: true, sys: ["3-2", "1-2-2"], ins: ["attaque"], th: "construire à 5 contre 4" }),
    def_5v4: T({ th: "défendre contre un gardien-joueur adverse" }),
    def_gj_pressing_5v4: T({ th: "défendre contre un gardien-joueur adverse et en profiter" }),
    transition_off: T({ role: "fin", pr: true, at: ["direct"], ins: ["transitions", "attaque"], th: "contre-attaque après récupération" }),
    finition_cadence: T({ role: "fin", ins: ["attaque"], th: "finition sous pression de temps" }),
    jeu_reduit_3v3_gb: T({ role: "fin", th: "appliquer les thèmes en jeu réduit" }),
    match_conditionne_theme: T({ role: "fin", th: "faire vivre le thème en match conditionné" }),
    marquage_cpa: T({ cp: true, ins: ["cpa", "defense"], th: "défendre les coups de pied arrêtés" }),
    cpa_off: T({ cp: true, ins: ["cpa"], th: "coups de pied arrêtés offensifs" }),
    corner_deux_schemas: T({ cp: true, ins: ["cpa"], th: "corner : deux schémas" }),
    rentree_touche_4s: T({ cp: true, ins: ["cpa"], th: "rentrée de touche dans les 4 secondes" }),
    kick_in_haut_milieu_bas: T({ cp: true, ins: ["cpa", "defense"], th: "défendre une rentrée" })
  };

  /* Choix d'entraînement : ils ne concernent pas la vérification du match (le programme ne sait pas les voir sur une vidéo), seulement le choix des exercices. */
  target.TRAINING_QUESTIONS = [
    { id: "defType", label: "Comment veux-tu défendre ?", help: "La manière d'organiser les marquages (indépendante de la hauteur du bloc).",
      options: [{ id: "individuelle", label: "Individuelle", desc: "chaque joueur a un adversaire" }, { id: "zone", label: "En zone", desc: "chaque joueur couvre un espace et le bloc glisse" }, { id: "mixte", label: "Mixte", desc: "individuelle dans la moitié adverse, en zone chez soi" }, { id: "libre", label: "Pas de consigne" }] },
    { id: "attaque", label: "Comment veux-tu attaquer ?", help: "Le style de jeu offensif à travailler.",
      options: [{ id: "pivot", label: "Par le pivot", desc: "jeu dos au but, remises" }, { id: "rotations", label: "Rotations", desc: "circulation sans poste fixe (4-0)" }, { id: "direct", label: "Jeu direct", desc: "passes longues, contre-attaques" }, { id: "court", label: "Jeu court", desc: "triangles, une-deux, combinaisons" }, { id: "libre", label: "Pas de consigne" }] },
    { id: "sortie", label: "Comment veux-tu sortir le ballon depuis le gardien ?", help: "La relance du gardien (le programme ne sait pas la vérifier sur la vidéo).",
      options: [{ id: "court", label: "Courte", desc: "à la main au sol, vers un défenseur ou un ailier" }, { id: "long", label: "Longue", desc: "vers le pivot ou en profondeur" }, { id: "libre", label: "Pas de consigne" }] },
    { id: "cpa", label: "Veux-tu travailler les coups de pied arrêtés ?", help: "Corners, rentrées de touche, coups francs : règle des 4 secondes.",
      options: [{ id: "oui", label: "Oui" }, { id: "non", label: "Non cette fois" }] },
    { id: "insister", label: "Sur quoi veux-tu insister cette semaine ?", help: "Donne plus de place à ce thème dans la séance.",
      options: [{ id: "defense", label: "La défense" }, { id: "attaque", label: "L'attaque" }, { id: "transitions", label: "Les transitions" }, { id: "cpa", label: "Les coups de pied arrêtés" }, { id: "sortie", label: "La sortie de balle" }, { id: "finition", label: "La finition" }, { id: "gj", label: "Le gardien-joueur (5 contre 4)" }, { id: "equilibre", label: "Équilibré" }] }
  ];
  /* Choix supplémentaires : k = clé de l'étiquette sur l'exercice, lab = ce que le choix veut dire (sert à expliquer POURQUOI l'exercice est proposé). */
  const EXTRA = [
    { q: "transition", k: "tr", lab: { contre: "contre-attaquer dès la récupération", poser: "poser le jeu après la récupération" } },
    { q: "pressDecl", k: "pd", lab: { relance: "presser la relance du gardien adverse", retrait: "presser sur une passe en retrait ou un mauvais contrôle", perte: "presser tout de suite après une perte de balle" } },
    { q: "occupation", k: "oc", lab: { large: "attaquer en largeur et en profondeur", triangles: "attaquer par l'axe, en triangles et en une-deux" } },
    { q: "finition", k: "fi", lab: { duel: "finir en duel face au gardien", collectif: "finir après une combinaison collective", vite: "finir vite, sous pression de temps" } },
    { q: "cpaFocus", k: "cf", lab: { off: "travailler tes coups de pied arrêtés offensifs", def: "travailler la défense des coups de pied arrêtés" } }
  ];
  target.TRAINING_EXTRA = EXTRA;
  target.TRAINING_QUESTIONS = target.TRAINING_QUESTIONS.concat([
    { id: "transition", label: "Quand tu récupères le ballon, que veux-tu faire ?", help: "La réaction juste après une récupération (le programme ne sait pas la vérifier sur la vidéo).",
      options: [{ id: "contre", label: "Contre-attaquer tout de suite", desc: "jouer vite vers l'avant avant que l'adversaire se replace" }, { id: "poser", label: "Poser le jeu", desc: "garder le ballon, ressortir proprement, construire" }, { id: "libre", label: "Pas de consigne" }] },
    { id: "pressDecl", label: "Quand veux-tu déclencher ton pressing ?", help: "Le signal qui lance le pressing de toute l'équipe.",
      options: [{ id: "relance", label: "Sur la relance du gardien adverse", desc: "on ferme les passes et on force l'erreur" }, { id: "retrait", label: "Sur une passe en retrait ou un mauvais contrôle", desc: "on saute dès que l'adversaire hésite" }, { id: "perte", label: "Juste après une perte de balle", desc: "contre-pressing immédiat" }, { id: "libre", label: "Pas de consigne" }] },
    { id: "occupation", label: "Comment veux-tu occuper le terrain en attaque ?", help: "La forme de ton jeu offensif.",
      options: [{ id: "large", label: "En largeur et en profondeur", desc: "étirer la défense, changer d'axe" }, { id: "triangles", label: "Par l'axe, en triangles", desc: "jeu court, une-deux, combinaisons proches" }, { id: "libre", label: "Pas de consigne" }] },
    { id: "finition", label: "Comment veux-tu finir tes actions ?", help: "Le geste final que tu veux travailler.",
      options: [{ id: "duel", label: "En duel face au gardien", desc: "1 contre 1, sang-froid" }, { id: "collectif", label: "Après une combinaison", desc: "supériorité, remise, tir" }, { id: "vite", label: "Vite, sous pression de temps", desc: "conclure en quelques secondes" }, { id: "libre", label: "Pas de consigne" }] },
    { id: "cpaFocus", label: "Quels coups de pied arrêtés veux-tu travailler ?", help: "Compte seulement si tu as répondu « Oui » à la question sur les coups de pied arrêtés.",
      options: [{ id: "off", label: "Les nôtres (attaque)", desc: "corners, rentrées de touche à nous" }, { id: "def", label: "Ceux de l'adversaire (défense)", desc: "organiser la défense" }, { id: "libre", label: "Les deux" }] }
  ]);
  target.trainingDefaults = () => ({ defType: "libre", attaque: "libre", sortie: "libre", cpa: "non", insister: "equilibre", transition: "libre", pressDecl: "libre", occupation: "libre", finition: "libre", cpaFocus: "libre" });

  /* Rattachement des exercices existants aux choix supplémentaires (aucun exercice n'est ajouté : seulement des étiquettes). */
  const PLUS = {
    contre_pressing_5s: { tr: ["contre"], pd: ["perte"] }, contre_attaque_2v1_3v2: { tr: ["contre"], fi: ["vite", "collectif"] }, transition_off: { tr: ["contre"], fi: ["vite"] }, jeu_direct_long: { tr: ["contre"] },
    superiorite_2v1: { tr: ["contre"], fi: ["collectif"] }, transition_att_def_att: { tr: ["contre"], pd: ["perte"] }, transition_def_3s: { pd: ["perte"] }, repli_3v2: { pd: ["perte"] },
    rondo_4v2: { tr: ["poser"] }, relance_pression: { tr: ["poser"] }, zero_perte_zone_def: { tr: ["poser"] }, gardien_jeu_pied: { tr: ["poser"] }, gardien_main_relance_ailier: { tr: ["poser"] },
    jeu_de_position: { tr: ["poser"], oc: ["large"] }, largeur_profondeur: { tr: ["poser"], oc: ["large"] }, carre_diagonales: { oc: ["large"] }, rotation_4_0: { tr: ["poser"], oc: ["large"] }, quatre_zero_fixation_appel: { oc: ["large"] },
    losange_triangles: { tr: ["poser"], oc: ["triangles"] }, parede_triangle: { oc: ["triangles"] }, trois_un_combinaison: { oc: ["triangles"], fi: ["collectif"] }, passe_et_va: { oc: ["triangles"] }, pivot_remise_tir: { oc: ["triangles"], fi: ["collectif"] }, pivot_appui: { oc: ["triangles"] },
    pressing_relance_gardien: { pd: ["relance"] }, pressing_haut_4v4: { pd: ["retrait"] }, pressing_zone: { pd: ["retrait", "relance"] },
    finition_1v1_gardien: { fi: ["duel"] }, finition_cadence: { fi: ["vite"] }, jeu_reduit_3v3_gb: { fi: ["collectif"] }, match_conditionne_theme: { fi: ["collectif"] },
    cpa_off: { cf: ["off"] }, corner_deux_schemas: { cf: ["off"] }, rentree_touche_4s: { cf: ["off"] }, marquage_cpa: { cf: ["def"] }, kick_in_haut_milieu_bas: { cf: ["def"] }
  };
  const INS_PLUS = {
    sortie: ["relance_pression", "gardien_jeu_pied", "gardien_main_relance_ailier", "gardien_long_pivot", "sortie_pression_haute", "sortie_3_1_pivot", "zero_perte_zone_def", "pressing_relance_gardien"],
    finition: ["finition_1v1_gardien", "finition_cadence", "superiorite_2v1", "pivot_remise_tir", "transition_off", "contre_attaque_2v1_3v2", "jeu_reduit_3v3_gb", "trois_un_combinaison"],
    gj: ["gj_5v4", "gj_perte_retour", "gj_construction_3_2", "def_5v4", "def_gj_pressing_5v4"]
  };
  Object.keys(INS_PLUS).forEach((k) => INS_PLUS[k].forEach((id) => { if (!target.SEANCE_TAGS[id]) throw new Error("exercice inconnu : " + id); const t = target.SEANCE_TAGS[id]; t.ins = (t.ins || []).concat(k); }));
  Object.keys(PLUS).forEach((id) => { if (!target.SEANCE_TAGS[id]) throw new Error("exercice inconnu : " + id); Object.assign(target.SEANCE_TAGS[id], PLUS[id]); });

  const DEF_LABEL = { haut: "défendre haut (pressing haut)", median: "défendre au milieu du terrain", bas: "défendre bas (bloc bas)" };
  const CMP_LABEL = { serree: "un bloc serré (9 m au plus)", normale: "un bloc de 13 m au plus" };
  const DT_LABEL = { individuelle: "défendre en individuelle", zone: "défendre en zone", mixte: "défendre en mixte (individuelle haut, zone chez soi)" };
  const AT_LABEL = { pivot: "attaquer par le pivot", rotations: "attaquer en rotations", direct: "jouer en direct", court: "jouer court" };
  const SO_LABEL = { court: "sortir court depuis le gardien", long: "sortir long depuis le gardien" };

  /* plan : choix du plan tactique (voir PLAN_QUESTIONS) ; opts : { duree : minutes de séance (30 à 120, 75 par défaut), training : choix d'entraînement (voir TRAINING_QUESTIONS) }.
     Rend { duree, total, resume, blocs : [{ ordre, phase, drill, minutes, pourquoi : [phrases] }], sansExercice : [choix pour lesquels aucun exercice n'existe] }. */
  target.proposerSeance = function (plan, opts) {
    const duree = Math.max(30, Math.min(120, Math.round((opts && opts.duree) || 75)));
    const p = Object.assign({}, planBase.planDefaults((plan && plan.system) || "3-1"), plan || {});
    const tr = Object.assign(target.trainingDefaults(), (opts && opts.training) || {});
    const tags = target.SEANCE_TAGS, drills = target.DRILLS, focus = (opts && opts.focus) || 2;
    const evaluer = (d) => {
      const t = tags[d.id] || {}, why = [], dims = []; let pts = 0;
      if (t.gj && p.flyingGK === "jamais") return { pts: -1, why, dims };
      if (t.cp && tr.cpa !== "oui") return { pts: -1, why, dims };          // les coups de pied arrêtés ne sont proposés que si l'entraîneur les veut
      if (t.sys && t.sys.indexOf(p.system) >= 0) { pts += 4; dims.push("sys"); why.push("ton système est le " + p.system + " : " + t.th); }
      if (t.def && t.def.indexOf(p.defense) >= 0 && DEF_LABEL[p.defense]) { pts += t.def.length < 3 ? 4 : 1; if (t.def.length < 3) dims.push("def"); why.push("tu veux " + DEF_LABEL[p.defense] + " : " + t.th); }
      if (t.cmp && t.cmp.indexOf(p.compact) >= 0 && CMP_LABEL[p.compact]) { pts += 3; dims.push("cmp"); why.push("tu veux " + CMP_LABEL[p.compact] + " : " + t.th); }
      if (t.pr && p.pressing === "oui") { pts += 3; dims.push("pr"); why.push("tu veux un pressing immédiat après une perte : " + t.th); }
      if (t.nl && p.noLossOwnZone === "oui") { pts += 3; dims.push("nl"); why.push("tu veux interdire les pertes dans ta zone : " + t.th); }
      if (t.gj && p.flyingGK !== "jamais") { pts += 4; dims.push("gj"); why.push("tu utilises le gardien-joueur : " + t.th); }
      if (t.dt && t.dt.indexOf(tr.defType) >= 0 && DT_LABEL[tr.defType]) { pts += 4; dims.push("dt"); why.push("tu veux " + DT_LABEL[tr.defType] + " : " + t.th); }
      if (t.at && t.at.indexOf(tr.attaque) >= 0 && AT_LABEL[tr.attaque]) { pts += 4; dims.push("at"); why.push("tu veux " + AT_LABEL[tr.attaque] + " : " + t.th); }
      if (t.so && t.so.indexOf(tr.sortie) >= 0 && SO_LABEL[tr.sortie]) { pts += 4; dims.push("so"); why.push("tu veux " + SO_LABEL[tr.sortie] + " : " + t.th); }
      EXTRA.forEach((e) => { const v = tr[e.q]; if (t[e.k] && t[e.k].indexOf(v) >= 0 && e.lab[v] && (e.q !== "cpaFocus" || tr.cpa === "oui")) { pts += 4; dims.push(e.k); why.push("tu veux " + e.lab[v] + " : " + t.th); } });
      if (t.cp && tr.cpa === "oui") { pts += 3; why.push("tu veux travailler les coups de pied arrêtés : " + t.th); }
      if (t.ins && t.ins.indexOf(tr.insister) >= 0) { pts += focus; if (focus > 2) dims.push("ins"); why.push("tu insistes sur ce thème cette semaine : " + t.th); }
      return { pts, why, dims };
    };
    const usure = (opts && opts.usure) || {};   // exercices déjà proposés dans d'autres séances : un peu moins prioritaires, pour varier les séances prêtes
    const notes = drills.map((d) => { const e = evaluer(d); return Object.assign({ d }, e, { adj: e.pts - (((tags[d.id] || {}).role) ? Math.min(9, 3 * (usure[d.id] || 0)) : Math.min(4, 1.2 * (usure[d.id] || 0))) }); });
    const ordre = (a, b) => b.adj - a.adj || a.d.duration - b.d.duration || a.d.id.localeCompare(b.d.id);
    const choisis = [], pris = new Set(); let total = 0;
    const prendre = (n, phase, pourquoiPar) => { if (!n || pris.has(n.d.id) || total + n.d.duration > duree) return false; pris.add(n.d.id); total += n.d.duration; choisis.push({ phase, drill: n.d, minutes: n.d.duration, pourquoi: n.why.length ? n.why : [pourquoiPar] }); return true; };
    const role = (n) => (tags[n.d.id] || {}).role;
    // 1. échauffement
    const ech = notes.filter((n) => role(n) === "ech" && n.pts >= 0).sort(ordre)[0];
    if (ech) prendre(ech, "Échauffement", "échauffement technique commun à tous les plans");
    // 2. thèmes du plan : les mieux notés, jusqu'à 5, en gardant de la place pour la finition
    const reserveFin = duree >= 60 ? 12 : 0, reserveCpa = tr.cpa === "oui" && duree >= 45 ? (tr.insister === "cpa" && duree >= 75 ? 25 : 12) : 0, maxThemes = duree >= 90 ? 6 : duree >= 60 ? 5 : 3;
    const couverts = new Set(), themes = () => choisis.filter((c) => c.phase === "Thème du plan").length;
    ["ins", "sys", "gj", "def", "dt", "at", "so", "tr", "pd", "oc", "fi", "pr", "cmp", "nl"].forEach((dim) => {
      if (couverts.has(dim) || themes() >= maxThemes) return;
      const n = notes.filter((x) => x.dims.indexOf(dim) >= 0 && x.pts >= 3 && role(x) !== "ech" && role(x) !== "fin" && !pris.has(x.d.id) && total + x.d.duration <= duree - reserveFin - reserveCpa).sort(ordre)[0];
      if (n && prendre(n, "Thème du plan", "")) n.dims.forEach((x) => couverts.add(x));
    });
    notes.filter((n) => n.pts >= 3 && role(n) !== "ech" && role(n) !== "fin").sort(ordre).forEach((n) => {
      if (choisis.filter((c) => c.phase === "Thème du plan").length >= maxThemes) return;
      if (total + n.d.duration > duree - reserveFin - reserveCpa) return;
      prendre(n, "Thème du plan", "");
    });
    // 2 bis. coups de pied arrêtés, si l'entraîneur les veut (deux exercices s'il insiste dessus)
    if (tr.cpa === "oui") notes.filter((n) => (tags[n.d.id] || {}).cp && n.pts >= 0).sort(ordre).slice(0, tr.insister === "cpa" ? 2 : 1).forEach((n) => prendre(n, "Coups de pied arrêtés", "coups de pied arrêtés demandés"));
    // 3. finition : mise en application en jeu
    const fin = notes.filter((n) => role(n) === "fin" && n.pts >= 0).sort(ordre)[0];
    if (fin) prendre(fin, "Finition", "mise en application : finir l'action ou jouer le thème en match");
    // 4. s'il reste du temps, les thèmes suivants
    notes.filter((n) => n.pts >= 1 && role(n) !== "ech" && role(n) !== "fin").sort(ordre).forEach((n) => prendre(n, "Thème du plan", "complément du thème principal"));
    // 5. toujours du temps : exercices généraux (jamais de gardien-joueur ni de coups de pied arrêtés non voulus)
    notes.filter((n) => n.pts >= 0 && role(n) !== "ech" && role(n) !== "fin").sort(ordre).forEach((n) => prendre(n, "Complément", "exercice général de base du futsal : technique, duels et jeu collectif"));
    choisis.forEach((c, i) => { c.ordre = i + 1; });
    const sans = [];
    if (planBase.PLAN_GK_SYSTEMS && planBase.PLAN_GK_SYSTEMS[p.system] && p.flyingGK === "jamais") sans.push("système " + p.system + " : il suppose le gardien-joueur, que tu as refusé : aucun exercice propre à ce système");
    if (p.defense === "libre") sans.push("hauteur de défense : « pas de consigne » (aucun exercice ciblé)");
    if (p.compact === "libre") sans.push("compacité : « pas de consigne » (aucun exercice ciblé)");
    if (tr.defType === "libre") sans.push("type de défense : « pas de consigne » (aucun exercice ciblé)");
    if (tr.attaque === "libre") sans.push("manière d'attaquer : « pas de consigne » (aucun exercice ciblé)");
    const resume = "Séance de " + duree + " min pour jouer en " + p.system + (DEF_LABEL[p.defense] ? ", " + DEF_LABEL[p.defense] : "") + (CMP_LABEL[p.compact] ? ", " + CMP_LABEL[p.compact] : "") + (DT_LABEL[tr.defType] ? ", " + DT_LABEL[tr.defType] : "") + (AT_LABEL[tr.attaque] ? ", " + AT_LABEL[tr.attaque] : "") + (p.pressing === "oui" ? ", avec pressing immédiat" : "") + (p.flyingGK !== "jamais" ? ", avec gardien-joueur" : "") + (tr.cpa === "oui" ? ", avec coups de pied arrêtés" : "") + EXTRA.map((e) => (e.lab[tr[e.q]] && (e.q !== "cpaFocus" || tr.cpa === "oui") ? ", " + e.lab[tr[e.q]] : "")).join("") + ".";
    return { duree, total, resume, blocs: choisis, sansExercice: sans };
  };
})(typeof module === "object" && module.exports ? module.exports : (window.FutsalKB = window.FutsalKB || {}));
