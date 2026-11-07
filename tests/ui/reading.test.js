// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mount, book } from './helpers.js';
import { createProgress } from '../../src/lib/records.js';

const library = () => [
  book({ title: 'Dune', status: 'reading', pages: 400 }),
  book({ title: 'Emma', status: 'read', finished: '2026-02-03', pages: 300 }),
  book({ title: 'Kindred', status: 'read', finished: '2026-09-10', pages: 260 }),
  book({ title: 'Beloved', status: 'read', finished: '2024-05-01', pages: 320 }),
  book({ title: 'One', status: 'want', queueRank: 'a' }),
  book({ title: 'Two', status: 'want', queueRank: 'b' }),
];

describe('reading tab', () => {
  it('replaces "To read" in the tab bar, with no extra tab', async () => {
    const t = await mount();
    expect(t.$$('.tabs button')).toHaveLength(5);
    expect(t.$('.tabs [data-view="reading"]').textContent).toBe('Reading');
  });

  it('shows books in progress with how far along they are', async () => {
    const books = library();
    const t = await mount({ books, data: { progress: [createProgress({ bookId: books[0].id, page: 100 }, { now: 1, id: 'p' })] } });
    t.tab('reading');
    const card = t.$('.now-reading .nr-book');
    expect(card.querySelector('.nr-title').textContent).toBe('Dune');
    expect(card.querySelector('.nr-pct').textContent).toBe('25%');
    card.click();
    expect(t.$('main').dataset.view).toBe('book');
  });

  it('keeps the to-read queue, as Up next', async () => {
    const t = await mount({ books: library() });
    t.tab('reading');
    expect(t.$('.up-next h2').textContent).toMatch(/Up next/);
    expect(t.$$('.queue .qitem .q-title').map((e) => e.textContent)).toEqual(['One', 'Two']);
  });

  it('without a goal: shows the year so far and offers to set one', async () => {
    const t = await mount({ books: library() });
    t.tab('reading');
    expect(t.$('.goal-card').textContent).toMatch(/2 books.*560 pages.*2026/);
    t.$('.goal-card button.set-goal').click();
    t.type('dialog [name="books"]', '24');
    t.type('dialog [name="pages"]', '8000');
    t.button('Save', t.$('dialog')).click();
    expect(t.app.state().data.settings.goals).toEqual({ 2026: { books: 24, pages: 8000 } });
  });

  it('with a goal: progress, what is left, and the pace', async () => {
    const t = await mount({ books: library(), data: { settings: { cats: 'lively', updatedAt: 1, goals: { 2026: { books: 24, pages: 8000 } } } } });
    t.tab('reading');
    const card = t.$('.goal-card');
    expect(card.querySelector('.goal-books .goal-figure').textContent).toBe('2 of 24 books');
    expect(card.querySelector('.goal-pages .goal-figure').textContent).toBe('560 of 8,000 pages');
    expect(card.querySelector('.goal-books .meter').getAttribute('aria-valuenow')).toBe('2');
    expect(card.querySelector('.pace').textContent).toMatch(/18 books behind pace · 22 to go/);
  });

  it('clearing both numbers removes the goal', async () => {
    const t = await mount({ books: library(), data: { settings: { cats: 'lively', updatedAt: 1, goals: { 2026: { books: 24, pages: null } } } } });
    t.tab('reading');
    t.$('.goal-card button.edit-goal').click();
    t.type('dialog [name="books"]', '');
    t.button('Save', t.$('dialog')).click();
    expect(t.app.state().data.settings.goals).toEqual({});
  });

  it('links to the stats page', async () => {
    const t = await mount({ books: library() });
    t.tab('reading');
    t.$('.goal-card .see-stats').click();
    expect(t.$('main').dataset.view).toBe('stats');
  });
});
