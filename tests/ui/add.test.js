// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mount, book, fakeFetch } from './helpers.js';

const OL_FOX = { docs: [{ key: '/works/OL45804W', title: 'Fantastic Mr Fox', author_name: ['Roald Dahl'], first_publish_year: 1970, cover_i: 6498519, number_of_pages_median: 96 }] };
const OL_DUNE = { docs: [
  { key: '/works/W1', title: 'Dune', author_name: ['Frank Herbert'], first_publish_year: 1965, cover_i: 11 },
  { key: '/works/W2', title: 'Dune Messiah', author_name: ['Frank Herbert'], first_publish_year: 1969, cover_i: 12 },
] };

describe('adding books', () => {
  it('searches by title and adds a result with the chosen status', async () => {
    const fetch = fakeFetch([['q=dune', OL_DUNE]]);
    const t = await mount({ fetch });
    t.tab('add');
    t.type('input.add-search', 'dune');
    t.$('button.do-search').click();
    await t.tick();
    expect(t.$$('.results .result .r-title').map((e) => e.textContent)).toEqual(['Dune', 'Dune Messiah']);
    t.change('select.add-status', 'reading');
    t.$$('.results .result')[0].querySelector('.add-result').click();
    const added = t.live()[0];
    expect(added).toMatchObject({ title: 'Dune', authors: ['Frank Herbert'], coverId: 11, status: 'reading', started: '2026-11-07', source: 'openlibrary' });
    expect(t.$$('.results .result')[0].classList.contains('in-library')).toBe(true);
  });

  it('searches by ISBN and keeps the ISBN', async () => {
    const fetch = fakeFetch([['isbn=9780140328721', OL_FOX]]);
    const t = await mount({ fetch });
    t.tab('add');
    t.type('input.add-search', '978-0-14-032872-1');
    t.$('button.do-search').click();
    await t.tick();
    t.$('.results .result .add-result').click();
    expect(t.live()[0]).toMatchObject({ title: 'Fantastic Mr Fox', isbn13: '9780140328721' });
  });

  it('falls back to Google Books when Open Library has nothing', async () => {
    const fetch = fakeFetch([['openlibrary.org', { docs: [] }], ['googleapis.com', { items: [{ volumeInfo: { title: 'Obscure', authors: ['A. Person'] } }] }]]);
    const t = await mount({ fetch });
    t.tab('add');
    t.type('input.add-search', 'obscure');
    t.$('button.do-search').click();
    await t.tick(6);
    expect(t.$('.results .result .r-title').textContent).toBe('Obscure');
  });

  it('marks results already in the library', async () => {
    const fetch = fakeFetch([['q=dune', OL_DUNE]]);
    const t = await mount({ fetch, books: [book({ title: 'Dune', authors: ['Frank Herbert'] })] });
    t.tab('add');
    t.type('input.add-search', 'dune');
    t.$('button.do-search').click();
    await t.tick();
    expect(t.$$('.results .result')[0].classList.contains('in-library')).toBe(true);
    expect(t.$$('.results .result')[1].classList.contains('in-library')).toBe(false);
  });

  it('adds by hand, prefilled from the search', async () => {
    const t = await mount({ fetch: fakeFetch([['openlibrary.org', { docs: [] }], ['googleapis.com', { items: [] }]]) });
    t.tab('add');
    t.type('input.add-search', 'My Zine');
    t.$('button.do-search').click();
    await t.tick(6);
    expect(t.$('.results .nothing')).toBeTruthy();
    t.$('button.manual').click();
    expect(t.$('dialog [name="title"]').value).toBe('My Zine');
    t.type('dialog [name="authors"]', 'Me');
    t.button('Add book', t.$('dialog')).click();
    expect(t.live()[0]).toMatchObject({ title: 'My Zine', authors: ['Me'], source: 'manual' });
  });

  it('a manual ISBN goes in the ISBN field, not the title', async () => {
    const t = await mount({ online: false });
    t.tab('add');
    t.type('input.add-search', '9780140328721');
    t.$('button.manual').click();
    expect(t.$('dialog [name="title"]').value).toBe('');
    expect(t.$('dialog [name="isbn"]').value).toBe('9780140328721');
  });

  it('offline: explains, offers manual add, and saves an ISBN for later', async () => {
    const t = await mount({ online: false });
    t.tab('add');
    expect(t.$('.offline-note').textContent).toMatch(/offline/i);
    expect(t.$('button.do-search').disabled).toBe(true);
    t.type('input.add-search', '0451526538');
    t.$('button.save-later').click();
    const b = t.live()[0];
    expect(b).toMatchObject({ needsLookup: true, isbn13: '9780451526533', title: '' });
    t.tab('library');
    expect(t.$('.shelf .book .title').textContent).toMatch(/978-0451526533/);
  });

  it('fills in saved ISBNs when back online', async () => {
    const fetch = fakeFetch([['isbn=9780140328721', OL_FOX]]);
    const t = await mount({ online: false, fetch });
    t.tab('add');
    t.type('input.add-search', '9780140328721');
    t.$('button.save-later').click();
    t.net.set(true);
    await t.app.actions.runWorkers();
    expect(t.live()[0]).toMatchObject({ title: 'Fantastic Mr Fox', needsLookup: false, coverId: 6498519 });
  });

  it('a failed network request switches to offline mode instead of erroring', async () => {
    const t = await mount({ fetch: fakeFetch([['openlibrary.org', new TypeError('Failed to fetch')]]) });
    t.tab('add');
    t.type('input.add-search', 'dune');
    t.$('button.do-search').click();
    await t.tick(6);
    expect(t.$('.offline-note')).toBeTruthy();
  });
});

describe('adding a pasted list', () => {
  it('looks up each line and adds the matches chosen', async () => {
    const fetch = fakeFetch([['isbn=9780140328721', OL_FOX], ['q=dune', OL_DUNE], ['q=nothing', { docs: [] }], ['googleapis', { items: [] }]]);
    const t = await mount({ fetch });
    t.tab('add');
    t.$('button.paste-open').click();
    t.type('textarea.paste-list', '9780140328721\nDune\n\nnothing here');
    t.$('button.lookup-all').click();
    await t.tick(12);
    const rows = t.$$('.batch .batch-row');
    expect(rows).toHaveLength(3);
    expect(rows[2].classList.contains('no-match')).toBe(true);
    t.$('button.add-batch').click();
    expect(t.live().map((b) => b.title).sort()).toEqual(['Dune', 'Fantastic Mr Fox']);
  });
});
