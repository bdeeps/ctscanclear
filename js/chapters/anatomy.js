// Chapter 1: take a CT scanner apart. The gantry cover hides a heavy disc that spins two or three
// times a second, carrying the X-ray tube, a collimator, a curved detector, a generator and cooling.
import { THREE, M, exploder, approach, clamp } from '../kit.js';
import { makeGantry, makeTable, makePatient, makeConsole, GEO, TAU, compact } from '../ct.js';

// Real rotation times: most scanners today turn once in 0.25–0.5 s (e.g. 0.28 s on many 64-slice
// systems, 0.25 s on Siemens NAEOTOM Alpha and SOMATOM Force).
const R_TUBE = 0.7;          // m: rough radius of the tube housing's centre of mass from the isocentre
const ELEMENTS = 900;        // detector elements across each row (typically 700–1,000)
const VIEWS = 1000;          // views (snapshots) per rotation (typically about 1,000–2,500)

export default {
  id: 'anatomy',
  short: 'Inside the doughnut',
  title: 'Inside a CT scanner',
  subtitle: 'A ring that spins an X-ray tube and a curved camera around you, faster than you can blink.',
  view: { pos: [4.6, 4.9, 11.2], target: [-1.3, 3.3, 0.6] },
  learn: `<p>A CT scanner looks like a big <b>doughnut</b> with a bed that slides through the hole. The doughnut is called the <b>gantry</b>. Under its smooth cover is a heavy metal <b>disc</b>, well over a metre across, that can spin.</p>
    <p>On one side of the disc sits an <b>X-ray tube</b>. A <b>collimator</b>, two blocks of lead, trims its X-rays into a thin <b>fan</b>. Straight across the hole is a curved <b>detector</b>: rows of tiny sensors, often <b>64 rows</b> of about 900 each, that measure how much X-ray gets through you. (How X-rays are made and why bone stops more of them is the story of <b>XRayClear</b>.)</p>
    <p>The whole disc spins around you once every <b>0.25 to 0.5 seconds</b>. It can keep spinning in one direction because power and data cross over through <b>slip rings</b>: metal bands with brushes rubbing on them, so no cables get wound up. The disc also carries a <b>high-voltage generator</b> and a <b>cooling</b> unit, because almost all the tube's energy turns into heat.</p>
    <p>The <b>patient table</b> moves you through the ring in steps of a fraction of a millimetre. In the next room, behind lead glass, a radiographer runs the scan from the <b>console</b>.</p>
    <p class="tip"><b>Try it:</b> take the scanner apart, turn on X-ray view, then switch between rotation times and watch the g-force on the tube climb.</p>`,
  terms: [
    { t: 'Gantry', d: 'The doughnut-shaped part of a CT scanner that holds the spinning X-ray tube and detector.' },
    { t: 'Collimator', d: 'Lead blocks that shape the X-rays into a thin fan, so only the slice being scanned is exposed.' },
    { t: 'Detector array', d: 'Curved rows of sensors opposite the tube that measure how many X-rays pass through the body.' },
    { t: 'Slip ring', d: 'Metal rings with brushes rubbing on them. They pass power and data to a part that keeps spinning.' },
    { t: 'Rotation time', d: 'How long the tube takes to go once around the patient. Usually 0.25 to 0.5 seconds.' },
  ],
  defaults: { explode: 0, xray: false, rot: 0.35, slow: true, on: true },
  controls: [
    { key: 'explode', type: 'range', label: 'Take it apart', min: 0, max: 1, step: 0.01, ends: ['together', 'exploded'], fmt: (v) => Math.round(v * 100) + '%' },
    { key: 'xray', type: 'toggle', label: 'X-ray view', hint: 'Makes the cover see-through.' },
    { key: 'rot', type: 'seg', label: 'Rotation time', options: [{ v: 0.5, label: '0.5 s' }, { v: 0.35, label: '0.35 s' }, { v: 0.25, label: '0.25 s' }], fmt: (v) => (60 / v).toFixed(0) + ' turns a minute' },
    { key: 'slow', type: 'toggle', label: 'Slow motion (×15 slower)', hint: 'Real speed is a blur.' },
    { key: 'on', type: 'toggle', label: 'X-rays on' },
  ],
  quiz: [
    { q: 'Why can the ring of a modern CT scanner keep spinning the same way without stopping?', options: ['Its cables are very long', 'Slip rings pass power and data across without cables', 'It runs on batteries', 'It only turns once'], answer: 1, why: 'Brushes rubbing on metal rings carry power and data, so nothing gets wound up. Before slip rings, the gantry had to stop and turn back after every slice.' },
    { q: 'What sits directly across the hole from the X-ray tube?', options: ['The cooling fan', 'A curved detector array', 'A mirror', 'The patient table motor'], answer: 1, why: 'The detector catches the fan of X-rays after it has passed through the patient, and measures how much got through.' },
    { q: 'About how long does one turn of the ring take in a modern scanner?', options: ['About 5 minutes', 'About 5 seconds', 'About a third of a second', 'About a millisecond'], answer: 2, why: 'Most scanners turn once every 0.25 to 0.5 seconds. The first EMI scanner of 1971 took about 5 minutes for one set of views.' },
  ],
  reel: [
    { ms: 5400, caption: 'A CT scanner is a doughnut that spins an X-ray tube and a curved detector around you.', set: { xray: true, rot: 0.35, slow: true, on: true }, anim: { explode: [0, 0] }, view: { pos: [-7.4, 5.4, 10.2], target: [1.0, 2.4, 1.2] }, spin: 0.35 },
    { ms: 5200, caption: 'Slip rings let the ring keep spinning, about three times every second.', set: { xray: true, rot: 0.35, slow: true, on: true }, anim: { explode: [0, 1] }, view: { pos: [-5.6, 5.6, 8.4], target: [0.2, 2.8, -0.2] }, spin: 0.25 },
  ],

  build({ stage }) {
    const root = new THREE.Group(); stage.root.add(root);
    const gan = makeGantry({ cover: true, cols: 44, rows: 16 });
    root.add(gan.group);
    const table = makeTable(); root.add(table.group);
    const pat = makePatient(); pat.group.position.z = 1.05; table.cradle.add(pat.group);
    const con = makeConsole(null); con.position.set(-4.6, 0, 3.4); con.rotation.y = 0.5; root.add(con);
    gan.setCollimation(0.1);

    // Anchors for labels on spinning parts: they explode with their part but don't turn.
    const L = (t, obj, pos, cls) => stage.label(t, pos, obj, cls);
    const dir = (a, k) => [-Math.sin(a) * k, Math.cos(a) * k, 0];
    const setExplode = exploder([
      { obj: gan.cover, off: [0, 0.4, -3.4] },
      { obj: gan.tubeG, off: [0, 0.95, 0] },
      { obj: gan.coll, off: [0, 0.45, 0.9] },
      { obj: gan.detG, off: [0, -0.9, 0.7] },
      { obj: gan.gen, off: dir(2.15, 0.8) },
      { obj: gan.cool, off: dir(-2.15, 0.8) },
      { obj: gan.slip, off: [0, 0, -1.2] },
      { obj: table.cradle, off: [0, 0, 1.4] },
    ]);
    L('Gantry cover', gan.cover, [2.1, -1.9, 1.0]);
    L('Patient table', table.group, [0.75, 1.4, 4.6]);
    L('Operator console', con, [0, 3.2, 0]);
    const inner = [
      L('X-ray tube', gan.tubeG, [0.45, 2.15, 0.4], 'hot'),
      L('Collimator', gan.coll, [0.55, 0, 0.3]),
      L('Detector: 64 rows', gan.detG, [0.3, -1.65, 0.5], 'hot'),
      L('Generator', gan.gen, [0, 1.8, 0.4]),
      L('Cooling', gan.cool, [0, 1.8, 0.4]),
      L('Slip rings', gan.slip, [-1.5, -1.5, -0.8]),
    ];

    let angle = 0, speed = 0;
    return {
      update(dt, s) {
        dt = Math.max(0, dt);
        setExplode(s.explode);
        const see = s.xray || s.explode > 0.05;
        gan.setXray(see);
        inner.forEach((l) => { l.visible = see; });
        // Spin up and down smoothly (a real gantry takes several seconds to get up to speed).
        const target = TAU / s.rot / (s.slow ? 15 : 1);
        speed = approach(speed, target, 2.2, dt);
        angle += speed * dt;
        gan.setAngle(-angle);                     // clockwise, seen from the foot of the table
        gan.beamMesh.visible = s.on && s.explode < 0.3;
        gan.focusMat.color.setHex(s.on ? 0xffd27a : 0x555a66);
        gan.fanDisc.rotation.y += dt * 20;
      },
      readout: (s) => compact(stage, ((s) => {
        const w = TAU / s.rot, g = (w * w * R_TUBE) / 9.81, v = w * R_TUBE * 3.6;
        return `<div class="big">One turn every ${s.rot} s</div>
          <div class="row"><span>Turns per minute</span><b>${Math.round(60 / s.rot)}</b></div>
          <div class="row"><span>Tube speed</span><b>${Math.round(v)} km/h</b></div>
          <div class="row"><span>Force on the tube</span><b>about ${Math.round(g)} g</b></div>
          <div class="row"><span>Readings per turn</span><b>≈ ${(64 * ELEMENTS * VIEWS / 1e6).toFixed(0)} million</b></div>
          <small>64 rows × ${ELEMENTS} detectors × ${VIEWS.toLocaleString('en')} views a turn.</small>`;
      })(s)),
    };
  },
};
