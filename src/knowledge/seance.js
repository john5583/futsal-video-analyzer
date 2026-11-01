/* Séance d'entraînement proposée d'après LE JEU QUE L'ENTRAÎNEUR VEUT JOUER (son plan tactique : système, hauteur de défense, compacité, pressing, pertes en zone défensive,
   gardien-joueur). Ajoute dix exercices à la bibliothèque (chacun a son animation : anim/scenarios-drills-plan.js), rattache chaque exercice aux choix du plan,
   puis compose une séance : échauffement, thèmes liés au plan, finition. Chaque exercice proposé dit POURQUOI (le choix du plan qui le justifie).
   Ce que cette base ne fait PAS (dit franchement) : elle ne mesure pas l'efficacité des exercices ; les durées et les critères sont des repères d'entraîneur, à adapter. */
(function (target) {
  const base = typeof module === "object" && module.exports ? require("./drills.js").DRILLS : target.DRILLS;
  const planBase = typeof module === "object" && module.exports ? require("./plan.js") : target;
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
  target.DRILLS = base.concat(NOUVEAUX.filter((n) => !base.some((b) => b.id === n.id)));

  /* Rattachement des exercices aux choix du plan : sys = systèmes, def = hauteurs de défense, cmp = compacités, pr = pressing, nl = pas de perte en zone, gj = gardien-joueur,
     role = place dans la séance (ech = échauffement, fin = finition), th = thème en clair (sert d'explication). */
  const T = (o) => o;
  target.SEANCE_TAGS = {
    rondo_4v2: T({ role: "ech", pr: true, nl: true, th: "conserver le ballon sous pression" }),
    passe_et_va: T({ role: "ech", th: "jeu court et mouvement après la passe" }),
    regle_4s: T({ role: "ech", th: "rythme de jeu et règle des 4 secondes" }),
    contre_pressing_5s: T({ pr: true, th: "récupérer le ballon tout de suite après une perte" }),
    pressing_zone: T({ def: ["haut"], pr: true, th: "pressing coordonné" }),
    pressing_haut_4v4: T({ def: ["haut"], pr: true, th: "pressing haut sur un déclencheur" }),
    pressing_relance_gardien: T({ def: ["haut"], pr: true, th: "presser la relance du gardien adverse" }),
    bloc_bas_4v4: T({ def: ["bas"], cmp: ["serree"], th: "défendre bas sans ouvrir l'axe" }),
    compacite_9m: T({ cmp: ["serree", "normale"], def: ["bas", "median"], th: "garder le bloc compact" }),
    repli_3v2: T({ def: ["median", "bas"], th: "se replacer vite devant son but" }),
    duel_1v1_def: T({ def: ["median", "bas"], th: "défendre en 1 contre 1" }),
    duel_propre: T({ def: ["median", "bas", "haut"], th: "défendre sans faute" }),
    transition_def_3s: T({ pr: true, nl: true, th: "se replacer dans les 3 premières secondes" }),
    relance_pression: T({ nl: true, th: "sortir le ballon sous pression" }),
    gardien_jeu_pied: T({ nl: true, th: "relance et jeu au pied du gardien" }),
    zero_perte_zone_def: T({ nl: true, th: "ne jamais perdre le ballon devant son but" }),
    pivot_appui: T({ sys: ["3-1"], th: "jeu de pivot" }),
    sortie_3_1_pivot: T({ sys: ["3-1"], nl: true, th: "sortie de balle par le pivot" }),
    losange_triangles: T({ sys: ["1-2-1"], th: "triangles et losange" }),
    carre_diagonales: T({ sys: ["2-2"], th: "diagonales et changements d'axe du carré" }),
    rotation_4_0: T({ sys: ["4-0"], th: "circulation et rotations sans pivot fixe" }),
    jeu_de_position: T({ sys: ["1-2-1", "2-2", "4-0"], th: "largeur et profondeur" }),
    largeur_profondeur: T({ sys: ["2-2", "1-2-1", "4-0"], th: "étirer la défense" }),
    gj_5v4: T({ gj: true, sys: ["3-2", "1-2-2"], th: "supériorité avec le gardien-joueur" }),
    gj_perte_retour: T({ gj: true, sys: ["3-2", "1-2-2"], th: "retour au but après une perte avec le gardien monté" }),
    def_5v4: T({ th: "défendre contre un gardien-joueur adverse" }),
    superiorite_2v1: T({ th: "créer et finir une supériorité" }),
    transition_off: T({ role: "fin", pr: true, th: "contre-attaque après récupération" }),
    finition_cadence: T({ role: "fin", th: "finition sous pression de temps" }),
    marquage_cpa: T({ th: "défendre les coups de pied arrêtés" }),
    cpa_off: T({ th: "coups de pied arrêtés offensifs" })
  };

  const DEF_LABEL = { haut: "défendre haut (pressing haut)", median: "défendre au milieu du terrain", bas: "défendre bas (bloc bas)" };
  const CMP_LABEL = { serree: "un bloc serré (9 m au plus)", normale: "un bloc de 13 m au plus" };

  /* plan : choix de l'entraîneur (voir PLAN_QUESTIONS) ; opts : { duree : minutes de séance (30 à 120, 75 par défaut) }.
     Rend { duree, total, resume, blocs : [{ ordre, phase, drill, minutes, pourquoi : [phrases] }], sansExercice : [choix pour lesquels aucun exercice n'existe] }. */
  target.proposerSeance = function (plan, opts) {
    const duree = Math.max(30, Math.min(120, Math.round((opts && opts.duree) || 75)));
    const p = Object.assign({}, planBase.planDefaults((plan && plan.system) || "3-1"), plan || {});
    const tags = target.SEANCE_TAGS, drills = target.DRILLS;
    const evaluer = (d) => {
      const t = tags[d.id] || {}, why = []; let pts = 0;
      if (t.gj && p.flyingGK === "jamais") return { pts: -1, why };
      if (t.sys && t.sys.indexOf(p.system) >= 0) { pts += 4; why.push("ton système est le " + p.system + " : " + t.th); }
      if (t.def && t.def.length < 3 && t.def.indexOf(p.defense) >= 0 && DEF_LABEL[p.defense]) { pts += 4; why.push("tu veux " + DEF_LABEL[p.defense] + " : " + t.th); }
      else if (t.def && t.def.indexOf(p.defense) >= 0 && DEF_LABEL[p.defense]) { pts += 1; why.push("tu veux " + DEF_LABEL[p.defense] + " : " + t.th); }
      if (t.cmp && t.cmp.indexOf(p.compact) >= 0 && CMP_LABEL[p.compact]) { pts += 3; why.push("tu veux " + CMP_LABEL[p.compact] + " : " + t.th); }
      if (t.pr && p.pressing === "oui") { pts += 3; why.push("tu veux un pressing immédiat après une perte : " + t.th); }
      if (t.nl && p.noLossOwnZone === "oui") { pts += 3; why.push("tu veux interdire les pertes dans ta zone : " + t.th); }
      if (t.gj && p.flyingGK !== "jamais") { pts += 4; why.push("tu utilises le gardien-joueur : " + t.th); }
      return { pts, why };
    };
    const notes = drills.map((d) => Object.assign({ d }, evaluer(d)));
    const ordre = (a, b) => b.pts - a.pts || a.d.duration - b.d.duration || a.d.id.localeCompare(b.d.id);
    const choisis = [], pris = new Set(); let total = 0;
    const prendre = (n, phase, pourquoiPar) => { if (!n || pris.has(n.d.id) || total + n.d.duration > duree) return false; pris.add(n.d.id); total += n.d.duration; choisis.push({ phase, drill: n.d, minutes: n.d.duration, pourquoi: n.why.length ? n.why : [pourquoiPar] }); return true; };
    // 1. échauffement : l'exercice d'échauffement le mieux lié au plan (sinon le rondo)
    const ech = notes.filter((n) => (tags[n.d.id] || {}).role === "ech" && n.pts >= 0).sort(ordre)[0];
    if (ech) prendre(ech, "Échauffement", "échauffement technique commun à tous les plans");
    // 2. thèmes du plan : les mieux notés, jusqu'à 4, en gardant de la place pour la finition
    const reserveFin = duree >= 60 ? 12 : 0;
    notes.filter((n) => n.pts >= 3 && (tags[n.d.id] || {}).role !== "ech" && (tags[n.d.id] || {}).role !== "fin").sort(ordre).forEach((n) => {
      if (choisis.filter((c) => c.phase === "Thème du plan").length >= 4) return;
      if (total + n.d.duration > duree - reserveFin) return;
      prendre(n, "Thème du plan", "");
    });
    // 3. finition : mise en application en jeu
    const fin = notes.filter((n) => (tags[n.d.id] || {}).role === "fin" && n.pts >= 0).sort(ordre)[0];
    if (fin) prendre(fin, "Finition", "mise en application : finir l'action après la récupération ou en fin de séquence");
    // 4. s'il reste du temps, les thèmes suivants
    notes.filter((n) => n.pts >= 1 && (tags[n.d.id] || {}).role !== "ech" && (tags[n.d.id] || {}).role !== "fin").sort(ordre).forEach((n) => prendre(n, "Thème du plan", "complément du thème principal"));
    choisis.forEach((c, i) => { c.ordre = i + 1; });
    // ce qui est demandé dans le plan mais sans exercice
    const sans = [];
    if (p.defense === "libre") sans.push("défense : « pas de consigne » (aucun exercice ciblé)");
    if (p.compact === "libre") sans.push("compacité : « pas de consigne » (aucun exercice ciblé)");
    const resume = "Séance de " + duree + " min pour jouer en " + p.system + (DEF_LABEL[p.defense] ? ", " + DEF_LABEL[p.defense] : "") + (CMP_LABEL[p.compact] ? ", " + CMP_LABEL[p.compact] : "") + (p.pressing === "oui" ? ", avec pressing immédiat" : "") + (p.flyingGK !== "jamais" ? ", avec gardien-joueur" : "") + ".";
    return { duree, total, resume, blocs: choisis, sansExercice: sans };
  };
})(typeof module === "object" && module.exports ? module.exports : (window.FutsalKB = window.FutsalKB || {}));
