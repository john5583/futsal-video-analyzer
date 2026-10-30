# Futsal Analyzer — contexte du projet

Programme **Windows hors ligne** (Electron 33) qui analyse des vidéos de futsal avec une IA : détection des joueurs et du ballon (YOLOX, onnxruntime-node, carte graphique DirectML), silhouettes (MobileSAM), suivi, erreurs tactiques, corrections animées, rapport. Ce projet **n'a aucun lien** avec CoachConvoc.

Dépôt : GitHub `john5583/futsal-video-analyzer`, branche principale `main`. Dossier local : `C:\Users\xboxl\Desktop\futsal-video-analyzer`.

**À lire au début de chaque mission : `docs/cahier-des-charges.md`** (les demandes de John, validées par lui). Chaque PR dit quels points elle touche, ce qui est mesuré, et ce qui reste « non évalué ».

## Règles non négociables (John, francophone)
1. **Répondre en français, simplement.** Messages, descriptions de commandes et commentaires ajoutés en français.
2. 100 % fonctionnel, aucun bug, aucun message d'erreur affiché à l'utilisateur.
3. **Ne jamais promettre 100 % ni 98 % de précision** : dire les limites, donner les chiffres mesurés (sur des vidéos jamais vues à l'entraînement).
4. **Rien ne se modifie, ne se pousse, ne se publie, ne s'installe, ne se télécharge sans l'accord explicite de John.** Il valide à chaque étape. Une phrase d'explication avant chaque demande d'autorisation.
5. **Le programme n'invente jamais** : au moindre doute il pose une question (joueur, remplaçant, arbitre, ballon, but…) ; ce qui n'est pas certain reste « non analysé ».
6. La mémoire du programme est **par projet seulement** (jamais entre projets) ; le détecteur n'apprend que de ce que John confirme (réponses, clics, étiquettes). **Exception demandée et validée par John le 2026-10-30 :** le **journal de décisions** (`src/ai/journal.js`) garde, d'un projet à l'autre, les **mesures, seuils et verdicts** du programme (que des chiffres : jamais le contenu d'un match ni l'identité d'un joueur), pour qu'il règle ses seuils d'après ses erreurs. Il ne sert qu'à durcir ou régler des seuils avec des exemples « oui » et « non » du coach ; sans exemples suffisants, valeurs de départ.

## Carte du code
- `main.js` (processus principal, IPC, fil de détection), `preload.js`, `updater.js` (mise à jour automatique, electron-updater).
- `src/ai-ui.js` : panneau « Analyse IA » (questions, réponses, contours, zoom, session d'étiquetage). `src/wizard.js` : assistant. `src/corrections-ui.js`, `src/plan-ui.js`, `src/report.js`, `src/app.js`, `src/index.html`, `src/styles.css`.
- `src/ai/` : `pipeline.js` (analyse vidéo, tuiles, filtres), `worker.js` + `backend.js` (inférence), `yolox.js`, `sam.js`, `contour.js`, `zoom.js`, `ballLabels.js`, `balltrack.js` (choix du ballon dans le temps), `doubt.js` (doute → question → mémoire), `match.js`, `kit.js` (tenues), `goal.js`, `court-fit.js`, `lignes.js` (suivi par pose de caméra + recalage du terrain sur les vraies lignes de la couleur donnée), `homography.js`, `camera.js`, `tracker.js`, `overlay.js`.
- `src/engine/` : `analyzer.js`, `compliance.js` (plan tactique), `quality.js` (contrôle qualité). `src/anim/` : corrections animées. `src/knowledge/` : base de connaissances.
- `docs/catalogue-apprentissage.md` : ce que le programme mesure, apprend, demande, et ce qu'il ne doit pas faire.
- Modèles : `models/*.onnx` (gitignorés, téléchargés par `scripts/get-assets.js`). Un modèle de ballon spécialisé facultatif (`models/ballon_m.onnx`) existe en local mais n'est pas livré.

## Commandes
- Tests unitaires : `npm test` (un test du backend est très rarement instable : relancer).
- Tests de bout en bout : `node tests/e2e/<nom>.js` (besoin de ffmpeg dans le PATH) ; sur GitHub : `gh workflow run e2e-linux.yml --ref <branche>`.
- Lancer l'application en développement : `npm start`.

## Façon de travailler
Une branche par sujet → tests → PR → **John fusionne lui-même** dans l'interface GitHub (la session bloque `gh pr merge` et la publication). Commits avec `-c user.name=john5583 -c user.email=xboxlive360@live.be` et l'attribution demandée par la session.

**Publier une version** : GitHub → Actions → « Futsal Analyzer — installeur Windows » → Run workflow, branche `main`, version `1.7.x` **sans espace ni « v »** (une espace a fait échouer deux publications). Attendre que les deux vérifications de `main` soient vertes, puis `gh release list` pour vérifier. Version publiée au 2026-10-20 : **1.7.5**.

## Mesures sur le ballon (à connaître avant de toucher à la détection)
- Niveau réel : ballon retrouvé ≈ 50–70 % selon la salle. **Les 98 % ne sont pas atteints.**
- Environnement d'entraînement (hors dépôt) : `C:\Users\xboxl\futsal-entrainement` (Python 3.11 + PyTorch cu118 + YOLOX-m ; pip exige `--use-feature=truststore` à cause de l'antivirus, et `numpy<2`). Étiquettes de John : `C:\Users\xboxl\OneDrive\Desktop\vidéo match\étiquetage\`.
- Mesurer toujours sur une vidéo entière laissée de côté. Résultats déjà obtenus : le modèle spécialisé aide sur sol bleu horizontal mais pas encore sur la vidéo verticale (aucun ballon vertical à l'entraînement) → **mis de côté** tant qu'il n'y a pas plus de vidéos variées. Petites tuiles de 800 px : +5 points mais +39 % de temps → non retenues. Perte principale trouvée et corrigée : le filtre « marques au sol » supprimait les vrais ballons sur parquet jaune.
- Pistes restantes : faux ballons sur sol jaune ; filtre « hors terrain » (perd 7–27 % des vrais ballons) ; contours pendant la lecture ; précision des étiquettes (~3 px de biais).

## Pipeline général
Les règles générales de John (`~/.claude/CLAUDE.md`, tiers T0–T3) s'appliquent : correctif local = T1, nouvelle fonctionnalité = T2 (spec courte, tests, vérification par outil). Un risque non détectable par un outil est signalé à John, jamais caché.
