"""Picks du jour, figés chaque matin puis réglés avec les résultats : le registre public honnête de Lambda 90.
- Top Picks (6 à 8) : la sélection la plus probable de chaque match du jour (vraie cote ≥ 1,25 chez mes bookmakers), probabilité
  = 90 % marché Pinnacle sans marge + 10 % modèle (meilleur mélange mesuré, labo 6). On garde aussi le pick « résultat » (1N2) et « double chance ».
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

def book_odds(e):
    out = {}
    for b in e.get("bookmakers", []):
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
        f = E[k]; B = book_odds(e); fair = fair_of(B.get("pinnacle"))
        if not fair: continue
        pmod = model_probs(f); pr = {s: 0.9 * fair[s] + 0.1 * pmod[s] for s in fair}
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
        rows.append(dict(f=f, e=e, kick=kick, key=f"{f['league']}|{f['date']}|{f['home']}|{f['away']}", fair=fair, pmod=pmod, pr=pr, best=best, bestfr=bestfr, marg=marg, dc=dc, bw=bw))
    return rows

def pick_of(r):
    opts = [(r["pr"][s], s) for s in r["best"] if r["best"][s][0] >= 1.25]
    if not opts: return None
    p, s = max(opts); o, bk = r["best"][s]; ofr, bfr = r["bestfr"].get(s, (None, None))
    return dict(sel=s, p=round(p, 4), pm=round(r["fair"][s], 4), pmod=round(r["pmod"][s], 4), o=o, book=bk, ev=round(r["fair"][s] * o - 1, 4), ofr=ofr, bookfr=bfr)

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
    top.sort(key=lambda x: -x["p"]); top = top[:8]
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
    return dict(made=now.isoformat(timespec="minutes"), window=len(win), top=top, hot=hot2[:5], cold=cold)

def settle(L, now):
    try:
        import csv; R = list(csv.DictReader(open(ROOT / "data" / "recent.csv")))
    except FileNotFoundError: return 0
    n = 0
    for day, D in L.items():
        for it in D.get("top", []) + D.get("hot", []) + D.get("cold", []):
            if "hg" in it: continue
            kick = datetime.fromisoformat(it["kick"].replace("Z", "+00:00"))
            if kick > now - timedelta(hours=2, minutes=30): continue
            cands = [(i, r["home"], r["away"]) for i, r in enumerate(R) if r["Division"] == DIV[it["league"]] and abs((datetime.fromisoformat(r["date"]) - kick.replace(tzinfo=None)).days) <= 1]
            k = best_pair(it["home"], it["away"], cands)
            if k is None: continue
            hg, ag = int(R[k]["hg"]), int(R[k]["ag"]); it["hg"], it["ag"] = hg, ag; n += 1
            ok = lambda s: {"H": hg > ag, "D": hg == ag, "A": hg < ag, "O25": hg + ag > 2, "U25": hg + ag < 3, "1N": hg >= ag, "N2": hg <= ag, "12": hg != ag}[s]
            if "sel" in it: it["won"] = ok(it["sel"])
            if "res" in it: it["res"]["won"] = ok(it["res"]["sel"]); it["dc"]["won"] = ok(it["dc"]["sel"])
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
