"""Évaluation du moteur v3 : modèle seul, tirs cadrés, pi-ratings, marché, mélange modèle + marché, stratégie de value."""
import json, sys
from pathlib import Path
import numpy as np, pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
OUT = Path(sys.argv[1])
D = pd.read_csv(OUT / "engine3_preds.csv", parse_dates=["date"])
D = D.dropna(subset=["oH", "oD", "oA"]).reset_index(drop=True)

def shin(q):
    q = 1 / q; S = q.sum(1, keepdims=True); lo = np.zeros((len(q), 1)); hi = np.full((len(q), 1), 0.4)
    for _ in range(60):
        z = (lo + hi) / 2; p = (np.sqrt(z * z + 4 * (1 - z) * q * q / S) - z) / (2 * (1 - z))
        big = p.sum(1, keepdims=True) > 1; lo = np.where(big, z, lo); hi = np.where(big, hi, z)
    return p
def rps(P, O):
    cp, co = np.cumsum(P, 1)[:, :-1], np.cumsum(O, 1)[:, :-1]; return ((cp - co) ** 2).sum(1) / 2
O = np.stack([D.hg > D.ag, D.hg == D.ag, D.hg < D.ag], 1).astype(float); y = O.argmax(1)
PM = D[["pH", "pD", "pA"]].to_numpy(); MK = shin(D[["oH", "oD", "oA"]].to_numpy())
lg = lambda P: np.column_stack([np.log(P[:, 0] / P[:, 1]), np.log(P[:, 2] / P[:, 1])])
F = {"dc": lg(PM), "sot": np.column_stack([np.log(D.sl / D.sm), np.log(D.sl + D.sm)]), "pi": D[["pi"]].to_numpy(), "mkt": lg(MK)}
EVAL = [2025, 2026]
def stack(keys):
    X = np.column_stack([F[k] for k in keys]); P = np.full((len(D), 3), np.nan)
    for s in EVAL:
        tr = (D.season < s).to_numpy(); te = (D.season == s).to_numpy()
        sc = StandardScaler().fit(X[tr]); c = LogisticRegression(C=1.0, max_iter=3000).fit(sc.transform(X[tr]), y[tr]); P[te] = c.predict_proba(sc.transform(X[te]))
    return P
ev = D.season.isin(EVAL).to_numpy()
def score(P): return dict(n=int(ev.sum()), rps=float(rps(P[ev], O[ev]).mean()), logloss=float(-np.log((P[ev] * O[ev]).sum(1)).mean()))
R = {}
R["dc_brut"] = score(PM)
for name, keys in [("dc", ["dc"]), ("dc_pi", ["dc", "pi"]), ("dc_tirs", ["dc", "sot"]), ("dc_tirs_pi", ["dc", "sot", "pi"]), ("marche_seul", ["mkt"]),
                   ("marche_plus_modele", ["mkt", "dc", "sot", "pi"])]:
    R[name] = score(stack(keys))
R["marche_brut"] = score(MK)
best_model = min(["dc", "dc_pi", "dc_tirs", "dc_tirs_pi"], key=lambda k: R[k]["rps"])
keys = {"dc": ["dc"], "dc_pi": ["dc", "pi"], "dc_tirs": ["dc", "sot"], "dc_tirs_pi": ["dc", "sot", "pi"]}[best_model]
PB = stack(keys); PBL = stack(["mkt", "dc", "sot", "pi"])
# Totaux
yo = ((D.hg + D.ag) > 2).astype(int).to_numpy()
okO = D[["oO", "oU"]].notna().all(1).to_numpy()
MO = np.full(len(D), np.nan); MO[okO] = shin(D.loc[okO, ["oO", "oU"]].to_numpy())[:, 0]
def stack_bin(cols, mask):
    X = np.column_stack(cols); P = np.full(len(D), np.nan)
    for s in EVAL:
        tr = (D.season < s).to_numpy() & mask; te = (D.season == s).to_numpy() & mask
        sc = StandardScaler().fit(X[tr]); c = LogisticRegression(max_iter=2000).fit(sc.transform(X[tr]), yo[tr]); P[te] = c.predict_proba(sc.transform(X[te]))[:, 1]
    return P
lo = lambda p: np.log(p / (1 - p))
T = {}
m_all = np.ones(len(D), bool)
T["dc"] = D.pO.to_numpy(); T["dc_tirs"] = stack_bin([lo(D.pO), np.log(D.sl + D.sm)], m_all); T["marche"] = MO
T["marche_plus_modele"] = np.where(okO, stack_bin([lo(np.where(okO, MO, 0.5)), lo(D.pO), np.log(D.sl + D.sm)], okO), np.nan)
evo = ev & okO
R["totaux"] = {k: float(((v[evo] - yo[evo]) ** 2).mean()) for k, v in T.items()}
R["totaux"]["moyenne_saison_precedente"] = float(((yo[(D.season == 2024).to_numpy()].mean() - yo[evo]) ** 2).mean())
# Stratégie de value : modèle seul vs meilleure cote ; mélange vs meilleure cote ; seuils d'EV
def backtest(P, odds_cols, label):
    out = []
    Od = D[odds_cols].to_numpy()
    for t in (0.0, 0.03, 0.05, 0.10):
        evv = P * Od - 1; pick = (evv > t) & ev[:, None] & np.isfinite(Od)
        stake = pick.sum(); ret = (pick * O * Od).sum()
        if stake:
            prof = (pick * (O * Od - 1)).sum(1)[pick.any(1)]
            bs = [np.random.default_rng(i).choice(prof, len(prof)).mean() for i in range(400)]
            out.append(dict(seuil=t, paris=int(stake), roi=float(ret / stake - 1), ic95=[float(np.percentile(bs, 2.5)), float(np.percentile(bs, 97.5))]))
    R[label] = out
backtest(PB, ["xH", "xD", "xA"], "value_modele_meilleure_cote")
backtest(PB, ["oH", "oD", "oA"], "value_modele_bet365")
backtest(PBL, ["xH", "xD", "xA"], "value_melange_meilleure_cote")
backtest(MK, ["xH", "xD", "xA"], "value_marche_meilleure_cote")
R["meilleur_modele"] = best_model
# Écart modèle-marché par championnat
D["gap"] = np.abs(PB[:, 0] - MK[:, 0]) + np.abs(PB[:, 2] - MK[:, 2])
R["ecart_moyen_par_ligue"] = {k: float(v) for k, v in D[ev].groupby("league").gap.mean().round(4).items()}
R["par_ligue"] = {}
for l in D.league.unique():
    m = ev & (D.league == l).to_numpy()
    R["par_ligue"][l] = dict(n=int(m.sum()), modele=float(rps(PB[m], O[m]).mean()), marche=float(rps(MK[m], O[m]).mean()), melange=float(rps(PBL[m], O[m]).mean()))
json.dump(R, open(OUT / "engine3_eval.json", "w"), indent=1)
for k, v in R.items(): print(k, v if not isinstance(v, dict) else {kk: (round(vv, 4) if isinstance(vv, float) else vv) for kk, vv in v.items()})
