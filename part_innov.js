// ---------- Innovations : prix de la patience, coach anti-tilt, règlement automatique du journal ----------
// Prix de la patience : ce que coûte chaque profil d'issue chez Bet365, à l'ouverture et à la clôture, face au prix juste Pinnacle de clôture
function patienceBlock() {
  const P = INS.patience; if (!P?.length) return "";
  const cheap = P.reduce((a, b) => b.b365_open_ev > a.b365_open_ev ? b : a), dear = P.reduce((a, b) => b.b365_open_ev < a.b365_open_ev ? b : a);
  return `<div class="panel"><header><h2>Le prix de la patience</h2><span class="note">${nf(P.reduce((s, r) => s + (r.issue === "nul" ? r.n : 0), 0))} matchs 2024-2026, cotes d'ouverture et de clôture</span></header>
    <p class="muted" style="margin:0 0 8px">Faut-il jouer tôt ou attendre ? Et quels paris coûtent le plus cher ? Chaque ligne compare la cote Bet365 à l'ouverture et à la clôture au prix juste Pinnacle de clôture, le meilleur estimateur connu de la vraie probabilité.</p>
    <div class="scroll"><table><thead><tr><th>Issue</th><th>Profil</th><th class="r">Matchs</th><th class="r">Bet365 à l'ouverture</th><th class="r">Bet365 à la clôture</th><th class="r">Cote Pinnacle ouverture → clôture</th></tr></thead><tbody>
      ${P.map(r => `<tr><td>${esc(r.issue)}</td><td>${esc(r.profil)}</td><td class="r num">${nf(r.n)}</td><td class="r num">${sgn(r.b365_open_ev)}</td><td class="r num">${sgn(r.b365_close_ev)}</td><td class="r num">${sgn(r.pin_move)}</td></tr>`).join("")}</tbody></table></div>
    <ul class="hc-why" style="margin-top:10px">
      <li>Le moins cher : ${esc(cheap.issue)}, ${esc(cheap.profil)} (${sgn(cheap.b365_open_ev)}). Le plus cher : ${esc(dear.issue)}, ${esc(dear.profil)} (${sgn(dear.b365_open_ev)}). Les outsiders coûtent environ trois fois plus de marge que les favoris : c'est le biais favori-outsider, mesuré ici sur tes données.</li>
      <li>Ouverture ou clôture chez Bet365 : au plus ${nf(Math.max(...P.map(r => Math.abs(r.b365_open_ev - r.b365_close_ev))) * 100, 1)} point d'écart selon le profil. Attendre ne coûte presque rien en moyenne, et permet de connaître les compositions.</li>
      <li>La cote Pinnacle s'allonge en moyenne vers la clôture : sa marge d'ouverture est plus élevée. Ce n'est pas un signal de valeur.</li></ul></div>`;
}
// Coach anti-tilt : signaux de comportement dans le journal (et dans les parties du Survivant)
function coachBlock() {
  const B = [...S.bets].filter(b => b.stake > 0).sort((a, b) => a.ts - b.ts).map(b => ({ ts: b.ts, stake: +b.stake, odds: +b.odds, res: b.result, clv: b.close > 1 ? b.odds / b.close - 1 : null }));
  for (const b of S.surv.run?.bets || []) B.push({ ts: b.ts, stake: b.stake, odds: b.o, res: b.status, clv: null, plan: b.plan });
  B.sort((a, b) => a.ts - b.ts);
  const settled = B.filter(b => b.res === "won" || b.res === "lost");
  if (settled.length < 8) return `<div class="panel"><header><h2>Coach anti-tilt</h2><span class="note">Analyse de ton comportement de parieur</span></header><p class="muted">Il faut au moins 8 paris réglés (journal ou Survivant) pour détecter des tendances. Pour l'instant : ${settled.length}.</p>
    <p class="note">Il repérera : hausse des mises après une perte (se refaire), glissement vers les grosses cotes après une série noire, rafales de paris dans la même journée, CLV qui se dégrade.</p></div>`;
  const after = res => { const s = []; for (let i = 1; i < B.length; i++) if (B[i - 1].res === res) s.push(B[i].stake / Math.max(0.01, B[i - 1].stake)); return s.length ? avg(s) : null; };
  const aL = after("lost"), aW = after("won"), oddsAfterL = [], oddsAll = B.map(b => b.odds);
  for (let i = 1; i < B.length; i++) if (B[i - 1].res === "lost") oddsAfterL.push(B[i].odds);
  const perDay = {}; for (const b of B) { const d = new Date(b.ts).toDateString(); perDay[d] = (perDay[d] || 0) + 1; }
  const dayVals = Object.values(perDay), maxDay = Math.max(...dayVals), avgDay = avg(dayVals);
  const clvs = B.filter(b => b.clv != null).map(b => b.clv), half = Math.floor(clvs.length / 2);
  const sig = [];
  if (aL && aW && aL > aW * 1.25) sig.push(["bad", "Se refaire", `Après une perte, ta mise suivante vaut en moyenne ×${nf(aL, 2)} la précédente, contre ×${nf(aW, 2)} après un gain. C'est le premier signe de tilt : fixe la mise avant de voir le résultat.`]);
  else if (aL && aW) sig.push(["good", "Mises stables", `Mise après une perte ×${nf(aL, 2)}, après un gain ×${nf(aW, 2)} : pas de chasse aux pertes.`]);
  if (oddsAfterL.length >= 3 && avg(oddsAfterL) > avg(oddsAll) * 1.2) sig.push(["bad", "Grosses cotes après une perte", `Cote moyenne après une perte ${odd(avg(oddsAfterL))}, contre ${odd(avg(oddsAll))} en général. Les grosses cotes coûtent environ trois fois plus de marge (voir le prix de la patience).`]);
  if (maxDay >= Math.max(5, avgDay * 2.5)) sig.push(["warn", "Rafale de paris", `Jusqu'à ${maxDay} paris dans une même journée, pour ${nf(avgDay, 1)} en moyenne. Les journées chargées sont celles où l'on suit le moins son plan.`]);
  if (half >= 5) { const a = avg(clvs.slice(0, half)), b = avg(clvs.slice(half)); sig.push([b < a - 0.01 ? "warn" : "good", "Évolution du CLV", `CLV moyen ${sgn(a)} sur tes premiers paris, ${sgn(b)} sur les plus récents.${b < a - 0.01 ? " Tes prix se dégradent : tu joues peut-être plus tard ou chez des bookmakers plus chers." : ""}`]); }
  const plan = B.filter(b => b.plan), dev = plan.filter(b => Math.abs(b.stake - b.plan) > 0.1 * b.plan + 0.01).length;
  if (plan.length) sig.push([dev ? "warn" : "good", "Respect du plan Survivant", `${plan.length - dev} paris sur ${plan.length} à la mise prévue.`]);
  const score = Math.max(0, 100 - sig.filter(s => s[0] === "bad").length * 30 - sig.filter(s => s[0] === "warn").length * 12);
  return `<div class="panel"><header><h2>Coach anti-tilt</h2><span class="note">${settled.length} paris réglés analysés</span></header>
    <div class="row" style="align-items:center;gap:18px">${ring(score / 100, 92, score >= 75 ? "var(--good)" : score >= 50 ? "var(--warn)" : "var(--bad)", nf(score))}<div><strong>Score de discipline</strong><p class="muted" style="margin:4px 0 0">Mesure ton comportement, pas tes résultats : un bon pari peut perdre, un mauvais comportement finit toujours par coûter.</p></div></div>
    <ul class="coach">${sig.map(([k, t, x]) => `<li class="${k}"><strong>${esc(t)}.</strong> ${esc(x)}</li>`).join("")}</ul></div>`;
}
// Règlement automatique du journal avec les résultats publiés
function journalAutoSettle() {
  let n = 0;
  for (const b of S.bets) { if (b.result !== "pending" || !b.matchKey || !selFn(b.sel)) continue; const r = svResultOf(b.matchKey); if (!r) continue;
    updateBet(b.id, { result: selFn(b.sel)(r.hg, r.ag) ? "won" : "lost", settledAt: Date.now() }); n++; }
  return n;
}
document.addEventListener("click", e => { if (!e.target.closest("[data-act=autosettle]")) return; const n = journalAutoSettle(); toast(n ? `${n} paris réglés avec les résultats` : "Aucun pari réglable pour l'instant"); });
// ---------- Corners et cartons : forces d'équipe rapprochées de la moyenne du championnat (labo 11), loi binomiale négative ----------
const PROPS = EXTRA.props;
function propsOf(f) {
  const L = PROPS?.leagues?.[f.league], P = PROPS?.params; if (!L || !P) return null;
  const find = name => { if (!name) return null; if (L.teams[name]) return L.teams[name]; let best = null, bs = 0; for (const t in L.teams) { const s = L90.nameScore(name, t); if (s > bs) { bs = s; best = t; } } return bs >= 0.6 ? L.teams[best] : null; };
  const th = find(f.xn?.[0] || f.home), ta = find(f.xn?.[1] || f.away), out = {};
  for (const [k, i] of [["corners", 0], ["cartons", 2]]) {
    const [Lh, La] = L[k], Lm = (Lh + La) / 2, w = P[k]?.w ?? 0, ok = !!(th && ta);
    const rh = ok ? Math.pow((th[i] / Lm) * (ta[i + 1] / Lm), w) : 1, ra = ok ? Math.pow((ta[i] / Lm) * (th[i + 1] / Lm), w) : 1;
    out[k] = { h: Lh * rh, a: La * ra, r: P[k]?.dist === "nb" ? P[k].r : null, known: ok };
  }
  return out;
}
function cornersBlock(f) {
  const p = propsOf(f); if (!p) return "";
  const lab = LAB.deep?.lab11, h = short(f.home), a = short(f.away), c = p.corners, k = p.cartons, tc = c.h + c.a, tk = k.h + k.a;
  const rows = (lines, mu, r) => lines.map(L => `<tr><td>Plus de ${nf(L, 1)}</td><td class="r num">${pct(1 - nbCdf(Math.floor(L), mu, r))}</td><td class="r num">${odd(1 / (1 - nbCdf(Math.floor(L), mu, r)))}</td><td class="r num">${pct(nbCdf(Math.floor(L), mu, r))}</td></tr>`).join("");
  const [mh, ml, ma] = moreOf(c.h, c.a);
  return `<div class="panel"><header><h2>Corners et cartons</h2><span class="note">${c.known ? "Forces des deux équipes" : "Moyenne du championnat (équipe sans historique dans cette division)"}</span></header>
    <div class="readouts"><div class="ro"><span>Corners attendus</span><b>${nf(tc, 1)}</b><span>${esc(h)} ${nf(c.h, 1)} · ${esc(a)} ${nf(c.a, 1)}</span></div><div class="ro"><span>Cartons attendus</span><b>${nf(tk, 1)}</b><span>${esc(h)} ${nf(k.h, 1)} · ${esc(a)} ${nf(k.a, 1)}</span></div></div>
    <div class="sp-wide" style="margin-top:10px"><span>Plus de corners</span>${triBar(mh, ml, ma, h, "Égalité", a)}</div>
    <div class="grid2" style="margin-top:10px"><div class="scroll"><table><thead><tr><th>Corners</th><th class="r">Proba</th><th class="r">Cote juste</th><th class="r">Moins</th></tr></thead><tbody>${rows([7.5, 8.5, 9.5, 10.5, 11.5], tc, c.r)}</tbody></table></div>
      <div class="scroll"><table><thead><tr><th>Cartons</th><th class="r">Proba</th><th class="r">Cote juste</th><th class="r">Moins</th></tr></thead><tbody>${rows([2.5, 3.5, 4.5, 5.5], tk, k.r)}</tbody></table></div></div>
    <p class="note" style="margin-top:8px">${lab?.corners ? `Validé sur ${nf(lab.corners.n_test)} matchs de 2025-26 : les moyennes d'équipe brutes font pire que la simple moyenne du championnat ; rapprochées à moitié de cette moyenne, avec une loi binomiale négative, elles font au moins aussi bien (gain non prouvé statistiquement). ` : ""}Pas de cotes de corners chez tes bookmakers dans nos données : compare la cote juste à celle de ton bookmaker avant de jouer.</p></div>`;
}
