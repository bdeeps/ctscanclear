// Chapter 3: reconstruction, computed for real. The Shepp–Logan head phantom's exact projections
// (its Radon transform) at N angles are smeared back across the image (back-projection), with or
// without the Ram-Lak ramp filter first. 128 × 128 pixels, 128 detector bins.
import { THREE, canvasTexture, clamp } from '../kit.js';
import { rasterPhantom, sinogram, rampFilter, backprojectView, drawGrey, DEG, compact } from '../ct.js';

const NPX = 128, D = 128;
const TRUTH = rasterPhantom(NPX);
const inside = (i) => { const x = -1 + ((i % NPX) + 0.5) * 2 / NPX, y = 1 - (Math.floor(i / NPX) + 0.5) * 2 / NPX; return x * x + y * y < 0.9; };

// Root-mean-square error against the true slice, after the best straight-line fit of grey levels
// (so plain back-projection isn't judged on brightness alone). As % of the skull's value (1.0).
function rmsError(img) {
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < img.length; i++) if (inside(i)) { const x = img[i], y = TRUTH[i]; n++; sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const a = (n * sxy - sx * sy) / Math.max(1e-12, n * sxx - sx * sx), b = (sy - a * sx) / n;
  let e = 0; for (let i = 0; i < img.length; i++) if (inside(i)) e += (a * img[i] + b - TRUTH[i]) ** 2;
  return Math.sqrt(e / n) * 100;
}

export default {
  id: 'recon',
  short: 'Rebuilding the slice',
  title: 'Turning shadows into a picture',
  subtitle: 'Smear every shadow back across the image, but sharpen it first.',
  view: { pos: [0.4, 3.4, 8.9], target: [0.35, 3.45, 0] },
  learn: `<p>The scanner never sees the slice itself. It only has shadows. How do you get the picture back? This board does it for real, with a famous test slice called the <b>Shepp–Logan head</b>.</p>
    <p>Take one shadow and <b>smear it back</b> across the image, along the direction the X-rays travelled. Where the shadow was dark, the smear is bright. Do it for every angle and add the smears up. That is <b>back-projection</b>. The smears pile up where something really is, so the slice appears, but <b>blurry</b>, and with too few angles you see <b>star-shaped streaks</b>.</p>
    <p>The fix is to <b>filter</b> each shadow first. The <b>ramp filter</b> makes edges sharper and adds small dips on either side, so the extra blur cancels out when the smears are added. This is <b>filtered back-projection</b>, and for decades it was how nearly every CT image was made. Its neatest version was published in 1971 by <b>G. N. Ramachandran and A. V. Lakshminarayanan</b> in Bangalore, so the filter is called <b>Ram-Lak</b>.</p>
    <p>The maths behind all this was worked out in <b>1917</b> by Johann Radon, long before anyone could build the machine. Today many scanners use <b>iterative reconstruction</b>, which guesses, checks against the shadows and corrects, over and over.</p>
    <p class="tip"><b>Try it:</b> turn the filter off and watch the blur. Then slide the angles down to 8 and back up to 180 and watch the streaks fade.</p>`,
  terms: [
    { t: 'Back-projection', d: 'Smearing each projection back across the image along the direction its rays came from, then adding them up.' },
    { t: 'Filtered back-projection (FBP)', d: 'Back-projection after each projection has been sharpened with a ramp filter. It gives a sharp, accurate slice.' },
    { t: 'Ramp (Ram-Lak) filter', d: 'A filter that boosts fine detail in proportion to how fine it is, cancelling the blur of plain back-projection.' },
    { t: 'Radon transform', d: 'The maths that turns a slice into all of its line sums (its projections). CT runs it backwards.' },
    { t: 'Streak artefacts', d: 'Star-like lines in an image made from too few angles.' },
  ],
  defaults: { n: 60, filter: true, build: 0, auto: true },
  onChange(s, key) { if (key === 'n' || key === 'filter') { s.build = 1; s.auto = false; } if (key === 'build') s.auto = false; },
  controls: [
    { key: 'n', type: 'range', label: 'Number of angles', min: 8, max: 180, step: 1, ends: ['8', '180'], fmt: (v) => Math.round(v) + ' views' },
    { key: 'filter', type: 'toggle', label: 'Ramp filter (Ram-Lak)', hint: 'Off: plain back-projection.' },
    { key: 'build', type: 'range', label: 'Views added so far', min: 0, max: 1, step: 0.01, ends: ['none', 'all'], fmt: (v, s) => `${Math.round(v * Math.round(s.n))} of ${Math.round(s.n)}` },
    { key: 'replay', type: 'buttons', label: 'Watch it build', items: [{ label: '▶ Replay', act: (s) => { s.build = 0; s.auto = true; } }] },
  ],
  quiz: [
    { q: 'What does plain back-projection (no filter) give you?', options: ['A perfect image', 'A blurry image with star-shaped streaks', 'A blank image', 'Only the outline of the skull'], answer: 1, why: 'The smears pile up in the right places, but they also spread everywhere else, blurring the picture.' },
    { q: 'What does the ramp filter do before back-projection?', options: ['Adds colour', 'Sharpens each projection and adds dips that cancel the blur', 'Removes the bone', 'Makes the image bigger'], answer: 1, why: 'It boosts fine detail, so when the filtered smears are added the blur cancels out.' },
    { q: 'Who published the Ram-Lak filter in 1971?', options: ['Hounsfield and Cormack', 'G. N. Ramachandran and A. V. Lakshminarayanan', 'Radon and Einstein', 'Shepp and Logan'], answer: 1, why: 'Working in Bangalore, they showed that a simple convolution in real space does the job, about 30 times faster than using Fourier transforms.' },
  ],
  reel: [
    { ms: 5400, caption: 'Smear every shadow back across the picture and a blurry, streaky slice appears.', set: { n: 36, filter: false, auto: false }, anim: { build: [0, 1] }, view: { pos: [0.6, 3.1, 8.2], target: [0.75, 3.0, 0] }, spin: 0 },
    { ms: 5400, caption: 'Sharpen each shadow first with a ramp filter, and the true slice snaps into focus.', set: { filter: true, auto: false }, anim: { n: [12, 180], build: [1, 1] }, view: { pos: [0.6, 3.1, 8.2], target: [0.75, 3.0, 0] }, spin: 0 },
  ],

  build({ stage }) {
    const root = new THREE.Group(); stage.root.add(root);
    const img = new Float32Array(NPX * NPX);
    let N = 0, raw = null, filt = null, done = 0, key = '', err = null;
    const st = { k: 0 };

    const mk = (w, h, W, H, draw) => { const b = canvasTexture(w, h, draw); const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: b.tex, transparent: true, toneMapped: false })); root.add(m); return { ...b, mesh: m }; };
    const panel = (g, w, h, title) => { g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(10,12,18,.9)'; g.fillRect(0, 0, w, h); g.fillStyle = '#e8eef8'; g.font = 'bold 26px sans-serif'; g.fillText(title, 20, 38); };

    // The true slice (what we want).
    const A = mk(300, 340, 1.9, 2.15, (g, w, h) => { panel(g, w, h, 'The real slice'); drawGrey(g, TRUTH, NPX, 20, 56, 260, 260, 0, 0.5); });
    A.mesh.position.set(4.1, 3.75, -0.4); A.mesh.rotation.y = -0.25;

    // The sinogram (what the scanner measured), rows lighting up as they are used.
    const B = mk(420, 560, 2.3, 3.07, (g, w, h) => {
      panel(g, w, h, 'What the scanner measured');
      if (!raw) return;
      let mx = 0; for (let i = 0; i < raw.length; i++) mx = Math.max(mx, raw[i]);
      const id = g.createImageData(D, N);
      for (let i = 0; i < N; i++) for (let k = 0; k < D; k++) { const v = (raw[i * D + k] / mx) * 255, a = i < st.k ? 1 : 0.28, j = (i * D + k) * 4; id.data[j] = v * a; id.data[j + 1] = v * 0.86 * a; id.data[j + 2] = v * 0.55 * a + 14; id.data[j + 3] = 255; }
      const t = document.createElement('canvas'); t.width = D; t.height = N; t.getContext('2d').putImageData(id, 0, 0);
      g.imageSmoothingEnabled = N < 60 ? false : true; g.drawImage(t, 20, 60, w - 40, h - 110);
      g.fillStyle = 'rgba(255,255,255,.6)'; g.font = '17px sans-serif'; g.fillText(`${N} angles over 180° ↓`, 20, h - 22); g.fillText('detector →', w - 110, h - 22);
    });
    B.mesh.position.set(-2.6, 1.95, -0.4); B.mesh.rotation.y = 0.25;

    // The reconstruction, with the current view's projection (raw and filtered) underneath.
    const C = mk(560, 700, 3.2, 4.0, (g, w, h) => {
      panel(g, w, h, filt && st.filter ? 'Filtered back-projection' : 'Plain back-projection');
      const X0 = 50, Y0 = 60, S = 460;
      if (st.filter) drawGrey(g, img, NPX, X0, Y0, S, S, 0, (0.5 * st.k) / Math.max(1, N));
      else { let mx = 1e-9; for (let i = 0; i < img.length; i++) mx = Math.max(mx, img[i]); drawGrey(g, img, NPX, X0, Y0, S, S, 0, mx); }
      // The direction of the last view added: rays run across the image at this angle.
      if (st.k > 0 && st.k < N) {
        const th = ((st.k - 1) * Math.PI) / N, cx = X0 + S / 2, cy = Y0 + S / 2, r = S * 0.42;
        g.strokeStyle = '#ffd27a'; g.lineWidth = 2; g.setLineDash([8, 6]);
        g.beginPath(); g.moveTo(cx - Math.sin(th) * r - Math.cos(th) * S * 0.45, cy - Math.cos(th) * r + Math.sin(th) * S * 0.45); g.lineTo(cx - Math.sin(th) * r + Math.cos(th) * S * 0.45, cy - Math.cos(th) * r - Math.sin(th) * S * 0.45); g.stroke(); g.setLineDash([]);
      }
      // Projection strip: raw (amber) and after the ramp filter (cyan).
      const i = Math.max(0, Math.min(N - 1, st.k - 1)), PY = h - 110, PH = 80;
      if (raw) {
        let mr = 1e-9, mf = 1e-9; for (let k = 0; k < D; k++) { mr = Math.max(mr, raw[i * D + k]); mf = Math.max(mf, Math.abs(filt[i * D + k])); }
        g.strokeStyle = 'rgba(255,255,255,.15)'; g.beginPath(); g.moveTo(X0, PY + PH * 0.6); g.lineTo(X0 + S, PY + PH * 0.6); g.stroke();
        const line = (arr, m, col, sc) => { g.strokeStyle = col; g.lineWidth = 2.2; g.beginPath(); for (let k = 0; k < D; k++) { const x = X0 + ((k + 0.5) / D) * S, y = PY + PH * 0.6 - (arr[i * D + k] / m) * PH * sc; k ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); };
        line(raw, mr, '#ffd27a', 0.6);
        if (st.filter) line(filt, mf, '#8ef0ff', 0.55);
        g.font = '17px sans-serif'; g.fillStyle = '#ffd27a'; g.fillText('shadow', X0, h - 8); if (st.filter) { g.fillStyle = '#8ef0ff'; g.fillText('after the ramp filter: sharper, with dips', X0 + 80, h - 8); }
      }
    });
    C.mesh.position.set(0.75, 2.75, 0);

    return {
      update(dt, s) {
        dt = Math.max(0, dt);
        const n = Math.round(clamp(s.n, 8, 180));
        if (s.auto) s.build = Math.min(1, s.build + dt / 3.2);
        if (n !== N) { N = n; raw = sinogram(N, D); filt = rampFilter(raw, N, D); key = ''; }
        const k = Math.round(clamp(s.build, 0, 1) * N), nk = `${N}|${s.filter}`;
        if (nk !== key || k < done) { key = nk; img.fill(0); done = 0; err = null; }
        while (done < k) backprojectView(img, NPX, s.filter ? filt : raw, done++, N, D);
        if (done === N && err === null) err = rmsError(img);
        const changed = st.k !== done || st.filter !== s.filter || st.n !== N;
        st.k = done; st.filter = s.filter; st.n = N;
        if (changed) { B.redraw(); C.redraw(); }
      },
      readout: (s) => compact(stage, ((s) => {
        const n = Math.round(s.n), k = Math.round(clamp(s.build, 0, 1) * n);
        return `<div class="big">${k} of ${n} views added</div>
          <div class="row"><span>Method</span><b>${s.filter ? 'filtered back-projection' : 'plain back-projection'}</b></div>
          <div class="row"><span>Sums done</span><b>${(k * NPX * NPX).toLocaleString('en')}</b></div>
          <div class="row"><span>Error vs the real slice</span><b>${err === null ? '…' : err.toFixed(1) + '%'}</b></div>
          <small>Computed live: ${NPX} × ${NPX} pixels, ${D} detector bins, exact line sums.</small>`;
      })(s)),
    };
  },
};
