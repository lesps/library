// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { mount, book } from './helpers.js';

const library = () => [
  book({ title: 'Emma', status: 'read', finished: '2026-02-03', pages: 300, rating: 4 }),
  book({ title: 'Kindred', status: 'read', finished: '2026-02-20', pages: 260, rating: 5 }),
  book({ title: 'Circe', status: 'read', finished: '2026-09-10', pages: 400 }),
  book({ title: 'Beloved', status: 'read', finished: '2024-05-01', pages: 320 }),
  book({ title: 'Mystery', status: 'read' }),
];
const open = async (opts) => {
  const t = await mount({ books: library(), ...opts });
  t.app.actions.go('/stats');
  return t;
};

describe('stats page', () => {
  it('opens on this year with its totals', async () => {
    const t = await open();
    expect(t.$('.year-chips [aria-pressed="true"]').textContent).toBe('2026');
    const tiles = Object.fromEntries(t.$$('.kpi').map((k) => [k.querySelector('.kpi-label').textContent, k.querySelector('.kpi-value').textContent]));
    expect(tiles).toMatchObject({ Books: '3', Pages: '960', 'Average rating': '4.5', 'Average length': '320 pages' });
  });

  it('charts books by month, each column describing itself', async () => {
    const t = await open();
    const cols = t.$$('.by-month .col');
    expect(cols).toHaveLength(12);
    expect(cols[1].getAttribute('aria-label')).toBe('February 2026: 2 books, 560 pages');
    expect(cols[0].getAttribute('aria-label')).toBe('January 2026: no books');
  });

  it('lists the books finished that year, newest first', async () => {
    const t = await open();
    expect(t.$$('.finished-list .fl-title').map((e) => e.textContent)).toEqual(['Circe', 'Kindred', 'Emma']);
  });

  it('shows the first ten books of a big year, then all on request', async () => {
    const many = Array.from({ length: 14 }, (_, i) => book({ title: `B${i}`, status: 'read', finished: `2026-03-${String(i + 1).padStart(2, '0')}` }));
    const t = await mount({ books: many });
    t.app.actions.go('/stats');
    expect(t.$$('.finished-list .fl-title')).toHaveLength(10);
    t.button('Show all 14').click();
    expect(t.$$('.finished-list .fl-title')).toHaveLength(14);
  });

  it('names the longest and shortest books with their page counts', async () => {
    const t = await open();
    const [longest, shortest] = t.$$('.extremes .card');
    expect(longest.textContent).toMatch(/Circe.*400 pages/);
    expect(shortest.textContent).toMatch(/Kindred.*260 pages/);
  });

  it('puts the history chart right after the month chart', async () => {
    const t = await open();
    const order = t.$$('.stats-view > *').map((e) => e.className);
    expect(order.findIndex((c) => c.includes('by-year'))).toBe(order.findIndex((c) => c.includes('by-month')) + 1);
  });

  it('switches years from the chips or the history chart, including imported years', async () => {
    const t = await open();
    t.$$('.by-year .col').find((c) => c.dataset.key === '2024').click();
    expect(t.$('.year-chips [aria-pressed="true"]').textContent).toBe('2024');
    expect(t.$$('.finished-list .fl-title').map((e) => e.textContent)).toEqual(['Beloved']);
    t.$$('.year-chips button').find((b) => b.textContent === '2026').click();
    expect(t.$$('.finished-list .fl-title')).toHaveLength(3);
  });

  it('shows a past year’s goal as reached or missed', async () => {
    const t = await open({ data: { settings: { cats: 'lively', updatedAt: 1, goals: { 2024: { books: 5, pages: null } } } } });
    t.$$('.year-chips button').find((b) => b.textContent === '2024').click();
    expect(t.$('.goal-card .pace').textContent).toMatch(/Missed by 4 books/);
  });

  it('says which read books can’t be counted, and opens them to fix', async () => {
    const t = await open();
    expect(t.$('.undated summary').textContent).toMatch(/1 read book has no finish date/);
    t.$('.undated .ud-book').click();
    expect(t.$('main').dataset.view).toBe('book');
  });

  it('counts history from a Goodreads import', async () => {
    const t = await mount();
    t.app.actions.go('/import');
    await t.pickFile('input.gr-file', 'gr.csv', readFileSync('tests/fixtures/goodreads.csv', 'utf8'));
    t.$('button.do-import').click();
    await t.tick(8);
    t.app.actions.go('/stats');
    expect(t.$$('.by-year .col').map((c) => c.dataset.key)).toEqual(['2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026']);
    t.$$('.by-year .col').find((c) => c.dataset.key === '2023').click();
    expect(t.$$('.finished-list .fl-title').map((e) => e.textContent)).toEqual(['The Martian']);
  });
});
