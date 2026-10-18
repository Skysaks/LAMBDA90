# Lambda 90

Plateforme indépendante de probabilités football pour les fans et les parieurs : prévisions avant-match et live, prix justes face aux cotes réelles des bookmakers, outils de paris, jeux entre amis et création de contenu. Huit championnats : Ligue 1, Premier League, LaLiga, Bundesliga, Serie A, Liga Portugal, Eredivisie, Championship.

Principe : chaque chiffre affiché est mesuré hors échantillon, et la plateforme dit quand le marché a raison contre elle. Le moteur, ses tests et leurs résultats sont détaillés dans [MOTEUR.md](MOTEUR.md).

## Ce que contient la page

| Onglet | Contenu |
| --- | --- |
| Jour (accueil) | Brief personnel ; Ma liste (tes matchs suivis, ajoutés à la main ou depuis une capture Winamax lue par l'IA : probabilités de tous les marchés, cote juste, valeur à tes cotes, recalcul en direct avec la minute et le score) ; Top Picks du jour, de 1 à 15 au choix, avec arguments chiffrés et version prudente (double chance, remboursé si nul) ; Paris du jour par marché (double chance, remboursé si nul, ±1,5, ±2,5, −3,5, les deux marquent), figés chaque matin et réglés ; Top Picks Combinés (combiné sûr, cotes 2, 3 et 5, sans match commun quand c'est possible, figés et réglés) et constructeur de combiné (nombre de matchs, plus sûrs ou cote visée, meilleur bookmaker commun) ; pick du jour (1N2, buts, les deux marquent, corners, cartons) ; Hot Picks ; Cold Games ; bilan de la veille et registre figé chaque matin, réglé avec les résultats officiels |
| Radar | Les matchs à venir, probabilités, valeur et arbitrages repérés |
| Match | Probabilités et fourchette à 80 %, scores exacts, face-à-face depuis 2000 (bilan, buts, les deux marquent, même stade, mi-temps, corners, cartons), jumeaux historiques (les 150 matchs passés aux cotes de clôture les plus proches), buts par tranche, scénarios « et si », tous les marchés, corners et cartons, créateur de paris recalé sur Pinnacle, compositions et absences, live minute par minute avec terrain 3D, mouvement des cotes, stories 3D |
| Saison | 10 000 saisons simulées par championnat : titre, places, relégation, Predictor, Power Index |
| Défis | Pronostics entre amis, ligues privées, classement contre le modèle |
| Value et arbitrage | Paris au-dessus du prix juste, arbitrages, calculateurs, mise de Kelly, mes bookmakers |
| Objectif ×2 | Montante intégrale de 5 à 10 paliers enchaînés dans le temps, escalier 3D, sélections les plus probables |
| Survivant | Faire grossir une bankroll sans jamais passer sous la mise minimale (Game Over) : 48 plans simulés (Monte Carlo) et surface 3D, plan optimal selon le risque toléré, partie réglée automatiquement ; parties classées et classements Monde, Amis et Ville |
| Outils | Algorithmes des bookmakers (ce que chacun rend par type de pari, où jouer quoi, même marque en France et à l'étranger, qui copie qui, pièges) ; relief 3D de la valeur et des marges, prix de la patience (ouverture contre clôture, biais favori-outsider), cotes boostées, conversion de freebets et de paris remboursés, couverture et cash-out, dutching |
| Studio | Atelier plein écran : choix d'un match en particulier ; 10 contenus (Top, combinés, bilan, avant-match, face-à-face, Hot et Cold, Survivant, saison, calibration, marges) en 4 formats (YouTube 16:9, Shorts/Reels/TikTok 9:16, post 1:1, carrousel 4:5) ; aperçu net ajusté à l'écran, frise des diapos, lecture et curseur ; accroche d'ouverture, @compte, 3 thèmes, durée par diapo ; export image, carrousel, vidéo et pack complet (images + textes) ; titre, légende, description avec chapitres et script modifiables |
| Bankroll | Journal avec CLV et règlement automatique, courbe de bankroll, disjoncteur, coach anti-tilt (chasse aux pertes, glissement vers les grosses cotes, rafales de paris) |
| Registre | Calibration, RPS, laboratoire : chaque signal testé, adopté ou rejeté |

Navigation : Jour, Radar, Match, Saison, menus Paris (Value, Objectif ×2, Outils, Bankroll) et Jeux (Survivant, Défis), Studio, Registre. Partout : ticket de pari (probabilité jointe exacte, meilleure cote chez un seul bookmaker, espérance), recherche universelle (Ctrl+K ou /), modes Fan et Quant, affichage mobile.

## Le moteur en bref

- Dixon-Coles pondéré dans le temps sur les buts et sur les tirs cadrés, pi-ratings, empilement logistique appris sur les seules saisons passées ; fourchette d'incertitude par match.
- RPS hors échantillon 2025-26 : 0,2015 pour le moteur, 0,1981 pour le marché. La probabilité des picks est le marché Pinnacle sans marge (Shin) : y mêler du modèle dégrade la précision (labo 13).
- Labo 13 : rétro-ingénierie des prix des bookmakers (structure et répartition des marges, surcoût français, qui copie qui, retard sur Pinnacle, piège des outsiders face aux clubs populaires).
- Testés et rejetés, entre autres : xG, valeur du onze, enjeux, Elo, gradient boosting, ensemble multi-horizon, corners dans le moteur, constantes par championnat, moyennes brutes de corners, fatigue (repos court) et face-à-face au-delà du marché (labo 14). Détail et chiffres : [MOTEUR.md](MOTEUR.md).

## Chaîne de mise à jour (GitHub Actions)

| Workflow | Quand | Ce qu'il fait |
| --- | --- | --- |
| `update.yml` « Mise à jour Lambda 90 » | chaque jour vers 7 h (Paris) | résultats, cotes gratuites (Bet365, Pinnacle et moyenne du marché par football-data), historique des cotes, journal de value, clôtures, blessures ; entraînement final ; corners et cartons ; jumeaux et prix de la patience ; picks du jour figés et réglés ; reconstruction de `lambda-90.html`. Le lundi : réglage complet, backtest, CLV, labo corners et cartons. The Odds API n'est appelée que sur demande (lancement manuel, case « cotes » cochée par défaut, ou bouton Rafraîchir) : seuls les championnats qui jouent dans les 48 h sont interrogés, avec une réserve de crédits |
| `lineups.yml` « Compositions officielles » | toutes les heures, 12 h 40 à 23 h 40 | compositions confirmées (API-Football) |
| `lab.yml` « Labo API » | chaque nuit | tests sur les données API-Football |
| `lab_data.yml` « Labo données gratuites » | le lundi | xG Understat, valeur des effectifs |

Les minutes gratuites de GitHub Actions pour un dépôt privé (2 000 par mois) couvrent l'ensemble.

## Héberger sur Cloudflare Pages (mise à jour automatique)

`mk.sh` copie la page dans `site/index.html` (avec `_headers` et `robots.txt` : page non indexée). Dans Cloudflare : *Workers & Pages → Create → Pages → Connect to Git*, dépôt LAMBDA90, aucune commande de build, dossier de sortie `site`. Chaque commit du robot (mise à jour quotidienne, compositions, cotes) redéploie la page. Pour la réserver à quelques personnes : Cloudflare Zero Trust → Access (gratuit jusqu'à 50 utilisateurs). Sur cet hébergement, le bouton Rafraîchir appelle directement The Odds API ; les fonctions qui demandent un compte (classements Survivant, ligues, lecture de captures par l'IA, cotes partagées) restent propres à la version hébergée avec comptes.

## Offres payantes

- The Odds API 20K (30 $/mois) : mettre la variable de dépôt `ODDS_HOURLY` à `on` active `odds_hourly.yml` (chaque heure de 10 h 15 à 21 h 15 UTC, championnats qui jouent dans les 6 h, réserve de 200 crédits).
- API-Football Pro (19 $/mois) : remplacer la clé `API_FOOTBALL_KEY` ; `lineups.yml` récupère déjà les compositions toutes les heures.

## Installation

1. Dépôt privé sur GitHub contenant ce dossier.
2. *Settings → Secrets and variables → Actions*, trois secrets :
   - `ODDS_API_KEY` : The Odds API (offre gratuite : 500 crédits par mois) ;
   - `FOOTBALL_DATA_TOKEN` : football-data.org (gratuit, résultats différés) ;
   - `API_FOOTBALL_KEY` (facultatif) : API-Football, pour les blessures, suspensions et compositions. Sans elle, ces étapes sont ignorées.
3. Onglet *Actions* → « Mise à jour Lambda 90 » → *Run workflow* pour le premier passage (environ 5 minutes).
4. Le fichier `lambda-90.html` construit dans le dépôt est autonome : il s'héberge tel quel (Cloudflare Pages, Netlify, ou la plateforme d'hébergement de ton choix). Les fonctions partagées (ligues, classements Survivant, journal synchronisé, téléchargements, analyse IA) demandent un hébergeur qui fournit comptes et stockage ; sans lui, la page fonctionne en mode local (navigateur).

Ne mets jamais une clé API dans un fichier du dépôt : seulement dans les secrets.

## Sources de données

| Source | Coût | Apporte |
| --- | --- | --- |
| [Club Football Match Data](https://github.com/xgabora/Club-Football-Match-Data-2000-2025) (football-data.co.uk + ClubElo) | gratuit | historique depuis 2000 : buts, tirs, corners, cartons, cotes, Elo |
| [openfootball](https://github.com/openfootball/football.json) | gratuit (CC0) | calendrier et résultats |
| football-data.org | gratuit | résultats récents des 8 championnats |
| The Odds API | gratuit puis 30 $/mois | cotes de 20+ bookmakers dont Pinnacle, Winamax, Betclic, Unibet, PMU |
| football-data.co.uk (fixtures.csv, clôtures) | gratuit | cotes Bet365 et moyenne du marché, clôtures Pinnacle et Bet365 pour la CLV |
| API-Football | gratuit pour tester, Pro 19 $/mois | compositions, blessures, suspensions |
| Understat, jeu ouvert Transfermarkt | gratuit | xG et valeurs des joueurs, utilisés au laboratoire |

Vérifie les conditions d'usage commercial de chaque source avant un lancement payant.

## Structure du dépôt

| Fichiers | Rôle |
| --- | --- |
| `engine3.py`, `engine3_final.py`, `uncert.py`, `dc_core.py` | moteur avant-match, entraînement final, incertitude |
| `model_live.py`, `model_prematch.py`, `model_extra.py` | moteur live minute par minute et données annexes |
| `pipeline/` | collecte (résultats, cotes, Bet365, clôtures, compositions), journal de value, picks du jour, corners et cartons, jumeaux et prix de la patience |
| `lab*.py`, `clv.py`, `engine3_eval.py` | laboratoire : chaque signal testé hors échantillon (`lab13_books.py` : algorithmes des bookmakers) |
| `core.js`, `app.js`, `part_*.js`, `template.html` | la page (noyau quant, onglets, 3D, Studio) |
| `build.py`, `mk.sh` | assemblage de `lambda-90.html` |
| `data/`, `out/` | données collectées, sorties du moteur, registre des picks (`data/daily_picks.json`) |
| `founder/` | dossier de lancement |

## Construire à la main

```bash
git clone --depth 1 https://github.com/xgabora/Club-Football-Match-Data-2000-2025.git /tmp/xg
git clone --depth 1 https://github.com/openfootball/football.json.git /tmp/of
python engine3_final.py /tmp/xg/data /tmp/of out
python pipeline/props_build.py /tmp/xg/data out
python pipeline/insights_build.py .
python pipeline/daily_picks.py .
bash mk.sh         # assemble app_full.js et écrit lambda-90.html
```

## Jeu responsable

Lambda 90 publie des probabilités et des calculs, pas des certitudes ; elle ne prend aucun pari. Le jeu est interdit aux mineurs. Jouer comporte des risques : endettement, isolement, dépendance. Pour être aidé : 09 74 75 13 13 (Joueurs Info Service, appel non surtaxé). En France, seuls les opérateurs agréés par l'ANJ sont autorisés.
