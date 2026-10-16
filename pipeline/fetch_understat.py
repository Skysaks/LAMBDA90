"""xG par match depuis Understat (gratuit, sans API officielle : on lit les données JSON que le site charge lui-même).
5 championnats (Premier League, Liga, Bundesliga, Serie A, Ligue 1), saisons 2017 à aujourd'hui.
Trois formats gérés : getLeagueData (« dates » ou « teams »), puis la page HTML ancienne (datesData).
Sortie : data/understat.csv (league, season, date, home, away, hg, ag, hxg, axg). Lancé par GitHub Actions.
"""
import codecs, json, re, sys, time, urllib.request
from datetime import datetime, timezone
from pathlib import Path
import pandas as pd
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "data") / "understat.csv"
LEAGUES = {"en.1": "EPL", "es.1": "La_liga", "de.1": "Bundesliga", "it.1": "Serie_A", "fr.1": "Ligue_1"}
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
now = datetime.now(timezone.utc); CUR = now.year if now.month >= 7 else now.year - 1
SEASONS = list(range(2017, CUR + 1))

def http(url, xhr, referer):
    h = {"User-Agent": UA, "Accept": "application/json, text/html", "Referer": referer}
    if xhr: h["X-Requested-With"] = "XMLHttpRequest"
    with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=40) as r: return r.read().decode("utf-8", "replace")

def from_dates(dates, code, season):
    rows = []
    for m in dates if isinstance(dates, list) else dates.values():
        if not m.get("isResult", True) or not m.get("xG"): continue
        g = m.get("goals") or {}
        if g.get("h") is None: continue
        rows.append(dict(league=code, season=season, date=str(m["datetime"])[:10], home=m["h"]["title"], away=m["a"]["title"],
                         hg=int(g["h"]), ag=int(g["a"]), hxg=float(m["xG"]["h"]), axg=float(m["xG"]["a"])))
    return rows

def from_teams(teams, code, season):
    """Reconstruit les matchs depuis l'historique de chaque équipe (h_a, date, xG, xGA, scored, missed)."""
    side = {}
    for t in teams if isinstance(teams, list) else teams.values():
        for h in t.get("history") or []:
            side.setdefault((str(h["date"])[:10], h["h_a"]), []).append((t["title"], float(h["xG"]), float(h["xGA"]), int(h["scored"]), int(h["missed"])))
    rows = []
    for (d, ha), lst in side.items():
        if ha != "h": continue
        aw = side.get((d, "a"), [])
        for (ht, hxg, hxga, hs, hm) in lst:
            c = [a for a in aw if abs(a[1] - hxga) < 1e-6 and abs(a[2] - hxg) < 1e-6 and a[3] == hm and a[4] == hs]
            if len(c) == 1: rows.append(dict(league=code, season=season, date=d, home=ht, away=c[0][0], hg=hs, ag=hm, hxg=hxg, axg=hxga))
    return rows

def parse(text, code, season):
    t = text.lstrip()
    if t.startswith("{"):
        body = json.loads(t)
        if body.get("dates"): return from_dates(body["dates"], code, season)
        if body.get("teams"): return from_teams(body["teams"], code, season)
        return []
    m = re.search(r"datesData\s*=\s*JSON\.parse\('(.*?)'\)", text)
    if m: return from_dates(json.loads(codecs.decode(m.group(1), "unicode_escape")), code, season)
    return []

def fetch_one(code, slug, season):
    page = f"https://understat.com/league/{slug}/{season}"
    for url, xhr in ((f"https://understat.com/getLeagueData/{slug}/{season}", True), (page, False)):
        try:
            rows = parse(http(url, xhr, page), code, season)
            if rows: return rows, url
        except Exception as e: print("échec", url, str(e)[:120])
        time.sleep(1.5)
    return [], None

def main():
    old = pd.read_csv(OUT) if OUT.exists() else pd.DataFrame()
    have = set(zip(old.league, old.season)) if len(old) else set()
    rows, log = [], {}
    for code, slug in LEAGUES.items():
        for s in SEASONS:
            if (code, s) in have and s < CUR: continue  # saisons passées déjà en cache
            r, src = fetch_one(code, slug, s); rows += r; log[f"{code} {s}"] = (len(r), src)
            time.sleep(1.5)
    new = pd.DataFrame(rows)
    if len(old) and len(new): old = old[~old.set_index(["league", "season"]).index.isin(new.set_index(["league", "season"]).index.unique())]
    allr = pd.concat([old, new]) if len(old) else new
    if len(allr):
        OUT.parent.mkdir(exist_ok=True); allr.sort_values(["league", "date"]).to_csv(OUT, index=False)
    for k, v in log.items(): print(k, v)
    print("matchs avec xG :", len(allr))

if __name__ == "__main__": main()
