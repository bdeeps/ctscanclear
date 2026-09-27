// Chapter 5: dose and speed. Typical effective doses (adults) as 3D bars, the image noise that a
// lower dose brings (noise ∝ 1/√dose), two ways scanners cut dose, and how long each scan takes.
//
// Doses in mSv. CT and chest X-ray: Mettler et al., "Effective doses in radiology and diagnostic
// nuclear medicine: a catalog", Radiology 248 (2008): head CT 2, chest CT 7, abdomen CT 8 (abdomen
// and pelvis together about 8–10), chest X-ray (PA) 0.02. RadiologyInfo.org (ACR/RSNA) gives similar
// current values: head 1.6, chest 6.1, abdomen and pelvis 7.7, chest X-ray 0.1 (two views).
// Whole-body trauma CT: median about 21 mSv (REACT-2 trial, Lancet 2016). Natural background:
// 2.4 mSv a year, world average (UNSCEAR 2008); about 3 mSv in the US (RadiologyInfo).
// Tube current modulation: 42–44% lower dose for abdomen–pelvis at acceptable noise (Kalra et al.,
// Radiology 2004). Iterative reconstruction (e.g. GE ASiR, 2008): similar image quality at about half
// the dose, i.e. noise lower by about 1/√2 at the same dose.
import { THREE, M, box, canvasTexture, approach, clamp } from '../kit.js';
import { compact } from '../ct.js';

const BG = 2.4, CXR = 0.02;
const EXAMS = {
  head: { name: 'Head CT', mSv: 2, len: 180, noise: 4 },
  chest: { name: 'Chest CT', mSv: 7, len: 350, noise: 10 },
  abdo: { name: 'Abdomen and pelvis CT', mSv: 9, len: 450, noise: 11, note: 'about 8–10' },
  trauma: { name: 'Whole-body trauma CT', mSv: 21, len: 1000, noise: 12, note: 'median in the REACT-2 trial' },
};
const BEAM_MM = 40, ROT = 0.35;                       // 64 × 0.625 mm, 0.35 s per turn, pitch 1
const TCM = 0.57, IR_NOISE = 0.71;
const H = 0.16;                                       // bar height per mSv

export const doseOf = (s) => EXAMS[s.exam].mSv * s.ma * (s.tcm ? TCM : 1);
export const noiseOf = (s) => (EXAMS[s.exam].noise / Math.sqrt(s.ma)) * (s.ir ? IR_NOISE : 1);

export default {
  id: 'dose',
  short: 'Dose and speed',
  title: 'How much radiation, and why it’s worth it',
  subtitle: 'A CT scan gives more dose than an X-ray picture, but it is fast and it sees so much more.',
  view: { pos: [2.6, 4.2, 11.4], target: [1.9, 2.55, 0] },
  learn: `<p>Radiation dose from scans is measured in <b>millisieverts (mSv)</b>. We all get some every year from nature: rocks, radon gas in the air, space and even our food. The world average is about <b>2.4 mSv a year</b>.</p>
    <p>A <b>chest X-ray</b> gives about <b>0.02 to 0.1 mSv</b>. A CT scan takes hundreds of X-ray views, so it gives more: about <b>2 mSv</b> for the head, about <b>7</b> for the chest and about <b>8 to 10</b> for the belly and pelvis. Those figures are typical averages for adults; the real dose depends on the scanner, the settings and the person.</p>
    <p>Why not just use less? Because X-rays arrive as separate particles, and fewer of them make a <b>noisier</b>, grainier picture. Halve the dose and the noise grows by about 40% (it goes with 1 ÷ √dose). Scanners fight this in clever ways. <b>Tube current modulation</b> turns the tube down where the body is thin and up where it is thick. <b>Iterative reconstruction</b> cleans up noise in the computer, so less dose is needed for the same picture.</p>
    <p>CT's great strength is <b>speed</b>. A whole-body scan after a serious accident takes only seconds, and a scan for a suspected <b>stroke</b> can show within minutes whether there is bleeding in the brain. That is why doctors weigh the small radiation risk against what the scan can show.</p>
    <p class="tip"><b>Try it:</b> pick an exam and lower the tube current. Watch the dose bar shrink and the grain in the picture grow. Then switch on the two dose-saving tricks.</p>`,
  terms: [
    { t: 'Millisievert (mSv)', d: 'A unit of radiation dose that takes into account which parts of the body were exposed.' },
    { t: 'Background radiation', d: 'Natural radiation we all receive from the ground, the air, space and food: about 2.4 mSv a year on average.' },
    { t: 'Image noise', d: 'Random grain in a CT image, caused by counting a limited number of X-ray photons.' },
    { t: 'Tube current modulation', d: 'Automatically turning the X-ray tube up and down as it goes around the body, to use no more dose than needed.' },
    { t: 'Iterative reconstruction', d: 'Building the image by repeated guess-and-correct steps that also reduce noise, allowing lower doses.' },
  ],
  defaults: { exam: 'chest', ma: 1, tcm: false, ir: false },
  controls: [
    { key: 'exam', type: 'seg', label: 'Exam', options: [{ v: 'head', label: 'Head' }, { v: 'chest', label: 'Chest' }, { v: 'abdo', label: 'Abdomen' }, { v: 'trauma', label: 'Trauma' }] },
    { key: 'ma', type: 'range', label: 'Tube current', min: 0.25, max: 2, step: 0.05, ends: ['less dose', 'more dose'], fmt: (v) => Math.round(v * 100) + '% of normal' },
    { key: 'tcm', type: 'toggle', label: 'Tube current modulation', hint: 'About 40% less dose (Kalra et al., 2004).' },
    { key: 'ir', type: 'toggle', label: 'Iterative reconstruction', hint: 'Similar picture at about half the dose.' },
  ],
  quiz: [
    { q: 'About how much dose does a chest CT give, compared with a chest X-ray?', options: ['About the same', 'About twice as much', 'Roughly 70 to 350 times as much', 'A million times as much'], answer: 2, why: 'About 7 mSv against 0.02 to 0.1 mSv. CT takes hundreds of views from all around.' },
    { q: 'If you halve the dose, what happens to the image noise?', options: ['It halves', 'It stays the same', 'It grows by about 40%', 'It doubles'], answer: 2, why: 'Noise goes with 1 ÷ √dose. Half the dose gives √2 ≈ 1.41 times the noise.' },
    { q: 'Why is CT so useful after a serious accident?', options: ['It has no radiation', 'It can scan the whole body in seconds and show bleeding and broken bones', 'It is cheaper than a plaster', 'It heals injuries'], answer: 1, why: 'Speed matters: a trauma CT takes seconds and shows injuries all over the body at once.' },
  ],
  reel: [
    { ms: 5600, caption: 'A chest CT gives about 7 mSv: roughly three years of natural background radiation.', set: { exam: 'chest', ma: 1, tcm: false, ir: false }, view: { pos: [1.8, 4.0, 11.0], target: [1.4, 2.3, 0] }, spin: 0.15 },
  ],

  build({ stage }) {
    const root = new THREE.Group(); stage.root.add(root);
    // Bars: chest X-ray, a year of background, then the four CT exams.
    const defs = [
      { id: 'cxr', name: 'Chest X-ray', v: CXR, color: 0x8ef0ff, label: '0.02–0.1 mSv' },
      { id: 'bg', name: 'Nature, 1 year', v: BG, color: 0x5ce1a9, label: '2.4 mSv' },
      ...Object.entries(EXAMS).map(([id, e]) => ({ id, name: { head: 'Head CT', chest: 'Chest CT', abdo: 'Belly CT', trauma: 'Trauma CT' }[id], v: e.mSv, color: 0xff7a59, label: `${e.note ? 'about ' : ''}${e.mSv} mSv`, ct: true })),
    ];
    const bars = defs.map((d, i) => {
      const g = new THREE.Group(); g.position.set(-3.0 + i * 1.3, 0, 0); root.add(g);
      const mat = M.plastic(d.color, { transparent: true, opacity: 0.92, emissive: new THREE.Color(0), emissiveIntensity: 1 });
      const b = box(0.8, 1, 0.8, mat); g.add(b);
      const ghost = box(0.84, 1, 0.84, M.ghost(d.color, 0.14)); ghost.visible = false; g.add(ghost);
      const top = stage.label(`<b>${d.label}</b>`, [0, 0.3, 0.45], g, d.ct ? 'hot' : '');
      stage.label(d.name, [0, -0.25, 0.6 + (i % 2) * 0.55], g);
      return { ...d, g, b, ghost, mat, top, h: d.v * H };
    });

    // Noise board: a patch of liver with a faint spot 10 HU darker, at the current noise level.
    const N = 96;
    const hash = (x, y, k) => { const v = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453; return v - Math.floor(v); };
    let sigma = 10;
    const board = canvasTexture(420, 470, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(10,12,18,.9)'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#e8eef8'; g.font = 'bold 24px sans-serif'; g.fillText('Image noise', 20, 36);
      g.fillStyle = 'rgba(255,255,255,.6)'; g.font = '17px sans-serif'; g.fillText('Liver with a faint spot, 10 HU darker', 20, 62);
      const id = g.createImageData(N, N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const gauss = (hash(x, y, 1) + hash(x, y, 2) + hash(x, y, 3) + hash(x, y, 4) - 2) * Math.sqrt(3);
        const r = Math.hypot(x - N * 0.55, y - N * 0.5), hu = (r < N * 0.13 ? 50 : 60) + gauss * sigma;
        const v = clamp((hu - (55 - 75)) / 150, 0, 1) * 255, i = (y * N + x) * 4;
        id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255;
      }
      const t = document.createElement('canvas'); t.width = N; t.height = N; t.getContext('2d').putImageData(id, 0, 0);
      g.imageSmoothingEnabled = false; g.drawImage(t, 30, 80, 360, 360);
      g.fillStyle = sigma < 12 ? '#5ce1a9' : sigma < 20 ? '#ffb547' : '#ff8a7a'; g.font = 'bold 20px sans-serif';
      g.fillText(`Noise: ±${sigma.toFixed(0)} HU`, 20, h - 8);
    });
    const bm = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 3.36), new THREE.MeshBasicMaterial({ map: board.tex, transparent: true, toneMapped: false }));
    bm.position.set(5.6, 1.75, 0.2); bm.rotation.y = -0.35; root.add(bm);

    let key = '';
    return {
      update(dt, s) {
        dt = Math.max(0, dt);
        for (const b of bars) {
          const sel = b.id === s.exam, v = sel ? doseOf(s) : b.v;
          b.h = approach(b.h, Math.max(0.012, v * H), 6, dt);
          b.b.scale.y = b.h; b.b.position.y = b.h / 2;
          b.ghost.visible = sel && Math.abs(v - b.v) > 0.05; b.ghost.scale.y = b.v * H; b.ghost.position.y = (b.v * H) / 2;
          b.top.position.y = Math.max(b.h, sel ? b.v * H : 0) + 0.3;
          b.mat.emissive.setHex(sel ? 0x401208 : 0);
          b.mat.opacity = b.ct && !sel ? 0.45 : 0.92;
          if (sel) b.top.element.innerHTML = `<b>${v.toFixed(v < 10 ? 1 : 0)} mSv</b>`;
          else b.top.element.innerHTML = `<b>${b.label}</b>`;
        }
        const k = `${s.exam}|${s.ma}|${s.tcm}|${s.ir}`;
        if (k !== key) { key = k; sigma = noiseOf(s); board.redraw(); }
      },
      readout: (s) => compact(stage, ((s) => {
        const e = EXAMS[s.exam], d = doseOf(s), t = e.len / ((BEAM_MM * 1) / ROT);
        const days = (d / BG) * 365;
        return `<div class="big">${e.name}: ${d.toFixed(1)} mSv</div>
          <div class="row"><span>Like natural background for</span><b>${days < 700 ? Math.round(days) + ' days' : (days / 365).toFixed(1) + ' years'}</b></div>
          <div class="row"><span>Same as chest X-rays</span><b>${Math.round(d / CXR).toLocaleString('en')} (at 0.02 mSv)</b></div>
          <div class="row"><span>Scan time</span><b>${t.toFixed(1)} s for ${e.len / 10} cm</b></div>
          <small>Typical adult values. Scan time at 64 × 0.625 mm, pitch 1, ${ROT} s a turn.</small>`;
      })(s)),
    };
  },
};
