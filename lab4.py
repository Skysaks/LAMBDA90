"""Laboratoire 4 : Championship ajustée avec ou sans la Premier League (lien des relégués et promus)."""
import sys, json
from pathlib import Path
import numpy as np, pandas as pd
sys.argv = [sys.argv[0], sys.argv[1], sys.argv[2], sys.argv[3], "none"]
src = open(Path(__file__).parent / "engine3.py").read().split("res = {}")[0]
ns = {"__file__": str(Path(__file__).parent / "engine3.py")}; exec(src, ns)
C = ns["COUNTRIES"]; rng = np.random.default_rng(1)
rps = lambda A, B: (((np.cumsum(A, 1)[:, :-1] - np.cumsum(B, 1)[:, :-1]) ** 2).sum(1) / 2)
out = {}
for label, divs in (("E1+E2", ("E1", "E2")), ("E0+E1+E2", ("E1", "E2", "E0"))):
    C["en.2"] = divs[:2]
    if len(divs) == 3:
        orig = ns["M"]; ns["COUNTRIES"]["en.2"] = ("E1", "E2")
        # walk() ne prend que d1, d2 : on passe par une division fusionnée E2+E0 renommée « X »
        Mx = orig.copy(); Mx.loc[Mx.Division.isin(["E2", "E0"]), "Division"] = "X"; ns["M"] = Mx; C["en.2"] = ("E1", "X")
    rows = ns["walk"]("en.2", [2024, 2025], 0.003, 0.1, True, False)
    if len(divs) == 3: ns["M"] = orig
    D = pd.DataFrame(rows); O = np.eye(3)[np.where(D.hg > D.ag, 0, np.where(D.hg == D.ag, 1, 2))]
    P = D[["pH", "pD", "pA"]].to_numpy(); r = rps(P, O); out[label] = dict(n=len(D), rps=float(r.mean())); out[label + "_r"] = r
    out[label + "_keys"] = list(zip(D.date, D.home))
a, b = out["E1+E2_r"], out["E0+E1+E2_r"]; d = b - a
bs = [d[rng.integers(0, len(d), len(d))].mean() for _ in range(2000)]
res4 = dict(sans_PL=out["E1+E2"], avec_PL=out["E0+E1+E2"], gain=float(-d.mean()), ic95=[float(-np.percentile(bs, 97.5)), float(-np.percentile(bs, 2.5))])
json.dump(res4, open(ns["OUT"] / "lab4.json", "w"), indent=1); print(res4)
