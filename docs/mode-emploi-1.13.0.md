# Mode d'emploi — version 1.13.0 à tester (pour John)

Ce document dit **dans quel ordre faire les choses**, et **ce qui marche, ce qui ne marche pas encore**. Rien de ce qui suit n'est une promesse de 100 % : les chiffres viennent de mesures, avec leurs limites.

## A. Mettre la version en ligne (par ton assistant, dans l'autre conversation)
1. Lui dire exactement : **« pile prête, CI vert sur `vue-synchrone` »**.
2. Il fusionne les PR **dans cet ordre** : #48, puis #49, #50, #51, puis la PR « vue synchrone + terrain + événements » (branche `vue-synchrone`). Après chaque fusion « squash », il refusionne `main` dans la branche suivante pour éviter les conflits.
3. Quand tout est fusionné et que les deux vérifications de `main` sont vertes : GitHub → Actions → « Futsal Analyzer — installeur Windows » → Run workflow, branche `main`, version `1.13.0` (sans espace ni « v »).
4. Attendre la fin, puis installer la version 1.13.0 (la mise à jour automatique la propose aussi).

## B. Tester, dans cet ordre (projet `20261019_212111`)
1. **Ouvrir le projet, laisser le suivi de la caméra aller jusqu'au bout** (environ 14 minutes sur 13 min de vidéo, message « Suivi de la caméra terminé »). Tant qu'il n'est pas arrivé à un instant, le terrain n'y est pas tracé : c'est normal, ce n'est pas un plantage.
2. **Le terrain** : va à 07:11, 07:22 et 08:36. Le tracé cyan doit coller à la ligne médiane (noire, jaune, rouge, noire), à quelques pixels près. Mesuré : écart moyen 7,4 px (avant : 19,2 px), pire cas 31 px.
3. **« Fiabilité de cette analyse »** (panneau Analyse IA) : lis la part du terrain « sûr » et les passages à regarder. Un passage « non confirmé » veut dire que le tracé n'y est pas sûr : ne le crois pas sans regarder.
4. **Vue du dessus synchrone** : lance la lecture ; la vue du dessus et les cercles au sol doivent bouger en même temps que la vidéo, sans retard ni saut. (Pas mesuré en conditions réelles : dis-moi ce que tu vois.)
5. **« Événements du match à valider »** : après une analyse, clique sur l'heure pour voir le moment, puis ✔ « oui, c'est juste » ou ✖ « non ». Sont proposés : sortie de touche, sortie de fond, but, phase arrêtée, corner, penalty. Ce sont des **propositions** ; seuls ceux que tu valides comptent dans le rapport.
6. **Contrôle rapide**, **Suivi assisté du ballon**, **Registre des personnes** : comme dans les versions précédentes de la pile (#48 à #50).

## C. Ce qui n'est PAS fait ou PAS mesuré
- **Ballon** : toujours 45–61 % retrouvé selon la vidéo, pour 95 % visés. Le ballon à l'arrêt, le ballon tenu en main et le « ballon de départ en un clic » ne sont **pas faits** (le programme déduit déjà « ballon tenu » pour la possession). La séparation en couches (retirer le décor) est **seulement une piste**, non testée.
- **Événements** : seuls les cas déduits de la position du ballon sont proposés ; le coup franc précis n'est pas reconnu (il apparaît comme « phase arrêtée »). Ils sont **non mesurés** sur un vrai match : la justesse dépend du terrain et du ballon.
- **Identités, silhouettes précises, bancs** : non évalué dans cette version.
- **Autres salles** : le terrain n'a été mesuré que dans la salle de `212111`. Dans une autre salle, le résultat est **non évalué** : regarde « Fiabilité de cette analyse ».
- **Test à l'aveugle** : aucune vidéo jamais utilisée n'a servi à mesurer cette version (seule `20261019_211208` est restée vierge).

## D. Ce que je te demande de me renvoyer après ton test
1. Pour 07:11, 07:22, 08:36 : « le tracé colle » ou « il décale » (une capture d'écran suffit).
2. Le texte de « Fiabilité de cette analyse » (copier-coller).
3. Combien d'événements proposés étaient justes / faux (✔ / ✖).
4. Tout comportement bizarre, sans chercher à l'expliquer.
