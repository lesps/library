import { describe, it, expect } from 'vitest';
import { createBook, updateBook } from '../../src/lib/book.js';
import { createNote, createCollection } from '../../src/lib/records.js';
import { mergeBook, mergeData, emptyData } from '../../src/lib/merge.js';

const T = 1_700_000_000_000;
const book = createBook({ title: 'Dune', authors: ['Frank Herbert'], status: 'want' }, { now: T, id: 'b1' });

describe('mergeBook', () => {
  it('keeps the newer value of each field, so edits on two devices both survive', () => {
    const phone = updateBook(book, { status: 'reading' }, T + 10);
    const laptop = updateBook(book, { rating: 5 }, T + 20);
    const m = mergeBook(phone, laptop);
    expect(m).toMatchObject({ status: 'reading', rating: 5 });
    expect(m.fieldAt).toMatchObject({ status: T + 10, rating: T + 20 });
    expect(m.updatedAt).toBe(T + 20);
    expect(mergeBook(laptop, phone)).toEqual(m);
  });

  it('keeps the local value on a tie, so merging is idempotent', () => {
    const a = updateBook(book, { rating: 3 }, T + 5);
    const b = { ...updateBook(book, { rating: 4 }, T + 5) };
    expect(mergeBook(a, b).rating).toBe(3);
    expect(mergeBook(a, a)).toBe(a);
  });

  it('merges a delete like any other edit', () => {
    const deleted = updateBook(book, { deleted: true }, T + 30);
    const edited = updateBook(book, { rating: 2 }, T + 10);
    expect(mergeBook(edited, deleted)).toMatchObject({ deleted: true, rating: 2 });
  });
});

describe('mergeData', () => {
  const local = { ...emptyData(), books: [book], notes: [createNote({ bookId: 'b1', text: 'a' }, { now: T, id: 'n1' })] };

  it('adds, updates and removes, and reports the counts for books', () => {
    const incoming = {
      ...emptyData(),
      books: [
        updateBook(book, { rating: 4 }, T + 1),
        createBook({ title: 'Emma' }, { now: T, id: 'b2' }),
        { ...createBook({ title: 'Gone' }, { now: T, id: 'b3' }), deleted: true },
      ],
      notes: [{ ...local.notes[0], text: 'b', updatedAt: T + 1 }, createNote({ bookId: 'b2', text: 'new' }, { now: T, id: 'n2' })],
      collections: [createCollection({ name: 'Classics' }, { now: T, id: 'c1' })],
    };
    const { data, report } = mergeData(local, incoming);
    expect(report).toEqual({ added: 1, updated: 1, removed: 0, unchanged: 0, records: 3 });
    expect(data.books.map((b) => b.id).sort()).toEqual(['b1', 'b2', 'b3']);
    expect(data.notes.find((n) => n.id === 'n1').text).toBe('b');
  });

  it('counts a delete coming in as removed', () => {
    const { report } = mergeData(local, { ...emptyData(), books: [updateBook(book, { deleted: true }, T + 1)] });
    expect(report).toMatchObject({ removed: 1, updated: 0 });
  });

  it('is a no-op when merging with itself', () => {
    const { data, report } = mergeData(local, local);
    expect(report).toEqual({ added: 0, updated: 0, removed: 0, unchanged: 1, records: 0 });
    expect(data.books[0]).toBe(book);
  });

  it('merges reads record by record, so reads logged on two devices both survive', () => {
    const a = { ...local, reads: [{ id: 'r1', bookId: 'b1', started: '', finished: '2025-01-01', done: true, at: T, updatedAt: T }] };
    const b = { ...emptyData(), books: [book], reads: [{ id: 'r2', bookId: 'b1', started: '', finished: '2026-01-01', done: true, at: T, updatedAt: T }] };
    expect(mergeData(a, b).data.reads.map((r) => r.id).sort()).toEqual(['r1', 'r2']);
  });

  it('takes the newer settings', () => {
    const { data } = mergeData({ ...local, settings: { cats: 'off', updatedAt: T } }, { ...emptyData(), settings: { cats: 'subtle', updatedAt: T + 1 } });
    expect(data.settings.cats).toBe('subtle');
  });
});
