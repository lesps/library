// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mount, book } from './helpers.js';
import { createCollection } from '../../src/lib/records.js';

const shelf = () => [
  book({ title: 'Dune', authors: ['Frank Herbert'], status: 'want', queueRank: 'b' }),
  book({ title: 'Emma', authors: ['Jane Austen'], status: 'read', rating: 4, collectionIds: ['c1'] }),
  book({ title: 'Anathem', authors: ['Neal Stephenson'], status: 'reading' }),
  book({ title: 'Persuasion', authors: ['Jane Austen'], status: 'want', queueRank: 'a', collectionIds: ['c1'] }),
];
const collections = [createCollection({ name: 'Classics', rank: 'i' }, { now: 1, id: 'c1' })];

describe('library', () => {
  it('shows every book, newest first, with counts per status', async () => {
    const t = await mount({ books: shelf(), data: { collections } });
    expect(t.$('main').dataset.view).toBe('library');
    expect(t.titles()).toEqual(['Persuasion', 'Anathem', 'Emma', 'Dune']);
    expect(t.$('.chips [data-status="want"] .count').textContent).toBe('2');
    expect(t.$('.chips [data-status="all"] .count').textContent).toBe('4');
  });

  it('greets an empty library with ways to start', async () => {
    const t = await mount();
    expect(t.$('.empty').textContent).toMatch(/empty/i);
    expect(t.button('Import from Goodreads')).toBeTruthy();
    expect(t.button('Add a book')).toBeTruthy();
  });

  it('filters by status, collection and search, together', async () => {
    const t = await mount({ books: shelf(), data: { collections } });
    t.$('.chips [data-status="want"]').click();
    expect(t.titles().sort()).toEqual(['Dune', 'Persuasion']);
    t.change('select.collection-filter', 'c1');
    expect(t.titles()).toEqual(['Persuasion']);
    t.$('.chips [data-status="all"]').click();
    t.type('input.search', 'austen');
    expect(t.titles().sort()).toEqual(['Emma', 'Persuasion']);
    t.type('input.search', 'zzz');
    expect(t.$('.no-results')).toBeTruthy();
  });

  it('keeps typing focus while the list filters', async () => {
    const t = await mount({ books: shelf() });
    t.$('input.search').focus();
    t.type('input.search', 'em');
    expect(document.activeElement).toBe(t.$('input.search'));
  });

  it('sorts and switches between grid and list, remembering both', async () => {
    const t = await mount({ books: shelf() });
    t.change('select.sort', 'title');
    expect(t.titles()).toEqual(['Anathem', 'Dune', 'Emma', 'Persuasion']);
    t.$('button.layout').click();
    expect(t.$('.shelf').classList.contains('list')).toBe(true);
    await t.app.actions.flush();
    const t2 = await mount({ store: t.store });
    expect(t2.$('.shelf').classList.contains('list')).toBe(true);
    expect(t2.titles()[0]).toBe('Anathem');
  });

  it('opens a book', async () => {
    const t = await mount({ books: shelf() });
    t.$$('.shelf .book').find((b) => b.textContent.includes('Emma')).click();
    expect(t.$('main').dataset.view).toBe('book');
    expect(t.$('.book-detail h1').textContent).toBe('Emma');
  });

  it('opens on a collection from the Collections tab', async () => {
    const t = await mount({ books: shelf(), data: { collections } });
    t.tab('collections');
    t.$('.collection[data-id="c1"] .open').click();
    expect(t.$('main').dataset.view).toBe('library');
    expect(t.titles().sort()).toEqual(['Emma', 'Persuasion']);
  });
});

describe('select mode and bulk actions', () => {
  const select = async (t, ...names) => {
    if (!t.$('.shelf.selecting')) t.$('button.select-mode').click();
    for (const name of names) t.$$('.shelf .book').find((b) => b.querySelector('.title').textContent === name).click();
  };

  it('selects with taps and selects everything in view', async () => {
    const t = await mount({ books: shelf() });
    await select(t, 'Dune', 'Emma');
    expect(t.$('.bulkbar .selected-count').textContent).toBe('2 selected');
    expect(t.$('main').dataset.view).toBe('library');
    t.type('input.search', 'austen');
    t.button('Select all 2').click();
    expect(t.$('.bulkbar .selected-count').textContent).toBe('3 selected');
  });

  it('selects a range with shift-click', async () => {
    const t = await mount({ books: shelf() });
    t.change('select.sort', 'title');
    await select(t, 'Anathem');
    const persuasion = t.$$('.shelf .book').find((b) => b.textContent.includes('Persuasion'));
    persuasion.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    expect(t.$('.bulkbar .selected-count').textContent).toBe('4 selected');
  });

  it('sets status in bulk, with undo', async () => {
    const t = await mount({ books: shelf() });
    await select(t, 'Dune', 'Persuasion');
    t.$('[data-bulk="status"]').click();
    t.$('.sheet [data-status="read"]').click();
    expect(t.live().filter((b) => b.status === 'read').map((b) => b.title).sort()).toEqual(['Dune', 'Emma', 'Persuasion']);
    expect(t.live().find((b) => b.title === 'Dune').finished).toBe('2026-11-07');
    expect(t.$('.toast').textContent).toMatch(/2 books.*Read/);
    t.button('Undo', t.$('.toast')).click();
    expect(t.live().find((b) => b.title === 'Dune').status).toBe('want');
    await t.app.actions.flush();
    expect((await t.stored()).books.find((b) => b.title === 'Dune').status).toBe('want');
  });

  it('adds selected books to a new collection', async () => {
    const t = await mount({ books: shelf() });
    await select(t, 'Dune', 'Anathem');
    t.$('[data-bulk="collection"]').click();
    t.button('New collection…', t.$('.sheet')).click();
    t.type('.prompt-input', 'Sci-fi');
    t.$('.prompt-ok').click();
    const c = t.app.state().data.collections.find((x) => x.name === 'Sci-fi');
    expect(c).toBeTruthy();
    expect(t.live().filter((b) => b.collectionIds.includes(c.id)).map((b) => b.title).sort()).toEqual(['Anathem', 'Dune']);
  });

  it('removes selected books from a collection', async () => {
    const t = await mount({ books: shelf(), data: { collections } });
    await select(t, 'Emma', 'Persuasion');
    t.$('[data-bulk="collection"]').click();
    t.button('Remove from Classics', t.$('.sheet')).click();
    expect(t.live().some((b) => b.collectionIds.includes('c1'))).toBe(false);
  });

  it('deletes after confirming, keeps a safety copy first, and can undo', async () => {
    const t = await mount({ books: shelf() });
    await select(t, 'Dune', 'Emma');
    t.$('[data-bulk="delete"]').click();
    t.$('.confirm-ok').click();
    await t.tick(6);
    expect(t.titles().sort()).toEqual(['Anathem', 'Persuasion']);
    expect(t.$('.bulkbar')).toBe(null);
    const snaps = await t.store.listSnapshots();
    expect(snaps.map((s) => s.reason)).toContain('delete');
    expect(snaps.find((s) => s.reason === 'delete').counts.books).toBe(4);
    t.button('Undo', t.$('.toast')).click();
    expect(t.titles()).toHaveLength(4);
  });

  it('leaves select mode with Done', async () => {
    const t = await mount({ books: shelf() });
    await select(t, 'Dune');
    t.button('Done').click();
    expect(t.$('.bulkbar')).toBe(null);
    t.$$('.shelf .book')[0].click();
    expect(t.$('main').dataset.view).toBe('book');
  });
});
