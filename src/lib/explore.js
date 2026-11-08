// Explore: the shape of what's been read. When the books were written (by century, then decade),
// what they're about (their Open Library subjects) and who wrote them. Pure; the view draws it.
import { normalize } from './book.js';
import { readCounts } from './reads.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

// 'read': books with status Read or at least one finished read; 'all': the whole library.
export function scopeBooks(books, reads, scope = 'read') {
  const live = books.filter((b) => !b.deleted);
  if (scope === 'all') return live;
  const counts = readCounts(reads);
  return live.filter((b) => b.status === 'read' || counts.get(b.id)?.count > 0);
}

export const writtenYear = (b) => (Number.isFinite(b.originalYear) ? b.originalYear : Number.isFinite(b.year) ? b.year : null);

export const centuryKey = (y) => (y < 500 ? 'ancient' : y < 1500 ? 'medieval' : String(Math.floor(y / 100) * 100));
const CENTURY_NAMES = { ancient: ['Anc.', 'Before 500'], medieval: ['Med.', '500 to 1499'] };
const centuryName = (key) => CENTURY_NAMES[key] ?? [ordinal(Number(key) / 100 + 1), `${ordinal(Number(key) / 100 + 1)} century`];

// Columns from the earliest century with a book to this one, empty ones included, so gaps show.
export function byCentury(books, currentYear) {
  const counts = new Map();
  for (const b of books) {
    const y = writtenYear(b);
    if (y != null) counts.set(centuryKey(y), (counts.get(centuryKey(y)) ?? 0) + 1);
  }
  const keys = ['ancient', 'medieval'];
  for (let c = 1500; c <= currentYear; c += 100) keys.push(String(c));
  const first = keys.findIndex((k) => counts.has(k));
  if (first < 0) return [];
  return keys.slice(first).map((key) => {
    const value = counts.get(key) ?? 0;
    const [axis, name] = centuryName(key);
    return { key, axis, value, label: `${name}: ${plural(value, 'book')}`, tip: `${name}: ${plural(value, 'book')}` };
  });
}

// A century's decades (from 1500 on), up to this one.
export function byDecade(books, century, currentYear) {
  const start = Number(century);
  const out = [];
  for (let d = start; d < start + 100 && d <= currentYear; d += 10) {
    const value = books.filter((b) => {
      const y = writtenYear(b);
      return y != null && y >= d && y < d + 10;
    }).length;
    out.push({ key: d, axis: `${String(d).slice(2)}s`, value, label: `${d}s: ${plural(value, 'book')}`, tip: `${d}s: ${plural(value, 'book')}` });
  }
  return out;
}

export function booksWritten(books, { century = null, decade = null }) {
  if (century == null) return [];
  return books.filter((b) => {
    const y = writtenYear(b);
    if (y == null || centuryKey(y) !== century) return false;
    return decade == null || (y >= decade && y < decade + 10);
  }).sort((a, b) => writtenYear(a) - writtenYear(b) || a.title.localeCompare(b.title));
}

// Ranked: [{ key, name, value, label, books }], most first, at least two books each.
function rank(groups, limit) {
  return [...groups].filter(([, g]) => g.books.length >= 2)
    .map(([key, g]) => ({ key, name: g.name, value: g.books.length, label: `${g.name}: ${plural(g.books.length, 'book')}`, books: g.books }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, limit);
}

// Subjects, leaving out dates ("19th century") since the timeline covers when.
export function themes(books, limit = 12) {
  const groups = new Map();
  for (const b of books) {
    for (const s of b.subjects ?? []) {
      if (/century|\d{4}/.test(s)) continue;
      if (!groups.has(s)) groups.set(s, { name: s, books: [] });
      groups.get(s).books.push(b);
    }
  }
  return rank(groups, limit);
}

// Main authors only (Goodreads lists translators as additional authors).
export function topAuthors(books, limit = 10) {
  const groups = new Map();
  for (const b of books) {
    const name = b.authors?.[0];
    const key = normalize(name ?? '');
    if (!key || /^(anonymous|unknown|various)/.test(key)) continue;
    if (!groups.has(key)) groups.set(key, { name, books: [] });
    groups.get(key).books.push(b);
  }
  return rank(groups, limit).map((a) => ({ ...a, key: a.name }));
}
