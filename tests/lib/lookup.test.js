import { describe, it, expect } from 'vitest';
import { olSearchUrl, parseOlSearch, googleSearchUrl, parseGoogle, coverLookupUrl, parseBookLookup, coverSrc, needsCover, needsSubjects } from '../../src/lib/lookup.js';
import { createBook } from '../../src/lib/book.js';

const T = 1_700_000_000_000;

describe('Open Library search', () => {
  it('searches by ISBN when the query is one, otherwise by text, asking only for the fields used', () => {
    expect(olSearchUrl('978-0-14-032872-1')).toMatch(/^https:\/\/openlibrary\.org\/search\.json\?isbn=9780140328721&/);
    const u = new URL(olSearchUrl('the left hand'));
    expect(u.searchParams.get('q')).toBe('the left hand');
    expect(u.searchParams.get('fields')).toContain('cover_i');
    expect(u.searchParams.get('fields')).toContain('subject,place,time');
  });

  it('turns docs into candidates; the ISBN is kept only when searching by it', () => {
    const json = { docs: [
      { key: '/works/OL45804W', title: 'Fantastic Mr Fox', author_name: ['Roald Dahl'], first_publish_year: 1970, cover_i: 6498519, number_of_pages_median: 96, publisher: ['Puffin'], isbn: ['9780140328721'], subject: ['Foxes', 'Accessible book'], place: ['England'] },
      { key: '/works/X', title: '' },
    ] };
    expect(parseOlSearch(json, { isbn: '9780140328721' })).toEqual([
      { title: 'Fantastic Mr Fox', subtitle: '', authors: ['Roald Dahl'], year: 1970, pages: 96, publisher: 'Puffin', coverId: 6498519, olWork: '/works/OL45804W', isbn13: '9780140328721', subjects: ['foxes', 'england'], source: 'openlibrary' },
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
    expect(parseBookLookup({ docs: [{ cover_i: 5, key: '/works/W' }] })).toMatchObject({ coverId: 5, olWork: '/works/W' });
  });

  it('brings subjects along in the same request, even when there’s no cover', () => {
    expect(new URL(coverLookupUrl({ isbn13: '', title: 'Dune', authors: [] })).searchParams.get('fields')).toContain('subject,place,time');
    expect(parseBookLookup({ docs: [{ key: '/works/A', subject: ['Deserts', 'Fiction'], time: ['Far future'] }, { key: '/works/B', cover_i: 9, number_of_pages_median: 412, first_publish_year: 1965 }] }))
      .toEqual({ coverId: 9, olWork: '/works/B', pages: 412, year: 1965, subjects: [] });
    expect(parseBookLookup({ docs: [{ key: '/works/A', subject: ['Deserts', 'Fiction'], time: ['Far future'] }] }))
      .toEqual({ coverId: null, olWork: '/works/A', pages: null, year: null, subjects: ['deserts', 'far future'] });
    expect(new URL(coverLookupUrl({ isbn13: '', title: 'Dune', authors: [] })).searchParams.get('fields')).toContain('first_publish_year');
    expect(parseBookLookup({ docs: [] })).toBe(null);
  });

  it('looks subjects up once per book, and again a month after finding none', () => {
    const now = 100 * 86_400_000;
    expect(needsSubjects({ title: 'x' }, now)).toBe(true);
    expect(needsSubjects({ title: 'x', subjectsAt: now - 1, subjects: [] }, now)).toBe(false);
    expect(needsSubjects({ title: 'x', subjectsAt: now - 31 * 86_400_000, subjects: [] }, now)).toBe(true);
    expect(needsSubjects({ title: 'x', subjectsAt: 1, subjects: ['a'] }, now)).toBe(false);
    expect(needsSubjects({ title: 'x', needsLookup: true }, now)).toBe(false);
  });

  it('brings a page count along when Open Library has one', () => {
    expect(new URL(coverLookupUrl({ isbn13: '', title: 'Dune', authors: [] })).searchParams.get('fields')).toContain('number_of_pages_median');
    expect(parseBookLookup({ docs: [{ cover_i: 5, key: '/works/W', number_of_pages_median: 412 }] })).toMatchObject({ coverId: 5, olWork: '/works/W', pages: 412 });
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
