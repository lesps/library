// Chibi cats drawn from parts: a pose, a coat, eyes and an accessory, all seeded so a cat can be
// redrawn exactly. Output is static SVG markup (no user data ever goes in), 120 × 120 units.

export const POSES = ['sit', 'loaf', 'sleep', 'peek', 'book', 'stack'];
export const EYES = ['open', 'happy', 'closed', 'wink'];
export const ACCESSORIES = ['none', 'glasses', 'bow', 'scarf'];
export const ACCENTS = ['#5b4db8', '#d64545', '#2e8b74', '#f2c14e', '#4a90c8', '#e07ab0'];

const INK = '#3b2a30';
const LIGHT_INK = '#f4e9d8'; // features drawn straight onto dark fur
const W = 2.4; // outline width

// base: fur; stripe: tabby marks; white: bib areas; patches: calico; points: Siamese; eye: iris colour
// (dark eyes when absent); inner: inside of the ears.
export const COATS = {
  ginger: { base: '#f5a54a', stripe: '#d9772b', inner: '#f7b3b3', pattern: 'tabby' },
  brown: { base: '#c19569', stripe: '#6e4b33', inner: '#efb0a8', pattern: 'tabby' },
  gray: { base: '#a3adb8', white: '#f7f4ef', inner: '#f0b6bd', pattern: 'bib' },
  black: { base: '#3d3644', inner: '#8c6878', eye: '#f2c14e', pattern: 'solid', dark: true },
  white: { base: '#fbf7f2', inner: '#f6b9c0', pattern: 'solid' },
  tuxedo: { base: '#35313b', white: '#f7f4ef', inner: '#8c6878', eye: '#9fd36a', pattern: 'bib', dark: true },
  calico: { base: '#fbf7f2', patches: ['#f2a04a', '#4a3b3a'], inner: '#f6b9c0', pattern: 'calico' },
  siamese: { base: '#f3e4c8', points: '#6b4a3a', inner: '#9b7466', eye: '#7fb8e6', pattern: 'points' },
};

// mulberry32: small, fast, good enough for picking cat parts.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const weighted = (r, pairs) => {
  const total = pairs.reduce((n, [, w]) => n + w, 0);
  let x = r() * total;
  for (const [v, w] of pairs) if ((x -= w) < 0) return v;
  return pairs.at(-1)[0];
};

const SCARF_POSES = new Set(['sit', 'book', 'stack']);

export function randomCat(r) {
  const pose = weighted(r, [['sit', 4], ['loaf', 3], ['sleep', 2], ['peek', 2], ['book', 3], ['stack', 2]]);
  const coat = pick(r, Object.keys(COATS));
  const eyes = pose === 'sleep' ? 'closed' : weighted(r, [['open', 5], ['happy', 4], ['wink', 1]]);
  let accessory = weighted(r, [['none', 4], ['glasses', 3], ['bow', 2], ['scarf', 2]]);
  if (accessory === 'scarf' && !SCARF_POSES.has(pose)) accessory = 'bow';
  const accent = pick(r, ACCENTS);
  const flip = r() < 0.5;
  return { pose, coat, eyes, accessory, accent, flip };
}

// ——— parts ———

const p = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
const outline = (d) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"/>`;
const ell = (cx, cy, rx, ry, fill, extra = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${extra}/>`;
const line = (d, color, width, extra = '', cap = 'round') => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="${cap}" stroke-linejoin="round"${extra}/>`;

const HEAD = 'M-32 3C-33-19-17-26 0-26S33-19 32 3C31 20 17 26 0 26S-31 20-32 3Z';
const EAR = 'M-29-6C-31-19-29-31-25-36C-23-39-19-38-17-36C-12-31-7-27-3-24Z';
const EAR_IN = 'M-25-13C-25-21-24-28-22-31C-18-28-14-25-10-22Z';
const BODY_SIT = 'M44 62C33 76 31 98 41 106C50 110 70 110 79 106C89 98 87 76 76 62Z';
const BODY_LOAF = 'M22 96C22 78 40 70 60 70S98 78 98 96C98 108 82 112 60 112S22 108 22 96Z';
const BODY_SLEEP = 'M26 92C26 72 46 64 68 64S106 74 106 92C106 106 90 112 68 112S26 108 26 92Z';

const ears = (c) => {
  const one = p(EAR, c.pattern === 'points' ? c.points : c.base, ` stroke="${INK}" stroke-width="${W}" stroke-linejoin="round"`) + p(EAR_IN, c.inner);
  return one + `<g transform="scale(-1 1)">${one}</g>`;
};

function headMarks(c, coat, id, cr) {
  switch (c.pattern) {
    case 'tabby':
      return line('M0-25V-17M-7.5-24-6-17.5M7.5-24 6-17.5M-32 1-25 2.5M-32 7-26 7.5M32 1 25 2.5M32 7 26 7.5', c.stripe, 2.6);
    case 'bib':
      return ell(0, 13, 12, 9.5, c.white);
    case 'calico': {
      const [a, b] = c.patches;
      const left = cr() < 0.5;
      return `<circle cx="${left ? -24 : 24}" cy="-18" r="15" fill="${a}"/><circle cx="${left ? 26 : -26}" cy="-14" r="11" fill="${b}"/>`;
    }
    case 'points':
      return `<radialGradient id="${id}-mask"><stop offset="0.55" stop-color="${c.points}" stop-opacity="0.85"/><stop offset="1" stop-color="${c.points}" stop-opacity="0"/></radialGradient>${ell(0, 13, 13, 10, `url(#${id}-mask)`)}`;
    default:
      return '';
  }
}

function eyesSvg(style, c) {
  const at = [-13, 13];
  const arc = (x, up) => line(up ? `M${x - 5} 4Q${x} -3 ${x + 5} 4` : `M${x - 5} 1Q${x} 7 ${x + 5} 1`, c.dark ? LIGHT_INK : INK, 2.6);
  const open = (x) => {
    if (c.eye) {
      return ell(x, 2, 5.4, 6.4, c.eye, ` stroke="${INK}" stroke-width="1.6"`) + ell(x, 2.4, 2.1, 4.6, '#241a22')
        + `<circle cx="${x + 1.9}" cy="-1.2" r="1.7" fill="#fff"/>`;
    }
    return ell(x, 2, 5.2, 6.2, '#2d2230') + `<circle cx="${x + 2}" cy="-1.4" r="2" fill="#fff"/><circle cx="${x - 1.8}" cy="4.6" r="1" fill="#fff"/>`;
  };
  switch (style) {
    case 'happy': return at.map((x) => arc(x, true)).join('');
    case 'closed': return at.map((x) => arc(x, false)).join('');
    case 'wink': return open(at[0]) + arc(at[1], true);
    default: return at.map(open).join('');
  }
}

const face = (c, eyes) => eyesSvg(eyes, c)
  + ell(-21, 11.5, 5, 3, '#f28b9a', ' opacity="0.45"') + ell(21, 11.5, 5, 3, '#f28b9a', ' opacity="0.45"')
  + p('M-2.8 8Q0 6.8 2.8 8Q1.6 10.8 0 11.2Q-1.6 10.8-2.8 8Z', '#e8798b')
  + line('M-5 12.8Q-2.5 16.2 0 12.4Q2.5 16.2 5 12.8', c.dark && c.pattern !== 'bib' ? LIGHT_INK : INK, 1.6)
  + line('M-31 8-41 6M-31 12.5-41 13.5M31 8 41 6M31 12.5 41 13.5', c.dark ? LIGHT_INK : INK, 1.3, ' opacity="0.7"');

const glasses = () => `<g class="glasses">${line('M-4.5 1Q0-1.5 4.5 1M-22 0-31-2.5M22 0 31-2.5', INK, 2)}`
  + `<circle cx="-13" cy="2" r="9" fill="#fff" fill-opacity="0.18" stroke="${INK}" stroke-width="2.2"/>`
  + `<circle cx="13" cy="2" r="9" fill="#fff" fill-opacity="0.18" stroke="${INK}" stroke-width="2.2"/></g>`;

const bow = (accent) => `<g class="bow" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round">`
  + p('M17-23 8-31 9-17Z', accent) + p('M17-23 27-30 25-16Z', accent) + `<circle cx="17" cy="-23" r="3.2" fill="${accent}"/></g>`;

function head({ c, coat, id, eyes, accessory, accent, cr }, x, y, s = 1, rot = 0) {
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">`
    + ears(c)
    + `<clipPath id="${id}-head"><path d="${HEAD}"/></clipPath>`
    + p(HEAD, c.base)
    + `<g clip-path="url(#${id}-head)">${headMarks(c, coat, id, cr)}</g>`
    + outline(HEAD)
    + face(c, eyes)
    + (accessory === 'glasses' ? glasses() : '')
    + (accessory === 'bow' ? bow(accent) : '')
    + '</g>';
}

function bodyMarks(c, kind) {
  if (c.pattern === 'tabby') {
    return kind === 'sit'
      ? line('M33 86Q40 87 43 83M32 95Q39 97 42 92M87 86Q80 87 77 83M88 95Q81 97 78 92', c.stripe, 2.6)
      : line('M40 76Q44 82 42 88M54 72Q57 79 55 86M70 72Q68 79 70 86M84 76Q80 82 82 88', c.stripe, 2.6);
  }
  if (c.pattern === 'bib') return kind === 'sit' ? ell(60, 84, 10, 15, c.white) : ell(60, 84, 16, 10, c.white);
  if (c.pattern === 'calico') {
    const [a, b] = c.patches;
    return `<circle cx="34" cy="90" r="14" fill="${a}"/><circle cx="86" cy="96" r="12" fill="${b}"/><circle cx="74" cy="72" r="8" fill="${a}"/>`;
  }
  return '';
}

function body(c, id, d, kind) {
  return `<clipPath id="${id}-body"><path d="${d}"/></clipPath>` + p(d, c.base)
    + `<g clip-path="url(#${id}-body)">${bodyMarks(c, kind)}</g>` + outline(d);
}

function tail(c, d) {
  const fill = c.pattern === 'points' ? c.points : c.base;
  return line(d, INK, 8 + W * 2) + line(d, fill, 8)
    + (c.pattern === 'tabby' ? line(d, c.stripe, 8, ' stroke-dasharray="3 6"', 'butt') : '');
}

const pawFill = (c) => (c.pattern === 'points' ? c.points : c.pattern === 'bib' ? c.white : c.base);
const paws = (c, xs, y, rx = 7.5, ry = 5) => xs.map((x) => ell(x, y, rx, ry, pawFill(c), ` stroke="${INK}" stroke-width="${W}"`)).join('');

const scarf = (accent) => `<g class="scarf" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round">`
  + p('M68 76 73 92 64 93 61 78Z', accent) + p('M40 70Q60 79 80 70L81 77Q60 87 39 77Z', accent) + '</g>';

function openBook(accent) {
  return `<g class="book" stroke="${INK}" stroke-width="${W}" stroke-linejoin="round">`
    + p('M60 87Q48 82 35 86V105Q48 101 60 106Q72 101 85 105V86Q72 82 60 87Z', accent)
    + p('M60 85Q50 80 39 83V101Q50 98 60 102Z', '#fffdf6') + p('M60 85Q70 80 81 83V101Q70 98 60 102Z', '#fffdf6')
    + '</g>' + line('M44 88 55 90M44 93 55 95M65 90 76 88M65 95 76 93', '#b9b2c7', 1.4);
}

function bookPile(r) {
  const spines = ['#5b4db8', '#2e8b74', '#d64545', '#4a90c8', '#f2c14e'];
  const a = pick(r, spines);
  const b = pick(r, spines.filter((x) => x !== a));
  const c = pick(r, spines.filter((x) => x !== a && x !== b));
  const book = (x, y, w, h, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2.5" fill="${fill}" stroke="${INK}" stroke-width="${W}"/>`
    + line(`M${x + 6} ${y + 2.5}V${y + h - 2.5}M${x + w - 6} ${y + 2.5}V${y + h - 2.5}`, '#fff', 1.6, ' opacity="0.55"');
  return book(28, 104, 66, 12, a) + book(33, 93, 58, 11, b) + book(26, 84, 62, 9, c);
}

// Drawn after any flip so the letters never read backwards; they float above the cat's head.
const zzz = (flip) => line(flip ? 'M84 40H91L84 47H91M94 28H99L94 33H99' : 'M22 40H29L22 47H29M12 28H17L12 33H17', INK, 2, ' opacity="0.6"');

// ——— whole cats ———

export function catSvg({ pose = 'sit', coat = 'ginger', eyes = 'open', accessory = 'none', accent = ACCENTS[0], flip = false, id = 'cat', seed = 1, ledge = true }) {
  const c = COATS[coat] ?? COATS.ginger;
  const cr = rng(seed);
  const parts = { c, coat, id, eyes, accessory, accent, cr };
  const pf = (xs, y, rx, ry) => paws(c, xs, y, rx, ry);
  const sitting = (extra = '') => tail(c, 'M78 100C98 104 106 88 99 78C95 72 99 64 105 67')
    + body(c, id, BODY_SIT, 'sit') + pf([51, 69], 106)
    + (accessory === 'scarf' ? scarf(accent) : '') + extra;
  let art;
  switch (pose) {
    case 'loaf':
      art = body(c, id, BODY_LOAF, 'loaf') + tail(c, 'M95 102C99 111 88 114 74 113') + pf([48, 70], 110, 6.5, 4)
        + head({ ...parts, accessory: accessory === 'scarf' ? 'bow' : accessory }, 60, 58);
      break;
    case 'sleep':
      art = body(c, id, BODY_SLEEP, 'loaf') + tail(c, 'M102 98C104 112 74 116 46 109')
        + head({ ...parts, eyes: 'closed', accessory: accessory === 'scarf' ? 'bow' : accessory }, 42, 82, 0.9, -14);
      break;
    case 'peek':
      // ledge: false leaves out the book it peeks over, for perching on an edge of the page itself.
      art = head({ ...parts, accessory: accessory === 'scarf' ? 'bow' : accessory }, 60, 70, 1.1)
        + (ledge ? `<rect x="10" y="100" width="100" height="16" rx="3" fill="${accent}" stroke="${INK}" stroke-width="${W}"/>`
          + line('M18 103V113M102 103V113', '#fff', 1.6, ' opacity="0.55"') : '')
        + pf([38, 82], 100, 8, 5.5);
      break;
    case 'book':
      art = sitting() + head(parts, 60, 46) + openBook(accent) + pf([45, 75], 85, 6, 4.5);
      break;
    case 'stack':
      art = bookPile(cr) + `<g transform="translate(10.8 -6) scale(0.82)">${sitting()}${head(parts, 60, 46)}</g>`;
      break;
    default:
      art = sitting() + head(parts, 60, 46);
  }
  const g = (flip ? `<g transform="translate(120 0) scale(-1 1)">${art}</g>` : art) + (pose === 'sleep' ? zzz(flip) : '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" aria-hidden="true" focusable="false">${g}</svg>`;
}

// Non-overlapping square spots for `count` cats of side min..max inside width × height.
export function scatter(r, { width, height, count, min = 70, max = 110, tries = 40 }) {
  const spots = [];
  for (let i = 0; i < count; i++) {
    for (let t = 0; t < tries; t++) {
      const size = Math.round(min + r() * (max - min));
      if (size > width || size > height) break;
      const x = Math.round(r() * (width - size));
      const y = Math.round(r() * (height - size));
      const clear = spots.every((s) => x + size <= s.x || s.x + s.size <= x || y + size <= s.y || s.y + s.size <= y);
      if (clear) {
        spots.push({ x, y, size, tilt: Math.round((r() - 0.5) * 16) });
        break;
      }
    }
  }
  return spots;
}
