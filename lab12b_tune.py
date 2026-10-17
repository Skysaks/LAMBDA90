"""Laboratoire 12 b : réglage des hyperparamètres de Dixon-Coles refait sur les saisons récentes (2024-25 et 2025-26, 8 championnats),
alors que le réglage du moteur se fait sur 2023-24. Le meilleur réglage récent fait-il mieux que le réglage en place ? Sortie : out/lab12b.json"""
import json, sys
from pathlib import Path
import numpy as np, pandas as pd
sys.argv = [sys.argv[0], sys.argv[1], sys.argv[2], sys.argv[3], "none"]
ROOT = Path(__file__).parent; src = open(ROOT / "engine3.py").read().split("res = {}")[0]; ns = {"__file__": str(ROOT / "engine3.py")}; exec(src, ns)
walk, rps, OUT, COUNTRIES = ns["walk"], ns["rps"], ns["OUT"], ns["COUNTRIES"]
cur = json.load(open(OUT / "engine3_tune.json"))["best"]; R = {"en_place": cur, "grille": []}
for xi in (0.002, 0.003, 0.004, 0.005):
    for l2 in (0.05, 0.1, 0.2):
        rows = []
        for code in COUNTRIES: rows += walk(code, [2024, 2025], xi, l2, True, False, step_days=14)
        D = pd.DataFrame(rows); O = np.stack([D.hg > D.ag, D.hg == D.ag, D.hg < D.ag], 1).astype(float)
        r = rps(D[["pH", "pD", "pA"]].to_numpy(), O); R["grille"].append(dict(xi=xi, l2=l2, rps=float(r.mean()), n=len(D))); print(xi, l2, round(float(r.mean()), 5), flush=True)
best = min(R["grille"], key=lambda g: g["rps"]); now = next(g for g in R["grille"] if abs(g["xi"] - cur["xi"]) < 1e-9 and abs(g["l2"] - cur["l2"]) < 1e-9)
R["meilleur"] = best; R["gain_vs_en_place"] = now["rps"] - best["rps"]
json.dump(R, open(OUT / "lab12b.json", "w"), indent=1, default=float); print("meilleur", best, "gain", R["gain_vs_en_place"])
