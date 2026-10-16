// ---------- Match center ----------
const REL = (() => {
  const r = LAB.results, g = k => r[k];
  return {
    res: { cls: "good", txt: `Fiable : RPS ${sgn((PRE.summary.all.rps - PRE.summary.all.rps_base) / PRE.summary.all.rps_base)} vs référence` },
    gap: { cls: "good", txt: `Le plus fiable : ${sgn(g("marche_victoire_dom_par_2").gain)} sur « victoire par 2 buts »` },
    goals: { cls: "warn", txt: `Faible : ${sgn(g("marche_plus_2_5").gain)} sur +2,5 buts` },
    half: { cls: "info", txt: `Testé : RPS ${sgn((g("HT_modele").rps - g("HT_reference").rps) / g("HT_reference").rps)} à la pause` },
    scorer: { cls: "info", txt: `Calibré : Brier ${sgn((EXTRA.validation.buteur.brier - EXTRA.validation.buteur.brier_ref) / EXTRA.validation.buteur.brier_ref)} vs historique seul` }
  };
})();
const relPill = k => `<span class="pill ${REL[k].cls}">${REL[k].txt}</span>`;
function mrow(lab, p, key, an) {
  const b = key && an?.best?.[key]; const e = b && b.o > 1 ? L90.ev(b.p, b.o) : null;
  return `<tr><td>${esc(lab)}</td><td class="r num">${pct(p, 1)}</td><td class="r num">${odd(1 / p)}</td>
    <td class="r num quantonly">${b && b.o > 1 ? `${odd(b.o)} <span class="faint">${esc(b.book)}</span>` : "–"}</td>
    <td class="r quantonly">${e == null ? "–" : `<span class="pill ${e >= S.cfg.minEV ? "good" : e > 0 ? "warn" : "ghost"}">${sgn(e)}</span>`}</td></tr>`;
}
const mhead = `<thead><tr><th>Issue</th><th class="r">Probabilité</th><th class="r">Cote juste</th><th class="r quantonly">Meilleure cote</th><th class="r quantonly">EV</th></tr></thead>`;
function marketsFull(f, an) {
  const m = f.m, h = short(f.home), a = short(f.away), hf = m.half;
  const card = (title, rel, rows) => `<div class="panel"><header><h2>${title}</h2>${relPill(rel)}</header><div class="scroll"><table>${mhead}<tbody>${rows}</tbody></table></div></div>`;
  const res = [mrow("1 " + h, m.H, "H", an), mrow("N", m.D, "D", an), mrow("2 " + a, m.A, "A", an), mrow("1N", m.H + m.D), mrow("N2", m.D + m.A), mrow("12", m.H + m.A),
    mrow(`Remboursé si nul : ${h}`, m.dnb), mrow(`Remboursé si nul : ${a}`, 1 - m.dnb)].join("");
  const ahRows = m.ah.filter(x => [-1.5, -1, -0.5, -0.25, 0, 0.25, 0.5, 1, 1.5].includes(x.L)).map(x => `<tr><td>${esc(h)} ${x.L > 0 ? "+" : ""}${nf(x.L, 2)}</td><td class="r num">${pct(x.win, 1)}</td><td class="r num">${odd(x.fair)}</td></tr>`).join("");
  const gap = [mrow(`${h} gagne par 2 buts ou plus`, (m.margin[2] || 0) + (m.margin[3] || 0)), mrow(`${a} gagne par 2 buts ou plus`, (m.margin[-2] || 0) + (m.margin[-3] || 0)),
    mrow(`${h} gagne par 1 but`, m.margin[1] || 0), mrow(`${a} gagne par 1 but`, m.margin[-1] || 0),
    mrow(`${h} ne prend pas de but`, m.csH), mrow(`${a} ne prend pas de but`, m.csA), mrow(`${h} gagne sans encaisser`, m.wtnH), mrow(`${a} gagne sans encaisser`, m.wtnA)].join("");
  const goals = [mrow("+1,5 buts", m.O[1.5]), mrow("+2,5 buts", m.O[2.5], "O25", an), mrow("−2,5 buts", 1 - m.O[2.5], "U25", an), mrow("+3,5 buts", m.O[3.5]), mrow("+4,5 buts", m.O[4.5]),
    mrow("Les deux marquent", m.BTTS), mrow("Les deux marquent et +2,5", m.bttsO25), mrow(`${h} +0,5`, m.tH[0.5]), mrow(`${h} +1,5`, m.tH[1.5]), mrow(`${a} +0,5`, m.tA[0.5]), mrow(`${a} +1,5`, m.tA[1.5]),
    ...[0, 1, 2, 3, 4, 5].map(k => mrow(`Exactement ${k} but${k > 1 ? "s" : ""}`, m.total[k] || 0)), mrow("6 buts ou plus", m.total[6] || 0), mrow("Total impair", m.odd)].join("");
  const htft = `<div class="scroll"><table class="htft"><thead><tr><th>Mi-temps / fin</th><th class="r">1</th><th class="r">N</th><th class="r">2</th></tr></thead><tbody>
    ${["1", "N", "2"].map((lab, i) => `<tr><th>Mi-temps ${lab}</th>${hf.htft[i].map((p, j) => `<td class="r num" data-tip="Mi-temps ${lab}, fin ${["1", "N", "2"][j]}<br><strong>${pct(p, 1)}</strong>, cote juste ${odd(1 / p)}">${pct(p, 1)}<div class="faint">${odd(1 / p)}</div></td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  const half = [mrow(`Mi-temps : ${h}`, hf.ht[0]), mrow("Mi-temps : nul", hf.ht[1]), mrow(`Mi-temps : ${a}`, hf.ht[2]),
    mrow(`2e période : ${h}`, hf.sh[0]), mrow("2e période : nul", hf.sh[1]), mrow(`2e période : ${a}`, hf.sh[2]),
    mrow("But dans les deux mi-temps", hf.both), mrow("1re mi-temps plus prolifique", hf.more1), mrow("2e mi-temps plus prolifique", hf.more2), mrow("Autant de buts dans chaque mi-temps", hf.eq)].join("");
  return `<div class="grid2">${card("Résultat", "res", res)}${card("Écart de buts", "gap", gap)}</div>
    <div class="grid2"><div class="panel"><header><h2>Handicaps asiatiques</h2>${relPill("gap")}</header><div class="scroll"><table><thead><tr><th>Ligne</th><th class="r">Gain</th><th class="r">Cote juste</th></tr></thead><tbody>${ahRows}</tbody></table></div>
      <p class="note" style="margin-top:8px">Lignes en quart (−0,25, +0,75…) : la mise est partagée sur les deux lignes voisines ; la cote juste intègre les remboursements.</p></div>
    ${card("Buts", "goals", goals)}</div>
    <div class="grid2"><div class="panel"><header><h2>Mi-temps / fin de match</h2>${relPill("half")}</header>${htft}</div>${card("Mi-temps", "half", half)}</div>`;
}
function playersBlock(f) {
  const list = EXTRA.players[f.league];
  if (!list) return `<div class="empty">Données joueurs disponibles pour la Premier League et la Bundesliga (saison 2025-26, compositions, buteurs, cartons). Pour ${LG[f.league]}, il faut brancher une source joueurs : voir Registre, section Données.</div>`;
  const side = (team, lam) => {
    const ps = list.filter(p => p.team === team);
    if (!ps.length) return `<div class="empty">Aucun joueur de ${esc(short(team))} en 2025-26 (équipe promue).</div>`;
    const pk = ps.reduce((b, p) => p.pens > (b?.pens || 0) ? p : b, null);
    const rows = ps.map(p => ({ ...p, prob: 1 - Math.exp(-EXTRA.scorer_k * lam * p.share) })).sort((x, y) => y.prob - x.prob);
    const tm = EXTRA.players[f.league + "_teams"][team];
    return `<div class="panel"><header><h2>${esc(short(team))}</h2><span class="note">${tm ? `${nf(tm.gf / tm.m, 2)} but et ${nf(tm.cards, 1)} carton par match en 2025-26` : ""}</span></header>
      ${pk ? `<p class="muted" style="margin-bottom:8px">Tireur de penalty 2025-26 : <strong>${esc(pname(pk.name))}</strong> (${pk.pens} réussi${pk.pens > 1 ? "s" : ""})</p>` : ""}
      <div class="scroll"><table><thead><tr><th>Joueur</th><th class="r">Titulaire</th><th class="r">Entrées</th><th class="r">Buts</th><th class="r">Cartons</th><th class="r">Buteur</th><th class="r">Cote juste</th></tr></thead><tbody>
      ${rows.slice(0, 12).map(p => `<tr><td>${esc(pname(p.name))}</td><td class="r num">${p.starts}</td><td class="r num">${p.subs}</td><td class="r num">${p.goals}${p.pens ? ` <span class="faint">(${p.pens} pén.)</span>` : ""}</td><td class="r num">${p.yc}${p.rc ? ` + ${p.rc} R` : ""}</td>
        <td class="r num"><strong>${pct(p.prob, 0)}</strong></td><td class="r num">${odd(1 / p.prob)}</td></tr>`).join("")}</tbody></table></div></div>`;
  };
  const refs = EXTRA.refs[f.league] || [];
  return `<p class="lede" style="margin-bottom:12px">Probabilité de marquer au moins un but = 1 − e<sup>−k·λ·part</sup>, où λ est le nombre de buts attendus de l'équipe pour ce match et « part » la part du joueur dans les buts de son équipe en 2025-26. ${relPill("scorer")} Les transferts de l'été et les blessures ne sont pas connus : vérifie la composition avant de parier.</p>
    <div class="grid2">${side(f.home, f.lam)}${side(f.away, f.mu)}</div>
    <div class="panel" style="margin-top:16px"><header><h2>Arbitres et cartons</h2><span class="pill warn">Aucun pouvoir prédictif mesuré</span></header>
      <p class="muted" style="margin-bottom:8px">L'effet « arbitre sévère » a été testé hors échantillon : il dégrade la prévision du nombre de cartons (Brier ${nf(EXTRA.validation.cartons_plus_4_5.brier_modele, 3)} contre ${nf(EXTRA.validation.cartons_plus_4_5.brier_sans_arbitre, 3)} sans arbitre). Les chiffres restent utiles comme contexte.</p>
      <div class="scroll"><table><thead><tr><th>Arbitre</th><th class="r">Matchs 2025-26</th><th class="r">Cartons par match</th></tr></thead><tbody>${refs.slice(0, 10).map(r => `<tr><td>${esc(r.name)}</td><td class="r num">${r.m}</td><td class="r num">${nf(r.avg, 2)}</td></tr>`).join("")}</tbody></table></div></div>`;
}
function statsBlock(f) {
  const [a, b] = f.stats || [];
  if (!a || !b) return `<div class="empty">Statistiques indisponibles pour au moins une des deux équipes (moins de 5 matchs dans ce championnat sur 12 mois).</div>`;
  const rows = [["Buts marqués", "gf"], ["Buts encaissés", "ga"], ["Tirs", "sh"], ["Tirs concédés", "sha"], ["Tirs cadrés", "sot"], ["Tirs cadrés concédés", "sota"], ["Corners", "co"], ["Corners concédés", "coa"], ["Fautes", "fo"], ["Cartons", "ca"]];
  const bar = (x, y, side) => { const t = x + y || 1; return `<div class="sbar ${side}"><i style="width:${(100 * (side === "h" ? x : y) / t).toFixed(1)}%"></i></div>`; };
  return `<div class="stats">${rows.map(([lab, k]) => `<div class="srow"><span class="num">${nf(a[k], 1)}</span>${bar(a[k], b[k], "h")}<span class="slab">${lab}</span>${bar(a[k], b[k], "a")}<span class="num r">${nf(b[k], 1)}</span></div>`).join("")}
    <div class="srow"><span class="num">${pct(a.conv)}</span><span></span><span class="slab">Tirs cadrés convertis</span><span></span><span class="num r">${pct(b.conv)}</span></div></div>
    <p class="note" style="margin-top:8px">Moyennes par match en championnat sur les 12 derniers mois (${a.n} et ${b.n} matchs). Source : football-data.co.uk.</p>`;
}
function confidence(f) {
  const out = [];
  const books = S.odds[f.key];
  if (books) {
    const sharp = Object.keys(books).find(isSharp), mk = sharp ? bookProbs(books[sharp], "1X2") : null;
    const others = Object.entries(books).filter(([b]) => !isSharp(b)).map(([, o]) => bookProbs(o, "1X2")).filter(Boolean);
    const ref = mk || (others.length ? others[0].map((_, i) => others.reduce((s, p) => s + p[i], 0) / others.length) : null);
    if (ref) {
      const gap = Math.max(...[f.m.H - ref[0], f.m.D - ref[1], f.m.A - ref[2]].map(Math.abs));
      out.push(gap < 0.05 ? ["good", `Modèle et marché alignés (écart ${nf(gap * 100)} pts)`] : gap < 0.1 ? ["warn", `Écart modéré avec le marché : ${nf(gap * 100)} pts`]
        : ["bad", `Écart fort avec le marché : ${nf(gap * 100)} pts. Le marché intègre sans doute une info absente du modèle (blessure, rotation, compo)`]);
      out.push(["ghost", `Marché ${sharp ? "Pinnacle" : "consensus"} : ${pct(ref[0])} / ${pct(ref[1])} / ${pct(ref[2])}`]);
      if (S.oddsSource !== "demo") { const b = [0, 1, 2].map(i => 0.1 * [f.m.H, f.m.D, f.m.A][i] + 0.9 * ref[i]); out.push(["good", `Probabilité de référence (90 % marché, 10 % modèle) : ${pct(b[0])} / ${pct(b[1])} / ${pct(b[2])}. Plus fiable que le modèle seul sur le 1N2 avant-match`]); }
    }
  } else out.push(["ghost", "Importe les cotes pour comparer le modèle au marché"]);
  if (f.known && !(f.known[0] && f.known[1])) out.push(["warn", "Une équipe sans historique récent : prudence"]);
  if (f.band) {
    const w = Math.max(...f.band.map(([lo, hi]) => hi - lo));
    out.push(w < 0.12 ? ["good", `Forces des équipes bien estimées (fourchette à 80 % de ${nf(w * 100)} pts au plus)`] : w < 0.2 ? ["ghost", `Fourchette à 80 % de ${nf(w * 100)} pts au plus`]
      : ["warn", `Forces encore mal connues : fourchette à 80 % de ${nf(w * 100)} pts (peu de matchs récents à ce niveau)`]);
  }
  (f.stakes || []).forEach((s, i) => { if (s) out.push([s === "sans enjeu" ? "warn" : "ghost", `${short(i ? f.away : f.home)} : ${s === "sans enjeu" ? "plus rien à jouer, buts attendus ×1,12" : s === "maintien" ? "en lutte pour le maintien" : "dans la course au titre"}`]); });
  out.push(["ghost", `Résultats intégrés jusqu'au ${new Date(lastResult + "T12:00").toLocaleDateString("fr-FR")}`]);
  return out.map(([c, t]) => `<span class="pill ${c} wrapok">${esc(t)}</span>`).join(" ");
}
const bandTxt = (f, j) => f.band ? `<div class="band num" title="Fourchette à 80 % : incertitude sur les forces des équipes">${nf(f.band[j][0] * 100)}–${nf(f.band[j][1] * 100)}</div>` : "";
const pname = n => n.split(" ").map(w => w.length > 1 && w === w.toUpperCase() ? w[0] + w.slice(1).toLowerCase() : w).join(" ");
// Mouvement du marché : probabilités sans marge au fil des instantanés (un par mise à jour), Pinnacle d'abord
function marketMove(f) {
  const H = S.hist[f.key] || {}, src = ["Pinnacle", "Moyenne du marché", "Bet365", "Winamax (FR)", "Betclic (FR)", "Unibet (FR)"].find(b => (H[b] || []).filter(s => s.H > 1).length > 1);
  if (!src) return `<div class="panel"><header><h2>Mouvement du marché</h2></header><p class="muted">Pas encore d'historique pour ce match : un instantané des cotes est pris à chaque mise à jour quotidienne, le mouvement apparaît dès le deuxième.</p></div>`;
  const S_ = H[src].filter(s => s.H > 1 && s.D > 1 && s.A > 1).map(s => { const q = [1 / s.H, 1 / s.D, 1 / s.A], t = q[0] + q[1] + q[2]; return { t: s.t, p: q.map(x => x / t) }; });
  const W = 640, Hh = 150, t0 = S_[0].t, t1 = S_[S_.length - 1].t || t0 + 1, X = t => 34 + (W - 44) * (t1 > t0 ? (t - t0) / (t1 - t0) : 1), all = S_.flatMap(s => s.p), lo = Math.max(0, Math.floor((Math.min(...all) - 0.04) * 20) / 20), hi = Math.min(1, Math.ceil((Math.max(...all) + 0.04) * 20) / 20), Y = p => 10 + (Hh - 30) * (1 - (p - lo) / (hi - lo));
  const col = ["var(--h)", "var(--d)", "var(--a)"], lab = [short(f.home), "Nul", short(f.away)];
  const d0 = S_[0].p, d1 = S_[S_.length - 1].p, mv = [0, 1, 2].map(i => (d1[i] - d0[i]) * 100), big = mv.map(Math.abs).indexOf(Math.max(...mv.map(Math.abs)));
  const when = t => new Date(t).toLocaleString("fr-FR", { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return `<div class="panel"><header><h2>Mouvement du marché</h2><span class="note">${esc(src)} sans marge · ${S_.length} instantanés depuis ${when(t0)}</span></header>
    <svg viewBox="0 0 ${W} ${Hh}" width="100%" role="img" aria-label="Évolution des probabilités du marché">
      ${[lo, (lo + hi) / 2, hi].map(p => `<line x1="30" x2="${W - 10}" y1="${Y(p)}" y2="${Y(p)}" stroke="var(--line)" stroke-width="1"/><text x="0" y="${Y(p) + 4}" fill="var(--ink3)" font-size="11">${Math.round(p * 100)}%</text>`).join("")}
      ${[0, 1, 2].map(i => `<polyline fill="none" stroke="${col[i]}" stroke-width="2.5" stroke-linejoin="round" points="${S_.map(s => `${X(s.t).toFixed(1)},${Y(s.p[i]).toFixed(1)}`).join(" ")}"/><circle cx="${X(t1)}" cy="${Y(d1[i])}" r="3.5" fill="${col[i]}"/>`).join("")}
    </svg>
    <div class="row" style="gap:14px;margin-top:6px">${[0, 1, 2].map(i => `<span><i class="key ${["h", "d", "a"][i]}"></i>${esc(lab[i])} <b class="num">${pct(d1[i])}</b> <span class="faint num">${mv[i] >= 0 ? "+" : ""}${nf(mv[i], 1)} pt${Math.abs(mv[i]) >= 2 ? "s" : ""}</span></span>`).join("")}</div>
    <p class="note" style="margin-top:6px">${Math.abs(mv[big]) >= 2 ? `Le marché a bougé vers ${big === 1 ? "le nul" : esc(lab[big])} (${mv[big] > 0 ? "+" : ""}${nf(mv[big], 1)} pts) : c'est souvent une information (blessure, compo, météo) qui arrive. Le modèle ne la connaît pas.` : "Marché stable depuis le premier instantané."}</p></div>`;
}
function renderMatch() {
  const f = FXK[S.matchKey] || FX[0]; if (!f) { $("#v-match").innerHTML = `<div class="empty">Aucun match à afficher.</div>`; return; }
  S.matchKey = f.key;
  const an = analyse(f), pick = S.fan.myPicks[hash(f.key)];
  const h = short(f.home), a = short(f.away);
  const tabs = [["apercu", "Aperçu"], ["buts", "Buts"], ["scenarios", "Scénarios"], ["marches", "Tous les marchés"], ["joueurs", "Joueurs et discipline"], ["live", "Live"], ["cotes", "Cotes et valeur"]];
  const mt = S.mode === "fan" && S.mtab === "cotes" ? "apercu" : S.mtab;
  let body = "";
  if (mt === "apercu") body = `
    <div class="panel"><header><h2>Analyses clés</h2><span class="note">Calculées à partir des chiffres de cette page</span></header>${insightsBlock(f)}</div>
    <div class="grid2">
      <div class="panel"><header><h2>Ce que dit le modèle</h2>${relPill("res")}</header><div class="stack">${fanText(f)}</div>
        <div class="row" style="margin-top:14px"><span class="pill ghost">Ensemble Dixon-Coles, tirs cadrés et pi-ratings</span><span class="pill ghost">pi ${f.pi > 0 ? "+" : ""}${nf(f.pi, 2)} but d'écart attendu</span></div></div>
      <div class="panel"><header><h2>Scores exacts</h2><span class="note">Top 3 : ${f.m.scores.slice(0, 3).map(s => `${s.s} (${pct(s.p)})`).join(", ")}</span></header>${heatmap(f)}</div>
    </div>
    <div class="panel"><header><h2>Indice de confiance</h2></header><div class="row">${confidence(f)}</div></div>
    <div class="grid2"><div class="panel"><header><h2>Forme et confrontations</h2></header>${formBlock(f)}</div>
    <div class="panel"><header><h2>Statistiques des deux équipes</h2><div class="legend"><span><i class="key h"></i>${esc(h)}</span><span><i class="key a"></i>${esc(a)}</span></div></header>${statsBlock(f)}</div></div>
    <div class="panel"><header><h2>Ton pronostic</h2><button class="btn small" data-tab="fan">Ouvrir les défis</button></header>${pickWidget(f, pick)}</div>
    <div class="panel"><header><h2>Analyse IA du match</h2><button class="btn primary" data-act="ai">Générer l'analyse</button></header>
      <div class="ai" id="aiout">${S.ai[f.key] ? S.ai[f.key] : `<p class="muted">l'assistant rédige une lecture du match à partir des seuls chiffres affichés ici. Il n'a accès à aucune actualité (blessures, compositions).</p>`}</div></div>`;
  else if (mt === "buts") body = goalsBlock(f);
  else if (mt === "scenarios") body = `<div class="panel"><header><h2>Et si…</h2><span class="note">Probabilités recalculées selon le déroulé du match</span></header>${scenarioBlock(f)}</div>
    <div class="panel"><header><h2>Combiné même match</h2><span class="note">Probabilité exacte, corrélations comprises</span></header>${comboBlock(f)}</div>`;
  else if (mt === "marches") body = `<div class="panel"><header><h2>Combiné même match</h2><span class="note">Probabilité exacte, corrélations comprises</span></header>${comboBlock(f)}</div>` + marketsFull(f, an);
  else if (mt === "joueurs") body = `<div class="stack">${newsBlock(f)}${playersBlock(f)}</div>`;
  else if (mt === "live") body = `<div class="panel"><header><h2>Suivi live</h2><span class="note">Moteur minute par minute calibré sur ${LIVE.n_matches} matchs et ${LIVE.n_reds} cartons rouges</span></header>${liveBlock(f)}</div>`;
  else body = `${marketMove(f)}<div class="panel"><header><h2>Cotes des bookmakers</h2>
      <div class="row"><label class="f">Retrait de la marge<select id="devig" data-cfg="devig"><option value="shin">Shin</option><option value="power">Puissance</option><option value="mult">Proportionnel</option><option value="add">Additif</option></select></label>
      <label class="f">Probabilité de référence<select id="ref" data-cfg="ref"><option value="auto">Automatique</option><option value="sharp">Pinnacle sans marge</option><option value="consensus">Consensus du marché</option><option value="blend">Mélange modèle et marché</option><option value="model">Modèle seul</option></select></label></div></header>
      ${oddsEditor(f)}
      <p class="note" style="margin-top:6px">${S.kick[f.key] ? `Coup d'envoi officiel ${new Date(S.kick[f.key]).toLocaleString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" })}. ▲ ▼ : mouvement depuis le premier import.` : "Saisis ou importe des cotes."}</p>
      <h3 style="margin:16px 0 8px">Valeur et arbitrage sur ce match</h3>${valueBlock(f, an)}</div>`;
  $("#v-match").innerHTML = `
  <div class="stack">
    <div class="mhead"><button class="btn small" data-tab="radar">Retour au radar</button><span class="muted">${LG[f.league]}, ${esc(f.round.replace("Matchday", "journée"))}, ${dayName(f.date)} ${esc(f.time || "")}</span></div>
    <div class="panel hero-panel" style="padding:20px">
      <div class="versus"><div class="t">${esc(f.home)} <button class="star" data-fav="${esc(f.home)}" aria-pressed="${S.favs.includes(f.home)}" aria-label="Suivre ${esc(f.home)}">★</button></div><div class="x">contre</div><div class="t e"><button class="star" data-fav="${esc(f.away)}" aria-pressed="${S.favs.includes(f.away)}" aria-label="Suivre ${esc(f.away)}">★</button> ${esc(f.away)}</div></div>
      <div class="versus" style="margin-top:2px"><div class="xg">Buts attendus <strong class="num">${nf(f.lam, 2)}</strong></div><div></div><div class="xg" style="text-align:right">Buts attendus <strong class="num">${nf(f.mu, 2)}</strong></div></div>
      <div class="hero-split">${split(f.m.H, f.m.D, f.m.A)}
        <div class="vals"><div><div class="v">${nf(f.m.H * 100)}<small>%</small></div>${bandTxt(f, 0)}<div class="lab"><i class="key h"></i>Victoire ${esc(h)}</div></div>
          <div class="c"><div class="v">${nf(f.m.D * 100)}<small>%</small></div>${bandTxt(f, 1)}<div class="lab"><i class="key d"></i>Nul</div></div>
          <div class="e"><div class="v">${nf(f.m.A * 100)}<small>%</small></div>${bandTxt(f, 2)}<div class="lab"><i class="key a"></i>Victoire ${esc(a)}</div></div></div>
      </div>
      <div class="row" style="margin-top:16px;justify-content:space-between"><div class="row"><span class="pill ghost">+2,5 buts ${pct(f.m.O[2.5])}</span><span class="pill ghost">Les deux marquent ${pct(f.m.BTTS)}</span><span class="pill ghost">Égalité à la pause ${pct(f.m.half.ht[1])}</span></div>
        <button class="btn primary" data-story="${esc(f.key)}">Voir la story 3D</button></div>
    </div>
    <div class="chips subtabs" role="tablist" aria-label="Sections du match">${tabs.filter(([k]) => !(S.mode === "fan" && k === "cotes")).map(([k, l]) => `<button class="chip" role="tab" data-mtab="${k}" aria-pressed="${mt === k}">${l}</button>`).join("")}</div>
    ${body}
  </div>`;
  const dv = $("#devig"), rf = $("#ref"); if (dv) dv.value = S.cfg.devig; if (rf) rf.value = S.cfg.ref;
  if (mt === "live") { ribbon(f, liveOf(f)); S.l3v === "scores" ? live3dMount(f) : pitchMount(f); }
}
