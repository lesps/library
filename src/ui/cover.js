// A book cover: the real one when there's a URL, drawn over a generated one that shows until the
// image loads (or if it never does, e.g. offline and not cached).
import { h } from './dom.js';
import { coverSrc } from '../lib/lookup.js';
import { formatIsbn } from '../lib/isbn.js';

// Bookcloth colours for covers drawn when there's no picture.
const CLOTH = ['#2f6b5e', '#2d4f8a', '#8a2f3a', '#5b3f86', '#3b6b3a', '#b5761c', '#4f6e8f', '#a5482a', '#6b5b3e', '#2b6f8f', '#7a3f6b', '#506b2e'];

function hash(s) {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
  return x >>> 0;
}

export const displayTitle = (b) => b.title || (b.isbn13 ? `ISBN ${formatIsbn(b.isbn13)}` : 'Untitled');

export function generatedCover(book) {
  const k = hash(book.title || book.isbn13 || book.id);
  return h('div', { class: `gen-cover band-${k % 3}`, style: { '--c': CLOTH[k % CLOTH.length] } },
    h('span', { class: 'gen-title' }, displayTitle(book)),
    book.authors[0] ? h('span', { class: 'gen-author' }, book.authors[0]) : null);
}

export function coverEl(book, { size = 'M', cls = '' } = {}) {
  const src = coverSrc(book, size);
  const wrap = h('div', { class: `cover ${cls}`.trim() }, generatedCover(book));
  if (src) {
    const img = h('img', { src, alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' });
    img.addEventListener('error', () => img.remove());
    // Open Library answers some missing covers with a 1×1 image.
    img.addEventListener('load', () => { if (img.naturalWidth > 0 && img.naturalWidth < 4) img.remove(); });
    wrap.append(img);
  }
  return wrap;
}
