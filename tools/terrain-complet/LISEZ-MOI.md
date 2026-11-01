# Outils de mesure du terrain complet (hors programme)

Scripts écrits le 2026-11-01 pour mesurer, sur `20261019_212111.mp4`, ce que valent le suivi global du sol et une identification du terrain
à partir du rond noir (3 m) et des buts. **Ce ne sont pas des modules du programme** : chemins en dur (dossier temporaire de la session),
à relire avant tout réemploi. Voir `docs/terrain-complet-mesures.md` pour les résultats.

- `maps.js` : cartes de traits noirs (480×270) à 1 image toutes les N s. `ell.py` : détection RANSAC de l'ellipse du rond.
- `lib.js` : pose caméra → homographie terrain→image normalisée. `pose1.js` : pose depuis l'ellipse du rond (champ 91°).
- `solrun.js` : suivi global complet (comme `tests/e2e/sol-global.js`) avec sortie JSON.
- `ringaudit.js`, `ringshift1.js`, `ringrefine.js`, `ringfix.js` : audit du suivi par le rond (appui, décalage, correction par similitude).
- `goalw.js`, `pt.js`, `profil.js` : buts confirmés par John, points rétroprojetés, profil d'appui des traits noirs (touche, ligne de but).
- `courtdraw.js` + `draw2.py` : tracé du terrain complet sur des images pour contrôle à l'œil.
