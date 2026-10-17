/* Catalogue des erreurs tactiques observables, causes probables et solutions. */
(function (target) {
  target.PHASES = {
    OFF: { label: "Phase offensive (attaque placée)", color: "#2563eb" },
    TRANS: { label: "Transitions", color: "#d97706" },
    DEF: { label: "Phase défensive", color: "#dc2626" },
    GK: { label: "Gardien", color: "#7c3aed" },
    GJ: { label: "Gardien-joueur (5 contre 4)", color: "#0d9488" },
    CPA: { label: "Coups de pied arrêtés", color: "#4b5563" }
  };

  const E = (id, label, phase, weight, zoneSensitive, description, signs, causes, solutions, cues, drills, rules) =>
    ({ id, label, phase, weight, zoneSensitive, description, signs, causes, solutions, cues, drills, rules: rules || [] });

  target.ERRORS = [
    // --- OFFENSIF ---
    E("relance_risquee", "Relance risquée sous pression", "OFF", 3, true,
      "Le gardien ou le défenseur central relance court vers un partenaire marqué ou dans l'axe alors qu'un adversaire presse.",
      ["Passe dans l'axe vers un joueur dos à la pression", "Balle perdue dans les 6 m devant le but", "Relance précipitée à la main"],
      ["Aucun appel de dégagement", "Pas d'option sûre (côté faible)", "Manque de calme du relanceur", "Ailiers trop hauts, ligne de passe fermée"],
      ["Prévoir une solution sûre : passe latérale vers un ailier démarqué ou relance longue", "Faire redescendre un ailier pour offrir un appui", "En cas de pressing haut, jouer d'abord vers le côté faible puis sortir", "Relayer en 4 s maximum sans précipitation"],
      ["Regarde d'abord, relance ensuite", "Si doute : sécurise sur l'ailier ou joue long", "Appelle fort ton partenaire"],
      ["relance_pression", "gardien_jeu_pied", "rondo_4v2"], ["regles-4s"]),

    E("perte_zone_def", "Perte de balle en zone défensive", "OFF", 4, false,
      "Perte du ballon dans le tiers défensif, avec peu de joueurs derrière le ballon.",
      ["Contrôle raté sous pression", "Passe interceptée près de sa surface", "Dribble inutile devant son but"],
      ["Dribbles risqués", "Appui insuffisant", "Pression adverse non anticipée", "Joueurs trop proches les uns des autres"],
      ["Interdire dribbles et passes risquées dans son tiers : jouer simple et vers l'extérieur", "Créer un triangle de sécurité autour du porteur", "Désigner un joueur de couverture derrière le ballon", "Si la balle est perdue, contre-pressing immédiat ou repli"],
      ["Jeu simple devant ton but", "Toujours une solution de sécurité", "Dégage avant le risque"],
      ["rondo_4v2", "contre_pressing_5s", "relance_pression"], []),

    E("perte_zone_mediane", "Perte de balle en zone médiane", "OFF", 2, false,
      "Le ballon est perdu au centre du terrain, ce qui ouvre la porte à une transition adverse.",
      ["Passe imprécise au centre", "Rotation mal synchronisée", "Pression adverse non anticipée"],
      ["Manque d'appels", "Passes trop lentes ou molles", "Mauvais contrôle orienté"],
      ["Passes tendues et appels coordonnés", "Orienter le contrôle vers l'espace libre", "Garder un joueur derrière le ballon avant de tenter la passe verticale"],
      ["Contrôle orienté", "Passe tendue", "Un joueur reste derrière le ballon"],
      ["rondo_4v2", "rotation_4_0", "passe_et_va"], []),

    E("passe_imprecise", "Passe imprécise ou mal rythmée", "OFF", 2, false,
      "Passe trop faible, trop forte ou mal dirigée vers un partenaire mal placé.",
      ["Passe devant le receveur sans qu'il l'attende", "Passe au pied faible", "Changement de rythme incontrôlé"],
      ["Manque de communication", "Mauvais timing de l'appel", "Technique insuffisante"],
      ["Travailler la précision en conditions réelles (pression, temps limité)", "Imposer un appel avant la passe", "Réduire la distance et augmenter la vitesse de passe"],
      ["Regarde ton partenaire avant de passer", "Passe tendue, pied intérieur", "Le receveur se montre avant"],
      ["rondo_4v2", "passe_et_va"], []),

    E("absence_mouvement", "Absence de mouvement sans ballon", "OFF", 2, false,
      "Les joueurs restent statiques après leur passe ; le porteur n'a pas de solution.",
      ["Passes sans suite", "Joueurs alignés derrière le ballon", "Porteur forcé de dribbler seul"],
      ["Joueurs spectateurs après la passe", "Méconnaissance des principes passe-et-va", "Fatigue"],
      ["Imposer « passe + mouvement »", "Mettre en place des schémas de croisements/permutations", "Rotations de joueurs pour éviter la fatigue"],
      ["Après la passe, bouge", "Crée une ligne de passe", "Un appel de rupture, un appel d'appui"],
      ["passe_et_va", "jeu_de_position"], []),

    E("pivot_isole", "Pivot isolé / non soutenu", "OFF", 3, false,
      "Le pivot reçoit sans soutien, se fait presser dos au but et perd le ballon.",
      ["Pivot servi par une longue balle sans appui", "Aucun joueur n'accompagne l'action", "Pivot forcé de jouer seul"],
      ["Ailiers trop bas", "Passe trop tardive", "Appuis de soutien mal placés"],
      ["Faire monter un ailier en soutien à 3–4 m", "Organiser une remise immédiate (une touche)", "Varier avec une passe en profondeur ou un écran"],
      ["Pivot : protège avec le corps", "Ailier : viens en soutien", "Remise de première"],
      ["pivot_appui", "passe_et_va"], []),

    E("attaque_statique", "Attaque prévisible / sans rotation", "OFF", 2, false,
      "Le même schéma est répété ; la défense anticipe sans difficulté.",
      ["Toujours le même passeur vers le pivot", "Aucune permutation", "Circulation lente"],
      ["Schémas d'attaque limités", "Manque de variations de rythme", "Peu de communication"],
      ["Entraîner 2–3 schémas de rotation avec variantes", "Changer de rythme : une accélération après la circulation", "Utiliser des permutations ailier–pivot"],
      ["Change de rythme", "Permute après la passe", "Fais bouger le bloc adverse"],
      ["rotation_4_0", "passe_et_va"], []),

    E("tir_precipite", "Tir précipité ou mal préparé", "OFF", 2, true,
      "Tir pris trop tôt, loin du but ou sous pression sans construction.",
      ["Frappe de loin non cadrée", "Pas de rebond suivi", "Peu de joueurs en soutien"],
      ["Impatience", "Mauvaise lecture de l'angle", "Pas de solution de passe"],
      ["Fixer un seuil : tirer si l'angle est ouvert, sinon circuler", "Placer un joueur au rebond", "Travailler la finition à vitesse de match"],
      ["Prends une touche de plus si l'angle est fermé", "Un joueur au rebond", "Cadre ton tir"],
      ["finition_cadence"], []),

    E("occasion_manquee", "Occasion franche manquée", "OFF", 2, true,
      "Face à face ou tir à bout portant non converti.",
      ["Tir non cadré face au gardien", "Hésitation", "Mauvais choix technique"],
      ["Manque de sang-froid", "Fatigue", "Mauvais appui"],
      ["Travailler la finition en situation de match (fatigue + pression)", "Varier les finitions : piqué, plat du pied, tir croisé", "Encourager sans punir l'échec"],
      ["Regarde le gardien", "Frappe croisée côté opposé", "Reste lucide"],
      ["finition_cadence"], []),

    E("dribble_excessif", "Dribble excessif ou conservation trop longue", "OFF", 2, true,
      "Le porteur garde le ballon trop longtemps et perd le tempo collectif.",
      ["Plusieurs touches avant de passer", "Perte au 1c2", "Collectif en attente"],
      ["Manque de confiance dans les partenaires", "Choix du dribble par défaut"],
      ["Imposer un nombre de touches maximum dans les exercices", "Récompenser la passe décisive", "Dribbler seulement dans une situation de 1c1 favorable"],
      ["2 touches max en zone dangereuse", "Dribble seulement si 1c1 avec espace derrière"],
      ["rondo_4v2", "passe_et_va"], []),

    E("largeur_mal_occupee", "Largeur mal occupée", "OFF", 2, false,
      "Les ailiers se resserrent vers l'axe, la défense adverse se compacte.",
      ["Plusieurs joueurs dans la même zone", "Pas de changement d'aile possible"],
      ["Mauvaise répartition", "Peur du ballon", "Manque de consignes de placement"],
      ["Repères visuels : un joueur par couloir, un en profondeur", "Alterner largeur et profondeur avec rotation", "Changements d'aile après 2–3 passes"],
      ["Un joueur par couloir", "Étire la défense", "Change d'aile quand la défense se resserre"],
      ["jeu_de_position", "largeur_profondeur"], []),

    // --- TRANSITIONS ---
    E("contre_attaque_subie", "Contre-attaque adverse concédée", "TRANS", 3, true,
      "Après une perte, l'équipe est déséquilibrée et l'adversaire peut attaquer en supériorité.",
      ["2c1 ou 3c2 subi", "Équipe trop haute", "Aucun joueur de couverture"],
      ["Prises de risque sans sécurité", "Repli trop lent", "Trop de joueurs en avant"],
      ["Désigner un joueur sécurisant en attaque", "Contre-pressing ou repli immédiat dès la perte", "Interdire la passe verticale à la première passe adverse"],
      ["Un joueur reste derrière le ballon", "Perte = repli immédiat", "Temporise avant d'engager le duel"],
      ["repli_3v2", "contre_pressing_5s"], []),

    E("repli_tardif", "Repli défensif tardif", "TRANS", 4, true,
      "Les joueurs offensifs reviennent trop tard après une perte.",
      ["Défenseur seul contre plusieurs attaquants", "Course de retour à retardement"],
      ["Manque d'anticipation", "Fatigue", "Mauvaise lecture du jeu"],
      ["Repli immédiat dès la perte", "Un joueur temporise pendant que les autres reviennent", "Remplacer rapidement les joueurs fatigués"],
      ["Perte → repli immédiat", "Premier défenseur temporise", "Reviens dans l'axe"],
      ["repli_3v2", "contre_pressing_5s"], []),

    E("transition_off_lente", "Transition offensive trop lente", "TRANS", 2, false,
      "Après une récupération, l'équipe ne profite pas du déséquilibre adverse.",
      ["Ballon récupéré puis circulation lente", "Aucune course vers l'avant"],
      ["Manque de joueurs en avance", "Peur de perdre le ballon", "Pas de plan de contre-attaque"],
      ["Première passe vers l'avant", "Ailiers en course dès la récupération", "Finir en moins de 8 secondes si l'espace est libre"],
      ["Ballon récupéré = regarde devant", "Cours dans l'espace", "Passe vers l'avant d'abord"],
      ["transition_off", "superiorite_2v1"], []),

    E("superiorite_non_convertie", "Supériorité numérique mal exploitée", "TRANS", 3, true,
      "Le 2c1 ou le 3c2 n'aboutit pas à une occasion.",
      ["Porteur qui tente seul", "Passe trop tardive", "Défenseur peu fixé"],
      ["Mauvaise prise de décision", "Distance entre attaquants trop faible"],
      ["Attirer le défenseur avant la passe", "Écarter les attaquants (largeur)", "Choisir : tir ou passe, sans hésitation"],
      ["Attire puis passe", "Écarte-toi", "Décide vite"],
      ["superiorite_2v1", "transition_off"], []),

    // --- DÉFENSE ---
    E("pressing_desorganise", "Pressing non coordonné", "DEF", 3, false,
      "Un ou deux joueurs pressent seuls, laissant les lignes de passe ouvertes.",
      ["Un joueur isolé en pression", "Lignes de passe ouvertes derrière", "Adversaire qui sort facilement"],
      ["Pas de signal de pressing", "Mauvaise distance entre joueurs", "Fatigue"],
      ["Définir des déclencheurs communs", "Fermer d'abord l'axe, puis presser", "Ne pas presser si l'équipe n'est pas groupée"],
      ["On presse ensemble ou on ne presse pas", "Ferme l'axe", "Pousse vers l'extérieur"],
      ["pressing_zone", "duel_1v1_def"], []),

    E("marquage_perdu", "Marquage perdu / joueur oublié", "DEF", 4, false,
      "Un adversaire est laissé libre dans la zone de tir.",
      ["Adversaire seul au second poteau", "Défenseur absent à la couverture"],
      ["Mauvaise communication", "Défenseur qui regarde le ballon", "Rotation adverse mal suivie"],
      ["Communiquer : « j'ai le pivot, tu as l'ailier »", "Passer en défense mixte si le marquage individuel se perd", "Suivre les rotations adverses par transmission de marquage"],
      ["Regarde ton joueur et le ballon", "Parle : donne l'information", "Transmets en cas de croisement"],
      ["marquage_cpa", "pressing_zone"], []),

    E("espace_dos_fixo", "Espace dans le dos du dernier défenseur", "DEF", 4, true,
      "Le défenseur central ou le dernier défenseur est trop haut et laisse un espace pour une passe en profondeur.",
      ["Passe longue derrière la ligne défensive", "Attaquant lancé 1c1 face au gardien"],
      ["Ligne défensive trop haute", "Pressing non synchronisé", "Défenseur central isolé"],
      ["Placer le défenseur central à une distance cohérente du pressing (≈ 8–10 m)", "Un ailier couvre le dos du défenseur central", "Le gardien communique : « monte / reste »"],
      ["Garde le ballon et l'espace dans ton champ de vision", "Pressing haut seulement si la couverture suit"],
      ["repli_3v2", "pressing_zone"], []),

    E("equipe_etiree", "Équipe trop étirée (lignes éloignées)", "DEF", 3, false,
      "Trop de distance entre les lignes ; les adversaires s'engouffrent entre les joueurs.",
      ["Plus de 10–12 m entre les lignes", "Espace libre dans l'axe"],
      ["Mauvaise compacité", "Pressing sans soutien", "Fatigue"],
      ["Resserrer les lignes à 8–10 m", "Faire coulisser tout le bloc vers le ballon", "Communiquer sur la hauteur du bloc"],
      ["Reste compact", "Coulisse ensemble", "Ferme l'axe"],
      ["pressing_zone", "jeu_de_position"], []),

    E("aide_defensive_absente", "Aide défensive absente (pas de doublement)", "DEF", 3, false,
      "Le défenseur est battu en 1c1 et personne ne couvre.",
      ["Joueur battu sans couverture", "Attaquant libre vers le but"],
      ["Joueurs trop éloignés", "Peur de quitter son marquage"],
      ["Organiser le doublement : le joueur le plus proche aide", "Défenseurs à 3–4 m du premier", "Gardien qui oriente la couverture"],
      ["Couvre ton partenaire", "Prépare-toi à aider", "Parle !"],
      ["duel_1v1_def", "pressing_zone"], []),

    E("faute_evitable", "Faute évitable", "DEF", 3, true,
      "Faute inutile (tacle imprudent, main, accrochage) qui concède un coup franc ou cumule les fautes.",
      ["Tacle par derrière", "Faute loin du but sans danger", "Accumulation avant la mi-temps"],
      ["Retard dans le placement", "Excès d'engagement", "Frustration"],
      ["Travailler le placement avant l'engagement", "Interdire le tacle glissé sans ballon dégagé", "Compter les fautes cumulées : à partir de la 6e, coup franc à 10 m sans mur"],
      ["Place-toi avant d'engager", "Intercepte au lieu de charger", "Surveille le compteur de fautes"],
      ["duel_propre", "duel_1v1_def"], ["fautes"]),

    E("duel_perdu", "Duel 1 contre 1 perdu", "DEF", 2, true,
      "Le défenseur est battu dans l'espace par dribble ou changement de rythme.",
      ["Défenseur qui plonge", "Orientation vers l'axe"],
      ["Appuis trop hauts", "Mauvaise orientation de jockey"],
      ["Jockey bas, orienter vers la touche", "Ne pas tacler tant que le ballon n'est pas dégagé", "Demander la couverture du partenaire"],
      ["Appuis bas", "Oriente vers la touche", "Ne plonge pas"],
      ["duel_1v1_def"], []),

    // --- GARDIEN ---
    E("erreur_gardien", "Erreur de placement ou d'arrêt du gardien", "GK", 4, false,
      "Le gardien est mal placé ou rate un arrêt prévisible.",
      ["But encaissé près du poteau", "Angle mal fermé", "Plongeon trop tardif"],
      ["Placement trop avancé ou reculé", "Mauvaise lecture du tireur", "Manque de communication"],
      ["Travailler les positions sur la ligne de tir (angle fermé)", "Travailler la réactivité", "Préparer les situations répétitives avec la vidéo"],
      ["Place-toi sur la ligne ballon–but", "Reste sur tes appuis", "Lis le tireur"],
      ["gardien_jeu_pied"], []),

    E("sortie_gardien", "Sortie du gardien mal timée", "GK", 3, false,
      "Le gardien sort trop tard ou trop tôt et se fait lober ou dribbler.",
      ["Lob passé au-dessus du gardien", "Attaquant qui contourne le gardien"],
      ["Mauvaise lecture de la distance", "Absence de communication avec la défense"],
      ["Ne sortir que si le ballon est atteignable", "Réduire l'angle en restant bas", "Communiquer avec le défenseur central"],
      ["Sors vite ou reste", "Réduis l'angle"],
      ["gardien_jeu_pied", "duel_1v1_def"], []),

    E("regle_4s", "Violation de la règle des 4 secondes", "GK", 3, false,
      "Remise en jeu ou conservation du ballon dépassant 4 secondes.",
      ["Coup franc indirect concédé", "Corner/touche accordé à l'adversaire"],
      ["Manque de planification", "Hésitation du relanceur"],
      ["Prévoir la solution avant de reprendre le ballon", "Compter mentalement 4 secondes", "S'entraîner avec chronomètre"],
      ["Décide avant d'avoir le ballon", "4 s = vite"],
      ["regle_4s", "gardien_jeu_pied"], ["regles-4s"]),

    // --- GARDIEN-JOUEUR ---
    E("gj_perte_balle", "Perte de balle en power play", "GJ", 5, false,
      "Le ballon est perdu à 5 contre 4 et l'adversaire peut tirer dans le but vide.",
      ["But encaissé dans le but vide", "Passe interceptée au centre"],
      ["Passes risquées", "Mauvais placement des joueurs", "Pas de joueur de sécurité"],
      ["Passes simples, privilégier le relais arrière", "Un joueur de sécurité reste proche", "Déclencher l'attaque seulement sur ballon sécurisé"],
      ["Pas de risque au centre", "Joueur de sécurité désigné"],
      ["gj_5v4", "def_5v4"], []),

    E("gj_timing", "Timing du gardien-joueur inadapté", "GJ", 3, false,
      "Le gardien-joueur est déclenché au mauvais moment (équipe fatiguée, trop tôt, mal organisée).",
      ["Power play lancé sans plan", "Joueurs qui hésitent à la transition"],
      ["Mauvais choix de timing", "Pas de signal clair"],
      ["Définir à l'avance les moments (temps mort, dernières minutes, 5e faute adverse)", "Annoncer clairement l'entrée du gardien-joueur", "Réentraîner le placement après un temps mort"],
      ["Moment choisi, pas subi", "Signal clair"],
      ["gj_5v4"], []),

    E("gj_repli_non_assure", "Retour au but non assuré après perte (cage vide)", "GJ", 4, false,
      "Le gardien ou le joueur de couverture revient trop tard après la perte.",
      ["Ballon qui roule vers le but vide", "Gardien non revenu"],
      ["Positionnement trop haut", "Absence de signal de repli"],
      ["Le gardien-joueur est le premier à reculer", "Joueur de sécurité jamais plus haut que la ligne médiane", "Entraîner le repli à la perte"],
      ["Perte = retour immédiat", "Sécurité derrière la ligne médiane"],
      ["gj_5v4", "def_5v4", "repli_3v2"], []),

    // --- CPA ---
    E("cpa_def_desorganise", "Coup de pied arrêté défendu de façon désorganisée", "CPA", 4, false,
      "Un coup franc ou un corner offre un tir libre à l'adversaire.",
      ["Mur trop loin ou ouvert", "Joueur libre au second poteau", "Pas de couverture au premier poteau"],
      ["Missions mal définies", "Absence de communication"],
      ["Attribuer une mission par joueur", "Mur à 5 m minimum, serré", "Un joueur désigné pour couvrir le second poteau"],
      ["Chaque joueur a une mission", "Mur serré, gardien avancé"],
      ["marquage_cpa"], ["remises"]),

    E("cpa_off_rate", "Coup de pied arrêté offensif raté", "CPA", 2, false,
      "L'exécution manque de rythme ou d'imagination.",
      ["Tir directement dans le mur", "Passe courte interceptée"],
      ["Schéma non répété", "Mauvaise exécution"],
      ["Répéter 2–3 schémas pour chaque situation", "Prévoir une option de repli", "Rester dans les 4 secondes"],
      ["Un schéma = un appel = un signal", "Pense à l'option B"],
      ["cpa_off", "regle_4s"], ["regles-4s"])
  ];

  /* Types de résultats (issue) qu'on associe à un événement. */
  target.OUTCOMES = {
    AUCUN: { label: "Sans conséquence", multiplier: 1 },
    PERTE: { label: "Perte de balle", multiplier: 1.2 },
    OCC_CONTRE: { label: "Occasion adverse", multiplier: 1.6 },
    BUT_CONTRE: { label: "But encaissé", multiplier: 3 },
    OCC_POUR: { label: "Occasion pour nous (malgré l'erreur)", multiplier: 0.8 },
    BUT_POUR: { label: "But marqué (malgré l'erreur)", multiplier: 0.5 }
  };

  target.ZONES = {
    DEF: { label: "Zone défensive (près de notre but)", multiplier: 1.3 },
    MED: { label: "Zone médiane", multiplier: 1 },
    ATT: { label: "Zone offensive (près du but adverse)", multiplier: 0.8 }
  };

  target.SIDES = { G: "Côté gauche", C: "Axe", D: "Côté droit" };
})(typeof module === "object" && module.exports ? module.exports : (window.FutsalKB = window.FutsalKB || {}));
