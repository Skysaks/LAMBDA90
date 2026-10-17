"""Corners et cartons du jour : forces d'équipe lissées (demi-vie 120 jours) et moyennes de chaque championnat sur 365 jours,
au format attendu par la page (le rapprochement de la moyenne et la loi binomiale négative viennent de out/props.json, labo 11).
Usage : python pipeline/props_build.py /tmp/xg/data out   Sortie : out/props_live.json
"""
import json, math, sys
from pathlib import Path
import numpy as np, pandas as pd
XG, OUT = Path(sys.argv[1]), Path(sys.argv[2])
DIVS = {"fr.1": "F1", "en.1": "E0", "es.1": "SP1", "de.1": "D1", "it.1": "I1", "pt.1": "P1", "nl.1": "N1", "en.2": "E1"}
HL = 120.0
M = pd.read_csv(XG / "Matches.csv", low_memory=False, parse_dates=["MatchDate"])
M = M[(M.MatchDate >= M.MatchDate.max() - pd.Timedelta(days=730)) & M.Division.isin(DIVS.values())].copy()
M["HC"] = M.HomeYellow + M.HomeRed; M["AC"] = M.AwayYellow + M.AwayRed
today = M.MatchDate.max()
out = {"asof": str(today.date()), "params": json.load(open(OUT / "props.json")) if (OUT / "props.json").exists() else None, "leagues": {}}
for code, div in DIVS.items():
    D = M[M.Division == div]; rec = D[D.MatchDate >= today - pd.Timedelta(days=365)]
    lg = {"corners": [float(rec.HomeCorners.mean()), float(rec.AwayCorners.mean())], "cartons": [float(rec.HC.mean()), float(rec.AC.mean())], "teams": {}}
    for t in sorted(set(D.HomeTeam) | set(D.AwayTeam)):
        h, a = D[D.HomeTeam == t], D[D.AwayTeam == t]
        rows = [(r.MatchDate, r.HomeCorners, r.AwayCorners, r.HC, r.AC) for r in h.itertuples()] + [(r.MatchDate, r.AwayCorners, r.HomeCorners, r.AC, r.HC) for r in a.itertuples()]
        rows = [x for x in rows if not any(pd.isna(v) for v in x[1:])]
        if not rows: continue
        w = np.array([math.exp(-(today - x[0]).days / HL * math.log(2)) for x in rows])
        if w.sum() < 3: continue
        col = lambda i: float((w * np.array([x[i] for x in rows])).sum() / w.sum())
        lg["teams"][t] = [round(col(1), 3), round(col(2), 3), round(col(3), 3), round(col(4), 3)]  # corners pour, contre, cartons pour, contre
    out["leagues"][code] = lg
json.dump(out, open(OUT / "props_live.json", "w"), ensure_ascii=False, separators=(",", ":"))
print("corners/cartons :", {k: len(v["teams"]) for k, v in out["leagues"].items()}, "au", out["asof"])
