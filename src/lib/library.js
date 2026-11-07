// Views over the in-memory library: filtering, search, sorting, the to-read queue.
import { titleSortKey, bookAuthorSort, normalize } from './book.js';
import { rankBetween } from './rank.js';
import { cleanIsbn } from './isbn.js';
import { readCounts } from './reads.js';
import { bySeriesNumber } from './series.js';

export { normalize };

const byStr = (key) => (a, b) => key(a).localeCompare(key(b));
const tie = (cmp) => (a, b) => cmp(a, b) || titleSortKey(a.title).localeCompare(titleSortKey(b.title));

export const SORTS = {
  added: { label: 'Recently added', cmp: (a, b) => b.addedAt - a.addedAt },
  title: { label: 'Title', cmp: tie(byStr((b) => titleSortKey(b.title))) },
  author: { label: 'Author', cmp: tie(byStr(bookAuthorSort)) },
  rating: { label: 'My rating', cmp: tie((a, b) => b.rating - a.rating) },
  series: { label: 'Series', cmp: (a, b) => (!a.seriesName - !b.seriesName)
    || titleSortKey(a.seriesName).localeCompare(titleSortKey(b.seriesName))
    || (a.seriesName ? bySeriesNumber(a, b) : titleSortKey(a.title).localeCompare(titleSortKey(b.title))) },
  finished: { label: 'Date read', cmp: (last) => tie((a, b) => (last.get(b.id)?.last || '').localeCompare(last.get(a.id)?.last || '')) },
  updated: { label: 'Recently changed', cmp: (a, b) => b.updatedAt - a.updatedAt },
};

function haystack(b, noteText) {
  return normalize([b.title, b.subtitle, ...b.authors, b.seriesName, b.isbn13, b.isbn10, b.publisher, noteText, b.review].join(' '));
}

// status: a status or 'all'; collection: an id, 'none' (in no collection) or 'all'; query: words.
export function queryBooks(books, { status = 'all', collection = 'all', query = '', sort = 'added', notes = [], reads = [] } = {}) {
  const words = normalize(query).split(' ').filter(Boolean).map((w) => (/^[\d-]+x?$/i.test(w) ? cleanIsbn(w).toLowerCase() || w : w));
  let noteText = null;
  if (words.length && notes.length) {
    noteText = new Map();
    for (const n of notes) if (!n.deleted) noteText.set(n.bookId, `${noteText.get(n.bookId) ?? ''} ${n.text}`);
  }
  const out = books.filter((b) => {
    if (b.deleted) return false;
    if (status !== 'all' && b.status !== status) return false;
    if (collection === 'none' ? b.collectionIds.length > 0 : collection !== 'all' && !b.collectionIds.includes(collection)) return false;
    if (!words.length) return true;
    const hay = haystack(b, noteText?.get(b.id) ?? '');
    return words.every((w) => hay.includes(w));
  });
  const by = sort === 'finished' ? SORTS.finished.cmp(readCounts(reads)) : (SORTS[sort] ?? SORTS.added).cmp;
  return out.sort(by);
}

export function statusCounts(books) {
  const c = { all: 0, want: 0, reading: 0, read: 0, none: 0 };
  for (const b of books) {
    if (b.deleted) continue;
    c.all += 1;
    c[b.status] += 1;
  }
  return c;
}

export function toReadQueue(books) {
  return books.filter((b) => !b.deleted && b.status === 'want').sort((a, b) => {
    if (a.queueRank && b.queueRank) return a.queueRank < b.queueRank ? -1 : a.queueRank > b.queueRank ? 1 : 0;
    if (a.queueRank || b.queueRank) return a.queueRank ? -1 : 1;
    return a.addedAt - b.addedAt;
  });
}

export function queueEndRank(books) {
  let last = '';
  for (const b of books) if (!b.deleted && b.status === 'want' && b.queueRank > last) last = b.queueRank;
  return rankBetween(last, '');
}

const titleAuthorKey = (b) => `${normalize(titleSortKey(b.title))}|${normalize(b.authors?.[0] ?? '')}`;

// An existing live book that's the same as `candidate`: same ISBN-13, or same title and first author.
export function findDuplicate(books, candidate) {
  const live = books.filter((b) => !b.deleted);
  if (candidate.isbn13) {
    const hit = live.find((b) => b.isbn13 === candidate.isbn13);
    if (hit) return hit;
  }
  if (!candidate.title) return undefined;
  const key = titleAuthorKey({ authors: [], ...candidate });
  return live.find((b) => titleAuthorKey(b) === key);
}
