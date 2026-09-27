// CTScanClear's shared models and maths: a CT gantry (rotating frame with tube, collimator and
// detector arc, slip rings, cooling), the patient table, a console, a Shepp–Logan head phantom
// with exact line integrals, filtered back-projection, Hounsfield-unit slices and attenuation data.
import { THREE, M, box, torus, clamp } from './kit.js';

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

// ---------------------------------------------------------------- scale and geometry
// 1 scene unit = 0.4 m. The bore's centre (the isocentre) sits about 1.08 m above the floor.
// Typical third-generation geometry: focal spot about 0.57–0.6 m from the isocentre, detector about
// 1.04–1.09 m from the focal spot, a fan of about 50–52° covering a 50 cm field of view, and a
// 70–80 cm bore (e.g. Siemens SOMATOM Definition: 595 mm / 1085 mm, 78 cm bore).
export const U = 0.4;
export const ISO_Y = 2.7;
export const GEO = { bore: 0.875, sid: 1.45, sdd: 2.6, fan: 26 * DEG, disc: [1.0, 2.2], half: 2.5, depth: 1.9 };
export const ROW_MM = 0.625;          // detector row width at the isocentre (64 × 0.625 mm = 40 mm)

// rod along Z (kit.rod runs along X)
export function zrod(z0, z1, r0, r1 = r0, mat, seg = 40) {
  const g = new THREE.CylinderGeometry(r1, r0, Math.abs(z1 - z0), seg);
  g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true;
  m.position.z = (z0 + z1) / 2;
  return m;
}

// A flat ring (annulus) in the XY plane, extruded along Z from z0 to z1.
export function ring(r0, r1, z0, z1, mat, seg = 96) {
  const s = new THREE.Shape(); s.absarc(0, 0, r1, 0, TAU, false);
  const h = new THREE.Path(); h.absarc(0, 0, r0, 0, TAU, true); s.holes.push(h);
  const g = new THREE.ExtrudeGeometry(s, { depth: z1 - z0, bevelEnabled: false, curveSegments: seg });
  g.translate(0, 0, z0);
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true;
  return m;
}

// Where a detector element sits (rotor frame): angle a across the fan, measured at the focal spot.
export function detPoint(a, extra = 0) {
  const R = GEO.sdd + extra;
  return [R * Math.sin(a), GEO.sid - R * Math.cos(a)];
}

// ---------------------------------------------------------------- the gantry
// Bore axis along Z. The group's origin is on the floor under the isocentre.
// opts.cols / rows: detector elements drawn (each stands for a block of real ones).
export function makeGantry({ cover = true, cols = 44, rows = 16, beamW = 0.1 } = {}) {
  const g = new THREE.Group();
  const iso = new THREE.Group(); iso.position.y = ISO_Y; g.add(iso);

  // Stationary parts: base, frame with the big bearing, the slip-ring brush block.
  const stator = new THREE.Group(); iso.add(stator);
  const frameMat = M.metal(0x7d8594, { roughness: 0.45, metalness: 0.6 });
  const base = box(4.2, 0.35, 1.5, M.plastic(0x3a404c)); base.position.set(0, -ISO_Y + 0.175, -0.1); stator.add(base);
  const legL = box(0.35, ISO_Y - 2.3, 0.6, frameMat); legL.position.set(-1.9, -ISO_Y + 0.35 + (ISO_Y - 2.3) / 2, -0.6); stator.add(legL);
  const legR = legL.clone(); legR.position.x = 1.9; stator.add(legR);
  const bearing = torus(2.33, 0.09, frameMat, 96); bearing.position.z = -0.62; stator.add(bearing);
  const brush = box(0.34, 0.22, 0.3, M.plastic(0x2a3040)); brush.position.set(0, 2.36, -0.88); stator.add(brush);

  // The cover: a rounded square "doughnut" with a round bore.
  const coverMat = M.plastic(0xeef2f7, { roughness: 0.35, transparent: true, opacity: 1 });
  const H = GEO.half, r = 0.7;
  const sh = new THREE.Shape();
  sh.moveTo(-H + r, -H); sh.lineTo(H - r, -H); sh.quadraticCurveTo(H, -H, H, -H + r); sh.lineTo(H, H - r); sh.quadraticCurveTo(H, H, H - r, H);
  sh.lineTo(-H + r, H); sh.quadraticCurveTo(-H, H, -H, H - r); sh.lineTo(-H, -H + r); sh.quadraticCurveTo(-H, -H, -H + r, -H);
  const hole = new THREE.Path(); hole.absarc(0, 0, GEO.bore, 0, TAU, true); sh.holes.push(hole);
  const cg = new THREE.ExtrudeGeometry(sh, { depth: GEO.depth - 0.16, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 3, curveSegments: 64 });
  cg.translate(0, 0, -GEO.depth / 2 + 0.08);
  const shell = new THREE.Mesh(cg, coverMat); shell.castShadow = true; shell.receiveShadow = true;
  const coverG = new THREE.Group(); coverG.add(shell);
  const glowRing = torus(GEO.bore + 0.05, 0.035, M.glow(0x8ef0ff), 96); glowRing.position.z = GEO.depth / 2 + 0.01; coverG.add(glowRing);
  const panel = box(0.9, 0.35, 0.04, M.plastic(0x1b2130)); panel.position.set(1.35, 1.55, GEO.depth / 2 + 0.03); coverG.add(panel);
  const lamp = box(0.6, 0.06, 0.03, M.glow(0xffb547)); lamp.position.set(1.35, 1.55, GEO.depth / 2 + 0.06); coverG.add(lamp);
  iso.add(coverG);
  coverG.visible = cover;

  // The rotating frame (rotor). Everything here spins about Z. Beam plane at z = 0.
  const rotor = new THREE.Group(); iso.add(rotor);
  const discMat = M.metal(0xa9b0bc, { roughness: 0.4, metalness: 0.7 });
  const disc = ring(GEO.disc[0], GEO.disc[1], -0.75, -0.42, discMat); rotor.add(disc);

  // X-ray tube: a housing along Z, focal spot at (0, sid). Anode glows while on.
  const tubeG = new THREE.Group(); rotor.add(tubeG);
  const housing = zrod(-0.55, 0.5, 0.27, 0.27, M.metal(0x5f6878, { roughness: 0.35 }), 40); housing.position.y = GEO.sid + 0.3; tubeG.add(housing);
  const capA = zrod(0.5, 0.58, 0.27, 0.2, M.plastic(0x2a3040)); capA.position.y = GEO.sid + 0.3; tubeG.add(capA);
  const capB = zrod(-0.63, -0.55, 0.2, 0.27, M.plastic(0x2a3040)); capB.position.y = GEO.sid + 0.3; tubeG.add(capB);
  const hvCable = zrod(-0.9, -0.55, 0.05, 0.05, M.plastic(0x1b1f28), 12); hvCable.position.set(0.14, GEO.sid + 0.45, 0); tubeG.add(hvCable);
  const focusMat = M.glow(0xffd27a);
  const focus = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), focusMat); focus.position.set(0, GEO.sid + 0.02, 0); tubeG.add(focus);

  // Collimator: two lead jaws under the tube set the beam width along Z.
  const coll = new THREE.Group(); coll.position.y = GEO.sid - 0.14; rotor.add(coll);
  const collBody = box(0.62, 0.12, 0.5, M.metal(0x7a8290)); coll.add(collBody);
  const jawMat = M.metal(0x3a3f4a, { roughness: 0.6 });
  const jawA = box(0.5, 0.05, 0.2, jawMat), jawB = box(0.5, 0.05, 0.2, jawMat);
  jawA.position.y = jawB.position.y = -0.09; coll.add(jawA, jawB);

  // Detector arc: modules facing the focal spot. Each drawn element stands for a block of real ones.
  const detG = new THREE.Group(); rotor.add(detG);
  const n = cols * rows;
  const detMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.2, emissive: 0x000000 }), n);
  const o = new THREE.Object3D();
  const detW = (2 * GEO.fan * GEO.sdd) / cols;
  let zDet = 0.18;                      // detector width along Z (40 mm at the isocentre, magnified ×1.8)
  const placeDet = (zw) => {
    zDet = zw;
    for (let i = 0; i < cols; i++) {
      const a = -GEO.fan + ((i + 0.5) / cols) * 2 * GEO.fan, [x, y] = detPoint(a, 0.06);
      for (let j = 0; j < rows; j++) {
        o.position.set(x, y, -zw / 2 + ((j + 0.5) / rows) * zw);
        o.rotation.set(0, 0, a);
        o.scale.set(detW * 0.9, 0.12, (zw / rows) * 0.86);
        o.updateMatrix(); detMesh.setMatrixAt(i * rows + j, o.matrix);
      }
    }
    detMesh.instanceMatrix.needsUpdate = true;
  };
  placeDet(zDet);
  const baseCol = new THREE.Color(0x9fd7ff);
  for (let i = 0; i < n; i++) detMesh.setColorAt(i, baseCol);
  detG.add(detMesh);
  // Backing arc and the data acquisition electronics (DAS) behind it.
  const arcPts = [];
  for (let k = 0; k <= 24; k++) { const a = -GEO.fan * 1.05 + (k / 24) * 2.1 * GEO.fan; const [x, y] = detPoint(a, 0.2); arcPts.push(new THREE.Vector3(x, y, 0)); }
  const backing = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arcPts), 48, 0.08, 8), M.metal(0x4a5260)); backing.scale.z = 3.2; detG.add(backing);
  const das = [];
  for (let k = -2; k <= 2; k++) { const a = k * 0.18, [x, y] = detPoint(a, 0.42); const b = box(0.4, 0.2, 0.55, M.plastic(0x1f6f4a)); b.position.set(x, y, -0.1); b.rotation.z = a; detG.add(b); das.push(b); }

  // High-voltage generator and cooling (radiator + fan) ride on the disc too.
  const gen = new THREE.Group(); gen.rotation.z = 2.15; rotor.add(gen);
  const genBox = box(0.7, 0.45, 0.6, M.plastic(0x33405a)); genBox.position.set(0, 1.72, -0.12); gen.add(genBox);
  const genStripe = box(0.72, 0.06, 0.62, M.glow(0xff7a59)); genStripe.position.set(0, 1.9, -0.12); gen.add(genStripe);
  const cool = new THREE.Group(); cool.rotation.z = -2.15; rotor.add(cool);
  const radiator = box(0.72, 0.38, 0.55, M.metal(0xc9d3e0, { roughness: 0.3 })); radiator.position.set(0, 1.74, -0.12); cool.add(radiator);
  for (let k = 0; k < 9; k++) { const f = box(0.02, 0.4, 0.57, M.metal(0x9aa3b2)); f.position.set(-0.32 + k * 0.08, 1.74, -0.12); cool.add(f); }
  const fanDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 24), M.plastic(0x2a3040)); fanDisc.position.set(0, 1.98, -0.12); cool.add(fanDisc);

  // Slip rings on the back of the disc: bands of metal that brushes rub on, so power and data
  // cross from the still frame to the spinning one without cables winding up.
  const slip = new THREE.Group(); rotor.add(slip);
  for (const R of [1.95, 2.03, 2.11]) { const t = torus(R, 0.022, M.metal(0xd8a25a, { roughness: 0.25 }), 128); t.position.z = -0.8; slip.add(t); }

  // The fan beam: from the focal spot (a point) to the detector, as wide along Z as the detector.
  const beamMat = M.ghost(0xffd27a, 0.2);
  const beamGeo = new THREE.BufferGeometry();
  const setBeam = (zw) => {
    const pts = [], N = 24, F = [0, GEO.sid, 0];
    for (let k = 0; k <= N; k++) { const a = -GEO.fan + (k / N) * 2 * GEO.fan, [x, y] = detPoint(a); pts.push([x, y]); }
    const pos = [];
    for (let k = 0; k < N; k++) {
      const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
      for (const z of [-zw / 2, zw / 2]) pos.push(...F, x0, y0, z, x1, y1, z);
    }
    // ends
    for (const [x, y] of [pts[0], pts[N]]) pos.push(...F, x, y, -zw / 2, x, y, zw / 2);
    beamGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    beamGeo.computeVertexNormals();
  };
  setBeam(beamW);
  const beamMesh = new THREE.Mesh(beamGeo, beamMat); rotor.add(beamMesh);

  return {
    group: g, iso, stator, rotor, cover: coverG, coverMat, shell, glowRing, disc, tubeG, housing, focus, focusMat, coll, jawA, jawB,
    detG, detMesh, das, gen, cool, fanDisc, slip, brush, bearing, beamMesh, beamMat, cols, rows,
    setBeam, placeDet,
    // Collimator jaws open to the beam width (scene units along Z at the isocentre).
    setCollimation(zw) { setBeam(zw); placeDet(Math.min(1.0, zw * (GEO.sdd / GEO.sid))); const gap = Math.min(0.24, zw * 0.12 / GEO.sid + 0.02); jawA.position.z = gap / 2 + 0.1; jawB.position.z = -gap / 2 - 0.1; },
    setAngle(a) { rotor.rotation.z = a; },
    setXray(on) { coverMat.opacity = on ? 0.07 : 1; coverMat.depthWrite = !on; shell.castShadow = !on; },
  };
}

// ---------------------------------------------------------------- table, patient, console
// Table top 0.44 m wide, 2.2 m long, its surface about 0.2 m below the isocentre.
export const TABLE = { y: ISO_Y - 0.55, len: 5.5 };
export function makeTable() {
  const g = new THREE.Group();
  const ped = box(0.9, TABLE.y - 0.35, 2.4, M.plastic(0xdfe4ec)); ped.position.set(0, (TABLE.y - 0.35) / 2 + 0.08, 3.6); g.add(ped);
  const foot = box(1.3, 0.16, 2.9, M.plastic(0x3a404c)); foot.position.set(0, 0.08, 3.6); g.add(foot);
  const cradle = new THREE.Group(); g.add(cradle);             // slides along Z
  const top = box(1.1, 0.1, TABLE.len, M.plastic(0x2c3444, { roughness: 0.6 })); top.position.set(0, TABLE.y - 0.05, 3.2); cradle.add(top);
  const pad = box(1.02, 0.06, TABLE.len - 0.2, M.plastic(0x5b8cff, { roughness: 0.8 })); pad.position.set(0, TABLE.y + 0.03, 3.2); cradle.add(pad);
  return { group: g, cradle, top, ped };
}

// A simple person lying on their back, head towards -Z (head first into the scanner).
export function makePatient(color = 0xe8c4a8) {
  const g = new THREE.Group();
  const skin = M.plastic(color, { roughness: 0.7, transparent: true, opacity: 1 });
  const gown = M.plastic(0x9fc3e8, { roughness: 0.8, transparent: true, opacity: 1 });
  const cap = (r, len, mat, x, y, z, sx = 1, sy = 1) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 8, 20), mat); m.rotation.x = Math.PI / 2; m.position.set(x, y, z); m.scale.set(sx, 1, sy); m.castShadow = true; g.add(m); return m; };
  const y0 = TABLE.y + 0.06;
  const torso = cap(0.36, 1.2, gown, 0, y0 + 0.28, 0.9, 1.25, 0.75);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 24, 16), skin); head.position.set(0, y0 + 0.28, -0.25); head.scale.set(0.9, 1, 1.1); head.castShadow = true; g.add(head);
  const neck = cap(0.11, 0.1, skin, 0, y0 + 0.26, 0.05);
  const legs = [cap(0.15, 1.9, gown, -0.2, y0 + 0.17, 2.85), cap(0.15, 1.9, gown, 0.2, y0 + 0.17, 2.85)];
  const arms = [cap(0.09, 1.1, skin, -0.62, y0 + 0.14, 1.05), cap(0.09, 1.1, skin, 0.62, y0 + 0.14, 1.05)];
  return { group: g, head, torso, legs, arms, neck, skin, gown, setOpacity(k) { for (const m of [skin, gown]) { m.opacity = k; m.depthWrite = k > 0.95; } } };
}

// Operator console: a desk with two screens. screen is a canvas texture to show a slice.
export function makeConsole(tex) {
  const g = new THREE.Group();
  const desk = box(2.6, 0.08, 1.1, M.plastic(0xdfe4ec)); desk.position.y = 1.85; g.add(desk);
  for (const x of [-1.2, 1.2]) { const leg = box(0.08, 1.8, 1.0, M.plastic(0x9aa3b2)); leg.position.set(x, 0.92, 0); g.add(leg); }
  const scr = (x, map) => {
    const s = new THREE.Group(); s.position.set(x, 2.55, -0.25); s.rotation.x = -0.08;
    s.add(box(1.15, 0.72, 0.05, M.plastic(0x16181f)));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 0.64), map ? new THREE.MeshBasicMaterial({ map, toneMapped: false }) : M.glow(0x1d2a44));
    face.position.z = 0.03; s.add(face);
    const st = box(0.08, 0.5, 0.08, M.plastic(0x2a3040)); st.position.set(0, -0.55, -0.02); s.add(st);
    g.add(s); return s;
  };
  scr(-0.62, tex); scr(0.62, null);
  const kb = box(0.8, 0.03, 0.28, M.plastic(0x2a3040)); kb.position.set(-0.2, 1.91, 0.25); g.add(kb);
  const btn = box(0.18, 0.04, 0.18, M.glow(0xff5a5a)); btn.position.set(0.85, 1.91, 0.25); g.add(btn);
  return g;
}

// ---------------------------------------------------------------- phantom and reconstruction
// Modified Shepp–Logan head phantom (Toft's higher-contrast version of Shepp & Logan, IEEE Trans.
// Nucl. Sci. 21, 1974): [density, a, b, x0, y0, angle°] on a square from −1 to 1.
export const SHEPP = [
  [1.0, 0.69, 0.92, 0, 0, 0], [-0.8, 0.6624, 0.874, 0, -0.0184, 0],
  [-0.2, 0.11, 0.31, 0.22, 0, -18], [-0.2, 0.16, 0.41, -0.22, 0, 18],
  [0.1, 0.21, 0.25, 0, 0.35, 0], [0.1, 0.046, 0.046, 0, 0.1, 0], [0.1, 0.046, 0.046, 0, -0.1, 0],
  [0.1, 0.046, 0.023, -0.08, -0.605, 0], [0.1, 0.023, 0.023, 0, -0.606, 0], [0.1, 0.023, 0.046, 0.06, -0.605, 0],
].map(([rho, a, b, x0, y0, d]) => ({ rho, a, b, x0, y0, c: Math.cos(d * DEG), s: Math.sin(d * DEG), phi: d * DEG }));

export function phantomAt(x, y) {
  let v = 0;
  for (const e of SHEPP) {
    const dx = x - e.x0, dy = y - e.y0, u = dx * e.c + dy * e.s, w = -dx * e.s + dy * e.c;
    if ((u * u) / (e.a * e.a) + (w * w) / (e.b * e.b) <= 1) v += e.rho;
  }
  return v;
}

// Exact line integral of the phantom along the line {p : p·(cosθ, sinθ) = t}.
export function lineIntegral(th, t) {
  let p = 0; const ct = Math.cos(th), st = Math.sin(th);
  for (const e of SHEPP) {
    const tt = t - (e.x0 * ct + e.y0 * st), al = th - e.phi;
    const a2 = e.a * e.a * Math.cos(al) ** 2 + e.b * e.b * Math.sin(al) ** 2;
    if (tt * tt < a2) p += (2 * e.rho * e.a * e.b * Math.sqrt(a2 - tt * tt)) / a2;
  }
  return p;
}

// Fan-beam view: source on a circle of radius R (phantom units) at angle beta, rays spread by gamma.
// Returns the line integral for the ray at fan angle gamma.
export function fanRay(beta, gamma, R) {
  // Source at S = R(-sinβ, cosβ); central ray points to the centre. Ray direction at angle γ from it.
  const sx = -R * Math.sin(beta), sy = R * Math.cos(beta);
  const dirA = Math.atan2(-sy, -sx) + gamma, dx = Math.cos(dirA), dy = Math.sin(dirA);
  const nx = -dy, ny = dx;                         // normal to the ray
  const th = Math.atan2(ny, nx), t = sx * nx + sy * ny;
  return lineIntegral(th, t);
}

// Parallel-beam sinogram: N angles over 180°, D detector bins across [−1, 1].
export function sinogram(N, D) {
  const out = new Float32Array(N * D), tau = 2 / D;
  for (let i = 0; i < N; i++) { const th = (i * Math.PI) / N; for (let k = 0; k < D; k++) out[i * D + k] = lineIntegral(th, -1 + (k + 0.5) * tau); }
  return out;
}

// The Ram-Lak (ramp) filter as a convolution kernel in real space, as given by Ramachandran and
// Lakshminarayanan (PNAS 68, 1971): h(0) = 1/(4τ²), h(n odd) = −1/(n²π²τ²), h(n even) = 0.
export function rampFilter(sino, N, D) {
  const tau = 2 / D, out = new Float32Array(N * D), h = new Float32Array(2 * D);
  for (let n = -D + 1; n < D; n++) h[n + D] = n === 0 ? 1 / (4 * tau * tau) : n % 2 ? -1 / (n * n * Math.PI * Math.PI * tau * tau) : 0;
  for (let i = 0; i < N; i++) for (let k = 0; k < D; k++) {
    let acc = 0; const row = i * D;
    for (let j = 0; j < D; j++) acc += sino[row + j] * h[k - j + D];
    out[row + k] = acc * tau;
  }
  return out;
}

// Add one view (angle index i) to an image by smearing it back along its rays.
export function backprojectView(img, n, proj, i, N, D) {
  const th = (i * Math.PI) / N, c = Math.cos(th), s = Math.sin(th), tau = 2 / D, w = Math.PI / N;
  for (let py = 0; py < n; py++) {
    const y = 1 - ((py + 0.5) * 2) / n;
    for (let px = 0; px < n; px++) {
      const x = -1 + ((px + 0.5) * 2) / n;
      const u = (x * c + y * s + 1) / tau - 0.5, k = Math.floor(u), f = u - k;
      if (k < 0 || k >= D - 1) continue;
      img[py * n + px] += w * (proj[i * D + k] * (1 - f) + proj[i * D + k + 1] * f);
    }
  }
}

export function rasterPhantom(n) {
  const img = new Float32Array(n * n);
  for (let py = 0; py < n; py++) for (let px = 0; px < n; px++) img[py * n + px] = phantomAt(-1 + ((px + 0.5) * 2) / n, 1 - ((py + 0.5) * 2) / n);
  return img;
}

// Draw a float image into a 2D context at (x, y, size) with a grey window [lo, hi].
const scratch = document.createElement('canvas');
export function drawGrey(g, img, n, x, y, w, h, lo, hi, tint = null) {
  scratch.width = n; scratch.height = n;
  const sg = scratch.getContext('2d'), id = sg.createImageData(n, n);
  for (let i = 0; i < n * n; i++) {
    const v = clamp((img[i] - lo) / (hi - lo), 0, 1) * 255;
    id.data[i * 4] = tint ? v * tint[0] : v; id.data[i * 4 + 1] = tint ? v * tint[1] : v; id.data[i * 4 + 2] = tint ? v * tint[2] : v; id.data[i * 4 + 3] = 255;
  }
  sg.putImageData(id, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(scratch, x, y, w, h);
}

// ---------------------------------------------------------------- Hounsfield units
// HU = 1000 × (μ − μwater) / μwater. Typical values (Radiopaedia "Hounsfield unit"; Wikipedia "CT scan"):
// air −1000, lung about −850, fat about −100, water 0, CSF about +5, white matter +25 to +30,
// grey matter +35 to +45, fresh clotted blood +50 to +80, muscle/soft tissue +20 to +80,
// blood with iodine contrast +200 to +400, spongy bone about +300, dense bone +1000 and up.
export const MU_WATER = 0.19;         // per cm, for water at about 70 keV (NIST XCOM: 0.206 at 60, 0.184 at 80 keV)
export const muOf = (hu) => MU_WATER * (1 + hu / 1000);

const hash = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
const inE = (x, y, x0, y0, a, b, d = 0) => { const c = Math.cos(d), s = Math.sin(d), dx = x - x0, dy = y - y0, u = dx * c + dy * s, w = -dx * s + dy * c; return (u * u) / (a * a) + (w * w) / (b * b) <= 1; };

// An axial head slice, anterior at the top, patient's left on the viewer's right. About 24 cm across.
export function headHU(x, y) {
  if (!inE(x, y, 0, 0, 0.8, 0.94)) return -1000;
  if (!inE(x, y, 0, 0, 0.765, 0.905)) return 45;                       // scalp
  if (!inE(x, y, 0, 0, 0.72, 0.86)) {                                   // skull: dense tables, spongy diploe between
    const inner = inE(x, y, 0, 0, 0.735, 0.875) && !inE(x, y, 0, 0, 0.75, 0.89);
    return inner ? 500 : 1300;
  }
  if (inE(x, y, 0, 0.7, 0.16, 0.08)) return -1000;                      // frontal sinus (air)
  if (inE(x, y, -0.33, 0.28, 0.12, 0.09)) return 70;                    // a small bleed: fresh blood, about +70
  if (inE(x, y, -0.1, 0.1, 0.06, 0.26, 0.25) || inE(x, y, 0.1, 0.1, 0.06, 0.26, -0.25)) return 6;   // lateral ventricles (CSF)
  if (inE(x, y, 0, -0.3, 0.03, 0.05)) return 6;                         // third ventricle
  if (inE(x, y, 0, 0, 0.7, 0.84) && !inE(x, y, 0, 0, 0.6, 0.73)) return 40;  // grey matter (cortex)
  if (inE(x, y, -0.2, -0.02, 0.1, 0.16) || inE(x, y, 0.2, -0.02, 0.1, 0.16)) return 38;             // deep grey nuclei
  if (Math.abs(x) < 0.012 && y > 0.25) return 6;                        // the fissure between the halves
  return 28;                                                            // white matter
}

// An axial chest slice at heart level, about 36 cm across. contrast: iodine in the blood.
export function chestHU(x, y, contrast) {
  const blood = contrast ? 300 : 40;
  if (!inE(x, y, 0, -0.02, 0.96, 0.66)) return -1000;
  if (!inE(x, y, 0, -0.02, 0.9, 0.6)) return -100;                      // fat under the skin
  // spine at the back (bottom of the image)
  if (inE(x, y, 0, -0.42, 0.13, 0.12)) return inE(x, y, 0, -0.42, 0.105, 0.095) ? 250 : 900;
  if (inE(x, y, 0, -0.57, 0.05, 0.035)) return 8;                       // spinal canal
  // ribs, cut across, around the chest wall
  for (const a of [0.15, 0.55, 0.95, 1.3, -0.25, -0.65, -1.05]) for (const sgn of [-1, 1]) {
    if (inE(x, y, sgn * 0.83 * Math.cos(a), -0.02 + 0.55 * Math.sin(a), 0.05, 0.028, sgn * (a + Math.PI / 2))) return 700;
  }
  if (inE(x, y, 0, 0.5, 0.07, 0.03)) return 650;                         // sternum
  if (inE(x, y, 0.12, -0.3, 0.07, 0.07)) return blood;                 // descending aorta, beside the spine on the patient's left
  // lungs, with a few vessels
  const lungR = inE(x, y, -0.45, -0.02, 0.36, 0.48, -0.1), lungL = inE(x, y, 0.47, -0.05, 0.32, 0.46, 0.15);
  // heart sits towards the patient's left (viewer's right), in front
  if (inE(x, y, 0.12, 0.08, 0.33, 0.27, 0.5)) {
    if (inE(x, y, 0.16, 0.08, 0.22, 0.17, 0.5)) return blood;            // blood in the chambers
    return 45;                                                          // heart muscle
  }
  if (inE(x, y, -0.2, 0.2, 0.08, 0.08)) return blood;                   // ascending aorta
  if (inE(x, y, 0.0, -0.22, 0.035, 0.035)) return -1000;                // oesophagus with a little air
  if (lungR || lungL) {
    const G = 13, vx = Math.floor((x + 1) * G), vy = Math.floor((y + 1) * G);
    const cx = (vx + 0.5) / G - 1 + (hash(vx, vy) - 0.5) * 0.04, cy = (vy + 0.5) / G - 1 + (hash(vy, vx) - 0.5) * 0.04;
    if (Math.hypot(x - cx, y - cy) < 0.005 + 0.009 * hash(vx + 3, vy)) return 40;   // small vessels
    return -860;
  }
  if (inE(x, y, 0, 0.18, 0.1, 0.1)) return 30;                          // mediastinal tissue
  return 50;                                                            // chest wall muscle
}

// Rasterise an HU slice with a little quantum noise (σ ≈ 6 HU, typical of a routine scan).
export function rasterHU(fn, n, arg, noise = 6) {
  const img = new Float32Array(n * n);
  for (let py = 0; py < n; py++) for (let px = 0; px < n; px++) {
    const x = -1 + ((px + 0.5) * 2) / n, y = 1 - ((py + 0.5) * 2) / n;
    const g = (hash(px, py) + hash(py + 7, px + 3) + hash(px + 13, py + 17) - 1.5) * 2;   // roughly Gaussian, σ ≈ 1
    img[py * n + px] = fn(x, y, arg) + (fn(x, y, arg) > -990 ? g * noise : 0);
  }
  return img;
}

// ---------------------------------------------------------------- dual energy (NIST XCOM data)
// Mass attenuation coefficients μ/ρ in cm²/g at 50 keV and 80 keV, standing in for the effective
// energies of an 80 kVp and a 140 kVp beam. From NIST XCOM / X-Ray Mass Attenuation Coefficients tables.
export const MUR = { H: [0.3355, 0.3091], C: [0.1871, 0.161], N: [0.198, 0.1639], O: [0.2132, 0.1678], Ca: [1.019, 0.3656], I: [12.32, 3.51] };
export const MUR_WATER = [0.2269, 0.1837], MUR_BONE = [0.4242, 0.2229], MUR_FAT = [0.2123, 0.18];
const mix = (f) => [0, 1].map((k) => Object.entries(f).reduce((a, [e, w]) => a + w * MUR[e][k], 0));
const huPair = (mr, rho) => mr.map((m, k) => (1000 * (m * rho - MUR_WATER[k])) / MUR_WATER[k]);
// Stones are porous and partly averaged with urine, so a voxel is taken as 60% crystal and 40% water.
const stone = (mr, rho, fill = 0.6) => huPair(mr, rho).map((h) => fill * h);
export const MATERIALS = {
  water: { name: 'Water', hu: [0, 0], color: '#8ef0ff' },
  fat: { name: 'Fat', hu: huPair(MUR_FAT, 0.95), color: '#ffe08a' },
  uric: { name: 'Uric acid stone', hu: stone(mix({ C: 0.3572, H: 0.024, N: 0.3333, O: 0.2855 }), 1.87), color: '#5ce1a9' },
  oxalate: { name: 'Calcium oxalate stone', hu: stone(mix({ Ca: 0.2743, C: 0.1644, O: 0.5475, H: 0.0138 }), 2.12), color: '#ff7a59' },
  bone: { name: 'Dense bone', hu: huPair(MUR_BONE, 1.92), color: '#e8eef8' },
  iodine: { name: 'Blood + iodine (10 mg/mL)', hu: [0, 1].map((k) => (1000 * 0.01 * MUR.I[k]) / MUR_WATER[k]), color: '#c49bff' },
};

// On narrow screens the readout keeps only its headline and first row, so it doesn't hide the model.
export const compact = (stage, html) => (stage.host.clientWidth < 560 ? html.split('</div>').slice(0, 2).join('</div>') + '</div>' : html);
