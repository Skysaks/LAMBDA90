# Moteur de prédiction : état, preuves, feuille de route

## Ce que fait le moteur aujourd'hui

1. Dixon-Coles sur les buts, ajusté en commun 1re + 2e division, demi-vie 231 jours (`engine3.py`).
2. Même modèle sur les tirs cadrés, plus les pi-ratings.
3. Empilement logistique appris sur les saisons passées uniquement (`engine3_final.py`).
4. Recalage des totaux, ×1,12 sur les buts d'une équipe sans enjeu en fin de saison.
5. Fourchette à 80 % par match : incertitude des forces des deux modèles (information de Fisher exacte, `uncert.py`) propagée à travers l'empilement.

Score hors échantillon 2025-26 : RPS 0,2015. Bet365 (Shin) fait 0,1981, la clôture Pinnacle fait mieux encore. Sur le 1N2 avant-match, le modèle n'ajoute rien au marché (lab6) : quand de vraies cotes sont branchées, la page affiche une probabilité de référence à 90 % marché. La valeur propre du moteur est ailleurs : live, marchés dérivés cohérents (buts, mi-temps, handicaps, combinés d'un même match), scénarios, incertitude, explications.

## Tests menés (`lab2.py`, `lab2b.py`, `lab3.py`, `lab4.py`)

| Signal | Résultat | Décision |
| --- | --- | --- |
| Enjeux du classement (titre, maintien, sans enjeu) en 1N2 | RPS 0,2029 avec contre 0,2018 sans ; idem au-dessus du marché | Rejeté : déjà dans les cotes |
| Équipe sans enjeu, sur les buts | ×1,12 (IC 95 % 1,01 à 1,25) ; le marché le price déjà (55,3 % de +2,5 attendu, 55,0 % observé) | Adopté pour rattraper le marché |
| Lutte pour le maintien, sur les buts | ×1,03 (IC 0,96 à 1,10) | Sans effet |
| Titulaires habituels absents (PL + BL 2025-26) | +0,57 ‰ de RPS au-delà du marché, IC −1,1 à +2,2 ‰, 327 matchs | Non prouvé, faute de données |
| Fourchette à 80 % | La cote du marché y tombe 93 % du temps | Adoptée, prudente |
| Premier League dans le fit Championship | RPS 0,2166 contre 0,2154 | Rejeté |
| Recalage du nombre total de buts (0 à 6+) | Gain de RPS significatif sur 3 386 matchs (IC du gain 0,4 à 0,7 ‰) ; 0-0 et 6+ moins fréquents que Poisson | Adopté |
| Binomiale négative (surdispersion) | Pas meilleure que Poisson | Rejeté |
| Modèle sur les tirs totaux | RPS 0,2019 contre 0,2015 avec les seuls tirs cadrés | Rejeté |
| Mélange modèle + marché (Bet365) | Meilleur poids du marché : 100 % (RPS 0,1981 contre 0,2015 pour le modèle) | Référence affichée : 90 % marché, 10 % modèle |
| Value du modèle face à la clôture Pinnacle (CLV, données réelles) | CLV −4,5 % (IC −5,0 à −4,1 %) sur 1 137 paris : la cote évolue contre le modèle | Ne pas parier la value du modèle seul |
| Bet365 au-dessus du prix juste Pinnacle (4 369 matchs) | 88 paris, CLV −0,6 % (IC −3,2 à +1,7 %) | Pas d'avantage prouvé |
| Paris annoncés à 75-85 % | 77,9 % réussis, cote moyenne 1,22, rendement −5 % | Calibré, pas rentable |
| Gradient boosting | RPS 0,2028 contre 0,2015 | Rejeté |

## Tests en cours (GitHub Actions)

- Journal de value (`pipeline/value_log.py`, `value_eval.py`) : chaque jour, toute cote d'un bookmaker au-dessus du prix juste Pinnacle est notée puis jugée à la clôture. Premier relevé : 264 cotes, dont 5 seulement chez des bookmakers agréés en France (TRJ plafonné à 85 %).
- xG Understat (`lab9_xg.py`) et valeur du onze aligné, jeu de données ouvert Transfermarkt (`lab10_tm.py`) : workflow « Labo données gratuites ».
- Compositions et notes des joueurs API-Football (`lab_api.py`) : demande l'offre Pro (l'offre gratuite n'ouvre que 2022-2024, sans appels groupés ni saison en cours).

## Critères de confiance (mesurables, pas des impressions)

1. **Calibration** : quand le moteur dit 40 %, ça arrive 40 % du temps (Registre).
2. **RPS contre la clôture Pinnacle** : l'écart doit se réduire ; le battre sur 1N2 n'est pas l'objectif réaliste.
3. **CLV** (`clv.py`, chaque lundi) : quand le moteur voit de la valeur, la cote baisse-t-elle avant le coup d'envoi ? Une CLV moyenne positive, IC à 95 % au-dessus de 0, sur 500 paris ou plus = avantage réel. Sinon, pas d'avantage, quoi que dise le ROI.
4. **Registre public et horodaté** de chaque prévision, avant le match.

## Feuille de route, par rendement attendu

| Ordre | Ajout | Source et coût | Pourquoi |
| --- | --- | --- | --- |
| 1 | Clôtures Pinnacle + CLV | football-data.co.uk, gratuit, déjà branché dans le pipeline | Seul juge honnête de l'avantage |
| 2 | Compositions officielles 1 h avant le match, blessures et suspensions | API-Football Pro, 19 $/mois | La seule « news » qui déplace vraiment les probabilités ; à tester sur plusieurs saisons |
| 3 | Valeur des joueurs absents (minutes, buts, passes par joueur) | Même source (statistiques joueurs des grands championnats) | Remplace le simple « absent / présent » |
| 4 | xG d'équipe | Understat, gratuit (FBref a perdu ses données avancées Opta) | Meilleur que les tirs cadrés sur le long terme, à prouver en walk-forward |
| 5 | Extraction IA des news (conférences de presse, presse locale) en faits structurés : « X forfait », « rotation annoncée » | Un modèle de langage sur flux RSS, quelques €/mois | Utile seulement pour les faits ; le ton ou l'« ambiance » sont du bruit déjà dans les prix |
| 6 | Mises à jour horaires des cotes les jours de match | The Odds API 20K, 30 $/mois | Suivre le mouvement du marché, alerter avant la clôture |

À ne pas faire : ajouter des signaux sans test hors échantillon. Le laboratoire montre que la forme, le repos, les enjeux et l'empilement de tout réunis dégradent la prévision.
