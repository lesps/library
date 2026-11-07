// Reading by year: what was finished when, against an optional goal. A book counts in the year of
// its finish date, whatever its status now (a reread in progress still counted when it was finished).
// Goodreads exports only the latest finish date, so earlier reads of a reread book can't be placed.
import { isYmd } from './dates.js';

const DAY = 86_400_000;

export const daysInYear = (y) => ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365);

export function dayOfYear(ts) {
  const d = new Date(ts);
  return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 1)) / DAY) + 1;
}

const dated = (books) => books.filter((b) => !b.deleted && isYmd(b.finished));

export function yearStats(books, year) {
  const list = dated(books).filter((b) => b.finished.startsWith(`${year}-`))
    .sort((a, b) => b.finished.localeCompare(a.finished) || a.title.localeCompare(b.title));
  const paged = list.filter((b) => b.pages);
  const rated = list.filter((b) => b.rating > 0);
  const byMonth = Array.from({ length: 12 }, (_, month) => ({ month, count: 0, pages: 0 }));
  for (const b of list) {
    const m = byMonth[Number(b.finished.slice(5, 7)) - 1];
    m.count += 1;
    m.pages += b.pages ?? 0;
  }
  const pages = paged.reduce((n, b) => n + b.pages, 0);
  const bySize = [...paged].sort((a, b) => b.pages - a.pages);
  return {
    year,
    books: list,
    count: list.length,
    pages,
    unknownPages: list.length - paged.length,
    avgPages: paged.length ? Math.round(pages / paged.length) : null,
    avgRating: rated.length ? Math.round((rated.reduce((n, b) => n + b.rating, 0) / rated.length) * 10) / 10 : null,
    longest: bySize[0] ?? null,
    shortest: bySize.at(-1) ?? null,
    byMonth,
  };
}

// Every year from the first dated read to the latest (or `current`), gaps included, oldest first.
export function yearsSummary(books, current) {
  const byYear = new Map();
  for (const b of dated(books)) {
    const y = Number(b.finished.slice(0, 4));
    const e = byYear.get(y) ?? { count: 0, pages: 0 };
    e.count += 1;
    e.pages += b.pages ?? 0;
    byYear.set(y, e);
  }
  const years = [...byYear.keys(), current];
  const out = [];
  for (let y = Math.min(...years); y <= Math.max(...years); y++) out.push({ year: y, count: 0, pages: 0, ...byYear.get(y) });
  return out;
}

export const undatedReads = (books) => books.filter((b) => !b.deleted && b.status === 'read' && !isYmd(b.finished));

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
