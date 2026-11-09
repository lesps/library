// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mount, book, fakeFetch, T0 } from './helpers.js';
import { createCollection } from '../../src/lib/records.js';

const q = (u) => (u.includes('openlibrary.org/search.json') ? new URL(u).searchParams.get('q') ?? '' : '');
let w = 1000;
const doc = (title, author, subjects, extra = {}) => ({ key: `/works/OL${++w}W`, title, author_name: [author], first_publish_year: 1965, number_of_pages_median: 240, cover_i: w, subject: subjects, readinglog_count: 50, ...extra });
const JP = () => ({ docs: [
  doc('The Face of Another', 'Kōbō Abe', ['Japanese fiction', 'Japan'], { description: 'A scientist, his face destroyed, makes a mask.' }),
  doc('Kitchen', 'Banana Yoshimoto', ['Japanese fiction', 'Japan']),
  doc('The Makioka Sisters', 'Jun’ichirō Tanizaki', ['Japanese fiction', 'Japan']),
  doc('Thousand Cranes', 'Yasunari Kawabata', ['Japanese fiction', 'Japan']),
] });
const RU = () => ({ docs: [
  doc('The Overcoat', 'Nikolai Gogol', ['Russian fiction', 'Russia']),
  doc('Oblomov', 'Ivan Goncharov', ['Russian fiction', 'Russia']),
  doc('Resurrection', 'Leo Tolstoy', ['Russian fiction', 'Russia']),
] });
const routes = (extra = []) => fakeFetch([
  ...extra,
  [(u) => /japan|abe|kawabata|mishima/i.test(q(u)), JP],
  [(u) => /russia|tolstoy|gogol|turgenev/i.test(q(u)), RU],
  [(u) => u.includes('/works/') && u.endsWith('.json'), { description: { value: 'Fetched description.' } }],
]);

const jp = (title, author, extra) => book({ title, authors: [author], subjects: ['japanese fiction', 'japan'], subjectsAt: T0, originalYear: 1960, status: 'read', ...extra });
const ru = (title, author, extra) => book({ title, authors: [author], subjects: ['russian fiction', 'russia'], subjectsAt: T0, originalYear: 1870, status: 'read', ...extra });
const library = () => [
  jp('The Woman in the Dunes', 'Kōbō Abe', { rating: 5 }), jp('The Box Man', 'Kōbō Abe'), jp('Snow Country', 'Yasunari Kawabata'), jp('The Sound of Waves', 'Yukio Mishima'),
  ru('Anna Karenina', 'Leo Tolstoy', { rating: 5 }), ru('War and Peace', 'Leo Tolstoy'), ru('Fathers and Sons', 'Ivan Turgenev'), ru('Dead Souls', 'Nikolai Gogol'),
  book({ title: 'Dune', status: 'want', queueRank: 'm' }),
];
const open = async (opts = {}) => {
  const t = await mount({ books: library(), fetch: routes(), ...opts });
  t.tab('add');
  t.$('.add-modes [data-mode="discover"]').click();
  await t.tick(12);
  return t;
};
const top = (t) => t.$('.deck .card.top');
const topTitle = (t) => top(t)?.querySelector('.dc-title').textContent;

describe('Discover', () => {
  it('lives on the Add tab, and deals cards from the reader’s lanes', async () => {
    const t = await open();
    expect(t.$('main').dataset.view).toBe('discover');
    expect(t.$('.tabs [aria-current="page"]').dataset.view).toBe('add');
    expect(top(t)).toBeTruthy();
    const titles = t.app.state().discover.deck.map((c) => c.title);
    expect(titles).toEqual(expect.arrayContaining(['The Face of Another', 'Resurrection']));
    expect(titles).not.toContain('Snow Country');
    expect(top(t).querySelector('.dc-lane').textContent).toBeTruthy();
    expect(t.$('.deck-foot').textContent).toMatch(/\d+ cards? left/);
  });

  it('asks Open Library at most once per lane, plus four, for a deal', async () => {
    const t = await mount({ books: library(), fetch: routes() });
    await t.tick(6);
    await t.app.actions.dealCards({ priority: 'user' });
    expect(t.fetch.calls.filter((u) => u.includes('search.json')).length).toBeLessThanOrEqual(2 + 4);
    expect(t.app.state().discover.deck.length).toBeGreaterThan(0);
  });

  it('deals one card per book, however many editions and translations Open Library returns', async () => {
    const editions = { docs: [
      doc('The Face of Another (Vintage International)', 'Kobo Abe', ['Japanese fiction', 'Japan'], { readinglog_count: 5 }),
      doc('The Face of Another', 'Kōbō Abe', ['Japanese fiction', 'Japan'], { readinglog_count: 900 }),
      doc('Tanin no kao', 'Abe Kōbō', ['Japanese fiction'], { language: ['jpn'] }),
      doc('The Box Man: A Novel', 'Kōbō Abe', ['Japanese fiction', 'Japan']),
    ] };
    const t = await open({ fetch: routes([[(u) => /japan|abe/i.test(q(u)), editions]]) });
    const deck = t.app.state().discover.deck.filter((c) => /Face|Tanin|Box Man/.test(c.title));
    expect(deck.map((c) => c.title)).toEqual(['The Face of Another']);
  });

  it('says why a card was dealt', async () => {
    const t = await open();
    while (topTitle(t) !== 'The Face of Another') t.$('.deck-actions .no').click();
    expect(top(t).querySelector('.dc-why').textContent).toMatch(/Because you liked The Woman in the Dunes and The Box Man/);
  });

  it('adds a right swipe to the end of the to-read queue, with its subjects, and Undo puts the card back', async () => {
    const t = await open();
    const title = topTitle(t);
    t.$('.deck-actions .want').click();
    const added = t.live().find((b) => b.title === title);
    expect(added).toMatchObject({ status: 'want', source: 'openlibrary' });
    expect(added.subjects.length).toBeGreaterThan(0);
    expect(added.queueRank > 'm').toBe(true);
    expect(t.app.state().data.swipes.find((s) => s.title === title)).toMatchObject({ verdict: 'want' });
    expect(topTitle(t)).not.toBe(title);
    expect(t.$('.toast').textContent).toMatch(/Want to read/);
    t.button('Undo', t.$('.toast')).click();
    expect(t.live().some((b) => b.title === title)).toBe(false);
    expect(topTitle(t)).toBe(title);
  });

  it('marks “Already read” with a read that has no date, so it doesn’t count toward this year', async () => {
    const t = await open();
    const title = topTitle(t);
    t.$('.deck-actions .read').click();
    const b = t.live().find((x) => x.title === title);
    expect(b.status).toBe('read');
    const reads = t.app.state().data.reads.filter((r) => r.bookId === b.id && !r.deleted);
    expect(reads).toHaveLength(1);
    expect(reads[0]).toMatchObject({ done: true, finished: '' });
  });

  it('remembers “not for me” and never deals that book again', async () => {
    const t = await open();
    const title = topTitle(t);
    t.$('.deck-actions .no').click();
    expect(t.app.state().data.swipes.find((s) => s.title === title)).toMatchObject({ verdict: 'no' });
    expect(t.live().some((b) => b.title === title)).toBe(false);
    t.app.state().discover.deck = [];
    await t.app.actions.dealCards({ priority: 'user' });
    expect(t.app.state().discover.deck.map((c) => c.title)).not.toContain(title);
  });

  it('works from the keyboard: → keep, ← pass, ↑ details', async () => {
    const t = await open();
    const first = topTitle(t);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(topTitle(t)).not.toBe(first);
    const second = topTitle(t);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(t.$('.card-details')).toBeTruthy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(t.$('.card-details')).toBe(null);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(t.live().some((b) => b.title === second)).toBe(true);
  });

  it('turns a card over for details: description, subjects, and the books it’s like', async () => {
    const t = await open();
    while (topTitle(t) !== 'The Face of Another') t.$('.deck-actions .no').click();
    t.$('.deck-actions .details').click();
    const d = t.$('.card-details');
    expect(d.querySelector('.cd-description').textContent).toMatch(/makes a mask/);
    expect(d.querySelectorAll('.cd-subjects .chip').length).toBeGreaterThan(0);
    d.querySelector('.cd-why button').click();
    expect(t.$('main').dataset.view).toBe('book');
    expect(t.$('.book-detail h1').textContent).toBe('The Woman in the Dunes');
  });

  it('fetches a description it didn’t get with the card, and counts a look at the details as interest', async () => {
    const t = await open();
    while (topTitle(t) !== 'Kitchen') t.$('.deck-actions .no').click();
    t.$('.deck-actions .details').click();
    await t.tick(6);
    expect(t.$('.card-details .cd-description').textContent).toBe('Fetched description.');
    t.$('.card-details .want').click();
    expect(t.app.state().data.swipes.find((s) => s.title === 'Kitchen').peeked).toBe(true);
  });

  it('deals more like the card on request, right after it', async () => {
    const more = { docs: [doc('Beauty and Sadness', 'Yasunari Kawabata', ['Japanese fiction', 'Japan']), doc('The Old Capital', 'Yasunari Kawabata', ['Japanese fiction', 'Japan'])] };
    let liking = false;
    const t = await open({ fetch: routes([[(u) => liking && /subject:|author:/.test(q(u)), more]]) });
    liking = true;
    while (topTitle(t) !== 'The Face of Another') t.$('.deck-actions .no').click();
    t.$('.deck-actions .details').click();
    t.$('.card-details .more-like').click();
    await t.tick(8);
    const deck = t.app.state().discover.deck.map((c) => c.title);
    expect(deck.slice(1, 3).sort()).toEqual(['Beauty and Sadness', 'The Old Capital']);
  });

  it('tops the deck up in the background when it runs low', async () => {
    const t = await open();
    const fetched = t.fetch.calls.length;
    while (t.app.state().discover.deck.length >= 10) t.$('.deck-actions .no').click();
    t.$('.deck-actions .no').click();
    await t.tick(10);
    expect(t.fetch.calls.length).toBeGreaterThan(fetched);
  });

  it('offers Deal more at the end, and says when it can’t without the internet', async () => {
    const t = await open();
    while (top(t)) t.$('.deck-actions .no').click();
    await t.tick(10);
    t.app.state().discover.deck = [];
    t.net.set(false);
    t.app.actions.go('/library');
    t.app.actions.go('/discover');
    expect(t.$('.discover-view').textContent).toMatch(/back online/i);
    expect(t.$('button.deal-more').disabled).toBe(true);
  });

  it('keeps the deck for offline swiping', async () => {
    const t = await open();
    const deck = t.app.state().discover.deck.map((c) => c.work);
    await t.app.actions.flush();
    const t2 = await mount({ store: t.store, online: false, fetch: routes() });
    t2.app.actions.go('/discover');
    expect(t2.app.state().discover.deck.map((c) => c.work)).toEqual(deck);
    expect(top(t2)).toBeTruthy();
  });

  it('needs a few books before it can recommend anything', async () => {
    const t = await mount({ books: [book({ title: 'Only one', status: 'read' })], fetch: routes() });
    t.app.actions.go('/discover');
    expect(t.$('.discover-empty')).toBeTruthy();
  });
});

describe('Your lanes', () => {
  it('lists each lane with its books, and mutes one so it isn’t dealt', async () => {
    const t = await open();
    t.$('.lanes-link').click();
    expect(t.$('main').dataset.view).toBe('lanes');
    const lanes = t.$$('.lane');
    expect(lanes).toHaveLength(2);
    const ru = lanes.find((l) => l.textContent.includes('Russian'));
    expect(ru.querySelector('.lane-count').textContent).toBe('4 books');
    ru.querySelector('.mute').click();
    const key = t.app.state().data.settings.mutedLanes[0];
    expect(key).toBeTruthy();
    expect(t.$$('.lane.muted')).toHaveLength(1);
    t.app.state().discover.deck = [];
    t.app.state().discover.pools.clear();
    await t.app.actions.dealCards({ priority: 'user' });
    expect(t.app.state().discover.deck.some((c) => c.lane.key === key)).toBe(false);
  });

  it('deals from one lane on request, to the front of the deck', async () => {
    const t = await open();
    t.app.actions.go('/lanes');
    t.$$('.lane').find((l) => l.textContent.includes('Russian')).querySelector('.deal-lane').click();
    await t.tick(8);
    expect(t.$('main').dataset.view).toBe('discover');
    expect(top(t).querySelector('.dc-lane').textContent).toMatch(/Russian/);
  });

  it('treats Goodreads shelves like Favorites as liking, not topics', async () => {
    const cs = [createCollection({ name: 'Favorites', rank: 'a' }, { now: T0, id: 'fav' })];
    const t = await mount({ books: library().map((b, i) => (i < 4 ? { ...b, collectionIds: ['fav'] } : b)), data: { collections: cs }, fetch: routes() });
    t.app.actions.go('/lanes');
    expect(t.$('.lanes-view').textContent).not.toMatch(/Favorites/);
  });
});

describe('Not interested', () => {
  const swiped = async () => {
    const t = await open();
    const a = topTitle(t);
    t.$('.deck-actions .no').click();
    const b = topTitle(t);
    t.$('.deck-actions .no').click();
    t.tab('settings');
    t.$$('.settings-view .row').find((r) => r.textContent.includes('Not interested')).click();
    return { t, a, b };
  };

  it('lists turned-down books, and restores one so it can turn up again', async () => {
    const { t, a, b } = await swiped();
    expect(t.$('main').dataset.view).toBe('dismissed');
    expect(t.$$('.dismissed-item .di-title').map((e) => e.textContent).sort()).toEqual([a, b].sort());
    t.$$('.dismissed-item').find((e) => e.textContent.includes(a)).querySelector('.restore').click();
    expect(t.$$('.dismissed-item')).toHaveLength(1);
    expect(t.app.state().data.swipes.find((s) => s.title === a).deleted).toBe(true);
  });

  it('clears them all after confirming, with a safety copy first and Undo', async () => {
    const { t } = await swiped();
    t.$('button.clear-dismissed').click();
    t.$('.confirm-ok').click();
    await t.tick(6);
    expect(t.$$('.dismissed-item')).toHaveLength(0);
    expect((await t.store.listSnapshots()).map((s) => s.reason)).toContain('dismissed');
    t.button('Undo', t.$('.toast')).click();
    expect(t.$$('.dismissed-item')).toHaveLength(2);
  });
});
