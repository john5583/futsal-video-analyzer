# Terrain complet : mesures du 2026-11-01 (une seule vidéo : `20261019_212111.mp4`, 817 s)

## Ce qui est établi
- **Le rond noir (cercle exact de 3 m) donne la pose de la caméra** : détection d'ellipse (RANSAC sur la carte de crêtes noires, 480×270) puis pose avec un champ de 91° :
  caméra à 11,6 m du centre, 3,9 m de haut (résidu 0,00 px sur l'image de référence, 120 s). Le rond fixe 5 degrés sur 6 : l'azimut reste libre.
- **Les buts donnent l'axe et la longueur** : les 33 buts confirmés par John sur cette vidéo, rétroprojetés par cette pose et le suivi global, tombent sur UNE droite
  passant par le centre du rond (angles 86–93° pour la grande majorité, de part et d'autre), à 19–23 m du centre → L/2 ≈ 20–22 m (L ≈ 41–43 m, **non confirmé 40**).
  Largeur du but 3,0–3,5 m pour les buts proches (cohérente avec 3 m). Quelques écarts (t = 13,5 ; 229 ; 299 ; 806 s) correspondent à des images où le suivi est faux (voir plus bas).
- Médiane : perpendiculaire à l'axe des buts (ΔY ≈ 0). Touche : pic net d'appui des traits noirs à ≈ 10,3 m du centre d'un seul côté (441–816 échantillons, l'autre côté caché par la rampe) → largeur ≈ 20 m **non confirmée**.

## Ce qui est FAUX ou non prouvé
- **Le suivi global marque « ok » des images fausses.** Audit par le rond (pose de référence transportée par le suivi, 1 image par seconde, 816 images, le rond tombe sur un trait noir fort à ≤ 1,5 px sur 480) :
  rond retrouvé à la position prédite : **≈ 60 %** des secondes ; rond retrouvé ailleurs (suivi décalé, médiane ≈ 10 px sur 480, 16 cas > 30 px, p. ex. 480–496 s : rond à x ≈ 400 au lieu de 117) : **≈ 12–14 %** ;
  rond non retrouvé ou non visible (première minute, rampe, joueurs) : le reste. **Le taux « 95,6 % » de `docs/suivi-global-sol.md` reposait sur un rond de référence réajusté sur le suivi lui-même : trop optimiste.**
- Aucun taux ≥ 95 % de terrain complet vérifié n'est atteint. Seules les images où le rond est visible peuvent être vérifiées par le rond (≈ 70–75 % des secondes) ; pour le reste il faut un autre repère indépendant (buts, médiane noire, arcs).
- Hypothèses non vérifiées : champ 91° (mesuré sur une rotation pure, recoupé par la largeur des buts proches) ; une seule vidéo ; L et W du terrain.

## Prochaines étapes réalistes
1. Vérifier chaque image tracée par au moins un repère indépendant (rond, buts détectés, médiane noire) et ne tracer que celles-là (le reste « non analysé »).
2. Corriger les décalages du suivi quand le rond est visible (similitude 2D : 235 images sur 816 ont été remises sur le rond, décalage médian 10,7 px sur 480).
3. Mesurer L et W par mesures répétées (buts, touche) avec écart-type ; demander confirmation à John seulement en cas de doute.
4. Contrôle à l'œil sur recadrages avant d'en parler.
