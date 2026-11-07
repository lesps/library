import { describe, it, expect } from 'vitest';
import { createBook, updateBook } from '../../src/lib/book.js';
import { createNote } from '../../src/lib/records.js';
import { emptyData } from '../../src/lib/merge.js';
import { applyEdits } from '../../src/lib/snapshots.js';
import { captureBefore, undoEdits } from '../../src/lib/undo.js';

const T = 1_700_000_000_000;
const a = createBook({ title: 'A', status: 'want' }, { now: T, id: 'a' });
const b = createBook({ title: 'B', status: 'want' }, { now: T, id: 'b' });
const data = { ...emptyData(), books: [a, b] };

describe('undo', () => {
  it('puts edited books back, as new edits stamped now', () => {
    const edits = { books: [updateBook(a, { status: 'read', rating: 3 }, T + 1), updateBook(b, { deleted: true }, T + 1)] };
    const before = captureBefore(data, edits);
    const after = applyEdits(data, edits);
    const back = applyEdits(after, undoEdits(before, after, T + 2));
    expect(back.books.find((x) => x.id === 'a')).toMatchObject({ status: 'want', rating: 0 });
    expect(back.books.find((x) => x.id === 'a').fieldAt.status).toBe(T + 2);
    expect(back.books.find((x) => x.id === 'b').deleted).toBe(false);
  });

  it('removes records the action created', () => {
    const note = createNote({ bookId: 'a', text: 'x' }, { now: T + 1, id: 'n' });
    const added = createBook({ title: 'C' }, { now: T + 1, id: 'c' });
    const edits = { books: [added], notes: [note] };
    const before = captureBefore(data, edits);
    const back = applyEdits(applyEdits(data, edits), undoEdits(before, applyEdits(data, edits), T + 2));
    expect(back.books.find((x) => x.id === 'c').deleted).toBe(true);
    expect(back.notes.find((x) => x.id === 'n').deleted).toBe(true);
  });
});
