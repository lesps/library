import { describe, it, expect } from 'vitest';
import { createNote, sanitizeNote, createProgress, sanitizeProgress, currentProgress, progressPercent, createCollection, sanitizeCollection, touch, findCollection, createSwipe, sanitizeSwipe, swipeId } from '../../src/lib/records.js';

const T = 1_700_000_000_000;

describe('notes', () => {
  it('keeps text and an optional page', () => {
    expect(createNote({ bookId: 'b', text: '  Great line. \r\n', page: '42' }, { now: T, id: 'n1' }))
      .toEqual({ id: 'n1', bookId: 'b', text: 'Great line.', page: 42, at: T, updatedAt: T });
  });

  it('can be about one read of the book', () => {
    expect(createNote({ bookId: 'b', text: 'Noticed the bees this time.', readId: 'r2' }, { now: T, id: 'n' })).toMatchObject({ readId: 'r2' });
    expect(createNote({ bookId: 'b', text: 'x' }, { now: T, id: 'n' })).not.toHaveProperty('readId');
    expect(sanitizeNote({ id: 'n', bookId: 'b', text: 'x', readId: 42, at: T, updatedAt: T })).not.toHaveProperty('readId');
  });

  it('rejects empty notes and notes without a book', () => {
    expect(sanitizeNote({ id: 'n', bookId: 'b', text: '   ', at: T, updatedAt: T })).toBe(null);
    expect(sanitizeNote({ id: 'n', text: 'x', at: T, updatedAt: T })).toBe(null);
  });
});

describe('progress', () => {
  it('records a page or a percent', () => {
    expect(createProgress({ bookId: 'b', page: 120 }, { now: T, id: 'p' })).toMatchObject({ page: 120, percent: null });
    expect(createProgress({ bookId: 'b', percent: 140 }, { now: T, id: 'p' })).toMatchObject({ page: null, percent: 100 });
    expect(sanitizeProgress({ id: 'p', bookId: 'b', at: T, updatedAt: T })).toBe(null);
  });

  it('the latest live entry is the current position', () => {
    const list = [
      createProgress({ bookId: 'b', page: 10 }, { now: T, id: '1' }),
      { ...createProgress({ bookId: 'b', page: 90 }, { now: T + 2, id: '3' }), deleted: true },
      createProgress({ bookId: 'b', page: 50 }, { now: T + 1, id: '2' }),
    ];
    expect(currentProgress(list).page).toBe(50);
    expect(currentProgress([])).toBe(null);
  });

  it('works out a percentage from pages when it can', () => {
    expect(progressPercent({ page: 50, percent: null }, 200)).toBe(25);
    expect(progressPercent({ page: 250, percent: null }, 200)).toBe(100);
    expect(progressPercent({ page: 50, percent: null }, null)).toBe(null);
    expect(progressPercent({ page: null, percent: 30 }, 200)).toBe(30);
    expect(progressPercent(null, 200)).toBe(null);
  });
});

describe('collections', () => {
  it('needs a name', () => {
    expect(createCollection({ name: '  Sci-fi ', rank: 'i' }, { now: T, id: 'c' })).toEqual({ id: 'c', name: 'Sci-fi', rank: 'i', updatedAt: T });
    expect(sanitizeCollection({ id: 'c', name: ' ', updatedAt: T })).toBe(null);
  });

  it('finds an existing collection by name, ignoring case and deleted ones', () => {
    const cs = [{ id: 'a', name: 'Sci-fi' }, { id: 'b', name: 'Cozy', deleted: true }];
    expect(findCollection(cs, ' sci-FI ')?.id).toBe('a');
    expect(findCollection(cs, 'cozy')).toBe(undefined);
  });
});

describe('touch', () => {
  it('applies a patch and bumps updatedAt, or returns the record when nothing changes', () => {
    const n = createNote({ bookId: 'b', text: 'a' }, { now: T, id: 'n' });
    expect(touch(n, { text: 'b' }, T + 1, sanitizeNote)).toMatchObject({ text: 'b', updatedAt: T + 1 });
    expect(touch(n, { text: 'a' }, T + 1, sanitizeNote)).toBe(n);
    expect(touch(n, { deleted: true }, T + 1, sanitizeNote)).toMatchObject({ deleted: true, updatedAt: T + 1 });
  });
});

describe('swipes', () => {
  it('records a verdict on an Open Library work, one record per work', () => {
    const s = createSwipe({ work: '/works/OL45804W', title: ' Fantastic Mr Fox ', authors: ['Roald Dahl'], verdict: 'no', features: ['s:foxes', 'a:roald dahl'], peeked: true }, { now: T });
    expect(s).toEqual({ id: 'sw-OL45804W', work: '/works/OL45804W', title: 'Fantastic Mr Fox', authors: ['Roald Dahl'], verdict: 'no', features: ['s:foxes', 'a:roald dahl'], peeked: true, at: T, updatedAt: T });
    expect(swipeId('/works/OL45804W')).toBe('sw-OL45804W');
  });

  it('rejects unknown verdicts and works, and keeps features short', () => {
    expect(sanitizeSwipe({ id: 'sw-OL1W', work: '/works/OL1W', verdict: 'maybe', at: T, updatedAt: T })).toBe(null);
    expect(sanitizeSwipe({ id: 'sw-x', work: 'nope', verdict: 'no', at: T, updatedAt: T })).toBe(null);
    const s = sanitizeSwipe({ id: 'sw-OL1W', work: '/works/OL1W', verdict: 'want', features: [...Array(80)].map((_, i) => `s:${i}`).concat([42]), at: T, updatedAt: T, deleted: true });
    expect(s.features).toHaveLength(40);
    expect(s).toMatchObject({ title: '', authors: [], peeked: false, deleted: true });
  });
});
