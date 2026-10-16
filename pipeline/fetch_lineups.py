"""Blessures, suspensions et compositions officielles (API-Football v3).
- mode « jour » (mise à jour quotidienne) : matchs des 3 prochains jours, absents de chaque match ;
- mode « compos » (toutes les heures les jours de match) : compositions des matchs qui commencent dans les 100 minutes.
Clé : secret GitHub API_FOOTBALL_KEY. Sortie : out/lineups.json (fusionnée, les anciens matchs sont purgés après 2 jours).
Coût : ~8 appels pour la liste + 1 par match (absents) + 1 par match proche (compos).
"""
import json, os, sys, time, urllib.request, urllib.parse
from datetime import datetime, timedelta, timezone
from pathlib import Path
BASE = "https://v3.football.api-sports.io"
LEAGUES = {"fr.1": 61, "en.1": 39, "es.1": 140, "de.1": 78, "it.1": 135, "pt.1": 94, "nl.1": 88, "en.2": 40}
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "out") / "lineups.json"
MODE = sys.argv[1] if len(sys.argv) > 1 else "jour"
CALLS = 0

def get(path, **params):
    global CALLS
    key = os.environ.get("API_FOOTBALL_KEY")
    url = f"{BASE}/{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"x-apisports-key": key})
    CALLS += 1
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.load(r)
    if d.get("errors"): print("erreur API", path, params, d["errors"])
    time.sleep(0.25)
    return d.get("response", [])

def season_of(now): return now.year if now.month >= 7 else now.year - 1

def parse_fixture(x, code):
    return dict(id=x["fixture"]["id"], league=code, kickoff=x["fixture"]["date"], status=x["fixture"]["status"]["short"],
                home=x["teams"]["home"]["name"], away=x["teams"]["away"]["name"], home_id=x["teams"]["home"]["id"], away_id=x["teams"]["away"]["id"])

def parse_injuries(rows):
    return [dict(team_id=r["team"]["id"], team=r["team"]["name"], player=r["player"]["name"], type=r["player"].get("type"), reason=r["player"].get("reason")) for r in rows]

def parse_lineups(rows):
    return [dict(team_id=r["team"]["id"], team=r["team"]["name"], formation=r.get("formation"), coach=(r.get("coach") or {}).get("name"),
                 xi=[p["player"]["name"] for p in r.get("startXI") or []], bench=[p["player"]["name"] for p in r.get("substitutes") or []]) for r in rows]

def main(now=None):
    if not os.environ.get("API_FOOTBALL_KEY", "").strip(): print("pas de clé API_FOOTBALL_KEY : étape ignorée"); return
    now = now or datetime.now(timezone.utc); S = season_of(now)
    store = json.load(open(OUT)) if OUT.exists() else {"matches": {}}
    M = store["matches"]
    for code, lid in LEAGUES.items():
        fx = get("fixtures", league=lid, season=S, **{"from": now.strftime("%Y-%m-%d"), "to": (now + timedelta(days=3)).strftime("%Y-%m-%d")})
        for x in fx:
            f = parse_fixture(x, code); k = str(f["id"]); M.setdefault(k, {}).update(f)
    for k, f in M.items():
        ko = datetime.fromisoformat(f["kickoff"].replace("Z", "+00:00")); mins = (ko - now).total_seconds() / 60
        if MODE == "jour" and mins > -120:
            f["injuries"] = parse_injuries(get("injuries", fixture=f["id"])); f["injuries_at"] = now.isoformat(timespec="minutes")
        if MODE == "compos" and -30 < mins < 100 and not f.get("lineups"):
            lu = parse_lineups(get("fixtures/lineups", fixture=f["id"]))
            if lu: f["lineups"] = lu; f["lineups_at"] = now.isoformat(timespec="minutes")
    cutoff = now - timedelta(days=2)
    store["matches"] = {k: f for k, f in M.items() if datetime.fromisoformat(f["kickoff"].replace("Z", "+00:00")) > cutoff}
    store["updated"] = now.isoformat(timespec="minutes"); store["calls"] = CALLS
    OUT.parent.mkdir(exist_ok=True); json.dump(store, open(OUT, "w"), ensure_ascii=False, indent=1)
    print(f"{len(store['matches'])} matchs, {CALLS} appels API")

if __name__ == "__main__": main()
