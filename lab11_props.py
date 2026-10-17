"""Laboratoire 11 : corners et cartons. Un modèle par équipe bat-il la simple moyenne du championnat ?
Le labo du moteur (engine3_final, side_model) montrait qu'un Dixon-Coles sur les corners faisait PIRE que la moyenne de la ligue.
Ici : forces d'équipe lissées dans le temps (demi-vie 120 jours), RAPPROCHÉES de la moyenne (poids w choisi sur 2024-25),
loi binomiale négative pour la dispersion. Test 2025-26, entraînement strictement antérieur. Juge : score de Brier sur plusieurs lignes.
Sortie : out/lab11.json et out/props.json (paramètres retenus, utilisés par la page). Usage : python lab11_props.py /tmp/xg/data out
"""
import json, math, sys
from pathlib import Path
import numpy as np, pandas as pd
from scipy.stats import nbinom, poisson
XG, OUT = Path(sys.argv[1]), Path(sys.argv[2])
DIVS = {"fr.1": "F1", "en.1": "E0", "es.1": "SP1", "de.1": "D1", "it.1": "I1", "pt.1": "P1", "nl.1": "N1", "en.2": "E1"}
M = pd.read_csv(XG / "Matches.csv", low_memory=False, parse_dates=["MatchDate"])
M = M[(M.MatchDate >= "2019-07-01") & M.Division.isin(DIVS.values())].copy()
M["HC"] = M.HomeYellow + M.HomeRed; M["AC"] = M.AwayYellow + M.AwayRed
M["season"] = [d.year if d.month >= 7 else d.year - 1 for d in M.MatchDate]
HL = 120.0
STAT = {"corners": ("HomeCorners", "AwayCorners", (8.5, 9.5, 10.5)), "cartons": ("HC", "AC", (3.5, 4.5, 5.5))}

def walk(df, hc, ac):
    """Pour chaque match, forces de l'équipe calculées sur les seuls matchs antérieurs (moyennes pondérées exponentiellement)."""
    df = df.dropna(subset=[hc, ac]).sort_values("MatchDate").reset_index(drop=True)
    st = {}; rows = []; lg = {"h": [], "a": []}
    for r in df.itertuples():
        d = r.MatchDate
        def get(t):
            s = st.get(t)
            if not s: return None
            w = np.exp(-np.array([(d - x).days for x in s["d"]]) / HL * math.log(2))
            if w.sum() < 3: return None
            return dict(f=float((w * np.array(s["f"])).sum() / w.sum()), a=float((w * np.array(s["a"])).sum() / w.sum()))
        h, a = get(r.HomeTeam), get(r.AwayTeam)
        recent = df[(df.MatchDate < d) & (df.MatchDate >= d - pd.Timedelta(days=365))]
        Lh, La = (recent[hc].mean(), recent[ac].mean()) if len(recent) > 50 else (np.nan, np.nan)
        rows.append(dict(date=d, season=r.season, yh=getattr(r, hc), ya=getattr(r, ac), Lh=Lh, La=La,
                         hf=h["f"] if h else np.nan, ha=h["a"] if h else np.nan, af=a["f"] if a else np.nan, aa=a["a"] if a else np.nan))
        for t, f_, a_ in ((r.HomeTeam, getattr(r, hc), getattr(r, ac)), (r.AwayTeam, getattr(r, ac), getattr(r, hc))):
            s = st.setdefault(t, {"d": [], "f": [], "a": []}); s["d"].append(d); s["f"].append(f_); s["a"].append(a_)
            if len(s["d"]) > 60: s["d"], s["f"], s["a"] = s["d"][-60:], s["f"][-60:], s["a"][-60:]
    return pd.DataFrame(rows).dropna()

def mus(D, w):
    L = (D.Lh + D.La) / 2
    # rapport de force de chaque équipe par rapport à la moyenne de la ligue, rapproché de 1 avec le poids w
    rh = ((D.hf / L) * (D.aa / L)) ** w; ra = ((D.af / L) * (D.ha / L)) ** w
    return D.Lh * rh, D.La * ra

def prob_over(mu, line, r):
    k = math.floor(line)
    if r is None: return 1 - poisson.cdf(k, mu)
    p = r / (r + mu); return 1 - nbinom.cdf(k, r, p)

def disp(y, mu):
    """Paramètre r de la binomiale négative par la méthode des moments (variance = mu + mu²/r)."""
    v = np.mean((y - mu) ** 2 - mu); m2 = np.mean(mu ** 2)
    return None if v <= 0 else float(m2 / v)

R, PROPS = {}, {}
for stat, (hc, ac, lines) in STAT.items():
    allv, allt = [], []
    for code, div in DIVS.items():
        D = walk(M[M.Division == div], hc, ac)
        D["code"] = code; allv.append(D)
    D = pd.concat(allv)
    va, te = D[D.season == 2024], D[D.season == 2025]
    y_va, y_te = (va.yh + va.ya).to_numpy(), (te.yh + te.ya).to_numpy()
    best = None
    for w in (0, 0.25, 0.5, 0.75, 1.0):
        mh, ma = mus(va, w); mu = (mh + ma).to_numpy(); r = disp(y_va, mu)
        for dist in ("poisson", "nb"):
            br = np.mean([np.mean((prob_over(mu, L, r if dist == "nb" else None) - (y_va > L)) ** 2) for L in lines])
            if best is None or br < best[0]: best = (br, w, dist, r)
    _, w, dist, r_va = best
    res = {}
    for lab, ww, dd in (("moyenne de la ligue, Poisson", 0, "poisson"), ("moyenne de la ligue, binomiale négative", 0, "nb"), ("équipes sans lissage, Poisson", 1.0, "poisson"), (f"retenu : w={w}, {dist}", w, dist)):
        mh, ma = mus(te, ww); mu = (mh + ma).to_numpy(); mh_va, ma_va = mus(va, ww); r = disp(y_va, (mh_va + ma_va).to_numpy())
        res[lab] = {f"+{L}": float(np.mean((prob_over(mu, L, r if dd == "nb" else None) - (y_te > L)) ** 2)) for L in lines}
        res[lab]["moyenne"] = float(np.mean(list(res[lab].values())))
    base, chosen = res["moyenne de la ligue, Poisson"]["moyenne"], res[f"retenu : w={w}, {dist}"]["moyenne"]
    # intervalle de confiance du gain par bootstrap sur les matchs (Brier moyen des trois lignes, par match)
    mu0 = ((te.Lh + te.La)).to_numpy(); mh, ma = mus(te, w); mu1 = (mh + ma).to_numpy(); mh_va, ma_va = mus(va, w); r1 = disp(y_va, (mh_va + ma_va).to_numpy())
    b0 = np.mean([(prob_over(mu0, L, None) - (y_te > L)) ** 2 for L in lines], 0); b1 = np.mean([(prob_over(mu1, L, r1 if dist == "nb" else None) - (y_te > L)) ** 2 for L in lines], 0)
    rng = np.random.default_rng(11); dd = b0 - b1; bs = [dd[rng.integers(0, len(dd), len(dd))].mean() for _ in range(2000)]
    ic = [float(np.percentile(bs, 2.5)), float(np.percentile(bs, 97.5))]
    # calibration du modèle retenu sur la ligne centrale
    mh, ma = mus(te, w); mu = (mh + ma).to_numpy(); L = lines[1]; p = prob_over(mu, L, r_va if dist == "nb" else None)
    cal = [dict(p=float(p[(p >= a) & (p < b)].mean()), y=float((y_te > L)[(p >= a) & (p < b)].mean()), n=int(((p >= a) & (p < b)).sum())) for a, b in ((0, .4), (.4, .5), (.5, .6), (.6, 1.01)) if ((p >= a) & (p < b)).sum() > 30]
    R[stat] = dict(n_test=int(len(te)), w=w, loi=dist, r=r_va, brier=res, gain_vs_ligue=float(base - chosen), ic95=ic, prouve=bool(ic[0] > 0), adopte=bool(chosen < base - 1e-4), calibration=cal)
    PROPS[stat] = dict(w=w if chosen < base - 1e-4 else 0, dist=dist, r=r_va, half_life=HL)
    print(stat, json.dumps(R[stat], ensure_ascii=False, default=float)[:900], flush=True)

# Elo (ClubElo, fourni par le jeu de données) : apporte-t-il quelque chose au moteur ?
try:
    from sklearn.linear_model import LogisticRegression
    from sklearn.preprocessing import StandardScaler
    P = pd.read_csv(OUT / "engine3_preds.csv", parse_dates=["date"])
    E = M.rename(columns={"MatchDate": "date", "HomeTeam": "home", "AwayTeam": "away"})[["date", "home", "away", "HomeElo", "AwayElo"]]
    Dd = P.merge(E, on=["date", "home", "away"], how="inner").dropna(subset=["HomeElo", "AwayElo", "oH", "oD", "oA"]).reset_index(drop=True)
    O = np.stack([Dd.hg > Dd.ag, Dd.hg == Dd.ag, Dd.hg < Dd.ag], 1).astype(float); y = O.argmax(1)
    rps = lambda A, B: (((np.cumsum(A, 1)[:, :-1] - np.cumsum(B, 1)[:, :-1]) ** 2).sum(1) / 2)
    X0 = np.column_stack([np.log(Dd.pH / Dd.pD), np.log(Dd.pA / Dd.pD), np.log(Dd.sl / Dd.sm), np.log(Dd.sl + Dd.sm), Dd.pi]); X1 = np.column_stack([X0, (Dd.HomeElo - Dd.AwayElo) / 100])
    tr, ts = (Dd.season == 2024).to_numpy(), (Dd.season == 2025).to_numpy(); out = []
    for X in (X0, X1):
        sc = StandardScaler().fit(X[tr]); c = LogisticRegression(max_iter=3000).fit(sc.transform(X[tr]), y[tr]); out.append(rps(c.predict_proba(sc.transform(X[ts])), O[ts]))
    d = out[1] - out[0]; rng = np.random.default_rng(11); bs = [d[rng.integers(0, len(d), len(d))].mean() for _ in range(2000)]
    R["elo"] = dict(n_test=int(ts.sum()), rps_sans=float(out[0].mean()), rps_avec=float(out[1].mean()), gain=float(-d.mean()), ic95=[float(-np.percentile(bs, 97.5)), float(-np.percentile(bs, 2.5))], prouve=bool(-np.percentile(bs, 97.5) > 0))
    print("elo", R["elo"], flush=True)
except Exception as e: R["elo"] = dict(erreur=str(e))
json.dump(R, open(OUT / "lab11.json", "w"), ensure_ascii=False, indent=1, default=float)
json.dump(PROPS, open(OUT / "props.json", "w"), ensure_ascii=False, indent=1, default=float)
