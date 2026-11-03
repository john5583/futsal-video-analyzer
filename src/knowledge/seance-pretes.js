/* Séances prêtes à l'emploi : quinze séances de 45 à 120 minutes, chacune avec un thème (défense, attaque, transitions, pressing, sortie de balle, finition,
   coups de pied arrêtés, gardien-joueur…). Elles ne sont pas figées : chaque séance est composée avec LE PLAN de l'entraîneur (système, hauteur du bloc,
   pressing, gardien-joueur…) et ses choix d'entraînement, par la même fonction que « Proposer une séance » (proposerSeance). Les durées, les thèmes et les
   critères sont des repères d'entraîneur à adapter ; le programme ne mesure pas l'efficacité des exercices. */
(function (target) {
  const K = typeof module === "object" && module.exports ? require("./seance.js") : target;
  /* dur : minutes ; dur = 45 à 120. force : choix imposés par le thème de la séance ; sinon : choix pris seulement si l'entraîneur est resté sur « pas de consigne ». */
  const S = (id, titre, duree, quand, objectif, force, sinon, focus) => ({ id, titre, duree, quand, objectif, force: force || {}, sinon: sinon || {}, focus: focus || 2 });
  target.SEANCES_PRETES = [
    S("equilibre45", "Mise en route équilibrée", 45, "Semaine chargée ou veille de match : court, un peu de tout.", "Un échauffement, quelques thèmes de ton plan et une mise en application.", { insister: "equilibre", cpa: "non" }),
    S("defense45", "Défense express", 45, "Quand le temps manque et que la défense a été le point faible.", "Défendre comme ton plan le demande, en peu de temps.", { insister: "defense", cpa: "non" }, {}, 6),
    S("attaque45", "Attaque express", 45, "Quand le temps manque et qu'il faut retrouver des automatismes offensifs.", "Créer et finir, selon ton système et ta manière d'attaquer.", { insister: "attaque", cpa: "non" }, {}, 6),
    S("transitions60", "Transitions : perte et récupération", 60, "Après un match où les changements de rythme t'ont posé problème.", "Se replacer vite à la perte, réagir tout de suite à la récupération.", { insister: "transitions", cpa: "non" }, { transition: "contre", pressDecl: "perte" }, 6),
    S("pressing60", "Pressing et récupération haute", 60, "Quand tu veux presser plus haut ou mieux déclencher ton pressing.", "Déclencher le pressing ensemble et fermer les lignes de passe.", { insister: "defense", cpa: "non" }, { pressDecl: "relance", defType: "mixte" }, 6),
    S("cpa60", "Coups de pied arrêtés", 60, "Dans la semaine d'un match serré, où un corner ou une rentrée peut tout changer. Seule séance qui impose les coups de pied arrêtés.", "Les coups de pied arrêtés, pour toi et contre toi, dans la règle des 4 secondes.", { cpa: "oui", insister: "cpa" }),
    S("sortie75", "Sortie de balle et construction", 75, "Quand les pertes devant ton but sont trop nombreuses.", "Sortir proprement depuis le gardien, sans perte dans ta zone.", { insister: "sortie", cpa: "non" }, { sortie: "court", transition: "poser", occupation: "triangles" }, 6),
    S("finition75", "Finition : conclure ses actions", 75, "Quand tu crées des occasions mais ne les finis pas.", "Finir en duel, après une combinaison ou vite, selon ton choix.", { insister: "finition", cpa: "non" }, { finition: "collectif", attaque: "court" }, 6),
    S("bloc75", "Bloc et compacité", 75, "Quand ton bloc s'étire ou laisse trop d'espace derrière.", "Garder le bloc compact à la hauteur voulue, en zone ou en individuelle.", { insister: "defense", cpa: "non" }, { defType: "zone" }, 6),
    S("gardienjoueur75", "Gardien-joueur : avec ou contre", 75, "Quand tu joues (ou affrontes) le 5 contre 4 en fin de match.", "Construire à cinq, revenir au but après une perte, ou défendre contre le gardien-joueur adverse.", { insister: "gj", cpa: "non" }, {}, 6),
    S("attaque90", "Attaquer comme dans ton plan", 90, "Séance longue centrée sur l'attaque.", "Ton système et ta manière d'attaquer, de la construction à la finition.", { insister: "attaque", cpa: "non" }, { occupation: "large" }, 5),
    S("defense90", "Défendre comme dans ton plan", 90, "Séance longue centrée sur la défense.", "Hauteur de bloc, type de défense, pressing et transitions défensives.", { insister: "defense", cpa: "non" }, { defType: "mixte" }, 5),
    S("complete90", "Séance complète équilibrée", 90, "Le milieu de semaine classique avant un match.", "Défense, attaque, transitions et mise en jeu, avec les choix de ton plan.", { insister: "equilibre" }),
    S("grande105", "Grande séance : transitions et finition", 105, "Quand tu as toute la salle et les joueurs.", "Enchaîner les phases comme en match, de la récupération à la finition.", { insister: "transitions" }, { finition: "vite", transition: "contre" }, 4),
    S("longue120", "Séance longue : tout le plan", 120, "Un grand entraînement de préparation.", "Reprendre tout ton plan de jeu (avec les coups de pied arrêtés seulement si tu les as demandés).", { insister: "equilibre" })
  ];

  /* plan : les réponses du plan tactique ; training : les choix d'entraînement ; filtre : { duree } pour ne garder qu'une durée.
     Rend [{ id, titre, duree, quand, objectif, seance }] (seance = résultat de proposerSeance), classé par durée. */
  target.proposerSeancesPretes = function (plan, training, filtre) {
    const base = Object.assign(K.trainingDefaults(), training || {});
    const usure = {};
    const toutes = target.SEANCES_PRETES.map((s) => {
      const tr = Object.assign({}, base);
      Object.keys(s.sinon).forEach((k) => { if (!tr[k] || tr[k] === "libre") tr[k] = s.sinon[k]; });
      Object.assign(tr, s.force);
      const seance = K.proposerSeance(plan, { duree: s.duree, training: tr, focus: s.focus, usure });
      seance.blocs.forEach((b) => { usure[b.drill.id] = (usure[b.drill.id] || 0) + 1; });
      return { id: s.id, titre: s.titre, duree: s.duree, quand: s.quand, objectif: s.objectif, seance };
    });
    return toutes.filter((x) => !filtre || !filtre.duree || x.duree === filtre.duree);   // le filtre s'applique après : la même séance reste la même, filtrée ou non
  };
})(typeof module === "object" && module.exports ? module.exports : (window.FutsalKB = window.FutsalKB || {}));
