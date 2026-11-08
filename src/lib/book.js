// A book is one record with a timestamp per field (`fieldAt`), so merging two copies keeps the newer
// value of each field instead of the newer whole record. All operations return new objects.
// When it was read lives in its reads (reads.js); status changes go through statusChange there.
// Books saved before 0.4 also carry started, finished and readCount, which legacyReads converts.
import { isIsbn10, isIsbn13, toIsbn13, cleanIsbn } from './isbn.js';

export const STATUSES = ['want', 'reading', 'read', 'none'];
export const STATUS_LABELS = { want: 'Want to read', reading: 'Reading', read: 'Read', none: 'No status' };
export const SOURCES = ['manual', 'goodreads', 'openlibrary', 'google', 'wikidata', 'backup'];
export const MAX_TITLE = 500;
export const MAX_TEXT = 20_000;

const text = (max) => (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\s+/g, ' ').trim().slice(0, max) : '');
const longText = (v) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim().slice(0, MAX_TEXT) : '');
const int = (min, max) => (v) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const i = Math.round(n);
  return i < min || i > max ? null : i;
};
const clampInt = (min, max) => (v) => {
  const i = int(-Infinity, Infinity)(v);
  return i == null ? min : Math.min(max, Math.max(min, i));
};
const list = (maxItems, maxLen) => (v) => {
  if (!Array.isArray(v)) return [];
  const seen = new Set();
  const out = [];
  for (const x of v) {
    const s = text(maxLen)(x);
    if (s && !seen.has(s)) { seen.add(s); out.push(s); }
    if (out.length >= maxItems) break;
  }
  return out;
};
const bool = (v) => v === true;
const rank = (v) => (typeof v === 'string' && /^[0-9a-z]{0,80}$/.test(v) && !v.endsWith('0') ? v : '');
const ts = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
const https = (v) => (typeof v === 'string' && /^https:\/\/[^\s"'<>]{1,500}$/.test(v) ? v : '');
const oneOf = (values, fallback) => (v) => (values.includes(v) ? v : fallback);

// Every editable field and its sanitizer. `deleted` is a field too, so a delete merges like any edit.
export const BOOK_FIELDS = {
  title: text(MAX_TITLE),
  subtitle: text(MAX_TITLE),
  authors: list(20, 200),
  authorSort: text(200), // "Surname, Given" from Goodreads; empty means derive from the first author
  isbn10: (v) => (isIsbn10(cleanIsbn(v)) ? cleanIsbn(v) : ''),
  isbn13: (v) => (isIsbn13(cleanIsbn(v)) ? cleanIsbn(v) : ''),
  publisher: text(200),
  year: int(-3000, 3000),
  originalYear: int(-3000, 3000),
  pages: int(1, 100_000),
  binding: text(60),
  coverId: int(1, 1e12),
  coverUrl: https,
  coverCheckedAt: ts,
  olWork: text(60),
  goodreadsId: text(30),
  seriesName: text(200),
  seriesNumber: text(20), // text, for "2.5" and "1-3"
  subjects: list(20, 60), // cleaned Open Library subjects (taste.js cleanSubjects), for Discover
  subjectsAt: ts, // when subjects were last looked up
  status: oneOf(STATUSES, 'none'),
  rating: clampInt(0, 5),
  review: longText,
  collectionIds: list(500, 100),
  queueRank: rank,
  owned: bool,
  needsLookup: bool, // saved by ISBN while offline; details fill in when back online
  deleted: bool,
};
const FIELD_NAMES = Object.keys(BOOK_FIELDS);

const same = (a, b) => (Array.isArray(a) ? Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]) : a === b);

function cleanFields(fields) {
  const out = {};
  for (const f of FIELD_NAMES) out[f] = BOOK_FIELDS[f](fields[f]);
  if (!out.isbn13 && out.isbn10) out.isbn13 = toIsbn13(out.isbn10);
  return out;
}

export const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export function createBook(fields, { now, id = newId() }) {
  const clean = cleanFields(fields);
  return {
    id,
    ...clean,
    source: oneOf(SOURCES, 'manual')(fields.source),
    addedAt: ts(fields.addedAt) || now,
    fieldAt: Object.fromEntries(FIELD_NAMES.map((f) => [f, now])),
    updatedAt: now,
  };
}

export function updateBook(book, patch, now) {
  let next = null;
  for (const [f, raw] of Object.entries(patch)) {
    if (!(f in BOOK_FIELDS)) continue;
    const v = BOOK_FIELDS[f](raw);
    if (f === 'title' && !v && !book.needsLookup) continue;
    if (same(v, book[f])) continue;
    next ??= { ...book, fieldAt: { ...book.fieldAt } };
    next[f] = v;
    next.fieldAt[f] = now;
  }
  if (!next) return book;
  next.updatedAt = now;
  return next;
}

// Validates a stored or imported record; missing stamps count as "never edited" (0).
export function sanitizeBook(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || !raw.id || raw.id.length > 100) return null;
  const clean = cleanFields(raw);
  if (!clean.title && !(clean.needsLookup && clean.isbn13)) return null;
  const at = raw.fieldAt && typeof raw.fieldAt === 'object' ? raw.fieldAt : {};
  const fieldAt = Object.fromEntries(FIELD_NAMES.map((f) => [f, ts(at[f])]));
  return {
    id: raw.id,
    ...clean,
    source: oneOf(SOURCES, 'manual')(raw.source),
    addedAt: ts(raw.addedAt),
    fieldAt,
    updatedAt: Math.max(ts(raw.updatedAt), ...Object.values(fieldAt)),
  };
}

export const live = (books) => books.filter((b) => !b.deleted);

const PARTICLES = new Set(['le', 'la', 'de', 'du', 'da', 'di', 'del', 'della', 'van', 'von', 'der', 'den', 'st.', 'saint', 'al', 'el', 'ibn', 'bin']);
const SUFFIXES = /,?\s+(jr\.?|sr\.?|ii|iii|iv)$/i;

// "Ursula K. Le Guin" → "Le Guin, Ursula K." (particles stay with the surname, suffixes drop).
export function authorLastFirst(name) {
  const words = String(name ?? '').replace(SUFFIXES, '').trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return words.join(' ');
  let i = words.length - 1;
  while (i > 1 && PARTICLES.has(words[i - 1].toLowerCase())) i--;
  return `${words.slice(i).join(' ')}, ${words.slice(0, i).join(' ')}`;
}

export const authorSortKey = (name) => authorLastFirst(name).toLowerCase();

// For comparing and searching: no accents, lower case, single spaces.
export const normalize = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export const titleSortKey = (title) => String(title ?? '').toLowerCase().replace(/^(the|a|an)\s+/, '').trim();

export const bookAuthorSort = (b) => (b.authorSort ? b.authorSort.toLowerCase() : authorSortKey(b.authors[0] ?? ''));
