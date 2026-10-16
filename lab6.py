"""Laboratoire 6 : (a) un modèle Dixon-Coles sur les tirs totaux ajoute-t-il quelque chose aux tirs cadrés ?
(b) quel poids donner au marché quand de vraies cotes sont disponibles (mélange affiché modèle + marché) ?
Même protocole que engine3_eval : empilement appris sur les saisons passées, test 2025 et 2026.
"""
import json, sys
from pathlib import Path
import numpy as np, pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
sys.argv = [sys.argv[0], sys.argv[1], sys.argv[2], sys.argv[3], "none"]
src = open(Path(__file__).parent / "engine3.py").read().split("res = {}")[0]
ns = {"__file__": str(Path(__file__).parent / "engine3.py")}; exec(src, ns)
M, OUT, COUNTRIES, fit_dc, rates = ns["M"], ns["OUT"], ns["COUNTRIES"], ns["fit_dc"], ns["rates"]
XI, L2 = 0.003, 0.1
P = pd.read_csv(OUT / "engine3_preds.csv", parse_dates=["date"])
rows = []
for code, (d1, d2) in COUNTRIES.items():
    df = M[M.Division.isin([d1] + ([d2] if d2 else []))].dropna(subset=["HomeShots", "AwayShots"]).reset_index(drop=True)
    test = df[(df.Division == d1) & df.season.isin([2024, 2025, 2026])]
    dates = sorted(test.date.unique()); prev = None
    if not dates: continue
    start = dates[0]
    while start <= dates[-1]:
        end = start + pd.Timedelta(days=7); cur = test[(test.date >= start) & (test.date < end)]
        if len(cur):
            tr = df[(df.date < start) & (df.date >= start - pd.Timedelta(days=1100))]
            m = fit_dc(tr, start, XI, L2, prev, ycols=("HomeShots", "AwayShots"), use_rho=False); prev = m
            for r in cur.itertuples():
                a, b = rates(m, r.home, r.away); rows.append(dict(date=r.date, home=r.home, away=r.away, shl=a, shm=b))
        start = end
    print(code, "ok", flush=True)
SH = pd.DataFrame(rows)
D = P.merge(SH, on=["date", "home", "away"], how="inner").dropna(subset=["oH", "oD", "oA"]).reset_index(drop=True)
def shin(q):
    q = 1 / q; S = q.sum(1, keepdims=True); lo = np.zeros((len(q), 1)); hi = np.full((len(q), 1), 0.4)
    for _ in range(60):
        z = (lo + hi) / 2; p = (np.sqrt(z * z + 4 * (1 - z) * q * q / S) - z) / (2 * (1 - z)); big = p.sum(1, keepdims=True) > 1
        lo = np.where(big, z, lo); hi = np.where(big, hi, z)
    return p
rps = lambda A, B: (((np.cumsum(A, 1)[:, :-1] - np.cumsum(B, 1)[:, :-1]) ** 2).sum(1) / 2)
O = np.stack([D.hg > D.ag, D.hg == D.ag, D.hg < D.ag], 1).astype(float); y = O.argmax(1)
F = {"dc": np.column_stack([np.log(D.pH / D.pD), np.log(D.pA / D.pD)]), "sot": np.column_stack([np.log(D.sl / D.sm), np.log(D.sl + D.sm)]),
     "pi": D[["pi"]].to_numpy(), "shots": np.column_stack([np.log(D.shl / D.shm), np.log(D.shl + D.shm)])}
EVAL = [2025, 2026]; ev = D.season.isin(EVAL).to_numpy()
def stack(keys):
    X = np.column_stack([F[k] for k in keys]); Pp = np.full((len(D), 3), np.nan)
    for s in EVAL:
        tr = (D.season < s).to_numpy(); te = (D.season == s).to_numpy()
        if tr.sum() < 300 or te.sum() == 0: continue
        sc = StandardScaler().fit(X[tr]); c = LogisticRegression(C=1.0, max_iter=3000).fit(sc.transform(X[tr]), y[tr]); Pp[te] = c.predict_proba(sc.transform(X[te]))
    return Pp
rng = np.random.default_rng(9)
def boot(a, b):
    d = b - a; bs = [d[rng.integers(0, len(d), len(d))].mean() for _ in range(2000)]
    return dict(gain=float(-d.mean()), ic95=[float(-np.percentile(bs, 97.5)), float(-np.percentile(bs, 2.5))])
base = stack(["dc", "sot", "pi"]); plus = stack(["dc", "sot", "pi", "shots"])
ok = ev & ~np.isnan(base[:, 0]) & ~np.isnan(plus[:, 0])
rb, rp = rps(base[ok], O[ok]), rps(plus[ok], O[ok])
R = dict(n=int(ok.sum()), rps_actuel=float(rb.mean()), rps_avec_tirs=float(rp.mean()), tirs=boot(rb, rp))
# (b) mélange linéaire modèle + marché (Shin Bet365) : poids du marché w
MK = shin(D[["oH", "oD", "oA"]].to_numpy())
grid = {}
for w in np.round(np.arange(0, 1.01, 0.1), 2):
    Bl = (1 - w) * base + w * MK; grid[float(w)] = float(rps(Bl[ok], O[ok]).mean())
wbest = min(grid, key=grid.get)
R["melange"] = dict(par_poids=grid, poids_marche_optimal=wbest, rps_modele=grid[0.0], rps_marche=grid[1.0], rps_optimal=grid[wbest],
                    vs_modele=boot(rps(base[ok], O[ok]), rps(((1 - wbest) * base + wbest * MK)[ok], O[ok])),
                    vs_marche=boot(rps(MK[ok], O[ok]), rps(((1 - wbest) * base + wbest * MK)[ok], O[ok])))
json.dump(R, open(OUT / "lab6.json", "w"), indent=1)
print(json.dumps(R, indent=1))
