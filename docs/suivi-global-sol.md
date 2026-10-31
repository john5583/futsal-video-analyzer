# Suivi global du sol (`src/ai/sol-global.js`)

**Pourquoi** : le suivi image par image dérive, et le suivi « en direct » perd le terrain après un balayage rapide ou un long passage sans lignes. Ici toute la vidéo est traitée hors ligne (4 images/s, 480×270) : les images clés sont raccordées entre elles sur les lignes du sol (toutes couleurs) et par des liens ORB cherchés sans prédiction, chaque lien n'étant gardé que si les lignes d'une image retombent sur celles de l'autre.

**Verdicts** :
- « ok » : les lignes de l'image, reportées dans au moins 2 images éloignées dans le temps, retombent sur de vraies lignes (≥ 85 %). Tracé vérifié (q = 2).
- « pont » : passage « incertain » encadré par deux images « ok » ; position reliée par le suivi image à image depuis chaque bord, gardée seulement si les deux estimations s'accordent à 4 px près (sur 480). Un peu moins précis (q = 1).
- « incertain » : rien n'est tracé (jamais inventé).

**Où c'est branché** : `pipeline.suiviSolGlobal` (lecture de la vidéo + conversion vers le format du suivi), `solGlobalFs.js` + `src/ai/sol-global-worker.js` (fichier temporaire + fil de calcul, processus principal), `ai-ui.lanceSolGlobal` (arrière-plan, après le suivi classique).

**Mesuré le 2026-10-31 sur `20261019_212111.mp4` (13 min 20, une seule vidéo, 3 261 images, calcul 24 min, processeur seul)** :
- Tracé : 93,3 % d'images « ok » + 3,7 % « pont » = 97,0 % ; 3,0 % non tracées (2–7 s, 567–577 s, 597–607 s).
- Rond noir (trait fin), sur les 233 images « ok » où au moins 28 % du rond est dans l'image : 94,8 % à ≤ 3 px, 98,7 % à ≤ 5 px (px sur 960 de large ; pire écart 6,6 px).
- Autres traits noirs (mémoire construite sans les ±20 s), 262 images « ok » testables : 97,3 % à ≤ 3 px, 100 % à ≤ 4 px.
- « Pont » : simulé en cachant des passages de 20 / 39 / 59 images : 99 / 93 / 83 % à ≤ 5 px (960) après contrôle d'accord ; vrai passage de 25 s (692–717 s) : détection indépendante du rond à 5,8 px.
- Estimation sur TOUTES les images : environ 95 à 96,6 % à ≤ 5 px (960) ; à ≤ 3 px environ 91 à 93 % (le seuil de 95 % n'y est pas atteint).

**Limites** : une seule vidéo ; 41 % des instants échantillonnés n'ont pas de rond dans l'image (précision seulement par les autres traits noirs et la cohérence des lignes) ; masque du sol réglé pour un sol bleu (`masqueSolBleu`) ; le taux de traits retrouvés du verdict est peu sensible (≈ ± 4 à 6 px sur 960) ; images de 480×270 (une vidéo non 16:9 est étirée, la géométrie plane reste valable).
