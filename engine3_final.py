"""Moteur v3 : entraînement final au 16/10/2026 et sorties de la plateforme.
Ensemble = Dixon-Coles joint D1+D2 (xi, L2 réglés) + tirs cadrés + pi-ratings, recalibré sur 6 000+ matchs walk-forward.
Totaux recalés sur le modèle buts + tirs cadrés. Corners et cartons gardés seulement s'ils battent la moyenne hors échantillon.
"""
import json, math, sys
from pathlib import Path
import numpy as np, pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from scipy.stats import poisson
sys.argv = [sys.argv[0], sys.argv[1], sys.argv[2], sys.argv[3], "none"]
src = open(Path(__file__).parent / "engine3.py").read().split("res = {}")[0]
ns = {"__file__": __file__}; exec(src, ns)
M, fit_dc, rates, matrix, summ, pi_ratings, load_of, NAME, COUNTRIES, OF_DIV, TODAY, OUT = (ns[k] for k in ["M", "fit_dc", "rates", "matrix", "summ", "pi_ratings", "load_of", "NAME", "COUNTRIES", "OF_DIV", "TODAY", "OUT"])
TUNE = json.load(open(OUT / "engine3_tune.json"))["best"]; XI, L2, JOINT = TUNE["xi"], TUNE["l2"], TUNE["joint"]
EV = json.load(open(OUT / "engine3_eval.json"))
P = pd.read_csv(OUT / "engine3_preds.csv", parse_dates=["date"])
# Calibration du nombre total de buts (lab5 : gain RPS +0,0005, IC 95 % +0,0004 à +0,0007) : poids observé / prédit par total 0..6+, rétrécis à 75 %
II, JJ = ns["II"], ns["JJ"]; TOT = np.minimum(II + JJ, 6)
_pt = np.zeros(7); _ob = np.zeros(7)
for _r in P.dropna(subset=["lam"]).itertuples():
    _m = matrix(_r.lam, _r.mu, _r.rho); _pt += np.bincount(TOT.ravel(), _m.ravel(), 7); _ob[min(int(_r.hg + _r.ag), 6)] += 1
WTOT = 1 + 0.75 * (_ob / _ob.sum() / (_pt / _pt.sum()) - 1)
def matrix_w(lam, mu, rho):
    Mx = matrix(lam, mu, rho) * WTOT[TOT]; return Mx / Mx.sum()
print("poids buts", WTOT.round(3).tolist(), flush=True)
lg2 = lambda a, b, c: [math.log(a / b), math.log(c / b)]
# Empileur final 1X2 et totaux, entraînés sur toutes les prédictions walk-forward
X = np.column_stack([np.log(P.pH / P.pD), np.log(P.pA / P.pD), np.log(P.sl / P.sm), np.log(P.sl + P.sm), P.pi])
y = np.where(P.hg > P.ag, 0, np.where(P.hg == P.ag, 1, 2))
sc = StandardScaler().fit(X); clf = LogisticRegression(C=1.0, max_iter=3000).fit(sc.transform(X), y)
XT = np.column_stack([np.log(P.pO / (1 - P.pO)), np.log(P.sl + P.sm)]); yo = ((P.hg + P.ag) > 2).astype(int)
sct = StandardScaler().fit(XT); clt = LogisticRegression(max_iter=2000).fit(sct.transform(XT), yo)

# Calibration et registre (walk-forward, empileur appris sur les saisons antérieures uniquement)
Pst = np.full((len(P), 3), np.nan)
for s in [2025, 2026]:
    tr = (P.season < s).to_numpy(); te = (P.season == s).to_numpy()
    s_ = StandardScaler().fit(X[tr]); c_ = LogisticRegression(C=1.0, max_iter=3000).fit(s_.transform(X[tr]), y[tr]); Pst[te] = c_.predict_proba(s_.transform(X[te]))
E = P.assign(qH=Pst[:, 0], qD=Pst[:, 1], qA=Pst[:, 2]).dropna(subset=["qH"])
O = np.stack([E.hg > E.ag, E.hg == E.ag, E.hg < E.ag], 1).astype(float)
long = pd.concat([pd.DataFrame({"p": E["q" + k], "y": O[:, i]}) for i, k in enumerate("HDA")])
long["b"] = pd.cut(long.p, np.linspace(0, 1, 11), include_lowest=True)
cal = long.groupby("b", observed=True).agg(p=("p", "mean"), y=("y", "mean"), n=("y", "size")).reset_index(drop=True)
base = []  # référence : fréquences 1N2 de la saison précédente de la même ligue
for r in E.itertuples():
    prev = P[(P.league == r.league) & (P.season == r.season - 1)]
    prev = prev if len(prev) else P[P.league == r.league]
    base.append([(prev.hg > prev.ag).mean(), (prev.hg == prev.ag).mean(), (prev.hg < prev.ag).mean()])
base = np.array(base); Q = E[["qH", "qD", "qA"]].to_numpy()
rps = lambda A, B: (((np.cumsum(A, 1)[:, :-1] - np.cumsum(B, 1)[:, :-1]) ** 2).sum(1) / 2)
summary = {"all": dict(n=len(E), rps=float(rps(Q, O).mean()), rps_base=float(rps(base, O).mean()), logloss=float(-np.log((Q * O).sum(1)).mean()),
                       logloss_base=float(-np.log((base * O).sum(1)).mean()), brier=float(((Q - O) ** 2).sum(1).mean()), brier_base=float(((base - O) ** 2).sum(1).mean()),
                       acc=float((Q.argmax(1) == O.argmax(1)).mean()), brier_o25=EV["totaux"]["dc_tirs"], brier_o25_base=EV["totaux"]["moyenne_saison_precedente"])}
for l in E.league.unique():
    m = (E.league == l).to_numpy(); summary[l] = dict(n=int(m.sum()), rps=float(rps(Q[m], O[m]).mean()), rps_base=float(rps(base[m], O[m]).mean()))
reg = E[E.season == 2026].sort_values("date", ascending=False)
registry = [dict(league=r.league, date=r.date.strftime("%Y-%m-%d"), home=r.home, away=r.away, score=f"{r.hg}-{r.ag}", res="H" if r.hg > r.ag else "D" if r.hg == r.ag else "A",
                 pH=round(r.qH, 4), pD=round(r.qD, 4), pA=round(r.qA, 4)) for r in reg.itertuples()]

# ---------- corners et cartons : validation simple (fit au 01/07/2025, test 2025-26) ----------
def side_model(cols, line, d1):
    tr = M[(M.Division == d1) & (M.date < "2025-07-01") & (M.date >= "2022-07-01")].dropna(subset=list(cols))
    te = M[(M.Division == d1) & (M.season == 2025)].dropna(subset=list(cols))
    if len(tr) < 300 or len(te) < 100: return None
    m = fit_dc(tr, pd.Timestamp("2025-07-01"), XI, L2, ycols=cols, use_rho=False)
    tot = np.array([sum(rates(m, r.home, r.away)) for r in te.itertuples()]); yv = ((te[cols[0]] + te[cols[1]]) > line).to_numpy().astype(float)
    p = 1 - poisson.cdf(math.floor(line), tot); b = 1 - poisson.cdf(math.floor(line), (tr[cols[0]] + tr[cols[1]]).mean())
    return dict(n=len(te), brier=float(((p - yv) ** 2).mean()), brier_base=float(((b - yv) ** 2).mean()))
M["HomeCards"] = M.HomeYellow + M.HomeRed; M["AwayCards"] = M.AwayYellow + M.AwayRed
side_val = {}
for code, (d1, _) in COUNTRIES.items():
    side_val[code] = dict(corners=side_model(("HomeCorners", "AwayCorners"), 9.5, d1), cartons=side_model(("HomeCards", "AwayCards"), 4.5, d1))
agg = lambda k: (sum(v[k]["brier"] * v[k]["n"] for v in side_val.values() if v[k]) / sum(v[k]["n"] for v in side_val.values() if v[k]),
                 sum(v[k]["brier_base"] * v[k]["n"] for v in side_val.values() if v[k]) / sum(v[k]["n"] for v in side_val.values() if v[k]))
side_summary = {k: dict(brier=agg(k)[0], brier_base=agg(k)[1]) for k in ("corners", "cartons")}
USE_SIDE = {k: v["brier"] < v["brier_base"] for k, v in side_summary.items()}
print("corners/cartons :", side_summary, flush=True)

# ---------- entraînement final, calendrier, simulations ----------
rng = np.random.default_rng(11)
from uncert import dc_cov, draws, rates_draws, probs_fast
DEAD = 1.12
fixtures, sims, ratings = [], {}, {}
for code, (d1, d2) in COUNTRIES.items():
    divs = [d1] + ([d2] if JOINT and d2 else [])
    df = M[M.Division.isin(divs) & (M.date >= TODAY - pd.Timedelta(days=1100))].reset_index(drop=True)
    m = fit_dc(df, TODAY, XI, L2); ms = fit_dc(df.dropna(subset=["HomeTarget", "AwayTarget"]), TODAY, XI, L2, ycols=("HomeTarget", "AwayTarget"), use_rho=False)
    side = {}
    for k, cols in (("corners", ("HomeCorners", "AwayCorners")), ("cartons", ("HomeCards", "AwayCards"))):
        if USE_SIDE[k]: side[k] = fit_dc(df[df.Division == d1].dropna(subset=list(cols)), TODAY, XI, L2, ycols=cols, use_rho=False)
    _, piH, piA, gf = pi_ratings(M[M.Division.isin(divs)].sort_values("date"))
    of_all = load_of(code, "2026-27")
    rec = M[(M.Division == d1) & (M.date >= TODAY - pd.Timedelta(days=365))].dropna(subset=["HomeShots", "HomeTarget", "HomeCorners"])
    def tstats(t):
        hm, aw = rec[rec.home == t], rec[rec.away == t]; n_ = len(hm) + len(aw)
        if n_ < 5: return None
        f_ = lambda hc, ac: round(float((hm[hc].sum() + aw[ac].sum()) / n_), 1)
        return dict(n=n_, sh=f_("HomeShots", "AwayShots"), sha=f_("AwayShots", "HomeShots"), sot=f_("HomeTarget", "AwayTarget"), sota=f_("AwayTarget", "HomeTarget"),
                    co=f_("HomeCorners", "AwayCorners"), coa=f_("AwayCorners", "HomeCorners"), fo=f_("HomeFouls", "AwayFouls"), ca=f_("HomeCards", "AwayCards"),
                    gf=f_("hg", "ag"), ga=f_("ag", "hg"), conv=round(float((hm.hg.sum() + aw.ag.sum()) / max(1, hm.HomeTarget.sum() + aw.AwayTarget.sum())), 3))
    xn = lambda t: NAME.get((code, t), t)
    cov = dc_cov(m, df, TODAY, XI, L2); Zd = draws(m, cov, 300, rng)
    dfs = df.dropna(subset=["HomeTarget", "AwayTarget"]); Zs = draws(ms, dc_cov(ms, dfs, TODAY, XI, L2, ycols=("HomeTarget", "AwayTarget")), 300, rng)
    if code == "fr.1": print("stacker coef", np.round(clf.coef_ * 1 / sc.scale_, 3).tolist(), flush=True)
    # enjeux du classement actuel (lab2 : seul « sans enjeu » change les buts, ×1,12 pour l'équipe concernée)
    st_teams = sorted(set(of_all.home) | set(of_all.away)); nT = len(st_teams); st_pts = dict.fromkeys(st_teams, 0); st_pl = dict.fromkeys(st_teams, 0)
    for r in of_all.dropna(subset=["hg"]).itertuples():
        st_pl[r.home] += 1; st_pl[r.away] += 1
        st_pts[r.home] += 3 if r.hg > r.ag else 1 if r.hg == r.ag else 0; st_pts[r.away] += 3 if r.ag > r.hg else 1 if r.hg == r.ag else 0
    st_sorted = sorted(st_pts.values(), reverse=True); eu_n = 6 if nT >= 18 else 4; dr_n = 3 if nT >= 18 else 2
    def stake(t):
        rem = 2 * (nT - 1) - st_pl[t]; line_drop = st_sorted[nT - dr_n]; mx = st_pts[t] + 3 * rem
        if rem <= 8 and st_pts[t] - line_drop > 3 * rem and mx < st_sorted[eu_n - 1]: return "sans enjeu"
        if rem <= 10 and st_pts[t] - line_drop <= 3: return "maintien"
        if rem <= 10 and st_sorted[0] - st_pts[t] <= 3: return "titre"
        return None
    for r in of_all[(of_all.hg.isna()) & (of_all.date >= TODAY) & (of_all.date <= TODAY + pd.Timedelta(days=11))].itertuples():
        h, a = xn(r.home), xn(r.away)
        lam, mu = rates(m, h, a); pH, pD, pA, pO = summ(matrix(lam, mu, m["rho"])); sl, sm = rates(ms, h, a)
        pi = gf(piH.get(h, 0.0)) - gf(piA.get(a, 0.0))
        q = clf.predict_proba(sc.transform([[math.log(pH / pD), math.log(pA / pD), math.log(sl / sm), math.log(sl + sm), pi]]))[0]
        tO = clt.predict_proba(sct.transform([[math.log(pO / (1 - pO)), math.log(sl + sm)]]))[0, 1]
        lo_, hi_ = 0.5, 2.0  # échelle k des buts attendus pour que P(+2,5) = estimation recalée
        for _ in range(40):
            k = (lo_ + hi_) / 2; pk = summ(matrix_w(lam * k, mu * k, m["rho"]))[3]
            lo_, hi_ = (k, hi_) if pk < tO else (lo_, k)
        k = (lo_ + hi_) / 2
        sh_, sa_ = stake(r.home), stake(r.away); kh = DEAD if sh_ == "sans enjeu" else 1.0; ka = DEAD if sa_ == "sans enjeu" else 1.0
        # bande à 80 % : incertitude des forces Dixon-Coles propagée dans l'empilement final
        dl, du = rates_draws(m, Zd, h, a); bH, bD, bA, _ = probs_fast(dl, du, m["rho"])
        sl_d, sm_d = rates_draws(ms, Zs, h, a)
        Xd = np.column_stack([np.log(bH / bD), np.log(bA / bD), np.log(sl_d / sm_d), np.log(sl_d + sm_d), np.full(len(bH), pi)])
        qd = clf.predict_proba(sc.transform(Xd)); band = [[round(float(np.percentile(qd[:, j], 10)), 4), round(float(np.percentile(qd[:, j], 90)), 4)] for j in range(3)]
        fx = dict(league=code, date=r.date.strftime("%Y-%m-%d"), time=r.time, round=r.round, home=r.home, away=r.away,
                  lam=round(lam * k * kh, 4), mu=round(mu * k * ka, 4), band=band, stakes=[sh_, sa_], rho=round(float(m["rho"]), 4), ens=[round(float(v), 4) for v in q], pi=round(pi, 3),
                  sot=[round(sl, 2), round(sm, 2)], known=[h in m["idx"], a in m["idx"]])
        for kk, mm in side.items(): fx[kk] = [round(v, 2) for v in rates(mm, h, a)]
        fx["stats"] = [tstats(h), tstats(a)]
        hh = M[((M.home == h) & (M.away == a)) | ((M.home == a) & (M.away == h))].sort_values("date").tail(6)
        fx["h2h"] = [[d_.strftime("%Y-%m-%d"), int(x_ == h), int(g1), int(g2)] for d_, x_, g1, g2 in zip(hh.date, hh.home, hh.hg, hh.ag)]
        def form(t):
            q = M[(M.home == t) | (M.away == t)].sort_values("date").tail(5)
            return [[d_.strftime("%Y-%m-%d"), int(x_ == t), int(g1 if x_ == t else g2), int(g2 if x_ == t else g1)] for d_, x_, g1, g2 in zip(q.date, q.home, q.hg, q.ag)]
        fx["form"] = [form(h), form(a)]
        fixtures.append(fx)
    # simulation de saison
    teams = sorted(set(of_all.home) | set(of_all.away)); ti = {t: i for i, t in enumerate(teams)}; n = len(teams)
    pts = np.zeros(n); gfor = np.zeros(n); gag = np.zeros(n); pld = np.zeros(n)
    played = of_all.dropna(subset=["hg"]); remaining = of_all[of_all.hg.isna()]
    for r in played.itertuples():
        i, j = ti[r.home], ti[r.away]; x, yv = int(r.hg), int(r.ag)
        gfor[i] += x; gag[i] += yv; gfor[j] += yv; gag[j] += x; pld[i] += 1; pld[j] += 1
        pts[i] += 3 if x > yv else 1 if x == yv else 0; pts[j] += 3 if yv > x else 1 if x == yv else 0
    nn = len(m["idx"]); H = m["hinv"].todense() if hasattr(m["hinv"], "todense") else np.eye(2 * nn + 3) * 0.01
    se = np.sqrt(np.clip(np.diag(H), 0, None))
    def g(t, which):
        xt = xn(t)
        if xt in m["idx"]: i = m["idx"][xt]; return (m["att"][i], np.clip(se[i], .03, .25)) if which == "a" else (m["def"][i], np.clip(se[nn + i], .03, .25))
        return (-0.15, 0.2) if which == "a" else (0.15, 0.2)
    att = np.array([g(t, "a")[0] for t in teams]); sa = np.array([g(t, "a")[1] for t in teams])
    dfn = np.array([g(t, "d")[0] for t in teams]); sd = np.array([g(t, "d")[1] for t in teams])
    N = 10000; A = att + rng.normal(size=(N, n)) * sa; Dd = dfn + rng.normal(size=(N, n)) * sd
    Pp = np.tile(pts, (N, 1)); GF = np.tile(gfor, (N, 1)); GA = np.tile(gag, (N, 1))
    for r in remaining.itertuples():
        i, j = ti[r.home], ti[r.away]
        lam = np.exp(m["mu0"] + m["home"] + A[:, i] + Dd[:, j]); mu = np.exp(m["mu0"] + A[:, j] + Dd[:, i])
        x = rng.poisson(lam); yv = rng.poisson(mu)
        GF[:, i] += x; GA[:, i] += yv; GF[:, j] += yv; GA[:, j] += x
        Pp[:, i] += np.where(x > yv, 3, np.where(x == yv, 1, 0)); Pp[:, j] += np.where(yv > x, 3, np.where(x == yv, 1, 0))
    key = Pp * 1e6 + (GF - GA) * 1e3 + GF + rng.random((N, n)) * 1e-3
    rank = (-key).argsort(1).argsort(1); dist = np.stack([(rank == k).mean(0) for k in range(n)], 1)
    sims[code] = dict(teams=[dict(team=t, pts=int(pts[i]), played=int(pld[i]), gd=int(gfor[i] - gag[i]), xpts=round(float(Pp[:, i].mean()), 1), p=[round(float(v), 4) for v in dist[i]]) for i, t in enumerate(teams)],
                      n_played=len(played), n_remaining=len(remaining), n_missing=int((remaining.date < TODAY).sum()), N=N)
    ratings[code + "_params"] = dict(home=float(m["home"]), mu0=float(m["mu0"]), rho=float(m["rho"]))
    ratings[code] = [dict(team=t, att=round(float(att[i]), 3), dfn=round(float(dfn[i]), 3)) for i, t in enumerate(teams)]
    print(code, "final ok", len(played), "joués", len(remaining), "restants", flush=True)

json.dump(dict(fixtures=fixtures, sims=sims, ratings=ratings, summary=summary, cal=cal.round(4).to_dict("records"), registry=registry,
               draw=dict(obs=float(O[:, 1].mean()), pred=float(Q[:, 1].mean())), side=side_summary, side_by_league=side_val, use_side=USE_SIDE,
               market=EV, wtot=WTOT.round(4).tolist(), params=dict(xi=XI, l2=L2, joint=JOINT, last_result=str(M.date.max().date()), n_train=int(len(M)))),
          open(OUT / "engine3_out.json", "w"), ensure_ascii=False, default=float)
print("fixtures", len(fixtures), "| RPS", round(summary["all"]["rps"], 4), "réf", round(summary["all"]["rps_base"], 4))
