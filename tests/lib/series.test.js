import { describe, it, expect } from 'vitest';
import { createBook } from '../../src/lib/book.js';
import {
  parseSeriesTitle, seriesTitle, seriesLabel, seriesList, booksInSeries, seriesFromTitle,
  wdFindSeriesUrl, parseFoundSeries, wdMembersUrl, parseMembers, pickSeries, matchMember,
} from '../../src/lib/series.js';

const T = 1_700_000_000_000;
let n = 0;
const book = (f) => createBook(f, { now: T, id: `b${++n}` });

describe('parseSeriesTitle (Goodreads writes the series into the title)', () => {
  it('splits off the series name and number', () => {
    expect(parseSeriesTitle('The Way of Kings (The Stormlight Archive, #1)')).toEqual({ title: 'The Way of Kings', name: 'The Stormlight Archive', number: '1' });
    expect(parseSeriesTitle('Leviathan Wakes (The Expanse #1)')).toEqual({ title: 'Leviathan Wakes', name: 'The Expanse', number: '1' });
  });

  it('keeps novellas, omnibuses and the first of several series', () => {
    expect(parseSeriesTitle('The Eleventh Metal (Mistborn, #0.5)')).toMatchObject({ number: '0.5' });
    expect(parseSeriesTitle('The Complete Box Set (Harry Potter, #1-7)')).toMatchObject({ name: 'Harry Potter', number: '1-7' });
    expect(parseSeriesTitle('Guards! Guards! (Discworld, #8; City Watch, #1)')).toEqual({ title: 'Guards! Guards!', name: 'Discworld', number: '8' });
  });

  it('leaves other parentheses alone', () => {
    expect(parseSeriesTitle('Dune (Deluxe Edition)')).toBe(null);
    expect(parseSeriesTitle('Emma')).toBe(null);
    expect(parseSeriesTitle('(Untitled, #1)')).toBe(null);
  });
});

describe('labels', () => {
  it('names a book’s place in its series, and rebuilds the Goodreads title', () => {
    const b = book({ title: 'The Way of Kings', seriesName: 'The Stormlight Archive', seriesNumber: '1' });
    expect(seriesLabel(b)).toBe('The Stormlight Archive #1');
    expect(seriesTitle(b)).toBe('The Way of Kings (The Stormlight Archive, #1)');
    expect(seriesTitle(book({ title: 'Emma' }))).toBe('Emma');
    expect(seriesLabel(book({ title: 'X', seriesName: 'Unnumbered' }))).toBe('Unnumbered');
  });
});

describe('grouping', () => {
  const books = [
    book({ title: 'Words of Radiance', seriesName: 'The Stormlight Archive', seriesNumber: '2' }),
    book({ title: 'The Way of Kings', seriesName: 'The Stormlight Archive', seriesNumber: '1' }),
    book({ title: 'Edgedancer', seriesName: 'the stormlight archive', seriesNumber: '2.5' }),
    book({ title: 'Mort', seriesName: 'Discworld', seriesNumber: '4' }),
    { ...book({ title: 'Gone', seriesName: 'Discworld', seriesNumber: '1' }), deleted: true },
    book({ title: 'Emma' }),
  ];

  it('lists series by name (ignoring case), each in number order', () => {
    const list = seriesList(books);
    expect(list.map((s) => [s.name, s.books.map((b) => b.title)])).toEqual([
      ['Discworld', ['Mort']],
      ['The Stormlight Archive', ['The Way of Kings', 'Words of Radiance', 'Edgedancer']],
    ]);
  });

  it('finds one series’ books', () => {
    expect(booksInSeries(books, 'THE STORMLIGHT ARCHIVE').map((b) => b.seriesNumber)).toEqual(['1', '2', '2.5']);
  });
});

describe('seriesFromTitle (books saved before series existed)', () => {
  it('moves the series out of the title with the title’s own timestamp, so every device converts it the same way', () => {
    const old = { ...book({ title: 'Mort (Discworld, #4)' }), updatedAt: T + 50 };
    old.fieldAt = { ...old.fieldAt, title: T + 7 };
    delete old.seriesName;
    delete old.seriesNumber;
    const b = seriesFromTitle(old);
    expect(b).toMatchObject({ title: 'Mort', seriesName: 'Discworld', seriesNumber: '4', updatedAt: T + 50 });
    expect(b.fieldAt).toMatchObject({ title: T + 7, seriesName: T + 7, seriesNumber: T + 7 });
    expect(seriesFromTitle(b)).toBe(b);
  });

  it('leaves books that already have a series, or no suffix, alone', () => {
    const a = book({ title: 'X (Y, #1)', seriesName: 'Already' });
    const e = book({ title: 'Emma' });
    expect(seriesFromTitle(a)).toBe(a);
    expect(seriesFromTitle(e)).toBe(e);
  });
});

describe('Wikidata', () => {
  const q = (url) => new URL(url).searchParams.get('query');

  it('finds a book’s series by its Open Library work, or by title and author', () => {
    const byWork = wdFindSeriesUrl({ olWork: '/works/OL5738148W', title: 'x', authors: [] });
    expect(byWork.startsWith('https://query.wikidata.org/sparql?')).toBe(true);
    expect(new URL(byWork).searchParams.get('format')).toBe('json');
    expect(q(byWork)).toContain('wdt:P648 "OL5738148W"');
    const byTitle = q(wdFindSeriesUrl({ olWork: '', title: 'The "Way" of Kings', authors: ['Brandon Sanderson'] }));
    expect(byTitle).toContain('rdfs:label "The \\"Way\\" of Kings"@en');
    expect(byTitle).toContain('"sanderson"');
    expect(byTitle).toContain('P179');
  });

  it('reads the series found', () => {
    const json = { results: { bindings: [
      { series: { value: 'http://www.wikidata.org/entity/Q1057386' }, seriesLabel: { value: 'The Stormlight Archive' }, ord: { value: '1' } },
      { series: { value: 'http://www.wikidata.org/entity/Q1057386' }, seriesLabel: { value: 'The Stormlight Archive' }, ord: { value: '1' } },
      { series: { value: 'http://www.wikidata.org/entity/Q999' }, seriesLabel: { value: 'Cosmere' } },
    ] } };
    expect(parseFoundSeries(json)).toEqual([{ id: 'Q1057386', name: 'The Stormlight Archive', number: '1' }, { id: 'Q999', name: 'Cosmere', number: '' }]);
    expect(parseFoundSeries({})).toEqual([]);
  });

  it('prefers the series whose name matches the one already known, then a numbered one', () => {
    const found = [{ id: 'Q999', name: 'Cosmere', number: '' }, { id: 'Q1', name: 'The Stormlight Archive', number: '1' }];
    expect(pickSeries(found, 'cosmere').id).toBe('Q999');
    expect(pickSeries(found, '').id).toBe('Q1');
    expect(pickSeries(found, 'Something else').id).toBe('Q1');
    expect(pickSeries([found[0]], '').id).toBe('Q999');
    expect(pickSeries([], 'x')).toBe(null);
  });

  it('sorts numbers as numbers', () => {
    const lib = ['10', '2', '1-3', '', '0.5'].map((n, i) => book({ title: `T${i}`, seriesName: 'S', seriesNumber: n }));
    expect(booksInSeries(lib, 's').map((b) => b.seriesNumber)).toEqual(['0.5', '1-3', '2', '10', '']);
  });

  it('lists a series’ books in order, one row per book', () => {
    expect(q(wdMembersUrl('Q1057386'))).toContain('ps:P179 wd:Q1057386');
    const row = (id, label, extra = {}) => ({ book: { value: `http://www.wikidata.org/entity/${id}` }, bookLabel: { value: label }, ...extra });
    const json = { results: { bindings: [
      row('Q3', 'Oathbringer', { ord: { value: '3' }, date: { value: '2017-11-14T00:00:00Z' }, authorLabel: { value: 'Brandon Sanderson' } }),
      row('Q1', 'The Way of Kings', { ord: { value: '1' }, ol: { value: 'OL15358691W' }, date: { value: '2010-08-31T00:00:00Z' }, authorLabel: { value: 'Brandon Sanderson' } }),
      row('Q1', 'The Way of Kings', { ord: { value: '1' }, ol: { value: 'OL24350000M' }, date: { value: '2011-05-24T00:00:00Z' } }),
      row('Q25', 'Edgedancer', { ord: { value: '2.5' } }),
      row('Q7', 'Q7'),
      row('Q8', 'Untitled companion', { date: { value: '2012-01-01T00:00:00Z' } }),
    ] } };
    expect(parseMembers(json)).toEqual([
      { id: 'Q1', title: 'The Way of Kings', number: '1', olWork: '/works/OL15358691W', year: 2010, authors: ['Brandon Sanderson'] },
      { id: 'Q25', title: 'Edgedancer', number: '2.5', olWork: '', year: null, authors: [] },
      { id: 'Q3', title: 'Oathbringer', number: '3', olWork: '', year: 2017, authors: ['Brandon Sanderson'] },
      { id: 'Q8', title: 'Untitled companion', number: '', olWork: '', year: 2012, authors: [] },
    ]);
  });

  it('matches a found book to one in the library by Open Library work or title', () => {
    const lib = [book({ title: 'The Way of Kings', olWork: '/works/OL15358691W' }), book({ title: 'Words of Radiance' })];
    expect(matchMember(lib, { title: 'Way of Kings, The', olWork: '/works/OL15358691W' })?.title).toBe('The Way of Kings');
    expect(matchMember(lib, { title: 'words of radiance', olWork: '' })?.title).toBe('Words of Radiance');
    expect(matchMember(lib, { title: 'Oathbringer', olWork: '' })).toBe(undefined);
  });
});
