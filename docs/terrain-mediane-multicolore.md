# Terrain : ligne médiane de plusieurs couleurs — mesuré sur la vraie vidéo entière, 2026-10-29

## Le problème (vu par John à 01:11, 07:11, 07:22, 08:36 sur `20261019_212111`)
Couleur de lignes choisie : noir. Mais dans cette salle la ligne médiane change de couleur le long d'une même droite : **noir, jaune, rouge, noir**. Le programme ne cherchait que le noir : il ne voyait que le cercle central (un cercle est le même dans tous les sens, il ne donne pas l'orientation) et de petits bouts de médiane. Résultat : tracé décalé, et le message « tracé vérifié sur 99,9 % des positions » était trop généreux (« vérifié » voulait dire « des lignes noires ont été retrouvées », pas « la médiane est juste »).

## Ce qui a été fait
- `src/ai/lignes.js` : la ligne médiane, et elle seule, peut s'appuyer sur d'autres couleurs (noir, jaune, rouge) en plus de la couleur choisie (une seconde carte de traits `Dm`, utilisée seulement pour les points du modèle de la médiane). Les autres lignes restent sur la couleur choisie. Le cercle central (prioritaire) ancre le tracé.
- **Adaptatif** : si la couleur choisie couvre déjà au moins la moitié de la médiane visible, les autres couleurs ne servent pas (salle à lignes d'une seule couleur : rien ne change).
- **Verdict plus strict** (`src/ai/pipeline.js`) : un tracé n'est « sûr » (q = 1 ou 2) que si, quand la médiane est assez visible, au moins 40 % d'elle tombe sur un trait.
- Clé du suivi gardé : préfixe `s3-` (les anciens suivis sont refaits).

## Mesure (suivi de caméra réel de l'application, 0 à 13 min, couleur noire, mêmes calibrages de John)
Vérité : 29 points de la ligne médiane lus à la main sur des images 1920×1080 (instants 71, 110, 160, 210, 431, 442, 516 s) — **± 5 px**, une seule salle, 7 instants : un indice fort, pas une preuve générale. Script : `scripts/mesure/suivi-reel.js` puis `scripts/mesure/terrain-ligne-mediane.js`.

| Instant | Noir seul (avant) | Médiane multicolore, réglage automatique (après) |
|---|---|---|
| 71 s | 12 px | 18 px |
| 110 s | 9 px | 1 px |
| 160 s | 23 px | 5 px |
| 210 s | 7 px | 5 px |
| 431 s (07:11) | 14 px | 9 px |
| 442 s (07:22) | **51 px** (jusqu'à 111) | **10 px** |
| 516 s (08:36) | 11 px | 2 px |
| **Moyenne / pire** | **19,2 px / 111 px** | **7,4 px / 31 px** |

Verdict : « sûr » sur 96,6 % des positions (avant : 99,9 %) ; 92 positions sur 2 671 sont maintenant dites « recalage incertain ». Durée du suivi : 14 min (réglage automatique), 20–23 min dans les premières mesures (PC plus chargé).

## Limites (honnêtes)
- Une seule salle, 7 instants. Aucune autre salle mesurée : **non évalué** ailleurs.
- Le pire écart restant (31 px à 71 s, 1,6 % de la largeur) est encore dit « sûr » : le verdict ne détecte pas tout. 71 s et 03:30 sont un peu moins bons qu'avant.
- Quand la médiane n'est pas visible, le verdict ne peut pas la vérifier.
- Le test synthétique (`tests/lignes-mediane.test.js`) ne montre pas d'avantage net (le noir seul suffit dans une scène simple) : la preuve de l'avantage est la mesure sur la vraie salle ci-dessus.
