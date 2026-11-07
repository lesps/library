// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mount, book, T0 } from './helpers.js';
import { exportData } from '../../src/lib/backup.js';
import { emptyData } from '../../src/lib/merge.js';
import { updateBook } from '../../src/lib/book.js';

const DAY = 86_400_000;

describe('backups', () => {
  it('exports a backup file and remembers when', async () => {
    const t = await mount({ books: [book({ title: 'Dune' })] });
    t.tab('settings');
    t.$('button.export-backup').click();
    await t.tick();
    expect(t.saved[0].name).toBe('catalog-2026-11-07.json');
    expect(JSON.parse(t.saved[0].text).books[0].title).toBe('Dune');
    expect(t.app.state().meta.lastExport).toBe(T0);
  });

  it('nudges for a backup when one is due, and the nudge exports', async () => {
    const t = await mount({ books: [book({ title: 'Dune' })] });
    expect(t.$('.backup-nudge')).toBeTruthy();
    t.$('.backup-nudge button.export-backup').click();
    await t.tick();
    expect(t.saved).toHaveLength(1);
    expect(t.$('.backup-nudge')).toBe(null);
  });

  it('merges a backup file, with a safety copy first and a report after', async () => {
    const mine = book({ title: 'Dune' });
    const t = await mount({ books: [mine] });
    const theirs = { ...emptyData(), books: [updateBook(mine, { rating: 5 }, T0 + 1000), book({ title: 'Emma' })] };
    t.tab('settings');
    await t.pickFile('input.import-backup', 'catalog.json', JSON.stringify(exportData(theirs, T0)));
    expect(t.$('dialog').textContent).toMatch(/1 new book, 1 updated/);
    t.$('.confirm-ok').click();
    await t.tick(8);
    expect(t.live().map((b) => b.title).sort()).toEqual(['Dune', 'Emma']);
    expect(t.live().find((b) => b.title === 'Dune').rating).toBe(5);
    expect((await t.store.listSnapshots()).map((s) => s.reason)).toContain('merge');
  });

  it('exports Goodreads CSV', async () => {
    const t = await mount({ books: [book({ title: 'Dune', status: 'read' })] });
    t.tab('settings');
    t.$('button.export-goodreads').click();
    await t.tick();
    expect(t.saved[0].name).toMatch(/\.csv$/);
    expect(t.saved[0].text).toMatch(/^Book Id,Title/);
  });
});

describe('safety copies', () => {
  it('takes a daily copy at launch when the library changed', async () => {
    const t = await mount({ books: [book({ title: 'Dune' })] });
    await t.tick(6);
    expect((await t.store.listSnapshots()).map((s) => s.reason)).toEqual(['daily']);
  });

  it('restores a copy, keeping a copy of the current state first', async () => {
    const t = await mount({ books: [book({ title: 'Dune' })] });
    await t.tick(6);
    t.clock.advance(DAY);
    t.app.actions.go('/library');
    t.$$('.shelf .book')[0].click();
    t.$('button.delete-book').click();
    expect(t.live()).toHaveLength(0);
    t.app.actions.go('/snapshots');
    await t.tick(6);
    const rows = t.$$('.snapshots .snap');
    expect(rows).toHaveLength(1);
    rows[0].querySelector('button.restore').click();
    t.$('.confirm-ok').click();
    await t.tick(10);
    expect(t.live().map((b) => b.title)).toEqual(['Dune']);
    expect((await t.store.listSnapshots()).map((s) => s.reason)).toContain('restore');
  });
});

describe('recently deleted', () => {
  it('lists deleted books and restores them', async () => {
    const gone = { ...book({ title: 'Gone' }), deleted: true };
    const t = await mount({ books: [gone, book({ title: 'Here' })] });
    t.app.actions.go('/deleted');
    expect(t.$$('.deleted-book .db-title').map((e) => e.textContent)).toEqual(['Gone']);
    t.$('.deleted-book button.restore-book').click();
    expect(t.live().map((b) => b.title).sort()).toEqual(['Gone', 'Here']);
  });
});

describe('settings', () => {
  it('changes how many cats there are', async () => {
    const t = await mount();
    t.tab('settings');
    t.change('input[name="cats"][value="off"]', true);
    expect(t.app.state().data.settings.cats).toBe('off');
    expect(document.querySelectorAll('.cat-layer .bg-cat')).toHaveLength(0);
    t.change('input[name="cats"][value="lively"]', true);
    expect(document.querySelectorAll('.cat-layer .bg-cat').length).toBeGreaterThan(0);
  });

  it('warns when changes are not being saved', async () => {
    const t = await mount({ books: [book({ title: 'Dune' })] });
    t.store.commit = async () => { throw new DOMException('full', 'QuotaExceededError'); };
    t.$$('.shelf .book')[0].click();
    t.$('.rating [data-rating="3"]').click();
    await t.tick(6);
    expect(t.$('.save-error').textContent).toMatch(/not being saved/i);
  });

  it('warns when storage is memory-only', async () => {
    const t = await mount();
    t.app.state().storageKind = 'memory';
    t.tab('settings');
    expect(t.$('.storage-warning')).toBeTruthy();
  });
});

describe('covers', () => {
  it('fetches missing covers in the background, one book at a time', async () => {
    const { fakeFetch } = await import('./helpers.js');
    const fetch = fakeFetch([['isbn=9780140328721', { docs: [{ key: '/works/F', cover_i: 99 }] }], ['title=Dune', { docs: [] }]]);
    const t = await mount({ fetch, books: [book({ title: 'Fox', isbn13: '9780140328721' }), book({ title: 'Dune' })] });
    await t.app.actions.runWorkers();
    const books = t.app.state().data.books;
    expect(books.find((b) => b.title === 'Fox').coverId).toBe(99);
    expect(books.find((b) => b.title === 'Dune').coverCheckedAt).toBe(T0);
    expect(fetch.calls).toHaveLength(2);
    await t.app.actions.runWorkers();
    expect(fetch.calls).toHaveLength(2);
  });

  it('fills a missing page count with the cover, never replacing one', async () => {
    const { fakeFetch } = await import('./helpers.js');
    const fetch = fakeFetch([['title=', { docs: [{ key: '/works/W', cover_i: 7, number_of_pages_median: 300 }] }]]);
    const t = await mount({ fetch, books: [book({ title: 'Oathbringer' }), book({ title: 'Kept', pages: 120 })] });
    await t.app.actions.runWorkers();
    expect(t.live().map((b) => [b.title, b.coverId, b.pages])).toEqual([['Oathbringer', 7, 300], ['Kept', 7, 120]]);
  });

  it('does not try while offline', async () => {
    const { fakeFetch } = await import('./helpers.js');
    const fetch = fakeFetch();
    const t = await mount({ fetch, online: false, books: [book({ title: 'Fox' })] });
    await t.app.actions.runWorkers();
    expect(fetch.calls).toHaveLength(0);
  });
});
