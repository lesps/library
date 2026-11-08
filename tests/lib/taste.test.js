import { describe, it, expect } from 'vitest';
import { createBook } from '../../src/lib/book.js';
import { createCollection } from '../../src/lib/records.js';
import { createRead } from '../../src/lib/reads.js';
import {
  cleanSubjects, bookFeatures, bookWeight, findLanes, cosine, vectorize, swipeDecay, eraOf, betaSample,
} from '../../src/lib/taste.js';
import { rng } from '../../src/lib/cats.js';

const T = Date.UTC(2026, 10, 8);
const YEAR = 365 * 86_400_000;
let n = 0;
const book = (f) => createBook({ status: 'read', ...f }, { now: T, id: `b${++n}` });

describe('cleanSubjects (Open Library subjects are noisy)', () => {
  it('drops library and bookshop tags, and words that say nothing', () => {
    expect(cleanSubjects([['Accessible book', 'Protected DAISY', 'In library', 'nyt:hardcover-fiction=2010', 'New York Times reviewed', 'Fiction', 'Literature', 'Large type books', 'Japanese fiction']]))
      .toEqual(['japanese fiction']);
  });

  it('turns "Fiction, x, general" into "x fiction" and splits catalogue headings', () => {
    expect(cleanSubjects([['Fiction, historical, general', 'Fiction, science fiction, general', 'Japan, fiction', 'Russia -- Social life and customs -- 19th century']]))
      .toEqual(['historical fiction', 'science fiction', 'japan', 'russia', 'social life and customs', '19th century']);
  });

  it('merges subject, place and time lists without repeats, up to 20', () => {
    expect(cleanSubjects([['Tokyo (Japan)', 'Death'], ['Tokyo (Japan)', 'Japan'], ['20th century']])).toEqual(['tokyo (japan)', 'death', 'japan', '20th century']);
    expect(cleanSubjects([Array.from({ length: 40 }, (_, i) => `Topic ${i}`)])).toHaveLength(20);
    expect(cleanSubjects([null, undefined, [42, '']])).toEqual([]);
  });
});

describe('features', () => {
  it('describes a book by authors, subjects, collections and era', () => {
    const b = book({ title: 'X', authors: ['Kōbō Abe'], subjects: ['japanese fiction', 'sand'], originalYear: 1962, collectionIds: ['c1', 'gone'] });
    const f = bookFeatures(b, new Set(['c1']));
    expect([...f.keys()].sort()).toEqual(['a:kobo abe', 'c:c1', 'e:1950', 's:japanese fiction', 's:sand']);
    expect(f.get('a:kobo abe')).toBeGreaterThan(f.get('s:sand'));
    expect(f.get('e:1950')).toBeLessThan(f.get('s:sand'));
  });

  it('counts only the main author: translators and editors (Goodreads’ additional authors) and “Anonymous” say little', () => {
    const f = bookFeatures(book({ title: 'Norwegian Wood', authors: ['Haruki Murakami', 'Jay Rubin'] }));
    expect([...f.keys()]).toEqual(['a:haruki murakami']);
    expect([...bookFeatures(book({ title: 'Gilgamesh', authors: ['Anonymous'] })).keys()]).toEqual([]);
  });

  it('reads shelves like Favorites as liking rather than a topic, and ignores ones like Owned', () => {
    const cs = [['fav', 'Favorites'], ['own', 'Owned'], ['k', 'kindle'], ['jp', 'Japanese']].map(([id, name], i) => createCollection({ name, rank: String(i) }, { now: T, id }));
    const lib = [...Array(4)].map((_, i) => book({ title: `J${i}`, authors: [`A${i}`], collectionIds: ['fav', 'own', 'k', 'jp'] }));
    const { profile } = findLanes(lib, { collections: cs, now: T });
    expect([...profile.keys()].filter((k) => k.startsWith('c:'))).toEqual(['c:jp']);
    expect(bookWeight(lib[0], new Map(), new Set(['fav']))).toBeGreaterThan(bookWeight(lib[0]));
  });

  it('buckets eras coarsely before 1900 and by half-century after', () => {
    expect([-750, 1200, 1603, 1869, 1925, 1962, 2011].map(eraOf)).toEqual(['ancient', 'medieval', '1600', '1800', '1900', '1950', '2000']);
    expect(eraOf(null)).toBe(null);
  });

  it('weighs a book by how much it was liked', () => {
    const reads = new Map([['b', { count: 3 }]]);
    const w = (f, r) => bookWeight({ id: 'b', status: 'read', rating: 0, ...f }, r ?? new Map());
    expect(w({ rating: 5 })).toBeGreaterThan(w({ rating: 4 }));
    expect(w({ rating: 4 })).toBeGreaterThan(w({ rating: 0 }));
    expect(w({ rating: 1 })).toBeLessThan(0);
    expect(w({}, reads)).toBeGreaterThan(w({}));
    expect(w({ status: 'reading' })).toBeGreaterThan(w({ status: 'want' }));
    expect(w({ deleted: true })).toBe(0);
  });

  it('measures similarity between weighted feature vectors', () => {
    const idf = new Map([['a', 1], ['b', 2]]);
    const v = vectorize(new Map([['a', 1], ['b', 1]]), idf);
    expect(cosine(v, v)).toBeCloseTo(1);
    expect(cosine(v, vectorize(new Map([['c', 1]]), idf))).toBe(0);
  });
});

describe('findLanes', () => {
  const japanese = (title, author, extra = {}) => book({ title, authors: [author], subjects: ['japanese fiction', 'japan', '20th century'], originalYear: 1960, ...extra });
  const russian = (title, author, extra = {}) => book({ title, authors: [author], subjects: ['russian fiction', 'russia', '19th century'], originalYear: 1870, ...extra });
  const library = () => [
    japanese('The Woman in the Dunes', 'Kōbō Abe', { rating: 5 }),
    japanese('The Box Man', 'Kōbō Abe'),
    japanese('Some Prefer Nettles', 'Jun’ichirō Tanizaki', { rating: 4 }),
    japanese('The Sound of Waves', 'Yukio Mishima'),
    japanese('Snow Country', 'Yasunari Kawabata'),
    russian('The Death of Ivan Ilych', 'Leo Tolstoy', { rating: 5 }),
    russian('Anna Karenina', 'Leo Tolstoy'),
    russian('Crime and Punishment', 'Fyodor Dostoevsky', { rating: 4 }),
    russian('Fathers and Sons', 'Ivan Turgenev'),
    russian('Dead Souls', 'Nikolai Gogol'),
  ];

  it('finds the groups a reader actually has, and names them', () => {
    const { lanes } = findLanes(library(), { now: T });
    expect(lanes).toHaveLength(2);
    const byLabel = Object.fromEntries(lanes.map((l) => [l.label, l.books.map((b) => b.title).sort()]));
    const jp = lanes.find((l) => l.books.some((b) => b.title === 'Snow Country'));
    expect(jp.books.map((b) => b.title)).not.toContain('Anna Karenina');
    expect(jp.label).toMatch(/Japan/i);
    expect(Object.keys(byLabel)).toHaveLength(2);
    expect(jp.top.find((t) => t.type === 'author').name).toBe('Kōbō Abe');
  });

  it('is deterministic', () => {
    const lib = library();
    const a = findLanes(lib, { now: T });
    const b = findLanes(lib.map((x) => ({ ...x })), { now: T });
    expect(a.lanes.map((l) => [l.key, l.books.map((x) => x.id)])).toEqual(b.lanes.map((l) => [l.key, l.books.map((x) => x.id)]));
  });

  it('uses collections to group books that have no subjects yet', () => {
    const cs = [createCollection({ name: 'Plays', rank: 'a' }, { now: T, id: 'plays' }), createCollection({ name: 'Tolkien', rank: 'b' }, { now: T, id: 'tk' })];
    const plays = ['Hamlet', 'The Tempest', 'No Exit', 'Waiting for Godot'].map((t, i) => book({ title: t, authors: [`Playwright ${i}`], collectionIds: ['plays'] }));
    const tolkien = ['The Hobbit', 'The Two Towers', 'The Silmarillion', 'Unfinished Tales'].map((t) => book({ title: t, authors: ['J.R.R. Tolkien'], collectionIds: ['tk'] }));
    const { lanes } = findLanes([...plays, ...tolkien], { collections: cs, now: T });
    expect(lanes.map((l) => l.books.length).sort()).toEqual([4, 4]);
    expect(lanes.map((l) => l.label).join(' ')).toMatch(/Plays/);
  });

  it('keeps unrelated groups apart however many there are, drops groups under three, and keeps the biggest twelve', () => {
    const group = (topic, k) => [...Array(k)].map((_, i) => book({ title: `${topic} ${i}`, authors: [`${topic} writer ${i % 2}`], subjects: [topic, `${topic} history`] }));
    const topics = ['sailing', 'beekeeping', 'chess', 'opera', 'volcanoes', 'origami'];
    const lib = [...topics.flatMap((t) => group(t, 4)), ...group('knots', 2)];
    const { lanes } = findLanes(lib, { now: T });
    expect(lanes).toHaveLength(6);
    for (const l of lanes) expect(new Set(l.books.map((b) => b.title.split(' ')[0])).size).toBe(1);
    expect(lanes.flatMap((l) => l.books).some((b) => b.title.startsWith('knots'))).toBe(false);
    expect(findLanes(lib, { now: T, maxLanes: 4 }).lanes).toHaveLength(4);
  });

  it('needs a few liked books before it has lanes', () => {
    expect(findLanes([book({ title: 'Only', subjects: ['x'] })], { now: T }).lanes).toEqual([]);
  });

  it('marks muted lanes', () => {
    const first = findLanes(library(), { now: T });
    const muted = findLanes(library(), { now: T, muted: [first.lanes[0].key] });
    expect(muted.lanes.find((l) => l.key === first.lanes[0].key).muted).toBe(true);
  });

  it('learns what to avoid from low ratings and recent “not for me” swipes', () => {
    const lib = [...library(), book({ title: 'Bad', subjects: ['horror'], rating: 1 })];
    const swipes = [{ id: 's', work: '/works/OL1W', verdict: 'no', features: ['s:space opera'], at: T, updatedAt: T }];
    const { anti } = findLanes(lib, { now: T, swipes });
    expect(anti.get('s:horror')).toBeGreaterThan(0);
    expect(anti.get('s:space opera')).toBeGreaterThan(0);
  });

  it('counts swipes for the lane they fall in, fading with age', () => {
    const swipes = [
      { id: 's1', verdict: 'want', features: ['s:japanese fiction', 'a:kobo abe'], at: T, updatedAt: T, peeked: true },
      { id: 's2', verdict: 'no', features: ['s:japanese fiction'], at: T - YEAR, updatedAt: T },
      { id: 's3', verdict: 'no', features: ['s:russian fiction'], at: T, updatedAt: T, deleted: true },
    ];
    const { lanes } = findLanes(library(), { now: T, swipes });
    const jp = lanes.find((l) => l.label.match(/Japan/i));
    expect(jp.yes).toBeCloseTo(1.25);
    expect(jp.no).toBeCloseTo(0.5);
    expect(lanes.find((l) => l !== jp).no).toBe(0);
  });

  it('weights rereads and the read history it is given', () => {
    const lib = library();
    const reads = [createRead({ bookId: lib[3].id, finished: '2020-01-01' }, { now: T, id: 'r1' }), createRead({ bookId: lib[3].id, finished: '2024-01-01' }, { now: T, id: 'r2' })];
    const { profile } = findLanes(lib, { now: T, reads });
    expect(profile.get('a:yukio mishima')).toBeGreaterThan(findLanes(lib, { now: T }).profile.get('a:yukio mishima'));
  });
});

describe('helpers', () => {
  it('halves a swipe’s weight each year', () => {
    expect(swipeDecay({ at: T }, T)).toBe(1);
    expect(swipeDecay({ at: T - YEAR }, T)).toBeCloseTo(0.5);
  });

  it('samples Beta distributions around their mean', () => {
    const r = rng(3);
    const xs = Array.from({ length: 2000 }, () => betaSample(r, 9, 1));
    expect(xs.every((x) => x > 0 && x < 1)).toBe(true);
    expect(xs.reduce((a, b) => a + b) / xs.length).toBeCloseTo(0.9, 1);
  });
});
