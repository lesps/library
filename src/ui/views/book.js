import { h, formDialog, textDialog } from '../dom.js';
import { ICONS, PAW } from '../icons.js';
import { coverEl, displayTitle } from '../cover.js';
import { mascot } from '../cat-layer.js';
import { STATUS_LABELS } from '../../lib/book.js';
import { currentProgress, progressPercent } from '../../lib/records.js';
import { formatDate, isYmd, dayKey } from '../../lib/dates.js';
import { formatIsbn, toIsbn13, cleanIsbn, isIsbn10 } from '../../lib/isbn.js';

const STATUS_ORDER = ['want', 'reading', 'read', 'none'];

function missing(actions, deleted) {
  return h('section', { class: 'missing empty' }, mascot('missing', 'big'),
    h('h1', {}, deleted ? 'This book was deleted' : 'This book isn’t in your library'),
    deleted ? h('button', { type: 'button', class: 'btn primary', onclick: () => actions.restoreBooks([deleted.id]) }, 'Restore it') : null,
    h('button', { type: 'button', class: 'btn', onclick: () => actions.go('/library') }, 'Back to the library'));
}

export function editDetails(actions, b) {
  formDialog({
    title: 'Edit details',
    fields: [
      { name: 'title', label: 'Title', value: b.title },
      { name: 'subtitle', label: 'Subtitle', value: b.subtitle },
      { name: 'authors', label: 'Authors', value: b.authors.join(', '), hint: 'Separate several with commas.' },
      { name: 'isbn', label: 'ISBN', value: b.isbn13 || b.isbn10, inputmode: 'numeric' },
      { name: 'pages', label: 'Pages', value: b.pages ?? '', inputmode: 'numeric' },
      { name: 'year', label: 'Year published', value: b.year ?? '', inputmode: 'numeric' },
      { name: 'publisher', label: 'Publisher', value: b.publisher },
      { name: 'binding', label: 'Format', value: b.binding, hint: 'Paperback, Kindle, audiobook…' },
      { name: 'owned', label: 'I own a copy', type: 'checkbox', value: b.owned },
    ],
    onSubmit: (v) => {
      const isbn = cleanIsbn(v.isbn);
      actions.updateBook(b.id, {
        title: v.title, subtitle: v.subtitle, authors: v.authors.split(','), pages: v.pages, year: v.year,
        publisher: v.publisher, binding: v.binding, owned: v.owned,
        isbn13: toIsbn13(isbn), isbn10: isIsbn10(isbn) ? isbn : (isbn ? '' : b.isbn10),
        needsLookup: v.title.trim() ? false : b.needsLookup,
      });
    },
  });
}

function statusPicker(actions, b) {
  return h('div', { class: 'status-picker', role: 'group', 'aria-label': 'Status' },
    STATUS_ORDER.map((s) => h('button', {
      type: 'button', 'data-status': s, 'aria-pressed': String(b.status === s), onclick: () => actions.setStatus(b.id, s),
    }, s === 'none' ? 'No status' : STATUS_LABELS[s])));
}

function rating(actions, b) {
  return h('div', { class: 'rating', role: 'group', 'aria-label': `My rating: ${b.rating} of 5` },
    [1, 2, 3, 4, 5].map((n) => h('button', {
      type: 'button', 'data-rating': String(n), class: n <= b.rating ? 'on' : '',
      'aria-label': `${n} paw${n > 1 ? 's' : ''}`, 'aria-pressed': String(b.rating === n),
      html: PAW, onclick: () => actions.updateBook(b.id, { rating: b.rating === n ? 0 : n }),
    })));
}

function progress(ctx, b) {
  const { state, actions } = ctx;
  const mine = state.data.progress.filter((p) => p.bookId === b.id);
  const cur = currentProgress(mine);
  if (b.status !== 'reading' && !cur) return null;
  const pct = progressPercent(cur, b.pages);
  const byPage = !!b.pages;
  const input = byPage
    ? h('input', { class: 'page', type: 'number', inputmode: 'numeric', min: 0, max: b.pages, value: cur?.page ?? '', 'aria-label': 'Current page' })
    : h('input', { class: 'percent', type: 'number', inputmode: 'numeric', min: 0, max: 100, value: cur?.percent ?? '', 'aria-label': 'Percent read' });
  const save = () => {
    const v = input.value.trim();
    if (v === '') return;
    actions.addProgress(b.id, byPage ? { page: v } : { percent: v });
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  return h('section', { class: 'progress card' },
    h('h2', {}, 'Progress'),
    h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct ?? 0 },
      h('span', { style: { width: `${pct ?? 0}%` } })),
    h('div', { class: 'progress-row' },
      h('label', {}, byPage ? 'Page ' : 'Percent ', input, byPage ? ` of ${b.pages}` : ' %'),
      h('button', { type: 'button', class: 'btn small update-progress', onclick: save }, 'Update'),
      h('span', { class: 'pct' }, pct == null ? '' : `${pct}%`)),
    pct === 100 && b.status !== 'read' ? h('button', { type: 'button', class: 'btn primary', onclick: () => actions.setStatus(b.id, 'read') }, 'Mark as read') : null,
    cur ? h('p', { class: 'muted' }, `Updated ${formatDate(dayKey(cur.at)) || 'today'}`) : null);
}

function dates(actions, b) {
  const field = (label, key, cls) => h('label', { class: 'date' }, label,
    h('input', { type: 'date', class: cls, value: b[key], onchange: (e) => { if (!e.target.value || isYmd(e.target.value)) actions.updateBook(b.id, { [key]: e.target.value }); } }));
  return h('div', { class: 'dates' },
    field('Started', 'started', 'started'),
    field('Finished', 'finished', 'finished'),
    b.readCount > 1 ? h('span', { class: 'reads' }, `Read ${b.readCount} times`) : null);
}

function collectionsPicker(actions, b) {
  const cs = actions.collections();
  return h('section', { class: 'collections-picker card' },
    h('h2', {}, 'Collections'),
    h('div', { class: 'chip-row' },
      cs.map((c) => h('button', {
        type: 'button', class: 'chip', 'data-collection': c.id, 'aria-pressed': String(b.collectionIds.includes(c.id)),
        onclick: () => actions.toggleCollection(b.id, c.id),
      }, c.name)),
      h('button', { type: 'button', class: 'chip new-collection', onclick: () => actions.newCollectionFor(b.id) }, '+ New')));
}

function notes(ctx, b) {
  const { state, actions } = ctx;
  const list = state.data.notes.filter((n) => n.bookId === b.id && !n.deleted).sort((x, y) => y.at - x.at);
  const text = h('textarea', { class: 'note-text', rows: 3, placeholder: 'A thought, a quote, where you left off…', 'aria-label': 'New note' });
  const page = h('input', { class: 'note-page', type: 'number', inputmode: 'numeric', min: 0, placeholder: 'Page', 'aria-label': 'Page (optional)' });
  return h('section', { class: 'notes card ruled' },
    h('h2', {}, 'Notes'),
    h('div', { class: 'note-form' }, text, h('div', { class: 'note-form-row' }, page,
      h('button', { type: 'button', class: 'btn small primary add-note', onclick: () => { if (actions.addNote(b.id, text.value, page.value)) { text.value = ''; page.value = ''; } } }, 'Add note'))),
    list.map((n) => h('article', { class: 'note' },
      h('div', { class: 'note-head' },
        h('span', { class: 'note-date' }, formatDate(dayKey(n.at)) || ''),
        n.page != null ? h('span', { class: 'note-page' }, `p. ${n.page}`) : null,
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'link edit-note', onclick: () => textDialog({ title: 'Edit note', value: n.text, onSubmit: (v) => actions.editNote(n.id, v) }) }, 'Edit'),
        h('button', { type: 'button', class: 'link danger delete-note', onclick: () => actions.deleteNote(n.id) }, 'Delete')),
      h('p', { class: 'note-text' }, n.text))));
}

function review(actions, b) {
  return h('section', { class: 'review card' },
    h('div', { class: 'card-head' }, h('h2', {}, 'My review'),
      h('button', { type: 'button', class: 'link edit-review', onclick: () => textDialog({ title: 'My review', value: b.review, onSubmit: (v) => actions.updateBook(b.id, { review: v }) }) }, b.review ? 'Edit' : 'Write one')),
    b.review ? h('p', { class: 'review-text' }, b.review) : null);
}

function catalogCard(ctx, b) {
  const { actions, state } = ctx;
  const row = (label, value) => (value ? h('div', { class: 'cc-row' }, h('dt', {}, label), h('dd', {}, value)) : null);
  const published = b.year && b.originalYear && b.originalYear !== b.year ? `${b.year} (first ${b.originalYear})` : String(b.year ?? b.originalYear ?? '');
  return h('section', { class: 'catalog-card card' },
    h('h2', {}, 'Catalog card'),
    h('dl', {},
      row('ISBN', formatIsbn(b.isbn13) || b.isbn10),
      row('Publisher', b.publisher),
      row('Published', published),
      row('Pages', b.pages ? String(b.pages) : ''),
      row('Format', b.binding),
      row('Owned', b.owned ? 'Yes' : ''),
      row('Added', formatDate(dayKey(b.addedAt))),
      row('From', { goodreads: 'Goodreads import', openlibrary: 'Open Library', google: 'Google Books', manual: 'Added by hand', backup: 'Backup' }[b.source])),
    h('div', { class: 'card-actions' },
      h('button', { type: 'button', class: 'btn small edit-details', onclick: () => editDetails(actions, b) }, 'Edit details'),
      h('button', { type: 'button', class: 'btn small refresh', disabled: !state.online, title: state.online ? null : 'Needs the internet', onclick: () => actions.refreshDetails(b.id) }, 'Fill in from the web'),
      h('button', { type: 'button', class: 'btn small danger delete-book', onclick: () => actions.deleteBook(b.id) }, 'Delete')));
}

export function bookView(ctx) {
  const { state, actions } = ctx;
  const b = state.data.books.find((x) => x.id === state.route.id);
  if (!b || b.deleted) return missing(actions, b?.deleted ? b : null);
  return h('article', { class: 'book-detail' },
    h('div', { class: 'detail-top' },
      h('button', { type: 'button', class: 'icon-btn back', 'aria-label': 'Back', html: ICONS.back, onclick: () => actions.back() })),
    h('header', { class: 'hero' },
      coverEl(b, { size: 'L', cls: 'big' }),
      h('div', { class: 'hero-text' },
        h('h1', {}, displayTitle(b)),
        b.subtitle ? h('p', { class: 'subtitle' }, b.subtitle) : null,
        h('p', { class: 'authors' }, b.authors.join(', ')),
        b.needsLookup ? h('p', { class: 'muted' }, state.online ? 'Looking up details…' : 'Details will fill in when you’re online.') : null,
        rating(actions, b))),
    statusPicker(actions, b),
    dates(actions, b),
    progress(ctx, b),
    collectionsPicker(actions, b),
    notes(ctx, b),
    review(actions, b),
    catalogCard(ctx, b));
}
