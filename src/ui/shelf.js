// The library's book list: only the rows on screen (plus a margin) are in the DOM, so thousands of
// books scroll smoothly. Items sit at fixed positions inside a spacer as tall as the whole list.
import { h } from './dom.js';

export const LIST_ROW = 84;
const GRID_MIN = 112; // narrowest grid cell, px
const GRID_TEXT = 58; // title and author under the cover

export function measure(width, layout) {
  if (layout === 'list') return { cols: 1, cellW: width, rowH: LIST_ROW };
  const cols = Math.max(3, Math.floor(width / GRID_MIN));
  const cellW = width / cols;
  return { cols, cellW, rowH: Math.round(cellW * 1.5 + GRID_TEXT) };
}

// renderItem(book, index) → element. Returns { el, update }; call update() once el is in the page.
export function shelf({ books, layout, selecting, renderItem, signal, win = window }) {
  const inner = h('div', { class: 'shelf-inner' });
  const el = h('div', { class: `shelf ${layout}${selecting ? ' selecting' : ''}`, role: 'list' }, inner);
  let drawn = '';
  let frame = 0;

  function update() {
    frame = 0;
    const width = el.clientWidth || Math.min(win.innerWidth || 390, 760);
    const m = measure(width, layout);
    const rows = Math.ceil(books.length / m.cols);
    inner.style.height = `${rows * m.rowH}px`;
    const top = el.getBoundingClientRect().top;
    const vh = win.innerHeight || 800;
    const first = Math.max(0, Math.floor(-top / m.rowH) - 3);
    const last = Math.min(rows, Math.ceil((vh - top) / m.rowH) + 3);
    const key = `${first}:${last}:${m.cols}:${Math.round(m.cellW)}`;
    if (key === drawn) return;
    drawn = key;
    const items = [];
    for (let i = first * m.cols; i < Math.min(books.length, last * m.cols); i++) {
      const item = renderItem(books[i], i);
      const row = Math.floor(i / m.cols);
      const col = i % m.cols;
      item.style.transform = `translate(${col * m.cellW}px, ${row * m.rowH}px)`;
      item.style.width = `${m.cellW}px`;
      item.style.height = `${m.rowH}px`;
      items.push(item);
    }
    inner.replaceChildren(...items);
  }

  const schedule = () => {
    if (frame) return;
    frame = (win.requestAnimationFrame ?? ((f) => setTimeout(f, 16)))(update);
  };
  win.addEventListener('scroll', schedule, { passive: true, signal });
  win.addEventListener('resize', () => { drawn = ''; schedule(); }, { signal });
  return { el, update };
}
