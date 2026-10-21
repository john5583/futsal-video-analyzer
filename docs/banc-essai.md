# Banc d'essai : mesurer ce que le programme fait vraiment

Le banc d'essai relance l'analyse **dans l'application réelle** sur des vidéos que tu as déjà, puis écrit des mesures. Il sert à comparer
avant / après chaque changement du programme, **sans rien te demander vidéo par vidéo**. Il ne modifie jamais tes projets (il travaille sur des copies).

## Lancer
Depuis le dossier du programme (l'application s'ouvre et se ferme toute seule pendant la mesure) :

```
node scripts/banc-essai.js --dossier "C:\Users\xboxl\OneDrive\Desktop\vidéo match\LCN"
```

Chaque vidéo doit avoir un projet du même nom (`20261019_212111.mp4` + `20261019_212111.fsal`) : le calibrage et les tenues viennent de ce projet.

| Option | Effet |
|---|---|
| `--rapide` (par défaut) | un extrait de `--duree` secondes (180 par défaut), à partir du premier calibrage |
| `--complet` | la vidéo entière (plusieurs minutes de calcul par minute de vidéo) |
| `--video nom` | seulement cette vidéo (répétable) |
| `--etiquettes nom=dossier` | mesure aussi le ballon sur les images que tu as étiquetées (dossier contenant `labels\balle_<millisecondes>.txt`) |
| `--repeter` | refait chaque mesure deux fois pour vérifier qu'elle est répétable |
| `--sortie dossier` | où écrire (par défaut `C:\Users\xboxl\futsal-bancs`, hors du dépôt) |

Résultat : un dossier daté avec un fichier `.json` par vidéo et un `resume.txt` lisible.

## Comparer avant / après
Après un changement du programme, relance la même commande, puis :

```
node scripts/banc-essai.js --comparer avant\20261019_212111.json apres\20261019_212111.json
```

Chaque mesure est notée « mieux », « moins bien » ou « identique ». Aucun seuil n'est fixé : c'est à toi de juger si l'écart compte.

## Ce que les mesures disent (et ne disent pas)
- **Couverture** : part du temps réellement analysée, caméra perdue, jeu fiable.
- **Pistes** : nombre d'identifiants par équipe comparé aux 5 joueurs attendus. Un nombre très supérieur à 1 veut dire que les joueurs sont perdus puis recréés. C'est un **indice**, pas la preuve d'une confusion.
- **Déplacements** : vitesses et accélérations. Détecte l'impossible, pas l'erreur plausible. Les repères 9 m/s et 6 m/s² sont des ordres de grandeur.
- **Ballon** : part des images avec un ballon retenu, et rappel sur tes images étiquetées (ballon à moins de 1 m de l'étiquette, projetée sur le terrain).
- **Ne mesurent pas** : la justesse des erreurs tactiques ni l'identité réelle d'un joueur (aucune vérité de terrain pour ça). Ces points se jugent en regardant des extraits.
- Les mesures de l'extrait « rapide » ne valent que pour cet extrait.
- **Compare des mesures faites dans la même session** (même jour, même ordinateur, sans redémarrage entre les deux). Mesuré : sur une vidéo où la caméra décroche, deux passages de suite sont identiques, mais un passage fait après un redémarrage de l'ordinateur a donné des chiffres légèrement différents avec le même code (carte graphique ou décodage vidéo). Pour juger un changement, refais aussi la mesure « avant » juste avant la mesure « après ».
- Le script a besoin du module `playwright-core` (installé avec `npm install --no-save playwright-core`, il n'est pas dans `package.json`).

## Analyse continue : mesures supplémentaires
- **Cadence** : images par seconde réellement obtenues (écart entre images consécutives), et **trous** (écart de plus de 1,5 fois l'écart normal : images perdues). Une analyse continue à 30 images/s doit afficher environ 30 images/s et 0 trou.
- **Déplacements en fenêtres de 1 s** : vitesses et accélérations calculées sur 1 seconde, donc comparables entre 3 et 30 images/s. La mesure « image par image » gonfle les accélérations à 30 images/s (bruit de position), elle ne se compare pas d'une cadence à l'autre.
- Les mesures à 30 images/s **ne se comparent pas directement** à la mesure de départ faite à 3 images/s : compare des analyses de même cadence, ou utilise les fenêtres de 1 s.

## Autres outils
- `node scripts/mesure-lecture.js --projet x.fsal --video x.mp4 [--debut 20] [--secondes 10]` : mesure, dans l'application réelle, quelle façon de lire la vidéo ne perd aucune image, et combien coûtent la détection et le suivi de la caméra par image. Les temps varient d'un passage à l'autre (jusqu'à 50 % observé) : refais-la à vide avant de comparer.
- `node scripts/banc-synthetique.js [--scenes realiste,tenuesProches] [--cadences 3,10,30] [--matchs 6] [--graine 101]` : matchs fabriqués à identités connues, pour compter exactement les échanges de joueurs. Les trajectoires ne dépendent pas de la cadence (même match vu à 3 ou à 30 images/s).
