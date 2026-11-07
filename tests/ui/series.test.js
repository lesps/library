// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mount, book, fakeFetch } from './helpers.js';

const sparql = (u) => (u.includes('query.wikidata.org') ? new URL(u).searchParams.get('query') : '');
const isFind = (u) => sparql(u).includes('ps:P179 ?series');
const isMembers = (u) => sparql(u).includes('ps:P179 wd:');
const Q = (id) => ({ value: `http://www.wikidata.org/entity/${id}` });
const FOUND = { results: { bindings: [{ series: Q('Q1057386'), seriesLabel: { value: 'The Stormlight Archive' }, ord: { value: '1' } }] } };
const member = (id, title, ord, year, ol) => ({
  book: Q(id), bookLabel: { value: title }, authorLabel: { value: 'Brandon Sanderson' },
  ...(ord ? { ord: { value: ord } } : {}), ...(year ? { date: { value: `${year}-01-01T00:00:00Z` } } : {}), ...(ol ? { ol: { value: ol } } : {}),
});
const MEMBERS = { results: { bindings: [
  member('Q1', 'The Way of Kings', '1', 2010, 'OL15358691W'),
  member('Q2', 'Words of Radiance', '2', 2014),
  member('Q3', 'Oathbringer', '3', 2017),
  member('Q25', 'Edgedancer', '2.5', 2016),
  member('Q9', 'Stormlight Companion', '', 2020),
] } };
const wikidata = (extra = []) => fakeFetch([...extra, [isFind, FOUND], [isMembers, MEMBERS]]);

const stormlight = () => [
  book({ title: 'The Way of Kings', authors: ['Brandon Sanderson'], seriesName: 'The Stormlight Archive', seriesNumber: '1', status: 'read', finished: '2025-01-02', olWork: '/works/OL15358691W' }),
  book({ title: 'Mort', authors: ['Terry Pratchett'], seriesName: 'Discworld', seriesNumber: '4' }),
  book({ title: 'Emma', authors: ['Jane Austen'] }),
];

describe('series on the book page', () => {
  it('names the series and opens it', async () => {
    const t = await mount({ books: stormlight() });
    t.app.actions.go(`/book/${t.live()[0].id}`);
    expect(t.$('.book-detail .series-link').textContent).toBe('The Stormlight Archive #1');
    t.$('.book-detail .series-link').click();
    expect(t.$('main').dataset.view).toBe('series');
    expect(t.$('.series-view h1').textContent).toBe('The Stormlight Archive');
  });

  it('sets the series in Edit details', async () => {
    const t = await mount({ books: stormlight() });
    const emma = t.live().find((b) => b.title === 'Emma');
    t.app.actions.go(`/book/${emma.id}`);
    expect(t.$('.book-detail .series-link')).toBe(null);
    t.$('button.edit-details').click();
    t.type('dialog [name="seriesName"]', 'Austen novels');
    t.type('dialog [name="seriesNumber"]', '4');
    t.button('Save', t.$('dialog')).click();
    expect(t.live().find((b) => b.id === emma.id)).toMatchObject({ seriesName: 'Austen novels', seriesNumber: '4' });
  });

  it('fills in the series with the details from the web', async () => {
    const t = await mount({ books: [book({ title: 'Words of Radiance', authors: ['Brandon Sanderson'] })], fetch: wikidata([[isFind, { results: { bindings: [{ series: Q('Q1057386'), seriesLabel: { value: 'The Stormlight Archive' }, ord: { value: '2' } }] } }]]) });
    t.app.actions.go(`/book/${t.live()[0].id}`);
    t.$('button.refresh').click();
    await t.tick(8);
    expect(t.live()[0]).toMatchObject({ seriesName: 'The Stormlight Archive', seriesNumber: '2' });
    expect(t.$('.toast').textContent).toMatch(/The Stormlight Archive/);
  });
});

describe('the Collections tab', () => {
  it('lists series after collections, with how many books of each you have', async () => {
    const t = await mount({ books: stormlight() });
    t.tab('collections');
    expect(t.$$('.series-list .name').map((e) => e.textContent)).toEqual(['Discworld', 'The Stormlight Archive']);
    expect(t.$$('.series-list .count')[1].textContent).toBe('1 book');
    t.$$('.series-list .open')[1].click();
    expect(t.$('main').dataset.view).toBe('series');
    expect(t.$('.tabs [aria-current="page"]').dataset.view).toBe('collections');
  });
});

describe('the series page', () => {
  it('lists the series’ books in order', async () => {
    const books = [...stormlight(), book({ title: 'Oathbringer', seriesName: 'the stormlight archive', seriesNumber: '3', status: 'want' })];
    const t = await mount({ books });
    t.app.actions.go('/series/The Stormlight Archive');
    expect(t.$$('.series-books .sb-title').map((e) => e.textContent)).toEqual(['The Way of Kings', 'Oathbringer']);
    expect(t.$$('.series-books .sb-number').map((e) => e.textContent)).toEqual(['1', '3']);
    t.$$('.series-books .sb-open')[1].click();
    expect(t.$('.book-detail h1').textContent).toBe('Oathbringer');
  });

  it('finds the rest on Wikidata and adds the chosen ones to the end of the queue, in order', async () => {
    const fetch = wikidata();
    const queued = book({ title: 'Dune', status: 'want', queueRank: 'm' });
    const t = await mount({ books: [...stormlight(), queued], fetch });
    t.app.actions.go('/series/The Stormlight Archive');
    t.$('button.find-rest').click();
    await t.tick(8);
    expect(sparql(fetch.calls[0])).toContain('wdt:P648 "OL15358691W"');
    // One shelf: the book you have, and the gaps you can fill, in series order.
    const rows = t.$$('.series-books li');
    expect(rows.map((r) => r.querySelector('.sb-title').textContent)).toEqual(['The Way of Kings', 'Words of Radiance', 'Edgedancer', 'Oathbringer', 'Stormlight Companion']);
    expect(rows.map((r) => r.classList.contains('missing'))).toEqual([false, true, true, true, true]);
    expect(rows.slice(1).map((r) => r.querySelector('input').checked)).toEqual([true, true, true, false]);
    t.change(rows[2].querySelector('input'), false);
    t.$('button.add-rest').click();
    const added = t.live().filter((b) => b.source === 'wikidata');
    expect(added.map((b) => [b.title, b.seriesNumber, b.status])).toEqual([['Words of Radiance', '2', 'want'], ['Oathbringer', '3', 'want']]);
    expect(added[0]).toMatchObject({ seriesName: 'The Stormlight Archive', authors: ['Brandon Sanderson'], originalYear: 2014 });
    expect(added[0].queueRank > 'm' && added[1].queueRank > added[0].queueRank).toBe(true);
    expect(t.$('.toast').textContent).toMatch(/Added 2 books to Want to read/);
    expect(t.$$('.series-books li:not(.missing)')).toHaveLength(3);
    expect(t.$$('.series-books li.missing .sb-title').map((e) => e.textContent)).toEqual(['Edgedancer', 'Stormlight Companion']);
    t.button('Undo', t.$('.toast')).click();
    expect(t.live().filter((b) => b.source === 'wikidata')).toEqual([]);
  });

  it('gives books it recognises in the library their place in the series', async () => {
    const t = await mount({ books: [...stormlight(), book({ title: 'Words of Radiance', authors: ['Brandon Sanderson'] })], fetch: wikidata() });
    t.app.actions.go('/series/The Stormlight Archive');
    t.$('button.find-rest').click();
    await t.tick(8);
    expect(t.$$('.series-books li:not(.missing) .sb-title').map((e) => e.textContent)).toEqual(['The Way of Kings', 'Words of Radiance']);
    expect(t.$$('.series-books li:not(.missing) .sb-number').map((e) => e.textContent)).toEqual(['1', '2']);
    t.$('button.add-rest').click();
    expect(t.live().find((b) => b.title === 'Words of Radiance' && b.source !== 'wikidata')).toMatchObject({ seriesName: 'The Stormlight Archive', seriesNumber: '2' });
  });

  it('says when Wikidata doesn’t know the series', async () => {
    const t = await mount({ books: stormlight(), fetch: fakeFetch([[isFind, { results: { bindings: [] } }]]) });
    t.app.actions.go('/series/Discworld');
    t.$('button.find-rest').click();
    await t.tick(8);
    expect(t.$('.rest .none').textContent).toMatch(/Wikidata/);
  });

  it('needs the internet to find the rest', async () => {
    const t = await mount({ books: stormlight(), online: false });
    t.app.actions.go('/series/Discworld');
    expect(t.$('button.find-rest').disabled).toBe(true);
  });

  it('handles a series that no longer has any books', async () => {
    const t = await mount({ books: stormlight() });
    t.app.actions.go('/series/Nothing here');
    expect(t.$('.series-view .empty')).toBeTruthy();
  });
});

describe('adding a book that starts a series', () => {
  it('looks up its series after adding, and offers the rest', async () => {
    const OL = { docs: [{ key: '/works/OL15358691W', title: 'The Way of Kings', author_name: ['Brandon Sanderson'], cover_i: 1 }] };
    const fetch = wikidata([['q=way+of+kings', OL]]);
    const t = await mount({ fetch });
    t.tab('add');
    t.type('input.add-search', 'way of kings');
    t.$('button.do-search').click();
    await t.tick();
    t.$('.results .add-result').click();
    await t.tick(8);
    expect(t.live()[0]).toMatchObject({ seriesName: 'The Stormlight Archive', seriesNumber: '1' });
    const link = t.$('.results .result .r-series');
    expect(link.textContent).toMatch(/The Stormlight Archive #1/);
    link.click();
    expect(t.$('main').dataset.view).toBe('series');
    await t.tick(8);
    expect(t.$$('.series-books li')).toHaveLength(5);
    expect(fetch.calls.filter(isFind)).toHaveLength(1);
  });
});
