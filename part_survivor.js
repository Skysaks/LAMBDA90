// ---------- Mode Survivant : faire grossir une bankroll sans jamais tomber sous la mise minimale (Game Over) ----------
const SV_STYLE = { prudent: { lab: "Prudent", tol: 0.05 }, equilibre: { lab: "Équilibré", tol: 0.15 }, agressif: { lab: "Agressif", tol: 0.35 } };
const SV_F = [0.02, 0.05, 0.1, 0.15, 0.2, 0.3, 0.5, 1], SV_O = [1.3, 1.5, 1.8, 2.1, 2.6, 3.5];
S.surv = Object.assign({ setup: { cap: 100, mult: 2, days: 14, perDay: 2, minStake: 1, style: "equilibre", edge: null }, run: null, hist: [] }, ls.get("surv", {}));
const saveSurv = () => ls.set("surv", S.surv);
const LG2DIV = { "fr.1": "F1", "en.1": "E0", "es.1": "SP1", "de.1": "D1", "it.1": "I1", "pt.1": "P1", "nl.1": "N1", "en.2": "E1" };
function svRng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
// Avantage mesuré aujourd'hui : écart moyen entre la meilleure cote de tes bookmakers et le prix juste Pinnacle, sur les Top Picks
function svEdgeMeasured() {
  const D = DAILY[parisDay()], T = D?.top?.length ? D.top : livePicks(); if (!T.length) return -0.04;
  return T.reduce((s, x) => s + (x.ev ?? (x.pm * x.o - 1)), 0) / T.length;
}
function svSim(o, f, P, sims = 1200, keepPaths = 0) {
  const p = Math.min(0.97, (1 + P.edge) / o), N = P.days * P.perDay, goal = P.cap * P.mult, rnd = svRng(Math.round(o * 1000 + f * 1e5 + P.cap));
  let ruin = 0, win = 0, sumF = 0; const fin = new Float64Array(sims), paths = keepPaths ? [] : null;
  for (let s = 0; s < sims; s++) {
    let b = P.cap, done = false; const path = keepPaths && s < keepPaths ? [b] : null;
    for (let t = 0; t < N; t++) {
      if (b < P.minStake) { ruin++; done = true; b = 0; } else if (b >= goal) { win++; done = true; }
      if (done) { if (path) while (path.length <= N) path.push(b); break; }
      const st = Math.min(b, Math.max(P.minStake, f * b)); b += rnd() < p ? st * (o - 1) : -st; if (path) path.push(b);
    }
    if (!done) { if (b < P.minStake) { ruin++; b = 0; } else if (b >= goal) win++; }
    fin[s] = b; sumF += b; if (path) { while (path.length <= N) path.push(b); paths.push(path); }
  }
  const sorted = Array.from(fin).sort((x, y) => x - y);
  return { o, f, p, ruin: ruin / sims, win: win / sims, med: sorted[sims >> 1], mean: sumF / sims, loss: Array.from(fin).filter(v => v < P.cap).length / sims, paths };
}
function svGrid(P) {
  const key = JSON.stringify(P); if (S._svg?.key === key) return S._svg.g;
  const g = []; for (const o of SV_O) for (const f of SV_F) g.push(svSim(o, f, P));
  S._svg = { key, g }; return g;
}
function svBest(g, tol) { const ok = g.filter(c => c.ruin <= tol); return ok.length ? ok.reduce((a, b) => b.win > a.win || (b.win === a.win && b.ruin < a.ruin) ? b : a) : g.reduce((a, b) => b.ruin < a.ruin ? b : a); }
const svParams = () => { const s = S.surv.setup; return { cap: +s.cap || 100, mult: +s.mult || 2, days: +s.days || 14, perDay: +s.perDay || 2, minStake: +s.minStake || 1, edge: s.edge == null ? svEdgeMeasured() : +s.edge }; };
const svColor = r => { const a = [0x3d, 0xdc, 0x97], b = [0xff, 0xc8, 0x57], c = [0xff, 0x6b, 0x6b], k = Math.min(1, r / 0.6), m = (x, y, t) => Math.round(x + (y - x) * t);
  const [u, v, t] = k < 0.5 ? [a, b, k * 2] : [b, c, (k - 0.5) * 2]; return (m(u[0], v[0], t) << 16) | (m(u[1], v[1], t) << 8) | m(u[2], v[2], t); };
function svFan(c, P) {
  const r = svSim(c.o, c.f, P, 600, 600), N = P.days * P.perDay, q = [0.1, 0.25, 0.5, 0.75, 0.9].map(qq => Array.from({ length: N + 1 }, (_, t) => { const v = r.paths.map(p => p[t]).sort((a, b) => a - b); return v[Math.floor(qq * (v.length - 1))]; }));
  const W = 640, H = 240, pl = 44, pb = 26, mx = Math.max(P.cap * P.mult * 1.15, ...q[4]), X = t => pl + (W - pl - 8) * t / N, Y = v => 8 + (H - 8 - pb) * (1 - v / mx);
  const area = (lo, hi, op) => `<path d="M${lo.map((v, t) => `${X(t)},${Y(v)}`).join("L")}L${hi.map((v, t) => `${X(N - t)},${Y(hi[N - t])}`).join("L")}Z" fill="var(--signal)" opacity="${op}"/>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" style="max-width:720px;display:block" role="img" aria-label="Éventail des trajectoires de bankroll">
    ${[0, P.cap, P.cap * P.mult].map(v => `<line x1="${pl}" x2="${W - 8}" y1="${Y(v)}" y2="${Y(v)}" stroke="${v === 0 ? "var(--bad)" : v === P.cap ? "var(--line2)" : "var(--good)"}" stroke-dasharray="${v === P.cap ? "3 4" : "0"}"/><text x="${pl - 6}" y="${Y(v) + 4}" text-anchor="end">${nf(v)}</text>`).join("")}
    ${area(q[0], q[4], 0.12)}${area(q[1], q[3], 0.22)}<polyline points="${q[2].map((v, t) => `${X(t)},${Y(v)}`).join(" ")}" fill="none" stroke="var(--signal)" stroke-width="2"/>
    <text x="${W - 8}" y="${Y(P.cap * P.mult) - 6}" text-anchor="end" fill="var(--good)">objectif</text><text x="${W - 8}" y="${H - 6}" text-anchor="end">paris →</text></svg>`;
}

// ---------- Partie ----------
function svResultOf(key) {
  const f = FXK[key]; const [lg, date, home, away] = f ? [f.league, f.date, f.home, f.away] : key.split("|"); const div = LG2DIV[lg]; let best = null, bs = 0;
  for (const r of EXTRA.results || []) { if (r[0] !== div || Math.abs((new Date(r[1]) - new Date(date)) / 864e5) > 1.5) continue;
    const a = L90.nameScore(home, r[2]), b = L90.nameScore(away, r[3]); if (Math.min(a, b) >= 0.5 && a + b > bs) { bs = a + b; best = r; } }
  return best ? { hg: best[4], ag: best[5] } : null;
}
function svSettle() {
  const R = S.surv.run; if (!R || R.status !== "alive") return 0; let n = 0;
  for (const b of R.bets) { if (b.status !== "pending" || !b.key || Date.parse(b.kick || 0) > Date.now() - 2.5 * 3600e3) continue;
    const r = svResultOf(b.key), fn = selFn(b.sel); if (!r || !fn) continue; svApply(b, fn(r.hg, r.ag) ? "won" : "lost", `${r.hg}-${r.ag}`); n++; }
  return n;
}
function svApply(b, res, score) {
  const R = S.surv.run; if (b.status !== "pending") return;
  b.status = res; b.score = score || null; b.settled = Date.now();
  if (res === "won") R.bank += b.stake * (b.o - 1); else if (res === "lost") R.bank -= b.stake;
  R.bank = Math.round(R.bank * 100) / 100; R.peak = Math.max(R.peak, R.bank); R.curve.push(R.bank);
  const pend = R.bets.some(x => x.status === "pending");
  if (R.bank >= R.target && !R.ranked) { R.status = "won"; R.end = Date.now(); }
  else if (R.bank < R.minStake && !pend) { R.status = "over"; R.end = Date.now(); }
  if (R.ranked) svPublish();
  if (R.status !== "alive") { S.surv.hist.push({ ts: R.ts, end: R.end, cap: R.cap, target: R.target, bank: R.bank, peak: R.peak, n: R.bets.filter(x => x.status !== "pending").length, status: R.status }); S.surv.hist = S.surv.hist.slice(-20); }
}
const svAvail = R => R.bank - R.bets.filter(b => b.status === "pending").reduce((s, b) => s + b.stake, 0);
const svPlanStake = R => Math.min(svAvail(R), Math.max(R.minStake, Math.round(R.f * R.bank * 100) / 100));
function svBadges(R) {
  const done = R.bets.filter(b => b.status === "won" || b.status === "lost"), days = (Date.now() - R.ts) / 864e5; let run = 0, best = 0;
  for (const b of done) { run = b.status === "won" ? run + 1 : 0; best = Math.max(best, run); }
  const disc = R.bets.length ? R.bets.filter(b => Math.abs(b.stake - b.plan) <= 0.1 * b.plan + 0.01).length / R.bets.length : 1;
  return [["Premier pari", R.bets.length > 0], ["3 gagnés d'affilée", best >= 3], ["7 jours en vie", days >= 7 && R.status !== "over"], ["Pic à ×1,5", R.peak >= R.cap * 1.5],
    ["Plan respecté sur 5 paris", R.bets.length >= 5 && disc === 1], ["Objectif atteint", R.status === "won"]].map(([l, ok]) => ({ l, ok })).concat([{ disc }]);
}
function svProposals(R) {
  const lo = R.o * 0.93, hi = R.o * 1.15, used = new Set(R.bets.filter(b => b.status === "pending").map(b => b.key));
  const { picks } = ladderPicks({ lo, hi, legs: 1 });
  return picks.filter(p => p.real && !used.has(p.legs[0].f.key) && !started(p.legs[0].f)).filter((p, i, a) => a.findIndex(q => q.legs[0].f.key === p.legs[0].f.key) === i).slice(0, 4);
}

// ---------- Rendu ----------
function renderSurvivor() {
  svSettle(); saveSurv();
  const R = S.surv.run, s = S.surv.setup, P = svParams(), g = svGrid(P), best = svBest(g, SV_STYLE[s.style].tol);
  const meas = svEdgeMeasured();
  $("#v-survivor").innerHTML = `<div class="stack">
    <div class="row" style="justify-content:flex-end"><button class="btn small" data-studio='{"tpl":"survivor"}'>Créer un contenu</button></div>
    <div><span class="eyebrow">Mode jeu</span><h1>Survivant</h1><p class="lede">Une bankroll, un objectif, une seule règle : ne jamais tomber sous la mise minimale. Sinon, Game Over. On fixe d'abord les paramètres ensemble, chiffres à l'appui, puis la partie se joue sur les vrais matchs, réglés avec les vrais résultats.</p></div>
    ${R ? svGame(R) : ""}
    ${svBoardBlock()}
    <div class="panel"><header><h2>${R ? "Préparer la prochaine partie" : "1. Les paramètres"}</h2><span class="note">Tout se recalcule à chaque changement</span></header>
      <div class="row" style="align-items:flex-end">
        <label class="f">Bankroll de départ (€)<input type="number" step="10" id="sv-cap" data-sv="cap" value="${esc(s.cap)}"></label>
        <label class="f">Objectif<select data-svsel="mult">${[1.5, 2, 3, 5, 10].map(m => `<option value="${m}" ${+s.mult === m ? "selected" : ""}>×${nf(m, m % 1 ? 1 : 0)} (${eur(P.cap * m)})</option>`).join("")}</select></label>
        <label class="f">Durée<select data-svsel="days">${[7, 14, 30, 60].map(d => `<option value="${d}" ${+s.days === d ? "selected" : ""}>${d} jours</option>`).join("")}</select></label>
        <label class="f">Paris par jour<select data-svsel="perDay">${[1, 2, 3, 5].map(d => `<option value="${d}" ${+s.perDay === d ? "selected" : ""}>${d}</option>`).join("")}</select></label>
        <label class="f">Mise minimale (€)<input type="number" step="0.1" id="sv-min" data-sv="minStake" value="${esc(s.minStake)}"></label>
        <label class="f">Ton avantage par pari (%)<input type="number" step="0.5" id="sv-edge" data-sv="edge" value="${s.edge == null ? "" : esc(s.edge * 100)}" placeholder="${nf(meas * 100, 1)} auto"></label></div>
      <div class="chips" style="margin-top:10px">${Object.entries(SV_STYLE).map(([k, v]) => `<button class="chip" data-svstyle="${k}" aria-pressed="${s.style === k}">${v.lab} · Game Over ≤ ${pct(v.tol)}</button>`).join("")}</div>
      <p class="note" style="margin-top:8px">Avantage par défaut : ce que rendent aujourd'hui les meilleures cotes de tes bookmakers sur les Top Picks face au prix juste Pinnacle (${sgn(meas)}). Mets une valeur positive seulement si tu sais la justifier (cotes boostées, freebets).</p></div>
    <div class="panel"><header><h2>2. Le plan optimal</h2><span class="note">${nf(SV_F.length * SV_O.length)} plans simulés 1 200 fois chacun</span></header>
      <div class="readouts">
        <div class="ro"><span>Mise par pari</span><b>${pct(best.f)}</b><span>de la bankroll du moment</span></div>
        <div class="ro"><span>Cote visée</span><b>≈ ${odd(best.o)}</b><span>réussite ${pct(best.p)} par pari</span></div>
        <div class="ro"><span>Chance d'atteindre ${eur(P.cap * P.mult)}</span><b class="${best.win > 0.3 ? "pos" : ""}">${pct(best.win, best.win < 0.1 ? 1 : 0)}</b></div>
        <div class="ro"><span>Risque de Game Over</span><b>${pct(best.ruin, best.ruin < 0.1 ? 1 : 0)}</b></div>
        <div class="ro"><span>Chance de finir en perte</span><b>${pct(best.loss)}</b></div>
        <div class="ro"><span>Bankroll médiane à la fin</span><b>${eur(best.med)}</b></div></div>
      ${b3Panel("sv3d")}
      <p class="note">Relief : chance d'atteindre l'objectif pour chaque plan (mise en % de la bankroll × cote visée). Couleur : risque de Game Over, du vert au rouge. Barre cerclée : le plan retenu pour ton profil.</p>
      <h3 style="margin:14px 0 6px">Trajectoires possibles avec ce plan</h3>${svFan(best, P)}
      <p class="note">Bande claire : 80 % des parties ; bande foncée : 50 % ; ligne : la partie médiane.</p>
      <div class="notice-inline">${P.edge < 0 ? `<strong>Ce que disent les mathématiques.</strong> Avec un avantage négatif (${sgn(P.edge)} par pari), chaque pari érode la bankroll en moyenne. Le seul moyen d'augmenter la chance d'atteindre l'objectif est de miser plus gros sur moins de paris (résultat classique de Dubins et Savage, « bold play ») ; miser petit et souvent garantit une lente érosion. Le Survivant montre ce compromis plutôt que de le cacher.` : `<strong>Avantage positif.</strong> Avec ${sgn(P.edge)} par pari, une mise proche du Kelly fractionné fait croître la bankroll tout en limitant le risque de ruine. Vérifie que cet avantage est réel : le journal de valeur et le CLV du Registre sont les seuls juges.`}</div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-svstart="paper">${R?.status === "alive" ? "Recommencer une partie" : "Lancer la partie"} (argent fictif)</button><button class="btn" data-svstart="ranked">Partie classée (100 € fictifs)</button><button class="btn" data-svstart="real">Lancer avec de l'argent réel</button>
        <span class="note">En argent réel, place les paris toi-même chez ton bookmaker ; la page suit et règle.</span></div></div>
    ${S.surv.hist.length ? `<div class="panel"><header><h2>Parties précédentes</h2></header><div class="scroll"><table><thead><tr><th>Début</th><th class="r">Départ</th><th class="r">Objectif</th><th class="r">Pic</th><th class="r">Fin</th><th class="r">Paris</th><th>Issue</th></tr></thead><tbody>
      ${S.surv.hist.slice().reverse().map(h => `<tr><td>${new Date(h.ts).toLocaleDateString("fr-FR")}</td><td class="r num">${eur(h.cap)}</td><td class="r num">${eur(h.target)}</td><td class="r num">${eur(h.peak)}</td><td class="r num">${eur(h.bank)}</td><td class="r num">${h.n}</td><td><span class="pill ${h.status === "won" ? "good" : "bad"}">${h.status === "won" ? "Objectif atteint" : "Game Over"}</span></td></tr>`).join("")}</tbody></table></div></div>` : ""}
  </div>`;
  const spec = { rows: SV_O.map(o => `cote ${odd(o)}`), cols: SV_F.map(f => pct(f)), sx: 1, sz: 1, bw: 0.7, bd: 0.7, ratio: 0.5, maxH: 440, tallMobile: 0.95, elev: 0.6, az: -0.55, mobileRows: true,
    bars: g.map(c => ({ r: SV_O.indexOf(c.o), c: SV_F.indexOf(c.f), h: 0.06 + 3.2 * c.win, color: svColor(c.ruin), glow: c === best,
      tip: `<strong>Mise ${pct(c.f)} · cote ${odd(c.o)}</strong><br>Objectif atteint : <b>${pct(c.win, 1)}</b><br>Game Over : ${pct(c.ruin, 1)}<br>Médiane finale : ${eur(c.med)}` })) };
  b3Mount("sv3d", spec);
}
function svGame(R) {
  const prog = Math.max(0, Math.min(1, (R.bank - 0) / R.target)), pend = R.bets.filter(b => b.status === "pending"), done = R.bets.filter(b => b.status !== "pending");
  const bd = svBadges(R), disc = bd.pop().disc, days = Math.floor((Date.now() - R.ts) / 864e5) + 1, stake = svPlanStake(R);
  if (R.status !== "alive") return `<div class="panel sv-end ${R.status}"><div class="sv-big">${R.status === "won" ? "Objectif atteint" : "Game Over"}</div>
      <p>${R.status === "won" ? `${eur(R.cap)} devenus ${eur(R.bank)} en ${done.length} paris.` : `La bankroll est passée sous la mise minimale (${eur(R.minStake)}) après ${done.length} paris. Pic atteint : ${eur(R.peak)}.`}</p>
      <div class="row" style="justify-content:center"><button class="btn primary" data-svstart="${R.paper ? "paper" : "real"}">Rejouer avec les mêmes paramètres</button>${R.status === "won" ? `<button class="btn" data-svcont="1">Continuer vers ×2 de plus</button>` : ""}</div></div>`;
  return `<div class="panel sv-hud"><header><h2>Partie en cours ${R.ranked ? `<span class="pill info">classée</span>` : ""}${R.paper ? `<span class="pill ghost">argent fictif</span>` : `<span class="pill warn">argent réel</span>`}</h2><button class="btn small" data-svquit="1">Abandonner</button></header>
    <div class="sv-top"><div><span class="eyebrow">Bankroll</span><div class="sv-bank num">${eur(R.bank)}</div><span class="faint">disponible ${eur(svAvail(R))} · départ ${eur(R.cap)} · jour ${days}</span></div>
      <div class="sv-goal"><div class="sv-bar"><i style="width:${prog * 100}%"></i><b style="left:${R.minStake / R.target * 100}%"></b></div><div class="row" style="justify-content:space-between"><span class="faint">Game Over sous ${eur(R.minStake)}</span><span class="faint">${R.ranked ? "repère" : "objectif"} ${eur(R.target)}</span></div></div></div>
    <div class="chips wrap" style="margin-top:10px">${bd.map(b => `<span class="chip" aria-pressed="${b.ok}">${b.ok ? "★ " : ""}${esc(b.l)}</span>`).join("")}<span class="chip">Discipline ${pct(disc)}</span></div>
    <h3 style="margin:14px 0 6px">Paris proposés · plan : ${pct(R.f)} de la bankroll (${eur(stake)}), cote ≈ ${odd(R.o)}</h3>
    ${stake < R.minStake ? `<p class="muted">Plus assez de bankroll disponible : attends le règlement des paris en cours.</p>` : (() => { const pr = svProposals(R); return pr.length ? `<div class="sv-props">${pr.map(p => { const l = p.legs[0];
      return `<div class="hc"><div class="hc-top"><div><strong>${esc(l.lab)}</strong><span class="faint">${esc(short(l.f.home))} – ${esc(short(l.f.away))} · ${esc(kickLab(S.kick[l.f.key] || l.f.date + "T" + (l.f.time || "15:00")))}</span></div>
        <div class="hc-n"><b class="num">${odd(p.o)}</b><span class="faint">${esc((p.book || "").replace(" (FR)", ""))}</span><span class="pill ghost">${pct(p.pr)}</span></div></div>
        <div class="row" style="margin-top:8px"><button class="btn small primary" data-survadd='${esc(JSON.stringify({ key: l.f.key, sel: l.id, o: p.o, p: p.pr, book: p.book, kick: S.kick[l.f.key] || null, lab: l.lab }))}'>Jouer ${eur(stake)}</button></div></div>`; }).join("")}</div>` : `<p class="muted">Aucun match coté autour de ${odd(R.o)} pour l'instant.</p>`; })()}
    ${pend.length ? `<h3 style="margin:14px 0 6px">En cours</h3><div class="scroll"><table><tbody>${pend.map(b => `<tr><td><strong>${esc(b.lab)}</strong><br><span class="faint">${esc(b.match)}</span></td><td class="r num">${odd(b.o)}</td><td class="r num">${eur(b.stake)}</td>
      <td class="r">${R.ranked ? `<span class="pill ghost">${esc(kickLab(b.kick))}</span>` : `<button class="btn small" data-svres="${b.id}|won">Gagné</button> <button class="btn small" data-svres="${b.id}|lost">Perdu</button> <button class="btn small" data-svres="${b.id}|void">Annulé</button>`}</td></tr>`).join("")}</tbody></table></div>
      <p class="note">${R.ranked ? "Partie classée : chaque pari est réglé automatiquement avec le résultat officiel publié le lendemain matin, sans saisie possible." : "Réglés automatiquement avec les résultats publiés chaque matin ; les boutons servent si tu veux régler plus tôt."}</p>` : ""}
    ${done.length ? `<details style="margin-top:10px"><summary>${done.length} paris réglés</summary><div class="scroll"><table><tbody>${done.slice().reverse().map(b => `<tr><td>${esc(b.lab)}<br><span class="faint">${esc(b.match)}${b.score ? " · " + b.score : ""}</span></td><td class="r num">${odd(b.o)}</td><td class="r num">${eur(b.stake)}</td><td><span class="pill ${b.status === "won" ? "good" : b.status === "lost" ? "bad" : "ghost"}">${{ won: "Gagné", lost: "Perdu", void: "Annulé" }[b.status]}</span></td></tr>`).join("")}</tbody></table></div></details>` : ""}</div>`;
}
document.addEventListener("click", e => {
  const t = e.target.closest("[data-svstyle],[data-svstart],[data-svres],[data-survadd],[data-svquit],[data-svcont]"); if (!t) return; const d = t.dataset, s = S.surv;
  if (d.svstyle) s.setup.style = d.svstyle;
  else if (d.svstart) { const ranked = d.svstart === "ranked", P = ranked ? { ...svParams(), cap: 100, minStake: 1 } : svParams(), b = svBest(svGrid(P), SV_STYLE[s.setup.style].tol);
    if (ranked && !(s.profile?.pseudo || "").trim()) { toast("Choisis d'abord un pseudo"); document.getElementById("sv-pseudo")?.focus(); return; }
    s.run = { ts: Date.now(), cap: P.cap, target: P.cap * P.mult, f: b.f, o: b.o, minStake: P.minStake, bank: P.cap, peak: P.cap, curve: [P.cap], bets: [], status: "alive", paper: d.svstart !== "real", ranked };
    if (ranked) svPublish(); toast(ranked ? "Partie classée lancée : bonne chance" : "Partie lancée"); }
  else if (d.svquit) { if (s.run) { s.run.status = "over"; if (s.run.ranked) svPublish(); s.hist.push({ ts: s.run.ts, end: Date.now(), cap: s.run.cap, target: s.run.target, bank: s.run.bank, peak: s.run.peak, n: s.run.bets.length, status: "over" }); s.run = null; } }
  else if (d.svcont) { const R = s.run; R.target = R.bank * 2; R.status = "alive"; }
  else if (d.svres) { if (s.run?.ranked) { toast("Partie classée : réglement automatique uniquement"); return; } const [id, res] = d.svres.split("|"), b = s.run?.bets.find(x => x.id === id); if (b) svApply(b, res); }
  else if (d.survadd) { const R = s.run; if (!R || R.status !== "alive") { toast("Lance d'abord une partie dans l'onglet Survivant"); go("survivor"); return; }
    const x = JSON.parse(d.survadd), f = FXK[x.key], st = svPlanStake(R); if (st < R.minStake || st <= 0) { toast("Bankroll disponible insuffisante"); return; }
    if (R.bets.some(b => b.status === "pending" && b.key === x.key)) { toast("Déjà un pari en cours sur ce match"); return; }
    const kk = Date.parse(x.kick || (f ? S.kick[f.key] || `${f.date}T${f.time || "15:00"}:00` : "")); if (isFinite(kk) && kk < Date.now() + 5 * 60e3) { toast("Trop tard : le match commence dans moins de 5 minutes"); return; }
    if (R.ranked && !selFn(x.sel)) { toast("Partie classée : ce type de pari ne se règle pas automatiquement"); return; }
    R.bets.push({ id: Math.random().toString(36).slice(2, 9), key: x.key, sel: x.sel, lab: x.lab || SELF(f, x.sel), match: f ? `${short(f.home)} – ${short(f.away)}` : x.key.split("|").slice(2).join(" – "), o: +x.o, p: x.p, book: x.book, kick: x.kick || (f ? `${f.date}T${f.time || "15:00"}:00` : null), stake: st, plan: st, status: "pending", ts: Date.now() });
    toast(`Pari ajouté : ${eur(st)} à ${odd(+x.o)}`); if (R.ranked) svPublish(); }
  saveSurv(); render();
});
document.addEventListener("input", e => { const d = e.target.dataset; if (d.sv == null) return; const v = e.target.value, s = S.surv.setup;
  if (d.sv === "edge") s.edge = v === "" ? null : (parseFloat(v.replace(",", ".")) || 0) / 100; else s[d.sv] = v; saveSurv(); deferRender(e.target); });
document.addEventListener("change", e => { const d = e.target.dataset; if (d.svsel == null) return; S.surv.setup[d.svsel] = +e.target.value; saveSurv(); render(); });

// ---------- Classements : Monde, Amis, Ville ----------
S.surv.profile = Object.assign({ pseudo: "", city: "" }, S.surv.profile || {});
S.survBoard = {}; S.svTab = ls.get("svtab", "monde");
const foldTxt = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
let svPubT = null;
function svPublish() {
  clearTimeout(svPubT); svPubT = setTimeout(async () => {
    const R = S.surv.run, pr = S.surv.profile; if (!DB || !UID || !R?.ranked) return;
    const done = R.bets.filter(b => b.status === "won" || b.status === "lost"), prev = S.survBoard[UID] || {};
    const best = Math.max(+prev.best || 1, R.peak / R.cap);
    try { await DB.doc("surv/" + UID).set({ pseudo: String(pr.pseudo).slice(0, 24), city: String(pr.city).slice(0, 40), bank: Math.round(R.bank * 100) / 100, cap: R.cap, peak: Math.round(R.peak * 100) / 100,
      status: R.status, start: R.ts, n: done.length, won: done.filter(b => b.status === "won").length, best: Math.round(best * 1000) / 1000, runs: (+prev.runs || 0) + (prev.start === R.ts ? 0 : 1), updated: Date.now() }); }
    catch (e) { toast("Classement : enregistrement refusé (accès Contributeur requis)"); }
  }, 400);
}
function survSubscribe() {
  if (!DB) return;
  DB.collection("surv").onSnapshot(snap => { const o = {}; for (const d of snap.docs) { const v = d.data(); if (v && typeof v === "object") o[d.id] = v; } S.survBoard = o; if (S.tab === "survivor") render(); }, () => {});
}
function svRows(tab) {
  const me = foldTxt(S.surv.profile.city), friends = new Set([UID, ...S.fan.leagues.flatMap(c => S.fan.members[c] || [])]);
  const num = (x, d = 0) => isFinite(+x) ? +x : d;
  let rows = Object.entries(S.survBoard).map(([uid, v]) => ({ uid, pseudo: String(v.pseudo || "Joueur").slice(0, 24), city: String(v.city || "").slice(0, 40), bank: num(v.bank), cap: num(v.cap, 100) || 100,
    peak: num(v.peak), status: v.status === "alive" ? "alive" : "over", n: num(v.n), won: num(v.won), best: num(v.best, 1), start: num(v.start), updated: num(v.updated) }));
  if (tab === "amis") rows = rows.filter(r => friends.has(r.uid));
  if (tab === "ville") rows = rows.filter(r => me && foldTxt(r.city) === me);
  return rows.sort((a, b) => (b.status === "alive") - (a.status === "alive") || b.bank / b.cap - a.bank / a.cap || b.best - a.best);
}
function svBoardBlock() {
  const pr = S.surv.profile, tab = S.svTab;
  if (!DB) return `<div class="panel"><header><h2>Classements</h2></header><p class="muted">Les classements Monde, Amis et Ville s'affichent quand la page est ouverte connecté à ton compte. Les parties classées y sont publiées automatiquement.</p></div>`;
  const rows = svRows(tab), mine = rows.findIndex(r => r.uid === UID), all = Object.keys(S.survBoard).length;
  const cities = {}; for (const v of Object.values(S.survBoard)) { const c = foldTxt(v.city); if (c) cities[c] = (cities[c] || 0) + 1; }
  return `<div class="panel"><header><h2>Classements Survivant</h2><div class="chips">${[["monde", "Monde"], ["amis", "Amis"], ["ville", pr.city ? esc(pr.city) : "Ma ville"]].map(([k, l]) => `<button class="chip" data-svboard="${k}" aria-pressed="${tab === k}">${l}</button>`).join("")}</div></header>
    <div class="row" style="align-items:flex-end">
      <label class="f">Pseudo<input type="text" id="sv-pseudo" maxlength="24" data-svprof="pseudo" value="${esc(pr.pseudo)}" placeholder="visible par les autres joueurs"></label>
      <label class="f">Ville<input type="text" id="sv-city" maxlength="40" data-svprof="city" value="${esc(pr.city)}" placeholder="ex. Toulouse" list="sv-cities"></label>
      <datalist id="sv-cities">${Object.keys(cities).slice(0, 50).map(c => `<option value="${esc(c.replace(/\b\w/g, m => m.toUpperCase()))}">`).join("")}</datalist>
      <span class="note">Saisis ta ville toi-même : aucune géolocalisation.</span></div>
    ${tab === "amis" && !S.fan.leagues.length ? `<div class="row" style="margin-top:10px;align-items:flex-end"><span class="muted">Le classement Amis regroupe les membres de tes ligues.</span>
        <label class="f">Créer une ligue<input type="text" id="sv-lgname" placeholder="Nom de la ligue"></label><button class="btn small" data-svlg="create">Créer</button>
        <label class="f">ou rejoindre<input type="text" id="sv-lgcode" placeholder="Code à 6 lettres"></label><button class="btn small" data-svlg="join">Rejoindre</button></div>` : ""}
    ${tab === "ville" && !pr.city ? `<p class="muted" style="margin-top:10px">Indique ta ville pour voir les joueurs près de chez toi.</p>` : rows.length ? `<div class="scroll" style="margin-top:12px"><table class="board"><thead><tr><th class="r">#</th><th>Joueur</th><th>Ville</th><th class="r">Bankroll</th><th class="r">×</th><th class="r">Record</th><th class="r">Paris</th><th class="r">Jours</th><th>Statut</th></tr></thead><tbody>
      ${rows.slice(0, 50).map((r, i) => `<tr class="${r.uid === UID ? "me" : ""}"><td class="r num">${i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</td><td><strong>${esc(r.pseudo)}</strong>${r.uid === UID ? ' <span class="pill ghost">toi</span>' : ""}</td><td class="faint">${esc(r.city)}</td>
        <td class="r num">${eur(r.bank)}</td><td class="r num">×${nf(r.bank / r.cap, 2)}</td><td class="r num">×${nf(r.best, 2)}</td><td class="r num">${r.won}/${r.n}</td><td class="r num">${r.start ? Math.max(1, Math.floor(((r.status === "alive" ? Date.now() : r.updated) - r.start) / 864e5) + 1) : "–"}</td>
        <td><span class="pill ${r.status === "alive" ? "good" : "bad"}">${r.status === "alive" ? "en vie" : "Game Over"}</span></td></tr>`).join("")}</tbody></table></div>
      <p class="note" style="margin-top:8px">${mine >= 0 ? `Tu es ${mine + 1}${mine ? "e" : "er"} sur ${rows.length}. ` : ""}${all} joueur${all > 1 ? "s" : ""} au classement Monde. Parties classées uniquement : 100 € fictifs au départ, mise minimale 1 €, paris choisis parmi les cotes de la page au moins 5 minutes avant le coup d'envoi, réglés automatiquement avec les résultats officiels. Classement : joueurs en vie d'abord, puis bankroll.</p>`
      : `<p class="muted" style="margin-top:10px">Personne ici pour l'instant. Lance une partie classée pour ouvrir le classement.</p>`}</div>`;
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-svboard],[data-svlg]"); if (!b) return;
  if (b.dataset.svboard) { S.svTab = b.dataset.svboard; ls.set("svtab", S.svTab); render(); return; }
  if (b.dataset.svlg === "create") createLeague(($("#sv-lgname")?.value || "").trim()); else joinLeague($("#sv-lgcode")?.value || "");
});
document.addEventListener("input", e => { const d = e.target.dataset; if (d.svprof == null) return; S.surv.profile[d.svprof] = e.target.value.slice(0, d.svprof === "pseudo" ? 24 : 40); saveSurv();
  clearTimeout(window._svp); window._svp = setTimeout(() => { if (S.surv.run?.ranked) svPublish(); }, 900); });
