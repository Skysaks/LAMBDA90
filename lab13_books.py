"""Laboratoire 13 : rétro-ingénierie des algorithmes de prix des bookmakers, sur nos propres données de cotes.
Sources : data/closing.csv (Pinnacle et Bet365, ouverture et clôture, résultats, 2024-26), data/odds_history.json (instantanés des
bookmakers français), out/feed_odds.json (27 bookmakers, dernier relevé).
Questions :
  1. Combien chaque bookmaker prélève, et sur quelles issues (favoris, nul, outsiders) : la structure de sa marge.
  2. Comment il répartit sa marge : multiplicative, additive, puissance, rapport de cotes ou Shin (méthode qui reproduit le mieux ses cotes
     à partir du prix juste Pinnacle).
  3. Quelle méthode de retrait de marge prédit le mieux les résultats (RPS) : utile quand Pinnacle manque.
  4. Qui fait le prix, qui suit : à l'ouverture, quand Bet365 et Pinnacle divergent, lequel des deux bouge vers l'autre avant la clôture.
  5. Même marque, autre pays : le surcoût français (Winamax FR contre DE, Unibet FR contre SE et NL).
  6. Qui copie qui : groupes de bookmakers aux probabilités quasi identiques (même fournisseur de cotes).
  7. Biais clubs populaires (Forrest et Simmons) : les grands clubs ont-ils des cotes plus généreuses chez Bet365 ?
  8. Le test d'argent : jouer Bet365 quand sa cote dépasse le prix juste Pinnacle du même moment, réglé sur les vrais résultats.
Sortie : out/lab13.json. Usage : python lab13_books.py .
"""
import json, math, sys
from collections import defaultdict
from pathlib import Path
import numpy as np, pandas as pd
from scipy.optimize import brentq
ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
rng = np.random.default_rng(13)

# ---------- méthodes de marge ----------
def q_of(o): return 1 / np.asarray(o, float)
def devig(o, m):
    q = q_of(o); S = q.sum(); n = len(q)
    if m == "mult": return q / S
    if m == "add": return q - (S - 1) / n
    if m == "power":
        k = brentq(lambda k: (q ** k).sum() - 1, 0.5, 3); return q ** k
    if m == "or":
        f = lambda c: (q / (c + q - c * q)).sum() - 1; c = brentq(f, 0.5, 3); return q / (c + q - c * q)
    if m == "shin":
        lo, hi = 0.0, 0.4
        for _ in range(60):
            z = (lo + hi) / 2; p = (np.sqrt(z * z + 4 * (1 - z) * q * q / S) - z) / (2 * (1 - z))
            lo, hi = (z, hi) if p.sum() > 1 else (lo, z)
        return p
def revig(p, S, m):
    """Cotes implicites (1/o) qu'appliquerait la méthode m pour une somme S, à partir du prix juste p."""
    p = np.asarray(p, float); n = len(p)
    if m == "mult": return p * S
    if m == "add": return p + (S - 1) / n
    if m == "power":
        k = brentq(lambda k: (p ** k).sum() - S, 0.2, 1.0001); return p ** k
    if m == "or":
        c = brentq(lambda c: (c * p / (1 - p + c * p)).sum() - S, 1, 5); return c * p / (1 - p + c * p)
    if m == "shin":
        z = brentq(lambda z: np.sqrt((1 - z) * p * p + z * p).sum() - math.sqrt(S), 0, 0.5); return np.sqrt(S * ((1 - z) * p * p + z * p))
METHODS = ["mult", "add", "power", "or", "shin"]
MLAB = {"mult": "multiplicative (marge égale en %)", "add": "additive (même nombre de points retiré à chaque issue)", "power": "puissance (plus de marge sur les outsiders)",
        "or": "rapport de cotes (plus de marge sur les outsiders)", "shin": "Shin (marge pour se protéger des initiés, surtout sur les outsiders)"}
def rps(P, y):
    O = np.zeros_like(P); O[np.arange(len(y)), y] = 1
    return (((np.cumsum(P, 1)[:, :-1] - np.cumsum(O, 1)[:, :-1]) ** 2).sum(1) / 2)
def boot(d, n=2000):
    d = np.asarray(d, float); b = [d[rng.integers(0, len(d), len(d))].mean() for _ in range(n)]
    return [float(np.percentile(b, 2.5)), float(np.percentile(b, 97.5))]
def bucket(p, k):
    if k == 1: return "nul"
    return "favori (≥ 55 %)" if p >= 0.55 else "équilibré (30–55 %)" if p >= 0.30 else "outsider (< 30 %)"

R = {}
C = pd.read_csv(ROOT / "data" / "closing.csv").dropna(subset=["PSH", "PSD", "PSA", "PSCH", "PSCD", "PSCA", "B365H", "B365D", "B365A", "B365CH", "B365CD", "B365CA", "FTHG", "FTAG"]).reset_index(drop=True)
y = np.select([C.FTHG > C.FTAG, C.FTHG == C.FTAG], [0, 1], 2)
PO, PC, BO, BC = (C[c].to_numpy(float) for c in (["PSH", "PSD", "PSA"], ["PSCH", "PSCD", "PSCA"], ["B365H", "B365D", "B365A"], ["B365CH", "B365CD", "B365CA"]))
FPO = np.array([devig(o, "shin") for o in PO]); FPC = np.array([devig(o, "shin") for o in PC])
R["n_matchs"] = int(len(C)); R["periode"] = [str(C.Date.min()), str(C.Date.max())]

# 1 + 7. Structure de la marge Bet365 (attendue contre Pinnacle clôture, et réalisée sur les résultats)
rows = []
for i in range(len(C)):
    for k in range(3):
        rows.append(dict(p=FPC[i, k], b=bucket(FPC[i, k], k), ev_open=FPC[i, k] * BO[i, k] - 1, ev_close=FPC[i, k] * BC[i, k] - 1, won=int(y[i] == k), o=BO[i, k], home=C.HomeTeam[i], away=C.AwayTeam[i], side=k))
T = pd.DataFrame(rows); T["ret"] = T.won * T.o - 1
R["bet365_structure"] = [dict(profil=b, n=int(len(g)), ev_attendu=float(g.ev_open.mean()), ev_cloture=float(g.ev_close.mean()), roi_reel=float(g.ret.mean()), roi_ic=boot(g.ret.to_numpy(), 1000))
                         for b, g in T.groupby("b")]
R["marges_closing"] = dict(pinnacle_ouv=float((q_of(PO).sum(1) - 1).mean()), pinnacle_clo=float((q_of(PC).sum(1) - 1).mean()), bet365_ouv=float((q_of(BO).sum(1) - 1).mean()), bet365_clo=float((q_of(BC).sum(1) - 1).mean()))

# 2. Méthode de marge de Bet365 (reproduire ses cotes depuis le prix juste Pinnacle du même moment)
def ident(fair, books):
    err = {m: [] for m in METHODS}
    for p, o in zip(fair, books):
        q = q_of(o); S = q.sum()
        if not (1.0 < S < 1.35): continue
        for m in METHODS:
            try: err[m].append(np.abs(revig(p, S, m) - q).mean())
            except ValueError: pass
    out = {m: float(np.mean(v)) * 100 for m, v in err.items() if v}
    return dict(erreur_pts=out, meilleure=min(out, key=out.get) if out else None, n=len(next(iter(err.values()))))
R["bet365_methode"] = dict(ouverture=ident(FPO, BO), cloture=ident(FPC, BC))

# 3. Retrait de marge le plus prédictif
def pred_block(odds):
    out = {}
    base = None
    for m in METHODS:
        P = np.array([devig(o, m) for o in odds]); P = np.clip(P, 1e-6, 1); P /= P.sum(1, keepdims=True); r = rps(P, y)
        out[m] = r; base = out.get("mult")
    res = {m: dict(rps=float(v.mean()), gain_vs_mult_pm=float((out["mult"] - v).mean() * 1000), ic=[x * 1000 for x in boot(out["mult"] - v, 1000)]) for m, v in out.items()}
    return res
R["devig_predictif"] = dict(bet365_ouverture=pred_block(BO), pinnacle_ouverture=pred_block(PO), pinnacle_cloture=pred_block(PC))

# 4. Qui fait le prix : écart d'ouverture Bet365 – Pinnacle (proba domicile sans marge), et qui le comble avant la clôture
FBO = np.array([devig(o, "shin") for o in BO]); FBC = np.array([devig(o, "shin") for o in BC])
gap = FBO[:, 0] - FPO[:, 0]; mP = FPC[:, 0] - FPO[:, 0]; mB = FBC[:, 0] - FBO[:, 0]
big = np.abs(gap) >= 0.02
def slope(x, yv): return float((x * yv).sum() / (x * x).sum())
R["qui_fait_le_prix"] = dict(n=int(big.sum()), part_ecart_comblee_par_pinnacle=slope(gap[big], mP[big]), part_ecart_comblee_par_bet365=slope(-gap[big], mB[big]),
                            beta_suivi_bet365=slope(mP, mB), correlation_mouvements=float(np.corrcoef(mP, mB)[0, 1]),
                            ecart_moyen_ouverture_pts=float(np.abs(gap).mean() * 100), ecart_moyen_cloture_pts=float(np.abs(FBC[:, 0] - FPC[:, 0]).mean() * 100))

# 8. Test d'argent : Bet365 au-dessus du prix juste Pinnacle du même instant
money = []
for lab, B, F in (("ouverture", BO, FPO), ("clôture", BC, FPC)):
    for th in (0.0, 0.02, 0.04, 0.06):
        sel = []
        for i in range(len(C)):
            for k in range(3):
                ev = F[i, k] * B[i, k] - 1
                if ev > th and B[i, k] < 8: sel.append((B[i, k] * (y[i] == k) - 1, ev, FPC[i, k] * B[i, k] - 1))
        if not sel: continue
        a = np.array(sel); money.append(dict(moment=lab, seuil=th, paris=int(len(a)), ev_annonce=float(a[:, 1].mean()), clv_vs_pinnacle_cloture=float(a[:, 2].mean()), roi=float(a[:, 0].mean()), roi_ic=boot(a[:, 0], 1000)))
R["test_argent_bet365"] = money

# 7. Clubs populaires
POP = {"Paris SG", "Marseille", "Lyon", "Man United", "Liverpool", "Arsenal", "Chelsea", "Man City", "Tottenham", "Real Madrid", "Barcelona", "Ath Madrid", "Bayern Munich", "Dortmund",
       "Juventus", "Inter", "Milan", "Roma", "Napoli", "Benfica", "Porto", "Sp Lisbon", "Ajax", "PSV Eindhoven", "Feyenoord", "Leeds", "Sunderland"}
T["pop"] = np.where(T.side == 0, T.home.isin(POP), np.where(T.side == 2, T.away.isin(POP), False))
T["vs_pop"] = np.where(T.side == 0, T.away.isin(POP), np.where(T.side == 2, T.home.isin(POP), False))
popr = []
for b, g in T[T.side != 1].groupby("b"):
    for lab, m in (("sur le club populaire", g["pop"]), ("contre le club populaire", g["vs_pop"]), ("aucun club populaire", ~(g["pop"] | g["vs_pop"]))):
        h = g[m.astype(bool)]
        if len(h) >= 30: popr.append(dict(profil=b, cas=lab, n=int(len(h)), ev_attendu=float(h.ev_open.mean()), roi_reel=float(h.ret.mean()), roi_ic=boot(h.ret.to_numpy(), 1000)))
R["clubs_populaires"] = popr
pp = T[(T.side != 1)]; d_pop = pp[pp["pop"].astype(bool)].ev_open.to_numpy(); d_oth = pp[~(pp["pop"] | pp["vs_pop"]).astype(bool)].ev_open.to_numpy()
R["clubs_populaires_ecart"] = dict(ev_pop=float(d_pop.mean()), ev_autres=float(d_oth.mean()), n_pop=int(len(d_pop)))

# ---------- Bookmakers français et européens : dernier relevé et instantanés ----------
F = json.load(open(ROOT / "out" / "feed_odds.json")); H = json.load(open(ROOT / "data" / "odds_history.json")) if (ROOT / "data" / "odds_history.json").exists() else {}
def h2h(e, b):
    o = {}
    for m in b.get("markets", []):
        if m["key"] == "h2h":
            for x in m["outcomes"]: o["H" if x["name"] == e["home_team"] else "A" if x["name"] == e["away_team"] else "D"] = x["price"]
        if m["key"] == "totals":
            for x in m["outcomes"]:
                if abs(float(x.get("point", 0)) - 2.5) < 1e-9: o["O" if x["name"] == "Over" else "U"] = x["price"]
    return o
books = defaultdict(lambda: dict(m1=[], m2=[], ev=defaultdict(list), fair=[], q=[], probs={}))
for e in F["events"]:
    B = {b["title"]: h2h(e, b) for b in e["bookmakers"] if b.get("src") != "fd"}
    pin = B.get("Pinnacle")
    if not pin or not all(pin.get(k, 0) > 1 for k in "HDA"): continue
    fair = devig([pin["H"], pin["D"], pin["A"]], "shin")
    for t, o in B.items():
        if not all(o.get(k, 0) > 1 for k in "HDA"): continue
        v = [o["H"], o["D"], o["A"]]; S = q_of(v).sum(); X = books[t]
        X["m1"].append(S - 1); X["fair"].append(fair); X["q"].append(v); X["probs"][e["id"]] = q_of(v) / S
        if o.get("O", 0) > 1 and o.get("U", 0) > 1: X["m2"].append(1 / o["O"] + 1 / o["U"] - 1)
        for k in range(3): X["ev"][bucket(fair[k], k)].append(fair[k] * v[k] - 1)
prof = []
for t, X in books.items():
    if len(X["m1"]) < 15 or t == "Pinnacle": continue
    idn = ident(X["fair"], X["q"])
    prof.append(dict(book=t, n=len(X["m1"]), marge_1n2=float(np.mean(X["m1"])), marge_buts=float(np.mean(X["m2"])) if X["m2"] else None,
                     ev={b: float(np.mean(v)) for b, v in X["ev"].items()}, methode=idn["meilleure"], erreur_pts=idn["erreur_pts"]))
prof.sort(key=lambda r: r["marge_1n2"]); R["profils"] = prof

# 7 bis. Clubs populaires chez les bookmakers français (dernier relevé, attendu seulement)
import re
POPRX = re.compile(r"Paris Saint|Marseille|^Lyon|Manchester United|Liverpool|Arsenal|Chelsea|Manchester City|Tottenham|Real Madrid|Barcelona|Atl[eé]tico Madrid|Bayern|Dortmund|Juventus|Inter Milan|AC Milan|AS Roma|Napoli|Benfica|FC Porto|Sporting|Ajax|PSV|Feyenoord|Leeds|Sunderland")
popfr = defaultdict(lambda: defaultdict(list))
for e in F["events"]:
    B = {b["title"]: h2h(e, b) for b in e["bookmakers"] if b.get("src") != "fd"}; pin = B.get("Pinnacle")
    if not pin or not all(pin.get(k, 0) > 1 for k in "HDA"): continue
    fair = devig([pin["H"], pin["D"], pin["A"]], "shin"); hp, ap = bool(POPRX.search(e["home_team"])), bool(POPRX.search(e["away_team"]))
    for k, side_pop, opp_pop in ((0, hp, ap), (2, ap, hp)):
        if fair[k] >= 0.30: continue
        cas = "contre un club populaire" if opp_pop and not side_pop else "sans club populaire" if not (hp or ap) else None
        if not cas: continue
        for t in ("Winamax (FR)", "Betclic (FR)", "Unibet (FR)", "PMU (FR)", "Bet365"):
            o = B.get(t, {}).get("HDA"[k])
            if o and o > 1: popfr[t][cas].append(fair[k] * o - 1)
R["clubs_populaires_fr"] = [dict(book=t, cas=c, n=len(v), ev_attendu=float(np.mean(v))) for t, d in popfr.items() for c, v in d.items() if len(v) >= 8]

# 5. Même marque, autre pays
pairs = []
for a, b in (("Winamax (FR)", "Winamax (DE)"), ("Unibet (FR)", "Unibet (SE)"), ("Unibet (FR)", "Unibet (NL)")):
    if a in books and b in books:
        ids = set(books[a]["probs"]) & set(books[b]["probs"])
        ma, mb = np.mean(books[a]["m1"]), np.mean(books[b]["m1"])
        diff = np.mean([np.abs(books[a]["probs"][i] - books[b]["probs"][i]).mean() for i in ids]) if ids else None
        pairs.append(dict(fr=a, etranger=b, marge_fr=float(ma), marge_etranger=float(mb), ecart_opinion_pts=float(diff * 100) if diff is not None else None, n=len(ids)))
R["meme_marque"] = pairs

# 6. Qui copie qui : distance moyenne entre probabilités sans marge
names = [t for t, X in books.items() if len(X["probs"]) >= 40]
D = {}
for i, a in enumerate(names):
    for b in names[i + 1:]:
        ids = set(books[a]["probs"]) & set(books[b]["probs"])
        if len(ids) >= 30: D[(a, b)] = float(np.mean([np.abs(books[a]["probs"][j] - books[b]["probs"][j]).mean() for j in ids]) * 100)
near = sorted(D.items(), key=lambda kv: kv[1])
R["jumeaux_de_prix"] = [dict(a=a, b=b, ecart_pts=v) for (a, b), v in near[:12]]
R["plus_eloignes_de_pinnacle"] = sorted([dict(book=t, ecart_pts=v) for (a, b), v in D.items() for t in (a, b) if "Pinnacle" in (a, b) and t != "Pinnacle"], key=lambda r: r["ecart_pts"])

# 4 bis. Suivi de Pinnacle par les bookmakers français entre deux instantanés
lag = defaultdict(lambda: [[], []])
for e in H.values():
    S_ = e.get("snaps", [])
    for s0, s1 in zip(S_, S_[1:]):
        p0, p1 = s0["b"].get("Pinnacle"), s1["b"].get("Pinnacle")
        if not p0 or not p1 or not all(p0.get(k, 0) > 1 and p1.get(k, 0) > 1 for k in "HDA"): continue
        f0, f1 = devig([p0[k] for k in "HDA"], "shin"), devig([p1[k] for k in "HDA"], "shin"); dp = f1 - f0
        if np.abs(dp).max() < 0.01: continue
        for t in ("Winamax (FR)", "Betclic (FR)", "Unibet (FR)", "PMU (FR)"):  # Bet365 exclu : sa source (fixtures.csv) n'est mise à jour que deux fois par semaine
            b0, b1 = s0["b"].get(t), s1["b"].get(t)
            if not b0 or not b1 or not all(b0.get(k, 0) > 1 and b1.get(k, 0) > 1 for k in "HDA"): continue
            db = devig([b1[k] for k in "HDA"], "mult") - devig([b0[k] for k in "HDA"], "mult"); lag[t][0] += list(dp); lag[t][1] += list(db)
R["suivi_pinnacle_fr"] = [dict(book=t, n_mouvements=len(v[0]) // 3, beta=slope(np.array(v[0]), np.array(v[1]))) for t, v in lag.items() if len(v[0]) >= 15]

json.dump(R, open(ROOT / "out" / "lab13.json", "w"), ensure_ascii=False, indent=1, default=float)
print(json.dumps({k: v for k, v in R.items() if k not in ("profils",)}, ensure_ascii=False, indent=1, default=float)[:9000])
for r in prof: print(f"{r['book']:<20} n={r['n']:<4} marge {r['marge_1n2']*100:5.1f} %  buts {'' if r['marge_buts'] is None else f'{r[chr(109)+chr(97)+chr(114)+chr(103)+chr(101)+chr(95)+chr(98)+chr(117)+chr(116)+chr(115)]*100:5.1f} %'}  méthode {r['methode']}  " + "  ".join(f"{b} {v*100:+.1f}" for b, v in sorted(r['ev'].items())))

# ---------- 9. Améliorer la probabilité de référence avec la structure des prix ----------
# Pinnacle d'ouverture seul (méthode actuelle), contre empilements appris sur 2024-25 et testés sur 2025-26 :
# Pinnacle + Bet365 (l'écart d'avis entre teneur de marché et suiveur), + modèle Lambda 90.
from sklearn.linear_model import LogisticRegression
E = pd.read_csv(ROOT / "out" / "engine3_preds.csv")
NM = {"F1": "fr.1", "E0": "en.1", "SP1": "es.1", "D1": "de.1", "I1": "it.1", "P1": "pt.1", "N1": "nl.1", "E1": "en.2"}
C2 = C.assign(league=C.Div.map(NM), date=C.Date, home=C.HomeTeam, away=C.AwayTeam).reset_index(drop=True)
M = C2.merge(E[["league", "date", "home", "away", "pH", "pD", "pA"]], on=["league", "date", "home", "away"], how="inner")
idx = M.index.to_numpy(); yy = np.select([M.FTHG > M.FTAG, M.FTHG == M.FTAG], [0, 1], 2)
PinO = np.array([devig(o, "shin") for o in M[["PSH", "PSD", "PSA"]].to_numpy(float)]); B3O = np.array([devig(o, "shin") for o in M[["B365H", "B365D", "B365A"]].to_numpy(float)])
MOD = M[["pH", "pD", "pA"]].to_numpy(float); MOD = MOD / MOD.sum(1, keepdims=True)
lg_ = lambda P: np.column_stack([np.log(P[:, 0] / P[:, 1]), np.log(P[:, 2] / P[:, 1])])
tr = (M.date < "2025-07-01").to_numpy(); te = ~tr
def stack(feats):
    Z = np.column_stack(feats); c = LogisticRegression(C=10, max_iter=3000).fit(Z[tr], yy[tr]); return c.predict_proba(Z[te])
base = rps(PinO[te], yy[te]); cands = {"Pinnacle seul, réappris": stack([lg_(PinO)]), "Pinnacle + Bet365": stack([lg_(PinO), lg_(B3O)]),
    "Pinnacle + Bet365 + modèle": stack([lg_(PinO), lg_(B3O), lg_(MOD)]), "moyenne Pinnacle et Bet365": (PinO[te] + B3O[te]) / 2, "90 % Pinnacle + 10 % modèle (en place)": 0.9 * PinO[te] + 0.1 * MOD[te]}
R["reference_amelioree"] = dict(n_train=int(tr.sum()), n_test=int(te.sum()), rps_pinnacle=float(base.mean()),
    pistes={k: dict(rps=float(rps(v, yy[te]).mean()), gain_pm=float((base - rps(v, yy[te])).mean() * 1000), ic_pm=[x * 1000 for x in boot(base - rps(v, yy[te]), 2000)]) for k, v in cands.items()})
print(json.dumps(R["reference_amelioree"], ensure_ascii=False, indent=1))
json.dump(R, open(ROOT / "out" / "lab13.json", "w"), ensure_ascii=False, indent=1, default=float)
