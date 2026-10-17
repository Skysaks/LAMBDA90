// ---------- Expérience : ticket de pari global, recherche universelle (Ctrl+K), brief personnel ----------
S.slip = ls.get("slip", []); S.slipOpen = false;
const saveSlip = () => ls.set("slip", S.slip);
// Probabilité juste d'un ticket : sélections d'un même match jointes par la matrice recalée, matchs différents supposés indépendants
function slipCalc() {
  const by = {}; for (const s of S.slip) (by[s.key] ??= []).push(s);
  let p = 1, ok = true; const notes = [];
  for (const [key, L] of Object.entries(by)) {
    const f = FXK[key]; if (!f) { ok = false; continue; }
    const M = mktMatrix(f) || f.m.M, fns = L.map(s => selFn(s.sel)); if (fns.some(x => !x)) { ok = false; continue; }
    const pj = L90.joint(M, fns); p *= pj; if (L.length > 1) notes.push(`${short(f.home)} – ${short(f.away)} : ${L.length} sélections liées, probabilité jointe ${pct(pj, 1)}`);
  }
  // meilleure cote combinée chez un seul de tes bookmakers (toutes les jambes doivent y être cotées)
  let best = null;
  for (const b of S.cfg.myBooks) { let o = 1; for (const s of S.slip) { const v = S.odds[s.key]?.[b]?.[s.sel]; if (!(v > 1)) { o = 0; break; } o *= v; } if (o > 1 && (!best || o > best.o)) best = { o, b }; }
  const multi = Object.values(by).some(L => L.length > 1);
  return { p: ok ? p : null, fair: ok && p > 0 ? 1 / p : null, best: multi ? null : best, multi, notes, n: S.slip.length };
}
function slipAdd(x) {
  if (S.slip.some(s => s.key === x.key && s.sel === x.sel)) { toast("Déjà dans le ticket"); return; }
  if (S.slip.length >= 12) { toast("12 sélections au plus"); return; }
  S.slip.push({ key: x.key, sel: x.sel, o: +x.o || null, book: x.book || null }); saveSlip(); toast(`Ajouté au ticket (${S.slip.length})`); renderSlip();
}
function renderSlip() {
  let el = $("#slip"); if (!el) { el = document.createElement("div"); el.id = "slip"; document.body.append(el); }
  if (!S.slip.length) { el.innerHTML = ""; el.hidden = true; return; } el.hidden = false;
  const c = slipCalc(), stake = c.best && c.p ? S.cfg.bank * L90.kelly(c.p, c.best.o, S.cfg.kfrac, S.cfg.cap) : 0;
  el.innerHTML = S.slipOpen ? `<div class="slip-p" role="dialog" aria-label="Ticket"><header><strong>Ticket · ${c.n} sélection${c.n > 1 ? "s" : ""}</strong><button class="btn small" data-slip="close" aria-label="Fermer">Fermer</button></header>
      <ul>${S.slip.map((s, i) => { const f = FXK[s.key]; return `<li><div><strong>${esc(SELF(f, s.sel))}</strong><span class="faint">${f ? `${esc(short(f.home))} – ${esc(short(f.away))}` : ""}</span></div><button class="btn small" data-slipdel="${i}" aria-label="Retirer">×</button></li>`; }).join("")}</ul>
      <div class="readouts"><div class="ro"><span>Probabilité juste</span><b>${c.p == null ? "–" : pct(c.p, c.p < 0.1 ? 1 : 0)}</b></div><div class="ro"><span>Cote juste</span><b>${c.fair ? odd(c.fair) : "–"}</b></div>
        <div class="ro"><span>Meilleure cote combinée</span><b>${c.best ? odd(c.best.o) : "–"}</b><span>${c.best ? esc(c.best.b.replace(" (FR)", "")) : c.multi ? "créateur de paris : voir l'onglet Match" : "pas chez un seul bookmaker"}</span></div>
        <div class="ro"><span>Espérance</span><b class="${c.best && c.p * c.best.o > 1 ? "pos" : ""}">${c.best && c.p ? sgn(c.p * c.best.o - 1) : "–"}</b></div></div>
      ${c.notes.length ? `<p class="note">${c.notes.map(esc).join("<br>")}</p>` : ""}
      <p class="note">Probabilités : marché Pinnacle sans marge (matrice des scores recalée) ; deux matchs différents sont traités comme indépendants.${c.best && c.p && c.p * c.best.o <= 1 ? ` Le bookmaker prélève ${pct(1 - c.p * c.best.o, 1)} sur ce combiné.` : ""}</p>
      <div class="row"><button class="btn small primary" data-slip="journal" ${c.best ? "" : "disabled"}>Au journal${stake ? ` (${eur(stake)})` : ""}</button><button class="btn small" data-slip="copy">Copier</button><button class="btn small" data-slip="clear">Vider</button></div></div>`
    : `<button class="slip-b" data-slip="open" aria-label="Ouvrir le ticket"><b>${c.n}</b> Ticket ${c.fair ? `· cote juste ${odd(c.fair)}` : ""}</button>`;
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-slipadd],[data-slip],[data-slipdel],[data-slipcombo]"); if (!b) return; const d = b.dataset;
  if (d.slipcombo) { const x = JSON.parse(d.slipcombo); for (const sel of x.sels) if (!S.slip.some(s => s.key === x.key && s.sel === sel)) S.slip.push({ key: x.key, sel }); saveSlip(); toast(`Ticket : ${S.slip.length} sélections`); renderSlip(); return; }
  if (d.slipadd) { slipAdd(JSON.parse(d.slipadd)); return; }
  if (d.slipdel) { S.slip.splice(+d.slipdel, 1); saveSlip(); renderSlip(); return; }
  if (d.slip === "open") S.slipOpen = true; else if (d.slip === "close") S.slipOpen = false; else if (d.slip === "clear") { S.slip = []; saveSlip(); }
  else if (d.slip === "copy") { const c = slipCalc(), txt = S.slip.map(s => { const f = FXK[s.key]; return `${SELF(f, s.sel)} (${f ? short(f.home) + " – " + short(f.away) : ""})`; }).join("\n") + (c.fair ? `\nCote juste ${odd(c.fair)}` : ""); navigator.clipboard?.writeText(txt).then(() => toast("Ticket copié")); }
  else if (d.slip === "journal") { const c = slipCalc(); if (!c.best) return; if (breaker().on) { toast("Disjoncteur actif"); return; }
    addBet({ label: S.slip.map(s => { const f = FXK[s.key]; return f ? short(f.home) + "-" + short(f.away) : ""; }).join(" + "), market: "combiné", sel: S.slip.map(s => s.sel).join("+"), book: c.best.b, odds: Math.round(c.best.o * 100) / 100, stake: Math.round(S.cfg.bank * L90.kelly(c.p, c.best.o, S.cfg.kfrac, S.cfg.cap) * 100) / 100, p: c.p }); }
  renderSlip();
});
const slipBtn = (key, sel, o, book) => `<button class="btn small" data-slipadd='${esc(JSON.stringify({ key, sel, o, book }))}' title="Ajouter au ticket">+ Ticket</button>`;

// ---------- Recherche universelle ----------
const CMD_TABS = [["daily", "Jour : Top Picks, Hot, Cold"], ["radar", "Radar des matchs"], ["match", "Match"], ["season", "Saison simulée"], ["fan", "Défis entre amis"], ["value", "Value et arbitrage"], ["ladder", "Objectif ×2 et montante"], ["survivor", "Survivant et classements"], ["tools", "Outils : boosts, freebets, couverture"], ["studio", "Studio de contenu"], ["bank", "Bankroll, journal, coach"], ["proof", "Registre et laboratoire"]];
function cmdItems(q) {
  const k = foldTxt(q), out = [];
  for (const [t, l] of CMD_TABS) if (!k || foldTxt(l).includes(k)) out.push({ kind: "Onglet", lab: l, act: () => go(t) });
  if (k.length >= 2) for (const f of FX) { if (out.length > 24) break; if (foldTxt(f.home + " " + f.away).includes(k)) out.push({ kind: started(f) ? "Joué" : dayName(f.date).split(" ").slice(0, 2).join(" "), lab: `${short(f.home)} – ${short(f.away)}`, act: () => { S.matchKey = f.key; S.mtab = "apercu"; go("match"); } }); }
  if (k.length >= 2) for (const lg of Object.keys(LG)) if (foldTxt(LG[lg]).includes(k)) out.push({ kind: "Saison", lab: LG[lg], act: () => { S.seasonLg = lg; go("season"); } });
  return out.slice(0, 25);
}
function openCmd() {
  let el = $("#cmdk"); if (!el) { el = document.createElement("div"); el.id = "cmdk"; el.innerHTML = `<div class="cmd-p" role="dialog" aria-label="Recherche"><input id="cmd-q" type="search" placeholder="Équipe, match, outil… (Échap pour fermer)" autocomplete="off"><ul id="cmd-l"></ul></div>`; document.body.append(el);
    el.addEventListener("click", e => { if (e.target === el) closeCmd(); const li = e.target.closest("[data-ci]"); if (li) { const it = S._cmd[+li.dataset.ci]; closeCmd(); it?.act(); } });
    $("#cmd-q").addEventListener("input", e => drawCmd(e.target.value)); $("#cmd-q").addEventListener("keydown", e => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); S._ci = Math.max(0, Math.min((S._cmd?.length || 1) - 1, (S._ci || 0) + (e.key === "ArrowDown" ? 1 : -1))); drawCmd(e.target.value, true); }
      if (e.key === "Enter") { const it = S._cmd?.[S._ci || 0]; closeCmd(); it?.act(); } if (e.key === "Escape") closeCmd(); }); }
  el.hidden = false; S._ci = 0; $("#cmd-q").value = ""; drawCmd(""); setTimeout(() => $("#cmd-q").focus(), 10);
}
function drawCmd(q, keep) { if (!keep) S._ci = 0; S._cmd = cmdItems(q); $("#cmd-l").innerHTML = S._cmd.map((it, i) => `<li data-ci="${i}" class="${i === S._ci ? "on" : ""}"><span class="faint">${esc(it.kind)}</span>${esc(it.lab)}</li>`).join("") || `<li class="faint">Aucun résultat</li>`; }
function closeCmd() { const el = $("#cmdk"); if (el) el.hidden = true; }
document.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openCmd(); } else if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) { e.preventDefault(); openCmd(); } });
document.addEventListener("click", e => { if (e.target.closest("[data-cmd]")) openCmd(); });

// ---------- Brief personnel du jour ----------
function briefBlock() {
  const out = [], R = S.surv.run, pendJ = S.bets.filter(b => b.result === "pending").length, settleable = S.bets.filter(b => b.result === "pending" && b.matchKey && svResultOf(b.matchKey)).length;
  if (R && R.status === "alive") { const pend = R.bets.filter(b => b.status === "pending").length; out.push(["Survivant", `${eur(R.bank)} (×${nf(R.bank / R.cap, 2)})${pend ? `, ${pend} pari${pend > 1 ? "s" : ""} en cours` : ", aucun pari en cours : le plan propose " + eur(svPlanStake(R))}`, "survivor"]); }
  else if (R) out.push(["Survivant", R.status === "won" ? "Objectif atteint : relance une partie." : "Game Over : une nouvelle partie t'attend.", "survivor"]);
  const run = S.ladRun; if (run?.status === "active") out.push(["Montante", `palier ${run.steps.length}${run.pending ? " en cours" : " : le suivant est prêt"}`, "ladder"]);
  if (settleable) out.push(["Journal", `${settleable} pari${settleable > 1 ? "s" : ""} réglable${settleable > 1 ? "s" : ""} avec les résultats publiés`, "bank"]); else if (pendJ) out.push(["Journal", `${pendJ} pari${pendJ > 1 ? "s" : ""} en attente`, "bank"]);
  const br = breaker(); if (br.on) out.push(["Disjoncteur", br.reasons.join(" ; "), "bank"]);
  const D = DAILY[parisDay()]; if (D?.hot?.length) { const x = D.hot[0], f = fxOf(x); out.push(["Meilleur prix du jour", `${SELF(f, x.sel)} à ${odd(x.o)} (${(x.book || "").replace(" (FR)", "")}), juste ${odd(1 / x.pm)}`, "daily"]); }
  if (S.slip.length) out.push(["Ticket", `${S.slip.length} sélection${S.slip.length > 1 ? "s" : ""} en attente`, null]);
  if (!out.length) return "";
  return `<div class="brief"><span class="eyebrow">Pour toi aujourd'hui</span><ul>${out.map(([t, x, tab]) => `<li>${tab ? `<button class="linkish" data-tab="${tab}">` : `<span>`}<strong>${esc(t)}</strong> ${esc(x)}${tab ? "</button>" : "</span>"}</li>`).join("")}</ul></div>`;
}
// ---------- Navigation groupée : Paris et Jeux ----------
const NAV_GROUPS = {
  paris: [["value", "Value et arbitrage", "Paris au-dessus du prix juste, arbitrages"], ["ladder", "Objectif ×2", "Montante intégrale, sélections sûres"], ["tools", "Outils", "Boosts, freebets, couverture, marges 3D"], ["bank", "Bankroll", "Journal, CLV, coach anti-tilt"]],
  jeux: [["survivor", "Survivant", "Bankroll à faire grossir, classements"], ["fan", "Défis", "Pronostics entre amis, ligues"]]
};
function openMenu(btn) {
  const g = btn.dataset.menu; let m = $("#tmenu"); if (m && m.dataset.g === g) { closeMenu(); return; } closeMenu();
  m = document.createElement("div"); m.id = "tmenu"; m.dataset.g = g; m.setAttribute("role", "menu");
  const items = NAV_GROUPS[g].filter(([t]) => S.mode !== "fan" || !["value", "ladder", "tools", "bank", "survivor"].includes(t));
  m.innerHTML = items.map(([t, l, d]) => `<button role="menuitem" data-tab="${t}" aria-current="${S.tab === t}">${esc(l)}<small>${esc(d)}</small></button>`).join("");
  document.body.append(m); const r = btn.getBoundingClientRect(); m.style.top = r.bottom + 6 + "px"; m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.left)) + "px";
  btn.setAttribute("aria-expanded", "true"); m.querySelector("button")?.focus();
}
function closeMenu() { $("#tmenu")?.remove(); document.querySelectorAll("[data-menu]").forEach(b => b.setAttribute("aria-expanded", "false")); }
document.addEventListener("click", e => { const b = e.target.closest("[data-menu]"); if (b) { e.stopPropagation(); openMenu(b); return; } if (!e.target.closest("#tmenu") || e.target.closest("[data-tab]")) closeMenu(); }, true);
document.addEventListener("keydown", e => { if (e.key === "Escape") closeMenu(); });
addEventListener("scroll", () => closeMenu(), { passive: true });
