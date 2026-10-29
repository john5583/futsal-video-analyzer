# Licences des briques pour le ballon par images consécutives (vérifiées le 2026-10-26)

Règle de John : rien n'est livré dans l'application si la licence l'interdit ; l'entraînement hors application et l'usage d'une **méthode** (pas du code) restent possibles. L'application elle-même n'a pas de licence déclarée (UNLICENSED).

| Brique | Dépôt | Licence du **code** (lue sur GitHub) | Poids pré-entraînés / données | Décision |
|---|---|---|---|---|
| WASB-SBDT (BMVC 2023) | `nttcom/WASB-SBDT` | **MIT** (© 2023 NTT Communications) | poids sur Google Drive, entraînés sur des jeux publics (tennis, football, badminton…) dont les conditions propres ne sont **pas** vérifiées | **Méthode et architecture utilisables.** On n'embarque **aucun poids tiers** : on entraîne nos propres poids sur les étiquettes de John. Si du code MIT est copié, sa mention de droit d'auteur est conservée (`THIRD-PARTY.md`). |
| TOTNet | `AugustRushG/TOTNet` | **MIT** | jeu TTA « à usage de recherche uniquement » (accord de diffusion) ; poids dans le dépôt non vérifiés | **Méthode utilisable ; ne pas utiliser le jeu TTA ni ses poids.** |
| TrackNetV4 | `TrackNetV4/TrackNetV4` | **MIT** | non vérifiés | Méthode utilisable ; mêmes réserves. |
| TrackNetV3 (déjà testé) | voir `RAPPORT-BRIQUES.md` | pré-entraîné : 6 ballons retrouvés sur 344 (1,7 %) sur nos vidéos | — | non adopté |

Ce que cela permet : entraîner **notre** modèle à plusieurs images (architecture de type TrackNet/WASB) dans l'environnement Python isolé (`C:\Users\xboxl\futsal-briques\env`), exporter en ONNX pour l'application, car (1) le code d'origine est sous licence MIT et (2) les poids sont les nôtres, appris des seules étiquettes de John.
Ce que cela n'autorise pas : embarquer un poids tiers dont la licence ou les conditions du jeu d'entraînement n'ont pas été lues.
Limite : la licence MIT du code ne dit rien sur les jeux de données ; seuls les étiquettes de John (et ses vidéos) servent à l'entraînement.
