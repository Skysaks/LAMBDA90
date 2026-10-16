"""Journal de value : chaque cote d'un bookmaker supérieure au prix juste Pinnacle (sans marge) est notée au moment où on la voit.
Elle sera jugée plus tard par value_eval.py (clôture Pinnacle et résultat). C'est un test en conditions réelles, sans miser.
Entrée : out/feed_odds.json (The Odds API). Sortie : data/value_log.csv (ajout, sans doublon).
"""
import csv, json, sys
from datetime import datetime, timezone
from pathlib import Path
ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
FEED, LOG = ROOT / "out" / "feed_odds.json", ROOT / "data" / "value_log.csv"
FR = {"betclic_fr", "winamax_fr", "unibet_fr", "pmu_fr", "parionssport_fr", "zebet_fr", "netbet_fr", "betway_fr", "vbet_fr"}  # agréés ANJ
THR = 0.01
COLS = ["vu_le", "event_id", "sport_key", "commence_time", "home", "away", "market", "point", "outcome", "book", "fr", "price", "pin_price", "p_fair", "ev"]
def shin(odds):
    q = [1 / o for o in odds]; S = sum(q); lo, hi = 0.0, 0.4
    for _ in range(60):
        z = (lo + hi) / 2; p = [((z * z + 4 * (1 - z) * x * x / S) ** 0.5 - z) / (2 * (1 - z)) for x in q]
        lo, hi = (z, hi) if sum(p) > 1 else (lo, z)
    return [x / sum(p) for x in p]
def main():
    if not FEED.exists(): print("pas de flux de cotes"); return
    feed = json.load(open(FEED)); seen = set()
    if LOG.exists():
        with open(LOG, newline="") as f:
            for r in csv.DictReader(f): seen.add((r["event_id"], r["market"], r["point"], r["outcome"], r["book"]))
    now = datetime.now(timezone.utc).isoformat(timespec="minutes"); rows = []
    for e in feed.get("events", []):
        if e["commence_time"] <= now: continue  # match commencé : la cote n'était plus jouable
        bk = {b["key"]: {m["key"]: m["outcomes"] for m in b.get("markets", [])} for b in e.get("bookmakers", [])}
        pin = bk.get("pinnacle")
        if not pin: continue
        fair = {}
        h2h = pin.get("h2h")
        if h2h and len(h2h) == 3:
            p = shin([o["price"] for o in h2h])
            for o, pp in zip(h2h, p): fair[("h2h", "", o["name"])] = (pp, o["price"])
        tot = {}
        for o in pin.get("totals") or []: tot.setdefault(o.get("point"), []).append(o)
        for pt, outs in tot.items():
            if len(outs) == 2:
                q = [1 / o["price"] for o in outs]
                for o, x in zip(outs, q): fair[("totals", str(pt), o["name"])] = (x / sum(q), o["price"])
        for book, mk in bk.items():
            if book == "pinnacle": continue
            for mkey, outs in mk.items():
                for o in outs or []:
                    k = (mkey, str(o.get("point", "")) if mkey == "totals" else "", o["name"])
                    if k not in fair: continue
                    pf, pinp = fair[k]; ev = o["price"] * pf - 1
                    key = (e["id"], mkey, k[1], o["name"], book)
                    if ev > THR and key not in seen:
                        seen.add(key); rows.append(dict(vu_le=now, event_id=e["id"], sport_key=e["sport_key"], commence_time=e["commence_time"], home=e["home_team"],
                                                       away=e["away_team"], market=mkey, point=k[1], outcome=o["name"], book=book, fr=int(book in FR),
                                                       price=o["price"], pin_price=pinp, p_fair=round(pf, 5), ev=round(ev, 5)))
    LOG.parent.mkdir(exist_ok=True); new = not LOG.exists()
    with open(LOG, "a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLS)
        if new: w.writeheader()
        w.writerows(rows)
    print(f"{len(rows)} nouvelles cotes au-dessus du prix juste Pinnacle (dont {sum(r['fr'] for r in rows)} chez des bookmakers agréés en France)")
if __name__ == "__main__": main()
