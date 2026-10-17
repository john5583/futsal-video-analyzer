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

Une question sans réponse reste **non analysée** : elle n'entre ni dans les statistiques ni dans le rapport.

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

## 6. Limites assumées

- Le détecteur est généraliste et ne s'améliore pas avec vos réponses. Un détecteur entraîné (ballon, gardien, buts) demanderait
  des centaines d'images étiquetées et un entraînement dédié : non fait.
- La mémoire est par projet. Une autre salle ou un autre match repart de zéro (c'est voulu : tenues, numéros et salles changent).
- Les résultats restent à valider par le coach : le programme propose, il ne tranche pas à sa place.
