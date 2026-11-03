# Montage « vraie vidéo truquée » des corrections

**Ce que ça fait.** Pour une erreur de placement ou de mouvement, la correction rejoue la **vraie vidéo** : le joueur qui a mal joué est **effacé** (le sol et le décor derrière lui sont reconstruits), puis **le même joueur, découpé image par image dans la vraie vidéo** (vrai maillot, vraie course), est replacé là où il aurait dû être, à la bonne taille (perspective), avec son ombre, et passe derrière les joueurs qui sont devant lui. Une flèche verte, un anneau et la consigne l'accompagnent. Le montage se joue dans « Mon plan tactique » (« Voir sur la vidéo ») et « Corrections animées », et s'exporte en vidéo comme les autres corrections.

## Méthode (fichiers `src/anim/montage.js`, `montage-run.js`, `realview.js`)
1. **Fond propre.** Plusieurs images de la vidéo (environ 4 s avant à 4 s après l'erreur) sont ramenées dans l'image de l'erreur grâce à la projection du terrain connue image par image. Pour chaque point, on garde la couleur **médiane** des images où aucun joueur ne le cache : les joueurs bougent, le sol et le mur ne bougent pas. Les points jamais vus dégagés prennent la couleur du point vu le plus proche (≤ 2 m), comptés comme « approchés ».
2. **Le joueur.** Découpé par MobileSAM à partir de sa boîte, image par image (10 par seconde), avec contrôle de qualité (silhouette complète, nette, pas collée à un autre).
3. **Mouvement corrigé.** Course réelle + décalage progressif vers la place voulue (1,4 s), puis le joueur continue sa course réelle, décalé.
4. **Montage.** À chaque image : le joueur d'origine est effacé (sa silhouette, gonflée, plus son ombre), le joueur découpé est collé à sa nouvelle place (taille selon la perspective, ombre), et les joueurs plus près de la caméra repassent devant.

## Mesuré
- Sur la vraie vidéo de John (`20261019_212111`, ancienne analyse, secondes 24 à 28) : la préparation prend **25 à 70 s** la première fois (en arrière-plan : la vidéo et les dessins s'affichent tout de suite), le rendu d'une image **20 à 30 ms**. Sur les images regardées, le joueur d'origine disparaît sans trace visible et le joueur replacé a la bonne taille. Ce n'est **pas** une mesure de justesse sur beaucoup de situations : une vidéo, deux joueurs essayés, des images regardées à l'œil.
- Tests : fond propre reconstruit comparé au vrai sol sur une scène synthétique (écart moyen sous 12/255), homographie de signe opposé, points jamais vus non inventés, déplacement, chronologie ; test de bout en bout dans l'application (phases, export image par image, repli).

## Quand le montage est refusé (et la raison dite à l'écran)
Le programme garde alors la correction dessinée avec le joueur fantôme vert, et le dit : caméra perdue ou terrain pas assez sûr à ce moment ; joueur introuvable, trop petit, coupé par le bord, collé à un autre ou mal découpé (plus d'un quart des images) ; sol derrière le joueur trop caché (plus de 12 % manquant ou plus de 60 % approché) ; place voulue hors de l'image ou à plus de 14 m.

## Limites (dites franchement)
- **Types d'erreurs couverts : 16 sur 36** : ceux dont la correction déplace un joueur (relance risquée, pertes de balle, pivot isolé, attaque statique, largeur mal occupée, contre-attaque subie, repli tardif, marquage perdu, espace dans le dos, équipe étirée, forme du plan, pressing du plan, gardien du plan, bloc étiré du plan). Les 20 autres (passe imprécise, tir précipité, duel perdu, faute évitable, gardien, gardien-joueur, coups de pied arrêtés…) n'ont pas de joueur à déplacer : leur correction reste dessinée. Un seul joueur est déplacé par correction ; le ballon n'est pas déplacé.
- Le joueur déplacé garde la **pose de sa vraie course** : un joueur immobile reste immobile en glissant. Ce n'est pas une vidéo truquée parfaite ; le sol brillant (reflets) et les passages derrière des joueurs peuvent laisser des défauts.
- Le montage n'est juste que si le terrain est bien repéré à ce moment-là (environ 91 % vérifié sur la seule vidéo mesurée) ; sur un projet enregistré avant le nouveau suivi du terrain, il n'y a rien de fiable à monter.
- Le fond est reconstruit dans l'image : exact pour le sol, approché pour le mur et le décor (hypothèse : la caméra tourne sans beaucoup se déplacer). Un grand mouvement de caméra ou un zoom rapide dans la fenêtre dégrade le résultat.
- Le montage est gardé en mémoire pendant la session seulement : il est recalculé à la prochaine ouverture du programme.
