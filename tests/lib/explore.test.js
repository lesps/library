import { describe, it, expect } from 'vitest';
import { createBook } from '../../src/lib/book.js';
import { createRead } from '../../src/lib/reads.js';
import { scopeBooks, writtenYear, centuryKey, byCentury, byDecade, booksWritten, themes, topAuthors } from '../../src/lib/explore.js';

const T = Date.UTC(2026, 10, 8);
let n = 0;
const book = (f) => createBook(f, { now: T, id: `b${++n}` });
const lib = [
  book({ title: 'Iliad', authors: ['Homer'], originalYear: -750, status: 'read', subjects: ['epic poetry', 'trojan war'] }),
  book({ title: 'Beowulf', authors: ['Anonymous'], originalYear: 1000, status: 'read', subjects: ['epic poetry'] }),
  book({ title: 'Anna Karenina', authors: ['Leo Tolstoy'], originalYear: 1877, status: 'read', subjects: ['russian fiction', 'adultery', '19th century'] }),
  book({ title: 'War and Peace', authors: ['Leo Tolstoy'], originalYear: 1869, year: 2008, status: 'read', subjects: ['russian fiction', 'napoleonic wars', '19th century'] }),
  book({ title: 'Snow Country', authors: ['Yasunari Kawabata'], originalYear: 1948, status: 'read', subjects: ['japanese fiction'] }),
  book({ title: 'Kitchen', authors: ['Banana Yoshimoto'], originalYear: 1988, status: 'read', subjects: ['japanese fiction'] }),
  book({ title: 'Klara and the Sun', authors: ['Kazuo Ishiguro'], year: 2021, status: 'read' }),
  book({ title: 'No year', authors: ['X'], status: 'read' }),
  book({ title: 'Want', authors: ['Leo Tolstoy'], originalYear: 1886, status: 'want', subjects: ['russian fiction'] }),
  { ...book({ title: 'Gone', originalYear: 1900, status: 'read' }), deleted: true },
];

describe('scope', () => {
  it('means read books (by status or a finished read), or the whole library', () => {
    const reads = [createRead({ bookId: lib[8].id, finished: '2020-01-01' }, { now: T, id: 'r' })];
    expect(scopeBooks(lib, [], 'read').map((b) => b.title)).not.toContain('Want');
    expect(scopeBooks(lib, reads, 'read').map((b) => b.title)).toContain('Want');
    expect(scopeBooks(lib, [], 'all')).toHaveLength(9);
  });
});

describe('when they were written', () => {
  it('uses the original year, else the edition year', () => {
    expect(writtenYear(lib[3])).toBe(1869);
    expect(writtenYear(lib[6])).toBe(2021);
    expect(writtenYear(lib[7])).toBe(null);
  });

  it('groups by century, ancient and medieval lumped, gaps shown, up to this century', () => {
    expect([-750, 1000, 1500, 1877, 2021].map(centuryKey)).toEqual(['ancient', 'medieval', '1500', '1800', '2000']);
    const read = scopeBooks(lib, [], 'read');
    expect(byCentury(read, 2026).map((c) => [c.key, c.axis, c.value])).toEqual([
      ['ancient', 'Anc.', 1], ['medieval', 'Med.', 1], ['1500', '16th', 0], ['1600', '17th', 0], ['1700', '18th', 0],
      ['1800', '19th', 2], ['1900', '20th', 2], ['2000', '21st', 1],
    ]);
    expect(byCentury(read, 2026)[5].label).toBe('19th century: 2 books');
    expect(byCentury([lib[4]], 2026).map((c) => c.key)).toEqual(['1900', '2000']);
    expect(byCentury([], 2026)).toEqual([]);
  });

  it('breaks a century into decades, up to this one', () => {
    const read = scopeBooks(lib, [], 'read');
    expect(byDecade(read, '1900', 2026).map((d) => [d.axis, d.value])).toEqual([
      ['00s', 0], ['10s', 0], ['20s', 0], ['30s', 0], ['40s', 1], ['50s', 0], ['60s', 0], ['70s', 0], ['80s', 1], ['90s', 0],
    ]);
    expect(byDecade(read, '1900', 2026)[4].label).toBe('1940s: 1 book');
    expect(byDecade(read, '2000', 2026).map((d) => d.axis)).toEqual(['00s', '10s', '20s']);
  });

  it('lists the books of a century or decade, oldest first', () => {
    const read = scopeBooks(lib, [], 'read');
    expect(booksWritten(read, { century: '1800' }).map((b) => b.title)).toEqual(['War and Peace', 'Anna Karenina']);
    expect(booksWritten(read, { century: '1900', decade: 1980 }).map((b) => b.title)).toEqual(['Kitchen']);
    expect(booksWritten(read, {}).map((b) => b.title)).toEqual([]);
  });
});

describe('themes and authors', () => {
  it('ranks subjects by how many books have them, leaving out dates and one-offs', () => {
    const read = scopeBooks(lib, [], 'read');
    expect(themes(read).map((t) => [t.key, t.value])).toEqual([['epic poetry', 2], ['japanese fiction', 2], ['russian fiction', 2]]);
    expect(themes(read)[0].books.map((b) => b.title)).toEqual(['Iliad', 'Beowulf']);
    expect(themes(read)[0].label).toBe('epic poetry: 2 books');
  });

  it('ranks main authors with more than one book, skipping Anonymous', () => {
    const read = scopeBooks(lib, [], 'read');
    expect(topAuthors(read).map((a) => [a.key, a.value])).toEqual([['Leo Tolstoy', 2]]);
    expect(topAuthors(scopeBooks(lib, [], 'all'))[0]).toMatchObject({ key: 'Leo Tolstoy', value: 3 });
  });
});
