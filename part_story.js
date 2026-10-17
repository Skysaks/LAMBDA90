// ---------- Stories 3D animées (9:16) : chronologie au choix, export image et vidéo ----------
const STC = { bg: "#070B14", panel: "#0D1424", line: "#1E2943", ink: "#E9EEFB", ink2: "#A6B1CC", ink3: "#7C88A8", h: "#2399B3", d: "#8569D1", a: "#C4732A", signal: "#9FE7F5", good: "#3DDC97" };
const ST = { open: false, key: null, i: 0, t0: 0, paused: false, raf: 0, renderer: null, scene: null, cam: null, upd: null, dur: 6500, t: 0, rec: null };
const R3 = { x: 0, y: 470, w: 1080, h: 900 };
const fontD = s => `500 ${s}px Unbounded, "Segoe UI", sans-serif`, fontB = (s, w = 400) => `${w} ${s}px "IBM Plex Sans", "Segoe UI", sans-serif`;
const ease = x => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
function wrapText(ctx, text, x, y, maxW, lh) {
  const words = text.replace(/ ([%:?!»])/g, "\u00a0$1").replace(/« /g, "«\u00a0").split(" "); let line = "", yy = y;
  for (const w of words) { const t = line ? line + " " + w : w; if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += lh; } else line = t; }
  if (line) ctx.fillText(line, x, yy); return yy + lh;
}
// État du match au moment choisi : score, probabilités, distribution des scores finaux, chemin
function storyState(f, t) {
  const L = liveOf(f), ev = L.events.filter(e => e.t <= t), s = L90.stateAt(ev, t), [lam, mu] = LR(f);
  const hyp = t > 0 && !L.events.length;  // aucun événement saisi : moment hypothétique, pas un fait
  const st = { t, ev, s, hyp, label: t === 0 ? "Avant-match" : hyp ? `si 0-0 à ${L90.clockLabel(t)}` : t >= L90.NM ? "Fin du match" : L90.clockLabel(t) };
  if (t === 0 && !ev.length) {
    const m = f.m; Object.assign(st, { H: m.H, D: m.D, A: m.A, scores: m.scores, tot: [0, 1, 2, 3, 4, 5, 6].map(k => m.total[k] || 0), cell: (i, j) => m.M[i * 11 + j], O25: m.O[2.5], BTTS: m.BTTS });
  } else {
    const { P, K } = L90.finalDist(C, lam, mu, Math.min(t, L90.NM), s.hg, s.ag, s.man);
    let H = 0, D = 0, A = 0, O25 = 0, BTTS = 0; const tot = [0, 0, 0, 0, 0, 0, 0], sc = [];
    for (let h = 0; h < K; h++) for (let a = 0; a < K; a++) { const p = P[h * K + a]; if (!p) continue; if (h > a) H += p; else if (h === a) D += p; else A += p; tot[Math.min(6, h + a)] += p; if (h + a > 2) O25 += p; if (h > 0 && a > 0) BTTS += p; sc.push({ s: `${h}-${a}`, p }); }
    sc.sort((x, y) => y.p - x.p);
    Object.assign(st, { H, D, A, scores: sc, tot, cell: (i, j) => P[i * K + j], O25, BTTS });
  }
  st.path = L90.pathProbs(C, lam, mu, ev, Math.min(t, L90.NM));
  st.next = t < L90.NM ? L90.project(C, lam, mu, Math.min(t, L90.NM), s.hg, s.ag, s.man, 0) : null;
  return st;
}
function storySlides(f) {
  const h = short(f.home), a = short(f.away), st = storyState(f, ST.t), live = st.t > 0 || st.ev.length;
  const at = t => st.path[Math.min(st.path.length - 1, t)];
  const plist = EXTRA.players[f.league];
  const scorers = !live && plist ? [[f.home, f.lam], [f.away, f.mu]].flatMap(([t, lam]) => plist.filter(p => p.team === t).map(p => ({ ...p, prob: 1 - Math.exp(-EXTRA.scorer_k * lam * p.share) }))).sort((x, y) => y.prob - x.prob).slice(0, 4) : null;
  const an = analyse(f), best = !live && an && S.oddsSource === "import" ? an.value.sort((x, y) => y.ev - x.ev)[0] : null;
  const fav = st.H >= st.A && st.H >= st.D ? "H" : st.A >= st.D ? "A" : "D", favTxt = fav === "H" ? `Victoire ${h}` : fav === "A" ? `Victoire ${a}` : "Match nul";
  const fade = (ctx, A, d, fn, dy = 34) => { const k = A(d, 520); if (k <= 0) return; ctx.save(); ctx.globalAlpha = k; ctx.translate(0, (1 - k) * dy); fn(); ctx.restore(); };
  const header = (ctx, A, title, sub) => {
    fade(ctx, A, 0, () => { ctx.fillStyle = STC.signal; ctx.font = fontB(30, 600); ctx.fillText("LAMBDA 90", 72, 140); const bw = ctx.measureText("LAMBDA 90").width;
      ctx.fillStyle = STC.ink3; ctx.font = fontB(30); ctx.fillText(`· ${LG[f.league]} · ${st.label}`, 72 + bw + 16, 140); }, 10);
    fade(ctx, A, 120, () => { ctx.fillStyle = STC.ink; ctx.font = fontD(64); wrapText(ctx, title, 72, 250, 936, 76); });
    if (sub) fade(ctx, A, 260, () => { ctx.fillStyle = STC.ink2; ctx.font = fontB(36); ctx.fillText(sub, 72, 410); });
  };
  const scoreLine = st.hyp ? `Scénario : encore 0-0 à ${L90.clockLabel(st.t)}` : live ? `${st.label} · ${h} ${st.s.hg}-${st.s.ag} ${a}${st.s.man ? ` · ${st.s.man > 0 ? a : h} à 10` : ""}` : null;
  const footer = (ctx, A) => fade(ctx, A, 900, () => { ctx.fillStyle = STC.ink3; ctx.font = fontB(24); ctx.fillText("Probabilités, pas des certitudes. 18+. Jouer comporte des risques : 09 74 75 13 13.", 72, 1860); }, 0);
  const count = (v, A, d, dd = 0) => nf(v * 100 * A(d, 1100), dd);
  return [
    { name: "affiche", scene: "bars3", draw(ctx, A) {
        header(ctx, A, `${h} contre ${a}`, scoreLine || `Buts attendus ${nf(f.lam, 2)} – ${nf(f.mu, 2)}`);
        [["1", st.H, STC.h, h], ["N", st.D, STC.d, "Nul"], ["2", st.A, STC.a, a]].forEach(([k, p, c, lab], i) => { const x = 72 + i * 324, d = 500 + i * 140;
          fade(ctx, A, d, () => { ctx.fillStyle = STC.line; ctx.fillRect(x, 1420, 300, 10); ctx.fillStyle = c; ctx.fillRect(x, 1420, 300 * A(d, 900), 10); ctx.fillStyle = STC.ink; ctx.font = fontD(92); ctx.fillText(`${count(p, A, d)}%`, x, 1540); ctx.fillStyle = STC.ink2; ctx.font = fontB(32); ctx.fillText(lab.length > 16 ? lab.slice(0, 15) + "…" : lab, x, 1595); }); });
        fade(ctx, A, 1500, () => { ctx.fillStyle = STC.ink2; ctx.font = fontB(36); wrapText(ctx, st.t >= L90.NM ? `Score final : ${st.s.hg}-${st.s.ag}.` : `${live ? "À ce stade, le" : "Le"} modèle penche pour ${fav === "D" ? "le match nul" : "une victoire de " + (fav === "H" ? h : a)} (${pct(st[fav])}).`, 72, 1700, 936, 46); });
        footer(ctx, A);
      } },
    { name: "scores", scene: "matrix", draw(ctx, A) {
        header(ctx, A, live ? "Le score final, vu d'ici" : "Où va le score ?", `Le plus probable : ${st.scores[0].s} (${pct(st.scores[0].p)})`);
        fade(ctx, A, 700, () => { ctx.fillStyle = STC.ink2; ctx.font = fontB(32); ctx.fillText("Hauteur des colonnes : probabilité de chaque score final.", 72, 1440); wrapText(ctx, `Bleu : ${h} gagne. Violet : nul. Ambre : ${a} gagne.`, 72, 1490, 936, 42); });
        st.scores.slice(0, 3).forEach((s, i) => fade(ctx, A, 1000 + i * 160, () => { ctx.fillStyle = STC.ink; ctx.font = fontD(58); ctx.fillText(s.s, 72 + i * 324, 1660); ctx.fillStyle = STC.ink2; ctx.font = fontB(32); ctx.fillText(`${pct(s.p, 1)}, cote ${odd(1 / s.p)}`, 72 + i * 324, 1710); }));
        footer(ctx, A);
      } },
    { name: "relief", scene: "pitch", draw(ctx, A) {
        const pv = pitchStoryView(f, st), tau = pv.tauAt(ST.el || 0), s = L90.stateAt(pv.evs, tau);
        header(ctx, A, "Le match en relief", st.hyp ? `Scénario : encore 0-0 à ${L90.clockLabel(st.t)}` : pv.played ? `Réel jusqu'à ${st.t >= L90.NM ? "la fin" : st.label}` : "Le match attendu, minute par minute");
        fade(ctx, A, 300, () => {
          ctx.fillStyle = STC.ink; ctx.font = fontD(54); ctx.fillText(`${s.hg} – ${s.ag}`, 72, 1430);
          ctx.fillStyle = STC.ink2; ctx.font = fontB(30); ctx.fillText(`${h} · ${a}`, 72 + ctx.measureText("0 – 0").width * 1.9 + 24, 1420);
          ctx.textAlign = "right"; ctx.fillStyle = STC.ink; ctx.font = fontD(54); ctx.fillText(tau >= L90.NM - 0.01 ? "Fin" : L90.clockLabel(Math.max(1, Math.ceil(tau))), 1008, 1430); ctx.textAlign = "left";
          const last = pv.evs.filter(e => e.type === "goal" && e.t <= tau).pop();
          if (last && tau - last.t < 3.5 && tau < L90.NM - 0.01) { ctx.fillStyle = STC.signal; ctx.font = fontB(30, 600); ctx.fillText(`But ${last.side === 0 ? h : a} · ${L90.clockLabel(last.t)}`, 72, 1478); }
          pfTimeline(ctx, pv.S, pv.evs, tau, 72, 1505, 936, 160, { fs: 26, ink: STC.ink3 });
        });
        fade(ctx, A, 900, () => { ctx.fillStyle = STC.ink3; ctx.font = fontB(28); wrapText(ctx, `Relief : chance de marquer dans les 10 minutes. Bleu : ${h}. Ambre : ${a}. Pics : buts.`, 72, 1745, 936, 38); });
        footer(ctx, A);
      } },
    { name: "buts", scene: null, draw(ctx, A) {
        const T = !live ? timingOf(f) : null;
        header(ctx, A, "Combien de buts ?", st.hyp ? `Si encore 0-0 à ${L90.clockLabel(st.t)}` : st.t >= L90.NM && !st.hyp ? `Score final : ${st.s.hg}-${st.s.ag}` : live ? `Déjà ${st.s.hg + st.s.ag} but${st.s.hg + st.s.ag > 1 ? "s" : ""} · ${st.label}` : `${nf(f.lam + f.mu, 1)} buts attendus`);
        const mx = Math.max(...st.tot), bw = 936 / 7, base = 1250;
        st.tot.forEach((p, k) => { const d = 400 + k * 90, hh = 620 * p / mx * A(d, 900), x = 72 + k * bw;
          ctx.fillStyle = k === st.tot.indexOf(mx) ? STC.signal : STC.d; ctx.globalAlpha = A(d, 300); ctx.fillRect(x + 14, base - hh, bw - 28, hh);
          ctx.fillStyle = STC.ink; ctx.font = fontD(34); ctx.textAlign = "center"; if (p > 0.005) ctx.fillText(`${nf(p * 100 * A(d, 900))}%`, x + bw / 2, base - hh - 18);
          ctx.fillStyle = STC.ink2; ctx.font = fontB(32); ctx.fillText(k === 6 ? "6+" : String(k), x + bw / 2, base + 46); ctx.textAlign = "left"; ctx.globalAlpha = 1; });
        fade(ctx, A, 1300, () => { ctx.fillStyle = STC.ink2; ctx.font = fontB(36);
          const lines = st.t >= L90.NM ? [`Total final : ${st.s.hg + st.s.ag} buts.`] : live && st.next ? [`Prochain but : ${h} ${pct(st.next.nextH)}, ${a} ${pct(st.next.nextA)}, aucun ${pct(st.next.nextNone)}.`, `Au moins 3 buts au total : ${pct(st.O25)}.`]
            : [`Au moins 3 buts : ${pct(st.O25)}. Les deux marquent : ${pct(st.BTTS)}.`, `Premier but en médiane vers la ${T?.median ? L90.clockLabel(T.median) : "–"}, ${h} l'ouvre dans ${pct(T.first.H)} des cas.`];
          let y = 1460; for (const l of lines) y = wrapText(ctx, l, 72, y, 936, 48) + 14; });
        footer(ctx, A);
      } },
    { name: "cles", scene: null, draw(ctx, A) {
        if (scorers && scorers.length) {
          header(ctx, A, "Les hommes du match", "Probabilité de marquer au moins un but");
          scorers.forEach((p, i) => fade(ctx, A, 400 + i * 160, () => { const y = 560 + i * 250; ctx.fillStyle = p.team === f.home ? STC.h : STC.a; ctx.fillRect(72, y, 14, 170 * A(400 + i * 160, 700));
            ctx.fillStyle = STC.ink; ctx.font = fontD(52); ctx.fillText(pname(p.name), 116, y + 60); ctx.fillStyle = STC.ink2; ctx.font = fontB(32); ctx.fillText(`${short(p.team)}, ${p.goals} buts en 2025-26${p.pens ? `, dont ${p.pens} sur penalty` : ""}`, 116, y + 112);
            ctx.fillStyle = STC.ink; ctx.font = fontD(72); ctx.textAlign = "right"; ctx.fillText(`${count(p.prob, A, 400 + i * 160)}%`, 1008, y + 100); ctx.textAlign = "left"; }));
          fade(ctx, A, 1300, () => { ctx.fillStyle = STC.ink3; ctx.font = fontB(28); ctx.fillText("Données 2025-26 : vérifie la composition officielle.", 72, 1620); });
        } else {
          header(ctx, A, "Les chiffres clés", st.hyp ? `Si encore 0-0 à ${L90.clockLabel(st.t)}` : live ? `À ${st.label}` : "Ce que disent les marchés dérivés du modèle");
          const m = f.m, items = live ? [["Victoire " + h, st.H], ["Match nul", st.D], ["Victoire " + a, st.A], ["Au moins 3 buts", st.O25], ["Les deux marquent", st.BTTS]]
            : [["Les deux équipes marquent", m.BTTS], ["Au moins 3 buts", m.O[2.5]], [`${h} ne prend pas de but`, m.csH], [`${a} ne prend pas de but`, m.csA], ["But dans les deux mi-temps", m.half.both], ["Égalité à la pause", m.half.ht[1]]];
          items.forEach(([lab, p], i) => { const y = 560 + i * 170, d = 350 + i * 120; fade(ctx, A, d, () => { ctx.fillStyle = STC.line; ctx.fillRect(72, y + 90, 936, 12); ctx.fillStyle = STC.signal; ctx.fillRect(72, y + 90, 936 * p * A(d, 900), 12);
            ctx.fillStyle = STC.ink2; ctx.font = fontB(36); ctx.fillText(lab, 72, y + 60); ctx.fillStyle = STC.ink; ctx.font = fontD(48); ctx.textAlign = "right"; ctx.fillText(`${count(p, A, d)}%`, 1008, y + 62); ctx.textAlign = "left"; }); });
        }
        footer(ctx, A);
      } },
    { name: "verdict", scene: null, draw(ctx, A) {
        header(ctx, A, st.t >= L90.NM ? "Le résultat" : "Le verdict", scoreLine || `${LG[f.league]}, ${dayName(f.date)}`);
        fade(ctx, A, 400, () => { ctx.fillStyle = STC.ink; ctx.font = fontD(96); ctx.fillText(st.t >= L90.NM ? `${st.s.hg} – ${st.s.ag}` : favTxt, 72, 700); });
        if (st.t < L90.NM) fade(ctx, A, 650, () => { ctx.fillStyle = STC.signal; ctx.font = fontD(140); ctx.fillText(`${count(st[fav], A, 650)}%`, 72, 880); });
        fade(ctx, A, 1100, () => { ctx.fillStyle = STC.ink2; ctx.font = fontB(40); let y = wrapText(ctx, `Scores les plus probables : ${st.scores.slice(0, 3).map(s => s.s).join(", ")}. Cotes justes : ${odd(1 / st.H)} / ${odd(1 / st.D)} / ${odd(1 / st.A)}.`, 72, 1010, 936, 54);
          y += 30; ctx.fillStyle = best ? STC.good : STC.ink2; ctx.font = fontB(38, 600);
          wrapText(ctx, best ? `Valeur détectée : ${SEL[best.k]} à ${odd(best.o)} chez ${best.book}, EV ${sgn(best.ev)} face à la référence ${best.src.toLowerCase()}.` : live ? "Probabilités recalculées minute par minute par le moteur live." : S.mode === "fan" ? "Ton pronostic contre le modèle : rendez-vous dans Défis." : "Aucune cote réelle importée : pas de verdict de valeur.", 72, y, 936, 52); });
        fade(ctx, A, 1400, () => { ctx.fillStyle = STC.ink3; ctx.font = fontB(30); wrapText(ctx, `Backtest sur ${nf(PRE.summary.all.n)} matchs : RPS ${nf(PRE.summary.all.rps, 3)} contre ${nf(PRE.summary.all.rps_base, 3)} pour la référence.`, 72, 1560, 936, 40); });
        footer(ctx, A);
      } }
  ].map(s => ({ ...s, st, f }));
}
// Vue du terrain pour la story : ce qui est rejoué et jusqu'où
function pitchStoryView(f, st) {
  const key = f.key + "|" + st.t + "|" + JSON.stringify(liveOf(f).events);
  if (ST._pv?.key === key) return ST._pv;
  const evs = liveOf(f).events.filter(e => e.t <= st.t).sort((a, b) => a.t - b.t), played = liveOf(f).events.length > 0;
  const target = st.t > 0 ? Math.min(L90.NM, st.t) : L90.NM, upTo = played || st.t > 0 ? target : 0;
  const S = threatSeries(f, evs, upTo);
  const tauAt = el => target * Math.min(1, Math.max(0, (el - 500) / 5300));
  return ST._pv = { key, evs, played, target, upTo, S, tauAt };
}
function buildScene(kind, f, st) {
  const T = window.THREE; if (!T || !kind) return null;
  const scene = new T.Scene(), cam = new T.PerspectiveCamera(38, R3.w / R3.h, 0.1, 100), g = new T.Group(); scene.add(g);
  scene.add(new T.HemisphereLight(0xdfe7ff, 0x05070d, 0.7)); const dl = new T.DirectionalLight(0xffffff, 0.85); dl.position.set(-4, 9, 6); scene.add(dl);
  const rim = new T.DirectionalLight(0x9fe7f5, 0.22); rim.position.set(6, 3, -6); scene.add(rim);
  const mat = (c, extra = {}) => new T.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.08, ...extra });
  const col = { h: 0x2399b3, d: 0x8569d1, a: 0xc4732a };
  const floor = (w, d) => { const p = new T.Mesh(new T.PlaneGeometry(w, d), new T.MeshStandardMaterial({ color: 0x161d2c, roughness: 1 })); p.rotation.x = -Math.PI / 2; g.add(p);
    const lines = new T.LineSegments(new T.EdgesGeometry(new T.PlaneGeometry(w * 0.92, d * 0.92)), new T.LineBasicMaterial({ color: 0x2c3850 })); lines.rotation.x = -Math.PI / 2; lines.position.y = 0.01; g.add(lines); };
  const grow = (o, k) => { o.scale.y = 0.02 + 0.98 * k; o.position.y = o.userData.h * o.scale.y / 2; };
  if (kind === "bars3") {
    floor(7, 4); [["h", st.H], ["d", st.D], ["a", st.A]].forEach(([k, p], i) => { const hh = 0.2 + p * 7; const b = new T.Mesh(new T.CylinderGeometry(0.55, 0.55, hh, 48), mat(col[k])); b.position.set(-2.2 + i * 2.2, hh / 2, 0); b.userData = { h: hh, d: 500 + i * 140 }; g.add(b); });
    cam.position.set(0, 4.2, 9); cam.lookAt(0, 1.8, 0);
    return { scene, cam, upd: t => { g.rotation.y = Math.sin(t / 2600) * 0.35; g.children.forEach(o => { if (o.userData.h) grow(o, ease((t - o.userData.d) / 1000)); }); } };
  }
  if (kind === "matrix") {
    floor(8, 8); const n = 6; let mx = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) mx = Math.max(mx, st.cell(i, j));
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const p = st.cell(i, j), hh = 0.03 + 4.2 * p / mx; const b = new T.Mesh(new T.BoxGeometry(0.9, hh, 0.9), mat(i > j ? col.h : i === j ? col.d : col.a)); b.position.set((j - 2.5) * 1.15, hh / 2, (2.5 - i) * 1.15); b.userData = { h: hh, d: 300 + (i + j) * 70 }; g.add(b); }
    cam.position.set(7.5, 7.2, 8.5); cam.lookAt(0, 0.6, 0);
    return { scene, cam, upd: t => { g.rotation.y = t / 9000; g.children.forEach(o => { if (o.userData.h) grow(o, ease((t - o.userData.d) / 900)); }); } };
  }
  if (kind === "pitch") {
    const pv = pitchStoryView(f, st), P = pitchBuild(T, f, pv.evs, pv.upTo, { fov: 30, aspect: R3.w / R3.h });
    P.cam.fov = 30; P.cam.position.set(-7.9, 14.4, 12.2); P.cam.lookAt(0.1, 0.2, 0.25); P.cam.updateProjectionMatrix();
    return { scene: P.scene, cam: P.cam, upd: t => { P.setFrame(pv.tauAt(t), t); P.g.rotation.y = 0.55 + Math.sin(t / 4200) * 0.05; } };
  }
  if (kind === "path") {
    floor(10.5, 5.5); const W = 9, path = st.path, n = path.length - 1;
    const clip = new T.Plane(new T.Vector3(-1, 0, 0), -W / 2);
    [["H", col.h, -1.6], ["D", col.d, 0], ["A", col.a, 1.6]].forEach(([k, c, z]) => {
      const geo = new T.PlaneGeometry(W, 1.1, n, 1), pos = geo.attributes.position;
      for (let v = 0; v < pos.count; v++) { const ix = v % (n + 1), top = Math.floor(v / (n + 1)) === 0; pos.setXYZ(v, -W / 2 + W * ix / n, top ? 0.04 + path[ix][k] * 3.2 : 0.02, z); }
      geo.computeVertexNormals();
      g.add(new T.Mesh(geo, new T.MeshStandardMaterial({ color: c, side: T.DoubleSide, roughness: 0.5, transparent: true, opacity: 0.92, clippingPlanes: [clip] })));
    });
    for (const e of st.ev) { const x = -W / 2 + W * e.t / n, s = e.type === "goal" ? new T.Mesh(new T.SphereGeometry(0.22, 24, 16), mat(0xe9eefb)) : new T.Mesh(new T.BoxGeometry(0.22, 0.34, 0.06), mat(0xff6b6b)); s.position.set(x, 3.5, e.side === 0 ? -1.6 : 1.6); s.userData.t = e.t; g.add(s); }
    if (st.t > 0) { const now = new T.Mesh(new T.BoxGeometry(0.03, 3.6, 0.03), new T.MeshBasicMaterial({ color: 0xe9eefb })); now.position.set(-W / 2 + W * Math.min(st.t, n) / n, 1.8, -2.3); now.userData.t = st.t; g.add(now); }
    [0, 45, 93].forEach(t => { const x = -W / 2 + W * t / n; const ln = new T.Mesh(new T.BoxGeometry(0.02, 0.02, 4.6), mat(0x2c3850)); ln.position.set(x, 0.03, 0); g.add(ln); });
    cam.position.set(-3.2, 6.2, 12.5); cam.lookAt(0.3, 1.3, 0);
    return { scene, cam, upd: t => { clip.constant = -W / 2 + W * ease((t - 300) / 2600); g.children.forEach(o => { if (o.userData.t != null) o.visible = clip.constant >= -W / 2 + W * o.userData.t / n - 0.01; }); g.rotation.y = -0.25 + Math.sin(t / 3200) * 0.18; } };
  }
  return null;
}
function drawBg(ctx, el) {
  const grd = ctx.createLinearGradient(0, 0, 0, 1920); grd.addColorStop(0, "#0b1424"); grd.addColorStop(1, STC.bg); ctx.fillStyle = grd; ctx.fillRect(0, 0, 1080, 1920);
  const cx = 780 + Math.sin(el / 3000) * 60, cy = 300 + Math.cos(el / 3700) * 40;
  const rg = ctx.createRadialGradient(cx, cy, 50, cx, cy, 900); rg.addColorStop(0, "rgba(35,153,179,0.20)"); rg.addColorStop(1, "rgba(35,153,179,0)"); ctx.fillStyle = rg; ctx.fillRect(0, 0, 1080, 1920);
}
function draw2dFallback(ctx, slide, A) {
  const st = slide.st; ctx.save(); ctx.translate(R3.x, R3.y);
  if (slide.scene === "bars3" || slide.scene === "matrix") {
    const v = slide.scene === "bars3" ? [["h", st.H], ["d", st.D], ["a", st.A]] : st.scores.slice(0, 6).map(s => { const [x, y] = s.s.split("-").map(Number); return [x > y ? "h" : x === y ? "d" : "a", s.p, s.s]; });
    const mx = Math.max(...v.map(x => x[1])), bw = 936 / v.length;
    v.forEach(([c, p, lab], i) => { const hh = 700 * p / mx * A(400 + i * 100, 900); ctx.fillStyle = STC[c]; ctx.fillRect(72 + i * bw + 12, 820 - hh, bw - 24, hh); if (lab) { ctx.fillStyle = STC.ink2; ctx.font = fontB(30); ctx.fillText(lab, 72 + i * bw + 20, 860); } });
  } else if (slide.scene === "path") {
    const p = st.path, n = p.length - 1, upto = Math.round(n * A(300, 2600));
    [["h", "H"], ["d", "D"], ["a", "A"]].forEach(([c, k]) => { ctx.strokeStyle = STC[c]; ctx.lineWidth = 6; ctx.beginPath(); p.slice(0, upto + 1).forEach((q, i) => { const x = 72 + 936 * i / n, y = 820 - q[k] * 700; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); });
  }
  ctx.restore();
}
function storyMoments(f) {
  const L = liveOf(f), m = [["Avant-match", 0], ["Mi-temps", 48], ["60e", 63], ["75e", 78], ["Fin", L90.NM]];
  if (!L.events.length) { m.pop(); m.slice(1).forEach(x => x[0] = `Si 0-0 : ${x[0].toLowerCase()}`); }
  if (L.t > 0 && !m.some(x => x[1] === L.t)) m.push([`Live ${L90.clockLabel(L.t)}`, L.t]);
  return m;
}
function storyChrono() {
  const f = FXK[ST.key], el = $(".story-time"); if (!el || !f) return;
  el.innerHTML = `<div class="chips">${storyMoments(f).map(([l, t]) => `<button class="chip" data-stt="${t}" aria-pressed="${ST.t === t}">${esc(l)}</button>`).join("")}</div>
    <label class="st-range"><span class="num">${L90.clockLabel(ST.t)}</span><input type="range" min="0" max="${liveOf(f).events.length ? L90.NM : L90.NM - 1}" value="${ST.t}" data-stt-range aria-label="Moment du match affiché dans la story"></label>
    ${liveOf(f).events.length ? "" : `<span class="note">Aucun événement saisi : après le coup d'envoi, la story montre un scénario « encore 0-0 ». Pour raconter un match joué, saisis ses buts et cartons dans l'onglet Live.</span>`}`;
}
function openStory(key) {
  const f = FXK[key]; if (!f) return;
  if (ST.key !== key) ST.t = liveOf(f).t || 0;
  ST.key = key; ST.i = 0; ST.open = true; ST.paused = false; ST.slides = storySlides(f);
  let el = $("#story");
  if (!el) {
    el = document.createElement("div"); el.id = "story"; el.className = "story"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Story du match");
    el.innerHTML = `<div class="story-frame"><div class="story-bars"></div><canvas id="st2d" width="1080" height="1920"></canvas><canvas id="st3d"></canvas>
      <button class="st-zone st-prev" data-st="prev" aria-label="Slide précédente"></button><button class="st-zone st-next" data-st="next" aria-label="Slide suivante"></button><button class="st-x" data-st="close" aria-label="Fermer">×</button></div>
      <div class="story-time"></div>
      <div class="story-ctrl"><button class="btn small desk" data-st="prev">Précédente</button><button class="btn small" data-st="pause">Pause</button><button class="btn small desk" data-st="next">Suivante</button><button class="btn small" data-st="save">Image</button><button class="btn small" data-st="video">Vidéo</button><button class="btn small primary desk" data-st="close">Fermer</button></div>`;
    document.body.append(el); storyGestures(el.querySelector(".story-frame"));
  }
  el.hidden = false; document.body.style.overflow = "hidden";
  if (window.THREE && !ST.renderer) {
    try { ST.renderer = new THREE.WebGLRenderer({ canvas: $("#st3d"), antialias: true, alpha: true, preserveDrawingBuffer: true }); ST.renderer.localClippingEnabled = true; ST.renderer.setPixelRatio(1); ST.renderer.setSize(R3.w, R3.h, false); } catch { ST.renderer = null; }
  }
  storyChrono(); showSlide(0);
  cancelAnimationFrame(ST.raf); const loop = now => { if (!ST.open) return; tickStory(now); ST.raf = requestAnimationFrame(loop); }; ST.raf = requestAnimationFrame(loop);
}
function setStoryTime(t) { ST.t = Math.max(0, Math.min(L90.NM, t)); ST.slides = storySlides(FXK[ST.key]); storyChrono(); ST.paused = false; showSlide(ST.i); }
function showSlide(i) {
  ST.i = (i + ST.slides.length) % ST.slides.length; ST.t0 = performance.now(); ST.pausedEl = 0;
  const s = ST.slides[ST.i];
  const built = ST.renderer ? buildScene(s.scene, s.f, s.st) : null;
  ST.scene = built?.scene || null; ST.cam = built?.cam || null; ST.upd = built?.upd || null;
  $("#st3d").style.visibility = ST.scene ? "visible" : "hidden";
  $(".story-bars").innerHTML = ST.slides.map((_, k) => `<i><b style="width:${k < ST.i ? 100 : 0}%"></b></i>`).join("");
  const pb = document.querySelector('[data-st="pause"]'); if (pb) pb.textContent = ST.paused ? "Lecture" : "Pause";
}
function tickStory(now) {
  const rm = matchMedia("(prefers-reduced-motion: reduce)").matches, real = ST.paused ? ST.pausedEl : now - ST.t0, el = rm ? 99999 : real;
  const bar = document.querySelectorAll(".story-bars b")[ST.i];
  if (!ST.paused) { if (bar) bar.style.width = Math.min(100, real / ST.dur * 100) + "%";
    if (real > ST.dur) { if (ST.i < ST.slides.length - 1) { showSlide(ST.i + 1); return; } if (ST.rec) { stopRecording(); return; } ST.paused = true; ST.pausedEl = real; const pb = document.querySelector('[data-st="pause"]'); if (pb) pb.textContent = "Lecture"; } }
  ST.el = el; const s = ST.slides[ST.i], ctx = $("#st2d").getContext("2d"), A = (d = 0, dur = 600) => ease((el - d) / dur);
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left"; drawBg(ctx, now); s.draw(ctx, A);
  if (!ST.scene && s.scene) draw2dFallback(ctx, s, A);
  if (ST.scene && ST.renderer) { ST.upd?.(el); ST.renderer.render(ST.scene, ST.cam); }
  if (ST.rec) { const c = ST.rec.ctx; c.drawImage($("#st2d"), 0, 0); if (ST.scene) c.drawImage($("#st3d"), R3.x, R3.y, R3.w, R3.h); }
}
function closeStory() { if (ST.rec) stopRecording(true); ST.open = false; cancelAnimationFrame(ST.raf); const el = $("#story"); if (el) el.hidden = true; document.body.style.overflow = ""; }
async function saveBlob(blob, ext) {
  const dl = await hostUse("downloads");
  if (!dl) { toast("Téléchargement indisponible dans cette vue"); return; }
  const f = FXK[ST.key];
  try { await dl.save({ filename: `lambda90-${short(f.home)}-${short(f.away)}-${ST.t ? "min" + ST.t : "avant-match"}${ext === "png" ? "-" + (ST.i + 1) : ""}.${ext}`.replace(/\s+/g, "-").toLowerCase(), data: blob }); } catch (e) { if (e?.code !== "cancelled") toast("Téléchargement refusé"); }
}
async function saveStory() {
  const c = document.createElement("canvas"); c.width = 1080; c.height = 1920; const ctx = c.getContext("2d");
  ctx.drawImage($("#st2d"), 0, 0); if (ST.scene) { ST.renderer.render(ST.scene, ST.cam); ctx.drawImage($("#st3d"), R3.x, R3.y, R3.w, R3.h); }
  saveBlob(await new Promise(r => c.toBlob(r, "image/png")), "png");
}
function startRecording() {
  if (ST.rec) return;
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) { toast("Export vidéo non pris en charge par ce navigateur"); return; }
  const c = document.createElement("canvas"); c.width = 1080; c.height = 1920;
  const type = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find(t => MediaRecorder.isTypeSupported(t));
  if (!type) { toast("Aucun format vidéo disponible"); return; }
  const rec = new MediaRecorder(c.captureStream(30), { mimeType: type, videoBitsPerSecond: 8e6 }), chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  rec.onstop = () => { const r = ST.rec; ST.rec = null; const b = document.querySelector('[data-st="video"]'); if (b) b.textContent = "Vidéo"; if (r?.cancel) return; saveBlob(new Blob(chunks, { type }), type.includes("mp4") ? "mp4" : "webm"); };
  ST.rec = { rec, ctx: c.getContext("2d"), type }; ST.paused = false; showSlide(0); rec.start(500);
  const b = document.querySelector('[data-st="video"]'); if (b) b.textContent = "Arrêter l'enregistrement";
  toast(`Enregistrement de ${ST.slides.length} slides (${Math.round(ST.slides.length * ST.dur / 1000)} s)`);
}
function stopRecording(cancel) { if (!ST.rec) return; ST.rec.cancel = !!cancel; ST.rec.rec.stop(); ST.paused = true; ST.pausedEl = ST.dur; }
function togglePause() {
  const now = performance.now();
  if (ST.paused) { ST.paused = false; ST.t0 = now - Math.min(ST.pausedEl || 0, ST.dur - 1); } else { ST.paused = true; ST.pausedEl = now - ST.t0; }
  const pb = document.querySelector('[data-st="pause"]'); if (pb) pb.textContent = ST.paused ? "Lecture" : "Pause";
}
function storyGestures(frame) {
  let sx = 0, sy = 0, held = false, holdT = null;
  frame.addEventListener("pointerdown", e => { sx = e.clientX; sy = e.clientY; held = false; holdT = setTimeout(() => { if (!ST.paused) { held = true; togglePause(); } }, 260); });
  frame.addEventListener("pointerup", e => {
    clearTimeout(holdT); const dx = e.clientX - sx, dy = e.clientY - sy;
    if (held) { togglePause(); ST.swallow = true; return; }
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { ST.swallow = true; showSlide(ST.i + (dx < 0 ? 1 : -1)); }
    else if (dy > 90) { ST.swallow = true; closeStory(); }
  });
  frame.addEventListener("pointercancel", () => { clearTimeout(holdT); if (held) togglePause(); });
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-st],[data-stt]"); if (b) { e.stopPropagation();
    if (ST.swallow && b.closest(".story-frame")) { ST.swallow = false; return; } ST.swallow = false;
    if (b.dataset.stt != null) { setStoryTime(+b.dataset.stt); return; }
    const a = b.dataset.st; if (ST.rec && a !== "close" && a !== "video") return;
    if (a === "next") showSlide(ST.i + 1); else if (a === "prev") showSlide(ST.i - 1); else if (a === "close") closeStory(); else if (a === "save") saveStory();
    else if (a === "video") ST.rec ? stopRecording(false) : startRecording();
    else if (a === "pause") togglePause();
    return; }
  const s = e.target.closest("[data-story]"); if (s) openStory(s.dataset.story);
}, true);
document.addEventListener("input", e => { if (e.target.matches?.("[data-stt-range]")) { const v = +e.target.value; clearTimeout(ST._rt); const sp = e.target.previousElementSibling; if (sp) sp.textContent = L90.clockLabel(v); ST._rt = setTimeout(() => setStoryTime(v), 120); } });
document.addEventListener("keydown", e => { if (!ST.open) return; if (e.key === "Escape") closeStory(); if (e.key === "ArrowRight") showSlide(ST.i + 1); if (e.key === "ArrowLeft") showSlide(ST.i - 1); if (e.key === " ") { e.preventDefault(); togglePause(); } });
