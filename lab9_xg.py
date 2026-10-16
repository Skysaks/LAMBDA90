"""Laboratoire 9 : les xG Understat améliorent-ils le moteur ?
Dixon-Coles ajusté sur les xG (au lieu des buts), refit chaque semaine, ajouté à l'empilement actuel (buts + tirs cadrés + pi-ratings)
ou à la place des tirs cadrés. Test 2025-26 et 2026-27, apprentissage sur les saisons d'avant. Juges : RPS contre le moteur et contre le marché.
Usage : python lab9_xg.py <xgabora/data> <openfootball> <out> (data/understat.csv requis). Sortie : out/lab9.json.
"""
import json, sys
from pathlib import Path
import numpy as np, pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
sys.argv = [sys.argv[0], sys.argv[1], sys.argv[2], sys.argv[3], "none"]
ROOT = Path(__file__).parent
src = open(ROOT / "engine3.py").read().split("res = {}")[0]
ns = {"__file__": str(ROOT / "engine3.py")}; exec(src, ns)
M, OUT, COUNTRIES, fit_dc, rates = ns["M"], ns["OUT"], ns["COUNTRIES"], ns["fit_dc"], ns["rates"]
XI, L2 = 0.003, 0.1
R = {}
U = pd.read_csv(ROOT / "data" / "understat.csv", parse_dates=["date"])
R["matchs_understat"] = int(len(U))
# noms Understat -> noms football-data : vote sur date (±1 jour) et score
votes = {}
for code, g in U.groupby("league"):
    d1 = COUNTRIES[code][0]; Mx = M[M.Division == d1]; idx = {}
    for r in Mx.itertuples(): idx.setdefault((r.date, r.hg, r.ag), []).append(r)
    for r in g.itertuples():
        for dd in (0, -1, 1):
            c = idx.get((r.date + pd.Timedelta(days=dd), r.hg, r.ag), [])
            if len(c) == 1:
                for a, b in ((r.home, c[0].home), (r.away, c[0].away)): votes.setdefault((code, a), {}).setdefault(b, 0); votes[(code, a)][b] += 1
                break
mp = {k: max(v, key=v.get) for k, v in votes.items()}
U["home_fd"] = [mp.get((l, n)) for l, n in zip(U.league, U.home)]; U["away_fd"] = [mp.get((l, n)) for l, n in zip(U.league, U.away)]
R["equipes_rapprochees"] = len(mp)
rows = []
for code in U.league.unique():
    d1 = COUNTRIES[code][0]
    df = M[M.Division == d1].copy()
    u = U[U.league == code].dropna(subset=["home_fd", "away_fd"])
    # rattacher les xG aux matchs football-data (même affiche, date ±1 jour)
    key = {(r.home_fd, r.away_fd): [] for r in u.itertuples()}
    for r in u.itertuples(): key[(r.home_fd, r.away_fd)].append((r.date, r.hxg, r.axg))
    hx, ax = [], []
    for r in df.itertuples():
        c = [x for x in key.get((r.home, r.away), []) if abs((x[0] - r.date).days) <= 1]
        hx.append(c[0][1] if c else np.nan); ax.append(c[0][2] if c else np.nan)
    df["hxg"], df["axg"] = hx, ax
    R[f"couverture_{code}"] = float(df[df.season >= 2019].hxg.notna().mean())
    dfx = df.dropna(subset=["hxg", "axg"]).reset_index(drop=True)
    test = df[df.season.isin([2024, 2025, 2026])]
    dates = sorted(test.date.unique()); prev = None
    if not dates: continue
    start = dates[0]
    while start <= dates[-1]:
        end = start + pd.Timedelta(days=7); cur = test[(test.date >= start) & (test.date < end)]
        if len(cur):
            tr = dfx[(dfx.date < start) & (dfx.date >= start - pd.Timedelta(days=1100))]
            if len(tr) > 300:
                m = fit_dc(tr, start, XI, L2, prev, ycols=("hxg", "axg"), use_rho=False); prev = m
                for r in cur.itertuples():
                    a, b = rates(m, r.home, r.away); rows.append(dict(date=r.date, home=r.home, away=r.away, xl=a, xm=b))
        start = end
    print(code, "ok", flush=True)
X = pd.DataFrame(rows)
P = pd.read_csv(OUT / "engine3_preds.csv", parse_dates=["date"])
D = P.merge(X, on=["date", "home", "away"], how="inner").dropna(subset=["oH", "oD", "oA", "xl", "xm"]).reset_index(drop=True)
R["matchs_testables"] = int(len(D))
def shin(q):
    q = 1 / q; S = q.sum(1, keepdims=True); lo = np.zeros((len(q), 1)); hi = np.full((len(q), 1), 0.4)
    for _ in range(60):
        z = (lo + hi) / 2; p = (np.sqrt(z * z + 4 * (1 - z) * q * q / S) - z) / (2 * (1 - z)); big = p.sum(1, keepdims=True) > 1
        lo = np.where(big, z, lo); hi = np.where(big, hi, z)
    return p
rps = lambda A, B: (((np.cumsum(A, 1)[:, :-1] - np.cumsum(B, 1)[:, :-1]) ** 2).sum(1) / 2)
O = np.stack([D.hg > D.ag, D.hg == D.ag, D.hg < D.ag], 1).astype(float); y = O.argmax(1); MK = shin(D[["oH", "oD", "oA"]].to_numpy())
F = {"dc": np.column_stack([np.log(D.pH / D.pD), np.log(D.pA / D.pD)]), "sot": np.column_stack([np.log(D.sl / D.sm), np.log(D.sl + D.sm)]),
     "pi": D[["pi"]].to_numpy(), "xg": np.column_stack([np.log(D.xl / D.xm), np.log(D.xl + D.xm)]), "mkt": np.column_stack([np.log(MK[:, 0] / MK[:, 1]), np.log(MK[:, 2] / MK[:, 1])])}
EVAL = [s for s in (2025, 2026) if (D.season == s).any()]
def stack(keys):
    Z = np.column_stack([F[k] for k in keys]); Pp = np.full((len(D), 3), np.nan)
    for s in EVAL:
        tr = (D.season < s).to_numpy(); te = (D.season == s).to_numpy()
        if tr.sum() < 300 or te.sum() == 0: continue
        sc = StandardScaler().fit(Z[tr]); c = LogisticRegression(C=1.0, max_iter=3000).fit(sc.transform(Z[tr]), y[tr]); Pp[te] = c.predict_proba(sc.transform(Z[te]))
    return Pp
rng = np.random.default_rng(9)
def boot(a, b):
    d = b - a; bs = [d[rng.integers(0, len(d), len(d))].mean() for _ in range(2000)]
    return dict(gain=float(-d.mean()), ic95=[float(-np.percentile(bs, 97.5)), float(-np.percentile(bs, 2.5))], prouve=bool(-np.percentile(bs, 97.5) > 0))
res = {k: stack(v) for k, v in {"actuel": ["dc", "sot", "pi"], "plus_xg": ["dc", "sot", "pi", "xg"], "xg_au_lieu_tirs": ["dc", "xg", "pi"],
                                  "marche": ["mkt"], "marche_plus_xg": ["mkt", "dc", "sot", "pi", "xg"]}.items()}
ok = np.all([~np.isnan(v[:, 0]) for v in res.values()], axis=0)
R["n_test"] = int(ok.sum()); R["rps"] = {k: float(rps(v[ok], O[ok]).mean()) for k, v in res.items()}
r_ = {k: rps(v[ok], O[ok]) for k, v in res.items()}
R["xg_en_plus"] = boot(r_["actuel"], r_["plus_xg"]); R["xg_au_lieu_tirs"] = boot(r_["actuel"], r_["xg_au_lieu_tirs"]); R["au_dela_marche"] = boot(r_["marche"], r_["marche_plus_xg"])
json.dump(R, open(OUT / "lab9.json", "w"), indent=1, ensure_ascii=False)
print(json.dumps(R, indent=1, ensure_ascii=False))
