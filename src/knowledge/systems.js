/* Base de connaissances — Systèmes tactiques et principes de jeu. */
(function (target) {
  target.SYSTEMS = [
    {
      id: "3-1",
      name: "3-1 (trois derrière, un pivot)",
      aka: "Système en « Y »",
      structure: "Défenseur central et deux ailiers organisent le jeu derrière, un pivot occupe la zone de finition.",
      description: "Système le plus répandu au niveau amateur et formateur. Il offre une base défensive stable (trois joueurs derrière le ballon) et un point d'appui clair avec le pivot.",
      strengths: ["Équilibre défensif naturel", "Pivot comme point d'appui pour remonter le jeu", "Lisible pour des joueurs en formation"],
      weaknesses: ["Peu de mouvements entre les lignes si le pivot est fixé", "Attaque prévisible (jeu systématique par le pivot)", "Largeur parfois mal occupée si les ailiers restent bas"],
      weaknessErrors: ["pivot_isole", "attaque_statique", "largeur_mal_occupee"],
      tips: {
        pivot_isole: "Faire monter un ailier en soutien à 3–4 m du pivot et organiser des passe-et-va autour de lui.",
        attaque_statique: "Introduire des permutations ailier–pivot : le pivot décroche, l'ailier plonge dans son dos.",
        largeur_mal_occupee: "Les deux ailiers tiennent la largeur à tour de rôle ; le défenseur central trouve l'ailier opposé par changement d'aile."
      }
    },
    {
      id: "1-2-1",
      name: "1-2-1 (losange)",
      aka: "Diamant / losange",
      structure: "Un défenseur central derrière, deux ailiers sur les côtés, un pivot devant. Les quatre joueurs de champ forment un losange.",
      description: "Structure offensive très utilisée en haut niveau. Les quatre joueurs de champ offrent des angles de passe à chaque possesseur ; les ailiers alternent entre largeur et profondeur.",
      strengths: ["Nombreuses lignes de passe (triangles)", "Possibilité de circulation continue (rotation)", "Transition défensive claire autour du défenseur central"],
      weaknesses: ["Le défenseur central est exposé s'il reste seul derrière", "Exige des ailiers très mobiles et une lecture mutuelle", "Perte de balle centrale = contre-attaque directe"],
      weaknessErrors: ["espace_dos_fixo", "contre_attaque_subie", "repli_tardif"],
      tips: {
        espace_dos_fixo: "Un ailier fait « le deuxième défenseur central » côté ballon : repli prioritaire dès la perte.",
        contre_attaque_subie: "Interdire la passe verticale en zone centrale ; jouer sur l'ailier si le pivot est marqué.",
        repli_tardif: "Désigner un « sécurisant » : le joueur le plus proche du ballon temporise, les autres replient derrière lui."
      }
    },
    {
      id: "2-2",
      name: "2-2 (carré)",
      aka: "Carré",
      structure: "Deux défenseurs et deux attaquants qui forment un carré.",
      description: "Système équilibré et symétrique, apprécié au niveau jeunes. Il favorise les passes diagonales et les permutations entre lignes.",
      strengths: ["Équilibre entre attaque et défense", "Passes diagonales faciles", "Facile à enseigner"],
      weaknesses: ["Pas de point d'appui fixe devant", "Espaces entre les deux lignes en pressing", "Transitions lentes si les lignes ne coulissent pas ensemble"],
      weaknessErrors: ["equipe_etiree", "pressing_desorganise", "absence_mouvement"],
      tips: {
        equipe_etiree: "Resserrer à 8–10 m entre les lignes et faire coulisser tout le bloc vers le ballon.",
        pressing_desorganise: "Déclencher le pressing sur signal commun (mauvaise passe, appui dos au jeu).",
        absence_mouvement: "Chaque passe est suivie d'un appel (passe et va, croisement, diagonal)."
      }
    },
    {
      id: "4-0",
      name: "4-0 (quatre, sans pivot fixe)",
      aka: "Rotation / jeu sans point fixe",
      structure: "Quatre joueurs de champ qui tournent sans position fixe, souvent en carré ou en losange mobile.",
      description: "Système de haut niveau fondé sur la rotation permanente : chaque joueur occupe tous les postes. Très difficile à défendre en marquage individuel, mais exige une grande maîtrise technique et collective.",
      strengths: ["Difficile à marquer individuellement", "Possession longue, contrôle du rythme", "Chaque joueur est un danger potentiel"],
      weaknesses: ["Pertes de balle en zone médiane si rotation mal synchronisée", "Repli défensif complexe sans défenseur central désigné", "Dépend fortement de la qualité technique"],
      weaknessErrors: ["perte_zone_mediane", "repli_tardif", "passe_imprecise", "dribble_excessif"],
      tips: {
        perte_zone_mediane: "Ne pas tourner quand le ballon est sous pression ; rotation seulement sur ballon sécurisé.",
        repli_tardif: "Toujours garder un joueur « derrière le ballon » : la rotation se fait vers l'avant, pas vers le côté faible.",
        passe_imprecise: "Passe courte et tendue ; demander au receveur de se placer avant que la passe parte."
      }
    },
    {
      id: "3-2",
      name: "3-2 (gardien-joueur, supériorité 5v4)",
      aka: "Power play — structure 3-2",
      structure: "Le gardien-joueur participe à la circulation. Trois joueurs (dont lui) en base, deux joueurs devant le bloc adverse.",
      description: "Structure fréquente pour jouer avec cinq joueurs de champ. Le gardien-joueur sert de relais arrière et de changement d'aile, les deux joueurs avancés fixent la défense adverse.",
      strengths: ["Supériorité numérique pour créer des tirs ouverts", "Circulation rapide, changements de côté"],
      weaknesses: ["Perte de balle = tir dans le but vide", "Timing mal choisi (fatigue, score, fautes)", "Gardien non revenu à temps après la perte"],
      weaknessErrors: ["gj_perte_balle", "gj_timing", "gj_repli_non_assure"],
      tips: {
        gj_perte_balle: "Interdire les passes risquées quand la supériorité n'est pas franche ; passer par le relais arrière.",
        gj_timing: "Déclencher le power play à un moment convenu (temps mort, après la 5e faute adverse, dernières minutes).",
        gj_repli_non_assure: "Un joueur « sécurité » reste en couverture ; le gardien retourne immédiatement sur son but à la perte."
      }
    },
    {
      id: "1-2-2",
      name: "1-2-2 (gardien-joueur, variante offensive)",
      aka: "Power play — structure 1-2-2",
      structure: "Un joueur de base, deux ailiers milieu, deux joueurs avancés (dont le gardien-joueur en soutien).",
      description: "Variante du jeu avec gardien-joueur qui offre davantage de présence dans la surface adverse au prix d'un risque défensif accru.",
      strengths: ["Densité offensive devant le but", "Nombreuses solutions de tir"],
      weaknesses: ["Équilibre défensif fragile", "Perte de balle au centre = but encaissé facile"],
      weaknessErrors: ["gj_perte_balle", "gj_repli_non_assure"],
      tips: {
        gj_perte_balle: "Limiter les risques au centre : le ballon passe par les côtés tant qu'il n'y a pas d'ouverture.",
        gj_repli_non_assure: "Définir qui revient à la perte : en priorité le gardien-joueur, puis le joueur le plus bas."
      }
    }
  ];

  target.DEFENSIVE_ORGANISATIONS = [
    { id: "zone", name: "Défense de zone", text: "Chaque joueur couvre un secteur et coulisse selon le ballon. Avantage : économie d'énergie, bloc compact. Risque : les zones intermédiaires (entre deux défenseurs) et le dos du bloc." },
    { id: "individuelle", name: "Marquage individuel", text: "Chaque défenseur suit un adversaire. Efficace contre une équipe peu mobile mais très coûteux physiquement ; vulnérable aux rotations, écrans et permutations (4-0)." },
    { id: "mixte", name: "Défense mixte", text: "Zone dans les zones de passage, individuel sur les joueurs dangereux (pivot, tireur). Demande une communication constante." },
    { id: "pressing-haut", name: "Pressing haut (tout terrain)", text: "Pression dès la relance adverse. Efficace pour récupérer haut et déclencher des contre-attaques courtes ; très exigeant physiquement ; danger si le pressing est battu (espace dans le dos)." },
    { id: "bloc-medio", name: "Bloc médian", text: "L'équipe défend à partir de la ligne médiane en bloc compact (≈10–12 m de profondeur). Bon équilibre entre énergie et sécurité." },
    { id: "bloc-bas", name: "Bloc bas", text: "Repli dans les 10 derniers mètres. Réduit les espaces mais concède des tirs de loin et des coups francs (risque de fautes cumulées)." },
    { id: "def-5v4", name: "Défense contre gardien-joueur", text: "Quatre défenseurs contre cinq attaquants. Principes : fermer l'axe, orienter vers les côtés, communiquer sur les croisements, récupérer la balle puis tirer dans le but vide si la possibilité existe." }
  ];

  target.PRINCIPLES = [
    { title: "Largeur et profondeur", text: "Occuper les couloirs latéraux pour étirer la défense et créer des espaces ; alterner joueurs en profondeur (pivot, ailier) et joueurs de soutien." },
    { title: "Triangles et lignes de passe", text: "Toujours offrir au porteur au moins deux solutions : une passe sûre et une passe qui avance." },
    { title: "Supériorité numérique locale", text: "Attirer plusieurs adversaires sur un côté, puis changer d'aile pour créer un 2 contre 1 ou un 3 contre 2." },
    { title: "Rotation", text: "Permutation planifiée des postes pour désorganiser le marquage ; la rotation doit se faire ballon sécurisé et en gardant un joueur derrière le ballon." },
    { title: "Jeu à un-deux (paredes)", text: "Passe suivie d'un appel et d'une remise immédiate : casse la défense et crée l'accélération." },
    { title: "Écrans et blocs", text: "Se placer légalement sur la trajectoire d'un défenseur pour libérer un partenaire (tireur, receveur) sans faute de contact." },
    { title: "Transition", text: "Les 3 premières secondes après une perte (contre-pressing / repli) et après une récupération (contre-attaque) décident du match." },
    { title: "Sécurité défensive", text: "Même en phase offensive, un joueur reste en couverture (défenseur central ou sécurisant) pour éviter la contre-attaque." }
  ];
})(typeof module === "object" && module.exports ? module.exports : (window.FutsalKB = window.FutsalKB || {}));
