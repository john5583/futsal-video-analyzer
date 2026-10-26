# Définition de la mesure — note sur 100 par composant

Référence : `docs/cahier-des-charges.md` (§1 : **95/100 minimum**, mesuré sur un match **jamais vu**). Ce document est **figé avant de mesurer** : on ne le change pas pour améliorer un chiffre. Il reprend les définitions faites avec John pour le ballon (2026-10-22, version 2) et pour les joueurs (2026-10-23).

## Règles communes
- **Vérité de terrain = John** (étiquettes faites à l'aveugle dans l'application, menu Fichier > Étiquetage, ou verdicts du Contrôle rapide). Jamais le programme seul.
- **Un chiffre n'existe qu'avec son effectif et son intervalle** (Wilson à 95 %). « 95 prouvé » veut dire : **borne basse ≥ 93 %**, effectif minimal atteint, et les limites de faux respectées **en même temps**.
- **Vidéo jamais vue** : aucune image du match de test n'entre dans un réglage ni un entraînement. Match de test actuel : `20261019_211208` (4 min 10 s, utilisé 0 fois pour régler). `20261019_212111` a servi à régler le suivi de la caméra : il ne sert **pas** de test à l'aveugle.
- Ce qui ne peut pas être mesuré est écrit **« non évalué »** avec sa raison. Jamais 0 %, jamais une note inventée.
- Ce qui est mesuré ici est la fiabilité **pour les salles et caméras présentes dans le test**. Une salle absente n'est pas couverte.

## Les composants, leur note et leur seuil
| Composant | Note /100 = | Limites obligatoires en même temps | Effectif minimal pour « prouvé » | Outil |
|---|---|---|---|---|
| **Ballon** | part des images où le ballon est visible (au moins la moitié du disque, flou accepté, en main accepté si visible) et où le programme place le ballon à **≤ 20 px** du clic de John (échelle 1920 px) | **faux ballons ≤ 3 %** parmi les ballons affichés **et** parmi les images sans ballon visible | 600 images avec ballon, 100 sans, sur ≥ 3 séquences | `scripts/mesure/score.js` |
| **Joueurs : détection** | personnes étiquetées A, B, gardien (≥ 3 % de la hauteur de l'image) recouvertes par une détection (IoU ≥ 0,5, appariement un pour un) | fausses détections rapportées par type (remplaçant, public, arbitre, autre, rien) | 400 personnes cadrées | `score.js` |
| **Équipes affichées** | équipes **justes** parmi les équipes **affichées** (« inconnue » n'est pas affichée) | — | 400 comparaisons | `score.js` |
| **Identité gardée** | part des images où la personne porte sa piste principale (continuité) ; **fusions** (une piste pour deux personnes) comptées comme la faute la plus grave et doivent être **0** | fusions = 0 | 20 personnes suivies sur ≥ 3 min | `score.js` (piste) ; vraie identité affichée : étape 2 |
| **Entrées depuis le banc** | entrées reconnues (bon cadre, bonne équipe, comptée joueur) 3 s après l'entrée | remplaçants comptés à tort comme joueurs = 0 | ≥ 20 entrées (plusieurs matchs) | `score.js` |
| **Terrain collé aux lignes** | **non mesuré par ce script.** Mesure prévue (étape 3) : John clique 4 points des lignes sur des images échantillonnées ; écart en pixels entre le tracé et ces points | écart médian et 95e centile | ≥ 60 images, ≥ 3 salles | à faire |
| **Silhouettes** | silhouettes jugées « fidèles » par John parmi les silhouettes affichées (sinon cercle au sol, qui ne compte pas) | une silhouette fausse affichée = faute | 100 verdicts | Contrôle rapide |
| **Vue du dessus synchrone** | instants échantillonnés (lecture, pause, saut, ralenti) où la vue du dessus et la vidéo montrent **le même instant à 1 image près** | 0 instant où l'une avance sans l'autre | 200 instants, 4 modes | test de bout en bout (étape 4) |
| **Questions inutiles** | part des questions « Qui est-ce ? » posées sur un cas évident (jugé par John) | 0 sur les cas évidents (test automatique existant) | 50 questions | Contrôle rapide |

Un composant avec une **note** mais « 95 non prouvé » est annoncé comme tel (par exemple « 72 [68–76] sur 345 »).

## Le Contrôle rapide (verdicts de John sur ce que le programme affiche)
Pour les composants qu'on ne peut pas étiqueter à l'aveugle en un temps raisonnable (silhouettes, questions, identités affichées, ballon sur un long match), le programme choisit lui-même **des instants au hasard** (mélange fixe, mêmes instants à chaque fois pour une vidéo) et John répond **O** (oui, c'est juste) / **N** (non) / **?** (incertain) à une question courte. Les « ? » sont comptés à part. Moins de 5 secondes par image. Les verdicts sont gardés dans le projet (`ai.controleRapide`) et lus par `score.js --controle`.
Limite honnête : c'est une **mesure de précision** (ce qui est affiché est-il juste ?). Elle ne voit pas ce que le programme n'affiche pas ; le rappel vient des étiquettes à l'aveugle.

## Temps de John (estimation, non mesurée)
- Étiquettes à l'aveugle d'un match de 10–15 min : environ 30 à 35 min (images toutes les 3,3 s pour les joueurs, une image sur trois pour le ballon).
- Contrôle rapide : environ 100 verdicts par composant, de l'ordre de 5 à 8 min par composant.
Ces durées seront **mesurées** à la première utilisation et corrigées ici.

## État de départ connu (aucune nouvelle mesure dans cette PR)
- **Ballon** : 45,5 % retrouvé (tolérance 20 px, 345 ballons, 2026-10-22), faux ballons 28 % parmi les « vu » ; objectif 95 % / 3 %. Autres sources : 45–61 % selon la salle.
- **Joueurs, équipes, identités, entrées** : pas de chiffre sur un match jamais vu (les étiquettes du match de test sont à faire par John).
- **Terrain** : accord du tracé avec les lignes noires 14 → 39 % sur `212111` après la PR #40 (indice automatique, pas une vérité de terrain) ; lignes rouges/jaunes non suivies.
- **Silhouettes, vue du dessus synchrone, questions inutiles** : non évalué.

## Demande à John (une seule fois)
Une **vidéo de match de 10 à 15 minutes jamais utilisée** (ni pour régler, ni pour entraîner, ni pour montrer des exemples), idéalement d'une salle différente de celles déjà vues, pour mesurer honnêtement les entrées/sorties du banc et les erreurs affichées. Sans elle, les chiffres sur plus de 4 minutes ne peuvent pas être « à l'aveugle ».
