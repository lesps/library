// Reading by year: what was finished when, against an optional goal. What counts is a read with a
// finish date (reads.js): a book read in 2021 and again in 2026 counts in both years. Reads of an
// unknown date (earlier reads Goodreads counted but didn't date) count in no year.
import { isYmd } from './dates.js';
import { isReread } from './reads.js';

const DAY = 86_400_000;

export const daysInYear = (y) => ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365);

export function dayOfYear(ts) {
  const d = new Date(ts);
  return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 1)) / DAY) + 1;
}

// Each dated, finished read of a live book: { read, book }.
function dated(books, reads) {
  const live = new Map(books.filter((b) => !b.deleted).map((b) => [b.id, b]));
  return reads.filter((r) => !r.deleted && r.done && isYmd(r.finished) && live.has(r.bookId)).map((read) => ({ read, book: live.get(read.bookId) }));
}

export function yearStats(books, reads, year) {
  const byBook = new Map();
  for (const r of reads) if (!r.deleted) byBook.set(r.bookId, [...(byBook.get(r.bookId) ?? []), r]);
  const entries = dated(books, reads).filter((e) => e.read.finished.startsWith(`${year}-`))
    .sort((a, b) => b.read.finished.localeCompare(a.read.finished) || a.book.title.localeCompare(b.book.title))
    .map((e) => ({ ...e, reread: isReread(e.read, byBook.get(e.book.id) ?? []) }));
  const paged = entries.filter((e) => e.book.pages);
  const rated = entries.filter((e) => e.book.rating > 0);
  const byMonth = Array.from({ length: 12 }, (_, month) => ({ month, count: 0, pages: 0 }));
  for (const e of entries) {
    const m = byMonth[Number(e.read.finished.slice(5, 7)) - 1];
    m.count += 1;
    m.pages += e.book.pages ?? 0;
  }
  const pages = paged.reduce((n, e) => n + e.book.pages, 0);
  const bySize = [...paged].sort((a, b) => b.book.pages - a.book.pages);
  return {
    year,
    entries,
    count: entries.length,
    rereads: entries.filter((e) => e.reread).length,
    pages,
    unknownPages: entries.length - paged.length,
    avgPages: paged.length ? Math.round(pages / paged.length) : null,
    avgRating: rated.length ? Math.round((rated.reduce((n, e) => n + e.book.rating, 0) / rated.length) * 10) / 10 : null,
    longest: bySize[0]?.book ?? null,
    shortest: bySize.at(-1)?.book ?? null,
    byMonth,
  };
}

// Every year from the first dated read to the latest (or `current`), gaps included, oldest first.
export function yearsSummary(books, reads, current) {
  const byYear = new Map();
  for (const { read, book } of dated(books, reads)) {
    const y = Number(read.finished.slice(0, 4));
    const e = byYear.get(y) ?? { count: 0, pages: 0 };
    e.count += 1;
    e.pages += book.pages ?? 0;
    byYear.set(y, e);
  }
  const years = [...byYear.keys(), current];
  const out = [];
  for (let y = Math.min(...years); y <= Math.max(...years); y++) out.push({ year: y, count: 0, pages: 0, ...byYear.get(y) });
  return out;
}

// Books that can't be placed in a year: a finished read with no date, or marked read with no reads.
export function undatedReads(books, reads) {
  const undated = new Set();
  const any = new Set();
  for (const r of reads) {
    if (r.deleted || !r.done) continue;
    any.add(r.bookId);
    if (!r.finished) undated.add(r.bookId);
  }
  return books.filter((b) => !b.deleted && (undated.has(b.id) || (b.status === 'read' && !any.has(b.id))));
}

// Where `done` stands against `goal` for `year`, judged against an even pace through the year.
// status: done | missed (a past year) | upcoming (a future year) | ahead | behind | on; `by` is how
// far ahead or behind, in the goal's unit; perDay is the rate needed to finish on time.
export function pace({ goal, done, year, now }) {
  if (!goal) return null;
  const current = new Date(now).getFullYear();
  const total = daysInYear(year);
  const elapsed = year < current ? total : year > current ? 0 : dayOfYear(now);
  const daysLeft = total - elapsed + (year === current ? 1 : 0); // today still counts
  const toGo = Math.max(0, goal - done);
  if (done >= goal) return { status: 'done', by: done - goal, toGo: 0, daysLeft, perDay: 0 };
  if (year < current) return { status: 'missed', by: toGo, toGo, daysLeft: 0, perDay: 0 };
  const perDay = Math.round((toGo / daysLeft) * 10) / 10;
  if (year > current) return { status: 'upcoming', by: 0, toGo, daysLeft, perDay };
  const by = Math.round(done - (goal * elapsed) / total);
  return { status: by > 0 ? 'ahead' : by < 0 ? 'behind' : 'on', by: Math.abs(by), toGo, daysLeft, perDay };
}
