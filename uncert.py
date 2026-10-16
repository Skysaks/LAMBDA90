"""Incertitude des paramètres Dixon-Coles : information de Fisher exacte de la partie Poisson (pondérée dans le temps, pénalité L2 incluse).
Ordre des paramètres : att (n), def (n), home, mu0. rho est tenu fixe.
"""
import numpy as np

def dc_cov(m, df, ref, xi, l2, ycols=("hg", "ag")):
    idx = m["idx"]; n = len(idx)
    d = df[df.home.isin(idx) & df.away.isin(idx)]
    h = d.home.map(idx).to_numpy(); a = d.away.map(idx).to_numpy()
    w = np.exp(-xi * (ref - d.date).dt.days.to_numpy())
    lam = np.exp(m["mu0"] + m["home"] + m["att"][h] + m["def"][a]); mu = np.exp(m["mu0"] + m["att"][a] + m["def"][h])
    k = 2 * n + 2; H = np.zeros((k, k))
    for wl, ia, idf, hm in ((w * lam, h, a + n, 1.0), (w * mu, a, h + n, 0.0)):
        cols = np.stack([ia, idf, np.full_like(ia, 2 * n), np.full_like(ia, 2 * n + 1)], 1)
        vals = np.stack([np.ones_like(wl), np.ones_like(wl), np.full_like(wl, hm), np.ones_like(wl)], 1)
        for r in range(4):
            for c in range(4):
                np.add.at(H, (cols[:, r], cols[:, c]), wl * vals[:, r] * vals[:, c])
    H[np.arange(2 * n), np.arange(2 * n)] += 2 * l2
    return np.linalg.pinv(H)

def draws(m, cov, N, rng):
    n = len(m["idx"]); mean = np.concatenate([m["att"], m["def"], [m["home"], m["mu0"]]])
    L = np.linalg.cholesky(cov + 1e-10 * np.eye(len(mean)))
    return mean + rng.normal(size=(N, len(mean))) @ L.T

def rates_draws(m, Z, h, a):
    n = len(m["idx"]); i = m["idx"].get(h); j = m["idx"].get(a)
    ah = Z[:, i] if i is not None else np.full(len(Z), -0.15); dh = Z[:, n + i] if i is not None else np.full(len(Z), 0.15)
    aa = Z[:, j] if j is not None else np.full(len(Z), -0.15); da = Z[:, n + j] if j is not None else np.full(len(Z), 0.15)
    home, mu0 = Z[:, 2 * n], Z[:, 2 * n + 1]
    return np.exp(mu0 + home + ah + da), np.exp(mu0 + aa + dh)

def probs_fast(lam, mu, rho, G=10):
    """1N2 et +2,5 vectorisés pour des tableaux de lam, mu."""
    k = np.arange(G); from math import lgamma
    lf = np.array([lgamma(i + 1) for i in k])
    px = np.exp(k[None, :] * np.log(lam[:, None]) - lam[:, None] - lf); py = np.exp(k[None, :] * np.log(mu[:, None]) - mu[:, None] - lf)
    Mx = px[:, :, None] * py[:, None, :]
    Mx[:, 0, 0] *= 1 - lam * mu * rho; Mx[:, 0, 1] *= 1 + lam * rho; Mx[:, 1, 0] *= 1 + mu * rho; Mx[:, 1, 1] *= 1 - rho
    Mx /= Mx.sum((1, 2), keepdims=True)
    tri = np.subtract.outer(k, k); tot = np.add.outer(k, k)
    return (Mx * (tri > 0)).sum((1, 2)), (Mx * (tri == 0)).sum((1, 2)), (Mx * (tri < 0)).sum((1, 2)), (Mx * (tot > 2)).sum((1, 2))
