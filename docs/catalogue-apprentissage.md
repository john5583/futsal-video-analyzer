# Catalogue : ce que Futsal Analyzer mesure, apprend, demande — et ne fait jamais

Ce document décrit, sans rien promettre de plus que le programme ne fait, comment il traite ce qui varie d'une vidéo à l'autre.
Règle de fond : **le programme n'invente jamais**. Ce qu'il mesure est affiché ; ce qu'il déduit est étiqueté comme déduit ;
ce qu'il ne sait pas devient **une question** (ou « non analysé ») — jamais une réponse devinée.

## 1. Ce qu'il lit tout seul (mesures sur l'image)

| Donnée | Comment | Limite connue |
|---|---|---|
| Joueurs et arbitres | détecteur d'objets généraliste (YOLOX), non entraîné sur vos vidéos | personnes cachées ou très petites manquées |
| Ballon | plusieurs candidats par image, trajectoire cohérente choisie ; une trajectoire exige au moins une détection fiable | ballon tenu, caché ou hors jeu : pas de position inventée |
| Équipe d'un joueur | couleur des tenues apprises par clic, vote sur toute la piste | tenues proches, gardien en survêtement noir |
| Terrain | but + lignes du sol (clics) ; suivi du mouvement de la caméra | calibrage ancien sur caméra à la main : le terrain n'est alors pas tracé |
| Bancs | zones marquées en 2 clics, personnes assises ignorées ; zone qui suit la dérive de la caméra (au plus 6 m) | une dérive de 3 m ou plus déclenche une question |

## 2. Ce qu'il apprend, dans le projet seulement

Tout est enregistré dans le fichier du projet (`.fsal`) et réappliqué à chaque nouvelle analyse **de ce projet**. Rien n'est
réutilisé d'un autre projet. Le détecteur lui-même **n'apprend pas** : il ne se réentraîne pas avec vos réponses.

| Donnée apprise | D'où elle vient | Effet | Annulable |
|---|---|---|---|
| Couleurs des tenues | vos clics sur les silhouettes | équipe de chaque joueur | oui (refaire l'étape) |
| Couleur des lignes du sol | votre choix dans l'assistant | aide au repérage du terrain | oui |
| Aspect d'un but | « Je montre le but moi-même » (3 clics) | but retrouvé ailleurs dans le projet (couleur lue, jamais devinée ; un but blanc uni ne donne aucune couleur) | oui (réglages) |
| Zones de bancs | 2 clics par banc | personnes assises ignorées | oui (« Effacer les bancs ») |
| Réponse « équipe » | question avec cadre orange sur l'image | la personne prend l'équipe donnée (ou est retirée) | oui — « Mes réponses » |
| Réponse « remplaçant ou joueur » | question sur un passage par la zone de remplacement | « joueur » : compté comme joueur ; « remplaçant » : écarté 3 s comme avant | oui |
| Réponse « zone de banc » | question quand la zone a dérivé de 3 m ou plus | « non » : la zone ne suit plus la caméra aux analyses suivantes | oui |
| Erreur incertaine confirmée ou écartée | question « a-t-elle eu lieu ? » ou ✖ | confirmée : ajoutée aux événements ; écartée : ne revient plus | oui |

## 3. Quand le programme pose une question

- Une personne dont l'équipe est partagée, contredit nettement les images, ou n'a jamais été identifiée.
- Une erreur possible qu'il ne peut pas confirmer (ballon non visible, arrêt de jeu probable).
- Une personne qui entre ou sort par la zone de remplacement (est-ce un remplaçant ?).
- Une zone de banc qui a beaucoup suivi la caméra (est-elle encore sur le banc ?).
- Un but qu'il croit voir sans en être sûr : il le dessine et demande « est-ce ce but ? ».

- Les questions concernant peut-être la même personne coupée en plusieurs pistes sont **regroupées en une proposition** : la même réponse n'est appliquée qu'avec votre accord, et chaque réponse reste annulable.
- Les questions « remplaçant ? » ne portent que sur les personnes suivies au moins 6 secondes (une silhouette qui ne fait que passer n'est pas questionnée).

Une question sans réponse reste **non analysée** : elle n'entre ni dans les statistiques ni dans le rapport.

## 3 bis. Mon plan tactique (page dédiée)

Le coach répond à quelques questions (système de jeu, hauteur du bloc, compacité, pressing après une perte, pertes en zone défensive,
gardien-joueur). Le programme compare ensuite ce plan à ce qu'il a **mesuré** sur le match analysé :

| Consigne | Ce qui est mesuré | Limite |
|---|---|---|
| Système (3-1, 2-2, 1-2-1…) | forme du bloc (lignes séparées à partir de 3,5 m d'écart), au moins 4 s d'écart | n'est jugé que quand les 4 joueurs de champ sont visibles et identifiés |
| Hauteur du bloc | position moyenne du bloc quand l'adversaire a le ballon | idem |
| Compacité | profondeur entre le joueur le plus haut et le plus bas | idem |
| Pressing | un joueur à 3 m du porteur dans les 5 s après une perte | pertes sans ballon visible non jugées |
| Pertes en zone défensive | pertes déjà détectées par l'analyse | ballon non fiable : aucune perte déclarée |
| Gardien-joueur | gardien monté au-delà de 22 m | « seulement quand on est menés » : le score n'est pas lu, donc non évalué |

Quand il y a trop peu d'images exploitables (moins de 15 s, ou moins de 25 % du jeu analysé), la consigne est dite **indicative** : jamais
un écart en rouge sur quelques secondes. Ne sont **pas** vérifiés : sortie de balle, coups de pied arrêtés, rôles individuels, intentions.
Chaque écart est montré sur la vraie vidéo, avec la correction à faire.

## 4. Ce qu'il ne fait jamais

- Lire ce qui est invisible : sifflet, fautes cumulées, chronomètre officiel, score.
- Déduire une erreur liée au ballon quand le ballon n'est pas fiable.
- Compter une déduction (ballon tenu) comme une mesure : la part déduite est affichée à part.
- Promettre 100 % : les chiffres du rapport viennent de matchs mesurés, et leurs limites sont écrites.

## 5. Types de buts de futsal (état des connaissances)

Dimensions : **3 m de large sur 2 m de haut** (intérieur des poteaux). Les lois du jeu (FFF) laissent libre la matière (bois, métal,
autre) et la section (carrée, rectangulaire, ronde, elliptique). **Aucune règle n'impose de couleur de bandes** : elles varient selon
le fabricant et la salle, et les buts de handball (même taille) sont souvent utilisés.

| Type courant | Aspect | Détection automatique |
|---|---|---|
| Bandes rouges et blanches (handball, futsal) | poteaux et barre à bandes alternées | oui |
| Bandes bleues et blanches | idem en bleu | oui |
| Bandes vertes et blanches | idem en vert | oui |
| Autre couleur vive à bandes (orange, violet…) | idem | non d'office ; oui après « Je montre le but moi-même » |
| Cadre blanc ou aluminium uni | aucune bande | **non** : le programme peut proposer un candidat et demander confirmation, ou vous le montrez en 3 clics |
| Cadre rond ou carré, filet clair ou sombre | variantes de section et de filet | indifférent (la détection regarde les poteaux, pas le filet) |
| Buts mobiles ou gonflables (toile PVC) | formes moins rigides | non garanti |

Sources : [lois du jeu futsal (FFF)](https://districtfoot08.fff.fr/wp-content/uploads/sites/57/2019/02/lois-du-jeu-futsal-spécifique.pdf),
[règlement UNSS futsal](https://clg-vaucouleurs-mantes.ac-versailles.fr/IMG/pdf/reglement_specifique_futsal_unss_2017_2018.pdf),
catalogues de fabricants (aluminium blanc, uPVC, bandes rouges ou bleues de 200 mm). Les couleurs de bandes sont des choix de
fabricants, non des règles : ce catalogue n'est **pas exhaustif**.

## 5 bis. Personnes, ballon et tenue : comment le programme gère le doute

- **Corriger en un clic** : un clic sur le cadre d'une personne ouvre « Qui est cette personne ? » (mon équipe, adversaire, mon gardien, gardien adverse, arbitre / public / remplaçant). Un clic ailleurs propose « le ballon est ici ? ». Tout est retenu dans le projet et annulable dans « Mes réponses ».
- **Tenue différente** : une personne en pantalon ou survêtement (peu de peau visible aux jambes) alors que son équipe porte un short est questionnée. Mesuré sur des images étiquetées : médiane de 0 % de peau pour un gardien en survêtement, 22 à 34 % pour des joueurs en short.
- **Cinq joueurs de champ en même temps** dans une même équipe (il n'y en a que quatre en futsal) : l'un d'eux est peut-être un gardien, un arbitre ou un remplaçant ; question sur celui dont les jambes diffèrent.
- **Même allure** : après avoir désigné un gardien, les autres personnes en pantalon de la même équipe sont **proposées** (jamais appliquées d'office). Mesuré : la tenue seule ne suffit pas à reconnaître un gardien (158 joueurs sur 223 lui ressemblaient autant que lui-même), d'où la vérification par le coach.
- Ce qui reste hors de portée : une personne lue avec assurance mais sans aucun signe visible de différence (gardien en short aux couleurs de l'équipe adverse, par exemple) ne déclenche aucune question ; le clic sur le cadre sert alors à la corriger.

## 5 ter. Ce qu'il ne faut pas faire (risques de doute ou de résultats faux)

**En filmant**
- Ne filme pas avec une caméra qui suit le ballon de très près : les quatre joueurs de champ ne sont pas tous visibles, la forme de l'équipe et la hauteur du bloc ne peuvent pas être jugées (couverture faible). Idéal : trépied en hauteur voyant tout le terrain.
- Évite le zoom, les mouvements brusques, le contre-jour, les joueurs masqués, les replays, les incrustations et les vidéos très compressées ou de faible résolution.
- Évite des tenues presque identiques entre les deux équipes, ou un gardien habillé comme une équipe : le programme posera des questions, mais mieux vaut des tenues distinctes.

**En utilisant le programme**
- Ne désigne pas le mauvais but (« je défends » / « j'attaque ») et ne valide pas le calibrage sans vérifier le tracé du terrain : tout le reste en dépend.
- Marque les zones de banc au bon endroit et indique le bon côté des bancs : sinon, des remplaçants sont comptés comme joueurs ou l'inverse.
- Ne réponds pas aux questions au hasard ni « en masse » : une mauvaise réponse fausse les statistiques et les erreurs. Utilise « ▶ Voir dans la vidéo », et « Mes réponses » pour annuler.
- N'accepte pas une proposition « même personne / même allure » sans l'avoir vérifiée.
- Ne mélange pas deux matchs dans un même projet : la mémoire (tenues, réponses, couleurs de but) est par projet. Refais l'étape des tenues quand elles changent.
- Ne lis pas une consigne « indicative » de la page « Mon plan tactique » comme un verdict : elle repose sur trop peu d'images.

**Règles de conception (pour que le programme n'invente rien)**
- Un indice mesuré (jambes, couleur…) ne décide jamais seul : il déclenche une question, sauf s'il est quasi parfait.
- Un seuil n'est jamais réglé sur les mêmes images que celles qui servent à le juger.
- Un trou (ballon caché, joueur hors champ) n'est jamais comblé : il reste « non analysé ».
- Une déduction est toujours étiquetée comme telle ; un résultat sur peu d'images est dit « indicatif ».
- Les résultats d'un seul match ne sont pas généralisés à un autre.

## 5 quater. Le programme se contrôle lui-même

- **Contrôle qualité** (panneau « Qualité de l'analyse », sous les résultats, et page « Mon plan tactique ») : après chaque analyse, le programme mesure les situations qui la rendent fragile et les dit avec le chiffre et le remède : terrain peu visible (les quatre joueurs de champ ne sont pas tous vus), ballon peu visible, caméra souvent perdue, remplaçants visibles sans zone de banc, gardien vu du mauvais côté (camp inversé), 2e période non marquée, faible résolution, tenues proches, questions en attente. Il ne corrige rien en cachette.
- **Avant de lancer l'analyse** : une liste « prêt / manque » (terrain, tenues, banc, 2e période).
- **Règles verrouillées par des tests** (`tests/invariants.test.js`) : un indice ne décide jamais seul ; poser une question ne modifie rien ; un trou n'est jamais comblé ; pas de ballon fiable = pas d'erreur liée au ballon ; une déduction est étiquetée ; peu d'images = « indicatif » et le score n'est jamais lu ; une réponse ambiguë n'est appliquée à personne ; la mémoire est celle d'un seul projet ; aucune couleur de but inventée ; aucun appel réseau ; aucune promesse de « 100 % ». Si un changement futur viole l'une d'elles, la suite de tests échoue.

## 6. Limites assumées

- Le détecteur est généraliste et ne s'améliore pas avec vos réponses. Un détecteur entraîné (ballon, gardien, buts) demanderait
  des centaines d'images étiquetées et un entraînement dédié : non fait.
- La mémoire est par projet. Une autre salle ou un autre match repart de zéro (c'est voulu : tenues, numéros et salles changent).
- Les résultats restent à valider par le coach : le programme propose, il ne tranche pas à sa place.

## Rôles des personnes écartées du jeu (entraîneur, délégué, soigneur, arbitre, remplaçant, public)
Quand une personne n'est ni joueur ni gardien, tu peux préciser son rôle ; il est retenu dans « Mes réponses » et la personne est retirée du comptage des joueurs. Le programme ne devine jamais ce rôle.

## Indices de gardien : ce qui est mesurable et ce qui ne l'est pas
Mesuré sur de vraies vidéos 1920x1080 : une main de gardien fait environ 10 pixels et bouge vite (flou) ; gants, tape sur les doigts, coudières et genouillères ne sont donc pas lisibles de façon fiable. Le programme ne s'en sert pas et ne prétend pas les reconnaître. Il se base sur la tenue (couleur, pantalon ou short), la position dans la surface et le nombre de joueurs de champ, et te pose la question en cas de doute.

## Contours des personnes (à la place des cadres)
Sur une image arrêtée, pour une question ou pour la session d'étiquetage, chaque personne est entourée de son vrai contour (MobileSAM, hors ligne, 1 à 2 s par image, jamais sur toute la vidéo). Le contour ne contient que la personne : un ballon posé à côté d'un pied n'y est pas. Un clic dans la silhouette désigne la personne ; un clic en dehors désigne le ballon. L'image suivante de la session est préparée pendant que tu réponds. En lecture, ou si la découpe échoue, les cadres de la détection restent affichés : rien n'est inventé. Limite : quand le ballon touche le pied, la découpe peut l'englober.
