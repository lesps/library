// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mount, book } from './helpers.js';
import { createCollection } from '../../src/lib/records.js';

const cs = () => [
  createCollection({ name: 'Classics', rank: 'b' }, { now: 1, id: 'c1' }),
  createCollection({ name: 'Sci-fi', rank: 'c' }, { now: 1, id: 'c2' }),
];
const names = (t) => t.$$('.collections .collection .name').map((e) => e.textContent);

describe('collections tab', () => {
  it('lists collections in order with book counts', async () => {
    const t = await mount({ books: [book({ title: 'Emma', collectionIds: ['c1'] })], data: { collections: cs() } });
    t.tab('collections');
    expect(names(t)).toEqual(['Classics', 'Sci-fi']);
    expect(t.$('.collection[data-id="c1"] .count').textContent).toBe('1 book');
  });

  it('lists collections A–Z by default, in every list and picker', async () => {
    const mixed = [['z', 'Zen', 'a'], ['m', 'mystery', 'b'], ['a', 'Art', 'c'], ['n', 'Non-fiction 2', 'd'], ['n2', 'Non-fiction 10', 'e']]
      .map(([id, name, rank]) => createCollection({ name, rank }, { now: 1, id }));
    const emma = book({ title: 'Emma' });
    const t = await mount({ books: [emma], data: { collections: mixed } });
    const az = ['Art', 'mystery', 'Non-fiction 2', 'Non-fiction 10', 'Zen'];
    expect(t.$$('select.collection-filter option').map((o) => o.textContent).filter((x) => az.includes(x))).toEqual(az);
    t.tab('collections');
    expect(names(t)).toEqual(az);
    expect(t.$('.collection-order [aria-pressed="true"]').textContent).toBe('A–Z');
    t.app.actions.go(`/book/${emma.id}`);
    expect(t.$$('.collections-picker .chip').map((c) => c.textContent).filter((x) => az.includes(x))).toEqual(az);
  });

  it('keeps your own order under My order, where collections can be moved', async () => {
    const t = await mount({ data: { collections: [createCollection({ name: 'Zen', rank: 'a' }, { now: 1, id: 'z' }), ...cs()] } });
    t.tab('collections');
    t.$('.collection[data-id="c1"] .more').click();
    expect(t.button('Move down', t.$('.sheet'))).toBeUndefined();
    t.button('Cancel', t.$('.sheet'))?.click();
    t.button('My order').click();
    expect(names(t)).toEqual(['Zen', 'Classics', 'Sci-fi']);
    expect(t.app.state().data.settings.collectionOrder).toBe('custom');
    t.button('A–Z').click();
    expect(names(t)).toEqual(['Classics', 'Sci-fi', 'Zen']);
  });

  it('creates, renames, reorders and deletes', async () => {
    const t = await mount({ data: { collections: cs(), settings: { cats: 'lively', collectionOrder: 'custom', updatedAt: 1 } } });
    t.tab('collections');
    t.$('button.new-collection').click();
    t.type('.prompt-input', 'Cozy');
    t.$('.prompt-ok').click();
    expect(names(t)).toEqual(['Classics', 'Sci-fi', 'Cozy']);
    t.$('.collection[data-id="c1"] .more').click();
    t.button('Rename', t.$('.sheet')).click();
    t.type('.prompt-input', 'Old classics');
    t.$('.prompt-ok').click();
    expect(names(t)[0]).toBe('Old classics');
    t.$('.collection[data-id="c1"] .more').click();
    t.button('Move down', t.$('.sheet')).click();
    expect(names(t)).toEqual(['Sci-fi', 'Old classics', 'Cozy']);
    t.$('.collection[data-id="c2"] .more').click();
    t.button('Delete', t.$('.sheet')).click();
    t.$('.confirm-ok').click();
    expect(names(t)).toEqual(['Old classics', 'Cozy']);
  });

  it('will not create a duplicate name', async () => {
    const t = await mount({ data: { collections: cs() } });
    t.tab('collections');
    t.$('button.new-collection').click();
    t.type('.prompt-input', 'classics');
    t.$('.prompt-ok').click();
    expect(names(t)).toEqual(['Classics', 'Sci-fi']);
    expect(t.$('.toast').textContent).toMatch(/already/);
  });
});
