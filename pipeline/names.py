"""Rapprochement des noms d'équipes entre sources (The Odds API, football-data, Understat, Transfermarkt)."""
import re, unicodedata
EXPAND = {"man": "manchester", "utd": "united", "ath": "atletico", "ein": "eintracht", "nottm": "nottingham", "mgladbach": "monchengladbach",
          "wolves": "wolverhampton", "st": "saint", "weds": "wednesday", "sp": "sporting", "qpr": "queens", "espanol": "espanyol", "cologne": "koln",
          "munich": "munchen"}
DROP = {"fc", "afc", "cf", "sc", "ac", "as", "ssc", "rc", "cd", "ud", "rcd", "sv", "tsg", "vfb", "vfl", "fk", "the", "and", "de", "of", "club", "football",
        "1", "1899", "1901", "1904", "1909", "04", "05", "07", "29", "calcio", "hove", "albion", "hotspur", "town", "city", "county", "rovers"}
ALIAS = {"paris saint germain": "paris sg", "paris saint-germain": "paris sg", "psg": "paris sg", "inter milan": "inter", "internazionale": "inter",
         "fc internazionale milano": "inter", "vitoria sc": "guimaraes", "vitoria guimaraes": "guimaraes", "fc porto": "porto", "real betis": "betis",
         "real racing club de santander": "santander", "racing santander": "santander", "atletico madrid": "ath madrid", "athletic bilbao": "ath bilbao",
         "athletic club": "ath bilbao", "sporting lisbon": "sp lisbon", "sporting cp": "sp lisbon", "braga": "sp braga", "sc braga": "sp braga",
         "fortuna sittard": "for sittard", "nec nijmegen": "nijmegen", "real sociedad": "sociedad", "rayo vallecano": "vallecano", "celta vigo": "celta",
         "ac milan": "milan", "hellas verona": "verona", "sheffield wednesday": "sheffield weds", "west bromwich albion": "west brom"}
def fold(n):
    n = unicodedata.normalize("NFD", str(n))
    return "".join(c for c in n if unicodedata.category(c) != "Mn").lower().replace("'", "").replace(".", " ").strip()
def toks(n):
    f = fold(n); f = ALIAS.get(f, f); out = []
    for w in re.split(r"[^a-z0-9]+", f):
        if not w: continue
        w = EXPAND.get(w, w)
        if w not in DROP: out.append(w)
    return out or [f]
def sim(a, b):
    A, B = toks(a), toks(b)
    hit = sum(1 for x in A if any(x == y or (len(x) >= 5 and len(y) >= 5 and x[:5] == y[:5]) for y in B))
    return (hit / len(A) + hit / len(B)) / 2
def best_pair(h, a, cands):
    """cands : liste de (clé, nom_dom, nom_ext). Renvoie la clé du meilleur match si l'appariement est net, sinon None."""
    sc = sorted(((sim(h, ch) + sim(a, ca), k) for k, ch, ca in cands), key=lambda x: -x[0])
    if not sc or sc[0][0] < 0.9: return None
    if len(sc) > 1 and sc[1][0] >= sc[0][0] - 0.2: return None
    return sc[0][1]
