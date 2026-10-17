"""Cotes avant-match via The Odds API (région eu : Pinnacle, Betclic, Winamax, Unibet, PMU…), en mode économe.
Ne tourne que sur demande explicite (bouton « Rafraîchir les cotes » ou lancement manuel du workflow), jamais à l'ouverture de la page.
- La liste des matchs (endpoint /events) est gratuite : seuls les championnats qui jouent dans les HORIZON prochaines heures sont interrogés.
- Coût : 2 crédits par championnat interrogé (marchés h2h + totals), 16 au plus.
- Réserve : aucun appel si le solde passe sous RESERVE crédits.
- Fusion : les championnats non interrogés gardent leurs dernières cotes (matchs non commencés).
Écrit out/feed_odds.json (champs refreshed par championnat, remaining, used). Clé : ODDS_API_KEY.
"""
import json, os, time, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
SPORTS = ["soccer_france_ligue_one", "soccer_epl", "soccer_spain_la_liga", "soccer_germany_bundesliga", "soccer_italy_serie_a",
          "soccer_portugal_primeira_liga", "soccer_netherlands_eredivisie", "soccer_efl_champ"]
HORIZON = float(os.environ.get("ODDS_HORIZON_H", "48")); RESERVE = int(os.environ.get("ODDS_RESERVE", "30"))
BASE = "https://api.the-odds-api.com/v4/sports"
OUT = Path(__file__).resolve().parent.parent / "out" / "feed_odds.json"

def get(url):
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r), r.headers.get("x-requests-remaining"), r.headers.get("x-requests-last")

def main():
    key = os.environ.get("ODDS_API_KEY", "").strip()
    if not key: print("pas de ODDS_API_KEY : étape ignorée"); return
    now = datetime.now(timezone.utc); lim = now + timedelta(hours=HORIZON)
    feed = json.load(open(OUT)) if OUT.exists() else {"events": []}
    keep = [e for e in feed.get("events", []) if e.get("commence_time", "") > now.strftime("%Y-%m-%dT%H:%M:%SZ")]
    refreshed = dict(feed.get("refreshed", {})); remaining = feed.get("remaining"); used = 0; fresh = {}
    for s in SPORTS:
        try: evs, rem, _ = get(f"{BASE}/{s}/events?apiKey={key}")          # gratuit
        except Exception as e: print(s, "liste indisponible :", e); continue
        remaining = rem or remaining
        soon = [e for e in evs if now.strftime("%Y-%m-%dT%H:%M:%SZ") < e["commence_time"] <= lim.strftime("%Y-%m-%dT%H:%M:%SZ")]
        if not soon: print(s, ": aucun match dans les", int(HORIZON), "h, pas d'appel payant"); continue
        if remaining is not None and int(float(remaining)) < RESERVE + 2: print("réserve de crédits atteinte :", remaining, "; arrêt"); break
        try: odds, rem, last = get(f"{BASE}/{s}/odds/?regions=eu&markets=h2h,totals&oddsFormat=decimal&apiKey={key}")
        except Exception as e: print(s, "cotes indisponibles :", e); continue
        remaining = rem or remaining; used += int(float(last or 2)); fresh[s] = odds; refreshed[s] = int(time.time() * 1000)
        print(s, ":", len(odds), "matchs,", len(soon), "dans l'horizon")
    events = [e for e in keep if e.get("sport_key") not in fresh] + [e for v in fresh.values() for e in v]
    feed.update(ts=int(time.time() * 1000) if fresh else feed.get("ts", int(time.time() * 1000)), events=events, remaining=remaining, used=used, refreshed=refreshed)
    OUT.parent.mkdir(exist_ok=True); json.dump(feed, open(OUT, "w"))
    print(f"{len(events)} matchs au total, {used} crédits utilisés, solde {remaining}")

if __name__ == "__main__": main()
