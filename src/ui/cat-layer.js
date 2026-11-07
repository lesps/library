// The cats: a few drawn in the page background (reshuffled each time you change pages), one perched
// on the tab bar, and fixed "mascot" cats for empty, offline and busy states. All decorative.
import { h } from './dom.js';
import { catSvg, randomCat, rng, scatter } from '../lib/cats.js';

const COUNTS = { lively: [4, 8], subtle: [2, 4], off: [0, 0] };
let uid = 0;

export const MASCOTS = {
  empty: { pose: 'book', coat: 'gray', accessory: 'glasses', eyes: 'happy', accent: '#2e8b74' },
  queue: { pose: 'loaf', coat: 'ginger', eyes: 'happy', accessory: 'bow', accent: '#5b4db8' },
  search: { pose: 'peek', coat: 'tuxedo', eyes: 'open', accent: '#4a90c8' },
  offline: { pose: 'sleep', coat: 'calico', eyes: 'closed', accent: '#5b4db8' },
  busy: { pose: 'stack', coat: 'siamese', accessory: 'glasses', eyes: 'open', accent: '#d64545' },
  done: { pose: 'sit', coat: 'ginger', eyes: 'happy', accessory: 'scarf', accent: '#2e8b74' },
  missing: { pose: 'peek', coat: 'black', eyes: 'open', accent: '#d64545' },
  safe: { pose: 'sit', coat: 'brown', eyes: 'happy', accessory: 'glasses', accent: '#5b4db8' },
};

export function mascot(kind, cls = '') {
  return h('span', { class: `mascot ${cls}`.trim(), 'aria-hidden': 'true', html: catSvg({ ...MASCOTS[kind], id: `m${uid++}` }) });
}

export function createCatLayer(doc = document) {
  const layer = h('div', { class: 'cat-layer', 'aria-hidden': 'true' });
  const perch = h('div', { class: 'perch', 'aria-hidden': 'true' });
  doc.body.prepend(layer);
  doc.body.append(perch);

  function shuffle(level, seed) {
    layer.dataset.level = level;
    layer.replaceChildren();
    perch.replaceChildren();
    const win = doc.defaultView;
    const W = win.innerWidth || 390;
    const H = win.innerHeight || 800;
    const [phone, wide] = COUNTS[level] ?? COUNTS.lively;
    const count = W >= 900 ? wide : phone;
    if (!count) return;
    const r = rng(seed);
    const top = 120;
    const bottom = 90;
    // On wide screens keep to the margins beside the content column; on phones, behind it.
    const areas = W >= 900
      ? [{ x: 0, w: (W - 760) / 2 - 8 }, { x: (W + 760) / 2 + 8, w: (W - 760) / 2 - 8 }]
      : [{ x: 0, w: W }];
    const per = Math.ceil(count / areas.length);
    for (const area of areas) {
      const size = W >= 900 ? [90, 150] : [70, 110];
      for (const s of scatter(r, { width: area.w, height: H - top - bottom, count: per, min: size[0], max: size[1] })) {
        const cat = randomCat(r);
        layer.append(h('span', {
          class: 'bg-cat',
          style: { left: `${area.x + s.x}px`, top: `${top + s.y}px`, width: `${s.size}px`, height: `${s.size}px`, transform: `rotate(${s.tilt}deg)` },
          html: catSvg({ ...cat, id: `bg${uid++}`, seed: Math.floor(r() * 1e6) }),
        }));
      }
    }
    // One cat peeks over the tab bar, somewhere along it.
    const p = randomCat(r);
    perch.style.left = `${Math.round(12 + r() * Math.max(0, Math.min(W, 760) - 84))}px`;
    perch.append(h('span', { class: 'perch-cat', html: catSvg({ ...p, pose: 'peek', ledge: false, id: `p${uid++}` }) }));
  }

  return { shuffle, destroy: () => { layer.remove(); perch.remove(); } };
}
