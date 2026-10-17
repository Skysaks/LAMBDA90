"""Laboratoire 12 : entraîner davantage le moteur. Quatre pistes, toutes jugées hors échantillon (empilement appris sur 2024-25, test 2025-26) :
  A. moteur actuel : Dixon-Coles (demi-vie réglée) + tirs cadrés + pi-ratings ;
  B. + deux Dixon-Coles de mémoire courte et longue (ensemble multi-horizon) ;
  C. + corners (domination territoriale, Dixon-Coles sur les corners) ;
  D. + constantes par championnat dans l'empilement (avantage du terrain et nul propres à chaque ligue) ;
  E. tout réuni.
Juge : RPS avec intervalle de confiance par bootstrap ; une piste n'est adoptée que si l'intervalle du gain est au-dessus de zéro.
Usage : python lab12_ensemble.py <xgabora/data> <openfootball> out   Sortie : out/lab12.json, out/lab12_preds.csv
"""
import json, sys
from pathlib import Path
import numpy as np, pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
sys.argv = [sys.argv[0], sys.argv[1], sys.argv[2], sys.argv[3], "none"]
ROOT = Path(__file__).parent
src = open(ROOT / "engine3.py").read().split("res = {}")[0]
ns = {"__file__": str(ROOT / "engine3.py")}; exec(src, ns)
M, OUT, COUNTRIES, fit_dc, rates, matrix, summ, pi_ratings = (ns[k] for k in ("M", "OUT", "COUNTRIES", "fit_dc", "rates", "matrix", "summ", "pi_ratings"))
TUNE = json.load(open(OUT / "engine3_tune.json"))["best"]; XI, L2, JOINT = TUNE["xi"], TUNE["l2"], TUNE["joint"]
XS, XL = XI * 2, XI / 2
rows = []
for code, (d1, d2) in COUNTRIES.items():
    divs = [d1] + ([d2] if (JOINT and d2) else [])
    df = M[M.Division.isin(divs)].reset_index(drop=True); pi, _, _, _ = pi_ratings(df); df["pi"] = pi
    test = df[(df.Division == d1) & df.season.isin([2024, 2025])]
    dates = sorted(test.date.unique()); start = dates[0]; prev = {}
    while start <= dates[-1]:
        end = start + pd.Timedelta(days=7); cur = test[(test.date >= start) & (test.date < end)]
        if len(cur):
            tr = df[(df.date < start) & (df.date >= start - pd.Timedelta(days=1100))]
            fits = {}
            fits["g"] = fit_dc(tr, start, XI, L2, prev.get("g"))
            fits["gs"] = fit_dc(tr, start, XS, L2, prev.get("gs"))
            fits["gl"] = fit_dc(tr, start, XL, L2, prev.get("gl"))
            ts = tr.dropna(subset=["HomeTarget", "AwayTarget"]); fits["s"] = fit_dc(ts, start, XI, L2, prev.get("s"), ycols=("HomeTarget", "AwayTarget"), use_rho=False)
            tc = tr[tr.Division == d1].dropna(subset=["HomeCorners", "AwayCorners"]); fits["c"] = fit_dc(tc, start, XI, L2, prev.get("c"), ycols=("HomeCorners", "AwayCorners"), use_rho=False)
            prev = fits
            for r in cur.itertuples():
                row = dict(league=code, season=r.season, date=r.date, home=r.home, away=r.away, hg=r.hg, ag=r.ag, pi=r.pi, oH=r.OddHome, oD=r.OddDraw, oA=r.OddAway)
                for k in ("g", "gs", "gl"):
                    lam, mu = rates(fits[k], r.home, r.away); pH, pD, pA, pO = summ(matrix(lam, mu, fits[k]["rho"]))
                    row.update({f"{k}H": pH, f"{k}D": pD, f"{k}A": pA, f"{k}T": lam + mu})
                row["sl"], row["sm"] = rates(fits["s"], r.home, r.away); row["cl"], row["cm"] = rates(fits["c"], r.home, r.away)
                rows.append(row)
        start = end
    print(code, "ok", len(rows), flush=True)
D = pd.DataFrame(rows).dropna(subset=["gH", "sl", "cl"]).reset_index(drop=True); D.to_csv(OUT / "lab12_preds.csv", index=False)
O = np.stack([D.hg > D.ag, D.hg == D.ag, D.hg < D.ag], 1).astype(float); y = O.argmax(1)
rps = lambda A, B: (((np.cumsum(A, 1)[:, :-1] - np.cumsum(B, 1)[:, :-1]) ** 2).sum(1) / 2)
lg = lambda p: np.log(np.clip(p, 1e-6, None))
F = {"base": np.column_stack([lg(D.gH) - lg(D.gD), lg(D.gA) - lg(D.gD), np.log(D.sl / D.sm), np.log(D.sl + D.sm), D.pi]),
     "horizons": np.column_stack([lg(D.gsH) - lg(D.gsD), lg(D.gsA) - lg(D.gsD), lg(D.glH) - lg(D.glD), lg(D.glA) - lg(D.glD)]),
     "corners": np.column_stack([np.log(D.cl / D.cm)]),
     "ligue": pd.get_dummies(D.league).to_numpy(float)}
tr, te = (D.season == 2024).to_numpy(), (D.season == 2025).to_numpy()
def fit(keys, C=1.0):
    Z = np.column_stack([F[k] for k in keys]); sc = StandardScaler().fit(Z[tr]); c = LogisticRegression(C=C, max_iter=4000).fit(sc.transform(Z[tr]), y[tr])
    return c.predict_proba(sc.transform(Z[te]))
rng = np.random.default_rng(12); base = rps(fit(["base"]), O[te]); R = {"n_test": int(te.sum()), "rps_base": float(base.mean())}
for name, keys in (("B_multi_horizon", ["base", "horizons"]), ("C_corners", ["base", "corners"]), ("D_ligue", ["base", "ligue"]), ("E_tout", ["base", "horizons", "corners", "ligue"])):
    r = rps(fit(keys), O[te]); d = base - r; bs = [d[rng.integers(0, len(d), len(d))].mean() for _ in range(2000)]
    R[name] = dict(rps=float(r.mean()), gain=float(d.mean()), ic95=[float(np.percentile(bs, 2.5)), float(np.percentile(bs, 97.5))], prouve=bool(np.percentile(bs, 2.5) > 0))
    print(name, R[name], flush=True)
# régularisation de l'empilement
for C in (0.05, 0.2, 5.0):
    r = rps(fit(["base"], C), O[te]); R[f"regularisation_C{C}"] = float(r.mean())
json.dump(R, open(OUT / "lab12.json", "w"), indent=1, default=float)
print(json.dumps(R, indent=1, default=float))
