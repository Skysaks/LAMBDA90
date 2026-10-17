// ---------- Outils de paris : cotes boostées, freebets, couverture, dutching, relief 3D ----------
S.tool = Object.assign({ v: "value", bm: "", bk: "H", bo: "", bmax: "10", fbType: "free", fbAmt: "10", fbBook: "Winamax (FR)", fbMin: "1.5", fbConv: "70", fbB365: false,
  hR: "", hM: "", hOs: "", hO1: "", hO2: "", hCash: "", dut: ["", "", ""], dutT: "10" }, ls.get("tool", {}));
const saveTool = () => ls.set("tool", S.tool);
const numv = x => { const v = parseFloat(String(x ?? "").replace(",", ".")); return isFinite(v) ? v : NaN; };
const selLab = (f, k) => ({ H: `${short(f.home)} gagne`, D: "Match nul", A: `${short(f.away)} gagne`, O25: "Plus de 2,5 buts", U25: "Moins de 2,5 buts" })[k];
const upcomingOdds = () => FX.filter(f => !started(f) && S.odds[f.key] && Object.keys(S.odds[f.key]).length);
const fxLabel = f => `${short(f.home)} – ${short(f.away)} · ${new Date(f.date + "T12:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })}${f.time ? " " + f.time : ""}`;

// Matrice des scores recalée sur le marché : ajustement itératif aux probabilités Pinnacle sans marge (1X2 et ±2,5 buts)
const MM = {};
function mktMatrix(f) {
  const fair = fairOf(f); if (!fair) return null;
  const sig = JSON.stringify(fair); if (MM[f.key]?.sig === sig) return MM[f.key].M;
  const n = 11, M = Float64Array.from(f.m.M);
  for (let it = 0; it < 60; it++) {
    const s = [0, 0, 0]; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) s[i > j ? 0 : i === j ? 1 : 2] += M[i * n + j];
    const t = [fair.H, fair.D, fair.A]; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const g = i > j ? 0 : i === j ? 1 : 2; M[i * n + j] *= t[g] / s[g]; }
    if (fair.O25) { let o = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i + j > 2) o += M[i * n + j];
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) M[i * n + j] *= i + j > 2 ? fair.O25 / o : fair.U25 / (1 - o); }
  }
  MM[f.key] = { sig, M }; return M;
}

// ---------- Cote boostée ----------
function boostBlock() {
  const T = S.tool, list = upcomingOdds(); if (!list.length) return `<div class="empty">Aucun match coté à venir.</div>`;
  const f = list.find(x => x.key === T.bm) || list[0], mkt = ["O25", "U25"].includes(T.bk) ? "OU25" : "1X2", ref = refProbs(f, mkt), p = ref.p[MK[mkt].indexOf(T.bk)];
  const o = numv(T.bo), mx = numv(T.bmax), norm = bestMine(f, T.bk), e = o > 1 ? p * o - 1 : null;
  const k = o > 1 ? S.cfg.bank * L90.kelly(p, o, S.cfg.kfrac, 1) : 0, stake = mx > 0 ? Math.min(mx, k) : k;
  return `<div class="row" style="align-items:flex-end">
      <label class="f" style="min-width:min(100%,260px)">Match<select data-tool="bm">${list.map(x => `<option value="${esc(x.key)}" ${x === f ? "selected" : ""}>${esc(fxLabel(x))}</option>`).join("")}</select></label>
      <label class="f">Issue boostée<select data-tool="bk">${B3_SEL.map(x => `<option value="${x}" ${x === T.bk ? "selected" : ""}>${esc(selLab(f, x))}</option>`).join("")}</select></label>
      <label class="f">Cote boostée<input type="number" step="0.01" id="t-bo" data-tool="bo" value="${esc(T.bo)}" placeholder="ex. 2,50"></label>
      <label class="f">Mise max du boost (€)<input type="number" step="1" id="t-bmax" data-tool="bmax" value="${esc(T.bmax)}"></label></div>
    <div class="readouts" style="margin-top:12px">
      <div class="ro"><span>Probabilité juste</span><b>${pct(p, 1)}</b></div>
      <div class="ro"><span>Cote juste</span><b>${odd(1 / p)}</b></div>
      <div class="ro"><span>Cote normale chez toi</span><b>${norm ? odd(norm.o) : "–"}</b>${norm ? `<span>${esc(norm.book)}</span>` : ""}</div>
      <div class="ro"><span>Espérance du boost</span><b class="${e > 0 ? "pos" : ""}">${e == null ? "–" : sgn(e)}</b></div>
      <div class="ro"><span>Gain moyen à la mise conseillée</span><b>${e == null ? "–" : eur(stake * e)}</b><span>${e > 0 ? `mise ${eur(stake)}` : "ne pas jouer"}</span></div></div>
    <p class="note" style="margin-top:8px">${e == null ? `Saisis la cote boostée affichée par ton bookmaker. Rentable à partir de <strong>${odd(1 / p)}</strong>.` : e > 0 ? `Boost rentable : la cote dépasse la cote juste de ${sgn(o * p - 1)}. Mise = Kelly ${nf(S.cfg.kfrac, 2)} de ta bankroll, plafonnée à la mise max du boost.` : `Boost non rentable : malgré le boost, la cote reste sous la cote juste (${odd(1 / p)}).`} Référence : ${esc(ref.src)}.</p>`;
}

// ---------- Conversion de freebet et de pari remboursé ----------
function fbScan() {
  const T = S.tool, F = numv(T.fbAmt), A = T.fbBook, minO = numv(T.fbMin) || 1, c = (numv(T.fbConv) || 0) / 100, R = 0.1, free = T.fbType === "free";
  const hedgeOK = b => bookOK(b) && (T.fbB365 || b !== "Bet365"), out = []; let bestEV = null;
  if (!(F > 0)) return { out, bestEV };
  for (const f of upcomingOdds()) {
    const books = S.odds[f.key]; if (!books[A]) continue; const fair = fairOf(f);
    for (const market of ["1X2", "OU25"]) {
      const keys = MK[market];
      keys.forEach(k => {
        const oi = books[A][k]; if (!(oi >= minO)) return;
        if (free && fair?.[k]) { const v = F * (oi - 1) * fair[k]; if (!bestEV || v > bestEV.v) bestEV = { v, f, k, oi }; }
        const oth = keys.filter(x => x !== k).map(x => ({ k: x, ...(bestMine(f, x, hedgeOK) || {}) })); if (oth.some(x => !(x.o > 1))) return;
        const st = oth.map(x => Math.max(R, Math.round((free ? F * (oi - 1) : F * (oi - c)) / x.o / R) * R)), tot = st.reduce((a, b) => a + b, 0);
        const nets = [F * (oi - 1) - tot, ...oth.map((x, j) => st[j] * x.o - tot - (free ? 0 : F * (1 - c)))], worst = Math.min(...nets);
        out.push({ f, market, k, oi, oth: oth.map((x, j) => ({ ...x, s: st[j] })), tot, worst, conv: worst / F });
      });
    }
  }
  out.sort((a, b) => b.worst - a.worst); return { out: out.slice(0, 6), bestEV };
}
function fbBlock() {
  const T = S.tool, free = T.fbType === "free", F = numv(T.fbAmt), seen = [...new Set(Object.values(S.odds).flatMap(o => Object.keys(o)))].filter(b => !NOT_BOOK(b) && !isSharp(b));
  const books = [...new Set([...S.cfg.myBooks, ...seen])].filter(b => seen.includes(b)), { out, bestEV } = fbScan();
  return `<div class="chips" role="group" aria-label="Type d'offre"><button class="chip" data-toolv="fbType" data-v="free" aria-pressed="${free}">Freebet (mise non rendue)</button><button class="chip" data-toolv="fbType" data-v="refund" aria-pressed="${!free}">Pari remboursé si perdant</button></div>
    <div class="row" style="align-items:flex-end;margin-top:10px">
      <label class="f">${free ? "Montant du freebet (€)" : "Mise remboursable (€)"}<input type="number" step="1" id="t-fbAmt" data-tool="fbAmt" value="${esc(T.fbAmt)}"></label>
      <label class="f">Chez<select data-tool="fbBook">${books.map(b => `<option ${b === T.fbBook ? "selected" : ""}>${esc(b)}</option>`).join("")}</select></label>
      <label class="f">Cote minimale exigée<input type="number" step="0.05" id="t-fbMin" data-tool="fbMin" value="${esc(T.fbMin)}"></label>
      ${free ? "" : `<label class="f">Valeur d'un freebet (%)<input type="number" step="5" id="t-fbConv" data-tool="fbConv" value="${esc(T.fbConv)}"></label>`}
      <label class="f" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" data-toolb="fbB365" ${T.fbB365 ? "checked" : ""}>Couvrir aussi chez Bet365 (cotes jusqu'à 4 jours)</label></div>
    ${out.length ? `<div class="scroll" style="margin-top:12px"><table><thead><tr><th>Match</th><th>${free ? "Freebet sur" : "Mise sur"}</th><th>Couverture (argent réel)</th><th class="r">Garanti</th><th class="r">${free ? "Conversion" : "Rendement"}</th></tr></thead><tbody>
      ${out.map(x => `<tr><td><button class="btn small" data-open="${esc(x.f.key)}">${esc(short(x.f.home))} – ${esc(short(x.f.away))}</button><br><span class="faint">${esc(fxLabel(x.f).split(" · ")[1])}</span></td>
        <td><strong>${esc(selLab(x.f, x.k))}</strong><br><span class="num">${odd(x.oi)}</span> <span class="faint">${esc(T.fbBook)} · ${eur(F)}</span></td>
        <td>${x.oth.map(h => `${esc(selLab(x.f, h.k))} <span class="num">${odd(h.o)}</span> <span class="faint">${esc(h.book)}</span> : <strong class="num">${eur(h.s)}</strong>`).join("<br>")}</td>
        <td class="r num"><strong>${eur(x.worst)}</strong></td><td class="r num">${sgn(x.conv, 0)}</td></tr>`).join("")}</tbody></table></div>
      <p class="note" style="margin-top:8px">${free ? `Le freebet sur une cote haute, l'argent réel sur les autres issues : le gain est le même quel que soit le résultat. Une conversion de 70 à 80 % est un bon résultat.` : `Mise d'argent réel sur l'issue, couverture des autres ; si l'issue perd, le remboursement en freebet vaut environ ${nf(numv(T.fbConv) || 0)} % de la mise une fois converti avec le tableau Freebet. « Garanti » inclut cette valeur.`} Les mises de couverture sont arrondies à 0,10 €. Vérifie chaque cote juste avant de placer, jambe la plus fragile d'abord.</p>
      ${free && bestEV ? `<p class="note">Sans couvrir : la meilleure espérance est ${esc(selLab(bestEV.f, bestEV.k))} (${esc(short(bestEV.f.home))} – ${esc(short(bestEV.f.away))}) à ${odd(bestEV.oi)}, ${eur(bestEV.v)} en moyenne, mais tout ou rien. Couvrir sacrifie un peu d'espérance contre un gain certain.</p>` : ""}`
    : `<div class="empty">${F > 0 ? `Aucun match coté chez ${esc(T.fbBook)} à une cote d'au moins ${odd(numv(T.fbMin) || 1)} avec une couverture possible chez tes bookmakers.` : "Indique un montant."}</div>`}`;
}

// ---------- Couverture et cash-out ----------
function hedgeBlock() {
  const T = S.tool, R = numv(T.hR), M = numv(T.hM) || 0, os = numv(T.hOs), opp = [numv(T.hO1), numv(T.hO2)].filter(x => x > 1), cash = numv(T.hCash);
  let res = "";
  if (R > 0 && opp.length) {
    const hs = opp.map(o => Math.round(R / o * 100) / 100), tot = hs.reduce((a, b) => a + b, 0), locked = R - tot;
    const p = os > 1 ? L90.devig([os, ...opp], S.cfg.devig)[0] : Math.max(0, 1 - opp.reduce((a, o) => a + 1 / o, 0) / 1.05), fairV = R * p;
    res = `<div class="readouts" style="margin-top:12px">
      <div class="ro"><span>Mise de couverture</span><b>${eur(tot)}</b><span>${hs.map((h, i) => `${eur(h)} à ${odd(opp[i])}`).join(" + ")}</span></div>
      <div class="ro"><span>Encaissé quoi qu'il arrive</span><b>${eur(locked)}</b><span>${M > 0 ? `${locked - M >= 0 ? "+" : ""}${eur(locked - M)} par rapport à ta mise` : ""}</span></div>
      <div class="ro"><span>Valeur juste du pari</span><b>${eur(fairV)}</b><span>chance de gagner ${pct(p, 0)}${os > 1 ? "" : " (approx.)"}</span></div>
      ${cash > 0 ? `<div class="ro"><span>Cash-out proposé</span><b>${pct(cash / fairV, 0)}</b><span>de la valeur juste</span></div>` : ""}</div>
      <p class="note" style="margin-top:8px">${cash > 0 ? (cash >= locked ? `Le cash-out (${eur(cash)}) rapporte au moins autant que la couverture (${eur(locked)}) : plus simple, prends-le si tu veux sécuriser.` : `Couvrir rapporte ${eur(locked - cash)} de plus que le cash-out du bookmaker.`) + " " : ""}Laisser courir vaut ${eur(fairV)} en moyenne : sécuriser coûte ${eur(Math.max(0, fairV - Math.max(locked, cash > 0 ? cash : 0)))} d'espérance, en échange de la certitude. Pour une montante, couvrir le dernier palier transforme la série en gain sûr.</p>`;
  }
  return `<div class="row" style="align-items:flex-end">
      <label class="f">Retour potentiel du pari (€)<input type="number" step="1" id="t-hR" data-tool="hR" value="${esc(T.hR)}"></label>
      <label class="f">Déjà misé (€)<input type="number" step="1" id="t-hM" data-tool="hM" value="${esc(T.hM)}"></label>
      <label class="f">Cote actuelle de ton issue<input type="number" step="0.01" id="t-hOs" data-tool="hOs" value="${esc(T.hOs)}" placeholder="facultatif"></label>
      <label class="f">Cote contraire 1<input type="number" step="0.01" id="t-hO1" data-tool="hO1" value="${esc(T.hO1)}"></label>
      <label class="f">Cote contraire 2<input type="number" step="0.01" id="t-hO2" data-tool="hO2" value="${esc(T.hO2)}" placeholder="1X2 seulement"></label>
      <label class="f">Cash-out proposé (€)<input type="number" step="0.5" id="t-hCash" data-tool="hCash" value="${esc(T.hCash)}" placeholder="facultatif"></label></div>
    ${res || `<p class="note" style="margin-top:8px">Exemple : dernier palier d'une montante, retour 120 € si Lens gagne. Saisis les cotes actuelles du nul et de la victoire adverse : la page calcule les mises qui garantissent le même gain dans tous les cas, et compare avec le cash-out proposé.</p>`}`;
}

// ---------- Dutching ----------
function dutchBlock() {
  const T = S.tool, os = T.dut.map(numv), ok = os.filter(o => o > 1), Tot = numv(T.dutT);
  let res = "";
  if (ok.length >= 2 && Tot > 0) { const inv = ok.map(o => 1 / o), s = inv.reduce((a, b) => a + b, 0);
    res = `<div class="readouts" style="margin-top:12px"><div class="ro"><span>Cote équivalente</span><b>${odd(1 / s)}</b></div><div class="ro"><span>Retour si une passe</span><b>${eur(Tot / s)}</b></div></div>
      <div class="scroll"><table style="margin-top:8px"><tbody>${ok.map((o, i) => `<tr><td>Sélection ${i + 1}</td><td class="r num">cote ${odd(o)}</td><td class="r num">mise <strong>${eur(Tot * inv[i] / s)}</strong></td></tr>`).join("")}</tbody></table></div>`; }
  return `<div class="row" style="align-items:flex-end">${T.dut.map((v, i) => `<label class="f">Cote ${i + 1}<input type="number" step="0.01" id="t-dut${i}" data-tooldut="${i}" value="${esc(v)}"></label>`).join("")}
      <label class="f">Mise totale (€)<input type="number" step="1" id="t-dutT" data-tool="dutT" value="${esc(T.dutT)}"></label>
      <button class="btn small" data-tooladd="1" ${T.dut.length >= 5 ? "disabled" : ""}>+ cote</button></div>${res}
    <p class="note" style="margin-top:8px">Répartit une mise sur plusieurs issues exclusives (deux scores exacts, deux buteurs, deux écarts) pour le même retour quelle que soit celle qui passe. Exemple pour l'Objectif ×2 : « 1-0 » à 6,5 et « 2-0 » à 8 font une cote équivalente de 3,59.</p>`;
}

// ---------- Onglet ----------
function renderTools() {
  const T = S.tool, narrow = innerWidth < 600, val = T.v === "value";
  let spec, side = "";
  if (val) { spec = value3dSpec(narrow); const G = spec.G, per = {};
    for (const f of G.list) { const fair = fairOf(f); for (const [b, o] of Object.entries(S.odds[f.key])) { if (!S.cfg.myBooks.includes(b)) continue; for (const k of B3_SEL) if (o[k] > 1 && fair[k]) (per[b] ??= []).push(fair[k] * o[k] - 1); } }
    const pos = G.cells.filter(x => x.ev >= 0).sort((a, b) => b.ev - a.ev);
    side = `<div class="b3-legend">${Object.entries(per).sort((a, b) => avg(b[1]) - avg(a[1])).map(([b, v]) => `<span><i style="background:${b3Hex(b3Color(b))}"></i>${esc(b.replace(" (FR)", ""))} <b class="num">${sgn(avg(v))}</b></span>`).join("")}</div>
      <p class="note">${G.cells.length ? `${pos.length} sélection${pos.length > 1 ? "s" : ""} sur ${G.cells.length} au-dessus du plan${pos.length ? ` ; la meilleure : ${esc(selLab(pos[0].f, pos[0].k))} (${esc(short(pos[0].f.home))} – ${esc(short(pos[0].f.away))}) à ${odd(pos[0].o)} chez ${esc(pos[0].book)}, ${sgn(pos[0].ev)}` : ""}. Chiffre de chaque bookmaker : ce que ses cotes rendent en moyenne face au prix juste.${per["Bet365"] ? " Bet365 paraît moins cher, mais ses cotes viennent d'un fichier mis à jour deux fois par semaine : une partie de l'écart vient de cotes périmées, à vérifier sur le site." : ""}` : "Aucun match à venir coté par Pinnacle."}</p>`; }
  else { spec = margin3dSpec(); const tot = spec.books.map(b => [b, spec.lgs.flatMap(l => spec.acc[l][b] || [])]).filter(x => x[1].length);
    side = `<div class="b3-legend">${tot.map(([b, v]) => `<span><i style="background:${b3Hex(b3Color(b))}"></i>${esc(b.replace(" (FR)", ""))} <b class="num">${pct(avg(v), 1)}</b></span>`).join("")}</div>
      <p class="note">Marge moyenne 1X2 par championnat ; plus la barre est basse, moins le bookmaker prélève. Barre cerclée : le moins cher de tes bookmakers dans ce championnat.</p>`; }
  $("#v-tools").innerHTML = `<div class="stack">
    <div><h1>Outils de paris</h1><p class="lede">Les cotes réelles de tes bookmakers, face au prix juste de Pinnacle. Les seuls avantages durables à la portée d'un parieur en France sont là : cotes boostées, freebets, bonus de remboursement, et choisir le bookmaker le moins cher pour chaque pari.</p></div>
    <div class="panel"><header><h2>${val ? "Relief de la valeur" : "Marges par championnat"}</h2><div class="chips"><button class="chip" data-toolv="v" data-v="value" aria-pressed="${val}">Valeur</button><button class="chip" data-toolv="v" data-v="margin" aria-pressed="${!val}">Marges</button></div></header>
      ${val ? `<p class="muted" style="margin:0 0 8px">Chaque barre : la meilleure cote de tes bookmakers sur une issue, comparée à la cote juste Pinnacle. Au-dessus du plan lumineux, le pari a une espérance positive ; en dessous, tu paies la marge. Couleur : le bookmaker qui offre cette cote.</p>` : ""}
      ${b3Panel("t3d")}${side}<p class="note">Glisse pour tourner ; survole ou touche une barre pour le détail.</p></div>
    ${patienceBlock()}
    <div class="panel"><header><h2>Cote boostée : rentable ou pas ?</h2><span class="note">Winamax, Betclic, Unibet en publient chaque jour</span></header>${boostBlock()}</div>
    <div class="panel"><header><h2>Freebets et paris remboursés</h2><span class="note">Conversion en gain garanti avec tes bookmakers</span></header>${fbBlock()}</div>
    <div class="grid2">
      <div class="panel"><header><h2>Couverture et cash-out</h2></header>${hedgeBlock()}</div>
      <div class="panel"><header><h2>Dutching</h2></header>${dutchBlock()}</div></div>
  </div>`;
  if (spec.bars.length) b3Mount("t3d", spec); else $("#t3d-stage").innerHTML = `<div class="empty">Pas encore de cotes Pinnacle pour les matchs à venir.</div>`;
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-toolv],[data-tooladd]"); if (!b) return;
  if (b.dataset.tooladd) { if (S.tool.dut.length < 5) S.tool.dut.push(""); } else S.tool[b.dataset.toolv] = b.dataset.v;
  saveTool(); render();
});
document.addEventListener("input", e => {
  const d = e.target.dataset; if (d.tool == null && d.tooldut == null) return;
  if (e.target.tagName === "SELECT") return;
  if (d.tooldut != null) S.tool.dut[+d.tooldut] = e.target.value; else S.tool[d.tool] = e.target.value;
  saveTool(); deferRender(e.target);
});
document.addEventListener("change", e => {
  const d = e.target.dataset;
  if (d.tool != null && e.target.tagName === "SELECT") { S.tool[d.tool] = e.target.value; saveTool(); render(); }
  if (d.toolb != null) { S.tool[d.toolb] = e.target.checked; saveTool(); render(); }
});
document.addEventListener("input", e => { const d = e.target.dataset; if (d.cbo == null) return; (S.cbo ??= {})[d.cbo] = e.target.value; deferRender(e.target); });
