// ---------- Algorithmes des bookmakers : structure des marges, méthode, surcoût français, qui copie qui, pièges (labo 13 + cotes chargées) ----------
const L13 = LAB.deep?.lab13 || null;
// Clubs à forte base de fans : les bookmakers leur offrent de meilleures cotes et rognent celles de leurs adversaires (Forrest et Simmons ; labo 13)
const POP_RX = /^(Paris Saint-Germain|Olympique de Marseille|Olympique Lyonnais|Manchester United|Manchester City|Liverpool FC|Arsenal FC|Chelsea FC|Tottenham Hotspur|Real Madrid CF|FC Barcelona|Club Atlético de Madrid|FC Bayern München|Borussia Dortmund|Juventus FC|FC Internazionale Milano|AC Milan|AS Roma|SSC Napoli|Sport Lisboa e Benfica|FC Porto|Sporting Clube de Portugal|AFC Ajax|PSV|Feyenoord Rotterdam|Leeds United|Sunderland AFC)/;
const isPop = n => POP_RX.test(String(n || ""));
const BK_PROF = [["favori (≥ 55 %)", "Favoris"], ["équilibré (30–55 %)", "Équilibrés"], ["nul", "Nul"], ["outsider (< 30 %)", "Outsiders"]];
const bkProfOf = (p, k) => k === "D" ? "nul" : p >= 0.55 ? "favori (≥ 55 %)" : p >= 0.30 ? "équilibré (30–55 %)" : "outsider (< 30 %)";
// Piège mesuré : outsider (moins de 30 %) face à un club populaire
function popTrap(f, sel) {
  if (!f || !["H", "A"].includes(sel)) return null; const fair = fairOf(f), p = fair?.[sel] ?? (sel === "H" ? f.m.H : f.m.A); if (p >= 0.30) return null;
  const opp = sel === "H" ? f.away : f.home, me = sel === "H" ? f.home : f.away; if (!isPop(opp) || isPop(me)) return null;
  const r = L13?.clubs_populaires?.find(x => x.profil.startsWith("outsider") && x.cas === "contre le club populaire");
  return `Piège mesuré : outsider face à ${short(opp)}, club populaire. Les bookmakers rognent ces cotes${r ? ` : chez Bet365, ${sgn(r.ev_attendu)} attendu et ${sgn(r.roi_reel)} réalisé sur ${nf(r.n)} paris (2024-26)` : ""}.`;
}
// Profil en direct, sur les cotes chargées : ce que chaque bookmaker rend par type d'issue face au prix juste Pinnacle
function bookLive() {
  const acc = {};
  for (const f of FX) { if (started(f)) continue; const fair = fairOf(f); if (!fair) continue;
    for (const [b, o] of Object.entries(S.odds[f.key] || {})) { if (isSharp(b) || NOT_BOOK(b) || !["H", "D", "A"].every(k => o[k] > 1)) continue; const A = acc[b] ??= { m: [], ev: {}, n: 0 }; A.n++;
      A.m.push(L90.overround([o.H, o.D, o.A])); for (const k of ["H", "D", "A"]) (A.ev[bkProfOf(fair[k], k)] ??= []).push(fair[k] * o[k] - 1); } }
  return Object.entries(acc).filter(([, A]) => A.n >= 5).map(([b, A]) => ({ b, n: A.n, m: avg(A.m), ev: Object.fromEntries(Object.entries(A.ev).map(([k, v]) => [k, avg(v)])) }));
}
const evCell = v => v == null ? `<td class="r faint">–</td>` : `<td class="r num" style="color:${v > -0.04 ? "var(--good)" : v > -0.09 ? "var(--ink2)" : "var(--bad)"}">${sgn(v)}</td>`;
function booksBlock() {
  const live = bookLive(), mine = S.cfg.myBooks, show = S.bkAll ? live : live.filter(r => mine.includes(r.b) || /\(FR\)/.test(r.b));
  const prof = Object.fromEntries((L13?.profils || []).map(r => [r.book, r])), ML = { mult: "proportionnelle", add: "additive", power: "puissance", or: "rapport de cotes", shin: "Shin" };
  const bestFor = k => { const c = live.filter(r => mine.includes(r.b) && r.ev[k] != null).sort((a, b) => b.ev[k] - a.ev[k]), fr = live.filter(r => /\(FR\)/.test(r.b) && r.ev[k] != null).sort((a, b) => b.ev[k] - a.ev[k])[0];
    return c[0] ? `${esc(c[0].b.replace(" (FR)", ""))} <span class="faint num">${sgn(c[0].ev[k])}</span>${fr && fr.b !== c[0].b ? `<br><span class="faint">en France : ${esc(fr.b.replace(" (FR)", ""))} ${sgn(fr.ev[k])}${mine.includes(fr.b) ? "" : " (pas dans tes bookmakers)"}</span>` : ""}` : "–"; };
  const tw = (L13?.jumeaux_de_prix || []).slice(0, 6), mm = L13?.meme_marque || [], lag = L13?.suivi_pinnacle_fr || [], ra = L13?.reference_amelioree, pop = L13?.clubs_populaires?.find(x => x.profil.startsWith("outsider") && x.cas === "contre le club populaire"),
    pop0 = L13?.clubs_populaires?.find(x => x.profil.startsWith("outsider") && x.cas === "aucun club populaire"), st = L13?.bet365_structure || [], mon = (L13?.test_argent_bet365 || []).find(x => x.moment === "ouverture" && x.seuil === 0);
  return `<div class="panel" id="books"><header><h2>Les algorithmes des bookmakers</h2><div class="chips"><button class="chip" data-bkall="0" aria-pressed="${!S.bkAll}">Mes bookmakers et France</button><button class="chip" data-bkall="1" aria-pressed="${!!S.bkAll}">Tous</button></div></header>
    <p class="muted" style="margin:0 0 10px">Ce que chaque bookmaker rend en moyenne par type d'issue, face au prix juste Pinnacle, sur les cotes chargées. Un bookmaker ne prélève pas sa marge à parts égales : il la charge sur les issues que le public surjoue.</p>
    ${show.length ? `<div class="scroll"><table><thead><tr><th>Bookmaker</th><th class="r">Marge 1N2</th>${BK_PROF.map(([, l]) => `<th class="r">${l}</th>`).join("")}<th>Répartition de la marge</th><th class="r">Matchs</th></tr></thead><tbody>
      ${show.sort((a, b) => a.m - b.m).map(r => `<tr><td>${esc(r.b)}</td><td class="r num">${pct(r.m, 1)}</td>${BK_PROF.map(([k]) => evCell(r.ev[k])).join("")}<td class="faint">${prof[r.b]?.methode ? ML[prof[r.b].methode] : "–"}</td><td class="r num">${r.n}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Pas de cotes chargées avec Pinnacle : rafraîchis les cotes.</div>`}
    <div class="grid2" style="margin-top:12px">
      <div><h3>Où jouer quoi, parmi tes bookmakers</h3><ul class="bk-list">${BK_PROF.map(([k, l]) => `<li><span>${l}</span><b>${bestFor(k)}</b></li>`).join("")}</ul>
        <p class="note">Le bon bookmaker dépend du type de pari : l'écart entre le moins cher et le plus cher dépasse souvent 5 points sur les outsiders.</p></div>
      <div><h3>Même marque, autre pays</h3>${mm.length ? `<ul class="bk-list">${mm.map(r => `<li><span>${esc(r.fr.replace(" (FR)", ""))} : France ${pct(r.marge_fr, 1)}, ${esc(r.etranger.replace(/.*\((\w+)\)/, "$1"))} ${pct(r.marge_etranger, 1)}</span><b class="num">+${nf((r.marge_fr - r.marge_etranger) * 100, 1)} pts</b></li>`).join("")}</ul>
        <p class="note">Mêmes avis sur les matchs (écart ${nf(mm[0].ecart_opinion_pts, 1)} pt de probabilité pour Winamax), marge bien plus lourde en France : le taux de retour aux joueurs y est plafonné à 85 % et la fiscalité pèse sur les mises.</p>` : `<p class="muted">Données du labo 13 absentes.</p>`}</div>
    </div>
    <div class="grid2" style="margin-top:12px">
      <div><h3>Qui copie qui</h3>${tw.length ? `<ul class="bk-list">${tw.map(r => `<li><span>${esc(r.a)} · ${esc(r.b)}</span><b class="num">${nf(r.ecart_pts, 2)} pt</b></li>`).join("")}</ul>
        <p class="note">Écart moyen entre leurs probabilités sans marge. Sous 0,2 point, deux bookmakers partagent presque sûrement le même fournisseur de cotes ou le même groupe : leurs « avis » sont une seule source, pas deux.</p>` : ""}</div>
      <div><h3>Ce que ça change pour toi</h3><ul class="bk-notes">
        ${pop ? `<li><b>Piège :</b> l'outsider face à un club populaire. Chez Bet365, ${sgn(pop.ev_attendu)} attendu (contre ${sgn(pop0?.ev_attendu ?? 0)} pour les autres outsiders) et ${sgn(pop.roi_reel)} réalisé sur ${nf(pop.n)} paris (IC ${sgn(pop.roi_ic[0])} à ${sgn(pop.roi_ic[1])}). Signalé dans le ticket.</li>` : ""}
        ${lag.length ? `<li><b>Retard :</b> quand Pinnacle bouge, les bookmakers français n'en reprennent qu'environ ${pct(avg(lag.map(r => r.beta)))} au relevé suivant (${nf(avg(lag.map(r => r.n_mouvements)))} mouvements). C'est la fenêtre des Hot Picks : elle se referme vite.</li>` : ""}
        ${st.length ? `<li><b>Favoris contre outsiders :</b> chez Bet365, ${sgn(st.find(x => x.profil.startsWith("favori"))?.roi_reel)} réalisé sur les favoris, ${sgn(st.find(x => x.profil.startsWith("outsider"))?.roi_reel)} sur les outsiders (${nf(L13.n_matchs)} matchs).</li>` : ""}
        ${ra ? `<li><b>Notre probabilité :</b> Pinnacle seul fait mieux que tout mélange avec le modèle ou avec Bet365 (labo 13). Les picks utilisent désormais Pinnacle à 100 %.</li>` : ""}
        ${mon ? `<li><b>Bet365 au-dessus du prix Pinnacle :</b> ${nf(mon.paris)} paris, ROI ${sgn(mon.roi)} mais IC ${sgn(mon.roi_ic[0])} à ${sgn(mon.roi_ic[1])} : pas d'avantage prouvé.</li>` : ""}</ul></div>
    </div></div>`;
}
document.addEventListener("click", e => { const b = e.target.closest("[data-bkall]"); if (!b) return; S.bkAll = b.dataset.bkall === "1"; render(); });
