"""Laboratoire 2 : enjeux du classement et absences de joueurs clés.
E1 : enjeux (course au titre, à l'Europe, au maintien, match sans enjeu) calculés avant chaque match à partir du classement réel.
E2 : part des buts de la saison portée par les titulaires habituels absents du onze (compositions openfootball, PL et Bundesliga 2025-26).
Chaque signal est jugé hors échantillon, contre le modèle et contre les cotes Bet365.
"""
import json, math, sys
from pathlib import Path
import numpy as np, pandas as pd
import statsmodels.api as sm
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
sys.argv = [sys.argv[0], sys.argv[1], sys.argv[2], sys.argv[3], "none"]
src = open(Path(__file__).parent / "engine3.py").read().split("res = {}")[0]
ns = {"__file__": str(Path(__file__).parent / "engine3.py")}; exec(src, ns)
M, NAME, OF, OUT = ns["M"], ns["NAME"], ns["OF"], ns["OUT"]
P = pd.read_csv(OUT / "engine3_preds.csv", parse_dates=["date"])
DIV = {"fr.1": "F1", "en.1": "E0", "es.1": "SP1", "de.1": "D1", "it.1": "I1", "pt.1": "P1", "nl.1": "N1", "en.2": "E1"}
R = {}

# ---------- E1 : enjeux ----------
feat = {}
for code, div in DIV.items():
    for season, g in M[M.Division == div].groupby("season"):
        g = g.sort_values("date"); teams = sorted(set(g.home) | set(g.away)); n = len(teams)
        if n < 10: continue
        total = 2 * (n - 1); pts = dict.fromkeys(teams, 0); pl = dict.fromkeys(teams, 0)
        europe = 6 if n >= 18 else 4; drop = 3 if n >= 18 else 2
        for r in g.itertuples():
            table = sorted(teams, key=lambda t: -pts[t]); P_ = [pts[t] for t in table]
            def f(t):
                rem = total - pl[t]; mx = pts[t] + 3 * rem
                line_drop = P_[n - drop]          # points de la 1re place relégable
                line_eu = P_[europe - 1]
                safe = pts[t] - line_drop > 3 * rem
                can_eu = mx >= line_eu
                can_title = mx >= P_[0]
                late = rem <= 8
                return dict(rem=rem, dead=int(late and safe and not can_eu), releg=int(rem <= 10 and pts[t] - line_drop <= 3),
                            title=int(rem <= 10 and (P_[0] - pts[t] <= 3)), gap_top=P_[0] - pts[t], gap_drop=pts[t] - line_drop)
            a, b = f(r.home), f(r.away)
            feat[(r.date, r.home, r.away)] = dict(dead_h=a["dead"], dead_a=b["dead"], releg_h=a["releg"], releg_a=b["releg"], title_h=a["title"], title_a=b["title"], rem=min(a["rem"], b["rem"]))
            for t, x in ((r.home, r.hg), (r.away, r.ag)): pl[t] += 1
            pts[r.home] += 3 if r.hg > r.ag else 1 if r.hg == r.ag else 0; pts[r.away] += 3 if r.ag > r.hg else 1 if r.hg == r.ag else 0
F = pd.DataFrame([dict(date=k[0], home=k[1], away=k[2], **v) for k, v in feat.items()])
D = P.merge(F, on=["date", "home", "away"], how="left").dropna(subset=["dead_h", "oH", "oD", "oA"]).reset_index(drop=True)
O = np.stack([D.hg > D.ag, D.hg == D.ag, D.hg < D.ag], 1).astype(float); y = O.argmax(1)
def shin(q):
    q = 1 / q; S = q.sum(1, keepdims=True); lo = np.zeros((len(q), 1)); hi = np.full((len(q), 1), 0.4)
    for _ in range(60):
        z = (lo + hi) / 2; p = (np.sqrt(z * z + 4 * (1 - z) * q * q / S) - z) / (2 * (1 - z)); big = p.sum(1, keepdims=True) > 1
        lo = np.where(big, z, lo); hi = np.where(big, hi, z)
    return p
MK = shin(D[["oH", "oD", "oA"]].to_numpy())
rps = lambda A, B: (((np.cumsum(A, 1)[:, :-1] - np.cumsum(B, 1)[:, :-1]) ** 2).sum(1) / 2)
base = np.column_stack([np.log(D.pH / D.pD), np.log(D.pA / D.pD), np.log(D.sl / D.sm), np.log(D.sl + D.sm), D.pi])
mkt = np.column_stack([np.log(MK[:, 0] / MK[:, 1]), np.log(MK[:, 2] / MK[:, 1])])
stakes = D[["dead_h", "dead_a", "releg_h", "releg_a", "title_h", "title_a"]].to_numpy(float)
def ev(X, tr, te):
    sc = StandardScaler().fit(X[tr]); c = LogisticRegression(C=1.0, max_iter=3000).fit(sc.transform(X[tr]), y[tr]); Pp = c.predict_proba(sc.transform(X[te]))
    return float(rps(Pp, O[te]).mean())
tr = (D.season == 2024).to_numpy(); te = (D.season == 2025).to_numpy()
late = te & (D.rem <= 10).to_numpy()
R["enjeux"] = dict(n_test=int(te.sum()), n_fin_de_saison=int(late.sum()),
    modele=ev(base, tr, te), modele_enjeux=ev(np.column_stack([base, stakes]), tr, te),
    marche=ev(mkt, tr, te), marche_enjeux=ev(np.column_stack([mkt, stakes]), tr, te),
    fin_modele=ev(base, tr, late), fin_modele_enjeux=ev(np.column_stack([base, stakes]), tr, late),
    fin_marche=ev(mkt, tr, late), fin_marche_enjeux=ev(np.column_stack([mkt, stakes]), tr, late))
# Effet brut : buts marqués au-delà des buts attendus par le modèle, selon la situation (toutes saisons testées)
def effect(flag_h, flag_a):
    rows = []
    for side, flag, gcol, lcol in (("dom", flag_h, "hg", "lam"), ("ext", flag_a, "ag", "mu")):
        m = D[flag] == 1
        rows.append(pd.DataFrame({"y": D.loc[m, gcol], "lam": D.loc[m, lcol]}))
    d = pd.concat(rows)
    if len(d) < 30: return None
    g = sm.GLM(d.y, np.ones((len(d), 1)), family=sm.families.Poisson(), offset=np.log(d.lam)).fit()
    ci = np.asarray(g.conf_int()).ravel()
    return dict(n=int(len(d)), multiplicateur=float(np.exp(np.asarray(g.params)[0])), ic95=[float(np.exp(ci[0])), float(np.exp(ci[1]))])
R["enjeux_effets_buts"] = {"sans_enjeu": effect("dead_h", "dead_a"), "lutte_maintien": effect("releg_h", "releg_a"), "course_titre": effect("title_h", "title_a")}
# Le marché les price-t-il ? résidu du marché sur les matchs « sans enjeu »
for k, (fh, fa) in {"sans_enjeu": ("dead_h", "dead_a"), "lutte_maintien": ("releg_h", "releg_a")}.items():
    m = ((D[fh] == 1) | (D[fa] == 1)).to_numpy()
    R[f"enjeux_{k}_rps_marche"] = dict(n=int(m.sum()), marche=float(rps(MK[m], O[m]).mean()) if m.sum() else None)
print(json.dumps({k: R[k] for k in R}, indent=1, default=float))

# ---------- E2 : absences de joueurs clés ----------
rows = []
for code in ["en.1", "de.1"]:
    full = json.load(open(OF / "2025-26" / f"{code}-full.json"))["matches"]
    # noms openfootball « full » → football-data par rapprochement date + score
    xg = M[(M.Division == DIV[code]) & (M.season == 2025)]
    votes = {}
    for m in full:
        sc = m.get("score"); ft = sc.get("ft") if isinstance(sc, dict) else None
        if not ft: continue
        c = xg[(xg.date == pd.Timestamp(m["date"])) & (xg.hg == ft[0]) & (xg.ag == ft[1])]
        if len(c) == 1:
            for s_, x_ in ((m["team1"], c.iloc[0].home), (m["team2"], c.iloc[0].away)): votes.setdefault(s_, {}).setdefault(x_, 0); votes[s_][x_] += 1
    mp = {t: max(v, key=v.get) for t, v in votes.items()}
    goals_so_far, team_goals = {}, {}
    for m in sorted(full, key=lambda z: z["date"]):
        sc = m.get("score"); ft = sc.get("ft") if isinstance(sc, dict) else None
        if not ft or not m.get("lineup") or len(m["lineup"]) < 2: continue
        for side, team in ((0, m["team1"]), (1, m["team2"])):
            lu = m["lineup"][side] if isinstance(m["lineup"][side], dict) else {}
            starters = {p["name"] for p in (lu.get("starter") or [])}
            tg = team_goals.get(team, 0)
            gs = {p: g for (t, p), g in goals_so_far.items() if t == team}
            absent = sum(g for p, g in gs.items() if p not in starters)
            share_abs = absent / (tg + 3)
            top = max(gs, key=gs.get) if gs else None
            rows.append(dict(league=code, date=pd.Timestamp(m["date"]), team=mp.get(team), opp=mp.get(m["team2"] if side == 0 else m["team1"]), side=side,
                             goals=ft[side], share_abs=share_abs, top_absent=int(top is not None and gs[top] >= 3 and top not in starters), n_prior=tg))
        for side, team in ((0, m["team1"]), (1, m["team2"])):
            for g in (m.get(f"goals{side + 1}") or []):
                if g.get("owngoal"): continue
                goals_so_far[(team, g["name"])] = goals_so_far.get((team, g["name"]), 0) + 1; team_goals[team] = team_goals.get(team, 0) + 1
A = pd.DataFrame(rows).dropna(subset=["team", "opp"])
Pm = P[P.league.isin(["en.1", "de.1"]) & (P.season == 2025)]
A["home"] = np.where(A.side == 0, A.team, A.opp); A["away"] = np.where(A.side == 0, A.opp, A.team)
A = A.merge(Pm[["date", "home", "away", "lam", "mu", "pH", "pD", "pA", "sl", "sm", "pi", "hg", "ag", "oH", "oD", "oA"]], on=["date", "home", "away"], how="inner")
A["lam_side"] = np.where(A.side == 0, A.lam, A.mu)
A = A[A.n_prior >= 5]  # assez de buts déjà marqués pour savoir qui compte
g = sm.GLM(A.goals, sm.add_constant(A[["share_abs"]]), family=sm.families.Poisson(), offset=np.log(A.lam_side)).fit()
ci = g.conf_int().loc["share_abs"]
R["absences"] = dict(n=int(len(A)), coef=float(g.params["share_abs"]), ic95=[float(ci[0]), float(ci[1])], p=float(g.pvalues["share_abs"]),
                     effet_10pts=float(np.exp(0.1 * g.params["share_abs"])), part_moyenne_absente=float(A.share_abs.mean()),
                     buteur_principal_absent=dict(n=int(A.top_absent.sum())))
gt = sm.GLM(A.goals, sm.add_constant(A[["top_absent"]]), family=sm.families.Poisson(), offset=np.log(A.lam_side)).fit(); cit = gt.conf_int().loc["top_absent"]
R["absences"]["buteur_principal_absent"].update(multiplicateur=float(np.exp(gt.params["top_absent"])), ic95=[float(np.exp(cit[0])), float(np.exp(cit[1]))], p=float(gt.pvalues["top_absent"]))
# Au-delà du marché : 1N2 avec les absences des deux équipes, demi-saison 1 → demi-saison 2
W = A.pivot_table(index=["date", "home", "away"], columns="side", values="share_abs").dropna().reset_index().rename(columns={0: "abs_h", 1: "abs_a"})
W = W.merge(Pm, on=["date", "home", "away"]).dropna(subset=["oH"]).reset_index(drop=True)
Ow = np.stack([W.hg > W.ag, W.hg == W.ag, W.hg < W.ag], 1).astype(float); yw = Ow.argmax(1); MKw = shin(W[["oH", "oD", "oA"]].to_numpy())
Xm = np.column_stack([np.log(MKw[:, 0] / MKw[:, 1]), np.log(MKw[:, 2] / MKw[:, 1])]); Xa = W[["abs_h", "abs_a"]].to_numpy()
Xb = np.column_stack([np.log(W.pH / W.pD), np.log(W.pA / W.pD), np.log(W.sl / W.sm), np.log(W.sl + W.sm), W.pi])
trw = (W.date < "2026-01-15").to_numpy(); tew = ~trw
def evw(X):
    sc = StandardScaler().fit(X[trw]); c = LogisticRegression(C=1.0, max_iter=3000).fit(sc.transform(X[trw]), yw[trw]); return float(rps(c.predict_proba(sc.transform(X[tew])), Ow[tew]).mean())
R["absences_1n2"] = dict(n_test=int(tew.sum()), modele=evw(Xb), modele_absences=evw(np.column_stack([Xb, Xa])), marche=evw(Xm), marche_absences=evw(np.column_stack([Xm, Xa])))
json.dump(R, open(OUT / "lab2.json", "w"), indent=1, default=float)
print(json.dumps({k: R[k] for k in ["absences", "absences_1n2"]}, indent=1, default=float))
