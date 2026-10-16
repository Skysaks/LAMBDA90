"""Test de confiance n° 1 : le modèle face à la clôture Pinnacle (CLV).
- RPS : modèle, ouverture Pinnacle, clôture Pinnacle (la clôture intègre compos et dernières nouvelles).
- CLV : quand le modèle voit de la valeur à l'ouverture, la cote baisse-t-elle ensuite ? Une CLV moyenne positive et
  stable est la preuve qu'un modèle détient une information que le marché n'avait pas encore. C'est le critère des pros.
Entrées : out/engine3_preds.csv, data/closing.csv (pipeline/fetch_closing.py). Sortie : out/clv.json.
"""
import json, sys
from pathlib import Path
import numpy as np, pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
OUT = Path(sys.argv[1]); CL = Path(sys.argv[2])
if not CL.exists(): print("pas de", CL); sys.exit(0)
D = pd.read_csv(OUT / "engine3_preds.csv", parse_dates=["date"])
C = pd.read_csv(CL, parse_dates=["Date"]).rename(columns={"Date": "date", "HomeTeam": "home", "AwayTeam": "away"})
# Pinnacle d'abord ; depuis la fermeture de son API (juillet 2025), la colonne peut manquer : repli sur la clôture Bet365
BOOK = "Pinnacle"
if C[["PSCH", "PSCD", "PSCA"]].dropna().shape[0] < 200 if {"PSCH", "PSCD", "PSCA"} <= set(C.columns) else True:
    BOOK = "Bet365"; C = C.rename(columns={"B365H": "PSH", "B365D": "PSD", "B365A": "PSA", "B365CH": "PSCH", "B365CD": "PSCD", "B365CA": "PSCA"})
D = D.merge(C[["date", "home", "away", "PSH", "PSD", "PSA", "PSCH", "PSCD", "PSCA"]], on=["date", "home", "away"], how="inner")
D = D.dropna(subset=["PSH", "PSD", "PSA", "PSCH", "PSCD", "PSCA"]).reset_index(drop=True)
if len(D) < 200: print("trop peu de matchs appariés", len(D)); sys.exit(0)
rng = np.random.default_rng(5)
def shin(q):
    q = 1 / q; S = q.sum(1, keepdims=True); lo = np.zeros((len(q), 1)); hi = np.full((len(q), 1), 0.4)
    for _ in range(60):
        z = (lo + hi) / 2; p = (np.sqrt(z * z + 4 * (1 - z) * q * q / S) - z) / (2 * (1 - z)); big = p.sum(1, keepdims=True) > 1
        lo = np.where(big, z, lo); hi = np.where(big, hi, z)
    return p
rps = lambda A, B: (((np.cumsum(A, 1)[:, :-1] - np.cumsum(B, 1)[:, :-1]) ** 2).sum(1) / 2)
O = np.stack([D.hg > D.ag, D.hg == D.ag, D.hg < D.ag], 1).astype(float); y = O.argmax(1)
X = np.column_stack([np.log(D.pH / D.pD), np.log(D.pA / D.pD), np.log(D.sl / D.sm), np.log(D.sl + D.sm), D.pi])
P = np.full((len(D), 3), np.nan)
seasons = sorted(D.season.unique())
for s in seasons[1:]:
    tr = (D.season < s).to_numpy(); te = (D.season == s).to_numpy()
    if tr.sum() < 200 or te.sum() == 0: continue
    sc = StandardScaler().fit(X[tr]); c = LogisticRegression(C=1.0, max_iter=3000).fit(sc.transform(X[tr]), y[tr]); P[te] = c.predict_proba(sc.transform(X[te]))
ok = ~np.isnan(P[:, 0]); D, P, O = D[ok].reset_index(drop=True), P[ok], O[ok]
OP = D[["PSH", "PSD", "PSA"]].to_numpy(); CP = D[["PSCH", "PSCD", "PSCA"]].to_numpy()
po, pc = shin(OP), shin(CP)
R = dict(bookmaker=BOOK, n=int(len(D)), saisons=[int(s) for s in seasons[1:]], rps_modele=float(rps(P, O).mean()), rps_pinnacle_ouverture=float(rps(po, O).mean()), rps_pinnacle_cloture=float(rps(pc, O).mean()))
# CLV : paris où le modèle × cote d'ouverture > seuil ; CLV = cote ouverture / cote de clôture juste - 1
for thr in (1.02, 1.05, 1.10):
    ev = P * OP; pick = ev > thr
    i, j = np.nonzero(pick)
    if len(i) < 30: R[f"clv_seuil_{thr}"] = dict(n=int(len(i))); continue
    clv = OP[i, j] * pc[i, j] - 1                      # valeur de la cote prise, jugée par la probabilité de clôture
    roi = np.where(O[i, j] == 1, OP[i, j] - 1, -1.0)
    bs = [clv[rng.integers(0, len(clv), len(clv))].mean() for _ in range(2000)]
    R[f"clv_seuil_{thr}"] = dict(n=int(len(i)), clv_moy=float(clv.mean()), ic95=[float(np.percentile(bs, 2.5)), float(np.percentile(bs, 97.5))],
                                 part_cote_baissee=float((CP[i, j] < OP[i, j]).mean()), roi_reel=float(roi.mean()))
json.dump(R, open(OUT / "clv.json", "w"), indent=1)
print(json.dumps(R, indent=1))
