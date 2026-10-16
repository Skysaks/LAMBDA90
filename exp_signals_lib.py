"""Lambda 90 — laboratoire de signaux.
Teste en walk-forward (refit hebdomadaire, données strictement antérieures) :
  A. Dixon-Coles de base (rétrécissement vers 0)
  B. Dixon-Coles + a priori « promu » (estimé sur 2022-23 et 2023-24 uniquement)
  C. Empilement (régression logistique multinomiale) : DC + Elo + pi-ratings + repos + forme, entraînement sur saisons passées uniquement
  D. Correction d'inflation des nuls (paramètre unique estimé sur la saison précédente)
  E. Mi-temps : modèle de demi-périodes indépendantes (part de buts en 1re période estimée sur le passé)
Saisons testées : 2024-25, 2025-26, 2026-27 (jouée). 7 championnats.
"""
import json, math, sys
from pathlib import Path
import numpy as np, pandas as pd
from scipy.optimize import minimize
from scipy.stats import poisson
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

ROOT = Path(sys.argv[1]); OUT = Path(sys.argv[2])
LEAGUES = ["fr.1", "en.1", "es.1", "de.1", "it.1", "pt.1", "nl.1"]
ALL_SEASONS = ["2021-22", "2022-23", "2023-24", "2024-25", "2025-26", "2026-27"]
TEST = ["2024-25", "2025-26", "2026-27"]
XI, L2 = 0.0019, 0.5

def load(code):
    rows, teams_by_season = [], {}
    for s in ALL_SEASONS:
        f = ROOT / s / f"{code}.json"
        if not f.exists(): continue
        ms = json.load(open(f))["matches"]; ts = set()
        for m in ms:
            ts |= {m["team1"], m["team2"]}
            sc = m.get("score")
            ft = sc.get("ft") if isinstance(sc, dict) else (sc if isinstance(sc, list) and len(sc) == 2 else None)
            ht = sc.get("ht") if isinstance(sc, dict) else None
            if ft: rows.append(dict(season=s, date=pd.Timestamp(m["date"]), home=m["team1"], away=m["team2"], hg=ft[0], ag=ft[1],
                                    hth=ht[0] if ht else np.nan, hta=ht[1] if ht else np.nan))
        teams_by_season[s] = ts
    return pd.DataFrame(rows).sort_values("date").reset_index(drop=True), teams_by_season

def tau(x, y, lam, mu, rho):
    t = np.ones_like(lam)
    t = np.where((x == 0) & (y == 0), 1 - lam * mu * rho, t); t = np.where((x == 0) & (y == 1), 1 + lam * rho, t)
    t = np.where((x == 1) & (y == 0), 1 + mu * rho, t); t = np.where((x == 1) & (y == 1), 1 - rho, t)
    return t

def fit(df, ref, prior=None, prev=None, want_cov=False):
    teams = sorted(set(df.home) | set(df.away)); idx = {t: i for i, t in enumerate(teams)}; n = len(teams)
    h = df.home.map(idx).to_numpy(); a = df.away.map(idx).to_numpy(); x = df.hg.to_numpy(); y = df.ag.to_numpy()
    w = np.exp(-XI * (ref - df.date).dt.days.to_numpy())
    lgx = np.array([math.lgamma(v + 1) for v in x]); lgy = np.array([math.lgamma(v + 1) for v in y])
    pa = np.zeros(n); pd_ = np.zeros(n)
    if prior:
        for t, (va, vd) in prior.items():
            if t in idx: pa[idx[t]] = va; pd_[idx[t]] = vd
    def nll(p):
        att, de, home, rho, mu0 = p[:n], p[n:2*n], p[2*n], p[2*n+1], p[2*n+2]
        lam = np.exp(mu0 + home + att[h] + de[a]); mu = np.exp(mu0 + att[a] + de[h])
        t = np.clip(tau(x, y, lam, mu, rho), 1e-10, None)
        ll = np.log(t) + x * np.log(lam) - lam - lgx + y * np.log(mu) - mu - lgy
        return -(w * ll).sum() + L2 * (((att - pa) ** 2).sum() + ((de - pd_) ** 2).sum())
    p0 = np.zeros(2 * n + 3); p0[:n] = pa; p0[n:2*n] = pd_; p0[2*n:] = [0.25, -0.05, 0.25]
    if prev is not None:
        for t, i in idx.items():
            if t in prev["idx"]: j = prev["idx"][t]; p0[i] = prev["att"][j]; p0[n+i] = prev["def"][j]
        p0[2*n:] = [prev["home"], prev["rho"], prev["mu0"]]
    r = minimize(nll, p0, method="L-BFGS-B", bounds=[(None, None)] * (2*n) + [(None, None), (-0.25, 0.25), (None, None)])
    p = r.x
    out = dict(idx=idx, att=p[:n], **{"def": p[n:2*n]}, home=p[2*n], rho=p[2*n+1], mu0=p[2*n+2])
    if want_cov:
        H = r.hess_inv.todense() if hasattr(r.hess_inv, "todense") else np.asarray(r.hess_inv)
        out["se_att"] = np.sqrt(np.clip(np.diag(H)[:n], 0, None)); out["se_def"] = np.sqrt(np.clip(np.diag(H)[n:2*n], 0, None))
    return out

def rates(m, home, away, prior=None):
    def g(t):
        if t in m["idx"]: i = m["idx"][t]; return m["att"][i], m["def"][i]
        return prior.get(t, (0.0, 0.0)) if prior else (0.0, 0.0)
    ah, dh = g(home); aa, da = g(away)
    return math.exp(m["mu0"] + m["home"] + ah + da), math.exp(m["mu0"] + aa + dh)

def matrix(lam, mu, rho, G=10):
    g = np.arange(G + 1); M = np.outer(poisson.pmf(g, lam), poisson.pmf(g, mu))
    M[0, 0] *= 1 - lam * mu * rho; M[0, 1] *= 1 + lam * rho; M[1, 0] *= 1 + mu * rho; M[1, 1] *= 1 - rho
    return M / M.sum()
def hda(M):
    i, j = np.indices(M.shape); return np.array([M[i > j].sum(), M[i == j].sum(), M[i < j].sum()])

def rps(P, O):
    cp, co = np.cumsum(P, 1)[:, :-1], np.cumsum(O, 1)[:, :-1]
    return ((cp - co) ** 2).sum(1) / 2

