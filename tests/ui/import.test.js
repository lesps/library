// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { mount } from './helpers.js';

const fixture = readFileSync('tests/fixtures/goodreads.csv', 'utf8');

describe('Goodreads import', () => {
  it('previews, then imports with a safety copy first', async () => {
    const t = await mount();
    t.button('Import from Goodreads').click();
    expect(t.$('main').dataset.view).toBe('import');
    await t.pickFile('input.gr-file', 'goodreads_library_export.csv', fixture);
    expect(t.$('.import-preview').textContent).toMatch(/5 new books/);
    expect(t.$('.import-preview').textContent).toMatch(/3 new collections/);
    t.$('button.do-import').click();
    await t.tick(8);
    expect(t.live()).toHaveLength(5);
    expect(t.$('.import-done').textContent).toMatch(/Imported 5 books/);
    expect((await t.store.listSnapshots()).map((s) => s.reason)).toContain('import');
    await t.app.actions.flush();
    expect((await t.stored()).books).toHaveLength(5);
  });

  it('explains a wrong file', async () => {
    const t = await mount();
    t.app.actions.go('/import');
    await t.pickFile('input.gr-file', 'x.csv', 'Title,Author\nDune,Herbert\n');
    expect(t.$('.import-error').textContent).toMatch(/Goodreads export/);
    expect(t.$('button.do-import')).toBe(null);
  });

  it('a second import of the same file finds nothing new', async () => {
    const t = await mount();
    t.app.actions.go('/import');
    await t.pickFile('input.gr-file', 'a.csv', fixture);
    t.$('button.do-import').click();
    await t.tick(8);
    t.app.actions.go('/import');
    await t.pickFile('input.gr-file', 'a.csv', fixture);
    expect(t.$('.import-preview').textContent).toMatch(/Nothing new/);
  });
});
