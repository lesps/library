// Merging two copies of the library (a backup file into this device, or a snapshot restore).
// Books merge field by field on `fieldAt`; notes, progress, collections, reads and swipes merge whole on `updatedAt`.
// Ties keep the local copy, so merging the same data twice changes nothing.
import { BOOK_FIELDS } from './book.js';
import { DEFAULT_SETTINGS } from './settings.js';

export const KINDS = ['notes', 'progress', 'collections', 'reads', 'swipes'];
export const emptyData = () => ({ books: [], notes: [], progress: [], collections: [], reads: [], swipes: [], settings: { ...DEFAULT_SETTINGS } });

const same = (a, b) => (Array.isArray(a) ? Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]) : a === b);

export function mergeBook(local, incoming) {
  let next = null;
  for (const f of Object.keys(BOOK_FIELDS)) {
    const la = local.fieldAt?.[f] ?? 0;
    const ia = incoming.fieldAt?.[f] ?? 0;
    if (ia <= la) continue;
    next ??= { ...local, fieldAt: { ...local.fieldAt } };
    next.fieldAt[f] = ia;
    if (!same(local[f], incoming[f])) next[f] = incoming[f];
  }
  if (!next) return local;
  next.updatedAt = Math.max(local.updatedAt, incoming.updatedAt);
  if (!next.addedAt) next.addedAt = incoming.addedAt;
  return next;
}

const mergeWhole = (local, incoming) => {
  const byId = new Map(local.map((r) => [r.id, r]));
  let changed = 0;
  for (const r of incoming) {
    const mine = byId.get(r.id);
    if (!mine || r.updatedAt > mine.updatedAt) {
      byId.set(r.id, r);
      changed += 1;
    }
  }
  return { list: [...byId.values()], changed };
};

export function mergeData(local, incoming) {
  const report = { added: 0, updated: 0, removed: 0, unchanged: 0, records: 0 };
  const byId = new Map(local.books.map((b) => [b.id, b]));
  for (const b of incoming.books) {
    const mine = byId.get(b.id);
    if (!mine) {
      byId.set(b.id, b);
      if (!b.deleted) report.added += 1;
      continue;
    }
    const m = mergeBook(mine, b);
    byId.set(b.id, m);
    if (sameValues(m, mine)) report.unchanged += 1;
    else if (m.deleted && !mine.deleted) report.removed += 1;
    else report.updated += 1;
  }
  const data = { books: [...byId.values()] };
  for (const k of KINDS) {
    const { list, changed } = mergeWhole(local[k], incoming[k] ?? []);
    data[k] = list;
    report.records += changed;
  }
  data.settings = (incoming.settings?.updatedAt ?? 0) > local.settings.updatedAt ? incoming.settings : local.settings;
  return { data, report };
}

// Same values (at most the stamps moved): not a change anyone would see.
const sameValues = (a, b) => a === b || Object.keys(BOOK_FIELDS).every((f) => same(a[f], b[f]));
