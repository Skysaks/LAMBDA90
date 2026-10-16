"""Cotes avant-match des 8 championnats via The Odds API (région eu : Pinnacle, Betclic, Winamax, Unibet, PMU…).
Coût : 2 crédits par championnat (marchés h2h + totals), soit 16 par passage. Clé : ODDS_API_KEY.
Écrit out/feed_odds.json, embarqué dans la page au build."""
import json, os, time, urllib.request
from pathlib import Path
SPORTS = ["soccer_france_ligue_one", "soccer_epl", "soccer_spain_la_liga", "soccer_germany_bundesliga", "soccer_italy_serie_a",
          "soccer_portugal_primeira_liga", "soccer_netherlands_eredivisie", "soccer_efl_champ"]
key = os.environ.get("ODDS_API_KEY", "").strip(); events = []; remaining = None
if not key: print("pas de ODDS_API_KEY : étape ignorée"); raise SystemExit(0)
for s in SPORTS:
    url = f"https://api.the-odds-api.com/v4/sports/{s}/odds/?regions=eu&markets=h2h,totals&oddsFormat=decimal&apiKey={key}"
    with urllib.request.urlopen(url, timeout=30) as r:
        events += json.load(r); remaining = r.headers.get("x-requests-remaining")
out = Path(__file__).resolve().parent.parent / "out" / "feed_odds.json"
json.dump({"ts": int(time.time() * 1000), "events": events, "remaining": remaining}, open(out, "w"))
print(len(events), "matchs, crédits restants :", remaining)
