import json, math
from pathlib import Path
import numpy as np, pandas as pd
from scipy.optimize import minimize
XI = 0.0019; L2 = 0.5
def load(root, code, seasons):
    rows = []
    for s in seasons:
        f = Path(root) / s / f"{code}.json"
        if not f.exists(): continue
        for m in json.load(open(f))["matches"]:
            sc = m.get("score"); ft = sc.get("ft") if isinstance(sc, dict) else (sc if isinstance(sc, list) and len(sc) == 2 else None)
            if ft: rows.append(dict(season=s, date=pd.Timestamp(m["date"]), home=m["team1"], away=m["team2"], hg=ft[0], ag=ft[1]))
    return pd.DataFrame(rows).sort_values("date").reset_index(drop=True), None
def tau(x, y, lam, mu, rho):
    t = np.ones_like(lam)
    t = np.where((x == 0) & (y == 0), 1 - lam * mu * rho, t)
    t = np.where((x == 0) & (y == 1), 1 + lam * rho, t)
    t = np.where((x == 1) & (y == 0), 1 + mu * rho, t)
    t = np.where((x == 1) & (y == 1), 1 - rho, t)
    return t

def fit(df, ref_date, prev=None):
    teams = sorted(set(df.home) | set(df.away)); idx = {t: i for i, t in enumerate(teams)}; n = len(teams)
    h = df.home.map(idx).to_numpy(); a = df.away.map(idx).to_numpy()
    x = df.hg.to_numpy(); y = df.ag.to_numpy()
    w = np.exp(-XI * (ref_date - df.date).dt.days.to_numpy())
    lgx = np.array([math.lgamma(v + 1) for v in x]); lgy = np.array([math.lgamma(v + 1) for v in y])
    def nll(p):
        att, de, home, rho, mu0 = p[:n], p[n:2*n], p[2*n], p[2*n+1], p[2*n+2]
        lam = np.exp(mu0 + home + att[h] + de[a]); mu = np.exp(mu0 + att[a] + de[h])
        t = np.clip(tau(x, y, lam, mu, rho), 1e-10, None)
        ll = np.log(t) + x * np.log(lam) - lam - lgx + y * np.log(mu) - mu - lgy
        return -(w * ll).sum() + L2 * (att @ att + de @ de)
    p0 = np.zeros(2 * n + 3); p0[2*n] = 0.25; p0[2*n+1] = -0.05; p0[2*n+2] = 0.25
    if prev is not None:
        for t, i in idx.items():
            if t in prev["idx"]:
                j = prev["idx"][t]; p0[i] = prev["att"][j]; p0[n+i] = prev["def"][j]
        p0[2*n:] = [prev["home"], prev["rho"], prev["mu0"]]
    bounds = [(None, None)] * (2 * n) + [(None, None), (-0.25, 0.25), (None, None)]
    r = minimize(nll, p0, method="L-BFGS-B", bounds=bounds)
    p = r.x
    return dict(idx=idx, teams=teams, att=p[:n], **{"def": p[n:2*n]}, home=p[2*n], rho=p[2*n+1], mu0=p[2*n+2])

def rates(m, home, away):
    ih, ia = m["idx"].get(home), m["idx"].get(away)
    ah = m["att"][ih] if ih is not None else -0.15; dh = m["def"][ih] if ih is not None else 0.15
    aa = m["att"][ia] if ia is not None else -0.15; da = m["def"][ia] if ia is not None else 0.15
    return math.exp(m["mu0"] + m["home"] + ah + da), math.exp(m["mu0"] + aa + dh)

