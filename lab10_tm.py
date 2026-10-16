"""Laboratoire 10 : la valeur marchande du onze aligné (jeu de données ouvert tiré de Transfermarkt) apporte-t-elle une information
que le moteur et les cotes n'ont pas ? Gratuit, compositions de chaque match, valeurs des joueurs datées (données jusqu'à juillet 2026).
Signaux, calculés avec le seul passé : log de la valeur du onze (domicile − extérieur) ; écart du onze du jour à la valeur habituelle
de l'équipe (5 derniers matchs), signe de rotation ou d'absences.
Usage : python lab10_tm.py .   Sortie : out/lab10.json (et data/tm_features.csv).
"""
import gzip, io, json, sys, urllib.request, zipfile
from pathlib import Path
import numpy as np, pandas as pd
ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
CACHE = ROOT / "data" / "tm"; OUTD = ROOT / "out"
BASE = "https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data/"
COMP = {"GB1": "en.1", "GB2": "en.2", "FR1": "fr.1", "ES1": "es.1", "L1": "de.1", "IT1": "it.1", "PO1": "pt.1", "NL1": "nl.1"}
R = {}

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
def dl(url, path):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=300) as r, open(path, "wb") as f:
        while True:
            b = r.read(1 << 20)
            if not b: break
            f.write(b)
def get_tables():
    CACHE.mkdir(parents=True, exist_ok=True); need = ["games", "game_lineups", "player_valuations"]; T = {}
    for t in need:
        p = CACHE / f"{t}.csv.gz"
        if not p.exists():
            try: dl(BASE + f"{t}.csv.gz", p)
            except Exception as e:
                print("fichier séparé indisponible", t, str(e)[:80])
                if p.exists(): p.unlink()
    if not all((CACHE / f"{t}.csv.gz").exists() for t in need):
        z = CACHE / "all.zip"
        if not z.exists(): dl(BASE + "transfermarkt-datasets.zip", z)
        with zipfile.ZipFile(z) as Z:
            for t in need:
                name = next((n for n in Z.namelist() if n.split("/")[-1] in (f"{t}.csv", f"{t}.csv.gz")), None)
                if name is None: raise RuntimeError(f"table {t} absente de l'archive")
                raw = Z.read(name); raw = gzip.decompress(raw) if name.endswith(".gz") else raw
                with gzip.open(CACHE / f"{t}.csv.gz", "wb") as f: f.write(raw)
    for t in need: T[t] = pd.read_csv(CACHE / f"{t}.csv.gz", low_memory=False)
    return T

def features(T):
    G, LU, V = T["games"], T["game_lineups"], T["player_valuations"]
    for tab, cols in (("games", ["game_id", "competition_id", "date", "home_club_id", "away_club_id", "home_club_goals", "away_club_goals", "home_club_name", "away_club_name"]),
                      ("game_lineups", ["game_id", "club_id", "player_id", "type"]), ("player_valuations", ["player_id", "date", "market_value_in_eur"])):
        miss = [c for c in cols if c not in T[tab].columns]
        if miss: raise RuntimeError(f"colonnes absentes dans {tab} : {miss}")
    G = G[G.competition_id.isin(COMP) & (pd.to_datetime(G.date) >= "2021-07-01")].copy(); G["date"] = pd.to_datetime(G.date)
    LU = LU[LU.game_id.isin(G.game_id) & LU.type.astype(str).str.contains("start", case=False)]
    V = V[["player_id", "date", "market_value_in_eur"]].copy(); V["date"] = pd.to_datetime(V.date); V = V.sort_values("date")
    X = LU.merge(G[["game_id", "date"]], on="game_id").sort_values("date")
    X = pd.merge_asof(X, V.rename(columns={"date": "vdate"}), left_on="date", right_on="vdate", by="player_id", direction="backward")
    X["val"] = X.market_value_in_eur.fillna(X.market_value_in_eur.median() * 0.3)  # joueur sans valeur connue : jeune ou inconnu
    XI = X.groupby(["game_id", "club_id"]).agg(val=("val", "sum"), n=("player_id", "size")).reset_index()
    XI = XI[XI.n >= 10]; XI["lv"] = np.log(XI.val + 1)
    XI = XI.merge(G[["game_id", "date"]], on="game_id").sort_values("date")
    XI["usual"] = XI.groupby("club_id").lv.transform(lambda s: s.shift(1).rolling(5, min_periods=3).mean())
    XI["dlv"] = XI.lv - XI.usual
    F = G.merge(XI[["game_id", "club_id", "lv", "dlv"]].rename(columns={"club_id": "home_club_id", "lv": "h_lv", "dlv": "h_dlv"}), on=["game_id", "home_club_id"])
    F = F.merge(XI[["game_id", "club_id", "lv", "dlv"]].rename(columns={"club_id": "away_club_id", "lv": "a_lv", "dlv": "a_dlv"}), on=["game_id", "away_club_id"])
    F["league"] = F.competition_id.map(COMP)
    return F[["league", "date", "home_club_name", "away_club_name", "home_club_goals", "away_club_goals", "h_lv", "a_lv", "h_dlv", "a_dlv"]]

def shin(q):
    q = 1 / q; S = q.sum(1, keepdims=True); lo = np.zeros((len(q), 1)); hi = np.full((len(q), 1), 0.4)
    for _ in range(60):
        z = (lo + hi) / 2; p = (np.sqrt(z * z + 4 * (1 - z) * q * q / S) - z) / (2 * (1 - z)); big = p.sum(1, keepdims=True) > 1
        lo = np.where(big, z, lo); hi = np.where(big, hi, z)
    return p
rps = lambda A, B: (((np.cumsum(A, 1)[:, :-1] - np.cumsum(B, 1)[:, :-1]) ** 2).sum(1) / 2)

def analyse(F):
    from sklearn.linear_model import LogisticRegression
    from sklearn.preprocessing import StandardScaler
    P = pd.read_csv(OUTD / "engine3_preds.csv", parse_dates=["date"])
    votes = {}
    for code in F.league.unique():
        Pf = P[P.league == code]; idx = {}
        for r in Pf.itertuples(): idx.setdefault((r.date, r.hg, r.ag), []).append(r)
        for r in F[F.league == code].itertuples():
            for dd in (0, -1, 1):
                c = idx.get((r.date + pd.Timedelta(days=dd), r.home_club_goals, r.away_club_goals), [])
                if len(c) == 1:
                    for a, b in ((r.home_club_name, c[0].home), (r.away_club_name, c[0].away)): votes.setdefault((code, a), {}).setdefault(b, 0); votes[(code, a)][b] += 1
                    break
    mp = {k: max(v, key=v.get) for k, v in votes.items()}
    F = F.assign(home=[mp.get((l, n)) for l, n in zip(F.league, F.home_club_name)], away=[mp.get((l, n)) for l, n in zip(F.league, F.away_club_name)])
    F["season"] = [d.year if d.month >= 7 else d.year - 1 for d in F.date]  # chaque affiche n'a lieu qu'une fois par saison
    F = F.dropna(subset=["home", "away"]).drop_duplicates(["league", "season", "home", "away"])
    D = P.merge(F[["league", "season", "home", "away", "h_lv", "a_lv", "h_dlv", "a_dlv"]], on=["league", "season", "home", "away"], how="inner")
    D = D.dropna(subset=["oH", "oD", "oA", "h_dlv", "a_dlv"]).reset_index(drop=True)
    R.update(equipes_rapprochees=len(mp), matchs_testables=int(len(D)))
    if len(D) < 500: R["statut"] = "trop peu de matchs"; return
    O = np.stack([D.hg > D.ag, D.hg == D.ag, D.hg < D.ag], 1).astype(float); y = O.argmax(1); MK = shin(D[["oH", "oD", "oA"]].to_numpy())
    X = {"mkt": np.column_stack([np.log(MK[:, 0] / MK[:, 1]), np.log(MK[:, 2] / MK[:, 1])]),
         "model": np.column_stack([np.log(D.pH / D.pD), np.log(D.pA / D.pD), np.log(D.sl / D.sm), np.log(D.sl + D.sm), D.pi]),
         "val": np.column_stack([D.h_lv - D.a_lv]), "rot": np.column_stack([D.h_dlv, D.a_dlv])}
    cl = ROOT / "data" / "closing.csv"
    if cl.exists():
        C = pd.read_csv(cl, parse_dates=["Date"]).rename(columns={"Date": "date", "HomeTeam": "home", "AwayTeam": "away"})
        if {"PSCH", "PSCD", "PSCA"} <= set(C.columns):
            D = D.merge(C[["date", "home", "away", "PSCH", "PSCD", "PSCA"]], on=["date", "home", "away"], how="left")
            m = D[["PSCH", "PSCD", "PSCA"]].notna().all(1).to_numpy(); CK = np.full((len(D), 3), np.nan)
            if m.sum() > 300: CK[m] = shin(D.loc[m, ["PSCH", "PSCD", "PSCA"]].to_numpy()); X["close"] = np.column_stack([np.log(CK[:, 0] / CK[:, 1]), np.log(CK[:, 2] / CK[:, 1])])
    seasons = sorted(D.season.unique()); tr = (D.season == seasons[0]).to_numpy(); te = ~tr; rng = np.random.default_rng(10)
    R["saisons"] = [int(s) for s in seasons]
    def cmp(a, b, mask=None):
        mask = np.ones(len(D), bool) if mask is None else mask; out = []
        for keys in (a, b):
            Z = np.column_stack([X[k] for k in keys]); sc = StandardScaler().fit(Z[tr & mask])
            c = LogisticRegression(C=1.0, max_iter=3000).fit(sc.transform(Z[tr & mask]), y[tr & mask]); out.append(rps(c.predict_proba(sc.transform(Z[te & mask])), O[te & mask]))
        d = out[1] - out[0]; bs = [d[rng.integers(0, len(d), len(d))].mean() for _ in range(2000)]
        return dict(n_test=int((te & mask).sum()), rps_sans=float(out[0].mean()), rps_avec=float(out[1].mean()), gain=float(-d.mean()),
                    ic95=[float(-np.percentile(bs, 97.5)), float(-np.percentile(bs, 2.5))], prouve=bool(-np.percentile(bs, 97.5) > 0))
    R["valeur_au_dela_modele"] = cmp(["model"], ["model", "val"])
    R["rotation_au_dela_modele"] = cmp(["model"], ["model", "rot"])
    R["tout_au_dela_ouverture"] = cmp(["mkt"], ["mkt", "val", "rot"])
    if "close" in X:
        mc = ~np.isnan(X["close"][:, 0]); R["tout_au_dela_cloture"] = cmp(["close"], ["close", "val", "rot"], mc)

def main():
    try:
        T = get_tables(); F = features(T); R["matchs_avec_onzes"] = int(len(F)); R["derniere_date"] = str(F.date.max().date())
        F.to_csv(ROOT / "data" / "tm_features.csv", index=False); analyse(F)
    except Exception as e: R["erreur"] = f"{type(e).__name__} : {e}"
    OUTD.mkdir(exist_ok=True); json.dump(R, open(OUTD / "lab10.json", "w"), indent=1, ensure_ascii=False, default=float)
    print(json.dumps(R, indent=1, ensure_ascii=False, default=float))

if __name__ == "__main__": main()
