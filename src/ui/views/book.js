import { h, formDialog, textDialog, plural } from '../dom.js';
import { ICONS, PAW } from '../icons.js';
import { coverEl, displayTitle } from '../cover.js';
import { mascot } from '../cat-layer.js';
import { STATUS_LABELS } from '../../lib/book.js';
import { currentProgress, progressPercent } from '../../lib/records.js';
import { formatDate, dayKey } from '../../lib/dates.js';
import { readsOf, openRead, groupNotes } from '../../lib/reads.js';
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

// Progress belongs to the read in progress: a reread starts again from zero.
export function progressFor(data, bookId) {
  const open = openRead(data.reads, bookId);
  return data.progress.filter((p) => p.bookId === bookId && (!open || p.at >= open.at));
}

function progress(ctx, b) {
  const { state, actions } = ctx;
  const cur = currentProgress(progressFor(state.data, b.id));
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

// "Mar 2 – Mar 20", "Finished Jul 4, 2021", "Reading now, started Nov 1", "Date unknown"
export function readDates(r, now) {
  const d = (x) => formatDate(x, now);
  if (!r.done) return r.started ? `Reading now, started ${d(r.started)}` : 'Reading now';
  if (r.started && r.finished) return `${d(r.started)} – ${d(r.finished)}`;
  if (r.finished) return `Finished ${d(r.finished)}`;
  if (r.started) return `Started ${d(r.started)}, finish date unknown`;
  return 'Date unknown';
}

function readDialog(actions, { title, read, bookId }) {
  const open = read && !read.done;
  formDialog({
    title,
    fields: [
      { name: 'started', label: 'Started', type: 'date', value: read?.started ?? '' },
      open ? null : { name: 'finished', label: 'Finished', type: 'date', value: read?.finished ?? '', hint: 'Leave empty if you don’t know.' },
    ].filter(Boolean),
    onSubmit: (v) => (read ? actions.editRead(read.id, v) : actions.addRead(bookId, v)),
  });
}

function readsSection(ctx, b) {
  const { state, actions, now } = ctx;
  const mine = readsOf(state.data.reads, b.id);
  const times = mine.filter((r) => r.done).length;
  const open = mine.some((r) => !r.done);
  const noteCount = new Map();
  for (const n of state.data.notes) if (n.bookId === b.id && !n.deleted && n.readId) noteCount.set(n.readId, (noteCount.get(n.readId) ?? 0) + 1);
  return h('section', { class: 'reads card' },
    h('div', { class: 'card-head' }, h('h2', {}, 'Reads'),
      h('span', { class: 'reads-count muted' }, times === 0 ? 'Not read yet' : times === 1 ? 'Read once' : `Read ${times} times`)),
    mine.length ? h('ul', { class: 'read-list' }, mine.map((r) => h('li', { class: `read${r.done ? '' : ' open'}${r.done && !r.finished ? ' undated' : ''}` },
      h('span', { class: 'read-dot', 'aria-hidden': 'true' }),
      h('span', { class: 'read-dates' }, readDates(r, now())),
      noteCount.get(r.id) ? h('button', { type: 'button', class: 'link read-notes', onclick: () => document.getElementById(`notes-${r.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, plural(noteCount.get(r.id), 'note')) : null,
      h('button', { type: 'button', class: 'link edit-read', 'aria-label': `Edit dates: ${readDates(r, now())}`, onclick: () => readDialog(actions, { title: r.done ? 'Edit read' : 'Edit this read', read: r }) }, 'Edit'),
      r.done ? h('button', { type: 'button', class: 'link danger delete-read', 'aria-label': `Delete read: ${readDates(r, now())}`, onclick: () => actions.deleteRead(r.id) }, 'Delete') : null))) : null,
    h('div', { class: 'card-actions' },
      times > 0 && !open ? h('button', { type: 'button', class: 'btn small primary start-reread', onclick: () => actions.setStatus(b.id, 'reading') }, 'Start a reread') : null,
      h('button', { type: 'button', class: 'btn small add-read', onclick: () => readDialog(actions, { title: 'Add a past read', bookId: b.id }) }, 'Add a past read')));
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

// How a read is named where notes are concerned: "This read (started Nov 1)", "Read finished Jul 4, 2021".
export function readLabel(r, now) {
  if (!r.done) return r.started ? `This read (started ${formatDate(r.started, now)})` : 'This read';
  const d = readDates(r, now);
  if (d === 'Date unknown') return 'Read, date unknown';
  return /^(Finished|Started)/.test(d) ? `Read ${d[0].toLowerCase()}${d.slice(1)}` : `Read ${d}`;
}

const BOOK_GROUP = 'The book in general';

function noteItem(actions, n) {
  return h('article', { class: 'note' },
    h('div', { class: 'note-head' },
      h('span', { class: 'note-date' }, formatDate(dayKey(n.at)) || ''),
      n.page != null ? h('span', { class: 'note-page' }, `p. ${n.page}`) : null,
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'link edit-note', onclick: () => textDialog({ title: 'Edit note', value: n.text, onSubmit: (v) => actions.editNote(n.id, v) }) }, 'Edit'),
      h('button', { type: 'button', class: 'link danger delete-note', onclick: () => actions.deleteNote(n.id) }, 'Delete')),
    h('p', { class: 'note-text' }, n.text));
}

// Notes, grouped by the read they're about once the book has reads, so each pass can be compared.
function notes(ctx, b) {
  const { state, actions, now } = ctx;
  const reads = readsOf(state.data.reads, b.id);
  const groups = groupNotes(state.data.notes, state.data.reads, b.id);
  const open = reads.find((r) => !r.done);
  const text = h('textarea', { class: 'note-text', rows: 3, placeholder: open ? 'What are you noticing this time?' : 'A thought, a quote, where you left off…', 'aria-label': 'New note' });
  const page = h('input', { class: 'note-page', type: 'number', inputmode: 'numeric', min: 0, placeholder: 'Page', 'aria-label': 'Page (optional)' });
  const about = reads.length ? h('select', { class: 'note-about', 'aria-label': 'This note is about' },
    reads.map((r) => h('option', { value: r.id, selected: open?.id === r.id }, readLabel(r, now()))),
    h('option', { value: '', selected: !open }, BOOK_GROUP)) : null;
  const add = () => { if (actions.addNote(b.id, text.value, page.value, about?.value ?? '')) { text.value = ''; page.value = ''; } };
  return h('section', { class: 'notes card ruled' },
    h('h2', {}, 'Notes'),
    h('div', { class: 'note-form' }, text,
      about ? h('label', { class: 'note-about-label' }, 'About ', about) : null,
      h('div', { class: 'note-form-row' }, page,
        h('button', { type: 'button', class: 'btn small primary add-note', onclick: add }, 'Add note'))),
    reads.length
      ? groups.map((g) => h('div', { class: 'note-group', id: `notes-${g.read?.id ?? 'book'}` },
        h('h3', {}, g.read ? readLabel(g.read, now()) : BOOK_GROUP),
        g.notes.map((n) => noteItem(actions, n))))
      : groups.flatMap((g) => g.notes).map((n) => noteItem(actions, n)));
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
    progress(ctx, b),
    readsSection(ctx, b),
    collectionsPicker(actions, b),
    notes(ctx, b),
    review(actions, b),
    catalogCard(ctx, b));
}
