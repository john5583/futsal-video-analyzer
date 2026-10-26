# Terrain : une seconde couleur de lignes ? (étape 3) — mesuré, **non adopté**, 2026-10-26

## Le problème
Sur `20261019_212111` le terrain choisi en **noir** n'a que le cercle central (et un bout de ligne médiane) à se « coller » dessus ; la ligne médiane est **jaune** (puis rouge, puis noire en bas), les touches jaunes. D'où le décalage vu par John à 01:11.

## Ce qui a été essayé
Une **seconde couleur** de lignes s'ajoutant à la première (union des deux cartes de lignes) : code écrit et testé (carte à deux couleurs, bouton « Ajouter une seconde couleur », clé du suivi), puis **retiré de cette PR** parce que la mesure l'a démenti (ci-dessous).

## Mesure (suivi de caméra réel de 0 à 215 s sur 212111, dans l'application, mêmes calibrages de John)
Vérité de terrain **lue à la main** par moi sur 4 images (71, 110, 160, 210 s, grille de 100 px sur l'image 1920×1080) : 15 points sur la ligne médiane jaune. Mesure : distance (px, échelle 1920) entre ces points et la ligne médiane du terrain tracé par le suivi (`scripts/mesure/terrain-ligne-mediane.js`). Mes lectures valent ± 3 px ; **15 points, 4 instants, une seule salle : c'est un indice, pas une preuve.**

| Couleur(s) utilisée(s) | Écart moyen | Pire écart | Détail par instant (71 / 110 / 160 / 210 s) | Lignes acceptées / essais |
|---|---|---|---|---|
| Noir seul (état actuel) | **13,0 px** | 38 px | 12 / 9 / 23 / 7 | 193 / 221 |
| **Noir + jaune** (seconde couleur) | **68,2 px** | **285 px** | **232** / 25 / 3 / 2 | 197 / 221 |
| **Jaune seul** | **8,6 px** | 26 px | 7 / 6 / 14 / 7 | 167 / 221 |

## Conclusion
- **La seconde couleur (union) est pire** : à 71 s le tracé s'accroche à de mauvaises lignes (285 px d'écart, au-delà de ce qu'on tolérerait) parce que la salle a beaucoup de lignes jaunes d'autres sports. Les lignes jaunes aident quand le recalage est bon (160 s : 3 px, 210 s : 2 px) mais le risque d'un décrochage grave est inacceptable. **Non adopté ; aucun changement dans l'application.**
- **Pour cette salle, choisir le jaune comme couleur des lignes donne un tracé plus proche** (8,6 px contre 13,0 px en moyenne, pire cas 26 px contre 38 px) — mais le suivi est plus lent (447 s contre 316 s) et accepte moins de lignes (167 contre 193). Aujourd'hui le programme propose la couleur par clic (« Montrer une ligne en cliquant dessus ») : John peut donc déjà montrer une ligne **jaune**.
- Pas de preuve que « jaune » soit mieux dans les autres salles ; la salle de 212111 est la seule mesurée. Pas de changement de comportement automatique proposé ici.

## Non évalué
Autres salles et autres couleurs ; une vraie sélection par ligne (chaque ligne du modèle associée à sa propre couleur au lieu d'une union, qui éviterait que les lignes jaunes d'un autre sport comptent pour la ligne médiane) ; la ligne médiane rouge du bas ; l'instant 01:11 précis vu par John (non remesuré à l'identique).
