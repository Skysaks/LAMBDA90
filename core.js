// ===== Lambda 90 — noyau quant (pur, testable) =====
const L90 = (() => {
  const MAXG = 10;
  const fact = [1]; for (let i = 1; i <= 30; i++) fact[i] = fact[i - 1] * i;
  const pois = (k, l) => Math.exp(-l) * Math.pow(l, k) / fact[k];

  // --- Dixon-Coles : matrice des scores ---
  function matrix(lam, mu, rho) {
    const n = MAXG + 1, M = new Float64Array(n * n); let s = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      let p = pois(i, lam) * pois(j, mu);
      if (i === 0 && j === 0) p *= 1 - lam * mu * rho;
      else if (i === 0 && j === 1) p *= 1 + lam * rho;
      else if (i === 1 && j === 0) p *= 1 + mu * rho;
      else if (i === 1 && j === 1) p *= 1 - rho;
      M[i * n + j] = p; s += p;
    }
    for (let k = 0; k < M.length; k++) M[k] /= s;
    return M;
  }
  function markets(lam, mu, rho) {
    const n = MAXG + 1, M = matrix(lam, mu, rho);
    const r = { H: 0, D: 0, A: 0, BTTS: 0, O: { 0.5: 0, 1.5: 0, 2.5: 0, 3.5: 0, 4.5: 0 }, scores: [], M, lam, mu };
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const p = M[i * n + j];
      if (i > j) r.H += p; else if (i === j) r.D += p; else r.A += p;
      if (i > 0 && j > 0) r.BTTS += p;
      for (const L of [0.5, 1.5, 2.5, 3.5, 4.5]) if (i + j > L) r.O[L] += p;
      r.scores.push({ s: `${i}-${j}`, p });
    }
    r.scores.sort((a, b) => b.p - a.p);
    return r;
  }

  // --- Moteur live : programmation dynamique minute par minute ---
  // coef = {c, bins[8], state{m2,m1,z,p1,p2}, up, down}; horloge de 99 minutes-modèle (45 + 3 + 45 + 6)
  const S1 = 3, S2 = 6, NM = 90 + S1 + S2;
  function binOf(i) {
    if (i < 45) return Math.floor(i / 15);
    if (i < 45 + S1) return 3;
    const j = i - 45 - S1;
    return j < 45 ? 4 + Math.floor(j / 15) : 7;
  }
  function clockLabel(t) {
    if (t <= 0) return "0'";
    if (t <= 45) return `${t}'`;
    if (t <= 45 + S1) return `45+${t - 45}'`;
    if (t <= 90 + S1) return `${t - S1}'`;
    if (t < NM) return `90+${t - 90 - S1}'`;
    return "Fin";
  }
  function stateAt(events, t) {
    let hg = 0, ag = 0, rh = 0, ra = 0;
    for (const e of events) if (e.t <= t) {
      if (e.type === "goal") e.side === 0 ? hg++ : ag++;
      else if (e.type === "red") e.side === 0 ? rh++ : ra++;
    }
    return { hg, ag, man: ra - rh }; // man > 0 : domicile en supériorité numérique
  }
  function project(C, lam, mu, start, hg, ag, man, horizon) {
    const K = 13, P = new Float64Array(K * K); P[Math.min(hg, K - 2) * K + Math.min(ag, K - 2)] = 1;
    let Q = 1, nextH = 0, nextA = 0, pGoalH = null, xH = 0, xA = 0;
    const st = d => d <= -2 ? C.state.m2 : d === -1 ? C.state.m1 : d === 0 ? 0 : d === 1 ? C.state.p1 : C.state.p2;
    const upH = man > 0 ? C.up : man < 0 ? C.down : 0, upA = man < 0 ? C.up : man > 0 ? C.down : 0;
    const Qs = new Float64Array(K * K); Qs.set(P); // masse sans nouveau but
    for (let i = start; i < NM; i++) {
      const b = C.bins[binOf(i)], N = new Float64Array(K * K);
      let qh = 0, qa = 0, qNone = 0;
      for (let h = 0; h < K - 1; h++) for (let a = 0; a < K - 1; a++) {
        const p = P[h * K + a], q = Qs[h * K + a]; if (p === 0 && q === 0) continue;
        const d = h - a;
        const rh = lam * Math.exp(C.c + b + st(d) + upH), ra = mu * Math.exp(C.c + b + st(-d) + upA);
        const ph = 1 - Math.exp(-rh), pa = 1 - Math.exp(-ra);
        xH += p * rh; xA += p * ra;
        N[h * K + a] += p * (1 - ph) * (1 - pa);
        N[(h + 1) * K + a] += p * ph * (1 - pa);
        N[h * K + a + 1] += p * (1 - ph) * pa;
        N[(h + 1) * K + a + 1] += p * ph * pa;
        if (q > 0) { qh += q * (ph * (1 - pa) + 0.5 * ph * pa); qa += q * ((1 - ph) * pa + 0.5 * ph * pa); Qs[h * K + a] = q * (1 - ph) * (1 - pa); qNone += Qs[h * K + a]; }
      }
      nextH += qh; nextA += qa; Q = qNone;
      if (horizon && i === Math.min(NM, start + horizon) - 1) pGoalH = 1 - Q;
      P.set(N);
    }
    if (horizon && pGoalH === null) pGoalH = 1 - Q;
    let H = 0, D = 0, A = 0, BY = 0; const tot = {};
    for (let h = 0; h < K; h++) for (let a = 0; a < K; a++) {
      const p = P[h * K + a]; if (!p) continue;
      if (h > a) H += p; else if (h === a) D += p; else A += p; if (h > 0 && a > 0) BY += p;
      tot[h + a] = (tot[h + a] || 0) + p;
    }
    const over = L => Object.entries(tot).reduce((s, [g, p]) => s + (g > L ? p : 0), 0);
    return { H, D, A, nextH, nextA, nextNone: Q, pGoalH, xH, xA, O25: over(2.5), O15: over(1.5), O35: over(3.5), BY };
  }
  function timeline(C, lam, mu, events, upTo, step = 1) {
    const out = [];
    for (let t = 0; t <= upTo; t += step) {
      const s = stateAt(events, t);
      const r = project(C, lam, mu, t, s.hg, s.ag, s.man, 0);
      out.push({ t, H: r.H, D: r.D, A: r.A });
    }
    if (out.length && out[out.length - 1].t !== upTo) {
      const s = stateAt(events, upTo), r = project(C, lam, mu, upTo, s.hg, s.ag, s.man, 0);
      out.push({ t: upTo, H: r.H, D: r.D, A: r.A });
    }
    return out;
  }

  // --- Retrait de la marge (dévigage) ---
  function devig(odds, method = "shin") {
    const q = odds.map(o => 1 / o), S = q.reduce((a, b) => a + b, 0), n = q.length;
    if (method === "mult") return q.map(x => x / S);
    if (method === "add") return q.map(x => x - (S - 1) / n);
    if (method === "power") {
      let lo = 0.5, hi = 2;
      for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2, s = q.reduce((a, x) => a + Math.pow(x, m), 0); s > 1 ? lo = m : hi = m; }
      const k = (lo + hi) / 2; return q.map(x => Math.pow(x, k));
    }
    // Shin (1993) : z = part d'initiés implicite
    const pz = z => q.map(x => (Math.sqrt(z * z + 4 * (1 - z) * x * x / S) - z) / (2 * (1 - z)));
    let lo = 0, hi = 0.4;
    for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2, s = pz(m).reduce((a, b) => a + b, 0); s > 1 ? lo = m : hi = m; }
    return pz((lo + hi) / 2);
  }
  const overround = odds => odds.reduce((a, o) => a + 1 / o, 0) - 1;

  // --- Valeur, Kelly, arbitrage ---
  const ev = (p, o) => p * o - 1;
  function kelly(p, o, frac = 0.25, cap = 0.02) {
    const f = (p * o - 1) / (o - 1);
    return Math.max(0, Math.min(cap, f * frac));
  }
  function arbitrage(best, total = 100, round = 0.5) {
    // best : [{o, book, label}] une ligne par issue
    const inv = best.map(b => 1 / b.o), S = inv.reduce((a, b) => a + b, 0);
    const exact = best.map((b, i) => total * inv[i] / S);
    const stakes = exact.map(s => Math.max(round, Math.round(s / round) * round));
    const outlay = stakes.reduce((a, b) => a + b, 0);
    const payouts = best.map((b, i) => stakes[i] * b.o);
    const worst = Math.min(...payouts) - outlay;
    return { S, margin: 1 / S - 1, isArb: S < 1, stakes, outlay, payouts, worst, worstPct: worst / outlay };
  }

  // --- Statistiques de journal ---
  function bankrollStats(bets, start) {
    let bank = start, peak = start, maxDD = 0, staked = 0, pnl = 0, clvN = 0, clvS = 0, won = 0, settled = 0;
    const curve = [{ i: 0, bank: start }];
    const ordered = [...bets].sort((a, b) => a.ts - b.ts);
    for (const b of ordered) {
      if (b.close > 1) { clvS += b.odds / b.close - 1; clvN++; }
      if (b.result === "won" || b.result === "lost" || b.result === "void") {
        const r = b.result === "won" ? b.stake * (b.odds - 1) : b.result === "lost" ? -b.stake : 0;
        bank += r; pnl += r; staked += b.result === "void" ? 0 : b.stake; settled++; if (b.result === "won") won++;
        peak = Math.max(peak, bank); maxDD = Math.max(maxDD, (peak - bank) / peak);
        curve.push({ i: curve.length, bank, ts: b.ts });
      }
    }
    return { bank, pnl, roi: staked ? pnl / staked : 0, clv: clvN ? clvS / clvN : null, clvN, maxDD, dd: peak ? (peak - bank) / peak : 0, settled, won, curve, staked };
  }

  // --- Rapprochement de noms d'équipes (import de cotes) ---
  const STOP = new Set(["fc", "cf", "ac", "as", "sc", "rc", "ogc", "ssc", "afc", "club", "de", "la", "le", "of", "the", "1", "sv", "vfb", "vfl", "tsg", "us", "ss", "cd", "ud", "rcd", "ca", "sl", "cp", "bc", "if", "sk", "ec", "stade", "olympique", "futbol", "calcio", "clube", "e", "sad", "futebol", "1899", "1901", "1904", "1909", "04", "05", "29", "alsace"]);
  const ALIAS = { munchen: "munich", muenchen: "munich", milano: "milan", internazionale: "inter", rennais: "rennes", lisboa: "lisbon", wolverhampton: "wolves", st: "saint", koln: "cologne", koeln: "cologne", utd: "united", man: "manchester", spurs: "tottenham", psv: "eindhoven", sevilla: "seville", deportivo: "", athletic: "athletic", mainz: "mainz", monchengladbach: "gladbach", borussia: "" };
  const CANON = [[/sporting clube de portugal|sporting cp|sporting lisbon|sporting lisboa/, "sporting lisbon"], [/sport lisboa e benfica|sl benfica/, "benfica"], [/sporting clube de braga|sc braga|sporting braga/, "braga"],
    [/vitoria guimaraes|vitoria sc|vitoria de guimaraes/, "vitoria guimaraes"], [/espanyol de barcelona|rcd espanyol/, "espanyol"], [/athletic club|athletic bilbao/, "athletic bilbao"], [/inter milan|internazionale/, "inter"],
    [/psv eindhoven|^psv$/, "psv"], [/az alkmaar|^az$/, "az alkmaar"], [/nec nijmegen|^nec$/, "nec nijmegen"], [/bayern munchen|bayern munich/, "bayern munich"]];
  const canon = s => { let x = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); for (const [re, v] of CANON) if (re.test(x)) return v; return x; };
  const norm = s => canon(s).replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
    .map(w => (w in ALIAS ? ALIAS[w] : w)).filter(w => w && !STOP.has(w));
  const pref = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };
  function nameScore(a, b) {
    const A = norm(a), B = norm(b); if (!A.length || !B.length) return 0;
    let hit = 0; for (const w of A) if (B.some(x => x === w || pref(w, x) >= 5 || (w.length > 3 && x.length > 3 && (x.startsWith(w) || w.startsWith(x))))) hit++;
    return (hit / A.length + hit / B.length) / 2 + (hit ? 0.25 : 0);
  }

  // --- Marchés complets : matrice recalée sur l'ensemble DC + pi, mi-temps, handicaps asiatiques ---
  function scaleToEnsemble(M, ens) {
    const n = MAXG + 1, base = [0, 0, 0];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) base[i > j ? 0 : i === j ? 1 : 2] += M[i * n + j];
    const k = ens.map((e, r) => e / base[r]), Q = new Float64Array(M.length);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) Q[i * n + j] = M[i * n + j] * k[i > j ? 0 : i === j ? 1 : 2];
    return Q;
  }
  function fromMatrix(M) {
    const n = MAXG + 1, r = { H: 0, D: 0, A: 0, BTTS: 0, O: {}, scores: [], margin: {}, total: {}, tH: {}, tA: {}, csH: 0, csA: 0, wtnH: 0, wtnA: 0, odd: 0, bttsO25: 0, M };
    for (const L of [0.5, 1.5, 2.5, 3.5, 4.5, 5.5]) r.O[L] = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const p = M[i * n + j]; if (!p) continue;
      if (i > j) r.H += p; else if (i === j) r.D += p; else r.A += p;
      if (i > 0 && j > 0) { r.BTTS += p; if (i + j > 2) r.bttsO25 += p; }
      for (const L in r.O) if (i + j > +L) r.O[L] += p;
      const d = Math.max(-3, Math.min(3, i - j)); r.margin[d] = (r.margin[d] || 0) + p;
      const t = Math.min(6, i + j); r.total[t] = (r.total[t] || 0) + p;
      for (const L of [0.5, 1.5, 2.5, 3.5]) { if (i > L) r.tH[L] = (r.tH[L] || 0) + p; if (j > L) r.tA[L] = (r.tA[L] || 0) + p; }
      if (j === 0) { r.csH += p; if (i > 0) r.wtnH += p; } if (i === 0) { r.csA += p; if (j > 0) r.wtnA += p; }
      if ((i + j) % 2) r.odd += p;
      r.scores.push({ s: `${i}-${j}`, p });
    }
    r.scores.sort((a, b) => b.p - a.p);
    return r;
  }
  // Handicap asiatique pour le domicile, ligne L (0, ±0.25, ±0.5…) : cote juste = 1 + P(perte pondérée) / P(gain pondéré)
  function asian(M, L) {
    const n = MAXG + 1, parts = (L * 4) % 2 !== 0 ? [L - 0.25, L + 0.25] : [L];
    let W = 0, Lo = 0;
    for (const l of parts) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const p = M[i * n + j], x = i - j + l;
      if (x > 0) W += p / parts.length; else if (x < 0) Lo += p / parts.length;
    }
    return { win: W, lose: Lo, fair: W > 0 ? 1 + Lo / W : Infinity };
  }
  function halves(lam, mu, sH, sA) {
    const G = 8, P1 = [], P2 = [];
    for (let i = 0; i <= G; i++) for (let j = 0; j <= G; j++) { P1.push(pois(i, lam * sH) * pois(j, mu * sA)); P2.push(pois(i, lam * (1 - sH)) * pois(j, mu * (1 - sA))); }
    const at = (P, i, j) => P[i * (G + 1) + j];
    const htft = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], ht = [0, 0, 0], sh = [0, 0, 0];
    let both = 0, more1 = 0, more2 = 0, eq = 0, z = 0;
    for (let i = 0; i <= G; i++) for (let j = 0; j <= G; j++) {
      const a = at(P1, i, j), r1 = i > j ? 0 : i === j ? 1 : 2; ht[r1] += a;
      for (let k = 0; k <= G; k++) for (let l = 0; l <= G; l++) {
        const b = at(P2, k, l), p = a * b; z += p;
        htft[r1][i + k > j + l ? 0 : i + k === j + l ? 1 : 2] += p;
        if (i + j > 0 && k + l > 0) both += p;
        if (i + j > k + l) more1 += p; else if (i + j < k + l) more2 += p; else eq += p;
      }
      sh[0] += 0; // placeholder (2e mi-temps calculée ci-dessous)
    }
    for (let k = 0; k <= G; k++) for (let l = 0; l <= G; l++) sh[k > l ? 0 : k === l ? 1 : 2] += at(P2, k, l);
    return { htft: htft.map(r => r.map(v => v / z)), ht, sh, both: both / z, more1: more1 / z, more2: more2 / z, eq: eq / z };
  }
  // Poids par nombre total de buts (lab5) appliqués avant le recalage 1N2
  function weightTotals(M, W) {
    if (!W) return M; const n = MAXG + 1, Q = new Float64Array(M.length); let s = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = M[i * n + j] * W[Math.min(6, i + j)]; Q[i * n + j] = v; s += v; }
    for (let k = 0; k < Q.length; k++) Q[k] /= s; return Q;
  }
  function full(f, sH = 0.46, sA = 0.438, W = null) {
    const M0 = weightTotals(matrix(f.lam, f.mu, f.rho), W), M = f.ens ? scaleToEnsemble(M0, f.ens) : M0;
    const r = fromMatrix(M); r.lam = f.lam; r.mu = f.mu; r.half = halves(f.lam, f.mu, sH, sA);
    r.ah = [-2, -1.5, -1.25, -1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1, 1.5, 2].map(L => ({ L, ...asian(M, L) }));
    r.dnb = r.H / (r.H + r.A);
    return r;
  }
  // Chemin probable du match : P(domicile mène / égalité / extérieur mène) à chaque minute, réel jusqu'à `now`, projeté ensuite
  function pathProbs(C, lam, mu, events, now) {
    const out = [], K = 13;
    for (let t = 0; t <= Math.min(now, NM); t++) { const s = stateAt(events, t); out.push({ t, H: +(s.hg > s.ag), D: +(s.hg === s.ag), A: +(s.hg < s.ag), real: true }); }
    const s0 = stateAt(events, now); let P = new Float64Array(K * K); P[Math.min(s0.hg, K - 2) * K + Math.min(s0.ag, K - 2)] = 1;
    const st = d => d <= -2 ? C.state.m2 : d === -1 ? C.state.m1 : d === 0 ? 0 : d === 1 ? C.state.p1 : C.state.p2;
    const upH = s0.man > 0 ? C.up : s0.man < 0 ? C.down : 0, upA = s0.man < 0 ? C.up : s0.man > 0 ? C.down : 0;
    for (let i = now; i < NM; i++) {
      const b = C.bins[binOf(i)], N = new Float64Array(K * K);
      for (let h = 0; h < K - 1; h++) for (let a = 0; a < K - 1; a++) {
        const p = P[h * K + a]; if (!p) continue; const d = h - a;
        const ph = 1 - Math.exp(-lam * Math.exp(C.c + b + st(d) + upH)), pa = 1 - Math.exp(-mu * Math.exp(C.c + b + st(-d) + upA));
        N[h * K + a] += p * (1 - ph) * (1 - pa); N[(h + 1) * K + a] += p * ph * (1 - pa); N[h * K + a + 1] += p * (1 - ph) * pa; N[(h + 1) * K + a + 1] += p * ph * pa;
      }
      P = N; let H = 0, D = 0, A = 0;
      for (let h = 0; h < K; h++) for (let a = 0; a < K; a++) { const p = P[h * K + a]; if (h > a) H += p; else if (h === a) D += p; else A += p; }
      out.push({ t: i + 1, H, D, A, real: false });
    }
    return out;
  }

  // Distribution des scores finaux depuis un état (minute t, score, supériorité numérique) : matrice K×K
  function finalDist(C, lam, mu, start, hg, ag, man) {
    const K = 13; let P = new Float64Array(K * K); P[Math.min(hg, K - 2) * K + Math.min(ag, K - 2)] = 1;
    const st = d => d <= -2 ? C.state.m2 : d === -1 ? C.state.m1 : d === 0 ? 0 : d === 1 ? C.state.p1 : C.state.p2;
    const upH = man > 0 ? C.up : man < 0 ? C.down : 0, upA = man < 0 ? C.up : man > 0 ? C.down : 0;
    for (let i = start; i < NM; i++) {
      const b = C.bins[binOf(i)], N = new Float64Array(K * K);
      for (let h = 0; h < K - 1; h++) for (let a = 0; a < K - 1; a++) {
        const p = P[h * K + a]; if (!p) continue; const d = h - a;
        const ph = 1 - Math.exp(-lam * Math.exp(C.c + b + st(d) + upH)), pa = 1 - Math.exp(-mu * Math.exp(C.c + b + st(-d) + upA));
        N[h * K + a] += p * (1 - ph) * (1 - pa); N[(h + 1) * K + a] += p * ph * (1 - pa); N[h * K + a + 1] += p * (1 - ph) * pa; N[(h + 1) * K + a + 1] += p * ph * pa;
      }
      P = N;
    }
    return { P, K };
  }
  // Quand tombent les buts : par tranche de 15 min, premier but, 0-0 à la pause
  function goalTiming(C, lam, mu) {
    const K = 13; let P = new Float64Array(K * K); P[0] = 1;
    const st = d => d <= -2 ? C.state.m2 : d === -1 ? C.state.m1 : d === 0 ? 0 : d === 1 ? C.state.p1 : C.state.p2;
    const bins = Array.from({ length: 8 }, () => ({ xH: 0, xA: 0, none: 1 })); let first = { H: 0, A: 0 }, q0 = 1; const firstBy = [];
    let Z = null, zb = -1;
    for (let i = 0; i < NM; i++) {
      const bi = binOf(i), b = C.bins[bi], N = new Float64Array(K * K);
      if (bi !== zb) { if (Z) bins[zb].none = Z.reduce((x, y) => x + y, 0); Z = new Float64Array(P); zb = bi; }
      const Zn = new Float64Array(K * K);
      for (let h = 0; h < K - 1; h++) for (let a = 0; a < K - 1; a++) {
        const p = P[h * K + a], z = Z[h * K + a]; if (!p && !z) continue; const d = h - a;
        const rh = lam * Math.exp(C.c + b + st(d)), ra = mu * Math.exp(C.c + b + st(-d)), ph = 1 - Math.exp(-rh), pa = 1 - Math.exp(-ra);
        bins[bi].xH += p * rh; bins[bi].xA += p * ra;
        if (h === 0 && a === 0) { first.H += p * (ph * (1 - pa) + 0.5 * ph * pa); first.A += p * ((1 - ph) * pa + 0.5 * ph * pa); }
        N[h * K + a] += p * (1 - ph) * (1 - pa); N[(h + 1) * K + a] += p * ph * (1 - pa); N[h * K + a + 1] += p * (1 - ph) * pa; N[(h + 1) * K + a + 1] += p * ph * pa;
        Zn[h * K + a] = z * (1 - ph) * (1 - pa);
      }
      P = N; Z = Zn; q0 = P[0]; firstBy.push(1 - q0);
    }
    bins[zb].none = Z.reduce((x, y) => x + y, 0);
    const med = firstBy.findIndex(v => v >= 0.5);
    return { bins: bins.map(x => ({ ...x, any: 1 - x.none })), first: { ...first, none: q0 }, firstBy, median: med < 0 ? null : med + 1, ht00: null };
  }
  // Probabilité jointe exacte de conditions sur le même match (combiné « même match ») depuis la matrice
  function joint(M, conds) {
    const n = MAXG + 1; let p = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (conds.every(c => c(i, j))) p += M[i * n + j];
    return p;
  }

  return { finalDist, goalTiming, joint, weightTotals, full, asian, halves, pathProbs, scaleToEnsemble, fromMatrix, matrix, markets, project, timeline, stateAt, clockLabel, binOf, NM, S1, S2, devig, overround, ev, kelly, arbitrage, bankrollStats, nameScore, norm };
})();
if (typeof module !== "undefined") module.exports = L90;
