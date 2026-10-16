"""Lambda 90 — moteur v3.
Sources : xgabora/Club-Football-Match-Data (football-data.co.uk + ClubElo, 2000 → sept. 2026 : buts, tirs cadrés,
corners, cartons, cotes Bet365 et meilleures cotes) ; openfootball (résultats jusqu'au 20/09/2026, calendrier 2026-27).
Walk-forward : refit tous les 7 jours, entraînement strictement antérieur. Validation des hyperparamètres sur 2023-24,
test sur 2024-25, 2025-26 et 2026-27 (jouée).
"""
import json, math, sys, unicodedata, re
from pathlib import Path
import numpy as np, pandas as pd
from scipy.optimize import minimize
from scipy.stats import poisson
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

XG = Path(sys.argv[1]); OF = Path(sys.argv[2]); OUT = Path(sys.argv[3]); MODE = sys.argv[4] if len(sys.argv) > 4 else "full"
TODAY = pd.Timestamp(__import__("os").environ.get("L90_TODAY") or pd.Timestamp.today().normalize())  # date du jour, figeable pour les tests
COUNTRIES = {  # code openfootball de la 1re division : (div1, div2 ou None, libellé)
    "fr.1": ("F1", "F2"), "en.1": ("E0", "E1"), "es.1": ("SP1", "SP2"), "de.1": ("D1", "D2"), "it.1": ("I1", "I2"),
    "pt.1": ("P1", None), "nl.1": ("N1", None), "en.2": ("E1", "E2")}
OF_DIV = {"fr.1": "F1", "en.1": "E0", "es.1": "SP1", "de.1": "D1", "it.1": "I1", "pt.1": "P1", "nl.1": "N1", "en.2": "E1"}
SEASON_START = lambda d: d.year if d.month >= 7 else d.year - 1

# ---------- données ----------
M = pd.read_csv(XG / "Matches.csv", low_memory=False, parse_dates=["MatchDate"])
M = M[M.MatchDate >= "2018-07-01"].dropna(subset=["FTHome", "FTAway"])
M = M.rename(columns={"MatchDate": "date", "HomeTeam": "home", "AwayTeam": "away", "FTHome": "hg", "FTAway": "ag", "HTHome": "hth", "HTAway": "hta"})
M[["hg", "ag"]] = M[["hg", "ag"]].astype(int)

def canon(s):
    s = unicodedata.normalize("NFD", s); s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    return [w for w in re.sub(r"[^a-z0-9 ]", " ", s).split() if w not in {"fc", "afc", "cf", "sc", "ac", "as", "rc", "ogc", "ssc", "club", "de", "la", "le", "1", "sv", "vfb", "vfl", "tsg", "cd", "ud", "rcd", "ca", "us", "ss", "calcio", "1899", "1901", "1909", "1913", "1907", "04", "05", "29", "1846"}]
def load_of(code, season):
    f = OF / season / f"{code}.json"
    if not f.exists(): return pd.DataFrame()
    rows = []
    for m in json.load(open(f))["matches"]:
        sc = m.get("score"); ft = sc.get("ft") if isinstance(sc, dict) else (sc if isinstance(sc, list) and len(sc) == 2 else None)
        rows.append(dict(date=pd.Timestamp(m["date"]), home=m["team1"], away=m["team2"], hg=ft[0] if ft else None, ag=ft[1] if ft else None,
                         time=m.get("time", ""), round=m.get("round", "")))
    return pd.DataFrame(rows)

# Correspondance des noms openfootball → football-data, par matchs communs (même date, même score)
NAME = {}
for code, div in OF_DIV.items():
    votes = {}
    xg = M[(M.Division == div) & (M.date >= "2024-07-01")]
    for season in ["2024-25", "2025-26", "2026-27"]:
        of = load_of(code, season).dropna(subset=["hg"])
        for r in of.itertuples():
            cand = xg[(xg.date == r.date) & (xg.hg == r.hg) & (xg.ag == r.ag)]
            if len(cand) == 1:
                c = cand.iloc[0]; votes.setdefault(r.home, {}).setdefault(c.home, 0); votes[r.home][c.home] += 1
                votes.setdefault(r.away, {}).setdefault(c.away, 0); votes[r.away][c.away] += 1
    for t, v in votes.items(): NAME[(code, t)] = max(v, key=v.get)
    # équipes sans match commun : rapprochement par mots
    for season in ["2026-27"]:
        for t in set(load_of(code, season).home):
            if (code, t) not in NAME:
                best, bs = None, 0
                for x in set(xg.home):
                    a, b = set(canon(t)), set(canon(x)); s = len(a & b) / max(1, min(len(a), len(b)))
                    if s > bs: bs, best = s, x
                if bs >= 0.5: NAME[(code, t)] = best
print("noms rapprochés :", len(NAME), flush=True)

# Résultats openfootball postérieurs au dernier match football-data (pour être à jour au 20/09)
extra = []
for code, div in OF_DIV.items():
    last = M[M.Division == div].date.max()
    of = load_of(code, "2026-27").dropna(subset=["hg"])
    for r in of[of.date > last].itertuples():
        h, a = NAME.get((code, r.home)), NAME.get((code, r.away))
        if h and a: extra.append(dict(Division=div, date=r.date, home=h, away=a, hg=int(r.hg), ag=int(r.ag)))
# Résultats récents de football-data.org (chaîne quotidienne), noms rapprochés par matchs communs
RECENT = Path(__file__).parent / "data" / "recent.csv"
if RECENT.exists():
    R = pd.read_csv(RECENT, parse_dates=["date"])
    for div, g in R.groupby("Division"):
        xg = M[M.Division == div]; votes = {}
        for r in g.itertuples():
            cand = xg[(xg.date == r.date) & (xg.hg == r.hg) & (xg.ag == r.ag)]
            if len(cand) == 1:
                c = cand.iloc[0]
                for s_, x_ in ((r.home, c.home), (r.away, c.away)): votes.setdefault(s_, {}).setdefault(x_, 0); votes[s_][x_] += 1
        mp = {t: max(v, key=v.get) for t, v in votes.items()}
        last = max(xg.date.max(), max([e["date"] for e in extra if e["Division"] == div], default=xg.date.max()))
        for r in g[g.date > last].itertuples():
            if r.home in mp and r.away in mp: extra.append(dict(Division=div, date=r.date, home=mp[r.home], away=mp[r.away], hg=int(r.hg), ag=int(r.ag)))
M = pd.concat([M, pd.DataFrame(extra)], ignore_index=True).sort_values("date").reset_index(drop=True)
M["season"] = M.date.map(SEASON_START)
print("matchs ajoutés depuis openfootball :", len(extra), "| dernier résultat :", M.date.max().date(), flush=True)

# ---------- modèles ----------
def fit_dc(df, ref, xi, l2, prev=None, ycols=("hg", "ag"), use_rho=True, divoff=None):
    """Dixon-Coles pondéré dans le temps, gradient analytique. divoff : décalage d'attaque/défense par division (lien D1-D2)."""
    teams = pd.unique(pd.concat([df.home, df.away])); idx = {t: i for i, t in enumerate(teams)}; n = len(teams)
    h = df.home.map(idx).to_numpy(); a = df.away.map(idx).to_numpy()
    x = df[ycols[0]].to_numpy(float); y = df[ycols[1]].to_numpy(float)
    w = np.exp(-xi * (ref - df.date).dt.days.to_numpy())
    z00 = (x == 0) & (y == 0); z01 = (x == 0) & (y == 1); z10 = (x == 1) & (y == 0); z11 = (x == 1) & (y == 1)
    def f(p):
        att, de, home, rho, mu0 = p[:n], p[n:2*n], p[2*n], p[2*n+1] if use_rho else 0.0, p[2*n+2]
        ll_ = mu0 + home + att[h] + de[a]; lm_ = mu0 + att[a] + de[h]; lam = np.exp(ll_); mu = np.exp(lm_)
        tau = np.ones_like(lam); tau[z00] = 1 - lam[z00] * mu[z00] * rho; tau[z01] = 1 + lam[z01] * rho; tau[z10] = 1 + mu[z10] * rho; tau[z11] = 1 - rho
        tau = np.clip(tau, 1e-9, None)
        ll = np.log(tau) + x * ll_ - lam + y * lm_ - mu
        # dérivées
        dl = x - lam; dm = y - mu; dr = np.zeros_like(lam)
        if use_rho:
            dl = dl + np.where(z00, -lam * mu * rho / tau, 0) + np.where(z01, lam * rho / tau, 0)
            dm = dm + np.where(z00, -lam * mu * rho / tau, 0) + np.where(z10, mu * rho / tau, 0)
            dr = np.where(z00, -lam * mu / tau, 0) + np.where(z01, lam / tau, 0) + np.where(z10, mu / tau, 0) + np.where(z11, -1 / tau, 0)
        dl *= w; dm *= w
        g = np.zeros_like(p)
        g[:n] = np.bincount(h, dl, n) + np.bincount(a, dm, n); g[n:2*n] = np.bincount(a, dl, n) + np.bincount(h, dm, n)
        g[2*n] = dl.sum(); g[2*n+2] = (dl + dm).sum(); g[2*n+1] = (w * dr).sum() if use_rho else 0
        val = -(w * ll).sum() + l2 * (att @ att + de @ de)
        g = -g; g[:n] += 2 * l2 * att; g[n:2*n] += 2 * l2 * de
        return val, g
    p0 = np.zeros(2 * n + 3); p0[2*n:] = [0.25, -0.05, np.log(max(0.2, x.mean()))]
    if prev is not None:
        for t, i in idx.items():
            if t in prev["idx"]: j = prev["idx"][t]; p0[i] = prev["att"][j]; p0[n+i] = prev["def"][j]
        p0[2*n:] = [prev["home"], prev["rho"], prev["mu0"]]
    r = minimize(f, p0, jac=True, method="L-BFGS-B", bounds=[(None, None)] * (2*n) + [(None, None), (-0.25, 0.25) if use_rho else (0, 0), (None, None)])
    p = r.x
    return dict(idx=idx, att=p[:n], **{"def": p[n:2*n]}, home=p[2*n], rho=p[2*n+1], mu0=p[2*n+2], hinv=r.hess_inv)

def rates(m, h, a):
    g = lambda t: (m["att"][m["idx"][t]], m["def"][m["idx"][t]]) if t in m["idx"] else (-0.15, 0.15)
    ah, dh = g(h); aa, da = g(a)
    return math.exp(m["mu0"] + m["home"] + ah + da), math.exp(m["mu0"] + aa + dh)
G = 10; GG = np.arange(G + 1)
def matrix(lam, mu, rho):
    Mx = np.outer(poisson.pmf(GG, lam), poisson.pmf(GG, mu))
    Mx[0, 0] *= 1 - lam * mu * rho; Mx[0, 1] *= 1 + lam * rho; Mx[1, 0] *= 1 + mu * rho; Mx[1, 1] *= 1 - rho
    return Mx / Mx.sum()
II, JJ = np.indices((G + 1, G + 1))
def summ(Mx): return Mx[II > JJ].sum(), Mx[II == JJ].sum(), Mx[II < JJ].sum(), Mx[(II + JJ) > 2].sum()
def rps(P, O):
    cp, co = np.cumsum(P, 1)[:, :-1], np.cumsum(O, 1)[:, :-1]; return ((cp - co) ** 2).sum(1) / 2
def shin(o):
    q = 1 / np.asarray(o, float); S = q.sum(); lo, hi = 0.0, 0.4
    for _ in range(60):
        z = (lo + hi) / 2; p = (np.sqrt(z * z + 4 * (1 - z) * q * q / S) - z) / (2 * (1 - z))
        lo, hi = (z, hi) if p.sum() > 1 else (lo, z)
    return p

def pi_ratings(df):
    piH, piA, out = {}, {}, []
    c, lr, gm = 3.0, 0.035, 0.7; gf = lambda r: math.copysign(10 ** (abs(r) / c) - 1, r)
    for r in df.itertuples():
        e = gf(piH.get(r.home, 0.0)) - gf(piA.get(r.away, 0.0)); out.append(e)
        obs = r.hg - r.ag; psi = c * math.log10(1 + abs(obs - e)) * (1 if obs > e else -1)
        piH[r.home] = piH.get(r.home, 0.0) + psi * lr; piA[r.home] = piA.get(r.home, 0.0) + psi * lr * gm
        piA[r.away] = piA.get(r.away, 0.0) - psi * lr; piH[r.away] = piH.get(r.away, 0.0) - psi * lr * gm
    return np.array(out), piH, piA, gf

def walk(code, test_seasons, xi, l2, joint, with_sot, step_days=7):
    d1, d2 = COUNTRIES[code]; divs = [d1] + ([d2] if (joint and d2) else [])
    df = M[M.Division.isin(divs)].reset_index(drop=True)
    pi, _, _, _ = pi_ratings(df); df["pi"] = pi
    test = df[(df.Division == d1) & df.season.isin(test_seasons)]
    out = []; prev = prevs = None
    dates = sorted(test.date.unique()); start = dates[0] if dates else None
    while start is not None and start <= dates[-1]:
        end = start + pd.Timedelta(days=step_days)
        cur = test[(test.date >= start) & (test.date < end)]
        if len(cur):
            tr = df[(df.date < start) & (df.date >= start - pd.Timedelta(days=1100))]
            m = fit_dc(tr, start, xi, l2, prev); prev = m
            if with_sot:
                ts = tr.dropna(subset=["HomeTarget", "AwayTarget"])
                ms = fit_dc(ts, start, xi, l2, prevs, ycols=("HomeTarget", "AwayTarget"), use_rho=False); prevs = ms
            for r in cur.itertuples():
                lam, mu = rates(m, r.home, r.away); pH, pD, pA, pO = summ(matrix(lam, mu, m["rho"]))
                row = dict(league=code, season=r.season, date=r.date, home=r.home, away=r.away, hg=r.hg, ag=r.ag, lam=lam, mu=mu, rho=m["rho"],
                           pH=pH, pD=pD, pA=pA, pO=pO, pi=r.pi, oH=r.OddHome, oD=r.OddDraw, oA=r.OddAway, xH=r.MaxHome, xD=r.MaxDraw, xA=r.MaxAway,
                           oO=r.Over25, oU=r.Under25, xO=r.MaxOver25, xU=r.MaxUnder25)
                if with_sot: ls, ms_ = rates(ms, r.home, r.away); row.update(sl=ls, sm=ms_)
                out.append(row)
        start = end
    return out

res = {}
if MODE in ("tune", "full"):
    # ---------- réglage des hyperparamètres sur 2023-24 (jamais vu par le test) ----------
    grid = [(xi, l2, j) for xi in (0.0019, 0.003, 0.0042, 0.006) for l2 in (0.1, 0.25, 0.5) for j in (False, True)]
    tune = []
    for xi, l2, j in grid:
        rows = []
        for code in ["fr.1", "en.1", "es.1", "de.1", "it.1"]:
            rows += walk(code, [2023], xi, l2, j, False, step_days=14)
        D = pd.DataFrame(rows); O = np.stack([D.hg > D.ag, D.hg == D.ag, D.hg < D.ag], 1).astype(float)
        s = float(rps(D[["pH", "pD", "pA"]].to_numpy(), O).mean()); tune.append(dict(xi=xi, l2=l2, joint=j, rps=s, n=len(D)))
        print("réglage", xi, l2, j, round(s, 5), flush=True)
    best = min(tune, key=lambda t: t["rps"]); res["tuning"] = tune; res["best"] = best
    json.dump(res, open(OUT / "engine3_tune.json", "w"), indent=1, default=float)
if MODE == "full":
    best = json.load(open(OUT / "engine3_tune.json"))["best"]
    xi, l2, joint = best["xi"], best["l2"], best["joint"]
    rows = []
    for code in COUNTRIES:
        rows += walk(code, [2024, 2025, 2026], xi, l2, joint, True); print(code, "walk-forward ok", flush=True)
    D = pd.DataFrame(rows); D.to_csv(OUT / "engine3_preds.csv", index=False)
    print("prédictions :", len(D), flush=True)
