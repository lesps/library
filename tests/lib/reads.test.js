import { describe, it, expect } from 'vitest';
import { createBook } from '../../src/lib/book.js';
import { createNote } from '../../src/lib/records.js';
import {
  groupNotes,
  sanitizeRead, createRead, readsOf, openRead, completedReads, readCounts, legacyReads, statusChange, reconcileReads, isReread,
} from '../../src/lib/reads.js';

const T = new Date(2026, 10, 7, 12).getTime();
const today = '2026-11-07';
const book = (f = {}) => createBook({ title: 'Dune', ...f }, { now: T, id: 'b1' });
const r = (f) => createRead({ bookId: 'b1', ...f }, { now: T, id: f.id ?? `r-${Math.random()}` });

describe('read records', () => {
  it('a finished date makes a read done; an open read has no finish', () => {
    expect(createRead({ bookId: 'b', finished: '2026-03-02' }, { now: T, id: 'x' })).toEqual({ id: 'x', bookId: 'b', started: '', finished: '2026-03-02', done: true, at: T, updatedAt: T });
    expect(createRead({ bookId: 'b', started: '2026-11-01' }, { now: T, id: 'x' })).toMatchObject({ done: false, finished: '' });
    expect(createRead({ bookId: 'b', done: true }, { now: T, id: 'x' })).toMatchObject({ done: true, finished: '' });
  });

  it('rejects reads without a book and drops bad dates', () => {
    expect(sanitizeRead({ id: 'x', finished: '2026-01-01' })).toBe(null);
    expect(sanitizeRead({ id: 'x', bookId: 'b', started: '2026-02-30', updatedAt: 1 })).toMatchObject({ started: '', done: false });
  });
});

describe('per-book views', () => {
  const reads = [
    r({ id: 'old', finished: '2021-07-04' }),
    r({ id: 'unknown', done: true }),
    r({ id: 'new', started: '2026-03-02', finished: '2026-03-20' }),
    r({ id: 'now', started: '2026-11-01' }),
    { ...r({ id: 'gone', finished: '2025-01-01' }), deleted: true },
    createRead({ bookId: 'other', finished: '2026-01-01' }, { now: T, id: 'o' }),
  ];

  it('lists a book’s live reads: the open one, then newest first, undated last', () => {
    expect(readsOf(reads, 'b1').map((x) => x.id)).toEqual(['now', 'new', 'old', 'unknown']);
    expect(openRead(reads, 'b1').id).toBe('now');
    expect(completedReads(reads, 'b1').map((x) => x.id)).toEqual(['new', 'old', 'unknown']);
  });

  it('summarizes every book at once: times read and the latest finish', () => {
    const c = readCounts(reads);
    expect(c.get('b1')).toEqual({ count: 3, last: '2026-03-20', open: true });
    expect(c.get('other')).toEqual({ count: 1, last: '2026-01-01', open: false });
  });

  it('knows a reread: any earlier read, dated or not', () => {
    const mine = readsOf(reads, 'b1');
    expect(isReread(reads.find((x) => x.id === 'new'), mine)).toBe(true);
    expect(isReread(reads.find((x) => x.id === 'old'), mine)).toBe(true); // an undated read is assumed earlier
    expect(isReread(reads.find((x) => x.id === 'old'), mine.filter((x) => x.id !== 'unknown'))).toBe(false);
  });
});

describe('legacyReads (books from before 0.4: started, finished, readCount on the book)', () => {
  const legacy = (f) => ({ ...book(), ...f, fieldAt: { ...book().fieldAt, finished: 5 } });

  it('turns a read count and a finish date into reads with ids every device agrees on', () => {
    const rs = legacyReads(legacy({ status: 'read', finished: '2025-03-01', started: '2025-02-01', readCount: 3 }));
    expect(rs.map((x) => [x.id, x.started, x.finished, x.done])).toEqual([
      ['b1~d2025-03-01', '2025-02-01', '2025-03-01', true],
      ['b1~u1', '', '', true],
      ['b1~u2', '', '', true],
    ]);
    expect(rs.every((x) => x.updatedAt === T)).toBe(true);
    expect(legacyReads(legacy({ status: 'read', finished: '2025-03-01', started: '2025-02-01', readCount: 3 }))).toEqual(rs);
  });

  it('a book being reread: the past read keeps its finish date, the start date belongs to the open read', () => {
    const rs = legacyReads(legacy({ status: 'reading', started: '2026-11-01', finished: '2025-03-01', readCount: 1 }));
    expect(rs.map((x) => [x.id, x.started, x.finished, x.done])).toEqual([
      ['b1~o', '2026-11-01', '', false],
      ['b1~d2025-03-01', '', '2025-03-01', true],
    ]);
  });

  it('a read book with no count or date was still read once', () => {
    expect(legacyReads(legacy({ status: 'read', readCount: 0 })).map((x) => x.id)).toEqual(['b1~u1']);
    expect(legacyReads(legacy({ status: 'want' }))).toEqual([]);
  });
});

describe('statusChange', () => {
  it('starting opens a read dated today', () => {
    const { book: b, reads } = statusChange(book({ status: 'want' }), [], 'reading', today, T);
    expect(b.status).toBe('reading');
    expect(reads).toEqual([expect.objectContaining({ bookId: 'b1', started: today, done: false })]);
  });

  it('finishing closes the open read; finishing with none adds a read finished today', () => {
    const open = r({ id: 'o', started: '2026-11-01' });
    const done = statusChange(book({ status: 'reading' }), [open], 'read', today, T);
    expect(done.reads).toEqual([expect.objectContaining({ id: 'o', started: '2026-11-01', finished: today, done: true })]);
    const quick = statusChange(book({ status: 'want' }), [], 'read', today, T);
    expect(quick.reads).toEqual([expect.objectContaining({ finished: today, done: true })]);
  });

  it('starting a read book again is a reread: a new open read, the old ones untouched', () => {
    const past = r({ id: 'p', finished: '2025-01-01' });
    const { reads } = statusChange(book({ status: 'read' }), [past], 'reading', today, T);
    expect(reads).toHaveLength(1);
    expect(reads[0]).toMatchObject({ started: today, done: false });
    expect(reads[0].id).not.toBe('p');
  });

  it('giving up on a book drops its unfinished read, keeps finished ones, and queues it when wanted', () => {
    const open = r({ id: 'o', started: '2026-11-01' });
    const { book: b, reads } = statusChange(book({ status: 'reading' }), [open, r({ id: 'p', finished: '2025-01-01' })], 'want', today, T, { endRank: 'k' });
    expect(b).toMatchObject({ status: 'want', queueRank: 'k' });
    expect(reads).toEqual([expect.objectContaining({ id: 'o', deleted: true })]);
  });

  it('changes nothing when the status is the same', () => {
    const b = book({ status: 'read' });
    expect(statusChange(b, [], 'read', today, T)).toEqual({ book: b, reads: [] });
  });
});

describe('reconcileReads (what an import knows: a read count, the latest finish date, reading now)', () => {
  it('adds the reads a book is missing, and nothing on a second pass', () => {
    const first = reconcileReads('b1', [], { count: 3, finished: '2025-03-01', reading: false }, T);
    expect(first.map((x) => x.id)).toEqual(['b1~d2025-03-01', 'b1~u1', 'b1~u2']);
    expect(reconcileReads('b1', first, { count: 3, finished: '2025-03-01', reading: false }, T)).toEqual([]);
  });

  it('counts reads already logged here, dated or not', () => {
    const mine = [r({ id: 'a', finished: '2024-05-01' }), r({ id: 'b', finished: '2025-03-01' })];
    expect(reconcileReads('b1', mine, { count: 3, finished: '2025-03-01', reading: false }, T).map((x) => x.id)).toEqual(['b1~u1']);
  });

  it('opens a read for a book being read, unless one is open', () => {
    expect(reconcileReads('b1', [], { count: 0, finished: '', reading: true }, T).map((x) => [x.id, x.done])).toEqual([['b1~o', false]]);
    expect(reconcileReads('b1', [r({ id: 'x', started: '2026-01-01' })], { count: 0, finished: '', reading: true }, T)).toEqual([]);
  });
});

describe('groupNotes', () => {
  const reads = [
    r({ id: 'old', finished: '2021-07-04' }),
    r({ id: 'now', started: '2026-11-01' }),
    r({ id: 'mid', finished: '2024-01-01' }),
    { ...r({ id: 'gone', finished: '2023-01-01' }), deleted: true },
  ];
  const note = (id, readId, at) => createNote({ bookId: 'b1', text: id, readId }, { now: at, id });
  const notes = [
    note('n1', 'old', 1), note('n2', 'now', 5), note('n3', null, 3), note('n4', 'now', 9), note('n5', 'gone', 4),
    { ...note('n6', 'mid', 2), deleted: true }, createNote({ bookId: 'other', text: 'x' }, { now: 1, id: 'n7' }),
  ];

  it('groups a book’s notes by read: the read in progress, then newest, then the book as a whole', () => {
    expect(groupNotes(notes, reads, 'b1').map((g) => [g.read?.id ?? null, g.notes.map((n) => n.id)])).toEqual([
      ['now', ['n4', 'n2']],
      ['old', ['n1']],
      [null, ['n5', 'n3']],
    ]);
  });

  it('notes about a deleted read fall back to the book', () => {
    expect(groupNotes(notes, reads, 'b1').at(-1).notes.map((n) => n.id)).toContain('n5');
  });

  it('leaves out reads without notes, and is one group for a book with none tied to reads', () => {
    expect(groupNotes([note('a', null, 1)], reads, 'b1').map((g) => g.read)).toEqual([null]);
    expect(groupNotes([], reads, 'b1')).toEqual([]);
  });
});
