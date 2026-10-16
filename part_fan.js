// ---------- Défis entre amis ----------
S.fan = { myPicks: ls.get("picks", {}), leagues: [], active: null, meta: {}, members: {}, results: {}, allPicks: {}, names: {}, joinCode: "", msg: "", ready: false };
let USER = null; const UNSUB = {};
const kickoffOf = f => { const k = Date.parse(S.kick[f.key] || ""); return k || Date.parse(`${f.date}T${(f.time || "12:00").slice(0, 5)}:00`); };
const locked = f => Date.now() > kickoffOf(f);
function pickWidget(f, pick) {
  const lk = locked(f), h = short(f.home), a = short(f.away);
  return `<div class="pickw" data-pkey="${esc(f.key)}">
    <div class="pick" role="group" aria-label="Ton pronostic ${esc(h)} contre ${esc(a)}">${["H", "D", "A"].map(k => `<button data-pick="${k}" data-k="${esc(f.key)}" aria-pressed="${pick?.sel === k}" ${lk ? "disabled" : ""}>${k === "H" ? esc(h) : k === "D" ? "Nul" : esc(a)}</button>`).join("")}</div>
    <div class="row" style="margin-top:8px"><span class="note">Score exact (bonus)</span>
      <input type="number" min="0" max="15" id="ps-${hash(f.key)}-h" data-pscore="h" data-k="${esc(f.key)}" value="${pick?.sh ?? ""}" aria-label="Buts ${esc(h)}" ${lk ? "disabled" : ""} style="width:56px">
      <span>–</span><input type="number" min="0" max="15" id="ps-${hash(f.key)}-a" data-pscore="a" data-k="${esc(f.key)}" value="${pick?.sa ?? ""}" aria-label="Buts ${esc(a)}" ${lk ? "disabled" : ""} style="width:56px">
      ${lk ? `<span class="pill ghost">Verrouillé</span>` : ""}
      ${pick ? `<span class="note">Le modèle donne ${pct(f.m[pick.sel])} à ton choix${pick.sel !== argmax(f) ? ` et préfère ${SEL[argmax(f)] === "N" ? "le nul" : SEL[argmax(f)] === "1" ? h : a}` : ", comme toi"}.</span>` : `<span class="note">L'avis du modèle s'affiche après ton choix.</span>`}
    </div></div>`;
}
const argmax = f => f.m.H >= f.m.D && f.m.H >= f.m.A ? "H" : f.m.D >= f.m.A ? "D" : "A";
let pickT; function savePick(k, patch) {
  const f = FXK[k]; if (!f || locked(f)) { toast("Pronostic verrouillé : le match a commencé"); return; }
  const h = hash(k), cur = S.fan.myPicks[h] || { k };
  S.fan.myPicks[h] = { ...cur, ...patch, k, ts: Date.now() };
  ls.set("picks", S.fan.myPicks);
  clearTimeout(pickT); pickT = setTimeout(async () => { if (DB && UID) { try { await DB.doc("picks/" + UID).set({ picks: S.fan.myPicks }); } catch (e) { toast("Pronostic non partagé : accès en lecture seule"); } } }, 500);
}
function fanSubscribe() {
  if (!DB || !UID || S.fan.ready) return; S.fan.ready = true;
  DB.collection("picks").onSnapshot(snap => {
    const all = {}; for (const d of snap.docs) { const v = d.data(); if (v?.picks) all[d.id] = v.picks; }
    S.fan.allPicks = all; if (all[UID]) { S.fan.myPicks = { ...all[UID], ...S.fan.myPicks }; }
    resolveNames(Object.keys(all)); if (S.tab === "fan") render();
  }, () => {});
}
function watchLeague(code) {
  if (!DB || UNSUB[code]) return;
  const u1 = DB.doc("leagues/" + code).onSnapshot(s => { if (s.exists) S.fan.meta[code] = s.data(); if (S.tab === "fan") render(); }, () => {});
  const u2 = DB.collection("leagues/" + code + "/members").onSnapshot(s => { S.fan.members[code] = s.docs.map(d => d.id); resolveNames(S.fan.members[code]); if (S.tab === "fan") render(); }, () => {});
  const u3 = DB.collection("leagues/" + code + "/results").onSnapshot(s => { S.fan.results[code] = Object.fromEntries(s.docs.map(d => [d.id, d.data()])); if (S.tab === "fan") render(); }, () => {});
  UNSUB[code] = () => { u1(); u2(); u3(); };
}
async function resolveNames(ids) {
  if (!USER) return; const need = ids.filter(i => !(i in S.fan.names)); if (!need.length) return;
  try { const ps = await USER.profiles(need); for (const i of need) S.fan.names[i] = ps[i]?.name || ""; if (S.tab === "fan") render(); } catch {}
}
const nameOf = uid => uid === UID ? "Toi" : (S.fan.names[uid] || "Joueur " + uid.slice(-4));
async function saveMyLeagues() { await saveDoc("myleagues", { kind: "leagues", codes: S.fan.leagues }); }
async function createLeague(name) {
  if (!DB || !UID) return toast("Connecte-toi sur la plateforme d'hébergement pour créer une ligue");
  const code = Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
  try {
    await DB.doc("leagues/" + code).set({ name: name || "Ligue des potes", owner: UID, created: Date.now() });
    await DB.collection("leagues/" + code + "/members").doc(UID).set({ ts: Date.now() });
    S.fan.leagues = [...new Set([...S.fan.leagues, code])]; S.fan.active = code; await saveMyLeagues(); watchLeague(code); toast("Ligue créée : " + code);
  } catch (e) { toast("Création refusée : il faut un accès Contributeur à la page"); }
  render();
}
async function joinLeague(code) {
  code = (code || "").trim().toUpperCase(); if (!code) return;
  if (!DB || !UID) return toast("Connecte-toi sur la plateforme d'hébergement pour rejoindre une ligue");
  try {
    const s = await DB.doc("leagues/" + code).get(); if (!s.exists) { S.fan.msg = `Aucune ligue avec le code ${code}.`; render(); return; }
    await DB.collection("leagues/" + code + "/members").doc(UID).set({ ts: Date.now() });
    S.fan.leagues = [...new Set([...S.fan.leagues, code])]; S.fan.active = code; S.fan.msg = ""; await saveMyLeagues(); watchLeague(code); toast("Tu as rejoint " + (s.data()?.name || code));
  } catch (e) { S.fan.msg = "Impossible de rejoindre : il faut un accès Contributeur à la page."; }
  render();
}
async function leaveLeague(code) {
  try { await DB.collection("leagues/" + code + "/members").doc(UID).delete(); } catch {}
  S.fan.leagues = S.fan.leagues.filter(c => c !== code); if (S.fan.active === code) S.fan.active = S.fan.leagues[0] || null;
  UNSUB[code]?.(); delete UNSUB[code]; await saveMyLeagues(); render();
}
async function setResult(code, h, k, score) {
  if (!/^\d+-\d+$/.test(score)) return toast("Score au format 2-1");
  try { await DB.collection("leagues/" + code + "/results").doc(h).set({ score, k, by: UID, ts: Date.now() }); toast("Résultat enregistré"); } catch { toast("Enregistrement refusé"); }
}
function scorePick(p, score, f) {
  const [x, y] = score.split("-").map(Number), out = x > y ? "H" : x === y ? "D" : "A";
  if (!p) return { pts: 0, played: 0 };
  const good = p.sel === out, exact = good && +p.sh === x && +p.sa === y;
  const genius = good && f && f.m[out] < 0.3;
  return { pts: (good ? 1 : 0) + (exact ? 2 : 0) + (genius ? 1 : 0), good: +good, exact: +exact, genius: +genius, played: 1 };
}
function leaderboard(code) {
  const res = S.fan.results[code] || {}, members = S.fan.members[code] || [];
  const rows = members.map(uid => ({ uid, name: nameOf(uid), pts: 0, good: 0, exact: 0, genius: 0, played: 0, beat: 0 }));
  const model = { uid: "model", name: "Lambda 90 (le modèle)", pts: 0, good: 0, exact: 0, genius: 0, played: 0 };
  for (const [h, r] of Object.entries(res)) {
    const f = FXK[r.k];
    const mp = f ? { sel: argmax(f), sh: +f.m.scores[0].s.split("-")[0], sa: +f.m.scores[0].s.split("-")[1] } : null;
    const ms = scorePick(mp, r.score, f); for (const k of ["pts", "good", "exact", "played"]) model[k] += ms[k] || 0;
    for (const row of rows) { const s = scorePick(S.fan.allPicks[row.uid]?.[h], r.score, f); for (const k of ["pts", "good", "exact", "genius", "played"]) row[k] += s[k] || 0; if (s.pts > ms.pts) row.beat++; }
  }
  return { rows: [...rows, model].sort((a, b) => b.pts - a.pts || b.exact - a.exact), n: Object.keys(res).length };
}
const badges = r => [r.exact >= 1 ? ["Oracle", "au moins un score exact"] : null, r.genius >= 1 ? ["Contre-courant", "bonne issue que le modèle donnait sous 30 %"] : null, r.played >= 10 ? ["Régulier", "10 pronostics notés"] : null, r.beat >= 3 ? ["Plus fort que la machine", "a battu le modèle sur 3 matchs"] : null].filter(Boolean);
function renderFan() {
  const F = S.fan, code = F.active, meta = code ? F.meta[code] : null, owner = meta?.owner === UID;
  const lb = code ? leaderboard(code) : null;
  const list = FX.filter(f => (S.league === "all" || f.league === S.league) && !locked(f)).slice(0, 40);
  const nPicks = Object.keys(F.myPicks).length;
  const pendingRes = code && owner ? FX.filter(f => locked(f) && !(F.results[code] || {})[hash(f.key)] && (F.members[code] || []).some(u => F.allPicks[u]?.[hash(f.key)])) : [];
  $("#v-fan").innerHTML = `
  <div class="stack">
    <div><h1>Défis</h1><p class="lede">Pronostique les matchs, crée une ligue avec tes amis et affronte-les, et le modèle avec. Bonne issue : 1 point. Score exact : 2 points de plus. Bonne issue que le modèle donnait sous 30 % : 1 point bonus.</p></div>
    ${S.store !== "db" ? `<div class="empty">Mode solo : tes pronostics sont gardés dans ce navigateur. Ouvre la page connecté à la plateforme d'hébergement pour créer ou rejoindre une ligue.</div>` : ""}
    <div class="grid2">
      <div class="panel"><header><h2>Mes ligues</h2><span class="note">${F.leagues.length} ligue${F.leagues.length > 1 ? "s" : ""}</span></header>
        ${F.leagues.length ? `<div class="chips" style="margin-bottom:12px">${F.leagues.map(c => `<button class="chip" data-fanleague="${c}" aria-pressed="${c === code}">${esc(F.meta[c]?.name || c)}</button>`).join("")}</div>` : ""}
        <div class="row" style="align-items:flex-end"><label class="f">Nouvelle ligue<input type="text" id="lgname" placeholder="Nom de la ligue" maxlength="40"></label><button class="btn primary" data-act="createleague">Créer</button></div>
        <div class="row" style="align-items:flex-end;margin-top:10px"><label class="f">Code d'invitation<input type="text" id="lgcode" placeholder="ABC123" maxlength="6" value="${esc(F.joinCode)}" style="text-transform:uppercase;width:120px"></label><button class="btn" data-act="joinleague">Rejoindre</button></div>
        ${F.msg ? `<p class="muted" style="margin-top:8px">${esc(F.msg)}</p>` : ""}
        <p class="note" style="margin-top:10px">Pour jouer, tes amis ont besoin d'un accès <strong>Contributeur</strong> à cette page (menu Partager), puis du code. Lien direct : ajoute <code>#join-CODE</code> à l'adresse de la page.</p></div>
      <div class="panel"><header><h2>${code ? esc(meta?.name || code) : "Classement"}</h2>${code ? `<div class="row"><span class="pill info">Code ${code}</span><button class="btn small" data-copy="${code}">Copier</button><button class="btn small" data-leave="${code}">Quitter</button></div>` : ""}</header>
        ${!code ? `<div class="empty">Crée une ligue ou rejoins-en une pour voir le classement.</div>` : lb.n === 0 ? `<div class="empty">Aucun résultat saisi pour l'instant. ${owner ? "En tant que créateur, saisis les scores finaux ci-dessous après chaque match." : "Le créateur de la ligue saisit les scores après chaque match."}</div>` : `
        <div class="scroll"><table><thead><tr><th>#</th><th>Joueur</th><th class="r">Points</th><th class="r">Bonnes issues</th><th class="r">Scores exacts</th><th class="r">Notés</th><th>Badges</th></tr></thead><tbody>
        ${lb.rows.map((r, i) => `<tr class="${r.uid === "model" ? "modelrow" : ""}"><td class="num faint">${i + 1}</td><td>${r.uid === UID ? "<strong>Toi</strong>" : esc(r.name)}</td><td class="r num"><strong>${r.pts}</strong></td><td class="r num">${r.good}</td><td class="r num">${r.exact}</td><td class="r num faint">${r.played}</td>
          <td>${r.uid === "model" ? "" : badges(r).map(([b, t]) => `<span class="pill good" title="${t}">${b}</span>`).join(" ")}</td></tr>`).join("")}</tbody></table></div>`}
        ${pendingRes.length ? `<h3 style="margin:14px 0 8px">Scores à saisir</h3>${pendingRes.slice(0, 10).map(f => `<div class="row" style="margin-bottom:6px"><span style="min-width:0;flex:1">${esc(short(f.home))} – ${esc(short(f.away))}</span><input type="text" id="res-${hash(f.key)}" placeholder="2-1" style="width:70px"><button class="btn small" data-setres="${hash(f.key)}" data-k="${esc(f.key)}">Valider</button></div>`).join("")}` : ""}
      </div>
    </div>
    <div class="panel"><header><h2>Pronostics à faire</h2><span class="note">${nPicks} pronostic${nPicks > 1 ? "s" : ""} enregistré${nPicks > 1 ? "s" : ""}</span></header>
      <div class="chips" style="margin-bottom:12px">${[["all", "Toutes"], ...Object.entries(LG)].map(([k, v]) => `<button class="chip" data-league="${k}" aria-pressed="${S.league === k}">${v}</button>`).join("")}</div>
      ${list.length ? list.map(f => `<div class="fanfx"><div class="row" style="justify-content:space-between"><div><strong>${esc(short(f.home))} – ${esc(short(f.away))}</strong><div class="note">${LG[f.league]}, ${dayName(f.date)} ${esc(f.time || "")}</div></div><button class="btn small" data-open="${esc(f.key)}">Analyse</button></div>${pickWidget(f, F.myPicks[hash(f.key)])}</div>`).join("") : `<div class="empty">Aucun match ouvert aux pronostics dans ce championnat.</div>`}
    </div>
  </div>`;
}
