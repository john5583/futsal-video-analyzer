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
