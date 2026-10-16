"""Juge le journal de value : CLV contre la clôture Pinnacle et rendement réel, par bookmaker.
Entrées : data/value_log.csv, data/closing.csv (football-data.co.uk). Sortie : out/value_eval.json.
"""
import json, sys
from pathlib import Path
import numpy as np, pandas as pd
sys.path.insert(0, str(Path(__file__).parent)); from names import best_pair
ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
LOG, CL, OUT = ROOT / "data" / "value_log.csv", ROOT / "data" / "closing.csv", ROOT / "out" / "value_eval.json"
def shin(q):
    q = 1 / np.asarray(q, float); S = q.sum(); lo, hi = 0.0, 0.4
    for _ in range(60):
        z = (lo + hi) / 2; p = (np.sqrt(z * z + 4 * (1 - z) * q * q / S) - z) / (2 * (1 - z)); lo, hi = (z, hi) if p.sum() > 1 else (lo, z)
    return p / p.sum()
def main():
    if not LOG.exists() or not CL.exists(): print("journal ou clôtures absents"); return
    L = pd.read_csv(LOG); C = pd.read_csv(CL)
    C["d"] = pd.to_datetime(C.Date, dayfirst=False, errors="coerce").dt.normalize()
    L["d"] = pd.to_datetime(L.commence_time, utc=True).dt.tz_convert("Europe/Paris").dt.tz_localize(None).dt.normalize()
    last = C.d.max(); J = L[L.d <= last].copy()
    byday = {d: g for d, g in C.groupby("d")}
    out = []
    for r in J.itertuples():
        cands = []
        for dd in (0, -1, 1):
            g = byday.get(r.d + pd.Timedelta(days=dd))
            if g is not None: cands += [(i, x.HomeTeam, x.AwayTeam) for i, x in g.iterrows()]
        k = best_pair(r.home, r.away, cands)
        if k is None: continue
        c = C.loc[k]; hg, ag = c.FTHG, c.FTAG
        if r.market == "h2h":
            if pd.isna(c.get("PSCH")): continue
            j = 0 if r.outcome == r.home else 1 if r.outcome == "Draw" else 2
            pc = shin([c.PSCH, c.PSCD, c.PSCA])[j]; win = [hg > ag, hg == ag, hg < ag][j]
        elif r.market == "totals" and str(r.point) in ("2.5", "2.5.0") and not pd.isna(c.get("PC>2.5")):
            q = np.array([1 / c["PC>2.5"], 1 / c["PC<2.5"]]); q /= q.sum(); over = r.outcome == "Over"
            pc = q[0] if over else q[1]; win = (hg + ag > 2) if over else (hg + ag < 3)
        else: continue
        out.append(dict(book=r.book, fr=r.fr, market=r.market, ev=r.ev, price=r.price, clv=r.price * pc - 1, profit=(r.price - 1) if win else -1.0))
    R = dict(cotes_notees=int(len(L)), jugeables=int(len(J)), jugees=int(len(out)), cloture_jusqu_au=str(last.date()) if pd.notna(last) else None)
    if out:
        D = pd.DataFrame(out); rng = np.random.default_rng(4)
        def summ(d):
            if len(d) < 5: return dict(n=int(len(d)))
            ci = lambda x: [float(np.percentile([x[rng.integers(0, len(x), len(x))].mean() for _ in range(2000)], q)) for q in (2.5, 97.5)]
            return dict(n=int(len(d)), ev_annonce=float(d.ev.mean()), clv=float(d.clv.mean()), ic95_clv=ci(d.clv.to_numpy()), rendement=float(d.profit.mean()), ic95_rendement=ci(d.profit.to_numpy()))
        R["tout"] = summ(D); R["agrees_france"] = summ(D[D.fr == 1])
        R["par_bookmaker"] = {b: summ(g) for b, g in D.groupby("book") if len(g) >= 10}
    OUT.parent.mkdir(exist_ok=True); json.dump(R, open(OUT, "w"), indent=1, ensure_ascii=False)
    print(json.dumps(R, indent=1, ensure_ascii=False)[:2000])
if __name__ == "__main__": main()
