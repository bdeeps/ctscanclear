// Chapter 4: Hounsfield units and windowing. Each pixel of a CT slice is a number, HU =
// 1000 × (μ − μwater) / μwater. The display maps a chosen window of HU (level ± width/2) to grey.
// Standard windows from Radiopaedia ("Windowing (CT)"): brain W80 L40, soft tissue W400 L50,
// lung W1500 L−600, bone W1800 L400.
import { THREE, canvasTexture, clamp } from '../kit.js';
import { headHU, chestHU, rasterHU, drawGrey, muOf, MU_WATER, compact } from '../ct.js';

const NPX = 256;
const PRESETS = { brain: [40, 80], soft: [50, 400], lung: [-600, 1500], bone: [400, 1800] };
// Reference values in HU (Radiopaedia "Hounsfield unit"; Wikipedia "CT scan").
const TISSUES = [
  { hu: -1000, t: 'Air −1000' }, { hu: -850, t: 'Lung about −850' }, { hu: -100, t: 'Fat about −100' },
  { hu: 0, t: 'Water 0, CSF about +5' }, { hu: 32, t: 'Brain +25 to +45' }, { hu: 50, t: 'Muscle, organs +20 to +80' },
  { hu: 70, t: 'Fresh blood +50 to +80' }, { hu: 300, t: 'Iodine in blood +200 to +400' },
  { hu: 400, t: 'Spongy bone +300 to +500' }, { hu: 1000, t: 'Dense bone +1000 and up' },
];
// A stretched HU scale: the crowded soft-tissue middle gets more room.
const SEG = [[-1000, 0], [-200, 0.25], [200, 0.62], [1500, 1]];
const toS = (hu) => { hu = clamp(hu, -1000, 1500); for (let i = 1; i < SEG.length; i++) if (hu <= SEG[i][0]) { const [a, pa] = SEG[i - 1], [b, pb] = SEG[i]; return pa + ((hu - a) / (b - a)) * (pb - pa); } return 1; };

export default {
  id: 'hounsfield',
  short: 'Numbers into greys',
  title: 'Hounsfield units and windows',
  subtitle: 'Every pixel is a number. You choose which numbers become grey.',
  view: { pos: [1.7, 3.3, 8.3], target: [1.35, 3.55, 0] },
  learn: `<p>A CT image isn't really a photo. Every pixel is a <b>number</b> saying how strongly that tiny bit of the body stops X-rays, its <b>attenuation</b> μ. Godfrey Hounsfield turned it into a handy scale, now named after him:</p>
    <p style="text-align:center"><b>HU = 1000 × (μ − μ<sub>water</sub>) ÷ μ<sub>water</sub></b></p>
    <p>So <b>water is 0</b> and <b>air is −1000</b>. Fat is about −100, soft tissues sit between about +20 and +80, and bone runs from a few hundred to well over +1000. The same tissue gives the same number on any scanner, which is what lets doctors measure things.</p>
    <p>But a screen shows only about 256 shades of grey, and our eyes tell apart far fewer. So the viewer picks a <b>window</b>: a <b>level</b> (the middle) and a <b>width</b>. Everything below the window is black and everything above is white. A narrow <b>brain window</b> shows the small difference between blood and brain. A wide <b>bone window</b> shows the skull's fine structure. A <b>lung window</b> shows the air-filled lungs.</p>
    <p>Iodine <b>contrast</b>, injected into a vein, stops X-rays strongly, so blood vessels and the heart's chambers light up.</p>
    <p class="tip"><b>Try it:</b> on the head, switch from the brain window to the bone window and watch the small bleed near the front disappear. On the chest, try the lung window, then turn on contrast.</p>`,
  terms: [
    { t: 'Hounsfield unit (HU)', d: 'CT’s scale of X-ray attenuation: water is 0, air is −1000, dense bone +1000 or more.' },
    { t: 'Attenuation (μ)', d: 'How strongly a material weakens an X-ray beam per centimetre.' },
    { t: 'Window level', d: 'The HU value shown as middle grey.' },
    { t: 'Window width', d: 'The range of HU spread from black to white. Narrow shows small differences; wide shows everything, faintly.' },
    { t: 'Contrast agent', d: 'An iodine solution injected into a vein. It makes blood show up bright on CT.' },
  ],
  defaults: { slice: 'head', preset: 'brain', level: 40, width: 80, contrast: false },
  onChange(s, key) {
    if (key === 'preset' && PRESETS[s.preset]) [s.level, s.width] = PRESETS[s.preset];
    if (key === 'slice') { s.preset = s.slice === 'head' ? 'brain' : 'soft'; [s.level, s.width] = PRESETS[s.preset]; }
    if (key === 'level' || key === 'width') { const p = Object.entries(PRESETS).find(([, v]) => Math.abs(v[0] - s.level) < 3 && Math.abs(v[1] - s.width) < 5); s.preset = p ? p[0] : 'custom'; }
  },
  controls: [
    { key: 'slice', type: 'seg', label: 'Slice', options: [{ v: 'head', label: 'Head' }, { v: 'chest', label: 'Chest' }] },
    { key: 'preset', type: 'seg', label: 'Window', options: [{ v: 'brain', label: 'Brain' }, { v: 'soft', label: 'Soft tissue' }, { v: 'lung', label: 'Lung' }, { v: 'bone', label: 'Bone' }], fmt: (v) => (v === 'custom' ? 'custom' : '') },
    { key: 'level', type: 'range', label: 'Level (middle grey)', min: -1000, max: 1000, step: 5, fmt: (v) => `${Math.round(v)} HU` },
    { key: 'width', type: 'log', label: 'Width (black to white)', min: 10, max: 4000, fmt: (v) => `${Math.round(v)} HU` },
    { key: 'contrast', type: 'toggle', label: 'Iodine contrast in the blood', hint: 'Chest slice.' },
  ],
  quiz: [
    { q: 'What is the Hounsfield value of water?', options: ['−1000', '0', '+100', '+1000'], answer: 1, why: 'The scale is built around water: HU = 1000 × (μ − μwater) ÷ μwater, which is 0 for water.' },
    { q: 'Why does a bleed near the brain show clearly in a brain window but vanish in a bone window?', options: ['Bone windows remove blood', 'The brain window spreads a narrow range of HU over all the greys, so a 30 HU difference is easy to see', 'Blood is only visible with contrast', 'The bleed moves'], answer: 1, why: 'In a width of 80 HU, a 30 HU difference is over a third of the grey scale. In a width of 1,800 HU it is under 2%.' },
    { q: 'Which is closest to the HU of fat?', options: ['−1000', '−100', '+50', '+700'], answer: 1, why: 'Fat stops X-rays a little less than water, so it sits just below zero, around −100.' },
  ],
  reel: [
    { ms: 5600, caption: 'Every CT pixel is a number: water is 0, air is −1000, bone over +1000.', set: { slice: 'head', preset: 'custom', contrast: false }, anim: { level: [400, 40], width: [1800, 80, true] }, view: { pos: [1.9, 3.1, 8.6], target: [1.7, 2.85, 0] }, spin: 0 },
  ],

  build({ stage }) {
    const root = new THREE.Group(); stage.root.add(root);
    let img = null, key = '';
    const st = { level: 40, width: 80, slice: 'head' };

    const slice = canvasTexture(560, 600, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(10,12,18,.92)'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#e8eef8'; g.font = 'bold 26px sans-serif';
      g.fillText(st.slice === 'head' ? 'Head, seen from the feet' : 'Chest, seen from the feet', 20, 38);
      if (img) drawGrey(g, img, NPX, 20, 56, 520, 520, st.level - st.width / 2, st.level + st.width / 2);
      g.font = '16px sans-serif'; g.fillStyle = 'rgba(255,255,255,.55)';
      g.fillText('front', w / 2 - 18, 74); g.fillText("patient's left →", w - 150, h - 12);
    });
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.64), new THREE.MeshBasicMaterial({ map: slice.tex, transparent: true, toneMapped: false }));
    sm.position.set(0.55, 2.85, 0); root.add(sm);

    // The HU ruler: tissues on a stretched scale, the grey each value gets, and the window.
    const ruler = canvasTexture(420, 640, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(10,12,18,.9)'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#e8eef8'; g.font = 'bold 24px sans-serif'; g.fillText('Hounsfield scale', 18, 34);
      const Y0 = h - 30, Y1 = 64, Y = (hu) => Y0 - toS(hu) * (Y0 - Y1), X = 24, BW = 40;
      const lo = st.level - st.width / 2, hi = st.level + st.width / 2;
      for (let y = Y1; y <= Y0; y++) {
        // invert the stretched scale for this row
        const s = (Y0 - y) / (Y0 - Y1); let hu = 1500;
        for (let i = 1; i < SEG.length; i++) if (s <= SEG[i][1]) { const [a, pa] = SEG[i - 1], [b, pb] = SEG[i]; hu = a + ((s - pa) / (pb - pa)) * (b - a); break; }
        const v = Math.round(clamp((hu - lo) / (hi - lo), 0, 1) * 255);
        g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(X, y, BW, 1.5);
      }
      // window band
      g.strokeStyle = '#ff6b9a'; g.lineWidth = 3; g.strokeRect(X - 6, Y(hi), BW + 12, Math.max(3, Y(lo) - Y(hi)));
      g.fillStyle = '#ff6b9a'; g.font = 'bold 16px sans-serif'; g.fillText('window', X - 4, Math.max(Y1 - 8, Y(hi) - 8));
      // tissue labels, spread so they don't overlap
      const items = TISSUES.map((t) => ({ ...t, y: Y(t.hu) })).sort((a, b) => b.y - a.y);
      const ys = items.map((t) => t.y);
      for (let pass = 0; pass < 40; pass++) for (let i = 1; i < ys.length; i++) if (ys[i - 1] - ys[i] < 28) { const d = (28 - (ys[i - 1] - ys[i])) / 2; ys[i - 1] += d; ys[i] -= d; }
      const lift = Math.max(0, ys[0] - (Y0 + 4)); for (let i = 0; i < ys.length; i++) ys[i] -= lift;
      g.font = '19px sans-serif';
      items.forEach((t, i) => {
        const inWin = t.hu >= lo && t.hu <= hi;
        g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(X + BW + 2, t.y); g.lineTo(X + BW + 22, ys[i]); g.lineTo(X + BW + 28, ys[i]); g.stroke();
        g.fillStyle = inWin ? '#e8eef8' : 'rgba(255,255,255,.45)'; g.fillText(t.t, X + BW + 32, ys[i] + 6);
      });
    });
    const rm = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.96), new THREE.MeshBasicMaterial({ map: ruler.tex, transparent: true, toneMapped: false }));
    rm.position.set(3.75, 2.85, -0.3); rm.rotation.y = -0.3; root.add(rm);

    return {
      update(dt, s) {
        dt = Math.max(0, dt);
        const k = `${s.slice}|${s.contrast}`;
        if (k !== key) { key = k; img = s.slice === 'head' ? rasterHU(headHU, NPX) : rasterHU(chestHU, NPX, s.contrast); st.level = null; }
        if (st.level !== s.level || st.width !== s.width || st.slice !== s.slice) {
          st.level = s.level; st.width = s.width; st.slice = s.slice;
          slice.redraw(); ruler.redraw();
        }
      },
      readout: (s) => compact(stage, ((s) => {
        const lo = Math.round(s.level - s.width / 2), hi = Math.round(s.level + s.width / 2);
        const name = { brain: 'Brain window', soft: 'Soft-tissue window', lung: 'Lung window', bone: 'Bone window' }[s.preset] || 'Your own window';
        return `<div class="big">${name}</div>
          <div class="row"><span>Black below</span><b>${lo} HU</b></div>
          <div class="row"><span>White above</span><b>${hi} HU</b></div>
          <div class="row"><span>Each shade of grey</span><b>${(s.width / 256).toFixed(s.width < 256 ? 2 : 1)} HU</b></div>
          <div class="row"><span>μ at the level</span><b>${muOf(s.level).toFixed(3)} per cm</b></div>
          <small>μ of water taken as ${MU_WATER} per cm, for X-rays of about 70 keV.</small>`;
      })(s)),
    };
  },
};
