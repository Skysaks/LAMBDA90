// ---------- Buts, analyses clés, scénarios, forme, combiné même match ----------
const TIMING = {};
const timingOf = f => TIMING[f.key] ??= L90.goalTiming(C, ...LR(f));
const BINLAB = ["0-15", "15-30", "30-45", "45+", "45-60", "60-75", "75-90", "90+"];
function vbars(items, H = 150) {
  // items : [{lab, v, c, tip, sub}] ; barres verticales, hauteur proportionnelle au max
  const mx = Math.max(...items.map(x => x.v), 1e-9);
  return `<div class="vbars" style="--n:${items.length}">${items.map(x => `<div class="vb" data-tip="${esc(x.tip || "")}">
    <span class="vv num">${x.top ?? pct(x.v)}</span><i style="height:${(H * x.v / mx).toFixed(1)}px;background:${x.c || "var(--signal)"}"></i><span class="vl">${esc(x.lab)}</span>${x.sub ? `<span class="vs faint num">${x.sub}</span>` : ""}</div>`).join("")}</div>`;
}
function teamGoals(f) {
  const M = f.m.M, n = 11, h = [0, 0, 0, 0, 0], a = [0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const p = M[i * n + j]; h[Math.min(4, i)] += p; a[Math.min(4, j)] += p; }
  return [h, a];
}
function goalsBlock(f) {
  const m = f.m, T = timingOf(f), [gh, ga] = teamGoals(f), h = short(f.home), a = short(f.away);
  const tot = [0, 1, 2, 3, 4, 5, 6].map(k => m.total[k] || 0), mode = tot.indexOf(Math.max(...tot));
  const xg = f.lam + f.mu;
  const ranges = [["0 ou 1 but", tot[0] + tot[1]], ["2 ou 3 buts", tot[2] + tot[3]], ["4 buts ou plus", tot[4] + tot[5] + tot[6]], ["Exactement 2 ou 3", tot[2] + tot[3]]].slice(0, 3);
  const firstAt = t => T.firstBy[Math.min(L90.NM, t) - 1];
  const ht00 = 1 - firstAt(48);
  const g5 = LAB.deep?.lab5?.adopte;
  return `<div class="grid2">
    <div class="panel"><header><h2>Nombre de buts dans le match</h2><span class="note">${nf(xg, 2)} buts attendus</span></header>
      ${vbars(tot.map((p, k) => ({ lab: k === 6 ? "6+" : String(k), v: p, c: k === mode ? "var(--signal)" : "var(--d)", sub: odd(1 / p), tip: `${k === 6 ? "6 buts ou plus" : `Exactement ${k} but${k > 1 ? "s" : ""}`}<br><strong>${pct(p, 1)}</strong>, cote juste ${odd(1 / p)}` })))}
      <p class="note" style="margin-top:6px">Sous chaque barre : la cote juste. ${g5 ? `Distribution recalée sur les fréquences réelles (moins de 0-0 et de 6+, plus de 3 et 4 buts que le modèle de Poisson) : gain mesuré hors échantillon, IC 95 % ${nf(g5.ic95[0] * 1000, 1)} à ${nf(g5.ic95[1] * 1000, 1)} ‰ de RPS.` : ""}</p>
      <div class="row" style="margin-top:10px">${ranges.map(([l, p]) => `<span class="pill ghost">${l} : <strong>${pct(p)}</strong> · ${odd(1 / p)}</span>`).join("")}</div></div>
    <div class="panel"><header><h2>Buts de chaque équipe</h2><div class="legend"><span><i class="key h"></i>${esc(h)}</span><span><i class="key a"></i>${esc(a)}</span></div></header>
      <div class="vbars2">${(mxg => [0, 1, 2, 3, 4].map(k => `<div class="vb2"><div class="pair">
        <i style="height:${(125 * gh[k] / mxg).toFixed(1)}px;background:var(--h)" data-tip="${esc(h)} : ${k === 4 ? "4 buts ou plus" : k + " but" + (k > 1 ? "s" : "")}<br><strong>${pct(gh[k], 1)}</strong>"></i>
        <i style="height:${(125 * ga[k] / mxg).toFixed(1)}px;background:var(--a)" data-tip="${esc(a)} : ${k === 4 ? "4 buts ou plus" : k + " but" + (k > 1 ? "s" : "")}<br><strong>${pct(ga[k], 1)}</strong>"></i></div><span class="vl">${k === 4 ? "4+" : k}</span></div>`).join(""))(Math.max(...gh, ...ga))}</div>
      <div class="row" style="margin-top:10px"><span class="pill ghost">${esc(h)} marque : ${pct(1 - gh[0])}</span><span class="pill ghost">${esc(a)} marque : ${pct(1 - ga[0])}</span><span class="pill ghost">${esc(h)} 2+ : ${pct(1 - gh[0] - gh[1])}</span><span class="pill ghost">${esc(a)} 2+ : ${pct(1 - ga[0] - ga[1])}</span></div></div>
  </div>
  <div class="grid2">
    <div class="panel"><header><h2>Quand tombent les buts</h2><span class="note">Moteur live minute par minute</span></header>
      ${vbars(T.bins.map((b, i) => ({ lab: BINLAB[i], v: b.any, c: i === 3 || i === 7 ? "var(--ink3)" : "var(--signal)", tip: `${BINLAB[i]}<br>Au moins un but : <strong>${pct(b.any, 1)}</strong><br>Buts attendus : ${nf(b.xH, 2)} – ${nf(b.xA, 2)}` })), 120)}
      <p class="note" style="margin-top:6px">Probabilité d'au moins un but dans chaque tranche. « 45+ » et « 90+ » : temps additionnel, plus court.</p></div>
    <div class="panel"><header><h2>Premier but</h2></header>
      <div class="readouts"><div class="ro"><span><i class="key h"></i>${esc(h)} ouvre le score</span><b>${pct(T.first.H)}</b></div><div class="ro"><span><i class="key a"></i>${esc(a)} ouvre le score</span><b>${pct(T.first.A)}</b></div>
        <div class="ro"><span>Aucun but</span><b>${pct(T.first.none)}</b></div><div class="ro"><span>Minute médiane du 1er but</span><b>${T.median ? L90.clockLabel(T.median) : "–"}</b></div>
        <div class="ro"><span>But avant la 15e</span><b>${pct(firstAt(15))}</b></div><div class="ro"><span>But avant la 30e</span><b>${pct(firstAt(30))}</b></div><div class="ro"><span>0-0 à la pause</span><b>${pct(ht00)}</b></div></div></div>
  </div>`;
}
// Scénarios : que devient le match si…
function scenarios(f) {
  const h = short(f.home), a = short(f.away), pr = (t, hg, ag, man = 0) => L90.project(C, ...LR(f), t, hg, ag, man, 0);
  const base = pr(0, 0, 0);
  return [
    [`Avant le match`, base],
    [`${h} ouvre le score à la 20e`, pr(20, 1, 0)], [`${a} ouvre le score à la 20e`, pr(20, 0, 1)],
    [`0-0 à la pause`, pr(48, 0, 0)], [`1-1 à l'heure de jeu`, pr(63, 1, 1)],
    [`${h} mène 1-0 à la 75e`, pr(78, 1, 0)], [`${a} mène 0-1 à la 75e`, pr(78, 0, 1)],
    [`Carton rouge pour ${h} à la 30e (0-0)`, pr(30, 0, 0, -1)], [`Carton rouge pour ${a} à la 30e (0-0)`, pr(30, 0, 0, 1)]
  ];
}
function scenarioBlock(f) {
  const rows = scenarios(f), h = short(f.home), a = short(f.away);
  return `<div class="scroll"><table class="scen-t"><thead><tr><th>Si…</th><th class="r"><i class="key h"></i>${esc(h)}</th><th class="r"><i class="key d"></i>Nul</th><th class="r"><i class="key a"></i>${esc(a)}</th><th class="r">+2,5 buts</th></tr></thead><tbody>
    ${rows.map(([lab, r], i) => `<tr${i === 0 ? ' class="faint"' : ""}><td>${esc(lab)}</td><td class="r num">${pct(r.H)}</td><td class="r num">${pct(r.D)}</td><td class="r num">${pct(r.A)}</td><td class="r num">${pct(r.O25)}</td></tr>`).join("")}</tbody></table></div>
    <p class="note" style="margin-top:6px">Calculé par le moteur live (rythme de buts par tranche, effet du score et des cartons rouges, calibré sur ${nf(LIVE.n_matches)} matchs). Point de départ recalé sur les probabilités avant-match affichées en haut.</p>`;
}
const leagueConv = lg => { const xs = FX.filter(x => x.league === lg).flatMap(x => (x.stats || []).filter(Boolean).map(s => s.conv)); return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0.3; };
function seasonOdds(f, team) {
  const sim = EXTRA.sims?.[f.league]; const t = sim?.teams.find(x => x.team === team); if (!t) return null;
  const n = sim.teams.length, top = (k) => t.p.slice(0, k).reduce((s, v) => s + v, 0), drop = t.p.slice(n - (n >= 18 ? 3 : 2)).reduce((s, v) => s + v, 0);
  const rank = [...sim.teams].sort((x, y) => y.pts - x.pts || y.gd - x.gd).findIndex(x => x.team === team) + 1;
  return { title: t.p[0], top4: top(4), drop, rank, n, pts: t.pts, xpts: t.xpts };
}
function keyInsights(f) {
  const m = f.m, h = short(f.home), a = short(f.away), out = [], T = timingOf(f);
  const fav = m.H >= m.A ? "H" : "A", fn = fav === "H" ? h : a, pf = m[fav], bi = fav === "H" ? 0 : 2;
  out.push(["Rapport de force", pf > 0.6 ? `${fn} est nettement favori (${pct(pf)}${f.band ? `, fourchette ${nf(f.band[bi][0] * 100)}–${nf(f.band[bi][1] * 100)}` : ""}). L'outsider gagne quand même ${pct(fav === "H" ? m.A : m.H)} du temps, soit 1 match sur ${nf(1 / (fav === "H" ? m.A : m.H))}.`
    : pf > 0.45 ? `${fn} part devant (${pct(pf)}), mais le nul (${pct(m.D)}) et l'autre issue restent très présents.` : `Match ouvert : aucune issue ne dépasse ${pct(Math.max(m.H, m.D, m.A))}.`]);
  const s = scenarios(f), first = fav === "H" ? s[1][1] : s[2][1], other = fav === "H" ? s[2][1] : s[1][1];
  out.push(["Le premier but pèse lourd", `Si ${fn} ouvre le score à la 20e, sa victoire monte à ${pct(first[fav])}. Si c'est l'adversaire, elle tombe à ${pct(other[fav])}.`]);
  out.push(["Rythme", `Le premier but tombe en médiane vers la ${T.median ? L90.clockLabel(T.median) : "–"}. ${pct(1 - T.firstBy[47])} de 0-0 à la pause, ${pct(T.first.none)} de 0-0 final.`]);
  const tot = [0, 1, 2, 3, 4, 5, 6].map(k => m.total[k] || 0), mode = tot.indexOf(Math.max(...tot));
  out.push(["Buts", `Nombre de buts le plus probable : ${mode} (${pct(tot[mode])}). Au moins 3 buts : ${pct(m.O[2.5])}. Les deux marquent : ${pct(m.BTTS)}.`]);
  const [sa, sb] = f.stats || [];
  if (sa && sb) {
    const dom = x => x.sot / (x.sot + x.sota), lc = leagueConv(f.league);
    const da = dom(sa), db = dom(sb);
    out.push(["Domination", `Part des tirs cadrés du match, sur 12 mois : ${h} ${pct(da)}, ${a} ${pct(db)}. ${Math.abs(da - db) > 0.12 ? `${da > db ? h : a} domine nettement dans le jeu.` : "Deux profils proches."}`]);
    for (const [x, n] of [[sa, h], [sb, a]]) {
      const d = x.conv - lc;
      if (Math.abs(d) > 0.06) out.push(["Finition", `${n} convertit ${pct(x.conv)} de ses tirs cadrés contre ${pct(lc)} en moyenne dans le championnat. ${d > 0 ? "Cette réussite au-dessus de la normale a tendance à revenir vers la moyenne : c'est pourquoi le modèle s'appuie sur les tirs cadrés plutôt que sur les seuls buts." : "Une finition sous la moyenne qui tend à se corriger : l'équipe vaut mieux que ses buts."}`]);
    }
  }
  for (const [team, n] of [[f.home, h], [f.away, a]]) {
    const so = seasonOdds(f, team); if (!so) continue;
    const bits = []; if (so.title > 0.03) bits.push(`titre : ${pct(so.title)}`); if (so.top4 > 0.05 && so.top4 < 0.97) bits.push(`top 4 : ${pct(so.top4)}`); if (so.drop > 0.05) bits.push(`relégation : ${pct(so.drop)}`);
    if (bits.length) out.push(["Enjeu de saison", `${n}, ${so.rank}e avec ${so.pts} points. ${bits.join(", ")} (simulation de 10 000 fins de saison).`]);
  }
  (f.stakes || []).forEach((st, i) => { if (st === "sans enjeu") out.push(["Fin de saison", `${i ? a : h} n'a plus rien à jouer : historiquement, ces équipes marquent 12 % de buts de plus que prévu.`]); });
  const books = S.odds[f.key], sharp = books && Object.keys(books).find(isSharp), mk = sharp ? bookProbs(books[sharp], "1X2") : null;
  if (mk && S.oddsSource !== "demo") { const g = Math.max(...[m.H - mk[0], m.D - mk[1], m.A - mk[2]].map(Math.abs)); if (g >= 0.05) out.push(["Désaccord avec le marché", `Écart de ${nf(g * 100)} points avec Pinnacle. Le plus souvent, le marché sait quelque chose (blessure, rotation) : à vérifier avant tout pari.`]); }
  const news = newsOf(f);
  if (news?.injuries?.length) out.push(["Absents annoncés", news.injuries.slice(0, 6).map(x => `${x.player} (${short(x.team)}, ${frReason(x.reason)})`).join(", ") + ". Effet non intégré au modèle (non prouvé à ce jour) : voir l'onglet Joueurs."]);
  if (news?.lineups?.length) out.push(["Compositions officielles", news.lineups.map(l => `${short(l.team)} en ${l.formation || "?"}`).join(", ") + ". Détail dans l'onglet Joueurs."]);
  return out;
}
// Absents et compositions (API-Football), rapprochés par championnat, date et noms d'équipes
function newsOf(f) {
  const ms = EXTRA.news?.matches; if (!ms) return null;
  let best = null, bs = 0;
  for (const m of Object.values(ms)) {
    if (m.league !== f.league || Math.abs((new Date(m.kickoff) - new Date(f.date + "T12:00")) / 864e5) > 1.2) continue;
    const sh = L90.nameScore(f.home, m.home), sa = L90.nameScore(f.away, m.away);
    if (Math.min(sh, sa) >= 0.5 && sh + sa > bs) { bs = sh + sa; best = m; }
  }
  return best;
}
const frReason = r => {
  r = String(r || ""); if (/^Missing Fixture$/i.test(r) || !r) return "absent"; if (/Questionable/i.test(r)) return "incertain";
  if (/Suspended|Red Card|Yellow Card/i.test(r)) return "suspendu"; if (/Illness/i.test(r)) return "malade"; if (/International/i.test(r)) return "sélection nationale";
  const part = [[/Knee/i, " au genou"], [/Ankle/i, " à la cheville"], [/Hamstring/i, " aux ischio-jambiers"], [/Calf/i, " au mollet"], [/Thigh/i, " à la cuisse"], [/Groin/i, " à l'aine"], [/Foot/i, " au pied"], [/Back/i, " au dos"], [/Shoulder/i, " à l'épaule"], [/Muscle/i, " musculaire"], [/Head|Concussion/i, " à la tête"]].find(([re]) => re.test(r));
  return /Injury|Strain|Sprain|Fracture|Torn|Knock/i.test(r) || part ? "blessure" + (part ? part[1] : "") : r;
};
function newsBlock(f) {
  const n = newsOf(f), list = EXTRA.players[f.league] || [];
  if (!EXTRA.news) return `<div class="panel"><header><h2>Absents et compositions</h2></header><p class="muted">Pas encore branché. Avec une clé API-Football dans les secrets GitHub (API_FOOTBALL_KEY), la mise à jour ajoute ici les blessés et suspendus chaque matin, puis les compositions officielles environ une heure avant le coup d'envoi.</p></div>`;
  if (!n) return `<div class="panel"><header><h2>Absents et compositions</h2></header><p class="muted">Aucune information API-Football pour ce match pour l'instant (mise à jour du ${new Date(EXTRA.news.updated).toLocaleString("fr-FR")}).</p></div>`;
  const side = (team, idx) => {
    const inj = (n.injuries || []).filter(x => L90.nameScore(team, x.team) >= 0.5), lu = (n.lineups || []).find(l => L90.nameScore(team, l.team) >= 0.5);
    const tg = list.filter(p => p.team === team).reduce((s, p) => s + p.goals, 0);
    const share = tg ? inj.reduce((s, x) => s + (list.find(p => p.team === team && L90.nameScore(p.name, x.player) >= 0.75)?.goals || 0), 0) / tg : null;
    return `<div><h3 style="margin:0 0 8px"><i class="key ${idx ? "a" : "h"}"></i> ${esc(short(team))}</h3>
      ${inj.length ? `<ul class="plain">${inj.map(x => `<li>${esc(x.player)} <span class="faint">· ${esc(frReason(x.reason))}${x.type === "Questionable" ? " (incertain)" : ""}</span></li>`).join("")}</ul>` : `<p class="note">Aucun absent signalé.</p>`}
      ${share != null && share > 0 ? `<p class="note">Ces absents ont marqué ${pct(share)} des buts de l'équipe la saison passée.</p>` : ""}
      ${lu ? `<p style="margin-top:8px"><strong>Onze officiel</strong> <span class="faint">(${esc(lu.formation || "")})</span> : ${lu.xi.map(esc).join(", ")}</p>` : ""}</div>`;
  };
  return `<div class="panel"><header><h2>Absents et compositions</h2><span class="note">API-Football · ${new Date(n.lineups_at || n.injuries_at || EXTRA.news.updated).toLocaleString("fr-FR")}</span></header>
    <div class="grid2">${side(f.home, 0)}${side(f.away, 1)}</div>
    <p class="note" style="margin-top:10px">Affiché pour information. L'effet des absences n'est pas intégré aux probabilités : sur une saison de compositions, il n'est pas prouvé au-delà des cotes (voir le Laboratoire). Le test reprendra avec plusieurs saisons de données.</p></div>`;
}
function insightsBlock(f) {
  return `<ol class="insights">${keyInsights(f).map(([t, x]) => `<li><strong>${esc(t)}.</strong> ${esc(x)}</li>`).join("")}</ol>`;
}
function formChips(list) {
  return list.map(([d, home, gf, ga]) => { const r = gf > ga ? "V" : gf === ga ? "N" : "D";
    return `<span class="fchip ${r}" data-tip="${new Date(d + "T12:00").toLocaleDateString("fr-FR")} · ${home ? "domicile" : "extérieur"}<br><strong>${gf}-${ga}</strong>">${r}</span>`; }).join("");
}
function formBlock(f) {
  const [fh, fa] = f.form || [[], []], h = short(f.home), a = short(f.away);
  const h2h = (f.h2h || []).slice().reverse();
  return `<div class="stack" style="gap:10px">
    <div class="frow"><span>${esc(h)}</span><span class="fchips">${formChips(fh) || '<span class="note">–</span>'}</span></div>
    <div class="frow"><span>${esc(a)}</span><span class="fchips">${formChips(fa) || '<span class="note">–</span>'}</span></div>
    <div><h3 style="margin:6px 0">Confrontations directes</h3>${h2h.length ? `<div class="scroll"><table><tbody>${h2h.map(([d, hHome, g1, g2]) => `<tr><td class="faint">${new Date(d + "T12:00").toLocaleDateString("fr-FR")}</td><td>${esc(hHome ? h : a)} ${g1}-${g2} ${esc(hHome ? a : h)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="note">Aucune depuis 2018 dans nos données.</p>`}</div>
    <p class="note">Contexte seulement : la forme sur 5 matchs a été testée et n'améliore pas la prévision une fois la force des équipes connue.</p></div>`;
}
// Combiné même match : probabilité jointe exacte
const COMBO = (h, a) => [
  ["H", `${h} gagne`, (i, j) => i > j], ["D", "Nul", (i, j) => i === j], ["A", `${a} gagne`, (i, j) => i < j],
  ["1N", `${h} ou nul`, (i, j) => i >= j], ["N2", `Nul ou ${a}`, (i, j) => i <= j],
  ["O15", "+1,5 buts", (i, j) => i + j > 1], ["O25", "+2,5 buts", (i, j) => i + j > 2], ["O35", "+3,5 buts", (i, j) => i + j > 3], ["U25", "−2,5 buts", (i, j) => i + j < 3], ["U35", "−3,5 buts", (i, j) => i + j < 4],
  ["BY", "Les deux marquent", (i, j) => i > 0 && j > 0], ["BN", "Une équipe ne marque pas", (i, j) => i === 0 || j === 0],
  ["HS", `${h} marque`, (i) => i > 0], ["AS", `${a} marque`, (i, j) => j > 0], ["HC", `${h} sans encaisser`, (i, j) => j === 0], ["AC", `${a} sans encaisser`, (i) => i === 0],
  ["H2", `${h} gagne de 2+`, (i, j) => i - j >= 2], ["A2", `${a} gagne de 2+`, (i, j) => j - i >= 2]
];
function comboBlock(f) {
  const h = short(f.home), a = short(f.away), list = COMBO(h, a), sel = S.combo[f.key] ||= [];
  const chosen = list.filter(x => sel.includes(x[0]));
  const M = f.m.M, pj = chosen.length ? L90.joint(M, chosen.map(x => x[2])) : null, naive = chosen.reduce((s, x) => s * L90.joint(M, [x[2]]), 1);
  return `<div class="chips wrap">${list.map(([id, lab, fn]) => `<button class="chip" data-combo="${id}" aria-pressed="${sel.includes(id)}">${esc(lab)} <span class="faint num">${pct(L90.joint(M, [fn]))}</span></button>`).join("")}</div>
    ${chosen.length ? `<div class="readouts" style="margin-top:12px"><div class="ro"><span>Probabilité exacte du combiné</span><b>${pct(pj, 1)}</b></div><div class="ro"><span>Cote juste</span><b>${odd(1 / pj)}</b></div>
      ${chosen.length > 1 ? `<div class="ro"><span>Si on multipliait les cotes séparées</span><b>${odd(1 / naive)}</b></div><div class="ro"><span>Corrélation</span><b style="font-size:17px">${pj > naive * 1.03 ? `liées : ×${nf(pj / naive, 2)}` : pj < naive * 0.97 ? `opposées : ×${nf(pj / naive, 2)}` : "quasi indépendantes"}</b></div>` : ""}</div>
      ${(() => { const MMk = mktMatrix(f); if (!MMk || !pj) return "";
        const pm = L90.joint(MMk, chosen.map(x => x[2])), ck = chosen.map(x => x[0]).sort().join("+"), oo = numv((S.cbo ??= {})[f.key + "|" + ck]), e = oo > 1 ? pm * oo - 1 : null;
        return `<div class="readouts" style="margin-top:10px"><div class="ro"><span>Probabilité recalée sur Pinnacle</span><b>${pct(pm, 1)}</b></div><div class="ro"><span>Cote juste (marché)</span><b>${odd(1 / pm)}</b></div>
          <div class="ro"><span>Cote proposée par ton bookmaker</span><input type="number" step="0.01" id="cbo-in" data-cbo="${esc(f.key + "|" + ck)}" value="${oo > 1 ? oo : ""}" placeholder="créateur de paris" style="margin-top:4px;width:100%"></div>
          <div class="ro"><span>${e == null ? "Espérance" : e >= 0 ? "Espérance" : "Marge prélevée"}</span><b class="${e > 0 ? "pos" : ""}">${e == null ? "–" : e >= 0 ? sgn(e) : pct(-e, 1)}</b></div></div>
          <p class="note" style="margin-top:6px">La matrice des scores du modèle est ajustée pour reproduire exactement les probabilités Pinnacle sans marge (1X2 et ±2,5 buts) ; la corrélation entre sélections reste celle du modèle. Les créateurs de paris prélèvent souvent 15 à 30 % : compare avant de jouer.</p>`; })()}
      <p class="note" style="margin-top:6px">${pj === 0 ? "Combinaison impossible." : chosen.length > 1 ? "Les sélections d'un même match ne sont pas indépendantes : la probabilité vient directement de la matrice des scores. Compare la cote juste à celle proposée par ton bookmaker sur son « créateur de paris »." : "Ajoute une deuxième sélection pour voir l'effet de corrélation."}</p>`
      : `<p class="note" style="margin-top:8px">Choisis jusqu'à 4 sélections sur ce match.</p>`}`;
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-combo]"); if (!b) return;
  const sel = S.combo[S.matchKey] ||= [], id = b.dataset.combo;
  if (sel.includes(id)) sel.splice(sel.indexOf(id), 1); else { if (sel.length >= 4) { toast("4 sélections au plus"); return; } sel.push(id); }
  renderMatch();
});
