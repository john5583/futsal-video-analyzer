# Registre des personnes (étape 2 « identités ») — état honnête, 2026-10-26

## Ce qui existe
`src/ai/registre.js` construit, à partir des pistes de l'analyse, **une fiche par personne** (« Personnes reconnues » dans les résultats) : équipe, passages sur le terrain, historique d'apparitions/disparitions (bord du terrain ou milieu), taille relative, statut **sûre / probable / non identifiée** avec la raison. Deux morceaux de piste ne sont rattachés que s'il n'y a **aucune ambiguïté** (un seul candidat dans les deux sens, même équipe, vitesse plausible, pas de chevauchement dans le temps). Au moindre doute : « non identifiée », jamais une fausse étiquette.

## Ce que cela donne sur de vraies analyses (indices, pas une mesure de justesse : aucune fiche de John pour comparer)
| Analyse | Pistes | Personnes | sûres / probables / non identifiées | Rattachements | Refusés (ambigus) | Une personne avec 2 pistes à la fois |
|---|---|---|---|---|---|---|
| 20261019_212111 (13 min) | 400 (260 gardées) | 242 | 36 / 1 / 205 | 18 | 304 | 0 |
| Vidéo 1 (3 min) | 97 (67) | 58 | 5 / 1 / 52 | 9 | 73 | 0 |
| 20261012_214004 (2 min) | 97 (60) | 59 | 6 / 0 / 53 | 1 | 93 | 0 |

**Lecture honnête** : sur un match, il y a une dizaine de personnes sur le terrain ; le registre en annonce **des dizaines** parce que, **sans autre indice que la position**, presque tous les rattachements sont ambigus (cinq coéquipiers en tenue identique). Le registre ne se trompe pas (zéro chevauchement, zéro rattachement douteux accepté), mais il **n'identifie presque personne** : l'objectif « identités affichées 95 % justes » n'est **pas atteint** et ne peut pas l'être avec ces seuls indices.

## Pourquoi et ce qu'il faudrait
- Les coéquipiers portent la même tenue : la couleur ne les distingue pas. Il faut un indice propre à chaque personne : **numéro de maillot lisible** (non lu aujourd'hui), taille, accessoire, chaussures, coupe de cheveux, ou **une réponse de John** (« c'est Léo ») propagée sans ambiguïté.
- Les signatures de couleur (`signature.js`) servent au suivi mais ne sont **pas gardées** dans l'analyse : le registre ne peut pas les comparer. Les garder demande de relancer les analyses (non fait ici).
- Mesure à faire : John crée les **fiches** et cadre « Qui est-ce ? » sur le match de test (Fichier > Étiquetage > Joueurs) ; `scripts/mesure/score.js` rend alors la continuité de piste, les changements et les **fusions** (objectif : 0).

## Non évalué
Justesse des identités (aucune fiche de référence) ; passage au banc et retour (le registre note les disparitions par le bord, ne reconnaît pas le banc : étape 5) ; tenue par zones et numéro (`null`, non lus).
