// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mount, book } from './helpers.js';

const library = () => [
  book({ title: 'Iliad', authors: ['Homer'], originalYear: -750, status: 'read', subjects: ['epic poetry'] }),
  book({ title: 'Aeneid', authors: ['Virgil'], originalYear: -19, status: 'read', subjects: ['epic poetry'] }),
  book({ title: 'Anna Karenina', authors: ['Leo Tolstoy'], originalYear: 1877, status: 'read', subjects: ['russian fiction'] }),
  book({ title: 'War and Peace', authors: ['Leo Tolstoy'], originalYear: 1869, status: 'read', subjects: ['russian fiction'] }),
  book({ title: 'Snow Country', authors: ['Yasunari Kawabata'], originalYear: 1948, status: 'read' }),
  book({ title: 'Kitchen', authors: ['Banana Yoshimoto'], originalYear: 1988, status: 'read' }),
  book({ title: 'Undated', authors: ['X'], status: 'read' }),
  book({ title: 'Resurrection', authors: ['Leo Tolstoy'], originalYear: 1899, status: 'want', subjects: ['russian fiction'] }),
];
const open = async () => {
  const t = await mount({ books: library() });
  t.app.actions.go('/stats');
  t.$('.explore-link').click();
  return t;
};
const listed = (t) => t.$$('.explore-books .eb-title').map((e) => e.textContent);

describe('Explore your reading', () => {
  it('opens from the stats page, under the Reading tab', async () => {
    const t = await open();
    expect(t.$('main').dataset.view).toBe('explore');
    expect(t.$('.tabs [aria-current="page"]').dataset.view).toBe('reading');
    expect(t.$('.explore-view h1').textContent).toBe('Explore your reading');
  });

  it('charts when the books were written by century, and lists a century’s books when tapped', async () => {
    const t = await open();
    const cols = t.$$('.by-century .col');
    expect(cols.map((c) => c.dataset.key)).toEqual(['ancient', 'medieval', '1500', '1600', '1700', '1800', '1900', '2000']);
    expect(cols[5].getAttribute('aria-label')).toBe('19th century: 2 books');
    cols[5].click();
    expect(listed(t)).toEqual(['War and Peace', 'Anna Karenina']);
    expect(t.$('.explore-books .eb-year').textContent).toBe('1869');
  });

  it('drills from a century into its decades', async () => {
    const t = await open();
    t.$$('.by-century .col').find((c) => c.dataset.key === '1900').click();
    expect(t.$$('.by-decade .col')).toHaveLength(10);
    t.$$('.by-decade .col').find((c) => c.dataset.key === '1980').click();
    expect(listed(t)).toEqual(['Kitchen']);
    t.$$('.by-decade .col').find((c) => c.dataset.key === '1980').click();
    expect(listed(t)).toEqual(['Snow Country', 'Kitchen']);
  });

  it('says how many books have no year', async () => {
    const t = await open();
    expect(t.$('.explore-view .no-year').textContent).toMatch(/1 book has no publication year/);
  });

  it('ranks themes and authors, and lists the books behind a bar', async () => {
    const t = await open();
    expect(t.$$('.themes .bar-name').map((e) => e.textContent)).toEqual(['epic poetry', 'russian fiction']);
    expect(t.$$('.themes .bar-row')[0].getAttribute('aria-label')).toBe('epic poetry: 2 books');
    t.$$('.themes .bar-row')[1].click();
    expect(t.$$('.themes .explore-books .eb-title').map((e) => e.textContent)).toEqual(['War and Peace', 'Anna Karenina']);
    expect(t.$$('.authors .bar-name').map((e) => e.textContent)).toEqual(['Leo Tolstoy']);
  });

  it('can take in the whole library, not just books read', async () => {
    const t = await open();
    t.button('Whole library').click();
    expect(t.$$('.authors .bar-value')[0].textContent).toBe('3');
    t.$$('.by-century .col').find((c) => c.dataset.key === '1800').click();
    expect(listed(t)).toEqual(['War and Peace', 'Anna Karenina', 'Resurrection']);
  });

  it('opens a book from a list', async () => {
    const t = await open();
    t.$$('.by-century .col')[0].click();
    t.$$('.explore-books .eb-open')[0].click();
    expect(t.$('.book-detail h1').textContent).toBe('Iliad');
  });
});
