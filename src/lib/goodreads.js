// Goodreads library export (CSV) in, and the same format out.
// Goodreads writes ISBNs as ="0451526538" (to stop spreadsheets eating leading zeros), dates as
// 2023/04/15, reviews as light HTML, and shelves as slugs ("did-not-finish").
import { csvObjects, toCsv } from './csv.js';
import { cleanIsbn } from './isbn.js';
import { parseLooseDate, ymd } from './dates.js';
import { createBook, updateBook, authorLastFirst } from './book.js';
import { reconcileReads, readCounts } from './reads.js';
import { createNote, createCollection, findCollection } from './records.js';
import { findDuplicate } from './library.js';
import { rankBetween, spreadRanks } from './rank.js';

export const HEADERS = ['Book Id', 'Title', 'Author', 'Author l-f', 'Additional Authors', 'ISBN', 'ISBN13', 'My Rating', 'Average Rating', 'Publisher', 'Binding', 'Number of Pages', 'Year Published', 'Original Publication Year', 'Date Read', 'Date Added', 'Bookshelves', 'Bookshelves with positions', 'Exclusive Shelf', 'My Review', 'Spoiler', 'Private Notes', 'Read Count', 'Owned Copies'];
const REQUIRED = ['Book Id', 'Title', 'Exclusive Shelf'];
const SHELF_STATUS = { read: 'read', 'currently-reading': 'reading', 'to-read': 'want' };
const STATUS_SHELF = { read: 'read', reading: 'currently-reading', want: 'to-read' };

export const NOT_GOODREADS = 'This doesn’t look like a Goodreads export. On goodreads.com, open My Books, choose Import and export, then Export Library, and pick the file it makes.';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export const reviewText = (html) => String(html ?? '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
  .replace(/<[^>]*>/g, '')
  .replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENTITIES[e.toLowerCase()] ?? m;
  })
  .trim();

const reviewHtml = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', '<br/>');

// "did-not-finish" → "Did not finish"; a short two-part slug keeps its hyphen ("sci-fi" → "Sci-fi").
export function shelfName(slug) {
  const parts = slug.replace(/_/g, ' ').split('-');
  const keep = parts.length === 2 && parts.some((p) => p.length <= 3) && parts.every((p) => /^[a-z]+$/i.test(p));
  const s = (keep ? parts.join('-') : parts.join(' ')).replace(/\s+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const shelfSlug = (name) => name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
const num = (v) => (String(v ?? '').trim() === '' ? null : Number(v));
const noonOf = (day) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getTime();
};
const slashDate = (day) => (day ? day.replaceAll('-', '/') : '');

export function parseGoodreads(text) {
  const { headers, rows } = csvObjects(text ?? '');
  if (!REQUIRED.every((h) => headers.includes(h))) return { ok: false, error: NOT_GOODREADS };
  let skipped = 0;
  const out = [];
  for (const r of rows) {
    const title = r.Title.trim();
    if (!title) { skipped += 1; continue; }
    const exclusive = r['Exclusive Shelf'].trim();
    const status = SHELF_STATUS[exclusive] ?? 'none';
    const shelves = r.Bookshelves.split(',').map((s) => s.trim()).filter((s) => s && !(s in SHELF_STATUS));
    if (exclusive && !(exclusive in SHELF_STATUS) && !shelves.includes(exclusive)) shelves.push(exclusive);
    const added = parseLooseDate(r['Date Added']);
    const readCount = num(r['Read Count']) ?? 0;
    const pos = r['Bookshelves with positions'].match(/(?:^|,\s*)to-read \(#(\d+)\)/);
    out.push({
      goodreadsId: r['Book Id'].trim(),
      fields: {
        title,
        authors: [r.Author, ...r['Additional Authors'].split(',')].map((a) => a.trim()).filter(Boolean),
        authorSort: r['Author l-f'],
        isbn10: cleanIsbn(r.ISBN),
        isbn13: cleanIsbn(r.ISBN13),
        rating: num(r['My Rating']) ?? 0,
        publisher: r.Publisher,
        binding: r.Binding,
        pages: num(r['Number of Pages']),
        year: num(r['Year Published']),
        originalYear: num(r['Original Publication Year']),
        status,
        owned: (num(r['Owned Copies']) ?? 0) > 0,
        review: reviewText(r['My Review']),
        addedAt: added ? noonOf(added) : 0,
      },
      // Goodreads keeps every read's dates on its site, but exports only a count and the latest Date Read.
      reads: { count: status === 'read' && readCount === 0 ? 1 : readCount, finished: parseLooseDate(r['Date Read']), reading: status === 'reading' },
      shelves,
      toReadPosition: pos ? Number(pos[1]) : null,
      privateNotes: (r['Private Notes'] ?? '').trim(),
    });
  }
  return { ok: true, rows: out, skipped };
}

const FILL_IF_EMPTY = ['isbn10', 'isbn13', 'pages', 'publisher', 'year', 'originalYear', 'binding', 'authorSort'];

// What importing `rows` into `data` would do, as edits ready to commit, plus counts for a preview.
// Matches by Goodreads id, then ISBN, then title and first author. updateExisting: false leaves
// books already in the library untouched.
export function planImport(rows, data, { now, updateExisting = true }) {
  const books = data.books.filter((b) => !b.deleted);
  const byGoodreads = new Map(books.filter((b) => b.goodreadsId).map((b) => [b.goodreadsId, b]));
  const collections = [...data.collections];
  const created = [];
  let lastCollectionRank = collections.reduce((m, c) => (!c.deleted && c.rank > m ? c.rank : m), '');
  const collectionId = (slug) => {
    const name = shelfName(slug);
    let c = findCollection(collections, name);
    if (!c) {
      lastCollectionRank = rankBetween(lastCollectionRank, '');
      c = createCollection({ name, rank: lastCollectionRank }, { now });
      collections.push(c);
      created.push(c);
    }
    return c.id;
  };

  const touched = new Map(); // id → book (added or updated)
  const added = new Set();
  const updated = new Set(); // books whose only change is new reads still count as updated
  const notes = [];
  const reads = [...data.reads];
  const newReads = [];
  const addReads = (bookId, row) => {
    const more = reconcileReads(bookId, reads, row.reads, now);
    reads.push(...more);
    newReads.push(...more);
    return more.length > 0;
  };
  const needRank = [];
  let unchanged = 0;
  const pool = [...books];
  const addNote = (bookId, row) => {
    const text = row.privateNotes;
    if (text && !hasNote(data.notes, bookId, text) && !hasNote(notes, bookId, text)) notes.push(createNote({ bookId, text }, { now }));
  };

  for (const row of rows) {
    const match = byGoodreads.get(row.goodreadsId) ?? findDuplicate(pool, row.fields);
    const current = match && (touched.get(match.id) ?? match);
    let book;
    if (!current) {
      book = createBook({ ...row.fields, goodreadsId: row.goodreadsId, source: 'goodreads', collectionIds: row.shelves.map(collectionId) }, { now });
      added.add(book.id);
      addReads(book.id, row);
      pool.push(book);
      if (book.status === 'want') needRank.push({ book, row });
    } else if (!updateExisting) {
      unchanged += 1;
      continue;
    } else {
      const f = row.fields;
      const patch = { status: f.status, owned: f.owned, goodreadsId: row.goodreadsId };
      if (f.rating > 0) patch.rating = f.rating;
      if (f.review) patch.review = f.review;
      for (const k of FILL_IF_EMPTY) if (!current[k] && f[k]) patch[k] = f[k];
      const ids = row.shelves.map(collectionId);
      if (ids.some((id) => !current.collectionIds.includes(id))) patch.collectionIds = [...current.collectionIds, ...ids.filter((id) => !current.collectionIds.includes(id))];
      book = updateBook(current, patch, now);
      const gotReads = addReads(current.id, row);
      if (book === current) {
        if (gotReads) updated.add(current.id);
        else unchanged += 1;
        addNote(current.id, row);
        continue;
      }
      if (book.status === 'want' && !book.queueRank) needRank.push({ book, row });
    }
    touched.set(book.id, book);
    addNote(book.id, row);
  }

  // New to-read books join the end of the queue in their Goodreads to-read order.
  needRank.sort((a, b) => (a.row.toReadPosition ?? Infinity) - (b.row.toReadPosition ?? Infinity) || a.book.addedAt - b.book.addedAt);
  const last = books.reduce((m, b) => (b.status === 'want' && b.queueRank > m ? b.queueRank : m), '');
  const ranks = spreadRanks(needRank.length, last, '');
  needRank.forEach(({ book }, i) => {
    const b = touched.get(book.id);
    touched.set(b.id, added.has(b.id) ? { ...b, queueRank: ranks[i] } : updateBook(b, { queueRank: ranks[i] }, now));
  });

  const edited = [...touched.values()];
  for (const b of edited) if (!added.has(b.id)) updated.add(b.id);
  return {
    edits: { books: edited, notes, progress: [], collections: created, reads: newReads },
    collections: created,
    counts: { add: added.size, update: updated.size, unchanged, collections: created.length, notes: notes.length },
  };
}

const hasNote = (notes, bookId, text) => notes.some((n) => !n.deleted && n.bookId === bookId && n.text === text);

export function goodreadsCsv(data) {
  const names = new Map(data.collections.filter((c) => !c.deleted).map((c) => [c.id, shelfSlug(c.name)]));
  const times = readCounts(data.reads ?? []);
  const notesBy = new Map();
  for (const n of [...data.notes].sort((a, b) => a.at - b.at)) {
    if (!n.deleted) notesBy.set(n.bookId, [...(notesBy.get(n.bookId) ?? []), n.text]);
  }
  const queue = data.books.filter((b) => !b.deleted && b.status === 'want').sort((a, b) => (a.queueRank || '~').localeCompare(b.queueRank || '~') || a.addedAt - b.addedAt);
  const position = new Map(queue.map((b, i) => [b.id, i + 1]));
  const rows = data.books.filter((b) => !b.deleted).map((b) => {
    const exclusive = STATUS_SHELF[b.status] ?? '';
    const custom = b.collectionIds.map((id) => names.get(id)).filter(Boolean);
    const shelves = [...(exclusive && exclusive !== 'read' ? [exclusive] : []), ...custom];
    const positions = shelves.map((s) => (s === 'to-read' ? `to-read (#${position.get(b.id)})` : s));
    return [
      b.goodreadsId, b.title, b.authors[0] ?? '', b.authorSort || authorLastFirst(b.authors[0] ?? ''), b.authors.slice(1).join(', '),
      `="${b.isbn10}"`, `="${b.isbn13}"`, b.rating, '', b.publisher, b.binding, b.pages ?? '', b.year ?? '', b.originalYear ?? '',
      slashDate(times.get(b.id)?.last ?? ''), slashDate(ymd(new Date(b.addedAt))), shelves.join(', '), positions.join(', '),
      exclusive, reviewHtml(b.review), '', (notesBy.get(b.id) ?? []).join('\n\n'), times.get(b.id)?.count ?? 0, b.owned ? 1 : 0,
    ];
  });
  return toCsv([HEADERS, ...rows]);
}
