"""Laboratoire 5 : le nombre total de buts est-il bien calibré ? Poisson Dixon-Coles contre binomiale négative (dispersion réglée sur 2024, testée sur 2025-26)."""
import json, sys
from pathlib import Path
import numpy as np, pandas as pd
from scipy.stats import poisson, nbinom
OUT = Path(sys.argv[1]); D = pd.read_csv(OUT / "engine3_preds.csv", parse_dates=["date"])
G = 7
def dist(lam, mu, rho, r=None):
    k = np.arange(11)
    if r is None: px = poisson.pmf(k[None], lam[:, None]); py = poisson.pmf(k[None], mu[:, None])
    else: px = nbinom.pmf(k[None], r, r / (r + lam[:, None])); py = nbinom.pmf(k[None], r, r / (r + mu[:, None]))
    M = px[:, :, None] * py[:, None, :]
    M[:, 0, 0] *= 1 - lam * mu * rho; M[:, 0, 1] *= 1 + lam * rho; M[:, 1, 0] *= 1 + mu * rho; M[:, 1, 1] *= 1 - rho
    M /= M.sum((1, 2), keepdims=True); tot = np.add.outer(k, k)
    T = np.stack([(M * (tot == g)).sum((1, 2)) for g in range(G - 1)] + [(M * (tot >= G - 1)).sum((1, 2))], 1)
    return T
def rps(P, y):
    O = np.eye(G)[np.minimum(y, G - 1)]; return float((((np.cumsum(P, 1) - np.cumsum(O, 1))[:, :-1]) ** 2).sum(1).mean() / (G - 1))
tr = D[D.season == 2024]; te = D[D.season >= 2025]
ytr = (tr.hg + tr.ag).to_numpy(); yte = (te.hg + te.ag).to_numpy()
# recalage d'échelle des buts (comme le moteur) : k global appris sur 2024
ks = np.linspace(0.9, 1.1, 21)
kb = min(ks, key=lambda k: rps(dist(tr.lam.to_numpy() * k, tr.mu.to_numpy() * k, tr.rho.to_numpy()), ytr))
R = {"k": float(kb)}
base = dist(te.lam.to_numpy() * kb, te.mu.to_numpy() * kb, te.rho.to_numpy())
R["poisson"] = rps(base, yte)
grid = [3, 5, 8, 12, 20, 40, 80]
sc = {r: rps(dist(tr.lam.to_numpy() * kb, tr.mu.to_numpy() * kb, tr.rho.to_numpy(), r), ytr) for r in grid}
rb = min(sc, key=sc.get); R["nb_r"] = rb; R["nb_train"] = sc
nb = dist(te.lam.to_numpy() * kb, te.mu.to_numpy() * kb, te.rho.to_numpy(), rb); R["binneg"] = rps(nb, yte)
R["calibration"] = [dict(buts=g if g < G - 1 else "6+", predit=float(base[:, g].mean()), binneg=float(nb[:, g].mean()), observe=float((np.minimum(yte, G - 1) == g).mean())) for g in range(G)]
R["n_test"] = int(len(te))
json.dump(R, open(OUT / "lab5.json", "w"), indent=1); print(json.dumps(R, indent=1))
# Couche de calibration par nombre total de buts : w_g = observé / prédit sur 2024 (rétréci), appliquée à la matrice
def mats(lam, mu, rho):
    k = np.arange(11); px = poisson.pmf(k[None], lam[:, None]); py = poisson.pmf(k[None], mu[:, None]); M = px[:, :, None] * py[:, None, :]
    M[:, 0, 0] *= 1 - lam * mu * rho; M[:, 0, 1] *= 1 + lam * rho; M[:, 1, 0] *= 1 + mu * rho; M[:, 1, 1] *= 1 - rho
    return M / M.sum((1, 2), keepdims=True)
tot = np.minimum(np.add.outer(np.arange(11), np.arange(11)), G - 1)
def apply(M, w):
    Q = M * w[tot][None]; return Q / Q.sum((1, 2), keepdims=True)
def totals(M): return np.stack([(M * (tot == g)).sum((1, 2)) for g in range(G)], 1)
def r1x2(M, hg, ag):
    i, j = np.meshgrid(np.arange(11), np.arange(11), indexing="ij")
    P = np.stack([(M * (i > j)).sum((1, 2)), (M * (i == j)).sum((1, 2)), (M * (i < j)).sum((1, 2))], 1); O = np.eye(3)[np.where(hg > ag, 0, np.where(hg == ag, 1, 2))]
    return float((((np.cumsum(P, 1) - np.cumsum(O, 1))[:, :-1]) ** 2).sum(1).mean() / 2)
out = {}
for train_seasons, test_season in (([2024], [2025, 2026]),):
    a = D[D.season.isin(train_seasons)]; b = D[D.season.isin(test_season)]
    Ma = mats(a.lam.to_numpy() * kb, a.mu.to_numpy() * kb, a.rho.to_numpy()); Mb = mats(b.lam.to_numpy() * kb, b.mu.to_numpy() * kb, b.rho.to_numpy())
    ya = np.minimum((a.hg + a.ag).to_numpy(), G - 1); yb = (b.hg + b.ag).to_numpy()
    obs = np.bincount(ya, minlength=G) / len(ya); pred = totals(Ma).mean(0)
    for shrink in (0.0, 0.5, 1.0):
        w = 1 + shrink * (obs / pred - 1)
        Q = apply(Mb, w)
        out[f"w_{shrink}"] = dict(w=w.round(3).tolist(), rps_buts=rps(totals(Q), yb), rps_1n2=r1x2(Q, b.hg.to_numpy(), b.ag.to_numpy()))
# Validation inverse : apprise sur 2025, testée sur 2024 (stabilité du motif)
a, b = D[D.season == 2025], D[D.season == 2024]
Ma = mats(a.lam.to_numpy() * kb, a.mu.to_numpy() * kb, a.rho.to_numpy()); Mb = mats(b.lam.to_numpy() * kb, b.mu.to_numpy() * kb, b.rho.to_numpy())
ya = np.minimum((a.hg + a.ag).to_numpy(), G - 1); w = 1 + 0.5 * (np.bincount(ya, minlength=G) / len(ya) / totals(Ma).mean(0) - 1)
out["inverse"] = dict(w=w.round(3).tolist(), sans=rps(totals(Mb), (b.hg + b.ag).to_numpy()), avec=rps(totals(apply(Mb, w)), (b.hg + b.ag).to_numpy()))
R["couche"] = out; json.dump(R, open(OUT / "lab5.json", "w"), indent=1); print(json.dumps(out, indent=1))
# IC bootstrap du gain (w appris sur 2024, rétrécissement 0,75, test 2025-26) + poids finaux sur toutes les saisons
a, b = D[D.season == 2024], D[D.season >= 2025]
Ma = mats(a.lam.to_numpy() * kb, a.mu.to_numpy() * kb, a.rho.to_numpy()); Mb = mats(b.lam.to_numpy() * kb, b.mu.to_numpy() * kb, b.rho.to_numpy())
ya = np.minimum((a.hg + a.ag).to_numpy(), G - 1); w = 1 + 0.75 * (np.bincount(ya, minlength=G) / len(ya) / totals(Ma).mean(0) - 1)
yb = np.minimum((b.hg + b.ag).to_numpy(), G - 1); Ob = np.eye(G)[yb]
per = lambda P: (((np.cumsum(P, 1) - np.cumsum(Ob, 1))[:, :-1]) ** 2).sum(1) / (G - 1)
d = per(totals(apply(Mb, w))) - per(totals(Mb)); rng = np.random.default_rng(2)
bs = [d[rng.integers(0, len(d), len(d))].mean() for _ in range(3000)]
Mall = mats(D.lam.to_numpy() * kb, D.mu.to_numpy() * kb, D.rho.to_numpy()); yall = np.minimum((D.hg + D.ag).to_numpy(), G - 1)
wf = 1 + 0.75 * (np.bincount(yall, minlength=G) / len(yall) / totals(Mall).mean(0) - 1)
R["adopte"] = dict(gain_rps=float(-d.mean()), ic95=[float(-np.percentile(bs, 97.5)), float(-np.percentile(bs, 2.5))], poids_finaux=wf.round(4).tolist(), n=int(len(d)))
json.dump(R, open(OUT / "lab5.json", "w"), indent=1); print(R["adopte"])
