import { describe, it, expect } from 'vitest';
import { createBook } from '../../src/lib/book.js';
import { yearStats, yearsSummary, undatedReads, pace, dayOfYear } from '../../src/lib/stats.js';
import { createRead } from '../../src/lib/reads.js';
import { sanitizeSettings } from '../../src/lib/settings.js';

const T = new Date(2026, 10, 7, 12).getTime(); // Sat Nov 7 2026, day 311 of 365
let n = 0;
const book = (f) => createBook({ title: `B${n}`, ...f }, { now: T, id: `b${++n}` });
const read = (b, finished, f = {}) => createRead({ bookId: b.id, finished, ...f }, { now: T, id: `r${++n}` });
const long = book({ title: 'Long', status: 'read', pages: 900, rating: 5 });
const short = book({ title: 'Short', status: 'read', pages: 120, rating: 3 });
const nopages = book({ title: 'Nopages', status: 'read' });
const reread = book({ title: 'Reread', status: 'reading', pages: 300 });
const old = book({ title: 'Old', status: 'read', pages: 200 });
const undated = book({ title: 'Undated', status: 'read' });
const noreads = book({ title: 'Noreads', status: 'read' });
const gone = { ...book({ title: 'Gone', status: 'read', pages: 50 }), deleted: true };
const books = [long, short, nopages, reread, old, undated, noreads, gone, book({ title: 'Want', status: 'want' })];
const reads = [
  read(long, '2026-03-04'),
  read(short, '2026-03-20'),
  read(nopages, '2026-10-01'),
  read(reread, '2021-12-31'),
  read(reread, '2026-01-15'),
  read(reread, '', { started: '2026-11-01' }), // reading it again now
  read(old, '2023-06-01'),
  read(undated, '', { done: true }),
  read(gone, '2026-02-02'),
  { ...read(long, '2026-05-05'), deleted: true },
];

describe('yearStats', () => {
  const s = yearStats(books, reads, 2026);

  it('counts every read finished that year, rereads included', () => {
    expect(s.count).toBe(4);
    expect(s.entries.map((e) => e.book.title)).toEqual(['Nopages', 'Short', 'Long', 'Reread']);
    expect(s.entries.map((e) => e.read.finished)).toEqual(['2026-10-01', '2026-03-20', '2026-03-04', '2026-01-15']);
  });

  it('marks rereads and counts them', () => {
    expect(s.entries.find((e) => e.book.title === 'Reread').reread).toBe(true);
    expect(s.entries.find((e) => e.book.title === 'Long').reread).toBe(false);
    expect(s.rereads).toBe(1);
  });

  it('adds up the pages it knows, and says how many reads have none', () => {
    expect(s.pages).toBe(1320);
    expect(s.unknownPages).toBe(1);
    expect(s.avgPages).toBe(440);
  });

  it('splits the year by month', () => {
    expect(s.byMonth).toHaveLength(12);
    expect(s.byMonth[2]).toEqual({ month: 2, count: 2, pages: 1020 });
    expect(s.byMonth[0].count).toBe(1);
    expect(s.byMonth[9]).toEqual({ month: 9, count: 1, pages: 0 });
  });

  it('finds the longest and shortest books with page counts, and the average rating of rated ones', () => {
    expect(s.longest.title).toBe('Long');
    expect(s.shortest.title).toBe('Short');
    expect(s.avgRating).toBe(4);
  });

  it('is empty, not broken, for a year with no reads', () => {
    const e = yearStats(books, reads, 2019);
    expect(e).toMatchObject({ count: 0, rereads: 0, pages: 0, avgRating: null, avgPages: null, longest: null, shortest: null });
  });
});

describe('yearsSummary', () => {
  it('lists every year from the first finished read to the latest (or now), gaps included', () => {
    expect(yearsSummary(books, reads, 2026)).toEqual([
      { year: 2021, count: 1, pages: 300 },
      { year: 2022, count: 0, pages: 0 },
      { year: 2023, count: 1, pages: 200 },
      { year: 2024, count: 0, pages: 0 },
      { year: 2025, count: 0, pages: 0 },
      { year: 2026, count: 4, pages: 1320 },
    ]);
  });

  it('is just this year for a library with no dated reads', () => {
    expect(yearsSummary([], [], 2026)).toEqual([{ year: 2026, count: 0, pages: 0 }]);
  });
});

describe('undatedReads', () => {
  it('lists books with a read of unknown date, or marked read with no reads at all', () => {
    expect(undatedReads(books, reads).map((b) => b.title)).toEqual(['Undated', 'Noreads']);
  });
});

describe('pace', () => {
  it('knows the day of the year', () => {
    expect(dayOfYear(T)).toBe(311);
    expect(dayOfYear(new Date(2028, 11, 31, 12).getTime())).toBe(366);
  });

  it('compares progress with where an even pace would be by today', () => {
    expect(pace({ goal: 40, done: 18, year: 2026, now: T })).toEqual({ status: 'behind', by: 16, toGo: 22, daysLeft: 55, perDay: 0.4 });
    expect(pace({ goal: 20, done: 18, year: 2026, now: T })).toMatchObject({ status: 'ahead', by: 1, toGo: 2 });
    expect(pace({ goal: 21, done: 18, year: 2026, now: T })).toMatchObject({ status: 'on', by: 0 });
  });

  it('says when the goal is reached', () => {
    expect(pace({ goal: 10, done: 12, year: 2026, now: T })).toMatchObject({ status: 'done', toGo: 0 });
  });

  it('judges past years as reached or missed', () => {
    expect(pace({ goal: 30, done: 25, year: 2025, now: T })).toMatchObject({ status: 'missed', toGo: 5, daysLeft: 0 });
    expect(pace({ goal: 20, done: 25, year: 2025, now: T })).toMatchObject({ status: 'done' });
  });

  it('a future year has not started', () => {
    expect(pace({ goal: 30, done: 0, year: 2027, now: T })).toMatchObject({ status: 'upcoming', toGo: 30, daysLeft: 365 });
  });

  it('is null without a goal', () => {
    expect(pace({ goal: null, done: 3, year: 2026, now: T })).toBe(null);
  });
});

describe('goals in settings', () => {
  it('keeps a books and/or pages goal per year, dropping nonsense', () => {
    const s = sanitizeSettings({ cats: 'off', updatedAt: 1, goals: { 2026: { books: '40', pages: 12000 }, 2025: { books: 0, pages: null }, abc: { books: 3 }, 2024: { pages: 5000 } } });
    expect(s.goals).toEqual({ 2026: { books: 40, pages: 12000 }, 2024: { books: null, pages: 5000 } });
    expect(sanitizeSettings({}).goals).toEqual({});
  });

  it('keeps the Discover lanes muted, as a short list of keys', () => {
    expect(sanitizeSettings({ mutedLanes: ['s:horror', 's:horror', 42, '', 'x'.repeat(200)] }).mutedLanes).toEqual(['s:horror']);
    expect(sanitizeSettings({}).mutedLanes).toEqual([]);
  });
});
