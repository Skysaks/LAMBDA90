"""Cotes d'ouverture et de clôture Pinnacle et Bet365 (football-data.co.uk, gratuit), saisons récentes.
Sortie : data/closing.csv. Lancé par GitHub Actions (le bac à sable de l'assistant n'a pas accès à ce site).
"""
import io, sys, urllib.request
from pathlib import Path
import pandas as pd
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "data"); OUT.mkdir(exist_ok=True)
DIVS = ["F1", "E0", "E1", "SP1", "D1", "I1", "P1", "N1"]
SEASONS = ["2425", "2526", "2627"]
KEEP = ["Div", "Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "PSH", "PSD", "PSA", "PSCH", "PSCD", "PSCA", "B365H", "B365D", "B365A", "B365CH", "B365CD", "B365CA",
        "P>2.5", "P<2.5", "PC>2.5", "PC<2.5"]
frames = []
for s in SEASONS:
    for d in DIVS:
        url = f"https://www.football-data.co.uk/mmz4281/{s}/{d}.csv"
        try:
            raw = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "lambda90"}), timeout=30).read().decode("latin-1")
        except Exception as e:
            print("absent", url, e); continue
        df = pd.read_csv(io.StringIO(raw)); df = df[[c for c in KEEP if c in df.columns]].dropna(subset=["HomeTeam"])
        df["Date"] = pd.to_datetime(df.Date, dayfirst=True, errors="coerce"); frames.append(df); print(s, d, len(df))
if frames:
    pd.concat(frames).to_csv(OUT / "closing.csv", index=False); print("écrit", OUT / "closing.csv")
