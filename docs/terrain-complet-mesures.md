# Terrain complet : méthode et mesures (2026-11-01, une seule vidéo : `20261019_212111.mp4`, 817 s)

## Ce qui a été découvert (mesuré)
- **La caméra est fixe dans la salle, elle ne fait que tourner** : la pose tirée de l'ellipse du rond noir, image par image, donne une distance au centre du rond de 11,48 à 11,58 m et une hauteur de 3,82 à 3,91 m (q10–q90 sur 66 images indépendantes, de 80 à 700 s).
- **Le champ de vision change** : 91° de 70 s à la fin, **≈ 62° pendant la première minute** (zoom plus serré) ; le changement se fait vers 66–69 s (à 64–65 s le rond apparaît deux fois plus grand). C'est ce qui cassait le suivi global (« rond hors champ », première minute « incertaine »).
- **Le calibrage de John (13 clics à 2,2 s) se reproduit à 1,9 px (sur 480 de large)** avec la caméra fixe, un champ de 62° et l'orientation « but gauche = côté +v » ; la meilleure autre orientation donne 61,8 px. Cela donne l'orientation du terrain sans autre question.
- **Les 33 buts confirmés par John** tombent sur une droite passant par le centre du rond (axe du terrain), à 19,75–21,75 m du centre (convention du cadre étiqueté : bas du cadre) → longueur ≈ 41–42 m, **non confirmée** (40 m par défaut dans le programme).

## Ce que fait le programme (src/ai/terrain-auto.js, après le suivi global)
1. Détecte le rond (ellipse, RANSAC), en tire la pose de la caméra (champ 91°).
2. Contrôle chaque seconde avec **deux preuves indépendantes** : le rond projeté tombe sur un vrai trait noir ET les lignes du sol (mosaïque dans le repère du terrain, bâtie sur d'autres blocs de 20 s, jamais sur l'image elle-même) concordent (≥ 0,70). Remise sur le rond (similitude) et recalage par la mosaïque si besoin.
3. Images restantes : localisation directe contre la mosaïque (cap, inclinaison, roulis ; champ cherché si zoom différent) ; ponts de ≤ 4 s entre deux images vérifiées dont les corrections s'accordent ; contrôle final contre la mosaïque des images finales (< 0,60 → « non analysé »).
4. Troisième preuve (dans l'interface, si le détecteur de buts est disponible) : le but détecté doit tomber là où la pose le place (≤ 60 px sur 1920) ; sert à promouvoir les images « probables » et de **veto** (> 70 px + 20 % de la largeur du cadre → « non analysé »).
5. Niveaux : **vérifié** (q = 2, ou 1 pour un pont), **probable** (q = 0, tracé à confirmer par « Oui, le tracé est juste »), **non analysé** (rien n'est tracé). Rien n'est jamais inventé.

## Résultat sur la vidéo d'essai (816 secondes, rien exclu)
| | secondes | part |
| --- | --- | --- |
| vérifié (deux preuves, + but) | 742 | **90,9 %** |
| probable | 4 | 0,5 % |
| non analysé | 70 | 8,6 % |

Sans la troisième preuve (deux preuves seulement) : 721 vérifiées (88,4 %), 40 probables, 55 non analysées ; avec la promotion et le veto du but : 742 / 4 / 70 comme ci-dessus.

**Précision indépendante** (31 buts étiquetés par John, pieds du but, px sur 1920, à 20 m de la caméra ; la convention du cadre étiqueté donne un biais constant d'environ 21–30 px) : médiane 31 px, troisième quartile 63 px ; **7 buts sur 31 à plus de 70 px** (dont 1 étiquette inutilisable : cadre de 35 px de large). Près de la caméra (rond, médiane), le tracé est exact à l'œil (rond sur le rond noir, médiane sur la vraie ligne jusqu'à son bout noir). **Le champ lointain est faux d'environ 1,5 à 4 m sur environ un cinquième des images vérifiées.**

## Limites (à lire avant de citer un chiffre)
- **95 % n'est pas atteint** : 90,9 % vérifié sur cette vidéo ; la troisième preuve est **optimiste ici** (le détecteur de buts a été entraîné avec des images de cette même vidéo ; sur une salle jamais vue il retrouvait 12 buts sur 68).
- Une seule vidéo, une seule salle ; la caméra est supposée fixe (à vérifier sur une autre vidéo : le programme recalcule la pose du rond pour chaque vidéo et rend « Rond central noir introuvable » sans rond noir, auquel cas l'ancienne méthode reste utilisée).
- Longueur 40 m et largeur 20 m par défaut ; la longueur mesurée (≈ 41–42 m) n'est pas appliquée sans l'accord de John.
- Durée de calcul ≈ 10 minutes en plus des ≈ 31 minutes du suivi global (arrière-plan).

## Outils de mesure
`tools/terrain-complet/` (scripts hors programme, chemins en dur). Tests du module : `tests/terrain-auto.test.js` (11 tests).
