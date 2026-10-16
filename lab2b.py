"""Laboratoire 2b : absences des titulaires habituels (mesure resserrée) et matchs sans enjeu face aux cotes over/under.
Titulaire habituel = a commencé au moins 60 % des matchs précédents de l'équipe (au moins 5) et au moins un des 3 derniers (toujours au club).
"""
import json, sys
from pathlib import Path
import numpy as np, pandas as pd
import statsmodels.api as sm
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
OF = Path(sys.argv[1]); OUT = Path(sys.argv[2])
P = pd.read_csv(OUT / "engine3_preds.csv", parse_dates=["date"])
DIV = {"en.1": "E0", "de.1": "D1"}
rng = np.random.default_rng(7)
rps = lambda A, B: (((np.cumsum(A, 1)[:, :-1] - np.cumsum(B, 1)[:, :-1]) ** 2).sum(1) / 2)
def shin(q):
    q = 1 / q; S = q.sum(1, keepdims=True); lo = np.zeros((len(q), 1)); hi = np.full((len(q), 1), 0.4)
    for _ in range(60):
        z = (lo + hi) / 2; p = (np.sqrt(z * z + 4 * (1 - z) * q * q / S) - z) / (2 * (1 - z)); big = p.sum(1, keepdims=True) > 1
        lo = np.where(big, z, lo); hi = np.where(big, hi, z)
    return p
R = {}
rows = []
for code in DIV:
    full = json.load(open(OF / "2025-26" / f"{code}-full.json"))["matches"]
    Pm = P[(P.league == code) & (P.season == 2025)]
    votes = {}
    for m in full:
        sc = m.get("score"); ft = sc.get("ft") if isinstance(sc, dict) else None
        if not ft: continue
        c = Pm[(Pm.date == pd.Timestamp(m["date"])) & (Pm.hg == ft[0]) & (Pm.ag == ft[1])]
        if len(c) == 1:
            for s_, x_ in ((m["team1"], c.iloc[0].home), (m["team2"], c.iloc[0].away)): votes.setdefault(s_, {}).setdefault(x_, 0); votes[s_][x_] += 1
    mp = {t: max(v, key=v.get) for t, v in votes.items()}
    hist = {}   # équipe -> liste des onzes précédents
    goals = {}  # (équipe, joueur) -> buts
    for m in sorted(full, key=lambda z: z["date"]):
        sc = m.get("score"); ft = sc.get("ft") if isinstance(sc, dict) else None
        lu = m.get("lineup")
        if not ft or not lu or len(lu) < 2: continue
        XI = []
        for side in (0, 1):
            x = lu[side] if isinstance(lu[side], dict) else {}
            XI.append({p["name"] for p in (x.get("starter") or [])})
        if min(len(XI[0]), len(XI[1])) < 11: continue
        rec = dict(date=pd.Timestamp(m["date"]), home=mp.get(m["team1"]), away=mp.get(m["team2"]), hg=ft[0], ag=ft[1])
        for side, team in ((0, m["team1"]), (1, m["team2"])):
            H = hist.get(team, [])
            if len(H) >= 5:
                cnt = {}
                for xi in H:
                    for p in xi: cnt[p] = cnt.get(p, 0) + 1
                recent = set().union(*H[-3:])
                regs = [p for p, c in cnt.items() if c / len(H) >= 0.6 and p in recent]
                miss = [p for p in regs if p not in XI[side]]
                tg = sum(g for (t, p), g in goals.items() if t == team)
                rec[f"miss_{side}"] = len(miss)
                rec[f"missg_{side}"] = sum(goals.get((team, p), 0) for p in miss) / (tg + 3)
                rec[f"regs_{side}"] = len(regs)
            hist.setdefault(team, []).append(XI[side])
        for side, team in ((0, m["team1"]), (1, m["team2"])):
            for g in (m.get(f"goals{side + 1}") or []):
                if not g.get("owngoal"): goals[(team, g["name"])] = goals.get((team, g["name"]), 0) + 1
        rows.append(rec)
A = pd.DataFrame(rows).dropna()
A = A.merge(P[P.season == 2025], on=["date", "home", "away", "hg", "ag"], how="inner").dropna(subset=["oH"]).reset_index(drop=True)
R["n_matchs"] = int(len(A)); R["titulaires_absents_moyenne"] = float((A.miss_0 + A.miss_1).mean() / 2)
# Buts marqués et encaissés selon les absences, au-delà des buts attendus par le modèle
L = pd.concat([
    pd.DataFrame({"y": A.hg, "lam": A.lam, "miss": A.miss_0, "missg": A.missg_0, "miss_opp": A.miss_1}),
    pd.DataFrame({"y": A.ag, "lam": A.mu, "miss": A.miss_1, "missg": A.missg_1, "miss_opp": A.miss_0})])
g = sm.GLM(L.y, sm.add_constant(L[["miss", "missg", "miss_opp"]]), family=sm.families.Poisson(), offset=np.log(L.lam)).fit()
ci = g.conf_int()
R["buts"] = {k: dict(effet=float(np.exp(g.params[k])), ic95=[float(np.exp(ci.loc[k, 0])), float(np.exp(ci.loc[k, 1]))], p=float(g.pvalues[k])) for k in ["miss", "missg", "miss_opp"]}
# 1N2 au-delà du marché, première moitié de saison → seconde moitié, avec intervalle bootstrap sur l'écart
O = np.stack([A.hg > A.ag, A.hg == A.ag, A.hg < A.ag], 1).astype(float); y = O.argmax(1); MK = shin(A[["oH", "oD", "oA"]].to_numpy())
Xm = np.column_stack([np.log(MK[:, 0] / MK[:, 1]), np.log(MK[:, 2] / MK[:, 1])])
Xb = np.column_stack([np.log(A.pH / A.pD), np.log(A.pA / A.pD), np.log(A.sl / A.sm), np.log(A.sl + A.sm), A.pi])
Xa = np.column_stack([A.miss_0 - A.miss_1, A.missg_0 - A.missg_1])
tr = (A.date < "2026-01-15").to_numpy(); te = ~tr
def fitp(X):
    sc = StandardScaler().fit(X[tr]); c = LogisticRegression(C=1.0, max_iter=3000).fit(sc.transform(X[tr]), y[tr]); return c.predict_proba(sc.transform(X[te]))
def cmp(Xa_, Xb_):
    a = rps(fitp(Xa_), O[te]); b = rps(fitp(Xb_), O[te]); d = b - a
    bs = [d[rng.integers(0, len(d), len(d))].mean() for _ in range(2000)]
    return dict(sans=float(a.mean()), avec=float(b.mean()), gain=float(-d.mean()), ic95_gain=[float(-np.percentile(bs, 97.5)), float(-np.percentile(bs, 2.5))])
R["n_test"] = int(te.sum())
R["modele_vs_modele_absences"] = cmp(Xb, np.column_stack([Xb, Xa]))
R["marche_vs_marche_absences"] = cmp(Xm, np.column_stack([Xm, Xa]))
R["marche_brut_test"] = float(rps(MK[te], O[te]).mean())
json.dump(R, open(OUT / "lab2b.json", "w"), indent=1)
print(json.dumps(R, indent=1))
