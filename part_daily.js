// ---------- Onglet Jour : Top Picks, Hot Picks, Cold Games, registre public, jumeaux historiques ----------
const INS = EXTRA.insights || {}, DAILY = EXTRA.daily || {};
const parisDay = (t = Date.now()) => new Date(t + 2 * 3600e3).toISOString().slice(0, 10);
const SELF = (f, id) => { const h = short(f?.home || ""), a = short(f?.away || "");
  return ({ H: `${h} gagne`, D: "Match nul", A: `${a} gagne`, "1N": `${h} ou nul`, N2: `Nul ou ${a}`, "12": `${h} ou ${a}`, O25: "Plus de 2,5 buts", U25: "Moins de 2,5 buts",
    O15: "Plus de 1,5 but", O35: "Plus de 3,5 buts", U35: "Moins de 3,5 buts", BY: "Les deux marquent", BN: "Une équipe ne marque pas",
    HS: `${h} marque`, AS: `${a} marque`, HC: `${h} sans encaisser`, AC: `${a} sans encaisser`, H2: `${h} gagne de 2+`, A2: `${a} gagne de 2+` })[id] || id; };
const selFn = id => ({ H: (i, j) => i > j, D: (i, j) => i === j, A: (i, j) => i < j, "1N": (i, j) => i >= j, N2: (i, j) => i <= j, "12": (i, j) => i !== j,
  O15: (i, j) => i + j > 1, O25: (i, j) => i + j > 2, O35: (i, j) => i + j > 3, U25: (i, j) => i + j < 3, U35: (i, j) => i + j < 4, BY: (i, j) => i > 0 && j > 0, BN: (i, j) => i === 0 || j === 0,
  HS: i => i > 0, AS: (i, j) => j > 0, HC: (i, j) => j === 0, AC: i => i === 0, H2: (i, j) => i - j >= 2, A2: (i, j) => j - i >= 2 })[id];
const fxOf = it => FXK[it.key] || { home: it.home, away: it.away, league: it.league, date: (it.kick || "").slice(0, 10), key: it.key, _ghost: true };
const kickLab = iso => new Date(iso).toLocaleString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" });
function ring(p, size = 64, col = "var(--good)", txt) {
  const r = size / 2 - 5, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, p));
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${pct(p)}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line2)" stroke-width="5"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${c * v} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" class="ring-t" style="font-size:${size * 0.24}px">${txt ?? nf(v * 100) + "%"}</text></svg>`;
}

// ---------- Jumeaux historiques : les matchs passés aux cotes de clôture les plus proches ----------
function twinsOf(f, k = 150) {
  const T = INS.twins; if (!T?.n || !f?.m) return null;
  const fair = fairOf(f), h0 = (fair?.H ?? f.m.H) * 1000, a0 = (fair?.A ?? f.m.A) * 1000, o0 = (fair?.O25 ?? f.m.O[2.5]) * 1000;
  const d = new Float64Array(T.n); for (let i = 0; i < T.n; i++) { const x = T.h[i] - h0, y = T.a[i] - a0, z = T.o[i] - o0; d[i] = x * x + y * y + 0.5 * z * z; }
  const idx = [...d.keys()].sort((x, y) => d[x] - d[y]).slice(0, k), sc = idx.map(i => [T.s[i] >> 4, T.s[i] & 15]);
  const rate = fn => sc.filter(([i, j]) => fn(i, j)).length / sc.length, cnt = {};
  for (const [i, j] of sc) cnt[`${i}-${j}`] = (cnt[`${i}-${j}`] || 0) + 1;
  return { n: sc.length, H: rate((i, j) => i > j), D: rate((i, j) => i === j), A: rate((i, j) => i < j), O25: rate((i, j) => i + j > 2), BY: rate((i, j) => i > 0 && j > 0),
    goals: sc.reduce((s, [i, j]) => s + i + j, 0) / sc.length, top: Object.entries(cnt).sort((x, y) => y[1] - x[1]).slice(0, 3), rate, dist: Math.sqrt(d[idx[idx.length - 1]]) / 10, pool: T.n };
}
function twinsBlock(f) {
  const t = twinsOf(f); if (!t) return "";
  const fair = fairOf(f), ref = fair ? "Pinnacle sans marge" : "modèle";
  return `<div class="panel"><header><h2>Jumeaux historiques</h2><span class="note">${t.n} matchs passés aux cotes de clôture les plus proches, sur ${nf(t.pool)}</span></header>
    <div class="twins"><div class="tw-bar" role="img" aria-label="Résultats des jumeaux"><i style="flex:${t.H};background:var(--h)"></i><i style="flex:${t.D};background:var(--ink3)"></i><i style="flex:${t.A};background:var(--a)"></i></div>
      <div class="tw-leg"><span><b class="num">${pct(t.H)}</b> ${esc(short(f.home))}</span><span><b class="num">${pct(t.D)}</b> nul</span><span><b class="num">${pct(t.A)}</b> ${esc(short(f.away))}</span></div></div>
    <div class="readouts" style="margin-top:12px"><div class="ro"><span>Buts par match</span><b>${nf(t.goals, 2)}</b></div><div class="ro"><span>Plus de 2,5 buts</span><b>${pct(t.O25)}</b></div>
      <div class="ro"><span>Les deux marquent</span><b>${pct(t.BY)}</b></div><div class="ro"><span>Scores les plus fréquents</span><b style="font-size:17px">${t.top.map(([s, n]) => `${s} <span class="faint">${pct(n / t.n)}</span>`).join(" · ")}</b></div></div>
    <p class="note" style="margin-top:8px">Ce qui s'est réellement passé dans les ${t.n} matchs de 2024 à 2026 dont les probabilités de clôture ressemblaient le plus à celles de ce match (${ref}). Un écart entre jumeaux et probabilités vient surtout du hasard : sur ${t.n} matchs, ±${nf(196 * Math.sqrt(0.25 / t.n))} points.</p></div>`;
}

// ---------- Arguments chiffrés d'une sélection ----------
function argsFor(f, id, it = {}) {
  const out = [], fair = fairOf(f), t = twinsOf(f), fn = selFn(id);
  const pm = it.pm ?? (fair && ({ H: fair.H, D: fair.D, A: fair.A, O25: fair.O25, U25: fair.U25, "1N": fair.H + fair.D, N2: fair.D + fair.A, "12": fair.H + fair.A })[id]);
  const pmod = it.pmod ?? (f.m && fn ? L90.joint(f.m.M, [fn]) : null);
  if (pm != null) out.push(`Marché de référence (Pinnacle sans marge) : ${pct(pm, 1)}${pmod != null ? ` ; modèle Lambda : ${pct(pmod, 1)}${Math.abs(pmod - pm) < 0.03 ? ", d'accord" : pmod > pm ? `, plus optimiste de ${nf((pmod - pm) * 100, 1)} pts` : `, plus prudent de ${nf((pm - pmod) * 100, 1)} pts`}` : ""}.`);
  if (t && fn) out.push(`Jumeaux historiques : sur les ${t.n} matchs passés les plus semblables, cette issue est passée ${pct(t.rate(fn))} du temps.`);
  if (f.lam != null && /O|U|B/.test(id)) out.push(`Buts attendus : ${nf(f.lam, 2)} pour ${short(f.home)}, ${nf(f.mu, 2)} pour ${short(f.away)}.`);
  const st = f.stats || [];
  if (/^(H|1N|12)$/.test(id) && st[0] && st[1]) out.push(`${short(f.home)} : ${nf(st[0].sot, 1)} tirs cadrés par match, ${short(f.away)} en concède ${nf(st[1].sota, 1)}.`);
  if (/^(A|N2)$/.test(id) && st[0] && st[1]) out.push(`${short(f.away)} : ${nf(st[1].sot, 1)} tirs cadrés par match, ${short(f.home)} en concède ${nf(st[0].sota, 1)}.`);
  const fm = f.form || [[], []], side = /^(A|N2)$/.test(id) ? 1 : /^(H|1N)$/.test(id) ? 0 : -1;
  if (side >= 0 && fm[side]?.length) { const L = fm[side], w = L.filter(x => x[2] > x[3]).length, l = L.filter(x => x[2] < x[3]).length; out.push(`Forme récente de ${short(side ? f.away : f.home)} : ${w} victoire${w > 1 ? "s" : ""}, ${l} défaite${l > 1 ? "s" : ""} sur ${L.length} (contexte : la forme n'ajoute rien au modèle une fois la force connue).`); }
  if (it.o && pm) { const fairO = 1 / pm; out.push(`Meilleure cote chez toi : ${odd(it.o)} (${(it.book || "").replace(" (FR)", "")}) pour une cote juste de ${odd(fairO)} : ${it.o >= fairO ? `au-dessus du prix juste (${sgn(it.o * pm - 1)})` : `marge payée ${pct(1 - it.o * pm, 1)}`}.`); }
  if (it.b365 && it.b365 > it.o) out.push(`Bet365 affiche ${odd(it.b365)} dans son dernier fichier : à vérifier sur le site, le prix a pu bouger.`);
  if (it.lag) out.push(`Cote en retard : Pinnacle a fait monter cette issue de ${nf((it.dp || 0) * 100, 1)} pts depuis le premier relevé, la cote de tes bookmakers n'a pas suivi.`);
  if ((it.book || "") === "Bet365") out.push("Cote Bet365 tirée d'un fichier mis à jour deux fois par semaine : vérifie-la sur le site avant de jouer.");
  const p = it.p ?? pm; if (p) out.push(`Échoue en moyenne ${p > 0.5 ? `1 fois sur ${nf(1 / (1 - p), 1)}` : `${nf((1 - p) * 10, 0)} fois sur 10`}.`);
  return out;
}
const COLD_WHY = (w, f) => ({
  flat: () => `Aucune issue au-dessus de ${pct(w[1])} : match ouvert, le résultat se joue à pile ou face.`,
  disagree: () => `Modèle et marché divergent de ${nf(Math.abs(w[2]) * 100, 1)} pts sur « ${SELF(f, w[1])} » : le marché sait sans doute quelque chose (composition, contexte) que le modèle ignore.`,
  band: () => `Incertitude du modèle élevée : intervalle de ${nf(w[1] * 100)} pts sur une issue (équipe peu observée ou promue).`,
  margin: () => `Tes bookmakers français prélèvent ${pct(w[1], 1)} de marge sur ce match, contre 4 à 6 % chez Pinnacle.`,
  move: () => `La cote Pinnacle a bougé de ${nf(Math.abs(w[1]) * 100, 1)} pts depuis le premier relevé : une information est arrivée.`
})[w[0]]?.() || "";

// ---------- Calcul en direct si le registre du jour n'existe pas encore ----------
function livePicks() {
  const today = parisDay(), out = [];
  for (const f of FX) {
    if (started(f) || f.date !== today) continue; const fair = fairOf(f); if (!fair) continue;
    const pr = {}; for (const k of B3_SEL) if (fair[k] != null) pr[k] = 0.9 * fair[k] + 0.1 * (k === "O25" ? f.m.O[2.5] : k === "U25" ? 1 - f.m.O[2.5] : f.m[k]);
    let best = null; for (const k of Object.keys(pr)) { const b = bestMine(f, k); if (b && b.o >= 1.25 && (!best || pr[k] > best.p)) best = { sel: k, p: pr[k], pm: fair[k], o: b.o, book: b.book }; }
    if (!best) continue; const res = ["H", "D", "A"].reduce((x, y) => pr[y] > pr[x] ? y : x, "H");
    out.push({ key: f.key, kick: S.kick[f.key] || `${f.date}T${f.time || "15:00"}:00`, home: f.home, away: f.away, league: f.league, ...best, ev: best.pm * best.o - 1, res: { sel: res, p: pr[res] } });
  }
  return out.sort((a, b) => b.p - a.p).slice(0, 8);
}
function dayRecap() {
  const days = Object.keys(DAILY).sort(), today = parisDay(), rows = [];
  for (const d of days) { const T = (DAILY[d].top || []).filter(x => "won" in x); if (!T.length) continue;
    rows.push({ d, n: T.length, w: T.filter(x => x.won).length, rn: T.filter(x => x.res).length, rw: T.filter(x => x.res?.won).length, dw: T.filter(x => x.dc?.won).length, T }); }
  return { last: rows.filter(r => r.d < today).pop() || rows[rows.length - 1], rows, today };
}

// ---------- Rendu ----------
function renderDaily() {
  const today = parisDay(), D = DAILY[today], live = !D?.top?.length, top = live ? livePicks() : D.top, hot = D?.hot || [], cold = D?.cold || [];
  const R = dayRecap(), bt = INS.backtest_top, L = R.last;
  const spot = top[0] && FXK[top[0].key] ? top[0] : null;
  const tot = R.rows.reduce((a, r) => ({ n: a.n + r.n, w: a.w + r.w }), { n: 0, w: 0 });
  $("#v-daily").innerHTML = `<div class="stack">
    <div class="day-head"><div><span class="eyebrow">${new Date(today + "T12:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</span><h1>Le jour en un coup d'œil</h1>
      <p class="lede">Les sélections les plus solides, celles où le prix est intéressant, et les matchs à laisser passer. Tout est figé chaque matin à 7 h puis réglé avec les vrais résultats : le registre ne peut pas être retouché après coup.</p></div>
      <div class="row"><button class="btn small" data-share="top" ${top.length ? "" : "disabled"}>Image du Top</button>${L ? `<button class="btn small" data-share="recap">Image du bilan</button>` : ""}</div></div>
    <div class="recap">${L ? `<div class="recap-ring">${ring(L.w / L.n, 132, "var(--good)", `${L.w}/${L.n}`)}</div>
        <div><span class="eyebrow">Bilan · ${new Date(L.d + "T12:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</span><h2 class="recap-t">picks justes</h2>
          <p class="muted" style="margin:4px 0 0">Résultat (1N2) : <b>${L.rw}/${L.rn}</b> · Double chance : <b>${L.dw}/${L.rn}</b>${R.rows.length > 1 ? ` · Depuis l'ouverture : <b>${tot.w}/${tot.n}</b> (${pct(tot.w / tot.n)})` : ""}</p>
          <div class="recap-list">${L.T.map(x => `<span class="rc ${x.won ? "ok" : "ko"}" title="${esc(SELF(fxOf(x), x.sel))}">${esc(short(x.home))} ${x.hg}-${x.ag} ${esc(short(x.away))}</span>`).join("")}</div></div>`
      : `<div class="recap-ring">${bt ? ring(bt.hit, 132, "var(--signal)", pct(bt.hit)) : ""}</div><div><span class="eyebrow">Registre ouvert le 17 octobre 2026</span><h2 class="recap-t">Premier bilan dès les premiers résultats</h2>
          ${bt ? `<p class="muted" style="margin:4px 0 0">En attendant : la même règle rejouée sur 2025-26 (${nf(bt.n)} picks, ${bt.jours} journées) : <b>${pct(bt.hit, 1)}</b> de réussite pour ${pct(bt.p_moy, 1)} annoncés, double chance <b>${pct(bt.dc_hit, 1)}</b>, rendement aux cotes Bet365 ${sgn(bt.roi)} (± ${nf(bt.roi_ic * 100, 1)} pts : non distinguable de zéro).</p>` : ""}</div>`}</div>
    <div class="panel"><header><h2>Top Picks du jour</h2><span class="note">${live ? "Calcul en direct : le registre de ce matin n'est pas encore publié" : `Figés le ${new Date(D.made).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`} · ${top.length} sélection${top.length > 1 ? "s" : ""}</span></header>
      ${top.length ? `<ol class="tp">${top.map((x, i) => pickRowDaily(x, i)).join("")}</ol>` : `<div class="empty">Aucun match coté par Pinnacle aujourd'hui.</div>`}
      <p class="note" style="margin-top:8px">Probabilité : 90 % marché Pinnacle sans marge + 10 % modèle, le meilleur mélange mesuré. Une sélection par match, cote réelle d'au moins 1,25 chez tes bookmakers. Plus haut ne veut pas dire rentable : c'est le Hot qui parle du prix.</p></div>
    ${spot ? spotlight(spot) : ""}
    <div class="grid2">
      <div class="panel hotp"><header><h2>Hot Picks</h2><span class="note">Prix intéressant au vu du marché</span></header>
        ${hot.length ? hot.map(x => hotCard(x)).join("") : `<div class="empty">${live ? "Publiés avec le registre du matin." : "Aucune sélection au prix juste aujourd'hui chez tes bookmakers."}</div>`}
        <p class="note">Critères, sur les 48 prochaines heures : meilleure cote du jour chez Winamax, Betclic ou Unibet à moins de 4 % du prix juste Pinnacle (ou au-dessus), modèle pas plus prudent de 5 points, bonus si la cote est en retard sur un mouvement Pinnacle. Bet365 n'entre pas dans le calcul (cotes jusqu'à 4 jours). Hot ne veut pas dire sûr.</p></div>
      <div class="panel coldp"><header><h2>Cold Games</h2><span class="note">Matchs à laisser passer</span></header>
        ${cold.length ? cold.map(x => coldCard(x)).join("") : `<div class="empty">${live ? "Publiés avec le registre du matin." : "Aucun match signalé."}</div>`}
        <p class="note">Score d'alerte : issues serrées, désaccord modèle-marché, incertitude du modèle, marge élevée, mouvement de cote. Chaque critère est affiché.</p></div></div>
    ${R.rows.length ? `<div class="panel"><header><h2>Registre</h2><span class="note">${R.rows.length} journée${R.rows.length > 1 ? "s" : ""} réglée${R.rows.length > 1 ? "s" : ""}</span></header><div class="scroll"><table><thead><tr><th>Jour</th><th class="r">Picks</th><th class="r">Résultat 1N2</th><th class="r">Double chance</th><th class="r">Proba moyenne</th></tr></thead><tbody>
      ${R.rows.slice().reverse().map(r => `<tr><td>${new Date(r.d + "T12:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</td><td class="r num">${r.w}/${r.n}</td><td class="r num">${r.rw}/${r.rn}</td><td class="r num">${r.dw}/${r.rn}</td><td class="r num">${pct(r.T.reduce((s, x) => s + x.p, 0) / r.n)}</td></tr>`).join("")}</tbody></table></div></div>` : ""}
    ${bt ? `<div class="panel"><header><h2>La règle rejouée sur 2025-26</h2><span class="note">${nf(bt.n)} picks, cotes Bet365 d'ouverture</span></header><div class="scroll"><table><thead><tr><th>Confiance annoncée</th><th class="r">Picks</th><th class="r">Annoncé</th><th class="r">Réalisé</th><th class="r">Rendement</th></tr></thead><tbody>
      ${bt.par_conf.map(c => `<tr><td>${esc(c.lab)}</td><td class="r num">${c.n}</td><td class="r num">${pct(c.p, 1)}</td><td class="r num"><strong>${pct(c.hit, 1)}</strong></td><td class="r num">${sgn(c.roi)}</td></tr>`).join("")}</tbody></table></div>
      <p class="note" style="margin-top:8px">Annoncé et réalisé se suivent : les probabilités sont calibrées. Le rendement oscille autour de zéro, comme attendu face à un marché efficient ; les écarts par tranche viennent du faible nombre de paris.</p></div>` : ""}
  </div>`;
}
function pickRowDaily(x, i) {
  const f = fxOf(x), sel = SELF(f, x.sel), done = "won" in x;
  return `<li class="tp-row"><div class="tp-rank">${i + 1}</div><div class="tp-main"><strong>${esc(sel)}</strong><span class="faint">${esc(short(f.home))} – ${esc(short(f.away))} · ${esc(LG[x.league] || "")} · ${esc(kickLab(x.kick))}</span>
      <details class="tp-why"><summary>Pourquoi</summary><ul>${argsFor(f._ghost ? { ...f, m: null } : f, x.sel, x).map(a => `<li>${esc(a)}</li>`).join("")}</ul></details></div>
    <div class="tp-odds"><b class="num">${odd(x.o)}</b><span class="faint">${esc((x.book || "").replace(" (FR)", ""))}${x.ofr && x.bookfr !== x.book ? ` · ${odd(x.ofr)} ${esc(x.bookfr.replace(" (FR)", ""))}` : ""}</span>${done ? `<span class="pill ${x.won ? "good" : "bad"}">${x.hg}-${x.ag}</span>` : ""}</div>
    <div class="tp-ring">${ring(x.p, 62, x.p >= 0.7 ? "var(--good)" : x.p >= 0.55 ? "var(--signal)" : "var(--warn)")}</div>
    <div class="tp-act">${done ? "" : `<button class="btn small" data-survadd='${esc(JSON.stringify({ key: x.key, sel: x.sel, o: x.o, p: x.p, book: x.book, kick: x.kick }))}'>Survivant</button>
      <button class="btn small" data-bet='${esc(JSON.stringify({ matchKey: x.key, label: short(f.home) + " – " + short(f.away), market: /O|U/.test(x.sel) ? "OU25" : "1X2", sel: x.sel, book: x.book, odds: x.o, stake: Math.round(S.cfg.bank * L90.kelly(x.pm || x.p, x.o, S.cfg.kfrac, S.cfg.cap) * 100) / 100, p: x.pm || x.p }))}'>Journal</button>`}</div></li>`;
}
function hotCard(x) {
  const f = fxOf(x);
  return `<div class="hc"><div class="hc-top"><div><strong>${esc(SELF(f, x.sel))}</strong><span class="faint">${esc(short(f.home))} – ${esc(short(f.away))} · ${esc(kickLab(x.kick))}</span></div>
      <div class="hc-n"><b class="num">${odd(x.o)}</b><span class="faint">juste ${odd(1 / x.pm)}</span><span class="pill ${x.ev >= 0 ? "good" : "ghost"}">${sgn(x.ev)}</span>${x.lag ? `<span class="pill info">cote en retard</span>` : ""}${"won" in x ? `<span class="pill ${x.won ? "good" : "bad"}">${x.hg}-${x.ag}</span>` : ""}</div></div>
    <ul class="hc-why">${argsFor(f._ghost ? { ...f, m: null } : f, x.sel, x).slice(0, 4).map(a => `<li>${esc(a)}</li>`).join("")}</ul></div>`;
}
function coldCard(x) {
  const f = fxOf(x), t = f._ghost ? null : twinsOf(f);
  return `<div class="cc"><div class="hc-top"><div><strong>${esc(short(f.home))} – ${esc(short(f.away))}</strong><span class="faint">${esc(LG[x.league] || "")} · ${esc(kickLab(x.kick))}</span></div><span class="pill bad">alerte ${nf(x.score, 1)}</span></div>
    <ul class="hc-why">${x.why.map(w => `<li>${esc(COLD_WHY(w, f))}</li>`).join("")}${t ? `<li>${esc(`Ses ${t.n} jumeaux historiques : ${pct(t.H)} / ${pct(t.D)} / ${pct(t.A)}, aucun scénario dominant.`)}</li>` : ""}</ul></div>`;
}
// Probabilités Poisson simples pour corners et cartons à partir des moyennes des deux équipes
const poisCdf = (k, l) => { let s = 0, t = Math.exp(-l); for (let i = 0; i <= k; i++) { s += t; t *= l / (i + 1); } return s; };
function moreOf(lh, la) { const pm = l => { const a = [Math.exp(-l)]; for (let i = 1; i < 40; i++) a[i] = a[i - 1] * l / i; return a; }, A = pm(lh), B = pm(la); let h = 0, d = 0;
  for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) { const p = A[i] * B[j]; if (i > j) h += p; else if (i === j) d += p; } return [h, d, 1 - h - d]; }
function spotlight(x) {
  const f = FXK[x.key], M = mktMatrix(f) || f.m.M, J = fn => L90.joint(M, [fn]), H = J((i, j) => i > j), Dd = J((i, j) => i === j), A = 1 - H - Dd;
  const O = J((i, j) => i + j > 2), BY = J((i, j) => i > 0 && j > 0), st = f.stats || [], h = short(f.home), a = short(f.away);
  let corners = "", cards = "";
  if (st[0] && st[1]) {
    const ch = (st[0].co + st[1].coa) / 2, ca = (st[1].co + st[0].coa) / 2, [mh, ml, ma] = moreOf(ch, ca), pc = 1 - poisCdf(9, ch + ca), kc = st[0].ca + st[1].ca, pk = poisCdf(4, kc);
    corners = `<div class="sp-card"><span>Corners</span><div class="sp-ring">${ring(pc, 76, "var(--warn)")}<b>Plus de 9,5</b></div><small>${nf(ch + ca, 1)} attendus</small></div>
      <div class="sp-card"><span>Cartons</span><div class="sp-ring">${ring(pk, 76, "var(--warn)")}<b>Moins de 4,5</b></div><small>${nf(kc, 1)} attendus</small></div>`;
    cards = `<div class="sp-wide"><span>Plus de corners</span>${triBar(mh, ml, ma, h, "Égalité", a)}</div>`;
  }
  return `<div class="panel spot"><header><div><span class="eyebrow">Pick du jour</span><h2>${esc(h)} – ${esc(a)}</h2><span class="faint">${esc(LG[f.league])} · ${esc(kickLab(x.kick))}</span></div><button class="btn small" data-open="${esc(f.key)}">Analyse complète</button></header>
    <div class="sp-wide"><span>Résultat · notre pick : ${esc(SELF(f, x.sel))}</span>${triBar(H, Dd, A, h, "Nul", a)}</div>
    <div class="sp-grid"><div class="sp-card"><span>Buts</span><div class="sp-ring">${ring(O, 76, "var(--warn)")}<b>Plus de 2,5</b></div><small>${nf(f.lam + f.mu, 2)} attendus</small></div>
      <div class="sp-card"><span>Les deux marquent</span><div class="sp-ring">${ring(BY, 76, "var(--warn)")}<b>Oui</b></div><small>${pct(1 - BY)} non</small></div>${corners}</div>${cards}
    <p class="note">Résultat, buts et « les deux marquent » : matrice des scores recalée sur Pinnacle. Corners et cartons : estimation de Poisson sur les moyennes des deux équipes cette saison, moins fiable (non validée sur historique).</p></div>`;
}
const triBar = (p1, p2, p3, l1, l2, l3) => `<div class="tri"><i style="flex:${p1};background:var(--good)"></i><i style="flex:${p2};background:var(--ink3)"></i><i style="flex:${p3};background:#7FA3FF"></i></div>
  <div class="tri-l"><span><b class="num">${pct(p1)}</b>${esc(l1)}</span><span style="text-align:center"><b class="num">${pct(p2)}</b>${esc(l2)}</span><span style="text-align:right"><b class="num">${pct(p3)}</b>${esc(l3)}</span></div>`;

// ---------- Images à partager (1080 × 1350) ----------
function shareCanvas(kind) {
  const c = document.createElement("canvas"); c.width = 1080; c.height = 1350; const x = c.getContext("2d"), today = parisDay();
  const g = x.createLinearGradient(0, 0, 1080, 1350); g.addColorStop(0, "#0b1426"); g.addColorStop(1, "#070b14"); x.fillStyle = g; x.fillRect(0, 0, 1080, 1350);
  const rg = x.createRadialGradient(860, 120, 20, 860, 120, 700); rg.addColorStop(0, "rgba(159,231,245,.16)"); rg.addColorStop(1, "rgba(159,231,245,0)"); x.fillStyle = rg; x.fillRect(0, 0, 1080, 1350);
  const F = (w, s) => `${w} ${s}px "Unbounded","Segoe UI",sans-serif`, P = (w, s) => `${w} ${s}px "IBM Plex Sans","Segoe UI",sans-serif`;
  const arc = (cx, cy, r, p, col, lw = 10) => { x.lineCap = "round"; x.lineWidth = lw; x.strokeStyle = "rgba(124,136,168,.25)"; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke(); x.strokeStyle = col; x.beginPath(); x.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * p); x.stroke(); };
  const hdr = kind === "recap" ? (dayRecap().last?.d || today) : today; x.fillStyle = "#9FE7F5"; x.font = P("600", 30); x.fillText(new Date(hdr + "T12:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }).toUpperCase(), 72, 110);
  if (kind === "top") {
    const top = (DAILY[today]?.top?.length ? DAILY[today].top : livePicks()).slice(0, 6);
    x.fillStyle = "#E9EEFB"; x.font = F("600", 108); x.fillText(`TOP ${top.length}`, 72, 240); x.font = P("500", 38); x.fillStyle = "#A6B1CC"; x.fillText("les sélections les plus solides du jour", 72, 300);
    top.forEach((t, i) => { const y = 340 + i * 140, f = fxOf(t); x.fillStyle = "rgba(18,27,48,.85)"; x.beginPath(); x.roundRect(60, y, 960, 128, 24); x.fill(); x.strokeStyle = "rgba(43,58,93,.9)"; x.lineWidth = 2; x.stroke();
      x.fillStyle = "#3DDC97"; x.font = F("500", 60); x.fillText(String(i + 1), 96, y + 86); x.fillStyle = "#E9EEFB"; x.font = P("600", 40); x.fillText(SELF(f, t.sel).slice(0, 30), 180, y + 60);
      x.fillStyle = "#7C88A8"; x.font = P("400", 28); x.fillText(`${short(f.home)} – ${short(f.away)} · cote ${odd(t.o)}`.slice(0, 46), 180, y + 102);
      arc(940, y + 64, 44, t.p, "#3DDC97"); x.fillStyle = "#E9EEFB"; x.font = F("500", 28); x.textAlign = "center"; x.fillText(`${Math.round(t.p * 100)}%`, 940, y + 74); x.textAlign = "left"; });
  } else {
    const L = dayRecap().last; if (!L) return null;
    arc(220, 300, 130, L.w / L.n, "#3DDC97", 22); x.fillStyle = "#E9EEFB"; x.font = F("600", 84); x.textAlign = "center"; x.fillText(`${L.w}/${L.n}`, 220, 330); x.textAlign = "left";
    x.font = F("600", 64); x.fillText("picks justes", 400, 290); x.fillStyle = "#A6B1CC"; x.font = P("500", 36); x.fillText(`Résultat 1N2 : ${L.rw}/${L.rn} · Double chance : ${L.dw}/${L.rn}`, 400, 350);
    L.T.slice(0, 7).forEach((t, i) => { const y = 470 + i * 100; x.fillStyle = "rgba(18,27,48,.85)"; x.beginPath(); x.roundRect(60, y, 960, 88, 20); x.fill();
      x.fillStyle = "#E9EEFB"; x.font = P("600", 34); x.fillText(`${short(t.home)}  ${t.hg}-${t.ag}  ${short(t.away)}`.slice(0, 40), 96, y + 56);
      x.fillStyle = t.won ? "#3DDC97" : "#FF6B6B"; x.beginPath(); x.arc(970, y + 44, 26, 0, 7); x.fill(); x.fillStyle = "#070b14"; x.font = F("700", 26); x.textAlign = "center"; x.fillText(t.won ? "✓" : "✗", 970, y + 54); x.textAlign = "left"; });
  }
  x.fillStyle = "#9FE7F5"; x.beginPath(); x.roundRect(72, 1210, 64, 64, 14); x.fill(); x.fillStyle = "#06212A"; x.font = F("700", 36); x.textAlign = "center"; x.fillText("λ", 104, 1255); x.textAlign = "left";
  x.fillStyle = "#E9EEFB"; x.font = F("600", 40); x.fillText("Lambda 90", 156, 1256); x.fillStyle = "#7C88A8"; x.font = P("400", 24); x.fillText("Probabilités, pas de certitudes. Jouer comporte des risques : 09 74 75 13 13", 72, 1318);
  return c;
}
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-share]"); if (!b) return;
  const c = shareCanvas(b.dataset.share); if (!c) return;
  let dl = null; try { dl = await globalThis[["cl","aude"].join("")]?.use?.("downloads"); } catch {}
  const blob = await new Promise(r => c.toBlob(r, "image/png"));
  if (!dl) { const u = URL.createObjectURL(blob); const w = window.open(u, "_blank"); if (!w) toast("Téléchargement indisponible dans cette vue"); return; }
  try { await dl.save({ filename: `lambda90-${b.dataset.share}-${parisDay()}.png`, data: blob }); } catch (er) { if (er?.code !== "cancelled") toast("Téléchargement refusé"); }
});
