"""Laboratoire 14 : fatigue et face-à-face apportent-ils quelque chose AU-DELÀ du marché ?
Hypothèses testées (idée : avec la fatigue des calendriers, les deux équipes marquent plus facilement) :
  A. repos court (au plus 4 jours depuis le dernier match de championnat, pour l'une des deux équipes) ;
  B. grosse équipe (top 4 Elo de son championnat, donc souvent engagée en Coupe d'Europe) en repos court, et de février à mai ;
  C. face-à-face riche en buts (au moins 5 confrontations passées, plus de 2,5 buts dans 70 % ou plus) ou pauvre (30 % ou moins) ;
  D. face-à-face dominé (au moins 5 confrontations, l'équipe à domicile a pris 2 points par match ou plus).
Juge : résultat réel moins probabilité de clôture Pinnacle sans marge (plus de 2,5 buts ; les deux marquent, déduit de Pinnacle 1N2 +
plus/moins de 2,5 par une loi de Poisson recalée ; victoire à domicile). Un résidu nul = le marché intègre déjà l'effet.
Données : data/closing.csv (2024-26) + historique complet pour le repos et les face-à-face. Sortie : out/lab14.json.
Usage : python lab14_contexte.py /tmp/xg/data .
"""
import json, math, sys
from pathlib import Path
import numpy as np, pandas as pd
from scipy.optimize import minimize
sys.path.insert(0, str(Path(__file__).parent / "pipeline"))
from h2h_build import history
XG, ROOT = Path(sys.argv[1]), Path(sys.argv[2]) if len(sys.argv) > 2 else Path(".")
rng = np.random.default_rng(14)
def shin(o):
    q = 1 / np.asarray(o, float); S = q.sum(); lo, hi = 0.0, 0.4
    for _ in range(60):
        z = (lo + hi) / 2; p = (np.sqrt(z * z + 4 * (1 - z) * q * q / S) - z) / (2 * (1 - z)); lo, hi = (z, hi) if p.sum() > 1 else (lo, z)
    return p
def pois_grid(l, m, n=11):
    i = np.arange(n); ph = np.exp(-l) * l ** i / np.array([math.factorial(k) for k in i]); pa = np.exp(-m) * m ** i / np.array([math.factorial(k) for k in i]); return np.outer(ph, pa)
I, J = np.meshgrid(np.arange(11), np.arange(11), indexing="ij")
def btts_from_market(pH, pA, pO):
    def loss(x):
        G = pois_grid(math.exp(x[0]), math.exp(x[1])); return ((G[I > J].sum() - pH) ** 2 + (G[I < J].sum() - pA) ** 2 + (G[I + J > 2].sum() - pO) ** 2)
    r = minimize(loss, [0.3, 0.1], method="Nelder-Mead", options=dict(xatol=1e-4, fatol=1e-9)); G = pois_grid(math.exp(r.x[0]), math.exp(r.x[1]))
    return float(G[(I > 0) & (J > 0)].sum())
def boot(d, n=2000):
    d = np.asarray(d, float); b = [d[rng.integers(0, len(d), len(d))].mean() for _ in range(n)]; return [float(np.percentile(b, 2.5)), float(np.percentile(b, 97.5))]

H = history(XG, ROOT)
C = pd.read_csv(ROOT / "data" / "closing.csv", parse_dates=["Date"]).dropna(subset=["PSCH", "PSCD", "PSCA", "PC>2.5", "PC<2.5", "FTHG", "FTAG"]).reset_index(drop=True)
Mx = pd.read_csv(XG / "Matches.csv", low_memory=False, parse_dates=["MatchDate"], usecols=["Division", "MatchDate", "HomeTeam", "AwayTeam", "HomeElo", "AwayElo"])
# repos : jours depuis le dernier match de championnat de chaque équipe
last = {}; rest = {}
for r in H.itertuples():
    for t in (r.home, r.away):
        if t in last: rest[(r.date, t)] = (r.date - last[t]).days
        last[t] = r.date
# Elo : rang dans le championnat au moment du match (dernière valeur connue)
elo = {}
for r in Mx.dropna(subset=["HomeElo", "AwayElo"]).itertuples(): elo[(r.Division, r.HomeTeam)] = (r.MatchDate, r.HomeElo); elo[(r.Division, r.AwayTeam)] = (r.MatchDate, r.AwayElo)
top4 = {}
for div in Mx.Division.unique():
    v = sorted([(e[1], t) for (d, t), e in elo.items() if d == div], reverse=True)[:4]; top4[div] = {t for _, t in v}
rows = []
for r in C.itertuples():
    h, a, d = r.HomeTeam, r.AwayTeam, r.Date
    pH, pD, pA = shin([r.PSCH, r.PSCD, r.PSCA]); pO = shin([C.at[r.Index, "PC>2.5"], C.at[r.Index, "PC<2.5"]])[0]
    past = H[(H.date < d) & (((H.home == h) & (H.away == a)) | ((H.home == a) & (H.away == h)))]
    gh = np.where(past.home == h, past.hg, past.ag); ga = np.where(past.home == h, past.ag, past.hg)
    rh, ra = rest.get((d, h)), rest.get((d, a))
    rows.append(dict(div=r.Div, date=d, hg=r.FTHG, ag=r.FTAG, pH=pH, pO=pO, rh=rh, ra=ra, big=(h in top4.get(r.Div, set())) or (a in top4.get(r.Div, set())),
                     n_h2h=len(past), h2h_o25=float(np.mean(gh + ga > 2.5)) if len(past) else np.nan, h2h_ppg=float(np.mean(np.where(gh > ga, 3, np.where(gh == ga, 1, 0)))) if len(past) else np.nan))
D = pd.DataFrame(rows)
print("matchs", len(D), "; calcul des probabilités « les deux marquent » du marché…", flush=True)
# « Les deux marquent » du marché, comme la page : matrice Dixon-Coles du moteur recalée par ajustement proportionnel sur Pinnacle 1N2 + plus/moins de 2,5
E = pd.read_csv(ROOT / "out" / "engine3_preds.csv", parse_dates=["date"]); NM = {"F1": "fr.1", "E0": "en.1", "SP1": "es.1", "D1": "de.1", "I1": "it.1", "P1": "pt.1", "N1": "nl.1", "E1": "en.2"}
D["league"] = D["div"].map(NM); D["home"] = C.HomeTeam; D["away"] = C.AwayTeam
D = D.merge(E[["league", "date", "home", "away", "lam", "mu", "rho"]], on=["league", "date", "home", "away"], how="inner")
pD_ = np.array([shin([a, b, c])[1] for a, b, c in C.set_index(["HomeTeam", "AwayTeam", "Date"]).loc[list(zip(D.home, D.away, D.date)), ["PSCH", "PSCD", "PSCA"]].to_numpy(float)])
def dc_matrix(l, m, rho, n=11):
    G = pois_grid(l, m, n); G[0, 0] *= 1 - l * m * rho; G[0, 1] *= 1 + l * rho; G[1, 0] *= 1 + m * rho; G[1, 1] *= 1 - rho; return G / G.sum()
def ipf_btts(l, m, rho, pH, pD, pO):
    G = dc_matrix(l, m, rho); T = [pH, pD, 1 - pH - pD]; masks = [I > J, I == J, I < J]; over = I + J > 2
    for _ in range(40):
        for t, mk in zip(T, masks): G[mk] *= t / G[mk].sum()
        o = G[over].sum(); G[over] *= pO / o; G[~over] *= (1 - pO) / (1 - o)
    return float(G[(I > 0) & (J > 0)].sum())
D["pB"] = [ipf_btts(l, m, r_, h_, d_, o_) for l, m, r_, h_, d_, o_ in zip(D.lam, D.mu, D.rho, D.pH, pD_, D.pO)]
D = D.dropna(subset=["pO", "pB"]).reset_index(drop=True)
D["o25"] = (D.hg + D.ag > 2).astype(float); D["btts"] = ((D.hg > 0) & (D.ag > 0)).astype(float); D["hw"] = (D.hg > D.ag).astype(float)
D["r_o25"] = D.o25 - D.pO; D["r_btts"] = D.btts - D.pB; D["r_hw"] = D.hw - D.pH
short = (D.rh <= 4) | (D.ra <= 4); norm = (D.rh >= 6) & (D.ra >= 6); late = D.date.dt.month.isin([2, 3, 4, 5])
G = {"tous les matchs": np.ones(len(D), bool), "A. repos court (≤ 4 j, l'une des deux)": short.to_numpy(), "A. repos normal (≥ 6 j, les deux)": norm.to_numpy(),
     "B. grosse équipe en repos court": (short & D.big).to_numpy(), "B. grosse équipe, février à mai": (late & D.big).to_numpy(),
     "C. face-à-face riche en buts (≥ 70 % de +2,5)": ((D.n_h2h >= 5) & (D.h2h_o25 >= 0.7)).to_numpy(), "C. face-à-face pauvre en buts (≤ 30 %)": ((D.n_h2h >= 5) & (D.h2h_o25 <= 0.3)).to_numpy(),
     "D. face-à-face dominé par l'équipe à domicile": ((D.n_h2h >= 5) & (D.h2h_ppg >= 2)).to_numpy()}
R = dict(n=int(len(D)), periode=[str(D.date.min().date()), str(D.date.max().date())], groupes=[])
for lab, m in G.items():
    g = D[m]
    if len(g) < 40: continue
    e = dict(groupe=lab, n=int(len(g)))
    for k, lab2 in (("o25", "plus de 2,5 buts"), ("btts", "les deux marquent"), ("hw", "victoire à domicile")):
        p = {"o25": g.pO, "btts": g.pB, "hw": g.pH}[k]; r_ = g[f"r_{k}"]
        e[k] = dict(reel=float(g[k].mean()), marche=float(p.mean()), residu=float(r_.mean()), ic=boot(r_.to_numpy(), 1500))
        e[k]["prouve"] = bool(e[k]["ic"][0] > 0 or e[k]["ic"][1] < 0)
    R["groupes"].append(e)
    print(f"{lab:<50} n={len(g):<5}", "  ".join(f"{k} réel {e[k]['reel']*100:4.1f} marché {e[k]['marche']*100:4.1f} résidu {e[k]['residu']*100:+4.1f} [{e[k]['ic'][0]*100:+.1f};{e[k]['ic'][1]*100:+.1f}]" for k in ("o25", "btts", "hw")))
# Calibration « les deux marquent » : résidu par tranche, et recalage logistique appris sur 2024-25, testé sur 2025-26
D["bk"] = pd.cut(D.pB, [0, 0.4, 0.5, 0.6, 1], labels=["< 40 %", "40–50 %", "50–60 %", "≥ 60 %"])
R["btts_tranches"] = [dict(tranche=str(k), n=int(len(g)), annonce=float(g.pB.mean()), reel=float(g.btts.mean())) for k, g in D.groupby("bk", observed=True)]
from sklearn.linear_model import LogisticRegression
lg = lambda p: np.log(np.clip(p, 1e-4, 1 - 1e-4) / (1 - np.clip(p, 1e-4, 1 - 1e-4)))
tr, te = (D.date < "2025-07-01").to_numpy(), (D.date >= "2025-07-01").to_numpy()
cal = LogisticRegression(C=100).fit(lg(D.pB[tr]).to_numpy().reshape(-1, 1), D.btts[tr]); a_, b_ = float(cal.intercept_[0]), float(cal.coef_[0][0])
p2 = 1 / (1 + np.exp(-(a_ + b_ * lg(D.pB[te]).to_numpy()))); y = D.btts[te].to_numpy(); b0 = (D.pB[te].to_numpy() - y) ** 2; b1 = (p2 - y) ** 2
R["btts_recalage"] = dict(a=a_, b=b_, n_test=int(te.sum()), brier_avant=float(b0.mean()), brier_apres=float(b1.mean()), gain_pm=float((b0 - b1).mean() * 1000), ic_pm=[x * 1000 for x in boot(b0 - b1)],
                          moyenne_annoncee_test=float(D.pB[te].mean()), moyenne_recalee_test=float(p2.mean()), reel_test=float(y.mean()))
print(json.dumps(R["btts_tranches"], ensure_ascii=False)); print(json.dumps(R["btts_recalage"], ensure_ascii=False))
json.dump(R, open(ROOT / "out" / "lab14.json", "w"), ensure_ascii=False, indent=1)
