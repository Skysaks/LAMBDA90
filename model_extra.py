"""Lambda 90 — modules étendus.
1. Ensemble final : Dixon-Coles (a priori promu) + pi-ratings, recalibré par régression logistique sur les prédictions walk-forward.
2. Simulation Monte-Carlo de la saison 2026-27 (incertitude des forces via la hessienne inverse).
3. Joueurs (Premier League, Bundesliga 2025-26) : buteurs, tireurs de penalty, discipline ; modèle « buteur à tout moment » validé hors échantillon.
4. Arbitres et cartons : modèle de cartons validé hors échantillon.
"""
import json, math, re, sys, unicodedata
from pathlib import Path
import numpy as np, pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import roc_auc_score
sys.path.insert(0, str(Path(__file__).parent))
import importlib.util
spec = importlib.util.spec_from_file_location("lab", Path(__file__).parent / "exp_signals_lib.py"); lab = importlib.util.module_from_spec(spec); spec.loader.exec_module(lab)

ROOT = Path(sys.argv[1]); OUT = Path(sys.argv[2])
TODAY = pd.Timestamp("2026-10-16")
LAB = json.load(open(OUT / "lab.json")); PRIOR = tuple(LAB["prior"])
pre = json.load(open(OUT / "prematch.json"))
rng = np.random.default_rng(7)

# ---------- 1. Ensemble DC + pi ----------
D = pd.read_csv(OUT / "lab_preds.csv")
PB = D[["pHB", "pDB", "pAB"]].to_numpy()
X = np.column_stack([np.log(PB[:, 0] / PB[:, 1]), np.log(PB[:, 2] / PB[:, 1]), D.pi])
y = np.where(D.hg > D.ag, 0, np.where(D.hg == D.ag, 1, 2))
sc = StandardScaler().fit(X); clf = LogisticRegression(C=0.5, max_iter=3000).fit(sc.transform(X), y)

fixtures, sims, ratings = [], {}, {}
for code in lab.LEAGUES:
    df, tbs = lab.load(code)
    promoted = tbs.get("2026-27", set()) - tbs.get("2025-26", set())
    prior = {t: PRIOR for t in promoted}
    m = lab.fit(df, TODAY, prior, None, want_cov=True)
    # pi-ratings finaux
    piH, piA = {}, {}
    c, lr, gm = 3.0, 0.035, 0.7; gfun = lambda r: math.copysign(10 ** (abs(r) / c) - 1, r)
    for r in df.itertuples():
        exp_gd = gfun(piH.get(r.home, 0.0)) - gfun(piA.get(r.away, 0.0)); obs = r.hg - r.ag
        psi = c * math.log10(1 + abs(obs - exp_gd)) * (1 if obs > exp_gd else -1); dH, dA = psi * lr, -psi * lr
        piH[r.home] = piH.get(r.home, 0.0) + dH; piA[r.home] = piA.get(r.home, 0.0) + dH * gm
        piA[r.away] = piA.get(r.away, 0.0) + dA; piH[r.away] = piH.get(r.away, 0.0) + dA * gm
    # calendrier 2026-27
    allm = json.load(open(ROOT / "2026-27" / f"{code}.json"))["matches"]
    played, remaining = [], []
    for x in allm:
        sc_ = x.get("score"); ft = sc_.get("ft") if isinstance(sc_, dict) else (sc_ if isinstance(sc_, list) and len(sc_) == 2 else None)
        (played if ft else remaining).append((x["team1"], x["team2"], ft, x["date"]))
    for f in pre["fixtures"]:
        if f["league"] != code: continue
        lam, mu = lab.rates(m, f["home"], f["away"], prior)
        M = lab.matrix(lam, mu, m["rho"]); P = lab.hda(M)
        pi = gfun(piH.get(f["home"], 0.0)) - gfun(piA.get(f["away"], 0.0))
        q = clf.predict_proba(sc.transform([[math.log(P[0] / P[1]), math.log(P[2] / P[1]), pi]]))[0]
        fixtures.append({**f, "lam": round(lam, 4), "mu": round(mu, 4), "rho": round(float(m["rho"]), 4), "ens": [round(float(v), 4) for v in q], "pi": round(pi, 3)})
    # ---------- 2. Monte-Carlo ----------
    teams = sorted(tbs["2026-27"]); ti = {t: i for i, t in enumerate(teams)}; n = len(teams)
    pts = np.zeros(n); gf = np.zeros(n); ga = np.zeros(n); pld = np.zeros(n)
    for h, a, ft, _ in played:
        i, j = ti[h], ti[a]; gf[i] += ft[0]; ga[i] += ft[1]; gf[j] += ft[1]; ga[j] += ft[0]; pld[i] += 1; pld[j] += 1
        pts[i] += 3 if ft[0] > ft[1] else 1 if ft[0] == ft[1] else 0; pts[j] += 3 if ft[1] > ft[0] else 1 if ft[0] == ft[1] else 0
    N = 10000
    att = np.array([m["att"][m["idx"][t]] if t in m["idx"] else PRIOR[0] for t in teams])
    dfn = np.array([m["def"][m["idx"][t]] if t in m["idx"] else PRIOR[1] for t in teams])
    se_a = np.array([np.clip(m["se_att"][m["idx"][t]], 0.03, 0.25) if t in m["idx"] else 0.2 for t in teams])
    se_d = np.array([np.clip(m["se_def"][m["idx"][t]], 0.03, 0.25) if t in m["idx"] else 0.2 for t in teams])
    A = att + rng.normal(size=(N, n)) * se_a; Dd = dfn + rng.normal(size=(N, n)) * se_d
    P_ = np.tile(pts, (N, 1)); GF = np.tile(gf, (N, 1)); GA = np.tile(ga, (N, 1))
    for h, a, _, _ in remaining:
        i, j = ti[h], ti[a]
        lam = np.exp(m["mu0"] + m["home"] + A[:, i] + Dd[:, j]); mu = np.exp(m["mu0"] + A[:, j] + Dd[:, i])
        x = rng.poisson(lam); yv = rng.poisson(mu)
        GF[:, i] += x; GA[:, i] += yv; GF[:, j] += yv; GA[:, j] += x
        P_[:, i] += np.where(x > yv, 3, np.where(x == yv, 1, 0)); P_[:, j] += np.where(yv > x, 3, np.where(x == yv, 1, 0))
    key = P_ * 1e6 + (GF - GA) * 1e3 + GF + rng.random((N, n)) * 1e-3
    rank = (-key).argsort(1).argsort(1)  # 0 = premier
    dist = np.stack([(rank == k).mean(0) for k in range(n)], 1)  # équipe x position
    sims[code] = dict(teams=[dict(team=t, pts=int(pts[i]), played=int(pld[i]), gd=int(gf[i] - ga[i]), xpts=round(float(P_[:, i].mean()), 1),
                                  p=[round(float(v), 4) for v in dist[i]]) for i, t in enumerate(teams)],
                      n_played=len(played), n_remaining=len(remaining),
                      n_missing=sum(1 for h, a, ft, d in remaining if d < str(TODAY.date())), N=N)
    ratings[code + "_params"] = dict(home=float(m["home"]), mu0=float(m["mu0"]), rho=float(m["rho"]))
    ratings[code] = [dict(team=t, att=round(float(att[i]), 3), dfn=round(float(dfn[i]), 3), pi_h=round(piH.get(t, 0.0), 3), pi_a=round(piA.get(t, 0.0), 3)) for i, t in enumerate(teams)]
    print(code, "sim ok", len(played), "joués", len(remaining), "restants", flush=True)

# ---------- 3 & 4. Joueurs, arbitres ----------
def canon(s):
    s = unicodedata.normalize("NFD", s); s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn").lower()
    s = s.replace("m'gladbach", "monchengladbach").replace("&", " and ")
    return [w for w in re.sub(r"[^a-z0-9 ]", " ", s).split() if w not in {"fc", "afc", "1", "cf", "sv", "04", "05", "1846", "1899", "tsg", "vfl", "vfb", "and", "hove"}]
def map_names(src, dst):
    out = {}
    for s in src:
        A = set(canon(s)); best, bs = None, 0
        for d in dst:
            B = set(canon(d)); sc_ = len(A & B) / max(1, min(len(A), len(B)))
            if sc_ > bs: bs, best = sc_, d
        out[s] = best if bs >= 0.5 else None
    return out
cardw = {"Y": 1, "R": 1, "Y/R": 1}
players, refs, val = {}, {}, {}
scorer_rows, card_rows = [], []
for code in ["en.1", "de.1"]:
    full = json.load(open(ROOT / "2025-26" / f"{code}-full.json"))["matches"]
    regs = json.load(open(ROOT / "2025-26" / f"{code}.json"))["matches"]
    cur_teams = {m["team1"] for m in json.load(open(ROOT / "2026-27" / f"{code}.json"))["matches"]}
    nm = map_names({m["team1"] for m in full}, {m["team1"] for m in regs} | cur_teams)
    lp = D[(D.league == code) & (D.season == "2025-26")].set_index(["date", "home", "away"])
    P = {}; R = {}; T = {}
    for mt in full:
        sc_ = mt.get("score"); ft = sc_.get("ft") if isinstance(sc_, dict) else None
        if not ft: continue
        h, a = nm.get(mt["team1"]), nm.get(mt["team2"])
        if not h or not a: continue
        key = (mt["date"], h, a); lam = mu = None
        if key in lp.index: r = lp.loc[key]; lam, mu = float(r.lamB), float(r.muB)
        ref = (mt.get("referees") or [{}])[0].get("name")
        bk = mt.get("bookings") or [[], []]
        cards = [sum(1 for b in side if b["type"] in cardw) for side in bk[:2]] + [0, 0]
        for side, team in ((0, h), (1, a)):
            T.setdefault(team, dict(m=0, gf=0, cards=0)); T[team]["m"] += 1; T[team]["gf"] += ft[side]; T[team]["cards"] += cards[side]
        card_rows.append(dict(league=code, date=mt["date"], home=h, away=a, ref=ref, ch=cards[0], ca=cards[1]))
        if ref: R.setdefault(ref, []).append(cards[0] + cards[1])
        lineups = mt.get("lineup") or [{}, {}]
        for side, team in ((0, h), (1, a)):
            lu = lineups[side] if side < len(lineups) else {}
            onpitch = set()
            for role in ("starter", "sub"):
                for p in (lu.get(role) or []) if isinstance(lu, dict) else []:
                    nmp = p["name"]; onpitch.add(nmp)
                    d = P.setdefault((team, nmp), dict(team=team, name=nmp, starts=0, subs=0, goals=0, pens=0, yc=0, rc=0, first=mt["date"]))
                    d["starts" if role == "starter" else "subs"] += 1
            goals = mt.get(f"goals{side + 1}") or []
            scorers = [g for g in goals if not g.get("owngoal")]
            for g in scorers:
                d = P.setdefault((team, g["name"]), dict(team=team, name=g["name"], starts=0, subs=0, goals=0, pens=0, yc=0, rc=0, first=mt["date"]))
                d["goals"] += 1; d["pens"] += 1 if g.get("penalty") else 0
            for b in (bk[side] if side < len(bk) else []):
                d = P.setdefault((team, b["name"]), dict(team=team, name=b["name"], starts=0, subs=0, goals=0, pens=0, yc=0, rc=0, first=mt["date"]))
                if b["type"] == "Y": d["yc"] += 1
                else: d["rc"] += 1
            scorer_rows.append(dict(league=code, date=mt["date"], team=team, lam=(lam if side == 0 else mu), scorers=[g["name"] for g in scorers], on=sorted(onpitch)))
    # sorties
    for (team, name), d in P.items():
        if team not in cur_teams: continue
        apps = d["starts"] + d["subs"]
        if apps == 0 and d["goals"] == 0: continue
        tm = T.get(team, {"m": 1, "gf": 1})
        d.update(apps=apps, team_m=tm["m"], share=round((d["goals"] - 0.5 * d["pens"] * 0) / max(1, tm["gf"] + 3), 4))
        players.setdefault(code, []).append(d)
    lg_avg = np.mean([c_ for v in R.values() for c_ in v])
    refs[code] = sorted([dict(name=k, m=len(v), avg=round(float(np.mean(v)), 2), factor=round(float((sum(v) + 6 * lg_avg) / (len(v) + 6) / lg_avg), 3)) for k, v in R.items()], key=lambda z: -z["m"])
    players[code + "_teams"] = {t: dict(m=v["m"], gf=v["gf"], cards=round(v["cards"] / v["m"], 2)) for t, v in T.items() if t in cur_teams}
    players[code + "_lg_cards"] = round(float(lg_avg), 2)

# Validation buteur : entraînement avant 2026-01-01, test après
S = pd.DataFrame(scorer_rows).dropna(subset=["lam"])
tr, te = S[S.date < "2026-01-01"], S[S.date >= "2026-01-01"]
share = {}; teamg = tr.groupby("team").apply(lambda d: sum(len(x) for x in d.scorers)).to_dict()
cnt = {}
for r in tr.itertuples():
    for s_ in r.scorers: cnt[(r.team, s_)] = cnt.get((r.team, s_), 0) + 1
for (t, p_), g in cnt.items(): share[(t, p_)] = g / (teamg.get(t, 0) + 3)
nmatch = tr.groupby("team").size().to_dict()
ys, pm, pb = [], [], []
for r in te.itertuples():
    for (t, p_), sh in share.items():
        if t != r.team: continue
        ys.append(int(p_ in r.scorers)); pm.append(1 - math.exp(-r.lam * sh))
        pb.append(1 - math.exp(-cnt[(t, p_)] / nmatch[t]))  # référence : taux de but historique, sans adversaire
ys, pm, pb = map(np.array, (ys, pm, pb))
# Facteur d'échelle k (rotation, blessures, départs) estimé SANS le test : parts calculées sur août-octobre, k ajusté sur novembre-décembre
def shares_of(d):
    c_, tg = {}, {}
    for r in d.itertuples():
        tg[r.team] = tg.get(r.team, 0) + len(r.scorers)
        for s_ in r.scorers: c_[(r.team, s_)] = c_.get((r.team, s_), 0) + 1
    return {k: g / (tg.get(k[0], 0) + 3) for k, g in c_.items()}
sh1 = shares_of(tr[tr.date < "2025-11-01"]); late = tr[tr.date >= "2025-11-01"]
def brier_k(k):
    e = []
    for r in late.itertuples():
        for (t, p_), sh in sh1.items():
            if t == r.team: e.append(((1 - math.exp(-k * r.lam * sh)) - (p_ in r.scorers)) ** 2)
    return np.mean(e)
grid = np.linspace(0.4, 1.2, 33); KS = float(grid[np.argmin([brier_k(k) for k in grid])])
pm_raw = pm.copy()
pm = np.array([0.0] * 0)
pm = []
for r in te.itertuples():
    for (t, p_), sh in share.items():
        if t == r.team: pm.append(1 - math.exp(-KS * r.lam * sh))
pm = np.array(pm)
val["buteur_k"] = KS
val["buteur_brut_brier"] = float(((pm_raw - ys) ** 2).mean())
val["buteur"] = dict(n=int(len(ys)), brier=float(((pm - ys) ** 2).mean()), brier_ref=float(((pb - ys) ** 2).mean()), auc=float(roc_auc_score(ys, pm)), auc_ref=float(roc_auc_score(ys, pb)),
                     cal=[dict(p=float(pm[q].mean()), y=float(ys[q].mean()), n=int(q.sum())) for q in [(pm >= lo) & (pm < hi) for lo, hi in [(0, .1), (.1, .2), (.2, .3), (.3, .45), (.45, 1)]] if q.sum() > 20])
# Validation cartons
C = pd.DataFrame(card_rows); ctr, cte = C[C.date < "2026-01-01"], C[C.date >= "2026-01-01"]
lgm = (ctr.ch + ctr.ca).mean()
tcard = {}
for r in ctr.itertuples():
    tcard.setdefault(r.home, []).append(r.ch); tcard.setdefault(r.away, []).append(r.ca)
rf = ctr.groupby("ref").apply(lambda d: ((d.ch + d.ca).sum() + 6 * lgm) / (len(d) + 6) / lgm).to_dict()
from scipy.stats import poisson as po
yv, pmod, pref, pbase = [], [], [], []
for r in cte.itertuples():
    th = (sum(tcard.get(r.home, [])) + 4 * lgm / 2) / (len(tcard.get(r.home, [])) + 4); ta = (sum(tcard.get(r.away, [])) + 4 * lgm / 2) / (len(tcard.get(r.away, [])) + 4)
    e = (th + ta) * rf.get(r.ref, 1.0)
    yv.append(int(r.ch + r.ca > 4.5)); pmod.append(1 - po.cdf(4, e)); pref.append(1 - po.cdf(4, (th + ta))); pbase.append(1 - po.cdf(4, lgm))
yv, pmod, pref, pbase = map(np.array, (yv, pmod, pref, pbase))
val["cartons_plus_4_5"] = dict(n=int(len(yv)), brier_modele=float(((pmod - yv) ** 2).mean()), brier_sans_arbitre=float(((pref - yv) ** 2).mean()), brier_moyenne=float(((pbase - yv) ** 2).mean()),
                               auc_modele=float(roc_auc_score(yv, pmod)), auc_sans_arbitre=float(roc_auc_score(yv, pref)))
print(json.dumps(val, indent=1, default=float)[:1500])
json.dump(dict(scorer_k=KS, fixtures=fixtures, sims=sims, ratings=ratings, players=players, refs=refs, validation=val,
               ensemble=dict(coef=clf.coef_.round(3).tolist(), classes=["H", "D", "A"])),
          open(OUT / "extra.json", "w"), ensure_ascii=False, default=float)
print("joueurs", {k: len(v) for k, v in players.items() if isinstance(v, list)}, "arbitres", {k: len(v) for k, v in refs.items()})
