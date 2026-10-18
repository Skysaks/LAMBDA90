"""Picks du jour, figés chaque matin puis réglés avec les résultats : le registre public honnête de Lambda 90.
- Top Picks (6 à 8) : la sélection la plus probable de chaque match du jour (vraie cote ≥ 1,25 chez mes bookmakers), probabilité
  = marché Pinnacle sans marge (Shin). Labo 13 : y mêler 5, 10 ou 20 % de modèle dégrade le RPS sur 2024-25 comme sur 2025-26. On garde aussi le pick « résultat » (1N2) et « double chance ».
- Hot Picks : prix de mes bookmakers proche ou au-dessus du prix juste Pinnacle, modèle d'accord, ou cote en retard sur un mouvement Pinnacle.
- Cold Games : matchs à éviter (issues trop serrées, modèle et marché en désaccord, marché qui a bougé fort, marge élevée chez mes bookmakers).
Entrées : out/engine3_out.json, out/feed_odds.json, data/recent.csv. Sortie : data/daily_picks.json (90 derniers jours).
Usage : python pipeline/daily_picks.py .  [--force]
"""
import json, math, sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent)); from names import best_pair
ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else Path(".")
FORCE = "--force" in sys.argv
LEDGER = ROOT / "data" / "daily_picks.json"
SPORT = {"soccer_france_ligue_one": "fr.1", "soccer_epl": "en.1", "soccer_spain_la_liga": "es.1", "soccer_germany_bundesliga": "de.1", "soccer_italy_serie_a": "it.1",
         "soccer_portugal_primeira_liga": "pt.1", "soccer_netherlands_eredivisie": "nl.1", "soccer_efl_champ": "en.2"}
DIV = {"fr.1": "F1", "en.1": "E0", "es.1": "SP1", "de.1": "D1", "it.1": "I1", "pt.1": "P1", "nl.1": "N1", "en.2": "E1"}
MY = {"bet365": "Bet365", "winamax_fr": "Winamax (FR)", "betclic_fr": "Betclic (FR)", "unibet_fr": "Unibet (FR)"}
# Cotes du jour (The Odds API, chaque matin). Bet365 vient d'un fichier mis à jour deux fois par semaine : jamais utilisé seul pour juger un prix.
FRESH = {k: v for k, v in MY.items() if k != "bet365"}
PARIS = timezone(timedelta(hours=2))  # heure d'été ; l'écart d'une heure en hiver ne change pas la journée de match

def shin(odds):
    q = [1 / o for o in odds]; S = sum(q); lo, hi = 0.0, 0.4
    pz = lambda z: [(math.sqrt(z * z + 4 * (1 - z) * x * x / S) - z) / (2 * (1 - z)) for x in q]
    for _ in range(80):
        m = (lo + hi) / 2
        if sum(pz(m)) > 1: lo = m
        else: hi = m
    return pz((lo + hi) / 2)

def dc_matrix(lam, mu, rho, n=11):
    pois = lambda k, l: math.exp(-l) * l ** k / math.factorial(k)
    M = [[pois(i, lam) * pois(j, mu) for j in range(n)] for i in range(n)]
    M[0][0] *= 1 - lam * mu * rho; M[0][1] *= 1 + lam * rho; M[1][0] *= 1 + mu * rho; M[1][1] *= 1 - rho
    s = sum(map(sum, M)); return [[x / s for x in r] for r in M]

def model_probs(f):
    M = dc_matrix(f["lam"], f["mu"], f.get("rho") or 0)
    H = sum(M[i][j] for i in range(11) for j in range(11) if i > j); D = sum(M[i][i] for i in range(11)); A = 1 - H - D
    O = sum(M[i][j] for i in range(11) for j in range(11) if i + j > 2)
    if f.get("ens") and len(f["ens"]) == 3: H, D, A = f["ens"]
    return {"H": H, "D": D, "A": A, "O25": O, "U25": 1 - O}

MODEL_W = 0.0  # poids du modèle dans la probabilité des picks (labo 13 : 0 est le meilleur)
FR_STALE_H = 30  # cotes françaises plus vieilles que ça : ignorées (elles ne sont rafraîchies qu'à la demande)
def book_odds(e, now=None):
    out = {}
    for b in e.get("bookmakers", []):
        if now is not None and b.get("key") in FRESH:
            try: age = (now - datetime.fromisoformat(b.get("last_update", "").replace("Z", "+00:00"))).total_seconds() / 3600
            except ValueError: age = 1e9
            if age > FR_STALE_H: continue
        o = {}
        for m in b.get("markets", []):
            if m["key"] == "h2h":
                for x in m["outcomes"]: o["H" if x["name"] == e["home_team"] else "A" if x["name"] == e["away_team"] else "D"] = x["price"]
            elif m["key"] == "totals":
                for x in m["outcomes"]:
                    if abs(float(x.get("point", 0)) - 2.5) < 1e-9: o["O25" if x["name"] == "Over" else "U25"] = x["price"]
        if o: out[b["key"]] = o
    return out

def fair_of(o):
    if not o or not all(o.get(k, 0) > 1 for k in "HDA"): return None
    h, d, a = shin([o["H"], o["D"], o["A"]]); r = {"H": h, "D": d, "A": a}
    if o.get("O25", 0) > 1 and o.get("U25", 0) > 1: r["O25"], r["U25"] = shin([o["O25"], o["U25"]])
    return r

def steam(e, k):
    """Variation de la probabilité Pinnacle sans marge entre le premier et le dernier relevé, et cote de mes bookmakers au premier relevé."""
    H = e.get("history") or []
    if len(H) < 2: return None
    first = next((s for s in H if "Pinnacle" in s["b"]), None); last = next((s for s in reversed(H) if "Pinnacle" in s["b"]), None)
    if not first or first is last: return None
    f0, f1 = fair_of(first["b"]["Pinnacle"]), fair_of(last["b"]["Pinnacle"])
    if not f0 or not f1 or k not in f0 or k not in f1: return None
    mine0 = max([first["b"].get(t, {}).get(k, 0) for t in FRESH.values()] or [0])
    return {"dp": f1[k] - f0[k], "mine0": mine0, "hours": (last["t"] - first["t"]) / 3.6e6}

LAB = {"H": "home", "D": "draw", "A": "away", "O25": "over", "U25": "under"}
def candidates(now):
    E = json.load(open(ROOT / "out" / "engine3_out.json"))["fixtures"]; feed = json.load(open(ROOT / "out" / "feed_odds.json"))
    rows = []
    for e in feed["events"]:
        lg = SPORT.get(e["sport_key"]); kick = datetime.fromisoformat(e["commence_time"].replace("Z", "+00:00"))
        if not lg or kick <= now: continue
        day = e["commence_time"][:10]
        cands = [(i, f["home"], f["away"]) for i, f in enumerate(E) if f["league"] == lg and abs((datetime.fromisoformat(f["date"]) - datetime.fromisoformat(day)).days) <= 1]
        k = best_pair(e["home_team"], e["away_team"], cands)
        if k is None: continue
        f = E[k]; B = book_odds(e, now); fair = fair_of(B.get("pinnacle"))
        if not fair: continue
        pmod = model_probs(f); pr = {s: (1 - MODEL_W) * fair[s] + MODEL_W * pmod[s] for s in fair}
        best, bestfr = {}, {}
        for s in fair:
            o, bk = max(((B.get(key, {}).get(s, 0), t) for key, t in MY.items()), default=(0, None))
            if o > 1: best[s] = (o, bk)
            o, bk = max(((B.get(key, {}).get(s, 0), t) for key, t in FRESH.items()), default=(0, None))
            if o > 1: bestfr[s] = (o, bk)
        fr = [B[key] for key in ("winamax_fr", "betclic_fr", "unibet_fr") if key in B and all(B[key].get(x, 0) > 1 for x in "HDA")]
        marg = sum(sum(1 / b[x] for x in "HDA") - 1 for b in fr) / len(fr) if fr else None
        dc = {"1N": pr["H"] + pr["D"], "N2": pr["D"] + pr["A"], "12": pr["H"] + pr["A"]}
        band = f.get("band"); bw = max(b[1] - b[0] for b in band) if band else None
        rows.append(dict(f=f, e=e, B=B, kick=kick, key=f"{f['league']}|{f['date']}|{f['home']}|{f['away']}", fair=fair, pmod=pmod, pr=pr, best=best, bestfr=bestfr, marg=marg, dc=dc, bw=bw))
    return rows

def pick_of(r):
    opts = [(r["pr"][s], s) for s in r["best"] if r["best"][s][0] >= 1.25]
    if not opts: return None
    p, s = max(opts); o, bk = r["best"][s]; ofr, bfr = r["bestfr"].get(s, (None, None))
    return dict(sel=s, p=round(p, 4), pm=round(r["fair"][s], 4), pmod=round(r["pmod"][s], 4), o=o, book=bk, ev=round(r["fair"][s] * o - 1, 4), ofr=ofr, bookfr=bfr)

def build_combos(top, rowmap):
    """Combinés du jour à partir des Top Picks (matchs différents, supposés indépendants) : le plus probable dans chaque fourchette de cote,
    au prix réel d'un seul bookmaker (cotes du jour d'abord, Bet365 seulement à défaut)."""
    from itertools import combinations
    legs = [l for l in top[:12] if l["key"] in rowmap]
    def price(cmb):
        for books in (FRESH, {"bet365": "Bet365"}):
            best = None
            for key, title in books.items():
                o = 1.0
                for l in cmb:
                    v = rowmap[l["key"]]["B"].get(key, {}).get(l["sel"], 0)
                    if not v or v <= 1: o = 0; break
                    o *= v
                if o > 1 and (best is None or o > best[0]): best = (o, title)
            if best: return best
        return None
    out, used, used_keys = [], set(), set()
    # Diversification : un même match ne sert qu'à un combiné quand c'est possible (le 17 octobre, PSV était dans les 4 combinés)
    for sid, lab, sizes, lo, hi in (("sur", "Combiné sûr", (2,), 1.3, 2.3), ("x2", "Combiné cote 2", (2, 3), 1.85, 2.5), ("x3", "Combiné cote 3", (2, 3, 4), 2.6, 3.8), ("x5", "Combiné cote 5", (3, 4, 5), 4.2, 7.0)):
        best = None
        for strict in (True, False):
            for n in sizes:
                for cmb in combinations(legs, n):
                    ks = frozenset((l["key"], l["sel"]) for l in cmb)
                    if ks in used or (strict and any(l["key"] in used_keys for l in cmb)): continue
                    pr = price(cmb)
                    if not pr or not (lo <= pr[0] <= hi): continue
                    p = math.prod(l["p"] for l in cmb)
                    if best is None or p > best[0]: best = (p, cmb, pr, ks)
            if best: break
        if best:
            p, cmb, (o, bk), ks = best; used.add(ks); used_keys.update(l["key"] for l in cmb); pm = math.prod(l["pm"] for l in cmb)
            out.append(dict(id=sid, lab=lab, o=round(o, 3), book=bk, p=round(p, 4), pm=round(pm, 4), ev=round(pm * o - 1, 4),
                            legs=[dict(key=l["key"], sel=l["sel"], home=l["home"], away=l["away"], league=l["league"], kick=l["kick"], p=l["p"]) for l in cmb]))
    return out

# ---------- Paris du jour par marché ----------
# Matrice des scores du moteur (Dixon-Coles) recalée sur Pinnacle 1N2 et plus/moins de 2,5, comme dans la page ;
# « les deux marquent » recalé (labo 14 : la matrice sous-estimait de 2 points, biais prouvé).
BTTS_CAL = (0.0965, 0.7415)
def score_matrix(f, fair, pO=None, n=11):
    lam, mu, rho = f["lam"], f["mu"], f.get("rho", 0.0)
    fac = [math.factorial(k) for k in range(n)]
    M = [[math.exp(-lam) * lam ** i / fac[i] * math.exp(-mu) * mu ** j / fac[j] for j in range(n)] for i in range(n)]
    M[0][0] *= 1 - lam * mu * rho; M[0][1] *= 1 + lam * rho; M[1][0] *= 1 + mu * rho; M[1][1] *= 1 - rho
    for _ in range(40):
        for g, t in ((lambda i, j: i > j, fair["H"]), (lambda i, j: i == j, fair["D"]), (lambda i, j: i < j, fair["A"])):
            sm = sum(M[i][j] for i in range(n) for j in range(n) if g(i, j))
            for i in range(n):
                for j in range(n):
                    if g(i, j): M[i][j] *= t / sm
        if pO:
            o = sum(M[i][j] for i in range(n) for j in range(n) if i + j > 2)
            for i in range(n):
                for j in range(n): M[i][j] *= pO / o if i + j > 2 else (1 - pO) / (1 - o)
    return M
CAT_SELS = {"dc": ("1N", "N2"), "dnb": ("DNBH", "DNBA"), "o15": ("O15",), "o25": ("O25",), "u25": ("U25",), "u35": ("U35",), "by": ("BY",), "bn": ("BN",)}
SELFN = {"1N": lambda i, j: i >= j, "N2": lambda i, j: i <= j, "O15": lambda i, j: i + j > 1, "O25": lambda i, j: i + j > 2, "U25": lambda i, j: i + j < 3,
         "U35": lambda i, j: i + j < 4, "BY": lambda i, j: i > 0 and j > 0, "BN": lambda i, j: i == 0 or j == 0}
def market_probs(r):
    pin = r["B"].get("pinnacle", {}); pO = None
    if pin.get("O25", 0) > 1 and pin.get("U25", 0) > 1: pO = shin([pin["O25"], pin["U25"]])[0]
    M = score_matrix(r["f"], r["fair"], pO); n = len(M)
    P = {s: sum(M[i][j] for i in range(n) for j in range(n) if fn(i, j)) for s, fn in SELFN.items()}
    lg = math.log(P["BY"] / (1 - P["BY"])); P["BY"] = 1 / (1 + math.exp(-(BTTS_CAL[0] + BTTS_CAL[1] * lg))); P["BN"] = 1 - P["BY"]
    pH, pD, pA = r["fair"]["H"], r["fair"]["D"], r["fair"]["A"]; P["DNBH"] = pH / (1 - pD); P["DNBA"] = pA / (1 - pD)
    return P
def build_cats(win):
    out = {c: [] for c in CAT_SELS}
    for r in win:
        try: P = market_probs(r)
        except (ValueError, ZeroDivisionError, OverflowError): continue
        for c, sels in CAT_SELS.items():
            s = max(sels, key=lambda x: P[x]); p = P[s]
            if not (0.5 <= p <= 0.8): continue
            o, bk = r["best"].get(s, (None, None)) if s in ("O25", "U25") else (None, None)
            out[c].append(dict(key=r["key"], kick=r["e"]["commence_time"], home=r["f"]["home"], away=r["f"]["away"], league=r["f"]["league"], sel=s, p=round(p, 4),
                               fo=round(1 / p, 2), o=o, book=bk, ev=round(p * o - 1, 4) if o else None))
    return {c: sorted(v, key=lambda x: -x["p"])[:6] for c, v in out.items()}

def build_day(now):
    rows = sorted(candidates(now), key=lambda r: r["kick"])
    today = now.astimezone(PARIS).date()
    win = [r for r in rows if r["kick"].astimezone(PARIS).date() == today]
    if len(win) < 6: win = [r for r in rows if r["kick"] <= now + timedelta(hours=36)]
    top = []
    for r in win:
        pk = pick_of(r)
        if not pk: continue
        res = max(("H", "D", "A"), key=lambda s: r["pr"][s]); dcs = max(r["dc"], key=r["dc"].get)
        top.append(dict(key=r["key"], kick=r["e"]["commence_time"], home=r["f"]["home"], away=r["f"]["away"], league=r["f"]["league"], **pk,
                        res=dict(sel=res, p=round(r["pr"][res], 4)), dc=dict(sel=dcs, p=round(r["dc"][dcs], 4))))
    top.sort(key=lambda x: -x["p"]); top = top[:15]
    combos = build_combos(top, {r["key"]: r for r in win})
    # Hot : prix proche du juste chez mes bookmakers, modèle d'accord ; bonus si Pinnacle a bougé vers l'issue sans que mes cotes suivent
    hot = []  # fenêtre de 48 h : plus de choix pour trouver les prix proches du juste
    for r in [r for r in rows if r["kick"] <= now + timedelta(hours=48)]:
        for s, (o, bk) in r["bestfr"].items():  # prix jugé sur les cotes du jour seulement
            p = r["fair"][s]
            if p < 0.28 or o < 1.3: continue
            ev = p * o - 1; agree = r["pmod"][s] - p; st = steam(r["e"], s); lag = bool(st and st["dp"] >= 0.015 and st["mine0"] and o >= st["mine0"] * 0.99)
            score = ev + 0.3 * max(-0.05, min(0.05, agree)) + (0.02 if lag else 0)
            if ev >= -0.04 and agree >= -0.05:
                hot.append(dict(key=r["key"], kick=r["e"]["commence_time"], home=r["f"]["home"], away=r["f"]["away"], league=r["f"]["league"], sel=s, p=round(r["pr"][s], 4),
                                pm=round(p, 4), pmod=round(r["pmod"][s], 4), o=o, book=bk, ev=round(ev, 4), lag=lag, b365=r["best"].get(s, (None, None))[0] if r["best"].get(s, (0, ""))[1] == "Bet365" else None, dp=round(st["dp"], 4) if st else None, score=round(score, 4)))
    hot.sort(key=lambda x: -x["score"]); seen = set(); hot2 = []
    for h in hot:
        if h["key"] in seen: continue
        seen.add(h["key"]); hot2.append(h)
        if len(hot2) >= 8: break
    # Cold : score d'incertitude et de cherté, chaque critère est un argument affiché
    cold = []
    for r in win:
        why, sc = [], 0.0
        mx = max(r["fair"][s] for s in "HDA")
        if mx < 0.42: sc += 1; why.append(["flat", round(mx, 3)])
        dis = max(("H", "D", "A"), key=lambda s: abs(r["pmod"][s] - r["fair"][s])); d = r["pmod"][dis] - r["fair"][dis]
        if abs(d) >= 0.06: sc += 1.5; why.append(["disagree", dis, round(d, 3)])
        if r["bw"] and r["bw"] >= 0.17: sc += 0.5; why.append(["band", round(r["bw"], 3)])
        if r["marg"] and r["marg"] >= 0.09: sc += 1; why.append(["margin", round(r["marg"], 3)])
        moves = [st for st in (steam(r["e"], s) for s in "HDA") if st]
        if moves:
            big = max(moves, key=lambda x: abs(x["dp"]))
            if abs(big["dp"]) >= 0.03: sc += 1; why.append(["move", round(big["dp"], 3)])
        if sc >= 1.5: cold.append(dict(key=r["key"], kick=r["e"]["commence_time"], home=r["f"]["home"], away=r["f"]["away"], league=r["f"]["league"], score=sc, why=why))
    cold.sort(key=lambda x: -x["score"]); cold = cold[:5]; ck = {c["key"] for c in cold}
    hot2 = [h for h in hot2 if h["key"] not in ck]
    return dict(made=now.isoformat(timespec="minutes"), window=len(win), top=top, combos=combos, hot=hot2[:5], cold=cold, cats=build_cats(win))

def settle(L, now):
    try:
        import csv; R = list(csv.DictReader(open(ROOT / "data" / "recent.csv")))
    except FileNotFoundError: return 0
    n = 0
    for day, D in L.items():
        for it in D.get("top", []) + D.get("hot", []) + D.get("cold", []) + [x for v in D.get("cats", {}).values() for x in v]:
            if "hg" in it: continue
            kick = datetime.fromisoformat(it["kick"].replace("Z", "+00:00"))
            if kick > now - timedelta(hours=2, minutes=30): continue
            cands = [(i, r["home"], r["away"]) for i, r in enumerate(R) if r["Division"] == DIV[it["league"]] and abs((datetime.fromisoformat(r["date"]) - kick.replace(tzinfo=None)).days) <= 1]
            k = best_pair(it["home"], it["away"], cands)
            if k is None: continue
            hg, ag = int(R[k]["hg"]), int(R[k]["ag"]); it["hg"], it["ag"] = hg, ag; n += 1
            ok = lambda s: {"H": hg > ag, "D": hg == ag, "A": hg < ag, "O15": hg + ag > 1, "O25": hg + ag > 2, "U25": hg + ag < 3, "U35": hg + ag < 4, "1N": hg >= ag, "N2": hg <= ag, "12": hg != ag,
                            "BY": hg > 0 and ag > 0, "BN": hg == 0 or ag == 0, "DNBH": None if hg == ag else hg > ag, "DNBA": None if hg == ag else ag > hg}[s]  # None : remboursé
            if "sel" in it: it["won"] = ok(it["sel"])
            if "res" in it: it["res"]["won"] = ok(it["res"]["sel"]); it["dc"]["won"] = ok(it["dc"]["sel"])
        # un combiné est réglé quand toutes ses jambes le sont (elles figurent parmi les Top Picks du même jour)
        tops = {(t["key"], t["sel"]): t for t in D.get("top", [])}
        for c in D.get("combos", []):
            if "won" in c: continue
            st = [tops.get((l["key"], l["sel"])) for l in c["legs"]]
            if all(t is not None and "won" in t for t in st): c["won"] = all(t["won"] for t in st)
    return n

def main():
    now = datetime.now(timezone.utc); L = json.load(open(LEDGER)) if LEDGER.exists() else {}
    day = now.astimezone(PARIS).date().isoformat()
    if FORCE or not L.get(day, {}).get("top"):
        try: L[day] = build_day(now)
        except FileNotFoundError as e: print("données absentes :", e)
    n = settle(L, now)
    L = {k: L[k] for k in sorted(L)[-90:]}
    LEDGER.parent.mkdir(exist_ok=True); json.dump(L, open(LEDGER, "w"), ensure_ascii=False, separators=(",", ":"))
    D = L.get(day, {}); print(f"{day} : {len(D.get('top', []))} top, {len(D.get('hot', []))} hot, {len(D.get('cold', []))} cold ; {n} réglés")

if __name__ == "__main__": main()
