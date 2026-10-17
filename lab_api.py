"""Labo API : la composition réellement alignée apporte-t-elle une information que les cotes n'ont pas ?
Tourne dans GitHub Actions (l'environnement de développement n'atteint pas les API). Reprend là où il s'est arrêté (cache),
s'arrête proprement au budget d'appels du jour.

Données : API-Football v3 (secret API_FOOTBALL_KEY) — matchs terminés, onzes, minutes, notes, buts de chaque joueur.
Signaux, calculés uniquement avec le passé de chaque équipe :
  - force du onze : note moyenne passée des 11 titulaires, moins la force habituelle de l'équipe (5 derniers onzes) ;
  - cadres absents : joueurs à 60 %+ des minutes sur les 10 derniers matchs, encore là récemment, absents du onze.
Tests (apprentissage sur la 1re saison, test sur les suivantes) :
  - au-delà des cotes Bet365 d'ouverture, au-delà du modèle, au-delà des cotes de clôture (data/closing.csv) ;
  - effet sur les buts (Poisson avec les buts attendus du modèle en décalage) ;
  - les cotes bougent-elles entre ouverture et clôture dans le sens du signal (l'info arrive-t-elle en retard) ?
Sorties : out/lab_api.json, cache data/af_cache/.
Variables : LAB_SEASONS (défaut 2024,2025,2026), LAB_BUDGET (défaut 7000 appels).
"""
import gzip, json, os, sys, time, urllib.request, urllib.parse, urllib.error
from datetime import datetime, timezone
from pathlib import Path
import numpy as np, pandas as pd

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
CACHE = ROOT / "data" / "af_cache"; OUTD = ROOT / "out"
LEAGUES = {"fr.1": (61, "F1"), "en.1": (39, "E0"), "es.1": (140, "SP1"), "de.1": (78, "D1"), "it.1": (135, "I1"),
           "pt.1": (94, "P1"), "nl.1": (88, "N1"), "en.2": (40, "E1")}
SEASONS = [int(x) for x in os.environ.get("LAB_SEASONS", "2024,2025,2026").split(",") if x.strip()]
BUDGET = int(os.environ.get("LAB_BUDGET", "7000"))
BASE = "https://v3.football.api-sports.io"
STATE = {"calls": 0, "errors": [], "stopped": None, "batch_ok": None, "no_ids": False, "seasons_refused": [], "incomplete": False}

class Stop(Exception): pass

def http_get(path, **params):
    if STATE["calls"] >= BUDGET: raise Stop("budget d'appels atteint")
    key = os.environ.get("API_FOOTBALL_KEY", "").strip()
    url = f"{BASE}/{path}?{urllib.parse.urlencode(params)}"
    for attempt in range(4):
        STATE["calls"] += 1
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"x-apisports-key": key}), timeout=40) as r:
                d = json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429: time.sleep(20 * (attempt + 1)); continue
            raise
        err = d.get("errors")
        if err:
            msg = json.dumps(err, ensure_ascii=False)
            if "rate" in msg.lower() or "too many" in msg.lower(): time.sleep(20 * (attempt + 1)); continue
            if "limit" in msg.lower() and "day" in msg.lower(): raise Stop("quota journalier de l'API atteint")
            STATE["errors"].append({"path": path, "params": params, "errors": err})
            if "ids" in params and "ids" in msg.lower(): STATE["no_ids"] = True
            if "season" in params and "season" in msg.lower(): STATE["seasons_refused"].append(params["season"])
            return []
        time.sleep(0.22)
        return d.get("response", [])
    raise Stop("trop de refus pour limite de débit")
get = http_get  # remplaçable pour les tests

def load(p):
    if not p.exists(): return None
    with gzip.open(p, "rt", encoding="utf-8") as f: return json.load(f)
def save(p, obj):
    p.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(p, "wt", encoding="utf-8") as f: json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))

def compact(item, lineups=None, players=None):
    """Garde l'essentiel d'un match : équipes, score, onzes, minutes, notes, buts."""
    fx, tm, gl = item["fixture"], item["teams"], item.get("goals") or {}
    lu = item.get("lineups") if lineups is None else lineups
    pl = item.get("players") if players is None else players
    out = dict(id=fx["id"], date=fx["date"], h=[tm["home"]["id"], tm["home"]["name"]], a=[tm["away"]["id"], tm["away"]["name"]],
               g=[gl.get("home"), gl.get("away")], xi={}, pl={})
    for l in lu or []:
        out["xi"][str(l["team"]["id"])] = [p["player"]["id"] for p in (l.get("startXI") or []) if p.get("player", {}).get("id")]
    for t in pl or []:
        rows = []
        for p in t.get("players") or []:
            st = (p.get("statistics") or [{}])[0]; gm = st.get("games") or {}; go = st.get("goals") or {}
            r = gm.get("rating"); rows.append([p["player"]["id"], gm.get("minutes") or 0, float(r) if r not in (None, "", "-") else None, go.get("total") or 0])
        out["pl"][str(t["team"]["id"])] = rows
    return out

def fetch():
    for code, (lid, _) in LEAGUES.items():
        for season in SEASONS:
            lp = CACHE / f"list_{lid}_{season}.json.gz"; lst = load(lp)
            current = season >= (datetime.now(timezone.utc).year if datetime.now(timezone.utc).month >= 7 else datetime.now(timezone.utc).year - 1)
            if lst is None or current or (lst and "g" not in lst[0]):
                items = get("fixtures", league=lid, season=season, status="FT")
                lst = [dict(id=i["fixture"]["id"], date=i["fixture"]["date"], g=[(i.get("goals") or {}).get("home"), (i.get("goals") or {}).get("away")]) for i in items]
                if lst: save(lp, lst)
            if not lst: continue
            dp = CACHE / f"det_{lid}_{season}.json.gz"; det = load(dp) or {}
            todo = [x["id"] for x in lst if str(x["id"]) not in det]
            try:
                k = 0
                while k < len(todo):
                    if not STATE["no_ids"]:
                        chunk = todo[k:k + 20]; items = get("fixtures", ids="-".join(map(str, chunk)))
                        if STATE["no_ids"]: continue  # l'offre refuse les appels groupés : on repasse ce lot match par match
                        for it in items:
                            if STATE["batch_ok"] is None: STATE["batch_ok"] = "lineups" in it and "players" in it
                            fid = it["fixture"]["id"]
                            det[str(fid)] = compact(it) if ("lineups" in it and "players" in it) else compact(it, get("fixtures/lineups", fixture=fid), get("fixtures/players", fixture=fid))
                        k += 20
                    else:
                        fid = todo[k]; head = {"fixture": {"id": fid, "date": next(x["date"] for x in lst if x["id"] == fid)}, "teams": None}
                        lu = get("fixtures/lineups", fixture=fid); pl = get("fixtures/players", fixture=fid)
                        if lu and len(lu) == 2:
                            head["teams"] = {"home": {"id": lu[0]["team"]["id"], "name": lu[0]["team"]["name"]}, "away": {"id": lu[1]["team"]["id"], "name": lu[1]["team"]["name"]}}
                            g = next((x.get("g") for x in lst if x["id"] == fid), None) or [None, None]
                            head["goals"] = {"home": g[0], "away": g[1]}
                            det[str(fid)] = compact(head, lu, pl)
                        k += 1
            finally:
                if det: save(dp, det)
            if len(det) < len(lst): STATE["incomplete"] = True
            print(code, season, "matchs en cache :", len(det), "| appels :", STATE["calls"], flush=True)

# ---------- signaux ----------
def build_features():
    rows = []
    for code, (lid, div) in LEAGUES.items():
        dets = []
        for season in SEASONS:
            d = load(CACHE / f"det_{lid}_{season}.json.gz") or {}
            for v in d.values(): v["season"] = season; v["league"] = code; dets.append(v)
        dets.sort(key=lambda v: v["date"])
        hist = {}  # équipe -> liste des matchs passés : (onze, {joueur: (minutes, note, buts)})
        for m in dets:
            rec = dict(league=code, season=m["season"], af_id=m["id"], date_utc=m["date"], h_name=m["h"][1], a_name=m["a"][1], hg=m["g"][0], ag=m["g"][1])
            for side, (tid, _) in (("h", m["h"]), ("a", m["a"])):
                H = hist.get(tid, []); xi = m["xi"].get(str(tid), [])
                rec[f"{side}_n"] = len(H)
                if len(H) >= 5 and len(xi) >= 10:
                    last = H[-10:]; mins = {}; rat = {}
                    for _, st in last:
                        for pid, (mn, r, _) in st.items():
                            mins[pid] = mins.get(pid, 0) + (mn or 0)
                            if r is not None and (mn or 0) >= 20: rat.setdefault(pid, []).append(r)
                    allr = [x for v in rat.values() for x in v]; med = float(np.median(allr)) if allr else 6.8
                    rhat = lambda pid: float(np.mean(rat[pid])) if len(rat.get(pid, [])) >= 2 else med - 0.15
                    strength = lambda team_xi: float(np.mean([rhat(p) for p in team_xi])) if team_xi else np.nan
                    usual = np.nanmean([strength(x) for x, _ in H[-5:] if len(x) >= 10]) if H else np.nan
                    recent = set().union(*[set(x) for x, _ in H[-3:]])
                    core = [p for p, mn in mins.items() if mn >= 0.6 * 90 * len(last) and p in recent]
                    rec[f"{side}_str"] = strength(xi) - usual
                    rec[f"{side}_miss"] = sum(1 for p in core if p not in xi)
                    goals = {}
                    for _, st in last:
                        for pid, (_, _, g) in st.items(): goals[pid] = goals.get(pid, 0) + (g or 0)
                    tg = sum(goals.values())
                    rec[f"{side}_missg"] = sum(goals.get(p, 0) for p in core if p not in xi) / (tg + 3)
            rows.append(rec)
            for side, (tid, _) in (("h", m["h"]), ("a", m["a"])):
                st = {r[0]: (r[1], r[2], r[3]) for r in m["pl"].get(str(tid), [])}
                hist.setdefault(tid, []).append((m["xi"].get(str(tid), []), st))
    return pd.DataFrame(rows)

def map_names(F, P):
    """Noms API-Football -> noms football-data : vote sur les matchs de même date et même score."""
    F = F.copy(); F["date"] = pd.to_datetime(F.date_utc, utc=True).dt.tz_convert("Europe/Paris").dt.tz_localize(None).dt.normalize()
    votes = {}
    for code in F.league.unique():
        Pf = P[P.league == code]; idx = {}
        for r in Pf.itertuples(): idx.setdefault((r.date, r.hg, r.ag), []).append(r)
        for r in F[F.league == code].itertuples():
            for dd in (0, -1, 1):
                c = idx.get((r.date + pd.Timedelta(days=dd), r.hg, r.ag), [])
                if len(c) == 1:
                    for a, b in ((r.h_name, c[0].home), (r.a_name, c[0].away)): votes.setdefault((code, a), {}).setdefault(b, 0); votes[(code, a)][b] += 1
                    break
    mp = {k: max(v, key=v.get) for k, v in votes.items()}
    F["home"] = [mp.get((l, n)) for l, n in zip(F.league, F.h_name)]; F["away"] = [mp.get((l, n)) for l, n in zip(F.league, F.a_name)]
    return F, len(mp)

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
    import statsmodels.api as sm
    P = pd.read_csv(OUTD / "engine3_preds.csv", parse_dates=["date"])
    F, n_map = map_names(F, P)
    D = F.dropna(subset=["home", "away"]).merge(P, on=["league", "date", "home", "away"], how="inner", suffixes=("_af", ""))
    feats = ["h_str", "a_str", "h_miss", "a_miss"]
    D = D.dropna(subset=feats + ["oH", "oD", "oA"]).reset_index(drop=True)
    R = dict(matchs_api=int(len(F)), equipes_rapprochees=n_map, matchs_avec_signaux_et_cotes=int(len(D)))
    if len(D) < 400: R["statut"] = "trop peu de matchs pour conclure"; return R
    seasons = sorted(D.season.unique()); R["saisons"] = [int(s) for s in seasons]
    O = np.stack([D.hg > D.ag, D.hg == D.ag, D.hg < D.ag], 1).astype(float); y = O.argmax(1)
    MK = shin(D[["oH", "oD", "oA"]].to_numpy())
    X = {"mkt": np.column_stack([np.log(MK[:, 0] / MK[:, 1]), np.log(MK[:, 2] / MK[:, 1])]),
         "model": np.column_stack([np.log(D.pH / D.pD), np.log(D.pA / D.pD), np.log(D.sl / D.sm), np.log(D.sl + D.sm), D.pi]),
         "lu": np.column_stack([D.h_str - D.a_str, D.a_miss - D.h_miss, D.h_str, D.a_str])}
    cl = ROOT / "data" / "closing.csv"
    if cl.exists():
        C = pd.read_csv(cl, parse_dates=["Date"]).rename(columns={"Date": "date", "HomeTeam": "home", "AwayTeam": "away"})
        cols = ["PSCH", "PSCD", "PSCA"] if {"PSCH", "PSCD", "PSCA"} <= set(C.columns) and C[["PSCH", "PSCD", "PSCA"]].dropna().shape[0] > 500 else ["B365CH", "B365CD", "B365CA"]
        if set(cols) <= set(C.columns):
            D = D.merge(C[["date", "home", "away"] + cols].rename(columns=dict(zip(cols, ["cH", "cD", "cA"]))), on=["date", "home", "away"], how="left")
            R["cloture"] = "Pinnacle" if cols[0] == "PSCH" else "Bet365"
    has_c = "cH" in D and D[["cH", "cD", "cA"]].notna().all(1).sum() > 300
    if has_c:
        CK = np.full((len(D), 3), np.nan); m = D[["cH", "cD", "cA"]].notna().all(1).to_numpy(); CK[m] = shin(D.loc[m, ["cH", "cD", "cA"]].to_numpy())
        X["close"] = np.column_stack([np.log(CK[:, 0] / CK[:, 1]), np.log(CK[:, 2] / CK[:, 1])])
    tr = (D.season == seasons[0]).to_numpy(); te = ~tr
    rng = np.random.default_rng(11)
    def fitp(keys, mask):
        Z = np.column_stack([X[k] for k in keys]); sc = StandardScaler().fit(Z[tr & mask])
        c = LogisticRegression(C=1.0, max_iter=3000).fit(sc.transform(Z[tr & mask]), y[tr & mask]); return c.predict_proba(sc.transform(Z[te & mask])), c
    def cmp(a_keys, b_keys, mask=None):
        mask = np.ones(len(D), bool) if mask is None else mask
        pa, _ = fitp(a_keys, mask); pb, cb = fitp(b_keys, mask); ra, rb = rps(pa, O[te & mask]), rps(pb, O[te & mask]); d = rb - ra
        bs = [d[rng.integers(0, len(d), len(d))].mean() for _ in range(2000)]
        return dict(n_test=int((te & mask).sum()), rps_sans=float(ra.mean()), rps_avec=float(rb.mean()), gain=float(-d.mean()),
                    ic95=[float(-np.percentile(bs, 97.5)), float(-np.percentile(bs, 2.5))], prouve=bool(-np.percentile(bs, 97.5) > 0))
    R["au_dela_ouverture"] = cmp(["mkt"], ["mkt", "lu"])
    R["au_dela_modele"] = cmp(["model"], ["model", "lu"])
    if has_c:
        mc = ~np.isnan(X["close"][:, 0])
        R["au_dela_cloture"] = cmp(["close"], ["close", "lu"], mc)
        # l'info arrive-t-elle entre ouverture et clôture ? mouvement de la proba domicile vs signal
        dmv = (CK[:, 0] - MK[:, 0])[mc]; sig = (D.h_str - D.a_str).to_numpy()[mc]
        g = sm.OLS(dmv, sm.add_constant(sig)).fit()
        R["mouvement_cotes"] = dict(n=int(mc.sum()), pente_pts_par_point_de_note=float(g.params[1] * 100), p=float(g.pvalues[1]))
    # buts : Poisson avec les buts attendus du modèle en décalage
    L = pd.concat([pd.DataFrame(dict(y=D.hg, lam=D.lam, s=D.h_str, so=D.a_str, miss=D.h_miss)), pd.DataFrame(dict(y=D.ag, lam=D.mu, s=D.a_str, so=D.h_str, miss=D.a_miss))])
    gm = sm.GLM(L.y, sm.add_constant(L[["s", "so", "miss"]]), family=sm.families.Poisson(), offset=np.log(L.lam)).fit(); ci = gm.conf_int()
    R["buts"] = {k: dict(effet_par_unite=float(np.exp(gm.params[k])), ic95=[float(np.exp(ci.loc[k, 0])), float(np.exp(ci.loc[k, 1]))], p=float(gm.pvalues[k])) for k in ["s", "so", "miss"]}
    R["signal_moyen"] = dict(ecart_type_force=float(D.h_str.std()), cadres_absents_moyen=float(D.h_miss.mean()))
    return R

def main():
    R = dict(date=datetime.now(timezone.utc).isoformat(timespec="minutes"), saisons_demandees=SEASONS, budget=BUDGET)
    if os.environ.get("API_FOOTBALL_KEY", "").strip():
        try:
            fetch()
            R["collecte"] = "partielle : reprise automatique au prochain lancement" if STATE["incomplete"] else "complète"
        except Stop as e: R["collecte"] = f"partielle : {e} (reprise automatique au prochain lancement)"
        if STATE["seasons_refused"]: R["saisons_refusees_par_l_offre"] = sorted(set(STATE["seasons_refused"]))
        if STATE["no_ids"]: R["offre"] = "gratuite probable : appels groupés refusés, deux appels par match (100 appels par jour, environ 50 matchs par jour)"
    else: R["collecte"] = "pas de clé API_FOOTBALL_KEY : analyse du cache seulement"
    R.update(appels=STATE["calls"], erreurs_api=STATE["errors"][:10], compositions_jointes=STATE["batch_ok"])
    F = build_features(); R["matchs_en_cache"] = int(len(F))
    if len(F): R.update(analyse(F))
    OUTD.mkdir(exist_ok=True); json.dump(R, open(OUTD / "lab_api.json", "w"), ensure_ascii=False, indent=1, default=float)
    print(json.dumps(R, ensure_ascii=False, indent=1, default=float))

if __name__ == "__main__": main()
