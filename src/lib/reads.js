// A read is one time through a book: { id, bookId, started, finished, done, at, updatedAt }.
// done with a finished date is a dated read; done without one is a read whose date isn't known
// (Goodreads exports only the latest Date Read, plus a Read Count); not done is the read in progress.
// Reads are records of their own so reads logged on two devices both survive a merge.
import { isYmd } from './dates.js';
import { newId, updateBook } from './book.js';

const ts = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
const okId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 140;
const day = (v) => (isYmd(v) ? v : '');

export function sanitizeRead(raw) {
  if (!raw || !okId(raw.id) || !okId(raw.bookId)) return null;
  const finished = day(raw.finished);
  const out = { id: raw.id, bookId: raw.bookId, started: day(raw.started), finished, done: !!finished || raw.done === true, at: ts(raw.at), updatedAt: ts(raw.updatedAt) };
  return raw.deleted === true ? { ...out, deleted: true } : out;
}

export const createRead = (fields, { now, id = newId() }) => sanitizeRead({ ...fields, id, at: now, updatedAt: now });

// Newest first: the read in progress, then dated reads by finish date, then undated ones.
const order = (a, b) => (a.done !== b.done ? (a.done ? 1 : -1) : (b.finished || '').localeCompare(a.finished || '') || b.at - a.at);

export const readsOf = (reads, bookId) => reads.filter((r) => r.bookId === bookId && !r.deleted).sort(order);
export const openRead = (reads, bookId) => reads.find((r) => r.bookId === bookId && !r.deleted && !r.done) ?? null;
export const completedReads = (reads, bookId) => readsOf(reads, bookId).filter((r) => r.done);

// bookId → { count: times read, last: latest finish date or '', open: a read in progress }
export function readCounts(reads) {
  const out = new Map();
  for (const r of reads) {
    if (r.deleted) continue;
    const e = out.get(r.bookId) ?? { count: 0, last: '', open: false };
    if (r.done) {
      e.count += 1;
      if (r.finished > e.last) e.last = r.finished;
    } else e.open = true;
    out.set(r.bookId, e);
  }
  return out;
}

// A finished read with an earlier one before it. Undated reads count as earlier than dated ones.
export function isReread(read, bookReads) {
  if (!read.done || !read.finished) return false;
  return bookReads.some((o) => o.id !== read.id && o.done && !o.deleted && (!o.finished || o.finished < read.finished));
}

// The status picker, Start a reread, Mark as read and bulk status all go through here.
// Returns the book with its new status and the read records that change.
export function statusChange(book, reads, status, today, now, { endRank = '' } = {}) {
  if (status === book.status) return { book, reads: [] };
  const open = openRead(reads, book.id);
  const changed = [];
  if (status === 'reading' && !open) changed.push(createRead({ bookId: book.id, started: today }, { now }));
  if (status === 'read') changed.push(open ? { ...open, finished: today, done: true, updatedAt: now } : createRead({ bookId: book.id, finished: today }, { now }));
  if ((status === 'want' || status === 'none') && open) changed.push({ ...open, deleted: true, updatedAt: now });
  const patch = { status };
  if (status === 'want' && endRank) patch.queueRank = endRank;
  return { book: updateBook(book, patch, now), reads: changed };
}

// What an import knows about a book (a read count, the latest finish date, whether it's being read)
// turned into the reads this book is missing. Ids are built from the book's id, so two devices
// working from the same data make the same records, and a record deleted here isn't re-created.
export function reconcileReads(bookId, reads, { count = 0, finished = '', reading = false, started = '' }, now, { at = now } = {}) {
  const all = new Set(reads.filter((r) => r.bookId === bookId).map((r) => r.id));
  const live = reads.filter((r) => r.bookId === bookId && !r.deleted);
  const done = live.filter((r) => r.done);
  const out = [];
  const make = (id, fields) => {
    all.add(id);
    out.push({ ...sanitizeRead({ ...fields, id, bookId }), at, updatedAt: now });
  };
  if (reading && !live.some((r) => !r.done)) {
    let id = `${bookId}~o`;
    for (let k = 2; all.has(id); k++) id = `${bookId}~o${k}`;
    make(id, { started, done: false });
  }
  let have = done.length;
  if (finished && !done.some((r) => r.finished === finished) && !all.has(`${bookId}~d${finished}`)) {
    make(`${bookId}~d${finished}`, { finished, started: reading ? '' : started });
    have += 1;
  }
  for (let k = 1; have < count; k++) {
    if (all.has(`${bookId}~u${k}`)) continue;
    make(`${bookId}~u${k}`, { done: true });
    have += 1;
  }
  return out;
}

// Books stored before reads existed (0.3 and earlier) kept one start date, one finish date and a
// read count on the book. Their reads, rebuilt deterministically (same ids and stamps everywhere).
export function legacyReads(raw) {
  if (!raw || typeof raw.id !== 'string') return [];
  const status = raw.status;
  const started = day(raw.started);
  const finished = day(raw.finished);
  const n = Number.isInteger(raw.readCount) && raw.readCount > 0 ? Math.min(raw.readCount, 1000) : 0;
  const count = status === 'read' ? Math.max(1, n) : n;
  const at = raw.fieldAt ?? {};
  const stamp = Math.max(ts(at.started), ts(at.finished), ts(at.readCount), ts(at.status), 0) || ts(raw.updatedAt);
  return reconcileReads(raw.id, [], { count, finished, reading: status === 'reading', started }, stamp, { at: 0 });
}

// A book's notes grouped by the read they're about, so reads can be compared: the read in progress,
// then newest first, then notes about the book as a whole (including notes whose read was deleted).
// Each group's notes are newest first; empty groups are left out.
export function groupNotes(notes, reads, bookId) {
  const mine = notes.filter((n) => n.bookId === bookId && !n.deleted).sort((a, b) => b.at - a.at);
  const order = readsOf(reads, bookId);
  const live = new Set(order.map((r) => r.id));
  const groups = order.map((read) => ({ read, notes: mine.filter((n) => n.readId === read.id) }));
  groups.push({ read: null, notes: mine.filter((n) => !n.readId || !live.has(n.readId)) });
  return groups.filter((g) => g.notes.length);
}
