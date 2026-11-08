// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mount, book, fakeFetch } from './helpers.js';

const library = () => [
  book({ title: 'Has pages', pages: 200, status: 'read', finished: '2026-03-01' }),
  book({ title: 'Wanted', status: 'want' }),
  book({ title: 'Read one', status: 'read', finished: '2026-05-01' }),
  book({ title: 'Gone', status: 'read', deleted: true }),
];
const titles = (t) => t.$$('.pages-view .pb-title').map((e) => e.textContent);

describe('missing page counts', () => {
  it('lists books with no page count, read ones first, and takes one typed in', async () => {
    const t = await mount({ books: library() });
    t.app.actions.go('/pages');
    expect(titles(t)).toEqual(['Read one', 'Wanted']);
    const input = t.$$('.pages-view li').find((li) => li.textContent.includes('Read one')).querySelector('input');
    t.change(input, '312');
    expect(t.live().find((b) => b.title === 'Read one').pages).toBe(312);
    expect(titles(t)).toEqual(['Wanted']);
  });

  it('looks them all up, Open Library first and then Google Books, and marks the ones not found', async () => {
    const fetch = fakeFetch([
      ['openlibrary.org/search.json?q=read+one', { docs: [{ key: '/works/OL1W', title: 'Read one', number_of_pages_median: 288 }] }],
      ['openlibrary.org/search.json?q=wanted', { docs: [{ key: '/works/OL2W', title: 'Wanted' }] }],
      ['googleapis.com', { items: [] }],
    ]);
    const t = await mount({ books: library(), fetch });
    t.app.actions.go('/pages');
    t.$('button.look-up-pages').click();
    await t.tick(60);
    expect(t.live().find((b) => b.title === 'Read one').pages).toBe(288);
    expect(fetch.calls.some((u) => u.includes('googleapis.com') && u.includes('Wanted'))).toBe(true);
    expect(titles(t)).toEqual(['Wanted']);
    expect(t.$('.pages-view li .pb-missed').textContent).toMatch(/Not found online/);
  });

  it('needs the internet to look them up', async () => {
    const t = await mount({ books: library(), online: false });
    t.app.actions.go('/pages');
    expect(t.$('button.look-up-pages').disabled).toBe(true);
  });

  it('is linked from the stats page when a year has books without page counts, and from Settings', async () => {
    const t = await mount({ books: library() });
    t.app.actions.go('/stats');
    t.$('.stats-view .fill-pages').click();
    expect(t.$('main').dataset.view).toBe('pages');
    t.tab('settings');
    t.$$('.settings-view .row').find((r) => r.textContent.includes('Page counts')).click();
    expect(t.$('main').dataset.view).toBe('pages');
  });
});
