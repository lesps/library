import { describe, it, expect } from 'vitest';
import { olSearchUrl, parseOlSearch, googleSearchUrl, parseGoogle, coverLookupUrl, parseCoverLookup, coverSrc, needsCover } from '../../src/lib/lookup.js';
import { createBook } from '../../src/lib/book.js';

const T = 1_700_000_000_000;

describe('Open Library search', () => {
  it('searches by ISBN when the query is one, otherwise by text, asking only for the fields used', () => {
    expect(olSearchUrl('978-0-14-032872-1')).toMatch(/^https:\/\/openlibrary\.org\/search\.json\?isbn=9780140328721&/);
    const u = new URL(olSearchUrl('the left hand'));
    expect(u.searchParams.get('q')).toBe('the left hand');
    expect(u.searchParams.get('fields')).toContain('cover_i');
  });

  it('turns docs into candidates; the ISBN is kept only when searching by it', () => {
    const json = { docs: [
      { key: '/works/OL45804W', title: 'Fantastic Mr Fox', author_name: ['Roald Dahl'], first_publish_year: 1970, cover_i: 6498519, number_of_pages_median: 96, publisher: ['Puffin'], isbn: ['9780140328721'] },
      { key: '/works/X', title: '' },
    ] };
    expect(parseOlSearch(json, { isbn: '9780140328721' })).toEqual([
      { title: 'Fantastic Mr Fox', subtitle: '', authors: ['Roald Dahl'], year: 1970, pages: 96, publisher: 'Puffin', coverId: 6498519, olWork: '/works/OL45804W', isbn13: '9780140328721', source: 'openlibrary' },
    ]);
    expect(parseOlSearch(json)[0].isbn13).toBe('');
    expect(parseOlSearch(null)).toEqual([]);
  });
});

describe('Google Books', () => {
  it('builds a search and reads volumes, covers forced to https', () => {
    expect(googleSearchUrl('9780140328721')).toContain('q=isbn%3A9780140328721');
    const json = { items: [{ volumeInfo: {
      title: 'Dune', subtitle: 'Deluxe', authors: ['Frank Herbert'], publishedDate: '2019-10-01', pageCount: 896, publisher: 'Ace',
      industryIdentifiers: [{ type: 'ISBN_10', identifier: '059309932X' }, { type: 'ISBN_13', identifier: '9780593099322' }],
      imageLinks: { thumbnail: 'http://books.google.com/books/content?id=x&printsec=frontcover&img=1&zoom=1&edge=curl' },
    } }, { volumeInfo: {} }] };
    expect(parseGoogle(json)).toEqual([{
      title: 'Dune', subtitle: 'Deluxe', authors: ['Frank Herbert'], year: 2019, pages: 896, publisher: 'Ace',
      isbn13: '9780593099322', isbn10: '059309932X', coverUrl: 'https://books.google.com/books/content?id=x&printsec=frontcover&img=1&zoom=1', source: 'google',
    }]);
  });
});

describe('covers', () => {
  it('looks a cover up by ISBN, else by title and author', () => {
    expect(coverLookupUrl({ isbn13: '9780140328721', title: 'x', authors: [] })).toContain('isbn=9780140328721');
    const u = new URL(coverLookupUrl({ isbn13: '', title: 'Dune', authors: ['Frank Herbert'] }));
    expect(u.searchParams.get('title')).toBe('Dune');
    expect(u.searchParams.get('author')).toBe('Frank Herbert');
    expect(parseCoverLookup({ docs: [{ cover_i: 5, key: '/works/W' }] })).toEqual({ coverId: 5, olWork: '/works/W' });
    expect(parseCoverLookup({ docs: [{ key: '/works/W' }] })).toBe(null);
  });

  it('uses cover ids, never ISBN cover URLs (those are rate-limited)', () => {
    expect(coverSrc({ coverId: 42 }, 'M')).toBe('https://covers.openlibrary.org/b/id/42-M.jpg');
    expect(coverSrc({ coverId: null, coverUrl: 'https://g/x' })).toBe('https://g/x');
    expect(coverSrc({ coverId: null, coverUrl: '' })).toBe('');
  });

  it('knows which books still need a cover, retrying misses after 30 days', () => {
    const b = createBook({ title: 'X' }, { now: T, id: 'x' });
    expect(needsCover(b, T)).toBe(true);
    expect(needsCover({ ...b, coverId: 1 }, T)).toBe(false);
    expect(needsCover({ ...b, coverCheckedAt: T }, T + 86_400_000)).toBe(false);
    expect(needsCover({ ...b, coverCheckedAt: T }, T + 31 * 86_400_000)).toBe(true);
    expect(needsCover({ ...b, deleted: true }, T)).toBe(false);
    expect(needsCover({ ...b, needsLookup: true }, T)).toBe(false);
  });
});
