// ---------- Barres 3D : moteur commun (une seule scène visible à la fois, un seul contexte WebGL) ----------
// spec = { rows:[libellé], cols:[libellé], bars:[{r, c, h, color, dim, glow, tip}], plane, bw, bd, gapZ, sig }
const B3 = { r: null, inst: null, raf: 0, rot: 0, drag: null, moved: 0, hover: null, sig: "", t0: 0 };
const B3_BOOK = { "Bet365": 0xFFC857, "Winamax (FR)": 0xE5484D, "Betclic (FR)": 0xF08A3C, "Unibet (FR)": 0x3DDC97, "Pinnacle": 0x9FE7F5 };
const b3Color = b => B3_BOOK[b] ?? 0x8569D1;
const b3Hex = n => "#" + n.toString(16).padStart(6, "0");
function b3Panel(id) {
  return `<div class="b3" id="${id}"><div class="b3-stage" id="${id}-stage"><div class="b3-labels" id="${id}-lab"></div><div class="b3-tip" id="${id}-tip" hidden></div></div></div>`;
}
function b3Dispose(o) { o?.traverse?.(x => { x.geometry?.dispose?.(); const m = x.material; (Array.isArray(m) ? m : [m]).forEach(mm => mm?.dispose?.()); }); }
function b3Build(T, spec) {
  const scene = new T.Scene(), g = new T.Group(); scene.add(g);
  scene.add(new T.HemisphereLight(0xdfe7ff, 0x05070d, 0.7));
  const key = new T.DirectionalLight(0xffffff, 0.85); key.position.set(-5, 10, 7); scene.add(key);
  const rim = new T.DirectionalLight(0x9fe7f5, 0.3); rim.position.set(6, 3, -8); scene.add(rim);
  const nR = spec.rows.length, nC = spec.cols.length, sx = spec.sx || 1, sz = spec.sz || 1;
  const W = nC * sx, D = nR * sz, x0 = -W / 2 + sx / 2, z0 = -D / 2 + sz / 2;
  const X = c => x0 + c * sx, Z = r => z0 + r * sz;
  // socle et grille fine
  const lo = Math.min(0, ...spec.bars.map(b => b.h)), hi = Math.max(0, ...spec.bars.map(b => b.h));
  const grid = [];
  for (let r = 0; r <= nR; r++) grid.push(-W / 2, 0, -D / 2 + r * sz, W / 2, 0, -D / 2 + r * sz);
  for (let c = 0; c <= nC; c++) grid.push(-W / 2 + c * sx, 0, -D / 2, -W / 2 + c * sx, 0, D / 2);
  const gg = new T.BufferGeometry(); gg.setAttribute("position", new T.Float32BufferAttribute(grid, 3));
  g.add(new T.LineSegments(gg, new T.LineBasicMaterial({ color: 0x2b3a5d, transparent: true, opacity: 0.55 })));
  if (spec.plane) {  // plan de la valeur nulle : ce qui dépasse bat la cote juste
    const pl = new T.Mesh(new T.PlaneGeometry(W + 0.5, D + 0.5), new T.MeshBasicMaterial({ color: 0x9fe7f5, transparent: true, opacity: 0.075, side: T.DoubleSide, depthWrite: false }));
    pl.rotation.x = -Math.PI / 2; pl.renderOrder = 2; g.add(pl);
    const eg = new T.EdgesGeometry(new T.PlaneGeometry(W + 0.5, D + 0.5)); const el = new T.LineSegments(eg, new T.LineBasicMaterial({ color: 0x9fe7f5, transparent: true, opacity: 0.35 }));
    el.rotation.x = -Math.PI / 2; g.add(el);
  }
  const box = new T.BoxGeometry(1, 1, 1), bars = [];
  for (const b of spec.bars) {
    const col = new T.Color(b.color ?? 0x8569D1);
    const m = new T.MeshStandardMaterial({ color: col, roughness: 0.45, metalness: 0.08, transparent: true, opacity: b.dim ? 0.38 : 0.96,
      emissive: col.clone().multiplyScalar(b.glow ? 0.45 : 0.06) });
    const mesh = new T.Mesh(box, m); mesh.scale.set((spec.bw || 0.6) * sx, Math.max(0.012, Math.abs(b.h)), (spec.bd || 0.6) * sz);
    mesh.position.set(X(b.c), b.h / 2, Z(b.r)); mesh.userData = { b, h: b.h, base: m.emissive.clone() };
    if (b.glow) { const eg = new T.LineSegments(new T.EdgesGeometry(box), new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })); mesh.add(eg); }
    g.add(mesh); bars.push(mesh);
  }
  const span = Math.max(W, D * 0.9, hi - lo + 1);
  return { scene, g, bars, W, D, lo, hi, X, Z, nR, nC, span };
}
function b3Mount(id, spec) {
  const stage = $(`#${id}-stage`); if (!stage) return;
  if (!window.THREE) { stage.innerHTML = `<div class="empty">La vue 3D demande WebGL, indisponible sur cet appareil.</div>`; return; }
  try { if (!B3.r) { B3.r = new THREE.WebGLRenderer({ antialias: true, alpha: true }); B3.r.setPixelRatio(Math.min(2, devicePixelRatio || 1)); b3Events(B3.r.domElement); } }
  catch { stage.innerHTML = `<div class="empty">WebGL indisponible.</div>`; return; }
  const sig = id + "|" + (spec.sig || JSON.stringify(spec.bars.map(b => [b.r, b.c, +b.h.toFixed(3)])));
  if (B3.sig !== sig) { if (B3.inst) b3Dispose(B3.inst.scene); B3.inst = b3Build(THREE, spec); B3.sig = sig; B3.t0 = performance.now(); B3.rot = 0; }
  B3.inst.spec = spec; B3.id = id;
  stage.prepend(B3.r.domElement); B3.r.domElement.className = "b3-c";
  const w = stage.clientWidth || 600, narrow = w < 560, h = narrow ? Math.round(w * (spec.tallMobile || 1.05)) : Math.round(Math.min(spec.maxH || 520, Math.max(300, w * (spec.ratio || 0.55))));
  const I = B3.inst, cam = I.cam || (I.cam = new THREE.PerspectiveCamera(30, 1, 0.1, 400));
  const el = spec.elev ?? 0.62, az = spec.az ?? -0.55, cy = (I.lo + I.hi) / 2;
  cam.fov = narrow ? 34 : 30; B3.r.setSize(w, h); cam.aspect = w / h;
  // cadrage : on recule jusqu'à ce que tout le socle et toutes les barres (avec la place des étiquettes) tiennent dans l'image
  const mx = narrow ? 0.9 : 0.86, showRows = spec.rows.some(Boolean) && (!narrow || spec.rows.length <= 4 || spec.mobileRows), padL = showRows ? (narrow ? 2.8 : 2.4) : 0.4, pts = [];
  // points réellement occupés : sommets des barres, coins du socle, ancres des étiquettes
  for (const b of spec.bars) pts.push(new THREE.Vector3(I.X(b.c), b.h, I.Z(b.r)));
  for (const x of [-I.W / 2, I.W / 2]) for (const z of [-I.D / 2, I.D / 2 + 0.6]) pts.push(new THREE.Vector3(x, 0, z));
  for (const z of [-I.D / 2, I.D / 2]) pts.push(new THREE.Vector3(-I.W / 2 - padL, 0, z));
  const v = new THREE.Vector3();
  cam.clearViewOffset(); let box = null;
  for (let d = 3; d < 200; d *= 1.03) {
    cam.position.set(Math.sin(az) * Math.cos(el) * d, cy + Math.sin(el) * d, Math.cos(az) * Math.cos(el) * d); cam.lookAt(0, cy, 0); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9, ok = true;
    for (const p of pts) { v.copy(p).project(cam); if (v.z >= 1) { ok = false; break; } x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    if (ok && x1 - x0 < 2 * mx && y1 - y0 < 2 * mx) { box = [x0, x1, y0, y1]; break; }
  }
  // décalage de l'image pour centrer le contenu (le socle et les étiquettes ne sont pas symétriques autour de la cible)
  if (box) { cam.setViewOffset(w, h, (box[0] + box[1]) / 2 * w / 2, -(box[2] + box[3]) / 2 * h / 2, w, h); cam.updateProjectionMatrix(); }
  // étiquettes HTML (lignes, colonnes), recalées à chaque image
  const lab = $(`#${id}-lab`);
  lab.innerHTML = spec.cols.map((c, i) => `<span class="b3-l col" data-c="${i}">${esc(c)}</span>`).join("") + (!showRows ? "" : spec.rows.map((r, i) => r ? `<span class="b3-l row" data-r="${i}">${esc(r)}</span>` : "").join(""));
  B3.labs = [...lab.children].map(e => ({ e, p: e.dataset.c != null ? new THREE.Vector3(I.X(+e.dataset.c), 0, I.D / 2 + 0.45) : new THREE.Vector3(-I.W / 2 - 0.25, 0, I.Z(+e.dataset.r)), row: e.dataset.r != null }));
  B3.tip = $(`#${id}-tip`); B3.stage = stage;
  if (!B3.raf) { const loop = now => { if (!document.body.contains(B3.r.domElement)) { B3.raf = 0; return; } b3Frame(now); B3.raf = requestAnimationFrame(loop); }; B3.raf = requestAnimationFrame(loop); }
}
function b3Frame(now) {
  const I = B3.inst; if (!I) return;
  const rm = matchMedia("(prefers-reduced-motion: reduce)").matches, k = rm ? 1 : Math.min(1, (now - B3.t0) / 900), e = 1 - Math.pow(1 - k, 3);
  for (const [i, m] of I.bars.entries()) { const kk = rm ? 1 : Math.max(0, Math.min(1, (now - B3.t0 - i * 6) / 700)), ee = 1 - Math.pow(1 - kk, 3), h = m.userData.h * ee;
    m.scale.y = Math.max(0.012, Math.abs(h)); m.position.y = h / 2; }
  I.g.rotation.y = B3.rot + (B3.drag || rm ? 0 : Math.sin(now / 6000) * 0.04 * e);
  B3.r.render(I.scene, I.cam);
  const w = B3.r.domElement.clientWidth, h = B3.r.domElement.clientHeight, v = new THREE.Vector3();
  for (const L of B3.labs || []) { v.copy(L.p).applyMatrix4(I.g.matrixWorld).project(I.cam); const x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h;
    L.e.style.transform = `translate(${x}px,${y}px) translate(${L.row ? "-100%" : "-50%"},-50%)`; }
}
function b3Pick(ev) {
  const I = B3.inst; if (!I) return null; const r = B3.r.domElement.getBoundingClientRect();
  const m = new THREE.Vector2((ev.clientX - r.left) / r.width * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  const rc = new THREE.Raycaster(); rc.setFromCamera(m, I.cam); const hit = rc.intersectObjects(I.bars, false)[0];
  return hit ? hit.object : null;
}
function b3Hover(ev, sticky) {
  const o = b3Pick(ev), I = B3.inst;
  if (B3.hover && B3.hover !== o) B3.hover.material.emissive.copy(B3.hover.userData.base);
  B3.hover = o; const tip = B3.tip; if (!tip) return;
  if (!o) { if (!sticky) tip.hidden = true; return; }
  o.material.emissive.copy(o.userData.base).addScalar(0.18);
  const r = B3.stage.getBoundingClientRect(); tip.innerHTML = o.userData.b.tip; tip.hidden = false;
  const x = Math.min(r.width - tip.offsetWidth - 8, Math.max(8, ev.clientX - r.left + 12)), y = Math.max(8, Math.min(r.height - tip.offsetHeight - 8, ev.clientY - r.top - tip.offsetHeight - 10));
  tip.style.left = x + "px"; tip.style.top = y + "px";
}
function b3Events(el) {
  el.style.touchAction = "pan-y";
  el.addEventListener("pointerdown", e => { B3.drag = { x: e.clientX, r: B3.rot }; B3.moved = 0; });
  el.addEventListener("pointermove", e => { if (B3.drag && (e.buttons || e.pointerType !== "mouse")) { const dx = e.clientX - B3.drag.x; B3.moved = Math.max(B3.moved, Math.abs(dx)); if (B3.moved > 4) B3.rot = Math.max(-1, Math.min(1, B3.drag.r + dx / 240)); } else if (e.pointerType === "mouse") b3Hover(e); });
  const up = e => { if (B3.drag && B3.moved <= 4) b3Hover(e, false); B3.drag = null; };
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", () => B3.drag = null);
  el.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") { B3.tip && (B3.tip.hidden = true); if (B3.hover) B3.hover.material.emissive.copy(B3.hover.userData.base); B3.hover = null; } });
}

// ---------- Vue 1 : relief de la valeur (meilleure cote de tes bookmakers face au prix juste Pinnacle) ----------
const B3_SEL = ["H", "D", "A", "O25", "U25"];
function fairOf(f) {
  const books = S.odds[f.key] || {}, sh = Object.keys(books).find(isSharp);
  if (!sh) return null;
  const p1 = bookProbs(books[sh], "1X2"), p2 = bookProbs(books[sh], "OU25");
  if (!p1) return null;
  return { H: p1[0], D: p1[1], A: p1[2], O25: p2?.[0], U25: p2?.[1] };
}
function bestMine(f, k, okBook = bookOK) {
  let o = 0, book = null; for (const [b, v] of Object.entries(S.odds[f.key] || {})) { if (!okBook(b)) continue; if (v[k] > o) { o = v[k]; book = b; } }
  return o > 1 ? { o, book } : null;
}
function valueGrid(n) {
  const list = FX.filter(f => !started(f) && fairOf(f)).slice(0, n), rows = [], cells = [];
  list.forEach((f, r) => {
    const fair = fairOf(f); rows.push(`${pfShort(f.home)} – ${pfShort(f.away)}`);
    B3_SEL.forEach((k, c) => { const p = fair[k], b = p && bestMine(f, k); if (!b) return; cells.push({ f, k, r, c, p, ...b, ev: p * b.o - 1 }); });
  });
  return { list, rows, cells };
}
function value3dSpec(narrow) {
  const G = valueGrid(narrow ? 8 : 12), H = 14;
  return { rows: G.rows, cols: ["1", "N", "2", "+2,5", "−2,5"], plane: true, sx: 1, sz: 0.7, bw: 0.56, bd: 0.66, ratio: 0.58, tallMobile: 0.95, elev: 0.55, az: -0.45, G,
    bars: G.cells.map(x => ({ r: x.r, c: x.c, h: Math.max(-2.6, Math.min(1.4, x.ev * H)), color: b3Color(x.book), dim: x.ev < 0, glow: x.ev >= 0,
      tip: `<strong>${esc(short(x.f.home))} – ${esc(short(x.f.away))}</strong><br>${esc(SEL[x.k])} · ${esc(x.book)} <b class="num">${odd(x.o)}</b><br>Cote juste ${odd(1 / x.p)} · <b class="${x.ev >= 0 ? "pos" : ""}">${sgn(x.ev)}</b>` })) };
}
// ---------- Vue 2 : marge moyenne par championnat et par bookmaker ----------
function margin3dSpec() {
  const books = ["Pinnacle", ...S.cfg.myBooks], lgs = Object.keys(LG), acc = {};
  for (const f of FX) { if (started(f)) continue; for (const [b, o] of Object.entries(S.odds[f.key] || {})) { if (!books.includes(b) || !["H", "D", "A"].every(x => o[x] > 1)) continue; ((acc[f.league] ??= {})[b] ??= []).push(L90.overround([o.H, o.D, o.A])); } }
  const rows = lgs.filter(l => acc[l]), bars = [];
  rows.forEach((l, r) => { const best = Math.min(...books.slice(1).map(b => acc[l][b] ? avg(acc[l][b]) : 9));
    books.forEach((b, c) => { const v = acc[l][b]; if (!v) return; const m = avg(v);
      bars.push({ r, c, h: Math.max(0.05, m * 14), color: b3Color(b), glow: b !== "Pinnacle" && m === best, dim: false,
        tip: `<strong>${esc(LG[l])}</strong><br>${esc(b)} : marge moyenne <b class="num">${pct(m, 1)}</b><br>${v.length} match${v.length > 1 ? "s" : ""}${b !== "Pinnacle" && m === best ? "<br>La moins chère de tes bookmakers ici" : ""}` }); }); });
  return { rows: rows.map(l => LG[l]), cols: books.map(b => b.replace(" (FR)", "")), bars, sx: 1.05, sz: 0.85, bw: 0.62, bd: 0.6, ratio: 0.55, tallMobile: 0.85, elev: 0.55, az: -0.6, mobileRows: true, acc, books, lgs: rows };
}
// ---------- Vue 3 : escalier de la montante (capital devant, chance d'y arriver derrière) ----------
function stairSpec(rows, cap) {
  const top = Math.log(rows[rows.length - 1].stake / cap) || 1, bars = [];
  rows.forEach(({ c, k, reach, stake }) => {
    const tip = `<strong>Palier ${k + 1}</strong> · cote ${odd(c.p.o)}<br>${c.p.legs.map(l => esc(l.lab)).join(" + ")}<br>Capital ${eur(stake)} · chance d'y arriver <b>${pct(reach, reach < 0.1 ? 1 : 0)}</b>`;
    bars.push({ r: 0, c: k, h: 0.25 + 3.2 * Math.log(stake / cap) / top, color: 0x9fe7f5, glow: k === rows.length - 1, tip });
    bars.push({ r: 1, c: k, h: 0.05 + 3.2 * reach, color: 0xC4732A, dim: false, tip });
  });
  return { rows: ["Capital", "Chance"], cols: rows.map(x => `${x.k + 1}`), bars, sx: 1, sz: 1.15, bw: 0.9, bd: 0.85, ratio: 0.42, maxH: 380, tallMobile: 0.8, elev: 0.5, az: -0.5 };
}
