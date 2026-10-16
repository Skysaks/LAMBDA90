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

# ---------- A priori promu : ratings de première saison des promus 2022-23 et 2023-24 ----------
prior_vals = []
for code in LEAGUES:
    df, tbs = load(code)
    for s, prev in [("2022-23", "2021-22"), ("2023-24", "2022-23")]:
        if s not in tbs or prev not in tbs: continue
        d = df[df.season == s]
        if d.empty: continue
        m = fit(d, d.date.max())
        for t in tbs[s] - tbs[prev]:
            if t in m["idx"]: prior_vals.append((m["att"][m["idx"][t]], m["def"][m["idx"][t]]))
PRIOR = (float(np.mean([v[0] for v in prior_vals])), float(np.mean([v[1] for v in prior_vals])))
print("a priori promu (att, déf) :", np.round(PRIOR, 3), "sur", len(prior_vals), "équipes", flush=True)

# ---------- Elo, pi-ratings, repos, forme (chronologiques, sans fuite) ----------
def side_features(df):
    elo, piH, piA, last, form = {}, {}, {}, {}, {}
    E, PI, REST, FORM = [], [], [], []
    c, lr, gm = 3.0, 0.035, 0.7
    gfun = lambda r: math.copysign(10 ** (abs(r) / c) - 1, r)
    for r in df.itertuples():
        eh, ea = elo.get(r.home, 1500.0), elo.get(r.away, 1500.0); E.append(eh + 60 - ea)
        exp_gd = gfun(piH.get(r.home, 0.0)) - gfun(piA.get(r.away, 0.0)); PI.append(exp_gd)
        rh = min((r.date - last[r.home]).days, 14) if r.home in last else 7; ra = min((r.date - last[r.away]).days, 14) if r.away in last else 7
        REST.append(rh - ra)
        fh = np.mean(form.get(r.home, [1.4])[-5:]); fa = np.mean(form.get(r.away, [1.4])[-5:]); FORM.append(fh - fa)
        # mises à jour après le match
        res = 1.0 if r.hg > r.ag else 0.5 if r.hg == r.ag else 0.0
        ex = 1 / (1 + 10 ** (-(eh + 60 - ea) / 400)); gd = abs(r.hg - r.ag); mult = 1 if gd <= 1 else 1.5 if gd == 2 else (11 + gd) / 8
        elo[r.home] = eh + 20 * mult * (res - ex); elo[r.away] = ea - 20 * mult * (res - ex)
        obs = r.hg - r.ag; err = abs(obs - exp_gd); psi = c * math.log10(1 + err) * (1 if obs > exp_gd else -1)
        dH = psi * lr; dA = -psi * lr
        piH[r.home] = piH.get(r.home, 0.0) + dH; piA[r.home] = piA.get(r.home, 0.0) + dH * gm
        piA[r.away] = piA.get(r.away, 0.0) + dA; piH[r.away] = piH.get(r.away, 0.0) + dA * gm
        last[r.home] = r.date; last[r.away] = r.date
        form.setdefault(r.home, []).append(3 if r.hg > r.ag else 1 if r.hg == r.ag else 0)
        form.setdefault(r.away, []).append(3 if r.ag > r.hg else 1 if r.hg == r.ag else 0)
    return np.array(E), np.array(PI), np.array(REST), np.array(FORM)

rows = []
for code in LEAGUES:
    df, tbs = load(code)
    E, PI, REST, FORM = side_features(df)
    df = df.assign(elo=E, pi=PI, rest=REST, form=FORM)
    test = df[df.season.isin(TEST)]
    prevA = prevB = None
    for wk in sorted(test.date.dt.to_period("W-SUN").unique()):
        start = wk.start_time; train = df[df.date < start]
        cur = test[test.date.dt.to_period("W-SUN") == wk]
        season = cur.season.iloc[0]; i = ALL_SEASONS.index(season)
        promoted = tbs.get(season, set()) - tbs.get(ALL_SEASONS[i - 1], set())
        prior = {t: PRIOR for t in promoted}
        mA = fit(train, start, None, prevA); mB = fit(train, start, prior, prevB); prevA, prevB = mA, mB
        for r in cur.itertuples():
            la, ma = rates(mA, r.home, r.away); lb, mb = rates(mB, r.home, r.away, prior)
            PA = hda(matrix(la, ma, mA["rho"])); PB = hda(matrix(lb, mb, mB["rho"]))
            rows.append(dict(league=code, season=r.season, date=r.date, home=r.home, away=r.away, hg=r.hg, ag=r.ag, hth=r.hth, hta=r.hta,
                             promoted=int(r.home in promoted or r.away in promoted),
                             lamA=la, muA=ma, lamB=lb, muB=mb, rhoB=mB["rho"],
                             pHA=PA[0], pDA=PA[1], pAA=PA[2], pHB=PB[0], pDB=PB[1], pAB=PB[2],
                             elo=r.elo, pi=r.pi, rest=r.rest, form=r.form))
    print(code, "ok", flush=True)

D = pd.DataFrame(rows); D.to_csv(OUT / "lab_preds.csv", index=False)
O = np.stack([(D.hg > D.ag), (D.hg == D.ag), (D.hg < D.ag)], 1).astype(float)
res = {}
def score(name, P, mask=None):
    m = np.ones(len(D), bool) if mask is None else mask
    rr = rps(P[m], O[m]); ll = -np.log((P[m] * O[m]).sum(1))
    res[name] = dict(n=int(m.sum()), rps=float(rr.mean()), logloss=float(ll.mean()))
PA = D[["pHA", "pDA", "pAA"]].to_numpy(); PB = D[["pHB", "pDB", "pAB"]].to_numpy()
score("A_dc", PA); score("B_dc_promu", PB)
pm = D.promoted.to_numpy() == 1
score("A_dc_matchs_promus", PA, pm); score("B_dc_promu_matchs_promus", PB, pm)

# Inflation des nuls : delta estimé sur la saison précédente (vraisemblance), appliqué à la suivante
def inflate(P, d):
    Q = P.copy(); Q[:, 1] *= (1 + d); return Q / Q.sum(1, keepdims=True)
PD = PB.copy(); deltas = {}
for s in TEST[1:]:
    tr = (D.season == TEST[TEST.index(s) - 1]).to_numpy(); te = (D.season == s).to_numpy()
    grid = np.linspace(-0.2, 0.4, 61)
    best = grid[np.argmin([-np.log((inflate(PB[tr], g) * O[tr]).sum(1)).mean() for g in grid])]
    deltas[s] = float(best); PD[te] = inflate(PB[te], best)
eval_mask = D.season.isin(TEST[1:]).to_numpy()
score("B_eval", PB, eval_mask); score("D_nuls_corriges", PD, eval_mask)

# Empilement : entraîné sur les saisons antérieures uniquement
feats = lambda d, P: np.column_stack([np.log(P[:, 0] / P[:, 1]), np.log(P[:, 2] / P[:, 1]), d.elo / 100, d.pi, d.rest, d.form])
PS = PB.copy(); coefs = {}
for s in TEST[1:]:
    tr = D.season.isin(TEST[:TEST.index(s)]).to_numpy(); te = (D.season == s).to_numpy()
    X = feats(D, PB); y = np.argmax(O, 1)
    sc = StandardScaler().fit(X[tr]); clf = LogisticRegression(C=0.5, max_iter=2000).fit(sc.transform(X[tr]), y[tr])
    PS[te] = clf.predict_proba(sc.transform(X[te])); coefs[s] = np.round(clf.coef_, 3).tolist()
score("C_empilement", PS, eval_mask)
# Contributions isolées : chaque signal ajouté seul au DC
for k, col in [("elo", 2), ("pi", 3), ("repos", 4), ("forme", 5)]:
    P2 = PB.copy()
    for s in TEST[1:]:
        tr = D.season.isin(TEST[:TEST.index(s)]).to_numpy(); te = (D.season == s).to_numpy()
        X = feats(D, PB)[:, [0, 1, col]]; y = np.argmax(O, 1)
        sc = StandardScaler().fit(X[tr]); clf = LogisticRegression(C=0.5, max_iter=2000).fit(sc.transform(X[tr]), y[tr]); P2[te] = clf.predict_proba(sc.transform(X[te]))
    score(f"C_dc_plus_{k}", P2, eval_mask)
# Recalibrage DC seul (même procédure, sans signal) : la bonne référence pour juger les ajouts
P3 = PB.copy()
for s in TEST[1:]:
    tr = D.season.isin(TEST[:TEST.index(s)]).to_numpy(); te = (D.season == s).to_numpy()
    X = feats(D, PB)[:, [0, 1]]; y = np.argmax(O, 1)
    sc = StandardScaler().fit(X[tr]); clf = LogisticRegression(C=0.5, max_iter=2000).fit(sc.transform(X[tr]), y[tr]); P3[te] = clf.predict_proba(sc.transform(X[te]))
score("C_dc_recalibre", P3, eval_mask)

# ---------- Mi-temps : part de buts en 1re période, estimée sur le passé ----------
H = D.dropna(subset=["hth"])
past = H[H.season == "2024-25"]; ev = H[H.season != "2024-25"]
s_home = past.hth.sum() / past.hg.sum(); s_away = past.hta.sum() / past.ag.sum()
def ht_probs(lam, mu, rho):
    return hda(matrix(lam * s_home, mu * s_away, 0.0))
PH = np.array([ht_probs(r.lamB, r.muB, r.rhoB) for r in ev.itertuples()])
OH = np.stack([(ev.hth > ev.hta), (ev.hth == ev.hta), (ev.hth < ev.hta)], 1).astype(float)
base_ht = np.array([(past.hth > past.hta).mean(), (past.hth == past.hta).mean(), (past.hth < past.hta).mean()])
res["HT_modele"] = dict(n=len(ev), rps=float(rps(PH, OH).mean()), logloss=float(-np.log((PH * OH).sum(1)).mean()))
res["HT_reference"] = dict(n=len(ev), rps=float(rps(np.tile(base_ht, (len(ev), 1)), OH).mean()))
# Mi-temps / fin de match (9 issues)
def htft(lam, mu):
    l1, m1, l2, m2 = lam * s_home, mu * s_away, lam * (1 - s_home), mu * (1 - s_away)
    G = 8; g = np.arange(G + 1)
    A1 = np.outer(poisson.pmf(g, l1), poisson.pmf(g, m1)); A2 = np.outer(poisson.pmf(g, l2), poisson.pmf(g, m2))
    out = np.zeros((3, 3))
    for i in range(G + 1):
        for j in range(G + 1):
            r1 = 0 if i > j else 1 if i == j else 2
            for k in range(G + 1 - i):
                for l in range(G + 1 - j):
                    r2 = 0 if i + k > j + l else 1 if i + k == j + l else 2
                    out[r1, r2] += A1[i, j] * A2[k, l]
    return out / out.sum()
sub = ev.sample(min(1500, len(ev)), random_state=1)
PP = np.array([htft(r.lamB, r.muB).ravel() for r in sub.itertuples()])
y9 = np.array([(0 if r.hth > r.hta else 1 if r.hth == r.hta else 2) * 3 + (0 if r.hg > r.ag else 1 if r.hg == r.ag else 2) for r in sub.itertuples()])
pastc = np.bincount([(0 if r.hth > r.hta else 1 if r.hth == r.hta else 2) * 3 + (0 if r.hg > r.ag else 1 if r.hg == r.ag else 2) for r in past.itertuples()], minlength=9)
pb = pastc / pastc.sum()
res["HTFT_modele_logloss"] = dict(n=len(sub), logloss=float(-np.log(PP[np.arange(len(sub)), y9]).mean()))
res["HTFT_reference_logloss"] = dict(n=len(sub), logloss=float(-np.log(pb[y9]).mean()))

# Marchés d'écart vs totaux (validation de l'affirmation d'IntelliGoal sur nos données)
def mk(r):
    M = matrix(r.lamB, r.muB, r.rhoB); i, j = np.indices(M.shape)
    return M[i - j >= 2].sum(), M[(i + j) > 2].sum(), M[j == 0].sum()
Z = np.array([mk(r) for r in D[eval_mask].itertuples()]); E2 = D[eval_mask]
y_w2 = ((E2.hg - E2.ag) >= 2).to_numpy().astype(float); y_o = ((E2.hg + E2.ag) > 2).to_numpy().astype(float); y_cs = (E2.ag == 0).to_numpy().astype(float)
prevD = D[D.season == "2024-25"]
for nm, p, y, base in [("victoire_dom_par_2", Z[:, 0], y_w2, ((prevD.hg - prevD.ag) >= 2).mean()), ("plus_2_5", Z[:, 1], y_o, ((prevD.hg + prevD.ag) > 2).mean()), ("clean_sheet_dom", Z[:, 2], y_cs, (prevD.ag == 0).mean())]:
    res[f"marche_{nm}"] = dict(brier=float(((p - y) ** 2).mean()), brier_ref=float(((base - y) ** 2).mean()), gain=float(1 - ((p - y) ** 2).mean() / ((base - y) ** 2).mean()))

json.dump(dict(results=res, prior=PRIOR, n_prior=len(prior_vals), deltas=deltas, half_share=[s_home, s_away], stack_coefs=coefs),
          open(OUT / "lab.json", "w"), indent=1, default=float)
for k, v in res.items(): print(k, {kk: round(vv, 4) if isinstance(vv, float) else vv for kk, vv in v.items()})
print("deltas nuls", deltas, "parts 1re mi-temps", round(s_home, 3), round(s_away, 3))
