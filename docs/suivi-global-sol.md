# Suivi global du sol (`src/ai/sol-global.js`)

> **Correction (2026-11-01)** : le « 95,6 % » ci-dessous reposait sur un rond de référence réajusté sur le suivi lui-même, et le suivi marquait « ok » des images fausses (audit par le rond : ≈ 12 à 14 % des secondes décalées ; 480–496 s : rond à x ≈ 400 au lieu de 117). Le suivi global est désormais CONTRÔLÉ par l’identification du terrain (`src/ai/terrain-auto.js`, voir `docs/terrain-complet-mesures.md`) : vérifié 90,9 % des secondes, probable 0,5 %, non analysé 8,6 % sur la vidéo d’essai ; le champ de vision change vers 66 s (≈ 62° avant, 91° après), ce qui cassait la première minute.


**Pourquoi** : le suivi image par image dérive, et le suivi « en direct » perd le terrain après un balayage rapide ou un long passage sans lignes. Ici toute la vidéo est traitée hors ligne (4 images/s, 480×270) : les images clés sont raccordées entre elles sur les lignes du sol et par des liens ORB cherchés sans prédiction, chaque lien n'étant gardé que si les lignes d'une image retombent sur celles de l'autre.

**La couleur choisie prime** : la carte de lignes donne trois fois plus de poids à la couleur choisie (rare, non répétitive) qu'aux autres lignes (nombreuses et parallèles : un décalage de plusieurs lignes « paraît bon »). Un lien ou une position est refusé si, quand la couleur choisie est assez visible dans les deux images, elle ne retombe pas sur elle-même.

**Verdicts** :
- « ok » : les lignes et la couleur choisie de l'image, reportées dans au moins 2 images éloignées dans le temps, retombent sur de vraies lignes. Tracé vérifié (q = 2).
- « pont » : image encore « incertain » dont la position est obtenue en la reliant par le suivi image à image aux images « ok » les plus proches (≤ 40 images), puis soumise au MÊME contrôle (q = 1). Sinon elle reste « incertain ».
- « incertain » : rien n'est tracé (jamais inventé).

**Où c'est branché** : `pipeline.suiviSolGlobal` (lecture de la vidéo + conversion vers le format du suivi), `solGlobalFs.js` + `src/ai/sol-global-worker.js` (fichier temporaire + fil de calcul, processus principal), `ai-ui.lanceSolGlobal` (arrière-plan, après le suivi classique).

## Mesuré le 2026-10-31 sur `20261019_212111.mp4` (13 min 20, une seule vidéo, 3 261 images, calcul ≈ 31 min, processeur seul)

Tracé : 93,0 % d'images « ok » + 4,1 % « pont » = 97,1 % ; 3,2 % non tracées (surtout 2–66 s, début de vidéo).

**Chaque instant testé (un toutes les 2 s, 406 instants), sans exclure aucune image**, par rapport aux vrais traits noirs (px sur 960 de large) :

| preuve | instants | part |
| --- | --- | --- |
| rond noir, écart médian ≤ 3 px | 360 | 88,7 % |
| rond noir, 3–5 px | 8 | 2,0 % |
| autres traits noirs (mémoire hors ±20 s), 3–5 px | 20 | 4,9 % |
| rond noir, 5–8 px | 5 | 1,2 % |
| non tracé | 13 | 3,2 % |
| tracé sans preuve, ou écart > 8 px | 0 | 0 % |

→ **tracé et vérifié à ≤ 5 px : 95,6 %** (388 / 406 ; marge statistique d'environ ± 2 points) ; à ≤ 8 px : 96,8 % ; **à ≤ 3 px : 88,7 %** (360 / 406, plus une part inconnue parmi les 20 instants vérifiés seulement par la mémoire noire).

Contrôle à l'œil : 54 + 18 images tirées au hasard avec le rond en pointillés sur un recadrage : une seule fausse sur la première série (passage 554–567 s, supprimé depuis), 18 / 18 correctes sur la seconde.

## Limites
- Une seule vidéo ; instants échantillonnés (un sur 8 images), pas toutes les images.
- Le rond est appris à la main pour ces mesures (`circle.json` des outils de mesure) : le programme lui-même ne l'utilise pas encore pour vérifier ; la vérification interne reste « lignes + couleur choisie vers 2 images éloignées ».
- Masque du sol réglé pour un sol bleu (`masqueSolBleu`).
- Pas testé dans l'application avec les calibrages de John (hors fil de calcul et test de bout en bout).
- Le solveur est sensible : retirer 7 liens a une fois fait s'effondrer l'ajustement ; un ajustement « court → long » a été essayé et est pire.
