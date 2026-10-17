python3 - <<'PY'
a=open('app.js').read()
parts=''.join(open(p).read()+"\n" for p in ['part_insights.js','part_match.js','part_season.js','part_fan.js','part_story.js','part_ladder.js','part_live3d.js','part_pitch.js','part_market3d.js','part_tools.js','part_daily.js','part_survivor.js','part_innov.js'])
m='// ---------- Rendu général et événements ----------'
open('app_full.js','w').write(a.replace(m, parts+m))
PY
python3 build.py
