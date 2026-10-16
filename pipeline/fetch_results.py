"""Résultats terminés des 8 championnats via football-data.org (offre gratuite : 10 appels/minute, scores différés).
Écrit data/recent.csv. Jeton : variable d'environnement FOOTBALL_DATA_TOKEN."""
import csv, json, os, time, urllib.request
from datetime import date, timedelta
from pathlib import Path
COMPS = {"FL1": "F1", "PL": "E0", "PD": "SP1", "BL1": "D1", "SA": "I1", "PPL": "P1", "DED": "N1", "ELC": "E1"}
token = os.environ.get("FOOTBALL_DATA_TOKEN", "").strip()
if not token: print("pas de FOOTBALL_DATA_TOKEN : étape ignorée"); raise SystemExit(0)
since = (date.today() - timedelta(days=90)).isoformat(); until = date.today().isoformat()
rows = []
for code, div in COMPS.items():
    req = urllib.request.Request(f"https://api.football-data.org/v4/competitions/{code}/matches?status=FINISHED&dateFrom={since}&dateTo={until}", headers={"X-Auth-Token": token})
    data = json.load(urllib.request.urlopen(req, timeout=30))
    for m in data.get("matches", []):
        ft, ht = m["score"]["fullTime"], m["score"].get("halfTime") or {}
        if ft["home"] is None: continue
        rows.append([div, m["utcDate"][:10], m["homeTeam"]["name"], m["awayTeam"]["name"], ft["home"], ft["away"], ht.get("home"), ht.get("away")])
    time.sleep(7)  # rester sous 10 appels par minute
out = Path(__file__).resolve().parent.parent / "data" / "recent.csv"; out.parent.mkdir(exist_ok=True)
with open(out, "w", newline="") as fh:
    w = csv.writer(fh); w.writerow(["Division", "date", "home", "away", "hg", "ag", "hth", "hta"]); w.writerows(rows)
print(len(rows), "résultats écrits")
