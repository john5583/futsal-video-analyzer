# Ballon par images consécutives — première mesure honnête (2026-10-26)

## Pourquoi
Constat de John : « mon œil suit le ballon quand la vidéo tourne, l'IA n'y arrive pas ». Le détecteur actuel regarde chaque image seule ; un flou de mouvement ou un ballon qui ressemble à une marque au sol est ambigu sur une image, pas sur trois images de suite (le ballon est la seule chose qui bouge d'une trajectoire de ballon).

## Ce qui a été construit (dans cette PR)
- Licences vérifiées : `docs/licences-ballon.md` (code MIT ; aucun poids tiers embarqué).
- Outil d'étiquetage assisté sur images consécutives dans l'application (mode « Suivi assisté »).
- Scripts d'entraînement hors application (`scripts/ballon-multi/*.py`, environnement Python isolé `C:\Users\xboxl\futsal-briques\env`) : `associer.py` (dossier d'étiquettes → vidéo), `construire.py` (piles de 3 images t-2, t-1, t autour de chaque image étiquetée), `entrainer.py` (petit réseau en U à 9 canaux d'entrée → carte de chaleur du ballon, évaluation sur une vidéo entière laissée de côté).
- `scripts/mesure/depuis-yolo.js` : convertit les anciens dossiers d'étiquettes du ballon en fichier d'étiquettes noté par `scripts/mesure/score.js`.

## Mesure (une seule expérience)
**Données** : les 4 anciens dossiers d'étiquettes de John (images isolées, 3 par seconde, 443 images avec ballon au total). Pour chaque image étiquetée, les 2 images précédentes sont relues dans la vidéo. **Entraînement** : 20261012_214338 (horizontale, 50 ballons), 20261016_213138 (verticale, 114), 20261016_213002 (verticale, 1) = **165 ballons, 242 images**. **Test** : 20261012_214004, **vidéo entière jamais vue à l'entraînement** (180 images avec ballon, 21 sans). Réseau de ~1 M de paramètres, entraîné **de zéro** (aucun poids tiers), 100 époques, 21 min sur la carte graphique du PC. Tolérance 20 px (échelle 1920), comme la définition de la mesure.

| Sur 20261012_214004 | Ballon retrouvé (rappel) | Faux ballons parmi les affichés | Faux sur images sans ballon |
|---|---|---|---|
| **Détecteur actuel** (analyse existante du projet, `score.js`) | **61,1 %** [53,8 – 67,9] sur 180 | 12 % | 14,3 % |
| **Modèle 3 images, seuil 0,5** | **26,7 %** (48/180) | 70 % | 62 % |
| Modèle 3 images, seuil 0,9 | 18,9 % (34/180) | 69 % | 29 % |

Temps du modèle : 20,9 ms par image (carte graphique, hors décodage) — rapide.

## Conclusion
- **Le modèle à 3 images, appris sur 165 ballons seulement, est bien moins bon que le détecteur actuel** (27 % contre 61 %, beaucoup plus de faux ballons). **Non adopté, rien n'est changé dans l'analyse.**
- Ce n'est **pas** une preuve que l'approche est mauvaise : 165 exemples, deux salles seulement, des images espacées de 0,33 s (le modèle n'a jamais vu le même ballon sur des images voisines à l'entraînement), aucune pré-formation, aucun réglage. C'est la preuve que **le goulot est la quantité et la variété des étiquettes**, pas l'outil d'entraînement.
- Référence du détecteur actuel : issue des analyses déjà présentes dans les projets (version et réglages de l'époque non garantis identiques à la version actuelle) ; la mesure est faite sur les mêmes images étiquetées. Le détecteur spécialisé du ballon a pu voir ces images à son entraînement (optimiste pour lui).

## Ce qu'il faut pour reprendre (écart jusqu'à 95 %)
1. **Des séquences d'images consécutives étiquetées** avec le mode « Suivi assisté » (plusieurs vidéos : horizontale, verticale, sol bleu, sol jaune). Quantité nécessaire : inconnue ; ordre de grandeur à viser pour un premier essai sérieux : plusieurs milliers d'images consécutives par type de salle. Temps de John : à mesurer (le programme l'affiche).
2. Une **vidéo laissée de côté** entière par salle, étiquetée à l'aveugle (`docs/definition-mesure.md`).
3. Les règles de jeu (ballon près des joueurs, hors gradins, trajectoire physique — `balltrack.js`) n'ont **pas été testées** avec ce modèle : non évalué.
4. L'écart entre le niveau actuel (45–61 %) et l'objectif (95 % avec 3 % de faux ballons) reste **entier** : aucune brique mesurée ne le comble aujourd'hui.
