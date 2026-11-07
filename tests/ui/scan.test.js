// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mount, fakeFetch } from './helpers.js';

const FOX = { docs: [{ key: '/works/F', title: 'Fantastic Mr Fox', author_name: ['Roald Dahl'], cover_i: 1 }] };
const DUNE = { docs: [{ key: '/works/D', title: 'Dune', author_name: ['Frank Herbert'], cover_i: 2 }] };

// A fake camera: scanning "finds" the given barcodes, then the person taps Done.
const camera = (codes) => ({ openScanner: async ({ onDone }) => onDone(codes) });

describe('scanning barcodes', () => {
  it('hides the scan button when there is no camera', async () => {
    const t = await mount({ env: { camera: false } });
    t.tab('add');
    expect(t.$('button.scan')).toBe(null);
  });

  it('one book: searches its ISBN', async () => {
    const fetch = fakeFetch([['isbn=9780140328721', FOX]]);
    const t = await mount({ fetch, env: { camera: true }, ...camera(['9780140328721']) });
    t.tab('add');
    t.$('button.scan').click();
    await t.tick(6);
    expect(t.$('input.add-search').value).toBe('9780140328721');
    expect(t.$('.results .result .r-title').textContent).toBe('Fantastic Mr Fox');
  });

  it('several books: looks each up as a list to add together', async () => {
    const fetch = fakeFetch([['isbn=9780140328721', FOX], ['isbn=9780441013593', DUNE]]);
    const t = await mount({ fetch, env: { camera: true }, ...camera(['9780140328721', '9780441013593']) });
    t.tab('add');
    t.$('button.scan').click();
    await t.tick(12);
    expect(t.$$('.batch .batch-row')).toHaveLength(2);
    t.$('button.add-batch').click();
    expect(t.live().map((b) => b.title).sort()).toEqual(['Dune', 'Fantastic Mr Fox']);
  });

  it('offline: saves every scanned ISBN for later', async () => {
    const t = await mount({ online: false, env: { camera: true }, ...camera(['9780140328721', '9780441013593']) });
    t.tab('add');
    t.$('button.scan').click();
    await t.tick(6);
    expect(t.live().map((b) => b.isbn13).sort()).toEqual(['9780140328721', '9780441013593']);
    expect(t.live().every((b) => b.needsLookup)).toBe(true);
    expect(t.$('.toast').textContent).toMatch(/Saved 2 books/);
  });

  it('skips books already in the library when saving for later', async () => {
    const t = await mount({ online: false, env: { camera: true }, ...camera(['9780140328721', '9780140328721']) });
    t.tab('add');
    t.$('button.scan').click();
    await t.tick(6);
    expect(t.live()).toHaveLength(1);
  });
});
