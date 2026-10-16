"""Laboratoire 8 : la seule « value » qui a une chance réelle, le prix d'un bookmaker contre le prix juste de Pinnacle.
On parie une issue quand la cote Bet365 dépasse la cote juste Pinnacle (Shin) d'au moins un seuil, aux mêmes instants d'ouverture.
Juges : rendement réel (avec intervalle de confiance) et CLV contre la clôture Pinnacle.
Entrée : data/closing.csv (football-data.co.uk). Sortie : out/lab8.json.
"""
import json, sys
from pathlib import Path
import numpy as np, pandas as pd
ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
C = pd.read_csv(ROOT / "data" / "closing.csv")
cols = ["PSH", "PSD", "PSA", "PSCH", "PSCD", "PSCA", "B365H", "B365D", "B365A"]
D = C.dropna(subset=cols).reset_index(drop=True)
def shin(q):
    q = 1 / q; S = q.sum(1, keepdims=True); lo = np.zeros((len(q), 1)); hi = np.full((len(q), 1), 0.4)
    for _ in range(60):
        z = (lo + hi) / 2; p = (np.sqrt(z * z + 4 * (1 - z) * q * q / S) - z) / (2 * (1 - z)); big = p.sum(1, keepdims=True) > 1
        lo = np.where(big, z, lo); hi = np.where(big, hi, z)
    return p
po, pc = shin(D[["PSH", "PSD", "PSA"]].to_numpy()), shin(D[["PSCH", "PSCD", "PSCA"]].to_numpy())
ob = D[["B365H", "B365D", "B365A"]].to_numpy()
O = np.stack([D.FTHG > D.FTAG, D.FTHG == D.FTAG, D.FTHG < D.FTAG], 1).astype(float)
rng = np.random.default_rng(8)
def ci(x):
    bs = [x[rng.integers(0, len(x), len(x))].mean() for _ in range(3000)]
    return [float(np.percentile(bs, 2.5)), float(np.percentile(bs, 97.5))]
R = dict(matchs=int(len(D)), marge_moy_bet365=float((1 / ob).sum(1).mean() - 1), marge_moy_pinnacle=float((1 / D[["PSH", "PSD", "PSA"]].to_numpy()).sum(1).mean() - 1))
for thr in (0.0, 0.02, 0.04):
    i, j = np.nonzero(ob * po > 1 + thr)
    if len(i) < 20: R[f"seuil_{thr}"] = dict(paris=int(len(i))); continue
    profit = np.where(O[i, j] == 1, ob[i, j] - 1, -1.0); clv = ob[i, j] * pc[i, j] - 1
    R[f"seuil_{thr}"] = dict(paris=int(len(i)), par_match=float(len(i) / len(D)), cote_moy=float(ob[i, j].mean()), ev_annonce=float((ob[i, j] * po[i, j] - 1).mean()),
                             rendement=float(profit.mean()), ic95_rendement=ci(profit), clv=float(clv.mean()), ic95_clv=ci(clv))
# Témoin : parier toutes les issues chez Bet365 (perte attendue = marge)
allp = np.where(O == 1, ob - 1, -1.0).ravel(); R["temoin_tout_parier"] = dict(rendement=float(allp.mean()))
# La clôture Pinnacle est-elle bien calibrée ? (le juge doit être juste)
bins = np.linspace(0, 1, 11); P = pc.ravel(); Y = O.ravel(); k = np.digitize(P, bins) - 1
R["calibration_cloture"] = [dict(tranche=f"{int(bins[b]*100)}-{int(bins[b+1]*100)} %", n=int((k == b).sum()), annonce=float(P[k == b].mean()), observe=float(Y[k == b].mean())) for b in range(10) if (k == b).sum() > 50]
(ROOT / "out").mkdir(exist_ok=True); json.dump(R, open(ROOT / "out" / "lab8.json", "w"), indent=1, ensure_ascii=False)
print(json.dumps(R, indent=1, ensure_ascii=False))
