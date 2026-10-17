// ---------- Studio : contenus prêts à publier (YouTube, Shorts, Reels, TikTok, posts, carrousels) depuis toutes les parties de la plateforme ----------
const ST_FMT = { short: { w: 1080, h: 1920, lab: "Short · Reel · TikTok · Story", ratio: "9:16" }, yt: { w: 1920, h: 1080, lab: "YouTube", ratio: "16:9" },
  post: { w: 1080, h: 1080, lab: "Post carré", ratio: "1:1" }, portrait: { w: 1080, h: 1350, lab: "Post portrait · carrousel", ratio: "4:5" } };
const ST_TPL = { top: "Top du jour", combos: "Combinés du jour", recap: "Bilan de la veille", match: "Avant-match", hotcold: "Hot & Cold", survivor: "Survivant", season: "Saison simulée", proof: "Nos probabilités tiennent", value: "Le prix des bookmakers" };
let ST_DUR = 3.8;
S.studio = Object.assign({ tpl: "top", fmt: "short", match: null, lg: "fr.1", theme: "nuit", dur: 3.8, hook: "", handle: "" }, ls.get("studio", {}));
ST_DUR = Math.max(2, Math.min(8, +S.studio.dur || 3.8));
const STX = { t0: 0, playing: false, raf: 0, rec: null, slide: 0 };
const C_ = { glow: "159,231,245", markInk: "#06212A", bg0: "#0b1426", bg1: "#070b14", ink: "#E9EEFB", ink2: "#A6B1CC", ink3: "#7C88A8", sig: "#9FE7F5", good: "#3DDC97", warn: "#FFC857", bad: "#FF6B6B", h: "#2399B3", a: "#C4732A", d: "#8569D1", line: "rgba(43,58,93,.9)", card: "rgba(18,27,48,.88)" };
const ez = x => { x = Math.max(0, Math.min(1, x)); return 1 - Math.pow(1 - x, 3); };

// ---------- Kit de dessin ----------
function kit(x, W, H) {
  // tall (9:16) : zones couvertes par l'interface des Shorts, Reels et TikTok (haut ≈ 200 px, bas ≈ 330 px) laissées libres
  const u = Math.min(W, H) / 1080, land = W > H, tall = H / W > 1.6, pad = (land ? 90 : 64) * u, top = pad + (tall ? 110 * u : 0);
  const F = (w, s) => `${w} ${s * u}px "Unbounded","Segoe UI",sans-serif`, P = (w, s) => `${w} ${s * u}px "IBM Plex Sans","Segoe UI",sans-serif`;
  const K = { x, W, H, u, land, tall, pad, top, barY: tall ? 128 * u : 22 * u, F, P, bb: null, hb: null, fb: null, _hf: 0, base: 1 };
  // Emprises : corps de la diapo (bb), en-tête (hb), pied avec logo et avertissement (fb)
  const ext = (b, x0, y0, x1, y1) => { b.x0 = Math.min(b.x0, x0); b.y0 = Math.min(b.y0, y0); b.x1 = Math.max(b.x1, x1); b.y1 = Math.max(b.y1, y1); };
  K.mark = (x0, y0, x1, y1) => { const b = K._hf === 1 ? K.hb : K._hf === 2 ? K.fb : K.bb; if (b) ext(b, x0, y0, x1, y1); };
  const zone = (z, fn) => { const prev = K._hf; K._hf = z; x.save(); x.setTransform(K.base, 0, 0, K.base, 0, 0); try { return fn(); } finally { x.restore(); K._hf = prev; } };
  K.bg = () => { const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, C_.bg0); g.addColorStop(1, C_.bg1); x.fillStyle = g; x.fillRect(0, 0, W, H);
    const r = x.createRadialGradient(W * 0.82, H * 0.08, 10, W * 0.82, H * 0.08, Math.max(W, H) * 0.7); r.addColorStop(0, `rgba(${C_.glow},.16)`); r.addColorStop(1, `rgba(${C_.glow},0)`); x.fillStyle = r; x.fillRect(0, 0, W, H);
    x.strokeStyle = `rgba(${C_.glow},.06)`; x.lineWidth = 2 * u; x.beginPath(); x.arc(W / 2, H * 0.62, Math.min(W, H) * 0.34, 0, 7); x.stroke(); x.beginPath(); x.moveTo(0, H * 0.62); x.lineTo(W, H * 0.62); x.stroke(); };
  K.text = (s, X, Y, font, col = C_.ink, align = "left", maxW = 0, alpha = 1) => { x.save(); x.globalAlpha = alpha; x.font = font; x.fillStyle = col; x.textAlign = align; x.textBaseline = "alphabetic";
    let t = String(s ?? ""); if (maxW) while (t.length > 3 && x.measureText(t).width > maxW) t = t.slice(0, -2).trimEnd() + "…"; x.fillText(t, X, Y);
    if (t) { const fs = +(/([\d.]+)px/.exec(font) || [0, 30])[1], w = x.measureText(t).width, l = align === "center" ? X - w / 2 : align === "right" ? X - w : X; K.mark(l, Y - fs * 0.8, l + w, Y + fs * 0.25); } x.restore(); };
  K.wrap = (s, X, Y, font, maxW, lh, col = C_.ink2, maxLines = 3, alpha = 1) => { x.save(); x.font = font; const words = String(s).split(" "), lines = []; let cur = "";
    for (const w of words) { const t = cur ? cur + " " + w : w; if (x.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; } if (cur) lines.push(cur);
    const L = lines.slice(0, maxLines); if (lines.length > maxLines) L[maxLines - 1] = L[maxLines - 1].replace(/\s*\S*$/, "…"); x.restore(); L.forEach((l, i) => K.text(l, X, Y + i * lh, font, col, "left", 0, alpha)); return L.length * lh; };
  K.card = (X, Y, w, h, alpha = 1, accent) => { K.mark(X, Y, X + w, Y + h); x.save(); x.globalAlpha = alpha; x.fillStyle = C_.card; x.beginPath(); x.roundRect(X, Y, w, h, 26 * u); x.fill(); x.strokeStyle = C_.line; x.lineWidth = 2 * u; x.stroke();
    if (accent) { x.fillStyle = accent; x.beginPath(); x.roundRect(X, Y, 7 * u, h, [26 * u, 0, 0, 26 * u]); x.fill(); } x.restore(); };
  K.ring = (cx, cy, r, p, col, k = 1, label, lw = 12) => { K.mark(cx - r - lw * u / 2, cy - r - lw * u / 2, cx + r + lw * u / 2, cy + r + lw * u / 2); x.save(); x.lineCap = "round"; x.lineWidth = lw * u; x.strokeStyle = "rgba(124,136,168,.25)"; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke();
    x.strokeStyle = col; x.beginPath(); x.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * p * k); x.stroke(); x.restore();
    K.text(label ?? `${Math.round(p * k * 100)}%`, cx, cy + r * 0.2, F("500", r / u * 0.52), C_.ink, "center"); };
  K.tri = (X, Y, w, h, ps, labs, k = 1) => { K.mark(X, Y, X + w, Y + h); const cols = [C_.good, C_.ink3, "#7FA3FF"]; let cx = X; const gap = 6 * u;
    ps.forEach((p, i) => { const ww = Math.max(0, (w - 2 * gap) * p * k); x.fillStyle = cols[i]; x.beginPath(); x.roundRect(cx, Y, ww, h, h / 2); x.fill(); cx += ww + gap; });
    const ty = Y + h + 64 * u; ps.forEach((p, i) => { const al = ["left", "center", "right"][i], tx = [X, X + w / 2, X + w][i];
      K.text(`${Math.round(p * k * 100)}%`, tx, ty, F("600", 54), C_.ink, al); K.text(labs[i], tx, ty + 40 * u, P("500", 28), C_.ink2, al, w / 3.2); }); };
  K.bar = (X, Y, w, h, p, col, k = 1) => { K.mark(X, Y, X + w, Y + h); x.fillStyle = "rgba(124,136,168,.18)"; x.beginPath(); x.roundRect(X, Y, w, h, h / 2); x.fill(); x.fillStyle = col; x.beginPath(); x.roundRect(X, Y, Math.max(h, w * p * k), h, h / 2); x.fill(); };
  K.head = (...a) => zone(1, () => head(...a));
  const head = (eyebrow, title, k = 1, sub) => { const y0 = top + 40 * u; K.text(String(eyebrow).toUpperCase(), pad, y0, P("600", 30), C_.sig, "left", 0, k);
    let fs = land ? 74 : 84; x.font = F("600", fs); while (fs > 46 && x.measureText(title).width > W - 2 * pad) { fs -= 2; x.font = F("600", fs); }
    K.text(title, pad, y0 + (land ? 92 : 104) * u - (1 - k) * 30 * u, F("600", fs), C_.ink, "left", W - 2 * pad, k);
    if (sub) K.text(sub, pad, y0 + (land ? 146 : 162) * u, P("500", 34), C_.ink2, "left", W - 2 * pad, k);
    return y0 + (sub ? (land ? 190 : 210) : (land ? 140 : 160)) * u; };
  K.foot = () => zone(2, foot);
  const foot = () => { const y = tall ? H - 330 * u : H - pad - (land ? 10 : 46) * u; x.fillStyle = C_.sig; x.beginPath(); x.roundRect(pad, y - 54 * u, 58 * u, 58 * u, 13 * u); x.fill();
    K.mark(pad, y - 54 * u, pad + 58 * u, y + 4 * u); K.text("λ", pad + 29 * u, y - 12 * u, F("700", 34), C_.markInk, "center"); K.text("Lambda 90", pad + 76 * u, y - 13 * u, F("600", 34), C_.ink);
    if (S.studio.handle) { x.font = F("600", 34); const wb = x.measureText("Lambda 90").width; K.text("· @" + String(S.studio.handle).replace(/^@/, "").slice(0, 30), pad + 76 * u + wb + 14 * u, y - 13 * u, P("600", 28), C_.sig); }
    const disc = "Probabilités, pas de certitudes · 18+ · Jouer comporte des risques : 09 74 75 13 13";
    if (land) K.text(disc, W - pad, y - 16 * u, P("400", 21), C_.ink3, "right"); else K.text(disc, pad, y + 40 * u, P("400", 22), C_.ink3, "left", W - 2 * pad); return y - 80 * u; };
  // Police ajustée : la plus grande taille (entre max et min) qui tient dans maxW
  K.fitF = (s, w, max, min, maxW, fam = F) => { let fs = max; x.font = fam(w, fs); while (fs > min && x.measureText(String(s)).width > maxW) { fs -= 2; x.font = fam(w, fs); } return fam(w, fs); };
  return K;
}
const stA = (t, i, d = 0.12) => ez((t * ST_DUR - 0.25 - i * d * ST_DUR / 3) / 0.55);   // apparition échelonnée

// ---------- Modèles (données réelles de la plateforme) ----------
function stDayTop() { const D = DAILY[parisDay()]; return D?.top?.length ? D.top : livePicks(); }
function stMatch() { return FXK[S.studio.match] && !started(FXK[S.studio.match]) ? FXK[S.studio.match] : (FX.find(f => !started(f) && fairOf(f)) || FX[0]); }
function stTemplate(tpl) {
  const today = parisDay(), dLab = new Date(today + "T12:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  if (tpl === "top") {
    const T = stDayTop().slice(0, Math.min(S.topN || 8, ["short", "portrait"].includes(S.studio.fmt) ? 8 : 6));
    const rows = T.map(x => ({ x, f: fxOf(x), sel: SELF(fxOf(x), x.sel) }));
    const list = { name: "Le Top", draw(K, t) { const y0 = K.head(dLab, `Top ${rows.length} du jour`, stA(t, 0), "Les sélections les plus solides"); const yE = K.foot(), n = Math.max(1, rows.length), rh = Math.min(150 * K.u, (yE - y0) / n), w = K.W - 2 * K.pad;
      rows.forEach((r, i) => { const a = stA(t, i + 1), y = y0 + i * rh, xx = K.pad + (1 - a) * 80 * K.u; K.card(xx, y + 6 * K.u, w, rh - 16 * K.u, a);
        K.text(String(i + 1), xx + 40 * K.u, y + rh * 0.62, K.F("500", 56), C_.good, "center", 0, a); K.text(r.sel, xx + 96 * K.u, y + rh * 0.45, K.P("600", 38), C_.ink, "left", w - 300 * K.u, a);
        K.text(`${short(r.f.home)} – ${short(r.f.away)} · cote ${odd(r.x.o)}`, xx + 96 * K.u, y + rh * 0.45 + 40 * K.u, K.P("400", 27), C_.ink3, "left", w - 300 * K.u, a);
        K.ring(xx + w - 80 * K.u, y + rh / 2 - 4 * K.u, Math.min(46 * K.u, rh * 0.32), r.x.p, C_.good, a); }); } };
    const det = rows.map((r, i) => ({ name: r.sel, draw(K, t) { const y0 = K.head(`Top ${i + 1} · ${LG[r.x.league] || ""}`, r.sel, stA(t, 0), `${short(r.f.home)} – ${short(r.f.away)} · ${kickLab(r.x.kick)}`); const yE = K.foot(), u = K.u, av = yE - y0;
      const side = K.land || av < 780 * u, R = side ? Math.min(190 * u, av / 2 - 70 * u, (K.W - 2 * K.pad) * 0.19) : Math.min(210 * u, (av - 540 * u) / 2);
      const cx = side ? K.pad + R + 20 * u : K.W / 2, cy = side ? y0 + R + 40 * u : y0 + R + 40 * u; K.ring(cx, cy, R, r.x.p, C_.good, stA(t, 1), null, 22);
      K.text("de chances selon Lambda 90", cx, cy + R + 58 * u, K.P("500", side ? 26 : 30), C_.ink2, "center", side ? 2 * R + 60 * u : 0, stA(t, 1));
      const why = r.f._ghost ? [] : argsFor(r.f, r.x.sel, r.x).slice(0, 3), bx = side ? cx + R + 80 * u : K.pad, by = side ? y0 + 50 * u : cy + R + 140 * u, bw = side ? K.W - bx - K.pad : K.W - 2 * K.pad;
      K.text(`Cote ${odd(r.x.o)} · ${(r.x.book || "").replace(" (FR)", "")}`, bx, by, K.F("500", 40), C_.sig, "left", bw, stA(t, 2)); let yy = by + 60 * K.u;
      const fs = side && !K.land ? 27 : 30, lh = (fs + 9) * u; why.forEach((w_, j) => { yy += K.wrap("• " + w_, bx, yy, K.P("500", fs), bw, lh, C_.ink2, side && !K.land ? 4 : 3, stA(t, 3 + j)) + 14 * u; }); } }));
    return { slides: [list, ...det], subject: `Top ${rows.length} du ${dLab}`, lines: rows.map((r, i) => `${i + 1}. ${r.sel} (${short(r.f.home)} – ${short(r.f.away)}) : ${pct(r.x.p)}, cote ${odd(r.x.o)}`) };
  }
  if (tpl === "combos") {
    const CB = (DAILY[today]?.combos || []).slice(0, 4); if (!CB.length) return { empty: "Les combinés sont publiés avec le registre du matin." };
    const slides = CB.map((c, ci) => ({ name: c.lab, draw(K, t) { const y0 = K.head(dLab, c.lab, stA(t, 0), `${c.legs.length} sélections · cote ${odd(c.o)} · ${(c.book || "").replace(" (FR)", "")}`); const yE = K.foot();
      const u = K.u, av = yE - y0, side = K.land || av < 1000 * u, R = side ? Math.min(150 * u, av / 2 - 60 * u) : 170 * u;
      const cx = side ? K.W - K.pad - R - 20 * u : K.W / 2, cy = y0 + R + (side ? 40 : 30) * u; K.ring(cx, cy, R, c.p, C_.good, stA(t, 1), null, 20);
      K.text(`1 chance sur ${nf(1 / c.p, 1)}`, cx, cy + R + 56 * u, K.P("600", 30), C_.ink2, "center", 0, stA(t, 1));
      const lx = K.pad, ly = side ? y0 + 30 * u : cy + R + 120 * u, lw = side ? cx - R - 70 * u - K.pad : K.W - 2 * K.pad, rh = Math.min((side ? 130 : 180) * u, (yE - ly) / c.legs.length);
      c.legs.forEach((l, i) => { const a = stA(t, 2 + i * 0.5), y = ly + i * rh, f = fxOf(l); K.card(lx, y, lw, rh - 14 * K.u, a, C_.sig); K.text(SELF(f, l.sel), lx + 30 * K.u, y + rh * 0.42, K.P("600", 34), C_.ink, "left", lw - 60 * K.u, a);
        K.text(`${short(f.home)} – ${short(f.away)} · ${pct(l.p)}`, lx + 30 * K.u, y + rh * 0.42 + 38 * K.u, K.P("400", 26), C_.ink3, "left", lw - 60 * K.u, a); }); } }));
    return { slides, subject: `Les combinés du ${dLab}`, lines: CB.map(c => `${c.lab} : ${c.legs.map(l => SELF(fxOf(l), l.sel)).join(" + ")} · cote ${odd(c.o)} · ${pct(c.p)}`) };
  }
  if (tpl === "recap") {
    const L = dayRecap().last; if (!L) return { empty: "Pas encore de journée réglée : le premier bilan arrive avec les premiers résultats." };
    const dl = new Date(L.d + "T12:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    const s1 = { name: "Bilan", draw(K, t) { const y0 = K.head(dl, "Le bilan", stA(t, 0)); const yE = K.foot(), cx = K.land ? K.pad + 260 * K.u : K.W / 2, cy = y0 + (K.land ? 260 : 300) * K.u;
      K.ring(cx, cy, 220 * K.u, L.w / L.n, C_.good, stA(t, 1), `${Math.round(L.w * stA(t, 1))}/${L.n}`, 26); const tx = K.land ? cx + 320 * K.u : K.pad, ty = K.land ? cy - 40 * K.u : cy + 320 * K.u;
      K.text("picks justes", tx, ty, K.F("600", 64), C_.ink, "left", 0, stA(t, 2)); K.text(`Résultat 1N2 : ${L.rw}/${L.rn} · Double chance : ${L.dw}/${L.rn}`, tx, ty + 60 * K.u, K.P("500", 34), C_.ink2, "left", K.W - tx - K.pad, stA(t, 2));
      const ly = K.land ? cy + 260 * K.u : ty + 120 * K.u, n = Math.min(L.T.length, Math.floor((yE - ly) / (78 * K.u))), lw = K.W - 2 * K.pad;
      L.T.slice(0, n).forEach((r, i) => { const a = stA(t, 3 + i * 0.5), y = ly + i * 78 * K.u; K.card(K.pad, y, lw, 64 * K.u, a); K.text(`${short(r.home)}  ${r.hg}-${r.ag}  ${short(r.away)}`, K.pad + 28 * K.u, y + 44 * K.u, K.P("600", 30), C_.ink, "left", lw - 120 * K.u, a);
        K.x.globalAlpha = a; K.x.fillStyle = r.won ? C_.good : C_.bad; K.x.beginPath(); K.x.arc(K.pad + lw - 40 * K.u, y + 32 * K.u, 18 * K.u, 0, 7); K.x.fill(); K.x.globalAlpha = 1; }); } };
    return { slides: [s1], subject: `Bilan du ${dl} : ${L.w}/${L.n}`, lines: L.T.map(r => `${short(r.home)} ${r.hg}-${r.ag} ${short(r.away)} : ${r.won ? "gagné" : "perdu"}`) };
  }
  if (tpl === "match") {
    const f = stMatch(); if (!f) return { empty: "Aucun match." };
    const M = mktMatrix(f) || f.m.M, J = fn => L90.joint(M, [fn]), H = J((i, j) => i > j), D = J((i, j) => i === j), A = 1 - H - D, O = J((i, j) => i + j > 2), BY = J((i, j) => i > 0 && j > 0);
    const h = short(f.home), a = short(f.away), tw = twinsOf(f), sc = []; for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) sc.push([`${i}-${j}`, M[i * 11 + j]]); sc.sort((p, q) => q[1] - p[1]);
    const ins = keyInsights(f).slice(0, 3), pr = propsOf(f), ttl = `${h} – ${a}`, sub = `${LG[f.league]} · ${dayName(f.date)} ${f.time || ""}`;
    const fav = H >= A ? [h, H] : [a, A];
    const slides = [
      { name: "Affiche", draw(K, t) { K.head(sub, "Avant-match", stA(t, 0)); const yE = K.foot(), cy = K.H * (K.land ? 0.5 : 0.42);
        K.text(h, K.W / 2, cy - 70 * K.u, K.fitF(h, "600", K.land ? 96 : 88, 50, K.W - 2 * K.pad), C_.ink, "center", K.W - 2 * K.pad, stA(t, 1)); K.text("contre", K.W / 2, cy, K.P("500", 36), C_.ink3, "center", 0, stA(t, 2));
        K.text(a, K.W / 2, cy + 100 * K.u, K.fitF(a, "600", K.land ? 96 : 88, 50, K.W - 2 * K.pad), C_.ink, "center", K.W - 2 * K.pad, stA(t, 3)); K.text(`Favori : ${fav[0]} (${pct(fav[1])})`, K.W / 2, cy + 200 * K.u, K.P("600", 36), C_.sig, "center", 0, stA(t, 4)); } },
      { name: "Résultat", draw(K, t) { const y0 = K.head(ttl, "Qui gagne ?", stA(t, 0)); K.foot(); const w = K.W - 2 * K.pad;
        const yE = K.H - K.pad - 160 * K.u, yb = y0 + (yE - y0) * (K.land ? 0.15 : 0.32);
        K.tri(K.pad, yb, w, 36 * K.u, [H, D, A], [h, "Nul", a], stA(t, 1));
        K.wrap("Probabilités du marché Pinnacle sans marge, matrice des scores du modèle Lambda 90 recalée dessus.", K.pad, yb + 280 * K.u, K.P("400", 28), w, 38 * K.u, C_.ink3, 2, stA(t, 3)); } },
      { name: "Buts", draw(K, t) { const y0 = K.head(ttl, "Combien de buts ?", stA(t, 0)); const yE = K.foot(), R = 150 * K.u, cy = y0 + (K.land ? 260 : 300) * K.u, xs = K.land ? [K.W * 0.3, K.W * 0.7] : [K.W * 0.28, K.W * 0.72];
        K.ring(xs[0], cy, R, O, C_.warn, stA(t, 1)); K.text("Plus de 2,5 buts", xs[0], cy + R + 60 * K.u, K.P("600", 32), C_.ink, "center", 0, stA(t, 1));
        K.ring(xs[1], cy, R, BY, C_.warn, stA(t, 2)); K.text("Les deux marquent", xs[1], cy + R + 60 * K.u, K.P("600", 32), C_.ink, "center", 0, stA(t, 2));
        K.text(`${nf(f.lam, 2)} – ${nf(f.mu, 2)} buts attendus`, K.W / 2, cy + R + 150 * K.u, K.F("500", 40), C_.sig, "center", 0, stA(t, 3)); } },
      { name: "Scores", draw(K, t) { const y0 = K.head(ttl, "Les scores les plus probables", stA(t, 0)); K.foot(); const w = K.W - 2 * K.pad, mx = sc[0][1];
        const step = Math.min((K.land ? 120 : 190) * K.u, (K.H - K.pad - 200 * K.u - y0) / 5.2);
        sc.slice(0, 5).forEach(([s, p], i) => { const a_ = stA(t, 1 + i * 0.6), y = y0 + 40 * K.u + i * step; K.text(s, K.pad, y + 52 * K.u, K.F("600", 56), C_.ink, "left", 0, a_);
          K.bar(K.pad + 200 * K.u, y + 18 * K.u, w - 380 * K.u, 40 * K.u, p / mx, C_.h, a_); K.text(pct(p, 1), K.pad + w, y + 52 * K.u, K.F("500", 40), C_.ink2, "right", 0, a_); }); } },
      ...(tw ? [{ name: "Jumeaux", draw(K, t) { const y0 = K.head(ttl, "Ses jumeaux historiques", stA(t, 0), `${tw.n} matchs passés aux cotes les plus proches`); K.foot(); const w = K.W - 2 * K.pad;
        const yb = y0 + (K.H - K.pad - 200 * K.u - y0) * (K.land ? 0.12 : 0.28);
        K.tri(K.pad, yb, w, 36 * K.u, [tw.H, tw.D, tw.A], [h, "Nul", a], stA(t, 1));
        K.wrap(`${nf(tw.goals, 2)} buts par match · plus de 2,5 : ${pct(tw.O25)} · les deux marquent : ${pct(tw.BY)}`, K.pad, yb + 280 * K.u, K.P("600", 32), w, 44 * K.u, C_.ink, 2, stA(t, 3));
        K.wrap(`Scores fréquents : ${tw.top.map(([s, n]) => `${s} (${pct(n / tw.n)})`).join(" · ")}`, K.pad, yb + 380 * K.u, K.P("500", 30), w, 42 * K.u, C_.ink2, 2, stA(t, 4)); } }] : []),
      ...(pr?.corners?.known ? [{ name: "Corners", draw(K, t) { const y0 = K.head(ttl, "Corners et cartons", stA(t, 0)); K.foot(); const R = 140 * K.u, cy = y0 + 260 * K.u, xs = [K.W * 0.28, K.W * 0.72];
        const pc = 1 - nbCdf(9, pr.corners.h + pr.corners.a, pr.corners.r), pk = nbCdf(4, pr.cartons.h + pr.cartons.a, pr.cartons.r);
        K.ring(xs[0], cy, R, pc, C_.warn, stA(t, 1)); K.text("Plus de 9,5 corners", xs[0], cy + R + 60 * K.u, K.P("600", 30), C_.ink, "center", 0, stA(t, 1));
        K.ring(xs[1], cy, R, pk, C_.warn, stA(t, 2)); K.text("Moins de 4,5 cartons", xs[1], cy + R + 60 * K.u, K.P("600", 30), C_.ink, "center", 0, stA(t, 2));
        K.text(`${nf(pr.corners.h + pr.corners.a, 1)} corners et ${nf(pr.cartons.h + pr.cartons.a, 1)} cartons attendus`, K.W / 2, cy + R + 140 * K.u, K.P("500", 30), C_.ink2, "center", 0, stA(t, 3)); } }] : []),
      { name: "À retenir", draw(K, t) { const y0 = K.head(ttl, "À retenir", stA(t, 0)); K.foot(); const w = K.W - 2 * K.pad; let y = y0 + 30 * K.u;
        ins.forEach(([tt, xx], i) => { const a_ = stA(t, 1 + i); K.text(tt, K.pad, y + 40 * K.u, K.F("500", 38), C_.sig, "left", w, a_); y += 60 * K.u; y += K.wrap(xx, K.pad, y + 30 * K.u, K.P("500", 31), w, 42 * K.u, C_.ink2, K.land ? 2 : 4, a_) + 40 * K.u; }); } }
    ];
    return { slides, subject: `${ttl} : probabilités et analyse`, lines: [`${h} ${pct(H)} · nul ${pct(D)} · ${a} ${pct(A)}`, `Plus de 2,5 buts ${pct(O)} · les deux marquent ${pct(BY)}`, `Score le plus probable : ${sc[0][0]} (${pct(sc[0][1], 1)})`, ...ins.map(([tt, xx]) => `${tt} : ${xx}`)] };
  }
  if (tpl === "hotcold") {
    const D = DAILY[today] || {}, hot = (D.hot || []).slice(0, 4), cold = (D.cold || []).slice(0, 4); if (!hot.length && !cold.length) return { empty: "Hot et Cold sont publiés avec le registre du matin." };
    const mk = (lst, ttl, col, line) => ({ name: ttl, draw(K, t) { const y0 = K.head(dLab, ttl, stA(t, 0)); const yE = K.foot(), n = Math.max(1, lst.length), rh = Math.min((K.land ? 200 : 300) * K.u, (yE - y0) / n), w = K.W - 2 * K.pad;
      lst.forEach((x, i) => { const a = stA(t, 1 + i), y = y0 + i * rh, f = fxOf(x); K.card(K.pad, y + 8 * K.u, w, rh - 22 * K.u, a, col); const l = line(x, f);
        K.text(l[0], K.pad + 36 * K.u, y + 70 * K.u, K.P("600", 38), C_.ink, "left", w - 300 * K.u, a); K.wrap(l[1], K.pad + 36 * K.u, y + 118 * K.u, K.P("400", 28), w - 80 * K.u, 38 * K.u, C_.ink2, Math.max(1, Math.floor((rh - 150 * K.u) / (38 * K.u))), a);
        if (l[2]) K.text(l[2], K.pad + w - 30 * K.u, y + 70 * K.u, K.F("500", 40), col, "right", 0, a); }); } });
    const slides = []; if (hot.length) slides.push(mk(hot, "Hot Picks", C_.warn, (x, f) => [SELF(f, x.sel), `${short(f.home)} – ${short(f.away)} · juste ${odd(1 / x.pm)} · ${sgn(x.ev)}`, odd(x.o)]));
    if (cold.length) slides.push(mk(cold, "Cold Games", "#7FA3FF", (x, f) => [`${short(f.home)} – ${short(f.away)}`, COLD_WHY(x.why[0], f), `alerte ${nf(x.score, 1)}`]));
    return { slides, subject: `Hot Picks et matchs à éviter du ${dLab}`, lines: [...hot.map(x => { const f = fxOf(x); return `Hot : ${SELF(f, x.sel)} (${short(f.home)} – ${short(f.away)}) à ${odd(x.o)}`; }), ...cold.map(x => { const f = fxOf(x); return `Cold : ${short(f.home)} – ${short(f.away)}`; })] };
  }
  if (tpl === "survivor") {
    const R = S.surv.run, B = DB ? svRows("monde").slice(0, 6) : []; if (!R && !B.length) return { empty: "Lance une partie dans l'onglet Survivant." };
    const slides = [];
    if (R) slides.push({ name: "Ma partie", draw(K, t) { const y0 = K.head(`Survivant · jour ${Math.floor((Date.now() - R.ts) / 864e5) + 1}`, R.status === "over" ? "Game Over" : "Toujours en vie", stA(t, 0)); const yE = K.foot();
      K.text(eur(R.bank * stA(t, 1)), K.pad, y0 + 140 * K.u, K.F("600", 120), R.status === "over" ? C_.bad : C_.ink, "left", 0, stA(t, 1));
      K.text(`départ ${eur(R.cap)} · ×${nf(R.bank / R.cap, 2)} · pic ${eur(R.peak)}`, K.pad, y0 + 200 * K.u, K.P("500", 34), C_.ink2, "left", 0, stA(t, 2));
      const cv = R.curve || [R.cap], gx = K.pad, gy = y0 + 270 * K.u, gw = K.W - 2 * K.pad, gh = Math.max(160 * K.u, yE - gy - 40 * K.u), mx = Math.max(...cv, R.cap * 1.2), n = cv.length, k = stA(t, 3); K.mark(gx, gy, gx + gw, gy + gh);
      K.x.strokeStyle = "rgba(255,107,107,.6)"; K.x.lineWidth = 2 * K.u; K.x.beginPath(); K.x.moveTo(gx, gy + gh); K.x.lineTo(gx + gw, gy + gh); K.x.stroke();
      K.x.strokeStyle = C_.sig; K.x.lineWidth = 6 * K.u; K.x.beginPath(); cv.slice(0, Math.max(2, Math.ceil(n * k))).forEach((v, i) => { const X = gx + gw * i / Math.max(1, n - 1), Y = gy + gh * (1 - v / mx); i ? K.x.lineTo(X, Y) : K.x.moveTo(X, Y); }); K.x.stroke(); } });
    if (B.length) slides.push({ name: "Classement", draw(K, t) { const y0 = K.head("Survivant", "Classement Monde", stA(t, 0)); const yE = K.foot(), rh = Math.min(130 * K.u, (yE - y0) / B.length), w = K.W - 2 * K.pad;
      B.forEach((r, i) => { const a = stA(t, 1 + i * 0.6), y = y0 + i * rh; K.card(K.pad, y + 6 * K.u, w, rh - 16 * K.u, a); K.text(String(i + 1), K.pad + 44 * K.u, y + rh * 0.6, K.F("500", 48), i < 3 ? C_.warn : C_.ink3, "center", 0, a);
        K.text(r.pseudo, K.pad + 100 * K.u, y + rh * 0.5, K.P("600", 36), C_.ink, "left", w * 0.45, a); K.text(r.city, K.pad + 100 * K.u, y + rh * 0.5 + 36 * K.u, K.P("400", 26), C_.ink3, "left", w * 0.45, a);
        K.text(`×${nf(r.bank / r.cap, 2)}`, K.pad + w - 30 * K.u, y + rh * 0.6, K.F("500", 44), r.status === "alive" ? C_.good : C_.bad, "right", 0, a); }); } });
    return { slides, subject: R ? `Survivant : ${eur(R.bank)} après ${R.bets.length} paris` : "Classement Survivant", lines: [R ? `Bankroll ${eur(R.bank)} (départ ${eur(R.cap)}), ${R.status === "over" ? "Game Over" : "toujours en vie"}` : "", ...B.map((r, i) => `${i + 1}. ${r.pseudo} (${r.city || "?"}) ×${nf(r.bank / r.cap, 2)}`)].filter(Boolean) };
  }
  if (tpl === "season") {
    const lg = S.studio.lg, sim = EXTRA.sims[lg]; if (!sim) return { empty: "Pas de simulation pour ce championnat." };
    const n = sim.teams.length, rel = 3, title = [...sim.teams].sort((p, q) => q.p[0] - p.p[0]).slice(0, 5), down = [...sim.teams].map(x => ({ ...x, r: x.p.slice(-rel).reduce((s, v) => s + v, 0) })).sort((p, q) => q.r - p.r).slice(0, 5);
    const mk = (lst, ttl, val, col) => ({ name: ttl, draw(K, t) { const y0 = K.head(`${LG[lg]} · ${nf(sim.N)} saisons simulées`, ttl, stA(t, 0)); const yE = K.foot(), w = K.W - 2 * K.pad, rh = Math.min(140 * K.u, (yE - y0) / 5), mx = Math.max(...lst.map(val));
      lst.forEach((x, i) => { const a = stA(t, 1 + i * 0.6), y = y0 + i * rh; K.text(short(x.team), K.pad, y + 50 * K.u, K.P("600", 38), C_.ink, "left", w * 0.6, a); K.text(pct(val(x), val(x) < 0.1 ? 1 : 0), K.pad + w, y + 50 * K.u, K.F("500", 40), col, "right", 0, a);
        K.bar(K.pad, y + 72 * K.u, w, 22 * K.u, val(x) / mx, col, a); }); } });
    return { slides: [mk(title, "Qui sera champion ?", x => x.p[0], C_.good), mk(down, `Les ${rel} relégables`, x => x.r, C_.bad)], subject: `${LG[lg]} : titre et relégation selon ${nf(sim.N)} simulations`,
      lines: [...title.map(x => `Titre ${short(x.team)} : ${pct(x.p[0], 1)}`), ...down.map(x => `Relégation ${short(x.team)} : ${pct(x.r)}`)] };
  }
  if (tpl === "proof") {
    const bt = INS.backtest_top; if (!bt) return { empty: "Données de validation absentes." };
    const s = { name: "Calibration", draw(K, t) { const y0 = K.head(`${nf(bt.n)} picks rejoués sur 2025-26`, "Nos probabilités tiennent", stA(t, 0), "Annoncé → réalisé, par niveau de confiance"); const yE = K.foot(), w = K.W - 2 * K.pad, rh = Math.min(170 * K.u, (yE - y0) / bt.par_conf.length);
      bt.par_conf.forEach((c, i) => { const a = stA(t, 1 + i * 0.7), y = y0 + i * rh, u = K.u; K.text(`Annoncé ${c.lab}`, K.pad, y + 40 * u, K.P("600", 32), C_.ink, "left", w * 0.46, a);
        K.text(`${pct(c.p)} → ${pct(c.hit)} · ${c.n} picks`, K.pad + w, y + 40 * u, K.P("500", 26), C_.ink2, "right", w * 0.52, a);
        K.bar(K.pad, y + 60 * u, w, 20 * u, c.p, C_.ink3, a); K.bar(K.pad, y + 88 * u, w, 20 * u, c.hit, C_.good, a); }); } };
    return { slides: [s], subject: "Nos probabilités tiennent : la preuve sur une saison", lines: bt.par_conf.map(c => `${c.lab} annoncé : ${pct(c.hit, 1)} réalisé sur ${c.n} picks`) };
  }
  if (tpl === "value") {
    const acc = {}; for (const f of FX) { if (started(f)) continue; for (const [b, o] of Object.entries(S.odds[f.key] || {})) { if (!["H", "D", "A"].every(k => o[k] > 1) || NOT_BOOK(b)) continue; (acc[b] ??= []).push(L90.overround([o.H, o.D, o.A])); } }
    const rows = Object.entries(acc).filter(([b]) => isSharp(b) || S.cfg.myBooks.includes(b)).map(([b, v]) => [b.replace(" (FR)", ""), avg(v), v.length]).sort((p, q) => p[1] - q[1]);
    if (!rows.length) return { empty: "Pas de cotes chargées." };
    const s = { name: "Marges", draw(K, t) { const y0 = K.head(dLab, "Ce que prend ton bookmaker", stA(t, 0), "Marge moyenne sur le 1N2"); const yE = K.foot(), w = K.W - 2 * K.pad, rh = Math.min(150 * K.u, (yE - y0) / rows.length), mx = Math.max(...rows.map(r => r[1]));
      rows.forEach(([b, m, n], i) => { const a = stA(t, 1 + i * 0.6), y = y0 + i * rh; K.text(b, K.pad, y + 50 * K.u, K.P("600", 38), C_.ink, "left", 0, a); K.text(pct(m, 1), K.pad + w, y + 50 * K.u, K.F("500", 40), i === 0 ? C_.good : C_.ink2, "right", 0, a);
        K.bar(K.pad, y + 72 * K.u, w, 22 * K.u, m / mx, i === 0 ? C_.good : C_.a, a); }); } };
    const slides = [s], lines = rows.map(([b, m, n]) => `${b} : ${pct(m, 1)} de marge sur ${n} matchs`);
    const mm = L13?.meme_marque || [];
    if (mm.length) { slides.push({ name: "France contre étranger", draw(K, t) { const y0 = K.head("Même bookmaker, autre pays", "La taxe France", stA(t, 0), "Marge moyenne sur le 1N2"); const yE = K.foot(), w = K.W - 2 * K.pad, rh = Math.min(220 * K.u, (yE - y0) / mm.length), mx = Math.max(...mm.map(r => r.marge_fr));
      mm.forEach((r, i) => { const a = stA(t, 1 + i * 0.7), y = y0 + i * rh, u = K.u, cc = r.etranger.replace(/.*\((\w+)\)/, "$1"); K.text(r.fr.replace(" (FR)", ""), K.pad, y + 44 * u, K.P("600", 36), C_.ink, "left", w * 0.6, a); K.text(`+${nf((r.marge_fr - r.marge_etranger) * 100, 1)} pts en France`, K.pad + w, y + 44 * u, K.F("500", 34), C_.bad, "right", w * 0.4, a);
        K.bar(K.pad, y + 66 * u, w, 22 * u, r.marge_fr / mx, C_.bad, a); K.text(`France ${pct(r.marge_fr, 1)}`, K.pad, y + 122 * u, K.P("500", 26), C_.ink2, "left", 0, a);
        K.bar(K.pad, y + 134 * u, w, 22 * u, r.marge_etranger / mx, C_.good, a); K.text(`${cc} ${pct(r.marge_etranger, 1)}`, K.pad, y + 190 * u, K.P("500", 26), C_.ink2, "left", 0, a); }); } });
      lines.push(...mm.map(r => `${r.fr} : ${pct(r.marge_fr, 1)} en France contre ${pct(r.marge_etranger, 1)} (${r.etranger})`)); }
    const lv = bookLive().filter(r => S.cfg.myBooks.includes(r.b));
    if (lv.length >= 2) { const pick = k => lv.filter(r => r.ev[k] != null).sort((a, b) => b.ev[k] - a.ev[k]);
      slides.push({ name: "Où jouer quoi", draw(K, t) { const y0 = K.head(dLab, "Où jouer quoi", stA(t, 0), "Ce que rend chaque bookmaker, par type de pari"); const yE = K.foot(), w = K.W - 2 * K.pad, rh = Math.min(200 * K.u, (yE - y0) / BK_PROF.length);
        BK_PROF.forEach(([k, l], i) => { const a = stA(t, 1 + i * 0.6), y = y0 + i * rh, u = K.u, P_ = pick(k), b0 = P_[0], b1 = P_[P_.length - 1]; if (!b0) return; K.card(K.pad, y + 6 * u, w, rh - 18 * u, a, C_.sig);
          K.text(l, K.pad + 30 * u, y + 56 * u, K.P("600", 34), C_.ink, "left", w * 0.4, a); K.text(`${b0.b.replace(" (FR)", "")} ${sgn(b0.ev[k])}`, K.pad + w - 30 * u, y + 56 * u, K.F("500", 32), C_.good, "right", w * 0.55, a);
          if (b1 && b1 !== b0) K.text(`le plus cher : ${b1.b.replace(" (FR)", "")} ${sgn(b1.ev[k])}`, K.pad + w - 30 * u, y + 100 * u, K.P("500", 26), C_.ink3, "right", w * 0.7, a); }); } });
      lines.push(...BK_PROF.map(([k, l]) => { const P_ = pick(k); return P_[0] ? `${l} : ${P_[0].b} (${sgn(P_[0].ev[k])})` : ""; }).filter(Boolean)); }
    return { slides, subject: "Quel bookmaker te coûte le moins ?", lines };
  }
  return { empty: "Modèle inconnu." };
}
// Probabilité cumulée binomiale négative (Poisson si r absent)
function nbCdf(k, mu, r) { if (!r) return poisCdf(k, mu); let p = Math.pow(r / (r + mu), r), s = p; for (let i = 0; i < k; i++) { p *= (i + r) / (i + 1) * mu / (r + mu); s += p; } return s; }

// ---------- Textes d'accompagnement ----------
function stTexts(T, fmt) {
  const tag = { combos: "#combine #pronostics #football", top: "#pronostics #football #paris", recap: "#bilan #pronostics #football", match: "#avantmatch #football #pronostic", hotcold: "#paris #cotes #football", survivor: "#survivant #challenge #football", season: "#football #simulation #classement", proof: "#data #football #probabilites", value: "#cotes #bookmakers #paris" }[S.studio.tpl];
  let t = 0; const chap = T.slides.map(s => { const m = Math.floor(t / 60), sc = Math.floor(t % 60); t += ST_DUR; return `${m}:${String(sc).padStart(2, "0")} ${s.name}`; });
  const body = T.lines.join("\n");
  return {
    titre: fmt === "yt" ? `${T.subject} | Lambda 90` : `${T.subject}`,
    description: `${T.subject}\n\n${body}\n\n${fmt === "yt" ? "Chapitres\n" + chap.join("\n") + "\n\n" : ""}Probabilités calculées par Lambda 90 : marché Pinnacle sans marge et modèle Dixon-Coles, tirs cadrés, pi-ratings. Des probabilités, pas des certitudes.\nJouer comporte des risques : endettement, isolement, dépendance. Pour être aidé, appelez le 09 74 75 13 13 (appel non surtaxé). Interdit aux mineurs.`,
    legende: `${T.subject} 👇\n\n${T.lines.slice(0, 6).join("\n")}\n\nDes probabilités, pas des certitudes. 18+ · Jouer comporte des risques : 09 74 75 13 13\n${tag} #lambda90`,
    script: T.slides.map((s, i) => `[${chap[i].split(" ")[0]}] ${s.name} : ${T.lines[i] || T.lines[0] || ""}`).join("\n")
  };
}

// ---------- Thèmes ----------
const ST_THEMES = {
  nuit: { glow: "159,231,245", markInk: "#06212A", bg0: "#0b1426", bg1: "#070b14", ink: "#E9EEFB", ink2: "#A6B1CC", ink3: "#7C88A8", sig: "#9FE7F5", good: "#3DDC97", warn: "#FFC857", bad: "#FF6B6B", h: "#2399B3", a: "#C4732A", card: "rgba(18,27,48,.88)", line: "rgba(43,58,93,.9)" },
  ardoise: { glow: "255,200,87", markInk: "#1a1205", bg0: "#1b1d22", bg1: "#0e0f12", ink: "#F3F1EC", ink2: "#BDB8AC", ink3: "#8E8A80", sig: "#FFC857", good: "#7BE495", warn: "#FFC857", bad: "#FF7A6B", h: "#5AB0C8", a: "#E0894A", card: "rgba(36,38,44,.9)", line: "rgba(80,80,90,.7)" },
  clair: { glow: "14,116,144", markInk: "#FFFFFF", bg0: "#F7F9FC", bg1: "#E6EBF4", ink: "#0B1220", ink2: "#3D4A66", ink3: "#6B7690", sig: "#0E7490", good: "#0F9D6B", warn: "#B7791F", bad: "#D64545", h: "#1F7A93", a: "#B5651D", card: "rgba(255,255,255,.92)", line: "rgba(16,24,40,.14)" }
};
const ST_TPL_DESC = { top: "Les meilleures sélections du jour", combos: "Les combinés figés du matin", recap: "Le score de la veille, en toute transparence", match: "Probabilités, buts, scores, jumeaux", hotcold: "Les bons prix et les pièges du jour",
  survivor: "Ta partie et le classement", season: "Titre et relégation, 10 000 saisons", proof: "Annoncé contre réalisé", value: "Ce que chaque bookmaker prélève" };
// Accroche facultative en ouverture (les 2 premières secondes décident d'un Short)
function stWithHook(T) {
  const hk = String(S.studio.hook || "").trim(); if (!hk || T.empty) return T;
  return { ...T, slides: [{ name: "Accroche", draw(K, t) { const a = stA(t, 0), cy = K.H * 0.45; K.wrap(hk, K.pad, cy - 60 * K.u, K.F("600", K.land ? 84 : 92), K.W - 2 * K.pad, (K.land ? 100 : 110) * K.u, C_.ink, 4, a);
    K.x.fillStyle = C_.sig; K.x.globalAlpha = a; K.mark(K.pad, cy - 150 * K.u, K.pad + 120 * K.u, cy - 140 * K.u); K.x.fillRect(K.pad, cy - 150 * K.u, 120 * K.u * a, 10 * K.u); K.x.globalAlpha = 1; K.foot(); } }, ...T.slides] };
}
// ---------- Rendu, lecture, export ----------
// Zone sûre : le corps de chaque diapo est mesuré dans son état final puis, s'il déborde sur l'en-tête, le pied (logo, avertissement) ou les bords,
// remonté et réduit juste ce qu'il faut. Aucun texte ne recouvre le logo ni la mention 18+, quel que soit le format.
const ST_MX = document.createElement("canvas"); ST_MX.width = ST_MX.height = 4;
function stLayout(slide, fk) {
  const key = `${fk}|${document.fonts?.status || ""}`; if (slide._fit?.key === key) return slide._fit;
  const f = ST_FMT[fk], K = kit(ST_MX.getContext("2d"), f.w, f.h), I = () => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  K.bb = I(); K.hb = I(); K.fb = I(); slide.draw(K, 1);
  const u = K.u, b = K.bb, TL = (isFinite(K.hb.y1) ? K.hb.y1 : K.pad) + 26 * u, BL = (isFinite(K.fb.y0) ? K.fb.y0 : f.h - K.pad) - 26 * u, LL = K.pad - 6 * u, RL = f.w - K.pad + 6 * u;
  let s = 1, tx = 0, ty = 0;
  if (isFinite(b.y0) && (b.y0 < TL || b.y1 > BL || b.x0 < LL || b.x1 > RL)) {
    const h = b.y1 - b.y0, w = b.x1 - b.x0; s = Math.min(1, (BL - TL) / h, (RL - LL) / w);
    const ny = Math.max(TL, Math.min(b.y0, BL - h * s)), cx = (b.x0 + b.x1) / 2, nx = Math.abs(cx - f.w / 2) < f.w * 0.04 ? f.w / 2 - w * s / 2 : Math.max(LL, Math.min(b.x0, RL - w * s));
    tx = nx - b.x0 * s; ty = ny - b.y0 * s; }
  else if (!K.land && isFinite(b.y0)) { const h = b.y1 - b.y0, room = BL - TL - h; if (room > (K.tall ? 120 : 160) * u) ty = Math.max(0, TL + room * 0.32 - b.y0); }
  return slide._fit = { key, s, tx, ty, raw: { ...b }, TL, BL, LL, RL, head: { ...K.hb }, foot: { ...K.fb } };
}
function stDrawFrame(cv, T, time, scale = 1) {
  Object.assign(C_, ST_THEMES[S.studio.theme] || ST_THEMES.nuit);
  const f = ST_FMT[S.studio.fmt], x = cv.getContext("2d"); x.setTransform(scale, 0, 0, scale, 0, 0);
  const K = kit(x, f.w, f.h); K.base = scale; K.bg(); const n = T.slides.length, i = Math.min(n - 1, Math.floor(time / ST_DUR)), t = (time - i * ST_DUR) / ST_DUR;
  const L = stLayout(T.slides[i], S.studio.fmt); x.setTransform(scale * L.s, 0, 0, scale * L.s, scale * L.tx, scale * L.ty);
  T.slides[i].draw(K, Math.max(0, Math.min(1, t))); x.setTransform(scale, 0, 0, scale, 0, 0);
  if (n > 1) { const bw = (f.w - 2 * K.pad) / n; for (let k = 0; k < n; k++) { x.fillStyle = k < i ? C_.sig : k === i ? C_.sig : C_.line; x.globalAlpha = k === i ? 0.85 : k < i ? 1 : 0.6; x.fillRect(K.pad + k * bw + 3 * K.u, K.barY, bw - 6 * K.u, 6 * K.u); } x.globalAlpha = 1; }
  return i;
}
function stCur() { const T = stWithHook(stTemplate(S.studio.tpl)); return T; }
function renderStudio() {
  ST_DUR = Math.max(2, Math.min(8, +S.studio.dur || 3.8));
  const s = S.studio, f = ST_FMT[s.fmt], T = stCur(), up = FX.filter(m => !started(m)), TX = T.empty ? null : stTexts(T, s.fmt), tot = T.empty ? 0 : T.slides.length * ST_DUR;
  STX.T = T; STX.TX = TX; if (STX.slide >= (T.slides?.length || 1)) STX.slide = 0; if (!STX.playing) STX.time = Math.min(STX.time ?? (ST_DUR - 0.01), Math.max(0, tot - 0.01));
  const avail = Object.fromEntries(Object.keys(ST_TPL).map(k => [k, k === s.tpl ? !T.empty : !stTemplate(k).empty]));
  const ed = k => STX.edits?.[`${s.tpl}|${s.fmt}|${k}`] ?? TX?.[k] ?? "";
  $("#v-studio").innerHTML = `<div class="studio-app">
    <aside class="st-lib" aria-label="Contenus">
      <div class="st-h"><span class="eyebrow">Studio</span><strong>Contenus</strong></div>
      <div class="st-cards">${Object.entries(ST_TPL).map(([k, v]) => `<button class="st-card" data-sttpl="${k}" aria-pressed="${s.tpl === k}" ${avail[k] ? "" : 'data-off="1"'}><b>${v}</b><span>${avail[k] ? ST_TPL_DESC[k] : "Pas encore disponible"}</span></button>`).join("")}</div>
      ${s.tpl === "match" ? `<label class="f">Match<select data-stsel="match">${up.slice(0, 80).map(m => `<option value="${esc(m.key)}" ${stMatch()?.key === m.key ? "selected" : ""}>${esc(short(m.home))} – ${esc(short(m.away))} · ${esc(m.date.slice(8))}/${esc(m.date.slice(5, 7))}</option>`).join("")}</select></label>` : ""}
      ${s.tpl === "season" ? `<label class="f">Championnat<select data-stsel="lg">${Object.entries(LG).map(([k, v]) => `<option value="${k}" ${s.lg === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>` : ""}
      <div class="st-h" style="margin-top:6px"><strong>Personnaliser</strong></div>
      <label class="f">Accroche d'ouverture<input type="text" id="st-hook" maxlength="90" data-stin="hook" value="${esc(s.hook)}" placeholder="ex. 3 matchs à ne pas jouer ce soir"></label>
      <label class="f">Ton compte<input type="text" id="st-handle" maxlength="30" data-stin="handle" value="${esc(s.handle)}" placeholder="@toncompte"></label>
      <div class="chips" role="group" aria-label="Thème">${Object.keys(ST_THEMES).map(k => `<button class="chip" data-sttheme="${k}" aria-pressed="${s.theme === k}">${{ nuit: "Nuit", ardoise: "Ardoise", clair: "Clair" }[k]}</button>`).join("")}</div>
      <label class="f">Durée par diapo : <b id="st-durv">${nf(ST_DUR, 1)} s</b><input type="range" min="2" max="8" step="0.2" id="st-dur" data-stin="dur" value="${ST_DUR}"></label>
    </aside>
    <section class="st-center" aria-label="Aperçu">
      <div class="st-stage" id="st-stage">${T.empty ? `<div class="empty">${esc(T.empty)}</div>` : `<canvas id="stc" aria-label="Aperçu ${esc(ST_TPL[s.tpl])}"></canvas>`}</div>
      ${T.empty ? "" : `<div class="st-tl"><button class="btn primary st-play" data-stact="play" aria-label="${STX.playing ? "Pause" : "Lecture"}">${STX.playing ? "❚❚" : "▶"}</button>
        <input type="range" id="st-scrub" min="0" max="${tot.toFixed(2)}" step="0.05" value="${(STX.time || 0).toFixed(2)}" aria-label="Position"><span class="num faint" id="st-time">${nf(STX.time || 0, 1)} / ${nf(tot, 1)} s</span></div>
      <div class="st-strip" id="st-strip">${T.slides.map((sl, i) => `<button class="st-th" data-stslide="${i}" aria-pressed="${i === STX.slide}" title="${esc(sl.name)}"><canvas data-thumb="${i}"></canvas><span>${i + 1}. ${esc(sl.name)}</span></button>`).join("")}</div>`}
    </section>
    <aside class="st-out" aria-label="Export">
      <div class="st-h"><strong>Format</strong></div>
      <div class="st-fmts">${Object.entries(ST_FMT).map(([k, v]) => `<button class="st-fmt" data-stfmt="${k}" aria-pressed="${s.fmt === k}"><i style="aspect-ratio:${v.w}/${v.h}"></i><b>${v.ratio}</b><span>${v.lab}</span></button>`).join("")}</div>
      ${T.empty ? "" : `<div class="st-h"><strong>Exporter</strong><span class="faint">${f.w}×${f.h}</span></div>
      <div class="st-exp"><button class="btn" data-stact="png">Image</button>${T.slides.length > 1 ? `<button class="btn" data-stact="zip">Carrousel · ${T.slides.length}</button>` : ""}
        <button class="btn primary" data-stact="video">${STX.rec ? `Enregistrement ${Math.round((STX.recP || 0) * 100)} %` : `Vidéo · ${nf(tot, 0)} s`}</button><button class="btn" data-stact="pack">Pack complet</button></div>
      <p class="note">Vidéo ${typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.("video/mp4") ? "MP4" : "WebM (YouTube l'accepte ; à convertir en MP4 pour Instagram)"} à 30 images/s. Pack : toutes les images et les textes dans une archive.</p>
      <div class="st-h"><strong>Textes</strong></div>
      <div class="chips" role="tablist">${[["titre", "Titre"], ["legende", "Légende"], ["description", "Description"], ["script", "Script"]].map(([k, l]) => `<button class="chip" data-sttxt="${k}" aria-pressed="${(STX.txt || "legende") === k}">${l}</button>`).join("")}</div>
      <textarea class="st-ta" id="st-ta" data-stedit="${STX.txt || "legende"}" spellcheck="true">${esc(ed(STX.txt || "legende"))}</textarea>
      <div class="row"><button class="btn small" data-stcopy="${STX.txt || "legende"}">Copier</button><span class="note">Modifiable avant de copier.</span></div>`}
      <p class="note">Chaque visuel porte la mention 18+ et le numéro d'aide. Vérifie les règles de la plateforme de diffusion sur les contenus de paris.</p>
    </aside></div>`;
  if (!T.empty) { stFit(); stThumbs(); STX.dirty = true; stLoop(); }
}
// Le canevas d'aperçu épouse la place disponible (format entier visible, net sur écran haute densité)
function stFit() {
  const st = $("#st-stage"), cv = $("#stc"); if (!st || !cv) return; const f = ST_FMT[S.studio.fmt];
  if (innerWidth < 980) st.style.height = Math.round(Math.min(innerHeight * 0.72, (st.clientWidth - 24) * f.h / f.w + 24)) + "px"; else st.style.height = "";
  const W = st.clientWidth - 24, H = st.clientHeight - 24, k = Math.max(0.05, Math.min(W / f.w, H / f.h)), dpr = Math.min(2, devicePixelRatio || 1);
  cv.style.width = Math.round(f.w * k) + "px"; cv.style.height = Math.round(f.h * k) + "px";
  const iw = Math.round(Math.min(f.w, f.w * k * dpr)); if (cv.width !== iw) { cv.width = iw; cv.height = Math.round(f.h * iw / f.w); }
  STX.scale = iw / f.w; STX.dirty = true;
  if (!STX.ro) { STX.ro = new ResizeObserver(() => { if (S.tab === "studio") stFit(); }); } STX.ro.disconnect(); STX.ro.observe(st);
}
function stThumbs() {
  const T = STX.T, f = ST_FMT[S.studio.fmt], run = () => document.querySelectorAll("[data-thumb]").forEach(c => { const i = +c.dataset.thumb, h = 64, w = Math.round(h * f.w / f.h); c.width = w * 2; c.height = h * 2; c.style.width = w + "px"; c.style.height = h + "px"; stDrawFrame(c, T, i * ST_DUR + ST_DUR - 0.01, (w * 2) / f.w); });
  (window.requestIdleCallback || (fn => setTimeout(fn, 60)))(run);
}
function stLoop() {
  if (STX.raf) return; STX.last = performance.now();
  const step = now => { const cv = $("#stc"); if (!cv || S.tab !== "studio" || !STX.T?.slides) { STX.raf = 0; return; }
    const T = STX.T, tot = T.slides.length * ST_DUR, dt = (now - STX.last) / 1000; STX.last = now;
    if (STX.playing) { STX.time = (STX.time || 0) + dt; if (STX.time >= tot) STX.time = 0; STX.dirty = true; }
    if (STX.dirty) { const i = stDrawFrame(cv, T, Math.min(STX.time || 0, tot - 0.01), STX.scale || 0.5); STX.dirty = false;
      if (i !== STX.slide) { STX.slide = i; document.querySelectorAll("[data-stslide]").forEach(b => b.setAttribute("aria-pressed", +b.dataset.stslide === i)); $(`[data-stslide="${i}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" }); }
      const sc = $("#st-scrub"); if (sc && document.activeElement !== sc) sc.value = (STX.time || 0).toFixed(2); const tt = $("#st-time"); if (tt) tt.textContent = `${nf(STX.time || 0, 1)} / ${nf(tot, 1)} s`; }
    STX.raf = requestAnimationFrame(step); };
  STX.raf = requestAnimationFrame(step);
}
async function stSave(blob, name) {
  const dl = await hostUse("downloads"); if (!dl) { const u = URL.createObjectURL(blob); if (!window.open(u, "_blank")) toast("Téléchargement indisponible dans cette vue"); return; }
  try { await dl.save({ filename: name, data: blob }); } catch (e) { if (e?.code !== "cancelled") toast("Téléchargement refusé"); }
}
const stName = ext => `lambda90-${S.studio.tpl}-${S.studio.fmt}-${parisDay()}.${ext}`;
function stFull(i) { const f = ST_FMT[S.studio.fmt], c = document.createElement("canvas"); c.width = f.w; c.height = f.h; stDrawFrame(c, STX.T, i * ST_DUR + ST_DUR - 0.01, 1); return c; }
let JSZIP_P = null;
function loadZip() { return JSZIP_P ??= new Promise((ok, ko) => { if (window.JSZip) return ok(window.JSZip); const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"; s.onload = () => ok(window.JSZip); s.onerror = () => { JSZIP_P = null; ko(); }; document.head.append(s); }); }
const toBlob = c => new Promise(r => c.toBlob(r, "image/png"));
async function stAction(a) {
  const T = STX.T; if (!T || T.empty) return; await document.fonts?.ready;
  if (a === "play") { STX.playing = !STX.playing; if (STX.playing) { const i = Math.floor((STX.time || 0) / ST_DUR); STX.time = (STX.time || 0) >= (i + 1) * ST_DUR - 0.05 ? i * ST_DUR : STX.time; if (STX.time >= T.slides.length * ST_DUR - 0.05) STX.time = 0; } const b = $(".st-play"); if (b) { b.textContent = STX.playing ? "❚❚" : "▶"; b.setAttribute("aria-label", STX.playing ? "Pause" : "Lecture"); } return; }
  if (a === "png") { stSave(await toBlob(stFull(STX.slide)), stName("png")); return; }
  if (a === "zip" || a === "pack") { let Z; try { Z = await loadZip(); } catch { toast("Archive indisponible : export image par image"); for (let i = 0; i < T.slides.length; i++) await stSave(await toBlob(stFull(i)), stName(`${i + 1}.png`)); return; }
    const z = new Z(); for (let i = 0; i < T.slides.length; i++) z.file(`${String(i + 1).padStart(2, "0")}-${T.slides[i].name.replace(/[^\p{L}\d]+/gu, "-")}.png`, await toBlob(stFull(i)));
    if (a === "pack") { const ed = k => STX.edits?.[`${S.studio.tpl}|${S.studio.fmt}|${k}`] ?? STX.TX[k]; for (const k of ["titre", "legende", "description", "script"]) z.file(`${k}.txt`, ed(k)); }
    stSave(await z.generateAsync({ type: "blob" }), stName("zip")); return; }
  if (a === "video") {
    if (STX.rec) return; if (typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream) { toast("Export vidéo non pris en charge par ce navigateur"); return; }
    const f = ST_FMT[S.studio.fmt], c = document.createElement("canvas"); c.width = f.w; c.height = f.h;
    const type = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find(t => MediaRecorder.isTypeSupported(t)); if (!type) { toast("Aucun format vidéo disponible"); return; }
    const rec = new MediaRecorder(c.captureStream(30), { mimeType: type, videoBitsPerSecond: 10e6 }), chunks = [], t0 = performance.now(), tot = T.slides.length * ST_DUR;
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    rec.onstop = () => { STX.rec = null; STX.recP = 0; render(); stSave(new Blob(chunks, { type }), stName(type.includes("mp4") ? "mp4" : "webm")); };
    STX.rec = rec; rec.start(250); toast(`Enregistrement de ${nf(tot)} secondes…`);
    const btn = $('[data-stact="video"]'); const loop = () => { const time = (performance.now() - t0) / 1000; STX.recP = time / tot; if (btn) btn.textContent = `Enregistrement ${Math.min(99, Math.round(STX.recP * 100))} %`;
      if (time >= tot) { rec.stop(); return; } stDrawFrame(c, T, time, 1); requestAnimationFrame(loop); }; loop();
  }
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-sttpl],[data-stfmt],[data-stact],[data-stcopy],[data-studio],[data-sttheme],[data-stslide],[data-sttxt]"); if (!b) return; const d = b.dataset;
  if (d.studio) { Object.assign(S.studio, JSON.parse(d.studio)); ls.set("studio", S.studio); STX.slide = 0; STX.time = ST_DUR - 0.01; go("studio"); return; }
  if (d.stact) { stAction(d.stact); return; }
  if (d.stslide != null) { STX.playing = false; STX.time = +d.stslide * ST_DUR + ST_DUR - 0.01; STX.dirty = true; const pb = $(".st-play"); if (pb) pb.textContent = "▶"; return; }
  if (d.stcopy) { const v = $("#st-ta")?.value ?? ""; navigator.clipboard?.writeText(v).then(() => toast("Copié"), () => toast("Copie impossible : sélectionne le texte")); return; }
  if (d.sttxt) { STX.txt = d.sttxt; }
  else if (d.sttpl) { if (b.dataset.off) { toast("Ce contenu n'a pas encore de données"); } S.studio.tpl = d.sttpl; STX.slide = 0; STX.time = ST_DUR - 0.01; STX.playing = false; }
  else if (d.stfmt) S.studio.fmt = d.stfmt;
  else if (d.sttheme) S.studio.theme = d.sttheme;
  ls.set("studio", S.studio); render();
});
document.addEventListener("input", e => { const d = e.target.dataset;
  if (e.target.id === "st-scrub") { STX.playing = false; STX.time = +e.target.value; STX.dirty = true; const pb = $(".st-play"); if (pb) pb.textContent = "▶"; return; }
  if (d.stedit) { (STX.edits ??= {})[`${S.studio.tpl}|${S.studio.fmt}|${d.stedit}`] = e.target.value; return; }
  if (d.stin) { S.studio[d.stin] = d.stin === "dur" ? +e.target.value : e.target.value; ls.set("studio", S.studio);
    if (d.stin === "dur") { ST_DUR = +e.target.value; const v = $("#st-durv"); if (v) v.textContent = nf(ST_DUR, 1) + " s"; }
    clearTimeout(window._stin); window._stin = setTimeout(() => deferRender(e.target), d.stin === "dur" ? 250 : 400); } });
document.addEventListener("change", e => { const d = e.target.dataset; if (d.stsel == null) return; S.studio[d.stsel] = e.target.value; ls.set("studio", S.studio); STX.slide = 0; STX.time = ST_DUR - 0.01; render(); });
