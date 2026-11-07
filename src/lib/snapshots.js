// Local safety copies of the whole library, kept on the device: a daily one (when something
// changed) plus one before anything big (an import, a bulk delete, a restore, a backup merge).
import { BOOK_FIELDS, updateBook } from './book.js';
import { KINDS } from './merge.js';
import { dayKey, weekKey } from './dates.js';

const DAY = 86_400_000;
const EVENT_KEEP = 5;

// The ids worth keeping: newest per day for 7 days, newest per week for ~5 weeks, and the five
// newest event snapshots from the last 30 days.
export function snapshotsToKeep(list, now) {
  const keep = new Set();
  const newest = (key, since) => {
    const best = new Map();
    for (const s of list) {
      const k = key(s.at);
      if (k < since) continue;
      if (!best.has(k) || s.at > best.get(k).at) best.set(k, s);
    }
    for (const s of best.values()) keep.add(s.id);
  };
  newest(dayKey, dayKey(now - 6 * DAY));
  newest(weekKey, weekKey(now - 28 * DAY));
  list.filter((s) => s.reason !== 'daily' && now - s.at <= 30 * DAY)
    .sort((a, b) => b.at - a.at)
    .slice(0, EVENT_KEEP)
    .forEach((s) => keep.add(s.id));
  return keep;
}

export function dataVersion(data) {
  let v = data.settings?.updatedAt ?? 0;
  for (const k of ['books', ...KINDS]) for (const r of data[k]) if (r.updatedAt > v) v = r.updatedAt;
  return v;
}

export function snapshotDue(list, version, now) {
  if (!list.length) return version > 0;
  const latest = list.reduce((a, b) => (b.at > a.at ? b : a));
  return dayKey(latest.at) !== dayKey(now) && version > (latest.version ?? 0);
}

const differs = (a, b) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.delete('updatedAt');
  return [...keys].some((k) => a[k] !== b[k]);
};

// Restoring = editing the library back to the snapshot's values, stamped `now`. Restores are
// ordinary edits, so they merge like any other and an older copy can't undo them.
export function restoreEdits(current, snapshot, now) {
  const counts = { changed: 0, removed: 0, records: 0 };
  const edits = { books: [], settings: null, counts };
  const snapBooks = new Map(snapshot.books.map((b) => [b.id, b]));
  for (const b of current.books) {
    if (snapBooks.has(b.id) || b.deleted) continue;
    edits.books.push(updateBook(b, { deleted: true }, now));
    counts.removed += 1;
  }
  const curBooks = new Map(current.books.map((b) => [b.id, b]));
  for (const s of snapshot.books) {
    const cur = curBooks.get(s.id);
    if (!cur) {
      edits.books.push({ ...s, fieldAt: Object.fromEntries(Object.keys(BOOK_FIELDS).map((f) => [f, now])), updatedAt: now });
      counts.changed += 1;
      continue;
    }
    const patch = Object.fromEntries(Object.keys(BOOK_FIELDS).map((f) => [f, s[f]]));
    const next = updateBook(cur, patch, now);
    if (next !== cur) {
      edits.books.push(next);
      counts.changed += 1;
    }
  }
  for (const k of KINDS) {
    edits[k] = [];
    const snapIds = new Set(snapshot[k].map((r) => r.id));
    const cur = new Map(current[k].map((r) => [r.id, r]));
    for (const r of current[k]) if (!snapIds.has(r.id) && !r.deleted) edits[k].push({ ...r, deleted: true, updatedAt: now });
    for (const s of snapshot[k]) {
      const c = cur.get(s.id);
      if (!c || differs(c, s)) edits[k].push({ ...s, updatedAt: now });
    }
    counts.records += edits[k].length;
  }
  if (snapshot.settings && differs(snapshot.settings, current.settings)) edits.settings = { ...snapshot.settings, updatedAt: now };
  return edits;
}

// The library with a set of changed records written over it (by id).
export function applyEdits(data, edits) {
  const out = { ...data };
  for (const k of ['books', ...KINDS]) {
    if (!edits[k]?.length) continue;
    const byId = new Map(data[k].map((r) => [r.id, r]));
    for (const r of edits[k]) byId.set(r.id, r);
    out[k] = [...byId.values()];
  }
  if (edits.settings) out.settings = edits.settings;
  return out;
}
