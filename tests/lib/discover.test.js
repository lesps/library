import { describe, it, expect } from 'vitest';
import { createBook } from '../../src/lib/book.js';
import { findLanes } from '../../src/lib/taste.js';
import { rng } from '../../src/lib/cats.js';
import {
  laneQueries, searchUrl, parseDeal, parseWorkDescription, cleanDescription, workUrl, rankPool, deal, nextQuery, cardToBook, WILDCARD,
  titleCore, authorsMatch, stillFresh,
} from '../../src/lib/discover.js';

const T = Date.UTC(2026, 10, 8);
const YEAR = 365 * 86_400_000;
let n = 0;
const book = (f) => createBook({ status: 'read', ...f }, { now: T, id: `b${++n}` });
const jp = (title, author, extra) => book({ title, authors: [author], subjects: ['japanese fiction', 'japan'], originalYear: 1960, ...extra });
const ru = (title, author, extra) => book({ title, authors: [author], subjects: ['russian fiction', 'russia'], originalYear: 1870, ...extra });
const library = [
  jp('The Woman in the Dunes', 'Kōbō Abe', { rating: 5 }), jp('The Box Man', 'Kōbō Abe'), jp('Snow Country', 'Yasunari Kawabata'), jp('The Sound of Waves', 'Yukio Mishima'),
  ru('Anna Karenina', 'Leo Tolstoy', { rating: 5 }), ru('War and Peace', 'Leo Tolstoy'), ru('Fathers and Sons', 'Ivan Turgenev'), ru('Dead Souls', 'Nikolai Gogol'),
];
const taste = findLanes(library, { now: T });
const jpLane = taste.lanes.find((l) => l.books.some((b) => b.title === 'Snow Country'));
const ruLane = taste.lanes.find((l) => l !== jpLane);

let w = 100;
const cand = (title, f = {}) => ({ work: `/works/OL${++w}W`, title, authors: [], year: null, pages: null, coverId: null, subjects: [], readers: 0, description: '', ...f });

describe('queries', () => {
  it('asks for a lane’s authors and subjects, each with a stable id', () => {
    const qs = laneQueries(jpLane);
    expect(qs.map((x) => x.q)).toContain('author:"Kōbō Abe"');
    expect(qs.some((x) => /^subject:"japan(ese fiction)?" AND subject:"japan(ese fiction)?"$/.test(x.q))).toBe(true);
    expect(new Set(qs.map((x) => x.id)).size).toBe(qs.length);
    expect(laneQueries(jpLane).map((x) => x.id)).toEqual(qs.map((x) => x.id));
  });

  it('builds paged search URLs that ask for subjects and descriptions', () => {
    const u = new URL(searchUrl({ q: 'author:"A"', sort: 'readinglog' }, 3));
    expect(u.origin + u.pathname).toBe('https://openlibrary.org/search.json');
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ q: 'author:"A"', sort: 'readinglog', page: '3', limit: '20' });
    expect(u.searchParams.get('fields')).toMatch(/subject.*description/);
    expect(workUrl('/works/OL1W')).toBe('https://openlibrary.org/works/OL1W.json');
  });

  it('takes the least-used query that still has results, page by page', () => {
    const qs = [{ id: 'a' }, { id: 'b' }];
    expect(nextQuery(qs, {}, [])).toEqual({ query: qs[0], page: 1 });
    expect(nextQuery(qs, { a: 2 }, [])).toEqual({ query: qs[1], page: 1 });
    expect(nextQuery(qs, { a: 2, b: 2 }, ['a'])).toEqual({ query: qs[1], page: 2 });
    expect(nextQuery(qs, {}, ['a', 'b'])).toBe(null);
  });
});

describe('parsing', () => {
  it('reads search results into cards, skipping study guides and malformed docs', () => {
    const json = { docs: [
      { key: '/works/OL1W', title: 'The Face of Another', author_name: ['Kōbō Abe'], first_publish_year: 1964, number_of_pages_median: 237, cover_i: 77, subject: ['Japanese fiction', 'Accessible book'], readinglog_count: 412, description: 'A man *loses* his face.' },
      { key: '/works/OL2W', title: 'SparkNotes: The Woman in the Dunes', author_name: ['SparkNotes'] },
      { key: '/books/OL3M', title: 'An edition, not a work' },
      { key: '/works/OL4W', title: '' },
    ] };
    expect(parseDeal(json)).toEqual([{ work: '/works/OL1W', title: 'The Face of Another', authors: ['Kōbō Abe'], year: 1964, pages: 237, coverId: 77, subjects: ['japanese fiction'], readers: 412, description: 'A man loses his face.' }]);
    expect(parseDeal(null)).toEqual([]);
  });

  it('cleans descriptions: links, source notes and long tails', () => {
    expect(cleanDescription('Read [this](https://x.org) now.\r\n\r\n([source][1])\n\n----------\nSee also: other')).toBe('Read this now.');
    expect(cleanDescription({ type: '/type/text', value: 'Hi.' })).toBe('Hi.');
    expect(cleanDescription('x'.repeat(3000))).toHaveLength(1501);
    expect(parseWorkDescription({ description: { value: 'A **novel**.' } })).toBe('A novel.');
    expect(parseWorkDescription({})).toBe('');
  });
});

describe('ranking a pool', () => {
  const ctx = { taste, books: library, swipes: [], deck: [], now: T };

  it('ranks by closeness to the lane and popularity, dropping what you have or turned down', () => {
    const near = cand('The Face of Another', { authors: ['Kōbō Abe'], subjects: ['japanese fiction', 'japan'], readers: 100 });
    const far = cand('A Russian Novel', { authors: ['Someone'], subjects: ['russian fiction'] });
    const mid = cand('Kitchen', { authors: ['Banana Yoshimoto'], subjects: ['japanese fiction'], readers: 5000 });
    const have = cand('Snow Country', { authors: ['Yasunari Kawabata'], subjects: ['japanese fiction'] });
    const no = cand('Turned Down', { authors: ['Kōbō Abe'], subjects: ['japanese fiction'] });
    const old = cand('Turned Down Long Ago', { authors: ['Kōbō Abe'], subjects: ['japanese fiction'] });
    const swipes = [
      { id: 's1', work: no.work, verdict: 'no', features: [], at: T, updatedAt: T },
      { id: 's2', work: old.work, verdict: 'no', features: [], at: T - YEAR - 1, updatedAt: T },
    ];
    const ranked = rankPool([far, mid, have, no, old, near, near], jpLane.centroid, { ...ctx, swipes });
    expect(ranked.map((r) => r.title)).toEqual(['The Face of Another', 'Turned Down Long Ago', 'Kitchen']);
    expect(ranked[0].why).toEqual([library[0].id, library[1].id]);
    expect(ranked[0].features).toEqual(expect.arrayContaining(['a:kobo abe', 's:japanese fiction', 's:japan']));
  });

  it('treats the same title and author as the same book (Open Library has duplicate works)', () => {
    const a = cand('The Face of Another', { authors: ['Kōbō Abe'], subjects: ['japanese fiction'] });
    const twin = { ...a, work: '/works/OL999999W' };
    expect(rankPool([a, twin], jpLane.centroid, ctx)).toHaveLength(1);
    const swipes = [{ id: 's', work: a.work, title: a.title, authors: a.authors, verdict: 'no', features: [], at: T, updatedAt: T }];
    expect(rankPool([twin], jpLane.centroid, { ...ctx, swipes })).toEqual([]);
    expect(rankPool([twin], jpLane.centroid, { ...ctx, deck: [a] })).toEqual([]);
  });

  it('pushes away what the reader has turned down before', () => {
    const a = cand('A', { authors: ['X'], subjects: ['japanese fiction', 'horror'] });
    const b = cand('B', { authors: ['Y'], subjects: ['japanese fiction', 'tea'] });
    const anti = findLanes([...library, book({ title: 'Bad', subjects: ['horror', 'gore'], rating: 1 })], { now: T });
    expect(rankPool([a, b], jpLane.centroid, ctx).map((r) => r.title)).toEqual(['A', 'B']);
    expect(rankPool([a, b], jpLane.centroid, { ...ctx, taste: anti }).map((r) => r.title)[0]).toBe('B');
  });
});

describe('dealing', () => {
  const pools = () => new Map([
    [jpLane.key, [1, 2, 3, 4, 5, 6].map((i) => cand(`JP ${i}`, { authors: ['Kōbō Abe'], subjects: ['japanese fiction'] }))],
    [ruLane.key, [1, 2, 3, 4, 5, 6].map((i) => cand(`RU ${i}`, { authors: ['Leo Tolstoy'], subjects: ['russian fiction'] }))],
    [WILDCARD, [1, 2, 3].map((i) => cand(`WILD ${i}`, { authors: ['Z'], subjects: ['japan'] }))],
  ]);
  const ctx = (over = {}) => ({ taste, books: library, swipes: [], deck: [], now: T, rng: rng(5), ...over });

  it('deals from every lane without repeats, labelling each card with its lane', () => {
    const cards = deal(pools(), 10, ctx());
    expect(cards).toHaveLength(10);
    expect(new Set(cards.map((c) => c.work)).size).toBe(10);
    expect(cards.some((c) => c.title.startsWith('JP')) && cards.some((c) => c.title.startsWith('RU'))).toBe(true);
    expect(cards.find((c) => c.title.startsWith('JP')).lane).toEqual({ key: jpLane.key, label: jpLane.label });
  });

  it('mixes in the odd wildcard', () => {
    const cards = deal(pools(), 15, ctx());
    const wild = cards.filter((c) => c.lane.key === WILDCARD);
    expect(wild.length).toBeGreaterThan(0);
    expect(wild.length).toBeLessThanOrEqual(3);
    expect(wild[0].lane.label).toBe('Wildcard');
  });

  it('favours lanes the reader keeps saying yes to', () => {
    const keen = { ...taste, lanes: taste.lanes.map((l) => (l === jpLane ? { ...l, yes: 20, no: 0 } : { ...l, yes: 0, no: 20 })) };
    const cards = deal(pools(), 8, ctx({ taste: keen }));
    expect(cards.filter((c) => c.title.startsWith('JP')).length).toBeGreaterThan(cards.filter((c) => c.title.startsWith('RU')).length);
  });

  it('never deals from a muted lane, and stops when the pools run dry', () => {
    const muted = { ...taste, lanes: taste.lanes.map((l) => (l === ruLane ? { ...l, muted: true } : l)) };
    const cards = deal(pools(), 30, ctx({ taste: muted }));
    expect(cards.some((c) => c.title.startsWith('RU'))).toBe(false);
    expect(cards.length).toBe(9);
  });

  it('skips what is already in the deck', () => {
    const p = pools();
    const deck = p.get(jpLane.key).slice(0, 6);
    expect(deal(p, 30, ctx({ deck })).some((c) => c.title.startsWith('JP'))).toBe(false);
  });
});

describe('cards to books', () => {
  it('keeps what Open Library said, subjects included', () => {
    const c = { ...cand('The Face of Another', { authors: ['Kōbō Abe'], year: 1964, pages: 237, coverId: 77, subjects: ['japanese fiction'] }), lane: { key: 'x', label: 'X' }, why: [], features: [] };
    expect(cardToBook(c, T)).toEqual({ title: 'The Face of Another', authors: ['Kōbō Abe'], olWork: c.work, originalYear: 1964, pages: 237, coverId: 77, subjects: ['japanese fiction'], subjectsAt: T, source: 'openlibrary' });
  });
});

describe('editions and translations are one book', () => {
  it('reduces a title to its core: no subtitle, edition, imprint, volume or leading article', () => {
    expect(['Crime and Punishment (Penguin Classics)', 'Crime and Punishment: A Novel in Six Parts with an Epilogue', 'Crime & Punishment', 'CRIME AND PUNISHMENT [Unabridged]', 'Crime and Punishment, Wordsworth Classics Edition']
      .map(titleCore)).toEqual(['crime and punishment', 'crime and punishment', 'crime and punishment', 'crime and punishment', 'crime and punishment']);
    expect(['1Q84 Book 1', '1Q84, Vol. 2', '1Q84: Books 1 and 2', 'The Brothers Karamazov - A Novel', 'Kafka on the Shore: A Novel', 'Der Prozess', 'Anna Karenina (Modern Library Classics)', 'The Odyssey (annotated edition)']
      .map(titleCore)).toEqual(['1q84', '1q84', '1q84', 'brothers karamazov', 'kafka on shore', 'prozess', 'anna karenina', 'odyssey']);
    expect(titleCore('Catch-22')).toBe('catch 22');
    expect(titleCore('Notes from the Underground')).toBe(titleCore('Notes from Underground'));
    expect(titleCore('The Lord of the Rings')).toBe('lord of rings');
    expect(titleCore('The Complete Stories')).toBe('complete stories');
  });

  it('matches authors across spellings, name order and initials, but not namesakes', () => {
    expect(authorsMatch(['Fyodor Dostoevsky'], ['Fyodor Dostoyevsky'])).toBe(true);
    expect(authorsMatch(['Fyodor Dostoevsky'], ['Fiodor Dostoïevski'])).toBe(true);
    expect(authorsMatch(['Haruki Murakami'], ['Murakami Haruki'])).toBe(true);
    expect(authorsMatch(['F. M. Dostoevsky'], ['Fyodor Dostoevsky'])).toBe(true);
    expect(authorsMatch(['Leo Tolstoy'], ['Lev Nikolayevich Tolstoy'])).toBe(true);
    expect(authorsMatch(['Constance Garnett', 'Fyodor Dostoevsky'], ['Fyodor Dostoyevsky'])).toBe(true);
    expect(authorsMatch(['Brian Herbert', 'Kevin J. Anderson'], ['Frank Herbert'])).toBe(false);
    expect(authorsMatch(['Homer'], ['Homer'])).toBe(true);
    expect(authorsMatch(['Homer'], ['Virgil'])).toBe(false);
  });

  it('keeps one card per book, the version most people have read', () => {
    const pool = [
      cand('Crime and Punishment (Penguin Classics)', { authors: ['Fyodor Dostoyevsky'], subjects: ['russian fiction'], readers: 40 }),
      cand('Crime and Punishment', { authors: ['Fyodor Dostoevsky'], subjects: ['russian fiction'], readers: 9000 }),
      cand('Crime & Punishment', { authors: ['Fiodor Dostoïevski'], subjects: ['russian fiction'], readers: 3 }),
    ];
    const ranked = rankPool(pool, ruLane.centroid, { taste, books: library, now: T });
    expect(ranked.map((r) => [r.title, r.readers])).toEqual([['Crime and Punishment', 9000]]);
  });

  it('leaves out other editions of books in the library, the deck, or swiped on', () => {
    const ctx = { taste, books: library, now: T };
    expect(rankPool([cand('Anna Karenina (Modern Library Classics)', { authors: ['Lev Tolstoy'], subjects: ['russian fiction'] })], ruLane.centroid, ctx)).toEqual([]);
    const swipes = [{ id: 's', work: '/works/OL5W', title: '1Q84', authors: ['Haruki Murakami'], verdict: 'no', features: [], at: T, updatedAt: T }];
    expect(rankPool([cand('1Q84 Book 1', { authors: ['Murakami Haruki'], subjects: ['japanese fiction'] })], jpLane.centroid, { ...ctx, swipes })).toEqual([]);
    const deck = [{ ...cand('Kafka on the Shore', { authors: ['Haruki Murakami'] }), lane: { key: 'x', label: 'X' } }];
    expect(rankPool([cand('Kafka on the Shore: A Novel', { authors: ['Haruki Murakami'], subjects: ['japanese fiction'] })], jpLane.centroid, { ...ctx, deck })).toEqual([]);
    expect(rankPool([cand('Dune: House Atreides', { authors: ['Brian Herbert'], subjects: ['japanese fiction'] })], jpLane.centroid, { ...ctx, books: [...library, book({ title: 'Dune', authors: ['Frank Herbert'] })] })).toHaveLength(1);
  });

  it('never deals two editions in one deal, even from different lanes', () => {
    const pools = new Map([
      [jpLane.key, [cand('The Sound of Waves (Vintage International)', { authors: ['Yukio Mishima'], subjects: ['japanese fiction'] })]],
      [ruLane.key, [cand('The Sound of Waves', { authors: ['Mishima Yukio'], subjects: ['russian fiction', 'japanese fiction'] })]],
    ]);
    const lib = library.filter((b) => b.title !== 'The Sound of Waves');
    expect(deal(pools, 5, { taste, books: lib, swipes: [], deck: [], now: T, rng: rng(2) })).toHaveLength(1);
  });

  it('drops works that exist only in other languages, or have no title in Latin script', () => {
    const json = { docs: [
      { key: '/works/OL1W', title: 'Kafka en la orilla', author_name: ['Haruki Murakami'], language: ['spa'] },
      { key: '/works/OL2W', title: 'Kafka on the Shore', author_name: ['Haruki Murakami'], language: ['eng', 'spa', 'jpn'] },
      { key: '/works/OL3W', title: '海辺のカフカ', author_name: ['村上春樹'] },
      { key: '/works/OL4W', title: 'Old Undated Record', author_name: ['Someone'] },
    ] };
    expect(parseDeal(json).map((c) => c.title)).toEqual(['Kafka on the Shore', 'Old Undated Record']);
    expect(new URL(searchUrl({ q: 'x', sort: 'rating' })).searchParams.get('fields')).toContain('language');
  });

  it('drops duplicates already sitting in a saved deck', () => {
    const a = { ...cand('Kitchen', { authors: ['Banana Yoshimoto'] }), lane: { key: 'x', label: 'X' } };
    const b = { ...cand('Kitchen (Faber)', { authors: ['Yoshimoto Banana'] }), lane: { key: 'x', label: 'X' } };
    expect(stillFresh([a, b], { books: [], swipes: [], now: T })).toEqual([a]);
  });
});
