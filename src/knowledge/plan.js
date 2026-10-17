/* Base de connaissances — Plan tactique : les questions posées à l'entraîneur, leurs valeurs par défaut selon le système,
   et ce que le programme sait (ou ne sait pas) vérifier sur une vidéo. */
(function (target) {
  /* Lignes attendues (nombre de joueurs de champ par ligne, de la plus basse à la plus haute, en comptant le gardien qui joue
     pour les systèmes « gardien-joueur »). */
  target.PLAN_SHAPES = {
    "3-1": [3, 1],
    "1-2-1": [1, 2, 1],
    "2-2": [2, 2],
    "4-0": [4],
    "3-2": [3, 2],
    "1-2-2": [1, 2, 2]
  };
  /* Systèmes avec gardien-joueur : forme évaluée à cinq joueurs, gardien compris, seulement quand il est monté. */
  target.PLAN_GK_SYSTEMS = { "3-2": true, "1-2-2": true };

  /* Valeurs par défaut d'un plan pour un système. */
  target.planDefaults = function (system) {
    const gk = !!target.PLAN_GK_SYSTEMS[system];
    return { system: system || "3-1", defense: "median", compact: "normale", pressing: "oui", noLossOwnZone: "oui", flyingGK: gk ? "derriere" : "jamais" };
  };

  /* Questions : id, libellé, aide, options [{ id, label, desc }]. « dependsOnSystem » : valeur par défaut qui suit le système. */
  target.PLAN_QUESTIONS = [
    { id: "system", label: "Quel système de jeu veux-tu que tes joueurs respectent ?", help: "C'est la structure de base : combien de joueurs derrière, combien devant.", options: "SYSTEMS" },
    {
      id: "defense", label: "Où veux-tu défendre quand l'adversaire a le ballon ?", help: "Hauteur moyenne de ton bloc (position moyenne des quatre joueurs de champ) par rapport à ton but.",
      options: [
        { id: "haut", label: "Haut (pressing haut)", desc: "Le bloc est dans la moitié adverse ou près du milieu : on récupère le ballon loin de notre but." },
        { id: "median", label: "Médian", desc: "Le bloc est autour du milieu du terrain : on attend l'adversaire à mi-terrain." },
        { id: "bas", label: "Bas (bloc bas)", desc: "Le bloc reste devant notre but : on ferme l'espace derrière." },
        { id: "libre", label: "Pas de consigne", desc: "Le programme ne vérifie pas la hauteur du bloc." }
      ]
    },
    {
      id: "compact", label: "Quelle compacité veux-tu quand l'adversaire a le ballon ?", help: "Écart entre le joueur le plus haut et le plus bas de ton équipe.",
      options: [
        { id: "serree", label: "Serrée (9 m au plus)", desc: "Les quatre joueurs restent très proches : peu d'espace entre eux." },
        { id: "normale", label: "Normale (13 m au plus)", desc: "Un bloc raisonnablement compact." },
        { id: "libre", label: "Pas de consigne", desc: "Le programme ne vérifie pas la compacité." }
      ]
    },
    {
      id: "pressing", label: "Veux-tu un pressing immédiat après une perte de balle ?", help: "Un joueur doit être à 3 m du porteur dans les 5 secondes qui suivent la perte.",
      options: [
        { id: "oui", label: "Oui", desc: "On presse tout de suite pour reprendre le ballon (contre-pressing)." },
        { id: "non", label: "Non", desc: "On replie d'abord et on se réorganise." }
      ]
    },
    {
      id: "noLossOwnZone", label: "Veux-tu interdire les pertes de balle dans ta zone défensive ?", help: "Une perte dans le premier tiers du terrain (près de ton but) est la plus dangereuse.",
      options: [
        { id: "oui", label: "Oui, c'est à éviter à tout prix", desc: "Chaque perte détectée dans la zone défensive sera signalée." },
        { id: "non", label: "Non, pas de consigne", desc: "Ces pertes ne sont pas relevées par le plan (elles restent dans le rapport)." }
      ]
    },
    {
      id: "flyingGK", label: "Que veux-tu pour le gardien-joueur (5 contre 4) ?", help: "Le programme repère le gardien monté au-delà du milieu. Il ne lit pas le score.",
      dependsOnSystem: true,
      options: [
        { id: "jamais", label: "Jamais", desc: "Le gardien reste dans sa zone : chaque montée sera signalée." },
        { id: "derriere", label: "Seulement quand on est menés", desc: "Le programme ne lit pas le score : il te montre quand le gardien monte, à toi de juger." },
        { id: "libre", label: "Pas de consigne", desc: "Le programme ne vérifie pas le gardien-joueur." }
      ]
    }
  ];

  /* Consignes que le programme ne peut pas vérifier sur une vidéo (à écrire dans les notes) — dites franchement. */
  target.PLAN_NOT_EVALUATED = [
    { label: "Sortie de balle depuis le gardien", why: "le programme ne repère pas de façon fiable qui a le ballon au pied du gardien" },
    { label: "Coups de pied arrêtés (corners, coups francs, rentrées)", why: "les arrêts de jeu sont détectés, mais pas la façon dont la remise en jeu est jouée" },
    { label: "Rôles individuels (qui est pivot, qui est défenseur central)", why: "les joueurs sont suivis par morceaux de piste : le programme voit des positions, pas des noms ni des numéros" },
    { label: "Intentions, communication, consignes verbales", why: "invisibles sur la vidéo" }
  ];
})(typeof module === "object" && module.exports ? module.exports : (window.FutsalKB = window.FutsalKB || {}));
