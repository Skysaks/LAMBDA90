"""Lambda 90 — moteur avant-match.
Dixon-Coles (1997) avec pondération temporelle exponentielle et rétrécissement L2.
Données : openfootball/football.json (CC0). Backtest walk-forward : refit hebdomadaire,
uniquement sur les matchs strictement antérieurs à la semaine prédite.
"""
import json, sys, math
from pathlib import Path
import numpy as np, pandas as pd
from scipy.optimize import minimize
from scipy.stats import poisson

ROOT = Path(sys.argv[1]); OUT = Path(sys.argv[2]); OUT.mkdir(parents=True, exist_ok=True)
LEAGUES = {"fr.1": "Ligue 1", "en.1": "Premier League", "es.1": "LaLiga", "de.1": "Bundesliga",
           "it.1": "Serie A", "pt.1": "Liga Portugal", "nl.1": "Eredivisie"}
SEASONS = ["2023-24", "2024-25", "2025-26", "2026-27"]
TODAY = pd.Timestamp("2026-10-16")
XI = 0.0019      # décroissance par jour (Dixon & Coles : demi-vie ~ 1 an)
L2 = 0.5         # rétrécissement des forces d'équipe vers la moyenne
MAXG = 10

def load(code):
    rows, fixtures = [], []
    for s in SEASONS:
        f = ROOT / s / f"{code}.json"
        if not f.exists(): continue
        for m in json.load(open(f))["matches"]:
            sc = m.get("score"); ft = sc.get("ft") if isinstance(sc, dict) else (sc if isinstance(sc, list) and len(sc) == 2 else None)
            r = dict(season=s, date=pd.Timestamp(m["date"]), home=m["team1"], away=m["team2"],
                     time=m.get("time", ""), round=m.get("round", ""))
            if ft: rows.append({**r, "hg": ft[0], "ag": ft[1]})
            elif s == "2026-27": fixtures.append(r)
    return pd.DataFrame(rows).sort_values("date").reset_index(drop=True), pd.DataFrame(fixtures)

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

def matrix(lam, mu, rho):
    g = np.arange(MAXG + 1)
    M = np.outer(poisson.pmf(g, lam), poisson.pmf(g, mu))
    M[0, 0] *= 1 - lam * mu * rho; M[0, 1] *= 1 + lam * rho; M[1, 0] *= 1 + mu * rho; M[1, 1] *= 1 - rho
    return M / M.sum()

def markets(lam, mu, rho):
    M = matrix(lam, mu, rho); i, j = np.indices(M.shape); tot = i + j
    return dict(H=M[i > j].sum(), D=M[i == j].sum(), A=M[i < j].sum(), O25=M[tot > 2].sum(),
                BTTS=M[(i > 0) & (j > 0)].sum())

def rps(p, o):  # p,o : [H,D,A]
    cp, co = np.cumsum(p)[:-1], np.cumsum(o)[:-1]
    return ((cp - co) ** 2).sum() / 2

preds, fixtures_out, ratings_out = [], [], {}
for code, name in LEAGUES.items():
    df, fx = load(code)
    if df.empty: continue
    test = df[df.season.isin(["2025-26", "2026-27"])]
    weeks = sorted(test.date.dt.to_period("W-SUN").unique())
    prev = None
    for wk in weeks:
        start = wk.start_time
        train = df[df.date < start]
        m = fit(train, start, prev); prev = m
        recent = train[train.date >= start - pd.Timedelta(days=730)]
        base = np.array([(recent.hg > recent.ag).mean(), (recent.hg == recent.ag).mean(), (recent.hg < recent.ag).mean()])
        base_o25 = ((recent.hg + recent.ag) > 2).mean()
        for r in test[test.date.dt.to_period("W-SUN") == wk].itertuples():
            lam, mu = rates(m, r.home, r.away); k = markets(lam, mu, m["rho"])
            res = "H" if r.hg > r.ag else "D" if r.hg == r.ag else "A"
            preds.append(dict(league=code, season=r.season, date=r.date.strftime("%Y-%m-%d"), home=r.home, away=r.away,
                              hg=r.hg, ag=r.ag, res=res, lam=lam, mu=mu, pH=k["H"], pD=k["D"], pA=k["A"],
                              pO25=k["O25"], pBTTS=k["BTTS"], bH=base[0], bD=base[1], bA=base[2], bO25=base_o25))
    # Modèle final au 16/10/2026 + prochains matchs
    m = fit(df, TODAY, prev)
    ratings_out[code] = dict(name=name, home=m["home"], rho=m["rho"], mu0=m["mu0"],
        teams=sorted([dict(team=t, att=float(m["att"][i]), dfn=float(m["def"][i]),
                           n=int(((df.home == t) | (df.away == t)).sum())) for t, i in m["idx"].items()
                      if ((df.home == t) | (df.away == t))[df.season == "2026-27"].any()],
                     key=lambda d: -(d["att"] - d["dfn"])),
        last_result=df.date.max().strftime("%Y-%m-%d"), n_matches=len(df))
    up = fx[(fx.date >= TODAY) & (fx.date <= TODAY + pd.Timedelta(days=11))] if not fx.empty else fx
    for r in up.itertuples():
        lam, mu = rates(m, r.home, r.away)
        fixtures_out.append(dict(league=code, date=r.date.strftime("%Y-%m-%d"), time=r.time, round=r.round,
                                 home=r.home, away=r.away, lam=round(lam, 4), mu=round(mu, 4), rho=round(float(m["rho"]), 4)))
    print(code, "matchs", len(df), "à venir", len(up), "dernier résultat", df.date.max().date(), flush=True)

P = pd.DataFrame(preds)
P.to_csv(OUT / "backtest_prematch.csv", index=False)

def metrics(d):
    p = d[["pH", "pD", "pA"]].to_numpy(); b = d[["bH", "bD", "bA"]].to_numpy()
    o = np.stack([(d.res == "H"), (d.res == "D"), (d.res == "A")], 1).astype(float)
    po = (p * o).sum(1); bo = (b * o).sum(1)
    y25 = ((d.hg + d.ag) > 2).astype(float).to_numpy()
    return dict(n=len(d), rps=float(np.mean([rps(p[i], o[i]) for i in range(len(d))])),
                rps_base=float(np.mean([rps(b[i], o[i]) for i in range(len(d))])),
                brier=float(((p - o) ** 2).sum(1).mean()), brier_base=float(((b - o) ** 2).sum(1).mean()),
                logloss=float(-np.log(po).mean()), logloss_base=float(-np.log(bo).mean()),
                acc=float((p.argmax(1) == o.argmax(1)).mean()),
                brier_o25=float(((d.pO25 - y25) ** 2).mean()), brier_o25_base=float(((d.bO25 - y25) ** 2).mean()))

summary = {"all": metrics(P)}
for code in P.league.unique(): summary[code] = metrics(P[P.league == code])
# Calibration 1X2 regroupée (chaque issue = une prévision) et O2.5
long = pd.concat([pd.DataFrame({"p": P["p" + k], "y": (P.res == k).astype(float)}) for k in "HDA"])
bins = np.linspace(0, 1, 11); long["b"] = pd.cut(long.p, bins, include_lowest=True)
cal = long.groupby("b", observed=True).agg(p=("p", "mean"), y=("y", "mean"), n=("y", "size")).reset_index(drop=True)
P["y25"] = ((P.hg + P.ag) > 2).astype(float); P["b25"] = pd.cut(P.pO25, bins, include_lowest=True)
cal25 = P.groupby("b25", observed=True).agg(p=("pO25", "mean"), y=("y25", "mean"), n=("y25", "size")).reset_index(drop=True)

reg = P[P.season == "2026-27"].sort_values("date", ascending=False)
registry = [dict(league=r.league, date=r.date, home=r.home, away=r.away, score=f"{r.hg}-{r.ag}", res=r.res,
                 pH=round(r.pH, 4), pD=round(r.pD, 4), pA=round(r.pA, 4), pO25=round(r.pO25, 4)) for r in reg.itertuples()]

json.dump(dict(summary=summary, cal=cal.round(4).to_dict("records"), cal25=cal25.round(4).to_dict("records"),
               registry=registry, fixtures=fixtures_out, ratings=ratings_out,
               params=dict(xi=XI, l2=L2, today=str(TODAY.date()))),
          open(OUT / "prematch.json", "w"), ensure_ascii=False, default=float)
print(json.dumps(summary["all"], indent=1))
print(cal.round(3).to_string())
