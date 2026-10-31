# Suivi global du sol (`src/ai/sol-global.js`)

**Pourquoi** : le suivi image par image dérive, et le suivi « en direct » perd le terrain après un balayage rapide ou un long passage sans lignes. Ici toute la vidéo est traitée hors ligne (4 images/s, 480×270) : les images clés sont raccordées entre elles sur les lignes du sol (toutes couleurs) et par des liens ORB cherchés sans prédiction, chaque lien n'étant gardé que si les lignes d'une image retombent sur celles de l'autre.

**Verdict par image** : « ok » seulement si les lignes de l'image, reportées dans au moins 2 images éloignées dans le temps, retombent sur de vraies lignes (≥ 85 %). Sinon « incertain » : **rien n'est tracé** (jamais inventé). L'interface n'utilise que les images « ok » (plus les positions déjà vérifiées par l'ancien suivi, q = 2).

**Où c'est branché** : `pipeline.suiviSolGlobal` (lecture de la vidéo + conversion vers le format du suivi), `solGlobalFs.js` + `src/ai/sol-global-worker.js` (fichier temporaire + fil de calcul, processus principal), `ai-ui.lanceSolGlobal` (lancé en arrière-plan après le suivi classique).

**Mesuré le 2026-10-31 sur `20261019_212111.mp4` (13 min 20, une seule vidéo)** :
- 3 261 images, 93,1 % « ok », calcul 24 min (processeur seul).
- Rond noir (trait fin, référence physique) : sur les 236 images où il est dans l'image selon le suivi, 94,9 % à ≤ 3 px et 98,7 % à ≤ 5 px (sur 960 de large) ; pire écart 6,6 px. 166 images sur 406 : rond hors image, donc non testables par le rond.
- Détections indépendantes du rond (ajustement d'ellipse sur l'image seule) : les deux qui s'écartent beaucoup sont marquées « incertain ».
- **Limites** : une seule vidéo ; masque du sol réglé pour un sol bleu (`masqueSolBleu`, autre sol = autre masque à fournir) ; le « taux de traits retrouvés » du verdict est peu sensible (≈ ±4 à 6 px sur 960), seul le rond est précis ; images de 480×270 (une vidéo non 16:9 est étirée, la géométrie plane reste valable).
