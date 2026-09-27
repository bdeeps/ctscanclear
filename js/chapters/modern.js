// Chapter 6: modern CT. A dual-source gantry (two tubes about 95° apart, as in Siemens SOMATOM
// Definition, 2005) and three ideas: dual-energy material separation (with NIST attenuation data),
// ECG-gated cardiac CT, and photon-counting detectors (Siemens NAEOTOM Alpha, FDA-cleared 30 Sept 2021).
import { THREE, M, canvasTexture, clamp, lerp } from '../kit.js';
import { makeGantry, MATERIALS, GEO, ISO_Y, TAU, DEG, compact } from '../ct.js';

// Cardiac timing. Temporal resolution ≈ half a rotation for one tube, a quarter for two
// (83 ms at 0.33 s on the first dual-source scanner; 66 ms at 0.25 s on later ones).
const ROT = 0.25;
// Rough model of the heart's quietest moment (mid-diastole) against heart rate: it shrinks fast as
// the heart speeds up, because systole takes a fairly fixed ~0.3 s and diastole absorbs the change.
const quiet = (bpm) => Math.max(0, 0.6 * (60 / bpm) - 0.26);
// Synthetic ECG: P, QRS and T waves over one beat (phase 0..1, R wave at 0).
function ecg(ph) {
  const g = (c, w, a) => a * Math.exp(-(((ph - c) / w) ** 2));
  return g(0, 0.012, 1) + g(-0.02, 0.01, -0.15) + g(0.025, 0.012, -0.25) + g(0.3, 0.05, 0.28) + g(0.86, 0.03, 0.12) + g(1, 0.012, 1);
}
// Kramers' law spectrum (energy intensity ∝ kVp − E), softened by the tube's
// filtration as a simple exp(−(28/E)³) factor. Shape only, for the picture.
const spec = (E, kvp) => (E >= kvp ? 0 : (kvp - E) * Math.exp(-((28 / E) ** 3)));

export default {
  id: 'modern',
  short: 'Modern CT',
  title: 'Two energies, a heartbeat and counting photons',
  subtitle: 'How today’s scanners tell materials apart, freeze a beating heart and count every X-ray.',
  view: { pos: [0.9, 3.6, 9.0], target: [0.4, 3.45, 0] },
  learn: `<p><b>Dual-energy CT</b> scans with two X-ray energies at once, for example 80 and 140 kilovolts, often from <b>two tubes</b> on the same ring. Low-energy X-rays are stopped much more by heavy atoms like calcium and iodine than high-energy ones are, while water and uric acid barely care. So the ratio of the two readings tells <b>materials</b> apart: a <b>uric acid kidney stone</b> can often be dissolved with medicine, while a <b>calcium stone</b> may need other treatment.</p>
    <p><b>Cardiac CT</b> has to photograph a heart that never stops. The scanner watches the <b>ECG</b> and takes its data in the heart's quietest moment, between beats. Two tubes a quarter turn apart need only a quarter turn to collect a slice, which freezes motion down to about 66–83 milliseconds. With iodine in the blood this becomes <b>CT angiography</b>: a map of the arteries.</p>
    <p><b>Photon-counting CT</b>, first cleared by the US FDA in September 2021, uses a new kind of detector. Instead of turning X-rays into light and measuring the total glow, a crystal of <b>cadmium telluride</b> turns each X-ray straight into a pulse of charge, and the electronics <b>count every photon</b> and sort it by energy. That means sharper images, less noise and energy information in every scan.</p>
    <p class="tip"><b>Try it:</b> in dual energy, compare the two stones. In cardiac, raise the heart rate and switch the second tube off. In photon counting, compare how the two detectors weigh the same X-rays.</p>`,
  terms: [
    { t: 'Dual-energy CT', d: 'Scanning with two X-ray energies to tell materials apart by how their attenuation changes with energy.' },
    { t: 'kVp', d: 'The peak voltage across the X-ray tube, which sets the highest X-ray energy in the beam.' },
    { t: 'ECG gating', d: 'Timing the scan to the heart’s electrical signal so data are taken when the heart is most still.' },
    { t: 'CT angiography', d: 'A CT scan timed with iodine contrast in the blood, to show arteries and veins.' },
    { t: 'Photon-counting detector', d: 'A detector that counts each X-ray photon and measures its energy, instead of adding up light.' },
  ],
  defaults: { mode: 'dual', stone: 'uric', bpm: 65, dual: true },
  controls: [
    { key: 'mode', type: 'seg', label: 'Show', options: [{ v: 'dual', label: 'Dual energy' }, { v: 'cardiac', label: 'Cardiac' }, { v: 'photon', label: 'Photon counting' }] },
    { key: 'stone', type: 'seg', label: 'Kidney stone', options: [{ v: 'uric', label: 'Uric acid' }, { v: 'oxalate', label: 'Calcium oxalate' }], hint: 'Dual energy.' },
    { key: 'bpm', type: 'range', label: 'Heart rate', min: 45, max: 120, step: 1, ends: ['slow', 'fast'], fmt: (v) => Math.round(v) + ' beats a minute', hint: 'Cardiac.' },
    { key: 'dual', type: 'toggle', label: 'Second tube on', hint: 'Cardiac: two tubes collect a slice in a quarter turn.' },
  ],
  quiz: [
    { q: 'How does dual-energy CT tell a uric acid stone from a calcium stone?', options: ['By its size', 'Calcium stops low-energy X-rays much more than high-energy ones; uric acid changes far less', 'By its colour', 'By its temperature'], answer: 1, why: 'Heavier atoms like calcium absorb low-energy X-rays strongly. Compare the two readings and the ratio gives the material away.' },
    { q: 'Why does cardiac CT watch the ECG?', options: ['To check the patient is awake', 'To take data in the heart’s quietest moment between beats', 'To power the scanner', 'To measure blood pressure'], answer: 1, why: 'The heart keeps moving. Timing the scan to the ECG catches it when it is most still, so the image is sharp.' },
    { q: 'What does a photon-counting detector do differently?', options: ['It uses film', 'It counts each X-ray photon and measures its energy', 'It needs no X-rays', 'It spins faster'], answer: 1, why: 'A cadmium telluride crystal turns each X-ray straight into a charge pulse, which is counted and sorted by energy.' },
  ],
  reel: [
    { ms: 5400, caption: 'Two X-ray energies tell materials apart, like two kinds of kidney stone.', set: { mode: 'dual', dual: true }, act: (s) => { s.stone = 'oxalate'; }, view: { pos: [1.2, 3.8, 10.2], target: [0.9, 3.2, 0] }, spin: 0.2 },
    { ms: 5200, caption: 'Photon-counting CT, cleared in 2021, counts every X-ray and measures its energy.', set: { mode: 'photon', dual: true }, view: { pos: [1.2, 3.8, 10.2], target: [0.9, 3.2, 0] }, spin: 0.2 },
  ],

  build({ stage }) {
    const root = new THREE.Group(); stage.root.add(root);
    const gan = makeGantry({ cover: false, cols: 40, rows: 12 });
    gan.group.position.set(-2.0, 0.5, 0); gan.group.scale.setScalar(0.7); root.add(gan.group);
    gan.setCollimation(0.14);
    // Second tube and a narrower detector, about 95° round the ring.
    const B = new THREE.Group(); B.rotation.z = 95 * DEG; gan.rotor.add(B);
    const tubeB = gan.tubeG.clone(); B.add(tubeB);
    const detB = gan.detG.clone(); detB.scale.set(0.62, 1, 1); B.add(detB);
    const beamB = gan.beamMesh.clone(); beamB.material = M.ghost(0x8ef0ff, 0.18); beamB.scale.x = 0.62; B.add(beamB);
    const collB = gan.coll.clone(); B.add(collB);
    const lA = stage.label('Tube A: 140 kV', [0, GEO.sid + 0.75, 0.3], gan.tubeG, 'hot');
    const lB = stage.label('Tube B: 80 kV', [0, GEO.sid + 0.75, 0.3], tubeB);
    // A beating heart for the cardiac mode.
    const heart = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 20), M.plastic(0xd9485b, { roughness: 0.5 }));
    heart.position.y = ISO_Y; heart.scale.set(1, 1.2, 0.9); gan.group.add(heart);

    let sArg = null, t = 0;
    const W = 560, Hh = 700;
    const board = canvasTexture(W, Hh, (g, w, h) => {
      const s = sArg; if (!s) return;
      g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(10,12,18,.9)'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#e8eef8'; g.font = 'bold 26px sans-serif';
      if (s.mode === 'dual') {
        g.fillText('Two energies, two readings', 20, 38);
        // spectra
        const X0 = 50, X1 = w - 20, Y0 = 60, Y1 = 200, E = (e) => X0 + ((e - 15) / 130) * (X1 - X0);
        let mx = 0; for (let e = 16; e < 140; e++) mx = Math.max(mx, spec(e, 140));
        for (const [kvp, col] of [[80, '#c49bff'], [140, '#ffd27a']]) {
          g.beginPath(); for (let e = 16; e <= kvp; e++) { const y = Y1 - (spec(e, kvp) / mx) * (Y1 - Y0) * (kvp === 80 ? 0.9 : 1); e === 16 ? g.moveTo(E(e), y) : g.lineTo(E(e), y); } g.strokeStyle = col; g.lineWidth = 2.5; g.stroke();
          g.fillStyle = col; g.font = 'bold 18px sans-serif'; g.fillText(`${kvp} kV`, E(kvp) - 30, Y0 + (kvp === 80 ? 30 : 10));
        }
        g.fillStyle = 'rgba(255,255,255,.55)'; g.font = '16px sans-serif'; g.fillText('X-ray energy (keV) →   (spectrum shapes only)', X0, Y1 + 22);
        // scatter: HU at low vs HU at high energy
        const P0 = 70, P1 = w - 30, Q0 = 250, Q1 = h - 80, maxH = 3200;
        const px = (v) => P0 + (clamp(v, -200, maxH) + 200) / (maxH + 200) * (P1 - P0), py = (v) => Q1 - (clamp(v, -200, 1800) + 200) / 2000 * (Q1 - Q0);
        g.strokeStyle = 'rgba(255,255,255,.18)'; g.strokeRect(P0, Q0, P1 - P0, Q1 - Q0);
        g.setLineDash([6, 6]); g.beginPath(); g.moveTo(px(0), py(0)); g.lineTo(px(1800), py(1800)); g.stroke(); g.setLineDash([]);
        g.fillStyle = 'rgba(255,255,255,.55)'; g.font = '16px sans-serif';
        g.fillText('HU at low energy (80 kV) →', P1 - 220, Q1 + 22); g.save(); g.translate(P0 - 12, Q1); g.rotate(-Math.PI / 2); g.fillText('HU at high energy (140 kV) →', 0, 0); g.restore();
        g.fillText('same both ways', px(1300) - 20, py(1300) - 6);
        for (const [k, m] of Object.entries(MATERIALS)) {
          const sel = k === s.stone, [lo, hi] = m.hu;
          g.fillStyle = m.color; g.beginPath(); g.arc(px(lo), py(hi), sel ? 11 : 7, 0, TAU); g.fill();
          if (sel) { g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.stroke(); }
          g.font = (sel ? 'bold ' : '') + '16px sans-serif'; g.fillStyle = sel ? '#fff' : 'rgba(255,255,255,.75)';
          const lx = px(lo) + 12 > P1 - 150 ? px(lo) - 160 : px(lo) + 12;
          g.fillText(m.name, lx, py(hi) + (k === 'fat' ? 18 : k === 'water' ? -8 : 5));
        }
      } else if (s.mode === 'cardiac') {
        g.fillText('Catching the heart between beats', 20, 38);
        const X0 = 20, X1 = w - 20, Y0 = 120, Y1 = 330, span = 3;                 // 3 seconds of ECG
        const RR = 60 / s.bpm, X = (sec) => X0 + (sec / span) * (X1 - X0);
        const tempRes = ROT / (s.dual ? 4 : 2), q = quiet(s.bpm);
        // quiet windows and acquisition windows
        for (let b = -1; b * RR < span + RR; b++) {
          const qc = b * RR + 0.72 * RR - (t % RR);
          g.fillStyle = 'rgba(92,225,169,.18)'; g.fillRect(X(qc - q / 2), Y0 - 20, Math.max(1, X(q) - X(0)), Y1 - Y0 + 30);
          g.fillStyle = tempRes <= q ? 'rgba(142,240,255,.6)' : 'rgba(255,138,122,.6)'; g.fillRect(X(qc - tempRes / 2), Y1 + 20, Math.max(2, X(tempRes) - X(0)), 22);
        }
        g.strokeStyle = '#ff6b9a'; g.lineWidth = 2.5; g.beginPath();
        for (let i = 0; i <= 600; i++) { const sec = (i / 600) * span, ph = ((sec + t) % RR) / RR; const y = Y1 - 40 - ecg(ph) * (Y1 - Y0 - 60); i ? g.lineTo(X(sec), y) : g.moveTo(X(sec), y); }
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,.7)'; g.font = '17px sans-serif';
        g.fillText('ECG', X0, Y0 - 30); g.fillStyle = '#5ce1a9'; g.fillText('green: the heart’s quietest moment', X0 + 60, Y0 - 30);
        g.fillStyle = tempRes <= q ? '#8ef0ff' : '#ff8a7a'; g.fillText(`bars: scan time per slice, ${Math.round(tempRes * 1000)} ms`, X0, Y1 + 66);
        g.font = 'bold 22px sans-serif'; g.fillStyle = tempRes <= q ? '#5ce1a9' : '#ff8a7a';
        g.fillText(tempRes <= q ? 'The scan fits in the quiet moment: sharp' : 'Too slow for this heart rate: blurred', 20, Y1 + 110);
        g.fillStyle = 'rgba(255,255,255,.65)'; g.font = '17px sans-serif';
        g.fillText('Quiet-moment lengths are a rough model.', 20, h - 60);
        g.fillText('Doctors often aim for a heart rate below about 65.', 20, h - 34);
      } else {
        g.fillText('Adding up light vs counting photons', 20, 38);
        // One burst of X-ray photons with energies from a 140 kV spectrum, shown on both detectors.
        const X0 = 30, X1 = w - 30, E = (e) => X0 + ((e - 15) / 125) * (X1 - X0);
        let mx = 0; for (let e = 16; e < 140; e++) mx = Math.max(mx, spec(e, 140));
        // Energy-integrating: signal weights each photon by its energy, plus electronic noise, no energy info.
        g.fillStyle = '#ffd27a'; g.font = 'bold 20px sans-serif'; g.fillText('Ordinary detector', X0, 80);
        g.fillStyle = 'rgba(255,255,255,.7)'; g.font = '16px sans-serif';
        g.fillText('X-ray → light in a scintillator → photodiode. It measures', X0, 106);
        g.fillText('the total glow: high energies count for more, and', X0, 128);
        g.fillText('the energy of each photon is lost. Electronic noise adds in.', X0, 150);
        const bar = 0.72 + 0.04 * Math.sin(t * 7) + 0.03 * Math.sin(t * 13.3);
        g.fillStyle = 'rgba(255,210,122,.25)'; g.fillRect(X0, 168, X1 - X0, 34); g.fillStyle = '#ffd27a'; g.fillRect(X0, 168, (X1 - X0) * bar, 34);
        g.fillStyle = '#0a0c12'; g.font = 'bold 17px sans-serif'; g.fillText('one number: total energy', X0 + 10, 191);
        g.fillStyle = '#8ef0ff'; g.font = 'bold 20px sans-serif'; g.fillText('Photon-counting detector', X0, 250);
        g.fillStyle = 'rgba(255,255,255,.7)'; g.font = '16px sans-serif';
        g.fillText('X-ray → charge pulse in cadmium telluride. Each photon is', X0, 276);
        g.fillText('counted and sorted into energy bins; pulses below a threshold', X0, 298);
        g.fillText('(electronic noise) are thrown away.', X0, 320);
        const Y0 = 360, Y1 = h - 90, TH = [25, 50, 75];
        const bins = [[25, 50, '#8ef0ff'], [50, 75, '#5ce1a9'], [75, 140, '#c49bff']];
        for (const [a, b, c] of bins) { g.fillStyle = c + '33'; g.fillRect(E(a), Y0, E(b) - E(a), Y1 - Y0); }
        g.beginPath(); for (let e = 16; e <= 140; e++) { const y = Y1 - (spec(e, 140) / mx) * (Y1 - Y0 - 20); e === 16 ? g.moveTo(E(e), y) : g.lineTo(E(e), y); } g.strokeStyle = '#e8eef8'; g.lineWidth = 2.5; g.stroke();
        // falling photons, sorted into their bin
        for (let i = 0; i < 40; i++) {
          const u = ((i * 0.618 + t * 0.35) % 1), e = 20 + ((i * 37) % 115), y = Y0 + u * (Y1 - Y0 - 10);
          g.fillStyle = e < 25 ? 'rgba(255,255,255,.3)' : bins.find(([a, b]) => e >= a && e < b)?.[2] || '#fff';
          g.beginPath(); g.arc(E(e), y, 4, 0, TAU); g.fill();
        }
        g.strokeStyle = '#ff6b9a'; g.setLineDash([5, 5]); g.lineWidth = 2; for (const e of TH) { g.beginPath(); g.moveTo(E(e), Y0 - 6); g.lineTo(E(e), Y1); g.stroke(); } g.setLineDash([]);
        g.fillStyle = 'rgba(255,255,255,.6)'; g.font = '16px sans-serif'; g.fillText('energy (keV) →', X1 - 120, Y1 + 22); g.fillText('thresholds', E(25) + 4, Y0 + 14);
        g.fillStyle = '#e8eef8'; g.font = 'bold 18px sans-serif'; g.fillText('Siemens NAEOTOM Alpha: FDA-cleared 30 Sept 2021', X0, h - 30);
      }
    });
    const bm = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 4.62), new THREE.MeshBasicMaterial({ map: board.tex, transparent: true, toneMapped: false }));
    bm.position.set(2.35, 2.75, 0); bm.rotation.y = -0.15; root.add(bm);

    let ang = 0, redraw = 0;
    return {
      update(dt, s) {
        dt = Math.max(0, dt); t += dt;
        ang += (TAU / ROT / 16) * dt;                 // shown 16× slower than 0.25 s a turn
        gan.setAngle(ang);
        const two = s.mode !== 'cardiac' || s.dual;
        B.visible = lB.visible = two;
        lA.element.textContent = s.mode === 'dual' ? 'Tube A: 140 kV' : 'Tube A';
        lB.element.textContent = s.mode === 'dual' ? 'Tube B: 80 kV' : 'Tube B';
        heart.visible = s.mode === 'cardiac';
        if (heart.visible) { const ph = (t % (60 / s.bpm)) / (60 / s.bpm), k = 1 - 0.12 * Math.exp(-(((ph - 0.18) / 0.12) ** 2)); heart.scale.set(k, 1.2 * k, 0.9 * k); }
        redraw += dt;
        if (redraw > 1 / 30 || sArg !== s) { redraw = 0; sArg = s; board.redraw(); }
      },
      readout: (s) => compact(stage, ((s) => {
        if (s.mode === 'dual') {
          const m = MATERIALS[s.stone], r = m.hu[0] / m.hu[1];
          return `<div class="big">${m.name}</div>
            <div class="row"><span>CT number at 80 kV</span><b>${Math.round(m.hu[0])} HU</b></div>
            <div class="row"><span>CT number at 140 kV</span><b>${Math.round(m.hu[1])} HU</b></div>
            <div class="row"><span>Low ÷ high</span><b>${r.toFixed(2)} ${r < 1.2 ? '(behaves like water: uric acid)' : '(heavy atoms: calcium)'}</b></div>
            <small>From NIST attenuation data at 50 and 80 keV, standing in for the two beams. Stones taken as 60% crystal.</small>`;
        }
        if (s.mode === 'cardiac') {
          const tr = ROT / (s.dual ? 4 : 2), q = quiet(s.bpm);
          return `<div class="big">${Math.round(s.bpm)} beats a minute</div>
            <div class="row"><span>One beat every</span><b>${Math.round(60000 / s.bpm)} ms</b></div>
            <div class="row"><span>Quiet moment (rough)</span><b>${Math.round(q * 1000)} ms</b></div>
            <div class="row"><span>Time to collect a slice</span><b>${Math.round(tr * 1000)} ms (${s.dual ? 'two tubes, ¼ turn' : 'one tube, ½ turn'})</b></div>
            <small>At ${ROT} s per turn.</small>`;
        }
        return `<div class="big">Counting every X-ray</div>
          <div class="row"><span>Detector crystal</span><b>cadmium telluride</b></div>
          <div class="row"><span>Energy information</span><b>in every scan</b></div>
          <div class="row"><span>Electronic noise</span><b>thrown away by the threshold</b></div>
          <small>First cleared by the US FDA on 30 September 2021.</small>`;
      })(s)),
    };
  },
};
