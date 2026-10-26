# Audit « zéro défaut » (2026-10-26)

But (cahier des charges §1) : aucun bouton mort, aucun message d'erreur, aucun bouton grisé sans explication, dans toute l'application. Ce document dit **ce qui a été testé, ce qui a été corrigé, et ce qui reste non évalué**.

## Comment c'est testé
`tests/e2e/audit-zero-defaut.js` (vrai programme Electron, projets d'essai fabriqués par `tests/helpers/audit-fixture.js`). Pour chaque écran il **clique chaque bouton, case, curseur, liste, champ et lien visible** et vérifie :
- un **effet** (texte, état, vidéo, message ou appel au programme principal change) ; sinon le bouton est « mort » ;
- **aucune exception, aucune erreur console**, aucun dialogue d'erreur, aucun texte « undefined / NaN / Erreur inattendue » à l'écran ;
- un bouton grisé a une **explication** (infobulle) ;
- quand un clic ne change rien, un second essai est fait dans un état où il a un sens (vidéo avancée, zoom, valeur différente) ; le reste est listé dans `AUTORISE_SANS_EFFET` avec sa raison (par exemple « onglet déjà actif »).

Scénarios (lancés par groupes de 3–4, **un seul programme Electron à la fois**, voir plus bas) : `complet`, `manuel` (marquage manuel), `bancs` (deux clics → un banc, « Effacer » l'efface), `questions` (une question « Qui est-ce ? » est posée, la réponse est appliquée, **gardée après fermeture et réouverture**, jamais reposée), `assistant` (assistant de départ réel : choix de la couleur, repères manuels), `etiquetage` (écran d'étiquetage), `froid` (aucun projet, aucune vidéo), `ancien` (projet d'une ancienne version), `vertical` (vidéo 540×960), `court` (vidéo d'1 seconde), `menus` (Fichier, Affichage, Aide), `reouverture` (sauvegarde automatique), `annulation` (annuler une analyse en cours).

## Chiffres du dernier passage complet en local
- **1 247 clics** sur **306 éléments distincts**, répartis : projet complet 209, marquage manuel 150, questions 106, assistant 11, ancien projet 176, vidéo verticale 192, vidéo courte 193, menus 12, démarrage à froid 167, étiquetage 31.
- 17 boutons grisés **expliqués**, 22 clics sans effet **justifiés** (déjà actif, déjà coché, déjà affiché), **0 exception, 0 erreur console, 0 message d'erreur affiché**.
- Menus : Nouveau, Ouvrir, Enregistrer, Enregistrer sous, Ouvrir une vidéo, Étiquetage, Guide, À propos, zoom avant/arrière/normal, plein écran → tous produisent un effet. **Non testés** : « Quitter » (ferme le programme) et « Rechercher une mise à jour » (contacte GitHub ; aucune donnée ne doit sortir en test).
- Démarrage à froid, projet ancien, vidéo verticale, vidéo très courte, fermeture/réouverture avec sauvegarde automatique, annulation d'une analyse : verts.

## Défauts trouvés et corrigés (écran, élément, attendu, constaté → correction)
| Écran | Élément | Ce qui devait arriver | Ce qui arrivait | Correction |
|---|---|---|---|---|
| Corrections animées | « Vidéo complète des corrections du match » | une explication quand il est grisé | grisé pendant un export, sans infobulle | infobulle « Une vidéo est en cours de création… » sur les deux boutons d'export |
| Assistant, repérage manuel | « Valider le terrain ✓ » | savoir pourquoi il est grisé | grisé sans explication | infobulle « Placez au moins 4 repères… (n placé(s)) » |
| Sans vidéo | ⏪ 5 s, ◀ 1 img, ▶ Lecture, 1 img ▶, 5 s ⏩, ⚽ But marqué / encaissé | dire quoi faire | aucune réaction | message « Choisissez d'abord une vidéo… » |
| Sans vidéo | exemples : −10 s, −1 s, +1 s, +10 s, Aller | dire quoi faire | aucune réaction | message « Choisissez d'abord une vidéo. » |
| Résultats | « Tout accepter » / « Tout écarter » sans erreur suggérée | dire qu'il n'y a rien | aucune réaction | message « Aucune erreur suggérée… » |
| Bancs | « Marquer un banc (2 clics) » | dire quoi faire ensuite | aucun signe visible | message « Cliquez deux coins opposés autour du banc, sur la vidéo. » |
| Tous | message affiché deux fois de suite à l'identique | le message réapparaît | rien de visible au 2e clic | le message est ré-affiché à chaque clic |
| Barre de lecture | curseur de position | savoir pourquoi il est grisé | pas d'infobulle | infobulle « Choisissez d'abord une vidéo. » (aussi si la vidéo est illisible) |

Trouvés **en relisant le code** (tout `disabled = …`), pas par le parcours : « Lancer l'analyse » (assistant, vidéo pas encore chargée), « Lancer l'analyse » et « Calcul » pendant une analyse ou si le détecteur n'est pas prêt, « Oui, c'est le ballon » sans ballon proposé, champs d'un but dans la fenêtre de modification, flèches ◀ ▶ quand il n'y a qu'une situation. Ils ont maintenant une infobulle ; le parcours automatique ne les voit pas tous (états difficiles à atteindre) : **à vérifier à la main**.

Garde-fou : le test `audit-zero-defaut` lui-même ; un bouton qui redevient mort, grisé sans explication ou qui fait une erreur le fait échouer. Il est ajouté au workflow GitHub (4 étapes).

## Non évalué / impossible à tester en automatique (dit franchement)
- **Atteints seulement partiellement** : l'assistant de départ jusqu'à l'étape « Terrain » (la suite — joueurs, analyse, résultats — demande un vrai calibrage ; couverte par les tests `wizard-goal.js`, `analyse-v2.js` existants, pas par cet audit) ; la pipette des tenues (Short, Chaussettes, Manches, Passer, Terminer, Annuler) ; la session d'étiquetage du ballon (« Oui, c'est le ballon »…) ; les commandes de la correction sur la vraie vidéo (Figé, Séquencé, Rejouer, exports MP4/GIF) ; l'écran d'étiquetage détaillé (cadres, fiches, changements) : **32 éléments jamais atteints** sur 338 vus.
- **Le résultat d'un export** (fichier vidéo/GIF/PDF réellement écrit) et les **boîtes de dialogue Windows** (ouvrir, enregistrer) : les dialogues sont remplacés par une annulation ou un chemin donné ; leur apparence n'est pas vérifiée.
- **Mise à jour automatique** et **Quitter** : non testés.
- **Apparence** (alignement, couleurs, lisibilité, texte coupé) : non évaluée, un humain doit regarder.
- **Vidéos réelles** : l'audit utilise des vidéos d'essai fabriquées (6 s, verticale, 1 s), pas des matchs.
- **Plantages du rendu pendant l'audit** : lancer 5 programmes Electron d'affilée dans un même passage a fait planter l'affichage plusieurs fois (« Target crashed »), jamais en lançant un scénario seul. Cause probable : mémoire du PC (le système a aussi arrêté deux de mes lancements pour manque de mémoire). **Non prouvé**, non reproduit isolément. Pour cette raison les scénarios sont lancés par petits groupes, et le dernier passage complet a été vérifié groupe par groupe ; **le tout dernier ajustement de la liste des clics sans effet (écran d'étiquetage) n'a été revérifié que sur deux groupes (étiquetage + démarrage à froid)** — la CI GitHub fait le passage complet.
