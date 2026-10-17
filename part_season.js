// ---------- Saison : simulation Monte-Carlo, Power Index, Predictor ----------
function renderSeason() {
  const lg = S.seasonLg, sim = EXTRA.sims[lg], rt = EXTRA.ratings[lg], prm = EXTRA.ratings[lg + "_params"];
  const n = sim.teams.length, rel = n >= 20 ? 3 : 3, top = 4;
  const T = [...sim.teams].sort((x, y) => y.xpts - x.xpts);
  const chips = Object.entries(LG).map(([k, v]) => `<button class="chip" data-seasonlg="${k}" aria-pressed="${lg === k}">${v}</button>`).join("");
  const P = S.pred[lg] ??= { h: T[0].team, a: T[1].team, neutral: false };
  const R = Object.fromEntries(rt.map(r => [r.team, r]));
  const lam = Math.exp(prm.mu0 + (P.neutral ? 0 : prm.home) + R[P.h].att + R[P.a].dfn), mu = Math.exp(prm.mu0 + R[P.a].att + R[P.h].dfn);
  const pm = L90.full({ lam, mu, rho: prm.rho });
  const power = [...rt].map(r => ({ ...r, g: r.att - r.dfn })).sort((x, y) => y.g - x.g);
  const gmax = Math.max(...power.map(r => Math.abs(r.g)));
  const opts = sel => [...rt].sort((x, y) => x.team.localeCompare(y.team)).map(r => `<option value="${esc(r.team)}" ${r.team === sel ? "selected" : ""}>${esc(short(r.team))}</option>`).join("");
  $("#v-season").innerHTML = `
  <div class="stack">
    <div class="row" style="justify-content:flex-end"><button class="btn small" data-studio='${esc(JSON.stringify({ tpl: "season", lg }))}'>Créer un contenu</button></div>
    <div><h1>Saison 2026-27 simulée</h1><p class="lede">${nf(sim.N)} saisons rejouées match par match avec les forces actuelles des équipes et leur incertitude statistique. ${sim.n_played} matchs joués intégrés, ${sim.n_remaining} restants simulés, dont ${sim.n_missing} déjà joués mais sans résultat dans nos données : ils sont traités comme inconnus.</p></div>
    <div class="chips" role="group" aria-label="Championnat">${chips}</div>
    <div class="panel"><header><h2>Classement projeté</h2><div class="legend"><span>Bande : probabilité de chaque place, de 1 à ${n}</span></div></header>
      <div class="scroll"><table class="season"><thead><tr><th>#</th><th>Équipe</th><th class="r">Pts</th><th class="r">J</th><th class="r">Pts projetés</th><th class="r">Titre</th><th class="r">Top ${top}</th><th class="r">${rel} derniers</th><th>Places possibles</th></tr></thead><tbody>
      ${T.map((t, i) => { const pt = t.p[0], p4 = t.p.slice(0, top).reduce((s, v) => s + v, 0), pr = t.p.slice(-rel).reduce((s, v) => s + v, 0), mx = Math.max(...t.p);
        return `<tr><td class="faint num">${i + 1}</td><td><strong>${esc(short(t.team))}</strong></td><td class="r num">${t.pts}</td><td class="r num faint">${t.played}</td><td class="r num"><strong>${nf(t.xpts, 1)}</strong></td>
        <td class="r num">${pt >= 0.005 ? pct(pt, pt < 0.1 ? 1 : 0) : "–"}</td><td class="r num">${p4 >= 0.005 ? pct(p4) : "–"}</td><td class="r num ${pr > 0.5 ? "bad-t" : ""}">${pr >= 0.005 ? pct(pr) : "–"}</td>
        <td><div class="posband" style="grid-template-columns:repeat(${n},1fr)">${t.p.map((v, k) => `<i style="opacity:${(0.06 + 0.94 * v / mx).toFixed(2)}" data-tip="${esc(short(t.team))}<br>${k + 1}<sup>e</sup> place : <strong>${pct(v, 1)}</strong>"></i>`).join("")}</div></td></tr>`; }).join("")}
      </tbody></table></div>
      <p class="note" style="margin-top:8px">Les places européennes et la relégation varient selon les championnats (barrages, coupes nationales) : les colonnes « Top ${top} » et « ${rel} derniers » sont des repères, pas les règles exactes de chaque ligue.</p></div>
    <div class="grid2">
      <div class="panel"><header><h2>Predictor</h2><span class="note">N'importe quelle affiche du championnat</span></header>
        <div class="row" style="align-items:flex-end"><label class="f">Domicile<select id="pred-h" data-pred="h">${opts(P.h)}</select></label><label class="f">Extérieur<select id="pred-a" data-pred="a">${opts(P.a)}</select></label>
          <label class="f" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="pred-n" data-pred="neutral" ${P.neutral ? "checked" : ""}>Terrain neutre</label></div>
        ${P.h === P.a ? `<p class="muted" style="margin-top:12px">Choisis deux équipes différentes.</p>` : `
        <div class="hero-split" style="margin-top:14px">${split(pm.H, pm.D, pm.A)}<div class="vals"><div><div class="v" style="font-size:30px">${nf(pm.H * 100)}<small>%</small></div><div class="lab">${esc(short(P.h))}</div></div><div class="c"><div class="v" style="font-size:30px">${nf(pm.D * 100)}<small>%</small></div><div class="lab">Nul</div></div><div class="e"><div class="v" style="font-size:30px">${nf(pm.A * 100)}<small>%</small></div><div class="lab">${esc(short(P.a))}</div></div></div></div>
        <div class="row" style="margin-top:12px"><span class="pill ghost">Buts attendus ${nf(lam, 2)} – ${nf(mu, 2)}</span><span class="pill ghost">Score le plus probable ${pm.scores[0].s} (${pct(pm.scores[0].p)})</span><span class="pill ghost">+2,5 buts ${pct(pm.O[2.5])}</span><span class="pill ghost">Cotes justes ${odd(1 / pm.H)} / ${odd(1 / pm.D)} / ${odd(1 / pm.A)}</span></div>
        <p class="note" style="margin-top:8px">Dixon-Coles seul, sans l'ajustement pi-ratings des matchs programmés.</p>`}</div>
      <div class="panel"><header><h2>Power Index</h2><span class="note">Écart à une équipe moyenne</span></header>
        <div class="scroll"><table><thead><tr><th>Équipe</th><th class="r">Attaque</th><th class="r">Défense</th><th>Force globale</th></tr></thead><tbody>
        ${power.map(r => `<tr><td>${esc(short(r.team))}</td><td class="r num">${r.att > 0 ? "+" : ""}${nf((Math.exp(r.att) - 1) * 100)} %</td><td class="r num">${r.dfn > 0 ? "+" : ""}${nf((Math.exp(r.dfn) - 1) * 100)} %</td>
          <td style="min-width:140px"><div class="pbar"><i style="${r.g >= 0 ? `left:50%;width:${50 * r.g / gmax}%;background:var(--h)` : `right:50%;width:${50 * -r.g / gmax}%;background:var(--a)`}"></i></div></td></tr>`).join("")}</tbody></table></div>
        <p class="note" style="margin-top:8px">Attaque : buts marqués par rapport à une équipe moyenne. Défense : buts encaissés par rapport à la moyenne, donc plus bas = meilleur. Force globale : attaque moins défense.</p></div>
    </div>
  </div>`;
}
