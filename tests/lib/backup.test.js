import { describe, it, expect } from 'vitest';
import { createBook, updateBook } from '../../src/lib/book.js';
import { createNote, createProgress, createCollection } from '../../src/lib/records.js';
import { emptyData } from '../../src/lib/merge.js';
import { exportData, parseBackup, backupFilename, summarize, backupDue, FORMAT, VERSION } from '../../src/lib/backup.js';

const T = new Date(2026, 10, 7, 12).getTime();
const DAY = 86_400_000;
const data = {
  ...emptyData(),
  books: [createBook({ title: 'Dune', status: 'read' }, { now: T, id: 'b1' }), { ...createBook({ title: 'Gone' }, { now: T, id: 'b2' }), deleted: true }],
  notes: [createNote({ bookId: 'b1', text: 'Spice' }, { now: T, id: 'n1' })],
  progress: [createProgress({ bookId: 'b1', page: 12 }, { now: T, id: 'p1' })],
  collections: [createCollection({ name: 'Sci-fi', rank: 'i' }, { now: T, id: 'c1' })],
  settings: { cats: 'subtle', updatedAt: T },
};

describe('backup round trip', () => {
  it('exports everything, deleted markers included, and reads it back', () => {
    const file = exportData(data, T);
    expect(file).toMatchObject({ format: FORMAT, version: VERSION, exported: new Date(T).toISOString() });
    const parsed = parseBackup(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    expect(parsed.skipped).toBe(0);
    expect(parsed.data).toEqual(data);
  });

  it('names files by date', () => expect(backupFilename(T)).toBe('catalog-2026-11-07.json'));
});

describe('parseBackup', () => {
  const wrap = (over) => JSON.stringify({ ...exportData(data, T), ...over });

  it('explains what is wrong with a file it cannot read', () => {
    expect(parseBackup('{').error).toMatch(/JSON/);
    expect(parseBackup('{"format":"banana-log","version":1}').error).toMatch(/isn’t a Catalog backup/);
    expect(parseBackup(wrap({ version: 99 })).error).toMatch(/version 99/);
    expect(parseBackup(wrap({ books: 'x' })).error).toMatch(/no books/);
  });

  it('skips and counts records it cannot use', () => {
    const r = parseBackup(wrap({ books: [...data.books, { id: 'bad' }, 'x'], notes: [{ id: 'n', text: 'orphan' }] }));
    expect(r.ok).toBe(true);
    expect(r.skipped).toBe(3);
    expect(r.data.books).toHaveLength(2);
  });

  it('collapses repeated ids, keeping the newest values', () => {
    const newer = updateBook(data.books[0], { rating: 5 }, T + 1);
    const r = parseBackup(wrap({ books: [data.books[0], newer] }));
    expect(r.data.books).toHaveLength(1);
    expect(r.data.books[0].rating).toBe(5);
  });
});

describe('summarize', () => {
  it('counts live records only', () => {
    expect(summarize(data)).toEqual({ books: 1, read: 1, notes: 1, collections: 1 });
  });
});

describe('backupDue', () => {
  it('is due once there are books and changes, and never exported', () => {
    expect(backupDue({ lastExport: null, lastChange: T, bookCount: 3 }, T)).toBe(true);
    expect(backupDue({ lastExport: null, lastChange: T, bookCount: 0 }, T)).toBe(false);
  });

  it('is due a week after the last export if anything changed since', () => {
    expect(backupDue({ lastExport: T, lastChange: T + 1, bookCount: 3 }, T + 6 * DAY)).toBe(false);
    expect(backupDue({ lastExport: T, lastChange: T + 1, bookCount: 3 }, T + 7 * DAY)).toBe(true);
    expect(backupDue({ lastExport: T, lastChange: T - 1, bookCount: 3 }, T + 30 * DAY)).toBe(false);
  });
});
