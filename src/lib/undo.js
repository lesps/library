// Undo for one action: remember each touched record as it was, then write those values back as
// new edits (stamped now, so the undo merges like any edit). Records the action created get deleted.
import { BOOK_FIELDS, updateBook } from './book.js';
import { KINDS } from './merge.js';

export function captureBefore(data, edits) {
  const before = {};
  for (const k of ['books', ...KINDS]) {
    if (!edits[k]?.length) continue;
    const byId = new Map(data[k].map((r) => [r.id, r]));
    before[k] = edits[k].map((r) => [r.id, byId.get(r.id) ?? null]);
  }
  return before;
}

export function undoEdits(before, data, now) {
  const edits = {};
  for (const [k, pairs] of Object.entries(before)) {
    const byId = new Map(data[k].map((r) => [r.id, r]));
    edits[k] = pairs.map(([id, old]) => {
      const cur = byId.get(id);
      if (k === 'books') {
        const patch = old ? Object.fromEntries(Object.keys(BOOK_FIELDS).map((f) => [f, old[f]])) : { deleted: true };
        return updateBook(cur, patch, now);
      }
      return old ? { ...old, updatedAt: now } : { ...cur, deleted: true, updatedAt: now };
    }).filter((r, i) => r !== byId.get(pairs[i][0]) || k !== 'books');
  }
  return edits;
}
