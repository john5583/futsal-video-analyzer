# Futsal Analyzer

Programme **Windows** (installeur `.exe`) pour analyser la vidéo d'un match de futsal, identifier les erreurs tactiques de l'équipe et obtenir des solutions concrètes. Inclut une **base de connaissances futsal** hors ligne.

## Ce que fait le programme

1. **Lecteur vidéo** local (MP4/H.264, M4V, MOV, WEBM, MKV, OGV) : lecture, ±5 s, image par image, vitesse ×0,25 à ×2. Le fichier ne quitte jamais l'ordinateur.
2. **Marquage des situations** en un clic : 30 situations tactiques classées par phase (attaque, transitions, défense, gardien, gardien-joueur, coups de pied arrêtés) + buts marqués/encaissés. Chaque marquage enregistre le minutage, la zone, le côté, la conséquence, une note et une capture d'image.
3. **Diagnostic automatique** :
   - erreurs classées par gravité (Critique / Majeur / Mineur) selon leur nature, conséquence, zone et récurrence ;
   - **analyse de chaque but encaissé** : chaîne des erreurs dans les 12 s précédentes et cause probable ;
   - **schémas récurrents** (pertes de balle → contre-attaque, pressing battu → espace dans le dos, cumul de fautes, baisse en 2e période, côté faible, coups de pied arrêtés, power play…) ;
   - causes probables, **solutions**, consignes aux joueurs, **exercices** et **plan d'entraînement**, conseils selon le système de jeu.
4. **Rapport** exportable en **PDF** ou HTML.
5. **Base de connaissances** (recherche plein texte) : lois du jeu (4 secondes, fautes cumulées, absence de hors-jeu, gardien-joueur…), systèmes (3-1, 1-2-1, 2-2, 4-0, 3-2, 1-2-2), organisations défensives, principes de jeu, rôles (gardien, fixo, ala, pivot, universel, gardien-joueur), vocabulaire, catalogue d'erreurs/solutions et 21 exercices.
6. Sauvegarde automatique + projets `.fsal` partageables.

> **Limite assumée** : le programme n'analyse pas les images par intelligence artificielle. C'est le coach qui désigne les situations ; le programme apporte le classement, les statistiques, le diagnostic et les solutions. La synthèse des lois du jeu est pédagogique : vérifier le règlement de la compétition.

## Obtenir l'installeur Windows

L'installeur est construit par GitHub Actions (workflow *Futsal Analyzer — installeur Windows*) :

1. Onglet **Actions** du dépôt → dernier run du workflow → artefact **Futsal-Analyzer-Setup** → télécharger le `.exe`.
2. Ou créer un tag `v1.0.0` : l'installeur est joint à une release.

Double-clic sur `Futsal Analyzer Setup 1.0.0.exe` → l'assistant (en français) permet de choisir le dossier et crée les raccourcis Bureau et menu Démarrer. L'installeur n'est pas signé : Windows SmartScreen peut afficher un avertissement (« Informations complémentaires » → « Exécuter quand même »).

### Construire soi-même (sous Windows)

```powershell

npm ci
npm test
npm run dist      # → dist\Futsal Analyzer Setup 1.0.0.exe
npm start         # lancer sans installer
```

## Structure

| Chemin | Rôle |
|--------|------|
| `main.js` / `preload.js` | Processus Electron (fenêtre, dialogues, sauvegardes, export PDF, service vidéo avec Range) |
| `src/index.html`, `app.js`, `styles.css` | Interface |
| `src/engine/analyzer.js` | Moteur de diagnostic (testé) |
| `src/report.js` | Rapport HTML/PDF |
| `src/knowledge/` | Règles, systèmes, rôles, vocabulaire, erreurs, exercices |
| `tests/` | Tests unitaires (`npm test`) |

Pour enrichir la base : ajouter une entrée dans `src/knowledge/errors.js` (elle apparaît automatiquement dans la palette, le diagnostic et la base) ; les tests vérifient la cohérence des références.
