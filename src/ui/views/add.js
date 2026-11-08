import { h, formDialog } from '../dom.js';
import { ICONS } from '../icons.js';
import { coverEl } from '../cover.js';
import { mascot } from '../cat-layer.js';
import { STATUS_LABELS } from '../../lib/book.js';
import { findDuplicate } from '../../lib/library.js';
import { isbnFromQuery, cleanIsbn, toIsbn13, isIsbn10, formatIsbn } from '../../lib/isbn.js';
import { seriesLabel } from '../../lib/series.js';
import { addModes } from './discover.js';

function manualDialog(ctx) {
  const { state, actions } = ctx;
  const q = state.add.query.trim();
  const isbn = isbnFromQuery(q);
  formDialog({
    title: 'Add a book by hand',
    ok: 'Add book',
    fields: [
      { name: 'title', label: 'Title', value: isbn ? '' : q },
      { name: 'authors', label: 'Authors', hint: 'Separate several with commas.' },
      { name: 'isbn', label: 'ISBN', value: isbn ?? '', inputmode: 'numeric' },
      { name: 'pages', label: 'Pages', inputmode: 'numeric' },
      { name: 'year', label: 'Year published', inputmode: 'numeric' },
      { name: 'publisher', label: 'Publisher' },
    ],
    onSubmit: (v) => {
      if (!v.title.trim()) return false;
      const raw = cleanIsbn(v.isbn);
      actions.addManual({
        title: v.title, authors: v.authors.split(','), isbn13: toIsbn13(raw), isbn10: isIsbn10(raw) ? raw : '',
        pages: v.pages, year: v.year, publisher: v.publisher,
      });
      return true;
    },
  });
}

function result(ctx, c) {
  const { state, actions } = ctx;
  const dup = findDuplicate(state.data.books, c);
  return h('li', { class: `result${dup ? ' in-library' : ''}` },
    coverEl({ ...c, id: c.olWork || c.title, coverUrl: c.coverUrl ?? '', coverId: c.coverId ?? null }, { size: 'S', cls: 'thumb' }),
    h('div', { class: 'r-text' },
      h('span', { class: 'r-title' }, c.title),
      h('span', { class: 'r-author' }, c.authors.join(', ')),
      h('span', { class: 'r-meta' }, [c.year, c.pages ? `${c.pages} pages` : null, c.isbn13 ? formatIsbn(c.isbn13) : null].filter(Boolean).join(' · ')),
      dup?.seriesName ? h('button', { type: 'button', class: 'link r-series', onclick: () => actions.openSeries(dup.seriesName, { find: true }) },
        seriesLabel(dup), h('span', { class: 'r-series-go' }, ' · Add the rest')) : null),
    dup
      ? h('button', { type: 'button', class: 'btn small ghost', onclick: () => actions.go(`/book/${dup.id}`) }, 'In library')
      : h('button', { type: 'button', class: 'btn small primary add-result', onclick: () => actions.addCandidate(c) }, 'Add'));
}

function pastePanel(ctx) {
  const { state, actions } = ctx;
  const p = state.add.paste;
  const ta = h('textarea', { class: 'paste-list', rows: 6, value: p?.text ?? '', placeholder: 'One ISBN or title per line', 'aria-label': 'Books to add, one per line' });
  const rows = p?.rows;
  const chosen = rows?.filter((r) => r.checked).length ?? 0;
  const busy = rows?.some((r) => r.phase === 'waiting' || r.phase === 'looking');
  return h('section', { class: 'paste card' },
    h('h2', {}, 'Add a list'),
    h('p', { class: 'muted' }, 'Paste ISBNs or titles, one per line. Each is looked up; you choose which to add.'),
    ta,
    h('button', { type: 'button', class: 'btn lookup-all', disabled: !state.online || busy, onclick: () => actions.lookupList(ta.value) }, busy ? 'Looking up…' : 'Look them up'),
    rows ? h('ul', { class: 'batch' }, rows.map((r, i) => h('li', { class: `batch-row ${r.phase}${r.phase === 'done' && !r.match ? ' no-match' : ''}` },
      h('input', { type: 'checkbox', checked: r.checked, disabled: !r.match, 'aria-label': `Add ${r.match?.title ?? r.line}`, onchange: () => actions.toggleBatchRow(i) }),
      h('span', { class: 'b-line' }, r.line),
      h('span', { class: 'b-match' }, r.phase === 'looking' ? 'Looking…' : r.phase === 'waiting' ? '' : r.match
        ? `${r.match.title}${r.match.authors[0] ? ` · ${r.match.authors[0]}` : ''}${r.dup ? ' (already in library)' : ''}`
        : r.phase === 'offline' ? 'Offline' : 'No match')))) : null,
    rows && !busy ? h('button', { type: 'button', class: 'btn primary add-batch', disabled: !chosen, onclick: () => actions.addBatch() }, `Add ${chosen} book${chosen === 1 ? '' : 's'}`) : null);
}

export function addView(ctx) {
  const { state, actions } = ctx;
  const a = state.add;
  const online = state.online;
  const input = h('input', {
    class: 'add-search', type: 'search', value: a.query, placeholder: 'Title, author or ISBN', 'aria-label': 'Find a book',
    'data-focus': 'add-search', autocomplete: 'off', enterkeyhint: 'search',
    oninput: (e) => { a.query = e.target.value; },
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && online) actions.search(); });

  let results = null;
  if (a.phase === 'searching') results = h('p', { class: 'searching' }, 'Searching…');
  else if (a.phase === 'error') results = h('p', { class: 'error' }, 'The book services didn’t answer. Try again in a moment, or add it by hand.');
  else if (a.phase === 'done') {
    results = a.results.length
      ? h('ul', { class: 'results' }, a.results.map((c) => result(ctx, c)))
      : h('div', { class: 'results' }, h('p', { class: 'nothing' }, 'No matches. Check the spelling, try fewer words, or add it by hand.'));
  }

  return h('section', { class: 'add-view' },
    addModes(actions, 'search'),
    h('header', { class: 'top' }, h('h1', {}, 'Add books')),
    online ? null : h('div', { class: 'offline-note' }, mascot('offline', 'small'),
      h('p', {}, h('strong', {}, 'You’re offline. '), 'Searching needs the internet. You can still add a book by hand, or save an ISBN to look up later.')),
    h('div', { class: 'add-bar' },
      h('label', { class: 'searchbar' }, h('span', { class: 'search-icon', html: ICONS.search }), input),
      h('button', { type: 'button', class: 'btn primary do-search', disabled: !online, onclick: () => actions.search() }, 'Search'),
      ctx.env.camera ? h('button', { type: 'button', class: 'icon-btn scan', 'aria-label': 'Scan barcodes', title: 'Scan barcodes', html: ICONS.scan, onclick: () => actions.scan() }) : null),
    h('div', { class: 'add-options' },
      h('label', {}, 'Add as ',
        h('select', { class: 'add-status', onchange: (e) => { a.status = e.target.value; } },
          ['want', 'reading', 'read', 'none'].map((s) => h('option', { value: s, selected: a.status === s }, s === 'none' ? 'No status' : STATUS_LABELS[s])))),
      h('button', { type: 'button', class: 'link manual', onclick: () => manualDialog(ctx) }, 'Not here? Add by hand'),
      online ? null : h('button', { type: 'button', class: 'btn small save-later', onclick: () => {
        const i = isbnFromQuery(a.query);
        if (i) actions.saveForLater(i);
        else actions.toast('Type or scan an ISBN to save it for later.');
      } }, 'Save ISBN for later')),
    results,
    a.paste ? pastePanel(ctx) : h('div', { class: 'more-ways' },
      h('button', { type: 'button', class: 'btn paste-open', onclick: () => actions.setAdd({ paste: { text: '', rows: null } }) }, 'Paste a list'),
      h('button', { type: 'button', class: 'btn', onclick: () => actions.go('/import') }, 'Import from Goodreads')));
}
