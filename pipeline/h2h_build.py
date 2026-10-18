"""Face-à-face des matchs à venir, depuis 2000 : bilan, buts, les deux marquent, plus et moins de buts, même stade, mi-temps,
corners et cartons, dix dernières confrontations. Sources : Matches.csv (xgabora, noms football-data) + data/recent.csv (résultats
récents, noms rapprochés par matchs communs). Sortie : out/h2h.json, clé « ligue|date|domicile|extérieur » des fixtures du moteur.
Usage : python pipeline/h2h_build.py /tmp/xg/data .
"""
import json, sys
from pathlib import Path
import numpy as np, pandas as pd
XG, ROOT = Path(sys.argv[1]), Path(sys.argv[2]) if len(sys.argv) > 2 else Path(".")

def history(XG, ROOT):
    M = pd.read_csv(XG / "Matches.csv", low_memory=False, parse_dates=["MatchDate"]).dropna(subset=["FTHome", "FTAway"])
    M = M.rename(columns={"MatchDate": "date", "HomeTeam": "home", "AwayTeam": "away", "FTHome": "hg", "FTAway": "ag", "HTHome": "hth", "HTAway": "hta"})
    M["co"] = M.HomeCorners + M.AwayCorners; M["ca"] = M.HomeYellow + M.AwayYellow + M.HomeRed + M.AwayRed
    M = M[["Division", "date", "home", "away", "hg", "ag", "hth", "hta", "co", "ca"]]
    R = ROOT / "data" / "recent.csv"
    if R.exists():
        R = pd.read_csv(R, parse_dates=["date"]); extra = []
        for div, g in R.groupby("Division"):
            x = M[M.Division == div]; votes = {}
            for r in g.itertuples():
                c = x[(x.date == r.date) & (x.hg == r.hg) & (x.ag == r.ag)]
                if len(c) == 1:
                    for s_, x_ in ((r.home, c.iloc[0].home), (r.away, c.iloc[0].away)): votes.setdefault(s_, {}).setdefault(x_, 0); votes[s_][x_] += 1
            mp = {t: max(v, key=v.get) for t, v in votes.items()}; last = x.date.max()
            for r in g[g.date > last].itertuples():
                if r.home in mp and r.away in mp: extra.append(dict(Division=div, date=r.date, home=mp[r.home], away=mp[r.away], hg=r.hg, ag=r.ag, hth=r.hth, hta=r.hta, co=np.nan, ca=np.nan))
        M = pd.concat([M, pd.DataFrame(extra)], ignore_index=True)
    return M.sort_values("date").reset_index(drop=True)

def summary(H, h, a):
    """H : confrontations passées ; point de vue de l'équipe à domicile du match à venir (h)."""
    if not len(H): return None
    gh = np.where(H.home == h, H.hg, H.ag).astype(float); ga = np.where(H.home == h, H.ag, H.hg).astype(float); tot = gh + ga
    same = H[(H.home == h) & (H.away == a)]
    rate = lambda m: round(float(np.mean(m)), 3)
    out = dict(n=int(len(H)), since=int(H.date.min().year), w=int((gh > ga).sum()), d=int((gh == ga).sum()), l=int((gh < ga).sum()),
               gf=round(float(gh.mean()), 2), ga=round(float(ga.mean()), 2), goals=round(float(tot.mean()), 2), btts=rate((gh > 0) & (ga > 0)),
               o15=rate(tot > 1.5), o25=rate(tot > 2.5), u35=rate(tot < 3.5), nil=rate(tot == 0),
               venue=dict(n=int(len(same)), w=int((same.hg > same.ag).sum()), d=int((same.hg == same.ag).sum()), l=int((same.hg < same.ag).sum())))
    co, ca = H.co.dropna(), H.ca.dropna()
    if len(co) >= 3: out["corners"] = round(float(co.mean()), 1)
    if len(ca) >= 3: out["cards"] = round(float(ca.mean()), 1)
    ht = H.dropna(subset=["hth", "hta"])
    if len(ht) >= 3:
        hh = np.where(ht.home == h, ht.hth, ht.hta); ha = np.where(ht.home == h, ht.hta, ht.hth); out["ht_goals"] = round(float((hh + ha).mean()), 2)
    L = H.tail(10).iloc[::-1]
    out["last"] = [[str(r.date.date()), int(r.home == h), int(r.hg), int(r.ag), None if pd.isna(r.hth) else int(r.hth), None if pd.isna(r.hta) else int(r.hta)] for r in L.itertuples()]
    return out

def main():
    M = history(XG, ROOT); E = json.load(open(ROOT / "out" / "engine3_out.json"))["fixtures"]; out = {}
    for f in E:
        if not f.get("xn"): continue
        h, a = f["xn"]; H = M[((M.home == h) & (M.away == a)) | ((M.home == a) & (M.away == h))]
        s = summary(H, h, a)
        if s: out[f"{f['league']}|{f['date']}|{f['home']}|{f['away']}"] = s
    json.dump(out, open(ROOT / "out" / "h2h.json", "w"), ensure_ascii=False, separators=(",", ":"))
    print(len(out), "face-à-face sur", len(E), "matchs ; historique jusqu'au", M.date.max().date())

if __name__ == "__main__": main()
