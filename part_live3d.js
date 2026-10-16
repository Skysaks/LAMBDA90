// ---------- 3D live : la distribution des scores finaux se transforme minute par minute ----------
const L3 = { r: null, scene: null, cam: null, g: null, bars: [], pil: [], marker: null, clock: null, key: null, raf: 0, rotY: -0.5, drag: null, labels: [] };
function l3Label(text, color = "#A6B1CC", size = 44) {
  const T = THREE, c = document.createElement("canvas"); c.width = 256; c.height = 96; const x = c.getContext("2d");
  x.font = `600 ${size}px "IBM Plex Sans", sans-serif`; x.fillStyle = color; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(text, 128, 48);
  const s = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), transparent: true, depthWrite: false })); s.scale.set(1.6, 0.6, 1); return s;
}
function l3Build(f) {
  const T = THREE; L3.scene = new T.Scene(); L3.g = new T.Group(); L3.scene.add(L3.g);
  L3.cam = new T.PerspectiveCamera(36, 2, 0.1, 100);
  L3.scene.add(new T.HemisphereLight(0xdfe7ff, 0x05070d, 0.7)); const dl = new T.DirectionalLight(0xffffff, 0.85); dl.position.set(-4, 9, 6); L3.scene.add(dl);
  const floor = new T.Mesh(new T.PlaneGeometry(9.5, 8.6), new T.MeshStandardMaterial({ color: 0x161d2c, roughness: 1 })); floor.rotation.x = -Math.PI / 2; L3.g.add(floor);
  const edge = new T.LineSegments(new T.EdgesGeometry(new T.PlaneGeometry(8.9, 8)), new T.LineBasicMaterial({ color: 0x2c3850 })); edge.rotation.x = -Math.PI / 2; edge.position.y = 0.01; L3.g.add(edge);
  L3.bars = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
    const col = i > j ? 0x2399b3 : i === j ? 0x8569d1 : 0xc4732a;
    const m = new T.Mesh(new T.BoxGeometry(0.88, 1, 0.88), new T.MeshStandardMaterial({ color: col, roughness: 0.45, metalness: 0.15, transparent: true, opacity: 1 }));
    m.position.set((j - 2.5) * 1.15 - 0.6, 0.5, (2.5 - i) * 1.15); m.scale.y = 0.02; m.userData = { i, j, h: 0.02, t: 0.02, base: col }; L3.g.add(m); L3.bars.push(m);
  }
  for (let k = 0; k < 6; k++) { const a = l3Label(String(k), "#2399B3"); a.position.set(-4.4, 0.25, (2.5 - k) * 1.15); L3.g.add(a); const b = l3Label(String(k), "#C4732A"); b.position.set((k - 2.5) * 1.15 - 0.6, 0.25, 3.95); L3.g.add(b); }
  const ln = l3Label(short(f.home).slice(0, 14), "#2399B3", 34); ln.position.set(-4.4, 0.25, -3.75); L3.g.add(ln);
  const la = l3Label(short(f.away).slice(0, 14), "#C4732A", 34); la.position.set(-0.6, 0.25, 4.65); L3.g.add(la);
  L3.pil = [0x2399b3, 0x8569d1, 0xc4732a].map((c, k) => { const m = new T.Mesh(new T.CylinderGeometry(0.32, 0.32, 1, 32), new T.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.2 })); m.position.set(4.1, 0.5, -1.4 + k * 1.4); m.scale.y = 0.02; m.userData = { h: 0.02, t: 0.02 }; L3.g.add(m); return m; });
  L3.pilLab = ["1", "N", "2"].map((t, k) => { const s = l3Label(t, "#E9EEFB", 40); s.position.set(4.1, 0.2, -1.4 + k * 1.4 + 0.55); L3.g.add(s); return s; });
  L3.marker = new T.Mesh(new T.TorusGeometry(0.62, 0.05, 12, 48), new T.MeshBasicMaterial({ color: 0xe9eefb })); L3.marker.rotation.x = -Math.PI / 2; L3.marker.position.y = 0.03; L3.g.add(L3.marker);
  L3.clock = new T.Mesh(new T.BoxGeometry(1, 0.06, 0.12), new T.MeshBasicMaterial({ color: 0x9fe7f5 })); L3.clock.position.set(-4.45, 0.04, -4.15); L3.g.add(L3.clock);
  L3.key = f.key;
}
function l3Targets(f) {
  const L = liveOf(f), s = L90.stateAt(L.events, L.t), [lam, mu] = LR(f);
  const { P, K } = L90.finalDist(C, lam, mu, Math.min(L.t, L90.NM), s.hg, s.ag, s.man);
  let H = 0, D = 0, A = 0; for (let h = 0; h < K; h++) for (let a = 0; a < K; a++) { const p = P[h * K + a]; if (h > a) H += p; else if (h === a) D += p; else A += p; }
  for (const b of L3.bars) { const p = P[b.userData.i * K + b.userData.j]; b.userData.t = 0.02 + Math.min(5, 9 * p); b.userData.p = p; b.material.opacity = b.userData.i < s.hg || b.userData.j < s.ag ? 0.12 : 1; }
  [H, D, A].forEach((p, k) => L3.pil[k].userData.t = 0.02 + 3.6 * p);
  L3.marker.position.x = (Math.min(5, s.ag) - 2.5) * 1.15 - 0.6; L3.marker.position.z = (2.5 - Math.min(5, s.hg)) * 1.15; L3.markerBar = L3.bars.find(b => b.userData.i === Math.min(5, s.hg) && b.userData.j === Math.min(5, s.ag));
  L3.clockT = Math.max(0.001, L.t / L90.NM);
  L3.readout = { H, D, A, t: L.t, s };
}
function live3dMount(f) {
  const host = $("#live3d"); if (!host) return;
  if (!window.THREE) { host.innerHTML = `<div class="empty">La vue 3D demande WebGL, indisponible sur cet appareil.</div>`; return; }
  try {
    if (!L3.r) { L3.r = new THREE.WebGLRenderer({ antialias: true, alpha: true }); L3.r.setPixelRatio(Math.min(2, devicePixelRatio || 1)); l3Events(L3.r.domElement); }
  } catch { host.innerHTML = `<div class="empty">WebGL indisponible.</div>`; return; }
  if (L3.key !== f.key) l3Build(f);
  host.append(L3.r.domElement); L3.r.domElement.className = "l3c";
  const w = host.clientWidth || 600, h = Math.round(Math.min(420, Math.max(260, w * 0.55)));
  L3.r.setSize(w, h); L3.cam.aspect = w / h; L3.cam.updateProjectionMatrix();
  l3Targets(f);
  const ro = $("#l3ro"); if (ro && L3.readout) { const r = L3.readout; ro.textContent = `${L90.clockLabel(r.t)} · ${r.s.hg}-${r.s.ag} · 1 ${pct(r.H)} · N ${pct(r.D)} · 2 ${pct(r.A)}`; }
  if (!L3.raf) { const loop = now => { if (!document.body.contains(L3.r.domElement)) { L3.raf = 0; return; } l3Frame(now); L3.raf = requestAnimationFrame(loop); }; L3.raf = requestAnimationFrame(loop); }
}
function l3Frame(now) {
  const rm = matchMedia("(prefers-reduced-motion: reduce)").matches, k = rm ? 1 : 0.12;
  for (const b of [...L3.bars, ...L3.pil]) { const u = b.userData; u.h += (u.t - u.h) * k; b.scale.y = u.h; b.position.y = u.h / 2; }
  L3.clock.scale.x += ((L3.clockT || 0.001) * 8.9 - L3.clock.scale.x) * k; L3.clock.position.x = -4.45 + L3.clock.scale.x / 2;
  const sway = L3.drag || rm ? 0 : Math.sin(now / 4000) * 0.12;
  L3.g.rotation.y = L3.rotY + sway;
  L3.cam.position.set(0, 8.6, 10.2); L3.cam.lookAt(0, 0.3, 0.6);
  if (L3.markerBar) L3.marker.position.y = L3.markerBar.userData.h + 0.06;
  L3.pilLab.forEach((s, i) => s.position.y = L3.pil[i].userData.h + 0.35);
  L3.r.render(L3.scene, L3.cam);
}
function l3Events(el) {
  el.style.touchAction = "pan-y";
  el.addEventListener("pointerdown", e => { L3.drag = { x: e.clientX, r: L3.rotY }; el.setPointerCapture(e.pointerId); });
  el.addEventListener("pointermove", e => { if (L3.drag) L3.rotY = L3.drag.r + (e.clientX - L3.drag.x) / 160; });
  const up = () => L3.drag = null; el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
}
