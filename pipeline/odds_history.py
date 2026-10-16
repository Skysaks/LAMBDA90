"""Historique des cotes : à chaque passage, instantané des bookmakers suivis pour chaque match à venir.
Stocké dans data/odds_history.json (conservé 3 jours après le match), et recopié dans out/feed_odds.json (champ « history »
de chaque match) pour que la page affiche le mouvement du marché.
"""
import json, sys, time
from datetime import datetime, timezone, timedelta
from pathlib import Path
ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
FEED, HIST = ROOT / "out" / "feed_odds.json", ROOT / "data" / "odds_history.json"
KEEP = {"pinnacle", "bet365", "winamax_fr", "betclic_fr", "unibet_fr", "market_avg"}
def snap(e):
    out = {}
    for b in e.get("bookmakers", []):
        if b.get("key") not in KEEP: continue
        o = {}
        for m in b.get("markets", []):
            if m["key"] == "h2h":
                for x in m["outcomes"]: o["H" if x["name"] == e["home_team"] else "A" if x["name"] == e["away_team"] else "D"] = x["price"]
            if m["key"] == "totals":
                for x in m["outcomes"]:
                    if float(x.get("point", 0)) == 2.5: o["O25" if x["name"] == "Over" else "U25"] = x["price"]
        if o: out[b["title"]] = o
    return out
def main():
    if not FEED.exists(): print("pas de flux"); return
    feed = json.load(open(FEED)); H = json.load(open(HIST)) if HIST.exists() else {}
    now = int(time.time() * 1000)
    for e in feed["events"]:
        s = snap(e)
        if not s: continue
        rec = H.setdefault(e["id"], {"home": e["home_team"], "away": e["away_team"], "commence": e["commence_time"], "snaps": []})
        last = rec["snaps"][-1]["b"] if rec["snaps"] else None
        if s != last: rec["snaps"].append({"t": now, "b": s})
        rec["snaps"] = rec["snaps"][-40:]
    cutoff = (datetime.now(timezone.utc) - timedelta(days=3)).strftime("%Y-%m-%dT%H:%M:%SZ")
    H = {k: v for k, v in H.items() if v["commence"] >= cutoff}
    HIST.parent.mkdir(exist_ok=True); json.dump(H, open(HIST, "w"), separators=(",", ":"))
    for e in feed["events"]:
        if e["id"] in H and len(H[e["id"]]["snaps"]) > 1: e["history"] = H[e["id"]]["snaps"]
    json.dump(feed, open(FEED, "w"))
    print(f"historique : {len(H)} matchs suivis, {sum(len(v['snaps']) for v in H.values())} instantanés")
if __name__ == "__main__": main()
