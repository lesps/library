import { workerProgress } from '../progress.js';
import { h, plural } from '../dom.js';
import { ICONS, PAW } from '../icons.js';
import { coverEl, displayTitle } from '../cover.js';
import { mascot } from '../cat-layer.js';
import { shelf } from '../shelf.js';
import { queryBooks, statusCounts, SORTS } from '../../lib/library.js';
import { STATUS_LABELS } from '../../lib/book.js';
import { readCounts } from '../../lib/reads.js';
import { seriesLabel } from '../../lib/series.js';

const CHIPS = [['all', 'All'], ['reading', 'Reading'], ['want', 'Want to read'], ['read', 'Read'], ['none', 'No status']];
const LONG_PRESS = 450;

export const stamp = (status) => (status === 'none' ? null : h('span', { class: `stamp ${status}` }, STATUS_LABELS[status]));

export const paws = (rating, cls = '') => (rating ? h('span', { class: `paws ${cls}`.trim(), 'aria-label': `Rated ${rating} of 5` },
  Array.from({ length: rating }, () => h('span', { class: 'paw', html: PAW }))) : null);

function emptyLibrary({ actions }) {
  return h('section', { class: 'empty' },
    mascot('empty', 'big'),
    h('h1', {}, 'Your shelves are empty'),
    h('p', {}, 'Bring your books over from Goodreads, or add them one at a time.'),
    h('div', { class: 'empty-actions' },
      h('button', { type: 'button', class: 'btn primary', onclick: () => actions.go('/import') }, 'Import from Goodreads'),
      h('button', { type: 'button', class: 'btn', onclick: () => actions.go('/add') }, 'Add a book')));
}

function backupNudge({ actions, state }) {
  if (!actions.backupDue()) return null;
  const last = state.meta.lastExport;
  return h('div', { class: 'backup-nudge' },
    mascot('safe', 'small'),
    h('p', {}, h('strong', {}, 'Save a backup file. '), last ? 'Your library changed since the last one.' : 'Your library lives only on this device until you do.'),
    h('div', { class: 'nudge-actions' },
      h('button', { type: 'button', class: 'btn small primary export-backup', onclick: () => actions.exportBackup() }, 'Save backup'),
      h('button', { type: 'button', class: 'btn small ghost', onclick: () => actions.snoozeBackup() }, 'Later')));
}

export function libraryView(ctx) {
  const { state, actions, signal, afterRender } = ctx;
  const lib = state.library;
  const counts = statusCounts(state.data.books);
  if (!counts.all) return emptyLibrary(ctx);

  const collections = actions.collections();
  const books = queryBooks(state.data.books, { ...lib, notes: state.data.notes, reads: state.data.reads });
  const times = lib.layout === 'list' ? readCounts(state.data.reads) : null;
  const order = books.map((b) => b.id);
  const sel = state.selection;
  const nameOf = new Map(collections.map((c) => [c.id, c.name]));

  const item = (b) => {
    const picked = sel?.has(b.id);
    const el = h('div', { class: `book${picked ? ' selected' : ''}`, role: 'listitem', 'data-id': b.id, tabindex: '0', 'aria-selected': sel ? String(!!picked) : null },
      coverEl(b, { size: lib.layout === 'grid' ? 'M' : 'S' }),
      h('div', { class: 'meta' },
        h('span', { class: 'title' }, displayTitle(b)),
        h('span', { class: 'author' }, b.needsLookup ? 'Details pending' : b.authors.join(', ')),
        lib.layout === 'list' ? h('span', { class: 'row-extra' }, stamp(b.status), paws(b.rating, 'small'),
          b.seriesName ? h('span', { class: 'series' }, seriesLabel(b)) : null,
          (times.get(b.id)?.count ?? 0) > 1 ? h('span', { class: 'reads-count' }, `Read ${times.get(b.id).count}×`) : null,
          b.collectionIds.length ? h('span', { class: 'in' }, b.collectionIds.map((id) => nameOf.get(id)).filter(Boolean).join(', ')) : null) : null),
      lib.layout === 'grid' && b.status === 'reading' ? h('span', { class: 'ribbon' }, 'Reading') : null,
      sel ? h('span', { class: 'tick', html: ICONS.check }) : null);

    let timer = 0;
    let start = null;
    let longPressed = false;
    el.addEventListener('pointerdown', (e) => {
      if (sel || e.button > 0) return;
      longPressed = false;
      start = [e.clientX, e.clientY];
      timer = setTimeout(() => { longPressed = true; actions.startSelect(b.id); }, LONG_PRESS);
    });
    el.addEventListener('pointermove', (e) => {
      if (start && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 8) clearTimeout(timer);
    });
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(t, () => clearTimeout(timer));
    el.addEventListener('contextmenu', (e) => { if (longPressed) e.preventDefault(); });
    const activate = (e) => {
      if (longPressed) { longPressed = false; return; }
      if (sel) actions.toggleSelect(b.id, { shift: e.shiftKey, order });
      else actions.go(`/book/${b.id}`);
    };
    el.addEventListener('click', activate);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(e); } });
    return el;
  };

  const header = h('header', { class: 'top' },
    h('h1', { class: 'brand' }, 'Catalog'),
    h('span', { class: 'total' }, plural(counts.all, 'book')),
    h('div', { class: 'top-actions' },
      sel
        ? h('button', { type: 'button', class: 'btn small primary', onclick: () => actions.endSelect() }, 'Done')
        : h('button', { type: 'button', class: 'btn small select-mode', onclick: () => actions.startSelect() }, 'Select'),
      h('button', {
        type: 'button', class: 'icon-btn layout',
        'aria-label': lib.layout === 'grid' ? 'Show as a list' : 'Show as a grid',
        html: ICONS[lib.layout === 'grid' ? 'list' : 'grid'],
        onclick: () => actions.setFilter({ layout: lib.layout === 'grid' ? 'list' : 'grid' }),
      })));

  const controls = h('div', { class: 'controls' },
    h('label', { class: 'searchbar' },
      h('span', { class: 'search-icon', html: ICONS.search }),
      h('input', {
        class: 'search', type: 'search', value: lib.query, placeholder: 'Search titles, authors, notes',
        'aria-label': 'Search your library', 'data-focus': 'library-search', autocomplete: 'off',
        oninput: (e) => actions.setQuery(e.target.value),
      })),
    h('div', { class: 'chips', role: 'group', 'aria-label': 'Status' },
      CHIPS.filter(([s]) => s !== 'none' || counts.none || lib.status === 'none').map(([s, label]) => h('button', {
        type: 'button', 'data-status': s, 'aria-pressed': String(lib.status === s), onclick: () => actions.setFilter({ status: s }),
      }, label, h('span', { class: 'count' }, String(counts[s]))))),
    h('div', { class: 'filters' },
      h('select', { class: 'collection-filter', 'aria-label': 'Collection', onchange: (e) => actions.setFilter({ collection: e.target.value }) },
        h('option', { value: 'all', selected: lib.collection === 'all' }, 'All collections'),
        collections.map((c) => h('option', { value: c.id, selected: lib.collection === c.id }, c.name)),
        h('option', { value: 'none', selected: lib.collection === 'none' }, 'In no collection')),
      h('select', { class: 'sort', 'aria-label': 'Sort by', onchange: (e) => actions.setFilter({ sort: e.target.value }) },
        Object.entries(SORTS).map(([k, s]) => h('option', { value: k, selected: lib.sort === k }, s.label)))));

  const w = state.workers;
  const status = workerProgress(state, ctx.now());

  let list;
  if (books.length) {
    const s = shelf({ books, layout: lib.layout, selecting: !!sel, renderItem: item, signal });
    afterRender(s.update);
    list = s.el;
  } else {
    list = h('div', { class: 'no-results' }, mascot('search'),
      h('p', {}, 'No books match.'),
      h('button', { type: 'button', class: 'btn small', onclick: () => actions.setFilter({ status: 'all', collection: 'all', query: '' }) }, 'Clear filters'));
  }

  const bar = sel ? h('div', { class: 'bulkbar', role: 'toolbar', 'aria-label': 'Selected books' },
    h('div', { class: 'bulk-head' },
      h('span', { class: 'selected-count' }, `${sel.size} selected`),
      books.some((b) => !sel.has(b.id)) ? h('button', { type: 'button', class: 'btn small ghost', onclick: () => actions.selectAll(order) }, `Select all ${books.length}`) : null),
    h('div', { class: 'bulk-actions' },
      h('button', { type: 'button', 'data-bulk': 'status', disabled: !sel.size, onclick: () => actions.bulkStatus() }, 'Status'),
      h('button', { type: 'button', 'data-bulk': 'collection', disabled: !sel.size, onclick: () => actions.bulkCollection() }, 'Collection'),
      h('button', { type: 'button', 'data-bulk': 'delete', class: 'danger', disabled: !sel.size, onclick: () => actions.bulkDelete() }, 'Delete'),
      h('button', { type: 'button', 'data-bulk': 'more', 'aria-label': 'More actions', disabled: !sel.size, html: ICONS.more, onclick: () => actions.bulkMore() }))) : null;

  return h('section', { class: `library${sel ? ' selecting' : ''}` }, header, backupNudge(ctx), controls, status, list, bar);
}
