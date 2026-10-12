# Futsal Analyzer

Programme **Windows** (installeur `.exe`) d'analyse vidéo tactique de futsal, **par IA et hors ligne** : il détecte les joueurs sur une vidéo de smartphone, reconnaît votre équipe grâce aux couleurs des tenues, projette le jeu en **vue de dessus**, repère les erreurs tactiques et propose des **corrections animées** (vidéos à partager) avec exercices. Il embarque une **base de connaissances futsal** complète.

## Fonctionnement

1. **Vidéo** : MP4/H.264, MOV, WEBM, MKV (smartphone). Le fichier reste sur l'ordinateur.
2. **Calibrage du terrain** : vous cliquez 4 repères ou plus (coins, cercle central, points de penalty, angles des surfaces…), même si le terrain n'est que partiellement visible. Le programme en déduit la vue de dessus. **Caméra mobile** (smartphone à la main) : le mouvement de la caméra est suivi automatiquement entre deux calibrages ; ajoutez un calibrage après un gros mouvement ou toutes les 20 à 30 s.
3. **Tenues** : **pipette** (vous cliquez vous-même le maillot, le short, les chaussettes sur l'image en pause) ou **auto** (clic sur un joueur). Mon équipe, adversaire, gardiens, arbitre. Le maillot compte le plus ; short et chaussettes sont facultatifs. Bouton « Tester la reconnaissance » et réglage de tolérance.
4. **Analyse** : détection (YOLOX) + suivi des joueurs + ballon. Résultat : cadres ou silhouettes sur la vidéo, **mini-carte de dessus** synchronisée (trajectoires, carte de chaleur), possession, profondeur et largeur de l'équipe, distances.
5. **Erreurs suggérées** : pertes de balle en zone défensive, contre-attaques et replis tardifs, équipe étirée, espace dans le dos du fixo, joueur adverse libre, largeur mal occupée, attaque statique, porteur isolé. **Chaque suggestion est validée ou écartée par le coach.** Le marquage manuel (30 situations) reste disponible.
6. **Diagnostic** : gravité (critique / majeur / mineur), analyse des buts encaissés, schémas récurrents, solutions, consignes, exercices, plan d'action pour les prochains matchs.
7. **Corrections animées** : pour chacune des 30 erreurs, une animation en vue de dessus montre l'erreur, la correction puis la consigne (flèches continues et pointillées, zones, lignes de bloc, annonces). 21 exercices sont animés aussi. Export **MP4** (ou WebM) d'une animation, ou **vidéo complète des corrections du match** à envoyer aux joueurs.
8. **Rapport** PDF/HTML avec les images des corrections, la carte de chaleur et le plan d'action.
9. **Base de connaissances** (recherche plein texte) : lois du jeu, tactique détaillée, systèmes, rôles, vocabulaire, catalogue d'erreurs/solutions, exercices — avec bouton « voir l'animation ».

### Limites à connaître
- **Caméra** : le mieux est un smartphone placé en hauteur voyant tout le terrain. À la main, le suivi automatique fonctionne tant que le sol et les murs offrent assez de détails et que le mouvement n'est pas trop brusque ; sinon les images concernées sont ignorées et signalées. Les joueurs partiellement hors cadre sont moins précis.
- La détection n'est pas parfaite (joueurs masqués, tenues proches, ballon petit et rapide, joueurs très lointains). Le ballon est détecté de façon moins fiable que les joueurs : sans ballon, la possession et les pertes de balle ne sont pas calculées. D'où la validation par le coach.
- **Durée d'analyse** : environ 0,2 à 0,5 s par image analysée sur un PC courant (affichée avant lancement). Analysez un extrait ou choisissez la précision « Rapide » pour un match entier.
- Les lois du jeu sont une synthèse pédagogique : se référer au règlement de la compétition.

## Installer

L'installeur est construit par GitHub Actions (workflow *Futsal Analyzer — installeur Windows*) :
- onglet **Actions** → dernier run → artefact **Futsal-Analyzer-Setup** (≈ 150 Mo), ou
- tag `v1.0.0` → l'installeur est joint à une release.

Double-clic sur `Futsal Analyzer Setup 1.0.0.exe` (assistant en français, dossier au choix, raccourcis). L'installeur n'est pas signé : SmartScreen peut afficher un avertissement (« Informations complémentaires » → « Exécuter quand même »). Si le détecteur ne démarre pas, installer « Microsoft Visual C++ Redistributable 2015-2022 ».

## Développer

```powershell
npm ci
npm test          # télécharge le modèle + une photo d'essai, puis lance les tests
npm start         # lancer sans installer
npm run dist      # → dist\Futsal Analyzer Setup 1.0.0.exe
```

| Chemin | Rôle |
|--------|------|
| `main.js`, `preload.js` | Électron : fenêtre, dialogues, sauvegardes, PDF, vidéo locale (Range), détecteur dans un fil dédié |
| `src/ai/` | Détection (YOLOX/onnxruntime), calibrage (homographie), tenues, suivi, analyse tactique, chaîne vidéo |
| `src/anim/` | Moteur d'animation en vue de dessus, 30 scènes d'erreurs, 21 exercices, lecteur et export MP4/WebM |
| `src/knowledge/` | Règles, tactique, systèmes, rôles, vocabulaire, erreurs, exercices |
| `src/engine/`, `src/report.js` | Diagnostic et rapport |
| `tests/` | Tests unitaires |

Licences des composants : YOLOX (Apache-2.0, Megvii), onnxruntime-node (MIT), mp4-muxer / webm-muxer (MIT) — voir `src/vendor/LICENSES.txt`. Le modèle n'est pas versionné : `scripts/get-assets.js` le télécharge et vérifie son empreinte.
