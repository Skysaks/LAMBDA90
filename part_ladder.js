// ---------- Objectif ×2 : montante par paliers ----------
S.lad = Object.assign({ cap: 10, steps: 4, lo: 1.85, hi: 2.25, legs: 2, secure: 0, est: true }, ls.get("lad", {}));
S.ladRun = ls.get("ladRun", null); S.ladHist = ls.get("ladHist", []);
const saveLad = () => { ls.set("lad", S.lad); ls.set("ladRun", S.ladRun); ls.set("ladHist", S.ladHist); };
const LSEL = ["H", "D", "A", "1N", "N2", "12", "O15", "O25", "U25", "U35", "BY", "BN", "HS", "AS"];  // O15, U35, HS, AS : marchés naturellement autour de 75-85 %
function avgMargin() {
  const xs = []; for (const books of Object.values(S.odds)) for (const [b, o] of Object.entries(books)) if (isANJ(b) && ["H", "D", "A"].every(k => o[k] > 1)) xs.push(L90.overround([o.H, o.D, o.A]));
  return xs.length ? { m: xs.reduce((s, v) => s + v, 0) / xs.length, n: xs.length } : { m: 0.07, n: 0 };
}
function ladderCands() {
  const mg = avgMargin(), out = [];
  for (const f of FX) {
    if (started(f)) continue;
    const h = short(f.home), a = short(f.away), M = f.m.M, defs = Object.fromEntries(COMBO(h, a).map(x => [x[0], x]));
    defs["12"] = ["12", `${h} ou ${a} (pas de nul)`, (i, j) => i !== j];
    const books = S.odds[f.key] || {}, b = f.band;
    const lowOf = { H: b?.[0][0], D: b?.[1][0], A: b?.[2][0], "1N": b && 1 - b[2][1], N2: b && 1 - b[0][1], "12": b && 1 - b[1][1] };
    // référence marché : Pinnacle sans marge, sinon consensus des autres bookmakers (moyenne des probabilités sans marge)
    const mref = market => { const sh = Object.keys(books).find(isSharp), p = sh ? bookProbs(books[sh], market) : null; if (p) return { p, src: "Pinnacle" };
      const all = Object.values(books).map(o => bookProbs(o, market)).filter(Boolean); if (all.length < 3) return null;
      return { p: all[0].map((_, i) => all.reduce((t, x) => t + x[i], 0) / all.length), src: `consensus de ${all.length} bookmaker${all.length > 1 ? "s" : ""}` }; };
    const r1 = S.oddsSource === "demo" ? null : mref("1X2"), r2 = S.oddsSource === "demo" ? null : mref("OU25");
    const mk1 = r1?.p, mk2 = r2?.p;
    const mkp = { H: mk1?.[0], D: mk1?.[1], A: mk1?.[2], "1N": mk1 && mk1[0] + mk1[1], N2: mk1 && mk1[1] + mk1[2], "12": mk1 && mk1[0] + mk1[2], O25: mk2?.[0], U25: mk2?.[1] };
    for (const id of LSEL) {
      const d = defs[id]; if (!d) continue;
      const p = L90.joint(M, [d[2]]);
      const pm = mkp[id] ?? null, pr = pm ? 0.1 * p + 0.9 * pm : p, msrc = ["O25", "U25"].includes(id) ? r2?.src : r1?.src;
      let o = 0, book = null;
      const byBook = {};
      if (["H", "D", "A", "O25", "U25"].includes(id)) for (const [bk, v] of Object.entries(books)) { if (!bookOK(bk) || !(v[id] > 1)) continue; byBook[bk] = v[id]; if (v[id] > o) { o = v[id]; book = bk; } }
      const real = o > 1;
      // cote estimée : ce qu'un bookmaker agréé proposerait, à partir du prix du marché s'il existe (sinon du modèle)
      if (!real) { if (!S.lad.est) continue; o = Math.round(100 / ((pm ?? p) * (1 + mg.m))) / 100; book = "estimée"; }
      out.push({ f, id, lab: d[1], p, pm, pr, msrc, low: lowOf[id] ?? null, o, book, real, byBook });
    }
  }
  return { list: out, mg };
}
function ladderPicks(o = {}) {
  const { list, mg } = ladderCands(), lo = o.lo ?? S.lad.lo, hi = o.hi ?? S.lad.hi, legs = o.legs ?? S.lad.legs, res = [];
  for (const c of list) if (c.o >= lo && c.o <= hi) res.push({ legs: [c], o: c.o, p: c.p, pr: c.pr, real: c.real, book: c.book, date: c.f.date });
  if (legs >= 2) {
    const lo2 = Math.sqrt(lo) * 0.82, hi2 = Math.sqrt(hi) * 1.22;
    const pool = list.filter(c => c.o >= Math.max(1.12, lo2) && c.o <= hi2).sort((x, y) => y.pr * y.o - x.pr * x.o).slice(0, 160);
    for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
      const x = pool[i], y = pool[j]; if (x.f.key === y.f.key) continue;
      // un combiné se joue chez un seul bookmaker : meilleure cote commune aux deux matchs
      let o = 0, book = null;
      if (x.real && y.real) { for (const b of Object.keys(x.byBook)) if (y.byBook[b] && x.byBook[b] * y.byBook[b] > o) { o = x.byBook[b] * y.byBook[b]; book = b; } if (!book) continue; }
      else { o = x.o * y.o; book = "estimée"; }
      if (o < lo || o > hi) continue;
      res.push({ legs: [x, y], o, p: x.p * y.p, pr: x.pr * y.pr, real: x.real && y.real, book, date: x.f.date > y.f.date ? x.f.date : y.f.date });
    }
  }
  for (const r of res) r.ev = r.pr * r.o - 1;
  // avec de vraies cotes, une sélection sans référence marché (modèle seul) passe après celles que le marché confirme (lab7 : excès de confiance du modèle)
  const anyReal = S.oddsSource !== "demo" && res.some(r => r.legs.every(l => l.pm != null));
  res.sort((x, y) => (anyReal ? (y.legs.every(l => l.pm != null) - x.legs.every(l => l.pm != null)) : 0) || y.pr - x.pr || y.ev - x.ev);
  return { picks: res, mg };
}
function ladderPlan(picks, n) {
  // un palier par date, matchs tous différents ; la meilleure sélection disponible à chaque date
  const used = new Set(), plan = []; let lastDate = "";
  const dates = [...new Set(picks.map(p => p.date))].sort();
  for (const d of dates) {
    if (plan.length >= n) break; if (d <= lastDate) continue;
    const best = picks.find(p => p.date === d && p.legs.every(l => !used.has(l.f.key) && l.f.date > lastDate));
    if (!best) continue; best.legs.forEach(l => used.add(l.f.key)); plan.push(best); lastDate = d;
  }
  return plan;
}
// ---------- Montante intégrale : 100 % du capital à chaque palier, paliers enchaînés dans le temps ----------
S.lint = Object.assign({ steps: 7, prof: "x2", pace: "serre", legs: 1 }, ls.get("lint", {}));
const LINT_PROF = { x2: { lo: 1.85, hi: 2.25, lab: "Cote ≈ 2" }, x15: { lo: 1.4, hi: 1.6, lab: "Cote ≈ 1,5" }, x13: { lo: 1.22, hi: 1.38, lab: "Cote ≈ 1,3" } };
const kickOf = f => { const k = Date.parse(S.kick[f.key] || ""); return isFinite(k) ? k : Date.parse(`${f.date}T${f.time || "15:00"}:00`); };
function chainPlan(picks, n, paceH) {
  const now = Date.now(), END = 115 * 60e3;  // un match et sa marge : 1 h 55 avant de pouvoir enchaîner
  const cand = picks.map(p => { const ks = p.legs.map(l => kickOf(l.f)); return { p, start: Math.min(...ks), end: Math.max(...ks) + END }; }).filter(c => c.start > now + 10 * 60e3);
  const used = new Set(), plan = []; let t = now;
  for (let k = 0; k < n; k++) {
    const ok = cand.filter(c => c.start >= t && c.p.legs.every(l => !used.has(l.f.key)));
    if (!ok.length) break;
    const first = Math.min(...ok.map(c => c.start));
    const pool = ok.filter(c => c.start <= first + paceH * 3600e3);
    const best = pool.reduce((a, c) => (c.p.pr > a.p.pr ? c : a));
    plan.push(best); best.p.legs.forEach(l => used.add(l.f.key)); t = best.end;
  }
  return plan;
}
function lintBlock() {
  const L = S.lint, P = LINT_PROF[L.prof], { picks } = ladderPicks({ lo: P.lo, hi: P.hi, legs: L.legs });
  const plan = chainPlan(picks, L.steps, L.pace === "serre" ? 6 : 20), cap = +S.lad.cap || 10;
  let reach = 1, stake = cap; const rows = plan.map((c, k) => { reach *= c.p.pr; stake *= c.p.o; return { c, k, reach, stake }; });
  const done = rows.length, last = rows[done - 1];
  const fmtT = ms => new Date(ms).toLocaleString("fr-FR", { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const par = [1, 2, 3, 4].map(k => ({ k, p: last ? 1 - Math.pow(1 - last.reach, k) : 0, mise: cap / k, gain: last ? cap / k * (last.stake / cap) : 0 }));
  const ev = last ? last.reach * last.stake : 0;
  S._lintPlan = plan;
  return `<div class="panel"><header><h2>Montante intégrale</h2><span class="note">100 % du capital remis en jeu à chaque palier</span></header>
    <div class="chips" role="group" aria-label="Nombre de paliers">${[5, 6, 7, 8, 9, 10].map(n => `<button class="chip" data-lint="steps" data-v="${n}" aria-pressed="${L.steps === n}">${n} paliers</button>`).join("")}</div>
    <div class="chips" style="margin-top:8px" role="group" aria-label="Profil de cote">${Object.entries(LINT_PROF).map(([k, v]) => `<button class="chip" data-lint="prof" data-v="${k}" aria-pressed="${L.prof === k}">${v.lab}</button>`).join("")}
      <button class="chip" data-lint="legs" data-v="${L.legs === 1 ? 2 : 1}" aria-pressed="${L.legs === 2}">Autoriser les doubles</button>
      <button class="chip" data-lint="pace" data-v="${L.pace === "serre" ? "jour" : "serre"}" aria-pressed="${L.pace === "jour"}">Plus sûr, plus lent</button></div>
    ${done ? `<div class="readouts" style="margin-top:14px">
        <div class="ro"><span>Départ</span><b>${eur(cap)}</b></div>
        <div class="ro"><span>Si les ${done} paliers passent</span><b>${eur(last.stake)}</b></div>
        <div class="ro"><span>Chance d'aller au bout</span><b>${pct(last.reach, last.reach < 0.1 ? 1 : 0)}</b></div>
        <div class="ro"><span>Soit</span><b>1 sur ${nf(1 / last.reach)}</b></div>
        <div class="ro"><span>Chance de tout perdre</span><b>${pct(1 - last.reach, 1)}</b></div>
        <div class="ro"><span>Ce que tu récupères en moyenne</span><b>${eur(ev)}</b></div></div>
      <div class="scroll" style="margin-top:12px"><table><thead><tr><th>Palier</th><th>Quand</th><th>Sélection</th><th class="r">Cote</th><th class="r">Proba</th><th class="r">Capital après</th><th class="r">Chance d'y arriver</th></tr></thead><tbody>
      ${rows.map(({ c, k, reach, stake }) => `<tr><td class="num">${k + 1}</td><td class="faint" style="white-space:nowrap">${fmtT(c.start)}</td><td>${c.p.legs.map(lg => `<strong>${esc(lg.lab)}</strong> <span class="faint">${esc(short(lg.f.home))} – ${esc(short(lg.f.away))}</span>`).join("<br>")}</td>
        <td class="r num">${odd(c.p.o)}${c.p.real ? `<br><span class="faint">${esc((c.p.book || "").replace(" (FR)", ""))}</span>` : ' <span class="pill ghost">est.</span>'}</td><td class="r num">${pct(c.p.pr)}</td><td class="r num">${eur(stake)}</td><td class="r num"><strong>${pct(reach, reach < 0.1 ? 1 : 0)}</strong></td></tr>`).join("")}</tbody></table></div>
      ${done < L.steps ? `<p class="note" style="margin-top:8px">Seulement ${done} paliers enchaînables avec les matchs cotés à venir : chaque palier doit être terminé avant le suivant. Les autres apparaîtront quand les cotes des journées suivantes seront publiées.</p>` : ""}
      <div class="grid2" style="margin-top:14px">
        <div><h3 style="margin:0 0 8px">Partager le capital entre plusieurs montantes</h3><div class="scroll"><table><thead><tr><th>Montantes</th><th class="r">Mise chacune</th><th class="r">Au moins une réussit</th><th class="r">Gain d'une réussite</th></tr></thead><tbody>
          ${par.map(x => `<tr><td class="num">${x.k}</td><td class="r num">${eur(x.mise)}</td><td class="r num">${pct(x.p, x.p < 0.1 ? 1 : 0)}</td><td class="r num">${eur(x.gain)}</td></tr>`).join("")}</tbody></table></div>
          <p class="note">Avec des sélections de même qualité et des matchs différents. Plus de chances d'en réussir une, gain divisé d'autant : l'espérance ne change pas.</p></div>
        <div><h3 style="margin:0 0 8px">Montante ou combiné ?</h3><p class="muted" style="margin:0">Un combiné des ${done} mêmes sélections a la même probabilité (${pct(last.reach, 1)}) et la même cote (${odd(last.stake / cap)}). La montante permet de s'arrêter en route et de vérifier compos et cotes avant chaque palier ; le combiné se joue d'un coup, souvent avec un plafond de gain chez le bookmaker.</p>
          <p class="muted">Chaque palier paie la marge du bookmaker : sur ${done} paliers, l'espérance tombe à ${eur(ev)} pour ${eur(cap)} misés.</p></div></div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-lintstart="1" ${S.ladRun ? "disabled" : ""}>Démarrer cette montante (palier 1)</button><span class="note">Chaque palier se valide à la main après le match ; le suivant prévu est proposé automatiquement.</span></div>`
    : `<div class="empty">Aucune sélection enchaînable dans ce profil de cote avec les matchs cotés à venir.</div>`}</div>`;
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-lint]");
  if (b) { const k = b.dataset.lint, v = b.dataset.v; S.lint[k] = ["steps", "legs"].includes(k) ? +v : v; ls.set("lint", S.lint); render(); return; }
  if (e.target.closest("[data-lintstart]")) {
    const plan = S._lintPlan || []; if (!plan.length || S.ladRun) return;
    S.lad.steps = plan.length; S.lad.secure = 0;
    ladderStart(plan[0].p);
    S.ladRun.plan = plan.map(c => ({ txt: c.p.legs.map(l => `${l.lab} (${short(l.f.home)} – ${short(l.f.away)})`).join(" + "), o: Math.round(c.p.o * 100) / 100, p: c.p.pr, keys: c.p.legs.map(l => l.f.key), when: c.start, book: c.p.book }));
    saveLad(); render(); return;
  }
  if (e.target.closest("[data-ladnext]")) {
    const r = S.ladRun; if (!r || r.pending || r.status !== "active" || !r.plan) return;
    const nx = r.plan[r.steps.length]; if (!nx) return;
    r.steps.push({ txt: nx.txt, o: nx.o, p: nx.p, keys: nx.keys }); r.pending = true; saveLad(); render(); toast("Palier suivant ajouté.");
  }
});
function ladderTop(picks, n) {
  // les n sélections les plus probables, sans réutiliser un match
  const used = new Set(), top = [];
  for (const p of picks) { if (top.length >= n) break; if (p.legs.some(l => used.has(l.f.key))) continue; p.legs.forEach(l => used.add(l.f.key)); top.push(p); }
  return top;
}
// Explication courte d'une jambe : ce qui la porte et ce qui peut la faire tomber
function whyLeg(l) {
  const f = l.f, m = f.m, h = short(f.home), a = short(f.away), st = f.stats || [], b = f.band, xg = (f.lam + f.mu);
  const lead = { H: [h, f.lam, a, f.mu], A: [a, f.mu, h, f.lam] }[l.id], out = [];
  if (lead) {
    out.push(`${lead[0]} attend ${nf(lead[1], 1)} but${lead[1] >= 2 ? "s" : ""} contre ${nf(lead[3], 1)}${l.id === "H" ? ", à domicile" : ""}`);
    const j = l.id === "H" ? 0 : 2; if (b) out.push(`fourchette ${nf(b[j][0] * 100)}–${nf(b[j][1] * 100)} %`);
    out.push(`risque principal : le nul (${pct(m.D)})`);
  } else if (l.id === "1N" || l.id === "N2") {
    const [t, other, pO] = l.id === "1N" ? [h, a, m.A] : [a, h, m.H];
    out.push(`${t} ne perd que si ${other} gagne, soit ${pct(pO)}`, `${other} attend ${nf(l.id === "1N" ? f.mu : f.lam, 1)} but`);
  } else if (l.id === "12") out.push(`le nul n'est qu'à ${pct(m.D)}`, `${nf(xg, 1)} buts attendus, match ouvert`);
  else if (/^O/.test(l.id)) {
    out.push(`${nf(xg, 1)} buts attendus`);
    if (st[0] && st[1]) out.push(`sur 12 mois, ${h} : ${nf(st[0].gf, 1)} marqués et ${nf(st[0].ga, 1)} encaissés par match ; ${a} : ${nf(st[1].gf, 1)} et ${nf(st[1].ga, 1)}`);
    out.push(`0-0 à ${pct(m.M[0])}`);
  } else if (/^U/.test(l.id)) {
    out.push(`seulement ${nf(xg, 1)} buts attendus`);
    if (st[0] && st[1]) out.push(`${h} encaisse ${nf(st[0].ga, 1)} par match, ${a} ${nf(st[1].ga, 1)}`);
  } else if (l.id === "BY") out.push(`${h} marque dans ${pct(1 - Math.exp(-f.lam))} des cas environ, ${a} dans ${pct(1 - Math.exp(-f.mu))}`, `${nf(xg, 1)} buts attendus`);
  else if (l.id === "BN") out.push(`il suffit qu'une équipe reste muette`, `${a} attend ${nf(f.mu, 1)} but`);
  else if (l.id === "HS" || l.id === "AS") { const [t, x] = l.id === "HS" ? [h, f.lam] : [a, f.mu]; out.push(`${t} attend ${nf(x, 1)} but`, st[l.id === "HS" ? 1 : 0] ? `l'adversaire encaisse ${nf(st[l.id === "HS" ? 1 : 0].ga, 1)} par match sur 12 mois` : ""); }
  if (l.pm != null) { const g = (l.p - l.pm) * 100, src = l.msrc || "marché"; out.push(Math.abs(g) < 3 ? `modèle et ${src} d'accord (${pct(l.p)} / ${pct(l.pm)})` : g > 0 ? `le modèle est plus optimiste que le ${src} de ${nf(g)} pts : la probabilité retenue suit le marché` : `le ${src} y croit davantage que le modèle (+${nf(-g)} pts)`); }
  else out.push("aucune cote de marché pour ce pari : modèle seul, à vérifier");
  (f.stakes || []).forEach((s, i) => { if (s) out.push(`${i ? a : h} : ${s}`); });
  if (f.known && !(f.known[0] && f.known[1])) out.push("une équipe sans historique récent");
  const t = out.filter(Boolean).join(" ; ");
  return t.charAt(0).toUpperCase() + t.slice(1) + ".";
}
function ladderMath(cap, plan, n, secure) {
  // paliers prévus puis, au-delà, une sélection moyenne de la même qualité que la moyenne du plan
  const pAvg = plan.length ? Math.pow(plan.reduce((s, x) => s * x.pr, 1), 1 / plan.length) : 0.47;
  const oAvg = plan.length ? Math.pow(plan.reduce((s, x) => s * x.o, 1), 1 / plan.length) : 2;
  const rows = []; let reach = 1, stake = cap, banked = 0, ev = 0;
  for (let k = 0; k < n; k++) {
    const st = plan[k], p = st ? st.pr : pAvg, o = st ? st.o : oAvg;
    ev += reach * (1 - p) * banked;                 // on perd à ce palier : il reste ce qui a été mis de côté
    reach *= p; const win = stake * o, gain = win - stake, keep = gain * secure;
    banked += keep; stake = win - keep;
    rows.push({ k: k + 1, p, o, reach, stake, banked, planned: !!st });
  }
  ev += reach * (stake + banked);
  return { rows, ev, pAvg, oAvg };
}
function renderLadder() {
  const L = S.lad, { picks, mg } = ladderPicks(), top = ladderTop(picks, 10), plan = top.slice(0, L.steps), mt = ladderMath(L.cap, plan, L.steps, L.secure);
  const last = mt.rows[mt.rows.length - 1], fair2 = 1 / (2 * (1 + mg.m));
  const run = S.ladRun;
  const legTxt = p => p.legs.map(l => `<strong>${esc(l.lab)}</strong> <span class="faint">${esc(short(l.f.home))} – ${esc(short(l.f.away))}, ${new Date(l.f.date + "T12:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })}</span>`).join("<br>");
  const pickRow = (p, i) => `<tr><td>${legTxt(p)}</td><td class="r num">${odd(p.o)}${p.real ? "" : ` <span class="pill ghost" title="Cote estimée à partir de la cote juste et de la marge moyenne des bookmakers agréés">est.</span>`}</td>
    <td class="r num">${pct(p.p, 1)}</td><td class="r num">${p.legs.some(l => l.pm) ? pct(p.legs.reduce((s, l) => s * (l.pm ?? l.p), 1), 1) : "–"}</td><td class="r num"><strong>${pct(p.pr, 1)}</strong></td>
    <td class="r"><span class="pill ${p.ev > 0 ? "good" : "ghost"}">${sgn(p.ev)}</span></td>
    <td><button class="btn small" data-ladpick="${i}" ${run && run.status === "active" && !run.pending ? "" : run ? "disabled" : ""}>${run ? "Jouer ce palier" : "Démarrer avec"}</button></td></tr>`;
  S._ladPicks = picks;
  $("#v-ladder").innerHTML = `<div class="stack">
    <div class="panel"><header><h2>Objectif ×2</h2><span class="note">Doubler un capital palier par palier : ce que disent vraiment les probabilités</span></header>
      <p class="lede">Une cote de 2 n'est jamais « sûre ». Chez un bookmaker agréé, elle correspond à environ ${pct(fair2)} de chances une fois sa marge retirée (marge moyenne ${S.oddsSource === "demo" ? `des cotes de démonstration : ${pct(mg.m, 1)}, à remplacer par les vraies cotes` : mg.n ? `mesurée : ${pct(mg.m, 1)} sur ${mg.n} lignes de cotes` : `supposée : ${pct(mg.m, 1)}, faute de cotes`}). Les meilleures sélections du moteur montent un peu au-dessus. Enchaîner les paliers multiplie les risques : une montante est un seul gros combiné joué en plusieurs fois.</p>
      <div class="chips" style="margin-top:14px" role="group" aria-label="Profil de sélection">
        <button class="chip" data-ladpreset="x2" aria-pressed="${L.lo === 1.85 && L.hi === 2.25}">Cote ≈ 2 : un palier double la mise</button>
        <button class="chip" data-ladpreset="sure" aria-pressed="${L.lo === 1.15 && L.hi === 1.35}">Très probables (75-85 %) : cote ≈ 1,25</button></div>
      ${L.hi <= 1.4 ? `<p class="note" style="margin-top:8px">À cote ≈ 1,25, il faut 3 paliers pour doubler : 0,78 × 0,78 × 0,78 ≈ 47 %, comme un seul palier à cote 2. Sur 2 301 paris de ce type testés en 2025-26, le moteur annonçait 79 % et 77,9 % sont passés (cote moyenne 1,22, rendement −5 %).</p>` : ""}
      <div class="row" style="margin-top:14px">
        <label class="f">Capital de départ (€)<input type="number" min="1" step="1" data-lad="cap" value="${L.cap}"></label>
        <label class="f">Paliers visés<input type="number" min="1" max="10" step="1" data-lad="steps" value="${L.steps}"></label>
        <label class="f">Cote min.<input type="number" min="1.3" step="0.05" data-lad="lo" value="${L.lo}"></label>
        <label class="f">Cote max.<input type="number" min="1.4" step="0.05" data-lad="hi" value="${L.hi}"></label>
        <label class="f">Sélections par palier<select data-lad="legs"><option value="1" ${L.legs == 1 ? "selected" : ""}>1 match</option><option value="2" ${L.legs == 2 ? "selected" : ""}>1 ou 2 matchs</option></select></label>
        <label class="f">Mettre de côté à chaque gain<select data-lad="secure">${[0, 0.25, 0.5].map(v => `<option value="${v}" ${L.secure == v ? "selected" : ""}>${v ? pct(v) + " du gain" : "rien (tout remis)"}</option>`).join("")}</select></label>
        <label style="display:flex;gap:8px;align-items:center;align-self:flex-end;padding-bottom:8px"><input type="checkbox" data-lad="est" ${L.est ? "checked" : ""}> Inclure les marchés sans cote importée (cote estimée)</label>
      </div></div>
    <div class="panel">${myBooksPanel()}</div>
    ${lintBlock()}
    <div class="grid2">
      <div class="panel"><header><h2>La réalité des paliers</h2><span class="note">Avec les ${L.steps} sélections les plus probables</span></header>
        <div class="scroll"><table><thead><tr><th>Palier</th><th class="r">Cote</th><th class="r">Proba du palier</th><th class="r">Proba d'y arriver</th><th class="r">Capital en jeu</th><th class="r">Mis de côté</th></tr></thead><tbody>
        ${mt.rows.map(r => `<tr${r.planned ? "" : ' class="faint"'}><td>${r.k}${r.planned ? "" : " (non encore programmé)"}</td><td class="r num">${odd(r.o)}</td><td class="r num">${pct(r.p)}</td><td class="r num"><strong>${pct(r.reach, r.reach < 0.1 ? 1 : 0)}</strong> <span class="faint">1 sur ${nf(1 / r.reach)}</span></td><td class="r num">${eur(r.stake)}</td><td class="r num">${eur(r.banked)}</td></tr>`).join("")}</tbody></table></div>
        <div class="readouts" style="margin-top:12px"><div class="ro"><span>Chance de finir les ${L.steps} paliers</span><b>${pct(last.reach, 1)}</b></div><div class="ro"><span>Capital final si tout passe</span><b>${eur(last.stake + last.banked)}</b></div>
          <div class="ro"><span>Ce que tu récupères en moyenne</span><b>${eur(mt.ev)}</b></div><div class="ro"><span>Chance de tout perdre</span><b>${pct(1 - (L.secure ? mt.rows[0].p : last.reach), 0)}</b></div></div>
        <p class="note" style="margin-top:8px">${mt.ev < L.cap ? `En moyenne, la montante rend ${eur(mt.ev)} pour ${eur(L.cap)} engagés : la marge du bookmaker est payée à chaque palier.` : `Espérance positive sur le papier : elle repose sur l'avantage estimé du modèle, que le Registre n'a pas encore prouvé face à la clôture.`} « Mettre de côté » réduit la perte maximale sans changer la probabilité de tout réussir.${L.secure ? "" : " Sans mise de côté, perdre un seul palier fait tout perdre."}</p></div>
      <div class="panel"><header><h2>Montante en cours</h2>${run ? `<button class="btn small" data-ladact="abandon">Arrêter</button>` : ""}</header>${ladderRunBlock()}</div>
    </div>
    <div class="panel"><header><h2>Les 10 sélections les plus probables</h2><span class="note">Cote ${odd(L.lo)}–${odd(L.hi)}, un match n'apparaît qu'une fois</span></header>
      ${top.length ? `<ol class="top10">${top.map((p, r) => { const i = picks.indexOf(p); return `<li><div class="t10-rank num">${r + 1}</div><div class="t10-main">
        ${p.legs.map(l => `<div class="t10-leg"><div><strong>${esc(l.lab)}</strong> <span class="faint">${esc(short(l.f.home))} – ${esc(short(l.f.away))}, ${new Date(l.f.date + "T12:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}${l.f.time ? " " + esc(l.f.time) : ""}</span></div><p class="t10-why">${esc(whyLeg(l))}</p></div>`).join("")}</div>
        <div class="t10-nums"><div><span>Proba</span><b class="num">${pct(p.pr, 1)}</b></div><div><span>Cote${p.real && p.book ? ` · ${esc(p.book.replace(" (FR)", ""))}` : ""}</span><b class="num">${odd(p.o)}${p.real ? "" : '<small title="Cote estimée : à vérifier chez ton bookmaker"> est.</small>'}</b></div><div><span>EV</span><b class="num ${p.ev > 0 ? "pos" : ""}">${sgn(p.ev)}</b></div>
        <button class="btn small" data-ladpick="${i}" ${run && run.status === "active" && !run.pending ? "" : run ? "disabled" : ""}>${run ? "Jouer ce palier" : "Démarrer avec"}</button></div></li>`; }).join("")}</ol>
        <p class="note" style="margin-top:10px">Classées par probabilité retenue : 90 % marché sans marge (Pinnacle) + 10 % modèle quand une vraie cote de référence existe, car c'est le meilleur mélange mesuré sur 3 129 matchs ; sinon modèle seul. Les ${L.steps} premières servent au calcul des paliers ci-dessus. Une montante se joue dans l'ordre des dates : deux sélections jouées en même temps ne peuvent pas s'enchaîner. Même la n° 1 échoue environ ${nf(Math.round((1 - top[0].pr) * 10))} fois sur 10.</p>` : `<div class="empty">Aucune sélection dans cette fourchette de cotes.</div>`}</div>
    <div class="panel"><header><h2>Meilleures sélections à cote ${odd(L.lo)}–${odd(L.hi)}</h2><span class="note">${nf(picks.length)} possibilités, classées par probabilité retenue</span></header>
      ${picks.length ? `<div class="scroll"><table><thead><tr><th>Sélection</th><th class="r">Cote</th><th class="r">Modèle</th><th class="r">Marché</th><th class="r">Proba retenue</th><th class="r">EV</th><th></th></tr></thead><tbody>${picks.slice(0, 15).map(p => pickRow(p, picks.indexOf(p))).join("")}</tbody></table></div>` : `<div class="empty">Élargis la fourchette de cotes.</div>`}
      <p class="note" style="margin-top:8px">Proba retenue : 90 % marché sans marge (Pinnacle) + 10 % modèle quand une vraie cote de référence existe, sinon le modèle seul. Deux matchs différents sont traités comme indépendants. ${S.oddsSource === "demo" ? "<strong>Les cotes affichées sont simulées : importe les vraies cotes avant de jouer.</strong>" : ""} Les cotes « est. » sont à vérifier chez ton bookmaker.</p></div>
    ${S.ladHist.length ? `<div class="panel"><header><h2>Historique</h2><span class="note">${S.ladHist.filter(x => x.status === "won").length} réussie(s) sur ${S.ladHist.length}</span></header><div class="scroll"><table><thead><tr><th>Début</th><th class="r">Paliers passés</th><th class="r">Départ</th><th class="r">Fin</th><th>Issue</th></tr></thead><tbody>
      ${S.ladHist.slice(-10).reverse().map(x => `<tr><td>${new Date(x.ts).toLocaleDateString("fr-FR")}</td><td class="r num">${x.steps.filter(s => s.result === "won").length} / ${x.target}</td><td class="r num">${eur(x.cap)}</td><td class="r num">${eur(x.final)}</td><td><span class="pill ${x.status === "won" ? "good" : x.status === "lost" ? "bad" : "ghost"}">${x.status === "won" ? "Objectif atteint" : x.status === "lost" ? "Perdue" : "Arrêtée"}</span></td></tr>`).join("")}</tbody></table></div></div>` : ""}
  </div>`;
}
function ladderRunBlock() {
  const r = S.ladRun;
  if (!r) return `<p class="muted">Choisis une sélection dans le plan pour démarrer. Chaque palier se valide à la main (gagné ou perdu) : rien n'est parié depuis Lambda 90.</p>`;
  const stake = r.stake;
  return `<div class="readouts"><div class="ro"><span>Palier</span><b>${r.steps.filter(s => s.result === "won").length + (r.pending ? 1 : 0)} / ${r.target}</b></div><div class="ro"><span>En jeu</span><b>${eur(stake)}</b></div><div class="ro"><span>Mis de côté</span><b>${eur(r.banked)}</b></div></div>
    <div class="scroll" style="margin-top:10px"><table><tbody>${r.steps.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.txt)}</td><td class="r num">${odd(s.o)}</td><td class="r num">${pct(s.p)}</td>
      <td>${s.result ? `<span class="pill ${s.result === "won" ? "good" : "bad"}">${s.result === "won" ? "Gagné" : "Perdu"}</span>` : `<button class="btn small" data-ladres="won">Gagné</button> <button class="btn small" data-ladres="lost">Perdu</button>`}</td></tr>`).join("")}</tbody></table></div>
    ${!r.pending && r.status === "active" ? (r.plan?.[r.steps.length] ? `<div class="row" style="margin-top:10px;align-items:center"><button class="btn small primary" data-ladnext="1">Jouer le palier ${r.steps.length + 1} prévu</button><span class="note">${esc(r.plan[r.steps.length].txt)} · cote ${odd(r.plan[r.steps.length].o)}${r.plan[r.steps.length].book ? " · " + esc(r.plan[r.steps.length].book) : ""} · ${new Date(r.plan[r.steps.length].when).toLocaleString("fr-FR", { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}. Vérifie la cote réelle avant de jouer.</span></div>` : `<p class="note" style="margin-top:8px">Palier validé. Choisis la sélection suivante dans la liste.</p>`) : ""}`;
}
function ladderStart(p) {
  const L = S.lad;
  const step = { txt: p.legs.map(l => `${l.lab} (${short(l.f.home)} – ${short(l.f.away)})`).join(" + "), o: Math.round(p.o * 100) / 100, p: p.pr, keys: p.legs.map(l => l.f.key) };
  if (!S.ladRun) S.ladRun = { ts: Date.now(), cap: +L.cap, stake: +L.cap, banked: 0, target: +L.steps, secure: +L.secure, steps: [], status: "active", pending: false };
  const r = S.ladRun; if (r.pending || r.status !== "active") return;
  r.steps.push(step); r.pending = true; saveLad(); render(); toast("Palier ajouté. Valide-le après le match.");
}
function ladderResult(res) {
  const r = S.ladRun; if (!r?.pending) return; const s = r.steps[r.steps.length - 1]; s.result = res; r.pending = false;
  if (res === "won") { const win = r.stake * s.o, keep = (win - r.stake) * r.secure; r.banked += keep; r.stake = win - keep; if (r.steps.filter(x => x.result === "won").length >= r.target) ladderEnd("won"); }
  else { r.stake = 0; ladderEnd("lost"); }
  saveLad(); render();
}
function ladderEnd(status) { const r = S.ladRun; if (!r) return; r.status = status; r.final = r.stake + r.banked; S.ladHist.push(r); S.ladRun = null; saveLad(); toast(status === "won" ? "Objectif atteint" : status === "lost" ? "Montante perdue" : "Montante arrêtée"); }
document.addEventListener("click", e => {
  const pr = e.target.closest("[data-ladpreset]");
  if (pr) { Object.assign(S.lad, pr.dataset.ladpreset === "sure" ? { lo: 1.15, hi: 1.35, legs: 1, steps: 3 } : { lo: 1.85, hi: 2.25, legs: 2, steps: 4 }); saveLad(); render(); return; }
  const b = e.target.closest("[data-ladpick],[data-ladres],[data-ladact]"); if (!b) return;
  if (b.dataset.ladpick != null) ladderStart(S._ladPicks[+b.dataset.ladpick]);
  else if (b.dataset.ladres) ladderResult(b.dataset.ladres);
  else if (b.dataset.ladact === "abandon") { ladderEnd("stopped"); render(); }
});
document.addEventListener("change", e => {
  const el = e.target, k = el.dataset.lad; if (!k) return;
  S.lad[k] = el.type === "checkbox" ? el.checked : parseFloat(el.value);
  if (k === "steps") S.lad.steps = Math.max(1, Math.min(10, Math.round(S.lad.steps || 1)));
  if (!(S.lad.hi > S.lad.lo)) S.lad.hi = Math.round((S.lad.lo + 0.3) * 100) / 100;
  saveLad(); render();
});
