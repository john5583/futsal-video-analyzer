# Document de reprise — Futsal Analyzer (état au 2026-10-26, soir)

À lire en premier par toute nouvelle conversation ou session. Les faits ci-dessous ont été vérifiés sur GitHub le 2026-10-26 vers 21 h (UTC). Rien n'est inventé : ce qui n'est pas vérifié est dit.

## 1. Le projet en une phrase
Application Windows hors ligne (Electron) qui analyse des vidéos de futsal « comme un vrai coach ». Référence unique des demandes de John : `docs/cahier-des-charges.md`. Règles : zéro bug, zéro message d'erreur affiché, rien d'inventé (« inconnu » / « non évalué » quand ce n'est pas sûr), score visé 95/100 mesuré sur un match jamais vu.

## 2. Comment on travaille
- **John** colle des messages dans Claude Code (PowerShell, fenêtre « Projet futsal analyser », mode auto). Il ne doit pas « bricoler » : le programme et les assistants font le travail.
- **Claude Code (sur le PC de John)** code, mesure, teste, pousse des branches et ouvre des PR. Jamais de poussée sur `main`, jamais de force push.
- **L'assistant cloud** lit les PR, vérifie les tests GitHub, fusionne (squash) quand c'est vert, puis publie une version : GitHub → Actions → « Futsal Analyzer — installeur Windows » → branche `main`, `version` = `1.x.y` sans « v » ni espace. Attendre le CI de `main` vert avant de publier.
- **Avertissement appris à la dure** : les rappels programmés (`send_later`) ne sont pas fiables. Utiliser des surveillances en arrière-plan (Bash, `until … sleep`, timeout jusqu'à 2 h), et ne jamais s'y fier seul.
- Chaque test e2e complet sur GitHub dure 25 à 60 minutes. Éviter les allers-retours : rejouer tous les groupes en local avant de pousser, et pouvoir lancer un seul groupe sur GitHub.
- Mémoire du PC limitée : un seul processus Electron lourd à la fois.

## 3. Fait et publié (dernière version : 1.12.1)
- Terrain recalé sur les vraies lignes de la couleur choisie (suivi par pose de caméra), couleur gardée par projet, dérive bornée (PR #40).
- Banc marquable à tout instant, sans message d'erreur (#41).
- Plus de « Qui est-ce ? » sur une personne à la tenue nette : la règle « cinq joueurs » comptait des pistes au lieu de personnes (#44).
- Terrain identifié par projet : couleur montrée en cliquant, confusion mesurée, dimensions proposées, profil par projet (#43).
- Analyse complète sur le suivi recalé : 403 s au lieu de 1672 s, moins de positions hors terrain (#45).
- Cahier des charges de référence (#42).

## 4. En cours : cinq PR empilées, NON fusionnées
Ordre de fusion : #47 → #48 → #49 → #50 → #51 (chacune est recentrée sur `main` quand la précédente est fusionnée ; changer sa base avec `update_pull_request` si besoin).
- **#47 audit-zero-defaut** — test e2e qui clique tous les écrans (4 groupes), boutons morts / grisés sans explication corrigés. Historique des tests GitHub : 3 échecs sur de vrais défauts (corrigés : « Placer sur l'image », bouton « Auto » des tenues, « Ouvrir le dossier » et annulations d'export sans retour visible), puis un échec au **groupe 4 dans la préparation du test** (ffmpeg, `derive` ~ligne 204 de `tests/e2e/audit-zero-defaut.js` : la vidéo source `essai.mp4` n'existe pas dans ce dossier temporaire). **Reste à faire** : chaque groupe fabrique sa propre vidéo, afficher la vraie erreur ffmpeg, rejouer en local en dossier vide, ajouter au workflow la possibilité de lancer un seul groupe, relancer le CI. Branche à la date : commit `d9899e5`, rien poussé depuis.
- **#48 mesure-95** — `docs/definition-mesure.md` (score sur 100 avec intervalle de Wilson, borne basse ≥ 93 % pour « 95 prouvé »), `scripts/mesure/score.js`, **Contrôle rapide O / N / ?** dans l'application (Fichier > Contrôle rapide, Ctrl+K).
- **#49 ballon-suivi-assiste** — licences vérifiées (WASB-SBDT, TOTNet, TrackNetV4 : code MIT, on n'embarque aucun poids tiers), étiquetage assisté « Suivi assisté » (un clic, suivi à 30 images/s, arrêt quand pas sûr). Un premier entraînement de modèle multi-images a été lancé en local : résultat **non encore lu**.
- **#50 identites-registre** — registre des personnes, « non identifiée » plutôt qu'une fausse étiquette. **Objectif NON atteint** : sur la vidéo de 13 min, 400 pistes → 242 personnes (36 sûres, 205 non identifiées) pour une dizaine de personnes réelles. Il manque la lecture du numéro de maillot et la tenue par zones.
- **#51 terrain-seconde-couleur** — mesure seulement : noir + jaune est pire (68,2 px contre 13,0 px) ; jaune seul donne 8,6 px mais un suivi plus lent. Pas adoptée.

## 5. Ce qui reste à faire (ordre proposé)
1. Débloquer #47 (groupe 4), fusionner la pile, publier **1.13.0** (audit, Contrôle rapide, étiquetage assisté, panneau « Personnes reconnues »).
2. **Ballon** : lire le résultat du premier entraînement, étiqueter des séquences consécutives (outil #49), entraîner, mesurer sur une vidéo entière jamais vue. Point faible principal : ≈ 45-61 % retrouvé, faux ballons ≈ 28 %, objectif 95 % non atteint, aucun résultat publié sur le futsal en salle.
3. **Identités** : lecture du numéro de maillot, tenue par zones, ré-identification après coupure / banc.
4. **Vue du dessus synchrone avec la vidéo** : `src/ai/synchro.js` et 4 tests unitaires existent seulement en local chez John, non commités.
5. **Silhouettes ultra précises** avec contrôle de qualité (sinon cercle au sol, jamais de cadre).
6. **Bancs / remplaçants** reconnus seuls (non sûr sur 20261019_212111).
7. Terrain : associer chaque ligne du modèle à sa propre couleur (au lieu d'une union) ; mesurer sur d'autres salles ; vérité en mètres (aucune vérité terrain indépendante à ce jour).

## 6. Ce que seul John peut fournir (le moins possible)
- Une **vidéo de 10 à 15 minutes jamais utilisée** pour mesurer honnêtement.
- Environ **30 minutes d'étiquetage** (mode « Suivi assisté », plusieurs vidéos : horizontale, verticale, sol bleu, sol jaune).
- Un **Contrôle rapide** (≈ 5 s par image) pour avoir un premier score réel.
- Confirmer visuellement après mise à jour : 00:32 (plus de « Qui est-ce ? »), 01:11 (banc sans message rouge, ligne médiane), 02:44 (cercle central noir).

## 7. Faits mesurés à ne pas oublier
- Ballon : 45,5 % retrouvé / 28 % de faux (état de départ) ; TrackNet V3 pré-entraîné : 1,7 % ; WASB, TOTNet : non évalués sur nos vidéos.
- PnLCalib (terrain) : 0 calibration sur 20 images de la salle, licence GPL-2.0 : non adopté. SigLIP + UMAP + KMeans (équipes) : 55,8 % d'accord avec les tenues du programme : non adopté.
- Le décalage de la ligne médiane à 01:11 vient de la ligne médiane jaune/rouge de la salle (les lignes noires ne la contraignent pas), pas des dimensions du terrain.
- Aucune promesse de 95 % : l'écart réel est dit à chaque palier.

## 8. Comment reprendre une conversation
1. Lire `docs/cahier-des-charges.md` puis ce document.
2. Vérifier l'état réel : `gh release list`, PR ouvertes, derniers tests (ne rien affirmer de mémoire).
3. Continuer par le point 1 de la section 5.
