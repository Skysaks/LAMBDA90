// ---------- Studio : contenus prêts à publier (YouTube, Shorts, Reels, TikTok, posts, carrousels) depuis toutes les parties de la plateforme ----------
const ST_FMT = { short: { w: 1080, h: 1920, lab: "Short · Reel · TikTok · Story", ratio: "9:16" }, yt: { w: 1920, h: 1080, lab: "YouTube", ratio: "16:9" },
  post: { w: 1080, h: 1080, lab: "Post carré", ratio: "1:1" }, portrait: { w: 1080, h: 1350, lab: "Post portrait · carrousel", ratio: "4:5" } };
const ST_TPL = { top: "Top du jour", recap: "Bilan de la veille", match: "Avant-match", hotcold: "Hot & Cold", survivor: "Survivant", season: "Saison simulée", proof: "Nos probabilités tiennent", value: "Le prix des bookmakers" };
const ST_DUR = 3.8;
S.studio = Object.assign({ tpl: "top", fmt: "short", match: null, lg: "fr.1" }, ls.get("studio", {}));
const STX = { t0: 0, playing: false, raf: 0, rec: null, slide: 0 };
const C_ = { bg0: "#0b1426", bg1: "#070b14", ink: "#E9EEFB", ink2: "#A6B1CC", ink3: "#7C88A8", sig: "#9FE7F5", good: "#3DDC97", warn: "#FFC857", bad: "#FF6B6B", h: "#2399B3", a: "#C4732A", d: "#8569D1", line: "rgba(43,58,93,.9)", card: "rgba(18,27,48,.88)" };
const ez = x => { x = Math.max(0, Math.min(1, x)); return 1 - Math.pow(1 - x, 3); };

// ---------- Kit de dessin ----------
function kit(x, W, H) {
  const u = Math.min(W, H) / 1080, land = W > H, pad = (land ? 90 : 64) * u;
  const F = (w, s) => `${w} ${s * u}px "Unbounded","Segoe UI",sans-serif`, P = (w, s) => `${w} ${s * u}px "IBM Plex Sans","Segoe UI",sans-serif`;
  const K = { x, W, H, u, land, pad, F, P };
  K.bg = () => { const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, C_.bg0); g.addColorStop(1, C_.bg1); x.fillStyle = g; x.fillRect(0, 0, W, H);
    const r = x.createRadialGradient(W * 0.82, H * 0.08, 10, W * 0.82, H * 0.08, Math.max(W, H) * 0.7); r.addColorStop(0, "rgba(159,231,245,.16)"); r.addColorStop(1, "rgba(159,231,245,0)"); x.fillStyle = r; x.fillRect(0, 0, W, H);
    x.strokeStyle = "rgba(159,231,245,.05)"; x.lineWidth = 2 * u; x.beginPath(); x.arc(W / 2, H * 0.62, Math.min(W, H) * 0.34, 0, 7); x.stroke(); x.beginPath(); x.moveTo(0, H * 0.62); x.lineTo(W, H * 0.62); x.stroke(); };
  K.text = (s, X, Y, font, col = C_.ink, align = "left", maxW = 0, alpha = 1) => { x.save(); x.globalAlpha = alpha; x.font = font; x.fillStyle = col; x.textAlign = align; x.textBaseline = "alphabetic";
    let t = String(s ?? ""); if (maxW) while (t.length > 3 && x.measureText(t).width > maxW) t = t.slice(0, -2).trimEnd() + "…"; x.fillText(t, X, Y); x.restore(); };
  K.wrap = (s, X, Y, font, maxW, lh, col = C_.ink2, maxLines = 3, alpha = 1) => { x.save(); x.font = font; const words = String(s).split(" "), lines = []; let cur = "";
    for (const w of words) { const t = cur ? cur + " " + w : w; if (x.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; } if (cur) lines.push(cur);
    const L = lines.slice(0, maxLines); if (lines.length > maxLines) L[maxLines - 1] = L[maxLines - 1].replace(/\s*\S*$/, "…"); x.restore(); L.forEach((l, i) => K.text(l, X, Y + i * lh, font, col, "left", 0, alpha)); return L.length * lh; };
  K.card = (X, Y, w, h, alpha = 1, accent) => { x.save(); x.globalAlpha = alpha; x.fillStyle = C_.card; x.beginPath(); x.roundRect(X, Y, w, h, 26 * u); x.fill(); x.strokeStyle = C_.line; x.lineWidth = 2 * u; x.stroke();
    if (accent) { x.fillStyle = accent; x.beginPath(); x.roundRect(X, Y, 7 * u, h, [26 * u, 0, 0, 26 * u]); x.fill(); } x.restore(); };
  K.ring = (cx, cy, r, p, col, k = 1, label, lw = 12) => { x.save(); x.lineCap = "round"; x.lineWidth = lw * u; x.strokeStyle = "rgba(124,136,168,.25)"; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke();
    x.strokeStyle = col; x.beginPath(); x.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * p * k); x.stroke(); x.restore();
    K.text(label ?? `${Math.round(p * k * 100)}%`, cx, cy + r * 0.2, F("500", r / u * 0.52), C_.ink, "center"); };
  K.tri = (X, Y, w, h, ps, labs, k = 1) => { const cols = [C_.good, C_.ink3, "#7FA3FF"]; let cx = X; const gap = 6 * u;
    ps.forEach((p, i) => { const ww = Math.max(0, (w - 2 * gap) * p * k); x.fillStyle = cols[i]; x.beginPath(); x.roundRect(cx, Y, ww, h, h / 2); x.fill(); cx += ww + gap; });
    const ty = Y + h + 64 * u; ps.forEach((p, i) => { const al = ["left", "center", "right"][i], tx = [X, X + w / 2, X + w][i];
      K.text(`${Math.round(p * k * 100)}%`, tx, ty, F("600", 54), C_.ink, al); K.text(labs[i], tx, ty + 40 * u, P("500", 28), C_.ink2, al, w / 3.2); }); };
  K.bar = (X, Y, w, h, p, col, k = 1) => { x.fillStyle = "rgba(124,136,168,.18)"; x.beginPath(); x.roundRect(X, Y, w, h, h / 2); x.fill(); x.fillStyle = col; x.beginPath(); x.roundRect(X, Y, Math.max(h, w * p * k), h, h / 2); x.fill(); };
  K.head = (eyebrow, title, k = 1, sub) => { const y0 = pad + 40 * u; K.text(String(eyebrow).toUpperCase(), pad, y0, P("600", 30), C_.sig, "left", 0, k);
    let fs = land ? 74 : 84; x.font = F("600", fs); while (fs > 46 && x.measureText(title).width > W - 2 * pad) { fs -= 2; x.font = F("600", fs); }
    K.text(title, pad, y0 + (land ? 92 : 104) * u - (1 - k) * 30 * u, F("600", fs), C_.ink, "left", W - 2 * pad, k);
    if (sub) K.text(sub, pad, y0 + (land ? 146 : 162) * u, P("500", 34), C_.ink2, "left", W - 2 * pad, k);
    return y0 + (sub ? (land ? 190 : 210) : (land ? 140 : 160)) * u; };
  K.foot = () => { const y = H - pad - (land ? 10 : 46) * u; x.fillStyle = C_.sig; x.beginPath(); x.roundRect(pad, y - 54 * u, 58 * u, 58 * u, 13 * u); x.fill();
    K.text("λ", pad + 29 * u, y - 12 * u, F("700", 34), "#06212A", "center"); K.text("Lambda 90", pad + 76 * u, y - 13 * u, F("600", 34), C_.ink);
    const disc = "Probabilités, pas de certitudes · 18+ · Jouer comporte des risques : 09 74 75 13 13";
    if (land) K.text(disc, W - pad, y - 16 * u, P("400", 21), C_.ink3, "right"); else K.text(disc, pad, y + 40 * u, P("400", 22), C_.ink3, "left", W - 2 * pad); return y - 80 * u; };
  return K;
}
const stA = (t, i, d = 0.12) => ez((t * ST_DUR - 0.25 - i * d * ST_DUR / 3) / 0.55);   // apparition échelonnée

// ---------- Modèles (données réelles de la plateforme) ----------
function stDayTop() { const D = DAILY[parisDay()]; return D?.top?.length ? D.top : livePicks(); }
function stMatch() { return FXK[S.studio.match] && !started(FXK[S.studio.match]) ? FXK[S.studio.match] : (FX.find(f => !started(f) && fairOf(f)) || FX[0]); }
function stTemplate(tpl) {
  const today = parisDay(), dLab = new Date(today + "T12:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  if (tpl === "top") {
    const T = stDayTop().slice(0, 6);
    const rows = T.map(x => ({ x, f: fxOf(x), sel: SELF(fxOf(x), x.sel) }));
    const list = { name: "Le Top", draw(K, t) { const y0 = K.head(dLab, `Top ${rows.length} du jour`, stA(t, 0), "Les sélections les plus solides"); const yE = K.foot(), n = Math.max(1, rows.length), rh = Math.min(150 * K.u, (yE - y0) / n), w = K.W - 2 * K.pad;
      rows.forEach((r, i) => { const a = stA(t, i + 1), y = y0 + i * rh, xx = K.pad + (1 - a) * 80 * K.u; K.card(xx, y + 6 * K.u, w, rh - 16 * K.u, a);
        K.text(String(i + 1), xx + 40 * K.u, y + rh * 0.62, K.F("500", 56), C_.good, "center", 0, a); K.text(r.sel, xx + 96 * K.u, y + rh * 0.45, K.P("600", 38), C_.ink, "left", w - 300 * K.u, a);
        K.text(`${short(r.f.home)} – ${short(r.f.away)} · cote ${odd(r.x.o)}`, xx + 96 * K.u, y + rh * 0.45 + 40 * K.u, K.P("400", 27), C_.ink3, "left", w - 300 * K.u, a);
        K.ring(xx + w - 80 * K.u, y + rh / 2 - 4 * K.u, Math.min(46 * K.u, rh * 0.32), r.x.p, C_.good, a); }); } };
    const det = rows.map((r, i) => ({ name: r.sel, draw(K, t) { const y0 = K.head(`Top ${i + 1} · ${LG[r.x.league] || ""}`, r.sel, stA(t, 0), `${short(r.f.home)} – ${short(r.f.away)} · ${kickLab(r.x.kick)}`); const yE = K.foot();
      const cy = y0 + (yE - y0) * (K.land ? 0.45 : 0.32), R = (K.land ? 190 : 210) * K.u, cx = K.land ? K.pad + R + 40 * K.u : K.W / 2; K.ring(cx, cy, R, r.x.p, C_.good, stA(t, 1), null, 22);
      K.text("de chances selon Lambda 90", cx, cy + R + 64 * K.u, K.P("500", 30), C_.ink2, "center", 0, stA(t, 1));
      const why = r.f._ghost ? [] : argsFor(r.f, r.x.sel, r.x).slice(0, 3), bx = K.land ? cx + R + 120 * K.u : K.pad, by = K.land ? y0 + 40 * K.u : cy + R + 130 * K.u, bw = K.land ? K.W - bx - K.pad : K.W - 2 * K.pad;
      K.text(`Cote ${odd(r.x.o)} · ${(r.x.book || "").replace(" (FR)", "")}`, bx, by, K.F("500", 40), C_.sig, "left", bw, stA(t, 2)); let yy = by + 60 * K.u;
      why.forEach((w_, j) => { yy += K.wrap("• " + w_, bx, yy, K.P("500", 30), bw, 40 * K.u, C_.ink2, 3, stA(t, 3 + j)) + 14 * K.u; }); } }));
    return { slides: [list, ...det], subject: `Top ${rows.length} du ${dLab}`, lines: rows.map((r, i) => `${i + 1}. ${r.sel} (${short(r.f.home)} – ${short(r.f.away)}) : ${pct(r.x.p)}, cote ${odd(r.x.o)}`) };
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
        K.text(h, K.W / 2, cy - 70 * K.u, K.F("600", K.land ? 96 : 88), C_.ink, "center", K.W - 2 * K.pad, stA(t, 1)); K.text("contre", K.W / 2, cy, K.P("500", 36), C_.ink3, "center", 0, stA(t, 2));
        K.text(a, K.W / 2, cy + 100 * K.u, K.F("600", K.land ? 96 : 88), C_.ink, "center", K.W - 2 * K.pad, stA(t, 3)); K.text(`Favori : ${fav[0]} (${pct(fav[1])})`, K.W / 2, cy + 200 * K.u, K.P("600", 36), C_.sig, "center", 0, stA(t, 4)); } },
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
      const cv = R.curve || [R.cap], gx = K.pad, gy = y0 + 270 * K.u, gw = K.W - 2 * K.pad, gh = Math.max(160 * K.u, yE - gy - 40 * K.u), mx = Math.max(...cv, R.cap * 1.2), n = cv.length, k = stA(t, 3);
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
    const s = { name: "Calibration", draw(K, t) { const y0 = K.head(`${nf(bt.n)} picks rejoués sur 2025-26`, "Nos probabilités tiennent", stA(t, 0)); const yE = K.foot(), w = K.W - 2 * K.pad, rh = Math.min(170 * K.u, (yE - y0) / bt.par_conf.length);
      bt.par_conf.forEach((c, i) => { const a = stA(t, 1 + i * 0.7), y = y0 + i * rh; K.text(`Annoncé ${c.lab}`, K.pad, y + 44 * K.u, K.P("600", 32), C_.ink, "left", 0, a); K.text(`${c.n} picks`, K.pad + w, y + 44 * K.u, K.P("400", 26), C_.ink3, "right", 0, a);
        K.bar(K.pad, y + 64 * K.u, w, 22 * K.u, c.p, C_.ink3, a); K.bar(K.pad, y + 96 * K.u, w, 22 * K.u, c.hit, C_.good, a); K.text(`${pct(c.p)} annoncé · ${pct(c.hit)} réalisé`, K.pad, y + 150 * K.u, K.P("500", 26), C_.ink2, "left", 0, a); }); } };
    return { slides: [s], subject: "Nos probabilités tiennent : la preuve sur une saison", lines: bt.par_conf.map(c => `${c.lab} annoncé : ${pct(c.hit, 1)} réalisé sur ${c.n} picks`) };
  }
  if (tpl === "value") {
    const acc = {}; for (const f of FX) { if (started(f)) continue; for (const [b, o] of Object.entries(S.odds[f.key] || {})) { if (!["H", "D", "A"].every(k => o[k] > 1) || NOT_BOOK(b)) continue; (acc[b] ??= []).push(L90.overround([o.H, o.D, o.A])); } }
    const rows = Object.entries(acc).filter(([b]) => isSharp(b) || S.cfg.myBooks.includes(b)).map(([b, v]) => [b.replace(" (FR)", ""), avg(v), v.length]).sort((p, q) => p[1] - q[1]);
    if (!rows.length) return { empty: "Pas de cotes chargées." };
    const s = { name: "Marges", draw(K, t) { const y0 = K.head(dLab, "Ce que prend ton bookmaker", stA(t, 0), "Marge moyenne sur le 1N2"); const yE = K.foot(), w = K.W - 2 * K.pad, rh = Math.min(150 * K.u, (yE - y0) / rows.length), mx = Math.max(...rows.map(r => r[1]));
      rows.forEach(([b, m, n], i) => { const a = stA(t, 1 + i * 0.6), y = y0 + i * rh; K.text(b, K.pad, y + 50 * K.u, K.P("600", 38), C_.ink, "left", 0, a); K.text(pct(m, 1), K.pad + w, y + 50 * K.u, K.F("500", 40), i === 0 ? C_.good : C_.ink2, "right", 0, a);
        K.bar(K.pad, y + 72 * K.u, w, 22 * K.u, m / mx, i === 0 ? C_.good : C_.a, a); }); } };
    return { slides: [s], subject: "Quel bookmaker te coûte le moins ?", lines: rows.map(([b, m, n]) => `${b} : ${pct(m, 1)} de marge sur ${n} matchs`) };
  }
  return { empty: "Modèle inconnu." };
}
// Probabilité cumulée binomiale négative (Poisson si r absent)
function nbCdf(k, mu, r) { if (!r) return poisCdf(k, mu); let p = Math.pow(r / (r + mu), r), s = p; for (let i = 0; i < k; i++) { p *= (i + r) / (i + 1) * mu / (r + mu); s += p; } return s; }

// ---------- Textes d'accompagnement ----------
function stTexts(T, fmt) {
  const tag = { top: "#pronostics #football #paris", recap: "#bilan #pronostics #football", match: "#avantmatch #football #pronostic", hotcold: "#paris #cotes #football", survivor: "#survivant #challenge #football", season: "#football #simulation #classement", proof: "#data #football #probabilites", value: "#cotes #bookmakers #paris" }[S.studio.tpl];
  let t = 0; const chap = T.slides.map(s => { const m = Math.floor(t / 60), sc = Math.floor(t % 60); t += ST_DUR; return `${m}:${String(sc).padStart(2, "0")} ${s.name}`; });
  const body = T.lines.join("\n");
  return {
    titre: fmt === "yt" ? `${T.subject} | Lambda 90` : `${T.subject}`,
    description: `${T.subject}\n\n${body}\n\n${fmt === "yt" ? "Chapitres\n" + chap.join("\n") + "\n\n" : ""}Probabilités calculées par Lambda 90 : marché Pinnacle sans marge et modèle Dixon-Coles, tirs cadrés, pi-ratings. Des probabilités, pas des certitudes.\nJouer comporte des risques : endettement, isolement, dépendance. Pour être aidé, appelez le 09 74 75 13 13 (appel non surtaxé). Interdit aux mineurs.`,
    legende: `${T.subject} 👇\n\n${T.lines.slice(0, 6).join("\n")}\n\nDes probabilités, pas des certitudes. 18+ · Jouer comporte des risques : 09 74 75 13 13\n${tag} #lambda90`,
    script: T.slides.map((s, i) => `[${chap[i].split(" ")[0]}] ${s.name} : ${T.lines[i] || T.lines[0] || ""}`).join("\n")
  };
}

// ---------- Rendu, lecture, export ----------
function stDrawFrame(cv, T, time, scale = 1) {
  const f = ST_FMT[S.studio.fmt], x = cv.getContext("2d"); x.setTransform(scale, 0, 0, scale, 0, 0);
  const K = kit(x, f.w, f.h); K.bg(); const n = T.slides.length, i = Math.min(n - 1, Math.floor(time / ST_DUR)), t = (time - i * ST_DUR) / ST_DUR;
  T.slides[i].draw(K, Math.max(0, Math.min(1, t))); STX.slide = i;
  if (n > 1) { x.fillStyle = "rgba(159,231,245,.25)"; const bw = (f.w - 2 * K.pad) / n; for (let k = 0; k < n; k++) { x.fillStyle = k < i ? C_.sig : k === i ? "rgba(159,231,245,.8)" : "rgba(124,136,168,.3)"; x.fillRect(K.pad + k * bw + 3 * K.u, 22 * K.u, bw - 6 * K.u, 6 * K.u); } }
}
function renderStudio() {
  const s = S.studio, f = ST_FMT[s.fmt], T = stTemplate(s.tpl), up = FX.filter(m => !started(m));
  const TX = T.empty ? null : stTexts(T, s.fmt);
  $("#v-studio").innerHTML = `<div class="stack">
    <div><span class="eyebrow">Création de contenu</span><h1>Studio</h1><p class="lede">Des vidéos et des visuels prêts à publier, tirés des vraies données de la plateforme : YouTube, Shorts, Reels, TikTok, posts et carrousels, avec titre, description, chapitres, légende et script de voix off.</p></div>
    <div class="panel"><div class="studio">
      <div class="st-side">
        <h3>Contenu</h3><div class="chips wrap">${Object.entries(ST_TPL).map(([k, v]) => `<button class="chip" data-sttpl="${k}" aria-pressed="${s.tpl === k}">${v}</button>`).join("")}</div>
        ${s.tpl === "match" ? `<label class="f" style="margin-top:10px">Match<select data-stsel="match">${up.slice(0, 60).map(m => `<option value="${esc(m.key)}" ${stMatch()?.key === m.key ? "selected" : ""}>${esc(short(m.home))} – ${esc(short(m.away))} · ${esc(m.date.slice(5))}</option>`).join("")}</select></label>` : ""}
        ${s.tpl === "season" ? `<label class="f" style="margin-top:10px">Championnat<select data-stsel="lg">${Object.entries(LG).map(([k, v]) => `<option value="${k}" ${s.lg === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>` : ""}
        <h3 style="margin-top:16px">Format</h3><div class="chips wrap">${Object.entries(ST_FMT).map(([k, v]) => `<button class="chip" data-stfmt="${k}" aria-pressed="${s.fmt === k}">${v.lab} <span class="faint">${v.ratio}</span></button>`).join("")}</div>
        ${T.empty ? "" : `<div class="row" style="margin-top:16px"><button class="btn primary" data-stact="play">${STX.playing ? "Pause" : "Lecture"}</button><button class="btn" data-stact="png">Image (diapo affichée)</button>
          ${T.slides.length > 1 ? `<button class="btn" data-stact="zip">Carrousel (${T.slides.length} images)</button>` : ""}<button class="btn" data-stact="video">${STX.rec ? "Enregistrement…" : `Vidéo ${nf(T.slides.length * ST_DUR, 0)} s`}</button></div>
          <p class="note">Vidéo : ${typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.("video/mp4") ? "MP4" : "WebM (accepté par YouTube ; à convertir en MP4 pour Instagram si besoin)"}, 30 images par seconde, ${f.w}×${f.h}.</p>`}
      </div>
      <div class="st-stage" style="aspect-ratio:${f.w}/${f.h}">${T.empty ? `<div class="empty">${esc(T.empty)}</div>` : `<canvas id="stc" width="${Math.round(f.w / 2)}" height="${Math.round(f.h / 2)}" aria-label="Aperçu du contenu"></canvas>`}</div></div></div>
    ${TX ? `<div class="grid2">${[["titre", "Titre"], ["legende", "Légende Instagram / TikTok"], ["description", s.fmt === "yt" ? "Description YouTube avec chapitres" : "Description"], ["script", "Script de voix off"]].map(([k, l]) => `<div class="panel"><header><h2>${l}</h2><button class="btn small" data-stcopy="${k}">Copier</button></header><pre class="st-txt">${esc(TX[k])}</pre></div>`).join("")}</div>` : ""}
    <p class="note">Chaque visuel porte la mention de jeu responsable et le numéro d'aide. Vérifie les règles de la plateforme de diffusion sur les contenus de paris (âge, pays) avant de publier.</p>
  </div>`;
  STX.T = T; STX.TX = TX;
  if (!T.empty) { if (!STX.playing) { STX.t0 = performance.now() - Math.min(STX.slide, T.slides.length - 1) * ST_DUR * 1000 - (ST_DUR - 0.01) * 1000; } stLoop(); }
}
function stLoop() {
  if (STX.raf) return;
  const step = now => { const cv = $("#stc"); if (!cv || S.tab !== "studio" || !STX.T?.slides) { STX.raf = 0; return; }
    const T = STX.T, tot = T.slides.length * ST_DUR; let time = (now - STX.t0) / 1000;
    if (STX.playing) { if (time >= tot) { if (STX.rec) { stopStRec(); time = tot - 0.01; } else { STX.t0 = now; time = 0; } } } else time = Math.min(time, tot - 0.01);
    stDrawFrame(cv, T, Math.max(0, time), 0.5); STX.raf = requestAnimationFrame(step); };
  STX.raf = requestAnimationFrame(step);
}
async function stSave(blob, name) {
  const dl = await hostUse("downloads"); if (!dl) { const u = URL.createObjectURL(blob); if (!window.open(u, "_blank")) toast("Téléchargement indisponible dans cette vue"); return; }
  try { await dl.save({ filename: name, data: blob }); } catch (e) { if (e?.code !== "cancelled") toast("Téléchargement refusé"); }
}
const stName = ext => `lambda90-${S.studio.tpl}-${S.studio.fmt}-${parisDay()}.${ext}`;
function stFull(i) { const f = ST_FMT[S.studio.fmt], c = document.createElement("canvas"); c.width = f.w; c.height = f.h; stDrawFrame(c, STX.T, i * ST_DUR + ST_DUR - 0.01, 1); return c; }
let JSZIP_P = null;
function loadZip() { return JSZIP_P ??= new Promise((ok, ko) => { if (window.JSZip) return ok(window.JSZip); const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"; s.onload = () => ok(window.JSZip); s.onerror = ko; document.head.append(s); }); }
function stopStRec() { const r = STX.rec; if (r && r.state !== "inactive") r.stop(); }
async function stAction(a) {
  const T = STX.T; if (!T || T.empty) return; await document.fonts?.ready;
  if (a === "play") { STX.playing = !STX.playing; if (STX.playing) STX.t0 = performance.now() - STX.slide * ST_DUR * 1000; render(); return; }
  if (a === "png") { const c = stFull(STX.slide); stSave(await new Promise(r => c.toBlob(r, "image/png")), stName("png")); return; }
  if (a === "zip") { let Z; try { Z = await loadZip(); } catch { toast("Archive indisponible : export image par image"); for (let i = 0; i < T.slides.length; i++) { const c = stFull(i); await stSave(await new Promise(r => c.toBlob(r, "image/png")), stName(`${i + 1}.png`)); } return; }
    const z = new Z(); for (let i = 0; i < T.slides.length; i++) { const c = stFull(i); z.file(`${String(i + 1).padStart(2, "0")}.png`, await new Promise(r => c.toBlob(r, "image/png"))); }
    stSave(await z.generateAsync({ type: "blob" }), stName("zip")); return; }
  if (a === "video") {
    if (STX.rec) return; if (typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream) { toast("Export vidéo non pris en charge par ce navigateur"); return; }
    const f = ST_FMT[S.studio.fmt], c = document.createElement("canvas"); c.width = f.w; c.height = f.h;
    const type = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find(t => MediaRecorder.isTypeSupported(t)); if (!type) { toast("Aucun format vidéo disponible"); return; }
    const rec = new MediaRecorder(c.captureStream(30), { mimeType: type, videoBitsPerSecond: 10e6 }), chunks = [], t0 = performance.now(), tot = T.slides.length * ST_DUR;
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    rec.onstop = () => { STX.rec = null; render(); stSave(new Blob(chunks, { type }), stName(type.includes("mp4") ? "mp4" : "webm")); };
    STX.rec = rec; rec.start(250); toast(`Enregistrement de ${nf(tot)} secondes…`); render();
    const loop = () => { const time = (performance.now() - t0) / 1000; if (time >= tot) { rec.stop(); return; } stDrawFrame(c, T, time, 1); requestAnimationFrame(loop); }; loop();
  }
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-sttpl],[data-stfmt],[data-stact],[data-stcopy],[data-studio]"); if (!b) return; const d = b.dataset;
  if (d.studio) { Object.assign(S.studio, JSON.parse(d.studio)); ls.set("studio", S.studio); STX.slide = 0; go("studio"); return; }
  if (d.sttpl) { S.studio.tpl = d.sttpl; STX.slide = 0; }
  else if (d.stfmt) S.studio.fmt = d.stfmt;
  else if (d.stact) { stAction(d.stact); return; }
  else if (d.stcopy) { navigator.clipboard?.writeText(STX.TX?.[d.stcopy] || "").then(() => toast("Copié"), () => toast("Copie impossible : sélectionne le texte")); return; }
  ls.set("studio", S.studio); render();
});
document.addEventListener("change", e => { const d = e.target.dataset; if (d.stsel == null) return; S.studio[d.stsel] = e.target.value; ls.set("studio", S.studio); STX.slide = 0; render(); });
