"""Laboratoire 3 : les intervalles d'incertitude tiennent-ils ?
Instantanés : on ajuste le modèle à une date, on prédit les 14 jours suivants avec une bande à 80 %,
puis on regarde (a) si la cote du marché tombe dans la bande, (b) si l'écart modèle-marché grandit avec la largeur de bande,
(c) si le modèle se trompe davantage quand la bande est large.
"""
import json, sys
from pathlib import Path
import numpy as np, pandas as pd
sys.argv = [sys.argv[0], sys.argv[1], sys.argv[2], sys.argv[3], "none"]
src = open(Path(__file__).parent / "engine3.py").read().split("res = {}")[0]
ns = {"__file__": str(Path(__file__).parent / "engine3.py")}; exec(src, ns)
from uncert import dc_cov, draws, rates_draws, probs_fast
M, OUT, COUNTRIES, fit_dc = ns["M"], ns["OUT"], ns["COUNTRIES"], ns["fit_dc"]
XI, L2 = 0.003, 0.1
rng = np.random.default_rng(3)
rows = []
dates = pd.date_range("2024-10-01", "2026-05-01", freq="45D")
for code, (d1, d2) in COUNTRIES.items():
    for T in dates:
        df = M[M.Division.isin([d1] + ([d2] if d2 else [])) & (M.date < T) & (M.date >= T - pd.Timedelta(days=1100))].reset_index(drop=True)
        nxt = M[(M.Division == d1) & (M.date >= T) & (M.date < T + pd.Timedelta(days=14))].dropna(subset=["OddHome"])
        if len(nxt) == 0 or len(df) < 300: continue
        m = fit_dc(df, T, XI, L2); cov = dc_cov(m, df, T, XI, L2); Z = draws(m, cov, 400, rng)
        for r in nxt.itertuples():
            l, u = rates_draws(m, Z, r.home, r.away); pH, pD, pA, _ = probs_fast(l, u, m["rho"])
            q = 1 / np.array([r.OddHome, r.OddDraw, r.OddAway]); mk = q / q.sum()
            l0, u0 = ns["rates"](m, r.home, r.away); c = ns["summ"](ns["matrix"](l0, u0, m["rho"]))
            rows.append(dict(league=code, T=T, pH=c[0], pD=c[1], pA=c[2], loH=np.percentile(pH, 10), hiH=np.percentile(pH, 90), loA=np.percentile(pA, 10), hiA=np.percentile(pA, 90),
                             loD=np.percentile(pD, 10), hiD=np.percentile(pD, 90), mH=mk[0], mD=mk[1], mA=mk[2], y=0 if r.hg > r.ag else 1 if r.hg == r.ag else 2,
                             known=int(r.home in m["idx"] and r.away in m["idx"])))
D = pd.DataFrame(rows)
D["width"] = D.hiH - D.loH
inside = lambda s: ((D["m" + s] >= D["lo" + s]) & (D["m" + s] <= D["hi" + s])).mean()
D["gap"] = (D[["pH", "pD", "pA"]].to_numpy() - D[["mH", "mD", "mA"]].to_numpy()).__abs__().max(1)
O = np.eye(3)[D.y]; P_ = D[["pH", "pD", "pA"]].to_numpy(); Mk = D[["mH", "mD", "mA"]].to_numpy()
rps = lambda A, B: (((np.cumsum(A, 1)[:, :-1] - np.cumsum(B, 1)[:, :-1]) ** 2).sum(1) / 2)
D["rps_m"] = rps(P_, O); D["rps_k"] = rps(Mk, O); D["excess"] = D.rps_m - D.rps_k
D["q"] = pd.qcut(D.width, 4, labels=["étroite", "moyenne-", "moyenne+", "large"])
by = D.groupby("q", observed=True).agg(n=("y", "size"), largeur_pts=("width", lambda s: 100 * s.mean()), ecart_marche_pts=("gap", lambda s: 100 * s.mean()),
                                         rps_modele=("rps_m", "mean"), rps_marche=("rps_k", "mean"), exces=("excess", "mean")).round(4)
R = dict(n=int(len(D)), couverture_marche_80={s: float(inside(s)) for s in "HDA"}, largeur_moy_pts={s: float(100 * (D["hi" + s] - D["lo" + s]).mean()) for s in "HDA"},
         par_largeur=by.reset_index().to_dict("records"), corr_largeur_ecart=float(np.corrcoef(D.width, D.gap)[0, 1]),
         promus_largeur_pts=float(100 * D[D.known == 0].width.mean()) if (D.known == 0).any() else None, n_promus=int((D.known == 0).sum()))
json.dump(R, open(OUT / "lab3.json", "w"), indent=1, ensure_ascii=False, default=str)
print(json.dumps(R, indent=1, ensure_ascii=False, default=str))
