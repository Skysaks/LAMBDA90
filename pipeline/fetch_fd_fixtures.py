"""Cotes Bet365 (et Pinnacle, moyenne du marché) des prochains matchs, depuis football-data.co.uk/fixtures.csv (gratuit, mis à jour
deux fois par semaine). The Odds API ne couvre pas Bet365 en football : ce fichier comble le manque.
Fusion dans out/feed_odds.json au format The Odds API : ajout du bookmaker « Bet365 » au match existant, ou création du match.
"""
import io, json, sys, time, urllib.request
from datetime import datetime, timedelta
from pathlib import Path
import pandas as pd
sys.path.insert(0, str(Path(__file__).parent)); from names import best_pair
ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
FEED = ROOT / "out" / "feed_odds.json"
DIV = {"F1": "soccer_france_ligue_one", "E0": "soccer_epl", "SP1": "soccer_spain_la_liga", "D1": "soccer_germany_bundesliga", "I1": "soccer_italy_serie_a",
       "P1": "soccer_portugal_primeira_liga", "N1": "soccer_netherlands_eredivisie", "E1": "soccer_efl_champ"}
BOOKS = {"Bet365": ("B365H", "B365D", "B365A", "B365>2.5", "B365<2.5"), "Moyenne du marché": ("AvgH", "AvgD", "AvgA", "Avg>2.5", "Avg<2.5")}

def load_fixtures():
    raw = urllib.request.urlopen(urllib.request.Request("https://www.football-data.co.uk/fixtures.csv", headers={"User-Agent": "lambda90"}), timeout=40).read()
    txt = raw.decode("utf-8-sig", "replace")
    df = pd.read_csv(io.StringIO(txt)); df.columns = [c.strip().lstrip("﻿").replace("ï»¿", "") for c in df.columns]
    return df[df.Div.isin(DIV)]

def kickoff(r):
    d = datetime.strptime(str(r["Date"]), "%d/%m/%Y"); t = str(r.get("Time") or "15:00")
    hh, mm = (t.split(":") + ["0"])[:2]
    return (d.replace(hour=int(hh), minute=int(mm)) - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:00Z")  # heure britannique (été) -> UTC, approximatif

def num(x):
    try: x = float(x)
    except (TypeError, ValueError): return None
    return x if x > 1 else None

def markets(r, home, away, cols):
    h, d, a, o, u = (num(r.get(c)) for c in cols); out = []
    if h and d and a: out.append({"key": "h2h", "outcomes": [{"name": home, "price": h}, {"name": away, "price": a}, {"name": "Draw", "price": d}]})
    if o and u: out.append({"key": "totals", "outcomes": [{"name": "Over", "price": o, "point": 2.5}, {"name": "Under", "price": u, "point": 2.5}]})
    return out

def main():
    try: F = load_fixtures()
    except Exception as e: print("fixtures.csv indisponible :", e); return
    feed = json.load(open(FEED)) if FEED.exists() else {"ts": int(time.time() * 1000), "events": []}
    ev = feed["events"]; added = merged = 0
    for r in F.to_dict("records"):
        sport = DIV[r["Div"]]; ct = kickoff(r); day = ct[:10]
        cands = [(i, e["home_team"], e["away_team"]) for i, e in enumerate(ev) if e.get("sport_key") == sport and abs((datetime.fromisoformat(e["commence_time"][:10]) - datetime.fromisoformat(day)).days) <= 1]
        k = best_pair(r["HomeTeam"], r["AwayTeam"], cands)
        if k is not None: e = ev[k]; home, away = e["home_team"], e["away_team"]; merged += 1
        else:
            e = {"id": f"fd-{r['Div']}-{day}-{r['HomeTeam']}-{r['AwayTeam']}", "sport_key": sport, "commence_time": ct, "home_team": r["HomeTeam"], "away_team": r["AwayTeam"], "bookmakers": []}
            ev.append(e); home, away = r["HomeTeam"], r["AwayTeam"]; added += 1
        for title, cols in BOOKS.items():
            mk = markets(r, home, away, cols)
            if not mk: continue
            key = "bet365" if title == "Bet365" else "market_avg"
            e["bookmakers"] = [b for b in e["bookmakers"] if b.get("key") != key] + [{"key": key, "title": title, "last_update": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"), "markets": mk}]
    feed["fd_fixtures"] = dict(lignes=int(len(F)), fusionnes=merged, ajoutes=added)
    FEED.parent.mkdir(exist_ok=True); json.dump(feed, open(FEED, "w"))
    print(f"football-data : {len(F)} matchs, {merged} fusionnés avec The Odds API, {added} ajoutés")

if __name__ == "__main__": main()
