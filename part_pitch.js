// ---------- Terrain vivant : le relief suit la menace de but que le moteur calcule minute par minute ----------
// Hauteur d'une colline = probabilité que l'équipe marque dans les 10 minutes suivantes (moteur live : rythme par tranche,
// score, cartons rouges). Ce ne sont pas des positions de joueurs : le moteur n'a pas de données de position.
const PF_L = 10.5, PF_W = 6.8, PF_NX = 150, PF_NZ = 98, PF_GOALX = 4.72;
function pfShort(n) { const s = short(n); return s.length > 14 ? s.split(" ").sort((a, b) => b.length - a.length)[0] : s; }
// Série minute par minute : rythmes de but réels jusqu'à upTo, puis projetés à état constant
function threatSeries(f, events, upTo) {
  const [lam, mu] = LR(f), n = L90.NM, rh = new Float64Array(n), ra = new Float64Array(n), th = new Float64Array(n), ta = new Float64Array(n);
  const st = d => d <= -2 ? C.state.m2 : d === -1 ? C.state.m1 : d === 0 ? 0 : d === 1 ? C.state.p1 : C.state.p2;
  for (let i = 0; i < n; i++) {
    const s = L90.stateAt(events, Math.min(i, upTo)), d = s.hg - s.ag, b = C.bins[L90.binOf(i)];
    const upH = s.man > 0 ? C.up : s.man < 0 ? C.down : 0, upA = s.man < 0 ? C.up : s.man > 0 ? C.down : 0;
    rh[i] = lam * Math.exp(C.c + b + st(d) + upH); ra[i] = mu * Math.exp(C.c + b + st(-d) + upA);
  }
  for (let i = 0; i < n; i++) { let sh = 0, sa = 0; for (let k = i; k < Math.min(n, i + 10); k++) { sh += rh[k]; sa += ra[k]; } th[i] = 1 - Math.exp(-sh); ta[i] = 1 - Math.exp(-sa); }
  return { rh, ra, th, ta, n, upTo };
}
const pfAt = (arr, tau) => { const i = Math.max(0, Math.min(arr.length - 1, Math.floor(tau))), j = Math.min(arr.length - 1, i + 1), k = Math.max(0, Math.min(1, tau - i)); return arr[i] * (1 - k) + arr[j] * k; };
// Lignes du terrain (1 unité = 10 m), densifiées pour épouser le relief
function pfLines() {
  const segs = [], add = pts => { for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.08)); for (let k = 0; k < n; k++) segs.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], [a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n]); } };
  const L = PF_L / 2, W = PF_W / 2, rect = (x0, z0, x1, z1) => add([[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]]);
  rect(-L, -W, L, W); add([[0, -W], [0, W]]);
  const circ = (cx, cz, r, a0 = 0, a1 = Math.PI * 2) => { const p = []; for (let k = 0; k <= 64; k++) { const a = a0 + (a1 - a0) * k / 64; p.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); } add(p); };
  circ(0, 0, 0.915);
  for (const s of [-1, 1]) {
    rect(s * L, -2.016, s * (L - 1.65), 2.016); rect(s * L, -0.916, s * (L - 0.55), 0.916);
    const a = Math.acos(0.55 / 0.915); circ(s * (L - 1.1), 0, 0.915, s > 0 ? Math.PI - a : -a, s > 0 ? Math.PI + a : a);
  }
  return segs;
}
function pfMix(c1, c2, w) { return [c1[0] * w + c2[0] * (1 - w), c1[1] * w + c2[1] * (1 - w), c1[2] * w + c2[2] * (1 - w)]; }
const PF_SLATE = [0.13, 0.165, 0.235], PF_HOME = [0x23 / 255, 0x99 / 255, 0xb3 / 255], PF_AWAY = [0xc4 / 255, 0x73 / 255, 0x2a / 255];
// Construit la scène ; setFrame(tau) place le relief à la minute tau (continue)
function pitchBuild(T, f, events, upTo, opts = {}) {
  const scene = new T.Scene(), g = new T.Group(); scene.add(g);
  const cam = new T.PerspectiveCamera(opts.fov || 27, opts.aspect || 1.6, 0.1, 200);
  scene.add(new T.HemisphereLight(0xdfe7ff, 0x05070d, 0.62));
  const key = new T.DirectionalLight(0xffffff, 0.9); key.position.set(-6, 12, 7); scene.add(key);
  const rim = new T.DirectionalLight(0x9fe7f5, 0.25); rim.position.set(8, 4, -8); scene.add(rim);
  // ombre portée douce sous la nappe
  const sc = document.createElement("canvas"); sc.width = sc.height = 128; const sx = sc.getContext("2d"), gr = sx.createRadialGradient(64, 64, 10, 64, 64, 64);
  gr.addColorStop(0, "rgba(0,0,0,.75)"); gr.addColorStop(0.7, "rgba(0,0,0,.35)"); gr.addColorStop(1, "rgba(0,0,0,0)"); sx.fillStyle = gr; sx.fillRect(0, 0, 128, 128);
  const shadow = new T.Mesh(new T.PlaneGeometry(PF_L * 1.35, PF_W * 1.5), new T.MeshBasicMaterial({ map: new T.CanvasTexture(sc), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.set(0.5, -0.42, 0.4); g.add(shadow);
  const geo = new T.PlaneGeometry(PF_L, PF_W, PF_NX, PF_NZ); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, nV = pos.count, col = new Float32Array(nV * 3); geo.setAttribute("color", new T.BufferAttribute(col, 3));
  const X = new Float32Array(nV), Z = new Float32Array(nV); for (let v = 0; v < nV; v++) { X[v] = pos.getX(v); Z[v] = pos.getZ(v); }
  const mesh = new T.Mesh(geo, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02, side: T.DoubleSide })); g.add(mesh);
  const segs = pfLines(), lg = new T.BufferGeometry(), lp = new Float32Array(segs.length * 3); lg.setAttribute("position", new T.BufferAttribute(lp, 3));
  const lines = new T.LineSegments(lg, new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42 })); g.add(lines);
  const ring = new T.Mesh(new T.RingGeometry(0.2, 0.26, 48), new T.MeshBasicMaterial({ color: 0xe9eefb, transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; g.add(ring);
  const S = threatSeries(f, events, upTo), goals = events.filter(e => e.type === "goal").sort((a, b) => a.t - b.t);
  // à chaque but : pic au point de penalty de la cage visée, décalé pour ne pas superposer deux buts
  const side = [0, 0]; const gp = goals.map(e => { const k = side[e.side]++; return { ...e, x: e.side === 0 ? PF_GOALX - 1.1 : -PF_GOALX + 1.1, z: (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.55 }; });
  let H = new Float32Array(nV); const cur = { tau: -1 };
  const gauss = (dx, dz, sx_, sz_) => Math.exp(-(dx * dx) / (2 * sx_ * sx_) - (dz * dz) / (2 * sz_ * sz_));
  function params(tau) {
    const th = pfAt(S.th, Math.min(tau, S.n - 1)), ta = pfAt(S.ta, Math.min(tau, S.n - 1)), amp = p => 3.4 * (1 - Math.exp(-4 * p));
    const fin = tau >= S.n - 0.01;
    return { ah: fin ? 0.25 : amp(th), aa: fin ? 0.25 : amp(ta), front: (th / Math.max(1e-6, th + ta) - 0.5) * 9, th, ta, fin,
      spikes: gp.filter(e => e.t <= tau).map(e => { const d = tau - e.t; return { ...e, a: fin ? 1.5 : d < 0.9 ? 2.8 * ease(d / 0.9) : 0.45 + 2.35 * Math.exp(-(d - 0.9) / 3.2) }; }) };
  }
  function heightAt(x, z, P, t) {
    const edge = Math.min(1, (PF_L / 2 - Math.abs(x)) * 2.2 + 0.25) * Math.min(1, (PF_W / 2 - Math.abs(z)) * 2.2 + 0.25);
    let hh = P.ah * gauss(x - 2.5, z, 1.55, 1.75), ha = P.aa * gauss(x + 2.5, z, 1.55, 1.75);
    for (const s of P.spikes) { const v = s.a * gauss(x - s.x, z - s.z, 0.26, 0.26); if (s.side === 0) hh += v; else ha += v; }
    const wob = 0.045 * Math.sin(1.25 * x + t * 0.00055) * Math.cos(1.6 * z - t * 0.0004);
    return [Math.max(0, (hh + ha) * edge) + wob, hh, ha];
  }
  function setFrame(tau, now = 0) {
    const P = params(tau); cur.tau = tau; cur.P = P;
    for (let v = 0; v < nV; v++) {
      const [y, hh, ha] = heightAt(X[v], Z[v], P, now); pos.setY(v, y); H[v] = y;
      // nappe ardoise ; la couleur d'une équipe n'apparaît que là où elle menace
      const tot = hh + ha, w = tot > 1e-4 ? hh / tot : 0.5, ws = w * w * (3 - 2 * w), k = Math.min(1, Math.pow(tot / 1.25, 0.85));
      const stripe = Math.floor((X[v] + PF_L / 2) / (PF_L / 16)) % 2 ? 1 : 0.9, lift = 0.86 + Math.min(0.3, y * 0.09);
      const team = pfMix(PF_HOME, PF_AWAY, ws), c = pfMix(team, PF_SLATE, k);
      col[v * 3] = c[0] * stripe * lift; col[v * 3 + 1] = c[1] * stripe * lift; col[v * 3 + 2] = c[2] * stripe * lift;
    }
    pos.needsUpdate = true; geo.attributes.color.needsUpdate = true; geo.computeVertexNormals();
    for (let i = 0; i < segs.length; i++) { const [x, z] = segs[i]; lp[i * 3] = x; lp[i * 3 + 1] = heightAt(x, z, P, now)[0] + 0.018; lp[i * 3 + 2] = z; }
    lg.attributes.position.needsUpdate = true;
    const last = P.spikes[P.spikes.length - 1], dt = last ? tau - last.t : 99;
    if (last && dt < 2.5 && !P.fin) { ring.position.set(last.x, 0.03, last.z); const k = dt / 2.5; ring.scale.setScalar(1 + k * 5); ring.material.opacity = 0.85 * (1 - k); } else ring.material.opacity = 0;
    return P;
  }
  cam.position.set(-8.6, 10.2, 11.4); cam.lookAt(0.2, 0.55, 0);
  return { scene, cam, g, S, setFrame, cur, goals: gp };
}
// ---------- Frise de la menace de but (canvas 2D) ----------
function pfTimeline(ctx, S, events, tau, x0, y0, w, h, o = {}) {
  const n = S.n, mx = Math.max(0.08, ...S.th, ...S.ta) * 1.12, mid = y0 + h / 2, X = t => x0 + w * t / n, Y = (p, s) => mid - s * (h / 2 - 6) * p / mx;
  const fs = o.fs || 11, hc = "#2399B3", ac = "#C4732A", ink = o.ink || "#7C88A8";
  ctx.save(); ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(124,136,168,.35)"; ctx.lineWidth = Math.max(1, fs / 11); ctx.beginPath(); ctx.moveTo(x0, mid); ctx.lineTo(x0 + w, mid); ctx.stroke();
  const ht = 45 + L90.S1; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(X(ht), y0); ctx.lineTo(X(ht), y0 + h); ctx.stroke(); ctx.setLineDash([]);
  for (const [arr, s, c] of [[S.th, 1, hc], [S.ta, -1, ac]]) {
    for (const part of [0, 1]) {
      const a = part ? Math.min(n - 1, Math.max(0, Math.floor(S.upTo))) : 0, b = part ? n - 1 : Math.min(n - 1, Math.max(0, Math.ceil(S.upTo)));
      if (b <= a && !(part === 0 && b === a)) continue;
      ctx.beginPath(); ctx.moveTo(X(a), mid); for (let t = a; t <= b; t++) ctx.lineTo(X(t), Y(arr[t], s)); ctx.lineTo(X(b), mid); ctx.closePath();
      ctx.fillStyle = c + (part ? "22" : "55"); ctx.fill();
      ctx.beginPath(); for (let t = a; t <= b; t++) t === a ? ctx.moveTo(X(t), Y(arr[t], s)) : ctx.lineTo(X(t), Y(arr[t], s));
      ctx.strokeStyle = c; ctx.globalAlpha = part ? 0.5 : 1; ctx.lineWidth = Math.max(1.2, fs / 7); if (part) ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
  }
  for (const e of events) {
    const x = X(e.t), yy = e.side === 0 ? y0 + 4 : y0 + h - 4, past = e.t <= tau;
    ctx.globalAlpha = past ? 1 : 0.35;
    if (e.type === "goal") { ctx.fillStyle = "#E9EEFB"; ctx.beginPath(); ctx.arc(x, yy, fs * 0.42, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = e.side === 0 ? hc : ac; ctx.lineWidth = Math.max(1, fs / 9); ctx.stroke(); }
    else { ctx.fillStyle = "#FF6B6B"; ctx.fillRect(x - fs * 0.22, yy - fs * 0.32, fs * 0.44, fs * 0.64); }
    ctx.globalAlpha = 1;
  }
  const px = X(Math.min(n, tau)); ctx.strokeStyle = "#E9EEFB"; ctx.lineWidth = Math.max(1.5, fs / 6); ctx.beginPath(); ctx.moveTo(px, y0 - 2); ctx.lineTo(px, y0 + h + 2); ctx.stroke();
  ctx.fillStyle = ink; ctx.font = `${fs}px "IBM Plex Sans", sans-serif`; ctx.textBaseline = "top";
  ctx.textAlign = "left"; ctx.fillText("1'", x0, y0 + h + fs * 0.4); ctx.textAlign = "center"; ctx.fillText("Mi-temps", X(ht), y0 + h + fs * 0.4); ctx.textAlign = "right"; ctx.fillText("Fin", x0 + w, y0 + h + fs * 0.4);
  ctx.restore();
}
// ---------- Composant de l'onglet Live ----------
const PF = { r: null, inst: null, sig: "", tau: 0, target: 0, playing: false, raf: 0, last: 0, rot: 0, drag: null, toast: null, lastGoal: -1 };
function pitchPanel(f) {
  return `<div class="pf" id="pf"><div class="pf-stage" id="pfStage">
      <div class="pf-score" id="pfScore"></div><div class="pf-min num" id="pfMin"></div><div class="pf-toast" id="pfToast" hidden></div></div>
    <canvas class="pf-tl" id="pfTl" aria-label="Frise de la menace de but"></canvas>
    <div class="pf-ctrl"><button class="btn small" id="pfPlay" aria-label="Lecture">Lecture</button><input type="range" id="pfRange" min="0" max="${L90.NM}" step="0.25" aria-label="Minute affichée"><span class="pf-leg"><i class="key h"></i>${esc(pfShort(f.home))} <b class="num" id="pfTh"></b><i class="key a"></i>${esc(pfShort(f.away))} <b class="num" id="pfTa"></b></span></div>
    <p class="note">Relief : chance que chaque équipe marque dans les 10 minutes, selon le moteur live (moment du match, score, cartons rouges), devant la cage qu'elle attaque. Pics : buts. Ce n'est pas un relevé de positions de joueurs. Glisse pour tourner.</p></div>`;
}
function pitchMount(f) {
  const stage = $("#pfStage"); if (!stage) return;
  if (!window.THREE) { stage.innerHTML = `<div class="empty">La vue 3D demande WebGL, indisponible sur cet appareil.</div>`; return; }
  try { if (!PF.r) { PF.r = new THREE.WebGLRenderer({ antialias: true, alpha: true }); PF.r.setPixelRatio(Math.min(2, devicePixelRatio || 1)); pfEvents(PF.r.domElement); } }
  catch { stage.innerHTML = `<div class="empty">WebGL indisponible.</div>`; return; }
  const L = liveOf(f), evs = L.events.slice().sort((a, b) => a.t - b.t), played = evs.length > 0 || L.t > 0;
  const upTo = played ? (L.t || L90.NM) : 0, target = played ? upTo : L90.NM;
  const base = f.key + "|" + JSON.stringify(evs), sig = base + "|" + L.t;
  if (PF.sig !== sig) {
    const same = PF.base === base, oldT = PF.target, rm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    PF.inst = pitchBuild(THREE, f, evs, upTo); PF.sig = sig; PF.base = base; PF.target = target; PF.f = f; PF.evs = evs;
    if (same) { if (!PF.playing && PF.tau >= oldT - 0.01) PF.tau = target; PF.tau = Math.min(PF.tau, target); }  // le live avance : on suit sans rejouer
    else { PF.tau = rm ? target : 0; PF.playing = !rm; PF.lastGoal = -1; }
  }
  stage.prepend(PF.r.domElement); PF.r.domElement.className = "pf-c";
  const w = stage.clientWidth || 600, narrow = w < 560, h = narrow ? Math.round(w * 1.12) : Math.round(Math.min(560, Math.max(300, w * 0.62)));
  const cam = PF.inst.cam; PF.base = narrow ? 0.55 : 0;
  if (narrow) { cam.fov = 33; cam.position.set(-7.9, 14.4, 12.2); cam.lookAt(1.1, 0.1, -0.7); } else { cam.fov = 27; cam.position.set(-8.6, 10.2, 11.4); cam.lookAt(0.2, 0.55, 0); }
  PF.r.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix();
  const rg = $("#pfRange"); rg.max = PF.target; rg.value = PF.tau;
  rg.oninput = () => { PF.tau = +rg.value; PF.playing = false; pfButtons(); };
  $("#pfPlay").onclick = () => { if (!PF.playing && PF.tau >= PF.target - 0.01) PF.tau = 0; PF.playing = !PF.playing; PF.last = performance.now(); pfButtons(); };
  pfButtons();
  if (!PF.raf) { PF.last = performance.now(); const loop = now => { if (!document.body.contains(PF.r.domElement)) { PF.raf = 0; return; } pfFrame(now); PF.raf = requestAnimationFrame(loop); }; PF.raf = requestAnimationFrame(loop); }
}
function pfButtons() { const b = $("#pfPlay"); if (b) b.textContent = PF.playing ? "Pause" : PF.tau >= PF.target - 0.01 ? "Rejouer" : "Lecture"; }
function pfFrame(now) {
  const dt = Math.min(0.1, (now - PF.last) / 1000); PF.last = now;
  if (PF.playing) { PF.tau = Math.min(PF.target, PF.tau + dt * L90.NM / 18); if (PF.tau >= PF.target) { PF.playing = false; pfButtons(); } }
  { const rg = $("#pfRange"); if (rg && document.activeElement !== rg) rg.value = PF.tau; }
  const I = PF.inst, P = I.setFrame(PF.tau, now), rm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  I.g.rotation.y = (PF.base || 0) + PF.rot + (PF.drag || rm ? 0 : Math.sin(now / 5200) * 0.05);
  PF.r.render(I.scene, I.cam);
  const f = PF.f, s = L90.stateAt(PF.evs, PF.tau), gl = side => PF.evs.filter(e => e.type === "goal" && e.side === side && e.t <= PF.tau).map(e => L90.clockLabel(e.t)).join(" · ");
  const sc = $("#pfScore"); if (sc) sc.innerHTML = `<div><span>${esc(pfShort(f.home))}</span><b class="num">${s.hg}</b><small>${gl(0)}</small></div><div><span>${esc(pfShort(f.away))}</span><b class="num">${s.ag}</b><small>${gl(1)}</small></div>`;
  const mn = $("#pfMin"); if (mn) mn.innerHTML = `${PF.tau >= L90.NM - 0.01 ? "Fin" : L90.clockLabel(Math.max(1, Math.ceil(PF.tau)))}<small>${PF.evs.length || liveOf(f).t ? (PF.tau <= PF.inst.S.upTo ? "réel" : "projeté") : "match attendu, si 0-0"}</small>`;
  const g = PF.evs.filter(e => e.type === "goal" && e.t <= PF.tau).length;
  if (g !== PF.lastGoal) { const e = PF.evs.filter(x => x.type === "goal" && x.t <= PF.tau).pop(); const tt = $("#pfToast");
    if (tt && e && PF.lastGoal >= 0 && g > PF.lastGoal) { tt.hidden = false; tt.innerHTML = `<b>But</b> ${esc(short(e.side === 0 ? f.home : f.away))} · ${L90.clockLabel(e.t)}${e.who ? " · " + esc(e.who) : ""}`; clearTimeout(PF.toast); PF.toast = setTimeout(() => tt.hidden = true, 2600); }
    PF.lastGoal = g; }
  const th = $("#pfTh"), ta = $("#pfTa"); if (th) th.textContent = pct(P.th); if (ta) ta.textContent = pct(P.ta);
  const cv = $("#pfTl"); if (cv) { const w = cv.clientWidth, h = cv.clientHeight, d = Math.min(2, devicePixelRatio || 1); if (cv.width !== Math.round(w * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
    const x = cv.getContext("2d"); x.setTransform(d, 0, 0, d, 0, 0); x.clearRect(0, 0, w, h); pfTimeline(x, I.S, PF.evs, PF.tau, 6, 6, w - 12, h - 26, { fs: 11 }); }
}
function pfEvents(el) {
  el.style.touchAction = "pan-y";
  el.addEventListener("pointerdown", e => { PF.drag = { x: e.clientX, r: PF.rot }; el.setPointerCapture(e.pointerId); });
  el.addEventListener("pointermove", e => { if (PF.drag) PF.rot = Math.max(-0.9, Math.min(0.9, PF.drag.r + (e.clientX - PF.drag.x) / 220)); });
  const up = () => PF.drag = null; el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
}
document.addEventListener("click", e => { const b = e.target.closest("[data-l3v]"); if (!b) return; S.l3v = b.dataset.l3v; render(); });
