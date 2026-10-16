"""Lambda 90 — moteur live.
Intensité de but par minute : rate(m) = lambda_pré-match x exp(c + bin(m) + état du score + supériorité numérique)
Estimé par GLM de Poisson (offset log lambda) sur les matchs détaillés openfootball 2025-26
(Premier League, Bundesliga, Autriche : minute des buts, temps additionnel, cartons rouges).
Validation : entraînement avant 2026-01-01, test après. Projection par programmation dynamique minute par minute.
"""
import json, sys, math
from pathlib import Path
import numpy as np, pandas as pd
import statsmodels.api as sm
from sklearn.metrics import roc_auc_score, brier_score_loss
sys.argv += []
ROOT = Path(sys.argv[1]); OUT = Path(sys.argv[2])
sys.path.insert(0, str(Path(__file__).parent))
import importlib.util
spec = importlib.util.spec_from_file_location("pm", Path(__file__).parent / "dc_core.py"); pm = importlib.util.module_from_spec(spec); spec.loader.exec_module(pm)

S1, S2 = 3, 6   # minutes de temps additionnel modélisées (hypothèse ; les buts au-delà sont rattachés à la dernière)
# Horloge modèle : 1..45, 45+1..45+S1, 46..90, 90+1..90+S2  -> indices 0..(90+S1+S2-1)
CLOCK = [f"{m}" for m in range(1, 46)] + [f"45+{k}" for k in range(1, S1 + 1)] + [f"{m}" for m in range(46, 91)] + [f"90+{k}" for k in range(1, S2 + 1)]
NM = len(CLOCK)
def idx_of(minute_str):
    s = minute_str.strip().replace("'", "")
    if "+" in s:
        b, e = s.split("+"); b, e = int(b), int(e or 1)
        if b <= 45: return 45 + min(max(e, 1), S1) - 1
        return 45 + S1 + 45 + min(max(e, 1), S2) - 1
    m = int(s); m = min(max(m, 1), 90)
    return m - 1 if m <= 45 else 45 + S1 + (m - 46)
BIN_NAMES = ["1-15", "16-30", "31-45", "45+", "46-60", "61-75", "76-90", "90+"]
def bin_of(i):
    if i < 45: return i // 15
    if i < 45 + S1: return 3
    j = i - 45 - S1
    if j < 45: return 4 + j // 15
    return 7

def state_cat(d):  # écart de buts du point de vue de l'équipe
    return "m2" if d <= -2 else "m1" if d == -1 else "z" if d == 0 else "p1" if d == 1 else "p2"

matches = []
for code in ["en.1", "de.1", "at.1"]:
    df, _ = pm.load(ROOT, code, ["2023-24", "2024-25", "2025-26"])
    model = pm.fit(df[df.date < "2025-08-01"], pd.Timestamp("2025-08-01"))
    for m in json.load(open(ROOT / "2025-26" / f"{code}-full.json"))["matches"]:
        sc = m.get("score"); ft = sc.get("ft") if isinstance(sc, dict) else (sc if isinstance(sc, list) and len(sc) == 2 else None)
        if not ft or ("goals1" not in m and sum(ft) > 0) or "bookings" not in m and sum(ft) == 0: continue
        g1, g2 = m.get("goals1", []), m.get("goals2", [])
        if len(g1) != ft[0] or len(g2) != ft[1]: continue
        reds = [[], []]
        for side, bl in enumerate(m.get("bookings", [[], []])[:2]):
            for b in bl:
                if b["type"] in ("R", "Y/R"): reds[side].append(idx_of(b["minute"]))
        lam, mu = pm.rates(model, m["team1"], m["team2"])
        matches.append(dict(league=code, date=m["date"], lam=lam, mu=mu,
                            g=[[idx_of(x["minute"]) for x in g1], [idx_of(x["minute"]) for x in g2]], reds=reds))
print("matchs live exploitables :", len(matches), "| cartons rouges :", sum(len(r) for x in matches for r in x["reds"]))

def rows_for(ms):
    R = []
    for mi, x in enumerate(ms):
        for side in (0, 1):
            own, opp = x["g"][side], x["g"][1 - side]
            ro, rp = x["reds"][side], x["reds"][1 - side]
            base = x["lam"] if side == 0 else x["mu"]
            for i in range(NM):
                d = sum(t < i for t in own) - sum(t < i for t in opp)
                man = sum(t < i for t in rp) - sum(t < i for t in ro)   # >0 : supériorité numérique
                R.append((mi, side, i, bin_of(i), state_cat(d), 1 if man > 0 else 0, 1 if man < 0 else 0,
                          math.log(base), sum(t == i for t in own)))
    return pd.DataFrame(R, columns=["mi", "side", "i", "bin", "st", "up", "down", "off", "y"])

def design(D):
    X = pd.get_dummies(D["bin"].astype("category").cat.set_categories(range(8)), prefix="b", drop_first=True).astype(float)
    S = pd.get_dummies(D["st"].astype("category").cat.set_categories(["z", "m2", "m1", "p1", "p2"]), drop_first=True).astype(float)
    X = pd.concat([X, S, D[["up", "down"]].astype(float)], axis=1)
    return sm.add_constant(X, has_constant="add")

def fit_glm(ms):
    D = rows_for(ms); X = design(D)
    return sm.GLM(D.y, X, family=sm.families.Poisson(), offset=D.off).fit()

def coefs(res):
    p = res.params; ci = res.conf_int()
    return dict(c=float(p["const"]), bins=[0.0] + [float(p[f"b_{k}"]) for k in range(1, 8)],
                state={k: float(p[k]) for k in ["m2", "m1", "p1", "p2"]} | {"z": 0.0},
                up=float(p["up"]), down=float(p["down"]),
                ci={k: [float(ci.loc[k, 0]), float(ci.loc[k, 1])] for k in ["m2", "m1", "p1", "p2", "up", "down"]})

def project(C, lam, mu, start, hg, ag, man=0, horizon=None):
    """DP minute par minute. Retourne P(1,N,2), P(but dans horizon), P(prochain but dom/ext/aucun)."""
    K = 12; P = np.zeros((K, K)); P[hg, ag] = 1.0
    nxt = np.zeros(3); first = np.zeros((K, K), bool)  # suivi prochain but via état absorbant séparé
    noGoal = 1.0; anyGoalH = 0.0
    Q = P.copy()  # masse sans but depuis start
    end = NM if horizon is None else min(NM, start + horizon)
    hgrid, agrid = np.indices((K, K)); diff = hgrid - agrid
    st = lambda d: np.select([d <= -2, d == -1, d == 0, d == 1], [C["state"]["m2"], C["state"]["m1"], 0.0, C["state"]["p1"]], C["state"]["p2"])
    upH = C["up"] if man > 0 else C["down"] if man < 0 else 0.0
    upA = C["up"] if man < 0 else C["down"] if man > 0 else 0.0
    for i in range(start, NM):
        b = C["bins"][bin_of(i)]
        rh = lam * np.exp(C["c"] + b + st(diff) + upH); ra = mu * np.exp(C["c"] + b + st(-diff) + upA)
        ph, pa = 1 - np.exp(-rh), 1 - np.exp(-ra)
        N = P * (1 - ph) * (1 - pa)
        N[1:, :] += (P * ph * (1 - pa))[:-1, :]; N[:, 1:] += (P * (1 - ph) * pa)[:, :-1]; N[1:, 1:] += (P * ph * pa)[:-1, :-1]
        # prochain but : sur la masse Q (pas encore de but)
        qh, qa = (Q * ph * (1 - pa)).sum() + 0.5 * (Q * ph * pa).sum(), (Q * (1 - ph) * pa).sum() + 0.5 * (Q * ph * pa).sum()
        nxt += [qh, qa, 0]; Q = Q * (1 - ph) * (1 - pa)
        if horizon is not None and i == end - 1: p_goal_h = 1 - Q.sum()
        P = N
    nxt[2] = Q.sum()
    return dict(H=float(P[hgrid > agrid].sum()), D=float(P[hgrid == agrid].sum()), A=float(P[hgrid < agrid].sum()),
                next=nxt.tolist(), p_goal_h=float(p_goal_h) if horizon is not None else None)

# --- Validation hors échantillon ---
train = [x for x in matches if x["date"] < "2026-01-01"]; test = [x for x in matches if x["date"] >= "2026-01-01"]
C = coefs(fit_glm(train))
Cb = dict(c=C["c"], bins=C["bins"], state={k: 0.0 for k in ["m2", "m1", "z", "p1", "p2"]}, up=0.0, down=0.0)  # sans état
# Référence naïve : taux moyen par minute, identique pour tous les matchs (lambda = moyenne)
lbar = np.mean([x["lam"] for x in train]); mbar = np.mean([x["mu"] for x in train])
ys, pf, pn, p0 = [], [], [], []
for x in test:
    for s in range(0, NM - 10, 5):
        hg = sum(t < s for t in x["g"][0]); ag = sum(t < s for t in x["g"][1])
        man = sum(t < s for t in x["reds"][1]) - sum(t < s for t in x["reds"][0])
        y = int(any(s <= t < s + 10 for t in x["g"][0] + x["g"][1]))
        ys.append(y)
        pf.append(project(C, x["lam"], x["mu"], s, hg, ag, man, 10)["p_goal_h"])
        pn.append(project(Cb, x["lam"], x["mu"], s, hg, ag, 0, 10)["p_goal_h"])
        p0.append(project(Cb, lbar, mbar, s, 0, 0, 0, 10)["p_goal_h"])
ys = np.array(ys)
val = {}
for name, p in [("reference_minute", p0), ("prematch_seul", pn), ("complet", pf)]:
    p = np.array(p); q = pd.qcut(p, 8, duplicates="drop")
    cal = pd.DataFrame({"p": p, "y": ys, "b": q}).groupby("b", observed=True).agg(p=("p", "mean"), y=("y", "mean"), n=("y", "size"))
    val[name] = dict(brier=float(brier_score_loss(ys, p)), auc=float(roc_auc_score(ys, p)), n=int(len(ys)),
                     cal=cal.round(4).reset_index(drop=True).to_dict("records"))
print(json.dumps({k: {kk: vv for kk, vv in v.items() if kk != "cal"} for k, v in val.items()}, indent=1))

# Modèle final sur tout l'échantillon
Cf = coefs(fit_glm(matches))
print("coefficients finaux :", json.dumps({k: (np.round(v, 3).tolist() if isinstance(v, list) else v) for k, v in Cf.items() if k != "ci"}, default=float))
print("IC 95 % :", json.dumps(Cf["ci"]))
json.dump(dict(coef=Cf, clock=CLOCK, s1=S1, s2=S2, bins=BIN_NAMES, n_matches=len(matches),
               n_reds=sum(len(r) for x in matches for r in x["reds"]), validation=val,
               n_test_matches=len(test)), open(OUT / "live.json", "w"), default=float)
