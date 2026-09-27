// Chapter 2: many views make a slice. The fan beam crosses a head phantom from every angle; each
// angle gives a projection (a 1D shadow). Stacked by angle they make the sinogram. In helical mode
// the table slides while the tube spins, and the fan traces a helix around the patient.
import { THREE, M, canvasTexture, clamp, lerp } from '../kit.js';
import { makeGantry, makeTable, makePatient, rasterPhantom, drawGrey, fanRay, GEO, ISO_Y, U, TAU, DEG, compact } from '../ct.js';

const PH = 0.35;                         // scene units per phantom unit: the phantom head is about 19 cm wide
const VIEWS = 180, BINS = 128;           // views shown per turn (every 2°) and detector bins drawn
const ROT = 0.35;                        // real rotation time, s
// Detector configurations: rows × row width at the isocentre (mm). Real examples: single-slice
// spiral CT (1989) 1–10 mm; 4 × 2.5 mm (1998); 16 × 1.25 mm (2001); 64 × 0.625 mm (2004);
// 320 × 0.5 mm (Toshiba Aquilion ONE, 2007).
const DET = { 1: [1, 5], 4: [4, 2.5], 16: [16, 1.25], 64: [64, 0.625], 320: [320, 0.5] };
const SCAN = 1.6;                        // helical scan length shown: 64 cm, chest and belly
const FVIEW = { pos: [1.9, 4.0, 10.4], target: [0.6, 3.35, 0] }, HVIEW = { pos: [-4.6, 6.6, 9.8], target: [-0.9, 2.3, 1.2] };

export default {
  id: 'slices',
  short: 'Many views, one slice',
  title: 'Hundreds of shadows make a slice',
  subtitle: 'The tube spins, each angle casts a shadow, and the table glides through in a spiral.',
  view: FVIEW,
  learn: `<p>One X-ray picture squashes your whole body into a flat shadow: bones in front hide things behind. CT gets around that by taking a shadow from <b>every direction</b>.</p>
    <p>As the tube spins, the fan of X-rays passes through the body and lands on the detector. Each detector element measures how much got through along its own straight line. One snapshot gives a <b>projection</b>: a 1D shadow profile of the slice from that angle. A scanner takes about <b>1,000 of them in every turn</b>.</p>
    <p>Stack the profiles one under another, in order of angle, and you get a strange striped picture called a <b>sinogram</b>. Every point in the body traces out a wavy line in it, like a sine wave, which is where the name comes from.</p>
    <p>Modern scanners scan in a <b>spiral</b> (also called <b>helical</b> scanning): the table glides through while the tube keeps spinning. The <b>pitch</b> is how far the table moves in one turn, divided by the width of the beam. At pitch 1 the spiral's turns just touch. And with <b>64 rows</b> of detectors, each turn covers 64 slices at once.</p>
    <p class="tip"><b>Try it:</b> watch the sinogram fill up in one turn. Then switch to helical, try 1 row and then 64 rows, and push the pitch above 1 to see gaps open up.</p>`,
  terms: [
    { t: 'Projection', d: 'The shadow profile of a slice seen from one angle: how much X-ray each detector received.' },
    { t: 'Sinogram', d: 'All the projections of a slice stacked by angle. Each point in the body draws a sine-shaped line in it.' },
    { t: 'Helical (spiral) scan', d: 'The table moves steadily while the tube spins, so the beam traces a spiral around the patient.' },
    { t: 'Pitch', d: 'Table travel in one rotation divided by the beam width. Pitch 1: no gaps and no overlap.' },
    { t: 'Multi-slice CT', d: 'A scanner with many detector rows, so each turn collects many slices at once.' },
  ],
  defaults: { mode: 'axial', rows: 64, pitch: 1, slow: 12 },
  controls: [
    { key: 'mode', type: 'seg', label: 'Scan', options: [{ v: 'axial', label: 'One slice' }, { v: 'helical', label: 'Helical' }] },
    { key: 'rows', type: 'seg', label: 'Detector rows', options: [1, 4, 16, 64, 320].map((v) => ({ v, label: String(v) })), fmt: (v) => `${DET[v][0]} × ${DET[v][1]} mm = ${DET[v][0] * DET[v][1]} mm` },
    { key: 'pitch', type: 'range', label: 'Pitch', min: 0.5, max: 1.5, step: 0.05, ends: ['overlap', 'gaps'], fmt: (v) => v.toFixed(2), hint: 'Helical only.' },
    { key: 'slow', type: 'range', label: 'Slow motion', min: 1, max: 30, step: 1, ends: ['real speed', '30× slower'], fmt: (v) => (v === 1 ? 'real speed' : v + '× slower') },
  ],
  quiz: [
    { q: 'What is a projection in CT?', options: ['A picture on a cinema screen', 'The shadow profile of the slice from one angle', 'The final 3D image', 'The table moving'], answer: 1, why: 'Each detector element measures X-rays along one line; together they give a 1D shadow of the slice from that direction.' },
    { q: 'A scan uses a 40 mm wide beam and the table moves 60 mm per rotation. What is the pitch?', options: ['0.67', '1', '1.5', '2.4'], answer: 2, why: 'Pitch = table travel per rotation ÷ beam width = 60 ÷ 40 = 1.5. The spiral has gaps between its turns.' },
    { q: 'Why was helical scanning such a big step?', options: ['It used less electricity', 'The table no longer had to stop for each slice, so a whole chest fits in one breath-hold', 'It made the scanner quieter', 'It removed the need for a detector'], answer: 1, why: 'Continuous spinning plus continuous table motion lets the scanner cover a whole region in seconds, without gaps from breathing between slices.' },
  ],
  reel: [
    { ms: 5600, caption: 'Each angle casts a shadow; stacked together they make a striped sinogram.', set: { mode: 'axial', rows: 64, slow: 10 }, act: (s, inst) => inst.reset(), view: { pos: [2.2, 3.8, 10.4], target: [1.7, 3.0, 0] }, spin: 0 },
    { ms: 5200, caption: 'In a helical scan the table glides through while the tube spins, tracing a spiral.', set: { mode: 'helical', rows: 64, slow: 3 }, anim: { pitch: [0.8, 1.2] }, act: (s, inst) => inst.reset(), view: HVIEW, spin: 0.15 },
  ],

  build({ stage }) {
    const root = new THREE.Group(); stage.root.add(root);
    const gan = makeGantry({ cover: false, cols: 44, rows: 16 });
    root.add(gan.group);
    const table = makeTable(); root.add(table.group);
    const pat = makePatient(); pat.group.position.z = 1.05; table.cradle.add(pat.group);
    pat.setOpacity(0.55);

    // Precompute the fan-beam sinogram of the phantom: VIEWS angles over a full turn.
    const R = GEO.sid / PH;
    const sino = new Float32Array(VIEWS * BINS);
    let pmax = 0;
    for (let v = 0; v < VIEWS; v++) for (let k = 0; k < BINS; k++) {
      const p = fanRay((v / VIEWS) * TAU, -GEO.fan + ((k + 0.5) / BINS) * 2 * GEO.fan, R);
      sino[v * BINS + k] = p; pmax = Math.max(pmax, p);
    }
    const seen = new Float32Array(VIEWS);   // 1 = filled this turn, 0.35 = from the last turn, 0 = not yet

    // The phantom: a textured slice in the beam plane inside a see-through head-shaped cylinder.
    const ph = new THREE.Group(); ph.position.y = ISO_Y; root.add(ph);
    const img = rasterPhantom(128);
    const tex = canvasTexture(256, 256, (g, w, h) => { g.clearRect(0, 0, w, h); drawGrey(g, img, 128, 0, 0, w, h, 0, 0.6, [0.85, 0.95, 1]); });
    const face = new THREE.Mesh(new THREE.CircleGeometry(PH, 64), new THREE.MeshBasicMaterial({ map: tex.tex, toneMapped: false, transparent: true, opacity: 0.95, side: THREE.DoubleSide }));
    ph.add(face);
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.9, 48, 1, true), M.clear(0xcfe8ff, 0.12));
    shell.rotation.x = Math.PI / 2; shell.scale.set(0.7 * PH, 1, 0.93 * PH); ph.add(shell);
    const lPh = stage.label('Head phantom', [0, -PH - 0.2, 0.3], ph);

    // The helix: where the fan has been, drawn around the patient (in the table's frame).
    const helixMax = 20000;
    const hGeo = new THREE.BufferGeometry();
    hGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(helixMax * 3), 3));
    const helix = new THREE.Line(hGeo, new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9 }));
    helix.frustumCulled = false; table.cradle.add(helix);
    const lHelix = stage.label('Path of the fan around the body', [0.9, ISO_Y + 0.8, 1.2], table.cradle, 'hot');

    // Board: the current projection above, the sinogram filling in below.
    const cur = { v: 0, beta: 0 };
    const tmp = document.createElement('canvas'); tmp.width = BINS; tmp.height = VIEWS;
    let sArg = null;
    const board = canvasTexture(560, 720, (g, w, h) => {
      const s = sArg; if (!s) return;
      g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(10,12,18,.9)'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#e8eef8'; g.font = 'bold 26px sans-serif';
      if (s.mode === 'axial') {
        g.fillText(`Projection at ${Math.round(cur.beta / DEG) % 360}°`, 20, 38);
        const X0 = 20, X1 = w - 20, Y0 = 60, Y1 = 230;
        g.strokeStyle = 'rgba(255,255,255,.15)'; g.strokeRect(X0, Y0, X1 - X0, Y1 - Y0);
        g.beginPath(); g.moveTo(X0, Y1);
        for (let k = 0; k < BINS; k++) g.lineTo(X0 + ((k + 0.5) / BINS) * (X1 - X0), Y1 - (sino[cur.v * BINS + k] / pmax) * (Y1 - Y0 - 10));
        g.lineTo(X1, Y1); g.closePath(); g.fillStyle = 'rgba(255,210,122,.35)'; g.fill(); g.strokeStyle = '#ffd27a'; g.lineWidth = 2.5; g.stroke();
        g.fillStyle = 'rgba(255,255,255,.6)'; g.font = '17px sans-serif'; g.fillText('how much the body blocked, across the detector', X0, Y1 + 24);
        g.fillStyle = '#e8eef8'; g.font = 'bold 24px sans-serif'; g.fillText('Sinogram: every view, stacked', 20, 300);
        const SY0 = 316, SY1 = h - 44, rowH = (SY1 - SY0) / VIEWS;
        const id = g.createImageData(BINS, VIEWS);
        for (let v = 0; v < VIEWS; v++) for (let k = 0; k < BINS; k++) {
          const a = seen[v], val = (sino[v * BINS + k] / pmax) * 255 * a, i = (v * BINS + k) * 4;
          id.data[i] = val * 1.0; id.data[i + 1] = val * 0.86; id.data[i + 2] = val * 0.55 + 18 * (1 - a); id.data[i + 3] = 255;
        }
        tmp.getContext('2d').putImageData(id, 0, 0);
        g.imageSmoothingEnabled = true; g.drawImage(tmp, X0, SY0, X1 - X0, SY1 - SY0);
        g.strokeStyle = '#8ef0ff'; g.lineWidth = 2; g.beginPath(); g.moveTo(X0 - 8, SY0 + (cur.v + 0.5) * rowH); g.lineTo(X1 + 8, SY0 + (cur.v + 0.5) * rowH); g.stroke();
        g.fillStyle = 'rgba(255,255,255,.6)'; g.font = '17px sans-serif'; g.fillText('0°', X0, SY0 - 2 + 18); g.fillText('360°', X0, SY1 + 20); g.fillText('angle ↓   detector →', X1 - 170, SY1 + 20);
      } else {
        // Unrolled helix: table position across, angle down. Each turn of the fan is a band.
        const [n, mm] = DET[s.rows], W = n * mm, feed = s.pitch * W;
        g.fillText('The spiral, unrolled', 20, 38);
        g.fillStyle = 'rgba(255,255,255,.6)'; g.font = '17px sans-serif';
        g.fillText('Each stripe is one turn of the fan. Across: along the body.', 20, 66);
        const X0 = 30, X1 = w - 20, Y0 = 100, Y1 = 560, span = Math.max(4 * feed, 3 * W, 60);
        const X = (z) => X0 + (z / span) * (X1 - X0);
        g.strokeStyle = 'rgba(255,255,255,.15)'; g.strokeRect(X0, Y0, X1 - X0, Y1 - Y0);
        for (let t = 0; t * feed < span + W; t++) {
          const z0 = t * feed;
          g.beginPath(); g.moveTo(X(z0 - W / 2), Y0); g.lineTo(X(z0 + W / 2), Y0); g.lineTo(X(z0 + feed + W / 2), Y1); g.lineTo(X(z0 + feed - W / 2), Y1); g.closePath();
          g.fillStyle = 'rgba(255,210,122,.32)'; g.fill(); g.strokeStyle = '#ffd27a'; g.lineWidth = 1.5; g.stroke();
        }
        g.fillStyle = 'rgba(255,255,255,.6)'; g.fillText('0°', 4, Y0 + 14); g.fillText('360°', 0, Y1);
        g.fillText(`${Math.round(span)} mm along the body →`, X1 - 220, Y1 + 26);
        const gap = feed - W;
        g.font = 'bold 22px sans-serif';
        g.fillStyle = gap > 0.5 ? '#ff8a7a' : gap < -0.5 ? '#8ef0ff' : '#5ce1a9';
        g.fillText(gap > 0.5 ? `Pitch ${s.pitch.toFixed(2)}: gaps of ${gap.toFixed(1)} mm per turn` : gap < -0.5 ? `Pitch ${s.pitch.toFixed(2)}: turns overlap by ${(-gap).toFixed(1)} mm` : 'Pitch 1: turns just touch', 20, h - 100);
        g.fillStyle = 'rgba(255,255,255,.7)'; g.font = '17px sans-serif';
        g.fillText('Gaps are filled in by interpolation: faster and lower dose,', 20, h - 66);
        g.fillText('but a little less sharp along the body.', 20, h - 44);
      }
    });
    const bm = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 4.24), new THREE.MeshBasicMaterial({ map: board.tex, transparent: true, toneMapped: false }));
    bm.position.set(4.2, 2.9, -0.2); bm.rotation.y = -0.18; root.add(bm);

    let beta = 0, lastV = -1, key = '', zc = 0, hN = 0, drawT = 0;
    const baseCol = new THREE.Color(0x2a3444), hot = new THREE.Color(0x9ff4ff), col = new THREE.Color();
    const inst = {
      reset() { beta = 0; lastV = -1; seen.fill(0); zc = 0; hN = 0; },
      update(dt, s) {
        dt = Math.max(0, dt);
        const helical = s.mode === 'helical';
        const [n, mm] = DET[s.rows], Wmm = n * mm, W = Wmm / 1000 / U;
        const k = `${s.rows}|${s.mode}`;
        if (k !== key) {
          const was = key.split('|')[1]; key = k; gan.setCollimation(W); inst.reset();
          // Swing the camera to the side for helical scans, and back to the front for one slice.
          if (was && was !== s.mode) stage.setView(...(helical ? [HVIEW.pos, HVIEW.target] : [FVIEW.pos, FVIEW.target]), 1.2);
        }
        const w = TAU / ROT / s.slow;
        beta += w * dt;
        gan.setAngle(beta);
        // Axial: record which views have been taken this turn.
        const v = Math.floor(((beta % TAU) / TAU) * VIEWS) % VIEWS;
        if (v !== lastV) {
          if (lastV >= 0) { let i = lastV; while (i !== v) { i = (i + 1) % VIEWS; if (i === 0) for (let j = 0; j < VIEWS; j++) seen[j] = Math.min(seen[j], 0.35); seen[i] = 1; } }
          lastV = v; cur.v = v; cur.beta = beta;
          // Colour the detector: bright where many X-rays got through (little absorbed).
          for (let i = 0; i < gan.cols; i++) {
            const p = helical ? 0.25 : sino[v * BINS + Math.floor(((i + 0.5) / gan.cols) * BINS)];
            col.copy(baseCol).lerp(hot, Math.exp(-3.2 * p));
            for (let j = 0; j < gan.rows; j++) gan.detMesh.setColorAt(i * gan.rows + j, col);
          }
          gan.detMesh.instanceColor.needsUpdate = true;
        }
        // Helical: the table moves pitch × beam width per turn, head first into the gantry.
        ph.visible = lPh.visible = !helical;
        pat.group.visible = table.group.visible = helical;
        helix.visible = lHelix.visible = helical;
        if (helical) {
          const feed = s.pitch * W;                          // scene units per turn
          zc += (feed * w * dt) / TAU;
          if (zc > SCAN) { zc = 0; hN = 0; }
          table.cradle.position.z = -1.0 - zc;
          // Grow the helix: points in the table's frame, radius 0.62 around the body's axis.
          drawT += dt;
          const pos = hGeo.attributes.position.array;
          const want = Math.min(helixMax, Math.floor((zc / Math.max(1e-4, feed)) * 64));
          while (hN < want) {
            const b = (hN / 64) * TAU, z = (hN / 64) * feed;
            pos[hN * 3] = -0.62 * Math.sin(b); pos[hN * 3 + 1] = ISO_Y + 0.62 * Math.cos(b); pos[hN * 3 + 2] = 1.0 + z;
            hN++;
          }
          hGeo.attributes.position.needsUpdate = true; hGeo.setDrawRange(0, hN);
        } else table.cradle.position.z = 0;
        sArg = s; board.redraw();
      },
      readout: (s) => compact(stage, ((s) => {
        const [n, mm] = DET[s.rows], W = n * mm;
        if (s.mode === 'axial') return `<div class="big">${s.rows === 1 ? 'One slice' : n + ' slices'} per turn</div>
          <div class="row"><span>Beam width</span><b>${W} mm (${n} × ${mm} mm)</b></div>
          <div class="row"><span>Views in one turn</span><b>about 1,000 (180 drawn)</b></div>
          <div class="row"><span>Time for one turn</span><b>${ROT} s</b></div>`;
        const v = (s.pitch * W) / ROT;
        return `<div class="big">Table: ${Math.round(v)} mm per second</div>
          <div class="row"><span>Pitch</span><b>${s.pitch.toFixed(2)} = ${(s.pitch * W).toFixed(1)} mm ÷ ${W} mm</b></div>
          <div class="row"><span>Whole chest (35 cm)</span><b>${(350 / v).toFixed(350 / v < 10 ? 1 : 0)} s</b></div>
          <small>${ROT} s per turn. Real scans add a little extra length at each end.</small>`;
      })(s)),
    };
    return inst;
  },
};
