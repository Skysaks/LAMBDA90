"""Laboratoire 7 : peut-on viser 75-80 % de réussite ? Et des modèles plus puissants font-ils mieux ?
(a) Réalité des paris très probables : taux de réussite, cote Bet365 moyenne et rendement par tranche de probabilité (test 2025-26).
(b) À cote ≈ 2 (1,85-2,25) : quel taux de réussite atteignent les meilleures sélections du modèle ?
(c) Gradient boosting contre régression logistique, avec et sans le marché.
"""
import json, sys
from pathlib import Path
import numpy as np, pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.preprocessing import StandardScaler
OUT = Path(sys.argv[1])
D = pd.read_csv(OUT / "engine3_preds.csv", parse_dates=["date"]).dropna(subset=["oH", "oD", "oA"]).reset_index(drop=True)
def shin(q):
    q = 1 / q; S = q.sum(1, keepdims=True); lo = np.zeros((len(q), 1)); hi = np.full((len(q), 1), 0.4)
    for _ in range(60):
        z = (lo + hi) / 2; p = (np.sqrt(z * z + 4 * (1 - z) * q * q / S) - z) / (2 * (1 - z)); big = p.sum(1, keepdims=True) > 1
        lo = np.where(big, z, lo); hi = np.where(big, hi, z)
    return p
rps = lambda A, B: (((np.cumsum(A, 1)[:, :-1] - np.cumsum(B, 1)[:, :-1]) ** 2).sum(1) / 2)
O = np.stack([D.hg > D.ag, D.hg == D.ag, D.hg < D.ag], 1).astype(float); y = O.argmax(1)
MK = shin(D[["oH", "oD", "oA"]].to_numpy())
F = {"dc": np.column_stack([np.log(D.pH / D.pD), np.log(D.pA / D.pD)]), "sot": np.column_stack([np.log(D.sl / D.sm), np.log(D.sl + D.sm)]),
     "pi": D[["pi"]].to_numpy(), "mkt": np.column_stack([np.log(MK[:, 0] / MK[:, 1]), np.log(MK[:, 2] / MK[:, 1])])}
EVAL = [2025, 2026]; ev = D.season.isin(EVAL).to_numpy()
def stack(keys, kind="lr"):
    X = np.column_stack([F[k] for k in keys]); P = np.full((len(D), 3), np.nan)
    for s in EVAL:
        tr = (D.season < s).to_numpy(); te = (D.season == s).to_numpy()
        if tr.sum() < 300 or te.sum() == 0: continue
        if kind == "lr":
            sc = StandardScaler().fit(X[tr]); c = LogisticRegression(C=1.0, max_iter=3000).fit(sc.transform(X[tr]), y[tr]); P[te] = c.predict_proba(sc.transform(X[te]))
        else:
            c = HistGradientBoostingClassifier(max_depth=3, learning_rate=0.04, max_iter=300, min_samples_leaf=60, l2_regularization=1.0, early_stopping=True, validation_fraction=0.15, random_state=0)
            c.fit(X[tr], y[tr]); P[te] = c.predict_proba(X[te])
    return P
PM = stack(["dc", "sot", "pi"]); ok = ev & ~np.isnan(PM[:, 0])
R = {"n_test": int(ok.sum())}
# (a) 1N2 + double chance + +/-2,5 : chaque issue est un pari possible
rows = []
odds1 = D[["oH", "oD", "oA"]].to_numpy()
for j, lab in enumerate(["dom", "nul", "ext"]):
    rows.append(pd.DataFrame(dict(p=PM[:, j], pm=MK[:, j], o=odds1[:, j], win=O[:, j], kind="1N2", real=True)))
for (a, b), lab in [((0, 1), "1N"), ((1, 2), "N2"), ((0, 2), "12")]:
    o = 1 / (1 / odds1[:, a] + 1 / odds1[:, b])  # cote implicite de la double chance (les vraies sont un peu moins bonnes)
    rows.append(pd.DataFrame(dict(p=PM[:, a] + PM[:, b], pm=MK[:, a] + MK[:, b], o=o, win=O[:, a] + O[:, b], kind="DC", real=False)))
ou = D[["oO", "oU"]].to_numpy(); hasou = ~np.isnan(ou).any(1)
qo = np.where(hasou[:, None], 1 / np.where(hasou[:, None], ou, 2), np.nan); mko = qo / qo.sum(1, keepdims=True)
over = ((D.hg + D.ag) > 2).to_numpy().astype(float)
# probabilité modèle de +2,5 : pO recalée n'est pas dans les prédictions empilées ; on prend pO brut du modèle
rows.append(pd.DataFrame(dict(p=D.pO.to_numpy(), pm=mko[:, 0], o=ou[:, 0], win=over, kind="OU", real=True)))
rows.append(pd.DataFrame(dict(p=1 - D.pO.to_numpy(), pm=mko[:, 1], o=ou[:, 1], win=1 - over, kind="OU", real=True)))
B = pd.concat([r[ok] for r in rows]).dropna()
bins = [0.45, 0.55, 0.65, 0.75, 0.85, 1.0]
B["tranche"] = pd.cut(B.p, bins, labels=["45-55 %", "55-65 %", "65-75 %", "75-85 %", "85 %+"])
B["profit"] = np.where(B.win == 1, B.o - 1, -1.0)
tab = B.groupby("tranche", observed=True).agg(paris=("win", "size"), reussite=("win", "mean"), proba_modele=("p", "mean"), cote_moy=("o", "mean"), rendement=("profit", "mean")).round(4)
R["par_tranche"] = tab.reset_index().to_dict("records")
# (b) cotes 1,85-2,25 réelles (1N2 et +/-2,5) : les 10 % les plus sûres selon le modèle
C2 = B[(B.o >= 1.85) & (B.o <= 2.25) & B.real]
top = C2[C2.p >= C2.p.quantile(0.9)]
topm = C2[C2.pm >= C2.pm.quantile(0.9)]
R["cote_2"] = dict(paris=int(len(C2)), reussite_moyenne=float(C2.win.mean()), cote_moy=float(C2.o.mean()),
                   top10_modele=dict(paris=int(len(top)), reussite=float(top.win.mean()), proba_modele=float(top.p.mean()), rendement=float(top.profit.mean())),
                   top10_marche=dict(paris=int(len(topm)), reussite=float(topm.win.mean()), proba_marche=float(topm.pm.mean()), rendement=float(topm.profit.mean())))
# (c) modèles
rng = np.random.default_rng(3)
def boot(a, b):
    d = b - a; bs = [d[rng.integers(0, len(d), len(d))].mean() for _ in range(2000)]
    return dict(gain=float(-d.mean()), ic95=[float(-np.percentile(bs, 97.5)), float(-np.percentile(bs, 2.5))])
res = {}
for name, keys, kind in [("logistique_modele", ["dc", "sot", "pi"], "lr"), ("boosting_modele", ["dc", "sot", "pi"], "gb"),
                         ("logistique_modele_marche", ["dc", "sot", "pi", "mkt"], "lr"), ("boosting_modele_marche", ["dc", "sot", "pi", "mkt"], "gb")]:
    P = stack(keys, kind); res[name] = P
R["modeles"] = {k: float(rps(v[ok], O[ok]).mean()) for k, v in res.items()}
R["modeles"]["marche_seul"] = float(rps(MK[ok], O[ok]).mean())
R["boosting_vs_logistique"] = boot(rps(res["logistique_modele"][ok], O[ok]), rps(res["boosting_modele"][ok], O[ok]))
R["meilleur_vs_marche"] = boot(rps(MK[ok], O[ok]), rps(res["logistique_modele_marche"][ok], O[ok]))
json.dump(R, open(OUT / "lab7.json", "w"), indent=1, ensure_ascii=False, default=float)
print(json.dumps(R, indent=1, ensure_ascii=False, default=float))
