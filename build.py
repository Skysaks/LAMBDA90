import json
from pathlib import Path
B = Path(__file__).parent
pre = json.load(open(B/'out/prematch.json')); live = json.load(open(B/'out/live.json')); extra = json.load(open(B/'out/extra.json')); lab = json.load(open(B/'out/lab.json'))
v3 = json.load(open(B/'out/engine3_out.json'))
# Moteur v3 : remplace les sorties avant-match, calendrier, simulations et forces
pre = dict(summary=v3['summary'], cal=v3['cal'], registry=v3['registry'], draw=v3['draw'], last_result=v3['params']['last_result'])
extra.update(fixtures=v3['fixtures'], sims=v3['sims'], ratings=v3['ratings'])
v3meta = dict(wtot=v3.get('wtot'), market=v3['market'], side=v3['side'], params=v3['params'], tune=json.load(open(B/'out/engine3_tune.json'))['best'])
af_p = B/'out/lineups.json'  # pipeline/fetch_lineups.py (API-Football)
extra['news'] = json.load(open(af_p)) if af_p.exists() else None
pl_p = B/'out/props_live.json'
extra['props'] = json.load(open(pl_p)) if pl_p.exists() else None
h2_p = B/'out/h2h.json'
extra['h2h'] = json.load(open(h2_p)) if h2_p.exists() else {}
ins_p = B/'out/insights.json'
extra['insights'] = json.load(open(ins_p)) if ins_p.exists() else None
dp_p = B/'data/daily_picks.json'
extra['daily'] = {k: v for k, v in sorted(json.load(open(dp_p)).items())[-45:]} if dp_p.exists() else {}
rc_p = B/'data/recent.csv'
if rc_p.exists():  # résultats des 3 dernières semaines : règlement automatique du mode Survivant et du journal
    import csv, datetime as _dt
    lim = (_dt.date.today() - _dt.timedelta(days=21)).isoformat()
    extra['results'] = [[r['Division'], r['date'], r['home'], r['away'], int(r['hg']), int(r['ag'])] for r in csv.DictReader(open(rc_p)) if r['date'] >= lim]
feed_p = B/'out/feed_odds.json'
feed = json.load(open(feed_p)) if feed_p.exists() else None
live = {k: v for k, v in live.items() if k != 'clock'}
lab.pop('stack_coefs', None)
lab['deep'] = {k: json.load(open(B/f'out/{k}.json')) for k in ('lab2', 'lab2b', 'lab3', 'lab4', 'lab5', 'lab6', 'lab7', 'lab8', 'lab9', 'lab10', 'lab11', 'lab12', 'lab13', 'lab14', 'lab_api', 'value_eval', 'clv') if (B/f'out/{k}.json').exists()}
data = json.dumps(dict(pre=pre, live=live, extra=extra, lab=lab, v3=v3meta, feed=feed), ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
t = open(B/'template.html').read()
t = t.replace('/*__DATA__*/null', data).replace('/*__CORE__*/', open(B/'core.js').read()).replace('/*__APP__*/', open(B/'app_full.js').read())
open(B/'lambda-90.html', 'w').write(t)
print(len(t)//1024, 'KB')
