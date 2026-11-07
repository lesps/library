import { describe, it, expect } from 'vitest';
import { createBook, updateBook } from '../../src/lib/book.js';
import { createNote } from '../../src/lib/records.js';
import { emptyData, mergeData } from '../../src/lib/merge.js';
import { snapshotsToKeep, snapshotDue, dataVersion, restoreEdits, applyEdits } from '../../src/lib/snapshots.js';

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 7, 12).getTime();
const snap = (daysAgo, reason = 'daily', hour = 12) => {
  const d = new Date(NOW - daysAgo * DAY);
  d.setHours(hour);
  return { id: `${daysAgo}-${reason}-${hour}`, at: d.getTime(), reason };
};

describe('snapshotsToKeep', () => {
  it('keeps the newest of each of the last 7 days', () => {
    const list = [snap(0), snap(0, 'daily', 9), snap(3), snap(6), snap(6, 'daily', 8)];
    const keep = snapshotsToKeep(list, NOW);
    expect([...keep].sort()).toEqual(['0-daily-12', '3-daily-12', '6-daily-12'].sort());
  });

  it('keeps one per week for about a month, then lets go', () => {
    const list = [snap(9), snap(10), snap(16), snap(23), snap(30), snap(45), snap(90)];
    const keep = snapshotsToKeep(list, NOW);
    expect(keep.has('9-daily-12')).toBe(true); // newest of its week
    expect(keep.has('10-daily-12')).toBe(false); // same week, older
    expect(keep.has('16-daily-12')).toBe(true);
    expect(keep.has('23-daily-12')).toBe(true);
    expect(keep.has('45-daily-12')).toBe(false);
    expect(keep.has('90-daily-12')).toBe(false);
  });

  it('keeps the five most recent safety snapshots (before imports and the like) for 30 days', () => {
    const events = [1, 2, 3, 4, 5, 6].map((d) => snap(d, 'import', 15));
    const keep = snapshotsToKeep([...events, snap(40, 'restore')], NOW);
    for (const d of [1, 2, 3, 4, 5]) expect(keep.has(`${d}-import-15`)).toBe(true);
    expect(keep.has('40-restore-12')).toBe(false);
  });
});

describe('snapshotDue', () => {
  it('is due once a day, and only when the library changed since the last one', () => {
    expect(snapshotDue([], 0, NOW)).toBe(false);
    expect(snapshotDue([], 5, NOW)).toBe(true);
    const yesterday = { ...snap(1), version: 5 };
    expect(snapshotDue([yesterday], 5, NOW)).toBe(false);
    expect(snapshotDue([yesterday], 6, NOW)).toBe(true);
    expect(snapshotDue([{ ...snap(0, 'daily', 8), version: 5 }], 6, NOW)).toBe(false);
  });
});

describe('dataVersion', () => {
  it('is the latest change anywhere in the library', () => {
    const d = { ...emptyData(), books: [createBook({ title: 'A' }, { now: 10, id: 'a' })], notes: [createNote({ bookId: 'a', text: 'x' }, { now: 20, id: 'n' })] };
    expect(dataVersion(d)).toBe(20);
    expect(dataVersion(emptyData())).toBe(0);
  });
});

describe('restoreEdits', () => {
  const T = NOW - DAY;
  const dune = createBook({ title: 'Dune', status: 'want' }, { now: T, id: 'b1' });
  const before = { ...emptyData(), books: [dune], notes: [createNote({ bookId: 'b1', text: 'kept' }, { now: T, id: 'n1' })] };
  // After the snapshot: a bad import added a book, Dune was edited, the note was deleted.
  const current = {
    ...before,
    books: [updateBook(dune, { status: 'read', rating: 1 }, T + 10), createBook({ title: 'Junk' }, { now: T + 10, id: 'b2' })],
    notes: [{ ...before.notes[0], deleted: true, updatedAt: T + 10 }],
  };

  it('turns the snapshot into new edits: values back, later additions deleted', () => {
    const edits = restoreEdits(current, before, NOW);
    const restored = applyEdits(current, edits);
    const live = restored.books.filter((b) => !b.deleted);
    expect(live.map((b) => b.title)).toEqual(['Dune']);
    expect(live[0]).toMatchObject({ status: 'want', rating: 0 });
    expect(restored.notes[0].deleted).toBeUndefined();
    expect(edits.counts).toEqual({ changed: 1, removed: 1, records: 1 });
  });

  it('stamps every edit now, so the restore survives merging with an older copy', () => {
    const restored = applyEdits(current, restoreEdits(current, before, NOW));
    const { data } = mergeData(restored, current);
    expect(data.books.find((b) => b.id === 'b1').status).toBe('want');
    expect(data.books.find((b) => b.id === 'b2').deleted).toBe(true);
  });

  it('changes nothing when the library already matches', () => {
    const edits = restoreEdits(before, before, NOW);
    expect(edits.books).toEqual([]);
    expect(edits.notes).toEqual([]);
  });
});
