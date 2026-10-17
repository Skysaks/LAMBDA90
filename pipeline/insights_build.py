"""Données d'aide à la décision calculées sur l'historique réel (data/closing.csv, out/engine3_preds.csv) :
- twins : chaque match passé résumé par ses probabilités Pinnacle de clôture sans marge et son score, pour retrouver les « jumeaux » d'un match à venir ;
- patience : comment bougent les cotes entre l'ouverture et la clôture (Pinnacle et Bet365), par profil d'issue : jouer tôt ou attendre ;
- backtest_top : la règle des Top Picks (issue 1N2 la plus probable, 8 par jour) rejouée sur 2025-26 avec les cotes Bet365 d'ouverture.
Sortie : out/insights.json. Usage : python pipeline/insights_build.py .
"""
import json, math, sys
from pathlib import Path
import numpy as np, pandas as pd
ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
LG = {"F1": "fr.1", "E0": "en.1", "SP1": "es.1", "D1": "de.1", "I1": "it.1", "P1": "pt.1", "N1": "nl.1", "E1": "en.2"}

def shin(Q):
    q = 1 / Q; S = q.sum(1, keepdims=True); lo = np.zeros((len(q), 1)); hi = np.full((len(q), 1), 0.4)
    for _ in range(60):
        z = (lo + hi) / 2; p = (np.sqrt(z * z + 4 * (1 - z) * q * q / S) - z) / (2 * (1 - z)); big = p.sum(1, keepdims=True) > 1
        lo = np.where(big, z, lo); hi = np.where(big, hi, z)
    return p

def main():
    np.seterr(all="ignore")
    C = pd.read_csv(ROOT / "data" / "closing.csv")
    C = C.dropna(subset=["PSCH", "PSCD", "PSCA", "FTHG", "FTAG"]).reset_index(drop=True)
    F = shin(C[["PSCH", "PSCD", "PSCA"]].to_numpy(float))
    tot = C[["PC>2.5", "PC<2.5"]].notna().all(axis=1).to_numpy()
    PO = np.full(len(C), np.nan); PO[tot] = shin(C.loc[tot, ["PC>2.5", "PC<2.5"]].to_numpy(float))[:, 0]
    keep = ~np.isnan(PO); hg, ag = C.FTHG.astype(int).to_numpy(), C.FTAG.astype(int).to_numpy()
    twins = dict(n=int(keep.sum()), h=(F[keep, 0] * 1000).round().astype(int).tolist(), a=(F[keep, 2] * 1000).round().astype(int).tolist(),
                 o=(PO[keep] * 1000).round().astype(int).tolist(), s=(np.minimum(hg, 15) * 16 + np.minimum(ag, 15))[keep].tolist(),
                 since=str(C.Date.min()), until=str(C.Date.max()))
    # Prix de la patience : ouverture -> clôture
    O = shin(C[["PSH", "PSD", "PSA"]].to_numpy(float))
    rows = []
    for j, k in enumerate("HDA"):
        po = O[:, j]
        for lab, m in (("favori (≥ 55 %)", po >= 0.55), ("équilibré (35–55 %)", (po >= 0.35) & (po < 0.55)), ("outsider (< 35 %)", po < 0.35)) if k != "D" else (("nul", po > 0),):
            ps_o, ps_c = C[f"PS{k}"].to_numpy(float)[m], C[f"PSC{k}"].to_numpy(float)[m]
            b_o, b_c = C[f"B365{k}"].to_numpy(float)[m], C[f"B365C{k}"].to_numpy(float)[m]
            fc = F[m, j]; ok = ~np.isnan(b_o) & ~np.isnan(b_c)
            rows.append(dict(issue={"H": "domicile", "D": "nul", "A": "extérieur"}[k], profil=lab, n=int(m.sum()),
                             pin_move=float(np.mean(ps_c / ps_o - 1)), pin_short=float(np.mean(ps_c < ps_o)),
                             b365_open_ev=float(np.mean(fc[ok] * b_o[ok] - 1)), b365_close_ev=float(np.mean(fc[ok] * b_c[ok] - 1)),
                             b365_move=float(np.mean(b_c[ok] / b_o[ok] - 1))))
    # Backtest de la règle Top Picks sur 2025-26 (probabilité = 90 % Pinnacle ouverture + 10 % modèle)
    P = pd.read_csv(ROOT / "out" / "engine3_preds.csv")
    P = P[P.season == 2025]
    C2 = C.rename(columns={"Date": "date", "HomeTeam": "home", "AwayTeam": "away"})
    D = P.merge(C2[["date", "home", "away", "PSH", "PSD", "PSA", "B365H", "B365D", "B365A"]], on=["date", "home", "away"], how="inner").dropna(subset=["PSH", "B365H"])
    bt = None
    if len(D) > 300:
        M = shin(D[["PSH", "PSD", "PSA"]].to_numpy(float)); MOD = D[["pH", "pD", "pA"]].to_numpy(float); PR = 0.9 * M + 0.1 * MOD
        res = np.select([D.hg > D.ag, D.hg == D.ag], [0, 1], 2); B = D[["B365H", "B365D", "B365A"]].to_numpy(float)
        k = PR.argmax(1); p = PR[np.arange(len(D)), k]; o = B[np.arange(len(D)), k]; won = (k == res)
        dck = np.where(k == 0, 0, np.where(k == 2, 2, np.where(PR[:, 0] >= PR[:, 2], 0, 2)))  # double chance du côté de l'issue choisie (avec le nul)
        dcw = np.where(dck == 0, res <= 1, res >= 1)
        T = pd.DataFrame(dict(date=D.date, p=p, o=o, won=won, dcw=dcw)); T = T[T.o >= 1.25]
        T = T.sort_values(["date", "p"], ascending=[True, False]).groupby("date").head(8)
        band = lambda lo, hi: T[(T.p >= lo) & (T.p < hi)]
        bt = dict(n=int(len(T)), jours=int(T.date.nunique()), hit=float(T.won.mean()), p_moy=float(T.p.mean()), cote_moy=float(T.o.mean()), roi=float((T.won * T.o).mean() - 1),
                  roi_ic=float(1.96 * (T.won * T.o).std() / math.sqrt(len(T))), dc_hit=float(T.dcw.mean()), par_conf=[dict(lab=f"{int(lo*100)}–{int(hi*100)} %", n=int(len(b)), hit=float(b.won.mean()), p=float(b.p.mean()), roi=float((b.won * b.o).mean() - 1))
                                                     for lo, hi in ((0.7, 1.01), (0.6, 0.7), (0.5, 0.6), (0, 0.5)) for b in [band(lo, hi)] if len(b)])
    out = dict(twins=twins, patience=rows, backtest_top=bt)
    (ROOT / "out").mkdir(exist_ok=True); json.dump(out, open(ROOT / "out" / "insights.json", "w"), ensure_ascii=False, separators=(",", ":"))
    print("jumeaux", twins["n"], "| patience", len(rows), "| backtest", bt and {k: (round(v, 3) if isinstance(v, float) else v) for k, v in bt.items() if k != "par_conf"})
    for r in rows: print(r["issue"], r["profil"], r["n"], f"Pin {r['pin_move']*100:+.1f}%  B365 ouv EV {r['b365_open_ev']*100:+.1f}%  clôt {r['b365_close_ev']*100:+.1f}%")
    if bt: [print(c) for c in bt["par_conf"]]

if __name__ == "__main__": main()
