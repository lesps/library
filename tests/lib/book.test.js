import { describe, it, expect } from 'vitest';
import { createBook, updateBook, statusPatch, sanitizeBook, BOOK_FIELDS, authorSortKey, titleSortKey } from '../../src/lib/book.js';

const T0 = 1_700_000_000_000;

describe('createBook', () => {
  it('fills defaults, stamps every field and keeps only known fields', () => {
    const b = createBook({ title: '  Dune ', authors: ['Frank Herbert'], status: 'want', junk: 1 }, { now: T0, id: 'b1' });
    expect(b).toMatchObject({ id: 'b1', title: 'Dune', authors: ['Frank Herbert'], status: 'want', rating: 0, collectionIds: [], addedAt: T0, updatedAt: T0, source: 'manual' });
    expect(b.junk).toBeUndefined();
    for (const f of Object.keys(BOOK_FIELDS)) expect(b.fieldAt[f], f).toBe(T0);
  });

  it('cleans values: bad ISBNs dropped, numbers clamped, unknown status → none', () => {
    const b = createBook({ title: 'X', isbn13: '9780140328722', pages: -5, rating: 9, status: 'lost', year: '1965' }, { now: T0, id: 'b' });
    expect(b.isbn13).toBe('');
    expect(b.pages).toBe(null);
    expect(b.rating).toBe(5);
    expect(b.status).toBe('none');
    expect(b.year).toBe(1965);
  });

  it('derives the ISBN-13 from an ISBN-10 when only that is known', () => {
    expect(createBook({ title: 'X', isbn10: '0451526538' }, { now: T0, id: 'b' }).isbn13).toBe('9780451526533');
  });
});

describe('updateBook', () => {
  const b = createBook({ title: 'Dune', authors: ['Frank Herbert'] }, { now: T0, id: 'b1' });

  it('stamps only the fields that changed', () => {
    const u = updateBook(b, { rating: 4, title: 'Dune' }, T0 + 5);
    expect(u.rating).toBe(4);
    expect(u.fieldAt.rating).toBe(T0 + 5);
    expect(u.fieldAt.title).toBe(T0);
    expect(u.updatedAt).toBe(T0 + 5);
  });

  it('returns the same object when nothing changes', () => {
    expect(updateBook(b, { authors: ['Frank Herbert'], title: ' Dune ' }, T0 + 5)).toBe(b);
  });

  it('never blanks the title and never changes id, addedAt or source', () => {
    const u = updateBook(b, { title: '  ', id: 'x', addedAt: 1, source: 'goodreads' }, T0 + 5);
    expect(u).toBe(b);
  });
});

describe('statusPatch', () => {
  const today = '2026-11-07';
  const base = (status, extra = {}) => createBook({ title: 'X', status, ...extra }, { now: T0, id: 'b' });

  it('starting a book stamps the start date', () => {
    expect(statusPatch(base('want'), 'reading', today)).toEqual({ status: 'reading', started: today });
  });

  it('finishing stamps the finish date and counts the read', () => {
    expect(statusPatch(base('reading', { started: '2026-10-01' }), 'read', today)).toEqual({ status: 'read', finished: today, readCount: 1 });
    expect(statusPatch(base('want', { readCount: 2 }), 'read', today)).toEqual({ status: 'read', finished: today, readCount: 3 });
  });

  it('rereading restarts the clock but keeps the finish history', () => {
    expect(statusPatch(base('read', { finished: '2025-01-01', readCount: 1 }), 'reading', today)).toEqual({ status: 'reading', started: today });
  });

  it('joining the to-read list puts the book at the end of the queue', () => {
    expect(statusPatch(base('none'), 'want', today, { endRank: 'k' })).toEqual({ status: 'want', queueRank: 'k' });
  });

  it('is empty when the status is unchanged or unknown', () => {
    expect(statusPatch(base('read'), 'read', today)).toEqual({});
    expect(statusPatch(base('read'), 'nope', today)).toEqual({});
  });
});

describe('sanitizeBook', () => {
  it('accepts a stored book and fills missing stamps with 0', () => {
    const b = createBook({ title: 'Dune' }, { now: T0, id: 'b1' });
    const { fieldAt, ...rest } = b;
    const s = sanitizeBook({ ...rest, fieldAt: { title: T0 } });
    expect(s.fieldAt.title).toBe(T0);
    expect(s.fieldAt.rating).toBe(0);
  });

  it('rejects records without an id, or without a title unless awaiting look-up', () => {
    expect(sanitizeBook({ title: 'X' })).toBe(null);
    expect(sanitizeBook({ id: 'a', title: '' })).toBe(null);
    expect(sanitizeBook({ id: 'a', title: '', isbn13: '9780140328721', needsLookup: true })).not.toBe(null);
    expect(sanitizeBook(null)).toBe(null);
  });
});

describe('sort keys', () => {
  it('files authors by surname', () => {
    expect(authorSortKey('Ursula K. Le Guin')).toBe('le guin, ursula k.');
    expect(authorSortKey('Frank Herbert')).toBe('herbert, frank');
    expect(authorSortKey('Plato')).toBe('plato');
    expect(authorSortKey('Martin Luther King Jr.')).toBe('king, martin luther');
  });

  it('files titles without leading articles', () => {
    expect(titleSortKey('The Left Hand of Darkness')).toBe('left hand of darkness');
    expect(titleSortKey('A Wizard of Earthsea')).toBe('wizard of earthsea');
    expect(titleSortKey('Anathem')).toBe('anathem');
  });
});
