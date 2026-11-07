import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseGoodreads, planImport, goodreadsCsv, shelfName, reviewText } from '../../src/lib/goodreads.js';
import { createBook } from '../../src/lib/book.js';
import { createCollection } from '../../src/lib/records.js';
import { emptyData } from '../../src/lib/merge.js';
import { applyEdits } from '../../src/lib/snapshots.js';
import { csvObjects } from '../../src/lib/csv.js';

const fixture = readFileSync(new URL('../fixtures/goodreads.csv', import.meta.url), 'utf8');
const T = new Date(2026, 10, 7, 12).getTime();
const today = '2026-11-07';

describe('parseGoodreads', () => {
  const { ok, rows, skipped } = parseGoodreads(fixture);

  it('reads every book row and skips blank ones', () => {
    expect(ok).toBe(true);
    expect(rows).toHaveLength(5);
    expect(skipped).toBe(1);
  });

  it('maps Goodreads columns onto book fields', () => {
    const martian = rows[0];
    expect(martian.goodreadsId).toBe('18007564');
    expect(martian.fields).toMatchObject({
      title: 'The Martian', authors: ['Andy Weir'], authorSort: 'Weir, Andy', isbn10: '0553418025', isbn13: '9780553418026',
      rating: 5, publisher: 'Crown', binding: 'Paperback', pages: 387, year: 2014, originalYear: 2011, status: 'read', owned: true,
    });
    expect(martian.reads).toEqual({ count: 2, finished: '2023-04-15', reading: false });
    expect(martian.fields.addedAt).toBe(new Date(2022, 11, 1, 12).getTime());
    expect(martian.fields.review).toBe('Funny and tense.\n\nLoved the potatoes & the duct tape.');
    expect(martian.shelves).toEqual(['sci-fi', 'favorites']);
    expect(martian.privateNotes).toBe('Lent to Sam');
  });

  it('splits the series Goodreads writes into the title', () => {
    expect(rows[2].fields).toMatchObject({ title: 'The Way of Kings', seriesName: 'The Stormlight Archive', seriesNumber: '1' });
    expect(rows[0].fields).toMatchObject({ title: 'The Martian', seriesName: '', seriesNumber: '' });
  });

  it('maps the exclusive shelf to a status; custom ones become a collection', () => {
    expect(rows.map((r) => r.fields.status)).toEqual(['read', 'want', 'want', 'reading', 'none']);
    expect(rows[4].shelves).toEqual(['did-not-finish']);
  });

  it('keeps additional authors and the to-read position', () => {
    expect(rows[4].fields.authors).toEqual(['Terry Pratchett', 'Neil Gaiman']);
    expect(rows[2].toReadPosition).toBe(1);
    expect(rows[1].toReadPosition).toBe(2);
  });

  it('treats empty ="" ISBNs as missing', () => {
    expect(rows[1].fields.isbn13).toBe('');
  });

  it('says so when the file is not a Goodreads export', () => {
    expect(parseGoodreads('Title,Author\nDune,Herbert').ok).toBe(false);
    expect(parseGoodreads('').error).toMatch(/Goodreads/);
  });
});

describe('planImport', () => {
  const { rows } = parseGoodreads(fixture);

  it('turns read counts and dates into reads: the latest dated, earlier ones date unknown', () => {
    const data = applyEdits(emptyData(), planImport(rows, emptyData(), { now: T }).edits);
    const martian = data.books.find((b) => b.title === 'The Martian');
    expect(data.reads.filter((r) => r.bookId === martian.id).map((r) => [r.finished, r.done])).toEqual([['2023-04-15', true], ['', true]]);
    const habits = data.books.find((b) => b.title === 'Atomic Habits');
    expect(data.reads.filter((r) => r.bookId === habits.id).map((r) => r.done)).toEqual([false]);
    const dune = data.books.find((b) => b.title === 'Fahrenheit 451');
    expect(data.reads.filter((r) => r.bookId === dune.id)).toEqual([]);
  });

  it('adds every book into an empty library, with collections, notes and a to-read order', () => {
    const plan = planImport(rows, emptyData(), { now: T });
    expect(plan.counts).toEqual({ add: 5, update: 0, unchanged: 0, collections: 3, notes: 1 });
    expect(plan.collections.map((c) => c.name)).toEqual(['Sci-fi', 'Favorites', 'Did not finish']);
    const data = applyEdits(emptyData(), plan.edits);
    const martian = data.books.find((b) => b.title === 'The Martian');
    expect(martian.source).toBe('goodreads');
    expect(martian.collectionIds).toHaveLength(2);
    expect(data.notes[0]).toMatchObject({ bookId: martian.id, text: 'Lent to Sam' });
    const want = data.books.filter((b) => b.status === 'want').sort((a, b) => (a.queueRank < b.queueRank ? -1 : 1));
    expect(want.map((b) => b.title)).toEqual(['The Way of Kings', 'Fahrenheit 451']);
  });

  it('re-importing the same export changes nothing', () => {
    const first = applyEdits(emptyData(), planImport(rows, emptyData(), { now: T }).edits);
    const again = planImport(rows, first, { now: T + 1000 });
    expect(again.counts).toEqual({ add: 0, update: 0, unchanged: 5, collections: 0, notes: 0 });
  });

  it('a newer export updates what changed on Goodreads, by Goodreads id', () => {
    const first = applyEdits(emptyData(), planImport(rows, emptyData(), { now: T }).edits);
    const later = rows.map((r) => (r.goodreadsId === '40121378' ? { ...r, fields: { ...r.fields, status: 'read', rating: 5 }, reads: { count: 1, finished: '2026-11-01', reading: false } } : r));
    const plan = planImport(later, first, { now: T + 1000 });
    expect(plan.counts).toMatchObject({ add: 0, update: 1 });
    expect(plan.edits.books[0]).toMatchObject({ title: 'Atomic Habits', status: 'read', rating: 5 });
    expect(plan.edits.reads.map((r) => r.finished)).toEqual(['2026-11-01']);
  });

  it('a reread logged on Goodreads since the last export becomes a new read', () => {
    const first = applyEdits(emptyData(), planImport(rows, emptyData(), { now: T }).edits);
    const later = rows.map((r) => (r.goodreadsId === '18007564' ? { ...r, reads: { count: 3, finished: '2026-10-10', reading: false } } : r));
    const plan = planImport(later, first, { now: T + 1000 });
    expect(plan.counts).toMatchObject({ add: 0, update: 1, unchanged: 4 });
    expect(plan.edits.reads.map((r) => r.finished)).toEqual(['2026-10-10']);
  });

  it('matches books already added by hand, by ISBN, and reuses collections by name', () => {
    const mine = { ...emptyData(), books: [createBook({ title: 'The Martian', isbn13: '9780553418026', status: 'want' }, { now: T, id: 'm' })], collections: [createCollection({ name: 'Sci-Fi', rank: 'i' }, { now: T, id: 'c' })] };
    const plan = planImport(rows, mine, { now: T + 1 });
    expect(plan.counts.add).toBe(4);
    const martian = plan.edits.books.find((b) => b.id === 'm');
    expect(martian).toMatchObject({ status: 'read', goodreadsId: '18007564' });
    expect(martian.collectionIds).toContain('c');
    expect(plan.collections.map((c) => c.name)).not.toContain('Sci-fi');
  });

  it('gives a matched book its Goodreads series when it has none, never replacing one', () => {
    const mine = { ...emptyData(), books: [
      createBook({ title: 'The Way of Kings', isbn13: '9780765326355' }, { now: T, id: 'k' }),
      createBook({ title: 'The Martian', isbn13: '9780553418026', seriesName: 'Mars', seriesNumber: '' }, { now: T, id: 'm' }),
    ] };
    const plan = planImport(rows, mine, { now: T + 1 });
    expect(plan.edits.books.find((b) => b.id === 'k')).toMatchObject({ seriesName: 'The Stormlight Archive', seriesNumber: '1' });
    expect(plan.edits.books.find((b) => b.id === 'm')).toMatchObject({ seriesName: 'Mars', seriesNumber: '' });
  });

  it('can leave books already in the library alone', () => {
    const first = applyEdits(emptyData(), planImport(rows, emptyData(), { now: T }).edits);
    const later = rows.map((r) => ({ ...r, fields: { ...r.fields, rating: 1 }, reads: { ...r.reads, count: 9 } }));
    expect(planImport(later, first, { now: T + 1, updateExisting: false }).counts).toMatchObject({ update: 0, unchanged: 5 });
  });
});

describe('helpers', () => {
  it('turns shelf slugs into collection names', () => {
    expect(shelfName('did-not-finish')).toBe('Did not finish');
    expect(shelfName('sci-fi')).toBe('Sci-fi');
    expect(shelfName('2024_reads')).toBe('2024 reads');
  });

  it('turns review HTML into plain text', () => {
    expect(reviewText('a<br />b &quot;c&quot; &#39;d&#39; <b>e</b>')).toBe('a\nb "c" \'d\' e');
  });
});

describe('goodreadsCsv', () => {
  it('exports in Goodreads’ own column format, which re-imports to the same books', () => {
    const data = applyEdits(emptyData(), planImport(parseGoodreads(fixture).rows, emptyData(), { now: T }).edits);
    const csv = goodreadsCsv(data);
    const { headers, rows } = csvObjects(csv);
    expect(headers).toEqual(csvObjects(fixture).headers);
    const martian = rows.find((r) => r.Title === 'The Martian');
    expect(martian).toMatchObject({ ISBN13: '="9780553418026"', 'Exclusive Shelf': 'read', 'Date Read': '2023/04/15', 'My Rating': '5', 'Private Notes': 'Lent to Sam' });
    expect(martian.Bookshelves).toBe('sci-fi, favorites');
    const back = parseGoodreads(csv).rows.map((r) => r.fields.title).sort();
    expect(back).toEqual(data.books.map((b) => b.title).sort());
    expect(rows.find((r) => r.Title.startsWith('The Way of Kings')).Title).toBe('The Way of Kings (The Stormlight Archive, #1)');
  });
});
