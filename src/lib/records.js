// Notes, progress updates and collections: small records merged whole, newest `updatedAt` wins.
// Deletion is a `deleted: true` marker, never removal, so an older backup can't bring a record back.
import { MAX_TEXT, newId } from './book.js';

const ts = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
const id = (v) => typeof v === 'string' && v.length > 0 && v.length <= 100;
const num = (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v);
const page = (v) => {
  const n = num(v);
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100_000 ? Math.round(n) : null;
};
const percent = (v) => {
  const n = num(v);
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : null;
};
const withDeleted = (out, raw) => (raw.deleted === true ? { ...out, deleted: true } : out);

export function sanitizeNote(raw) {
  if (!raw || !id(raw.id) || !id(raw.bookId) || typeof raw.text !== 'string') return null;
  const text = raw.text.replace(/\r\n?/g, '\n').trim().slice(0, MAX_TEXT);
  if (!text) return null;
  const out = { id: raw.id, bookId: raw.bookId, text, page: page(raw.page), at: ts(raw.at), updatedAt: ts(raw.updatedAt) };
  if (id(raw.readId)) out.readId = raw.readId; // a note about one read of the book (reads.js)
  return withDeleted(out, raw);
}

export function sanitizeProgress(raw) {
  if (!raw || !id(raw.id) || !id(raw.bookId)) return null;
  const p = page(raw.page);
  const pc = p == null ? percent(raw.percent) : null;
  if (p == null && pc == null) return null;
  return withDeleted({ id: raw.id, bookId: raw.bookId, page: p, percent: pc, at: ts(raw.at), updatedAt: ts(raw.updatedAt) }, raw);
}

export function sanitizeCollection(raw) {
  if (!raw || !id(raw.id) || typeof raw.name !== 'string') return null;
  const name = raw.name.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!name) return null;
  const rank = typeof raw.rank === 'string' && /^[0-9a-z]{0,80}$/.test(raw.rank) ? raw.rank : '';
  return withDeleted({ id: raw.id, name, rank, updatedAt: ts(raw.updatedAt) }, raw);
}

export const createNote = (fields, { now, id: nid = newId() }) => sanitizeNote({ ...fields, id: nid, at: now, updatedAt: now });
export const createProgress = (fields, { now, id: pid = newId() }) => sanitizeProgress({ ...fields, id: pid, at: now, updatedAt: now });
export const createCollection = (fields, { now, id: cid = newId() }) => sanitizeCollection({ ...fields, id: cid, updatedAt: now });

// Patch a record through its sanitizer; unchanged → the same object.
export function touch(record, patch, now, sanitize) {
  const next = sanitize({ ...record, ...patch, updatedAt: now });
  if (!next) return record;
  const changed = Object.keys(next).some((k) => k !== 'updatedAt' && next[k] !== record[k]) || Boolean(next.deleted) !== Boolean(record.deleted);
  return changed ? next : record;
}

export const liveRecords = (rs) => rs.filter((r) => !r.deleted);

export function currentProgress(list) {
  let best = null;
  for (const p of list) if (!p.deleted && (!best || p.at >= best.at)) best = p; // a tie: the later one in the list
  return best;
}

export function progressPercent(p, pages) {
  if (!p) return null;
  if (p.page != null) return pages ? Math.min(100, Math.round((p.page / pages) * 100)) : null;
  return p.percent;
}

export const findCollection = (collections, name) => {
  const key = String(name ?? '').trim().toLowerCase();
  return collections.find((c) => !c.deleted && c.name.toLowerCase() === key);
};
