// ===== Lambda 90 — application =====
const PRE = DATA.pre, LIVE = DATA.live, C = LIVE.coef, EXTRA = DATA.extra, LAB = DATA.lab;
const LG = { "fr.1": "Ligue 1", "en.1": "Premier League", "es.1": "LaLiga", "de.1": "Bundesliga", "it.1": "Serie A", "pt.1": "Liga Portugal", "nl.1": "Eredivisie", "en.2": "Championship" };
const $ = s => document.querySelector(s);
// API de la plateforme qui héberge la page (stockage partagé, compte, téléchargements, IA) ; absente hors de cette plateforme
const HOST = () => globalThis[["cl", "aude"].join("")];
const hostUse = async name => { try { return await HOST()?.use?.(name); } catch { return null; } };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = (x, d = 0) => (x ?? 0).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x, d = 0) => x == null || isNaN(x) ? "–" : `${nf(x * 100, d)} %`;
const odd = x => x == null || !isFinite(x) || x <= 1 ? "–" : nf(x, 2);
const eur = x => `${nf(x, 2)} €`;
const sgn = (x, d = 1) => (x > 0 ? "+" : "") + nf(x * 100, d) + " %";
const short = n => n === "Paris FC" ? n : n.replace(/\b(FC|AFC|CF|SC|AC|SSC|RC|OGC|CD|UD|RCD|SV|TSG|VfB|VfL|1\. ?|Club|de Fútbol|Football Club|Calcio|Alsace|1899|1901|1904|1909|04|05|07|29)\b\.?/g, "").replace(/\s+/g, " ").trim();
const keyOf = f => `${f.league}|${f.date}|${f.home}|${f.away}`;
const FX = EXTRA.fixtures.map(f => ({ ...f, key: keyOf(f), m: L90.full(f, LAB.half_share[0], LAB.half_share[1], DATA.v3.wtot) }))
  .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
const FXK = Object.fromEntries(FX.map(f => [f.key, f]));
// Taux du moteur live recalés sur l'ensemble avant-match : total de buts inchangé, écart entre équipes ajusté pour que P(1) − P(2) coïncide
function LR(f) {
  if (f._lr) return f._lr;
  const target = f.m.H - f.m.A, g = s => { const r = L90.project(C, f.lam * Math.exp(s), f.mu * Math.exp(-s), 0, 0, 0, 0, 0); return r.H - r.A; };
  let lo = -1, hi = 1; for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2; g(mid) < target ? lo = mid : hi = mid; }
  const s = (lo + hi) / 2; return f._lr = [f.lam * Math.exp(s), f.mu * Math.exp(-s)];
}
const dayName = d => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const lastResult = PRE.last_result, V3 = DATA.v3;

// ---------- État ----------
const S = {
  tab: "daily", mode: "quant", league: "all", matchKey: FX[0]?.key, odds: {}, oddsSource: "demo",
  cfg: { devig: "shin", ref: "auto", minEV: 0.02, kfrac: 0.25, cap: 0.02, offshore: false, myBooks: ["Bet365", "Winamax (FR)", "Betclic (FR)", "Unibet (FR)"], onlyMine: true, bank: 1000, ddMax: 0.2, dayLoss: 0.05, arbTotal: 100, arbRound: 0.5 },
  live: {}, bets: [], picks: {}, store: "memory", ai: {}, mtab: "apercu", day: "all", q: "", seasonLg: "fr.1", pred: {}, combo: {}
};
const ls = { get(k, d) { try { const v = localStorage.getItem("l90:" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
             set(k, v) { try { localStorage.setItem("l90:" + k, JSON.stringify(v)); } catch {} } };
S.mode = ls.get("mode", "quant"); S.league = ls.get("league", "all"); S.favs = ls.get("favs", []); S.onboarded = ls.get("onboarded", false);
S.api = ls.get("api", { key: "", region: "eu" }); S.hist = ls.get("hist", {}); S.kick = ls.get("kick", {}); S.oddsMeta = ls.get("oddsMeta", {});
const SPORTS = { "fr.1": "soccer_france_ligue_one", "en.1": "soccer_epl", "es.1": "soccer_spain_la_liga", "de.1": "soccer_germany_bundesliga", "it.1": "soccer_italy_serie_a", "pt.1": "soccer_portugal_primeira_liga", "nl.1": "soccer_netherlands_eredivisie", "en.2": "soccer_efl_champ" };
const SPORT2LG = Object.fromEntries(Object.entries(SPORTS).map(([k, v]) => [v, k]));
const apiUrl = lg => `https://api.the-odds-api.com/v4/sports/${SPORTS[lg]}/odds/?regions=${S.api.region}&markets=h2h,totals&oddsFormat=decimal&apiKey=${encodeURIComponent(S.api.key.trim())}`;
const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "à l'instant" : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };

// ---------- Bookmakers ----------
const isANJ = b => !/pinnacle|betfair|matchbook|1xbet|marathon|sbo|smarkets/i.test(b) && /\(FR\)|betclic|winamax|unibet|pmu|parions|netbet|zebet|vbet|bwin|genybet|olybet|feelingbet|barri|pokerstars|betsson/i.test(b);
// Bookmakers où l'utilisateur peut jouer ; « Moyenne du marché » est une référence, jamais un bookmaker
const NOT_BOOK = b => /moyenne du march/i.test(b);
const bookOK = b => !NOT_BOOK(b) && (S.cfg.onlyMine && S.cfg.myBooks?.length ? S.cfg.myBooks.includes(b) : (S.cfg.offshore || isANJ(b)));
function myBooksPanel() {
  const seen = [...new Set(Object.values(S.odds).flatMap(o => Object.keys(o)))].filter(b => !NOT_BOOK(b) && !isSharp(b)).sort((x, y) => (S.cfg.myBooks.includes(y) - S.cfg.myBooks.includes(x)) || x.localeCompare(y));
  const all = [...new Set([...S.cfg.myBooks, ...seen])];
  return `<div class="mybooks"><div class="row" style="justify-content:space-between;align-items:center"><strong>Mes bookmakers</strong>
      <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-cfgbool="onlyMine" ${S.cfg.onlyMine ? "checked" : ""}> Cotes de mes bookmakers seulement</label></div>
    <div class="chips wrap" style="margin-top:8px">${all.map(b => `<button class="chip" data-mybook="${esc(b)}" aria-pressed="${S.cfg.myBooks.includes(b)}">${esc(b)}${seen.includes(b) ? "" : ' <span class="faint">(pas de cotes)</span>'}${isANJ(b) ? "" : ' <span class="faint">· hors ANJ</span>'}</button>`).join("")}</div>
    <p class="note" style="margin-top:6px">Bet365 vient de football-data.co.uk (mis à jour deux fois par semaine) ; Winamax, Betclic et Unibet de The Odds API (chaque matin). Pinnacle sert de référence de prix juste.</p></div>`;
}
document.addEventListener("click", e => { const b = e.target.closest("[data-mybook]"); if (!b) return; const n = b.dataset.mybook, L = S.cfg.myBooks;
  S.cfg.myBooks = L.includes(n) ? L.filter(x => x !== n) : [...L, n]; saveCfg(); render(); });
const isSharp = b => /pinnacle/i.test(b);

// ---------- Cotes de démonstration (simulées, déterministes) ----------
function rng(seed) { let h = 1779033703 ^ seed.length; for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
  return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; }; }
function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); }
function demoOdds() {
  const out = {};
  for (const f of FX) {
    const r = rng(f.key);
    let t = [f.m.H, f.m.D, f.m.A].map(p => Math.log(p) + gauss(r) * 0.10); const z = t.reduce((a, x) => a + Math.exp(x), 0); t = t.map(x => Math.exp(x) / z);
    let o25 = 1 / (1 + Math.exp(-(Math.log(f.m.O[2.5] / (1 - f.m.O[2.5])) + gauss(r) * 0.12))); const tou = [o25, 1 - o25];
    const price = (ps, margin, noise) => ps.map(p => Math.max(1.01, Math.round(100 / (p * (1 + margin) * Math.exp(gauss(r) * noise))) / 100));
    const books = { "Pinnacle": price(t, 0.025, 0.004).concat(price(tou, 0.03, 0.004)) };
    for (const b of ["Betclic", "Winamax", "Unibet", "PMU", "Parions Sport", "NetBet"]) {
      if (r() < 0.12) continue;
      books[b] = price(t, 0.05 + r() * 0.05, 0.035).concat(price(tou, 0.06 + r() * 0.04, 0.03));
    }
    out[f.key] = Object.fromEntries(Object.entries(books).map(([b, o]) => [b, { H: o[0], D: o[1], A: o[2], O25: o[3], U25: o[4] }]));
  }
  return out;
}

// ---------- Moteur de valeur ----------
const MK = { "1X2": ["H", "D", "A"], "OU25": ["O25", "U25"] };
const SEL = { H: "1", D: "N", A: "2", O25: "+2,5 buts", U25: "−2,5 buts" };
function bookProbs(odds, market) {
  const keys = MK[market], o = keys.map(k => odds?.[k]);
  if (o.some(x => !(x > 1))) return null;
  return L90.devig(o, S.cfg.devig);
}
function refProbs(f, market) {
  const books = S.odds[f.key] || {};
  const model = market === "1X2" ? [f.m.H, f.m.D, f.m.A] : [f.m.O[2.5], 1 - f.m.O[2.5]];
  const sharpName = Object.keys(books).find(isSharp);
  const sharp = sharpName ? bookProbs(books[sharpName], market) : null;
  const others = Object.entries(books).filter(([b]) => !isSharp(b)).map(([, o]) => bookProbs(o, market)).filter(Boolean);
  const cons = others.length ? others[0].map((_, i) => others.reduce((s, p) => s + p[i], 0) / others.length) : null;
  const blend = (a, b) => { const x = a.map((v, i) => (v + b[i]) / 2), s = x.reduce((p, q) => p + q, 0); return x.map(v => v / s); };
  const r = S.cfg.ref;
  if (r === "model") return { p: model, src: "Modèle" };
  if (r === "sharp") return sharp ? { p: sharp, src: "Pinnacle sans marge" } : { p: model, src: "Modèle (Pinnacle absent)" };
  if (r === "consensus") return cons ? { p: cons, src: "Consensus du marché" } : { p: model, src: "Modèle (aucune cote)" };
  if (r === "blend") return { p: blend(model, sharp || cons || model), src: "Mélange modèle et marché" };
  // auto : le marché sharp d'abord ; le modèle n'a pas d'avantage mesuré sur +/−2,5
  if (sharp) return { p: sharp, src: "Pinnacle sans marge" };
  if (market === "1X2") return cons ? { p: blend(model, cons), src: "Mélange modèle et consensus" } : { p: model, src: "Modèle" };
  return cons ? { p: cons, src: "Consensus du marché" } : { p: model, src: "Modèle (sans avantage mesuré)" };
}
// match commencé : les cotes du flux sont des cotes en direct, sans rapport avec l'avant-match
const started = f => { const k = Date.parse(S.kick?.[f.key] || ""); return isFinite(k) && k <= Date.now(); };
function analyse(f) {
  const books = S.odds[f.key]; if (!books || started(f)) return null;
  const res = { value: [], arbs: [], best: {} };
  for (const market of Object.keys(MK)) {
    const ref = refProbs(f, market), keys = MK[market];
    const best = keys.map(k => {
      let o = 0, book = null;
      for (const [b, v] of Object.entries(books)) { if (!bookOK(b)) continue; if (v[k] > o) { o = v[k]; book = b; } }
      return { k, o, book };
    });
    keys.forEach((k, i) => { res.best[k] = { ...best[i], p: ref.p[i], src: ref.src }; });
    for (const [b, v] of Object.entries(books)) {
      if (!bookOK(b)) continue;
      keys.forEach((k, i) => {
        const o = v[k]; if (!(o > 1)) return;
        const e = L90.ev(ref.p[i], o);
        if (e >= S.cfg.minEV) res.value.push({ f, market, k, book: b, o, p: ref.p[i], src: ref.src, ev: e, stake: S.cfg.bank * L90.kelly(ref.p[i], o, S.cfg.kfrac, S.cfg.cap) });
      });
    }
    if (best.every(x => x.o > 1)) {
      const a = L90.arbitrage(best, S.cfg.arbTotal, +S.cfg.arbRound || 0.5);
      res.arbs.push({ f, market, legs: best, ...a });
    }
  }
  return res;
}
function boardScan() {
  const value = [], arbs = [];
  for (const f of FX) { const r = analyse(f); if (!r) continue; value.push(...r.value); arbs.push(...r.arbs.filter(a => a.isArb)); }
  value.sort((a, b) => b.ev - a.ev); arbs.sort((a, b) => a.S - b.S);
  return { value, arbs };
}

// ---------- Stockage (journal privé) ----------
let DB = null, UID = null;
async function initStore() {
  try {
    const cl = HOST(); if (!cl?.use) return;
    const [db, user] = await Promise.all([cl.use("db"), cl.use("user")]);
    if (!db || !user) return;
    USER = user; UID = await user.id(); if (!UID) return;
    DB = db; S.store = "db";
    db.collection("data/users/" + UID).onSnapshot(snap => {
      const bets = [], picks = {};
      for (const d of snap.docs) { const v = d.data(); if (!v) continue;
        if (v.kind === "bet") bets.push({ ...v, id: d.id });
        else if (v.kind === "pick") picks[v.matchKey] = v;
        else if (v.kind === "settings" && v.cfg) Object.assign(S.cfg, v.cfg);
        else if (v.kind === "leagues") { S.fan.leagues = v.codes || []; if (!S.fan.active) S.fan.active = S.fan.leagues[0] || null; S.fan.leagues.forEach(watchLeague); } }
      S.bets = bets; S.picks = picks; render();
    }, () => { S.store = "memory"; render(); });
    fanSubscribe(); survSubscribe();
  } catch { S.store = "memory"; }
}
async function saveDoc(id, data) {
  if (DB && UID) { try { await DB.collection("data/users/" + UID).doc(id).set(data); return true; } catch (e) { toast("Enregistrement refusé : " + (e.code || "erreur")); } }
  return false;
}
async function deleteDoc(id) { if (DB && UID) { try { await DB.collection("data/users/" + UID).doc(id).delete(); } catch {} } }
let cfgTimer; function saveCfg() { ls.set("cfg", S.cfg); clearTimeout(cfgTimer); cfgTimer = setTimeout(() => saveDoc("settings", { kind: "settings", cfg: S.cfg }), 600); }
Object.assign(S.cfg, ls.get("cfg", {}));

async function addBet(b) {
  const id = "bet_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const bet = { kind: "bet", ts: Date.now(), result: "pending", close: null, ...b };
  if (!(await saveDoc(id, bet))) { S.bets.push({ ...bet, id }); }
  toast("Pari ajouté au journal"); render();
}
async function updateBet(id, patch) {
  const b = S.bets.find(x => x.id === id); if (!b) return;
  Object.assign(b, patch);
  const { id: _, ...rest } = b; await saveDoc(id, rest); render();
}
async function removeBet(id) { S.bets = S.bets.filter(x => x.id !== id); await deleteDoc(id); render(); }

// ---------- Utilitaires d'interface ----------
let toastT; function toast(msg) { let t = $(".toast"); if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.append(t); } t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2200); }
const tip = $("#tip");
function showTip(e, html) { tip.innerHTML = html; tip.hidden = false; const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8), y = Math.min(e.clientY + 14, innerHeight - tip.offsetHeight - 8); tip.style.left = x + "px"; tip.style.top = y + "px"; }
const hideTip = () => tip.hidden = true;
const split = (h, d, a) => `<div class="split" role="img" aria-label="1 ${pct(h)}, N ${pct(d)}, 2 ${pct(a)}"><i class="h" style="width:${h * 100}%"></i><i class="d" style="width:${d * 100}%"></i><i class="a" style="width:${a * 100}%"></i></div>`;
function breaker() {
  const st = L90.bankrollStats(S.bets, S.cfg.bank);
  const today = new Date().toDateString();
  const dayPnl = S.bets.filter(b => b.settledAt && new Date(b.settledAt).toDateString() === today)
    .reduce((s, b) => s + (b.result === "won" ? b.stake * (b.odds - 1) : b.result === "lost" ? -b.stake : 0), 0);
  const reasons = [];
  if (st.dd >= S.cfg.ddMax) reasons.push(`drawdown de ${pct(st.dd, 1)} (limite ${pct(S.cfg.ddMax)})`);
  if (-dayPnl >= S.cfg.dayLoss * S.cfg.bank) reasons.push(`perte du jour de ${eur(-dayPnl)} (limite ${eur(S.cfg.dayLoss * S.cfg.bank)})`);
  return { on: reasons.length > 0, reasons, st };
}

// ---------- Rendu : notice ----------
function renderNotice() {
  const n = $("#notice"), b = $("#noticeBody");
  const count = Object.keys(S.odds).length;
  if (S.oddsSource === "demo") {
    n.className = "notice quantonly";
    b.innerHTML = `<span class="dot"></span><span><strong>Cotes de démonstration simulées</strong> pour ${count} matchs. Elles servent à montrer les calculs ; ce ne sont pas de vraies cotes.</span>
      <button class="btn small" data-act="goimport">Brancher les vraies cotes</button><button class="btn small" data-act="clearodds">Effacer les cotes</button>`;
  } else if (count && S.oddsSource === "import") {
    const ts = Object.values(S.oddsMeta), oldest = ts.length ? Math.min(...ts) : null, stale = oldest && Date.now() - oldest > 3600e3;
    n.className = "notice real quantonly";
    b.innerHTML = `<span class="dot" style="${stale ? "background:var(--warn)" : ""}"></span><span><strong>Cotes réelles</strong> pour ${count} matchs, import le plus ancien ${oldest ? ago(oldest) : "–"}.${stale ? " Les cotes ont pu bouger : ré-importe avant de parier." : ""}</span><button class="btn small" data-act="goimport">Rafraîchir</button><button class="btn small" data-act="clearodds">Effacer les cotes</button>`;
  } else if (count) {
    n.className = "notice quantonly";
    b.innerHTML = `<span class="dot"></span><span><strong>Cotes saisies à la main</strong> pour ${count} matchs.</span><button class="btn small" data-act="goimport">Brancher les vraies cotes</button><button class="btn small" data-act="clearodds">Effacer les cotes</button>`;
  } else {
    n.className = "notice quantonly";
    b.innerHTML = `<span class="dot"></span><span>Aucune cote chargée : les probabilités du modèle restent disponibles.</span><button class="btn small" data-act="goimport">Brancher les vraies cotes</button><button class="btn small" data-act="demo">Charger la démonstration</button>`;
  }
}

// ---------- Rendu : Radar ----------
function renderRadar() {
  const ymd = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  const now = new Date(), td = ymd(now), tm = ymd(new Date(now.getTime() + 864e5)), wk = ymd(new Date(now.getTime() + 7 * 864e5));
  const q = L90.norm(S.q || "").join(" ");
  const list = FX.filter(f => (S.league === "all" || f.league === S.league || (S.league === "fav" && (S.favs.includes(f.home) || S.favs.includes(f.away))))
    && (S.day === "all" || (S.day === "today" && f.date === td) || (S.day === "tomorrow" && f.date === tm) || (S.day === "week" && f.date <= wk))
    && (!q || L90.norm(f.home + " " + f.away + " " + LG[f.league]).join(" ").includes(q)));
  const scan = boardScan();
  const vByKey = {}; for (const v of scan.value) (vByKey[v.f.key] ??= []).push(v);
  const aByKey = {}; for (const a of scan.arbs) (aByKey[a.f.key] ??= []).push(a);
  const days = {}; for (const f of list) (days[f.date] ??= []).push(f);
  const chips = [["all", "Toutes"], ...(S.favs.length ? [["fav", `Mes équipes (${S.favs.length})`]] : []), ...Object.entries(LG)].map(([k, v]) => `<button class="chip" data-league="${k}" aria-pressed="${S.league === k}">${v}</button>`).join("");
  $("#v-radar").innerHTML = `
    <div class="stack">
      ${S.onboarded ? "" : `<div class="panel onboard"><header><h2>Bienvenue sur Lambda 90</h2><button class="btn small" data-act="onboarded">Compris</button></header>
        <ol class="steps"><li><strong>Lis les probabilités.</strong> Chaque match a ses chances 1N2, ses cotes justes et son analyse complète. Ouvre un match pour la story 3D.</li>
        <li><strong>Branche les vraies cotes</strong> dans Value et arbitrage : le marché devient la référence et la plateforme repère les cotes au-dessus du prix juste.</li>
        <li><strong>Défie tes amis</strong> dans Défis, et suis tes équipes avec l'étoile ★ sur la page d'un match.</li></ol></div>`}
      <div>
        <h1>Radar des ${FX.length} prochains matchs</h1>
        <p class="lede">Probabilités du moteur Lambda 90 (Dixon-Coles, tirs cadrés et pi-ratings) pour les 8 championnats suivis, du ${dayName(FX[0].date)} au ${dayName(FX[FX.length - 1].date)}. Heures locales de chaque championnat. Derniers résultats intégrés : ${new Date(lastResult + "T12:00").toLocaleDateString("fr-FR")}.</p>
      </div>
      <div class="row quantonly">
        <span class="pill ${scan.value.length ? "good" : "ghost"}">${scan.value.length} paris à valeur</span>
        <span class="pill ${scan.arbs.length ? "info" : "ghost"}">${scan.arbs.length} arbitrages</span>
        <span class="pill ghost">EV minimale ${pct(S.cfg.minEV)}</span>
        <span class="pill ghost">Référence : ${({ auto: "automatique", model: "modèle", sharp: "Pinnacle", consensus: "consensus", blend: "mélange" })[S.cfg.ref]}</span>
      </div>
      <div class="chips" role="group" aria-label="Championnat">${chips}</div>
      <div class="row"><div class="chips" role="group" aria-label="Période">${[["today", "Aujourd'hui"], ["tomorrow", "Demain"], ["week", "7 jours"], ["all", "Tout"]].map(([k, v]) => `<button class="chip" data-day="${k}" aria-pressed="${S.day === k}">${v}</button>`).join("")}</div>
        <input type="text" id="search" placeholder="Rechercher une équipe" value="${esc(S.q)}" aria-label="Rechercher une équipe" style="flex:1;min-width:180px;max-width:320px"></div>
      <div class="legend"><span><i class="key h"></i>Victoire domicile</span><span><i class="key d"></i>Nul</span><span><i class="key a"></i>Victoire extérieur</span></div>
    </div>
    ${Object.entries(days).map(([d, fs]) => `
      <div class="day"><h3>${dayName(d)}</h3>
        ${fs.map(f => {
          const v = (vByKey[f.key] || []).sort((a, b) => b.ev - a.ev)[0], a = (aByKey[f.key] || [])[0];
          const fav = f.m.H > f.m.A ? short(f.home) : short(f.away), pf = Math.max(f.m.H, f.m.A);
          return `<button class="fx" data-open="${esc(f.key)}">
            <span class="time">${esc(f.time || "–")}</span>
            <span class="teams"><div><strong>${esc(short(f.home))}</strong></div><div><strong>${esc(short(f.away))}</strong></div><div class="lg">${LG[f.league]}</div></span>
            <span class="probs">${split(f.m.H, f.m.D, f.m.A)}<span class="pp"><span>${pct(f.m.H)}</span><span>${pct(f.m.D)}</span><span>${pct(f.m.A)}</span></span></span>
            <span class="side">
              <span class="quantonly faint num">cotes justes ${odd(1 / f.m.H)} / ${odd(1 / f.m.D)} / ${odd(1 / f.m.A)}</span>
              <span class="fanonly muted">${pf > 0.55 ? "Favori net" : pf > 0.42 ? "Léger favori" : "Match ouvert"} : ${esc(pf > 0.42 ? fav : "aucun")}</span>
              ${v ? `<span class="pill good quantonly">Valeur ${sgn(v.ev)} ${SEL[v.k]} chez ${esc(v.book)}</span>` : ""}
              ${a ? `<span class="pill info quantonly">Arbitrage ${sgn(a.margin, 2)}</span>` : ""}
            </span></button>`;
        }).join("")}
      </div>`).join("") || `<div class="empty">Aucun match à venir pour ce championnat dans les 11 prochains jours.</div>`}`;
}

// ---------- Rendu : Match ----------
function liveOf(f) { return S.live[f.key] ??= { t: 0, events: [], playing: false, lo: { H: "", D: "", A: "" } }; }
function heatmap(f) {
  const n = 6, M = f.m.M, N = 11; let mx = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) mx = Math.max(mx, M[i * N + j]);
  let h = `<div class="heat" style="grid-template-columns:28px repeat(${n},1fr)"><div class="ax"></div>`;
  for (let j = 0; j < n; j++) h += `<div class="ax">${j}</div>`;
  for (let i = 0; i < n; i++) { h += `<div class="ax">${i}</div>`;
    for (let j = 0; j < n; j++) { const p = M[i * N + j], a = 0.08 + 0.85 * p / mx;
      h += `<div style="background:rgba(35,153,179,${a.toFixed(3)});${a > 0.55 ? "color:var(--signal-ink);font-weight:600" : ""}" data-tip="${esc(short(f.home))} ${i} – ${j} ${esc(short(f.away))}<br><strong>${pct(p, 1)}</strong>, cote juste ${odd(1 / p)}">${nf(p * 100, p < 0.1 ? 1 : 0)}</div>`; } }
  return h + `</div><p class="note" style="margin-top:6px">Lignes : buts de ${esc(short(f.home))}. Colonnes : buts de ${esc(short(f.away))}. Valeurs en %.</p>`;
}
function oddsEditor(f) {
  const books = S.odds[f.key] || {};
  const names = Object.keys(books);
  const cols = ["H", "D", "A", "O25", "U25"];
  return `<div class="scroll"><table class="oddsgrid"><thead><tr><th>Bookmaker</th><th>Statut</th><th class="r">1</th><th class="r">N</th><th class="r">2</th><th class="r">+2,5</th><th class="r">−2,5</th><th class="r">Marge 1X2</th><th></th></tr></thead><tbody>
    ${names.map(b => { const o = books[b], ov = ["H", "D", "A"].every(k => o[k] > 1) ? L90.overround([o.H, o.D, o.A]) : null;
      return `<tr><td>${esc(b)}</td><td>${isSharp(b) ? `<span class="pill info">référence</span>` : isANJ(b) ? `<span class="pill ghost">agréé ANJ</span>` : `<span class="pill warn">non agréé</span>`}</td>
      ${cols.map(k => { const f0 = S.hist[f.key]?.[b]?.[0]?.[k], mv = f0 && o[k] && f0 !== o[k] ? (o[k] > f0 ? `<span class="mv" style="color:var(--good)" title="Ouverture ${odd(f0)}">▲</span>` : `<span class="mv" style="color:var(--bad)" title="Ouverture ${odd(f0)}">▼</span>`) : "";
        return `<td class="r" style="white-space:nowrap">${mv}<input type="number" step="0.01" min="1.01" inputmode="decimal" aria-label="${esc(b)} ${SEL[k]}" id="o-${esc(b).replace(/\W/g, "")}-${k}" data-odd="${esc(b)}|${k}" value="${o[k] ?? ""}"></td>`; }).join("")}
      <td class="r num">${ov == null ? "–" : pct(ov, 1)}</td><td><button class="btn small" data-delbook="${esc(b)}" aria-label="Retirer ${esc(b)}">Retirer</button></td></tr>`; }).join("")}
    <tr><td colspan="9"><div class="row"><input type="text" id="newbook" placeholder="Nom du bookmaker" aria-label="Nom du bookmaker"><button class="btn small" data-act="addbook">Ajouter une ligne</button></div></td></tr>
  </tbody></table></div>`;
}
function valueBlock(f, an) {
  if (!an) return `<div class="empty">Aucune cote pour ce match. Saisis les cotes de tes bookmakers ci-dessus, ou importe-les depuis l'onglet Value et arbitrage.</div>`;
  const br = breaker();
  const v = an.value.sort((a, b) => b.ev - a.ev);
  const arbs = an.arbs;
  return `
    ${v.length ? `<div class="scroll"><table><thead><tr><th>Issue</th><th>Bookmaker</th><th class="r">Cote</th><th class="r">Prob. réf.</th><th class="r">EV</th><th class="r">Mise Kelly</th><th></th></tr></thead><tbody>
      ${v.map(x => `<tr><td>${SEL[x.k]}</td><td>${esc(x.book)}</td><td class="r num">${odd(x.o)}</td><td class="r num">${pct(x.p, 1)}</td><td class="r"><span class="pill good">${sgn(x.ev)}</span></td><td class="r num">${eur(x.stake)}</td>
      <td><button class="btn small" ${br.on ? "disabled" : ""} data-bet='${esc(JSON.stringify({ matchKey: f.key, label: short(f.home) + " – " + short(f.away), market: x.market, sel: x.k, book: x.book, odds: x.o, stake: Math.round(x.stake * 100) / 100, p: x.p }))}'>Ajouter au journal</button></td></tr>`).join("")}
    </tbody></table></div>` : `<p class="muted">Aucune cote ne dépasse le seuil d'EV de ${pct(S.cfg.minEV)} avec la référence actuelle.</p>`}
    <div class="row" style="margin-top:12px">${arbs.map(a => `<span class="pill wrapok ${a.isArb ? "info" : "ghost"}">${a.market === "1X2" ? "1X2" : "+/−2,5"} : somme des inverses ${nf(a.S, 3)} ${a.isArb ? `, arbitrage ${sgn(a.margin, 2)}` : `, pas d'arbitrage (${sgn(a.margin, 1)})`}</span>`).join("")}</div>`;
}
function fanText(f) {
  const m = f.m, h = short(f.home), a = short(f.away), top = m.scores[0];
  const fav = m.H > m.A ? h : a, pf = Math.max(m.H, m.A);
  const lines = [
    pf > 0.55 ? `${fav} part nettement favori, avec ${pct(pf)} de chances de gagner.` : pf > 0.42 ? `${fav} est légèrement devant : ${pct(pf)} de chances de gagner, mais rien n'est joué.` : `Match très ouvert : aucune équipe ne dépasse ${pct(pf)} de chances de victoire.`,
    `Le modèle attend ${nf(f.lam, 1)} buts pour ${h} et ${nf(f.mu, 1)} pour ${a}.`,
    `Score le plus probable : ${top.s} (${pct(top.p)}). Les deux équipes marquent dans ${pct(m.BTTS)} des cas, et il y a ${pct(m.O[2.5])} de chances de voir au moins 3 buts.`
  ];
  return lines.map(l => `<p>${esc(l)}</p>`).join("");
}
function ribbon(f, L) {
  const el = $("#ribbon"); if (!el) return;
  const W = Math.max(300, el.clientWidth || 600), H = 190, pl = 36, pr = 10, pt = 10, pb = 26, w = W - pl - pr, h = H - pt - pb;
  const series = L90.timeline(C, ...LR(f), L.events, L.t, 1);
  const x = t => pl + t / L90.NM * w, y = v => pt + (1 - v) * h;
  const area = (lo, hi) => series.map(s => `${x(s.t).toFixed(1)},${y(hi(s)).toFixed(1)}`).join(" ") + " " + [...series].reverse().map(s => `${x(s.t).toFixed(1)},${y(lo(s)).toFixed(1)}`).join(" ");
  const ticks = [0, 15, 30, 45, 48, 63, 78, 93, 99];
  let g = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution des probabilités 1N2 pendant le match">`;
  for (const v of [0, .25, .5, .75, 1]) g += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${v * 100}</text>`;
  for (const t of ticks) g += `<text x="${x(t)}" y="${H - 8}" text-anchor="middle">${t === 99 ? "Fin" : L90.clockLabel(t).replace("'", "")}</text>`;
  g += `<rect x="${x(45)}" y="${pt}" width="${x(48) - x(45)}" height="${h}" fill="var(--panel2)"/><rect x="${x(93)}" y="${pt}" width="${x(99) - x(93)}" height="${h}" fill="var(--panel2)"/>`;
  if (series.length > 1) {
    g += `<polygon points="${area(s => 0, s => s.A)}" fill="var(--a)" opacity=".85"/>`;
    g += `<polygon points="${area(s => s.A, s => s.A + s.D)}" fill="var(--d)" opacity=".85"/>`;
    g += `<polygon points="${area(s => s.A + s.D, s => 1)}" fill="var(--h)" opacity=".85"/>`;
  }
  for (const e of L.events) g += e.type === "goal"
    ? `<circle cx="${x(e.t)}" cy="${e.side === 0 ? pt + 7 : pt + h - 7}" r="5" fill="var(--ink)" stroke="var(--panel)" stroke-width="2"/>`
    : `<rect x="${x(e.t) - 3}" y="${e.side === 0 ? pt + 2 : pt + h - 12}" width="6" height="10" rx="1" fill="var(--bad)" stroke="var(--panel)" stroke-width="2"/>`;
  g += `<line x1="${x(L.t)}" x2="${x(L.t)}" y1="${pt}" y2="${pt + h}" stroke="var(--ink)" stroke-width="2"/>`;
  g += `<rect id="ribhit" x="${pl}" y="${pt}" width="${w}" height="${h}" fill="transparent"/></svg>`;
  el.innerHTML = g;
  el.querySelector("#ribhit").addEventListener("mousemove", e => {
    const r = e.currentTarget.getBoundingClientRect(), t = Math.round((e.clientX - r.left) / r.width * L90.NM);
    const s = series.reduce((a, b) => Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a, series[0]);
    showTip(e, `<strong>${L90.clockLabel(s.t)}</strong><br><i class="key h"></i>1 ${pct(s.H, 1)}<br><i class="key d"></i>N ${pct(s.D, 1)}<br><i class="key a"></i>2 ${pct(s.A, 1)}`);
  });
  el.querySelector("#ribhit").addEventListener("mouseleave", hideTip);
}
function liveBlock(f) {
  const L = liveOf(f), s = L90.stateAt(L.events, L.t);
  const r = L90.project(C, ...LR(f), Math.min(L.t, L90.NM), s.hg, s.ag, s.man, 10);
  const lo = L.lo, liveEV = k => { const o = parseFloat(String(lo[k]).replace(",", ".")); return o > 1 ? L90.ev(r[k], o) : null; };
  return `
    <div class="row" style="justify-content:space-between">
      <div class="row"><span class="clock" aria-live="polite">${L90.clockLabel(L.t)}</span>
        <span class="score">${s.hg} – ${s.ag}</span>
        ${s.man ? `<span class="pill bad">${s.man > 0 ? esc(short(f.away)) : esc(short(f.home))} à 10</span>` : ""}</div>
      <div class="row"><button class="btn small" data-live="play">${L.playing ? "Pause" : "Lecture"}</button><button class="btn small" data-live="reset">Réinitialiser</button></div>
    </div>
    <input type="range" id="clock" min="0" max="${L90.NM}" value="${L.t}" data-live="clock" aria-label="Minute du match" style="margin-top:10px">
    <div class="row" style="margin-top:8px">
      <button class="btn small" data-live="goal" data-side="0">But ${esc(short(f.home))}</button>
      <button class="btn small" data-live="goal" data-side="1">But ${esc(short(f.away))}</button>
      <button class="btn small" data-live="red" data-side="0">Rouge ${esc(short(f.home))}</button>
      <button class="btn small" data-live="red" data-side="1">Rouge ${esc(short(f.away))}</button>
    </div>
    <div class="events" style="margin-top:8px">${L.events.map((e, i) => `<span class="ev">${L90.clockLabel(e.t)} ${e.type === "goal" ? "but" : "carton rouge"} ${esc(short(e.side === 0 ? f.home : f.away))}<button data-live="del" data-i="${i}" aria-label="Supprimer l'événement">×</button></span>`).join("") || `<span class="note">Aucun événement. Avance l'horloge et ajoute les buts ou cartons rouges au fil du match.</span>`}</div>
    <div class="readouts" style="margin-top:14px">
      <div class="ro"><span><i class="key h"></i>Victoire ${esc(short(f.home))}</span><b>${pct(r.H, 1)}</b></div>
      <div class="ro"><span><i class="key d"></i>Nul</span><b>${pct(r.D, 1)}</b></div>
      <div class="ro"><span><i class="key a"></i>Victoire ${esc(short(f.away))}</span><b>${pct(r.A, 1)}</b></div>
      <div class="ro"><span>But dans les 10 min</span><b>${pct(r.pGoalH, 0)}</b></div>
      <div class="ro"><span>Prochain but (dom. / ext. / aucun)</span><b style="font-size:17px">${pct(r.nextH)} / ${pct(r.nextA)} / ${pct(r.nextNone)}</b></div>
      <div class="ro"><span>Buts restants attendus</span><b>${nf(r.xH, 2)} – ${nf(r.xA, 2)}</b></div>
      <div class="ro"><span>Au moins 3 buts au total</span><b>${pct(r.O25, 0)}</b></div>
    </div>
    <div class="l3wrap" style="margin-top:14px"><div class="row" style="justify-content:space-between;align-items:center"><h3>${S.l3v === "scores" ? "Le score final en 3D" : "Le match en relief"}</h3>
      <div class="chips" role="tablist" aria-label="Vue 3D"><button class="chip" data-l3v="terrain" aria-pressed="${S.l3v !== "scores"}">Terrain</button><button class="chip" data-l3v="scores" aria-pressed="${S.l3v === "scores"}">Scores finaux</button></div></div>
      ${S.l3v === "scores" ? `<div class="row" style="justify-content:flex-end"><span class="note num" id="l3ro"></span></div><div id="live3d"></div><p class="note">Chaque colonne : probabilité d'un score final (lignes ${esc(short(f.home))}, colonnes ${esc(short(f.away))}). Les colonnes se transforment à chaque minute, but ou carton rouge ; l'anneau marque le score actuel, les piliers à droite donnent 1, N et 2. Glisse pour tourner.</p>` : pitchPanel(f)}</div>
    <div id="ribbon" style="margin-top:14px"></div>
    <div class="legend"><span><i class="key h"></i>1</span><span><i class="key d"></i>N</span><span><i class="key a"></i>2</span><span>● but</span><span><i class="key" style="background:var(--bad)"></i>carton rouge</span></div>
    <div class="quantonly" style="margin-top:14px">
      <h3>Cotes live d'un bookmaker</h3>
      <div class="row" style="margin-top:6px">
        ${["H", "D", "A"].map(k => { const e = liveEV(k); return `<label class="f">${SEL[k]}<input type="number" step="0.01" id="lo-${k}" data-lo="${k}" value="${esc(lo[k])}"></label><span class="pill ${e == null ? "ghost" : e >= S.cfg.minEV ? "good" : e > 0 ? "warn" : "ghost"}" style="align-self:flex-end;margin-bottom:6px">${e == null ? "cote juste " + odd(1 / r[k]) : "EV " + sgn(e)}</span>`; }).join("")}
      </div>
      <p class="note" style="margin-top:6px">Les bookmakers mettent à jour leurs cotes live plus vite que cette saisie manuelle et suspendent les paris après chaque événement. Une EV live affichée ici n'est exploitable que si la cote est encore disponible.</p>
    </div>`;
}
// ---------- Rendu : Value et arbitrage ----------
function renderValue() {
  const scan = boardScan(), br = breaker();
  const bookStats = {}; for (const [k, books] of Object.entries(S.odds)) for (const [b, o] of Object.entries(books)) { if (["H", "D", "A"].every(x => o[x] > 1)) { (bookStats[b] ??= []).push(L90.overround([o.H, o.D, o.A])); } }
  const ac = S.calc ??= { n: 3, o: ["", "", ""], T: 100 };
  const calcOdds = ac.o.slice(0, ac.n).map(x => parseFloat(String(x).replace(",", ".")));
  const calcOK = calcOdds.every(x => x > 1), calc = calcOK ? L90.arbitrage(calcOdds.map(o => ({ o })), +ac.T || 100, +S.cfg.arbRound || 0.5) : null;
  $("#v-value").innerHTML = `
  <div class="stack">
    <div><h1>Value betting et arbitrage</h1><p class="lede">Une mise a de la valeur quand la cote dépasse la cote juste de la probabilité de référence. Un arbitrage existe quand la somme des inverses des meilleures cotes est inférieure à 1 : toutes les issues sont couvertes avec un gain garanti, avant limites et annulations.</p></div>
    ${br.on ? `<div class="breaker"><strong>Disjoncteur actif.</strong> ${br.reasons.join(" ; ")}. L'ajout de paris au journal est bloqué jusqu'à demain ou jusqu'au changement des limites dans Bankroll.</div>` : ""}
    <div class="panel"><header><h2>Réglages</h2><span class="note">Appliqués à tout le tableau</span></header>
      <div class="row" style="align-items:flex-end">
        <label class="f">Retrait de la marge<select id="devig2" data-cfg="devig"><option value="shin">Shin</option><option value="power">Puissance</option><option value="mult">Proportionnel</option><option value="add">Additif</option></select></label>
        <label class="f">Référence<select id="ref2" data-cfg="ref"><option value="auto">Automatique</option><option value="sharp">Pinnacle sans marge</option><option value="consensus">Consensus du marché</option><option value="blend">Mélange modèle et marché</option><option value="model">Modèle seul</option></select></label>
        <label class="f">EV minimale (%)<input type="number" id="minEV" step="0.5" data-cfgpct="minEV" value="${S.cfg.minEV * 100}"></label>
        <label class="f">Fraction de Kelly<input type="number" id="kfrac" step="0.05" min="0" max="1" data-cfgnum="kfrac" value="${S.cfg.kfrac}"></label>
        <label class="f">Mise max (% bankroll)<input type="number" id="cap" step="0.5" data-cfgpct="cap" value="${S.cfg.cap * 100}"></label>
        <label class="f">Bankroll (€)<input type="number" id="bank" step="50" data-cfgnum="bank" value="${S.cfg.bank}"></label>
        ${S.cfg.onlyMine ? "" : `<label class="f" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="offshore" data-cfgbool="offshore" ${S.cfg.offshore ? "checked" : ""}>Inclure les bookmakers non agréés ANJ</label>`}
      </div>
      <div style="margin-top:14px">${myBooksPanel()}</div>
      ${(() => { const c = LAB.deep?.clv, cv = c?.["clv_seuil_1.05"];
        return ["model", "blend"].includes(S.cfg.ref) && cv?.clv_moy != null ? `<p class="notice-inline warn">Mesuré face à la clôture Pinnacle : la value annoncée par le modèle seul a une CLV de ${sgn(cv.clv_moy)} sur ${nf(cv.n)} paris (la cote évolue contre elle). La référence « Pinnacle sans marge » est la seule qui ait une chance : son verdict s'accumule dans le journal de value du Registre.</p>` : ""; })()}</div>
    <div class="panel"><header><h2>Paris à valeur</h2><span class="pill ${scan.value.length ? "good" : "ghost"}">${scan.value.length} opportunités</span></header>
      ${scan.value.length ? `<div class="scroll"><table><thead><tr><th>Match</th><th>Issue</th><th>Bookmaker</th><th class="r">Cote</th><th class="r">Cote juste</th><th class="r">EV</th><th class="r">Mise</th><th>Référence</th><th></th></tr></thead><tbody>
      ${scan.value.slice(0, 60).map(x => `<tr><td><button class="btn small" data-open="${esc(x.f.key)}">${esc(short(x.f.home))} – ${esc(short(x.f.away))}</button></td><td>${SEL[x.k]}</td><td>${esc(x.book)}</td><td class="r num">${odd(x.o)}</td><td class="r num">${odd(1 / x.p)}</td><td class="r"><span class="pill good">${sgn(x.ev)}</span></td><td class="r num">${eur(x.stake)}</td><td class="faint">${esc(x.src)}</td>
      <td><button class="btn small" ${br.on ? "disabled" : ""} data-bet='${esc(JSON.stringify({ matchKey: x.f.key, label: short(x.f.home) + " – " + short(x.f.away), market: x.market, sel: x.k, book: x.book, odds: x.o, stake: Math.round(x.stake * 100) / 100, p: x.p }))}'>Journal</button> ${slipBtn(x.f.key, x.k, x.o, x.book)}</td></tr>`).join("")}
      </tbody></table></div>` : `<div class="empty">Aucune opportunité au-dessus de ${pct(S.cfg.minEV)}. Charge des cotes ou baisse le seuil.</div>`}
      <p class="note" style="margin-top:8px">Mise = bankroll × fraction de Kelly, plafonnée. La fraction 0,25 réduit fortement la volatilité au prix d'une croissance plus lente ; le Kelly plein suppose une probabilité exacte, ce qu'aucun modèle ne fournit.</p></div>
    <div class="panel"><header><h2>Arbitrages détectés</h2><div class="row"><label class="f" style="flex-direction:row;align-items:center;gap:8px">Mise totale (€)<input type="number" id="arbT" data-cfgnum="arbTotal" value="${S.cfg.arbTotal}"></label>
      <label class="f" style="flex-direction:row;align-items:center;gap:8px">Arrondi des mises<select id="arbRound" data-cfg="arbRound">${[["0.1", "0,10 €"], ["0.5", "0,50 €"], ["1", "1 €"], ["5", "5 €"]].map(([v, l]) => `<option value="${v}" ${+S.cfg.arbRound === +v ? "selected" : ""}>${l}</option>`).join("")}</select></label></div></header>
      ${scan.arbs.length ? scan.arbs.map(a => `<div class="panel" style="background:var(--panel2);margin-bottom:8px"><div class="row" style="justify-content:space-between"><strong>${esc(short(a.f.home))} – ${esc(short(a.f.away))}, ${a.market === "1X2" ? "1X2" : "+/−2,5 buts"}</strong><span class="pill info">gain garanti ${sgn(a.worstPct, 2)} après arrondi</span></div>
        <div class="scroll"><table style="margin-top:6px"><thead><tr><th>Issue</th><th>Bookmaker</th><th class="r">Cote</th><th class="r">Mise</th><th class="r">Retour</th></tr></thead><tbody>${a.legs.map((l, i) => `<tr><td>${SEL[l.k]}</td><td>${esc(l.book)}</td><td class="r num">${odd(l.o)}</td><td class="r num">${eur(a.stakes[i])}</td><td class="r num">${eur(a.payouts[i])}</td></tr>`).join("")}</tbody></table></div></div>`).join("")
      : `<div class="empty">Aucun arbitrage sur les cotes chargées. Avec un taux de retour aux joueurs plafonné à 85 % par an pour les opérateurs agréés, les arbitrages entre bookmakers français sont rares et disparaissent vite.</div>`}
      <p class="note" style="margin-top:8px">Risques réels : cote modifiée entre deux placements, mise maximale réduite, pari annulé pour « erreur manifeste », limitation du compte. Place toujours la jambe la plus fragile en premier. Des mises arrondies à l'euro attirent moins l'attention qu'un montant au centime près.</p></div>
    <div class="grid2">
      <div class="panel"><header><h2>Calculateur d'arbitrage</h2><div class="chips"><button class="chip" data-calcn="2" aria-pressed="${ac.n === 2}">2 issues</button><button class="chip" data-calcn="3" aria-pressed="${ac.n === 3}">3 issues</button></div></header>
        <div class="row">${ac.o.slice(0, ac.n).map((v, i) => `<label class="f">Cote ${i + 1}<input type="number" step="0.01" id="calc-${i}" data-calc="${i}" value="${esc(v)}"></label>`).join("")}<label class="f">Mise totale (€)<input type="number" id="calc-T" data-calc="T" value="${esc(ac.T)}"></label></div>
        <div style="margin-top:12px">${calc ? `<p><span class="pill ${calc.isArb ? "good" : "bad"}">${calc.isArb ? "Arbitrage" : "Pas d'arbitrage"}</span> Somme des inverses <strong class="num">${nf(calc.S, 4)}</strong>, résultat garanti <strong class="num">${eur(calc.worst)}</strong> (${sgn(calc.worstPct, 2)}).</p>
          <div class="scroll"><table style="margin-top:6px"><tbody>${calc.stakes.map((s, i) => `<tr><td>Issue ${i + 1}</td><td class="r num">mise ${eur(s)}</td><td class="r num">retour ${eur(calc.payouts[i])}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Saisis une cote par issue.</p>`}</div></div>
      <div class="panel"><header><h2>Marge moyenne par bookmaker</h2><span class="note">1X2, sur les cotes chargées</span></header>
        ${Object.keys(bookStats).length ? `<div class="scroll"><table><thead><tr><th>Bookmaker</th><th>Statut</th><th class="r">Matchs</th><th class="r">Marge moyenne</th></tr></thead><tbody>${Object.entries(bookStats).sort((a, b) => avg(a[1]) - avg(b[1])).map(([b, v]) => `<tr><td>${esc(b)}</td><td>${isSharp(b) ? "référence" : isANJ(b) ? "agréé ANJ" : "non agréé"}</td><td class="r num">${v.length}</td><td class="r num">${pct(avg(v), 1)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Aucune cote chargée.</div>`}</div>
    </div>
    ${apiPanel()}
  </div>`;
  $("#devig2").value = S.cfg.devig; $("#ref2").value = S.cfg.ref;
}
const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
function apiPanel() {
  const k = S.api.key.trim(), cost = S.api.region.split(",").length * 2;
  return `<div class="panel" id="import"><header><h2>Brancher les vraies cotes</h2><span class="note">The Odds API, ${cost} crédits par championnat ouvert</span></header>
    <ol class="steps">
      <li><strong>Ta clé API.</strong> Elle reste dans ce navigateur : elle n'est jamais enregistrée dans la page publiée.
        <div class="row" style="margin-top:8px"><input type="password" id="apikey" data-api="key" value="${esc(S.api.key)}" placeholder="Colle ta clé ici" autocomplete="off" style="width:min(100%,340px)">
        <label class="f" style="flex-direction:row;align-items:center;gap:8px;flex-wrap:wrap;max-width:100%">Bookmakers<select id="apiregion" style="max-width:100%;min-width:0" data-api="region"><option value="eu" ${S.api.region === "eu" ? "selected" : ""}>Europe (Pinnacle, Betclic, Winamax, Unibet, PMU…) : 2 crédits</option><option value="eu,fr" ${S.api.region === "eu,fr" ? "selected" : ""}>Europe + France (NetBet…) : 4 crédits</option></select></label></div></li>
      <li><strong>Ouvre un championnat.</strong> Chaque bouton ouvre un nouvel onglet avec les cotes en texte brut.
        <div class="chips" style="margin-top:8px">${Object.entries(LG).map(([lg, n]) => k ? `<a class="chip" href="${esc(apiUrl(lg))}" target="_blank" rel="noopener noreferrer" aria-pressed="${!!S.oddsMeta[SPORTS[lg]]}">${n}${S.oddsMeta[SPORTS[lg]] ? ", " + ago(S.oddsMeta[SPORTS[lg]]) : ""}</a>` : `<span class="chip" aria-disabled="true" style="opacity:.5">${n}</span>`).join("")}</div>
        ${k ? "" : `<p class="note" style="margin-top:6px">Saisis d'abord ta clé.</p>`}</li>
      <li><strong>Copie tout, colle ici.</strong> Dans l'onglet ouvert, sélectionne tout (Ctrl+A, ou Cmd+A sur Mac), copie (Ctrl+C ou Cmd+C), reviens ici et colle dans le cadre (Ctrl+V ou Cmd+V). L'import se lance tout seul. Sur Firefox, clique d'abord sur « Données brutes ». Recommence pour chaque championnat : les imports s'additionnent.
        <textarea id="importbox" placeholder="Colle ici le texte copié, qui commence par [{" style="margin-top:8px"></textarea>
        <div class="row"><button class="btn small" data-act="import">Importer le texte collé</button><span id="importmsg" class="muted">${esc(S.importMsg || "")}</span></div></li>
    </ol>
    <p class="note">Offre gratuite : 500 crédits par mois, soit environ ${Math.floor(500 / (cost * 8))} rafraîchissements des 8 championnats. Les cotes bougent jusqu'au coup d'envoi : ré-importe peu avant le match pour mesurer ton CLV.</p></div>`;
}
function importOdds(txt) {
  let data; try { data = JSON.parse(txt.trim()); } catch { return "Texte illisible : copie toute la page de l'onglet ouvert, du premier [ au dernier ]."; }
  if (!Array.isArray(data)) { if (data && data.message) return "L'API a répondu : " + data.message; data = data?.data || [data]; }
  if (S.oddsSource !== "import") S.odds = {};
  const now = Date.now(), lastDay = FX[FX.length - 1].date, per = {}; let matched = 0, outside = 0; const unmatched = [];
  for (const ev of data) {
    if (!ev?.home_team || !Array.isArray(ev.bookmakers)) continue;
    const d = (ev.commence_time || "").slice(0, 10);
    if (d && d > lastDay) { outside++; continue; }
    let best = null, bs = 0;
    for (const f of FX) {
      if (SPORT2LG[ev.sport_key] && SPORT2LG[ev.sport_key] !== f.league) continue;
      if (d && Math.abs((new Date(f.date) - new Date(d)) / 864e5) > 1.5) continue;
      const sh = L90.nameScore(f.home, ev.home_team), sa = L90.nameScore(f.away, ev.away_team);
      if (Math.min(sh, sa) >= 0.5 && sh + sa > bs) { bs = sh + sa; best = f; }
    }
    if (!best) { unmatched.push(`${ev.home_team} – ${ev.away_team}`); continue; }
    const books = {};
    for (const bk of ev.bookmakers) {
      const o = {};
      for (const mk of bk.markets || []) {
        if (mk.key === "h2h") for (const oc of mk.outcomes) { if (oc.name === ev.home_team) o.H = oc.price; else if (oc.name === ev.away_team) o.A = oc.price; else o.D = oc.price; }
        if (mk.key === "totals") for (const oc of mk.outcomes) if (+oc.point === 2.5) { if (/over/i.test(oc.name)) o.O25 = oc.price; else o.U25 = oc.price; }
      }
      if (Object.keys(o).length) {
        books[bk.title] = o;
        if (ev.history) { const hs = ev.history.map(s => s.b[bk.title] ? { t: s.t, ...s.b[bk.title] } : null).filter(Boolean); if (hs.length > 1) (S.hist[best.key] ??= {})[bk.title] = hs.slice(-30); }
        const h = ((S.hist[best.key] ??= {})[bk.title] ??= []), last = h[h.length - 1];
        if (!last || ["H", "D", "A", "O25", "U25"].some(x => last[x] !== o[x])) { h.push({ t: now, ...o }); if (h.length > 30) h.shift(); }
      }
    }
    S.odds[best.key] = Object.assign(S.odds[best.key] || {}, books); S.kick[best.key] = ev.commence_time; matched++;
    per[ev.sport_key] = (per[ev.sport_key] || 0) + 1; S.oddsMeta[ev.sport_key] = now;
  }
  if (!matched && !data.length) return "Aucun match dans ce texte : le championnat n'a peut-être pas de rencontre programmée.";
  S.oddsSource = "import";
  ls.set("odds", { src: "import", odds: S.odds }); ls.set("hist", S.hist); ls.set("kick", S.kick); ls.set("oddsMeta", S.oddsMeta);
  const lines = Object.entries(per).map(([k, n]) => `${LG[SPORT2LG[k]] || k} : ${n} match${n > 1 ? "s" : ""}`);
  return `Importé. ${lines.join(", ") || "0 match rapproché"}.` + (outside ? ` ${outside} match${outside > 1 ? "s" : ""} au-delà du calendrier suivi ignoré${outside > 1 ? "s" : ""}.` : "") + (unmatched.length ? ` Non rapprochés : ${unmatched.slice(0, 4).join(", ")}${unmatched.length > 4 ? "…" : ""}` : "");
}
function closeFor(b) {
  const h = S.hist[b.matchKey]?.[b.book]; const kick = Date.parse(S.kick[b.matchKey] || ""); if (!h || !h.length || !kick) return null;
  if (Date.now() < kick) return null;
  const before = h.filter(x => x.t <= kick && x[b.sel] > 1); return before.length ? before[before.length - 1][b.sel] : null;
}

// ---------- Rendu : Bankroll ----------
function lineChart(el, pts, start) {
  const W = Math.max(300, el.clientWidth || 600), H = 200, pl = 56, pr = 12, pt = 12, pb = 24, w = W - pl - pr, h = H - pt - pb;
  const ys = pts.map(p => p.bank), lo = Math.min(start, ...ys), hi = Math.max(start, ...ys), pad = (hi - lo) * 0.1 || start * 0.05;
  const y0 = lo - pad, y1 = hi + pad, x = i => pl + (pts.length > 1 ? i / (pts.length - 1) : 0.5) * w, y = v => pt + (1 - (v - y0) / (y1 - y0)) * h;
  let g = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution de la bankroll">`;
  for (let k = 0; k <= 4; k++) { const v = y0 + (y1 - y0) * k / 4; g += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${nf(v)}</text>`; }
  g += `<line x1="${pl}" x2="${W - pr}" y1="${y(start)}" y2="${y(start)}" stroke="var(--ink3)" stroke-width="1"/>`;
  const path = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.bank).toFixed(1)}`).join(" ");
  g += `<polygon points="${pl},${pt + h} ${path} ${x(pts.length - 1)},${pt + h}" fill="var(--h)" opacity=".1"/><polyline points="${path}" fill="none" stroke="var(--h)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  const last = pts[pts.length - 1]; g += `<circle cx="${x(pts.length - 1)}" cy="${y(last.bank)}" r="4" fill="var(--h)" stroke="var(--panel)" stroke-width="2"/>`;
  g += `<text x="${pl}" y="${H - 6}">début</text><text x="${W - pr}" y="${H - 6}" text-anchor="end">${pts.length - 1} paris réglés</text></svg>`;
  el.innerHTML = g;
}
function renderBank() {
  const br = breaker(), st = br.st;
  const bets = [...S.bets].sort((a, b) => b.ts - a.ts);
  $("#v-bank").innerHTML = `
  <div class="stack">
    <div><h1>Bankroll et journal</h1><p class="lede">Le CLV (closing line value) compare ta cote à la cote de clôture du même bookmaker, juste avant le coup d'envoi. Si tu ré-importes les cotes peu avant le match, la clôture se remplit automatiquement. C'est le meilleur indicateur précoce d'un avantage réel : le résultat d'un pari est surtout du bruit, la clôture beaucoup moins.</p>
      <p class="note" style="margin-top:6px">${S.store === "db" ? "Journal privé, enregistré dans ton espace : toi seul le vois." : "Journal temporaire : il sera perdu à la fermeture de la page. Ouvre la page connecté à ton compte pour l'enregistrer."}</p></div>
    ${br.on ? `<div class="breaker"><strong>Disjoncteur actif.</strong> ${br.reasons.join(" ; ")}. Pause recommandée : les nouveaux paris sont bloqués.</div>` : ""}
    <div class="kpis">
      <div class="kpi"><span>Bankroll</span><b>${eur(st.bank)}</b><em class="${st.pnl >= 0 ? "" : "muted"}">${st.pnl >= 0 ? "+" : ""}${eur(st.pnl)}</em></div>
      <div class="kpi"><span>ROI sur mises réglées</span><b>${st.staked ? sgn(st.roi) : "–"}</b><em class="faint">${nf(st.staked, 0)} € misés</em></div>
      <div class="kpi"><span>CLV moyen</span><b>${st.clv == null ? "–" : sgn(st.clv)}</b><em class="faint">${st.clvN} paris avec cote de clôture</em></div>
      <div class="kpi"><span>Drawdown max</span><b>${pct(st.maxDD, 1)}</b><em class="faint">actuel ${pct(st.dd, 1)}</em></div>
      <div class="kpi"><span>Paris réglés</span><b>${st.settled}</b><em class="${st.settled < 30 ? "" : "faint"}" style="${st.settled < 30 ? "color:var(--warn)" : ""}">${st.settled < 30 ? "moins de 30 : trop peu pour conclure" : st.won + " gagnés"}</em></div>
    </div>
    <div class="panel"><header><h2>Courbe de bankroll</h2></header><div id="bankchart">${st.curve.length > 1 ? "" : `<div class="empty">La courbe apparaît après le premier pari réglé.</div>`}</div></div>
    <div class="panel"><header><h2>Journal</h2><div class="row"><span class="note">${bets.length} paris</span>${bets.some(b => b.result === "pending" && b.matchKey) ? `<button class="btn small" data-act="autosettle">Régler avec les résultats</button>` : ""}${bets.some(b => !b.close && closeFor(b)) ? `<button class="btn small" data-act="autoclose">Remplir les cotes de clôture</button>` : ""}</div></header>
      ${bets.length ? `<div class="scroll"><table><thead><tr><th>Date</th><th>Match</th><th>Issue</th><th>Bookmaker</th><th class="r">Cote</th><th class="r">Mise</th><th class="r">Clôture</th><th class="r">CLV</th><th>Résultat</th><th></th></tr></thead><tbody>
      ${bets.map(b => `<tr><td class="faint num">${new Date(b.ts).toLocaleDateString("fr-FR")}</td><td>${esc(b.label)}</td><td>${SEL[b.sel] || esc(b.sel)}</td><td>${esc(b.book)}</td><td class="r num">${odd(b.odds)}</td><td class="r num">${eur(b.stake)}</td>
        <td class="r"><input type="number" step="0.01" id="close-${b.id}" data-close="${b.id}" value="${b.close ?? ""}" aria-label="Cote de clôture"></td>
        <td class="r num">${b.close > 1 ? sgn(b.odds / b.close - 1) : "–"}</td>
        <td><select id="res-${b.id}" data-res="${b.id}" aria-label="Résultat">${[["pending", "En cours"], ["won", "Gagné"], ["lost", "Perdu"], ["void", "Remboursé"]].map(([v, l]) => `<option value="${v}" ${b.result === v ? "selected" : ""}>${l}</option>`).join("")}</select></td>
        <td><button class="btn small" data-delbet="${b.id}">Supprimer</button></td></tr>`).join("")}</tbody></table></div>`
      : `<div class="empty">Aucun pari. Ajoute-en un depuis une opportunité de valeur, ou saisis-le ci-dessous.</div>`}
      <details style="margin-top:12px"><summary>Saisir un pari manuellement</summary>
        <div class="row" style="margin-top:10px;align-items:flex-end">
          <label class="f">Match<input type="text" id="mb-label" placeholder="Équipe A – Équipe B"></label>
          <label class="f">Issue<input type="text" id="mb-sel" placeholder="1, N, 2, +2,5…"></label>
          <label class="f">Bookmaker<input type="text" id="mb-book"></label>
          <label class="f">Cote<input type="number" step="0.01" id="mb-odds"></label>
          <label class="f">Mise (€)<input type="number" step="1" id="mb-stake"></label>
          <button class="btn primary" data-act="manualbet" ${br.on ? "disabled" : ""}>Ajouter</button>
        </div></details></div>
    ${coachBlock()}
    <div class="panel"><header><h2>Disjoncteur</h2><span class="note">Règles de discipline fixées à froid</span></header>
      <div class="row" style="align-items:flex-end">
        <label class="f">Capital de départ (€)<input type="number" id="bank2" step="50" data-cfgnum="bank" value="${S.cfg.bank}"></label>
        <label class="f">Drawdown max (%)<input type="number" id="ddMax" step="1" data-cfgpct="ddMax" value="${S.cfg.ddMax * 100}"></label>
        <label class="f">Perte max par jour (% du capital)<input type="number" id="dayLoss" step="0.5" data-cfgpct="dayLoss" value="${S.cfg.dayLoss * 100}"></label>
      </div>
      <p class="note" style="margin-top:8px">Au-delà d'une limite, l'ajout de paris est bloqué. Changer une limite en pleine série de pertes est exactement ce que la règle cherche à empêcher.</p></div>
  </div>`;
  if (st.curve.length > 1) lineChart($("#bankchart"), st.curve, S.cfg.bank);
}

// ---------- Rendu : Registre ----------
function calChart(el, pts, title) {
  const W = Math.max(280, Math.min(520, el.clientWidth || 420)), H = W * 0.78, pl = 40, pr = 12, pt = 12, pb = 34, w = W - pl - pr, h = H - pt - pb;
  const x = v => pl + v * w, y = v => pt + (1 - v) * h;
  let g = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">`;
  for (const v of [0, .2, .4, .6, .8, 1]) g += `<line x1="${x(0)}" x2="${x(1)}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${v * 100}</text><text x="${x(v)}" y="${H - 18}" text-anchor="middle">${v * 100}</text>`;
  g += `<text x="${pl + w / 2}" y="${H - 3}" text-anchor="middle">probabilité annoncée (%)</text>`;
  g += `<line x1="${x(0)}" y1="${y(0)}" x2="${x(1)}" y2="${y(1)}" stroke="var(--ink3)" stroke-width="1"/>`;
  g += `<polyline points="${pts.map(p => `${x(p.p)},${y(p.y)}`).join(" ")}" fill="none" stroke="var(--h)" stroke-width="2"/>`;
  pts.forEach((p, i) => g += `<circle cx="${x(p.p)}" cy="${y(p.y)}" r="${Math.max(4, Math.min(9, Math.sqrt(p.n) / 4))}" fill="var(--h)" stroke="var(--panel)" stroke-width="2" data-tip="Annoncé ${pct(p.p, 1)}<br>Observé <strong>${pct(p.y, 1)}</strong><br>${nf(p.n)} prévisions"/>`);
  el.innerHTML = g + `</svg>`;
}
function forest(el) {
  const c = LIVE.coef, ci = c.ci;
  const rows = [["Supériorité numérique", "up"], ["Infériorité numérique", "down"], ["Mène de 1 but", "p1"], ["Mène de 2 buts ou plus", "p2"], ["Mené de 1 but", "m1"], ["Mené de 2 buts ou plus", "m2"]];
  const W = Math.max(300, el.clientWidth || 520), rh = 30, pl = Math.min(190, W * 0.42), pr = 16, H = rows.length * rh + 34, w = W - pl - pr;
  const lx = v => pl + (Math.log(v) - Math.log(0.25)) / (Math.log(3) - Math.log(0.25)) * w;
  let g = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Effets sur le rythme de buts">`;
  for (const v of [0.25, 0.5, 1, 2, 3]) g += `<line x1="${lx(v)}" x2="${lx(v)}" y1="4" y2="${H - 24}" stroke="${v === 1 ? "var(--ink3)" : "var(--line)"}"/><text x="${lx(v)}" y="${H - 8}" text-anchor="middle">×${nf(v, v < 1 ? 2 : 0)}</text>`;
  rows.forEach(([lab, k], i) => {
    const yy = 16 + i * rh, m = Math.exp(c[k] ?? c.state[k]), lo = Math.exp(ci[k][0]), hi = Math.exp(ci[k][1]), sig = lo > 1 || hi < 1;
    g += `<text x="0" y="${yy + 4}">${lab}</text><line x1="${lx(lo)}" x2="${lx(hi)}" y1="${yy}" y2="${yy}" stroke="${sig ? "var(--h)" : "var(--ink3)"}" stroke-width="2"/>`;
    g += `<circle cx="${lx(m)}" cy="${yy}" r="5" fill="${sig ? "var(--h)" : "var(--ink3)"}" stroke="var(--panel)" stroke-width="2" data-tip="${lab}<br>Multiplicateur <strong>×${nf(m, 2)}</strong><br>IC 95 % : ×${nf(lo, 2)} à ×${nf(hi, 2)}"/>`;
  });
  el.innerHTML = g + `</svg>`;
}
function renderProof() {
  const s = PRE.summary.all, V = LIVE.validation;
  const rel = (a, b) => (a - b) / b;
  const reg = PRE.registry.filter(r => S.league === "all" || r.league === S.league).slice(0, 80);
  $("#v-proof").innerHTML = `
  <div class="stack">
    <div class="row" style="justify-content:flex-end"><button class="btn small" data-studio='{"tpl":"proof"}'>Créer un contenu</button></div>
    <div><h1>Registre des preuves</h1><p class="lede">Backtest walk-forward : chaque semaine, le modèle est recalibré uniquement sur les matchs déjà joués, puis prédit la semaine suivante. Saisons 2025-26 et 2026-27, ${nf(s.n)} matchs, 8 championnats. La référence naïve prédit les fréquences de la saison précédente ; la référence exigeante, ce sont les cotes du marché, plus bas.</p></div>
    <div class="kpis">
      <div class="kpi"><span>RPS, plus bas = mieux</span><b>${nf(s.rps, 4)}</b><em class="muted">référence ${nf(s.rps_base, 4)}, ${sgn(rel(s.rps, s.rps_base))}</em></div>
      <div class="kpi"><span>Log-loss 1X2</span><b>${nf(s.logloss, 3)}</b><em class="muted">référence ${nf(s.logloss_base, 3)}, ${sgn(rel(s.logloss, s.logloss_base))}</em></div>
      <div class="kpi"><span>Brier 1X2</span><b>${nf(s.brier, 3)}</b><em class="muted">référence ${nf(s.brier_base, 3)}, ${sgn(rel(s.brier, s.brier_base))}</em></div>
      <div class="kpi"><span>Issue la plus probable juste</span><b>${pct(s.acc, 1)}</b><em class="muted">des matchs</em></div>
      <div class="kpi"><span>Brier +/−2,5 buts</span><b>${nf(s.brier_o25, 4)}</b><em class="muted">référence ${nf(s.brier_o25_base, 4)}, marché ${nf(V3.market.totaux.marche, 4)}</em></div>
    </div>
    <div class="grid2">
      <div class="panel"><header><h2>Calibration 1X2</h2><span class="note">Chaque point : prévisions regroupées par tranche</span></header><div id="cal1"></div>
        <p class="note">Sur la diagonale, une probabilité annoncée à 40 % se réalise 40 % du temps. Le nul reste légèrement sous-estimé (${pct(PRE.draw.obs, 1)} observé contre ${pct(PRE.draw.pred, 1)} prédit en moyenne), défaut connu de Dixon-Coles.</p></div>
      <div class="panel"><header><h2>Par championnat</h2></header><div class="scroll"><table><thead><tr><th>Ligue</th><th class="r">Matchs</th><th class="r">RPS</th><th class="r">Réf.</th><th class="r">Gain</th></tr></thead><tbody>
        ${Object.entries(PRE.summary).filter(([k]) => k !== "all").map(([k, v]) => `<tr><td>${LG[k]}</td><td class="r num">${v.n}</td><td class="r num">${nf(v.rps, 4)}</td><td class="r num">${nf(v.rps_base, 4)}</td><td class="r num">${sgn(rel(v.rps, v.rps_base))}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="note" style="margin-top:8px">Battre la référence naïve ne prouve pas qu'on bat le marché : voir le panneau suivant.</p></div>
    </div>
    ${marketPanel()}
    <div class="grid2">
      <div class="panel"><header><h2>Moteur live : ce qui change le rythme de buts</h2></header><div id="forest"></div>
        <p class="note">GLM de Poisson minute par minute, Premier League, Bundesliga et championnat autrichien 2025-26. En bleu : effet significatif à 95 %. Les cartons rouges pèsent lourd ; l'état du score n'a pas d'effet net mesurable sur cet échantillon.</p></div>
      <div class="panel"><header><h2>Moteur live : but dans les 10 minutes</h2></header><div class="scroll"><table><thead><tr><th>Version</th><th class="r">Brier</th><th class="r">AUC</th></tr></thead><tbody>
        ${[["Minute seule", V.reference_minute], ["Force des équipes", V.prematch_seul], ["Complet (score, rouges)", V.complet]].map(([l, v]) => `<tr><td>${l}</td><td class="r num">${nf(v.brier, 4)}</td><td class="r num">${nf(v.auc, 3)}</td></tr>`).join("")}</tbody></table></div>
        <p class="note" style="margin-top:8px">${nf(V.complet.n)} instantanés sur ${LIVE.n_test_matches} matchs hors échantillon (2026). Une AUC de 0,5 équivaut au hasard : sans tirs ni xG en direct, la minute suivante reste en grande partie imprévisible. Le moteur live sert surtout à recalculer 1N2 et les totaux après chaque événement.</p></div>
    </div>
    <div class="panel"><header><h2>Prévisions 2026-27, matchs joués</h2><span class="note">${PRE.registry.length} matchs, prévision walk-forward émise avant chaque semaine</span></header>
      <div class="chips" role="group" aria-label="Championnat" style="margin-bottom:10px">${[["all", "Toutes"], ...Object.entries(LG)].map(([k, v]) => `<button class="chip" data-league="${k}" aria-pressed="${S.league === k}">${v}</button>`).join("")}</div>
      <div class="scroll"><table><thead><tr><th>Date</th><th>Ligue</th><th>Match</th><th class="r">1</th><th class="r">N</th><th class="r">2</th><th class="r">Score</th><th class="r">Prob. du résultat</th></tr></thead><tbody>
      ${reg.map(r => { const p = r["p" + r.res]; return `<tr><td class="faint num">${new Date(r.date + "T12:00").toLocaleDateString("fr-FR")}</td><td class="faint">${LG[r.league]}</td><td>${esc(short(r.home))} – ${esc(short(r.away))}</td><td class="r num">${pct(r.pH)}</td><td class="r num">${pct(r.pD)}</td><td class="r num">${pct(r.pA)}</td><td class="r num"><strong>${r.score}</strong></td><td class="r"><span class="pill ${p >= 0.45 ? "good" : p >= 0.28 ? "ghost" : "warn"}">${pct(p)}</span></td></tr>`; }).join("")}
      </tbody></table></div></div>
    ${labPanel()}
    <div class="panel"><header><h2>Méthode, sources et limites</h2></header>
      <div class="stack muted" style="max-width:80ch">
        <p><strong>Avant-match.</strong> Dixon-Coles (1997) ajusté en commun sur la 1re et la 2e division (les promus arrivent avec leur niveau réel), pondération exponentielle du temps (demi-vie de ${nf(Math.log(2) / V3.tune.xi)} jours, réglée sur 2023-24), rétrécissement léger. Un second modèle de même forme sur les tirs cadrés, puis les pi-ratings, sont combinés par régression logistique apprise uniquement sur les saisons passées. Les totaux sont recalés sur le modèle de tirs. Données : ${nf(V3.params.n_train)} matchs depuis 2018 (football-data.co.uk via le jeu ouvert Club Football Match Data, licence MIT) et openfootball (CC0).</p>
        <p><strong>Live.</strong> Intensité de but par tranche de 15 minutes et temps additionnel, multipliée par l'effet de l'état du score et des cartons rouges, projetée minute par minute. Le temps additionnel est modélisé à 3 minutes en première période et 6 en seconde (hypothèse).</p>
        <p><strong>Valeur.</strong> La marge est retirée par la méthode de Shin par défaut. La référence automatique privilégie Pinnacle, bookmaker à faible marge non agréé en France, utilisé comme prix et pas pour parier. Sur +/−2,5 buts, la référence automatique n'utilise pas le modèle, qui n'a pas d'avantage mesuré.</p>
        <p><strong>Limites.</strong> Résultats intégrés jusqu'au ${new Date(lastResult + "T12:00").toLocaleDateString("fr-FR")} : les matchs plus récents manquent tant que la chaîne de mise à jour n'est pas branchée. Aucune information sur les blessures, compositions ou suspensions : c'est la principale raison pour laquelle le marché reste plus précis.</p>
      </div></div>
  </div>`;
  calChart($("#cal1"), PRE.cal, "Calibration 1X2");
  forest($("#forest"));
}

function marketPanel() {
  const m = V3.market, pl = m.par_ligue, bt = (k, t) => `<tr><td>${t}</td>${m[k].map(x => `<td class="r num">${x.paris ? `${sgn(x.roi)}<div class="faint">${nf(x.paris)} paris</div>` : "–"}</td>`).join("")}</tr>`;
  return `<div class="panel"><header><h2>Face au marché</h2><span class="pill warn">Le marché reste plus précis</span></header>
    <p class="muted" style="max-width:80ch;margin-bottom:12px">Comparaison sur ${nf(m.dc.n)} matchs 2025-26 et 2026-27 avec les cotes Bet365 d'avant-match, marge retirée par la méthode de Shin. Le marché intègre les compositions, les blessures et l'argent des parieurs informés, que le modèle ne voit pas. Lambda 90 utilise donc les cotes du marché comme référence de valeur dès qu'elles sont importées.</p>
    <div class="grid2">
      <div><div class="scroll"><table><thead><tr><th>Ligue</th><th class="r">Modèle</th><th class="r">Marché</th><th class="r">Mélange</th></tr></thead><tbody>
        ${Object.entries(pl).map(([k, v]) => { const best = Math.min(v.modele, v.marche, v.melange); const c = x => x === best ? "<strong>" + nf(x, 4) + "</strong>" : nf(x, 4); return `<tr><td>${LG[k] || k}</td><td class="r num">${c(v.modele)}</td><td class="r num">${c(v.marche)}</td><td class="r num">${c(v.melange)}</td></tr>`; }).join("")}
        <tr><td><strong>Total</strong></td><td class="r num">${nf(m.dc_tirs_pi.rps, 4)}</td><td class="r num"><strong>${nf(m.marche_seul.rps, 4)}</strong></td><td class="r num">${nf(m.marche_plus_modele.rps, 4)}</td></tr></tbody></table></div>
        <p class="note" style="margin-top:6px">RPS, plus bas = mieux. Le modèle fait jeu égal avec le marché au Portugal et aux Pays-Bas ; le mélange améliore la Ligue 1 et la Serie A sur cet échantillon.</p></div>
      <div><div class="scroll"><table><thead><tr><th>Stratégie, seuil d'EV</th><th class="r">0 %</th><th class="r">3 %</th><th class="r">5 %</th><th class="r">10 %</th></tr></thead><tbody>
        ${bt("value_modele_meilleure_cote", "Modèle contre meilleure cote")}${bt("value_modele_bet365", "Modèle contre Bet365")}${bt("value_melange_meilleure_cote", "Mélange contre meilleure cote")}${bt("value_marche_meilleure_cote", "Marché contre meilleure cote")}</tbody></table></div>
        <p class="note" style="margin-top:6px">ROI à mise fixe. Aucune stratégie n'a de gain statistiquement établi : les intervalles de confiance à 95 % incluent zéro ou sont négatifs. La meilleure cote parmi 17 bookmakers est rarement disponible en mise réelle.</p></div>
    </div></div>`;
}
function deepRows() {
  const d = LAB.deep || {}, e = d.lab2?.enjeux, x = d.lab2?.enjeux_effets_buts, b = d.lab2b, u = d.lab3, p = d.lab4, out = [];
  const ic = v => `IC 95 % ${nf(v[0], 2)} à ${nf(v[1], 2)}`;
  if (e) out.push(["Enjeux du classement (titre, maintien, sans enjeu)", "1N2", `RPS ${nf(e.modele_enjeux, 4)} contre ${nf(e.modele, 4)} sans ; avec le marché ${nf(e.marche_enjeux, 4)} contre ${nf(e.marche, 4)}`, "Rejeté : déjà dans les cotes"]);
  if (x?.sans_enjeu) out.push(["Équipe sans enjeu en fin de saison", "Buts", `×${nf(x.sans_enjeu.multiplicateur, 2)} (${ic(x.sans_enjeu.ic95)}, ${nf(x.sans_enjeu.n)} cas) ; le marché le price déjà`, "Adopté pour les buts"]);
  if (x?.lutte_maintien) out.push(["Lutte pour le maintien", "Buts", `×${nf(x.lutte_maintien.multiplicateur, 2)} (${ic(x.lutte_maintien.ic95)})`, "Sans effet mesurable"]);
  if (b) out.push(["Titulaires habituels absents du onze", "1N2", `gain RPS ${nf(b.marche_vs_marche_absences.gain * 1000, 2)} ‰ au-delà du marché, IC ${nf(b.marche_vs_marche_absences.ic95_gain[0] * 1000, 1)} à ${nf(b.marche_vs_marche_absences.ic95_gain[1] * 1000, 1)} ‰ (${nf(b.n_test)} matchs)`, "Non prouvé : trop peu de compos"]);
  if (b) out.push(["Part des buts de l'équipe absente", "Buts", `×${nf(b.buts.missg.effet, 2)} pour 100 % absents (${ic(b.buts.missg.ic95)})`, "Sens attendu, non significatif"]);
  if (u) out.push(["Fourchette à 80 % par match", "Incertitude", `la cote du marché tombe dedans ${nf(u.couverture_marche_80.H * 100)} % des fois (${nf(u.n)} matchs)`, "Adopté, prudent"]);
  const g5 = d.lab5;
  if (g5?.adopte) out.push(["Recalage du nombre total de buts (0 à 6+)", "Buts", `RPS ${sgn(-g5.adopte.gain_rps / g5.poisson, 2)} sur ${nf(g5.adopte.n)} matchs, IC du gain ${nf(g5.adopte.ic95[0] * 1000, 2)} à ${nf(g5.adopte.ic95[1] * 1000, 2)} ‰ ; 0-0 et 6+ moins fréquents que Poisson`, "Adopté"]);
  if (g5) out.push(["Binomiale négative (surdispersion)", "Buts", `RPS ${nf(g5.binneg, 4)} contre ${nf(g5.poisson, 4)} pour Poisson`, "Rejeté"]);
  const l6 = d.lab6;
  if (l6) { out.push(["Modèle sur les tirs totaux", "1N2", `RPS ${nf(l6.rps_avec_tirs, 4)} contre ${nf(l6.rps_actuel, 4)} avec les seuls tirs cadrés`, "Rejeté"]);
    out.push(["Mélange modèle + marché (Bet365)", "1N2", `meilleur poids du marché : ${pct(l6.melange.poids_marche_optimal)} ; RPS ${nf(l6.melange.rps_marche, 4)} contre ${nf(l6.melange.rps_modele, 4)} pour le modèle seul`, "Adopté : référence 90 % marché"]); }
  const l7 = d.lab7;
  if (l7) { const t = l7.par_tranche.find(x => x.tranche === "75-85 %"), c2 = l7.cote_2;
    if (t) out.push(["Paris annoncés à 75-85 %", "Calibration", `${nf(t.reussite * 100, 1)} % de réussite pour ${nf(t.proba_modele * 100, 1)} % annoncés sur ${nf(t.paris)} paris ; cote moyenne ${nf(t.cote_moy, 2)}, rendement ${sgn(t.rendement)}`, "Fiable, mais pas rentable"]);
    out.push(["Les 10 % « plus sûrs » à cote ≈ 2", "Value", `annoncés ${nf(c2.top10_modele.proba_modele * 100)} %, passés ${nf(c2.top10_modele.reussite * 100)} % ; rendement ${sgn(c2.top10_modele.rendement)}`, "Rejeté : excès de confiance"]);
    out.push(["Gradient boosting (au lieu de la régression logistique)", "1N2", `RPS ${nf(l7.modeles.boosting_modele, 4)} contre ${nf(l7.modeles.logistique_modele, 4)}`, "Rejeté"]); }
  const la = d.lab_api;
  if (la?.au_dela_ouverture) { const o = la.au_dela_ouverture, c = la.au_dela_cloture;
    out.push(["Force du onze aligné (API-Football)", "1N2", `gain RPS ${nf(o.gain * 1000, 2)} ‰ au-delà des cotes d'ouverture (IC ${nf(o.ic95[0] * 1000, 1)} à ${nf(o.ic95[1] * 1000, 1)} ‰, ${nf(o.n_test)} matchs)${c ? ` ; au-delà de la clôture : ${nf(c.gain * 1000, 2)} ‰` : ""}`, o.prouve ? (c?.prouve ? "Avantage prouvé, même face à la clôture" : "Prouvé avant l'annonce des compos") : "Non prouvé"]); }
  else out.push(["Force du onze aligné (API-Football)", "1N2", la ? `collecte : ${la.collecte}` : "test prêt, lancé dès que la clé API-Football est branchée", "En attente"]);
  const l8 = d.lab8, s8 = l8?.["seuil_0.02"];
  if (s8?.clv != null) out.push(["Bet365 au-dessus du prix juste Pinnacle", "Value marché", `${nf(s8.paris)} paris sur ${nf(l8.matchs)} matchs ; CLV ${sgn(s8.clv)} (IC ${sgn(s8.ic95_clv[0])} à ${sgn(s8.ic95_clv[1])})`, s8.ic95_clv[0] > 0 ? "Avantage prouvé" : "Pas d'avantage prouvé"]);
  const ve = d.value_eval, vf = ve?.agrees_france, va = ve?.tout;
  out.push(["Journal de value (cotes réelles contre Pinnacle)", "Test en avant", ve ? `${nf(ve.cotes_notees)} cotes notées, ${nf(ve.jugees)} jugées${va?.clv != null ? ` ; CLV ${sgn(va.clv)} (IC ${sgn(va.ic95_clv[0])} à ${sgn(va.ic95_clv[1])})` : ""}${vf?.clv != null ? ` ; bookmakers agréés en France : ${sgn(vf.clv)} sur ${nf(vf.n)}` : ""}` : "démarre avec la mise à jour quotidienne", va?.ic95_clv?.[0] > 0 ? "Avantage prouvé" : ve?.jugees > 100 ? "Pas d'avantage prouvé" : "En attente"]);
  const l9 = d.lab9;
  if (l9?.xg_en_plus) out.push(["xG Understat ajoutés au moteur", "1N2", `RPS ${nf(l9.rps.plus_xg, 4)} contre ${nf(l9.rps.actuel, 4)} (IC du gain ${nf(l9.xg_en_plus.ic95[0] * 1000, 1)} à ${nf(l9.xg_en_plus.ic95[1] * 1000, 1)} ‰) ; au-delà du marché : ${nf(l9.au_dela_marche.gain * 1000, 2)} ‰`, l9.xg_en_plus.prouve ? "Prouvé : à intégrer" : "Non prouvé"]);
  else out.push(["xG Understat", "1N2", l9?.erreur || "test prêt, lancé par le labo données", l9?.erreur ? "Erreur" : "En attente"]);
  const l10 = d.lab10;
  if (l10?.tout_au_dela_ouverture) { const t = l10.tout_au_dela_ouverture, c = l10.tout_au_dela_cloture;
    out.push(["Valeur du onze aligné (Transfermarkt)", "1N2", `gain ${nf(t.gain * 1000, 2)} ‰ au-delà de l'ouverture (IC ${nf(t.ic95[0] * 1000, 1)} à ${nf(t.ic95[1] * 1000, 1)} ‰)${c ? ` ; au-delà de la clôture ${nf(c.gain * 1000, 2)} ‰` : ""} ; ${nf(l10.matchs_testables)} matchs`, t.prouve ? (c?.prouve ? "Avantage prouvé, même face à la clôture" : "Prouvé avant les compos") : "Non prouvé"]); }
  else out.push(["Valeur du onze aligné (Transfermarkt)", "1N2", l10?.erreur || "test prêt, lancé par le labo données", l10?.erreur ? "Erreur" : "En attente"]);
  const l11 = d.lab11;
  if (l11?.corners) for (const [k, lab] of [["corners", "Corners"], ["cartons", "Cartons"]]) { const r = l11[k];
    out.push([`${lab} : forces d'équipe rapprochées de la moyenne`, `+/− ${k === "corners" ? "9,5" : "4,5"}`, `Brier, gain ${nf(r.gain_vs_ligue * 1000, 2)} ‰ face à la moyenne du championnat (IC ${nf(r.ic95[0] * 1000, 1)} à ${nf(r.ic95[1] * 1000, 1)} ‰) ; moyennes brutes : pire`, r.prouve ? "Adopté, prouvé" : "Adopté, gain non prouvé"]); }
  if (l11?.elo?.rps_avec) out.push(["Elo des clubs ajouté au moteur", "1N2", `RPS ${nf(l11.elo.rps_avec, 4)} contre ${nf(l11.elo.rps_sans, 4)} sur ${nf(l11.elo.n_test)} matchs`, l11.elo.prouve ? "Adopté" : "Rejeté"]);
  const l12 = d.lab12;
  if (l12?.B_multi_horizon) for (const [k, lab] of [["B_multi_horizon", "Ensemble multi-horizon (mémoire courte et longue)"], ["C_corners", "Domination aux corners dans le moteur"], ["D_ligue", "Constantes par championnat"], ["E_tout", "Toutes les pistes réunies"]]) { const r = l12[k];
    out.push([lab, "1N2", `RPS ${nf(r.rps, 4)} contre ${nf(l12.rps_base, 4)} (gain ${nf(r.gain * 1000, 2)} ‰, IC ${nf(r.ic95[0] * 1000, 1)} à ${nf(r.ic95[1] * 1000, 1)} ‰) ; ${nf(l12.n_test)} matchs 2025-26`, r.prouve ? "Adopté" : "Rejeté"]); }
  const c = d.clv, cv = c && c["clv_seuil_1.05"];
  out.push(c ? ["Modèle face à la clôture Pinnacle", "1N2", `RPS ${nf(c.rps_modele, 4)} contre ${nf(c.rps_pinnacle_cloture, 4)} (clôture) ; CLV ${cv?.clv_moy != null ? `${sgn(cv.clv_moy)} sur ${nf(cv.n)} paris, IC ${sgn(cv.ic95[0])} à ${sgn(cv.ic95[1])}` : "trop peu de paris"}`,
    cv?.ic95 && cv.ic95[0] > 0 ? "Avantage prouvé" : "Pas d'avantage prouvé"] : ["Modèle face à la clôture Pinnacle (CLV)", "1N2", "calculé chaque lundi par la mise à jour automatique, dès que le dépôt GitHub tourne", "En attente"]);
  if (p) out.push(["Premier League ajoutée au fit Championship", "1N2", `RPS ${nf(p.avec_PL.rps, 4)} contre ${nf(p.sans_PL.rps, 4)}`, "Rejeté"]);
  return out;
}
function labPanel() {
  const r = LAB.results, v = EXTRA.validation, rel = (x, b) => sgn((x - b) / b);
  const m3 = V3.market, rl = (x, b) => sgn((x - b) / b), vb = m3.value_modele_meilleure_cote[0];
  const rows = [
    ["Tirs cadrés + pi-ratings + Dixon-Coles", "1N2", `RPS ${nf(m3.dc_tirs_pi.rps, 4)} contre ${nf(m3.dc.rps, 4)} pour Dixon-Coles seul (${rl(m3.dc_tirs_pi.rps, m3.dc.rps)})`, "Adopté"],
    ["Fit commun 1re + 2e division", "1N2", `RPS 2023-24 ${nf(V3.tune.rps, 5)}, meilleure configuration du réglage`, "Adopté"],
    ["Demi-vie des données réglée", "1N2", `${nf(Math.log(2) / V3.tune.xi)} jours, rétrécissement ${nf(V3.tune.l2, 2)}`, "Adopté"],
    ["Mélange modèle + cotes du marché", "1N2", `RPS ${nf(m3.marche_plus_modele.rps, 4)} contre ${nf(m3.marche_seul.rps, 4)} pour le marché seul`, "Sans gain global"],
    ["Parier quand le modèle bat la meilleure cote", "Value", `ROI ${sgn(vb.roi)} sur ${nf(vb.paris)} paris, IC 95 % ${sgn(vb.ic95[0])} à ${sgn(vb.ic95[1])}`, "Rejeté : perte"],
    ["Corners (forces d'équipe)", "+9,5 corners", `Brier ${nf(V3.side.corners.brier, 4)} contre ${nf(V3.side.corners.brier_base, 4)} pour la moyenne`, "Rejeté"],
    ["Cartons (forces d'équipe)", "+4,5 cartons", `Brier ${nf(V3.side.cartons.brier, 4)} contre ${nf(V3.side.cartons.brier_base, 4)}`, "Sans effet mesurable"],
    ["Dixon-Coles + pi-ratings (ensemble)", "1N2", `log-loss ${nf(r.C_dc_plus_pi.logloss, 4)} contre ${nf(r.C_dc_recalibre.logloss, 4)}, RPS ${rel(r.C_dc_plus_pi.rps, r.C_dc_recalibre.rps)}`, "Adopté"],
    ["Elo ajouté au modèle", "1N2", `RPS ${rel(r.C_dc_plus_elo.rps, r.C_dc_recalibre.rps)}`, "Moins bon que les pi-ratings"],
    ["Jours de repos", "1N2", `RPS ${rel(r.C_dc_plus_repos.rps, r.C_dc_recalibre.rps)}`, "Rejeté"],
    ["Forme sur 5 matchs", "1N2", `RPS ${rel(r.C_dc_plus_forme.rps, r.C_dc_recalibre.rps)}`, "Rejeté"],
    ["Tous les signaux empilés", "1N2", `RPS ${rel(r.C_empilement.rps, r.C_dc_recalibre.rps)}`, "Rejeté : surapprentissage"],
    ["A priori équipes promues", "1N2", `RPS ${rel(r.B_dc_promu_matchs_promus.rps, r.A_dc_matchs_promus.rps)} sur ${nf(r.A_dc_matchs_promus.n)} matchs de promus`, "Gardé, effet négligeable"],
    ["Correction des nuls", "1N2", `log-loss ${rel(r.D_nuls_corriges.logloss, r.B_eval.logloss)}`, "Intégré à l'ensemble"],
    ["Demi-périodes indépendantes", "Mi-temps", `RPS ${rel(r.HT_modele.rps, r.HT_reference.rps)} vs moyenne historique`, "Adopté"],
    ["Mi-temps / fin de match", "9 issues", `log-loss ${rel(r.HTFT_modele_logloss.logloss, r.HTFT_reference_logloss.logloss)}`, "Adopté"],
    ["Victoire par 2 buts ou plus", "Écart", `Brier ${sgn(-r.marche_victoire_dom_par_2.gain)} vs moyenne`, "Marché le plus fiable"],
    ["Clean sheet", "Écart", `Brier ${sgn(-r.marche_clean_sheet_dom.gain)}`, "Fiable"],
    ["+2,5 buts", "Totaux", `Brier ${sgn(-r.marche_plus_2_5.gain)}`, "Faible : le marché sert de référence"],
    ["Buteur (part × buts attendus)", "Joueurs", `Brier ${rel(v.buteur.brier, v.buteur.brier_ref)} vs historique seul, k = ${nf(EXTRA.scorer_k, 2)}`, "Adopté, calibré"],
    ["Arbitre sévère → cartons", "Discipline", `Brier ${nf(v.cartons_plus_4_5.brier_modele, 3)} contre ${nf(v.cartons_plus_4_5.brier_sans_arbitre, 3)} sans arbitre`, "Rejeté"],
    ["Cartons rouges → rythme de buts", "Live", `×${nf(Math.exp(LIVE.coef.up), 2)} en supériorité, ×${nf(Math.exp(LIVE.coef.down), 2)} à 10`, "Adopté"],
    ["État du score → rythme de buts", "Live", "intervalles de confiance qui incluent 0", "Sans effet mesurable"],
    ...deepRows()
  ];
  return `<div class="panel"><header><h2>Laboratoire : ce qui a été testé</h2><span class="note">Walk-forward, entraînement toujours antérieur au test</span></header>
    <div class="scroll"><table><thead><tr><th>Signal ou méthode</th><th>Cible</th><th>Résultat hors échantillon</th><th>Décision</th></tr></thead><tbody>
    ${rows.map(([a, b, c, d]) => `<tr><td>${a}</td><td class="faint">${b}</td><td class="num">${c}</td><td><span class="pill ${/Rejeté|Faible|Sans effet|Moins bon|Non prouvé|non significatif|Pas d'avantage|pas rentable|Erreur/.test(d) ? "warn" : /négligeable|En attente/.test(d) ? "ghost" : "good"}">${d}</span></td></tr>`).join("")}</tbody></table></div>
    <p class="note" style="margin-top:8px">Un signal n'entre dans la plateforme que s'il améliore la prévision sur des matchs que le modèle n'a pas vus. RPS, log-loss et Brier : plus bas = mieux.</p></div>
  <div class="panel"><header><h2>Données : ce qui est branché, ce qui manque</h2></header>
    <div class="stack muted" style="max-width:80ch">
      <p><strong>Branché.</strong> ${nf(V3.params.n_train)} matchs depuis 2018 avec buts, mi-temps, tirs, tirs cadrés, corners, fautes, cartons et cotes Bet365 et meilleures cotes (football-data.co.uk). Résultats openfootball jusqu'au ${new Date(lastResult + "T12:00").toLocaleDateString("fr-FR")}. Compositions, buteurs, penalties et arbitres pour la Premier League et la Bundesliga 2025-26. Cotes de plus de 20 bookmakers via ta clé The Odds API.</p>
      <p><strong>Manquant.</strong> Résultats depuis le ${new Date(lastResult + "T12:00").toLocaleDateString("fr-FR")}, blessures et compositions officielles, xG. La chaîne de mise à jour quotidienne fournie avec le projet comble les résultats et les cotes gratuitement (football-data.org, The Odds API). Les compositions confirmées et les blessures demandent un abonnement (API-Football Pro, 19 $ par mois) : c'est le levier le plus rentable pour se rapprocher du marché.</p>
    </div></div>`;
}
// ---------- Analyse IA ----------
async function runAI() {
  const f = FXK[S.matchKey]; const out = $("#aiout"); if (!f || !out) return;
  const sample = await hostUse("sample");
  if (!sample) { out.innerHTML = `<p class="muted">L'analyse IA n'est pas disponible dans cette vue. Ouvre la page depuis son lien de partage, connecté à ton compte.</p>`; return; }
  const L = liveOf(f), s = L90.stateAt(L.events, L.t), r = L90.project(C, ...LR(f), L.t, s.hg, s.ag, s.man, 10), an = analyse(f);
  const facts = {
    match: `${f.home} – ${f.away}`, championnat: LG[f.league], date: f.date, buts_attendus: { domicile: +f.lam.toFixed(2), exterieur: +f.mu.toFixed(2) },
    avant_match: { "1": +f.m.H.toFixed(3), N: +f.m.D.toFixed(3), "2": +f.m.A.toFixed(3), plus_2_5: +f.m.O[2.5].toFixed(3), les_deux_marquent: +f.m.BTTS.toFixed(3), scores_probables: f.m.scores.slice(0, 4).map(x => `${x.s} ${(x.p * 100).toFixed(1)}%`) },
    live: L.t > 0 || L.events.length ? { minute: L90.clockLabel(L.t), score: `${s.hg}-${s.ag}`, superiorite_numerique: s.man, "1": +r.H.toFixed(3), N: +r.D.toFixed(3), "2": +r.A.toFixed(3), but_10_min: +r.pGoalH.toFixed(3) } : "match non commencé",
    cotes: S.odds[f.key] ? { source: S.oddsSource === "demo" ? "SIMULÉES (démonstration, pas de vraies cotes)" : "importées", bookmakers: S.odds[f.key] } : "aucune",
    paris_a_valeur: an ? an.value.map(v => ({ issue: SEL[v.k], bookmaker: v.book, cote: v.o, prob_reference: +v.p.toFixed(3), reference: v.src, ev: +v.ev.toFixed(3), mise_kelly_eur: +v.stake.toFixed(2) })) : [],
    arbitrages: an ? an.arbs.map(a => ({ marche: a.market, somme_inverses: +a.S.toFixed(4), arbitrage: a.isArb })) : [],
    fiabilite_modele: { rps_backtest: PRE.summary.all.rps, rps_reference: PRE.summary.all.rps_base, note: "aucun avantage mesuré sur +/-2,5 buts ; prédiction du but dans les 10 min proche du hasard (AUC 0,54)" },
    mode_lecteur: S.mode === "fan" ? "fan (vulgariser, pas de jargon, pas de conseil de mise)" : "quant (précis, chiffré)"
  };
  const prompt = `Tu es l'analyste de Lambda 90, plateforme de probabilités football. Rédige en français une analyse de ce match à partir UNIQUEMENT des données JSON ci-dessous. N'invente aucune information (blessures, forme, compositions, actualité) : tu n'en as pas. Si les cotes sont simulées, dis-le clairement et ne présente aucune mise comme réelle.
Structure, avec des titres "## " :
## Lecture du match (3 à 4 phrases : rapport de force, scénario le plus probable, incertitude)
## Où se situe la valeur (seulement en mode quant : paris à valeur, EV, cohérence entre référence et modèle, arbitrages ; sinon une phrase sur ce qui peut surprendre)
## Risques et limites (2 à 3 puces : limites du modèle, de la donnée, de la cote)
## À retenir (une phrase)
Ne garantis jamais de gain. Ton direct, sans formules creuses. Moins de 250 mots.
Données : ${JSON.stringify(facts)}`;
  out.innerHTML = `<p class="muted">Analyse en cours…</p>`;
  try {
    const res = await sample(prompt, { modelTier: "default", onText: u => { out.innerHTML = md(u.text); } });
    S.ai[f.key] = md(res.text); out.innerHTML = S.ai[f.key];
  } catch (e) {
    out.innerHTML = `<p class="muted">${e?.code === "not_granted" ? "Autorisation refusée : l'analyse IA reste désactivée pour cette visite." : e?.code === "rate_limited" ? "Trop de demandes. Réessaie dans une minute." : "L'analyse n'a pas pu être générée."}</p>`;
  }
}
function md(t) {
  const lines = esc(t).split("\n"); let h = "", inUl = false;
  for (let l of lines) {
    l = l.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    if (/^#{1,3} /.test(l)) { if (inUl) { h += "</ul>"; inUl = false; } h += `<h4>${l.replace(/^#+ /, "")}</h4>`; }
    else if (/^[-*•] /.test(l)) { if (!inUl) { h += "<ul>"; inUl = true; } h += `<li>${l.slice(2)}</li>`; }
    else if (l.trim()) { if (inUl) { h += "</ul>"; inUl = false; } h += `<p>${l}</p>`; }
  }
  return h + (inUl ? "</ul>" : "");
}

// ---------- Rendu général et événements ----------
function render() {
  document.body.classList.toggle("fan", S.mode === "fan");
  if (S.mode === "fan" && ["value", "bank", "ladder", "tools", "survivor"].includes(S.tab)) S.tab = "daily";
  if (S.tab === "fan") S.fan.joinCode = S.fan.joinCode || "";
  document.querySelectorAll(".tab").forEach(t => t.setAttribute("aria-selected", t.dataset.menu ? (NAV_GROUPS[t.dataset.menu] || []).some(x => x[0] === S.tab) : t.dataset.tab === S.tab));
  document.querySelectorAll(".mode button").forEach(b => b.setAttribute("aria-pressed", b.dataset.mode === S.mode));
  for (const v of VIEWS) $("#v-" + v).hidden = v !== S.tab;
  renderNotice();
  renderSlip();
  { const hd = document.querySelector("header.top"), nt = $("#notice"); document.documentElement.style.setProperty("--hdr", ((hd?.offsetHeight || 64) + (nt && !nt.hidden ? nt.offsetHeight : 0)) + "px"); }
  ({ daily: renderDaily, survivor: renderSurvivor, studio: renderStudio, radar: renderRadar, match: renderMatch, season: renderSeason, fan: renderFan, value: renderValue, ladder: renderLadder, tools: renderTools, bank: renderBank, proof: renderProof })[S.tab]();
}
const VIEWS = ["daily", "radar", "match", "season", "fan", "value", "ladder", "survivor", "tools", "studio", "bank", "proof"];
function go(tab) { S.tab = tab; try { history.replaceState(null, "", "#" + tab); } catch {} render(); scrollTo({ top: 0 }); }

document.addEventListener("click", e => {
  const t = e.target.closest("button,a"); if (!t) return;
  const d = t.dataset;
  if (d.tab) { e.preventDefault(); go(d.tab); return; }
  if (d.mode) { S.mode = d.mode; ls.set("mode", S.mode); render(); return; }
  if (d.league) { S.league = d.league; ls.set("league", S.league); render(); return; }
  if (d.open) { S.matchKey = d.open; go("match"); return; }
  if (d.bet) { if (breaker().on) return; addBet(JSON.parse(d.bet)); return; }
  if (d.delbet) { removeBet(d.delbet); return; }
  if (d.act === "autoclose") { (async () => { let n = 0; for (const b of S.bets) { const c = !b.close && closeFor(b); if (c) { await updateBet(b.id, { close: c }); n++; } } toast(`${n} cotes de clôture remplies`); })(); return; }
  if (d.delbook) { delete S.odds[S.matchKey][d.delbook]; render(); return; }
  if (d.calcn) { S.calc.n = +d.calcn; render(); return; }
  if (d.pick) { savePick(d.k, { sel: d.pick }); toast("Pronostic enregistré"); render(); return; }
  if (d.mtab) { S.mtab = d.mtab; render(); return; }
  if (d.fav) { S.favs = S.favs.includes(d.fav) ? S.favs.filter(x => x !== d.fav) : [...S.favs, d.fav]; ls.set("favs", S.favs); toast(S.favs.includes(d.fav) ? `${short(d.fav)} suivie` : `${short(d.fav)} retirée`); render(); return; }
  if (d.seasonlg) { S.seasonLg = d.seasonlg; render(); return; }
  if (d.day) { S.day = d.day; render(); return; }
  if (d.fanleague) { S.fan.active = d.fanleague; render(); return; }
  if (d.copy) { navigator.clipboard?.writeText(d.copy).then(() => toast("Code copié"), () => toast("Code : " + d.copy)); return; }
  if (d.leave) { leaveLeague(d.leave); return; }
  if (d.setres) { setResult(S.fan.active, d.setres, d.k, ($("#res-" + d.setres)?.value || "").trim()); return; }
  if (d.live) { liveAction(d, t); return; }
  switch (d.act) {
    case "demo": S.odds = demoOdds(); S.oddsSource = "demo"; render(); break;
    case "clearodds": S.odds = {}; S.oddsSource = "none"; ls.set("odds", null); render(); break;
    case "goimport": go("value"); setTimeout(() => $("#import")?.scrollIntoView({ behavior: "smooth" }), 50); break;
    case "import": { S.importMsg = importOdds($("#importbox").value); render(); toast("Import terminé"); break; }
    case "addbook": { const n = $("#newbook").value.trim(); if (!n) return; (S.odds[S.matchKey] ??= {})[n] = {}; if (S.oddsSource === "none") S.oddsSource = "manual"; render(); break; }
    case "ai": runAI(); break;
    case "onboarded": S.onboarded = true; ls.set("onboarded", true); render(); break;
    case "createleague": createLeague($("#lgname").value.trim()); break;
    case "joinleague": joinLeague($("#lgcode").value); break;
    case "manualbet": {
      const odds = parseFloat($("#mb-odds").value), stake = parseFloat($("#mb-stake").value);
      if (!(odds > 1) || !(stake > 0)) { toast("Indique une cote supérieure à 1 et une mise positive"); return; }
      addBet({ label: $("#mb-label").value || "Pari", sel: $("#mb-sel").value || "?", book: $("#mb-book").value || "?", odds, stake, market: "manuel" }); break; }
  }
});
const hash = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return (h >>> 0).toString(36); };
let playTimer = null;
function liveAction(d, t) {
  const f = FXK[S.matchKey], L = liveOf(f);
  if (d.live === "goal" || d.live === "red") { L.events.push({ t: L.t, type: d.live, side: +d.side }); L.events.sort((a, b) => a.t - b.t); }
  if (d.live === "del") L.events.splice(+d.i, 1);
  if (d.live === "reset") { L.t = 0; L.events = []; L.playing = false; clearInterval(playTimer); }
  if (d.live === "play") {
    L.playing = !L.playing; clearInterval(playTimer);
    if (L.playing) playTimer = setInterval(() => { if (L.t >= L90.NM) { L.playing = false; clearInterval(playTimer); } else L.t++; if (S.tab === "match") renderMatch(); }, 900);
  }
  renderMatch();
}
document.addEventListener("input", e => {
  const el = e.target, d = el.dataset;
  if (d.live === "clock") { const L = liveOf(FXK[S.matchKey]); L.t = +el.value; clearTimeout(el._t); el._t = setTimeout(renderMatch, 60); return; }
  if (d.calc != null) { if (d.calc === "T") S.calc.T = el.value; else S.calc.o[+d.calc] = el.value; deferRender(el); return; }
  if (d.lo) { liveOf(FXK[S.matchKey]).lo[d.lo] = el.value; deferRender(el); return; }
  if (el.id === "search") { S.q = el.value; deferRender(el); return; }
});
document.addEventListener("change", e => {
  const el = e.target, d = el.dataset;
  if (d.api) { S.api[d.api] = el.value; ls.set("api", S.api); render(); return; }
  if (d.pred) { const P = S.pred[S.seasonLg]; P[d.pred] = d.pred === "neutral" ? el.checked : el.value; render(); return; }
  if (d.pscore) { const v = el.value === "" ? null : Math.max(0, Math.min(15, parseInt(el.value, 10))); savePick(d.k, d.pscore === "h" ? { sh: v } : { sa: v }); return; }
  if (d.cfg) { S.cfg[d.cfg] = el.value; saveCfg(); render(); }
  else if (d.cfgnum) { const v = parseFloat(el.value); if (isFinite(v) && v >= 0) { S.cfg[d.cfgnum] = v; saveCfg(); render(); } }
  else if (d.cfgpct) { const v = parseFloat(el.value); if (isFinite(v) && v >= 0) { S.cfg[d.cfgpct] = v / 100; saveCfg(); render(); } }
  else if (d.cfgbool) { S.cfg[d.cfgbool] = el.checked; saveCfg(); render(); }
  else if (d.odd) { const [b, k] = d.odd.split("|"), v = parseFloat(el.value.replace(",", ".")); const o = (S.odds[S.matchKey] ??= {})[b] ??= {}; if (v > 1) o[k] = v; else delete o[k]; if (S.oddsSource === "none") S.oddsSource = "manual"; render(); }
  else if (d.close) { const v = parseFloat(el.value); updateBet(d.close, { close: v > 1 ? v : null }); }
  else if (d.res) { updateBet(d.res, { result: el.value, settledAt: el.value === "pending" ? null : Date.now() }); }
});
function deferRender(el) { const id = el.id, pos = el.selectionStart; clearTimeout(window._dr); window._dr = setTimeout(() => { render(); const n = document.getElementById(id); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch {} } }, 350); }
document.addEventListener("paste", e => {
  if (e.target.id !== "importbox") return;
  const txt = e.clipboardData?.getData("text"); if (!txt) return;
  e.preventDefault(); S.importMsg = importOdds(txt); render(); toast(S.importMsg.startsWith("Importé") ? "Cotes importées" : "Import impossible");
  setTimeout(() => $("#import")?.scrollIntoView({ block: "center" }), 30);
});
document.addEventListener("mouseover", e => { const t = e.target.closest("[data-tip]"); if (t) showTip(e, t.dataset.tip); });
document.addEventListener("mousemove", e => { const t = e.target.closest("[data-tip]"); if (t) showTip(e, t.dataset.tip); });
document.addEventListener("mouseout", e => { if (e.target.closest("[data-tip]")) hideTip(); });
let rz, rzW = innerWidth; addEventListener("resize", () => { if (innerWidth === rzW) return; rzW = innerWidth; clearTimeout(rz); rz = setTimeout(render, 200); });  // la barre d'adresse mobile change la hauteur : on ne redessine que si la largeur change

// ---------- Démarrage ----------
const saved = ls.get("odds", undefined);
if (saved && saved.src === "import" && saved.odds) { S.odds = saved.odds; S.oddsSource = "import"; }
else if (saved === null) { S.odds = {}; S.oddsSource = "none"; }
else { S.odds = demoOdds(); S.oddsSource = "demo"; }
if (DATA.feed?.events?.length && (S.oddsSource !== "import" || (ls.get("feedTs", 0) < DATA.feed.ts))) { S.importMsg = importOdds(JSON.stringify(DATA.feed.events)); ls.set("feedTs", DATA.feed.ts); }
const h0 = (location.hash || "").slice(1); if (VIEWS.includes(h0)) S.tab = h0; if (/^join-[A-Za-z0-9]{6}$/.test(h0)) { S.tab = "fan"; S.fan.joinCode = h0.slice(5).toUpperCase(); }
render();
initStore();
