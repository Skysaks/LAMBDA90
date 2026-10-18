// ---------- Paris par marché, version prudente, Ma liste (calcul en direct), face-à-face ----------
const H2HX = EXTRA.h2h || {};
const BTTS_CAL = [0.0965, 0.7415];  // labo 14 : la matrice sous-estimait « les deux marquent » de 2 points (biais prouvé)
const bttsCal = p => { const q = Math.min(0.999, Math.max(0.001, p)); return 1 / (1 + Math.exp(-(BTTS_CAL[0] + BTTS_CAL[1] * Math.log(q / (1 - q))))); };
// Probabilités de tous les marchés d'un match, avant-match : matrice recalée sur Pinnacle quand il existe
function mProbs(f) {
  const M = mktMatrix(f) || f.m.M, J = fn => L90.joint(M, [fn]), P = {};
  for (const k of ["H", "D", "A", "1N", "N2", "12", "O15", "O25", "O35", "U25", "U35", "BY"]) P[k] = J(selFn(k));
  P.BY = bttsCal(P.BY); P.BN = 1 - P.BY; P.DNBH = P.H / (1 - P.D); P.DNBA = P.A / (1 - P.D); P.src = mktMatrix(f) ? "Pinnacle" : "modèle";
  return P;
}
// En direct : minute et score saisis, moteur live recalé sur l'avant-match
function mLive(f, t, hg, ag) {
  const r = L90.project(C, ...LR(f), Math.min(t, L90.NM), hg, ag, 0, 0), P = { H: r.H, D: r.D, A: r.A, O15: r.O15, O25: r.O25, O35: r.O35, BY: r.BY };
  P["1N"] = P.H + P.D; P.N2 = P.D + P.A; P["12"] = P.H + P.A; P.U25 = 1 - P.O25; P.U35 = 1 - P.O35; P.BN = 1 - P.BY;
  P.DNBH = P.D < 1 ? P.H / (1 - P.D) : 0; P.DNBA = P.D < 1 ? P.A / (1 - P.D) : 0; P.src = "direct"; return P;
}
const SELX = (f, k) => k === "DNBH" ? `${short(f.home)} (remboursé si nul)` : k === "DNBA" ? `${short(f.away)} (remboursé si nul)` : SELF(f, k);
const CATS = [["dc", "Double chance", ["1N", "N2"]], ["dnb", "Remboursé si nul", ["DNBH", "DNBA"]], ["o15", "+1,5 but", ["O15"]], ["o25", "+2,5 buts", ["O25"]], ["u25", "−2,5 buts", ["U25"]],
  ["u35", "−3,5 buts", ["U35"]], ["by", "Les deux marquent", ["BY"]], ["bn", "Une équipe ne marque pas", ["BN"]]];
S.cats = ls.get("cats", ["dc", "o25", "u35", "by"]);
function dayWindow() { const now = Date.now(), today = parisDay(), up = FX.filter(f => !started(f));
  const w = up.filter(f => parisDay(kickOf(f)) === today); return w.length >= 6 ? w : up.filter(f => kickOf(f) <= now + 36 * 3600e3); }
function catList(cid) {
  const c = CATS.find(x => x[0] === cid), out = [];
  for (const f of dayWindow()) { const P = mProbs(f), k = c[2].reduce((a, b) => P[b] > P[a] ? b : a), p = P[k];
    if (p < 0.5 || p > 0.8) continue; const b = ["O25", "U25", "H", "D", "A"].includes(k) ? bestMine(f, k) : null;
    out.push({ f, k, p, o: b?.o > 1 ? b.o : null, book: b?.book || null, src: P.src }); }
  return out.sort((a, b) => b.p - a.p).slice(0, 6);
}
function marketsBlock(D) {
  const frozen = D?.cats, past = Object.keys(DAILY).sort().filter(d => d < parisDay()), bil = {};
  for (const d of past) for (const [cid, v] of Object.entries(DAILY[d].cats || {})) for (const x of v) if ("won" in x) { const B = bil[cid] ??= { n: 0, w: 0, push: 0, p: 0 }; if (x.won === null) B.push++; else { B.n++; B.w += x.won ? 1 : 0; B.p += x.p; } }
  return `<div class="panel" id="markets"><header><h2>Paris du jour par marché</h2><span class="note">Pas seulement « qui gagne » : buts, les deux marquent, double chance</span></header>
    <div class="chips" role="group" aria-label="Marchés">${CATS.map(([id, lab]) => `<button class="chip" data-cat="${id}" aria-pressed="${S.cats.includes(id)}">${lab}</button>`).join("")}</div>
    <div class="mk-grid">${S.cats.map(cid => { const c = CATS.find(x => x[0] === cid), L = catList(cid), B = bil[cid];
      return `<div class="mk-col"><h3>${c[1]}${B?.n ? ` <span class="faint num">· réglés ${B.w}/${B.n}${B.push ? `, ${B.push} remb.` : ""} (annoncé ${pct(B.p / B.n)})</span>` : ""}</h3>${L.length ? `<ol class="mk-list">${L.map(x => `<li><div>${c[2].length > 1 ? `<strong>${esc(SELX(x.f, x.k))}</strong><span class="faint">${esc(short(x.f.home))} – ${esc(short(x.f.away))} · ${esc(kickLab(new Date(kickOf(x.f)).toISOString()))}</span>` : `<strong>${esc(short(x.f.home))} – ${esc(short(x.f.away))}</strong><span class="faint">${esc(LG[x.f.league] || "")} · ${esc(kickLab(new Date(kickOf(x.f)).toISOString()))}</span>`}</div>
        <div class="mk-n"><b class="num">${pct(x.p)}</b><span class="faint">juste ${odd(1 / x.p)}</span>${x.o ? `<span class="faint">${odd(x.o)} ${esc(x.book.replace(" (FR)", ""))} <span class="${x.p * x.o >= 1 ? "pos" : ""}">${sgn(x.p * x.o - 1)}</span></span>` : ""}</div>
        ${x.k.startsWith("DNB") ? "<span></span>" : `<button class="btn small mk-add" data-slipadd='${esc(JSON.stringify({ key: x.f.key, sel: x.k, o: x.o, book: x.book }))}' title="Ajouter au ticket" aria-label="Ajouter au ticket">+</button>`}</li>`).join("")}</ol>` : `<p class="note">Aucune sélection entre 50 et 80 % dans la fenêtre du jour.</p>`}</div>`; }).join("") || `<p class="muted">Choisis un ou plusieurs marchés.</p>`}</div>
    <p class="note">Probabilités : matrice des scores recalée sur Pinnacle (1N2 et ±2,5) ; « les deux marquent » corrigé d'un biais de 2 points mesuré au labo 14. Sélections entre 50 et 80 % (cote juste 1,25 à 2). Les cotes des marchés ±1,5, ±3,5 et « les deux marquent » ne sont pas dans notre flux : compare la cote juste à celle de ton bookmaker.${frozen ? " Une version est figée chaque matin et réglée : le bilan par marché s'affiche à côté de chaque titre." : ""}</p></div>`;
}
// Version prudente d'un pick : mêmes idées, moins de risques (le 17 octobre, 4 des 6 picks perdus étaient des nuls)
function prudentLine(x) {
  const f = FXK[x.key]; if (!f || !["H", "A"].includes(x.sel)) return "";
  const P = mProbs(f), dc = x.sel === "H" ? "1N" : "N2", dnb = x.sel === "H" ? "DNBH" : "DNBA";
  return `<span class="tp-safe">Version prudente : ${esc(SELF(f, dc))} <b>${pct(P[dc])}</b> (juste ${odd(1 / P[dc])}) · remboursé si nul <b>${pct(P[dnb])}</b> (juste ${odd(1 / P[dnb])})</span>`;
}

// ---------- Ma liste : les matchs que tu suis, calcul avant-match et en direct ----------
S.watch = ls.get("watch", []); S.wlive = ls.get("wlive", {});
const W_SELS = [["H", "1"], ["D", "N"], ["A", "2"], ["1N", "1N"], ["N2", "N2"], ["O15", "+1,5"], ["O25", "+2,5"], ["U25", "−2,5"], ["U35", "−3,5"], ["BY", "2 marquent"], ["BN", "Non"]];
const saveWatch = () => { ls.set("watch", S.watch); ls.set("wlive", S.wlive); };
function watchFind(q) { const k = foldTxt(q); if (!k) return null; let best = null, bs = 0;
  for (const f of FX) { if (started(f) && !S.watch.some(w => w.key === f.key)) continue; const lab = foldTxt(`${f.home} ${f.away} ${short(f.home)} ${short(f.away)}`);
    const s = k.split(/[\s–-]+/).filter(Boolean).reduce((a, t) => a + (lab.includes(t) ? t.length : 0), 0); if (s > bs) { bs = s; best = f; } } return bs >= 3 ? best : null; }
function watchAdd(f, odds) { if (!f) return false; const w = S.watch.find(x => x.key === f.key); if (w) Object.assign(w.o, odds || {}); else S.watch.push({ key: f.key, o: odds || {} }); saveWatch(); return true; }
function watchRow(w, i) {
  const f = FXK[w.key]; if (!f) return "";
  const L = S.wlive[w.key] || { t: 0, hg: 0, ag: 0 }, live = L.t > 0 || L.hg > 0 || L.ag > 0, P = live ? mLive(f, L.t, L.hg, L.ag) : mProbs(f);
  const ev = W_SELS.filter(([k]) => w.o[k] > 1).map(([k]) => ({ k, e: P[k] * w.o[k] - 1 })).sort((a, b) => b.e - a.e)[0];
  const safe = W_SELS.map(([k]) => ({ k, p: P[k] })).filter(x => x.p <= 0.85).sort((a, b) => b.p - a.p)[0];
  return `<div class="wl-card" data-wkey="${esc(w.key)}"><div class="wl-h"><div><strong>${esc(short(f.home))} – ${esc(short(f.away))}</strong><span class="faint">${esc(LG[f.league] || "")} · ${esc(kickLab(new Date(kickOf(f)).toISOString()))}${live ? ` · <b class="live-dot">en direct ${L.t}'</b>` : ""}</span></div><button class="btn small" data-wdel="${esc(w.key)}" aria-label="Retirer">×</button></div>
    <div class="wl-live"><label>Minute<input type="number" min="0" max="90" value="${L.t}" data-wl="t" id="wl-${i}-t" inputmode="numeric"></label><label>Score<span class="wl-sc"><input type="number" min="0" max="15" value="${L.hg}" data-wl="hg" id="wl-${i}-hg" inputmode="numeric"><b>-</b><input type="number" min="0" max="15" value="${L.ag}" data-wl="ag" id="wl-${i}-ag" inputmode="numeric"></span></label>${live ? `<button class="btn small" data-wlreset="${esc(w.key)}">Avant-match</button>` : ""}</div>
    <div class="wl-grid">${W_SELS.map(([k, lab]) => { const o = w.o[k], e = o > 1 ? P[k] * o - 1 : null;
      return `<div class="wl-c ${e != null && e > 0 ? "val" : ""}"><span>${lab}</span><b class="num">${pct(P[k])}</b><span class="faint">juste ${P[k] > 0.005 ? odd(1 / P[k]) : "–"}</span><input type="text" inputmode="decimal" placeholder="cote" value="${o > 1 ? odd(o) : ""}" data-wodd="${k}" id="wo-${i}-${k}" aria-label="Cote ${lab}">${e != null ? `<span class="${e > 0 ? "pos" : "faint"} num">${sgn(e)}</span>` : ""}</div>`; }).join("")}</div>
    <p class="note" style="margin:6px 0 0">${safe ? `Le plus sûr : <b>${esc(SELX(f, safe.k))}</b> (${pct(safe.p)})` : ""}${ev ? ` · Meilleure valeur à tes cotes : <b>${esc(SELX(f, ev.k))}</b> ${sgn(ev.e)}${ev.e <= 0 ? " (aucune cote au-dessus du juste)" : ""}` : " · Saisis les cotes de ton bookmaker pour voir la valeur."}${popTrap(f, "H") || popTrap(f, "A") ? ` · ${esc((popTrap(f, "H") || popTrap(f, "A")).split(".")[0])}.` : ""}</p></div>`;
}
function watchBlock() {
  const up = FX.filter(f => !started(f)).slice(0, 200);
  return `<div class="panel" id="watch"><header><h2>Ma liste</h2><span class="note">Tes matchs suivis : tous les marchés, tes cotes, en direct</span></header>
    <div class="wl-add"><input id="watch-q" list="watch-dl" placeholder="Ajouter un match : tape une équipe" autocomplete="off"><datalist id="watch-dl">${up.map(f => `<option value="${esc(short(f.home))} – ${esc(short(f.away))}"></option>`).join("")}</datalist>
      <button class="btn small primary" data-watch="add">Ajouter</button><label class="btn small" id="watch-imgl" ${S.canImg ? "" : "hidden"}>Importer une capture<input type="file" accept="image/*" multiple id="watch-img" hidden></label>${S.watch.length ? `<button class="btn small" data-watch="clear">Vider</button>` : ""}</div>
    ${S.wmsg ? `<p class="note">${esc(S.wmsg)}</p>` : ""}
    ${S.watch.length ? `<div class="wl-list">${S.watch.map((w, i) => watchRow(w, i)).join("")}</div>` : `<p class="muted" style="margin:6px 0 0">Ajoute tes matchs (ou une capture de tes favoris Winamax) : la page calcule la probabilité de chaque marché, la cote juste, et la valeur à tes cotes. Pendant le match, saisis la minute et le score : tout se recalcule.</p>`}</div>`;
}
async function watchImport(files) {
  const sample = await hostUse("sample"); if (!sample) { toast("Lecture de capture indisponible ici : envoie-la dans la conversation"); return; }
  S.wmsg = "Lecture de la capture…"; render();
  try {
    const list = await sample.json(`Ces images sont des captures d'écran d'un site de paris sportifs (souvent Winamax). Liste chaque match de football visible avec les cotes affichées. Réponds UNIQUEMENT en JSON : un tableau d'objets {"home": "équipe à domicile", "away": "équipe à l'extérieur", "odds": {"1": nombre, "N": nombre, "2": nombre, "O25": nombre, "U25": nombre, "BY": nombre, "BN": nombre}} ; omets les cotes absentes, n'invente rien. Tableau vide si aucun match.`, { images: files, modelTier: "default" });
    let ok = 0, miss = [];
    for (const m of Array.isArray(list) ? list : []) {
      let best = null, bs = 0; for (const f of FX) { const s = L90.nameScore(f.home, m.home || "") + L90.nameScore(f.away, m.away || ""); if (s > bs) { bs = s; best = f; } }
      if (best && bs >= 1) { const o = {}, map = { "1": "H", N: "D", "2": "A", O25: "O25", U25: "U25", BY: "BY", BN: "BN" }; for (const [a, b] of Object.entries(map)) { const v = +String(m.odds?.[a] ?? "").replace(",", "."); if (v > 1) o[b] = v; } watchAdd(best, o); ok++; }
      else miss.push(`${m.home} – ${m.away}`);
    }
    S.wmsg = `${ok} match${ok > 1 ? "s" : ""} ajouté${ok > 1 ? "s" : ""}${miss.length ? ` ; hors de nos 8 championnats ou non reconnus : ${miss.slice(0, 4).join(", ")}` : ""}. Vérifie les cotes lues.`;
  } catch (e) { S.wmsg = e?.code === "not_granted" ? "Lecture refusée : autorise l'assistant IA pour cette page." : "Capture illisible : réessaie avec une image plus nette."; }
  render();
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-cat],[data-watch],[data-wdel],[data-wlreset]"); if (!b) return; const d = b.dataset;
  if (d.cat) { S.cats = S.cats.includes(d.cat) ? S.cats.filter(x => x !== d.cat) : [...S.cats, d.cat]; ls.set("cats", S.cats); render(); return; }
  if (d.watch === "add") { const q = $("#watch-q")?.value || "", f = watchFind(q); S.wmsg = f ? "" : "Match introuvable dans nos 8 championnats."; if (f) watchAdd(f); render(); setTimeout(() => $("#watch-q")?.focus(), 30); return; }
  if (d.watch === "clear") { S.watch = []; S.wlive = {}; saveWatch(); S.wmsg = ""; render(); return; }
  if (d.wdel) { S.watch = S.watch.filter(w => w.key !== d.wdel); delete S.wlive[d.wdel]; saveWatch(); render(); return; }
  if (d.wlreset) { delete S.wlive[d.wlreset]; saveWatch(); render(); }
});
document.addEventListener("keydown", e => { if (e.target.id === "watch-q" && e.key === "Enter") { e.preventDefault(); $('[data-watch="add"]')?.click(); } });
document.addEventListener("change", e => { if (e.target.id === "watch-img" && e.target.files?.length) watchImport(e.target.files); });
document.addEventListener("input", e => {
  const card = e.target.closest?.(".wl-card"); if (!card) return; const key = card.dataset.wkey, w = S.watch.find(x => x.key === key); if (!w) return;
  if (e.target.dataset.wl) { const L = S.wlive[key] ??= { t: 0, hg: 0, ag: 0 }; L[e.target.dataset.wl] = Math.max(0, Math.min(e.target.dataset.wl === "t" ? 90 : 15, +e.target.value || 0)); saveWatch(); deferRender(e.target); return; }
  if (e.target.dataset.wodd) { const v = parseFloat(String(e.target.value).replace(",", ".")); if (v > 1) w.o[e.target.dataset.wodd] = v; else delete w.o[e.target.dataset.wodd]; saveWatch(); deferRender(e.target); }
});
async function watchCaps() { const s = await hostUse("sample"), l = await s?.limits?.().catch(() => null); S.canImg = !!l?.images; const el = $("#watch-imgl"); if (el) el.hidden = !S.canImg; }

// ---------- Face-à-face ----------
function h2hBlock(f) {
  const X = H2HX[f.key]; if (!X) return "";
  const h = short(f.home), a = short(f.away), l14 = LAB.deep?.lab14;
  const cell = (lab, v) => `<div class="ro"><span>${lab}</span><b>${v}</b></div>`;
  return `<div><h3 style="margin:6px 0">Face-à-face depuis ${X.since} · ${X.n} matchs</h3>
    <div class="readouts">${cell(`${esc(h)} gagne`, `${X.w}`)}${cell("Nuls", `${X.d}`)}${cell(`${esc(a)} gagne`, `${X.l}`)}${cell("Buts par match", nf(X.goals, 2))}${cell("Les deux marquent", pct(X.btts))}${cell("+2,5 buts", pct(X.o25))}${cell("−3,5 buts", pct(X.u35))}${X.corners ? cell("Corners", nf(X.corners, 1)) : ""}${X.cards ? cell("Cartons", nf(X.cards, 1)) : ""}</div>
    <p class="note" style="margin:6px 0">Chez ${esc(h)} : ${X.venue.w} victoire${X.venue.w > 1 ? "s" : ""}, ${X.venue.d} nul${X.venue.d > 1 ? "s" : ""}, ${X.venue.l} défaite${X.venue.l > 1 ? "s" : ""} sur ${X.venue.n}${X.ht_goals ? ` · ${nf(X.ht_goals, 2)} buts en moyenne à la pause` : ""}.</p>
    <div class="scroll"><table><tbody>${X.last.map(([d, hHome, g1, g2, t1, t2]) => `<tr><td class="faint">${new Date(d + "T12:00").toLocaleDateString("fr-FR")}</td><td>${esc(hHome ? h : a)} <b class="num">${g1}-${g2}</b> ${esc(hHome ? a : h)}</td><td class="faint num">${t1 != null ? `mi-temps ${t1}-${t2}` : ""}</td></tr>`).join("")}</tbody></table></div>
    <p class="note">${l14 ? `Labo 14, ${nf(l14.n)} matchs : un face-à-face riche ou pauvre en buts, ou dominé, n'apporte rien au-delà du prix du marché. ` : ""}À lire comme du contexte, pas comme un signal.</p></div>`;
}
