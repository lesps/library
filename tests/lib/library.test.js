import { describe, it, expect } from 'vitest';
import { createBook } from '../../src/lib/book.js';
import { createNote } from '../../src/lib/records.js';
import { normalize, queryBooks, statusCounts, toReadQueue, queueEndRank, findDuplicate, SORTS } from '../../src/lib/library.js';

const T = 1_700_000_000_000;
let n = 0;
const book = (f) => createBook(f, { now: T + n++, id: `b${n}` });
const books = [
  book({ title: 'The Left Hand of Darkness', authors: ['Ursula K. Le Guin'], status: 'read', rating: 5, finished: '2025-02-01', collectionIds: ['c1'] }),
  book({ title: 'Dune', authors: ['Frank Herbert'], status: 'want', queueRank: 'm', collectionIds: ['c1'] }),
  book({ title: 'Emma', authors: ['Jane Austen'], status: 'want', queueRank: 'c' }),
  book({ title: 'Cien años de soledad', authors: ['Gabriel García Márquez'], status: 'reading' }),
  book({ title: 'Anathem', authors: ['Neal Stephenson'], status: 'none', isbn13: '9780061474095' }),
  { ...book({ title: 'Deleted', status: 'read' }), deleted: true },
  book({ title: 'Persuasion', authors: ['Jane Austen'], status: 'want' }),
];
const notes = [createNote({ bookId: books[4].id, text: 'monastery of mathematicians' }, { now: T, id: 'n1' })];
const titles = (bs) => bs.map((b) => b.title);

describe('normalize', () => {
  it('folds case and accents', () => expect(normalize('  García MÁRQUEZ ')).toBe('garcia marquez'));
});

describe('queryBooks', () => {
  it('leaves deleted books out', () => expect(titles(queryBooks(books, {}))).not.toContain('Deleted'));

  it('filters by status and collection, "none" meaning in no collection', () => {
    expect(titles(queryBooks(books, { status: 'want', sort: 'title' }))).toEqual(['Dune', 'Emma', 'Persuasion']);
    expect(titles(queryBooks(books, { collection: 'c1', sort: 'title' }))).toEqual(['Dune', 'The Left Hand of Darkness']);
    expect(queryBooks(books, { collection: 'none' })).toHaveLength(4);
  });

  it('searches title, author, ISBN and notes, every word, accents ignored', () => {
    expect(titles(queryBooks(books, { query: 'marquez' }))).toEqual(['Cien años de soledad']);
    expect(titles(queryBooks(books, { query: 'austen emma' }))).toEqual(['Emma']);
    expect(titles(queryBooks(books, { query: '978-0061474095' }))).toEqual(['Anathem']);
    expect(titles(queryBooks(books, { query: 'mathematicians', notes }))).toEqual(['Anathem']);
    expect(queryBooks(books, { query: 'zzz' })).toEqual([]);
  });

  it('sorts by title (ignoring articles), author surname, rating, finish date and recency', () => {
    expect(titles(queryBooks(books, { sort: 'title' }))[0]).toBe('Anathem');
    expect(titles(queryBooks(books, { sort: 'title' })).indexOf('The Left Hand of Darkness')).toBe(4);
    expect(titles(queryBooks(books, { sort: 'author' })).slice(0, 2)).toEqual(['Emma', 'Persuasion']);
    expect(titles(queryBooks(books, { sort: 'rating' }))[0]).toBe('The Left Hand of Darkness');
    expect(titles(queryBooks(books, { sort: 'added' }))[0]).toBe('Persuasion');
    expect(Object.keys(SORTS)).toEqual(expect.arrayContaining(['added', 'title', 'author', 'rating', 'finished', 'updated']));
  });
});

describe('to-read queue', () => {
  it('orders by rank, unranked books last by date added', () => {
    expect(titles(toReadQueue(books))).toEqual(['Emma', 'Dune', 'Persuasion']);
  });

  it('gives a rank after the last ranked book', () => {
    expect(queueEndRank(books) > 'm').toBe(true);
    expect(queueEndRank([])).toBe('i');
  });
});

describe('statusCounts', () => {
  it('counts live books per status', () => {
    expect(statusCounts(books)).toEqual({ all: 6, want: 3, reading: 1, read: 1, none: 1 });
  });
});

describe('findDuplicate', () => {
  it('matches by ISBN, then by title and first author', () => {
    expect(findDuplicate(books, { isbn13: '9780061474095', title: 'Other' })?.title).toBe('Anathem');
    expect(findDuplicate(books, { title: 'the left hand of darkness', authors: ['Ursula K. Le Guin'] })?.title).toBe('The Left Hand of Darkness');
    expect(findDuplicate(books, { title: 'Dune', authors: ['Brian Herbert'] })).toBe(undefined);
    expect(findDuplicate(books, { title: 'Deleted' })).toBe(undefined);
  });
});
