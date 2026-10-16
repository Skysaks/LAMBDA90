# Lambda 90

Plateforme de probabilités football : moteur Dixon-Coles + tirs cadrés + pi-ratings, live minute par minute, value betting, arbitrage, bankroll, défis entre amis, stories 3D.

## Mise à jour automatique (coût : 0 € au départ)

Chaque matin, GitHub Actions récupère les résultats et les cotes, ré-entraîne le moteur et reconstruit `lambda-90.html`. Le lundi, il relance aussi le réglage complet et le backtest.

1. Crée un dépôt **privé** sur GitHub et dépose tout le contenu de ce dossier.
2. Dans *Settings → Secrets and variables → Actions*, ajoute les secrets :
   - `ODDS_API_KEY` : ta clé The Odds API (offre gratuite, 500 crédits par mois, soit 16 crédits par passage et environ 31 passages par mois) ;
   - `FOOTBALL_DATA_TOKEN` : jeton gratuit à créer sur football-data.org (12 compétitions, 10 appels par minute, scores différés) ;
   - `API_FOOTBALL_KEY` (facultatif) : clé API-Football (dashboard.api-football.com). Blessures et suspensions chaque matin, compositions officielles toutes les heures de 12 h 40 à 23 h 40 (heure de Paris, été). L’offre gratuite (100 appels par jour) sert à tester, si elle couvre la saison en cours (à vérifier sur leur page tarifs) ; la Pro (7 500 par jour, 19 $/mois) pour la production. Sans cette clé, les étapes sont simplement ignorées.
3. Onglet *Actions* → « Mise à jour Lambda 90 » → *Run workflow* pour le premier passage, d'environ 5 minutes.
4. Donne le nom du dépôt à l'assistant : il programme une tâche qui republie chaque jour la page sur la plateforme d'hébergement à partir du fichier construit.

Les minutes GitHub Actions gratuites des dépôts privés (2 000 par mois) couvrent le passage quotidien (environ 5 minutes, 20 le lundi) et le passage horaire des compositions (moins d'une minute, environ 12 par jour).

Le lundi, la chaîne télécharge aussi les cotes de clôture Pinnacle (football-data.co.uk) et calcule la CLV du modèle (`clv.py`) : c'est la mesure de confiance de référence, visible dans le Registre.

## Héberger la page pour le public

Le fichier `lambda-90.html` construit dans le dépôt est autonome. Pour l'ouvrir au public avant l'application complète : Cloudflare Pages, connecté au dépôt privé (gratuit), avec le domaine choisi.

## Sources de données, de la moins chère à la plus précise

| Source | Coût | Apporte | Statut |
| --- | --- | --- | --- |
| openfootball/football.json | gratuit (CC0) | Calendrier, résultats (mises à jour irrégulières) | branché |
| Club Football Match Data (xgabora) | gratuit (MIT ; données football-data.co.uk) | 238 858 matchs : tirs, tirs cadrés, corners, cartons, cotes Bet365 et meilleures cotes | branché |
| football-data.org, offre gratuite | 0 € | Résultats des 8 championnats, différés | branché dans la chaîne |
| The Odds API, Starter | 0 € | Cotes de 20+ bookmakers, 1 mise à jour par jour | branché dans la chaîne |
| The Odds API 20K | 30 $/mois | Cotes toutes les heures | à activer selon les abonnés |
| football-data.org avec scores live | 12 €/mois | Scores en direct | optionnel |
| API-Football (gratuit pour tester, Pro 19 $/mois) | 0 à 19 $/mois | Compositions confirmées, blessures, suspensions | branché dans la chaîne (secret `API_FOOTBALL_KEY`), affiché sur la page match, pas encore dans les probabilités |
| football-data.co.uk, cotes de clôture | gratuit | Clôture Pinnacle et Bet365 pour la CLV | branché (le lundi) |
| Sportmonks + module xG | dès 29 €/mois + 24 €/mois | xG | plus tard |

Vérifie les conditions d'usage commercial de chaque source avant le lancement payant.

## Construire à la main

```bash
git clone --depth 1 https://github.com/xgabora/Club-Football-Match-Data-2000-2025.git /tmp/xg
git clone --depth 1 https://github.com/openfootball/football.json.git /tmp/of
python engine3_final.py /tmp/xg/data /tmp/of out
./mk.sh            # assemble app_full.js et écrit lambda-90.html
```

Ne mets jamais une clé API dans un fichier du dépôt : seulement dans les secrets.

Le moteur de prédiction, ses tests et sa feuille de route sont décrits dans MOTEUR.md.
