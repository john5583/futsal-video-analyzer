# Cahier des charges de référence — Futsal Analyzer

Document écrit avec les mots de John, validé par lui le 2026-10-26. C'est la **référence unique** : chaque mission relit ce document au départ, et chaque PR dit explicitement quels points elle touche et ce qui a été **mesuré** (sinon : « non évalué »).

## 1. But
Une application **hors ligne** qui analyse les vidéos de futsal **comme un vrai coach**.

- Fiabilité visée : **95/100 minimum**, mesurée sur un match **jamais vu** : ballon visible à l'œil, identités affichées, faux ballons ≤ 3 %.
- **Fonctionnel à 100 %, sans bug, sans conflit, sans message d'erreur.** Non négociable.
- **Rien n'est inventé.** Au moindre doute réel : « inconnu » ou « non évalué », jamais une fausse certitude.
- Ne jamais promettre un chiffre non mesuré. Les chiffres viennent de vidéos jamais vues au réglage.

## 2. Ce que le programme trouve tout seul
Le programme trouve **lui-même** tous ses repères, comme un vrai coach : terrain, équipes, gardiens, arbitre, bancs et remplaçants, sens du jeu, ballon.

- Il ne pose une question qu'en cas de **vrai doute**. Un doute sur un cas évident (par exemple un joueur de la même tenue qu'un joueur déjà classé) est un défaut : un test doit l'empêcher de revenir.
- **Toute réponse de l'utilisateur est appliquée et conservée** dans le projet. Elle n'est jamais reposée.
- **Chaque personne a sa fiche** dans le projet (tenue par zones, numéro si lisible, taille et silhouette relatives, accessoire stable, rôle, historique d'entrées et de sorties).
- **Chaque personne identifiée est reconnue tout au long de la vidéo** (même après une coupure, un masquage, un passage au banc). En cas de doute : « non identifiée », jamais une fausse étiquette.
- La mémoire est **par projet seulement**.

## 3. Le terrain
- Tracé **continu**, collé aux **vraies lignes**, lié aux éléments choisis au calibrage (cercle central, etc.).
- Le programme retrouve **la couleur de lignes choisie par l'utilisateur**, sur **n'importe quelle salle**, même avec plusieurs couleurs de lignes. Un profil de terrain par projet (couleur, dimensions, calibrage), jamais réutilisé en silence d'un projet à l'autre.
- Calibrage **précis** (zoom, loupe). Aucune action ne doit exiger un « instant déjà analysé » : le terrain est connu à tout instant suivi.
- Le terrain incertain est **signalé** (« recalage incertain »), jamais dessiné comme s'il était sûr.

## 4. L'affichage
- Les joueurs sont montrés en **silhouette ultra précise** ou, à défaut, en **cercle au sol**. **Jamais de cadre.**
- Une silhouette n'est affichée que si elle est fiable. Sinon : cercle au sol, jamais une silhouette fausse.
- La **vue du dessus** et la **vidéo** sont **toujours en parfaite harmonie** : les deux **bougent en même temps, en parallèle**. Pas de vidéo à l'arrêt avec la vue du dessus qui continue, ni l'inverse. Même instant, même image, en lecture, en pause, en saut et au ralenti.

## 5. Façon de travailler
- L'étiquetage se fait **dans l'application installée**, au rythme de l'utilisateur.
- **Une seule mise à jour** après un lot de changements, pour que l'utilisateur teste lui-même.
- **L'utilisateur ne bricole pas.** Le programme et l'équipe font le travail ; l'utilisateur répond à des questions précises.
- Une branche par sujet, une PR par sujet, tests unitaires et e2e verts, jamais de poussée sur `main`, jamais de force push.
- Chaque PR mesure avant/après ce qu'elle prétend améliorer, liste ses limites, et dit « non évalué » plutôt que d'inventer.

## 6. Preuves attendues (checklist de PR)
Chaque PR répond, point par point, à ceci :

- [ ] Quels points de ce document sont touchés ?
- [ ] Qu'est-ce qui a été **mesuré** (avant/après, sur quelle vidéo, jamais vue au réglage si possible) ?
- [ ] Aucun message d'erreur affiché à l'utilisateur ?
- [ ] Les réponses de l'utilisateur sont-elles appliquées et conservées ?
- [ ] La vidéo et la vue du dessus restent-elles synchrones (§4) ?
- [ ] Qu'est-ce qui est « non évalué » ou ne marche pas encore ?

## 7. Chantiers ouverts (état au 2026-10-26)
- Ballon : ≈ 45–61 % retrouvé selon la mesure ; l'objectif est 95/100. Aucune brique externe testée ne fait mieux (PnLCalib, SigLIP, TrackNet V3 écartés). Un entraînement demande des images consécutives étiquetées.
- Identités par personne : registre des personnes à construire et à mesurer.
- Questions « Qui est-ce ? » sur des cas évidents : correction en cours.
- Bancs et remplaçants : non reconnus automatiquement sur 20261019_212111 pour l'instant.
- Silhouettes ultra précises : à mesurer (contour, pas de débordement, pas de manque).
- Vue du dessus synchrone avec la vidéo : à vérifier en lecture, en pause et en saut, puis à corriger.
- Un 10–15 min jamais vu est nécessaire pour mesurer honnêtement l'erreur et les entrées/sorties.
