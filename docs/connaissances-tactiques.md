# Connaissances tactiques du futsal — règles à valider par John

**Statut de ce fichier : PROJET. Aucune règle n'est utilisée par le programme tant que John ne l'a pas validée.**
Pour chaque règle, John répond : ✅ validée · ✏️ à corriger (avec le changement) · ❌ à retirer.
Le programme ne fait que ce qui est écrit ici. Ce qui n'est pas mesurable est affiché « **non évalué** + la raison », jamais passé sous silence (règle d'or, voir `src/engine/regle-or.js`).

## 0. Comment lire une règle

| Rubrique | Sens |
|---|---|
| **Définition** | Ce que le coach appelle cette erreur. |
| **Mesure** | Comment le programme la mesure (seuils réellement codés) ou, si elle n'est pas codée, la mesure proposée. |
| **Exige** | Ce qu'il faut de fiable pour l'afficher (ballon vu, position des joueurs, identité…). Si ce n'est pas fiable : « non évalué ». |
| **Ne peut pas détecter** | Les limites connues, dites franchement. |
| **Statut** | **Codée** = le programme la suggère déjà (avec la liste des seuils). **Non codée** = aujourd'hui « non évalué ». |
| **Validation** | ☐ à remplir par John. |

Statuts affichés (règle d'or) : *mesuré* (lu sur la vidéo), *déduit avec preuve* (conclu à partir de mesures, preuve donnée), *non évalué* (raison donnée), *inconnu* (marge trop faible).

## 1. Principes du futsal sur lesquels reposent les règles
*(à confirmer avec le règlement de ta compétition ; le programme ne s'en sert que pour ce qui est écrit dans les règles plus bas)*

1. **5 contre 5** : 4 joueurs de champ + 1 gardien par équipe. Le gardien peut être remplacé par un joueur de champ (« gardien-joueur », power play).
2. **Remplacements volants** : illimités, par la zone de remplacement, côté des bancs. Un remplaçant n'est **jamais** compté comme joueur sur le terrain (il n'est compté qu'à partir du moment où il entre).
3. **Terrain** : environ 40 m × 20 m (le programme utilise les dimensions calibrées du projet). Trois tiers : défensif (DEF), médian (MED), offensif (ATT), vus depuis mon équipe.
4. **Possession** : une équipe a le ballon quand le joueur le plus proche est à 2,2 m ou moins du ballon (valeur codée `POSSESSION_RADIUS`).
5. **Les 4 secondes** : rentrée de touche, corner, remise en jeu du gardien, coup franc : 4 secondes pour jouer.
6. **Fautes cumulées** : à partir de la 6e faute d'équipe par période, coup franc direct sans mur. *(non mesuré par le programme, voir règle `faute_evitable`)*
7. **Transitions** : en futsal, la perte de balle se paie vite (peu d'espace, 4 joueurs de champ). C'est pourquoi les pertes et les replis sont les premières erreurs analysées.

## 2. Situations de jeu reconnues
| Situation | Définition utilisée | Statut |
|---|---|---|
| Attaque placée | Possession de mon équipe d'au moins 8 s (`LONG_POSSESSION`). | Codée |
| Transition | Possession de moins de 8 s, ou changement de possession récent. | Codée |
| Pressing subi | Au moins 2 adversaires à moins de 3 m du porteur (`PRESS_DIST`). | Codée |
| Jeu arrêté | Ballon non visible, hors jeu, ou arrêt détecté : **aucune erreur n'est suggérée**. | Codée |
| Coup de pied arrêté | Rentrée, corner, coup franc. | Non codée : raison « les coups de pied arrêtés ne sont pas détectés ». |
| Power play | Gardien-joueur. | Non codée : raison « le gardien-joueur n'est pas identifié ». |

## 3. Règles d'erreurs

### 3.1 Pertes de balle (inutiles ou pas)

**R01 · Perte de balle en zone défensive** (`perte_zone_def`) — *Codée*
- **Définition** : mon équipe perd le ballon dans mon tiers défensif et l'adversaire le garde.
- **Mesure** : la possession passe de mon équipe à l'adversaire ; l'adversaire garde le ballon au moins 1,0 s (`MIN_LOSS_DURATION`, sinon c'est un duel) ; mon équipe l'avait au moins 1,0 s avant ; le ballon est dans le tiers DEF au moment de la perte. Le rythme est qualifié : *pressing* (≥ 2 adversaires à moins de 3 m du porteur), *attaque placée* (possession ≥ 8 s) ou *transition*. Deux erreurs du même type au moins 8 s l'une de l'autre.
- **Exige** : ballon vu sur au moins 60 % des images autour de l'erreur (de 1,5 s avant à 0,5 s après) ; jeu en cours (pas d'arrêt) ; possession précédente connue.
- **Ne peut pas détecter** : si la perte était *inutile* (choix du joueur) ou imposée (pressing fort, mauvais appui) — le programme donne le contexte, pas le jugement. Une passe ratée reprise en moins d'1 s n'est pas comptée.
- **Validation** : ☐

**R02 · Perte de balle en zone médiane** (`perte_zone_mediane`) — *Codée*
- Même mesure que R01, ballon dans le tiers médian. Même exigences, mêmes limites.
- **Validation** : ☐

**R03 · Perte de balle « inutile »** — *Proposition nouvelle, non codée*
- **Définition proposée** : perte de balle sans pression adverse (moins de 2 adversaires à moins de 3 m), par un joueur qui avait un coéquipier démarqué disponible.
- **Mesure envisagée** : R01/R02 + nombre d'adversaires proches + coéquipiers à plus de 3 m de tout adversaire et à portée de passe.
- **Exige** : ballon fiable, position fiable de tous les joueurs de champ des deux équipes.
- **Ne peut pas détecter** : la qualité réelle de la passe possible (ligne de passe fermée, état de forme).
- **Statut** : non évalué (raison : « jugement non codé »).
- **Validation** : ☐

**R04 · Relance risquée sous pression** (`relance_risquee`) — *Non codée*
- **Définition** : le gardien ou le défenseur relance courte alors que 2 adversaires ou plus pressent, et le ballon est perdu.
- **Mesure envisagée** : R01 avec phase *pressing* et porteur = gardien ou dernier défenseur.
- **Exige** : ballon fiable ; identification du gardien (équipe `GKA`).
- **Ne peut pas détecter** : une relance risquée qui réussit (pas d'erreur visible).
- **Statut** : non évalué (raison : « n'est pas codée »).
- **Validation** : ☐

**R05 · Passe imprécise ou mal rythmée** (`passe_imprecise`) — *Non codée*
- **Définition** : passe qui n'atteint pas le coéquipier (trop longue, trop courte, trop lente) sans perte immédiate évidente.
- **Mesure envisagée** : trajectoire du ballon entre le passeur et le destinataire ; écart à la position du coéquipier visé ; vitesse. Demande des trajectoires multi-images.
- **Exige** : ballon vu en continu sur la passe (pas de trou > 0,6 s).
- **Ne peut pas détecter** : l'intention du passeur (qui était visé).
- **Statut** : non évalué (raison : « trajectoire du ballon pas assez fiable »).
- **Validation** : ☐

**R06 · Dribble excessif ou conservation trop longue** (`dribble_excessif`) — *Non codée*
- **Définition** : un joueur garde le ballon plus longtemps qu'utile alors qu'un partenaire est démarqué.
- **Mesure envisagée** : durée de possession individuelle ; coéquipiers libres pendant cette durée ; perte à la fin.
- **Exige** : ballon fiable ; identité de piste stable (même joueur tout du long).
- **Ne peut pas détecter** : un dribble qui crée un surnombre ; la durée « utile » dépend du joueur et du moment (seuil à fixer avec John).
- **Statut** : non évalué (raison : « seuil de durée à fixer »).
- **Validation** : ☐

### 3.2 Placement offensif

**R07 · Largeur mal occupée** (`largeur_mal_occupee`) — *Codée*
- **Définition** : en attaque, les joueurs de champ restent regroupés dans l'axe.
- **Mesure** : possession de mon équipe, ballon dans la moitié offensive (x ≥ 50 % de la longueur), au moins 3 joueurs de champ, écart entre le plus à gauche et le plus à droite inférieur à 40 % de la largeur, pendant au moins 3 s.
- **Exige** : ballon fiable (possession), positions de mes joueurs de champ fiables.
- **Ne peut pas détecter** : une occupation étroite voulue (combinaison courte, 3-1 compact).
- **Validation** : ☐

**R08 · Attaque statique / prévisible** (`attaque_statique`) — *Codée*
- **Mesure** : possession de mon équipe ; au moins 3 joueurs de champ suivis sur deux images voisines ; vitesse moyenne inférieure à 0,5 m/s pendant au moins 4 s.
- **Exige** : ballon fiable, suivi des joueurs.
- **Ne peut pas détecter** : une attente voulue (gestion du score, temps mort).
- **Validation** : ☐

**R09 · Pivot isolé / porteur non soutenu** (`pivot_isole`) — *Codée*
- **Mesure** : mon équipe a le ballon, le porteur est dans le dernier 40 % offensif (x ≥ 60 %), aucun coéquipier de champ à moins de 6 m, pendant au moins 1,5 s.
- **Exige** : ballon fiable, porteur identifié (piste).
- **Ne peut pas détecter** : un pivot qui garde volontairement le ballon dos au but.
- **Validation** : ☐

**R10 · Absence de mouvement sans ballon** (`absence_mouvement`) — *Non codée*
- **Définition** : un joueur sans ballon reste statique alors que l'équipe attaque.
- **Mesure envisagée** : vitesse individuelle ; besoin d'identité de piste stable.
- **Exige** : suivi individuel fiable sur plusieurs secondes.
- **Statut** : non évalué (raison : « suivi individuel pas assez stable »).
- **Validation** : ☐

**R11 · Tir précipité ou mal préparé** (`tir_precipite`) et **R12 · Occasion franche manquée** (`occasion_manquee`) — *Non codées*
- **Définition** : tir pris sans équilibre ni appui (R11) ; tir ou passe décisive manqués devant le but (R12).
- **Mesure envisagée** : détection d'un tir = ballon rapide vers le but ; contexte (défenseurs proches, coéquipiers libres).
- **Exige** : ballon vu sur le tir (vitesse, direction) ; gardien et buts repérés.
- **Ne peut pas détecter** : la qualité technique du geste, le caractère « franc » d'une occasion (jugement).
- **Statut** : non évalué (raison : « les tirs ne sont pas détectés »).
- **Validation** : ☐ (R11) ☐ (R12)

**R13 · Transition offensive lente** (`transition_off_lente`) et **R14 · Supériorité non convertie** (`superiorite_non_convertie`) — *Non codées*
- **Définition** : après une récupération, l'équipe met trop de temps à progresser (R13) ; elle ne profite pas d'un surnombre local (R14).
- **Mesure envisagée** : temps entre la récupération et l'arrivée dans le tiers offensif ; nombre de joueurs de chaque équipe dans la zone du ballon.
- **Exige** : ballon fiable ; comptage des joueurs de champ sans les remplaçants.
- **Statut** : non évalué.
- **Validation** : ☐ (R13) ☐ (R14)

### 3.3 Transitions défensives et défense placée

**R15 · Contre-attaque adverse concédée** (`contre_attaque_subie`) — *Codée*
- **Mesure** : après une perte (R01/R02), pendant 4 s : l'adversaire avance d'au moins 20 % de la longueur et compte plus d'attaquants (à moins de 4 m derrière le ballon, dans les 60 % défensifs) que mon équipe n'a de défenseurs côté but.
- **Exige** : ballon fiable ; positions des deux équipes.
- **Ne peut pas détecter** : une contre-attaque stoppée par une faute tactique.
- **Validation** : ☐

**R16 · Repli défensif tardif** (`repli_tardif`) — *Codée*
- **Mesure** : après une perte, l'adversaire avance d'au moins 4 m, le ballon est dans les 55 % défensifs, et au plus 1 joueur de champ de mon équipe est entre le ballon et mon but.
- **Exige** : ballon fiable ; positions.
- **Ne peut pas détecter** : un repli voulu en bloc bas.
- **Validation** : ☐

**R17 · Équipe trop étirée** (`equipe_etiree`) — *Codée*
- **Mesure** : l'adversaire a le ballon ; la profondeur de mes joueurs de champ (x le plus avancé − x le plus reculé) dépasse 50 % de la longueur pendant au moins 2 s.
- **Exige** : ballon fiable (pour savoir qui défend), au moins 3 joueurs de champ suivis.
- **Ne peut pas détecter** : un étirement voulu (pressing haut coordonné). *Question pour John : cette erreur exige-t-elle vraiment le ballon ? Aujourd'hui oui (la mesure ne vaut que quand l'adversaire a le ballon).*
- **Validation** : ☐

**R18 · Espace dans le dos du dernier défenseur** (`espace_dos_fixo`) — *Codée*
- **Mesure** : l'adversaire a le ballon dans les 70 % défensifs ; un adversaire est à plus de 1,5 m derrière mon dernier défenseur (dans les 45 % défensifs) et à plus de 3 m de tout joueur de mon équipe, pendant au moins 1,2 s.
- **Exige** : ballon fiable ; positions.
- **Ne peut pas détecter** : un piège du hors-jeu (il n'y a pas de hors-jeu en futsal : l'espace est réellement ouvert).
- **Validation** : ☐

**R19 · Marquage perdu / joueur oublié** (`marquage_perdu`) — *Codée*
- **Mesure** : l'adversaire a le ballon ; un autre adversaire est dans les 30 % défensifs, proche de l'axe (moins de 40 % de la largeur autour du centre), à moins de 12 m du ballon et à plus de 3,5 m de tout joueur de mon équipe, pendant au moins 1,5 s.
- **Exige** : ballon fiable ; positions.
- **Ne peut pas détecter** : si c'est une consigne de marquage individuel ou de zone (le programme ne connaît pas la consigne : voir « Mon plan tactique »).
- **Validation** : ☐

**R20 · Pressing non coordonné** (`pressing_desorganise`) et **R21 · Aide défensive absente** (`aide_defensive_absente`) — *Non codées*
- **Définition** : joueurs qui pressent sans couvrir (R20) ; pas de doublement ni de couverture derrière le presseur (R21).
- **Mesure envisagée** : distance au porteur de chaque joueur, ligne de passe fermée, couverture derrière le presseur.
- **Exige** : ballon fiable et positions précises (marge de 1 m) ; identités de piste stables.
- **Statut** : non évalué (raison : « précision de position insuffisante pour juger la coordination »).
- **Validation** : ☐ (R20) ☐ (R21)

**R22 · Faute évitable** (`faute_evitable`) et **R23 · Duel 1 contre 1 perdu** (`duel_perdu`) — *Non codées*
- **Définition** : faute commise sans nécessité (R22) ; duel individuel perdu (R23).
- **Exige** : détection du contact et de l'arbitrage (coup de sifflet, geste de l'arbitre) pour R22 ; suivi individuel fiable pour R23.
- **Ne peut pas détecter** : les fautes (aucun signal sonore ni geste d'arbitre n'est analysé) ; le décompte des fautes cumulées n'est pas fait.
- **Statut** : non évalué (raison : « fautes non détectées »).
- **Validation** : ☐ (R22) ☐ (R23)

**R24 · Maîtrise technique (contrôle raté)** — *Proposition nouvelle, non codée*
- **Définition proposée** : le ballon échappe au joueur qui le reçoit (rebond long après réception) sans pression adverse.
- **Mesure envisagée** : après réception, écart ballon–joueur supérieur à un seuil ; ballon en mouvement rapide ; perte ensuite.
- **Exige** : ballon fiable à haute cadence (au moins 15 images par seconde autour de la réception) ; flou de bougé géré.
- **Ne peut pas détecter** : la cause (passe trop forte ou mauvais contrôle).
- **Statut** : non évalué (raison : « cadence d'analyse insuffisante pour voir un contrôle »).
- **Validation** : ☐

### 3.4 Gardien, power play, coups de pied arrêtés

**R25 · Erreur de placement ou d'arrêt du gardien** (`erreur_gardien`) et **R26 · Sortie du gardien mal timée** (`sortie_gardien`) — *Non codées*
- **Exige** : identification du gardien ; position du tir ; ballon fiable.
- **Statut** : non évalué (raison : « les tirs et les arrêts ne sont pas détectés »).
- **Validation** : ☐ (R25) ☐ (R26)

**R27 · Violation de la règle des 4 secondes** (`regle_4s`) — *Non codée*
- **Définition** : le gardien garde le ballon plus de 4 s dans sa moitié de terrain.
- **Mesure envisagée** : durée de possession du gardien identifié.
- **Exige** : gardien identifié ; ballon vu sans trou pendant toute la durée.
- **Statut** : non évalué (raison : « le gardien n'est pas identifié de façon fiable »).
- **Validation** : ☐

**R28 à R30 · Power play** (`gj_perte_balle`, `gj_timing`, `gj_repli_non_assure`) — *Non codées*
- **Exige** : détecter le gardien-joueur (5 joueurs de champ, but vide).
- **Statut** : non évalué (raison : « le gardien-joueur n'est pas détecté »).
- **Validation** : ☐ ☐ ☐

**R31 · Coup de pied arrêté défendu de façon désorganisée** (`cpa_def_desorganise`) et **R32 · Coup de pied arrêté offensif raté** (`cpa_off_rate`) — *Non codées*
- **Exige** : détection du coup de pied arrêté (arrêt de jeu, ballon posé, joueurs placés).
- **Statut** : non évalué (raison : « les coups de pied arrêtés ne sont pas détectés »).
- **Validation** : ☐ (R31) ☐ (R32)

## 4. Ce que le programme ne jugera jamais
- L'**intention** d'un joueur ou d'un coach (consigne, choix tactique volontaire).
- La **qualité technique** d'un geste (frappe, contrôle) autrement que par ses conséquences visibles.
- Les **fautes et décisions d'arbitrage** (aucun son, aucun geste d'arbitre analysé).
- Tout ce qui dépend d'un **ballon inconnu** : aucune erreur liée au ballon n'est affichée dans ce cas (règle d'or).

## 5. Questions à trancher par John
1. R17, R18, R19 : ces erreurs doivent-elles exiger un ballon fiable (c'est le cas aujourd'hui) ou sont-elles de pur placement (donc possibles sans ballon) ?
2. R06 : seuil de durée de possession individuelle « trop longue » (en secondes) ?
3. R03 et R24 : veux-tu les ajouter (propositions nouvelles) ?
4. Règlement de ta compétition : durée de la rentrée de touche, fautes cumulées, remplacements : à confirmer pour la section 1.

## 6. Mise à jour : règles codées dans « Analyse v2 (bêta) »
Sept règles qui étaient « non codées » sont maintenant mesurées par la bêta. **Leurs seuils sont des propositions** : elles s'affichent « règle non validée » dans l'application tant que tu ne les as pas validées ou rejetées (boutons « Valider » / « Rejeter » sur chaque erreur et dans le tableau de couverture). Les seuils exacts sont aussi écrits dans `src/engine/regles.js`.

| Règle | Seuils codés (propositions) |
|---|---|
| **R03** Perte de balle inutile | Perte R01/R02 avec moins de 2 adversaires à moins de 3 m du porteur, et un coéquipier de champ libre (aucun adversaire à moins de 3 m) à 3 à 12 m du porteur. |
| **R04** Relance risquée | Perte en zone défensive avec au moins 2 adversaires à moins de 3 m ; porteur = gardien ou dernier défenseur de champ. |
| **R06** Dribble excessif | Même joueur avec le ballon au moins **6 s** (seuil proposé), un coéquipier libre à 12 m ou moins pendant au moins la moitié du temps. |
| **R10** Absence de mouvement | Joueur de champ sans ballon à moins de **0,3 m/s** pendant au moins **5 s** (vitesse lissée dans les deux sens du temps) alors que mon équipe a le ballon. |
| **R13** Transition offensive lente | Récupération dans les deux premiers tiers, ballon gardé 4 s, avancée de moins de **4 m**, au moins 2 coéquipiers de champ à plus de 5 m devant. |
| **R14** Supériorité mal exploitée | Au moins **2 joueurs de champ de plus** que l'adversaire à 8 m ou moins du ballon pendant au moins **3 s**, ballon avancé de moins de 3 m. |
| **R27** Règle des 4 secondes | Gardien de mon équipe avec le ballon (à 2,2 m ou moins), vu sans trou, dans sa moitié, au moins **4,0 s**. |

Toujours **non évaluées** (avec leur raison dans le tableau de couverture) : R05, R11, R12, R20 à R26, R28 à R32.
Rappel : ces règles ne sont **pas mesurées** en précision ni en couverture sur un match jamais vu : cette mesure attend tes erreurs notées à la main.
